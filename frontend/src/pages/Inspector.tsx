import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  ReferenceArea,
} from "recharts";
import { api, ApiError } from "../api/client";
import { InspectorIntro } from "../components/InspectorIntro";
import { StatusBadge } from "../components/StatusBadge";
import type { InspectionResponse, ModelTraceOut, SkuSummary, ReorderStatus } from "../types";

const INTRO_KEY = "df:hideInspectorIntro";

const MODEL_COLORS: Record<string, string> = {
  arima:   "#fb7185",
  prophet: "#7c5cff",
  lightgbm:"#34d399",
};

const MODEL_LABEL: Record<string, string> = {
  arima: "ARIMA",
  prophet: "Prophet",
  lightgbm: "LightGBM",
  fallback_category_avg: "Fallback (cold start)",
  fallback_zero: "Fallback (sparse)",
};

export function Inspector() {
  const [skus, setSkus] = useState<SkuSummary[]>([]);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [data, setData] = useState<InspectionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try { return localStorage.getItem(INTRO_KEY) !== "1"; } catch { return true; }
  });

  const dismissIntro = useCallback(() => {
    try { localStorage.setItem(INTRO_KEY, "1"); } catch { /* ignore */ }
    setShowIntro(false);
  }, []);

  const openIntro = useCallback(() => {
    try { localStorage.removeItem(INTRO_KEY); } catch { /* ignore */ }
    setShowIntro(true);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.getSkus();
        setSkus(list);
        if (!selectedSku && list.length > 0) {
          // Default to first non-cold-start SKU.
          const first = list.find((s) => !s.cold_start && s.sales_days_available >= 90)
            ?? list.find((s) => !s.cold_start) ?? list[0];
          setSelectedSku(first.sku);
        }
      } catch {/* empty */}
    })();
  }, [selectedSku]);

  const runInspection = useCallback(async (sku: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    setElapsed(0);
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    try {
      const res = await api.inspectPipeline(sku, { service_level: 0.95, review_period_days: 7 });
      setData(res);
    } catch (err) {
      setError(
        err instanceof ApiError ? `${err.status} — ${err.message}` :
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      clearInterval(t);
      setLoading(false);
    }
  }, []);

  const skuOptions = useMemo(
    () =>
      skus.slice().filter((s) => !s.cold_start).sort((a, b) => a.sku.localeCompare(b.sku))
        .map((s) => ({ value: s.sku, label: `${s.sku} — ${s.name}` })),
    [skus]
  );

  return (
    <main className="page inspector-page">
      <header className="page-header">
        <div>
          <h1>Model Inspector</h1>
          <p>
            See exactly how the pipeline turns sales history into a reorder decision
            for any SKU — the time-based split, the 3-model contest, the winner, and the math.
          </p>
        </div>
        {!showIntro && (
          <button
            type="button"
            className="btn btn-ghost help-btn"
            onClick={openIntro}
            title="Show the plain-English intro"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            What is this?
          </button>
        )}
      </header>

      {showIntro && <InspectorIntro onDismiss={dismissIntro} />}

      <section className="inspector-controls">
        <div className="forecast-selectors">
          <label htmlFor="ins-sku">SKU</label>
          <select
            id="ins-sku"
            className="sku-select"
            value={selectedSku ?? ""}
            onChange={(e) => setSelectedSku(e.target.value)}
            disabled={loading}
          >
            {skuOptions.length === 0 && <option>(no SKUs)</option>}
            {skuOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <button
          className={`btn btn-primary ${loading ? "spinning" : ""}`}
          onClick={() => selectedSku && void runInspection(selectedSku)}
          disabled={loading || !selectedSku}
        >
          {loading ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
              Running pipeline… {elapsed}s
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              Inspect this SKU
            </>
          )}
        </button>
      </section>

      {loading && (
        <div className="ins-loading">
          <p>Re-running the full forecasting contest for this SKU on demand…</p>
          <ul>
            <li>Fetching daily sales from the database</li>
            <li>Splitting last 28 days as validation</li>
            <li>Training ARIMA, Prophet, and LightGBM</li>
            <li>Scoring on the validation window and picking the winner</li>
          </ul>
          <small>This takes ~20–30 seconds (Prophet recompiles Stan).</small>
        </div>
      )}

      {error && <div className="run-error" style={{ marginTop: 16 }}>{error}</div>}

      {data && (
        <>
          {/* Section 1 — the data */}
          <Section
            n={1}
            title="The data we're feeding the model"
            sub={`${data.history_values.length} days of daily sales for ${data.sku}. The shaded area is the validation window (last 28 days) the contest is scored on.`}
          >
            <HistoryChart data={data} />
          </Section>

          {/* Section 2 — the contest */}
          <Section
            n={2}
            title="The 3-model contest"
            sub="Each model trained on the training window, then predicted the 28-day validation. The model with the lowest MAPE wins."
          >
            <ContestChart data={data} />
            <Leaderboard data={data} />
          </Section>

          {/* Section 3 — the math */}
          <Section
            n={3}
            title="From forecast to reorder decision"
            sub="The winning model's forecast over the lead time becomes the inputs to safety stock, ROP, and EOQ."
          >
            <MathSteps data={data} />
          </Section>

          {/* Section 4 — the decision */}
          <Section n={4} title="Final decision">
            <DecisionPanel data={data} />
          </Section>
        </>
      )}

      {!data && !loading && !error && (
        <div className="ins-prompt">
          Pick a SKU and click <strong>Inspect this SKU</strong> to walk through
          how the model turns its sales history into a reorder recommendation.
        </div>
      )}
    </main>
  );
}

