-- Profile fields for the account tab.
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN job_title TEXT;
ALTER TABLE users ADD COLUMN timezone TEXT;
ALTER TABLE users ADD COLUMN avatar_key TEXT;

-- Referral tracking. referred_by is set once, at registration, from a
-- ?ref= code in the signup link (the code itself is just the first 8 hex
-- characters of the referrer's own id -- no separate code column needed,
-- see referrals.mts). referral_reward_granted_at marks whether the "both
-- sides get a free month" reward has already been processed for this
-- referral, so the Stripe webhook never double-credits.
ALTER TABLE users ADD COLUMN referred_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN referral_reward_granted_at TIMESTAMPTZ;
