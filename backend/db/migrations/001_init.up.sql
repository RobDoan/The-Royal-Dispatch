CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    telegram_chat_id BIGINT,
    token TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    config JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    text TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
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
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Partial unique indexes to handle NULL user_id correctly in upserts
CREATE UNIQUE INDEX stories_unique_with_user
    ON stories (date, princess, story_type, language, user_id)
    WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX stories_unique_no_user
    ON stories (date, princess, story_type, language)
    WHERE user_id IS NULL;
