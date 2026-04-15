# Enchanted Glassmorphism Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign both the frontend (kid-facing PWA) and admin (parent dashboard) with a cohesive enchanted glassmorphism design system — frosted glass panels, dark gradient backgrounds, gold accents, Nunito typography, and sparkle particles.

**Architecture:** Frontend gets dark gradient backgrounds with frosted glass components. Admin gets warm cream base with white cards and a dark purple sidebar. Both share color tokens, typography (Nunito body + Georgia headings), and radius scale. All changes are CSS/component-level only — no backend, API, or logic changes.

**Tech Stack:** Next.js, Tailwind CSS v4, tsparticles, next/font/google

**Spec:** `docs/superpowers/specs/2026-04-14-enchanted-glassmorphism-redesign.md`

---

## File Structure

### Frontend files to modify:

| File | Responsibility |
|---|---|
| `frontend/app/globals.css` | Design tokens, glass utilities, animations |
| `frontend/app/layout.tsx` | Font loading (Nunito replaces Geist) |
| `frontend/app/[locale]/layout.tsx` | Dark gradient body background |
| `frontend/components/Header.tsx` | Glass header panel, Georgia title |
| `frontend/components/BottomNav.tsx` | Glass floating pill nav |
| `frontend/components/PrincessCard.tsx` | Glass card, gold play button |
| `frontend/components/AudioPlayer.tsx` | Glass bottom sheet, gold progress |
| `frontend/components/LanguageSelector.tsx` | Glass toggle, gold slider |
| `frontend/components/ParticlesBackground.tsx` | Sparkle particle config |
| `frontend/public/manifest.json` | Theme color update |

### Admin files to modify:

| File | Responsibility |
|---|---|
| `admin/app/globals.css` | Warm cream tokens, Nunito font vars |
| `admin/app/layout.tsx` | Font loading (Nunito), body bg |
| `admin/components/Sidebar.tsx` | Dark purple gradient, gold accents |
| `admin/components/UsersTable.tsx` | White cards, purple header, warm text |
| `admin/components/ChildrenTable.tsx` | White cards, purple header, warm text |
| `admin/components/CharactersPicker.tsx` | Per-princess pastel chips |

---

## Task 1: Frontend — Update globals.css design tokens and utilities

**Files:**
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Replace the `:root` color variables with the new enchanted palette**

Replace the entire `:root` block (lines 7–63) with:

```css
:root {
  /* Enchanted Glassmorphism Palette */
  --color-gold: #FFD700;
  --color-gold-dark: #FFA500;
  --color-rose: #FF85A1;
  --color-rose-light: #FFB3C6;
  --color-purple: #9370DB;
  --color-sky: #7EC8E3;
  --color-mint: #6EE7B7;

  /* Frontend Background */
  --bg-gradient-start: #1a0533;
  --bg-gradient-mid: #2d1b69;
  --bg-gradient-end: #0f2b4a;

  /* Glass Tokens */
  --glass-bg: rgba(255, 255, 255, 0.08);
  --glass-bg-hover: rgba(255, 255, 255, 0.12);
  --glass-bg-active: rgba(255, 215, 0, 0.06);
  --glass-border: rgba(255, 255, 255, 0.12);
  --glass-border-active: rgba(255, 215, 0, 0.2);
  --glass-blur: 10px;
  --glass-blur-heavy: 16px;
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);

  /* Princess Overlay Colors (unchanged) */
  --princess-elsa: rgba(147, 197, 253, 0.25);
  --princess-belle: rgba(252, 211, 77, 0.25);
  --princess-cinderella: rgba(249, 168, 212, 0.25);
  --princess-ariel: rgba(110, 231, 183, 0.25);

  /* Fonts */
  --font-body: 'Nunito', system-ui, sans-serif;
  --font-heading: 'Georgia', serif;

  /* shadcn Semantic (light mode — keep for shadcn compat) */
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.625rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}
```

- [ ] **Step 2: Update the `@theme inline` block — replace custom color references and add new glass-related theme entries**

In the `@theme inline` block, replace lines 72–76 (the custom theme colors section) with:

```css
  --color-gold-500: var(--color-gold);
  --color-rose-400: var(--color-rose);
  --color-purple-500: var(--color-purple);
  --color-sky-400: var(--color-sky);
  --color-mint-400: var(--color-mint);
```

Replace line 116 (`--font-heading: var(--font-sans);`) with:

