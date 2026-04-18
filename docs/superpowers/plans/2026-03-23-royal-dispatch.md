# The Royal Dispatch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personalized bedtime storytelling PWA where Emma (age 4) receives nightly voice letters from Disney Princesses, generated from her parent's WhatsApp brief using FastAPI + LangGraph + ElevenLabs.

**Architecture:** Parent sends a WhatsApp voice/text brief via n8n → stored in Supabase. When Emma taps a princess on the iPad PWA, FastAPI triggers a LangGraph state machine that classifies the brief, loads the princess persona, generates a story with Claude, synthesizes it with ElevenLabs v3, and returns an audio URL. The PWA plays the audio with an ambient princess animation.

**Tech Stack:** Python 3.11 + FastAPI + LangGraph + langchain-anthropic + supabase-py + elevenlabs · Next.js 14 (App Router) + TypeScript + Tailwind CSS + next-intl · Supabase (Postgres + Storage) · n8n

---

## File Structure

```
the-royal-dispatch/
├── backend/
│   ├── main.py                        # FastAPI app + routes
│   ├── state.py                       # RoyalState TypedDict
│   ├── graph.py                       # LangGraph graph assembly
│   ├── nodes/
│   │   ├── __init__.py
│   │   ├── fetch_brief.py             # Node 1: fetch today's parent brief
│   │   ├── classify_tone.py           # Node 2: classify as praise/habit
│   │   ├── load_persona.py            # Node 3: load princess YAML config
│   │   ├── generate_story.py          # Node 4: generate letter text with audio tags
│   │   ├── synthesize_voice.py        # Node 5: ElevenLabs v3 synthesis
│   │   └── store_result.py            # Node 6: save audio URL to Supabase
│   ├── personas/
│   │   ├── elsa.yaml
│   │   ├── belle.yaml
│   │   ├── cinderella.yaml
│   │   └── ariel.yaml
│   ├── db/
│   │   ├── client.py                  # Supabase client singleton
│   │   └── migrations/
│   │       └── 001_initial.sql        # briefs + stories tables
│   ├── tests/
│   │   ├── conftest.py                # shared fixtures + mocks
│   │   ├── test_nodes/
│   │   │   ├── test_fetch_brief.py
│   │   │   ├── test_classify_tone.py
│   │   │   ├── test_load_persona.py
│   │   │   ├── test_generate_story.py
│   │   │   ├── test_synthesize_voice.py
│   │   │   └── test_store_result.py
│   │   └── test_api.py
│   ├── pyproject.toml
│   └── .env.example
├── frontend/
│   ├── app/
│   │   └── [locale]/
│   │       ├── layout.tsx             # locale provider wrapper
│   │       ├── page.tsx               # Royal Inbox
│   │       └── play/
│   │           └── [princess]/
│   │               └── page.tsx       # Letter playing screen
│   ├── components/
│   │   ├── PrincessCard.tsx           # Single letter card in inbox
│   │   ├── LanguageSelector.tsx       # EN/VI dropdown
│   │   └── AudioPlayer.tsx            # Audio + ambient animation
│   ├── lib/
│   │   └── api.ts                     # API client (POST /story, GET /story/today)
│   ├── messages/
│   │   ├── en.json                    # English UI strings
│   │   └── vi.json                    # Vietnamese UI strings
│   ├── public/
│   │   └── manifest.json              # PWA manifest
│   ├── tests/
│   │   ├── PrincessCard.test.tsx
│   │   ├── LanguageSelector.test.tsx
│   │   └── AudioPlayer.test.tsx
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── .env.local.example
└── n8n/
    └── whatsapp-brief.json            # n8n workflow export
```

---

## Task 1: Project Scaffold + Environment

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `frontend/` (Next.js app)
- Create: `frontend/.env.local.example`
- Create: `.gitignore`

- [ ] **Step 1: Scaffold the backend Python project**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch
mkdir -p backend/nodes backend/personas backend/db/migrations backend/tests/test_nodes
touch backend/nodes/__init__.py backend/tests/__init__.py backend/tests/test_nodes/__init__.py
```

- [ ] **Step 2: Create `backend/pyproject.toml`**

```toml
[project]
name = "royal-dispatch-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "langgraph>=0.2.0",
    "langchain-anthropic>=0.3.0",
    "supabase>=2.7.0",
    "elevenlabs>=1.9.0",
    "pyyaml>=6.0",
    "python-dotenv>=1.0.0",
    "httpx>=0.27.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
    "pytest-mock>=3.14.0",
    "httpx>=0.27.0",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Step 3: Create `backend/.env.example`**

```bash
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET=royal-audio
```

- [ ] **Step 4: Install backend dependencies**

```bash
cd backend
pip install -e ".[dev]"
```

Expected: no errors, packages installed.

- [ ] **Step 5: Scaffold the Next.js frontend**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch
npx create-next-app@latest frontend \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*"
```

- [ ] **Step 6: Install frontend dependencies**

```bash
cd frontend
npm install next-intl
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 7: Create `frontend/.env.local.example`**

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

- [ ] **Step 8: Create `.gitignore` at project root**

```
.env
.env.local
__pycache__/
.pytest_cache/
node_modules/
.next/
.superpowers/
*.mp3
```

- [ ] **Step 9: Commit**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch
git add backend/ frontend/ .gitignore
git commit -m "feat: scaffold backend and frontend projects"
```

---

## Task 2: Supabase Schema + Client

**Files:**
- Create: `backend/db/migrations/001_initial.sql`
- Create: `backend/db/client.py`
- Test: `backend/tests/test_api.py` (partial — db fixture)

- [ ] **Step 1: Write the failing test for the Supabase client**

```python
# backend/tests/conftest.py
import pytest
from unittest.mock import MagicMock, patch

@pytest.fixture
def mock_supabase(mocker):
    mock = MagicMock()
    mocker.patch("backend.db.client.create_client", return_value=mock)
    return mock
```

```python
# backend/tests/test_nodes/test_fetch_brief.py
from unittest.mock import MagicMock
from backend.db.client import get_supabase_client

def test_get_supabase_client_returns_singleton(mocker):
    mock_client = MagicMock()
    mocker.patch("backend.db.client.create_client", return_value=mock_client)
    # Reset module-level singleton for test isolation
    import backend.db.client as db_module
    db_module._client = None
    client1 = get_supabase_client()
    client2 = get_supabase_client()
    assert client1 is client2
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_nodes/test_fetch_brief.py::test_get_supabase_client_returns_singleton -v
```

Expected: `FAILED` — `ModuleNotFoundError: backend.db.client`

- [ ] **Step 3: Create `backend/db/client.py`**

```python
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_client: Client | None = None

