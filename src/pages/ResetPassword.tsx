import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Wordmark } from "../components/Wordmark";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(token, password);
      await refresh();
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <Wordmark beta />
          <p className="muted" style={{ marginTop: 16 }}>
            This reset link is missing its token. Request a new one from the{" "}
            <Link to="/forgot-password">forgot password</Link> page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <Wordmark beta />
        <p className="auth-tagline">Choose a new password</p>

        <form onSubmit={onSubmit}>
          <label>New password</label>
          <input type="password" required minLength={8} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          <label>Confirm password</label>
          <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Saving..." : "Reset password"}
          </button>
        </form>
      </div>
    </div>
  );
}
