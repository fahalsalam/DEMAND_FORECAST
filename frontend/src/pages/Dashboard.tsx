import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { HowItWorks } from "../components/HowItWorks";
import { KpiHeader } from "../components/KpiHeader";
import { RunForecastPanel } from "../components/RunForecastPanel";
import { StatusGrid } from "../components/StatusGrid";
import { useForecastJob } from "../hooks/useForecastJob";
import type {
  MetricsSummary,
  ReorderDecisionOut,
  SkuSummary,
} from "../types";

const LAST_JOB_KEY = "df:lastJobId";
const HIW_KEY = "df:hideHowItWorks";

export function Dashboard() {
  const { state, run } = useForecastJob();
  const [skus, setSkus] = useState<SkuSummary[]>([]);
  const [skusLoading, setSkusLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [alerts, setAlerts] = useState<ReorderDecisionOut[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HIW_KEY) !== "1";
    } catch {
      return true;
    }
  });

  const dismissGuide = useCallback(() => {
    try {
      localStorage.setItem(HIW_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowGuide(false);
  }, []);

  const openGuide = useCallback(() => {
    try {
      localStorage.removeItem(HIW_KEY);
    } catch {
      /* ignore */
    }
    setShowGuide(true);
  }, []);

  // SKUs are independent of jobs — load once.
  useEffect(() => {
    (async () => {
      try {
        const data = await api.getSkus();
        setSkus(data);
      } catch {
        /* surfaced via empty grid */
      } finally {
        setSkusLoading(false);
      }
    })();
  }, []);

  const loadJobResults = useCallback(async (jobId: string) => {
    setResultsLoading(true);
    setLoadError(null);
    try {
      const [m, a] = await Promise.all([
        api.getMetrics(jobId),
        api.getAlerts(jobId, { status: "ALL" }),
      ]);
      setMetrics(m);
      setAlerts(a);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.status} — ${err.message}`
          : err instanceof Error
          ? err.message
          : "Unknown error";
      setLoadError(msg);
    } finally {
      setResultsLoading(false);
    }
  }, []);

  // Eager preload — try the cached job id first; if none, ask the backend
  // for the most recent job and cache it so the dashboard always lights up
  // when there's any forecast data available.
  useEffect(() => {
    (async () => {
      let jobId: string | null = null;
      try {
        jobId = localStorage.getItem(LAST_JOB_KEY);
      } catch {
        /* localStorage may be unavailable */
      }
      if (!jobId) {
        try {
          const latest = await api.getLatestJob();
          jobId = latest.job_id;
          try {
            localStorage.setItem(LAST_JOB_KEY, jobId);
          } catch {
            /* ignore */
          }
        } catch {
          // No jobs in the DB yet — that's fine, user can click Run Forecast.
          return;
        }
      }
      void loadJobResults(jobId);
    })();
  }, [loadJobResults]);

  // Refresh whenever the job state transitions (live updates during runs).
  useEffect(() => {
    if (state.kind === "complete" || state.kind === "running") {
      void loadJobResults(state.jobId);
    }
  }, [state, loadJobResults]);

  return (
    <main className="page dashboard">
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Demand intelligence at a glance — KPIs, status grid, and the run-forecast trigger.</p>
        </div>
        {!showGuide && (
          <button
            type="button"
            className="btn btn-ghost help-btn"
            onClick={openGuide}
            title="Show the Run Forecast guide"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            How it works
          </button>
        )}
      </header>

      <KpiHeader metrics={metrics} loading={resultsLoading && !metrics} />

      {showGuide && <HowItWorks onDismiss={dismissGuide} />}

      <RunForecastPanel
        state={state}
        totalSkus={skus.length || metrics?.total_skus}
        onRun={(req) => run(req)}
      />

      {loadError && (
        <div className="banner banner-error">
          Couldn't load job results: {loadError}
        </div>
      )}

      <StatusGrid
        alerts={alerts}
        skus={skus}
        loading={skusLoading && alerts.length === 0}
      />
    </main>
  );
}
