-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS briefs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date NOT NULL,
  text       text NOT NULL,
  tone       text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date NOT NULL,
  princess   text NOT NULL,
  story_text text,
  audio_url  text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(date, princess)
);
