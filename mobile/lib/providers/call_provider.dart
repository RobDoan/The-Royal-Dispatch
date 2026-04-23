import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:royal_dispatch/services/call_api.dart';
import 'package:royal_dispatch/services/elevenlabs_convai_client.dart';
import 'package:royal_dispatch/services/pcm_audio_sink.dart';
import 'package:royal_dispatch/providers/auth_provider.dart';

enum CallStatus { idle, requesting, connecting, inCall, ending, ended, error }

enum CallErrorReason {
  micDenied,
  dailyCap,
  princessNotFavorite,
  network,
  dropped,
  upstreamUnavailable,
  unknown,
}

class CallState {
  final CallStatus status;
  final String? princess;
  final int? maxDurationSeconds;
  final CallErrorReason? error;

  const CallState({
    this.status = CallStatus.idle,
    this.princess,
    this.maxDurationSeconds,
    this.error,
  });

  CallState copy({
    CallStatus? status,
    String? princess,
    int? maxDurationSeconds,
    CallErrorReason? error,
  }) =>
      CallState(
        status: status ?? this.status,
        princess: princess ?? this.princess,
        maxDurationSeconds: maxDurationSeconds ?? this.maxDurationSeconds,
        error: error ?? this.error,
      );
}

class CallNotifier extends StateNotifier<CallState> {
  CallNotifier(this._api) : super(const CallState());

  final CallApi _api;
  ElevenLabsConvaiClient? _client;
  PcmAudioSink? _audioSink;

  Future<void> startCall({
    required String childId,
    required String princess,
    required String locale,
  }) async {
    markRequesting();

    // 1. Ensure mic permission before hitting the backend.
    final micStatus = await Permission.microphone.request();
    if (!micStatus.isGranted) {
      markError(CallErrorReason.micDenied);
      return;
    }

    try {
      final result = await _api.start(
        childId: childId,
        princess: princess,
        locale: locale,
      );
      markConnecting(
        princess: princess,
        maxDurationSeconds: result.maxDurationSeconds,
      );
      _audioSink = PcmAudioSink();
      await _audioSink!.start();
      _client = ElevenLabsConvaiClient(
        signedUrl: result.signedUrl,
        onEvent: (event, {detail}) {
          if (event == ConvaiConnectionEvent.connected) markInCall();
          if (event == ConvaiConnectionEvent.disconnected && state.status == CallStatus.inCall) {
            markError(CallErrorReason.dropped);
          }
          if (event == ConvaiConnectionEvent.error) markError(CallErrorReason.network);
        },
        onAgentAudio: (bytes) => _audioSink?.push(bytes),
      );
      await _client!.connect();
    } on CallStartError catch (e) {
      markError(switch (e.reason) {
        CallStartReason.dailyCapReached => CallErrorReason.dailyCap,
        CallStartReason.princessNotFavorite => CallErrorReason.princessNotFavorite,
        CallStartReason.upstreamUnavailable => CallErrorReason.upstreamUnavailable,
        _ => CallErrorReason.unknown,
      });
    } catch (_) {
      markError(CallErrorReason.network);
    }
  }

  void setMuted(bool muted) {
    _client?.setMuted(muted);
  }

  Future<void> endCall() async {
    markEnding();
    await _client?.close();
    _client = null;
    await _audioSink?.stop();
    _audioSink = null;
    markEnded();
  }

  // Keep the existing mark* methods below ↓

  void markRequesting() => state = state.copy(status: CallStatus.requesting, error: null);

  void markConnecting({required String princess, required int maxDurationSeconds}) =>
      state = state.copy(
        status: CallStatus.connecting,
        princess: princess,
        maxDurationSeconds: maxDurationSeconds,
      );

  void markInCall() => state = state.copy(status: CallStatus.inCall);

  void markEnding() => state = state.copy(status: CallStatus.ending);

  void markEnded() => state = state.copy(status: CallStatus.ended);

  void markError(CallErrorReason reason) =>
      state = state.copy(status: CallStatus.error, error: reason);

  void reset() => state = const CallState();
}

final callApiProvider = Provider<CallApi>((ref) {
  final token = ref.watch(authProvider).value ?? '';
  const baseUrl = String.fromEnvironment('BACKEND_URL', defaultValue: 'http://localhost:8000');
  return CallApi(baseUrl: baseUrl, token: token);
});

final callProvider = StateNotifierProvider<CallNotifier, CallState>((ref) {
  return CallNotifier(ref.watch(callApiProvider));
});
