# Children-Centric Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the data model so children are the primary entity with many-to-many user relationships, drop `user_id` from stories, and redesign the Admin UI with children as the primary view.

**Architecture:** New `user_children` join table replaces `parent_id` FK. Stories lose `user_id` column. Admin UI gets a new Children page as primary, Users page becomes secondary. All child lookups go through the join table.

**Tech Stack:** PostgreSQL (golang-migrate), FastAPI + Pydantic, Next.js (admin), Vitest (frontend tests), pytest (backend tests)

---

### Task 1: Database Migration

**Files:**
- Create: `backend/db/migrations/004_children_centric.up.sql`
- Create: `backend/db/migrations/004_children_centric.down.sql`

Since there's no data to preserve, we drop affected tables and recreate them.

- [ ] **Step 1: Write the up migration**

```sql
-- backend/db/migrations/004_children_centric.up.sql

-- Drop tables that depend on the old schema (order matters for FK deps)
DROP TABLE IF EXISTS stories CASCADE;
DROP TABLE IF EXISTS briefs CASCADE;
DROP TABLE IF EXISTS children CASCADE;

-- Recreate children without parent_id
CREATE TABLE children (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Join table: many-to-many users <-> children
CREATE TABLE user_children (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    role TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, child_id)
);

-- Recreate briefs: keeps user_id (who sent it) + child_id
CREATE TABLE briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    text TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    child_id UUID REFERENCES children(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Recreate stories: NO user_id, only child_id
CREATE TABLE stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    princess TEXT NOT NULL,
    story_type TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    story_text TEXT,
    audio_url TEXT,
    royal_challenge TEXT,
    child_id UUID REFERENCES children(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Uniqueness indexes for stories
CREATE UNIQUE INDEX stories_unique_with_child
    ON stories (date, princess, story_type, language, child_id)
    WHERE child_id IS NOT NULL;

CREATE UNIQUE INDEX stories_unique_no_child
    ON stories (date, princess, story_type, language)
    WHERE child_id IS NULL;
```

- [ ] **Step 2: Write the down migration**

```sql
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
```

- [ ] **Step 3: Verify migration applies locally**

Run: `docker compose up -d db && docker compose run --rm migrate`
Expected: Migration 004 applies successfully.

- [ ] **Step 4: Commit**

```bash
git add backend/db/migrations/004_children_centric.up.sql backend/db/migrations/004_children_centric.down.sql
git commit -m "feat: add migration 004 — children-centric schema with user_children join table"
```

---

### Task 2: Update Backend State and Store Result Node

**Files:**
- Modify: `backend/state.py`
- Modify: `backend/nodes/store_result.py`
- Modify: `backend/tests/test_nodes/test_extract_memories.py` (if it references `user_id` in state)

- [ ] **Step 1: Remove `user_id` from `RoyalStateOptional`**

In `backend/state.py`, remove the `user_id` field from `RoyalStateOptional`. Keep `child_id`.

The file should become:

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
    child_id: str | None         # UUID of the child this story is for; None if unresolved
```

- [ ] **Step 2: Simplify `store_result.py` — remove `user_id` branches**

The `store_result` node currently has three SQL branches (child_id present, user_id only, neither). Since stories no longer have `user_id`, simplify to two branches (child_id present, no child_id).

```python
from backend.state import RoyalStateOptional
from backend.db.client import get_conn


