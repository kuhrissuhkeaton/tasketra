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

export type EntityType = "task" | "issue" | "risk" | "stakeholder" | "decision" | "member" | "assumption" | "dependency" | "change_request" | "lesson" | "meeting" | "project" | "document";
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
    INSERT INTO activity_log (project_id, entity_type, entity_id, entity_title, action, summary)
    VALUES (${params.projectId}, ${params.entityType}, ${params.entityId}, ${params.entityTitle}, ${params.action}, ${params.summary ?? null})
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

// Compares "before" and "after" snapshots across a list of watched fields and
// produces a short human-readable summary like "status: open -> resolved;
// owner: Dana -> Marcus". Only fields that were actually provided (present in
// `after`) and differ from `before` are included.
export function diffSummary(
  before: Record<string, any>,
  after: Record<string, any>,
  fields: { key: string; label: string }[]
): string {
  const changes: string[] = [];
  for (const f of fields) {
    if (after[f.key] === undefined) continue;
    const beforeVal = before[f.key] ?? "--";
    const afterVal = after[f.key] ?? "--";
    if (String(beforeVal) !== String(afterVal)) {
      changes.push(`${f.label}: ${beforeVal} -> ${afterVal}`);
    }
  }
  return changes.length ? changes.join("; ") : "details updated";
}
