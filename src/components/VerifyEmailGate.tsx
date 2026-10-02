import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Wordmark } from "./Wordmark";

// Shown in place of the app until the person confirms their email address.
// They can ask for another link, fix a mistyped address, or sign out.

export function VerifyEmailGate() {
  const { user, refresh, logout } = useAuth();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  async function resend() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await api.resendVerification();
      if (r.alreadyVerified) await refresh();
      else setNotice(`We sent a new link to ${r.email ?? user?.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null); setSuggestion(null);
    try {
      const r = await api.changeUnverifiedEmail(newEmail);
      setEditing(false); setNewEmail("");
      await refresh();
      setNotice(r.verificationEmailSent ? `We sent a link to ${r.email}.` : `Saved ${r.email}, but we couldn't send the email. Try "Send it again" in a few minutes.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      if (err instanceof ApiError && err.suggestion) setSuggestion(err.suggestion);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <Wordmark beta />
        <p className="auth-tagline">Check your email</p>
        <p>
          We sent a confirmation link to <strong>{user?.email}</strong>. Click it to finish setting up your account. It can take a minute to arrive; check spam too.
        </p>
        {notice && <p className="muted" role="status">{notice}</p>}
        {error && <div className="form-error">{error}</div>}
        {suggestion && (
          <button type="button" className="btn btn-ghost" onClick={() => { setNewEmail(suggestion); setError(null); setSuggestion(null); }}>
            Use {suggestion}
          </button>
        )}
        {editing ? (
          <form onSubmit={changeEmail}>
            <label htmlFor="verify-new-email">Correct email address</label>
            <input id="verify-new-email" type="email" required autoFocus value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? "Saving..." : "Save and send link"}</button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => { setEditing(false); setError(null); }}>Cancel</button>
          </form>
        ) : (
          <>
            <button type="button" className="btn btn-primary btn-block" onClick={resend} disabled={busy}>Send it again</button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => { setEditing(true); setNotice(null); }}>Wrong address? Change it</button>
            <button type="button" className="btn btn-ghost btn-block" onClick={refresh}>I've confirmed it</button>
            <button type="button" className="btn-link" onClick={() => logout()}>Sign out</button>
          </>
        )}
      </div>
    </div>
  );
}
