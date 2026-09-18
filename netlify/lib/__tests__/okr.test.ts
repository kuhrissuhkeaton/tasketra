import { describe, it, expect } from "vitest";
import { keyResultProgress, objectiveProgress } from "../okr.ts";

describe("keyResultProgress", () => {
  it("computes a simple rising-target percent midway", () => {
    expect(keyResultProgress({ metric_type: "number", start_value: 0, current_value: 250, target_value: 500 })).toBe(50);
  });

  it("computes a falling-target metric the same direction-agnostic way", () => {
    // "Reduce churn from 10% to 2%", currently at 6% -- halfway there.
    expect(keyResultProgress({ metric_type: "percent", start_value: 10, current_value: 6, target_value: 2 })).toBe(50);
  });

  it("clamps overshoot at 100 instead of reporting more than done", () => {
    expect(keyResultProgress({ metric_type: "number", start_value: 0, current_value: 700, target_value: 500 })).toBe(100);
  });

  it("clamps undershoot (moved the wrong way) at 0", () => {
    expect(keyResultProgress({ metric_type: "number", start_value: 100, current_value: 50, target_value: 200 })).toBe(0);
  });

  it("treats boolean key results as 0 or 100, nothing between", () => {
    expect(keyResultProgress({ metric_type: "boolean", start_value: 0, current_value: 0, target_value: 1 })).toBe(0);
    expect(keyResultProgress({ metric_type: "boolean", start_value: 0, current_value: 1, target_value: 1 })).toBe(100);
  });

  it("doesn't divide by zero when start equals target", () => {
    expect(keyResultProgress({ metric_type: "number", start_value: 50, current_value: 50, target_value: 50 })).toBe(100);
    expect(keyResultProgress({ metric_type: "number", start_value: 50, current_value: 10, target_value: 50 })).toBe(0);
  });
});

describe("objectiveProgress", () => {
  it("averages progress across all of an objective's key results", () => {
    const progress = objectiveProgress([
      { metric_type: "number", start_value: 0, current_value: 50, target_value: 100 },
      { metric_type: "number", start_value: 0, current_value: 100, target_value: 100 },
    ]);
    expect(progress).toBe(75);
  });

  it("returns null (not zero) for an objective with no key results yet", () => {
    expect(objectiveProgress([])).toBeNull();
  });
});
