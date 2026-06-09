import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

interface Props {
  onSignIn: () => void;
}

export function Landing({ onSignIn }: Props) {
  const { signIn, demoCreds } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleDemo() {
    setLoading(true);
    await signIn(demoCreds.email, demoCreds.password);
    setLoading(false);
  }

  return (
    <div className="landing">

      {/* ── NAV ─────────────────────────────────────── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-logo">
            <div className="lp-logo-mark" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 17 9 11 13 15 21 7" />
                <polyline points="14 7 21 7 21 14" />
              </svg>
            </div>
            <div className="lp-logo-text">
              <span className="lp-logo-name">DemandForecast</span>
              <span className="lp-logo-tag">Auto-Reorder</span>
            </div>
          </div>
          <div className="lp-nav-links">
            <a href="#features" className="lp-nav-link">Features</a>
            <a href="#how" className="lp-nav-link">How it works</a>
            <a href="#stats" className="lp-nav-link">Stats</a>
            <button className="lp-btn-outline" onClick={onSignIn}>Sign in</button>
            <button className="lp-btn-primary" onClick={handleDemo} disabled={loading}>
              {loading ? "Loading…" : "Try Demo"}
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-glow lp-glow-1" aria-hidden />
        <div className="lp-hero-glow lp-glow-2" aria-hidden />
        <div className="lp-hero-glow lp-glow-3" aria-hidden />

        <div className="lp-hero-inner">
          {/* ── Left: text content ── */}
          <div className="lp-hero-text">
            <div className="lp-hero-badge">
              <span className="lp-badge-dot" />
              AI-Powered · 3 Competing Forecast Models
            </div>

            <h1 className="lp-hero-h1">
              Smart Inventory.<br />
              <span className="lp-grad">Zero Guesswork.</span>
            </h1>

            <p className="lp-hero-sub">
              Predict demand for every SKU using ARIMA, Prophet &amp; LightGBM.
              The winning model automatically sizes safety stock, calculates reorder points,
              and builds your purchase order — grouped by supplier, ready to send.
            </p>

            <div className="lp-hero-ctas">
              <button className="lp-cta-primary" onClick={handleDemo} disabled={loading}>
                {loading ? (
                  <>
                    <span className="lp-spin" />  Loading demo…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Launch Live Demo
                  </>
                )}
              </button>
              <button className="lp-cta-ghost" onClick={onSignIn}>
                Sign in to your account
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Right: floating dashboard preview card ── */}
          <div className="lp-hero-preview" aria-hidden>
            <div className="lp-preview-bar">
              <span className="lp-dot red" /><span className="lp-dot yellow" /><span className="lp-dot green" />
              <span className="lp-preview-url">localhost:5173 · Demand Forecast</span>
            </div>
            <div className="lp-preview-body">
              <div className="lp-preview-kpis">
                <div className="lp-kpi-chip">
                  <span className="lp-kpi-val">35</span>
                  <span className="lp-kpi-lbl">SKUs</span>
                </div>
                <div className="lp-kpi-chip accent">
                  <span className="lp-kpi-val">9</span>
                  <span className="lp-kpi-lbl">Reorder</span>
                </div>
                <div className="lp-kpi-chip green">
                  <span className="lp-kpi-val">₹33k</span>
                  <span className="lp-kpi-lbl">PO Value</span>
                </div>
                <div className="lp-kpi-chip purple">
                  <span className="lp-kpi-val">95%</span>
                  <span className="lp-kpi-lbl">Service Level</span>
                </div>
              </div>
              {/* Mini sparkline bars */}
              <div className="lp-preview-chart">
                {[40, 65, 48, 80, 55, 90, 62, 75, 85, 58, 95, 70, 88, 60, 78].map((h, i) => (
                  <div key={i} className="lp-bar" style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="lp-preview-pills">
                <span className="lp-status-pill stockout">STOCKOUT ×9</span>
                <span className="lp-status-pill healthy">HEALTHY ×25</span>
                <span className="lp-status-pill overstock">OVERSTOCK ×1</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ──────────────────────────────── */}
      <section className="lp-stats" id="stats">
        <div className="lp-stats-inner">
          {[
            { val: "3",   unit: "AI Models",       hint: "ARIMA · Prophet · LightGBM" },
            { val: "95%", unit: "Service Level",    hint: "Default safety-stock target" },
            { val: "EOQ", unit: "Auto Sizing",      hint: "Economic Order Quantity" },
            { val: "∞",   unit: "SKU Support",      hint: "Parallel processing per SKU" },
            { val: "365", unit: "Day Horizon",      hint: "Seasonal + festival forecast" },
          ].map((s) => (
            <div key={s.unit} className="lp-stat">
              <div className="lp-stat-val">{s.val}</div>
              <div className="lp-stat-unit">{s.unit}</div>
              <div className="lp-stat-hint">{s.hint}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────── */}
      <section className="lp-features" id="features">
        <div className="lp-section-inner">
          <div className="lp-section-label">What it does</div>
          <h2 className="lp-section-h2">Every layer of the inventory stack — automated</h2>
          <p className="lp-section-sub">From raw sales data to a signed-off purchase order, the system handles the entire chain.</p>

          <div className="lp-feat-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className={`lp-feat-card lp-feat-${f.accent}`}>
                <div className="lp-feat-icon" aria-hidden>
                  {f.icon}
                </div>
                <h3 className="lp-feat-title">{f.title}</h3>
                <p className="lp-feat-desc">{f.desc}</p>
                <ul className="lp-feat-list">
                  {f.points.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────── */}
      <section className="lp-how" id="how">
        <div className="lp-section-inner">
          <div className="lp-section-label">Workflow</div>
          <h2 className="lp-section-h2">From data to decision in three steps</h2>

          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div key={s.title} className="lp-step">
                <div className="lp-step-num">{String(i + 1).padStart(2, "0")}</div>
                <div className="lp-step-icon" aria-hidden>{s.icon}</div>
                <h3 className="lp-step-title">{s.title}</h3>
                <p className="lp-step-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TECH STACK ───────────────────────────────── */}
      <section className="lp-tech">
        <div className="lp-tech-inner">
          <p className="lp-tech-label">Built with</p>
          <div className="lp-tech-chips">
            {["FastAPI", "Python 3.11", "SQLite", "pmdarima", "Prophet", "LightGBM",
              "React 18", "TypeScript", "Vite", "Recharts"].map((t) => (
              <span key={t} className="lp-tech-chip">{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ───────────────────────────────── */}
      <section className="lp-cta-banner">
        <div className="lp-cta-banner-glow" aria-hidden />
        <div className="lp-cta-banner-inner">
          <h2 className="lp-cta-banner-h2">Ready to see it in action?</h2>
          <p className="lp-cta-banner-sub">
            Launch the live demo with pre-loaded data — 35 SKUs, seasonal patterns, festival spikes and a full purchase order waiting for you.
          </p>
          <div className="lp-cta-banner-btns">
            <button className="lp-cta-primary" onClick={handleDemo} disabled={loading}>
              {loading ? "Loading…" : "Launch Live Demo →"}
            </button>
            <button className="lp-cta-ghost lp-cta-ghost-light" onClick={onSignIn}>
              Sign in with your account
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-logo-mark sm" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 17 9 11 13 15 21 7" />
                <polyline points="14 7 21 7 21 14" />
              </svg>
            </div>
            <span>DemandForecast · Auto-Reorder System</span>
          </div>
          <p className="lp-footer-copy">Academic project — Demand Forecasting &amp; Automatic Inventory Reorder System</p>
        </div>
      </footer>
    </div>
  );
}

/* ── Feature data ───────────────────────────────────────────────────── */

const FEATURES = [
  {
    accent: "blue",
    title: "AI Forecast Engine",
    desc: "Three models compete for every SKU. The one with the lowest MAPE on a 28-day holdout wins automatically.",
    points: ["Auto-ARIMA (pmdarima)", "Prophet with festival regressors", "LightGBM gradient boosting", "Cold-start fallback for new items"],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="14 7 21 7 21 14" />
      </svg>
    ),
  },
  {
    accent: "purple",
    title: "Smart Safety Stock",
    desc: "Uncertainty from the forecast band directly sizes the safety buffer — no more rule-of-thumb percentages.",
    points: ["95% prediction interval", "Z-score × σ × √lead-time", "Per-SKU reorder point", "EOQ-based order sizing"],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
  },
  {
    accent: "orange",
    title: "Seasonal & Festival Aware",
    desc: "Prophet decomposes trend, weekly, and yearly cycles. Configure local festivals and see their demand uplift.",
    points: ["365-day seasonal outlook", "Custom festival uplift (×)", "Pre/post festival windows", "Monthly demand bar charts"],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <path d="M8 14h.01M12 14h.01M16 14h.01" />
      </svg>
    ),
  },
  {
    accent: "green",
    title: "Auto Purchase Orders",
    desc: "At-risk SKUs flow straight into an editable purchase order, grouped by supplier — ready to export.",
    points: ["Supplier-grouped PO builder", "Editable order quantities", "Export to CSV", "Print-ready layout"],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
      </svg>
    ),
  },
  {
    accent: "red",
    title: "Real-time Alerts",
    desc: "Every SKU is classified — STOCKOUT_RISK, REORDER_NOW, OVERSTOCK, or HEALTHY — after each forecast run.",
    points: ["4-tier alert system", "Estimated reorder cost", "Plain-English explanations", "Filter by status"],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
  },
  {
    accent: "teal",
    title: "Full Audit Trail",
    desc: "Every recommendation links back to the model that made it, the math that sized it, and the data it learned from.",
    points: ["Model Inspector per SKU", "MAPE scores for all 3 models", "Safety stock formula shown", "Downloadable history"],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    ),
  },
];

/* ── Steps data ─────────────────────────────────────────────────────── */

const STEPS = [
  {
    title: "Upload your data",
    desc: "Drop in a products CSV and a sales CSV — or use the pre-loaded 35-SKU demo dataset with seasonal and festival patterns built in.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    title: "Run the AI forecast",
    desc: "One click runs all three models in parallel across every SKU. Fast mode delivers results in under 60 seconds. The best model wins per SKU.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    title: "Review & reorder",
    desc: "Alerts show every at-risk SKU with its reorder quantity and estimated cost. Open Reorder to build a supplier-grouped purchase order in seconds.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
];