def get_supabase_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_KEY"],
        )
    return _client
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && pytest tests/test_nodes/test_fetch_brief.py::test_get_supabase_client_returns_singleton -v
```

Expected: `PASSED`

- [ ] **Step 5: Create `backend/db/migrations/001_initial.sql`**

```sql
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
```

- [ ] **Step 6: Run the migration in Supabase**

Go to your Supabase project → SQL Editor → paste contents of `001_initial.sql` → Run.
Then go to Storage → create a bucket named `royal-audio` with public access enabled.

- [ ] **Step 7: Commit**

```bash
git add backend/db/ backend/tests/conftest.py backend/tests/test_nodes/test_fetch_brief.py
git commit -m "feat: add supabase client and schema migration"
```

---

## Task 3: Princess Persona Configs

**Files:**
- Create: `backend/personas/elsa.yaml`
- Create: `backend/personas/belle.yaml`
- Create: `backend/personas/cinderella.yaml`
- Create: `backend/personas/ariel.yaml`

- [ ] **Step 1: Create `backend/personas/elsa.yaml`**

```yaml
name: Queen Elsa
origin: Kingdom of Arendelle
voice_id: "21m00Tcm4TlvDq8ikWAM"  # Replace with real ElevenLabs voice ID
tone_style: "calm, majestic, warmly proud"
audio_tags:
  praise: ["[PROUD]", "[CALM]"]
  habit: ["[GENTLE]", "[CALM]"]
signature_phrase: "The cold never bothered me, and neither will this challenge — because you are a Princess."
metaphor: "Self-control is like the ice. It takes practice to keep it beautiful."
fallback_letter:
  en: "Emma, I was just thinking of you from Arendelle today. The snowflakes reminded me of how unique and special you are. Sweet dreams, my little princess."
  vi: "Emma ơi, hôm nay Elsa đã nghĩ đến em từ Arendelle. Những bông tuyết nhắc Elsa nhớ đến sự đặc biệt và duy nhất của em. Ngủ ngon, công chúa nhỏ của Elsa nhé."
```

- [ ] **Step 2: Create `backend/personas/belle.yaml`**

```yaml
name: Belle
origin: The Enchanted Castle
voice_id: "AZnzlk1XvdvUeBnXmlld"  # Replace with real ElevenLabs voice ID
tone_style: "gentle, curious, nurturing"
audio_tags:
  praise: ["[GENTLE]", "[CURIOUS]"]
  habit: ["[GENTLE]", "[CURIOUS]"]
signature_phrase: "I wrote about you in my special book today, Emma."
metaphor: "Even Lumiere had to learn patience. He practiced every single night."
fallback_letter:
  en: "Emma, Belle was reading her favourite book tonight and found a page that made her think of you. You have such a kind and curious heart. Sweet dreams."
  vi: "Emma ơi, Belle đang đọc quyển sách yêu thích tối nay và tìm thấy một trang khiến Belle nghĩ đến em. Em có một trái tim thật tốt bụng và tò mò. Ngủ ngon nhé."
```

- [ ] **Step 3: Create `backend/personas/cinderella.yaml`**

```yaml
name: Cinderella
origin: The Royal Palace
voice_id: "EXAVITQu4vr4xnSDxMaL"  # Replace with real ElevenLabs voice ID
tone_style: "gracious, resilient, hopeful"
audio_tags:
  praise: ["[PROUD]", "[GENTLE]"]
  habit: ["[GENTLE]", "[CALM]"]
signature_phrase: "Every princess was once a girl who never gave up."
metaphor: "Even glass slippers took practice to walk in. You just need to try one more time."
fallback_letter:
  en: "Emma, Cinderella was dancing in the ballroom tonight and wished you were there too. You have the grace of a true princess. Sweet dreams."
  vi: "Emma ơi, Cinderella đang khiêu vũ trong phòng khiêu vũ tối nay và ước rằng em cũng ở đó. Em có vẻ thanh lịch của một công chúa thật sự. Ngủ ngon."
```

- [ ] **Step 4: Create `backend/personas/ariel.yaml`**

```yaml
name: Ariel
origin: Under the Sea
voice_id: "pNInz6obpgDQGcFmaJgB"  # Replace with real ElevenLabs voice ID
tone_style: "adventurous, expressive, joyful"
audio_tags:
  praise: ["[EXCITED]", "[GENTLE]"]
  habit: ["[CURIOUS]", "[GENTLE]"]
signature_phrase: "I collect wonderful things, Emma — and you are the most wonderful of all."
metaphor: "Sebastian had to learn new songs every day. Each time it got a little easier."
fallback_letter:
  en: "Emma, Ariel was swimming through the coral gardens tonight and found the most beautiful shell — it reminded her of you. Sweet dreams, little mermaid friend."
  vi: "Emma ơi, Ariel đang bơi qua những vườn san hô tối nay và tìm thấy một chiếc vỏ ốc đẹp nhất — nó nhắc Ariel nhớ đến em. Ngủ ngon, người bạn nhỏ của Ariel nhé."
```

- [ ] **Step 5: Commit**

```bash
git add backend/personas/
git commit -m "feat: add princess persona YAML configs"
```

---

## Task 4: LangGraph State + fetch_brief Node

**Files:**
- Create: `backend/state.py`
- Create: `backend/nodes/fetch_brief.py`
- Test: `backend/tests/test_nodes/test_fetch_brief.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_nodes/test_fetch_brief.py
import pytest
from datetime import date
from unittest.mock import MagicMock
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
        story_text="",
        audio_url="",
        language="en",
    )

def test_fetch_brief_returns_brief_text(base_state, mocker):
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
        "text": "She shared her blocks today."
    }
    mocker.patch("backend.nodes.fetch_brief.get_supabase_client", return_value=mock_client)
    result = fetch_brief(base_state)
    assert result["brief"] == "She shared her blocks today."

def test_fetch_brief_uses_fallback_when_no_brief(base_state, mocker):
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = None
    mocker.patch("backend.nodes.fetch_brief.get_supabase_client", return_value=mock_client)
    result = fetch_brief(base_state)
    assert result["brief"] == "__fallback__"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_nodes/test_fetch_brief.py -v
```

Expected: `FAILED` — `ModuleNotFoundError`

- [ ] **Step 3: Create `backend/state.py`**

```python
from typing import TypedDict

class RoyalState(TypedDict):
    princess: str      # "elsa" | "belle" | "cinderella" | "ariel"
    date: str          # ISO date string, e.g. "2026-03-23"
    brief: str         # parent's WhatsApp text; "__fallback__" if none
    tone: str          # "praise" | "habit"
    persona: dict      # loaded from YAML
    story_text: str    # generated letter with ElevenLabs audio tags
    audio_url: str     # Supabase Storage public URL
    language: str      # "en" | "vi"
```

- [ ] **Step 4: Create `backend/nodes/fetch_brief.py`**

```python
from datetime import date as date_type
from backend.state import RoyalState
from backend.db.client import get_supabase_client

