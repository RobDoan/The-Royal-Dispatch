# mem0 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mem0 OSS + Qdrant as a long-term memory layer so the princesses accumulate knowledge about Emma over time and weave it naturally into bedtime letters.

**Architecture:** Two new LangGraph nodes (`extract_memories` after `fetch_brief`, `fetch_memories` after `load_persona`) handle memory storage and retrieval. mem0 runs as a Python library inside the backend container; Qdrant runs as a new Docker service for vector persistence.

**Tech Stack:** `mem0ai` Python package, Qdrant (Docker), OpenAI embeddings (used internally by mem0)

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `backend/utils/mem0_client.py` | Singleton `Memory` instance configured with Qdrant |
| Create | `backend/nodes/extract_memories.py` | LangGraph node — stores memorable facts from brief to mem0 |
| Create | `backend/nodes/fetch_memories.py` | LangGraph node — retrieves Emma's profile + relevant memories |
| Create | `backend/tests/test_nodes/test_extract_memories.py` | Unit tests for extract_memories |
| Create | `backend/tests/test_nodes/test_fetch_memories.py` | Unit tests for fetch_memories |
| Modify | `docker-compose.yml` | Add qdrant service + qdrant_data volume |
| Modify | `backend/pyproject.toml` | Add `mem0ai` dependency |
| Modify | `backend/state.py` | Add `memories: str` to `RoyalStateOptional` |
| Modify | `backend/graph.py` | Wire extract_memories + fetch_memories into pipeline |
| Modify | `backend/nodes/generate_story.py` | Inject memories into system prompt |
| Modify | `backend/tests/test_nodes/test_generate_story.py` | Add tests for memories injection |

---

## Task 1: Infrastructure — Docker + Dependencies

**Files:**
- Modify: `docker-compose.yml`
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Add Qdrant service to docker-compose.yml**

Open `docker-compose.yml`. Add the `qdrant` service and `qdrant_data` volume so the final file looks like:

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    ports:
      - "8000:8000"
    environment:
      - PYTHONUNBUFFERED=1
    env_file:
      - backend/.env
    restart: unless-stopped
    depends_on:
      - qdrant

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - ./frontend/.env.local
    restart: unless-stopped
    depends_on:
      - backend

  n8n:
    image: n8nio/n8n
    ports:
      - "5678:5678"
    environment:
      - N8N_BLOCK_ENV_ACCESS_IN_NODE=false
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=changeme
      - TELEGRAM_BOT_TOKEN=8739411539:AAH0aMqkShqkwG5vFjltkUJgzhxjoCgseAY
      - PARENT_CHAT_ID=5863873556
      - BACKEND_URL=http://backend:8000
    volumes:
      - n8n_data:/home/node/.n8n
    restart: unless-stopped
    depends_on:
      - backend

  qdrant:
    image: qdrant/qdrant
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage
    restart: unless-stopped

volumes:
  n8n_data:
  qdrant_data:
```

- [ ] **Step 2: Add mem0ai to pyproject.toml**

In `backend/pyproject.toml`, add `mem0ai>=0.1.0` to the `dependencies` list:

```toml
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
    "mem0ai>=0.1.0",
]
```

- [ ] **Step 3: Install the new dependency**

```bash
cd backend
pip install -e ".[dev]"
```

Expected: mem0ai and its dependencies (including qdrant-client, openai) install without errors.

- [ ] **Step 4: Add QDRANT_URL and OPENAI_API_KEY to backend/.env**

Append to `backend/.env`:

```env
QDRANT_URL=http://localhost:6333
OPENAI_API_KEY=sk-...your-openai-key...
```

(When running via docker-compose, `QDRANT_URL` should be `http://qdrant:6333`.)

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml backend/pyproject.toml
git commit -m "feat: add Qdrant service and mem0ai dependency"
```

---

## Task 2: Add memories to RoyalState

**Files:**
- Modify: `backend/state.py`

- [ ] **Step 1: Add `memories` field to RoyalStateOptional**

Open `backend/state.py`. Add `memories` to `RoyalStateOptional`:

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
    audio_url: str     # Supabase Storage public URL
    language: str      # "en" | "vi"
    timezone: str      # user's IANA timezone, e.g. "America/Los_Angeles"

class RoyalStateOptional(RoyalState, total=False):
    royal_challenge: str | None  # only written by generate_life_lesson; absent for daily
    memories: str                # formatted memory context; empty string if none available
```

- [ ] **Step 2: Run existing tests to confirm no regressions**

```bash
cd backend
pytest tests/ -v
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/state.py
git commit -m "feat: add memories field to RoyalStateOptional"
```

