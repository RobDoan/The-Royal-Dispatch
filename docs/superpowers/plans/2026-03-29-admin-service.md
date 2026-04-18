# Admin Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate admin micro-app (`admin/`) for managing connected Telegram users and per-user favorite princess selections, backed by two new Supabase tables and new FastAPI routes.

**Architecture:** New `users` + `user_preferences` Supabase tables. New `/admin/*` and `/user/*` routes added to the existing FastAPI backend. A new Next.js app at `admin/` (port 3001) provides the management UI. The main Emma frontend resolves a URL token to filter which princesses are displayed.

**Tech Stack:** Python/FastAPI (backend), Next.js 16 + Tailwind v4 + shadcn/ui (admin), Vitest + React Testing Library (admin tests), pytest + pytest-mock (backend tests), Supabase (postgres), Docker Compose.

---

## File Map

**Created:**
- `backend/db/migrations/003_users.sql` — new tables
- `backend/tests/test_admin_routes.py` — backend route tests
- `frontend/lib/user.ts` — token resolution helpers
- `frontend/hooks/useUser.ts` — React hook for token → user profile
- `admin/package.json`
- `admin/tsconfig.json`
- `admin/next.config.ts`
- `admin/postcss.config.mjs`
- `admin/components.json`
- `admin/app/globals.css`
- `admin/app/layout.tsx`
- `admin/app/page.tsx`
- `admin/lib/api.ts`
- `admin/components/Sidebar.tsx`
- `admin/components/UsersTable.tsx`
- `admin/components/CharactersPicker.tsx`
- `admin/app/users/page.tsx`
- `admin/app/characters/page.tsx`
- `admin/tests/setup.ts`
- `admin/tests/api.test.ts`
- `admin/tests/CharactersPicker.test.tsx`
- `admin/vitest.config.ts`
- `admin/.env.local.example`
- `admin/Dockerfile`

**Modified:**
- `backend/main.py` — add admin + user routes
- `frontend/app/[locale]/(tabs)/inbox/page.tsx` — filter by user favorites
- `frontend/app/[locale]/(tabs)/story/page.tsx` — filter by user favorites
- `docker-compose.yml` — add admin service
- `n8n/telegram-brief.json` — replace PARENT_CHAT_ID check with backend lookup

---

## Task 1: DB Migration — users and user_preferences tables

**Files:**
- Create: `backend/db/migrations/003_users.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Run in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  telegram_chat_id  bigint UNIQUE NOT NULL,
  token             text UNIQUE NOT NULL,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id  uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  config   jsonb NOT NULL DEFAULT '{}'
);
```

- [ ] **Step 2: Run the migration in Supabase**

Open Supabase dashboard → SQL Editor → paste and run `003_users.sql`.

Expected: two new tables visible in Table Editor with correct columns.

- [ ] **Step 3: Commit**

```bash
git add backend/db/migrations/003_users.sql
git commit -m "feat: add users and user_preferences migration"
```

---

## Task 2: Backend — Admin user routes

**Files:**
- Modify: `backend/main.py`
- Create: `backend/tests/test_admin_routes.py`

### Context

The backend uses FastAPI + Supabase client (`get_supabase_client()`). Tests use `pytest-mock` with `MagicMock`, patching `backend.main.get_supabase_client`. Token generation: `"tk_" + secrets.token_hex(8)` (16 hex chars).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_admin_routes.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
import secrets


def make_client(mocker):
    mocker.patch("backend.main.royal_graph")
    from backend.main import app
    return TestClient(app)


def test_list_users_returns_empty_list(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = []
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/admin/users")
    assert response.status_code == 200
    assert response.json() == []


def test_list_users_returns_rows(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = [
        {"id": "uuid-1", "name": "Quy", "telegram_chat_id": 12345, "token": "tk_abc", "created_at": "2026-01-01T00:00:00Z"},
    ]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/admin/users")
    assert response.status_code == 200
    assert response.json()[0]["name"] == "Quy"


def test_create_user_returns_created_user(mocker):
    created = {"id": "uuid-1", "name": "Quy", "telegram_chat_id": 12345, "token": "tk_abc12345678def90", "created_at": "2026-01-01T00:00:00Z"}
    mock_sb = MagicMock()
    mock_sb.table.return_value.insert.return_value.execute.return_value.data = [created]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    mocker.patch("backend.main.secrets.token_hex", return_value="abc12345678def90")
    client = make_client(mocker)
    response = client.post("/admin/users", json={"name": "Quy", "telegram_chat_id": 12345})
    assert response.status_code == 201
    assert response.json()["token"] == "tk_abc12345678def90"


def test_create_user_rejects_missing_name(mocker):
    client = make_client(mocker)
    response = client.post("/admin/users", json={"telegram_chat_id": 12345})
    assert response.status_code == 422


def test_delete_user_returns_no_content(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.delete.return_value.eq.return_value.execute.return_value.data = [{"id": "uuid-1"}]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.delete("/admin/users/uuid-1")
    assert response.status_code == 204


def test_get_preferences_returns_config(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"user_id": "uuid-1", "config": {"favorite_princesses": ["elsa", "belle"]}}
    ]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/admin/users/uuid-1/preferences")
    assert response.status_code == 200
    assert response.json()["config"]["favorite_princesses"] == ["elsa", "belle"]


def test_get_preferences_returns_404_when_not_found(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/admin/users/uuid-999/preferences")
    assert response.status_code == 404


def test_put_preferences_upserts_and_returns_config(mocker):
    config = {"favorite_princesses": ["ariel"]}
    mock_sb = MagicMock()
    mock_sb.table.return_value.upsert.return_value.execute.return_value.data = [
        {"user_id": "uuid-1", "config": config}
    ]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.put("/admin/users/uuid-1/preferences", json={"config": config})
    assert response.status_code == 200
    assert response.json()["config"]["favorite_princesses"] == ["ariel"]


def test_list_personas_returns_persona_ids(mocker):
    client = make_client(mocker)
    response = client.get("/admin/personas")
    assert response.status_code == 200
    data = response.json()
    ids = [p["id"] for p in data]
    assert "elsa" in ids
    assert "belle" in ids


def test_get_user_by_token_returns_user(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"id": "uuid-1", "name": "Quy", "token": "tk_abc"}
    ]
    mock_sb2 = MagicMock()
    mock_sb2.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"user_id": "uuid-1", "config": {"favorite_princesses": ["elsa"]}}
    ]
    mocker.patch("backend.main.get_supabase_client", side_effect=[mock_sb, mock_sb2])
    client = make_client(mocker)
    response = client.get("/user/me?token=tk_abc")
    assert response.status_code == 200
    assert response.json()["user_id"] == "uuid-1"
    assert response.json()["config"]["favorite_princesses"] == ["elsa"]


