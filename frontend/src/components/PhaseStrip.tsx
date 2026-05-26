const PHASES: { n: number; label: string }[] = [
  { n: 0, label: "Scaffold" },
  { n: 1, label: "Data" },
  { n: 2, label: "Forecast" },
  { n: 3, label: "Inventory" },
  { n: 4, label: "API" },
  { n: 5, label: "Dashboard" },
  { n: 6, label: "Charts" },
  { n: 7, label: "Alerts" },
  { n: 8, label: "Backtest" },
  { n: 9, label: "Polish" },
];

// All phases complete — mark every cell "done" and highlight phase 9 as the
// most recent. Tweak this constant if you want to revisit an earlier phase.
const CURRENT_PHASE = 9;

export function PhaseStrip() {
  return (
    <section className="phases" aria-label="Project build progress">
      <div className="phases-title">Project roadmap</div>
      <div className="phases-track">
        {PHASES.map((p) => {
          const cls =
            p.n < CURRENT_PHASE
              ? "done"
              : p.n === CURRENT_PHASE
              ? "current"
              : "";
          return (
            <div key={p.n} className={`phase-cell ${cls}`} title={`Phase ${p.n} — ${p.label}`}>
              <div style={{ textAlign: "center" }}>
                <strong>{p.n}</strong>
                <small>{p.label}</small>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
