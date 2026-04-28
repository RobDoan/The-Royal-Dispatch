# Call Feature — Launch Checklist

**PR #6 is merged to `main`** (merge commit `ae5f21f`, 23 commits, 52 files, ~2,454 insertions).

This file tracks everything still needed before the feature works end-to-end for Emma. Delete this file once complete.

---

## 1. Pre-flight (required — feature will 503 until done)

### ElevenLabs dashboard

- [ ] Create one Conversational AI agent. Any placeholder voice + prompt + first_message — backend overrides all three per call. Copy the **agent ID**.
- [ ] Configure the **post-call webhook**:
  - URL: `https://<your-backend>/webhooks/elevenlabs/conversation`
  - Generate a shared secret (random 32-byte hex). Copy it.

### Backend environment

- [ ] Add to local `backend/.env` and production env store:
  ```
  ELEVENLABS_AGENT_ID=<from step 1>
  ELEVENLABS_WEBHOOK_SECRET=<from step 2>
  ```
- [ ] Confirm `ELEVENLABS_API_KEY` is also set (it's reused for the signed-URL mint — should already be there from the letter feature).

### Database migration

- [ ] Verify migration `006_create_calls` ran against dev and prod Postgres. Docker + golang-migrate handles this automatically on `docker compose up`, but confirm with:
  ```
  docker compose exec postgres psql -U royal -d royal_dispatch -c "\d calls"
  ```
  Expected: `calls` table with 11 columns and `idx_calls_child_started` index.

---

## 2. Assets (Nanobanana image generation)

Scene descriptions live in the design spec (`docs/superpowers/specs/2026-04-22-call-feature-design.md` §6). Generate from those prompts, drop into the target paths below.

### Kid-facing scenes (7 images)

- [ ] `mobile/assets/images/call/call-mic-permission.png` — magic wand microphone at castle window
- [ ] `mobile/assets/images/call/call-daily-cap.png` — three golden envelopes + sleeping moon
- [ ] `mobile/assets/images/call/call-friends-sleeping.png` — princesses asleep in glass slippers
- [ ] `mobile/assets/images/call/call-ended.png` — princess waving goodbye from closing storybook
- [ ] `mobile/assets/images/call/call-dropped.png` — rippling magic mirror with fading silhouette
- [ ] `mobile/assets/images/call/call-in-progress-{princess}.png` — **12 images, one per character** (ariel, belle, chase, cinderella, elsa, marshall, mirabel, moana, rapunzel, raya, rubble, skye)

### New icon assets (2 images)

- [ ] `mobile/assets/icons/call-3d.png` — third bottom-nav tab icon (phone-handset styled like scepter/crown)
- [ ] `mobile/assets/icons/scepter-call.png` — the per-row call button inside `CallContactsScreen`

### Verify existing assets

- [ ] `mobile/assets/princesses/{princess}.png` — used as contact-row avatars. Should already exist from the letter feature. Confirm all 12 are present.

---

## 3. Manual smoke test (Task 18)

Run after all of §1 and §2 are done. This is the merge gate for real-device release.

- [ ] Seed a test child with at least one favorite princess in that child's preferences (check via admin UI).
- [ ] Fresh install on physical **iPhone**:
  - [ ] First call → OS mic permission prompt appears → accept → call connects → voice plays → mic captures
  - [ ] End call → princess wraps up gracefully
- [ ] Fresh install on physical **Android**:
  - [ ] Same flow as iPhone
- [ ] Verify backend state after one call:
  ```
  docker compose exec postgres psql -U royal -d royal_dispatch -c \
    "SELECT princess, state, duration_seconds, ended_reason, transcript IS NOT NULL as has_transcript FROM calls ORDER BY started_at DESC LIMIT 1;"
  ```
  Expected: `state = completed`, `duration_seconds > 0`, `has_transcript = t`.
- [ ] Open admin UI → user → child → "View call history" → confirm the call row appears with expandable transcript.
- [ ] During the smoke call, say one memorable thing (e.g. "I got a new hamster named Pip"). After the webhook fires, run a follow-up story and confirm the princess references it (memory extraction worked).
- [ ] **Vietnamese voice quality check** — repeat one call per character in `vi` locale. Document any voice that's unusable in Vietnamese. If any fail, file follow-up to add a `voice_id_vi` field per persona YAML.

---

## 4. Non-blocking follow-ups

File these as GitHub issues when they come up:

- **Daily-cap TOCTOU race.** `SELECT COUNT(*)` and `INSERT INTO calls` straddle a ~100–500ms ElevenLabs round-trip. Two concurrent `/call/start` calls could both pass the cap. Fix with UNIQUE partial index or `SELECT ... FOR UPDATE` on the children row.
- **Logical-day boundary unit test.** `_logical_day_start_utc` (backend/routes/call.py) has a non-trivial DST-aware branch with no direct test. Add one.
- **Minor cleanups in `backend/routes/call.py`:**
  - Imports at the bottom of the file (lines ~151–157, 173–174) should move to the top (PEP 8).
  - Stale module docstring still says "webhook handler added in Task 6".
  - Unused `from unittest.mock import patch` in `backend/tests/test_call_routes.py`.
- **Persona prompt tuning.** 11 non-Belle characters' prompts are iterable content — tune based on real call transcripts after a week of use.
- **Memory prompt still has a placeholder line in Vietnamese YAML files if any persona was written without the sentinel.** Schema test catches missing fields but not missing sentinels. Consider adding a test that verifies each persona contains the replacement sentinel.

---

## 5. Housekeeping

- [ ] Delete `docs/pr-call-feature.md` (temp PR body file)
- [ ] Delete this file (`docs/call-feature-launch-checklist.md`) once all items above are complete
- [ ] Locally: `git checkout main && git pull`
- [ ] Optionally delete merged branch: `git branch -d feat/call-feature && git push origin --delete feat/call-feature`
