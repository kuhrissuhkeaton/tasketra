import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { isProjectOwner } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });

  const database = db();

  if (req.method === "GET") {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id query param required" }, { status: 400 });

    const [project] = await database.sql`
      SELECT p.id, p.name, p.description, p.created_at, p.owner_id, p.webhook_enabled,
        p.ccb_enabled, p.archived, p.deleted_at, (p.owner_id = ${userId}) AS is_owner
      FROM projects p
      WHERE p.id = ${id}
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
    `;
    if (!project) return json({ error: "Not found" }, { status: 404 });
    return json({ project });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id is required" }, { status: 400 });
    if (!(await isProjectOwner(userId, id))) return json({ error: "Not found" }, { status: 404 });

    if (body.restore) {
      await database.sql`UPDATE projects SET archived = false, deleted_at = NULL WHERE id = ${id}`;
      const [project] = await database.sql`
        SELECT id, name, description, created_at, owner_id, webhook_enabled, ccb_enabled, archived, deleted_at
        FROM projects WHERE id = ${id}
      `;
      await logActivity(database, { projectId: id, entityType: "project", entityId: id, entityTitle: project.name, action: "restored" });
      return json({ project });
    }

    const hasName = typeof body?.name === "string";
    const hasDescription = typeof body?.description === "string";
    const hasWebhook = typeof body?.webhook_enabled === "boolean";
    const hasCcb = typeof body?.ccb_enabled === "boolean";

    if (hasName && !body.name.trim()) {
      return json({ error: "Project name can't be empty." }, { status: 400 });
    }
    if (!hasName && !hasDescription && !hasWebhook && !hasCcb) {
      return json({ error: "Nothing to update." }, { status: 400 });
    }

    const [project] = await database.sql`
      UPDATE projects SET
        name = COALESCE(${hasName ? body.name.trim() : null}, name),
        description = CASE WHEN ${hasDescription} THEN ${hasDescription ? body.description : null} ELSE description END,
        webhook_enabled = COALESCE(${hasWebhook ? body.webhook_enabled : null}, webhook_enabled),
        ccb_enabled = COALESCE(${hasCcb ? body.ccb_enabled : null}, ccb_enabled)
      WHERE id = ${id}
      RETURNING id, name, description, created_at, owner_id, webhook_enabled, ccb_enabled, archived, deleted_at
    `;

    if (hasName || hasDescription) {
      await logActivity(database, { projectId: id, entityType: "project", entityId: id, entityTitle: project.name, action: "updated", summary: "project details updated" });
    }

    return json({ project });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    if (!(await isProjectOwner(userId, id))) return json({ error: "Not found" }, { status: 404 });

    const [existing] = await database.sql`SELECT name FROM projects WHERE id = ${id}`;
    await database.sql`UPDATE projects SET archived = true, deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: id, entityType: "project", entityId: id, entityTitle: existing?.name || null, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/project" };
