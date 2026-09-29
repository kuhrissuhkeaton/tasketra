// The stage-aware "Next up" checklist on a project's Home tab. Every row is
// derived from data that already exists (tasks, risks, budget, and so on),
// never from a separate checkbox someone has to tick. Pure functions, no
// database, so the rules can be unit tested on their own.

import type { ProjectSize } from "./projectSetup.ts";

export type Stage = "initiate" | "plan" | "execute" | "close";

export const STAGES: Stage[] = ["initiate", "plan", "execute", "close"];

export const STAGE_LABEL: Record<Stage, string> = {
  initiate: "Initiate",
  plan: "Plan",
  execute: "Execute",
  close: "Close",
};

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as string[]).includes(v);
}

/** How many items the Closure tab's checklist has. Kept in step with
 *  CLOSURE_CHECKLIST_ITEMS in ProjectHome.tsx. */
export const CLOSURE_TOTAL = 5;

export type StageCounts = {
  tasks: number;
  datedTasks: number;
  stakeholders: number;
  risks: number;
  hasBudgetBaseline: boolean;
  blockedTasks: number;
  openChangeRequests: number;
  openRisks: number;
  staleRisks: number;
  openIssues: number;
  cpi: number | null;
  statusUpdatesLast7Days: number;
  closureChecked: number;
  charterWritten: boolean;
  baselineLocked: boolean;
};

export type ChecklistStatus = "done" | "partial" | "todo";

export type ChecklistItem = {
  id: string;
  title: string;
  meta: string;
  status: ChecklistStatus;
  /** Tab the row's action opens (a Tab id in ProjectHome). */
  tab: string;
  action: string;
};

export type StageChecklist = {
  title: string;
  items: ChecklistItem[];
  done: number;
  total: number;
  /** Optional work worth knowing about in this stage, shown as one line. */
  optionalNote: string | null;
};

function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function initiateItems(c: StageCounts): ChecklistItem[] {
  return [
    {
      id: "charter",
      title: "Write the charter",
      meta: c.charterWritten ? "Purpose is written down" : "Say why the project exists, what is in scope, and who sponsors it",
      status: c.charterWritten ? "done" : "todo",
      tab: "charter",
      action: c.charterWritten ? "View charter" : "Write the charter",
    },
    {
      id: "first-tasks",
      title: "Outline the first tasks",
      meta: c.tasks > 0 ? `${plural(c.tasks, "task")} listed` : "No tasks yet. A rough list is enough at this point.",
      status: c.tasks > 0 ? "done" : "todo",
      tab: "tasks",
      action: c.tasks > 0 ? "View tasks" : "Add a task",
    },
    {
      id: "stakeholders",
      title: "Identify stakeholders",
      meta: c.stakeholders > 0 ? `${plural(c.stakeholders, "stakeholder")} listed` : "No stakeholders yet",
      status: c.stakeholders > 0 ? "done" : "todo",
      tab: "stakeholders",
      action: c.stakeholders > 0 ? "View stakeholders" : "Add a stakeholder",
    },
    {
      id: "early-risks",
      title: "Note early risks",
      meta: c.risks > 0 ? `${plural(c.risks, "risk")} logged` : "0 risks logged so far",
      status: c.risks > 0 ? "done" : "todo",
      tab: "risks",
      action: c.risks > 0 ? "View risks" : "Add a risk",
    },
  ];
}

