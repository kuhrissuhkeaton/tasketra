-- Tracks whether a user has finished (or skipped) the first-run product
-- tour, so it never auto-triggers again after that. NULL = not seen yet.
-- Set from netlify/functions/account.mts's "complete-tour" action.
ALTER TABLE users ADD COLUMN tour_completed_at TIMESTAMPTZ;
