-- Read-only share links for printable project documents (first use: the risk
-- matrix and register), so a project owner can show them to people who do not
-- have a Tasketra account. One active link per project per kind; stopping or
-- regenerating a link sets revoked_at, so an old link never works again.
-- kind is validated in the API (not a CHECK) so new document kinds, like a
-- RACI chart, can be added without a migration.
CREATE TABLE share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX share_links_one_active ON share_links (project_id, kind) WHERE revoked_at IS NULL;
