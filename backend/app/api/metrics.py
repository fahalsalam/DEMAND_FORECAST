"""Aggregate KPIs for the dashboard header."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    CurrentInventory,
    ForecastJob,
    ForecastResult,
    ProductMaster,
    ReorderDecision,
)
from app.schemas import MetricsSummary, StatusCounts

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/{job_id}", response_model=MetricsSummary)
def job_metrics(job_id: str, db: Session = Depends(get_db)) -> MetricsSummary:
    job = db.get(ForecastJob, job_id)
    if job is None:
        raise HTTPException(404, f"Job {job_id} not found.")

    # avg MAPE — exclude rows where the fallback wrote 0 (they have NaN mape).
    avg_mape_row = db.execute(
        select(func.avg(ForecastResult.model_mape)).where(
            ForecastResult.job_id == job_id,
            ForecastResult.chosen_model.in_(("arima", "prophet", "lightgbm")),
        )
    ).scalar()
    avg_mape = float(avg_mape_row) if avg_mape_row is not None else None

    # Status counts.
    raw_counts = db.execute(
        select(ReorderDecision.status, func.count())
        .where(ReorderDecision.job_id == job_id)
        .group_by(ReorderDecision.status)
    ).all()
    counts_dict = {s: int(c) for s, c in raw_counts}
    counts = StatusCounts(
        HEALTHY=counts_dict.get("HEALTHY", 0),
        REORDER_NOW=counts_dict.get("REORDER_NOW", 0),
        OVERSTOCK=counts_dict.get("OVERSTOCK", 0),
        STOCKOUT_RISK=counts_dict.get("STOCKOUT_RISK", 0),
    )

    # Total SKUs in this job.
    total_skus = db.execute(
        select(func.count()).select_from(ReorderDecision).where(
            ReorderDecision.job_id == job_id
        )
    ).scalar() or 0

    # Total inventory value: on_hand * unit_cost across the catalogue.
    inv_value = db.execute(
        select(func.coalesce(func.sum(CurrentInventory.on_hand * ProductMaster.unit_cost), 0.0))
        .select_from(CurrentInventory)
        .join(ProductMaster, ProductMaster.sku == CurrentInventory.sku)
    ).scalar() or 0.0

    # Recommended order value for at-risk SKUs.
    rec_value = db.execute(
        select(
            func.coalesce(
                func.sum(ReorderDecision.recommended_order_qty * ProductMaster.unit_cost),
                0.0,
            )
        )
        .select_from(ReorderDecision)
        .join(ProductMaster, ProductMaster.sku == ReorderDecision.sku)
        .where(ReorderDecision.job_id == job_id)
    ).scalar() or 0.0

    # Model usage distribution.
    model_rows = db.execute(
        select(ForecastResult.chosen_model, func.count(func.distinct(ForecastResult.sku)))
        .where(ForecastResult.job_id == job_id)
        .group_by(ForecastResult.chosen_model)
    ).all()
    model_usage = {m: int(c) for m, c in model_rows}

    return MetricsSummary(
        job_id=job_id,
        total_skus=int(total_skus),
        avg_mape=avg_mape,
        at_risk_count=counts.REORDER_NOW + counts.STOCKOUT_RISK,
        total_inventory_value=float(inv_value),
        total_recommended_order_value=float(rec_value),
        status_counts=counts,
        model_usage=model_usage,
    )
