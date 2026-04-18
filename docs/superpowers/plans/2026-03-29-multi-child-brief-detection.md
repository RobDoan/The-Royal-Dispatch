# Multi-Child Brief Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow parents to have multiple children registered; when a brief is submitted, detect which child(ren) it refers to using an LLM, store one brief row per child, and scope story generation and memories per child.

**Architecture:** A new `children` table hangs off `users`. On `POST /brief`, server-side LLM detection resolves child names from the brief text and inserts one `briefs` row per matched child (or one with `child_id=NULL` if unresolved). The story pipeline receives `child_id` in state and uses it to scope brief fetch, memory operations, and story storage. `EMMA_USER_ID` is removed — memory is simply skipped when no `child_id` is available.

**Tech Stack:** Python/FastAPI, psycopg2, LangChain Anthropic (`claude-haiku-4-5-20251001`), mem0, pytest-mock

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/db/migrations/002_add_children.up.sql` | DB schema: children table, child_id columns, new indexes |
| Create | `backend/db/migrations/002_add_children.down.sql` | Rollback migration |
| Create | `backend/utils/child_detection.py` | LLM-based child name detection utility |
| Create | `backend/tests/test_utils/__init__.py` | Package marker |
| Create | `backend/tests/test_utils/test_child_detection.py` | Tests for detection utility |
| Modify | `backend/state.py` | Add `child_id: str | None` to `RoyalStateOptional` |
| Modify | `backend/nodes/fetch_brief.py` | Filter briefs by `child_id` |
| Modify | `backend/nodes/store_result.py` | Add `child_id` branch for upsert |
| Modify | `backend/utils/mem0_client.py` | Remove `EMMA_USER_ID` constant |
| Modify | `backend/nodes/extract_memories.py` | Skip if `child_id` absent, use `child_id` as mem0 user |
| Modify | `backend/nodes/fetch_memories.py` | Skip if `child_id` absent, use `child_id` as mem0 user |
| Modify | `backend/tests/test_nodes/test_extract_memories.py` | Update for new child_id behavior |
| Modify | `backend/tests/test_nodes/test_fetch_memories.py` | Update for new child_id behavior |
| Modify | `backend/main.py` | Admin children endpoints, updated brief/story endpoints |

---

## Task 1: DB Migration

**Files:**
- Create: `backend/db/migrations/002_add_children.up.sql`
- Create: `backend/db/migrations/002_add_children.down.sql`

- [ ] **Step 1: Write the up migration**

```sql
-- backend/db/migrations/002_add_children.up.sql

