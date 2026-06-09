import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { BacktestChart } from "../components/BacktestChart";
import type { BacktestResult, SkuSummary } from "../types";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const fmt = (n: number, digits = 1) =>
  Number.isFinite(n) ? n.toFixed(digits) : "—";

export function Backtest() {
  const [skus, setSkus] = useState<SkuSummary[]>([]);
  const [skusLoading, setSkusLoading] = useState(true);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [holdoutDays, setHoldoutDays] = useState(60);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getSkus();
        setSkus(data);
        if (!selectedSku && data.length > 0) {
          // First eligible SKU = enough history to backtest (skip cold-start).
          const first = data.find((s) => !s.cold_start && s.sales_days_available >= 90)
            ?? data.find((s) => !s.cold_start)
            ?? data[0];
          setSelectedSku(first.sku);
        }
      } catch {
        /* surfaced via empty selector */
      } finally {
        setSkusLoading(false);
      }
    })();
  }, [selectedSku]);

  const load = useCallback(async (sku: string, days: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getBacktest(sku, { holdout_days: days });
      setResult(data);
    } catch (err) {
      setResult(null);
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
    if (selectedSku) void load(selectedSku, holdoutDays);
  }, [selectedSku, holdoutDays, load]);

  const skuOptions = useMemo(
    () =>
      skus
        .slice()
        .filter((s) => !s.cold_start)
        .sort((a, b) => a.sku.localeCompare(b.sku))
        .map((s) => ({
          value: s.sku,
          label: `${s.sku} — ${s.name} (${s.sales_days_available}d history)`,
        })),
    [skus]
  );

  return (
    <main className="page backtest-page">
      <header className="page-header">
        <div>
          <h1>Backtest</h1>
          <p>Replay history day by day to compare a naive baseline policy against the forecast-driven system policy.</p>
        </div>
      </header>

      <section className="bt-panel-wrap">
        <header className="bt-controls">
          <div className="forecast-selectors">
            <label htmlFor="bt-sku">SKU</label>
            <select
              id="bt-sku"
              className="sku-select"
              value={selectedSku ?? ""}
              onChange={(e) => setSelectedSku(e.target.value)}
              disabled={skusLoading}
            >
              {skuOptions.length === 0 && <option>(no eligible SKUs)</option>}
              {skuOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="bt-slider">
            <div className="control-head">
              <label htmlFor="bt-holdout">Holdout window</label>
              <span className="control-value">{holdoutDays} days</span>
            </div>
            <input
              id="bt-holdout"
              type="range"
              min={14}
              max={180}
              step={1}
              value={holdoutDays}
              onChange={(e) => setHoldoutDays(Number(e.target.value))}
              disabled={loading}
            />
          </div>
        </header>

        {loading && (
          <div className="chart-skeleton">
            <div className="kpi-skel-bar" style={{ width: "100%", height: 320 }} />
          </div>
        )}

        {!loading && error && (
          <div className="run-error" style={{ marginTop: 16 }}>{error}</div>
        )}

        {!loading && !error && result && (
          <>
            <Summary result={result} />
            <Scorecards result={result} />
            <BacktestChart data={result} />
          </>
        )}
      </section>
    </main>
  );
}

function Summary({ result }: { result: BacktestResult }) {
  const stockoutDelta = result.stockout_days_reduction;
  const tone = stockoutDelta > 0 ? "good" : stockoutDelta < 0 ? "bad" : "neutral";
  return (
    <div className={`bt-summary tone-${tone}`}>
      <strong>Result:</strong>{" "}
      {stockoutDelta > 0 ? (
        <>
          Stockout days reduced from <strong>{result.baseline.stockout_days}</strong> to{" "}
          <strong>{result.system.stockout_days}</strong> over a {result.horizon_days}-day
          holdout window — that's <strong>{stockoutDelta} fewer</strong> days a customer
          would have walked away empty-handed.
        </>
      ) : stockoutDelta < 0 ? (
        <>
          The system policy had <strong>{-stockoutDelta} more</strong> stockout days
          than the baseline on this SKU over {result.horizon_days} days — likely
          because the baseline overshot the safety-stock ceiling, or the SKU's
          demand is too sparse for the contest to help.
        </>
      ) : (
        <>
          Both policies tied on stockout days ({result.baseline.stockout_days}) over
          {" "}{result.horizon_days} days — the difference shows up in inventory
          carrying cost (see below).
        </>
      )}
    </div>
  );
}

function Scorecards({ result }: { result: BacktestResult }) {
  const tiles = [
    {
      label: "Stockout days",
      baseline: String(result.baseline.stockout_days),
      system: String(result.system.stockout_days),
      delta: result.baseline.stockout_days - result.system.stockout_days,
      unit: "d",
      lowerIsBetter: true,
    },
    {
      label: "Service rate",
      baseline: `${(result.baseline.service_rate * 100).toFixed(1)}%`,
      system: `${(result.system.service_rate * 100).toFixed(1)}%`,
      delta: (result.system.service_rate - result.baseline.service_rate) * 100,
      unit: "pp",
      lowerIsBetter: false,
    },
    {
      label: "Avg inventory",
      baseline: fmt(result.baseline.avg_inventory, 0),
      system: fmt(result.system.avg_inventory, 0),
      delta: result.baseline.avg_inventory - result.system.avg_inventory,
      unit: "u",
      lowerIsBetter: true,
    },
    {
      label: "Holding cost",
      baseline: fmtCurrency(result.baseline.total_holding_cost),
      system: fmtCurrency(result.system.total_holding_cost),
      delta: result.baseline.total_holding_cost - result.system.total_holding_cost,
      unit: "₹",
      lowerIsBetter: true,
    },
  ];

  return (
    <div className="bt-scorecards">
      {tiles.map((t) => {
        const improvement = t.lowerIsBetter ? t.delta : t.delta;
        const tone =
          improvement > 0.001 ? "good" : improvement < -0.001 ? "bad" : "neutral";
        return (
          <div key={t.label} className={`bt-card tone-${tone}`}>
            <div className="bt-card-label">{t.label}</div>
            <div className="bt-card-values">
              <div>
                <span className="bt-card-pol">Baseline</span>
                <span className="bt-card-val baseline">{t.baseline}</span>
              </div>
              <span className="bt-card-arrow">→</span>
              <div>
                <span className="bt-card-pol">System</span>
                <span className="bt-card-val system">{t.system}</span>
              </div>
            </div>
            <div className="bt-card-delta">
              {improvement > 0.001 && <>✓ {Math.abs(improvement).toFixed(0)}{t.unit} better</>}
              {improvement < -0.001 && <>✗ {Math.abs(improvement).toFixed(0)}{t.unit} worse</>}
              {Math.abs(improvement) <= 0.001 && <>·  tied</>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
