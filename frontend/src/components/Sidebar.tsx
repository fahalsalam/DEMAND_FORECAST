import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { PageKey } from "./PageTabs";
import type { AuthUser } from "../hooks/useAuth";
import type { ConnectionState } from "../types";

type IconKind = "dashboard" | "chart" | "alerts" | "compare" | "data" | "inspector" | "logout";

interface NavItem {
  key: PageKey;
  label: string;
  icon: IconKind;
  description: string;
}

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard", description: "KPIs + run forecast" },
  { key: "forecasts", label: "Forecasts", icon: "chart",     description: "Per-SKU forecast band" },
  { key: "alerts",    label: "Alerts",    icon: "alerts",    description: "Reorder + stockout risk" },
  // Backtest is hidden from the menu but the page is still functional —
  // re-enable by uncommenting the entry below.
  // { key: "backtest", label: "Backtest", icon: "compare", description: "Baseline vs system" },
  { key: "inspector", label: "Inspector", icon: "inspector", description: "See the model pipeline" },
  { key: "data",      label: "Data",      icon: "data",      description: "Upload products + sales" },
];

interface Props {
  active: PageKey;
  onNavigate: (k: PageKey) => void;
  user: AuthUser;
  onSignOut: () => void;
}

function ConnectionChip() {
  const [state, setState] = useState<ConnectionState>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      const start = performance.now();
      try {
        const data = await api.getHealth();
        if (!alive) return;
        setState({ kind: "ok", data, latencyMs: Math.round(performance.now() - start) });
      } catch (err) {
        if (!alive) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : "unreachable" });
      }
    };
    void ping();
    const id = window.setInterval(ping, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const cls =
    state.kind === "ok" ? "ok" : state.kind === "loading" ? "loading" : "error";
  const label =
    state.kind === "ok"
      ? `API · ${state.latencyMs}ms`
      : state.kind === "loading"
      ? "API · checking"
      : "API · offline";

  return (
    <span className={`status-pill status-pill-tiny ${cls}`}>
      <span className="pulse" />
      {label}
    </span>
  );
}

export function Sidebar({ active, onNavigate, user, onSignOut }: Props) {
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 17 9 11 13 15 21 7" />
            <polyline points="14 7 21 7 21 14" />
          </svg>
        </div>
        <div className="brand-text">
          Demand Forecast
          <small>Auto-Reorder</small>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav" aria-label="Main">
        <div className="sidebar-section">Workspace</div>
        {NAV.map((item) => {
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              type="button"
              className={`sidebar-link ${isActive ? "is-active" : ""}`}
              onClick={() => onNavigate(item.key)}
              aria-current={isActive ? "page" : undefined}
            >
              <NavIcon kind={item.icon} />
              <span className="sidebar-link-text">
                <span className="sidebar-link-label">{item.label}</span>
                <span className="sidebar-link-desc">{item.description}</span>
              </span>
              {isActive && <span className="sidebar-link-rail" aria-hidden />}
            </button>
          );
        })}

        <div className="sidebar-section">System</div>
        <a
          className="sidebar-link sidebar-link-quiet"
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noreferrer"
        >
          <NavIcon kind="dashboard" />
          <span className="sidebar-link-text">
            <span className="sidebar-link-label">API docs</span>
            <span className="sidebar-link-desc">FastAPI Swagger</span>
          </span>
        </a>
      </nav>

      {/* User panel */}
      <div className="sidebar-user">
        <div className="user-row">
          <div className="user-avatar" aria-hidden>{initials}</div>
          <div className="user-meta">
            <div className="user-name">{user.name}</div>
            <div className="user-role">{user.role}</div>
          </div>
        </div>

        <div className="user-foot">
          <ConnectionChip />
          <button className="logout-btn" onClick={onSignOut} type="button" title="Sign out">
            <NavIcon kind="logout" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavIcon({ kind }: { kind: IconKind }) {
  return (
    <span className="sidebar-icon" aria-hidden>
      {kind === "dashboard" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="2" />
          <rect x="14" y="3" width="7" height="5" rx="2" />
          <rect x="14" y="12" width="7" height="9" rx="2" />
          <rect x="3" y="16" width="7" height="5" rx="2" />
        </svg>
      )}
      {kind === "chart" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 17 9 11 13 15 21 7" />
          <polyline points="14 7 21 7 21 14" />
        </svg>
      )}
      {kind === "alerts" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
      )}
      {kind === "compare" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="10" width="6" height="11" rx="1" />
          <rect x="15" y="4" width="6" height="17" rx="1" />
          <path d="M12 4v17" strokeDasharray="2 3" opacity=".6" />
        </svg>
      )}
      {kind === "data" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
          <path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6" />
        </svg>
      )}
      {kind === "inspector" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      )}
      {kind === "logout" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      )}
    </span>
  );
}
