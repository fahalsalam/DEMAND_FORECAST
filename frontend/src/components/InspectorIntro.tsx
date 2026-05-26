interface Props {
  onDismiss?: () => void;
}

export function InspectorIntro({ onDismiss }: Props) {
  return (
    <section className="ins-intro" aria-label="What is this">
      <header className="ins-intro-head">
        <div>
          <span className="ins-intro-eyebrow">Plain-English intro</span>
          <h3>What this app does, and how the model thinks</h3>
          <p>
            For a non-technical reviewer — read this first, then click{" "}
            <strong>Inspect this SKU</strong> below to see it in action on real data.
          </p>
        </div>
        {onDismiss && (
          <button
            className="hiw-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss intro"
            title="Got it — hide this"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </header>

      {/* Block 1: what the app is */}
      <div className="ins-intro-section">
        <div className="ins-intro-icon ins-intro-icon-1" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </div>
        <div>
          <h4>What is this app?</h4>
          <p>
            A demand-forecasting and automatic reorder system for a retail
            store. It looks at your past sales for every product, predicts how
            many you'll sell over the next couple of weeks, and tells you
            exactly which products to reorder, how many, and why — without
            anyone needing to guess.
          </p>
        </div>
      </div>

      {/* Block 2: 3 problems it solves */}
      <div className="ins-intro-section">
        <div className="ins-intro-icon ins-intro-icon-2" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <div>
          <h4>What problems does it solve?</h4>
          <ul className="ins-intro-list">
            <li>
              <strong>Stockouts</strong> — running out before the supplier can
              deliver, losing the sale and possibly the customer.
            </li>
            <li>
              <strong>Overstock</strong> — buying too much, tying up cash, and
              paying for storage space you didn't need to use.
            </li>
            <li>
              <strong>Guesswork</strong> — replacing the gut-feel "I think we
              need more of these" with a number the buyer can defend.
            </li>
          </ul>
        </div>
      </div>

      {/* Block 3: how it thinks — 3 models */}
      <div className="ins-intro-section">
        <div className="ins-intro-icon ins-intro-icon-3" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="12" cy="18" r="3" />
            <path d="M6 9v3a6 6 0 006 6M18 9v3a6 6 0 01-6 6" />
          </svg>
        </div>
        <div>
          <h4>How does it think? Three models compete</h4>
          <p className="muted-p">
            Different products behave differently — a milk carton, a notebook,
            and a household cleaner all sell in different patterns. So we
            don't pick one model and force it onto every product. We let three
            different models <em>compete for each product</em> and keep the
            best one.
          </p>
          <div className="ins-models">
            <div className="ins-model ins-model-arima">
              <div className="ins-model-name">
                <span className="ins-model-dot" /> ARIMA
              </div>
              <p>
                A classic statistics model that's good at finding repeating
                weekly / monthly patterns in steady, mature products.
              </p>
            </div>
            <div className="ins-model ins-model-prophet">
              <div className="ins-model-name">
                <span className="ins-model-dot" /> Prophet
              </div>
              <p>
                Built by Facebook. Good at long seasonal trends (yearly
                cycles, holidays, festive seasons) — great for staples.
              </p>
            </div>
            <div className="ins-model ins-model-lgbm">
              <div className="ins-model-name">
                <span className="ins-model-dot" /> LightGBM
              </div>
              <p>
                A machine-learning model that learns from past sales features
                (last week, last month, day of week, was there a promo?).
              </p>
            </div>
          </div>
          <p className="muted-p" style={{ marginTop: 10 }}>
            <strong>MAPE</strong> = "Mean Absolute Percentage Error" — how
            wrong each model was on the recent test window, in plain
            percentage. <strong>Lower is better.</strong> 15% MAPE means the
            model was off by 15% on average.
          </p>
        </div>
      </div>

      {/* Block 4: what this page shows */}
      <div className="ins-intro-section">
        <div className="ins-intro-icon ins-intro-icon-4" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <div>
          <h4>What this Inspector page will show you</h4>
          <ol className="ins-intro-list ordered">
            <li>
              <strong>The data</strong> — actual daily sales for the SKU you
              pick, with the test window (last 28 days) highlighted.
            </li>
            <li>
              <strong>The contest</strong> — what each of the 3 models
              predicted for that test window vs what really happened, plus a
              scoreboard of who was most accurate.
            </li>
            <li>
              <strong>The math</strong> — 9 numbered steps showing the actual
              numbers used to compute safety stock, reorder point, and order
              quantity (EOQ).
            </li>
            <li>
              <strong>The decision</strong> — the final reorder
              recommendation in plain English, with a status badge anyone can
              act on.
            </li>
          </ol>
        </div>
      </div>

      <footer className="ins-intro-cta">
        Ready? Pick a SKU below and click <strong>Inspect this SKU</strong> —
        the pipeline runs live in ~25 seconds.
      </footer>
    </section>
  );
}
