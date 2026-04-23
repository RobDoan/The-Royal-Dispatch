# Call Feature (v2) — Design

**Status:** Draft, awaiting user review
**Date:** 2026-04-22
**Supersedes:** The deleted v1 call feature (commit `f98ec66`, "remove call feature")

---

## 1. Summary

Re-introduce a voice-call experience to The Royal Dispatch: a child taps a princess in a new "Call" tab on the Flutter mobile app and has a live spoken conversation with her. The first attempt shipped a browser-side local LLM (Gemma E2B) and was removed because the iPad Safari tab ran out of memory while loading the model. This design replaces that approach with [ElevenLabs Conversational AI](https://elevenlabs.io/docs/conversational-ai/overview), a managed realtime STT→LLM→TTS service, connected over a backend-minted signed WebSocket URL.

The feature reuses the existing persona YAML files, the mem0 memory layer, the HMAC-signed auth token, and the admin UI patterns. The new surface area is three backend endpoints, one mobile tab, one admin page, two new fields per persona YAML, and one database migration.

## 2. Goals and non-goals

### Goals

- A child in the mobile app can pick a favorite character and have a 5-minute (or shorter) voice conversation with them.
- The character speaks in their assigned ElevenLabs voice and stays in-persona using per-call prompt injection.
- The character has access to the child's accumulated memories (preferences, habits, milestones) just like the letter flow does.
- Anything notable the child says during the call is extracted back into the memory layer.
- Parents can review call history (date, character, duration, transcript) in the admin UI.
- Hard per-call and per-day limits are enforced server-side; cost is bounded by design.
- Kid-facing screens are image-first because the target user cannot read.
- English and Vietnamese are both supported.

### Non-goals (for v1 of this design)

- No parent-configurable per-child limits. Defaults (5 min/call, 3 calls/day) are hardcoded. Admin UI override can be added later if actually needed.
- No daily digest / Telegram summary of calls to parents. Transcripts land in admin UI only.
- No call recording playback for the kid.
- No multi-party calls or "call all princesses."
- No fallback TTS if ElevenLabs is down — the call feature simply shows a "friends are sleeping" state.
- No retry/backfill for missed webhooks. A `calls` row stuck in `state='started'` is acceptable for v1.

## 3. Architecture

### 3.1 Topology

```
Mobile (Flutter)
  │
  │  HTTPS  POST /call/start  (auth: signed token, same as existing endpoints)
  ▼
Backend (FastAPI) ──────────────────►  PostgreSQL   (insert calls row)
  │                                 ──►  mem0/Qdrant (load memories)
  │
  │  HTTPS  POST /v1/convai/conversation/get-signed-url
  ▼
ElevenLabs Convai
  │
  │  returns signed wss:// URL (single-use, short TTL)
  ▼
Backend ──► returns signed URL to Mobile
  │
Mobile ──── WebSocket ────► ElevenLabs (audio in/out, ~600ms per turn)
                                │
                                │  on conversation end
                                ▼
                          POST /webhooks/elevenlabs/conversation  (HMAC-verified)
                                │
                                ▼
                          Backend: persist transcript + extract memories via mem0
```

### 3.2 Key decisions

**One shared ElevenLabs agent, per-call overrides.** A single agent is pre-created in the ElevenLabs dashboard. At the moment of `/call/start`, the backend injects the specific character's voice, system prompt, first message, and that child's memories as `overrides`. The persona YAML files remain the source of truth. Adding a character is a YAML file, not a dashboard change.

**Signed URL minted by backend.** The ElevenLabs API key never leaves the server. The mobile app receives a short-lived WebSocket URL and nothing else. This is also what makes per-call persona injection possible.

**Webhook-driven persistence.** ElevenLabs POSTs the final transcript to a backend webhook when the conversation ends. The backend persists the `calls` row update and runs mem0 extraction. Transcripts survive the mobile app being killed at any point.

**Defense-in-depth on call duration.** Hard cap enforced in two places: the mobile UI auto-closes the socket at 5:00, and ElevenLabs enforces `max_duration_seconds=300` server-side via the per-call override. A third limit (3 calls/day per child) is enforced at `/call/start` with a simple count query against the `calls` table, using the existing 3 AM logical-day boundary.

**No client-side transcripts.** The mobile app never reads or stores the transcript. That's the backend's job via the webhook.

## 4. API contracts

### 4.1 `POST /call/start`

**Auth:** Signed token (same HMAC scheme as existing `/user/me`, `/story`).

**Request body:**
```json
{
  "child_id": "uuid",
  "princess": "belle",
  "locale": "en"
}
```

**Responses:**

- `200 OK`
  ```json
  {
    "conversation_id": "elevenlabs_conv_id",
    "signed_url": "wss://api.elevenlabs.io/v1/convai/conversation?signature=...",
    "expires_at": "2026-04-22T18:05:00Z",
    "princess_display_name": "Belle",
    "max_duration_seconds": 300
  }
  ```
- `403 forbidden` — princess is not in this child's favorites (defense-in-depth; UI shouldn't allow it).
- `404 not_found` — `child_id` doesn't belong to the caller's parent record.
- `409 daily_cap_reached` — child has already completed or started 3 calls since 3 AM logical-day boundary.
- `503 upstream_unavailable` — ElevenLabs signed-URL mint failed. No `calls` row is inserted.

