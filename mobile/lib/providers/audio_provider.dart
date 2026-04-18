import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';
import 'package:royal_dispatch/services/audio_handler.dart';

final audioHandlerProvider = Provider<RoyalAudioHandler>(
  (ref) => throw UnimplementedError('Must be overridden after AudioService.init'),
);

class AudioState {
  final bool playing;
  final Duration position;
  final Duration duration;
  final bool buffering;
  const AudioState({this.playing = false, this.position = Duration.zero, this.duration = Duration.zero, this.buffering = false});
}

final audioStateProvider = StreamProvider<AudioState>((ref) {
  final handler = ref.watch(audioHandlerProvider);
  final player = handler.player;
  return player.playbackEventStream.map((_) {
    return AudioState(
      playing: player.playing,
      position: player.position,
      duration: player.duration ?? Duration.zero,
      buffering: player.processingState == ProcessingState.buffering,
    );
  });
});

final audioPlayingProvider = Provider<bool>((ref) {
  return ref.watch(audioStateProvider).value?.playing ?? false;
});

final audioPositionProvider = StreamProvider<Duration>((ref) {
  final handler = ref.watch(audioHandlerProvider);
  return handler.player.positionStream;
});

final audioDurationProvider = Provider<Duration>((ref) {
  return ref.watch(audioStateProvider).value?.duration ?? Duration.zero;
});
