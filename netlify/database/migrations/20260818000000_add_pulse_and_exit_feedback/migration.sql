ALTER TABLE users ADD COLUMN last_pulse_sent_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN cancellation_notified_at TIMESTAMPTZ;