```css
  --font-heading: 'Georgia', serif;
```

- [ ] **Step 3: Update the `@layer utilities` section (lines 191–207) with glass utilities**

Replace the entire `@layer utilities` block with:

```css
@layer utilities {
  .animate-burst {
    animation: burst 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  .glass-card {
    background: var(--glass-bg);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-border);
    border-radius: 16px;
  }
  .glass-card-hover:hover {
    background: var(--glass-bg-hover);
    border-color: rgba(255, 255, 255, 0.18);
  }
  .glass-card-active {
    background: var(--glass-bg-active);
    border-color: var(--glass-border-active);
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.08);
  }
  .glass-nav {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(var(--glass-blur-heavy));
    -webkit-backdrop-filter: blur(var(--glass-blur-heavy));
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: var(--glass-shadow);
  }
  .glass-header {
    background: rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .glass-toggle {
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .magical-glow {
    box-shadow: 0 0 20px 2px var(--color-gold);
  }
  .animate-float {
    animation: float 4s ease-in-out infinite;
  }
  .sparkle-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-gold);
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.6);
    animation: sparkle-pulse 1.5s ease-in-out infinite alternate;
  }
  @keyframes sparkle-pulse {
    0% { opacity: 0.3; transform: scale(0.8); }
    100% { opacity: 1; transform: scale(1.2); }
  }
  .gold-gradient-text {
    background: linear-gradient(135deg, #FFD700, #FF85A1);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .gold-gradient-bg {
    background: linear-gradient(135deg, #FFD700, #FFA500);
  }
}
```

- [ ] **Step 4: Update the `@layer base` body background**

Replace line 284 (`background-color: var(--color-royal-secondary);`) with:

```css
    background: linear-gradient(135deg, var(--bg-gradient-start), var(--bg-gradient-mid), var(--bg-gradient-end));
```

Also change line 288 (`@apply font-sans;`) to:

```css
    font-family: var(--font-body);
```

- [ ] **Step 5: Verify the build compiles**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds (may have warnings, no errors)

- [ ] **Step 6: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat(frontend): update design tokens to enchanted glassmorphism palette"
```

---

## Task 2: Frontend — Swap Geist font for Nunito

**Files:**
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Replace Geist import with Nunito in root layout**

In `frontend/app/layout.tsx`, replace line 3 (`import { Geist } from "next/font/google";`) and line 5 (`const geist = Geist({subsets:['latin'],variable:'--font-sans'});`) with:

```typescript
import { Nunito } from "next/font/google";

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['300', '400', '600', '700', '800'],
});
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/app/layout.tsx
git commit -m "feat(frontend): replace Geist with Nunito font"
```

---

## Task 3: Frontend — Update locale layout to dark gradient background

**Files:**
- Modify: `frontend/app/[locale]/layout.tsx`

- [ ] **Step 1: Replace the pink/white body background with the dark gradient**

In `frontend/app/[locale]/layout.tsx`, replace line 19 (the `<body>` className) from:

```
className="bg-[#FFF0F5] bg-[radial-gradient(circle_at_top,theme(colors.white/0.8)_0%,theme(colors.pink.100/0.5)_50%,theme(colors.purple.100/0.4)_100%)] min-h-screen"
```

to:

```
className="min-h-screen"
```

The gradient is now handled by globals.css `@layer base` body rule.

- [ ] **Step 2: Verify the page renders with dark background**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/app/[locale]/layout.tsx
git commit -m "feat(frontend): dark gradient body background"
```

---

## Task 4: Frontend — Update ParticlesBackground to sparkle config

**Files:**
- Modify: `frontend/components/ParticlesBackground.tsx`

- [ ] **Step 1: Update particle options**

In `frontend/components/ParticlesBackground.tsx`, replace the `options` prop object (lines 26–86) with:

