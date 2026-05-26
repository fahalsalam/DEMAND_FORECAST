# Demand Forecasting & Automatic Inventory Reorder System

A web application that predicts future product demand from historical sales,
quantifies the **uncertainty** of that prediction, and converts the forecast
+ uncertainty + current stock into automatic, per-SKU reorder decisions
(when to order, how much, and a status flag). Results are shown on an
interactive React dashboard. Target users: small/medium retail stores.

The academic core is two-fold:

1. **Per-SKU model selection** — three forecasting models compete (ARIMA,
   Prophet, LightGBM) and the best one is chosen *per product* by backtest
   error (MAPE on the last 28 days).
2. **Forecast-driven inventory policy** — the forecast's *uncertainty band*
   (not just the point estimate) sizes safety stock, which drives the
   reorder point alongside the EOQ.

---

## Architecture (one paragraph)

A FastAPI backend orchestrates two pure-Python cores (`core/forecasting/`
and `core/inventory/`) that have no FastAPI or DB imports — they take
pandas Series / numbers in and return dataclasses out, so they're
independently unit-testable. The forecasting core runs a time-based
ARIMA/Prophet/LightGBM contest per SKU and emits a forecast with a
95 % prediction interval; the inventory core converts that into a
reorder decision using scipy's normal inverse and the EOQ formula. The
API persists results to SQLite via SQLAlchemy 2.x (URL-overridable to
PostgreSQL with no code change), runs jobs via FastAPI BackgroundTasks,
and exposes typed Pydantic responses. The React 18 + Vite frontend
mirrors those Pydantic schemas as TypeScript types in a single typed
fetch client and surfaces everything in four pages: Dashboard, Forecasts,
Alerts, and Backtest.

```
React + TS (Vite)  ──HTTP/JSON──>  FastAPI
                                     ├── api/        (route handlers)
                                     ├── core/forecasting/   (models + selector)  ← pure
                                     ├── core/inventory/     (reorder + backtest) ← pure
                                     ├── jobs/       (background forecast runner)
                                     ├── models/     (SQLAlchemy tables)
                                     ├── schemas/    (Pydantic I/O)
                                     └── db.py
                                     │
                                     └──> SQLite (swappable to PostgreSQL)
```

---

## One-time setup

### macOS prerequisites

```bash
brew install python@3.11        # spec requires 3.11 (pmdarima is picky)
brew install libomp             # LightGBM needs the OpenMP runtime
brew install node               # for the frontend
```

### Backend

```bash
cd backend
/opt/homebrew/bin/python3.11 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

# One-off: Prophet uses cmdstanpy which needs a compiled Stan model.
.venv/bin/python -c "import cmdstanpy; cmdstanpy.install_cmdstan(progress=False)"
```

### Frontend

```bash
cd frontend
npm install
```

### Seed the database

Creates `backend/demand_forecast.db` with 30 SKUs across 5 categories,
~2 years of daily sales per SKU, weekly + annual seasonality, sporadic
promos, varied lead times, inventory levels spread across all 4 reorder
statuses, plus 3 cold-start SKUs (<60 days history).

```bash
cd backend
.venv/bin/python seed.py
# prints: products: 30, sales_rows: 19798, inventory_rows: 30, cold_start_skus: 3
```

---

## Running the app

Two terminals:

```bash
# Terminal A — backend
cd backend
.venv/bin/uvicorn app.main:app --reload --port 8000
# → http://localhost:8000
# → http://localhost:8000/docs  (interactive OpenAPI)
```

```bash
# Terminal B — frontend
cd frontend
npm run dev
# → http://localhost:5173
```

---

## Demo flow (~3 minutes)

1. Open <http://localhost:5173>. The dashboard loads; the connection
   chip in the nav turns green when the API responds.
2. Click **Run Forecast**. The job ID returns instantly; the progress bar
   tracks SKUs as they're processed (~30 s per SKU due to Prophet's Stan
   compile — be patient).
3. When complete, four KPI tiles fill in (avg MAPE, at-risk SKUs,
   inventory value, recommended-order spend) and the status grid below
   colour-codes every SKU into one of: Healthy / Reorder Now / Stockout
   Risk / Overstock.
4. Switch to **Forecasts** tab → pick a SKU. The chart shows ~120 days
   of historical actuals as a solid line, the forecast as a dashed
   continuation, and a shaded 95 % prediction interval band. The
   chosen model + validation MAPE are shown prominently.
5. Switch to **Alerts** tab. Filter pills show counts per bucket. Click
   any row to expand the full reasoning: *"Forecast demand over the
   N-day lead time is X ± Y units. Current stock is Z, below the
   reorder point of W. Recommend ordering Q units (EOQ)."*
6. Switch to **Backtest** tab. Pick a SKU, drag the holdout-window
   slider. Headline: *"Stockout days reduced from N to M…"* with
   side-by-side bar charts showing the inventory trade-off.

---

## Project structure

