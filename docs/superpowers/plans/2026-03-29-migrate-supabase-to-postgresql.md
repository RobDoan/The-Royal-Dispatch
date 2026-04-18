# Migrate Supabase to Local PostgreSQL + S3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase (DB + Storage) with local PostgreSQL in Docker and Amazon S3 for audio files.

**Architecture:** psycopg2 connection pool replaces the Supabase SDK singleton; boto3 S3 client replaces Supabase Storage. golang-migrate manages schema via versioned SQL files. All Supabase query-builder calls become raw SQL.

**Tech Stack:** psycopg2-binary, boto3, golang-migrate (Docker image), PostgreSQL 16

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/pyproject.toml` | Modify | Remove `supabase`, add `psycopg2-binary`, `boto3` |
| `backend/db/migrations/001_init.up.sql` | Create | Creates all 4 tables with partial unique indexes |
| `backend/db/migrations/001_init.down.sql` | Create | Drops all 4 tables |
| `backend/db/client.py` | Rewrite | psycopg2 pool singleton + `get_conn()` context manager |
| `backend/storage/client.py` | Create | boto3 S3 singleton |
| `backend/state.py` | Modify | Add optional `user_id` field to `RoyalStateOptional` |
| `backend/nodes/fetch_brief.py` | Rewrite | Raw SQL SELECT briefs |
| `backend/nodes/synthesize_voice.py` | Rewrite | boto3 S3 upload + public URL |
| `backend/nodes/store_result.py` | Rewrite | Raw SQL upsert with `language` + `user_id` |
| `backend/main.py` | Rewrite | All routes use raw SQL via `get_conn()` |
| `docker-compose.yml` | Modify | Add `postgres`, `migrate` services + `postgres_data` volume |
| `backend/.env` | Modify | Remove `SUPABASE_*`, add `DATABASE_URL`, `AWS_*`, `S3_BUCKET` |
| `backend/tests/test_nodes/test_fetch_brief.py` | Rewrite | Mock psycopg2 pool/conn/cursor |
| `backend/tests/test_nodes/test_synthesize_voice.py` | Rewrite | Mock `get_storage()` instead of Supabase |
| `backend/tests/test_nodes/test_store_result.py` | Rewrite | Mock psycopg2 pool/conn/cursor |
| `backend/tests/test_api.py` | Rewrite | Mock `get_conn()` instead of `get_supabase_client` |

---

## Task 1: Update Dependencies

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Update pyproject.toml**

Replace the `supabase>=2.7.0` line and add new deps:

```toml
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "langgraph>=0.2.0",
    "langchain-anthropic>=0.3.0",
    "psycopg2-binary>=2.9.0",
    "boto3>=1.34.0",
    "elevenlabs>=1.9.0",
    "pyyaml>=6.0",
    "python-dotenv>=1.0.0",
    "httpx>=0.27.0",
    "mem0ai>=0.1.0",
]
```

- [ ] **Step 2: Reinstall dependencies**

```bash
cd backend
pip install -e ".[dev]"
```

Expected: installs psycopg2-binary and boto3, uninstalls supabase.

- [ ] **Step 3: Commit**

```bash
git add backend/pyproject.toml
git commit -m "chore: replace supabase with psycopg2-binary and boto3"
```

---

## Task 2: Migration Files

**Files:**
- Create: `backend/db/migrations/001_init.up.sql`
- Create: `backend/db/migrations/001_init.down.sql`

> **Why partial unique indexes instead of a plain UNIQUE constraint on stories:**
> PostgreSQL treats NULL as distinct from every other NULL in unique constraints — two rows with `user_id = NULL` would never conflict. We use two partial unique indexes so the upsert ON CONFLICT works correctly whether `user_id` is set or NULL.

- [ ] **Step 1: Create migrations directory**

```bash
mkdir -p backend/db/migrations
```

- [ ] **Step 2: Write 001_init.up.sql**

Create `backend/db/migrations/001_init.up.sql`:

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
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Partial unique indexes to handle NULL user_id correctly in upserts
CREATE UNIQUE INDEX stories_unique_with_user
    ON stories (date, princess, story_type, language, user_id)
    WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX stories_unique_no_user
    ON stories (date, princess, story_type, language)
    WHERE user_id IS NULL;
```

- [ ] **Step 3: Write 001_init.down.sql**

Create `backend/db/migrations/001_init.down.sql`:

```sql
DROP TABLE IF EXISTS stories;
DROP TABLE IF EXISTS briefs;
DROP TABLE IF EXISTS user_preferences;
DROP TABLE IF EXISTS users;
```

- [ ] **Step 4: Commit**

```bash
git add backend/db/migrations/
git commit -m "feat: add initial PostgreSQL migration files"
```

---

## Task 3: Docker Compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add postgres and migrate services**

In `docker-compose.yml`, add after the existing `qdrant` service block and before `volumes:`:

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
    restart: unless-stopped
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