function planItems(c: StageCounts, size: ProjectSize): ChecklistItem[] {
  const wbs: ChecklistItem =
    c.tasks >= 3
      ? { id: "wbs", title: "Work breakdown built", meta: `${plural(c.tasks, "task")} in the plan`, status: "done", tab: "tasks", action: "View tasks" }
      : c.tasks > 0
        ? { id: "wbs", title: "Build out the work breakdown", meta: `${plural(c.tasks, "task")} so far. Most plans need a few more.`, status: "partial", tab: "tasks", action: "Add tasks" }
        : { id: "wbs", title: "Build the work breakdown", meta: "No tasks yet", status: "todo", tab: "tasks", action: "Add tasks" };

  let schedule: ChecklistItem;
  if (c.tasks === 0) {
    schedule = { id: "schedule", title: "Set the schedule", meta: "Add tasks first, then give them dates", status: "todo", tab: "roadmap", action: "Open roadmap" };
  } else if (c.datedTasks >= c.tasks) {
    schedule = { id: "schedule", title: "Schedule dates set", meta: `All ${c.tasks} tasks have dates`, status: "done", tab: "roadmap", action: "View roadmap" };
  } else if (c.datedTasks > 0) {
    schedule = {
      id: "schedule", title: "Schedule dates set",
      meta: `${c.datedTasks} of ${c.tasks} tasks have dates. ${c.tasks - c.datedTasks} still need one.`,
      status: "partial", tab: "tasks", action: "Add dates",
    };
  } else {
    schedule = { id: "schedule", title: "Set the schedule", meta: `None of your ${plural(c.tasks, "task")} have dates yet`, status: "todo", tab: "tasks", action: "Add dates" };
  }

  const rows: ChecklistItem[] = [
    wbs,
    schedule,
    {
      id: "stakeholders",
      title: "Stakeholders identified",
      meta: c.stakeholders > 0 ? `${plural(c.stakeholders, "stakeholder")} listed` : "No stakeholders yet",
      status: c.stakeholders > 0 ? "done" : "todo",
      tab: "stakeholders",
      action: c.stakeholders > 0 ? "View stakeholders" : "Add a stakeholder",
    },
    {
      id: "budget",
      title: c.hasBudgetBaseline ? "Budget baseline set" : "Set the budget baseline",
      meta: c.hasBudgetBaseline ? "Approved budget is on file" : "No approved budget or contingency reserve yet",
      status: c.hasBudgetBaseline ? "done" : "todo",
      tab: "budget",
      action: c.hasBudgetBaseline ? "View budget" : "Open budget",
    },
    {
      id: "risks",
      title: c.risks > 0 ? "Risks logged" : "Log your first risks",
      meta: c.risks > 0 ? `${plural(c.risks, "risk")} in the register` : "0 risks logged. Add the top few before you start.",
      status: c.risks > 0 ? "done" : "todo",
      tab: "risks",
      action: c.risks > 0 ? "View risks" : "Add a risk",
    },
    {
      id: "baseline",
      title: c.baselineLocked ? "Baseline locked" : "Lock the baseline",
      meta: c.baselineLocked ? "Schedule and budget are snapshotted, so drift shows up" : "Snapshot the schedule and budget once they are agreed",
      status: c.baselineLocked ? "done" : "todo",
      tab: "roadmap",
      action: c.baselineLocked ? "View baseline" : "Lock baseline",
    },
  ];
  // Light projects hide the Budget tab, so never send them there.
  return size === "light" ? rows.filter((r) => r.id !== "budget") : rows;
}

function executeItems(c: StageCounts, size: ProjectSize): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  items.push(
    c.openChangeRequests > 0
      ? { id: "changes", title: "Decide on open change requests", meta: `${plural(c.openChangeRequests, "request")} waiting on a decision`, status: "todo", tab: "decisions", action: "Open requests" }
      : { id: "changes", title: "Change requests decided", meta: "Nothing waiting", status: "done", tab: "decisions", action: "View requests" }
  );

  items.push(
    c.staleRisks > 0
      ? { id: "risk-review", title: "Re-score the open risks", meta: `${c.staleRisks} of ${plural(c.openRisks, "open risk")} not reviewed in 30 days`, status: c.staleRisks >= c.openRisks ? "todo" : "partial", tab: "risks", action: "Open risks" }
      : { id: "risk-review", title: "Risks reviewed recently", meta: c.openRisks > 0 ? `${plural(c.openRisks, "open risk")}, all reviewed in the last 30 days` : "No open risks", status: "done", tab: "risks", action: "View risks" }
  );

  // Budget tab is hidden in Light, so its cost rows are skipped there.
  if (size !== "light") {
    if (c.hasBudgetBaseline && c.cpi !== null) {
      const ok = c.cpi >= 0.9;
      items.push({
        id: "budget-check",
        title: ok ? "Budget compared to baseline" : "Cost is running over baseline",
        meta: `Cost index ${c.cpi.toFixed(2)}${ok ? ", within a normal range" : ", below 0.90"}`,
        status: ok ? "done" : "todo",
        tab: "budget",
        action: ok ? "View budget" : "Open budget",
      });
    } else if (!c.hasBudgetBaseline) {
      items.push({ id: "budget-check", title: "Add a budget baseline", meta: "Needed to compare cost against plan", status: "todo", tab: "budget", action: "Open budget" });
    }
  }

  items.push(
    c.statusUpdatesLast7Days > 0
      ? { id: "status", title: "Status shared this week", meta: `${plural(c.statusUpdatesLast7Days, "update")} posted in the last 7 days`, status: "done", tab: "report", action: "View report" }
      : { id: "status", title: "Send the weekly status report", meta: "Nothing posted in the last 7 days", status: "todo", tab: "report", action: "Open report" }
  );

  return items;
}

