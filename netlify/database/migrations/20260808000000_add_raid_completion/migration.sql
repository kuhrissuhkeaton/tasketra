CREATE TABLE assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'unconfirmed' CHECK (status IN ('unconfirmed','confirmed','invalidated')),
  owner_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  validated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  direction TEXT NOT NULL DEFAULT 'internal' CHECK (direction IN ('internal','external')),
  status TEXT NOT NULL DEFAULT 'blocked' CHECK (status IN ('blocked','in_progress','resolved')),
  owner_name TEXT,
  needed_by DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN ('task','issue','risk','stakeholder','decision','assumption','dependency','member'));
