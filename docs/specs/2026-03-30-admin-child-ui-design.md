# Admin UI: Child Management per User

**Date:** 2026-03-30
**Status:** Approved

## Overview

Add the ability for admins to view, add, and delete children for each user directly within the existing `/users` admin page. Children are expanded inline within each user row — no new pages or modals.

## Context

The backend already exposes full CRUD for children:
- `GET /admin/users/{user_id}/children`
- `POST /admin/users/{user_id}/children` — accepts `{ name, timezone?, preferences? }`
- `DELETE /admin/children/{child_id}`

The admin UI (`admin/`) is a Next.js app with a `/users` page that renders a `UsersTable` client component. The add-child form uses **name only**; timezone defaults to `"America/Los_Angeles"` on the backend.

## Changes

### 1. `admin/lib/api.ts`

Add a `Child` interface and three new API functions:

```ts
export interface Child {
  id: string;
  parent_id: string;
  name: string;
  timezone: string;
  preferences: Record<string, unknown>;
  created_at: string;
}

listChildren(userId: string): Promise<Child[]>
  // GET /admin/users/{userId}/children

createChild(userId: string, name: string): Promise<Child>
  // POST /admin/users/{userId}/children  body: { name }

deleteChild(childId: string): Promise<void>
  // DELETE /admin/children/{childId}
```

### 2. `admin/components/UsersTable.tsx`

**New state:**
- `expandedUserId: string | null` — which user row is currently open; only one open at a time
- `childrenByUser: Record<string, Child[]>` — children cached after first fetch; no re-fetch on re-expand
- `loadingChildren: Set<string>` — users whose children are currently being fetched

**Row interaction:**
- Each `<tr>` gets `cursor-pointer` and an `onClick` handler
- Clicking an expanded row collapses it; clicking a collapsed row expands it
- On first expand, `listChildren(userId)` is called and the result is cached in `childrenByUser`
- A `ChevronDown` / `ChevronRight` icon in the rightmost column (new 5th column, empty header) indicates state

**Expanded sub-row:**
- A `<tr>` inserted immediately after the user row, spanning all 5 columns
- Background: `bg-slate-800/20` to visually group with parent row
- Contents (left-padded):
  - Loading state: `"Loading…"` in `text-slate-500` while fetching
  - Empty state: `"No children yet."` in `text-slate-500`
  - Child list: each child shows `name` + a `Trash2` delete button (same style as user delete)
  - Add form: name input + `"+ Add"` button (same styles as existing add-user form)

**Error handling:**
- Failed fetch: show inline error in the sub-row
- Failed add: show inline error below the form; do not optimistically update
- Failed delete: show inline error; revert optimistic removal

## Out of Scope

- Editing a child's name or timezone
- Managing child preferences from this UI
- Pagination of children

## Success Criteria

- Admin can expand a user row and see their children
- Admin can add a child (name only) and see it appear in the list
- Admin can delete a child with a confirmation prompt
- Collapsing and re-expanding a row does not re-fetch
