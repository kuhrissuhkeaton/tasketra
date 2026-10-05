import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { getEnv } from "../lib/env.ts";
import { sendEmail } from "../lib/notify.ts";
import { getStrictAdmin } from "../lib/adminGate.ts";
import {
  broadcastProgress, countFoundingAudience, createBroadcast, DuplicateBroadcastError, firstNameOf,
  recentBroadcasts, renderBody, retryFailed, sendNextBatch, validateBroadcast,
} from "../lib/broadcast.ts";

// Admin-only: email all founding members (people with a confirmed address).
//
//   GET                         audience size and recent sends
//   GET  ?id=<broadcastId>      progress of one send
//   POST { action: "test", subject, body }                    sends one copy to you
//   POST { action: "send", subject, body, holdCheckin, force? } creates the send and starts it
//   POST { action: "continue", broadcastId }                  sends the next batch
//   POST { action: "retry", broadcastId }                     retries failed recipients
//
// Sending happens in small batches so no single request runs long; the page
// keeps calling "continue" until nothing is pending.

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const admin = await getStrictAdmin(database, userId);
  if (!admin) return json({ error: "Not authorized" }, { status: 403 });

  if (req.method === "GET") {
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const progress = await broadcastProgress(database, id).catch(() => null);
      if (!progress) return json({ error: "Not found" }, { status: 404 });
      return json({ progress });
    }
    return json({ audience: await countFoundingAudience(database), recent: await recentBroadcasts(database) });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const body = (await req.json().catch(() => null)) as any;
  const action = body?.action;

  if (action === "test") {
    const problem = validateBroadcast(body?.subject, body?.body);
    if (problem) return json({ error: problem }, { status: 400 });
    const [me] = await database.sql`SELECT display_name FROM users WHERE id = ${admin.id}`;
    const result = await sendEmail(admin.email, `[Test] ${body.subject}`, renderBody(body.body, firstNameOf(me?.display_name)), getEnv("ADMIN_EMAIL") || undefined);
    if (!result.sent) return json({ error: "The test email couldn't be sent. Check that the email service is set up." }, { status: 502 });
    return json({ ok: true, sentTo: admin.email });
  }

  if (action === "send") {
    const problem = validateBroadcast(body?.subject, body?.body);
    if (problem) return json({ error: problem }, { status: 400 });
    let created;
    try {
      created = await createBroadcast(database, admin.id, {
        subject: body.subject.trim(), body: body.body, holdCheckin: body?.holdCheckin === true, force: body?.force === true,
      });
    } catch (err) {
      if (err instanceof DuplicateBroadcastError) return json({ error: err.message, duplicate: true }, { status: 409 });
      throw err;
    }
    if (created.total === 0) return json({ error: "There are no founding members with a confirmed email to send to." }, { status: 400 });
    const { progress, rateLimited } = await sendNextBatch(database, created.id);
    return json({ progress, rateLimited });
  }

  if (action === "continue" || action === "retry") {
    const id = typeof body?.broadcastId === "string" ? body.broadcastId : "";
    if (!id || !(await broadcastProgress(database, id).catch(() => null))) return json({ error: "Not found" }, { status: 404 });
    if (action === "retry") await retryFailed(database, id);
    const { progress, rateLimited } = await sendNextBatch(database, id);
    return json({ progress, rateLimited });
  }

  return json({ error: "Unknown action." }, { status: 400 });
});

export const config: Config = { path: "/api/admin-broadcast" };
