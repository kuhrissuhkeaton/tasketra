import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

// Public, unauthenticated endpoint. Only ever exposes roadmap items for the
// single project matching an unguessable token, and only while that
// project's owner has sharing turned on -- never a list of projects, never
// any other project data (tasks, budget, stakeholders, etc).

export default withSentry(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const database = db();
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return json({ error: "token required" }, { status: 400 });

  const [project] = await database.sql`
    SELECT id, name FROM projects
    WHERE roadmap_share_token = ${token} AND roadmap_share_enabled = true AND deleted_at IS NULL
  `;
  if (!project) return json({ error: "This roadmap link is not valid or is no longer shared." }, { status: 404 });

  const items = await database.sql`
    SELECT id, type, title, description, swimlane, start_date, end_date, status
    FROM roadmap_items
    WHERE project_id = ${project.id} AND deleted_at IS NULL
    ORDER BY swimlane ASC, start_date ASC NULLS LAST, created_at ASC
  `;

  return json({ project: { name: project.name }, items });
});

export const config: Config = { path: "/api/roadmap-public" };
