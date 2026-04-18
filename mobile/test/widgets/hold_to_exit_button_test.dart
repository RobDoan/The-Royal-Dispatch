import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/widgets/hold_to_exit_button.dart';

void main() {
  testWidgets('HoldToExitButton renders label', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HoldToExitButton(label: 'Hold to Exit', onExit: () {}),
      ),
    ));
    expect(find.text('Hold to Exit'), findsOneWidget);
  });

  testWidgets('HoldToExitButton does NOT fire on short tap', (tester) async {
    var exited = false;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HoldToExitButton(
          label: 'Hold to Exit',
          onExit: () => exited = true,
        ),
      ),
    ));
    await tester.tap(find.byType(HoldToExitButton));
    await tester.pump(const Duration(milliseconds: 500));
    expect(exited, false);
  });
}
