import 'dart:math';
import 'package:flutter/material.dart';
import 'package:royal_dispatch/theme.dart';

class _Particle {
  double x, y, vx, vy, size, opacity;
  Color color;
  _Particle({required this.x, required this.y, required this.vx, required this.vy, required this.size, required this.opacity, required this.color});
}

class ParticlesBackground extends StatefulWidget {
  const ParticlesBackground({super.key});
  @override
  State<ParticlesBackground> createState() => _ParticlesBackgroundState();
}

class _ParticlesBackgroundState extends State<ParticlesBackground> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late List<_Particle> _particles;
  final _random = Random(42);
  static const _colors = [RoyalColors.gold, Colors.white, RoyalColors.sky, RoyalColors.rose];

  @override
  void initState() {
    super.initState();
    _particles = List.generate(30, (_) => _createParticle());
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 1))
      ..addListener(_updateParticles)
      ..repeat();
  }

  _Particle _createParticle() => _Particle(
    x: _random.nextDouble(), y: _random.nextDouble(),
    vx: (_random.nextDouble() - 0.5) * 0.001, vy: (_random.nextDouble() - 0.5) * 0.001,
    size: 2 + _random.nextDouble() * 3, opacity: 0.1 + _random.nextDouble() * 0.6,
    color: _colors[_random.nextInt(_colors.length)],
  );

  void _updateParticles() {
    for (final p in _particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > 1) p.vx = -p.vx;
      if (p.y < 0 || p.y > 1) p.vy = -p.vy;
    }
    setState(() {});
  }

  @override
  void dispose() { _controller.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Container(
    decoration: const BoxDecoration(gradient: RoyalColors.backgroundGradient),
    child: CustomPaint(painter: _ParticlesPainter(_particles), size: Size.infinite),
  );
}

class _ParticlesPainter extends CustomPainter {
  final List<_Particle> particles;
  _ParticlesPainter(this.particles);

  @override
  void paint(Canvas canvas, Size size) {
    for (final p in particles) {
      canvas.drawCircle(
        Offset(p.x * size.width, p.y * size.height), p.size,
        Paint()..color = p.color.withValues(alpha: p.opacity)..style = PaintingStyle.fill,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ParticlesPainter oldDelegate) => true;
}
