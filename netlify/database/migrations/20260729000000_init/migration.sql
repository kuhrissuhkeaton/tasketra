CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE stakeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','blocked','done')),
  owner_name TEXT,
  due_date DATE,
  stakeholder_id UUID REFERENCES stakeholders(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE decision_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  context TEXT,
  options JSONB NOT NULL,
  deadline DATE,
  public_token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE decision_request_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_request_id UUID NOT NULL REFERENCES decision_requests(id) ON DELETE CASCADE,
  stakeholder_id UUID NOT NULL REFERENCES stakeholders(id) ON DELETE CASCADE
);

CREATE TABLE decision_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_request_id UUID NOT NULL UNIQUE REFERENCES decision_requests(id) ON DELETE CASCADE,
  chosen_option TEXT NOT NULL,
  responder_name TEXT NOT NULL,
  responded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE status_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
