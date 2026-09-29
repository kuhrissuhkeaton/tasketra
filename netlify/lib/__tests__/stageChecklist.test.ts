import { describe, it, expect } from "vitest";
import { stageChecklist, monitorBand, isStage, type StageCounts } from "../stageChecklist.ts";

const EMPTY: StageCounts = {
  tasks: 0, datedTasks: 0, stakeholders: 0, risks: 0, hasBudgetBaseline: false, blockedTasks: 0,
  openChangeRequests: 0, openRisks: 0, staleRisks: 0, openIssues: 0, cpi: null, statusUpdatesLast7Days: 0, closureChecked: 0,
  charterWritten: false,
};

const item = (stage: Parameters<typeof stageChecklist>[0], counts: StageCounts, id: string) =>
  stageChecklist(stage, counts).items.find((i) => i.id === id)!;

describe("isStage", () => {
  it("accepts the four stages and nothing else", () => {
    expect(isStage("plan")).toBe(true);
    expect(isStage("Plan")).toBe(false);
    expect(isStage(undefined)).toBe(false);
  });
});

describe("plan checklist", () => {
  it("starts with every item to do on an empty project", () => {
    const c = stageChecklist("plan", EMPTY);
    expect(c.done).toBe(0);
    expect(c.total).toBe(5);
    expect(c.title).toBe("Next up in Plan");
    expect(c.items.every((i) => i.status === "todo")).toBe(true);
  });

  it("treats a few tasks as a built work breakdown, and one or two as partial", () => {
    expect(item("plan", { ...EMPTY, tasks: 12 }, "wbs").status).toBe("done");
    expect(item("plan", { ...EMPTY, tasks: 2 }, "wbs").status).toBe("partial");
  });

  it("reports how many tasks still need dates", () => {
    const i = item("plan", { ...EMPTY, tasks: 12, datedTasks: 9 }, "schedule");
    expect(i.status).toBe("partial");
    expect(i.meta).toBe("9 of 12 tasks have dates. 3 still need one.");
  });

  it("marks the schedule done only when every task is dated", () => {
    expect(item("plan", { ...EMPTY, tasks: 4, datedTasks: 4 }, "schedule").status).toBe("done");
    expect(item("plan", { ...EMPTY, tasks: 0 }, "schedule").status).toBe("todo");
  });

  it("uses singular wording for one item", () => {
    expect(item("plan", { ...EMPTY, stakeholders: 1 }, "stakeholders").meta).toBe("1 stakeholder listed");
  });

  it("flips budget and risk rows once they exist, with links to the right tabs", () => {
    const c = { ...EMPTY, hasBudgetBaseline: true, risks: 3 };
    expect(item("plan", c, "budget")).toMatchObject({ status: "done", tab: "budget" });
    expect(item("plan", c, "risks")).toMatchObject({ status: "done", tab: "risks" });
  });

  it("counts done items", () => {
    const c = stageChecklist("plan", { ...EMPTY, tasks: 12, datedTasks: 12, stakeholders: 2, hasBudgetBaseline: true, risks: 1 });
    expect(c.done).toBe(5);
  });
});

describe("initiate checklist", () => {
  it("has four items: charter, tasks, stakeholders and risks", () => {
    const c = stageChecklist("initiate", { ...EMPTY, tasks: 1, stakeholders: 1 });
    expect(c.total).toBe(4);
    expect(c.done).toBe(2);
  });

  it("leads with the charter, and marks it done once the purpose is written", () => {
    const todo = stageChecklist("initiate", EMPTY).items[0];
    expect(todo.id).toBe("charter");
    expect(todo.status).toBe("todo");
    expect(todo.tab).toBe("charter");
    const done = stageChecklist("initiate", { ...EMPTY, charterWritten: true }).items[0];
    expect(done.status).toBe("done");
  });
});

