"""Forecasting core — pure Python, NO FastAPI/DB imports.

Public entry point: `selector.forecast_sku()`. The three model wrappers
(arima_model, prophet_model, lgbm_model) all expose the same
`fit_forecast(train, horizon) -> (yhat, yhat_lower, yhat_upper)` contract.
"""
from app.core.forecasting.selector import forecast_sku
from app.core.forecasting.types import (
    BacktestScores,
    ForecastOutput,
    ForecastPoint,
    ModelName,
)

__all__ = [
    "BacktestScores",
    "ForecastOutput",
    "ForecastPoint",
    "ModelName",
    "forecast_sku",
]
