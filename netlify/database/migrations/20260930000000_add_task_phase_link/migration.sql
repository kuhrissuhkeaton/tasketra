-- Optional link from a task to a roadmap phase, so a PM can see how complete
-- each phase is. One phase per task (a plain nullable column, not a join
-- table): a task belongs to at most one phase in practice, and the link is
-- entirely optional -- every existing task simply stays unlinked.
--
-- ON DELETE SET NULL: if a phase row is ever hard-deleted, its tasks stay and
-- just become unlinked. (Normal roadmap deletes are soft, via deleted_at, so
-- restoring a phase from Trash brings its task links back with it.)
-- The API, not the database, enforces that the target is a same-project item
-- of type 'phase'.
ALTER TABLE tasks ADD COLUMN roadmap_item_id UUID REFERENCES roadmap_items(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_roadmap_item ON tasks (roadmap_item_id) WHERE roadmap_item_id IS NOT NULL;
