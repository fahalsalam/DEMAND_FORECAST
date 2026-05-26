interface Props {
  onDismiss?: () => void;
}

interface Step {
  n: number;
  title: string;
  body: string;
  tint: "indigo" | "cyan" | "violet" | "green";
  icon: React.ReactNode;
}

const STEPS: Step[] = [
  {
    n: 1,
    title: "Pick a service level & click Run",
    body:
      "95% service level means we want to satisfy demand 95% of the time. " +
      "The job runs in the background — the dashboard updates live.",
    tint: "indigo",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
  {
    n: 2,
    title: "3 models compete per SKU",
    body:
      "ARIMA, Prophet and LightGBM each train on history minus the last 28 days, " +
      "then forecast that window. Accuracy is measured by MAPE (% error).",
    tint: "cyan",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="12" cy="18" r="3" />
        <path d="M6 9v3a6 6 0 006 6M18 9v3a6 6 0 01-6 6" />
      </svg>
    ),
  },
  {
    n: 3,
    title: "Lowest MAPE wins, per SKU",
    body:
      "Different products may pick different winners. The winner is refit on the " +
      "full history; SKUs with <60 days of sales use the category-average fallback.",
    tint: "violet",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 010-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
        <path d="M18 2H6v7a6 6 0 0012 0V2z" />
      </svg>
    ),
  },
  {
    n: 4,
    title: "Reorder decisions are computed",
    body:
      "Each SKU's forecast → safety stock (Z×σ×√L) → reorder point + EOQ → one of four statuses: " +
      "Healthy · Reorder Now · Stockout Risk · Overstock. All visible below.",
    tint: "green",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
];

export function HowItWorks({ onDismiss }: Props) {
  return (
    <section className="how-it-works" aria-label="How Run Forecast works">
      <header className="hiw-head">
        <div>
          <h3>
            <span className="hiw-eyebrow">Guide</span>
            How <code>Run Forecast</code> works
          </h3>
          <p>Four steps from sales history → automatic reorder decisions.</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            className="hiw-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss guide"
            title="Got it — hide this"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </header>

      <ol className="hiw-steps">
        {STEPS.map((s, i) => (
          <li key={s.n} className={`hiw-step hiw-tint-${s.tint}`}>
            <div className="hiw-icon" aria-hidden>{s.icon}</div>
            <div className="hiw-step-body">
              <div className="hiw-step-num">Step {s.n}</div>
              <div className="hiw-step-title">{s.title}</div>
              <p>{s.body}</p>
            </div>
            {i < STEPS.length - 1 && (
              <svg
                className="hiw-arrow"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            )}
          </li>
        ))}
      </ol>

      <div className="hiw-footnote">
        Behind the scenes: forecasts and the per-SKU model contest are stored
        in <code>forecast_results</code>; reorder logic uses{" "}
        <code>safety_stock = Z(SL)·σ·√L</code> and{" "}
        <code>EOQ = √(2·D·S/H)</code>.
      </div>
    </section>
  );
}
