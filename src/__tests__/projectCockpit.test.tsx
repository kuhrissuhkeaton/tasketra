// @vitest-environment jsdom
//
// v165 (Project Cockpit): the single-project Overview's visual lead. Pins
// the plan's load-bearing behaviors: gauges carrying their x-of-y words,
// completion read from the budget endpoint's taskStats, the time window
// mirroring the portfolio math, the work breakdown grouped by top-level
// WBS phase (status groups for a flat list) with its table, the whole-
// project variance bar, the forecast at finish shown only when the EVM
// metrics exist (v158 rule), spend by month with running totals, and the
// Advanced toggle (default off, persisted) revealing SPI/CPI in small
// print under plain words. Empty states are sentences with the creating
// action, never a chart from no data.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { BudgetData, RoadmapItem, Task } from "../lib/api";

const calls = { getBudget: vi.fn(), listTasks: vi.fn(), listRoadmapItems: vi.fn() };
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getBudget: () => calls.getBudget(),
      listTasks: () => calls.listTasks(),
      listRoadmapItems: () => calls.listRoadmapItems(),
    },
  };
});

import { ProjectCockpit, workGroups, plannedWindow, spendByMonth } from "../components/ProjectCockpit";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  Object.values(calls).forEach((c) => c.mockReset());
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const text = () => container.textContent ?? "";

let seq = 0;
function task(partial: Partial<Task>): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    description: null,
    status: "not_started",
    owner_name: null,
    start_date: null,
    due_date: null,
    stakeholder_id: null,
    parent_task_id: null,
    roadmap_item_id: null,
    ...partial,
  };
}

