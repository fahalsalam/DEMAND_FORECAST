"""Pure unit tests for the forecasting core.

No DB, no web, no real sales table — just synthetic pandas series.
That's the whole point of the spec's architecture rule.
"""
from __future__ import annotations

import math
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from app.core.forecasting import forecast_sku
from app.core.forecasting.preprocess import (
    score,
    time_based_split,
    to_daily_series,
)


# ---------- helpers ---------------------------------------------------------
def _make_sales(values, start: date = date(2024, 1, 1), sku: str = "TST") -> pd.DataFrame:
    """Wrap a list of daily quantities into the DataFrame shape `forecast_sku` expects."""
    dates = [start + timedelta(days=i) for i in range(len(values))]
    return pd.DataFrame({
        "sku": sku,
        "store_id": "S1",
        "date": dates,
        "quantity": values,
    })


def _seasonal_series(days: int) -> list[float]:
    """Strong weekly seasonality + mild upward trend — easy to forecast well."""
    rng = np.random.default_rng(7)
    base = 30
    out = []
    for i in range(days):
        dow_lift = 12 if i % 7 in (5, 6) else 0
        trend = i * 0.02
        noise = rng.normal(0, 2.0)
        out.append(max(0, int(base + dow_lift + trend + noise)))
    return out


# ---------- preprocess unit tests ------------------------------------------
def test_to_daily_series_fills_missing_days_with_zero():
    sales = _make_sales([5, 0, 0, 7])         # 4 consecutive days
    sales = sales.drop(index=1)                # remove day 2 to force a gap
    ser = to_daily_series(sales)
    assert len(ser) == 4
    assert ser.iloc[1] == 0                    # gap filled with zero
    assert ser.iloc[0] == 5
    assert ser.iloc[3] == 7


def test_time_based_split_is_chronological():
    ser = pd.Series(range(100), index=pd.date_range("2024-01-01", periods=100))
    train, val = time_based_split(ser, 28)
    assert len(train) == 72 and len(val) == 28
    assert train.index.max() < val.index.min()       # no temporal leak


def test_score_mape_handles_near_zero_actuals():
    # Without the floor, this would explode to a huge MAPE.
    y_true = np.array([0.0, 0.0, 1.0])
    y_pred = np.array([0.5, 0.5, 1.0])
    _, _, mape = score(y_true, y_pred)
    assert math.isfinite(mape) and mape < 50


# ---------- selector integration tests -------------------------------------
def test_clean_seasonal_series_picks_a_model_and_returns_band():
    sales = _make_sales(_seasonal_series(400))
    out = forecast_sku("TST", sales, lead_time_days=5, review_period=7)

    assert out.chosen_model in {"arima", "prophet", "lightgbm"}
    assert out.horizon_days == 12
    assert len(out.points) == 12
    assert math.isfinite(out.model_mape) and out.model_mape >= 0

    for p in out.points:
        assert p.yhat_lower <= p.yhat <= p.yhat_upper
        assert p.yhat >= 0


def test_cold_start_falls_back_to_category_average():
    sales = _make_sales(_seasonal_series(30))   # 30 days < MIN_HISTORY_DAYS (60)
    out = forecast_sku(
        "NEW-01", sales,
        lead_time_days=5, review_period=7,
        category_daily_avg=25.0,
    )
    assert out.chosen_model == "fallback_category_avg"
    assert all(abs(p.yhat - 25.0) < 1e-9 for p in out.points)
    # Wide uncertainty band, lower bound respects non-negativity.
    assert all(p.yhat_upper > p.yhat > p.yhat_lower >= 0 for p in out.points)


def test_all_zero_series_does_not_crash():
    sales = _make_sales([0] * 120)
    out = forecast_sku("DEAD", sales, lead_time_days=5, review_period=7)
    assert out.chosen_model == "fallback_zero"
    assert all(p.yhat == 0 for p in out.points)
    # Tiny band so safety stock downstream isn't NaN.
    assert all(p.yhat_upper >= p.yhat >= p.yhat_lower for p in out.points)


def test_empty_sales_does_not_crash():
    sales = pd.DataFrame(columns=["sku", "store_id", "date", "quantity"])
    out = forecast_sku("ANY", sales, lead_time_days=3, review_period=7,
                       category_daily_avg=10.0)
    assert out.chosen_model == "fallback_category_avg"
    assert len(out.points) == 10
