"""Background forecast job — orchestrates the Phase 2 + Phase 3 cores.

Pipeline per SKU (runs concurrently across SKUs since v1.1):
  1. Pull sales rows for the SKU.
  2. Call selector.forecast_sku(...) -> ForecastOutput
  3. Slice the forecast over the lead-time window.
  4. Call reorder.decide_reorder(...) -> ReorderResult
  5. Return both → main process persists to DB.

Per-SKU failures are caught and logged — one bad SKU must NOT fail the
entire job (spec section 5 + the runner contract in section 8).

Concurrency:
  We use a ProcessPoolExecutor so the 3-model contest runs across multiple
  cores. Each worker receives a self-contained (sku, sales_df, params) tuple
  and returns plain dataclasses — no DB session is shared across processes
  (SQLite would not appreciate that). The main process writes results as
  each future completes.

  Worker count is controlled by the env var DEMAND_FORECAST_WORKERS:
    - unset / 0 / <0  → defaults to multiprocessing.cpu_count()
    - 1               → sequential fallback (used by pytest)
    - N (≥ 2)         → fixed pool size
"""
from __future__ import annotations

import logging
import multiprocessing
import os
import uuid
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.forecasting import forecast_sku
from app.core.inventory import decide_reorder
from app.db import SessionLocal
from app.models import (
    CurrentInventory,
    ForecastJob,
    ForecastResult,
    ProductMaster,
    ReorderDecision,
    SalesHistory,
)

log = logging.getLogger(__name__)


def new_job_id() -> str:
    return f"job_{uuid.uuid4().hex[:12]}"


# ---------------------------------------------------------------------------
# Per-SKU worker — runs INSIDE a child process
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class _SkuTask:
    """A self-contained unit of work passed to a worker process.
    Everything inside must be picklable — no SQLAlchemy objects, no sessions."""
    sku: str
    sales_records: list[dict]               # raw rows from sales_history
    product: dict[str, Any]                 # product master fields as a dict
    on_hand: int
    category_daily_avg: float | None
    service_level: float
    review_period_days: int
    fast_mode: bool = False


@dataclass
class _SkuResult:
    sku: str
    ok: bool
    forecast_rows: list[dict] | None = None       # rows to insert into forecast_results
    reorder_row: dict | None = None               # row for reorder_decisions
    error: str | None = None


def _run_one_sku(task: _SkuTask) -> _SkuResult:
    """The single-SKU pipeline — runs in a worker process. PURE compute."""
    try:
        sales_df = pd.DataFrame(task.sales_records)
        out = forecast_sku(
            sku=task.sku,
            sales=sales_df,
            lead_time_days=int(task.product["lead_time_days"]),
            review_period=int(task.review_period_days),
            category_daily_avg=task.category_daily_avg,
            fast_mode=task.fast_mode,
        )

        # NaN MAPE for cold-start fallback → store as 0.0
        model_mape = float(out.model_mape) if out.model_mape == out.model_mape else 0.0

        forecast_rows = [
            {
                "sku": task.sku,
                "forecast_date": fp.forecast_date,
                "yhat": fp.yhat,
                "yhat_lower": fp.yhat_lower,
                "yhat_upper": fp.yhat_upper,
                "chosen_model": out.chosen_model,
                "model_mape": model_mape,
            }
            for fp in out.points
        ]

        # Reorder decision over the lead-time slice.
        lt = int(task.product["lead_time_days"])
        yhat = [fp.yhat for fp in out.points[:lt]]
        lo = [fp.yhat_lower for fp in out.points[:lt]]
        hi = [fp.yhat_upper for fp in out.points[:lt]]

        dec = decide_reorder(
            sku=task.sku,
            yhat_lead_window=yhat,
            yhat_lower_lead=lo,
            yhat_upper_lead=hi,
            lead_time_days=lt,
            current_stock=task.on_hand,
            ordering_cost=float(task.product["ordering_cost"]),
            holding_cost_per_unit_per_year=float(task.product["holding_cost_per_unit"]),
            service_level=task.service_level,
        )
        reorder_row = {
            "sku": task.sku,
            "avg_daily_demand": dec.avg_daily_demand,
            "demand_std": dec.demand_std,
            "safety_stock": dec.safety_stock,
            "reorder_point": dec.reorder_point,
            "eoq": dec.eoq,
            "current_stock": dec.current_stock,
            "status": dec.status,
            "recommended_order_qty": dec.recommended_order_qty,
            "explanation": dec.explanation,
        }
        return _SkuResult(sku=task.sku, ok=True,
                          forecast_rows=forecast_rows, reorder_row=reorder_row)
    except Exception as exc:  # noqa: BLE001
        log.exception("Per-SKU pipeline failed for %s", task.sku)
        return _SkuResult(sku=task.sku, ok=False, error=str(exc))


