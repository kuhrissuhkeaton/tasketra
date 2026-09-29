ALTER TABLE projects ADD COLUMN tolerances JSONB NOT NULL DEFAULT '{}'::jsonb;
