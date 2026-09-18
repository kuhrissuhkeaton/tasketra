-- Project closure: a fixed checklist (booleans by key) plus notes and a
-- closed timestamp, kept on the projects row itself rather than a new table
-- since it's one checklist per project, not a list of records.
ALTER TABLE projects ADD COLUMN closure_checklist JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE projects ADD COLUMN closure_notes TEXT;
ALTER TABLE projects ADD COLUMN closed_at TIMESTAMPTZ;

-- Communications plan: who needs what information, how often, and by what
-- channel -- a reference list, not a workflow with a status lifecycle, so
-- no status column (unlike the other RAID-style entities).
CREATE TABLE comm_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  audience TEXT NOT NULL,
  topic TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily','weekly','biweekly','monthly','milestone','as_needed')),
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email','meeting','chat','report','other')),
  owner_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Compliance tracking: regulatory/policy/standard/contractual obligations,
-- tracked the same RAID-style shape as Quality (title, category, status,
-- owner), with resolved_at set once a determination is reached.
CREATE TABLE compliance_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'regulatory' CHECK (category IN ('regulatory','policy','standard','contractual')),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','compliant','non_compliant')),
  owner_name TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN ('task','issue','risk','stakeholder','decision','member','assumption','dependency','change_request','lesson','meeting','project','document','roadmap_item','quality_item','procurement_item','comm_plan_item','compliance_item'));
