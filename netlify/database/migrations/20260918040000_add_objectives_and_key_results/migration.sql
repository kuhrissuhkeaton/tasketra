-- Objectives & Key Results, project-scoped like every other RAID-style
-- entity (not an account-level construct) -- an objective belongs to one
-- project, same as a risk or a task does. A portfolio-level rollup reads
-- across projects at query time (see the /api/portfolio endpoint) rather
-- than duplicating data into a separate account-level table.

CREATE TABLE objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  owner_name TEXT,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'on_track' CHECK (status IN ('on_track', 'at_risk', 'off_track', 'achieved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_objectives_project_id ON objectives(project_id);

-- A key result's progress is derived (current_value against start_value..
-- target_value), not stored as a separate percent -- one number to keep in
-- sync, not two. metric_type is display-only (how to format/label the
-- value), except 'boolean' where start/target are fixed at 0/1 and
-- current_value is either.
CREATE TABLE key_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id UUID NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  metric_type TEXT NOT NULL DEFAULT 'percent' CHECK (metric_type IN ('percent', 'number', 'currency', 'boolean')),
  start_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  current_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  target_value NUMERIC(14, 2) NOT NULL DEFAULT 100,
  unit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_key_results_objective_id ON key_results(objective_id);

ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN ('task', 'issue', 'risk', 'stakeholder', 'decision', 'member', 'assumption', 'dependency', 'change_request', 'lesson', 'meeting', 'project', 'document', 'roadmap_item', 'quality_item', 'procurement_item', 'comm_plan_item', 'compliance_item', 'objective', 'key_result'));
