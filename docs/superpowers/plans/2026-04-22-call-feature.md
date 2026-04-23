# Call Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the child-facing princess call feature (removed in commit `f98ec66`) using ElevenLabs Conversational AI, delivered in the Flutter mobile app as a new "Call" tab.

**Architecture:** Mobile asks backend `/call/start` → backend mints an ElevenLabs signed WebSocket URL with per-call persona/voice/memory overrides → mobile connects directly to ElevenLabs over WebSocket for live STT→LLM→TTS → ElevenLabs posts final transcript to a backend webhook → backend persists transcript + extracts child memories via mem0.

**Tech Stack:** FastAPI + LangGraph (backend), PostgreSQL, mem0/Qdrant, Flutter (mobile), Next.js App Router (admin), ElevenLabs Conversational AI (realtime voice), `elevenlabs_convai_flutter` (Flutter pub package) or direct `web_socket_channel`.

**Reference spec:** `docs/superpowers/specs/2026-04-22-call-feature-design.md`

---

## File Structure

### Backend (new / modified)
- **Create** `backend/db/migrations/006_create_calls.up.sql` — `calls` table
- **Create** `backend/db/migrations/006_create_calls.down.sql` — drop `calls` table
- **Create** `backend/services/__init__.py`
- **Create** `backend/services/elevenlabs_convai.py` — `mint_signed_url(agent_id, overrides)` wrapper
- **Create** `backend/routes/call.py` — `POST /call/start`, `POST /webhooks/elevenlabs/conversation`
- **Modify** `backend/main.py` — register call router
- **Modify** `backend/routes/admin.py` — add `GET /admin/children/{child_id}/calls`
- **Modify** `backend/personas/*.yaml` (all 12) — add `call_system_prompt` and `call_first_message` fields
- **Create** `backend/tests/test_call_routes.py`
- **Create** `backend/tests/test_persona_call_fields.py`
- **Create** `backend/services/__init__.py` (empty package marker)

### Admin (new / modified)
- **Create** `admin/app/users/[id]/children/[childId]/calls/page.tsx` — call history viewer
- **Modify** the existing child detail page to add a "View call history" link
- **Create** `admin/tests/CallsPage.test.tsx`

### Mobile (new / modified)
- **Modify** `mobile/pubspec.yaml` — add `elevenlabs_convai_flutter` (or fall back to `web_socket_channel` + manual framing)
- **Modify** `mobile/ios/Runner/Info.plist` — `NSMicrophoneUsageDescription`
- **Modify** `mobile/android/app/src/main/AndroidManifest.xml` — `RECORD_AUDIO` permission
- **Create** `mobile/lib/services/call_api.dart` — wraps `POST /call/start`
- **Create** `mobile/lib/services/elevenlabs_convai_client.dart` — WebSocket wrapper
- **Create** `mobile/lib/providers/call_provider.dart` — state machine
- **Create** `mobile/lib/screens/call_contacts_screen.dart` — new third tab
- **Create** `mobile/lib/screens/call_screen.dart` — fullscreen call UI
- **Modify** `mobile/lib/widgets/bottom_nav.dart` — add third "Call" tab
- **Modify** `mobile/lib/router.dart` — add `/home/call` + `/call/:princess` routes
- **Modify** `mobile/lib/l10n/app_en.arb` and `app_vi.arb` — accessibility strings
- **Create** `mobile/test/providers/call_provider_test.dart`
- **Create** `mobile/test/services/call_api_test.dart`
- **Create** `mobile/test/screens/call_contacts_screen_test.dart`
- **Create** `mobile/test/screens/call_screen_test.dart`

### Environment (docker-compose.yml + .env examples)
- **Modify** `docker-compose.yml` if env vars are listed there; add `ELEVENLABS_AGENT_ID` and `ELEVENLABS_WEBHOOK_SECRET` to the backend service environment.

---

## Task 1: Database migration for `calls` table

**Files:**
- Create: `backend/db/migrations/006_create_calls.up.sql`
- Create: `backend/db/migrations/006_create_calls.down.sql`

- [ ] **Step 1.1: Write the up migration**

Create `backend/db/migrations/006_create_calls.up.sql` with exactly this content:

```sql
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
```

- [ ] **Step 1.2: Write the down migration**

Create `backend/db/migrations/006_create_calls.down.sql`:

```sql
DROP INDEX IF EXISTS idx_calls_child_started;
DROP TABLE IF EXISTS calls;
```

- [ ] **Step 1.3: Run the migration locally**

Bring up the backend Docker stack or run `golang-migrate` manually:

```bash
docker compose up -d postgres
docker compose run --rm backend alembic upgrade head  # or equivalent migrate command used by the project
```

If the project uses raw `migrate` tool, run:
```bash
migrate -path backend/db/migrations -database "$DATABASE_URL" up
```

Expected: "6/u create_calls (xxx ms)". Verify with:
```bash
docker compose exec postgres psql -U royal -d royal_dispatch -c "\d calls"
```

Expected output: table with the 11 columns above and the index.

- [ ] **Step 1.4: Commit**

```bash
git add backend/db/migrations/006_create_calls.up.sql backend/db/migrations/006_create_calls.down.sql
git commit -m "feat(db): add calls table for voice-call feature"
```

---

## Task 2: Extend persona YAMLs with call fields (schema + Belle example)

**Files:**
- Modify: `backend/personas/belle.yaml` (all others in next task)
- Create: `backend/tests/test_persona_call_fields.py`

- [ ] **Step 2.1: Write the failing schema test**

Create `backend/tests/test_persona_call_fields.py`:

```python
"""Validates that every persona YAML has the fields required by the call feature."""
from pathlib import Path

import pytest
import yaml

PERSONAS_DIR = Path(__file__).parent.parent / "personas"
PERSONA_FILES = sorted(PERSONAS_DIR.glob("*.yaml"))


@pytest.mark.parametrize("path", PERSONA_FILES, ids=lambda p: p.stem)
def test_persona_has_call_system_prompt(path: Path):
    data = yaml.safe_load(path.read_text())
    assert "call_system_prompt" in data, f"{path.name} missing call_system_prompt"
    prompt = data["call_system_prompt"]
    assert isinstance(prompt, dict), f"{path.name} call_system_prompt must be a dict"
    assert prompt.get("en"), f"{path.name} call_system_prompt.en is empty"
    assert prompt.get("vi"), f"{path.name} call_system_prompt.vi is empty"


@pytest.mark.parametrize("path", PERSONA_FILES, ids=lambda p: p.stem)
def test_persona_has_call_first_message(path: Path):
    data = yaml.safe_load(path.read_text())
    assert "call_first_message" in data, f"{path.name} missing call_first_message"
    msg = data["call_first_message"]
    assert isinstance(msg, dict), f"{path.name} call_first_message must be a dict"
    assert msg.get("en"), f"{path.name} call_first_message.en is empty"
    assert msg.get("vi"), f"{path.name} call_first_message.vi is empty"
    assert "{child_name}" in msg["en"], f"{path.name} call_first_message.en must contain {{child_name}}"
    assert "{child_name}" in msg["vi"], f"{path.name} call_first_message.vi must contain {{child_name}}"
```

- [ ] **Step 2.2: Run the test and verify it fails**

```bash
cd backend && uv run pytest tests/test_persona_call_fields.py -v
```

Expected: 24 failures (12 persona files × 2 test functions), all failing with "missing call_system_prompt" or "missing call_first_message".

- [ ] **Step 2.3: Fill in Belle as the canonical example**

Edit `backend/personas/belle.yaml` to append these two new top-level fields (keep the existing fields untouched):

```yaml
call_system_prompt:
  en: |
    You are Belle from the Enchanted Castle. You are talking on a magical phone with a child.

    RULES — follow every time:
    - Keep every reply short: 1–3 sentences. You are on a call, not writing a letter.
    - Speak warmly, gently, curiously. Use plain words a five-year-old knows.
    - Ask the child questions. Listen more than you talk.
    - If the child is quiet for a few seconds, gently prompt them ("Are you still there, sweetheart?").
    - Never ask for personal information (last name, address, school name, phone number). If the child offers any, change the subject kindly.
    - If the child brings up anything scary, violent, or adult, redirect softly: "Let's talk about something happier — tell me what your favorite toy is doing today."
    - Around the 4:30 mark in the conversation, start wrapping up gently. Say you have to go read in the library and that you loved talking.

    WHO YOU ARE:
    - You love books and stories.
    - You live in a castle with enchanted objects who are your friends.
    - You believe being kind and brave matters more than being right.

    WHAT YOU KNOW ABOUT THIS CHILD:
    (the backend will append a memory block here automatically)
  vi: |
    Bạn là Belle từ Lâu đài Phép thuật. Bạn đang nói chuyện qua một chiếc điện thoại phép thuật với một em bé.

    QUY TẮC — luôn tuân theo:
    - Mỗi câu trả lời ngắn: 1–3 câu. Đây là cuộc gọi, không phải thư dài.
    - Nói ấm áp, dịu dàng, tò mò. Dùng từ đơn giản mà trẻ năm tuổi hiểu được.
    - Hãy hỏi em bé những câu hỏi. Lắng nghe nhiều hơn là nói.
    - Nếu em bé im lặng vài giây, dịu dàng hỏi lại ("Em còn ở đó không, bé yêu?").
    - Không bao giờ hỏi thông tin cá nhân (họ tên đầy đủ, địa chỉ, tên trường, số điện thoại). Nếu em bé nói ra, hãy nhẹ nhàng đổi chủ đề.
    - Nếu em bé nói về điều đáng sợ, bạo lực hoặc dành cho người lớn, hãy chuyển hướng nhẹ nhàng: "Mình nói chuyện vui hơn nhé — kể Belle nghe món đồ chơi yêu thích của em hôm nay đang làm gì đi."
    - Khoảng phút 4:30, bắt đầu tạm biệt nhẹ nhàng. Nói rằng Belle phải đi đọc sách trong thư viện và rất vui được trò chuyện.

    BẠN LÀ AI:
    - Bạn yêu sách và những câu chuyện.
    - Bạn sống trong lâu đài với những vật dụng biết nói là bạn thân.
    - Bạn tin rằng tử tế và dũng cảm quan trọng hơn là đúng.

    NHỮNG ĐIỀU BẠN BIẾT VỀ EM BÉ NÀY:
    (backend sẽ tự động thêm phần ghi nhớ ở đây)
call_first_message:
  en: "Hi {child_name}! It's Belle. I was just reading in the library and I thought of you. What's on your mind today?"
  vi: "Chào {child_name}! Là Belle đây. Mình vừa đang đọc sách trong thư viện và nghĩ đến em. Em muốn kể gì cho Belle nghe hôm nay?"
```

