/**
 * Typed API client — the single chokepoint for all backend calls.
 * Every method's return type comes from src/types/index.ts which mirrors
 * the backend's Pydantic schemas.
 */
import type {
  BacktestResult,
  FestivalIn,
  FestivalOut,
  ForecastRunRequest,
  ForecastRunResponse,
  ForecastSeries,
  ForecastStatusResponse,
  HealthResponse,
  InspectionResponse,
  InventoryRow,
  MetricsSummary,
  ProductOut,
  ReorderDecisionOut,
  ReorderStatus,
  SalesDayPoint,
  SeasonalOutlook,
  SkuSalesSummary,
  SkuSummary,
} from "../types";

const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "http://localhost:8000";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail =
        typeof body.detail === "string"
          ? body.detail
          : body.detail?.message ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | number | string[] | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  baseUrl: API_BASE,

  // health
  getHealth: () => request<HealthResponse>("/health"),

  // data
  getSkus: () => request<SkuSummary[]>("/data/skus"),
  getDataSummary: () =>
    request<{
      products: number;
      inventory_rows: number;
      sales_rows: number;
      forecast_jobs: number;
      ready_to_forecast: boolean;
    }>("/data/summary"),
  resetData: () =>
    request<{ status: string; message: string }>("/data/reset", { method: "POST" }),

  uploadCsv: async (
    kind: "products" | "inventory" | "sales",
    file: File
  ): Promise<{
    rows_received: number;
    rows_written: number;
    rows_skipped: number;
    warnings: string[];
  }> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API_BASE}/data/upload/${kind}`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      let detail: unknown = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail ?? body;
      } catch {
        /* non-JSON */
      }
      throw new ApiError(res.status, JSON.stringify(detail));
    }
    return res.json();
  },

  templateUrl: (kind: "products" | "inventory" | "sales") =>
    `${API_BASE}/data/templates/${kind}`,

  // browse
  listProducts: (opts?: { search?: string; category?: string }) =>
    request<ProductOut[]>(`/data/products${qs({ search: opts?.search, category: opts?.category })}`),
  listCategories: () => request<string[]>("/data/categories"),
  listInventory: () => request<InventoryRow[]>("/data/inventory"),
  listSalesSummaries: (days = 30) =>
    request<SkuSalesSummary[]>(`/data/sales/summaries${qs({ days })}`),
  listSalesForSku: (sku: string, days = 90) =>
    request<SalesDayPoint[]>(`/data/sales/${encodeURIComponent(sku)}${qs({ days })}`),

  // festivals
  listFestivals: (upcomingOnly = false) =>
    request<FestivalOut[]>(`/config/festivals${qs({ upcoming_only: upcomingOnly ? "true" : undefined })}`),
  createFestival: (body: FestivalIn) =>
    request<FestivalOut>("/config/festivals", { method: "POST", body: JSON.stringify(body) }),
  updateFestival: (id: number, body: FestivalIn) =>
    request<FestivalOut>(`/config/festivals/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteFestival: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/config/festivals/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      throw new ApiError(res.status, await res.text());
    }
  },

  // seasonal outlook
  getSeasonal: (sku: string, horizonDays = 365) =>
    request<SeasonalOutlook>(`/forecast/seasonal/${encodeURIComponent(sku)}${qs({ horizon_days: horizonDays })}`),

  // delete
  deleteProduct: (sku: string) =>
    request<{
      sku: string;
      name: string;
      deleted: {
        product: number;
        sales_rows: number;
        inventory_rows: number;
        forecast_results: number;
        reorder_decisions: number;
      };
    }>(`/data/products/${encodeURIComponent(sku)}`, { method: "DELETE" }),
  deleteInventory: (sku: string) =>
    request<{ sku: string; deleted: boolean }>(
      `/data/inventory/${encodeURIComponent(sku)}`,
      { method: "DELETE" }
    ),

  // forecast
  runForecast: (body: ForecastRunRequest) =>
    request<ForecastRunResponse>("/forecast/run", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getForecastStatus: (jobId: string) =>
    request<ForecastStatusResponse>(`/forecast/status/${jobId}`),
  getLatestJob: () => request<ForecastStatusResponse>("/forecast/latest"),
  cancelForecast: (jobId: string) =>
    request<ForecastStatusResponse>(`/forecast/cancel/${encodeURIComponent(jobId)}`, {
      method: "POST",
    }),
  getForecast: (sku: string, jobId: string) =>
    request<ForecastSeries>(`/forecast/${encodeURIComponent(sku)}${qs({ job_id: jobId })}`),
  inspectPipeline: (sku: string, opts?: { service_level?: number; review_period_days?: number }) =>
    request<InspectionResponse>(
      `/forecast/inspect/${encodeURIComponent(sku)}${qs({
        service_level: opts?.service_level,
        review_period_days: opts?.review_period_days,
      })}`
    ),

  // reorder
  getAlerts: (jobId: string, opts?: { status?: ReorderStatus[] | "ALL" }) =>
    request<ReorderDecisionOut[]>(
      `/reorder/alerts${qs({
        job_id: jobId,
        status: opts?.status === "ALL" ? ["ALL"] : opts?.status,
      })}`
    ),

  // backtest
  getBacktest: (sku: string, opts?: { holdout_days?: number; service_level?: number }) =>
    request<BacktestResult>(
      `/backtest/${encodeURIComponent(sku)}${qs({
        holdout_days: opts?.holdout_days,
        service_level: opts?.service_level,
      })}`
    ),

  // metrics
  getMetrics: (jobId: string) =>
    request<MetricsSummary>(`/metrics/${jobId}`),
};

export { ApiError };
