import 'dart:typed_data';
import 'package:mp_audio_stream/mp_audio_stream.dart';

/// Thin wrapper around mp_audio_stream for playing streaming 16-bit PCM audio.
/// ElevenLabs Convai sends PCM 16kHz mono by default.
class PcmAudioSink {
  final int sampleRate;
  final int channels;
  AudioStream? _stream;

  PcmAudioSink({this.sampleRate = 16000, this.channels = 1});

  Future<void> start() async {
    _stream = getAudioStream();
    _stream!.init(
      bufferMilliSec: 3000,
      waitingBufferMilliSec: 100,
      channels: channels,
      sampleRate: sampleRate,
    );
    _stream!.resume();
  }

  /// Push raw PCM16 little-endian bytes. Converts to Float32List that the
  /// underlying package expects (values normalised to [-1.0, 1.0]).
  void push(Uint8List pcm16LE) {
    if (_stream == null) return;
    final byteData = ByteData.sublistView(pcm16LE);
    final sampleCount = pcm16LE.lengthInBytes ~/ 2;
    final floats = Float32List(sampleCount);
    for (int i = 0; i < sampleCount; i++) {
      final sample = byteData.getInt16(i * 2, Endian.little);
      floats[i] = sample / 32768.0;
    }
    _stream!.push(floats);
  }

  Future<void> stop() async {
    _stream?.uninit();
    _stream = null;
  }
}
