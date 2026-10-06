import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { foundingCap } from "../lib/accountRules.ts";
import { withSentry } from "../lib/sentry.ts";

// The signed-in founding member's own badge: number, date earned, and whether
// they have chosen to appear on the founders' wall. Founders only.
export default withSentry(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "PATCH") return json({ error: "Method not allowed" }, { status: 405 });
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });

  const database = db();
  const [me] = await database.sql`
    SELECT founding_member, founding_number, founding_at, founding_wall_opt_in FROM users WHERE id = ${userId}
  `;
  if (!me?.founding_member) return json({ error: "Founding members only" }, { status: 403 });

  if (req.method === "PATCH") {
    let body: any = null;
    try { body = await req.json(); } catch { /* handled below */ }
    if (!body || typeof body.wallOptIn !== "boolean") return json({ error: "wallOptIn must be true or false" }, { status: 400 });
    await database.sql`UPDATE users SET founding_wall_opt_in = ${body.wallOptIn} WHERE id = ${userId}`;
    me.founding_wall_opt_in = body.wallOptIn;
  }

  return json({
    number: me.founding_number ?? null,
    since: me.founding_at ?? null,
    cap: foundingCap(),
    wallOptIn: !!me.founding_wall_opt_in,
  });
});

export const config: Config = { path: "/api/founding-me" };
