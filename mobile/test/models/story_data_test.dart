import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/models/story_data.dart';

void main() {
  test('StoryState.idle is default', () {
    const state = StoryState.idle();
    expect(state, isA<StoryStateIdle>());
  });

  test('StoryState.ready holds StoryData', () {
    const data = StoryData(storyText: 'Once upon a time...', royalChallenge: 'Be brave today', audioUrl: 'https://example.com/audio.mp3');
    final state = StoryState.ready(data);
    expect(state, isA<StoryStateReady>());
    expect((state as StoryStateReady).data.storyText, 'Once upon a time...');
  });

  test('StoryData.fromJson parses backend response', () {
    final json = {'story_text': 'Hello dear child...', 'royal_challenge': 'Try something new', 'audio_url': 'https://s3.example.com/audio.mp3'};
    final data = StoryData.fromJson(json);
    expect(data.storyText, 'Hello dear child...');
    expect(data.royalChallenge, 'Try something new');
    expect(data.audioUrl, 'https://s3.example.com/audio.mp3');
  });

  test('StoryData.fromJson handles null royal_challenge', () {
    final json = {'story_text': 'A story', 'royal_challenge': null, 'audio_url': 'https://s3.example.com/a.mp3'};
    final data = StoryData.fromJson(json);
    expect(data.royalChallenge, isNull);
  });
}
