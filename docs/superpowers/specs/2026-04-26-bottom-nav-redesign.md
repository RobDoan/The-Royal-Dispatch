# Bottom Nav Redesign: Rainbow Arc for Preschoolers

**Date:** 2026-04-26
**Platform:** Frontend (Next.js) only
**Scope:** `frontend/components/BottomNav.tsx`

## Context

The current bottom nav uses a glassmorphism bar with 3D PNG icons and monochrome gold/white active states. It works but feels subdued — the target audience is children aged 3-5 who respond to bright colors, bouncy motion, and clear visual feedback. The goal is a pastel rainbow "arc" style that feels like a toy, not a productivity app.

## Design

### Visual Direction: Rainbow Arc

A pastel rainbow gradient bar where the active tab pops up as a colored circle above the bar with a spring bounce animation. Each tab has its own color identity so pre-readers can navigate by color alone.

### Container

- **Background:** Horizontal rainbow pastel gradient — `#ffd6e0` (pink) → `#f0d6ff` (lavender) → `#d6e8ff` (sky) → `#d6fff0` (mint) → `#fff5d6` (cream)
- **Border radius:** `32px` top corners, `36px` bottom corners (cloud-like softness)
- **Height:** 88px
- **Box shadow:** Upward-facing soft glow `0 -4px 24px rgba(255,182,193,0.2), 0 -2px 12px rgba(147,112,219,0.15)` plus inset highlight `inset 0 2px 4px rgba(255,255,255,0.5)`
- **Position:** Fixed bottom, centered, `max-w-sm`, `w-11/12`, safe-area-inset-bottom padding (same as current)
- **No glassmorphism:** Remove backdrop-blur and transparent background

### Active Tab

- **Size:** 60px circle
- **Position:** Pops up 14px above the bar (`translateY(-14px)`)
- **Background:** Per-tab pastel gradient (see color assignments below)
- **Box shadow:** Colored glow matching tab color — e.g., `0 6px 20px rgba(255,131,161,0.45), 0 2px 8px rgba(255,131,161,0.3), inset 0 2px 4px rgba(255,255,255,0.7)`
- **Icon:** Emoji rendered as text at `28px`
- **Label:** 11px, bold (font-weight 800), color-matched, with white text-shadow
- **Animation:** Spring bounce on activation — `350ms cubic-bezier(0.34, 1.56, 0.64, 1)`

### Inactive Tab

- **Size:** 48px circle
- **Position:** Flush inside the bar (no translateY)
- **Opacity:** 55%
- **Background:** Muted version of tab's pastel gradient
- **Box shadow:** Subtle `0 2px 8px` with reduced opacity
- **Icon:** Emoji at `22px`
- **Label:** 10px, semibold (font-weight 600), muted color
- **Hover:** Scale up to 1.08, opacity up to 75%

### Color Assignments

| Tab | Active Gradient | Glow Color | Label Color |
|---|---|---|---|
| Inbox | `#fff0f5` → `#ffe0eb` (soft pink) | `rgba(255,131,161,0.45)` | `#ff6b8a` |
| Story | `#f0e6ff` → `#e6d6ff` (soft lavender) | `rgba(147,112,219,0.35)` | `#8b6bb5` |

Each tab's color is unique so children associate pink = Inbox (mail), lavender = Story (book).

### Animations

1. **Tab switch:** Active tab bounces up with `cubic-bezier(0.34, 1.56, 0.64, 1)` over 350ms. Previous active tab fades to 55% opacity and sinks back down.
2. **Tap feedback:** Quick squish — scale `0.9 → 1.05 → 1.0` over 200ms (CSS `active` pseudo-class or pointer events).
3. **Haptic:** Keep existing `navigator.vibrate(50)`.
4. **Idle breathing (optional):** Active tab icon has a subtle 3s infinite pulse — scale `1.0 ↔ 1.04` — to feel alive. Can be toggled with `prefers-reduced-motion`.

### Icons

Replace 3D PNG image assets (`/inbox-3d.png`, `/story-3d.png`) with emoji:
- Inbox: 💌 (love letter — immediately recognizable as "mail")
- Story: 📖 (open book — clear "story" association)

Emoji are resolution-independent, colorful on all platforms, and don't require asset files.

### What Changes

- **Remove:** Glass morphism (backdrop-blur, transparent bg), 3D PNG icon assets, white/gold monochrome active state, inset box-shadow pressed effect
- **Add:** Rainbow pastel gradient background, per-tab color-coded circles, pop-up active state with spring bounce, emoji icons, colored glow shadows
- **Update:** CSS transition from `300ms cubic-bezier(0.34,1.56,0.64,1)` to `350ms` for slightly more pronounced spring

### What Stays the Same

- 2 tabs: Inbox + Story
- Fixed bottom position, centered, `max-w-sm`, `w-11/12`
- Safe area inset padding
- Link-based navigation via `next/link`
- `pathname.startsWith()` active detection
- Haptic vibration on tap
- Client component (`'use client'`)

### Files Modified

- `frontend/components/BottomNav.tsx` — full visual rewrite
- `frontend/tests/BottomNav.test.tsx` — update tests to match new DOM structure (emoji instead of `<Image>`, new CSS classes/styles)

### Files Not Modified

- `frontend/components/Header.tsx` — no changes
- `frontend/app/[locale]/(tabs)/layout.tsx` — no changes (same BottomNav import)
- `frontend/app/globals.css` — no new CSS classes needed (inline styles for the gradient)

### Accessibility

- Emoji have `aria-label` attributes for screen readers (`aria-label="Inbox"`, `aria-label="Story"`)
- `<nav>` element retains `aria-label="Main navigation"`
- `prefers-reduced-motion` disables spring bounce and idle breathing, using simple opacity/scale transitions instead
- Touch targets meet WCAG 2.5.5 (minimum 44px) — active tab is 60px, inactive is 48px
- Color is not the sole indicator — icons + labels also differentiate tabs