def fetch_brief(state: RoyalState) -> dict:
    client = get_supabase_client()
    today = state["date"]
    result = (
        client.table("briefs")
        .select("text")
        .eq("date", today)
        .maybe_single()
        .execute()
    )
    if result.data:
        return {"brief": result.data["text"]}
    return {"brief": "__fallback__"}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_nodes/test_fetch_brief.py -v
```

Expected: `2 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/state.py backend/nodes/fetch_brief.py backend/tests/test_nodes/test_fetch_brief.py
git commit -m "feat: add RoyalState and fetch_brief node"
```

---

## Task 5: classify_tone Node

**Files:**
- Create: `backend/nodes/classify_tone.py`
- Test: `backend/tests/test_nodes/test_classify_tone.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_nodes/test_classify_tone.py
import pytest
from unittest.mock import MagicMock, patch
from backend.state import RoyalState
from backend.nodes.classify_tone import classify_tone
from datetime import date

@pytest.fixture
def praise_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She shared her blocks with her friend today.",
        tone="", persona={}, story_text="", audio_url="", language="en",
    )

@pytest.fixture
def habit_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She refused to brush her teeth tonight.",
        tone="", persona={}, story_text="", audio_url="", language="en",
    )

@pytest.fixture
def fallback_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="__fallback__",
        tone="", persona={}, story_text="", audio_url="", language="en",
    )

def test_classify_tone_returns_praise(praise_state, mocker):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "praise"
    mocker.patch("backend.nodes.classify_tone.get_llm", return_value=mock_llm)
    result = classify_tone(praise_state)
    assert result["tone"] == "praise"

def test_classify_tone_returns_habit(habit_state, mocker):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "habit"
    mocker.patch("backend.nodes.classify_tone.get_llm", return_value=mock_llm)
    result = classify_tone(habit_state)
    assert result["tone"] == "habit"

def test_classify_tone_skips_llm_for_fallback(fallback_state, mocker):
    mock_get_llm = mocker.patch("backend.nodes.classify_tone.get_llm")
    result = classify_tone(fallback_state)
    mock_get_llm.assert_not_called()
    assert result["tone"] == "praise"  # fallback always uses praise tone
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_nodes/test_classify_tone.py -v
```

Expected: `FAILED` — `ModuleNotFoundError`

- [ ] **Step 3: Create `backend/nodes/classify_tone.py`**

```python
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from backend.state import RoyalState

_llm = None

def get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=10)
    return _llm

CLASSIFY_SYSTEM = """You are a tone classifier. Given a parent's note about their child's day,
respond with exactly one word: either "praise" or "habit".
- "praise": the child did something good worth celebrating
- "habit": the child struggled with a habit that needs gentle modeling
Respond with only the single word."""

def classify_tone(state: RoyalState) -> dict:
    if state["brief"] == "__fallback__":
        return {"tone": "praise"}
    llm = get_llm()
    response = llm.invoke([
        SystemMessage(content=CLASSIFY_SYSTEM),
        HumanMessage(content=state["brief"]),
    ])
    tone = response.content.strip().lower()
    if tone not in ("praise", "habit"):
        tone = "praise"
    return {"tone": tone}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_nodes/test_classify_tone.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/nodes/classify_tone.py backend/tests/test_nodes/test_classify_tone.py
git commit -m "feat: add classify_tone node"
```

---

## Task 6: load_persona Node

**Files:**
- Create: `backend/nodes/load_persona.py`
- Test: `backend/tests/test_nodes/test_load_persona.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_nodes/test_load_persona.py
import pytest
from backend.state import RoyalState
from backend.nodes.load_persona import load_persona
from datetime import date

@pytest.fixture
def elsa_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She shared today.", tone="praise",
        persona={}, story_text="", audio_url="", language="en",
    )

def test_load_persona_returns_elsa_config(elsa_state):
    result = load_persona(elsa_state)
    persona = result["persona"]
    assert persona["name"] == "Queen Elsa"
    assert "voice_id" in persona
    assert "audio_tags" in persona
    assert "praise" in persona["audio_tags"]

def test_load_persona_raises_for_unknown_princess():
    state = RoyalState(
        princess="unknown", date=date.today().isoformat(),
        brief="test", tone="praise",
        persona={}, story_text="", audio_url="", language="en",
    )
    with pytest.raises(FileNotFoundError):
        load_persona(state)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_nodes/test_load_persona.py -v
```

Expected: `FAILED` — `ModuleNotFoundError`

- [ ] **Step 3: Create `backend/nodes/load_persona.py`**

```python
import yaml
from pathlib import Path
from backend.state import RoyalState

PERSONAS_DIR = Path(__file__).parent.parent / "personas"

def load_persona(state: RoyalState) -> dict:
    persona_path = PERSONAS_DIR / f"{state['princess']}.yaml"
    if not persona_path.exists():
        raise FileNotFoundError(f"No persona found for princess: {state['princess']}")
    with open(persona_path) as f:
        persona = yaml.safe_load(f)
    return {"persona": persona}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_nodes/test_load_persona.py -v
```

Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/nodes/load_persona.py backend/tests/test_nodes/test_load_persona.py
git commit -m "feat: add load_persona node"
```

---

## Task 7: generate_story Node

**Files:**
- Create: `backend/nodes/generate_story.py`
- Test: `backend/tests/test_nodes/test_generate_story.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_nodes/test_generate_story.py
import pytest
from unittest.mock import MagicMock
from backend.state import RoyalState
from backend.nodes.generate_story import generate_story
from datetime import date

@pytest.fixture
def praise_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She shared her blocks today.",
        tone="praise",
        persona={
            "name": "Queen Elsa",
            "origin": "Kingdom of Arendelle",
            "tone_style": "calm, majestic",
            "audio_tags": {"praise": ["[PROUD]", "[CALM]"]},
            "signature_phrase": "The cold never bothered me.",
            "metaphor": "Self-control is like the ice.",
            "fallback_letter": {"en": "fallback", "vi": "fallback"},
        },
        story_text="", audio_url="", language="en",
    )

def test_generate_story_returns_text_with_audio_tags(praise_state, mocker):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "[PROUD] Emma, I heard you shared your blocks today! [CALM] That makes you a true princess."
    mocker.patch("backend.nodes.generate_story.get_llm", return_value=mock_llm)
    result = generate_story(praise_state)
    assert "[PROUD]" in result["story_text"]
    assert "Emma" in result["story_text"]

def test_generate_story_uses_fallback_letter_when_no_brief(mocker):
    state = RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="__fallback__", tone="praise",
        persona={
            "fallback_letter": {"en": "Emma, I was thinking of you.", "vi": "Emma ơi."},
        },
        story_text="", audio_url="", language="en",
    )
    mock_get_llm = mocker.patch("backend.nodes.generate_story.get_llm")
    result = generate_story(state)
    mock_get_llm.assert_not_called()
    assert result["story_text"] == "Emma, I was thinking of you."

def test_generate_story_uses_vi_fallback_when_language_vi(mocker):
    state = RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="__fallback__", tone="praise",
        persona={
            "fallback_letter": {"en": "Emma, thinking of you.", "vi": "Emma ơi, nhớ em."},
        },
        story_text="", audio_url="", language="vi",
    )
    mocker.patch("backend.nodes.generate_story.get_llm")
    result = generate_story(state)
    assert result["story_text"] == "Emma ơi, nhớ em."
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_nodes/test_generate_story.py -v
```

