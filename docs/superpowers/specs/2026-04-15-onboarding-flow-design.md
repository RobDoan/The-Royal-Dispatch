# Onboarding Flow via Signed Token URL

## Overview

Replace the Telegram `/register <name>` and `/add-child` commands with a web onboarding form. The bot's `/register` command (no arguments) replies with a URL containing a stateless HMAC-signed token. The URL opens a form where the parent sets their name and adds children with favorite characters. Submitting the form creates all records in one atomic transaction and redirects to the existing `pick-child` page. The same `/register` command returns the same URL for edit mode, letting parents update their family later.

This replaces the just-landed design in `2026-04-15-telegram-commands-design.md` (which used Telegram-argument parsing). Telegram's argument-only input is too constrained for collecting multiple children + character preferences; a web form handles it cleanly.

## Goals

- Parents can self-register and add/edit children without the admin UI
- Single URL works for initial setup and subsequent edits (idempotent)
- No DB rows created by abandoned `/register` calls
- Atomic reconcile on form submit — no partial state

## Non-Goals

- Account deletion (parent deletes their own account)
- Transferring a child between parents
- Multi-parent-per-child editing from the onboarding form (admin UI still covers this)
- Email/SMS — Telegram-only
- Token rotation / revocation

## End-to-End Flow

### New user

1. Parent types `/register` in Telegram (no arguments).
2. n8n calls `POST /user/register-link` with `{telegram_chat_id}`. Backend generates an HMAC-signed token. **No DB write.** Returns `{token, onboarding_url}`.
3. Bot replies: *"Set up or edit your family here: `<onboarding_url>`"*.
4. Parent opens the link → frontend stores token in `localStorage.royal_token` → `GET /user/me?token=X`.
5. Backend decodes token, extracts `chat_id`, looks up user by `telegram_chat_id`. Not found → returns stub `{user_id: null, name: null, children: []}`.
6. Form renders empty. Parent fills name + ≥1 child with characters → submit.
7. `PUT /user/me?token=X` with full desired state. Backend begins transaction: creates `users` row with `telegram_chat_id` + `name`, creates `children` rows, links via `user_children`, sets `preferences.favorite_princesses`.
8. On 200, frontend redirects to `/[locale]/pick-child`.

### Existing user

1. Parent types `/register` again.
2. n8n calls `POST /user/register-link` → same HMAC token is produced (deterministic: same chat_id + same secret → same output).
3. Bot reply is the same URL.
4. Form load: `GET /user/me?token=X` decodes token → user **is** found by chat_id → returns profile with pre-filled data.
5. Parent edits → submit → `PUT /user/me?token=X` reconciles: updates `name`, upserts children by `id`, deletes linked children absent from the submitted list.
6. Redirect to `pick-child`.

### Nice properties

- Same URL works forever — safe to reshare or bookmark.
- Abandoned `/register` taps leave no trace in the DB.
- No `users.name IS NULL` state — the row only exists once fully initialized.
- No migration to make `users.name` nullable.

## Token Design

**Format:** `<b64url(payload)>.<b64url(hmac_sha256(payload, AUTH_SECRET))>`

**Payload:** `{"chat_id": <int>}` — JSON-encoded with sorted keys for deterministic bytes.

**Deterministic:** Same chat_id + same secret always yields the same token. This is what makes the URL idempotent and "same-link-forever" work.

**No expiry.** Matches the existing `users.token` model (no expiry). Revocation is via `AUTH_SECRET` rotation (invalidates all tokens simultaneously).

**New env var:** `AUTH_SECRET` — 32-byte random hex. Added to `backend/.env.example`, `docker-compose.yml`, k8s secrets.

## Backend Changes

### New utility

`backend/utils/auth_token.py`

- `encode(chat_id: int) -> str`
- `decode(token: str) -> int` — verifies HMAC with `hmac.compare_digest` (constant-time), returns `chat_id`, raises `InvalidTokenError` on tamper/malformed/wrong-secret/missing-signature.

