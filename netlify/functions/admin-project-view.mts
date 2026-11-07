import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { getStrictAdmin } from "../lib/adminGate.ts";
import { documentsStore } from "../lib/blobs.ts";

// Admin support view (v149): the admin (ADMIN_EMAIL, strict gate, fails
// closed) can look at any user's projects to help them with an issue —
// strictly read-only. There is no write path in this file at all: GET only,
// every other method is a 405, and no query below mutates user data.
//
//   GET ?userId=<id>                        the projects that user owns, with counts
//   GET ?projectId=<id>                     a full read-only snapshot of one project
//   GET ?projectId=<id>&documentId=<id>     download one of that project's documents
//
// Snapshot and download access is written to admin_project_views (the v149
// audit table) so there is a permanent record of who viewed what, when.
// Share secrets are deliberately excluded from the payload: no
// roadmap_share_token on the project, no public_token on decisions.

const PREVIEWABLE_EXTS = new Set(["pdf", "txt", "md", "png", "jpg", "jpeg", "gif", "webp"]);

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

// Same rule as documents.mts: keep the display name, strip anything unsafe
// for a Content-Disposition header.
function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || "file";
  return base.replace(/[^\w.\- ]/g, "_").slice(0, 200) || "file";
}

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const database = db();
  const admin = await getStrictAdmin(database, userId);
  if (!admin) return json({ error: "Not authorized" }, { status: 403 });

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const documentId = url.searchParams.get("documentId");
  const targetUserId = url.searchParams.get("userId");

  // --- One user's owned projects -------------------------------------------
  if (!projectId && targetUserId) {
    const [owner] = await database.sql`
      SELECT id, email, display_name FROM users WHERE id = ${targetUserId}
    `;
    if (!owner) return json({ error: "Account not found." }, { status: 404 });
    const projects = await database.sql`
      SELECT p.id, p.name, p.description, p.stage, p.archived, p.created_at,
        (SELECT max(al.created_at) FROM activity_log al WHERE al.project_id = p.id) AS last_activity_at,
        (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL) AS task_count,
        (SELECT count(*)::int FROM decision_requests dr WHERE dr.project_id = p.id AND dr.status = 'open' AND dr.deleted_at IS NULL) AS open_decisions,
        (SELECT count(*)::int FROM documents d WHERE d.project_id = p.id AND d.deleted_at IS NULL) AS document_count
      FROM projects p
      WHERE p.owner_id = ${targetUserId} AND p.deleted_at IS NULL
      ORDER BY p.created_at DESC
    `;
    return json({ owner, projects });
  }

  if (!projectId) {
    return json({ error: "userId or projectId is required." }, { status: 400 });
  }

  const [project] = await database.sql`
    SELECT p.id, p.name, p.description, p.created_at, p.owner_id, p.archived,
      p.stage, p.size, p.approach, p.closed_at,
      u.email AS owner_email, u.display_name AS owner_display_name,
      (SELECT max(al.created_at) FROM activity_log al WHERE al.project_id = p.id) AS last_activity_at
    FROM projects p
    JOIN users u ON u.id = p.owner_id
    WHERE p.id = ${projectId} AND p.deleted_at IS NULL
  `;
  if (!project) return json({ error: "Project not found." }, { status: 404 });

  const recordView = () =>
    database.sql`
      INSERT INTO admin_project_views (admin_user_id, owner_user_id, project_id)
      VALUES (${admin.id}, ${project.owner_id}, ${project.id})
    `;

  // --- Download one document from the project ------------------------------
  if (documentId) {
    const [doc] = await database.sql`
      SELECT id, project_id, filename, mime_type, size_bytes, blob_key
      FROM documents WHERE id = ${documentId} AND project_id = ${projectId} AND deleted_at IS NULL
    `;
    if (!doc) return json({ error: "Document not found." }, { status: 404 });
    // A store that cannot be reached at all (e.g. no blob context) degrades
    // to the same answer as a missing file rather than a 500.
    let blob: ArrayBuffer | null = null;
    try {
      blob = await documentsStore().get(doc.blob_key, { type: "arrayBuffer" });
    } catch {
      blob = null;
    }
    if (!blob) return json({ error: "File data missing" }, { status: 404 });
    await recordView();
    const previewable = PREVIEWABLE_EXTS.has(extOf(doc.filename));
    return new Response(blob, {
      status: 200,
      headers: {
        "content-type": doc.mime_type,
        "content-disposition": `${previewable ? "inline" : "attachment"}; filename="${sanitizeFilename(doc.filename)}"`,
        "content-length": String(doc.size_bytes),
        "cache-control": "private, max-age=0, must-revalidate",
      },
    });
  }

  // --- Full project snapshot -------------------------------------------------
  const [members, stakeholders, tasks, taskLinks, roadmapItems, decisions, risks, issues, assumptions, statusUpdates, documents, activity] =
    await Promise.all([
      database.sql`
        SELECT pm.id, pm.invited_email AS email, pm.status, pm.invited_at, pm.joined_at, pm.is_ccb_reviewer
        FROM project_members pm WHERE pm.project_id = ${projectId} ORDER BY pm.invited_at ASC
      `,
      database.sql`
        SELECT id, name, email, role, phone, power_level, interest_level, preferred_contact, notes
        FROM stakeholders WHERE project_id = ${projectId} AND deleted_at IS NULL ORDER BY name ASC
      `,
      database.sql`
        SELECT id, title, description, status, owner_name, start_date, due_date, stakeholder_id, parent_task_id, roadmap_item_id, priority, created_at, updated_at
        FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NULL
        ORDER BY CASE status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'not_started' THEN 2 ELSE 3 END, due_date NULLS LAST
      `,
      database.sql`
        SELECT l.task_id, l.depends_on_task_id, t1.title AS task_title, t2.title AS depends_on_title
        FROM task_task_links l
        JOIN tasks t1 ON t1.id = l.task_id
        JOIN tasks t2 ON t2.id = l.depends_on_task_id
        WHERE t1.project_id = ${projectId} AND t1.deleted_at IS NULL AND t2.deleted_at IS NULL
      `,
      database.sql`
        SELECT r.id, r.type, r.title, r.description, r.swimlane, r.start_date, r.end_date, r.status, r.created_at, r.updated_at,
          (SELECT count(*)::int FROM tasks t WHERE t.roadmap_item_id = r.id AND t.deleted_at IS NULL) AS task_total,
          (SELECT count(*)::int FROM tasks t WHERE t.roadmap_item_id = r.id AND t.deleted_at IS NULL AND t.status = 'done') AS task_done
        FROM roadmap_items r WHERE r.project_id = ${projectId} AND r.deleted_at IS NULL
        ORDER BY r.swimlane ASC, r.start_date ASC NULLS LAST, r.created_at ASC
      `,
      database.sql`
        SELECT dr.id, dr.title, dr.context, dr.options, dr.deadline, dr.status, dr.created_at,
          rec.chosen_option, rec.responder_name, rec.responded_at,
          COALESCE(
            (SELECT json_agg(json_build_object('id', s.id, 'name', s.name))
               FROM decision_request_recipients rr
               JOIN stakeholders s ON s.id = rr.stakeholder_id
               WHERE rr.decision_request_id = dr.id),
            '[]'
          ) AS recipients
        FROM decision_requests dr
        -- v151: outcome record only (confirmed, or a pre-v151 single
        -- record), so the snapshot stays one row per decision.
        LEFT JOIN LATERAL (
          SELECT r.chosen_option, r.responder_name, r.responded_at
          FROM decision_records r
          WHERE r.decision_request_id = dr.id
            AND (r.confirmed_at IS NOT NULL
                 OR (dr.status = 'resolved' AND NOT EXISTS (
                       SELECT 1 FROM decision_records c
                       WHERE c.decision_request_id = dr.id AND c.confirmed_at IS NOT NULL)))
          ORDER BY r.confirmed_at DESC NULLS LAST, r.responded_at DESC
          LIMIT 1
        ) rec ON true
        WHERE dr.project_id = ${projectId} AND dr.deleted_at IS NULL
        ORDER BY dr.created_at DESC
      `,
      database.sql`
        SELECT id, title, description, probability, impact, mitigation, owner_name, status, created_at, updated_at, resolved_at
        FROM risks WHERE project_id = ${projectId} AND deleted_at IS NULL ORDER BY created_at DESC
      `,
      database.sql`
        SELECT id, title, description, severity, status, owner_name, resolution, created_at, updated_at, resolved_at
        FROM issues WHERE project_id = ${projectId} AND deleted_at IS NULL ORDER BY created_at DESC
      `,
      database.sql`
        SELECT id, statement, notes, status, owner_name, check_by, created_at, updated_at, validated_at
        FROM assumptions WHERE project_id = ${projectId} AND deleted_at IS NULL ORDER BY created_at DESC
      `,
      database.sql`
        SELECT id, body, health, created_at FROM status_updates
        WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 50
      `,
      database.sql`
        SELECT d.id, d.filename, d.mime_type, d.size_bytes, d.created_at, u.email AS uploaded_by_email
        FROM documents d JOIN users u ON u.id = d.uploaded_by
        WHERE d.project_id = ${projectId} AND d.deleted_at IS NULL
        ORDER BY d.created_at DESC
      `,
      database.sql`
        SELECT id, entity_type, entity_id, entity_title, action, summary, actor_id, created_at
        FROM activity_log WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 50
      `,
    ]);

  await recordView();

  return json({
    readOnly: true,
    project,
    members,
    stakeholders,
    tasks,
    taskLinks,
    roadmapItems,
    decisions,
    risks,
    issues,
    assumptions,
    statusUpdates,
    documents,
    activity,
  });
});

export const config: Config = { path: "/api/admin-project-view" };
