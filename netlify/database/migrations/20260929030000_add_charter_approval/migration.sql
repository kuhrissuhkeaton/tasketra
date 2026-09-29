ALTER TABLE projects ADD COLUMN charter_decision_id UUID REFERENCES decision_requests(id) ON DELETE SET NULL;
