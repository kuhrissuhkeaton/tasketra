-- Notification bell: remember what each person has already seen.
--   notifications_seen_at: "Mark all read" moves this to now(). Anything newer
--     (a decision answered, feedback update) counts as unread. Existing users
--     start at now() so nobody gets a flood of old items on first load.
--   whats_new_seen: the latest What's new version the person has seen (such as
--     'v99'). Existing users are set to v99, the latest entry before this
--     feature, so they get a dot for the first entry that ships after it. New
--     sign-ups stay NULL and the app fills it in on their first load.
ALTER TABLE users
  ADD COLUMN notifications_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN whats_new_seen TEXT;

UPDATE users SET whats_new_seen = 'v99';
