-- Who did it: the signed-in user behind each activity entry. Nullable because
-- older entries (and public or system actions, such as a decision link
-- response or a Stripe webhook) have no signed-in author.
ALTER TABLE activity_log ADD COLUMN actor_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_activity_log_actor ON activity_log(actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
