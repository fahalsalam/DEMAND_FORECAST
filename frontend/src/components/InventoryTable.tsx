import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type { InventoryRow } from "../types";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
};

type SortKey = "sku" | "on_hand" | "stock_value" | "name";
type SortDir = "asc" | "desc";

interface Toast { kind: "ok" | "err"; text: string }

export function InventoryTable() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("stock_value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [confirmSku, setConfirmSku] = useState<string | null>(null);
  const [busySku, setBusySku] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listInventory();
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const sorted = useMemo(() => {
    const term = search.trim().toLowerCase();
    let out = rows;
    if (term) {
      out = out.filter((r) => r.sku.toLowerCase().includes(term) || r.name.toLowerCase().includes(term));
    }
    return [...out].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const cmp = typeof va === "string" && typeof vb === "string"
        ? va.localeCompare(vb)
        : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, sortKey, sortDir]);

  const totals = useMemo(
    () => ({
      units: sorted.reduce((s, r) => s + r.on_hand, 0),
      value: sorted.reduce((s, r) => s + r.stock_value, 0),
    }),
    [sorted]
  );

  function changeSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "sku" || key === "name" ? "asc" : "desc");
    }
  }

  async function doDelete(r: InventoryRow) {
    setBusySku(r.sku);
    try {
      await api.deleteInventory(r.sku);
      setToast({ kind: "ok", text: `Removed inventory row for ${r.sku} — ${r.name} (product + sales kept)` });
      setConfirmSku(null);
      await fetchRows();
    } catch (err) {
      setToast({
        kind: "err",
        text: `Could not delete: ${err instanceof ApiError ? err.message : err instanceof Error ? err.message : "error"}`,
      });
    } finally {
      setBusySku(null);
    }
  }

  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div className="browse">
      {toast && <div className={`row-toast row-toast-${toast.kind}`}>{toast.text}</div>}

      <div className="browse-controls">
        <input
          type="text"
          className="search-input"
          placeholder="Search SKU or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="browse-meta">
          {loading
            ? "loading…"
            : `${sorted.length} rows · ${totals.units.toLocaleString()} units · ${fmtCurrency(totals.value)} value`}
        </div>
      </div>

      <div className="data-table inv-cols inv-with-actions">
        <div className="data-thead">
          <div onClick={() => changeSort("sku")} className="th-sort">SKU{arrow("sku")}</div>
          <div onClick={() => changeSort("name")} className="th-sort">Name{arrow("name")}</div>
          <div>Category</div>
          <div>Store</div>
          <div className="num th-sort" onClick={() => changeSort("on_hand")}>On hand{arrow("on_hand")}</div>
          <div className="num">Unit cost</div>
          <div className="num th-sort" onClick={() => changeSort("stock_value")}>Value{arrow("stock_value")}</div>
          <div>Updated</div>
          <div className="td-actions-col">Actions</div>
        </div>
        <div className="data-tbody">
          {sorted.length === 0 && !loading && (
            <div className="data-empty">No inventory rows.</div>
          )}
          {sorted.map((r) => (
            <div key={r.sku} className="data-row">
              <div><code>{r.sku}</code></div>
              <div>{r.name}</div>
              <div><span className="cat-pill">{r.category}</span></div>
              <div className="muted-cell">{r.store_id}</div>
              <div className="num strong">{r.on_hand.toLocaleString()}</div>
              <div className="num">{fmtCurrency(r.unit_cost)}</div>
              <div className="num strong">{fmtCurrency(r.stock_value)}</div>
              <div className="muted-cell">{fmtDate(r.updated_at)}</div>
              <div className="td-actions">
                {confirmSku === r.sku ? (
                  busySku === r.sku ? (
                    <span className="muted-sm">deleting…</span>
                  ) : (
                    <>
                      <span className="confirm-text">Remove inventory row?</span>
                      <button className="btn-mini btn-mini-danger" onClick={() => void doDelete(r)}>Yes</button>
                      <button className="btn-mini" onClick={() => setConfirmSku(null)}>Cancel</button>
                    </>
                  )
                ) : (
                  <button
                    className="row-delete"
                    title="Delete inventory row (keeps product + sales)"
                    onClick={() => setConfirmSku(r.sku)}
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
