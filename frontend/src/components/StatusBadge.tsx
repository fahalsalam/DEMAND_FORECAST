import type { ReorderStatus } from "../types";

const LABELS: Record<ReorderStatus, string> = {
  HEALTHY: "Healthy",
  REORDER_NOW: "Reorder",
  STOCKOUT_RISK: "Stockout",
  OVERSTOCK: "Overstock",
};

export function StatusBadge({ status, size = "md" }: { status: ReorderStatus; size?: "sm" | "md" }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()} status-${size}`}>
      {LABELS[status]}
    </span>
  );
}
