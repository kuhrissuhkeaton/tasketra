-- Change Control Board support: an opt-in per-project toggle plus a
-- reviewer flag on project_members. Most PMs never touch this; it only
-- shows up in the UI when a project turns it on.
ALTER TABLE projects ADD COLUMN ccb_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE project_members ADD COLUMN is_ccb_reviewer BOOLEAN NOT NULL DEFAULT false;

-- Sign-off record for change requests, keyed by reviewer email so it reads
-- sensibly even if a reviewer is later removed from the project.
ALTER TABLE change_requests ADD COLUMN ccb_approvals JSONB NOT NULL DEFAULT '[]';

-- Project rename/delete: `archived` already existed (unused) as the
-- natural soft-delete flag for a project, since Dashboard's project list
-- query already filters on it. `deleted_at` is added alongside purely for
-- display ("deleted 3 days ago") on the Dashboard's recently-deleted list.
ALTER TABLE projects ADD COLUMN deleted_at TIMESTAMPTZ;

ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN ('task','issue','risk','stakeholder','decision','member','assumption','dependency','change_request','lesson','meeting','project'));
