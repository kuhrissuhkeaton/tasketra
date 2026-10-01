// Builds a reusable template from a real project (the pure part; the queries
// live in user-templates.mts). Everything becomes titles and day offsets from
// the project's own start: no fixed dates, no owners, no names, no emails, no
// notes, and statuses reset when the template is applied. Stakeholders are not
// saved. Pure, so it is unit tested without a database.

import type { ProjectTemplate, TemplateMilestone, TemplatePhase, TemplateRisk, TemplateTask } from "../../src/lib/projectTemplates.ts";

export type SrcRoadmapItem = { id: string; type: string; title: string; start_date: string | null; end_date: string | null };
export type SrcTask = { id: string; title: string; roadmap_item_id: string | null; start_date: string | null; due_date: string | null };
export type SrcRisk = { title: string; description: string | null; probability: string; impact: string; mitigation: string | null };

export const LIMITS = { phases: 30, milestones: 50, tasks: 200, risks: 50, assumptions: 50 };
const DEFAULT_PHASE_DAYS = 14;
const MAX_DAYS = 3650;

export type StoredTemplate = Pick<ProjectTemplate, "phases" | "milestones" | "tasks" | "risks" | "stakeholders" | "assumptions"> & {
  approach: "predictive" | "hybrid" | "agile";
};

const level = (v: string): "low" | "medium" | "high" => (v === "low" || v === "high" ? v : "medium");
const clip = (v: string | null | undefined, n: number) => (v ?? "").trim().slice(0, n);
const clampDay = (n: number) => Math.min(MAX_DAYS, Math.max(0, Math.round(n)));

function dayNumber(date: string | null | undefined): number | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return null;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}

export function buildStoredTemplate(
  src: { roadmap: SrcRoadmapItem[]; tasks: SrcTask[]; risks: SrcRisk[]; assumptions: string[]; approach?: string }
): { data: StoredTemplate; truncated: boolean } {
  let truncated = false;
  const cap = <T,>(list: T[], n: number): T[] => { if (list.length > n) truncated = true; return list.slice(0, n); };

  const phaseSrc = src.roadmap.filter((r) => r.type === "phase");
  const sortedPhases = [...phaseSrc].sort((a, b) => (dayNumber(a.start_date) ?? Infinity) - (dayNumber(b.start_date) ?? Infinity));
  const milestoneSrc = src.roadmap.filter((r) => r.type === "milestone" || r.type === "release");

  // Day 0 is the earliest dated thing in the project, preferring a phase start.
  const phaseStarts = phaseSrc.map((p) => dayNumber(p.start_date)).filter((n): n is number => n !== null);
  const allDays = [
    ...phaseStarts,
    ...milestoneSrc.map((m) => dayNumber(m.start_date ?? m.end_date)),
    ...src.tasks.map((t) => dayNumber(t.due_date)),
  ].filter((n): n is number => n !== null);
  const anchor = phaseStarts.length ? Math.min(...phaseStarts) : allDays.length ? Math.min(...allDays) : 0;
  const offset = (date: string | null): number | null => {
    const d = dayNumber(date);
    return d === null ? null : clampDay(d - anchor);
  };

  const keptPhases = cap(sortedPhases, LIMITS.phases);
  const phaseIndex = new Map<string, number>();
  const phaseEnd: number[] = [];
  const phases: TemplatePhase[] = keptPhases.map((p, i) => {
    phaseIndex.set(p.id, i);
    const start = offset(p.start_date);
    const s = dayNumber(p.start_date);
    const e = dayNumber(p.end_date);
    const days = s !== null && e !== null ? Math.min(MAX_DAYS, Math.max(1, e - s)) : DEFAULT_PHASE_DAYS;
    phaseEnd.push((start ?? 0) + days);
    return start === null
      ? { title: clip(p.title, 200) || "Phase", days }
      : { title: clip(p.title, 200) || "Phase", days, startDay: start };
  });

  const milestones: TemplateMilestone[] = cap(milestoneSrc, LIMITS.milestones).map((m) => ({
    title: clip(m.title, 200) || "Milestone",
    day: offset(m.start_date ?? m.end_date) ?? (phaseEnd.length ? Math.max(...phaseEnd) : 0),
    ...(m.type === "release" ? { type: "release" as const } : {}),
  }));

  const tasks: TemplateTask[] = cap(src.tasks, LIMITS.tasks).map((t) => {
    const idx = t.roadmap_item_id !== null && phaseIndex.has(t.roadmap_item_id) ? phaseIndex.get(t.roadmap_item_id)! : -1;
    return {
      title: clip(t.title, 200) || "Task",
      phase: idx,
      day: offset(t.due_date) ?? (idx >= 0 ? phaseEnd[idx] : 0),
    };
  });

  const risks: TemplateRisk[] = cap(src.risks, LIMITS.risks).map((r) => ({
    title: clip(r.title, 200) || "Risk",
    description: clip(r.description, 2000),
    probability: level(r.probability),
    impact: level(r.impact),
    mitigation: clip(r.mitigation, 2000),
  }));

  const assumptions = cap(src.assumptions.map((a) => clip(a, 500)).filter(Boolean), LIMITS.assumptions);
  const approach = src.approach === "predictive" || src.approach === "agile" ? src.approach : "hybrid";
  return { data: { phases, milestones, tasks, risks, stakeholders: [], assumptions, approach }, truncated };
}

/** Re-checks a stored document on read; returns null if it is not usable. */
export function sanitizeStored(raw: unknown): StoredTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as any;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(MAX_DAYS, Math.max(0, Math.round(v))) : d);
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  const phases: TemplatePhase[] = arr(r.phases).slice(0, LIMITS.phases).map((p: any) => ({
    title: str(p?.title, 200) || "Phase", days: Math.max(1, num(p?.days, DEFAULT_PHASE_DAYS)),
    ...(typeof p?.startDay === "number" ? { startDay: num(p.startDay, 0) } : {}),
  }));
  return {
    phases,
    milestones: arr(r.milestones).slice(0, LIMITS.milestones).map((m: any) => ({ title: str(m?.title, 200) || "Milestone", day: num(m?.day, 0), ...(m?.type === "release" ? { type: "release" as const } : {}) })),
    tasks: arr(r.tasks).slice(0, LIMITS.tasks).map((t: any) => ({
      title: str(t?.title, 200) || "Task",
      phase: Number.isInteger(t?.phase) && t.phase >= 0 && t.phase < phases.length ? t.phase : -1,
      day: num(t?.day, 0),
    })),
    risks: arr(r.risks).slice(0, LIMITS.risks).map((x: any) => ({ title: str(x?.title, 200) || "Risk", description: str(x?.description, 2000), probability: level(x?.probability), impact: level(x?.impact), mitigation: str(x?.mitigation, 2000) })),
    stakeholders: [],
    assumptions: arr(r.assumptions).slice(0, LIMITS.assumptions).map((a: any) => str(a, 500)).filter(Boolean),
    approach: r.approach === "predictive" || r.approach === "agile" ? r.approach : "hybrid",
  };
}
