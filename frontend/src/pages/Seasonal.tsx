import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ApiError } from "../api/client";
import type { SeasonalOutlook, SkuSummary } from "../types";

const fmtN = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);

export function Seasonal() {
  const [skus, setSkus] = useState<SkuSummary[]>([]);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(365);
  const [data, setData] = useState<SeasonalOutlook | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getSkus();
        setSkus(data);
        if (!selectedSku && data.length > 0) {
          // Default to a SEASONAL- SKU if one exists.
          const seasonal = data.find((s) => s.sku.startsWith("SEASONAL-"))
            ?? data.find((s) => !s.cold_start && s.sales_days_available >= 90)
            ?? data[0];
          setSelectedSku(seasonal.sku);
        }
      } catch {/* ignore */}
    })();
  }, [selectedSku]);

  const load = useCallback(async (sku: string, hd: number) => {
    setLoading(true);
    setError(null);
    setData(null);
    setElapsed(0);
    const start = Date.now();
    const tickId = window.setInterval(
      () => setElapsed(Math.round((Date.now() - start) / 1000)),
      1000
    );
    try {
      const res = await api.getSeasonal(sku, hd);
      setData(res);
    } catch (err) {
      setError(
        err instanceof ApiError ? `${err.status} — ${err.message}` :
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      window.clearInterval(tickId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSku) void load(selectedSku, horizon);
  }, [selectedSku, horizon, load]);

  const skuOptions = useMemo(
    () =>
      skus.slice().filter((s) => s.sales_days_available >= 60)
        .sort((a, b) => {
          // SEASONAL-* SKUs first for the demo flow.
          const sa = a.sku.startsWith("SEASONAL-") ? 0 : 1;
          const sb = b.sku.startsWith("SEASONAL-") ? 0 : 1;
          if (sa !== sb) return sa - sb;
          return a.sku.localeCompare(b.sku);
        }),
    [skus]
  );

  return (
    <main className="page seasonal-page">
      <header className="page-header">
        <div>
          <h1>Seasonal Outlook</h1>
          <p>Long-range forecast showing the SKU's natural rhythm, peak months, and festival lifts.</p>
        </div>
      </header>

      <section className="seasonal-controls">
        <div className="forecast-selectors">
          <label htmlFor="seas-sku">SKU</label>
          <select
            id="seas-sku"
            className="sku-select"
            value={selectedSku ?? ""}
            onChange={(e) => setSelectedSku(e.target.value)}
            disabled={loading}
          >
            {skuOptions.length === 0 && <option>(no SKUs)</option>}
            {skuOptions.map((s) => (
              <option key={s.sku} value={s.sku}>
                {s.sku.startsWith("SEASONAL-") ? "★ " : ""}
                {s.sku} — {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="forecast-selectors">
          <label htmlFor="seas-horizon">Horizon</label>
          <select
            id="seas-horizon"
            className="sku-select"
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            disabled={loading}
          >
            <option value={90}>3 months</option>
            <option value={180}>6 months</option>
            <option value={365}>12 months</option>
            <option value={730}>24 months</option>
          </select>
        </div>
        {loading && <span className="muted-sm">Running Prophet… {elapsed}s</span>}
      </section>

      {error && <div className="run-error">{error}</div>}

      {data && !loading && (
        <>
          {/* Summary banner */}
          <section className="seasonal-summary">
            <strong>📊 Result —</strong> {data.summary}
          </section>

          {/* Monthly bar chart */}
          <SectionCard
            n={1}
            title="Monthly forecast"
            sub={`Total predicted units per month over the next ${data.horizon_days} days. Festivals shown as colored bands.`}
          >
            <MonthlyChart data={data} />
          </SectionCard>

          {/* Daily forecast with festivals */}
          <SectionCard
            n={2}
            title="Daily forecast with festival overlay"
            sub="The actual day-by-day forecast (Prophet, 80% PI band). Festivals are highlighted so you can see exactly when the spikes are expected."
          >
            <DailyChart data={data} />
          </SectionCard>

          {/* Decomposition */}
          <SectionCard
            n={3}
            title="What Prophet learned"
            sub="The forecast is the sum of these three components. This is how the model explains its predictions."
          >
            <DecompositionCharts data={data} />
          </SectionCard>

          {/* Upcoming festivals */}
          {data.festivals.length > 0 && (
            <SectionCard
              n={4}
              title="Festivals in this horizon"
              sub="Edit these on the Settings page."
            >
              <FestivalList data={data} />
            </SectionCard>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <div className="ins-prompt">
          Pick a SKU to generate its seasonal outlook.
          <br />
          <small>SKUs starting with ★ are the demo seasonal SKUs.</small>
        </div>
      )}
    </main>
  );
}

/* ─── helpers ─── */

function SectionCard({ n, title, sub, children }: { n: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="ins-section">
      <header className="ins-section-head">
        <span className="ins-step-num">{n}</span>
        <div>
          <h3>{title}</h3>
          <p>{sub}</p>
        </div>
      </header>
      <div className="ins-section-body">{children}</div>
    </section>
  );
}

function MonthlyChart({ data }: { data: SeasonalOutlook }) {
  // Find festival months for shading
  const festMonths = new Set(data.festivals.map((f) => f.date.slice(0, 7)));
  const rows = data.monthly.map((m) => ({
    label: m.label,
    monthKey: m.month,
    yhat: Math.round(m.yhat),
    isFestival: festMonths.has(m.month),
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 10, right: 24, bottom: 8, left: 0 }} barCategoryGap={6}>
        <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
        <XAxis dataKey="label" stroke="rgba(15,23,42,0.45)" tick={{ fill: "rgba(15,23,42,0.65)", fontSize: 11 }} />
        <YAxis stroke="rgba(15,23,42,0.45)" tick={{ fill: "rgba(15,23,42,0.55)", fontSize: 11 }} width={44} />
        <Tooltip
          contentStyle={{ background: "#ffffff", border: "1px solid rgba(15,23,42,0.14)", borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => [`${fmtN(v)} units`, "Forecast"]}
        />
        <Bar dataKey="yhat" fill="#7c5cff" radius={[8, 8, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function DailyChart({ data }: { data: SeasonalOutlook }) {
  const rows = data.daily.map((d) => ({
    date: d.date,
    yhat: d.yhat,
    band: [d.yhat_lower, d.yhat_upper] as [number, number],
  }));
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={rows} margin={{ top: 10, right: 24, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="seasBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.10} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
        <XAxis
          dataKey="date"
          stroke="rgba(15,23,42,0.45)"
          tick={{ fill: "rgba(15,23,42,0.55)", fontSize: 11 }}
          minTickGap={40}
        />
        <YAxis stroke="rgba(15,23,42,0.45)" tick={{ fill: "rgba(15,23,42,0.55)", fontSize: 11 }} width={44} />
        <Tooltip
          contentStyle={{ background: "#ffffff", border: "1px solid rgba(15,23,42,0.14)", borderRadius: 8, fontSize: 12 }}
        />
        {data.festivals.map((f) => (
          <ReferenceArea
            key={f.id}
            x1={f.window_start}
            x2={f.window_end}
            fill="#fb7185"
            fillOpacity={0.16}
            stroke="#fb7185"
            strokeOpacity={0.40}
            label={{ value: f.name, position: "insideTop", fill: "#dc2626", fontSize: 10 }}
          />
        ))}
        <Area type="monotone" dataKey="band" stroke="none" fill="url(#seasBand)" connectNulls isAnimationActive={false} />
        <Line type="monotone" dataKey="yhat" stroke="#7c5cff" strokeWidth={2} dot={false} isAnimationActive={false} name="Forecast" />
        <Legend wrapperStyle={{ paddingTop: 6, fontSize: 12 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function DecompositionCharts({ data }: { data: SeasonalOutlook }) {
  return (
    <div className="decomp-grid">
      <MiniDecomp title="Trend" desc="Long-run direction (growing, flat, or declining)." points={data.decomposition.trend} color="#7c5cff" />
      <MiniDecomp title="Weekly cycle" desc="Day-of-week pattern Prophet learned." points={data.decomposition.weekly} color="#38bdf8" />
      <MiniDecomp title="Yearly cycle" desc="Annual seasonality across one year." points={data.decomposition.yearly} color="#16a34a" />
    </div>
  );
}

function MiniDecomp({ title, desc, points, color }: { title: string; desc: string; points: { date: string; value: number }[]; color: string }) {
  return (
    <div className="decomp-card">
      <div className="decomp-title">{title}</div>
      <div className="decomp-desc">{desc}</div>
      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
          <XAxis dataKey="date" hide />
          <YAxis tick={{ fill: "rgba(15,23,42,0.45)", fontSize: 10 }} width={36} />
          <Tooltip
            contentStyle={{ background: "#ffffff", border: "1px solid rgba(15,23,42,0.14)", borderRadius: 6, fontSize: 11 }}
            formatter={(v: number) => v.toFixed(2)}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function FestivalList({ data }: { data: SeasonalOutlook }) {
  return (
    <div className="festival-list">
      {data.festivals.map((f) => (
        <div key={f.id} className="festival-card">
          <div className="festival-date">{f.date}</div>
          <div className="festival-name">{f.name}</div>
          <div className="festival-window">Window: {f.window_start} → {f.window_end}</div>
          <div className="festival-uplift">Expected uplift: <strong>{f.expected_uplift.toFixed(1)}×</strong></div>
          {f.notes && <div className="festival-notes">{f.notes}</div>}
        </div>
      ))}
    </div>
  );
}
