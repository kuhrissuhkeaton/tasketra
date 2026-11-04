// "Needs a look" on the Dashboard (v142): the glance list next to the calendar.
// Where buildNeedsAttention renders per-project pills, this renders the same
// underlying truth as plain sentences, one per fired rule, ranked and capped.
//
// To change what is said or how it ranks, edit LOOK_RULES below (or pass your
// own list to buildNeedsALook). Rules are ordered by importance: a sentence
// from an earlier rule always ranks above one from a later rule, and within a
// rule a bigger count (or an older age) ranks first. No new scoring: health
// still comes from the portfolio rollup, and every other signal is a count or
// an age computed by the caller from data the Dashboard already loads. A rule
// whose age the caller could not establish simply falls back to saying the
// count, or does not fire at all -- it never guesses.

import type { PortfolioProjectSummary } from "./api";
import { projectReasonParts } from "./projectReason";

export type LookContext = {
  /** Open decision requests for the project (from the projects list). */
  openDecisions: number;
  /** Days since the project's earliest-due open task's due date, when overdue and known. */
  oldestOverdueDays: number | null;
  /** Days since the project's oldest still-open decision was raised, when known for all of them. */
  oldestDecisionDays: number | null;
  /** Days since the project's last recorded activity, when known. */
  quietDays: number | null;
};

export type LookMatch = { rest: string; weight?: number };
export type LookRule = {
  key: string;
  match: (p: PortfolioProjectSummary, ctx: LookContext) => LookMatch | null;
};
export type LookSentence = { id: string; name: string; key: string; rest: string };

export const LOOK_CAP = 5;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const days = (n: number) => `${n} ${plural(n, "day", "days")}`;

type Health = PortfolioProjectSummary["health"];

const HEALTH_LABEL: Record<Health, string> = { on_track: "on track", at_risk: "at risk", off_track: "off track" };
const SEVERITY: Record<Health, number> = { on_track: 0, at_risk: 1, off_track: 2 };

/** The status stated in the latest check-in (v143) disagrees with the computed health. */
const diverges = (p: PortfolioProjectSummary) => p.statedHealth != null && p.statedHealth !== p.health;

export const LOOK_RULES: LookRule[] = [
  {
    key: "escalation",
    match: (p) =>
      p.escalations.length > 0
        ? { rest: `: needs escalation. ${p.escalations.join(". ")}`, weight: p.escalations.length }
        : null,
  },
  {
    // The stated status and the evidence point different ways (v145). The
    // sentence carries both halves, so the plain health rules below stand
    // down for the same project.
    key: "divergence",
    match: (p) => {
      if (!diverges(p)) return null;
      const stated = p.statedHealth as Health;
      const weight = Math.abs(SEVERITY[stated] - SEVERITY[p.health]);
      return SEVERITY[stated] < SEVERITY[p.health]
        ? { rest: `: stated ${HEALTH_LABEL[stated]}, but evidence suggests ${HEALTH_LABEL[p.health]}.`, weight }
        : { rest: `: stated ${HEALTH_LABEL[stated]}, though the numbers suggest ${HEALTH_LABEL[p.health]}.`, weight };
    },
  },
  {
    key: "off_track",
    match: (p, ctx) => {
      if (p.health !== "off_track") return null;
      if (diverges(p)) return null;
      // projectReasonParts only surfaces its plain health explanation when
      // nothing more specific is flagged; those specifics get their own
      // sentences below, so borrow the explanation when it is there.
      const part = projectReasonParts(p, ctx.openDecisions).find(
        (x) => !x.tab && x.text.startsWith("Off track:"),
      );
      return { rest: part ? ` is off track: ${part.text.slice("Off track: ".length)}.` : " is off track." };
    },
  },
  {
    key: "overdue",
    match: (p, ctx) =>
      p.overdueTasks > 0
        ? {
            rest:
              ctx.oldestOverdueDays !== null
                ? `: ${p.overdueTasks} ${plural(p.overdueTasks, "task", "tasks")} past due, the oldest by ${days(ctx.oldestOverdueDays)}.`
                : `: ${p.overdueTasks} ${plural(p.overdueTasks, "task", "tasks")} past due.`,
            weight: p.overdueTasks,
          }
        : null,
  },
  {
    key: "decisions",
    match: (_p, ctx) =>
      ctx.openDecisions > 0
        ? {
            rest:
              ctx.oldestDecisionDays !== null
                ? `: ${ctx.openDecisions} ${plural(ctx.openDecisions, "decision", "decisions")} waiting, the oldest for ${days(ctx.oldestDecisionDays)}.`
                : `: ${ctx.openDecisions} ${plural(ctx.openDecisions, "decision", "decisions")} waiting for a response.`,
            weight: ctx.openDecisions,
          }
        : null,
  },
  {
    key: "at_risk",
    match: (p) => (p.health === "at_risk" && !diverges(p) ? { rest: " is at risk." } : null),
  },
  {
    key: "quiet",
    match: (_p, ctx) =>
      ctx.quietDays !== null && ctx.quietDays >= 14
        ? { rest: `: no activity in ${days(ctx.quietDays)}.`, weight: ctx.quietDays }
        : null,
  },
];

const EMPTY_CONTEXT: LookContext = {
  openDecisions: 0,
  oldestOverdueDays: null,
  oldestDecisionDays: null,
  quietDays: null,
};

export function buildNeedsALook(
  projects: PortfolioProjectSummary[],
  context: Record<string, Partial<LookContext>>,
  rules: LookRule[] = LOOK_RULES,
  cap: number = LOOK_CAP,
): LookSentence[] {
  const scored: { sentence: LookSentence; rank: number[] }[] = [];
  for (const p of projects) {
    // A closed project never needs a look: its leftover dates are history.
    if (p.closed_at) continue;
    const ctx: LookContext = { ...EMPTY_CONTEXT, ...(context[p.id] ?? {}) };
    rules.forEach((rule, ruleIndex) => {
      const m = rule.match(p, ctx);
      if (m) {
        scored.push({
          sentence: { id: p.id, name: p.name, key: rule.key, rest: m.rest },
          rank: [ruleIndex, -(m.weight ?? 0)],
        });
      }
    });
  }
  scored.sort((a, b) => {
    for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
    return a.sentence.name.localeCompare(b.sentence.name);
  });
  return scored.slice(0, cap).map((s) => s.sentence);
}
