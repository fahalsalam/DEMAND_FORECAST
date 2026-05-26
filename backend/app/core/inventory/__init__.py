"""Inventory decision core — pure Python, NO FastAPI/DB imports.

Public surface:
  - reorder.decide_reorder(...) -> ReorderResult
  - backtest.run_backtest(...)  -> BacktestComparison
"""
from app.core.inventory.backtest import (
    BacktestComparison,
    BaselinePolicy,
    PolicyMetrics,
    SystemPolicy,
    run_backtest,
)
from app.core.inventory.reorder import (
    ReorderResult,
    ReorderStatus,
    decide_reorder,
    demand_stats_from_forecast,
    economic_order_quantity,
    reorder_point,
    safety_stock,
    z_for_service_level,
)

__all__ = [
    "BacktestComparison",
    "BaselinePolicy",
    "PolicyMetrics",
    "ReorderResult",
    "ReorderStatus",
    "SystemPolicy",
    "decide_reorder",
    "demand_stats_from_forecast",
    "economic_order_quantity",
    "reorder_point",
    "run_backtest",
    "safety_stock",
    "z_for_service_level",
]