- [ ] **Step 2: Update backend depends_on**

Change the `backend` service `depends_on` block from:
```yaml
    depends_on:
      qdrant:
        condition: service_healthy
```
to:
```yaml
    depends_on:
      qdrant:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
```

- [ ] **Step 3: Add postgres_data volume**

Change the `volumes:` block at the bottom from:
```yaml
volumes:
  n8n_data:
  qdrant_data:
```
to:
```yaml
volumes:
  n8n_data:
  qdrant_data:
  postgres_data:
```

- [ ] **Step 4: Add POSTGRES_PASSWORD to backend/.env**

Add to `backend/.env`:
```env
# PostgreSQL
DATABASE_URL=postgres://royal:changeme@postgres:5432/royal_dispatch
POSTGRES_PASSWORD=changeme

# Amazon S3
AWS_ACCESS_KEY_ID=your-key-id
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
S3_BUCKET=royal-audio
```

Remove from `backend/.env`:
```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SUPABASE_STORAGE_BUCKET=...
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add PostgreSQL and golang-migrate services to docker-compose"
```

---

## Task 4: DB Client (psycopg2 Pool)

**Files:**
- Rewrite: `backend/db/client.py`
- Rewrite: `backend/tests/test_nodes/test_fetch_brief.py` (singleton test only — brief tests in Task 7)

- [ ] **Step 1: Write the failing test for singleton + get_conn**

Replace `backend/tests/test_nodes/test_fetch_brief.py` with only the client test for now (brief tests replaced in Task 7):

```python
import os
import pytest
from unittest.mock import MagicMock, patch


def test_get_db_returns_singleton(mocker):
    mock_pool = MagicMock()
    mocker.patch.dict(os.environ, {"DATABASE_URL": "postgres://royal:pw@localhost/royal_dispatch"})
    mocker.patch("backend.db.client.pool.SimpleConnectionPool", return_value=mock_pool)
    import backend.db.client as db_module
    db_module._pool = None
    from backend.db.client import get_db
    p1 = get_db()
    p2 = get_db()
    assert p1 is p2


def test_get_conn_commits_on_success(mocker):
    mock_pool = MagicMock()
    mock_conn = MagicMock()
    mock_pool.getconn.return_value = mock_conn
    mocker.patch("backend.db.client.get_db", return_value=mock_pool)
    from backend.db.client import get_conn
    with get_conn() as conn:
        assert conn is mock_conn
    mock_conn.commit.assert_called_once()
    mock_pool.putconn.assert_called_once_with(mock_conn)


def test_get_conn_rolls_back_on_exception(mocker):
    mock_pool = MagicMock()
    mock_conn = MagicMock()
    mock_pool.getconn.return_value = mock_conn
    mocker.patch("backend.db.client.get_db", return_value=mock_pool)
    from backend.db.client import get_conn
    with pytest.raises(ValueError):
        with get_conn() as conn:
            raise ValueError("boom")
    mock_conn.rollback.assert_called_once()
    mock_pool.putconn.assert_called_once_with(mock_conn)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_nodes/test_fetch_brief.py -v
```

Expected: FAIL — `get_conn` not found, import errors.

- [ ] **Step 3: Rewrite backend/db/client.py**

```python
import os
from contextlib import contextmanager
import psycopg2
from psycopg2 import pool
from dotenv import load_dotenv

load_dotenv()

_pool = None


def get_db():
    global _pool
    if _pool is None:
        _pool = pool.SimpleConnectionPool(1, 10, dsn=os.environ["DATABASE_URL"])
    return _pool


@contextmanager
def get_conn():
    p = get_db()
    conn = p.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        p.putconn(conn)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_nodes/test_fetch_brief.py -v
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/db/client.py backend/tests/test_nodes/test_fetch_brief.py
git commit -m "feat: replace Supabase client with psycopg2 connection pool"
```

---

## Task 5: Storage Client (boto3 S3)

**Files:**
- Create: `backend/storage/__init__.py`
- Create: `backend/storage/client.py`
- Create: `backend/tests/test_storage_client.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_storage_client.py`:

```python
import os
from unittest.mock import MagicMock


def test_get_storage_returns_singleton(mocker):
    mock_s3 = MagicMock()
    mocker.patch.dict(os.environ, {
        "AWS_ACCESS_KEY_ID": "test-key",
        "AWS_SECRET_ACCESS_KEY": "test-secret",
        "AWS_REGION": "us-east-1",
    })
    mocker.patch("backend.storage.client.boto3.client", return_value=mock_s3)
    import backend.storage.client as storage_module
    storage_module._client = None
    from backend.storage.client import get_storage
    s1 = get_storage()
    s2 = get_storage()
    assert s1 is s2
    assert s1 is mock_s3
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_storage_client.py -v
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create storage module**

Create `backend/storage/__init__.py` (empty):
```python
```

Create `backend/storage/client.py`:

```python
import os
import boto3
from dotenv import load_dotenv

