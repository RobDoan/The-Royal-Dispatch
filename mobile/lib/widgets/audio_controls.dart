import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:royal_dispatch/providers/audio_provider.dart';
import 'package:royal_dispatch/theme.dart';

String _formatDuration(Duration d) {
  final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
  final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
  return '$minutes:$seconds';
}

class AudioControls extends ConsumerWidget {
  const AudioControls({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final handler = ref.watch(audioHandlerProvider);
    final playing = ref.watch(audioPlayingProvider);
    final duration = ref.watch(audioDurationProvider);
    final positionAsync = ref.watch(audioPositionProvider);
    final position = positionAsync.value ?? Duration.zero;

    final totalSeconds = duration.inSeconds > 0 ? duration.inSeconds.toDouble() : 1.0;
    final currentSeconds = position.inSeconds.toDouble().clamp(0.0, totalSeconds);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Progress slider
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            activeTrackColor: RoyalColors.gold,
            inactiveTrackColor: Colors.white.withValues(alpha: 0.2),
            thumbColor: Colors.white,
            overlayColor: RoyalColors.gold.withValues(alpha: 0.2),
            trackHeight: 3,
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
          ),
          child: Slider(
            value: currentSeconds,
            min: 0,
            max: totalSeconds,
            onChanged: (value) {
              handler.seek(Duration(seconds: value.toInt()));
            },
          ),
        ),

        // Time display
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _formatDuration(position),
                style: const TextStyle(
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: Colors.white,
                ),
              ),
              Text(
                _formatDuration(duration),
                style: const TextStyle(
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 8),

        // Controls row
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Rewind 10s
            IconButton(
              icon: const Icon(Icons.replay_10_rounded, color: Colors.white, size: 36),
              onPressed: () => handler.skipToPrevious(),
            ),

            const SizedBox(width: 16),

            // Play/Pause gold gradient circle
            GestureDetector(
              onTap: () {
                if (playing) {
                  handler.pause();
                } else {
                  handler.play();
                }
              },
              child: Container(
                width: 64,
                height: 64,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RoyalColors.goldGradient,
                ),
                child: Icon(
                  playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
                  color: Colors.white,
                  size: 36,
                ),
              ),
            ),

            const SizedBox(width: 16),

            // Skip 10s
            IconButton(
              icon: const Icon(Icons.forward_10_rounded, color: Colors.white, size: 36),
              onPressed: () => handler.skipToNext(),
            ),
          ],
        ),

        const SizedBox(height: 8),
      ],
    );
  }
}