describe("execute checklist", () => {
  it("asks for a decision when change requests are open", () => {
    const i = item("execute", { ...EMPTY, openChangeRequests: 2 }, "changes");
    expect(i.status).toBe("todo");
    expect(i.meta).toBe("2 requests waiting on a decision");
  });

  it("marks risk review partial when only some open risks are stale", () => {
    expect(item("execute", { ...EMPTY, openRisks: 5, staleRisks: 2 }, "risk-review").status).toBe("partial");
    expect(item("execute", { ...EMPTY, openRisks: 2, staleRisks: 2 }, "risk-review").status).toBe("todo");
    expect(item("execute", { ...EMPTY, openRisks: 5, staleRisks: 0 }, "risk-review").status).toBe("done");
  });

  it("asks for a baseline when there is none, and flags a low cost index when there is", () => {
    expect(item("execute", EMPTY, "budget-check").status).toBe("todo");
    expect(item("execute", { ...EMPTY, hasBudgetBaseline: true, cpi: 0.97 }, "budget-check").status).toBe("done");
    expect(item("execute", { ...EMPTY, hasBudgetBaseline: true, cpi: 0.86 }, "budget-check").status).toBe("todo");
  });

  it("omits the cost row when a baseline exists but there is no cost index yet", () => {
    const ids = stageChecklist("execute", { ...EMPTY, hasBudgetBaseline: true, cpi: null }).items.map((i) => i.id);
    expect(ids).not.toContain("budget-check");
  });

  it("is done for status when an update went out in the last 7 days", () => {
    expect(item("execute", { ...EMPTY, statusUpdatesLast7Days: 1 }, "status").status).toBe("done");
    expect(item("execute", EMPTY, "status").status).toBe("todo");
  });
});

describe("close checklist", () => {
  it("tracks the closure checklist as partial until all five are checked", () => {
    expect(item("close", { ...EMPTY, closureChecked: 0 }, "closure").status).toBe("todo");
    expect(item("close", { ...EMPTY, closureChecked: 4 }, "closure").status).toBe("partial");
    expect(item("close", { ...EMPTY, closureChecked: 5 }, "closure").status).toBe("done");
  });

  it("wants open issues and risks cleared", () => {
    const c = { ...EMPTY, openIssues: 2, openRisks: 1 };
    expect(item("close", c, "open-issues").status).toBe("todo");
    expect(item("close", c, "open-risks").status).toBe("todo");
    expect(item("close", EMPTY, "open-issues").status).toBe("done");
  });
});

describe("monitorBand", () => {
  it("is quiet with nothing to escalate", () => {
    expect(monitorBand("execute", EMPTY)).toEqual({ state: "quiet", message: "Runs from Plan to Close. Nothing to escalate." });
  });

  it("says it has not started in Initiate", () => {
    expect(monitorBand("initiate", { ...EMPTY, blockedTasks: 3 }).state).toBe("quiet");
  });

  it("names blocked tasks and open change requests when there are any", () => {
    expect(monitorBand("execute", { ...EMPTY, blockedTasks: 3, openChangeRequests: 1 })).toEqual({
      state: "attention",
      message: "3 blocked tasks and 1 open change request",
    });
    expect(monitorBand("plan", { ...EMPTY, blockedTasks: 1 }).message).toBe("1 blocked task");
  });
});

describe("size-aware checklist", () => {
  it("never sends a Light project to the hidden Budget tab", () => {
    const plan = stageChecklist("plan", EMPTY, "light");
    expect(plan.items.map((i) => i.id)).not.toContain("budget");
    expect(plan.total).toBe(4);
    const exec = stageChecklist("execute", { ...EMPTY, hasBudgetBaseline: true, cpi: 0.8 }, "light");
    expect(exec.items.some((i) => i.tab === "budget")).toBe(false);
  });

  it("keeps the budget rows for Standard and Full", () => {
    expect(stageChecklist("plan", EMPTY, "standard").items.map((i) => i.id)).toContain("budget");
    expect(stageChecklist("plan", EMPTY, "full").items.map((i) => i.id)).toContain("budget");
  });

  it("only names optional Plan work the project actually shows", () => {
    expect(stageChecklist("plan", EMPTY, "light").optionalNote).toBeNull();
    expect(stageChecklist("plan", EMPTY, "standard").optionalNote).toBe("Optional in Plan: vendors");
    expect(stageChecklist("plan", EMPTY, "full").optionalNote).toBe("Optional in Plan: comms plan, quality standards, vendors");
  });

  it("no suggestion in any stage points at a tab Light hides", () => {
    const hidden = ["budget", "meetings", "okrs", "assumptions", "dependencies", "quality", "compliance", "procurement", "comms", "templates", "export", "connections"];
    const busy = { ...EMPTY, tasks: 5, datedTasks: 2, openRisks: 3, staleRisks: 3, openChangeRequests: 1, hasBudgetBaseline: true, cpi: 0.7, openIssues: 1 };
    for (const stage of ["initiate", "plan", "execute", "close"] as const) {
      for (const it of stageChecklist(stage, busy, "light").items) expect(hidden).not.toContain(it.tab);
    }
  });
});
