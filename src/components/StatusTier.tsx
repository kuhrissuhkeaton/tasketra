// v172 (Plan A, "Layer It"): the standard/full project home used to open
// with a stack — a setup checklist in the page head, a health strip, up
// to three notice banners, then the cockpit gauges — five surfaces all
// answering "how is this project?" before the work started. The status
// tier is the merge: ONE card at the top of the home tab holding the
// health verdict (the HealthStrip, unboxed), a one-line progress bar,
// the decisions waiting count, what needs the user next, the quiet
// notice lines the banners used to shout, and the first-run checklist
// as the tier's action row. The cockpit follows as layer 2.
//
// On every other tab the HealthStrip still renders on its own, exactly
// as before; this tier exists only on the home tab.

import { useEffect, useState, type ReactNode } from "react";
import { api, type ProjectStage } from "../lib/api";
import { HealthStrip } from "./HealthStrip";
import { fmtDate } from "../lib/format";

type BaselineLike = {
  baseline: { lockedAt: string; taskCount: number } | null;
  variance: { movedTasks: unknown[]; addedTasks: number; removedTasks: number } | null;
} | null;

export function StatusTier({
  projectId,
  stage,
  purpose,
  sizeLabel,
  hiddenCount,
  isOwner,
  baselineData,
  checklist,
  refreshKey,
  onOpenTab,
  onShowAllTabs,
}: {
  projectId: string;
  stage: ProjectStage;
  purpose?: string;
  sizeLabel: string | null; // non-null when a size view is hiding tabs
  hiddenCount: number;
  isOwner: boolean;
  baselineData: BaselineLike;
  checklist?: ReactNode;
  refreshKey?: string;
  onOpenTab: (tab: string) => void;
  onShowAllTabs: () => void;
}) {
  const [taskStats, setTaskStats] = useState<{ total: number; done: number; nextUp: string | null } | null>(null);
  const [decisionsWaiting, setDecisionsWaiting] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.allSettled([api.listTasks(projectId), api.listDecisions(projectId)]).then(([t, d]) => {
      if (!live) return;
      if (t.status === "fulfilled") {
        const open = t.value.tasks.filter((x) => x.status !== "done");
        const next =
          open.find((x) => x.due_date && x.due_date < new Date().toISOString().slice(0, 10)) ??
          open.find((x) => x.due_date) ??
          open[0];
        setTaskStats({
          total: t.value.tasks.length,
          done: t.value.tasks.length - open.length,
          nextUp: next ? next.title : null,
        });
      }
      if (d.status === "fulfilled") {
        setDecisionsWaiting(d.value.decisions.filter((x) => x.status === "open").length);
      }
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshKey]);

  const pct = taskStats && taskStats.total > 0 ? Math.round((taskStats.done / taskStats.total) * 100) : 0;
  const showCharterNote = !purpose && (stage === "plan" || stage === "execute");
  const baseline = baselineData?.baseline;
  const variance = baselineData?.variance;
  const baselineMoved =
    variance && (variance.movedTasks.length > 0 || variance.addedTasks > 0 || variance.removedTasks > 0);

  return (
    <section className="card status-tier" aria-label="Project status">
      <HealthStrip projectId={projectId} refreshKey={refreshKey} onOpenTab={onOpenTab} bare />

      {taskStats && taskStats.total > 0 && (
        <div className="status-progress-row">
          <div
            className="progress-track status-progress-track"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tasks complete"
          >
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="status-progress-text">
            {taskStats.done} of {taskStats.total} tasks done
          </span>
          {decisionsWaiting > 0 && (
            <button type="button" className="status-chip" onClick={() => onOpenTab("decisions")}>
              {decisionsWaiting} decision{decisionsWaiting === 1 ? "" : "s"} waiting
            </button>
          )}
          {taskStats.nextUp && (
            <button type="button" className="status-nextup" onClick={() => onOpenTab("tasks")}>
              Next up: {taskStats.nextUp}
            </button>
          )}
        </div>
      )}
      {taskStats && taskStats.total === 0 && decisionsWaiting > 0 && (
        <div className="status-progress-row">
          <button type="button" className="status-chip" onClick={() => onOpenTab("decisions")}>
            {decisionsWaiting} decision{decisionsWaiting === 1 ? "" : "s"} waiting
          </button>
        </div>
      )}

      {sizeLabel && (
        <p className="status-note">
          Showing the {sizeLabel} view, which hides {hiddenCount} tabs.{" "}
          {isOwner && (
            <button type="button" className="view-banner-link" onClick={onShowAllTabs}>
              Show all sections
            </button>
          )}
        </p>
      )}
      {showCharterNote && (
        <p className="status-note">
          This project is under way without a charter. A short one, why it exists, who it is for, what done looks
          like, settles the scope questions before they become arguments.{" "}
          <button type="button" className="view-banner-link" onClick={() => onOpenTab("charter")}>
            Write the charter
          </button>
        </p>
      )}
      {baseline && (
        <p className="status-note">
          Baseline locked {fmtDate(baseline.lockedAt)} · {baseline.taskCount} tasks
          {variance
            ? baselineMoved
              ? ` · since then: ${variance.movedTasks.length} moved, ${variance.addedTasks} added, ${variance.removedTasks} removed`
              : " · nothing has moved against it yet"
            : ""}{" "}
          <button type="button" className="view-banner-link" onClick={() => onOpenTab("roadmap")}>
            See it on the Roadmap
          </button>
        </p>
      )}
      {baselineData && !baseline && stage === "execute" && (
        <p className="status-note">
          No baseline locked yet. Once the plan settles, locking one gives you a fixed point to measure slippage
          against.{" "}
          <button type="button" className="view-banner-link" onClick={() => onOpenTab("roadmap")}>
            Go to the Roadmap
          </button>
        </p>
      )}

      {checklist}
    </section>
  );
}
