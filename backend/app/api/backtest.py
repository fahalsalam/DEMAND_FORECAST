"""Backtest endpoint — baseline vs system policy on a SKU's recent history.

Approach (kept self-contained so it's runnable without a prior forecast job):
  - Take the SKU's last `holdout_days` of sales as the demand stream.
  - Use the *prior* window's mean & std for the system policy's ROP/EOQ —
    this mimics what the system would have known at the start of the holdout.
  - The baseline is the naive "reorder a fixed qty when stock dips low" rule.
"""
from __future__ import annotations

import math

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from scipy.stats import norm
from sqlalchemy import asc, select
from sqlalchemy.orm import Session

from app.core.inventory import BaselinePolicy, SystemPolicy, run_backtest
from app.db import get_db
from app.models import CurrentInventory, ProductMaster, SalesHistory
from app.schemas import BacktestResult, PolicyMetricsOut

router = APIRouter(prefix="/backtest", tags=["backtest"])


def _to_policy_out(m) -> PolicyMetricsOut:
    return PolicyMetricsOut(
        name=m.name,
        stockout_days=m.stockout_days,
        units_lost=m.units_lost,
        units_demanded=m.units_demanded,
        service_rate=m.service_rate,
        avg_inventory=m.avg_inventory,
        total_holding_cost=m.total_holding_cost,
        overstock_unit_days=m.overstock_unit_days,
        orders_placed=m.orders_placed,
    )


@router.get("/{sku}", response_model=BacktestResult)
def backtest_sku(
    sku: str,
    holdout_days: int = Query(60, ge=14, le=365),
    service_level: float = Query(0.95, ge=0.5, le=0.999),
    db: Session = Depends(get_db),
) -> BacktestResult:
    product = db.get(ProductMaster, sku)
    if product is None:
        raise HTTPException(404, f"SKU {sku} not found.")

    sales = db.execute(
        select(SalesHistory.date, SalesHistory.quantity)
        .where(SalesHistory.sku == sku)
        .order_by(asc(SalesHistory.date))
    ).all()
    if len(sales) < holdout_days + 14:
        raise HTTPException(
            400,
            f"SKU {sku} has only {len(sales)} sales days — need at least "
            f"{holdout_days + 14} to backtest (holdout + 14d prior window for stats).",
        )

    quantities = np.array([int(q) for _, q in sales], dtype="int64")
    holdout = quantities[-holdout_days:]
    prior = quantities[:-holdout_days]
    # Use the last 90 days (or all available) of the prior window for demand stats.
    stats_window = prior[-min(90, len(prior)):]

    avg_daily = float(stats_window.mean())
    sigma = float(stats_window.std(ddof=1)) if len(stats_window) > 1 else 0.0

    z = float(norm.ppf(service_level))
    lt = int(product.lead_time_days)
    safety = z * sigma * math.sqrt(lt)
    rop = avg_daily * lt + safety
    annual_demand = avg_daily * 365
    eoq = (
        math.sqrt(2 * annual_demand * product.ordering_cost / product.holding_cost_per_unit)
        if product.holding_cost_per_unit > 0
        else 0.0
    )

    # Baseline: naive retailer ordering at a tight low threshold with a fixed qty.
    baseline_threshold = max(1.0, avg_daily * 2)        # ~2 days of cover
    baseline_qty = max(1.0, avg_daily * lt)             # one lead-time worth
    baseline = BaselinePolicy(low_threshold=baseline_threshold, order_qty=baseline_qty)
    system = SystemPolicy(
        reorder_point=rop,
        order_qty=eoq,
        overstock_threshold=rop + eoq * 1.5,
    )

    inv = db.get(CurrentInventory, sku)
    initial_stock = int(inv.on_hand) if inv else int(avg_daily * lt * 2)

    result = run_backtest(
        sku=sku,
        demand=holdout.tolist(),
        initial_stock=initial_stock,
        lead_time_days=lt,
        holding_cost_per_unit_per_year=product.holding_cost_per_unit,
        baseline=baseline,
        system=system,
    )
    return BacktestResult(
        sku=result.sku,
        horizon_days=result.horizon_days,
        baseline=_to_policy_out(result.baseline),
        system=_to_policy_out(result.system),
        stockout_days_reduction=result.stockout_days_reduction,
        avg_inventory_reduction=result.avg_inventory_reduction,
        holding_cost_savings=result.holding_cost_savings,
        summary=result.summary,
    )
