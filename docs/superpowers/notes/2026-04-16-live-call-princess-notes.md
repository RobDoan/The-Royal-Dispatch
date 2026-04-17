# Live Call with Princess — Decision Notes & Blog Material

## The Idea

Add a "live call" feature to The Royal Dispatch where children can have a real-time voice conversation with their favorite princess character. The app already has per-child memory (preferences, habits, milestones via Mem0) and 12 princess personas with ElevenLabs voice IDs — so the princess can remember and personalize the conversation.

## Approach Exploration

### Option 1: ElevenLabs Conversational AI (Full Agent)

**What it is:** ElevenLabs offers a turnkey real-time voice agent product that handles STT + LLM + TTS in one API — full duplex voice conversation out of the box.

**Pros:**
- Fastest path to v1 — handles audio streaming, turn-taking, voice activity detection
- Already using ElevenLabs for story TTS, so voice IDs are ready
- No need to manage WebSocket audio, silence detection, etc.

**Cons — Cost:**
- $0.10/min (Pro) or $0.08/min (Business annual)
- For 2 kids × 5-10 min/day: **~$40-60/month** (including LLM pass-through costs)
- LLM costs are passed through separately (~10-30% on top)
- Less control over the LLM layer (harder to inject custom memory/persona prompts)

### Option 2: Gemma 4 E2B in Browser + ElevenLabs TTS (Chosen)

**What it is:** Run Google's Gemma 4 E2B model directly in the browser via WebGPU for conversation intelligence, and use ElevenLabs streaming TTS only for the princess voice output.

**Key discovery — Gemma 4 E2B has native audio input:**
- Gemma 4 E2B (2.3B effective parameters, ~500MB quantized) is a multimodal model that accepts audio, image, and text inputs
- It has a redesigned audio encoder (50% smaller than Gemma 3N) with 40ms frame duration for low-latency speech recognition
- This eliminates the need for a separate Speech-to-Text service entirely
- **However:** Gemma 4 E2B generates text output only — no audio output generation

**Architecture:**
```
Child speaks into mic
  → [Browser: Gemma E2B via WebGPU] audio in → understands speech → generates text response
  → [ElevenLabs Streaming TTS API] text → princess voice audio
  → Child hears princess respond
```

**Pros:**
- LLM runs in browser — **$0 LLM cost**
- Native audio input — **$0 STT cost**
- Full control over persona prompts, memory injection, conversation flow
- Privacy: child's speech never leaves the device (processed locally by Gemma)
- Great learning opportunity for on-device AI / WebGPU inference
- Only pay for TTS output: **~$15-25/month** estimated

**Cons:**
- More complex to build (WebGPU setup, audio pipeline, turn management)
- Requires device with WebGPU support (modern Chrome/Edge, decent GPU)
- Initial model download (~500MB) on first use
- 2.3B model is less capable than cloud LLMs for nuanced conversation — but likely sufficient for children's bedtime chat
- Latency: on-device inference + TTS streaming adds up; needs optimization

### Option 3: Self-hosted Gemma (server) + Whisper + ElevenLabs TTS (Considered, not chosen)

Would run Gemma on a server (e.g., E2B cloud sandbox or own GPU). More capable than browser but adds server costs and complexity. Didn't pursue because the whole point was low cost and Gemma E2B is designed for on-device use.

## Why We Chose Option 2

1. **Cost**: ~$15-25/mo vs ~$40-60/mo (ElevenLabs agent) — roughly 60% cheaper
2. **Privacy**: Children's voice stays on-device — never sent to a cloud STT service
3. **Control**: Full control over persona system prompts, memory context injection, and conversation behavior
4. **Learning**: The user wants to learn Gemma 4 and WebGPU inference — this is a hands-on project
5. **Existing infrastructure**: 12 personas with ElevenLabs voice_ids already configured, per-child memory via Mem0 already working

## Existing Infrastructure (What We Can Reuse)

- **12 personas** (Disney + Paw Patrol) with `voice_id`, `tone_style`, `signature_phrase`, `metaphor` in YAML files
- **Per-child memory** via Mem0 + Qdrant — `child_id` as user_id, stores preferences, habits, milestones, social patterns
- **ElevenLabs integration** — client singleton, streaming TTS already implemented (`synthesize_voice_stream()`)
- **Frontend** — Next.js PWA with princess picker, audio player, toddler lock
- **Auth** — HMAC-signed tokens per parent, child_id scoping throughout

## Device Support Decision

**Target devices:** iPad Pro, iPhone 17, desktop Chrome

**WebGPU status (as of April 2026):**
- Safari 26 (iOS 26 / iPadOS 26): WebGPU enabled by default
- Chrome desktop: fully supported since v113
- Apple devices lead in inference speed due to vertical integration
- Gemma 4 E2B fits in <1.5GB memory with quantization — well within modern Apple device capabilities

**Decision:** Only enable the "Call Princess" feature on devices with WebGPU support. Detect at runtime via `navigator.gpu` and show/hide the feature accordingly. No fallback to server-side inference — keep it simple.

## Design Decisions Made During Brainstorming

- **Language:** English only for calls — simplifies Gemma + ElevenLabs quality
- **Princess behavior:** In-character + light educational (counting, colors, simple questions) — not pure roleplay
- **Session timer:** 7 minutes default, princess wraps up naturally at 6:00 mark
- **Memory loop:** Fetch memories at call start, extract new memories from transcript at call end (mirrors existing brief → story flow)
- **Connectivity:** WiFi required, no offline mode needed
- **Call UX:** Dedicated "contacts" page listing princess contacts, separate from story flow
- **Parent controls:** Toddler-lock pattern (1s hold) to reveal End Call button
- **Model download:** Cached after first download via Cache API / IndexedDB, progress bar UX

## Open Questions Resolved

| Question | Resolution |
|---|---|
| Initial model download UX | Progress bar: "Downloading [Princess]'s magic..." — cached after first time |
| Latency profile | ~2-3s estimated (Gemma ~1.5s + TTS first byte ~500ms) — acceptable for kid conversation pace. "Thinking sparkle" animation during wait |
| Context window management | Rolling window: system prompt + memories (~2K) + last ~20 turns. 10 min chat ≈ 5K tokens, well within 128K |
| Turn-taking | 1.5s silence threshold via Gemma's audio encoder. Princess prompts after 10s silence |
| Safety / content filtering | System prompt constrains: age-appropriate only, never break character, never mention AI, redirect inappropriate content kindly |
| Battery drain | 7-minute timer naturally limits session length |
