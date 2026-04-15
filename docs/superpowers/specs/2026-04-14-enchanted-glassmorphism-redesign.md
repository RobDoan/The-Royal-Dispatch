# Design Spec: Enchanted Glassmorphism Redesign

**Date:** 2026-04-14
**Apps:** Frontend (kid-facing PWA) + Admin (parent-facing dashboard)
**Approach:** Enchanted Glassmorphism — frosted glass over rich gradients, gold accents, Disney+ premium feel with storybook warmth.

---

## 1. Design Direction

**Vibe:** Elegant but whimsical. Disney+ meets enchanted kingdom. Modern glassmorphism with warm gold and royal purple accents.

**Philosophy:**
- Frontend: Dark gradient backgrounds with frosted glass panels. Sparkle particles. Gold interactive elements. Premium, immersive, kid-engaging.
- Admin: Warm cream base with white cards. Dark purple sidebar connecting to brand. Professional but warm. Not kid-facing, but brand-consistent.
- Both apps share the same color tokens, typography families, and radius scale for visual cohesion.

---

## 2. Color Palette

### Shared Accent Colors

| Token | Hex | Usage |
|---|---|---|
| `--color-gold` | `#FFD700` | Primary accent, CTAs, active states, progress bars |
| `--color-rose` | `#FF85A1` | Secondary accent, highlights, unread indicators |
| `--color-purple` | `#9370DB` | Tertiary accent, navigation, identity |
| `--color-sky` | `#7EC8E3` | Info, links, Ariel persona |
| `--color-mint` | `#6EE7B7` | Success states, Ariel persona |

### Frontend Colors

| Token | Value | Usage |
|---|---|---|
| `--bg-gradient-start` | `#1a0533` | Background gradient start (Royal Night) |
| `--bg-gradient-end` | `#0f2b4a` | Background gradient end (Deep Ocean) |
| `--glass-bg` | `rgba(255, 255, 255, 0.08)` | Card/panel backgrounds |
| `--glass-border` | `rgba(255, 255, 255, 0.12)` | Card/panel borders |
| `--glass-blur` | `10px` | Backdrop blur for glass effect |
| `--glass-bg-hover` | `rgba(255, 255, 255, 0.12)` | Hovered card background |
| `--glass-bg-active` | `rgba(255, 215, 0, 0.06)` | Active/selected card tint |

### Admin Colors

| Token | Value | Usage |
|---|---|---|
| `--admin-bg` | `#FFF8F0` | Page background (Warm Cream) |
| `--admin-card` | `#FFFFFF` | Card/container backgrounds |
| `--admin-card-shadow` | `0 4px 20px rgba(45, 27, 105, 0.06)` | Card shadow |
| `--admin-card-border` | `rgba(147, 112, 219, 0.08)` | Card border |
| `--admin-sidebar-start` | `#2d1b69` | Sidebar gradient start |
| `--admin-sidebar-end` | `#1a0533` | Sidebar gradient end |
| `--admin-text-primary` | `#2d1b69` | Primary text color |
| `--admin-text-secondary` | `#888888` | Secondary/muted text |
| `--admin-text-muted` | `#AAAAAA` | Tertiary/hint text |
| `--admin-input-bg` | `#FDFBF8` | Input background |
| `--admin-input-border` | `rgba(147, 112, 219, 0.15)` | Input border |
| `--admin-focus-ring` | `#9370DB` | Focus ring color |

### Princess Overlay Colors (unchanged)

| Princess | Value |
|---|---|
| Elsa | `rgba(147, 197, 253, 0.25)` — Ice blue |
| Belle | `rgba(252, 211, 77, 0.25)` — Warm gold |
| Cinderella | `rgba(249, 168, 212, 0.25)` — Pink |
| Ariel | `rgba(110, 231, 183, 0.25)` — Sea green |

### Sparkle Particle Colors

Replace current `["#FFFFFF", "#FFB6C1", "#87CEEB", "#E6E6FA"]` with:
`["#FFD700", "#FFFFFF", "#7EC8E3", "#FF85A1"]` — Gold, White, Sky Blue, Rose

