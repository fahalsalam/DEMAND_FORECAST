"""Synthetic dataset generator — makes the app demo-ready out of the box.

Produces:
  * 30 SKUs across 5 categories with varied lead times / costs.
  * ~2 years of daily sales per SKU with weekly seasonality + seasonal/promo spikes.
  * Current inventory levels chosen so the demo will show all four statuses
    (HEALTHY, REORDER_NOW, OVERSTOCK, STOCKOUT_RISK) once Phase 4 runs.
  * 3 "new" SKUs with < 60 days of history to exercise the cold-start path.

Run:
    python seed.py            # fresh seed (drops + recreates tables)
    python seed.py --keep     # preserve existing tables; just add rows
"""
from __future__ import annotations

import argparse
import math
import random
from datetime import date, datetime, timedelta, timezone

import numpy as np

from app.db import Base, SessionLocal, engine, init_db
from app.models import CurrentInventory, ProductMaster, SalesHistory

RNG = random.Random(42)
NP_RNG = np.random.default_rng(42)

STORE_ID = "STORE_001"
TODAY = date.today()

CATEGORIES = {
    "Beverages":  {"base": 35, "season_amp": 0.4, "lt": (3, 6),  "cost": (1.2, 4.0)},
    "Snacks":     {"base": 28, "season_amp": 0.2, "lt": (4, 8),  "cost": (1.0, 3.5)},
    "Dairy":      {"base": 22, "season_amp": 0.1, "lt": (2, 4),  "cost": (2.0, 6.0)},
    "Household":  {"base": 12, "season_amp": 0.1, "lt": (7, 14), "cost": (4.0, 15.0)},
    "Stationery": {"base": 8,  "season_amp": 0.3, "lt": (10, 18), "cost": (1.5, 12.0)},
}


def _gen_products() -> list[dict]:
    products: list[dict] = []
    idx = 1
    # 27 normal SKUs (5 or 6 per category) + 3 cold-start SKUs added below.
    per_cat = {"Beverages": 6, "Snacks": 6, "Dairy": 5, "Household": 5, "Stationery": 5}
    for cat, count in per_cat.items():
        cfg = CATEGORIES[cat]
        for i in range(count):
            sku = f"SKU-{idx:03d}"
            unit_cost = round(RNG.uniform(*cfg["cost"]), 2)
            products.append(
                {
                    "sku": sku,
                    "name": f"{cat[:-1] if cat.endswith('s') else cat} Item {i + 1}",
                    "category": cat,
                    "unit_cost": unit_cost,
                    "lead_time_days": RNG.randint(*cfg["lt"]),
                    "ordering_cost": round(RNG.uniform(25, 75), 2),
                    "holding_cost_per_unit": round(unit_cost * RNG.uniform(0.15, 0.35), 2),
                    "supplier": f"Supplier-{RNG.randint(1, 4):02d}",
                }
            )
            idx += 1
    # Cold-start SKUs — these will get < 60 days history.
    for i in range(3):
        sku = f"SKU-NEW-{i + 1:02d}"
        products.append(
            {
                "sku": sku,
                "name": f"New Arrival {i + 1}",
                "category": RNG.choice(list(CATEGORIES.keys())),
                "unit_cost": round(RNG.uniform(2.0, 8.0), 2),
                "lead_time_days": RNG.randint(5, 10),
                "ordering_cost": round(RNG.uniform(30, 60), 2),
                "holding_cost_per_unit": round(RNG.uniform(0.5, 1.5), 2),
                "supplier": "Supplier-01",
            }
        )
    return products


def _gen_sales(sku: str, category: str, history_days: int) -> list[dict]:
    """Synthesize daily sales with weekly seasonality + sparse promo/seasonal spikes."""
    cfg = CATEGORIES[category]
    base = cfg["base"] * RNG.uniform(0.6, 1.4)
    season_amp = cfg["season_amp"]

    rows: list[dict] = []
    start = TODAY - timedelta(days=history_days)
    for n in range(history_days):
        d = start + timedelta(days=n)
        # weekly seasonality — weekends ~30% higher
        dow = d.weekday()
        dow_mult = 1.3 if dow >= 5 else 1.0
        # annual seasonality (sinusoid)
        annual = 1.0 + season_amp * math.sin(2 * math.pi * d.timetuple().tm_yday / 365)
        mean = base * dow_mult * annual
        qty = max(0, int(NP_RNG.poisson(mean)))

        # promo spike ~ once every 60 days
        promo = RNG.random() < (1 / 60)
        if promo:
            qty = int(qty * RNG.uniform(1.8, 2.6))

        rows.append(
            {
                "sku": sku,
                "store_id": STORE_ID,
                "date": d,
                "quantity": qty,
                "price": None,
                "promo_flag": promo,
            }
        )
    return rows


def _gen_inventory(products: list[dict], sales_by_sku: dict[str, list[dict]]) -> list[dict]:
    """Pick on-hand levels to surface all four reorder statuses in the demo."""
    inv: list[dict] = []
    now = datetime.now(timezone.utc)
    # Spread the SKUs across the four buckets we want to demo.
    buckets = ["healthy", "reorder", "stockout", "overstock"]
    for i, p in enumerate(products):
        recent_30 = [r["quantity"] for r in sales_by_sku.get(p["sku"], [])[-30:]]
        avg_daily = (sum(recent_30) / len(recent_30)) if recent_30 else 5
        lt = p["lead_time_days"]
        bucket = buckets[i % len(buckets)] if not p["sku"].startswith("SKU-NEW") else "healthy"

        if bucket == "stockout":
            on_hand = max(0, int(avg_daily * lt * 0.4))      # below lead-time demand
        elif bucket == "reorder":
            on_hand = int(avg_daily * lt * 1.3)              # below ROP, above stockout
        elif bucket == "overstock":
            on_hand = int(max(avg_daily, 1) * lt * 8)        # way above EOQ + ROP
        else:  # healthy
            on_hand = int(max(avg_daily, 1) * lt * 3)

        inv.append(
            {
                "sku": p["sku"],
                "store_id": STORE_ID,
                "on_hand": on_hand,
                "updated_at": now,
            }
        )
    return inv


def seed(*, fresh: bool) -> dict[str, int]:
    if fresh:
        Base.metadata.drop_all(bind=engine)
    init_db()

    products = _gen_products()
    sales_by_sku: dict[str, list[dict]] = {}
    for p in products:
        if p["sku"].startswith("SKU-NEW"):
            history_days = RNG.randint(15, 50)          # cold-start: < 60 days
        else:
            history_days = 730                          # ~2 years
        sales_by_sku[p["sku"]] = _gen_sales(p["sku"], p["category"], history_days)

    inventory = _gen_inventory(products, sales_by_sku)

    sales_rows = [r for rows in sales_by_sku.values() for r in rows]

    with SessionLocal() as db:
        db.bulk_insert_mappings(ProductMaster, products)
        db.bulk_insert_mappings(SalesHistory, sales_rows)
        db.bulk_insert_mappings(CurrentInventory, inventory)
        db.commit()

    return {
        "products": len(products),
        "sales_rows": len(sales_rows),
        "inventory_rows": len(inventory),
        "cold_start_skus": sum(1 for p in products if p["sku"].startswith("SKU-NEW")),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Skip the drop/recreate; just append seed rows.",
    )
    args = parser.parse_args()

    summary = seed(fresh=not args.keep)
    print("Seed complete:")
    for k, v in summary.items():
        print(f"  {k:>18}: {v}")
