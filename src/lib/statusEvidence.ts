// The evidence line under the Feed composer's status pills (v143): why the
// suggested status is what it is, as plain counts from the project's own
// data. Pure assembly only -- the counts are computed by the caller from
// data it already loads, and a phrase is claimed ONLY when its count is
// actually known. A null input means "unknown" and is silently omitted; a
// known zero is also omitted (there is nothing to point at). This never
// invents a reason the data does not support.

import { HEALTH_LABEL } from "./healthLabels";

export type StatedHealth = "on_track" | "at_risk" | "off_track";

export const STATED_HEALTH_LABEL: Record<StatedHealth, string> = HEALTH_LABEL;

export const STATED_HEALTH_PILL: Record<StatedHealth, string> = {
  on_track: "pill-green",
  at_risk: "pill-gold",
  off_track: "pill-red",
};

export const STATED_HEALTH_VALUES: StatedHealth[] = ["on_track", "at_risk", "off_track"];

export type StatusEvidenceInput = {
  /** Open tasks past their due date. */
  overdueTasks: number | null;
  /** Open tasks waiting on at least one unfinished dependency. */
  blockedTasks: number | null;
  /** Open issues with high or critical severity. */
  openHighIssues: number | null;
  /** Open risks with high probability or impact. */
  openHighRisks: number | null;
  /** Whole days since the project's most recent status update. */
  daysSinceLastUpdate: number | null;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Short evidence phrases, in reading order, claiming only known facts. */
export function statusEvidence(input: StatusEvidenceInput): string[] {
  const phrases: string[] = [];
  if (input.overdueTasks !== null && input.overdueTasks > 0) {
    phrases.push(`${input.overdueTasks} ${plural(input.overdueTasks, "task", "tasks")} overdue`);
  }
  if (input.blockedTasks !== null && input.blockedTasks > 0) {
    phrases.push(`${input.blockedTasks} blocked`);
  }
  if (input.openHighIssues !== null && input.openHighIssues > 0) {
    phrases.push(`${input.openHighIssues} high or critical ${plural(input.openHighIssues, "issue", "issues")}`);
  }
  if (input.openHighRisks !== null && input.openHighRisks > 0) {
    phrases.push(`${input.openHighRisks} high ${plural(input.openHighRisks, "risk", "risks")}`);
  }
  if (input.daysSinceLastUpdate !== null && input.daysSinceLastUpdate >= 1) {
    phrases.push(`no update in ${input.daysSinceLastUpdate} ${plural(input.daysSinceLastUpdate, "day", "days")}`);
  }
  return phrases;
}
