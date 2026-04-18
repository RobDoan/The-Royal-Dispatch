import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/widgets/princess_card.dart';

class StoryRequestScreen extends ConsumerWidget {
  const StoryRequestScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ids = ref.watch(activePrincessIdsProvider);

    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: ids.length,
      itemBuilder: (context, index) {
        final id = ids[index];
        return PrincessCard(
          princessId: id,
          isPoster: true,
          onTap: () => context.push('/story/$id'),
        );
      },
    );
  }
}
