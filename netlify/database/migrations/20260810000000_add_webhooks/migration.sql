-- Account-level outbound webhook URL (one per user, shared across all their projects).
ALTER TABLE users ADD COLUMN webhook_url TEXT;

-- Per-project on/off toggle for sending this project's events to the account webhook.
ALTER TABLE projects ADD COLUMN webhook_enabled BOOLEAN NOT NULL DEFAULT false;
