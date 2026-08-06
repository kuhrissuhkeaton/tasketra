ALTER TABLE tasks ADD COLUMN parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
