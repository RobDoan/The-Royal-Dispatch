# Multi-Child Brief Detection Design

**Date:** 2026-03-29
**Status:** Approved

## Overview

Parents can have multiple children registered. When a parent sends a brief, the system detects which child (or children) it refers to using an LLM, then stores one brief row per detected child. Story generation and memory retrieval are scoped per child.

## 1. Database Schema

### New table: `children`

```sql
CREATE TABLE children (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Alter `briefs`

```sql
ALTER TABLE briefs ADD COLUMN child_id UUID REFERENCES children(id) ON DELETE SET NULL;
```

### Alter `stories`

```sql
ALTER TABLE stories ADD COLUMN child_id UUID REFERENCES children(id) ON DELETE SET NULL;
```

Existing `user_id` column stays for backward compatibility. New unique indexes on `stories` must include `child_id`. Existing indexes remain unchanged.

## 2. Admin API

New endpoints mirroring the existing user admin pattern:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/users/{user_id}/children` | List all children for a parent |
| `POST` | `/admin/users/{user_id}/children` | Create a child |
| `DELETE` | `/admin/children/{child_id}` | Delete a child |

`POST` request body:
```json
{
  "name": "Emma",
  "timezone": "America/Los_Angeles",
  "preferences": {}
}
```

## 3. Brief Ingestion (`POST /brief`)

No change to the caller-facing request schema. Child detection is server-side.

**Logic at `POST /brief`:**

```
1. Look up children for the requesting parent (user_id)
2. If 0 children:
     → INSERT one brief row with child_id = NULL (legacy/unauthenticated behavior)
3. If 1 child:
     → INSERT one brief row with child_id = that child's id (auto-assign)
4. If 2+ children:
     a. Call LLM with brief text + list of registered child names
     b. LLM returns which names are mentioned (handles nicknames, typos, Vietnamese)
     c. For each matched child → INSERT one brief row with that child_id
     d. If no match → INSERT one brief row with child_id = NULL
```

**LLM detection prompt (sketch):**
> Given the following brief and list of child names, return which names are mentioned. Brief: `{text}`. Names: `{names}`. Return a JSON array of matched names.

Uses the same Anthropic Claude model as the rest of the backend (via `ANTHROPIC_API_KEY`).

## 4. Story Generation

### `POST /story` request

Add optional `child_id: str | None` field to `StoryRequest`.

### `RoyalStateOptional`

Add `child_id: str | None` to the state TypedDict.

### `fetch_brief` node

Brief lookup now filters by `child_id` (in addition to `user_id` and date):

```sql
SELECT text FROM briefs
WHERE date = %s AND user_id = %s AND child_id IS NOT DISTINCT FROM %s
ORDER BY created_at DESC LIMIT 1
```

### Stories unique indexes

Existing `user_id`-based indexes stay unchanged. Add new partial unique indexes covering `child_id`:

```sql
CREATE UNIQUE INDEX stories_unique_with_child
    ON stories (date, princess, story_type, language, child_id)
    WHERE child_id IS NOT NULL;
```

Cache check and upsert in `store_result` must include `child_id` in the WHERE clause alongside the existing `user_id` check.

## 5. Memory Layer

`EMMA_USER_ID` constant is **removed**.

Both `extract_memories` and `fetch_memories` check `child_id` from state:

- If `child_id` is present → use it as the mem0 `user_id`
- If `child_id` is `None` → skip memory extraction/retrieval entirely (same behavior as `__fallback__` today)

```python
child_id = state.get("child_id")
if not child_id:
    return {}
memory.add(..., user_id=child_id)
```

## Out of Scope

- Frontend changes to pass `child_id`
- Handling briefs with `child_id = NULL` (deferred — parent may be contacted later)
- Merging or splitting brief text per child when both children are mentioned in one message
