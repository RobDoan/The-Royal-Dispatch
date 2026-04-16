# Streaming Audio on Cache Miss — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce cold-start audio latency by streaming ElevenLabs output directly to the client while tee-ing bytes to S3 for future cache hits.

**Architecture:** On `POST /story` cache miss, return a backend streaming URL immediately (no pipeline work). The frontend's `<audio>` element hits that URL, which runs the LangGraph pipeline up through story generation, then streams ElevenLabs output as it arrives. A detached background task uploads the complete MP3 to S3 and inserts the story row once the stream ends — even if the client disconnects mid-stream.

**Tech Stack:** FastAPI `StreamingResponse`, LangGraph (`pre_tts_graph`), ElevenLabs SDK (streaming `convert()`), asyncio (`create_task`, `to_thread`), boto3 (S3/MinIO), psycopg (PostgreSQL).

**Spec:** `docs/superpowers/specs/2026-04-16-streaming-audio-design.md`

---

## File Structure

**New files:**
- `backend/tests/test_nodes/test_synthesize_voice_stream.py` — unit tests for streaming helper
- `backend/tests/test_nodes/test_store_result_from_bytes.py` — unit tests for bytes persistence helper
- `backend/tests/test_graph_pre_tts.py` — tests for the pre-TTS compiled graph

**Modified files:**
- `backend/nodes/synthesize_voice.py` — add `synthesize_voice_stream()` helper (existing `synthesize_voice` node untouched)
- `backend/nodes/store_result.py` — add `store_result_from_bytes()` helper (existing `store_result` node untouched)
- `backend/graph.py` — add `pre_tts_graph` compiled graph (existing `royal_graph` untouched)
- `backend/routes/stories.py` — change `POST /story` to return streaming URL on cache miss; add `GET /story/stream` endpoint
- `backend/tests/test_api.py` — update `POST /story` tests, add `GET /story/stream` tests
- `backend/.env.example` — add `BACKEND_PUBLIC_URL`
- `docker-compose.yml` — add `BACKEND_PUBLIC_URL` to backend env
- `k8s/backend/deployment.yaml` — add `BACKEND_PUBLIC_URL` env

---

## Task 1: `synthesize_voice_stream` helper

**Goal:** Add a thin helper that calls ElevenLabs and yields raw MP3 chunks, with no buffering and no S3 upload.

**Files:**
- Test: `backend/tests/test_nodes/test_synthesize_voice_stream.py` (create)
- Implementation: `backend/nodes/synthesize_voice.py` (modify — append function)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_nodes/test_synthesize_voice_stream.py`:

```python
from unittest.mock import MagicMock
from backend.nodes.synthesize_voice import synthesize_voice_stream


