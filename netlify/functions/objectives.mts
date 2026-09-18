import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";
import { keyResultProgress, objectiveProgress } from "../lib/okr.ts";
import { withSentry } from "../lib/sentry.ts";

// Objectives & Key Results -- project-scoped, same as every other RAID-style
// entity. An objective's own `status` is a manual read from its owner (same
// pattern as a Risk's status), separate from the *computed* progress each
// key result carries (see keyResultProgress in src/lib/okr.ts) -- a goal can
// be "on track" on schedule even at 40% numeric progress, or "at risk" at
// 90%. Listing an objective also returns its key results in the same call
// (a LEFT JOIN + json_agg), since the UI never shows one without the other.

const VALID_STATUSES = ["on_track", "at_risk", "off_track", "achieved"];
const OBJECTIVE_FIELDS = [
  { key: "title", label: "title" },
  { key: "description", label: "description" },
  { key: "owner_name", label: "owner" },
  { key: "target_date", label: "target date" },
  { key: "status", label: "status" },
];

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const objectives = await database.sql`
      SELECT o.id, o.title, o.description, o.owner_name, o.target_date, o.status, o.created_at, o.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', kr.id, 'title', kr.title, 'metric_type', kr.metric_type,
              'start_value', kr.start_value, 'current_value', kr.current_value, 'target_value', kr.target_value,
              'unit', kr.unit, 'created_at', kr.created_at, 'updated_at', kr.updated_at
            ) ORDER BY kr.created_at ASC
          ) FILTER (WHERE kr.id IS NOT NULL),
          '[]'::json
        ) AS key_results
      FROM objectives o
      LEFT JOIN key_results kr ON kr.objective_id = o.id AND kr.deleted_at IS NULL
      WHERE o.project_id = ${projectId} AND o.deleted_at IS NULL
      GROUP BY o.id
      ORDER BY
        CASE o.status WHEN 'off_track' THEN 0 WHEN 'at_risk' THEN 1 WHEN 'on_track' THEN 2 ELSE 3 END,
        o.created_at DESC
    `;

    const withProgress = objectives.map((o: any) => {
      const keyResults = (o.key_results || []).map((kr: any) => ({ ...kr, progress: keyResultProgress(kr) }));
      return { ...o, key_results: keyResults, progress: objectiveProgress(o.key_results || []) };
    });
    return json({ objectives: withProgress });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const title = (body?.title || "").trim();
    if (!projectId || !title) return json({ error: "projectId and title are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    if (body?.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }
    const status = VALID_STATUSES.includes(body?.status) ? body.status : "on_track";

    const [objective] = await database.sql`
      INSERT INTO objectives (project_id, title, description, owner_name, target_date, status)
      VALUES (${projectId}, ${title}, ${body?.description || null}, ${body?.ownerName || null}, ${body?.targetDate || null}, ${status})
      RETURNING id, title, description, owner_name, target_date, status, created_at, updated_at
    `;
    await logActivity(database, { projectId, entityType: "objective", entityId: objective.id, entityTitle: objective.title, action: "created" });
    return json({ objective: { ...objective, key_results: [] } }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM objectives WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      // Restoring an objective brings its key results back with it -- they
      // were only ever hidden as a side effect of the parent being gone, not
      // independently deleted (the DELETE handler below is what soft-deletes
      // both together in the first place).
      await database.sql`UPDATE objectives SET deleted_at = NULL WHERE id = ${id}`;
      await database.sql`UPDATE key_results SET deleted_at = NULL WHERE objective_id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "objective", entityId: id, entityTitle: existing.title, action: "restored" });
      return json({ ok: true });
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }

    const [objective] = await database.sql`
      UPDATE objectives SET
        title = COALESCE(${body.title ?? null}, title),
        description = COALESCE(${body.description ?? null}, description),
        owner_name = COALESCE(${body.ownerName ?? null}, owner_name),
        target_date = COALESCE(${body.targetDate ?? null}, target_date),
        status = COALESCE(${body.status ?? null}, status),
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, description, owner_name, target_date, status, created_at, updated_at
    `;

    const summary = diffSummary(existing, {
      title: body.title, description: body.description, owner_name: body.ownerName,
      target_date: body.targetDate, status: body.status,
    }, OBJECTIVE_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "objective", entityId: id, entityTitle: objective.title, action: "updated", summary });

    return json({ objective });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, title FROM objectives WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE objectives SET deleted_at = now() WHERE id = ${id}`;
    await database.sql`UPDATE key_results SET deleted_at = now() WHERE objective_id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "objective", entityId: id, entityTitle: existing.title, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/objectives" };
