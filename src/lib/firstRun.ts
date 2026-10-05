// The first-run experience: which accounts see the "start your first project"
// screen instead of the Dashboard, and the three-step checklist shown inside
// the project they start from it. Rules are pure so they can be tested; the
// checklist's progress lives in this browser's storage, keyed by user, since
// there is no per-user settings store on the server.

import type { AnalyticsEvent } from "./analytics";

/** Someone with nothing to look at yet: no projects, or one with no tasks. */
export function isFirstRun(projects: { id: string }[], taskCounts: Record<string, number>): boolean {
  if (projects.length === 0) return true;
  if (projects.length > 1) return false;
  // Unknown count (the rollup didn't include it): keep the normal Dashboard.
  return taskCounts[projects[0].id] === 0;
}

export const CHECKLIST_TASK_GOAL = 3;

export type ChecklistProgress = {
  projectId: string;
  reviewed: boolean;
  taskEdits: number;
  invited: boolean;
  dismissed: boolean;
};

export type ProjectActivity = "review" | "task" | "invite";

const storageKey = (userId: string) => `tasketra:first-run-checklist:${userId}`;

export function readChecklist(userId: string): ChecklistProgress | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && typeof p.projectId === "string" ? (p as ChecklistProgress) : null;
  } catch {
    return null;
  }
}

export function writeChecklist(userId: string, progress: ChecklistProgress): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(progress));
  } catch {
    // Storage unavailable: the checklist still works for this visit.
  }
}

export function startChecklist(userId: string, projectId: string): ChecklistProgress {
  const fresh: ChecklistProgress = { projectId, reviewed: false, taskEdits: 0, invited: false, dismissed: false };
  writeChecklist(userId, fresh);
  return fresh;
}

/** Applies one thing the person did, and says which analytics events it crossed. */
export function applyActivity(p: ChecklistProgress, kind: ProjectActivity): { next: ChecklistProgress; events: AnalyticsEvent[] } {
  if (kind === "review") return { next: p.reviewed ? p : { ...p, reviewed: true }, events: [] };
  if (kind === "invite") return { next: p.invited ? p : { ...p, invited: true }, events: p.invited ? [] : ["teammate_invited"] };
  const taskEdits = p.taskEdits + 1;
  const events: AnalyticsEvent[] = [];
  if (taskEdits === 1) events.push("first_task_edited");
  if (taskEdits === CHECKLIST_TASK_GOAL) events.push("three_tasks_added");
  return { next: { ...p, taskEdits }, events };
}

export function checklistDone(p: ChecklistProgress): boolean {
  return p.reviewed && p.taskEdits >= CHECKLIST_TASK_GOAL && p.invited;
}

// Project tabs announce what happened; the checklist (when it's showing for
// that project) listens. Keeps the tabs free of checklist state.
export const PROJECT_ACTIVITY_EVENT = "tasketra:project-activity";

export function noteProjectActivity(projectId: string, kind: ProjectActivity): void {
  try {
    window.dispatchEvent(new CustomEvent(PROJECT_ACTIVITY_EVENT, { detail: { projectId, kind } }));
  } catch {
    // ignore
  }
}
