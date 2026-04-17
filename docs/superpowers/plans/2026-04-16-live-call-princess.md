# Live Call with Princess — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable children to have real-time voice conversations with princess characters, using Gemma 4 E2B in-browser for speech understanding and ElevenLabs streaming TTS for princess voice output.

**Architecture:** Gemma 4 E2B runs client-side via WebGPU (Transformers.js v4) — processes child's audio input and generates text responses. Backend provides two endpoints: `/call/start` (fetch persona + memories) and `/call/end` (extract memories from transcript), plus `/call/tts` to proxy ElevenLabs TTS streaming. Frontend manages the call lifecycle via a turn-taking state machine.

**Tech Stack:** Gemma 4 E2B (WebGPU), Transformers.js v4, ElevenLabs TTS streaming API, FastAPI, PostgreSQL, Mem0/Qdrant, Next.js 16, React 19, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-16-live-call-princess-design.md`

---

## File Structure

### Backend (new files)

| File | Responsibility |
|---|---|
| `backend/routes/call.py` | Three endpoints: `GET /call/start`, `POST /call/tts`, `POST /call/end` |
| `backend/db/migrations/006_create_calls.up.sql` | Create `calls` table |
| `backend/db/migrations/006_create_calls.down.sql` | Drop `calls` table |
| `backend/tests/test_call_routes.py` | Tests for all three call endpoints |

### Backend (modified files)

| File | Change |
|---|---|
| `backend/main.py` | Register `call_router` |

### Frontend (new files)

| File | Responsibility |
|---|---|
| `frontend/lib/call-engine.ts` | Turn-taking state machine, timer, orchestration |
| `frontend/lib/elevenlabs-tts.ts` | Streaming TTS client via backend proxy |
| `frontend/lib/gemma.ts` | Gemma E2B model loader + inference wrapper |
| `frontend/lib/call-api.ts` | API functions for `/call/start`, `/call/end` |
| `frontend/components/CallScreen.tsx` | Full-screen call UI with state animations |
| `frontend/components/ModelLoader.tsx` | Download progress bar + cache check |
| `frontend/app/[locale]/(play)/call/page.tsx` | Contacts page (princess list) |
| `frontend/app/[locale]/(play)/call/[princess]/page.tsx` | Active call page |

### Frontend (modified files)

| File | Change |
|---|---|
| `frontend/components/BottomNav.tsx` | Add "Call" tab (conditionally, if WebGPU supported) |

---

## Task 1: Database Migration — `calls` Table

**Files:**
- Create: `backend/db/migrations/006_create_calls.up.sql`
- Create: `backend/db/migrations/006_create_calls.down.sql`

- [ ] **Step 1: Write the up migration**

```sql
-- backend/db/migrations/006_create_calls.up.sql
CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID REFERENCES children(id) ON DELETE CASCADE,
    princess TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    duration_seconds INT,
    turn_count INT,
    transcript JSONB
);

CREATE INDEX idx_calls_child_id ON calls(child_id);
```

- [ ] **Step 2: Write the down migration**

```sql
-- backend/db/migrations/006_create_calls.down.sql
DROP TABLE IF EXISTS calls;
```

- [ ] **Step 3: Commit**

```bash
git add backend/db/migrations/006_create_calls.up.sql backend/db/migrations/006_create_calls.down.sql
git commit -m "feat(db): add calls table migration (006)"
```

---

## Task 2: Backend — `GET /call/start` Endpoint

**Files:**
- Create: `backend/routes/call.py`
- Modify: `backend/main.py`
- Create: `backend/tests/test_call_routes.py`

- [ ] **Step 1: Write the failing test for `/call/start`**

Create `backend/tests/test_call_routes.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock


def _make_mock_conn(mocker, module_path, fetchone=None):
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
    return mock_cursor


@pytest.fixture
def client(mocker):
    from backend.main import app
    return TestClient(app)


def test_call_start_returns_persona_and_memories(client, mocker):
    """GET /call/start returns persona fields, memories, child_name, session_id, and timer."""
    mocker.patch(
        "backend.routes.call.fetch_memories",
        return_value={"memories": "- Loves ice castles\n- Got a gold star"},
    )
    _make_mock_conn(
        mocker,
        "backend.routes.call.get_conn",
        fetchone=("Emma",),
    )
    response = client.get("/call/start?child_id=abc-123&princess=elsa")
    assert response.status_code == 200
    data = response.json()
    assert data["persona"]["name"] == "Queen Elsa"
    assert data["persona"]["voice_id"] == "3NCpLcGW5vNnR78Ytkew"
    assert data["persona"]["origin"] == "Kingdom of Arendelle"
    assert data["persona"]["tone_style"] == "calm, majestic, warmly proud"
    assert "signature_phrase" in data["persona"]
    assert data["memories"] == "- Loves ice castles\n- Got a gold star"
    assert data["child_name"] == "Emma"
    assert "session_id" in data
    assert data["timer_seconds"] == 420


def test_call_start_unknown_princess_returns_404(client, mocker):
    _make_mock_conn(mocker, "backend.routes.call.get_conn", fetchone=("Emma",))
    response = client.get("/call/start?child_id=abc-123&princess=unknown")
    assert response.status_code == 404


def test_call_start_missing_child_returns_422(client):
    response = client.get("/call/start?princess=elsa")
    assert response.status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && uv run pytest tests/test_call_routes.py -v -k "test_call_start"
