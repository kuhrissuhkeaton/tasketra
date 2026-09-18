import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

// A communications plan: who needs what information, how often, and by
// what channel -- PMI's "plan communications" task. Kept as a reference
// list rather than a workflow with a status lifecycle (unlike the rest of
// RAID), since an entry doesn't move through states -- it just describes an
// ongoing arrangement until it's edited or removed.

const VALID_FREQUENCIES = ["daily", "weekly", "biweekly", "monthly", "milestone", "as_needed"];
const VALID_CHANNELS = ["email", "meeting", "chat", "report", "other"];
const COMM_PLAN_FIELDS = [
  { key: "audience", label: "audience" },
  { key: "topic", label: "topic" },
  { key: "frequency", label: "frequency" },
  { key: "channel", label: "channel" },
  { key: "owner_name", label: "owner" },
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

    const commPlanItems = await database.sql`
      SELECT id, audience, topic, frequency, channel, owner_name, notes, created_at, updated_at
      FROM comm_plan_items WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY audience ASC, created_at DESC
    `;
    return json({ commPlanItems });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const audience = (body?.audience || "").trim();
    const topic = (body?.topic || "").trim();
    if (!projectId || !audience || !topic) return json({ error: "projectId, audience, and topic are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const frequency = VALID_FREQUENCIES.includes(body?.frequency) ? body.frequency : "weekly";
    const channel = VALID_CHANNELS.includes(body?.channel) ? body.channel : "email";

    const [commPlanItem] = await database.sql`
      INSERT INTO comm_plan_items (project_id, audience, topic, frequency, channel, owner_name, notes)
      VALUES (${projectId}, ${audience}, ${topic}, ${frequency}, ${channel}, ${body?.ownerName || null}, ${body?.notes || null})
      RETURNING id, audience, topic, frequency, channel, owner_name, notes, created_at, updated_at
    `;
    await logActivity(database, { projectId, entityType: "comm_plan_item", entityId: commPlanItem.id, entityTitle: `${commPlanItem.audience}: ${commPlanItem.topic}`, action: "created" });
    return json({ commPlanItem }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM comm_plan_items WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE comm_plan_items SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "comm_plan_item", entityId: id, entityTitle: `${existing.audience}: ${existing.topic}`, action: "restored" });
      return json({ ok: true });
    }

    if (body.frequency && !VALID_FREQUENCIES.includes(body.frequency)) {
      return json({ error: "Invalid frequency." }, { status: 400 });
    }
    if (body.channel && !VALID_CHANNELS.includes(body.channel)) {
      return json({ error: "Invalid channel." }, { status: 400 });
    }

    const [commPlanItem] = await database.sql`
      UPDATE comm_plan_items SET
        audience = COALESCE(${body.audience ?? null}, audience),
        topic = COALESCE(${body.topic ?? null}, topic),
        frequency = COALESCE(${body.frequency ?? null}, frequency),
        channel = COALESCE(${body.channel ?? null}, channel),
        owner_name = COALESCE(${body.ownerName ?? null}, owner_name),
        notes = COALESCE(${body.notes ?? null}, notes),
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, audience, topic, frequency, channel, owner_name, notes, created_at, updated_at
    `;

    const summary = diffSummary(existing, {
      audience: body.audience, topic: body.topic, frequency: body.frequency,
      channel: body.channel, owner_name: body.ownerName, notes: body.notes,
    }, COMM_PLAN_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "comm_plan_item", entityId: id, entityTitle: `${commPlanItem.audience}: ${commPlanItem.topic}`, action: "updated", summary });

    return json({ commPlanItem });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, audience, topic FROM comm_plan_items WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE comm_plan_items SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "comm_plan_item", entityId: id, entityTitle: `${existing.audience}: ${existing.topic}`, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/communications" };
