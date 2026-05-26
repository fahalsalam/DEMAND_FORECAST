"""Integration tests for Phase 4: end-to-end forecast job + all read endpoints.

Strategy: seed a TINY in-memory DB with 3 SKUs of plausible sales, kick off
`/forecast/run`, wait for the background task to finish, then exercise every
read endpoint. Keeps the per-test cost under ~30s.
"""
from __future__ import annotations

import time
from datetime import date, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import CurrentInventory, ProductMaster, SalesHistory


def _seed(db) -> None:
    products = [
        dict(sku="A1", name="Cola", category="Beverages", unit_cost=1.5,
             lead_time_days=4, ordering_cost=40, holding_cost_per_unit=0.4),
        dict(sku="B1", name="Chips", category="Snacks", unit_cost=2.0,
             lead_time_days=5, ordering_cost=35, holding_cost_per_unit=0.5),
        # Cold-start: <60 days history.
        dict(sku="NEW1", name="Fresh Item", category="Beverages", unit_cost=3.0,
             lead_time_days=3, ordering_cost=30, holding_cost_per_unit=0.6),
    ]
    db.bulk_insert_mappings(ProductMaster, products)

    rng = np.random.default_rng(42)
    start = date(2024, 1, 1)
    sales: list[dict] = []

    # A1: 250 days of cleanly seasonal sales.
    for i in range(250):
        d = start + timedelta(days=i)
        base = 20 + (8 if d.weekday() >= 5 else 0)
        qty = max(0, int(base + rng.normal(0, 2)))
        sales.append(dict(sku="A1", store_id="S1", date=d, quantity=qty, promo_flag=False))

    # B1: 250 days with a mild trend.
    for i in range(250):
        d = start + timedelta(days=i)
        qty = max(0, int(15 + i * 0.02 + rng.normal(0, 2)))
        sales.append(dict(sku="B1", store_id="S1", date=d, quantity=qty, promo_flag=False))

    # NEW1: only 20 days -> cold start.
    for i in range(20):
        d = start + timedelta(days=i)
        sales.append(dict(sku="NEW1", store_id="S1", date=d,
                          quantity=int(8 + rng.integers(-2, 3)), promo_flag=False))

    db.bulk_insert_mappings(SalesHistory, sales)

    inv = [
        # A1 deliberately low -> REORDER_NOW / STOCKOUT_RISK
        dict(sku="A1", store_id="S1", on_hand=30),
        # B1 plenty
        dict(sku="B1", store_id="S1", on_hand=400),
        # NEW1 something
        dict(sku="NEW1", store_id="S1", on_hand=10),
    ]
    db.bulk_insert_mappings(CurrentInventory, inv)
    db.commit()


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    # The background runner calls SessionLocal() directly — repoint it at our test engine.
    import app.jobs.forecast_runner as runner_mod
    original = runner_mod.SessionLocal
    runner_mod.SessionLocal = TestingSession

    app.dependency_overrides[get_db] = override
    try:
        with TestingSession() as db:
            _seed(db)
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        runner_mod.SessionLocal = original
        Base.metadata.drop_all(bind=engine)


def test_full_forecast_lifecycle(client):
    # 1. Start the job — returns IMMEDIATELY with a job_id.
    r = client.post("/forecast/run", json={"service_level": 0.95, "review_period_days": 7})
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    assert job_id.startswith("job_")

    # 2. Poll until complete (TestClient runs BackgroundTasks synchronously after the
    #    response, so the first /status call will already see 'complete').
    status = client.get(f"/forecast/status/{job_id}").json()
    assert status["status"] in {"complete", "failed", "running"}
    # In case of long runs, poll defensively.
    for _ in range(120):
        s = client.get(f"/forecast/status/{job_id}").json()
        if s["status"] in {"complete", "failed"}:
            status = s
            break
        time.sleep(1)
    assert status["status"] == "complete", f"job failed: {status.get('message')}"

    # 3. Forecast for A1.
    fc = client.get(f"/forecast/A1?job_id={job_id}").json()
    assert fc["sku"] == "A1"
    assert fc["chosen_model"] in {"arima", "prophet", "lightgbm"}
    assert len(fc["forecast"]) >= 11           # lead_time(4) + review(7)
    for pt in fc["forecast"]:
        assert pt["yhat_lower"] <= pt["yhat"] <= pt["yhat_upper"]
    assert len(fc["historical"]) == 250

    # 4. Cold-start SKU lands on fallback.
    fc_new = client.get(f"/forecast/NEW1?job_id={job_id}").json()
    assert fc_new["chosen_model"] == "fallback_category_avg"

    # 5. Alerts default to at-risk only.
    alerts = client.get(f"/reorder/alerts?job_id={job_id}").json()
    assert all(a["status"] in {"REORDER_NOW", "STOCKOUT_RISK"} for a in alerts)
    # A1 was seeded under-stocked -> must be in the alert list.
    assert any(a["sku"] == "A1" for a in alerts)

    # ALL filter returns every decision.
    all_alerts = client.get(f"/reorder/alerts?job_id={job_id}&status=ALL").json()
    assert len(all_alerts) == 3

    # 6. Metrics aggregate cleanly.
    m = client.get(f"/metrics/{job_id}").json()
    assert m["total_skus"] == 3
    assert m["at_risk_count"] >= 1
    sc = m["status_counts"]
    assert sc["HEALTHY"] + sc["REORDER_NOW"] + sc["OVERSTOCK"] + sc["STOCKOUT_RISK"] == 3
    assert m["total_inventory_value"] > 0
    assert "model_usage" in m


def test_run_endpoint_returns_immediately(client, monkeypatch):
    """Spec rule: /forecast/run must not block.

    TestClient runs BackgroundTasks synchronously after sending the response,
    so we stub the runner to keep this test bounded by *just* the endpoint
    handler time — what production users actually experience.
    """
    import app.api.forecast as fc_mod

    monkeypatch.setattr(fc_mod, "run_forecast_job", lambda **_kw: None)

    start = time.perf_counter()
    r = client.post("/forecast/run", json={"service_level": 0.9})
    elapsed = time.perf_counter() - start
    assert r.status_code == 200
    assert "job_id" in r.json()
    assert elapsed < 0.5, f"/forecast/run took {elapsed:.2f}s (should be near-instant)"


def test_backtest_endpoint(client):
    # Run a job first so the SKU table is populated.
    client.post("/forecast/run", json={"service_level": 0.95}).json()
    # Wait for completion (TestClient runs background sync).
    r = client.get("/backtest/A1?holdout_days=30").json()
    assert r["sku"] == "A1"
    assert r["horizon_days"] == 30
    for p in (r["baseline"], r["system"]):
        assert 0 <= p["service_rate"] <= 1
        assert p["units_demanded"] == r["baseline"]["units_demanded"]  # same demand stream
    assert "stockout days" in r["summary"]


def test_status_404_for_unknown_job(client):
    assert client.get("/forecast/status/nope").status_code == 404


def test_forecast_404_for_unknown_sku(client):
    job_id = client.post("/forecast/run", json={}).json()["job_id"]
    # Wait for completion.
    for _ in range(120):
        s = client.get(f"/forecast/status/{job_id}").json()
        if s["status"] in {"complete", "failed"}:
            break
        time.sleep(1)
    assert client.get(f"/forecast/ZZZ?job_id={job_id}").status_code == 404