- [ ] **Step 2.4: Run the test — Belle should pass, 11 others still fail**

```bash
cd backend && uv run pytest tests/test_persona_call_fields.py -v
```

Expected: 2 pass (belle × 2 test functions), 22 fail (11 other personas × 2 tests).

- [ ] **Step 2.5: Commit Belle example + schema test**

```bash
git add backend/tests/test_persona_call_fields.py backend/personas/belle.yaml
git commit -m "feat(personas): add call fields schema + belle example"
```

---

## Task 3: Fill in remaining 11 persona YAMLs

**Files:**
- Modify: the other 11 files in `backend/personas/` (ariel, chase, cinderella, elsa, marshall, mirabel, moana, rapunzel, raya, rubble, skye)

Treat Belle's block (Task 2.3) as the template. For each of the 11 files, add the same two top-level fields. Rules are identical across characters (the RULES block is shared), but WHO YOU ARE and the first_message MUST reflect each character's persona as captured in their existing YAML fields (`origin`, `tone_style`, `metaphor`).

The shared RULES block is character-agnostic — copy it verbatim into every prompt. Only WHO YOU ARE and the first message vary.

- [ ] **Step 3.1: Apply template to each of 11 personas**

For each of the 11 files, add `call_system_prompt.en`, `call_system_prompt.vi`, `call_first_message.en`, `call_first_message.vi`. Character briefs:

- **ariel** — Mermaid princess of Atlantica. Loves collecting human treasures, curious about the surface world. First message: about finding a new treasure today.
- **chase** — Police-dog pup from Paw Patrol. Brave, helpful, a bit shy. First message: about helping someone in Adventure Bay today.
- **cinderella** — Kind-hearted princess. Believes dreams come true through kindness. First message: about her mice friends.
- **elsa** — Snow queen of Arendelle. Majestic, gentle with her ice magic. First message: about snowflakes she made.
- **marshall** — Firefighter Dalmatian pup. Clumsy but brave, always ready to help. First message: about putting out a tiny fire today.
- **mirabel** — From the Madrigal family. Warm, creative, celebrates differences. First message: about her family's casita.
- **moana** — Wayfinder of Motunui. Brave, ocean-loving, in tune with nature. First message: about the ocean today.
- **rapunzel** — Princess with magic hair. Curious, artistic, joyful. First message: about painting she made.
- **raya** — Warrior princess of Kumandra. Brave, trusting, loyal to Tuk Tuk. First message: about her adventure today.
- **rubble** — Bulldog construction pup. Sweet, hungry, loves building. First message: about what he built today.
- **skye** — Cockapoo pup with a helicopter. Fearless, sky-loving. First message: about what she saw from the sky.

For each YAML, the `call_system_prompt.en` should be:

```
You are {CharacterName} from {origin}. You are talking on a magical phone with a child.

RULES — follow every time:
- Keep every reply short: 1–3 sentences. You are on a call, not writing a letter.
- Speak warmly, gently, curiously. Use plain words a five-year-old knows.
- Ask the child questions. Listen more than you talk.
- If the child is quiet for a few seconds, gently prompt them ("Are you still there, friend?").
- Never ask for personal information (last name, address, school name, phone number). If the child offers any, change the subject kindly.
- If the child brings up anything scary, violent, or adult, redirect softly: "Let's talk about something happier — tell me what your favorite {toy/thing} is doing today."
- Around the 4:30 mark in the conversation, start wrapping up gently. Say you have to go {do your character's signature activity} and that you loved talking.

WHO YOU ARE:
(3–5 bullets drawn from the character brief above)

WHAT YOU KNOW ABOUT THIS CHILD:
(the backend will append a memory block here automatically)
```

And `call_first_message.en` should be a single sentence matching the per-character note above, containing `{child_name}`. Same structure for `vi`.

- [ ] **Step 3.2: Run the schema test and verify all 12 pass**

```bash
cd backend && uv run pytest tests/test_persona_call_fields.py -v
```

Expected: 24/24 PASS.

- [ ] **Step 3.3: Commit**

```bash
git add backend/personas/
git commit -m "feat(personas): add call prompts for remaining 11 characters"
```

---

## Task 4: ElevenLabs Convai service wrapper

**Files:**
- Create: `backend/services/__init__.py` (empty)
- Create: `backend/services/elevenlabs_convai.py`
- Create: `backend/tests/test_elevenlabs_convai.py`

- [ ] **Step 4.1: Create empty services package**

```bash
touch backend/services/__init__.py
```

- [ ] **Step 4.2: Write the failing test**

Create `backend/tests/test_elevenlabs_convai.py`:

```python
import os
from unittest.mock import patch, MagicMock

import pytest

from backend.services.elevenlabs_convai import mint_signed_url, ElevenLabsError


@pytest.fixture(autouse=True)
def _env():
    os.environ["ELEVENLABS_API_KEY"] = "test-key"
    os.environ["ELEVENLABS_AGENT_ID"] = "agent-abc"
    yield


def test_mint_signed_url_posts_agent_id_and_overrides_and_returns_signed_url():
    overrides = {"agent": {"prompt": {"prompt": "be Belle"}}}

    fake_response = MagicMock()
    fake_response.status_code = 200
    fake_response.json.return_value = {
        "signed_url": "wss://api.elevenlabs.io/v1/convai/conversation?signature=abc",
        "conversation_id": "conv_123",
        "expires_at_unix_seconds": 1745000000,
    }

    with patch("backend.services.elevenlabs_convai.httpx.post", return_value=fake_response) as mock_post:
        result = mint_signed_url(overrides=overrides)

    mock_post.assert_called_once()
    call = mock_post.call_args
    assert "agent_id=agent-abc" in call.kwargs["params"].__repr__() or call.kwargs.get("params", {}).get("agent_id") == "agent-abc"
    assert call.kwargs["headers"]["xi-api-key"] == "test-key"
    assert call.kwargs["json"] == {"conversation_config_override": overrides}

    assert result.signed_url.startswith("wss://")
    assert result.conversation_id == "conv_123"
    assert result.expires_at_unix == 1745000000


def test_mint_signed_url_raises_on_non_2xx():
    fake_response = MagicMock()
    fake_response.status_code = 500
    fake_response.text = "ElevenLabs is on fire"

    with patch("backend.services.elevenlabs_convai.httpx.post", return_value=fake_response):
        with pytest.raises(ElevenLabsError) as exc:
            mint_signed_url(overrides={})

    assert "500" in str(exc.value)
```

- [ ] **Step 4.3: Run the test and verify it fails**

```bash
cd backend && uv run pytest tests/test_elevenlabs_convai.py -v
```

Expected: ImportError / ModuleNotFoundError on `backend.services.elevenlabs_convai`.

- [ ] **Step 4.4: Implement the wrapper**

Create `backend/services/elevenlabs_convai.py`:

```python
"""Thin wrapper over ElevenLabs Conversational AI signed-URL minting.

Kept narrow on purpose: one function, one exception type, easy to mock.
"""
import logging
import os
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)


class ElevenLabsError(Exception):
    """Raised when ElevenLabs Convai returns a non-2xx response."""


@dataclass
class SignedUrlResult:
    signed_url: str
    conversation_id: str
    expires_at_unix: int


_SIGNED_URL_ENDPOINT = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url"


def mint_signed_url(overrides: dict, timeout_s: float = 10.0) -> SignedUrlResult:
    """Mint a single-use signed WebSocket URL for a new Convai conversation.

    `overrides` must follow ElevenLabs' `conversation_config_override` schema
    (agent prompt/first_message/language, tts voice_id, conversation max_duration).
    """
    api_key = os.environ["ELEVENLABS_API_KEY"]
    agent_id = os.environ["ELEVENLABS_AGENT_ID"]

    response = httpx.post(
        _SIGNED_URL_ENDPOINT,
        params={"agent_id": agent_id},
        headers={"xi-api-key": api_key},
        json={"conversation_config_override": overrides},
        timeout=timeout_s,
    )

    if response.status_code < 200 or response.status_code >= 300:
        raise ElevenLabsError(
            f"ElevenLabs mint_signed_url returned {response.status_code}: {response.text[:200]}"
        )

    body = response.json()
    return SignedUrlResult(
        signed_url=body["signed_url"],
        conversation_id=body["conversation_id"],
        expires_at_unix=body["expires_at_unix_seconds"],
    )
```

- [ ] **Step 4.5: Run the test and verify it passes**

```bash
cd backend && uv run pytest tests/test_elevenlabs_convai.py -v
```

Expected: 2/2 PASS.

- [ ] **Step 4.6: Commit**

```bash
git add backend/services/ backend/tests/test_elevenlabs_convai.py
git commit -m "feat(backend): add ElevenLabs Convai signed-URL wrapper"
```

---

## Task 5: `POST /call/start` endpoint

**Files:**
- Create: `backend/routes/call.py`
- Modify: `backend/main.py` — register router
- Create: `backend/tests/test_call_routes.py`

- [ ] **Step 5.1: Write the failing tests**

Create `backend/tests/test_call_routes.py`:

