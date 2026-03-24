# Audio Player — Real Story Text & Duration
**Date:** 2026-03-24
**Status:** Approved

## Overview

The `AudioPlayer` component currently displays mock transcript text and a hardcoded "Runtime: 7 mins" label. This spec covers replacing both with real data: the generated `story_text` from the backend, and the actual audio duration derived from the `<audio>` element.

---

## Problem

| Location | Current (mock) | Target (real) |
|---|---|---|
| `AudioPlayer.tsx:129` | `"Runtime: 7 mins"` (hardcoded) | `"Runtime: 3:42"` derived from `duration` state |
| `AudioPlayer.tsx:133–137` | 3 placeholder paragraphs | `story_text` from the API |
| `AudioPlayer.tsx:157` | `7:00` fallback | `--:--` or loading placeholder until audio metadata loads |

---

## Architecture

### New backend endpoint

```
GET /story/today/{princess}
→ 200: { audio_url: str, story_text: str }
→ 404: story not yet generated for today
```

- Query: `SELECT audio_url, story_text FROM stories WHERE date = today AND princess = {princess}`
- No schema changes needed — `story_text` column already exists

### Frontend data flow

```
play/[princess]/page.tsx mounts
  → calls fetchStory(princess)  [new fn in lib/api.ts]
  → shows loading spinner while fetching
  → passes { audioUrl, storyText } to <AudioPlayer>
```

---

## Component Changes

### `lib/api.ts`

Add:
```ts
export async function fetchStory(princess: Princess): Promise<{ audio_url: string; story_text: string }> {
  const res = await fetch(`${API_URL}/story/today/${princess}`);
  if (!res.ok) throw new Error('Story not found');
  return res.json();
}
```

### `play/[princess]/page.tsx`

- Add `useState` for `{ audioUrl, storyText }` and `loading`
- `useEffect` on mount: call `fetchStory(princess)`, set state
- Pass `storyText` to `<AudioPlayer>` as new prop
- Render a simple loading div while fetching

### `AudioPlayer.tsx`

- Add `storyText: string` to `Props`
- Replace mock paragraphs with `storyText` (render as a single `<p>` — ElevenLabs audio tags like `[PROUD]` should be stripped or rendered as-is)
- Fix "Runtime" label: format `duration` state as `m:ss` using a helper `formatTime(seconds)`
- Footer fallback: show `--:--` instead of `7:00` when `duration === 0`

---

## Duration Format Helper

```ts
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
```

Used for both the "Runtime" header label and the footer progress timestamps.

---

## ElevenLabs Audio Tags

The `story_text` stored in Supabase contains ElevenLabs Expressive Mode audio tags (e.g. `[PROUD]`, `[CALM]`). These are voice-direction markers and should be stripped before display.

Strip pattern: remove all `[ALL_CAPS]` tokens from the text before rendering.

---

## Loading & Error States

- **Loading**: play page shows a simple centered spinner / "Loading your letter..." message
- **404 / error**: show the existing soft error treatment from the design spec — "Elsa's letter is on its way — try again in a moment 💌"

---

## Files Changed

| File | Change |
|---|---|
| `backend/main.py` | Add `GET /story/today/{princess}` endpoint |
| `frontend/lib/api.ts` | Add `fetchStory()` function |
| `frontend/app/[locale]/play/[princess]/page.tsx` | Fetch story on mount, pass to AudioPlayer |
| `frontend/components/AudioPlayer.tsx` | Accept `storyText` prop, fix duration display, strip audio tags |

---

## Out of Scope

- No changes to story generation pipeline
- No changes to how `audio_url` is passed (still via search param from inbox → play page)
- No scroll-sync between audio progress and transcript position
