import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { ProductOut } from "../types";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

export function ProductsTable() {
  const [rows, setRows] = useState<ProductOut[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.listCategories().then(setCats).catch(() => setCats([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .listProducts({ search: search.trim() || undefined, category: category || undefined })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [search, category]);

  const totalValue = useMemo(
    () => rows.reduce((s, r) => s + r.unit_cost, 0),
    [rows]
  );

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

      <div className="data-table">
        <div className="data-thead">
          <div>SKU</div>
          <div>Name</div>
          <div>Category</div>
          <div className="num">Unit cost</div>
          <div className="num">Lead time</div>
          <div className="num">Order cost</div>
          <div className="num">Holding</div>
          <div>Supplier</div>
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
