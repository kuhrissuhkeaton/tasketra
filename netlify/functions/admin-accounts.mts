import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { getStrictAdmin } from "../lib/adminGate.ts";
import { canonicalEmail, foundingCap } from "../lib/accountRules.ts";
import { deleteAccount, healCanonicalEmails, previewRemoval, removeFoundingStatus, type BlobDeleter } from "../lib/accountRemoval.ts";
import { avatarsStore, documentsStore } from "../lib/blobs.ts";

// Admin-only account list and removal tools, used by the Founding members
// page. Everything here needs ADMIN_EMAIL to be set and to match the signed-in
// account (see lib/adminGate.ts).
//
//   GET  ?scope=founding|all   the accounts (founding members, or everyone), with
//                              project counts and possible-duplicate flags
//   GET  ?preview=<userId>     what deleting that account would remove, and
//                              anything that blocks it
//   POST { userId, action: "remove-founding" }
//   POST { userId, action: "delete", confirmEmail }   (email must be typed)

const realBlobDeleter: BlobDeleter = async (store, key) => {
  const s = store === "documents" ? documentsStore() : avatarsStore();
  await s.delete(key);
};

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const admin = await getStrictAdmin(database, userId);
  if (!admin) return json({ error: "Not authorized" }, { status: 403 });

  const url = new URL(req.url);

  if (req.method === "GET") {
    const previewId = url.searchParams.get("preview");
    if (previewId) {
      const preview = await previewRemoval(database, previewId, admin).catch(() => null);
      if (!preview) return json({ error: "Account not found." }, { status: 404 });
      return json({ preview });
    }

    const scope = url.searchParams.get("scope") === "all" ? "all" : "founding";
    await healCanonicalEmails(database);
    const everyone = await database.sql`SELECT id, email FROM users`;
    const byCanonical = new Map<string, string[]>();
    for (const u of everyone) {
      const key = canonicalEmail(u.email);
      byCanonical.set(key, [...(byCanonical.get(key) ?? []), u.email]);
    }

    const rows = await database.sql`
      SELECT u.id, u.email, u.display_name, u.job_title, u.created_at, u.founding_member,
             (SELECT count(*)::int FROM projects p WHERE p.owner_id = u.id) AS project_count,
             s.status AS subscription_status
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
      WHERE (${scope} = 'all' OR u.founding_member = true)
      ORDER BY u.created_at ASC
    `;
    const accounts = rows.map((r: any) => {
      const sameMailbox = (byCanonical.get(canonicalEmail(r.email)) ?? []).filter((e) => e !== r.email);
      return { ...r, is_you: r.id === admin.id, possible_duplicates: sameMailbox };
    });
    const [{ count }] = await database.sql`SELECT count(*)::int AS count FROM users WHERE founding_member = true`;
    return json({
      accounts,
      summary: { foundingClaimed: count, cap: foundingCap(), totalAccounts: everyone.length },
    });
  }

  if (req.method === "POST") {
    const body = (await req.json().catch(() => null)) as any;
    const targetId = typeof body?.userId === "string" ? body.userId : "";
    const action = body?.action;
    if (!targetId || (action !== "remove-founding" && action !== "delete")) {
      return json({ error: "userId and a valid action are required." }, { status: 400 });
    }

    if (action === "remove-founding") {
      const result = await removeFoundingStatus(database, targetId, admin);
      return result.ok ? json({ ok: true, details: result.details }) : json({ error: result.error }, { status: result.status });
    }

    const [target] = await database.sql`SELECT email FROM users WHERE id = ${targetId}`;
    if (!target) return json({ error: "Account not found." }, { status: 404 });
    const typed = typeof body?.confirmEmail === "string" ? body.confirmEmail.trim().toLowerCase() : "";
    if (typed !== target.email.toLowerCase()) {
      return json({ error: "Type the account's email address exactly to confirm." }, { status: 400 });
    }
    const result = await deleteAccount(database, targetId, admin, realBlobDeleter);
    if (result.ok) await healCanonicalEmails(database);
    return result.ok ? json({ ok: true, details: result.details }) : json({ error: result.error }, { status: result.status });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/admin-accounts" };
