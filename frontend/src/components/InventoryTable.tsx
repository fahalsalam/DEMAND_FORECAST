import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { InventoryRow } from "../types";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
};

type SortKey = "sku" | "on_hand" | "stock_value" | "name";
type SortDir = "asc" | "desc";

export function InventoryTable() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("stock_value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    setLoading(true);
    api.listInventory().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    const term = search.trim().toLowerCase();
    let out = rows;
    if (term) {
      out = out.filter(
        (r) => r.sku.toLowerCase().includes(term) || r.name.toLowerCase().includes(term)
      );
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

  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div className="browse">
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

      <div className="data-table inv-cols">
        <div className="data-thead">
          <div onClick={() => changeSort("sku")} className="th-sort">SKU{arrow("sku")}</div>
          <div onClick={() => changeSort("name")} className="th-sort">Name{arrow("name")}</div>
          <div>Category</div>
          <div>Store</div>
          <div className="num th-sort" onClick={() => changeSort("on_hand")}>On hand{arrow("on_hand")}</div>
          <div className="num">Unit cost</div>
          <div className="num th-sort" onClick={() => changeSort("stock_value")}>Value{arrow("stock_value")}</div>
          <div>Updated</div>
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
