# The Royal Dispatch

A personalized bedtime storytelling PWA that supports multiple children. Parents send a nightly voice brief via Telegram, and each child receives a unique princess letter — written around the real events of their day — with synthesized audio they can play on the family iPad.

```
Parent sends Telegram voice brief
       ↓
n8n receives webhook → transcribes voice (Whisper) → POSTs to backend
       ↓
LLM detects which child(ren) the brief is about → stores one brief per child
       ↓
Child opens iPad PWA → taps their princess
       ↓
LangGraph pipeline generates a personalized letter (~5–10s)
       ↓
Princess voice plays with ambient animation
```

---

## Stack

| Layer | Technology |
|---|---|
| Frontend (Web) | Next.js (App Router) + TypeScript + Tailwind CSS |
| Frontend (Mobile) | Flutter + Riverpod + go_router (iOS & Android) |
| Admin UI | Next.js + shadcn/ui (user & child management) |
| i18n | next-intl (web), flutter_localizations (mobile) — English / Tiếng Việt |
| Orchestration | n8n (Telegram webhook + Whisper transcription) |
| Backend | FastAPI + LangGraph |
| LLM | Claude (Haiku for classification/detection, Sonnet for story generation) |
| Voice | ElevenLabs v3 with Expressive Mode |
| Database | PostgreSQL (with golang-migrate for schema management) |
| Memory | mem0 + Qdrant (per-child vector memory) |
| Storage | Amazon S3 (audio files) |

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- Flutter 3.x (for mobile app development)
- Docker & Docker Compose
- An [Anthropic](https://console.anthropic.com) API key
- An [ElevenLabs](https://elevenlabs.io) API key
- (Optional) OpenAI API key — used by mem0 for embeddings

---

## Quick Start (Docker)

```bash
# Copy environment files
cp .env.example .env
cp backend/.env.example backend/.env

# Edit .env with your PostgreSQL password
# Edit backend/.env with your API keys

docker compose up --build
```

| Service | URL |
|---------|-----|
| Backend API | http://localhost:8000 |
| Frontend | http://localhost:3000 |
| Admin UI | http://localhost:3001 |
| n8n | http://localhost:5678 |
| Qdrant | http://localhost:6333 |
| PostgreSQL | localhost:5432 |

Database migrations run automatically via the `migrate` service on startup.

---

## Local Development

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Create backend/.env (see backend/.env.example)
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
# Create frontend/.env.local with NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev   # http://localhost:3000
```

### Admin UI

```bash
cd admin
npm install
# Create admin/.env.local with NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev   # http://localhost:3001
```

### Mobile App (Flutter)

```bash
cd mobile
flutter pub get
flutter run              # launch on connected device/emulator
flutter test             # all tests
flutter test test/models/ # single test directory
flutter analyze          # static analysis
```

Requires a running backend at `http://localhost:8000`. For Android emulator, the app uses `http://10.0.2.2:8000/api` automatically. Configure the base URL in `mobile/.env`.

### Running Tests

```bash
# Backend
cd backend && pytest tests/ -v

# Frontend
cd frontend && npx vitest run

# Admin
cd admin && npx vitest run

# Mobile
cd mobile && flutter test
```

---

## Multi-Child Support

The Royal Dispatch supports families with multiple children:

1. **Parents and children** are managed via the Admin UI — add children under each parent account
2. **Automatic child detection** — when a brief is posted, an LLM identifies which child(ren) it refers to by name and stores one brief row per detected child
3. **Per-child stories** — story generation is scoped by `child_id`, so each child gets their own personalized letter
4. **Per-child memory** — mem0 uses the child's UUID as the user ID, so each child accumulates their own preferences, milestones, and habits over time

If a parent has only one child, the brief is automatically assigned to that child without LLM detection.

---

## API Reference

### Public Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/brief` | Submit a parent's brief `{ "text": "...", "user_id": "..." }` — auto-detects children |
| `POST` | `/story` | Generate a story `{ "princess": "elsa", "language": "en", "child_id": "..." }` |
| `GET` | `/story/today` | Cached stories for today |
| `GET` | `/story/today/{princess}` | Full story detail (text + audio URL + royal challenge) |
| `GET` | `/user/me` | Get current user info |
| `GET` | `/user/by-chat-id` | Look up user by Telegram chat ID |

### Admin Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/users` | List all parent users |
| `POST` | `/admin/users` | Create a parent user |
| `DELETE` | `/admin/users/{id}` | Delete a parent user |
| `GET` | `/admin/users/{id}/children` | List children for a parent |
| `POST` | `/admin/users/{id}/children` | Add a child to a parent |
| `DELETE` | `/admin/children/{id}` | Remove a child |
| `GET/PUT` | `/admin/users/{id}/preferences` | Get/update user preferences |
| `GET` | `/admin/personas` | List available princess personas |

Valid princess values: `elsa`, `belle`, `cinderella`, `ariel`, `rapunzel`, `moana`, `raya`, `mirabel`, `chase`, `marshall`, `skye`, `rubble`

Valid language values: `en`, `vi`

---

## n8n Telegram Workflow

The n8n workflow receives Telegram messages from parents, transcribes voice notes via OpenAI Whisper, and posts the brief text to `POST /brief`.

To test without n8n, post a brief directly:

```bash
curl -X POST http://localhost:8000/brief \
  -H "Content-Type: application/json" \
  -d '{"text": "Emma shared her blocks today but Lily did not want to brush her teeth.", "user_id": "<parent-uuid>"}'
```

---

## Database

PostgreSQL with versioned migrations in `backend/db/migrations/` (managed by [golang-migrate](https://github.com/golang-migrate/migrate)):

| Table | Description |
|---|---|
| `users` | Parent accounts with Telegram chat ID and auth token |
| `children` | Children linked to parents (unique name per parent) |
| `briefs` | Daily brief text, scoped by user and child |
| `stories` | Generated stories with audio URLs, scoped by child |
| `user_preferences` | JSONB config per user |

---

## Environment Variables

| File | Variables |
|---|---|
| `.env` | `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB` |
| `backend/.env` | `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET` |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` |
| `admin/.env.local` | `NEXT_PUBLIC_API_URL` |

Optional (for memory features): `QDRANT_URL`, `OPENAI_API_KEY`

---

## Install

### iPad PWA (Web)

1. Deploy or make the frontend accessible on your local network
2. On the iPad, open **Safari** and navigate to the frontend URL
3. Tap **Share** → **Add to Home Screen**
4. The app opens in fullscreen standalone mode

### Mobile App (Flutter)

1. Build the app: `cd mobile && flutter build apk` (Android) or `flutter build ios` (iOS)
2. Install on the child's device
3. Enter the family token (parent gets this from Telegram) or open a `royaldispatch://pair?token=...` deep link
4. The child picks their name on each launch and taps a princess to hear their letter

---

## Project Structure

```
the-royal-dispatch/
├── backend/
│   ├── main.py                  # FastAPI app + all routes
│   ├── state.py                 # RoyalStateOptional TypedDict
│   ├── graph.py                 # LangGraph pipeline assembly
│   ├── nodes/                   # Pipeline nodes
│   │   ├── fetch_brief.py
│   │   ├── extract_memories.py  # Store memorable facts via mem0
│   │   ├── fetch_memories.py    # Retrieve per-child memory
│   │   ├── classify_tone.py
│   │   ├── load_persona.py
│   │   ├── generate_story.py
│   │   ├── synthesize_voice.py
│   │   └── store_result.py
│   ├── personas/                # Princess persona YAML configs
│   ├── utils/
│   │   ├── child_detection.py   # LLM-based child detection
│   │   ├── mem0_client.py       # mem0 singleton
│   │   └── time_utils.py        # Logical date (3 AM reset)
│   ├── storage/
│   │   └── client.py            # S3 storage client
│   ├── db/
│   │   ├── client.py            # PostgreSQL connection
│   │   └── migrations/          # Versioned SQL migrations
│   └── tests/
├── frontend/                    # Next.js PWA (child-facing web app)
├── mobile/                      # Flutter mobile app (iOS & Android)
│   ├── lib/
│   │   ├── models/              # Data models (princess, user, story)
│   │   ├── providers/           # Riverpod state (auth, family, story, audio)
│   │   ├── services/            # API client, SSE parser, audio handler
│   │   ├── screens/             # 5 screens (pairing, child picker, inbox, story, playback)
│   │   └── widgets/             # Glass card, princess card, particles, etc.
│   └── assets/                  # Character images, icons
├── admin/                       # Next.js admin UI (parent/child management)
├── n8n/
│   └── telegram-brief.json      # n8n workflow export
├── k8s/                         # Kubernetes manifests (k3s)
├── docs/
│   └── specs/                   # Design specifications
└── docker-compose.yml
```

---

## Kubernetes Deployment

K8s manifests are in `k8s/` for deploying to a k3s cluster with Traefik ingress, External Secrets Operator + HashiCorp Vault, and persistent storage. See `docs/specs/2026-03-30-k8s-deployment-design.md` for the full design.

---

## Characters

| Character | Origin | Color |
|---|---|---|
| Queen Elsa | Kingdom of Arendelle | Powder blue |
| Belle | The Enchanted Castle | Warm gold |
| Cinderella | The Royal Palace | Soft lilac |
| Ariel | Under the Sea | Mint teal |
| Princess Rapunzel | Kingdom of Corona | Sunny yellow |
| Moana | Motunui Island | Ocean cyan |
| Raya | Kumandra | Royal purple |
| Mirabel | The Encanto | Emerald green |
| Chase | Adventure Bay (Police Pup) | Blue |
| Marshall | Adventure Bay (Fire Pup) | Red |
| Skye | Adventure Bay (Aviation Pup) | Pink |
| Rubble | Adventure Bay (Construction Pup) | Amber |

Each princess has a YAML persona config in `backend/personas/` that controls her voice ID, tone style, audio tags, signature phrase, metaphor, and fallback letter (en/vi).

---

## Tone Modes

The parent's brief is automatically classified into one of two modes:

- **Praise** — the child did something good. The princess celebrates them directly.
- **Habit** — the child struggled with a habit. The princess tells a story where a character in her world overcame the same challenge.

Story types: `daily` (default) or `life_lesson` (explicit request — the princess offers wisdom about a life situation).