CREATE TABLE children (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
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
```

- [ ] **Step 2: Write the down migration**

```sql
-- backend/db/migrations/002_add_children.down.sql

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
```

- [ ] **Step 3: Apply migration**

```bash
cd backend
psql $DATABASE_URL -f db/migrations/002_add_children.up.sql
```

Expected output: `CREATE TABLE`, `ALTER TABLE`, `ALTER TABLE`, `DROP INDEX`, `DROP INDEX`, `CREATE INDEX`, `CREATE INDEX`, `CREATE INDEX`

- [ ] **Step 4: Commit**

```bash
git add backend/db/migrations/002_add_children.up.sql backend/db/migrations/002_add_children.down.sql
git commit -m "feat: add children table and child_id columns to briefs/stories"
```

---

## Task 2: State + fetch_brief

**Files:**
- Modify: `backend/state.py`
- Modify: `backend/nodes/fetch_brief.py`

- [ ] **Step 1: Add `child_id` to state**

In `backend/state.py`, update `RoyalStateOptional`:

```python
from typing import TypedDict

class RoyalState(TypedDict):
    princess: str      # "elsa" | "belle" | "cinderella" | "ariel"
    date: str          # ISO date string, e.g. "2026-03-23"
    brief: str         # parent's WhatsApp text; "__fallback__" if none
    tone: str          # "praise" | "habit"
    persona: dict      # loaded from YAML
    story_type: str    # "daily" | "life_lesson"
    situation: str     # teachable situation (life_lesson); "" for daily
    story_text: str    # generated letter with ElevenLabs audio tags
    audio_url: str     # S3 public URL
    language: str      # "en" | "vi"
    timezone: str      # user's IANA timezone, e.g. "America/Los_Angeles"

class RoyalStateOptional(RoyalState, total=False):
    royal_challenge: str | None  # only written by generate_life_lesson; absent for daily
    memories: str                # formatted memory context; empty string if none available
    user_id: str | None          # UUID of the requesting user; None for unauthenticated requests
    child_id: str | None         # UUID of the child this story is for; None if unresolved
```

- [ ] **Step 2: Update fetch_brief to filter by child_id**

Replace the full content of `backend/nodes/fetch_brief.py`:

```python
from backend.state import RoyalStateOptional
from backend.db.client import get_conn
from backend.utils.time_utils import get_window_for_date


def fetch_brief(state: RoyalStateOptional) -> dict:
    today = state["date"]
    timezone_str = state["timezone"]
    child_id = state.get("child_id")
    start, end = get_window_for_date(today, timezone_str)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT text FROM briefs
                   WHERE created_at BETWEEN %s AND %s
                   AND child_id IS NOT DISTINCT FROM %s""",
                (start, end, child_id),
            )
            rows = cur.fetchall()
    if rows:
        merged = "\n\n".join(row[0] for row in rows if row[0])
        if merged:
            return {"brief": merged}
    return {"brief": "__fallback__"}
```

- [ ] **Step 3: Run existing tests to verify nothing broke**

```bash
cd backend && source .venv/bin/activate
pytest tests/ -v
```

Expected: all tests pass (fetch_brief has no unit tests; the state change is additive).

- [ ] **Step 4: Commit**

```bash
git add backend/state.py backend/nodes/fetch_brief.py
git commit -m "feat: add child_id to state and filter briefs by child_id in fetch_brief"
```

---

## Task 3: Update store_result

**Files:**
- Modify: `backend/nodes/store_result.py`

- [ ] **Step 1: Replace store_result with child_id-aware upsert logic**

```python
from backend.state import RoyalStateOptional
from backend.db.client import get_conn


def store_result(state: RoyalStateOptional) -> dict:
    user_id = state.get("user_id")
    child_id = state.get("child_id")
    royal_challenge = state.get("royal_challenge")

    if child_id is not None:
        sql = """
            INSERT INTO stories (date, princess, story_type, language, story_text, audio_url, royal_challenge, user_id, child_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date, princess, story_type, language, child_id) WHERE child_id IS NOT NULL
            DO UPDATE SET
                story_text = EXCLUDED.story_text,
                audio_url = EXCLUDED.audio_url,
                royal_challenge = EXCLUDED.royal_challenge
        """
        params = (
            state["date"], state["princess"], state["story_type"], state["language"],
            state["story_text"], state["audio_url"], royal_challenge, user_id, child_id,
        )
    elif user_id is not None:
        sql = """
            INSERT INTO stories (date, princess, story_type, language, story_text, audio_url, royal_challenge, user_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date, princess, story_type, language, user_id) WHERE user_id IS NOT NULL AND child_id IS NULL
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
            ON CONFLICT (date, princess, story_type, language) WHERE user_id IS NULL AND child_id IS NULL
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

- [ ] **Step 2: Run tests**

```bash
cd backend && source .venv/bin/activate
pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/nodes/store_result.py
git commit -m "feat: update store_result to upsert stories scoped by child_id"
```

---

## Task 4: Memory Layer — extract_memories

**Files:**
- Modify: `backend/utils/mem0_client.py`
- Modify: `backend/nodes/extract_memories.py`
- Modify: `backend/tests/test_nodes/test_extract_memories.py`

- [ ] **Step 1: Write failing tests for the new behavior**

Replace the full content of `backend/tests/test_nodes/test_extract_memories.py`:

```python
from unittest.mock import MagicMock
from backend.nodes.extract_memories import extract_memories


def test_extract_memories_skips_fallback(mocker):
    """When brief is __fallback__, mem0 must not be called."""
    state = {"brief": "__fallback__", "child_id": "abc-123"}
    mock_get_memory = mocker.patch("backend.nodes.extract_memories.get_memory")
    result = extract_memories(state)
    mock_get_memory.assert_not_called()
    assert result == {}


def test_extract_memories_skips_when_no_child_id(mocker):
    """When child_id is absent, mem0 must not be called."""
    state = {"brief": "Sophie shared her toys today."}
    mock_get_memory = mocker.patch("backend.nodes.extract_memories.get_memory")
    result = extract_memories(state)
    mock_get_memory.assert_not_called()
    assert result == {}


def test_extract_memories_skips_when_child_id_is_none(mocker):
    """When child_id is explicitly None, mem0 must not be called."""
    state = {"brief": "Sophie shared her toys today.", "child_id": None}
    mock_get_memory = mocker.patch("backend.nodes.extract_memories.get_memory")
    result = extract_memories(state)
    mock_get_memory.assert_not_called()
    assert result == {}


def test_extract_memories_calls_memory_add_with_child_id(mocker):
    """When child_id is present, memory.add() is called with user_id=child_id."""
    child_id = "abc-123"
    state = {"brief": "Emma shared her toys and loves her blue teddy bear.", "child_id": child_id}
    mock_memory = MagicMock()
    mocker.patch("backend.nodes.extract_memories.get_memory", return_value=mock_memory)

    result = extract_memories(state)

    mock_memory.add.assert_called_once()
    call_args = mock_memory.add.call_args
    messages = call_args[0][0]
    assert any(
        msg["role"] == "user" and msg["content"] == state["brief"] for msg in messages
    )
    assert call_args[1]["user_id"] == child_id
    assert result == {}


def test_extract_memories_system_prompt_covers_all_categories(mocker):
    """System message must mention preferences, habits, milestones, social patterns."""
    state = {"brief": "Emma had a great day.", "child_id": "abc-123"}
    mock_memory = MagicMock()
    mocker.patch("backend.nodes.extract_memories.get_memory", return_value=mock_memory)

    extract_memories(state)

    messages = mock_memory.add.call_args[0][0]
    system_content = next(m["content"] for m in messages if m["role"] == "system")
    for keyword in ("preferences", "habits", "milestones", "social"):
        assert keyword.lower() in system_content.lower(), f"System prompt missing: {keyword}"


def test_extract_memories_handles_mem0_error_gracefully(mocker):
    """If mem0 raises, the node returns {} without propagating the exception."""
    state = {"brief": "Emma had a great day.", "child_id": "abc-123"}
    mock_memory = MagicMock()
    mock_memory.add.side_effect = Exception("Qdrant unreachable")
    mocker.patch("backend.nodes.extract_memories.get_memory", return_value=mock_memory)

    result = extract_memories(state)  # must not raise

    assert result == {}
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_nodes/test_extract_memories.py -v
```

Expected: `test_extract_memories_skips_when_no_child_id` and `test_extract_memories_calls_memory_add_with_child_id` FAIL.

- [ ] **Step 3: Remove EMMA_USER_ID from mem0_client**

Replace the full content of `backend/utils/mem0_client.py`:

```python
import os
from mem0 import Memory

_memory = None


def get_memory() -> Memory:
    """Returns a singleton mem0 Memory instance configured to use Qdrant."""
    global _memory
    if _memory is None:
        qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        config = {
            "vector_store": {
                "provider": "qdrant",
                "config": {
                    "url": qdrant_url,
                },
            },
        }
        _memory = Memory.from_config(config)
    return _memory
```

- [ ] **Step 4: Update extract_memories to use child_id**

Replace the full content of `backend/nodes/extract_memories.py`:

```python
import logging
from backend.state import RoyalStateOptional
from backend.utils.mem0_client import get_memory

logger = logging.getLogger(__name__)

_EXTRACTION_SYSTEM_PROMPT = (
    "Extract only facts worth remembering long-term about this child: "
    "their preferences (favorite toys, colors, foods, characters), "
    "social patterns (friendships, sibling dynamics, social wins/struggles), "
    "habits (recurring behaviors they are working on, e.g. brushing teeth, sharing), "
    "and milestones (significant achievements or life events). "
    "Ignore transient details that are not reusable in future stories."
)


def extract_memories(state: RoyalStateOptional) -> dict:
    brief = state.get("brief", "__fallback__")
    child_id = state.get("child_id")
    if brief == "__fallback__" or not child_id:
        return {}
    try:
        memory = get_memory()
        memory.add(
            [
                {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": brief},
            ],
            user_id=child_id,
        )
    except Exception:
        logger.warning(
            "extract_memories: mem0 unavailable, skipping memory extraction",
            exc_info=True,
        )
    return {}
```

- [ ] **Step 5: Run tests — expect all to pass**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_nodes/test_extract_memories.py -v
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/utils/mem0_client.py backend/nodes/extract_memories.py backend/tests/test_nodes/test_extract_memories.py
git commit -m "feat: scope memory extraction to child_id, remove EMMA_USER_ID"
```

---

## Task 5: Memory Layer — fetch_memories

**Files:**
- Modify: `backend/nodes/fetch_memories.py`
- Modify: `backend/tests/test_nodes/test_fetch_memories.py`

- [ ] **Step 1: Write failing tests**

Replace the full content of `backend/tests/test_nodes/test_fetch_memories.py`:

```python
from unittest.mock import MagicMock
from backend.nodes.fetch_memories import fetch_memories


def test_fetch_memories_skips_when_no_child_id(mocker):
    """When child_id is absent, returns memories='' without calling mem0."""
    state = {"brief": "Emma shared her crayons today."}
    mock_get_memory = mocker.patch("backend.nodes.fetch_memories.get_memory")
    result = fetch_memories(state)
    mock_get_memory.assert_not_called()
    assert result == {"memories": ""}


def test_fetch_memories_skips_when_child_id_is_none(mocker):
    """When child_id is explicitly None, returns memories='' without calling mem0."""
    state = {"brief": "Emma shared her crayons today.", "child_id": None}
    mock_get_memory = mocker.patch("backend.nodes.fetch_memories.get_memory")
    result = fetch_memories(state)
    mock_get_memory.assert_not_called()
    assert result == {"memories": ""}


def test_fetch_memories_combines_profile_and_relevant(mocker):
    """Profile memories appear as bullets; relevant non-overlapping memories appear with [Today:] prefix."""
    child_id = "child-uuid-1"
    state = {"brief": "Emma shared her crayons today.", "child_id": child_id}
    mock_memory = MagicMock()
    mock_memory.get_all.return_value = [
        {"id": "1", "memory": "Emma loves her blue teddy bear"},
        {"id": "2", "memory": "Emma is working on brushing her teeth"},
    ]
    mock_memory.search.return_value = [
        {"id": "3", "memory": "Emma helped a friend share at school"},
    ]
    mocker.patch("backend.nodes.fetch_memories.get_memory", return_value=mock_memory)

    result = fetch_memories(state)

    mock_memory.get_all.assert_called_once_with(user_id=child_id)
    mock_memory.search.assert_called_once_with(query=state["brief"], user_id=child_id, limit=5)
    assert "- Emma loves her blue teddy bear" in result["memories"]
    assert "- Emma is working on brushing her teeth" in result["memories"]
    assert "[Today: Emma helped a friend share at school]" in result["memories"]


def test_fetch_memories_deduplicates_relevant_already_in_profile(mocker):
    """A memory already in the profile must not appear again under [Today:]."""
    child_id = "child-uuid-1"
    state = {"brief": "Emma shared her crayons.", "child_id": child_id}
    mock_memory = MagicMock()
    mock_memory.get_all.return_value = [
        {"id": "1", "memory": "Emma loves her blue teddy bear"},
    ]
    mock_memory.search.return_value = [
        {"id": "1", "memory": "Emma loves her blue teddy bear"},  # same id
    ]
    mocker.patch("backend.nodes.fetch_memories.get_memory", return_value=mock_memory)

    result = fetch_memories(state)

    assert result["memories"].count("Emma loves her blue teddy bear") == 1


def test_fetch_memories_skips_search_on_fallback_brief(mocker):
    """When brief is __fallback__, search must not be called; profile is still returned."""
    child_id = "child-uuid-1"
    state = {"brief": "__fallback__", "child_id": child_id}
    mock_memory = MagicMock()
    mock_memory.get_all.return_value = [
        {"id": "1", "memory": "Emma loves her blue teddy bear"},
    ]
    mocker.patch("backend.nodes.fetch_memories.get_memory", return_value=mock_memory)

    result = fetch_memories(state)

    mock_memory.search.assert_not_called()
    assert "Emma loves her blue teddy bear" in result["memories"]


def test_fetch_memories_returns_empty_string_on_error(mocker):
    """If mem0 raises, returns memories='' without propagating the exception."""
    child_id = "child-uuid-1"
    state = {"brief": "Emma had a great day.", "child_id": child_id}
    mock_memory = MagicMock()
    mock_memory.get_all.side_effect = Exception("Qdrant unreachable")
    mocker.patch("backend.nodes.fetch_memories.get_memory", return_value=mock_memory)

    result = fetch_memories(state)

    assert result == {"memories": ""}


def test_fetch_memories_returns_empty_string_when_no_memories(mocker):
    """When mem0 has nothing stored yet, returns memories=''."""
    child_id = "child-uuid-1"
    state = {"brief": "Emma had a great day.", "child_id": child_id}
    mock_memory = MagicMock()
    mock_memory.get_all.return_value = []
    mock_memory.search.return_value = []
    mocker.patch("backend.nodes.fetch_memories.get_memory", return_value=mock_memory)

    result = fetch_memories(state)

    assert result == {"memories": ""}
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_nodes/test_fetch_memories.py -v
```

Expected: `test_fetch_memories_skips_when_no_child_id` and `test_fetch_memories_skips_when_child_id_is_none` FAIL (old code uses EMMA_USER_ID unconditionally).

- [ ] **Step 3: Update fetch_memories**

Replace the full content of `backend/nodes/fetch_memories.py`:

```python
import logging
from backend.state import RoyalStateOptional
from backend.utils.mem0_client import get_memory

logger = logging.getLogger(__name__)


def _as_list(result) -> list:
    """Normalise mem0 results — some versions return a list, others {'results': [...]}."""
    if isinstance(result, list):
        return result
    return result.get("results", [])


def fetch_memories(state: RoyalStateOptional) -> dict:
    child_id = state.get("child_id")
    if not child_id:
        return {"memories": ""}

    brief = state.get("brief", "__fallback__")
    try:
        memory = get_memory()

        # Build compact child profile from 10 most recent memories
        all_memories = _as_list(memory.get_all(user_id=child_id))
        profile_items = [m for m in all_memories[:10] if m.get("memory")]
        profile_lines = [f"- {m['memory']}" for m in profile_items]
        profile_ids = {m.get("id") for m in profile_items}

        # Contextually relevant memories for today's brief
        relevant_lines = []
        if brief and brief != "__fallback__":
            relevant = _as_list(
                memory.search(query=brief, user_id=child_id, limit=5)
            )
            relevant_lines = [
                f"[Today: {m['memory']}]"
                for m in relevant
                if m.get("memory") and m.get("id") not in profile_ids
            ]

        all_lines = profile_lines + relevant_lines
        return {"memories": "\n".join(all_lines)}

    except Exception:
        logger.warning(
            "fetch_memories: mem0 unavailable, continuing without memories",
            exc_info=True,
        )
        return {"memories": ""}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_nodes/test_fetch_memories.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/nodes/fetch_memories.py backend/tests/test_nodes/test_fetch_memories.py
git commit -m "feat: scope memory retrieval to child_id, skip when absent"
```

---

## Task 6: Child Detection Utility

**Files:**
- Create: `backend/utils/child_detection.py`
- Create: `backend/tests/test_utils/__init__.py`
- Create: `backend/tests/test_utils/test_child_detection.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_utils/__init__.py` (empty file).

Create `backend/tests/test_utils/test_child_detection.py`:

```python
from unittest.mock import MagicMock
from backend.utils.child_detection import detect_children_in_brief


def test_returns_empty_list_when_no_children():
    """If no children registered, returns [] without calling LLM."""
    result = detect_children_in_brief("Emma had a great day", [])
    assert result == []


def test_returns_matched_names(mocker):
    """LLM returns a matched name that is in the provided list."""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content='["Emma"]')
    mocker.patch("backend.utils.child_detection.get_llm", return_value=mock_llm)

    result = detect_children_in_brief("Emma had a great day", ["Emma", "Sophie"])

    assert result == ["Emma"]