**Backend handler flow:**
1. Resolve parent from token. Confirm `child_id` belongs to parent.
2. Load `backend/personas/{princess}.yaml`. 404 if not found.
3. Confirm `princess` is in `children.favorite_princesses` for this child.
4. Count calls since `get_logical_date_iso(user_tz) + 03:00:00`. If ≥ 3, return 409.
5. Load child name from DB.
6. Call `fetch_memories({"child_id": child_id, "brief": "__fallback__"})` — reused from story flow.
7. Build override payload (see 4.2).
8. POST to ElevenLabs `/v1/convai/conversation/get-signed-url?agent_id={ELEVENLABS_AGENT_ID}` with override payload. On non-2xx, return 503.
9. `INSERT INTO calls (child_id, princess, locale, conversation_id, state) VALUES (..., 'started')`.
10. Return signed URL + metadata.

### 4.2 ElevenLabs override payload

```python
overrides = {
    "agent": {
        "prompt": {
            "prompt": persona.call_system_prompt[locale]
                     + "\n\nWhat I remember about you:\n"
                     + memories
        },
        "first_message": persona.call_first_message[locale].replace("{child_name}", child_name),
        "language": locale,
    },
    "tts": {
        "voice_id": persona.voice_id
    },
    "conversation": {
        "max_duration_seconds": 300
    }
}
```

The exact ElevenLabs override schema should be verified against their current Convai API docs at implementation time; the shape above is the expected structure based on their public documentation as of 2026-04.

### 4.3 `POST /webhooks/elevenlabs/conversation`

**Auth:** HMAC-SHA256 of raw body against `ELEVENLABS_WEBHOOK_SECRET`, sent by ElevenLabs in a header (name per their webhook spec, e.g. `X-Elevenlabs-Signature`). Timing-safe comparison. 401 on mismatch.

**Request body (shape from ElevenLabs):**
```json
{
  "conversation_id": "...",
  "duration_seconds": 252,
  "ended_reason": "user_ended" | "timeout" | "agent_ended" | "error",
  "transcript": [
    {"role": "user", "text": "...", "time": 0.0},
    {"role": "agent", "text": "...", "time": 1.2}
  ]
}
```

**Handler flow:**
1. Verify HMAC. 401 on failure.
2. `UPDATE calls SET state='completed', ended_at=now(), duration_seconds=?, transcript=?, ended_reason=? WHERE conversation_id=?`.
3. If row not found, log a warning and return `200 {"status": "ignored"}`. (Returning a non-2xx would cause ElevenLabs to retry forever; we swallow the unknown conversation instead.)
4. Call `extract_memories_from_transcript(child_id, transcript)` — identical in spirit to the v1 helper, scoped by `child_id`, failing gracefully if mem0/Qdrant is unreachable.
5. Return `200 {"status": "ok"}`.

**Idempotency:** UPDATE is naturally idempotent (matches on `conversation_id`). mem0 extraction is naturally idempotent (mem0 dedupes on content). ElevenLabs retries on non-2xx responses without any special handling.

### 4.4 `GET /admin/children/{child_id}/calls`

**Auth:** Admin auth (same as existing admin endpoints).