### New endpoint

**`POST /user/register-link`**

- Body: `{"telegram_chat_id": int}`
- Returns: `{"token": str, "onboarding_url": str}`
- Pure stateless — no DB access.
- `onboarding_url` = `f"{FRONTEND_URL}/onboarding?token={token}"` — `FRONTEND_URL` is a new env var.
- Auth: requires `X-N8N-Secret` header matching `N8N_SHARED_SECRET` env var (new, to prevent arbitrary token minting from the public internet).

### Modified endpoint

**`GET /user/me?token=X`**

- HMAC decode → `chat_id` → `SELECT ... WHERE telegram_chat_id = ?`
- Found → return full profile `{user_id, name, children: [{id, name, preferences}]}` (same shape as today)
- Not found → return stub `{user_id: null, name: null, children: []}` (signals "onboarding not yet done")
- HMAC invalid → 401

### New endpoint

**`PUT /user/me?token=X`**

- Body:
  ```json
  {
    "name": "Parent Name",
    "children": [
      {
        "id": "<uuid or null>",
        "name": "Emma",
        "preferences": {"favorite_princesses": ["elsa", "belle"]}
      }
    ]
  }
  ```
- Returns: full updated profile (same shape as `GET /user/me`).
- Transactional reconcile:
  1. Decode HMAC → chat_id
  2. Upsert `users`: if row exists for chat_id, UPDATE `name`; else INSERT `(telegram_chat_id, name)`
  3. Fetch existing linked `child_id` set for this user
  4. For each child in body:
     - `id` present and in existing set → UPDATE `children.name` + `children.preferences`
     - `id` absent → INSERT `children`, INSERT `user_children` link, set preferences
  5. For each existing `child_id` **not** in body → DELETE `children`. FK behavior: `user_children.child_id` `ON DELETE CASCADE` (link removed); `stories.child_id` and `briefs.child_id` `ON DELETE SET NULL` (rows remain orphaned, invisible to any parent). Then call `mem0_client.delete_all(user_id=child_id)` to purge Qdrant memories (best-effort — log and continue on failure).
  6. Commit; return fresh profile
- Validation:
  - `name`: required, non-empty after trim
  - `children`: length ≥ 1
  - Each child `name`: required, non-empty
  - Each child `preferences.favorite_princesses`: length ≤ 5; all entries must exist in persona list
- Errors:
  - 401 invalid token
  - 422 validation (field-level details)
  - 422 unknown character id → `{"detail": "Unknown character: <id>"}`
  - 409 duplicate child name under same parent → enforced in application code (same pattern as `admin_link_user_to_child` in `backend/routes/admin.py`; no unique index on `(user_id, child_name)`)
  - 500 DB error → transaction rolls back

### Schema migration

**`005_drop_user_token.up.sql`**

```sql
ALTER TABLE users DROP COLUMN token;
```

**`005_drop_user_token.down.sql`**

```sql
ALTER TABLE users ADD COLUMN token TEXT;
```

Users created before this migration are wiped (acceptable — pre-launch).

### Admin endpoint compatibility

`POST /admin/users` and `admin_list_users` still return a `token` field in the response shape, now **computed on the fly** via `auth_token.encode(chat_id)` rather than stored. Admin UI is unchanged. Admin-created users authenticate via the same HMAC path in `GET /user/me`.

### Deprecation

No deprecation needed for any backend route. The Telegram-side changes remove the obsolete commands.

## Frontend Changes

### New route

`frontend/app/[locale]/onboarding/page.tsx` — client component.

Lifecycle:
1. On mount: read `?token=X` from URL → store in localStorage (`royal_token`) → `GET /user/me?token=X`
2. If `user_id === null` → initial onboarding mode (empty form, heading "Your Family")
3. Else → edit mode (pre-filled form, heading "Edit Your Family")
4. Render form.

### Form state

```ts
interface ChildDraft {
  id: string | null;    // null = new, not yet saved
  localKey: string;     // stable React key (uuid) for list rendering
  name: string;
  favoritePrincesses: string[];
}

interface FormState {
  parentName: string;
  children: ChildDraft[];
}
```

