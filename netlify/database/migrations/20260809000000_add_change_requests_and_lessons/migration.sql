CREATE TABLE change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  reason TEXT,
  schedule_impact_days INTEGER,
  budget_impact NUMERIC,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','implemented')),
  requested_by TEXT,
  decided_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  decided_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE lessons_learned (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'went_well' CHECK (category IN ('went_well','went_poorly','action_item')),
  summary TEXT NOT NULL,
  details TEXT,
  owner_name TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN ('task','issue','risk','stakeholder','decision','member','assumption','dependency','change_request','lesson'));
