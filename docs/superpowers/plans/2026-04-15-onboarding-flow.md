# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Telegram `/register <name>` and `/add-child` commands with a stateless HMAC-signed URL → web onboarding form → atomic reconcile on submit. Same URL works for initial setup and edits.

**Architecture:** Parent types `/register` → n8n calls `POST /user/register-link` (stateless, no DB) → bot replies with a URL carrying an HMAC token derived from `chat_id`. Form at `/[locale]/onboarding` reads token, calls `GET /user/me?token=X` (returns stub if chat_id unknown). Submit calls `PUT /user/me?token=X` which transactionally upserts user + reconciles children. Existing users get the same URL (deterministic token) for editing.

**Tech Stack:** FastAPI + psycopg2, Next.js 15 App Router + next-intl, n8n workflow JSON, PostgreSQL migrations via golang-migrate, vitest + pytest.

**Spec:** `docs/superpowers/specs/2026-04-15-onboarding-flow-design.md`

---

## File Structure

### Backend
- **Create:** `backend/utils/auth_token.py` — HMAC encode/decode utility
- **Create:** `backend/tests/test_utils/test_auth_token.py` — utility tests
- **Create:** `backend/db/migrations/005_drop_user_token.up.sql` — drop `users.token` column
- **Create:** `backend/db/migrations/005_drop_user_token.down.sql` — add column back
- **Modify:** `backend/routes/users.py` — add `/user/register-link`; rewrite `/user/me` GET; add `/user/me` PUT
- **Modify:** `backend/routes/admin.py` — remove `token` DB column refs; compute token on the fly
- **Create:** `backend/tests/test_user_routes.py` — user route tests
- **Modify:** `backend/tests/test_admin_routes.py` — update existing tests for computed token

### Frontend
- **Create:** `frontend/components/CharactersPicker.tsx` — port from admin, restyled
- **Create:** `frontend/tests/CharactersPicker.test.tsx` — picker tests
- **Modify:** `frontend/lib/user.ts` — add `updateUserProfile`, `fetchPersonas`, `Persona` type
- **Create:** `frontend/app/[locale]/onboarding/page.tsx` — onboarding form page
- **Create:** `frontend/tests/OnboardingPage.test.tsx` — page tests
- **Create:** `frontend/tests/lib/user.test.ts` — user lib tests (if not exists) OR modify existing
- **Modify:** `frontend/messages/en.json` — add `onboarding.*` keys
- **Modify:** `frontend/messages/vi.json` — add `onboarding.*` keys

### n8n
- **Modify:** `n8n/telegram-brief.json` — simplify `/register`, remove `/add-child`

### Config
- **Modify:** `backend/.env.example` — add new env vars
- **Modify:** `docker-compose.yml` — pass new env vars to backend + n8n
- **Modify:** `k8s/backend/deployment.yaml` — add new env vars
- **Modify:** `k8s/backend/externalsecret.yaml` — source secrets from vault
- **Modify:** `k8s/n8n/deployment.yaml` (if exists) — pass `N8N_SHARED_SECRET`

---

## Task 1: Build `auth_token` HMAC utility (TDD)

**Files:**
- Create: `backend/utils/auth_token.py`
- Create: `backend/tests/test_utils/test_auth_token.py`

Pure utility — no DB, no FastAPI. Produces `<b64url(payload)>.<b64url(hmac_sha256(payload, AUTH_SECRET))>`. Verifies with `hmac.compare_digest` for timing safety. Payload is `{"chat_id": <int>}` JSON with `sort_keys=True` for deterministic bytes.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_utils/test_auth_token.py`:

```python
import os
import pytest


@pytest.fixture(autouse=True)
def _auth_secret(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "test-secret-32-bytes-hex-placeholder")


def test_encode_decode_roundtrip():
    from backend.utils.auth_token import encode, decode
    token = encode(12345)
    assert decode(token) == 12345


def test_encode_is_deterministic():
    from backend.utils.auth_token import encode
    assert encode(42) == encode(42)


def test_encode_differs_per_chat_id():
    from backend.utils.auth_token import encode
    assert encode(1) != encode(2)


def test_decode_rejects_tampered_payload():
    from backend.utils.auth_token import encode, decode, InvalidTokenError
    token = encode(12345)
    payload_b64, sig = token.split(".", 1)
    # Swap for a different valid-looking payload but keep old signature
    tampered = encode(99999).split(".", 1)[0] + "." + sig
    with pytest.raises(InvalidTokenError):
        decode(tampered)


def test_decode_rejects_wrong_secret(monkeypatch):
    from backend.utils.auth_token import encode, decode, InvalidTokenError
    token = encode(12345)
    monkeypatch.setenv("AUTH_SECRET", "different-secret")
    # Clear module cache if module caches secret at import time
    import importlib, backend.utils.auth_token as at
    importlib.reload(at)
    with pytest.raises(InvalidTokenError):
        at.decode(token)


def test_decode_rejects_missing_signature():
    from backend.utils.auth_token import decode, InvalidTokenError
    with pytest.raises(InvalidTokenError):
        decode("no-dot-here")


def test_decode_rejects_malformed_b64():
    from backend.utils.auth_token import decode, InvalidTokenError
    with pytest.raises(InvalidTokenError):
        decode("!!!.!!!")


def test_decode_rejects_non_int_chat_id():
    from backend.utils.auth_token import _sign, InvalidTokenError, decode
    import base64, json
    # Craft a properly-signed payload whose chat_id is a string
    payload = json.dumps({"chat_id": "not-an-int"}, sort_keys=True).encode()
    payload_b64 = base64.urlsafe_b64encode(payload).rstrip(b"=").decode()
    sig_b64 = _sign(payload)
    token = f"{payload_b64}.{sig_b64}"
    with pytest.raises(InvalidTokenError):
        decode(token)


def test_missing_auth_secret_raises(monkeypatch):
    monkeypatch.delenv("AUTH_SECRET", raising=False)
    import importlib, backend.utils.auth_token as at
    with pytest.raises(RuntimeError, match="AUTH_SECRET"):
        importlib.reload(at)
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd backend && uv run pytest tests/test_utils/test_auth_token.py -v`
Expected: FAIL — module `backend.utils.auth_token` not found

- [ ] **Step 3: Implement utility**

Create `backend/utils/auth_token.py`:

```python
"""HMAC-signed stateless tokens for parent onboarding URLs.

Token format: <b64url(payload)>.<b64url(hmac_sha256(payload, AUTH_SECRET))>
Payload: {"chat_id": <int>} JSON with sort_keys=True (deterministic bytes).
Deterministic — same chat_id + same secret always produces the same token.
"""
import base64
import hashlib
import hmac
import json
import os


class InvalidTokenError(Exception):
    """Raised when a token fails validation (tampered, wrong secret, malformed)."""


def _load_secret() -> bytes:
    secret = os.environ.get("AUTH_SECRET")
    if not secret:
        raise RuntimeError("AUTH_SECRET environment variable is required")
    return secret.encode()


_SECRET = _load_secret()


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(data: str) -> bytes:
    padding = 4 - (len(data) % 4)
    return base64.urlsafe_b64decode(data + ("=" * padding))


def _sign(payload: bytes) -> str:
    sig = hmac.new(_SECRET, payload, hashlib.sha256).digest()
    return _b64url_encode(sig)


def encode(chat_id: int) -> str:
    """Produce a deterministic signed token for the given chat_id."""
    payload = json.dumps({"chat_id": int(chat_id)}, sort_keys=True).encode()
    return f"{_b64url_encode(payload)}.{_sign(payload)}"


def decode(token: str) -> int:
    """Verify signature and return chat_id; raise InvalidTokenError on any failure."""
    if not isinstance(token, str) or "." not in token:
        raise InvalidTokenError("Token must contain a '.' separator")
    payload_b64, sig_b64 = token.split(".", 1)
    try:
        payload_bytes = _b64url_decode(payload_b64)
    except Exception as exc:
        raise InvalidTokenError("Malformed payload base64") from exc
    expected_sig = _sign(payload_bytes)
    if not hmac.compare_digest(expected_sig, sig_b64):
        raise InvalidTokenError("Signature mismatch")
    try:
        data = json.loads(payload_bytes)
    except json.JSONDecodeError as exc:
        raise InvalidTokenError("Payload is not valid JSON") from exc
    chat_id = data.get("chat_id")
    if not isinstance(chat_id, int):
        raise InvalidTokenError("Payload chat_id must be an integer")
    return chat_id
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd backend && uv run pytest tests/test_utils/test_auth_token.py -v`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add backend/utils/auth_token.py backend/tests/test_utils/test_auth_token.py
git commit -m "feat(backend): add HMAC auth_token utility"
```

