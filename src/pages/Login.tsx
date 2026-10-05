import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Wordmark } from "../components/Wordmark";
import { track } from "../lib/analytics";

/** Which offer brought someone to sign up: the tasketra.com pricing buttons
 *  link here with ?plan=pro or ?plan=founding; anything else is the free plan. */
export type SignupPlan = "none" | "pro" | "founding";

const REGISTER_COPY: Record<SignupPlan, { headline: string; subhead: string; button: string }> = {
  none: {
    headline: "Start your first project free",
    subhead: "3 projects free. WBS, RAID log, budget and roadmap included. No credit card.",
    button: "Create free account",
  },
  founding: {
    headline: "Claim a founding member spot",
    subhead: "Free Pro forever for the first 100 accounts.",
    button: "Claim my founding spot",
  },
  pro: {
    headline: "Start your 14-day Pro trial",
    subhead: "14 days free. A card is needed to start the trial and you won't be charged until it ends. Cancel anytime.",
    button: "Create account and start trial",
  },
};

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

export default function Login() {
  const [params] = useSearchParams();
  const refCode = params.get("ref") || undefined;
  const plan: SignupPlan = params.get("plan") === "pro" || params.get("plan") === "founding" ? (params.get("plan") as SignupPlan) : "none";
  const [mode, setMode] = useState<"login" | "register">(params.get("mode") === "register" ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [founding, setFounding] = useState<{ cap: number; remaining: number; full: boolean } | null>(null);
  const signupStarted = useRef(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  // Only worth a request on the founding offer. If it fails, the count is
  // simply left out.
  useEffect(() => {
    if (plan !== "founding") return;
    let cancelled = false;
    api.foundingStatus().then((s) => { if (!cancelled) setFounding(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [plan]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuggestion(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await api.login(email, password);
      } else {
        await api.register(email, password, refCode);
        track("signup_completed", { plan });
      }
      await refresh();
      // Only the Pro offer continues to Billing. A founding spot is awarded
      // when the email is confirmed, with no card and no Billing step.
      navigate(mode === "register" && plan === "pro" ? "/app/billing" : "/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      if (err instanceof ApiError && err.suggestion) setSuggestion(err.suggestion);
    } finally {
      setBusy(false);
    }
  }

  function onFormFocus() {
    if (mode !== "register" || signupStarted.current) return;
    signupStarted.current = true;
    track("signup_started", { plan });
  }

  const copy = REGISTER_COPY[plan];
  const showFoundingCount = plan === "founding" && founding !== null && !founding.full && founding.cap > 0;

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <Wordmark beta />
        {mode === "register" ? (
          <div className="auth-offer">
            <h1 className="auth-headline">{copy.headline}</h1>
            <p className="auth-subhead">
              {copy.subhead}
              {showFoundingCount && <> <strong>{founding!.remaining} of {founding!.cap} spots left.</strong></>}
              {plan === "founding" && " Your spot is confirmed once you confirm your email."}
            </p>
          </div>
        ) : (
          <p className="auth-tagline">Project management built for project managers.</p>
        )}

        {mode === "register" && refCode && (
          <p className="form-success" style={{ marginBottom: 4 }}>
            Referred by a friend -- you'll both get a free month once you upgrade to Pro.
          </p>
        )}

        <div className="auth-tabs">
          <button className={mode === "login" ? "tab active" : "tab"} onClick={() => setMode("login")} type="button">
            Sign in
          </button>
          <button className={mode === "register" ? "tab active" : "tab"} onClick={() => setMode("register")} type="button">
            Create account
          </button>
        </div>

        <form onSubmit={onSubmit} onFocus={onFormFocus}>
          <label htmlFor="f-login-73">Email</label>
          <input id="f-login-73" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="f-login-75">Password</label>
          <div className="password-field">
            <input id="f-login-75" type={showPassword ? "text" : "password"} required minLength={mode === "register" ? 8 : undefined} maxLength={72} autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button
              type="button"
              className="password-toggle"
              aria-label="Show password"
              aria-pressed={showPassword}
              aria-controls="f-login-75"
              onClick={() => setShowPassword((s) => !s)}
            >
              <EyeIcon crossed={showPassword} />
            </button>
          </div>
          {mode === "register" && <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>At least 8 characters. One email, one account.</p>}
          {error && <div className="form-error">{error}</div>}
          {suggestion && (
            <button type="button" className="btn btn-ghost" onClick={() => { setEmail(suggestion); setError(null); setSuggestion(null); }}>
              Use {suggestion}
            </button>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Please wait..." : mode === "login" ? "Sign in" : copy.button}
          </button>
        </form>

        {mode === "login" && (
          <p className="muted" style={{ textAlign: "center", marginTop: 12 }}>
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
        )}

        {mode === "register" && (
          <>
            <p className="auth-founder-note">
              Built by a PM with 20+ years in the field. Reply to any email from us and I read it.
              <span className="auth-founder-sign">Karissa</span>
            </p>
            <p className="auth-consent">
              By creating an account, you agree to Tasketra's{" "}
              <Link to="/legal/terms">Terms of Service</Link> and{" "}
              <Link to="/legal/privacy">Privacy Policy</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
