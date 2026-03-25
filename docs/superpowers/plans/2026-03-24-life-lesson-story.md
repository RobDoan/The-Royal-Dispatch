# Life Lesson Story Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Story" tab where Emma taps a princess card to hear a Life Lesson story — the princess shares an anecdote teaching Emma how to handle a real-life situation, ending with a spoken Royal Challenge displayed as a highlighted card in the AudioPlayer.

**Architecture:** Extend the existing LangGraph pipeline with a conditional branch on `story_type`: `"daily"` flows through the current nodes unchanged, while `"life_lesson"` adds two new nodes (`infer_situation` → `generate_life_lesson`) before `synthesize_voice`. The frontend adds a `(tabs)` route group (Inbox + Story list pages, with BottomNav) and a `(play)` route group (existing daily play page + new life-lesson play page, no BottomNav).

**Tech Stack:** Python 3.11, FastAPI, LangGraph, LangChain Anthropic, Supabase, Next.js 15 App Router, next-intl, Vitest + React Testing Library

---

## Codebase Reference

Run backend tests from the project root:
```bash
cd backend && pytest backend/tests/ -v
# or a single file:
pytest backend/tests/test_api.py -v
```

Run frontend tests from the frontend directory:
```bash
cd frontend && npx vitest run
# or a single file:
npx vitest run tests/AudioPlayer.test.tsx
```

Key files to understand before starting:
- `backend/state.py` — `RoyalState` TypedDict (all node I/O flows through this)
- `backend/graph.py` — LangGraph wiring
- `backend/nodes/generate_story.py` — pattern for all new node files
- `backend/nodes/classify_tone.py` — pattern for Haiku-based classifier nodes
- `backend/nodes/store_result.py` — upsert to Supabase; we modify this
- `backend/main.py` — FastAPI app; `POST /story` and `GET /story/today/{princess}`
- `frontend/app/[locale]/play/[princess]/page.tsx` — complete polling pattern to copy
- `frontend/components/AudioPlayer.tsx` — we add `royalChallenge` prop here

---

## File Map

| File | Action |
|------|--------|
| `backend/db/migrations/add_story_type.sql` | **New** |
| `backend/state.py` | Modify — two-class TypedDict |
| `backend/nodes/infer_situation.py` | **New** |
| `backend/nodes/generate_life_lesson.py` | **New** |
| `backend/nodes/fetch_brief.py` | Modify — update type hint to `RoyalStateOptional` |
| `backend/nodes/classify_tone.py` | Modify — update type hint to `RoyalStateOptional` |
| `backend/nodes/load_persona.py` | Modify — update type hint to `RoyalStateOptional` |
| `backend/nodes/generate_story.py` | Modify — update type hint to `RoyalStateOptional` |
| `backend/nodes/store_result.py` | Modify — add `story_type`, `royal_challenge`, update `on_conflict` |
| `backend/nodes/synthesize_voice.py` | Modify — add `story_type` suffix to filename (plan addition beyond spec; prevents overwriting daily audio) |
| `backend/graph.py` | Modify — conditional routing |
| `backend/main.py` | Modify — `StoryRequest`, cache, `StoryDetailResponse`, endpoints |
| `backend/tests/test_infer_situation.py` | **New** |
| `backend/tests/test_generate_life_lesson.py` | **New** |
| `backend/tests/test_api.py` | Modify — new tests |
| `frontend/lib/api.ts` | Modify — add `storyType` param |
| `frontend/messages/en.json` | Modify — add `story.*` keys |
| `frontend/messages/vi.json` | Modify — add `story.*` keys |
| `frontend/components/AudioPlayer.tsx` | Modify — `royalChallenge` prop |
| `frontend/components/BottomNav.tsx` | **New** |
| `frontend/app/[locale]/page.tsx` | Modify — redirect to `/inbox` |
| `frontend/app/[locale]/(tabs)/layout.tsx` | **New** |
| `frontend/app/[locale]/(tabs)/inbox/page.tsx` | **New** — move + redesign Inbox |
| `frontend/app/[locale]/(tabs)/story/page.tsx` | **New** |
| `frontend/app/[locale]/(play)/play/[princess]/page.tsx` | **New** — move existing play page |
| `frontend/app/[locale]/(play)/story/[princess]/page.tsx` | **New** |
| `frontend/tests/AudioPlayer.test.tsx` | Modify — Royal Challenge tests |
| `frontend/tests/BottomNav.test.tsx` | **New** |
| `frontend/tests/StoryPage.test.tsx` | **New** |

---

## Task 1: Database Migration

**Files:**
- Create: `backend/db/migrations/add_story_type.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- backend/db/migrations/add_story_type.sql

-- Add story_type column; backfills all existing rows as 'daily'
ALTER TABLE stories ADD COLUMN IF NOT EXISTS story_type TEXT NOT NULL DEFAULT 'daily';

-- Add royal_challenge column (nullable — only set for life_lesson stories)
ALTER TABLE stories ADD COLUMN IF NOT EXISTS royal_challenge TEXT;

-- Drop old unique constraint and add new one that includes story_type
-- WARNING: if any existing rows have duplicate (date, princess) pairs, this will fail.
-- Verify first: SELECT date, princess, COUNT(*) FROM stories GROUP BY date, princess HAVING COUNT(*) > 1;
ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_date_princess_key;
ALTER TABLE stories ADD CONSTRAINT stories_date_princess_story_type_key
  UNIQUE (date, princess, story_type);
```

- [ ] **Step 2: Run the migration in Supabase SQL editor**

Open your Supabase project → SQL editor → paste and run the migration.
Verify with: `SELECT column_name FROM information_schema.columns WHERE table_name = 'stories';`
Expected: columns `story_type` and `royal_challenge` appear in the list.

- [ ] **Step 3: Commit**

```bash
git add backend/db/migrations/add_story_type.sql
git commit -m "feat: add story_type and royal_challenge columns to stories table"
```

---

## Task 2: Update RoyalState

**Files:**
- Modify: `backend/state.py`

