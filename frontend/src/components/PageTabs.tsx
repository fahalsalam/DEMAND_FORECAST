export type PageKey = "dashboard" | "forecasts" | "alerts" | "backtest" | "data" | "inspector";

interface Tab {
  key: PageKey;
  label: string;
  phase: number;
  enabled: boolean;
}

const TABS: Tab[] = [
  { key: "dashboard", label: "Dashboard", phase: 5, enabled: true },
  { key: "forecasts", label: "Forecasts", phase: 6, enabled: true },
  { key: "alerts",    label: "Alerts",    phase: 7, enabled: true },
  { key: "backtest",  label: "Backtest",  phase: 8, enabled: true },
  { key: "inspector", label: "Inspector", phase: 8, enabled: true },
  { key: "data",      label: "Data",      phase: 1, enabled: true },
];

export function PageTabs({
  active,
  onChange,
}: {
  active: PageKey;
  onChange: (k: PageKey) => void;
}) {
  return (
    <div className="page-tabs" role="tablist" aria-label="Pages">
      {TABS.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          className={`page-tab ${active === t.key ? "is-active" : ""} ${
            t.enabled ? "" : "is-disabled"
          }`}
          onClick={() => t.enabled && onChange(t.key)}
          disabled={!t.enabled}
          title={t.enabled ? undefined : `Coming in Phase ${t.phase}`}
        >
          {t.label}
          {!t.enabled && <span className="tab-soon">Phase {t.phase}</span>}
        </button>
      ))}
    </div>
  );
}
