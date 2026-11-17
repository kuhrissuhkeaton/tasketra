import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { PROJECT_ACTIVITY_EVENT, PROJECT_CHANGED_EVENT } from "../lib/firstRun";
import {
  applyCounts,
  dismissDoingTour,
  doingTourComplete,
  doingTourCurrentStep,
  readDoingTour,
  saveDoingTour,
  type DoingTourState,
} from "../lib/doingTour";
import { latchGettingStarted } from "../lib/gettingStarted";

// v161 (F-09): the doing tour card on a first project. Three steps, each
// completed by actually doing the thing in the real UI -- the card only
// watches the project's real counts (lib/doingTour.ts holds the latch
// logic). It replaces the narration tour as the first-run guide; the
// 10-step tour remains available from Help / Resources as the replay.
export function DoingTour({
  userId,
  projectId,
  onOpenTab,
  refreshKey,
  hidden,
}: {
  userId: string;
  projectId: string;
  onOpenTab: (tab: string) => void;
  // Changes when the user switches project tabs: a cheap extra refetch so
  // a step ticks even if a change event was missed.
  refreshKey?: string;
  hidden?: boolean;
}) {
  const [state, setState] = useState<DoingTourState | null>(() => readDoingTour(userId, projectId));
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(async () => {
    const current = stateRef.current;
    if (!current || current.dismissed) return;
    try {
      const [tasks, decisions, feed] = await Promise.all([
        api.listTasks(projectId),
        api.listDecisions(projectId),
        api.getFeed(projectId),
      ]);
      const counts = {
        tasks: tasks.tasks.length,
        decisions: decisions.decisions.length,
        checkins: feed.feed.filter((i) => i.type === "status_update").length,
      };
      const prev = stateRef.current;
      if (!prev) return;
      const next = applyCounts(prev, counts);
      if (next !== prev) {
        // Keep the Today checklist in step: a tour step done here is the
        // same "first" there.
        if (next.taskDone && !prev.taskDone) latchGettingStarted(userId, "task");
        if (next.decisionDone && !prev.decisionDone) latchGettingStarted(userId, "decision");
        if (next.checkinDone && !prev.checkinDone) latchGettingStarted(userId, "checkin");
        saveDoingTour(userId, next);
        setState(next);
      }
    } catch {
      // Counts are a nicety; a failed fetch just means the card re-checks
      // on the next change event or tab switch.
    }
  }, [projectId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ projectId?: string }>).detail;
      if (!detail || detail.projectId === projectId) void refresh();
    };
    window.addEventListener(PROJECT_CHANGED_EVENT, onChange);
    window.addEventListener(PROJECT_ACTIVITY_EVENT, onChange);
    return () => {
      window.removeEventListener(PROJECT_CHANGED_EVENT, onChange);
      window.removeEventListener(PROJECT_ACTIVITY_EVENT, onChange);
    };
  }, [projectId, refresh]);

  if (!state || state.dismissed) return null;

  const complete = doingTourComplete(state);
  const current = doingTourCurrentStep(state);
  const doneCount = [state.taskDone, state.decisionDone, state.checkinDone].filter(Boolean).length;

  const steps: { label: string; hint: string; action: string; tab: string; done: boolean }[] = [
    {
      label: "Add a task",
      hint: "The next thing that needs doing, in your own words.",
      action: "Add a task",
      tab: "tasks",
      done: state.taskDone,
    },
    {
      label: "Send a decision",
      hint: "Ask someone to decide, and see exactly what they'll see first.",
      action: "Send a decision",
      tab: "decisions",
      done: state.decisionDone,
    },
    {
      label: "Post a check-in",
      hint: "One line on how it's going. That's a status update here.",
      action: "Write a check-in",
      tab: "home",
      done: state.checkinDone,
    },
  ];

  return (
    <section className="first-run-checklist doing-tour" aria-label="Hands-on first steps" hidden={hidden}>
      <div className="first-run-checklist-head">
        <h2>Learn it by doing it</h2>
        <span className="doing-tour-progress">
          {doneCount} of 3
          <button
            type="button"
            className="hub-tip-close"
            aria-label="Dismiss the hands-on steps"
            onClick={() => {
              dismissDoingTour(userId, projectId);
              setState((s) => (s ? { ...s, dismissed: true } : s));
            }}
          >
            ×
          </button>
        </span>
      </div>
      {complete ? (
        <p className="doing-tour-done">
          That's the whole loop: plan the work, ask for the decision, say how it's going. Everything else in
          Tasketra builds on those three.
        </p>
      ) : (
        <ol className="first-run-steps">
          {steps.map((step, i) => (
            <li key={step.label} className={step.done ? "done" : i === current ? "current" : undefined}>
              <span className="first-run-step-mark" aria-hidden="true">
                {step.done ? "✓" : i + 1}
              </span>
              <span className="first-run-step">{step.label}</span>
              {step.done ? (
                <span className="first-run-step-detail">Done</span>
              ) : i === current ? (
                <button type="button" className="btn btn-small doing-tour-action" onClick={() => onOpenTab(step.tab)}>
                  {step.action}
                </button>
              ) : (
                <span className="first-run-step-detail">Up next</span>
              )}
              {i === current && !step.done && <span className="doing-tour-hint">{step.hint}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
