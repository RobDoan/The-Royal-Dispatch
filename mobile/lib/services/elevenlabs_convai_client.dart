import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:record/record.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

enum ConvaiConnectionEvent { connected, disconnected, error }

class ElevenLabsConvaiClient {
  final String signedUrl;
  final void Function(ConvaiConnectionEvent event, {String? detail}) onEvent;
  final void Function(Uint8List audioBytes) onAgentAudio;

  WebSocketChannel? _channel;
  final AudioRecorder _recorder = AudioRecorder();
  StreamSubscription<Uint8List>? _micSub;
  bool _muted = false;

  ElevenLabsConvaiClient({
    required this.signedUrl,
    required this.onEvent,
    required this.onAgentAudio,
  });

  Future<void> connect() async {
    try {
      _channel = WebSocketChannel.connect(Uri.parse(signedUrl));
      _channel!.stream.listen(
        _handleMessage,
        onError: (e) => onEvent(ConvaiConnectionEvent.error, detail: e.toString()),
        onDone: () => onEvent(ConvaiConnectionEvent.disconnected),
      );
      onEvent(ConvaiConnectionEvent.connected);
      await _startMicStream();
    } catch (e) {
      onEvent(ConvaiConnectionEvent.error, detail: e.toString());
      rethrow;
    }
  }

  Future<void> _startMicStream() async {
    if (!await _recorder.hasPermission()) {
      // Should never happen: caller is expected to request permission before connect().
      throw StateError("Microphone permission not granted at recorder level");
    }
    final stream = await _recorder.startStream(const RecordConfig(
      encoder: AudioEncoder.pcm16bits,
      sampleRate: 16000,
      numChannels: 1,
    ));
    _micSub = stream.listen((chunk) {
      if (_channel == null || _muted) return;
      _channel!.sink.add(jsonEncode({
        "user_audio_chunk": base64Encode(chunk),
      }));
    });
  }

  void _handleMessage(dynamic message) {
    if (message is! String) return;
    try {
      final decoded = jsonDecode(message) as Map<String, dynamic>;
      final type = decoded["type"];
      if (type == "audio") {
        final b64 = decoded["audio_event"]?["audio_base_64"] as String?;
        if (b64 != null) {
          onAgentAudio(base64Decode(b64));
        }
      }
      // Other message types (agent_response, interruption) can be surfaced later as needed.
    } catch (_) {
      // Ignore malformed frames.
    }
  }

  void setMuted(bool muted) {
    _muted = muted;
  }

  Future<void> close() async {
    await _micSub?.cancel();
    await _recorder.stop();
    await _channel?.sink.close();
    _channel = null;
  }
}
