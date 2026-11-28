import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess, isProjectOwner } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, type EntityType } from "../lib/activity.ts";
import { EXAMPLE_MANIFEST } from "../lib/exampleData.ts";
import { withSentry } from "../lib/sentry.ts";

// v161: "Clear example data" (project settings). Example rows carry no
// marker column, so they are identified the only truthful way available:
// an exact title/statement/name match against EXAMPLE_MANIFEST (the same
// constants the seeder inserts from) AND a created_at inside a short
// window around the project's own creation -- seeding runs synchronously
// inside the create request, so genuine example rows land within seconds
// of the project row. A row the user renamed no longer matches and stays:
// it is theirs now. Clearing soft-deletes (deleted_at) -- every seeded
// table has the column and every list query filters on it -- so a mistaken
// clear is recoverable from Trash, exactly like any other item delete.
const SEED_WINDOW_MS = 10 * 60 * 1000;

type Counts = {
  tasks: number;
  roadmapItems: number;
  issues: number;
  risks: number;
  assumptions: number;
  dependencies: number;
  stakeholders: number;
  total: number;
};

function emptyCounts(): Counts {
  return { tasks: 0, roadmapItems: 0, issues: 0, risks: 0, assumptions: 0, dependencies: 0, stakeholders: 0, total: 0 };
}

async function findExampleRows(database: any, projectId: string) {
  const [project] = await database.sql`
    SELECT created_at FROM projects WHERE id = ${projectId}
  `;
  if (!project) return null;
  const from = new Date(project.created_at).toISOString();
  const to = new Date(new Date(project.created_at).getTime() + SEED_WINDOW_MS).toISOString();

  const found: { table: string; entityType: EntityType; key: keyof Counts; id: string; title: string }[] = [];
  const collect = async (rows: any[], table: string, entityType: EntityType, key: keyof Counts, titleOf: (r: any) => string) => {
    for (const r of rows) found.push({ table, entityType, key, id: r.id, title: titleOf(r) });
  };

  for (const title of EXAMPLE_MANIFEST.taskTitles) {
    const rows = await database.sql`
      SELECT id, title FROM tasks
      WHERE project_id = ${projectId} AND title = ${title} AND deleted_at IS NULL
        AND created_at >= ${from} AND created_at <= ${to}
    `;
    await collect(rows, "tasks", "task", "tasks", (r) => r.title);
  }
  for (const title of EXAMPLE_MANIFEST.roadmapTitles) {
    const rows = await database.sql`
      SELECT id, title FROM roadmap_items
      WHERE project_id = ${projectId} AND title = ${title} AND deleted_at IS NULL
        AND created_at >= ${from} AND created_at <= ${to}
    `;
    await collect(rows, "roadmap_items", "roadmap_item", "roadmapItems", (r) => r.title);
  }
  for (const title of EXAMPLE_MANIFEST.issueTitles) {
    const rows = await database.sql`
      SELECT id, title FROM issues
      WHERE project_id = ${projectId} AND title = ${title} AND deleted_at IS NULL
        AND created_at >= ${from} AND created_at <= ${to}
    `;
    await collect(rows, "issues", "issue", "issues", (r) => r.title);
  }
  for (const title of EXAMPLE_MANIFEST.riskTitles) {
    const rows = await database.sql`
      SELECT id, title FROM risks
      WHERE project_id = ${projectId} AND title = ${title} AND deleted_at IS NULL
        AND created_at >= ${from} AND created_at <= ${to}
    `;
    await collect(rows, "risks", "risk", "risks", (r) => r.title);
  }
  for (const statement of EXAMPLE_MANIFEST.assumptionStatements) {
    const rows = await database.sql`
      SELECT id, statement FROM assumptions
      WHERE project_id = ${projectId} AND statement = ${statement} AND deleted_at IS NULL
        AND created_at >= ${from} AND created_at <= ${to}
    `;
    await collect(rows, "assumptions", "assumption", "assumptions", (r) => r.statement);
  }
  for (const title of EXAMPLE_MANIFEST.dependencyTitles) {
    const rows = await database.sql`
      SELECT id, title FROM dependencies
      WHERE project_id = ${projectId} AND title = ${title} AND deleted_at IS NULL
        AND created_at >= ${from} AND created_at <= ${to}
    `;
    await collect(rows, "dependencies", "dependency", "dependencies", (r) => r.title);
  }
  const stakeholderRows = await database.sql`
    SELECT id, name FROM stakeholders
    WHERE project_id = ${projectId} AND name = ${EXAMPLE_MANIFEST.stakeholderName}
      AND role = ${EXAMPLE_MANIFEST.stakeholderRole} AND deleted_at IS NULL
      AND created_at >= ${from} AND created_at <= ${to}
  `;
  await collect(stakeholderRows, "stakeholders", "stakeholder", "stakeholders", (r) => r.name);

  return found;
}

function countsOf(rows: { key: keyof Counts }[]): Counts {
  const counts = emptyCounts();
  for (const r of rows) {
    counts[r.key] += 1;
    counts.total += 1;
  }
  return counts;
}

export default withSentry(async (req: Request) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });
    const rows = await findExampleRows(database, projectId);
    if (!rows) return json({ error: "Not found" }, { status: 404 });
    const counts = countsOf(rows);
    return json({ hasExampleData: counts.total > 0, counts });
  }

  if (req.method === "POST") {
    const body = (await req.json().catch(() => null)) as any;
    const projectId = body?.projectId;
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    // Removing content is an owner-level action, like deleting the project.
    if (!(await isProjectOwner(userId, projectId))) return json({ error: "Only the project owner can clear example data" }, { status: 403 });
    const rows = await findExampleRows(database, projectId);
    if (!rows) return json({ error: "Not found" }, { status: 404 });

    for (const row of rows) {
      if (row.table === "stakeholders") {
        await database.sql`UPDATE stakeholders SET deleted_at = now() WHERE id = ${row.id}`;
      } else if (row.table === "tasks") {
        await database.sql`UPDATE tasks SET deleted_at = now() WHERE id = ${row.id}`;
      } else if (row.table === "roadmap_items") {
        await database.sql`UPDATE roadmap_items SET deleted_at = now() WHERE id = ${row.id}`;
      } else if (row.table === "issues") {
        await database.sql`UPDATE issues SET deleted_at = now() WHERE id = ${row.id}`;
      } else if (row.table === "risks") {
        await database.sql`UPDATE risks SET deleted_at = now() WHERE id = ${row.id}`;
      } else if (row.table === "assumptions") {
        await database.sql`UPDATE assumptions SET deleted_at = now() WHERE id = ${row.id}`;
      } else if (row.table === "dependencies") {
        await database.sql`UPDATE dependencies SET deleted_at = now() WHERE id = ${row.id}`;
      }
      await logActivity(database, {
        projectId,
        entityType: row.entityType,
        entityId: row.id,
        entityTitle: row.title,
        action: "deleted",
      });
    }
    return json({ cleared: countsOf(rows) });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/example-data" };
