# Bottom Nav Redesign: Rainbow Arc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the glassmorphism bottom nav with a pastel rainbow arc design for preschoolers (ages 3-5).

**Architecture:** Rewrite `BottomNav.tsx` from scratch — remove glassmorphism, 3D PNG icons, and gold/white monochrome styling. Replace with a rainbow pastel gradient bar, per-tab color-coded circles with emoji icons, and a spring-bounce pop-up active state. All styling is inline (no new CSS classes in globals.css).

**Tech Stack:** React, Next.js App Router, Tailwind CSS v4 (inline styles for gradients/shadows), vitest + @testing-library/react for tests.

**Spec:** `docs/superpowers/specs/2026-04-26-bottom-nav-redesign.md`

---

## File Structure

| Action | File | Responsibility |
|---|---|---|
| Rewrite | `frontend/components/BottomNav.tsx` | Rainbow arc bottom nav component |
| Rewrite | `frontend/tests/BottomNav.test.tsx` | Tests matching new DOM structure |

No other files are touched. The layout (`frontend/app/[locale]/(tabs)/layout.tsx`) imports `<BottomNav locale={locale} />` — same props, same interface.

---

### Task 1: Update BottomNav component

**Files:**
- Rewrite: `frontend/components/BottomNav.tsx`

- [ ] **Step 1: Rewrite BottomNav.tsx**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  locale: string;
}

const TABS = [
  {
    href: '/inbox',
    label: 'Inbox',
    emoji: '💌',
    activeBg: 'linear-gradient(135deg, #fff0f5, #ffe0eb)',
    glow: '0 6px 20px rgba(255,131,161,0.45), 0 2px 8px rgba(255,131,161,0.3), inset 0 2px 4px rgba(255,255,255,0.7)',
    inactiveBg: 'linear-gradient(135deg, #fff0f5, #ffe0eb)',
    labelColor: '#ff6b8a',
  },
  {
    href: '/story',
    label: 'Story',
    emoji: '📖',
    activeBg: 'linear-gradient(135deg, #f0e6ff, #e6d6ff)',
    glow: '0 6px 20px rgba(147,112,219,0.35), 0 2px 8px rgba(147,112,219,0.25), inset 0 2px 4px rgba(255,255,255,0.7)',
    inactiveBg: 'linear-gradient(135deg, #f0e6ff, #e6d6ff)',
    labelColor: '#8b6bb5',
  },
] as const;

const RAINBOW_GRADIENT =
  'linear-gradient(90deg, #ffd6e0 0%, #f0d6ff 25%, #d6e8ff 50%, #d6fff0 75%, #fff5d6 100%)';

export function BottomNav({ locale }: Props) {
  const pathname = usePathname();

  const handleInteraction = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pb-[env(safe-area-inset-bottom)] w-11/12 max-w-sm">
      <nav
        aria-label="Main navigation"
        className="w-full flex items-end justify-around rounded-[32px_32px_36px_36px] px-6 pb-3 pt-2"
        style={{
          height: '88px',
          background: RAINBOW_GRADIENT,
          boxShadow:
            '0 -4px 24px rgba(255,182,193,0.2), 0 -2px 12px rgba(147,112,219,0.15), inset 0 2px 4px rgba(255,255,255,0.5)',
        }}
      >
        {TABS.map((tab) => {
          const fullHref = `/${locale}${tab.href}`;
          const active = pathname.startsWith(fullHref);
          return (
            <Link
              key={tab.href}
              href={fullHref}
              onClick={handleInteraction}
              aria-label={tab.label}
              className="flex flex-col items-center transition-all duration-[350ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              style={{
                transform: active ? 'translateY(-14px)' : 'translateY(0)',
                opacity: active ? 1 : 0.55,
              }}
            >
              <span
                className="flex items-center justify-center rounded-full active:scale-90"
                style={{
                  width: active ? '60px' : '48px',
                  height: active ? '60px' : '48px',
                  fontSize: active ? '28px' : '22px',
                  background: tab.activeBg,
                  boxShadow: active ? tab.glow : '0 2px 8px rgba(0,0,0,0.08)',
                  transition: 'all 350ms cubic-bezier(0.34,1.56,0.64,1)',
                }}
                role="img"
                aria-hidden="true"
              >
                {tab.emoji}
              </span>
              <span
                className="font-semibold mt-1"
                style={{
                  fontSize: active ? '11px' : '10px',
                  fontWeight: active ? 800 : 600,
                  color: tab.labelColor,
                  textShadow: active ? '0 1px 3px rgba(255,255,255,0.8)' : 'none',
                  opacity: active ? 1 : 0.7,
                }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Verify the component renders**

Run: `cd frontend && pnpm build`
Expected: Build succeeds with no TypeScript errors.

---

### Task 2: Update tests

**Files:**
- Rewrite: `frontend/tests/BottomNav.test.tsx`

- [ ] **Step 1: Rewrite the test file**

The new component uses emoji spans instead of `<Image>`, and active state is expressed via inline `style` (transform, opacity) instead of Tailwind classes (`scale-95`, `scale-100`). Tests must assert on the new structure.

```tsx
import { render, screen } from '@testing-library/react';
import { BottomNav } from '@/components/BottomNav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/inbox',
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

it('renders Inbox and Story tabs with emoji', () => {
  render(<BottomNav locale="en" />);
  expect(screen.getByText('Inbox')).toBeInTheDocument();
  expect(screen.getByText('Story')).toBeInTheDocument();
  expect(screen.getByText('💌')).toBeInTheDocument();
  expect(screen.getByText('📖')).toBeInTheDocument();
});

it('marks Inbox as active (translated up) and Story as inactive', () => {
  render(<BottomNav locale="en" />);
  const inboxLink = screen.getByText('Inbox').closest('a');
  const storyLink = screen.getByText('Story').closest('a');
  expect(inboxLink?.style.transform).toBe('translateY(-14px)');
  expect(inboxLink?.style.opacity).toBe('1');
  expect(storyLink?.style.transform).toBe('translateY(0px)');
  expect(storyLink?.style.opacity).toBe('0.55');
});

it('has accessible aria-labels on nav links', () => {
  render(<BottomNav locale="en" />);
  expect(screen.getByLabelText('Inbox')).toBeInTheDocument();
  expect(screen.getByLabelText('Story')).toBeInTheDocument();
});

it('renders the rainbow gradient nav container', () => {
  render(<BottomNav locale="en" />);
  const nav = screen.getByRole('navigation', { name: 'Main navigation' });
  expect(nav).toBeInTheDocument();
  expect(nav.style.background).toContain('linear-gradient');
  expect(nav.style.height).toBe('88px');
});
```

- [ ] **Step 2: Run the tests**

Run: `cd frontend && pnpm vitest run tests/BottomNav.test.tsx`
Expected: All 4 tests pass.

---

### Task 3: Final verification

- [ ] **Step 1: Run all frontend tests**

Run: `cd frontend && pnpm vitest run`
Expected: All tests pass (no regressions in other files).

- [ ] **Step 2: Run linter**

Run: `cd frontend && pnpm lint`
Expected: No lint errors.

- [ ] **Step 3: Run build**

Run: `cd frontend && pnpm build`
Expected: Production build succeeds.