---

## Task 3: mem0 client singleton

**Files:**
- Create: `backend/utils/mem0_client.py`

- [ ] **Step 1: Create the mem0 client utility**

Create `backend/utils/mem0_client.py`:

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

- [ ] **Step 2: Commit**

```bash
git add backend/utils/mem0_client.py
git commit -m "feat: add mem0 client singleton with Qdrant config"
```

---

## Task 4: extract_memories node (TDD)

**Files:**
- Create: `backend/tests/test_nodes/test_extract_memories.py`
- Create: `backend/nodes/extract_memories.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_nodes/test_extract_memories.py`:

```python
from unittest.mock import MagicMock
from backend.nodes.extract_memories import extract_memories


def test_extract_memories_skips_fallback(mocker):
    """When brief is __fallback__, mem0 must not be called."""
    state = {"brief": "__fallback__"}
    mock_get_memory = mocker.patch("backend.nodes.extract_memories.get_memory")
    result = extract_memories(state)
    mock_get_memory.assert_not_called()
    assert result == {}


def test_extract_memories_calls_memory_add(mocker):
    """When a real brief is present, memory.add() is called with the brief and user_id='emma'."""
    state = {"brief": "Emma shared her toys and loves her blue teddy bear."}
    mock_memory = MagicMock()
    mocker.patch("backend.nodes.extract_memories.get_memory", return_value=mock_memory)

    result = extract_memories(state)

    mock_memory.add.assert_called_once()
    call_args = mock_memory.add.call_args
    messages = call_args[0][0]
    assert any(
        msg["role"] == "user" and "Emma" in msg["content"] for msg in messages
    )
    assert call_args[1]["user_id"] == "emma"
    assert result == {}


def test_extract_memories_system_prompt_covers_all_categories(mocker):
    """System message must mention preferences, habits, milestones, social patterns."""
    state = {"brief": "Emma had a great day."}
    mock_memory = MagicMock()
    mocker.patch("backend.nodes.extract_memories.get_memory", return_value=mock_memory)

    extract_memories(state)

    messages = mock_memory.add.call_args[0][0]
    system_content = next(m["content"] for m in messages if m["role"] == "system")
    for keyword in ("preferences", "habits", "milestones", "social"):
        assert keyword.lower() in system_content.lower(), f"System prompt missing: {keyword}"


def test_extract_memories_handles_mem0_error_gracefully(mocker):
    """If mem0 raises, the node returns {} without propagating the exception."""
    state = {"brief": "Emma had a great day."}
    mock_memory = MagicMock()
    mock_memory.add.side_effect = Exception("Qdrant unreachable")
    mocker.patch("backend.nodes.extract_memories.get_memory", return_value=mock_memory)

    result = extract_memories(state)  # must not raise

    assert result == {}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend
pytest tests/test_nodes/test_extract_memories.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` — `extract_memories` doesn't exist yet.

- [ ] **Step 3: Implement extract_memories**

Create `backend/nodes/extract_memories.py`:

```python
import logging
from backend.state import RoyalStateOptional
from backend.utils.mem0_client import get_memory

logger = logging.getLogger(__name__)

_EXTRACTION_SYSTEM_PROMPT = (
    "Extract only facts worth remembering long-term about Emma: "
    "her preferences (favorite toys, colors, foods, characters), "
    "social patterns (friendships, sibling dynamics, social wins/struggles), "
    "habits (recurring behaviors she is working on, e.g. brushing teeth, sharing), "
    "and milestones (significant achievements or life events). "
    "Ignore transient details that are not reusable in future stories."
)


def extract_memories(state: RoyalStateOptional) -> dict:
    brief = state.get("brief", "__fallback__")
    if brief == "__fallback__":
        return {}
    try:
        memory = get_memory()
        memory.add(
            [
                {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": brief},
            ],
            user_id="emma",
        )
    except Exception:
        logger.warning(
            "extract_memories: mem0 unavailable, skipping memory extraction",
            exc_info=True,
        )
    return {}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend
pytest tests/test_nodes/test_extract_memories.py -v
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/nodes/extract_memories.py backend/tests/test_nodes/test_extract_memories.py
git commit -m "feat: add extract_memories node with graceful mem0 fallback"
```

---

## Task 5: fetch_memories node (TDD)

**Files:**
- Create: `backend/tests/test_nodes/test_fetch_memories.py`
- Create: `backend/nodes/fetch_memories.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_nodes/test_fetch_memories.py`:

