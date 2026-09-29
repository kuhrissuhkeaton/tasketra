-- Project stage: where a project is in its life (Initiate, Plan, Execute,
-- Close). A plain state the owner can move in either direction, not a locked
-- wizard, so a change request can send a project back to Plan. Existing
-- projects start in Plan, the most common place to be, and can be moved in
-- one click.
ALTER TABLE projects
  ADD COLUMN stage TEXT NOT NULL DEFAULT 'plan'
  CHECK (stage IN ('initiate', 'plan', 'execute', 'close'));
