"""Supplier authentication and order-view endpoints."""
from __future__ import annotations

import hashlib
import hmac
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ForecastJob, ProductMaster, ReorderDecision, Supplier
from app.schemas import ReorderDecisionOut

router = APIRouter(prefix="/supplier", tags=["supplier"])


# ---------------------------------------------------------------------------
# Password utilities (stdlib only — no extra deps)
# ---------------------------------------------------------------------------

def _hash_password(password: str, salt: str) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return dk.hex()


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, expected = stored.split(":", 1)
        actual = _hash_password(password, salt)
        return hmac.compare_digest(actual, expected)
    except ValueError:
        return False


def make_password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    return f"{salt}:{_hash_password(password, salt)}"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SupplierLoginRequest(BaseModel):
    email: str
    password: str


class SupplierLoginResponse(BaseModel):
    token: str
    supplier_name: str
    email: str


# ---------------------------------------------------------------------------
# Dependency — resolve supplier from session token header
# ---------------------------------------------------------------------------

def _require_supplier(
    x_supplier_token: str = Header(..., alias="X-Supplier-Token"),
    db: Session = Depends(get_db),
) -> Supplier:
    supplier = db.scalar(
        select(Supplier).where(Supplier.token == x_supplier_token)
    )
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired supplier token.",
        )
    return supplier


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/login", response_model=SupplierLoginResponse)
def supplier_login(
    body: SupplierLoginRequest,
    db: Session = Depends(get_db),
) -> SupplierLoginResponse:
    """Supplier login — returns a session token stored in the DB."""
    supplier = db.scalar(
        select(Supplier).where(Supplier.email == body.email.strip().lower())
    )
    if not supplier or not _verify_password(body.password, supplier.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    token = secrets.token_hex(32)
    supplier.token = token
    db.commit()
    return SupplierLoginResponse(
        token=token,
        supplier_name=supplier.name,
        email=supplier.email,
    )


@router.get("/orders", response_model=list[ReorderDecisionOut])
def supplier_orders(
    db: Session = Depends(get_db),
    supplier: Supplier = Depends(_require_supplier),
) -> list[ReorderDecisionOut]:
    """Return reorder alerts for this supplier's SKUs from the latest completed job."""
    latest_job = db.scalar(
        select(ForecastJob)
        .where(ForecastJob.status == "complete")
        .order_by(ForecastJob.completed_at.desc())
    )
    if not latest_job:
        return []

    rows = db.execute(
        select(ReorderDecision, ProductMaster)
        .join(ProductMaster, ProductMaster.sku == ReorderDecision.sku)
        .where(ReorderDecision.job_id == latest_job.job_id)
        .where(ProductMaster.supplier == supplier.name)
    ).all()

    out: list[ReorderDecisionOut] = []
    for decision, product in rows:
        est_cost = float(decision.recommended_order_qty) * float(product.unit_cost)
        out.append(
            ReorderDecisionOut(
                sku=decision.sku,
                name=product.name,
                category=product.category,
                status=decision.status,
                avg_daily_demand=decision.avg_daily_demand,
                demand_std=decision.demand_std,
                safety_stock=decision.safety_stock,
                reorder_point=decision.reorder_point,
                eoq=decision.eoq,
                current_stock=decision.current_stock,
                recommended_order_qty=decision.recommended_order_qty,
                explanation=decision.explanation,
                unit_cost=product.unit_cost,
                estimated_cost=est_cost,
                lead_time_days=product.lead_time_days,
                supplier=product.supplier,
            )
        )
    out.sort(key=lambda d: (
        0 if d.status == "STOCKOUT_RISK" else 1 if d.status == "REORDER_NOW" else 2,
        -d.estimated_cost,
    ))
    return out
