-- One-off or recurring emails from the admin to a group of people (today:
-- founding members). Each recipient row is claimed before sending, so a retried
-- or repeated request can never email the same person twice.
CREATE TABLE admin_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience TEXT NOT NULL DEFAULT 'founding',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  hold_checkin BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_broadcast_recipients (
  broadcast_id UUID NOT NULL REFERENCES admin_broadcasts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  first_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  error TEXT,
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  PRIMARY KEY (broadcast_id, email)
);

CREATE INDEX idx_admin_broadcast_recipients_status ON admin_broadcast_recipients(broadcast_id, status);
