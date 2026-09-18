CREATE TABLE procurement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'vendor' CHECK (category IN ('vendor','contract','purchase_order')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','in_progress','active','completed','cancelled')),
  owner_name TEXT,
  cost NUMERIC(12,2),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN ('task','issue','risk','stakeholder','decision','member','assumption','dependency','change_request','lesson','meeting','project','document','roadmap_item','quality_item','procurement_item'));