### UI

Follows the existing enchanted-glassmorphism style (`frontend/app/globals.css` tokens).

- Heading ("Your Family" / "Edit Your Family")
- Parent name input, labeled "Your name" (required)
- Child card list. Each card:
  - Name input
  - Character picker (chips, max 5, hint: "{N}/5 selected" and "shows all" when empty)
  - Remove button → for existing children (has server `id`), opens confirm modal: *"Remove {name}? Their saved memories will be deleted and past stories will be hidden. Continue?"*; for new un-saved children, removed without confirm
- "Add Child" button below the list (always visible)
- Submit button: "Save & Continue" (disabled while submitting or invalid)

### Validation (client-side, mirrors server)

- Parent name non-empty (trimmed)
- ≥1 child
- Each child name non-empty
- Each child's favorites list length ≤ 5 (enforced by picker)

Invalid submit → inline errors, no network call.

### Submit

```
PUT /user/me?token=X
body: {
  name,
  children: [
    {id, name, preferences: {favorite_princesses}}
  ]
}
```

- 200 → `router.push(`/${locale}/pick-child`)`
- 401 → banner: "Your link has expired. Type /register in Telegram for a new one."
- 409 → inline error on the offending child card ("You already have a child named X")
- 422 → map field errors to inputs
- 5xx → generic banner, form state preserved

### New helpers

`frontend/lib/user.ts` gains:

```ts
updateUserProfile(token: string, payload: UpdateUserProfilePayload): Promise<UserProfile | null>
fetchPersonas(): Promise<Persona[]>  // GET /admin/personas (already public)
```

### New component

`frontend/components/CharactersPicker.tsx` — port of `admin/components/CharactersPicker.tsx`. Same semantics (MAX_FAVORITES=5, tap-to-toggle, per-character chip colors). Restyled with frontend's enchanted-glassmorphism tokens.

### i18n

New `onboarding.*` keys in `frontend/messages/en.json` and `vi.json`:
- Headings (new / edit)
- Field labels (your name, child name, favorite characters)
- Hints (0/5, shows all)
- Buttons (add child, remove, save & continue)
- Confirm modal title + body + buttons
- Error messages (generic load/submit failure, expired link, duplicate name)

Persona display names stay unlocalized (come from `/admin/personas` response, same as rest of app).

### `useUser` hook

No change. The existing hook already handles `?token=X` → localStorage → `GET /user/me`. After the onboarding form submits and redirects to `pick-child`, `useUser` reads the now-populated profile naturally.

## n8n Workflow Changes

Modify `n8n/telegram-brief.json`:

### `/register` branch — simplify to two nodes

Replace current chain (Check Existing User → Is Already Registered? → Parse Register Name → Has Register Name? → Create User → Reply Welcome) with:

1. **Get Onboarding Link** (HTTP Request)
   - `POST {{ $env.BACKEND_URL }}/user/register-link`
   - Header: `X-N8N-Secret: {{ $env.N8N_SHARED_SECRET }}`
   - Body: `{ "telegram_chat_id": {{ $('Telegram Trigger').first().json.message.chat.id }} }`

2. **Reply With Link** (Telegram Send Message)
   - `text: "Set up or edit your family here:\n{{ $json.onboarding_url }}"`

### `/add-child` branch — delete entirely

Remove all `ac-*` nodes (14 total) and the `add-child` output from the Command Router. The router keeps two outputs: `register` and default (fallback → existing brief flow).

### Bot command list

Update BotFather command list (manual step):

```
register - Set up or edit your family
```

Remove `add-child` entry.

## Data Model

No schema changes beyond `005_drop_user_token`. Relies on existing:

