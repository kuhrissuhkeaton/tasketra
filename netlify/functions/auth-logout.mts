import type { Config } from "@netlify/functions";
import { clearSessionCookie } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

export default withSentry(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
});

export const config: Config = { path: "/api/auth/logout" };