load_dotenv()

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

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && pytest tests/test_storage_client.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/storage/ backend/tests/test_storage_client.py
git commit -m "feat: add boto3 S3 storage client singleton"
```

---

## Task 6: Add user_id to State

**Files:**
- Modify: `backend/state.py`

- [ ] **Step 1: Add user_id to RoyalStateOptional**

In `backend/state.py`, change:

```python
class RoyalStateOptional(RoyalState, total=False):
    royal_challenge: str | None  # only written by generate_life_lesson; absent for daily
    memories: str                # formatted memory context; empty string if none available
```

to:

```python
class RoyalStateOptional(RoyalState, total=False):
    royal_challenge: str | None  # only written by generate_life_lesson; absent for daily
    memories: str                # formatted memory context; empty string if none available
    user_id: str | None          # UUID of the requesting user; None for unauthenticated requests
```

- [ ] **Step 2: Verify no tests break**

```bash
cd backend && pytest tests/ -v --ignore=tests/test_nodes/test_fetch_brief.py
```

Expected: all tests pass (state change is additive).

- [ ] **Step 3: Commit**

```bash
git add backend/state.py
git commit -m "feat: add optional user_id field to RoyalStateOptional"
```

---

## Task 7: fetch_brief Node

**Files:**
- Rewrite: `backend/nodes/fetch_brief.py`
- Modify: `backend/tests/test_nodes/test_fetch_brief.py`

- [ ] **Step 1: Add fetch_brief tests (append to existing test file)**

Replace the full content of `backend/tests/test_nodes/test_fetch_brief.py` with:

```python
import os
import pytest
from unittest.mock import MagicMock
from datetime import date
import backend.db.client as db_module
import backend.storage.client as storage_module


# ── DB client tests ──────────────────────────────────────────────────────────

def test_get_db_returns_singleton(mocker):
    mock_pool = MagicMock()
    mocker.patch.dict(os.environ, {"DATABASE_URL": "postgres://royal:pw@localhost/royal_dispatch"})
    mocker.patch("backend.db.client.pool.SimpleConnectionPool", return_value=mock_pool)
    db_module._pool = None
    from backend.db.client import get_db
    p1 = get_db()
    p2 = get_db()
    assert p1 is p2


def test_get_conn_commits_on_success(mocker):
    mock_pool = MagicMock()
    mock_conn = MagicMock()
    mock_pool.getconn.return_value = mock_conn
    mocker.patch("backend.db.client.get_db", return_value=mock_pool)
    from backend.db.client import get_conn
    with get_conn() as conn:
        assert conn is mock_conn
    mock_conn.commit.assert_called_once()
    mock_pool.putconn.assert_called_once_with(mock_conn)


def test_get_conn_rolls_back_on_exception(mocker):
    mock_pool = MagicMock()
    mock_conn = MagicMock()
    mock_pool.getconn.return_value = mock_conn
    mocker.patch("backend.db.client.get_db", return_value=mock_pool)
    from backend.db.client import get_conn
    with pytest.raises(ValueError):
        with get_conn() as conn:
            raise ValueError("boom")
    mock_conn.rollback.assert_called_once()
    mock_pool.putconn.assert_called_once_with(mock_conn)


# ── fetch_brief tests ────────────────────────────────────────────────────────

from backend.state import RoyalState
from backend.nodes.fetch_brief import fetch_brief


@pytest.fixture
def base_state() -> RoyalState:
    return RoyalState(
        princess="elsa",
        date=date.today().isoformat(),
        brief="",
        tone="",
        persona={},
        story_type="daily",
        situation="",
        story_text="",
        audio_url="",
        language="en",
        timezone="America/Los_Angeles",
    )