```

Expected: FAIL (routes/call.py does not exist yet)

- [ ] **Step 3: Create the call router**

Create `backend/routes/call.py`:

```python
import logging
import uuid

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.db.client import get_conn
from backend.nodes.fetch_memories import fetch_memories
from backend.nodes.load_persona import load_persona, PERSONAS_DIR

logger = logging.getLogger(__name__)

router = APIRouter()

TIMER_SECONDS = 420  # 7 minutes


class CallStartResponse(BaseModel):
    persona: dict
    memories: str
    child_name: str
    session_id: str
    timer_seconds: int


@router.get("/call/start", response_model=CallStartResponse)
def call_start(
    child_id: str = Query(...),
    princess: str = Query(...),
):
    # Load persona
    try:
        result = load_persona({"princess": princess})
        persona = result["persona"]
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Unknown princess: {princess}")

    # Fetch child name from DB
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM children WHERE id = %s", (child_id,))
            row = cur.fetchone()
    child_name = row[0] if row else "Friend"

    # Fetch memories
    mem_result = fetch_memories({"child_id": child_id, "brief": "__fallback__"})
    memories = mem_result.get("memories", "")

    return CallStartResponse(
        persona={
            "name": persona["name"],
            "voice_id": persona["voice_id"],
            "tone_style": persona["tone_style"],
            "signature_phrase": persona["signature_phrase"],
            "origin": persona["origin"],
        },
        memories=memories,
        child_name=child_name,
        session_id=str(uuid.uuid4()),
        timer_seconds=TIMER_SECONDS,
    )
```

- [ ] **Step 4: Register the router in main.py**

Add to `backend/main.py`:

```python
from backend.routes.call import router as call_router
```

And:

```python
app.include_router(call_router)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && uv run pytest tests/test_call_routes.py -v -k "test_call_start"
```

Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routes/call.py backend/main.py backend/tests/test_call_routes.py
git commit -m "feat(backend): add GET /call/start endpoint with persona + memories"
```

---

## Task 3: Backend — `POST /call/tts` Endpoint (ElevenLabs Proxy)

**Files:**
- Modify: `backend/routes/call.py`
- Modify: `backend/tests/test_call_routes.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_call_routes.py`:

```python
def test_call_tts_streams_audio(client, mocker):
    """POST /call/tts returns streaming audio from ElevenLabs."""
    mock_stream = mocker.patch(
        "backend.routes.call.synthesize_voice_stream",
        return_value=iter([b"chunk1", b"chunk2"]),
    )
    response = client.post(
        "/call/tts",
        json={"text": "Hello dear!", "voice_id": "3NCpLcGW5vNnR78Ytkew"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == b"chunk1chunk2"
    mock_stream.assert_called_once_with("3NCpLcGW5vNnR78Ytkew", "Hello dear!")


def test_call_tts_missing_text_returns_422(client):
    response = client.post("/call/tts", json={"voice_id": "abc"})
    assert response.status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && uv run pytest tests/test_call_routes.py -v -k "test_call_tts"
```

Expected: FAIL

- [ ] **Step 3: Implement the TTS proxy endpoint**

Add to `backend/routes/call.py`:

```python
from fastapi.responses import StreamingResponse
from backend.nodes.synthesize_voice import synthesize_voice_stream


class TtsRequest(BaseModel):
    text: str
    voice_id: str


@router.post("/call/tts")
def call_tts(req: TtsRequest):
    chunks = synthesize_voice_stream(req.voice_id, req.text)
    return StreamingResponse(chunks, media_type="audio/mpeg")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && uv run pytest tests/test_call_routes.py -v -k "test_call_tts"
```

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routes/call.py backend/tests/test_call_routes.py
git commit -m "feat(backend): add POST /call/tts streaming proxy for ElevenLabs"
```

---

## Task 4: Backend — `POST /call/end` Endpoint

**Files:**
- Modify: `backend/routes/call.py`
- Modify: `backend/tests/test_call_routes.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_call_routes.py`:

```python
def test_call_end_stores_record_and_extracts_memories(client, mocker):
    """POST /call/end saves a call record and runs memory extraction."""
    mock_cursor = _make_mock_conn(mocker, "backend.routes.call.get_conn")
    mock_extract = mocker.patch("backend.routes.call.extract_memories_from_transcript")

    transcript = [
        {"role": "child", "text": "I got a gold star today!"},
        {"role": "princess", "text": "How wonderful! Tell me more."},
    ]
    response = client.post("/call/end", json={
        "session_id": "sess-123",
        "child_id": "child-456",
        "princess": "elsa",
        "duration_seconds": 300,
        "transcript": transcript,
    })
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    # Verify DB insert was called
    mock_cursor.execute.assert_called_once()
    sql = mock_cursor.execute.call_args[0][0]
    assert "INSERT INTO calls" in sql

    # Verify memory extraction was called with joined transcript
    mock_extract.assert_called_once_with("child-456", transcript)


def test_call_end_missing_fields_returns_422(client):
    response = client.post("/call/end", json={"session_id": "x"})
    assert response.status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && uv run pytest tests/test_call_routes.py -v -k "test_call_end"
