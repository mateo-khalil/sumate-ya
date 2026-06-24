-- Add title column to matches table.
-- Previously the `description` column was repurposed as the match title.
-- Now title is a first-class field; description becomes a free-form optional note.
-- COALESCE(title, description) in the service layer preserves existing rows.
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "title" text;