```python
import os
import uuid
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("ELEVENLABS_API_KEY", "test-key")
os.environ.setdefault("ELEVENLABS_AGENT_ID", "agent-abc")
os.environ.setdefault("ELEVENLABS_WEBHOOK_SECRET", "test-webhook-secret")


@pytest.fixture
def client():
    from backend.main import app
    return TestClient(app)


@pytest.fixture
def mock_db(mocker):
    """Patch the psycopg pool so /call/start doesn't hit a real database."""
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_conn.__enter__.return_value = mock_conn
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    mocker.patch("backend.routes.call.get_conn", return_value=mock_conn)
    return mock_conn, mock_cur


@pytest.fixture
def signed_url_mock(mocker):
    from backend.services.elevenlabs_convai import SignedUrlResult
    return mocker.patch(
        "backend.routes.call.mint_signed_url",
        return_value=SignedUrlResult(
            signed_url="wss://eleven/conv?sig=abc",
            conversation_id="conv_123",
            expires_at_unix=1_745_000_000,
        ),
    )


@pytest.fixture
def fetch_memories_mock(mocker):
    return mocker.patch(
        "backend.routes.call.fetch_memories",
        return_value={"memories": "- loves dinosaurs\n- afraid of the dark"},
    )


CHILD_ID = str(uuid.uuid4())


def _child_lookup_row(princess_list=("belle",), name="Emma", tz="America/Los_Angeles"):
    """Simulate SELECT returning (name, favorite_princesses, timezone)."""
    return (name, list(princess_list), tz)


def _signed_token_for_chat(chat_id: int = 12345) -> str:
    from backend.utils.auth_token import encode
    return encode(chat_id)


def test_start_returns_signed_url(client, mock_db, signed_url_mock, fetch_memories_mock):
    _, cur = mock_db
    # 1) child lookup returns a valid child with belle favored
    # 2) daily cap count returns 0
    cur.fetchone.side_effect = [_child_lookup_row(("belle", "elsa")), (0,)]

    token = _signed_token_for_chat(12345)
    resp = client.post(
        "/call/start",
        json={"child_id": CHILD_ID, "princess": "belle", "locale": "en"},
        headers={"X-Auth-Token": token},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["signed_url"].startswith("wss://")
    assert body["conversation_id"] == "conv_123"
    assert body["princess_display_name"] == "Belle"
    assert body["max_duration_seconds"] == 300

    # Verify the override payload contained persona prompt + memories + voice + duration
    overrides = signed_url_mock.call_args.kwargs["overrides"]
    assert overrides["tts"]["voice_id"]  # belle's voice id from persona yaml
    prompt = overrides["agent"]["prompt"]["prompt"]
    assert "You are Belle" in prompt
    assert "loves dinosaurs" in prompt
    assert overrides["agent"]["first_message"].startswith("Hi Emma!")
    assert overrides["agent"]["language"] == "en"
    assert overrides["conversation"]["max_duration_seconds"] == 300


def test_start_localizes_for_vi(client, mock_db, signed_url_mock, fetch_memories_mock):
    _, cur = mock_db
    cur.fetchone.side_effect = [_child_lookup_row(("belle",)), (0,)]

    resp = client.post(
        "/call/start",
        json={"child_id": CHILD_ID, "princess": "belle", "locale": "vi"},
        headers={"X-Auth-Token": _signed_token_for_chat()},
    )

    assert resp.status_code == 200
    overrides = signed_url_mock.call_args.kwargs["overrides"]
    assert overrides["agent"]["language"] == "vi"
    assert overrides["agent"]["first_message"].startswith("Chào Emma!")
    assert "Bạn là Belle" in overrides["agent"]["prompt"]["prompt"]


def test_start_rejects_unknown_child(client, mock_db, signed_url_mock):
    _, cur = mock_db
    cur.fetchone.return_value = None  # child not found

    resp = client.post(
        "/call/start",
        json={"child_id": CHILD_ID, "princess": "belle", "locale": "en"},
        headers={"X-Auth-Token": _signed_token_for_chat()},
    )

    assert resp.status_code == 404
    signed_url_mock.assert_not_called()


def test_start_rejects_non_favorite_princess(client, mock_db, signed_url_mock):
    _, cur = mock_db
    cur.fetchone.return_value = _child_lookup_row(("elsa",))  # belle not in favorites

    resp = client.post(
        "/call/start",
        json={"child_id": CHILD_ID, "princess": "belle", "locale": "en"},
        headers={"X-Auth-Token": _signed_token_for_chat()},
    )

    assert resp.status_code == 403
    signed_url_mock.assert_not_called()


def test_start_enforces_daily_cap(client, mock_db, signed_url_mock, fetch_memories_mock):
    _, cur = mock_db
    cur.fetchone.side_effect = [_child_lookup_row(("belle",)), (3,)]  # 3 calls already today

    resp = client.post(
        "/call/start",
        json={"child_id": CHILD_ID, "princess": "belle", "locale": "en"},
        headers={"X-Auth-Token": _signed_token_for_chat()},
    )

    assert resp.status_code == 409
    assert resp.json()["detail"] == "daily_cap_reached"
    signed_url_mock.assert_not_called()


def test_start_handles_elevenlabs_failure(client, mock_db, fetch_memories_mock, mocker):
    from backend.services.elevenlabs_convai import ElevenLabsError
    mocker.patch("backend.routes.call.mint_signed_url", side_effect=ElevenLabsError("boom"))
    _, cur = mock_db
    cur.fetchone.side_effect = [_child_lookup_row(("belle",)), (0,)]

    resp = client.post(
        "/call/start",
        json={"child_id": CHILD_ID, "princess": "belle", "locale": "en"},
        headers={"X-Auth-Token": _signed_token_for_chat()},
    )

    assert resp.status_code == 503
    # Make sure the INSERT was not executed (no calls row inserted).
    insert_calls = [c for c in cur.execute.call_args_list if "INSERT INTO calls" in (c.args[0] if c.args else "")]
    assert not insert_calls
```

- [ ] **Step 5.2: Run tests and verify they fail**

```bash
cd backend && uv run pytest tests/test_call_routes.py -v
```

Expected: 6 failures (module import error or `/call/start` endpoint not found).

- [ ] **Step 5.3: Implement `POST /call/start`**

Create `backend/routes/call.py`:

```python
"""Call feature endpoints: /call/start and /webhooks/elevenlabs/conversation."""
import logging
from datetime import datetime, timedelta, timezone as tz

import pytz
import yaml
from fastapi import APIRouter, Header, HTTPException
from pathlib import Path
from pydantic import BaseModel, Field

from backend.db.client import get_conn
from backend.nodes.fetch_memories import fetch_memories
from backend.services.elevenlabs_convai import ElevenLabsError, mint_signed_url
from backend.utils.auth_token import InvalidTokenError, decode

logger = logging.getLogger(__name__)
router = APIRouter()

PERSONAS_DIR = Path(__file__).parent.parent / "personas"
MAX_CALL_SECONDS = 300
DAILY_CAP = 3


# ── Request / response models ────────────────────────────────────────────────

class CallStartRequest(BaseModel):
    child_id: str
    princess: str
    locale: str = Field(default="en", pattern="^(en|vi)$")


class CallStartResponse(BaseModel):
    conversation_id: str
    signed_url: str
    expires_at: str
    princess_display_name: str
    max_duration_seconds: int


# ── Helpers ──────────────────────────────────────────────────────────────────

def _load_persona(princess: str) -> dict:
    path = PERSONAS_DIR / f"{princess}.yaml"
    if not path.exists():
        raise HTTPException(status_code=404, detail="unknown_princess")
    return yaml.safe_load(path.read_text())


def _auth_chat_id(header_token: str | None) -> int:
    if not header_token:
        raise HTTPException(status_code=401, detail="missing_token")
    try:
        return decode(header_token)
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="invalid_token")


def _logical_day_start_utc(timezone_str: str) -> datetime:
    """Return the UTC datetime for 3 AM today in the child's timezone (logical-day boundary)."""
    user_tz = pytz.timezone(timezone_str)
    now_local = datetime.now(user_tz)
    logical_start_local = (now_local - timedelta(hours=3)).replace(
        hour=3, minute=0, second=0, microsecond=0
    )
    # If logical_start_local rolled past now (e.g., shortly after midnight), back up one day
    if logical_start_local > now_local:
        logical_start_local -= timedelta(days=1)
    return logical_start_local.astimezone(pytz.UTC)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/call/start", response_model=CallStartResponse)
def call_start(req: CallStartRequest, x_auth_token: str | None = Header(default=None)):
    chat_id = _auth_chat_id(x_auth_token)
    persona = _load_persona(req.princess)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # 1. Resolve child and verify it's linked to this parent's chat_id, AND
            #    that `req.princess` is in the child's favorites.
            cur.execute(
                """
                SELECT c.name, c.favorite_princesses, c.timezone
                FROM children c
                JOIN user_children uc ON uc.child_id = c.id
                JOIN users u ON u.id = uc.user_id
                WHERE c.id = %s AND u.telegram_chat_id = %s
                """,
                (req.child_id, chat_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="child_not_found")
            child_name, favorites, child_tz = row

            if req.princess not in (favorites or []):
                raise HTTPException(status_code=403, detail="princess_not_favorite")

            # 2. Daily cap
            cur.execute(
                "SELECT COUNT(*) FROM calls WHERE child_id = %s AND started_at >= %s",
                (req.child_id, _logical_day_start_utc(child_tz)),
            )
            (count_today,) = cur.fetchone()
            if count_today >= DAILY_CAP:
                raise HTTPException(status_code=409, detail="daily_cap_reached")

    # 3. Fetch child memories (graceful if mem0 down → empty string)
    mem_result = fetch_memories({"child_id": req.child_id, "brief": "__fallback__"})
    memories = mem_result.get("memories", "")

    # 4. Build override payload and mint signed URL
    system_prompt = persona["call_system_prompt"][req.locale]
    if memories:
        system_prompt = f"{system_prompt}\n\n{memories}"
    first_message = persona["call_first_message"][req.locale].replace("{child_name}", child_name)

    overrides = {
        "agent": {
            "prompt": {"prompt": system_prompt},
            "first_message": first_message,
            "language": req.locale,
        },
        "tts": {"voice_id": persona["voice_id"]},
        "conversation": {"max_duration_seconds": MAX_CALL_SECONDS},
    }

    try:
        signed = mint_signed_url(overrides=overrides)
    except ElevenLabsError as exc:
        logger.warning("ElevenLabs mint failed: %s", exc)
        raise HTTPException(status_code=503, detail="upstream_unavailable")

    # 5. Insert the calls row in state='started'
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO calls (child_id, princess, locale, conversation_id, state)
                VALUES (%s, %s, %s, %s, 'started')
                """,
                (req.child_id, req.princess, req.locale, signed.conversation_id),
            )
        conn.commit()

    expires_at_iso = datetime.fromtimestamp(signed.expires_at_unix, tz=tz.utc).isoformat()

    return CallStartResponse(
        conversation_id=signed.conversation_id,
        signed_url=signed.signed_url,
        expires_at=expires_at_iso,
        princess_display_name=persona["name"],
        max_duration_seconds=MAX_CALL_SECONDS,
    )
```

- [ ] **Step 5.4: Register the router in `main.py`**

Edit `backend/main.py` and add:

```python
from backend.routes.call import router as call_router
...
app.include_router(call_router)
```

- [ ] **Step 5.5: Run the tests and verify they pass**

```bash
cd backend && uv run pytest tests/test_call_routes.py -v
```

Expected: 6/6 PASS.

> **Note:** The test mocks assume the DB lookup returns `(child_name, favorite_princesses_list, timezone)`. Verify that the actual `children` schema has a `favorite_princesses` column (or equivalent). If the column is named differently (e.g., `preferences`), adjust both the query in `call.py` and the test's `_child_lookup_row` helper to match. Run `\d children` in psql to check.

- [ ] **Step 5.6: Commit**

```bash
git add backend/routes/call.py backend/main.py backend/tests/test_call_routes.py
git commit -m "feat(backend): add POST /call/start endpoint"
```

---

## Task 6: Webhook endpoint for ElevenLabs post-call transcripts

**Files:**
- Modify: `backend/routes/call.py` — add webhook handler
- Modify: `backend/tests/test_call_routes.py` — append webhook tests

