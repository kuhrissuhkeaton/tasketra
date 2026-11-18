-- Personal API tokens for the MCP server (v169): a user creates a token in
-- Account settings and pastes it into their own AI client, which then reads
-- their Tasketra projects over /api/mcp. Only the SHA-256 hash of a token is
-- stored (the password-reset token pattern in lib/auth.ts), so a leaked row
-- can never be replayed as a working token. Revoking sets revoked_at; the
-- row stays so the settings list can show what was revoked and when.
--
-- scope is 'read' or 'write' (write implies read), validated in the API the
-- same way share-link kinds are, so a future scope needs no migration.
-- Additive only: one new table, nothing existing is touched.
CREATE TABLE api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'read',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_api_tokens_user ON api_tokens (user_id, created_at DESC);
