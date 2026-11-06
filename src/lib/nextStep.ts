// The ONE next step for a project, computed from its Today data. The project
// home leads with this and nothing else competes with it: problems first
// (blocked, overdue, waiting, urgent), then the setup path for a young
// project (first task, first date, first stakeholder, first check-in), then
// staleness, then a quiet all-set state. Pure: the caller passes `now`.

export type NextStepAction =
  | { type: "tab"; tab: string; highlightId?: string; button: string }
  | { type: "checkin"; button: string }
  | null;

export type NextStep = {
  kind: "blocked" | "overdue" | "awaiting" | "issue" | "risk" | "first-task" | "first-date" | "first-stakeholder" | "checkin" | "stale" | "quiet";
  title: string;
  meta: string;
  action: NextStepAction;
  quiet: boolean;
};

export type NextStepInput = {
  blockedTasks: { id: string; title: string; updated_at: string }[];
  overdueTasks: { id: string; title: string; due_date: string | null }[];
  awaitingDecisions: { id: string; title: string; created_at: string; recipients: string[] }[];
  urgentIssues: { id: string; title: string }[];
  urgentRisks: { id: string; title: string }[];
  staleTasks: { id: string; title: string; updated_at: string }[];
  taskCount: number;
  datedTaskCount: number;
  stakeholderCount: number;
  /** Whole days since the newest status update, or null when there has never been one. */
  daysSinceCheckIn: number | null;
};

function daysBetween(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

function daysLate(dueDate: string | null, now: Date): number {
  if (!dueDate) return 0;
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00`);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((startOfToday.getTime() - due.getTime()) / 86_400_000));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function computeNextStep(input: NextStepInput, now: Date = new Date()): NextStep {
  const blocked = input.blockedTasks[0];
  if (blocked) {
    const days = daysBetween(blocked.updated_at, now);
    return {
      kind: "blocked",
      title: blocked.title,
      meta: `Blocked ${plural(days, "day")} · can you unblock it?`,
      action: { type: "tab", tab: "tasks", highlightId: blocked.id, button: "Open" },
      quiet: false,
    };
  }

  const overdue = input.overdueTasks[0];
  if (overdue) {
    const late = daysLate(overdue.due_date, now);
    return {
      kind: "overdue",
      title: overdue.title,
      meta: late > 0 ? `Overdue by ${plural(late, "day")}` : "Due today",
      action: { type: "tab", tab: "tasks", highlightId: overdue.id, button: "Open" },
      quiet: false,
    };
  }

  const awaiting = input.awaitingDecisions[0];
  if (awaiting) {
    const days = daysBetween(awaiting.created_at, now);
    const who = awaiting.recipients.length > 0 ? awaiting.recipients.join(", ") : "a stakeholder";
    return {
      kind: "awaiting",
      title: awaiting.title,
      meta: `Waiting on ${who} · ${plural(days, "day")}`,
      action: { type: "tab", tab: "decisions", highlightId: awaiting.id, button: "Open" },
      quiet: false,
    };
  }

  const issue = input.urgentIssues[0];
  if (issue) {
    return {
      kind: "issue",
      title: issue.title,
      meta: "High-severity issue still open",
      action: { type: "tab", tab: "issues", highlightId: issue.id, button: "Open" },
      quiet: false,
    };
  }

  const risk = input.urgentRisks[0];
  if (risk) {
    return {
      kind: "risk",
      title: risk.title,
      meta: "High-exposure risk",
      action: { type: "tab", tab: "risks", highlightId: risk.id, button: "Open" },
      quiet: false,
    };
  }

  if (input.taskCount === 0) {
    return {
      kind: "first-task",
      title: "Add your first task",
      meta: "A project starts with one concrete thing to do.",
      action: { type: "tab", tab: "tasks", button: "Add a task" },
      quiet: false,
    };
  }

  if (input.datedTaskCount === 0) {
    return {
      kind: "first-date",
      title: "Put a due date on a task",
      meta: "Dates turn a list into a plan. One is enough to start.",
      action: { type: "tab", tab: "tasks", button: "Open tasks" },
      quiet: false,
    };
  }

  if (input.stakeholderCount === 0) {
    return {
      kind: "first-stakeholder",
      title: "Add who this project answers to",
      meta: "One name is enough. Decisions and updates need somewhere to go.",
      action: { type: "tab", tab: "stakeholders", button: "Add a stakeholder" },
      quiet: false,
    };
  }

  if (input.daysSinceCheckIn === null || input.daysSinceCheckIn >= 7) {
    return {
      kind: "checkin",
      title: input.daysSinceCheckIn === null ? "Post your first check-in" : "Post this week's check-in",
      meta: input.daysSinceCheckIn === null
        ? "A line or two on how it's going. It takes a minute."
        : `Last check-in was ${plural(input.daysSinceCheckIn, "day")} ago.`,
      action: { type: "checkin", button: "Write a check-in" },
      quiet: false,
    };
  }

  const stale = input.staleTasks[0];
  if (stale) {
    const days = daysBetween(stale.updated_at, now);
    return {
      kind: "stale",
      title: stale.title,
      meta: `No movement in ${plural(days, "day")}`,
      action: { type: "tab", tab: "tasks", highlightId: stale.id, button: "Open" },
      quiet: false,
    };
  }

  const daysUntilNext = 7 - (input.daysSinceCheckIn ?? 0);
  return {
    kind: "quiet",
    title: "You're all set",
    meta: input.daysSinceCheckIn === 0
      ? "You checked in today. Nothing else needs you right now."
      : `Nothing needs you right now. Next check-in due in ${plural(daysUntilNext, "day")}.`,
    action: null,
    quiet: true,
  };
}
