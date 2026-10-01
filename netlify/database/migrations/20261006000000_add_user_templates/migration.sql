-- A person's own saved project templates ("save this project as a template").
-- Private to the owner: every query filters on owner_id. The skeleton (phases,
-- milestones, tasks, risks, assumptions as titles and day offsets, never
-- people, emails or fixed dates) lives in one JSON document that is validated
-- again whenever it is read. Deleting the source project keeps the template.
CREATE TABLE user_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  data JSONB NOT NULL,
  source_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_templates_owner ON user_templates (owner_id, created_at DESC);