```

Expected: FAIL

- [ ] **Step 3: Implement the endpoint**

Add to `backend/routes/call.py`:

```python
import json as json_lib
from backend.utils.mem0_client import get_memory


class CallEndRequest(BaseModel):
    session_id: str
    child_id: str
    princess: str
    duration_seconds: int
    transcript: list[dict]


def extract_memories_from_transcript(child_id: str, transcript: list[dict]) -> None:
    """Extract memorable facts from a call transcript and store via mem0."""
    if not child_id or not transcript:
        return
    try:
        memory = get_memory()
        # Join child's statements for memory extraction
        child_text = " ".join(
            turn["text"] for turn in transcript if turn.get("role") == "child"
        )
        if not child_text.strip():
            return
        extraction_prompt = (
            "Extract only facts worth remembering long-term about this child: "
            "their preferences (favorite toys, colors, foods, characters), "
            "social patterns (friendships, sibling dynamics, social wins/struggles), "
            "habits (recurring behaviors they are working on), "
            "and milestones (significant achievements or life events). "
            "Ignore transient details that are not reusable in future conversations."
        )
        memory.add(
            [
                {"role": "system", "content": extraction_prompt},
                {"role": "user", "content": child_text},
            ],
            user_id=child_id,
        )
    except Exception:
        logger.warning(
            "extract_memories_from_transcript: mem0 unavailable, skipping",
            exc_info=True,
        )


@router.post("/call/end")
def call_end(req: CallEndRequest):
    # Store call record
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO calls (id, child_id, princess, duration_seconds, turn_count, transcript)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (
                    req.session_id,
                    req.child_id,
                    req.princess,
                    req.duration_seconds,
                    len(req.transcript),
                    json_lib.dumps(req.transcript),
                ),
            )

    # Extract memories in background (best-effort)
    extract_memories_from_transcript(req.child_id, req.transcript)

    return {"status": "ok"}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && uv run pytest tests/test_call_routes.py -v -k "test_call_end"
```

Expected: 2 tests PASS

- [ ] **Step 5: Run all call route tests together**

```bash
cd backend && uv run pytest tests/test_call_routes.py -v
```

Expected: All 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routes/call.py backend/tests/test_call_routes.py
git commit -m "feat(backend): add POST /call/end with memory extraction and call record"
```

---

## Task 5: Frontend — Call API Client

**Files:**
- Create: `frontend/lib/call-api.ts`

- [ ] **Step 1: Create the call API module**

```typescript
// frontend/lib/call-api.ts
import type { Princess } from './api';

const API_URL = typeof window === 'undefined' ? 'http://localhost:3000/api' : '/api';

export interface CallStartData {
  persona: {
    name: string;
    voice_id: string;
    tone_style: string;
    signature_phrase: string;
    origin: string;
  };
  memories: string;
  child_name: string;
  session_id: string;
  timer_seconds: number;
}

export interface TranscriptTurn {
  role: 'child' | 'princess';
  text: string;
}

export async function startCall(
  childId: string,
  princess: Princess,
): Promise<CallStartData> {
  const params = new URLSearchParams({ child_id: childId, princess });
  const res = await fetch(`${API_URL}/call/start?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`call/start failed: ${res.status}`);
  return res.json();
}

export async function streamTts(
  text: string,
  voiceId: string,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${API_URL}/call/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`call/tts failed: ${res.status}`);
  if (!res.body) throw new Error('No response body for TTS stream');
  return res.body;
}

