"""Health-check route — proves the backend is up and reachable from the frontend."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    timestamp: str


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="demand-forecast-api",
        version="0.1.0",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
