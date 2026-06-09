import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type { ProductOut } from "../types";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

interface Toast {
  kind: "ok" | "err";
  text: string;
}

export function ProductsTable() {
  const [rows, setRows] = useState<ProductOut[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [confirmSku, setConfirmSku] = useState<string | null>(null);
  const [busySku, setBusySku] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    void api.listCategories().then(setCats).catch(() => setCats([]));
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listProducts({
        search: search.trim() || undefined,
        category: category || undefined,
      });
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, category]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  // Auto-dismiss toast after a moment
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const totalValue = useMemo(
    () => rows.reduce((s, r) => s + r.unit_cost, 0),
    [rows]
  );

  async function doDelete(p: ProductOut) {
    setBusySku(p.sku);
    try {
      const res = await api.deleteProduct(p.sku);
      const d = res.deleted;
      setToast({
        kind: "ok",
        text: `Deleted ${res.sku} — ${res.name} (${d.sales_rows} sales rows, ${d.inventory_rows} inventory, ${d.forecast_results} forecast rows cleared)`,
      });
      setConfirmSku(null);
      await fetchRows();
    } catch (err) {
      setToast({
        kind: "err",
        text: `Could not delete ${p.sku}: ${err instanceof ApiError ? err.message : err instanceof Error ? err.message : "error"}`,
      });
    } finally {
      setBusySku(null);
    }
  }

  return (
    <div className="browse">
      {toast && (
        <div className={`row-toast row-toast-${toast.kind}`}>{toast.text}</div>
      )}

      <div className="browse-controls">
        <input
          type="text"
          className="search-input"
          placeholder="Search SKU or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="sku-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {cats.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="browse-meta">
          {loading ? "loading…" : `${rows.length} products · avg unit cost ${fmtCurrency(totalValue / Math.max(1, rows.length))}`}
        </div>
      </div>

      <div className="data-table products-with-actions">
        <div className="data-thead">
          <div>SKU</div>
          <div>Name</div>
          <div>Category</div>
          <div className="num">Unit cost</div>
          <div className="num">Lead time</div>
          <div className="num">Order cost</div>
          <div className="num">Holding</div>
          <div>Supplier</div>
          <div className="td-actions-col">Actions</div>
        </div>
        <div className="data-tbody">
          {rows.length === 0 && !loading && (
            <div className="data-empty">No products match your filter.</div>
          )}
          {rows.map((p) => (
            <div key={p.sku} className="data-row">
              <div><code>{p.sku}</code></div>
              <div>{p.name}</div>
              <div><span className="cat-pill">{p.category}</span></div>
              <div className="num">{fmtCurrency(p.unit_cost)}</div>
              <div className="num">{p.lead_time_days}d</div>
              <div className="num">{fmtCurrency(p.ordering_cost)}</div>
              <div className="num">{fmtCurrency(p.holding_cost_per_unit)}</div>
              <div className="muted-cell">{p.supplier ?? "—"}</div>
              <div className="td-actions">
                {confirmSku === p.sku ? (
                  busySku === p.sku ? (
                    <span className="muted-sm">deleting…</span>
                  ) : (
                    <>
                      <span className="confirm-text">Delete this + all its sales?</span>
                      <button
                        className="btn-mini btn-mini-danger"
                        onClick={() => void doDelete(p)}
                      >
                        Yes
                      </button>
                      <button
                        className="btn-mini"
                        onClick={() => setConfirmSku(null)}
                      >
                        Cancel
                      </button>
                    </>
                  )
                ) : (
                  <button
                    className="row-delete"
                    title={`Delete ${p.sku} (cascades to sales + inventory)`}
                    onClick={() => setConfirmSku(p.sku)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
