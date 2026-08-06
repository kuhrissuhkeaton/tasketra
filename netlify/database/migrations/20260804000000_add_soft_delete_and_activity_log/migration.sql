ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE issues ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE risks ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE stakeholders ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE decision_requests ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('task','issue','risk','stakeholder','decision')),
  entity_id UUID NOT NULL,
  entity_title TEXT,
  action TEXT NOT NULL CHECK (action IN ('created','updated','deleted','restored')),
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_log_project ON activity_log(project_id);
