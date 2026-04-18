import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:royal_dispatch/theme.dart';

class HoldToExitButton extends StatefulWidget {
  final String label;
  final VoidCallback onExit;
  final Duration holdDuration;
  const HoldToExitButton({
    super.key,
    required this.label,
    required this.onExit,
    this.holdDuration = const Duration(seconds: 1),
  });
  @override
  State<HoldToExitButton> createState() => _HoldToExitButtonState();
}

class _HoldToExitButtonState extends State<HoldToExitButton>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.holdDuration,
    );
    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        HapticFeedback.heavyImpact();
        widget.onExit();
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPressStart: (_) {
        HapticFeedback.lightImpact();
        _controller.forward(from: 0);
      },
      onLongPressEnd: (_) {
        if (_controller.status != AnimationStatus.completed) {
          _controller.reset();
        }
      },
      child: Container(
        height: 48,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            AnimatedBuilder(
              animation: _controller,
              builder: (context, _) => FractionallySizedBox(
                widthFactor: _controller.value,
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: RoyalColors.goldGradient,
                  ),
                ),
              ),
            ),
            Center(
              child: Text(
                widget.label,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