```python
from unittest.mock import MagicMock
from backend.nodes.fetch_memories import fetch_memories


def test_fetch_memories_combines_profile_and_relevant(mocker):
    """Profile memories appear as bullets; relevant non-overlapping memories appear with [Today:] prefix."""
    state = {"brief": "Emma shared her crayons today."}
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

    assert "- Emma loves her blue teddy bear" in result["memories"]
    assert "- Emma is working on brushing her teeth" in result["memories"]
    assert "[Today: Emma helped a friend share at school]" in result["memories"]


def test_fetch_memories_deduplicates_relevant_already_in_profile(mocker):
    """A memory already in the profile must not appear again under [Today:]."""
    state = {"brief": "Emma shared her crayons."}
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
    state = {"brief": "__fallback__"}
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
    state = {"brief": "Emma had a great day."}
    mock_memory = MagicMock()
    mock_memory.get_all.side_effect = Exception("Qdrant unreachable")
    mocker.patch("backend.nodes.fetch_memories.get_memory", return_value=mock_memory)

    result = fetch_memories(state)

    assert result == {"memories": ""}


def test_fetch_memories_returns_empty_string_when_no_memories(mocker):
    """When mem0 has nothing stored yet, returns memories=''."""
    state = {"brief": "Emma had a great day."}
    mock_memory = MagicMock()
    mock_memory.get_all.return_value = []
    mock_memory.search.return_value = []
    mocker.patch("backend.nodes.fetch_memories.get_memory", return_value=mock_memory)

    result = fetch_memories(state)

    assert result == {"memories": ""}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend
pytest tests/test_nodes/test_fetch_memories.py -v
```

Expected: `ImportError` — `fetch_memories` doesn't exist yet.

- [ ] **Step 3: Implement fetch_memories**