# ---------------------------------------------------------------------------
# Helpers in the MAIN process
# ---------------------------------------------------------------------------
def _category_daily_averages(db: Session) -> dict[str, float]:
    """Per-category average daily demand — used for cold-start fallback."""
    sku_totals: dict[str, tuple[int, int]] = {}
    rows = db.execute(
        select(SalesHistory.sku, SalesHistory.date, SalesHistory.quantity)
    ).all()
    qty: dict[str, int] = defaultdict(int)
    days: dict[str, set] = defaultdict(set)
    for sku, d, q in rows:
        qty[sku] += int(q)
        days[sku].add(d)
    for sku in qty:
        sku_totals[sku] = (qty[sku], len(days[sku]) or 1)

    cat_by_sku = {
        sku: cat
        for sku, cat in db.execute(
            select(ProductMaster.sku, ProductMaster.category)
        ).all()
    }
    cat_sums: dict[str, float] = defaultdict(float)
    cat_counts: dict[str, int] = defaultdict(int)
    for sku, (total, d) in sku_totals.items():
        cat = cat_by_sku.get(sku)
        if cat is None:
            continue
        cat_sums[cat] += total / d
        cat_counts[cat] += 1
    return {
        cat: (cat_sums[cat] / cat_counts[cat]) for cat in cat_sums if cat_counts[cat]
    }


def _resolve_worker_count() -> int:
    """How many worker processes to use.

    DEMAND_FORECAST_WORKERS env var overrides; defaults to cpu_count().
    Returning 1 disables the process pool (sequential, in-process) — used by
    pytest where ProcessPool would not see the test DB.
    """
    raw = os.getenv("DEMAND_FORECAST_WORKERS", "").strip()
    if raw:
        try:
            n = int(raw)
            return max(1, n)
        except ValueError:
            pass
    return max(1, multiprocessing.cpu_count())


def _persist_result(db: Session, job_id: str, result: _SkuResult) -> None:
    """Write one SKU's results to the DB from the main process."""
    if not result.ok:
        return
    for r in result.forecast_rows or []:
        db.add(ForecastResult(job_id=job_id, **r))
    if result.reorder_row:
        db.add(ReorderDecision(job_id=job_id, **result.reorder_row))
    db.commit()


def _job_was_cancelled(db: Session, job_id: str) -> bool:
    """Re-read the job's status from the DB. If it's been flipped off
    'running' (e.g. by the /forecast/cancel endpoint), we bail out."""
    # Expire the cached row so we pick up changes from other sessions.
    db.expire_all()
    job = db.get(ForecastJob, job_id)
    return bool(job and job.status != "running")


