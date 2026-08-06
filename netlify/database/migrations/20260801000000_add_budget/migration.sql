ALTER TABLE projects ADD COLUMN budget_at_completion NUMERIC;

CREATE TABLE cost_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  incurred_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
