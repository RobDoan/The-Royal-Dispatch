# Life Lesson Story Feature — Design Spec

## Overview

Add a "Story" tab alongside the existing "Inbox" tab. In the Story tab, Emma taps a princess card and hears a Life Lesson story: the princess shares a personal anecdote or made-up tale about a character in her kingdom, teaching Emma how to handle a real-life situation with grace. The story ends with a spoken "Royal Challenge" — a small action Emma can try in real life — which is also displayed as a highlighted card in the AudioPlayer.

---

## Goals

- Give Emma a second mode of engagement beyond the daily letter
- Leverage the daily parent brief to infer a teachable situation automatically
- Reuse all existing infrastructure (LangGraph, personas, ElevenLabs, Supabase, polling)
- Introduce a clean two-tab navigation structure for future expansion

---

## Non-Goals

- Parent does not explicitly specify the situation — AI infers it
- No separate WhatsApp command or dedicated input for life lessons
- Life Lesson stories are not pre-generated; they fire on tap (same as Inbox)

---

## Architecture

### Navigation

A persistent bottom navigation bar with two tabs replaces the current single-page layout:

| Tab | Route | Description |
|-----|-------|-------------|
| Inbox | `/[locale]/inbox` | Daily letters — email-row style list |
| Story | `/[locale]/story` | Life Lesson stories — 2-column princess card grid |

- Root `/[locale]` redirects to `/[locale]/inbox`
- A shared `BottomNav` component handles active tab state

### Play Routes

| Tab | Play Route | Story Type |
|-----|-----------|------------|
| Inbox | `/[locale]/play/[princess]` | `daily` |
| Story | `/[locale]/story/[princess]` | `life_lesson` |

Both play routes use the same fire-and-forget + polling pattern (3s interval, 75s max).

---

## Backend

### State (`backend/state.py`)

Three new fields added to `RoyalState`:

```python
story_type: str        # "daily" | "life_lesson"
situation: str         # teachable situation inferred from brief (life_lesson only)
royal_challenge: str   # the challenge text for Emma (life_lesson only)
```

### LangGraph (`backend/graph.py`)

Unified graph with conditional routing after `classify_tone`:

```
fetch_brief → load_persona → classify_tone
                                    ↓
              ┌─────────────────────┴──────────────────────┐
           "daily"                                   "life_lesson"
              ↓                                            ↓
        generate_story                           infer_situation
              ↓                                            ↓
              └──────────────── synthesize_audio ──────────┘
                                      ↓
                                  save_story
```

Conditional edge key: `story_type` field on state.

### New Nodes

**`backend/nodes/infer_situation.py`**
- Input: `brief` (daily parent message)
- Model: Claude Haiku (fast, cheap)
- Behaviour: Extract one teachable situation from the brief (e.g. "sharing with a sibling", "being brave at the doctor"). If the brief contains no clear teachable moment, pick an age-appropriate topic (kindness, patience, courage, sharing, honesty, trying new things).
- Output: `situation` string (short phrase, max ~8 words)

**`backend/nodes/generate_life_lesson.py`**
- Input: `princess`, `persona`, `tone`, `situation`, `language`
- Model: Claude Sonnet
- Behaviour: Generate a story where the princess shares a personal anecdote or a made-up story about a character in her kingdom. The story teaches Emma how to handle `situation` with grace. Story ends with a spoken "Royal Challenge" — one concrete action Emma can try today. The `royal_challenge` field is extracted as a separate string.
- Output: `story_text` (full story including spoken challenge), `royal_challenge` (challenge text only, for display)
- Length: 6-8 sentences for the story, 1-2 sentences for the Royal Challenge
- Format: story_text includes the Royal Challenge at the end (for ElevenLabs); royal_challenge is the challenge sentence(s) only (for the UI card)

### API (`backend/main.py`)

**`POST /story`** — updated request model:
```python
class StoryRequest(BaseModel):
    princess: Literal["elsa", "belle", "cinderella", "ariel"]
    language: Literal["en", "vi"] = "en"
    story_type: Literal["daily", "life_lesson"] = "daily"
    date: str | None = None
```

Cache lookup and insert filter by `(date, princess, story_type)` — each princess can have one `daily` and one `life_lesson` story per day.

**`GET /story/today/{princess}`** — updated with query param:
```
GET /story/today/elsa?type=life_lesson
```

Updated response model:
```python
class StoryDetailResponse(BaseModel):
    audio_url: str
    story_text: str
    royal_challenge: str | None  # None for daily stories
```

### Database

Two new columns on `stories` table:
- `story_type` — `text`, default `"daily"`, not null
- `royal_challenge` — `text`, nullable

Unique constraint updated to `(date, princess, story_type)`.

---

## Frontend

### Navigation Component (`frontend/components/BottomNav.tsx`)

New shared component. Two items: Inbox (envelope icon) and Story (open book icon). Active tab highlighted. Rendered in a shared layout wrapping both tab routes.

