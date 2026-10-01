import { describe, it, expect } from "vitest";
import { buildStoredTemplate, sanitizeStored, LIMITS } from "../templateFromProject.ts";
import { planPhases } from "../../../src/lib/projectTemplates.ts";

const base = {
  roadmap: [
    { id: "p2", type: "phase", title: "Build", start_date: "2026-03-10", end_date: "2026-04-10" },
    { id: "p1", type: "phase", title: "Plan", start_date: "2026-03-01", end_date: "2026-03-15" },
    { id: "m1", type: "milestone", title: "Go live", start_date: "2026-04-12", end_date: null },
    { id: "m2", type: "release", title: "v1.0", start_date: "2026-04-20", end_date: null },
    { id: "e1", type: "event", title: "Conference", start_date: "2026-03-05", end_date: null },
    { id: "n1", type: "note", title: "A note", start_date: null, end_date: null },
  ],
  tasks: [
    { id: "t1", title: "Write plan", roadmap_item_id: "p1", start_date: null, due_date: "2026-03-08" },
    { id: "t2", title: "Loose task", roadmap_item_id: null, start_date: null, due_date: null },
    { id: "t3", title: "Undated in Build", roadmap_item_id: "p2", start_date: null, due_date: null },
  ],
  risks: [{ title: "Vendor slips", description: "d", probability: "high", impact: "weird", mitigation: "m" }],
  assumptions: ["Budget approved", "  "],
  approach: "agile",
};

describe("buildStoredTemplate", () => {
  const { data } = buildStoredTemplate(base);

  it("turns dates into day offsets from the earliest phase start, in start order", () => {
    expect(data.phases).toEqual([
      { title: "Plan", days: 14, startDay: 0 },
      { title: "Build", days: 31, startDay: 9 },
    ]);
  });
  it("keeps milestones and releases, drops events and notes", () => {
    expect(data.milestones).toEqual([{ title: "Go live", day: 42 }, { title: "v1.0", day: 50, type: "release" }]);
  });
  it("links tasks to phase positions, with undated tasks falling back to their phase end", () => {
    expect(data.tasks).toEqual([
      { title: "Write plan", phase: 0, day: 7 },
      { title: "Loose task", phase: -1, day: 0 },
      { title: "Undated in Build", phase: 1, day: 40 },
    ]);
  });
  it("keeps risks (bad levels become medium) and assumptions (blanks dropped), and saves no people", () => {
    expect(data.risks[0]).toMatchObject({ title: "Vendor slips", probability: "high", impact: "medium" });
    expect(data.assumptions).toEqual(["Budget approved"]);
    expect(data.stakeholders).toEqual([]);
    expect(data.approach).toBe("agile");
  });
  it("keeps overlapping phases overlapping when laid out again", () => {
    const planned = planPhases({ phases: data.phases } as any);
    expect(planned.map((p) => [p.startDay, p.endDay])).toEqual([[0, 14], [9, 40]]);
  });
  it("copies no owners, notes, statuses or dates", () => {
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/2026-/);
    expect(text).not.toMatch(/owner|status|email/i);
  });
  it("handles a project with no dates at all", () => {
    const r = buildStoredTemplate({ roadmap: [{ id: "a", type: "phase", title: "Only", start_date: null, end_date: null }], tasks: [{ id: "t", title: "T", roadmap_item_id: "a", start_date: null, due_date: null }], risks: [], assumptions: [] });
    expect(r.data.phases).toEqual([{ title: "Only", days: 14 }]);
    expect(r.data.tasks).toEqual([{ title: "T", phase: 0, day: 14 }]);
    expect(r.data.approach).toBe("hybrid");
  });
  it("caps big projects and says so", () => {
    const tasks = Array.from({ length: LIMITS.tasks + 5 }, (_, i) => ({ id: `t${i}`, title: `T${i}`, roadmap_item_id: null, start_date: null, due_date: null }));
    const r = buildStoredTemplate({ roadmap: [], tasks, risks: [], assumptions: [] });
    expect(r.data.tasks).toHaveLength(LIMITS.tasks);
    expect(r.truncated).toBe(true);
    expect(buildStoredTemplate(base).truncated).toBe(false);
  });
});

describe("sanitizeStored", () => {
  it("rejects junk and repairs out-of-range values", () => {
    expect(sanitizeStored(null)).toBeNull();
    expect(sanitizeStored("x")).toBeNull();
    const s = sanitizeStored({ phases: [{ title: "P", days: -5 }], tasks: [{ title: "T", phase: 9, day: 1e9 }], risks: [{ title: "R", probability: "x" }], assumptions: ["a", 3] })!;
    expect(s.phases[0].days).toBe(1);
    expect(s.tasks[0]).toMatchObject({ phase: -1, day: 3650 });
    expect(s.risks[0].probability).toBe("medium");
    expect(s.assumptions).toEqual(["a"]);
  });
  it("round-trips what the builder produces", () => {
    const { data } = buildStoredTemplate(base);
    expect(sanitizeStored(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
});
