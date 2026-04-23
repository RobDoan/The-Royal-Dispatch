import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/providers/call_provider.dart';
import 'package:royal_dispatch/services/call_api.dart';
import 'package:royal_dispatch/screens/call_screen.dart';

Widget _buildHome(BuildContext ctx, GoRouterState s, Widget home) => home;

GoRouter _testRouter(Widget home) => GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (ctx, s) => _buildHome(ctx, s, home),
        ),
        GoRoute(
          path: '/home/call',
          builder: (ctx, s) => const Scaffold(body: Text('call tab')),
        ),
      ],
    );

ProviderContainer _makeContainer() {
  return ProviderContainer(overrides: [
    callApiProvider.overrideWithValue(
      CallApi(baseUrl: "http://t", token: "tok"),
    ),
  ]);
}

void main() {
  testWidgets("end button transitions state to ended", (tester) async {
    final container = _makeContainer();
    container.read(callProvider.notifier).markConnecting(
          princess: "belle",
          maxDurationSeconds: 300,
        );
    container.read(callProvider.notifier).markInCall();

    const screen = CallScreen(princess: "belle");
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(routerConfig: _testRouter(screen)),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip("End call"));
    await tester.pump();

    // endCall() closes the null client synchronously: ending → ended
    expect(container.read(callProvider).status, CallStatus.ended);

    // Drain the 2-second auto-navigate timer that fires in the "ended" scene.
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets("mute button toggles its icon/tooltip", (tester) async {
    final container = _makeContainer();
    container.read(callProvider.notifier).markConnecting(
          princess: "belle",
          maxDurationSeconds: 300,
        );
    container.read(callProvider.notifier).markInCall();

    const screen = CallScreen(princess: "belle");
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(routerConfig: _testRouter(screen)),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byTooltip("Mute"), findsOneWidget);
    await tester.tap(find.byTooltip("Mute"));
    await tester.pumpAndSettle();
    expect(find.byTooltip("Unmute"), findsOneWidget);
  });
}
