import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { getEnv } from "../lib/env.ts";
import { json } from "../lib/http.ts";
import { sendEmail } from "../lib/notify.ts";
import { withSentry } from "../lib/sentry.ts";

/** Mirrors the admin gate in waitlist.mts / auth-me.mts. */
async function isAdmin(userId: string): Promise<boolean> {
  const adminEmail = getEnv("ADMIN_EMAIL");
  if (!adminEmail) return true;
  const database = db();
  const [user] = await database.sql`SELECT email FROM users WHERE id = ${userId}`;
  return user?.email?.toLowerCase() === adminEmail.toLowerCase();
}

const VALID_STATUSES = ["new", "planned", "shipped", "dismissed"];

export default withSentry(async (req: Request) => {
  const database = db();
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });

  if (req.method === "POST") {
    // Any logged-in user can submit feedback about their own experience.
    const body = await req.json().catch(() => null) as any;
    const message = (body?.message || "").trim();
    const pagePath = typeof body?.pagePath === "string" ? body.pagePath.slice(0, 200) : null;
    if (!message) return json({ error: "A message is required." }, { status: 400 });
    if (message.length > 4000) return json({ error: "Keep it under 4000 characters." }, { status: 400 });

    const [feedback] = await database.sql`
      INSERT INTO feedback (user_id, message, page_path)
      VALUES (${userId}, ${message}, ${pagePath})
      RETURNING id, message, page_path, status, created_at
    `;
    return json({ feedback });
  }

  // Everything else is admin-only.
  if (!(await isAdmin(userId))) return json({ error: "Not authorized" }, { status: 403 });

  if (req.method === "GET") {
    const items = await database.sql`
      SELECT f.id, f.message, f.page_path, f.status, f.admin_note, f.notified_at, f.created_at,
             u.email AS submitter_email
      FROM feedback f
      JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC
    `;
    return json({ items });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });

    const [existing] = await database.sql`SELECT * FROM feedback WHERE id = ${id}`;
    if (!existing) return json({ error: "Not found" }, { status: 404 });

    // Explicit notify action: emails the submitter that their feedback
    // shipped. Kept separate from the status change itself so marking
    // something "shipped" doesn't silently fire an email before you're
    // ready to actually message the person -- you might batch a few
    // fixes into one note, or not want to notify for a minor item.
    if (body?.notify === true) {
      if (existing.notified_at) return json({ error: "Already notified." }, { status: 400 });
      const [user] = await database.sql`SELECT email FROM users WHERE id = ${existing.user_id}`;
      if (user?.email) {
        await sendEmail(
          user.email,
          "Update on your Tasketra feedback",
          `Hi,\n\nYou left this feedback a little while back:\n\n"${existing.message}"\n\n` +
            `Wanted to let you know we acted on it. Thanks for taking the time to tell us --` +
            ` it genuinely shapes what we build next.\n\n-- Tasketra`
        );
      }
      const [feedback] = await database.sql`
        UPDATE feedback SET notified_at = now(), updated_at = now() WHERE id = ${id}
        RETURNING id, message, page_path, status, admin_note, notified_at, created_at
      `;
      return json({ feedback });
    }

    const status = body?.status;
    if (status && !VALID_STATUSES.includes(status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }
    const adminNote = typeof body?.adminNote === "string" ? body.adminNote : undefined;

    const [feedback] = await database.sql`
      UPDATE feedback SET
        status = COALESCE(${status ?? null}, status),
        admin_note = COALESCE(${adminNote ?? null}, admin_note),
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, message, page_path, status, admin_note, notified_at, created_at
    `;
    return json({ feedback });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    await database.sql`DELETE FROM feedback WHERE id = ${id}`;
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/feedback" };
