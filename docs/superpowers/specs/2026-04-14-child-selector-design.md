# Child Selector — Frontend Design

## Problem

The backend supports multiple children per user and returns them via `/user/me`, but the frontend has no way to select which child is active. Users with 2+ children see the same experience regardless.

## Solution

Add a child selection flow to the frontend:

1. **Splash screen** at `/[locale]/pick-child` — shown when no child is selected
2. **Persistent selection** via localStorage (`selected_child_id`, `selected_child_name`)
3. **Header avatar** becomes a functional button that navigates back to the splash screen to switch children
4. **API calls** pass `child_id` so stories are scoped per child

## Components

### 1. Pick Child Page (`/[locale]/pick-child/page.tsx`)

- Full-screen page with a friendly heading ("Who's reading tonight?")
- Renders a tappable card per child from the user profile
- On tap: saves `child_id` and `child_name` to localStorage, redirects to `/[locale]/inbox`
- No header/tab bar — standalone screen

### 2. UserProfile Type Update (`lib/user.ts`)

Update `UserProfile` to match backend response:

```typescript
export interface ChildInfo {
  id: string;
  name: string;
  preferences: {
    favorite_princesses?: string[];
  };
}

export interface UserProfile {
  user_id: string;
  name: string;
  children: ChildInfo[];
}
```

Remove the old `config.favorite_princesses` field.

### 3. useUser Hook Changes (`hooks/useUser.ts`)

- Expose `children`, `selectedChild`, and `selectChild(id)` 
- Read `selected_child_id` from localStorage on mount
- Match it against fetched `children[]` to set `selectedChild`
- Derive `activePrincessIds` from `selectedChild.preferences.favorite_princesses`
- If no child selected and children exist, return `selectedChild: null` (pages use this to redirect)

### 4. Header Changes (`components/Header.tsx`)

- Accept `selectedChild` prop (or consume from hook)
- Avatar button shows selected child's initial letter
- On click: navigate to `/[locale]/pick-child`

### 5. API Changes (`lib/api.ts`)

- `requestStory` accepts optional `child_id` param, includes it in POST body
- `fetchStory` accepts optional `child_id` param, includes as query param
- Callers (inbox, story pages) read `child_id` from `useUser().selectedChild`

### 6. Guard Logic

Inbox and story pages check `selectedChild` from `useUser()`. If null and `children.length > 0`, redirect to `/[locale]/pick-child`.

## Data Flow

```
App loads → useUser() fetches /user/me → gets children[]
  → localStorage has selected_child_id?
    → yes & matches a child: set selectedChild, derive princesses
    → yes & no match (stale): clear localStorage, redirect to pick-child
    → no: redirect to pick-child
  → Header avatar shows child initial, tap → /pick-child
  → requestStory/fetchStory include child_id
```

## Edge Cases

- **Single child**: Splash screen still shows (consistent UX). Could auto-select in future if desired.
- **Stale localStorage**: If saved child_id doesn't match any child in profile, clear and redirect to pick-child.
- **No children**: Show all princesses (fallback to current behavior), don't redirect to pick-child.

## Backend

No backend changes needed. `POST /story` already accepts `child_id` in the body, and `GET /story/today/{princess}` accepts it as a query param.

## Files Changed

| File | Change |
|------|--------|
| `frontend/lib/user.ts` | Update `UserProfile` type, add `ChildInfo` |
| `frontend/hooks/useUser.ts` | Add child selection state, derive princesses from selected child |
| `frontend/app/[locale]/pick-child/page.tsx` | New splash screen page |
| `frontend/components/Header.tsx` | Avatar shows child initial, navigates to pick-child |
| `frontend/lib/api.ts` | Add `child_id` param to `requestStory` and `fetchStory` |
| `frontend/app/[locale]/(tabs)/inbox/page.tsx` | Pass `child_id` to API, redirect guard |
| `frontend/app/[locale]/(tabs)/story/page.tsx` | Pass `child_id` to API, redirect guard |
