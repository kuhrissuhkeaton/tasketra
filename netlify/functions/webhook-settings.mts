import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { isObviouslyUnsafeWebhookUrl } from "../lib/ssrf-guard.ts";
import { withSentry } from "../lib/sentry.ts";

// Account-wide outbound webhook URL -- one per user, shared across every
// project they own. Individual projects opt in/out via projects.webhook_enabled
// (see project.mts PATCH), but the URL itself lives here so it's configured
// once rather than re-entered per project.

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();

  if (req.method === "GET") {
    const [user] = await database.sql`SELECT webhook_url FROM users WHERE id = ${userId}`;
    return json({ webhook_url: user?.webhook_url || null });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const raw = typeof body?.webhook_url === "string" ? body.webhook_url.trim() : "";
    if (raw) {
      try {
        const parsed = new URL(raw);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return json({ error: "Webhook URL must start with http:// or https://" }, { status: 400 });
        }
      } catch {
        return json({ error: "That doesn't look like a valid URL." }, { status: 400 });
      }
      if (isObviouslyUnsafeWebhookUrl(raw)) {
        return json({ error: "That URL points at a private or internal address, which isn't allowed for webhooks." }, { status: 400 });
      }
    }
    const [user] = await database.sql`
      UPDATE users SET webhook_url = ${raw || null} WHERE id = ${userId}
      RETURNING webhook_url
    `;
    return json({ webhook_url: user?.webhook_url || null });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/webhook-settings" };
