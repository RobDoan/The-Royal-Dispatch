# Audio Player — Real Story Text, Duration & Polling Flow
**Date:** 2026-03-24
**Status:** Approved

## Overview

Two problems to solve:

1. The `AudioPlayer` component displays mock transcript text and a hardcoded "Runtime: 7 mins" label — replace with real `story_text` from the backend and the actual audio duration.
2. The current UX blocks Emma on the inbox screen for up to 40 seconds while `POST /story` completes — replace with an immediate navigation to the play page and a looping video while the story generates.

---

## Revised UX Flow

```
Emma taps princess card
  → Inbox fires POST /story (fire-and-forget, no await)
  → Immediately navigates to play/[princess]

Play page mounts
  → Shows looping video: Princess_Writes_Letter_For_Emma.mp4
  → Polls GET /story/today/{princess} every 3 seconds
  → Story ready? → stop polling → show AudioPlayer with real story text + audio
  → 75 seconds elapsed, still no story? → show princess-specific sorry message
```

---

## Play Page States

| State | What Emma sees |
|---|---|
| **Polling** | Full-screen looping video `Princess_Writes_Letter_For_Emma.mp4`, styled with the princess's theme color |
| **Ready** | `AudioPlayer` with real `storyText` and `audioUrl`, audio auto-plays |
| **Timeout / Error** | Princess-specific sorry card (see below) |

---

## Princess-Specific Sorry Messages

Shown after 75 seconds with no story, or on a hard API error:

| Princess | Message |
|---|---|
| Elsa | "Elsa got caught in a snowstorm in Arendelle... ❄️ Try again in a little while!" |
| Belle | "Belle is lost in her favourite book right now 📚 She'll be back soon!" |
| Cinderella | "Cinderella is at the royal ball tonight 👠 Try again in a moment!" |
| Ariel | "Ariel is swimming with the dolphins and can't come to the surface 🐠 Try again soon!" |

The sorry card uses the princess's theme color and shows her character image.

---

## Polling Parameters

| Parameter | Value | Rationale |
|---|---|---|
| Interval | 3 seconds | Responsive without hammering the DB |
| Timeout | 75 seconds | Backend hard-timeout is 60s; +15s buffer for network + poll timing |
| Max polls | 25 (75 / 3) | Terminates cleanly |

---

## Backend Changes

### New endpoint: `GET /story/today/{princess}`

```
GET /story/today/{princess}
→ 200: { audio_url: str, story_text: str }
→ 404: story not yet generated for today
```

- Query: `SELECT audio_url, story_text FROM stories WHERE date = today AND princess = {princess}`
- No schema changes — `story_text` column already exists
- **Must be registered after `GET /story/today` in `main.py`** — FastAPI resolves static segments before parameterized ones only when the static route appears first. If the new route is inserted above `GET /story/today`, requests to `/story/today` will match `{princess}="today"` and silently break the existing endpoint.

---

## Frontend Changes

### `lib/api.ts`

**Existing `requestStory`** — no change to signature. The inbox calls it fire-and-forget.

**New `fetchStory`:**

```ts
export async function fetchStory(princess: Princess): Promise<{ audioUrl: string; storyText: string }> {
  const res = await fetch(`${API_URL}/story/today/${princess}`);
  if (res.status === 404) throw new Error('STORY_NOT_FOUND');
  if (!res.ok) throw new Error('STORY_ERROR');
  const data = await res.json();
  return { audioUrl: data.audio_url, storyText: data.story_text };
}
```

snake_case API fields are mapped to camelCase here so all frontend code stays consistent.

### `app/[locale]/page.tsx` (Inbox)

Change `handleSelectPrincess`:
- Fire `requestStory(id, language)` with no `await` (fire-and-forget)
- Immediately call `router.push(/${locale}/play/${id})` — no `?audio=` param needed
- Remove `loadingPrincess` state (no more waiting on inbox)
- Remove the `try/catch` around the request (errors are handled on the play page)

### `app/[locale]/play/[princess]/page.tsx`

Replace the current `useSearchParams` approach with a polling loop:

- Remove `useSearchParams` (and its `<Suspense>` wrapper — no longer needed)
- On mount: start polling `fetchStory(princess)` every 3 seconds
- Track `elapsedSeconds` — stop and show sorry message after 75s
- On successful fetch: set `{ audioUrl, storyText }`, stop polling, render `<AudioPlayer>`
- On `STORY_ERROR`: stop polling immediately, show sorry message
- Type: cast `princessId as Princess` when calling `fetchStory` (play page uses local `PrincessId = keyof typeof PRINCESS_META`, which is the same union as `Princess` from `lib/api.ts`)

**Polling state machine:**
```
idle → polling → ready
              ↘ timeout
              ↘ error
```

**Loading UI (polling state):**
```tsx
<video
  src="/videos/Princess_Writes_Letter_For_Emma.mp4"
  autoPlay
  loop
  muted
  playsInline
  className="w-full h-full object-cover"
/>
```

The video fills the screen. Apply a subtle princess-colored overlay (low opacity) using the princess's theme color so each princess feels distinct even during loading.

### `components/AudioPlayer.tsx`

- Add `storyText: string` to `Props`
- Replace the 3 mock paragraphs with `storyText`, after stripping ElevenLabs audio tags
- Fix "Runtime" header label: use `formatTime(duration)` — shows `--:--` before metadata loads
- Fix footer left timestamp (current position): use `formatTime(progress)` — fixes the broken `0:xx` format that fails for tracks > 60s
- Fix footer right timestamp: use `formatTime(duration)` — replaces `7:00` hardcoded fallback

**Duration format helper:**
```ts
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
```

**ElevenLabs tag stripping:**
```ts
function stripAudioTags(text: string): string {
  return text.replace(/\[[A-Z_]+\]/g, '').trim();
}
```

Strips patterns like `[PROUD]`, `[CALM]`, `[GENTLE]` from the story text before rendering.

**`loadedmetadata` listener leak fix:**
The existing code registers `loadedmetadata` as an anonymous inline arrow — it cannot be removed. Refactor to a named reference:
```ts
const handleMetadata = () => setDuration(audio.duration);
audio.addEventListener('loadedmetadata', handleMetadata);
// in cleanup:
audio.removeEventListener('loadedmetadata', handleMetadata);
```

---

## Files Changed

| File | Change |
|---|---|
| `backend/main.py` | Add `GET /story/today/{princess}` endpoint (after existing `/story/today`) |
| `frontend/lib/api.ts` | Add `fetchStory()` function |
| `frontend/app/[locale]/page.tsx` | Fire-and-forget `requestStory`, navigate immediately |
| `frontend/app/[locale]/play/[princess]/page.tsx` | Replace search-param approach with polling loop + video loading state |
| `frontend/components/AudioPlayer.tsx` | Accept `storyText` prop; fix duration format; strip audio tags; fix listener leak |

---

## Out of Scope

- No changes to story generation pipeline
- No changes to the Supabase schema
- No scroll-sync between audio progress and transcript position
- The `?audio=` search param is removed — existing deep links with that param will load without audio until the poll resolves (acceptable)
