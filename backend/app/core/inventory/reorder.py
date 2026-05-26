"""Inventory reorder math — PURE functions.

This module is the *headline academic contribution*. Every formula is
commented with what the terms mean so it reads in the viva and on the slides.

Inputs: plain numbers / sequences. Outputs: plain dataclasses.
Zero coupling to FastAPI, SQLAlchemy, or the rest of the app.

The reorder pipeline used downstream is:

    forecast -> avg_daily_demand + demand_std
             -> safety_stock = Z(SL) * sigma * sqrt(L)
             -> reorder_point = mu_L + safety_stock
             -> EOQ           = sqrt(2 D S / H)
             -> status decision rule (4 buckets)
             -> explanation string

Where mu_L is the expected demand over the lead-time L, sigma is the implied
per-day demand standard deviation, SL is the target service level (0.95 etc),
D is annual demand, S is fixed ordering cost per order, H is annual holding
cost per unit. The full derivation is in any Nahmias / Silver-Pyke text.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal, Sequence

from scipy.stats import norm

# The prediction interval emitted by the forecasting core is 95% two-sided,
# so half-width = z * sigma  with  z = 1.96. We use this to *back out* sigma.
PI_Z = 1.96

# Overstock threshold: stock above (ROP + EOQ * this) is flagged OVERSTOCK.
# Tunable per the spec; 1.5 is the conservative default.
DEFAULT_OVERSTOCK_MULTIPLIER = 1.5

# Days per year for the EOQ annualization step.
DAYS_PER_YEAR = 365

ReorderStatus = Literal[
    "HEALTHY",
    "REORDER_NOW",
    "OVERSTOCK",
    "STOCKOUT_RISK",
]


# ---------------------------------------------------------------------------
# 1. Service-level Z factor
# ---------------------------------------------------------------------------
def z_for_service_level(service_level: float) -> float:
    """Inverse standard normal at the cumulative probability `service_level`.

    Example:
        z_for_service_level(0.95) ~= 1.6449
        z_for_service_level(0.99) ~= 2.3263

    Interpretation: holding `Z * sigma * sqrt(L)` extra units protects you
    against demand exceeding the mean during the lead time with probability
    `service_level`.
    """
    if not 0.5 < service_level < 1.0:
        raise ValueError(
            f"service_level must be in (0.5, 1.0), got {service_level}"
        )
    return float(norm.ppf(service_level))


# ---------------------------------------------------------------------------
# 2. Demand statistics over the lead-time window
# ---------------------------------------------------------------------------
def demand_stats_from_forecast(
    yhat: Sequence[float],
    yhat_lower: Sequence[float],
    yhat_upper: Sequence[float],
    *,
    pi_z: float = PI_Z,
) -> tuple[float, float]:
    """Convert a per-day forecast + 95% PI into (avg_daily_demand, demand_std).

    - avg_daily_demand  = mean(yhat)                       # expected per-day demand
    - per-day sigma     = mean((upper - lower) / (2 * z))  # back out the per-day std
                                                           # from the symmetric PI

    Why the average across the lead-time window? Each forecast point has its
    own PI; the safety-stock formula assumes a single sigma_per_day applied
    across L days. Averaging the per-day implied sigma is the standard
    pragmatic choice (Silver-Pyke 3.5).
    """
    n = len(yhat)
    if n == 0:
        return 0.0, 0.0
    if not (len(yhat_lower) == n == len(yhat_upper)):
        raise ValueError("yhat, yhat_lower, yhat_upper must be equal-length.")

    mu = sum(yhat) / n
    sigma_per_day_values = [
        max(0.0, (u - l) / (2.0 * pi_z)) for l, u in zip(yhat_lower, yhat_upper)
    ]
    sigma_per_day = sum(sigma_per_day_values) / n
    return float(mu), float(sigma_per_day)


# ---------------------------------------------------------------------------
# 3. Safety stock, reorder point, EOQ
# ---------------------------------------------------------------------------
def safety_stock(service_level: float, demand_std: float, lead_time_days: int) -> float:
    """Buffer stock that protects against demand variability during the lead time.

        SS = Z(service_level) * sigma * sqrt(L)

    - Z(SL)            : how many standard deviations of cover we want
    - sigma            : per-day demand std deviation
    - sqrt(L)          : std of the *sum* of L i.i.d. daily demands scales
                         with sqrt(L), not L (variance adds; std doesn't)
    """
    if lead_time_days < 0 or demand_std < 0:
        raise ValueError("lead_time_days and demand_std must be non-negative.")
    z = z_for_service_level(service_level)
    return max(0.0, z * demand_std * math.sqrt(lead_time_days))


def reorder_point(
    avg_daily_demand: float,
    lead_time_days: int,
    safety_stock_value: float,
) -> float:
    """Stock level at which a new order should be placed.

        ROP = (mu_per_day * L) + SS

    Below this you risk stocking out before the next shipment arrives.
    """
    if avg_daily_demand < 0:
        raise ValueError("avg_daily_demand must be non-negative.")
    return float(avg_daily_demand * lead_time_days + safety_stock_value)


def economic_order_quantity(
    avg_daily_demand: float,
    ordering_cost: float,
    holding_cost_per_unit_per_year: float,
) -> float:
    """Order quantity that minimizes the total of ordering + holding cost.

        EOQ = sqrt( (2 * D * S) / H )

    - D : annual demand (= mu_per_day * 365)
    - S : fixed cost per purchase order
    - H : annual holding cost per unit

    Derivation: differentiate total annual cost wrt Q, set to zero.
    """
    if ordering_cost < 0 or holding_cost_per_unit_per_year <= 0:
        # H must be strictly positive — otherwise EOQ is undefined (divide by 0).
        raise ValueError("ordering_cost >= 0 and holding_cost > 0 required.")
    annual_demand = max(0.0, avg_daily_demand * DAYS_PER_YEAR)
    return math.sqrt(2.0 * annual_demand * ordering_cost / holding_cost_per_unit_per_year)


# ---------------------------------------------------------------------------
# 4. Decision result + status rule + explanation string
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ReorderResult:
    sku: str
    avg_daily_demand: float
    demand_std: float
    safety_stock: float
    reorder_point: float
    eoq: float
    current_stock: int
    status: ReorderStatus
    recommended_order_qty: float
    explanation: str
    # Diagnostics — handy for the dashboard / debugging
    lead_time_demand: float = 0.0
    overstock_threshold: float = 0.0
    service_level: float = 0.95
    inputs: dict = field(default_factory=dict)


def _status_and_qty(
    current_stock: int,
    lead_time_demand: float,
    rop: float,
    eoq: float,
    overstock_threshold: float,
) -> tuple[ReorderStatus, float]:
    """The four-bucket decision rule (PROJECT_SPEC section 6)."""
    if current_stock <= lead_time_demand:
        # We'll run out before the next order can possibly arrive.
        return "STOCKOUT_RISK", float(eoq)
    if current_stock <= rop:
        return "REORDER_NOW", float(eoq)
    if current_stock > overstock_threshold:
        return "OVERSTOCK", 0.0
    return "HEALTHY", 0.0


def _explain(
    status: ReorderStatus,
    *,
    lead_time_days: int,
    lead_time_demand: float,
    band_half_width: float,
    current_stock: int,
    rop: float,
    eoq: float,
    overstock_threshold: float,
) -> str:
    """Build the human-readable reasoning string shown in the alerts table."""
    demand_str = f"{lead_time_demand:.0f} ± {band_half_width:.0f}"
    base = (
        f"Forecast demand over the {lead_time_days}-day lead time is "
        f"{demand_str} units. Current stock is {current_stock}"
    )
    if status == "STOCKOUT_RISK":
        return (
            f"{base} — below the lead-time demand of {lead_time_demand:.0f}. "
            f"Will likely stock out before a fresh order can arrive. "
            f"Place a {eoq:.0f}-unit order (EOQ) immediately."
        )
    if status == "REORDER_NOW":
        return (
            f"{base}, below the reorder point of {rop:.0f}. "
            f"Recommend ordering {eoq:.0f} units (EOQ)."
        )
    if status == "OVERSTOCK":
        excess = current_stock - overstock_threshold
        return (
            f"{base}, above the overstock threshold of {overstock_threshold:.0f} "
            f"(~{excess:.0f} units excess). Hold off on new orders and consider "
            f"a promotion to draw stock down."
        )
    return (
        f"{base}, comfortably above the reorder point of {rop:.0f} "
        f"and below the overstock threshold of {overstock_threshold:.0f}. "
        f"No action needed."
    )


def decide_reorder(
    *,
    sku: str,
    yhat_lead_window: Sequence[float],
    yhat_lower_lead: Sequence[float],
    yhat_upper_lead: Sequence[float],
    lead_time_days: int,
    current_stock: int,
    ordering_cost: float,
    holding_cost_per_unit_per_year: float,
    service_level: float = 0.95,
    overstock_multiplier: float = DEFAULT_OVERSTOCK_MULTIPLIER,
) -> ReorderResult:
    """End-to-end: forecast slice + product params -> ReorderResult.

    `yhat_lead_window` and the two band sequences must cover exactly the
    `lead_time_days` forecast points (the orchestrator slices these out).
    """
    if lead_time_days <= 0:
        raise ValueError("lead_time_days must be > 0.")

    avg_daily, sigma_per_day = demand_stats_from_forecast(
        yhat_lead_window, yhat_lower_lead, yhat_upper_lead
    )

    ss = safety_stock(service_level, sigma_per_day, lead_time_days)
    rop = reorder_point(avg_daily, lead_time_days, ss)
    eoq_q = economic_order_quantity(
        avg_daily, ordering_cost, holding_cost_per_unit_per_year
    )

    lead_time_demand = avg_daily * lead_time_days
    overstock_threshold = rop + eoq_q * overstock_multiplier

    status, rec_qty = _status_and_qty(
        current_stock, lead_time_demand, rop, eoq_q, overstock_threshold
    )

    # Half-width of the realized lead-time demand for the explanation string.
    band_half_width = sigma_per_day * math.sqrt(lead_time_days) * PI_Z

    explanation = _explain(
        status,
        lead_time_days=lead_time_days,
        lead_time_demand=lead_time_demand,
        band_half_width=band_half_width,
        current_stock=current_stock,
        rop=rop,
        eoq=eoq_q,
        overstock_threshold=overstock_threshold,
    )

    return ReorderResult(
        sku=sku,
        avg_daily_demand=avg_daily,
        demand_std=sigma_per_day,
        safety_stock=ss,
        reorder_point=rop,
        eoq=eoq_q,
        current_stock=current_stock,
        status=status,
        recommended_order_qty=rec_qty,
        explanation=explanation,
        lead_time_demand=lead_time_demand,
        overstock_threshold=overstock_threshold,
        service_level=service_level,
        inputs={
            "lead_time_days": lead_time_days,
            "ordering_cost": ordering_cost,
            "holding_cost_per_unit_per_year": holding_cost_per_unit_per_year,
            "overstock_multiplier": overstock_multiplier,
        },
    )