def _mock_conn_with_rows(mocker, rows):
    """Helper: patch get_conn to return a mock connection whose cursor yields `rows`."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    mock_cursor.fetchall.return_value = rows
    mock_ctx = MagicMock()
    mock_ctx.__enter__ = MagicMock(return_value=mock_conn)
    mock_ctx.__exit__ = MagicMock(return_value=False)
    mocker.patch("backend.nodes.fetch_brief.get_conn", return_value=mock_ctx)
    return mock_cursor


def test_fetch_brief_returns_merged_brief_text(base_state, mocker):
    _mock_conn_with_rows(mocker, [("She shared her blocks today.",), ("She also cleaned up.",)])
    result = fetch_brief(base_state)
    assert "She shared her blocks today." in result["brief"]
    assert "She also cleaned up." in result["brief"]


def test_fetch_brief_uses_fallback_when_no_brief(base_state, mocker):
    _mock_conn_with_rows(mocker, [])
    result = fetch_brief(base_state)
    assert result["brief"] == "__fallback__"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_nodes/test_fetch_brief.py::test_fetch_brief_returns_merged_brief_text tests/test_nodes/test_fetch_brief.py::test_fetch_brief_uses_fallback_when_no_brief -v
```

Expected: FAIL — `fetch_brief` still uses Supabase.

- [ ] **Step 3: Rewrite fetch_brief.py**

```python
from backend.state import RoyalStateOptional
from backend.db.client import get_conn
from backend.utils.time_utils import get_window_for_date


def fetch_brief(state: RoyalStateOptional) -> dict:
    today = state["date"]
    timezone_str = state["timezone"]
    start, end = get_window_for_date(today, timezone_str)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT text FROM briefs WHERE created_at BETWEEN %s AND %s",
                (start, end),
            )
            rows = cur.fetchall()
    if rows:
        merged = "\n\n".join(row[0] for row in rows if row[0])
        if merged:
            return {"brief": merged}
    return {"brief": "__fallback__"}
```

- [ ] **Step 4: Run all fetch_brief tests**

```bash
cd backend && pytest tests/test_nodes/test_fetch_brief.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/nodes/fetch_brief.py backend/tests/test_nodes/test_fetch_brief.py
git commit -m "feat: replace Supabase fetch_brief with raw psycopg2 SQL"
```

---

## Task 8: synthesize_voice Node

**Files:**
- Rewrite: `backend/nodes/synthesize_voice.py`
- Rewrite: `backend/tests/test_nodes/test_synthesize_voice.py`

- [ ] **Step 1: Write the failing tests**

Replace `backend/tests/test_nodes/test_synthesize_voice.py`:

```python
import os
import pytest
from unittest.mock import MagicMock
from datetime import date
from backend.state import RoyalState
from backend.nodes.synthesize_voice import synthesize_voice


@pytest.fixture
def ready_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She shared today.", tone="praise",
        persona={"voice_id": "test-voice-id"},
        story_type="daily", situation="",
        story_text="[PROUD] Emma, you did wonderfully today!",
        audio_url="", language="en",
        timezone="America/Los_Angeles",
    )


def test_synthesize_voice_uploads_to_s3_and_returns_url(ready_state, mocker):
    mock_elevenlabs = MagicMock()
    mock_elevenlabs.text_to_speech.convert.return_value = iter([b"chunk1", b"chunk2"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_elevenlabs)

    mock_s3 = MagicMock()
    mocker.patch("backend.nodes.synthesize_voice.get_storage", return_value=mock_s3)
    mocker.patch.dict(os.environ, {"S3_BUCKET": "royal-audio", "AWS_REGION": "us-east-1"})

    result = synthesize_voice(ready_state)

    mock_s3.put_object.assert_called_once()
    call_kwargs = mock_s3.put_object.call_args[1]
    assert call_kwargs["Bucket"] == "royal-audio"
    assert call_kwargs["ContentType"] == "audio/mpeg"
    assert result["audio_url"].startswith("https://royal-audio.s3.us-east-1.amazonaws.com/")


def test_synthesize_voice_daily_filename_format(ready_state, mocker):
    ready_state["date"] = "2026-03-29"
    ready_state["princess"] = "elsa"
    ready_state["language"] = "en"
    ready_state["story_type"] = "daily"

    mock_elevenlabs = MagicMock()
    mock_elevenlabs.text_to_speech.convert.return_value = iter([b"chunk"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_elevenlabs)
    mock_s3 = MagicMock()
    mocker.patch("backend.nodes.synthesize_voice.get_storage", return_value=mock_s3)
    mocker.patch.dict(os.environ, {"S3_BUCKET": "royal-audio", "AWS_REGION": "us-east-1"})

    synthesize_voice(ready_state)

    key = mock_s3.put_object.call_args[1]["Key"]
    assert key == "2026-03-29-elsa-en.mp3"


def test_synthesize_voice_life_lesson_filename_includes_suffix(mocker):
    state = RoyalState(
        princess="elsa", date="2026-03-24",
        brief="Emma shared today.", tone="praise",
        persona={"voice_id": "test-voice-id"},
        story_type="life_lesson", situation="sharing",
        story_text="[GENTLE] Emma, sharing is caring.",
        audio_url="", language="en",
        timezone="America/Los_Angeles",
    )
    mock_elevenlabs = MagicMock()
    mock_elevenlabs.text_to_speech.convert.return_value = iter([b"chunk"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_elevenlabs)
    mock_s3 = MagicMock()
    mocker.patch("backend.nodes.synthesize_voice.get_storage", return_value=mock_s3)
    mocker.patch.dict(os.environ, {"S3_BUCKET": "royal-audio", "AWS_REGION": "us-east-1"})

    synthesize_voice(state)

    key = mock_s3.put_object.call_args[1]["Key"]
    assert key == "2026-03-24-elsa-en-life_lesson.mp3"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_nodes/test_synthesize_voice.py -v
```

Expected: FAIL — still uses Supabase storage.

- [ ] **Step 3: Rewrite synthesize_voice.py**

```python
import os
from elevenlabs.client import ElevenLabs
from backend.state import RoyalStateOptional
from backend.storage.client import get_storage

_elevenlabs = None


def get_elevenlabs_client() -> ElevenLabs:
    global _elevenlabs
    if _elevenlabs is None:
        _elevenlabs = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    return _elevenlabs


def synthesize_voice(state: RoyalStateOptional) -> dict:
    client = get_elevenlabs_client()
    audio_chunks = client.text_to_speech.convert(
        voice_id=state["persona"]["voice_id"],
        text=state["story_text"],
        model_id="eleven_v3",
        output_format="mp3_44100_128",
    )
    audio_bytes = b"".join(audio_chunks)

    story_type = state["story_type"]
    suffix = f"-{story_type}" if story_type != "daily" else ""
    filename = f"{state['date']}-{state['princess']}-{state['language']}{suffix}.mp3"

    bucket = os.environ["S3_BUCKET"]
    region = os.environ["AWS_REGION"]
    get_storage().put_object(
        Bucket=bucket,
        Key=filename,
        Body=audio_bytes,
        ContentType="audio/mpeg",
    )
    audio_url = f"https://{bucket}.s3.{region}.amazonaws.com/{filename}"
    return {"audio_url": audio_url}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_nodes/test_synthesize_voice.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/nodes/synthesize_voice.py backend/tests/test_nodes/test_synthesize_voice.py
git commit -m "feat: replace Supabase Storage upload with S3 boto3 in synthesize_voice"
```

---

## Task 9: store_result Node

**Files:**
- Rewrite: `backend/nodes/store_result.py`
- Rewrite: `backend/tests/test_nodes/test_store_result.py`

- [ ] **Step 1: Write the failing tests**

Replace `backend/tests/test_nodes/test_store_result.py`:

```python
import pytest
from unittest.mock import MagicMock
from backend.state import RoyalState
from backend.nodes.store_result import store_result
from datetime import date


@pytest.fixture
def complete_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She shared today.", tone="praise",
        persona={"name": "Queen Elsa"},
        story_type="daily", situation="",
        story_text="[PROUD] Emma, you are wonderful.",
        audio_url="https://royal-audio.s3.us-east-1.amazonaws.com/audio.mp3",
        language="en",
        timezone="America/Los_Angeles",
    )


def _mock_conn(mocker):
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    mock_ctx = MagicMock()
    mock_ctx.__enter__ = MagicMock(return_value=mock_conn)
    mock_ctx.__exit__ = MagicMock(return_value=False)
    mocker.patch("backend.nodes.store_result.get_conn", return_value=mock_ctx)
    return mock_cursor


def test_store_result_upserts_story_and_returns_audio_url(complete_state, mocker):
    mock_cursor = _mock_conn(mocker)
    result = store_result(complete_state)
    assert result["audio_url"] == "https://royal-audio.s3.us-east-1.amazonaws.com/audio.mp3"
    mock_cursor.execute.assert_called_once()
    sql, params = mock_cursor.execute.call_args[0]
    assert "ON CONFLICT" in sql
    assert "elsa" in params
    assert "en" in params


def test_store_result_includes_royal_challenge_for_life_lesson(mocker):
    state = RoyalState(
        princess="belle", date="2026-03-29",
        brief="She tried sharing.", tone="praise",
        persona={"name": "Belle"},
        story_type="life_lesson", situation="sharing",
        story_text="[GENTLE] Emma, sharing is a gift.",
        audio_url="https://royal-audio.s3.us-east-1.amazonaws.com/life.mp3",
        language="vi",
        timezone="America/Los_Angeles",
    )
    # Add royal_challenge via dict update (total=False field)
    state_with_challenge = dict(state)
    state_with_challenge["royal_challenge"] = "Try sharing one toy today."

    mock_cursor = _mock_conn(mocker)
    result = store_result(state_with_challenge)
    assert result["audio_url"] == "https://royal-audio.s3.us-east-1.amazonaws.com/life.mp3"
    sql, params = mock_cursor.execute.call_args[0]
    assert "Try sharing one toy today." in params


def test_store_result_passes_none_royal_challenge_for_daily(complete_state, mocker):
    mock_cursor = _mock_conn(mocker)
    store_result(complete_state)
    sql, params = mock_cursor.execute.call_args[0]
    # royal_challenge is None (not in state for daily)
    assert None in params
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_nodes/test_store_result.py -v
```

Expected: FAIL — still uses Supabase.

- [ ] **Step 3: Rewrite store_result.py**

```python
from backend.state import RoyalStateOptional
from backend.db.client import get_conn


def store_result(state: RoyalStateOptional) -> dict:
    user_id = state.get("user_id")
    royal_challenge = state.get("royal_challenge")

    if user_id is not None:
        sql = """
            INSERT INTO stories (date, princess, story_type, language, story_text, audio_url, royal_challenge, user_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date, princess, story_type, language, user_id) WHERE user_id IS NOT NULL
            DO UPDATE SET
                story_text = EXCLUDED.story_text,
                audio_url = EXCLUDED.audio_url,
                royal_challenge = EXCLUDED.royal_challenge
        """
        params = (
            state["date"], state["princess"], state["story_type"], state["language"],
            state["story_text"], state["audio_url"], royal_challenge, user_id,
        )
    else:
        sql = """
            INSERT INTO stories (date, princess, story_type, language, story_text, audio_url, royal_challenge)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date, princess, story_type, language) WHERE user_id IS NULL
            DO UPDATE SET
                story_text = EXCLUDED.story_text,
                audio_url = EXCLUDED.audio_url,
                royal_challenge = EXCLUDED.royal_challenge
        """
        params = (
            state["date"], state["princess"], state["story_type"], state["language"],
            state["story_text"], state["audio_url"], royal_challenge,
        )

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)

    return {"audio_url": state["audio_url"]}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_nodes/test_store_result.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/nodes/store_result.py backend/tests/test_nodes/test_store_result.py
git commit -m "feat: replace Supabase upsert in store_result with raw psycopg2 SQL"
```

---

## Task 10: main.py API Routes

**Files:**
- Rewrite: `backend/main.py`
- Rewrite: `backend/tests/test_api.py`

- [ ] **Step 1: Write the failing tests**

Replace `backend/tests/test_api.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch


def _make_mock_conn(mocker, module_path, fetchone=None, fetchall=None):
    """Patch get_conn in the given module and return a configured mock cursor."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    mock_ctx = MagicMock()
    mock_ctx.__enter__ = MagicMock(return_value=mock_conn)
    mock_ctx.__exit__ = MagicMock(return_value=False)
    mocker.patch(module_path, return_value=mock_ctx)
    if fetchone is not None:
        mock_cursor.fetchone.return_value = fetchone
    if fetchall is not None:
        mock_cursor.fetchall.return_value = fetchall
    return mock_cursor


