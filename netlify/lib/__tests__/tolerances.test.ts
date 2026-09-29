import { describe, it, expect } from "vitest";
import { evaluateTolerances, sanitizeTolerances } from "../tolerances.ts";
import { monitorBand, type StageCounts } from "../stageChecklist.ts";

const OK = { cpi: 1, spi: 1, overdueTasks: 0, highRisks: 0 };

describe("sanitizeTolerances", () => {
  it("keeps sensible numbers and drops blanks, junk and unknown keys", () => {
    expect(sanitizeTolerances({ cpi_min: "0.9", spi_min: "", overdue_max: 3.7, high_risks_max: null, nope: 1 })).toEqual({ cpi_min: 0.9, overdue_max: 3 });
  });
  it("rejects out-of-range values", () => {
    expect(sanitizeTolerances({ cpi_min: 0, spi_min: 9, overdue_max: -1, high_risks_max: 5000 })).toEqual({});
  });
  it("allows zero as a count limit", () => {
    expect(sanitizeTolerances({ overdue_max: 0 })).toEqual({ overdue_max: 0 });
  });
  it("rejects non-objects", () => {
    expect(sanitizeTolerances(null)).toBeNull();
    expect(sanitizeTolerances("x")).toBeNull();
    expect(sanitizeTolerances([])).toBeNull();
  });
});

describe("evaluateTolerances", () => {
  it("flags nothing when no limits are set", () => {
    expect(evaluateTolerances({}, { cpi: 0.1, spi: 0.1, overdueTasks: 50, highRisks: 50 })).toEqual([]);
    expect(evaluateTolerances(undefined, OK)).toEqual([]);
  });
  it("flags an index below its limit, not one at the limit", () => {
    expect(evaluateTolerances({ cpi_min: 0.9 }, { ...OK, cpi: 0.82 })).toEqual(["Cost index 0.82 is below your 0.9 limit"]);
    expect(evaluateTolerances({ cpi_min: 0.9 }, { ...OK, cpi: 0.9 })).toEqual([]);
    expect(evaluateTolerances({ spi_min: 0.8 }, { ...OK, spi: 0.5 })).toEqual(["Schedule index 0.50 is below your 0.8 limit"]);
  });
  it("ignores an index limit when there is no index yet", () => {
    expect(evaluateTolerances({ cpi_min: 0.9, spi_min: 0.9 }, { ...OK, cpi: null, spi: null })).toEqual([]);
  });
  it("flags counts only when they go over the limit", () => {
    expect(evaluateTolerances({ overdue_max: 3 }, { ...OK, overdueTasks: 3 })).toEqual([]);
    expect(evaluateTolerances({ overdue_max: 3 }, { ...OK, overdueTasks: 4 })).toEqual(["4 overdue tasks (limit 3)"]);
    expect(evaluateTolerances({ high_risks_max: 0 }, { ...OK, highRisks: 1 })).toEqual(["1 high risk (limit 0)"]);
  });
  it("lists every breach", () => {
    expect(evaluateTolerances({ cpi_min: 0.9, overdue_max: 1 }, { ...OK, cpi: 0.5, overdueTasks: 2 })).toHaveLength(2);
  });
});

describe("monitorBand with escalations", () => {
  const C = { tasks: 0, datedTasks: 0, stakeholders: 0, risks: 0, hasBudgetBaseline: false, blockedTasks: 0, openChangeRequests: 0, openRisks: 0, staleRisks: 0, openIssues: 0, cpi: null, statusUpdatesLast7Days: 0, closureChecked: 0, charterWritten: false, baselineLocked: false } as StageCounts;
  it("turns red with the reasons, in any stage", () => {
    for (const stage of ["initiate", "plan", "execute", "close"] as const) {
      const b = monitorBand(stage, C, ["4 overdue tasks (limit 3)", "1 high risk (limit 0)"]);
      expect(b.state).toBe("escalate");
      expect(b.message).toBe("Needs escalation: 4 overdue tasks (limit 3). 1 high risk (limit 0)");
    }
  });
  it("is unchanged with no escalations", () => {
    expect(monitorBand("execute", C, []).state).toBe("quiet");
  });
});
