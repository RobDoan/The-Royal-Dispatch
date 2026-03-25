-- Add story_type column; backfills all existing rows as 'daily'
ALTER TABLE stories ADD COLUMN IF NOT EXISTS story_type TEXT NOT NULL DEFAULT 'daily';

-- Add royal_challenge column (nullable — only set for life_lesson stories)
ALTER TABLE stories ADD COLUMN IF NOT EXISTS royal_challenge TEXT;

-- Drop old unique constraint and add new one that includes story_type
-- WARNING: if any existing rows have duplicate (date, princess) pairs, this will fail.
-- Verify first: SELECT date, princess, COUNT(*) FROM stories GROUP BY date, princess HAVING COUNT(*) > 1;
ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_date_princess_key;
ALTER TABLE stories ADD CONSTRAINT stories_date_princess_story_type_key
  UNIQUE (date, princess, story_type);
