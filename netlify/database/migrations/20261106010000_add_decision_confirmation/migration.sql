-- Decision responses the owner confirms (v151, Part D Option 1) + check-ins
-- in the activity log (v151, Part C3). Three data-preserving changes; no row
-- is rewritten, deleted, or backfilled anywhere in this migration.
--
-- 1. The confirmed-outcome marker: NULL on every existing record and on new
--    public responses; set only when the project owner confirms a response
--    (or records an outcome) in the Decisions tab. Decisions resolved before
--    this release keep exactly the meaning they have today -- their single
--    record is treated as the outcome with no marker needed.
ALTER TABLE decision_records ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- 2. Responses can now collect: until v151 the first public response was the
--    decision, so the schema enforced one record per request. Option 1
--    records every response and lets the owner pick the outcome, so the
--    uniqueness has to go. Dropping it changes no existing data -- every
--    request still has exactly the records it has today.
ALTER TABLE decision_records DROP CONSTRAINT IF EXISTS decision_records_decision_request_id_key;

-- 3. Check-ins join the activity log (so they appear in My activity): the
--    entity_type CHECK widens by one value, the same drop-and-re-add pattern
--    every earlier entity type used.
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN ('task', 'issue', 'risk', 'stakeholder', 'decision', 'member', 'assumption', 'dependency', 'change_request', 'lesson', 'meeting', 'project', 'document', 'roadmap_item', 'quality_item', 'procurement_item', 'comm_plan_item', 'compliance_item', 'objective', 'key_result', 'status_update'));
