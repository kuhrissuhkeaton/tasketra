-- Stripe can report more statuses than the original constraint allowed
-- (unpaid, incomplete_expired, paused); an insert with one of those would have
-- failed and made the webhook error. Widen it.
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused'));

-- When a failed payment started (drives the grace period), when the trial ends,
-- the time of the newest Stripe event applied (so a late, older event can't
-- overwrite a newer state), and whether this failure episode was emailed.
ALTER TABLE subscriptions ADD COLUMN past_due_since TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN trial_end TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN last_event_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN payment_failed_notified_at TIMESTAMPTZ;

-- Stripe retries and sometimes repeats events; remember which ones were handled.
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subscriptions already stuck in past_due start their grace period now.
UPDATE subscriptions SET past_due_since = now() WHERE status = 'past_due' AND past_due_since IS NULL;
