import type { ReorderDecisionOut, ReorderStatus, SkuSummary } from "../types";

const STATUS_ORDER: ReorderStatus[] = [
  "STOCKOUT_RISK",
  "REORDER_NOW",
  "OVERSTOCK",
  "HEALTHY",
];

const STATUS_LABEL: Record<ReorderStatus, string> = {
  STOCKOUT_RISK: "Stockout Risk",
  REORDER_NOW: "Reorder Now",
  OVERSTOCK: "Overstock",
  HEALTHY: "Healthy",
};

const STATUS_SUBLABEL: Record<ReorderStatus, string> = {
  STOCKOUT_RISK: "stock will run out before lead time",
  REORDER_NOW: "stock at or below reorder point",
  OVERSTOCK: "stock above EOQ overstock threshold",
  HEALTHY: "stock comfortably between ROP and overstock",
};

interface Props {
  alerts: ReorderDecisionOut[];      // all decisions (use status=ALL)
  skus: SkuSummary[];                // for SKUs not yet in a job
  loading?: boolean;
}

export function StatusGrid({ alerts, skus, loading }: Props) {
  // Group alerts by status.
  const buckets: Record<ReorderStatus, ReorderDecisionOut[]> = {
    STOCKOUT_RISK: [],
    REORDER_NOW: [],
    OVERSTOCK: [],
    HEALTHY: [],
  };
  for (const a of alerts) buckets[a.status].push(a);

  if (loading) {
    return (
      <section className="status-grid-wrap">
        <header className="section-head">
          <h2>SKU status grid</h2>
          <p>Color-coded by reorder decision</p>
        </header>
        <div className="sku-grid">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="sku-tile sku-skel" />
          ))}
        </div>
      </section>
    );
  }

  if (alerts.length === 0) {
    return (
      <section className="status-grid-wrap">
        <header className="section-head">
          <h2>SKU status grid</h2>
          <p>Run a forecast to color-code your {skus.length || 0} SKUs</p>
        </header>
        <div className="empty-grid">
          {skus.slice(0, 32).map((s) => (
            <div key={s.sku} className="sku-tile sku-empty">
              <div className="sku-code">{s.sku}</div>
              <div className="sku-name">{s.name}</div>
            </div>
          ))}
          {skus.length === 0 && (
            <div className="empty-callout">
              No SKUs yet. Upload product master + sales + inventory or run
              <code> seed.py</code> in the backend.
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="status-grid-wrap">
      <header className="section-head">
        <h2>SKU status grid</h2>
        <p>{alerts.length} SKUs grouped by reorder decision</p>
      </header>

      <div className="status-sections">
        {STATUS_ORDER.map((s) => {
          const items = buckets[s];
          if (items.length === 0) return null;
          return (
            <div key={s} className={`status-section bucket-${s.toLowerCase()}`}>
              <div className="status-section-head">
                <div className={`status-dot status-dot-${s.toLowerCase()}`} />
                <div>
                  <h4>{STATUS_LABEL[s]}</h4>
                  <p>{STATUS_SUBLABEL[s]}</p>
                </div>
                <span className="bucket-count">{items.length}</span>
              </div>
              <div className="sku-grid">
                {items.map((a) => (
                  <SkuTile key={a.sku} a={a} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SkuTile({ a }: { a: ReorderDecisionOut }) {
  return (
    <div className={`sku-tile sku-${a.status.toLowerCase()}`} title={a.explanation}>
      <div className="sku-tile-row">
        <span className="sku-code">{a.sku}</span>
        <span className="sku-stock">stock {a.current_stock}</span>
      </div>
      <div className="sku-name">{a.name}</div>
      {a.recommended_order_qty > 0 && (
        <div className="sku-rec">
          Order <strong>{Math.round(a.recommended_order_qty)}</strong>
          <span className="muted">
            {" "}≈ {new Intl.NumberFormat("en-IN", {
              style: "currency",
              currency: "INR",
              maximumFractionDigits: 0,
            }).format(a.estimated_cost)}
          </span>
        </div>
      )}
    </div>
  );
}
