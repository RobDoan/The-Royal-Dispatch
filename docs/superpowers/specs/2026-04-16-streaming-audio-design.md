# Streaming Audio on Cache Miss — Design

**Date:** 2026-04-16
**Status:** Approved (pending implementation)
**Owner:** backend + frontend

## Problem

On a cache miss, the current `/story` flow makes the child wait for:

1. The full LangGraph pipeline to run (LLM + ElevenLabs synthesis).
2. The completed MP3 to be uploaded to S3.
3. The browser to download the MP3 from S3 before playback starts.

The ElevenLabs step already returns bytes as an iterable stream, but we buffer the entire response, upload, and only then return a URL. Playback can start much earlier.

## Goal

On a cache miss, begin audio playback as soon as ElevenLabs produces its first bytes — without giving up the cache-on-S3 behavior that makes later plays fast.

## Non-Goals

- Streaming the LLM output into TTS (i.e., overlapping `generate_story` with `synthesize_voice`). Out of scope for this iteration.
- Range-request / seek support on the streaming endpoint.
- In-process fan-out of a single generation to multiple concurrent listeners.
- Retry logic on the streaming endpoint. Clients retry by re-tapping.
- Modifying the existing `royal_graph`, `synthesize_voice` node, or `store_result` node. They remain intact for back-compat and tests.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Latency target | Cold-start / cache-miss first play. |
| Scope of streaming | ElevenLabs → client only. LLM step stays synchronous. |
| API shape | Two-step: `POST /story` returns `{ audio_url }`. On cache miss `audio_url` is a backend streaming URL; on cache hit it's the S3 URL. |
| Concurrency (same child double-tap) | Accept possible duplicate generation in the rare edge case. No locking. |
| Tee strategy | In-memory buffer: yield bytes to client while accumulating; on stream end, upload full MP3 to S3 and insert story row. Complete the save even if the client disconnects. |

## Architecture

### Request flow — cache hit

```
Client: POST /story
Backend: DB lookup → row found
Backend: 200 { audio_url: "<S3 public URL>" }
Client: <audio src="<S3 URL>"> → browser fetches from S3/MinIO (unchanged)
```

### Request flow — cache miss

```
Client: POST /story
Backend: DB lookup → no row
Backend: 200 { audio_url: "<BACKEND_PUBLIC_URL>/story/stream?..." }
         (returns immediately; no pipeline work yet)

Client: <audio src="<streaming URL>"> → GET /story/stream?...
Backend: DB lookup (re-check)
  ├─ now found (race)  → 302 redirect to S3 URL
  └─ still missing     → run pre-TTS pipeline
                         → call ElevenLabs (streaming)
                         → StreamingResponse: yield chunks to client,
                                              accumulate into buffer
                         → on stream end (or client disconnect):
                                 schedule background finalize(bytes):
                                    upload MP3 to S3
                                    INSERT story row
```

### Component changes

**`backend/graph.py`** — add a second compiled graph:

- `pre_tts_graph` — identical to `royal_graph` but ends after `generate_story` (daily branch) or `generate_life_lesson` (life_lesson branch). No `synthesize_voice`, no `store_result`.
- `royal_graph` — unchanged.

**`backend/nodes/synthesize_voice.py`** — add a new helper alongside the existing node:

- `synthesize_voice_stream(voice_id: str, text: str) -> Iterator[bytes]` — wraps `ElevenLabs.text_to_speech.convert()`, yields chunks as they arrive. No buffering, no S3.
- Existing `synthesize_voice(state)` function — unchanged.

**`backend/nodes/store_result.py`** — add a new helper alongside the existing node:

- `store_result_from_bytes(state: RoyalStateOptional, audio_bytes: bytes) -> None` — uses the same filename convention as today, puts the bytes to S3, then does the same `INSERT … ON CONFLICT DO UPDATE` SQL. Returns nothing (side-effect only).
- Existing `store_result(state)` function — unchanged.

**`backend/routes/stories.py`** — modify `POST /story`, add `GET /story/stream`:

- `POST /story`: cache lookup only. Hit → return S3 URL. Miss → return absolute streaming URL built from `BACKEND_PUBLIC_URL` env + the full cache key as query params. No pipeline invocation.
- `GET /story/stream`: new endpoint. Re-checks cache (302 to S3 on hit). On miss, runs `pre_tts_graph`, then returns `StreamingResponse(tee_and_save(state), media_type="audio/mpeg", headers={"Cache-Control": "no-store"})`.

### `tee_and_save` generator (sketch)

```python
async def tee_and_save(pre_state: RoyalStateOptional):
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
                # Client disconnected. Keep draining ElevenLabs so we
                # persist a complete MP3, then schedule finalize.
                client_disconnected = True
                break
    except Exception:
        # ElevenLabs streaming error — do NOT persist a partial file.
        logger.exception("ElevenLabs streaming failed mid-generation")
        return

    if client_disconnected:
        try:
            for chunk in chunks:
                buffer.extend(chunk)
        except Exception:
            logger.exception("ElevenLabs drain after disconnect failed")
            return

    # Only reached when the full MP3 is in buffer.
    asyncio.create_task(finalize(pre_state, bytes(buffer)))


async def finalize(pre_state: RoyalStateOptional, audio_bytes: bytes) -> None:
    # Detached from the request lifecycle — survives client disconnect.
    # Runs blocking S3 + DB calls in a thread to avoid blocking the event loop.
    try:
        await asyncio.to_thread(store_result_from_bytes, pre_state, audio_bytes)
    except Exception:
        logger.exception("finalize failed to persist audio/row")
```

