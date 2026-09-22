-- Tasks never had a notes/description field -- the detail-view drawer needs
-- somewhere to put longer context than fits in the list row.
ALTER TABLE tasks ADD COLUMN description TEXT;

-- RAID-to-task cross-linking, scoped to what's needed now: a risk or issue
-- can name the specific task(s) it blocks. Two dedicated join tables (rather
-- than one polymorphic table keyed by a "source_type" column) so each link
-- keeps a real foreign key and ON DELETE CASCADE instead of an
-- application-enforced reference -- deleting a risk, issue, or task cleans
-- up its links automatically, and a link can never point at a row that
-- doesn't exist. UNIQUE prevents the same pair being linked twice.
CREATE TABLE risk_task_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (risk_id, task_id)
);
CREATE INDEX idx_risk_task_links_risk ON risk_task_links (risk_id);
CREATE INDEX idx_risk_task_links_task ON risk_task_links (task_id);

CREATE TABLE issue_task_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (issue_id, task_id)
);
CREATE INDEX idx_issue_task_links_issue ON issue_task_links (issue_id);
CREATE INDEX idx_issue_task_links_task ON issue_task_links (task_id);
