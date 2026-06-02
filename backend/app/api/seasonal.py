"""Seasonal Outlook endpoint — long-horizon Prophet forecast + decomposition.

Returns the 365-day view that lets the buyer SEE the pattern instead of just
deciding the next reorder. The Frontend's Seasonal Outlook page plots:

  - Monthly bar chart of forecast totals (12 months ahead)
  - Prophet's decomposition: trend, weekly_seasonality, yearly_seasonality
  - Festival markers overlaid on the daily view (from /config/festivals)
  - A plain-English summary ("peaks in July, biggest spike around Diwali...")
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from prophet import Prophet
from sqlalchemy import asc, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Festival, ProductMaster, SalesHistory

log = logging.getLogger(__name__)

# Prophet + cmdstanpy spam stdout heavily; quiet them.
logging.getLogger("prophet").setLevel(logging.WARNING)
logging.getLogger("cmdstanpy").setLevel(logging.WARNING)

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.get("/seasonal/{sku}")
def seasonal_outlook(
    sku: str,
    horizon_days: int = Query(365, ge=30, le=730),
    db: Session = Depends(get_db),
) -> dict:
    """Long-range Prophet forecast for one SKU with decomposition + festivals.

    NOT cached — runs Prophet on demand (~10-15 s). The UI shows a spinner.
    """
    product = db.get(ProductMaster, sku)
    if product is None:
        raise HTTPException(404, f"SKU {sku} not found.")

    # Pull daily sales.
    rows = db.execute(
        select(SalesHistory.date, SalesHistory.quantity)
        .where(SalesHistory.sku == sku)
        .order_by(asc(SalesHistory.date))
    ).all()
    if len(rows) < 60:
        raise HTTPException(
            400,
            f"SKU {sku} has only {len(rows)} days of history — need 60+ for a "
            "seasonal forecast.",
        )

    df = pd.DataFrame(rows, columns=["ds", "y"])
    df["ds"] = pd.to_datetime(df["ds"])

    # Resample to a continuous daily index (fill gaps with 0).
    df = df.set_index("ds").asfreq("D", fill_value=0).reset_index()

    # Fit Prophet with both weekly + yearly seasonality.
    m = Prophet(
        weekly_seasonality=True,
        yearly_seasonality=True,
        daily_seasonality=False,
        interval_width=0.80,         # 80% PI for a calmer-looking band
    )
    m.fit(df)

    future = m.make_future_dataframe(periods=horizon_days, freq="D", include_history=False)
    fc = m.predict(future)
    # fc columns of interest: ds, yhat, yhat_lower, yhat_upper,
    #                         trend, weekly, yearly

    # Daily series (returned for the chart's underlying data + festival overlay)
    daily = [
        {
            "date": row.ds.date().isoformat(),
            "yhat":       max(0.0, float(row.yhat)),
            "yhat_lower": max(0.0, float(row.yhat_lower)),
            "yhat_upper": max(0.0, float(row.yhat_upper)),
        }
        for row in fc.itertuples()
    ]

    # Monthly aggregation — sum yhat per month.
    fc["month"] = fc["ds"].dt.to_period("M")
    monthly_df = fc.groupby("month", as_index=False).agg(
        yhat=("yhat", "sum"),
        yhat_lower=("yhat_lower", "sum"),
        yhat_upper=("yhat_upper", "sum"),
    )
    monthly = [
        {
            "month": str(r.month),       # e.g. "2026-07"
            "label": r.month.strftime("%b %Y"),
            "yhat":       max(0.0, float(r.yhat)),
            "yhat_lower": max(0.0, float(r.yhat_lower)),
            "yhat_upper": max(0.0, float(r.yhat_upper)),
        }
        for r in monthly_df.itertuples()
    ]

    # Weekly aggregation — sum yhat per ISO week.
    fc["week_start"] = fc["ds"] - pd.to_timedelta(fc["ds"].dt.dayofweek, unit="D")
    weekly_df = fc.groupby("week_start", as_index=False).agg(
        yhat=("yhat", "sum"),
        yhat_lower=("yhat_lower", "sum"),
        yhat_upper=("yhat_upper", "sum"),
    )
    weekly = [
        {
            "week_start": r.week_start.date().isoformat(),
            "yhat":       max(0.0, float(r.yhat)),
            "yhat_lower": max(0.0, float(r.yhat_lower)),
            "yhat_upper": max(0.0, float(r.yhat_upper)),
        }
        for r in weekly_df.itertuples()
    ]

    # Decomposition — trend + weekly + yearly components separately.
    # `trend` is on the same scale as yhat. `weekly` and `yearly` are the
    # additive contributions Prophet learned.
    decomposition = {
        "trend": [
            {"date": row.ds.date().isoformat(), "value": float(row.trend)}
            for row in fc.itertuples()
        ],
        "weekly": [
            # Show the weekly pattern once — first 7 days are enough.
            {"date": row.ds.date().isoformat(), "value": float(row.weekly)}
            for row in fc.head(7).itertuples()
        ],
        "yearly": [
            # 365 days of the yearly component.
            {"date": row.ds.date().isoformat(), "value": float(row.yearly)}
            for row in fc.head(365).itertuples()
        ],
    }

    # Festivals that fall inside the horizon, with their effective window.
    horizon_end = date.today() + timedelta(days=horizon_days)
    festivals = db.scalars(
        select(Festival)
        .where(Festival.active.is_(True))
        .where(Festival.date >= date.today())
        .where(Festival.date <= horizon_end)
        .order_by(asc(Festival.date))
    ).all()
    festivals_out = [
        {
            "id": f.id,
            "name": f.name,
            "date": f.date.isoformat(),
            "window_start": (f.date - timedelta(days=f.lead_days)).isoformat(),
            "window_end":   (f.date + timedelta(days=f.tail_days)).isoformat(),
            "expected_uplift": f.expected_uplift,
            "notes": f.notes,
        }
        for f in festivals
    ]

    # Plain-English summary.
    summary = _build_summary(product.name, monthly, festivals_out)

    return {
        "sku": sku,
        "name": product.name,
        "category": product.category,
        "horizon_days": horizon_days,
        "history_days": len(df),
        "model": "prophet",
        "daily": daily,
        "weekly": weekly,
        "monthly": monthly,
        "decomposition": decomposition,
        "festivals": festivals_out,
        "summary": summary,
    }


def _build_summary(name: str, monthly: list[dict], festivals: list[dict]) -> str:
    """Two-sentence plain-English description of the seasonal forecast."""
    if not monthly:
        return f"Not enough data to summarise {name}."
    months_sorted = sorted(monthly, key=lambda m: m["yhat"], reverse=True)
    peak = months_sorted[0]
    trough = months_sorted[-1]
    avg = sum(m["yhat"] for m in monthly) / len(monthly)
    peak_pct = ((peak["yhat"] - avg) / avg * 100) if avg > 0 else 0
    trough_pct = ((avg - trough["yhat"]) / avg * 100) if avg > 0 else 0

    sentence_1 = (
        f"{name} peaks in {peak['label']} (+{peak_pct:.0f}% above the yearly "
        f"average) and bottoms out in {trough['label']} (-{trough_pct:.0f}%)."
    )
    if not festivals:
        return sentence_1
    f0 = festivals[0]
    sentence_2 = (
        f" Watch for {f0['name']} on {f0['date']} — expected {((f0['expected_uplift'] - 1) * 100):.0f}% "
        f"uplift over the {f0['window_start']}–{f0['window_end']} window."
    )
    return sentence_1 + sentence_2
