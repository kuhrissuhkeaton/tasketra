// Baseline snapshot and variance. A baseline freezes the budget and each
// task's dates; variance compares today's plan against the latest snapshot.
// Pure functions, so the rules are unit tested without a database.

export type BaselineTask = { id: string; title: string; start: string | null; due: string | null };

export type CurrentTaskRow = { id: string; title: string; start_date: unknown; due_date: unknown };

/** Dates as plain YYYY-MM-DD strings, whatever the driver hands back. */
export function dateOnly(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export function snapshotTasks(rows: CurrentTaskRow[]): BaselineTask[] {
  return rows.map((r) => ({ id: r.id, title: r.title, start: dateOnly(r.start_date), due: dateOnly(r.due_date) }));
}

export type MovedTask = {
  id: string;
  title: string;
  baselineStart: string | null;
  baselineDue: string | null;
  start: string | null;
  due: string | null;
};

export type BaselineVariance = {
  movedTasks: MovedTask[];
  addedTasks: number;
  removedTasks: number;
  budget: { baseline: number | null; current: number | null; delta: number | null };
  reserve: { baseline: number | null; current: number | null; delta: number | null };
};

function delta(baseline: number | null, current: number | null): number | null {
  if (baseline === null && current === null) return null;
  return Math.round(((current ?? 0) - (baseline ?? 0)) * 100) / 100;
}

export function computeVariance(
  baseline: { budget: number | null; reserve: number | null; tasks: BaselineTask[] },
  current: { budget: number | null; reserve: number | null; tasks: BaselineTask[] },
): BaselineVariance {
  const now = new Map(current.tasks.map((t) => [t.id, t]));
  const was = new Map(baseline.tasks.map((t) => [t.id, t]));
  const movedTasks: MovedTask[] = [];
  let removedTasks = 0;
  for (const b of baseline.tasks) {
    const c = now.get(b.id);
    if (!c) { removedTasks++; continue; }
    if (c.start !== b.start || c.due !== b.due) {
      movedTasks.push({ id: b.id, title: c.title, baselineStart: b.start, baselineDue: b.due, start: c.start, due: c.due });
    }
  }
  const addedTasks = current.tasks.filter((t) => !was.has(t.id)).length;
  return {
    movedTasks, addedTasks, removedTasks,
    budget: { baseline: baseline.budget, current: current.budget, delta: delta(baseline.budget, current.budget) },
    reserve: { baseline: baseline.reserve, current: current.reserve, delta: delta(baseline.reserve, current.reserve) },
  };
}