The current `RoyalState` is a single `TypedDict(total=True)`. We add three new fields. `royal_challenge` must use `total=False` (two-class inheritance) because nodes on the `"daily"` branch never write it — LangGraph would raise a `KeyError` merging partial state dicts if it were required.

- [ ] **Step 1: Replace `backend/state.py` with the two-class pattern**

```python
# backend/state.py
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
    audio_url: str     # Supabase Storage public URL
    language: str      # "en" | "vi"

class RoyalStateOptional(RoyalState, total=False):
    royal_challenge: str | None  # only written by generate_life_lesson; absent for daily
```

- [ ] **Step 2: Update all existing nodes to use `RoyalStateOptional`**

Four existing nodes import `RoyalState` in their type hints. Update each one — only the import and function signature change; no logic changes:

```python
# backend/nodes/fetch_brief.py — change line 1 and 4
from backend.state import RoyalStateOptional
def fetch_brief(state: RoyalStateOptional) -> dict:
```

```python
# backend/nodes/classify_tone.py — change line 1 and 19
from backend.state import RoyalStateOptional
def classify_tone(state: RoyalStateOptional) -> dict:
```

```python
# backend/nodes/load_persona.py — change line 2 and 7
from backend.state import RoyalStateOptional
def load_persona(state: RoyalStateOptional) -> dict:
```

```python
# backend/nodes/generate_story.py — change line 1 and 35
from backend.state import RoyalStateOptional
def generate_story(state: RoyalStateOptional) -> dict:
```

- [ ] **Step 3: Verify existing tests still pass**

```bash
cd backend && pytest backend/tests/ -v
```

Expected: all existing tests pass (none reference `RoyalState` directly in tests).

- [ ] **Step 4: Commit**

```bash
git add backend/state.py backend/nodes/fetch_brief.py backend/nodes/classify_tone.py backend/nodes/load_persona.py backend/nodes/generate_story.py
git commit -m "feat: extend RoyalState with story_type, situation, royal_challenge fields"
```

---

## Task 3: `infer_situation` Node

**Files:**
- Create: `backend/nodes/infer_situation.py`
- Create: `backend/tests/test_infer_situation.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_infer_situation.py
import pytest
from unittest.mock import MagicMock, patch

ALLOWED_FALLBACKS = {"kindness", "patience", "courage", "sharing", "honesty", "trying new things"}

def make_state(brief: str) -> dict:
    return {
        "princess": "elsa", "date": "2026-03-24", "brief": brief,
        "tone": "praise", "persona": {}, "story_type": "life_lesson",
        "situation": "", "story_text": "", "audio_url": "", "language": "en",
    }

def test_infer_situation_extracts_from_brief():
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="sharing with a sibling")
    with patch("backend.nodes.infer_situation.get_llm", return_value=mock_llm):
        from backend.nodes.infer_situation import infer_situation
        result = infer_situation(make_state("Emma had trouble sharing crayons with her brother"))
    situation = result["situation"]
    assert isinstance(situation, str)
    assert len(situation.split()) <= 8
    assert situation.strip() != ""

def test_infer_situation_uses_fallback_for_empty_brief():
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="kindness")
    with patch("backend.nodes.infer_situation.get_llm", return_value=mock_llm):
        from backend.nodes.infer_situation import infer_situation
        result = infer_situation(make_state("__fallback__"))
    assert result["situation"] in ALLOWED_FALLBACKS

def test_infer_situation_uses_fallback_for_non_teachable_brief():
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="courage")
    with patch("backend.nodes.infer_situation.get_llm", return_value=mock_llm):
        from backend.nodes.infer_situation import infer_situation
        result = infer_situation(make_state("Emma ate breakfast and watched TV"))
    assert result["situation"] in ALLOWED_FALLBACKS
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest backend/tests/test_infer_situation.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` — `infer_situation` doesn't exist yet.

- [ ] **Step 3: Implement `infer_situation.py`**

```python
# backend/nodes/infer_situation.py
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from backend.state import RoyalStateOptional

_llm = None

ALLOWED_FALLBACKS = ["kindness", "patience", "courage", "sharing", "honesty", "trying new things"]

def get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=20)
    return _llm

SYSTEM_PROMPT = """You are a children's life-lesson classifier.
Given a parent's note about their child's day, respond with a SHORT phrase (max 8 words) describing one teachable situation — something the child can learn to handle with grace.

If the note contains no clear teachable moment (or is "__fallback__"), respond with exactly one of these options:
kindness, patience, courage, sharing, honesty, trying new things

Respond with the situation phrase only. No punctuation, no explanation."""

def infer_situation(state: RoyalStateOptional) -> dict:
    brief = state["brief"]
    llm = get_llm()
    response = llm.invoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=brief),
    ])
    situation = response.content.strip().lower().rstrip(".")
    # If LLM returns something outside our allowed list for edge cases, clamp to a fallback
    if situation not in ALLOWED_FALLBACKS and (
        brief == "__fallback__" or len(brief.split()) < 5
    ):
        situation = ALLOWED_FALLBACKS[0]  # "kindness" as safe default
    return {"situation": situation}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest backend/tests/test_infer_situation.py -v
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/nodes/infer_situation.py backend/tests/test_infer_situation.py
git commit -m "feat: add infer_situation node for life lesson stories"
```

---

## Task 4: `generate_life_lesson` Node

