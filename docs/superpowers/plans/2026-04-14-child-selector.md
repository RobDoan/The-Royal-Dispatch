# Child Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a child selection flow so users with multiple children can pick which child they're viewing stories for.

**Architecture:** Update `UserProfile` type to match backend response with `children[]`. Add localStorage-persisted child selection via `useUser` hook. New splash screen page for child picking. Pass `child_id` through all API calls.

**Tech Stack:** Next.js, React, TypeScript, next-intl, Tailwind CSS, Vitest

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `frontend/lib/user.ts` | Modify | Update `UserProfile` type, add `ChildInfo`, add localStorage helpers |
| `frontend/hooks/useUser.ts` | Modify | Add child selection state, derive princesses from selected child |
| `frontend/lib/api.ts` | Modify | Add `child_id` param to `requestStory` and `fetchStory` |
| `frontend/messages/en.json` | Modify | Add `pickChild` i18n keys |
| `frontend/messages/vi.json` | Modify | Add `pickChild` i18n keys |
| `frontend/app/[locale]/pick-child/page.tsx` | Create | Splash screen for child selection |
| `frontend/components/Header.tsx` | Modify | Avatar shows child initial, navigates to pick-child |
| `frontend/app/[locale]/(tabs)/inbox/page.tsx` | Modify | Pass `child_id`, add redirect guard |
| `frontend/app/[locale]/(tabs)/story/page.tsx` | Modify | Pass `child_id`, add redirect guard |
| `frontend/app/[locale]/(play)/play/[princess]/page.tsx` | Modify | Pass `child_id` to `fetchStory` |
| `frontend/app/[locale]/(play)/story/[princess]/page.tsx` | Modify | Pass `child_id` to `fetchStory` |
| `frontend/tests/useUser.test.ts` | Create | Tests for child selection logic in hook |

---

### Task 1: Update UserProfile Type and localStorage Helpers

**Files:**
- Modify: `frontend/lib/user.ts`

- [ ] **Step 1: Update the UserProfile type and add ChildInfo**

Replace the entire `frontend/lib/user.ts` with:

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

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

export function getStoredChildId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('selected_child_id');
}

export function storeSelectedChild(childId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('selected_child_id', childId);
}

export function clearSelectedChild(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('selected_child_id');
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

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/user.ts
git commit -m "feat: update UserProfile type to match backend children response"
```

---

### Task 2: Update useUser Hook with Child Selection

**Files:**
- Modify: `frontend/hooks/useUser.ts`
- Create: `frontend/tests/useUser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/useUser.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUser } from '@/hooks/useUser';

// Mock the user module
vi.mock('@/lib/user', () => ({
  getStoredToken: vi.fn(() => 'test-token'),
  getTokenFromUrl: vi.fn(() => null),
  storeToken: vi.fn(),
  fetchUserProfile: vi.fn(),
  getStoredChildId: vi.fn(() => null),
  storeSelectedChild: vi.fn(),
  clearSelectedChild: vi.fn(),
}));

import {
  fetchUserProfile,
  getStoredChildId,
  storeSelectedChild,
  clearSelectedChild,
} from '@/lib/user';

const mockFetchUserProfile = vi.mocked(fetchUserProfile);
const mockGetStoredChildId = vi.mocked(getStoredChildId);
const mockStoreSelectedChild = vi.mocked(storeSelectedChild);
const mockClearSelectedChild = vi.mocked(clearSelectedChild);

