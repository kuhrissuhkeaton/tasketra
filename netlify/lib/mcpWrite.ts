// Write tools behind the MCP server (v170). Each function takes the token
// owner's user id, applies the same project-access rule as the read tools,
// and mutates through the same tables and activity-log helper the app's own
// endpoints use, so a change made over MCP looks exactly like a change made
// in the app — except its activity summary carries the "via MCP" marker the
// build plan requires, and the actor is the token owner (the MCP handler
// runs the call inside runWithUser, so logActivity records them).
//
// Guardrails from the AI principles: schemas require the actual values (no
// defaulting a status, a health, a probability, or a date), and nothing
// here invents data the caller did not supply.

import crypto from "node:crypto";
import { McpToolError, projectOrThrow } from "./mcpData.ts";
import { logActivity, diffSummary } from "./activity.ts";
import { HEALTH_LABEL } from "../../src/lib/healthLabels.ts";

const TASK_STATUSES = ["not_started", "in_progress", "blocked", "done"];
const RISK_LEVELS = ["low", "medium", "high"];
const HEALTH_VALUES = ["on_track", "at_risk", "off_track"];

/** Strict YYYY-MM-DD with a real calendar date, or a plain-language error. */
function dateOrThrow(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new McpToolError(`${field} must be a date in YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new McpToolError(`${field} must be a real calendar date in YYYY-MM-DD format.`);
  }
  return value;
}

function titleOrThrow(value: unknown): string {
  const title = typeof value === "string" ? value.trim() : "";
  if (!title) throw new McpToolError("title is required.");
  return title;
}

function dateKey(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export async function mcpCreateTask(database: any, userId: string, args: any) {
  const project = await projectOrThrow(database, userId, args?.project_id);
  const title = titleOrThrow(args?.title);
  const dueDate =
    args?.due_date === undefined || args?.due_date === null ? null : dateOrThrow(args.due_date, "due_date");
  const description = typeof args?.description === "string" && args.description.trim() ? args.description : null;
  const [task] = await database.sql`
    INSERT INTO tasks (project_id, title, description, due_date, status)
    VALUES (${project.id}, ${title}, ${description}, ${dueDate}, 'not_started')
    RETURNING id, title, description, status, due_date
  `;
  await logActivity(database, {
    projectId: project.id,
    entityType: "task",
    entityId: task.id,
    entityTitle: task.title,
    action: "created",
    summary: "Created via MCP",
  });
  return {
    project: { id: project.id, name: project.name },
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      due_date: dateKey(task.due_date),
    },
  };
}

export async function mcpUpdateTask(database: any, userId: string, args: any) {
  const project = await projectOrThrow(database, userId, args?.project_id);
  if (typeof args?.task_id !== "string" || !args.task_id) {
    throw new McpToolError("task_id is required. Use list_tasks to find the id.");
  }
  const [existing] = await database.sql`
    SELECT id, title, description, status, due_date FROM tasks
    WHERE id = ${args.task_id} AND project_id = ${project.id} AND deleted_at IS NULL
  `;
  if (!existing) throw new McpToolError("That task was not found in this project.");

  const hasStatus = args?.status !== undefined;
  const hasDueDate = args?.due_date !== undefined;
  const hasDescription = args?.description !== undefined;
  if (!hasStatus && !hasDueDate && !hasDescription) {
    throw new McpToolError("Nothing to update: pass at least one of status, due_date, or description.");
  }
  if (hasStatus && !TASK_STATUSES.includes(args.status)) {
    throw new McpToolError("status must be one of not_started, in_progress, blocked, or done.");
  }
  const next = {
    status: hasStatus ? args.status : existing.status,
    due_date: hasDueDate ? (args.due_date === null ? null : dateOrThrow(args.due_date, "due_date")) : dateKey(existing.due_date),
    description: hasDescription ? (args.description === null ? null : String(args.description)) : existing.description,
  };
  const [task] = await database.sql`
    UPDATE tasks SET status = ${next.status}, due_date = ${next.due_date}, description = ${next.description}
    WHERE id = ${existing.id}
    RETURNING id, title, description, status, due_date
  `;
  const summary = diffSummary(
    { status: existing.status, due_date: dateKey(existing.due_date), description: existing.description },
    next,
    [
      { key: "status", label: "status" },
      { key: "due_date", label: "due" },
      { key: "description", label: "description", format: (v: any) => (v ? String(v).slice(0, 60) : "not set") },
    ]
  );
  await logActivity(database, {
    projectId: project.id,
    entityType: "task",
    entityId: task.id,
    entityTitle: task.title,
    action: "updated",
    summary: `${summary} (via MCP)`,
  });
  return {
    project: { id: project.id, name: project.name },
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      due_date: dateKey(task.due_date),
    },
  };
}

export async function mcpAddDecisionRequest(database: any, userId: string, args: any) {
  const project = await projectOrThrow(database, userId, args?.project_id);
  const title = titleOrThrow(args?.title);
  if (args?.needed_by === undefined || args?.needed_by === null) {
    throw new McpToolError("needed_by is required: the date the decision is needed by, in YYYY-MM-DD format.");
  }
  const deadline = dateOrThrow(args.needed_by, "needed_by");
  const context = typeof args?.context === "string" && args.context.trim() ? args.context : null;

  let options: string[] = [];
  if (args?.options !== undefined) {
    if (!Array.isArray(args.options) || args.options.some((o: unknown) => typeof o !== "string" || !o.trim())) {
      throw new McpToolError("options must be a list of at least two non-empty choices, or left out.");
    }
    options = args.options.map((o: string) => o.trim());
    if (options.length === 1) {
      throw new McpToolError("options must list at least two choices, or be left out.");
    }
  }

  const ownerStakeholderId = args?.owner_stakeholder_id ?? null;
  if (ownerStakeholderId !== null) {
    if (typeof ownerStakeholderId !== "string") {
      throw new McpToolError("owner_stakeholder_id must be a stakeholder id from this project.");
    }
    const [owner] = await database.sql`
      SELECT project_id FROM stakeholders WHERE id = ${ownerStakeholderId} AND deleted_at IS NULL
    `;
    if (!owner || owner.project_id !== project.id) {
      throw new McpToolError("That owner was not found among this project's stakeholders.");
    }
  }

  const publicToken = crypto.randomBytes(24).toString("base64url");
  const [decision] = await database.sql`
    INSERT INTO decision_requests (project_id, title, context, options, deadline, public_token, owner_stakeholder_id)
    VALUES (${project.id}, ${title}, ${context}, ${JSON.stringify(options)}, ${deadline}, ${publicToken}, ${ownerStakeholderId})
    RETURNING id, title, context, deadline, status, owner_stakeholder_id
  `;
  await logActivity(database, {
    projectId: project.id,
    entityType: "decision",
    entityId: decision.id,
    entityTitle: decision.title,
    action: "created",
    summary: "Created via MCP",
  });
  return {
    project: { id: project.id, name: project.name },
    decision: {
      id: decision.id,
      title: decision.title,
      context: decision.context,
      needed_by: dateKey(decision.deadline),
      status: decision.status,
      owner_stakeholder_id: decision.owner_stakeholder_id,
    },
  };
}

export async function mcpAddRisk(database: any, userId: string, args: any) {
  const project = await projectOrThrow(database, userId, args?.project_id);
  const title = titleOrThrow(args?.title);
  if (!RISK_LEVELS.includes(args?.probability)) {
    throw new McpToolError("probability is required and must be one of low, medium, or high.");
  }
  if (!RISK_LEVELS.includes(args?.impact)) {
    throw new McpToolError("impact is required and must be one of low, medium, or high.");
  }
  const description = typeof args?.description === "string" && args.description.trim() ? args.description : null;
  const mitigation = typeof args?.mitigation === "string" && args.mitigation.trim() ? args.mitigation : null;
  const [risk] = await database.sql`
    INSERT INTO risks (project_id, title, description, probability, impact, probability_score, impact_score, mitigation, status, resolved_at)
    VALUES (${project.id}, ${title}, ${description}, ${args.probability}, ${args.impact}, NULL, NULL, ${mitigation}, 'open', NULL)
    RETURNING id, title, description, probability, impact, mitigation, status
  `;
  await logActivity(database, {
    projectId: project.id,
    entityType: "risk",
    entityId: risk.id,
    entityTitle: risk.title,
    action: "created",
    summary: "Created via MCP",
  });
  return {
    project: { id: project.id, name: project.name },
    risk: {
      id: risk.id,
      title: risk.title,
      description: risk.description,
      probability: risk.probability,
      impact: risk.impact,
      mitigation: risk.mitigation,
      status: risk.status,
    },
  };
}

export async function mcpAddStatusUpdate(database: any, userId: string, args: any) {
  const project = await projectOrThrow(database, userId, args?.project_id);
  if (!HEALTH_VALUES.includes(args?.health)) {
    throw new McpToolError("health is required and must be one of on_track, at_risk, or off_track.");
  }
  const text = typeof args?.note === "string" ? args.note.trim() : "";
  const [update] = await database.sql`
    INSERT INTO status_updates (project_id, body, health) VALUES (${project.id}, ${text}, ${args.health})
    RETURNING id, body, health, created_at
  `;
  const base = text ? text.slice(0, 120) : HEALTH_LABEL[args.health as keyof typeof HEALTH_LABEL];
  await logActivity(database, {
    projectId: project.id,
    entityType: "status_update",
    entityId: update.id,
    entityTitle: null,
    action: "created",
    summary: `${base} (via MCP)`,
  });
  return {
    project: { id: project.id, name: project.name },
    status_update: {
      id: update.id,
      health: update.health,
      note: update.body,
      at: dateKey(update.created_at),
    },
  };
}
