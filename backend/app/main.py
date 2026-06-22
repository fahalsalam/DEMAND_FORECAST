"""FastAPI application entrypoint.

Phase 0–1 wired: health + data layer. Forecast/reorder/backtest/metrics
land in Phase 4.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api.backtest import router as backtest_router
from app.api.config import router as config_router
from app.api.config import seed_default_festivals
from app.api.data import router as data_router
from app.api.forecast import router as forecast_router
from app.api.health import router as health_router
from app.api.metrics import router as metrics_router
from app.api.reorder import router as reorder_router
from app.api.seasonal import router as seasonal_router
from app.api.supplier_auth import router as supplier_router
from app.api.templates import router as templates_router
from app.db import SessionLocal, init_db
from app.models import ForecastJob

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # create_all is idempotent — safe to run on every boot.
    init_db()

    # Clean up "ghost" running jobs from a previous crash/restart. Without
    # this, the dashboard's resume effect sees status='running', starts
    # polling, and looks like the forecast magically re-ran on app reload.
    try:
        with SessionLocal() as db:
            stale = db.scalars(
                select(ForecastJob).where(ForecastJob.status == "running")
            ).all()
            for job in stale:
                job.status = "failed"
                job.message = "Server restarted while job was running."
                job.completed_at = datetime.now(timezone.utc)
            if stale:
                db.commit()
                log.warning("Marked %d stale running job(s) as failed", len(stale))
    except Exception:
        log.exception("Failed to clean up stale running jobs on startup")

    # Seed the default festival calendar on first boot.
    try:
        with SessionLocal() as db:
            n = seed_default_festivals(db)
            if n:
                log.info("Seeded %d default festivals", n)
    except Exception:
        log.exception("Failed to seed default festivals on startup")

    yield


app = FastAPI(
    lifespan=lifespan,
    title="Demand Forecast & Auto Reorder API",
    description=(
        "Forecasts per-SKU demand with uncertainty bands and converts "
        "the forecast into automatic reorder decisions for small/medium retailers."
    ),
    version="0.1.0",
)

# CORS — Vite dev server runs on 5173 by default.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(data_router)
app.include_router(templates_router)
app.include_router(config_router)
app.include_router(forecast_router)
app.include_router(seasonal_router)
app.include_router(reorder_router)
app.include_router(backtest_router)
app.include_router(metrics_router)
app.include_router(supplier_router)


@app.get("/", tags=["meta"])
def root() -> dict[str, str]:
    return {
        "service": "demand-forecast-api",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health",
    }
