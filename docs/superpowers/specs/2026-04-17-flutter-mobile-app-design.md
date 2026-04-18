# Flutter Mobile App — Design Spec

**Date:** 2026-04-17
**Status:** Draft
**Scope:** Children-only mobile app (iOS + Android) for The Royal Dispatch

## Overview

A Flutter mobile app that provides the child-facing story experience from The Royal Dispatch. Children pick their name, choose a princess, and listen to personalized bedtime letters with background audio support. Parents continue using Telegram + web for onboarding and administration.

The app adapts the webapp's dark royal glass-morphism aesthetic for native mobile, using Flutter-native patterns (Riverpod, go_router, just_audio).

## Target Users

- **Children** (primary): pick a princess, listen to their personalized letter
- **Shared family device**: multiple children share one device, picking their name on each launch

## Non-Goals

- Parent onboarding or child management (handled via Telegram + web)
- Admin functionality
- Offline story caching
- Story generation logic (backend handles this)

---

## App Structure & Navigation

### Screens

```
Pairing Screen → Child Picker → Tabbed Home (Inbox | Story) → Story Playback (fullscreen)
```

**Pairing Screen** (one-time)
- Primary flow: single text field for entering a family token (parent copies token from Telegram/web and types or pastes it on the child's device)
- Secondary flow: deep link handler for `royaldispatch://pair?token=...` — parent taps a link on the child's device, app opens and auto-pairs. Requires registering the custom URL scheme in iOS `Info.plist` and Android `AndroidManifest.xml`.
- Token stored in `flutter_secure_storage`
- Shown only when no valid token is persisted
- Minimal UI: app logo, gold-bordered input, "Connect" button
- On successful pairing (valid token verified via `GET /api/user/me`), navigates to child picker

**Child Picker** (every launch)
- Grid of child avatars: gold gradient circles with the child's initial letter
- Child name below each avatar
- Tapping a child stores their ID in `shared_preferences` and navigates to tabbed home
- Heading: "Who's reading tonight?" (localized)

**Tabbed Home** (go_router ShellRoute)
- Bottom navigation with two tabs: Inbox and Story
- Header bar with app title, language toggle, child avatar button (navigates back to child picker)

**Inbox Tab**
- Vertical list of princess cards for the selected child's favorite princesses
- Each card: character image, emoji badge, name, origin
- Tapping a card starts SSE-based story generation and navigates to fullscreen playback

**Story Tab**
- 2-column grid of princess cards (poster variant)
- Tapping a card sends POST `/api/story` then navigates to fullscreen playback with polling

**Story Playback** (fullscreen, replaces tab shell)
- Princess image fixed at top with gradient overlay
- Scrollable story transcript below
- Royal challenge section (gold border) when available
- Sticky audio controls at bottom
- Hold-to-exit button (1-second hold with fill animation)

### Navigation (go_router)

```
/pair                         → PairingScreen
/pick-child                   → ChildPickerScreen
/home                         → ShellRoute (tabs)
  /home/inbox                 → InboxScreen
  /home/story                 → StoryRequestScreen
/play/:princess               → StoryPlaybackScreen (SSE flow)
/story/:princess              → StoryPlaybackScreen (polling flow)
```

Redirect logic:
- No token → `/pair`
- Has token, no selected child → `/pick-child`
- Has token + selected child → `/home/inbox`

---

## Design System

### Color Palette

| Token | Value | Usage |
|---|---|---|
| Background start | #1a0533 | Top of gradient |
| Background mid | #2d1b69 | Middle |
| Background end | #0f2b4a | Bottom |
| Gold | #FFD700 | Primary accent, buttons, highlights |
| Rose | #FF85A1 | Secondary accent |
| Purple | #9370DB | Tertiary accent |
| Sky | #7EC8E3 | Particle color |
| Mint | #6EE7B7 | Particle color |

Princess overlay colors (25% opacity):
- Elsa: rgba(147, 197, 253, 0.25)
- Belle: rgba(252, 211, 77, 0.25)
- Cinderella: rgba(249, 168, 212, 0.25)
- Ariel: rgba(110, 231, 183, 0.25)
- Rapunzel: rgba(253, 224, 71, 0.25)
- Moana: rgba(56, 189, 248, 0.25)
- Raya: rgba(167, 139, 250, 0.25)
- Mirabel: rgba(52, 211, 153, 0.25)
- Chase: rgba(59, 130, 246, 0.25)
- Marshall: rgba(239, 68, 68, 0.25)
- Skye: rgba(244, 114, 182, 0.25)
- Rubble: rgba(251, 191, 36, 0.25)

### Glass Morphism

Implemented via `ClipRRect` + `BackdropFilter`:

| Variant | Background | Blur | Border |
|---|---|---|---|
| glass-card | white 8% | 10px | 1px white 12% |
| glass-card-hover | white 12% | 10px | 1px white 12% |
| glass-nav | white 10% | 16px | 1px white 12% |
| glass-header | white 6% | 12px | 1px white 12% |

Reusable `GlassCard` widget with `variant` parameter.

### Typography

- Body: Nunito (via `google_fonts` package) — weights 300, 400, 600, 700, 800
- Heading accent: Georgia serif
- Body size: 16sp, headings up to 32sp
- Gold gradient text: `ShaderMask` with linear gradient from gold to rose

### Bottom Navigation

- Custom widget (not `BottomNavigationBar`) to match webapp's glass pill design
- Inset from screen edges (24px horizontal)
- Height: 96px, corner radius: 28px
- Glass-nav backdrop blur
- 3D icon images for each tab
- Active tab: inset shadow, scale 0.95
- Inactive: opacity 0.5, hover scale 1.05
- `HapticFeedback.lightImpact()` on tap

### Animations

**Particles Background**
- `CustomPainter` with ~30 particles (gold, white, sky, rose)
- Single `AnimationController` (vsync) driving all particle positions
- Particles: size 2-5px, opacity 0.1-0.7, random drift movement
- Rendered behind all screens via `Stack` in root layout

**Story Waiting**
- Ken Burns zoom on princess image (25s loop, `AnimationController` + `Transform.scale/translate`)
- 28 floating sparkles with staggered `AnimationController`s
- Floating princess emoji with pulsing glow
- Quill writing indicator
- Pulsing progress dots (3 dots, staggered 0.2s)

**Interactions**
- Princess card press: `ScaleTransition` to 0.96
- Language toggle: animated sliding gold ball with spring curve
- Hold-to-exit: `AnimationController` filling gold bar over 1 second

---

## State Management (Riverpod)

### Auth Provider

```dart
// Reads/writes family token from flutter_secure_storage
final authProvider = AsyncNotifierProvider<AuthNotifier, String?>();
```

- `token` — nullable; null triggers redirect to pairing screen
- `pair(String token)` — stores token, fetches profile to validate
- `unpair()` — clears token and all persisted state

### Family Provider

```dart
// Depends on authProvider, fetches user profile
final familyProvider = AsyncNotifierProvider<FamilyNotifier, UserProfile?>();
final selectedChildIdProvider = StateProvider<String?>();
final activePrincessIdsProvider = Provider<List<String>>();
```

- Fetches `GET /api/user/me?token=...` when token becomes available
- `selectedChildIdProvider` persisted to `shared_preferences`
- `activePrincessIdsProvider` computed: child's favorites, or all personas if no favorites set

### Story Provider

```dart
final storyProvider = StateNotifierProvider<StoryNotifier, StoryState>();
```

States: `idle` → `loading` → `streaming(statusText)` → `ready(StoryData)` → `error(message)`

- `generateViaSSE(princess, language, storyType, childId)` — opens SSE stream, transitions through states
- `requestAndPoll(princess, language, storyType, childId)` — POST then poll every 3s, 75s timeout
- `reset()` — returns to idle

### Audio Provider

```dart
final audioProvider = StateNotifierProvider<AudioNotifier, AudioState>();
```

- Wraps `just_audio` AudioPlayer + `audio_service` AudioHandler
- Exposes: `playing`, `position`, `duration`, `buffering`
- Methods: `play(url)`, `pause()`, `resume()`, `seek(position)`, `skipForward(10s)`, `skipBackward(10s)`, `stop()`

---

## API & Networking

### HTTP Client

- `dio` with interceptor appending `?token=...` from auth provider
- Base URL from `.env` via `flutter_dotenv`
  - Android emulator: `http://10.0.2.2:8000/api`
  - iOS simulator: `http://localhost:8000/api`
  - Production: configured per environment
- Error handling: 401 → clear token, redirect to pairing; 404 on poll → continue; other errors → show message

### Endpoints

| Method | Path | Usage |
|---|---|---|
| GET | `/api/user/me?token=...` | Fetch family profile + children |
| GET | `/api/admin/personas` | Fetch available persona list |
| POST | `/api/story` | Request story generation |
| GET | `/api/story/today/{princess}?type=...&child_id=...` | Poll for completed story |
| GET | `/api/story/generate?princess=...&language=...&story_type=...&child_id=...` | SSE stream |

### SSE Client

- Custom implementation using `dio` with `responseType: ResponseType.stream`
- Parses `event:` and `data:` lines from byte stream
- Handles events: `status` (update loading text), `ready`/`cached` (story data), `error`
- Stream cancelled on widget dispose or navigation away

### Polling

- For Story tab flow: `Timer.periodic(3s)` calling `GET /api/story/today/{princess}`
- Timeout after 75 seconds → transition to error state
- Cancelled on dispose

---

## Audio & Background Playback

### Packages

- `just_audio` — core playback engine (supports streaming from URL)
- `audio_service` — background execution + lock-screen/notification controls

### Audio Handler

Subclass of `BaseAudioHandler`:
- `play()`, `pause()`, `seek()`, `skipToNext()` (mapped to skip 10s forward), `skipToPrevious()` (mapped to skip 10s backward)
- `MediaItem` metadata: princess name as title, "The Royal Dispatch" as album
- Notification shows play/pause + skip controls

### Playback Flow

1. Story reaches `ready` state → audio provider calls `play(audioUrl)`
2. `just_audio` streams audio from S3/MinIO URL
3. `audio_service` registers background task + shows notification
4. Screen lock or app background → playback continues
5. Lock-screen controls → forwarded through `audio_service` → `just_audio`
6. On `stop()` or navigation away → audio stops, notification dismissed

### UI Controls

- Floating play/pause button: gold gradient circle with shadow
- Progress bar: custom `SliderTheme` — gold gradient track, white circular thumb
- Time display: current / total in monospace (11sp)
- Rewind 10s / Skip 10s: icon buttons (↺ ↻)
- Hold-to-exit: `GestureDetector.onLongPressStart` triggers `AnimationController`; if held 1 second, fires exit callback; `onLongPressEnd` resets animation

---

## Internationalization

### Setup

- `flutter_localizations` + `intl` package
- Generated via `flutter gen-l10n`
- Two ARB files: `app_en.arb` and `app_vi.arb`

### Key Translations (matching webapp)

```
appTitle: "The Royal Dispatch"
appSubtitle: "Your letters have arrived"
appWriting: "{princess} is writing your letter..."
goBack: "Go Back"
royalChallenge: "Your Royal Challenge"
lifeLesson: "{princess} is crafting your life lesson..."
pickChildHeading: "Who's reading tonight?"
pickChildSubheading: "Tap your name to begin"
sorryElsa / sorryBelle / etc: Princess-specific sorry messages
originElsa / originBelle / etc: Princess origin descriptions
```

### Language Toggle

- Same flag toggle as webapp: 🇬🇧 (EN) ↔ 🇻🇳 (VI)
- Sliding gold ball with spring animation
- Persisted to `shared_preferences`
- Applied via `MaterialApp.locale` override

---

## Project Structure

```
mobile/
├── lib/
│   ├── main.dart                      # App entry, audio_service init
│   ├── app.dart                       # MaterialApp.router, theme, locale
│   ├── router.dart                    # go_router config + redirects
│   ├── theme.dart                     # ThemeData, colors, text styles, glass variants
│   ├── providers/
│   │   ├── auth_provider.dart         # Token management
│   │   ├── family_provider.dart       # User profile + child selection
│   │   ├── story_provider.dart        # Story generation state machine
│   │   └── audio_provider.dart        # Playback state + controls
│   ├── models/
│   │   ├── user_profile.dart          # UserProfile, ChildInfo
│   │   ├── story_data.dart            # StoryData (text, challenge, audioUrl)
│   │   └── princess.dart              # Princess metadata, colors, emoji
│   ├── services/
│   │   ├── api_client.dart            # dio setup + interceptors
│   │   ├── sse_client.dart            # SSE stream parsing
│   │   └── audio_handler.dart         # BaseAudioHandler subclass
│   ├── screens/
│   │   ├── pairing_screen.dart        # Token entry / deep link
│   │   ├── child_picker_screen.dart   # Who's reading tonight?
│   │   ├── inbox_screen.dart          # Princess list (favorites)
│   │   ├── story_request_screen.dart  # Princess grid (all)
│   │   └── story_playback_screen.dart # Fullscreen player
│   ├── widgets/
│   │   ├── glass_card.dart            # Reusable glass morphism container
│   │   ├── princess_card.dart         # Character card (poster/cinematic)
│   │   ├── bottom_nav.dart            # Custom glass pill navigation
│   │   ├── header.dart                # App bar with title + controls
│   │   ├── language_toggle.dart       # EN/VI flag toggle
│   │   ├── particles_background.dart  # CustomPainter particle system
│   │   ├── story_waiting.dart         # Loading screen with animations
│   │   ├── audio_controls.dart        # Play/pause, progress, skip
│   │   └── hold_to_exit_button.dart   # Long-press exit with fill animation
│   └── l10n/
│       ├── app_en.arb                 # English translations
│       └── app_vi.arb                 # Vietnamese translations
├── assets/
│   ├── characters/                    # Princess PNG images
│   ├── icons/                         # 3D tab icons (inbox, story)
│   └── videos/                        # Waiting animation video
├── pubspec.yaml
├── .env
└── test/
    ├── providers/                     # Provider unit tests
    ├── services/                      # API + SSE tests
    ├── widgets/                       # Widget tests
    └── screens/                       # Screen integration tests
```

### Key Dependencies

```yaml
dependencies:
  flutter_riverpod: ^2.x
  go_router: ^14.x
  dio: ^5.x
  just_audio: ^0.9.x
  audio_service: ^0.18.x
  google_fonts: ^6.x
  flutter_secure_storage: ^9.x
  shared_preferences: ^2.x
  flutter_dotenv: ^5.x
  flutter_localizations:
    sdk: flutter
  intl: ^0.19.x

dev_dependencies:
  flutter_test:
    sdk: flutter
  mockito: ^5.x
  build_runner: ^2.x
```

---

## Backend Changes Required

**None.** The Flutter app consumes the same API endpoints as the webapp. No backend modifications needed.

The only consideration is CORS: the backend may need to allow requests from the mobile app's origin. Since mobile apps don't send an `Origin` header the same way browsers do, this is typically not an issue. If the backend has strict CORS, it won't affect native HTTP clients (dio).