export async function endCall(
  sessionId: string,
  childId: string,
  princess: Princess,
  durationSeconds: number,
  transcript: TranscriptTurn[],
): Promise<void> {
  await fetch(`${API_URL}/call/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      child_id: childId,
      princess,
      duration_seconds: durationSeconds,
      transcript,
    }),
    signal: AbortSignal.timeout(10_000),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/call-api.ts
git commit -m "feat(frontend): add call API client (start, tts, end)"
```

---

## Task 6: Frontend — ElevenLabs TTS Streaming Playback

**Files:**
- Create: `frontend/lib/elevenlabs-tts.ts`

- [ ] **Step 1: Create the streaming TTS playback module**

```typescript
// frontend/lib/elevenlabs-tts.ts
import { streamTts } from './call-api';

/**
 * Streams TTS audio from the backend proxy and plays it via AudioContext.
 * Returns a promise that resolves when playback completes.
 */
export async function playTtsStream(
  text: string,
  voiceId: string,
  audioContext: AudioContext,
): Promise<void> {
  const stream = await streamTts(text, voiceId);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  // Collect all chunks (ElevenLabs streams are small for 2-4 sentences)
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine into a single buffer
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  // Decode and play
  const audioBuffer = await audioContext.decodeAudioData(combined.buffer);
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);

  return new Promise<void>((resolve) => {
    source.onended = () => resolve();
    source.start(0);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/elevenlabs-tts.ts
git commit -m "feat(frontend): add ElevenLabs TTS streaming playback via AudioContext"
```

---

## Task 7: Frontend — Gemma E2B Model Wrapper

**Files:**
- Create: `frontend/lib/gemma.ts`

**Note:** This task requires installing `@huggingface/transformers` first. The Gemma audio input API through Transformers.js is new — check `node_modules/@huggingface/transformers/` docs after install for the exact audio pipeline API. The code below represents the target interface; the exact Transformers.js API calls may need adjustment based on the library version.

- [ ] **Step 1: Install Transformers.js**

```bash
cd frontend && npm install @huggingface/transformers
```

- [ ] **Step 2: Create the Gemma wrapper module**

```typescript
// frontend/lib/gemma.ts

// NOTE: Transformers.js v4 API for Gemma audio input is evolving.
// After installing, check node_modules/@huggingface/transformers/ for the
// exact pipeline and model class names. The interface below is stable;
// internals may need adjustment.

const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';

export interface GemmaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

let pipeline: any = null;
let loadingPromise: Promise<void> | null = null;

export type ProgressCallback = (progress: {
  status: string;
  loaded?: number;
  total?: number;
  progress?: number;
}) => void;

/**
 * Check if WebGPU is available on this device.
 */
export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Check if the model is already cached in the browser.
 */
export async function isModelCached(): Promise<boolean> {
  try {
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    return keys.some((req) => req.url.includes('gemma'));
  } catch {
    return false;
  }
}

/**
 * Load the Gemma E2B model. Calls onProgress during download.
 * Subsequent calls return immediately if already loaded.
 */
export async function loadModel(onProgress?: ProgressCallback): Promise<void> {
  if (pipeline) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const { pipeline: createPipeline } = await import('@huggingface/transformers');
    pipeline = await createPipeline('text-generation', MODEL_ID, {
      device: 'webgpu',
      progress_callback: onProgress,
    });
  })();

  await loadingPromise;
}

/**
 * Generate a text response given a conversation history.
 * Messages should include system prompt, then alternating user/assistant turns.
 */
export async function generate(messages: GemmaMessage[]): Promise<string> {
  if (!pipeline) throw new Error('Model not loaded. Call loadModel() first.');

  // Format messages into Gemma chat template
  const prompt = messages
    .map((m) => {
      if (m.role === 'system') return `<start_of_turn>user\n${m.content}<end_of_turn>`;
      if (m.role === 'user') return `<start_of_turn>user\n${m.content}<end_of_turn>`;
      return `<start_of_turn>model\n${m.content}<end_of_turn>`;
    })
    .join('\n') + '\n<start_of_turn>model\n';

  const output = await pipeline(prompt, {
    max_new_tokens: 200,
    temperature: 0.7,
    do_sample: true,
  });

  // Extract generated text after the prompt
  const fullText = output[0].generated_text;
  const response = fullText.slice(prompt.length).replace(/<end_of_turn>/g, '').trim();
  return response;
}

/**
 * Process audio input and generate a text response.
 * audioData: Float32Array of audio samples (16kHz mono).
 * context: current conversation messages for context.
 */
export async function processAudio(
  audioData: Float32Array,
  context: GemmaMessage[],
): Promise<string> {
  if (!pipeline) throw new Error('Model not loaded. Call loadModel() first.');

  // TODO: Replace with actual Transformers.js audio input API once confirmed.
  // The Gemma 4 E2B ONNX model supports audio input natively.
  // For now, this is a placeholder that uses text-based generation.
  // After installing @huggingface/transformers, check the docs for:
  //   - AutoProcessor for audio preprocessing
  //   - Audio input format for the pipeline
  //
  // Interim approach: use Web Speech API for STT, then pass text to generate().
  // This will be replaced when Transformers.js audio pipeline is confirmed working.

  throw new Error(
    'Audio input via Transformers.js not yet wired. ' +
    'Use transcribeAndGenerate() from call-engine.ts as interim.'
  );
}

/**
 * Free model resources.
 */
export async function unloadModel(): Promise<void> {
  if (pipeline) {
    await pipeline.dispose?.();
    pipeline = null;
    loadingPromise = null;
  }
}
```

**Important note for the implementing engineer:** The `processAudio` function is a placeholder. Gemma 4 E2B supports native audio input, but the Transformers.js ONNX integration for audio may not be fully available yet. The call engine (Task 8) uses a fallback: Web Speech API for STT → `generate()` for text response. When the Transformers.js audio pipeline is confirmed working in-browser, replace `processAudio` and remove the Web Speech API fallback.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/gemma.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): add Gemma E2B model wrapper with WebGPU loader"
```

---

## Task 8: Frontend — Call Engine (State Machine + Orchestration)

**Files:**
- Create: `frontend/lib/call-engine.ts`

- [ ] **Step 1: Create the call engine module**

```typescript
// frontend/lib/call-engine.ts
import { generate, loadModel, unloadModel, isWebGPUSupported } from './gemma';
import type { GemmaMessage } from './gemma';
import { playTtsStream } from './elevenlabs-tts';
import { startCall, endCall } from './call-api';
import type { CallStartData, TranscriptTurn } from './call-api';
import type { Princess } from './api';

export type CallState = 'LOADING' | 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ENDED';

export interface CallCallbacks {
  onStateChange: (state: CallState) => void;
  onTranscript: (turn: TranscriptTurn) => void;
  onTimerTick: (secondsRemaining: number) => void;
  onError: (error: string) => void;
}

const SILENCE_TIMEOUT_MS = 1500;
const IDLE_PROMPT_TIMEOUT_MS = 10000;

function buildSystemPrompt(data: CallStartData): string {
  return `You are ${data.persona.name}, from ${data.persona.origin}. ${data.persona.tone_style}

You are on a magical phone call with ${data.child_name}.

## Your personality
- Signature phrase: "${data.persona.signature_phrase}"
- You speak with warmth, wonder, and encouragement
- You weave in light educational moments naturally (counting, colors, simple questions)
- You NEVER break character
- You keep responses short (2-4 sentences) — this is a conversation, not a monologue

## What you know about ${data.child_name}
${data.memories || 'This is your first time talking!'}

## Rules
- English only
- Age-appropriate content only — nothing scary, violent, or sad
- If the child says something you don't understand, gently ask them to repeat
- Never mention being an AI, a model, or a computer
- If asked about other princesses, stay positive but redirect to your own world`;
}

export class CallEngine {
  private state: CallState = 'LOADING';
  private callbacks: CallCallbacks;
  private princess: Princess;
  private childId: string;
  private sessionData: CallStartData | null = null;
  private messages: GemmaMessage[] = [];
  private transcript: TranscriptTurn[] = [];
  private audioContext: AudioContext | null = null;
  private recognition: SpeechRecognition | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private secondsRemaining = 0;
  private silenceTimeout: ReturnType<typeof setTimeout> | null = null;
  private idleTimeout: ReturnType<typeof setTimeout> | null = null;
  private startTime = 0;
  private wrapUpInjected = false;

  constructor(princess: Princess, childId: string, callbacks: CallCallbacks) {
    this.princess = princess;
    this.childId = childId;
    this.callbacks = callbacks;
  }

  private setState(state: CallState) {
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  async start(): Promise<void> {
    try {
      this.setState('LOADING');

      // Load model and fetch session data in parallel
      const [, sessionData] = await Promise.all([
        loadModel(),
        startCall(this.childId, this.princess),
      ]);
      this.sessionData = sessionData;
      this.secondsRemaining = sessionData.timer_seconds;

      // Build system prompt
      this.messages = [{ role: 'system', content: buildSystemPrompt(sessionData) }];

      // Create AudioContext (must be after user gesture)
      this.audioContext = new AudioContext();

      // Generate greeting
      this.setState('THINKING');
      const greeting = await generate(this.messages);
      this.messages.push({ role: 'assistant', content: greeting });
      this.transcript.push({ role: 'princess', text: greeting });
      this.callbacks.onTranscript({ role: 'princess', text: greeting });

      // Speak greeting
      this.setState('SPEAKING');
      await playTtsStream(greeting, sessionData.persona.voice_id, this.audioContext);

      // Start timer
      this.startTime = Date.now();
      this.timerInterval = setInterval(() => this.tick(), 1000);

      // Start listening
      this.startListening();
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err.message : 'Failed to start call');
      this.setState('ENDED');
    }
  }

  private tick() {
    this.secondsRemaining = Math.max(0, this.secondsRemaining - 1);
    this.callbacks.onTimerTick(this.secondsRemaining);

    // Inject wrap-up hint at 60 seconds remaining
    if (this.secondsRemaining <= 60 && !this.wrapUpInjected) {
      this.wrapUpInjected = true;
      this.messages.push({
        role: 'system',
        content: '[The call is ending soon. Start wrapping up naturally within your next 2-3 responses. Say goodbye warmly and use your signature phrase.]',
      });
    }

    // Hard cutoff
    if (this.secondsRemaining <= 0) {
      this.endCall();
    }
  }

  private startListening() {
    this.setState('IDLE');

    // Use Web Speech API for STT (interim until Gemma audio input is wired)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.callbacks.onError('Speech recognition not supported on this device');
      this.endCall();
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1];
      if (last.isFinal) {
        const text = last[0].transcript.trim();
        if (text) {
          this.clearSilenceTimeout();
          this.clearIdleTimeout();
          this.handleChildSpeech(text);
        }
      }
    };

    this.recognition.onspeechstart = () => {
      this.setState('LISTENING');
      this.clearIdleTimeout();
    };

    this.recognition.onspeechend = () => {
      this.startSilenceTimeout();
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        this.callbacks.onError(`Speech recognition error: ${event.error}`);
      }
    };

    this.recognition.onend = () => {
      // Restart if we're still in a listening state
      if (this.state === 'IDLE' || this.state === 'LISTENING') {
        try {
          this.recognition?.start();
        } catch {
          // already running
        }
      }
    };

    this.recognition.start();
    this.startIdleTimeout();
  }

  private startSilenceTimeout() {
    this.clearSilenceTimeout();
    this.silenceTimeout = setTimeout(() => {
      // Silence detected — if we have pending speech, process it
    }, SILENCE_TIMEOUT_MS);
  }

  private clearSilenceTimeout() {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
  }

  private startIdleTimeout() {
    this.clearIdleTimeout();
    this.idleTimeout = setTimeout(() => {
      // No speech for 10 seconds — princess prompts
      this.handleChildSpeech('');
    }, IDLE_PROMPT_TIMEOUT_MS);
  }

  private clearIdleTimeout() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
  }

  private async handleChildSpeech(text: string) {
    if (this.state === 'THINKING' || this.state === 'SPEAKING' || this.state === 'ENDED') return;

    // Stop listening during princess response
    this.recognition?.stop();

    if (text) {
      this.transcript.push({ role: 'child', text });
      this.callbacks.onTranscript({ role: 'child', text });
      this.messages.push({ role: 'user', content: text });
    } else {
      // Idle prompt — inject hint but don't add empty user message
      this.messages.push({
        role: 'user',
        content: '(silence — the child has been quiet for a while)',
      });
    }

    // Trim context window: keep system prompt (index 0) + last 20 messages
    if (this.messages.length > 21) {
      this.messages = [this.messages[0], ...this.messages.slice(-20)];
    }

    // Generate response
    this.setState('THINKING');
    try {
      const response = await generate(this.messages);
      this.messages.push({ role: 'assistant', content: response });
      this.transcript.push({ role: 'princess', text: response });
      this.callbacks.onTranscript({ role: 'princess', text: response });

      // Speak response
      if (this.state === 'ENDED' || !this.audioContext || !this.sessionData) return;
      this.setState('SPEAKING');
      await playTtsStream(response, this.sessionData.persona.voice_id, this.audioContext);

      // Resume listening
      if (this.state !== 'ENDED') {
        this.startListening();
      }
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err.message : 'Generation failed');
      // Try to resume listening
      if (this.state !== 'ENDED') {
        this.startListening();
      }
    }
  }

  async endCall(): Promise<void> {
    if (this.state === 'ENDED') return;
    this.setState('ENDED');

    // Cleanup
    this.recognition?.stop();
    this.recognition = null;
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.clearSilenceTimeout();
    this.clearIdleTimeout();
    await this.audioContext?.close();
    this.audioContext = null;

    // Send transcript to backend
    if (this.sessionData) {
      const durationSeconds = Math.round((Date.now() - this.startTime) / 1000);
      try {
        await endCall(
          this.sessionData.session_id,
          this.childId,
          this.princess,
          durationSeconds,
          this.transcript,
        );
      } catch {
        // Best-effort — don't block the UI
      }
    }

    await unloadModel();
  }
}
```

- [ ] **Step 2: Add Web Speech API type declarations**

Check if `@types/dom-speech-recognition` is needed. If TypeScript complains about `SpeechRecognition`, install:

```bash
cd frontend && npm install -D @types/dom-speech-recognition
```

Or add to a `frontend/types/speech.d.ts`:

```typescript
interface Window {
  SpeechRecognition: typeof SpeechRecognition;
  webkitSpeechRecognition: typeof SpeechRecognition;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/call-engine.ts frontend/types/speech.d.ts
git commit -m "feat(frontend): add call engine with turn-taking state machine"
```

---

## Task 9: Frontend — ModelLoader Component

**Files:**
- Create: `frontend/components/ModelLoader.tsx`

- [ ] **Step 1: Create the ModelLoader component**

```tsx
// frontend/components/ModelLoader.tsx
'use client';

import { useState, useEffect } from 'react';
import { loadModel, isModelCached } from '@/lib/gemma';
import type { ProgressCallback } from '@/lib/gemma';

interface Props {
  onReady: () => void;
  onError: (error: string) => void;
}

export function ModelLoader({ onReady, onError }: Props) {
  const [status, setStatus] = useState<'checking' | 'downloading' | 'ready' | 'error'>('checking');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const cached = await isModelCached();
      if (cancelled) return;

      setStatus('downloading');

      const handleProgress: ProgressCallback = (p) => {
        if (cancelled) return;
        if (p.progress !== undefined) {
          setProgress(Math.round(p.progress));
        }
      };

      try {
        await loadModel(handleProgress);
        if (cancelled) return;
        setStatus('ready');
        onReady();
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        onError(err instanceof Error ? err.message : 'Failed to load model');
      }
    }