def store_result(state: RoyalStateOptional) -> dict:
    child_id = state.get("child_id")
    royal_challenge = state.get("royal_challenge")

    if child_id is not None:
        sql = """
            INSERT INTO stories (date, princess, story_type, language, story_text, audio_url, royal_challenge, child_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date, princess, story_type, language, child_id) WHERE child_id IS NOT NULL
            DO UPDATE SET
                story_text = EXCLUDED.story_text,
                audio_url = EXCLUDED.audio_url,
                royal_challenge = EXCLUDED.royal_challenge
        """
        params = (
            state["date"], state["princess"], state["story_type"], state["language"],
            state["story_text"], state["audio_url"], royal_challenge, child_id,
        )
    else:
        sql = """
            INSERT INTO stories (date, princess, story_type, language, story_text, audio_url, royal_challenge)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date, princess, story_type, language) WHERE child_id IS NULL
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

- [ ] **Step 3: Update test_extract_memories.py if it passes `user_id` in state fixtures**

Check `backend/tests/test_nodes/test_extract_memories.py`. If any test fixtures include `user_id` in the state dict, remove it. The tests should still pass since `extract_memories` only uses `child_id`.

Run: `cd backend && uv run pytest tests/test_nodes/ -v`
Expected: All node tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/state.py backend/nodes/store_result.py backend/tests/
git commit -m "refactor: remove user_id from RoyalStateOptional and store_result node"
```

---

### Task 3: Update Story Routes

**Files:**
- Modify: `backend/routes/stories.py`

- [ ] **Step 1: Write tests for the updated story routes**

Add tests to `backend/tests/test_admin_routes.py` (or a new file `backend/tests/test_story_routes.py` if preferred) that verify:
- `POST /story` works without `user_id` in the request
- `GET /story/today/{princess}` works without `user_id` param

These are integration-style tests using the existing `_make_mock_conn` pattern from `test_admin_routes.py`. Add to the bottom of `backend/tests/test_admin_routes.py`:

```python
def test_post_story_without_user_id(mocker):
    # Mock cache miss (no existing story)
    mock_cursor = _make_mock_conn(mocker, "backend.routes.stories.get_conn")
    mock_cursor.fetchone.return_value = None

    # Mock graph invocation
    mock_graph = mocker.patch("backend.routes.stories.royal_graph")
    mock_graph.invoke.return_value = {"audio_url": "https://s3.example.com/story.mp3"}

    client = make_client(mocker)
    response = client.post("/story", json={
        "princess": "elsa",
        "child_id": "child-uuid-1",
    })
    assert response.status_code == 200
    assert response.json()["audio_url"] == "https://s3.example.com/story.mp3"


def test_get_story_detail_without_user_id(mocker):
    _make_mock_conn(mocker, "backend.routes.stories.get_conn",
                    fetchone=("https://s3.example.com/story.mp3", "Once upon a time...", "Be brave!"))
    client = make_client(mocker)
    response = client.get("/story/today/elsa?type=daily&child_id=child-uuid-1")
    assert response.status_code == 200
    data = response.json()
    assert data["story_text"] == "Once upon a time..."
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_admin_routes.py::test_post_story_without_user_id tests/test_admin_routes.py::test_get_story_detail_without_user_id -v`
Expected: Tests may pass or fail depending on current code — the key change is next.

- [ ] **Step 3: Update `StoryRequest` model — remove `user_id`**

In `backend/routes/stories.py`, remove `user_id` from `StoryRequest`:

```python
class StoryRequest(BaseModel):
    princess: Literal["elsa", "belle", "cinderella", "ariel"]
    language: Literal["en", "vi"] = "en"
    story_type: Literal["daily", "life_lesson"] = "daily"
    date: str | None = None
    timezone: str = "America/Los_Angeles"
    child_id: str | None = None
```

- [ ] **Step 4: Update `post_story` — remove `user_id` from cache query and initial state**

Replace the `post_story` function body. Remove `user_id` from the SQL query and initial state:

```python
@router.post("/story", response_model=StoryResponse)
def post_story(req: StoryRequest):
    story_date = req.date or get_logical_date_iso(req.timezone)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT audio_url FROM stories
                   WHERE date = %s AND princess = %s AND story_type = %s
                     AND language = %s
                     AND child_id IS NOT DISTINCT FROM %s""",
                (story_date, req.princess, req.story_type, req.language, req.child_id),
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

- [ ] **Step 5: Update `get_today_story_for_princess` — remove `user_id` param**

```python
@router.get("/story/today/{princess}", response_model=StoryDetailResponse)
def get_today_story_for_princess(
    princess: str,
    type: str = Query(default="daily"),
    timezone: str = "America/Los_Angeles",
    language: str = "en",
    child_id: str | None = None,
):
    today = get_logical_date_iso(timezone)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT audio_url, story_text, royal_challenge FROM stories
                   WHERE date = %s AND princess = %s AND story_type = %s AND language = %s
                     AND child_id IS NOT DISTINCT FROM %s""",
                (today, princess, type, language, child_id),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Story not found for today")
    return StoryDetailResponse(audio_url=row[0], story_text=row[1], royal_challenge=row[2])
```

- [ ] **Step 6: Update `post_brief` — child lookup via join table**

Replace the child lookup query in `post_brief`:

