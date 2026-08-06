import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { verifyPassword, createSessionCookie } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { checkRateLimit, getClientIp } from "../lib/rate-limit.ts";
import { withSentry } from "../lib/sentry.ts";

const TOO_MANY = { error: "Too many attempts. Please wait a few minutes and try again." };

export default withSentry(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const body = await req.json().catch(() => null) as any;
  const email = (body?.email || "").trim().toLowerCase();
  const password = body?.password || "";
  if (!email || !password) return json({ error: "Email and password required." }, { status: 400 });

  const database = db();

  // Two buckets: by IP (stops one attacker hammering many accounts) and by
  // email (stops distributed attempts targeting a single account).
  const ipOk = await checkRateLimit(database, `login:ip:${getClientIp(req)}`, 20, 15);
  const emailOk = await checkRateLimit(database, `login:email:${email}`, 8, 15);
  if (!ipOk || !emailOk) return json(TOO_MANY, { status: 429 });

  const [user] = await database.sql`SELECT id, email, password_hash FROM users WHERE email = ${email}`;
  if (!user) return json({ error: "Incorrect email or password." }, { status: 401 });

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return json({ error: "Incorrect email or password." }, { status: 401 });

  const cookie = createSessionCookie(user.id);
  return json({ user: { id: user.id, email: user.email } }, { status: 200, headers: { "set-cookie": cookie } });
});

export const config: Config = { path: "/api/auth/login" };
