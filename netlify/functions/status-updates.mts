import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

// The stated-status vocabulary a check-in can carry (v143) -- the same words
// the computed project health uses (netlify/lib/portfolioHealth.ts). A post
// without one is a plain note, exactly as before.
const HEALTH_VALUES = ["on_track", "at_risk", "off_track"];

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const body = await req.json().catch(() => null) as any;
  const projectId = body?.projectId;
  const text = (body?.body || "").trim();
  const health = body?.health ?? null;
  if (health !== null && !HEALTH_VALUES.includes(health)) {
    return json({ error: "health must be one of on_track, at_risk, off_track." }, { status: 400 });
  }
  // A plain note still requires text (the original rule); the body may be
  // empty only for a bare check-in that carries a stated status.
  if (!projectId || (!text && health === null)) {
    return json({ error: "projectId and body are required." }, { status: 400 });
  }
  if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  const database = db();
  const [update] = await database.sql`
    INSERT INTO status_updates (project_id, body, health) VALUES (${projectId}, ${text}, ${health})
    RETURNING id, body, health, created_at
  `;
  // v151 (Part C3): a check-in is the poster's own work, so it belongs in
  // their My activity -- which reads only activity_log. status_updates has
  // no author column; the author lives on this row's actor_id. The project
  // Feed excludes status_update 'created' activity rows (its derived branch
  // already carries the check-in), so nothing doubles there.
  const HEALTH_LABEL: Record<string, string> = { on_track: "On track", at_risk: "At risk", off_track: "Off track" };
  const summary = text ? text.slice(0, 120) : (health ? HEALTH_LABEL[health] : null);
  await logActivity(database, {
    projectId,
    entityType: "status_update",
    entityId: update.id,
    entityTitle: null,
    action: "created",
    summary,
  });
  return json({ statusUpdate: update }, { status: 201 });
});

export const config: Config = { path: "/api/status-updates" };
