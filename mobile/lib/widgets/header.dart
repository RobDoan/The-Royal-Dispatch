import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/theme.dart';
import 'package:royal_dispatch/widgets/glass_card.dart';
import 'package:royal_dispatch/widgets/language_toggle.dart';

class Header extends ConsumerWidget {
  const Header({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final child = ref.watch(selectedChildProvider);
    final initial = child?.name.isNotEmpty == true ? child!.name[0].toUpperCase() : '?';

    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: GlassCard(
          variant: GlassVariant.header, borderRadius: 20,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(children: [
            Expanded(
              child: ShaderMask(
                shaderCallback: (bounds) => RoyalColors.goldTextGradient.createShader(bounds),
                child: const Text('The Royal Dispatch', style: TextStyle(fontFamily: 'Georgia', fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
              ),
            ),
            const LanguageToggle(),
            const SizedBox(width: 12),
            GestureDetector(
              onTap: () => context.go('/pick-child'),
              child: Container(
                width: 36, height: 36,
                decoration: const BoxDecoration(shape: BoxShape.circle, gradient: RoyalColors.goldGradient),
                child: Center(child: Text(initial, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.black))),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}