```typescript
options={{
  fullScreen: { enable: false, zIndex: 0 },
  background: {
    color: {
      value: "transparent",
    },
  },
  fpsLimit: 60,
  interactivity: {
    events: {
      onHover: {
        enable: true,
        mode: "repulse",
      },
    },
    modes: {
      repulse: {
        distance: 100,
        duration: 0.4,
      },
    },
  },
  particles: {
    color: {
      value: ["#FFD700", "#FFFFFF", "#7EC8E3", "#FF85A1"],
    },
    links: {
      enable: false,
    },
    move: {
      direction: "none",
      enable: true,
      outModes: {
        default: "bounce",
      },
      random: true,
      speed: 0.4,
      straight: false,
    },
    number: {
      density: {
        enable: true,
      },
      value: 40,
    },
    opacity: {
      value: { min: 0.1, max: 0.7 },
      animation: {
        enable: true,
        speed: 1.5,
        sync: false,
      },
    },
    shape: {
      type: "circle",
    },
    size: {
      value: { min: 2, max: 5 },
      animation: {
        enable: true,
        speed: 2,
        sync: false,
      },
    },
  },
  detectRetina: true,
}}
```

Key changes: colors updated to gold/white/sky-blue/rose, count reduced to 40, size increased to 2-5px, opacity animation speed increased for twinkle effect.

- [ ] **Step 2: Verify build**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ParticlesBackground.tsx
git commit -m "feat(frontend): sparkle particle config with gold/rose/sky colors"
```

---

## Task 5: Frontend — Update Header component

**Files:**
- Modify: `frontend/components/Header.tsx`

- [ ] **Step 1: Rewrite Header component with glass panel and Georgia title**

Replace the entire return JSX in `Header.tsx` with:

```tsx
    <header className="fixed top-0 left-0 right-0 z-50 pt-safe-top glass-header">
      <div className="px-5 pb-3 flex items-center justify-between">
        <div className="flex flex-col mt-2">
          <h2
            className="text-transparent bg-clip-text gold-gradient-text drop-shadow-[0_2px_4px_rgba(255,215,0,0.3)] text-2xl font-black tracking-tight transition-transform hover:scale-105"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {t('title')}
          </h2>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <LanguageSelector value={locale as Language} onChange={handleLanguageChange} />
          <button
            onClick={() => router.push('/pick-child')}
            className="w-10 h-10 rounded-full border-2 border-white/20 shadow-md overflow-hidden active:scale-95 transition-transform gold-gradient-bg flex items-center justify-center"
          >
            <span className="text-sm font-black text-[#1a0533]">{initial}</span>
          </button>
        </div>
      </div>
    </header>
```

Note: Removed the scalloped SVG wave div entirely. Header uses `.glass-header` utility class. Title uses `.gold-gradient-text` and Georgia font. Avatar uses gold gradient.

- [ ] **Step 2: Verify build**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/components/Header.tsx
git commit -m "feat(frontend): glass header with Georgia title and gold avatar"
```

---

## Task 6: Frontend — Update BottomNav component

**Files:**
- Modify: `frontend/components/BottomNav.tsx`

- [ ] **Step 1: Replace neumorphic nav with glass floating pill**

Replace the entire return JSX in `BottomNav.tsx` (lines 26–65) with:

```tsx
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pb-[env(safe-area-inset-bottom)] w-11/12 max-w-sm">
      <nav className="glass-nav w-full flex items-center justify-around rounded-[28px] p-2.5 h-[96px]">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={handleInteraction}
              className={`relative flex flex-col items-center justify-center p-3 w-28 rounded-[28px] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                active
                  ? 'scale-95'
                  : 'scale-100 hover:scale-105 active:scale-95'
              }`}
              style={{
                backgroundColor: active ? 'rgba(255, 255, 255, 0.12)' : undefined,
                boxShadow: active
                  ? 'inset 4px 4px 8px rgba(0,0,0,0.2), inset -4px -4px 8px rgba(255,255,255,0.1)'
                  : undefined
              }}
            >
              <div
                className={`relative w-12 h-12 transition-all duration-300 ${
                  active ? 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)]' : 'drop-shadow-md opacity-50'
                }`}
              >
                <Image
                  src={tab.iconSrc}
                  alt={tab.label}
                  fill
                  sizes="48px"
                  className="object-contain"
                  priority
                />
              </div>
              <span className={`text-[10px] mt-1 font-semibold ${active ? 'text-[var(--color-gold)]' : 'text-white/40'}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
