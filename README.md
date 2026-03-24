# The Royal Dispatch

A personalized bedtime storytelling PWA for Emma (age 4). Each night, Emma opens her iPad, taps a Disney Princess, and receives a voice letter from that princess — written around the real events of her day, crafted from her parent's nightly WhatsApp brief.

```
Parent sends WhatsApp brief
       ↓
n8n receives webhook → transcribes voice (Whisper) → stores in Supabase
       ↓
Emma opens iPad PWA → taps her chosen princess
       ↓
FastAPI + LangGraph pipeline runs on-demand (~5–10s)
       ↓
Princess voice plays with ambient animation
```

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.2.1 (App Router) + TypeScript + Tailwind CSS |
| i18n | next-intl (English / Tiếng Việt) |
| Orchestration | n8n (WhatsApp webhook + Whisper transcription) |
| Backend | FastAPI + LangGraph |
| LLM | Claude (Haiku for classification, Sonnet for story generation) |
| Voice | ElevenLabs v3 with Expressive Mode |
| Database | Supabase (Postgres + Storage) |

---

## Prerequisites

- Python 3.11+
- Node.js 20+
- A [Supabase](https://supabase.com) project
- An [Anthropic](https://console.anthropic.com) API key
- An [ElevenLabs](https://elevenlabs.io) API key
- n8n instance (for the WhatsApp webhook — optional for local testing)

---

## 1. Database Setup

In your Supabase project, open the **SQL Editor** and run:

```sql
-- backend/db/migrations/001_initial.sql

CREATE TABLE IF NOT EXISTS briefs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date NOT NULL,
  text       text NOT NULL,
  tone       text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date NOT NULL,
  princess   text NOT NULL,
  story_text text,
  audio_url  text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(date, princess)
);
```

Then create a **Storage bucket** named `royal-audio` and set it to **public**.

---

## 2. Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Install dependencies
pip install -e ".[dev]"
```

Create `backend/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=sk_...
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_KEY=<your-service-role-key>
SUPABASE_STORAGE_BUCKET=royal-audio
```

Set real ElevenLabs voice IDs in each persona file before first use:

```bash
# backend/personas/elsa.yaml
# backend/personas/belle.yaml
# backend/personas/cinderella.yaml
# backend/personas/ariel.yaml
```

Replace the `voice_id` field in each file with the voice ID from your ElevenLabs account.

### Run the backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

API will be available at `http://localhost:8000`.

### Run backend tests

```bash
cd backend
pytest tests/ -v
```

---

## 3. Frontend Setup

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Run the frontend (development)

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000` — it redirects to `http://localhost:3000/en`.

### Run frontend tests

```bash
cd frontend
npx vitest run
```

### Build for production

```bash
cd frontend
npm run build
npm run start
```

---

## 4. n8n WhatsApp Workflow (optional)

The n8n workflow receives WhatsApp messages from the parent, transcribes voice notes via OpenAI Whisper, and posts the brief text to `POST /brief`.

Setup steps:

1. In n8n, create a new workflow and import `n8n/whatsapp-brief.json` (if available)
2. Configure the **WhatsApp Cloud API** credentials
3. Set the webhook to forward messages to your n8n instance
4. Set the **HTTP Request** node URL to `http://your-backend-host:8000/brief`

To test without n8n, post a brief directly:

```bash
curl -X POST http://localhost:8000/brief \
  -H "Content-Type: application/json" \
  -d '{"text": "She shared her blocks today but did not want to brush her teeth."}'
```

---

## 5. Install as iPad PWA

1. Start the frontend (`npm run start`)
2. Make the server accessible on your local network (or deploy it)
3. On Emma's iPad, open **Safari** and navigate to the server URL
4. Tap the **Share** button → **Add to Home Screen**
5. The app installs with the royal purple icon and opens in fullscreen standalone mode

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/brief` | Submit today's parent brief `{ "text": "..." }` |
| `POST` | `/story` | Generate a story `{ "princess": "elsa", "language": "en" }` → `{ "audio_url": "..." }` |
| `GET` | `/story/today` | Returns cached stories for today `{ "elsa": "https://...", ... }` |

Valid princess values: `elsa`, `belle`, `cinderella`, `ariel`

Valid language values: `en`, `vi`

---

## Project Structure

```
the-royal-dispatch/
├── backend/
│   ├── main.py                  # FastAPI app + routes
│   ├── state.py                 # RoyalState TypedDict
│   ├── graph.py                 # LangGraph pipeline assembly
│   ├── nodes/
│   │   ├── fetch_brief.py       # Fetch today's parent brief from Supabase
│   │   ├── classify_tone.py     # Classify brief as "praise" or "habit"
│   │   ├── load_persona.py      # Load princess YAML config
│   │   ├── generate_story.py    # Generate letter text with Claude
│   │   ├── synthesize_voice.py  # Synthesize audio with ElevenLabs v3
│   │   └── store_result.py      # Save audio URL to Supabase
│   ├── personas/                # Princess persona YAML configs
│   │   ├── elsa.yaml
│   │   ├── belle.yaml
│   │   ├── cinderella.yaml
│   │   └── ariel.yaml
│   ├── db/
│   │   ├── client.py            # Supabase client singleton
│   │   └── migrations/
│   │       └── 001_initial.sql
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── app/
│   │   ├── layout.tsx           # Root layout (PWA metadata)
│   │   └── [locale]/
│   │       ├── layout.tsx       # Locale layout (html/body + next-intl)
│   │       ├── page.tsx         # Royal Inbox screen
│   │       └── play/[princess]/
│   │           └── page.tsx     # Letter playing screen
│   ├── components/
│   │   ├── PrincessCard.tsx
│   │   ├── AudioPlayer.tsx
│   │   └── LanguageSelector.tsx
│   ├── messages/
│   │   ├── en.json              # English UI strings
│   │   └── vi.json              # Vietnamese UI strings
│   ├── lib/api.ts               # API client
│   ├── proxy.ts                 # Next.js 16 locale routing (Proxy)
│   └── public/
│       ├── manifest.json        # PWA manifest
│       ├── icon-192.png
│       └── icon-512.png
├── n8n/
│   └── whatsapp-brief.json      # n8n workflow export
└── docs/
    └── superpowers/
        ├── specs/               # Design specification
        └── plans/               # Implementation plan
```

---

## Princesses

| Princess | Kingdom | Color |
|---|---|---|
| Elsa | Kingdom of Arendelle | Powder blue |
| Belle | The Enchanted Castle | Warm gold |
| Cinderella | The Royal Palace | Soft lilac |
| Ariel | Under the Sea | Mint teal |

Each princess has a YAML persona config in `backend/personas/` that controls her voice ID, tone style, audio tags, signature phrase, and fallback letter (used when no parent brief is available).

---

## Tone Modes

The parent's brief is automatically classified into one of two modes:

- **Praise** — Emma did something good. The princess celebrates her directly.
- **Habit** — Emma struggled with a habit. The princess tells a story where a character in her world overcame the same challenge.
