# mem0 Integration Design

**Date:** 2026-03-29
**Project:** The Royal Dispatch
**Feature:** Long-term memory for Emma using mem0 OSS

---

## Overview

Add [mem0](https://github.com/mem0ai/mem0) as a self-hosted memory layer so the princesses accumulate knowledge about Emma over time. Each night's brief is filtered for memorable facts (preferences, habits, milestones, social patterns) and stored. When a story is generated, those memories are retrieved and woven naturally into the letter.

---

## Architecture

### New Docker Services

mem0 OSS is a Python library (not a standalone server). The backend embeds it directly. Only Qdrant runs as a new Docker service:

```yaml
qdrant:
  image: qdrant/qdrant
  ports:
    - "6333:6333"
  volumes:
    - qdrant_data:/qdrant/storage
```

The `backend` service gains the `mem0` Python package and connects to Qdrant for vector storage. mem0 uses OpenAI embeddings by default — `OPENAI_API_KEY` is required in `backend/.env`. Qdrant persists the vector store across restarts.

### Updated LangGraph Pipeline

```
fetch_brief
    ↓
extract_memories   ← NEW
    ↓
classify_tone
    ↓
load_persona
    ↓
fetch_memories     ← NEW
    ↓
generate_story     (prompt enriched with memories)
    ↓
synthesize_voice
    ↓
store_result
```

All memories are stored under `user_id = "emma"`.

---

## New Nodes

### `extract_memories` (`backend/nodes/extract_memories.py`)

Runs after `fetch_brief`. Skipped if `state["brief"] == "__fallback__"`.

Calls `memory.add(brief_text, user_id="emma")` with a system prompt instructing extraction of:
- **Preferences** — favorite toys, colors, foods, characters
- **Social patterns** — friendships, sibling dynamics, social wins/struggles
- **Habit tracking** — recurring behaviors Emma is working on
- **Milestones** — significant life events and achievements

If the brief contains nothing memorable, the node skips the mem0 call entirely. If mem0 is unreachable, logs a warning and continues — story generation is never blocked.

Returns: no state change (side-effect only node).

### `fetch_memories` (`backend/nodes/fetch_memories.py`)

Runs after `load_persona`, before `generate_story`.

Makes two mem0 library calls:
1. `memory.get_all(user_id="emma")` — retrieves all memories, formats the 10 most recent as a bullet list (compact Emma profile)
2. `memory.search(query=brief_text, user_id="emma", limit=5)` — retrieves contextually relevant memories for today

Merges both into a single formatted string:

```
- Emma loves her blue teddy bear
- She has been working on brushing her teeth at bedtime
- Her best friend at school is Lily
- She recently had her 4th birthday party
[Today: Emma helped her friend share crayons]
```

If mem0 is unreachable, returns `memories = ""`. Story generation continues normally.

Returns: `{"memories": "<formatted string>"}`.

---

## State Changes

`RoyalState` gains one new field:

```python
memories: str  # formatted memory context; empty string if none available
```

---

## Story Prompt Change

`generate_story` appends a memory section to the system prompt when `state["memories"]` is non-empty:

```
What I know about Emma:
{memories}

Use these details naturally only when relevant — never force them in.
```

---

## Environment Variables

| Variable | Description | Default (local dev) |
|---|---|---|
| `QDRANT_URL` | Qdrant vector store URL | `http://localhost:6333` |
| `OPENAI_API_KEY` | Required by mem0 for embeddings | — |

`QDRANT_URL` is read in a new `backend/utils/mem0_client.py` singleton that initialises the `mem0.Memory` client with Qdrant config and exposes `add_memory()` and `search_memories()` helpers.

---

## Error Handling

Both new nodes catch all exceptions from mem0/Qdrant and fail gracefully:
- `extract_memories`: logs warning, returns `{}`
- `fetch_memories`: logs warning, returns `{"memories": ""}`

This ensures a mem0 outage never prevents Emma from getting her bedtime letter.

---

## Testing

- Unit tests for `extract_memories` and `fetch_memories` mock the mem0 client
- Integration test: post a brief, confirm mem0 contains extracted facts, generate a story, confirm memories appear in the prompt
- Fallback test: mem0 unavailable → story generates normally with empty memories
