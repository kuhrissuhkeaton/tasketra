import crypto from "node:crypto";
import type { DatabaseConnection } from "@netlify/database";
import type { ApiTokenAuthRow, ApiTokenRow, ApiTokenScope, IdRow, UserFoundingMemberRow } from "./rows.ts";

// The api_tokens row types live in rows.ts with the other sensitive tables
// (Step 1 plan §5.5); re-exported here so existing imports keep working.
export type { ApiTokenRow, ApiTokenScope } from "./rows.ts";

// Personal API tokens for the MCP server (v169). A token is the credential
// a user's own AI client presents to /api/mcp. Generation and storage mirror
// the password-reset tokens in lib/auth.ts: the raw value is shown to the
// user exactly once, and only its SHA-256 hash ever reaches the database.

export const API_TOKEN_SCOPES: ApiTokenScope[] = ["read", "write"];

export function isApiTokenScope(v: unknown): v is ApiTokenScope {
  return v === "read" || v === "write";
}

export function generateApiToken() {
  const raw = `tk_${crypto.randomBytes(32).toString("base64url")}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  // Enough of the token to recognize it in a list ("tk_Ab3dEf…"), never
  // enough to use it.
  const prefix = raw.slice(0, 11);
  return { raw, hash, prefix };
}

export function hashApiToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function createApiToken(
  database: DatabaseConnection,
  userId: string,
  name: string,
  scope: ApiTokenScope
): Promise<{ raw: string; token: ApiTokenRow }> {
  const { raw, hash, prefix } = generateApiToken();
  const [token] = await database.sql<ApiTokenRow>`
    INSERT INTO api_tokens (user_id, name, token_hash, token_prefix, scope)
    VALUES (${userId}, ${name}, ${hash}, ${prefix}, ${scope})
    RETURNING id, name, token_prefix, scope, created_at, last_used_at, revoked_at
  `;
  return { raw, token };
}

export async function listApiTokens(database: DatabaseConnection, userId: string): Promise<ApiTokenRow[]> {
  return database.sql<ApiTokenRow>`
    SELECT id, name, token_prefix, scope, created_at, last_used_at, revoked_at
    FROM api_tokens
    WHERE user_id = ${userId} AND revoked_at IS NULL
    ORDER BY created_at DESC
  `;
}

export async function revokeApiToken(database: DatabaseConnection, userId: string, tokenId: string): Promise<boolean> {
  const rows = await database.sql<IdRow>`
    UPDATE api_tokens SET revoked_at = now()
    WHERE id = ${tokenId} AND user_id = ${userId} AND revoked_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export type AuthenticatedToken = { userId: string; tokenId: string; scope: ApiTokenScope };

/** Resolves the Authorization: Bearer credential on an MCP request to its
 *  token row. Returns null for anything missing, malformed, unknown, or
 *  revoked. Stamps last_used_at on success (awaited: one cheap UPDATE, and
 *  it keeps the settings list honest about which tokens are alive). */
export async function authenticateApiToken(database: DatabaseConnection, req: Request): Promise<AuthenticatedToken | null> {
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(tk_[A-Za-z0-9_-]+)$/.exec(header.trim());
  if (!match) return null;
  const hash = hashApiToken(match[1]);
  const [row] = await database.sql<ApiTokenAuthRow>`
    SELECT id, user_id, scope FROM api_tokens
    WHERE token_hash = ${hash} AND revoked_at IS NULL
  `;
  if (!row) return null;
  await database.sql`UPDATE api_tokens SET last_used_at = now() WHERE id = ${row.id}`;
  return { userId: row.user_id, tokenId: row.id, scope: row.scope as ApiTokenScope };
}

/** The v169 gate: MCP tokens are a founding-member beta feature. Checked
 *  the same way /api/founding-status counts members. */
export async function isFoundingMember(database: DatabaseConnection, userId: string): Promise<boolean> {
  const [row] = await database.sql<UserFoundingMemberRow>`SELECT founding_member FROM users WHERE id = ${userId}`;
  return row?.founding_member === true;
}
