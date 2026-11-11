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

/**
 * The headline health for a project summary (v156): when the latest
 * check-in stated a status, the stated status IS the headline everywhere
 * the project is summarized -- the project's word outranks the computed
 * one. The evidence-derived health is the headline only when nothing was
 * ever stated. Every summarizing surface (project health strip, Today
 * "Projects at a glance", Dashboard rows, Weekly sync, the copyable
 * recap) reads through here rather than picking a field per surface.
 * Logic consumers that rank or flag by evidence (needs-attention,
 * needs-a-look) keep reading `health` itself on purpose.
 */
export function headlineHealth(p: { health: HealthValue; statedHealth?: HealthValue | null }): HealthValue {
  return p.statedHealth ?? p.health;
}

/**
 * The secondary challenge line's value: the evidence-derived health, but
 * only when it actually challenges the stated headline (a stated status
 * exists and the evidence disagrees). Null means no challenge line --
 * either nothing was stated (evidence is already the headline) or the two
 * agree (nothing to challenge).
 */
export function evidenceChallenge(p: { health: HealthValue; statedHealth?: HealthValue | null }): HealthValue | null {
  if (!p.statedHealth || p.statedHealth === p.health) return null;
  return p.health;
}