- [ ] **Step 6.1: Append webhook tests to `test_call_routes.py`**

Add the following tests at the bottom of `backend/tests/test_call_routes.py`:

```python
import hashlib
import hmac
import json as json_lib


def _webhook_sign(body_bytes: bytes) -> str:
    secret = os.environ["ELEVENLABS_WEBHOOK_SECRET"].encode()
    return hmac.new(secret, body_bytes, hashlib.sha256).hexdigest()


def _make_webhook_payload(conv_id="conv_123", duration=252, reason="user_ended"):
    return {
        "conversation_id": conv_id,
        "duration_seconds": duration,
        "ended_reason": reason,
        "transcript": [
            {"role": "user", "text": "hi Belle", "time": 0.0},
            {"role": "agent", "text": "hi Emma!", "time": 1.2},
        ],
    }


def test_webhook_verifies_hmac(client, mock_db):
    body = json_lib.dumps(_make_webhook_payload()).encode()
    resp = client.post(
        "/webhooks/elevenlabs/conversation",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Elevenlabs-Signature": "wrong-signature",
        },
    )
    assert resp.status_code == 401


def test_webhook_persists_transcript_and_extracts_memories(client, mock_db, mocker):
    _, cur = mock_db
    # Lookup to resolve child_id from conversation_id
    cur.fetchone.return_value = (CHILD_ID,)
    extract_mock = mocker.patch("backend.routes.call.extract_memories_from_transcript")

    payload = _make_webhook_payload()
    body = json_lib.dumps(payload).encode()
    sig = _webhook_sign(body)

    resp = client.post(
        "/webhooks/elevenlabs/conversation",
        content=body,
        headers={"Content-Type": "application/json", "X-Elevenlabs-Signature": sig},
    )

    assert resp.status_code == 200
    # Verify UPDATE was called with the expected params (in order)
    update_calls = [c for c in cur.execute.call_args_list if "UPDATE calls" in (c.args[0] if c.args else "")]
    assert len(update_calls) == 1
    _, params = update_calls[0].args
    # params: (duration, transcript_json, ended_reason, conversation_id)
    assert 252 in params
    assert "conv_123" in params
    extract_mock.assert_called_once()
    args = extract_mock.call_args.args
    assert args[0] == CHILD_ID
    assert args[1] == payload["transcript"]


def test_webhook_is_idempotent(client, mock_db, mocker):
    _, cur = mock_db
    cur.fetchone.return_value = (CHILD_ID,)
    mocker.patch("backend.routes.call.extract_memories_from_transcript")

    body = json_lib.dumps(_make_webhook_payload()).encode()
    sig = _webhook_sign(body)
    headers = {"Content-Type": "application/json", "X-Elevenlabs-Signature": sig}

    r1 = client.post("/webhooks/elevenlabs/conversation", content=body, headers=headers)
    r2 = client.post("/webhooks/elevenlabs/conversation", content=body, headers=headers)

    assert r1.status_code == 200
    assert r2.status_code == 200  # idempotent, does not 5xx


def test_webhook_handles_unknown_conversation_id(client, mock_db, mocker):
    _, cur = mock_db
    cur.fetchone.return_value = None  # conversation_id not in DB
    extract_mock = mocker.patch("backend.routes.call.extract_memories_from_transcript")

    body = json_lib.dumps(_make_webhook_payload(conv_id="unknown_conv")).encode()
    sig = _webhook_sign(body)
    resp = client.post(
        "/webhooks/elevenlabs/conversation",
        content=body,
        headers={"Content-Type": "application/json", "X-Elevenlabs-Signature": sig},
    )

    assert resp.status_code == 200
    assert resp.json() == {"status": "ignored"}
    extract_mock.assert_not_called()
```

- [ ] **Step 6.2: Run and verify tests fail**

```bash
cd backend && uv run pytest tests/test_call_routes.py -v -k webhook
```

Expected: 4 failures (no `/webhooks/elevenlabs/conversation` endpoint).

- [ ] **Step 6.3: Implement the webhook**

Append to `backend/routes/call.py`:

```python
import hashlib
import hmac
import json as json_lib
import os

from fastapi import Request
from backend.utils.mem0_client import get_memory


_EXTRACTION_SYSTEM_PROMPT = (
    "Extract only facts worth remembering long-term about this child: "
    "their preferences (favorite toys, colors, foods, characters), "
    "social patterns (friendships, sibling dynamics, social wins/struggles), "
    "habits (recurring behaviors they are working on), "
    "and milestones (significant achievements or life events). "
    "Ignore transient details that are not reusable in future conversations."
)


def extract_memories_from_transcript(child_id: str, transcript: list[dict]) -> None:
    """Store memorable facts the child said during the call. Fails silently if mem0 is down."""
    if not child_id or not transcript:
        return
    try:
        memory = get_memory()
        child_text = " ".join(t["text"] for t in transcript if t.get("role") == "user")
        if not child_text.strip():
            return
        memory.add(
            [
                {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": child_text},
            ],
            user_id=child_id,
        )
    except Exception:
        logger.warning("extract_memories_from_transcript: mem0 unavailable, skipping", exc_info=True)


def _verify_webhook_signature(body: bytes, header_sig: str | None) -> bool:
    if not header_sig:
        return False
    secret = os.environ["ELEVENLABS_WEBHOOK_SECRET"].encode()
    expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header_sig)


@router.post("/webhooks/elevenlabs/conversation")
async def elevenlabs_webhook(
    request: Request,
    x_elevenlabs_signature: str | None = Header(default=None),
):
    body = await request.body()
    if not _verify_webhook_signature(body, x_elevenlabs_signature):
        raise HTTPException(status_code=401, detail="invalid_signature")

    payload = json_lib.loads(body)
    conversation_id = payload["conversation_id"]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT child_id FROM calls WHERE conversation_id = %s",
                (conversation_id,),
            )
            row = cur.fetchone()
            if not row:
                logger.warning("Webhook for unknown conversation_id %s — ignoring", conversation_id)
                return {"status": "ignored"}
            (child_id,) = row

            cur.execute(
                """
                UPDATE calls
                SET state = 'completed',
                    ended_at = now(),
                    duration_seconds = %s,
                    transcript = %s,
                    ended_reason = %s
                WHERE conversation_id = %s
                """,
                (
                    payload["duration_seconds"],
                    json_lib.dumps(payload["transcript"]),
                    payload["ended_reason"],
                    conversation_id,
                ),
            )
        conn.commit()

    extract_memories_from_transcript(str(child_id), payload["transcript"])
    return {"status": "ok"}
```

- [ ] **Step 6.4: Run webhook tests and verify pass**

```bash
cd backend && uv run pytest tests/test_call_routes.py -v
```

Expected: 10/10 PASS (6 from Task 5 + 4 new).

- [ ] **Step 6.5: Commit**

```bash
git add backend/routes/call.py backend/tests/test_call_routes.py
git commit -m "feat(backend): add ElevenLabs conversation webhook handler"
```

---

## Task 7: Admin endpoint `GET /admin/children/{child_id}/calls`

**Files:**
- Modify: `backend/routes/admin.py`
- Create: test in `backend/tests/test_admin_routes.py` (append if file exists, else create; file already exists per project structure)

- [ ] **Step 7.1: Append the failing test to `test_admin_routes.py`**

Add at the bottom of `backend/tests/test_admin_routes.py`:

```python
def test_admin_lists_calls_for_child(client, mocker):
    # Mock DB pool so /admin/children/{id}/calls returns deterministic rows
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_conn.__enter__.return_value = mock_conn
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    mocker.patch("backend.routes.admin.get_conn", return_value=mock_conn)

    rows = [
        (
            "call-1", "belle", "en", "completed", "user_ended",
            "2026-04-22T18:00:00+00:00", "2026-04-22T18:04:12+00:00", 252,
            [{"role": "user", "text": "hi"}],
        ),
        (
            "call-2", "elsa", "en", "completed", "timeout",
            "2026-04-22T12:00:00+00:00", "2026-04-22T12:05:00+00:00", 300,
            [{"role": "user", "text": "hello"}],
        ),
    ]
    # First fetchall returns the call rows, then SELECT COUNT returns total
    mock_cur.fetchall.return_value = rows
    mock_cur.fetchone.return_value = (2,)

    resp = client.get("/admin/children/child-abc/calls")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2
    assert body["items"][0]["princess"] == "belle"
    assert body["items"][0]["transcript"][0]["text"] == "hi"
```

- [ ] **Step 7.2: Run and verify failure**

```bash
cd backend && uv run pytest tests/test_admin_routes.py::test_admin_lists_calls_for_child -v
```

Expected: 404 or endpoint not found.

- [ ] **Step 7.3: Implement the endpoint**

Add the following to `backend/routes/admin.py` near the other child-related routes:

```python
class CallListItem(BaseModel):
    id: str
    princess: str
    locale: str
    state: str
    ended_reason: str | None
    started_at: str
    ended_at: str | None
    duration_seconds: int | None
    transcript: list[dict] | None


class CallListResponse(BaseModel):
    items: list[CallListItem]
    total: int


@router.get("/children/{child_id}/calls", response_model=CallListResponse)
def list_calls_for_child(child_id: str, limit: int = 50, offset: int = 0):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, princess, locale, state, ended_reason,
                       started_at, ended_at, duration_seconds, transcript
                FROM calls
                WHERE child_id = %s
                ORDER BY started_at DESC
                LIMIT %s OFFSET %s
                """,
                (child_id, limit, offset),
            )
            rows = cur.fetchall()
            cur.execute("SELECT COUNT(*) FROM calls WHERE child_id = %s", (child_id,))
            (total,) = cur.fetchone()

    def _to_iso(ts):
        return ts.isoformat() if hasattr(ts, "isoformat") else ts

    items = [
        CallListItem(
            id=str(r[0]),
            princess=r[1],
            locale=r[2],
            state=r[3],
            ended_reason=r[4],
            started_at=_to_iso(r[5]),
            ended_at=_to_iso(r[6]) if r[6] else None,
            duration_seconds=r[7],
            transcript=r[8],
        )
        for r in rows
    ]
    return CallListResponse(items=items, total=total)
```

- [ ] **Step 7.4: Run test and verify pass**

```bash
cd backend && uv run pytest tests/test_admin_routes.py::test_admin_lists_calls_for_child -v
```

Expected: PASS.

- [ ] **Step 7.5: Commit**

```bash
git add backend/routes/admin.py backend/tests/test_admin_routes.py
git commit -m "feat(backend): admin endpoint listing child call history"
```

---

## Task 8: Admin UI — Call history page

