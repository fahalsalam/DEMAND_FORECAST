import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../api/client";
import type { ConnectionState } from "../types";

function fmtTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function HealthCard() {
  const [state, setState] = useState<ConnectionState>({ kind: "idle" });

  const ping = useCallback(async () => {
    setState({ kind: "loading" });
    const start = performance.now();
    try {
      const data = await api.getHealth();
      const latencyMs = Math.round(performance.now() - start);
      setState({ kind: "ok", data, latencyMs });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `${err.status} — ${err.message}`
          : err instanceof Error
          ? err.message
          : "Unknown error";
      setState({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    void ping();
  }, [ping]);

  const pill =
    state.kind === "ok" ? (
      <span className="status-pill ok">
        <span className="pulse" />
        Connected
      </span>
    ) : state.kind === "error" ? (
      <span className="status-pill error">
        <span className="pulse" />
        Unreachable
      </span>
    ) : (
      <span className="status-pill loading">
        <span className="pulse" />
        Checking
      </span>
    );

  return (
    <div className="status-card" aria-live="polite">
      <div className="status-head">
        <h3>Backend Connection</h3>
        {pill}
      </div>

      {state.kind === "ok" && (
        <div className="status-grid">
          <div>
            <label>Service</label>
            <span>{state.data.service}</span>
          </div>
          <div>
            <label>Version</label>
            <span>{state.data.version}</span>
          </div>
          <div>
            <label>Latency</label>
            <span>{state.latencyMs} ms</span>
          </div>
          <div>
            <label>Server time</label>
            <span>{fmtTimestamp(state.data.timestamp)}</span>
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div className="status-grid">
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Error</label>
            <span>{state.message}</span>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Hint</label>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13 }}>
              Make sure the FastAPI server is running on{" "}
              <code style={{ fontFamily: "var(--font-mono)" }}>
                {api.baseUrl}
              </code>
              .
            </span>
          </div>
        </div>
      )}

      {state.kind === "loading" && (
        <div className="status-grid">
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Status</label>
            <span>Reaching the backend…</span>
          </div>
        </div>
      )}

      <div className="status-foot">
        <span className="api-base">{api.baseUrl}/health</span>
        <button
          className={`btn${state.kind === "loading" ? " spinning" : ""}`}
          onClick={() => void ping()}
          disabled={state.kind === "loading"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          {state.kind === "loading" ? "Pinging…" : "Re-check"}
        </button>
      </div>
    </div>
  );
}
