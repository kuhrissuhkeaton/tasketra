import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Project, type Risk } from "../lib/api";
import { Wordmark } from "../components/Wordmark";
import { RiskDocument } from "../components/RiskDocument";
import { useConfirm } from "../components/ConfirmDialog";

// Signed-in printable risk page. Anyone with project access can print it;
// only the owner sees the share-link controls.
export default function RiskPrint() {
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();
  const [project, setProject] = useState<Project | null>(null);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const isOwner = !!project && project.is_owner === true;

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getProject(id), api.listRisks(id)])
      .then(([p, r]) => { setProject(p.project); setRisks(r.risks); })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!id || !isOwner) return;
    api.getShareLink(id, "risk-matrix").then((r) => setToken(r.link?.token ?? null)).catch(() => {});
  }, [id, isOwner]);

  const shareUrl = token ? `${window.location.origin}/s/${token}` : "";

  async function run(fn: () => Promise<{ link: { token: string } | null }>) {
    setBusy(true);
    setShareError(null);
    try {
      const r = await fn();
      setToken(r.link?.token ?? null);
      setCopied(false);
    } catch (e: any) {
      setShareError(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setShareError("Could not copy automatically. Select the link and copy it.");
    }
  }

  async function regenerate() {
    const ok = await confirm("Make a new link? The current link will stop working for anyone who has it.");
    if (ok) run(() => api.createShareLink(id!, "risk-matrix", true));
  }

  if (error) return <div className="public-roadmap"><Wordmark size="sm" /><p className="form-error">{error}</p></div>;
  if (!project) return <div className="public-roadmap"><div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /></div></div>;

  const shown = risks.filter((r) => includeResolved || r.status !== "resolved");

  return (
    <div className="public-roadmap share-public">
      <div className="no-print share-public-bar">
        <Link to={`/app/projects/${id}`} className="muted">← Back to {project.name}</Link>
        <div className="share-public-actions">
          <label className="share-check">
            <input type="checkbox" checked={includeResolved} onChange={(e) => setIncludeResolved(e.target.checked)} /> Include resolved
          </label>
          <button className="btn btn-primary" type="button" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>

      {isOwner && (
        <section className="no-print share-box">
          <h2>Share with people outside Tasketra</h2>
          {token ? (
            <>
              <p className="muted">Anyone with this link can view this page, read-only, without an account. They see open and monitoring risks with title, probability, impact, mitigation and owner. Risk descriptions and resolved items are never included.</p>
              <input className="share-url" readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
              <div className="share-buttons">
                <button className="btn btn-primary" type="button" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={regenerate}>New link</button>
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => run(() => api.stopShareLink(id!, "risk-matrix"))}>Stop sharing</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">Create a read-only link so a sponsor or client can see this page without a Tasketra account. You can turn it off at any time.</p>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => run(() => api.createShareLink(id!, "risk-matrix"))}>Create share link</button>
            </>
          )}
          {shareError && <p className="form-error">{shareError}</p>}
        </section>
      )}

      <RiskDocument
        projectName={project.name}
        risks={shown}
        dateLabel={new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
      />
    </div>
  );
}
