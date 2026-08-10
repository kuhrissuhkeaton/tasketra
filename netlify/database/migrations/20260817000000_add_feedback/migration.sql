CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  page_path TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'planned', 'shipped', 'dismissed')),
  admin_note TEXT,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_user ON feedback(user_id);