Create `backend/nodes/fetch_memories.py`:

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
    brief = state.get("brief", "__fallback__")
    try:
        memory = get_memory()

        # Build compact Emma profile from 10 most recent memories
        all_memories = _as_list(memory.get_all(user_id="emma"))
        profile_items = [m for m in all_memories[:10] if m.get("memory")]
        profile_lines = [f"- {m['memory']}" for m in profile_items]
        profile_ids = {m.get("id") for m in profile_items}

        # Contextually relevant memories for today's brief
        relevant_lines = []
        if brief and brief != "__fallback__":
            relevant = _as_list(
                memory.search(query=brief, user_id="emma", limit=5)
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

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend
pytest tests/test_nodes/test_fetch_memories.py -v
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/nodes/fetch_memories.py backend/tests/test_nodes/test_fetch_memories.py
git commit -m "feat: add fetch_memories node combining profile and contextual memories"
```

---

## Task 6: Update generate_story to use memories (TDD)

**Files:**
- Modify: `backend/tests/test_nodes/test_generate_story.py`
- Modify: `backend/nodes/generate_story.py`

- [ ] **Step 1: Add failing tests for memories injection**

Append to `backend/tests/test_nodes/test_generate_story.py`:

```python
def test_generate_story_includes_memories_in_system_prompt(praise_state, mocker):
    """When memories are present, the system prompt includes them under 'What I know about Emma'."""
    praise_state["memories"] = (
        "- Emma loves her blue teddy bear\n- She is working on brushing her teeth"
    )
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "[PROUD] Emma, you did great!"
    mocker.patch("backend.nodes.generate_story.get_llm", return_value=mock_llm)

    generate_story(praise_state)

    system_msg = mock_llm.invoke.call_args[0][0][0]
    assert "What I know about Emma" in system_msg.content
    assert "Emma loves her blue teddy bear" in system_msg.content


def test_generate_story_omits_memory_section_when_memories_empty(praise_state, mocker):
    """When memories is empty string, 'What I know about Emma' must not appear in the prompt."""
    praise_state["memories"] = ""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "[PROUD] Emma, you did great!"
    mocker.patch("backend.nodes.generate_story.get_llm", return_value=mock_llm)

    generate_story(praise_state)

    system_msg = mock_llm.invoke.call_args[0][0][0]
    assert "What I know about Emma" not in system_msg.content


def test_generate_story_omits_memory_section_when_memories_absent(praise_state, mocker):
    """When memories key is absent from state, no memory section in prompt."""
    # praise_state fixture doesn't include memories — simulates nodes before fetch_memories ran
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "[PROUD] Emma, you did great!"
    mocker.patch("backend.nodes.generate_story.get_llm", return_value=mock_llm)

    generate_story(praise_state)

    system_msg = mock_llm.invoke.call_args[0][0][0]
    assert "What I know about Emma" not in system_msg.content
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd backend
pytest tests/test_nodes/test_generate_story.py -v -k "memories"
```

Expected: 3 new tests fail — memories are not yet injected.

- [ ] **Step 3: Update generate_story implementation**

Open `backend/nodes/generate_story.py`. Add `_MEMORY_SECTION` constant and use `.get()` to read memories:

```python
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from backend.state import RoyalStateOptional

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

_MEMORY_SECTION = """

What I know about Emma:
{memories}

Use these details naturally only when relevant — never force them in."""

TONE_INSTRUCTIONS = {
    "praise": "Celebrate what Emma did today directly and warmly. Make her feel seen and proud.",
    "habit": 'Tell a short story about a character from your world who learned the same habit. Use this metaphor as inspiration: "{metaphor}". Never lecture — just model through story.',
}

LANGUAGE_LABELS = {"en": "English", "vi": "Vietnamese (Tiếng Việt)"}

def generate_story(state: RoyalStateOptional) -> dict:
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

    memories = state.get("memories", "")
    if memories:
        system += _MEMORY_SECTION.format(memories=memories)

    llm = get_llm()
    response = llm.invoke([
        SystemMessage(content=system),
        HumanMessage(content=f"Parent's note about Emma's day: {state['brief']}"),
    ])
    return {"story_text": response.content.strip()}
```

- [ ] **Step 4: Run all generate_story tests**

```bash
cd backend
pytest tests/test_nodes/test_generate_story.py -v
```

Expected: all tests pass (3 existing + 3 new = 6 total).

- [ ] **Step 5: Commit**

```bash
git add backend/nodes/generate_story.py backend/tests/test_nodes/test_generate_story.py
git commit -m "feat: inject Emma's memories into generate_story prompt"
```

---

## Task 7: Wire new nodes into the graph

**Files:**
- Modify: `backend/graph.py`

- [ ] **Step 1: Update graph.py to insert both new nodes**

Replace the contents of `backend/graph.py` with:

```python
from langgraph.graph import StateGraph, END
from backend.state import RoyalStateOptional
from backend.nodes.fetch_brief import fetch_brief
from backend.nodes.extract_memories import extract_memories
from backend.nodes.classify_tone import classify_tone
from backend.nodes.load_persona import load_persona
from backend.nodes.fetch_memories import fetch_memories
from backend.nodes.generate_story import generate_story
from backend.nodes.infer_situation import infer_situation
from backend.nodes.generate_life_lesson import generate_life_lesson
from backend.nodes.synthesize_voice import synthesize_voice
from backend.nodes.store_result import store_result

def route_story_type(state: RoyalStateOptional) -> str:
    return state["story_type"]

def build_graph():
    graph = StateGraph(RoyalStateOptional)
    graph.add_node("fetch_brief", fetch_brief)
    graph.add_node("extract_memories", extract_memories)
    graph.add_node("classify_tone", classify_tone)
    graph.add_node("load_persona", load_persona)
    graph.add_node("fetch_memories", fetch_memories)
    graph.add_node("generate_story", generate_story)
    graph.add_node("infer_situation", infer_situation)
    graph.add_node("generate_life_lesson", generate_life_lesson)
    graph.add_node("synthesize_voice", synthesize_voice)
    graph.add_node("store_result", store_result)

    graph.set_entry_point("fetch_brief")
    graph.add_edge("fetch_brief", "extract_memories")
    graph.add_edge("extract_memories", "classify_tone")
    graph.add_edge("classify_tone", "load_persona")
    graph.add_edge("load_persona", "fetch_memories")
    graph.add_conditional_edges(
        "fetch_memories",
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

- [ ] **Step 2: Run the full test suite**

```bash
cd backend
pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/graph.py
git commit -m "feat: wire extract_memories and fetch_memories into LangGraph pipeline"
```

---

## Self-Review Checklist (completed inline)

- **Spec coverage:**
  - ✅ Qdrant Docker service → Task 1
  - ✅ `mem0ai` Python dependency → Task 1
  - ✅ `memories: str` in state → Task 2
  - ✅ `mem0_client.py` singleton → Task 3
  - ✅ `extract_memories` node (skip on fallback, graceful error) → Task 4
  - ✅ `fetch_memories` node (profile + search, graceful error) → Task 5
  - ✅ `generate_story` memory injection → Task 6
  - ✅ Graph wiring → Task 7
  - ✅ `OPENAI_API_KEY` env var documented → Task 1 Step 4
  - ✅ `QDRANT_URL` env var with local default → Task 3

- **No placeholders:** all steps contain actual code.

- **Type consistency:** `get_memory()` returns `Memory` — used identically in Tasks 4, 5. `state.get("memories", "")` used consistently in Tasks 5 and 6.
