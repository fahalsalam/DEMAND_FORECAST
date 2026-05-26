"""Prophet wrapper.

Prophet expects a 2-column dataframe with columns named exactly `ds` and `y`.
Returns the same (yhat, yhat_lower, yhat_upper) interface as the other models.
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd
from prophet import Prophet

# Prophet & cmdstanpy are noisy on stdout; quiet them for clean test output.
logging.getLogger("prophet").setLevel(logging.WARNING)
logging.getLogger("cmdstanpy").setLevel(logging.WARNING)


def fit_forecast(
    train: pd.Series, horizon: int
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Fit Prophet on `train` with weekly + yearly seasonality and forecast `horizon` days.

    `train` is assumed to be daily-indexed; the index becomes the `ds` column.
    """
    df = pd.DataFrame({"ds": pd.to_datetime(train.index), "y": train.values})

    model = Prophet(
        weekly_seasonality=True,
        yearly_seasonality=True,
        daily_seasonality=False,
        interval_width=0.95,
    )
    model.fit(df)

    future = model.make_future_dataframe(periods=horizon, freq="D", include_history=False)
    fc = model.predict(future)

    yhat = np.clip(fc["yhat"].to_numpy(dtype="float64"), 0.0, None)
    yhat_lower = np.clip(fc["yhat_lower"].to_numpy(dtype="float64"), 0.0, None)
    yhat_upper = np.clip(fc["yhat_upper"].to_numpy(dtype="float64"), 0.0, None)
    return yhat, yhat_lower, yhat_upper
