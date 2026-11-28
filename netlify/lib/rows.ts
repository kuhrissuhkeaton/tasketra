// Row types for the permission / money / privacy tables, in one module
// (Step 1 Foundation Plan §5.5, release R1). Each type covers exactly the
// columns the queries in the typed lib files select -- no attempt to model
// the whole schema. Types are compile-time only and erased at runtime, so a
// generic on a query can never change the SQL that runs; it only makes a
// renamed column or a wrong-typed flag fail `tsc -b` instead of failing in
// front of a member.
//
// Timestamp and date columns are typed the way the codebase's existing query
// generics type them (test fixtures and integration tests use string),
// except where a consumer's signature already accepts both driver shapes
// (planForSubscription takes Date | string for past_due_since).
//
// project_members appears here through ExistenceRow: the only fenced query
// touching it is ownership's SELECT 1 probe. The workspaces /
// workspace_members tables in §5.5 do not exist until the R5 migration, so
// their row types land with that release, not here.

/** adminGate.getStrictAdmin: SELECT id, email FROM users WHERE id = ? */
export type UserIdentityRow = {
  id: string;
  email: string;
};

/** apiTokens.isFoundingMember / billing.getUserPlan:
 *  SELECT founding_member FROM users WHERE id = ? */
export type UserFoundingMemberRow = {
  founding_member: boolean;
};

/** A bare existence probe (ownership.ts): SELECT 1 FROM projects, UNIONed
 *  with SELECT 1 FROM project_members. Postgres names the column "?column?";
 *  callers only read rows.length. */
export type ExistenceRow = {
  "?column?": number;
};

/** billing.canCreateProject: SELECT count(*)::int AS count FROM projects */
export type ProjectCountRow = {
  count: number;
};

/** billing.getUserPlan: SELECT status, past_due_since FROM subscriptions
 *  WHERE user_id = ? */
export type SubscriptionStatusRow = {
  status: string;
  past_due_since: Date | string | null;
};

/** billing.storageUsedBytes: SELECT COALESCE(SUM(d.size_bytes), 0)::bigint
 *  AS total over the owner's documents. A bigint comes back from the driver
 *  as a string; the caller Number()s it. */
export type StorageTotalRow = {
  total: string;
};

/** decision_requests, covering the columns the codebase's reads select
 *  (decisions.mts, decision-public.mts): id, project_id, title, context,
 *  options, deadline, public_token, status, created_at, deleted_at,
 *  owner_stakeholder_id. options is the JSONB array of option strings,
 *  stored via JSON.stringify and read back as string[]. No R1 query reads
 *  this table yet; the type is the fence's canonical shape for its later
 *  consumers. */
export type DecisionRequestRow = {
  id: string;
  project_id: string;
  title: string;
  context: string | null;
  options: string[];
  deadline: string | null;
  public_token: string;
  status: string;
  created_at: string;
  deleted_at: string | null;
  owner_stakeholder_id: string | null;
};

export type ApiTokenScope = "read" | "write";

/** api_tokens. Moved here from apiTokens.ts (which re-exports it) so every
 *  sensitive row type lives in one module. */
export type ApiTokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  scope: ApiTokenScope;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

/** apiTokens.authenticateApiToken: SELECT id, user_id, scope FROM api_tokens
 *  WHERE token_hash = ?. scope stays string here -- the narrowing to
 *  ApiTokenScope happens at the use site, as it did before R1. */
export type ApiTokenAuthRow = {
  id: string;
  user_id: string;
  scope: string;
};

/** A RETURNING id probe (apiTokens.revokeApiToken). */
export type IdRow = {
  id: string;
};
