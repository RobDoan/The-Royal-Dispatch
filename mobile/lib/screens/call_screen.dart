import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/providers/call_provider.dart';

class CallScreen extends ConsumerStatefulWidget {
  final String princess;
  const CallScreen({super.key, required this.princess});

  @override
  ConsumerState<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends ConsumerState<CallScreen> {
  Timer? _countdownTimer;
  Timer? _navTimer;
  int _remainingSeconds = 300;
  bool _muted = false;

  @override
  void initState() {
    super.initState();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() {
        _remainingSeconds = _remainingSeconds > 0 ? _remainingSeconds - 1 : 0;
      });
      if (_remainingSeconds == 0) _endCall();
    });
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _navTimer?.cancel();
    super.dispose();
  }

  void _endCall() {
    ref.read(callProvider.notifier).endCall();
  }

  void _scheduleNavHome(BuildContext context) {
    if (_navTimer != null) return; // already scheduled
    final router = GoRouter.of(context);
    _navTimer = Timer(const Duration(seconds: 2), () {
      if (!mounted) return;
      router.go('/home/call');
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(callProvider);

    if (state.status == CallStatus.error) {
      return _ErrorSceneScaffold(reason: state.error ?? CallErrorReason.unknown);
    }
    if (state.status == CallStatus.ended) {
      // Auto-return. Render the goodbye scene briefly.
      _scheduleNavHome(context);
      return const _SceneScaffold(
        imageAsset: 'assets/images/call/call-ended.png',
        semanticsLabel: 'Call ended',
      );
    }

    final mm = (_remainingSeconds ~/ 60).toString().padLeft(1, '0');
    final ss = (_remainingSeconds % 60).toString().padLeft(2, '0');

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(
            'assets/images/call/call-in-progress-${widget.princess}.png',
            fit: BoxFit.cover,
            semanticLabel: 'Calling ${widget.princess}',
            errorBuilder: (context, error, _) => Container(color: Colors.deepPurple),
          ),
          Positioned(
            bottom: 40,
            left: 0,
            right: 0,
            child: Column(children: [
              Text(
                '$mm:$ss',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 24),
              Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                IconButton(
                  iconSize: 56,
                  tooltip: _muted ? 'Unmute' : 'Mute',
                  icon: Icon(_muted ? Icons.mic_off : Icons.mic, color: Colors.white),
                  onPressed: () {
                    final newMuted = !_muted;
                    ref.read(callProvider.notifier).setMuted(newMuted);
                    setState(() => _muted = newMuted);
                  },
                ),
                IconButton(
                  iconSize: 64,
                  tooltip: 'End call',
                  icon: const Icon(Icons.call_end, color: Colors.redAccent),
                  onPressed: _endCall,
                ),
                IconButton(
                  iconSize: 56,
                  tooltip: 'Volume',
                  icon: const Icon(Icons.volume_up, color: Colors.white),
                  onPressed: () {},
                ),
              ]),
            ]),
          ),
        ],
      ),
    );
  }
}

class _SceneScaffold extends StatelessWidget {
  final String imageAsset;
  final String semanticsLabel;
  const _SceneScaffold({required this.imageAsset, required this.semanticsLabel});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Image.asset(
          imageAsset,
          fit: BoxFit.cover,
          semanticLabel: semanticsLabel,
          errorBuilder: (ctx, error, _) => Container(color: Colors.deepPurple),
        ),
      ),
    );
  }
}

class _ErrorSceneScaffold extends StatelessWidget {
  final CallErrorReason reason;
  const _ErrorSceneScaffold({required this.reason});

  @override
  Widget build(BuildContext context) {
    final (asset, label) = switch (reason) {
      CallErrorReason.micDenied => (
        'assets/images/call/call-mic-permission.png',
        'Microphone permission needed',
      ),
      CallErrorReason.dailyCap => (
        'assets/images/call/call-daily-cap.png',
        'You have called three times today',
      ),
      CallErrorReason.network || CallErrorReason.upstreamUnavailable => (
        'assets/images/call/call-friends-sleeping.png',
        'Your friends are sleeping',
      ),
      CallErrorReason.dropped => (
        'assets/images/call/call-dropped.png',
        'Call disconnected',
      ),
      _ => (
        'assets/images/call/call-friends-sleeping.png',
        'Something went wrong',
      ),
    };
    return _SceneScaffold(imageAsset: asset, semanticsLabel: label);
  }
}
