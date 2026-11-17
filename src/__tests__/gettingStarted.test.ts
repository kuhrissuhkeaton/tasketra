// @vitest-environment jsdom
//
// v161 (F-07): the Today getting-started checklist's item computation --
// every item is "live signal OR latch", so a step ticks from real actions
// anywhere and never unticks when its evidence scrolls away.
import { describe, it, expect, beforeEach } from "vitest";
import {
  gettingStartedItems,
  latchGettingStarted,
  readGettingStarted,
  setGettingStartedDismissed,
  type GettingStartedSignals,
} from "../lib/gettingStarted";

const USER = "u1";
const NO_SIGNALS: GettingStartedSignals = {
  hasProject: false,
  anyTasks: false,
  anyOpenDecision: false,
  anyCheckin: false,
  hasTeammate: false,
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("getting started items", () => {
  it("starts empty: nothing done, not complete", () => {
    const items = gettingStartedItems(readGettingStarted(USER), NO_SIGNALS);
    expect(items.doneCount).toBe(0);
    expect(items.complete).toBe(false);
  });

  it("live signals alone tick their items", () => {
    const items = gettingStartedItems(readGettingStarted(USER), {
      hasProject: true,
      anyTasks: true,
      anyOpenDecision: true,
      anyCheckin: true,
      hasTeammate: true,
    });
    expect(items.doneCount).toBe(5);
    expect(items.complete).toBe(true);
  });

  it("a latch keeps an item ticked after its signal disappears", () => {
    latchGettingStarted(USER, "decision");
    const items = gettingStartedItems(readGettingStarted(USER), NO_SIGNALS);
    expect(items.decision).toBe(true);
    expect(items.doneCount).toBe(1);
  });

  it("the project item comes from the signal alone (no latch exists for it)", () => {
    latchGettingStarted(USER, "task");
    latchGettingStarted(USER, "decision");
    latchGettingStarted(USER, "checkin");
    latchGettingStarted(USER, "invite");
    const items = gettingStartedItems(readGettingStarted(USER), NO_SIGNALS);
    expect(items.project).toBe(false);
    expect(items.complete).toBe(false);
  });
});

describe("getting started storage", () => {
  it("latching is idempotent and reports change honestly", () => {
    expect(latchGettingStarted(USER, "task")).toBe(true);
    expect(latchGettingStarted(USER, "task")).toBe(false);
    expect(readGettingStarted(USER).task).toBe(true);
  });

  it("dismissal persists and can be undone (resumable)", () => {
    setGettingStartedDismissed(USER, true);
    expect(readGettingStarted(USER).dismissed).toBe(true);
    setGettingStartedDismissed(USER, false);
    expect(readGettingStarted(USER).dismissed).toBe(false);
  });

  it("records are per-user", () => {
    latchGettingStarted(USER, "invite");
    expect(readGettingStarted("someone-else").invite).toBe(false);
  });
});