describe('useUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects child from localStorage when it matches a fetched child', async () => {
    mockGetStoredChildId.mockReturnValue('child-1');
    mockFetchUserProfile.mockResolvedValue({
      user_id: 'u1',
      name: 'Parent',
      children: [
        { id: 'child-1', name: 'Emma', preferences: { favorite_princesses: ['elsa', 'belle'] } },
        { id: 'child-2', name: 'Lily', preferences: { favorite_princesses: ['ariel'] } },
      ],
    });

    const { result } = renderHook(() => useUser());
    // Wait for async effect
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedChild?.id).toBe('child-1');
    expect(result.current.activePrincessIds).toEqual(['elsa', 'belle']);
  });

  it('clears stale child_id that does not match any child', async () => {
    mockGetStoredChildId.mockReturnValue('deleted-child');
    mockFetchUserProfile.mockResolvedValue({
      user_id: 'u1',
      name: 'Parent',
      children: [
        { id: 'child-1', name: 'Emma', preferences: { favorite_princesses: ['elsa'] } },
      ],
    });

    const { result } = renderHook(() => useUser());
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedChild).toBeNull();
    expect(mockClearSelectedChild).toHaveBeenCalled();
  });

  it('returns all princesses when no children exist', async () => {
    mockGetStoredChildId.mockReturnValue(null);
    mockFetchUserProfile.mockResolvedValue({
      user_id: 'u1',
      name: 'Parent',
      children: [],
    });

    const { result } = renderHook(() => useUser());
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedChild).toBeNull();
    expect(result.current.activePrincessIds).toEqual(['elsa', 'belle', 'cinderella', 'ariel']);
  });

  it('selectChild updates state and localStorage', async () => {
    mockGetStoredChildId.mockReturnValue(null);
    mockFetchUserProfile.mockResolvedValue({
      user_id: 'u1',
      name: 'Parent',
      children: [
        { id: 'child-1', name: 'Emma', preferences: { favorite_princesses: ['elsa'] } },
        { id: 'child-2', name: 'Lily', preferences: { favorite_princesses: ['ariel', 'belle'] } },
      ],
    });

    const { result } = renderHook(() => useUser());
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectChild('child-2');
    });

    expect(result.current.selectedChild?.id).toBe('child-2');
    expect(result.current.selectedChild?.name).toBe('Lily');
    expect(result.current.activePrincessIds).toEqual(['ariel', 'belle']);
    expect(mockStoreSelectedChild).toHaveBeenCalledWith('child-2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/useUser.test.ts`
Expected: FAIL — hook doesn't have `selectedChild` or `selectChild` yet.

- [ ] **Step 3: Implement the updated useUser hook**

Replace the entire `frontend/hooks/useUser.ts` with:

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getStoredToken,
  getTokenFromUrl,
  storeToken,
  fetchUserProfile,
  getStoredChildId,
  storeSelectedChild,
  clearSelectedChild,
  type UserProfile,
  type ChildInfo,
} from '@/lib/user';
import { PRINCESS_META, type PrincessId } from '@/lib/princesses';

const ALL_PRINCESS_IDS = Object.keys(PRINCESS_META) as PrincessId[];

interface UseUserResult {
  profile: UserProfile | null;
  selectedChild: ChildInfo | null;
  selectChild: (childId: string) => void;
  activePrincessIds: PrincessId[];
  loading: boolean;
}

export function useUser(): UseUserResult {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
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

        if (p && p.children.length > 0) {
          const storedId = getStoredChildId();
          const match = storedId ? p.children.find((c) => c.id === storedId) : null;
          if (match) {
            setSelectedChild(match);
          } else if (storedId) {
            // Stale child_id in localStorage
            clearSelectedChild();
          }
        }
      }
      setLoading(false);
    }
    resolve();
  }, []);

  const selectChild = useCallback(
    (childId: string) => {
      const child = profile?.children.find((c) => c.id === childId) ?? null;
      setSelectedChild(child);
      if (child) {
        storeSelectedChild(child.id);
      } else {
        clearSelectedChild();
      }
    },
    [profile],
  );

  const favorites = selectedChild?.preferences?.favorite_princesses;
  const activePrincessIds: PrincessId[] =
    favorites && favorites.length > 0
      ? (favorites.filter((id) => id in PRINCESS_META) as PrincessId[])
      : ALL_PRINCESS_IDS;

  return { profile, selectedChild, selectChild, activePrincessIds, loading };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/useUser.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/useUser.ts frontend/tests/useUser.test.ts
git commit -m "feat: add child selection state to useUser hook"
```

---

### Task 3: Update API Functions to Accept child_id

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Update requestStory and fetchStory to accept child_id**

Replace the entire `frontend/lib/api.ts` with:

```typescript
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? NEXT_PUBLIC_API_URL;

const API_URL = typeof window === 'undefined' ? INTERNAL_API_URL : NEXT_PUBLIC_API_URL;

export type Princess = 'elsa' | 'belle' | 'cinderella' | 'ariel';
export type Language = 'en' | 'vi';
export type StoryType = 'daily' | 'life_lesson';