```

Also update the `tabs` array (lines 20–23) to remove `activeColor` since we now use gold for all active states:

```typescript
  const tabs = [
    { href: `/${locale}/inbox`, label: 'Inbox', iconSrc: '/inbox-3d.png' },
    { href: `/${locale}/story`, label: 'Story', iconSrc: '/story-3d.png' },
  ];
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/components/BottomNav.tsx
git commit -m "feat(frontend): glass floating nav with gold active states"
```

---

## Task 7: Frontend — Update PrincessCard component

**Files:**
- Modify: `frontend/components/PrincessCard.tsx`

- [ ] **Step 1: Replace white card with glass card and gold play button**

Replace the `<button>` element (lines 25–62) with:

```tsx
      <button
        onClick={() => onClick(princess.id)}
        disabled={isLoading}
        className="block w-full glass-card overflow-hidden text-left transition-all duration-300 active:scale-[0.96] disabled:opacity-70 hover:glass-card-hover"
      >
        {/* Image Area */}
        <div className={`relative w-full ${isPoster ? 'aspect-square' : 'aspect-video'} bg-black/20`}>
          <img
            src={princess.imageUrl}
            alt={princess.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/20 backdrop-blur-sm border border-white/10 flex items-center justify-center">
            <span className="text-sm">{princess.emoji}</span>
          </div>
        </div>

        {/* Text Content */}
        <div className="p-3.5 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold tracking-tight leading-tight text-sm mb-1" style={{ fontFamily: 'var(--font-body)' }}>
              {princess.name}
            </h3>
            <p className="text-white/40 font-medium text-[11px] leading-snug line-clamp-2">
              {princess.origin}
            </p>
          </div>
          <div className="flex-shrink-0 w-8 h-8 rounded-full gold-gradient-bg flex items-center justify-center text-[#1a0533] shadow-sm">
            {isLoading ? (
              <span className="animate-spin text-xs">✨</span>
            ) : (
              <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
            )}
          </div>
        </div>
      </button>
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/components/PrincessCard.tsx
git commit -m "feat(frontend): glass princess card with gold play button"
```

---

## Task 8: Frontend — Update LanguageSelector component

**Files:**
- Modify: `frontend/components/LanguageSelector.tsx`

- [ ] **Step 1: Replace neumorphic clay toggle with glass toggle**

Replace the outer `<button>` element (lines 20–43) with:

```tsx
    <button
      onClick={toggleLanguage}
      type="button"
      className="relative w-[96px] h-12 rounded-full glass-toggle p-1.5 flex items-center focus:outline-none focus:ring-4 focus:ring-[var(--color-gold)]/30 transition-shadow"
      aria-label="Toggle Language"
    >
      {/* Sliding Gold Ball */}
      <div
        className={`absolute top-1.5 bottom-1.5 w-[42px] rounded-full gold-gradient-bg shadow-[0_4px_12px_rgba(255,215,0,0.3)] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          value === 'vi' ? 'translate-x-[42px]' : 'translate-x-0'
        }`}
      />

      {/* Flags */}
      <div className="relative z-10 w-full flex justify-between px-1 pointer-events-none">
        <div className={`w-[42px] flex justify-center items-center text-2xl transition-all duration-300 ${value === 'en' ? 'opacity-100 scale-110 drop-shadow-sm' : 'opacity-50 grayscale scale-95'}`}>
          🇬🇧
        </div>
        <div className={`w-[42px] flex justify-center items-center text-2xl transition-all duration-300 ${value === 'vi' ? 'opacity-100 scale-110 drop-shadow-sm' : 'opacity-50 grayscale scale-95'}`}>
          🇻🇳
        </div>
      </div>
    </button>
```

Key changes: `glass-toggle` replaces neumorphic shadows. Slider ball uses `gold-gradient-bg` instead of clay white. Focus ring uses gold color.

- [ ] **Step 2: Verify build**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/components/LanguageSelector.tsx
git commit -m "feat(frontend): glass language toggle with gold slider"
```

---

## Task 9: Frontend — Update AudioPlayer component

**Files:**
- Modify: `frontend/components/AudioPlayer.tsx`

- [ ] **Step 1: Update the play button to gold gradient**

On line 125, change the play button className from:

```
className="w-20 h-20 bg-white rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.15)] flex items-center justify-center text-[var(--color-primary-orange)] transition-transform active:scale-95"
```

to:

```
className="w-20 h-20 gold-gradient-bg rounded-full shadow-[0_10px_30px_rgba(255,215,0,0.2)] flex items-center justify-center text-[#1a0533] transition-transform active:scale-95"
```

- [ ] **Step 2: Update the bottom sheet to glass panel**

On line 136, change from:

```
className="absolute inset-0 bg-[var(--background)] rounded-t-[40px] shadow-[0_-15px_50px_rgba(0,0,0,0.4)] overflow-hidden pointer-events-auto flex flex-col pt-16"
```

to:

```
className="absolute inset-0 bg-[#1a0533]/90 backdrop-blur-xl rounded-t-[40px] shadow-[0_-15px_50px_rgba(0,0,0,0.4)] border-t border-white/10 overflow-hidden pointer-events-auto flex flex-col pt-16"
```

- [ ] **Step 3: Update text colors in the transcript area for dark background**

On line 144 (princess name), change `text-gray-900` to `text-white`.

On line 147 (origin text), change `text-gray-400` to `text-white/50`.

On line 148 (runtime text), change `text-gray-500` to `text-white/40`.

On line 151 (story text), change `text-gray-700` to `text-white/80`.

- [ ] **Step 4: Update the progress bar to gold**

On line 176 (progress fill), change:

```
className="h-full bg-[var(--color-primary-orange)] rounded-full relative"
```

to:

```
className="h-full gold-gradient-bg rounded-full relative"
```

On line 179 (progress dot), change `border-[var(--color-primary-orange)]` to `border-[var(--color-gold)]`.

- [ ] **Step 5: Update the progress bar track and time labels for dark bg**

On line 174 (track), change `bg-gray-200` to `bg-white/10`.

On line 171 (time label), change `text-gray-400` to `text-white/40`.

On line 182 (time label), change `text-gray-400` to `text-white/40`.

- [ ] **Step 6: Update the hold-to-exit fill color**

On line 205, change `bg-[var(--color-primary-orange)]` to `bg-[var(--color-gold)]`.

On line 202 (button bg), change `bg-black` to `bg-white/10 backdrop-blur-sm border border-white/10`.

- [ ] **Step 7: Update the royal challenge box for dark bg**

On lines 155–163, change:

```
className="mt-6 mb-4 border-2 border-amber-300 rounded-2xl bg-amber-50 p-5"
```

to:

```
className="mt-6 mb-4 border border-[var(--color-gold)]/30 rounded-2xl bg-[var(--color-gold)]/10 p-5"
```

On line 156, change `text-amber-700` to `text-[var(--color-gold)]`.

On line 159, change `text-gray-800` to `text-white/90`.

- [ ] **Step 8: Update the footer bar for dark bg**

On line 167, change `bg-[var(--background)] border-t border-gray-100` to `bg-[#1a0533]/90 backdrop-blur-xl border-t border-white/5`.

On line 190 (rewind button), change `text-gray-400 hover:text-gray-600` to `text-white/40 hover:text-white/70`.

On line 213 (skip button), change `text-gray-400 hover:text-gray-600` to `text-white/40 hover:text-white/70`.

- [ ] **Step 9: Verify build**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 10: Commit**

```bash
git add frontend/components/AudioPlayer.tsx
git commit -m "feat(frontend): glass audio player with gold progress and dark theme"
```

---

## Task 10: Frontend — Update PWA manifest

**Files:**
- Modify: `frontend/public/manifest.json`

- [ ] **Step 1: Update theme and background colors**

Change `"background_color": "#f5f0ff"` to `"background_color": "#1a0533"`.

Change `"theme_color": "#b085d8"` to `"theme_color": "#2d1b69"`.

- [ ] **Step 2: Commit**

```bash
git add frontend/public/manifest.json
git commit -m "feat(frontend): update PWA manifest to dark gradient theme"
```

---

## Task 11: Frontend — Verify frontend builds and run tests

**Files:** None (verification only)

- [ ] **Step 1: Run frontend build**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run frontend tests**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run lint**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend && npm run lint`
Expected: No errors

---

## Task 12: Admin — Update globals.css with warm cream tokens

**Files:**
- Modify: `admin/app/globals.css`

- [ ] **Step 1: Replace the entire file contents**

Replace the entire `admin/app/globals.css` with:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  /* Admin Warm Cream Palette */
  --background: 30 50% 97%;
  --foreground: 266 50% 20%;
  --card: 0 0% 100%;
  --card-foreground: 266 50% 20%;
  --border: 266 30% 92%;
  --input: 266 30% 92%;
  --primary: 45 100% 50%;
  --primary-foreground: 266 60% 10%;
  --secondary: 266 30% 95%;
  --secondary-foreground: 266 50% 20%;
  --muted: 266 20% 94%;
  --muted-foreground: 0 0% 55%;
  --accent: 266 40% 70%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 63% 55%;
  --destructive-foreground: 0 0% 100%;
  --radius: 0.5rem;

  /* Sidebar */
  --sidebar-bg: linear-gradient(180deg, #2d1b69, #1a0533);
  --sidebar-border: rgba(255, 255, 255, 0.08);

  /* Custom admin tokens */
  --admin-bg: #FFF8F0;
  --admin-card: #FFFFFF;
  --admin-card-shadow: 0 4px 20px rgba(45, 27, 105, 0.06);
  --admin-card-border: rgba(147, 112, 219, 0.08);
  --admin-input-bg: #FDFBF8;
  --admin-input-border: rgba(147, 112, 219, 0.15);
  --admin-focus-ring: #9370DB;
  --admin-text-primary: #2d1b69;
  --admin-text-secondary: #888888;
  --admin-text-muted: #AAAAAA;
  --admin-gold: #FFD700;
  --admin-gold-dark: #FFA500;
  --admin-purple: #9370DB;

  /* Persona chip colors */
  --chip-elsa-bg: rgba(147, 197, 253, 0.15);
  --chip-elsa-border: rgba(147, 197, 253, 0.3);
  --chip-elsa-text: #4A90D9;
  --chip-belle-bg: rgba(252, 211, 77, 0.15);
  --chip-belle-border: rgba(252, 211, 77, 0.3);
  --chip-belle-text: #B8860B;
  --chip-cinderella-bg: rgba(249, 168, 212, 0.15);
  --chip-cinderella-border: rgba(249, 168, 212, 0.3);
  --chip-cinderella-text: #D4729B;
  --chip-ariel-bg: rgba(110, 231, 183, 0.15);
  --chip-ariel-border: rgba(110, 231, 183, 0.3);
  --chip-ariel-text: #2E8B57;

  /* Fonts */
  --font-body: 'Nunito', system-ui, sans-serif;
  --font-heading: 'Georgia', serif;
}

* {
  border-color: hsl(var(--border));
}

body {
  background-color: var(--admin-bg);
  color: hsl(var(--foreground));
  font-family: var(--font-body);
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/admin && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add admin/app/globals.css
git commit -m "feat(admin): warm cream design tokens replacing dark slate"
```

---

## Task 13: Admin — Update layout with Nunito font

**Files:**
- Modify: `admin/app/layout.tsx`

- [ ] **Step 1: Add Nunito font import and apply to body**

Replace the entire `admin/app/layout.tsx` with:

```tsx
import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import { Sidebar } from '@/components/Sidebar';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['300', '400', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Royal Dispatch Admin',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${nunito.variable} flex h-screen overflow-hidden`}>
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/admin && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add admin/app/layout.tsx
git commit -m "feat(admin): add Nunito font loading"
```

---

## Task 14: Admin — Update Sidebar component

**Files:**
- Modify: `admin/components/Sidebar.tsx`

- [ ] **Step 1: Replace dark slate sidebar with purple gradient and gold accents**

Replace the entire `admin/components/Sidebar.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Baby } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/children', icon: Baby, label: 'Children' },
  { href: '/users', icon: Users, label: 'Users' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-14 flex-shrink-0 flex flex-col items-center py-4 gap-2"
      style={{
        background: 'linear-gradient(180deg, #2d1b69, #1a0533)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-base mb-4"
        style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)' }}
      >
        👑
      </div>

      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 group relative',
              active
                ? 'text-[#FFD700]'
                : 'text-white/40 hover:text-white/70',
            )}
            style={{
              background: active
                ? 'rgba(255, 215, 0, 0.12)'
                : undefined,
            }}
          >
            <Icon size={18} />
            <span className="absolute left-12 bg-[#2d1b69] text-white/80 text-xs px-2 py-1 rounded border border-white/10 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
              {label}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}
