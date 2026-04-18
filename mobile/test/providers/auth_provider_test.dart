import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:royal_dispatch/providers/auth_provider.dart';

class MockSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late MockSecureStorage mockStorage;

  setUp(() {
    mockStorage = MockSecureStorage();
  });

  test('initial state reads token from secure storage', () async {
    when(() => mockStorage.read(key: 'royal_token')).thenAnswer((_) async => 'saved-token');
    final container = ProviderContainer(overrides: [secureStorageProvider.overrideWithValue(mockStorage)]);
    addTearDown(container.dispose);
    await container.read(authProvider.future);
    final token = container.read(authProvider).value;
    expect(token, 'saved-token');
  });

  test('pair() stores token and updates state', () async {
    when(() => mockStorage.read(key: 'royal_token')).thenAnswer((_) async => null);
    when(() => mockStorage.write(key: 'royal_token', value: 'new-token')).thenAnswer((_) async {});
    final container = ProviderContainer(overrides: [secureStorageProvider.overrideWithValue(mockStorage)]);
    addTearDown(container.dispose);
    await container.read(authProvider.future);
    await container.read(authProvider.notifier).pair('new-token');
    final token = container.read(authProvider).value;
    expect(token, 'new-token');
    verify(() => mockStorage.write(key: 'royal_token', value: 'new-token')).called(1);
  });

  test('unpair() clears token', () async {
    when(() => mockStorage.read(key: 'royal_token')).thenAnswer((_) async => 'existing');
    when(() => mockStorage.delete(key: 'royal_token')).thenAnswer((_) async {});
    final container = ProviderContainer(overrides: [secureStorageProvider.overrideWithValue(mockStorage)]);
    addTearDown(container.dispose);
    await container.read(authProvider.future);
    await container.read(authProvider.notifier).unpair();
    final token = container.read(authProvider).value;
    expect(token, isNull);
  });
}
