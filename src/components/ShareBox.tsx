import { useEffect, useState } from "react";
import { api, type ShareKind } from "../lib/api";
import { useConfirm } from "./ConfirmDialog";

/** Owner-only controls for a read-only share link to one printable document. */
export function ShareBox({ projectId, kind, recipientsSee }: { projectId: string; kind: ShareKind; recipientsSee: string }) {
  const confirm = useConfirm();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getShareLink(projectId, kind).then((r) => setToken(r.link?.token ?? null)).catch(() => {});
  }, [projectId, kind]);

  const shareUrl = token ? `${window.location.origin}/s/${token}` : "";

  async function run(fn: () => Promise<{ link: { token: string } | null }>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      setToken(r.link?.token ?? null);
      setCopied(false);
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setError("Could not copy automatically. Select the link and copy it.");
    }
  }

  async function regenerate() {
    const ok = await confirm("Make a new link? The current link will stop working for anyone who has it.");
    if (ok) run(() => api.createShareLink(projectId, kind, true));
  }

  return (
    <section className="no-print share-box">
      <h2>Share with people outside Tasketra</h2>
      {token ? (
        <>
          <p className="muted">Anyone with this link can view this page, read-only, without an account. {recipientsSee}</p>
          <input className="share-url" readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
          <div className="share-buttons">
            <button className="btn btn-primary" type="button" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={regenerate}>New link</button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => run(() => api.stopShareLink(projectId, kind))}>Stop sharing</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Create a read-only link so a sponsor or client can see this page without a Tasketra account. You can turn it off at any time.</p>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => run(() => api.createShareLink(projectId, kind))}>Create share link</button>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
