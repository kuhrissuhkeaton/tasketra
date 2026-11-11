import { useEffect, useState } from "react";
import { api, type PortfolioProjectSummary } from "../lib/api";
import { projectReasonParts } from "../lib/projectReason";
import { HEALTH_LABEL, evidenceChallenge, headlineHealth } from "../lib/healthLabels";

const LABEL = HEALTH_LABEL;
const PILL: Record<PortfolioProjectSummary["health"], string> = { on_track: "pill-green", at_risk: "pill-gold", off_track: "pill-red" };

/** Age of a stated status: "today", "yesterday", "3 days ago". */
function statedAge(iso: string | null | undefined): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * One calm line under a project's title: how it is doing and why. Read-only, built from the
 * same portfolio rollup the Projects list uses (no new health logic). If the data cannot load,
 * it renders nothing and the page is unchanged.
 */
export function HealthStrip({ projectId, refreshKey, onOpenTab }: { projectId: string; refreshKey?: string; onOpenTab: (tab: string) => void }) {
  const [summary, setSummary] = useState<PortfolioProjectSummary | null>(null);

  // Refetch when the tab changes as well as when the project does: work added
  // in one tab (the first task, say) should update this strip when the person
  // moves on, instead of still announcing the state from first load. The old
  // summary stays on screen while refetching so the strip doesn't flicker.
  useEffect(() => {
    let live = true;
    try {
      Promise.resolve(api.getPortfolio(projectId))
        .then((d) => { if (live) setSummary(d?.projects?.find((x) => x.id === projectId) ?? null); })
        .catch(() => {});
    } catch {
      // Nothing to show: the strip is optional.
    }
    return () => { live = false; };
  }, [projectId, refreshKey]);

  if (!summary) return null;
  // A closed project is done, not "off track": its leftover overdue counts
  // are history, not a current health signal.
  if (summary.closed_at) {
    return (
      <div className="hs-strip" role="status" aria-label="Project health">
        <span className="pill pill-neutral">Closed</span>
        <span className="hs-why">This project has been closed. Everything stays readable — reopen it from the Closure tab if work resumes.</span>
      </div>
    );
  }
  const allParts = projectReasonParts(summary);
  // v156: a stated status (when a check-in stated one) is the headline;
  // the "New" neutral state yields to it -- a stated status is a real
  // statement, not a default. The evidence health headlines only when
  // nothing was stated, and otherwise shows as the challenge line.
  const isNew = summary.totalTasks === 0 && summary.health === "on_track" && !summary.statedHealth;
  const headline = headlineHealth(summary);
  const challenge = evidenceChallenge(summary);
  // v151 (Part A2): the stage-checklist hint does not belong in the health
  // strip -- inside the project it read as a second, disagreeing task list
  // (the Next Step card owns "what's next" here). The hint stays on the
  // Dashboard rows, where it names its stage. If it was the only part, the
  // strip falls back to a plain "Nothing flagged".
  const parts = allParts.filter((p) => !p.nextUp);
  const shownParts = parts.length > 0 ? parts : [{ text: "Nothing flagged" }];

  return (
    <div className="hs-strip" role="status" aria-label="Project health">
      <span className={`pill ${isNew ? "hs-new" : PILL[headline]}`}>{isNew ? "New" : LABEL[headline]}</span>
      <span className="hs-why">
        {shownParts.map((p, i) => (
          <span key={p.text}>
            {i > 0 && ", "}
            {p.tab ? (
              <button type="button" className="hs-link" onClick={() => onOpenTab(p.tab!)}>{p.text}</button>
            ) : (
              p.text
            )}
          </span>
        ))}
      </span>
      <span className="hs-stated">
        {summary.statedHealth ? (
          <>
            <span className="hs-stated-label">Stated in your check-in</span>
            {summary.statedAt && <span className="muted">· {statedAge(summary.statedAt)}</span>}
            {challenge && (
              <span className="muted">· Evidence suggests {LABEL[challenge]}</span>
            )}
          </>
        ) : (
          <span className="muted">No status stated yet</span>
        )}
      </span>
    </div>
  );
}
