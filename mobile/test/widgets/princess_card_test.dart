import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/widgets/princess_card.dart';

void main() {
  testWidgets('PrincessCard displays princess name and emoji', (tester) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: PrincessCard(princessId: 'elsa', onTap: () {}))));
    expect(find.text('Queen Elsa'), findsOneWidget);
    expect(find.text('❄️'), findsOneWidget);
    expect(find.text('Kingdom of Arendelle'), findsOneWidget);
  });

  testWidgets('PrincessCard calls onTap when pressed', (tester) async {
    var tapped = false;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: PrincessCard(princessId: 'belle', onTap: () => tapped = true))));
    await tester.tap(find.byType(PrincessCard));
    expect(tapped, true);
  });
}
