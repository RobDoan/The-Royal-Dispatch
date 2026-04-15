# The Royal Dispatch - Project Context

This file provides context and guidelines for Gemini CLI when working in this repository.

## Project Overview

The Royal Dispatch is a personalized bedtime storytelling PWA designed for families with multiple children. It transforms parent-sent daily briefs into personalized princess letters with synthesized audio.

### Core Architecture

- **Backend**: FastAPI (Python 3.11+) orchestrating a **LangGraph** pipeline.
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + next-intl (i18n).
- **Admin UI**: Next.js 16 + shadcn/ui for managing parents and children.
- **Orchestration**: n8n for Telegram webhooks and Whisper transcription.
- **Memory Layer**: **mem0** + **Qdrant** for per-child vector memory.
- **Voice Synthesis**: ElevenLabs v3 with Expressive Mode.
- **Infrastructure**: Docker Compose (local), Kubernetes (k3s, Vault, external-secrets).

## Services & Tech Stack

### Backend (`/backend`)
- **Framework**: FastAPI
- **Pipeline**: LangGraph (see `graph.py` for node topology)
- **Database**: PostgreSQL (psycopg2-binary)
- **Migrations**: Versioned SQL in `db/migrations/`, managed by golang-migrate
- **AI/LLM**: Anthropic (Claude Sonnet/Haiku), OpenAI (Embeddings for mem0)
- **Personas**: Defined in YAML files within `personas/`
- **Storage**: AWS S3 for generated audio files

### Frontend (`/frontend`)
- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4
- **i18n**: English and Vietnamese (next-intl)
- **Target**: iPad PWA (standalone mode)

### Admin UI (`/admin`)
- **Framework**: Next.js 16
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Purpose**: Parent/child management, user preference editing

## Key Commands

### Development
```bash
# Full Stack (Docker)
docker compose up --build

# Backend
cd backend && uv run uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm run dev

# Admin UI
cd admin && npm run dev -p 3001
```

### Testing
```bash
# Backend
cd backend && uv run pytest tests/ -v

# Frontend
cd frontend && npx vitest run

# Admin UI
cd admin && npx vitest run
```

## Development Conventions

- **Multi-Child Support**: All story generation and memory operations must be scoped by `child_id`.
- **Memory Operations**: 
    - `extract_memories` node: Stores facts via mem0.
    - `fetch_memories` node: Retrieves 10 most recent profile facts + contextual search.
- **Time Logic**: The "logical day" resets at **3 AM** (see `backend/utils/time_utils.py`).
- **Personas**: Princess characteristics are defined in `backend/personas/*.yaml`. Do not hardcode princess behavior in nodes.
- **i18n**: Support `en` and `vi` across all layers.
- **State Management**: LangGraph uses `RoyalStateOptional` (TypedDict) in `backend/state.py`.

## Git Guidelines

- **NEVER** commit files under `docs/superpowers/` (local-only).
- Follow specific rules in `GIT_RULES.md` if present.
- Do not stage or commit changes unless explicitly asked.

## Documentation References

- `README.md`: High-level architecture and quick start.
- `CLAUDE.md`: Detailed development commands and architecture summary.
- `docs/specs/`: Design documents for Kubernetes, UI, etc.
