// Central plan/limit logic. A user is on the paid plan if they're a founding
// member (free forever, first 100 signups) OR have a subscription row in
// 'trialing' or 'active' status. Everyone else is on the free tier.
//
// Limits:
//  - Project count: free tier capped at FREE_PROJECT_LIMIT; paid/founding
//    is unlimited.
//  - Members per project: a single universal cap (MEMBER_LIMIT_PER_PROJECT)
//    applies regardless of plan -- this is the self-serve ceiling that
//    protects against the "200 people on one flat-rate account" runaway-cost
//    scenario. Teams that need more talk to us; there's no code path to
//    self-serve past it.

export const FREE_PROJECT_LIMIT = 3;
export const MEMBER_LIMIT_PER_PROJECT = 25;

export type PlanStatus = "founding" | "trialing" | "active" | "free";

export async function getUserPlan(database: any, userId: string): Promise<PlanStatus> {
  const [user] = await database.sql`SELECT founding_member FROM users WHERE id = ${userId}`;
  if (user?.founding_member) return "founding";

  const [sub] = await database.sql`
    SELECT status FROM subscriptions WHERE user_id = ${userId} AND status IN ('trialing', 'active')
  `;
  if (sub?.status === "trialing") return "trialing";
  if (sub?.status === "active") return "active";
  return "free";
}

export function isPaidPlan(plan: PlanStatus): boolean {
  return plan !== "free";
}

export async function canCreateProject(database: any, userId: string): Promise<boolean> {
  const plan = await getUserPlan(database, userId);
  if (isPaidPlan(plan)) return true;
  const [{ count }] = await database.sql`
    SELECT count(*)::int AS count FROM projects WHERE owner_id = ${userId} AND deleted_at IS NULL
  `;
  return count < FREE_PROJECT_LIMIT;
}
