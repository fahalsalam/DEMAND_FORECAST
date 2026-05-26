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

  // Resume any cached job on mount — survives reloads.
  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) return;
    void (async () => {
      try {
        const s = await api.getForecastStatus(cached);
        if (s.status === "complete") {
          setState({ kind: "complete", jobId: cached, status: s });
        } else if (s.status === "failed") {
          setState({ kind: "failed", jobId: cached, status: s });
        } else {
          startPolling(cached);
        }
      } catch {
        // Stale cache — silently clear and move on.
        localStorage.removeItem(STORAGE_KEY);
      }
    })();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  return { state, run };
}
