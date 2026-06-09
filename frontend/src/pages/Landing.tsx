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
    <div className="lp-root">

      {/* ── NAV ─────────────────────────────────── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-logo">
            <div className="lp-logo-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 17 9 11 13 15 21 7" />
                <polyline points="14 7 21 7 21 14" />
              </svg>
            </div>
            <span className="lp-logo-name">Demand<strong>Forecast</strong></span>
          </div>
          <div className="lp-nav-right">
            <a href="#how-it-works" className="lp-nav-anchor">How it works</a>
            <a href="#under-the-hood" className="lp-nav-anchor">Under the hood</a>
            <button className="lp-nav-demo" onClick={handleDemo} disabled={loading}>
              {loading ? "Opening…" : "Open Demo →"}
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-inner">

          {/* Left — copy */}
          <div className="lp-hero-copy">
            <div className="lp-eyebrow">Demand Forecasting · Auto-Reorder System</div>
            <h1 className="lp-h1">
              Stop guessing<br />
              when to reorder.
            </h1>
            <p className="lp-hero-p">
              Three AI models compete for every product. The one that predicts your sales
              most accurately wins — then automatically calculates how much stock to order
              and when, so you never run out before a festival or over-buy after one.
            </p>
            <div className="lp-hero-actions">
              <button className="lp-btn-demo" onClick={handleDemo} disabled={loading}>
                {loading
                  ? <><span className="lp-loader" /> Opening demo…</>
                  : <>Try the live demo — no setup needed</>
                }
              </button>
              <button className="lp-btn-login" onClick={onSignIn}>Sign in</button>
            </div>
            <p className="lp-hero-note">
              Pre-loaded with 35 products · seasonal patterns · Eid, Diwali &amp; Christmas spikes
            </p>
          </div>

          {/* Right — live snapshot card */}
          <div className="lp-snapshot">
            <div className="lp-snapshot-header">
              <span className="lp-snapshot-title">Latest forecast run</span>
              <span className="lp-snapshot-badge">● Live</span>
            </div>

            <div className="lp-snapshot-kpis">
              <div className="lp-kpi">
                <span className="lp-kpi-n danger">9</span>
                <span className="lp-kpi-l">need reorder</span>
              </div>
              <div className="lp-kpi">
                <span className="lp-kpi-n">25</span>
                <span className="lp-kpi-l">healthy</span>
              </div>
              <div className="lp-kpi">
                <span className="lp-kpi-n accent">₹33,876</span>
                <span className="lp-kpi-l">suggested PO</span>
              </div>
            </div>

            <div className="lp-snapshot-divider" />

            {/* Reorder rows */}
            <div className="lp-sku-list">
              {[
                { sku:"SKU-019",  name:"Household Item 2",    days:9,  cost:"₹7,580", urgent:true },
                { sku:"EID-SWEETS",name:"Premium Date Box",   days:7,  cost:"₹5,099", urgent:true },
                { sku:"SKU-007",  name:"Snack Item 1",        days:7,  cost:"₹4,016", urgent:true },
                { sku:"LEMONADE", name:"Iced Lemonade 500ml", days:5,  cost:"₹3,415", urgent:true },
              ].map(r => (
                <div key={r.sku} className="lp-sku-row">
                  <span className={`lp-sku-dot ${r.urgent ? "urgent" : ""}`} />
                  <span className="lp-sku-name">{r.name}</span>
                  <span className="lp-sku-lead">{r.days}d lead</span>
                  <span className="lp-sku-cost">{r.cost}</span>
                </div>
              ))}
            </div>

            <div className="lp-snapshot-footer">
              Model contest: ARIMA vs Prophet vs LightGBM · best MAPE wins per SKU
            </div>
          </div>
        </div>
      </section>

      {/* ── THE PROBLEM ──────────────────────────── */}
      <section className="lp-problem">
        <div className="lp-section-wrap">
          <div className="lp-problem-grid">
            <div className="lp-problem-copy">
              <div className="lp-eyebrow muted">The problem it solves</div>
              <h2 className="lp-h2">
                Your Eid stock ran out<br />3 days before the festival.
              </h2>
              <p className="lp-body-p">
                Traditional inventory systems use fixed reorder points set months ago.
                They don't know that Eid demand spikes 3× for two weeks, or that summer
                lemonade sells 5× faster in June than March.
              </p>
              <p className="lp-body-p">
                This system learns those patterns from your own sales history. It adjusts
                every SKU's reorder point based on the upcoming season, and explains
                exactly why it made each recommendation.
              </p>
            </div>
            <div className="lp-problem-cards">
              <div className="lp-pcard bad">
                <div className="lp-pcard-label">Before</div>
                <div className="lp-pcard-item">
                  <span className="lp-x">✕</span> Fixed reorder point: 100 units
                </div>
                <div className="lp-pcard-item">
                  <span className="lp-x">✕</span> Ran out 3 days pre-Eid
                </div>
                <div className="lp-pcard-item">
                  <span className="lp-x">✕</span> Buyer guessed the order qty
                </div>
                <div className="lp-pcard-item">
                  <span className="lp-x">✕</span> Lost ₹5,000+ in sales
                </div>
              </div>
              <div className="lp-pcard good">
                <div className="lp-pcard-label">After</div>
                <div className="lp-pcard-item">
                  <span className="lp-check">✓</span> Dynamic ROP: 65 units (Eid-aware)
                </div>
                <div className="lp-pcard-item">
                  <span className="lp-check">✓</span> Reorder triggered 7 days early
                </div>
                <div className="lp-pcard-item">
                  <span className="lp-check">✓</span> EOQ-sized order: 537 units
                </div>
                <div className="lp-pcard-item">
                  <span className="lp-check">✓</span> Full stock through the festival
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────── */}
      <section className="lp-how" id="how-it-works">
        <div className="lp-section-wrap">
          <div className="lp-eyebrow">How it works</div>
          <h2 className="lp-h2">From sales data to purchase order in one run</h2>

          <div className="lp-flow">
            {[
              {
                n: "01",
                title: "Upload your sales history",
                body: "Drop in a CSV of daily sales — product, date, quantity. Or use the 35-product demo dataset that already has seasonal spikes, Eid demand, and summer patterns baked in.",
                tag: "Data layer",
              },
              {
                n: "02",
                title: "Three models race for each SKU",
                body: "Auto-ARIMA, Prophet, and LightGBM each fit a forecast on your history. The last 28 days are held out as a test set. The model with the lowest error (MAPE) wins that SKU.",
                tag: "Forecast engine",
              },
              {
                n: "03",
                title: "Uncertainty sizes your safety stock",
                body: "The winning model's 95% prediction interval determines the safety buffer — wider uncertainty = more safety stock. The reorder point = lead-time demand + safety stock.",
                tag: "Inventory math",
              },
              {
                n: "04",
                title: "At-risk SKUs build your purchase order",
                body: "Any product below its reorder point appears in the Reorder page, grouped by supplier. Adjust quantities, uncheck what you don't want, export to CSV — done.",
                tag: "Auto PO builder",
              },
            ].map(s => (
              <div key={s.n} className="lp-flow-step">
                <div className="lp-flow-n">{s.n}</div>
                <div className="lp-flow-body">
                  <div className="lp-flow-tag">{s.tag}</div>
                  <h3 className="lp-flow-title">{s.title}</h3>
                  <p className="lp-flow-p">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── UNDER THE HOOD ───────────────────────── */}
      <section className="lp-hood" id="under-the-hood">
        <div className="lp-section-wrap">
          <div className="lp-eyebrow">Under the hood</div>
          <h2 className="lp-h2">Built for an academic evaluation — transparent by design</h2>
          <p className="lp-hood-sub">
            Every number is traceable. The Inspector page shows exactly which model won,
            what its MAPE was, and how safety stock was calculated for every single SKU.
          </p>

          <div className="lp-hood-grid">
            <div className="lp-hood-card">
              <h3>Forecast models</h3>
              <div className="lp-hood-items">
                <div className="lp-hood-item">
                  <span className="lp-hood-label">Auto-ARIMA</span>
                  <span className="lp-hood-val">pmdarima · stepwise p,d,q search</span>
                </div>
                <div className="lp-hood-item">
                  <span className="lp-hood-label">Prophet</span>
                  <span className="lp-hood-val">trend + weekly + yearly + festival regressors</span>
                </div>
                <div className="lp-hood-item">
                  <span className="lp-hood-label">LightGBM</span>
                  <span className="lp-hood-val">lag features, rolling stats, day-of-week</span>
                </div>
                <div className="lp-hood-item">
                  <span className="lp-hood-label">Winner selection</span>
                  <span className="lp-hood-val">28-day holdout MAPE, per SKU</span>
                </div>
              </div>
            </div>

            <div className="lp-hood-card">
              <h3>Inventory formulas</h3>
              <div className="lp-hood-items">
                <div className="lp-hood-item">
                  <span className="lp-hood-label">Safety stock</span>
                  <span className="lp-hood-val">Z(SL) × σ_demand × √lead_time</span>
                </div>
                <div className="lp-hood-item">
                  <span className="lp-hood-label">Reorder point</span>
                  <span className="lp-hood-val">avg_daily × lead_time + safety_stock</span>
                </div>
                <div className="lp-hood-item">
                  <span className="lp-hood-label">Order qty (EOQ)</span>
                  <span className="lp-hood-val">√(2 × annual_demand × order_cost / holding_cost)</span>
                </div>
                <div className="lp-hood-item">
                  <span className="lp-hood-label">Service level</span>
                  <span className="lp-hood-val">95% default → Z = 1.645</span>
                </div>
              </div>
            </div>

            <div className="lp-hood-card">
              <h3>Tech stack</h3>
              <div className="lp-hood-items">
                <div className="lp-hood-item">
                  <span className="lp-hood-label">Backend</span>
                  <span className="lp-hood-val">Python 3.11 · FastAPI · SQLite · SQLAlchemy</span>
                </div>
                <div className="lp-hood-item">
                  <span className="lp-hood-label">ML stack</span>
                  <span className="lp-hood-val">pmdarima · Prophet 1.1.6 · LightGBM 4.5</span>
                </div>
                <div className="lp-hood-item">
                  <span className="lp-hood-label">Frontend</span>
                  <span className="lp-hood-val">React 18 · TypeScript · Vite · Recharts</span>
                </div>
                <div className="lp-hood-item">
                  <span className="lp-hood-label">Architecture</span>
                  <span className="lp-hood-val">core/ has zero FastAPI imports — pure Python</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHAT YOU GET ─────────────────────────── */}
      <section className="lp-pages">
        <div className="lp-section-wrap">
          <div className="lp-eyebrow">What's inside</div>
          <h2 className="lp-h2">Eight pages, one complete workflow</h2>
          <div className="lp-pages-grid">
            {PAGES.map(p => (
              <div key={p.name} className="lp-page-card">
                <div className="lp-page-icon">{p.icon}</div>
                <div className="lp-page-info">
                  <span className="lp-page-name">{p.name}</span>
                  <span className="lp-page-desc">{p.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────── */}
      <section className="lp-cta">
        <div className="lp-section-wrap">
          <div className="lp-cta-box">
            <h2 className="lp-cta-h2">See the actual system running</h2>
            <p className="lp-cta-p">
              The demo is pre-seeded with 35 SKUs, 23,000+ sales rows, and
              seasonal products — Eid sweets, summer drinks, Diwali lights.
              A forecast has already been run. Just open it and explore.
            </p>
            <div className="lp-cta-actions">
              <button className="lp-btn-demo lp-btn-demo-lg" onClick={handleDemo} disabled={loading}>
                {loading ? "Opening…" : "Open live demo"}
              </button>
              <button className="lp-btn-login" onClick={onSignIn}>
                Sign in with credentials
              </button>
            </div>
            <div className="lp-cta-creds">
              Demo login: <code>buyer@demo.com</code> / <code>demo1234</code>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-logo-icon sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 17 9 11 13 15 21 7" />
                <polyline points="14 7 21 7 21 14" />
              </svg>
            </div>
            <span>DemandForecast</span>
          </div>
          <span className="lp-footer-copy">Demand Forecasting &amp; Automatic Inventory Reorder System · Academic Project</span>
        </div>
      </footer>
    </div>
  );
}

/* ── App pages data ─────────────────────────────────────────────── */

const PAGES = [
  {
    name: "Dashboard",
    desc: "Run forecast, view KPIs, see overall inventory health at a glance",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>,
  },
  {
    name: "Forecasts",
    desc: "Per-SKU chart with actual vs forecast band and model confidence",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>,
  },
  {
    name: "Seasonal Outlook",
    desc: "12-month demand outlook with festival overlays and trend decomposition",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  },
  {
    name: "Alerts",
    desc: "Every at-risk SKU with reorder point, stockout explanation and cost",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  },
  {
    name: "Reorder",
    desc: "Editable purchase order grouped by supplier — export to CSV or print",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>,
  },
  {
    name: "Inspector",
    desc: "See exactly which model won each SKU and why, with MAPE scores",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  },
  {
    name: "Data",
    desc: "Browse products, inventory and sales. Upload your own CSV data.",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/></svg>,
  },
  {
    name: "Settings",
    desc: "Configure festivals — set demand uplift multiplier and date windows",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 9a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9"/></svg>,
  },
];