---

## 3. Typography

### Font Families

| Role | Font | Fallback | Usage |
|---|---|---|---|
| Headings/Display | Georgia | `'Playfair Display', serif` | App titles, section headings (gradient text) |
| Body/UI | Nunito | `system-ui, sans-serif` | All other text — labels, body, form fields, table text |

### Weight Scale

| Weight | Value | Usage |
|---|---|---|
| Light | 300 | Decorative, secondary |
| Regular | 400 | Body text, table values |
| Semi-bold | 600 | Table headers, form labels, nav items |
| Bold | 700 | Card titles, page headings |
| Black | 800 | Display titles (audio player princess name) |

### Implementation

- **Frontend:** Load Nunito via `next/font/google` in root layout (replaces Geist). Georgia is system-available.
- **Admin:** Load Nunito via `next/font/google` in root layout (replaces Inter reference). Georgia is system-available.
- Both apps apply `--font-body: 'Nunito', system-ui, sans-serif` and `--font-heading: 'Georgia', serif` as CSS custom properties.

---

## 4. Component Patterns

### Frontend Components

#### Glass Card (replaces neumorphic cards)
```
background: rgba(255, 255, 255, 0.08)
backdrop-filter: blur(10px)
border: 1px solid rgba(255, 255, 255, 0.12)
border-radius: 16px
```

Active/selected card adds:
```
border-color: rgba(255, 215, 0, 0.2)
background: rgba(255, 255, 255, 0.12)
box-shadow: 0 0 20px rgba(255, 215, 0, 0.08)
```

#### Glass Navigation Pill (replaces neumorphic nav)
```
background: rgba(255, 255, 255, 0.1)
backdrop-filter: blur(16px)
border: 1px solid rgba(255, 255, 255, 0.15)
border-radius: 28px
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3)
```

Active tab: Gold text color. Inactive tab: `rgba(255, 255, 255, 0.5)`.

#### Header (replaces scalloped header)
```
background: rgba(255, 255, 255, 0.06)
backdrop-filter: blur(12px)
border-bottom: 1px solid rgba(255, 255, 255, 0.1)
```

Title: Georgia font, `font-size: 18px`, `font-weight: 700`, gradient text (`linear-gradient(135deg, #FFD700, #FF85A1)`). Remove scalloped SVG wave.

#### Language Toggle (evolves claymorphism)
Glass toggle replacing neumorphic clay:
```
background: rgba(255, 255, 255, 0.08)
backdrop-filter: blur(8px)
border: 1px solid rgba(255, 255, 255, 0.12)
```

Slider ball: `#FFD700` (gold) instead of clay white. Keep spring animation and haptic feedback.

#### Princess Card Play Button
Gold gradient circle replacing current coral (`#F47F60`):
```
background: linear-gradient(135deg, #FFD700, #FFA500)
color: #1a0533
```

#### Audio Player
- Bottom sheet: Glass panel with `border-radius: 40px` top corners. Remove solid background.
- Progress bar track: Gold gradient fill (`linear-gradient(90deg, #FFD700, #FFA500)`) instead of rose.
- Play button: Gold gradient circle.
- Hold-to-exit: Keep current toddler-lock pattern. Fill color shifts from `#9370DB` (purple) to `#FFD700` (gold).

#### Child Avatar Button (Header)
Gradient circle updated to gold + purple:
```
background: linear-gradient(135deg, #FFD700, #9370DB)
```

### Admin Components

#### Card Container
```
background: #FFFFFF
border-radius: 16px
box-shadow: 0 4px 20px rgba(45, 27, 105, 0.06)
border: 1px solid rgba(147, 112, 219, 0.08)
```

#### Table
Container: Same card container styling.
Header row:
```
background: linear-gradient(135deg, #2d1b69, #1a0533)
color: rgba(255, 255, 255, 0.6)
font-size: 11px
text-transform: uppercase
letter-spacing: 0.08em
font-weight: 600
```

