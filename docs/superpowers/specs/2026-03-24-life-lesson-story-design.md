# Life Lesson Story Feature — Design Spec

## Overview

Add a "Story" tab alongside the existing "Inbox" tab. In the Story tab, Emma taps a princess card and hears a Life Lesson story: the princess shares a personal anecdote or made-up tale about a character in her kingdom, teaching Emma how to handle a real-life situation with grace. The story ends with a spoken "Royal Challenge" — a small action Emma can try in real life — which is also displayed as a highlighted card inside the AudioPlayer's scrollable content area.

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

- Current `app/[locale]/page.tsx` (the Inbox) moves to `app/[locale]/inbox/page.tsx`; the original path becomes a redirect to `/[locale]/inbox`
- A shared `BottomNav` component sits in `app/[locale]/layout.tsx`

### Play Routes

| Tab | Play Route | Story Type |
|-----|-----------|------------|
| Inbox | `/[locale]/play/[princess]` | `daily` |
| Story | `/[locale]/story/[princess]` | `life_lesson` |

Both play routes use the same fire-and-forget + polling pattern (3s interval, 75s max).

---

## Backend

### State (`backend/state.py`)

Three new fields added to `RoyalState`. Because nodes on the `"daily"` branch never write `royal_challenge`, it must be declared with `total=False` using the two-class inheritance pattern — otherwise LangGraph raises a `KeyError` when merging partial node return dicts:

```python
class RoyalState(TypedDict):
    princess: str
    date: str
    brief: str
    tone: str
    persona: dict
    story_type: str        # "daily" | "life_lesson"
    situation: str         # "" for daily; set by infer_situation for life_lesson
    story_text: str
    audio_url: str
    language: str

class RoyalStateOptional(RoyalState, total=False):
    royal_challenge: str | None  # only written by generate_life_lesson
```

Use `RoyalStateOptional` (not `RoyalState`) as the type argument to `StateGraph` and in node function signatures. The project already uses Python 3.10+ so `str | None` syntax is valid everywhere.

These must also be included in the `initial_state` dict built in `main.py` before calling `royal_graph.invoke()`:

```python
initial_state: RoyalStateOptional = {
    "princess": req.princess,
    "date": story_date,
    "brief": "",
    "tone": "",
    "persona": {},
    "story_type": req.story_type,   # new
    "situation": "",                # new
    "story_text": "",
    "audio_url": "",
    "language": req.language,
    # royal_challenge intentionally omitted — total=False, set only by generate_life_lesson
}
```

### LangGraph (`backend/graph.py`)

Replace the `load_persona → generate_story` edge with a conditional router. The conditional edge reads `state["story_type"]` and routes to either `"generate_story"` or `"infer_situation"`. After both branches converge on `synthesize_voice`, the rest of the graph is unchanged.

```
fetch_brief → classify_tone → load_persona
                                    ↓
              ┌─────────────────────┴──────────────────────┐
           "daily"                                   "life_lesson"
              ↓                                            ↓
        generate_story                           infer_situation
              ↓                                            ↓
              │                              generate_life_lesson
              │                                            ↓
              └──────────────── synthesize_voice ──────────┘
                                      ↓
                                  store_result → END
```

Complete updated `build_graph()`:

```python
def route_story_type(state: RoyalStateOptional) -> str:
    return state["story_type"]  # "daily" | "life_lesson"

def build_graph():
    graph = StateGraph(RoyalStateOptional)  # must use RoyalStateOptional, not RoyalState
    graph.add_node("fetch_brief", fetch_brief)
    graph.add_node("classify_tone", classify_tone)
    graph.add_node("load_persona", load_persona)
    graph.add_node("generate_story", generate_story)
    graph.add_node("infer_situation", infer_situation)
    graph.add_node("generate_life_lesson", generate_life_lesson)
    graph.add_node("synthesize_voice", synthesize_voice)
    graph.add_node("store_result", store_result)

    graph.set_entry_point("fetch_brief")
    graph.add_edge("fetch_brief", "classify_tone")
    graph.add_edge("classify_tone", "load_persona")
    graph.add_conditional_edges(
        "load_persona",
        route_story_type,
        {"daily": "generate_story", "life_lesson": "infer_situation"},
    )
    graph.add_edge("generate_story", "synthesize_voice")
    graph.add_edge("infer_situation", "generate_life_lesson")
    graph.add_edge("generate_life_lesson", "synthesize_voice")
    graph.add_edge("synthesize_voice", "store_result")
    graph.add_edge("store_result", END)

    return graph.compile()
```

