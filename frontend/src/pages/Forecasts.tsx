import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { ForecastChart } from "../components/ForecastChart";
import type { ForecastSeries, SkuSummary } from "../types";

const LAST_JOB_KEY = "df:lastJobId";

function loadLastJobId(): string | null {
  try {
    return localStorage.getItem(LAST_JOB_KEY);
  } catch {
    return null;
  }
}

const MODEL_LABEL: Record<string, string> = {
  arima: "ARIMA (pmdarima auto)",
  prophet: "Prophet",
  lightgbm: "LightGBM",
  fallback_category_avg: "Category Average (cold start)",
  fallback_zero: "Zero (sparse/all-zero series)",
};

function mapeTone(m: number | null | undefined): "good" | "warn" | "bad" | "neutral" {
  if (m === null || m === undefined || !Number.isFinite(m)) return "neutral";
  if (m < 15) return "good";
  if (m < 30) return "warn";
  return "bad";
}

export function Forecasts() {
  const [skus, setSkus] = useState<SkuSummary[]>([]);
  const [skusLoading, setSkusLoading] = useState(true);
  const [jobId, setJobId] = useState<string | null>(loadLastJobId);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ForecastSeries | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load SKUs list.
  useEffect(() => {
    (async () => {
      try {
        const data = await api.getSkus();
        setSkus(data);
        if (!selectedSku && data.length > 0) {
          // Default to the first non-cold-start SKU so a real forecast loads.
          const first = data.find((s) => !s.cold_start) ?? data[0];
          setSelectedSku(first.sku);
        }
      } catch {
        /* silent — surfaces via empty selector */
      } finally {
        setSkusLoading(false);
      }
    })();
  }, [selectedSku]);

  // Re-read jobId in case it changed (eg. another tab ran a new forecast).
  useEffect(() => {
    const refresh = () => setJobId(loadLastJobId());
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  const loadChart = useCallback(
    async (sku: string, jid: string) => {
      setChartLoading(true);
      setError(null);
      try {
        const data = await api.getForecast(sku, jid);
        setChartData(data);
      } catch (err) {
        setChartData(null);
        if (err instanceof ApiError && err.status === 404) {
          setError(
            `No forecast exists for ${sku} in job ${jid.slice(0, 12)}. The SKU may have been added after the last run — run a new forecast.`
          );
        } else {
          setError(
            err instanceof ApiError
              ? `${err.status} — ${err.message}`
              : err instanceof Error
              ? err.message
              : "Unknown error"
          );
        }
      } finally {
        setChartLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedSku && jobId) void loadChart(selectedSku, jobId);
  }, [selectedSku, jobId, loadChart]);

  const skuOptions = useMemo(
    () =>
      skus
        .slice()
        .sort((a, b) => a.sku.localeCompare(b.sku))
        .map((s) => ({
          value: s.sku,
          label: `${s.sku} — ${s.name}${s.cold_start ? " (cold start)" : ""}`,
        })),
    [skus]
  );

  return (
    <main className="page forecasts-page">
      <header className="page-header">
        <div>
          <h1>Forecasts</h1>
          <p>Per-SKU forecast with the 95% prediction interval that drives safety stock.</p>
        </div>
      </header>

      {!jobId && (
        <div className="empty-callout" style={{ maxWidth: 640, margin: "0 auto" }}>
          No forecast run yet. Open the Dashboard tab and click{" "}
          <strong>Run Forecast</strong> to generate one.
        </div>
      )}

      {jobId && (
        <section className="forecast-panel">
          <header className="forecast-panel-head">
            <div className="forecast-selectors">
              <label htmlFor="sku-pick">SKU</label>
              <select
                id="sku-pick"
                className="sku-select"
                value={selectedSku ?? ""}
                onChange={(e) => setSelectedSku(e.target.value)}
                disabled={skusLoading}
              >
                {skuOptions.length === 0 && <option>(no SKUs loaded)</option>}
                {skuOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {chartData && (
              <div className="model-pills">
                <div className="model-pill model-pill-name">
                  <span className="pill-label">Chosen model</span>
                  <span className="pill-value">
                    {MODEL_LABEL[chartData.chosen_model] ?? chartData.chosen_model}
                  </span>
                </div>
                <div className={`model-pill model-pill-mape tone-${mapeTone(chartData.model_mape)}`}>
                  <span className="pill-label">Validation MAPE</span>
                  <span className="pill-value">
                    {chartData.model_mape === null || !Number.isFinite(chartData.model_mape)
                      ? "—"
                      : `${chartData.model_mape.toFixed(2)}%`}
                  </span>
                </div>
                <div className="model-pill">
                  <span className="pill-label">Horizon</span>
                  <span className="pill-value">{chartData.forecast.length}d</span>
                </div>
                <div className="model-pill">
                  <span className="pill-label">History</span>
                  <span className="pill-value">{chartData.historical.length}d</span>
                </div>
              </div>
            )}
          </header>

          {chartLoading && (
            <div className="chart-skeleton">
              <div className="kpi-skel-bar" style={{ width: "100%", height: 380 }} />
            </div>
          )}

          {!chartLoading && error && (
            <div className="run-error" style={{ marginTop: 16 }}>{error}</div>
          )}

          {!chartLoading && !error && chartData && (
            <>
              <ForecastChart data={chartData} />
              <FooterStrip data={chartData} />
            </>
          )}
        </section>
      )}
    </main>
  );
}

function FooterStrip({ data }: { data: ForecastSeries }) {
  const lastHist = data.historical[data.historical.length - 1];
  const firstFc = data.forecast[0];
  const lastFc = data.forecast[data.forecast.length - 1];

  const avgYhat =
    data.forecast.reduce((s, p) => s + p.yhat, 0) / Math.max(1, data.forecast.length);
  const avgBand =
    data.forecast.reduce((s, p) => s + (p.yhat_upper - p.yhat_lower), 0) /
    Math.max(1, data.forecast.length);

  return (
    <div className="forecast-footer">
      <div>
        <span className="ff-label">Last actual</span>
        <span className="ff-value">
          {lastHist ? `${lastHist.quantity} on ${lastHist.date}` : "—"}
        </span>
      </div>
      <div>
        <span className="ff-label">First forecast day</span>
        <span className="ff-value">
          {firstFc
            ? `${firstFc.yhat.toFixed(1)} on ${firstFc.date}`
            : "—"}
        </span>
      </div>
      <div>
        <span className="ff-label">Mean forecast / day</span>
        <span className="ff-value">{avgYhat.toFixed(1)}</span>
      </div>
      <div>
        <span className="ff-label">Avg 95% band width</span>
        <span className="ff-value">±{(avgBand / 2).toFixed(1)} units</span>
      </div>
      <div>
        <span className="ff-label">Forecast through</span>
        <span className="ff-value">{lastFc ? lastFc.date : "—"}</span>
      </div>
    </div>
  );
}
