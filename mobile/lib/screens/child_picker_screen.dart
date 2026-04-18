import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/l10n/app_localizations.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/theme.dart';
import 'package:royal_dispatch/widgets/particles_background.dart';

class ChildPickerScreen extends ConsumerWidget {
  const ChildPickerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final familyAsync = ref.watch(familyProvider);

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          const ParticlesBackground(),
          SafeArea(
            child: familyAsync.when(
              loading: () => const Center(
                child: CircularProgressIndicator(
                  valueColor: AlwaysStoppedAnimation<Color>(RoyalColors.gold),
                ),
              ),
              error: (err, _) => Center(
                child: Text(
                  err.toString(),
                  style: const TextStyle(color: RoyalColors.rose),
                ),
              ),
              data: (profile) {
                final children = profile?.children ?? [];

                return Column(
                  children: [
                    const SizedBox(height: 48),
                    // Gold gradient heading
                    ShaderMask(
                      shaderCallback: (bounds) =>
                          RoyalColors.goldTextGradient.createShader(bounds),
                      child: Text(
                        l10n.pickChildHeading,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontFamily: 'Georgia',
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      l10n.pickChildSubheading,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 15,
                        color: Colors.white.withValues(alpha: 0.7),
                      ),
                    ),
                    const SizedBox(height: 48),
                    Expanded(
                      child: Center(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.symmetric(horizontal: 32),
                          child: Wrap(
                            alignment: WrapAlignment.center,
                            spacing: 24,
                            runSpacing: 24,
                            children: children.map((child) {
                              return GestureDetector(
                                onTap: () {
                                  HapticFeedback.lightImpact();
                                  selectChild(ref, child.id);
                                  context.go('/home/inbox');
                                },
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    // Avatar circle
                                    Container(
                                      width: 80,
                                      height: 80,
                                      decoration: const BoxDecoration(
                                        shape: BoxShape.circle,
                                        gradient: RoyalColors.goldGradient,
                                      ),
                                      child: Center(
                                        child: Text(
                                          child.name.isNotEmpty
                                              ? child.name[0].toUpperCase()
                                              : '?',
                                          style: const TextStyle(
                                            color: Colors.black87,
                                            fontSize: 32,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    // Child name
                                    Text(
                                      child.name,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            }).toList(),
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
