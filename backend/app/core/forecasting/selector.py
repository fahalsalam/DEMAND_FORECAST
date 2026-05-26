"""Per-SKU model selector.

Pipeline (PROJECT_SPEC section 5):
  1. Resample the SKU's sales into a continuous daily series.
  2. Time-based split (last 28 days = validation).
  3. Train ARIMA, Prophet, LightGBM on training portion.
  4. Score each on validation: MAE, RMSE, MAPE.
  5. Winner = lowest MAPE. Refit winner on FULL history.
  6. Forecast horizon = lead_time_days + review_period (default 7).
  7. Return forecast WITH prediction interval, chosen model, validation MAPE.

Edge cases:
  - Cold start (<60 days history) → category-average fallback.
  - All-zero / sparse → near-zero forecast with wide-ish band, no crash.
  - One model failing must NOT crash the selector — log it and continue.

This module is PURE: no FastAPI, no DB. Pandas in, dataclass out.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import timedelta

import numpy as np
import pandas as pd

from app.core.forecasting import arima_model, lgbm_model, prophet_model  # noqa: F401
from app.core.forecasting.preprocess import (
    MIN_HISTORY_DAYS,
    VALIDATION_DAYS,
    is_all_zero,
    is_too_short,
    score,
    time_based_split,
    to_daily_series,
)
from app.core.forecasting.types import (
    BacktestScores,
    ForecastOutput,
    ForecastPoint,
    ModelName,
)

log = logging.getLogger(__name__)

DEFAULT_REVIEW_PERIOD = 7


@dataclass(frozen=True)
class ModelTrace:
    """One model's validation-window output — used by inspect_sku() to surface
    the contest's internals for the UI."""
    name: ModelName
    val_yhat: list[float]
    val_yhat_lower: list[float]
    val_yhat_upper: list[float]
    scores: "BacktestScores"
    error: str | None = None         # if the model failed during fit


@dataclass(frozen=True)
class InspectionResult:
    sku: str
    history_dates: list[str]         # ISO YYYY-MM-DD
    history_values: list[float]
    train_end_date: str              # last day in the training window
    val_dates: list[str]             # the 28-day holdout window
    val_actuals: list[float]
    candidates: list[ModelTrace]
    winner: ModelName
    winner_mape: float
    final_forecast: list[ForecastPoint]
    notes: str = ""


@dataclass(frozen=True)
class _Candidate:
    name: ModelName
    yhat: np.ndarray
    yhat_lower: np.ndarray
    yhat_upper: np.ndarray
    scores: BacktestScores


def _safe_fit(
    name: ModelName,
    fit_fn,
    train: pd.Series,
    val: pd.Series,
) -> _Candidate | None:
    """Try one model; on failure return None and log — never crash the contest."""
    try:
        yhat, lo, hi = fit_fn(train, len(val))
        scores = BacktestScores(*score(val.to_numpy(), yhat))
        return _Candidate(name=name, yhat=yhat, yhat_lower=lo, yhat_upper=hi, scores=scores)
    except Exception as exc:  # noqa: BLE001 — intentional broad catch
        log.warning("Model %s failed: %s", name, exc)
        return None


def _category_average_fallback(
    sku: str,
    series: pd.Series,
    horizon: int,
    last_date,
    category_daily_avg: float | None,
    note: str,
) -> ForecastOutput:
    """Cold-start path: predict the category average daily demand with a wide band."""
    avg = (
        category_daily_avg
        if category_daily_avg is not None and category_daily_avg > 0
        else float(series.mean()) if len(series) and series.sum() > 0
        else 1.0
    )
    # Wide band: ±60% — explicitly admits we have no data to be confident.
    yhat = np.full(horizon, avg, dtype="float64")
    lo = np.clip(yhat * 0.4, 0.0, None)
    hi = yhat * 1.6
    points = _make_points(yhat, lo, hi, last_date)
    return ForecastOutput(
        sku=sku,
        chosen_model="fallback_category_avg",
        model_mape=float("nan"),
        horizon_days=horizon,
        points=points,
        notes=note,
    )


def _all_zero_fallback(sku: str, horizon: int, last_date) -> ForecastOutput:
    """Sparse/all-zero path: predict zero with a small token band so safety stock != NaN."""
    yhat = np.zeros(horizon, dtype="float64")
    lo = np.zeros(horizon, dtype="float64")
    hi = np.full(horizon, 1.0, dtype="float64")
    points = _make_points(yhat, lo, hi, last_date)
    return ForecastOutput(
        sku=sku,
        chosen_model="fallback_zero",
        model_mape=0.0,
        horizon_days=horizon,
        points=points,
        notes="all-zero or sparse history",
    )


