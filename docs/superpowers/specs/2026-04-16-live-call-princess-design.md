# Live Call with Princess — Design Spec

## Overview

A real-time voice conversation feature where children can "call" their favorite princess. Gemma 4 E2B runs in the browser via WebGPU (free, private), processing the child's speech natively. ElevenLabs streaming TTS provides the princess's voice using existing persona voice IDs. The backend is only involved at call start (fetch memories) and call end (save new memories).

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Browser (iPad/iPhone)                │
│                                                       │
│  ┌──────────┐    ┌──────────────┐    ┌────────────┐ │
│  │ Mic Input │───▶│  Gemma 4 E2B │───▶│ Call Engine │ │
│  │ (audio)   │    │  (WebGPU)    │    │ (turns,    │ │
│  └──────────┘    │              │    │  timer,    │ │
│                   │ System prompt│    │  context)  │ │
│                   │ + memories   │    │            │ │
│  ┌──────────┐    │ + chat hist  │    └─────┬──────┘ │
│  │ Speaker   │◀──┤              │          │        │
│  │ (audio)   │   └──────────────┘          │        │
│  └────▲─────┘                              │        │
│       │                                    │        │
│  ┌────┴──────────────┐                     │        │
│  │ ElevenLabs TTS    │◀───────────────────┘        │
│  │ (streaming, API)  │  princess text response       │
│  └───────────────────┘                               │
└──────────────────────┬───────────────────────────────┘
                       │ call start / call end only
                       ▼
              ┌─────────────────┐
              │ Backend (FastAPI)│
              │                  │
              │ GET  /call/start │ → fetch memories + persona
              │ POST /call/tts   │ → proxy ElevenLabs TTS (streaming)
              │ POST /call/end   │ → extract new memories
              └─────────────────┘
```

## Gemma 4 E2B Integration

### Model

- **Model:** Gemma 4 E2B (2.3B effective params, ~500MB quantized)
- **Runtime:** Transformers.js v4 with WebGPU backend
- **Capabilities:** Native audio input (40ms frame audio encoder), text + image input, text output only
- **Cache:** Model files stored in Cache API / IndexedDB after first download
- **Device requirements:** WebGPU support — iPad Pro (iPadOS 26+), iPhone 17 (iOS 26+), Chrome desktop

### System Prompt

```
You are {princess_name}, from {origin}. {tone_style}

You are on a magical phone call with {child_name}.

## Your personality
- Signature phrase: "{signature_phrase}"
- You speak with warmth, wonder, and encouragement
- You weave in light educational moments naturally (counting, colors, simple questions)
- You NEVER break character
- You keep responses short (2-4 sentences) — this is a conversation, not a monologue

## What you know about {child_name}
{formatted_memories}

## Rules
- English only
- Age-appropriate content only — nothing scary, violent, or sad
- If the child says something you don't understand, gently ask them to repeat
- Never mention being an AI, a model, or a computer
- If asked about other princesses, stay positive but redirect to your own world
```

### Context Window Management

- System prompt + memories: ~2K tokens (fixed)
- Rolling chat history: last ~20 turns
- 10 minutes of conversation ≈ 5K tokens total — well within 128K limit
- Oldest turns dropped when approaching limit

## Audio Pipeline & Turn-Taking

### Input (Child → Gemma)

- Mic access via `navigator.mediaDevices.getUserMedia()`
- Raw audio chunks fed directly to Gemma E2B's audio encoder
- **Voice Activity Detection:** 1.5-second silence threshold to detect end of turn
- If silence exceeds 10 seconds, princess gently prompts: "Are you still there, dear?"

### Output (Gemma → ElevenLabs → Speaker)

- Gemma generates text response (2-4 sentences)
- Text sent to ElevenLabs streaming TTS API with persona's `voice_id`
- Audio streamed to browser, played via `AudioContext`
- **Mic muted during princess speech** to prevent echo/feedback
- Mic re-opens when TTS playback completes

### Turn-Taking State Machine

```
┌──────────┐  child speaks   ┌───────────┐  1.5s silence  ┌────────────┐
│  IDLE    │───────────────▶│ LISTENING │──────────────▶│ THINKING   │
│(princess │                 │ (mic on,   │                │ (Gemma     │
│ just     │                 │  glow anim)│                │  inference)│
│ spoke)   │                 └───────────┘                └─────┬──────┘
└──────────┘                                                    │
     ▲                                                          │
     │           ┌────────────┐                                 │
     │           │ SPEAKING   │◀────────────────────────────────┘
     └───────────│ (TTS plays,│  text response ready
                 │  mic muted)│
                 └────────────┘