function closeItems(c: StageCounts): ChecklistItem[] {
  const closureDone = c.closureChecked >= CLOSURE_TOTAL;
  return [
    {
      id: "closure",
      title: closureDone ? "Closure checklist complete" : "Finish the closure checklist",
      meta: `${c.closureChecked} of ${CLOSURE_TOTAL} items checked`,
      status: closureDone ? "done" : c.closureChecked > 0 ? "partial" : "todo",
      tab: "closure",
      action: "Open closure",
    },
    {
      id: "open-issues",
      title: c.openIssues > 0 ? "Resolve or accept open issues" : "No open issues",
      meta: c.openIssues > 0 ? `${plural(c.openIssues, "issue")} still open` : "Nothing left to resolve",
      status: c.openIssues > 0 ? "todo" : "done",
      tab: "issues",
      action: c.openIssues > 0 ? "Open issues" : "View issues",
    },
    {
      id: "open-risks",
      title: c.openRisks > 0 ? "Resolve or accept open risks" : "No open risks",
      meta: c.openRisks > 0 ? `${plural(c.openRisks, "risk")} still open` : "Nothing left to resolve",
      status: c.openRisks > 0 ? "todo" : "done",
      tab: "risks",
      action: c.openRisks > 0 ? "Open risks" : "View risks",
    },
  ];
}

const TITLES: Record<Stage, string> = {
  initiate: "Next up in Initiate",
  plan: "Next up in Plan",
  execute: "This week's check",
  close: "Before you close",
};

// Names only the optional Plan work this project's size actually shows.
function planOptionalNote(size: ProjectSize): string | null {
  if (size === "light") return null;
  if (size === "standard") return "Optional in Plan: vendors";
  return "Optional in Plan: comms plan, quality standards, vendors";
}

export function stageChecklist(stage: Stage, counts: StageCounts, size: ProjectSize = "standard"): StageChecklist {
  const items =
    stage === "initiate" ? initiateItems(counts)
    : stage === "plan" ? planItems(counts, size)
    : stage === "execute" ? executeItems(counts, size)
    : closeItems(counts);
  return {
    title: TITLES[stage],
    items,
    done: items.filter((i) => i.status === "done").length,
    total: items.length,
    optionalNote: stage === "plan" ? planOptionalNote(size) : null,
  };
}

export type MonitorBand = { state: "quiet" | "attention" | "escalate"; message: string };

/** The Monitor and control band under the stage steps. It never turns red;
 *  escalation tolerances are a later slice. */
export function monitorBand(stage: Stage, c: StageCounts, escalations: string[] = []): MonitorBand {
  if (escalations.length > 0) return { state: "escalate", message: `Needs escalation: ${escalations.join(". ")}` };
  if (stage === "initiate") return { state: "quiet", message: "Starts once the plan is in place." };
  const parts: string[] = [];
  if (c.blockedTasks > 0) parts.push(plural(c.blockedTasks, "blocked task"));
  if (c.openChangeRequests > 0) parts.push(plural(c.openChangeRequests, "open change request"));
  if (parts.length === 0) return { state: "quiet", message: "Runs from Plan to Close. Nothing to escalate." };
  return { state: "attention", message: parts.join(" and ") };
}
