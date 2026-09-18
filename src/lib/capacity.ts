// A lightweight capacity signal for the Team tab's Workload table -- not
// hour-based estimation, just a read on open/blocked/overdue task counts.
// Kept as its own module (rather than inline in ProjectHome.tsx) so the
// threshold math is unit-testable without a database or a rendered page.

export type CapacityLevel = "ok" | "busy" | "overloaded";

export const CAPACITY_LABEL: Record<CapacityLevel, string> = {
  ok: "On track",
  busy: "Busy",
  overloaded: "Overloaded",
};

export const CAPACITY_PILL: Record<CapacityLevel, string> = {
  ok: "pill-green",
  busy: "pill-gold",
  overloaded: "pill-red",
};

// Overdue and blocked work weigh heavier than plain open count, since
// those are what actually tell you someone is underwater versus just busy.
export function capacityLevel(open: number, blocked: number, overdue: number): CapacityLevel {
  const score = open + blocked * 1.5 + overdue * 2;
  if (score >= 12 || overdue >= 3) return "overloaded";
  if (score >= 6 || overdue >= 1 || blocked >= 2) return "busy";
  return "ok";
}
