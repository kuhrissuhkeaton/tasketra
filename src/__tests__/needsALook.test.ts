import { describe, it, expect } from "vitest";
import { buildNeedsALook, LOOK_RULES, type LookRule } from "../lib/needsALook";
import type { PortfolioProjectSummary } from "../lib/api";

const P = (o: Partial<PortfolioProjectSummary>): PortfolioProjectSummary => ({
  id: "x", name: "X", stage: "plan", nextUp: null, escalations: [], totalTasks: 0, doneTasks: 0, overdueTasks: 0,
  openRisks: 0, highRisks: 0, openIssues: 0, highIssues: 0, cpi: null, spi: null, objectivesCount: 0,
  avgObjectiveProgress: null, health: "on_track", ...o,
});

const texts = (out: ReturnType<typeof buildNeedsALook>) => out.map((s) => `${s.name}${s.rest}`);

describe("buildNeedsALook", () => {
  it("says nothing for a healthy project with nothing overdue, waiting or quiet", () => {
    expect(buildNeedsALook([P({ id: "a" })], {})).toEqual([]);
  });

  it("never flags a closed project", () => {
    const out = buildNeedsALook(
      [P({ id: "c", name: "C", closed_at: "2026-10-01", health: "off_track", overdueTasks: 4, escalations: ["Critical issue open"] })],
      { c: { openDecisions: 2, quietDays: 40 } },
    );
    expect(out).toEqual([]);
  });

  it("leads with the escalation text", () => {
    const out = buildNeedsALook([P({ id: "a", name: "Atlas", escalations: ["Critical issue open"] })], {});
    expect(texts(out)).toEqual(["Atlas: needs escalation. Critical issue open"]);
  });

  it("says a project is off track, with the health explanation when nothing more specific is flagged", () => {
    expect(texts(buildNeedsALook([P({ id: "a", name: "Atlas", health: "off_track" })], {}))).toEqual([
      "Atlas is off track: a critical issue, an off-track objective, or a badly overrun score.",
    ]);
    // With overdue tasks also flagged, the explanation gives way to the plainer sentence.
    const out = buildNeedsALook([P({ id: "a", name: "Atlas", health: "off_track", overdueTasks: 2 })], {});
    expect(texts(out)).toContain("Atlas is off track.");
  });

  it("ages overdue tasks from the caller's oldest age, and falls back to the count alone", () => {
    const p = P({ id: "a", name: "Atlas", overdueTasks: 3 });
    expect(texts(buildNeedsALook([p], { a: { oldestOverdueDays: 9 } }))).toEqual([
      "Atlas: 3 tasks past due, the oldest by 9 days.",
    ]);
    expect(texts(buildNeedsALook([p], {}))).toEqual(["Atlas: 3 tasks past due."]);
    const one = P({ id: "a", name: "Atlas", overdueTasks: 1 });
    expect(texts(buildNeedsALook([one], { a: { oldestOverdueDays: 1 } }))).toEqual([
      "Atlas: 1 task past due, the oldest by 1 day.",
    ]);
  });

  it("ages waiting decisions, and falls back to the count-only sentence when the age is unknown", () => {
    const p = P({ id: "a", name: "Atlas" });
    expect(texts(buildNeedsALook([p], { a: { openDecisions: 2, oldestDecisionDays: 6 } }))).toEqual([
      "Atlas: 2 decisions waiting, the oldest for 6 days.",
    ]);
    expect(texts(buildNeedsALook([p], { a: { openDecisions: 2 } }))).toEqual([
      "Atlas: 2 decisions waiting for a response.",
    ]);
    expect(texts(buildNeedsALook([p], { a: { openDecisions: 1 } }))).toEqual([
      "Atlas: 1 decision waiting for a response.",
    ]);
  });

  it("says a project is at risk", () => {
    expect(texts(buildNeedsALook([P({ id: "a", name: "Atlas", health: "at_risk" })], {}))).toEqual(["Atlas is at risk."]);
  });

  it("flags a quiet project only at 14 days or more, and only when the age is known", () => {
    const p = P({ id: "a", name: "Atlas" });
    expect(buildNeedsALook([p], { a: { quietDays: 13 } })).toEqual([]);
    expect(texts(buildNeedsALook([p], { a: { quietDays: 20 } }))).toEqual(["Atlas: no activity in 20 days."]);
    expect(buildNeedsALook([p], { a: { quietDays: null } })).toEqual([]);
  });

  it("ranks by rule order, then by the bigger count within a rule", () => {
    const out = buildNeedsALook(
      [
        P({ id: "quiet", name: "Q" }),
        P({ id: "risk", name: "R", health: "at_risk" }),
        P({ id: "dec", name: "D" }),
        P({ id: "od2", name: "O2", overdueTasks: 2 }),
        P({ id: "od5", name: "O5", overdueTasks: 5 }),
        P({ id: "off", name: "F", health: "off_track" }),
        P({ id: "esc", name: "E", escalations: ["Critical issue open"] }),
      ],
      { dec: { openDecisions: 1 }, quiet: { quietDays: 30 } },
      LOOK_RULES,
      10,
    );
    expect(out.map((s) => s.id)).toEqual(["esc", "off", "od5", "od2", "dec", "risk", "quiet"]);
  });

  it("caps the list at five sentences by default", () => {
    const projects = ["A", "B", "C", "D", "E", "F"].map((n, i) =>
      P({ id: `p${i}`, name: n, escalations: ["Critical issue open"], overdueTasks: 3 }),
    );
    const out = buildNeedsALook(projects, {});
    expect(out).toHaveLength(5);
    expect(out.every((s) => s.key === "escalation")).toBe(true);
  });

  it("can be re-ranked or extended by editing the rule list only", () => {
    const custom: LookRule[] = [
      { key: "big", match: (p) => (p.openRisks > 5 ? { rest: ": more than five open risks." } : null) },
    ];
    const out = buildNeedsALook([P({ id: "r", name: "R", openRisks: 6 }), P({ id: "q", name: "Q" })], {}, custom);
    expect(texts(out)).toEqual(["R: more than five open risks."]);
  });
});
