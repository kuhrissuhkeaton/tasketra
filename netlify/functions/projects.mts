import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { canCreateProject, FREE_PROJECT_LIMIT } from "../lib/billing.ts";
import { seedExampleData } from "../lib/exampleData.ts";
import { withSentry } from "../lib/sentry.ts";
import { isProjectSize, isProjectApproach } from "../lib/projectSetup.ts";
import { applyProjectTemplate } from "../lib/applyTemplate.ts";
import { resolveTemplate } from "../lib/templateResolve.ts";

export default withSentry(async (req: Request) => {
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
      SELECT p.id, p.name, p.description, p.created_at, p.stage, (p.owner_id = ${userId}) AS is_owner,
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
    if (body?.size !== undefined && !isProjectSize(body.size)) {
      return json({ error: "size must be one of light, standard, full." }, { status: 400 });
    }
    if (body?.approach !== undefined && !isProjectApproach(body.approach)) {
      return json({ error: "approach must be one of predictive, hybrid, agile." }, { status: 400 });
    }
    const wantsTemplate = typeof body?.template === "string" && body.template !== "";
    if (body?.template !== undefined && body?.template !== null && !wantsTemplate) {
      return json({ error: "template is not a known project template." }, { status: 400 });
    }
    // A built-in id, or one of this person's own saved templates ("custom:<id>").
    if (wantsTemplate && !(await resolveTemplate(database, userId, body.template))) {
      return json({ error: "template is not a known project template." }, { status: 400 });
    }
    const [project] = await database.sql`
      INSERT INTO projects (owner_id, name, description, size, approach)
      VALUES (${userId}, ${name}, ${body?.description || null}, COALESCE(${body?.size ?? null}, 'standard'), COALESCE(${body?.approach ?? null}, 'hybrid'))
      RETURNING id, name, description, created_at, size, approach
    `;

    let templateApplied: boolean | undefined;
    if (wantsTemplate) {
      // Best-effort, like the example data below: the project exists and is
      // usable either way, so a seeding failure is reported, not fatal. A
      // template wins over example data -- the two would double up.
      try {
        templateApplied = await applyProjectTemplate(database, project.id, userId, body.template);
      } catch {
        templateApplied = false;
      }
    } else if (body?.seedExample === true) {
      // Best-effort: a brand-new project is still fully usable even if
      // seeding partially fails, so don't fail project creation over it.
      try {
        await seedExampleData(database, project.id, userId);
      } catch {
        // swallow -- the project itself was already created successfully
      }
    }

    return json({ project, ...(templateApplied === undefined ? {} : { templateApplied }) }, { status: 201 });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/projects" };
