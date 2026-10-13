import { describe, it, expect } from "vitest";
import { groupTasks, groupOfTask, sortTasks, isTaskSort, TASK_GROUPS_OPEN_BY_DEFAULT } from "../taskGroups";

const now = new Date(2026, 9, 13, 9, 0);
const t = (id: string, title: string, due: string | null, status: "not_started" | "in_progress" | "blocked" | "done" = "not_started", owner: string | null = null) =>
  ({ id, title, due_date: due, status, owner_name: owner });

const tasks = [
  t("1", "Sign off drawings", "2026-10-09", "in_progress", "Priya"),
  t("2", "Reply to permit office", "2026-10-08", "not_started", "Karissa"),
  t("3", "Electrical inspection", "2026-10-15", "not_started", "Sam"),
  t("4", "Order scaffolding", "2026-10-14", "blocked", "Sam"),
  t("5", "Book crane", "2026-11-20", "not_started", "Priya"),
  t("6", "Plan handover", null),
  t("7", "Kickoff held", "2026-10-01", "done", "Karissa"),
];

describe("task groups", () => {
  it("puts each task in one group", () => {
    expect(groupOfTask(tasks[0], now)).toBe("overdue");
    expect(groupOfTask(tasks[2], now)).toBe("week");
    expect(groupOfTask(tasks[4], now)).toBe("later");
    expect(groupOfTask(tasks[5], now)).toBe("nodate");
    expect(groupOfTask(tasks[6], now)).toBe("done");
  });

  it("a finished task is Done even when its date has passed", () => {
    expect(groupOfTask(t("x", "x", "2026-01-01", "done"), now)).toBe("done");
  });

  it("returns only groups with tasks, in reading order, and nothing is lost", () => {
    const g = groupTasks(tasks, "due", now);
    expect(g.map((x) => x.id)).toEqual(["overdue", "week", "later", "nodate", "done"]);
    expect(g.flatMap((x) => x.tasks).length).toBe(tasks.length);
    expect(groupTasks([t("a", "a", null)], "due", now).map((x) => x.id)).toEqual(["nodate"]);
  });

  it("sorts by due date inside a group, empty dates last", () => {
    const g = groupTasks(tasks, "due", now);
    expect(g[0].tasks.map((x) => x.id)).toEqual(["2", "1"]);
    expect(g[1].tasks.map((x) => x.id)).toEqual(["4", "3"]);
  });

  it("sorts by owner, status and title", () => {
    expect(sortTasks(tasks, "owner").map((x) => x.owner_name)).toEqual(["Karissa", "Karissa", "Priya", "Priya", "Sam", "Sam", null]);
    expect(sortTasks(tasks, "status")[0].status).toBe("blocked");
    expect(sortTasks(tasks, "title")[0].title).toBe("Book crane");
  });

  it("does not change the list it is given", () => {
    const copy = [...tasks];
    sortTasks(tasks, "title");
    expect(tasks).toEqual(copy);
  });

  it("only Overdue and Next 7 days start open", () => {
    expect([...TASK_GROUPS_OPEN_BY_DEFAULT]).toEqual(["overdue", "week"]);
  });

  it("recognises only real sort choices", () => {
    expect(isTaskSort("due")).toBe(true);
    expect(isTaskSort("priority")).toBe(false);
    expect(isTaskSort(null)).toBe(false);
  });
});
