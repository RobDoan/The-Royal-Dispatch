# The Royal Dispatch — Design Spec
**Date:** 2026-03-23
**Status:** Approved

## Overview

The Royal Dispatch is a personalized bedtime storytelling PWA for Emma (age 4). Each night, Emma opens her iPad, taps a Disney Princess from her Royal Inbox, and receives a voice letter from that princess — written around the real events of her day, crafted by her parent's nightly WhatsApp brief. The system builds Emma's confidence and models positive habits through emotional storytelling, delivered in a bilingual (English/Vietnamese) mix by expressive AI voices.

---

## User Personas

### Emma (Child, 4 years old)
- Sensitive, responds deeply to praise and recognition from her heroes
- Loves Elsa, Belle, Cinderella, and Ariel
- Bilingual: English and Vietnamese mixed naturally
- Uses the iPad independently to open the app and tap her chosen princess

### Parent (Dad)
- Sends a short WhatsApp voice note or text each evening describing Emma's day
- Example: *"She shared her blocks today but didn't want to brush her teeth"*
- Comfortable with advanced backend setup; interested in learning modern AI engineering

---

## Core Experience Flow

```
Parent sends WhatsApp brief
       ↓
n8n receives webhook → transcribes voice if needed → stores brief in Supabase
       ↓
Emma opens iPad PWA → sees Royal Inbox with 4 princess letters
       ↓
Emma taps her chosen princess (e.g. Elsa)
       ↓
PWA calls POST /story → LangGraph pipeline runs on-demand
       ↓
Magic loading animation plays while story generates (~5–10s)
       ↓
Elsa's voice plays with ambient snowflake animation
       ↓
Emma falls asleep feeling seen by her princess
```

---

## Princesses

