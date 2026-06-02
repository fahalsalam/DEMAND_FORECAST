/**
 * useForecastJob — start a forecast, poll /forecast/status every 2 s,
 * surface progress, and stop on complete/failed. Caches the last job_id
 * in localStorage so a page refresh doesn't lose context.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import type {
  ForecastRunRequest,
  ForecastStatusResponse,
  JobStatus,
} from "../types";

const POLL_INTERVAL_MS = 2_000;
const STORAGE_KEY = "df:lastJobId";

export type RunState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "running"; jobId: string; status: ForecastStatusResponse }
  | { kind: "complete"; jobId: string; status: ForecastStatusResponse }
  | { kind: "failed"; jobId: string; status: ForecastStatusResponse }
  | { kind: "error"; message: string };

export function useForecastJob() {
  const [state, setState] = useState<RunState>(() => {
    const cached = typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY);
    return cached
      ? { kind: "idle" } // hydrated below in the resume effect
      : { kind: "idle" };
  });
  const pollTimer = useRef<number | null>(null);
  const activeJob = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    activeJob.current = null;
  }, []);

  const pollOnce = useCallback(async (jobId: string) => {
    try {
      const s = await api.getForecastStatus(jobId);
      const terminal: JobStatus[] = ["complete", "failed"];
      if (terminal.includes(s.status)) {
        stopPolling();
        setState({
          kind: s.status as "complete" | "failed",
          jobId,
          status: s,
        });
      } else {
        setState({ kind: "running", jobId, status: s });
      }
    } catch (err) {
      stopPolling();
      const msg =
        err instanceof ApiError
          ? `${err.status} — ${err.message}`
          : err instanceof Error
          ? err.message
          : "Unknown error";
      setState({ kind: "error", message: msg });
    }
  }, [stopPolling]);

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      activeJob.current = jobId;
      // First poll happens immediately so the UI updates without a 2 s wait.
      void pollOnce(jobId);
      pollTimer.current = window.setInterval(() => {
        if (activeJob.current === jobId) void pollOnce(jobId);
      }, POLL_INTERVAL_MS);
    },
    [pollOnce, stopPolling]
  );

  const run = useCallback(
    async (req: ForecastRunRequest) => {
      setState({ kind: "starting" });
      try {
        const { job_id } = await api.runForecast(req);
        localStorage.setItem(STORAGE_KEY, job_id);
        startPolling(job_id);
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? `${err.status} — ${err.message}`
            : err instanceof Error
            ? err.message
            : "Unknown error";
        setState({ kind: "error", message: msg });
      }
    },
    [startPolling]
  );

  const cancel = useCallback(async () => {
    // Only cancellable while a job is in flight.
    if (state.kind !== "running" && state.kind !== "starting") return;
    const jobId = state.kind === "running" ? state.jobId : null;
    if (!jobId) {
      // Hadn't gotten a job_id yet — just reset local state.
      stopPolling();
      setState({ kind: "idle" });
      return;
    }
    try {
      const updated = await api.cancelForecast(jobId);
      stopPolling();
      setState({ kind: "failed", jobId, status: updated });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.status} — ${err.message}`
          : err instanceof Error
          ? err.message
          : "Unknown error";
      setState({ kind: "error", message: msg });
    }
  }, [state, stopPolling]);

  // On mount: hydrate from the cached job_id; if none, ask the backend for
  // the latest job (so the timer + status reflect reality even on a fresh
  // browser session). Mirrors the Dashboard's eager preload.
  useEffect(() => {
    let aborted = false;
    void (async () => {
      let jobId = (() => {
        try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
      })();
      if (!jobId) {
        try {
          const latest = await api.getLatestJob();
          jobId = latest.job_id;
          try { localStorage.setItem(STORAGE_KEY, jobId); } catch { /* ignore */ }
        } catch {
          return; // no jobs in DB yet — stay idle
        }
      }
      if (aborted || !jobId) return;
      try {
        const s = await api.getForecastStatus(jobId);
        if (aborted) return;
        if (s.status === "complete") {
          setState({ kind: "complete", jobId, status: s });
        } else if (s.status === "failed") {
          setState({ kind: "failed", jobId, status: s });
        } else {
          startPolling(jobId);
        }
      } catch {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      }
    })();
    return () => {
      aborted = true;
      stopPolling();
    };
  }, [startPolling, stopPolling]);

  return { state, run, cancel };
}
