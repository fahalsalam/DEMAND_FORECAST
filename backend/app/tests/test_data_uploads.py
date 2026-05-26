"""Validation tests for the Phase 1 CSV upload endpoints.

Uses an in-memory SQLite DB so the tests are isolated and fast — no .db file
touched, no risk of corrupting the dev database.
"""
from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


@pytest.fixture()
def client():
    # StaticPool keeps a single shared connection so the in-memory DB persists
    # across requests; otherwise each pool connection gets its own empty DB.
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def _csv(text: str) -> tuple[str, io.BytesIO, str]:
    return ("file.csv", io.BytesIO(text.encode()), "text/csv")


def _upload_products(client, body: str):
    return client.post("/data/upload/products", files={"file": _csv(body)})


def _upload_inventory(client, body: str):
    return client.post("/data/upload/inventory", files={"file": _csv(body)})


def _upload_sales(client, body: str):
    return client.post("/data/upload/sales", files={"file": _csv(body)})


# ---------- happy path ------------------------------------------------------
def test_full_pipeline_round_trip(client):
    products_csv = (
        "sku,name,category,unit_cost,lead_time_days,ordering_cost,holding_cost_per_unit,supplier\n"
        "A1,Cola,Beverages,1.5,5,40,0.4,Acme\n"
        "B1,Chips,Snacks,2.0,7,35,0.5,\n"
    )
    inv_csv = "sku,store_id,on_hand\nA1,S1,100\nB1,S1,40\n"
    sales_csv = (
        "sku,store_id,date,quantity,price,promo_flag\n"
        "A1,S1,2024-01-01,10,1.5,false\n"
        "A1,S1,2024-01-02,12,1.5,true\n"
        "B1,S1,2024-01-01,3,2.0,false\n"
    )

    assert _upload_products(client, products_csv).status_code == 200
    assert _upload_inventory(client, inv_csv).status_code == 200
    r = _upload_sales(client, sales_csv)
    assert r.status_code == 200
    assert r.json() == {
        "kind": "sales",
        "rows_received": 3,
        "rows_written": 3,
        "rows_skipped": 0,
        "warnings": [],
    }

    skus = client.get("/data/skus").json()
    assert {s["sku"] for s in skus} == {"A1", "B1"}
    a1 = next(s for s in skus if s["sku"] == "A1")
    assert a1["on_hand"] == 100
    assert a1["sales_days_available"] == 2
    assert a1["cold_start"] is True  # 2 < 60 → cold start flag


# ---------- missing columns -------------------------------------------------
def test_missing_required_column_is_400(client):
    r = _upload_sales(client, "sku,store_id,quantity\nA1,S1,5\n")
    assert r.status_code == 400
    body = r.json()["detail"]
    assert "date" in body["missing_columns"]


# ---------- negative quantity -----------------------------------------------
def test_negative_quantity_rejects_entire_file(client):
    _upload_products(
        client,
        "sku,name,category,unit_cost,lead_time_days,ordering_cost,holding_cost_per_unit\n"
        "A1,Cola,Beverages,1,5,40,0.4\n",
    )
    body = (
        "sku,store_id,date,quantity\n"
        "A1,S1,2024-01-01,5\n"
        "A1,S1,2024-01-02,-3\n"
    )
    r = _upload_sales(client, body)
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert detail["invalid_rows"][0]["reason"] == "Negative quantity"
    # Nothing should be written when validation fails.
    assert client.get("/data/skus").json()[0]["sales_days_available"] == 0


# ---------- unparseable date ------------------------------------------------
def test_unparseable_date_is_400(client):
    _upload_products(
        client,
        "sku,name,category,unit_cost,lead_time_days,ordering_cost,holding_cost_per_unit\n"
        "A1,Cola,Beverages,1,5,40,0.4\n",
    )
    body = "sku,store_id,date,quantity\nA1,S1,not-a-date,5\n"
    r = _upload_sales(client, body)
    assert r.status_code == 400
    assert r.json()["detail"]["invalid_rows"][0]["reason"] == "Unparseable date"


# ---------- product upsert --------------------------------------------------
def test_product_upload_is_upsert(client):
    csv1 = (
        "sku,name,category,unit_cost,lead_time_days,ordering_cost,holding_cost_per_unit\n"
        "A1,Cola,Beverages,1.0,5,40,0.4\n"
    )
    csv2 = (
        "sku,name,category,unit_cost,lead_time_days,ordering_cost,holding_cost_per_unit\n"
        "A1,Cola Zero,Beverages,1.2,6,42,0.5\n"
    )
    assert _upload_products(client, csv1).status_code == 200
    assert _upload_products(client, csv2).status_code == 200
    skus = client.get("/data/skus").json()
    assert len(skus) == 1
    assert skus[0]["name"] == "Cola Zero"
    assert skus[0]["lead_time_days"] == 6
