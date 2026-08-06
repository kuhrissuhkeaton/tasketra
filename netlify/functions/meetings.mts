import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

const VALID_TYPES = ["kickoff", "status", "steering", "retro", "ccb_review", "other"];
const MEETING_FIELDS = [
  { key: "title", label: "title" },
  { key: "meeting_type", label: "type" },
  { key: "meeting_date", label: "date" },
  { key: "attendees", label: "attendees" },
  { key: "notes", label: "notes" },
];

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const meetings = await database.sql`
      SELECT id, title, meeting_type, meeting_date, attendees, notes, action_items, created_by, created_at, updated_at
      FROM meetings WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY meeting_date DESC NULLS LAST, created_at DESC
    `;
    return json({ meetings });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const title = (body?.title || "").trim();
    if (!projectId || !title) return json({ error: "projectId and title are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const meetingType = VALID_TYPES.includes(body?.meetingType) ? body.meetingType : "other";

    const [meeting] = await database.sql`
      INSERT INTO meetings (project_id, title, meeting_type, meeting_date, attendees, notes, action_items, created_by)
      VALUES (
        ${projectId}, ${title}, ${meetingType}, ${body?.meetingDate || null},
        ${body?.attendees || null}, ${body?.notes || null},
        ${JSON.stringify(Array.isArray(body?.actionItems) ? body.actionItems : [])},
        ${body?.createdBy || null}
      )
      RETURNING id, title, meeting_type, meeting_date, attendees, notes, action_items, created_by, created_at, updated_at
    `;
    await logActivity(database, { projectId, entityType: "meeting", entityId: meeting.id, entityTitle: meeting.title, action: "created" });
    return json({ meeting }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM meetings WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE meetings SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "meeting", entityId: id, entityTitle: existing.title, action: "restored" });
      return json({ ok: true });
    }

    if (body.meetingType && !VALID_TYPES.includes(body.meetingType)) {
      return json({ error: "Invalid meeting type." }, { status: 400 });
    }

    const [meeting] = await database.sql`
      UPDATE meetings SET
        title = COALESCE(${body.title ?? null}, title),
        meeting_type = COALESCE(${body.meetingType ?? null}, meeting_type),
        meeting_date = COALESCE(${body.meetingDate ?? null}, meeting_date),
        attendees = COALESCE(${body.attendees ?? null}, attendees),
        notes = COALESCE(${body.notes ?? null}, notes),
        action_items = COALESCE(${body.actionItems !== undefined ? JSON.stringify(body.actionItems) : null}, action_items),
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, meeting_type, meeting_date, attendees, notes, action_items, created_by, created_at, updated_at
    `;

    const summary = diffSummary(existing, {
      title: body.title, meeting_type: body.meetingType, meeting_date: body.meetingDate,
      attendees: body.attendees, notes: body.notes,
    }, MEETING_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "meeting", entityId: id, entityTitle: meeting.title, action: "updated", summary });

    return json({ meeting });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, title FROM meetings WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE meetings SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "meeting", entityId: id, entityTitle: existing.title, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/meetings" };
