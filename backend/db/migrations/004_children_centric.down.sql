-- backend/db/migrations/004_children_centric.down.sql

DROP TABLE IF EXISTS stories CASCADE;
DROP TABLE IF EXISTS briefs CASCADE;
DROP TABLE IF EXISTS user_children CASCADE;
DROP TABLE IF EXISTS children CASCADE;

-- Restore original children table with parent_id
CREATE TABLE children (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT children_parent_name_unique UNIQUE (parent_id, name)
);

CREATE TABLE briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    text TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    child_id UUID REFERENCES children(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    princess TEXT NOT NULL,
    story_type TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    story_text TEXT,
    audio_url TEXT,
    royal_challenge TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    child_id UUID REFERENCES children(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX stories_unique_with_child
    ON stories (date, princess, story_type, language, child_id)
    WHERE child_id IS NOT NULL;

CREATE UNIQUE INDEX stories_unique_with_user_no_child
    ON stories (date, princess, story_type, language, user_id)
    WHERE user_id IS NOT NULL AND child_id IS NULL;

CREATE UNIQUE INDEX stories_unique_no_user_no_child
    ON stories (date, princess, story_type, language)
    WHERE user_id IS NULL AND child_id IS NULL;
