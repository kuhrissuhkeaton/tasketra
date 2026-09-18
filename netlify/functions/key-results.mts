import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

// A key result always belongs to an objective (no top-level GET here -- the
// objective's own GET already returns its key results nested). This
// endpoint only ever creates/edits/removes one, so every write is
// authorized by walking objective_id -> project_id -> hasProjectAccess,
// the same ownership chain change-requests and decision-request-recipients
// already use for their own child records.

const VALID_METRIC_TYPES = ["percent", "number", "currency", "boolean"];
const KEY_RESULT_FIELDS = [
  { key: "title", label: "title" },
  { key: "metric_type", label: "metric type" },
  { key: "start_value", label: "start value" },
  { key: "current_value", label: "current value" },
  { key: "target_value", label: "target value" },
  { key: "unit", label: "unit" },
];

async function loadObjectiveForAccess(database: any, objectiveId: string, userId: string) {
  const [objective] = await database.sql`SELECT id, project_id, title FROM objectives WHERE id = ${objectiveId} AND deleted_at IS NULL`;
  if (!objective || !(await hasProjectAccess(userId, objective.project_id))) return null;
  return objective;
}

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const objectiveId = body?.objectiveId;
    const title = (body?.title || "").trim();
    if (!objectiveId || !title) return json({ error: "objectiveId and title are required." }, { status: 400 });
    const objective = await loadObjectiveForAccess(database, objectiveId, userId);
    if (!objective) return json({ error: "Not found" }, { status: 404 });

    if (body?.metricType && !VALID_METRIC_TYPES.includes(body.metricType)) {
      return json({ error: "Invalid metric type." }, { status: 400 });
    }
    const metricType = VALID_METRIC_TYPES.includes(body?.metricType) ? body.metricType : "percent";
    const isBoolean = metricType === "boolean";
    const startValue = isBoolean ? 0 : Number(body?.startValue ?? 0);
    const targetValue = isBoolean ? 1 : Number(body?.targetValue ?? 100);
    const currentValue = isBoolean ? (body?.currentValue ? 1 : 0) : Number(body?.currentValue ?? startValue);

    const [keyResult] = await database.sql`
      INSERT INTO key_results (objective_id, title, metric_type, start_value, current_value, target_value, unit)
      VALUES (${objectiveId}, ${title}, ${metricType}, ${startValue}, ${currentValue}, ${targetValue}, ${body?.unit || null})
      RETURNING id, objective_id, title, metric_type, start_value, current_value, target_value, unit, created_at, updated_at
    `;
    await logActivity(database, { projectId: objective.project_id, entityType: "key_result", entityId: keyResult.id, entityTitle: `${objective.title}: ${keyResult.title}`, action: "created" });
    return json({ keyResult }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM key_results WHERE id = ${id}`;
    if (!existing) return json({ error: "Not found" }, { status: 404 });
    const objective = await loadObjectiveForAccess(database, existing.objective_id, userId);
    if (!objective) return json({ error: "Not found" }, { status: 404 });

    if (body.metricType && !VALID_METRIC_TYPES.includes(body.metricType)) {
      return json({ error: "Invalid metric type." }, { status: 400 });
    }

    const [keyResult] = await database.sql`
      UPDATE key_results SET
        title = COALESCE(${body.title ?? null}, title),
        metric_type = COALESCE(${body.metricType ?? null}, metric_type),
        start_value = COALESCE(${body.startValue ?? null}, start_value),
        current_value = COALESCE(${body.currentValue ?? null}, current_value),
        target_value = COALESCE(${body.targetValue ?? null}, target_value),
        unit = COALESCE(${body.unit ?? null}, unit),
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, objective_id, title, metric_type, start_value, current_value, target_value, unit, created_at, updated_at
    `;

    const summary = diffSummary(existing, {
      title: body.title, metric_type: body.metricType, start_value: body.startValue,
      current_value: body.currentValue, target_value: body.targetValue, unit: body.unit,
    }, KEY_RESULT_FIELDS);
    await logActivity(database, { projectId: objective.project_id, entityType: "key_result", entityId: id, entityTitle: `${objective.title}: ${keyResult.title}`, action: "updated", summary });

    return json({ keyResult });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT objective_id, title FROM key_results WHERE id = ${id}`;
    if (!existing) return json({ error: "Not found" }, { status: 404 });
    const objective = await loadObjectiveForAccess(database, existing.objective_id, userId);
    if (!objective) return json({ error: "Not found" }, { status: 404 });

    await database.sql`UPDATE key_results SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: objective.project_id, entityType: "key_result", entityId: id, entityTitle: `${objective.title}: ${existing.title}`, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/key-results" };
