class StoryData {
  final String storyText;
  final String? royalChallenge;
  final String audioUrl;

  const StoryData({required this.storyText, required this.royalChallenge, required this.audioUrl});

  factory StoryData.fromJson(Map<String, dynamic> json) {
    return StoryData(
      storyText: json['story_text'] as String,
      royalChallenge: json['royal_challenge'] as String?,
      audioUrl: json['audio_url'] as String,
    );
  }
}

sealed class StoryState {
  const StoryState();
  const factory StoryState.idle() = StoryStateIdle;
  const factory StoryState.loading() = StoryStateLoading;
  const factory StoryState.streaming(String statusText) = StoryStateStreaming;
  factory StoryState.ready(StoryData data) = StoryStateReady;
  const factory StoryState.error(String message) = StoryStateError;
}

class StoryStateIdle extends StoryState { const StoryStateIdle(); }
class StoryStateLoading extends StoryState { const StoryStateLoading(); }
class StoryStateStreaming extends StoryState {
  final String statusText;
  const StoryStateStreaming(this.statusText);
}
class StoryStateReady extends StoryState {
  final StoryData data;
  StoryStateReady(this.data);
}
class StoryStateError extends StoryState {
  final String message;
  const StoryStateError(this.message);
}
