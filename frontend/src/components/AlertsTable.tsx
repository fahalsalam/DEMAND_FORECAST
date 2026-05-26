import { useState } from "react";
import { StatusBadge } from "./StatusBadge";
import type { ReorderDecisionOut } from "../types";

interface Props {
  alerts: ReorderDecisionOut[];
}

const fmt = (n: number, digits = 1) =>
  Number.isFinite(n) ? n.toFixed(digits) : "—";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export function AlertsTable({ alerts }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (sku: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });

  if (alerts.length === 0) {
    return (
      <div className="empty-callout" style={{ maxWidth: 640, margin: "0 auto" }}>
        No SKUs match the current filter. Try toggling more statuses above.
      </div>
    );
  }

  return (
    <div className="alerts-table" role="table">
      <div className="alerts-thead" role="row">
        <div className="th th-status">Status</div>
        <div className="th th-sku">SKU</div>
        <div className="th th-name">Product</div>
        <div className="th th-num">Stock</div>
        <div className="th th-num">ROP</div>
        <div className="th th-num">Order qty</div>
        <div className="th th-num">Est. cost</div>
        <div className="th th-num th-lead">Lead</div>
        <div className="th th-caret" />
      </div>

      <div className="alerts-tbody">
        {alerts.map((a) => (
          <AlertRow
            key={a.sku}
            a={a}
            isOpen={expanded.has(a.sku)}
            onToggle={() => toggle(a.sku)}
          />
        ))}
      </div>
    </div>
  );
}

function AlertRow({
  a,
  isOpen,
  onToggle,
}: {
  a: ReorderDecisionOut;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <button
        type="button"
        role="row"
        className={`alerts-row tone-${a.status.toLowerCase()} ${isOpen ? "is-open" : ""}`}
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <div className="td td-status">
          <StatusBadge status={a.status} size="sm" />
        </div>
        <div className="td td-sku" title={a.sku}>
          <code>{a.sku}</code>
        </div>
        <div className="td td-name">
          <div className="td-name-main">{a.name}</div>
          <div className="td-name-sub">{a.category}</div>
        </div>
        <div className="td td-num">{a.current_stock}</div>
        <div className="td td-num">{Math.round(a.reorder_point)}</div>
        <div className="td td-num strong">
          {a.recommended_order_qty > 0 ? Math.round(a.recommended_order_qty) : "—"}
        </div>
        <div className="td td-num strong">
          {a.estimated_cost > 0 ? fmtCurrency(a.estimated_cost) : "—"}
        </div>
        <div className="td td-num td-lead">{a.lead_time_days}d</div>
        <div className="td td-caret" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="alerts-expand" role="row">
          <div className="alerts-expand-inner">
            <p className="explain">{a.explanation}</p>

            <div className="metrics-strip">
              <Metric label="Avg daily demand" value={fmt(a.avg_daily_demand, 2)} />
              <Metric label="Demand σ / day" value={fmt(a.demand_std, 2)} />
              <Metric label="Safety stock" value={fmt(a.safety_stock, 0)} />
              <Metric label="Reorder point" value={fmt(a.reorder_point, 0)} />
              <Metric label="EOQ" value={fmt(a.eoq, 0)} />
              <Metric label="Unit cost" value={fmtCurrency(a.unit_cost)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}
