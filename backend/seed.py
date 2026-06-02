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


# ---------------------------------------------------------------------------
# SEASONAL_DEMO — extreme-seasonality SKUs for the viva
#
# Each entry has a `pattern` key that picks the demand-shape function below.
# These get long histories (2 yrs) so the contest's 28-day validation window
# always has plenty of training data.
# ---------------------------------------------------------------------------
SEASONAL_DEMO: list[dict] = [
    {
        # Massive summer peak (~July), almost dead in winter — classic
        # cold-drink pattern. Prophet's yearly_seasonality will nail this.
        "sku": "SEASONAL-SUMMER-DRINK",
        "name": "Iced Lemonade 500ml",
        "category": "Beverages",
        "unit_cost": 1.80, "lead_time_days": 5,
        "ordering_cost": 45, "holding_cost_per_unit": 0.40,
        "supplier": "Demo Beverages Co.",
        "pattern": "summer_peak",
        "base_daily": 22,
    },
    {
        # 2.5× weekend lift, weekday lull. Strongest weekly seasonality.
        # Best demo of weekly cycles in the Forecasts chart.
        "sku": "SEASONAL-WEEKEND-PIZZA",
        "name": "Frozen Pizza 12in",
        "category": "Snacks",
        "unit_cost": 4.50, "lead_time_days": 4,
        "ordering_cost": 35, "holding_cost_per_unit": 0.60,
        "supplier": "Demo Frozen Foods",
        "pattern": "weekend_blast",
        "base_daily": 18,
    },
    {
        # Sharp Gaussian peak around mid-December. Dead the rest of the year.
        # Holiday/festive-season pattern.
        "sku": "SEASONAL-XMAS-LIGHTS",
        "name": "LED Holiday String Lights",
        "category": "Household",
        "unit_cost": 8.20, "lead_time_days": 14,
        "ordering_cost": 55, "holding_cost_per_unit": 0.90,
        "supplier": "Demo Holiday Goods",
        "pattern": "xmas_spike",
        "base_daily": 4,
    },
    {
        # Reverse weekly: Mon-Fri high (office consumption), weekends low.
        # Shows the contest correctly identifies a non-obvious weekly pattern.
        "sku": "SEASONAL-OFFICE-COFFEE",
        "name": "Coffee Pods 60ct",
        "category": "Beverages",
        "unit_cost": 12.00, "lead_time_days": 7,
        "ordering_cost": 40, "holding_cost_per_unit": 1.20,
        "supplier": "Demo Coffee Co.",
        "pattern": "weekday_office",
        "base_daily": 24,
    },
]


def _seasonal_demand(pattern: str, d: date, base: float) -> float:
    """Per-day expected demand shape for the SEASONAL_DEMO SKUs.

    Returns the *mean* — Poisson noise is added by the caller so the series
    looks realistic. Each pattern is exaggerated enough to be visible at a
    glance in the forecast chart.
    """
    yday = d.timetuple().tm_yday
    dow = d.weekday()

    if pattern == "summer_peak":
        # sin peaks at yday=80; shift so peak is around July 1 (yday ~182).
        # Amplitude 0.90 → demand swings between 10% and 190% of base.
        annual = 1.0 + 0.90 * math.sin(2 * math.pi * (yday - 80) / 365)
        weekly = 1.15 if dow >= 5 else 1.0
        return base * max(0.05, annual) * weekly

    if pattern == "weekend_blast":
        # Workdays ~0.9×, Sat 2.5×, Sun 2.2×.
        if dow == 5:
            return base * 2.5
        if dow == 6:
            return base * 2.2
        return base * 0.9

    if pattern == "xmas_spike":
        # Gaussian bump centred on Dec 15 (yday ~349), σ=20 days.
        # Peak demand = 9× base at the very centre.
        peak_yday = 349
        gauss = math.exp(-((yday - peak_yday) ** 2) / (2 * 20 ** 2))
        return base * (1.0 + 8.0 * gauss)

    if pattern == "weekday_office":
        # Mon-Fri: 1.3× (busy office), Sat-Sun: 0.3× (office closed).
        return base * (1.3 if dow < 5 else 0.3)

    # Unknown pattern → flat baseline.
    return base


def _is_seasonal_demo(sku: str) -> bool:
    return sku.startswith("SEASONAL-")


_SEASONAL_BY_SKU = {p["sku"]: p for p in SEASONAL_DEMO}


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
    # Highly-seasonal demo SKUs (for the viva).
    for p in SEASONAL_DEMO:
        products.append({k: v for k, v in p.items() if k not in ("pattern", "base_daily")})
    return products


def _gen_sales(sku: str, category: str, history_days: int) -> list[dict]:
    """Synthesize daily sales with weekly seasonality + sparse promo/seasonal spikes.

    Seasonal demo SKUs (SEASONAL-*) get their own demand-shape function so the
    pattern is visible in the forecast chart.
    """
    is_seasonal = _is_seasonal_demo(sku)
    if is_seasonal:
        spec = _SEASONAL_BY_SKU[sku]
        base = float(spec["base_daily"])
        pattern = spec["pattern"]
        season_amp = 0.0          # unused, but keep symmetry
    else:
        cfg = CATEGORIES[category]
        base = cfg["base"] * RNG.uniform(0.6, 1.4)
        season_amp = cfg["season_amp"]

    rows: list[dict] = []
    start = TODAY - timedelta(days=history_days)
    for n in range(history_days):
        d = start + timedelta(days=n)
        if is_seasonal:
            mean = _seasonal_demand(pattern, d, base)
        else:
            # weekly seasonality — weekends ~30% higher
            dow = d.weekday()
            dow_mult = 1.3 if dow >= 5 else 1.0
            # annual seasonality (sinusoid)
            annual = 1.0 + season_amp * math.sin(2 * math.pi * d.timetuple().tm_yday / 365)
            mean = base * dow_mult * annual
        qty = max(0, int(NP_RNG.poisson(max(0.01, mean))))

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
