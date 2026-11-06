-- Admin support view audit trail (v149): one row each time the admin opens a
-- user's project snapshot or downloads one of its documents, so there is a
-- permanent answer to "who looked at my project, and when".
-- Additive only: one new table, no existing table touched, no data rewritten.
CREATE TABLE IF NOT EXISTS admin_project_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_project_views_project
  ON admin_project_views (project_id, viewed_at DESC);