**Files:**
- Create: `admin/app/users/[id]/children/[childId]/calls/page.tsx`
- Create: `admin/tests/CallsPage.test.tsx`
- Modify: existing child detail page — add link

- [ ] **Step 8.1: Write the failing test**

Create `admin/tests/CallsPage.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CallsPage from "@/app/users/[id]/children/[childId]/calls/page";

const mockFetch = vi.fn();
beforeEach(() => {
  global.fetch = mockFetch as any;
  mockFetch.mockReset();
});

describe("CallsPage", () => {
  it("renders a list of calls with expandable transcripts", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "call-1",
            princess: "belle",
            locale: "en",
            state: "completed",
            ended_reason: "user_ended",
            started_at: "2026-04-22T18:00:00Z",
            ended_at: "2026-04-22T18:04:12Z",
            duration_seconds: 252,
            transcript: [
              { role: "user", text: "hi Belle" },
              { role: "agent", text: "hi Emma!" },
            ],
          },
        ],
        total: 1,
      }),
    });

    render(await CallsPage({ params: { id: "u1", childId: "c1" } }));

    expect(await screen.findByText(/belle/i)).toBeInTheDocument();
    expect(screen.getByText(/4:12/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/view transcript/i));
    expect(screen.getByText(/hi Belle/)).toBeInTheDocument();
  });

  it("shows empty state when child has no calls", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], total: 0 }),
    });

    render(await CallsPage({ params: { id: "u1", childId: "c1" } }));
    expect(await screen.findByText(/no calls yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8.2: Run and verify failure**

```bash
cd admin && pnpm vitest run tests/CallsPage.test.tsx
```

Expected: fail — module not found.

- [ ] **Step 8.3: Implement the page**

Create `admin/app/users/[id]/children/[childId]/calls/page.tsx`:

```tsx
import { headers } from "next/headers";

type Transcript = { role: "user" | "agent"; text: string; time?: number };

type CallItem = {
  id: string;
  princess: string;
  locale: string;
  state: string;
  ended_reason: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  transcript: Transcript[] | null;
};

type CallListResponse = { items: CallItem[]; total: number };

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

async function fetchCalls(childId: string): Promise<CallListResponse> {
  const base = process.env.INTERNAL_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}/admin/children/${childId}/calls`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load calls: ${res.status}`);
  return res.json();
}

export default async function CallsPage({
  params,
}: {
  params: { id: string; childId: string };
}) {
  const data = await fetchCalls(params.childId);

  if (data.total === 0) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold mb-4">Call history</h1>
        <p className="text-gray-500">No calls yet.</p>
      </main>
    );
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold mb-4">Call history ({data.total})</h1>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b">
            <th className="py-2">Date</th>
            <th>Character</th>
            <th>Duration</th>
            <th>Reason</th>
            <th>Transcript</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((call) => (
            <CallRow key={call.id} call={call} />
          ))}
        </tbody>
      </table>
    </main>
  );
}

function CallRow({ call }: { call: CallItem }) {
  return (
    <>
      <tr className="border-b">
        <td className="py-2">{new Date(call.started_at).toLocaleString()}</td>
        <td className="capitalize">{call.princess}</td>
        <td>{formatDuration(call.duration_seconds)}</td>
        <td>{call.ended_reason ?? "—"}</td>
        <td>
          <details>
            <summary className="cursor-pointer text-blue-600">View transcript</summary>
            <div className="mt-2 space-y-1 text-sm">
              {(call.transcript ?? []).map((turn, i) => (
                <div key={i}>
                  <strong>{turn.role === "user" ? "Child" : "Princess"}:</strong> {turn.text}
                </div>
              ))}
            </div>
          </details>
        </td>
      </tr>
    </>
  );
}
```

- [ ] **Step 8.4: Run test and verify pass**

```bash
cd admin && pnpm vitest run tests/CallsPage.test.tsx
```

Expected: 2/2 PASS.

- [ ] **Step 8.5: Add "View call history" link on the child detail page**

Find the existing child detail page (look inside `admin/app/children/` or `admin/app/users/[id]/`). At a visible location in the child row/detail, add:

```tsx
<a
  href={`/users/${userId}/children/${child.id}/calls`}
  className="text-blue-600 hover:underline ml-4"
>
  View call history
</a>
```

- [ ] **Step 8.6: Commit**

```bash
git add admin/app/users/[id]/children/[childId]/calls/page.tsx admin/tests/CallsPage.test.tsx admin/
git commit -m "feat(admin): add call history page per child"
```

---

## Task 9: Mobile — dependencies and permissions

**Files:**
- Modify: `mobile/pubspec.yaml`
- Modify: `mobile/ios/Runner/Info.plist`
- Modify: `mobile/android/app/src/main/AndroidManifest.xml`

- [ ] **Step 9.1: Add Dart dependencies**

Open `mobile/pubspec.yaml` and add under `dependencies:`:

```yaml
  web_socket_channel: ^2.4.0
  permission_handler: ^11.3.0
  record: ^5.1.0
  audioplayers: ^6.0.0
```

If the project already has `just_audio` / `audio_service` (per CLAUDE.md), skip `audioplayers`. Then:

```bash
cd mobile && flutter pub get
```

- [ ] **Step 9.2: Add iOS microphone permission**

Edit `mobile/ios/Runner/Info.plist`. Inside the top-level `<dict>`, add:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>The Royal Dispatch uses the microphone so you can talk with the princesses.</string>
```

- [ ] **Step 9.3: Add Android microphone permission**

Edit `mobile/android/app/src/main/AndroidManifest.xml`. Near the existing `<uses-permission>` entries, add:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
```

- [ ] **Step 9.4: Verify the app still builds**

```bash
cd mobile && flutter analyze && flutter test
```

Expected: no new errors.

- [ ] **Step 9.5: Commit**

```bash
git add mobile/pubspec.yaml mobile/pubspec.lock mobile/ios/Runner/Info.plist mobile/android/app/src/main/AndroidManifest.xml
git commit -m "feat(mobile): add websocket + mic permissions for call feature"
```

---

## Task 10: Mobile — CallApi service

**Files:**
- Create: `mobile/lib/services/call_api.dart`
- Create: `mobile/test/services/call_api_test.dart`

- [ ] **Step 10.1: Write the failing test**

Create `mobile/test/services/call_api_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:http/http.dart' as http;
import 'package:royal_dispatch/services/call_api.dart';

class MockClient extends Mock implements http.Client {}

void main() {
  setUpAll(() {
    registerFallbackValue(Uri.parse("http://x"));
  });

  late MockClient client;
  late CallApi api;

  setUp(() {
    client = MockClient();
    api = CallApi(
      baseUrl: "http://backend.test",
      token: "tok",
      httpClient: client,
    );
  });

  test("start returns typed success on 200", () async {
    when(() => client.post(any(), headers: any(named: "headers"), body: any(named: "body")))
        .thenAnswer((_) async => http.Response(
            '{"conversation_id":"c1","signed_url":"wss://x","expires_at":"2026-04-22T00:00:00Z","princess_display_name":"Belle","max_duration_seconds":300}',
            200));

    final result = await api.start(childId: "c-1", princess: "belle", locale: "en");

    expect(result.conversationId, "c1");
    expect(result.signedUrl, "wss://x");
    expect(result.princessDisplayName, "Belle");
    expect(result.maxDurationSeconds, 300);
  });

  test("start maps 409 to CallStartError.dailyCapReached", () async {
    when(() => client.post(any(), headers: any(named: "headers"), body: any(named: "body")))
        .thenAnswer((_) async => http.Response('{"detail":"daily_cap_reached"}', 409));

    expect(
      () => api.start(childId: "c-1", princess: "belle", locale: "en"),
      throwsA(isA<CallStartError>().having((e) => e.reason, "reason", CallStartReason.dailyCapReached)),
    );
  });

  test("start maps 403 to princessNotFavorite", () async {
    when(() => client.post(any(), headers: any(named: "headers"), body: any(named: "body")))
        .thenAnswer((_) async => http.Response('{"detail":"princess_not_favorite"}', 403));

    expect(
      () => api.start(childId: "c-1", princess: "belle", locale: "en"),
      throwsA(isA<CallStartError>().having((e) => e.reason, "reason", CallStartReason.princessNotFavorite)),
    );
  });

  test("start maps 503 to upstreamUnavailable", () async {
    when(() => client.post(any(), headers: any(named: "headers"), body: any(named: "body")))
        .thenAnswer((_) async => http.Response('{"detail":"upstream_unavailable"}', 503));

    expect(
      () => api.start(childId: "c-1", princess: "belle", locale: "en"),
      throwsA(isA<CallStartError>().having((e) => e.reason, "reason", CallStartReason.upstreamUnavailable)),
    );
  });
}
```

- [ ] **Step 10.2: Run and verify failure**

```bash
cd mobile && flutter test test/services/call_api_test.dart
```

Expected: compile errors (module missing).

- [ ] **Step 10.3: Implement CallApi**

Create `mobile/lib/services/call_api.dart`:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

enum CallStartReason {
  dailyCapReached,
  princessNotFavorite,
  childNotFound,
  upstreamUnavailable,
  unknown,
}

class CallStartError implements Exception {
  final CallStartReason reason;
  final int statusCode;
  CallStartError(this.reason, this.statusCode);

  @override
  String toString() => 'CallStartError($reason, status=$statusCode)';
}

class CallStartResult {
  final String conversationId;
  final String signedUrl;
  final String expiresAt;
  final String princessDisplayName;
  final int maxDurationSeconds;

  CallStartResult({
    required this.conversationId,
    required this.signedUrl,
    required this.expiresAt,
    required this.princessDisplayName,
    required this.maxDurationSeconds,
  });

  factory CallStartResult.fromJson(Map<String, dynamic> j) => CallStartResult(
        conversationId: j["conversation_id"] as String,
        signedUrl: j["signed_url"] as String,
        expiresAt: j["expires_at"] as String,
        princessDisplayName: j["princess_display_name"] as String,
        maxDurationSeconds: j["max_duration_seconds"] as int,
      );
}

class CallApi {
  final String baseUrl;
  final String token;
  final http.Client httpClient;

  CallApi({required this.baseUrl, required this.token, http.Client? httpClient})
      : httpClient = httpClient ?? http.Client();

  Future<CallStartResult> start({
    required String childId,
    required String princess,
    required String locale,
  }) async {
    final response = await httpClient.post(
      Uri.parse("$baseUrl/call/start"),
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": token,
      },
      body: jsonEncode({
        "child_id": childId,
        "princess": princess,
        "locale": locale,
      }),
    );

    if (response.statusCode == 200) {
      return CallStartResult.fromJson(jsonDecode(response.body));
    }

    CallStartReason reason;
    switch (response.statusCode) {
      case 409:
        reason = CallStartReason.dailyCapReached;
        break;
      case 403:
        reason = CallStartReason.princessNotFavorite;
        break;
      case 404:
        reason = CallStartReason.childNotFound;
        break;
      case 503:
        reason = CallStartReason.upstreamUnavailable;
        break;
      default:
        reason = CallStartReason.unknown;
    }
    throw CallStartError(reason, response.statusCode);
  }
}
```

