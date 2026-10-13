import { useEffect, useState } from "react";
import { api, type PortfolioProjectSummary } from "../lib/api";
import { projectReasonParts } from "../lib/projectReason";

const LABEL: Record<PortfolioProjectSummary["health"], string> = { on_track: "On track", at_risk: "At risk", off_track: "Off track" };
const PILL: Record<PortfolioProjectSummary["health"], string> = { on_track: "pill-green", at_risk: "pill-gold", off_track: "pill-red" };

/**
 * One calm line under a project's title: how it is doing and why. Read-only, built from the
 * same portfolio rollup the Projects list uses (no new health logic). If the data cannot load,
 * it renders nothing and the page is unchanged.
 */
export function HealthStrip({ projectId, onOpenTab }: { projectId: string; onOpenTab: (tab: string) => void }) {
  const [summary, setSummary] = useState<PortfolioProjectSummary | null>(null);

  useEffect(() => {
    let live = true;
    setSummary(null);
    try {
      Promise.resolve(api.getPortfolio(projectId))
        .then((d) => { if (live) setSummary(d?.projects?.find((x) => x.id === projectId) ?? null); })
        .catch(() => {});
    } catch {
      // Nothing to show: the strip is optional.
    }
    return () => { live = false; };
  }, [projectId]);

  if (!summary) return null;
  const parts = projectReasonParts(summary);
  const isNew = summary.totalTasks === 0 && summary.health === "on_track";
  const nextUp = summary.nextUp && !parts.some((p) => p.text.startsWith("Next up")) ? summary.nextUp : null;

  return (
    <div className="hs-strip" role="status" aria-label="Project health">
      <span className={`pill ${isNew ? "hs-new" : PILL[summary.health]}`}>{isNew ? "New" : LABEL[summary.health]}</span>
      <span className="hs-why">
        {parts.map((p, i) => (
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
      {nextUp && <span className="hs-next muted" title={nextUp}><span>Next up:</span> {nextUp}</span>}
    </div>
  );
}
