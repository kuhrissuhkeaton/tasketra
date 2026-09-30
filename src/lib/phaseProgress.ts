import type { RoadmapItem } from "./api";

// Phase progress: the share of a phase's linked tasks that are done, taken
// from the task counts the API returns with each roadmap item. Null for
// anything that isn't a phase, or a phase with no linked tasks yet, so the UI
// shows nothing rather than an invented 0%.
export function phaseProgress(
  item: Pick<RoadmapItem, "type" | "task_total" | "task_done">
): { total: number; done: number; pct: number } | null {
  const total = item.task_total ?? 0;
  if (item.type !== "phase" || total === 0) return null;
  const done = Math.min(Math.max(item.task_done ?? 0, 0), total);
  return { total, done, pct: Math.round((done / total) * 100) };
}
