import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

// Read-only. The one call the Dashboard calendar needs: everything dated in a
// range across every project the signed-in user can see (owned, or an active
// member of -- the same access rule /api/my-today and /api/portfolio already
// use). Three kinds of items come back, each with a plain YYYY-MM-DD date
// string: open tasks by due date, roadmap milestones/releases/events by
// start date, and decisions still waiting by their deadline (or the day they
// were raised when no deadline is set). Bucketing happens in the browser
// against the viewer's local dates, like /api/my-today, so the server never
// re-derives a day from a timestamp -- except a decision's created date,
// which is taken in UTC and can sit a day either side of the viewer's.
//
// Archived projects are out (same as everywhere else) and closed projects are
// out too: their leftover dates are history, not a schedule. Nothing is
// written and no state lives here. Capped so a large account can't return an
// unbounded list. Dates are formatted with to_char in SQL: some drivers hand
// DATE columns back as Date objects, and the string form of one of those is
// not a date key.

const MAX_RANGE_DAYS = 62;
const ITEM_LIMIT = 500;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function parseDateKey(raw: string | null): string | null {
  if (!raw || !DATE_KEY.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return raw;
}

function dateKeyOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The current month padded out to full Sunday-start weeks, in UTC. */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  first.setUTCDate(first.getUTCDate() - first.getUTCDay());
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  last.setUTCDate(last.getUTCDate() + (6 - last.getUTCDay()));
  return {
    from: dateKeyOf(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()),
    to: dateKeyOf(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()),
  };
}

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const url = new URL(req.url);
  const rawFrom = url.searchParams.get("from");
  const rawTo = url.searchParams.get("to");
  if (rawFrom && !parseDateKey(rawFrom)) {
    return json({ error: "from must be a YYYY-MM-DD date" }, { status: 400 });
  }
  if (rawTo && !parseDateKey(rawTo)) {
    return json({ error: "to must be a YYYY-MM-DD date" }, { status: 400 });
  }
  const fallback = defaultRange();
  const from = parseDateKey(rawFrom) ?? fallback.from;
  const to = parseDateKey(rawTo) ?? fallback.to;
  const spanDays = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (spanDays < 1) return json({ error: "to must not be before from" }, { status: 400 });
  if (spanDays > MAX_RANGE_DAYS) {
    return json({ error: `Range is too wide: at most ${MAX_RANGE_DAYS} days` }, { status: 400 });
  }

  const database = db();

  const [taskRows, milestoneRows, decisionRows] = await Promise.all([
    database.sql`
      SELECT t.id, t.title, t.status, to_char(t.due_date, 'YYYY-MM-DD') AS date_key, t.project_id,
             p.name AS project_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.deleted_at IS NULL
        AND t.status != 'done'
        AND t.due_date >= ${from}::date
        AND t.due_date <= ${to}::date
        AND p.archived = false
        AND p.closed_at IS NULL
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        AND t.id NOT IN (SELECT DISTINCT parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL)
      ORDER BY t.due_date, t.title
      LIMIT ${ITEM_LIMIT}
    `,
    database.sql`
      SELECT ri.id, ri.title, ri.status, to_char(ri.start_date, 'YYYY-MM-DD') AS date_key, ri.project_id,
             p.name AS project_name
      FROM roadmap_items ri
      JOIN projects p ON p.id = ri.project_id
      WHERE ri.deleted_at IS NULL
        AND ri.type IN ('milestone', 'release', 'event')
        AND ri.start_date >= ${from}::date
        AND ri.start_date <= ${to}::date
        AND p.archived = false
        AND p.closed_at IS NULL
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
      ORDER BY ri.start_date, ri.title
      LIMIT ${ITEM_LIMIT}
    `,
    database.sql`
      SELECT dr.id, dr.title, dr.status,
             to_char(COALESCE(dr.deadline, (dr.created_at AT TIME ZONE 'UTC')::date), 'YYYY-MM-DD') AS item_date,
             to_char((dr.created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS created_date,
             dr.project_id, p.name AS project_name
      FROM decision_requests dr
      JOIN projects p ON p.id = dr.project_id
      WHERE dr.deleted_at IS NULL
        AND dr.status = 'open'
        AND COALESCE(dr.deadline, (dr.created_at AT TIME ZONE 'UTC')::date) >= ${from}::date
        AND COALESCE(dr.deadline, (dr.created_at AT TIME ZONE 'UTC')::date) <= ${to}::date
        AND p.archived = false
        AND p.closed_at IS NULL
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
      ORDER BY item_date, dr.title
      LIMIT ${ITEM_LIMIT}
    `,
  ]);

  const items = [
    ...(taskRows as any[]).map((t) => ({
      id: t.id,
      kind: "task" as const,
      date: t.date_key as string,
      title: t.title,
      status: t.status as string,
      project_id: t.project_id,
      project_name: t.project_name,
    })),
    ...(milestoneRows as any[]).map((r) => ({
      id: r.id,
      kind: "milestone" as const,
      date: r.date_key as string,
      title: r.title,
      status: r.status as string,
      project_id: r.project_id,
      project_name: r.project_name,
    })),
    ...(decisionRows as any[]).map((d) => ({
      id: d.id,
      kind: "decision" as const,
      date: d.item_date as string,
      title: d.title,
      status: d.status as string,
      created_date: d.created_date as string,
      project_id: d.project_id,
      project_name: d.project_name,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  return json({ items, from, to });
});

export const config: Config = { path: "/api/my-calendar" };
