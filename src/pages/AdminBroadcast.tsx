import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type BroadcastProgress } from "../lib/api";
import { AppSidebar } from "../components/AppSidebar";
import { useConfirm } from "../components/ConfirmDialog";
import { fmtDate } from "../lib/format";

const DEFAULT_SUBJECT = "Thank you for being one of the first 100";
const DEFAULT_BODY = `Hi {first_name},

You're one of the first 100 people using Tasketra, and I want to say thank you. You picked up a brand-new tool from a solo builder and gave it a real try. That matters more than you probably know.

A heads-up on what to expect: Tasketra changes almost every day right now. I'm building it alongside the people who use it, so your feedback goes straight into what ships. When something breaks, I fix it as fast as I can. When someone says "I wish it did this," I check what the app does today, and if it's a real gap, it gets built. Founding member feedback has already led to tasks linked to roadmap phases, richer stakeholder tracking, project templates, a RACI chart, printable risk matrices, and read-only share links.

So if something looks different next week, that's why. And if something breaks or bothers you, hit reply and tell me. One line is plenty. I read every one.

Your founding spot is free Pro, forever. That doesn't change. No card, no catch.

Thank you for building this with me.

-- Karissa`;

export default function AdminBroadcast() {
  const confirm = useConfirm();
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [holdCheckin, setHoldCheckin] = useState(true);
  const [audience, setAudience] = useState<number | null>(null);
  const [recent, setRecent] = useState<BroadcastProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BroadcastProgress | null>(null);
  const stop = useRef(false);

  const load = useCallback(async () => {
    try {
      const o = await api.adminBroadcastOverview();
      setAudience(o.audience);
      setRecent(o.recent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load.");
    }
  }, []);
  useEffect(() => { load(); return () => { stop.current = true; }; }, [load]);

  async function sendTest() {
    setError(null); setNotice(null); setBusy(true);
    try {
      const r = await api.adminBroadcastTest(subject, body);
      setNotice(`Test sent to ${r.sentTo}. Check your inbox before sending to everyone.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the test.");
    } finally { setBusy(false); }
  }

  // Sends run in small batches; keep asking for the next one until none are left.
  async function drive(first: { progress: BroadcastProgress; rateLimited: boolean }) {
    let current = first;
    setProgress(current.progress);
    while (!stop.current && current.progress.pending > 0) {
      await new Promise((r) => setTimeout(r, current.rateLimited ? 4000 : 300));
      current = await api.adminBroadcastContinue(current.progress.id);
      setProgress(current.progress);
    }
    return current.progress;
  }

  async function send(force = false) {
    setError(null); setNotice(null);
    const ok = await confirm(
      `Send "${subject}" to ${audience ?? "all"} founding member${audience === 1 ? "" : "s"} now? This can't be undone. Send yourself a test first if you haven't.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const done = await drive(await api.adminBroadcastSend(subject, body, holdCheckin, force));
      setNotice(done.failed > 0 ? `Sent to ${done.sent}. ${done.failed} could not be sent.` : `Sent to ${done.sent} founding members.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const again = await confirm(`${err.message} Send it again anyway?`);
        if (again) { setBusy(false); return send(true); }
      } else {
        setError(err instanceof Error ? err.message : "Sending stopped. Reload to see how far it got.");
      }
    } finally { setBusy(false); load(); }
  }

  async function retry(id: string) {
    setError(null); setNotice(null); setBusy(true);
    try {
      const done = await drive(await api.adminBroadcastContinue(id, true));
      setNotice(done.failed > 0 ? `${done.failed} still could not be sent.` : "Everyone has it now.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not retry.");
    } finally { setBusy(false); load(); }
  }

  return (
    <div className="project-shell">
      <AppSidebar />
      <main className="project-main">
        <div className="page-head">
          <h1>Email founding members</h1>
          {audience !== null && <div className="stat-row"><div className="stat"><strong>{audience}</strong> will receive it</div></div>}
        </div>
        <p className="muted" style={{ maxWidth: 640 }}>
          Goes to founding members with a confirmed email, from Tasketra, with replies coming to you. Use {"{first_name}"} for their first name
          ("there" if we don't have one). A short line about stopping updates is added at the bottom automatically.
          {" "}<Link to="/admin/founding-members">Back to founding members</Link>
        </p>

        {error && <div className="form-error">{error}</div>}
        {notice && <p className="form-success" role="status">{notice}</p>}

        <div className="billing-card" style={{ maxWidth: 720, marginBottom: 24 }}>
          <label htmlFor="broadcast-subject">Subject</label>
          <input id="broadcast-subject" type="text" maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} />
          <label htmlFor="broadcast-body">Message</label>
          <textarea id="broadcast-body" rows={18} value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={holdCheckin} onChange={(e) => setHoldCheckin(e.target.checked)} disabled={busy} />
            Hold the automatic "How's Tasketra working for you?" check-in for about a week for everyone who gets this
          </label>
          <div className="inline-form">
            <button type="button" className="btn btn-ghost" onClick={sendTest} disabled={busy}>Send a test to me</button>
            <button type="button" className="btn btn-primary" onClick={() => send()} disabled={busy || !audience}>
              {busy ? "Sending..." : `Send to ${audience ?? "..."} founding members`}
            </button>
          </div>
          {progress && (
            <p role="status" style={{ marginTop: 12 }}>
              Sent {progress.sent} of {progress.total}{progress.failed > 0 ? `, ${progress.failed} failed` : ""}{progress.pending > 0 ? `, ${progress.pending} to go...` : ""}
            </p>
          )}
        </div>

        {recent.length > 0 && (
          <>
            <h2>Past sends</h2>
            <ul style={{ maxWidth: 720, paddingLeft: 18 }}>
              {recent.map((b) => (
                <li key={b.id} style={{ marginBottom: 8 }}>
                  <strong>{b.subject}</strong> ({fmtDate(b.created_at)}): {b.sent} of {b.total} sent
                  {b.failed > 0 && <> , {b.failed} failed <button type="button" className="btn-link" onClick={() => retry(b.id)} disabled={busy}>Retry failed</button></>}
                  {b.pending > 0 && <> , {b.pending} not sent yet <button type="button" className="btn-link" onClick={() => retry(b.id)} disabled={busy}>Finish sending</button></>}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