```

Key changes: Sidebar bg is purple gradient. Logo has gold gradient bg. Active nav uses gold text + gold bg tint. Inactive uses white/40. Tooltip bg matches purple.

- [ ] **Step 2: Verify build**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/admin && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add admin/components/Sidebar.tsx
git commit -m "feat(admin): purple gradient sidebar with gold accents"
```

---

## Task 15: Admin — Update UsersTable component

**Files:**
- Modify: `admin/components/UsersTable.tsx`

- [ ] **Step 1: Update form input styling**

Replace all form input classes. In the "Add user form" section, update the two `<input>` elements.

For the Name input, replace the className with:

```
className="px-3 py-2 rounded-[10px] text-sm border bg-[var(--admin-input-bg)] border-[var(--admin-input-border)] text-[var(--admin-text-primary)] placeholder-[var(--admin-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--admin-focus-ring)] w-48"
```

For the Chat ID input, replace the className with the same pattern but `w-44`:

```
className="px-3 py-2 rounded-[10px] text-sm border bg-[var(--admin-input-bg)] border-[var(--admin-input-border)] text-[var(--admin-text-primary)] placeholder-[var(--admin-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--admin-focus-ring)] w-44"
```

For the label elements, change `text-slate-400` to `text-[var(--admin-text-secondary)]`.

