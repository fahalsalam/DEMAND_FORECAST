"""Auto-ARIMA wrapper using pmdarima.

Returns mean forecast + 95% confidence interval (yhat_lower / yhat_upper),
which downstream becomes the safety-stock uncertainty band.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pmdarima as pm

ALPHA = 0.05  # 95% prediction interval


def fit_forecast(
    train: pd.Series, horizon: int, *, seasonal_period: int | None = 7
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Fit auto_arima on `train` and forecast `horizon` days ahead.

    Returns three arrays of length `horizon`: (yhat, yhat_lower, yhat_upper).

    Parameters
    ----------
    train : daily series; index doesn't matter, values do.
    horizon : number of future days to predict (= lead_time + review_period).
    seasonal_period : 7 captures weekly seasonality typical of daily retail.
    """
    y = train.astype("float64").to_numpy()

    model = pm.auto_arima(
        y,
        seasonal=seasonal_period is not None,
        m=seasonal_period or 1,
        suppress_warnings=True,
        error_action="ignore",
        stepwise=True,
        max_p=3, max_q=3, max_P=2, max_Q=2,
        information_criterion="aic",
    )

    yhat, conf = model.predict(n_periods=horizon, return_conf_int=True, alpha=ALPHA)
    yhat = np.asarray(yhat, dtype="float64")
    yhat_lower = np.asarray(conf[:, 0], dtype="float64")
    yhat_upper = np.asarray(conf[:, 1], dtype="float64")

    # Demand can't be negative — clip the lower band and the point estimate.
    yhat = np.clip(yhat, 0.0, None)
    yhat_lower = np.clip(yhat_lower, 0.0, None)
    yhat_upper = np.clip(yhat_upper, 0.0, None)
    return yhat, yhat_lower, yhat_upper
