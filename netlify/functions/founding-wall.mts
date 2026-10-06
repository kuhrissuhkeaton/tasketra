import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

// The founders' wall: only members who opted in, shown by number and display
// name. Never returns an email. Visible to signed-in founding members only.
export default withSentry(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });

  const database = db();
  const [me] = await database.sql`SELECT founding_member FROM users WHERE id = ${userId}`;
  if (!me?.founding_member) return json({ error: "Founding members only" }, { status: 403 });

  const rows = await database.sql`
    SELECT founding_number, display_name
    FROM users
    WHERE founding_member = true
      AND founding_wall_opt_in = true
      AND founding_number IS NOT NULL
      AND display_name IS NOT NULL AND btrim(display_name) <> ''
    ORDER BY founding_number ASC
  `;
  return json({ members: rows.map((r: any) => ({ number: r.founding_number, name: r.display_name })) });
});

export const config: Config = { path: "/api/founding-wall" };