| Princess | Origin | Color Theme | Personality |
|---|---|---|---|
| Elsa | Kingdom of Arendelle | Powder blue (#93c5fd) | Calm, majestic, warmly proud |
| Belle | The Enchanted Castle | Warm gold (#fcd34d) | Curious, nurturing, intellectual |
| Cinderella | The Royal Palace | Soft lilac (#e9b8f7) | Resilient, hopeful, gracious |
| Ariel | Under the Sea | Mint teal (#6ee7e7) | Adventurous, expressive, joyful |

---

## Tone Classification

The parent's brief is classified into one of two modes:

- **Praise Mode** — Emma did something good (sharing, being kind, trying hard). The princess celebrates her effort directly.
- **Habit Modeling Mode** — Emma struggled with a habit (brushing teeth, tidying up). The princess tells a story where a character in her world overcame the same challenge, modeling the behavior without lecturing.

---

## Architecture

### Stack
- **Frontend:** Next.js PWA (iPad, deployed as home screen app)
- **Orchestration:** n8n (WhatsApp webhook + voice transcription)
- **Backend:** FastAPI + LangGraph (Python)
- **LLM:** Claude (story generation + tone classification)
- **Voice:** ElevenLabs v3 with Expressive Mode audio tags
- **Database & Storage:** Supabase (Postgres + Storage for .mp3 files)

### System Diagram

```
[Parent] → WhatsApp → [n8n Workflow]
                            ↓ stores brief
                       [Supabase: briefs]
                            ↓ on Emma's tap
              [FastAPI + LangGraph State Machine]
   fetch_brief → classify_tone → load_persona →
   generate_story → synthesize_voice → store_result
                            ↓
                  [Supabase: stories + Storage]
                            ↓
                    [Next.js PWA on iPad]
```

---

## LangGraph State Machine

### State Shape

```python
class RoyalState(TypedDict):
    princess: str      # "elsa" | "belle" | "cinderella" | "ariel"
    brief: str         # parent's WhatsApp text for today
    tone: str          # "praise" | "habit"
    story_text: str    # generated letter with ElevenLabs audio tags
    audio_url: str     # Supabase Storage URL
    language: str      # "mixed" (EN/VI)
```

### Nodes

| Node | Responsibility |
|---|---|
| `fetch_brief` | Query Supabase for today's parent brief; fall back to default template if none |
| `classify_tone` | Claude call: read brief → return `praise` or `habit` |
| `load_persona` | Load princess YAML config (system prompt, voice ID, audio tags, metaphors) |
| `generate_story` | Claude call with persona + tone + brief → letter text with audio tags, EN/VI mix |
| `synthesize_voice` | ElevenLabs v3 API call with Expressive Mode |
| `store_result` | Save audio URL + story text to Supabase `stories` table |

---

## Princess Persona Config

Each princess is defined in a YAML file under `backend/personas/`. Easy to edit without touching code.

```yaml
# backend/personas/elsa.yaml
name: Queen Elsa
origin: Kingdom of Arendelle
voice_id: <elevenlabs_voice_id>
tone_style: calm, majestic, warmly proud
audio_tags:
  praise: [PROUD, CALM]
  habit: [GENTLE, CALM]
signature_phrase: "The cold never bothered me, and neither will this challenge — because you are a Princess."
metaphor: "Self-control is like the ice. It takes practice to keep it beautiful."
```

```yaml
# backend/personas/belle.yaml
name: Belle
origin: The Enchanted Castle
voice_id: <elevenlabs_voice_id>
tone_style: gentle, curious, nurturing
audio_tags:
  praise: [GENTLE, CURIOUS]
  habit: [GENTLE, CURIOUS]
signature_phrase: "I wrote about you in my special book today, Emma."
metaphor: "Even Lumiere had to learn patience. He practiced every single night."
```

---

## Supabase Schema

```sql
-- Parent's nightly brief
CREATE TABLE briefs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date NOT NULL,
  text       text NOT NULL,
  tone       text,  -- 'praise' | 'habit', populated after classification
  created_at timestamptz DEFAULT now()
);

-- Generated stories, cached per princess per day
CREATE TABLE stories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date NOT NULL,
  princess   text NOT NULL,
  story_text text,
  audio_url  text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(date, princess)  -- natural cache: replaying same letter reuses audio
);
```

---

## API Endpoints (FastAPI)

| Method | Path | Called by | Description |
|---|---|---|---|
| `POST` | `/brief` | n8n | Receives today's parent brief text, stores in Supabase |
| `POST` | `/story` | PWA | `{ princess, date }` → runs LangGraph → returns `{ audio_url }` |
| `GET` | `/story/today` | PWA | Returns which princess stories are already cached for today |

---

## PWA UI Design

### Screen 1 — Royal Inbox
- Background: soft lavender-white gradient (`#f5f0ff → #fdf4ff → #f0f7ff`)
- Header: "Good evening, Princess Emma" + "Your letters have arrived 💌"
- Four letter cards, each in the princess's pastel signature color
- Each card: princess emoji avatar, kingdom name (small uppercase), princess name (bold)
- Tapping a card triggers story generation

### Screen 2 — Letter Playing
- Same pastel background, consistent with Inbox (no dark theme switch)
- Large princess avatar circle with soft glow shadow
- Ambient character animation (snowflakes for Elsa, books for Belle, sparkles for Cinderella, bubbles for Ariel)
- Sound wave visualization while audio plays
- Simple playback controls: rewind / play-pause / skip

### Loading State (between tap and audio ready)
- Magic shimmer animation on the chosen princess card
- Short text: "Elsa is writing your letter..." or similar
- Target: 5–10 seconds generation time

---

## Language

Stories are generated in a natural English/Vietnamese mix. The LLM prompt instructs Claude to blend both languages the way a bilingual child would hear them — key emotional phrases in Vietnamese, narrative flow in English (or vice versa), never feeling forced.

Example blend:
> *"Emma ơi, I heard about what you did today. Con đã chia sẻ những khối gỗ của mình — and that, my dear, is what makes a true princess."*

---

## Fallback Behavior

If no parent brief has been submitted today:
- The princess sends a warm default letter: *"Emma, I was just thinking of you today from [origin]..."*
- These fallback templates are stored per princess in their YAML persona config
- The parent is not notified — Emma always receives a letter

---

## Project Structure

```
the-royal-dispatch/
├── frontend/              # Next.js PWA
│   ├── app/
│   │   ├── page.tsx       # Royal Inbox
│   │   └── play/[princess]/page.tsx  # Letter playing screen
│   └── public/
├── backend/               # FastAPI + LangGraph
│   ├── main.py            # FastAPI app
│   ├── graph.py           # LangGraph state machine
│   ├── nodes/             # One file per graph node
│   │   ├── fetch_brief.py
│   │   ├── classify_tone.py
│   │   ├── load_persona.py
│   │   ├── generate_story.py
│   │   ├── synthesize_voice.py
│   │   └── store_result.py
│   └── personas/          # YAML persona configs
│       ├── elsa.yaml
│       ├── belle.yaml
│       ├── cinderella.yaml
│       └── ariel.yaml
├── n8n/                   # n8n workflow export
│   └── whatsapp-brief.json
└── docs/
    └── superpowers/specs/
        └── 2026-03-23-royal-dispatch-design.md
```

---

## Success Criteria

- Emma can independently open the app and tap her princess without help
- Story generation completes within 10 seconds of tapping
- The princess voice sounds expressive and natural (not robotic)
- Emma asks to hear another letter — the "one more" test
- Parent brief takes under 30 seconds to send via WhatsApp
