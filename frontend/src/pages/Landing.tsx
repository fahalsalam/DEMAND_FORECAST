import { useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";

interface Props {
  onSignIn: () => void;
}

export function Landing({ onSignIn }: Props) {
  const { signIn, demoCreds } = useAuth();
  const [loading, setLoading] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  /* ── Load Google Fonts ── */
  useEffect(() => {
    if (!document.getElementById("lp-gfonts")) {
      const pre1 = document.createElement("link");
      pre1.id = "lp-gfonts";
      pre1.rel = "preconnect";
      pre1.href = "https://fonts.googleapis.com";
      const pre2 = document.createElement("link");
      pre2.rel = "preconnect";
      pre2.href = "https://fonts.gstatic.com";
      (pre2 as HTMLLinkElement).crossOrigin = "anonymous";
      const fonts = document.createElement("link");
      fonts.rel = "stylesheet";
      fonts.href =
        "https://fonts.googleapis.com/css2?family=Calistoga:ital@0;1&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
      document.head.append(pre1, pre2, fonts);
    }
  }, []);

  /* ── Nav scroll shadow ── */
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const onScroll = () =>
      nav.classList.toggle("lp-nav-scrolled", window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ── Scroll reveal (IntersectionObserver) ── */
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("lp-in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -36px 0px" }
    );
    document.querySelectorAll(".lp-reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* ── Widget live value flicker ── */
  useEffect(() => {
    const rows = [
      ["₹7,580", "₹7,842", "₹7,580"],
      ["₹5,099", "₹5,099", "₹5,340"],
      ["₹4,016", "₹3,980", "₹4,016"],
      ["₹3,415", "₹3,415", "₹3,580"],
    ];
    let tick = 0;
    const id = window.setInterval(() => {
      tick = (tick + 1) % 3;
      document
        .querySelectorAll<HTMLElement>(".lp-w-val")
        .forEach((el, i) => {
          el.style.transition = "opacity 0.25s";
          el.style.opacity = "0";
          window.setTimeout(() => {
            el.textContent = rows[i]?.[tick] ?? el.textContent;
            el.style.opacity = "1";
          }, 260);
        });
    }, 3800);
    return () => window.clearInterval(id);
  }, []);

  async function handleDemo() {
    setLoading(true);
    await signIn(demoCreds.email, demoCreds.password);
    setLoading(false);
  }

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  return (
    <div className="lp-root">

      {/* ═══ NAV ═══ */}
      <nav className="lp-navbar" ref={navRef}>
        <div className="lp-nav-inner">
          <span className="lp-logo">
            <div className="lp-logo-mark">
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                <path
                  d="M2 13 L5.5 8.5 L9 10.5 L13 4.5 L15 6.5"
                  stroke="white"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            Demand<strong>Forecast</strong>
          </span>
          <ul className="lp-nav-links">
            <li>
              <button
                className="lp-nav-link-btn"
                onClick={() => scrollTo("how-it-works")}
                type="button"
              >
                How it works
              </button>
            </li>
            <li>
              <button
                className="lp-nav-link-btn"
                onClick={() => scrollTo("under-the-hood")}
                type="button"
              >
                Under the hood
              </button>
            </li>
            <li>
              <button
                className="lp-nav-link-btn"
                onClick={() => scrollTo("whats-inside")}
                type="button"
              >
                What's inside
              </button>
            </li>
          </ul>
          <button
            className="lp-btn lp-btn-primary"
            onClick={handleDemo}
            disabled={loading}
            type="button"
          >
            {loading ? "Opening…" : "Open Demo →"}
          </button>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <div className="lp-hero-wrap">
        <div className="lp-hero">

          {/* LEFT: copy */}
          <div className="lp-hero-copy">
            <div className="lp-hero-pill">
              <span className="lp-live-dot" />
              Demand Forecasting · Auto-Reorder System
            </div>
            <h1 className="lp-h1">
              Stop guessing<br />
              <em>when to reorder.</em>
            </h1>
            <p className="lp-hero-sub">
              Three AI models compete for every product. The one that predicts
              your sales most accurately wins — then automatically calculates
              how much stock to order and when.
            </p>
            <div className="lp-hero-ctas">
              <button
                className="lp-btn lp-btn-primary-lg"
                onClick={handleDemo}
                disabled={loading}
                type="button"
              >
                {loading ? "Opening…" : "Try the live demo — no setup needed"}
              </button>
              <button
                className="lp-btn lp-btn-ghost-lg"
                onClick={onSignIn}
                type="button"
              >
                Sign in
              </button>
            </div>
            <p className="lp-hero-note">
              Pre-loaded with 35 products · seasonal patterns · Eid, Diwali &amp;
              Christmas spikes
            </p>
          </div>

          {/* RIGHT: dashboard widget */}
          <div className="lp-widget">
            <div className="lp-widget-top">
              <span className="lp-widget-top-label">Latest forecast run</span>
              <div className="lp-badge-live">
                <span className="lp-badge-dot" />
                Live
              </div>
            </div>

            <div className="lp-widget-kpis">
              <div className="lp-kpi-cell">
                <div className="lp-kv danger">9</div>
                <div className="lp-kl">Need Reorder</div>
              </div>
              <div className="lp-kpi-cell">
                <div className="lp-kv neutral">25</div>
                <div className="lp-kl">Healthy</div>
              </div>
              <div className="lp-kpi-cell">
                <div className="lp-kv money">₹33,876</div>
                <div className="lp-kl">Suggested PO</div>
              </div>
            </div>

            {/* Sparkline chart */}
            <div className="lp-widget-chart">
              <div className="lp-chart-meta">
                <span className="lp-chart-label">
                  Premium Date Box · demand forecast
                </span>
                <div className="lp-chart-legend">
                  <span>
                    <i className="lp-leg-solid" />
                    actual
                  </span>
                  <span>
                    <i className="lp-leg-dashed" />
                    forecast
                  </span>
                </div>
              </div>
              <svg
                width="100%"
                height="76"
                viewBox="0 0 440 76"
                preserveAspectRatio="none"
              >
                {/* Confidence band */}
                <path
                  d="M200,12 C220,9 240,7 260,8 C280,9 300,14 320,20 C340,26 360,24 380,22 C400,20 420,18 440,17
                     L440,34 C420,34 400,36 380,38 C360,40 340,46 320,42 C300,38 280,32 260,28
                     C240,24 220,24 200,26 Z"
                  fill="rgba(99,102,241,0.1)"
                />
                {/* Historical solid line */}
                <path
                  d="M0,60 C20,58 40,54 60,48 C80,42 100,34 120,27 C140,20 160,15 180,13 C195,11 200,12 200,12"
                  stroke="#818cf8"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Forecast dashed line */}
                <path
                  d="M200,12 C220,9 240,7 260,8 C280,9 300,14 320,20 C340,26 360,24 380,22 C400,20 420,18 440,17"
                  stroke="#818cf8"
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray="5,4"
                  strokeLinecap="round"
                  opacity="0.7"
                />
                {/* Now marker */}
                <line
                  x1="200" y1="0" x2="200" y2="76"
                  stroke="rgba(99,102,241,0.3)"
                  strokeWidth="1"
                />
                {/* Festival marker (Eid) */}
                <line
                  x1="270" y1="0" x2="270" y2="76"
                  stroke="rgba(245,158,11,0.28)"
                  strokeWidth="1"
                  strokeDasharray="3,3"
                />
                <text
                  x="274" y="11"
                  fontSize="9"
                  fill="rgba(245,158,11,0.65)"
                  fontFamily="'JetBrains Mono',monospace"
                  letterSpacing="0.02em"
                >
                  Eid
                </text>
                {/* Dot at "now" */}
                <circle cx="200" cy="12" r="4.5" fill="#6366f1" />
                <circle cx="200" cy="12" r="9" fill="rgba(99,102,241,0.18)" />
              </svg>
            </div>

            <div className="lp-widget-rows">
              {[
                { name: "Household Item 2",    lead: "9d lead", val: "₹7,580" },
                { name: "Premium Date Box",    lead: "7d lead", val: "₹5,099" },
                { name: "Snack Item 1",        lead: "7d lead", val: "₹4,016" },
                { name: "Iced Lemonade 500ml", lead: "5d lead", val: "₹3,415" },
              ].map((r) => (
                <div className="lp-w-row" key={r.name}>
                  <div className="lp-w-name">
                    <span className="lp-w-dot" />
                    {r.name}
                  </div>
                  <span className="lp-w-lead">{r.lead}</span>
                  <span className="lp-w-val">{r.val}</span>
                </div>
              ))}
            </div>
            <div className="lp-widget-foot">
              Updated 2h ago · models retrain daily · 35 products on demo
            </div>
          </div>

        </div>
      </div>

      {/* ═══ STATS BAR ═══ */}
      <div className="lp-stats-bar">
        <div className="lp-stats-grid">
          <div className="lp-stat-cell">
            <div className="lp-stat-num">
              <span className="lp-accent">3×</span> models
            </div>
            <div className="lp-stat-desc">
              Auto-ARIMA, Prophet, LightGBM — best wins per SKU
            </div>
          </div>
          <div className="lp-stat-cell">
            <div className="lp-stat-num">
              28<span className="lp-accent">d</span> holdout
            </div>
            <div className="lp-stat-desc">
              MAPE-tested on unseen data before any recommendation
            </div>
          </div>
          <div className="lp-stat-cell">
            <div className="lp-stat-num">
              95<span className="lp-accent">%</span> service
            </div>
            <div className="lp-stat-desc">
              Z = 1.645 default — safety stock calibrated to confidence
            </div>
          </div>
          <div className="lp-stat-cell">
            <div className="lp-stat-num">
              35 <span className="lp-accent">SKUs</span>
            </div>
            <div className="lp-stat-desc">
              Festival-aware demo with Eid, Diwali &amp; Christmas spikes
            </div>
          </div>
        </div>
      </div>

      {/* ═══ PROBLEM ═══ */}
      <section className="lp-problem-section" id="problem">
        <div className="lp-wrap">
          <div className="lp-label">The Problem It Solves</div>
          <h2 className="lp-h2">
            Your Eid stock ran out<br />
            3 days before the festival.
          </h2>
          <div className="lp-problem-grid">
            <div className="lp-problem-text">
              <p>
                Traditional inventory systems use fixed reorder points set months
                ago. They don't know that Eid demand spikes 3× for two weeks, or
                that summer lemonade sells 5× faster in June than March.
              </p>
              <p>
                This system learns those patterns from your own sales history. It
                adjusts every SKU's reorder point based on the upcoming season,
                and explains exactly why it made each recommendation.
              </p>
            </div>
            <div className="lp-compare-stack">
              <div className="lp-compare-card bad lp-reveal">
                <div className="lp-compare-label">Before</div>
                <ul className="lp-compare-list">
                  <li><i className="lp-ico">✕</i>Fixed reorder point: 100 units</li>
                  <li><i className="lp-ico">✕</i>Ran out 3 days pre-Eid</li>
                  <li><i className="lp-ico">✕</i>Buyer guessed the order qty</li>
                  <li><i className="lp-ico">✕</i>Lost ₹5,000+ in sales</li>
                </ul>
              </div>
              <div className="lp-compare-card good lp-reveal" data-d="1">
                <div className="lp-compare-label">After</div>
                <ul className="lp-compare-list">
                  <li><i className="lp-ico">✓</i>Dynamic ROP: 65 units (Eid-aware)</li>
                  <li><i className="lp-ico">✓</i>Reorder triggered 7 days early</li>
                  <li><i className="lp-ico">✓</i>EOQ-sized order: 537 units</li>
                  <li><i className="lp-ico">✓</i>Full stock through the festival</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="lp-how-section" id="how-it-works">
        <div className="lp-wrap">
          <div className="lp-how-header">
            <div className="lp-label">How It Works</div>
            <h2 className="lp-h2">
              From sales data to purchase order in one run
            </h2>
          </div>
          <div className="lp-steps-grid">
            <div className="lp-step-card lp-reveal">
              <div className="lp-step-num">01</div>
              <div>
                <div className="lp-step-tag">Data Layer</div>
                <h3>Upload your sales history</h3>
                <p>
                  Drop in a CSV of daily sales — product, date, quantity. Or use
                  the 35-product demo dataset that already has seasonal spikes,
                  Eid demand, and summer patterns baked in.
                </p>
              </div>
            </div>
            <div className="lp-step-card lp-reveal" data-d="1">
              <div className="lp-step-num">02</div>
              <div>
                <div className="lp-step-tag">Forecast Engine</div>
                <h3>Three models race for each SKU</h3>
                <p>
                  Auto-ARIMA, Prophet, and LightGBM each fit a forecast on your
                  history. The last 28 days are held out as a test set. The model
                  with the lowest error (MAPE) wins that SKU.
                </p>
              </div>
            </div>
            <div className="lp-step-card lp-reveal" data-d="2">
              <div className="lp-step-num">03</div>
              <div>
                <div className="lp-step-tag">Inventory Math</div>
                <h3>Uncertainty sizes your safety stock</h3>
                <p>
                  The winning model's 95% prediction interval determines the
                  safety buffer — wider uncertainty = more safety stock. The
                  reorder point = lead-time demand + safety stock.
                </p>
              </div>
            </div>
            <div className="lp-step-card lp-reveal" data-d="3">
              <div className="lp-step-num">04</div>
              <div>
                <div className="lp-step-tag">Auto PO Builder</div>
                <h3>At-risk SKUs build your purchase order</h3>
                <p>
                  Any product below its reorder point appears in the Reorder
                  page, grouped by supplier. Adjust quantities, uncheck what you
                  don't want, export to CSV — done.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ UNDER THE HOOD ═══ */}
      <section className="lp-hood-section" id="under-the-hood">
        <div className="lp-wrap">
          <div className="lp-hood-header">
            <div className="lp-label">Under the Hood</div>
            <h2 className="lp-h2">
              Built for an academic evaluation —<br />
              transparent by design
            </h2>
            <p className="lp-section-sub">
              Every number is traceable. The Inspector page shows exactly which
              model won, what its MAPE was, and how safety stock was calculated
              for every single SKU.
            </p>
          </div>
          <div className="lp-hood-grid">
            <div className="lp-hood-card lp-reveal">
              <div className="lp-hood-card-label">Forecast Models</div>
              <div className="lp-hood-row">
                <div className="lp-hood-row-name">Auto-ARIMA</div>
                <div className="lp-hood-row-detail">pmdarima · stepwise p,d,q search</div>
              </div>
              <div className="lp-hood-row">
                <div className="lp-hood-row-name">Prophet</div>
                <div className="lp-hood-row-detail">trend + weekly + yearly + festival regressors</div>
              </div>
              <div className="lp-hood-row">
                <div className="lp-hood-row-name">LightGBM</div>
                <div className="lp-hood-row-detail">lag features, rolling stats, day-of-week</div>
              </div>
              <div className="lp-hood-row">
                <div className="lp-hood-row-name">Winner selection</div>
                <div className="lp-hood-row-detail">28-day holdout MAPE, per SKU</div>
              </div>
            </div>
            <div className="lp-hood-card lp-reveal" data-d="1">
              <div className="lp-hood-card-label">Inventory Formulas</div>
              <div className="lp-hood-row">
                <div className="lp-hood-row-name">Safety stock</div>
                <div className="lp-hood-row-detail">Z(SL) × σ_demand × √lead_time</div>
              </div>
              <div className="lp-hood-row">
                <div className="lp-hood-row-name">Reorder point</div>
                <div className="lp-hood-row-detail">avg_daily × lead_time + safety_stock</div>
              </div>
              <div className="lp-hood-row">
                <div className="lp-hood-row-name">Order qty (EOQ)</div>
                <div className="lp-hood-row-detail">√(2 × annual_demand × order_cost / holding_cost)</div>
              </div>
              <div className="lp-hood-row">
                <div className="lp-hood-row-name">Service level</div>
                <div className="lp-hood-row-detail">95% default → Z = 1.645</div>
              </div>
            </div>
            <div className="lp-hood-card lp-reveal" data-d="2">
              <div className="lp-hood-card-label">Tech Stack</div>
              <div className="lp-hood-row">
                <div className="lp-hood-row-name">Backend</div>
                <div className="lp-hood-row-detail">Python 3.11 · FastAPI · SQLite · SQLAlchemy</div>
              </div>
              <div className="lp-hood-row">
                <div className="lp-hood-row-name">ML stack</div>
                <div className="lp-hood-row-detail">pmdarima · Prophet 1.1.6 · LightGBM 4.5</div>
              </div>
              <div className="lp-hood-row">
                <div className="lp-hood-row-name">Frontend</div>
                <div className="lp-hood-row-detail">React 18 · TypeScript · Vite · Recharts</div>
              </div>
              <div className="lp-hood-row">
                <div className="lp-hood-row-name">Architecture</div>
                <div className="lp-hood-row-detail">core/ has zero FastAPI imports — pure Python</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ WHAT'S INSIDE ═══ */}
      <section className="lp-inside-section" id="whats-inside">
        <div className="lp-wrap">
          <div className="lp-label">What's Inside</div>
          <h2 className="lp-h2">Eight pages, one complete workflow</h2>
          <div className="lp-pages-grid2">

            <div className="lp-page2-card lp-reveal">
              <div className="lp-page2-icon">
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="2" y="2" width="5.5" height="5.5" rx="1.5" /><rect x="9.5" y="2" width="5.5" height="5.5" rx="1.5" />
                  <rect x="2" y="9.5" width="5.5" height="5.5" rx="1.5" /><rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1.5" />
                </svg>
              </div>
              <h4>Dashboard</h4>
              <p>Run forecast, view KPIs, see overall inventory health at a glance</p>
            </div>

            <div className="lp-page2-card lp-reveal" data-d="1">
              <div className="lp-page2-icon">
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="#818cf8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 13 L5 9 L9 11 L13 4.5 L15 6.5" />
                </svg>
              </div>
              <h4>Forecasts</h4>
              <p>Per-SKU chart with actual vs forecast band and model confidence</p>
            </div>

            <div className="lp-page2-card lp-reveal" data-d="2">
              <div className="lp-page2-icon">
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="2" y="3" width="13" height="11" rx="2" /><path d="M6 3V2M11 3V2M2 7h13" />
                </svg>
              </div>
              <h4>Seasonal Outlook</h4>
              <p>12-month demand outlook with festival overlays and trend decomposition</p>
            </div>

            <div className="lp-page2-card lp-reveal" data-d="3">
              <div className="lp-page2-icon">
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M8.5 2v2.5M8.5 12.5V15M2 8.5h2.5M12.5 8.5H15" />
                  <circle cx="8.5" cy="8.5" r="3" />
                </svg>
              </div>
              <h4>Alerts</h4>
              <p>Every at-risk SKU with reorder point, stockout explanation and cost impact</p>
            </div>

            <div className="lp-page2-card lp-reveal">
              <div className="lp-page2-icon">
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 5.5h11M3 8.5h7M3 11.5h9" />
                </svg>
              </div>
              <h4>Reorder</h4>
              <p>Products grouped by supplier, quantities editable, one-click CSV export</p>
            </div>

            <div className="lp-page2-card lp-reveal" data-d="1">
              <div className="lp-page2-icon">
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="8.5" cy="8.5" r="6.5" /><path d="M8.5 5v3.5l2.5 1.5" />
                </svg>
              </div>
              <h4>Inspector</h4>
              <p>Per-SKU breakdown: winning model, MAPE score, full safety stock trace</p>
            </div>

            <div className="lp-page2-card lp-reveal" data-d="2">
              <div className="lp-page2-icon">
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8.5 2L15 8.5l-6.5 6.5L2 8.5 8.5 2z" />
                </svg>
              </div>
              <h4>Purchase Orders</h4>
              <p>Auto-generated POs with total cost, lead time and supplier grouping</p>
            </div>

            <div className="lp-page2-card lp-reveal" data-d="3">
              <div className="lp-page2-icon">
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="8.5" cy="5" r="2" /><circle cx="8.5" cy="12" r="2" />
                  <path d="M8.5 7v3M5 5H3M14 5h-2M5 12H3M14 12h-2" />
                </svg>
              </div>
              <h4>Settings</h4>
              <p>Service level, lead times per supplier, festival calendar configuration</p>
            </div>

          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="lp-cta-section">
        <div className="lp-cta-inner">
          <div className="lp-label" style={{ justifyContent: "center", display: "flex" }}>
            Get Started
          </div>
          <h2 className="lp-h2">See it work on real data</h2>
          <p className="lp-cta-p">
            No setup, no account needed. The demo runs live with 35 products,
            seasonal patterns, and festival spikes already loaded.
          </p>
          <div className="lp-cta-btns">
            <button
              className="lp-btn lp-btn-primary-lg"
              onClick={handleDemo}
              disabled={loading}
              type="button"
            >
              {loading ? "Opening…" : "Open the live demo →"}
            </button>
            <a
              className="lp-btn lp-btn-ghost-lg"
              href="https://github.com/fahalsalam/DEMAND_FORECAST"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <span className="lp-logo">
            <div className="lp-logo-mark">
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                <path
                  d="M2 13 L5.5 8.5 L9 10.5 L13 4.5 L15 6.5"
                  stroke="white"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            Demand<strong>Forecast</strong>
          </span>
          <div className="lp-footer-stack">
            Python 3.11 · FastAPI · SQLite · React 18 · TypeScript · pmdarima ·
            Prophet · LightGBM
          </div>
        </div>
      </footer>

    </div>
  );
}
