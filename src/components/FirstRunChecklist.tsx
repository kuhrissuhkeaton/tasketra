import { useEffect, useState } from "react";
import { track } from "../lib/analytics";
import {
  applyActivity, checklistDone, readChecklist, writeChecklist, CHECKLIST_TASK_GOAL, PROJECT_ACTIVITY_EVENT,
  type ChecklistProgress, type ProjectActivity,
} from "../lib/firstRun";

// Tabs where the plan a template set up can be read.
const PLAN_TABS = new Set(["roadmap", "tasks", "charter"]);

/**
 * The three-step "get going" card in the project someone started from the
 * first-run screen. Only appears in that project, until dismissed.
 */
export function FirstRunChecklist({
  userId,
  projectId,
  tab,
  hidden,
  onOpenTab,
}: {
  userId: string;
  projectId: string;
  tab: string;
  /** Kept mounted (so progress still counts) but not drawn, e.g. during the product tour. */
  hidden: boolean;
  onOpenTab: (tab: string) => void;
}) {
  const [progress, setProgress] = useState<ChecklistProgress | null>(() => readChecklist(userId));
  const active = progress !== null && progress.projectId === projectId && !progress.dismissed;

  function record(kind: ProjectActivity) {
    setProgress((p) => {
      if (!p || p.projectId !== projectId || p.dismissed) return p;
      const { next, events } = applyActivity(p, kind);
      if (next === p) return p;
      writeChecklist(userId, next);
      events.forEach((ev) => track(ev));
      return next;
    });
  }

  useEffect(() => {
    if (!active) return;
    function onActivity(e: Event) {
      const detail = (e as CustomEvent<{ projectId: string; kind: ProjectActivity }>).detail;
      if (detail?.projectId === projectId) record(detail.kind);
    }
    window.addEventListener(PROJECT_ACTIVITY_EVENT, onActivity);
    return () => window.removeEventListener(PROJECT_ACTIVITY_EVENT, onActivity);
    // record only reads stable values through the state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, projectId]);

  useEffect(() => {
    if (active && PLAN_TABS.has(tab)) record("review");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tab]);

  if (!active || hidden || !progress) return null;

  function dismiss() {
    const next = { ...progress!, dismissed: true };
    writeChecklist(userId, next);
    setProgress(next);
  }

  const tasksDone = progress.taskEdits >= CHECKLIST_TASK_GOAL;
  const steps = [
    { done: progress.reviewed, label: "Review your plan", tab: "roadmap", detail: null },
    { done: tasksDone, label: "Add or edit 3 tasks", tab: "tasks", detail: tasksDone ? null : `${progress.taskEdits} of ${CHECKLIST_TASK_GOAL}` },
    { done: progress.invited, label: "Invite a teammate", tab: "team", detail: null },
  ];

  return (
    <aside className="first-run-checklist" aria-labelledby="first-run-checklist-title">
      <div className="first-run-checklist-head">
        <h2 id="first-run-checklist-title">{checklistDone(progress) ? "You're set up" : "Get your project going"}</h2>
        <button type="button" className="hub-tip-close" aria-label="Dismiss checklist" onClick={dismiss}>×</button>
      </div>
      <ol className="first-run-steps">
        {steps.map((s) => (
          <li key={s.label} className={s.done ? "done" : undefined}>
            <span className="first-run-step-mark" aria-hidden="true">{s.done ? "✓" : ""}</span>
            <button type="button" className="first-run-step" onClick={() => onOpenTab(s.tab)}>
              {s.label}
            </button>
            {s.done && <span className="sr-only"> (done)</span>}
            {s.detail && <span className="first-run-step-detail">{s.detail}</span>}
          </li>
        ))}
      </ol>
    </aside>
  );
}
