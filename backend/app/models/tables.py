"""ORM models — mirror PROJECT_SPEC section 4 exactly.

Keep columns/types stable; downstream Pydantic schemas and the forecasting
pipeline pull straight from these.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------- product_master ----------
class ProductMaster(Base):
    __tablename__ = "product_master"

    sku: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False, index=True)
    unit_cost: Mapped[float] = mapped_column(Float, nullable=False)
    lead_time_days: Mapped[int] = mapped_column(Integer, nullable=False)
    ordering_cost: Mapped[float] = mapped_column(Float, nullable=False)
    holding_cost_per_unit: Mapped[float] = mapped_column(Float, nullable=False)
    supplier: Mapped[str | None] = mapped_column(String, nullable=True)

    sales: Mapped[list["SalesHistory"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    inventory: Mapped[list["CurrentInventory"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


# ---------- sales_history ----------
class SalesHistory(Base):
    __tablename__ = "sales_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sku: Mapped[str] = mapped_column(
        String, ForeignKey("product_master.sku", ondelete="CASCADE"), index=True
    )
    store_id: Mapped[str] = mapped_column(String, index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    promo_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    product: Mapped["ProductMaster"] = relationship(back_populates="sales")

    __table_args__ = (
        Index("ix_sales_sku_date", "sku", "date"),
    )


# ---------- current_inventory ----------
class CurrentInventory(Base):
    __tablename__ = "current_inventory"

    # Composite PK isn't in the spec, but real retailers track stock per store.
    # The spec's PK is (sku); we keep that and treat store_id as descriptive.
    sku: Mapped[str] = mapped_column(
        String, ForeignKey("product_master.sku", ondelete="CASCADE"), primary_key=True
    )
    store_id: Mapped[str] = mapped_column(String, nullable=False)
    on_hand: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    product: Mapped["ProductMaster"] = relationship(back_populates="inventory")


# ---------- forecast_jobs ----------
class ForecastJob(Base):
    __tablename__ = "forecast_jobs"

    job_id: Mapped[str] = mapped_column(String, primary_key=True)
    status: Mapped[str] = mapped_column(String, nullable=False)  # running|complete|failed
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    service_level: Mapped[float] = mapped_column(Float, nullable=False, default=0.95)
    message: Mapped[str | None] = mapped_column(String, nullable=True)


# ---------- forecast_results ----------
class ForecastResult(Base):
    __tablename__ = "forecast_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(
        String, ForeignKey("forecast_jobs.job_id", ondelete="CASCADE"), index=True
    )
    sku: Mapped[str] = mapped_column(String, index=True)
    forecast_date: Mapped[date] = mapped_column(Date, nullable=False)
    yhat: Mapped[float] = mapped_column(Float, nullable=False)
    yhat_lower: Mapped[float] = mapped_column(Float, nullable=False)
    yhat_upper: Mapped[float] = mapped_column(Float, nullable=False)
    chosen_model: Mapped[str] = mapped_column(String, nullable=False)
    model_mape: Mapped[float] = mapped_column(Float, nullable=False)

    __table_args__ = (
        Index("ix_forecast_job_sku_date", "job_id", "sku", "forecast_date"),
    )


# ---------- reorder_decisions ----------
class ReorderDecision(Base):
    __tablename__ = "reorder_decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(
        String, ForeignKey("forecast_jobs.job_id", ondelete="CASCADE"), index=True
    )
    sku: Mapped[str] = mapped_column(String, index=True)
    avg_daily_demand: Mapped[float] = mapped_column(Float, nullable=False)
    demand_std: Mapped[float] = mapped_column(Float, nullable=False)
    safety_stock: Mapped[float] = mapped_column(Float, nullable=False)
    reorder_point: Mapped[float] = mapped_column(Float, nullable=False)
    eoq: Mapped[float] = mapped_column(Float, nullable=False)
    current_stock: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, index=True)
    recommended_order_qty: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    explanation: Mapped[str] = mapped_column(String, nullable=False)
