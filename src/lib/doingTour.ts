// v161 (F-09): the 3-step DOING tour for a user's first project. Where the
// 10-step narration tour (ProductTour) explains the app, this one teaches
// by doing: add a task, send a decision, post a check-in. A step completes
// only when the project's real counts rise above the baseline captured
// when the tour first looked at the project -- clicking through text
// never ticks a step, and content the template/example seed shipped with
// doesn't count either, because the baseline already includes it.
//
// Progress lives in per-user browser storage, the same pattern firstRun.ts
// established for the checklist and v159 used for the explainer dismissal:
// there is no per-user server settings store, and none is needed -- the
// latches here only ever say "this account has done this once," which the
// live counts re-derive on any fresh browser anyway.

export type DoingTourCounts = { tasks: number; decisions: number; checkins: number };

export type DoingTourState = {
  projectId: string;
  // null until the tour has seen the project's counts once; the first
  // observation IS the baseline (nothing the user does can precede it,
  // because creation navigates straight into the project).
  baseline: DoingTourCounts | null;
  taskDone: boolean;
  decisionDone: boolean;
  checkinDone: boolean;
  dismissed: boolean;
};

const KEY_PREFIX = "tasketra:doing-tour:";

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function read(userId: string): DoingTourState | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DoingTourState;
    if (!parsed || typeof parsed.projectId !== "string") return null;
    return {
      projectId: parsed.projectId,
      baseline: parsed.baseline ?? null,
      taskDone: !!parsed.taskDone,
      decisionDone: !!parsed.decisionDone,
      checkinDone: !!parsed.checkinDone,
      dismissed: !!parsed.dismissed,
    };
  } catch {
    return null;
  }
}

function write(userId: string, state: DoingTourState): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // storage unavailable (private mode, quota) -- the tour just won't
    // persist between visits; nothing else depends on it.
  }
}

// Called when a first project is created (any path: example, template, or
// blank). Idempotent: an existing record for the same project is kept.
export function startDoingTour(userId: string, projectId: string): void {
  const existing = read(userId);
  if (existing && existing.projectId === projectId) return;
  write(userId, {
    projectId,
    baseline: null,
    taskDone: false,
    decisionDone: false,
    checkinDone: false,
    dismissed: false,
  });
}

export function readDoingTour(userId: string, projectId: string): DoingTourState | null {
  const state = read(userId);
  return state && state.projectId === projectId ? state : null;
}

// Pure step-completion logic, unit-tested: given the stored state and the
// project's live counts, set the baseline on first sight and latch any
// step whose count now exceeds it. Returns the SAME object when nothing
// changed, so callers can skip state churn.
export function applyCounts(state: DoingTourState, counts: DoingTourCounts): DoingTourState {
  const baseline = state.baseline ?? counts;
  const next: DoingTourState = {
    ...state,
    baseline,
    taskDone: state.taskDone || counts.tasks > baseline.tasks,
    decisionDone: state.decisionDone || counts.decisions > baseline.decisions,
    checkinDone: state.checkinDone || counts.checkins > baseline.checkins,
  };
  const changed =
    next.baseline !== state.baseline ||
    next.taskDone !== state.taskDone ||
    next.decisionDone !== state.decisionDone ||
    next.checkinDone !== state.checkinDone;
  return changed ? next : state;
}

export function saveDoingTour(userId: string, state: DoingTourState): void {
  write(userId, state);
}

export function dismissDoingTour(userId: string, projectId: string): void {
  const state = readDoingTour(userId, projectId);
  if (state) write(userId, { ...state, dismissed: true });
}

export function doingTourComplete(state: DoingTourState): boolean {
  return state.taskDone && state.decisionDone && state.checkinDone;
}

// The step the user should be pointed at next (0, 1, 2), or -1 when done.
export function doingTourCurrentStep(state: DoingTourState): number {
  if (!state.taskDone) return 0;
  if (!state.decisionDone) return 1;
  if (!state.checkinDone) return 2;
  return -1;
}