- `users (id, telegram_chat_id, name, created_at)` — `name NOT NULL`, `telegram_chat_id BIGINT UNIQUE`
- `children (id, name, timezone, preferences, created_at)` — `preferences JSONB`
- `user_children (user_id, child_id, role, created_at)` — duplicate child names per parent prevented in application code
- `user_children.child_id` FK `ON DELETE CASCADE`, `stories.child_id` and `briefs.child_id` FK `ON DELETE SET NULL` (orphaned rows remain)

## Memory Cleanup

When `PUT /user/me` removes a child, after the DB commit the handler calls `mem0_client.delete_all(user_id=child_id)` to purge Qdrant. Failures are logged and swallowed (does not fail the request) — matches existing `graph.py` graceful-degradation pattern for memory operations.

## Security

- `AUTH_SECRET` must be 32+ bytes, random, never logged
- Token is only honored by parent-scoped endpoints (`/user/me` GET/PUT)
- `POST /user/register-link` is gated by `N8N_SHARED_SECRET` header — prevents arbitrary token minting from the public internet
- `GET /user/me` and `PUT /user/me` authenticate via HMAC on every call (no session state)
- HMAC verified with `hmac.compare_digest` (timing-safe)

## Testing

### Backend (pytest)

- `tests/utils/test_auth_token.py` — encode/decode roundtrip; tampered payload, wrong secret, missing signature, malformed input all raise `InvalidTokenError`; non-int chat_id rejected
- `tests/routes/test_user_register_link.py` — happy path returns token+url; deterministic (same chat_id → same token); 401 without `X-N8N-Secret`
- `tests/routes/test_user_me_get.py` — valid token + known chat_id → full profile; valid token + unknown chat_id → stub; invalid token → 401
- `tests/routes/test_user_me_put.py` — initial onboarding creates user + children; edit renames + adds + removes correctly; unknown persona rejected (422); duplicate child name rejected (409); transaction rolls back on error; `mem0_client.delete_all` called for each removed child

### Frontend (vitest)

- `tests/OnboardingPage.test.tsx` — empty form when `user_id: null`; pre-filled form when profile present; validates required fields; calls `updateUserProfile` with correct payload; confirm modal for existing-child delete, none for new-child delete; redirects to pick-child on 200
- `tests/lib/user.test.ts` — `updateUserProfile` request shape
- `tests/CharactersPicker.test.tsx` — max-5 toggle, empty state

### Manual (n8n + integration)

1. Type `/register` → click link → fill form → verify redirect to pick-child
2. Type `/register` again → verify same URL → open → verify form is pre-filled
3. Rename child, add a second child, remove the first child → submit → verify pick-child shows only the new children
4. Regular text message (not `/register`) → verify brief flow still works

## Environment Variables

New:

- `AUTH_SECRET` — 32-byte hex, backend
- `FRONTEND_URL` — e.g. `https://dispatch.example.com`, backend (for constructing `onboarding_url`)
- `N8N_SHARED_SECRET` — secret for `/user/register-link`, backend + n8n

Update:

- `backend/.env.example` — add the three above
- `docker-compose.yml` — pass the three above into backend and (for `N8N_SHARED_SECRET`) into n8n
- k8s secrets — add the three above

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `AUTH_SECRET` leaked → all tokens compromised | Rotate secret (invalidates all tokens; parents re-run `/register`). Store in k8s secret, never in code/logs. |
| `POST /user/register-link` abused to mint tokens for arbitrary chat_ids | `N8N_SHARED_SECRET` header gate. Attacker still needs a real chat_id they control to actually log in and do anything. |
| Parent accidentally deletes a child | Confirm modal with explicit "stories and memories will be deleted" wording. |
| Qdrant unreachable during child delete | Best-effort — DB commit proceeds, log warning. Matches existing pattern. |
| Duplicate child name submission | Server 409 → client inline error on the offending row. |
| Existing `tk_...` tokens in localStorage after migration | Accepted data-wipe per user direction. |

## Out of Scope

- Parent account deletion
- Transfer a child to another parent
- Multi-parent collaboration on onboarding form
- Email/SMS flows
- Token expiry / rotation per-parent
- Editing `timezone` for a child (admin UI only)