**Files:**
- Create: `backend/nodes/generate_life_lesson.py`
- Create: `backend/tests/test_generate_life_lesson.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_generate_life_lesson.py
from unittest.mock import MagicMock, patch

MOCK_PERSONA = {
    "name": "Queen Elsa",
    "origin": "Kingdom of Arendelle",
    "tone_style": "wise and warm",
    "audio_tags": {"praise": ["[PROUD]"], "habit": ["[GENTLE]"]},
    "signature_phrase": "The cold never bothered me anyway.",
    "metaphor": "a snowflake finding its place",
}

def make_state(language: str = "en") -> dict:
    return {
        "princess": "elsa", "date": "2026-03-24", "brief": "Emma had trouble sharing",
        "tone": "habit", "persona": MOCK_PERSONA, "story_type": "life_lesson",
        "situation": "sharing with a sibling", "story_text": "",
        "audio_url": "", "language": language,
    }

def test_generate_life_lesson_sets_story_text_and_royal_challenge():
    challenge = "Try sharing one favourite thing with someone today."
    story = f"Once in Arendelle there was a girl who learned to share. {challenge}"
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content=f"STORY:{story}\nCHALLENGE:{challenge}")
    with patch("backend.nodes.generate_life_lesson.get_llm", return_value=mock_llm):
        from backend.nodes.generate_life_lesson import generate_life_lesson
        result = generate_life_lesson(make_state())
    assert result["story_text"] != ""
    assert result["royal_challenge"] is not None
    assert result["royal_challenge"] != ""

def test_royal_challenge_appears_in_story_text():
    challenge = "Try giving a hug to someone you love today."
    story_body = "Once there was a little snowflake who learned kindness."
    full_story = f"{story_body} Your Royal Challenge: {challenge}"
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(
        content=f"STORY:{full_story}\nCHALLENGE:{challenge}"
    )
    with patch("backend.nodes.generate_life_lesson.get_llm", return_value=mock_llm):
        from backend.nodes.generate_life_lesson import generate_life_lesson
        result = generate_life_lesson(make_state())
    assert result["royal_challenge"] in result["story_text"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest backend/tests/test_generate_life_lesson.py -v
```

Expected: `ImportError` — `generate_life_lesson` doesn't exist yet.

- [ ] **Step 3: Implement `generate_life_lesson.py`**

```python
# backend/nodes/generate_life_lesson.py
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from backend.state import RoyalStateOptional

_llm = None

def get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=800)
    return _llm

LANGUAGE_LABELS = {"en": "English", "vi": "Vietnamese (Tiếng Việt)"}

SYSTEM_TEMPLATE = """You are {name} from {origin}. You are sharing a Life Lesson story with Emma, a 4-year-old girl.

Your personality: {tone_style}

Use these ElevenLabs audio expression tags naturally: {audio_tags}

The lesson topic is: "{situation}"

Guidelines:
- Write 6–8 sentences. Share a personal anecdote OR a made-up story about a character in your kingdom who learned to handle "{situation}" with grace.
- Address Emma by name at least once.
- Write in {language_label}. Use simple, warm words a 4-year-old can follow.
- End with a spoken Royal Challenge — one concrete thing Emma can try today. Begin the challenge with "Your Royal Challenge:".
- End with your signature phrase: "{signature_phrase}"

Output format (exactly):
STORY:<the full story including the spoken Royal Challenge at the end>
CHALLENGE:<just the challenge sentence(s), no prefix>

No other text."""

def generate_life_lesson(state: RoyalStateOptional) -> dict:
    persona = state["persona"]
    tone = state["tone"]
    audio_tags = " ".join(persona["audio_tags"][tone])
    system = SYSTEM_TEMPLATE.format(
        name=persona["name"],
        origin=persona["origin"],
        tone_style=persona["tone_style"],
        audio_tags=audio_tags,
        situation=state["situation"],
        language_label=LANGUAGE_LABELS[state["language"]],
        signature_phrase=persona["signature_phrase"],
    )
    llm = get_llm()
    response = llm.invoke([
        SystemMessage(content=system),
        HumanMessage(content=f"Parent's note: {state['brief']}"),
    ])
    raw = response.content.strip()

    # Parse STORY: and CHALLENGE: sections
    story_text = ""
    royal_challenge = ""
    for line in raw.splitlines():
        if line.startswith("STORY:"):
            story_text = line[len("STORY:"):].strip()
        elif line.startswith("CHALLENGE:"):
            royal_challenge = line[len("CHALLENGE:"):].strip()

    # Fallback: if parsing fails, use the whole response as story_text
    if not story_text:
        story_text = raw
    if not royal_challenge:
        royal_challenge = story_text

    return {"story_text": story_text, "royal_challenge": royal_challenge}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest backend/tests/test_generate_life_lesson.py -v
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/nodes/generate_life_lesson.py backend/tests/test_generate_life_lesson.py
git commit -m "feat: add generate_life_lesson node with Royal Challenge output"
```

---

## Task 5: Update `store_result` and `synthesize_voice`

**Files:**
- Modify: `backend/nodes/store_result.py`
- Modify: `backend/nodes/synthesize_voice.py`

`synthesize_voice` needs a `story_type` suffix in the filename to avoid overwriting daily audio files when generating a life_lesson story for the same princess on the same day.

- [ ] **Step 1: Update `store_result.py`**

Replace the entire file:

```python
# backend/nodes/store_result.py
from backend.state import RoyalStateOptional
from backend.db.client import get_supabase_client

def store_result(state: RoyalStateOptional) -> dict:
    client = get_supabase_client()
    client.table("stories").upsert({
        "date": state["date"],
        "princess": state["princess"],
        "story_type": state["story_type"],  # required field — always present
        "story_text": state["story_text"],
        "audio_url": state["audio_url"],
        "royal_challenge": state.get("royal_challenge"),  # total=False field — absent for daily
    }, on_conflict="date,princess,story_type").execute()
    return {"audio_url": state["audio_url"]}
```

- [ ] **Step 2: Update `synthesize_voice.py` to include story_type in filename**

Only change the `filename` line. Replace:
```python
filename = f"{state['date']}-{state['princess']}-{state['language']}.mp3"
```
With:
```python
story_type = state.get("story_type", "daily")
suffix = f"-{story_type}" if story_type != "daily" else ""
filename = f"{state['date']}-{state['princess']}-{state['language']}{suffix}.mp3"
```

Also update the function signature from `RoyalState` to `RoyalStateOptional`:
```python
def synthesize_voice(state: RoyalStateOptional) -> dict:
```

- [ ] **Step 3: Run existing tests**

```bash
cd backend && pytest backend/tests/ -v
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/nodes/store_result.py backend/nodes/synthesize_voice.py
git commit -m "feat: update store_result and synthesize_voice for life_lesson story_type"
```

