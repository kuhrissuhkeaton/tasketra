-- Numeric risk scores (v157): a risk can now carry probability and impact
-- on 1-5 scales, the way real project plans score them, alongside the
-- low/medium/high bands it has always had. Two additive, nullable columns;
-- no row is rewritten, deleted, or backfilled anywhere in this migration.
--
-- Existing risks keep NULL scores and behave exactly as before -- band
-- display, band-based high-exposure counts -- until someone edits them and
-- sets numbers. When both scores are set, the app also derives the bands
-- from them on every save (1-2 low, 3 medium, 4-5 high), so the surfaces
-- that still read the bands (the risk matrix, print and exports) stay
-- correct for scored risks too.
ALTER TABLE risks ADD COLUMN IF NOT EXISTS probability_score INTEGER;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS impact_score INTEGER;
