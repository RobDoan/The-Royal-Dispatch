import 'dart:math';
import 'package:flutter/material.dart';
import 'package:royal_dispatch/models/princess.dart';

class StoryWaiting extends StatefulWidget {
  final String princessId;
  final String? statusText;

  const StoryWaiting({super.key, required this.princessId, this.statusText});

  @override
  State<StoryWaiting> createState() => _StoryWaitingState();
}

class _StoryWaitingState extends State<StoryWaiting>
    with TickerProviderStateMixin {
  late AnimationController _kenBurnsController;
  late AnimationController _dotsController;

  @override
  void initState() {
    super.initState();
    _kenBurnsController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 25),
    )..repeat(reverse: true);

    _dotsController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();
  }

  @override
  void dispose() {
    _kenBurnsController.dispose();
    _dotsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final meta = princessMeta[widget.princessId];
    final imagePath = princessImagePath(widget.princessId);

    return Stack(
      fit: StackFit.expand,
      children: [
        // Ken Burns background image
        AnimatedBuilder(
          animation: _kenBurnsController,
          builder: (context, _) {
            final scale = 1.0 + _kenBurnsController.value * 0.1;
            final translateX = (_kenBurnsController.value - 0.5) * 20;
            final translateY = (_kenBurnsController.value - 0.5) * 15;
            return Transform(
              alignment: Alignment.center,
              transform: Matrix4.identity()
                ..translateByDouble(translateX, translateY, 0, 1)
                ..scaleByDouble(scale, scale, 1, 1),
              child: Opacity(
                opacity: 0.35,
                child: Image.asset(
                  imagePath,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) =>
                      const SizedBox.shrink(),
                ),
              ),
            );
          },
        ),

        // Top gradient overlay
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          height: 200,
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withValues(alpha: 0.8),
                  Colors.transparent,
                ],
              ),
            ),
          ),
        ),

        // Bottom gradient overlay
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          height: 300,
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.bottomCenter,
                end: Alignment.topCenter,
                colors: [
                  Colors.black.withValues(alpha: 0.9),
                  Colors.transparent,
                ],
              ),
            ),
          ),
        ),

        // Center content
        Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Princess emoji with glow
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.white.withValues(alpha: 0.3),
                      blurRadius: 24,
                      spreadRadius: 4,
                    ),
                  ],
                ),
                child: Center(
                  child: Text(
                    meta?.emoji ?? '✨',
                    style: const TextStyle(fontSize: 48),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Quill icon
              const Text('✍️', style: TextStyle(fontSize: 28)),
              const SizedBox(height: 16),

              // Status text
              if (widget.statusText != null) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Text(
                    widget.statusText!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 16,
                      color: Colors.white,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                const SizedBox(height: 20),
              ],

              // Pulsing dots
              AnimatedBuilder(
                animation: _dotsController,
                builder: (context, _) {
                  return Row(
                    mainAxisSize: MainAxisSize.min,
                    children: List.generate(3, (i) {
                      final t = _dotsController.value;
                      final offset = i / 3.0;
                      final scale =
                          0.6 + 0.4 * sin((t - offset) * 2 * pi).abs();
                      return Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Transform.scale(
                          scale: scale,
                          child: Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      );
                    }),
                  );
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}
