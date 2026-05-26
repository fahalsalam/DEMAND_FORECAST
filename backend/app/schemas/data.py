"""Pydantic v2 schemas for the data layer.

Kept thin and free of ORM coupling: the API hands these out, the frontend
mirrors them as TS types.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class InventoryRow(BaseModel):
    """Joined inventory + product row for the browse table."""
    sku: str
    name: str
    category: str
    store_id: str
    on_hand: int
    unit_cost: float
    stock_value: float            # on_hand * unit_cost
    updated_at: datetime


class SalesDayPoint(BaseModel):
    date: date
    quantity: int
    promo: bool = False


class SkuSalesSummary(BaseModel):
    sku: str
    name: str
    category: str
    days_available: int
    total_units: int
    avg_daily: float
    last_30d_units: int
    last_sale_date: date | None
    daily: list[SalesDayPoint]   # last N days for the sparkline


# ---------- shared ----------
class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- products ----------
class ProductOut(ORMBase):
    sku: str
    name: str
    category: str
    unit_cost: float
    lead_time_days: int
    ordering_cost: float
    holding_cost_per_unit: float
    supplier: str | None = None


# ---------- inventory ----------
class InventoryOut(ORMBase):
    sku: str
    store_id: str
    on_hand: int
    updated_at: datetime


# ---------- /data/skus ----------
class SkuSummary(BaseModel):
    """Per-SKU summary for the dashboard's status grid (joins master + inventory)."""

    sku: str
    name: str
    category: str
    unit_cost: float
    lead_time_days: int
    on_hand: int | None = None              # None if no inventory row yet
    sales_days_available: int = 0           # used to flag cold-start candidates
    cold_start: bool = False                # convenience: sales_days_available < 60


# ---------- upload responses ----------
UploadKind = Literal["sales", "products", "inventory"]


class UploadResult(BaseModel):
    kind: UploadKind
    rows_received: int = Field(..., description="Rows parsed from the CSV")
    rows_written: int = Field(..., description="Rows committed to the database")
    rows_skipped: int = 0
    warnings: list[str] = Field(default_factory=list)


class UploadError(BaseModel):
    """Structured 400 body returned when validation fails."""

    kind: UploadKind
    message: str
    missing_columns: list[str] = Field(default_factory=list)
    invalid_rows: list[dict] = Field(default_factory=list)
