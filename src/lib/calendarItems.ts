// Pure date and grouping helpers for the Dashboard calendar (v142), kept out of
// the component so they can be unit tested without rendering anything. All
// dates are plain YYYY-MM-DD strings in the viewer's own timezone -- the same
// convention /api/my-calendar and src/lib/today.ts already use -- so nothing
// here ever re-derives a day from a timestamp.

import type { CalendarItem, CalendarItemKind } from "./api";
import { addDays, localDateKey } from "./today";

/** Fixed display order for the three kinds, in dots, groups and the legend. */
export const CALENDAR_KINDS: CalendarItemKind[] = ["task", "milestone", "decision"];

/** Heading over each kind's group in the selected day's list. */
export const KIND_GROUP_LABEL: Record<CalendarItemKind, string> = {
  task: "Tasks due",
  milestone: "Milestones",
  decision: "Decisions waiting",
};

/** Project tab each kind's rows jump to. */
export const KIND_TAB: Record<CalendarItemKind, string> = {
  task: "tasks",
  milestone: "roadmap",
  decision: "decisions",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Whole days from aKey to bKey (positive when bKey is later). */
export function daysBetween(aKey: string, bKey: string): number {
  const [ay, am, ad] = aKey.split("-").map(Number);
  const [by, bm, bd] = bKey.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** "2026-11" for any date key in that month. */
export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Shift a "YYYY-MM" month key by n months (negative goes back). */
export function shiftMonth(monthKey: string, n: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** "November 2026" for a "YYYY-MM" month key. */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/**
 * The range to fetch for a month: the 1st through the last day, padded out to
 * full Sunday-start weeks so the grid's leading/trailing cells can show their
 * dots too. Never wider than 42 days (inside the endpoint's 62-day cap).
 */
export function monthRange(monthKey: string): { from: string; to: string } {
  const firstKey = `${monthKey}-01`;
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const lastKey = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  const from = addDays(firstKey, -new Date(y, m - 1, 1).getDay());
  const to = addDays(lastKey, 6 - new Date(y, m - 1, lastDay).getDay());
  return { from, to };
}

export type CalendarCell = { key: string; day: number; inMonth: boolean };

/** The grid for a month: full Sunday-start weeks covering it, 35 or 42 cells. */
export function monthCells(monthKey: string): CalendarCell[] {
  const { from, to } = monthRange(monthKey);
  const cells: CalendarCell[] = [];
  for (let key = from; key <= to; key = addDays(key, 1)) {
    cells.push({ key, day: Number(key.slice(8, 10)), inMonth: monthKeyOf(key) === monthKey });
  }
  return cells;
}

/** Items grouped by their date string, each day's items in the order given. */
export function groupItemsByDate(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const byDate = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const list = byDate.get(item.date);
    if (list) list.push(item);
    else byDate.set(item.date, [item]);
  }
  return byDate;
}

/** Which kinds are present on a day, in the fixed display order (for the dots). */
export function kindsOnDay(dayItems: CalendarItem[]): CalendarItemKind[] {
  const present = new Set(dayItems.map((i) => i.kind));
  return CALENDAR_KINDS.filter((k) => present.has(k));
}

export type DayGroup = { kind: CalendarItemKind; label: string; items: CalendarItem[] };

/** One day's items split into labelled groups, in the fixed kind order. */
export function groupDayItems(dayItems: CalendarItem[]): DayGroup[] {
  return CALENDAR_KINDS.flatMap((kind) => {
    const items = dayItems
      .filter((i) => i.kind === kind)
      .sort((a, b) => a.project_name.localeCompare(b.project_name) || a.title.localeCompare(b.title));
    return items.length > 0 ? [{ kind, label: KIND_GROUP_LABEL[kind], items }] : [];
  });
}

/** Today as a date key, for callers that don't already have one. */
export function todayKey(): string {
  return localDateKey(new Date());
}