def test_returns_multiple_matched_names(mocker):
    """LLM returns multiple matched names."""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content='["Emma", "Sophie"]')
    mocker.patch("backend.utils.child_detection.get_llm", return_value=mock_llm)

    result = detect_children_in_brief("Emma and Sophie had a great day", ["Emma", "Sophie"])

    assert result == ["Emma", "Sophie"]


def test_returns_empty_list_when_no_match(mocker):
    """LLM returns [] when no children are mentioned."""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content='[]')
    mocker.patch("backend.utils.child_detection.get_llm", return_value=mock_llm)

    result = detect_children_in_brief("Had a wonderful day", ["Emma", "Sophie"])

    assert result == []


def test_filters_out_names_not_in_list(mocker):
    """LLM hallucinated a name not in the registered list — must be filtered out."""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content='["InvalidName", "Emma"]')
    mocker.patch("backend.utils.child_detection.get_llm", return_value=mock_llm)

    result = detect_children_in_brief("Emma had a great day", ["Emma", "Sophie"])

    assert result == ["Emma"]


def test_handles_invalid_json_gracefully(mocker):
    """If LLM returns non-JSON, returns [] without raising."""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content='not valid json at all')
    mocker.patch("backend.utils.child_detection.get_llm", return_value=mock_llm)

    result = detect_children_in_brief("Emma had a great day", ["Emma"])

    assert result == []