**Query params:** `limit` (default 50), `offset` (default 0).

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "princess": "belle",
      "locale": "en",
      "state": "completed",
      "started_at": "2026-04-22T18:00:00Z",
      "ended_at": "2026-04-22T18:04:12Z",
      "duration_seconds": 252,
      "ended_reason": "user_ended",
      "transcript": [...]
    }
  ],
  "total": 7
}
```

Ordered `started_at DESC`.

## 5. Components

### 5.1 Backend (`backend/`)

- **`routes/call.py`** — recreated. Implements `POST /call/start` and `POST /webhooks/elevenlabs/conversation`. Reuses `nodes/load_persona`, `nodes/fetch_memories`, `utils/mem0_client`.
- **`services/elevenlabs_convai.py`** — new, thin wrapper. Functions: `mint_signed_url(agent_id, overrides) -> (conversation_id, signed_url, expires_at)`. Kept narrow so tests mock it cleanly.
- **`routes/admin.py`** — add `GET /admin/children/{child_id}/calls`.
- **`db/migrations/00X_create_calls.up.sql`** — new migration:
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
  Down migration drops both. `child_id` is `NOT NULL` (old v1 schema allowed NULL; unnecessary now since we always know the child).
- **New env vars:** `ELEVENLABS_AGENT_ID`, `ELEVENLABS_WEBHOOK_SECRET`. Existing `ELEVENLABS_API_KEY` is reused for the signed-URL mint.

### 5.2 Persona YAML (`backend/personas/*.yaml`)

Two new top-level fields per file, authored by hand for all 12 characters before launch:

```yaml
call_system_prompt:
  en: |
    You are Belle. Speak in short, warm replies (1–3 sentences).
    [explicit child-safety guardrails, turn-taking behavior,
     what to do on silence, how to wrap up gracefully near the
     5-minute mark, refuse off-topic adult subjects, never collect
     personal information, etc.]
  vi: |
    Bạn là Belle. ...
call_first_message:
  en: "Hi {child_name}! It's Belle. What's on your mind today?"
  vi: "Chào {child_name}! Là Belle đây..."
```

`{child_name}` is the only template token. Substitution happens in Python before sending to ElevenLabs. No other runtime templating — prompts are authored statically per character.

Voice ID, tone style, signature phrase, existing letter fields are unchanged.

### 5.3 Mobile (`mobile/lib/`)

- **`screens/call_contacts_screen.dart`** — new third tab (rightmost: `Inbox | Story | Call`). Pulls child's favorites from existing `familyProvider`. One glass-morphism row per character: avatar, name, scepter-shaped call button.
- **`screens/call_screen.dart`** — fullscreen call UI. Full-bleed princess portrait, pulsing voice-activity ring, 5-minute hourglass countdown, three icon-only controls (mute, volume, end call). All error states render as scene illustrations (see Section 6).
- **`services/call_api.dart`** — wraps `POST /call/start`. Maps response/error codes to typed error reasons.
- **`services/elevenlabs_convai_client.dart`** — wrapper over `elevenlabs_convai_flutter` pub package (or direct `web_socket_channel` if the package is unmaintained at implementation time). Responsible for: connecting to signed URL, streaming mic audio out, playing incoming audio, reporting connection state.
- **`providers/call_provider.dart`** — Riverpod state machine: `idle → requesting → connecting → in_call → ending → ended | error(reason)`. Buttons disabled in all states except `idle`.
- **Platform configs:**
  - `ios/Runner/Info.plist` — `NSMicrophoneUsageDescription`.
  - `android/app/src/main/AndroidManifest.xml` — `<uses-permission android:name="android.permission.RECORD_AUDIO" />`.
- **`l10n/*.arb`** — accessibility labels in en/vi for each error state and each call row ("Call Belle" / "Gọi Belle"). On-screen copy is kept minimal because the target user cannot read.

### 5.4 Admin (`admin/`)

- **`app/[locale]/users/[id]/children/[childId]/calls/page.tsx`** — new server component. Fetches `GET /admin/children/{child_id}/calls`. Table of calls with expandable transcript JSON viewer.
- Link added on the existing child detail page: "View call history."

## 6. Error and info screens (kid-facing)

All screens are illustrated. Scene descriptions below are passed to an image generator (Nanobanana). All use the existing deep-purple/gold royal glass-morphism palette matching `mobile/lib/theme.dart` and the 2026-04-14 glassmorphism redesign spec. Each placeholder path is filled in at image generation time.

### 6.1 Microphone permission needed

> **Scene:** A small sparkling microphone shaped like a magic wand, floating in front of a glass castle window at twilight. A friendly princess silhouette is on the other side of the glass, leaning in to listen with her hand cupped to her ear. Soft golden particles drift around the wand. Deep purple sky with stars. The wand glows gently, suggesting it's waiting to be activated.

`![placeholder](TODO-images/call-mic-permission.png)`

Shown once if mic permission is denied. The wand itself is the tappable enable button. If denied again, call buttons remain grayed out; accessibility label: "Microphone is off. Ask a grown-up to turn it on."

### 6.2 Daily cap reached

> **Scene:** Three glowing golden envelopes stacked next to a sleeping crescent moon wearing a tiny crown. The moon has its eyes gently closed and a small "zzz" trail of gold dust. Behind the moon, a soft purple night sky with constellations forming the silhouettes of three princess crowns. Cozy, contented mood, not punishing.

`![placeholder](TODO-images/call-daily-cap.png)`

Shown when `/call/start` returns `409 daily_cap_reached`. No on-screen buttons; back gesture returns to Contacts. A11y: "You've called your friends three times today. Come back tomorrow."

### 6.3 Friends are sleeping (network / service unreachable)

> **Scene:** A row of princess and character silhouettes peacefully asleep in glass slipper-shaped beds floating in a starry purple sky. Each has a tiny golden Z floating above. A soft glowing crescent moon watches over them. Cozy, dreamy.

`![placeholder](TODO-images/call-friends-sleeping.png)`

Shown when `/call/start` fails with network error or 5xx, or when the WebSocket fails to connect within 10 seconds. Single glowing star-shaped "try again" button.

### 6.4 In-call screen

> **Scene:** Full-bleed portrait of the specific princess being called, rendered in the same illustrated style as her contact-list avatar but at full size. She's facing the camera with a mid-conversation expression (gentle smile, looking at the viewer). Behind her: her signature setting (Belle → library, Elsa → ice palace, Moana → ocean) softly blurred with glass-morphism overlay. A pulsing golden ring around her shoulders syncs with her voice activity. Bottom of screen: a subtle 5-minute hourglass progress (sand draining from gold to purple).

`![placeholder](TODO-images/call-in-progress-{princess}.png)` — one per character (12 total).

Live screen during call. Three icon-only controls: mute (microphone wand), end (red glass heart that breaks on tap), volume.

### 6.5 Call ended (graceful)

> **Scene:** The princess waves goodbye from inside a closing storybook. Pages of the book gently flutter shut, golden sparkles trailing from her hand. A small "see you soon" heart drifts up.

`![placeholder](TODO-images/call-ended.png)`

Shown for ~3 seconds when call ends normally (user-ended or 5-min timeout), then auto-returns to Contacts.

### 6.6 Call dropped

> **Scene:** A magic mirror with a gentle ripple across its surface, as if someone just stepped away from it. The princess's faint silhouette is fading on the other side. A small glowing star sits in the corner, pulsing — the "call back" affordance.

`![placeholder](TODO-images/call-dropped.png)`

Shown when the WebSocket closes before the user hits end and before the 5-minute mark. Tap the star to retry the same character. Backend webhook still receives the partial transcript.

### 6.7 Contact row (not an error, specified here for completeness)

> **Scene (per row):** Glass-morphism card. Left: round avatar of the character (~64 px, existing illustrated style from the story feature). Center: character name in gold serif. Right: a glowing golden phone-handset icon shaped like a tiny scepter — the call button. Soft purple gradient background, subtle gold border, gentle shadow.

`![placeholder](TODO-images/call-contacts-row-{princess}.png)` — character avatars reuse existing story-feature illustrations; only the scepter call-button icon is new art.

## 7. Security

- **API key isolation:** `ELEVENLABS_API_KEY` lives only in the backend environment. Mobile never sees it.
- **Signed URL lifetime:** Short (typically a few minutes, per ElevenLabs default); single-use. Expiry is enforced by ElevenLabs.
- **Per-call authorization:** Backend verifies the parent's signed token AND that the requested `child_id` belongs to them AND that the requested `princess` is in that child's favorites. A compromised mobile token cannot mint calls for someone else's child or for an unapproved character.
- **Webhook auth:** HMAC-SHA256 over raw body with `ELEVENLABS_WEBHOOK_SECRET`. Timing-safe compare. Distinct from `N8N_SHARED_SECRET` and `AUTH_SECRET` — each trust boundary gets its own key.
- **Rate limiting:** 3 calls/day per child at `/call/start`. No per-parent global rate limit in v1 (multi-kid households would be penalized). Adequate for launch.
- **Transcript data:** Stored in `calls.transcript` as JSONB. Visible only via admin UI, which is already auth-gated. No PII beyond what the child voluntarily says in conversation; the system prompt instructs agents not to solicit personal info.

## 8. Testing strategy

### Backend (`backend/tests/`)

- `test_call_routes.py`:
  - `test_start_returns_signed_url` — happy path; mocks `services/elevenlabs_convai.mint_signed_url`; asserts `calls` row inserted in state `started`; asserts override payload contains correct `voice_id`, `system_prompt` with persona's `call_system_prompt.en` AND the memories block, `first_message` with `{child_name}` substituted, `language="en"`, `max_duration_seconds=300`.
  - `test_start_localizes_for_vi` — `locale="vi"` → asserts `call_system_prompt.vi` and `call_first_message.vi` are used.
  - `test_start_rejects_unknown_child` — 404.
  - `test_start_rejects_non_favorite_princess` — 403.
  - `test_start_enforces_daily_cap` — pre-insert 3 calls for child today → 409. Edge: 4th call submitted right after 3 AM logical-day reset in user's timezone → succeeds (uses `get_logical_date_iso`).
  - `test_start_handles_elevenlabs_failure` — mock returns 5xx → backend returns 503, no `calls` row inserted (transactional).
  - `test_webhook_verifies_hmac` — wrong signature → 401, row unchanged.
  - `test_webhook_persists_transcript_and_extracts_memories` — valid HMAC → row updated to `completed`; `transcript`, `duration_seconds`, `ended_reason` set; `extract_memories_from_transcript` called with correct `child_id`.
  - `test_webhook_is_idempotent` — same payload twice → second call is a no-op.
  - `test_webhook_handles_unknown_conversation_id` — returns `200 {"status": "ignored"}`, logs a warning, no crash, no retries triggered.
  - `test_admin_lists_calls_for_child` — inserts 3 calls, asserts DESC by `started_at`, transcript JSON included.
- `test_persona_yamls_have_call_fields.py` — parametrized over all 12 YAML files. Asserts `call_system_prompt.en`, `call_system_prompt.vi`, `call_first_message.en`, `call_first_message.vi` are present and non-empty. Catches drift if a new persona is added without conversation fields.

### Mobile (`mobile/test/`)

- `providers/call_provider_test.dart` — state machine transitions happy path + each error path landing in `error(reason)` with correct reason (`mic_denied`, `daily_cap`, `network`, `dropped`).
- `services/call_api_test.dart` — `POST /call/start` happy path + 409/403/503 mapping to the right error reasons.
- `screens/call_contacts_screen_test.dart` — renders one row per favorite; tap fires `start_call` with the right princess; buttons disabled while state ≠ `idle`.
- `widget/call_screen_test.dart` — countdown reaches 0 triggers `endCall`; mute toggles; end button transitions to `ending`.

### Admin (`admin/tests/`)

- `pages/calls.test.tsx` — renders fetched calls, expand toggle reveals transcript, empty state when child has no calls.

### Manual smoke (documented, not automated)

- One real end-to-end call against the dev ElevenLabs agent: confirm webhook arrives, transcript populated, mem0 stores an extracted memory, admin UI shows the row. Run once before merging the first implementation PR.
- Microphone permission flow on a physical iPhone and a physical Android device.
- Vietnamese voice quality check: one call per character in `vi`. Document per-character quality. If a voice is unusable in Vietnamese, raise it as follow-up work (possible addition of `voice_id_vi` field — out of scope here, flagged as launch risk).

### Deliberately not testing

- ElevenLabs SDK internals.
- Subjective audio quality of TTS.
- Webhook delivery reliability — missing webhooks are an accepted v1 gap.

## 9. Rollout

- Backend and admin UI can deploy independently of the mobile app. `GET /admin/children/{id}/calls` will return an empty list until the first call is made.
- Mobile update is additive (new tab, new screens). Existing mobile users continue to work without the feature until they update.
- No feature flag. The feature is off by default because without persona YAMLs having the new fields populated, `/call/start` fails fast at persona load. We enable by landing the YAML edits last.

## 10. Open questions and future work

- **Vietnamese voice quality.** Empirical. Verified during manual smoke testing per Section 8.
- **Conversation system prompts.** One per princess, authored by hand. First launch prompts will be iterated. Treated as tuning, not spec.
- **Janitor for stuck `state='started'` rows.** If webhooks ever go missing for days, we'd want a periodic job to mark stale rows `state='timeout'`. Not built in v1.
- **Parent-configurable limits.** Deferred until there's a validated need.
- **Daily digest of calls in Telegram briefs.** Deferred.
- **Call history visibility to the child.** Not in scope.
