// Shared date/time display helpers -- bare toLocaleString()/toLocaleDateString()
// calls (no options) render long, inconsistent strings like
// "9/15/2026, 4:39:12 PM" for a timestamp or "9/15/2026" for a date. These
// give one short, consistent style everywhere instead: "Sep 15, 2026" for
// dates, "Sep 15, 4:39 PM" for timestamps (year only shown when it isn't
// the current one, so a stale record from last year doesn't read as if it
// happened last week).

const DATE_OPTS: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

/** A real timestamp column (created_at, updated_at, responded_at, ...),
 * shown as a date only. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString(undefined, DATE_OPTS);
}

/** A real timestamp column, shown with the time of day. Drops seconds
 * (the biggest source of the "very long" look) and the year when it's the
 * current year. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "--";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

/** A bare DATE-only column (due_date, start_date, needed_by, meeting_date,
 * ...). These come back as either a full ISO timestamp at UTC midnight
 * ("2026-08-01T00:00:00.000Z") or a plain "2026-08-01" string -- parsing
 * either directly with `new Date()` and formatting in the local timezone
 * can roll the date back a day west of UTC. Slicing to the first 10 chars
 * before re-appending a local midnight time avoids that. */
export function fmtLocalDate(d: string | null | undefined): string {
  if (!d) return "--";
  return new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, DATE_OPTS);
}
