"""Forecast endpoints — start jobs, poll status, fetch series."""
from __future__ import annotations

import math
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import asc, desc, func, select
from sqlalchemy.orm import Session

from app.core.forecasting.selector import inspect_sku
from app.core.inventory.reorder import (
    DAYS_PER_YEAR,
    decide_reorder,
    demand_stats_from_forecast,
    economic_order_quantity,
    reorder_point,
    safety_stock,
    z_for_service_level,
)
from app.db import get_db
from app.jobs.forecast_runner import new_job_id, run_forecast_job
from app.models import (
    CurrentInventory,
    ForecastJob,
    ForecastResult,
    ProductMaster,
    SalesHistory,
)
from app.schemas import (
    ForecastPointOut,
    ForecastRunRequest,
    ForecastRunResponse,
    ForecastSeries,
    ForecastStatusResponse,
    HistoricalPoint,
    InspectionResponse,
    ModelTraceOut,
    ReorderMathStep,
)

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.post("/run", response_model=ForecastRunResponse)
def start_forecast(
    body: ForecastRunRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ForecastRunResponse:
    """Create the job row, queue the background task, return job_id immediately.

    The endpoint must NOT block — the spec is explicit on this.
    """
    job_id = new_job_id()
    db.add(
        ForecastJob(
            job_id=job_id,
            status="running",
            created_at=datetime.now(timezone.utc),
            service_level=body.service_level,
        )
    )
    db.commit()

    background_tasks.add_task(
        run_forecast_job,
        job_id=job_id,
        service_level=body.service_level,
        review_period_days=body.review_period_days,
        fast_mode=body.fast_mode,
    )
    return ForecastRunResponse(job_id=job_id)


@router.get("/latest", response_model=ForecastStatusResponse)
def get_latest_job(db: Session = Depends(get_db)) -> ForecastStatusResponse:
    """Return the most recently CREATED forecast job (any status).

    Used by the frontend on first load when localStorage has no cached job_id
    — lets the dashboard hydrate from the freshest data without forcing the
    user to click Run Forecast first.
    """
    job = db.execute(
        select(ForecastJob).order_by(desc(ForecastJob.created_at)).limit(1)
    ).scalar_one_or_none()
    if job is None:
        raise HTTPException(404, "No forecast jobs have been run yet.")

    skus_processed = db.execute(
        select(ForecastResult.sku).where(ForecastResult.job_id == job.job_id).distinct()
    ).scalars().all()
    return ForecastStatusResponse(
        job_id=job.job_id,
        status=job.status,
        created_at=job.created_at,
        completed_at=job.completed_at,
        service_level=job.service_level,
        message=job.message,
        skus_processed=len(skus_processed),
    )


@router.post("/cancel/{job_id}", response_model=ForecastStatusResponse)
def cancel_forecast(job_id: str, db: Session = Depends(get_db)) -> ForecastStatusResponse:
    """Cancel a running forecast job.

    Marks the job's row as failed (message="Cancelled by user"). The
    background runner checks the job's status between SKUs and bails
    out cleanly when it sees the cancellation. Worker processes that
    are already mid-fit can't be killed cleanly (Prophet/Stan don't
    cooperate with interrupts), but any unfinished SKUs are skipped
    and the pool is shut down without waiting.

    Returns the updated status row so the UI can stop polling.
    """
    job = db.get(ForecastJob, job_id)
    if job is None:
        raise HTTPException(404, f"Job {job_id} not found.")
    if job.status != "running":
        raise HTTPException(
            409,
            f"Job is '{job.status}' — only running jobs can be cancelled.",
        )
    job.status = "failed"
    job.message = "Cancelled by user."
    job.completed_at = datetime.now(timezone.utc)
    db.commit()

    skus_processed = db.execute(
        select(ForecastResult.sku).where(ForecastResult.job_id == job_id).distinct()
    ).scalars().all()
    return ForecastStatusResponse(
        job_id=job.job_id,
        status=job.status,
        created_at=job.created_at,
        completed_at=job.completed_at,
        service_level=job.service_level,
        message=job.message,
        skus_processed=len(skus_processed),
    )


@router.get("/status/{job_id}", response_model=ForecastStatusResponse)
def get_status(job_id: str, db: Session = Depends(get_db)) -> ForecastStatusResponse:
    job = db.get(ForecastJob, job_id)
    if job is None:
        raise HTTPException(404, f"Job {job_id} not found.")
    # Best-effort progress: count distinct SKUs already written.
    skus_processed = db.execute(
        select(ForecastResult.sku).where(ForecastResult.job_id == job_id).distinct()
    ).scalars().all()
    return ForecastStatusResponse(
        job_id=job.job_id,
        status=job.status,
        created_at=job.created_at,
        completed_at=job.completed_at,
        service_level=job.service_level,
        message=job.message,
        skus_processed=len(skus_processed),
    )


@router.get("/{sku}", response_model=ForecastSeries)
def get_forecast_for_sku(
    sku: str,
    job_id: str,
    db: Session = Depends(get_db),
) -> ForecastSeries:
    """Historical actuals + forecast continuation + uncertainty band for one SKU."""
    rows = db.execute(
        select(ForecastResult)
        .where(ForecastResult.job_id == job_id, ForecastResult.sku == sku)
        .order_by(asc(ForecastResult.forecast_date))
    ).scalars().all()
    if not rows:
        raise HTTPException(
            404, f"No forecast for sku={sku} in job_id={job_id}."
        )

    history = db.execute(
        select(SalesHistory.date, SalesHistory.quantity)
        .where(SalesHistory.sku == sku)
        .order_by(asc(SalesHistory.date))
    ).all()

    return ForecastSeries(
        sku=sku,
        job_id=job_id,
        chosen_model=rows[0].chosen_model,
        model_mape=float(rows[0].model_mape),
        historical=[HistoricalPoint(date=d, quantity=int(q)) for d, q in history],
        forecast=[
            ForecastPointOut(
                date=r.forecast_date,
                yhat=r.yhat,
                yhat_lower=r.yhat_lower,
                yhat_upper=r.yhat_upper,
            )
            for r in rows
        ],
    )


@router.get("/inspect/{sku}", response_model=InspectionResponse)
def inspect_pipeline(
    sku: str,
    service_level: float = Query(0.95, ge=0.5, le=0.999),
    review_period_days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
) -> InspectionResponse:
    """Run the 3-model contest on-demand for one SKU and return the FULL trace
    plus the inventory-math breakdown. Slow (~20-30s) — the UI shows a spinner.

    Lets reviewers see exactly what the model does: the time-based split, each
    model's validation prediction, why the winner won (lowest MAPE), and how
    the forecast turns into a reorder decision step by step.
    """
    product = db.get(ProductMaster, sku)
    if product is None:
        raise HTTPException(404, f"SKU {sku} not found.")

    # Pull sales as a DataFrame.
    sales_rows = db.execute(
        select(SalesHistory.date, SalesHistory.quantity).where(SalesHistory.sku == sku)
    ).all()
    sales_df = pd.DataFrame(sales_rows, columns=["date", "quantity"])

    # Compute category daily average for cold-start fallback.
    cat_avg_row = db.execute(
        select(func.avg(SalesHistory.quantity))
        .select_from(SalesHistory)
        .join(ProductMaster, ProductMaster.sku == SalesHistory.sku)
        .where(ProductMaster.category == product.category)
    ).scalar()
    category_daily_avg = float(cat_avg_row) if cat_avg_row else None

    inspection = inspect_sku(
        sku=sku,
        sales=sales_df,
        lead_time_days=int(product.lead_time_days),
        review_period=review_period_days,
        category_daily_avg=category_daily_avg,
    )

    # Reorder math walkthrough on the lead-time slice of the final forecast.
    lt = int(product.lead_time_days)
    yhat = [p.yhat for p in inspection.final_forecast[:lt]]
    lo = [p.yhat_lower for p in inspection.final_forecast[:lt]]
    hi = [p.yhat_upper for p in inspection.final_forecast[:lt]]
    avg_daily, sigma = demand_stats_from_forecast(yhat, lo, hi)
    z = z_for_service_level(service_level)
    ss = safety_stock(service_level, sigma, lt)
    rop = reorder_point(avg_daily, lt, ss)
    annual_demand = avg_daily * DAYS_PER_YEAR
    eoq = economic_order_quantity(
        avg_daily, product.ordering_cost, product.holding_cost_per_unit
    )

    inv = db.get(CurrentInventory, sku)
    current_stock = int(inv.on_hand) if inv else 0

    decision = decide_reorder(
        sku=sku,
        yhat_lead_window=yhat,
        yhat_lower_lead=lo,
        yhat_upper_lead=hi,
        lead_time_days=lt,
        current_stock=current_stock,
        ordering_cost=product.ordering_cost,
        holding_cost_per_unit_per_year=product.holding_cost_per_unit,
        service_level=service_level,
    )

    math_steps = [
        ReorderMathStep(
            label="Average daily demand (μ)",
            formula="mean(yhat over lead time)",
            value=round(avg_daily, 2),
            unit="units/day",
            explanation=f"Average of the next {lt} forecast days.",
        ),
        ReorderMathStep(
            label="Per-day demand σ (sigma)",
            formula="(upper − lower) / (2 × 1.96)",
            value=round(sigma, 2),
            unit="units",
            explanation="Backed out from the 95% prediction interval width.",
        ),
        ReorderMathStep(
            label=f"Z factor for SL={service_level:.0%}",
            formula="norm.ppf(SL)",
            value=round(z, 4),
            unit=None,
            explanation="Number of σ of cover to hold for the chosen service level.",
        ),
        ReorderMathStep(
            label="Safety stock",
            formula=f"Z × σ × √L  =  {z:.3f} × {sigma:.2f} × √{lt}",
            value=round(ss, 2),
            unit="units",
            explanation="Buffer for demand variability during the lead time.",
        ),
        ReorderMathStep(
            label="Lead-time demand",
            formula=f"μ × L  =  {avg_daily:.2f} × {lt}",
            value=round(avg_daily * lt, 2),
            unit="units",
            explanation="Expected demand during one lead time.",
        ),
        ReorderMathStep(
            label="Reorder point (ROP)",
            formula="μ × L  +  safety_stock",
            value=round(rop, 2),
            unit="units",
            explanation="Below this stock level, place a new order.",
        ),
        ReorderMathStep(
            label="Annual demand (D)",
            formula=f"μ × 365  =  {avg_daily:.2f} × 365",
            value=round(annual_demand, 0),
            unit="units/yr",
            explanation="Used in the EOQ formula.",
        ),
        ReorderMathStep(
            label="Economic order quantity (EOQ)",
            formula=(
                f"√(2 × D × S / H)  =  √(2 × {annual_demand:.0f} × "
                f"{product.ordering_cost:.2f} / {product.holding_cost_per_unit:.2f})"
            ),
            value=round(eoq, 0),
            unit="units",
            explanation="Order size that minimises ordering + holding cost.",
        ),
        ReorderMathStep(
            label="Current stock",
            formula="from current_inventory table",
            value=float(current_stock),
            unit="units",
            explanation="What's on hand right now.",
        ),
    ]

    candidates_out = [
        ModelTraceOut(
            name=c.name,
            val_yhat=c.val_yhat,
            val_yhat_lower=c.val_yhat_lower,
            val_yhat_upper=c.val_yhat_upper,
            mae=c.scores.mae if not math.isnan(c.scores.mae) else 0.0,
            rmse=c.scores.rmse if not math.isnan(c.scores.rmse) else 0.0,
            mape=c.scores.mape if not math.isnan(c.scores.mape) else 0.0,
            error=c.error,
        )
        for c in inspection.candidates
    ]

    return InspectionResponse(
        sku=sku,
        name=product.name,
        category=product.category,
        lead_time_days=lt,
        history_dates=[pd.to_datetime(d).date() for d in inspection.history_dates],
        history_values=inspection.history_values,
        train_end_date=pd.to_datetime(inspection.train_end_date).date()
            if inspection.train_end_date else None,
        val_dates=[pd.to_datetime(d).date() for d in inspection.val_dates],
        val_actuals=inspection.val_actuals,
        candidates=candidates_out,
        winner=inspection.winner,
        winner_mape=inspection.winner_mape,
        final_forecast=[
            ForecastPointOut(
                date=p.forecast_date,
                yhat=p.yhat,
                yhat_lower=p.yhat_lower,
                yhat_upper=p.yhat_upper,
            )
            for p in inspection.final_forecast
        ],
        current_stock=current_stock,
        reorder_math=math_steps,
        decision_status=decision.status,
        decision_qty=decision.recommended_order_qty,
        decision_explanation=decision.explanation,
        notes=inspection.notes,
    )