For the submit button, replace the className with:

```
className="px-4 py-2 rounded-[10px] text-sm font-bold gold-gradient-bg text-[var(--primary-foreground)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
```

- [ ] **Step 2: Update the token display panel**

On the `newToken` display div, change `bg-slate-800 border-indigo-600` to `bg-white border-[var(--admin-purple)]/30` and `text-slate-400` to `text-[var(--admin-text-secondary)]` and `text-indigo-300` to `text-[var(--admin-purple)]`.

- [ ] **Step 3: Update the table container**

Replace the table container div className from `rounded-xl border border-slate-800 overflow-hidden` to:

```
className="rounded-2xl overflow-hidden bg-white border border-[var(--admin-card-border)] shadow-[var(--admin-card-shadow)]"
```

- [ ] **Step 4: Update table header row**

Change the `<tr>` header from `border-b border-slate-800 bg-slate-950` to:

```
className="border-b border-[var(--admin-card-border)]"
style={{ background: 'linear-gradient(135deg, #2d1b69, #1a0533)' }}
```

Change `<th>` from `text-slate-500` to `text-white/60`.

- [ ] **Step 5: Update table body rows**

Change the `<tr>` onClick row from `border-b border-slate-800 last:border-0 hover:bg-slate-800/30` to `border-b border-[var(--admin-card-border)] last:border-0 hover:bg-[var(--admin-purple)]/[0.04] cursor-pointer`.