Expected: `FAILED` — `ModuleNotFoundError`

- [ ] **Step 3: Create `backend/nodes/generate_story.py`**

```python
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from backend.state import RoyalState

_llm = None

def get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=600)
    return _llm

STORY_SYSTEM_TEMPLATE = """You are {name} from {origin}. You are writing a short, warm bedtime letter to Emma, a 4-year-old girl.

Your personality: {tone_style}

Use these ElevenLabs audio expression tags naturally in your letter: {audio_tags}

Guidelines:
- Write 4–6 sentences maximum. This is bedtime — keep it short and soothing.
- Address Emma by name at least once.
- Write in {language_label}. Use natural, simple words a 4-year-old can follow.
- End with your signature phrase: "{signature_phrase}"
- {tone_instruction}

Output only the letter text with audio tags. No headers, no explanations."""

TONE_INSTRUCTIONS = {
    "praise": "Celebrate what Emma did today directly and warmly. Make her feel seen and proud.",
    "habit": 'Tell a short story about a character from your world who learned the same habit. Use this metaphor as inspiration: "{metaphor}". Never lecture — just model through story.',
}

LANGUAGE_LABELS = {"en": "English", "vi": "Vietnamese (Tiếng Việt)"}

def generate_story(state: RoyalState) -> dict:
    if state["brief"] == "__fallback__":
        lang = state["language"]
        return {"story_text": state["persona"]["fallback_letter"][lang]}

    persona = state["persona"]
    tone = state["tone"]
    audio_tags = " ".join(persona["audio_tags"][tone])
    tone_instruction = TONE_INSTRUCTIONS[tone].format(
        metaphor=persona.get("metaphor", "")
    )
    system = STORY_SYSTEM_TEMPLATE.format(
        name=persona["name"],
        origin=persona["origin"],
        tone_style=persona["tone_style"],
        audio_tags=audio_tags,
        language_label=LANGUAGE_LABELS[state["language"]],
        signature_phrase=persona["signature_phrase"],
        tone_instruction=tone_instruction,
    )
    llm = get_llm()
    response = llm.invoke([
        SystemMessage(content=system),
        HumanMessage(content=f"Parent's note about Emma's day: {state['brief']}"),
    ])
    return {"story_text": response.content.strip()}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_nodes/test_generate_story.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/nodes/generate_story.py backend/tests/test_nodes/test_generate_story.py
git commit -m "feat: add generate_story node with bilingual support"
```

---

## Task 8: synthesize_voice Node

**Files:**
- Create: `backend/nodes/synthesize_voice.py`
- Test: `backend/tests/test_nodes/test_synthesize_voice.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_nodes/test_synthesize_voice.py
import pytest
from unittest.mock import MagicMock, patch
from backend.state import RoyalState
from backend.nodes.synthesize_voice import synthesize_voice
from datetime import date

@pytest.fixture
def ready_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She shared today.", tone="praise",
        persona={"voice_id": "test-voice-id"},
        story_text="[PROUD] Emma, you did wonderfully today!",
        audio_url="", language="en",
    )

def test_synthesize_voice_uploads_and_returns_url(ready_state, mocker):
    mock_elevenlabs = MagicMock()
    mock_elevenlabs.text_to_speech.convert.return_value = iter([b"audio_chunk_1", b"audio_chunk_2"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_elevenlabs)

    mock_supabase = MagicMock()
    mock_supabase.storage.from_.return_value.upload.return_value = {}
    mock_supabase.storage.from_.return_value.get_public_url.return_value = "https://example.com/audio.mp3"
    mocker.patch("backend.nodes.synthesize_voice.get_supabase_client", return_value=mock_supabase)

    result = synthesize_voice(ready_state)
    assert result["audio_url"] == "https://example.com/audio.mp3"
    assert mock_elevenlabs.text_to_speech.convert.called
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_nodes/test_synthesize_voice.py -v
```

Expected: `FAILED` — `ModuleNotFoundError`

- [ ] **Step 3: Create `backend/nodes/synthesize_voice.py`**

```python
import os
from datetime import datetime
from elevenlabs.client import ElevenLabs
from backend.state import RoyalState
from backend.db.client import get_supabase_client

_elevenlabs = None

def get_elevenlabs_client() -> ElevenLabs:
    global _elevenlabs
    if _elevenlabs is None:
        _elevenlabs = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    return _elevenlabs

BUCKET = os.environ.get("SUPABASE_STORAGE_BUCKET", "royal-audio")

def synthesize_voice(state: RoyalState) -> dict:
    client = get_elevenlabs_client()
    # NOTE: Use "eleven_v3" for ElevenLabs v3 Expressive Mode (supports <express> audio tags).
    # Use "eleven_multilingual_v2" if v3 is not yet available on your plan.
    # Check your ElevenLabs dashboard for available model IDs.
    audio_chunks = client.text_to_speech.convert(
        voice_id=state["persona"]["voice_id"],
        text=state["story_text"],
        model_id="eleven_v3",
        output_format="mp3_44100_128",
    )
    audio_bytes = b"".join(audio_chunks)

    filename = f"{state['date']}-{state['princess']}-{state['language']}.mp3"
    supabase = get_supabase_client()
    supabase.storage.from_(BUCKET).upload(
        path=filename,
        file=audio_bytes,
        file_options={"content-type": "audio/mpeg", "upsert": "true"},
    )
    public_url = supabase.storage.from_(BUCKET).get_public_url(filename)
    return {"audio_url": public_url}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && pytest tests/test_nodes/test_synthesize_voice.py -v
```

Expected: `1 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/nodes/synthesize_voice.py backend/tests/test_nodes/test_synthesize_voice.py
git commit -m "feat: add synthesize_voice node with ElevenLabs v3"
```

---

## Task 9: store_result Node + Graph Assembly

**Files:**
- Create: `backend/nodes/store_result.py`
- Create: `backend/graph.py`
- Test: `backend/tests/test_nodes/test_store_result.py`

- [ ] **Step 1: Write the failing test for store_result**

