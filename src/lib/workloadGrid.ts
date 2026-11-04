// Pure bucketing for the Workload grid (v147): who is carrying what, week
// by week. Kept out of the page so the math can be unit tested without
// rendering anything. All dates are plain YYYY-MM-DD strings, the
// convention /api/workload and src/lib/today.ts already use.
//
// The grid is anchored on the windowStart the endpoint returns (the Sunday
// of the current week, UTC) so the columns and the endpoint's milestone
// window always agree. Overdue, though, is drawn against the viewer's own
// local "today" (todayISO), as on every other screen: a task due before
// today is overdue, full stop, and it is never also counted in a week
// bucket -- the week buckets only take due dates from today onwards. A
// task with no due date counts toward its owner's Open total and nothing
// else.

import type { WorkloadMilestone, WorkloadTask } from "./api";
import { daysBetween } from "./calendarItems";
import { addDays } from "./today";

export const UNASSIGNED = "Unassigned";
export const WEEK_COUNT = 4;

export type WorkloadRow = {
  owner: string;
  /** Open tasks due before today. */
  overdue: number;
  /** Open tasks due in each of the 4 window weeks, from today onwards. */
  weeks: number[];
  /** All open tasks for the owner, dated or not. */
  open: number;
  /** Distinct projects in poor health (at risk or off track) the owner has open work on. */
  atRiskProjects: number;
};

export type WorkloadGrid = {
  rows: WorkloadRow[];
  /** Milestones grouped by window week index; empty weeks are empty arrays. */
  milestoneWeeks: WorkloadMilestone[][];
  /** The 4 week-start date keys, from windowStart. */
  weekStarts: string[];
};

/** Which window week (0-3) a date key falls in, or -1 outside the window. */
export function weekIndexOf(dateKey: string, windowStart: string): number {
  const idx = Math.floor(daysBetween(windowStart, dateKey) / 7);
  return idx >= 0 && idx < WEEK_COUNT ? idx : -1;
}

export function buildWorkloadGrid(
  tasks: WorkloadTask[],
  milestones: WorkloadMilestone[],
  windowStart: string,
  todayISO: string,
): WorkloadGrid {
  const weekStarts = Array.from({ length: WEEK_COUNT }, (_, i) => addDays(windowStart, i * 7));

  type Acc = { overdue: number; weeks: number[]; open: number; atRisk: Set<string> };
  const byOwner = new Map<string, Acc>();
  const accFor = (owner: string): Acc => {
    let acc = byOwner.get(owner);
    if (!acc) {
      acc = { overdue: 0, weeks: [0, 0, 0, 0], open: 0, atRisk: new Set() };
      byOwner.set(owner, acc);
    }
    return acc;
  };

  for (const t of tasks) {
    const acc = accFor(t.owner);
    acc.open += 1;
    if (t.projectHealth === "at_risk" || t.projectHealth === "off_track") {
      acc.atRisk.add(t.projectId);
    }
    if (t.dueDate) {
      if (t.dueDate < todayISO) {
        acc.overdue += 1;
      } else {
        const idx = weekIndexOf(t.dueDate, windowStart);
        if (idx >= 0) acc.weeks[idx] += 1;
      }
    }
  }

  const rows: WorkloadRow[] = [...byOwner.entries()].map(([owner, acc]) => ({
    owner,
    overdue: acc.overdue,
    weeks: acc.weeks,
    open: acc.open,
    atRiskProjects: acc.atRisk.size,
  }));

  // Heaviest first: most overdue, then most open, then name. "Unassigned"
  // is not a person, so it never headlines the grid however much it holds:
  // it always sorts last.
  rows.sort((a, b) => {
    const aU = a.owner === UNASSIGNED ? 1 : 0;
    const bU = b.owner === UNASSIGNED ? 1 : 0;
    if (aU !== bU) return aU - bU;
    return b.overdue - a.overdue || b.open - a.open || a.owner.localeCompare(b.owner);
  });

  const milestoneWeeks: WorkloadMilestone[][] = [[], [], [], []];
  for (const ms of milestones) {
    const idx = weekIndexOf(ms.date, windowStart);
    if (idx >= 0) milestoneWeeks[idx].push(ms);
  }

  return { rows, milestoneWeeks, weekStarts };
}
