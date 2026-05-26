"""Unit tests for the inventory + backtest cores.

Every test uses hand-checked numbers so a reader can verify them on paper.
No DB, no web — same as the forecasting tests.
"""
from __future__ import annotations

import math
import random

import pytest

from app.core.inventory import (
    BaselinePolicy,
    SystemPolicy,
    decide_reorder,
    economic_order_quantity,
    reorder_point,
    run_backtest,
    safety_stock,
    z_for_service_level,
)
from app.core.inventory.reorder import demand_stats_from_forecast


# ===========================================================================
# Pure formula tests
# ===========================================================================

def test_z_factor_known_values():
    """Standard table values — these are the ones used in the slides."""
    assert math.isclose(z_for_service_level(0.95), 1.6449, abs_tol=1e-3)
    assert math.isclose(z_for_service_level(0.99), 2.3263, abs_tol=1e-3)
    with pytest.raises(ValueError):
        z_for_service_level(0.4)


def test_safety_stock_grows_with_uncertainty():
    """Wider PI -> larger sigma -> larger safety stock (graded test)."""
    ss_narrow = safety_stock(service_level=0.95, demand_std=2.0, lead_time_days=7)
    ss_wide = safety_stock(service_level=0.95, demand_std=8.0, lead_time_days=7)
    assert ss_wide > ss_narrow
    # 4x sigma -> 4x safety stock (linear in sigma).
    assert math.isclose(ss_wide / ss_narrow, 4.0, abs_tol=1e-6)


def test_safety_stock_grows_with_sqrt_lead_time():
    """SS scales with sqrt(L), not L — variance adds, std does not."""
    ss_4 = safety_stock(0.95, 5.0, 4)
    ss_16 = safety_stock(0.95, 5.0, 16)
    assert math.isclose(ss_16 / ss_4, math.sqrt(16 / 4), abs_tol=1e-6)


def test_reorder_point_is_lead_time_demand_plus_safety():
    rop = reorder_point(avg_daily_demand=20, lead_time_days=7, safety_stock_value=30)
    assert rop == 20 * 7 + 30 == 170


def test_eoq_doubles_with_sqrt_two_when_demand_doubles():
    """EOQ ∝ sqrt(D) — doubling demand multiplies EOQ by sqrt(2)."""
    q1 = economic_order_quantity(10, 50, 0.5)
    q2 = economic_order_quantity(20, 50, 0.5)
    assert math.isclose(q2 / q1, math.sqrt(2), abs_tol=1e-9)


def test_eoq_hand_calc():
    """EOQ = sqrt(2 * D * S / H), D = 10/day * 365 = 3650.
       = sqrt(2 * 3650 * 50 / 0.5) = sqrt(730000) ~= 854.4"""
    q = economic_order_quantity(10, 50, 0.5)
    assert math.isclose(q, math.sqrt(2 * 3650 * 50 / 0.5), abs_tol=1e-9)
    assert 850 < q < 860


def test_demand_stats_from_forecast_recovers_mu_and_sigma():
    """Given a constant PI, mu should be the mean and sigma the implied per-day std."""
    yhat = [20.0] * 5
    # half-width 3.92 -> sigma = 3.92 / 1.96 = 2.0
    lo = [16.08] * 5
    hi = [23.92] * 5
    mu, sigma = demand_stats_from_forecast(yhat, lo, hi)
    assert math.isclose(mu, 20.0, abs_tol=1e-6)
    assert math.isclose(sigma, 2.0, abs_tol=1e-3)


# ===========================================================================
# Status decision rule
# ===========================================================================

def _decide(current_stock: int, yhat=30.0, lo=24.0, hi=36.0, lt=7):
    """Convenience wrapper that fixes a realistic forecast + product setup."""
    return decide_reorder(
        sku="X1",
        yhat_lead_window=[yhat] * lt,
        yhat_lower_lead=[lo] * lt,
        yhat_upper_lead=[hi] * lt,
        lead_time_days=lt,
        current_stock=current_stock,
        ordering_cost=50.0,
        holding_cost_per_unit_per_year=2.0,
        service_level=0.95,
    )


def test_status_stockout_risk_below_lead_time_demand():
    """Spec rule: stock <= avg_daily * lead_time -> STOCKOUT_RISK."""
    # avg=30, L=7 -> lead-time demand = 210. Stock 100 < 210.
    d = _decide(current_stock=100)
    assert d.status == "STOCKOUT_RISK"
    assert d.recommended_order_qty > 0


