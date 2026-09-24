-- Adds lightweight categorization to vendor/procurement records, inspired by
-- a Lansweeper "External Connections" dashboard Karissa reviewed: Category,
-- Sub-category, and Role. These are deliberately separate from the existing
-- `category` column (which tracks the procurement TYPE -- vendor / contract /
-- purchase_order) to avoid overloading that field's meaning. All three are
-- free-text and optional, since Tasketra spans many industries and a fixed
-- enum (the way Lansweeper's IT-asset categories are fixed) wouldn't fit a
-- catering vendor the same way it fits a software vendor.
ALTER TABLE procurement_items ADD COLUMN vendor_category TEXT;
ALTER TABLE procurement_items ADD COLUMN vendor_subcategory TEXT;
ALTER TABLE procurement_items ADD COLUMN role TEXT;
