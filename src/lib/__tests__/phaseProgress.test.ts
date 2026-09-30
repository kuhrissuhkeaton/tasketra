import { describe, it, expect } from "vitest";
import { phaseProgress } from "../phaseProgress";

describe("phaseProgress", () => {
  it("computes done / total and a rounded percentage for a phase", () => {
    expect(phaseProgress({ type: "phase", task_total: 8, task_done: 3 })).toEqual({ total: 8, done: 3, pct: 38 });
  });

  it("reports 100% when every linked task is done", () => {
    expect(phaseProgress({ type: "phase", task_total: 4, task_done: 4 })?.pct).toBe(100);
  });

  it("reports 0% (not null) when tasks are linked but none are done", () => {
    expect(phaseProgress({ type: "phase", task_total: 5, task_done: 0 })).toEqual({ total: 5, done: 0, pct: 0 });
  });

  it("returns null for a phase with no linked tasks, so no fake 0% is shown", () => {
    expect(phaseProgress({ type: "phase", task_total: 0, task_done: 0 })).toBeNull();
    expect(phaseProgress({ type: "phase" })).toBeNull();
  });

  it("returns null for items that are not phases, even if counts are present", () => {
    expect(phaseProgress({ type: "milestone", task_total: 3, task_done: 1 })).toBeNull();
  });

  it("never reports more done than total", () => {
    expect(phaseProgress({ type: "phase", task_total: 2, task_done: 5 })).toEqual({ total: 2, done: 2, pct: 100 });
  });
});
