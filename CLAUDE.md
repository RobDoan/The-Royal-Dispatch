# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

The Royal Dispatch is a bedtime storytelling PWA that supports multiple children. Parents send a nightly brief via Telegram → n8n transcribes and POSTs it → LLM detects which child the brief is about → FastAPI + LangGraph generates a personalized princess letter per child → ElevenLabs synthesizes audio → Each child taps a princess on their iPad and hears their letter.

**Admin UI** is available at `/admin` for managing users and adding/editing children.

## Commands

### Backend (Python / FastAPI)

```bash
cd backend
uv sync

# Run dev server
uv run uvicorn main:app --reload --port 8000

# Run all tests
uv run pytest tests/ -v

# Run a single test file
uv run pytest tests/test_nodes/test_generate_story.py -v

# Run a single test
uv run pytest tests/test_nodes/test_generate_story.py::test_generate_story_returns_text_with_audio_tags -v
```

### Frontend (Next.js)

```bash
cd frontend
npm install

npm run dev        # development server on :3000
npm run build      # production build
npm run lint       # ESLint
npx vitest run     # all frontend tests
npx vitest run tests/AudioPlayer.test.tsx  # single test file
```

### Admin UI (Next.js)

```bash
cd admin
npm install

npm run dev        # development server on :3001
npm run build      # production build
npx vitest run     # all admin tests
```

### Docker (full stack)

```bash
docker compose up --build
# Backend: :8000  Frontend: :3000  Admin: :3001  n8n: :5678  Qdrant: :6333  PostgreSQL: :5432
```

## Architecture

### Request Flow

```
POST /brief  →  LLM detects which child(ren) → stores one brief row per detected child
POST /story  →  cache check → LangGraph pipeline (scoped by child_id) → audio_url
GET  /story/today  →  cached stories for today
GET  /story/today/{princess}  →  full detail (text + audio_url + challenge), scoped by child_id
```

### LangGraph Pipeline (`backend/graph.py`)

```
fetch_brief → extract_memories → classify_tone → load_persona → fetch_memories
    → [daily] generate_story → synthesize_voice → store_result
    → [life_lesson] infer_situation → generate_life_lesson → synthesize_voice → store_result
```

- **extract_memories** — side-effect only (returns `{}`). Calls mem0 to store memorable facts from the brief (preferences, habits, milestones, social). Skips on `__fallback__` or when `child_id` is absent.
- **fetch_memories** — retrieves child's profile (10 most recent) + contextual search results using `child_id` as mem0 user_id. Skips when `child_id` is absent. Returns `{"memories": "..."}`. Both nodes fail gracefully if Qdrant/mem0 is unreachable.
- **classify_tone** — `"praise"` or `"habit"` based on brief content
- **story_type** — `"daily"` (from `/story` default) or `"life_lesson"` (explicit request)

State is `RoyalStateOptional` (TypedDict in `backend/state.py`). All nodes receive the full state dict and return a partial dict of changes.

### Memory Layer

- **mem0** Python library (`backend/utils/mem0_client.py`) — singleton `Memory` instance backed by Qdrant
- Memory is **per-child** — `user_id` parameter is the child's UUID from state
- If `child_id` is absent, memory operations skip entirely (briefs stored with `child_id = NULL`)
- Qdrant runs as a Docker service, persists to `qdrant_data` volume
- Requires `QDRANT_URL` and `OPENAI_API_KEY` env vars (OpenAI used for embeddings by mem0)
- **Qdrant** runs as a Docker service, persists to `qdrant_data` volume
- Requires `QDRANT_URL` and `OPENAI_API_KEY` env vars (OpenAI used for embeddings by mem0)

### Personas

Each princess is a YAML file in `backend/personas/` with: `voice_id`, `tone_style`, `audio_tags` (keyed by tone), `signature_phrase`, `metaphor`, `fallback_letter` (en/vi). Fallback letter is used when no brief exists (`brief == "__fallback__"`).

### Date Logic

The "logical day" resets at 3 AM in the user's timezone (not midnight). `get_logical_date_iso()` in `backend/utils/time_utils.py` handles this. Always pass `timezone` from client; defaults to `"America/Los_Angeles"`.

### Frontend

- Next.js App Router with `[locale]` segment for i18n (next-intl, en/vi)
- `frontend/CLAUDE.md` re-exports `frontend/AGENTS.md` — read it before writing frontend code: this Next.js version has breaking changes from training data. Check `node_modules/next/dist/docs/` for the actual API.
### Database (PostgreSQL)

Tables: `users` (parents), `children` (linked to users), `briefs` (with child_id), and `stories` (with child_id). Multi-child uniqueness is handled via partial indexes. Migrations are versioned in `backend/db/migrations/` (managed by golang-migrate, runs automatically in Docker). Audio files stored in Amazon S3 (`S3_BUCKET`).

### Admin UI

- Available at `/admin` (Next.js app at `admin/`)
- Manage users (parents) with Telegram Chat ID and auth token
- Add/remove children per parent
- Child name must be unique per parent (enforced by DB constraint)

## Key Env Vars

| File | Vars |
|---|---|
| `backend/.env` | `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`, `QDRANT_URL`, `OPENAI_API_KEY` |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` |
| `admin/.env.local` | `NEXT_PUBLIC_API_URL` |

# Git Rules

- Follow rules defined in GIT_RULES.md file if the file exists.