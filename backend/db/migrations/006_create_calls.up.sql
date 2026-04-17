CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID REFERENCES children(id) ON DELETE CASCADE,
    princess TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    duration_seconds INT,
    turn_count INT,
    transcript JSONB
);

CREATE INDEX idx_calls_child_id ON calls(child_id);