/* ───── helpers ───── */

function Section({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="ins-section">
      <header className="ins-section-head">
        <span className="ins-step-num">{n}</span>
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
      </header>
      <div className="ins-section-body">{children}</div>
    </section>
  );
}

function HistoryChart({ data }: { data: InspectionResponse }) {
  const tail = Math.min(180, data.history_values.length);
  const rows = data.history_dates.slice(-tail).map((d, i) => ({
    date: d, qty: data.history_values[data.history_values.length - tail + i] ?? null,
  }));
  const valStart = data.val_dates[0];
  const valEnd = data.val_dates[data.val_dates.length - 1];

  return (
    <div className="ins-chart">
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={rows} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
          <XAxis dataKey="date" stroke="rgba(15,23,42,0.45)" tick={{ fill: "rgba(15,23,42,0.55)", fontSize: 11 }} minTickGap={28} />
          <YAxis stroke="rgba(15,23,42,0.45)" tick={{ fill: "rgba(15,23,42,0.55)", fontSize: 11 }} width={42} />
          <Tooltip contentStyle={{ background: "#fff", border: "1px solid rgba(15,23,42,0.14)", borderRadius: 8, fontSize: 12 }} />
          {valStart && valEnd && (
            <ReferenceArea x1={valStart} x2={valEnd} fill="#7c5cff" fillOpacity={0.10} stroke="#7c5cff" strokeOpacity={0.3} label={{ value: "validation window", position: "insideTopRight", fill: "#7c5cff", fontSize: 11 }} />
          )}
          <Line type="monotone" dataKey="qty" stroke="#0f172a" strokeWidth={1.6} dot={false} isAnimationActive={false} name="Daily sales" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ContestChart({ data }: { data: InspectionResponse }) {
  const rows = data.val_dates.map((d, i) => {
    const r: Record<string, string | number | null> = { date: d, actual: data.val_actuals[i] };
    for (const c of data.candidates) r[c.name] = c.val_yhat[i] ?? null;
    return r;
  });

  return (
    <div className="ins-chart">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={rows} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
          <XAxis dataKey="date" stroke="rgba(15,23,42,0.45)" tick={{ fill: "rgba(15,23,42,0.55)", fontSize: 11 }} minTickGap={28} />
          <YAxis stroke="rgba(15,23,42,0.45)" tick={{ fill: "rgba(15,23,42,0.55)", fontSize: 11 }} width={42} />
          <Tooltip contentStyle={{ background: "#fff", border: "1px solid rgba(15,23,42,0.14)", borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
          <Line type="monotone" dataKey="actual" stroke="#0f172a" strokeWidth={2.4} dot={false} isAnimationActive={false} name="Actual" />
          {data.candidates.map((c) => (
            <Line
              key={c.name}
              type="monotone"
              dataKey={c.name}
              stroke={MODEL_COLORS[c.name] ?? "#888"}
              strokeWidth={1.6}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
              name={MODEL_LABEL[c.name] ?? c.name}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Leaderboard({ data }: { data: InspectionResponse }) {
  const sorted = [...data.candidates].sort((a, b) => a.mape - b.mape);
  return (
    <div className="ins-leaderboard">
      <div className="ins-lb-head">
        <div>Rank</div><div>Model</div><div className="num">MAE</div><div className="num">RMSE</div><div className="num">MAPE</div><div>Verdict</div>
      </div>
      {sorted.map((c, i) => {
        const isWinner = c.name === data.winner;
        return (
          <div key={c.name} className={`ins-lb-row ${isWinner ? "is-winner" : ""}`}>
            <div className="rank">#{i + 1}</div>
            <div className="model">
              <span className="model-dot" style={{ background: MODEL_COLORS[c.name] ?? "#888" }} />
              <strong>{MODEL_LABEL[c.name] ?? c.name}</strong>
            </div>
            <div className="num">{c.mae.toFixed(2)}</div>
            <div className="num">{c.rmse.toFixed(2)}</div>
            <div className="num strong">{c.mape.toFixed(2)}%</div>
            <div>{isWinner ? <span className="winner-pill">✓ Winner</span> : c.error ? <span className="muted">failed</span> : <span className="muted">also-ran</span>}</div>
          </div>
        );
      })}
    </div>
  );
}

function MathSteps({ data }: { data: InspectionResponse }) {
  return (
    <ol className="ins-math">
      {data.reorder_math.map((s, i) => (
        <li key={i}>
          <div className="ins-math-num">{String(i + 1).padStart(2, "0")}</div>
          <div className="ins-math-body">
            <div className="ins-math-label">{s.label}</div>
            <code className="ins-math-formula">{s.formula}</code>
            {s.explanation && <p>{s.explanation}</p>}
          </div>
          <div className="ins-math-value">
            <strong>{Number.isFinite(s.value) ? s.value.toLocaleString() : "—"}</strong>
            {s.unit && <span>{s.unit}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function DecisionPanel({ data }: { data: InspectionResponse }) {
  return (
    <div className="ins-decision">
      <div className="ins-decision-head">
        <StatusBadge status={data.decision_status as ReorderStatus} />
        {data.decision_qty > 0 && (
          <div className="ins-decision-qty">
            Recommended order: <strong>{Math.round(data.decision_qty)} units</strong>
          </div>
        )}
      </div>
      <p className="ins-decision-explain">{data.decision_explanation}</p>
    </div>
  );
}
