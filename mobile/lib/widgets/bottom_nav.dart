import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/widgets/glass_card.dart';
import 'package:royal_dispatch/theme.dart';

class BottomNav extends StatelessWidget {
  const BottomNav({super.key});

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final isInbox = location == '/home/inbox';
    final isStory = location == '/home/story';
    final isCall = location == '/home/call';

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
        child: GlassCard(
          variant: GlassVariant.nav, borderRadius: 28,
          child: SizedBox(
            height: 80,
            child: Row(children: [
              _NavTab(
                iconAsset: 'assets/icons/inbox-3d.png',
                label: 'Inbox',
                isActive: isInbox,
                onTap: () { HapticFeedback.lightImpact(); context.go('/home/inbox'); },
              ),
              _NavTab(
                iconAsset: 'assets/icons/story-3d.png',
                label: 'Story',
                isActive: isStory,
                onTap: () { HapticFeedback.lightImpact(); context.go('/home/story'); },
              ),
              _NavTab(
                iconAsset: 'assets/icons/call-3d.png',
                label: 'Call',
                isActive: isCall,
                onTap: () { HapticFeedback.lightImpact(); context.go('/home/call'); },
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _NavTab extends StatelessWidget {
  final String iconAsset;
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  const _NavTab({required this.iconAsset, required this.label, required this.isActive, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap, behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          decoration: isActive ? BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 4, offset: const Offset(0, 2))],
          ) : null,
          child: AnimatedScale(
            scale: isActive ? 0.95 : 1.0, duration: const Duration(milliseconds: 200),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              AnimatedOpacity(
                opacity: isActive ? 1.0 : 0.5, duration: const Duration(milliseconds: 200),
                child: Image.asset(iconAsset, width: 36, height: 36),
              ),
              const SizedBox(height: 4),
              Text(label, style: TextStyle(fontSize: 12, fontWeight: isActive ? FontWeight.w700 : FontWeight.w400, color: isActive ? Colors.white : Colors.white.withValues(alpha: 0.5))),
            ]),
          ),
        ),
      ),
    );
  }
}