# ---------------------------------------------------------------------------
# Top-level entry point — called from FastAPI BackgroundTask
# ---------------------------------------------------------------------------
def run_forecast_job(
    job_id: str,
    service_level: float = 0.95,
    review_period_days: int = 7,
    sku_filter: list[str] | None = None,
    fast_mode: bool = False,
) -> None:
    """Top-level background task. Uses its own DB session.

    Loads all data once in the main process, fans the per-SKU work out to a
    worker pool, writes results back as each future completes. Maintains the
    spec's per-SKU isolation contract (one bad SKU never fails the job).
    """
    db = SessionLocal()
    try:
        job = db.get(ForecastJob, job_id)
        if job is None:
            log.error("Forecast job %s not found", job_id)
            return

        products_query = select(ProductMaster)
        if sku_filter:
            products_query = products_query.where(ProductMaster.sku.in_(sku_filter))
        products = db.scalars(products_query).all()
        if not products:
            job.status = "failed"
            job.message = "No products found — upload product master and sales first."
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
            return

        category_avg = _category_daily_averages(db)
        skus = [p.sku for p in products]

        # Preload sales + inventory in one query each.
        sales_rows = db.execute(
            select(
                SalesHistory.sku,
                SalesHistory.date,
                SalesHistory.quantity,
            ).where(SalesHistory.sku.in_(skus))
        ).all()
        sales_by_sku: dict[str, list[dict]] = defaultdict(list)
        for sku, d, q in sales_rows:
            sales_by_sku[sku].append({"date": d, "quantity": int(q)})

        inv_rows = db.execute(
            select(CurrentInventory.sku, CurrentInventory.on_hand).where(
                CurrentInventory.sku.in_(skus)
            )
        ).all()
        on_hand_by_sku = {sku: int(qty) for sku, qty in inv_rows}

        # Build picklable tasks for the worker pool.
        tasks = [
            _SkuTask(
                sku=p.sku,
                sales_records=sales_by_sku.get(p.sku, []),
                product={
                    "sku": p.sku,
                    "name": p.name,
                    "category": p.category,
                    "lead_time_days": p.lead_time_days,
                    "ordering_cost": p.ordering_cost,
                    "holding_cost_per_unit": p.holding_cost_per_unit,
                },
                on_hand=on_hand_by_sku.get(p.sku, 0),
                category_daily_avg=category_avg.get(p.category),
                service_level=service_level,
                review_period_days=review_period_days,
                fast_mode=fast_mode,
            )
            for p in products
        ]

        # Fast mode is cheap per SKU (~2 s) so ProcessPool's spawn overhead
        # (~15 s/worker on macOS) makes parallelism actively WORSE. Sequential
        # is faster and more predictable.
        if fast_mode:
            n_workers = 1
        else:
            n_workers = _resolve_worker_count()
            # Cap workers at min(cpu, len(tasks)) — pointless to spin up more.
            n_workers = max(1, min(n_workers, len(tasks)))
        log.info("Forecast job %s: %d SKUs, %d workers, fast_mode=%s",
                 job_id, len(tasks), n_workers, fast_mode)

        success = 0
        failure = 0
        cancelled = False

        if n_workers == 1:
            # In-process sequential — used by tests where DB is in-memory.
            for t in tasks:
                if _job_was_cancelled(db, job_id):
                    cancelled = True
                    log.info("Forecast %s cancelled — stopping after %d SKUs",
                             job_id, success + failure)
                    break
                r = _run_one_sku(t)
                _persist_result(db, job_id, r)
                if r.ok:
                    success += 1
                else:
                    failure += 1
        else:
            # Cross-process parallel. Pool of `n_workers` runs the contests.
            pool = ProcessPoolExecutor(max_workers=n_workers)
            try:
                futures = {pool.submit(_run_one_sku, t): t.sku for t in tasks}
                for fut in as_completed(futures):
                    if _job_was_cancelled(db, job_id):
                        cancelled = True
                        log.info("Forecast %s cancelled — shutting down pool", job_id)
                        # Stop accepting new work; running children finish on their own.
                        pool.shutdown(wait=False, cancel_futures=True)
                        break
                    try:
                        r = fut.result()
                    except Exception as exc:  # noqa: BLE001
                        sku = futures[fut]
                        log.exception("Worker crash for SKU %s", sku)
                        r = _SkuResult(sku=sku, ok=False, error=str(exc))
                    try:
                        _persist_result(db, job_id, r)
                    except Exception as exc:  # noqa: BLE001
                        log.exception("Failed to persist %s: %s", r.sku, exc)
                        db.rollback()
                        failure += 1
                        continue
                    if r.ok:
                        success += 1
                    else:
                        failure += 1
            finally:
                pool.shutdown(wait=False, cancel_futures=True)

        # Finalize job status. If user cancelled, /forecast/cancel already
        # set status=failed,message=cancelled — only touch the completed_at
        # and don't clobber that message.
        job = db.get(ForecastJob, job_id)
        if cancelled:
            # Cancel endpoint already wrote status/message — just make sure
            # completed_at and the count are accurate.
            if not job.completed_at:
                job.completed_at = datetime.now(timezone.utc)
            if not job.message or "Cancelled" not in (job.message or ""):
                job.message = (
                    f"Cancelled — {success} SKU(s) completed, "
                    f"{len(tasks) - success - failure} skipped."
                )
        else:
            job.completed_at = datetime.now(timezone.utc)
            if success == 0:
                job.status = "failed"
                job.message = f"All {failure} SKUs failed — see server logs."
            else:
                job.status = "complete"
                job.message = (
                    f"{success} SKU(s) forecasted"
                    + (f", {failure} failed" if failure else "")
                    + f" using {n_workers} worker(s)."
                )
        db.commit()
    finally:
        db.close()
