import { describe, it, expect } from "vitest";
import { statusEvidence, type StatusEvidenceInput } from "../lib/statusEvidence";

const E = (o: Partial<StatusEvidenceInput>): StatusEvidenceInput => ({
  overdueTasks: null,
  blockedTasks: null,
  openHighIssues: null,
  openHighRisks: null,
  daysSinceLastUpdate: null,
  ...o,
});

describe("statusEvidence", () => {
  it("claims nothing when every count is unknown", () => {
    expect(statusEvidence(E({}))).toEqual([]);
  });

  it("claims nothing when every known count is zero", () => {
    expect(statusEvidence(E({ overdueTasks: 0, blockedTasks: 0, openHighIssues: 0, openHighRisks: 0, daysSinceLastUpdate: 0 }))).toEqual([]);
  });

  it("builds the spec's example line, in order", () => {
    expect(statusEvidence(E({ overdueTasks: 2, blockedTasks: 1, daysSinceLastUpdate: 9 }))).toEqual([
      "2 tasks overdue",
      "1 blocked",
      "no update in 9 days",
    ]);
  });

  it("uses the singular for a count of one", () => {
    expect(statusEvidence(E({ overdueTasks: 1, openHighIssues: 1, openHighRisks: 1, daysSinceLastUpdate: 1 }))).toEqual([
      "1 task overdue",
      "1 high or critical issue",
      "1 high risk",
      "no update in 1 day",
    ]);
  });

  it("pluralizes blocked counts without a noun change", () => {
    expect(statusEvidence(E({ blockedTasks: 3 }))).toEqual(["3 blocked"]);
  });

  it("omits only the unknown counts and keeps the known ones", () => {
    expect(statusEvidence(E({ openHighIssues: 2, daysSinceLastUpdate: 14 }))).toEqual([
      "2 high or critical issues",
      "no update in 14 days",
    ]);
  });

  it("omits the no-update phrase when the last update was today or is unknown", () => {
    expect(statusEvidence(E({ daysSinceLastUpdate: 0 }))).toEqual([]);
    expect(statusEvidence(E({ overdueTasks: 1, daysSinceLastUpdate: null }))).toEqual(["1 task overdue"]);
  });
});
