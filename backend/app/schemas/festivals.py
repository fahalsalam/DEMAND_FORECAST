"""Pydantic schemas for festival CRUD + seasonal endpoint."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class FestivalIn(BaseModel):
    """Payload for POST + PUT."""
    name: str = Field(..., min_length=1, max_length=80)
    date: date
    expected_uplift: float = Field(1.5, ge=0.5, le=20.0)
    lead_days: int = Field(7, ge=0, le=90)
    tail_days: int = Field(2, ge=0, le=30)
    active: bool = True
    notes: str | None = None


class FestivalOut(BaseModel):
    id: int
    name: str
    date: date
    expected_uplift: float
    lead_days: int
    tail_days: int
    active: bool
    notes: str | None

    model_config = ConfigDict(from_attributes=True)
