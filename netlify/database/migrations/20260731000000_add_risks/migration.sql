CREATE TABLE risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  probability TEXT NOT NULL DEFAULT 'medium' CHECK (probability IN ('low','medium','high')),
  impact TEXT NOT NULL DEFAULT 'medium' CHECK (impact IN ('low','medium','high')),
  mitigation TEXT,
  owner_name TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','monitoring','resolved')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
