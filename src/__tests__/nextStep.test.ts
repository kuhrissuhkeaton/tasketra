import { describe, expect, it } from "vitest";
import { computeNextStep, type NextStepInput } from "../lib/nextStep";

const NOW = new Date("2026-11-06T12:00:00");

function input(overrides: Partial<NextStepInput> = {}): NextStepInput {
  return {
    blockedTasks: [],
    overdueTasks: [],
    awaitingDecisions: [],
    urgentIssues: [],
    urgentRisks: [],
    staleTasks: [],
    taskCount: 3,
    datedTaskCount: 1,
    stakeholderCount: 1,
    daysSinceCheckIn: 2,
    ...overrides,
  };
}

describe("computeNextStep", () => {
  it("leads a brand-new project to its first task", () => {
    const step = computeNextStep(input({ taskCount: 0, datedTaskCount: 0, stakeholderCount: 0, daysSinceCheckIn: null }), NOW);
    expect(step.kind).toBe("first-task");
    expect(step.action).toMatchObject({ type: "tab", tab: "tasks" });
  });

  it("asks for a due date once tasks exist but none are dated", () => {
    const step = computeNextStep(input({ datedTaskCount: 0 }), NOW);
    expect(step.kind).toBe("first-date");
  });

  it("asks for a stakeholder once tasks are dated", () => {
    const step = computeNextStep(input({ stakeholderCount: 0 }), NOW);
    expect(step.kind).toBe("first-stakeholder");
    expect(step.action).toMatchObject({ tab: "stakeholders" });
  });

  it("asks for a first check-in when there has never been one", () => {
    const step = computeNextStep(input({ daysSinceCheckIn: null }), NOW);
    expect(step.kind).toBe("checkin");
    expect(step.title).toContain("first check-in");
    expect(step.action).toMatchObject({ type: "checkin" });
  });

  it("asks for a weekly check-in at 7+ days", () => {
    const step = computeNextStep(input({ daysSinceCheckIn: 9 }), NOW);
    expect(step.kind).toBe("checkin");
    expect(step.meta).toContain("9 days ago");
  });

  it("puts a blocked task ahead of setup steps", () => {
    const step = computeNextStep(input({
      taskCount: 0, datedTaskCount: 0, stakeholderCount: 0, daysSinceCheckIn: null,
      blockedTasks: [{ id: "t1", title: "Venue contract", updated_at: "2026-11-03T12:00:00Z" }],
    }), NOW);
    expect(step.kind).toBe("blocked");
    expect(step.meta).toContain("3 days");
    expect(step.action).toMatchObject({ tab: "tasks", highlightId: "t1" });
  });

  it("puts an overdue task ahead of a waiting decision", () => {
    const step = computeNextStep(input({
      overdueTasks: [{ id: "t2", title: "Send invites", due_date: "2026-11-04" }],
      awaitingDecisions: [{ id: "d1", title: "Pick a date", created_at: "2026-11-01T12:00:00Z", recipients: ["Sam"] }],
    }), NOW);
    expect(step.kind).toBe("overdue");
    expect(step.meta).toContain("2 days");
  });

  it("names who a decision is waiting on", () => {
    const step = computeNextStep(input({
      awaitingDecisions: [{ id: "d1", title: "Pick a date", created_at: "2026-11-05T12:00:00Z", recipients: ["Test Stakeholder"] }],
    }), NOW);
    expect(step.kind).toBe("awaiting");
    expect(step.meta).toContain("Test Stakeholder");
  });

  it("surfaces staleness only after the check-in is current", () => {
    const stale = [{ id: "t3", title: "Old task", updated_at: "2026-11-01T12:00:00Z" }];
    expect(computeNextStep(input({ staleTasks: stale, daysSinceCheckIn: 8 }), NOW).kind).toBe("checkin");
    expect(computeNextStep(input({ staleTasks: stale, daysSinceCheckIn: 1 }), NOW).kind).toBe("stale");
  });

  it("goes quiet when everything is done and the check-in is fresh", () => {
    const step = computeNextStep(input({ daysSinceCheckIn: 2 }), NOW);
    expect(step.kind).toBe("quiet");
    expect(step.quiet).toBe(true);
    expect(step.action).toBeNull();
    expect(step.meta).toContain("5 days");
  });
});
