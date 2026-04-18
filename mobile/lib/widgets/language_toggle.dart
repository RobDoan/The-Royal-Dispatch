import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:royal_dispatch/providers/locale_provider.dart';
import 'package:royal_dispatch/theme.dart';

class LanguageToggle extends ConsumerWidget {
  const LanguageToggle({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    final isEn = locale.languageCode == 'en';

    return GestureDetector(
      onTap: () { HapticFeedback.lightImpact(); ref.read(localeProvider.notifier).toggle(); },
      child: Container(
        width: 80, height: 40,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        ),
        child: Stack(children: [
          AnimatedPositioned(
            duration: const Duration(milliseconds: 300), curve: Curves.easeOutBack,
            left: isEn ? 2 : 40, top: 2,
            child: Container(width: 36, height: 36, decoration: const BoxDecoration(shape: BoxShape.circle, gradient: RoyalColors.goldGradient)),
          ),
          Row(children: [
            Expanded(child: Center(child: Text('🇬🇧', style: TextStyle(fontSize: isEn ? 18 : 14, color: isEn ? null : Colors.white.withValues(alpha: 0.5))))),
            Expanded(child: Center(child: Text('🇻🇳', style: TextStyle(fontSize: isEn ? 14 : 18, color: isEn ? Colors.white.withValues(alpha: 0.5) : null)))),
          ]),
        ]),
      ),
    );
  }
}
