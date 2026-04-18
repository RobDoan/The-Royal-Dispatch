# Migrate Database from Supabase to Local PostgreSQL + S3

**Date:** 2026-03-29
**Status:** Approved

## Overview

Replace Supabase (hosted PostgreSQL + Storage) with:
- Local PostgreSQL running in Docker (relational data)
- Amazon S3 (audio file storage)
- golang-migrate for schema migrations

Fresh start — no data migration required.

## Database Schema

Migration files live in `backend/db/migrations/`. Tables must be created in this order (foreign key dependencies):

### `001_init.up.sql`

```sql
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
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (date, princess, story_type, language, user_id)
);
```

### `001_init.down.sql`

```sql
DROP TABLE IF EXISTS stories;
DROP TABLE IF EXISTS briefs;
DROP TABLE IF EXISTS user_preferences;
DROP TABLE IF EXISTS users;
```

**Key design decisions:**
- `tone` removed from `briefs` — it is derived at runtime by `classify_tone` node, not stored
- `language` added to `stories` — same princess/date/type in `'vi'` gets its own cached row and audio file
- `user_id` on both `briefs` and `stories` — enables per-user filtering
- Unique constraint on `stories` includes `language` and `user_id`

## Infrastructure

### docker-compose.yml additions

```yaml
postgres:
  image: postgres:16
  environment:
    POSTGRES_DB: royal_dispatch
    POSTGRES_USER: royal
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  volumes:
    - postgres_data:/var/lib/postgresql/data
  ports:
    - "5432:5432"
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U royal"]
    interval: 5s
    timeout: 5s
    retries: 5

migrate:
  image: migrate/migrate
  depends_on:
    postgres:
      condition: service_healthy
  volumes:
    - ./backend/db/migrations:/migrations
  command:
    - "-path=/migrations"
    - "-database=postgres://royal:${POSTGRES_PASSWORD}@postgres:5432/royal_dispatch?sslmode=disable"
    - "up"
  restart: on-failure
```

- `backend` service gains `depends_on: migrate`
- New volume: `postgres_data`

**Running migrations manually:**
```bash
# Up
docker run --rm -v ./backend/db/migrations:/migrations migrate/migrate \
  -path=/migrations -database $DATABASE_URL up

# Down (rollback one)
docker run --rm -v ./backend/db/migrations:/migrations migrate/migrate \
  -path=/migrations -database $DATABASE_URL down 1
```

## Database Layer

**`backend/db/client.py`** — psycopg2 connection pool (same singleton pattern as before):

```python
import os
import psycopg2
from psycopg2 import pool

_pool = None

def get_db():
    global _pool
    if _pool is None:
        _pool = pool.SimpleConnectionPool(1, 10, dsn=os.environ["DATABASE_URL"])
    return _pool
```

Usage pattern in nodes/routes:
```python
conn = get_db().getconn()
try:
    with conn.cursor() as cur:
        cur.execute("SELECT ...", (params,))
        row = cur.fetchone()
    conn.commit()
finally:
    get_db().putconn(conn)
```

### Query replacements

| File | Operation | SQL |
|---|---|---|
| `nodes/fetch_brief.py` | Fetch brief by date window | `SELECT text FROM briefs WHERE user_id = %s AND created_at BETWEEN %s AND %s` |
| `nodes/store_result.py` | Upsert story | `INSERT INTO stories (...) VALUES (...) ON CONFLICT (date, princess, story_type, language, user_id) DO UPDATE SET ...` |
| `main.py` POST /brief | Insert brief | `INSERT INTO briefs (date, text, user_id) VALUES (%s, %s, %s)` |
| `main.py` GET /story/today | List stories | `SELECT princess, audio_url FROM stories WHERE date = %s AND story_type = 'daily' AND language = %s AND user_id = %s` |
| `main.py` GET /story/today/{princess} | Get story detail | `SELECT story_text, audio_url, royal_challenge FROM stories WHERE date = %s AND princess = %s AND story_type = %s AND language = %s AND user_id = %s` |
| `main.py` admin users | CRUD | Raw SQL equivalents |

## Storage Layer

**New file: `backend/storage/client.py`** — boto3 S3 singleton:

```python
import boto3, os

_client = None

def get_storage():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
            region_name=os.environ["AWS_REGION"],
        )
    return _client
```

**`nodes/synthesize_voice.py`** upload change:
```python
# Upload
get_storage().put_object(
    Bucket=os.environ["S3_BUCKET"],
    Key=filename,
    Body=audio_bytes,
    ContentType="audio/mpeg",
)
# Public URL
url = f"https://{os.environ['S3_BUCKET']}.s3.{os.environ['AWS_REGION']}.amazonaws.com/{filename}"
```

Audio filename format is unchanged: `{date}-{princess}-{language}.mp3` / `{date}-{princess}-{language}-life_lesson.mp3`

> **S3 bucket requirement:** The bucket must have a public read policy so audio URLs are directly accessible by the frontend without signed URLs.

## Configuration

### Environment variables

**Remove:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_STORAGE_BUCKET`

**Add:**
```env
DATABASE_URL=postgres://royal:password@postgres:5432/royal_dispatch
POSTGRES_PASSWORD=changeme

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET=royal-audio
```

### Dependencies (`backend/pyproject.toml`)

**Remove:** `supabase>=2.7.0`
**Add:** `psycopg2-binary>=2.9.0`, `boto3>=1.34.0`

## Files Changed

| File | Action |
|---|---|
| `docker-compose.yml` | Add `postgres`, `migrate` services and `postgres_data` volume |
| `backend/db/migrations/001_init.up.sql` | New — create all 4 tables |
| `backend/db/migrations/001_init.down.sql` | New — drop all 4 tables |
| `backend/db/client.py` | Replace Supabase singleton with psycopg2 pool |
| `backend/storage/client.py` | New — boto3 S3 singleton |
| `backend/nodes/fetch_brief.py` | Raw SQL SELECT |
| `backend/nodes/synthesize_voice.py` | boto3 upload + S3 public URL |
| `backend/nodes/store_result.py` | Raw SQL upsert with `language` + `user_id` |
| `backend/main.py` | All Supabase calls → raw SQL |
| `backend/pyproject.toml` | Remove `supabase`, add `psycopg2-binary`, `boto3` |
| `backend/.env` | Update env vars |
