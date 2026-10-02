// Central plan/limit logic. A user is on the paid plan if they're a founding
// member (free forever, first 100 signups) OR have a subscription row in
// 'trialing' or 'active' status (or a recent failed payment, see below). Everyone else is on the free tier.
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

// "past_due" = a renewal payment failed. Pro access continues for a grace
// period while Stripe retries the card and the customer is asked to fix it;
// after that the account drops to Free (nothing is deleted).
export type PlanStatus = "founding" | "trialing" | "active" | "past_due" | "free";

export const PAST_DUE_GRACE_DAYS = 14;

/** Stripe statuses where a subscription still exists and could bill. A new
 *  checkout must never be started while one of these exists. */
export const LIVE_SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "unpaid", "paused", "incomplete"];

/** The one place a stored Stripe status becomes a Tasketra plan. */
export function planForSubscription(status: string | null | undefined, pastDueSince: Date | string | null | undefined, now: Date = new Date()): PlanStatus {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "past_due") {
    if (!pastDueSince) return "past_due";
    const since = new Date(pastDueSince).getTime();
    return now.getTime() - since < PAST_DUE_GRACE_DAYS * 86_400_000 ? "past_due" : "free";
  }
  return "free";
}

export async function getUserPlan(database: any, userId: string): Promise<PlanStatus> {
  const [user] = await database.sql`SELECT founding_member FROM users WHERE id = ${userId}`;
  if (user?.founding_member) return "founding";

  const [sub] = await database.sql`SELECT status, past_due_since FROM subscriptions WHERE user_id = ${userId}`;
  return planForSubscription(sub?.status, sub?.past_due_since);
}

export function isPaidPlan(plan: PlanStatus): boolean {
  return plan !== "free";
}

export async function canCreateProject(database: any, userId: string): Promise<boolean> {
  const plan = await getUserPlan(database, userId);
  if (isPaidPlan(plan)) return true;
  const [{ count }] = await database.sql`
    SELECT count(*)::int AS count FROM projects WHERE owner_id = ${userId} AND deleted_at IS NULL AND closed_at IS NULL
  `;
  return count < FREE_PROJECT_LIMIT;
}

// Aggregate document storage, scoped to the project *owner's* account (the
// paying party) rather than per-project or per-uploader -- consistent with
// how FREE_PROJECT_LIMIT and MEMBER_LIMIT_PER_PROJECT work. A team member
// uploading into someone else's project draws against that owner's cap.
//
// Deliberately generous relative to competitors (Trello: 10MB/attachment on
// free; ClickUp: ~100MB aggregate free; Basecamp: 1GB free) because actual
// storage cost at Tasketra's scale is negligible -- this exists to guard
// against abuse/runaway cost, not to nickel-and-dime users into upgrading.
export const FREE_STORAGE_CAP_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
export const PAID_STORAGE_CAP_BYTES = 25 * 1024 * 1024 * 1024; // 25GB

export function storageCapBytes(plan: PlanStatus): number {
  return isPaidPlan(plan) ? PAID_STORAGE_CAP_BYTES : FREE_STORAGE_CAP_BYTES;
}

// Computed on read (SUM over the owner's non-deleted documents) rather than
// a maintained counter column on `users` -- avoids counter/reality drift,
// and at current document volume a SUM over an indexed join is cheap.
export async function storageUsedBytes(database: any, ownerId: string): Promise<number> {
  const [row] = await database.sql`
    SELECT COALESCE(SUM(d.size_bytes), 0)::bigint AS total
    FROM documents d
    JOIN projects p ON p.id = d.project_id
    WHERE p.owner_id = ${ownerId} AND d.deleted_at IS NULL
  `;
  return Number(row.total);
}

export async function canUploadBytes(
  database: any,
  ownerId: string,
  addBytes: number
): Promise<{ ok: boolean; usedBytes: number; capBytes: number; plan: PlanStatus }> {
  const plan = await getUserPlan(database, ownerId);
  const capBytes = storageCapBytes(plan);
  const usedBytes = await storageUsedBytes(database, ownerId);
  return { ok: usedBytes + addBytes <= capBytes, usedBytes, capBytes, plan };
}