### New Nodes

**`backend/nodes/infer_situation.py`**
- Input: `state["brief"]`
- Model: Claude Haiku
- Behaviour: Extract one teachable situation from the brief (e.g. "sharing with a sibling", "being brave at the doctor"). If the brief contains no clear teachable moment (including empty briefs), pick one of these six fallback topics: kindness, patience, courage, sharing, honesty, trying new things.
- Output: sets `state["situation"]` (short phrase, max ~8 words)

**`backend/nodes/generate_life_lesson.py`**
- Input: `state["princess"]`, `state["persona"]`, `state["tone"]`, `state["situation"]`, `state["language"]`
- Model: Claude Sonnet
- Behaviour: Generate a story where the princess shares a personal anecdote or a made-up story about a character in her kingdom. The story teaches Emma how to handle `situation` with grace. The story ends with a spoken "Royal Challenge" — one concrete action Emma can try today. The `royal_challenge` text must appear verbatim at the end of `story_text` (ElevenLabs will read the full `story_text`).
- Output: sets `state["story_text"]` (full story including spoken challenge) and `state["royal_challenge"]` (challenge sentence(s) only, for the UI card)
- Length: 6–8 sentences for the story body, 1–2 sentences for the Royal Challenge

### `backend/nodes/store_result.py` (modify)

Two changes:
1. Add `story_type` and `royal_challenge` to the upsert dict
2. Update `on_conflict` from `"date,princess"` to `"date,princess,story_type"` to match the new unique constraint

```python
client.table("stories").upsert({
    "date": state["date"],
    "princess": state["princess"],
    "story_type": state["story_type"],
    "story_text": state["story_text"],
    "audio_url": state["audio_url"],
    "royal_challenge": state.get("royal_challenge"),  # None for daily (key absent), str for life_lesson
}, on_conflict="date,princess,story_type").execute()
```

### API (`backend/main.py`)

**`POST /story`** — updated request model:
```python
class StoryRequest(BaseModel):
    princess: Literal["elsa", "belle", "cinderella", "ariel"]
    language: Literal["en", "vi"] = "en"
    story_type: Literal["daily", "life_lesson"] = "daily"
    date: str | None = None
```

The endpoint remains synchronous (blocking with 60s timeout). The frontend calls it fire-and-forget with `void` — the return value (`audio_url`) is discarded at the call site, so no breaking change to consumers.

Cache lookup and insert filter by `(date, princess, story_type)`:
```python
cached = db.table("stories").select("audio_url").eq("date", story_date).eq("princess", req.princess).eq("story_type", req.story_type).execute()
```

**`GET /story/today/{princess}`** — add optional `type` query param (default `"daily"` for backwards compatibility):
```
GET /story/today/elsa              → daily story (unchanged, existing callers unaffected)
GET /story/today/elsa?type=life_lesson → life lesson story
```

Implementation:
```python
@app.get("/story/today/{princess}", response_model=StoryDetailResponse)
def get_today_story_for_princess(princess: str, type: str = "daily"):
    # `type` shadows Python's built-in — intentional. Do NOT rename to `story_type`
    # or the `?type=` URL contract with the frontend will break.
    ...
    result = client.table("stories").select("audio_url,story_text,royal_challenge") \
        .eq("date", today).eq("princess", princess).eq("story_type", type).execute()
```

Updated response model:
```python
class StoryDetailResponse(BaseModel):
    audio_url: str
    story_text: str
    royal_challenge: str | None  # None for daily stories
```

**`GET /story/today`** (list endpoint) — update to filter by `story_type = "daily"` to avoid returning duplicate entries per princess after the schema change:
```python
result = client.table("stories").select("princess,audio_url") \
    .eq("date", today).eq("story_type", "daily").execute()
```

### Database (`backend/db/migrations/add_story_type.sql`)

```sql
-- Add story_type column (backfills all existing rows as 'daily')
ALTER TABLE stories ADD COLUMN IF NOT EXISTS story_type TEXT NOT NULL DEFAULT 'daily';

-- Add royal_challenge column
ALTER TABLE stories ADD COLUMN IF NOT EXISTS royal_challenge TEXT;

-- Drop old unique constraint and add new one
-- Note: if any existing rows have duplicate (date, princess) pairs,
-- this migration will fail. Verify with:
--   SELECT date, princess, COUNT(*) FROM stories GROUP BY date, princess HAVING COUNT(*) > 1;
ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_date_princess_key;
ALTER TABLE stories ADD CONSTRAINT stories_date_princess_story_type_key UNIQUE (date, princess, story_type);
```