def test_handles_non_list_json_gracefully(mocker):
    """If LLM returns valid JSON but not a list, returns []."""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content='{"name": "Emma"}')
    mocker.patch("backend.utils.child_detection.get_llm", return_value=mock_llm)

    result = detect_children_in_brief("Emma had a great day", ["Emma"])

    assert result == []
```

- [ ] **Step 2: Run tests — expect ImportError (module doesn't exist yet)**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_utils/test_child_detection.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'backend.utils.child_detection'`

- [ ] **Step 3: Create the detection utility**

Create `backend/utils/child_detection.py`:

```python
import json
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

_llm = None


def get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=100)
    return _llm


_DETECT_SYSTEM = (
    "You are a name detector. Given a parent's note and a list of child names, "
    "return a JSON array of names from the list that are mentioned in the note. "
    "Account for nicknames, typos, and alternative spellings. "
    "If no names match, return an empty array []. "
    "Respond with only the JSON array, no other text."
)


def detect_children_in_brief(brief_text: str, child_names: list[str]) -> list[str]:
    """Return the subset of child_names mentioned in brief_text, using an LLM."""
    if not child_names:
        return []
    llm = get_llm()
    prompt = f"Children names: {json.dumps(child_names)}\n\nParent's note: {brief_text}"
    response = llm.invoke([
        SystemMessage(content=_DETECT_SYSTEM),
        HumanMessage(content=prompt),
    ])
    try:
        matched = json.loads(response.content.strip())
        if isinstance(matched, list):
            return [n for n in matched if n in child_names]
        return []
    except (json.JSONDecodeError, TypeError):
        return []
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_utils/test_child_detection.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/utils/child_detection.py backend/tests/test_utils/__init__.py backend/tests/test_utils/test_child_detection.py
git commit -m "feat: add LLM-based child detection utility"
```

