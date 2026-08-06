CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meeting_type TEXT NOT NULL DEFAULT 'other' CHECK (meeting_type IN ('kickoff','status','steering','retro','ccb_review','other')),
  meeting_date DATE,
  attendees TEXT,
  notes TEXT,
  action_items JSONB NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_meetings_project ON meetings(project_id);

ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN ('task','issue','risk','stakeholder','decision','member','assumption','dependency','change_request','lesson','meeting'));
