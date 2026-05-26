# PROJECT_SPEC.md — Demand Forecasting & Automatic Inventory Reorder System

> This is the single source of truth for the project. Read this fully before
> generating any code. Build strictly in the phase order given at the bottom.
> Do not build later phases until earlier ones are verified working.

---

## 1. What this system does (one paragraph)

A web application that predicts future product demand from historical sales data,
quantifies the *uncertainty* of that prediction, and converts the forecast +
uncertainty + current stock into automatic, per-SKU reorder decisions
(when to order, how much, and a status flag). Results are shown on an
interactive React dashboard. Target users: small/medium retail stores.

The academic core is two-fold:
1. **Per-SKU model selection** — three forecasting models compete (ARIMA,
   Prophet, LightGBM) and the best one is chosen *per product* by backtest error.
2. **Forecast-driven inventory policy** — the forecast's *uncertainty band*
   (not just the point estimate) sizes safety stock, which drives the reorder point.

---

## 2. Tech stack (do not substitute without asking)

- **Backend:** Python 3.11, FastAPI, Uvicorn
- **Forecasting:** pandas, numpy, pmdarima (auto-ARIMA), prophet, lightgbm, scikit-learn
- **ORM / DB:** SQLAlchemy 2.x with SQLite (must remain swappable to PostgreSQL — use SQLAlchemy, no raw SQLite-specific SQL)
- **Validation/serialization:** Pydantic v2
- **Background jobs:** FastAPI BackgroundTasks (no Celery/Redis — keep it simple)
- **Frontend:** React 18 + TypeScript + Vite
- **Charts:** Recharts
- **HTTP client (frontend):** native fetch wrapped in a typed API client
- **Styling:** plain CSS modules or Tailwind — keep minimal, no UI framework bloat

---

## 3. Architecture (Pattern A — single Python backend)

```
React + TS (Vite)  ──HTTP/JSON──>  FastAPI
                                     ├── api/        (route handlers)
                                     ├── core/forecasting/   (models + selector)
                                     ├── core/inventory/     (reorder math)
                                     ├── jobs/       (background forecast runner)
                                     ├── models/     (SQLAlchemy tables)
                                     ├── schemas/    (Pydantic I/O models)
                                     └── db.py
                                     │
                                     └──> SQLite (swappable to PostgreSQL)
```

Hard rule: `core/forecasting/` and `core/inventory/` must NOT import anything
from FastAPI or the web layer. They are pure, independently testable Python
modules. The API layer orchestrates them. This separation is graded.

---

## 4. Data model

### Table: sales_history
- id (pk)
- sku (str, indexed)
- store_id (str, indexed)
- date (date, indexed)
- quantity (int)
- price (float, nullable)
- promo_flag (bool, default false)

### Table: product_master
- sku (pk)
- name (str)
- category (str)
- unit_cost (float)
- lead_time_days (int)        # days from ordering to receiving
- ordering_cost (float)       # fixed cost per purchase order
- holding_cost_per_unit (float)  # annual holding cost per unit
- supplier (str, nullable)

### Table: current_inventory
- sku (pk)
- store_id (str)
- on_hand (int)
- updated_at (datetime)

### Table: forecast_results
- id (pk)
- job_id (str, indexed)
- sku (str, indexed)
- forecast_date (date)
- yhat (float)            # point forecast
- yhat_lower (float)      # lower bound of prediction interval
- yhat_upper (float)      # upper bound of prediction interval
- chosen_model (str)      # 'arima' | 'prophet' | 'lightgbm'
- model_mape (float)      # backtest error of the chosen model

### Table: reorder_decisions
- id (pk)
- job_id (str, indexed)
- sku (str, indexed)
- avg_daily_demand (float)
- demand_std (float)
- safety_stock (float)
- reorder_point (float)
- eoq (float)             # economic order quantity
- current_stock (int)
- status (str)            # 'HEALTHY' | 'REORDER_NOW' | 'OVERSTOCK' | 'STOCKOUT_RISK'
- recommended_order_qty (float)
- explanation (str)       # human-readable reasoning string

