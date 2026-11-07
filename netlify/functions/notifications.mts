import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { isAdminEmail } from "../lib/adminGate.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

// The notification bell. Nothing here is a new record of "something happened":
// every item is a read-only lens on data that already exists (decision
// answers, feedback status, new feedback, teammates' project activity),
// judged unread by comparing it with the signed-in person's own
// notifications_seen_at. The only things stored are that timestamp and the
// last What's new version seen (users table).
//
// What's new entries live in the front end, so the client works out which
// are new from whats_new_seen; this endpoint just remembers it.

const WINDOW = "30 days";

type Item = {
  id: string;
  type: "decision_response" | "feedback_update" | "feedback_inbox" | "project_activity";
  text: string;
  at: string | null;
  unread: boolean;
  to: string;
};

function snippet(text: string, max = 60): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export default withSentry(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "PATCH") return json({ error: "Method not allowed" }, { status: 405 });
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();

  if (req.method === "PATCH") {
    const body = (await req.json().catch(() => null)) as any;
    if (!body || typeof body !== "object") return json({ error: "Nothing to update" }, { status: 400 });
    if (body.whatsNewSeen !== undefined) {
      if (typeof body.whatsNewSeen !== "string" || !/^v\d+(\.\d+)*$/.test(body.whatsNewSeen)) {
        return json({ error: "whatsNewSeen must look like v100" }, { status: 400 });
      }
    }
    if (body.markAllRead !== true && body.whatsNewSeen === undefined) {
      return json({ error: "Nothing to update" }, { status: 400 });
    }
    if (body.markAllRead === true) {
      await database.sql`UPDATE users SET notifications_seen_at = now() WHERE id = ${userId}`;
    }
    if (body.whatsNewSeen !== undefined) {
      await database.sql`UPDATE users SET whats_new_seen = ${body.whatsNewSeen} WHERE id = ${userId}`;
    }
    return json({ ok: true });
  }

  const [me] = await database.sql`SELECT email, whats_new_seen FROM users WHERE id = ${userId}`;
  if (!me) return json({ error: "Not authenticated" }, { status: 401 });
  const isAdmin = isAdminEmail(me.email);

  const items: Item[] = [];

  // A stakeholder answered a decision on a project this person owns or is an
  // active member of.
  const decisions = await database.sql`
    SELECT dr.id, dr.title, dr.project_id, rec.id AS record_id, rec.responder_name, rec.chosen_option, rec.responded_at,
           rec.responded_at > (SELECT notifications_seen_at FROM users WHERE id = ${userId}) AS unread
    FROM decision_records rec
    JOIN decision_requests dr ON dr.id = rec.decision_request_id
    JOIN projects p ON p.id = dr.project_id
    WHERE dr.deleted_at IS NULL AND p.deleted_at IS NULL
      AND rec.responded_at > now() - ${WINDOW}::interval
      AND (
        p.owner_id = ${userId}
        OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ${userId} AND m.status = 'active')
      )
    ORDER BY rec.responded_at DESC
    LIMIT 20
  `;
  for (const d of decisions) {
    items.push({
      // v151: one item per RESPONSE, so the id keys on the record, not the
      // request -- a request can now collect several responses.
      id: `decision:${d.record_id}`,
      type: "decision_response",
      text: `${d.responder_name} answered "${snippet(d.title)}": ${snippet(d.chosen_option, 40)}`,
      at: d.responded_at ? new Date(d.responded_at).toISOString() : null,
      unread: !!d.unread,
      to: `/app/projects/${d.project_id}?tab=decisions`,
    });
  }

  // What teammates did in projects this person owns or is an active member
  // of: the shared activity log, other people's actions only (nobody needs a
  // notification about their own edits). Same 30-day lens as everything else.
  const activity = await database.sql`
    SELECT a.id, a.summary, a.entity_type, a.entity_title, a.action, a.created_at,
           p.id AS project_id, p.name AS project_name,
           COALESCE(NULLIF(TRIM(u.display_name), ''), 'A teammate') AS actor_name,
           a.created_at > (SELECT notifications_seen_at FROM users WHERE id = ${userId}) AS unread
    FROM activity_log a
    JOIN projects p ON p.id = a.project_id
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.actor_id IS NOT NULL AND a.actor_id != ${userId}
      AND a.created_at > now() - ${WINDOW}::interval
      AND p.deleted_at IS NULL
      AND (
        p.owner_id = ${userId}
        OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ${userId} AND m.status = 'active')
      )
    ORDER BY a.created_at DESC
    LIMIT 10
  `;
  const VERB: Record<string, string> = { created: "added", updated: "updated", deleted: "removed", restored: "restored" };
  for (const a of activity) {
    const what = a.summary
      ? snippet(String(a.summary), 80)
      : `${VERB[a.action as string] ?? "changed"} ${String(a.entity_type).replace(/_/g, " ")}${a.entity_title ? ` "${snippet(String(a.entity_title), 40)}"` : ""}`;
    items.push({
      id: `activity:${a.id}`,
      type: "project_activity",
      text: `${a.actor_name}: ${what} · ${snippet(String(a.project_name), 40)}`,
      at: a.created_at ? new Date(a.created_at).toISOString() : null,
      unread: !!a.unread,
      to: `/app/projects/${a.project_id}?tab=home`,
    });
  }

  // Their own feedback that was planned or shipped.
  const mine = await database.sql`
    SELECT f.id, f.message, f.status, f.updated_at,
           f.updated_at > (SELECT notifications_seen_at FROM users WHERE id = ${userId}) AS unread
    FROM feedback f
    WHERE f.user_id = ${userId} AND f.status IN ('planned', 'shipped')
      AND f.updated_at > now() - ${WINDOW}::interval
    ORDER BY f.updated_at DESC
    LIMIT 10
  `;
  for (const f of mine) {
    items.push({
      id: `feedback:${f.id}`,
      type: "feedback_update",
      text: f.status === "shipped"
        ? `Your feedback shipped: "${snippet(f.message)}"`
        : `Your feedback is planned: "${snippet(f.message)}"`,
      at: f.updated_at ? new Date(f.updated_at).toISOString() : null,
      unread: !!f.unread,
      to: "/app/whats-new",
    });
  }

  // Admin only: feedback nobody has triaged yet.
  if (isAdmin) {
    const [row] = await database.sql`
      SELECT count(*)::int AS n, max(created_at) AS latest,
             max(created_at) > (SELECT notifications_seen_at FROM users WHERE id = ${userId}) AS unread
      FROM feedback WHERE status = 'new'
    `;
    if (row && row.n > 0) {
      items.push({
        id: "feedback-inbox",
        type: "feedback_inbox",
        text: row.n === 1 ? "1 new piece of feedback in the inbox" : `${row.n} new pieces of feedback in the inbox`,
        at: row.latest ? new Date(row.latest).toISOString() : null,
        unread: !!row.unread,
        to: "/admin/feedback",
      });
    }
  }

  items.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  return json({ items, whatsNewSeen: me.whats_new_seen ?? null });
});

export const config: Config = { path: "/api/notifications" };
