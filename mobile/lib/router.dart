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
import 'package:royal_dispatch/screens/call_contacts_screen.dart';
import 'package:royal_dispatch/screens/call_screen.dart';
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
      GoRoute(path: '/pair', builder: (context, state) => const PairingScreen()),
      GoRoute(path: '/pick-child', builder: (context, state) => const ChildPickerScreen()),
      ShellRoute(
        builder: (context, state, child) {
          return Scaffold(
            body: Stack(children: [
              const ParticlesBackground(),
              Column(children: [const Header(), Expanded(child: child)]),
              const Positioned(left: 0, right: 0, bottom: 0, child: BottomNav()),
            ]),
          );
        },
        routes: [
          GoRoute(path: '/home/inbox', builder: (context, state) => const InboxScreen()),
          GoRoute(path: '/home/story', builder: (context, state) => const StoryRequestScreen()),
          GoRoute(
            path: '/home/call',
            builder: (context, state) => const CallContactsScreen(),
          ),
        ],
      ),
      GoRoute(
        path: '/call/:princess',
        builder: (context, state) => CallScreen(
          princess: state.pathParameters['princess']!,
        ),
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
