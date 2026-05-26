"""Sample CSV template downloads + dataset summary + reset.

Lets the user upload their OWN data: download the template, fill it with
their products/sales/inventory, upload it back via the existing
/data/upload/* endpoints.
"""
from __future__ import annotations

import math
import random
from datetime import date, timedelta
from io import StringIO

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import Base, SessionLocal, engine, get_db, init_db
from app.models import (
    CurrentInventory,
    ForecastJob,
    ForecastResult,
    ProductMaster,
    ReorderDecision,
    SalesHistory,
)

router = APIRouter(prefix="/data", tags=["data"])

DEMO_SKUS = [
    {
        "sku": "DEMO-COKE",  "name": "Demo Cola 355ml",     "category": "Beverages",
        "unit_cost": 1.20, "lead_time_days": 5,  "ordering_cost": 40, "holding_cost": 0.30,
        "supplier": "DemoSupply", "base_daily": 28, "weekend_lift": 12,
    },
    {
        "sku": "DEMO-CHIPS", "name": "Demo Chips 200g",     "category": "Snacks",
        "unit_cost": 2.10, "lead_time_days": 7,  "ordering_cost": 35, "holding_cost": 0.42,
        "supplier": "DemoSupply", "base_daily": 18, "weekend_lift": 7,
    },
    {
        "sku": "DEMO-MILK",  "name": "Demo Whole Milk 1L",  "category": "Dairy",
        "unit_cost": 2.80, "lead_time_days": 3,  "ordering_cost": 30, "holding_cost": 0.55,
        "supplier": "DemoSupply", "base_daily": 22, "weekend_lift": 4,
    },
    {
        "sku": "DEMO-SOAP",  "name": "Demo Bath Soap Bar",  "category": "Household",
        "unit_cost": 3.50, "lead_time_days": 10, "ordering_cost": 50, "holding_cost": 0.70,
        "supplier": "DemoSupply", "base_daily": 9,  "weekend_lift": 2,
    },
    {
        "sku": "DEMO-NOTE",  "name": "Demo Notebook A5",    "category": "Stationery",
        "unit_cost": 4.20, "lead_time_days": 14, "ordering_cost": 55, "holding_cost": 0.85,
        "supplier": "DemoSupply", "base_daily": 6,  "weekend_lift": 3,
    },
]


def _csv_response(text: str, filename: str) -> Response:
    return Response(
        content=text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------- /data/templates/products ---------------------------------------
@router.get("/templates/products")
def template_products() -> Response:
    """5 demo products spanning 5 categories with varied lead times + costs."""
    buf = StringIO()
    buf.write(
        "sku,name,category,unit_cost,lead_time_days,ordering_cost,"
        "holding_cost_per_unit,supplier\n"
    )
    for p in DEMO_SKUS:
        buf.write(
            f'{p["sku"]},{p["name"]},{p["category"]},{p["unit_cost"]:.2f},'
            f'{p["lead_time_days"]},{p["ordering_cost"]:.2f},'
            f'{p["holding_cost"]:.2f},{p["supplier"]}\n'
        )
    return _csv_response(buf.getvalue(), "sample-products.csv")


# ---------- /data/templates/inventory --------------------------------------
@router.get("/templates/inventory")
def template_inventory() -> Response:
    """Current stock levels, deliberately spread to surface all 4 statuses."""
    buf = StringIO()
    buf.write("sku,store_id,on_hand\n")
    # COKE low -> STOCKOUT_RISK after forecast; CHIPS comfy; MILK -> REORDER_NOW;
    # SOAP overstocked; NOTE healthy.
    stocks = {"DEMO-COKE": 30, "DEMO-CHIPS": 180, "DEMO-MILK": 50,
              "DEMO-SOAP": 600, "DEMO-NOTE": 100}
    for p in DEMO_SKUS:
        buf.write(f'{p["sku"]},STORE_001,{stocks[p["sku"]]}\n')
    return _csv_response(buf.getvalue(), "sample-inventory.csv")


# ---------- /data/templates/sales ------------------------------------------
@router.get("/templates/sales")
def template_sales() -> Response:
    """~180 days of synthetic daily sales per SKU with weekly + annual
    seasonality and occasional promo spikes — enough history for the
    3-model contest to run (not a cold-start)."""
    rng = random.Random(7)
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=179)

    buf = StringIO()
    buf.write("sku,store_id,date,quantity,price,promo_flag\n")
    for p in DEMO_SKUS:
        for i in range(180):
            d = start + timedelta(days=i)
            dow_lift = p["weekend_lift"] if d.weekday() >= 5 else 0
            annual = 1.0 + 0.20 * math.sin(2 * math.pi * d.timetuple().tm_yday / 365)
            mean = (p["base_daily"] + dow_lift) * annual
            qty = max(0, int(round(rng.gauss(mean, max(1.0, mean * 0.10)))))
            promo = rng.random() < (1 / 50)
            if promo:
                qty = int(qty * rng.uniform(1.6, 2.4))
            price = round(p["unit_cost"] * rng.uniform(1.5, 2.0), 2)
            buf.write(
                f'{p["sku"]},STORE_001,{d.isoformat()},{qty},{price},'
                f'{"true" if promo else "false"}\n'
            )
    return _csv_response(buf.getvalue(), "sample-sales.csv")


# ---------- /data/summary --------------------------------------------------
@router.get("/summary")
def data_summary(db: Session = Depends(get_db)) -> dict:
    """Row counts so the UI can show 'you have N products, M sales rows...'."""
    n_products = db.execute(select(func.count()).select_from(ProductMaster)).scalar() or 0
    n_inventory = db.execute(select(func.count()).select_from(CurrentInventory)).scalar() or 0
    n_sales = db.execute(select(func.count()).select_from(SalesHistory)).scalar() or 0
    n_jobs = db.execute(select(func.count()).select_from(ForecastJob)).scalar() or 0
    return {
        "products": int(n_products),
        "inventory_rows": int(n_inventory),
        "sales_rows": int(n_sales),
        "forecast_jobs": int(n_jobs),
        "ready_to_forecast": n_products > 0 and n_sales > 0,
    }


# ---------- /data/reset ----------------------------------------------------
@router.post("/reset")
def reset_database() -> dict:
    """Wipe ALL data (products, sales, inventory, jobs, results) and rebuild
    empty tables. Used by the UI's 'Start over' button.
    """
    # Drop reorder_decisions / forecast_results first via cascading FK on job_id,
    # but to be safe truncate everything via drop_all/create_all.
    Base.metadata.drop_all(bind=engine)
    init_db()
    # Touch one tiny query so the import isn't flagged unused under linters.
    _ = (ForecastResult, ReorderDecision)
    return {"status": "reset", "message": "All tables dropped and recreated."}