### Table: forecast_jobs
- job_id (pk)
- status (str)            # 'running' | 'complete' | 'failed'
- created_at (datetime)
- completed_at (datetime, nullable)
- service_level (float)   # the Z-target the user picked, e.g. 0.95
- message (str, nullable) # error message if failed

---

## 5. The forecasting core (core/forecasting/)

### Per-SKU pipeline (selector.py)
For each SKU:
1. Pull its full daily sales series from sales_history. Resample to a continuous
   daily index, filling missing dates with 0 sales.
2. **Time-based split** — last N days (default 28) as the validation window,
   everything before as training. NEVER use random/shuffled splits.
3. Train all three models on the training window:
   - ARIMA via pmdarima.auto_arima (let it select order automatically)
   - Prophet with weekly + yearly seasonality enabled
   - LightGBM on engineered features: lag_7, lag_14, lag_28, rolling_mean_7,
     rolling_mean_28, day_of_week, month, promo_flag
4. Predict the validation window with each model; compute MAE, RMSE, MAPE.
5. Select the model with the lowest MAPE as the winner for this SKU.
6. Refit the winner on the FULL history.
7. Forecast horizon = lead_time_days + review_period (default review_period = 7).
8. Capture the **prediction interval** for every forecast point:
   - Prophet: native yhat_lower / yhat_upper
   - ARIMA: from get_forecast().conf_int()
   - LightGBM: train additional quantile models at alpha=0.05 and alpha=0.95,
     OR derive interval from residual std. Document which you used.
9. Return per-SKU: forecast series (yhat/lower/upper), chosen_model, model_mape.

### Edge cases that MUST be handled (graded — these come up in viva)
- **Cold start:** SKU with < 60 days of history → skip the 3-model contest,
  fall back to category average daily demand with a wide uncertainty band.
  Mark chosen_model = 'fallback_category_avg'.
- **All-zero / sparse series:** if a SKU barely sells, don't crash — return a
  near-zero forecast with appropriate uncertainty.
- A failing model for one SKU must NOT crash the whole job. Catch per-SKU,
  log it, continue.

---

## 6. The inventory decision core (core/inventory/reorder.py)

Pure functions, no DB, no web. Inputs are plain numbers / arrays; outputs are
plain numbers. This module is the headline contribution — keep it clean and
heavily commented with the formulas.

```
avg_daily_demand = mean of yhat over the lead-time window
demand_std        = std implied by the prediction interval over the lead-time window
                    (e.g. (yhat_upper - yhat_lower) / (2 * z_for_interval))

safety_stock   = Z(service_level) * demand_std * sqrt(lead_time_days)
reorder_point  = (avg_daily_demand * lead_time_days) + safety_stock

annual_demand  = avg_daily_demand * 365
EOQ            = sqrt( (2 * annual_demand * ordering_cost) / holding_cost_per_unit )

# Decision rule:
if current_stock <= (avg_daily_demand * lead_time_days):
    status = 'STOCKOUT_RISK'        # will run out before reorder arrives
elif current_stock <= reorder_point:
    status = 'REORDER_NOW'
    recommended_order_qty = EOQ
elif current_stock > reorder_point + EOQ * 1.5:   # tunable overstock threshold
    status = 'OVERSTOCK'
else:
    status = 'HEALTHY'
```

Z(service_level) uses the inverse normal (scipy.stats.norm.ppf). e.g. 0.95 -> 1.645.

The `explanation` string must be generated here, e.g.:
"Forecast demand over the 7-day lead time is 180 ± 40 units. Current stock is 150,
below the reorder point of 220. Recommend ordering 300 units (EOQ)."

---

## 7. Backtest simulation (core/inventory/backtest.py) — IMPORTANT, do not skip

This produces the "proof it works" numbers for the evaluation. Build it as a
separate module with its own endpoint.

Given a historical holdout period, simulate day by day:
- **Baseline policy:** naive reorder — reorder a fixed amount whenever stock
  hits a fixed low threshold (mimics manual retailer behavior).
- **System policy:** reorder per this system's reorder_point + EOQ recommendations.

