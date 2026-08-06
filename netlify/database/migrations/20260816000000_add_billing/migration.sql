ALTER TABLE users ADD COLUMN founding_member BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'incomplete' CHECK (status IN ('trialing','active','past_due','canceled','incomplete')),
  billing_interval TEXT CHECK (billing_interval IN ('month','year')),
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);

-- One-time backfill: flag the first 100 users (by signup order) as founding
-- members. Combined with the check in auth-register.mts, this correctly
-- covers "first 100 ever" whether all 100 slots are already filled or some
-- remain open for upcoming signups.
WITH first_hundred AS (
  SELECT id FROM users ORDER BY created_at ASC LIMIT 100
)
UPDATE users SET founding_member = true WHERE id IN (SELECT id FROM first_hundred);
