"""LightGBM wrapper with engineered time-series features.

LightGBM has no native confidence interval, so we train THREE models:
  - One regular regressor for the point estimate (yhat)
  - One quantile regressor at alpha=0.05 for yhat_lower
  - One quantile regressor at alpha=0.95 for yhat_upper

This is the documented approach for prediction intervals on tree models.

Features (PROJECT_SPEC section 5):
  lag_7, lag_14, lag_28, rolling_mean_7, rolling_mean_28, day_of_week, month,
  plus promo_flag if a promo series is supplied.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor

LAGS = [7, 14, 28]
ROLLING_WINDOWS = [7, 28]
LOOKBACK = max(LAGS + ROLLING_WINDOWS)

_LGB_KW = dict(
    n_estimators=200,
    learning_rate=0.05,
    num_leaves=31,
    min_child_samples=5,
    verbose=-1,
)


def _build_features(
    series: pd.Series, promo: pd.Series | None = None
) -> pd.DataFrame:
    """Turn a daily-indexed series into a feature matrix (one row per day)."""
    df = pd.DataFrame({"y": series.astype("float64")}, index=pd.to_datetime(series.index))
    for lag in LAGS:
        df[f"lag_{lag}"] = df["y"].shift(lag)
    for w in ROLLING_WINDOWS:
        df[f"roll_mean_{w}"] = df["y"].shift(1).rolling(w).mean()
    df["dow"] = df.index.dayofweek
    df["month"] = df.index.month
    if promo is not None:
        df["promo_flag"] = promo.reindex(df.index).fillna(0).astype(int).values
    else:
        df["promo_flag"] = 0
    return df


def _train_models(train_df: pd.DataFrame) -> tuple[LGBMRegressor, LGBMRegressor, LGBMRegressor]:
    clean = train_df.dropna()
    X = clean.drop(columns=["y"])
    y = clean["y"]

    point = LGBMRegressor(objective="regression", **_LGB_KW).fit(X, y)
    lo = LGBMRegressor(objective="quantile", alpha=0.05, **_LGB_KW).fit(X, y)
    hi = LGBMRegressor(objective="quantile", alpha=0.95, **_LGB_KW).fit(X, y)
    return point, lo, hi


def fit_forecast(
    train: pd.Series, horizon: int, *, promo: pd.Series | None = None
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Recursive multi-step forecast — at each future day we rebuild the lag
    features from the train history + already-predicted future values.
    """
    feat = _build_features(train, promo=promo)
    point_m, lo_m, hi_m = _train_models(feat)

    history = train.astype("float64").copy()
    history.index = pd.to_datetime(history.index)

    yhat, yhat_lo, yhat_hi = [], [], []
    last_date = history.index[-1]
    for step in range(1, horizon + 1):
        target_date = last_date + pd.Timedelta(days=step)
        # Build a single-row feature frame using the extended history.
        ext = history.copy()
        # Pad target_date so we can extract its features.
        ext.loc[target_date] = np.nan
        row_df = _build_features(ext, promo=promo).loc[[target_date]].drop(columns=["y"])

        if row_df.isna().any().any():
            # Not enough history to compute a lag — fall back to recent mean.
            recent_mean = float(history.tail(28).mean())
            yhat.append(recent_mean)
            yhat_lo.append(max(0.0, recent_mean * 0.6))
            yhat_hi.append(recent_mean * 1.4)
        else:
            p = float(point_m.predict(row_df)[0])
            lo = float(lo_m.predict(row_df)[0])
            hi = float(hi_m.predict(row_df)[0])
            yhat.append(p)
            yhat_lo.append(lo)
            yhat_hi.append(hi)

        # Feed the point estimate back into history for the next recursive step.
        history.loc[target_date] = yhat[-1]

    yhat_arr = np.clip(np.array(yhat), 0.0, None)
    lo_arr = np.clip(np.array(yhat_lo), 0.0, None)
    hi_arr = np.clip(np.array(yhat_hi), 0.0, None)
    # Make sure lo <= yhat <= hi (quantile models can occasionally cross).
    lo_arr = np.minimum(lo_arr, yhat_arr)
    hi_arr = np.maximum(hi_arr, yhat_arr)
    return yhat_arr, lo_arr, hi_arr
