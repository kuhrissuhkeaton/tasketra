import { describe, it, expect } from "vitest";
import { projectReason, sortByHealth } from "../lib/projectReason";
import type { PortfolioProjectSummary } from "../lib/api";

const base: PortfolioProjectSummary = {
  id: "a", name: "A", stage: "execute", nextUp: null, escalations: [], totalTasks: 4, doneTasks: 1, overdueTasks: 0,
  openRisks: 0, highRisks: 0, openIssues: 0, highIssues: 0, cpi: null, spi: null, objectivesCount: 0, avgObjectiveProgress: null, health: "on_track",
};

describe("projectReason", () => {
  it("names the two most important problems, most urgent first", () => {
    expect(projectReason({ ...base, overdueTasks: 3, highIssues: 2, highRisks: 1 })).toBe("3 tasks overdue, 2 high or critical issues");
    expect(projectReason({ ...base, escalations: ["Budget"], overdueTasks: 1 })).toBe("Needs escalation, 1 task overdue");
  });
  it("uses singular wording for one", () => {
    expect(projectReason({ ...base, highRisks: 1 }, 1)).toBe("1 high risk, 1 decision waiting");
  });
  it("falls back to the health verdict when no specific signal exists", () => {
    expect(projectReason({ ...base, health: "at_risk" })).toBe("Health score is at risk");
    expect(projectReason({ ...base, health: "off_track" })).toMatch(/^Off track/);
  });
  it("says something calm for a healthy project", () => {
    expect(projectReason({ ...base, nextUp: "Ship it" })).toBe("Next up: Ship it");
    expect(projectReason(base)).toBe("Nothing flagged");
    expect(projectReason({ ...base, totalTasks: 0 })).toBe("No tasks yet");
  });
});

describe("sortByHealth", () => {
  it("sorts worst first, then most overdue, then name, without mutating", () => {
    const items = [
      { name: "Z", health: "on_track" as const, overdueTasks: 0 },
      { name: "B", health: "at_risk" as const, overdueTasks: 1 },
      { name: "A", health: "at_risk" as const, overdueTasks: 4 },
      { name: "C", health: "off_track" as const, overdueTasks: 0 },
    ];
    const copy = [...items];
    expect(sortByHealth(items).map((i) => i.name)).toEqual(["C", "A", "B", "Z"]);
    expect(items).toEqual(copy);
  });
});
