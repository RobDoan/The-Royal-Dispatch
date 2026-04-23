import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/providers/call_provider.dart';
import 'package:royal_dispatch/screens/call_screen.dart';

void main() {
  testWidgets("end button transitions state to ending", (tester) async {
    final container = ProviderContainer();
    container.read(callProvider.notifier).markConnecting(
          princess: "belle",
          maxDurationSeconds: 300,
        );
    container.read(callProvider.notifier).markInCall();

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: CallScreen(princess: "belle")),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip("End call"));
    await tester.pumpAndSettle();

    expect(container.read(callProvider).status, CallStatus.ending);
  });

  testWidgets("mute button toggles its icon/tooltip", (tester) async {
    final container = ProviderContainer();
    container.read(callProvider.notifier).markConnecting(
          princess: "belle",
          maxDurationSeconds: 300,
        );
    container.read(callProvider.notifier).markInCall();

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: CallScreen(princess: "belle")),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byTooltip("Mute"), findsOneWidget);
    await tester.tap(find.byTooltip("Mute"));
    await tester.pumpAndSettle();
    expect(find.byTooltip("Unmute"), findsOneWidget);
  });
}
