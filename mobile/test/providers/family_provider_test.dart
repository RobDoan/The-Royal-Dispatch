import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:royal_dispatch/providers/family_provider.dart' as fp;
import 'package:royal_dispatch/models/user_profile.dart';

// Stub notifier that returns fixed data without hitting the network
class _StubFamilyNotifier extends fp.FamilyNotifier {
  final UserProfile? _profile;
  _StubFamilyNotifier(this._profile);

  @override
  Future<UserProfile?> build() async => _profile;
}

void main() {
  test('selectedChildIdProvider reads from SharedPreferences', () async {
    SharedPreferences.setMockInitialValues({'selected_child_id': 'child-1'});
    final prefs = await SharedPreferences.getInstance();
    final container = ProviderContainer(overrides: [
      fp.sharedPrefsProvider.overrideWithValue(prefs),
    ]);
    addTearDown(container.dispose);
    final childId = container.read(fp.selectedChildIdProvider);
    expect(childId, 'child-1');
  });

  test('activePrincessIdsProvider returns favorites when child has them', () async {
    SharedPreferences.setMockInitialValues({'selected_child_id': 'child-1'});
    final prefs = await SharedPreferences.getInstance();
    final profile = UserProfile(userId: 'user-1', name: 'Dad', children: [
      ChildInfo(id: 'child-1', name: 'Emma', favoritePrincesses: ['elsa', 'belle']),
    ]);
    final container = ProviderContainer(overrides: [
      fp.sharedPrefsProvider.overrideWithValue(prefs),
      fp.familyProvider.overrideWith(() => _StubFamilyNotifier(profile)),
    ]);
    addTearDown(container.dispose);
    await container.read(fp.familyProvider.future);
    final ids = container.read(fp.activePrincessIdsProvider);
    expect(ids, ['elsa', 'belle']);
  });

  test('activePrincessIdsProvider returns all when child has no favorites', () async {
    SharedPreferences.setMockInitialValues({'selected_child_id': 'child-1'});
    final prefs = await SharedPreferences.getInstance();
    final profile = UserProfile(userId: 'user-1', name: 'Dad', children: [
      ChildInfo(id: 'child-1', name: 'Emma', favoritePrincesses: []),
    ]);
    final container = ProviderContainer(overrides: [
      fp.sharedPrefsProvider.overrideWithValue(prefs),
      fp.familyProvider.overrideWith(() => _StubFamilyNotifier(profile)),
    ]);
    addTearDown(container.dispose);
    await container.read(fp.familyProvider.future);
    final ids = container.read(fp.activePrincessIdsProvider);
    expect(ids.length, 12);
  });
}
