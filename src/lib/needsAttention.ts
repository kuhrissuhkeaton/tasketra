// "Needs attention" on the Dashboard: a short, ranked list built only from data the page
// already has (portfolio health, escalations, overdue tasks, open decisions). No new scoring.
//
// To change what is flagged or how it is ranked, edit ATTENTION_RULES below (or pass your own
// list to buildNeedsAttention). Each rule says when it applies, what the pill reads, and the
// plain-English explanation shown on hover and read out by screen readers. Rules are ordered
// by importance: a project that matches an earlier rule ranks above one that only matches a
// later rule, and within a rule a bigger count (more overdue tasks, more decisions) ranks first.
// The Dashboard itself never needs to change.

import type { PortfolioProjectSummary } from "./api";

export type AttentionContext = { openDecisions: number };
export type AttentionMatch = { label: string; explain: string; weight?: number };
export type AttentionRule = {
  key: string;
  tone: "red" | "gold";
  match: (p: PortfolioProjectSummary, ctx: AttentionContext) => AttentionMatch | null;
};
export type AttentionReason = { key: string; label: string; tone: "red" | "gold"; explain: string };
export type AttentionItem = { id: string; name: string; nextUp: string | null; reasons: AttentionReason[] };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const ATTENTION_RULES: AttentionRule[] = [
  {
    key: "escalation",
    tone: "red",
    match: (p) =>
      p.escalations.length > 0
        ? { label: "Needs escalation", explain: p.escalations.join(". ") }
        : null,
  },
  {
    key: "off_track",
    tone: "red",
    match: (p) =>
      p.health === "off_track"
        ? { label: "Off track", explain: "Health is off track: a critical issue, an off-track objective, or a badly overrun score." }
        : null,
  },
  {
    key: "at_risk",
    tone: "gold",
    match: (p) => (p.health === "at_risk" ? { label: "At risk", explain: "Health score is at risk." } : null),
  },
  {
    key: "overdue",
    tone: "red",
    match: (p) =>
      p.overdueTasks > 0
        ? {
            label: `${p.overdueTasks} overdue`,
            explain: `${p.overdueTasks} ${plural(p.overdueTasks, "task is", "tasks are")} past the due date and not done.`,
            weight: p.overdueTasks,
          }
        : null,
  },
  {
    key: "decisions",
    tone: "gold",
    match: (_p, ctx) =>
      ctx.openDecisions > 0
        ? {
            label: `${ctx.openDecisions} awaiting decision`,
            explain: `${ctx.openDecisions} ${plural(ctx.openDecisions, "decision is", "decisions are")} waiting for a response.`,
            weight: ctx.openDecisions,
          }
        : null,
  },
];

export function buildNeedsAttention(
  projects: PortfolioProjectSummary[],
  openDecisions: Record<string, number>,
  rules: AttentionRule[] = ATTENTION_RULES,
): AttentionItem[] {
  const scored: { item: AttentionItem; rank: number[] }[] = [];
  for (const p of projects) {
    const ctx: AttentionContext = { openDecisions: openDecisions[p.id] ?? 0 };
    const reasons: AttentionReason[] = [];
    const rank: number[] = [];
    for (const rule of rules) {
      const m = rule.match(p, ctx);
      if (m) {
        reasons.push({ key: rule.key, label: m.label, tone: rule.tone, explain: m.explain });
        rank.push(0, -(m.weight ?? 0));
      } else {
        rank.push(1, 0);
      }
    }
    if (reasons.length === 0) continue;
    scored.push({ item: { id: p.id, name: p.name, nextUp: p.nextUp, reasons }, rank });
  }
  scored.sort((a, b) => {
    for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
    return a.item.name.localeCompare(b.item.name);
  });
  return scored.map((s) => s.item);
}