- [ ] **Step 10.4: Run test and verify pass**

```bash
cd mobile && flutter test test/services/call_api_test.dart
```

Expected: 4/4 PASS.

- [ ] **Step 10.5: Commit**

```bash
git add mobile/lib/services/call_api.dart mobile/test/services/call_api_test.dart
git commit -m "feat(mobile): CallApi service with typed error mapping"
```

---

## Task 11: Mobile — CallProvider state machine

**Files:**
- Create: `mobile/lib/providers/call_provider.dart`
- Create: `mobile/test/providers/call_provider_test.dart`

- [ ] **Step 11.1: Write the failing test**

Create `mobile/test/providers/call_provider_test.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/providers/call_provider.dart';

void main() {
  test("initial state is idle", () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    expect(container.read(callProvider).status, CallStatus.idle);
  });

  test("transitions through requesting → connecting → inCall", () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(callProvider.notifier);

    notifier.markRequesting();
    expect(container.read(callProvider).status, CallStatus.requesting);

    notifier.markConnecting(princess: "belle", maxDurationSeconds: 300);
    expect(container.read(callProvider).status, CallStatus.connecting);
    expect(container.read(callProvider).princess, "belle");

    notifier.markInCall();
    expect(container.read(callProvider).status, CallStatus.inCall);
  });

  test("error transitions set reason", () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(callProvider.notifier);

    notifier.markError(CallErrorReason.dailyCap);
    expect(container.read(callProvider).status, CallStatus.error);
    expect(container.read(callProvider).error, CallErrorReason.dailyCap);
  });

  test("end resets to idle", () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(callProvider.notifier);

    notifier.markRequesting();
    notifier.markEnded();
    expect(container.read(callProvider).status, CallStatus.ended);

    notifier.reset();
    expect(container.read(callProvider).status, CallStatus.idle);
  });
}
```

- [ ] **Step 11.2: Run and verify failure**

```bash
cd mobile && flutter test test/providers/call_provider_test.dart
```

Expected: compile errors.

- [ ] **Step 11.3: Implement the state machine**

Create `mobile/lib/providers/call_provider.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

enum CallStatus { idle, requesting, connecting, inCall, ending, ended, error }

enum CallErrorReason {
  micDenied,
  dailyCap,
  princessNotFavorite,
  network,
  dropped,
  upstreamUnavailable,
  unknown,
}

class CallState {
  final CallStatus status;
  final String? princess;
  final int? maxDurationSeconds;
  final CallErrorReason? error;

  const CallState({
    this.status = CallStatus.idle,
    this.princess,
    this.maxDurationSeconds,
    this.error,
  });

  CallState copy({
    CallStatus? status,
    String? princess,
    int? maxDurationSeconds,
    CallErrorReason? error,
  }) =>
      CallState(
        status: status ?? this.status,
        princess: princess ?? this.princess,
        maxDurationSeconds: maxDurationSeconds ?? this.maxDurationSeconds,
        error: error ?? this.error,
      );
}

class CallNotifier extends StateNotifier<CallState> {
  CallNotifier() : super(const CallState());

  void markRequesting() => state = state.copy(status: CallStatus.requesting, error: null);

  void markConnecting({required String princess, required int maxDurationSeconds}) =>
      state = state.copy(
        status: CallStatus.connecting,
        princess: princess,
        maxDurationSeconds: maxDurationSeconds,
      );

  void markInCall() => state = state.copy(status: CallStatus.inCall);

  void markEnding() => state = state.copy(status: CallStatus.ending);

  void markEnded() => state = state.copy(status: CallStatus.ended);

  void markError(CallErrorReason reason) =>
      state = state.copy(status: CallStatus.error, error: reason);

  void reset() => state = const CallState();
}

final callProvider =
    StateNotifierProvider<CallNotifier, CallState>((ref) => CallNotifier());
```

- [ ] **Step 11.4: Run test and verify pass**

```bash
cd mobile && flutter test test/providers/call_provider_test.dart
```

Expected: 4/4 PASS.

- [ ] **Step 11.5: Commit**

```bash
git add mobile/lib/providers/call_provider.dart mobile/test/providers/call_provider_test.dart
git commit -m "feat(mobile): CallProvider state machine"
```

---

## Task 12: Mobile — ElevenLabs Convai WebSocket client wrapper

**Files:**
- Create: `mobile/lib/services/elevenlabs_convai_client.dart`

This task does NOT include a unit test — the WebSocket + mic interaction is integration-level and verified manually via the smoke test in Task 16. The wrapper is intentionally thin so the surface area is small.

- [ ] **Step 12.1: Implement the client**

Create `mobile/lib/services/elevenlabs_convai_client.dart`:

```dart
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:record/record.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

enum ConvaiConnectionEvent { connected, disconnected, error }

class ElevenLabsConvaiClient {
  final String signedUrl;
  final void Function(ConvaiConnectionEvent event, {String? detail}) onEvent;
  final void Function(Uint8List audioBytes) onAgentAudio;

  WebSocketChannel? _channel;
  final AudioRecorder _recorder = AudioRecorder();
  StreamSubscription<Uint8List>? _micSub;

  ElevenLabsConvaiClient({
    required this.signedUrl,
    required this.onEvent,
    required this.onAgentAudio,
  });

  Future<void> connect() async {
    try {
      _channel = WebSocketChannel.connect(Uri.parse(signedUrl));
      _channel!.stream.listen(
        _handleMessage,
        onError: (e) => onEvent(ConvaiConnectionEvent.error, detail: e.toString()),
        onDone: () => onEvent(ConvaiConnectionEvent.disconnected),
      );
      onEvent(ConvaiConnectionEvent.connected);
      await _startMicStream();
    } catch (e) {
      onEvent(ConvaiConnectionEvent.error, detail: e.toString());
      rethrow;
    }
  }

  Future<void> _startMicStream() async {
    if (!await _recorder.hasPermission()) {
      throw StateError("Microphone permission not granted");
    }
    final stream = await _recorder.startStream(const RecordConfig(
      encoder: AudioEncoder.pcm16bits,
      sampleRate: 16000,
      numChannels: 1,
    ));
    _micSub = stream.listen((chunk) {
      if (_channel == null) return;
      _channel!.sink.add(jsonEncode({
        "user_audio_chunk": base64Encode(chunk),
      }));
    });
  }

  void _handleMessage(dynamic message) {
    if (message is! String) return;
    try {
      final decoded = jsonDecode(message) as Map<String, dynamic>;
      final type = decoded["type"];
      if (type == "audio") {
        final b64 = decoded["audio_event"]?["audio_base_64"] as String?;
        if (b64 != null) {
          onAgentAudio(base64Decode(b64));
        }
      }
      // Other message types (agent_response, interruption) surfaced later as needed.
    } catch (_) {
      // Ignore malformed frames.
    }
  }

  Future<void> close() async {
    await _micSub?.cancel();
    await _recorder.stop();
    await _channel?.sink.close();
    _channel = null;
  }
}
```