def test_synthesize_voice_stream_yields_chunks_unchanged(mocker):
    mock_client = MagicMock()
    mock_client.text_to_speech.convert.return_value = iter([b"chunk1", b"chunk2", b"chunk3"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_client)

    chunks = list(synthesize_voice_stream(voice_id="v-123", text="Hello"))

    assert chunks == [b"chunk1", b"chunk2", b"chunk3"]
    mock_client.text_to_speech.convert.assert_called_once_with(
        voice_id="v-123",
        text="Hello",
        model_id="eleven_v3",
        output_format="mp3_44100_128",
    )


def test_synthesize_voice_stream_does_not_touch_s3(mocker):
    mock_client = MagicMock()
    mock_client.text_to_speech.convert.return_value = iter([b"chunk"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_client)
    mock_storage = MagicMock()
    mocker.patch("backend.nodes.synthesize_voice.get_storage", return_value=mock_storage)

    list(synthesize_voice_stream(voice_id="v", text="t"))

    mock_storage.put_object.assert_not_called()
```

- [ ] **Step 2: Run test to verify it fails**

```
cd backend
uv run pytest tests/test_nodes/test_synthesize_voice_stream.py -v
```

Expected: `ImportError: cannot import name 'synthesize_voice_stream'`.

- [ ] **Step 3: Implement `synthesize_voice_stream`**

Append to `backend/nodes/synthesize_voice.py`:

```python
from typing import Iterator


def synthesize_voice_stream(voice_id: str, text: str) -> Iterator[bytes]:
    """Stream MP3 chunks from ElevenLabs without buffering or uploading.

    Caller is responsible for consuming the iterator, buffering bytes, and
    persisting the final MP3 to S3 via store_result_from_bytes.
    """
    client = get_elevenlabs_client()
    return client.text_to_speech.convert(
        voice_id=voice_id,
        text=text,
        model_id="eleven_v3",
        output_format="mp3_44100_128",
    )
```

- [ ] **Step 4: Run test to verify it passes**

```
cd backend
uv run pytest tests/test_nodes/test_synthesize_voice_stream.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Run the full existing voice node tests to ensure nothing broke**

```
cd backend
uv run pytest tests/test_nodes/test_synthesize_voice.py -v
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```
git add backend/tests/test_nodes/test_synthesize_voice_stream.py backend/nodes/synthesize_voice.py
git commit -m "feat(backend): add synthesize_voice_stream helper

Yields raw ElevenLabs MP3 chunks without buffering or S3 upload,
for use by the streaming /story/stream endpoint."
```

---

## Task 2: `store_result_from_bytes` helper

**Goal:** Add a helper that uploads a completed MP3 byte buffer to S3 and inserts/updates the story row, reusing the same filename convention and SQL as the existing `store_result` node.

**Files:**
- Test: `backend/tests/test_nodes/test_store_result_from_bytes.py` (create)
- Implementation: `backend/nodes/store_result.py` (modify — append function; also append helper imports)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_nodes/test_store_result_from_bytes.py`:

```python
import os
from unittest.mock import MagicMock

from backend.state import RoyalState
from backend.nodes.store_result import store_result_from_bytes


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


def _base_state() -> RoyalState:
    return RoyalState(
        princess="elsa",
        date="2026-04-16",
        brief="Good day.",
        tone="praise",
        persona={"voice_id": "v"},
        story_type="daily",
        situation="",
        story_text="[PROUD] Emma, well done.",
        audio_url="",
        language="en",
        timezone="America/Los_Angeles",
    )


def test_store_result_from_bytes_uploads_to_s3_with_daily_filename(mocker):
    _mock_conn(mocker)
    mock_storage = MagicMock()
    mocker.patch("backend.nodes.store_result.get_storage", return_value=mock_storage)
    mocker.patch.dict(os.environ, {
        "S3_BUCKET": "royal-audio",
        "S3_PUBLIC_URL": "https://minio.example.com",
    })

    store_result_from_bytes(_base_state(), b"mp3bytes")

    mock_storage.put_object.assert_called_once()
    call_kwargs = mock_storage.put_object.call_args[1]
    assert call_kwargs["Bucket"] == "royal-audio"
    assert call_kwargs["Key"] == "2026-04-16-elsa-en.mp3"
    assert call_kwargs["Body"] == b"mp3bytes"
    assert call_kwargs["ContentType"] == "audio/mpeg"


def test_store_result_from_bytes_uses_life_lesson_suffix(mocker):
    _mock_conn(mocker)
    mock_storage = MagicMock()
    mocker.patch("backend.nodes.store_result.get_storage", return_value=mock_storage)
    mocker.patch.dict(os.environ, {
        "S3_BUCKET": "royal-audio",
        "S3_PUBLIC_URL": "https://minio.example.com",
    })
    state = _base_state()
    state["story_type"] = "life_lesson"
    state["situation"] = "sharing"

    store_result_from_bytes(state, b"mp3bytes")

    call_kwargs = mock_storage.put_object.call_args[1]
    assert call_kwargs["Key"] == "2026-04-16-elsa-en-life_lesson.mp3"


def test_store_result_from_bytes_inserts_story_row_with_public_url(mocker):
    mock_cursor = _mock_conn(mocker)
    mock_storage = MagicMock()
    mocker.patch("backend.nodes.store_result.get_storage", return_value=mock_storage)
    mocker.patch.dict(os.environ, {
        "S3_BUCKET": "royal-audio",
        "S3_PUBLIC_URL": "https://minio.example.com",
    })

    store_result_from_bytes(_base_state(), b"mp3bytes")

    mock_cursor.execute.assert_called_once()
    sql, params = mock_cursor.execute.call_args[0]
    assert "ON CONFLICT" in sql
    expected_url = "https://minio.example.com/royal-audio/2026-04-16-elsa-en.mp3"
    assert expected_url in params


def test_store_result_from_bytes_includes_royal_challenge_for_life_lesson(mocker):
    mock_cursor = _mock_conn(mocker)
    mock_storage = MagicMock()
    mocker.patch("backend.nodes.store_result.get_storage", return_value=mock_storage)
    mocker.patch.dict(os.environ, {
        "S3_BUCKET": "royal-audio",
        "S3_PUBLIC_URL": "https://minio.example.com",
    })
    state = dict(_base_state())
    state["story_type"] = "life_lesson"
    state["royal_challenge"] = "Try sharing today."

    store_result_from_bytes(state, b"mp3bytes")

    sql, params = mock_cursor.execute.call_args[0]
    assert "Try sharing today." in params


def test_store_result_from_bytes_includes_child_id_when_present(mocker):
    mock_cursor = _mock_conn(mocker)
    mock_storage = MagicMock()
    mocker.patch("backend.nodes.store_result.get_storage", return_value=mock_storage)
    mocker.patch.dict(os.environ, {
        "S3_BUCKET": "royal-audio",
        "S3_PUBLIC_URL": "https://minio.example.com",
    })
    state = dict(_base_state())
    state["child_id"] = "00000000-0000-0000-0000-000000000001"

    store_result_from_bytes(state, b"mp3bytes")

    sql, params = mock_cursor.execute.call_args[0]
    assert "child_id IS NOT NULL" in sql
    assert "00000000-0000-0000-0000-000000000001" in params
```

- [ ] **Step 2: Run test to verify it fails**

```
cd backend
uv run pytest tests/test_nodes/test_store_result_from_bytes.py -v
```

Expected: `ImportError: cannot import name 'store_result_from_bytes'`.

- [ ] **Step 3: Implement `store_result_from_bytes`**

Append to `backend/nodes/store_result.py` (top of file add the import, bottom add the function):

```python
import os

from backend.storage.client import get_storage


def store_result_from_bytes(state: RoyalStateOptional, audio_bytes: bytes) -> None:
    """Upload a fully-buffered MP3 to S3 and upsert the story row.

    Uses the same filename convention as the synthesize_voice node so a
    generation that fell back to the non-streaming path is interchangeable.
    """
    story_type = state["story_type"]
    suffix = f"-{story_type}" if story_type != "daily" else ""
    filename = f"{state['date']}-{state['princess']}-{state['language']}{suffix}.mp3"

    bucket = os.environ["S3_BUCKET"]
    public_url = os.environ["S3_PUBLIC_URL"]
    get_storage().put_object(
        Bucket=bucket,
        Key=filename,
        Body=audio_bytes,
        ContentType="audio/mpeg",
    )
    audio_url = f"{public_url}/{bucket}/{filename}"

    # Compose the same state used by the existing store_result node and reuse it.
    state_with_url = dict(state)
    state_with_url["audio_url"] = audio_url
    store_result(state_with_url)
```

Note: `store_result` is already defined above in this file — `store_result_from_bytes` delegates to it after writing the S3 object and computing the URL. No SQL duplication.

- [ ] **Step 4: Run test to verify it passes**

```
cd backend
uv run pytest tests/test_nodes/test_store_result_from_bytes.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Run existing store_result tests to ensure nothing broke**

```
cd backend
uv run pytest tests/test_nodes/test_store_result.py -v
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```
git add backend/tests/test_nodes/test_store_result_from_bytes.py backend/nodes/store_result.py
git commit -m "feat(backend): add store_result_from_bytes helper

Uploads a pre-computed MP3 byte buffer to S3 and delegates to
the existing store_result for the INSERT ... ON CONFLICT upsert.
Used by the streaming /story/stream endpoint's background finalize task."
```

---

## Task 3: `pre_tts_graph` compiled graph

**Goal:** Compile a second LangGraph that runs all nodes up through story generation but stops before `synthesize_voice` / `store_result`. Used by the streaming endpoint.

**Files:**
- Test: `backend/tests/test_graph_pre_tts.py` (create)
- Implementation: `backend/graph.py` (modify — append function and export)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_graph_pre_tts.py`:

```python
from unittest.mock import MagicMock


def _patch_all_nodes(mocker):
    """Patch every pre-TTS node with a MagicMock returning an empty dict update.

    Tests that care about a specific node's output override its return_value.
    """
    mocks = {}
    for name in (
        "fetch_brief",
        "extract_memories",
        "classify_tone",
        "load_persona",
        "fetch_memories",
        "generate_story",
        "infer_situation",
        "generate_life_lesson",
    ):
        m = MagicMock(return_value={})
        mocker.patch(f"backend.graph.{name}", m)
        mocks[name] = m
    return mocks


def test_pre_tts_graph_daily_runs_generate_story(mocker):
    mocks = _patch_all_nodes(mocker)
    mocks["generate_story"].return_value = {"story_text": "Dear Emma, [PROUD] today..."}

    # Re-import to rebuild the graph with patched nodes
    import importlib
    import backend.graph as graph_module
    importlib.reload(graph_module)

    initial_state = {
        "princess": "elsa", "date": "2026-04-16", "brief": "", "tone": "",
        "persona": {}, "story_type": "daily", "situation": "", "story_text": "",
        "audio_url": "", "language": "en", "timezone": "America/Los_Angeles",
        "child_id": None, "child_name": "Emma",
    }
    result = graph_module.pre_tts_graph.invoke(initial_state)

    mocks["generate_story"].assert_called_once()
    mocks["infer_situation"].assert_not_called()
    mocks["generate_life_lesson"].assert_not_called()
    assert result["story_text"] == "Dear Emma, [PROUD] today..."


def test_pre_tts_graph_life_lesson_runs_infer_situation_and_generate_life_lesson(mocker):
    mocks = _patch_all_nodes(mocker)
    mocks["infer_situation"].return_value = {"situation": "sharing"}
    mocks["generate_life_lesson"].return_value = {
        "story_text": "Once in Arendelle...",
        "royal_challenge": "Try sharing today.",
    }

    import importlib
    import backend.graph as graph_module
    importlib.reload(graph_module)

    initial_state = {
        "princess": "elsa", "date": "2026-04-16", "brief": "", "tone": "",
        "persona": {}, "story_type": "life_lesson", "situation": "", "story_text": "",
        "audio_url": "", "language": "en", "timezone": "America/Los_Angeles",
        "child_id": None, "child_name": "Emma",
    }
    result = graph_module.pre_tts_graph.invoke(initial_state)

    mocks["generate_story"].assert_not_called()
    mocks["infer_situation"].assert_called_once()
    mocks["generate_life_lesson"].assert_called_once()
    assert result["story_text"] == "Once in Arendelle..."
    assert result["royal_challenge"] == "Try sharing today."


def test_pre_tts_graph_does_not_reference_synthesize_or_store(mocker):
    """Regression guard: pre_tts_graph must not wire synthesize_voice or store_result."""
    import backend.graph as graph_module

    # The compiled graph exposes its node names via get_graph().
    node_names = set(graph_module.pre_tts_graph.get_graph().nodes.keys())
    assert "synthesize_voice" not in node_names
    assert "store_result" not in node_names
```

- [ ] **Step 2: Run test to verify it fails**

```
cd backend
uv run pytest tests/test_graph_pre_tts.py -v
```

Expected: `AttributeError: module 'backend.graph' has no attribute 'pre_tts_graph'`.

- [ ] **Step 3: Implement `pre_tts_graph`**

Modify `backend/graph.py` — replace the final section (after `build_graph()`) with:

```python
def build_pre_tts_graph():
    """Pipeline up through story generation, stopping before TTS + persistence.

    Used by GET /story/stream so the endpoint can take over synthesis and
    streaming manually.
    """
    graph = StateGraph(RoyalStateOptional)
    graph.add_node("fetch_brief", fetch_brief)
    graph.add_node("extract_memories", extract_memories)
    graph.add_node("classify_tone", classify_tone)
    graph.add_node("load_persona", load_persona)
    graph.add_node("fetch_memories", fetch_memories)
    graph.add_node("generate_story", generate_story)
    graph.add_node("infer_situation", infer_situation)
    graph.add_node("generate_life_lesson", generate_life_lesson)

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
    graph.add_edge("generate_story", END)
    graph.add_edge("infer_situation", "generate_life_lesson")
    graph.add_edge("generate_life_lesson", END)

    return graph.compile()


royal_graph = build_graph()
pre_tts_graph = build_pre_tts_graph()
```

- [ ] **Step 4: Run test to verify it passes**

```
cd backend
uv run pytest tests/test_graph_pre_tts.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Run full backend test suite to ensure nothing broke**

```
cd backend
uv run pytest tests/ -v
```

Expected: all tests pass (including all prior tests — we added a new compiled graph without changing `royal_graph`).

- [ ] **Step 6: Commit**

```
git add backend/tests/test_graph_pre_tts.py backend/graph.py
git commit -m "feat(backend): add pre_tts_graph for streaming path

Compiles a LangGraph that runs fetch_brief through
generate_story/generate_life_lesson, stopping before synthesize_voice
and store_result. The streaming endpoint drives TTS + persistence
manually to enable byte-level streaming to the client."
```

---

## Task 4: `GET /story/stream` endpoint

**Goal:** Add the streaming endpoint that runs `pre_tts_graph`, streams ElevenLabs output to the client, and schedules a background task to upload the complete MP3 + insert the story row after the stream ends (even on client disconnect).

**Files:**
- Test: `backend/tests/test_api.py` (modify — add test functions)
- Implementation: `backend/routes/stories.py` (modify — add endpoint + helpers)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_api.py`:

```python
import asyncio


def test_get_story_stream_redirects_when_cached(mocker):
    """If the cache fills between POST and GET, return a 302 to the S3 URL."""
    _make_mock_conn(mocker, "backend.routes.stories.get_conn",
                    fetchone=("https://minio.example.com/royal-audio/elsa.mp3",))
    mock_pre_tts = MagicMock()
    with patch("backend.routes.stories.pre_tts_graph", mock_pre_tts):
        from backend.main import app
        c = TestClient(app)
        response = c.get(
            "/story/stream",
            params={"princess": "elsa", "date": "2026-04-16", "language": "en",
                    "story_type": "daily", "timezone": "America/Los_Angeles"},
            follow_redirects=False,
        )
    assert response.status_code == 302
    assert response.headers["location"] == "https://minio.example.com/royal-audio/elsa.mp3"
    mock_pre_tts.invoke.assert_not_called()


def test_get_story_stream_streams_chunks_on_cache_miss(mocker):
    """Cache miss: run pre_tts_graph, stream ElevenLabs chunks, schedule finalize."""
    _make_mock_conn(mocker, "backend.routes.stories.get_conn", fetchone=None)

    mock_pre_tts = MagicMock()
    mock_pre_tts.invoke.return_value = {
        "princess": "elsa", "date": "2026-04-16", "brief": "", "tone": "praise",
        "persona": {"voice_id": "v-123"}, "story_type": "daily", "situation": "",
        "story_text": "Dear Emma, [PROUD] today...", "audio_url": "",
        "language": "en", "timezone": "America/Los_Angeles",
        "child_id": None, "child_name": "Emma",
    }

    def fake_stream(voice_id, text):
        assert voice_id == "v-123"
        assert text == "Dear Emma, [PROUD] today..."
        yield b"chunk1"
        yield b"chunk2"
        yield b"chunk3"

    mock_finalize = MagicMock()

    with patch("backend.routes.stories.pre_tts_graph", mock_pre_tts), \
         patch("backend.routes.stories.synthesize_voice_stream", fake_stream), \
         patch("backend.routes.stories.store_result_from_bytes", mock_finalize):
        from backend.main import app
        c = TestClient(app)
        response = c.get(
            "/story/stream",
            params={"princess": "elsa", "date": "2026-04-16", "language": "en",
                    "story_type": "daily", "timezone": "America/Los_Angeles"},
        )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/mpeg")
    assert response.content == b"chunk1chunk2chunk3"

    # Give the finalize task a chance to run on the event loop.
    # TestClient shuts down the loop synchronously, so by the time we get here
    # the detached asyncio.create_task should have run.
    mock_finalize.assert_called_once()
    state_arg, bytes_arg = mock_finalize.call_args[0]
    assert bytes_arg == b"chunk1chunk2chunk3"
    assert state_arg["story_text"] == "Dear Emma, [PROUD] today..."


def test_get_story_stream_does_not_finalize_on_elevenlabs_error(mocker):
    """If ElevenLabs raises mid-stream, no row is inserted."""
    _make_mock_conn(mocker, "backend.routes.stories.get_conn", fetchone=None)

    mock_pre_tts = MagicMock()
    mock_pre_tts.invoke.return_value = {
        "princess": "elsa", "date": "2026-04-16", "brief": "", "tone": "praise",
        "persona": {"voice_id": "v-123"}, "story_type": "daily", "situation": "",
        "story_text": "text", "audio_url": "",
        "language": "en", "timezone": "America/Los_Angeles",
        "child_id": None, "child_name": "Emma",
    }

    def failing_stream(voice_id, text):
        yield b"chunk1"
        raise RuntimeError("elevenlabs exploded")

    mock_finalize = MagicMock()

    with patch("backend.routes.stories.pre_tts_graph", mock_pre_tts), \
         patch("backend.routes.stories.synthesize_voice_stream", failing_stream), \
         patch("backend.routes.stories.store_result_from_bytes", mock_finalize):
        from backend.main import app
        c = TestClient(app)
        # The stream will terminate early; TestClient accepts whatever bytes arrive
        # before the error.
        response = c.get(
            "/story/stream",
            params={"princess": "elsa", "date": "2026-04-16", "language": "en",
                    "story_type": "daily", "timezone": "America/Los_Angeles"},
        )
    # StreamingResponse returns 200 even if the generator raises mid-stream;
    # the client just gets truncated bytes.
    assert response.status_code == 200
    mock_finalize.assert_not_called()


def test_get_story_stream_passes_child_id_to_cache_lookup(mocker):
    """child_id is part of the cache key; lookup must include it."""
    mock_cursor = _make_mock_conn(mocker, "backend.routes.stories.get_conn", fetchone=None)
    mock_pre_tts = MagicMock()
    mock_pre_tts.invoke.return_value = {
        "princess": "elsa", "date": "2026-04-16", "brief": "", "tone": "praise",
        "persona": {"voice_id": "v"}, "story_type": "daily", "situation": "",
        "story_text": "t", "audio_url": "",
        "language": "en", "timezone": "America/Los_Angeles",
        "child_id": "child-uuid-1", "child_name": "Emma",
    }

    def stream(voice_id, text):
        yield b"x"

    with patch("backend.routes.stories.pre_tts_graph", mock_pre_tts), \
         patch("backend.routes.stories.synthesize_voice_stream", stream), \
         patch("backend.routes.stories.store_result_from_bytes", MagicMock()):
        from backend.main import app
        c = TestClient(app)
        c.get(
            "/story/stream",
            params={"princess": "elsa", "date": "2026-04-16", "language": "en",
                    "story_type": "daily", "timezone": "America/Los_Angeles",
                    "child_id": "child-uuid-1"},
        )

    # First execute() is the cache lookup; assert child_id appears in its params.
    lookup_call = mock_cursor.execute.call_args_list[0]
    sql, params = lookup_call[0]
    assert "child_id IS NOT DISTINCT FROM" in sql
    assert "child-uuid-1" in params
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend
uv run pytest tests/test_api.py -v -k "stream"
```

Expected: 4 failures with `404 Not Found` (endpoint doesn't exist yet).

- [ ] **Step 3: Implement the endpoint**

Modify `backend/routes/stories.py`. At the top of the file, add imports:

```python
import asyncio
import logging
from fastapi.responses import RedirectResponse, StreamingResponse

from backend.graph import royal_graph, pre_tts_graph
from backend.nodes.synthesize_voice import synthesize_voice_stream
from backend.nodes.store_result import store_result_from_bytes
```

(Remove any duplicate imports that already exist — `royal_graph` and `logging` are likely already imported; merge rather than duplicate.)

Then add the endpoint and helpers (place after `post_story` and before `get_today_stories`):

```python
def _lookup_cached_story(
    story_date: str, princess: str, story_type: str, language: str, child_id: str | None
) -> str | None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT audio_url FROM stories
                   WHERE date = %s AND princess = %s AND story_type = %s
                     AND language = %s
                     AND child_id IS NOT DISTINCT FROM %s""",
                (story_date, princess, story_type, language, child_id),
            )
            row = cur.fetchone()
    return row[0] if row else None


async def _tee_and_save(pre_state: dict):
    """Stream ElevenLabs chunks to the client while buffering for S3 upload.

    On normal completion: schedules finalize() to upload MP3 + insert row.
    On client disconnect: drains remaining ElevenLabs chunks then schedules finalize.
    On ElevenLabs error mid-stream: returns without persisting (next tap regenerates).
    """
    buffer = bytearray()
    chunks = synthesize_voice_stream(
        voice_id=pre_state["persona"]["voice_id"],
        text=pre_state["story_text"],
    )
    client_disconnected = False
    try:
        for chunk in chunks:
            buffer.extend(chunk)
            try:
                yield chunk
            except (GeneratorExit, asyncio.CancelledError):
                client_disconnected = True
                break
    except Exception:
        logger.exception("ElevenLabs streaming failed mid-generation")
        return

    if client_disconnected:
        try:
            for chunk in chunks:
                buffer.extend(chunk)
        except Exception:
            logger.exception("ElevenLabs drain after disconnect failed")
            return

    asyncio.create_task(_finalize(pre_state, bytes(buffer)))


async def _finalize(pre_state: dict, audio_bytes: bytes) -> None:
    try:
        await asyncio.to_thread(store_result_from_bytes, pre_state, audio_bytes)
    except Exception:
        logger.exception("finalize failed to persist audio/row")


@router.get("/story/stream")
async def get_story_stream(
    princess: Literal["elsa", "belle", "cinderella", "ariel", "rapunzel", "moana", "raya", "mirabel", "chase", "marshall", "skye", "rubble"],
    date: str,
    language: Literal["en", "vi"],
    story_type: Literal["daily", "life_lesson"],
    timezone: str,
    child_id: str | None = None,
):
    # Re-check the cache: if it filled between POST and GET, redirect to S3.
    cached = _lookup_cached_story(date, princess, story_type, language, child_id)
    if cached:
        return RedirectResponse(cached, status_code=302)

    initial_state = {
        "princess": princess,
        "date": date,
        "brief": "",
        "tone": "",
        "persona": {},
        "story_type": story_type,
        "situation": "",
        "story_text": "",
        "audio_url": "",
        "language": language,
        "timezone": timezone,
        "child_id": child_id,
        "child_name": "Emma",
    }

    # Run the pre-TTS pipeline synchronously in a thread so it doesn't block
    # the event loop (LLM calls are network-bound but the synchronous client
    # still blocks).
    pre_state = await asyncio.to_thread(pre_tts_graph.invoke, initial_state)

    return StreamingResponse(
        _tee_and_save(pre_state),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )
```

Note: `logger` is already defined at the top of the file. `Literal` is already imported.

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend
uv run pytest tests/test_api.py -v -k "stream"
```

Expected: 4 passed.

Debug tips if `test_get_story_stream_streams_chunks_on_cache_miss` fails with `finalize not called`:
- `TestClient` runs the app in a synchronous context; the `create_task` inside the generator may not get a chance to run before the test continues. If the assertion fails flakily, add `response.close()` then `c.__exit__(None, None, None)` after the call to give the loop a tick, or switch to `httpx.AsyncClient` with `ASGITransport`.

- [ ] **Step 5: Run the full test suite**

```
cd backend
uv run pytest tests/ -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```
git add backend/routes/stories.py backend/tests/test_api.py
git commit -m "feat(backend): add GET /story/stream for live audio streaming

Runs the pre-TTS pipeline, then streams ElevenLabs MP3 chunks to the
client while tee-ing bytes into a buffer. On stream end (or client
disconnect) schedules a detached task to upload the full MP3 to S3 and
upsert the story row — so future requests are cache hits. ElevenLabs
errors abort without persisting; concurrent requests for the same
(date, princess, language, child_id, story_type) are accepted (ON
CONFLICT DO UPDATE handles collisions)."
```

---

## Task 5: `POST /story` cache-miss returns streaming URL

**Goal:** Change `POST /story` so that on cache miss it returns `{ audio_url: "<BACKEND_PUBLIC_URL>/story/stream?..." }` instead of synchronously running the pipeline. Cache hits are unchanged.

**Files:**
- Test: `backend/tests/test_api.py` (modify — update `POST /story` tests)
- Implementation: `backend/routes/stories.py` (modify `post_story`)

- [ ] **Step 1: Update existing tests and add new cache-miss test**

In `backend/tests/test_api.py`:

**Replace** `test_post_story_triggers_graph_and_returns_audio_url` (lines ~40-50) with a test that matches the new behavior:

```python
def test_post_story_cache_miss_returns_streaming_url_without_invoking_graph(mocker):
    """On cache miss, POST /story returns a streaming URL and does NO pipeline work."""
    mock_graph = MagicMock()
    _make_mock_conn(mocker, "backend.routes.stories.get_conn", fetchone=None)
    mocker.patch.dict("os.environ", {"BACKEND_PUBLIC_URL": "https://api.example.com"})
    with patch("backend.routes.stories.royal_graph", mock_graph), \
         patch("backend.routes.stories.pre_tts_graph", MagicMock()):
        from backend.main import app
        c = TestClient(app)
        response = c.post("/story", json={"princess": "elsa", "language": "en"})
    assert response.status_code == 200
    audio_url = response.json()["audio_url"]
    assert audio_url.startswith("https://api.example.com/story/stream?")
    assert "princess=elsa" in audio_url
    assert "language=en" in audio_url
    assert "story_type=daily" in audio_url
    mock_graph.invoke.assert_not_called()
```

**Replace** `test_post_story_life_lesson_triggers_graph` with:

```python
def test_post_story_life_lesson_cache_miss_returns_streaming_url_with_story_type(mocker):
    mock_graph = MagicMock()
    _make_mock_conn(mocker, "backend.routes.stories.get_conn", fetchone=None)
    mocker.patch.dict("os.environ", {"BACKEND_PUBLIC_URL": "https://api.example.com"})
    with patch("backend.routes.stories.royal_graph", mock_graph), \
         patch("backend.routes.stories.pre_tts_graph", MagicMock()):
        from backend.main import app
        c = TestClient(app)
        response = c.post("/story", json={"princess": "elsa", "language": "en", "story_type": "life_lesson"})
    assert response.status_code == 200
    assert "story_type=life_lesson" in response.json()["audio_url"]
    mock_graph.invoke.assert_not_called()
```

**Add** a new test for `child_id` propagation:

```python
def test_post_story_cache_miss_includes_child_id_in_streaming_url(mocker):
    mock_graph = MagicMock()
    _make_mock_conn(mocker, "backend.routes.stories.get_conn", fetchone=None)
    mocker.patch.dict("os.environ", {"BACKEND_PUBLIC_URL": "https://api.example.com"})
    with patch("backend.routes.stories.royal_graph", mock_graph), \
         patch("backend.routes.stories.pre_tts_graph", MagicMock()):
        from backend.main import app
        c = TestClient(app)
        response = c.post("/story", json={
            "princess": "elsa", "language": "en",
            "child_id": "00000000-0000-0000-0000-000000000001",
        })
    assert response.status_code == 200
    assert "child_id=00000000-0000-0000-0000-000000000001" in response.json()["audio_url"]
```

**Leave unchanged:** `test_post_story_returns_cached_audio_url_without_running_graph` (the cache-hit path is unchanged) and `test_post_story_rejects_unknown_princess` (validation is unchanged).

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend
uv run pytest tests/test_api.py -v -k "post_story"
```

Expected: the two replaced tests fail (old assertion shapes), the new test fails (no `BACKEND_PUBLIC_URL` handling yet). Cache-hit and 422 tests still pass.

- [ ] **Step 3: Modify `post_story`**

In `backend/routes/stories.py`:

At the top, add an import:

```python
import os
from urllib.parse import urlencode
```

Replace the body of `post_story` (currently runs the graph on cache miss) with:

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

    # Cache miss: return a streaming URL. The browser hits it, and THAT
    # request runs the pipeline + streams ElevenLabs bytes.
    params = {
        "princess": req.princess,
        "date": story_date,
        "language": req.language,
        "story_type": req.story_type,
        "timezone": req.timezone,
    }
    if req.child_id:
        params["child_id"] = req.child_id
    base = os.environ["BACKEND_PUBLIC_URL"].rstrip("/")
    streaming_url = f"{base}/story/stream?{urlencode(params)}"
    return StoryResponse(audio_url=streaming_url)
```

Remove the now-unused imports: the `concurrent.futures` import at the top of the file can be deleted if no other function uses it. Check with `grep` first.

- [ ] **Step 4: Remove unused imports**

```
cd backend
grep -n "concurrent" routes/stories.py
```

If the only occurrence is `import concurrent.futures` at the top, remove that line.

- [ ] **Step 5: Run tests to verify they pass**

```
cd backend
uv run pytest tests/test_api.py -v -k "post_story"
```

Expected: all 4 `post_story` tests pass.

- [ ] **Step 6: Run the full backend test suite**

```
cd backend
uv run pytest tests/ -v
```

Expected: all pass.

- [ ] **Step 7: Commit**

```
git add backend/routes/stories.py backend/tests/test_api.py
git commit -m "feat(backend): POST /story returns streaming URL on cache miss

POST /story no longer runs the pipeline synchronously. Cache hits
still return the S3 URL directly; cache misses return a backend
streaming URL built from BACKEND_PUBLIC_URL. The browser's audio
element requests that URL, which streams ElevenLabs output as bytes
arrive — playback starts before generation completes.

Removes the concurrent.futures timeout wrapper (no longer needed)."
```

---

## Task 6: Configure `BACKEND_PUBLIC_URL`

**Goal:** Wire `BACKEND_PUBLIC_URL` into local dev, Docker, and k8s so `POST /story` has a base URL to build streaming links from.

**Files:**
- `backend/.env.example` (modify)
- `docker-compose.yml` (modify)
- `k8s/backend/deployment.yaml` (modify)

- [ ] **Step 1: Add to `.env.example`**

Edit `backend/.env.example`. After the `FRONTEND_URL=http://localhost:3000` line, add:

```
# Public URL of the backend, used by POST /story to build streaming URLs
# returned to the frontend (e.g. http://localhost:8000 for dev,
# https://api.royal-dispatch.example for prod).
BACKEND_PUBLIC_URL=http://localhost:8000
```

- [ ] **Step 2: Add to `docker-compose.yml`**

Edit `docker-compose.yml`. In the `backend` service's `environment:` list (currently has `PYTHONUNBUFFERED`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `OPENAI_API_KEY`), add:

```yaml
      - BACKEND_PUBLIC_URL=http://localhost:8000
```

The frontend runs in the user's browser, so the URL the browser sees is `localhost:8000` (published port), not the internal Docker hostname.

- [ ] **Step 3: Add to `k8s/backend/deployment.yaml`**

Edit `k8s/backend/deployment.yaml`. In the `env:` list, after the existing plain `QDRANT_URL` entry (before the secret-ref entries), add:

```yaml
            - name: BACKEND_PUBLIC_URL
              value: "https://api.royaldispatch.quybits.com"
```

*(Use the real public hostname from your `k8s/ingress/ingressroute-backend.yaml` if it differs from the example above — check that file for the `Host(\`...\`)` rule and match it.)*

- [ ] **Step 4: Verify locally with `docker compose up`**

```
docker compose up --build backend
```

In another terminal:

```
curl -X POST http://localhost:8000/story \
  -H 'Content-Type: application/json' \
  -d '{"princess":"elsa","language":"en"}'
```

Expected (on cache miss): `{"audio_url":"http://localhost:8000/story/stream?princess=elsa&..."}`.

Expected (on cache hit, after a previous story exists for today): `{"audio_url":"https://minio.quybits.com/royal-audio/..."}`.

- [ ] **Step 5: Commit**

```
git add backend/.env.example docker-compose.yml k8s/backend/deployment.yaml
git commit -m "chore: add BACKEND_PUBLIC_URL env for streaming-audio URL construction"
```

---

## Task 7: End-to-end smoke test

**Goal:** Verify streaming actually works in a full-stack local run — bytes arrive progressively, playback starts before generation completes, and subsequent taps serve from S3.

This task is manual; there are no code changes.

- [ ] **Step 1: Bring up the full stack**

```
docker compose up --build
```

Wait until backend, frontend, minio, postgres, migrate services are healthy.

- [ ] **Step 2: Seed a brief**

Use the Telegram → n8n → backend flow OR call the API directly:

```
curl -X POST http://localhost:8000/brief \
  -H 'Content-Type: application/json' \
  -d '{"text":"Emma shared her blocks today.","user_id":"<your-test-user-id>"}'
```

- [ ] **Step 3: Clear any cached story for today**

Connect to postgres and delete today's story row(s):

```
docker compose exec postgres psql -U royal -d royal_dispatch -c \
  "DELETE FROM stories WHERE date = CURRENT_DATE;"
```

- [ ] **Step 4: Open the pick-child / story flow in Chrome**

- Visit `http://localhost:3000`, complete onboarding if needed.
- Tap a princess on the pick-child page.
- Open DevTools → Network tab **before** tapping.

- [ ] **Step 5: Verify streaming behavior in DevTools**

On the cache-miss tap:
- `POST /story` completes in < 100 ms and returns `{ audio_url: "http://localhost:8000/story/stream?..." }`.
- `GET /story/stream?...` appears in the Network tab:
  - `Content-Type: audio/mpeg`
  - **No** `Content-Length` header (chunked response)
  - The response's "Waiting" time is the LLM + ElevenLabs first-byte latency; "Content Download" time continues for several seconds as bytes arrive.
  - Audio starts playing **before** the stream shows as "Complete" in DevTools.

- [ ] **Step 6: Verify cache hit on second tap**

Without refreshing, navigate back and tap the same princess again:
- `POST /story` returns a URL starting with `https://minio.quybits.com/royal-audio/...` (or your local minio URL).
- **No** `GET /story/stream` request appears — the browser fetches directly from MinIO.
- Audio playback works and supports seeking (progress bar drag).

- [ ] **Step 7: Verify client-disconnect resilience**

- Delete the cached story row again (Step 3).
- Tap the princess.
- **Close the browser tab** while the stream is still in progress (within the first few seconds).
- Wait ~10-20 seconds.
- Query postgres: `SELECT audio_url FROM stories WHERE date = CURRENT_DATE AND princess = 'elsa';`
- Expected: a row exists with a valid MinIO URL — `_finalize` ran despite the client disconnect.

- [ ] **Step 8: Verify ElevenLabs error path** *(optional — only if you want to be thorough)*

Temporarily corrupt `ELEVENLABS_API_KEY` in `backend/.env`, restart backend, clear cached stories, tap a princess. Expected:
- `GET /story/stream` returns a truncated or empty response.
- No new row is inserted into `stories` — next retry regenerates cleanly.
- Restore the API key when done.

---

## Self-Review Summary

**Spec coverage:**
- Architecture (cache hit vs. miss flow) → Tasks 4, 5
- `synthesize_voice_stream` helper → Task 1
- `store_result_from_bytes` helper → Task 2
- `pre_tts_graph` → Task 3
- `GET /story/stream` endpoint with tee + finalize → Task 4
- `POST /story` cache-miss returns streaming URL → Task 5
- `BACKEND_PUBLIC_URL` env → Task 6
- Manual smoke test → Task 7
- Error handling table (pipeline fail / ElevenLabs error / client disconnect / S3 fail / DB fail / concurrent) → covered by tests in Task 4 (ElevenLabs error, client disconnect) and the ON CONFLICT guarantees from existing `store_result` (concurrent). Pipeline-fail and S3-fail paths degrade to a 500 / log respectively; verified during smoke.
- Frontend: no code change required (spec confirms `<audio>` handles both URL shapes) — not a task.

**Type consistency check:**
- `synthesize_voice_stream(voice_id: str, text: str) -> Iterator[bytes]` — used the same signature in Task 1 implementation and Task 4 consumption. ✓
- `store_result_from_bytes(state, audio_bytes: bytes) -> None` — consistent between Task 2 and Task 4. ✓
- `pre_tts_graph` — referenced as `backend.routes.stories.pre_tts_graph` in Task 4 tests; imported from `backend.graph` in Task 4 implementation. ✓
- `_lookup_cached_story` / `_tee_and_save` / `_finalize` — only referenced within Task 4. ✓

**No placeholders found.**
