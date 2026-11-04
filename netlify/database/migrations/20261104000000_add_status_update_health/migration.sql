-- Stated status on a status update (v143): optional, so every existing
-- update stays exactly as it is.
--   NULL = a plain note, as before. Otherwise on_track, at_risk or
--   off_track -- the same vocabulary as the computed project health.
-- Additive only: one nullable column, no data rewritten, nothing dropped.
ALTER TABLE status_updates ADD COLUMN IF NOT EXISTS health TEXT;
