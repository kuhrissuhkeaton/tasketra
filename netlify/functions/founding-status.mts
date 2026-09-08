import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { withSentry } from "../lib/sentry.ts";

// Public, unauthenticated: reports how many of the 100 founding-member
// spots have been claimed so far. Fetched cross-origin from tasketra.com's
// pricing section, so it needs its own CORS header -- nothing else in this
// codebase serves the marketing site directly. Aggregate count only, no
// PII, safe to expose without auth.

const FOUNDING_CAP = 100;
const CORS_ORIGIN = "https://tasketra.com";

function withCors(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": CORS_ORIGIN,
      "cache-control": "public, max-age=60",
    },
  });
}

export default withSentry(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": CORS_ORIGIN,
        "access-control-allow-methods": "GET, OPTIONS",
      },
    });
  }
  if (req.method !== "GET") return withCors({ error: "Method not allowed" }, 405);

  const database = db();
  const [{ count }] = await database.sql`SELECT count(*) FROM users WHERE founding_member = true`;
  const claimed = Number(count);

  return withCors({
    cap: FOUNDING_CAP,
    claimed,
    remaining: Math.max(FOUNDING_CAP - claimed, 0),
    full: claimed >= FOUNDING_CAP,
  });
});

export const config: Config = { path: "/api/founding-status" };