---

## Task 2: Drop `users.token` column and compute token on the fly

**Files:**
- Create: `backend/db/migrations/005_drop_user_token.up.sql`
- Create: `backend/db/migrations/005_drop_user_token.down.sql`
- Modify: `backend/routes/admin.py`
- Modify: `backend/tests/test_admin_routes.py`

Drop the DB column. Admin endpoints keep the `token` field in their response shape but populate it via `auth_token.encode(chat_id)`.

- [ ] **Step 1: Create up migration**

Create `backend/db/migrations/005_drop_user_token.up.sql`:

```sql
ALTER TABLE users DROP COLUMN token;
```

- [ ] **Step 2: Create down migration**

Create `backend/db/migrations/005_drop_user_token.down.sql`:

```sql
ALTER TABLE users ADD COLUMN token TEXT;
```

- [ ] **Step 3: Update failing admin tests first (TDD: tests describe the new behavior)**

Open `backend/tests/test_admin_routes.py`. Find `test_list_users_returns_rows`, `test_create_user_returns_created_user`, `test_create_user_fails_if_telegram_chat_id_exists`, `test_delete_user_returns_no_content` — any test that deals with `users.token` column shape.

Replace with the versions below:

```python
def test_list_users_returns_empty_list(mocker):
    _make_mock_conn(mocker, "backend.routes.admin.get_conn", fetchall=[])
    client = make_client(mocker)
    response = client.get("/admin/users")
    assert response.status_code == 200
    assert response.json() == []


def test_list_users_returns_rows(mocker, monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "test-secret-hex")
    _make_mock_conn(mocker, "backend.routes.admin.get_conn", fetchall=[
        # No token column in SELECT anymore
        ("uuid-1", "Quy", 12345, datetime(2026, 1, 1)),
    ])
    client = make_client(mocker)
    response = client.get("/admin/users")
    assert response.status_code == 200
    data = response.json()
    assert data[0]["name"] == "Quy"
    assert data[0]["telegram_chat_id"] == 12345
    # Token is computed, not from DB
    assert data[0]["token"].count(".") == 1


def test_create_user_returns_created_user(mocker, monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "test-secret-hex")
    mock_cursor = _make_mock_conn(mocker, "backend.routes.admin.get_conn")
    mock_cursor.fetchone.side_effect = [
        None,  # Uniqueness check: no existing user
        # INSERT result — no token column
        ("uuid-1", "Quy", 12345, datetime(2026, 1, 1)),
    ]
    client = make_client(mocker)
    response = client.post("/admin/users", json={"name": "Quy", "telegram_chat_id": 12345})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Quy"
    assert body["telegram_chat_id"] == 12345
    assert body["token"].count(".") == 1  # HMAC token shape


def test_create_user_rejects_missing_name(mocker):
    client = make_client(mocker)
    response = client.post("/admin/users", json={"telegram_chat_id": 12345})
    assert response.status_code == 422


def test_create_user_fails_if_telegram_chat_id_exists(mocker, monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "test-secret-hex")
    _make_mock_conn(mocker, "backend.routes.admin.get_conn",
                    fetchone=("uuid-existing",))
    client = make_client(mocker)
    response = client.post("/admin/users", json={"name": "New User", "telegram_chat_id": 12345})
    assert response.status_code == 400
    assert response.json()["detail"] == "Telegram chat ID already in use"
```

Leave `test_delete_user_returns_no_content` as-is if it doesn't reference token. Remove the `mocker.patch("backend.routes.admin.secrets.token_hex", ...)` line from `test_create_user_returns_created_user` if present.

- [ ] **Step 4: Run tests, verify they fail**

Run: `cd backend && uv run pytest tests/test_admin_routes.py -v`
Expected: 4 failures (tuple length mismatches because code still SELECTs the token column)

- [ ] **Step 5: Update `backend/routes/admin.py`**

Edit `backend/routes/admin.py`:

1. Remove `import secrets` at the top (no longer needed).
2. Add `from backend.utils.auth_token import encode as encode_token`.
3. Replace `admin_list_users`:

```python
@router.get("/users", response_model=list[UserResponse])
def admin_list_users():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, telegram_chat_id, created_at FROM users ORDER BY created_at")
            rows = cur.fetchall()
    return [
        {
            "id": str(r[0]),
            "name": r[1],
            "telegram_chat_id": r[2],
            "token": encode_token(r[2]),
            "created_at": r[3].isoformat(),
        }
        for r in rows
    ]
```

4. Replace `admin_create_user`:

```python
@router.post("/users", response_model=UserResponse, status_code=201)
def admin_create_user(req: CreateUserRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE telegram_chat_id = %s", (req.telegram_chat_id,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Telegram chat ID already in use")
            cur.execute(
                """INSERT INTO users (name, telegram_chat_id)
                   VALUES (%s, %s)
                   RETURNING id, name, telegram_chat_id, created_at""",
                (req.name, req.telegram_chat_id),
            )
            row = cur.fetchone()
    return {
        "id": str(row[0]),
        "name": row[1],
        "telegram_chat_id": row[2],
        "token": encode_token(row[2]),
        "created_at": row[3].isoformat(),
    }
```

`admin_delete_user` stays unchanged.

- [ ] **Step 6: Run tests, verify they pass**

Run: `cd backend && uv run pytest tests/test_admin_routes.py -v`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add backend/db/migrations/005_drop_user_token.up.sql \
        backend/db/migrations/005_drop_user_token.down.sql \
        backend/routes/admin.py \
        backend/tests/test_admin_routes.py
git commit -m "feat(backend): drop users.token column; compute token on the fly"
```

---

## Task 3: Add `POST /user/register-link` endpoint (TDD)

**Files:**
- Modify: `backend/routes/users.py`
- Create: `backend/tests/test_user_routes.py`

Stateless endpoint used by n8n to mint the onboarding URL. Gated by `N8N_SHARED_SECRET` header. No DB access.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_user_routes.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock
from datetime import datetime

_UNSET = object()


def _make_mock_conn(mocker, module_path, fetchone=_UNSET, fetchall=_UNSET):
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    mock_ctx = MagicMock()
    mock_ctx.__enter__ = MagicMock(return_value=mock_conn)
    mock_ctx.__exit__ = MagicMock(return_value=False)
    mocker.patch(module_path, return_value=mock_ctx)
    if fetchone is not _UNSET:
        mock_cursor.fetchone.return_value = fetchone
    if fetchall is not _UNSET:
        mock_cursor.fetchall.return_value = fetchall
    return mock_cursor


def make_client(mocker):
    mocker.patch("backend.routes.stories.royal_graph")
    from backend.main import app
    return TestClient(app)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "test-secret-hex")
    monkeypatch.setenv("N8N_SHARED_SECRET", "n8n-shared")
    monkeypatch.setenv("FRONTEND_URL", "https://example.test")


def test_register_link_rejects_missing_secret(mocker):
    client = make_client(mocker)
    r = client.post("/user/register-link", json={"telegram_chat_id": 42})
    assert r.status_code == 401


def test_register_link_rejects_wrong_secret(mocker):
    client = make_client(mocker)
    r = client.post("/user/register-link", json={"telegram_chat_id": 42},
                    headers={"X-N8N-Secret": "wrong"})
    assert r.status_code == 401


def test_register_link_returns_token_and_url(mocker):
    client = make_client(mocker)
    r = client.post("/user/register-link", json={"telegram_chat_id": 42},
                    headers={"X-N8N-Secret": "n8n-shared"})
    assert r.status_code == 200
    body = r.json()
    assert body["token"].count(".") == 1
    assert body["onboarding_url"] == f"https://example.test/onboarding?token={body['token']}"


def test_register_link_is_deterministic(mocker):
    client = make_client(mocker)
    r1 = client.post("/user/register-link", json={"telegram_chat_id": 42},
                     headers={"X-N8N-Secret": "n8n-shared"})
    r2 = client.post("/user/register-link", json={"telegram_chat_id": 42},
                     headers={"X-N8N-Secret": "n8n-shared"})
    assert r1.json()["token"] == r2.json()["token"]
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd backend && uv run pytest tests/test_user_routes.py -v`
Expected: FAIL — `/user/register-link` doesn't exist (404s)

