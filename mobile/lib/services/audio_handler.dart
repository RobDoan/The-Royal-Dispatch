import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart';

class RoyalAudioHandler extends BaseAudioHandler with SeekHandler {
  final AudioPlayer _player = AudioPlayer();

  RoyalAudioHandler() {
    _player.playbackEventStream.listen((event) {
      playbackState.add(_transformEvent(event));
    });
    _player.processingStateStream.listen((state) {
      if (state == ProcessingState.completed) { stop(); }
    });
  }

  AudioPlayer get player => _player;

  @override
  Future<void> play() => _player.play();
  @override
  Future<void> pause() => _player.pause();
  @override
  Future<void> seek(Duration position) => _player.seek(position);
  @override
  Future<void> stop() async { await _player.stop(); return super.stop(); }

  @override
  Future<void> skipToNext() async {
    final pos = _player.position + const Duration(seconds: 10);
    final dur = _player.duration ?? Duration.zero;
    await _player.seek(pos > dur ? dur : pos);
  }

  @override
  Future<void> skipToPrevious() async {
    final pos = _player.position - const Duration(seconds: 10);
    await _player.seek(pos < Duration.zero ? Duration.zero : pos);
  }

  Future<void> loadAndPlay(String url, {required MediaItem item}) async {
    mediaItem.add(item);
    await _player.setUrl(url);
    await _player.play();
  }

  PlaybackState _transformEvent(PlaybackEvent event) {
    return PlaybackState(
      controls: [
        MediaControl.skipToPrevious,
        _player.playing ? MediaControl.pause : MediaControl.play,
        MediaControl.skipToNext,
      ],
      systemActions: const { MediaAction.seek },
      androidCompactActionIndices: const [0, 1, 2],
      processingState: switch (_player.processingState) {
        ProcessingState.idle => AudioProcessingState.idle,
        ProcessingState.loading => AudioProcessingState.loading,
        ProcessingState.buffering => AudioProcessingState.buffering,
        ProcessingState.ready => AudioProcessingState.ready,
        ProcessingState.completed => AudioProcessingState.completed,
      },
      playing: _player.playing,
      updatePosition: _player.position,
      bufferedPosition: _player.bufferedPosition,
      speed: _player.speed,
    );
  }
}
