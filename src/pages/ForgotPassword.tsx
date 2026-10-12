import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Wordmark } from "../components/Wordmark";
import { useDocumentTitle } from "../lib/documentTitle";

export default function ForgotPassword() {
  useDocumentTitle("Reset your password");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <Wordmark beta />
        <h1 className="auth-tagline">Reset your password</h1>

        {sent ? (
          <p className="muted" style={{ marginTop: 16 }}>
            If an account exists for that email, we've sent a link to reset the password. It expires in an hour.
          </p>
        ) : (
          <form onSubmit={onSubmit}>
            <label htmlFor="f-forgotpassword-39">Email</label>
            <input id="f-forgotpassword-39" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            {error && <div className="form-error">{error}</div>}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <p className="muted" style={{ textAlign: "center", marginTop: 12 }}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