Data rows:
```
border-bottom: 1px solid rgba(147, 112, 219, 0.06)
text-primary: #2d1b69
text-secondary: #888888
hover: rgba(147, 112, 219, 0.04)
```

#### Sidebar
```
background: linear-gradient(180deg, #2d1b69, #1a0533)
width: 60px
```

Nav items: Emoji icons or lucide icons with `rgba(255, 255, 255, 0.5)` default, `#FFD700` active. Active indicator: subtle gold background glow.

#### Form Inputs
```
background: #FDFBF8
border: 1px solid rgba(147, 112, 219, 0.15)
border-radius: 10px
focus ring: #9370DB
font-family: Nunito, sans-serif
```

#### Primary Button
```
background: linear-gradient(135deg, #FFD700, #FFA500)
color: #1a0533
font-weight: 700
border-radius: 10px
font-family: Nunito, sans-serif
```

Hover: Brighten gradient. Disabled: `opacity: 0.5`.

#### Persona Chips
Per-princess pastel tints:

| Princess | Background | Border | Text |
|---|---|---|---|
| Elsa | `rgba(147, 197, 253, 0.15)` | `rgba(147, 197, 253, 0.3)` | `#4A90D9` |
| Belle | `rgba(252, 211, 77, 0.15)` | `rgba(252, 211, 77, 0.3)` | `#B8860B` |
| Cinderella | `rgba(249, 168, 212, 0.15)` | `rgba(249, 168, 212, 0.3)` | `#D4729B` |
| Ariel | `rgba(110, 231, 183, 0.15)` | `rgba(110, 231, 183, 0.3)` | `#2E8B57` |

Selected state: Border thickens to 2px. Unselected: `#E8E8E8` bg, `#CCCCCC` border.

---

## 5. Radius Scale (Shared)

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 8px | Small elements, badges, inline code |
| `--radius-md` | 12px | Inputs, buttons |
| `--radius-lg` | 16px | Cards, containers |
| `--radius-xl` | 20px | Large cards, panels |
| `--radius-pill` | 9999px | Chips, toggle, nav pill |

---

## 6. Animation & Motion

### Frontend Animations

**Particle System (ParticlesBackground.tsx):**
- Reduce count from 60 to 40
- Change colors to gold/white/sky-blue/rose
- Add twinkle mode (opacity pulse + scale oscillation)
- 2-5px size range with glow effect
- Slow drift + gentle sway (keep current speed)

**Micro-interactions:**

| Interaction | Animation | Duration | Easing |
|---|---|---|---|
| Princess card tap | `scale(0.96)` → `scale(1)` + sparkle burst | 150ms | ease-out spring |
| New letter arrival | Slide up + fade in, gold dot pulses | 300ms | ease-out |
| Play button | Gentle pulse-glow (gold), on tap: sparkle ring expands | 150ms | ease-out |
| Audio progress | Gold gradient fill, sparkle trail at leading edge | continuous | linear |
| Page transition (in) | Slide + fade | 200ms | ease-out |
| Page transition (out) | Shrink + fade | 200ms | ease-in |
| Hold-to-exit fill | Purple → gold color shift | 2000ms | linear |
| Hold-to-exit complete | Sparkle burst | 300ms | ease-out |

**Existing animations to update:**
- `.animate-burst` — update colors from rose to gold
- `.magical-glow` — update `--color-primary-orange` to `--color-gold`
- Ken Burns — keep as-is (works well for video background)

**Glass card hover (cursor devices):**
```
transform: translateY(-1px)
border-color: rgba(255, 255, 255, 0.18)
background: rgba(255, 255, 255, 0.12)
```

### Admin Animations (Subtle)

| Interaction | Animation | Duration |
|---|---|---|
| Card hover | `translateY(-2px)` + shadow deepen | 200ms |
| Table row expand | Smooth height transition | 200ms ease |
| Form save success | Gold flash on card border | 400ms |
| Delete confirmation | Row shake before removal | 300ms |
| Sidebar active indicator | Slides between items | 200ms |
| Page load | Cards stagger in (50ms offset each) | 300ms per card |

