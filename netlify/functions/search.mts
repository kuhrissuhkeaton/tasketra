import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

// Global search (v159, F-18). Read-only: one call that matches a query
// against the names/titles of everything the signed-in user can see --
// projects, tasks, decision requests and risks -- grouped by type for the
// command palette. Access uses the same rule /api/portfolio and
// /api/weekly-sync use (owner or active member, not archived), repeated as
// a subquery per entity the way those functions do it: each query is its
// own `database.sql` call and the parameterized ${userId}/${pattern}
// interpolation is what keeps it safe. Soft-deleted rows never match.
// Nothing is written and no state lives here.

const GROUP_LIMIT = 8;
const MIN_QUERY = 2;

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < MIN_QUERY) return json({ projects: [], tasks: [], decisions: [], risks: [] });
  // Escape the ILIKE wildcards so a query containing % or _ matches those
  // characters literally instead of widening the match.
  const pattern = `%${q.replace(/[%_\\]/g, "\\$&")}%`;

  const database = db();
  const [projectRows, taskRows, decisionRows, riskRows] = await Promise.all([
    database.sql`
      SELECT p.id, p.name
      FROM projects p
      WHERE p.archived = false AND p.deleted_at IS NULL
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        AND p.name ILIKE ${pattern}
      ORDER BY lower(p.name) ASC
      LIMIT ${GROUP_LIMIT}
    `,
    database.sql`
      SELECT t.id, t.title, t.project_id, p.name AS project_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.deleted_at IS NULL
        AND p.archived = false AND p.deleted_at IS NULL
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        AND t.title ILIKE ${pattern}
      ORDER BY lower(t.title) ASC
      LIMIT ${GROUP_LIMIT}
    `,
    database.sql`
      SELECT dr.id, dr.title, dr.project_id, p.name AS project_name
      FROM decision_requests dr
      JOIN projects p ON p.id = dr.project_id
      WHERE dr.deleted_at IS NULL
        AND p.archived = false AND p.deleted_at IS NULL
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        AND dr.title ILIKE ${pattern}
      ORDER BY lower(dr.title) ASC
      LIMIT ${GROUP_LIMIT}
    `,
    database.sql`
      SELECT r.id, r.title, r.project_id, p.name AS project_name
      FROM risks r
      JOIN projects p ON p.id = r.project_id
      WHERE r.deleted_at IS NULL
        AND p.archived = false AND p.deleted_at IS NULL
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        AND r.title ILIKE ${pattern}
      ORDER BY lower(r.title) ASC
      LIMIT ${GROUP_LIMIT}
    `,
  ]);

  return json({
    projects: (projectRows as any[]).map((r) => ({ id: r.id, name: r.name })),
    tasks: (taskRows as any[]).map((r) => ({ id: r.id, title: r.title, projectId: r.project_id, projectName: r.project_name })),
    decisions: (decisionRows as any[]).map((r) => ({ id: r.id, title: r.title, projectId: r.project_id, projectName: r.project_name })),
    risks: (riskRows as any[]).map((r) => ({ id: r.id, title: r.title, projectId: r.project_id, projectName: r.project_name })),
  });
});

export const config: Config = { path: "/api/search" };
