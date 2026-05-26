import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { InventoryTable } from "../components/InventoryTable";
import { ProductsTable } from "../components/ProductsTable";
import { SalesBrowse } from "../components/SalesBrowse";
import { UploadCard } from "../components/UploadCard";

interface Summary {
  products: number;
  inventory_rows: number;
  sales_rows: number;
  forecast_jobs: number;
  ready_to_forecast: boolean;
}

type SubTab = "upload" | "products" | "inventory" | "sales";

const SUBTABS: { key: SubTab; label: string; description: string }[] = [
  { key: "upload",    label: "Upload",    description: "CSVs + sample templates" },
  { key: "products",  label: "Products",  description: "Master catalogue" },
  { key: "inventory", label: "Inventory", description: "On-hand per SKU" },
  { key: "sales",     label: "Sales",     description: "Per-SKU sales history" },
];

const fmtN = (n: number) => new Intl.NumberFormat().format(n);

export function Data() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<SubTab>(() => {
    try {
      const cached = localStorage.getItem("df:dataTab");
      return (cached as SubTab) ?? "upload";
    } catch {
      return "upload";
    }
  });
  const [resetState, setResetState] = useState<"idle" | "confirming" | "working" | "done" | "error">("idle");
  const [resetError, setResetError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.getDataSummary();
      setSummary(s);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      localStorage.setItem("df:dataTab", tab);
    } catch {
      /* ignore */
    }
  }, [tab]);

  async function doReset() {
    setResetState("working");
    setResetError(null);
    try {
      await api.resetData();
      try {
        localStorage.removeItem("df:lastJobId");
      } catch {
        /* ignore */
      }
      setResetState("done");
      void load();
      setTimeout(() => setResetState("idle"), 2200);
    } catch (err) {
      setResetState("error");
      setResetError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Reset failed");
    }
  }

  return (
    <main className="page data-page">
      <header className="page-header">
        <div>
          <h1>Data</h1>
          <p>Upload your own CSVs, browse the catalogue, inventory and sales history.</p>
        </div>
        <div className="page-header-actions">
          {resetState === "idle" && summary && (summary.products > 0 || summary.sales_rows > 0) && (
            <button className="btn btn-ghost danger" onClick={() => setResetState("confirming")}>
              Reset all data
            </button>
          )}
          {resetState === "confirming" && (
            <div className="reset-confirm">
              <span>This wipes every product, sale, inventory row and forecast. Sure?</span>
              <button className="btn btn-ghost" onClick={() => setResetState("idle")}>Cancel</button>
              <button className="btn btn-danger" onClick={() => void doReset()}>Yes, reset</button>
            </div>
          )}
          {resetState === "working" && <span className="muted">Resetting…</span>}
          {resetState === "done" && <span className="ok">✓ Database reset</span>}
          {resetState === "error" && <span className="bad">✗ {resetError}</span>}
        </div>
      </header>

      <section className="summary-row">
        <SummaryTile label="Products" value={summary?.products ?? 0} loading={loading} hint="Master catalogue" />
        <SummaryTile label="Inventory rows" value={summary?.inventory_rows ?? 0} loading={loading} hint="Per-SKU on-hand" />
        <SummaryTile label="Sales rows" value={summary?.sales_rows ?? 0} loading={loading} hint="Historical daily sales" />
        <SummaryTile
          label="Forecast runs"
          value={summary?.forecast_jobs ?? 0}
          loading={loading}
          hint={summary?.ready_to_forecast ? "Ready to run" : "Need products + sales"}
          tone={summary?.ready_to_forecast ? "good" : "warn"}
        />
      </section>

      {/* Subtab switcher */}
      <nav className="subtabs" role="tablist" aria-label="Data sections">
        {SUBTABS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={tab === s.key}
            className={`subtab ${tab === s.key ? "is-active" : ""}`}
            onClick={() => setTab(s.key)}
          >
            <span className="subtab-label">{s.label}</span>
            <span className="subtab-desc">{s.description}</span>
          </button>
        ))}
      </nav>

      {tab === "upload" && (
        <>
          <UploadCard
            kind="products"
            title="Product master"
            description="The catalogue: SKU, name, category, costs, lead time. Upload this first — sales and inventory rows reference these SKUs."
            columns={[
              { name: "sku", required: true },
              { name: "name", required: true },
              { name: "category", required: true },
              { name: "unit_cost", required: true },
              { name: "lead_time_days", required: true },
              { name: "ordering_cost", required: true },
              { name: "holding_cost_per_unit", required: true },
              { name: "supplier", required: false },
            ]}
            example="DEMO-COKE,Demo Cola 355ml,Beverages,1.20,5,40,0.30,DemoSupply"
            onUploaded={load}
          />

          <UploadCard
            kind="inventory"
            title="Current inventory"
            description="On-hand quantity per SKU. Re-upload anytime — existing SKUs are updated in place."
            columns={[
              { name: "sku", required: true },
              { name: "store_id", required: true },
              { name: "on_hand", required: true },
            ]}
            example="DEMO-COKE,STORE_001,30"
            onUploaded={load}
          />

          <UploadCard
            kind="sales"
            title="Sales history"
            description="Daily sales per SKU. 60+ days unlocks the 3-model contest; under 60 days falls back to the category average."
            columns={[
              { name: "sku", required: true },
              { name: "store_id", required: true },
              { name: "date", required: true, note: "YYYY-MM-DD" },
              { name: "quantity", required: true },
              { name: "price", required: false },
              { name: "promo_flag", required: false, note: "true/false" },
            ]}
            example="DEMO-COKE,STORE_001,2026-01-15,32,1.99,false"
            onUploaded={load}
          />

          {summary?.ready_to_forecast && (
            <div className="data-cta">
              You have data ready. Open the <strong>Dashboard</strong> and click{" "}
              <strong>Run Forecast</strong> to start generating predictions.
            </div>
          )}
        </>
      )}

      {tab === "products" && <ProductsTable />}
      {tab === "inventory" && <InventoryTable />}
      {tab === "sales" && <SalesBrowse />}
    </main>
  );
}

function SummaryTile({
  label,
  value,
  loading,
  hint,
  tone,
}: {
  label: string;
  value: number;
  loading: boolean;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <div className={`summary-tile tone-${tone ?? "neutral"}`}>
      <div className="summary-label">{label}</div>
      <div className="summary-value">{loading ? "…" : fmtN(value)}</div>
      {hint && <div className="summary-hint">{hint}</div>}
    </div>
  );
}