function roadmapItem(partial: Partial<RoadmapItem>): RoadmapItem {
  seq += 1;
  return {
    id: `r${seq}`,
    type: "phase",
    title: `Phase ${seq}`,
    description: null,
    swimlane: "",
    start_date: null,
    end_date: null,
    status: "not_started",
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function budget(partial: Partial<BudgetData>): BudgetData {
  return {
    budgetAtCompletion: null,
    contingencyReserve: null,
    costEntries: [],
    taskStats: { totalTasks: 0, doneTasks: 0, dueTasks: 0 },
    metrics: { pvPercent: null, evPercent: null, ac: 0, pv: null, ev: null, cv: null, sv: null, cpi: null, spi: null, eac: null, vac: null, tcpi: null },
    ...partial,
  };
}

/** A WBS project: two phase parents, six children, 3 done of 8 total. */
function wbsTasks(): Task[] {
  const phaseA = task({ title: "1.0 Design", status: "in_progress" });
  const phaseB = task({ title: "2.0 Build", status: "not_started" });
  return [
    phaseA,
    task({ title: "Mockups", status: "done", parent_task_id: phaseA.id }),
    task({ title: "Reviews", status: "done", parent_task_id: phaseA.id }),
    task({ title: "Sign-off", status: "in_progress", parent_task_id: phaseA.id }),
    phaseB,
    task({ title: "Foundations", status: "done", parent_task_id: phaseB.id }),
    task({ title: "Framing", status: "not_started", parent_task_id: phaseB.id }),
    task({ title: "Roofing", status: "blocked", parent_task_id: phaseB.id }),
  ];
}

async function render() {
  await act(async () => {
    root.render(<ProjectCockpit projectId="p1" onOpenTab={() => {}} />);
  });
  await flush();
}

describe("helpers", () => {
  it("groups tasks by their top-level WBS ancestor, counting the phase task itself", () => {
    const { groups, byStatus } = workGroups(wbsTasks());
    expect(byStatus).toBe(false);
    expect(groups).toEqual([
      { label: "1.0 Design", total: 4, done: 2 },
      { label: "2.0 Build", total: 4, done: 1 },
    ]);
  });

  it("walks more than one level up to the root", () => {
    const rootTask = task({ title: "Phase" });
    const mid = task({ title: "Mid", parent_task_id: rootTask.id });
    const leaf = task({ title: "Leaf", status: "done", parent_task_id: mid.id });
    const { groups } = workGroups([rootTask, mid, leaf]);
    expect(groups).toEqual([{ label: "Phase", total: 3, done: 1 }]);
  });

  it("groups by WBS numbers in the titles when the list carries them (v165.1)", () => {
    const numbered = [
      task({ title: "1.1 Initiation and funding", status: "done" }),
      task({ title: "1.2 Planning and controls", status: "in_progress" }),
      task({ title: "2.1 Schematic design", status: "done" }),
      task({ title: "2.2 Design development", status: "done" }),
      task({ title: "2.3 Construction documents", status: "not_started" }),
      task({ title: "8 Commissioning and inspections", status: "not_started" }),
      task({ title: "9.1 Punch list and substantial completion", status: "not_started" }),
      task({ title: "Loose ends call", status: "done" }),
    ];
    const { groups, byStatus } = workGroups(numbered);
    expect(byStatus).toBe(false);
    // Plan order (numeric), the bare task names its own phase, and the
    // one unnumbered task lands in a final group so nothing is lost.
    expect(groups).toEqual([
      { label: "Phase 1", total: 2, done: 1 },
      { label: "Phase 2", total: 3, done: 2 },
      { label: "Commissioning and inspections", total: 1, done: 0 },
      { label: "Phase 9", total: 1, done: 0 },
      { label: "Unnumbered", total: 1, done: 1 },
    ]);
  });

  it("does not let a year become a phase, and needs the pattern to be strong (v165.1 guards)", () => {
    const years = [
      task({ title: "2026.1 Budget kickoff" }),
      task({ title: "2026.2 Hiring plan" }),
      task({ title: "2027.1 Offsite" }),
      task({ title: "Weekly notes" }),
    ];
    expect(workGroups(years).byStatus).toBe(true);
    const weak = [
      task({ title: "1.1 Only one numbered" }),
      task({ title: "1.2 Two numbered" }),
      task({ title: "Plain a" }), task({ title: "Plain b" }), task({ title: "Plain c" }),
      task({ title: "Plain d" }), task({ title: "Plain e" }), task({ title: "Plain f" }),
    ];
    expect(workGroups(weak).byStatus).toBe(true);
  });

  it("falls back to status groups for a flat task list", () => {
    const flat = [
      task({ status: "done" }), task({ status: "done" }),
      task({ status: "in_progress" }), task({ status: "blocked" }),
    ];
    const { groups, byStatus } = workGroups(flat);
    expect(byStatus).toBe(true);
    expect(groups.map((g) => g.label)).toEqual(["In progress", "Blocked", "Done"]);
    expect(groups.find((g) => g.label === "Done")).toEqual({ label: "Done", total: 2, done: 2 });
  });

  it("mirrors the portfolio window math: start falls back to end, end to start", () => {
    const items = [
      roadmapItem({ start_date: "2026-11-02", end_date: "2026-12-18" }),
      roadmapItem({ start_date: null, end_date: "2026-11-20" }),
      roadmapItem({ start_date: "2027-02-01", end_date: null }),
    ];
    expect(plannedWindow(items)).toEqual({ start: "2026-11-02", end: "2027-02-01" });
    expect(plannedWindow([roadmapItem({})])).toBeNull();
    expect(plannedWindow([roadmapItem({ start_date: "2026-11-02", end_date: "2026-11-02" })])).toBeNull();
  });

  it("groups spend by month with running totals, oldest first", () => {
    const rows = spendByMonth([
      { id: "c1", description: "a", amount: 100, incurred_date: "2026-11-03", created_at: "" },
      { id: "c2", description: "b", amount: 50, incurred_date: "2026-10-15", created_at: "" },
      { id: "c3", description: "c", amount: 25, incurred_date: "2026-11-20", created_at: "" },
    ]);
    expect(rows).toEqual([
      { key: "2026-10", label: "October 2026", amount: 50, running: 50 },
      { key: "2026-11", label: "November 2026", amount: 125, running: 175 },
    ]);
  });
});

describe("ProjectCockpit", () => {
  it("leads with completion, time and budget gauges carrying their words", async () => {
    calls.listTasks.mockResolvedValue({ tasks: wbsTasks() });
    calls.listRoadmapItems.mockResolvedValue({ items: [roadmapItem({ start_date: "2026-11-02", end_date: "2027-02-01" })] });
    calls.getBudget.mockResolvedValue(budget({
      budgetAtCompletion: 100000,
      taskStats: { totalTasks: 8, doneTasks: 3, dueTasks: 5 },
      costEntries: [{ id: "c1", description: "Deposit", amount: 40000, incurred_date: "2026-11-05", created_at: "" }],
      metrics: { pvPercent: 0.3, evPercent: 0.35, ac: 40000, pv: 30000, ev: 35000, cv: -5000, sv: 5000, cpi: 0.88, spi: 1.17, eac: 114286, vac: -14286, tcpi: null },
    }));
    await render();
    expect(text()).toContain("The full picture");
    expect(text()).toContain("Completion");
    expect(text()).toContain("3 of 8 tasks done");
    expect(text()).toContain("Time used");
    expect(text()).toContain("planned days used");
    expect(text()).toContain("finishes Feb 1, 2027");
    expect(text()).toContain("Budget used");
    expect(text()).toContain("$40,000 of $100,000 spent");
  });

  it("shows the work breakdown donut table by phase and the forecast when EVM exists", async () => {
    calls.listTasks.mockResolvedValue({ tasks: wbsTasks() });
    calls.listRoadmapItems.mockResolvedValue({ items: [] });
    calls.getBudget.mockResolvedValue(budget({
      budgetAtCompletion: 100000,
      taskStats: { totalTasks: 8, doneTasks: 3, dueTasks: 5 },
      costEntries: [
        { id: "c1", description: "Deposit", amount: 30000, incurred_date: "2026-10-05", created_at: "" },
        { id: "c2", description: "Crew", amount: 10000, incurred_date: "2026-11-05", created_at: "" },
      ],
      metrics: { pvPercent: 0.3, evPercent: 0.35, ac: 40000, pv: 30000, ev: 35000, cv: -5000, sv: 5000, cpi: 0.88, spi: 1.17, eac: 114286, vac: -14286, tcpi: null },
    }));
    await render();
    expect(text()).toContain("Work breakdown");
    expect(text()).toContain("1.0 Design");
    expect(text()).toContain("2 of 4");
    expect(text()).toContain("Whole project");
    expect(text()).toContain("Forecast at finish");
    expect(text()).toContain("$114,286");
    expect(text()).toContain("$14,286 over the $100,000 budget");
    // Spend by month, newest first in the table, running totals honest.
    expect(text()).toContain("November 2026");
    expect(text()).toContain("October 2026");
    expect(text()).toContain("Total so far");
  });

  it("hides the forecast when the EVM metrics do not exist (v158 rule)", async () => {
    calls.listTasks.mockResolvedValue({ tasks: wbsTasks() });
    calls.listRoadmapItems.mockResolvedValue({ items: [] });
    calls.getBudget.mockResolvedValue(budget({
      budgetAtCompletion: 100000,
      taskStats: { totalTasks: 8, doneTasks: 3, dueTasks: 5 },
      costEntries: [{ id: "c1", description: "Deposit", amount: 40000, incurred_date: "2026-11-05", created_at: "" }],
    }));
    await render();
    expect(text()).toContain("Whole project");
    expect(text()).not.toContain("Forecast at finish");
  });

  it("keeps Advanced off by default; toggling reveals SPI/CPI small print under plain words and persists", async () => {
    calls.listTasks.mockResolvedValue({ tasks: wbsTasks() });
    calls.listRoadmapItems.mockResolvedValue({ items: [] });
    calls.getBudget.mockResolvedValue(budget({
      budgetAtCompletion: 100000,
      taskStats: { totalTasks: 8, doneTasks: 3, dueTasks: 5 },
      costEntries: [{ id: "c1", description: "Deposit", amount: 40000, incurred_date: "2026-11-05", created_at: "" }],
      metrics: { pvPercent: 0.3, evPercent: 0.35, ac: 40000, pv: 30000, ev: 35000, cv: -5000, sv: 5000, cpi: 0.88, spi: 1.17, eac: 114286, vac: -14286, tcpi: null },
    }));
    await render();
    expect(text()).not.toContain("Schedule health");
    const toggle = container.querySelector<HTMLInputElement>(".cockpit-advanced input");
    expect(toggle).not.toBeNull();
    await act(async () => {
      toggle!.click();
    });
    expect(text()).toContain("Schedule health");
    expect(text()).toContain("Ahead of the planned pace");
    expect(text()).toContain("SPI 1.17");
    expect(text()).toContain("Budget health");
    expect(text()).toContain("Over spent for the work done");
    expect(text()).toContain("CPI 0.88");
    expect(localStorage.getItem("tasketra.cockpitAdvanced")).toBe("1");
  });

  it("explains the missing indexes instead of inventing them when EVM is absent", async () => {
    localStorage.setItem("tasketra.cockpitAdvanced", "1");
    calls.listTasks.mockResolvedValue({ tasks: wbsTasks() });
    calls.listRoadmapItems.mockResolvedValue({ items: [] });
    calls.getBudget.mockResolvedValue(budget({
      taskStats: { totalTasks: 8, doneTasks: 3, dueTasks: 5 },
    }));
    await render();
    expect(text()).toContain("Schedule and budget health need dated tasks and logged costs");
    expect(text()).not.toContain("SPI");
  });

  it("uses status groups for a flat task list", async () => {
    calls.listTasks.mockResolvedValue({
      tasks: [task({ status: "done" }), task({ status: "in_progress" }), task({ status: "not_started" })],
    });
    calls.listRoadmapItems.mockResolvedValue({ items: [] });
    calls.getBudget.mockResolvedValue(budget({
      taskStats: { totalTasks: 3, doneTasks: 1, dueTasks: 2 },
    }));
    await render();
    expect(text()).toContain("Work by status");
    expect(text()).toContain("In progress");
  });

  it("shows the phase breakdown for a numbered task list, in plan order (v165.1)", async () => {
    calls.listTasks.mockResolvedValue({
      tasks: [
        task({ title: "1.1 Initiation and funding", status: "done" }),
        task({ title: "1.2 Planning and controls", status: "in_progress" }),
        task({ title: "2.1 Schematic design", status: "done" }),
        task({ title: "2.2 Design development", status: "not_started" }),
        task({ title: "8 Commissioning and inspections", status: "not_started" }),
      ],
    });
    calls.listRoadmapItems.mockResolvedValue({ items: [] });
    calls.getBudget.mockResolvedValue(budget({
      taskStats: { totalTasks: 5, doneTasks: 2, dueTasks: 3 },
    }));
    await render();
    expect(text()).toContain("Work breakdown");
    expect(text()).not.toContain("Work by status");
    expect(text()).toContain("Phase 1");
    expect(text()).toContain("Phase 2");
    expect(text()).toContain("Commissioning and inspections");
  });

  it("gives a not-yet-started project both dates in the time words (v165.1)", async () => {
    calls.listTasks.mockResolvedValue({ tasks: wbsTasks() });
    calls.listRoadmapItems.mockResolvedValue({ items: [roadmapItem({ start_date: "2027-01-01", end_date: "2027-04-10" })] });
    calls.getBudget.mockResolvedValue(budget({
      taskStats: { totalTasks: 8, doneTasks: 3, dueTasks: 5 },
    }));
    await render();
    expect(text()).toContain("99 planned days · Jan 1, 2027 to Apr 10, 2027");
  });

  it("renders sentences with actions, not charts, for an empty project", async () => {
    calls.listTasks.mockResolvedValue({ tasks: [] });
    calls.listRoadmapItems.mockResolvedValue({ items: [] });
    calls.getBudget.mockResolvedValue(budget({}));
    await render();
    expect(text()).toContain("No tasks yet, so there is nothing to measure.");
    expect(text()).toContain("No roadmap dates yet, so there is no planned span to measure time against.");
    expect(text()).toContain("No budget or costs yet.");
    expect(text()).not.toContain("Completion");
    expect(text()).not.toContain("Work breakdown");
  });
});
