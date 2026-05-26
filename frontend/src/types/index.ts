/**
 * Shared TypeScript types — mirror the backend Pydantic schemas.
 * Keep these in sync with backend/app/schemas/*.
 */

// ---------- health ---------------------------------------------------------
export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  service: string;
  version: string;
  timestamp: string;
}

export type ConnectionState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; data: HealthResponse; latencyMs: number }
  | { kind: "error"; message: string };

// ---------- data layer -----------------------------------------------------
export interface SkuSummary {
  sku: string;
  name: string;
  category: string;
  unit_cost: number;
  lead_time_days: number;
  on_hand: number | null;
  sales_days_available: number;
  cold_start: boolean;
}

export interface ProductOut {
  sku: string;
  name: string;
  category: string;
  unit_cost: number;
  lead_time_days: number;
  ordering_cost: number;
  holding_cost_per_unit: number;
  supplier: string | null;
}

export interface InventoryRow {
  sku: string;
  name: string;
  category: string;
  store_id: string;
  on_hand: number;
  unit_cost: number;
  stock_value: number;
  updated_at: string;
}

export interface SalesDayPoint {
  date: string;
  quantity: number;
  promo: boolean;
}

export interface SkuSalesSummary {
  sku: string;
  name: string;
  category: string;
  days_available: number;
  total_units: number;
  avg_daily: number;
  last_30d_units: number;
  last_sale_date: string | null;
  daily: SalesDayPoint[];
}

// ---------- forecast -------------------------------------------------------
export type JobStatus = "running" | "complete" | "failed";

export interface ForecastRunRequest {
  service_level: number;
  review_period_days?: number;
}

export interface ForecastRunResponse {
  job_id: string;
}

export interface ForecastStatusResponse {
  job_id: string;
  status: JobStatus;
  created_at: string;
  completed_at: string | null;
  service_level: number;
  message: string | null;
  skus_processed: number | null;
  skus_total: number | null;
}

export interface HistoricalPoint {
  date: string;
  quantity: number;
}

export interface ForecastPointOut {
  date: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

export interface ForecastSeries {
  sku: string;
  job_id: string;
  chosen_model: string;
  model_mape: number | null;
  historical: HistoricalPoint[];
  forecast: ForecastPointOut[];
}

// ---------- reorder --------------------------------------------------------
export type ReorderStatus =
  | "HEALTHY"
  | "REORDER_NOW"
  | "OVERSTOCK"
  | "STOCKOUT_RISK";

export interface ReorderDecisionOut {
  sku: string;
  name: string;
  category: string;
  status: ReorderStatus;
  avg_daily_demand: number;
  demand_std: number;
  safety_stock: number;
  reorder_point: number;
  eoq: number;
  current_stock: number;
  recommended_order_qty: number;
  explanation: string;
  unit_cost: number;
  estimated_cost: number;
  lead_time_days: number;
}

// ---------- backtest -------------------------------------------------------
export interface PolicyMetricsOut {
  name: string;
  stockout_days: number;
  units_lost: number;
  units_demanded: number;
  service_rate: number;
  avg_inventory: number;
  total_holding_cost: number;
  overstock_unit_days: number;
  orders_placed: number;
}

export interface BacktestResult {
  sku: string;
  horizon_days: number;
  baseline: PolicyMetricsOut;
  system: PolicyMetricsOut;
  stockout_days_reduction: number;
  avg_inventory_reduction: number;
  holding_cost_savings: number;
  summary: string;
}

// ---------- inspector ------------------------------------------------------
export interface ModelTraceOut {
  name: string;
  val_yhat: number[];
  val_yhat_lower: number[];
  val_yhat_upper: number[];
  mae: number;
  rmse: number;
  mape: number;
  error?: string | null;
}

export interface ReorderMathStep {
  label: string;
  formula: string;
  value: number;
  unit?: string | null;
  explanation?: string | null;
}

export interface InspectionResponse {
  sku: string;
  name: string;
  category: string;
  lead_time_days: number;
  history_dates: string[];
  history_values: number[];
  train_end_date: string | null;
  val_dates: string[];
  val_actuals: number[];
  candidates: ModelTraceOut[];
  winner: string;
  winner_mape: number;
  final_forecast: ForecastPointOut[];
  current_stock: number;
  reorder_math: ReorderMathStep[];
  decision_status: ReorderStatus | string;
  decision_qty: number;
  decision_explanation: string;
  notes: string;
}

// ---------- metrics --------------------------------------------------------
export interface StatusCounts {
  HEALTHY: number;
  REORDER_NOW: number;
  OVERSTOCK: number;
  STOCKOUT_RISK: number;
}

export interface MetricsSummary {
  job_id: string;
  total_skus: number;
  avg_mape: number | null;
  at_risk_count: number;
  total_inventory_value: number;
  total_recommended_order_value: number;
  status_counts: StatusCounts;
  model_usage: Record<string, number>;
}