---

## Task 6: Update LangGraph (`graph.py`)

**Files:**
- Modify: `backend/graph.py`

- [ ] **Step 1: Replace `backend/graph.py` with conditional routing**

```python
# backend/graph.py
from langgraph.graph import StateGraph, END
from backend.state import RoyalStateOptional
from backend.nodes.fetch_brief import fetch_brief
from backend.nodes.classify_tone import classify_tone
from backend.nodes.load_persona import load_persona
from backend.nodes.generate_story import generate_story
from backend.nodes.infer_situation import infer_situation
from backend.nodes.generate_life_lesson import generate_life_lesson
from backend.nodes.synthesize_voice import synthesize_voice
from backend.nodes.store_result import store_result

def route_story_type(state: RoyalStateOptional) -> str:
    return state.get("story_type", "daily")

def build_graph():
    graph = StateGraph(RoyalStateOptional)
    graph.add_node("fetch_brief", fetch_brief)
    graph.add_node("classify_tone", classify_tone)
    graph.add_node("load_persona", load_persona)
    graph.add_node("generate_story", generate_story)
    graph.add_node("infer_situation", infer_situation)
    graph.add_node("generate_life_lesson", generate_life_lesson)
    graph.add_node("synthesize_voice", synthesize_voice)
    graph.add_node("store_result", store_result)

    graph.set_entry_point("fetch_brief")
    graph.add_edge("fetch_brief", "classify_tone")
    graph.add_edge("classify_tone", "load_persona")
    graph.add_conditional_edges(
        "load_persona",
        route_story_type,
        {"daily": "generate_story", "life_lesson": "infer_situation"},
    )
    graph.add_edge("generate_story", "synthesize_voice")
    graph.add_edge("infer_situation", "generate_life_lesson")
    graph.add_edge("generate_life_lesson", "synthesize_voice")
    graph.add_edge("synthesize_voice", "store_result")
    graph.add_edge("store_result", END)

    return graph.compile()

royal_graph = build_graph()
```

- [ ] **Step 2: Run existing tests to verify graph change doesn't break them**

```bash
cd backend && pytest backend/tests/ -v
```

Expected: all tests pass (graph is mocked in `test_api.py`).

- [ ] **Step 3: Commit**

```bash
git add backend/graph.py
git commit -m "feat: add conditional routing to LangGraph for life_lesson story type"
```

---

## Task 7: Update `main.py` and API Tests

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/tests/test_api.py`

- [ ] **Step 1: Write new failing tests first**

Add to `backend/tests/test_api.py` (append after existing tests):

```python
def test_post_story_life_lesson_triggers_graph(mocker):
    mock_graph = MagicMock()
    mock_graph.invoke.return_value = {"audio_url": "https://example.com/life-lesson.mp3"}
    mock_supabase = MagicMock()
    # Cache miss — three .eq() chained
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    with patch("backend.main.royal_graph", mock_graph), \
         patch("backend.main.get_supabase_client", return_value=mock_supabase):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.post("/story", json={"princess": "elsa", "language": "en", "story_type": "life_lesson"})
    assert response.status_code == 200
    assert response.json()["audio_url"] == "https://example.com/life-lesson.mp3"
    # Verify story_type was passed through to the graph
    call_args = mock_graph.invoke.call_args[0][0]
    assert call_args["story_type"] == "life_lesson"

def test_get_story_today_princess_life_lesson_returns_royal_challenge(mocker):
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {
            "audio_url": "https://example.com/elsa-ll.mp3",
            "story_text": "Once in Arendelle... Your Royal Challenge: Try sharing today.",
            "royal_challenge": "Try sharing today.",
        }
    ]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_supabase)
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.get("/story/today/elsa?type=life_lesson")
    assert response.status_code == 200
    assert response.json()["royal_challenge"] == "Try sharing today."

def test_get_story_today_princess_daily_returns_null_royal_challenge(mocker):
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"audio_url": "https://example.com/elsa.mp3", "story_text": "Dear Emma...", "royal_challenge": None}
    ]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_supabase)
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.get("/story/today/elsa")  # no ?type param — defaults to daily
    assert response.status_code == 200
    assert response.json()["royal_challenge"] is None
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
cd backend && pytest backend/tests/test_api.py::test_post_story_life_lesson_triggers_graph backend/tests/test_api.py::test_get_story_today_princess_life_lesson_returns_royal_challenge backend/tests/test_api.py::test_get_story_today_princess_daily_returns_null_royal_challenge -v
```

Expected: FAIL (endpoint doesn't support `story_type` yet).

- [ ] **Step 3: Update `backend/main.py`**

Replace the relevant sections. The full updated file:

```python
# backend/main.py
import os
import concurrent.futures
from datetime import date
from typing import Literal
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from backend.graph import royal_graph
from backend.db.client import get_supabase_client

