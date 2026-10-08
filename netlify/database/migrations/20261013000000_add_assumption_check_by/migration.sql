-- Quick win: assumptions had no date field at all (dependencies already
-- have needed_by). Add a check-by date so an assumption can say when it
-- gets confirmed or invalidated, mirroring dependencies.needed_by.
ALTER TABLE assumptions ADD COLUMN check_by DATE;
