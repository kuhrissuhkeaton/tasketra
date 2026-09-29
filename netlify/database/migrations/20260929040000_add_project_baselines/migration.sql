-- A baseline is a frozen copy of the plan: the approved budget and reserve,
-- plus every task's dates at that moment. Locking again adds a new row, so the
-- earlier baselines are kept as history (and later, for trend charts).
CREATE TABLE project_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  budget_at_completion NUMERIC,
  contingency_reserve NUMERIC(12,2),
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX project_baselines_project_idx ON project_baselines (project_id, locked_at DESC);