app = FastAPI(title="Royal Dispatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class BriefRequest(BaseModel):
    text: str

class StoryRequest(BaseModel):
    princess: Literal["elsa", "belle", "cinderella", "ariel"]
    language: Literal["en", "vi"] = "en"
    story_type: Literal["daily", "life_lesson"] = "daily"
    date: str | None = None

class StoryResponse(BaseModel):
    audio_url: str

class StoryDetailResponse(BaseModel):
    audio_url: str
    story_text: str
    royal_challenge: str | None

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
    story_date = req.date or date.today().isoformat()
    db = get_supabase_client()
    cached = (
        db.table("stories")
        .select("audio_url")
        .eq("date", story_date)
        .eq("princess", req.princess)
        .eq("story_type", req.story_type)
        .execute()
    )
    if cached.data:
        return StoryResponse(audio_url=cached.data[0]["audio_url"])
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
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(royal_graph.invoke, initial_state)
        try:
            result = future.result(timeout=60)
        except concurrent.futures.TimeoutError:
            raise HTTPException(status_code=504, detail="Story generation timed out")
    return StoryResponse(audio_url=result["audio_url"])

@app.get("/story/today")
def get_today_stories():
    today = date.today().isoformat()
    client = get_supabase_client()
    result = (
        client.table("stories")
        .select("princess,audio_url")
        .eq("date", today)
        .eq("story_type", "daily")
        .execute()
    )
    cached = {row["princess"]: row["audio_url"] for row in (result.data or [])}
    return {"date": today, "cached": cached}

@app.get("/story/today/{princess}", response_model=StoryDetailResponse)
def get_today_story_for_princess(
    princess: str,
    type: str = Query(default="daily"),  # Note: `type` shadows Python built-in — intentional
):
    today = date.today().isoformat()
    client = get_supabase_client()
    result = (
        client.table("stories")
        .select("audio_url,story_text,royal_challenge")
        .eq("date", today)
        .eq("princess", princess)
        .eq("story_type", type)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Story not found for today")
    row = result.data[0]
    return StoryDetailResponse(
        audio_url=row["audio_url"],
        story_text=row["story_text"],
        royal_challenge=row.get("royal_challenge"),
    )
```

- [ ] **Step 4: Run all backend tests**

```bash
cd backend && pytest backend/tests/ -v
```

Expected: all tests pass, including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_api.py
git commit -m "feat: update API to support story_type and royal_challenge"
```

---

## Task 8: Update Frontend API Client

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Replace `frontend/lib/api.ts`**

```typescript
// frontend/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export type Princess = 'elsa' | 'belle' | 'cinderella' | 'ariel';
export type Language = 'en' | 'vi';
export type StoryType = 'daily' | 'life_lesson';

export async function requestStory(
  princess: Princess,
  language: Language,
  storyType: StoryType = 'daily',
): Promise<void> {
  await fetch(`${API_URL}/story`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ princess, language, story_type: storyType }),
    signal: AbortSignal.timeout(90_000),
  });
  // Return value intentionally discarded — caller uses polling via fetchStory
}

export async function fetchStory(
  princess: Princess,
  storyType: StoryType = 'daily',
): Promise<{ audioUrl: string; storyText: string; royalChallenge: string | null }> {
  const url = `${API_URL}/story/today/${princess}?type=${storyType}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) throw new Error('STORY_NOT_FOUND');
  if (!res.ok) throw new Error('STORY_ERROR');
  const data = await res.json();
  return {
    audioUrl: data.audio_url,
    storyText: data.story_text,
    royalChallenge: data.royal_challenge ?? null,
  };
}
```

- [ ] **Step 2: Run frontend tests to verify no regressions**

```bash
cd frontend && npx vitest run
```

Expected: all existing tests pass (existing play page calls `fetchStory(princessId)` with no second arg — the default `"daily"` keeps it working).

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: add storyType param to requestStory and fetchStory"
```

---

## Task 9: Update i18n Messages

**Files:**
- Modify: `frontend/messages/en.json`
- Modify: `frontend/messages/vi.json`

- [ ] **Step 1: Add `story` namespace to `en.json`**

Add after the `app` object (inside the root `{}`):

```json
{
  "app": { ... existing content ... },
  "story": {
    "title": "Story",
    "royalChallenge": "Your Royal Challenge",
    "writing": "{princess} is crafting your life lesson..."
  }
}
```

- [ ] **Step 2: Add `story` namespace to `vi.json`**

```json
{
  "app": { ... existing content ... },
  "story": {
    "title": "Chuyện kể",
    "royalChallenge": "Thử thách Hoàng gia của em",
    "writing": "{princess} đang viết bài học cuộc sống cho em..."
  }
}
```

- [ ] **Step 3: Verify frontend tests still pass**

```bash
cd frontend && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add frontend/messages/en.json frontend/messages/vi.json
git commit -m "feat: add story i18n namespace with royalChallenge and writing keys"
```

---

## Task 10: Update AudioPlayer — Royal Challenge Card

**Files:**
- Modify: `frontend/components/AudioPlayer.tsx`
- Modify: `frontend/tests/AudioPlayer.test.tsx`

- [ ] **Step 1: Write failing tests first**

Add to `frontend/tests/AudioPlayer.test.tsx` (append after existing tests):

```typescript
it('renders Royal Challenge card when royalChallenge prop is provided', () => {
  renderWithIntl(
    <AudioPlayer
      princess={mockPrincess}
      audioUrl="https://example.com/test.mp3"
      storyText="Once in Arendelle..."
      royalChallenge="Try sharing one favourite thing today."
    />
  );
  expect(screen.getByText('Your Royal Challenge')).toBeInTheDocument();
  expect(screen.getByText('Try sharing one favourite thing today.')).toBeInTheDocument();
});

it('does not render Royal Challenge card when royalChallenge is not provided', () => {
  renderWithIntl(
    <AudioPlayer
      princess={mockPrincess}
      audioUrl="https://example.com/test.mp3"
      storyText="Dear Emma..."
    />
  );
  expect(screen.queryByText('Your Royal Challenge')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run tests/AudioPlayer.test.tsx
```

Expected: 2 new tests FAIL.

- [ ] **Step 3: Update `AudioPlayer.tsx`**

Change the Props interface:
```typescript
interface Props {
  princess: { id: string; name: string; emoji: string; origin?: string };
  audioUrl: string;
  storyText: string;
  royalChallenge?: string;  // add this
}
```

Change the function signature:
```typescript
export function AudioPlayer({ princess, audioUrl, storyText, royalChallenge }: Props) {
```

Add the Royal Challenge card inside the scrollable transcript area, after the story text `<div>` and before the closing `</div>` of the scrollable area. Insert after line ending `</div>` (the story text div):

Add at the top of the component body (after `const t = useTranslations('app')`):

```typescript
const tStory = useTranslations('story');
```

Then add the card JSX inside the scrollable transcript area, after the story text `<div>`:

```tsx
{royalChallenge && (
  <div className="mt-6 mb-4 border-2 border-amber-300 rounded-2xl bg-amber-50 p-5">
    <p className="text-amber-700 font-extrabold text-sm uppercase tracking-wider mb-2">
      👑 {tStory('royalChallenge')}
    </p>
    <p className="text-gray-800 font-semibold text-[16px] leading-relaxed italic">
      &ldquo;{royalChallenge}&rdquo;
    </p>
  </div>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run tests/AudioPlayer.test.tsx
```

