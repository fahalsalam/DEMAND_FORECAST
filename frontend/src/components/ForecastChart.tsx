import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ForecastSeries } from "../types";

interface Props {
  data: ForecastSeries;
  /** Limit how many historical days to draw so the chart stays readable. */
  historyTailDays?: number;
}

interface ChartRow {
  date: string;
  actual: number | null;            // historical actual
  yhat: number | null;              // forecast point
  band: [number, number] | null;    // [yhat_lower, yhat_upper] for the shaded area
}

function buildRows(data: ForecastSeries, tail: number): ChartRow[] {
  const hist = data.historical.slice(-tail);
  const rows: ChartRow[] = hist.map((h) => ({
    date: h.date,
    actual: h.quantity,
    yhat: null,
    band: null,
  }));

  // Bridge row: copy the LAST historical point into yhat so the forecast line
  // visually connects to the actuals. The shaded band starts at the same point.
  if (hist.length && data.forecast.length) {
    const lastHist = rows[rows.length - 1];
    lastHist.yhat = lastHist.actual;
    lastHist.band = [lastHist.actual!, lastHist.actual!];
  }

  for (const p of data.forecast) {
    rows.push({
      date: p.date,
      actual: null,
      yhat: p.yhat,
      band: [p.yhat_lower, p.yhat_upper],
    });
  }
  return rows;
}

const fmtDate = (d: string) => {
  const parts = d.split("-"); // YYYY-MM-DD
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : d;
};

export function ForecastChart({ data, historyTailDays = 120 }: Props) {
  const rows = buildRows(data, historyTailDays);
  const cutoffDate = data.historical.length
    ? data.historical[data.historical.length - 1].date
    : undefined;

  return (
    <div className="forecast-chart">
      <ResponsiveContainer width="100%" height={420}>
        <ComposedChart data={rows} margin={{ top: 12, right: 28, bottom: 8, left: 0 }}>
          <defs>
            <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#7c5cff" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.20} />
            </linearGradient>
            <linearGradient id="actualGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0f172a" stopOpacity={0.85} />
              <stop offset="100%" stopColor="#0f172a" stopOpacity={0.85} />
            </linearGradient>
            <linearGradient id="yhatGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7c5cff" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            stroke="rgba(15,23,42,0.45)"
            tick={{ fill: "rgba(15,23,42,0.55)", fontSize: 11 }}
            minTickGap={28}
          />
          <YAxis
            stroke="rgba(15,23,42,0.45)"
            tick={{ fill: "rgba(15,23,42,0.55)", fontSize: 11 }}
            width={48}
            allowDecimals={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: "rgba(15,23,42,0.18)", strokeWidth: 1 }}
          />

          {/* Shaded prediction interval — rendered first so lines paint on top. */}
          <Area
            type="monotone"
            dataKey="band"
            stroke="none"
            fill="url(#bandGrad)"
            fillOpacity={1}
            isAnimationActive={false}
            name="95% prediction interval"
            connectNulls
          />

          {/* Forecast continuation — gradient stroke, dashed to flag it's a forecast. */}
          <Line
            type="monotone"
            dataKey="yhat"
            stroke="url(#yhatGrad)"
            strokeWidth={2.5}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2, fill: "#7c5cff" }}
            isAnimationActive={false}
            name="Forecast"
            connectNulls
          />

          {/* Historical actuals — solid white line. */}
          <Line
            type="monotone"
            dataKey="actual"
            stroke="url(#actualGrad)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, stroke: "#0f172a", strokeWidth: 1, fill: "#fff" }}
            isAnimationActive={false}
            name="Historical"
            connectNulls={false}
          />

          {cutoffDate && (
            <ReferenceLine
              x={cutoffDate}
              stroke="rgba(56, 189, 248, 0.55)"
              strokeDasharray="3 4"
              label={{
                value: "today",
                position: "top",
                fill: "rgba(56, 189, 248, 0.8)",
                fontSize: 10,
              }}
            />
          )}

          <Legend
            wrapperStyle={{ paddingTop: 10 }}
            iconType="plainline"
            formatter={(value) => (
              <span style={{ color: "rgba(15,23,42,0.75)", fontSize: 12 }}>
                {value}
              </span>
            )}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipPayload {
  dataKey: string;
  value: number | [number, number] | null;
  payload: ChartRow;
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">{label}</div>
      {row.actual !== null && (
        <div className="chart-tooltip-row">
          <span className="dot actual" /> Actual
          <strong>{row.actual.toFixed(0)}</strong>
        </div>
      )}
      {row.yhat !== null && (
        <div className="chart-tooltip-row">
          <span className="dot yhat" /> Forecast
          <strong>{row.yhat.toFixed(1)}</strong>
        </div>
      )}
      {row.band !== null && (
        <div className="chart-tooltip-row band">
          95% PI
          <strong>
            [{row.band[0].toFixed(1)}, {row.band[1].toFixed(1)}]
          </strong>
        </div>
      )}
    </div>
  );
}
