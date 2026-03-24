# Audio Player — Real Story Text & Duration
**Date:** 2026-03-24
**Status:** Approved

## Overview

The `AudioPlayer` component currently displays mock transcript text and a hardcoded "Runtime: 7 mins" label. This spec covers replacing both with real data: the generated `story_text` from the backend, and the actual audio duration derived from the `<audio>` element.

---

## Problem

| Location | Current (mock) | Target (real) |
|---|---|---|
| `AudioPlayer` — header runtime label | `"Runtime: 7 mins"` (hardcoded) | `"Runtime: 3:42"` derived from `duration` state |
| `AudioPlayer` — transcript area | 3 placeholder paragraphs | `storyText` prop, ElevenLabs tags stripped |
| `AudioPlayer` — footer right timestamp | `7:00` fallback | `--:--` until audio metadata loads, then `m:ss` |
| `AudioPlayer` — footer left timestamp | `0:xx` (broken for >60s) | `m:ss` using shared `formatTime` helper |

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
- Note: `GET /story/today` (no path param) already exists and returns all cached stories. FastAPI resolves static vs. parameterized segments correctly, so `/story/today` and `/story/today/{princess}` will not conflict. Both routes must remain. **The new `GET /story/today/{princess}` route must be registered after the existing `GET /story/today` route in `main.py`** — if registered before it, FastAPI will match `/story/today` requests to the parameterized route with `princess="today"`, silently breaking the existing endpoint.

### Frontend data flow

```
play/[princess]/page.tsx mounts
  → calls fetchStory(princess)  [new fn in lib/api.ts]
  → shows loading spinner while fetching
  → sets { audioUrl, storyText } from response
  → passes both to <AudioPlayer audioUrl={audioUrl} storyText={storyText} />
```

The `audioUrl` from the API response is the authoritative source on the play page. This makes the page work correctly even on a direct load or refresh (no reliance on the `?audio=` search param for rendering). The search param that was previously used as the sole source of `audioUrl` on the play page is superseded by the API response.

---

## Component Changes

### `lib/api.ts`

Add:
```ts
export async function fetchStory(princess: Princess): Promise<{ audioUrl: string; storyText: string }> {
  const res = await fetch(`${API_URL}/story/today/${princess}`);
  if (res.status === 404) throw new Error('STORY_NOT_FOUND');
  if (!res.ok) throw new Error('STORY_ERROR');
  const data = await res.json();
  return { audioUrl: data.audio_url, storyText: data.story_text };
}
```

Note: snake_case fields from the API are mapped to camelCase at the boundary here, so all frontend code uses camelCase consistently.

The play page error handler distinguishes the two error codes: `STORY_NOT_FOUND` renders the soft "on its way" message; `STORY_ERROR` (server error) renders a generic retry prompt.

### `play/[princess]/page.tsx`

- Add `useState` for `{ audioUrl, storyText }` and `loading`
- `useEffect` on mount: call `fetchStory(princess)`, set state
- Pass `audioUrl` and `storyText` to `<AudioPlayer>`
- Render a simple loading div while fetching
- On error: render the soft error message ("Elsa's letter is on its way — try again in a moment 💌")

### `AudioPlayer.tsx`

- Add `storyText: string` to `Props`
- Replace mock paragraphs with `storyText`, after stripping ElevenLabs audio tags
- Fix the "Runtime" header label: format `duration` state with `formatTime`
- Fix footer left timestamp (current position): use `formatTime(progress)` — replaces the broken `0:xx` format which fails for tracks longer than 60 seconds
- Fix footer right timestamp (duration): use `formatTime(duration)` with `--:--` as the zero-state fallback
- Fix: the `loadedmetadata` listener is currently registered as an anonymous inline arrow function and is never removed (pre-existing leak). To fix this, refactor it to a named reference before registering, then remove it in the cleanup: `const handleMetadata = () => setDuration(audio.duration); audio.addEventListener('loadedmetadata', handleMetadata);` — and `audio.removeEventListener('loadedmetadata', handleMetadata)` in the return. Removing an anonymous function reference silently does nothing, so this refactor is required.
- Type note: `play/[princess]/page.tsx` uses a local `PrincessId` type (`keyof typeof PRINCESS_META`). When calling `fetchStory(princess)`, cast `princessId as Princess` (the `Princess` type exported from `lib/api.ts`) — both are the same union, just defined separately.

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

Used for: header "Runtime" label, footer left (progress), footer right (duration).

---

## ElevenLabs Audio Tag Stripping

The `story_text` stored in Supabase contains ElevenLabs Expressive Mode audio tags (e.g. `[PROUD]`, `[CALM]`, `[GENTLE]`). These are voice-direction markers and must be stripped before display.

Strip regex: `/\[[A-Z_]+\]/g` — matches any sequence of uppercase letters and underscores inside square brackets.

Apply this in a small helper before rendering:

```ts
function stripAudioTags(text: string): string {
  return text.replace(/\[[A-Z_]+\]/g, '').trim();
}
```

---

## Loading & Error States

- **Loading**: play page shows a simple centered spinner / "Loading your letter..." message while `fetchStory` is in flight
- **STORY_NOT_FOUND (404)**: show the soft error — "[Princess]'s letter is on its way — try again in a moment 💌"
- **STORY_ERROR (5xx / network)**: show a generic retry prompt — "Something went wrong. Please go back and try again."
- **Header "Runtime" zero-state**: before audio metadata loads, `formatTime(0)` returns `--:--`, so the header shows `Runtime: --:--`. This is intentional — it resolves to the real duration once the audio element fires `loadedmetadata`.

## Breaking Change: `?audio=` Search Param

The play page currently reads `audioUrl` from `searchParams.get('audio')`. After this change, `audioUrl` comes from the `fetchStory` API response instead. Any existing deep link or browser history entry using `?audio=...` will have that param ignored. This is an accepted break — the play page always requires a live API fetch to show story text anyway, and the `<Suspense>` boundary wrapping `useSearchParams` can be removed once the param is no longer read.

---

## Files Changed

| File | Change |
|---|---|
| `backend/main.py` | Add `GET /story/today/{princess}` endpoint |
| `frontend/lib/api.ts` | Add `fetchStory()` function |
| `frontend/app/[locale]/play/[princess]/page.tsx` | Fetch story on mount, pass audioUrl + storyText to AudioPlayer |
| `frontend/components/AudioPlayer.tsx` | Accept `storyText` prop; fix duration format; strip audio tags; fix listener leak |

---

## Out of Scope

- No changes to story generation pipeline
- No changes to the Supabase schema
- No scroll-sync between audio progress and transcript position
