// The Weekly sync page's words (v146): the per-project status lines and the
// plain-text Recap that copies them into Slack or email. Pure assembly
// only -- every phrase is claimed from the /api/weekly-sync payload and
// nothing else. A fact the payload does not establish (a project's last
// activity, a decision's deadline) is omitted, never guessed at, in the
// same spirit as needsALook and statusEvidence.

import type { WeeklySyncAsk, WeeklySyncData, WeeklySyncProject } from "./api";
import { daysBetween } from "./calendarItems";
import { localDateKey } from "./today";

type Health = WeeklySyncProject["health"];

const HEALTH_LOWER: Record<Health, string> = { on_track: "on track", at_risk: "at risk", off_track: "off track" };
const HEALTH_PHRASE: Record<Health, string> = { on_track: "On track.", at_risk: "At risk.", off_track: "Off track." };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Nov 12, 2026" for a YYYY-MM-DD date key. */
export function formatDateKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

/** "November 4, 2026" for a YYYY-MM-DD date key. */
export function formatDateKeyLong(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${d}, ${y}`;
}

/**
 * The shortest honest status phrase for a project: when a stated status
 * exists and disagrees with the computed health, the divergence is the
 * headline (the same call needsALook makes); otherwise the computed health
 * speaks for itself.
 */
export function statusHeadline(p: WeeklySyncProject): string {
  if (p.statedHealth != null && p.statedHealth !== p.health) {
    return `Stated ${HEALTH_LOWER[p.statedHealth]}, evidence suggests ${HEALTH_LOWER[p.health]}.`;
  }
  return HEALTH_PHRASE[p.health];
}

/**
 * The full status line the sync page shows for one project: the headline,
 * then -- only when the payload supports them -- how long the project has
 * been quiet, how many tasks are past due, and how many decisions are
 * waiting. "Quiet" is measured from the most recent of the last recorded
 * activity and the last stated status: if either happened recently, the
 * project has not gone quiet, and if neither is known the claim is dropped.
 */
export function projectStatusLine(p: WeeklySyncProject, todayKey: string): string {
  const parts = [statusHeadline(p)];
  const lastSign = [p.lastActivityAt, p.statedAt]
    .filter((t): t is string => !!t)
    .map((t) => localDateKey(new Date(t)))
    .sort()
    .pop();
  if (lastSign) {
    const quietDays = daysBetween(lastSign, todayKey);
    if (quietDays >= 7) parts.push(`No update in ${quietDays} ${plural(quietDays, "day", "days")}.`);
  }
  if (p.overdueTasks > 0) {
    parts.push(`${p.overdueTasks} ${plural(p.overdueTasks, "task", "tasks")} past due.`);
  }
  if (p.openDecisions > 0) {
    parts.push(`${p.openDecisions} ${plural(p.openDecisions, "decision", "decisions")} waiting.`);
  }
  return parts.join(" ");
}

/** One ask as a recap line: "- <title> (<project>) — needed by <date>". */
function askLine(a: WeeklySyncAsk): string {
  const when = a.deadline ? `needed by ${formatDateKey(a.deadline)}` : "no date set";
  return `- ${a.title} (${a.projectName}) — ${when}`;
}

/**
 * The Recap text for the whole payload: a dated header, a one-line count of
 * projects by computed health, one line per project, then the asks queue.
 * A section with nothing in it is omitted rather than padded -- an account
 * with no asks waiting gets no "Asks waiting:" heading over nothing.
 */
export function buildRecap(payload: WeeklySyncData, todayISO: string): string {
  const lines: string[] = [`Weekly sync — ${formatDateKeyLong(todayISO)}`];
  const { projects, asks } = payload;

  if (projects.length === 0) {
    lines.push("No active projects.");
  } else {
    const counts: [Health, number][] = [
      ["on_track", projects.filter((p) => p.health === "on_track").length],
      ["at_risk", projects.filter((p) => p.health === "at_risk").length],
      ["off_track", projects.filter((p) => p.health === "off_track").length],
    ];
    const groups = counts.filter(([, n]) => n > 0).map(([h, n]) => `${n} ${HEALTH_LOWER[h]}`);
    lines.push(`${projects.length} ${plural(projects.length, "project", "projects")}: ${groups.join(", ")}.`);
    lines.push("");
    for (const p of projects) lines.push(`- ${p.name}: ${statusHeadline(p)}`);
  }

  if (asks.length > 0) {
    lines.push("");
    lines.push("Asks waiting:");
    for (const a of asks) lines.push(askLine(a));
  }

  return lines.join("\n");
}
