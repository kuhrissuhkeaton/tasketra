import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { isProjectOwner } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { CUSTOM_TEMPLATE_PREFIX, templateCounts, templateSummary, type ProjectTemplate } from "../../src/lib/projectTemplates.ts";
import { buildStoredTemplate, sanitizeStored } from "../lib/templateFromProject.ts";

// A person's own saved templates. Private: every query filters on the caller.
//   GET                      -> { templates: [{ id: "custom:<uuid>", name, description, summary, counts, created_at }] }
//   POST {projectId, name, description?, preview?}
//                            -> save the project as a template (project owner only).
//                               preview: true returns what would be saved, writes nothing.
//   DELETE ?id=custom:<uuid> -> delete one of your own templates.

export const MAX_TEMPLATES = 20;
const MAX_NAME = 80;
const MAX_DESCRIPTION = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asTemplate(data: NonNullable<ReturnType<typeof sanitizeStored>>): ProjectTemplate {
  return { id: "", name: "", blurb: "", bestFor: "", suggestedApproach: data.approach, ...data };
}

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();

  if (req.method === "GET") {
    const rows = await database.sql`
      SELECT id, name, description, data, created_at FROM user_templates WHERE owner_id = ${userId} ORDER BY created_at DESC
    `;
    const templates = rows.flatMap((r: any) => {
      const data = sanitizeStored(r.data);
      if (!data) return [];
      const t = asTemplate(data);
      return [{ id: `${CUSTOM_TEMPLATE_PREFIX}${r.id}`, name: r.name, description: r.description, summary: templateSummary(t), counts: templateCounts(t), created_at: r.created_at }];
    });
    return json({ templates });
  }

  if (req.method === "POST") {
    const body = (await req.json().catch(() => null)) as any;
    const projectId = body?.projectId;
    if (!projectId) return json({ error: "projectId is required." }, { status: 400 });
    if (!(await isProjectOwner(userId, projectId))) return json({ error: "Not found" }, { status: 404 });
    const [project] = await database.sql`SELECT id, name, approach FROM projects WHERE id = ${projectId} AND deleted_at IS NULL`;
    if (!project) return json({ error: "Not found" }, { status: 404 });

    const [roadmap, tasks, risks, assumptions] = await Promise.all([
      database.sql`
        SELECT id, type, title, start_date::text AS start_date, end_date::text AS end_date FROM roadmap_items
        WHERE project_id = ${projectId} AND deleted_at IS NULL ORDER BY start_date ASC NULLS LAST, created_at ASC
      `,
      database.sql`
        SELECT id, title, roadmap_item_id, start_date::text AS start_date, due_date::text AS due_date FROM tasks
        WHERE project_id = ${projectId} AND deleted_at IS NULL ORDER BY created_at ASC
      `,
      database.sql`
        SELECT title, description, probability, impact, mitigation FROM risks
        WHERE project_id = ${projectId} AND deleted_at IS NULL ORDER BY created_at ASC
      `,
      database.sql`SELECT statement FROM assumptions WHERE project_id = ${projectId} AND deleted_at IS NULL ORDER BY created_at ASC`,
    ]);
    const { data, truncated } = buildStoredTemplate({
      roadmap: roadmap as any, tasks: tasks as any, risks: risks as any, assumptions: assumptions.map((a: any) => a.statement), approach: project.approach,
    });
    const t = asTemplate(data);
    const counts = templateCounts(t);
    const empty = counts.phases + counts.milestones + counts.tasks + counts.risks + counts.assumptions === 0;

    if (body.preview === true) {
      return json({ counts, summary: templateSummary(t), truncated, empty, suggestedName: `${project.name} template`.slice(0, MAX_NAME) });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return json({ error: "Give the template a name." }, { status: 400 });
    if (name.length > MAX_NAME) return json({ error: `The name can be at most ${MAX_NAME} characters.` }, { status: 400 });
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (description.length > MAX_DESCRIPTION) return json({ error: `The description can be at most ${MAX_DESCRIPTION} characters.` }, { status: 400 });
    if (empty) return json({ error: "This project has no phases, milestones, tasks, risks or assumptions to save yet." }, { status: 400 });

    const [{ n }] = await database.sql`SELECT count(*)::int AS n FROM user_templates WHERE owner_id = ${userId}`;
    if (n >= MAX_TEMPLATES) return json({ error: `You can keep up to ${MAX_TEMPLATES} templates. Delete one to save another.` }, { status: 400 });
    const [dup] = await database.sql`SELECT id FROM user_templates WHERE owner_id = ${userId} AND lower(name) = lower(${name})`;
    if (dup) return json({ error: "You already have a template with that name." }, { status: 409 });

    const [row] = await database.sql`
      INSERT INTO user_templates (owner_id, name, description, data, source_project_id)
      VALUES (${userId}, ${name}, ${description || null}, ${JSON.stringify(data)}::jsonb, ${projectId})
      RETURNING id, name, description, created_at
    `;
    return json({ template: { id: `${CUSTOM_TEMPLATE_PREFIX}${row.id}`, name: row.name, description: row.description, summary: templateSummary(t), counts, created_at: row.created_at }, truncated }, { status: 201 });
  }

  if (req.method === "DELETE") {
    const raw = new URL(req.url).searchParams.get("id") ?? "";
    const id = raw.startsWith(CUSTOM_TEMPLATE_PREFIX) ? raw.slice(CUSTOM_TEMPLATE_PREFIX.length) : raw;
    if (!UUID.test(id)) return json({ error: "Not found" }, { status: 404 });
    const rows = await database.sql`DELETE FROM user_templates WHERE id = ${id} AND owner_id = ${userId} RETURNING id`;
    if (rows.length === 0) return json({ error: "Not found" }, { status: 404 });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/user-templates" };