@pytest.fixture
def client(mocker):
    mocker.patch("backend.main.royal_graph")
    from backend.main import app
    return TestClient(app)


def test_post_brief_stores_and_returns_ok(client, mocker):
    _make_mock_conn(mocker, "backend.main.get_conn")
    response = client.post("/brief", json={"text": "She shared her blocks today."})
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_post_story_triggers_graph_and_returns_audio_url(mocker):
    mock_graph = MagicMock()
    mock_graph.invoke.return_value = {"audio_url": "https://royal-audio.s3.us-east-1.amazonaws.com/audio.mp3"}
    _make_mock_conn(mocker, "backend.main.get_conn", fetchone=None)
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        c = TestClient(app)
        response = c.post("/story", json={"princess": "elsa", "language": "en"})
    assert response.status_code == 200
    assert "audio_url" in response.json()


def test_post_story_rejects_unknown_princess(mocker):
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        c = TestClient(app)
        response = c.post("/story", json={"princess": "unknown", "language": "en"})
    assert response.status_code == 422


def test_post_story_returns_cached_audio_url_without_running_graph(mocker):
    mock_graph = MagicMock()
    _make_mock_conn(mocker, "backend.main.get_conn",
                    fetchone=("https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3",))
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        c = TestClient(app)
        response = c.post("/story", json={"princess": "elsa", "language": "en"})
    assert response.status_code == 200
    assert response.json()["audio_url"] == "https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3"
    mock_graph.invoke.assert_not_called()