- [ ] **Step 3: Add endpoint to `backend/routes/users.py`**

Add these imports at the top of `backend/routes/users.py`:

```python
import os
from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel

from backend.db.client import get_conn
from backend.utils.auth_token import encode as encode_token, decode as decode_token, InvalidTokenError
```

Add these models after existing ones:

```python
class RegisterLinkRequest(BaseModel):
    telegram_chat_id: int


class RegisterLinkResponse(BaseModel):
    token: str
    onboarding_url: str
```

Add this endpoint to the bottom of the file:

```python
@router.post("/register-link", response_model=RegisterLinkResponse)
def register_link(
    req: RegisterLinkRequest,
    x_n8n_secret: str | None = Header(default=None, alias="X-N8N-Secret"),
):
    expected = os.environ.get("N8N_SHARED_SECRET")
    if not expected or x_n8n_secret != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-N8N-Secret header")
    token = encode_token(req.telegram_chat_id)
    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    return {
        "token": token,
        "onboarding_url": f"{frontend_url}/onboarding?token={token}",
    }
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd backend && uv run pytest tests/test_user_routes.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/routes/users.py backend/tests/test_user_routes.py
git commit -m "feat(backend): add POST /user/register-link endpoint"
```

---

## Task 4: Rewrite `GET /user/me` to use HMAC token

**Files:**
- Modify: `backend/routes/users.py`
- Modify: `backend/tests/test_user_routes.py`

`/user/me` now decodes the HMAC token → looks up user by `telegram_chat_id`. Found → full profile. Not found → stub with `user_id: null`. Invalid token → 401.

- [ ] **Step 1: Add failing tests**

Append to `backend/tests/test_user_routes.py`:

