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

/** Long form for document/print headers ("November 7, 2026"). */
export function fmtLongDate(iso: string | null | undefined): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** Whole-dollar USD ("$1,250"); "--" for a missing number. */
export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "--";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** A 0–1 fraction as a whole percent ("42%"); "--" for a missing number. */
export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "--";
  return `${Math.round(n * 100)}%`;
}

/** A ratio to two decimals ("1.25"); "--" for a missing number. */
export function fmtRatio(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "--";
  return n.toFixed(2);
}

/** A byte count with units ("812 B", "4.2 KB", "1.3 MB", "2.0 GB"). */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
