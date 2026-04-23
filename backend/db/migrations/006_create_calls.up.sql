CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    princess TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'en',
    conversation_id TEXT UNIQUE,
    state TEXT NOT NULL DEFAULT 'started',
    ended_reason TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    duration_seconds INT,
    transcript JSONB
);

CREATE INDEX idx_calls_child_started ON calls(child_id, started_at DESC);