### Inbox Redesign (`frontend/app/[locale]/inbox/page.tsx`)

Current princess card grid replaced with an email-row list:
- Princess avatar (small circle with emoji)
- Princess name + origin
- "New" badge if unread
- Tapping navigates to `/[locale]/play/[princess]` (unchanged play route)

### Story Tab (`frontend/app/[locale]/story/page.tsx`)

Same 2-column princess card grid as the original Inbox. Tapping fires `requestStory(id, language, "life_lesson")` (fire-and-forget) and navigates to `/[locale]/story/[princess]`.

### Story Play Page (`frontend/app/[locale]/story/[princess]/page.tsx`)

Same polling pattern as the Inbox play page:
- Poll `GET /story/today/{princess}?type=life_lesson` every 3s, max 75s
- Loading: looping `Princess_Writes_Letter_For_Emma.mp4` video
- Timeout: princess-specific sorry message
- Ready: `<AudioPlayer>` with `royalChallenge` prop

### AudioPlayer (`frontend/components/AudioPlayer.tsx`)

New optional prop `royalChallenge?: string`. When present, renders a highlighted card below the story text:

```
┌──────────────────────────────────┐
│ 👑 Your Royal Challenge           │
│                                   │
│  "Try sharing one of your        │
│   favourite things with          │
│   someone today."                │
└──────────────────────────────────┘
```

Card styling: warm gold border, cream background, bold crown emoji header.

### API Client (`frontend/lib/api.ts`)

`requestStory()` and `fetchStory()` each gain a `storyType` param:

```typescript
export async function requestStory(
  princess: Princess,
  language: Language,
  storyType: 'daily' | 'life_lesson' = 'daily'
): Promise<void>

export async function fetchStory(
  princess: Princess,
  storyType: 'daily' | 'life_lesson' = 'daily'
): Promise<{ audioUrl: string; storyText: string; royalChallenge: string | null }>
```

### i18n (`messages/en.json`, `messages/vi.json`)

New keys under `story` namespace:
- `story.title` — tab label
- `story.royalChallenge` — card header text ("Your Royal Challenge")
- `story.writing` — loading message while story generates
- `story.sorryMessages.*` — per-princess timeout messages (can reuse existing ones)

---

## Testing

### Backend
- `test_infer_situation.py` — mock brief → verify `situation` is a short non-empty string; empty brief → verify fallback topic returned
- `test_generate_life_lesson.py` — mock persona + situation → verify `story_text` and `royal_challenge` both populated; verify `royal_challenge` appears in `story_text`
- `test_api.py` — `POST /story` with `story_type="life_lesson"` returns `audio_url`; `GET /story/today/elsa?type=life_lesson` returns 200 with `royal_challenge`; cache hit for same `(date, princess, story_type)`

### Frontend
- `AudioPlayer.test.tsx` — when `royalChallenge` prop present, Royal Challenge card renders; when absent, card does not render
- `BottomNav.test.tsx` — active tab highlighted; clicking tab navigates
- `StoryPage.test.tsx` — princess cards render; tap fires `requestStory` with `"life_lesson"`

---

## File Map

| File | Action |
|------|--------|
| `backend/state.py` | Add `situation`, `royal_challenge`, `story_type` fields |
| `backend/graph.py` | Add conditional edge on `story_type` |
| `backend/nodes/infer_situation.py` | New |
| `backend/nodes/generate_life_lesson.py` | New |
| `backend/main.py` | Update `StoryRequest`, cache logic, `StoryDetailResponse`, GET endpoint |
| `backend/db/migrations/add_story_type.sql` | New columns + unique constraint |
| `frontend/app/[locale]/layout.tsx` | Add `BottomNav` to shared layout |
| `frontend/app/[locale]/page.tsx` | Redirect to `/inbox` |
| `frontend/app/[locale]/inbox/page.tsx` | New — email-row inbox |
| `frontend/app/[locale]/story/page.tsx` | New — princess card grid |
| `frontend/app/[locale]/story/[princess]/page.tsx` | New — life lesson play page |
| `frontend/components/BottomNav.tsx` | New |
| `frontend/components/AudioPlayer.tsx` | Add `royalChallenge` prop + card |
| `frontend/lib/api.ts` | Add `storyType` param to `requestStory` + `fetchStory` |
| `frontend/messages/en.json` | Add `story.*` keys |
| `frontend/messages/vi.json` | Add `story.*` keys |
| `frontend/tests/AudioPlayer.test.tsx` | Add Royal Challenge card tests |
| `frontend/tests/BottomNav.test.tsx` | New |
| `frontend/tests/StoryPage.test.tsx` | New |
| `backend/tests/test_infer_situation.py` | New |
| `backend/tests/test_generate_life_lesson.py` | New |
| `backend/tests/test_api.py` | Add life_lesson endpoint tests |
