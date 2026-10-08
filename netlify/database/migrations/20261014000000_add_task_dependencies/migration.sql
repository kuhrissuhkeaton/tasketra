-- Quick win: a simple task-to-task "depends on" link. Not the full
-- dependency-lines-on-the-Gantt-chart build (that stays Phase 2 on the
-- roadmap) -- just a visible list on the task drawer, shown both
-- directions ("Depends on" / "Needed by"). Same shape as risk_task_links /
-- issue_task_links (20260922000000): a dedicated join table with a real FK
-- and ON DELETE CASCADE rather than an application-enforced reference, plus
-- UNIQUE so the same pair can't be linked twice. CHECK stops a task from
-- depending on itself; nothing here stops a longer A->B->A cycle, which is
-- deliberately left to the full Phase 2 build.
CREATE TABLE task_task_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);
CREATE INDEX idx_task_task_links_task ON task_task_links (task_id);
CREATE INDEX idx_task_task_links_depends_on ON task_task_links (depends_on_task_id);