def _make_points(yhat, lo, hi, last_date) -> list[ForecastPoint]:
    start = pd.Timestamp(last_date) + pd.Timedelta(days=1)
    dates = pd.date_range(start, periods=len(yhat), freq="D")
    return [
        ForecastPoint(
            forecast_date=d.date(),
            yhat=float(y),
            yhat_lower=float(l),
            yhat_upper=float(h),
        )
        for d, y, l, h in zip(dates, yhat, lo, hi, strict=True)
    ]


def forecast_sku(
    sku: str,
    sales: pd.DataFrame,
    *,
    lead_time_days: int,
    review_period: int = DEFAULT_REVIEW_PERIOD,
    category_daily_avg: float | None = None,
) -> ForecastOutput:
    """Run the model contest for one SKU and return the winner's forecast."""
    series = to_daily_series(sales)
    horizon = lead_time_days + review_period

    # No history at all — fall back hard.
    if series.empty:
        last_date = pd.Timestamp.today().normalize().date() - timedelta(days=1)
        return _category_average_fallback(
            sku, series, horizon, last_date, category_daily_avg,
            note="no sales history at all",
        )

    last_date = series.index[-1].date() if hasattr(series.index[-1], "date") else series.index[-1]

    # Cold start.
    if is_too_short(series, MIN_HISTORY_DAYS):
        return _category_average_fallback(
            sku, series, horizon, last_date, category_daily_avg,
            note=f"cold start: only {len(series)} days < {MIN_HISTORY_DAYS}",
        )

    # All zero / sparse → don't waste the contest, return zero.
    if is_all_zero(series):
        return _all_zero_fallback(sku, horizon, last_date)

    # Time-based split (NEVER random).
    try:
        train_val, val = time_based_split(series, VALIDATION_DAYS)
    except ValueError:
        return _category_average_fallback(
            sku, series, horizon, last_date, category_daily_avg,
            note="too short for time-based split",
        )

    # --- contest --------------------------------------------------------
    candidates: list[_Candidate] = []
    for name, fn in (
        ("arima", arima_model.fit_forecast),
        ("prophet", prophet_model.fit_forecast),
        ("lightgbm", lgbm_model.fit_forecast),
    ):
        c = _safe_fit(name, fn, train_val, val)
        if c is not None:
            candidates.append(c)

    if not candidates:
        return _category_average_fallback(
            sku, series, horizon, last_date, category_daily_avg,
            note="all three models failed during fit",
        )

    # Pick lowest MAPE (treat NaN as +inf).
    def _key(c: _Candidate) -> float:
        m = c.scores.mape
        return float("inf") if math.isnan(m) else m

    winner = min(candidates, key=_key)
    scores_by_model = {c.name: c.scores for c in candidates}

    # --- refit winner on FULL history ----------------------------------
    fit_fn = {
        "arima": arima_model.fit_forecast,
        "prophet": prophet_model.fit_forecast,
        "lightgbm": lgbm_model.fit_forecast,
    }[winner.name]
    try:
        yhat, lo, hi = fit_fn(series, horizon)
    except Exception as exc:  # last-ditch: use the validation-only forecast extended
        log.warning("Refit of %s on full history failed: %s — using val forecast", winner.name, exc)
        # Recycle: extend the winner's validation forecast by repeating the last value
        # padded to horizon. Edge case — almost never hits.
        yhat = np.concatenate([winner.yhat, np.repeat(winner.yhat[-1:], max(0, horizon - len(winner.yhat)))])[:horizon]
        lo = np.concatenate([winner.yhat_lower, np.repeat(winner.yhat_lower[-1:], max(0, horizon - len(winner.yhat_lower)))])[:horizon]
        hi = np.concatenate([winner.yhat_upper, np.repeat(winner.yhat_upper[-1:], max(0, horizon - len(winner.yhat_upper)))])[:horizon]

    points = _make_points(yhat, lo, hi, last_date)
    return ForecastOutput(
        sku=sku,
        chosen_model=winner.name,
        model_mape=float(winner.scores.mape),
        horizon_days=horizon,
        points=points,
        scores_by_model={k: v for k, v in scores_by_model.items()},
        notes=f"winner of {len(candidates)}-model contest",
    )


