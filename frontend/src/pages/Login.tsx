import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

export function Login() {
  const { signIn, demoCreds } = useAuth();
  const [email, setEmail] = useState(demoCreds.email);
  const [password, setPassword] = useState(demoCreds.password);
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await signIn(email, password);
    setSubmitting(false);
    if (!res.ok) setError(res.message ?? "Sign-in failed.");
  }

  return (
    <div className="login-shell">
      {/* ─── Left: brand / marketing ─────────────────────────────── */}
      <aside className="login-left">
        <div className="login-left-inner">
          <div className="login-brand">
            <div className="brand-mark" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 17 9 11 13 15 21 7" />
                <polyline points="14 7 21 7 21 14" />
              </svg>
            </div>
            <div className="brand-text">
              Demand Forecast
              <small>Auto-Reorder System</small>
            </div>
          </div>

          <h1 className="login-headline">
            Predict demand.<br />
            Quantify uncertainty.<br />
            <span className="grad">Reorder automatically.</span>
          </h1>

          <p className="login-sub">
            A forecasting platform for small &amp; medium retailers. ARIMA,
            Prophet and LightGBM compete per SKU; the winning model's
            uncertainty band sizes safety stock and drives automatic reorder
            decisions — auditable end to end.
          </p>

          <ul className="login-features">
            <li>
              <FeatureIcon kind="contest" />
              <div>
                <strong>Per-SKU model contest</strong>
                <span>Three models compete; the lowest-MAPE forecast wins.</span>
              </div>
            </li>
            <li>
              <FeatureIcon kind="band" />
              <div>
                <strong>Uncertainty → safety stock</strong>
                <span>The 95% PI sizes the buffer, not gut feel.</span>
              </div>
            </li>
            <li>
              <FeatureIcon kind="audit" />
              <div>
                <strong>Every recommendation explained</strong>
                <span>Buyers see the math behind each reorder.</span>
              </div>
            </li>
          </ul>

          <div className="login-foot">
            FastAPI · React 18 + Vite · Recharts · SQLite (Postgres-swappable)
          </div>
        </div>
      </aside>

      {/* ─── Right: sign-in form ────────────────────────────────── */}
      <main className="login-right">
        <form className="login-card" onSubmit={onSubmit} noValidate>
          <h2>Sign in</h2>
          <p className="login-card-sub">Welcome back — use your buyer account to continue.</p>

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@retail.com"
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span>Password</span>
            <div className="field-pwd">
              <input
                type={showPwd ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="field-eye"
                onClick={() => setShowPwd((s) => !s)}
                aria-label={showPwd ? "Hide password" : "Show password"}
              >
                {showPwd ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>

          <div className="form-row">
            <label className="check">
              <input type="checkbox" defaultChecked />
              <span>Remember me</span>
            </label>
            <a className="muted-link" href="#forgot" onClick={(e) => e.preventDefault()}>
              Forgot password?
            </a>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className={`btn btn-primary login-submit ${submitting ? "spinning" : ""}`} disabled={submitting}>
            {submitting ? (
              <>
                <SpinnerIcon /> Signing in…
              </>
            ) : (
              <>
                Sign in
                <ArrowIcon />
              </>
            )}
          </button>

          <div className="demo-creds">
            <div className="demo-creds-label">Admin demo</div>
            <div className="demo-creds-grid">
              <code>{demoCreds.email}</code>
              <code>{demoCreds.password}</code>
            </div>
            <button
              type="button"
              className="muted-link"
              onClick={() => {
                setEmail(demoCreds.email);
                setPassword(demoCreds.password);
              }}
            >
              Fill admin credentials
            </button>
          </div>

          <div className="demo-creds demo-creds-supplier">
            <div className="demo-creds-label">Supplier demo</div>
            <div className="demo-creds-grid">
              <code>supplier01@supplier.local</code>
              <code>supplier123</code>
            </div>
            <button
              type="button"
              className="muted-link"
              onClick={() => {
                setEmail("supplier01@supplier.local");
                setPassword("supplier123");
              }}
            >
              Fill supplier credentials
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

/* ─── Icons (inline so we don't drag in icon libs) ─────────────────── */

function FeatureIcon({ kind }: { kind: "contest" | "band" | "audit" }) {
  return (
    <span className={`feat-icon feat-${kind}`} aria-hidden>
      {kind === "contest" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="12" cy="18" r="3" />
          <path d="M6 9v3a6 6 0 006 6M18 9v3a6 6 0 01-6 6" />
        </svg>
      )}
      {kind === "band" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 16c4-7 8 7 12 0s6 4 6 4" />
          <path d="M3 12c4-6 8 6 12 0s6 3 6 3" opacity=".5" />
          <path d="M3 20c4-7 8 7 12 0s6 4 6 4" opacity=".25" />
        </svg>
      )}
      {kind === "audit" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 12l2 2 4-4" />
          <path d="M21 12c0 6-9 9-9 9s-9-3-9-9V5l9-3 9 3z" />
        </svg>
      )}
    </span>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a19.77 19.77 0 014.22-5.94" />
      <path d="M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a19.86 19.86 0 01-3.16 4.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
