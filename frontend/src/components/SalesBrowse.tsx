import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { SkuSalesSummary, SalesDayPoint } from "../types";

const fmtN = (n: number) => n.toLocaleString();

export function SalesBrowse() {
  const [rows, setRows] = useState<SkuSalesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [opened, setOpened] = useState<string | null>(null);
  const [skuDaily, setSkuDaily] = useState<Record<string, SalesDayPoint[]>>({});

  useEffect(() => {
    setLoading(true);
    api.listSalesSummaries(30).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => r.sku.toLowerCase().includes(t) || r.name.toLowerCase().includes(t));
  }, [rows, search]);

  async function toggle(sku: string) {
    if (opened === sku) {
      setOpened(null);
      return;
    }
    setOpened(sku);
    if (!skuDaily[sku]) {
      try {
        const data = await api.listSalesForSku(sku, 90);
        setSkuDaily((m) => ({ ...m, [sku]: data }));
      } catch {
        /* surfaced via empty list */
      }
    }
  }

  const totalUnits = useMemo(() => filtered.reduce((s, r) => s + r.total_units, 0), [filtered]);
  const totalLast30 = useMemo(() => filtered.reduce((s, r) => s + r.last_30d_units, 0), [filtered]);

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
            : `${filtered.length} SKUs · ${fmtN(totalUnits)} lifetime · ${fmtN(totalLast30)} last 30d`}
        </div>
      </div>

      <div className="data-table sales-cols">
        <div className="data-thead">
          <div>SKU</div>
          <div>Name</div>
          <div>Category</div>
          <div className="num">Days</div>
          <div className="num">Total units</div>
          <div className="num">Avg/day</div>
          <div className="num">Last 30d</div>
          <div className="num">Last sale</div>
          <div>Recent activity</div>
        </div>
        <div className="data-tbody">
          {filtered.length === 0 && !loading && (
            <div className="data-empty">No sales rows for the current filter.</div>
          )}
          {filtered.map((r) => (
            <div key={r.sku}>
              <button
                type="button"
                className={`data-row data-row-clickable ${opened === r.sku ? "is-open" : ""}`}
                onClick={() => void toggle(r.sku)}
              >
                <div><code>{r.sku}</code></div>
                <div>{r.name}</div>
                <div><span className="cat-pill">{r.category}</span></div>
                <div className="num">{r.days_available}</div>
                <div className="num strong">{fmtN(r.total_units)}</div>
                <div className="num">{r.avg_daily.toFixed(1)}</div>
                <div className="num strong">{fmtN(r.last_30d_units)}</div>
                <div className="num muted-cell">{r.last_sale_date ?? "—"}</div>
                <div className="spark-cell">
                  <Sparkline points={r.daily.map((d) => d.quantity)} />
                </div>
              </button>
              {opened === r.sku && (
                <div className="data-expand">
                  <div className="data-expand-inner">
                    <div className="data-expand-title">Last 90 days for {r.sku}</div>
                    {skuDaily[r.sku] ? (
                      <DailySalesMiniTable rows={skuDaily[r.sku]} />
                    ) : (
                      <div className="muted">Loading…</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sparkline({ points, width = 110, height = 26 }: { points: number[]; width?: number; height?: number }) {
  if (points.length === 0) return <span className="muted">—</span>;
  const min = Math.min(...points);
  const max = Math.max(...points, min + 1);
  const dx = width / Math.max(1, points.length - 1);
  const norm = (v: number) => height - 2 - ((v - min) / (max - min)) * (height - 4);
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * dx).toFixed(2)} ${norm(v).toFixed(2)}`)
    .join(" ");
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width={width} height={height}>
      <path d={d} stroke="url(#sparkGrad)" strokeWidth="1.6" fill="none" />
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function DailySalesMiniTable({ rows }: { rows: SalesDayPoint[] }) {
  // Show only the most recent 30 days as a compact bar list to keep the
  // expand panel readable.
  const recent = rows.slice(-30);
  const max = Math.max(1, ...recent.map((r) => r.quantity));
  return (
    <div className="sales-mini">
      {recent.map((r) => (
        <div key={r.date} className={`mini-row ${r.promo ? "is-promo" : ""}`} title={`${r.date}: ${r.quantity}${r.promo ? " (promo)" : ""}`}>
          <span className="mini-date">{r.date.slice(5)}</span>
          <span className="mini-bar">
            <span className="mini-bar-fill" style={{ width: `${(r.quantity / max) * 100}%` }} />
          </span>
          <span className="mini-qty">{r.quantity}</span>
        </div>
      ))}
    </div>
  );
}