---

## Frontend

### Navigation Component (`frontend/components/BottomNav.tsx`)

New shared component. Two items: Inbox (envelope icon) and Story (open book icon). Active tab highlighted based on current pathname.

`(tabs)/layout.tsx` must render a plain React wrapper — **no `<html>` or `<body>` tags** (those belong to the parent `app/[locale]/layout.tsx`):

```tsx
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-16">
      {children}
      <BottomNav />
    </div>
  );
}
```

**Layout structure:** `BottomNav` must NOT go in `app/[locale]/layout.tsx` because that wrapper also covers the full-screen play pages, where the nav bar would overlay the AudioPlayer. Use two sibling route groups to avoid filesystem naming conflicts:

```
app/[locale]/
  layout.tsx                   ← no BottomNav here
  page.tsx                     ← redirect to /inbox
  (tabs)/
    layout.tsx                 ← BottomNav lives here
    inbox/
      page.tsx                 ← URL: /[locale]/inbox
    story/
      page.tsx                 ← URL: /[locale]/story
  (play)/
    play/
      [princess]/
        page.tsx               ← URL: /[locale]/play/[princess] (no BottomNav)
    story/
      [princess]/
        page.tsx               ← URL: /[locale]/story/[princess] (no BottomNav)
```

Route groups `(tabs)` and `(play)` are transparent to the URL — parenthesised folder names are excluded from the path. The two route groups exist so that `(tabs)/layout.tsx` applies `BottomNav` only to the Inbox and Story list pages, while pages under `(play)` get no nav bar. The `story/` directories coexist legally on disk because they live under different parent directories (`(tabs)/story/` vs `(play)/story/`), and Next.js Router resolves `/[locale]/story` from `(tabs)/story/page.tsx` and `/[locale]/story/[princess]` from `(play)/story/[princess]/page.tsx` without conflict.

### Inbox Redesign

Current `app/[locale]/page.tsx` content moves to `app/[locale]/inbox/page.tsx`. The original `app/[locale]/page.tsx` becomes a Next.js redirect to `/[locale]/inbox`.

The Inbox layout changes from a 2-column card grid to an email-row list:
- Princess avatar (small circle with emoji)
- Princess name + origin
- "New" badge if today's story is available
- Tapping navigates to `/[locale]/play/[princess]` (unchanged play route)

### Story Tab (`frontend/app/[locale]/story/page.tsx`)

Same 2-column princess card grid as the original Inbox. Tapping fires `requestStory(id, language, "life_lesson")` (fire-and-forget) and navigates to `/[locale]/story/[princess]`.

### Story Play Page (`frontend/app/[locale]/story/[princess]/page.tsx`)

Same polling pattern as the Inbox play page:
- Poll `GET /story/today/{princess}?type=life_lesson` every 3s, max 75s
- Loading: looping `Princess_Writes_Letter_For_Emma.mp4` video
- Timeout: princess-specific sorry message (reuse `app.sorryMessages.*` keys); back button navigates to `/${locale}/story` and uses the existing `app.goBack` i18n key
- Ready: `<AudioPlayer>` with `royalChallenge` prop

### AudioPlayer (`frontend/components/AudioPlayer.tsx`)

New optional prop `royalChallenge?: string`. When present, renders a highlighted card **inside the scrollable content area**, below the story text and above the bottom padding (so it scrolls naturally with the story):

```
┌──────────────────────────────────┐
│ 👑 Your Royal Challenge           │
│                                   │
│  "Try sharing one of your        │
│   favourite things with          │
│   someone today."                │
└──────────────────────────────────┘
```

Card styling: warm gold border, cream background, bold crown emoji header. When absent, no card is rendered.

### API Client (`frontend/lib/api.ts`)

`requestStory` currently returns `Promise<string>` (the `audio_url`). At all existing call sites it is called with `void requestStory(...)` — the return value is already discarded. Change the return type to `Promise<void>` and add a `storyType` param.

