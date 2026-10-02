-- Account rules.
--
-- 1. email_canonical: the form of an email used to decide "is this the same
--    mailbox" (lowercase; anything after a "+" ignored; Gmail dots ignored).
--    Sign-up sets it from netlify/lib/accountRules.ts canonicalEmail(); the
--    UPDATE below must stay in step with that function (a test checks it).
-- 2. A unique index on it, so two accounts can never share a mailbox even if
--    two sign-ups race. Accounts that already collide are left NULL (the
--    earliest one keeps the value) so this migration can never fail on old
--    data; the admin page lists them as possible duplicates to clean up.
-- 3. terms_accepted_at: when the person agreed to the Terms at sign-up.
-- 4. admin_actions: a record of every account removal / founding-status
--    removal done from the admin page. Keeps an email snapshot because the
--    account itself may be gone.

ALTER TABLE users ADD COLUMN email_canonical TEXT;
ALTER TABLE users ADD COLUMN terms_accepted_at TIMESTAMPTZ;

-- backfill:start
UPDATE users SET email_canonical = c.canon
FROM (
  SELECT id,
    CASE WHEN dom IN ('gmail.com', 'googlemail.com')
      THEN COALESCE(
             NULLIF(replace(COALESCE(NULLIF(split_part(loc, '+', 1), ''), loc), '.', ''), ''),
             COALESCE(NULLIF(split_part(loc, '+', 1), ''), loc)
           ) || '@gmail.com'
      ELSE COALESCE(NULLIF(split_part(loc, '+', 1), ''), loc) || '@' || dom
    END AS canon
  FROM (
    SELECT id,
           split_part(lower(btrim(email)), '@', 1) AS loc,
           substr(lower(btrim(email)), position('@' in lower(btrim(email))) + 1) AS dom
    FROM users
    WHERE position('@' in email) > 0
  ) s
) c
WHERE users.id = c.id;
-- backfill:end

UPDATE users SET email_canonical = NULL
WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY email_canonical ORDER BY created_at, id) AS rn
    FROM users
    WHERE email_canonical IS NOT NULL
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX idx_users_email_canonical ON users(email_canonical) WHERE email_canonical IS NOT NULL;

CREATE TABLE admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_email TEXT,
  action TEXT NOT NULL,
  target_user_id UUID,
  target_email TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_actions_created ON admin_actions(created_at DESC);
