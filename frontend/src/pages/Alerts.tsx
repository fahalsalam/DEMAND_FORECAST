import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { AlertsTable } from "../components/AlertsTable";
import type { ReorderDecisionOut, ReorderStatus } from "../types";

const LAST_JOB_KEY = "df:lastJobId";

const ALL_STATUSES: ReorderStatus[] = [
  "STOCKOUT_RISK",
  "REORDER_NOW",
  "OVERSTOCK",
  "HEALTHY",
];

const DEFAULT_SELECTED: ReorderStatus[] = ["STOCKOUT_RISK", "REORDER_NOW"];

const STATUS_LABEL: Record<ReorderStatus, string> = {
  STOCKOUT_RISK: "Stockout risk",
  REORDER_NOW: "Reorder now",
  OVERSTOCK: "Overstock",
  HEALTHY: "Healthy",
};

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

function loadLastJobId(): string | null {
  try {
    return localStorage.getItem(LAST_JOB_KEY);
  } catch {
    return null;
  }
}

export function Alerts() {
  const [jobId, setJobId] = useState<string | null>(loadLastJobId);
  const [allAlerts, setAllAlerts] = useState<ReorderDecisionOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<ReorderStatus>>(
    () => new Set(DEFAULT_SELECTED)
  );

  // Pick up a job_id change from another tab.
  useEffect(() => {
    const refresh = () => setJobId(loadLastJobId());
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  // Load everything once (so filtering is instant + accurate counts per bucket).
  const load = useCallback(async (jid: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAlerts(jid, { status: "ALL" });
      setAllAlerts(data);
    } catch (err) {
      setAllAlerts([]);
      setError(
        err instanceof ApiError
          ? `${err.status} — ${err.message}`
          : err instanceof Error
          ? err.message
          : "Unknown error"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (jobId) void load(jobId);
  }, [jobId, load]);

  const counts = useMemo(() => {
    const c: Record<ReorderStatus, number> = {
      STOCKOUT_RISK: 0,
      REORDER_NOW: 0,
      OVERSTOCK: 0,
      HEALTHY: 0,
    };
    for (const a of allAlerts) c[a.status]++;
    return c;
  }, [allAlerts]);

  const filtered = useMemo(
    () => allAlerts.filter((a) => selected.has(a.status)),
    [allAlerts, selected]
  );

  const totalEstCost = useMemo(
    () => filtered.reduce((s, a) => s + a.estimated_cost, 0),
    [filtered]
  );

  const toggle = (s: ReorderStatus) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s)) {
        if (next.size === 1) return prev;          // never empty the set
        next.delete(s);
      } else {
        next.add(s);
      }
      return next;
    });
  };

  const allSelected = ALL_STATUSES.every((s) => selected.has(s));
  const setAll = () => setSelected(new Set(ALL_STATUSES));
  const setDefault = () => setSelected(new Set(DEFAULT_SELECTED));

  return (
    <main className="page alerts-page">
      <header className="page-header">
        <div>
          <h1>Reorder alerts</h1>
          <p>Every recommendation comes with the forecast, lead-time demand, reorder point, and EOQ chain it was derived from.</p>
        </div>
      </header>

      {!jobId && (
        <div className="empty-callout" style={{ maxWidth: 640, margin: "0 auto" }}>
          No forecast run yet. Open the Dashboard tab and click{" "}
          <strong>Run Forecast</strong> first.
        </div>
      )}

      {jobId && (
        <section className="alerts-panel">
          <header className="alerts-head">
            <div className="alerts-filters">
              <span className="filter-label">Filter</span>
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  className={`filter-pill filter-pill-${s.toLowerCase()} ${
                    selected.has(s) ? "is-on" : ""
                  }`}
                  onClick={() => toggle(s)}
                  type="button"
                >
                  {STATUS_LABEL[s]}
                  <span className="filter-count">{counts[s]}</span>
                </button>
              ))}
              <div className="filter-spacer" />
              <button className="filter-link" type="button" onClick={setDefault}>
                At-risk only
              </button>
              <button
                className="filter-link"
                type="button"
                onClick={setAll}
                disabled={allSelected}
              >
                All
              </button>
            </div>

            <div className="alerts-summary">
              <div>
                <div className="sum-label">Showing</div>
                <div className="sum-value">
                  {filtered.length}{" "}
                  <span className="sum-sub">/ {allAlerts.length} SKUs</span>
                </div>
              </div>
              <div>
                <div className="sum-label">Estimated reorder spend</div>
                <div className="sum-value">{fmtCurrency(totalEstCost)}</div>
              </div>
            </div>
          </header>

          {loading && (
            <div className="chart-skeleton">
              <div className="kpi-skel-bar" style={{ width: "100%", height: 320 }} />
            </div>
          )}

          {!loading && error && (
            <div className="run-error" style={{ marginTop: 16 }}>{error}</div>
          )}

          {!loading && !error && <AlertsTable alerts={filtered} />}
        </section>
      )}
    </main>
  );
}
