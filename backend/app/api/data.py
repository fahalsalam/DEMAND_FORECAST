"""Data layer endpoints — CSV uploads, SKU listing.

Validation strategy:
  - Required columns must be present (otherwise 400 with `missing_columns`).
  - Dates must be parseable; quantities must be non-negative integers;
    numeric fields must be parseable. Bad rows are collected and returned
    in `invalid_rows` with the row number + reason. We reject the WHOLE
    file on any validation failure — partial loads create silent data bugs.
  - Sales is APPEND. Products + inventory are UPSERT keyed on sku
    (real retailers re-upload these regularly).
"""
from __future__ import annotations

import io
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    CurrentInventory,
    ProductMaster,
    SalesHistory,
)
from app.schemas import (
    InventoryRow,
    ProductOut,
    SalesDayPoint,
    SkuSalesSummary,
    SkuSummary,
    UploadError,
    UploadKind,
    UploadResult,
)

router = APIRouter(prefix="/data", tags=["data"])


# ---------- helpers ---------------------------------------------------------
SALES_REQUIRED = {"sku", "store_id", "date", "quantity"}
SALES_OPTIONAL = {"price", "promo_flag"}

PRODUCT_REQUIRED = {
    "sku",
    "name",
    "category",
    "unit_cost",
    "lead_time_days",
    "ordering_cost",
    "holding_cost_per_unit",
}
PRODUCT_OPTIONAL = {"supplier"}

INVENTORY_REQUIRED = {"sku", "store_id", "on_hand"}


def _read_csv(file: UploadFile, kind: UploadKind) -> pd.DataFrame:
    """Parse the upload into a DataFrame; raise 400 on parse failure."""
    try:
        raw = file.file.read()
    finally:
        file.file.close()
    if not raw:
        _fail(kind, "Empty file.")
    try:
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as exc:  # pandas raises ParserError, UnicodeDecodeError, etc.
        _fail(kind, f"Could not parse CSV: {exc}")
    df.columns = [c.strip().lower() for c in df.columns]
    return df


def _fail(
    kind: UploadKind,
    message: str,
    *,
    missing: list[str] | None = None,
    invalid: list[dict] | None = None,
) -> None:
    payload = UploadError(
        kind=kind,
        message=message,
        missing_columns=missing or [],
        invalid_rows=invalid or [],
    )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=payload.model_dump(),
    )


def _require_columns(df: pd.DataFrame, required: set[str], kind: UploadKind) -> None:
    missing = sorted(required - set(df.columns))
    if missing:
        _fail(
            kind,
            f"Missing required column(s): {', '.join(missing)}",
            missing=missing,
        )


def _row_error(row_num: int, reason: str, row: pd.Series) -> dict:
    # Pandas Series may contain Timestamp / NaN — coerce to plain str for JSON.
    return {
        "row": row_num,
        "reason": reason,
        "values": {k: (None if pd.isna(v) else str(v)) for k, v in row.items()},
    }


