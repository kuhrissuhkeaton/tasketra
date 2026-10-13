// Plain-language flags for list rows ("3 days late", "Due today", "Expires in 12 days").
// Pure functions of a date and "today", so they are easy to test. Colour is never the
// only signal: the flag always says it in words.

export type RowFlag = { text: string; bad: boolean };

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole days from today until the date (negative = in the past). Accepts "2026-10-09" or a full ISO timestamp. */
export function daysUntil(date: string | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "3 days late" when past due, "Due today" on the day, nothing otherwise. Pass open=false for finished items. */
export function lateFlag(date: string | null | undefined, open: boolean, now: Date = new Date()): RowFlag | null {
  if (!open) return null;
  const n = daysUntil(date, now);
  if (n === null) return null;
  if (n < 0) return { text: `${plural(-n, "day")} late`, bad: true };
  if (n === 0) return { text: "Due today", bad: false };
  return null;
}

/** For things that expire: "Expired 3 days ago", "Expires in 12 days" (only inside the warning window). */
export function expiryFlag(date: string | null | undefined, open: boolean, warnDays = 30, now: Date = new Date()): RowFlag | null {
  if (!open) return null;
  const n = daysUntil(date, now);
  if (n === null) return null;
  if (n < 0) return { text: `Overdue by ${plural(-n, "day")}`, bad: true };
  if (n === 0) return { text: "Due today", bad: true };
  if (n <= warnDays) return { text: `Due in ${plural(n, "day")}`, bad: true };
  return null;
}
