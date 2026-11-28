-- Session revocation (Step 1 Foundation Plan §5.4, release R2): every
-- session cookie now carries the account's session_version, and the server
-- checks it on every authenticated request. Changing a password, resetting
-- it, or using "Sign out everywhere" increments the version, which retires
-- every cookie issued at the old version at its next request.
--
-- One additive column with a constant default: every existing account
-- starts at 0, no data is rewritten, and nothing else in the schema moves.
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
