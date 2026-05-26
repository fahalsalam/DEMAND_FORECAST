"""Day-by-day backtest comparing a baseline reorder policy against this
system's policy on the SAME historical demand stream.

This produces the "proof it works" numbers for the evaluation slide.

Simulation model (kept deliberately simple — every assumption is explicit):

  - We start each policy with the same `initial_stock`.
  - Each day, in order:
        1. Receive any orders whose `arrival_day` is today.
        2. Try to sell that day's `actual_demand`. Whatever can't be
           filled from on-hand counts as a STOCKOUT for that day.
        3. Apply the policy's reorder rule. If it fires, queue an order
           that arrives `lead_time_days` later (no partial deliveries,
           no supplier outages — kept simple on purpose).
  - At the end, snapshot the daily on-hand series and compute metrics.

Metrics tracked per policy:
  - stockout_days     : days where demand exceeded available stock
  - units_lost        : total units of unmet demand
  - service_rate      : 1 - units_lost / units_demanded
  - avg_inventory     : mean on-hand across the holdout
  - total_holding_cost: sum(on_hand * holding_per_unit_per_day) across days
                        (holding_per_unit_per_year / 365 is the daily rate)
  - overstock_unit_days: sum( max(0, on_hand - overstock_threshold) )
                          summed over days — i.e. excess unit-days carried

Both policies see the same real demand series, so the comparison is fair.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Sequence

from app.core.inventory.reorder import DAYS_PER_YEAR


# ---------------------------------------------------------------------------
# Policy specs
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class BaselinePolicy:
    """Naive retailer rule: order a fixed quantity when stock hits a low threshold."""
    low_threshold: float
    order_qty: float
    name: str = "baseline"


@dataclass(frozen=True)
class SystemPolicy:
    """Our system's rule: order EOQ when stock crosses the reorder point."""
    reorder_point: float
    order_qty: float
    overstock_threshold: float
    name: str = "system"


Policy = BaselinePolicy | SystemPolicy


# ---------------------------------------------------------------------------
# Per-policy result
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class PolicyMetrics:
    name: str
    stockout_days: int
    units_lost: int
    units_demanded: int
    service_rate: float          # 1 - units_lost / units_demanded
    avg_inventory: float
    total_holding_cost: float
    overstock_unit_days: float
    orders_placed: int
    daily_on_hand: list[int] = field(default_factory=list)


@dataclass(frozen=True)
class BacktestComparison:
    """The headline numbers for the dashboard's Backtest chart."""
    sku: str
    horizon_days: int
    baseline: PolicyMetrics
    system: PolicyMetrics
    stockout_days_reduction: int          # baseline - system  (positive is better)
    avg_inventory_reduction: float
    holding_cost_savings: float
    summary: str


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------
def _simulate(
    *,
    policy: Policy,
    demand: Sequence[int],
    initial_stock: int,
    lead_time_days: int,
    holding_cost_per_unit_per_year: float,
) -> PolicyMetrics:
    """Run one policy over the full demand stream."""
    holding_per_day = holding_cost_per_unit_per_year / DAYS_PER_YEAR

    on_hand = int(initial_stock)
    pending = deque()  # entries: (day_index_when_it_arrives, qty)

    stockout_days = 0
    units_lost = 0
    units_demanded = 0
    orders_placed = 0
    daily_on_hand: list[int] = []
    holding_cost_total = 0.0
    overstock_unit_days = 0.0
    overstock_threshold = (
        getattr(policy, "overstock_threshold", None) or float("inf")
    )

    for day, d in enumerate(demand):
        # 1. Receive any orders due today.
        while pending and pending[0][0] == day:
            _, qty = pending.popleft()
            on_hand += int(qty)

        # 2. Serve demand (may go short).
        units_demanded += int(d)
        sold = min(on_hand, int(d))
        on_hand -= sold
        if d > sold:
            stockout_days += 1
            units_lost += int(d - sold)

        # 3. Apply policy rule.
        order_qty = _policy_decide(policy, on_hand_after_sale=on_hand)
        if order_qty > 0:
            pending.append((day + lead_time_days, int(order_qty)))
            orders_placed += 1

        # Daily accounting (use *end-of-day* on-hand).
        daily_on_hand.append(on_hand)
        holding_cost_total += on_hand * holding_per_day
        if on_hand > overstock_threshold:
            overstock_unit_days += on_hand - overstock_threshold

    avg_inv = sum(daily_on_hand) / len(daily_on_hand) if daily_on_hand else 0.0
    service_rate = (
        1.0 - units_lost / units_demanded if units_demanded > 0 else 1.0
    )

    return PolicyMetrics(
        name=policy.name,
        stockout_days=stockout_days,
        units_lost=units_lost,
        units_demanded=units_demanded,
        service_rate=service_rate,
        avg_inventory=avg_inv,
        total_holding_cost=holding_cost_total,
        overstock_unit_days=overstock_unit_days,
        orders_placed=orders_placed,
        daily_on_hand=daily_on_hand,
    )


def _policy_decide(policy: Policy, *, on_hand_after_sale: int) -> float:
    """Return the qty to order today (0 = no order)."""
    if isinstance(policy, BaselinePolicy):
        if on_hand_after_sale <= policy.low_threshold:
            return policy.order_qty
        return 0.0
    # SystemPolicy
    if on_hand_after_sale <= policy.reorder_point:
        return policy.order_qty
    return 0.0


# ---------------------------------------------------------------------------
# Top-level convenience: run both, return comparison
# ---------------------------------------------------------------------------
def run_backtest(
    *,
    sku: str,
    demand: Sequence[int],
    initial_stock: int,
    lead_time_days: int,
    holding_cost_per_unit_per_year: float,
    baseline: BaselinePolicy,
    system: SystemPolicy,
) -> BacktestComparison:
    """Run both policies on the same demand stream and return the comparison."""
    if lead_time_days < 0:
        raise ValueError("lead_time_days must be >= 0.")
    if not demand:
        raise ValueError("demand must be non-empty.")

    base = _simulate(
        policy=baseline,
        demand=demand,
        initial_stock=initial_stock,
        lead_time_days=lead_time_days,
        holding_cost_per_unit_per_year=holding_cost_per_unit_per_year,
    )
    sysm = _simulate(
        policy=system,
        demand=demand,
        initial_stock=initial_stock,
        lead_time_days=lead_time_days,
        holding_cost_per_unit_per_year=holding_cost_per_unit_per_year,
    )

    stockout_delta = base.stockout_days - sysm.stockout_days
    inv_delta = base.avg_inventory - sysm.avg_inventory
    cost_delta = base.total_holding_cost - sysm.total_holding_cost

    summary = (
        f"Over {len(demand)} days: stockout days "
        f"{base.stockout_days} → {sysm.stockout_days} "
        f"({stockout_delta:+d}); avg inventory "
        f"{base.avg_inventory:.0f} → {sysm.avg_inventory:.0f} "
        f"({-inv_delta:+.0f}); holding cost "
        f"{base.total_holding_cost:.2f} → {sysm.total_holding_cost:.2f}."
    )

    return BacktestComparison(
        sku=sku,
        horizon_days=len(demand),
        baseline=base,
        system=sysm,
        stockout_days_reduction=stockout_delta,
        avg_inventory_reduction=inv_delta,
        holding_cost_savings=cost_delta,
        summary=summary,
    )
