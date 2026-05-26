"""Series preprocessing utilities — pure pandas, no ML dependencies."""
from __future__ import annotations

import numpy as np
import pandas as pd

MIN_HISTORY_DAYS = 60  # below this we hit the cold-start fallback
VALIDATION_DAYS = 28   # the time-based holdout window (NEVER random)


def to_daily_series(sales: pd.DataFrame) -> pd.Series:
    """Take a sales dataframe with `date` + `quantity` columns and return a
    continuous daily-indexed series. Missing dates are filled with 0 — a SKU
    with no sale on day X really did sell zero, not "missing".
    """
    if sales.empty:
        return pd.Series(dtype="float64")

    df = sales[["date", "quantity"]].copy()
    df["date"] = pd.to_datetime(df["date"])
    daily = df.groupby("date", as_index=True)["quantity"].sum().astype("float64")
    full_idx = pd.date_range(daily.index.min(), daily.index.max(), freq="D")
    return daily.reindex(full_idx, fill_value=0.0)


def time_based_split(
    series: pd.Series, validation_days: int = VALIDATION_DAYS
) -> tuple[pd.Series, pd.Series]:
    """Split chronologically: everything before the last `validation_days`
    is training; the tail is validation. Never shuffle — that leaks the future.
    """
    if len(series) <= validation_days:
        raise ValueError(
            f"Series of length {len(series)} too short for "
            f"{validation_days}-day validation window."
        )
    return series.iloc[:-validation_days], series.iloc[-validation_days:]


def score(y_true: np.ndarray, y_pred: np.ndarray) -> tuple[float, float, float]:
    """Return (MAE, RMSE, MAPE) for the validation window.

    MAPE has a small floor of 1.0 on the denominator so a near-zero
    actual doesn't blow the metric up to infinity (a known MAPE pathology
    on sparse retail series).
    """
    y_true = np.asarray(y_true, dtype="float64")
    y_pred = np.asarray(y_pred, dtype="float64")
    err = y_true - y_pred
    mae = float(np.mean(np.abs(err)))
    rmse = float(np.sqrt(np.mean(err**2)))
    denom = np.maximum(np.abs(y_true), 1.0)
    mape = float(np.mean(np.abs(err) / denom) * 100.0)
    return mae, rmse, mape


def is_too_short(series: pd.Series, min_days: int = MIN_HISTORY_DAYS) -> bool:
    return len(series) < min_days


def is_all_zero(series: pd.Series) -> bool:
    return bool((series.fillna(0) == 0).all())
