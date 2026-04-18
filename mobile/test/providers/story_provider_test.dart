import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:royal_dispatch/providers/story_provider.dart';
import 'package:royal_dispatch/models/story_data.dart';

void main() {
  test('initial state is idle', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final state = container.read(storyProvider);
    expect(state, isA<StoryStateIdle>());
  });

  test('reset returns to idle from any state', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(storyProvider.notifier);
    notifier.setLoading();
    expect(container.read(storyProvider), isA<StoryStateLoading>());
    notifier.reset();
    expect(container.read(storyProvider), isA<StoryStateIdle>());
  });

  test('state transitions: loading -> streaming -> ready', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(storyProvider.notifier);
    notifier.setLoading();
    expect(container.read(storyProvider), isA<StoryStateLoading>());
    notifier.setStreaming('Generating...');
    final streaming = container.read(storyProvider) as StoryStateStreaming;
    expect(streaming.statusText, 'Generating...');
    notifier.setReady(StoryData(storyText: 'Hello', royalChallenge: null, audioUrl: 'http://x.mp3'));
    final ready = container.read(storyProvider) as StoryStateReady;
    expect(ready.data.storyText, 'Hello');
  });

  test('setError transitions to error state', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(storyProvider.notifier);
    notifier.setError('Something failed');
    final state = container.read(storyProvider) as StoryStateError;
    expect(state.message, 'Something failed');
  });
}
