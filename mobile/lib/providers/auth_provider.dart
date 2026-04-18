import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _tokenKey = 'royal_token';

final secureStorageProvider = Provider<FlutterSecureStorage>((ref) => const FlutterSecureStorage());

final authProvider = AsyncNotifierProvider<AuthNotifier, String?>(AuthNotifier.new);

class AuthNotifier extends AsyncNotifier<String?> {
  @override
  Future<String?> build() async {
    final storage = ref.read(secureStorageProvider);
    return await storage.read(key: _tokenKey);
  }

  Future<void> pair(String token) async {
    final storage = ref.read(secureStorageProvider);
    await storage.write(key: _tokenKey, value: token);
    state = AsyncData(token);
  }

  Future<void> unpair() async {
    final storage = ref.read(secureStorageProvider);
    await storage.delete(key: _tokenKey);
    state = const AsyncData(null);
  }
}
