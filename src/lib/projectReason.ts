// One plain-language line saying why a project is (or isn't) healthy, built only
// from signals the portfolio rollup already returns. No new scoring: it reads the
// same fields buildNeedsAttention and projectHealth already use. The Projects list
// uses it today; the in-project health strip can reuse it later.

import type { PortfolioProjectSummary } from "./api";

type Health = PortfolioProjectSummary["health"];

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export type ReasonPart = { text: string; tab?: string };

/** The same reasons as projectReason, as pieces, so a screen can link each one to the place that fixes it. */
export function projectReasonParts(p: PortfolioProjectSummary, openDecisions = 0): ReasonPart[] {
  const parts: ReasonPart[] = [];
  if (p.escalations.length > 0) parts.push({ text: "Needs escalation", tab: "team" });
  if (p.overdueTasks > 0) parts.push({ text: `${p.overdueTasks} ${plural(p.overdueTasks, "task", "tasks")} overdue`, tab: "tasks" });
  if (p.highIssues > 0) parts.push({ text: `${p.highIssues} high or critical ${plural(p.highIssues, "issue", "issues")}`, tab: "issues" });
  if (p.highRisks > 0) parts.push({ text: `${p.highRisks} high ${plural(p.highRisks, "risk", "risks")}`, tab: "risks" });
  if (openDecisions > 0) parts.push({ text: `${openDecisions} ${plural(openDecisions, "decision", "decisions")} waiting`, tab: "decisions" });
  if (parts.length > 0) return parts.slice(0, 2);
  if (p.health === "off_track") return [{ text: "Off track: a critical issue, an off-track objective, or a badly overrun score" }];
  if (p.health === "at_risk") return [{ text: "Health score is at risk" }];
  if (p.totalTasks === 0) return [{ text: "No tasks yet", tab: "tasks" }];
  return [{ text: p.nextUp ? `Next up: ${p.nextUp}` : "Nothing flagged" }];
}

export function projectReason(p: PortfolioProjectSummary, openDecisions = 0): string {
  return projectReasonParts(p, openDecisions).map((x) => x.text).join(", ");
}

const HEALTH_RANK: Record<Health, number> = { off_track: 0, at_risk: 1, on_track: 2 };

/** Worst health first, then most overdue, then name. Does not mutate the input. */
export function sortByHealth<T extends { name: string; health: Health; overdueTasks: number }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || b.overdueTasks - a.overdueTasks || a.name.localeCompare(b.name),
  );
}
