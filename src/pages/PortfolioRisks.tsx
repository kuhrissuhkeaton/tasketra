import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PortfolioData, type PortfolioIssue, type PortfolioRisk } from "../lib/api";
import { AppSidebar } from "../components/AppSidebar";
import { useDocumentTitle } from "../lib/documentTitle";
import { sortRisks, riskScore } from "../lib/riskExposure";

// Risks & Issues across every project (v164, Portfolio Command): the
// cross-project view behind the top tab. It reads the portfolio payload's
// openRisks / openIssues (not-resolved items on visible projects, closed
// projects excluded server-side). Risks are ordered with the shared
// v157/v158 exposure comparator -- numeric score first, band product for
// unscored risks -- so this list can never disagree with a project's own
// register about what the biggest risk is. Rows carry the v160 matrix
// chip (P · I · Score) and link into the owning project's tab. Read-only.
const SEVERITY_ORDER: Record<PortfolioIssue["severity"], number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_PILL: Record<PortfolioIssue["severity"], string> = { low: "pill-green", medium: "pill-gold", high: "pill-red", critical: "pill-red" };
const SEVERITY_LABEL: Record<PortfolioIssue["severity"], string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
const ISSUE_STATUS_WORD: Record<PortfolioIssue["status"], string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };
const RISK_STATUS_WORD: Record<PortfolioRisk["status"], string> = { open: "Open", monitoring: "Monitoring", resolved: "Resolved" };

function cap(band: string): string {
  return band.charAt(0).toUpperCase() + band.slice(1);
}

function riskChip(r: PortfolioRisk): string {
  const score = riskScore(r);
  return score !== null ? `P${r.probability_score} · I${r.impact_score} · Score ${score}` : `P ${cap(r.probability)} · I ${cap(r.impact)}`;
}

export default function PortfolioRisks() {
  useDocumentTitle("Risks & Issues");
  const [data, setData] = useState<PortfolioData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.getPortfolio()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError("Couldn't load your risks and issues. Try refreshing the page."); });
    return () => { cancelled = true; };
  }, []);

  const risks = sortRisks(data?.openRisks ?? [], "exposure");
  const issues = [...(data?.openIssues ?? [])].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.createdAt.localeCompare(a.createdAt)
  );
  const projectCount = new Set([...risks.map((r) => r.projectId), ...issues.map((i) => i.projectId)]).size;

  return (
    <div className="project-shell">
      <AppSidebar />
      <main className="project-main">
        <div className="page-head">
          <div>
            <h1>Risks &amp; Issues</h1>
            <p className="tw-sub">
              {!data && !error
                ? "Loading…"
                : risks.length + issues.length === 0
                  ? "Nothing open across your projects."
                  : `${risks.length} open risk${risks.length === 1 ? "" : "s"} and ${issues.length} open issue${issues.length === 1 ? "" : "s"} across ${projectCount} project${projectCount === 1 ? "" : "s"}.`}
            </p>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        {data && !error && (
          <>
            <h2 style={{ marginTop: 8 }}>Risks</h2>
            {risks.length === 0 ? (
              <p className="muted">
                No open risks right now. Risks you log on a project show up here, biggest exposure first. <Link to="/app/projects">Open a project</Link> to log one.
              </p>
            ) : (
              <div className="dash-list-rows">
                {risks.map((r) => (
                  <div className="dash-list-row" key={r.id}>
                    <span className="pill pill-navy">{riskChip(r)}</span>{" "}
                    <Link className="dash-list-title" to={`/app/projects/${r.projectId}?tab=risks`}>{r.title}</Link>
                    <div className="dash-list-meta">
                      in <Link to={`/app/projects/${r.projectId}`}>{r.projectName}</Link> · {RISK_STATUS_WORD[r.status]}
                      {r.ownerName ? <> · Owner: {r.ownerName}</> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h2 style={{ marginTop: 28 }}>Issues</h2>
            {issues.length === 0 ? (
              <p className="muted">
                No open issues right now. Issues you log on a project show up here, most severe first. <Link to="/app/projects">Open a project</Link> to log one.
              </p>
            ) : (
              <div className="dash-list-rows">
                {issues.map((i) => (
                  <div className="dash-list-row" key={i.id}>
                    <span className={`pill ${SEVERITY_PILL[i.severity]}`}>{SEVERITY_LABEL[i.severity]}</span>{" "}
                    <Link className="dash-list-title" to={`/app/projects/${i.projectId}?tab=issues`}>{i.title}</Link>
                    <div className="dash-list-meta">
                      in <Link to={`/app/projects/${i.projectId}`}>{i.projectName}</Link> · {ISSUE_STATUS_WORD[i.status]}
                      {i.ownerName ? <> · Owner: {i.ownerName}</> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
