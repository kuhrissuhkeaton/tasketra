CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active')),
  invited_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);
CREATE UNIQUE INDEX idx_project_members_project_email ON project_members(project_id, invited_email);

ALTER TABLE activity_log DROP CONSTRAINT activity_log_entity_type_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN ('task','issue','risk','stakeholder','decision','member'));
