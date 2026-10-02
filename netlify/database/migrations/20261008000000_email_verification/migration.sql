-- Email verification.
--
-- email_verified_at: set when the person proves they can read mail sent to the
-- address (by opening the link we email them). Every account that exists today
-- is marked verified as of this migration, so nobody is locked out; only
-- accounts created after it have to confirm.
--
-- email_verification_tokens: one row per link we send. Only a hash of the
-- token is stored (like password-reset tokens), so a leaked database row can't
-- be used as a link. Each row remembers which address it was sent to, so a
-- link sent to an address that has since been corrected can't verify the new one.

ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
UPDATE users SET email_verified_at = now();

CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_verification_tokens_user ON email_verification_tokens(user_id);
