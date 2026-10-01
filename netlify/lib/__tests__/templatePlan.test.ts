import { describe, it, expect } from "vitest";
import { planTemplate, summarizePlan, norm, EMPTY_WORK } from "../templatePlan.ts";
import { getTemplate } from "../../../src/lib/projectTemplates.ts";

const t = getTemplate("process-improvement")!;

describe("planTemplate", () => {
  it("adds everything to an empty project", () => {
    const s = summarizePlan(planTemplate(t, EMPTY_WORK));
    expect(s.phases.add).toHaveLength(t.phases.length);
    expect(s.tasks.add).toHaveLength(t.tasks.length);
    expect(s.risks.add).toHaveLength(t.risks.length);
    expect(s.totalToAdd).toBe(t.phases.length + t.milestones.length + t.tasks.length + t.risks.length + t.assumptions.length + t.stakeholders.length);
    expect(Object.values(s).filter((c: any) => c.skip).every((c: any) => c.skip.length === 0)).toBe(true);
  });

  it("matches titles ignoring case and extra spaces, within the same kind only", () => {
    const plan = planTemplate(t, {
      roadmap: [
        { id: "ph1", type: "phase", title: "  assess " },
        { id: "m1", type: "milestone", title: t.phases[1].title }, // a MILESTONE named like phase 2 must not match the phase
      ],
      tasks: [t.tasks[0].title.toUpperCase()],
      risks: [], assumptions: [], stakeholders: [],
    });
    expect(plan.phases[0].existingId).toBe("ph1");
    expect(plan.phases[1].existingId).toBeNull();
    expect(plan.tasks[0].exists).toBe(true);
    expect(plan.tasks[1].exists).toBe(false);
  });

  it("is idempotent: planning against what a first apply would have created adds nothing", () => {
    const first = planTemplate(t, EMPTY_WORK);
    const existing = {
      roadmap: [
        ...first.phases.map((p, i) => ({ id: `p${i}`, type: "phase", title: p.title })),
        ...first.milestones.map((m, i) => ({ id: `m${i}`, type: m.type, title: m.title })),
      ],
      tasks: first.tasks.map((x) => x.title),
      risks: first.risks.map((x) => x.title),
      assumptions: first.assumptions.map((x) => x.statement),
      stakeholders: first.stakeholders.map((x) => x.name),
    };
    expect(summarizePlan(planTemplate(t, existing)).totalToAdd).toBe(0);
  });

  it("norm collapses whitespace and case", () => {
    expect(norm("  A   b\tC ")).toBe("a b c");
  });
});