```

### Edge Cases

| Scenario | Handling |
|---|---|
| Child interrupts princess | Mic muted during SPEAKING — princess finishes her sentence |
| Long silence (>10s) | Princess prompts gently |
| Background noise | Gemma audio encoder handles; VAD tuned to ignore ambient |
| Inappropriate content | System prompt constrains; princess redirects kindly |
| No mic permission | Friendly message: "The princess needs to hear you!" |

### Latency Budget

| Step | Target |
|---|---|
| Gemma audio processing | ~500ms |
| Gemma text generation | ~1-2s |
| ElevenLabs TTS first byte | ~300-500ms |
| **Total to first audio** | **~2-3s** |

"Thinking sparkle" animation shown during THINKING state.

## Timer & Session Management

### Timer

- **Default:** 7 minutes, starts on princess greeting
- **Visual:** Subtle timer in corner (parent-facing, not prominent for child)

### Wrap-Up Sequence

| Time | Event |
|---|---|
| 0:00 | Princess greets: "Hello {child_name}! It's so wonderful to hear from you!" |
| 6:00 | System injects: `[The call is ending soon. Wrap up naturally in 2-3 responses.]` |
| ~6:30 | Princess begins goodbye: "Oh my, the stars are calling me back to {origin}..." |
| 7:00 | Hard cutoff — princess delivers final line with `signature_phrase` |
| Post-call | Transcript sent to backend for memory extraction |

### Parent Controls

- **End call early:** Toddler-lock pattern (1-second hold) reveals "End Call" button
- **No child-accessible end button** — prevents accidental disconnection

### Post-Call Flow

1. Conversation transcript assembled from all turns
2. `POST /call/end` sends transcript + `child_id` to backend
3. Backend runs `extract_memories` on transcript (reuses existing logic)
4. Frontend shows "The princess had a wonderful time with you!" then returns to contacts page

## Backend Changes

### New Endpoints

**`GET /call/start`**
- Query params: `child_id`, `princess`
- Loads persona YAML (reuses `load_persona`)
- Fetches memories (reuses `fetch_memories` with `child_id`)
- Returns:
```json
{
  "persona": { "name", "voice_id", "tone_style", "signature_phrase", "origin" },
  "memories": "formatted memory string",
  "child_name": "Emma",
  "session_id": "uuid",
  "timer_seconds": 420
}
```

**`POST /call/tts`**
- Body: `{ "text", "voice_id" }`
- Proxies to ElevenLabs streaming TTS API
- Returns streaming audio response (keeps API key server-side)

**`POST /call/end`**
- Body: `{ "session_id", "child_id", "princess", "transcript": [...turns] }`
- Runs `extract_memories` on transcript
- Stores call record in `calls` table

### New Database Table

```sql
CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID REFERENCES children(id),
    princess TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    duration_seconds INT,
    turn_count INT,
    transcript JSONB
);
```

### No Changes To

- Story pipeline (`/brief`, `/story`, LangGraph graph)
- Persona YAML structure
- Memory layer (Mem0/Qdrant — reused as-is)
- Existing frontend pages (story, onboarding, admin)

## Frontend Changes

### New Routes

**`/[locale]/(play)/call/page.tsx`** — Contacts Page
- Grid of princess contacts (portrait + name)
- Filtered to child's favorite princesses
- Each contact: "Call" button (if WebGPU supported + model ready)
- First visit: "Download" indicator → becomes "Call" once model cached
- WebGPU not supported: page not accessible (hidden from nav)

**`/[locale]/(play)/call/[princess]/page.tsx`** — Active Call Screen
- Full-screen princess portrait (centered)
- State-driven animations: listening (glow), thinking (sparkle), speaking (bounce)
- Subtle timer in corner
- Toddler-lock End Call

### New Lib Modules

**`frontend/lib/gemma.ts`** — Gemma E2B wrapper
- Load model via Transformers.js v4 + WebGPU
- Manage conversation context (system prompt + rolling history)
- Process audio input → text output
- API: `init(persona, memories)`, `processAudio(chunk) → string`

**`frontend/lib/call-engine.ts`** — Call orchestrator
- Turn-taking state machine (IDLE → LISTENING → THINKING → SPEAKING)
- VAD / silence detection (1.5s threshold)
- Timer management (7 min default, wrap-up injection at 6 min)
- Coordinates Gemma, ElevenLabs TTS, mic/speaker

**`frontend/lib/elevenlabs-tts.ts`** — Streaming TTS client
- Input: text + `voice_id` → streams audio via ElevenLabs API
- Playback via `AudioContext`
- Signals playback completion (triggers mic re-open)

### New Components

**`ContactsPage`** — princess contact list/grid
**`CallScreen`** — full-screen call UI with state animations
**`ModelLoader`** — download progress bar, cache check, `isReady` state

### Navigation

- New "Call" entry in main navigation, sibling to story flow
- Only visible on WebGPU-capable devices (`navigator.gpu` check)

## Device Support

| Device | Support |
|---|---|
| iPad Pro (iPadOS 26+) | Yes — WebGPU in Safari 26 |
| iPhone 17 (iOS 26+) | Yes — WebGPU in Safari 26 |
| Chrome desktop | Yes — WebGPU since v113 |
| Older iOS / Android | No — feature hidden |

Feature gated by runtime `navigator.gpu` check. No fallback to server-side inference.

## Cost Estimate

| Component | Monthly Cost |
|---|---|
| Gemma E2B (browser) | $0 |
| STT (Gemma native audio) | $0 |
| ElevenLabs TTS streaming | ~$15-25 |
| Backend (2 API calls/session) | Negligible |
| **Total** | **~$15-25/month** |

Based on 2 children × ~7 min/day × 30 days = ~420 min/month of TTS output.

## ElevenLabs API Key Handling

The ElevenLabs API key currently lives server-side (`ELEVENLABS_API_KEY` in backend `.env`). The frontend now needs to call ElevenLabs TTS directly from the browser. Two options:

**Chosen approach: Backend-proxied TTS.** The frontend sends princess text to a new backend endpoint `POST /call/tts` which proxies to ElevenLabs and streams audio back. This keeps the API key server-side and allows rate-limiting per child.

```
Frontend → POST /call/tts { text, voice_id } → Backend → ElevenLabs → streamed audio back to frontend
```

This adds one more backend endpoint but avoids exposing the API key to the client. Latency impact is minimal since it's a streaming proxy (first byte still arrives quickly).

## Constraints

- English only
- WiFi required (no offline mode)
- WebGPU-capable devices only
- 7-minute default session limit
- No video — voice only
