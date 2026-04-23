import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/providers/call_provider.dart';
import 'package:royal_dispatch/screens/call_contacts_screen.dart';

void main() {
  testWidgets("renders one row per favorite princess with a call button",
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          selectedChildFavoritePrincessesProvider.overrideWith((ref) => const ["belle", "elsa"]),
        ],
        child: const MaterialApp(home: CallContactsScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text("Belle"), findsOneWidget);
    expect(find.text("Elsa"), findsOneWidget);
    expect(find.byTooltip("Call Belle"), findsOneWidget);
    expect(find.byTooltip("Call Elsa"), findsOneWidget);
  });

  testWidgets("call button is disabled while call state is not idle", (tester) async {
    final container = ProviderContainer(overrides: [
      selectedChildFavoritePrincessesProvider.overrideWith((ref) => const ["belle"]),
    ]);
    container.read(callProvider.notifier).markRequesting();

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: CallContactsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    // find.byTooltip returns the Tooltip widget (inside IconButton's build tree);
    // the IconButton is an ancestor of that Tooltip.
    final button = tester.widget<IconButton>(
      find.ancestor(
        of: find.byTooltip("Call Belle"),
        matching: find.byType(IconButton),
      ),
    );
    expect(button.onPressed, isNull);
  });
}
