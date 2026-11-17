// v161 (F-07): the getting-started checklist on Today -- five firsts that
// mark an account as set up: first project, first task, first decision
// sent, first check-in posted, first teammate invited.
//
// Each item is "live signal OR latch". The live signals come from data
// Today already loads (portfolio summaries, the weekly sync's asks), so a
// step the user completed anywhere ticks here without any bookkeeping.
// The latch exists for steps whose live signal can disappear again: an
// answered decision leaves the asks list, a removed member leaves the
// member list -- the user still DID the thing, and the checklist should
// not untick it. The doing tour (doingTour.ts) writes the same latches
// when its steps complete, so the two guides never disagree.
//
// Storage is the per-user browser-storage pattern (firstRun.ts precedent;
// there is no per-user server settings store). Dismissal is stored here
// too, and the card stays resumable from a slim progress line on Today.

export type GettingStartedState = {
  task: boolean;
  decision: boolean;
  checkin: boolean;
  invite: boolean;
  dismissed: boolean;
};

const KEY_PREFIX = "tasketra:getting-started:";

const EMPTY: GettingStartedState = { task: false, decision: false, checkin: false, invite: false, dismissed: false };

export function readGettingStarted(userId: string): GettingStartedState {
  try {
    const raw = window.localStorage.getItem(`${KEY_PREFIX}${userId}`);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<GettingStartedState>;
    return {
      task: !!parsed.task,
      decision: !!parsed.decision,
      checkin: !!parsed.checkin,
      invite: !!parsed.invite,
      dismissed: !!parsed.dismissed,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function writeGettingStarted(userId: string, state: GettingStartedState): void {
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(state));
  } catch {
    // storage unavailable -- the checklist falls back to live signals only.
  }
}

export type GettingStartedLatch = "task" | "decision" | "checkin" | "invite";

// Latch one step done. Returns true when the stored state changed.
export function latchGettingStarted(userId: string, step: GettingStartedLatch): boolean {
  const state = readGettingStarted(userId);
  if (state[step]) return false;
  writeGettingStarted(userId, { ...state, [step]: true });
  return true;
}

export function setGettingStartedDismissed(userId: string, dismissed: boolean): void {
  writeGettingStarted(userId, { ...readGettingStarted(userId), dismissed });
}

// The live signals Today can see, in one shape so the item computation is
// a pure, unit-tested function.
export type GettingStartedSignals = {
  hasProject: boolean;
  anyTasks: boolean;
  anyOpenDecision: boolean;
  anyCheckin: boolean;
  hasTeammate: boolean;
};

export type GettingStartedItems = {
  project: boolean;
  task: boolean;
  decision: boolean;
  checkin: boolean;
  invite: boolean;
  doneCount: number;
  complete: boolean;
};

export function gettingStartedItems(state: GettingStartedState, signals: GettingStartedSignals): GettingStartedItems {
  const items = {
    project: signals.hasProject,
    task: state.task || signals.anyTasks,
    decision: state.decision || signals.anyOpenDecision,
    checkin: state.checkin || signals.anyCheckin,
    invite: state.invite || signals.hasTeammate,
  };
  const doneCount = Object.values(items).filter(Boolean).length;
  return { ...items, doneCount, complete: doneCount === 5 };
}