```python
def test_user_me_invalid_token_returns_401(mocker):
    client = make_client(mocker)
    r = client.get("/user/me?token=not-a-token")
    assert r.status_code == 401


def test_user_me_unknown_chat_id_returns_stub(mocker):
    _make_mock_conn(mocker, "backend.routes.users.get_conn", fetchone=None)
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(999)
    r = client.get(f"/user/me?token={token}")
    assert r.status_code == 200
    body = r.json()
    assert body == {"user_id": None, "name": None, "children": []}


def test_user_me_known_chat_id_returns_profile(mocker):
    mock_cursor = _make_mock_conn(mocker, "backend.routes.users.get_conn")
    mock_cursor.fetchone.return_value = ("uuid-user", "Parent Name")
    mock_cursor.fetchall.return_value = [
        ("uuid-child-1", "Emma", {"favorite_princesses": ["elsa", "belle"]}),
        ("uuid-child-2", "Lily", {"favorite_princesses": []}),
    ]
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(123)
    r = client.get(f"/user/me?token={token}")
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == "uuid-user"
    assert body["name"] == "Parent Name"
    assert len(body["children"]) == 2
    assert body["children"][0]["name"] == "Emma"
    assert body["children"][0]["preferences"]["favorite_princesses"] == ["elsa", "belle"]
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd backend && uv run pytest tests/test_user_routes.py -v`
Expected: 3 new failures (old endpoint behavior doesn't match)

- [ ] **Step 3: Update `UserMeResponse` and rewrite `get_user_by_token`**

In `backend/routes/users.py`, change `UserMeResponse`:

```python
class ChildInfo(BaseModel):
    id: str
    name: str
    preferences: dict


class UserMeResponse(BaseModel):
    user_id: str | None
    name: str | None
    children: list[ChildInfo]
```

Replace the existing `get_user_by_token` function:

```python
@router.get("/me", response_model=UserMeResponse)
def get_user_by_token(token: str = Query(...)):
    try:
        chat_id = decode_token(token)
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM users WHERE telegram_chat_id = %s", (chat_id,))
            user_row = cur.fetchone()
            if not user_row:
                return {"user_id": None, "name": None, "children": []}
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

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd backend && uv run pytest tests/test_user_routes.py -v`
Expected: 7 passed total

- [ ] **Step 5: Commit**

```bash
git add backend/routes/users.py backend/tests/test_user_routes.py
git commit -m "feat(backend): rewrite GET /user/me to use HMAC token"
```

---

## Task 5: Add `PUT /user/me` reconcile endpoint (TDD)

**Files:**
- Modify: `backend/routes/users.py`
- Modify: `backend/tests/test_user_routes.py`

Transactional upsert + child reconcile. On first submit, creates user row + children. On subsequent edits, updates name, upserts children by id, deletes children not in the list (with mem0 cleanup).

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_user_routes.py`:

```python
def test_put_user_me_rejects_invalid_token(mocker):
    client = make_client(mocker)
    r = client.put("/user/me?token=bogus", json={"name": "X", "children": []})
    assert r.status_code == 401


def test_put_user_me_requires_at_least_one_child(mocker):
    mocker.patch("backend.routes.users.list_personas_ids", return_value={"elsa", "belle"})
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(42)
    r = client.put(f"/user/me?token={token}", json={"name": "Parent", "children": []})
    assert r.status_code == 422


def test_put_user_me_rejects_empty_name(mocker):
    mocker.patch("backend.routes.users.list_personas_ids", return_value={"elsa"})
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(42)
    r = client.put(
        f"/user/me?token={token}",
        json={"name": "  ", "children": [{"id": None, "name": "Emma",
              "preferences": {"favorite_princesses": []}}]},
    )
    assert r.status_code == 422


def test_put_user_me_rejects_unknown_persona(mocker):
    mocker.patch("backend.routes.users.list_personas_ids", return_value={"elsa"})
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(42)
    r = client.put(
        f"/user/me?token={token}",
        json={"name": "Parent", "children": [{"id": None, "name": "Emma",
              "preferences": {"favorite_princesses": ["olaf"]}}]},
    )
    assert r.status_code == 422
    assert "olaf" in r.json()["detail"].lower()


def test_put_user_me_rejects_too_many_favorites(mocker):
    mocker.patch("backend.routes.users.list_personas_ids",
                 return_value={"a", "b", "c", "d", "e", "f"})
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(42)
    r = client.put(
        f"/user/me?token={token}",
        json={"name": "Parent", "children": [{"id": None, "name": "Emma",
              "preferences": {"favorite_princesses": ["a", "b", "c", "d", "e", "f"]}}]},
    )
    assert r.status_code == 422


def test_put_user_me_initial_onboarding_creates_user_and_children(mocker):
    mocker.patch("backend.routes.users.list_personas_ids", return_value={"elsa", "belle"})
    mocker.patch("backend.routes.users.delete_child_memories")  # no-op
    mock_cursor = _make_mock_conn(mocker, "backend.routes.users.get_conn")
    # Sequence of fetchone() calls during PUT transaction:
    # 1. SELECT existing user by chat_id → None (new)
    # 2. INSERT users RETURNING → ("uuid-user", "Parent Name")
    # 3. Duplicate-name check for "Emma" → None (no duplicate)
    # 4. INSERT children RETURNING → ("uuid-child-1",)
    # 5. Final SELECT user for response → ("uuid-user", "Parent Name")
    mock_cursor.fetchone.side_effect = [
        None,
        ("uuid-user", "Parent Name"),
        None,
        ("uuid-child-1",),
        ("uuid-user", "Parent Name"),
    ]
    # Final SELECT children returns the newly-linked child
    mock_cursor.fetchall.side_effect = [
        [],  # existing children before reconcile
        [("uuid-child-1", "Emma", {"favorite_princesses": ["elsa"]})],  # final read
    ]
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(42)
    r = client.put(
        f"/user/me?token={token}",
        json={
            "name": "Parent Name",
            "children": [{"id": None, "name": "Emma",
                          "preferences": {"favorite_princesses": ["elsa"]}}],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == "uuid-user"
    assert body["name"] == "Parent Name"
    assert body["children"][0]["name"] == "Emma"


def test_put_user_me_edit_removes_child(mocker):
    mocker.patch("backend.routes.users.list_personas_ids", return_value={"elsa"})
    mock_mem = mocker.patch("backend.routes.users.delete_child_memories")
    mock_cursor = _make_mock_conn(mocker, "backend.routes.users.get_conn")
    mock_cursor.fetchone.side_effect = [
        ("uuid-user", "Parent Name"),  # existing user
        ("uuid-user", "Parent Name"),  # UPDATE users RETURNING
        ("uuid-user", "Parent Name"),  # final SELECT user
    ]
    mock_cursor.fetchall.side_effect = [
        [("uuid-child-1",), ("uuid-child-2",)],  # existing linked children
        [("uuid-child-1", "Emma", {"favorite_princesses": []})],  # final read
    ]
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(42)
    r = client.put(
        f"/user/me?token={token}",
        json={
            "name": "Parent Name",
            "children": [
                {"id": "uuid-child-1", "name": "Emma",
                 "preferences": {"favorite_princesses": []}},
            ],
        },
    )
    assert r.status_code == 200
    mock_mem.assert_called_once_with("uuid-child-2")


def test_put_user_me_rejects_duplicate_child_name(mocker):
    mocker.patch("backend.routes.users.list_personas_ids", return_value={"elsa"})
    mock_cursor = _make_mock_conn(mocker, "backend.routes.users.get_conn")
    mock_cursor.fetchone.side_effect = [
        None,  # existing user lookup: new
        ("uuid-user", "Parent"),  # INSERT users RETURNING
    ]
    mock_cursor.fetchall.side_effect = [[]]  # no existing children
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(42)
    r = client.put(
        f"/user/me?token={token}",
        json={
            "name": "Parent",
            "children": [
                {"id": None, "name": "Emma", "preferences": {"favorite_princesses": []}},
                {"id": None, "name": "Emma", "preferences": {"favorite_princesses": []}},
            ],
        },
    )
    assert r.status_code == 409
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd backend && uv run pytest tests/test_user_routes.py -v`
Expected: 8 new failures (PUT endpoint + helpers don't exist)

- [ ] **Step 3: Add persona helper and mem0 helper**

In `backend/routes/users.py`, add:

```python
import glob
import json as json_module
import os as os_module  # avoid name clash with imported os above

import yaml

from backend.utils.mem0_client import get_memory


def list_personas_ids() -> set[str]:
    """Return set of valid persona ids (YAML basenames in backend/personas)."""
    personas_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "personas")
    ids = set()
    for path in glob.glob(os.path.join(personas_dir, "*.yaml")):
        ids.add(os.path.splitext(os.path.basename(path))[0])
    return ids


def delete_child_memories(child_id: str) -> None:
    """Best-effort purge of mem0 memories for a deleted child."""
    try:
        mem = get_memory()
        mem.delete_all(user_id=str(child_id))
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("mem0 delete_all failed for child %s: %s", child_id, exc)
```

- [ ] **Step 4: Add PUT request models**

Append to the models section:

```python
class ChildPreferences(BaseModel):
    favorite_princesses: list[str] = []


class ChildUpdate(BaseModel):
    id: str | None = None
    name: str
    preferences: ChildPreferences


class UpdateUserRequest(BaseModel):
    name: str
    children: list[ChildUpdate]
```

- [ ] **Step 5: Implement PUT endpoint**

Append to the bottom of `backend/routes/users.py`:

```python
MAX_FAVORITES = 5


@router.put("/me", response_model=UserMeResponse)
def put_user_me(req: UpdateUserRequest, token: str = Query(...)):
    try:
        chat_id = decode_token(token)
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name must not be empty")
    if not req.children:
        raise HTTPException(status_code=422, detail="At least one child is required")

    valid_personas = list_personas_ids()
    # Validate each child up-front
    seen_names: set[str] = set()
    for c in req.children:
        cname = (c.name or "").strip()
        if not cname:
            raise HTTPException(status_code=422, detail="Each child must have a name")
        if cname.lower() in seen_names:
            raise HTTPException(status_code=409, detail=f"You already have a child named '{cname}'")
        seen_names.add(cname.lower())
        if len(c.preferences.favorite_princesses) > MAX_FAVORITES:
            raise HTTPException(status_code=422, detail=f"At most {MAX_FAVORITES} favorite characters per child")
        for pid in c.preferences.favorite_princesses:
            if pid not in valid_personas:
                raise HTTPException(status_code=422, detail=f"Unknown character: {pid}")

    removed_child_ids: list[str] = []

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Upsert user
            cur.execute("SELECT id, name FROM users WHERE telegram_chat_id = %s", (chat_id,))
            user_row = cur.fetchone()
            if user_row is None:
                cur.execute(
                    """INSERT INTO users (telegram_chat_id, name)
                       VALUES (%s, %s)
                       RETURNING id, name""",
                    (chat_id, name),
                )
                user_row = cur.fetchone()
            else:
                cur.execute(
                    "UPDATE users SET name = %s WHERE id = %s RETURNING id, name",
                    (name, str(user_row[0])),
                )
                user_row = cur.fetchone()
            user_id = str(user_row[0])

            # Existing children
            cur.execute(
                "SELECT child_id FROM user_children WHERE user_id = %s",
                (user_id,),
            )
            existing_ids = {str(r[0]) for r in cur.fetchall()}
            submitted_ids = {c.id for c in req.children if c.id}

            # Reconcile each submitted child
            for c in req.children:
                cname = c.name.strip()
                prefs_json = json_module.dumps({"favorite_princesses": c.preferences.favorite_princesses})
                if c.id and c.id in existing_ids:
                    # Update existing child
                    cur.execute(
                        """UPDATE children SET name = %s, preferences = %s
                           WHERE id = %s""",
                        (cname, prefs_json, c.id),
                    )
                else:
                    # Create child + link
                    cur.execute(
                        """INSERT INTO children (name, preferences)
                           VALUES (%s, %s)
                           RETURNING id""",
                        (cname, prefs_json),
                    )
                    new_id = str(cur.fetchone()[0])
                    cur.execute(
                        """INSERT INTO user_children (user_id, child_id) VALUES (%s, %s)""",
                        (user_id, new_id),
                    )

            # Delete children no longer in list
            to_remove = existing_ids - submitted_ids
            for rid in to_remove:
                cur.execute("DELETE FROM children WHERE id = %s", (rid,))
                removed_child_ids.append(rid)

            # Final read
            cur.execute("SELECT id, name FROM users WHERE id = %s", (user_id,))
            final_user = cur.fetchone()
            cur.execute(
                """SELECT c.id, c.name, c.preferences FROM children c
                   JOIN user_children uc ON c.id = uc.child_id
                   WHERE uc.user_id = %s ORDER BY c.created_at""",
                (user_id,),
            )
            child_rows = cur.fetchall()

    # Mem0 cleanup (best-effort, after transaction)
    for cid in removed_child_ids:
        delete_child_memories(cid)

    return {
        "user_id": str(final_user[0]),
        "name": final_user[1],
        "children": [
            {"id": str(r[0]), "name": r[1], "preferences": r[2]}
            for r in child_rows
        ],
    }
```

- [ ] **Step 6: Run tests, verify they pass**

Run: `cd backend && uv run pytest tests/test_user_routes.py -v`
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add backend/routes/users.py backend/tests/test_user_routes.py
git commit -m "feat(backend): add PUT /user/me reconcile endpoint"
```

---

## Task 6: Port `CharactersPicker` component to frontend (TDD)

**Files:**
- Create: `frontend/components/CharactersPicker.tsx`
- Create: `frontend/tests/CharactersPicker.test.tsx`

Multi-select chips, max 5, tap to toggle. Styled with enchanted-glassmorphism tokens (different from admin's purple theme).

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/CharactersPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharactersPicker } from '@/components/CharactersPicker';

const personas = [
  { id: 'elsa', name: 'Elsa' },
  { id: 'belle', name: 'Belle' },
  { id: 'ariel', name: 'Ariel' },
  { id: 'moana', name: 'Moana' },
  { id: 'raya', name: 'Raya' },
  { id: 'mirabel', name: 'Mirabel' },
];

describe('CharactersPicker', () => {
  it('renders all personas as chips', () => {
    render(<CharactersPicker personas={personas} value={[]} onChange={() => {}} />);
    personas.forEach((p) => {
      expect(screen.getByText(p.name)).toBeInTheDocument();
    });
  });

  it('toggles selection on click', () => {
    const onChange = vi.fn();
    render(<CharactersPicker personas={personas} value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Elsa'));
    expect(onChange).toHaveBeenCalledWith(['elsa']);
  });

  it('removes a chip when clicked again', () => {
    const onChange = vi.fn();
    render(<CharactersPicker personas={personas} value={['elsa']} onChange={onChange} />);
    fireEvent.click(screen.getByText('Elsa'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('disables unselected chips when 5 already selected', () => {
    const onChange = vi.fn();
    render(
      <CharactersPicker
        personas={personas}
        value={['elsa', 'belle', 'ariel', 'moana', 'raya']}
        onChange={onChange}
      />,
    );
    // The 6th (mirabel) chip should be disabled
    const mirabel = screen.getByText('Mirabel').closest('button')!;
    expect(mirabel).toBeDisabled();
    // Clicking a selected chip still works (to unselect)
    fireEvent.click(screen.getByText('Elsa'));
    expect(onChange).toHaveBeenCalled();
  });

  it('shows selected count hint', () => {
    render(<CharactersPicker personas={personas} value={['elsa', 'belle']} onChange={() => {}} />);
    expect(screen.getByText(/2 \/ 5/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd frontend && npx vitest run tests/CharactersPicker.test.tsx`
Expected: FAIL — module `@/components/CharactersPicker` not found

- [ ] **Step 3: Implement component**

Create `frontend/components/CharactersPicker.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';

const MAX_FAVORITES = 5;

export interface Persona {
  id: string;
  name: string;
}

interface Props {
  personas: Persona[];
  value: string[];
  onChange: (next: string[]) => void;
}

export function CharactersPicker({ personas, value, onChange }: Props) {
  const t = useTranslations('onboarding');

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      if (value.length >= MAX_FAVORITES) return;
      onChange([...value, id]);
    }
  }

  const atMax = value.length >= MAX_FAVORITES;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-white/60">
        <span className="text-white font-medium">
          {t('favoritesCount', { selected: value.length, max: MAX_FAVORITES })}
        </span>
        {value.length === 0 && <span className="ml-2 text-white/40">{t('favoritesEmptyHint')}</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {personas.map((p) => {
          const selected = value.includes(p.id);
          const disabled = !selected && atMax;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              disabled={disabled}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                selected
                  ? 'bg-[var(--color-gold)]/20 border-[var(--color-gold)] text-white'
                  : 'bg-white/5 border-white/20 text-white/70 hover:border-white/40',
                disabled ? 'opacity-40 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add required i18n keys (minimal, just to make tests pass)**

Edit `frontend/messages/en.json` — add to the top-level object:

```json
"onboarding": {
  "favoritesCount": "{selected} / {max} selected",
  "favoritesEmptyHint": "shows all"
}
```

Edit `frontend/messages/vi.json` with the same keys and Vietnamese translations:

```json
"onboarding": {
  "favoritesCount": "Đã chọn {selected} / {max}",
  "favoritesEmptyHint": "hiện tất cả"
}
```

(Full onboarding messages are added in Task 9; these are just the ones the picker needs.)

- [ ] **Step 5: Run tests, verify they pass**

Run: `cd frontend && npx vitest run tests/CharactersPicker.test.tsx`
Expected: 5 passed

- [ ] **Step 6: Commit**

```bash
git add frontend/components/CharactersPicker.tsx \
        frontend/tests/CharactersPicker.test.tsx \
        frontend/messages/en.json frontend/messages/vi.json
git commit -m "feat(frontend): add CharactersPicker component"
```

---

## Task 7: Add `updateUserProfile` and `fetchPersonas` to `lib/user.ts` (TDD)

**Files:**
- Modify: `frontend/lib/user.ts`
- Create: `frontend/tests/lib/user.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/lib/user.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateUserProfile, fetchPersonas } from '@/lib/user';

describe('updateUserProfile', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('PUTs to /user/me with token and JSON body', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user_id: 'u1',
        name: 'Parent',
        children: [{ id: 'c1', name: 'Emma', preferences: { favorite_princesses: ['elsa'] } }],
      }),
    });
    const result = await updateUserProfile('tok', {
      name: 'Parent',
      children: [{ id: null, name: 'Emma', preferences: { favorite_princesses: ['elsa'] } }],
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/user\/me\?token=tok$/),
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Parent',
          children: [{ id: null, name: 'Emma', preferences: { favorite_princesses: ['elsa'] } }],
        }),
      }),
    );
    expect(result).toEqual({
      profile: {
        user_id: 'u1',
        name: 'Parent',
        children: [{ id: 'c1', name: 'Emma', preferences: { favorite_princesses: ['elsa'] } }],
      },
      error: null,
    });
  });

  it('returns error with status and message on 4xx', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ detail: "You already have a child named 'Emma'" }),
    });
    const result = await updateUserProfile('tok', {
      name: 'Parent',
      children: [{ id: null, name: 'Emma', preferences: { favorite_princesses: [] } }],
    });
    expect(result.profile).toBeNull();
    expect(result.error).toEqual({ status: 409, detail: "You already have a child named 'Emma'" });
  });
});

describe('fetchPersonas', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('GETs /admin/personas and returns the list', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'elsa', name: 'Elsa' }, { id: 'belle', name: 'Belle' }],
    });
    const personas = await fetchPersonas();
    expect(personas).toHaveLength(2);
    expect(personas[0].id).toBe('elsa');
  });

  it('returns empty array on failure', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false });
    const personas = await fetchPersonas();
    expect(personas).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd frontend && npx vitest run tests/lib/user.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement helpers**

Append to `frontend/lib/user.ts`:

```ts
export interface Persona {
  id: string;
  name: string;
}

export interface UpdateUserPayload {
  name: string;
  children: Array<{
    id: string | null;
    name: string;
    preferences: { favorite_princesses: string[] };
  }>;
}

export interface UpdateUserError {
  status: number;
  detail: string;
}

export interface UpdateUserResult {
  profile: UserProfile | null;
  error: UpdateUserError | null;
}

export async function updateUserProfile(
  token: string,
  payload: UpdateUserPayload,
): Promise<UpdateUserResult> {
  try {
    const res = await fetch(`${API_URL}/user/me?token=${encodeURIComponent(token)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      let detail = 'Request failed';
      try {
        const body = await res.json();
        if (typeof body?.detail === 'string') detail = body.detail;
      } catch {
        // ignore
      }
      return { profile: null, error: { status: res.status, detail } };
    }
    const profile = (await res.json()) as UserProfile;
    return { profile, error: null };
  } catch (exc) {
    return { profile: null, error: { status: 0, detail: 'Network error' } };
  }
}

export async function fetchPersonas(): Promise<Persona[]> {
  try {
    const res = await fetch(`${API_URL}/admin/personas`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return [];
    return (await res.json()) as Persona[];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd frontend && npx vitest run tests/lib/user.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/user.ts frontend/tests/lib/user.test.ts
git commit -m "feat(frontend): add updateUserProfile and fetchPersonas helpers"
```

---

## Task 8: Build onboarding page (TDD)

**Files:**
- Create: `frontend/app/[locale]/onboarding/page.tsx`
- Create: `frontend/tests/OnboardingPage.test.tsx`

Form with parent name input, child list, per-child character picker, add/remove child buttons, confirm modal for existing-child deletion, submit that calls `updateUserProfile` and redirects.

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/OnboardingPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OnboardingPage from '@/app/[locale]/onboarding/page';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    if (!vars) return key;
    return `${key}:${JSON.stringify(vars)}`;
  },
}));

const mockFetchProfile = vi.fn();
const mockUpdate = vi.fn();
const mockFetchPersonas = vi.fn();

vi.mock('@/lib/user', async () => {
  const actual = await vi.importActual<typeof import('@/lib/user')>('@/lib/user');
  return {
    ...actual,
    fetchUserProfile: (...args: unknown[]) => mockFetchProfile(...args),
    updateUserProfile: (...args: unknown[]) => mockUpdate(...args),
    fetchPersonas: (...args: unknown[]) => mockFetchPersonas(...args),
    getStoredToken: () => 'stored-tok',
    getTokenFromUrl: () => null,
    storeToken: vi.fn(),
  };
});

beforeEach(() => {
  mockPush.mockReset();
  mockFetchProfile.mockReset();
  mockUpdate.mockReset();
  mockFetchPersonas.mockReset();
  mockFetchPersonas.mockResolvedValue([
    { id: 'elsa', name: 'Elsa' },
    { id: 'belle', name: 'Belle' },
  ]);
});

describe('OnboardingPage', () => {
  it('renders empty form when user_id is null', async () => {
    mockFetchProfile.mockResolvedValue({ user_id: null, name: null, children: [] });
    render(<OnboardingPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
    });
    // No child cards until Add Child clicked
    expect(screen.queryByLabelText(/child name/i)).not.toBeInTheDocument();
  });

  it('pre-fills form for existing user', async () => {
    mockFetchProfile.mockResolvedValue({
      user_id: 'u1',
      name: 'Parent',
      children: [
        { id: 'c1', name: 'Emma', preferences: { favorite_princesses: ['elsa'] } },
      ],
    });
    render(<OnboardingPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Parent')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Emma')).toBeInTheDocument();
    });
  });

  it('validates required fields on submit', async () => {
    mockFetchProfile.mockResolvedValue({ user_id: null, name: null, children: [] });
    render(<OnboardingPage />);
    await waitFor(() => screen.getByLabelText(/your name/i));
    fireEvent.click(screen.getByRole('button', { name: /save & continue/i }));
    // Did not call update — form invalid
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('submits valid data and redirects to pick-child', async () => {
    mockFetchProfile.mockResolvedValue({ user_id: null, name: null, children: [] });
    mockUpdate.mockResolvedValue({ profile: { user_id: 'u1', name: 'P', children: [] }, error: null });
    render(<OnboardingPage />);
    await waitFor(() => screen.getByLabelText(/your name/i));

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Parent' } });
    fireEvent.click(screen.getByRole('button', { name: /add child/i }));
    fireEvent.change(screen.getByLabelText(/child name/i), { target: { value: 'Emma' } });
    fireEvent.click(screen.getByRole('button', { name: /save & continue/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('stored-tok', {
        name: 'Parent',
        children: [
          { id: null, name: 'Emma', preferences: { favorite_princesses: [] } },
        ],
      });
      expect(mockPush).toHaveBeenCalledWith('/en/pick-child');
    });
  });

  it('shows confirm modal before removing existing child', async () => {
    mockFetchProfile.mockResolvedValue({
      user_id: 'u1',
      name: 'Parent',
      children: [{ id: 'c1', name: 'Emma', preferences: { favorite_princesses: [] } }],
    });
    render(<OnboardingPage />);
    await waitFor(() => screen.getByDisplayValue('Emma'));
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    // Confirm dialog appears
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('removes new (unsaved) child without confirmation', async () => {
    mockFetchProfile.mockResolvedValue({ user_id: null, name: null, children: [] });
    render(<OnboardingPage />);
    await waitFor(() => screen.getByLabelText(/your name/i));
    fireEvent.click(screen.getByRole('button', { name: /add child/i }));
    expect(screen.getByLabelText(/child name/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(screen.queryByLabelText(/child name/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd frontend && npx vitest run tests/OnboardingPage.test.tsx`
Expected: FAIL — page module does not exist

- [ ] **Step 3: Implement page**

Create `frontend/app/[locale]/onboarding/page.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  getStoredToken,
  getTokenFromUrl,
  storeToken,
  fetchUserProfile,
  updateUserProfile,
  fetchPersonas,
  type Persona,
  type UserProfile,
} from '@/lib/user';
import { CharactersPicker } from '@/components/CharactersPicker';

const MAX_FAVORITES = 5;

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface ChildDraft {
  id: string | null;
  localKey: string;
  name: string;
  favoritePrincesses: string[];
}

interface FormState {
  parentName: string;
  children: ChildDraft[];
}

export default function OnboardingPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('onboarding');

  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ChildDraft | null>(null);

  const [form, setForm] = useState<FormState>({ parentName: '', children: [] });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function resolve() {
      let tok = getStoredToken();
      if (!tok) {
        const urlTok = getTokenFromUrl();
        if (urlTok) {
          storeToken(urlTok);
          tok = urlTok;
        }
      }
      if (!tok) {
        setLoading(false);
        return;
      }
      setToken(tok);
      const [p, ps] = await Promise.all([fetchUserProfile(tok), fetchPersonas()]);
      setProfile(p);
      setPersonas(ps);
      if (p) {
        setForm({
          parentName: p.name ?? '',
          children: p.children.map((c) => ({
            id: c.id,
            localKey: c.id,
            name: c.name,
            favoritePrincesses: c.preferences?.favorite_princesses ?? [],
          })),
        });
      }
      setLoading(false);
    }
    resolve();
  }, []);

  const isEdit = profile?.user_id != null;
  const heading = isEdit ? t('headingEdit') : t('headingNew');

  const addChild = useCallback(() => {
    setForm((f) => ({
      ...f,
      children: [
        ...f.children,
        { id: null, localKey: uuid(), name: '', favoritePrincesses: [] },
      ],
    }));
  }, []);

  const removeChildByKey = useCallback((key: string) => {
    setForm((f) => ({ ...f, children: f.children.filter((c) => c.localKey !== key) }));
  }, []);

  const requestRemoveChild = useCallback((child: ChildDraft) => {
    if (child.id === null) {
      removeChildByKey(child.localKey);
    } else {
      setConfirmRemove(child);
    }
  }, [removeChildByKey]);

  const confirmRemoval = useCallback(() => {
    if (confirmRemove) {
      removeChildByKey(confirmRemove.localKey);
      setConfirmRemove(null);
    }
  }, [confirmRemove, removeChildByKey]);

  function updateChild(key: string, patch: Partial<ChildDraft>) {
    setForm((f) => ({
      ...f,
      children: f.children.map((c) => (c.localKey === key ? { ...c, ...patch } : c)),
    }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.parentName.trim()) errs.parentName = t('errParentNameRequired');
    if (form.children.length === 0) errs.children = t('errNoChildren');
    form.children.forEach((c) => {
      if (!c.name.trim()) errs[`child:${c.localKey}`] = t('errChildNameRequired');
    });
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitError(null);
    if (!validate()) return;
    setSubmitting(true);
    const result = await updateUserProfile(token, {
      name: form.parentName.trim(),
      children: form.children.map((c) => ({
        id: c.id,
        name: c.name.trim(),
        preferences: { favorite_princesses: c.favoritePrincesses },
      })),
    });
    setSubmitting(false);
    if (result.error) {
      if (result.error.status === 401) setSubmitError(t('errExpired'));
      else if (result.error.status === 409) setSubmitError(result.error.detail);
      else setSubmitError(result.error.detail || t('errGeneric'));
      return;
    }
    router.push(`/${locale}/pick-child`);
  }

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--color-gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-8 text-center">
        <p className="text-white/70">{t('errExpired')}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-10">
      <h1
        className="text-3xl font-black tracking-tight text-white mb-2 text-center"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        {heading}
      </h1>
      <p className="text-white/50 text-sm font-medium mb-8 text-center">{t('subheading')}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 w-full max-w-md">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-white/80">{t('yourName')}</span>
          <input
            type="text"
            aria-label={t('yourName')}
            value={form.parentName}
            onChange={(e) => setForm((f) => ({ ...f, parentName: e.target.value }))}
            className="glass-card px-4 py-3 text-white rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-gold)]"
          />
          {fieldErrors.parentName && (
            <span className="text-xs text-red-300">{fieldErrors.parentName}</span>
          )}
        </label>

        <div className="flex flex-col gap-4">
          {form.children.map((c) => (
            <div key={c.localKey} className="glass-card p-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-white/80">{t('childName')}</span>
                <input
                  type="text"
                  aria-label={t('childName')}
                  value={c.name}
                  onChange={(e) => updateChild(c.localKey, { name: e.target.value })}
                  className="bg-white/5 border border-white/15 px-3 py-2 rounded-lg text-white outline-none focus:ring-2 focus:ring-[var(--color-gold)]"
                />
                {fieldErrors[`child:${c.localKey}`] && (
                  <span className="text-xs text-red-300">{fieldErrors[`child:${c.localKey}`]}</span>
                )}
              </label>
              <div className="flex flex-col gap-2">
                <span className="text-sm text-white/80">{t('favoriteCharacters')}</span>
                <CharactersPicker
                  personas={personas}
                  value={c.favoritePrincesses}
                  onChange={(next) => updateChild(c.localKey, { favoritePrincesses: next })}
                />
              </div>
              <button
                type="button"
                onClick={() => requestRemoveChild(c)}
                className="text-xs text-red-300 hover:text-red-200 self-end"
              >
                {t('remove')}
              </button>
            </div>
          ))}
          {fieldErrors.children && (
            <span className="text-xs text-red-300">{fieldErrors.children}</span>
          )}
          <button
            type="button"
            onClick={addChild}
            className="glass-card px-4 py-3 text-white/90 rounded-xl hover:glass-card-hover"
          >
            + {t('addChild')}
          </button>
        </div>

        {submitError && (
          <div className="bg-red-500/20 border border-red-500/40 px-4 py-3 rounded-xl text-red-100 text-sm">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="gold-gradient-bg px-6 py-4 rounded-xl text-[#1a0533] font-black disabled:opacity-50"
        >
          {submitting ? t('saving') : t('saveAndContinue')}
        </button>
      </form>

      {confirmRemove && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-50"
        >
          <div className="glass-card p-6 rounded-2xl max-w-sm w-full flex flex-col gap-4">
            <h2 className="text-lg font-bold text-white">{t('confirmRemoveTitle')}</h2>
            <p className="text-sm text-white/80">
              {t('confirmRemoveBody', { name: confirmRemove.name })}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="px-4 py-2 rounded-lg text-white/80 hover:text-white"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={confirmRemoval}
                className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-100 hover:bg-red-500/30"
              >
                {t('confirmRemove')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Add remaining onboarding i18n keys (minimum for tests — full set in Task 9)**

Edit `frontend/messages/en.json`, extend the `onboarding` block (leaving `favoritesCount` and `favoritesEmptyHint` from Task 6):

```json
"onboarding": {
  "favoritesCount": "{selected} / {max} selected",
  "favoritesEmptyHint": "shows all",
  "headingNew": "Your Family",
  "headingEdit": "Edit Your Family",
  "subheading": "Tell us about your children",
  "yourName": "Your name",
  "childName": "Child name",
  "favoriteCharacters": "Favorite characters",
  "addChild": "Add Child",
  "remove": "Remove",
  "saving": "Saving...",
  "saveAndContinue": "Save & Continue",
  "cancel": "Cancel",
  "confirmRemove": "Remove",
  "confirmRemoveTitle": "Remove child?",
  "confirmRemoveBody": "Remove {name}? Their saved memories will be deleted and past stories will be hidden.",
  "errParentNameRequired": "Please enter your name",
  "errChildNameRequired": "Please enter the child's name",
  "errNoChildren": "Add at least one child",
  "errExpired": "Your link has expired. Type /register in Telegram for a new one.",
  "errGeneric": "Something went wrong. Please try again."
}
```

(`vi.json` full translations land in Task 9; for now copy English so tests pass.)

- [ ] **Step 5: Run tests, verify they pass**

Run: `cd frontend && npx vitest run tests/OnboardingPage.test.tsx`
Expected: 6 passed

- [ ] **Step 6: Commit**

```bash
git add frontend/app/\[locale\]/onboarding/page.tsx \
        frontend/tests/OnboardingPage.test.tsx \
        frontend/messages/en.json frontend/messages/vi.json
git commit -m "feat(frontend): add onboarding page with form and confirm modal"
```

---

## Task 9: Add Vietnamese translations

**Files:**
- Modify: `frontend/messages/vi.json`

- [ ] **Step 1: Replace `onboarding` block in `frontend/messages/vi.json`**

```json
"onboarding": {
  "favoritesCount": "Đã chọn {selected} / {max}",
  "favoritesEmptyHint": "hiện tất cả",
  "headingNew": "Gia đình của bạn",
  "headingEdit": "Chỉnh sửa gia đình",
  "subheading": "Hãy cho chúng tôi biết về các con",
  "yourName": "Tên của bạn",
  "childName": "Tên của con",
  "favoriteCharacters": "Nhân vật yêu thích",
  "addChild": "Thêm con",
  "remove": "Xóa",
  "saving": "Đang lưu...",
  "saveAndContinue": "Lưu và tiếp tục",
  "cancel": "Hủy",
  "confirmRemove": "Xóa",
  "confirmRemoveTitle": "Xóa con?",
  "confirmRemoveBody": "Xóa {name}? Các kỷ niệm đã lưu sẽ bị xóa và các câu chuyện cũ sẽ bị ẩn.",
  "errParentNameRequired": "Vui lòng nhập tên của bạn",
  "errChildNameRequired": "Vui lòng nhập tên của con",
  "errNoChildren": "Thêm ít nhất một con",
  "errExpired": "Liên kết của bạn đã hết hạn. Nhập /register trong Telegram để nhận liên kết mới.",
  "errGeneric": "Đã xảy ra lỗi. Vui lòng thử lại."
}
```

- [ ] **Step 2: Verify no missing keys**

Run: `cd frontend && node -e "const en=require('./messages/en.json'); const vi=require('./messages/vi.json'); const diff=Object.keys(en.onboarding).filter(k=>!(k in vi.onboarding)); console.log(diff.length ? 'Missing: '+diff : 'OK');"`
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/messages/vi.json
git commit -m "feat(frontend): add Vietnamese translations for onboarding"
```

---

## Task 10: Rewire n8n workflow — simplify `/register`, remove `/add-child`

**Files:**
- Modify: `n8n/telegram-brief.json`

- [ ] **Step 1: Replace `/register` branch nodes**

In `n8n/telegram-brief.json`, delete the following nodes (and any connections involving them):
- `reg-check-001` (Check Existing User)
- `reg-if-001` (Is Already Registered?)
- `reg-reply-exists-001` (Reply Already Registered)
- `reg-parse-001` (Parse Register Name)
- `reg-has-name-001` (Has Register Name?)
- `reg-reply-usage-001` (Reply Register Usage)
- `reg-create-001` (Create User)
- `reg-reply-welcome-001` (Reply Welcome)

Add two new nodes in their place:

```json
{
  "parameters": {
    "method": "POST",
    "url": "={{ $env.BACKEND_URL }}/user/register-link",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "X-N8N-Secret", "value": "={{ $env.N8N_SHARED_SECRET }}" }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ telegram_chat_id: $('Telegram Trigger').first().json.message.chat.id }) }}",
    "options": {}
  },
  "id": "reg-link-001",
  "name": "Get Onboarding Link",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [-1340, 528]
},
{
  "parameters": {
    "chatId": "={{ $('Telegram Trigger').first().json.message.chat.id }}",
    "text": "=Set up or edit your family here:\n{{ $json.onboarding_url }}",
    "additionalFields": {}
  },
  "id": "reg-reply-001",
  "name": "Reply With Link",
  "type": "n8n-nodes-base.telegram",
  "typeVersion": 1.2,
  "position": [-1130, 528],
  "credentials": {
    "telegramApi": {
      "id": "6b9KM3MrqkX0lsLl",
      "name": "Telegram account"
    }
  }
}
```

- [ ] **Step 2: Delete all `/add-child` branch nodes**

Delete these nodes from the `nodes` array:
- `ac-lookup-001`, `ac-is-reg-001`, `ac-reply-noreg-001`
- `ac-personas-001`, `ac-parse-001`, `ac-has-name-001`, `ac-reply-usage-001`
- `ac-create-001`, `ac-link-001`, `ac-link-ok-001`, `ac-reply-dup-001`
- `ac-prefs-001`, `ac-build-resp-001`, `ac-reply-ok-001`

Remove any connection entries referencing those node names.

- [ ] **Step 3: Update Command Router**

In the Command Router node (id `cmd-router-001`):
- Remove the `add-child` rule from `rules.values` (keep only `/register`)

In the `connections` object, replace the Command Router connections block with:

```json
"Command Router": {
  "main": [
    [
      { "node": "Get Onboarding Link", "type": "main", "index": 0 }
    ],
    [
      { "node": "Lookup User", "type": "main", "index": 0 }
    ]
  ]
}
```

Add the new /register branch connection:

```json
"Get Onboarding Link": {
  "main": [[{ "node": "Reply With Link", "type": "main", "index": 0 }]]
}
```

- [ ] **Step 4: Commit**

```bash
git add n8n/telegram-brief.json
git commit -m "feat(n8n): simplify /register, remove /add-child branch"
```

---

## Task 11: Add env vars to configuration (example, compose, k8s)

**Files:**
- Modify: `backend/.env.example`
- Modify: `docker-compose.yml`
- Modify: `k8s/backend/deployment.yaml`
- Modify: `k8s/backend/externalsecret.yaml`
- Modify: `k8s/n8n/deployment.yaml` (check path; may differ)

New vars: `AUTH_SECRET` (backend only), `FRONTEND_URL` (backend), `N8N_SHARED_SECRET` (backend + n8n).

- [ ] **Step 1: Update `backend/.env.example`**

Append:

```
# Onboarding / auth token
AUTH_SECRET=changeme-32-byte-hex
FRONTEND_URL=http://localhost:3000
N8N_SHARED_SECRET=changeme-shared-secret
```

- [ ] **Step 2: Update `docker-compose.yml`**

Under the `backend` service's `environment` block, add:

```yaml
      - AUTH_SECRET=${AUTH_SECRET}
      - FRONTEND_URL=${FRONTEND_URL:-http://localhost:3000}
      - N8N_SHARED_SECRET=${N8N_SHARED_SECRET}
```

Under the `n8n` service's `environment` block, add:

```yaml
      - N8N_SHARED_SECRET=${N8N_SHARED_SECRET}
```

- [ ] **Step 3: Update `k8s/backend/deployment.yaml`**

Add these env entries to the `backend` container's `env` list:

```yaml
            - name: AUTH_SECRET
              valueFrom:
                secretKeyRef:
                  name: backend-secret
                  key: AUTH_SECRET
            - name: FRONTEND_URL
              valueFrom:
                secretKeyRef:
                  name: backend-secret
                  key: FRONTEND_URL
            - name: N8N_SHARED_SECRET
              valueFrom:
                secretKeyRef:
                  name: backend-secret
                  key: N8N_SHARED_SECRET
```

- [ ] **Step 4: Update `k8s/backend/externalsecret.yaml`**

Append to the `data` list:

```yaml
    - secretKey: AUTH_SECRET
      remoteRef:
        key: royal-dispatch
        property: AUTH_SECRET
    - secretKey: FRONTEND_URL
      remoteRef:
        key: royal-dispatch
        property: FRONTEND_URL
    - secretKey: N8N_SHARED_SECRET
      remoteRef:
        key: royal-dispatch
        property: N8N_SHARED_SECRET
```

- [ ] **Step 5: Check for and update n8n deployment**

Run: `ls k8s/n8n/` to confirm `deployment.yaml` exists.

If it does, add to its env list:

```yaml
            - name: N8N_SHARED_SECRET
              valueFrom:
                secretKeyRef:
                  name: n8n-secret
                  key: N8N_SHARED_SECRET
```

Also check `k8s/n8n/externalsecret.yaml` (if present) and add the corresponding `data` entry for `N8N_SHARED_SECRET`. If n8n uses a different secret source, follow the same pattern the existing env vars use there.

- [ ] **Step 6: Add vault secrets (manual step — document in commit message)**

Manual (outside this plan): write the three new secrets to Vault under the `royal-dispatch` key used by the external-secrets operator. Generate `AUTH_SECRET` with `openssl rand -hex 32`. Generate `N8N_SHARED_SECRET` with `openssl rand -hex 24`.

- [ ] **Step 7: Commit**

```bash
git add backend/.env.example docker-compose.yml k8s/backend/deployment.yaml \
        k8s/backend/externalsecret.yaml
# include k8s/n8n/* if modified
git commit -m "chore: add AUTH_SECRET, FRONTEND_URL, N8N_SHARED_SECRET env vars"
```

---

## Task 12: Run full test suites and manual integration test

**Files:**
- None (validation only)

- [ ] **Step 1: Backend tests pass**

Run: `cd backend && uv run pytest tests/ -v`
Expected: all tests pass (no regressions in `test_api.py`, `test_storage_client.py`, `test_nodes/*`, etc.)

- [ ] **Step 2: Frontend tests pass**

Run: `cd frontend && npx vitest run`
Expected: all tests pass (`AudioPlayer`, `BottomNav`, `LanguageSelector`, `PrincessCard`, `StoryPage`, `useUser`, `CharactersPicker`, `OnboardingPage`, `lib/user`)

- [ ] **Step 3: Admin tests pass**

Run: `cd admin && npx vitest run`
Expected: all tests pass

- [ ] **Step 4: Bring stack up**

Set `AUTH_SECRET`, `FRONTEND_URL`, `N8N_SHARED_SECRET` in `backend/.env`.

Run: `docker compose up --build`

- [ ] **Step 5: Apply migrations**

Migrations run automatically via the `migrate` service. Verify:

Run: `docker compose logs migrate | tail -20`
Expected: `005/u drop_user_token (...)` applied.

- [ ] **Step 6: Import updated n8n workflow**

Open `http://localhost:5678`. Delete the old "Telegram Brief" workflow. Import `n8n/telegram-brief.json`. Activate it.

- [ ] **Step 7: Manual test — new user happy path**

1. From your Telegram account, send `/register` to the bot.
2. Verify bot replies with a URL shaped `http://localhost:3000/onboarding?token=<...>.<...>`.
3. Open the URL in a browser.
4. Verify the form shows the "Your Family" heading with no pre-filled data.
5. Fill in your name → click "Add Child" → enter child name → select 2-3 characters → click "Save & Continue".
6. Verify redirect to `/en/pick-child` and the new child appears.

- [ ] **Step 8: Manual test — edit path**

1. Send `/register` again.
2. Verify the URL is the **same** as before.
3. Open it. Verify the form is pre-filled with your name and the child you just added.
4. Rename the child, add a second child, click "Save & Continue".
5. Verify pick-child now shows both children.

- [ ] **Step 9: Manual test — remove child with confirmation**

1. Send `/register` → open link.
2. Click "Remove" on an existing child.
3. Verify confirm modal appears.
4. Click "Cancel" → child still present. Click "Remove" again → confirm → verify child gone on submit.
5. Verify the deleted child no longer shows on pick-child.

- [ ] **Step 10: Manual test — brief flow still works**

Send a regular text message to the bot (not `/register`). Expected: normal brief flow (Lookup User → proceed).

- [ ] **Step 11: Update BotFather command list**

Manual (outside code): in Telegram, open BotFather, select your bot, update the command list to:

```
register - Set up or edit your family
```

(Remove any `add-child` entry.)

- [ ] **Step 12: Final commit if anything needed**

If you made tweaks during manual testing:

```bash
git add -A
git commit -m "chore: fix issues found during manual integration test"
```

Otherwise, this task has no commit.

---

## Notes for the engineer

- **TDD discipline:** In every task above, write the test first, run it to confirm it fails, only then implement. This catches typos in imports and ensures the test actually exercises the new code.
- **Transaction boundaries:** Task 5's PUT endpoint does all child reconcile work inside a single `with get_conn() as conn` block. The `get_conn` context manager commits on clean exit and rolls back on exception — do not wrap in an explicit `BEGIN/COMMIT`.
- **Mem0 failures:** The `delete_child_memories` helper swallows exceptions. Do not surface them as HTTP errors. This matches the pattern in `backend/nodes/extract_memories.py` and `fetch_memories.py`.
- **No new admin users via the web form.** The onboarding form creates parent users via the new PUT endpoint only. The admin endpoint `POST /admin/users` continues to exist for admin-UI-driven creation.
- **Security note:** When setting `AUTH_SECRET` in production, generate 32 bytes from `openssl rand -hex 32`. Never check it into source control.
