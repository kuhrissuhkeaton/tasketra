// The one set of health words. Every surface that turns a health value
// (computed or stated) into display text reads from here — Dashboard,
// Today, the health strip, the weekly report and check-in summaries — so
// "On track" can never drift into "On Track" on one screen and "on-track"
// on another. (Sentence-internal lowercase forms, e.g. "stated on track,
// but…", are deliberately separate: they are grammar, not labels.)
export type HealthValue = "on_track" | "at_risk" | "off_track";

export const HEALTH_LABEL: Record<HealthValue, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
};
