-- How much structure a project needs (size) and how its work runs (approach),
-- plus an owner switch to show every tab regardless of size. Size only hides
-- tabs; it never deletes data. Existing projects are set to 'full' so nobody
-- loses a tab they already use, then the column default flips to 'standard'
-- for projects created from now on.
ALTER TABLE projects
  ADD COLUMN size TEXT NOT NULL DEFAULT 'full' CHECK (size IN ('light', 'standard', 'full'));
ALTER TABLE projects ALTER COLUMN size SET DEFAULT 'standard';

ALTER TABLE projects
  ADD COLUMN approach TEXT NOT NULL DEFAULT 'hybrid' CHECK (approach IN ('predictive', 'hybrid', 'agile'));

ALTER TABLE projects ADD COLUMN show_all_tabs BOOLEAN NOT NULL DEFAULT false;
