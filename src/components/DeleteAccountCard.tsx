import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

export function DeleteAccountCard({
  email,
  onDeleted = () => window.location.assign("/"),
}: {
  email: string;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = password.length > 0 && typed.trim().toLowerCase() === email.toLowerCase();

  function close() {
    setOpen(false);
    setPassword("");
    setTyped("");
    setError("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteMyAccount(password, typed.trim());
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete your account.");
      setBusy(false);
    }
  }

  return (
    <div className="settings-card" style={{ maxWidth: 640 }}>
      <p className="settings-card-label">Delete your account</p>
      <p className="muted" style={{ marginTop: 0 }}>
        This permanently deletes your account, the projects you own, and everything in them (tasks, documents,
        budgets and so on). It can't be undone. If you have a paid subscription, cancel it from Billing first. If other
        people are on a project you own, remove them first.
      </p>
      {!open ? (
        <button type="button" className="btn" onClick={() => setOpen(true)}>Delete my account...</button>
      ) : (
        <form onSubmit={submit}>
          <label style={{ display: "block", marginBottom: 8 }}>
            Your password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ display: "block", width: "100%" }} />
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            Type your email address ({email}) to confirm
            <input type="text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} style={{ display: "block", width: "100%" }} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn" disabled={!ready || busy} style={{ background: "#b3261e", color: "#fff", borderColor: "#b3261e" }}>
            {busy ? "Deleting..." : "Permanently delete my account"}
          </button>{" "}
          <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
        </form>
      )}
    </div>
  );
}
