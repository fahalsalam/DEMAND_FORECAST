"""Shared data structures for the forecasting core.

These are plain dataclasses — no ORM coupling, no FastAPI imports.
Inputs are pandas Series/DataFrames; outputs are these types.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Literal

ModelName = Literal["arima", "prophet", "lightgbm", "fallback_category_avg", "fallback_zero"]


@dataclass(frozen=True)
class ForecastPoint:
    """One day of forecast output with its uncertainty band."""
    forecast_date: date
    yhat: float
    yhat_lower: float
    yhat_upper: float


@dataclass(frozen=True)
class BacktestScores:
    """Validation scores on the held-out window."""
    mae: float
    rmse: float
    mape: float


@dataclass(frozen=True)
class ForecastOutput:
    """End-to-end selector output for one SKU."""
    sku: str
    chosen_model: ModelName
    model_mape: float
    horizon_days: int
    points: list[ForecastPoint]
    scores_by_model: dict[str, BacktestScores] = field(default_factory=dict)
    notes: str = ""

    @property
    def yhat_series(self) -> list[float]:
        return [p.yhat for p in self.points]
