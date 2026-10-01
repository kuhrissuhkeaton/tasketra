-- Richer stakeholder contact details, added after a founding member asked for
-- a way to track a contact's interest level and preferred way to be reached,
-- keep notes, and start a call or email straight from the register.
-- All four columns are optional, so every existing stakeholder stays valid.
-- interest_level and preferred_contact are small fixed lists enforced here as
-- well as in the API; phone and notes are free text.
ALTER TABLE stakeholders ADD COLUMN phone TEXT;
ALTER TABLE stakeholders ADD COLUMN interest_level TEXT CHECK (interest_level IN ('low', 'medium', 'high'));
ALTER TABLE stakeholders ADD COLUMN preferred_contact TEXT CHECK (preferred_contact IN ('email', 'phone', 'text', 'chat', 'in_person'));
ALTER TABLE stakeholders ADD COLUMN notes TEXT;
