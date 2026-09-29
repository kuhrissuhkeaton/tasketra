import { describe, it, expect } from "vitest";
import { hiddenTabIds, hiddenTabLabels, isTabHidden, primaryTabOrder, defaultTasksView } from "../projectView.ts";

describe("isTabHidden", () => {
  it("hides nothing in Full", () => {
    expect(hiddenTabIds("full")).toEqual([]);
    expect(isTabHidden("quality", "full", false)).toBe(false);
  });

  it("hides quality, compliance and comms plan in Standard", () => {
    expect(hiddenTabLabels("standard")).toEqual(["Quality", "Compliance", "Comms plan"]);
    expect(isTabHidden("quality", "standard", false)).toBe(true);
    expect(isTabHidden("procurement", "standard", false)).toBe(false);
  });

  it("hides the most in Light, including Budget and Meetings", () => {
    expect(isTabHidden("budget", "light", false)).toBe(true);
    expect(isTabHidden("meetings", "light", false)).toBe(true);
    expect(isTabHidden("procurement", "light", false)).toBe(true);
  });

  it("never hides the essentials at any size", () => {
    for (const size of ["light", "standard", "full"] as const) {
      for (const id of ["home", "tasks", "roadmap", "issues", "risks", "stakeholders", "decisions", "team", "report", "closure", "documents", "trash"]) {
        expect(isTabHidden(id, size, false)).toBe(false);
      }
    }
  });

  it("shows everything once show-all is on", () => {
    expect(isTabHidden("budget", "light", true)).toBe(false);
  });
});

describe("primaryTabOrder", () => {
  it("keeps today's order for hybrid and predictive", () => {
    expect(primaryTabOrder("hybrid", "full", false)).toEqual(["home", "roadmap", "tasks", "budget", "meetings"]);
    expect(primaryTabOrder("predictive", "full", false)).toEqual(["home", "roadmap", "tasks", "budget", "meetings"]);
  });

  it("puts tasks before the roadmap for agile", () => {
    expect(primaryTabOrder("agile", "standard", false)).toEqual(["home", "tasks", "roadmap", "meetings", "budget"]);
  });

  it("drops budget and meetings for Light unless show-all is on", () => {
    expect(primaryTabOrder("hybrid", "light", false)).toEqual(["home", "roadmap", "tasks"]);
    expect(primaryTabOrder("hybrid", "light", true)).toEqual(["home", "roadmap", "tasks", "budget", "meetings"]);
  });
});

describe("defaultTasksView", () => {
  it("opens the board for agile and the list otherwise", () => {
    expect(defaultTasksView("agile")).toBe("board");
    expect(defaultTasksView("hybrid")).toBe("list");
    expect(defaultTasksView("predictive")).toBe("list");
  });
});
