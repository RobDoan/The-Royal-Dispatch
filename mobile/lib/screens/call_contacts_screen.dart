import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/providers/call_provider.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/providers/locale_provider.dart';
import 'package:royal_dispatch/theme.dart';
import 'package:royal_dispatch/widgets/glass_card.dart';

String _displayName(String id) => id.isEmpty ? id : id[0].toUpperCase() + id.substring(1);

class CallContactsScreen extends ConsumerWidget {
  const CallContactsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final favorites = ref.watch(selectedChildFavoritePrincessesProvider);
    final callState = ref.watch(callProvider);
    final busy = callState.status != CallStatus.idle;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: ListView.separated(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
          itemCount: favorites.length,
          separatorBuilder: (_, _) => const SizedBox(height: 12),
          itemBuilder: (_, i) {
            final princess = favorites[i];
            final name = _displayName(princess);
            return GlassCard(
              variant: GlassVariant.card,
              borderRadius: 20,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(children: [
                  CircleAvatar(
                    radius: 32,
                    backgroundColor: Colors.white12,
                    foregroundImage: AssetImage('assets/princesses/$princess.png'),
                    onForegroundImageError: (_, _) {},
                    child: Text(
                      name[0],
                      style: const TextStyle(color: Colors.white, fontSize: 20),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Text(
                      name,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: "Call $name",
                    icon: Image.asset(
                      'assets/icons/scepter-call.png',
                      width: 44,
                      height: 44,
                      errorBuilder: (_, _, _) => const Icon(
                        Icons.phone,
                        color: Colors.white,
                        size: 44,
                      ),
                    ),
                    onPressed: busy
                        ? null
                        : () {
                            final childId = ref.read(selectedChildIdProvider);
                            if (childId == null) return;
                            final locale = ref.read(localeProvider).languageCode == 'vi' ? 'vi' : 'en';
                            context.push('/call/$princess');
                            // Fire-and-forget: state updates flow via callProvider so UI responds reactively.
                            ref.read(callProvider.notifier).startCall(
                              childId: childId,
                              princess: princess,
                              locale: locale,
                            );
                          },
                  ),
                ]),
              ),
            );
          },
        ),
      ),
    );
  }
}