Change `<td>` name cell from `text-slate-200 font-medium` to `text-[var(--admin-text-primary)] font-semibold`.

Change `<td>` chat id cell from `text-slate-400 font-mono` to `text-[var(--admin-text-secondary)] font-mono`.

Change `<td>` token code from `bg-slate-800 text-slate-300` to `bg-[var(--admin-bg)] text-[var(--admin-text-secondary)]`.

Change copy button from `text-slate-500 hover:text-indigo-400` to `text-[var(--admin-text-muted)] hover:text-[var(--admin-purple)]`.

Change delete button from `text-slate-500 hover:text-red-400` to `text-[var(--admin-text-muted)] hover:text-red-400`.

Change chevron icons from `text-slate-400` / `text-slate-600` to `text-[var(--admin-text-muted)]`.

- [ ] **Step 6: Update expanded row**

Change expanded `<tr>` from `border-b border-slate-800 bg-slate-800/20` to `border-b border-[var(--admin-card-border)] bg-[var(--admin-purple)]/[0.03]`.

Change `<td>` inner text colors: `text-slate-400` → `text-[var(--admin-text-secondary)]`, `text-slate-300` → `text-[var(--admin-text-primary)]`, `text-slate-500` → `text-[var(--admin-text-muted)]`.

- [ ] **Step 7: Verify build**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/admin && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add admin/components/UsersTable.tsx
git commit -m "feat(admin): warm cream table with purple header and gold buttons"
```

---

## Task 16: Admin — Update ChildrenTable component

**Files:**
- Modify: `admin/components/ChildrenTable.tsx`

- [ ] **Step 1: Update form inputs and button**

Apply the same input styling pattern as Task 15 to all three form inputs (Child Name, Timezone, + Add Child button).

Input classnames: `px-3 py-2 rounded-[10px] text-sm border bg-[var(--admin-input-bg)] border-[var(--admin-input-border)] text-[var(--admin-text-primary)] placeholder-[var(--admin-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--admin-focus-ring)] w-48`

Labels: `text-[var(--admin-text-secondary)]`

Button: `px-4 py-2 rounded-[10px] text-sm font-bold gold-gradient-bg text-[var(--primary-foreground)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all`

- [ ] **Step 2: Update table container, header, rows**

Apply the exact same pattern as Task 15 Steps 3–6 to the ChildrenTable. The structure is identical — only the column content differs.

Table container: `rounded-2xl overflow-hidden bg-white border border-[var(--admin-card-border)] shadow-[var(--admin-card-shadow)]`

Header row: purple gradient bg, `text-white/60` text.

Data rows: `border-b border-[var(--admin-card-border)] last:border-0 hover:bg-[var(--admin-purple)]/[0.04]`

User badges: change `bg-slate-800 text-slate-300` to `bg-[var(--admin-bg)] text-[var(--admin-text-secondary)]`.

All slate colors replaced with `var(--admin-text-*)` equivalents.

- [ ] **Step 3: Update link user form in expanded row**

Select and input elements: same pattern as Step 1 but with smaller padding (`py-1.5`) and `w-44` / `w-36` widths.

Link button: same gold gradient pattern with `px-3 py-1.5`.

- [ ] **Step 4: Verify build**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/admin && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add admin/components/ChildrenTable.tsx
git commit -m "feat(admin): warm cream children table with gold buttons"
```

---

## Task 17: Admin — Update CharactersPicker component

**Files:**
- Modify: `admin/components/CharactersPicker.tsx`

- [ ] **Step 1: Add persona-based chip colors**

Add a `CHIP_STYLES` constant at the top of the component:

```typescript
const CHIP_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  elsa: { bg: 'var(--chip-elsa-bg)', border: 'var(--chip-elsa-border)', text: 'var(--chip-elsa-text)' },
  belle: { bg: 'var(--chip-belle-bg)', border: 'var(--chip-belle-border)', text: 'var(--chip-belle-text)' },
  cinderella: { bg: 'var(--chip-cinderella-bg)', border: 'var(--chip-cinderella-border)', text: 'var(--chip-cinderella-text)' },
  ariel: { bg: 'var(--chip-ariel-bg)', border: 'var(--chip-ariel-border)', text: 'var(--chip-ariel-text)' },
};

const DEFAULT_CHIP = { bg: 'var(--admin-bg)', border: 'var(--admin-input-border)', text: 'var(--admin-text-secondary)' };
```

- [ ] **Step 2: Update chip rendering to use per-persona colors**

Replace the chip `className` logic. Change the selected/unselected logic from indigo/slate to:

```tsx
const style = isSelected
  ? CHIP_STYLES[persona.id] ?? DEFAULT_CHIP
  : null;

const chipClassName = cn(
  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
  isSelected
    ? ''
    : 'bg-white border-[var(--admin-input-border)] text-[var(--admin-text-muted)] hover:border-[var(--admin-purple)]/30',
  isDisabled && 'opacity-40 cursor-not-allowed',
);

// And add style prop to the button:
<button
  key={persona.id}
  data-testid={`chip-${persona.id}`}
  onClick={() => toggle(persona.id)}
  disabled={isDisabled}
  className={chipClassName}
  style={isSelected ? {
    backgroundColor: style?.bg,
    borderColor: style?.border,
    color: style?.text,
  } : undefined}
>
  {persona.name}
</button>
```

- [ ] **Step 3: Update the count text colors**

Change `text-slate-300` to `text-[var(--admin-text-primary)]` and `text-slate-500` to `text-[var(--admin-text-secondary)]` and `text-slate-600` to `text-[var(--admin-text-muted)]`.

- [ ] **Step 4: Verify build**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/admin && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add admin/components/CharactersPicker.tsx
git commit -m "feat(admin): per-princess pastel persona chips"
```

---

## Task 18: Admin — Verify admin builds and run tests

**Files:** None (verification only)

- [ ] **Step 1: Run admin build**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/admin && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run admin tests**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/admin && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run lint**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/admin && npm run lint`
Expected: No errors

---

## Task 19: Final verification — both apps

- [ ] **Step 1: Run frontend build + tests**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend && npm run build && npx vitest run && npm run lint`
Expected: All pass

- [ ] **Step 2: Run admin build + tests**

Run: `cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/admin && npm run build && npx vitest run && npm run lint`
Expected: All pass

- [ ] **Step 3: Create final summary commit if any fixes were needed**

If any fixes were applied during verification:
```bash
git add -A
git commit -m "fix: polish enchanted glassmorphism redesign after verification"
```
