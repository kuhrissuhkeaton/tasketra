-- Founding Member badge: a permanent number, the date it was earned, and an
-- opt-in for appearing on the founders' wall (off by default).
ALTER TABLE users
  ADD COLUMN founding_number INTEGER,
  ADD COLUMN founding_at TIMESTAMPTZ,
  ADD COLUMN founding_wall_opt_in BOOLEAN NOT NULL DEFAULT false;

-- Number existing founders in the order they signed up.
UPDATE users u
SET founding_number = r.n,
    founding_at = COALESCE(u.email_verified_at, u.created_at)
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS n
  FROM users WHERE founding_member = true
) r
WHERE u.id = r.id;

CREATE UNIQUE INDEX idx_users_founding_number ON users(founding_number) WHERE founding_number IS NOT NULL;