```python
# backend/tests/test_nodes/test_store_result.py
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
        story_text="[PROUD] Emma, you are wonderful.",
        audio_url="https://example.com/audio.mp3",
        language="en",
    )

def test_store_result_upserts_to_supabase(complete_state, mocker):
    mock_client = MagicMock()
    mock_client.table.return_value.upsert.return_value.execute.return_value = MagicMock()
    mocker.patch("backend.nodes.store_result.get_supabase_client", return_value=mock_client)
    result = store_result(complete_state)
    assert result["audio_url"] == "https://example.com/audio.mp3"
    mock_client.table.assert_called_with("stories")
    call_kwargs = mock_client.table.return_value.upsert.call_args[0][0]
    assert call_kwargs["princess"] == "elsa"
    assert call_kwargs["audio_url"] == "https://example.com/audio.mp3"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_nodes/test_store_result.py -v
```

Expected: `FAILED`

- [ ] **Step 3: Create `backend/nodes/store_result.py`**

```python
from backend.state import RoyalState
from backend.db.client import get_supabase_client

def store_result(state: RoyalState) -> dict:
    client = get_supabase_client()
    client.table("stories").upsert({
        "date": state["date"],
        "princess": state["princess"],
        "story_text": state["story_text"],
        "audio_url": state["audio_url"],
    }, on_conflict="date,princess").execute()
    return {"audio_url": state["audio_url"]}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && pytest tests/test_nodes/test_store_result.py -v
```

Expected: `1 passed`

- [ ] **Step 5: Create `backend/graph.py`**

```python
from langgraph.graph import StateGraph, END
from backend.state import RoyalState
from backend.nodes.fetch_brief import fetch_brief
from backend.nodes.classify_tone import classify_tone
from backend.nodes.load_persona import load_persona
from backend.nodes.generate_story import generate_story
from backend.nodes.synthesize_voice import synthesize_voice
from backend.nodes.store_result import store_result

def build_graph():
    graph = StateGraph(RoyalState)
    graph.add_node("fetch_brief", fetch_brief)
    graph.add_node("classify_tone", classify_tone)
    graph.add_node("load_persona", load_persona)
    graph.add_node("generate_story", generate_story)
    graph.add_node("synthesize_voice", synthesize_voice)
    graph.add_node("store_result", store_result)

    graph.set_entry_point("fetch_brief")
    graph.add_edge("fetch_brief", "classify_tone")
    graph.add_edge("classify_tone", "load_persona")
    graph.add_edge("load_persona", "generate_story")
    graph.add_edge("generate_story", "synthesize_voice")
    graph.add_edge("synthesize_voice", "store_result")
    graph.add_edge("store_result", END)

    return graph.compile()

royal_graph = build_graph()
```

- [ ] **Step 6: Run all backend tests to confirm nothing is broken**

```bash
cd backend && pytest tests/ -v
```

Expected: all previously passing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add backend/nodes/store_result.py backend/graph.py backend/tests/test_nodes/test_store_result.py
git commit -m "feat: add store_result node and assemble LangGraph pipeline"
```

---

## Task 10: FastAPI Endpoints

**Files:**
- Create: `backend/main.py`
- Test: `backend/tests/test_api.py`

- [ ] **Step 1: Write failing API tests**

```python
# backend/tests/test_api.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from datetime import date

@pytest.fixture
def client(mocker):
    mocker.patch("backend.main.royal_graph")
    from backend.main import app
    return TestClient(app)

def test_post_brief_stores_and_returns_ok(client, mocker):
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock()
    mocker.patch("backend.main.get_supabase_client", return_value=mock_supabase)
    response = client.post("/brief", json={"text": "She shared her blocks today."})
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_post_story_triggers_graph_and_returns_audio_url(mocker):
    mock_graph = MagicMock()
    mock_graph.invoke.return_value = {"audio_url": "https://example.com/audio.mp3"}
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.post("/story", json={"princess": "elsa", "language": "en"})
    assert response.status_code == 200
    assert response.json()["audio_url"] == "https://example.com/audio.mp3"

def test_post_story_rejects_unknown_princess(mocker):
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.post("/story", json={"princess": "unknown", "language": "en"})
    assert response.status_code == 422

def test_get_today_stories_returns_cached_map(mocker):
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"princess": "elsa", "audio_url": "https://example.com/elsa.mp3"},
    ]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_supabase)
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.get("/story/today")
    assert response.status_code == 200
    assert response.json()["cached"]["elsa"] == "https://example.com/elsa.mp3"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_api.py -v
```

Expected: `FAILED` — `ModuleNotFoundError: backend.main`

- [ ] **Step 3: Create `backend/main.py`**

```python
import os
from datetime import date
from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from backend.graph import royal_graph
from backend.db.client import get_supabase_client

