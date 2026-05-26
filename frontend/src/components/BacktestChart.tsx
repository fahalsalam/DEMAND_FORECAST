import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BacktestResult } from "../types";

interface Props {
  data: BacktestResult;
}

const COLOR_BASELINE = "#fb7185";   // pink/red — naive policy
const COLOR_SYSTEM = "#38bdf8";     // cyan — our system

/**
 * Stockout days and avg inventory live on totally different scales (eg. 12
 * vs 540), so a single chart with both as groups visually collapses one.
 * We render TWO small grouped bar charts side-by-side instead — each focused
 * on one metric. Both share the same color encoding (baseline vs system).
 */
export function BacktestChart({ data }: Props) {
  const stockoutData = [
    { label: "Baseline", value: data.baseline.stockout_days, fill: COLOR_BASELINE },
    { label: "System",   value: data.system.stockout_days,   fill: COLOR_SYSTEM },
  ];
  const inventoryData = [
    { label: "Baseline", value: Math.round(data.baseline.avg_inventory), fill: COLOR_BASELINE },
    { label: "System",   value: Math.round(data.system.avg_inventory),   fill: COLOR_SYSTEM },
  ];

  return (
    <div className="backtest-charts">
      <ChartPanel
        title="Stockout days"
        unit="days"
        data={stockoutData}
        lowerIsBetter
        baselineValue={data.baseline.stockout_days}
        systemValue={data.system.stockout_days}
      />
      <ChartPanel
        title="Average inventory held"
        unit="units"
        data={inventoryData}
        lowerIsBetter
        baselineValue={data.baseline.avg_inventory}
        systemValue={data.system.avg_inventory}
      />
    </div>
  );
}

interface PanelProps {
  title: string;
  unit: string;
  data: { label: string; value: number; fill: string }[];
  lowerIsBetter: boolean;
  baselineValue: number;
  systemValue: number;
}

function ChartPanel({ title, unit, data, lowerIsBetter, baselineValue, systemValue }: PanelProps) {
  const delta = baselineValue - systemValue;            // positive = system wins (lower)
  const improvement = lowerIsBetter ? delta : -delta;
  const pct = baselineValue === 0 ? 0 : (improvement / Math.max(baselineValue, 1)) * 100;
  const tone = improvement > 0 ? "good" : improvement < 0 ? "bad" : "neutral";

  return (
    <div className="bt-panel">
      <div className="bt-panel-head">
        <h4>{title}</h4>
        <span className={`bt-delta tone-${tone}`}>
          {improvement > 0 ? "▼" : improvement < 0 ? "▲" : "·"}{" "}
          {Math.abs(improvement).toFixed(0)} {unit}
          {Number.isFinite(pct) && pct !== 0 && (
            <em> ({pct > 0 ? "−" : "+"}{Math.abs(pct).toFixed(0)}%)</em>
          )}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={data}
          margin={{ top: 16, right: 16, bottom: 8, left: 0 }}
          barCategoryGap={36}
        >
          <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="rgba(15,23,42,0.45)"
            tick={{ fill: "rgba(15,23,42,0.75)", fontSize: 12, fontWeight: 600 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="rgba(15,23,42,0.45)"
            tick={{ fill: "rgba(15,23,42,0.55)", fontSize: 11 }}
            width={44}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(15,23,42,0.04)" }}
            contentStyle={{
              background: "#ffffff",
              border: "1px solid rgba(15,23,42,0.14)",
              borderRadius: 8,
              fontSize: 12,
              color: "#0f172a",
              boxShadow: "0 8px 24px -10px rgba(15,23,42,0.15)",
            }}
            labelStyle={{ color: "#475569", fontSize: 11 }}
            formatter={(v: number) => [`${v} ${unit}`, ""]}
          />
          <Bar
            dataKey="value"
            radius={[10, 10, 0, 0]}
            isAnimationActive={false}
            label={{
              position: "top",
              fill: "rgba(15,23,42,0.85)",
              fontSize: 13,
              fontWeight: 700,
              formatter: (v: number) => `${v}`,
            }}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} fillOpacity={0.9} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <Legend
        align="center"
        wrapperStyle={{ position: "static", paddingTop: 8 }}
        payload={[
          { value: "Baseline (naive)", type: "square", color: COLOR_BASELINE, id: "b" },
          { value: "System (forecast-driven)", type: "square", color: COLOR_SYSTEM, id: "s" },
        ]}
      />
    </div>
  );
}