    load();
    return () => { cancelled = true; };
  }, [onReady, onError]);

  if (status === 'checking') {
    return (
      <div className="flex flex-col items-center gap-3 p-6">
        <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full" />
        <p className="text-white/60 text-sm">Preparing magic...</p>
      </div>
    );
  }

  if (status === 'downloading') {
    return (
      <div className="flex flex-col items-center gap-3 p-6 w-full max-w-xs">
        <p className="text-white text-sm">Downloading princess's magic...</p>
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-gold)] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-white/40 text-xs">{progress}%</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 p-6">
        <p className="text-red-300 text-sm">Something went wrong. Please try again.</p>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/ModelLoader.tsx
git commit -m "feat(frontend): add ModelLoader component with download progress"
```

---

## Task 10: Frontend — CallScreen Component

**Files:**
- Create: `frontend/components/CallScreen.tsx`

- [ ] **Step 1: Create the CallScreen component**

```tsx
// frontend/components/CallScreen.tsx
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { CallEngine } from '@/lib/call-engine';
import type { CallState, CallCallbacks } from '@/lib/call-engine';
import type { TranscriptTurn } from '@/lib/call-api';
import type { Princess } from '@/lib/api';
import { ModelLoader } from './ModelLoader';

interface Props {
  princess: Princess;
  childId: string;
  onCallEnd: () => void;
}