app = FastAPI(title="Royal Dispatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

VALID_PRINCESSES = {"elsa", "belle", "cinderella", "ariel"}

class BriefRequest(BaseModel):
    text: str

class StoryRequest(BaseModel):
    princess: Literal["elsa", "belle", "cinderella", "ariel"]
    language: Literal["en", "vi"] = "en"
    date: str | None = None  # defaults to today

class StoryResponse(BaseModel):
    audio_url: str

@app.post("/brief")
def post_brief(req: BriefRequest):
    client = get_supabase_client()
    client.table("briefs").insert({
        "date": date.today().isoformat(),
        "text": req.text,
    }).execute()
    return {"status": "ok"}

@app.post("/story", response_model=StoryResponse)
def post_story(req: StoryRequest):
    import concurrent.futures
    story_date = req.date or date.today().isoformat()
    initial_state = {
        "princess": req.princess,
        "date": story_date,
        "brief": "",
        "tone": "",
        "persona": {},
        "story_text": "",
        "audio_url": "",
        "language": req.language,
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(royal_graph.invoke, initial_state)
        try:
            result = future.result(timeout=15)
        except concurrent.futures.TimeoutError:
            raise HTTPException(status_code=504, detail="Story generation timed out")
    return StoryResponse(audio_url=result["audio_url"])

@app.get("/story/today")
def get_today_stories():
    today = date.today().isoformat()
    client = get_supabase_client()
    result = client.table("stories").select("princess,audio_url").eq("date", today).execute()
    cached = {row["princess"]: row["audio_url"] for row in (result.data or [])}
    return {"date": today, "cached": cached}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_api.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Run the full backend test suite**

```bash
cd backend && pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 6: Start the server and do a manual smoke test**

```bash
cd backend && uvicorn main:app --reload --port 8000
```

In a second terminal:
```bash
curl -X POST http://localhost:8000/brief \
  -H "Content-Type: application/json" \
  -d '{"text": "She shared her blocks today!"}'
```

Expected: `{"status":"ok"}`

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/tests/test_api.py
git commit -m "feat: add FastAPI endpoints for brief and story"
```

---

## Task 11: n8n WhatsApp Workflow

**Files:**
- Create: `n8n/whatsapp-brief.json`

> This task is manual — n8n workflows are configured in the UI and exported as JSON. No automated tests.

- [ ] **Step 1: Set up n8n (if not already running)**

Use n8n Cloud (cloud.n8n.io) or self-host with Docker:
```bash
docker run -d --name n8n -p 5678:5678 \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=changeme \
  n8nio/n8n
```

Open http://localhost:5678

- [ ] **Step 2: Set up WhatsApp Cloud API credentials in n8n**

1. Go to Meta for Developers → create a WhatsApp Business app
2. Get: Phone Number ID, Access Token, Verify Token
3. In n8n → Credentials → Add "WhatsApp Business Cloud API" credential

- [ ] **Step 3: Build the n8n workflow**

Create a new workflow with these nodes:

1. **WhatsApp Trigger** — listens for incoming messages on your WhatsApp number
2. **IF node** — check if message type is `audio` or `text`
3. **HTTP Request (Whisper)** — if audio: `POST https://api.openai.com/v1/audio/transcriptions` with the audio file → returns transcribed text
4. **HTTP Request (brief)** — `POST http://YOUR_FASTAPI_HOST:8000/brief` with body `{"text": "{{transcribed or text message}}"}`
5. **WhatsApp node (reply)** — send yourself a confirmation: "✅ Brief received for tonight"

- [ ] **Step 4: Export the workflow**

In n8n → Workflow menu → Download → save as `n8n/whatsapp-brief.json`

- [ ] **Step 5: Test the workflow end-to-end**

Send yourself a WhatsApp text: "She shared her blocks today!"
Expected: n8n triggers → brief stored in Supabase → you receive "✅ Brief received for tonight"

- [ ] **Step 6: Commit**

```bash
git add n8n/
git commit -m "feat: add n8n WhatsApp workflow export"
```

---

## Task 12: Next.js PWA Setup + i18n

**Files:**
- Modify: `frontend/next.config.ts`
- Create: `frontend/messages/en.json`
- Create: `frontend/messages/vi.json`
- Create: `frontend/app/[locale]/layout.tsx`
- Create: `frontend/vitest.config.ts`

- [ ] **Step 1: Configure next-intl in `frontend/next.config.ts`**

```typescript
import createNextIntlPlugin from 'next-intl/plugin';
const withNextIntl = createNextIntlPlugin();
import type { NextConfig } from 'next';

const config: NextConfig = {};
export default withNextIntl(config);
```

- [ ] **Step 2: Create `frontend/i18n/routing.ts`**

```typescript
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'vi'],
  defaultLocale: 'en',
});
```

- [ ] **Step 3: Create `frontend/messages/en.json`**

```json
{
  "app": {
    "title": "The Royal Dispatch",
    "greeting": "Good evening, Princess Emma",
    "subtitle": "Your letters have arrived",
    "loading": "{princess} is writing your letter...",
    "error": "{princess}'s letter is on its way — try again in a moment 💌",
    "playing": "Playing {princess}'s letter to Emma...",
    "origins": {
      "elsa": "Kingdom of Arendelle",
      "belle": "The Enchanted Castle",
      "cinderella": "The Royal Palace",
      "ariel": "Under the Sea"
    }
  }
}
```

- [ ] **Step 4: Create `frontend/messages/vi.json`**

```json
{
  "app": {
    "title": "Thư Từ Công Chúa",
    "greeting": "Chào buổi tối, Công chúa Emma",
    "subtitle": "Thư của em đã đến rồi",
    "loading": "{princess} đang viết thư cho em...",
    "error": "Thư của {princess} đang trên đường — thử lại một chút nhé 💌",
    "playing": "Đang phát thư của {princess} cho Emma...",
    "origins": {
      "elsa": "Vương quốc Arendelle",
      "belle": "Lâu đài Phù chú",
      "cinderella": "Hoàng cung",
      "ariel": "Dưới lòng đại dương"
    }
  }
}
```

- [ ] **Step 5: Create `frontend/app/[locale]/layout.tsx`**

```tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as 'en' | 'vi')) notFound();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Create `frontend/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

- [ ] **Step 7: Create `frontend/tests/setup.ts`**

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 8: Verify Next.js starts cleanly**

```bash
cd frontend && npm run dev
```

Expected: server starts at http://localhost:3000 with no errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/
git commit -m "feat: configure next-intl i18n with EN and VI locales"
```

---

## Task 13: Royal Inbox Screen + Language Selector

**Files:**
- Create: `frontend/components/LanguageSelector.tsx`
- Create: `frontend/components/PrincessCard.tsx`
- Create: `frontend/app/[locale]/page.tsx`
- Create: `frontend/lib/api.ts`
- Test: `frontend/tests/LanguageSelector.test.tsx`
- Test: `frontend/tests/PrincessCard.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// frontend/tests/LanguageSelector.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageSelector } from '@/components/LanguageSelector';

describe('LanguageSelector', () => {
  it('renders EN and VI options', () => {
    render(<LanguageSelector value="en" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText(/english/i)).toBeInTheDocument();
  });

  it('calls onChange when selection changes', () => {
    const handleChange = vi.fn();
    render(<LanguageSelector value="en" onChange={handleChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'vi' } });
    expect(handleChange).toHaveBeenCalledWith('vi');
  });
});
```

```tsx
// frontend/tests/PrincessCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { PrincessCard } from '@/components/PrincessCard';

const mockPrincess = {
  id: 'elsa' as const,
  name: 'Queen Elsa',
  origin: 'Kingdom of Arendelle',
  emoji: '❄️',
};

describe('PrincessCard', () => {
  it('renders princess name and origin', () => {
    render(<PrincessCard princess={mockPrincess} onClick={() => {}} />);
    expect(screen.getByText('Queen Elsa')).toBeInTheDocument();
    expect(screen.getByText('Kingdom of Arendelle')).toBeInTheDocument();
  });

  it('calls onClick when tapped', () => {
    const handleClick = vi.fn();
    render(<PrincessCard princess={mockPrincess} onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledWith('elsa');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run tests/LanguageSelector.test.tsx tests/PrincessCard.test.tsx
```

Expected: `FAILED` — components don't exist yet

- [ ] **Step 3: Create `frontend/lib/api.ts`**

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export type Princess = 'elsa' | 'belle' | 'cinderella' | 'ariel';
export type Language = 'en' | 'vi';

export async function requestStory(princess: Princess, language: Language): Promise<string> {
  const res = await fetch(`${API_URL}/story`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ princess, language }),
  });
  if (!res.ok) throw new Error('Story generation failed');
  const data = await res.json();
  return data.audio_url as string;
}
```

- [ ] **Step 4: Create `frontend/components/LanguageSelector.tsx`**

```tsx
'use client';

export type Language = 'en' | 'vi';

interface Props {
  value: Language;
  onChange: (lang: Language) => void;
}

export function LanguageSelector({ value, onChange }: Props) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Language)}
        className="appearance-none bg-purple-100 border-2 border-purple-300 rounded-xl px-3 py-1.5 pr-7 text-sm font-bold text-purple-800 cursor-pointer outline-none focus:ring-2 focus:ring-purple-400"
      >
        <option value="en">🇬🇧 English</option>
        <option value="vi">🇻🇳 Tiếng Việt</option>
      </select>
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-purple-600 text-xs">▼</div>
    </div>
  );
}
```

- [ ] **Step 5: Create `frontend/components/PrincessCard.tsx`**

```tsx
'use client';

export interface PrincessConfig {
  id: 'elsa' | 'belle' | 'cinderella' | 'ariel';
  name: string;
  origin: string;
  emoji: string;
  bgColor: string;
  borderColor: string;
  labelColor: string;
  nameColor: string;
  avatarGradient: string;
  badgeBg: string;
}

interface Props {
  princess: PrincessConfig;
  onClick: (id: PrincessConfig['id']) => void;
  isLoading?: boolean;
}

export function PrincessCard({ princess, onClick, isLoading }: Props) {
  return (
    <button
      onClick={() => onClick(princess.id)}
      disabled={isLoading}
      className={`w-full ${princess.bgColor} border-2 ${princess.borderColor} rounded-2xl p-4 flex items-center gap-4 transition-transform active:scale-95 disabled:opacity-60`}
    >
      <div
        className={`w-12 h-12 rounded-full bg-gradient-to-br ${princess.avatarGradient} flex items-center justify-center text-2xl flex-shrink-0 shadow-md`}
        style={{ boxShadow: `0 2px 8px var(--shadow-color)` }}
      >
        {isLoading ? '✨' : princess.emoji}
      </div>
      <div className="flex-1 text-left">
        <div className={`${princess.labelColor} text-xs font-extrabold tracking-wider uppercase`}>
          {princess.origin}
        </div>
        <div className={`${princess.nameColor} text-base font-extrabold mt-0.5`}>
          {princess.name}
        </div>
      </div>
      <div className={`w-8 h-8 rounded-full ${princess.badgeBg} flex items-center justify-center text-base`}>
        {isLoading ? '⏳' : '💌'}
      </div>
    </button>
  );
}
```

- [ ] **Step 6: Create `frontend/app/[locale]/page.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { PrincessCard, PrincessConfig } from '@/components/PrincessCard';
import { LanguageSelector, Language } from '@/components/LanguageSelector';
import { requestStory, Princess } from '@/lib/api';

const PRINCESSES: PrincessConfig[] = [
  {
    id: 'elsa', name: 'Queen Elsa', emoji: '❄️',
    bgColor: 'bg-blue-50', borderColor: 'border-blue-300',
    labelColor: 'text-blue-500', nameColor: 'text-blue-900',
    avatarGradient: 'from-blue-200 to-blue-400', badgeBg: 'bg-blue-100',
    origin: '',
  },
  {
    id: 'belle', name: 'Belle', emoji: '📚',
    bgColor: 'bg-amber-50', borderColor: 'border-amber-300',
    labelColor: 'text-amber-600', nameColor: 'text-amber-900',
    avatarGradient: 'from-yellow-200 to-amber-300', badgeBg: 'bg-amber-100',
    origin: '',
  },
  {
    id: 'cinderella', name: 'Cinderella', emoji: '👠',
    bgColor: 'bg-fuchsia-50', borderColor: 'border-fuchsia-300',
    labelColor: 'text-fuchsia-600', nameColor: 'text-fuchsia-900',
    avatarGradient: 'from-fuchsia-200 to-pink-300', badgeBg: 'bg-fuchsia-100',
    origin: '',
  },
  {
    id: 'ariel', name: 'Ariel', emoji: '🐠',
    bgColor: 'bg-teal-50', borderColor: 'border-teal-300',
    labelColor: 'text-teal-600', nameColor: 'text-teal-900',
    avatarGradient: 'from-teal-200 to-cyan-300', badgeBg: 'bg-teal-100',
    origin: '',
  },
];

export default function InboxPage() {
  const t = useTranslations('app');
  const locale = useLocale() as Language;
  const router = useRouter();
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('rd-language') as Language) ?? locale;
    }
    return locale;
  });
  const [loadingPrincess, setLoadingPrincess] = useState<Princess | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('rd-language', language);
  }, [language]);

  const princesses = PRINCESSES.map((p) => ({
    ...p,
    origin: t(`origins.${p.id}`),
  }));

  async function handleSelectPrincess(id: Princess) {
    setLoadingPrincess(id);
    setError(null);
    try {
      const audioUrl = await requestStory(id, language);
      router.push(`/${locale}/play/${id}?audio=${encodeURIComponent(audioUrl)}`);
    } catch {
      setError(t('error', { princess: id }));
      setLoadingPrincess(null);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-50 via-pink-50 to-blue-50 p-6 flex flex-col items-center gap-4">
      <div className="w-full max-w-md flex items-center justify-between">
        <span className="text-purple-400 text-xs font-extrabold tracking-widest uppercase">✨ {t('title')}</span>
        <LanguageSelector value={language} onChange={setLanguage} />
      </div>

      <div className="text-center mb-2">
        <h1 className="text-purple-900 text-xl font-extrabold">{t('greeting')}</h1>
        <p className="text-purple-400 text-sm font-semibold mt-1">{t('subtitle')} 💌</p>
      </div>

      <div className="w-full max-w-md flex flex-col gap-3">
        {princesses.map((p) => (
          <PrincessCard
            key={p.id}
            princess={p}
            onClick={handleSelectPrincess}
            isLoading={loadingPrincess === p.id}
          />
        ))}
      </div>

      {error && (
        <div className="w-full max-w-md bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 text-center">
          <p className="text-amber-800 text-sm font-semibold">{error}</p>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd frontend && npx vitest run tests/LanguageSelector.test.tsx tests/PrincessCard.test.tsx
```

Expected: `4 passed`

- [ ] **Step 8: Visual check in browser**

```bash
cd frontend && npm run dev
```

Open http://localhost:3000/en — verify Royal Inbox renders correctly with all 4 princess cards and language dropdown.

- [ ] **Step 9: Commit**

```bash
git add frontend/components/ frontend/app/ frontend/lib/ frontend/tests/
git commit -m "feat: add Royal Inbox screen with language selector"
```

---

## Task 14: Letter Playing Screen

**Files:**
- Create: `frontend/components/AudioPlayer.tsx`
- Create: `frontend/app/[locale]/play/[princess]/page.tsx`
- Test: `frontend/tests/AudioPlayer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/AudioPlayer.test.tsx
import { render, screen } from '@testing-library/react';
import { AudioPlayer } from '@/components/AudioPlayer';

const mockPrincess = { id: 'elsa' as const, name: 'Queen Elsa', emoji: '❄️' };

describe('AudioPlayer', () => {
  it('renders the princess name', () => {
    render(<AudioPlayer princess={mockPrincess} audioUrl="https://example.com/test.mp3" />);
    expect(screen.getByText(/Queen Elsa/i)).toBeInTheDocument();
  });

  it('renders the ambient emoji', () => {
    render(<AudioPlayer princess={mockPrincess} audioUrl="https://example.com/test.mp3" />);
    expect(screen.getAllByText('❄️').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run tests/AudioPlayer.test.tsx
```

Expected: `FAILED`

- [ ] **Step 3: Create `frontend/components/AudioPlayer.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

const AMBIENT: Record<string, { emoji: string; bg: string; glow: string }> = {
  elsa:       { emoji: '❄️', bg: 'from-blue-50 via-purple-50 to-blue-50',  glow: 'shadow-blue-300' },
  belle:      { emoji: '📚', bg: 'from-amber-50 via-yellow-50 to-amber-50', glow: 'shadow-amber-300' },
  cinderella: { emoji: '✨', bg: 'from-fuchsia-50 via-pink-50 to-fuchsia-50', glow: 'shadow-fuchsia-300' },
  ariel:      { emoji: '🐠', bg: 'from-teal-50 via-cyan-50 to-teal-50',    glow: 'shadow-teal-300' },
};

interface Props {
  princess: { id: string; name: string; emoji: string };
  audioUrl: string;
}

export function AudioPlayer({ princess, audioUrl }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const ambient = AMBIENT[princess.id] ?? AMBIENT['elsa'];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    audio.onended = () => setPlaying(false);
    return () => { audio.onended = null; };
  }, [audioUrl]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play(); setPlaying(true); }
  }

  const bars = [8, 16, 28, 20, 36, 24, 14, 28, 10];

  return (
    <div className={`min-h-screen bg-gradient-to-b ${ambient.bg} flex flex-col items-center justify-between p-6`}>
      <audio ref={audioRef} src={audioUrl} preload="auto" />

      <div className="text-center">
        <p className="text-purple-400 text-xs font-extrabold tracking-widest uppercase">✨ The Royal Dispatch</p>
        <p className="text-blue-600 text-sm font-bold tracking-wide uppercase mt-2">
          A letter from {princess.name}
        </p>
      </div>

      <div className="flex flex-col items-center gap-6">
        <div className={`w-32 h-32 rounded-full bg-gradient-to-br from-blue-200 to-blue-400 border-4 border-blue-300 flex items-center justify-center text-5xl shadow-2xl ${ambient.glow}`}>
          {princess.emoji}
        </div>

        <div className="flex items-end justify-center gap-1.5 h-10">
          {bars.map((h, i) => (
            <div
              key={i}
              style={{ height: playing ? `${h}px` : '6px' }}
              className="w-1.5 bg-blue-400 rounded-full transition-all duration-300"
            />
          ))}
        </div>
      </div>

      <div className="text-3xl tracking-[20px] opacity-40">{ambient.emoji} {ambient.emoji} {ambient.emoji}</div>

      <div className="flex flex-col items-center gap-4 w-full">
        <p className="text-gray-500 text-sm font-semibold">Playing {princess.name}'s letter to Emma...</p>
        <button
          onClick={toggle}
          className="w-16 h-16 rounded-full bg-blue-500 border-4 border-blue-200 flex items-center justify-center text-white text-2xl shadow-xl active:scale-95 transition-transform"
        >
          {playing ? '⏸' : '▶'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/app/[locale]/play/[princess]/page.tsx`**

```tsx
'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { AudioPlayer } from '@/components/AudioPlayer';

const PRINCESS_META = {
  elsa:       { name: 'Queen Elsa',  emoji: '❄️' },
  belle:      { name: 'Belle',       emoji: '📚' },
  cinderella: { name: 'Cinderella',  emoji: '👠' },
  ariel:      { name: 'Ariel',       emoji: '🐠' },
} as const;

type PrincessId = keyof typeof PRINCESS_META;

export default function PlayPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const princessId = params.princess as PrincessId;
  const audioUrl = searchParams.get('audio') ?? '';
  const meta = PRINCESS_META[princessId] ?? PRINCESS_META.elsa;

  return (
    <AudioPlayer
      princess={{ id: princessId, ...meta }}
      audioUrl={audioUrl}
    />
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd frontend && npx vitest run tests/AudioPlayer.test.tsx
```

Expected: `2 passed`

- [ ] **Step 6: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Visual check**

With the backend running on port 8000 and a real `.env.local`, open http://localhost:3000/en, tap a princess, and verify:
- Loading state shows while story generates
- Audio plays automatically on the play screen
- Ambient emoji and sound wave appear

- [ ] **Step 8: Commit**

```bash
git add frontend/components/AudioPlayer.tsx frontend/app/ frontend/tests/AudioPlayer.test.tsx
git commit -m "feat: add letter playing screen with audio player"
```

---

## Task 15: PWA Manifest + Final Wiring

**Files:**
- Create: `frontend/public/manifest.json`
- Modify: `frontend/app/[locale]/layout.tsx` (add manifest link)
- Create: `frontend/middleware.ts` (locale redirect)

- [ ] **Step 1: Create `frontend/public/manifest.json`**

```json
{
  "name": "The Royal Dispatch",
  "short_name": "Royal Dispatch",
  "description": "Personalized princess letters for Emma",
  "start_url": "/en",
  "display": "standalone",
  "background_color": "#f5f0ff",
  "theme_color": "#b085d8",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

> Create a simple 192×192 and 512×512 crown icon (👑) using any icon tool and save as `frontend/public/icon-192.png` and `frontend/public/icon-512.png`.

- [ ] **Step 2: Add manifest link to layout**

In `frontend/app/[locale]/layout.tsx`, add inside `<head>`:
```tsx
<link rel="manifest" href="/manifest.json" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Royal Dispatch" />
```

- [ ] **Step 3: Create `frontend/middleware.ts`** (redirects `/` → `/en`)

```typescript
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
```

- [ ] **Step 4: Build the PWA and verify**

```bash
cd frontend && npm run build && npm run start
```

On the iPad: open Safari → navigate to your server URL → tap Share → "Add to Home Screen". The app should install with the crown icon and open in fullscreen standalone mode.

- [ ] **Step 5: Run final test suite**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch
# Backend
cd backend && pytest tests/ -v
# Frontend
cd ../frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Final commit**

```bash
git add frontend/public/ frontend/middleware.ts frontend/app/
git commit -m "feat: add PWA manifest and locale middleware — Royal Dispatch complete"
```

---

## Environment Checklist

Before first real run, ensure these are set:

**`backend/.env`:**
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `ELEVENLABS_API_KEY` — from elevenlabs.io (you already have this)
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` — from your Supabase project settings
- `SUPABASE_STORAGE_BUCKET=royal-audio`

**`frontend/.env.local`:**
- `NEXT_PUBLIC_API_URL` — URL where FastAPI is running

**ElevenLabs voice IDs** — replace placeholders in all four YAML files with real voice IDs from your ElevenLabs account. Choose one voice per princess that feels right for the character.
