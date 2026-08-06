-- Backs app-level rate limiting for the three unauthenticated auth endpoints
-- (login, register, forgot-password), since Netlify Functions are stateless
-- and there's no in-memory counter that would survive between invocations.
-- Rows are short-lived: each check prunes its own bucket before counting,
-- so this table self-cleans and never needs a scheduled job.
CREATE TABLE rate_limit_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_rate_limit_hits_bucket_created ON rate_limit_hits(bucket, created_at);
