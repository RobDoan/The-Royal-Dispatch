-- Run in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  telegram_chat_id  bigint UNIQUE NOT NULL,
  token             text UNIQUE NOT NULL,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id  uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  config   jsonb NOT NULL DEFAULT '{}'
);
