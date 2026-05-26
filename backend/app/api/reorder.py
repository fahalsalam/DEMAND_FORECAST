"""Reorder alerts — what to order, why, and how much it'll cost."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ProductMaster, ReorderDecision
from app.schemas import ReorderDecisionOut

router = APIRouter(prefix="/reorder", tags=["reorder"])

# Statuses considered "at risk" for the dashboard's default alerts filter.
DEFAULT_STATUSES = ["REORDER_NOW", "STOCKOUT_RISK"]


@router.get("/alerts", response_model=list[ReorderDecisionOut])
def list_alerts(
    job_id: str,
    status: list[str] | None = Query(None),
    db: Session = Depends(get_db),
) -> list[ReorderDecisionOut]:
    """All reorder decisions for a job, joined with the product master so the
    response includes name, category, unit cost, and estimated order cost.

    If `status` is omitted we return the two at-risk buckets (REORDER_NOW +
    STOCKOUT_RISK). Pass `?status=ALL` to get every decision.
    """
    statuses = (
        None
        if status and any(s.upper() == "ALL" for s in status)
        else (status or DEFAULT_STATUSES)
    )

    query = (
        select(ReorderDecision, ProductMaster)
        .join(ProductMaster, ProductMaster.sku == ReorderDecision.sku)
        .where(ReorderDecision.job_id == job_id)
    )
    if statuses is not None:
        query = query.where(ReorderDecision.status.in_(statuses))

    rows = db.execute(query).all()
    out: list[ReorderDecisionOut] = []
    for decision, product in rows:
        est_cost = float(decision.recommended_order_qty) * float(product.unit_cost)
        out.append(
            ReorderDecisionOut(
                sku=decision.sku,
                name=product.name,
                category=product.category,
                status=decision.status,
                avg_daily_demand=decision.avg_daily_demand,
                demand_std=decision.demand_std,
                safety_stock=decision.safety_stock,
                reorder_point=decision.reorder_point,
                eoq=decision.eoq,
                current_stock=decision.current_stock,
                recommended_order_qty=decision.recommended_order_qty,
                explanation=decision.explanation,
                unit_cost=product.unit_cost,
                estimated_cost=est_cost,
                lead_time_days=product.lead_time_days,
            )
        )
    # Surface stockout risks first.
    out.sort(key=lambda d: (
        0 if d.status == "STOCKOUT_RISK" else 1 if d.status == "REORDER_NOW" else 2,
        -d.estimated_cost,
    ))
    return out
