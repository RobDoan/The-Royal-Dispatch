-- Add children table and child_id columns to briefs/stories
-- This replaces single-child-per-parent assumption with multi-child support

CREATE TABLE children (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT children_parent_name_unique UNIQUE (parent_id, name)
);

ALTER TABLE briefs ADD COLUMN child_id UUID REFERENCES children(id) ON DELETE SET NULL;
ALTER TABLE stories ADD COLUMN child_id UUID REFERENCES children(id) ON DELETE SET NULL;

-- Replace old story uniqueness indexes (they break with multi-child under same parent)
DROP INDEX IF EXISTS stories_unique_with_user;
DROP INDEX IF EXISTS stories_unique_no_user;

-- Stories scoped to a child (primary path going forward)
CREATE UNIQUE INDEX stories_unique_with_child
    ON stories (date, princess, story_type, language, child_id)
    WHERE child_id IS NOT NULL;

-- Stories scoped to parent user only, no child (legacy backward-compat)
CREATE UNIQUE INDEX stories_unique_with_user_no_child
    ON stories (date, princess, story_type, language, user_id)
    WHERE user_id IS NOT NULL AND child_id IS NULL;

-- Unauthenticated stories (neither user nor child)
CREATE UNIQUE INDEX stories_unique_no_user_no_child
    ON stories (date, princess, story_type, language)
    WHERE user_id IS NULL AND child_id IS NULL;
