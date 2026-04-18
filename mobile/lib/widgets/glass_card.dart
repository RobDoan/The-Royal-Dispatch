import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:royal_dispatch/theme.dart';

class GlassCard extends StatelessWidget {
  final Widget child;
  final GlassVariant variant;
  final double borderRadius;
  final EdgeInsetsGeometry? padding;

  const GlassCard({super.key, required this.child, this.variant = GlassVariant.card, this.borderRadius = 16, this.padding});

  @override
  Widget build(BuildContext context) {
    final style = GlassStyle.fromVariant(variant);
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: style.blur, sigmaY: style.blur),
        child: Container(
          decoration: BoxDecoration(
            color: style.background,
            borderRadius: BorderRadius.circular(borderRadius),
            border: Border.all(color: style.borderColor, width: 1),
          ),
          padding: padding,
          child: child,
        ),
      ),
    );
  }
}