const STATE_LABELS: Record<CallState, string> = {
  LOADING: 'Connecting...',
  IDLE: 'Your turn to speak!',
  LISTENING: 'Listening...',
  THINKING: '✨',
  SPEAKING: 'Speaking...',
  ENDED: 'Call ended',
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CallScreen({ princess, childId, onCallEnd }: Props) {
  const [callState, setCallState] = useState<CallState>('LOADING');
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(420);
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const engineRef = useRef<CallEngine | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const callbacks: CallCallbacks = {
    onStateChange: setCallState,
    onTranscript: (turn) => setTranscript((prev) => [...prev, turn]),
    onTimerTick: setTimeRemaining,
    onError: setError,
  };

  const handleModelReady = useCallback(() => setModelReady(true), []);
  const handleModelError = useCallback((err: string) => setError(err), []);

  // Start call once model is ready
  useEffect(() => {
    if (!modelReady) return;
    const engine = new CallEngine(princess, childId, callbacks);
    engineRef.current = engine;
    engine.start();

    return () => {
      engine.endCall();
    };
  }, [modelReady, princess, childId]);

  // Toddler lock: hold 1 second to end call
  const handleHoldStart = () => {
    setHoldProgress(0);
    let elapsed = 0;
    holdTimerRef.current = setInterval(() => {
      elapsed += 50;
      setHoldProgress(Math.min(100, (elapsed / 1000) * 100));
      if (elapsed >= 1000) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        engineRef.current?.endCall().then(onCallEnd);
      }
    }, 50);
  };

  const handleHoldEnd = () => {
    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    setHoldProgress(0);
  };

  // Animation class based on state
  const animationClass =
    callState === 'LISTENING' ? 'animate-pulse ring-4 ring-white/30' :
    callState === 'THINKING' ? 'animate-bounce' :
    callState === 'SPEAKING' ? 'animate-pulse ring-4 ring-[var(--color-gold)]/40' :
    '';

  if (!modelReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-indigo-950 to-purple-950">
        <ModelLoader onReady={handleModelReady} onError={handleModelError} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen bg-gradient-to-b from-indigo-950 to-purple-950 p-4 pt-8">
      {/* Timer (subtle, parent-facing) */}
      <div className="absolute top-4 right-4 text-white/30 text-xs font-mono">
        {formatTime(timeRemaining)}
      </div>

      {/* Princess portrait */}
      <div className={`relative w-48 h-48 rounded-full overflow-hidden mt-12 transition-all duration-500 ${animationClass}`}>
        <Image
          src={`/princesses/${princess}.png`}
          alt={princess}
          fill
          className="object-cover"
          priority
        />
      </div>

      {/* State indicator */}
      <p className="text-white/60 text-sm mt-6">{STATE_LABELS[callState]}</p>

      {/* Error display */}
      {error && (
        <p className="text-red-300 text-xs mt-2 max-w-xs text-center">{error}</p>
      )}

      {/* Transcript (scrollable) */}
      <div className="flex-1 w-full max-w-sm mt-6 overflow-y-auto space-y-3 pb-24">
        {transcript.map((turn, i) => (
          <div
            key={i}
            className={`text-sm px-3 py-2 rounded-xl max-w-[80%] ${
              turn.role === 'princess'
                ? 'bg-purple-800/50 text-white/90 self-start'
                : 'bg-white/10 text-white/70 self-end ml-auto'
            }`}
          >
            {turn.text}
          </div>
        ))}
      </div>

      {/* End call button (toddler lock) */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2">
        <button
          onPointerDown={handleHoldStart}
          onPointerUp={handleHoldEnd}
          onPointerLeave={handleHoldEnd}
          className="relative w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center"
        >
          <div
            className="absolute inset-0 rounded-full bg-red-500/60 transition-all"
            style={{
              clipPath: `inset(${100 - holdProgress}% 0 0 0)`,
            }}
          />
          <span className="relative text-red-300 text-xl">✕</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/CallScreen.tsx
git commit -m "feat(frontend): add CallScreen component with state animations and toddler lock"
```

---

## Task 11: Frontend — Contacts Page

**Files:**
- Create: `frontend/app/[locale]/(play)/call/page.tsx`

- [ ] **Step 1: Create the contacts page**

Read `node_modules/next/dist/docs/` for any Next.js 16 page conventions before writing. The page follows the existing pattern from `frontend/app/[locale]/(play)/play/[princess]/page.tsx`.

```tsx
// frontend/app/[locale]/(play)/call/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { isWebGPUSupported } from '@/lib/gemma';
import { getStoredToken, getStoredChildId, fetchUserProfile } from '@/lib/user';
import type { ChildInfo } from '@/lib/user';
import type { Princess } from '@/lib/api';

export default function ContactsPage() {
  const { locale } = useParams<{ locale: string }>();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const childId = getStoredChildId();

  useEffect(() => {
    async function load() {
      const token = getStoredToken();
      if (!token || !childId) {
        setLoading(false);
        return;
      }
      const profile = await fetchUserProfile(token);
      if (profile) {
        const child = profile.children.find((c) => c.id === childId);
        if (child?.preferences?.favorite_princesses) {
          setFavorites(child.preferences.favorite_princesses);
        }
      }
      setLoading(false);
    }
    load();
  }, [childId]);

  if (!isWebGPUSupported()) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <p className="text-white/60 text-center">
          Live calls require a newer device. Please try on iPad Pro, iPhone 17, or Chrome desktop.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full" />
      </div>
    );
  }

  const princesses = favorites.length > 0 ? favorites : [
    'elsa', 'belle', 'cinderella', 'ariel', 'rapunzel', 'moana',
  ];

  return (
    <div className="flex flex-col items-center min-h-screen p-4 pt-8 pb-32">
      <h1 className="text-2xl font-bold text-white mb-8">Call a Princess</h1>

      <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
        {princesses.map((p) => (
          <Link
            key={p}
            href={`/${locale}/call/${p}${childId ? `?child_id=${childId}` : ''}`}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="relative w-20 h-20 rounded-full overflow-hidden">
              <Image
                src={`/princesses/${p}.png`}
                alt={p}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
            <span className="text-white text-sm capitalize">{p}</span>
            <span className="text-[var(--color-gold)] text-xs">Call</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/\[locale\]/\(play\)/call/page.tsx
git commit -m "feat(frontend): add contacts page for princess calls"
```

---

## Task 12: Frontend — Active Call Page

**Files:**
- Create: `frontend/app/[locale]/(play)/call/[princess]/page.tsx`

- [ ] **Step 1: Create the active call page**

```tsx
// frontend/app/[locale]/(play)/call/[princess]/page.tsx
'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CallScreen } from '@/components/CallScreen';
import type { Princess } from '@/lib/api';
import { getStoredChildId } from '@/lib/user';

export default function ActiveCallPage() {
  const { locale, princess } = useParams<{ locale: string; princess: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const childId = searchParams.get('child_id') || getStoredChildId();

  if (!childId) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <p className="text-white/60 text-center">
          Please select a child first before calling a princess.
        </p>
      </div>
    );
  }

  const handleCallEnd = () => {
    router.push(`/${locale}/call`);
  };

  return (
    <CallScreen
      princess={princess as Princess}
      childId={childId}
      onCallEnd={handleCallEnd}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/\[locale\]/\(play\)/call/\[princess\]/page.tsx
git commit -m "feat(frontend): add active call page route"
```

---

## Task 13: Frontend — Add Call Tab to BottomNav

**Files:**
- Modify: `frontend/components/BottomNav.tsx`

- [ ] **Step 1: Add WebGPU-conditional Call tab**

In `frontend/components/BottomNav.tsx`, update the `tabs` array to conditionally include the Call tab:

```tsx
// Replace the existing tabs array with:
const supportsWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

const tabs = [
  { href: `/${locale}/inbox`, label: 'Inbox', iconSrc: '/inbox-3d.png' },
  { href: `/${locale}/story`, label: 'Story', iconSrc: '/story-3d.png' },
  ...(supportsWebGPU
    ? [{ href: `/${locale}/call`, label: 'Call', iconSrc: '/call-3d.png' }]
    : []),
];
```

**Note:** You'll need a `call-3d.png` icon in `frontend/public/`. For now, use any placeholder icon. The designer can replace it later.

- [ ] **Step 2: Commit**

```bash
git add frontend/components/BottomNav.tsx
git commit -m "feat(frontend): add Call tab to BottomNav (WebGPU devices only)"
```

---

## Task 14: Integration Test — Full Call Flow

**Files:**
- Modify: `backend/tests/test_call_routes.py`

- [ ] **Step 1: Add an integration-style test for the full backend flow**

Append to `backend/tests/test_call_routes.py`:

```python
def test_full_call_flow(client, mocker):
    """Simulate a complete call: start → tts → end."""
    # Setup mocks
    _make_mock_conn(mocker, "backend.routes.call.get_conn", fetchone=("Lily",))
    mocker.patch(
        "backend.routes.call.fetch_memories",
        return_value={"memories": "- Loves butterflies"},
    )
    mocker.patch(
        "backend.routes.call.synthesize_voice_stream",
        return_value=iter([b"audio-data"]),
    )
    mocker.patch("backend.routes.call.extract_memories_from_transcript")

    # 1. Start call
    start_res = client.get("/call/start?child_id=child-1&princess=elsa")
    assert start_res.status_code == 200
    session_id = start_res.json()["session_id"]
    voice_id = start_res.json()["persona"]["voice_id"]

    # 2. TTS request
    tts_res = client.post("/call/tts", json={
        "text": "Hello Lily!",
        "voice_id": voice_id,
    })
    assert tts_res.status_code == 200
    assert tts_res.content == b"audio-data"

    # 3. End call
    end_res = client.post("/call/end", json={
        "session_id": session_id,
        "child_id": "child-1",
        "princess": "elsa",
        "duration_seconds": 180,
        "transcript": [
            {"role": "princess", "text": "Hello Lily!"},
            {"role": "child", "text": "Hi Elsa! I saw a butterfly today!"},
        ],
    })
    assert end_res.status_code == 200
    assert end_res.json()["status"] == "ok"
```

- [ ] **Step 2: Run all call route tests**

```bash
cd backend && uv run pytest tests/test_call_routes.py -v
```

Expected: All 8 tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_call_routes.py
git commit -m "test(backend): add integration test for full call flow"
```

---

## Task 15: Final Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && uv run pytest tests/ -v
```

Expected: All tests PASS (existing + new call tests)

- [ ] **Step 2: Run frontend build**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no TypeScript errors

- [ ] **Step 3: Run frontend lint**

```bash
cd frontend && npm run lint
```

Expected: No lint errors

- [ ] **Step 4: Manual smoke test (if Docker available)**

```bash
docker compose up --build
```

Then:
1. Open http://localhost:3000 on a WebGPU-capable browser
2. Verify "Call" tab appears in bottom nav
3. Tap a princess contact
4. Verify model download progress shows
5. Verify greeting plays

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A && git commit -m "fix: address issues found during final verification"
```
