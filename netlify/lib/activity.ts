// Shared activity-log helper used by every mutable entity (tasks, issues,
// risks, stakeholders, decisions) so create/update/delete/restore actions
// are recorded as a real append-only history, not just derived from
// updated_at. The Feed reads this table live, so nothing needs denormalizing.
//
// It also doubles as the single dispatch point for the account-level
// outbound webhook (Phase 4 / Connections): every entity function already
// calls logActivity() on create/update/delete, so hooking the webhook in
// here means no per-entity function needs to know webhooks exist.

import { isWebhookUrlSafeToDispatch } from "./ssrf-guard.ts";
import { currentUserId } from "./requestContext.ts";

export type EntityType = "task" | "issue" | "risk" | "stakeholder" | "decision" | "member" | "assumption" | "dependency" | "change_request" | "lesson" | "meeting" | "project" | "document" | "roadmap_item" | "quality_item" | "procurement_item" | "comm_plan_item" | "compliance_item" | "objective" | "key_result" | "status_update";
export type ActivityAction = "created" | "updated" | "deleted" | "restored";

export async function logActivity(
  database: any,
  params: {
    projectId: string;
    entityType: EntityType;
    entityId: string;
    entityTitle: string | null;
    action: ActivityAction;
    summary?: string | null;
  }
) {
  await database.sql`
    INSERT INTO activity_log (project_id, entity_type, entity_id, entity_title, action, summary, actor_id)
    VALUES (${params.projectId}, ${params.entityType}, ${params.entityId}, ${params.entityTitle}, ${params.action}, ${params.summary ?? null}, ${currentUserId()})
  `;

  // Best-effort outbound webhook -- never let a webhook problem break the
  // caller's actual mutation. Only fires when this project has opted in
  // (projects.webhook_enabled) and its owner has a webhook_url configured.
  try {
    await dispatchWebhook(database, params);
  } catch {
    // swallow -- see above
  }
}

async function dispatchWebhook(
  database: any,
  params: {
    projectId: string;
    entityType: EntityType;
    entityId: string;
    entityTitle: string | null;
    action: ActivityAction;
    summary?: string | null;
  }
) {
  const [row] = await database.sql`
    SELECT p.webhook_enabled, p.name AS project_name, u.webhook_url
    FROM projects p
    JOIN users u ON u.id = p.owner_id
    WHERE p.id = ${params.projectId}
  `;
  if (!row || !row.webhook_enabled || !row.webhook_url) return;

  // Re-checked here (not just at save time) since a hostname can be
  // re-pointed at a private/internal address after the URL was saved --
  // this is the check that actually runs on every real request.
  if (!(await isWebhookUrlSafeToDispatch(row.webhook_url))) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch(row.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: `${params.entityType}.${params.action}`,
        project_id: params.projectId,
        project_name: row.project_name,
        entity_type: params.entityType,
        entity_id: params.entityId,
        entity_title: params.entityTitle,
        action: params.action,
        summary: params.summary ?? null,
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// --- Human-readable diff values (v151) -------------------------------------
// Activity summaries are read by people (the project Feed, My activity), so
// the values in a diff have to read like the app does everywhere else: status
// enums get their display labels, dates render "Dec 5, 2026", and an empty
// value is "not set" -- never the stored "not_started" or a raw ISO
// timestamp. Only summaries written after this change improve; stored
// history keeps the wording it was written with.

const STATUS_LABELS: Record<string, string> = {
  // tasks
  not_started: "Not started", in_progress: "In progress", blocked: "Blocked", done: "Done",
  // issues / risks
  open: "Open", monitoring: "Monitoring", resolved: "Resolved",
  // change requests
  proposed: "Proposed", approved: "Approved", rejected: "Rejected", implemented: "Implemented",
  // objectives / health (status updates, objectives)
  on_track: "On track", at_risk: "At risk", off_track: "Off track",
  // assumptions / lessons / compliance / dependencies
  active: "Active", validated: "Validated", invalidated: "Invalidated",
  pending: "Pending", met: "Met", unmet: "Unmet", waived: "Waived",
};

/** "some_value" -> "Some value" for enum tokens with no explicit label. */
function humanizeToken(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A stored date (bare YYYY-MM-DD, an ISO timestamp, or a Date) -> "Dec 5, 2026". */
function formatDateValue(value: unknown): string | null {
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${MONTHS_SHORT[month - 1]} ${day}, ${m[1]}`;
}

const DATE_KEYS = new Set(["start_date", "due_date", "check_by", "needed_by", "meeting_date", "target_date", "deadline", "date"]);
const ENUM_KEYS = new Set(["severity", "probability", "impact", "priority", "power_level", "interest_level", "direction", "metric_type", "category", "frequency", "channel", "meeting_type", "preferred_contact", "type"]);

/** The display form of one diff value for a watched field. */
export function formatDiffValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "not set";
  if (DATE_KEYS.has(key)) return formatDateValue(value) ?? String(value);
  if (key === "status" && typeof value === "string") return STATUS_LABELS[value] ?? humanizeToken(value);
  if (ENUM_KEYS.has(key) && typeof value === "string" && /^[a-z][a-z0-9_]*$/.test(value)) return humanizeToken(value);
  return String(value);
}

// Compares "before" and "after" snapshots across a list of watched fields and
// produces a short human-readable summary like "status: Not started →
// In progress; due: not set → Dec 5, 2026". Only fields that were actually
// provided (present in `after`) and differ from `before` are included. A
// field may carry its own `format` to override the built-in display rules.
export function diffSummary(
  before: Record<string, any>,
  after: Record<string, any>,
  fields: { key: string; label: string; format?: (value: any) => string }[]
): string {
  const changes: string[] = [];
  for (const f of fields) {
    if (after[f.key] === undefined) continue;
    const format = f.format ?? ((v: any) => formatDiffValue(f.key, v));
    const beforeText = format(before[f.key]);
    const afterText = format(after[f.key]);
    if (beforeText !== afterText) {
      changes.push(`${f.label}: ${beforeText} → ${afterText}`);
    }
  }
  return changes.length ? changes.join("; ") : "details updated";
}