```python
@router.post("/brief")
def post_brief(req: BriefRequest):
    today = date.today().isoformat()

    # Resolve which child(ren) this brief is about
    child_ids_to_store: list[str | None] = []

    if req.user_id:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT c.id, c.name FROM children c
                       JOIN user_children uc ON c.id = uc.child_id
                       WHERE uc.user_id = %s ORDER BY c.created_at""",
                    (req.user_id,),
                )
                children = cur.fetchall()  # list of (id, name)

        if len(children) == 0:
            child_ids_to_store = [None]
        elif len(children) == 1:
            child_ids_to_store = [str(children[0][0])]
        else:
            child_names = [row[1] for row in children]
            try:
                matched_names = detect_children_in_brief(req.text, child_names)
            except Exception:
                logger.warning("post_brief: child detection failed, storing with child_id=None", exc_info=True)
                matched_names = []
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

- [ ] **Step 7: Run all backend tests**

Run: `cd backend && uv run pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/routes/stories.py backend/tests/
git commit -m "refactor: remove user_id from story routes, use join table for brief child lookup"
```

---

### Task 4: Update User Routes

**Files:**
- Modify: `backend/routes/users.py`

- [ ] **Step 1: Update `/user/me` query to use join table**

Replace the child query in `get_user_by_token`:

```python
@router.get("/me", response_model=UserMeResponse)
def get_user_by_token(token: str = Query(...)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM users WHERE token = %s", (token,))
            user_row = cur.fetchone()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")
            cur.execute(
                """SELECT c.id, c.name, c.preferences FROM children c
                   JOIN user_children uc ON c.id = uc.child_id
                   WHERE uc.user_id = %s ORDER BY c.created_at""",
                (str(user_row[0]),),
            )
            child_rows = cur.fetchall()
    children = [
        {"id": str(r[0]), "name": r[1], "preferences": r[2]}
        for r in child_rows
    ]
    return {"user_id": str(user_row[0]), "name": user_row[1], "children": children}
```

- [ ] **Step 2: Run tests**

Run: `cd backend && uv run pytest tests/test_admin_routes.py::test_get_user_by_token_returns_user -v`
Expected: PASS (the mock doesn't depend on the actual SQL).

- [ ] **Step 3: Commit**

```bash
git add backend/routes/users.py
git commit -m "refactor: update /user/me to query children via user_children join table"
```

---

### Task 5: Update Admin Routes

**Files:**
- Modify: `backend/routes/admin.py`
- Modify: `backend/tests/test_admin_routes.py`

- [ ] **Step 1: Write tests for new admin child routes**

Add these tests to `backend/tests/test_admin_routes.py`:

```python
def test_list_children_returns_children_with_users(mocker):
    mock_cursor = _make_mock_conn(mocker, "backend.routes.admin.get_conn")
    mock_cursor.fetchall.return_value = [
        ("child-1", "Emma", "America/Los_Angeles", {}, datetime(2026, 1, 1),
         "user-1", "Alice", "mom"),
    ]
    client = make_client(mocker)
    response = client.get("/admin/children")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Emma"
    assert len(data[0]["users"]) == 1
    assert data[0]["users"][0]["role"] == "mom"


def test_create_child_standalone(mocker):
    _make_mock_conn(mocker, "backend.routes.admin.get_conn",
                    fetchone=("child-1", "Emma", "America/Los_Angeles", {}, datetime(2026, 1, 1)))
    client = make_client(mocker)
    response = client.post("/admin/children", json={"name": "Emma"})
    assert response.status_code == 201
    assert response.json()["name"] == "Emma"


def test_link_user_to_child(mocker):
    mock_cursor = _make_mock_conn(mocker, "backend.routes.admin.get_conn")
    # fetchone calls: 1) child exists check returns child name, 2) no name conflict
    mock_cursor.fetchone.side_effect = [
        ("Emma",),      # child name lookup
        None,           # no existing child with same name for this user
        ("user-1", "child-1", "mom", datetime(2026, 1, 1)),  # INSERT result
    ]
    client = make_client(mocker)
    response = client.post("/admin/children/child-1/users", json={"user_id": "user-1", "role": "mom"})
    assert response.status_code == 201


def test_link_user_to_child_name_conflict(mocker):
    mock_cursor = _make_mock_conn(mocker, "backend.routes.admin.get_conn")
    mock_cursor.fetchone.side_effect = [
        ("Emma",),         # child name lookup
        ("other-child",),  # name conflict found!
    ]
    client = make_client(mocker)
    response = client.post("/admin/children/child-1/users", json={"user_id": "user-1", "role": "mom"})
    assert response.status_code == 409


def test_unlink_user_from_child(mocker):
    _make_mock_conn(mocker, "backend.routes.admin.get_conn", fetchone=("user-1", "child-1"))
    client = make_client(mocker)
    response = client.delete("/admin/children/child-1/users/user-1")
    assert response.status_code == 204
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_admin_routes.py::test_list_children_returns_children_with_users tests/test_admin_routes.py::test_create_child_standalone tests/test_admin_routes.py::test_link_user_to_child tests/test_admin_routes.py::test_link_user_to_child_name_conflict tests/test_admin_routes.py::test_unlink_user_from_child -v`
Expected: FAIL — routes don't exist yet.

- [ ] **Step 3: Rewrite admin routes**

Replace the entire `backend/routes/admin.py` file:

```python
import os
import glob
import json
import secrets

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.db.client import get_conn

router = APIRouter(prefix="/admin")


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


class CreateChildRequest(BaseModel):
    name: str
    timezone: str = "America/Los_Angeles"


class LinkedUserInfo(BaseModel):
    user_id: str
    name: str
    role: str | None


class ChildWithUsersResponse(BaseModel):
    id: str
    name: str
    timezone: str
    preferences: dict
    created_at: str
    users: list[LinkedUserInfo]


class ChildResponse(BaseModel):
    id: str
    name: str
    timezone: str
    preferences: dict
    created_at: str


class LinkUserRequest(BaseModel):
    user_id: str
    role: str | None = None


class UserChildLinkResponse(BaseModel):
    user_id: str
    child_id: str
    role: str | None
    created_at: str


class PreferencesResponse(BaseModel):
    child_id: str
    preferences: dict


class UpdatePreferencesRequest(BaseModel):
    preferences: dict


class PersonaResponse(BaseModel):
    id: str
    name: str


# ── Users ────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserResponse])
def admin_list_users():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, telegram_chat_id, token, created_at FROM users ORDER BY created_at")
            rows = cur.fetchall()
    return [
        {"id": str(r[0]), "name": r[1], "telegram_chat_id": r[2], "token": r[3], "created_at": r[4].isoformat()}
        for r in rows
    ]


@router.post("/users", response_model=UserResponse, status_code=201)
def admin_create_user(req: CreateUserRequest):
    token = "tk_" + secrets.token_hex(8)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE telegram_chat_id = %s", (req.telegram_chat_id,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Telegram chat ID already in use")
            cur.execute(
                """INSERT INTO users (name, telegram_chat_id, token)
                   VALUES (%s, %s, %s)
                   RETURNING id, name, telegram_chat_id, token, created_at""",
                (req.name, req.telegram_chat_id, token),
            )
            row = cur.fetchone()
    return {"id": str(row[0]), "name": row[1], "telegram_chat_id": row[2], "token": row[3], "created_at": row[4].isoformat()}