---

## Task 7: Admin Children Endpoints

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add Pydantic models and 3 endpoints to main.py**

After the existing `class UserByChatIdResponse` model (around line 178), add the new models:

```python
class CreateChildRequest(BaseModel):
    name: str
    timezone: str = "America/Los_Angeles"
    preferences: dict = {}


class ChildResponse(BaseModel):
    id: str
    parent_id: str
    name: str
    timezone: str
    preferences: dict
    created_at: str
```

After the `admin_delete_user` endpoint, add:

```python
# ── Admin: children ───────────────────────────────────────────────────────────

@app.get("/admin/users/{user_id}/children", response_model=list[ChildResponse])
def admin_list_children(user_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, parent_id, name, timezone, preferences, created_at FROM children WHERE parent_id = %s ORDER BY created_at",
                (user_id,),
            )
            rows = cur.fetchall()
    return [
        {
            "id": str(r[0]), "parent_id": str(r[1]), "name": r[2],
            "timezone": r[3], "preferences": r[4], "created_at": r[5].isoformat(),
        }
        for r in rows
    ]


@app.post("/admin/users/{user_id}/children", response_model=ChildResponse, status_code=201)
def admin_create_child(user_id: str, req: CreateChildRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO children (parent_id, name, timezone, preferences)
                   VALUES (%s, %s, %s, %s)
                   RETURNING id, parent_id, name, timezone, preferences, created_at""",
                (user_id, req.name, req.timezone, json.dumps(req.preferences)),
            )
            row = cur.fetchone()
    return {
        "id": str(row[0]), "parent_id": str(row[1]), "name": row[2],
        "timezone": row[3], "preferences": row[4], "created_at": row[5].isoformat(),
    }


@app.delete("/admin/children/{child_id}", status_code=204)
def admin_delete_child(child_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM children WHERE id = %s RETURNING id", (child_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Child not found")
```