def test_get_today_stories_returns_cached_map(mocker):
    _make_mock_conn(mocker, "backend.main.get_conn",
                    fetchall=[("elsa", "https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3")])
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        c = TestClient(app)
        response = c.get("/story/today")
    assert response.status_code == 200
    assert response.json()["cached"]["elsa"] == "https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3"


def test_get_story_today_princess_returns_story(mocker):
    _make_mock_conn(mocker, "backend.main.get_conn",
                    fetchone=("https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3",
                              "Dear Emma, [PROUD] today you were brave...", None))
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        c = TestClient(app)
        response = c.get("/story/today/elsa")
    assert response.status_code == 200
    assert response.json()["audio_url"] == "https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3"
    assert response.json()["story_text"] == "Dear Emma, [PROUD] today you were brave..."


def test_get_story_today_princess_returns_404_when_not_generated(mocker):
    _make_mock_conn(mocker, "backend.main.get_conn", fetchone=None)
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        c = TestClient(app)
        response = c.get("/story/today/elsa")
    assert response.status_code == 404


def test_post_story_life_lesson_triggers_graph(mocker):
    mock_graph = MagicMock()
    mock_graph.invoke.return_value = {"audio_url": "https://royal-audio.s3.us-east-1.amazonaws.com/ll.mp3"}
    _make_mock_conn(mocker, "backend.main.get_conn", fetchone=None)
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        c = TestClient(app)
        response = c.post("/story", json={"princess": "elsa", "language": "en", "story_type": "life_lesson"})
    assert response.status_code == 200
    call_args = mock_graph.invoke.call_args[0][0]
    assert call_args["story_type"] == "life_lesson"


