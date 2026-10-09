import { describe, it, expect } from "vitest";
import { buildNeedsAttention, ATTENTION_RULES, type AttentionRule } from "../lib/needsAttention";
import type { PortfolioProjectSummary } from "../lib/api";

const P = (o: Partial<PortfolioProjectSummary>): PortfolioProjectSummary => ({
  id: "x", name: "X", stage: "plan", nextUp: null, escalations: [], totalTasks: 0, doneTasks: 0, overdueTasks: 0,
  openRisks: 0, highRisks: 0, openIssues: 0, highIssues: 0, cpi: null, spi: null, objectivesCount: 0,
  avgObjectiveProgress: null, health: "on_track", ...o,
});

describe("buildNeedsAttention", () => {
  it("skips healthy projects with nothing overdue or awaiting", () => {
    expect(buildNeedsAttention([P({ id: "a" })], {})).toEqual([]);
  });
  it("ranks escalation, then off track, at risk, overdue, decisions", () => {
    const out = buildNeedsAttention(
      [
        P({ id: "dec", name: "D" }),
        P({ id: "od", name: "O", overdueTasks: 3 }),
        P({ id: "risk", name: "R", health: "at_risk" }),
        P({ id: "off", name: "F", health: "off_track" }),
        P({ id: "esc", name: "E", escalations: ["Critical issue open"] }),
      ],
      { dec: 2 },
    );
    expect(out.map((i) => i.id)).toEqual(["esc", "off", "risk", "od", "dec"]);
  });
  it("lists every reason for a project", () => {
    const [i] = buildNeedsAttention([P({ id: "a", health: "at_risk", overdueTasks: 2 })], { a: 1 });
    expect(i.reasons.map((r) => r.label)).toEqual(["At risk", "2 overdue", "1 awaiting decision"]);
  });
  it("explains every reason in plain English", () => {
    const [i] = buildNeedsAttention([P({ id: "a", overdueTasks: 1, escalations: ["Critical issue open"] })], { a: 2 });
    const byKey = Object.fromEntries(i.reasons.map((r) => [r.key, r.explain]));
    expect(byKey.escalation).toBe("Critical issue open");
    expect(byKey.overdue).toBe("1 task is past the due date and not done.");
    expect(byKey.decisions).toBe("2 decisions are waiting for a response.");
  });
  it("can be re-ranked or extended by editing the rule list only", () => {
    const reordered = [...ATTENTION_RULES].sort((x, y) => (x.key === "overdue" ? -1 : y.key === "overdue" ? 1 : 0));
    const out = buildNeedsAttention(
      [P({ id: "esc", name: "E", escalations: ["x"] }), P({ id: "od", name: "O", overdueTasks: 1 })],
      {},
      reordered,
    );
    expect(out.map((i) => i.id)).toEqual(["od", "esc"]);
    const custom: AttentionRule[] = [{ key: "big", tone: "red", match: (p) => (p.openRisks > 5 ? { label: "Many risks", explain: "More than five open risks." } : null) }];
    expect(buildNeedsAttention([P({ id: "r", openRisks: 6 }), P({ id: "q" })], {}, custom).map((i) => i.id)).toEqual(["r"]);
  });
});
