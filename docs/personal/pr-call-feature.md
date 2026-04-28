# PR #6 — Title and Body

Copy the title below into the PR title field, and the body below into the PR description, then delete this file.

---

## Title

```
feat: voice-call feature (ElevenLabs Convai, Flutter mobile)
```

---

## Body

```markdown
## Summary

Rebuilds the child-facing princess voice-call feature (removed in `f98ec66`) using ElevenLabs Conversational AI instead of the original local Gemma E2B model. Children tap a character in a new Call tab on the Flutter mobile app and have a live spoken conversation.

Design: [`docs/superpowers/specs/2026-04-22-call-feature-design.md`](docs/superpowers/specs/2026-04-22-call-feature-design.md)
Plan: [`docs/superpowers/plans/2026-04-22-call-feature.md`](docs/superpowers/plans/2026-04-22-call-feature.md)
Implementation blog: [`docs/blogs/2026-04-22-call-feature-implementation.md`](docs/blogs/2026-04-22-call-feature-implementation.md)

## What's in the PR

**Backend (FastAPI):**
- `calls` table migration (`backend/db/migrations/006_*`)
- `backend/services/elevenlabs_convai.py` — signed-URL mint wrapper (API key stays server-side)
- `POST /call/start` — per-call persona + memory injection, 3/day cap from 3 AM local boundary, 5-min `max_duration_seconds`
- `POST /webhooks/elevenlabs/conversation` — HMAC-verified, idempotent, persists transcript + triggers mem0 extraction
- `GET /admin/children/{child_id}/calls` — admin call history endpoint

**Personas:**
- All 12 YAMLs extended with `call_system_prompt` + `call_first_message` (EN + VI)
- Shared RULES block (turn-taking, child-safety guardrails, no PII, graceful 4:30 wrap-up)
- Parametrized schema test

**Admin UI:**
- `/users/[id]/children/[childId]/calls` page with expandable transcripts
- Link from UsersTable expanded-child row

**Mobile (Flutter):**
- Third "Call" tab in bottom nav, new routes (`/home/call`, `/call/:princess`)
- `CallContactsScreen` (favorites list) + `CallScreen` (5-min countdown, mute, end, error scenes)
- `CallProvider` Riverpod state machine + `CallApi` HTTP wrapper
- `ElevenLabsConvaiClient` WebSocket wrapper + `PcmAudioSink` for streaming PCM playback via `mp_audio_stream`
- Explicit `permission_handler.Permission.microphone.request()` on call start; mute actually skips mic-chunk send
- iOS `NSMicrophoneUsageDescription` + Android `RECORD_AUDIO`

**Ops:**
- `ELEVENLABS_AGENT_ID`, `ELEVENLABS_WEBHOOK_SECRET` in `docker-compose.yml`, `backend/.env.example`, `CLAUDE.md`

## Key design choices

- **One shared Convai agent, overrides per call** — keeps persona YAML the source of truth, no dashboard sync per character
- **Webhook-driven transcript persistence** — survives mobile app kill mid-call
- **Defense-in-depth on duration** — mobile UI countdown + ElevenLabs `max_duration_seconds=300` server-side
- **Favorites-only contact list** — matches Q4 design decision; no choice paralysis for the child
- **Image-first kid UX** — 7 scene descriptions in the spec for Nanobanana (placeholder paths in code)

## Test plan

Automated (all green):
- [x] `cd backend && uv run pytest tests/` — 159 passed
- [x] `cd mobile && flutter test` — 45 passed
- [x] `cd mobile && flutter analyze` — no issues
- [x] `cd admin && pnpm vitest run tests/CallsPage.test.tsx` — 2 passed

Manual smoke test (required before merge — Task 18):
- [ ] Create Convai agent in ElevenLabs dashboard; set `ELEVENLABS_AGENT_ID`
- [ ] Configure post-call webhook + `ELEVENLABS_WEBHOOK_SECRET`
- [ ] End-to-end call on physical iPhone + physical Android device
- [ ] Verify: `calls` row reaches `state='completed'`, transcript populated, mem0 stores extracted memory, admin UI shows the call
- [ ] Vietnamese voice-quality check per character; flag any unusable voices as follow-up
- [ ] Generate the 7 kid-facing scene illustrations via Nanobanana (spec §6) and drop into `mobile/assets/images/call/`

## Known follow-ups (non-blocking)

- Daily-cap TOCTOU window between `SELECT COUNT(*)` and `INSERT` — 100-500ms during ElevenLabs round-trip. Fix with a UNIQUE-partial-index or `SELECT FOR UPDATE` if concurrent calls become a real issue.
- Nanobanana image assets still pending (feature ships functional without them; Flutter falls back to broken-image placeholders).
- 11 non-Belle persona prompts are iterable content — ship, then tune per character based on real call transcripts.

23 commits, 52 files changed, ~2,454 insertions.
```
