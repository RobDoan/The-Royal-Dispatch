# Royal Dispatch — Flutter Mobile App

The child-facing mobile app for The Royal Dispatch. Children pick their name, choose a princess (or Paw Patrol pup), and listen to personalized bedtime letters with background audio and lock-screen controls.

## Prerequisites

- Flutter 3.x / Dart 3.x
- Running backend at `http://localhost:8000`
- A family token (parent gets this from Telegram)

## Setup

```bash
cd mobile
cp .env.example .env   # configure API_BASE_URL
flutter pub get
flutter run             # launch on connected device/emulator
```

For Android emulator, the app uses `http://10.0.2.2:8000/api` automatically.

## Commands

```bash
flutter run              # launch app
flutter test             # all tests
flutter test test/models/ # single test directory
flutter analyze          # static analysis
flutter build apk        # Android release
flutter build ios        # iOS release
```

## Architecture

| Layer | Technology |
|---|---|
| State | Riverpod (AsyncNotifier, StateNotifier) |
| Navigation | go_router with ShellRoute |
| HTTP | dio with token interceptor |
| Audio | just_audio + audio_service (background playback) |
| Storage | flutter_secure_storage (token), shared_preferences (child, locale) |
| i18n | flutter_localizations + ARB files (en/vi) |
| Design | Glass morphism (BackdropFilter), custom particle system |

## Screens

```
Pairing → Child Picker → Tabbed Home (Inbox | Story) → Story Playback (fullscreen)
```

- **Pairing** — one-time token entry or `royaldispatch://pair?token=...` deep link
- **Child Picker** — "Who's reading tonight?" avatar grid
- **Inbox** — princess list filtered to child's favorites
- **Story Request** — 2-column grid of all princesses
- **Story Playback** — fullscreen player with audio controls and hold-to-exit

## API

Consumes the same backend API as the webapp — no backend changes required. Key endpoints:

- `GET /api/user/me?token=...` — family profile + children
- `GET /api/story/generate?...` — SSE story stream
- `POST /api/story` + `GET /api/story/today/{princess}` — request + poll flow
