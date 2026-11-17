// v163 (Phase 6, the delight pack): the server half of the two feed eggs.
// Eggs 6 and 10 live in the project's Feed, and the Feed is the activity
// log -- so the record of the moment is an activity row, written here at
// the moment it happens. No table, no flag column: the row's summary IS
// the egg text, and the client recognizes egg rows by these exact bodies
// (src/lib/delight.ts carries the same constants for the Feed's
// Delight-off filter; keep the two in step).

export const ON_THE_NOSE_SUMMARY = "On the nose.";
export const CENTURY_SUMMARY = "Century: 100 tasks done on this project.";
export const CENTURY_COUNT = 100;

/**
 * YYYY-MM-DD for `now` in the given IANA timezone (the actor's stored
 * users.timezone), falling back to UTC when unset or unrecognized. The
 * app's date bucketing normally happens in the browser precisely so a
 * server in another timezone can't disagree with the viewer; a feed row
 * is written once, here, so the actor's own zone is the honest clock.
 */
export function localDateKeyInZone(now: Date, timeZone: string | null | undefined): string {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
      const key = `${get("year")}-${get("month")}-${get("day")}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
    } catch {
      // Unknown zone string: fall through to UTC.
    }
  }
  return now.toISOString().slice(0, 10);
}

/**
 * Egg 6 (On the nose): a milestone that is being completed on its planned
 * date. A milestone is a single-date marker -- its planned date is its
 * start_date (the timeline draws it there, and most carry no end_date).
 * Other roadmap types are ranges or notes, not a date you land on, so
 * they don't earn the marker.
 */
export function isOnTheNose(
  item: { type: string; start_date: string | Date | null },
  todayKey: string,
): boolean {
  if (item.type !== "milestone" || !item.start_date) return false;
  const planned = item.start_date instanceof Date
    ? item.start_date.toISOString().slice(0, 10)
    : String(item.start_date).slice(0, 10);
  return planned === todayKey;
}
