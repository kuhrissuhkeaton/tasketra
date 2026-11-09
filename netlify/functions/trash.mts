import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { documentsStore } from "../lib/blobs.ts";

// A single, unified trash can across every soft-deletable entity type, so
// there's one place to go looking for anything you deleted -- restoring an
// item just calls back to that entity's own PATCH { restore: true }.
// DELETE empties the trash: every soft-deleted row in the project is
// permanently removed (child rows cascade, links null out, per the schema),
// and trashed documents lose their stored file as well.

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "GET" && req.method !== "DELETE") return json({ error: "Method not allowed" }, { status: 405 });

  const database = db();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId required" }, { status: 400 });
  if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  if (req.method === "DELETE") {
    // Count first (the driver doesn't surface per-statement row counts), and
    // collect trashed documents' blob keys before their rows go.
    const [counts] = await database.sql`
      SELECT
        (SELECT COUNT(*) FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM issues WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM risks WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM stakeholders WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM decision_requests WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM assumptions WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM dependencies WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM change_requests WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM lessons_learned WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM meetings WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM documents WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM roadmap_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM quality_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM procurement_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM comm_plan_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM compliance_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM objectives WHERE project_id = ${projectId} AND deleted_at IS NOT NULL)
        AS total
    `;
    const docRows = await database.sql`
      SELECT blob_key FROM documents WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    `;

    await database.sql`DELETE FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM issues WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM risks WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM stakeholders WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM decision_requests WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM assumptions WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM dependencies WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM change_requests WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM lessons_learned WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM meetings WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM documents WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM roadmap_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM quality_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM procurement_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM comm_plan_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM compliance_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;
    await database.sql`DELETE FROM objectives WHERE project_id = ${projectId} AND deleted_at IS NOT NULL`;

    // Best-effort file cleanup: a blob that survives is orphaned and
    // invisible (keyed by the document's own id), never a reason to keep
    // the row or fail the empty.
    if (docRows.length > 0) {
      try {
        const store = documentsStore();
        for (const row of docRows) {
          try {
            await store.delete(row.blob_key as string);
          } catch {
            // swallow -- see above
          }
        }
      } catch {
        // swallow -- see above
      }
    }

    return json({ ok: true, deleted: Number(counts.total) });
  }

  const items = await database.sql`
    SELECT 'task' AS entity_type, id, title, deleted_at FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'issue' AS entity_type, id, title, deleted_at FROM issues WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'risk' AS entity_type, id, title, deleted_at FROM risks WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'stakeholder' AS entity_type, id, name AS title, deleted_at FROM stakeholders WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'decision' AS entity_type, id, title, deleted_at FROM decision_requests WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'assumption' AS entity_type, id, statement AS title, deleted_at FROM assumptions WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'dependency' AS entity_type, id, title, deleted_at FROM dependencies WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'change_request' AS entity_type, id, title, deleted_at FROM change_requests WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'lesson' AS entity_type, id, summary AS title, deleted_at FROM lessons_learned WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'meeting' AS entity_type, id, title, deleted_at FROM meetings WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'document' AS entity_type, id, filename AS title, deleted_at FROM documents WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'roadmap_item' AS entity_type, id, title, deleted_at FROM roadmap_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'quality_item' AS entity_type, id, title, deleted_at FROM quality_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'procurement_item' AS entity_type, id, vendor_name AS title, deleted_at FROM procurement_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'comm_plan_item' AS entity_type, id, (audience || ': ' || topic) AS title, deleted_at FROM comm_plan_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'compliance_item' AS entity_type, id, title, deleted_at FROM compliance_items WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'objective' AS entity_type, id, title, deleted_at FROM objectives WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
  `;

  return json({ items });
});

export const config: Config = { path: "/api/trash" };
