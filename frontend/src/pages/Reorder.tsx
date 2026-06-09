import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import type { ReorderDecisionOut } from "../types";

const LAST_JOB_KEY = "df:lastJobId";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);

const fmtCurrency0 = (n: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

/** One editable line in the draft purchase order. */
interface POLine {
  sku: string;
  name: string;
  category: string;
  status: ReorderDecisionOut["status"];
  supplier: string;
  unit_cost: number;
  current_stock: number;
  reorder_point: number;
  recommended_qty: number;   // what the model suggested (immutable reference)
  qty: number;               // what the buyer wants to order (editable)
  include: boolean;          // is this line in the PO?
  lead_time_days: number;
}

function loadLastJobId(): string | null {
  try {
    return localStorage.getItem(LAST_JOB_KEY);
  } catch {
    return null;
  }
}

export function Reorder() {
  const [jobId, setJobId] = useState<string | null>(loadLastJobId);
  const [lines, setLines] = useState<POLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Resolve a job: cached id first, else ask the backend for the latest.
  const load = useCallback(async (jid: string) => {
    setLoading(true);
    setError(null);
    try {
      // At-risk items only — those are what you actually reorder.
      const data = await api.getAlerts(jid, { status: ["REORDER_NOW", "STOCKOUT_RISK"] });
      const initial: POLine[] = data.map((d) => ({
        sku: d.sku,
        name: d.name,
        category: d.category,
        status: d.status,
        supplier: d.supplier || "Unassigned",
        unit_cost: d.unit_cost,
        current_stock: d.current_stock,
        reorder_point: d.reorder_point,
        recommended_qty: Math.round(d.recommended_order_qty),
        qty: Math.round(d.recommended_order_qty),
        include: true,
        lead_time_days: d.lead_time_days,
      }));
      setLines(initial);
    } catch (err) {
      setLines([]);
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
    (async () => {
      let jid = jobId;
      if (!jid) {
        try {
          const latest = await api.getLatestJob();
          jid = latest.job_id;
          setJobId(jid);
          try { localStorage.setItem(LAST_JOB_KEY, jid); } catch { /* ignore */ }
        } catch {
          setLoading(false);
          return;
        }
      }
      void load(jid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ---- line editing ----
  function setQty(sku: string, qty: number) {
    setLines((prev) =>
      prev.map((l) => (l.sku === sku ? { ...l, qty: Math.max(0, Math.round(qty || 0)) } : l))
    );
  }
  function toggleInclude(sku: string) {
    setLines((prev) => prev.map((l) => (l.sku === sku ? { ...l, include: !l.include } : l)));
  }
  function resetQty(sku: string) {
    setLines((prev) => prev.map((l) => (l.sku === sku ? { ...l, qty: l.recommended_qty } : l)));
  }
  function selectAll(on: boolean) {
    setLines((prev) => prev.map((l) => ({ ...l, include: on })));
  }

  // ---- grouping + totals ----
  const grouped = useMemo(() => {
    const map = new Map<string, POLine[]>();
    for (const l of lines) {
      const arr = map.get(l.supplier) ?? [];
      arr.push(l);
      map.set(l.supplier, arr);
    }
    // sort suppliers by total order value desc
    return Array.from(map.entries())
      .map(([supplier, items]) => ({
        supplier,
        items: items.slice().sort((a, b) => b.qty * b.unit_cost - a.qty * a.unit_cost),
        total: items.reduce((s, l) => s + (l.include ? l.qty * l.unit_cost : 0), 0),
        count: items.filter((l) => l.include).length,
      }))
      .sort((a, b) => b.total - a.total);
  }, [lines]);

  const totals = useMemo(() => {
    const sel = lines.filter((l) => l.include && l.qty > 0);
    return {
      lineCount: sel.length,
      units: sel.reduce((s, l) => s + l.qty, 0),
      cost: sel.reduce((s, l) => s + l.qty * l.unit_cost, 0),
      suppliers: new Set(sel.map((l) => l.supplier)).size,
    };
  }, [lines]);

  // ---- export ----
  function downloadCsv() {
    const sel = lines.filter((l) => l.include && l.qty > 0);
    if (sel.length === 0) {
      setToast("Nothing selected to export.");
      return;
    }
    const header = [
      "supplier", "sku", "product", "category", "order_qty",
      "unit_cost", "line_total", "current_stock", "reorder_point", "lead_time_days",
    ];
    const rows = sel
      .slice()
      .sort((a, b) => a.supplier.localeCompare(b.supplier) || a.sku.localeCompare(b.sku))
      .map((l) => [
        l.supplier, l.sku, `"${l.name.replace(/"/g, '""')}"`, l.category,
        l.qty, l.unit_cost.toFixed(2), (l.qty * l.unit_cost).toFixed(2),
        l.current_stock, Math.round(l.reorder_point), l.lead_time_days,
      ].join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `purchase-order-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast(`Exported ${sel.length} line(s) to CSV.`);
  }

  function printPO() {
    window.print();
  }

  // ---- render ----
  if (!loading && !jobId) {
    return (
      <main className="page reorder-page">
        <header className="page-header">
          <div>
            <h1>Reorder</h1>
            <p>Build a purchase order from the latest forecast's reorder recommendations.</p>
          </div>
        </header>
        <div className="ins-prompt">
          No forecast has run yet. Open the <strong>Dashboard</strong> and click{" "}
          <strong>Run Forecast</strong> first — then come back here to build your order.
        </div>
      </main>
    );
  }

  return (
    <main className="page reorder-page">
      <header className="page-header">
        <div>
          <h1>Reorder</h1>
          <p>Review the recommended order, adjust quantities, and export a purchase order grouped by supplier.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-ghost" onClick={printPO} disabled={totals.lineCount === 0}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print
          </button>
          <button className="btn btn-primary" onClick={downloadCsv} disabled={totals.lineCount === 0}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export PO (CSV)
          </button>
        </div>
      </header>

      {toast && <div className="row-toast row-toast-ok">{toast}</div>}
      {error && <div className="run-error">{error}</div>}

      {loading && (
        <div className="chart-skeleton">
          <div className="kpi-skel-bar" style={{ width: "100%", height: 320 }} />
        </div>
      )}

      {!loading && !error && lines.length === 0 && (
        <div className="ins-prompt">
          🎉 Nothing to reorder — every SKU is healthy or overstocked in the latest forecast.
        </div>
      )}

      {!loading && !error && lines.length > 0 && (
        <>
          {/* Summary bar */}
          <section className="po-summary">
            <div className="po-sum-tile">
              <div className="po-sum-label">Lines</div>
              <div className="po-sum-value">{totals.lineCount}</div>
              <div className="po-sum-hint">{lines.length} candidates</div>
            </div>
            <div className="po-sum-tile">
              <div className="po-sum-label">Total units</div>
              <div className="po-sum-value">{totals.units.toLocaleString()}</div>
            </div>
            <div className="po-sum-tile">
              <div className="po-sum-label">Suppliers</div>
              <div className="po-sum-value">{totals.suppliers}</div>
            </div>
            <div className="po-sum-tile po-sum-cost">
              <div className="po-sum-label">Estimated spend</div>
              <div className="po-sum-value">{fmtCurrency0(totals.cost)}</div>
            </div>
            <div className="po-select-actions">
              <button className="btn-mini" onClick={() => selectAll(true)}>Select all</button>
              <button className="btn-mini" onClick={() => selectAll(false)}>Clear</button>
            </div>
          </section>

          {/* One block per supplier */}
          {grouped.map((g) => (
            <section key={g.supplier} className="po-supplier">
              <header className="po-supplier-head">
                <div className="po-supplier-name">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                  {g.supplier}
                </div>
                <div className="po-supplier-total">
                  {g.count} line{g.count === 1 ? "" : "s"} · <strong>{fmtCurrency0(g.total)}</strong>
                </div>
              </header>

              <div className="po-table">
                <div className="po-thead">
                  <div className="po-c-check" />
                  <div>SKU</div>
                  <div>Product</div>
                  <div>Status</div>
                  <div className="num">Stock</div>
                  <div className="num">ROP</div>
                  <div className="num">Suggested</div>
                  <div className="num">Order qty</div>
                  <div className="num">Unit cost</div>
                  <div className="num">Line total</div>
                </div>
                {g.items.map((l) => {
                  const lineTotal = l.qty * l.unit_cost;
                  const edited = l.qty !== l.recommended_qty;
                  return (
                    <div key={l.sku} className={`po-row ${l.include ? "" : "is-excluded"} tone-${l.status.toLowerCase()}`}>
                      <div className="po-c-check">
                        <input
                          type="checkbox"
                          checked={l.include}
                          onChange={() => toggleInclude(l.sku)}
                          aria-label={`Include ${l.sku}`}
                        />
                      </div>
                      <div><code>{l.sku}</code></div>
                      <div className="po-name">
                        <span className="po-name-main">{l.name}</span>
                        <span className="po-name-sub">{l.category}</span>
                      </div>
                      <div><StatusBadge status={l.status} size="sm" /></div>
                      <div className="num">{l.current_stock}</div>
                      <div className="num">{Math.round(l.reorder_point)}</div>
                      <div className="num muted-cell">{l.recommended_qty}</div>
                      <div className="num po-qty-cell">
                        <input
                          type="number"
                          min={0}
                          className="po-qty-input"
                          value={l.qty}
                          onChange={(e) => setQty(l.sku, Number(e.target.value))}
                          disabled={!l.include}
                        />
                        {edited && (
                          <button className="po-reset" title="Reset to suggested" onClick={() => resetQty(l.sku)}>
                            ↺
                          </button>
                        )}
                      </div>
                      <div className="num">{fmtCurrency(l.unit_cost)}</div>
                      <div className="num strong">{l.include ? fmtCurrency0(lineTotal) : "—"}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* Grand total footer */}
          <section className="po-grand-total">
            <div>
              <strong>{totals.lineCount}</strong> line(s) across <strong>{totals.suppliers}</strong> supplier(s)
              · <strong>{totals.units.toLocaleString()}</strong> units
            </div>
            <div className="po-grand-cost">
              Total: <strong>{fmtCurrency0(totals.cost)}</strong>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