def test_get_story_today_princess_life_lesson_returns_royal_challenge(mocker):
    _make_mock_conn(mocker, "backend.main.get_conn",
                    fetchone=("https://royal-audio.s3.us-east-1.amazonaws.com/elsa-ll.mp3",
                              "Once in Arendelle...", "Try sharing today."))
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        c = TestClient(app)
        response = c.get("/story/today/elsa?type=life_lesson")
    assert response.status_code == 200
    assert response.json()["royal_challenge"] == "Try sharing today."


def test_get_story_today_princess_daily_returns_null_royal_challenge(mocker):
    _make_mock_conn(mocker, "backend.main.get_conn",
                    fetchone=("https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3",
                              "Dear Emma...", None))
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        c = TestClient(app)
        response = c.get("/story/today/elsa")
    assert response.status_code == 200
    assert response.json()["royal_challenge"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_api.py -v
```

Expected: FAIL — `main.py` still imports `get_supabase_client`.

- [ ] **Step 3: Rewrite main.py**

Replace the full content of `backend/main.py`:

```python
import os
import glob
import yaml
import concurrent.futures
import secrets
from datetime import date
from typing import Literal
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from backend.graph import royal_graph
from backend.db.client import get_conn
from backend.utils.time_utils import get_logical_date_iso

app = FastAPI(title="Royal Dispatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class BriefRequest(BaseModel):
    text: str
    user_id: str | None = None


class StoryRequest(BaseModel):
    princess: Literal["elsa", "belle", "cinderella", "ariel"]
    language: Literal["en", "vi"] = "en"
    story_type: Literal["daily", "life_lesson"] = "daily"
    date: str | None = None
    timezone: str = "America/Los_Angeles"
    user_id: str | None = None


class StoryResponse(BaseModel):
    audio_url: str


class StoryDetailResponse(BaseModel):
    audio_url: str
    story_text: str
    royal_challenge: str | None


@app.post("/brief")
def post_brief(req: BriefRequest):
    today = date.today().isoformat()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO briefs (date, text, user_id) VALUES (%s, %s, %s)",
                (today, req.text, req.user_id),
            )
    return {"status": "ok"}


@app.post("/story", response_model=StoryResponse)
def post_story(req: StoryRequest):
    story_date = req.date or get_logical_date_iso(req.timezone)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT audio_url FROM stories
                   WHERE date = %s AND princess = %s AND story_type = %s
                     AND language = %s AND user_id IS NOT DISTINCT FROM %s""",
                (story_date, req.princess, req.story_type, req.language, req.user_id),
            )
            row = cur.fetchone()
    if row:
        return StoryResponse(audio_url=row[0])
    initial_state = {
        "princess": req.princess,
        "date": story_date,
        "brief": "",
        "tone": "",
        "persona": {},
        "story_type": req.story_type,
        "situation": "",
        "story_text": "",
        "audio_url": "",
        "language": req.language,
        "timezone": req.timezone,
        "user_id": req.user_id,
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(royal_graph.invoke, initial_state)
        try:
            result = future.result(timeout=60)
        except concurrent.futures.TimeoutError:
            raise HTTPException(status_code=504, detail="Story generation timed out")
    return StoryResponse(audio_url=result["audio_url"])


@app.get("/story/today")
def get_today_stories(timezone: str = "America/Los_Angeles", language: str = "en"):
    today = get_logical_date_iso(timezone)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT princess, audio_url FROM stories
                   WHERE date = %s AND story_type = 'daily' AND language = %s""",
                (today, language),
            )
            rows = cur.fetchall()
    cached = {row[0]: row[1] for row in rows}
    return {"date": today, "cached": cached}


