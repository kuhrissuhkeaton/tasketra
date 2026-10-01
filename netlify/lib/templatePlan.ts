// Works out what a project template would add to a project, and what it would
// skip because the project already has an item with the same title. Pure (no
// database), so the preview and the real apply cannot disagree.
//
// Matching is by title, ignoring case and extra spaces, within the same kind
// of thing: a template phase only matches an existing phase, a task only an
// existing task, and so on. Nothing the project already has is ever changed.

import { planPhases, type ProjectTemplate } from "../../src/lib/projectTemplates.ts";

export type ExistingWork = {
  roadmap: { id: string; type: string; title: string }[];
  tasks: string[];
  risks: string[];
  assumptions: string[];
  stakeholders: string[];
};

export const EMPTY_WORK: ExistingWork = { roadmap: [], tasks: [], risks: [], assumptions: [], stakeholders: [] };

export function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export type PlannedPhase = { index: number; title: string; startDay: number; endDay: number; existingId: string | null };
export type PlannedMilestone = { title: string; day: number; type: "milestone" | "release"; exists: boolean };
export type PlannedTask = { title: string; phase: number; day: number; exists: boolean };
export type PlannedRisk = { title: string; description: string; probability: string; impact: string; mitigation: string; exists: boolean };
export type PlannedAssumption = { statement: string; exists: boolean };
export type PlannedStakeholder = { name: string; role: string; interest: string; notes: string; exists: boolean };

export type TemplatePlan = {
  phases: PlannedPhase[];
  milestones: PlannedMilestone[];
  tasks: PlannedTask[];
  risks: PlannedRisk[];
  assumptions: PlannedAssumption[];
  stakeholders: PlannedStakeholder[];
};

export function planTemplate(t: ProjectTemplate, existing: ExistingWork): TemplatePlan {
  const has = (list: string[]) => {
    const set = new Set(list.map(norm));
    return (title: string) => set.has(norm(title));
  };
  const phaseByTitle = new Map(existing.roadmap.filter((r) => r.type === "phase").map((r) => [norm(r.title), r.id]));
  const milestoneExists = has(existing.roadmap.filter((r) => r.type === "milestone" || r.type === "release").map((r) => r.title));
  const taskExists = has(existing.tasks);
  const riskExists = has(existing.risks);
  const assumptionExists = has(existing.assumptions);
  const stakeholderExists = has(existing.stakeholders);

  return {
    phases: planPhases(t).map((p, index) => ({ index, ...p, existingId: phaseByTitle.get(norm(p.title)) ?? null })),
    milestones: t.milestones.map((m) => ({ title: m.title, day: m.day, type: m.type ?? "milestone", exists: milestoneExists(m.title) })),
    tasks: t.tasks.map((x) => ({ title: x.title, phase: x.phase, day: x.day, exists: taskExists(x.title) })),
    risks: t.risks.map((r) => ({ ...r, exists: riskExists(r.title) })),
    assumptions: t.assumptions.map((statement) => ({ statement, exists: assumptionExists(statement) })),
    stakeholders: t.stakeholders.map((s) => ({ name: s.name, role: s.role, interest: s.interest, notes: s.notes, exists: stakeholderExists(s.name) })),
  };
}

export type CategorySummary = { add: string[]; skip: string[] };
export type PlanSummary = {
  phases: CategorySummary;
  milestones: CategorySummary;
  tasks: CategorySummary;
  risks: CategorySummary;
  assumptions: CategorySummary;
  stakeholders: CategorySummary;
  totalToAdd: number;
};

function split(items: { label: string; exists: boolean }[]): CategorySummary {
  return { add: items.filter((i) => !i.exists).map((i) => i.label), skip: items.filter((i) => i.exists).map((i) => i.label) };
}

export function summarizePlan(plan: TemplatePlan): PlanSummary {
  const s = {
    phases: split(plan.phases.map((p) => ({ label: p.title, exists: p.existingId !== null }))),
    milestones: split(plan.milestones.map((m) => ({ label: m.title, exists: m.exists }))),
    tasks: split(plan.tasks.map((x) => ({ label: x.title, exists: x.exists }))),
    risks: split(plan.risks.map((r) => ({ label: r.title, exists: r.exists }))),
    assumptions: split(plan.assumptions.map((a) => ({ label: a.statement, exists: a.exists }))),
    stakeholders: split(plan.stakeholders.map((x) => ({ label: x.name, exists: x.exists }))),
  };
  const totalToAdd = Object.values(s).reduce((n, c) => n + c.add.length, 0);
  return { ...s, totalToAdd };
}