def test_get_user_by_token_returns_404_for_unknown_token(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/user/me?token=bad_token")
    assert response.status_code == 404


def test_get_user_by_chat_id_returns_user(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"id": "uuid-1", "name": "Quy"}
    ]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/user/by-chat-id?chat_id=12345")
    assert response.status_code == 200
    assert response.json()["user_id"] == "uuid-1"


def test_get_user_by_chat_id_returns_404_for_unknown(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/user/by-chat-id?chat_id=99999")
    assert response.status_code == 404
```

- [ ] **Step 2: Run tests to verify they all fail**

```bash
cd backend
pytest tests/test_admin_routes.py -v
```

Expected: all FAIL with `404 Not Found` or `ImportError` (routes don't exist yet).

- [ ] **Step 3: Add admin and user routes to backend/main.py**

Add `import secrets` and `import glob` at the top of `backend/main.py`. Then add these Pydantic models and route handlers after the existing routes:

```python
import secrets
import glob as glob_module

# ── Pydantic models ──────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    name: str
    telegram_chat_id: int

class UserResponse(BaseModel):
    id: str
    name: str
    telegram_chat_id: int
    token: str
    created_at: str

class PreferencesResponse(BaseModel):
    user_id: str
    config: dict

class UpdatePreferencesRequest(BaseModel):
    config: dict

class PersonaResponse(BaseModel):
    id: str
    name: str

class UserMeResponse(BaseModel):
    user_id: str
    name: str
    config: dict

class UserByChatIdResponse(BaseModel):
    user_id: str
    name: str

# ── Admin: users ─────────────────────────────────────────────────────────────

@app.get("/admin/users", response_model=list[UserResponse])
def admin_list_users():
    client = get_supabase_client()
    result = client.table("users").select("*").order("created_at").execute()
    return result.data or []

@app.post("/admin/users", response_model=UserResponse, status_code=201)
def admin_create_user(req: CreateUserRequest):
    token = "tk_" + secrets.token_hex(8)
    client = get_supabase_client()
    result = client.table("users").insert({
        "name": req.name,
        "telegram_chat_id": req.telegram_chat_id,
        "token": token,
    }).execute()
    return result.data[0]

@app.delete("/admin/users/{user_id}", status_code=204)
def admin_delete_user(user_id: str):
    client = get_supabase_client()
    client.table("users").delete().eq("id", user_id).execute()

# ── Admin: preferences ───────────────────────────────────────────────────────

@app.get("/admin/users/{user_id}/preferences", response_model=PreferencesResponse)
def admin_get_preferences(user_id: str):
    client = get_supabase_client()
    result = client.table("user_preferences").select("*").eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Preferences not found")
    return result.data[0]

@app.put("/admin/users/{user_id}/preferences", response_model=PreferencesResponse)
def admin_update_preferences(user_id: str, req: UpdatePreferencesRequest):
    client = get_supabase_client()
    result = client.table("user_preferences").upsert({
        "user_id": user_id,
        "config": req.config,
    }).execute()
    return result.data[0]

# ── Admin: personas ──────────────────────────────────────────────────────────

@app.get("/admin/personas", response_model=list[PersonaResponse])
def admin_list_personas():
    import os, yaml
    personas_dir = os.path.join(os.path.dirname(__file__), "personas")
    results = []
    for path in sorted(glob_module.glob(os.path.join(personas_dir, "*.yaml"))):
        persona_id = os.path.splitext(os.path.basename(path))[0]
        with open(path) as f:
            data = yaml.safe_load(f)
        results.append({"id": persona_id, "name": data.get("name", persona_id)})
    return results

# ── User resolution ───────────────────────────────────────────────────────────

@app.get("/user/me", response_model=UserMeResponse)
def get_user_by_token(token: str = Query(...)):
    client = get_supabase_client()
    result = client.table("users").select("id,name,token").eq("token", token).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    user = result.data[0]
    prefs = client.table("user_preferences").select("config").eq("user_id", user["id"]).execute()
    config = prefs.data[0]["config"] if prefs.data else {}
    return {"user_id": user["id"], "name": user["name"], "config": config}

@app.get("/user/by-chat-id", response_model=UserByChatIdResponse)
def get_user_by_chat_id(chat_id: int = Query(...)):
    client = get_supabase_client()
    result = client.table("users").select("id,name").eq("telegram_chat_id", chat_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    user = result.data[0]
    return {"user_id": user["id"], "name": user["name"]}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
pytest tests/test_admin_routes.py -v
```

Expected: all PASS.

- [ ] **Step 5: Run full test suite to verify no regressions**

```bash
pytest tests/ -v
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/test_admin_routes.py
git commit -m "feat: add admin and user resolution routes to FastAPI"
```

---

## Task 3: Frontend — Token resolution and princess filtering

**Files:**
- Create: `frontend/lib/user.ts`
- Create: `frontend/hooks/useUser.ts`
- Modify: `frontend/app/[locale]/(tabs)/inbox/page.tsx`
- Modify: `frontend/app/[locale]/(tabs)/story/page.tsx`

### Context

Both `inbox/page.tsx` and `story/page.tsx` are `'use client'` components that iterate `Object.entries(PRINCESS_META)` from `@/lib/princesses`. We need to filter that list based on `config.favorite_princesses` from the backend. Token lives in `localStorage` (key: `royal_token`) or URL param `?token=`. If no token or no favorites set, show all.

- [ ] **Step 1: Create frontend/lib/user.ts**

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface UserProfile {
  user_id: string;
  name: string;
  config: {
    favorite_princesses?: string[];
  };
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('royal_token');
}

export function storeToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('royal_token', token);
}

export function getTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}

export async function fetchUserProfile(token: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${API_URL}/user/me?token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Create frontend/hooks/useUser.ts**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { getStoredToken, getTokenFromUrl, storeToken, fetchUserProfile, type UserProfile } from '@/lib/user';
import { PRINCESS_META, type PrincessId } from '@/lib/princesses';

const ALL_PRINCESS_IDS = Object.keys(PRINCESS_META) as PrincessId[];

interface UseUserResult {
  profile: UserProfile | null;
  activePrincessIds: PrincessId[];
  loading: boolean;
}

export function useUser(): UseUserResult {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function resolve() {
      let token = getStoredToken();
      if (!token) {
        const urlToken = getTokenFromUrl();
        if (urlToken) {
          storeToken(urlToken);
          token = urlToken;
        }
      }
      if (token) {
        const p = await fetchUserProfile(token);
        setProfile(p);
      }
      setLoading(false);
    }
    resolve();
  }, []);

  const favorites = profile?.config?.favorite_princesses;
  const activePrincessIds: PrincessId[] =
    favorites && favorites.length > 0
      ? (favorites.filter((id) => id in PRINCESS_META) as PrincessId[])
      : ALL_PRINCESS_IDS;

  return { profile, activePrincessIds, loading };
}
```

- [ ] **Step 3: Update frontend/app/[locale]/(tabs)/inbox/page.tsx**

Replace the `Object.entries(PRINCESS_META)` loop to use `activePrincessIds` from `useUser`. The full updated file:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { requestStory } from '@/lib/api';
import { PRINCESS_META, type PrincessId } from '@/lib/princesses';
import { ChevronRight } from 'lucide-react';
import { useUser } from '@/hooks/useUser';

export default function InboxPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('app');
  const { activePrincessIds } = useUser();

  async function handleTap(princessId: PrincessId) {
    requestStory(princessId, locale as 'en' | 'vi', 'daily');
    router.push(`/${locale}/play/${princessId}`);
  }

  return (
    <main className="font-sans py-10">
      <div className="px-6 pt-safe">
        <h1 className="text-3xl font-black tracking-tight text-gray-900 mb-1 pt-8">
          {t('title')}
        </h1>
        <p className="text-gray-500 text-sm font-medium mb-6">{t('subtitle')}</p>

        <div className="flex flex-col gap-3">
          {activePrincessIds.map((id) => {
            const meta = PRINCESS_META[id];
            return (
              <button
                key={id}
                onClick={() => handleTap(id)}
                className="flex items-center gap-4 bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform text-left w-full"
              >
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                  <img
                    src={`/characters/${id}.png`}
                    alt={meta.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-[15px] leading-tight">{meta.name}</p>
                  <p className="text-gray-400 text-xs font-medium mt-0.5 truncate">{t(`origins.${id}`)}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Update frontend/app/[locale]/(tabs)/story/page.tsx**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { requestStory } from '@/lib/api';
import { PRINCESS_META, type PrincessId } from '@/lib/princesses';
import { PrincessCard } from '@/components/PrincessCard';
import { useUser } from '@/hooks/useUser';

export default function StoryPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('app');
  const tStory = useTranslations('story');
  const { activePrincessIds } = useUser();

  async function handleTap(princessId: PrincessId) {
    requestStory(princessId, locale as 'en' | 'vi', 'life_lesson');
    router.push(`/${locale}/story/${princessId}`);
  }

  return (
    <main className="font-sans py-10">
      <div className="pt-safe px-6">
        <div className="grid grid-cols-2 gap-4">
          {activePrincessIds.map((id) => {
            const meta = PRINCESS_META[id];
            return (
              <PrincessCard
                key={id}
                variant="poster"
                princess={{
                  id,
                  name: meta.name,
                  origin: meta.origin,
                  emoji: meta.emoji,
                  imageUrl: `/characters/${id}.png`,
                  avatarGradient: 'from-black/20 to-black/80',
                }}
                onClick={handleTap}
              />
            );
          })}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run the frontend dev server and verify manually**

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000/en/inbox` — all princesses should show (no token). Open `http://localhost:3000/en/inbox?token=<real_token>` — only favorites should show after token is stored. Refresh without param — still filtered.

- [ ] **Step 6: Run existing frontend tests to verify no regressions**

```bash
cd frontend
npx vitest run
```

Expected: all PASS (we didn't change component interfaces, only rendering logic).

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/user.ts frontend/hooks/useUser.ts \
  "frontend/app/[locale]/(tabs)/inbox/page.tsx" \
  "frontend/app/[locale]/(tabs)/story/page.tsx"
git commit -m "feat: token-based user resolution and princess filtering in main frontend"
```

---

## Task 4: Admin app — Scaffold (package, config, layout)

**Files:**
- Create: `admin/package.json`
- Create: `admin/tsconfig.json`
- Create: `admin/next.config.ts`
- Create: `admin/postcss.config.mjs`
- Create: `admin/components.json`
- Create: `admin/app/globals.css`
- Create: `admin/app/layout.tsx`
- Create: `admin/app/page.tsx`
- Create: `admin/.env.local.example`

- [ ] **Step 1: Create admin/package.json**

```json
{
  "name": "admin",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "lint": "eslint"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.6.0",
    "next": "16.2.1",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "shadcn": "^4.1.0",
    "tailwind-merge": "^3.5.0",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^6.0.1",
    "eslint": "^9",
    "eslint-config-next": "16.2.1",
    "jsdom": "^29.0.1",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^4.1.1"
  }
}
```

- [ ] **Step 2: Create admin/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create admin/next.config.ts**

```typescript
import type { NextConfig } from 'next';

const config: NextConfig = {};
export default config;
```

- [ ] **Step 4: Create admin/postcss.config.mjs**

```javascript
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
export default config;
```

- [ ] **Step 5: Create admin/components.json** (shadcn/ui config)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-nova",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 6: Create admin/app/globals.css**

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --background: 222 47% 7%;
  --foreground: 213 31% 91%;
  --card: 222 47% 9%;
  --card-foreground: 213 31% 91%;
  --border: 217 33% 17%;
  --input: 217 33% 17%;
  --primary: 239 84% 67%;
  --primary-foreground: 0 0% 100%;
  --muted: 217 33% 17%;
  --muted-foreground: 215 20% 45%;
  --accent: 217 33% 17%;
  --accent-foreground: 213 31% 91%;
  --destructive: 0 63% 55%;
  --destructive-foreground: 0 0% 100%;
  --radius: 0.5rem;
  --sidebar-bg: #0f172a;
  --sidebar-border: #1e293b;
  --topbar-bg: #0f172a;
}

* {
  border-color: hsl(var(--border));
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
}
```

- [ ] **Step 7: Create admin/app/layout.tsx**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Royal Dispatch Admin',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Create admin/app/page.tsx** (redirect to /users)

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/users');
}
```

- [ ] **Step 9: Create admin/.env.local.example**

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Copy to `admin/.env.local`:

```bash
cp admin/.env.local.example admin/.env.local
```

- [ ] **Step 10: Install dependencies**

```bash
cd admin
npm install
```

- [ ] **Step 11: Verify app starts**

```bash
npm run dev
```

Open `http://localhost:3001` — should redirect to `/users` (404 for now, but no crash).

- [ ] **Step 12: Commit**

```bash
cd ..
git add admin/package.json admin/tsconfig.json admin/next.config.ts \
  admin/postcss.config.mjs admin/components.json admin/app/globals.css \
  admin/app/layout.tsx admin/app/page.tsx admin/.env.local.example
git commit -m "feat: scaffold admin Next.js app"
```

---

## Task 5: Admin app — API client

**Files:**
- Create: `admin/lib/api.ts`
- Create: `admin/lib/utils.ts`
- Create: `admin/tests/setup.ts`
- Create: `admin/tests/api.test.ts`
- Create: `admin/vitest.config.ts`

- [ ] **Step 1: Create admin/lib/utils.ts**

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Write failing tests for API client**

Create `admin/tests/setup.ts`:

```typescript
import '@testing-library/jest-dom';
```

Create `admin/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
```

Create `admin/tests/api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const API_URL = 'http://localhost:8000';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('listUsers', () => {
  it('returns array of users', async () => {
    const mockUsers = [{ id: 'u1', name: 'Quy', telegram_chat_id: 12345, token: 'tk_abc', created_at: '2026-01-01T00:00:00Z' }];
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    } as Response);

    const { listUsers } = await import('@/lib/api');
    const result = await listUsers();
    expect(result).toEqual(mockUsers);
    expect(fetch).toHaveBeenCalledWith(`${API_URL}/admin/users`);
  });
});

describe('createUser', () => {
  it('posts name and telegram_chat_id, returns created user', async () => {
    const created = { id: 'u1', name: 'Quy', telegram_chat_id: 12345, token: 'tk_newtoken', created_at: '2026-01-01T00:00:00Z' };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => created,
    } as Response);

    const { createUser } = await import('@/lib/api');
    const result = await createUser('Quy', 12345);
    expect(result).toEqual(created);
    expect(fetch).toHaveBeenCalledWith(`${API_URL}/admin/users`, expect.objectContaining({ method: 'POST' }));
  });
});

describe('deleteUser', () => {
  it('sends DELETE request', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response);
    const { deleteUser } = await import('@/lib/api');
    await deleteUser('u1');
    expect(fetch).toHaveBeenCalledWith(`${API_URL}/admin/users/u1`, expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('updatePreferences', () => {
  it('PUTs config and returns updated prefs', async () => {
    const prefs = { user_id: 'u1', config: { favorite_princesses: ['elsa'] } };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => prefs,
    } as Response);

    const { updatePreferences } = await import('@/lib/api');
    const result = await updatePreferences('u1', { favorite_princesses: ['elsa'] });
    expect(result).toEqual(prefs);
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/admin/users/u1/preferences`,
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});

describe('listPersonas', () => {
  it('returns persona list', async () => {
    const personas = [{ id: 'elsa', name: 'Queen Elsa' }, { id: 'belle', name: 'Belle' }];
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => personas,
    } as Response);

    const { listPersonas } = await import('@/lib/api');
    const result = await listPersonas();
    expect(result).toEqual(personas);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd admin
npx vitest run tests/api.test.ts
```

Expected: FAIL — `@/lib/api` does not exist.

- [ ] **Step 4: Create admin/lib/api.ts**

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface User {
  id: string;
  name: string;
  telegram_chat_id: number;
  token: string;
  created_at: string;
}

export interface UserPreferences {
  user_id: string;
  config: {
    favorite_princesses?: string[];
    [key: string]: unknown;
  };
}

export interface Persona {
  id: string;
  name: string;
}

export async function listUsers(): Promise<User[]> {
  const res = await fetch(`${API_URL}/admin/users`);
  if (!res.ok) throw new Error('Failed to list users');
  return res.json();
}

export async function createUser(name: string, telegram_chat_id: number): Promise<User> {
  const res = await fetch(`${API_URL}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, telegram_chat_id }),
  });
  if (!res.ok) throw new Error('Failed to create user');
  return res.json();
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete user');
}

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const res = await fetch(`${API_URL}/admin/users/${userId}/preferences`);
  if (!res.ok) throw new Error('Failed to get preferences');
  return res.json();
}

export async function updatePreferences(userId: string, config: Record<string, unknown>): Promise<UserPreferences> {
  const res = await fetch(`${API_URL}/admin/users/${userId}/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) throw new Error('Failed to update preferences');
  return res.json();
}

export async function listPersonas(): Promise<Persona[]> {
  const res = await fetch(`${API_URL}/admin/personas`);
  if (!res.ok) throw new Error('Failed to list personas');
  return res.json();
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/api.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
cd ..
git add admin/lib/api.ts admin/lib/utils.ts admin/vitest.config.ts \
  admin/tests/setup.ts admin/tests/api.test.ts
git commit -m "feat: add admin API client with tests"
```

---

## Task 6: Admin app — Sidebar and shell layout

**Files:**
- Create: `admin/components/Sidebar.tsx`
- Modify: `admin/app/layout.tsx`

- [ ] **Step 1: Create admin/components/Sidebar.tsx**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/users', icon: Users, label: 'Connected Users' },
  { href: '/characters', icon: Star, label: 'Favorite Characters' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-14 flex-shrink-0 flex flex-col items-center py-4 gap-2"
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}>
      {/* Logo */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base mb-4"
        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
        👑
      </div>

      {/* Nav items */}
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center transition-colors group relative',
              active
                ? 'text-indigo-400'
                : 'text-slate-500 hover:text-slate-300',
            )}
            style={{ background: active ? 'hsl(var(--accent))' : undefined }}
          >
            <Icon size={18} />
            {/* Tooltip */}
            <span className="absolute left-12 bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
              {label}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}
```

- [ ] **Step 2: Update admin/app/layout.tsx to include sidebar**

```tsx
import type { Metadata } from 'next';
import { Sidebar } from '@/components/Sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Royal Dispatch Admin',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify the shell renders**

```bash
cd admin && npm run dev
```

Open `http://localhost:3001` — sidebar with crown logo and two nav icons should be visible on the left. Hover over icons to see tooltips.

- [ ] **Step 4: Commit**

```bash
cd ..
git add admin/components/Sidebar.tsx admin/app/layout.tsx
git commit -m "feat: add icon sidebar shell to admin app"
```

---

## Task 7: Admin app — Connected Users page

**Files:**
- Create: `admin/components/UsersTable.tsx`
- Create: `admin/app/users/page.tsx`

- [ ] **Step 1: Create admin/components/UsersTable.tsx**

```tsx
'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { createUser, deleteUser, type User } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  initialUsers: User[];
}

export function UsersTable({ initialUsers }: Props) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [name, setName] = useState('');
  const [chatId, setChatId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !chatId.trim()) return;
    setSubmitting(true);
    setError(null);
    setNewToken(null);
    try {
      const user = await createUser(name.trim(), parseInt(chatId.trim(), 10));
      setUsers((prev) => [...prev, user]);
      setNewToken(user.token);
      setName('');
      setChatId('');
    } catch {
      setError('Failed to create user. Check the Telegram chat ID is unique.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this user? This cannot be undone.')) return;
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch {
      setError('Failed to remove user.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Add user form */}
      <form onSubmit={handleCreate} className="flex gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Quy (Dad)"
            className="px-3 py-2 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Telegram Chat ID</label>
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="e.g. 5863873556"
            type="number"
            className="px-3 py-2 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !name.trim() || !chatId.trim()}
          className="px-4 py-2 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Adding...' : '+ Add User'}
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {newToken && (
        <div className="p-3 rounded-md bg-slate-800 border border-indigo-600 text-sm">
          <span className="text-slate-400">User created. Share this token for the frontend URL: </span>
          <code className="text-indigo-300 font-mono ml-1">{newToken}</code>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Telegram Chat ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Token</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-sm">
                  No users yet. Add one above.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30">
                <td className="px-4 py-3 text-slate-200 font-medium">{user.name}</td>
                <td className="px-4 py-3 text-slate-400 font-mono">{user.telegram_chat_id}</td>
                <td className="px-4 py-3">
                  <code className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded font-mono">{user.token}</code>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(user.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
                    title="Remove user"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create admin/app/users/page.tsx**

```tsx
import { listUsers } from '@/lib/api';
import { UsersTable } from '@/components/UsersTable';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  let users = [];
  try {
    users = await listUsers();
  } catch {
    // backend unreachable during dev — start empty
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Topbar */}
      <div className="h-13 flex-shrink-0 flex items-center justify-between px-6 border-b"
        style={{ borderColor: 'var(--sidebar-border)', background: 'var(--topbar-bg)' }}>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-slate-100">Connected Users</h1>
          <span className="text-xs text-slate-500">{users.length} registered</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <UsersTable initialUsers={users} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the page renders**

```bash
cd admin && npm run dev
```

Open `http://localhost:3001/users` — table with Add User form should appear. If backend is running, existing users load; otherwise shows empty state.

- [ ] **Step 4: Commit**

```bash
cd ..
git add admin/components/UsersTable.tsx admin/app/users/page.tsx
git commit -m "feat: add Connected Users page to admin"
```

---

## Task 8: Admin app — Favorite Characters page

**Files:**
- Create: `admin/components/CharactersPicker.tsx`
- Create: `admin/app/characters/page.tsx`
- Create: `admin/tests/CharactersPicker.test.tsx`

- [ ] **Step 1: Write failing tests for CharactersPicker**

Create `admin/tests/CharactersPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharactersPicker } from '@/components/CharactersPicker';

const personas = [
  { id: 'elsa', name: 'Queen Elsa' },
  { id: 'belle', name: 'Belle' },
  { id: 'cinderella', name: 'Cinderella' },
  { id: 'ariel', name: 'Ariel' },
];

describe('CharactersPicker', () => {
  it('renders all persona chips', () => {
    render(
      <CharactersPicker
        userId="u1"
        personas={personas}
        initialSelected={[]}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByText('Queen Elsa')).toBeInTheDocument();
    expect(screen.getByText('Belle')).toBeInTheDocument();
    expect(screen.getByText('Cinderella')).toBeInTheDocument();
    expect(screen.getByText('Ariel')).toBeInTheDocument();
  });

  it('shows initially selected chips as active', () => {
    render(
      <CharactersPicker
        userId="u1"
        personas={personas}
        initialSelected={['elsa', 'belle']}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByText('2 / 5 selected')).toBeInTheDocument();
  });

  it('toggles a chip on click and calls onSave', () => {
    const onSave = vi.fn();
    render(
      <CharactersPicker
        userId="u1"
        personas={personas}
        initialSelected={[]}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByTestId('chip-elsa'));
    expect(onSave).toHaveBeenCalledWith('u1', ['elsa']);
    expect(screen.getByText('1 / 5 selected')).toBeInTheDocument();
  });

  it('does not allow selecting more than 5', () => {
    const onSave = vi.fn();
    const fivePersonas = [
      ...personas,
      { id: 'rapunzel', name: 'Rapunzel' },
      { id: 'moana', name: 'Moana' },
    ];
    render(
      <CharactersPicker
        userId="u1"
        personas={fivePersonas}
        initialSelected={['elsa', 'belle', 'cinderella', 'ariel', 'rapunzel']}
        onSave={onSave}
      />
    );
    expect(screen.getByText('5 / 5 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chip-moana'));
    // onSave should NOT be called when at max
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('5 / 5 selected')).toBeInTheDocument();
  });

  it('deselects a chip when already selected', () => {
    const onSave = vi.fn();
    render(
      <CharactersPicker
        userId="u1"
        personas={personas}
        initialSelected={['elsa']}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByTestId('chip-elsa'));
    expect(onSave).toHaveBeenCalledWith('u1', []);
    expect(screen.getByText('0 / 5 selected')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd admin
npx vitest run tests/CharactersPicker.test.tsx
```

Expected: FAIL — `@/components/CharactersPicker` does not exist.

- [ ] **Step 3: Create admin/components/CharactersPicker.tsx**

```tsx
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Persona } from '@/lib/api';

const MAX_FAVORITES = 5;

interface Props {
  userId: string;
  personas: Persona[];
  initialSelected: string[];
  onSave: (userId: string, selected: string[]) => void;
}

export function CharactersPicker({ userId, personas, initialSelected, onSave }: Props) {
  const [selected, setSelected] = useState<string[]>(initialSelected);

  function toggle(id: string) {
    if (selected.includes(id)) {
      const next = selected.filter((s) => s !== id);
      setSelected(next);
      onSave(userId, next);
    } else {
      if (selected.length >= MAX_FAVORITES) return; // max reached
      const next = [...selected, id];
      setSelected(next);
      onSave(userId, next);
    }
  }

  const atMax = selected.length >= MAX_FAVORITES;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">
        <span className="text-slate-300 font-medium">{selected.length} / {MAX_FAVORITES} selected</span>
        {selected.length === 0 && <span className="ml-2 text-slate-600">(shows all)</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {personas.map((persona) => {
          const isSelected = selected.includes(persona.id);
          const isDisabled = !isSelected && atMax;
          return (
            <button
              key={persona.id}
              data-testid={`chip-${persona.id}`}
              onClick={() => toggle(persona.id)}
              disabled={isDisabled}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                isSelected
                  ? 'bg-indigo-900/60 border-indigo-500 text-indigo-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500',
                isDisabled && 'opacity-40 cursor-not-allowed',
              )}
            >
              {persona.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/CharactersPicker.test.tsx
```

Expected: all PASS.

- [ ] **Step 5: Create admin/app/characters/page.tsx**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { listUsers, listPersonas, getPreferences, updatePreferences, type User, type Persona } from '@/lib/api';
import { CharactersPicker } from '@/components/CharactersPicker';

export default function CharactersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [prefs, setPrefs] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [u, p] = await Promise.all([listUsers(), listPersonas()]);
        setUsers(u);
        setPersonas(p);
        const prefsMap: Record<string, string[]> = {};
        await Promise.all(
          u.map(async (user) => {
            try {
              const pref = await getPreferences(user.id);
              prefsMap[user.id] = pref.config.favorite_princesses ?? [];
            } catch {
              prefsMap[user.id] = [];
            }
          }),
        );
        setPrefs(prefsMap);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave(userId: string, selected: string[]) {
    setPrefs((prev) => ({ ...prev, [userId]: selected }));
    await updatePreferences(userId, { favorite_princesses: selected });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Topbar */}
      <div className="h-13 flex-shrink-0 flex items-center px-6 border-b gap-2"
        style={{ borderColor: 'var(--sidebar-border)', background: 'var(--topbar-bg)' }}>
        <h1 className="text-sm font-semibold text-slate-100">Favorite Characters</h1>
        <span className="text-xs text-slate-500">per user · max 5</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="p-6 text-sm text-slate-500">Loading...</p>
        )}
        {!loading && users.length === 0 && (
          <p className="p-6 text-sm text-slate-500">No users yet. Add users first.</p>
        )}
        {!loading && users.map((user) => (
          <div key={user.id} className="flex items-start gap-6 px-6 py-4 border-b last:border-0"
            style={{ borderColor: 'var(--sidebar-border)' }}>
            <div className="min-w-36">
              <p className="text-sm font-semibold text-slate-100">{user.name}</p>
            </div>
            <CharactersPicker
              userId={user.id}
              personas={personas}
              initialSelected={prefs[user.id] ?? []}
              onSave={handleSave}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run all admin tests**

```bash
cd admin
npx vitest run
```

Expected: all PASS.

- [ ] **Step 7: Verify the characters page renders**

```bash
npm run dev
```

Open `http://localhost:3001/characters` — one row per user with persona chips. Clicking chips toggles selection. 6th selection is blocked.

- [ ] **Step 8: Commit**

```bash
cd ..
git add admin/components/CharactersPicker.tsx admin/app/characters/page.tsx \
  admin/tests/CharactersPicker.test.tsx
git commit -m "feat: add Favorite Characters page to admin"
```

---

## Task 9: Docker — Add admin service

**Files:**
- Create: `admin/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Create admin/Dockerfile**

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json ./
COPY package-lock.json* ./

RUN \
  if [ -f package-lock.json ]; then npm ci; \
  else npm install; \
  fi

FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV PORT 3001

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3001

CMD ["npm", "run", "start"]
```

- [ ] **Step 2: Add admin service to docker-compose.yml**

In `docker-compose.yml`, add after the `frontend` service block:

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

- [ ] **Step 3: Verify docker compose build**

```bash
docker compose build admin
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add admin/Dockerfile docker-compose.yml
git commit -m "feat: add admin service to docker compose"
```

---

## Task 10: n8n — Replace PARENT_CHAT_ID with backend lookup

**Files:**
- Modify: `n8n/telegram-brief.json`

### Context

The current flow: `Telegram Trigger → Sender Filter (chat.id == PARENT_CHAT_ID) → Message Type Switch → …`

New flow: `Telegram Trigger → Lookup User (GET /user/by-chat-id) → Sender Filter (status == 200) → Message Type Switch → …`

- [ ] **Step 1: Update n8n/telegram-brief.json**

Replace the `nodes` array and `connections` in `n8n/telegram-brief.json` with:

```json
{
  "name": "Telegram Brief",
  "nodes": [
    {
      "parameters": {
        "updates": ["message"],
        "additionalFields": {}
      },
      "id": "node-telegram-trigger",
      "name": "Telegram Trigger",
      "type": "n8n-nodes-base.telegramTrigger",
      "typeVersion": 1.1,
      "position": [240, 300],
      "webhookId": "royal-dispatch-telegram",
      "credentials": {
        "telegramApi": {
          "id": "telegram-cred-id",
          "name": "Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "method": "GET",
        "url": "={{ $env.BACKEND_URL }}/user/by-chat-id?chat_id={{ $json.message.chat.id }}",
        "options": {
          "response": {
            "response": {
              "fullResponse": true
            }
          }
        }
      },
      "id": "node-lookup-user",
      "name": "Lookup User",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [460, 300]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true },
          "conditions": [
            {
              "leftValue": "={{ $json.statusCode }}",
              "rightValue": 200,
              "operator": { "type": "number", "operation": "equals" }
            }
          ]
        }
      },
      "id": "node-sender-filter",
      "name": "Sender Filter",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [680, 300]
    },
    {
      "parameters": {
        "mode": "rules",
        "rules": {
          "values": [
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{ $('Telegram Trigger').first().json.message.text }}",
                    "operator": { "type": "string", "operation": "exists" }
                  }
                ]
              },
              "outputKey": "text"
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{ $('Telegram Trigger').first().json.message.voice }}",
                    "operator": { "type": "object", "operation": "exists" }
                  }
                ]
              },
              "outputKey": "voice"
            }
          ]
        },
        "fallbackOutput": "none"
      },
      "id": "node-type-switch",
      "name": "Message Type Switch",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [900, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $env.BACKEND_URL }}/brief",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ { text: $('Telegram Trigger').first().json.message.text } }}",
        "options": {}
      },
      "id": "node-post-brief-text",
      "name": "Post Brief (text)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1120, 180]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "={{ 'https://api.telegram.org/bot' + $env.TELEGRAM_BOT_TOKEN + '/getFile?file_id=' + $('Telegram Trigger').first().json.message.voice.file_id }}",
        "options": {}
      },
      "id": "node-get-file-path",
      "name": "Get File Path",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1120, 420]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "={{ 'https://api.telegram.org/file/bot' + $env.TELEGRAM_BOT_TOKEN + '/' + $json.result.file_path }}",
        "options": {
          "response": {
            "response": {
              "responseFormat": "file"
            }
          }
        }
      },
      "id": "node-download-binary",
      "name": "Download File Binary",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1340, 420]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://api.openai.com/v1/audio/transcriptions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "contentType": "multipart-form-data",
        "bodyParameters": {
          "parameters": [
            {
              "parameterType": "formBinaryData",
              "name": "file",
              "inputDataFieldName": "data",
              "options": {
                "filename": "voice.oga",
                "contentType": "audio/ogg"
              }
            },
            {
              "name": "model",
              "value": "whisper-1"
            }
          ]
        },
        "options": {}
      },
      "id": "node-whisper",
      "name": "Whisper Transcribe",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1560, 420],
      "credentials": {
        "httpHeaderAuth": {
          "id": "openai-cred-id",
          "name": "OpenAI"
        }
      }
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $env.BACKEND_URL }}/brief",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ { text: $('Whisper Transcribe').first().json.text } }}",
        "options": {}
      },
      "id": "node-post-brief-voice",
      "name": "Post Brief (voice)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1780, 420]
    }
  ],
  "connections": {
    "Telegram Trigger": {
      "main": [
        [{ "node": "Lookup User", "type": "main", "index": 0 }]
      ]
    },
    "Lookup User": {
      "main": [
        [{ "node": "Sender Filter", "type": "main", "index": 0 }]
      ]
    },
    "Sender Filter": {
      "main": [
        [{ "node": "Message Type Switch", "type": "main", "index": 0 }],
        []
      ]
    },
    "Message Type Switch": {
      "main": [
        [{ "node": "Post Brief (text)", "type": "main", "index": 0 }],
        [{ "node": "Get File Path", "type": "main", "index": 0 }]
      ]
    },
    "Get File Path": {
      "main": [
        [{ "node": "Download File Binary", "type": "main", "index": 0 }]
      ]
    },
    "Download File Binary": {
      "main": [
        [{ "node": "Whisper Transcribe", "type": "main", "index": 0 }]
      ]
    },
    "Whisper Transcribe": {
      "main": [
        [{ "node": "Post Brief (voice)", "type": "main", "index": 0 }]
      ]
    }
  },
  "active": false,
  "settings": {
    "executionOrder": "v1"
  },
  "versionId": "2",
  "meta": {
    "instanceId": "royal-dispatch"
  },
  "id": "royal-dispatch-telegram-brief",
  "tags": []
}
```

- [ ] **Step 2: Re-import the workflow in n8n**

In the n8n UI (`http://localhost:5678`):
1. Go to Workflows → import from file
2. Upload the updated `n8n/telegram-brief.json`
3. Activate the workflow

- [ ] **Step 3: Smoke-test the flow**

Send a Telegram message from a registered chat ID. Check n8n execution log:
- Lookup User → status 200 ✓
- Sender Filter → true branch ✓
- Message Type Switch → correct branch ✓
- Brief posted to backend ✓

Send a message from an unregistered chat ID:
- Lookup User → status 404
- Sender Filter → false branch (dropped) ✓

- [ ] **Step 4: Commit**

```bash
git add n8n/telegram-brief.json
git commit -m "feat: replace hardcoded PARENT_CHAT_ID with dynamic user lookup in n8n"
```

---

## Self-Review Notes

- All spec requirements covered: Connected Users CRUD ✓, Favorites per user ✓, max-5 enforcement ✓, token resolution in frontend ✓, n8n dynamic lookup ✓, Docker service ✓
- `secrets` module import added to `backend/main.py` Task 2 Step 3
- `glob_module` aliased to avoid conflict with Python builtins
- `CharactersPicker` deselection tested (Task 8 Step 1)
- Frontend `useUser` hook: `typeof window` guard prevents SSR crash
- Admin `characters/page.tsx` is `'use client'` (uses `useEffect` + `useState`)
- n8n expressions reference `$('Telegram Trigger').first().json` explicitly since the lookup node sits between trigger and switch
