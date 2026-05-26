# BUILD_PROMPTS.md — Phased prompts to paste into Claude Code

## How to use this

1. Put `PROJECT_SPEC.md` in the root of an empty folder.
2. Open Claude Code in that folder.
3. Paste the **Kickoff prompt** first. Then paste each **Phase prompt** one at a
   time, ONLY after you've verified the previous phase actually runs.
4. After each phase, manually run the app / tests yourself before moving on.
   Don't let it race ahead — verifying as you go is what keeps the codebase sane
   and is exactly how you'll be able to explain every part in your viva.

---

## KICKOFF PROMPT (paste once, first)

> Read PROJECT_SPEC.md in full before doing anything. It is the source of truth
> for this project — follow its tech stack, data model, architecture, and build
> order exactly. Do not deviate from the stack or invent extra features.
>
> Confirm you've read it by giving me back, in your own words: (a) the two
> academic core ideas, (b) the hard architectural rule about the core modules,
> and (c) the strict build order. Then STOP and wait — do not write any code yet.
>
> We will build strictly one phase at a time. After each phase you will tell me
> exactly how to run and verify that phase before we continue. Never start a new
> phase until I confirm the previous one works.

---

## PHASE 0 — Scaffold

> Phase 0 only. Create the repo scaffold per PROJECT_SPEC section 3 and 11:
> a `backend/` FastAPI app and a `frontend/` React+TS+Vite app. Set up the
> folder structure exactly as in the spec (api/, core/forecasting/,
> core/inventory/, jobs/, models/, schemas/, db.py). Add requirements.txt and
> package.json with the pinned libraries from section 2.
>
> Add one health-check endpoint GET /health returning {status:"ok"}, and a
> minimal React page that calls it and displays the result, to prove the two
> apps talk. Configure CORS so the Vite dev server can reach FastAPI.
>
> Then give me the exact commands to install deps and run both apps, and tell me
> what I should see in the browser. Stop after this.

---

## PHASE 1 — Data layer

> Phase 1 only. Implement the full data model from PROJECT_SPEC section 4 as
> SQLAlchemy models, the matching Pydantic schemas (section 8), db.py with
> session handling, and the three CSV upload endpoints with validation
> (reject negative quantities, unparseable dates, missing columns — return clear
> errors). Implement GET /data/skus.
>
> Write a seed script (backend/seed.py) that generates a realistic synthetic
> dataset: ~30 SKUs across a few categories, ~2 years of daily sales with
> weekly seasonality and a couple of seasonal/promo spikes, a product master
> with varied lead times and costs, and current inventory levels. Make some SKUs
> deliberately low-stock and some overstocked so the demo shows all four statuses.
> Also make 2-3 SKUs "new" (under 60 days history) to exercise the cold-start path.
>
> Give me commands to create the DB, run the seed, and curl /data/skus to verify.
> Stop after this.

---

## PHASE 2 — Forecasting core (pure, no web)

> Phase 2 only. Implement core/forecasting/ per PROJECT_SPEC section 5:
> arima_model.py, prophet_model.py, lgbm_model.py, and selector.py.
>
> Critical requirements:
> - Time-based split only (last 28 days validation). Never random.
> - selector.py runs all three models, computes MAE/RMSE/MAPE on validation,
>   picks lowest MAPE, refits winner on full history, returns forecast WITH
>   prediction interval (yhat, yhat_lower, yhat_upper), chosen_model, model_mape.
> - Handle ALL edge cases in section 5: cold start (<60 days -> category-avg
>   fallback), sparse/all-zero series, and per-SKU failure isolation.
> - These modules must NOT import FastAPI or touch the DB. Inputs are pandas
>   Series/DataFrames, outputs are plain dataclasses or dicts.
>
> Write pytest tests using small synthetic series (no DB, no web) that verify:
> a clean seasonal series picks a sensible model, a <60-day series hits the
> fallback, and an all-zero series doesn't crash. Give me the command to run the
> tests and show me they pass. Stop after this.

---

## PHASE 3 — Inventory + backtest core (pure, no web)

