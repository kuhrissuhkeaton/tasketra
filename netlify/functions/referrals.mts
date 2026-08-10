import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { getSiteUrl } from "../lib/env.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

// The referral "code" isn't a stored value -- it's just the first 8 hex
// characters of the user's own id (already a random UUID, so this is
// effectively unique without a dedicated column or uniqueness check). See
// auth-register.mts for how a code is resolved back to a referrer at signup.
export function codeForUserId(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8);
}

export default withSentry(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });

  const database = db();
  const referred = await database.sql`
    SELECT email, created_at, referral_reward_granted_at
    FROM users WHERE referred_by = ${userId}
    ORDER BY created_at DESC
  `;

  const code = codeForUserId(userId);
  const link = `${getSiteUrl()}/login?mode=register&ref=${code}`;

  return json({
    link,
    totalReferred: referred.length,
    totalRewarded: referred.filter((r: any) => r.referral_reward_granted_at).length,
    referred: referred.map((r: any) => ({
      email: r.email,
      joinedAt: r.created_at,
      rewarded: !!r.referral_reward_granted_at,
    })),
  });
});

export const config: Config = { path: "/api/referrals" };
