import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/models/user_profile.dart';

void main() {
  test('UserProfile.fromJson parses correctly', () {
    final json = {
      'user_id': 'abc-123', 'name': 'Dad',
      'children': [{'id': 'child-1', 'name': 'Emma', 'preferences': {'favorite_princesses': ['elsa', 'belle']}}],
    };
    final profile = UserProfile.fromJson(json);
    expect(profile.userId, 'abc-123');
    expect(profile.name, 'Dad');
    expect(profile.children.length, 1);
    expect(profile.children[0].name, 'Emma');
    expect(profile.children[0].favoritePrincesses, ['elsa', 'belle']);
  });

  test('ChildInfo with no favorites returns empty list', () {
    final json = {'id': 'child-2', 'name': 'Lily', 'preferences': {}};
    final child = ChildInfo.fromJson(json);
    expect(child.favoritePrincesses, isEmpty);
  });

  test('UserProfile.fromJson handles null user_id and name', () {
    final json = {'user_id': null, 'name': null, 'children': []};
    final profile = UserProfile.fromJson(json);
    expect(profile.userId, isNull);
    expect(profile.name, isNull);
    expect(profile.children, isEmpty);
  });
}
