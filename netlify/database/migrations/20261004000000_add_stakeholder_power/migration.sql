-- How much influence a stakeholder has over the project (low, medium, high).
-- Paired with the existing interest_level it places each person on the
-- Power / Interest grid. Optional, so every existing stakeholder stays valid;
-- people without a value are listed as "not placed yet" rather than guessed.
ALTER TABLE stakeholders ADD COLUMN power_level TEXT CHECK (power_level IN ('low', 'medium', 'high'));
