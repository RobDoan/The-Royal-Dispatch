-- Rollback: Remove children table and child_id columns, restore old indexes

DROP INDEX IF EXISTS stories_unique_with_child;
DROP INDEX IF EXISTS stories_unique_with_user_no_child;
DROP INDEX IF EXISTS stories_unique_no_user_no_child;

CREATE UNIQUE INDEX stories_unique_with_user
    ON stories (date, princess, story_type, language, user_id)
    WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX stories_unique_no_user
    ON stories (date, princess, story_type, language)
    WHERE user_id IS NULL;

ALTER TABLE stories DROP COLUMN IF EXISTS child_id;
ALTER TABLE briefs DROP COLUMN IF EXISTS child_id;
DROP TABLE IF EXISTS children;