- [ ] **Step 2: Run tests**

```bash
cd backend && source .venv/bin/activate
pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat: add admin CRUD endpoints for children"
```

---

## Task 8: Update POST /brief with Child Detection

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add import for detect_children_in_brief at the top of main.py**

After the existing imports add:

```python
from backend.utils.child_detection import detect_children_in_brief
```

- [ ] **Step 2: Replace the post_brief endpoint**

Replace the existing `post_brief` function:

```python
@app.post("/brief")
def post_brief(req: BriefRequest):
    today = date.today().isoformat()

    # Resolve which child(ren) this brief is about
    child_ids_to_store: list[str | None] = []

    if req.user_id:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, name FROM children WHERE parent_id = %s ORDER BY created_at",
                    (req.user_id,),
                )
                children = cur.fetchall()  # list of (id, name)

        if len(children) == 0:
            child_ids_to_store = [None]
        elif len(children) == 1:
            child_ids_to_store = [str(children[0][0])]
        else:
            child_names = [row[1] for row in children]
            matched_names = detect_children_in_brief(req.text, child_names)
            name_to_id = {row[1]: str(row[0]) for row in children}
            child_ids_to_store = [name_to_id[n] for n in matched_names if n in name_to_id]
            if not child_ids_to_store:
                child_ids_to_store = [None]
    else:
        child_ids_to_store = [None]

    with get_conn() as conn:
        with conn.cursor() as cur:
            for child_id in child_ids_to_store:
                cur.execute(
                    "INSERT INTO briefs (date, text, user_id, child_id) VALUES (%s, %s, %s, %s)",
                    (today, req.text, req.user_id, child_id),
                )
    return {"status": "ok"}
```