Expected: all tests pass, including 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/AudioPlayer.tsx frontend/tests/AudioPlayer.test.tsx
git commit -m "feat: add royalChallenge prop and card to AudioPlayer"
```

---

## Task 11: Restructure Routes — Move Play Page to `(play)` Group

**Files:**
- Create: `frontend/app/[locale]/(play)/play/[princess]/page.tsx` (move from `play/[princess]/page.tsx`)
- Modify back button: `router.push(\`/${locale}\`)` → `router.push(\`/${locale}/inbox\`)`

The `(play)` route group has no layout file — pages inside it inherit only `app/[locale]/layout.tsx` (no BottomNav).

- [ ] **Step 1: Create the `(play)` directory structure**

```bash
mkdir -p frontend/app/\[locale\]/\(play\)/play/\[princess\]
```

- [ ] **Step 2: Copy the existing play page to the new location**

Read `frontend/app/[locale]/play/[princess]/page.tsx` and create `frontend/app/[locale]/(play)/play/[princess]/page.tsx` with one change: update the back button `router.push` from `` `/${locale}` `` to `` `/${locale}/inbox` ``.

The only line to change is:
```typescript
onClick={() => router.push(`/${locale}`)}
```
→
```typescript
onClick={() => router.push(`/${locale}/inbox`)}
```

- [ ] **Step 3: Delete the old play page**

```bash
rm frontend/app/\[locale\]/play/\[princess\]/page.tsx
rmdir frontend/app/\[locale\]/play/\[princess\] 2>/dev/null
rmdir frontend/app/\[locale\]/play 2>/dev/null
```

- [ ] **Step 4: Verify the app still builds**

```bash
cd frontend && npx next build 2>&1 | tail -20
```

Expected: build succeeds, route `/[locale]/play/[princess]` still exists (Next.js route groups are URL-transparent).

- [ ] **Step 5: Commit**

```bash
git add -A frontend/app/
git commit -m "refactor: move play page into (play) route group"
```

---

## Task 12: Create `(tabs)` Layout and `BottomNav`

**Files:**
- Create: `frontend/components/BottomNav.tsx`
- Create: `frontend/app/[locale]/(tabs)/layout.tsx`
- Create: `frontend/tests/BottomNav.test.tsx`

- [ ] **Step 1: Write failing BottomNav tests**

```typescript
// frontend/tests/BottomNav.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
}));

import { usePathname } from 'next/navigation';
import { BottomNav } from '@/components/BottomNav';

function renderNav(pathname: string) {
  (usePathname as ReturnType<typeof vi.fn>).mockReturnValue(pathname);
  return render(<BottomNav locale="en" />);
}

describe('BottomNav', () => {
  it('highlights Inbox tab when on inbox route', () => {
    renderNav('/en/inbox');
    const inboxBtn = screen.getByRole('link', { name: /inbox/i });
    expect(inboxBtn).toHaveClass('text-[var(--color-primary-orange)]');
  });

  it('highlights Story tab when on story route', () => {
    renderNav('/en/story');
    const storyBtn = screen.getByRole('link', { name: /story/i });
    expect(storyBtn).toHaveClass('text-[var(--color-primary-orange)]');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run tests/BottomNav.test.tsx
```

Expected: FAIL — `BottomNav` doesn't exist yet.

- [ ] **Step 3: Create `BottomNav.tsx`**

```typescript
// frontend/components/BottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  locale: string;
}

export function BottomNav({ locale }: Props) {
  const pathname = usePathname();
  const isInbox = pathname.includes('/inbox');
  const isStory = pathname.includes('/story');

  const active = 'text-[var(--color-primary-orange)]';
  const inactive = 'text-gray-400';

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[var(--background)] border-t border-gray-100 flex items-center justify-around z-50 pb-safe">
      <Link
        href={`/${locale}/inbox`}
        className={`flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${isInbox ? active : inactive}`}
        aria-label="Inbox"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Inbox
      </Link>
      <Link
        href={`/${locale}/story`}
        className={`flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${isStory ? active : inactive}`}
        aria-label="Story"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.753 0-3.332.477-4.5 1.253" />
        </svg>
        Story
      </Link>
    </nav>
  );
}
```

- [ ] **Step 4: Create `(tabs)/layout.tsx`**

```typescript
// frontend/app/[locale]/(tabs)/layout.tsx
import { getLocale } from 'next-intl/server';
import { BottomNav } from '@/components/BottomNav';

export default async function TabsLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <div className="pb-16">
      {children}
      <BottomNav locale={locale} />
    </div>
  );
}
```

- [ ] **Step 5: Run BottomNav tests**

```bash
cd frontend && npx vitest run tests/BottomNav.test.tsx
```

Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/BottomNav.tsx "frontend/app/[locale]/(tabs)/layout.tsx" frontend/tests/BottomNav.test.tsx
git commit -m "feat: add BottomNav component and (tabs) route group layout"
```

---

## Task 13: Update Root Page (Redirect) and Create Inbox Page

**Files:**
- Modify: `frontend/app/[locale]/page.tsx`
- Create: `frontend/app/[locale]/(tabs)/inbox/page.tsx`

- [ ] **Step 1: Update `app/[locale]/page.tsx` to redirect**

Replace the entire file content:

```typescript
// frontend/app/[locale]/page.tsx
import { redirect } from 'next/navigation';

export default async function RootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/inbox`);
}
```

- [ ] **Step 2: Create `(tabs)/inbox/page.tsx`**

This is the current `app/[locale]/page.tsx` content redesigned as an email-row list. The princess data and `handleSelectPrincess` logic are the same; only the layout changes.

```typescript
// frontend/app/[locale]/(tabs)/inbox/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { requestStory, Princess, Language } from '@/lib/api';

const PRINCESS_ROWS = [
  { id: 'elsa' as const,       name: 'Queen Elsa',  emoji: '❄️', origin: 'Kingdom of Arendelle', bgColor: 'bg-blue-100'   },
  { id: 'belle' as const,      name: 'Belle',       emoji: '📚', origin: 'The Enchanted Castle', bgColor: 'bg-amber-100'  },
  { id: 'cinderella' as const, name: 'Cinderella',  emoji: '👠', origin: 'The Royal Palace',     bgColor: 'bg-pink-100'   },
  { id: 'ariel' as const,      name: 'Ariel',       emoji: '🐠', origin: 'Under the Sea',        bgColor: 'bg-teal-100'   },
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
  useEffect(() => {
    localStorage.setItem('rd-language', language);
  }, [language]);

  function handleSelectPrincess(id: Princess) {
    void requestStory(id, language, 'daily');
    router.push(`/${locale}/play/${id}`);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] font-sans max-w-md mx-auto pt-safe">
      <header className="px-6 pt-12 pb-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-sm border-2 border-white bg-gradient-to-tr from-yellow-300 to-yellow-100 relative">
          <div className="absolute -right-1 -bottom-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white" />
          👧
        </div>
        <div>
          <p className="text-gray-500 text-[11px] font-bold uppercase tracking-wider">{t('greeting')}</p>
          <h1 className="text-gray-900 text-xl font-extrabold tracking-tight">Emma!</h1>
        </div>
      </header>

      <p className="px-6 pb-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">{t('subtitle')}</p>

      <div className="divide-y divide-gray-100 px-4">
        {PRINCESS_ROWS.map((p) => (
          <button
            key={p.id}
            onClick={() => handleSelectPrincess(p.id)}
            className="w-full flex items-center gap-4 py-4 px-2 text-left hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-colors"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0 ${p.bgColor}`}>
              {p.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-gray-900 text-sm">{p.name}</p>
              <p className="text-gray-400 text-xs truncate">{t(`origins.${p.id}`)}</p>
            </div>
            <div className="w-2.5 h-2.5 bg-[var(--color-primary-orange)] rounded-full flex-shrink-0" />
          </button>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && npx next build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/[locale]/page.tsx" "frontend/app/[locale]/(tabs)/inbox/page.tsx"
git commit -m "feat: add email-row Inbox page and root redirect"
```

---

## Task 14: Create Story Tab Page

**Files:**
- Create: `frontend/app/[locale]/(tabs)/story/page.tsx`
- Create: `frontend/tests/StoryPage.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// frontend/tests/StoryPage.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import messages from '../messages/en.json';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/en/story',
}));

