import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { isProjectOwner } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { resolveTemplate } from "../lib/templateResolve.ts";
import { applyTemplateToExisting } from "../lib/applyTemplate.ts";

// POST {projectId, templateId, preview?: boolean}
// Adds a template's skeleton to a project that already has work. Owner only.
// preview: true returns what would be added and skipped without writing.

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const body = (await req.json().catch(() => null)) as any;
  const projectId = body?.projectId;
  if (!projectId || typeof body?.templateId !== "string") {
    return json({ error: "projectId and templateId are required." }, { status: 400 });
  }
  const database = db();
  const template = await resolveTemplate(database, userId, body.templateId);
  if (!template) return json({ error: "templateId is not a known project template." }, { status: 400 });
  if (!(await isProjectOwner(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  const [project] = await database.sql`SELECT id FROM projects WHERE id = ${projectId} AND deleted_at IS NULL`;
  if (!project) return json({ error: "Not found" }, { status: 404 });

  const preview = body.preview === true;
  const summary = await applyTemplateToExisting(database, projectId, userId, template, { preview });
  return json({ summary, applied: !preview && summary.totalToAdd > 0 });
});

export const config: Config = { path: "/api/template-apply" };