def inspect_sku(
    sku: str,
    sales: pd.DataFrame,
    *,
    lead_time_days: int,
    review_period: int = DEFAULT_REVIEW_PERIOD,
    category_daily_avg: float | None = None,
) -> InspectionResult:
    """Same pipeline as forecast_sku, but returns the FULL trace including
    per-model validation predictions + scores. Used by the Model Inspector
    page in the UI so a reviewer can see the contest internals.
    """
    series = to_daily_series(sales)
    horizon = lead_time_days + review_period

    if series.empty or is_too_short(series, MIN_HISTORY_DAYS):
        # Cold start: fabricate an "empty inspection" with the fallback forecast
        # so the UI doesn't error.
        last_date = pd.Timestamp.today().normalize().date() - timedelta(days=1) \
            if series.empty else series.index[-1].date()
        fallback = _category_average_fallback(
            sku, series, horizon, last_date, category_daily_avg,
            note=f"cold start: only {len(series)} days < {MIN_HISTORY_DAYS}",
        )
        return InspectionResult(
            sku=sku,
            history_dates=[d.isoformat() for d in series.index.date] if len(series) else [],
            history_values=[float(v) for v in series.values],
            train_end_date=(series.index[-1].date().isoformat() if len(series) else ""),
            val_dates=[],
            val_actuals=[],
            candidates=[],
            winner=fallback.chosen_model,
            winner_mape=0.0,
            final_forecast=fallback.points,
            notes=fallback.notes,
        )

    # Time-based split.
    train_val, val = time_based_split(series, VALIDATION_DAYS)

    # Run all three.
    traces: list[ModelTrace] = []
    candidates: list[_Candidate] = []
    for name, fn in (
        ("arima", arima_model.fit_forecast),
        ("prophet", prophet_model.fit_forecast),
        ("lightgbm", lgbm_model.fit_forecast),
    ):
        c = _safe_fit(name, fn, train_val, val)
        if c is not None:
            candidates.append(c)
            traces.append(
                ModelTrace(
                    name=name,
                    val_yhat=[float(v) for v in c.yhat],
                    val_yhat_lower=[float(v) for v in c.yhat_lower],
                    val_yhat_upper=[float(v) for v in c.yhat_upper],
                    scores=c.scores,
                )
            )
        else:
            traces.append(
                ModelTrace(
                    name=name,
                    val_yhat=[], val_yhat_lower=[], val_yhat_upper=[],
                    scores=BacktestScores(mae=float("nan"), rmse=float("nan"), mape=float("nan")),
                    error="model failed during fit",
                )
            )

    if not candidates:
        # All failed — same fallback path.
        last_date = series.index[-1].date()
        fb = _category_average_fallback(
            sku, series, horizon, last_date, category_daily_avg,
            note="all three models failed",
        )
        return InspectionResult(
            sku=sku,
            history_dates=[d.isoformat() for d in series.index.date],
            history_values=[float(v) for v in series.values],
            train_end_date=train_val.index[-1].date().isoformat(),
            val_dates=[d.isoformat() for d in val.index.date],
            val_actuals=[float(v) for v in val.values],
            candidates=traces,
            winner=fb.chosen_model,
            winner_mape=0.0,
            final_forecast=fb.points,
            notes=fb.notes,
        )

    def _key(c: _Candidate) -> float:
        m = c.scores.mape
        return float("inf") if math.isnan(m) else m

    winner = min(candidates, key=_key)

    # Refit winner on full history for the final forecast.
    fit_fn = {
        "arima": arima_model.fit_forecast,
        "prophet": prophet_model.fit_forecast,
        "lightgbm": lgbm_model.fit_forecast,
    }[winner.name]
    try:
        yhat, lo, hi = fit_fn(series, horizon)
    except Exception:
        yhat, lo, hi = winner.yhat, winner.yhat_lower, winner.yhat_upper
        yhat = yhat[:horizon] if len(yhat) >= horizon else \
            np.concatenate([yhat, np.repeat(yhat[-1:], horizon - len(yhat))])
        lo = lo[:horizon] if len(lo) >= horizon else \
            np.concatenate([lo, np.repeat(lo[-1:], horizon - len(lo))])
        hi = hi[:horizon] if len(hi) >= horizon else \
            np.concatenate([hi, np.repeat(hi[-1:], horizon - len(hi))])

    last_date = series.index[-1].date()
    points = _make_points(yhat, lo, hi, last_date)

    return InspectionResult(
        sku=sku,
        history_dates=[d.isoformat() for d in series.index.date],
        history_values=[float(v) for v in series.values],
        train_end_date=train_val.index[-1].date().isoformat(),
        val_dates=[d.isoformat() for d in val.index.date],
        val_actuals=[float(v) for v in val.values],
        candidates=traces,
        winner=winner.name,
        winner_mape=float(winner.scores.mape),
        final_forecast=points,
        notes=f"winner of {len(candidates)}-model contest",
    )