@router.delete("/users/{user_id}", status_code=204)
def admin_delete_user(user_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s RETURNING id", (user_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")


# ── Children ─────────────────────────────────────────────────────────────────

@router.get("/children", response_model=list[ChildWithUsersResponse])
def admin_list_children():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT c.id, c.name, c.timezone, c.preferences, c.created_at,
                          u.id, u.name, uc.role
                   FROM children c
                   LEFT JOIN user_children uc ON c.id = uc.child_id
                   LEFT JOIN users u ON uc.user_id = u.id
                   ORDER BY c.created_at"""
            )
            rows = cur.fetchall()

    # Group by child
    children_map: dict[str, dict] = {}
    for r in rows:
        cid = str(r[0])
        if cid not in children_map:
            children_map[cid] = {
                "id": cid, "name": r[1], "timezone": r[2],
                "preferences": r[3], "created_at": r[4].isoformat(),
                "users": [],
            }
        if r[5] is not None:  # user exists
            children_map[cid]["users"].append({
                "user_id": str(r[5]), "name": r[6], "role": r[7],
            })
    return list(children_map.values())


@router.post("/children", response_model=ChildResponse, status_code=201)
def admin_create_child(req: CreateChildRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO children (name, timezone)
                   VALUES (%s, %s)
                   RETURNING id, name, timezone, preferences, created_at""",
                (req.name, req.timezone),
            )
            row = cur.fetchone()
    return {
        "id": str(row[0]), "name": row[1], "timezone": row[2],
        "preferences": row[3], "created_at": row[4].isoformat(),
    }


@router.delete("/children/{child_id}", status_code=204)
def admin_delete_child(child_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM children WHERE id = %s RETURNING id", (child_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Child not found")


# ── User-Child Links ────────────────────────────────────────────────────────

