import { useState } from "react";
import type { RunState } from "../hooks/useForecastJob";

interface Props {
  state: RunState;
  totalSkus?: number;
  onRun: (req: { service_level: number; review_period_days: number }) => void;
  onCancel?: () => void;
}

export function RunForecastPanel({ state, totalSkus, onRun, onCancel }: Props) {
  const [serviceLevel, setServiceLevel] = useState(0.95);
  const [reviewPeriod, setReviewPeriod] = useState(7);

  const isRunning = state.kind === "starting" || state.kind === "running";
  const progress =
    state.kind === "running" && totalSkus
      ? Math.min(100, ((state.status.skus_processed ?? 0) / totalSkus) * 100)
      : state.kind === "complete"
      ? 100
      : 0;

  const z = inverseNormal(serviceLevel);

  return (
    <section className="run-panel">
      <header className="run-head">
        <div>
          <h3>Run Forecast</h3>
          <p>Picks the best of ARIMA, Prophet, and LightGBM per SKU.</p>
        </div>
        <div className="run-buttons">
          <button
            className={`btn btn-primary ${isRunning ? "spinning" : ""}`}
            onClick={() =>
              onRun({ service_level: serviceLevel, review_period_days: reviewPeriod })
            }
            disabled={isRunning}
          >
            {isRunning ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                {state.kind === "starting" ? "Starting…" : "Running…"}
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Run Forecast
              </>
            )}
          </button>

          {isRunning && onCancel && (
            <button
              className="btn btn-cancel"
              onClick={onCancel}
              title="Stop this forecast — partial results are kept"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop
            </button>
          )}
        </div>
      </header>

      <div className="run-controls">
        <div className="control">
          <div className="control-head">
            <label htmlFor="sl">Service level</label>
            <span className="control-value">
              {(serviceLevel * 100).toFixed(0)}%
              <em>Z = {z.toFixed(3)}</em>
            </span>
          </div>
          <input
            id="sl"
            type="range"
            min={0.80}
            max={0.99}
            step={0.01}
            value={serviceLevel}
            onChange={(e) => setServiceLevel(Number(e.target.value))}
            disabled={isRunning}
          />
          <div className="control-hint">
            Higher service level → larger safety stock → fewer stockouts at higher
            holding cost.
          </div>
        </div>

        <div className="control">
          <div className="control-head">
            <label htmlFor="rp">Review period (days)</label>
            <span className="control-value">{reviewPeriod}d</span>
          </div>
          <input
            id="rp"
            type="range"
            min={1}
            max={30}
            step={1}
            value={reviewPeriod}
            onChange={(e) => setReviewPeriod(Number(e.target.value))}
            disabled={isRunning}
          />
          <div className="control-hint">
            Extra forecast horizon beyond lead time — covers the window between
            order reviews.
          </div>
        </div>
      </div>

      {(isRunning || state.kind === "complete" || state.kind === "failed") && (
        <div className="progress-block">
          <div className="progress-track">
            <div
              className={`progress-fill ${
                state.kind === "failed" ? "is-failed" : state.kind === "complete" ? "is-done" : ""
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="progress-meta">
            {state.kind === "starting" && <span>Queuing job…</span>}
            {state.kind === "running" && (
              <span>
                {state.status.skus_processed ?? 0}
                {totalSkus ? ` / ${totalSkus}` : ""} SKUs processed · job{" "}
                <code>{state.jobId.slice(0, 12)}</code>
              </span>
            )}
            {state.kind === "complete" && (
              <span className="ok">
                ✓ Complete — {state.status.message ?? "all SKUs forecasted."}
              </span>
            )}
            {state.kind === "failed" && (
              <span className="bad">
                ✗ Failed — {state.status.message ?? "see server logs."}
              </span>
            )}
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div className="run-error">{state.message}</div>
      )}
    </section>
  );
}

/**
 * Cheap inverse-normal approximation (Beasley-Springer 1977) so the slider
 * can show the Z factor live without a backend round-trip.
 * Accurate to ~4 decimals across 0.5 < p < 0.9999.
 */
function inverseNormal(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number, r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}