`fetchStory` gains a `storyType` param that is appended as `?type=` in the URL:

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
// Implementation body must map: data.royal_challenge → royalChallenge (snake_case → camelCase)
// and append ?type=storyType to the URL
```

The existing `play/[princess]/page.tsx` calls `fetchStory(princessId)` with no second arg (defaults to `"daily"`) and destructures only `{ audioUrl, storyText }` — this continues to work without changes; the extra `royalChallenge` field is simply ignored.

### i18n (`messages/en.json`, `messages/vi.json`)

New keys under a `story` namespace:
- `story.title` — tab label ("Story")
- `story.royalChallenge` — card header text ("Your Royal Challenge")
- `story.writing` — loading message while story generates (e.g., "{princess} is crafting your life lesson...")

The Story play page uses **two `useTranslations` calls**:
- `useTranslations('story')` — for `story.writing` (loading message)
- `useTranslations('app')` — for `app.sorryMessages.*` (timeout messages, reusing existing keys)

This is valid in next-intl and avoids duplicating the sorry message strings.

---

## Testing

### Backend

**`test_infer_situation.py`**
- Brief containing a clear event (e.g., "Emma had trouble sharing crayons with her brother") → `situation` is non-empty string, max 8 words
- Brief with no teachable moment (e.g., "Emma ate breakfast and watched TV") → `situation` is one of the six allowed fallback topics
- Empty brief → `situation` is one of the six allowed fallback topics

**`test_generate_life_lesson.py`**
- Mock persona + situation → both `story_text` and `royal_challenge` are non-empty
- `royal_challenge` text appears verbatim inside `story_text`

**`test_api.py`**
- `POST /story` with `story_type="life_lesson"` returns `audio_url`
- `GET /story/today/elsa?type=life_lesson` returns 200 with non-null `royal_challenge`
- `GET /story/today/elsa` (no type param) still returns 200 with `royal_challenge: null` — backwards compatible
- Cache hit for same `(date, princess, story_type)` — no duplicate generation

### Frontend

**`AudioPlayer.test.tsx`**
- When `royalChallenge` prop present, Royal Challenge card renders with correct text
- When `royalChallenge` absent, card does not render

**`BottomNav.test.tsx`**
- Active tab is highlighted based on current pathname
- Clicking inactive tab navigates to correct route

**`StoryPage.test.tsx`**
- All four princess cards render
- Tapping a card calls `requestStory` with `"life_lesson"` as story type

---

## File Map

| File | Action |
|------|--------|
| `backend/state.py` | Add `situation`, `royal_challenge`, `story_type` fields |
| `backend/graph.py` | Replace `load_persona → generate_story` edge with conditional routing; add new nodes |
| `backend/nodes/infer_situation.py` | **New** |
| `backend/nodes/generate_life_lesson.py` | **New** |
| `backend/nodes/store_result.py` | Modify — add `story_type`, `royal_challenge`; update `on_conflict` to `"date,princess,story_type"` |
| `backend/main.py` | Update `StoryRequest`, `initial_state`, cache lookup/insert, `StoryDetailResponse`, GET endpoint with `type` param, list endpoint filter |
| `backend/db/migrations/add_story_type.sql` | **New** — add columns + update unique constraint |
| `frontend/app/[locale]/layout.tsx` | No change |
| `frontend/app/[locale]/page.tsx` | Change to redirect → `/[locale]/inbox` |
| `frontend/app/[locale]/(tabs)/layout.tsx` | **New** — nested layout containing `BottomNav` |
| `frontend/app/[locale]/(tabs)/inbox/page.tsx` | **New** — move current Inbox content here, redesign as email rows |
| `frontend/app/[locale]/(tabs)/story/page.tsx` | **New** — princess card grid for life lessons |
| `frontend/app/[locale]/(play)/play/[princess]/page.tsx` | Move existing play page here (URL unchanged); update back button from `router.push(\`/${locale}\`)` to `router.push(\`/${locale}/inbox\`)` |
| `frontend/app/[locale]/(play)/story/[princess]/page.tsx` | **New** — life lesson play page; back button must be `router.push(\`/${locale}/story\`)` — do NOT copy the `/${locale}` path from the Inbox play page |
| `frontend/components/BottomNav.tsx` | **New** |
| `frontend/components/AudioPlayer.tsx` | Add `royalChallenge` prop + card inside scroll area |
| `frontend/lib/api.ts` | Add `storyType` param to `requestStory` + `fetchStory`; change `requestStory` return to `void` |
| `frontend/messages/en.json` | Add `story.title`, `story.royalChallenge`, `story.writing` |
| `frontend/messages/vi.json` | Add `story.title`, `story.royalChallenge`, `story.writing` |
| `frontend/tests/AudioPlayer.test.tsx` | Add Royal Challenge card tests |
| `frontend/tests/BottomNav.test.tsx` | **New** |
| `frontend/tests/StoryPage.test.tsx` | **New** |
| `backend/tests/test_infer_situation.py` | **New** |
| `backend/tests/test_generate_life_lesson.py` | **New** |
| `backend/tests/test_api.py` | Add life_lesson endpoint + backwards-compat tests |