@router.post("/children/{child_id}/users", response_model=UserChildLinkResponse, status_code=201)
def admin_link_user_to_child(child_id: str, req: LinkUserRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get the child's name
            cur.execute("SELECT name FROM children WHERE id = %s", (child_id,))
            child_row = cur.fetchone()
            if not child_row:
                raise HTTPException(status_code=404, detail="Child not found")
            child_name = child_row[0]

            # Check name uniqueness: does this user already have a linked child with the same name?
            cur.execute(
                """SELECT c.id FROM children c
                   JOIN user_children uc ON c.id = uc.child_id
                   WHERE uc.user_id = %s AND c.name = %s AND c.id != %s""",
                (req.user_id, child_name, child_id),
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail=f"User already has a linked child named '{child_name}'",
                )

            cur.execute(
                """INSERT INTO user_children (user_id, child_id, role)
                   VALUES (%s, %s, %s)
                   RETURNING user_id, child_id, role, created_at""",
                (req.user_id, child_id, req.role),
            )
            row = cur.fetchone()
    return {
        "user_id": str(row[0]), "child_id": str(row[1]),
        "role": row[2], "created_at": row[3].isoformat(),
    }


@router.delete("/children/{child_id}/users/{user_id}", status_code=204)
def admin_unlink_user_from_child(child_id: str, user_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM user_children WHERE user_id = %s AND child_id = %s RETURNING user_id",
                (user_id, child_id),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Link not found")


# ── Preferences ──────────────────────────────────────────────────────────────

@router.get("/children/{child_id}/preferences", response_model=PreferencesResponse)
def admin_get_preferences(child_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, preferences FROM children WHERE id = %s", (child_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Child not found")
    return {"child_id": str(row[0]), "preferences": row[1]}


@router.put("/children/{child_id}/preferences", response_model=PreferencesResponse)
def admin_update_preferences(child_id: str, req: UpdatePreferencesRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE children SET preferences = %s WHERE id = %s
                   RETURNING id, preferences""",
                (json.dumps(req.preferences), child_id),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Child not found")
    return {"child_id": str(row[0]), "preferences": row[1]}


# ── Personas ─────────────────────────────────────────────────────────────────

@router.get("/personas", response_model=list[PersonaResponse])
def admin_list_personas():
    personas_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "personas")
    results = []
    for path in sorted(glob.glob(os.path.join(personas_dir, "*.yaml"))):
        persona_id = os.path.splitext(os.path.basename(path))[0]
        with open(path) as f:
            data = yaml.safe_load(f)
        results.append({"id": persona_id, "name": data.get("name", persona_id)})
    return results
```

- [ ] **Step 4: Run all backend tests**

Run: `cd backend && uv run pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/admin.py backend/tests/test_admin_routes.py
git commit -m "feat: rewrite admin routes — standalone children CRUD + user-child linking"
```

---

### Task 6: Update Admin Frontend API Client

**Files:**
- Modify: `admin/lib/api.ts`

- [ ] **Step 1: Rewrite the API client**

Replace `admin/lib/api.ts` with updated types and functions matching the new backend routes:

```typescript
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? NEXT_PUBLIC_API_URL;

const API_URL = typeof window === 'undefined' ? INTERNAL_API_URL : NEXT_PUBLIC_API_URL;

export interface User {
  id: string;
  name: string;
  telegram_chat_id: number;
  token: string;
  created_at: string;
}

export interface LinkedUserInfo {
  user_id: string;
  name: string;
  role: string | null;
}

export interface ChildWithUsers {
  id: string;
  name: string;
  timezone: string;
  preferences: Record<string, unknown>;
  created_at: string;
  users: LinkedUserInfo[];
}

export interface Child {
  id: string;
  name: string;
  timezone: string;
  preferences: Record<string, unknown>;
  created_at: string;
}

export interface ChildPreferences {
  child_id: string;
  preferences: {
    favorite_princesses?: string[];
    [key: string]: unknown;
  };
}

export interface Persona {
  id: string;
  name: string;
}

export interface UserChildLink {
  user_id: string;
  child_id: string;
  role: string | null;
  created_at: string;
}

// ── Users ──────────────────────────────────────────────────────────────────

export async function listUsers(): Promise<User[]> {
  const res = await fetch(`${API_URL}/admin/users`);
  if (!res.ok) throw new Error('Failed to list users');
  return res.json();
}

export async function createUser(name: string, telegram_chat_id: number): Promise<User> {
  const res = await fetch(`${API_URL}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, telegram_chat_id }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to create user');
  }
  return res.json();
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete user');
}

// ── Children ───────────────────────────────────────────────────────────────

export async function listChildrenAll(): Promise<ChildWithUsers[]> {
  const res = await fetch(`${API_URL}/admin/children`);
  if (!res.ok) throw new Error('Failed to list children');
  return res.json();
}

export async function createChild(name: string, timezone?: string): Promise<Child> {
  const res = await fetch(`${API_URL}/admin/children`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, timezone: timezone ?? 'America/Los_Angeles' }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to create child');
  }
  return res.json();
}

export async function deleteChild(childId: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/children/${childId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete child');
}

// ── User-Child Links ───────────────────────────────────────────────────────

export async function linkUserToChild(childId: string, userId: string, role: string | null): Promise<UserChildLink> {
  const res = await fetch(`${API_URL}/admin/children/${childId}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, role }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to link user to child');
  }
  return res.json();
}

export async function unlinkUserFromChild(childId: string, userId: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/children/${childId}/users/${userId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to unlink user from child');
}

// ── Preferences ────────────────────────────────────────────────────────────

export async function getPreferences(childId: string): Promise<ChildPreferences> {
  const res = await fetch(`${API_URL}/admin/children/${childId}/preferences`);
  if (!res.ok) throw new Error('Failed to get preferences');
  return res.json();
}

export async function updatePreferences(childId: string, preferences: Record<string, unknown>): Promise<ChildPreferences> {
  const res = await fetch(`${API_URL}/admin/children/${childId}/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferences }),
  });
  if (!res.ok) throw new Error('Failed to update preferences');
  return res.json();
}

// ── Personas ───────────────────────────────────────────────────────────────

export async function listPersonas(): Promise<Persona[]> {
  const res = await fetch(`${API_URL}/admin/personas`);
  if (!res.ok) throw new Error('Failed to list personas');
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add admin/lib/api.ts
git commit -m "refactor: update admin API client for children-centric routes"
```

---

### Task 7: Update Admin Sidebar

**Files:**
- Modify: `admin/components/Sidebar.tsx`

- [ ] **Step 1: Update nav items — Children primary, Users secondary, remove Characters**

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Baby } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/children', icon: Baby, label: 'Children' },
  { href: '/users', icon: Users, label: 'Users' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-14 flex-shrink-0 flex flex-col items-center py-4 gap-2"
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}>
      {/* Logo */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base mb-4"
        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
        👑
      </div>

      {/* Nav items */}
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center transition-colors group relative',
              active
                ? 'text-indigo-400'
                : 'text-slate-500 hover:text-slate-300',
            )}
            style={{ background: active ? 'hsl(var(--accent))' : undefined }}
          >
            <Icon size={18} />
            {/* Tooltip */}
            <span className="absolute left-12 bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
              {label}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add admin/components/Sidebar.tsx
git commit -m "refactor: update sidebar — Children primary, remove Characters page"
```

---

### Task 8: Create Children Admin Page

**Files:**
- Create: `admin/app/children/page.tsx`
- Create: `admin/components/ChildrenTable.tsx`

- [ ] **Step 1: Create the Children page (server component)**

```typescript
// admin/app/children/page.tsx
import { listChildrenAll, listUsers, listPersonas, type ChildWithUsers, type User, type Persona } from '@/lib/api';
import { ChildrenTable } from '@/components/ChildrenTable';

export const dynamic = 'force-dynamic';

export default async function ChildrenPage() {
  let children: ChildWithUsers[] = [];
  let users: User[] = [];
  let personas: Persona[] = [];
  try {
    [children, users, personas] = await Promise.all([
      listChildrenAll(),
      listUsers(),
      listPersonas(),
    ]);
  } catch {
    // backend unreachable during dev — start empty
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Topbar */}
      <div className="h-13 flex-shrink-0 flex items-center justify-between px-6 border-b"
        style={{ borderColor: 'var(--sidebar-border)', background: 'var(--topbar-bg)' }}>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-slate-100">Children</h1>
          <span className="text-xs text-slate-500">{children.length} registered</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <ChildrenTable initialChildren={children} allUsers={users} personas={personas} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the ChildrenTable component**

This is the main component with: add child form, children table with expandable rows for linking users and managing preferences.

```typescript
// admin/components/ChildrenTable.tsx
'use client';

import React, { useState } from 'react';
import { Trash2, ChevronDown, ChevronRight, X } from 'lucide-react';
import {
  createChild, deleteChild, linkUserToChild, unlinkUserFromChild,
  updatePreferences, listPersonas,
  type ChildWithUsers, type User, type Persona, type LinkedUserInfo,
} from '@/lib/api';
import { CharactersPicker } from '@/components/CharactersPicker';

interface Props {
  initialChildren: ChildWithUsers[];
  allUsers: User[];
  personas: Persona[];
}

export function ChildrenTable({ initialChildren, allUsers, personas }: Props) {
  const [children, setChildren] = useState<ChildWithUsers[]>(initialChildren);
  const [childName, setChildName] = useState('');
  const [childTimezone, setChildTimezone] = useState('America/Los_Angeles');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expanded row state
  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);

  // Link user state
  const [linkUserId, setLinkUserId] = useState<Record<string, string>>({});
  const [linkRole, setLinkRole] = useState<Record<string, string>>({});
  const [linking, setLinking] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<Record<string, string>>({});

  // Preferences state
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleCreateChild(e: React.FormEvent) {
    e.preventDefault();
    if (!childName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const child = await createChild(childName.trim(), childTimezone);
      setChildren((prev) => [...prev, { ...child, users: [] }]);
      setChildName('');
      setChildTimezone('America/Los_Angeles');
    } catch (err: any) {
      setError(err.message || 'Failed to create child.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteChild(e: React.MouseEvent, childId: string) {
    e.stopPropagation();
    if (!confirm('Remove this child? This cannot be undone.')) return;
    try {
      await deleteChild(childId);
      setChildren((prev) => prev.filter((c) => c.id !== childId));
      if (expandedChildId === childId) setExpandedChildId(null);
    } catch {
      setError('Failed to remove child.');
    }
  }

  async function handleLinkUser(childId: string) {
    const userId = linkUserId[childId];
    const role = (linkRole[childId] ?? '').trim() || null;
    if (!userId) return;
    setLinking(childId);
    setLinkError((prev) => ({ ...prev, [childId]: '' }));
    try {
      await linkUserToChild(childId, userId, role);
      const user = allUsers.find((u) => u.id === userId);
      const newLink: LinkedUserInfo = { user_id: userId, name: user?.name ?? '', role };
      setChildren((prev) =>
        prev.map((c) => c.id === childId ? { ...c, users: [...c.users, newLink] } : c)
      );
      setLinkUserId((prev) => ({ ...prev, [childId]: '' }));
      setLinkRole((prev) => ({ ...prev, [childId]: '' }));
    } catch (err: any) {
      setLinkError((prev) => ({ ...prev, [childId]: err.message || 'Failed to link user.' }));
    } finally {
      setLinking(null);
    }
  }

  async function handleUnlinkUser(childId: string, userId: string) {
    if (!confirm('Unlink this user from the child?')) return;
    try {
      await unlinkUserFromChild(childId, userId);
      setChildren((prev) =>
        prev.map((c) => c.id === childId
          ? { ...c, users: c.users.filter((u) => u.user_id !== userId) }
          : c)
      );
    } catch {
      setLinkError((prev) => ({ ...prev, [childId]: 'Failed to unlink user.' }));
    }
  }

  async function handleSavePreferences(childId: string, selected: string[]) {
    setSaveError(null);
    try {
      await updatePreferences(childId, { favorite_princesses: selected });
      setChildren((prev) =>
        prev.map((c) => c.id === childId
          ? { ...c, preferences: { ...c.preferences, favorite_princesses: selected } }
          : c)
      );
    } catch {
      setSaveError('Failed to save preferences.');
    }
  }

  // Users not already linked to a given child
  function availableUsers(childId: string): User[] {
    const child = children.find((c) => c.id === childId);
    const linkedIds = new Set(child?.users.map((u) => u.user_id) ?? []);
    return allUsers.filter((u) => !linkedIds.has(u.id));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Add child form */}
      <form onSubmit={handleCreateChild} className="flex gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Child Name</label>
          <input
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="e.g. Emma"
            className="px-3 py-2 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Timezone</label>
          <input
            value={childTimezone}
            onChange={(e) => setChildTimezone(e.target.value)}
            placeholder="America/Los_Angeles"
            className="px-3 py-2 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !childName.trim()}
          className="px-4 py-2 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Adding...' : '+ Add Child'}
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {saveError && <p className="text-sm text-red-400">{saveError}</p>}

      {/* Table */}
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Timezone</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Linked Users</th>
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {children.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                  No children yet. Add one above.
                </td>
              </tr>
            )}
            {children.map((child) => (
              <React.Fragment key={child.id}>
                <tr
                  onClick={() => setExpandedChildId(expandedChildId === child.id ? null : child.id)}
                  className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30 cursor-pointer"
                >
                  <td className="px-4 py-3 text-slate-200 font-medium">{child.name}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono">{child.timezone}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {child.users.length === 0 && (
                        <span className="text-slate-600 text-xs">No users linked</span>
                      )}
                      {child.users.map((u) => (
                        <span key={u.user_id} className="bg-slate-800 text-slate-300 text-xs px-2 py-0.5 rounded">
                          {u.name}{u.role ? ` (${u.role})` : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => handleDeleteChild(e, child.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
                      title="Remove child"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {expandedChildId === child.id
                      ? <ChevronDown size={15} className="text-slate-400" />
                      : <ChevronRight size={15} className="text-slate-600" />}
                  </td>
                </tr>
                {expandedChildId === child.id && (
                  <tr key={`${child.id}-details`} className="border-b border-slate-800 bg-slate-800/20">
                    <td colSpan={5} className="px-8 py-4">
                      <div className="flex flex-col gap-4">
                        {/* Linked Users Section */}
                        <div>
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Linked Users</h4>
                          {linkError[child.id] && (
                            <p className="text-sm text-red-400 mb-2">{linkError[child.id]}</p>
                          )}
                          {child.users.length > 0 && (
                            <div className="flex flex-col gap-1 mb-2">
                              {child.users.map((u) => (
                                <div key={u.user_id} className="flex items-center gap-2">
                                  <span className="text-sm text-slate-300">{u.name}</span>
                                  {u.role && (
                                    <span className="text-xs text-slate-500">({u.role})</span>
                                  )}
                                  <button
                                    onClick={() => handleUnlinkUser(child.id, u.user_id)}
                                    className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
                                    title="Unlink user"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <form
                            onSubmit={(e) => { e.preventDefault(); handleLinkUser(child.id); }}
                            className="flex gap-2 items-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={linkUserId[child.id] ?? ''}
                              onChange={(e) => setLinkUserId((prev) => ({ ...prev, [child.id]: e.target.value }))}
                              className="px-3 py-1.5 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
                            >
                              <option value="">Select user...</option>
                              {availableUsers(child.id).map((u) => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                            <input
                              value={linkRole[child.id] ?? ''}
                              onChange={(e) => setLinkRole((prev) => ({ ...prev, [child.id]: e.target.value }))}
                              placeholder="Role (e.g. mom)"
                              className="px-3 py-1.5 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36"
                            />
                            <button
                              type="submit"
                              disabled={linking === child.id || !(linkUserId[child.id])}
                              className="px-3 py-1.5 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {linking === child.id ? 'Linking...' : '+ Link'}
                            </button>
                          </form>
                        </div>

                        {/* Preferences Section */}
                        <div>
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Favorite Characters</h4>
                          <CharactersPicker
                            key={`${child.id}-${(((child.preferences?.favorite_princesses ?? []) as string[]).join(','))}`}
                            childId={child.id}
                            personas={personas}
                            initialSelected={
                              Array.isArray(child.preferences?.favorite_princesses)
                                ? child.preferences.favorite_princesses as string[]
                                : []
                            }
                            onSave={handleSavePreferences}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add admin/app/children/page.tsx admin/components/ChildrenTable.tsx
git commit -m "feat: add Children admin page with user linking and preferences"
```

---

### Task 9: Update Users Admin Page

**Files:**
- Modify: `admin/app/users/page.tsx`
- Modify: `admin/components/UsersTable.tsx`

The Users page becomes simpler — no inline child creation. Expandable rows show read-only list of linked children with roles.

- [ ] **Step 1: Update UsersTable component**

Replace `admin/components/UsersTable.tsx`:

```typescript
'use client';

import React, { useState } from 'react';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { createUser, deleteUser, type User } from '@/lib/api';

interface LinkedChildInfo {
  child_id: string;
  child_name: string;
  role: string | null;
}

interface UserWithChildren extends User {
  children: LinkedChildInfo[];
}

interface Props {
  initialUsers: UserWithChildren[];
}

export function UsersTable({ initialUsers }: Props) {
  const [users, setUsers] = useState<UserWithChildren[]>(initialUsers);
  const [name, setName] = useState('');
  const [chatId, setChatId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !chatId.trim()) return;
    setSubmitting(true);
    setError(null);
    setNewToken(null);
    try {
      const user = await createUser(name.trim(), parseInt(chatId.trim(), 10));
      setUsers((prev) => [...prev, { ...user, children: [] }]);
      setNewToken(user.token);
      setName('');
      setChatId('');
    } catch (err: any) {
      setError(err.message || 'Failed to create user.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm('Remove this user? This cannot be undone.')) return;
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      if (expandedUserId === id) setExpandedUserId(null);
    } catch {
      setError('Failed to remove user.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Add user form */}
      <form onSubmit={handleCreate} className="flex gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Quy (Dad)"
            className="px-3 py-2 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Telegram Chat ID</label>
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="e.g. 5863873556"
            type="number"
            className="px-3 py-2 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !name.trim() || !chatId.trim()}
          className="px-4 py-2 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Adding...' : '+ Add User'}
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {newToken && (
        <div className="p-3 rounded-md bg-slate-800 border border-indigo-600 text-sm">
          <span className="text-slate-400">User created. Share this token for the frontend URL: </span>
          <code className="text-indigo-300 font-mono ml-1">{newToken}</code>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Telegram Chat ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Token</th>
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                  No users yet. Add one above.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <React.Fragment key={user.id}>
                <tr
                  onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}
                  className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30 cursor-pointer"
                >
                  <td className="px-4 py-3 text-slate-200 font-medium">{user.name}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono">{user.telegram_chat_id}</td>
                  <td className="px-4 py-3">
                    <code className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded font-mono">{user.token}</code>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => handleDelete(e, user.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
                      title="Remove user"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {expandedUserId === user.id
                      ? <ChevronDown size={15} className="text-slate-400" />
                      : <ChevronRight size={15} className="text-slate-600" />}
                  </td>
                </tr>
                {expandedUserId === user.id && (
                  <tr key={`${user.id}-children`} className="border-b border-slate-800 bg-slate-800/20">
                    <td colSpan={5} className="px-8 py-3">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Linked Children</h4>
                      {user.children.length === 0 ? (
                        <p className="text-sm text-slate-500">No children linked. Link children from the Children page.</p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {user.children.map((child) => (
                            <div key={child.child_id} className="flex items-center gap-2">
                              <span className="text-sm text-slate-300">{child.child_name}</span>
                              {child.role && (
                                <span className="text-xs text-slate-500">({child.role})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update Users page to pass linked children data**

The Users page needs to fetch children data and pass it through. We need a new backend endpoint or we can derive it from the children list. Since we already have `GET /admin/children` which returns children with users, we can invert that data client-side.

Update `admin/app/users/page.tsx`:

```typescript
import { listUsers, listChildrenAll, type User, type ChildWithUsers } from '@/lib/api';
import { UsersTable } from '@/components/UsersTable';

export const dynamic = 'force-dynamic';

interface LinkedChildInfo {
  child_id: string;
  child_name: string;
  role: string | null;
}

interface UserWithChildren extends User {
  children: LinkedChildInfo[];
}

export default async function UsersPage() {
  let usersWithChildren: UserWithChildren[] = [];
  try {
    const [users, allChildren] = await Promise.all([listUsers(), listChildrenAll()]);

    // Build user -> children mapping from the children data
    const userChildMap: Record<string, LinkedChildInfo[]> = {};
    for (const child of allChildren) {
      for (const u of child.users) {
        if (!userChildMap[u.user_id]) userChildMap[u.user_id] = [];
        userChildMap[u.user_id].push({
          child_id: child.id,
          child_name: child.name,
          role: u.role,
        });
      }
    }

    usersWithChildren = users.map((user) => ({
      ...user,
      children: userChildMap[user.id] ?? [],
    }));
  } catch {
    // backend unreachable during dev — start empty
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Topbar */}
      <div className="h-13 flex-shrink-0 flex items-center justify-between px-6 border-b"
        style={{ borderColor: 'var(--sidebar-border)', background: 'var(--topbar-bg)' }}>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-slate-100">Users</h1>
          <span className="text-xs text-slate-500">{usersWithChildren.length} registered</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <UsersTable initialUsers={usersWithChildren} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Delete the Characters page**

Remove `admin/app/characters/page.tsx` — its functionality is now in the ChildrenTable expandable row.

```bash
rm admin/app/characters/page.tsx
```

- [ ] **Step 4: Verify the admin app builds**

Run: `cd admin && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add admin/app/users/page.tsx admin/components/UsersTable.tsx admin/app/children/
git rm admin/app/characters/page.tsx
git commit -m "feat: redesign admin UI — children-centric with user linking"
```

---

### Task 10: Update Admin Root Redirect

**Files:**
- Check/Modify: `admin/app/page.tsx` or `admin/middleware.ts` or `admin/next.config.ts`

The admin root should redirect to `/children` instead of `/users`.

- [ ] **Step 1: Find and update the root redirect**

Check if there's a root page or redirect. If `admin/app/page.tsx` exists and redirects to `/users`, change it to `/children`. If there's a `middleware.ts`, update there.

If `admin/app/page.tsx` doesn't exist, create one:

```typescript
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/children');
}
```

- [ ] **Step 2: Commit**

```bash
git add admin/app/page.tsx
git commit -m "chore: redirect admin root to /children"
```

---

### Task 11: Update Frontend Story Requests

**Files:**
- Modify: Frontend files that call `POST /story` or `GET /story/today/{princess}` with `user_id`

- [ ] **Step 1: Check frontend for user_id references in story API calls**

Search the frontend for any fetch calls to `/story` that pass `user_id`. The `frontend/lib/user.ts` has `user_id` in the response type which is fine — that's the `/user/me` response.

Check the actual story-fetching code. If it passes `user_id` to story endpoints, remove that parameter. Keep `child_id`.

Run a search: `grep -rn "user_id" frontend/` to find all references. The `UserProfile.user_id` type can stay since `/user/me` still returns it.

- [ ] **Step 2: Commit if changes were needed**

```bash
git add frontend/
git commit -m "refactor: remove user_id from frontend story API calls"
```

---

### Task 12: Run Full Test Suite and Verify

- [ ] **Step 1: Run backend tests**

Run: `cd backend && uv run pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 2: Run admin build**

Run: `cd admin && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Run Docker compose to verify migration**

Run: `docker compose up --build`
Expected: All services start, migration 004 applies successfully, admin UI shows Children and Users pages.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve any remaining issues from children-centric refactor"
```
