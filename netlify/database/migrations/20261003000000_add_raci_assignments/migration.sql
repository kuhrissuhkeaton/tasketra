-- Live RACI matrix: who is Responsible, Accountable, Consulted or Informed for
-- each roadmap phase or milestone. A person is either a stakeholder or a team
-- member (the project owner or an active member), never both in one row.
-- role 'AR' means the same person is both Accountable and Responsible.
-- One row per (item, person); clearing a cell deletes the row. Rules like
-- "exactly one Accountable" are warnings in the app, not constraints here.
CREATE TABLE raci_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  roadmap_item_id UUID NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  stakeholder_id UUID REFERENCES stakeholders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('R', 'A', 'AR', 'C', 'I')),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((stakeholder_id IS NOT NULL) <> (user_id IS NOT NULL))
);
CREATE UNIQUE INDEX raci_one_per_stakeholder ON raci_assignments (roadmap_item_id, stakeholder_id) WHERE stakeholder_id IS NOT NULL;
CREATE UNIQUE INDEX raci_one_per_user ON raci_assignments (roadmap_item_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_raci_project ON raci_assignments (project_id);
