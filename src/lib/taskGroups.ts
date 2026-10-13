// Groups and sorts tasks for the grouped list: Overdue, Next 7 days, Later, No due date, Done.
// Pure functions of the tasks already loaded; nothing here talks to the server.

import { daysUntil } from "./rowFlags";

export type TaskSort = "due" | "owner" | "status" | "title";
export type TaskGroupId = "overdue" | "week" | "later" | "nodate" | "done";

export const TASK_SORT_LABEL: Record<TaskSort, string> = {
  due: "Due date",
  owner: "Owner",
  status: "Status",
  title: "Title (A to Z)",
};

export const TASK_GROUP_LABEL: Record<TaskGroupId, string> = {
  overdue: "Overdue",
  week: "Next 7 days",
  later: "Later",
  nodate: "No due date",
  done: "Done",
};

/** Groups shown open by default; the others start collapsed, with a count. */
export const TASK_GROUPS_OPEN_BY_DEFAULT: readonly TaskGroupId[] = ["overdue", "week"];

type TaskLike = {
  id: string;
  title: string;
  status: "not_started" | "in_progress" | "blocked" | "done";
  owner_name: string | null;
  due_date: string | null;
};

const STATUS_ORDER: Record<TaskLike["status"], number> = { blocked: 0, in_progress: 1, not_started: 2, done: 3 };

export function groupOfTask(t: TaskLike, now: Date = new Date()): TaskGroupId {
  if (t.status === "done") return "done";
  const n = daysUntil(t.due_date, now);
  if (n === null) return "nodate";
  if (n < 0) return "overdue";
  if (n <= 7) return "week";
  return "later";
}

export function isTaskSort(v: unknown): v is TaskSort {
  return v === "due" || v === "owner" || v === "status" || v === "title";
}

function cmpText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/** Sorts a copy of the list. Empty values sort last; ties fall back to the title so the order is stable. */
export function sortTasks<T extends TaskLike>(tasks: T[], sort: TaskSort): T[] {
  const byDue = (a: T, b: T) => {
    const x = a.due_date?.slice(0, 10) ?? "9999-99-99";
    const y = b.due_date?.slice(0, 10) ?? "9999-99-99";
    return x < y ? -1 : x > y ? 1 : 0;
  };
  const cmp: Record<TaskSort, (a: T, b: T) => number> = {
    due: byDue,
    owner: (a, b) => {
      if (!a.owner_name && b.owner_name) return 1;
      if (a.owner_name && !b.owner_name) return -1;
      return cmpText(a.owner_name || "", b.owner_name || "");
    },
    status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
    title: (a, b) => cmpText(a.title, b.title),
  };
  return [...tasks].sort((a, b) => cmp[sort](a, b) || byDue(a, b) || cmpText(a.title, b.title));
}

/** Only the groups that have tasks, in reading order. Sort applies inside each group. */
export function groupTasks<T extends TaskLike>(tasks: T[], sort: TaskSort, now: Date = new Date()): { id: TaskGroupId; label: string; tasks: T[] }[] {
  const order: TaskGroupId[] = ["overdue", "week", "later", "nodate", "done"];
  const buckets = new Map<TaskGroupId, T[]>(order.map((id) => [id, []]));
  for (const t of tasks) buckets.get(groupOfTask(t, now))!.push(t);
  return order
    .map((id) => ({ id, label: TASK_GROUP_LABEL[id], tasks: sortTasks(buckets.get(id)!, sort) }))
    .filter((g) => g.tasks.length > 0);
}
