# Admin Service Design

**Date:** 2026-03-29
**Status:** Approved

## Overview

A separate Next.js admin micro-app (`admin/`) for managing two things:

1. **Connected Users** — the list of approved Telegram chat IDs and their associated user tokens
2. **Favorite Characters** — per-user princess selection (max 5) that filters what shows on Emma's iPad

The admin app is family-internal. No authentication required.

---

## Data Model

Two new Supabase tables:

```sql
-- Registered users / approved Telegram senders
users (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,              -- e.g. "Quy (Dad)"
  telegram_chat_id  bigint unique not null,     -- approved Telegram chat ID
  token             text unique not null,       -- unique token for frontend URL param
  created_at        timestamptz default now()
)

-- Per-user JSON config (favorites + future settings)
user_preferences (
  user_id  uuid primary key references users(id) on delete cascade,
  config   jsonb not null default '{}'
  -- config shape: { "favorite_princesses": ["elsa", "belle"] }
)
```

- `token` is auto-generated on user creation: `tk_` + 16 random hex chars (e.g. `tk_a8f2c1d9e3b74f01`)
- `config` is intentionally open jsonb for future settings beyond favorites
- If `favorite_princesses` is empty or missing → main frontend shows all princesses

---

## Backend Changes (`backend/main.py`)

New routes added to the existing FastAPI app. No new service.

### Admin routes (admin app only)

```
GET    /admin/users                    → list all users
POST   /admin/users                    → create user {name, telegram_chat_id} → auto-generates token
DELETE /admin/users/{id}               → remove user (cascades to preferences)

GET    /admin/users/{id}/preferences   → get config jsonb
PUT    /admin/users/{id}/preferences   → replace config jsonb

GET    /admin/personas                 → [{ id, name }] from backend/personas/*.yaml
```

### User resolution routes (used by main frontend + n8n)

```
GET  /user/me?token={token}            → { user_id, name, config } or 404
GET  /user/by-chat-id?chat_id={id}     → { user_id, name } or 404
```

### New Supabase migration

`backend/db/migrations/` — add migration file creating `users` and `user_preferences` tables.

---

## n8n Changes

The **Sender Filter** node currently compares `message.chat.id` against the `PARENT_CHAT_ID` env var. This changes to a dynamic lookup:

1. Add an HTTP Request node after the Telegram Trigger: `GET /user/by-chat-id?chat_id={{ $json.message.chat.id }}`
2. Sender Filter becomes: if HTTP response is 200 → continue, else → drop
3. The `user_id` from the response is passed downstream with the brief (for future per-user story personalization)

The `PARENT_CHAT_ID` env var is no longer needed once migration is complete.

---

## Main Frontend Changes (`frontend/`)

### Token resolution on load

`frontend/lib/api.ts` — on app init:
1. Check `localStorage.getItem('royal_token')`
2. If not found, check `?token=` URL param — if present, store to localStorage
3. If token found, call `GET /user/me?token={token}` → store `user_id` and `config` in app state
4. Filter displayed princesses to `config.favorite_princesses` (fallback: show all)

No login screen. No auth. Token is a long-lived opaque identifier.

---

## Admin App (`admin/`)

Separate Next.js app at project root. Runs on port **3001**. Uses Tailwind v4 + shadcn/ui, same stack as `frontend/`.

### Layout

Icon-only sidebar (dark, `#0f172a` background). Two nav items:
- 👥 Connected Users
- ⭐ Favorite Characters

Top bar shows page title + subtitle. Content area on light slate background.

### Screen 1 — Connected Users (`/users`)

Table columns: Name, Telegram Chat ID, Token, Actions.

- **Add User** button → inline form or modal: name + Telegram chat ID fields → submit → token auto-generated and shown
- **Remove** button per row → confirmation → DELETE
- No "Status" column — a user either exists (active) or has been removed

### Screen 2 — Favorite Characters (`/characters`)

One row per user. Each row shows the user's name + inline princess chips (one per persona YAML file).

- Chips toggle selected/unselected on click
- Counter shows `N / 5 selected`
- Selecting a 6th chip is disabled (max 5)
- Changes auto-save on toggle (PUT `/admin/users/{id}/preferences`)
- 0 selected = "shows all" (no filtering on main frontend)

Princess list is read from `GET /admin/personas` — a new lightweight endpoint that reads `backend/personas/*.yaml` filenames and returns `[{id, name}]`. This keeps personas as the single source of truth.

---

## Project Structure

```
the-royal-dispatch/
├── backend/
│   ├── main.py                      ← add /admin/* and /user/* routes
│   └── db/migrations/               ← new migration for users + user_preferences
├── frontend/                        ← existing Emma app
│   ├── lib/api.ts                   ← token resolution on load
│   └── app/[locale]/page.tsx        ← filter princesses by favorites
├── admin/                           ← NEW micro-app
│   ├── app/
│   │   ├── layout.tsx               ← icon sidebar shell
│   │   ├── users/page.tsx           ← Connected Users screen
│   │   └── characters/page.tsx      ← Favorite Characters screen
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── UsersTable.tsx
│   │   └── CharactersPicker.tsx
│   ├── lib/api.ts                   ← calls /admin/* endpoints
│   ├── package.json
│   └── .env.local                   ← NEXT_PUBLIC_API_URL=http://localhost:8000
└── docker-compose.yml               ← add admin service on :3001
```

---

## Environment / Docker

Add to `docker-compose.yml`:

```yaml
admin:
  build:
    context: ./admin
    dockerfile: Dockerfile
  ports:
    - "3001:3001"
  environment:
    - NODE_ENV=production
  env_file:
    - ./admin/.env.local
  restart: unless-stopped
  depends_on:
    - backend
```

New env var for `admin/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Out of Scope

- Admin authentication (family-internal app)
- Per-story briefs being attributed to a specific user in the current pipeline (user_id flows into n8n but story generation stays as-is for now)
- Token rotation / revocation UI (can be done manually in Supabase)
