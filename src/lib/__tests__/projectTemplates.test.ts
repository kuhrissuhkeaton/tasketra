import { describe, it, expect } from "vitest";
import { PROJECT_TEMPLATES, getTemplate, isTemplateId, planPhases, templateCounts, templateSummary } from "../projectTemplates";

describe("project templates data", () => {
  it("has the four launch types with unique ids", () => {
    expect(PROJECT_TEMPLATES.map((t) => t.id)).toEqual(["process-improvement", "event-campaign", "software-launch", "construction"]);
    expect(new Set(PROJECT_TEMPLATES.map((t) => t.id)).size).toBe(PROJECT_TEMPLATES.length);
  });

  for (const t of PROJECT_TEMPLATES) {
    describe(t.name, () => {
      const planned = planPhases(t);

      it("lays phases end to end starting at day 0", () => {
        expect(planned[0].startDay).toBe(0);
        for (let i = 1; i < planned.length; i++) expect(planned[i].startDay).toBe(planned[i - 1].endDay);
      });

      it("gives every phase at least one task, and every task a real phase", () => {
        for (const task of t.tasks) {
          expect(task.phase).toBeGreaterThanOrEqual(0);
          expect(task.phase).toBeLessThan(t.phases.length);
        }
        for (let i = 0; i < t.phases.length; i++) expect(t.tasks.some((x) => x.phase === i)).toBe(true);
      });

      it("keeps each task due inside its own phase", () => {
        for (const task of t.tasks) {
          const p = planned[task.phase];
          expect(task.day, task.title).toBeGreaterThanOrEqual(p.startDay);
          expect(task.day, task.title).toBeLessThanOrEqual(p.endDay);
        }
      });

      it("lists tasks in due-date order", () => {
        const days = t.tasks.map((x) => x.day);
        expect(days).toEqual([...days].sort((a, b) => a - b));
      });

      it("keeps milestones inside the project span", () => {
        const end = planned[planned.length - 1].endDay;
        for (const m of t.milestones) {
          expect(m.day).toBeGreaterThan(0);
          expect(m.day).toBeLessThanOrEqual(end);
        }
      });

      it("has no duplicate titles and no empty text", () => {
        const titles = [...t.tasks.map((x) => x.title), ...t.risks.map((x) => x.title), ...t.milestones.map((x) => x.title), ...t.phases.map((x) => x.title)];
        expect(new Set(titles).size).toBe(titles.length);
        for (const s of [...titles, ...t.assumptions, ...t.stakeholders.map((x) => x.name), ...t.risks.map((x) => x.mitigation)]) expect(s.trim().length).toBeGreaterThan(0);
      });

      it("uses only values the database accepts", () => {
        for (const r of t.risks) {
          expect(["low", "medium", "high"]).toContain(r.probability);
          expect(["low", "medium", "high"]).toContain(r.impact);
        }
        for (const s of t.stakeholders) expect(["low", "medium", "high"]).toContain(s.interest);
        expect(["predictive", "hybrid", "agile"]).toContain(t.suggestedApproach);
      });
    });
  }

  it("recognises ids and looks templates up", () => {
    expect(isTemplateId("construction")).toBe(true);
    expect(isTemplateId("nope")).toBe(false);
    expect(isTemplateId(undefined)).toBe(false);
    expect(getTemplate("software-launch")?.name).toMatch(/Software/);
    expect(getTemplate("nope")).toBeUndefined();
  });

  it("describes what a template adds", () => {
    const t = getTemplate("process-improvement")!;
    expect(templateCounts(t)).toEqual({ phases: 5, milestones: 2, tasks: 17, risks: 5, stakeholders: 5, assumptions: 2 });
    expect(templateSummary(t)).toBe("5 phases, 2 milestones, 17 starter tasks, 5 risks, 5 stakeholder roles and 2 assumptions");
  });
});
