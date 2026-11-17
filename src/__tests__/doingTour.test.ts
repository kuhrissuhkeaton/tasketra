// @vitest-environment jsdom
//
// v161 (F-09): the doing tour's latch logic. A step completes only when the
// project's live counts rise above the baseline captured on first sight --
// seeded/template content is inside the baseline and never ticks a step.
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyCounts,
  dismissDoingTour,
  doingTourComplete,
  doingTourCurrentStep,
  readDoingTour,
  startDoingTour,
  type DoingTourState,
} from "../lib/doingTour";

const USER = "u1";
const PROJECT = "p1";

function freshState(): DoingTourState {
  startDoingTour(USER, PROJECT);
  return readDoingTour(USER, PROJECT)!;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("doing tour storage", () => {
  it("starts a record for the project and reads it back", () => {
    const state = freshState();
    expect(state).toMatchObject({ projectId: PROJECT, baseline: null, taskDone: false, dismissed: false });
  });

  it("reads nothing for a different project or user", () => {
    freshState();
    expect(readDoingTour(USER, "other-project")).toBeNull();
    expect(readDoingTour("someone-else", PROJECT)).toBeNull();
  });

  it("starting twice keeps the original record", () => {
    const first = freshState();
    startDoingTour(USER, PROJECT);
    expect(readDoingTour(USER, PROJECT)).toEqual(first);
  });

  it("dismissal persists", () => {
    freshState();
    dismissDoingTour(USER, PROJECT);
    expect(readDoingTour(USER, PROJECT)?.dismissed).toBe(true);
  });
});

describe("applyCounts", () => {
  it("sets the baseline on first sight and completes nothing", () => {
    const next = applyCounts(freshState(), { tasks: 7, decisions: 0, checkins: 0 });
    expect(next.baseline).toEqual({ tasks: 7, decisions: 0, checkins: 0 });
    expect(next.taskDone).toBe(false);
    expect(doingTourCurrentStep(next)).toBe(0);
  });

  it("seeded content alone never completes a step", () => {
    let state = applyCounts(freshState(), { tasks: 7, decisions: 0, checkins: 0 });
    state = applyCounts(state, { tasks: 7, decisions: 0, checkins: 0 });
    expect(state.taskDone).toBe(false);
    expect(state.decisionDone).toBe(false);
    expect(state.checkinDone).toBe(false);
  });

  it("a real action above the baseline latches its step, and it stays latched", () => {
    let state = applyCounts(freshState(), { tasks: 7, decisions: 0, checkins: 0 });
    state = applyCounts(state, { tasks: 8, decisions: 0, checkins: 0 });
    expect(state.taskDone).toBe(true);
    // The user deletes the task again: the step stays done -- they did it.
    state = applyCounts(state, { tasks: 7, decisions: 0, checkins: 0 });
    expect(state.taskDone).toBe(true);
  });

  it("returns the same object when nothing changed", () => {
    const state = applyCounts(freshState(), { tasks: 3, decisions: 1, checkins: 0 });
    expect(applyCounts(state, { tasks: 3, decisions: 1, checkins: 0 })).toBe(state);
  });

  it("walks the current step in order and completes", () => {
    let state = applyCounts(freshState(), { tasks: 0, decisions: 0, checkins: 0 });
    state = applyCounts(state, { tasks: 1, decisions: 0, checkins: 0 });
    expect(doingTourCurrentStep(state)).toBe(1);
    state = applyCounts(state, { tasks: 1, decisions: 1, checkins: 0 });
    expect(doingTourCurrentStep(state)).toBe(2);
    state = applyCounts(state, { tasks: 1, decisions: 1, checkins: 1 });
    expect(doingTourCurrentStep(state)).toBe(-1);
    expect(doingTourComplete(state)).toBe(true);
  });

  it("steps can complete out of order", () => {
    let state = applyCounts(freshState(), { tasks: 0, decisions: 0, checkins: 0 });
    state = applyCounts(state, { tasks: 0, decisions: 0, checkins: 1 });
    expect(state.checkinDone).toBe(true);
    expect(doingTourCurrentStep(state)).toBe(0);
    expect(doingTourComplete(state)).toBe(false);
  });
});
