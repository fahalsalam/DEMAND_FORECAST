"""Settings / config endpoints — festival calendar CRUD.

Exposes a calendar of festivals (Eid, Diwali, Christmas, ...) that the user
can edit from the Settings page. The Seasonal Outlook page overlays these on
the forecast chart so the buyer can see which spikes coming up matter.

Default festivals are seeded on first boot (see seed_default_festivals).
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import asc, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Festival
from app.schemas import FestivalIn, FestivalOut

router = APIRouter(prefix="/config/festivals", tags=["config"])


# ---------- list ---------------------------------------------------------
@router.get("", response_model=list[FestivalOut])
def list_festivals(
    upcoming_only: bool = False,
    db: Session = Depends(get_db),
) -> list[FestivalOut]:
    """All festivals, ordered by date. Pass ?upcoming_only=true to filter
    to today and forward only — used by the Seasonal Outlook page."""
    q = select(Festival).order_by(asc(Festival.date))
    if upcoming_only:
        q = q.where(Festival.date >= date.today())
    rows = db.scalars(q).all()
    return [FestivalOut.model_validate(r) for r in rows]


# ---------- create -------------------------------------------------------
@router.post("", response_model=FestivalOut, status_code=201)
def create_festival(body: FestivalIn, db: Session = Depends(get_db)) -> FestivalOut:
    f = Festival(
        name=body.name,
        date=body.date,
        expected_uplift=body.expected_uplift,
        lead_days=body.lead_days,
        tail_days=body.tail_days,
        active=body.active,
        notes=body.notes,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return FestivalOut.model_validate(f)


# ---------- update -------------------------------------------------------
@router.put("/{festival_id}", response_model=FestivalOut)
def update_festival(
    festival_id: int, body: FestivalIn, db: Session = Depends(get_db)
) -> FestivalOut:
    f = db.get(Festival, festival_id)
    if f is None:
        raise HTTPException(404, f"Festival {festival_id} not found.")
    for k, v in body.model_dump().items():
        setattr(f, k, v)
    db.commit()
    db.refresh(f)
    return FestivalOut.model_validate(f)


# ---------- delete -------------------------------------------------------
@router.delete("/{festival_id}", status_code=204, response_class=Response)
def delete_festival(festival_id: int, db: Session = Depends(get_db)) -> Response:
    f = db.get(Festival, festival_id)
    if f is None:
        raise HTTPException(404, f"Festival {festival_id} not found.")
    db.delete(f)
    db.commit()
    return Response(status_code=204)


# ---------- defaults (called by lifespan on first boot) -----------------
DEFAULT_FESTIVALS: list[dict] = [
    # India + global mix — user edits these on the Settings page.
    {"name": "Eid al-Fitr",   "date": date(2026, 3, 21), "expected_uplift": 1.7,
     "lead_days": 10, "tail_days": 2,
     "notes": "Sweets, dates, snacks see big uplift in the 10 days before."},
    {"name": "Eid al-Adha",   "date": date(2026, 5, 28), "expected_uplift": 1.5,
     "lead_days": 7, "tail_days": 2,
     "notes": "Meat + spices uplift; broader grocery basket."},
    {"name": "Onam",          "date": date(2026, 9, 4),  "expected_uplift": 1.8,
     "lead_days": 10, "tail_days": 3,
     "notes": "South Indian harvest festival — broad spend uplift."},
    {"name": "Diwali",        "date": date(2026, 11, 9), "expected_uplift": 2.2,
     "lead_days": 14, "tail_days": 3,
     "notes": "Biggest retail uplift — gifts, sweets, lights, stationery."},
    {"name": "Christmas",     "date": date(2026, 12, 25), "expected_uplift": 1.6,
     "lead_days": 14, "tail_days": 2,
     "notes": "Lights, decor, gifts."},
    {"name": "New Year",      "date": date(2027, 1, 1),  "expected_uplift": 1.4,
     "lead_days": 5, "tail_days": 2,
     "notes": "Beverages + snacks for parties."},
]


def seed_default_festivals(db: Session) -> int:
    """Insert the default calendar if the festivals table is empty.
    Called from the FastAPI lifespan startup on first boot."""
    existing = db.execute(select(Festival).limit(1)).first()
    if existing is not None:
        return 0
    for f in DEFAULT_FESTIVALS:
        db.add(Festival(**f))
    db.commit()
    return len(DEFAULT_FESTIVALS)
