-- Roadmap: strategic, exec-facing items (phases, milestones, releases, events,
-- notes) grouped into freeform swimlanes and positioned on a real date axis.
-- Deliberately a standalone entity, not tied to tasks -- roadmaps live at a
-- higher level of abstraction than day-to-day execution work, so a roadmap
-- shouldn't get cluttered by every task getting a due date. `swimlane` is
-- just a text column (e.g. "Platform", "Marketing") rather than its own
-- table: there's no cross-project reuse of swimlane names, so a lookup table
-- would just be overhead. `start_date`/`end_date` are both nullable --
-- milestones/events commonly use a single date (store it in start_date,
-- leave end_date null) and notes may have no date at all, in which case the
-- UI renders them in an "Undated" section per swimlane instead of on the axis.
CREATE TABLE roadmap_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'milestone' CHECK (type IN ('phase','milestone','release','event','note')),
  title TEXT NOT NULL,
  description TEXT,
  swimlane TEXT NOT NULL DEFAULT 'General',
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','blocked','done')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_roadmap_items_project ON roadmap_items(project_id) WHERE deleted_at IS NULL;

-- One shareable public link per project (not per-item) -- an exec sponsor
-- gets the whole roadmap, not a single milestone. Token is nullable/unset
-- until the owner first enables sharing; roadmap_share_enabled lets them
-- toggle visibility off without losing/rotating the token, and a distinct
-- "regenerate" action (handled in application code) can replace the token
-- to invalidate a previously shared link.
ALTER TABLE projects ADD COLUMN roadmap_share_token TEXT UNIQUE;
ALTER TABLE projects ADD COLUMN roadmap_share_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN ('task','issue','risk','stakeholder','decision','member','assumption','dependency','change_request','lesson','meeting','project','document','roadmap_item'));