export async function requestStory(
  princess: Princess,
  language: Language,
  storyType: StoryType = 'daily',
  childId?: string | null,
): Promise<void> {
  const body: Record<string, string> = { princess, language, story_type: storyType };
  if (childId) body.child_id = childId;
  await fetch(`${API_URL}/story`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
}

export async function fetchStory(
  princess: Princess,
  storyType: StoryType = 'daily',
  childId?: string | null,
): Promise<{ audioUrl: string; storyText: string; royalChallenge: string | null }> {
  const params = new URLSearchParams({ type: storyType });
  if (childId) params.set('child_id', childId);
  const url = `${API_URL}/story/today/${princess}?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) throw new Error('STORY_NOT_FOUND');
  if (!res.ok) throw new Error('STORY_ERROR');
  const data = await res.json();
  return {
    audioUrl: data.audio_url,
    storyText: data.story_text,
    royalChallenge: data.royal_challenge ?? null,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: pass child_id through requestStory and fetchStory"
```

---

### Task 4: Add i18n Keys for Pick Child Page

**Files:**
- Modify: `frontend/messages/en.json`
- Modify: `frontend/messages/vi.json`

- [ ] **Step 1: Add pickChild keys to en.json**

Add a `"pickChild"` section after the `"story"` block in `frontend/messages/en.json`:

```json
  "pickChild": {
    "heading": "Who's reading tonight?",
    "subheading": "Tap your name to begin"
  }
```

The full file becomes:

```json
{
  "app": {
    "title": "The Royal Dispatch",
    "greeting": "Good evening, Princess Emma",
    "subtitle": "Your letters have arrived",
    "error": "{princess}'s letter is on its way — try again in a moment",
    "playing": "Playing {princess}'s letter to Emma...",
    "writing": "{princess} is writing your letter...",
    "goBack": "Go Back",
    "sorryMessages": {
      "elsa": "Elsa got caught in a snowstorm in Arendelle... Try again in a little while!",
      "belle": "Belle is lost in her favourite book right now. She'll be back soon!",
      "cinderella": "Cinderella is at the royal ball tonight. Try again in a moment!",
      "ariel": "Ariel is swimming with the dolphins and can't come to the surface. Try again soon!"
    },
    "origins": {
      "elsa": "Kingdom of Arendelle",
      "belle": "The Enchanted Castle",
      "cinderella": "The Royal Palace",
      "ariel": "Under the Sea"
    }
  },
  "story": {
    "title": "Story",
    "royalChallenge": "Your Royal Challenge",
    "writing": "{princess} is crafting your life lesson..."
  },
  "pickChild": {
    "heading": "Who's reading tonight?",
    "subheading": "Tap your name to begin"
  }
}
```

- [ ] **Step 2: Add pickChild keys to vi.json**

Add the same section to `frontend/messages/vi.json`:

```json
  "pickChild": {
    "heading": "Ai sẽ nghe truyện tối nay?",
    "subheading": "Chạm vào tên của con để bắt đầu"
  }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/messages/en.json frontend/messages/vi.json
git commit -m "feat: add pickChild i18n keys for child selection page"
```

---

### Task 5: Create Pick Child Splash Page

**Files:**
- Create: `frontend/app/[locale]/pick-child/page.tsx`

- [ ] **Step 1: Create the pick-child page**

Create `frontend/app/[locale]/pick-child/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useUser } from '@/hooks/useUser';

export default function PickChildPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('pickChild');
  const { profile, selectChild, loading } = useUser();

  function handlePick(childId: string) {
    selectChild(childId);
    router.push(`/${locale}/inbox`);
  }

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#FFF0F5]">
        <div className="w-8 h-8 border-4 border-pink-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const children = profile?.children ?? [];

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center bg-[#FFF0F5] px-8">
      <h1
        className="text-3xl font-black tracking-tight text-gray-900 mb-2 text-center"
        style={{ fontFamily: '"Quicksand", sans-serif' }}
      >
        {t('heading')}
      </h1>
      <p className="text-gray-400 text-sm font-medium mb-10">{t('subheading')}</p>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        {children.map((child) => (
          <button
            key={child.id}
            onClick={() => handlePick(child.id)}
            className="flex items-center gap-4 bg-white rounded-2xl px-6 py-5 shadow-md border border-gray-100 active:scale-[0.97] transition-transform text-left w-full"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center text-xl font-black text-white shadow-sm">
              {child.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-lg font-bold text-gray-900">{child.name}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/\[locale\]/pick-child/page.tsx
git commit -m "feat: add pick-child splash page"
```

---

### Task 6: Update Header to Show Selected Child and Navigate to Pick Child

**Files:**
- Modify: `frontend/components/Header.tsx`

- [ ] **Step 1: Update Header to consume useUser and show child initial**

Replace the entire `frontend/components/Header.tsx` with:

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { LanguageSelector, type Language } from './LanguageSelector';
import { useUser } from '@/hooks/useUser';

export function Header() {
  const t = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { selectedChild } = useUser();

  const handleLanguageChange = (newLang: Language) => {
    router.replace(pathname, { locale: newLang });
  };

  const initial = selectedChild?.name?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 pt-safe-top bg-white border-b-0">
      <div className="px-5 pb-3 flex items-center justify-between">
        <div className="flex flex-col mt-2">
          <h2
            className="text-transparent bg-clip-text bg-gradient-to-br from-[#FF85A1] via-[#FFA3A3] to-[#FFB86C] drop-shadow-[0_2px_2px_rgba(255,133,161,0.4)] text-2xl font-black tracking-tight transition-transform hover:scale-105"
            style={{ fontFamily: '"Quicksand", sans-serif' }}
          >
            {t('title')}
          </h2>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <LanguageSelector value={locale as Language} onChange={handleLanguageChange} />
          <button
            onClick={() => router.push(`/${locale}/pick-child`)}
            className="w-10 h-10 rounded-full border-2 border-white shadow-md overflow-hidden active:scale-95 transition-transform bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center"
          >
            <span className="text-sm font-black text-white">{initial}</span>
          </button>
        </div>
      </div>

      {/* Scalloped Wavy Bottom edge */}
      <div className="absolute top-full left-0 right-0 w-full overflow-hidden leading-[0]">
        <svg data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none" className="block w-full h-[12px] fill-white drop-shadow-sm">
          <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z" />
        </svg>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/Header.tsx
git commit -m "feat: header avatar shows child initial and navigates to pick-child"
```

---

### Task 7: Add Redirect Guards and Pass child_id in Inbox and Story Pages

**Files:**
- Modify: `frontend/app/[locale]/(tabs)/inbox/page.tsx`
- Modify: `frontend/app/[locale]/(tabs)/story/page.tsx`

- [ ] **Step 1: Update inbox page**

Replace the entire `frontend/app/[locale]/(tabs)/inbox/page.tsx` with:

```tsx
'use client';

import { useEffect } from 'react';
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
  const { profile, selectedChild, activePrincessIds, loading } = useUser();

  const needsChildPick = !loading && profile && profile.children.length > 0 && !selectedChild;

  useEffect(() => {
    if (needsChildPick) {
      router.replace(`/${locale}/pick-child`);
    }
  }, [needsChildPick, router, locale]);

  if (loading || needsChildPick) return null;

  async function handleTap(princessId: PrincessId) {
    requestStory(princessId, locale as 'en' | 'vi', 'daily', selectedChild?.id);
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

- [ ] **Step 2: Update story page**

Replace the entire `frontend/app/[locale]/(tabs)/story/page.tsx` with:

```tsx
'use client';

import { useEffect } from 'react';
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
  const { profile, selectedChild, activePrincessIds, loading } = useUser();

  const needsChildPick = !loading && profile && profile.children.length > 0 && !selectedChild;

  useEffect(() => {
    if (needsChildPick) {
      router.replace(`/${locale}/pick-child`);
    }
  }, [needsChildPick, router, locale]);

  if (loading || needsChildPick) return null;

  async function handleTap(princessId: PrincessId) {
    requestStory(princessId, locale as 'en' | 'vi', 'life_lesson', selectedChild?.id);
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

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\[locale\]/\(tabs\)/inbox/page.tsx frontend/app/\[locale\]/\(tabs\)/story/page.tsx
git commit -m "feat: add child guard redirect and pass child_id in inbox and story pages"
```

---

### Task 8: Pass child_id in Play Pages (Polling Pages)

**Files:**
- Modify: `frontend/app/[locale]/(play)/play/[princess]/page.tsx`
- Modify: `frontend/app/[locale]/(play)/story/[princess]/page.tsx`

- [ ] **Step 1: Update daily play page to pass child_id to fetchStory**

In `frontend/app/[locale]/(play)/play/[princess]/page.tsx`, add the `useUser` import and pass `child_id`:

Add import at top:
```typescript
import { useUser } from '@/hooks/useUser';
```

Inside the `PlayPage` component, add after the existing hooks:
```typescript
const { selectedChild } = useUser();
```

Update the `fetchStory` call (line 49) from:
```typescript
const result = await fetchStory(princessId as Princess, 'daily');
```
to:
```typescript
const result = await fetchStory(princessId as Princess, 'daily', selectedChild?.id);
```

Add `selectedChild` to the `useEffect` dependency array (line 69) from:
```typescript
}, [princessId]);
```
to:
```typescript
}, [princessId, selectedChild]);
```

- [ ] **Step 2: Update life lesson play page to pass child_id to fetchStory**

In `frontend/app/[locale]/(play)/story/[princess]/page.tsx`, make the same changes:

Add import at top:
```typescript
import { useUser } from '@/hooks/useUser';
```

Inside the `StoryPlayPage` component, add after the existing hooks:
```typescript
const { selectedChild } = useUser();
```

Update the `fetchStory` call (line 51) from:
```typescript
const result = await fetchStory(princessId as Princess, 'life_lesson');
```
to:
```typescript
const result = await fetchStory(princessId as Princess, 'life_lesson', selectedChild?.id);
```

Add `selectedChild` to the `useEffect` dependency array (line 71) from:
```typescript
}, [princessId]);
```
to:
```typescript
}, [princessId, selectedChild]);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\[locale\]/\(play\)/play/\[princess\]/page.tsx frontend/app/\[locale\]/\(play\)/story/\[princess\]/page.tsx
git commit -m "feat: pass child_id when polling for story in play pages"
```

---

### Task 9: Run All Tests and Build

- [ ] **Step 1: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run the build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors.

- [ ] **Step 4: Final commit if any fixes were needed**

If any test/build/lint failures required fixes, commit those fixes.
