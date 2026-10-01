-- Task-level RACI rows: besides phases and milestones, the owner or any team
-- member can add individual tasks as rows. Which tasks are rows is its own
-- small table, so the task itself is never touched and removing a row never
-- deletes a task. Assignments for a task row reuse raci_assignments: a row is
-- now either a roadmap item or a task, never both.
CREATE TABLE raci_task_rows (
  task_id UUID PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_raci_task_rows_project ON raci_task_rows (project_id);

ALTER TABLE raci_assignments ALTER COLUMN roadmap_item_id DROP NOT NULL;
ALTER TABLE raci_assignments ADD COLUMN task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE raci_assignments ADD CONSTRAINT raci_one_row_kind CHECK ((roadmap_item_id IS NOT NULL) <> (task_id IS NOT NULL));
CREATE UNIQUE INDEX raci_task_one_per_stakeholder ON raci_assignments (task_id, stakeholder_id) WHERE task_id IS NOT NULL AND stakeholder_id IS NOT NULL;
CREATE UNIQUE INDEX raci_task_one_per_user ON raci_assignments (task_id, user_id) WHERE task_id IS NOT NULL AND user_id IS NOT NULL;
