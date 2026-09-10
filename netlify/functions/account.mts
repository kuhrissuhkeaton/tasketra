import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hashPassword, verifyPassword } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;

    // Change password is a distinct action, gated on the current password --
    // never bundled with the profile-fields update below.
    if (body?.action === "change-password") {
      const currentPassword = body?.currentPassword || "";
      const newPassword = body?.newPassword || "";
      if (!newPassword || newPassword.length < 8) {
        return json({ error: "New password must be at least 8 characters." }, { status: 400 });
      }
      const [user] = await database.sql`SELECT password_hash FROM users WHERE id = ${userId}`;
      if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
        return json({ error: "Current password is incorrect." }, { status: 400 });
      }
      const newHash = await hashPassword(newPassword);
      await database.sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${userId}`;
      return json({ ok: true });
    }

    // Marks the first-run product tour as done, whether the user finished
    // it or hit Skip -- either way it shouldn't auto-trigger again. The
    // Resources page's "Replay the tour" link starts it again explicitly,
    // client-side, without touching this column.
    if (body?.action === "complete-tour") {
      await database.sql`UPDATE users SET tour_completed_at = now() WHERE id = ${userId}`;
      return json({ ok: true });
    }

    // Field left out of the body entirely -> null -> COALESCE keeps the old
    // value. Field sent as an empty string (clearing it) -> COALESCE still
    // applies it, since "" isn't NULL. Only an actual missing key leaves the
    // column untouched.
    const displayName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 100) : null;
    const jobTitle = typeof body?.jobTitle === "string" ? body.jobTitle.trim().slice(0, 100) : null;
    const timezone = typeof body?.timezone === "string" ? body.timezone.trim().slice(0, 100) : null;

    const [user] = await database.sql`
      UPDATE users SET
        display_name = COALESCE(${displayName}, display_name),
        job_title = COALESCE(${jobTitle}, job_title),
        timezone = COALESCE(${timezone}, timezone)
      WHERE id = ${userId}
      RETURNING display_name, job_title, timezone
    `;
    return json({ user });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/account" };