### Accessibility

All animations respect `prefers-reduced-motion: reduce`:
- Particles disabled
- Transitions reduced to 0ms
- No sparkle effects
- Static glass panels still render (no blur animation)

---

## 7. File-Level Changes

### Frontend

| File | Changes |
|---|---|
| `app/globals.css` | Rewrite `@theme inline` with new palette. Add glass utility classes (`.glass-card`, `.glass-nav`, `.glass-header`). Update `.magical-glow` to gold. Update `.animate-burst` colors. Add `.sparkle-dot` for unread indicators. |
| `app/layout.tsx` | Replace Geist with Nunito via `next/font/google`. Update font CSS variable. |
| `app/[locale]/layout.tsx` | Replace `#FFF0F5` body bg with `background: linear-gradient(135deg, #1a0533, #2d1b69, #0f2b4a)`. Remove scalloped wave reference. |
| `components/Header.tsx` | Glass panel bg. Georgia title with gradient text. Update avatar gradient to gold+purple. Remove scalloped SVG wave. |
| `components/BottomNav.tsx` | Glass floating pill. Remove neumorphic shadows. Gold active tab color. |
| `components/PrincessCard.tsx` | Glass card bg. Gold play button gradient. Add sparkle dot for unread state. |
| `components/AudioPlayer.tsx` | Glass bottom sheet. Gold progress bar. Gold play button. Hold-to-exit purple→gold fill. |
| `components/LanguageSelector.tsx` | Glass toggle bg. Gold slider ball. Keep spring animation + haptic. |
| `components/ParticlesBackground.tsx` | Update colors to gold/white/sky-blue/rose. Reduce count to 40. Add twinkle mode. |
| `app/[locale]/pick-child/page.tsx` | Glass card overlay. Gold+purple gradient initials. |
| `app/[locale]/(tabs)/inbox/page.tsx` | Glass card rows. Sparkle dot for unread. |
| `app/[locale]/(tabs)/story/page.tsx` | Glass PrincessCard grid. |
| `lib/princesses.ts` | No changes (overlay colors unchanged). |
| `public/manifest.json` | Update `theme_color` to `#2d1b69`. Update `background_color` to `#1a0533`. |

### Admin

| File | Changes |
|---|---|
| `app/globals.css` | Full rewrite of `:root` tokens to warm cream palette. Add Nunito + Georgia font variables. Remove dark slate tokens. |
| `app/layout.tsx` | Load Nunito + Georgia via `next/font/google`. Update body bg to `#FFF8F0`. |
| `components/Sidebar.tsx` | Dark purple gradient bg. Gold active indicator. Update hover/active states. |
| `components/UsersTable.tsx` | White card container. Purple gradient header. Warm text colors. Updated borders. |
| `components/ChildrenTable.tsx` | Same pattern as UsersTable. |
| `components/CharactersPicker.tsx` | Per-princess pastel chip colors. Purple selected state. |
| `app/users/page.tsx` | Update form inputs to warm cream bg + purple focus ring. Gold primary button. |
| `app/children/page.tsx` | Same form updates. |

---

## 8. Dependencies

### New
- `Nunito` font loaded via `next/font/google` (both apps) — no npm package needed

### Removed
- Geist font (frontend root layout)
- Inter font reference (admin globals.css)

### Unchanged
- Tailwind CSS v4
- shadcn/ui config
- tsparticles (config update only)
- `class-variance-authority`, `clsx`, `tailwind-merge`
- `lucide-react` (admin icons)

---

## 9. Out of Scope

- No new pages or features — purely visual redesign
- No backend changes
- No new npm dependencies (font loaded via next/font)
- No dark mode toggle for admin (light only)
- No responsive redesign for admin (desktop-only target remains)
- No changes to i18n, API layer, or state management
- Princess overlay colors remain unchanged
- PWA manifest icons not redesigned (only theme_color updated)
