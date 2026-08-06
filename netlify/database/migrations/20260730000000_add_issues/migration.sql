CREATE TABLE issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  owner_name TEXT,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
