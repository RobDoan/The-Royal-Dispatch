import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:royal_dispatch/models/user_profile.dart';
import 'package:royal_dispatch/models/princess.dart';
import 'package:royal_dispatch/providers/auth_provider.dart';
import 'package:royal_dispatch/services/api_client.dart';

const _childIdKey = 'selected_child_id';

final sharedPrefsProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('Must be overridden at startup'),
);

final familyProvider = AsyncNotifierProvider<FamilyNotifier, UserProfile?>(FamilyNotifier.new);

class FamilyNotifier extends AsyncNotifier<UserProfile?> {
  @override
  Future<UserProfile?> build() async {
    final token = ref.watch(authProvider).value;
    if (token == null) return null;
    final dio = createApiClient(token: token);
    try {
      final response = await dio.get('/user/me');
      return UserProfile.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      return null;
    }
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
  }
}

final selectedChildIdProvider = StateProvider<String?>((ref) {
  final prefs = ref.read(sharedPrefsProvider);
  return prefs.getString(_childIdKey);
});

void selectChild(WidgetRef ref, String childId) {
  ref.read(selectedChildIdProvider.notifier).state = childId;
  ref.read(sharedPrefsProvider).setString(_childIdKey, childId);
}

void clearSelectedChild(WidgetRef ref) {
  ref.read(selectedChildIdProvider.notifier).state = null;
  ref.read(sharedPrefsProvider).remove(_childIdKey);
}

final selectedChildProvider = Provider<ChildInfo?>((ref) {
  final profile = ref.watch(familyProvider).value;
  final childId = ref.watch(selectedChildIdProvider);
  if (profile == null || childId == null) return null;
  try {
    return profile.children.firstWhere((c) => c.id == childId);
  } catch (_) {
    return null;
  }
});

final activePrincessIdsProvider = Provider<List<String>>((ref) {
  final child = ref.watch(selectedChildProvider);
  if (child == null || child.favoritePrincesses.isEmpty) {
    return princessMeta.keys.toList();
  }
  return child.favoritePrincesses;
});

/// Returns only the child's explicitly-favorite princesses, no fallback.
/// Used by the Call feature where we want empty state rather than all characters.
final selectedChildFavoritePrincessesProvider = Provider<List<String>>((ref) {
  final child = ref.watch(selectedChildProvider);
  if (child == null) return const [];
  return List<String>.from(child.favoritePrincesses);
});
