"""Background forecast job — orchestrates the Phase 2 + Phase 3 cores.

Per-SKU loop:
  1. Pull sales rows for the SKU.
  2. Call selector.forecast_sku(...) -> ForecastOutput
  3. Persist forecast_results rows.
  4. Slice the forecast over the lead-time window.
  5. Call reorder.decide_reorder(...) -> ReorderResult
  6. Persist reorder_decisions row.

Per-SKU failures are caught and logged — one bad SKU must NOT fail the
entire job (spec section 5 + the runner contract in section 8).
"""
from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.forecasting import forecast_sku
from app.core.inventory import decide_reorder
from app.db import SessionLocal
from app.models import (
    CurrentInventory,
    ForecastJob,
    ForecastResult,
    ProductMaster,
    ReorderDecision,
    SalesHistory,
)

log = logging.getLogger(__name__)


def new_job_id() -> str:
    return f"job_{uuid.uuid4().hex[:12]}"


def _category_daily_averages(db: Session) -> dict[str, float]:
    """Per-category average daily demand — used for cold-start fallback."""
    sku_totals: dict[str, tuple[int, int]] = {}
    rows = db.execute(
        select(SalesHistory.sku, SalesHistory.date, SalesHistory.quantity)
    ).all()
    # For each SKU: (total_qty, distinct_days). Average daily = total / days.
    qty: dict[str, int] = defaultdict(int)
    days: dict[str, set] = defaultdict(set)
    for sku, d, q in rows:
        qty[sku] += int(q)
        days[sku].add(d)
    for sku in qty:
        sku_totals[sku] = (qty[sku], len(days[sku]) or 1)

    # Map to categories.
    cat_by_sku = {
        sku: cat
        for sku, cat in db.execute(
            select(ProductMaster.sku, ProductMaster.category)
        ).all()
    }
    cat_sums: dict[str, float] = defaultdict(float)
    cat_counts: dict[str, int] = defaultdict(int)
    for sku, (total, d) in sku_totals.items():
        cat = cat_by_sku.get(sku)
        if cat is None:
            continue
        cat_sums[cat] += total / d
        cat_counts[cat] += 1
    return {
        cat: (cat_sums[cat] / cat_counts[cat]) for cat in cat_sums if cat_counts[cat]
    }


def run_forecast_job(
    job_id: str,
    service_level: float = 0.95,
    review_period_days: int = 7,
    sku_filter: list[str] | None = None,
) -> None:
    """Top-level background task. Uses its own DB session — request-scoped
    sessions are not safe to share with a task that outlives the response.
    """
    db = SessionLocal()
    try:
        job = db.get(ForecastJob, job_id)
        if job is None:
            log.error("Forecast job %s not found", job_id)
            return

        # Pull product master + sales + inventory once per job.
        products_query = select(ProductMaster)
        if sku_filter:
            products_query = products_query.where(ProductMaster.sku.in_(sku_filter))
        products = db.scalars(products_query).all()

        if not products:
            job.status = "failed"
            job.message = "No products found — upload product master and sales first."
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
            return

        category_avg = _category_daily_averages(db)

        # Preload sales into a DataFrame per SKU (one query).
        skus = [p.sku for p in products]
        sales_rows = db.execute(
            select(
                SalesHistory.sku,
                SalesHistory.date,
                SalesHistory.quantity,
                SalesHistory.promo_flag,
            ).where(SalesHistory.sku.in_(skus))
        ).all()
        sales_df = pd.DataFrame(
            sales_rows,
            columns=["sku", "date", "quantity", "promo_flag"],
        )

        # Inventory per SKU.
        inv_rows = db.execute(
            select(CurrentInventory.sku, CurrentInventory.on_hand).where(
                CurrentInventory.sku.in_(skus)
            )
        ).all()
        on_hand_by_sku = {sku: int(qty) for sku, qty in inv_rows}

        success_count = 0
        failure_count = 0

        for p in products:
            try:
                sku_sales = sales_df[sales_df["sku"] == p.sku][
                    ["sku", "store_id" if "store_id" in sales_df.columns else "sku",
                     "date", "quantity"]
                ] if False else sales_df[sales_df["sku"] == p.sku][
                    ["date", "quantity"]
                ]
                # ^ keep the columns selector minimal — preprocess only reads date/quantity.

                out = forecast_sku(
                    sku=p.sku,
                    sales=sku_sales,
                    lead_time_days=p.lead_time_days,
                    review_period=review_period_days,
                    category_daily_avg=category_avg.get(p.category),
                )

                # Persist forecast_results (one row per forecast day).
                model_mape = (
                    float(out.model_mape) if out.model_mape == out.model_mape else 0.0
                )  # NaN -> 0 for storage (fallback cases)

                for fp in out.points:
                    db.add(
                        ForecastResult(
                            job_id=job_id,
                            sku=p.sku,
                            forecast_date=fp.forecast_date,
                            yhat=fp.yhat,
                            yhat_lower=fp.yhat_lower,
                            yhat_upper=fp.yhat_upper,
                            chosen_model=out.chosen_model,
                            model_mape=model_mape,
                        )
                    )

                # Reorder decision over the lead-time slice.
                lt = p.lead_time_days
                yhat = [fp.yhat for fp in out.points[:lt]]
                lo = [fp.yhat_lower for fp in out.points[:lt]]
                hi = [fp.yhat_upper for fp in out.points[:lt]]
                current = on_hand_by_sku.get(p.sku, 0)

                dec = decide_reorder(
                    sku=p.sku,
                    yhat_lead_window=yhat,
                    yhat_lower_lead=lo,
                    yhat_upper_lead=hi,
                    lead_time_days=lt,
                    current_stock=current,
                    ordering_cost=p.ordering_cost,
                    holding_cost_per_unit_per_year=p.holding_cost_per_unit,
                    service_level=service_level,
                )
                db.add(
                    ReorderDecision(
                        job_id=job_id,
                        sku=p.sku,
                        avg_daily_demand=dec.avg_daily_demand,
                        demand_std=dec.demand_std,
                        safety_stock=dec.safety_stock,
                        reorder_point=dec.reorder_point,
                        eoq=dec.eoq,
                        current_stock=dec.current_stock,
                        status=dec.status,
                        recommended_order_qty=dec.recommended_order_qty,
                        explanation=dec.explanation,
                    )
                )
                # Commit per-SKU so a later crash doesn't wipe earlier progress.
                db.commit()
                success_count += 1
            except Exception as exc:  # noqa: BLE001 — per-SKU isolation is the contract
                db.rollback()
                failure_count += 1
                log.exception("Forecast failed for SKU %s: %s", p.sku, exc)

        # Finalize job status.
        job = db.get(ForecastJob, job_id)
        job.completed_at = datetime.now(timezone.utc)
        if success_count == 0:
            job.status = "failed"
            job.message = f"All {failure_count} SKUs failed — see server logs."
        else:
            job.status = "complete"
            job.message = (
                f"{success_count} SKU(s) forecasted"
                + (f", {failure_count} failed" if failure_count else "")
                + "."
            )
        db.commit()
    finally:
        db.close()
