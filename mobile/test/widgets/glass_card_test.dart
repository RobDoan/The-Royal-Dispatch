import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/widgets/glass_card.dart';

void main() {
  testWidgets('GlassCard renders child content', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Stack(children: [
            Container(color: Colors.black),
            const GlassCard(child: Text('Hello')),
          ]),
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
          body: Stack(children: [
            Container(color: Colors.black),
            const GlassCard(borderRadius: 20, child: Text('Rounded')),
          ]),
        ),
      ),
    );
    final clipRRect = tester.widget<ClipRRect>(find.byType(ClipRRect));
    expect(clipRRect.borderRadius, BorderRadius.circular(20));
  });
}
