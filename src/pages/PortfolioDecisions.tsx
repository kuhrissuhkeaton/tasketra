import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PortfolioData, type PortfolioDecision } from "../lib/api";
import { AppSidebar } from "../components/AppSidebar";
import { useDocumentTitle } from "../lib/documentTitle";
import { fmtLocalDate } from "../lib/format";
import { decisionWaitWords } from "../lib/decisionWait";

// Decisions across every project (v164, Portfolio Command): the
// cross-project view behind the top tab. It reads the portfolio payload's
// openDecisions -- every still-open ask on every project the user can see
// (closed projects excluded server-side), oldest first, so the longest
// wait leads. Rows reuse the v160 per-project card design and lead line
// (decider, wait time, needed-by), and Copy link / Nudge behave exactly
// as they do on the project's own Decisions tab. Read-only: answering and
// confirming still happen on the public page and in the project.
export default function PortfolioDecisions() {
  useDocumentTitle("Decisions");
  const [data, setData] = useState<PortfolioData | null>(null);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [nudgedId, setNudgedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getPortfolio()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError("Couldn't load your decisions. Try refreshing the page."); });
    return () => { cancelled = true; };
  }, []);

  // Same behavior as the per-project card (v151/v160): the public link to
  // the clipboard; a nudge is a ready-to-paste reminder, since the app has
  // no outbound channel to stakeholders.
  function copyShareLink(d: PortfolioDecision) {
    const url = `${window.location.origin}/d/${d.publicToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(d.id);
      setTimeout(() => setCopiedId((cur) => (cur === d.id ? null : cur)), 2000);
    });
  }

  function copyNudge(d: PortfolioDecision) {
    const url = `${window.location.origin}/d/${d.publicToken}`;
    const names = d.recipients.join(", ");
    const waited = decisionWaitWords(d.createdAt);
    const waitPart = waited === "asked today" ? "sent today" : waited;
    const text = `Hi ${names}, a quick nudge on "${d.title}" (${waitPart}${d.deadline ? `, needed by ${fmtLocalDate(d.deadline)}` : ""}). You can answer here, no account needed: ${url}`;
    navigator.clipboard.writeText(text).then(() => {
      setNudgedId(d.id);
      setTimeout(() => setNudgedId((cur) => (cur === d.id ? null : cur)), 2000);
    });
  }

  const decisions = data?.openDecisions ?? [];
  const projectCount = new Set(decisions.map((d) => d.projectId)).size;

  return (
    <div className="project-shell">
      <AppSidebar />
      <main className="project-main">
        <div className="page-head">
          <div>
            <h1>Decisions</h1>
            <p className="tw-sub">
              {!data && !error
                ? "Loading…"
                : decisions.length === 0
                  ? "Nothing is waiting on a decision."
                  : `${decisions.length} decision${decisions.length === 1 ? "" : "s"} waiting across ${projectCount} project${projectCount === 1 ? "" : "s"}, longest wait first.`}
            </p>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        {data && decisions.length === 0 && !error && (
          <p className="muted">
            Decision requests live inside projects. <Link to="/app/projects">Open a project</Link> and use its Decisions tab to ask someone, and the wait will show up here.
          </p>
        )}

        <div className="decision-list">
          {decisions.map((d) => (
            <div className="decision-card open" key={d.id}>
              <div className="decision-card-head">
                <h4>{d.title}</h4>
              </div>
              {/* The v160 lead line: decider first, then the wait, then
                  the needed-by date. */}
              <p className="decision-wait">
                {d.recipients.length ? (
                  <>Waiting on <strong>{d.recipients.join(", ")}</strong> · {decisionWaitWords(d.createdAt)}</>
                ) : (
                  "Not sent to anyone yet — copy the link to ask."
                )}
                {d.deadline && <> · Needed by {fmtLocalDate(d.deadline)}</>}
              </p>
              <p className="muted" style={{ margin: "2px 0 0" }}>
                in <Link to={`/app/projects/${d.projectId}`}>{d.projectName}</Link>
              </p>
              {d.context && <p className="muted" style={{ margin: "6px 0 0" }}>{d.context}</p>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button className="btn btn-primary" type="button" onClick={() => copyShareLink(d)}>
                  {copiedId === d.id ? "Copied" : "Copy link"}
                </button>
                {d.recipients.length > 0 && (
                  <button className="btn btn-ghost" type="button" onClick={() => copyNudge(d)}>
                    {nudgedId === d.id ? "Nudge copied" : "Nudge"}
                  </button>
                )}
                <Link className="btn btn-ghost" to={`/app/projects/${d.projectId}?tab=decisions`}>Open in project</Link>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
