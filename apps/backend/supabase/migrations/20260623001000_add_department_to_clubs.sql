-- Add department column to clubs table.
-- Stores the Uruguayan department (one of 19) for geographic classification.
-- Also serves as the initial value for the `zone` column (backwards compat with the
-- match-listing zone filter which already uses the zone column for dropdown values).
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "department" text;