> Phase 3 only. Implement core/inventory/reorder.py and
> core/inventory/backtest.py per PROJECT_SPEC sections 6 and 7.
>
> reorder.py: pure functions for safety_stock, reorder_point, EOQ, the status
> decision rule, and the human-readable explanation string. Use scipy.stats
> norm.ppf for the service-level Z factor. Comment each formula with what the
> terms mean.
>
> backtest.py: the day-by-day baseline-vs-system simulation that outputs the
> comparison numbers (stockout days, avg inventory, holding cost, overstock units).
>
> No DB, no web imports. Write pytest tests with hand-checked numeric examples:
> verify that higher demand uncertainty produces larger safety stock, that a
> stock level below the lead-time demand triggers STOCKOUT_RISK, and that the
> backtest produces sane comparison numbers. Run the tests and show me they pass.
> Stop after this.

---

## PHASE 4 — Wire cores into the API

> Phase 4 only. Implement the forecast/reorder/backtest/metrics endpoints from
> PROJECT_SPEC section 8, orchestrating the Phase 2 and 3 cores.
>
> - POST /forecast/run creates a forecast_jobs row (status running), launches a
>   FastAPI BackgroundTask, and returns {job_id} IMMEDIATELY without blocking.
> - The background task loops over SKUs, runs the forecasting core, then the
>   inventory core, writes forecast_results and reorder_decisions, and marks the
>   job complete (or failed with a message). One SKU failing must not fail the job.
> - GET /forecast/status/{job_id}, GET /forecast/{sku}, GET /reorder/alerts,
>   GET /backtest/{sku}, GET /metrics/{job_id} as specified.
>
> Give me curl commands to: start a run, poll status until complete, then fetch a
> forecast, the alerts, and the metrics. Show me realistic output. Stop after this.

---

## PHASE 5 — Dashboard shell + run/poll

> Phase 5 only. Build the React Dashboard page: a typed API client in
> src/api/client.ts with TS types mirroring the Pydantic schemas; a KpiHeader,
> a StatusGrid (color-coded by the four statuses), and a RunForecastPanel with a
> service-level slider and a "Run Forecast" button.
>
> Implement the polling loop cleanly: clicking Run calls /forecast/run, then
> polls /forecast/status every 2s, shows progress, stops on complete/failed,
> handles errors, and on completion loads /metrics and /reorder/alerts to fill
> the KPI header and status grid. Tell me how to run it and what I should see.
> Stop after this.

---

## PHASE 6 — Forecast chart

> Phase 6 only. Build the Forecasts page and ForecastChart.tsx with Recharts:
> a SKU selector, then a chart showing historical actuals as a solid line, the
> forecast as a continuation, and the prediction interval as a shaded band
> between yhat_lower and yhat_upper. Display the chosen model and its MAPE
> prominently. Stop after this.

---

## PHASE 7 — Reorder alerts + explanations

> Phase 7 only. Build the Reorder Alerts page and AlertsTable.tsx: a table of
> REORDER_NOW and STOCKOUT_RISK SKUs with recommended quantity and estimated
> cost (qty * unit_cost). Clicking a row expands to show the full `explanation`
> string from the decision. Add filter toggles by status. Stop after this.

---

## PHASE 8 — Backtest chart

> Phase 8 only. Build the Backtest page and BacktestChart.tsx: a SKU selector
> and a grouped bar chart comparing baseline vs system on stockout days and
> average inventory held, plus a short summary line stating the improvement
> (e.g. "stockout days reduced from 12 to 3"). Stop after this.

---

## PHASE 9 — Polish + docs

> Phase 9 only. Final pass: ensure the seed dataset makes the app fully
> demo-ready on a fresh clone (all four statuses visible, charts populated after
> one forecast run). Write the README per PROJECT_SPEC section 10 with setup,
> run instructions, and the architecture paragraph. Make sure all pytest tests
> pass. List anything in the spec not yet implemented. Stop after this.

---

## Tips while running this with Claude Code

- If a phase output is too big or goes off-spec, say: "This deviates from
  PROJECT_SPEC section X — fix it to match before continuing."
- Keep each phase in its own commit. If a phase breaks things, you can roll back
  cleanly without losing earlier working phases.
- When something errors, paste the FULL error back to Claude Code rather than
  describing it. It fixes faster from the real traceback.
- Before your viva, re-read PROJECT_SPEC yourself — it's also your study guide
  for the questions the panel will ask (model selection, time-based validation,
  uncertainty-driven safety stock, cold start).
