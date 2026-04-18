# Flutter Mobile App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Flutter mobile app (iOS + Android) that provides the children-only story experience for The Royal Dispatch — pick a child, choose a princess, listen to personalized bedtime letters with background audio.

**Architecture:** Riverpod for state management, go_router for navigation with shell routes for tabs, dio for HTTP + SSE streaming, just_audio + audio_service for background playback. Glass-morphism dark royal theme matching the webapp.

**Tech Stack:** Flutter 3.x, Dart, flutter_riverpod, go_router, dio, just_audio, audio_service, google_fonts, flutter_secure_storage, shared_preferences, flutter_dotenv

**Spec:** `docs/superpowers/specs/2026-04-17-flutter-mobile-app-design.md`

---

## File Map

```
mobile/
├── lib/
│   ├── main.dart                      # App entry, audio_service init, ProviderScope
│   ├── app.dart                       # MaterialApp.router, theme, locale
│   ├── router.dart                    # go_router config, redirects, shell route
│   ├── theme.dart                     # RoyalTheme: colors, text styles, glass variants
│   ├── models/
│   │   ├── user_profile.dart          # UserProfile, ChildInfo (fromJson/toJson)
│   │   ├── story_data.dart            # StoryData, StoryState sealed class
│   │   └── princess.dart              # PrincessMeta, PRINCESS_META map, overlay colors
│   ├── providers/
│   │   ├── auth_provider.dart         # AuthNotifier: token CRUD via secure_storage
│   │   ├── family_provider.dart       # FamilyNotifier: profile fetch, child selection
│   │   ├── story_provider.dart        # StoryNotifier: SSE + polling state machine
│   │   ├── audio_provider.dart        # AudioNotifier: playback state + controls
│   │   └── locale_provider.dart       # StateProvider<Locale> persisted to prefs
│   ├── services/
│   │   ├── api_client.dart            # Dio singleton, token interceptor, base URL
│   │   ├── sse_client.dart            # SSE stream parser (dio streaming)
│   │   └── audio_handler.dart         # BaseAudioHandler subclass for lock-screen
│   ├── screens/
│   │   ├── pairing_screen.dart        # Token entry UI
│   │   ├── child_picker_screen.dart   # Avatar grid
│   │   ├── inbox_screen.dart          # Princess list (favorites)
│   │   ├── story_request_screen.dart  # Princess grid (all)
│   │   └── story_playback_screen.dart # Fullscreen audio player
│   ├── widgets/
│   │   ├── glass_card.dart            # BackdropFilter container with variants
│   │   ├── princess_card.dart         # Character card with image, emoji, overlay
│   │   ├── bottom_nav.dart            # Glass pill tab bar
│   │   ├── header.dart                # App bar with title, lang toggle, avatar
│   │   ├── language_toggle.dart       # EN/VI flag toggle with spring animation
│   │   ├── particles_background.dart  # CustomPainter particle system
│   │   ├── story_waiting.dart         # Ken Burns + sparkles loading screen
│   │   ├── audio_controls.dart        # Progress bar, time, skip buttons
│   │   └── hold_to_exit_button.dart   # Long-press exit with fill animation
│   └── l10n/
│       ├── app_en.arb                 # English translations
│       └── app_vi.arb                 # Vietnamese translations
├── assets/
│   ├── characters/                    # 12 princess PNGs (copied from frontend)
│   └── icons/                         # inbox-3d.png, story-3d.png
├── .env                               # API_BASE_URL
├── pubspec.yaml
└── test/
    ├── models/
    │   ├── user_profile_test.dart
    │   ├── story_data_test.dart
    │   └── princess_test.dart
    ├── services/
    │   ├── api_client_test.dart
    │   └── sse_client_test.dart
    ├── providers/
    │   ├── auth_provider_test.dart
    │   ├── family_provider_test.dart
    │   └── story_provider_test.dart
    └── widgets/
        ├── glass_card_test.dart
        ├── princess_card_test.dart
        └── hold_to_exit_button_test.dart
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `mobile/` (Flutter project)
- Create: `mobile/pubspec.yaml`
- Create: `mobile/.env`
- Create: `mobile/assets/characters/*.png` (copy from frontend)
- Create: `mobile/assets/icons/*.png` (copy from frontend)

- [ ] **Step 1: Create Flutter project**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch
flutter create --org com.royaldispatch --project-name royal_dispatch mobile
```

- [ ] **Step 2: Replace pubspec.yaml with project dependencies**

Replace `mobile/pubspec.yaml` with:

```yaml
name: royal_dispatch
description: The Royal Dispatch — personalized princess letters for children
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: ^3.5.0

dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  flutter_riverpod: ^2.6.1
  go_router: ^14.8.1
  dio: ^5.7.0
  just_audio: ^0.9.42
  audio_service: ^0.18.15
  google_fonts: ^6.2.1
  flutter_secure_storage: ^9.2.4
  shared_preferences: ^2.3.4
  flutter_dotenv: ^5.2.1
  intl: ^0.19.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0
  mockito: ^5.4.5
  build_runner: ^2.4.14
  mocktail: ^1.0.4

flutter:
  generate: true
  uses-material-design: true
  assets:
    - assets/characters/
    - assets/icons/
    - .env
```

- [ ] **Step 3: Create l10n.yaml for code generation**

Create `mobile/l10n.yaml`:

```yaml
arb-dir: lib/l10n
template-arb-file: app_en.arb
output-localization-file: app_localizations.dart
```

- [ ] **Step 4: Copy assets from frontend**

```bash
mkdir -p mobile/assets/characters mobile/assets/icons
cp frontend/public/characters/*.png mobile/assets/characters/
cp frontend/public/inbox-3d.png mobile/assets/icons/
cp frontend/public/story-3d.png mobile/assets/icons/
```

- [ ] **Step 5: Create .env file**

Create `mobile/.env`:

```
API_BASE_URL=http://localhost:8000/api
```

- [ ] **Step 6: Install dependencies and verify build**

```bash
cd mobile
flutter pub get
flutter analyze
```

- [ ] **Step 7: Commit**

```bash
git add mobile/
git commit -m "feat(mobile): scaffold Flutter project with dependencies and assets"
```

---

### Task 2: Models

**Files:**
- Create: `mobile/lib/models/princess.dart`
- Create: `mobile/lib/models/user_profile.dart`
- Create: `mobile/lib/models/story_data.dart`
- Test: `mobile/test/models/princess_test.dart`
- Test: `mobile/test/models/user_profile_test.dart`
- Test: `mobile/test/models/story_data_test.dart`

- [ ] **Step 1: Write princess model test**

Create `mobile/test/models/princess_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/models/princess.dart';

void main() {
  test('PRINCESS_META contains all 12 characters', () {
    expect(princessMeta.length, 12);
    expect(princessMeta.containsKey('elsa'), true);
    expect(princessMeta.containsKey('rubble'), true);
  });

  test('PrincessMeta has correct data for elsa', () {
    final elsa = princessMeta['elsa']!;
    expect(elsa.name, 'Queen Elsa');
    expect(elsa.emoji, '❄️');
    expect(elsa.origin, 'Kingdom of Arendelle');
    expect(elsa.overlayColor, const Color.fromRGBO(147, 197, 253, 0.25));
  });

  test('princessImagePath returns correct asset path', () {
    expect(princessImagePath('elsa'), 'assets/characters/elsa.png');
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mobile && flutter test test/models/princess_test.dart
```

Expected: FAIL — `princess.dart` does not exist.

- [ ] **Step 3: Implement princess model**

Create `mobile/lib/models/princess.dart`:

```dart
import 'package:flutter/material.dart';

class PrincessMeta {
  final String name;
  final String emoji;
  final String origin;
  final Color overlayColor;

  const PrincessMeta({
    required this.name,
    required this.emoji,
    required this.origin,
    required this.overlayColor,
  });
}

String princessImagePath(String id) => 'assets/characters/$id.png';

const Map<String, PrincessMeta> princessMeta = {
  'elsa': PrincessMeta(
    name: 'Queen Elsa',
    emoji: '❄️',
    origin: 'Kingdom of Arendelle',
    overlayColor: Color.fromRGBO(147, 197, 253, 0.25),
  ),
  'belle': PrincessMeta(
    name: 'Belle',
    emoji: '📚',
    origin: 'The Enchanted Castle',
    overlayColor: Color.fromRGBO(252, 211, 77, 0.25),
  ),
  'cinderella': PrincessMeta(
    name: 'Cinderella',
    emoji: '👠',
    origin: 'The Royal Palace',
    overlayColor: Color.fromRGBO(249, 168, 212, 0.25),
  ),
  'ariel': PrincessMeta(
    name: 'Ariel',
    emoji: '🐠',
    origin: 'Under the Sea',
    overlayColor: Color.fromRGBO(110, 231, 183, 0.25),
  ),
  'rapunzel': PrincessMeta(
    name: 'Princess Rapunzel',
    emoji: '🌻',
    origin: 'Kingdom of Corona',
    overlayColor: Color.fromRGBO(253, 224, 71, 0.25),
  ),
  'moana': PrincessMeta(
    name: 'Moana',
    emoji: '🌊',
    origin: 'Motunui Island',
    overlayColor: Color.fromRGBO(56, 189, 248, 0.25),
  ),
  'raya': PrincessMeta(
    name: 'Raya',
    emoji: '🐉',
    origin: 'Kumandra',
    overlayColor: Color.fromRGBO(167, 139, 250, 0.25),
  ),
  'mirabel': PrincessMeta(
    name: 'Mirabel',
    emoji: '🦋',
    origin: 'The Encanto',
    overlayColor: Color.fromRGBO(52, 211, 153, 0.25),
  ),
  'chase': PrincessMeta(
    name: 'Chase',
    emoji: '🐕‍🦺',
    origin: 'Adventure Bay (Police Pup)',
    overlayColor: Color.fromRGBO(59, 130, 246, 0.25),
  ),
  'marshall': PrincessMeta(
    name: 'Marshall',
    emoji: '🔥',
    origin: 'Adventure Bay (Fire Pup)',
    overlayColor: Color.fromRGBO(239, 68, 68, 0.25),
  ),
  'skye': PrincessMeta(
    name: 'Skye',
    emoji: '✈️',
    origin: 'Adventure Bay (Aviation Pup)',
    overlayColor: Color.fromRGBO(244, 114, 182, 0.25),
  ),
  'rubble': PrincessMeta(
    name: 'Rubble',
    emoji: '🏗️',
    origin: 'Adventure Bay (Construction Pup)',
    overlayColor: Color.fromRGBO(251, 191, 36, 0.25),
  ),
};
```

- [ ] **Step 4: Run princess test to verify it passes**

```bash
cd mobile && flutter test test/models/princess_test.dart
```

Expected: PASS

- [ ] **Step 5: Write user_profile model test**

Create `mobile/test/models/user_profile_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/models/user_profile.dart';

void main() {
  test('UserProfile.fromJson parses correctly', () {
    final json = {
      'user_id': 'abc-123',
      'name': 'Dad',
      'children': [
        {
          'id': 'child-1',
          'name': 'Emma',
          'preferences': {
            'favorite_princesses': ['elsa', 'belle'],
          },
        },
      ],
    };

    final profile = UserProfile.fromJson(json);
    expect(profile.userId, 'abc-123');
    expect(profile.name, 'Dad');
    expect(profile.children.length, 1);
    expect(profile.children[0].name, 'Emma');
    expect(profile.children[0].favoritePrincesses, ['elsa', 'belle']);
  });

  test('ChildInfo with no favorites returns empty list', () {
    final json = {
      'id': 'child-2',
      'name': 'Lily',
      'preferences': {},
    };

    final child = ChildInfo.fromJson(json);
    expect(child.favoritePrincesses, isEmpty);
  });

  test('UserProfile.fromJson handles null user_id and name', () {
    final json = {
      'user_id': null,
      'name': null,
      'children': [],
    };

    final profile = UserProfile.fromJson(json);
    expect(profile.userId, isNull);
    expect(profile.name, isNull);
    expect(profile.children, isEmpty);
  });
}
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd mobile && flutter test test/models/user_profile_test.dart
```

Expected: FAIL

- [ ] **Step 7: Implement user_profile model**

Create `mobile/lib/models/user_profile.dart`:

```dart
class ChildInfo {
  final String id;
  final String name;
  final List<String> favoritePrincesses;

  const ChildInfo({
    required this.id,
    required this.name,
    required this.favoritePrincesses,
  });

  factory ChildInfo.fromJson(Map<String, dynamic> json) {
    final prefs = json['preferences'] as Map<String, dynamic>? ?? {};
    final favorites = (prefs['favorite_princesses'] as List<dynamic>?)
            ?.map((e) => e as String)
            .toList() ??
        [];
    return ChildInfo(
      id: json['id'] as String,
      name: json['name'] as String,
      favoritePrincesses: favorites,
    );
  }
}

class UserProfile {
  final String? userId;
  final String? name;
  final List<ChildInfo> children;

  const UserProfile({
    required this.userId,
    required this.name,
    required this.children,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    final childrenJson = json['children'] as List<dynamic>? ?? [];
    return UserProfile(
      userId: json['user_id'] as String?,
      name: json['name'] as String?,
      children:
          childrenJson.map((c) => ChildInfo.fromJson(c as Map<String, dynamic>)).toList(),
    );
  }
}
```

- [ ] **Step 8: Run user_profile test to verify it passes**

```bash
cd mobile && flutter test test/models/user_profile_test.dart
```

Expected: PASS

- [ ] **Step 9: Write story_data model test**

Create `mobile/test/models/story_data_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/models/story_data.dart';

void main() {
  test('StoryState.idle is default', () {
    const state = StoryState.idle();
    expect(state, isA<StoryStateIdle>());
  });

  test('StoryState.ready holds StoryData', () {
    const data = StoryData(
      storyText: 'Once upon a time...',
      royalChallenge: 'Be brave today',
      audioUrl: 'https://example.com/audio.mp3',
    );
    final state = StoryState.ready(data);
    expect(state, isA<StoryStateReady>());
    expect((state as StoryStateReady).data.storyText, 'Once upon a time...');
  });

  test('StoryData.fromJson parses backend response', () {
    final json = {
      'story_text': 'Hello dear child...',
      'royal_challenge': 'Try something new',
      'audio_url': 'https://s3.example.com/audio.mp3',
    };

    final data = StoryData.fromJson(json);
    expect(data.storyText, 'Hello dear child...');
    expect(data.royalChallenge, 'Try something new');
    expect(data.audioUrl, 'https://s3.example.com/audio.mp3');
  });

  test('StoryData.fromJson handles null royal_challenge', () {
    final json = {
      'story_text': 'A story',
      'royal_challenge': null,
      'audio_url': 'https://s3.example.com/a.mp3',
    };

    final data = StoryData.fromJson(json);
    expect(data.royalChallenge, isNull);
  });
}
```

- [ ] **Step 10: Run test to verify it fails**

```bash
cd mobile && flutter test test/models/story_data_test.dart
```

Expected: FAIL

- [ ] **Step 11: Implement story_data model**

Create `mobile/lib/models/story_data.dart`:

```dart
class StoryData {
  final String storyText;
  final String? royalChallenge;
  final String audioUrl;

  const StoryData({
    required this.storyText,
    required this.royalChallenge,
    required this.audioUrl,
  });

  factory StoryData.fromJson(Map<String, dynamic> json) {
    return StoryData(
      storyText: json['story_text'] as String,
      royalChallenge: json['royal_challenge'] as String?,
      audioUrl: json['audio_url'] as String,
    );
  }
}

sealed class StoryState {
  const StoryState();
  const factory StoryState.idle() = StoryStateIdle;
  const factory StoryState.loading() = StoryStateLoading;
  const factory StoryState.streaming(String statusText) = StoryStateStreaming;
  factory StoryState.ready(StoryData data) = StoryStateReady;
  const factory StoryState.error(String message) = StoryStateError;
}

class StoryStateIdle extends StoryState {
  const StoryStateIdle();
}

class StoryStateLoading extends StoryState {
  const StoryStateLoading();
}

class StoryStateStreaming extends StoryState {
  final String statusText;
  const StoryStateStreaming(this.statusText);
}

class StoryStateReady extends StoryState {
  final StoryData data;
  StoryStateReady(this.data);
}

class StoryStateError extends StoryState {
  final String message;
  const StoryStateError(this.message);
}
```

- [ ] **Step 12: Run story_data test to verify it passes**

```bash
cd mobile && flutter test test/models/story_data_test.dart
```

Expected: PASS

- [ ] **Step 13: Commit**

```bash
cd mobile && git add lib/models/ test/models/
git commit -m "feat(mobile): add data models — princess, user_profile, story_data"
```

---

### Task 3: Theme & Design System

**Files:**
- Create: `mobile/lib/theme.dart`
- Create: `mobile/lib/widgets/glass_card.dart`
- Test: `mobile/test/widgets/glass_card_test.dart`

- [ ] **Step 1: Create theme file**

Create `mobile/lib/theme.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class RoyalColors {
  static const backgroundStart = Color(0xFF1A0533);
  static const backgroundMid = Color(0xFF2D1B69);
  static const backgroundEnd = Color(0xFF0F2B4A);
  static const gold = Color(0xFFFFD700);
  static const rose = Color(0xFFFF85A1);
  static const purple = Color(0xFF9370DB);
  static const sky = Color(0xFF7EC8E3);
  static const mint = Color(0xFF6EE7B7);

  static const backgroundGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [backgroundStart, backgroundMid, backgroundEnd],
  );

  static const goldGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [gold, Color(0xFFFFA500)],
  );

  static const goldTextGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [gold, rose],
  );
}

enum GlassVariant { card, cardHover, nav, header }

class GlassStyle {
  final Color background;
  final double blur;
  final Color borderColor;

  const GlassStyle({
    required this.background,
    required this.blur,
    required this.borderColor,
  });

  static const card = GlassStyle(
    background: Color.fromRGBO(255, 255, 255, 0.08),
    blur: 10,
    borderColor: Color.fromRGBO(255, 255, 255, 0.12),
  );

  static const cardHover = GlassStyle(
    background: Color.fromRGBO(255, 255, 255, 0.12),
    blur: 10,
    borderColor: Color.fromRGBO(255, 255, 255, 0.12),
  );

  static const nav = GlassStyle(
    background: Color.fromRGBO(255, 255, 255, 0.10),
    blur: 16,
    borderColor: Color.fromRGBO(255, 255, 255, 0.12),
  );

  static const header = GlassStyle(
    background: Color.fromRGBO(255, 255, 255, 0.06),
    blur: 12,
    borderColor: Color.fromRGBO(255, 255, 255, 0.12),
  );

  static GlassStyle fromVariant(GlassVariant variant) {
    return switch (variant) {
      GlassVariant.card => card,
      GlassVariant.cardHover => cardHover,
      GlassVariant.nav => nav,
      GlassVariant.header => header,
    };
  }
}

ThemeData buildRoyalTheme() {
  final base = ThemeData.dark();
  return base.copyWith(
    scaffoldBackgroundColor: Colors.transparent,
    textTheme: GoogleFonts.nunitoTextTheme(base.textTheme).apply(
      bodyColor: Colors.white,
      displayColor: Colors.white,
    ),
    colorScheme: base.colorScheme.copyWith(
      primary: RoyalColors.gold,
      secondary: RoyalColors.rose,
      surface: RoyalColors.backgroundStart,
    ),
  );
}
```

- [ ] **Step 2: Write glass_card widget test**

Create `mobile/test/widgets/glass_card_test.dart`:

```dart
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/widgets/glass_card.dart';

void main() {
  testWidgets('GlassCard renders child content', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Stack(
            children: [
              Container(color: Colors.black),
              const GlassCard(
                child: Text('Hello'),
              ),
            ],
          ),
        ),
      ),
    );

    expect(find.text('Hello'), findsOneWidget);
    expect(find.byType(BackdropFilter), findsOneWidget);
  });

  testWidgets('GlassCard applies border radius', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Stack(
            children: [
              Container(color: Colors.black),
              const GlassCard(
                borderRadius: 20,
                child: Text('Rounded'),
              ),
            ],
          ),
        ),
      ),
    );

    final clipRRect = tester.widget<ClipRRect>(find.byType(ClipRRect));
    expect(
      clipRRect.borderRadius,
      BorderRadius.circular(20),
    );
  });
}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd mobile && flutter test test/widgets/glass_card_test.dart
```

Expected: FAIL

- [ ] **Step 4: Implement glass_card widget**

Create `mobile/lib/widgets/glass_card.dart`:

```dart
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:royal_dispatch/theme.dart';

class GlassCard extends StatelessWidget {
  final Widget child;
  final GlassVariant variant;
  final double borderRadius;
  final EdgeInsetsGeometry? padding;

  const GlassCard({
    super.key,
    required this.child,
    this.variant = GlassVariant.card,
    this.borderRadius = 16,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    final style = GlassStyle.fromVariant(variant);
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: style.blur, sigmaY: style.blur),
        child: Container(
          decoration: BoxDecoration(
            color: style.background,
            borderRadius: BorderRadius.circular(borderRadius),
            border: Border.all(color: style.borderColor, width: 1),
          ),
          padding: padding,
          child: child,
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd mobile && flutter test test/widgets/glass_card_test.dart
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd mobile && git add lib/theme.dart lib/widgets/glass_card.dart test/widgets/glass_card_test.dart
git commit -m "feat(mobile): add royal theme and glass card widget"
```

---

### Task 4: Internationalization

**Files:**
- Create: `mobile/lib/l10n/app_en.arb`
- Create: `mobile/lib/l10n/app_vi.arb`

- [ ] **Step 1: Create English ARB file**

Create `mobile/lib/l10n/app_en.arb`:

```json
{
  "@@locale": "en",
  "appTitle": "The Royal Dispatch",
  "appSubtitle": "Your letters have arrived",
  "appWriting": "{princess} is writing your letter...",
  "@appWriting": {
    "placeholders": {
      "princess": { "type": "String" }
    }
  },
  "goBack": "Go Back",
  "royalChallenge": "Your Royal Challenge",
  "lifeLesson": "{princess} is crafting your life lesson...",
  "@lifeLesson": {
    "placeholders": {
      "princess": { "type": "String" }
    }
  },
  "pickChildHeading": "Who's reading tonight?",
  "pickChildSubheading": "Tap your name to begin",
  "pairingTitle": "Connect Your Device",
  "pairingHint": "Enter your family code",
  "pairingConnect": "Connect",
  "pairingError": "Invalid code. Please try again.",
  "inboxTitle": "Inbox",
  "storyTitle": "Story",
  "storyError": "{princess}'s letter is on its way — try again in a moment",
  "@storyError": {
    "placeholders": {
      "princess": { "type": "String" }
    }
  },
  "holdToExit": "Hold to Exit",
  "originElsa": "Kingdom of Arendelle",
  "originBelle": "The Enchanted Castle",
  "originCinderella": "The Royal Palace",
  "originAriel": "Under the Sea",
  "originRapunzel": "Kingdom of Corona",
  "originMoana": "Motunui Island",
  "originRaya": "Kumandra",
  "originMirabel": "The Encanto",
  "originChase": "Adventure Bay (Police Pup)",
  "originMarshall": "Adventure Bay (Fire Pup)",
  "originSkye": "Adventure Bay (Aviation Pup)",
  "originRubble": "Adventure Bay (Construction Pup)"
}
```

- [ ] **Step 2: Create Vietnamese ARB file**

Create `mobile/lib/l10n/app_vi.arb`:

```json
{
  "@@locale": "vi",
  "appTitle": "Thư Từ Công Chúa",
  "appSubtitle": "Thư của em đã đến rồi",
  "appWriting": "{princess} đang viết thư cho em...",
  "@appWriting": {
    "placeholders": {
      "princess": { "type": "String" }
    }
  },
  "goBack": "Quay Lại",
  "royalChallenge": "Thử Thách Hoàng Gia",
  "lifeLesson": "{princess} đang viết bài học cho em...",
  "@lifeLesson": {
    "placeholders": {
      "princess": { "type": "String" }
    }
  },
  "pickChildHeading": "Ai đọc tối nay?",
  "pickChildSubheading": "Chạm vào tên của em",
  "pairingTitle": "Kết Nối Thiết Bị",
  "pairingHint": "Nhập mã gia đình",
  "pairingConnect": "Kết Nối",
  "pairingError": "Mã không hợp lệ. Vui lòng thử lại.",
  "inboxTitle": "Hộp Thư",
  "storyTitle": "Câu Chuyện",
  "storyError": "Thư của {princess} đang trên đường đến — thử lại sau một chút",
  "@storyError": {
    "placeholders": {
      "princess": { "type": "String" }
    }
  },
  "holdToExit": "Giữ để Thoát",
  "originElsa": "Vương quốc Arendelle",
  "originBelle": "Lâu đài phép thuật",
  "originCinderella": "Cung điện hoàng gia",
  "originAriel": "Dưới đáy biển",
  "originRapunzel": "Vương quốc Corona",
  "originMoana": "Đảo Motunui",
  "originRaya": "Kumandra",
  "originMirabel": "Khu vườn phép thuật",
  "originChase": "Vịnh Phiêu Lưu (Chó cảnh sát)",
  "originMarshall": "Vịnh Phiêu Lưu (Chó cứu hỏa)",
  "originSkye": "Vịnh Phiêu Lưu (Chó bay)",
  "originRubble": "Vịnh Phiêu Lưu (Chó xây dựng)"
}
```

- [ ] **Step 3: Generate localization files**

```bash
cd mobile && flutter gen-l10n
```

Expected: generates `lib/l10n/app_localizations.dart` and related files in `.dart_tool/`

- [ ] **Step 4: Verify generated code compiles**

```bash
cd mobile && flutter analyze lib/l10n/
```

Expected: No issues

- [ ] **Step 5: Commit**

```bash
cd mobile && git add lib/l10n/ l10n.yaml
git commit -m "feat(mobile): add i18n with English and Vietnamese translations"
```

---

### Task 5: API Client & SSE Client

**Files:**
- Create: `mobile/lib/services/api_client.dart`
- Create: `mobile/lib/services/sse_client.dart`
- Test: `mobile/test/services/sse_client_test.dart`

- [ ] **Step 1: Write SSE parser test**

Create `mobile/test/services/sse_client_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/services/sse_client.dart';

void main() {
  test('parseSseLines extracts event and data', () {
    final lines = [
      'event: status',
      'data: {"message": "generating"}',
      '',
    ];

    final events = parseSseLines(lines);
    expect(events.length, 1);
    expect(events[0].event, 'status');
    expect(events[0].data, '{"message": "generating"}');
  });

  test('parseSseLines handles multiple events', () {
    final lines = [
      'event: status',
      'data: {"message": "step 1"}',
      '',
      'event: ready',
      'data: {"story_text": "Once...", "audio_url": "http://x.mp3"}',
      '',
    ];

    final events = parseSseLines(lines);
    expect(events.length, 2);
    expect(events[0].event, 'status');
    expect(events[1].event, 'ready');
  });

  test('parseSseLines skips comment lines', () {
    final lines = [
      ': keep-alive',
      'event: status',
      'data: {"ok": true}',
      '',
    ];

    final events = parseSseLines(lines);
    expect(events.length, 1);
    expect(events[0].event, 'status');
  });

  test('parseSseLines handles data-only lines (no event field)', () {
    final lines = [
      'data: {"ping": true}',
      '',
    ];

    final events = parseSseLines(lines);
    expect(events.length, 1);
    expect(events[0].event, 'message');
    expect(events[0].data, '{"ping": true}');
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mobile && flutter test test/services/sse_client_test.dart
```

Expected: FAIL

- [ ] **Step 3: Implement SSE client**

Create `mobile/lib/services/sse_client.dart`:

```dart
import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';

class SseEvent {
  final String event;
  final String data;

  const SseEvent({required this.event, required this.data});
}

List<SseEvent> parseSseLines(List<String> lines) {
  final events = <SseEvent>[];
  String? currentEvent;
  String? currentData;

  for (final line in lines) {
    if (line.startsWith(':')) continue;

    if (line.isEmpty) {
      if (currentData != null) {
        events.add(SseEvent(
          event: currentEvent ?? 'message',
          data: currentData,
        ));
      }
      currentEvent = null;
      currentData = null;
      continue;
    }

    if (line.startsWith('event: ')) {
      currentEvent = line.substring(7);
    } else if (line.startsWith('data: ')) {
      currentData = line.substring(6);
    }
  }

  return events;
}

Stream<SseEvent> connectSse(Dio dio, String url) async* {
  final response = await dio.get<ResponseBody>(
    url,
    options: Options(responseType: ResponseType.stream),
  );

  final stream = response.data!.stream;
  final buffer = StringBuffer();

  await for (final chunk in stream) {
    buffer.write(utf8.decode(chunk));
    final text = buffer.toString();
    final parts = text.split('\n');

    // Keep the last incomplete line in the buffer
    buffer.clear();
    buffer.write(parts.last);

    final completedLines = parts.sublist(0, parts.length - 1);
    final events = parseSseLines(completedLines);
    for (final event in events) {
      yield event;
    }
  }

  // Process any remaining data
  if (buffer.isNotEmpty) {
    final remaining = buffer.toString().split('\n');
    final events = parseSseLines([...remaining, '']);
    for (final event in events) {
      yield event;
    }
  }
}
```

- [ ] **Step 4: Run SSE test to verify it passes**

```bash
cd mobile && flutter test test/services/sse_client_test.dart
```

Expected: PASS

- [ ] **Step 5: Implement API client**

Create `mobile/lib/services/api_client.dart`:

```dart
import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

Dio createApiClient({String? token}) {
  final baseUrl = dotenv.env['API_BASE_URL'] ?? 'http://localhost:8000/api';

  final dio = Dio(BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 90),
  ));

  if (token != null) {
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        final uri = options.uri;
        final separator = uri.queryParameters.isEmpty ? '?' : '&';
        options.path = '${options.path}${separator}token=$token';
        handler.next(options);
      },
    ));
  }

  return dio;
}
```

- [ ] **Step 6: Commit**

```bash
cd mobile && git add lib/services/ test/services/
git commit -m "feat(mobile): add API client and SSE stream parser"
```

---

### Task 6: Auth Provider

**Files:**
- Create: `mobile/lib/providers/auth_provider.dart`
- Test: `mobile/test/providers/auth_provider_test.dart`

- [ ] **Step 1: Write auth provider test**

Create `mobile/test/providers/auth_provider_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:royal_dispatch/providers/auth_provider.dart';

class MockSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late MockSecureStorage mockStorage;

  setUp(() {
    mockStorage = MockSecureStorage();
  });

  test('initial state reads token from secure storage', () async {
    when(() => mockStorage.read(key: 'royal_token'))
        .thenAnswer((_) async => 'saved-token');

    final container = ProviderContainer(
      overrides: [
        secureStorageProvider.overrideWithValue(mockStorage),
      ],
    );
    addTearDown(container.dispose);

    // Wait for async initialization
    await container.read(authProvider.future);
    final token = container.read(authProvider).value;
    expect(token, 'saved-token');
  });

  test('pair() stores token and updates state', () async {
    when(() => mockStorage.read(key: 'royal_token'))
        .thenAnswer((_) async => null);
    when(() => mockStorage.write(key: 'royal_token', value: 'new-token'))
        .thenAnswer((_) async {});

    final container = ProviderContainer(
      overrides: [
        secureStorageProvider.overrideWithValue(mockStorage),
      ],
    );
    addTearDown(container.dispose);

    await container.read(authProvider.future);
    await container.read(authProvider.notifier).pair('new-token');

    final token = container.read(authProvider).value;
    expect(token, 'new-token');
    verify(() => mockStorage.write(key: 'royal_token', value: 'new-token'))
        .called(1);
  });

  test('unpair() clears token', () async {
    when(() => mockStorage.read(key: 'royal_token'))
        .thenAnswer((_) async => 'existing');
    when(() => mockStorage.delete(key: 'royal_token'))
        .thenAnswer((_) async {});

    final container = ProviderContainer(
      overrides: [
        secureStorageProvider.overrideWithValue(mockStorage),
      ],
    );
    addTearDown(container.dispose);

    await container.read(authProvider.future);
    await container.read(authProvider.notifier).unpair();

    final token = container.read(authProvider).value;
    expect(token, isNull);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mobile && flutter test test/providers/auth_provider_test.dart
```

Expected: FAIL

- [ ] **Step 3: Implement auth provider**

Create `mobile/lib/providers/auth_provider.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _tokenKey = 'royal_token';

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (ref) => const FlutterSecureStorage(),
);

final authProvider = AsyncNotifierProvider<AuthNotifier, String?>(
  AuthNotifier.new,
);

class AuthNotifier extends AsyncNotifier<String?> {
  @override
  Future<String?> build() async {
    final storage = ref.read(secureStorageProvider);
    return await storage.read(key: _tokenKey);
  }

  Future<void> pair(String token) async {
    final storage = ref.read(secureStorageProvider);
    await storage.write(key: _tokenKey, value: token);
    state = AsyncData(token);
  }

  Future<void> unpair() async {
    final storage = ref.read(secureStorageProvider);
    await storage.delete(key: _tokenKey);
    state = const AsyncData(null);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd mobile && flutter test test/providers/auth_provider_test.dart
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd mobile && git add lib/providers/auth_provider.dart test/providers/auth_provider_test.dart
git commit -m "feat(mobile): add auth provider with secure token storage"
```

---

### Task 7: Family Provider

**Files:**
- Create: `mobile/lib/providers/family_provider.dart`
- Test: `mobile/test/providers/family_provider_test.dart`

- [ ] **Step 1: Write family provider test**

Create `mobile/test/providers/family_provider_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/providers/auth_provider.dart';
import 'package:royal_dispatch/models/user_profile.dart';
import 'package:royal_dispatch/services/api_client.dart';

class MockDio extends Mock implements Dio {}

void main() {
  late MockDio mockDio;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    mockDio = MockDio();
    when(() => mockDio.options).thenReturn(BaseOptions());
  });

  test('selectedChildIdProvider reads from SharedPreferences', () async {
    SharedPreferences.setMockInitialValues({'selected_child_id': 'child-1'});
    final prefs = await SharedPreferences.getInstance();

    final container = ProviderContainer(
      overrides: [
        sharedPrefsProvider.overrideWithValue(prefs),
      ],
    );
    addTearDown(container.dispose);

    final childId = container.read(selectedChildIdProvider);
    expect(childId, 'child-1');
  });

  test('activePrincessIdsProvider returns favorites when child has them', () async {
    SharedPreferences.setMockInitialValues({'selected_child_id': 'child-1'});
    final prefs = await SharedPreferences.getInstance();

    final profile = UserProfile(
      userId: 'user-1',
      name: 'Dad',
      children: [
        ChildInfo(id: 'child-1', name: 'Emma', favoritePrincesses: ['elsa', 'belle']),
      ],
    );

    final container = ProviderContainer(
      overrides: [
        sharedPrefsProvider.overrideWithValue(prefs),
        familyProvider.overrideWith((ref) => AsyncData(profile)),
      ],
    );
    addTearDown(container.dispose);

    final ids = container.read(activePrincessIdsProvider);
    expect(ids, ['elsa', 'belle']);
  });

  test('activePrincessIdsProvider returns all when child has no favorites', () async {
    SharedPreferences.setMockInitialValues({'selected_child_id': 'child-1'});
    final prefs = await SharedPreferences.getInstance();

    final profile = UserProfile(
      userId: 'user-1',
      name: 'Dad',
      children: [
        ChildInfo(id: 'child-1', name: 'Emma', favoritePrincesses: []),
      ],
    );

    final container = ProviderContainer(
      overrides: [
        sharedPrefsProvider.overrideWithValue(prefs),
        familyProvider.overrideWith((ref) => AsyncData(profile)),
      ],
    );
    addTearDown(container.dispose);

    final ids = container.read(activePrincessIdsProvider);
    expect(ids.length, 12);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mobile && flutter test test/providers/family_provider_test.dart
```

Expected: FAIL

- [ ] **Step 3: Implement family provider**

Create `mobile/lib/providers/family_provider.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:royal_dispatch/models/user_profile.dart';
import 'package:royal_dispatch/models/princess.dart';
import 'package:royal_dispatch/providers/auth_provider.dart';
import 'package:royal_dispatch/services/api_client.dart';

const _childIdKey = 'selected_child_id';

final sharedPrefsProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('Must be overridden at startup'),
);

final familyProvider = AsyncNotifierProvider<FamilyNotifier, UserProfile?>(
  FamilyNotifier.new,
);

class FamilyNotifier extends AsyncNotifier<UserProfile?> {
  @override
  Future<UserProfile?> build() async {
    final token = ref.watch(authProvider).value;
    if (token == null) return null;

    final dio = createApiClient(token: token);
    try {
      final response = await dio.get('/user/me');
      return UserProfile.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      return null;
    }
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
  }
}

final selectedChildIdProvider = StateProvider<String?>((ref) {
  final prefs = ref.read(sharedPrefsProvider);
  return prefs.getString(_childIdKey);
});

void selectChild(WidgetRef ref, String childId) {
  ref.read(selectedChildIdProvider.notifier).state = childId;
  ref.read(sharedPrefsProvider).setString(_childIdKey, childId);
}

void clearSelectedChild(WidgetRef ref) {
  ref.read(selectedChildIdProvider.notifier).state = null;
  ref.read(sharedPrefsProvider).remove(_childIdKey);
}

final selectedChildProvider = Provider<ChildInfo?>((ref) {
  final profile = ref.watch(familyProvider).value;
  final childId = ref.watch(selectedChildIdProvider);
  if (profile == null || childId == null) return null;
  try {
    return profile.children.firstWhere((c) => c.id == childId);
  } catch (_) {
    return null;
  }
});

final activePrincessIdsProvider = Provider<List<String>>((ref) {
  final child = ref.watch(selectedChildProvider);
  if (child == null || child.favoritePrincesses.isEmpty) {
    return princessMeta.keys.toList();
  }
  return child.favoritePrincesses;
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd mobile && flutter test test/providers/family_provider_test.dart
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd mobile && git add lib/providers/family_provider.dart test/providers/family_provider_test.dart
git commit -m "feat(mobile): add family provider with child selection and princess filtering"
```

---

### Task 8: Story Provider

**Files:**
- Create: `mobile/lib/providers/story_provider.dart`
- Test: `mobile/test/providers/story_provider_test.dart`

- [ ] **Step 1: Write story provider test**

Create `mobile/test/providers/story_provider_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:royal_dispatch/providers/story_provider.dart';
import 'package:royal_dispatch/models/story_data.dart';

void main() {
  test('initial state is idle', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    final state = container.read(storyProvider);
    expect(state, isA<StoryStateIdle>());
  });

  test('reset returns to idle from any state', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    final notifier = container.read(storyProvider.notifier);
    notifier.setLoading();
    expect(container.read(storyProvider), isA<StoryStateLoading>());

    notifier.reset();
    expect(container.read(storyProvider), isA<StoryStateIdle>());
  });

  test('state transitions: loading -> streaming -> ready', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    final notifier = container.read(storyProvider.notifier);

    notifier.setLoading();
    expect(container.read(storyProvider), isA<StoryStateLoading>());

    notifier.setStreaming('Generating...');
    final streaming = container.read(storyProvider) as StoryStateStreaming;
    expect(streaming.statusText, 'Generating...');

    notifier.setReady(StoryData(
      storyText: 'Hello',
      royalChallenge: null,
      audioUrl: 'http://x.mp3',
    ));
    final ready = container.read(storyProvider) as StoryStateReady;
    expect(ready.data.storyText, 'Hello');
  });

  test('setError transitions to error state', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    final notifier = container.read(storyProvider.notifier);
    notifier.setError('Something failed');

    final state = container.read(storyProvider) as StoryStateError;
    expect(state.message, 'Something failed');
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mobile && flutter test test/providers/story_provider_test.dart
```

Expected: FAIL

- [ ] **Step 3: Implement story provider**

Create `mobile/lib/providers/story_provider.dart`:

```dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:royal_dispatch/models/story_data.dart';
import 'package:royal_dispatch/services/api_client.dart';
import 'package:royal_dispatch/services/sse_client.dart';
import 'package:royal_dispatch/providers/auth_provider.dart';

final storyProvider = StateNotifierProvider<StoryNotifier, StoryState>(
  (ref) => StoryNotifier(ref),
);

class StoryNotifier extends StateNotifier<StoryState> {
  final Ref _ref;
  StreamSubscription? _sseSubscription;
  Timer? _pollTimer;
  int _pollCount = 0;
  static const _maxPolls = 25; // 25 * 3s = 75s

  StoryNotifier(this._ref) : super(const StoryState.idle());

  void setLoading() => state = const StoryState.loading();
  void setStreaming(String text) => state = StoryState.streaming(text);
  void setReady(StoryData data) => state = StoryState.ready(data);
  void setError(String message) => state = StoryState.error(message);

  void reset() {
    _cancelAll();
    state = const StoryState.idle();
  }

  Future<void> generateViaSSE({
    required String princess,
    required String language,
    required String storyType,
    String? childId,
  }) async {
    _cancelAll();
    state = const StoryState.loading();

    final token = _ref.read(authProvider).value;
    if (token == null) {
      state = const StoryState.error('Not authenticated');
      return;
    }

    final dio = createApiClient(token: token);
    final params = [
      'princess=$princess',
      'language=$language',
      'story_type=$storyType',
      if (childId != null) 'child_id=$childId',
    ].join('&');

    try {
      final stream = connectSse(dio, '/story/generate?$params');
      _sseSubscription = stream.listen(
        (event) {
          switch (event.event) {
            case 'status':
              final data = jsonDecode(event.data) as Map<String, dynamic>;
              state = StoryState.streaming(
                data['message'] as String? ?? 'Generating...',
              );
            case 'ready' || 'cached':
              final data = jsonDecode(event.data) as Map<String, dynamic>;
              state = StoryState.ready(StoryData.fromJson(data));
              _cancelAll();
            case 'error':
              final data = jsonDecode(event.data) as Map<String, dynamic>;
              state = StoryState.error(
                data['message'] as String? ?? 'Generation failed',
              );
              _cancelAll();
          }
        },
        onError: (e) {
          state = StoryState.error('Connection error: $e');
          _cancelAll();
        },
        onDone: () {
          if (state is StoryStateLoading || state is StoryStateStreaming) {
            state = const StoryState.error('Stream ended unexpectedly');
          }
        },
      );
    } catch (e) {
      state = StoryState.error('Failed to connect: $e');
    }
  }

  Future<void> requestAndPoll({
    required String princess,
    required String language,
    required String storyType,
    String? childId,
  }) async {
    _cancelAll();
    state = const StoryState.loading();

    final token = _ref.read(authProvider).value;
    if (token == null) {
      state = const StoryState.error('Not authenticated');
      return;
    }

    final dio = createApiClient(token: token);

    try {
      await dio.post('/story', data: {
        'princess': princess,
        'language': language,
        'story_type': storyType,
        if (childId != null) 'child_id': childId,
      });
    } catch (e) {
      state = StoryState.error('Request failed: $e');
      return;
    }

    state = const StoryState.streaming('Generating your story...');
    _pollCount = 0;

    _pollTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      _pollCount++;
      if (_pollCount > _maxPolls) {
        state = const StoryState.error('Story generation timed out');
        _cancelAll();
        return;
      }

      try {
        final childParam = childId != null ? '&child_id=$childId' : '';
        final response = await dio.get(
          '/story/today/$princess?type=$storyType$childParam',
        );
        final data = StoryData.fromJson(response.data as Map<String, dynamic>);
        state = StoryState.ready(data);
        _cancelAll();
      } catch (e) {
        // 404 means not ready yet — keep polling
        if (e is DioException && e.response?.statusCode == 404) return;
        state = StoryState.error('Poll error: $e');
        _cancelAll();
      }
    });
  }

  void _cancelAll() {
    _sseSubscription?.cancel();
    _sseSubscription = null;
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  @override
  void dispose() {
    _cancelAll();
    super.dispose();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd mobile && flutter test test/providers/story_provider_test.dart
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd mobile && git add lib/providers/story_provider.dart test/providers/story_provider_test.dart
git commit -m "feat(mobile): add story provider with SSE and polling support"
```

---

### Task 9: Audio Handler & Provider

**Files:**
- Create: `mobile/lib/services/audio_handler.dart`
- Create: `mobile/lib/providers/audio_provider.dart`

- [ ] **Step 1: Implement audio handler**

Create `mobile/lib/services/audio_handler.dart`:

```dart
import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart';

class RoyalAudioHandler extends BaseAudioHandler with SeekHandler {
  final AudioPlayer _player = AudioPlayer();

  RoyalAudioHandler() {
    // Broadcast player state changes to audio_service
    _player.playbackEventStream.listen((event) {
      playbackState.add(_transformEvent(event));
    });

    _player.processingStateStream.listen((state) {
      if (state == ProcessingState.completed) {
        stop();
      }
    });
  }

  AudioPlayer get player => _player;

  @override
  Future<void> play() => _player.play();

  @override
  Future<void> pause() => _player.pause();

  @override
  Future<void> seek(Duration position) => _player.seek(position);

  @override
  Future<void> stop() async {
    await _player.stop();
    return super.stop();
  }

  @override
  Future<void> skipToNext() async {
    final pos = _player.position + const Duration(seconds: 10);
    final dur = _player.duration ?? Duration.zero;
    await _player.seek(pos > dur ? dur : pos);
  }

  @override
  Future<void> skipToPrevious() async {
    final pos = _player.position - const Duration(seconds: 10);
    await _player.seek(pos < Duration.zero ? Duration.zero : pos);
  }

  Future<void> loadAndPlay(String url, {required MediaItem item}) async {
    mediaItem.add(item);
    await _player.setUrl(url);
    await _player.play();
  }

  PlaybackState _transformEvent(PlaybackEvent event) {
    return PlaybackState(
      controls: [
        MediaControl.skipToPrevious,
        _player.playing ? MediaControl.pause : MediaControl.play,
        MediaControl.skipToNext,
      ],
      systemActions: const {
        MediaAction.seek,
      },
      androidCompactActionIndices: const [0, 1, 2],
      processingState: switch (_player.processingState) {
        ProcessingState.idle => AudioProcessingState.idle,
        ProcessingState.loading => AudioProcessingState.loading,
        ProcessingState.buffering => AudioProcessingState.buffering,
        ProcessingState.ready => AudioProcessingState.ready,
        ProcessingState.completed => AudioProcessingState.completed,
      },
      playing: _player.playing,
      updatePosition: _player.position,
      bufferedPosition: _player.bufferedPosition,
      speed: _player.speed,
    );
  }
}
```

- [ ] **Step 2: Implement audio provider**

Create `mobile/lib/providers/audio_provider.dart`:

```dart
import 'package:audio_service/audio_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:royal_dispatch/services/audio_handler.dart';

final audioHandlerProvider = Provider<RoyalAudioHandler>(
  (ref) => throw UnimplementedError('Must be overridden after AudioService.init'),
);

class AudioState {
  final bool playing;
  final Duration position;
  final Duration duration;
  final bool buffering;

  const AudioState({
    this.playing = false,
    this.position = Duration.zero,
    this.duration = Duration.zero,
    this.buffering = false,
  });
}

final audioStateProvider = StreamProvider<AudioState>((ref) {
  final handler = ref.watch(audioHandlerProvider);
  final player = handler.player;

  return player.playbackEventStream.map((_) {
    return AudioState(
      playing: player.playing,
      position: player.position,
      duration: player.duration ?? Duration.zero,
      buffering: player.processingState == ProcessingState.buffering,
    );
  });
});

final audioPlayingProvider = Provider<bool>((ref) {
  return ref.watch(audioStateProvider).value?.playing ?? false;
});

final audioPositionProvider = StreamProvider<Duration>((ref) {
  final handler = ref.watch(audioHandlerProvider);
  return handler.player.positionStream;
});

final audioDurationProvider = Provider<Duration>((ref) {
  return ref.watch(audioStateProvider).value?.duration ?? Duration.zero;
});
```

- [ ] **Step 3: Verify compilation**

```bash
cd mobile && flutter analyze lib/services/audio_handler.dart lib/providers/audio_provider.dart
```

Expected: No errors (audio packages provide stubs for analysis)

- [ ] **Step 4: Commit**

```bash
cd mobile && git add lib/services/audio_handler.dart lib/providers/audio_provider.dart
git commit -m "feat(mobile): add audio handler and provider for background playback"
```

---

### Task 10: Locale Provider

**Files:**
- Create: `mobile/lib/providers/locale_provider.dart`

- [ ] **Step 1: Implement locale provider**

Create `mobile/lib/providers/locale_provider.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:royal_dispatch/providers/family_provider.dart';

const _localeKey = 'locale';

final localeProvider = StateNotifierProvider<LocaleNotifier, Locale>((ref) {
  final prefs = ref.read(sharedPrefsProvider);
  final saved = prefs.getString(_localeKey);
  return LocaleNotifier(prefs, saved != null ? Locale(saved) : const Locale('en'));
});

class LocaleNotifier extends StateNotifier<Locale> {
  final SharedPreferences _prefs;

  LocaleNotifier(this._prefs, Locale initial) : super(initial);

  void toggle() {
    final next = state.languageCode == 'en' ? const Locale('vi') : const Locale('en');
    state = next;
    _prefs.setString(_localeKey, next.languageCode);
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd mobile && git add lib/providers/locale_provider.dart
git commit -m "feat(mobile): add locale provider with persistence"
```

---

### Task 11: Router

**Files:**
- Create: `mobile/lib/router.dart`

- [ ] **Step 1: Implement go_router config**

Create `mobile/lib/router.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/providers/auth_provider.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/screens/pairing_screen.dart';
import 'package:royal_dispatch/screens/child_picker_screen.dart';
import 'package:royal_dispatch/screens/inbox_screen.dart';
import 'package:royal_dispatch/screens/story_request_screen.dart';
import 'package:royal_dispatch/screens/story_playback_screen.dart';
import 'package:royal_dispatch/widgets/bottom_nav.dart';
import 'package:royal_dispatch/widgets/header.dart';
import 'package:royal_dispatch/widgets/particles_background.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);
  final selectedChildId = ref.watch(selectedChildIdProvider);

  return GoRouter(
    initialLocation: '/home/inbox',
    redirect: (context, state) {
      final token = authState.value;
      final isLoading = authState.isLoading;
      final path = state.matchedLocation;

      if (isLoading) return null;

      if (token == null && path != '/pair') return '/pair';
      if (token != null && path == '/pair') {
        return selectedChildId != null ? '/home/inbox' : '/pick-child';
      }
      if (token != null && selectedChildId == null && path.startsWith('/home')) {
        return '/pick-child';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/pair',
        builder: (context, state) => const PairingScreen(),
      ),
      GoRoute(
        path: '/pick-child',
        builder: (context, state) => const ChildPickerScreen(),
      ),
      ShellRoute(
        builder: (context, state, child) {
          return Scaffold(
            body: Stack(
              children: [
                const ParticlesBackground(),
                Column(
                  children: [
                    const Header(),
                    Expanded(child: child),
                  ],
                ),
                const Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: BottomNav(),
                ),
              ],
            ),
          );
        },
        routes: [
          GoRoute(
            path: '/home/inbox',
            builder: (context, state) => const InboxScreen(),
          ),
          GoRoute(
            path: '/home/story',
            builder: (context, state) => const StoryRequestScreen(),
          ),
        ],
      ),
      GoRoute(
        path: '/play/:princess',
        builder: (context, state) {
          final princess = state.pathParameters['princess']!;
          return StoryPlaybackScreen(princess: princess, useSSE: true);
        },
      ),
      GoRoute(
        path: '/story/:princess',
        builder: (context, state) {
          final princess = state.pathParameters['princess']!;
          return StoryPlaybackScreen(princess: princess, useSSE: false);
        },
      ),
    ],
  );
});
```

- [ ] **Step 2: Commit**

```bash
cd mobile && git add lib/router.dart
git commit -m "feat(mobile): add go_router config with auth redirects and shell route"
```

---

### Task 12: App Entry Points

**Files:**
- Modify: `mobile/lib/main.dart`
- Create: `mobile/lib/app.dart`

- [ ] **Step 1: Implement main.dart**

Replace `mobile/lib/main.dart`:

```dart
import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:royal_dispatch/app.dart';
import 'package:royal_dispatch/providers/audio_provider.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/services/audio_handler.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load();

  final prefs = await SharedPreferences.getInstance();
  final audioHandler = await AudioService.init(
    builder: () => RoyalAudioHandler(),
    config: const AudioServiceConfig(
      androidNotificationChannelId: 'com.royaldispatch.audio',
      androidNotificationChannelName: 'Royal Dispatch',
      androidNotificationOngoing: true,
    ),
  );

  runApp(
    ProviderScope(
      overrides: [
        sharedPrefsProvider.overrideWithValue(prefs),
        audioHandlerProvider.overrideWithValue(audioHandler as RoyalAudioHandler),
      ],
      child: const RoyalDispatchApp(),
    ),
  );
}
```

- [ ] **Step 2: Implement app.dart**

Create `mobile/lib/app.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:royal_dispatch/router.dart';
import 'package:royal_dispatch/theme.dart';
import 'package:royal_dispatch/providers/locale_provider.dart';

class RoyalDispatchApp extends ConsumerWidget {
  const RoyalDispatchApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final locale = ref.watch(localeProvider);

    return MaterialApp.router(
      title: 'The Royal Dispatch',
      theme: buildRoyalTheme(),
      locale: locale,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('en'),
        Locale('vi'),
      ],
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd mobile && git add lib/main.dart lib/app.dart
git commit -m "feat(mobile): add app entry point with audio service and provider setup"
```

---

### Task 13: Reusable Widgets — Particles, Language Toggle, Header, Bottom Nav

**Files:**
- Create: `mobile/lib/widgets/particles_background.dart`
- Create: `mobile/lib/widgets/language_toggle.dart`
- Create: `mobile/lib/widgets/header.dart`
- Create: `mobile/lib/widgets/bottom_nav.dart`

- [ ] **Step 1: Implement particles background**

Create `mobile/lib/widgets/particles_background.dart`:

```dart
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:royal_dispatch/theme.dart';

class _Particle {
  double x;
  double y;
  double vx;
  double vy;
  double size;
  double opacity;
  Color color;

  _Particle({
    required this.x,
    required this.y,
    required this.vx,
    required this.vy,
    required this.size,
    required this.opacity,
    required this.color,
  });
}

class ParticlesBackground extends StatefulWidget {
  const ParticlesBackground({super.key});

  @override
  State<ParticlesBackground> createState() => _ParticlesBackgroundState();
}

class _ParticlesBackgroundState extends State<ParticlesBackground>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late List<_Particle> _particles;
  final _random = Random(42);

  static const _colors = [
    RoyalColors.gold,
    Colors.white,
    RoyalColors.sky,
    RoyalColors.rose,
  ];

  @override
  void initState() {
    super.initState();
    _particles = List.generate(30, (_) => _createParticle());
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    )..addListener(_updateParticles);
    _controller.repeat();
  }

  _Particle _createParticle() {
    return _Particle(
      x: _random.nextDouble(),
      y: _random.nextDouble(),
      vx: (_random.nextDouble() - 0.5) * 0.001,
      vy: (_random.nextDouble() - 0.5) * 0.001,
      size: 2 + _random.nextDouble() * 3,
      opacity: 0.1 + _random.nextDouble() * 0.6,
      color: _colors[_random.nextInt(_colors.length)],
    );
  }

  void _updateParticles() {
    for (final p in _particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > 1) p.vx = -p.vx;
      if (p.y < 0 || p.y > 1) p.vy = -p.vy;
    }
    setState(() {});
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(gradient: RoyalColors.backgroundGradient),
      child: CustomPaint(
        painter: _ParticlesPainter(_particles),
        size: Size.infinite,
      ),
    );
  }
}

class _ParticlesPainter extends CustomPainter {
  final List<_Particle> particles;

  _ParticlesPainter(this.particles);

  @override
  void paint(Canvas canvas, Size size) {
    for (final p in particles) {
      final paint = Paint()
        ..color = p.color.withOpacity(p.opacity)
        ..style = PaintingStyle.fill;
      canvas.drawCircle(
        Offset(p.x * size.width, p.y * size.height),
        p.size,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ParticlesPainter oldDelegate) => true;
}
```

- [ ] **Step 2: Implement language toggle**

Create `mobile/lib/widgets/language_toggle.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:royal_dispatch/providers/locale_provider.dart';
import 'package:royal_dispatch/theme.dart';

class LanguageToggle extends ConsumerWidget {
  const LanguageToggle({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    final isEn = locale.languageCode == 'en';

    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        ref.read(localeProvider.notifier).toggle();
      },
      child: Container(
        width: 80,
        height: 40,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.08),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withOpacity(0.12)),
        ),
        child: Stack(
          children: [
            // Sliding gold ball
            AnimatedPositioned(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutBack,
              left: isEn ? 2 : 40,
              top: 2,
              child: Container(
                width: 36,
                height: 36,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RoyalColors.goldGradient,
                ),
              ),
            ),
            // Flags
            Row(
              children: [
                Expanded(
                  child: Center(
                    child: Text(
                      '🇬🇧',
                      style: TextStyle(
                        fontSize: isEn ? 18 : 14,
                        color: isEn ? null : Colors.white.withOpacity(0.5),
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: Center(
                    child: Text(
                      '🇻🇳',
                      style: TextStyle(
                        fontSize: isEn ? 14 : 18,
                        color: isEn ? Colors.white.withOpacity(0.5) : null,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 3: Implement header**

Create `mobile/lib/widgets/header.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/theme.dart';
import 'package:royal_dispatch/widgets/glass_card.dart';
import 'package:royal_dispatch/widgets/language_toggle.dart';

class Header extends ConsumerWidget {
  const Header({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final child = ref.watch(selectedChildProvider);
    final initial = child?.name.isNotEmpty == true ? child!.name[0].toUpperCase() : '?';

    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: GlassCard(
          variant: GlassVariant.header,
          borderRadius: 20,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              // Title
              Expanded(
                child: ShaderMask(
                  shaderCallback: (bounds) =>
                      RoyalColors.goldTextGradient.createShader(bounds),
                  child: const Text(
                    'The Royal Dispatch',
                    style: TextStyle(
                      fontFamily: 'Georgia',
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              // Language toggle
              const LanguageToggle(),
              const SizedBox(width: 12),
              // Child avatar
              GestureDetector(
                onTap: () => context.go('/pick-child'),
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RoyalColors.goldGradient,
                  ),
                  child: Center(
                    child: Text(
                      initial,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.black,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Implement bottom nav**

Create `mobile/lib/widgets/bottom_nav.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/widgets/glass_card.dart';
import 'package:royal_dispatch/theme.dart';

class BottomNav extends StatelessWidget {
  const BottomNav({super.key});

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final isInbox = location == '/home/inbox';

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
        child: GlassCard(
          variant: GlassVariant.nav,
          borderRadius: 28,
          child: SizedBox(
            height: 80,
            child: Row(
              children: [
                _NavTab(
                  iconAsset: 'assets/icons/inbox-3d.png',
                  label: 'Inbox',
                  isActive: isInbox,
                  onTap: () {
                    HapticFeedback.lightImpact();
                    context.go('/home/inbox');
                  },
                ),
                _NavTab(
                  iconAsset: 'assets/icons/story-3d.png',
                  label: 'Story',
                  isActive: !isInbox,
                  onTap: () {
                    HapticFeedback.lightImpact();
                    context.go('/home/story');
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavTab extends StatelessWidget {
  final String iconAsset;
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  const _NavTab({
    required this.iconAsset,
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          decoration: isActive
              ? BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.3),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                      blurStyle: BlurStyle.inner,
                    ),
                  ],
                )
              : null,
          child: AnimatedScale(
            scale: isActive ? 0.95 : 1.0,
            duration: const Duration(milliseconds: 200),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AnimatedOpacity(
                  opacity: isActive ? 1.0 : 0.5,
                  duration: const Duration(milliseconds: 200),
                  child: Image.asset(
                    iconAsset,
                    width: 36,
                    height: 36,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: isActive ? FontWeight.w700 : FontWeight.w400,
                    color: isActive
                        ? Colors.white
                        : Colors.white.withOpacity(0.5),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: Commit**

```bash
cd mobile && git add lib/widgets/particles_background.dart lib/widgets/language_toggle.dart lib/widgets/header.dart lib/widgets/bottom_nav.dart
git commit -m "feat(mobile): add particles background, language toggle, header, and bottom nav widgets"
```

---

### Task 14: Princess Card Widget

**Files:**
- Create: `mobile/lib/widgets/princess_card.dart`
- Test: `mobile/test/widgets/princess_card_test.dart`

- [ ] **Step 1: Write princess card test**

Create `mobile/test/widgets/princess_card_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/widgets/princess_card.dart';

void main() {
  testWidgets('PrincessCard displays princess name and emoji', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PrincessCard(
            princessId: 'elsa',
            onTap: () {},
          ),
        ),
      ),
    );

    expect(find.text('Queen Elsa'), findsOneWidget);
    expect(find.text('❄️'), findsOneWidget);
    expect(find.text('Kingdom of Arendelle'), findsOneWidget);
  });

  testWidgets('PrincessCard calls onTap when pressed', (tester) async {
    var tapped = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PrincessCard(
            princessId: 'belle',
            onTap: () => tapped = true,
          ),
        ),
      ),
    );

    await tester.tap(find.byType(PrincessCard));
    expect(tapped, true);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mobile && flutter test test/widgets/princess_card_test.dart
```

Expected: FAIL

- [ ] **Step 3: Implement princess card**

Create `mobile/lib/widgets/princess_card.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:royal_dispatch/models/princess.dart';
import 'package:royal_dispatch/widgets/glass_card.dart';

class PrincessCard extends StatefulWidget {
  final String princessId;
  final VoidCallback onTap;
  final bool isPoster;
  final bool isLoading;

  const PrincessCard({
    super.key,
    required this.princessId,
    required this.onTap,
    this.isPoster = false,
    this.isLoading = false,
  });

  @override
  State<PrincessCard> createState() => _PrincessCardState();
}

class _PrincessCardState extends State<PrincessCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _scaleController;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _scaleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 100),
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.96).animate(
      CurvedAnimation(parent: _scaleController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _scaleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final meta = princessMeta[widget.princessId];
    if (meta == null) return const SizedBox.shrink();

    return GestureDetector(
      onTapDown: (_) => _scaleController.forward(),
      onTapUp: (_) {
        _scaleController.reverse();
        widget.onTap();
      },
      onTapCancel: () => _scaleController.reverse(),
      child: ScaleTransition(
        scale: _scaleAnimation,
        child: GlassCard(
          borderRadius: 16,
          child: widget.isPoster ? _buildPoster(meta) : _buildList(meta),
        ),
      ),
    );
  }

  Widget _buildList(PrincessMeta meta) {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          // Character image
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Container(
              width: 56,
              height: 56,
              color: meta.overlayColor,
              child: Image.asset(
                princessImagePath(widget.princessId),
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Center(
                  child: Text(meta.emoji, style: const TextStyle(fontSize: 28)),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Name and origin
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  meta.name,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  meta.origin,
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.white.withOpacity(0.6),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          // Emoji badge
          Text(meta.emoji, style: const TextStyle(fontSize: 20)),
          const SizedBox(width: 4),
          if (widget.isLoading)
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else
            Icon(
              Icons.chevron_right,
              color: Colors.white.withOpacity(0.4),
            ),
        ],
      ),
    );
  }

  Widget _buildPoster(PrincessMeta meta) {
    return AspectRatio(
      aspectRatio: 1,
      child: Stack(
        children: [
          // Background image
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Container(
                color: meta.overlayColor,
                child: Image.asset(
                  princessImagePath(widget.princessId),
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Center(
                    child: Text(meta.emoji, style: const TextStyle(fontSize: 48)),
                  ),
                ),
              ),
            ),
          ),
          // Gradient overlay
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withOpacity(0.7),
                  ],
                ),
              ),
            ),
          ),
          // Emoji badge
          Positioned(
            top: 8,
            right: 8,
            child: Text(meta.emoji, style: const TextStyle(fontSize: 20)),
          ),
          // Name and origin
          Positioned(
            left: 10,
            right: 10,
            bottom: 10,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  meta.name,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                Text(
                  meta.origin,
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.white.withOpacity(0.7),
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd mobile && flutter test test/widgets/princess_card_test.dart
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd mobile && git add lib/widgets/princess_card.dart test/widgets/princess_card_test.dart
git commit -m "feat(mobile): add princess card widget with list and poster variants"
```

---

### Task 15: Pairing Screen

**Files:**
- Create: `mobile/lib/screens/pairing_screen.dart`

- [ ] **Step 1: Implement pairing screen**

Create `mobile/lib/screens/pairing_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:royal_dispatch/providers/auth_provider.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/services/api_client.dart';
import 'package:royal_dispatch/theme.dart';
import 'package:royal_dispatch/widgets/glass_card.dart';
import 'package:royal_dispatch/widgets/particles_background.dart';

class PairingScreen extends ConsumerStatefulWidget {
  const PairingScreen({super.key});

  @override
  ConsumerState<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends ConsumerState<PairingScreen> {
  final _controller = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    final token = _controller.text.trim();
    if (token.isEmpty) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final dio = createApiClient(token: token);
      final response = await dio.get('/user/me');
      if (response.statusCode == 200) {
        await ref.read(authProvider.notifier).pair(token);
        // Router redirect will handle navigation
      } else {
        setState(() => _error = AppLocalizations.of(context)!.pairingError);
      }
    } catch (_) {
      setState(() => _error = AppLocalizations.of(context)!.pairingError);
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      body: Stack(
        children: [
          const ParticlesBackground(),
          SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Title
                    ShaderMask(
                      shaderCallback: (bounds) =>
                          RoyalColors.goldTextGradient.createShader(bounds),
                      child: const Text(
                        'The Royal Dispatch',
                        style: TextStyle(
                          fontFamily: 'Georgia',
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      l10n.pairingTitle,
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.white.withOpacity(0.7),
                      ),
                    ),
                    const SizedBox(height: 40),
                    // Token input
                    GlassCard(
                      padding: const EdgeInsets.all(4),
                      child: TextField(
                        controller: _controller,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          hintText: l10n.pairingHint,
                          hintStyle: TextStyle(
                            color: Colors.white.withOpacity(0.4),
                          ),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                        ),
                        onSubmitted: (_) => _connect(),
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        _error!,
                        style: const TextStyle(
                          color: RoyalColors.rose,
                          fontSize: 14,
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    // Connect button
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: RoyalColors.goldGradient,
                          borderRadius: BorderRadius.circular(25),
                        ),
                        child: ElevatedButton(
                          onPressed: _loading ? null : _connect,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.transparent,
                            shadowColor: Colors.transparent,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(25),
                            ),
                          ),
                          child: _loading
                              ? const SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.black,
                                  ),
                                )
                              : Text(
                                  l10n.pairingConnect,
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.black,
                                  ),
                                ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd mobile && git add lib/screens/pairing_screen.dart
git commit -m "feat(mobile): add pairing screen with token entry"
```

---

### Task 16: Child Picker Screen

**Files:**
- Create: `mobile/lib/screens/child_picker_screen.dart`

- [ ] **Step 1: Implement child picker screen**

Create `mobile/lib/screens/child_picker_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/theme.dart';
import 'package:royal_dispatch/widgets/particles_background.dart';

class ChildPickerScreen extends ConsumerWidget {
  const ChildPickerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final profileAsync = ref.watch(familyProvider);

    return Scaffold(
      body: Stack(
        children: [
          const ParticlesBackground(),
          SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ShaderMask(
                      shaderCallback: (bounds) =>
                          RoyalColors.goldTextGradient.createShader(bounds),
                      child: Text(
                        l10n.pickChildHeading,
                        style: const TextStyle(
                          fontFamily: 'Georgia',
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      l10n.pickChildSubheading,
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.white.withOpacity(0.7),
                      ),
                    ),
                    const SizedBox(height: 48),
                    profileAsync.when(
                      loading: () => const CircularProgressIndicator(
                        color: RoyalColors.gold,
                      ),
                      error: (_, __) => Text(
                        'Could not load family',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.7),
                        ),
                      ),
                      data: (profile) {
                        if (profile == null) {
                          return const Text('No profile found');
                        }
                        return Wrap(
                          spacing: 24,
                          runSpacing: 24,
                          alignment: WrapAlignment.center,
                          children: profile.children.map((child) {
                            return _ChildAvatar(
                              name: child.name,
                              onTap: () {
                                HapticFeedback.lightImpact();
                                selectChild(ref, child.id);
                                context.go('/home/inbox');
                              },
                            );
                          }).toList(),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChildAvatar extends StatelessWidget {
  final String name;
  final VoidCallback onTap;

  const _ChildAvatar({required this.name, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: RoyalColors.goldGradient,
            ),
            child: Center(
              child: Text(
                initial,
                style: const TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                  color: Colors.black,
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            name,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd mobile && git add lib/screens/child_picker_screen.dart
git commit -m "feat(mobile): add child picker screen with avatar grid"
```

---

### Task 17: Inbox Screen

**Files:**
- Create: `mobile/lib/screens/inbox_screen.dart`

- [ ] **Step 1: Implement inbox screen**

Create `mobile/lib/screens/inbox_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/providers/locale_provider.dart';
import 'package:royal_dispatch/theme.dart';
import 'package:royal_dispatch/widgets/princess_card.dart';

class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final princessIds = ref.watch(activePrincessIdsProvider);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(
              l10n.appSubtitle,
              style: TextStyle(
                fontSize: 14,
                color: Colors.white.withOpacity(0.6),
              ),
            ),
          ),
          Expanded(
            child: ListView.separated(
              itemCount: princessIds.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final id = princessIds[index];
                return PrincessCard(
                  princessId: id,
                  onTap: () => context.push('/play/$id'),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd mobile && git add lib/screens/inbox_screen.dart
git commit -m "feat(mobile): add inbox screen with princess list"
```

---

### Task 18: Story Request Screen

**Files:**
- Create: `mobile/lib/screens/story_request_screen.dart`

- [ ] **Step 1: Implement story request screen**

Create `mobile/lib/screens/story_request_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/models/princess.dart';
import 'package:royal_dispatch/widgets/princess_card.dart';

class StoryRequestScreen extends ConsumerWidget {
  const StoryRequestScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ids = princessMeta.keys.toList();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      child: GridView.builder(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
        ),
        itemCount: ids.length,
        itemBuilder: (context, index) {
          final id = ids[index];
          return PrincessCard(
            princessId: id,
            isPoster: true,
            onTap: () => context.push('/story/$id'),
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd mobile && git add lib/screens/story_request_screen.dart
git commit -m "feat(mobile): add story request screen with princess grid"
```

---

### Task 19: Story Waiting, Hold-to-Exit, Audio Controls Widgets

**Files:**
- Create: `mobile/lib/widgets/story_waiting.dart`
- Create: `mobile/lib/widgets/hold_to_exit_button.dart`
- Create: `mobile/lib/widgets/audio_controls.dart`
- Test: `mobile/test/widgets/hold_to_exit_button_test.dart`

- [ ] **Step 1: Write hold-to-exit test**

Create `mobile/test/widgets/hold_to_exit_button_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/widgets/hold_to_exit_button.dart';

void main() {
  testWidgets('HoldToExitButton renders label', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HoldToExitButton(
            label: 'Hold to Exit',
            onExit: () {},
          ),
        ),
      ),
    );

    expect(find.text('Hold to Exit'), findsOneWidget);
  });

  testWidgets('HoldToExitButton does NOT fire on short tap', (tester) async {
    var exited = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HoldToExitButton(
            label: 'Hold to Exit',
            onExit: () => exited = true,
          ),
        ),
      ),
    );

    await tester.tap(find.byType(HoldToExitButton));
    await tester.pump(const Duration(milliseconds: 500));
    expect(exited, false);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mobile && flutter test test/widgets/hold_to_exit_button_test.dart
```

Expected: FAIL

- [ ] **Step 3: Implement hold-to-exit button**

Create `mobile/lib/widgets/hold_to_exit_button.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:royal_dispatch/theme.dart';

class HoldToExitButton extends StatefulWidget {
  final String label;
  final VoidCallback onExit;
  final Duration holdDuration;

  const HoldToExitButton({
    super.key,
    required this.label,
    required this.onExit,
    this.holdDuration = const Duration(seconds: 1),
  });

  @override
  State<HoldToExitButton> createState() => _HoldToExitButtonState();
}

class _HoldToExitButtonState extends State<HoldToExitButton>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.holdDuration,
    );
    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        HapticFeedback.heavyImpact();
        widget.onExit();
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPressStart: (_) {
        HapticFeedback.lightImpact();
        _controller.forward(from: 0);
      },
      onLongPressEnd: (_) {
        if (_controller.status != AnimationStatus.completed) {
          _controller.reset();
        }
      },
      child: Container(
        height: 48,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white.withOpacity(0.2)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            // Fill animation
            AnimatedBuilder(
              animation: _controller,
              builder: (context, _) {
                return FractionallySizedBox(
                  widthFactor: _controller.value,
                  child: Container(
                    decoration: const BoxDecoration(
                      gradient: RoyalColors.goldGradient,
                    ),
                  ),
                );
              },
            ),
            // Label
            Center(
              child: Text(
                widget.label,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd mobile && flutter test test/widgets/hold_to_exit_button_test.dart
```

Expected: PASS

- [ ] **Step 5: Implement story waiting widget**

Create `mobile/lib/widgets/story_waiting.dart`:

```dart
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:royal_dispatch/models/princess.dart';
import 'package:royal_dispatch/theme.dart';

class StoryWaiting extends StatefulWidget {
  final String princessId;
  final String? statusText;

  const StoryWaiting({
    super.key,
    required this.princessId,
    this.statusText,
  });

  @override
  State<StoryWaiting> createState() => _StoryWaitingState();
}

class _StoryWaitingState extends State<StoryWaiting>
    with TickerProviderStateMixin {
  late AnimationController _kenBurns;
  late AnimationController _dots;

  @override
  void initState() {
    super.initState();
    _kenBurns = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 25),
    )..repeat(reverse: true);

    _dots = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();
  }

  @override
  void dispose() {
    _kenBurns.dispose();
    _dots.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final meta = princessMeta[widget.princessId];
    if (meta == null) return const SizedBox.shrink();

    return Stack(
      fit: StackFit.expand,
      children: [
        // Ken Burns image
        AnimatedBuilder(
          animation: _kenBurns,
          builder: (context, child) {
            final scale = 1.0 + _kenBurns.value * 0.1;
            final dx = _kenBurns.value * 10 - 5;
            return Transform(
              transform: Matrix4.identity()
                ..scale(scale)
                ..translate(dx, 0.0),
              alignment: Alignment.center,
              child: Opacity(
                opacity: 0.35,
                child: Image.asset(
                  princessImagePath(widget.princessId),
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    color: meta.overlayColor,
                  ),
                ),
              ),
            );
          },
        ),
        // Gradient overlays
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.center,
              colors: [Colors.black.withOpacity(0.8), Colors.transparent],
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.bottomCenter,
              end: Alignment.center,
              colors: [Colors.black.withOpacity(0.8), Colors.transparent],
            ),
          ),
        ),
        // Center content
        Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Princess emoji with glow
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: RoyalColors.gold.withOpacity(0.3),
                      blurRadius: 30,
                      spreadRadius: 10,
                    ),
                  ],
                ),
                child: Center(
                  child: Text(
                    meta.emoji,
                    style: const TextStyle(fontSize: 48),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              // Quill indicator
              const Text('✍️', style: TextStyle(fontSize: 28)),
              const SizedBox(height: 16),
              // Status text
              if (widget.statusText != null)
                Text(
                  widget.statusText!,
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.white.withOpacity(0.8),
                  ),
                  textAlign: TextAlign.center,
                ),
              const SizedBox(height: 16),
              // Pulsing dots
              AnimatedBuilder(
                animation: _dots,
                builder: (context, _) {
                  return Row(
                    mainAxisSize: MainAxisSize.min,
                    children: List.generate(3, (i) {
                      final delay = i * 0.2;
                      final progress = (_dots.value - delay).clamp(0.0, 1.0);
                      final scale = 0.5 + 0.5 * sin(progress * pi);
                      return Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Transform.scale(
                          scale: scale,
                          child: Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: RoyalColors.gold.withOpacity(
                                0.5 + 0.5 * scale,
                              ),
                            ),
                          ),
                        ),
                      );
                    }),
                  );
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}
```

- [ ] **Step 6: Implement audio controls widget**

Create `mobile/lib/widgets/audio_controls.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:royal_dispatch/providers/audio_provider.dart';
import 'package:royal_dispatch/services/audio_handler.dart';
import 'package:royal_dispatch/theme.dart';

class AudioControls extends ConsumerWidget {
  const AudioControls({super.key});

  String _formatDuration(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final handler = ref.watch(audioHandlerProvider);
    final positionAsync = ref.watch(audioPositionProvider);
    final duration = ref.watch(audioDurationProvider);
    final isPlaying = ref.watch(audioPlayingProvider);
    final position = positionAsync.value ?? Duration.zero;

    final progress = duration.inMilliseconds > 0
        ? position.inMilliseconds / duration.inMilliseconds
        : 0.0;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Progress bar
        SliderTheme(
          data: SliderThemeData(
            trackHeight: 3,
            activeTrackColor: RoyalColors.gold,
            inactiveTrackColor: Colors.white.withOpacity(0.2),
            thumbColor: Colors.white,
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
            overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
          ),
          child: Slider(
            value: progress.clamp(0.0, 1.0),
            onChanged: (value) {
              final newPosition = Duration(
                milliseconds: (value * duration.inMilliseconds).round(),
              );
              handler.seek(newPosition);
            },
          ),
        ),
        // Time display
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _formatDuration(position),
                style: TextStyle(
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: Colors.white.withOpacity(0.6),
                ),
              ),
              Text(
                _formatDuration(duration),
                style: TextStyle(
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: Colors.white.withOpacity(0.6),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        // Controls row
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Rewind 10s
            IconButton(
              onPressed: () => handler.skipToPrevious(),
              icon: const Text('↺', style: TextStyle(fontSize: 24)),
              color: Colors.white,
            ),
            const SizedBox(width: 24),
            // Play/Pause
            GestureDetector(
              onTap: () => isPlaying ? handler.pause() : handler.play(),
              child: Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RoyalColors.goldGradient,
                  boxShadow: [
                    BoxShadow(
                      color: RoyalColors.gold.withOpacity(0.2),
                      blurRadius: 30,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: Icon(
                  isPlaying ? Icons.pause : Icons.play_arrow,
                  size: 32,
                  color: Colors.black,
                ),
              ),
            ),
            const SizedBox(width: 24),
            // Skip 10s
            IconButton(
              onPressed: () => handler.skipToNext(),
              icon: const Text('↻', style: TextStyle(fontSize: 24)),
              color: Colors.white,
            ),
          ],
        ),
      ],
    );
  }
}
```

- [ ] **Step 7: Commit**

```bash
cd mobile && git add lib/widgets/story_waiting.dart lib/widgets/hold_to_exit_button.dart lib/widgets/audio_controls.dart test/widgets/hold_to_exit_button_test.dart
git commit -m "feat(mobile): add story waiting, hold-to-exit, and audio controls widgets"
```

---

### Task 20: Story Playback Screen

**Files:**
- Create: `mobile/lib/screens/story_playback_screen.dart`

- [ ] **Step 1: Implement story playback screen**

Create `mobile/lib/screens/story_playback_screen.dart`:

```dart
import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:royal_dispatch/models/princess.dart';
import 'package:royal_dispatch/models/story_data.dart';
import 'package:royal_dispatch/providers/audio_provider.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/providers/locale_provider.dart';
import 'package:royal_dispatch/providers/story_provider.dart';
import 'package:royal_dispatch/services/audio_handler.dart';
import 'package:royal_dispatch/theme.dart';
import 'package:royal_dispatch/widgets/audio_controls.dart';
import 'package:royal_dispatch/widgets/hold_to_exit_button.dart';
import 'package:royal_dispatch/widgets/particles_background.dart';
import 'package:royal_dispatch/widgets/story_waiting.dart';

class StoryPlaybackScreen extends ConsumerStatefulWidget {
  final String princess;
  final bool useSSE;

  const StoryPlaybackScreen({
    super.key,
    required this.princess,
    required this.useSSE,
  });

  @override
  ConsumerState<StoryPlaybackScreen> createState() =>
      _StoryPlaybackScreenState();
}

class _StoryPlaybackScreenState extends ConsumerState<StoryPlaybackScreen> {
  @override
  void initState() {
    super.initState();
    _startGeneration();
  }

  void _startGeneration() {
    final notifier = ref.read(storyProvider.notifier);
    final locale = ref.read(localeProvider);
    final childId = ref.read(selectedChildIdProvider);
    final language = locale.languageCode;

    if (widget.useSSE) {
      notifier.generateViaSSE(
        princess: widget.princess,
        language: language,
        storyType: 'daily',
        childId: childId,
      );
    } else {
      notifier.requestAndPoll(
        princess: widget.princess,
        language: language,
        storyType: 'daily',
        childId: childId,
      );
    }
  }

  void _playAudio(StoryData data) {
    final meta = princessMeta[widget.princess];
    final handler = ref.read(audioHandlerProvider);
    handler.loadAndPlay(
      data.audioUrl,
      item: MediaItem(
        id: data.audioUrl,
        title: meta?.name ?? widget.princess,
        album: 'The Royal Dispatch',
      ),
    );
  }

  void _exit() {
    ref.read(storyProvider.notifier).reset();
    ref.read(audioHandlerProvider).stop();
    context.pop();
  }

  /// Remove [ALL_CAPS] audio tags from story text for display
  String _cleanStoryText(String text) {
    return text.replaceAll(RegExp(r'\[([A-Z_]+)\]'), '').trim();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(storyProvider);
    final meta = princessMeta[widget.princess];

    // Auto-play when story becomes ready
    ref.listen<StoryState>(storyProvider, (prev, next) {
      if (next is StoryStateReady && prev is! StoryStateReady) {
        _playAudio(next.data);
      }
    });

    return Scaffold(
      body: Stack(
        children: [
          const ParticlesBackground(),
          switch (state) {
            StoryStateIdle() || StoryStateLoading() => StoryWaiting(
                princessId: widget.princess,
                statusText: l10n.appWriting(meta?.name ?? widget.princess),
              ),
            StoryStateStreaming(:final statusText) => StoryWaiting(
                princessId: widget.princess,
                statusText: statusText,
              ),
            StoryStateReady(:final data) => _buildPlayer(context, data, l10n),
            StoryStateError(:final message) => _buildError(context, message),
          },
        ],
      ),
    );
  }

  Widget _buildPlayer(
    BuildContext context,
    StoryData data,
    AppLocalizations l10n,
  ) {
    final meta = princessMeta[widget.princess];

    return Column(
      children: [
        // Princess image (top 40%)
        SizedBox(
          height: MediaQuery.of(context).size.height * 0.4,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.asset(
                princessImagePath(widget.princess),
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  color: meta?.overlayColor ?? Colors.purple.withOpacity(0.25),
                ),
              ),
              Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withOpacity(0.3),
                      Colors.transparent,
                      Colors.black.withOpacity(0.8),
                    ],
                    stops: const [0.0, 0.4, 1.0],
                  ),
                ),
              ),
              // Princess info overlay
              Positioned(
                left: 20,
                bottom: 20,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      meta?.emoji ?? '',
                      style: const TextStyle(fontSize: 28),
                    ),
                    Text(
                      meta?.name ?? widget.princess,
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    Text(
                      meta?.origin ?? '',
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.white.withOpacity(0.7),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        // Story transcript
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _cleanStoryText(data.storyText),
                  style: const TextStyle(
                    fontSize: 16,
                    height: 1.6,
                    color: Colors.white,
                  ),
                ),
                if (data.royalChallenge != null) ...[
                  const SizedBox(height: 24),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: RoyalColors.gold, width: 1),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.royalChallenge,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: RoyalColors.gold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          data.royalChallenge!,
                          style: TextStyle(
                            fontSize: 14,
                            fontStyle: FontStyle.italic,
                            color: Colors.white.withOpacity(0.9),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 120), // Space for audio controls
              ],
            ),
          ),
        ),
        // Sticky audio controls + exit
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const AudioControls(),
                const SizedBox(height: 8),
                HoldToExitButton(
                  label: l10n.holdToExit,
                  onExit: _exit,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildError(BuildContext context, String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('😔', style: TextStyle(fontSize: 48)),
            const SizedBox(height: 16),
            Text(
              message,
              style: TextStyle(
                fontSize: 16,
                color: Colors.white.withOpacity(0.8),
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            TextButton(
              onPressed: _exit,
              child: Text(
                AppLocalizations.of(context)!.goBack,
                style: const TextStyle(color: RoyalColors.gold),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd mobile && flutter analyze lib/screens/story_playback_screen.dart
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd mobile && git add lib/screens/story_playback_screen.dart
git commit -m "feat(mobile): add story playback screen with audio player and transcript"
```

---

### Task 21: Deep Link Setup

**Files:**
- Modify: `mobile/android/app/src/main/AndroidManifest.xml`
- Modify: `mobile/ios/Runner/Info.plist`

- [ ] **Step 1: Add Android deep link intent filter**

In `mobile/android/app/src/main/AndroidManifest.xml`, add inside the `<activity>` tag that has `android:name=".MainActivity"`:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="royaldispatch" android:host="pair" />
</intent-filter>
```

- [ ] **Step 2: Add iOS URL scheme**

In `mobile/ios/Runner/Info.plist`, add inside the top-level `<dict>`:

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleTypeRole</key>
        <string>Editor</string>
        <key>CFBundleURLName</key>
        <string>com.royaldispatch</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>royaldispatch</string>
        </array>
    </dict>
</array>
```

- [ ] **Step 3: Commit**

```bash
cd mobile && git add android/app/src/main/AndroidManifest.xml ios/Runner/Info.plist
git commit -m "feat(mobile): register royaldispatch:// deep link scheme for iOS and Android"
```

---

### Task 22: Final Integration & Smoke Test

**Files:**
- All files from previous tasks

- [ ] **Step 1: Run all tests**

```bash
cd mobile && flutter test
```

Expected: All tests pass

- [ ] **Step 2: Run static analysis**

```bash
cd mobile && flutter analyze
```

Expected: No issues (or only info-level)

- [ ] **Step 3: Verify build compiles (debug mode)**

```bash
cd mobile && flutter build apk --debug
```

Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit any remaining fixes**

```bash
cd mobile && git add -A && git commit -m "chore(mobile): fix any analysis warnings from integration"
```

(Skip if no changes needed)

- [ ] **Step 5: Final commit with all tasks complete**

Verify git log shows all task commits:

```bash
git log --oneline | head -20
```
