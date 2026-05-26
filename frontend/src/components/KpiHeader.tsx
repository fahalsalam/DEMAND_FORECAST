import type { MetricsSummary } from "../types";

interface Props {
  metrics: MetricsSummary | null;
  loading?: boolean;
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

interface Tile {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  icon: React.ReactNode;
}

export function KpiHeader({ metrics, loading }: Props) {
  const tiles: Tile[] = metrics
    ? [
        {
          label: "Average MAPE",
          value: fmtPercent(metrics.avg_mape),
          hint: `${Object.values(metrics.model_usage).reduce((a, b) => a + b, 0)} SKUs forecasted`,
          tone: !metrics.avg_mape
            ? "neutral"
            : metrics.avg_mape < 15
            ? "good"
            : metrics.avg_mape < 30
            ? "warn"
            : "bad",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 17 9 11 13 15 21 7" />
              <polyline points="14 7 21 7 21 14" />
            </svg>
          ),
        },
        {
          label: "At-risk SKUs",
          value: String(metrics.at_risk_count),
          hint: `${metrics.status_counts.STOCKOUT_RISK} stockout · ${metrics.status_counts.REORDER_NOW} reorder`,
          tone: metrics.at_risk_count === 0 ? "good" : metrics.at_risk_count > 5 ? "bad" : "warn",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ),
        },
        {
          label: "Inventory value",
          value: fmtCurrency(metrics.total_inventory_value),
          hint: `${metrics.total_skus} active SKUs`,
          tone: "neutral",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="7" width="18" height="13" rx="2" />
              <path d="M8 7V5a4 4 0 018 0v2" />
            </svg>
          ),
        },
        {
          label: "Recommended orders",
          value: fmtCurrency(metrics.total_recommended_order_value),
          hint: "Estimated cost of all open reorders",
          tone: "neutral",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
            </svg>
          ),
        },
      ]
    : [];

  // Three states:
  //  - loading        -> shimmer skeletons
  //  - no metrics yet -> "—" empty tiles with helpful hints (NOT skeletons,
  //                       which look broken when no job has ever run)
  //  - have metrics   -> populated tiles
  const labels = ["Average MAPE", "At-risk SKUs", "Inventory value", "Recommended orders"];

  if (loading) {
    return (
      <section className="kpi-row" aria-label="Key metrics">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="kpi-tile kpi-skeleton">
            <div className="kpi-icon kpi-skel-icon" />
            <div className="kpi-skel-bar" style={{ width: "60%" }} />
            <div className="kpi-skel-bar" style={{ width: "35%", height: 22 }} />
            <div className="kpi-skel-bar" style={{ width: "50%" }} />
          </div>
        ))}
      </section>
    );
  }

  if (!metrics) {
    return (
      <section className="kpi-row" aria-label="Key metrics">
        {labels.map((label) => (
          <div key={label} className="kpi-tile kpi-empty">
            <div className="kpi-icon">·</div>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value muted">—</div>
            <div className="kpi-hint">Run a forecast to populate</div>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section className="kpi-row" aria-label="Key metrics">
      {tiles.map((t) => (
        <div key={t.label} className={`kpi-tile kpi-tone-${t.tone ?? "neutral"}`}>
          <div className="kpi-icon">{t.icon}</div>
          <div className="kpi-label">{t.label}</div>
          <div className="kpi-value">{t.value}</div>
          {t.hint && <div className="kpi-hint">{t.hint}</div>}
        </div>
      ))}
    </section>
  );
}
