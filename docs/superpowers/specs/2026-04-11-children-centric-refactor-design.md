# Children-Centric Refactor Design

## Overview

Refactor The Royal Dispatch so that **children are the primary entity**. Users (parents, guardians) become a supporting entity linked via a many-to-many relationship. The Admin UI is redesigned with children as the primary view.

## Decisions

- **Many-to-many**: `user_children` join table with `role` metadata
- **Briefs**: keep `user_id` (track who sent it) + `child_id`
- **Stories**: drop `user_id`, keep `child_id` only — stories belong to children
- **Child creation**: standalone on the Children page, then link users
- **Name uniqueness**: app-level check — within a single user's linked children, no two share a name
- **Migration strategy**: drop and recreate tables (no data to preserve)

## Database Schema

### `users` (unchanged)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| name | TEXT NOT NULL | |
| telegram_chat_id | BIGINT | |
| token | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### `children` (refactored — no `parent_id`)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| name | TEXT NOT NULL | |
| timezone | TEXT | DEFAULT 'America/Los_Angeles' |
| preferences | JSONB | DEFAULT '{}' |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### `user_children` (new join table)

| Column | Type | Notes |
|--------|------|-------|
| user_id | UUID FK → users(id) | ON DELETE CASCADE |
| child_id | UUID FK → children(id) | ON DELETE CASCADE |
| role | TEXT | e.g. "mom", "dad", "grandma", "nanny" |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| | PK | (user_id, child_id) |

### `briefs` (keeps both FKs)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| date | DATE NOT NULL | |
| text | TEXT NOT NULL | |
| user_id | UUID FK → users(id) | ON DELETE SET NULL |
| child_id | UUID FK → children(id) | ON DELETE SET NULL |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### `stories` (drops `user_id`)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| date | DATE NOT NULL | |
| princess | TEXT NOT NULL | |
| story_type | TEXT NOT NULL | |
| language | TEXT | DEFAULT 'en' |
| story_text | TEXT | |
| audio_url | TEXT | |
| royal_challenge | TEXT | |
| child_id | UUID FK → children(id) | ON DELETE SET NULL |
| created_at | TIMESTAMPTZ | DEFAULT now() |

**Uniqueness indexes on stories:**
- `stories_unique_with_child`: (date, princess, story_type, language, child_id) WHERE child_id IS NOT NULL
- `stories_unique_no_child`: (date, princess, story_type, language) WHERE child_id IS NULL

## API Changes

### Admin Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/children | List all children with linked users |
| POST | /admin/children | Create a child (name, timezone) |
| DELETE | /admin/children/{child_id} | Delete a child |
| GET | /admin/children/{child_id}/preferences | Get preferences |
| PUT | /admin/children/{child_id}/preferences | Update preferences |
| POST | /admin/children/{child_id}/users | Link user to child (body: {user_id, role}) |
| DELETE | /admin/children/{child_id}/users/{user_id} | Unlink user from child |
| GET | /admin/users | List all users (unchanged) |
| POST | /admin/users | Create user (unchanged) |
| DELETE | /admin/users/{user_id} | Delete user (unchanged) |

### User Routes

- `GET /user/me` — queries via `user_children` join instead of `parent_id`
- `GET /user/by-chat-id` — unchanged

### Story Routes

- `POST /brief` — child lookup via `user_children` join; behavior unchanged
- `POST /story` — drops `user_id` from request, only needs `child_id`
- `GET /story/today` — unchanged
- `GET /story/today/{princess}` — drops `user_id` param, uses `child_id` only

### App-Level Name Uniqueness

When linking a user to a child via `POST /admin/children/{child_id}/users`:
1. Look up the child's name
2. Query all children already linked to that user
3. If any linked child has the same name, return 409 Conflict

## Admin UI

### Navigation

Sidebar with two pages: **Children** (primary) and **Users**.

The current **Characters** page is removed — favorite princesses management moves into each child's expandable row.

### Children Page (`/admin/children`)

- Header: "Children" with count + "Add Child" button
- Add Child form: name, timezone
- Table columns: Name, Timezone, Linked Users (tags like "Alice (mom), Bob (dad)"), Delete
- Expandable row per child:
  - **Link user**: dropdown of existing users + role text input + "Link" button
  - **Linked users list**: each shows name, role, unlink button
  - **Preferences**: favorite princesses picker (moved from Characters page)

### Users Page (`/admin/users`)

- Same as today: Name, Telegram Chat ID, Token, Delete
- Expandable rows: read-only list of linked children with role
- Linking/unlinking is done from the Children page

## Backend Pipeline Changes

### Brief Submission (`POST /brief`)

Child lookup query changes:
```sql
-- Old
SELECT * FROM children WHERE parent_id = %s
-- New
SELECT c.* FROM children c
JOIN user_children uc ON c.id = uc.child_id
WHERE uc.user_id = %s
```

Rest of child detection logic (single child auto-assign, multi-child LLM detection) unchanged.

### Story Generation (`POST /story`)

- Remove `user_id` from `StoryRequest` model
- Remove `user_id` from `RoyalStateOptional`
- Cache lookup uses `child_id` only
- Graph state no longer carries `user_id`

### `/user/me` Endpoint

Query changes to join through `user_children` instead of filtering `children.parent_id`.

### No Changes Needed

- Memory layer (already scoped by `child_id`)
- Personas
- LangGraph nodes
- Audio synthesis
- Child detection utility
