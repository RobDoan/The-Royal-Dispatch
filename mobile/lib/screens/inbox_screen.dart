import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/l10n/app_localizations.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/widgets/princess_card.dart';

class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final princessIds = ref.watch(activePrincessIdsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: Text(
            l10n.appSubtitle,
            style: TextStyle(
              fontSize: 15,
              color: Colors.white.withValues(alpha: 0.7),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
            itemCount: princessIds.length,
            separatorBuilder: (context, index) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final id = princessIds[index];
              return PrincessCard(
                princessId: id,
                onTap: () => context.push('/play/$id'),
              );
            },
          ),
        ),
      ],
    );
  }
}
