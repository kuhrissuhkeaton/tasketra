-- Task priority: optional, so every existing task stays exactly as it is.
--   NULL = no priority set (the default). Otherwise low, medium or high.
-- Additive only: one nullable column, no data rewritten, nothing dropped.
ALTER TABLE tasks
  ADD COLUMN priority TEXT CHECK (priority IN ('low', 'medium', 'high'));