@app.get("/story/today/{princess}", response_model=StoryDetailResponse)
def get_today_story_for_princess(
    princess: str,
    type: str = Query(default="daily"),
    timezone: str = "America/Los_Angeles",
    language: str = "en",
):
    today = get_logical_date_iso(timezone)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT audio_url, story_text, royal_challenge FROM stories
                   WHERE date = %s AND princess = %s AND story_type = %s AND language = %s""",
                (today, princess, type, language),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Story not found for today")
    return StoryDetailResponse(audio_url=row[0], story_text=row[1], royal_challenge=row[2])


# ── Pydantic models ───────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    name: str
    telegram_chat_id: int


class UserResponse(BaseModel):
    id: str
    name: str
    telegram_chat_id: int
    token: str
    created_at: str


class PreferencesResponse(BaseModel):
    user_id: str
    config: dict


class UpdatePreferencesRequest(BaseModel):
    config: dict


class PersonaResponse(BaseModel):
    id: str
    name: str


class UserMeResponse(BaseModel):
    user_id: str
    name: str
    config: dict


class UserByChatIdResponse(BaseModel):
    user_id: str
    name: str


# ── Admin: users ──────────────────────────────────────────────────────────────

@app.get("/admin/users", response_model=list[UserResponse])
def admin_list_users():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, telegram_chat_id, token, created_at FROM users ORDER BY created_at")
            rows = cur.fetchall()
    return [
        {"id": str(r[0]), "name": r[1], "telegram_chat_id": r[2], "token": r[3], "created_at": r[4].isoformat()}
        for r in rows
    ]


@app.post("/admin/users", response_model=UserResponse, status_code=201)
def admin_create_user(req: CreateUserRequest):
    token = "tk_" + secrets.token_hex(8)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO users (name, telegram_chat_id, token)
                   VALUES (%s, %s, %s)
                   RETURNING id, name, telegram_chat_id, token, created_at""",
                (req.name, req.telegram_chat_id, token),
            )
            row = cur.fetchone()
    return {"id": str(row[0]), "name": row[1], "telegram_chat_id": row[2], "token": row[3], "created_at": row[4].isoformat()}


@app.delete("/admin/users/{user_id}", status_code=204)
def admin_delete_user(user_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s RETURNING id", (user_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")


# ── Admin: preferences ────────────────────────────────────────────────────────

@app.get("/admin/users/{user_id}/preferences", response_model=PreferencesResponse)
def admin_get_preferences(user_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id, config FROM user_preferences WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Preferences not found")
    return {"user_id": str(row[0]), "config": row[1]}


@app.put("/admin/users/{user_id}/preferences", response_model=PreferencesResponse)
def admin_update_preferences(user_id: str, req: UpdatePreferencesRequest):
    import json
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO user_preferences (user_id, config) VALUES (%s, %s)
                   ON CONFLICT (user_id) DO UPDATE SET config = EXCLUDED.config
                   RETURNING user_id, config""",
                (user_id, json.dumps(req.config)),
            )
            row = cur.fetchone()
    return {"user_id": str(row[0]), "config": row[1]}


# ── Admin: personas ───────────────────────────────────────────────────────────

@app.get("/admin/personas", response_model=list[PersonaResponse])
def admin_list_personas():
    personas_dir = os.path.join(os.path.dirname(__file__), "personas")
    results = []
    for path in sorted(glob.glob(os.path.join(personas_dir, "*.yaml"))):
        persona_id = os.path.splitext(os.path.basename(path))[0]
        with open(path) as f:
            data = yaml.safe_load(f)
        results.append({"id": persona_id, "name": data.get("name", persona_id)})
    return results


# ── User resolution ───────────────────────────────────────────────────────────

@app.get("/user/me", response_model=UserMeResponse)
def get_user_by_token(token: str = Query(...)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM users WHERE token = %s", (token,))
            user_row = cur.fetchone()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")
            cur.execute("SELECT config FROM user_preferences WHERE user_id = %s", (str(user_row[0]),))
            pref_row = cur.fetchone()
    config = pref_row[0] if pref_row else {}
    return {"user_id": str(user_row[0]), "name": user_row[1], "config": config}


@app.get("/user/by-chat-id", response_model=UserByChatIdResponse)
def get_user_by_chat_id(chat_id: int = Query(...)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM users WHERE telegram_chat_id = %s", (chat_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": str(row[0]), "name": row[1]}
```

- [ ] **Step 4: Run all API tests**

```bash
cd backend && pytest tests/test_api.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
cd backend && pytest tests/ -v
```

Expected: all tests PASS. Fix any remaining imports of `get_supabase_client` in other test files if they appear.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/test_api.py
git commit -m "feat: replace all Supabase queries in main.py with raw psycopg2 SQL"
```

---

## Task 11: Smoke Test with Docker

- [ ] **Step 1: Add POSTGRES_PASSWORD to .env and bring up stack**

Verify `backend/.env` has `DATABASE_URL` and `POSTGRES_PASSWORD` set, then:

```bash
docker compose up --build
```

Expected: `migrate` container exits 0, `backend` starts without import errors.

- [ ] **Step 2: Verify migration ran**

```bash
docker compose exec postgres psql -U royal -d royal_dispatch -c "\dt"
```

Expected output:
```
         List of relations
 Schema |       Name        | Type  | Owner
--------+-------------------+-------+-------
 public | briefs            | table | royal
 public | schema_migrations | table | royal
 public | stories           | table | royal
 public | user_preferences  | table | royal
 public | users             | table | royal
```

- [ ] **Step 3: Hit the health endpoint**

```bash
curl http://localhost:8000/docs
```

Expected: FastAPI Swagger UI HTML response (200).

- [ ] **Step 4: Final commit**

```bash
git add backend/.env.example docker-compose.yml
git commit -m "feat: complete Supabase → PostgreSQL + S3 migration"
```