# ---------- POST /data/upload/sales ----------------------------------------
@router.post("/upload/sales", response_model=UploadResult)
def upload_sales(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> UploadResult:
    df = _read_csv(file, "sales")
    _require_columns(df, SALES_REQUIRED, "sales")

    invalid: list[dict] = []
    parsed_rows: list[dict] = []

    for i, row in df.iterrows():
        row_num = int(i) + 2  # +1 for header, +1 to be 1-indexed

        # date
        try:
            d = pd.to_datetime(row["date"], errors="raise").date()
        except Exception:
            invalid.append(_row_error(row_num, "Unparseable date", row))
            continue

        # quantity
        try:
            qty = int(row["quantity"])
        except (TypeError, ValueError):
            invalid.append(_row_error(row_num, "Quantity is not an integer", row))
            continue
        if qty < 0:
            invalid.append(_row_error(row_num, "Negative quantity", row))
            continue

        # price (optional)
        price = row.get("price")
        if price is not None and not pd.isna(price):
            try:
                price = float(price)
            except (TypeError, ValueError):
                invalid.append(_row_error(row_num, "Price is not numeric", row))
                continue
        else:
            price = None

        # promo_flag (optional)
        promo_raw = row.get("promo_flag")
        if promo_raw is None or pd.isna(promo_raw):
            promo = False
        elif isinstance(promo_raw, bool):
            promo = promo_raw
        else:
            promo = str(promo_raw).strip().lower() in {"1", "true", "yes", "y", "t"}

        parsed_rows.append(
            {
                "sku": str(row["sku"]).strip(),
                "store_id": str(row["store_id"]).strip(),
                "date": d,
                "quantity": qty,
                "price": price,
                "promo_flag": promo,
            }
        )

    if invalid:
        _fail(
            "sales",
            f"{len(invalid)} row(s) failed validation.",
            invalid=invalid[:50],  # cap response payload size
        )

    # Bulk insert — append semantics.
    db.bulk_insert_mappings(SalesHistory, parsed_rows)
    db.commit()

    return UploadResult(
        kind="sales",
        rows_received=len(df),
        rows_written=len(parsed_rows),
    )


# ---------- POST /data/upload/products -------------------------------------
@router.post("/upload/products", response_model=UploadResult)
def upload_products(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> UploadResult:
    df = _read_csv(file, "products")
    _require_columns(df, PRODUCT_REQUIRED, "products")

    invalid: list[dict] = []
    parsed: list[dict] = []

    for i, row in df.iterrows():
        row_num = int(i) + 2
        try:
            unit_cost = float(row["unit_cost"])
            ordering_cost = float(row["ordering_cost"])
            holding_cost = float(row["holding_cost_per_unit"])
            lead_time = int(row["lead_time_days"])
        except (TypeError, ValueError):
            invalid.append(_row_error(row_num, "Non-numeric cost or lead time", row))
            continue
        if unit_cost < 0 or ordering_cost < 0 or holding_cost < 0 or lead_time < 0:
            invalid.append(_row_error(row_num, "Negative cost or lead time", row))
            continue

        supplier = row.get("supplier")
        if supplier is None or pd.isna(supplier):
            supplier = None
        else:
            supplier = str(supplier).strip() or None

        parsed.append(
            {
                "sku": str(row["sku"]).strip(),
                "name": str(row["name"]).strip(),
                "category": str(row["category"]).strip(),
                "unit_cost": unit_cost,
                "lead_time_days": lead_time,
                "ordering_cost": ordering_cost,
                "holding_cost_per_unit": holding_cost,
                "supplier": supplier,
            }
        )

    if invalid:
        _fail(
            "products",
            f"{len(invalid)} row(s) failed validation.",
            invalid=invalid[:50],
        )

    # Upsert: insert new, update existing. Keep it ORM-portable.
    written = 0
    for r in parsed:
        existing = db.get(ProductMaster, r["sku"])
        if existing:
            for k, v in r.items():
                setattr(existing, k, v)
        else:
            db.add(ProductMaster(**r))
        written += 1
    db.commit()

    return UploadResult(
        kind="products", rows_received=len(df), rows_written=written
    )


# ---------- POST /data/upload/inventory ------------------------------------
@router.post("/upload/inventory", response_model=UploadResult)
def upload_inventory(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> UploadResult:
    df = _read_csv(file, "inventory")
    _require_columns(df, INVENTORY_REQUIRED, "inventory")

    invalid: list[dict] = []
    parsed: list[dict] = []

    for i, row in df.iterrows():
        row_num = int(i) + 2
        try:
            on_hand = int(row["on_hand"])
        except (TypeError, ValueError):
            invalid.append(_row_error(row_num, "on_hand is not an integer", row))
            continue
        if on_hand < 0:
            invalid.append(_row_error(row_num, "Negative on_hand", row))
            continue
        parsed.append(
            {
                "sku": str(row["sku"]).strip(),
                "store_id": str(row["store_id"]).strip(),
                "on_hand": on_hand,
            }
        )

    if invalid:
        _fail(
            "inventory",
            f"{len(invalid)} row(s) failed validation.",
            invalid=invalid[:50],
        )

    now = datetime.now(timezone.utc)
    written = 0
    for r in parsed:
        existing = db.get(CurrentInventory, r["sku"])
        if existing:
            existing.store_id = r["store_id"]
            existing.on_hand = r["on_hand"]
            existing.updated_at = now
        else:
            db.add(CurrentInventory(updated_at=now, **r))
        written += 1
    db.commit()

    return UploadResult(
        kind="inventory", rows_received=len(df), rows_written=written
    )


# ---------- GET /data/skus -------------------------------------------------
@router.get("/skus", response_model=list[SkuSummary])
def list_skus(db: Session = Depends(get_db)) -> list[SkuSummary]:
    # Pull products + outer-join inventory + sales-day count per SKU.
    sales_day_count = (
        select(SalesHistory.sku, func.count(func.distinct(SalesHistory.date)).label("d"))
        .group_by(SalesHistory.sku)
        .subquery()
    )
    rows = db.execute(
        select(
            ProductMaster,
            CurrentInventory.on_hand,
            sales_day_count.c.d,
        )
        .select_from(ProductMaster)
        .outerjoin(CurrentInventory, CurrentInventory.sku == ProductMaster.sku)
        .outerjoin(sales_day_count, sales_day_count.c.sku == ProductMaster.sku)
        .order_by(ProductMaster.sku)
    ).all()

    out: list[SkuSummary] = []
    for prod, on_hand, days in rows:
        days_avail = int(days or 0)
        out.append(
            SkuSummary(
                sku=prod.sku,
                name=prod.name,
                category=prod.category,
                unit_cost=prod.unit_cost,
                lead_time_days=prod.lead_time_days,
                on_hand=on_hand,
                sales_days_available=days_avail,
                cold_start=days_avail < 60,
            )
        )
    return out


# ---------- GET /data/products --------------------------------------------
@router.get("/products", response_model=list[ProductOut])
def list_products(
    search: str | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
) -> list[ProductOut]:
    """Full product master list. Optional case-insensitive `search` (name/sku)
    and exact `category` filter — used by the Browse tab on the Data page.
    """
    q = select(ProductMaster).order_by(ProductMaster.sku)
    if search:
        like = f"%{search.lower()}%"
        q = q.where(
            func.lower(ProductMaster.sku).like(like)
            | func.lower(ProductMaster.name).like(like)
        )
    if category:
        q = q.where(ProductMaster.category == category)
    return [ProductOut.model_validate(p) for p in db.scalars(q).all()]


@router.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db)) -> list[str]:
    """Distinct categories for the filter dropdown."""
    rows = db.execute(
        select(ProductMaster.category).distinct().order_by(ProductMaster.category)
    ).scalars().all()
    return list(rows)


# ---------- GET /data/inventory -------------------------------------------
@router.get("/inventory", response_model=list[InventoryRow])
def list_inventory(db: Session = Depends(get_db)) -> list[InventoryRow]:
    """Inventory rows joined with product master so the table can show
    name + category + per-SKU stock value (on_hand × unit_cost).
    """
    rows = db.execute(
        select(CurrentInventory, ProductMaster)
        .join(ProductMaster, ProductMaster.sku == CurrentInventory.sku)
        .order_by(ProductMaster.sku)
    ).all()
    out: list[InventoryRow] = []
    for inv, prod in rows:
        out.append(
            InventoryRow(
                sku=inv.sku,
                name=prod.name,
                category=prod.category,
                store_id=inv.store_id,
                on_hand=inv.on_hand,
                unit_cost=prod.unit_cost,
                stock_value=float(inv.on_hand) * float(prod.unit_cost),
                updated_at=inv.updated_at,
            )
        )
    return out


# ---------- GET /data/sales/{sku} -----------------------------------------
@router.get("/sales/summaries", response_model=list[SkuSalesSummary])
def list_sales_summaries(
    days: int = 30,
    db: Session = Depends(get_db),
) -> list[SkuSalesSummary]:
    """Per-SKU sales summary table: total units, avg/day, last-30d units,
    last-sale date, plus the most-recent N daily points for a sparkline.
    """
    days = max(1, min(days, 365))

    # Pull product master.
    products = {p.sku: p for p in db.scalars(select(ProductMaster)).all()}

    # Pull aggregated daily sales.
    rows = db.execute(
        select(
            SalesHistory.sku,
            SalesHistory.date,
            func.sum(SalesHistory.quantity).label("qty"),
            func.max(SalesHistory.promo_flag).label("promo"),
        )
        .group_by(SalesHistory.sku, SalesHistory.date)
        .order_by(SalesHistory.sku, SalesHistory.date)
    ).all()

    per_sku: dict[str, list[tuple]] = defaultdict(list)
    for sku, d, q, promo in rows:
        per_sku[sku].append((d, int(q), bool(promo)))

    today = datetime.now(timezone.utc).date()
    cutoff_30 = today - timedelta(days=30)

    out: list[SkuSalesSummary] = []
    for sku, prod in products.items():
        series = per_sku.get(sku, [])
        days_avail = len(series)
        if days_avail == 0:
            out.append(
                SkuSalesSummary(
                    sku=sku, name=prod.name, category=prod.category,
                    days_available=0, total_units=0, avg_daily=0.0,
                    last_30d_units=0, last_sale_date=None, daily=[],
                )
            )
            continue

        total = sum(q for _, q, _ in series)
        avg = total / days_avail if days_avail > 0 else 0.0
        last_30 = sum(q for d, q, _ in series if d >= cutoff_30)
        last_date = max(d for d, _, _ in series)
        tail = series[-days:]
        out.append(
            SkuSalesSummary(
                sku=sku,
                name=prod.name,
                category=prod.category,
                days_available=days_avail,
                total_units=total,
                avg_daily=round(avg, 2),
                last_30d_units=last_30,
                last_sale_date=last_date,
                daily=[
                    SalesDayPoint(date=d, quantity=q, promo=p) for d, q, p in tail
                ],
            )
        )

    out.sort(key=lambda s: s.last_30d_units, reverse=True)
    return out


@router.get("/sales/{sku}", response_model=list[SalesDayPoint])
def list_sales_for_sku(
    sku: str,
    days: int = 90,
    db: Session = Depends(get_db),
) -> list[SalesDayPoint]:
    """Aggregated daily sales for one SKU over the last N days — used by
    the per-SKU expand view in the Sales browse tab.
    """
    if db.get(ProductMaster, sku) is None:
        raise HTTPException(404, f"SKU {sku} not found.")
    days = max(1, min(days, 730))
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=days)
    rows = db.execute(
        select(
            SalesHistory.date,
            func.sum(SalesHistory.quantity).label("qty"),
            func.max(SalesHistory.promo_flag).label("promo"),
        )
        .where(SalesHistory.sku == sku, SalesHistory.date >= cutoff)
        .group_by(SalesHistory.date)
        .order_by(SalesHistory.date)
    ).all()
    return [SalesDayPoint(date=d, quantity=int(q), promo=bool(p)) for d, q, p in rows]
