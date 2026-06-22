import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import type { ReorderDecisionOut } from "../types";

const STATUS_LABEL: Record<string, string> = {
  STOCKOUT_RISK: "Stockout Risk",
  REORDER_NOW: "Reorder Now",
  HEALTHY: "Healthy",
  OVERSTOCK: "Overstock",
};

const STATUS_CLASS: Record<string, string> = {
  STOCKOUT_RISK: "badge-danger",
  REORDER_NOW: "badge-warning",
  HEALTHY: "badge-success",
  OVERSTOCK: "badge-info",
};

export function SupplierPortal() {
  const { user, signOut } = useAuth();
  const [orders, setOrders] = useState<ReorderDecisionOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.supplierToken) return;
    setLoading(true);
    api.getSupplierOrders(user.supplierToken)
      .then(setOrders)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user?.supplierToken]);

  const totalUnits = orders.reduce((s, o) => s + o.recommended_order_qty, 0);
  const totalCost = orders.reduce((s, o) => s + o.estimated_cost, 0);
  const urgent = orders.filter(
    (o) => o.status === "STOCKOUT_RISK" || o.status === "REORDER_NOW"
  ).length;

  return (
    <div className="supplier-portal">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="sp-header">
        <div className="sp-header-left">
          <div className="sp-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <div>
              <div className="sp-brand-title">Supplier Portal</div>
              <div className="sp-brand-sub">Demand Forecast System</div>
            </div>
          </div>
        </div>
        <div className="sp-header-right">
          <div className="sp-user">
            <div className="sp-user-name">{user?.supplierName}</div>
            <div className="sp-user-email">{user?.email}</div>
          </div>
          <button className="btn btn-ghost sp-signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="sp-main">
        {/* ─── Page title ─────────────────────────────────────────── */}
        <div className="sp-page-header">
          <div>
            <h1 className="sp-title">Pending Reorder Items</h1>
            <p className="sp-subtitle">
              Items from the latest completed forecast run that are assigned to your account.
            </p>
          </div>
        </div>

        {/* ─── Summary tiles ──────────────────────────────────────── */}
        {!loading && !error && orders.length > 0 && (
          <div className="sp-tiles">
            <div className="sp-tile">
              <div className="sp-tile-val">{orders.length}</div>
              <div className="sp-tile-label">Total SKUs</div>
            </div>
            <div className="sp-tile sp-tile-urgent">
              <div className="sp-tile-val">{urgent}</div>
              <div className="sp-tile-label">Urgent Items</div>
            </div>
            <div className="sp-tile">
              <div className="sp-tile-val">{Math.round(totalUnits).toLocaleString()}</div>
              <div className="sp-tile-label">Total Units</div>
            </div>
            <div className="sp-tile">
              <div className="sp-tile-val">${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              <div className="sp-tile-label">Est. Order Value</div>
            </div>
          </div>
        )}

        {/* ─── States ─────────────────────────────────────────────── */}
        {loading && (
          <div className="sp-state">
            <div className="spinner" />
            <p>Loading your orders…</p>
          </div>
        )}

        {error && (
          <div className="sp-state sp-state-error">
            <p>Could not load orders: {error}</p>
            <p className="sp-state-hint">Make sure the backend server is running, then refresh.</p>
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="sp-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, opacity: 0.3 }}>
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            </svg>
            <p>No reorder items found for your account.</p>
            <p className="sp-state-hint">
              The retailer needs to run a forecast first. Check back once a forecast job completes.
            </p>
          </div>
        )}

        {/* ─── Orders table ───────────────────────────────────────── */}
        {!loading && !error && orders.length > 0 && (
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th className="num">Current Stock</th>
                  <th className="num">Order Qty</th>
                  <th className="num">Unit Cost</th>
                  <th className="num">Est. Cost</th>
                  <th className="num">Lead Time</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.sku} className={o.status === "STOCKOUT_RISK" ? "sp-row-urgent" : ""}>
                    <td><code className="sku-code">{o.sku}</code></td>
                    <td className="sp-name">{o.name}</td>
                    <td>{o.category}</td>
                    <td>
                      <span className={`badge ${STATUS_CLASS[o.status] ?? "badge-info"}`}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </td>
                    <td className="num">{o.current_stock.toLocaleString()}</td>
                    <td className="num sp-qty">{Math.round(o.recommended_order_qty).toLocaleString()}</td>
                    <td className="num">${o.unit_cost.toFixed(2)}</td>
                    <td className="num sp-cost">${o.estimated_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="num">{o.lead_time_days}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── Explanation accordion ──────────────────────────────── */}
        {!loading && !error && orders.length > 0 && (
          <details className="sp-explain">
            <summary>What do these statuses mean?</summary>
            <div className="sp-explain-body">
              <dl>
                <dt><span className="badge badge-danger">Stockout Risk</span></dt>
                <dd>Current stock is critically low — expected to run out before the next order arrives. Fulfil these first.</dd>
                <dt><span className="badge badge-warning">Reorder Now</span></dt>
                <dd>Stock has dropped below the reorder point. An order should be placed within the lead time window.</dd>
                <dt><span className="badge badge-success">Healthy</span></dt>
                <dd>Stock levels are sufficient. No immediate action required.</dd>
                <dt><span className="badge badge-info">Overstock</span></dt>
                <dd>Excess inventory on hand. The retailer may defer the next order.</dd>
              </dl>
            </div>
          </details>
        )}
      </main>
    </div>
  );
}
