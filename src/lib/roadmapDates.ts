// Compact date ranges for the Roadmap list ("Sep 1 – 30, 2026",
// "Sep 1 – Oct 25, 2026"): year and month are only repeated when they differ.
// Spaces inside a date are non-breaking, so a narrow cell wraps at the dash,
// never in the middle of a date.

// DATE columns come back as full ISO timestamps; take the first 10 characters
// so both that and a plain "2026-08-01" parse as a local date.
function toLocalDate(d: string): Date {
  return new Date(`${d.slice(0, 10)}T00:00:00`);
}

const NBSP = "\u00a0";

export function fmtRoadmapRange(start: string | null, end: string | null): string {
  if (!start) return "Undated";
  const a = toLocalDate(start);
  const single = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (!end || end.slice(0, 10) === start.slice(0, 10)) return single.format(a).replace(/ /g, NBSP);
  return single.formatRange(a, toLocalDate(end)).replace(/ /g, NBSP);
}