Track for each policy over the holdout: number of stockout days, average
inventory held, total holding cost, units of overstock. Return a comparison
summary (e.g. "stockout days: baseline 12 vs system 3; avg inventory: baseline
540 vs system 410"). Expose via GET /backtest/{sku} and an aggregate endpoint.

---

## 8. API contract (FastAPI)

| Method | Path | Purpose | Returns |
|--------|------|---------|---------|
| POST | /data/upload/sales | upload sales CSV | row count, validation result |
| POST | /data/upload/products | upload product master CSV | row count |
| POST | /data/upload/inventory | upload current stock CSV | row count |
| GET  | /data/skus | list SKUs + current stock | list[SkuSummary] |
| POST | /forecast/run | start forecast job (body: service_level) | { job_id } |
| GET  | /forecast/status/{job_id} | poll job status | { status, message } |
| GET  | /forecast/{sku}?job_id= | forecast series for a SKU | ForecastSeries |
| GET  | /reorder/alerts?job_id= | all reorder decisions/statuses | list[ReorderDecision] |
| GET  | /backtest/{sku} | baseline vs system comparison | BacktestResult |
| GET  | /metrics/{job_id} | dashboard KPIs (avg MAPE, #at-risk, inventory value) | MetricsSummary |

All request/response bodies are Pydantic models in schemas/. Generate matching
TypeScript types in the frontend (mirror them in src/types/).

`/forecast/run` MUST return immediately with a job_id and run the work in a
BackgroundTask. It must not block.

---

## 9. Frontend (React + TS + Vite)

Pages:
- **Dashboard** — KPI header (MAPE, # at-risk SKUs, total inventory value),
  the SKU status grid (color-coded), a "Run Forecast" button with a
  service-level slider, and a progress indicator that polls job status.
- **Forecasts** — pick a SKU, show ForecastChart: historical actuals (solid),
  forecast (continuation), and uncertainty band (shaded area between
  yhat_lower and yhat_upper). Also show the chosen model + its MAPE.
- **Reorder Alerts** — AlertsTable of REORDER_NOW / STOCKOUT_RISK items with
  recommended qty, estimated cost, and the explanation string. Clicking a row
  expands the full reasoning ("explain this recommendation").
- **Backtest** — bar chart comparing baseline vs system (stockout days,
  avg inventory). This is the slide that impresses evaluators.

Components: ForecastChart.tsx, StatusGrid.tsx, AlertsTable.tsx, KpiHeader.tsx,
BacktestChart.tsx, RunForecastPanel.tsx.

Use a single typed API client in src/api/client.ts. Handle the polling loop
cleanly (start on run, stop on complete/failed, show errors).

---

## 10. Quality requirements

- Type hints on all Python functions; Pydantic for all I/O.
- core/forecasting and core/inventory must have unit tests (pytest) that run
  WITHOUT the web layer or a real DB (use small synthetic series).
- Seed script that loads a sample dataset so the app is demo-ready out of the box.
- README with: setup steps, how to run backend + frontend, and a one-paragraph
  architecture summary.
- Comments on the inventory formulas referencing what each term means.

---

## 11. BUILD ORDER (strict — verify each phase before the next)

- **Phase 0:** Repo scaffold, both apps boot, "hello" endpoint reachable from React.
- **Phase 1:** Data layer — models, schemas, DB, upload endpoints, seed script, /data/skus.
- **Phase 2:** Forecasting core as pure modules + pytest. NO web layer yet.
- **Phase 3:** Inventory + backtest cores as pure modules + pytest. NO web layer yet.
- **Phase 4:** Wire cores into FastAPI: /forecast/run (background), status, results, /reorder/alerts, /backtest, /metrics.
- **Phase 5:** React dashboard — KPI header, status grid, run panel + polling.
- **Phase 6:** Forecast chart page with uncertainty band.
- **Phase 7:** Reorder alerts table + expandable explanations.
- **Phase 8:** Backtest comparison chart.
- **Phase 9:** Polish, seed-data demo readiness, README, tests green.

Do not start a phase until the previous one runs and is verified.