Notes:

- The ElevenLabs SDK's `.convert()` returns a synchronous iterable of byte chunks. Iterating it inside the async generator is acceptable because chunks arrive network-bound; revisit with `asyncio.to_thread` only if benchmarks show event-loop blocking.
- `asyncio.create_task` is called from inside the async generator. FastAPI cancels the generator on disconnect via `GeneratorExit`/`CancelledError`; we catch that, drain the remaining chunks, then schedule `finalize`. The task runs on the event loop independently of the (now-cancelled) request task, so it completes even after the HTTP response is torn down.
- On ElevenLabs streaming errors, the outer `except Exception` returns early **without** scheduling `finalize` — no partial MP3 is persisted. Next tap regenerates cleanly.

### Config

New env var: `BACKEND_PUBLIC_URL`.

- Used by `POST /story` to construct absolute streaming URLs returned to the frontend.
- Added to `backend/.env.example`, `docker-compose.yml`, and k8s manifests.
- Local dev default: `http://localhost:8000`.

### Frontend

No changes required to `AudioPlayer`. `<audio src={audioUrl}>` works with both a direct S3 URL and a streamed `audio/mpeg` response from the backend.

- `frontend/lib/api.ts` — no functional changes. `fetchStory()` still returns whatever `audio_url` the backend provides.
- Progress bar / duration degrade gracefully: `duration` may be `Infinity` or `NaN` during the stream; `formatTime()` already handles `NaN` → `"--:--"`.
- Seeking (`↺` / `↻`) on the streaming response will be jumpy / unsupported. Acceptable for cold-start first play. Subsequent plays hit S3 and seek normally.

## Error Handling

| Failure | Behavior |
|---|---|
| Pipeline fails before TTS (LLM error, persona load, etc.) | `GET /story/stream` returns 500. Browser shows standard audio-load error. |
| ElevenLabs fails mid-stream | Client gets truncated MP3. `finalize` is **not** scheduled — no story row inserted. Next tap regenerates. |
| Client disconnects mid-stream | `finally` drains remaining ElevenLabs chunks, schedules `finalize`. Story row is inserted. Next tap is a cache hit. |
| S3 upload fails in `finalize` | Log error. No row inserted. Next tap regenerates. |
| `finalize` uploads but DB insert fails | Log error. Orphan MP3 in S3 (harmless). Next tap regenerates and overwrites. |
| Concurrent POSTs for same child/princess/date | Both run their own pipeline. Both eventually insert/update via `ON CONFLICT DO UPDATE`. Last write wins, no crash. Extra ElevenLabs spend accepted. |

## Testing

### Unit tests

- `tests/test_nodes/test_synthesize_voice_stream.py` — new. Mocked ElevenLabs yields known chunks; assert the helper yields them unchanged without calling S3.
- `tests/test_nodes/test_store_result_from_bytes.py` — new. Mocked S3 + DB; assert correct filename convention and SQL (same `ON CONFLICT` semantics as existing `store_result` test).
- `tests/test_graph_pre_tts.py` — new. Compile `pre_tts_graph` with mocked nodes; assert it ends after `generate_story` (daily) and after `generate_life_lesson` (life_lesson) with expected state populated.
- Existing `test_synthesize_voice.py`, `test_store_result.py`, graph tests — unchanged.

### Route tests (additions to `tests/test_api.py`)

- `POST /story` cache hit — returns S3 URL, no graph invocation. (Likely covered today; verify.)
- `POST /story` cache miss — returns streaming URL prefixed with `BACKEND_PUBLIC_URL`, contains all cache-key params, does **not** invoke the graph.
- `GET /story/stream` cache hit (race) — 302 to S3 URL.
- `GET /story/stream` cache miss — `200 audio/mpeg`, body equals concatenated mocked chunks, `store_result_from_bytes` called with full bytes.
- `GET /story/stream` client disconnect — simulate early close; assert `finalize` still ran and row was inserted. *(If integration-level simulation is flaky, cover the `finally` path via a focused unit test on the generator.)*
- `GET /story/stream` ElevenLabs mid-stream error — no row inserted; response terminates.

### Manual smoke

- `docker compose up --build`.
- Trigger a cache-miss tap via pick-child flow. Verify in Chrome DevTools:
  - `POST /story` returns `{ audio_url: "http://localhost:8000/story/stream?..." }` instantly.
  - `GET /story/stream` response has `Content-Type: audio/mpeg`, no `Content-Length`, bytes arrive progressively.
  - Audio playback starts before the response finishes.
- Re-tap the same princess. Verify no `/story/stream` call — the `POST /story` response points at the S3 URL directly.

## Implementation Order

1. Add `synthesize_voice_stream` helper + unit test.
2. Add `store_result_from_bytes` helper + unit test.
3. Add `pre_tts_graph` + graph-level test.
4. Add `GET /story/stream` endpoint + route tests.
5. Modify `POST /story` to return streaming URL on cache miss + update route tests.
6. Add `BACKEND_PUBLIC_URL` to `.env.example`, `docker-compose.yml`, k8s manifests.
7. Manual smoke test full round-trip.

## Open Questions

None. All resolved during brainstorming.
