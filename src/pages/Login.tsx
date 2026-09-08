import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Wordmark } from "../components/Wordmark";

export default function Login() {
  const [params] = useSearchParams();
  const refCode = params.get("ref") || undefined;
  const planParam = params.get("plan") === "pro" || params.get("plan") === "founding" ? params.get("plan") : null;
  const [mode, setMode] = useState<"login" | "register">(params.get("mode") === "register" ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await api.login(email, password);
      } else {
        await api.register(email, password, refCode);
      }
      await refresh();
      navigate(mode === "register" && planParam ? "/app/billing" : "/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <Wordmark beta />
        <p className="auth-tagline">Project management built for project managers.</p>

        {mode === "register" && refCode && (
          <p className="form-success" style={{ marginBottom: 4 }}>
            Referred by a friend -- you'll both get a free month once you upgrade to Pro.
          </p>
        )}

        {mode === "register" && planParam === "founding" && (
          <p className="form-success" style={{ marginBottom: 4 }}>
            Going for a founding member spot -- free Pro, forever, if one's still open. We'll confirm right after you sign up.
          </p>
        )}

        {mode === "register" && planParam === "pro" && (
          <p className="form-success" style={{ marginBottom: 4 }}>
            Create your account first -- you'll land on Billing to start your 14-day Pro trial next. No card required yet.
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

        <form onSubmit={onSubmit}>
          <label>Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Password</label>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        {mode === "login" && (
          <p className="muted" style={{ textAlign: "center", marginTop: 12 }}>
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
        )}

        {mode === "register" && (
          <p className="auth-consent">
            By creating an account, you agree to Tasketra's{" "}
            <Link to="/legal/terms">Terms of Service</Link> and{" "}
            <Link to="/legal/privacy">Privacy Policy</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
