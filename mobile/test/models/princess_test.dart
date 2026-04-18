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