- [ ] **Step 3: Run tests**

```bash
cd backend && source .venv/bin/activate
pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat: detect child from brief text on POST /brief, store one row per child"
```

---

## Task 9: Update Story Endpoints

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add child_id to StoryRequest**

Update the `StoryRequest` model:

```python
class StoryRequest(BaseModel):
    princess: Literal["elsa", "belle", "cinderella", "ariel"]
    language: Literal["en", "vi"] = "en"
    story_type: Literal["daily", "life_lesson"] = "daily"
    date: str | None = None
    timezone: str = "America/Los_Angeles"
    user_id: str | None = None
    child_id: str | None = None
```

- [ ] **Step 2: Update post_story to include child_id in cache check and initial state**

Replace the `post_story` function:

```python
@app.post("/story", response_model=StoryResponse)
def post_story(req: StoryRequest):
    story_date = req.date or get_logical_date_iso(req.timezone)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT audio_url FROM stories
                   WHERE date = %s AND princess = %s AND story_type = %s
                     AND language = %s AND user_id IS NOT DISTINCT FROM %s
                     AND child_id IS NOT DISTINCT FROM %s""",
                (story_date, req.princess, req.story_type, req.language, req.user_id, req.child_id),
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
        "child_id": req.child_id,
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(royal_graph.invoke, initial_state)
        try:
            result = future.result(timeout=60)
        except concurrent.futures.TimeoutError:
            raise HTTPException(status_code=504, detail="Story generation timed out")
    return StoryResponse(audio_url=result["audio_url"])
```

