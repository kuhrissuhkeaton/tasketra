import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { canCreateProject, FREE_PROJECT_LIMIT } from "../lib/billing.ts";

export default async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();

  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("deleted") === "true") {
      // Recently-deleted projects, owner-only -- this is a recovery list, not
      // a shared view, since only the owner can delete or restore a project.
      const deleted = await database.sql`
        SELECT id, name, description, deleted_at
        FROM projects
        WHERE owner_id = ${userId} AND archived = true AND deleted_at IS NOT NULL
        ORDER BY deleted_at DESC
      `;
      return json({ projects: deleted });
    }

    const projects = await database.sql`
      SELECT p.id, p.name, p.description, p.created_at, (p.owner_id = ${userId}) AS is_owner,
        (SELECT count(*)::int FROM decision_requests dr WHERE dr.project_id = p.id AND dr.status = 'open' AND dr.deleted_at IS NULL) AS open_decisions,
        (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < now()::date AND t.deleted_at IS NULL) AS overdue_tasks
      FROM projects p
      WHERE p.archived = false
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
      ORDER BY p.created_at DESC
    `;
    return json({ projects });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const name = (body?.name || "").trim();
    if (!name) return json({ error: "Project name is required." }, { status: 400 });
    if (!(await canCreateProject(database, userId))) {
      return json(
        { error: `Free plan is limited to ${FREE_PROJECT_LIMIT} active projects. Upgrade to create more.`, upgradeRequired: true },
        { status: 402 }
      );
    }
    const [project] = await database.sql`
      INSERT INTO projects (owner_id, name, description)
      VALUES (${userId}, ${name}, ${body?.description || null})
      RETURNING id, name, description, created_at
    `;
    return json({ project }, { status: 201 });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};

export const config: Config = { path: "/api/projects" };
