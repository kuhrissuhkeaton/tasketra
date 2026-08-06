CREATE TABLE waitlist_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invited')),
  created_at TIMESTAMPTZ DEFAULT now()
);