```
DEMAND_FORCAST/files/
├── PROJECT_SPEC.md
├── BUILD_PROMPTS.md
├── README.md                      ← you are here
├── .claude/launch.json            ← dev-server launch config
├── backend/
│   ├── requirements.txt
│   ├── pytest.ini
│   ├── seed.py                    ← synthetic dataset generator
│   └── app/
│       ├── main.py                ← FastAPI app + lifespan
│       ├── db.py                  ← SQLAlchemy engine + FK pragma
│       ├── api/                   ← route handlers
│       │   ├── health.py
│       │   ├── data.py            ← uploads + /data/skus
│       │   ├── forecast.py        ← /forecast/run, /status, /{sku}
│       │   ├── reorder.py         ← /reorder/alerts
│       │   ├── backtest.py        ← /backtest/{sku}
│       │   └── metrics.py         ← /metrics/{job_id}
│       ├── core/                  ← PURE Python (no FastAPI, no DB)
│       │   ├── forecasting/
│       │   │   ├── arima_model.py
│       │   │   ├── prophet_model.py
│       │   │   ├── lgbm_model.py
│       │   │   ├── preprocess.py
│       │   │   ├── selector.py    ← three-model contest + fallbacks
│       │   │   └── types.py
│       │   └── inventory/
│       │       ├── reorder.py     ← safety stock, ROP, EOQ, status, explanation
│       │       └── backtest.py    ← day-by-day baseline vs system
│       ├── jobs/forecast_runner.py
│       ├── models/tables.py       ← 6 SQLAlchemy tables
│       ├── schemas/               ← Pydantic v2 I/O models
│       └── tests/                 ← pytest
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/client.ts          ← single typed fetch client
        ├── types/index.ts         ← mirrors Pydantic schemas
        ├── hooks/useForecastJob.ts
        ├── components/
        │   ├── KpiHeader.tsx
        │   ├── StatusGrid.tsx
        │   ├── RunForecastPanel.tsx
        │   ├── ForecastChart.tsx  ← Recharts band + lines
        │   ├── AlertsTable.tsx
        │   ├── BacktestChart.tsx
        │   ├── PageTabs.tsx
        │   ├── PhaseStrip.tsx
        │   └── StatusBadge.tsx
        ├── pages/
        │   ├── Dashboard.tsx
        │   ├── Forecasts.tsx
        │   ├── Alerts.tsx
        │   └── Backtest.tsx
        └── styles/global.css
```

---

## Testing

33 pytest tests across 5 files, all green:

```bash
cd backend
.venv/bin/pytest -v
# 33 passed in ~80s
```

- `test_health.py` — smoke test for `/health`.
- `test_data_uploads.py` — CSV upload validation: missing columns,
  negative quantities, unparseable dates, product upsert behaviour,
  round-trip.
- `test_forecasting_core.py` — pure-core tests with synthetic series:
  clean seasonal series picks a real model, cold-start hits the
  category-average fallback, all-zero / empty series don't crash,
  time-based split is chronological, MAPE floor prevents explosion
  on sparse data.
- `test_inventory_core.py` — hand-checked numeric examples: Z table
  values, safety stock grows linearly in σ and with √L, EOQ ∝ √D
  and the textbook hand-calc, all four status buckets, backtest
  sanity + pathological-baseline beat.
- `test_forecast_api.py` — full Phase-4 lifecycle: start job, poll
  status, fetch forecast for a SKU including cold-start path,
  alerts default to at-risk, metrics aggregate, `/forecast/run`
  returns near-instantly.

---

## Key design decisions worth knowing for the viva

- **SQLite by default, Postgres-portable.** Engine URL via `DATABASE_URL`
  env var; SQLite-specific touches (FK pragma, `check_same_thread`) are
  isolated in `db.py`. No raw SQLite SQL anywhere in the codebase.
- **Pure cores, hard rule.** `core/forecasting/` and `core/inventory/`
  must not import FastAPI or the DB layer; this lets them be
  unit-tested in seconds without spinning up the web stack.
- **Time-based validation, never random.** The split is always the
  last 28 days as validation — random splits leak the future and
  inflate the model's apparent score.
- **MAPE floor for sparse retail.** When the actual is near zero,
  vanilla MAPE explodes; we floor the denominator at 1.0 so a
  sparse SKU doesn't dominate the contest.
- **Per-SKU failure isolation.** One bad SKU never crashes the job.
  The runner commits per-SKU so a later crash doesn't lose earlier
  progress.
- **Cold-start fallback.** SKUs with <60 days history skip the
  contest and use the category-average daily demand with a wide
  uncertainty band — they're flagged `chosen_model="fallback_category_avg"`.
- **Uncertainty drives safety stock.** The 95 % prediction interval
  is converted into a per-day σ (`(upper-lower) / (2·1.96)`), then
  `safety_stock = Z(SL) · σ · √L`. Wider band → larger safety stock.
- **LightGBM prediction interval.** LightGBM has no native PI, so we
  train three models per SKU: one regular regressor + two quantile
  regressors at α=0.05 and α=0.95.

---

## What's intentionally NOT included

(Items mentioned only as context in PROJECT_SPEC but not deliverables.)

- No Celery / Redis — uses FastAPI BackgroundTasks per spec.
- No UI framework (no Tailwind, no MUI) — plain CSS modules with a
  design system in `global.css`, per spec.
- No authentication — out of scope for the academic deliverable.
- No real-time WebSocket — polling at 2 s is the spec's expectation.

---

## Troubleshooting

- **LightGBM `OSError: Library not loaded: libomp.dylib`** — run
  `brew install libomp`.
- **Prophet `AttributeError: 'Prophet' object has no attribute 'stan_backend'`**
  — `cmdstanpy 1.3+` is incompatible with `prophet 1.1.6`. Pin
  `cmdstanpy==1.2.5` (already in `requirements.txt`).
- **`pmdarima` build fails** — pmdarima 2.0.4 only supports Python ≤ 3.12.
  Use Python 3.11 per spec.
- **First job is slow (~30 s/SKU)** — Prophet recompiles Stan per SKU.
  Subsequent jobs in the same process are warmer.