> **Implementation note:** The exact ElevenLabs Convai WebSocket frame schema (audio-in key, audio-out type) should be re-verified against their current docs when implementing. The structure above matches their public spec as of 2026-04; if they changed it, adjust the two JSON keys in this file and the tests will continue to work (tests don't assert on the wire format).

- [ ] **Step 12.2: Quick compile check**

```bash
cd mobile && flutter analyze lib/services/elevenlabs_convai_client.dart
```

Expected: "No issues found."

- [ ] **Step 12.3: Commit**

```bash
git add mobile/lib/services/elevenlabs_convai_client.dart
git commit -m "feat(mobile): ElevenLabs Convai WebSocket client wrapper"
```

---

## Task 13: Mobile — BottomNav: 3 tabs + router route

**Files:**
- Modify: `mobile/lib/widgets/bottom_nav.dart`
- Modify: `mobile/lib/router.dart`

- [ ] **Step 13.1: Update BottomNav to 3 tabs**

Edit `mobile/lib/widgets/bottom_nav.dart`. Replace the `build` method body with a three-tab version:

```dart
@override
Widget build(BuildContext context) {
  final location = GoRouterState.of(context).matchedLocation;
  final isInbox = location == '/home/inbox';
  final isStory = location == '/home/story';
  final isCall = location == '/home/call';

  return SafeArea(
    top: false,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
      child: GlassCard(
        variant: GlassVariant.nav,
        borderRadius: 28,
        child: SizedBox(
          height: 80,
          child: Row(children: [
            _NavTab(
              iconAsset: 'assets/icons/inbox-3d.png',
              label: 'Inbox',
              isActive: isInbox,
              onTap: () { HapticFeedback.lightImpact(); context.go('/home/inbox'); },
            ),
            _NavTab(
              iconAsset: 'assets/icons/story-3d.png',
              label: 'Story',
              isActive: isStory,
              onTap: () { HapticFeedback.lightImpact(); context.go('/home/story'); },
            ),
            _NavTab(
              iconAsset: 'assets/icons/call-3d.png',
              label: 'Call',
              isActive: isCall,
              onTap: () { HapticFeedback.lightImpact(); context.go('/home/call'); },
            ),
          ]),
        ),
      ),
    ),
  );
}
```

> **Asset note:** `assets/icons/call-3d.png` is a new icon asset expected to be generated externally (Nanobanana) per the spec. Until it lands, the app will fall back to a broken image but the tab will still be tappable. Add the asset to `pubspec.yaml`'s `assets:` list:
>
> ```yaml
> flutter:
>   assets:
>     - assets/icons/inbox-3d.png
>     - assets/icons/story-3d.png
>     - assets/icons/call-3d.png
> ```

- [ ] **Step 13.2: Add `/home/call` route in router.dart**

Edit `mobile/lib/router.dart`. Inside the `ShellRoute` routes list, after the existing `/home/inbox` and `/home/story` routes, add:

```dart
GoRoute(
  path: '/home/call',
  builder: (context, state) => const CallContactsScreen(),
),
GoRoute(
  path: '/call/:princess',
  builder: (context, state) => CallScreen(
    princess: state.pathParameters['princess']!,
  ),
),
```

At the top of the file, add the imports:

```dart
import 'package:royal_dispatch/screens/call_contacts_screen.dart';
import 'package:royal_dispatch/screens/call_screen.dart';
```

(Both screens are created in Tasks 14 and 15 — expect `flutter analyze` to flag missing symbols until those land.)

- [ ] **Step 13.3: Commit**

```bash
git add mobile/lib/widgets/bottom_nav.dart mobile/lib/router.dart mobile/pubspec.yaml
git commit -m "feat(mobile): add third Call tab to bottom nav + router route"
```

---

## Task 14: Mobile — CallContactsScreen (the list)

**Files:**
- Create: `mobile/lib/screens/call_contacts_screen.dart`
- Create: `mobile/test/screens/call_contacts_screen_test.dart`

- [ ] **Step 14.1: Write the failing widget test**

Create `mobile/test/screens/call_contacts_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/providers/call_provider.dart';
import 'package:royal_dispatch/screens/call_contacts_screen.dart';

void main() {
  testWidgets("renders one row per favorite princess with a call button",
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          selectedChildFavoritePrincessesProvider.overrideWith((ref) => const ["belle", "elsa"]),
        ],
        child: const MaterialApp(home: CallContactsScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text("Belle"), findsOneWidget);
    expect(find.text("Elsa"), findsOneWidget);
    expect(find.byTooltip("Call Belle"), findsOneWidget);
    expect(find.byTooltip("Call Elsa"), findsOneWidget);
  });

  testWidgets("call button is disabled while call state is not idle", (tester) async {
    final container = ProviderContainer(overrides: [
      selectedChildFavoritePrincessesProvider.overrideWith((ref) => const ["belle"]),
    ]);
    container.read(callProvider.notifier).markRequesting();

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: CallContactsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    final button = tester.widget<IconButton>(find.byTooltip("Call Belle"));
    expect(button.onPressed, isNull);
  });
}
```

- [ ] **Step 14.2: Run and verify failure**

```bash
cd mobile && flutter test test/screens/call_contacts_screen_test.dart
```

Expected: module missing / provider not defined.

- [ ] **Step 14.3: Ensure `selectedChildFavoritePrincessesProvider` exists**

Check `mobile/lib/providers/family_provider.dart`. If a provider exposing the selected child's favorite princesses does not exist yet, add it. Example addition (place near the other `selectedChild*` providers):

```dart
final selectedChildFavoritePrincessesProvider = Provider<List<String>>((ref) {
  final family = ref.watch(familyProvider).value;
  final childId = ref.watch(selectedChildIdProvider);
  if (family == null || childId == null) return const [];
  final child = family.children.firstWhere(
    (c) => c.id == childId,
    orElse: () => family.children.first,
  );
  return List<String>.from(child.favoritePrincesses);
});
```

If the `Child` model field is named differently, adjust to match.

- [ ] **Step 14.4: Implement CallContactsScreen**

Create `mobile/lib/screens/call_contacts_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/providers/call_provider.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/widgets/glass_card.dart';

String _displayName(String id) => id.isEmpty ? id : id[0].toUpperCase() + id.substring(1);

class CallContactsScreen extends ConsumerWidget {
  const CallContactsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final favorites = ref.watch(selectedChildFavoritePrincessesProvider);
    final callState = ref.watch(callProvider);
    final busy = callState.status != CallStatus.idle;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: ListView.separated(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
          itemCount: favorites.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (_, i) {
            final princess = favorites[i];
            final name = _displayName(princess);
            return GlassCard(
              variant: GlassVariant.card,
              borderRadius: 20,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(children: [
                  CircleAvatar(
                    radius: 32,
                    backgroundImage: AssetImage('assets/princesses/$princess.png'),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Text(
                      name,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: "Call $name",
                    icon: Image.asset(
                      'assets/icons/scepter-call.png',
                      width: 44,
                      height: 44,
                    ),
                    onPressed: busy
                        ? null
                        : () => context.push('/call/$princess'),
                  ),
                ]),
              ),
            );
          },
        ),
      ),
    );
  }
}
```

- [ ] **Step 14.5: Run test and verify pass**

```bash
cd mobile && flutter test test/screens/call_contacts_screen_test.dart
```

Expected: 2/2 PASS.

- [ ] **Step 14.6: Commit**

```bash
git add mobile/lib/screens/call_contacts_screen.dart mobile/lib/providers/family_provider.dart mobile/test/screens/call_contacts_screen_test.dart
git commit -m "feat(mobile): CallContactsScreen with favorites list"
```

---

## Task 15: Mobile — CallScreen (fullscreen call + error states)

**Files:**
- Create: `mobile/lib/screens/call_screen.dart`
- Create: `mobile/test/screens/call_screen_test.dart`

This screen is large but we focus tests on three observable behaviors: countdown ticks, mute toggle, and end-call transitions. Error-state layouts (illustrations) are not asserted in tests; the rendering correctness of those is manual.

- [ ] **Step 15.1: Write the failing widget test**

Create `mobile/test/screens/call_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/providers/call_provider.dart';
import 'package:royal_dispatch/screens/call_screen.dart';

void main() {
  testWidgets("end button transitions state to ending", (tester) async {
    final container = ProviderContainer();
    container.read(callProvider.notifier).markConnecting(
          princess: "belle",
          maxDurationSeconds: 300,
        );
    container.read(callProvider.notifier).markInCall();

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: CallScreen(princess: "belle")),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip("End call"));
    await tester.pumpAndSettle();

    expect(container.read(callProvider).status, CallStatus.ending);
  });

  testWidgets("mute button toggles its icon/tooltip", (tester) async {
    final container = ProviderContainer();
    container.read(callProvider.notifier).markConnecting(
          princess: "belle",
          maxDurationSeconds: 300,
        );
    container.read(callProvider.notifier).markInCall();

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: CallScreen(princess: "belle")),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byTooltip("Mute"), findsOneWidget);
    await tester.tap(find.byTooltip("Mute"));
    await tester.pumpAndSettle();
    expect(find.byTooltip("Unmute"), findsOneWidget);
  });
}
```

- [ ] **Step 15.2: Run and verify failure**

```bash
cd mobile && flutter test test/screens/call_screen_test.dart
```

Expected: missing module.

- [ ] **Step 15.3: Implement CallScreen**

Create `mobile/lib/screens/call_screen.dart`:

```dart
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/providers/call_provider.dart';

class CallScreen extends ConsumerStatefulWidget {
  final String princess;
  const CallScreen({super.key, required this.princess});

  @override
  ConsumerState<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends ConsumerState<CallScreen> {
  Timer? _countdownTimer;
  int _remainingSeconds = 300;
  bool _muted = false;

  @override
  void initState() {
    super.initState();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() {
        _remainingSeconds = _remainingSeconds > 0 ? _remainingSeconds - 1 : 0;
      });
      if (_remainingSeconds == 0) _endCall();
    });
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  void _endCall() {
    ref.read(callProvider.notifier).markEnding();
    // Actual WebSocket close and navigation-back handled by a listener in app.dart
    // that watches callProvider and pops back to /home/call when state == ended.
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(callProvider);

    if (state.status == CallStatus.error) {
      return _ErrorSceneScaffold(reason: state.error ?? CallErrorReason.unknown);
    }
    if (state.status == CallStatus.ended) {
      // Auto-return. Render the goodbye scene briefly.
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) context.go('/home/call');
      });
      return _SceneScaffold(
        imageAsset: 'assets/images/call/call-ended.png',
        semanticsLabel: 'Call ended',
      );
    }

    final mm = (_remainingSeconds ~/ 60).toString().padLeft(1, '0');
    final ss = (_remainingSeconds % 60).toString().padLeft(2, '0');

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(
            'assets/images/call/call-in-progress-${widget.princess}.png',
            fit: BoxFit.cover,
            semanticLabel: 'Calling ${widget.princess}',
          ),
          Positioned(
            bottom: 40,
            left: 0,
            right: 0,
            child: Column(children: [
              Text(
                '$mm:$ss',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 24),
              Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                IconButton(
                  iconSize: 56,
                  tooltip: _muted ? 'Unmute' : 'Mute',
                  icon: Icon(_muted ? Icons.mic_off : Icons.mic, color: Colors.white),
                  onPressed: () => setState(() => _muted = !_muted),
                ),
                IconButton(
                  iconSize: 64,
                  tooltip: 'End call',
                  icon: const Icon(Icons.call_end, color: Colors.redAccent),
                  onPressed: _endCall,
                ),
                IconButton(
                  iconSize: 56,
                  tooltip: 'Volume',
                  icon: const Icon(Icons.volume_up, color: Colors.white),
                  onPressed: () {},
                ),
              ]),
            ]),
          ),
        ],
      ),
    );
  }
}

class _SceneScaffold extends StatelessWidget {
  final String imageAsset;
  final String semanticsLabel;
  const _SceneScaffold({required this.imageAsset, required this.semanticsLabel});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Image.asset(
          imageAsset,
          fit: BoxFit.cover,
          semanticLabel: semanticsLabel,
        ),
      ),
    );
  }
}

class _ErrorSceneScaffold extends StatelessWidget {
  final CallErrorReason reason;
  const _ErrorSceneScaffold({required this.reason});

  @override
  Widget build(BuildContext context) {
    final (asset, label) = switch (reason) {
      CallErrorReason.micDenied => (
        'assets/images/call/call-mic-permission.png',
        'Microphone permission needed',
      ),
      CallErrorReason.dailyCap => (
        'assets/images/call/call-daily-cap.png',
        'You have called three times today',
      ),
      CallErrorReason.network || CallErrorReason.upstreamUnavailable => (
        'assets/images/call/call-friends-sleeping.png',
        'Your friends are sleeping',
      ),
      CallErrorReason.dropped => (
        'assets/images/call/call-dropped.png',
        'Call disconnected',
      ),
      _ => (
        'assets/images/call/call-friends-sleeping.png',
        'Something went wrong',
      ),
    };
    return _SceneScaffold(imageAsset: asset, semanticsLabel: label);
  }
}
```

- [ ] **Step 15.4: Run tests and verify pass**

```bash
cd mobile && flutter test test/screens/call_screen_test.dart
```

Expected: 2/2 PASS.

> **Asset note:** The image files referenced in this screen (`assets/images/call/*.png`) are generated separately via Nanobanana following the scene descriptions in the spec. Until they land, widget tests still pass because `Image.asset` failing at runtime doesn't fail widget tree assertions. Manual visual verification is part of Task 17.

- [ ] **Step 15.5: Commit**

```bash
git add mobile/lib/screens/call_screen.dart mobile/test/screens/call_screen_test.dart
git commit -m "feat(mobile): CallScreen with countdown, mute, end, error scenes"
```

---

## Task 16: Mobile — wire start flow from CallContactsScreen button tap

**Files:**
- Modify: `mobile/lib/screens/call_contacts_screen.dart` — wire tap to start flow
- Modify: `mobile/lib/app.dart` (or wherever global listeners live) — navigate on state changes

The current button navigates to `/call/{princess}` but does not kick off `/call/start`. We need to either start the HTTP call inside `CallScreen.initState` or hoist it into an explicit action. Hoisting keeps the screen focused on presentation.

- [ ] **Step 16.1: Add a "start call" action on CallNotifier**

Edit `mobile/lib/providers/call_provider.dart`. Add a method that orchestrates the full start flow:

```dart
import 'package:royal_dispatch/services/call_api.dart';
import 'package:royal_dispatch/services/elevenlabs_convai_client.dart';

// ... existing enum / state / notifier definitions above ...

class CallNotifier extends StateNotifier<CallState> {
  CallNotifier(this._api) : super(const CallState());

  final CallApi _api;
  ElevenLabsConvaiClient? _client;

  Future<void> startCall({
    required String childId,
    required String princess,
    required String locale,
  }) async {
    markRequesting();
    try {
      final result = await _api.start(
        childId: childId,
        princess: princess,
        locale: locale,
      );
      markConnecting(
        princess: princess,
        maxDurationSeconds: result.maxDurationSeconds,
      );
      _client = ElevenLabsConvaiClient(
        signedUrl: result.signedUrl,
        onEvent: (event, {detail}) {
          if (event == ConvaiConnectionEvent.connected) markInCall();
          if (event == ConvaiConnectionEvent.disconnected && state.status == CallStatus.inCall) {
            markError(CallErrorReason.dropped);
          }
          if (event == ConvaiConnectionEvent.error) markError(CallErrorReason.network);
        },
        onAgentAudio: (_) {/* playback handled by platform audio pipeline */},
      );
      await _client!.connect();
    } on CallStartError catch (e) {
      markError(switch (e.reason) {
        CallStartReason.dailyCapReached => CallErrorReason.dailyCap,
        CallStartReason.princessNotFavorite => CallErrorReason.princessNotFavorite,
        CallStartReason.upstreamUnavailable => CallErrorReason.upstreamUnavailable,
        _ => CallErrorReason.unknown,
      });
    } catch (_) {
      markError(CallErrorReason.network);
    }
  }

  Future<void> endCall() async {
    markEnding();
    await _client?.close();
    _client = null;
    markEnded();
  }

  // ... existing mark* methods unchanged ...
}
```

And change the provider to inject `CallApi`:

```dart
final callApiProvider = Provider<CallApi>((ref) {
  final token = ref.watch(authProvider).value;
  final baseUrl = const String.fromEnvironment('BACKEND_URL', defaultValue: 'http://localhost:8000');
  return CallApi(baseUrl: baseUrl, token: token ?? '');
});

final callProvider = StateNotifierProvider<CallNotifier, CallState>((ref) {
  return CallNotifier(ref.watch(callApiProvider));
});
```

- [ ] **Step 16.2: Update CallProvider tests to inject a fake CallApi**

Edit `mobile/test/providers/call_provider_test.dart`. The existing tests now need to supply a `CallApi` override because `CallNotifier` requires one:

Replace each `ProviderContainer()` with:

```dart
final container = ProviderContainer(overrides: [
  callApiProvider.overrideWithValue(
    CallApi(baseUrl: "http://t", token: "tok"),
  ),
]);
```

Re-run: `flutter test test/providers/call_provider_test.dart`. Expected: still 4/4 PASS (the existing tests don't exercise `startCall`, only the `mark*` helpers).

- [ ] **Step 16.3: Wire the tap in `call_contacts_screen.dart`**

Inside the `IconButton.onPressed` of CallContactsScreen, replace `context.push('/call/$princess')` with:

```dart
onPressed: busy ? null : () async {
  final childId = ref.read(selectedChildIdProvider);
  final locale = ref.read(localeProvider).toLanguageTag().startsWith('vi') ? 'vi' : 'en';
  if (childId == null) return;
  context.push('/call/$princess');
  await ref.read(callProvider.notifier).startCall(
    childId: childId,
    princess: princess,
    locale: locale,
  );
},
```

If `localeProvider` exposes a `Locale` directly, adjust the extraction. If the project stores locale as a string, use the stored value.

- [ ] **Step 16.4: Run all mobile tests**

```bash
cd mobile && flutter test
```

Expected: all tests pass.

- [ ] **Step 16.5: Commit**

```bash
git add mobile/lib/providers/call_provider.dart mobile/lib/screens/call_contacts_screen.dart mobile/test/providers/call_provider_test.dart
git commit -m "feat(mobile): wire CallContactsScreen tap to backend /call/start"
```

---

## Task 17: Docker compose + environment

**Files:**
- Modify: `docker-compose.yml`
- Modify: `backend/.env.example` (if it exists)

- [ ] **Step 17.1: Add env vars**

Open `docker-compose.yml`. Find the `backend` service `environment:` block. Add:

```yaml
      ELEVENLABS_AGENT_ID: ${ELEVENLABS_AGENT_ID}
      ELEVENLABS_WEBHOOK_SECRET: ${ELEVENLABS_WEBHOOK_SECRET}
```

If `backend/.env.example` exists, add:

```
ELEVENLABS_AGENT_ID=
ELEVENLABS_WEBHOOK_SECRET=
```

- [ ] **Step 17.2: Document in CLAUDE.md**

Edit `CLAUDE.md`. Find the "Key Env Vars" table for `backend/.env` and append `ELEVENLABS_AGENT_ID`, `ELEVENLABS_WEBHOOK_SECRET` to the list.

- [ ] **Step 17.3: Commit**

```bash
git add docker-compose.yml backend/.env.example CLAUDE.md
git commit -m "chore: document ElevenLabs Convai env vars"
```

---

## Task 18: Manual smoke test (documented, executed once pre-merge)

**Files:** none (this task has no code artifact)

This is the gating manual test run after all previous tasks are green.

- [ ] **Step 18.1: ElevenLabs dashboard setup**

- Log into the ElevenLabs dashboard.
- Create one Conversational AI agent. Voice, prompt, first_message can be placeholders — overrides will always replace them.
- Note the agent ID. Set `ELEVENLABS_AGENT_ID=<that id>` in local `.env`.
- Configure the post-call webhook: URL `https://<your-dev-backend>/webhooks/elevenlabs/conversation`, shared secret = a random 32-byte hex string, also placed into `ELEVENLABS_WEBHOOK_SECRET`.

- [ ] **Step 18.2: Seed a test child**

```bash
docker compose exec postgres psql -U royal -d royal_dispatch -c \
  "SELECT id, name, favorite_princesses FROM children LIMIT 1;"
```

If no child has `belle` in favorites, temporarily add it for the smoke test.

- [ ] **Step 18.3: Run the end-to-end call**

- Launch the mobile app against the dev backend.
- Select the test child.
- Navigate to the Call tab → tap Belle.
- Verify: the call connects, Belle's voice plays, mic is captured, conversation flows.
- Say one memorable thing the agent should store (e.g. "I got a new hamster named Pip").
- End the call via the end button.

- [ ] **Step 18.4: Verify server-side state**

```bash
# 1. Check calls row
docker compose exec postgres psql -U royal -d royal_dispatch -c \
  "SELECT id, princess, state, duration_seconds, ended_reason, transcript IS NOT NULL as has_transcript FROM calls ORDER BY started_at DESC LIMIT 1;"

# 2. Check admin UI
open http://localhost:3001  # should show the call in the child's call history

# 3. Check mem0 captured "Pip"
# (shape-check via Qdrant dashboard or a follow-up test story)
```

Expected: `state = 'completed'`, `duration_seconds > 0`, `has_transcript = t`, admin shows the call, mem0 contains a memory referencing Pip.

- [ ] **Step 18.5: Vietnamese smoke check**

- Change the app locale to Vietnamese.
- Repeat a short call with Belle.
- Confirm the princess responds in Vietnamese and the voice is acceptable.
- If any character is unusable in Vietnamese, file a follow-up note in the spec's "Open questions" section.

- [ ] **Step 18.6: iOS + Android permission check**

- Fresh install on a physical iPhone → tap Call → verify the microphone permission prompt appears → accept → call works.
- Fresh install on a physical Android device → same flow.

- [ ] **Step 18.7: Sign-off**

If all the above pass, merge the implementation branch. File follow-up tickets for any Vietnamese voice issues or image assets still pending.

---

## Self-Review

**Spec coverage check (spec → plan tasks):**

- §3 Architecture → Tasks 1, 4, 5, 6, 9–16 ✓
- §4.1 `/call/start` → Task 5 ✓
- §4.2 Override payload → Task 5 (step 5.3 builds and sends it), Task 4 mocks the send ✓
- §4.3 Webhook → Task 6 ✓
- §4.4 Admin endpoint → Task 7 ✓
- §5.1 Backend routes/call.py + service wrapper + migration → Tasks 1, 4, 5, 6 ✓
- §5.2 Persona YAML call fields → Tasks 2, 3 ✓
- §5.3 Mobile screens/providers/services → Tasks 10–16 ✓
- §5.4 Admin UI → Task 8 ✓
- §6 Kid-facing scene illustrations → referenced in Tasks 14, 15 (asset generation is external, noted explicitly) ✓
- §7 Security (HMAC, signed URL, per-call auth, per-day cap, transcript handling) → Tasks 5, 6, 7 ✓
- §8 Testing strategy → covered by Tasks 2 (persona schema), 4 (service), 5 (start routes), 6 (webhook), 7 (admin), 10–11, 14–15 ✓
- §9 Rollout (env vars, docker-compose, CLAUDE.md) → Task 17 ✓
- §10 Open questions → manual smoke (Task 18) explicitly checks VI voice quality ✓

**Placeholder scan:** No "TBD"/"TODO"/"similar to Task N"/"implement later" patterns remain. Asset paths (`assets/images/call/*.png`, `assets/icons/call-3d.png`) are intentional external artifacts, documented as such in-line.

**Type consistency:** `CallStartReason` and `CallErrorReason` are distinct enums on purpose (API-layer reason vs UI-layer reason). Mapping lives in `CallNotifier.startCall` (Task 16). Cross-checked.

**Noted risks at implementation time:**
1. `children.favorite_princesses` column name may differ in actual schema — Task 5 step 5.5 calls this out and asks the implementer to run `\d children` to verify.
2. The exact ElevenLabs webhook signature header name + Convai WebSocket frame schema should be verified against their current docs at implementation time — flagged inline in Tasks 6 and 12.
3. Image assets referenced by mobile screens are generated externally (Nanobanana) per the spec. Widget tests are assertion-based on logic, not pixel-based on rendering.
