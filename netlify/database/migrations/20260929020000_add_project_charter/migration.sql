ALTER TABLE projects ADD COLUMN charter JSONB NOT NULL DEFAULT '{}'::jsonb;
