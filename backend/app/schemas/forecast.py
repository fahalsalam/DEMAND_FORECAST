"""Pydantic schemas for forecast / reorder / backtest / metrics endpoints."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

JobStatus = Literal["running", "complete", "failed"]
ReorderStatusStr = Literal["HEALTHY", "REORDER_NOW", "OVERSTOCK", "STOCKOUT_RISK"]


class ORMBase(BaseModel):
    # `protected_namespaces=()` lifts Pydantic v2's reservation on `model_*`
    # attribute names — we have legitimate domain fields like `model_mape`.
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())


class NSBase(BaseModel):
    model_config = ConfigDict(protected_namespaces=())


# ---------- /forecast/run -----------------------------------------------------
class ForecastRunRequest(BaseModel):
    service_level: float = Field(
        0.95, ge=0.5, le=0.999,
        description="Target service level (Z factor). 0.95 -> Z=1.6449.",
    )
    review_period_days: int = Field(7, ge=1, le=60)
    fast_mode: bool = Field(
        False,
        description="If true, skip ARIMA + Prophet and only run LightGBM "
                    "per SKU. ~10× faster, slight accuracy trade-off.",
    )


class ForecastRunResponse(BaseModel):
    job_id: str


# ---------- /forecast/status/{job_id} ----------------------------------------
class ForecastStatusResponse(ORMBase):
    job_id: str
    status: JobStatus
    created_at: datetime
    completed_at: datetime | None = None
    service_level: float
    message: str | None = None
    # Optional progress fields (filled if job is still running).
    skus_processed: int | None = None
    skus_total: int | None = None


# ---------- /forecast/{sku} --------------------------------------------------
class HistoricalPoint(BaseModel):
    date: date
    quantity: int


class ForecastPointOut(BaseModel):
    date: date
    yhat: float
    yhat_lower: float
    yhat_upper: float


class ForecastSeries(NSBase):
    sku: str
    job_id: str
    chosen_model: str
    model_mape: float | None
    historical: list[HistoricalPoint]
    forecast: list[ForecastPointOut]


# ---------- /reorder/alerts --------------------------------------------------
class ReorderDecisionOut(BaseModel):
    sku: str
    name: str
    category: str
    status: ReorderStatusStr
    avg_daily_demand: float
    demand_std: float
    safety_stock: float
    reorder_point: float
    eoq: float
    current_stock: int
    recommended_order_qty: float
    explanation: str
    unit_cost: float
    estimated_cost: float            # recommended_order_qty * unit_cost
    lead_time_days: int
    supplier: str | None = None      # for grouping a purchase order by supplier


# ---------- /backtest/{sku} --------------------------------------------------
class PolicyMetricsOut(BaseModel):
    name: str
    stockout_days: int
    units_lost: int
    units_demanded: int
    service_rate: float
    avg_inventory: float
    total_holding_cost: float
    overstock_unit_days: float
    orders_placed: int


class BacktestResult(BaseModel):
    sku: str
    horizon_days: int
    baseline: PolicyMetricsOut
    system: PolicyMetricsOut
    stockout_days_reduction: int
    avg_inventory_reduction: float
    holding_cost_savings: float
    summary: str


# ---------- /metrics/{job_id} ------------------------------------------------
class StatusCounts(BaseModel):
    HEALTHY: int = 0
    REORDER_NOW: int = 0
    OVERSTOCK: int = 0
    STOCKOUT_RISK: int = 0


class ModelTraceOut(NSBase):
    name: str
    val_yhat: list[float]
    val_yhat_lower: list[float]
    val_yhat_upper: list[float]
    mae: float
    rmse: float
    mape: float
    error: str | None = None


class ReorderMathStep(BaseModel):
    label: str
    formula: str
    value: float
    unit: str | None = None
    explanation: str | None = None


class InspectionResponse(NSBase):
    sku: str
    name: str
    category: str
    lead_time_days: int
    history_dates: list[date]
    history_values: list[float]
    train_end_date: date | None = None
    val_dates: list[date]
    val_actuals: list[float]
    candidates: list[ModelTraceOut]
    winner: str
    winner_mape: float
    final_forecast: list[ForecastPointOut]
    current_stock: int
    reorder_math: list[ReorderMathStep]
    decision_status: ReorderStatusStr | str
    decision_qty: float
    decision_explanation: str
    notes: str = ""


class MetricsSummary(NSBase):
    job_id: str
    total_skus: int
    avg_mape: float | None
    at_risk_count: int                       # REORDER_NOW + STOCKOUT_RISK
    total_inventory_value: float             # sum(on_hand * unit_cost)
    total_recommended_order_value: float     # sum(rec_qty * unit_cost)
    status_counts: StatusCounts
    model_usage: dict[str, int]              # {"prophet": 12, "arima": 8, ...}
