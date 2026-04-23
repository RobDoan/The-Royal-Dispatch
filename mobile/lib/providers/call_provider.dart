import 'package:flutter_riverpod/flutter_riverpod.dart';

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
  CallNotifier() : super(const CallState());

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

final callProvider =
    StateNotifierProvider<CallNotifier, CallState>((ref) => CallNotifier());