// useLocale comes from next-intl, not next/navigation
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return { ...actual, useLocale: () => 'en' };
});

vi.mock('../lib/api', () => ({
  requestStory: vi.fn(),
}));

import * as api from '../lib/api';
import StoryPage from '../app/[locale]/(tabs)/story/page';

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe('StoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all four princess cards', () => {
    renderWithIntl(<StoryPage />);
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(4);
  });

  it('calls requestStory with life_lesson when princess card is tapped', async () => {
    renderWithIntl(<StoryPage />);
    const buttons = screen.getAllByRole('button');
    await userEvent.click(buttons[0]);
    expect(api.requestStory).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'life_lesson',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run tests/StoryPage.test.tsx
```

Expected: FAIL — `StoryPage` doesn't exist yet.

- [ ] **Step 3: Create `(tabs)/story/page.tsx`**

This mirrors the original Inbox layout but with `story_type: "life_lesson"` and routing to `/story/[princess]`:

```typescript
// frontend/app/[locale]/(tabs)/story/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { PrincessCard, PrincessConfig } from '@/components/PrincessCard';
import { requestStory, Princess, Language } from '@/lib/api';

const PRINCESSES: PrincessConfig[] = [
  {
    id: 'elsa', name: 'Queen Elsa', emoji: '❄️', imageUrl: '/characters/elsa.png',
    bgColor: 'bg-blue-300', borderColor: 'border-blue-300', labelColor: 'text-blue-600',
    nameColor: 'text-blue-900', avatarGradient: 'from-blue-200 to-blue-400', badgeBg: 'bg-blue-100',
    origin: 'Arendelle', isNew: false,
  },
  {
    id: 'belle', name: 'Belle', emoji: '📚', imageUrl: '/characters/belle.png',
    bgColor: 'bg-yellow-300', borderColor: 'border-amber-300', labelColor: 'text-amber-700',
    nameColor: 'text-amber-900', avatarGradient: 'from-yellow-200 to-amber-300', badgeBg: 'bg-amber-100',
    origin: 'The Enchanted Castle', isNew: false,
  },
  {
    id: 'cinderella', name: 'Cinderella', emoji: '👠', imageUrl: '/characters/cinderella.png',
    bgColor: 'bg-pink-300', borderColor: 'border-fuchsia-300', labelColor: 'text-fuchsia-700',
    nameColor: 'text-fuchsia-900', avatarGradient: 'from-fuchsia-200 to-pink-300', badgeBg: 'bg-fuchsia-100',
    origin: 'The Royal Palace', isNew: false,
  },
  {
    id: 'ariel', name: 'Ariel', emoji: '🐠', imageUrl: '/characters/ariel.png',
    bgColor: 'bg-emerald-300', borderColor: 'border-teal-300', labelColor: 'text-teal-700',
    nameColor: 'text-teal-900', avatarGradient: 'from-teal-200 to-cyan-300', badgeBg: 'bg-teal-100',
    origin: 'Atlantica', isNew: false,
  },
];

export default function StoryPage() {
  const t = useTranslations('app');
  const tStory = useTranslations('story');
  const locale = useLocale() as Language;
  const router = useRouter();
  const [language] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('rd-language') as Language) ?? locale;
    }
    return locale;
  });

  const princesses = PRINCESSES.map((p) => ({ ...p, origin: t(`origins.${p.id}`) }));

  function handleSelectPrincess(id: Princess) {
    void requestStory(id, language, 'life_lesson');
    router.push(`/${locale}/story/${id}`);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] pb-24 font-sans max-w-md mx-auto relative overflow-x-hidden pt-safe">
      <header className="px-6 pt-12 pb-6">
        <h1 className="text-gray-900 text-2xl font-extrabold tracking-tight">{tStory('title')}</h1>
        <p className="text-gray-500 text-sm mt-1">Choose a princess for today's life lesson</p>
      </header>
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-6 px-6 pb-12 pt-2">
        {princesses.map((p) => (
          <PrincessCard key={p.id} princess={p} onClick={handleSelectPrincess} />
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run tests/StoryPage.test.tsx
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/[locale]/(tabs)/story/page.tsx" frontend/tests/StoryPage.test.tsx
git commit -m "feat: add Story tab page with life_lesson princess card grid"
```

---

## Task 15: Create Life Lesson Play Page

**Files:**
- Create: `frontend/app/[locale]/(play)/story/[princess]/page.tsx`

This is nearly identical to `(play)/play/[princess]/page.tsx` with three differences:
1. Polls with `storyType: "life_lesson"`
2. Passes `royalChallenge` to `<AudioPlayer>`
3. Back button navigates to `/${locale}/story` (not `/inbox`)

- [ ] **Step 1: Create the play page**

```typescript
// frontend/app/[locale]/(play)/story/[princess]/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { AudioPlayer } from '@/components/AudioPlayer';
import { fetchStory, Princess } from '@/lib/api';

const PRINCESS_META = {
  elsa:       { name: 'Queen Elsa',  emoji: '❄️',  origin: 'Kingdom of Arendelle' },
  belle:      { name: 'Belle',       emoji: '📚',  origin: 'The Enchanted Castle' },
  cinderella: { name: 'Cinderella',  emoji: '👠',  origin: 'The Royal Palace' },
  ariel:      { name: 'Ariel',       emoji: '🐠',  origin: 'Under the Sea' },
} as const;

const PRINCESS_OVERLAY: Record<string, string> = {
  elsa:       'rgba(147, 197, 253, 0.25)',
  belle:      'rgba(252, 211, 77, 0.25)',
  cinderella: 'rgba(249, 168, 212, 0.25)',
  ariel:      'rgba(110, 231, 183, 0.25)',
};

type PrincessId = keyof typeof PRINCESS_META;
type PageState = 'polling' | 'ready' | 'timeout' | 'error';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 75000;

export default function StoryPlayPage() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('app');
  const tStory = useTranslations('story');

  const princessId = (params.princess as PrincessId) ?? 'elsa';
  const meta = PRINCESS_META[princessId] ?? PRINCESS_META.elsa;
  const overlay = PRINCESS_OVERLAY[princessId] ?? 'rgba(200,200,200,0.2)';

  const [pageState, setPageState] = useState<PageState>('polling');
  const [audioUrl, setAudioUrl] = useState('');
  const [storyText, setStoryText] = useState('');
  const [royalChallenge, setRoyalChallenge] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let stopped = false;
    const startTime = Date.now();

    function stopPolling() {
      stopped = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    async function poll() {
      if (stopped) return;
      if (Date.now() - startTime >= POLL_TIMEOUT_MS) {
        stopPolling();
        setPageState('timeout');
        return;
      }
      try {
        const result = await fetchStory(princessId as Princess, 'life_lesson');
        if (stopped) return;
        stopPolling();
        setAudioUrl(result.audioUrl);
        setStoryText(result.storyText);
        setRoyalChallenge(result.royalChallenge);
        setPageState('ready');
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'STORY_ERROR') {
          stopPolling();
          setPageState('error');
        }
        // STORY_NOT_FOUND → keep polling
      }
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return stopPolling;
  }, [princessId]);

  if (pageState === 'ready') {
    return (
      <AudioPlayer
        princess={{ id: princessId, ...meta }}
        audioUrl={audioUrl}
        storyText={storyText}
        royalChallenge={royalChallenge ?? undefined}
      />
    );
  }

  if (pageState === 'timeout' || pageState === 'error') {
    const sorryMessage = {
      elsa: t('sorryMessages.elsa'),
      belle: t('sorryMessages.belle'),
      cinderella: t('sorryMessages.cinderella'),
      ariel: t('sorryMessages.ariel'),
    }[princessId] ?? t('sorryMessages.elsa');
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[var(--background)] px-8 text-center gap-6">
        <img
          src={`/characters/${princessId}.png`}
          alt={meta.name}
          className="w-48 h-48 object-cover rounded-full shadow-lg opacity-80"
        />
        <p className="text-xl font-bold text-gray-700 max-w-xs leading-snug">{sorryMessage}</p>
        <button
          onClick={() => router.push(`/${locale}/story`)}
          className="mt-2 px-8 py-3 bg-black text-white font-bold rounded-full text-sm tracking-widest uppercase"
        >
          {t('goBack')}
        </button>
      </div>
    );
  }

  // polling state — looping video
  return (
    <div className="fixed inset-0 overflow-hidden">
      <video
        src="/videos/Princess_Writes_Letter_For_Emma.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0" style={{ backgroundColor: overlay }} />
      <span className="sr-only">{tStory('writing', { princess: meta.name })}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npx next build 2>&1 | tail -15
```

Expected: build succeeds with routes `/[locale]/story` and `/[locale]/story/[princess]` both present.

- [ ] **Step 3: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/[locale]/(play)/story/[princess]/page.tsx"
git commit -m "feat: add life lesson story play page with Royal Challenge and polling"
```

---

## Task 16: Final Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && pytest backend/tests/ -v
```

Expected: all tests pass, no failures.

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass, no failures.

- [ ] **Step 3: Smoke-test the dev server**

Start backend: `cd backend && uvicorn backend.main:app --reload`
Start frontend: `cd frontend && npm run dev`

Open `http://localhost:3000/en` — verify it redirects to `/en/inbox`.
Verify the bottom nav shows Inbox and Story tabs.
Tap a princess in the Story tab — verify the loading video plays and polling starts.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Life Lesson story feature with bottom navigation"
```