def test_status_reorder_now_between_lead_time_demand_and_rop():
    """Above lead-time demand but at/below ROP -> REORDER_NOW.

    With yhat=30, lt=7 -> lead-time demand = 210. With the (24, 36) PI
    sigma_per_day ~= 3.06, so safety stock ~= 13 and ROP ~= 223. We pick
    stock = 215 to land cleanly inside the REORDER_NOW band.
    """
    d = _decide(current_stock=215)
    assert d.current_stock > d.lead_time_demand
    assert d.current_stock <= d.reorder_point
    assert d.status == "REORDER_NOW"
    assert d.recommended_order_qty == pytest.approx(d.eoq)


def test_status_healthy_between_rop_and_overstock_threshold():
    d = _decide(current_stock=400)
    assert d.reorder_point < d.current_stock <= d.overstock_threshold
    assert d.status == "HEALTHY"
    assert d.recommended_order_qty == 0


def test_status_overstock_above_threshold():
    d = _decide(current_stock=99_999)
    assert d.current_stock > d.overstock_threshold
    assert d.status == "OVERSTOCK"
    assert d.recommended_order_qty == 0


def test_explanation_mentions_key_numbers():
    d = _decide(current_stock=100)   # STOCKOUT_RISK
    assert "lead time" in d.explanation
    assert str(round(d.lead_time_demand)) in d.explanation or "210" in d.explanation
    assert f"{round(d.eoq)}" in d.explanation


# ===========================================================================
# Backtest
# ===========================================================================

def _steady_demand(days: int, daily: int = 10, seed: int = 0) -> list[int]:
    rng = random.Random(seed)
    return [max(0, daily + rng.randint(-2, 2)) for _ in range(days)]


def test_backtest_returns_sane_comparison_numbers():
    demand = _steady_demand(90, daily=10)
    base = BaselinePolicy(low_threshold=5, order_qty=30)   # too-tight buffer
    sysm = SystemPolicy(reorder_point=80, order_qty=70, overstock_threshold=200)

    result = run_backtest(
        sku="X1",
        demand=demand,
        initial_stock=100,
        lead_time_days=5,
        holding_cost_per_unit_per_year=2.0,
        baseline=base,
        system=sysm,
    )

    # Sanity: both policies see the same total demand.
    assert result.baseline.units_demanded == result.system.units_demanded == sum(demand)
    # System policy with a healthy ROP should not have MORE stockouts than the
    # naive baseline-with-tight-threshold.
    assert result.system.stockout_days <= result.baseline.stockout_days
    # Service rate is in [0, 1].
    for m in (result.baseline, result.system):
        assert 0.0 <= m.service_rate <= 1.0
        # Holding cost is non-negative and finite.
        assert m.total_holding_cost >= 0 and math.isfinite(m.total_holding_cost)
    # Summary string mentions both policies' numbers.
    assert "stockout days" in result.summary
    assert str(result.baseline.stockout_days) in result.summary
    assert str(result.system.stockout_days) in result.summary


def test_backtest_system_beats_pathological_baseline_on_stockouts():
    """With a baseline that never orders enough, the system policy must win
    on stockouts. Hand-set numbers to make the gap unambiguous."""
    demand = [10] * 60
    # Baseline orders only 20 units whenever stock <= 3 — guaranteed to lag.
    base = BaselinePolicy(low_threshold=3, order_qty=20)
    # System: ROP = 70 (= 10/day * 5d lead + 20 safety), order EOQ 100.
    sysm = SystemPolicy(reorder_point=70, order_qty=100, overstock_threshold=300)

    result = run_backtest(
        sku="X2",
        demand=demand,
        initial_stock=50,
        lead_time_days=5,
        holding_cost_per_unit_per_year=2.0,
        baseline=base,
        system=sysm,
    )
    assert result.system.stockout_days < result.baseline.stockout_days
    assert result.stockout_days_reduction > 0
    assert result.system.service_rate > result.baseline.service_rate


def test_backtest_empty_demand_raises():
    with pytest.raises(ValueError):
        run_backtest(
            sku="X",
            demand=[],
            initial_stock=10,
            lead_time_days=3,
            holding_cost_per_unit_per_year=1.0,
            baseline=BaselinePolicy(5, 10),
            system=SystemPolicy(10, 20, 50),
        )
