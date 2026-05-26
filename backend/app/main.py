"""FastAPI application entrypoint.

Phase 0–1 wired: health + data layer. Forecast/reorder/backtest/metrics
land in Phase 4.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.backtest import router as backtest_router
from app.api.data import router as data_router
from app.api.forecast import router as forecast_router
from app.api.health import router as health_router
from app.api.metrics import router as metrics_router
from app.api.reorder import router as reorder_router
from app.api.templates import router as templates_router
from app.db import init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # create_all is idempotent — safe to run on every boot.
    init_db()
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
app.include_router(forecast_router)
app.include_router(reorder_router)
app.include_router(backtest_router)
app.include_router(metrics_router)


@app.get("/", tags=["meta"])
def root() -> dict[str, str]:
    return {
        "service": "demand-forecast-api",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health",
    }