- [ ] **Step 3: Update get_today_story_for_princess to accept child_id**

Replace the `get_today_story_for_princess` function:

```python
@app.get("/story/today/{princess}", response_model=StoryDetailResponse)
def get_today_story_for_princess(
    princess: str,
    type: str = Query(default="daily"),
    timezone: str = "America/Los_Angeles",
    language: str = "en",
    user_id: str | None = None,
    child_id: str | None = None,
):
    today = get_logical_date_iso(timezone)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT audio_url, story_text, royal_challenge FROM stories
                   WHERE date = %s AND princess = %s AND story_type = %s AND language = %s
                     AND user_id IS NOT DISTINCT FROM %s
                     AND child_id IS NOT DISTINCT FROM %s""",
                (today, princess, type, language, user_id, child_id),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Story not found for today")
    return StoryDetailResponse(audio_url=row[0], story_text=row[1], royal_challenge=row[2])
```

- [ ] **Step 4: Run full test suite**

```bash
cd backend && source .venv/bin/activate
pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py
git commit -m "feat: pass child_id through story generation and story lookup endpoints"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - `children` table ✓ (Task 1)
  - `child_id` on `briefs` ✓ (Task 1)
  - `child_id` on `stories` + new indexes ✓ (Task 1)
  - Admin GET/POST/DELETE children ✓ (Task 7)
  - Single-child auto-assign ✓ (Task 8)
  - LLM multi-child detection ✓ (Task 8)
  - No match → `child_id = NULL` ✓ (Task 8)
  - `child_id` in story pipeline state ✓ (Task 2)
  - `fetch_brief` filters by `child_id` ✓ (Task 2)
  - `store_result` upserts by `child_id` ✓ (Task 3)
  - `EMMA_USER_ID` removed ✓ (Task 4)
  - `extract_memories` skips when no `child_id` ✓ (Task 4)
  - `fetch_memories` skips when no `child_id` ✓ (Task 5)
  - `POST /story` accepts `child_id` ✓ (Task 9)
  - `GET /story/today/{princess}` accepts `child_id` ✓ (Task 9)

- [x] **No placeholders:** All steps contain actual code.

- [x] **Type consistency:** `child_id: str | None` used consistently across state, endpoints, and nodes.
