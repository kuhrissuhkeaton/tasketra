import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest, verifyPassword, clearSessionCookie } from "../lib/auth.ts";
import { getEnv } from "../lib/env.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { checkRateLimit } from "../lib/rate-limit.ts";
import { deleteOwnAccount, type BlobDeleter } from "../lib/accountRemoval.ts";
import { avatarsStore, documentsStore } from "../lib/blobs.ts";

// Self-service account deletion. Needs the current password and the account's
// email typed exactly, is rate limited, and signs the person out on success.
const realBlobDeleter: BlobDeleter = async (store, key) => {
  const s = store === "documents" ? documentsStore() : avatarsStore();
  await s.delete(key);
};

export default withSentry(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();

  const allowed = await checkRateLimit(database, `account-delete:user:${userId}`, 5, 60);
  if (!allowed) return json({ error: "Too many attempts. Wait a little while, then try again." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as any;
  const password = typeof body?.password === "string" ? body.password : "";
  const typed = typeof body?.confirmEmail === "string" ? body.confirmEmail.trim().toLowerCase() : "";
  const [user] = await database.sql`SELECT email, password_hash FROM users WHERE id = ${userId}`;
  if (!user) return json({ error: "Account not found." }, { status: 404 });
  if (!(await verifyPassword(password, user.password_hash))) {
    return json({ error: "That password isn't right." }, { status: 400 });
  }
  if (typed !== user.email.toLowerCase()) {
    return json({ error: "Type your email address exactly to confirm." }, { status: 400 });
  }

  const result = await deleteOwnAccount(database, userId, getEnv("ADMIN_EMAIL") ?? null, realBlobDeleter);
  if (!result.ok) return json({ error: result.error }, { status: result.status });
  return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
});

export const config: Config = { path: "/api/account-delete" };
