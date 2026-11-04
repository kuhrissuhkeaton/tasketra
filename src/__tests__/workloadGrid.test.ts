// Unit tests for the Workload grid bucketing (v147). Fixed anchors:
// windowStart 2026-11-01 is a Sunday; "today" is Wednesday 2026-11-04.
import { describe, it, expect } from "vitest";
import { buildWorkloadGrid, weekIndexOf } from "../lib/workloadGrid";
import type { WorkloadMilestone, WorkloadTask } from "../lib/api";

const WINDOW_START = "2026-11-01";
const TODAY = "2026-11-04";

function task(owner: string, dueDate: string | null, projectId = "p1", projectHealth: WorkloadTask["projectHealth"] = "on_track"): WorkloadTask {
  return { owner, dueDate, projectId, projectName: `Project ${projectId}`, projectHealth };
}

function milestone(date: string, title = "Milestone"): WorkloadMilestone {
  return { date, title, projectName: "Project p1" };
}

describe("buildWorkloadGrid bucketing", () => {
  it("puts a task due today in this week's bucket, not in overdue", () => {
    const { rows } = buildWorkloadGrid([task("Alice", TODAY)], [], WINDOW_START, TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].overdue).toBe(0);
    expect(rows[0].weeks).toEqual([1, 0, 0, 0]);
    expect(rows[0].open).toBe(1);
  });

  it("counts a task due yesterday as overdue only -- never double-counted in its week", () => {
    const { rows } = buildWorkloadGrid([task("Alice", "2026-11-03")], [], WINDOW_START, TODAY);
    expect(rows[0].overdue).toBe(1);
    expect(rows[0].weeks).toEqual([0, 0, 0, 0]);
    expect(rows[0].open).toBe(1);
  });

  it("counts a task due before the window as overdue", () => {
    const { rows } = buildWorkloadGrid([task("Alice", "2026-10-31")], [], WINDOW_START, TODAY);
    expect(rows[0].overdue).toBe(1);
    expect(rows[0].weeks).toEqual([0, 0, 0, 0]);
  });

  it("counts a task with no due date toward Open only", () => {
    const { rows } = buildWorkloadGrid([task("Alice", null)], [], WINDOW_START, TODAY);
    expect(rows[0]).toMatchObject({ overdue: 0, weeks: [0, 0, 0, 0], open: 1 });
  });

  it("buckets future due dates into their window weeks, and drops dates past the window from the buckets", () => {
    const { rows } = buildWorkloadGrid(
      [
        task("Alice", "2026-11-08"), // Sunday of week 1
        task("Alice", "2026-11-28"), // Saturday of week 3
        task("Alice", "2026-11-29"), // beyond the window: Open only
        task("Alice", "2026-12-25"),
      ],
      [],
      WINDOW_START,
      TODAY,
    );
    expect(rows[0].weeks).toEqual([0, 1, 0, 1]);
    expect(rows[0].overdue).toBe(0);
    expect(rows[0].open).toBe(4);
  });

  it("derives the four Sunday-start week starts from windowStart", () => {
    const { weekStarts } = buildWorkloadGrid([], [], WINDOW_START, TODAY);
    expect(weekStarts).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22"]);
  });
});

describe("buildWorkloadGrid at-risk projects", () => {
  it("counts distinct at-risk/off-track projects per owner, not tasks", () => {
    const { rows } = buildWorkloadGrid(
      [
        task("Alice", null, "p1", "at_risk"),
        task("Alice", TODAY, "p1", "at_risk"),
        task("Alice", null, "p2", "off_track"),
        task("Alice", null, "p3", "on_track"),
        task("Bob", null, "p1", "at_risk"),
      ],
      [],
      WINDOW_START,
      TODAY,
    );
    const alice = rows.find((r) => r.owner === "Alice")!;
    const bob = rows.find((r) => r.owner === "Bob")!;
    expect(alice.atRiskProjects).toBe(2);
    expect(bob.atRiskProjects).toBe(1);
  });
});

describe("buildWorkloadGrid sorting", () => {
  it("sorts by overdue, then open, then name -- with Unassigned always last", () => {
    const rows = buildWorkloadGrid(
      [
        // Xenia: overdue 2, open 2
        task("Xenia", "2026-11-02"), task("Xenia", "2026-11-03"),
        // Yara: overdue 2, open 5 (same overdue as Xenia, more open -> first)
        task("Yara", "2026-11-02"), task("Yara", "2026-11-03"),
        task("Yara", null), task("Yara", null), task("Yara", null),
        // Zack: no overdue but the most open work -> after both
        ...Array.from({ length: 9 }, () => task("Zack", null)),
        // Unassigned: the heaviest of all, still last
        ...Array.from({ length: 10 }, () => task("Unassigned", "2026-10-01")),
      ],
      [],
      WINDOW_START,
      TODAY,
    ).rows;
    expect(rows.map((r) => r.owner)).toEqual(["Yara", "Xenia", "Zack", "Unassigned"]);
  });

  it("breaks full ties by owner name A-Z", () => {
    const rows = buildWorkloadGrid(
      [task("Beth", null), task("Anna", null)],
      [],
      WINDOW_START,
      TODAY,
    ).rows;
    expect(rows.map((r) => r.owner)).toEqual(["Anna", "Beth"]);
  });
});

describe("buildWorkloadGrid milestones", () => {
  it("groups milestones by window week and drops any outside the window", () => {
    const { milestoneWeeks } = buildWorkloadGrid(
      [],
      [
        milestone("2026-11-01", "Week 0"),
        milestone("2026-11-07", "Also week 0"),
        milestone("2026-11-16", "Week 2"),
        milestone("2026-11-28", "Week 3"),
        milestone("2026-10-31", "Before the window"),
        milestone("2026-11-29", "After the window"),
      ],
      WINDOW_START,
      TODAY,
    );
    expect(milestoneWeeks.map((w) => w.map((m) => m.title))).toEqual([
      ["Week 0", "Also week 0"],
      [],
      ["Week 2"],
      ["Week 3"],
    ]);
  });

  it("weekIndexOf respects the window edges", () => {
    expect(weekIndexOf("2026-11-01", WINDOW_START)).toBe(0);
    expect(weekIndexOf("2026-11-28", WINDOW_START)).toBe(3);
    expect(weekIndexOf("2026-11-29", WINDOW_START)).toBe(-1);
    expect(weekIndexOf("2026-10-31", WINDOW_START)).toBe(-1);
  });
});
