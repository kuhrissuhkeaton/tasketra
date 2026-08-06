import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { getEnv } from "../lib/env.ts";
import { json } from "../lib/http.ts";

/**
 * A single admin gate for reviewing the waitlist. If ADMIN_EMAIL isn't set,
 * any authenticated user can manage it -- reasonable while Tasketra has one
 * real account. Set ADMIN_EMAIL once there's more than one person with a login.
 */
async function isAdmin(userId: string): Promise<boolean> {
  const adminEmail = getEnv("ADMIN_EMAIL");
  if (!adminEmail) return true;
  const database = db();
  const [user] = await database.sql`SELECT email FROM users WHERE id = ${userId}`;
  return user?.email?.toLowerCase() === adminEmail.toLowerCase();
}

export default async (req: Request) => {
  const database = db();
  const url = new URL(req.url);

  if (req.method === "POST") {
    // Public: anyone can join the waitlist, no auth required.
    const body = await req.json().catch(() => null) as any;
    const email = (body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return json({ error: "A valid email is required." }, { status: 400 });

    await database.sql`
      INSERT INTO waitlist_signups (email) VALUES (${email})
      ON CONFLICT (email) DO NOTHING
    `;
    return json({ ok: true, message: "You're on the list -- we'll be in touch." });
  }

  // Everything else is admin-only.
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (!(await isAdmin(userId))) return json({ error: "Not authorized" }, { status: 403 });

  if (req.method === "GET") {
    const signups = await database.sql`
      SELECT id, email, status, created_at FROM waitlist_signups ORDER BY created_at DESC
    `;
    return json({ signups });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [signup] = await database.sql`
      UPDATE waitlist_signups SET status = 'invited' WHERE id = ${id}
      RETURNING id, email, status, created_at
    `;
    if (!signup) return json({ error: "Not found" }, { status: 404 });
    return json({ signup });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    await database.sql`DELETE FROM waitlist_signups WHERE id = ${id}`;
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};

export const config: Config = { path: "/api/waitlist" };
