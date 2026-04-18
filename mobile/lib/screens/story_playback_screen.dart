import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:royal_dispatch/l10n/app_localizations.dart';
import 'package:royal_dispatch/models/princess.dart';
import 'package:royal_dispatch/models/story_data.dart';
import 'package:royal_dispatch/providers/audio_provider.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/providers/locale_provider.dart';
import 'package:royal_dispatch/providers/story_provider.dart';
import 'package:royal_dispatch/theme.dart';
import 'package:royal_dispatch/widgets/audio_controls.dart';
import 'package:royal_dispatch/widgets/hold_to_exit_button.dart';
import 'package:royal_dispatch/widgets/particles_background.dart';
import 'package:royal_dispatch/widgets/story_waiting.dart';

class StoryPlaybackScreen extends ConsumerStatefulWidget {
  final String princess;
  final bool useSSE;

  const StoryPlaybackScreen({
    super.key,
    required this.princess,
    required this.useSSE,
  });

  @override
  ConsumerState<StoryPlaybackScreen> createState() =>
      _StoryPlaybackScreenState();
}

class _StoryPlaybackScreenState extends ConsumerState<StoryPlaybackScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _startGeneration();
    });
  }

  void _startGeneration() {
    final locale = ref.read(localeProvider);
    final childId = ref.read(selectedChildIdProvider);
    final notifier = ref.read(storyProvider.notifier);

    if (widget.useSSE) {
      notifier.generateViaSSE(
        princess: widget.princess,
        language: locale.languageCode,
        storyType: 'daily',
        childId: childId,
      );
    } else {
      notifier.requestAndPoll(
        princess: widget.princess,
        language: locale.languageCode,
        storyType: 'daily',
        childId: childId,
      );
    }
  }

  void _exit() {
    ref.read(storyProvider.notifier).reset();
    ref.read(audioHandlerProvider).stop();
    context.pop();
  }

  String _cleanStoryText(String text) {
    return text.replaceAll(RegExp(r'\[[A-Z_]+\]'), '').trim();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final storyState = ref.watch(storyProvider);
    final meta = princessMeta[widget.princess];
    final princessName = meta?.name ?? widget.princess;

    ref.listen<StoryState>(storyProvider, (previous, next) {
      if (next is StoryStateReady) {
        final handler = ref.read(audioHandlerProvider);
        handler.loadAndPlay(
          next.data.audioUrl,
          item: MediaItem(
            id: next.data.audioUrl,
            title: '$princessName\'s Letter',
            artist: princessName,
          ),
        );
      }
    });

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          const ParticlesBackground(),
          _buildContent(context, l10n, storyState, princessName),
        ],
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    AppLocalizations l10n,
    StoryState storyState,
    String princessName,
  ) {
    return switch (storyState) {
      StoryStateIdle() => StoryWaiting(
        princessId: widget.princess,
        statusText: l10n.appWriting(princessName),
      ),
      StoryStateLoading() => StoryWaiting(
        princessId: widget.princess,
        statusText: l10n.appWriting(princessName),
      ),
      StoryStateStreaming(statusText: final text) => StoryWaiting(
        princessId: widget.princess,
        statusText: text,
      ),
      StoryStateReady(data: final data) => _buildReadyLayout(
        context,
        l10n,
        data,
      ),
      StoryStateError(message: final message) => _buildErrorLayout(
        context,
        l10n,
        message,
        princessName,
      ),
    };
  }

  Widget _buildReadyLayout(
    BuildContext context,
    AppLocalizations l10n,
    StoryData data,
  ) {
    final imagePath = princessImagePath(widget.princess);
    final meta = princessMeta[widget.princess];
    final cleanText = _cleanStoryText(data.storyText);

    return Column(
      children: [
        // Princess image top 40%
        SizedBox(
          height: MediaQuery.of(context).size.height * 0.40,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.asset(
                imagePath,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(
                  color: meta?.overlayColor ?? Colors.transparent,
                  child: Center(
                    child: Text(
                      meta?.emoji ?? '✨',
                      style: const TextStyle(fontSize: 80),
                    ),
                  ),
                ),
              ),
              // Bottom gradient fade
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                height: 120,
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [
                        RoyalColors.backgroundStart,
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),

        // Scrollable transcript + challenge
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Story text
                Text(
                  cleanText,
                  style: const TextStyle(
                    fontSize: 15,
                    height: 1.7,
                    color: Colors.white,
                  ),
                ),

                // Royal challenge
                if (data.royalChallenge != null &&
                    data.royalChallenge!.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: RoyalColors.gold.withValues(alpha: 0.6),
                        width: 1.5,
                      ),
                      color: RoyalColors.gold.withValues(alpha: 0.08),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.royalChallenge,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: RoyalColors.gold,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          data.royalChallenge!,
                          style: const TextStyle(
                            fontSize: 14,
                            height: 1.6,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 24),
              ],
            ),
          ),
        ),

        // Sticky bottom: audio controls + hold to exit
        Container(
          color: RoyalColors.backgroundStart.withValues(alpha: 0.95),
          padding: EdgeInsets.fromLTRB(
            16,
            8,
            16,
            MediaQuery.of(context).padding.bottom + 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AudioControls(),
              const SizedBox(height: 12),
              HoldToExitButton(
                label: l10n.holdToExit,
                onExit: _exit,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildErrorLayout(
    BuildContext context,
    AppLocalizations l10n,
    String message,
    String princessName,
  ) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('😔', style: TextStyle(fontSize: 64)),
            const SizedBox(height: 16),
            Text(
              l10n.storyError(princessName),
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 16,
                color: Colors.white,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                color: Colors.white.withValues(alpha: 0.5),
              ),
            ),
            const SizedBox(height: 24),
            TextButton(
              onPressed: _exit,
              style: TextButton.styleFrom(
                foregroundColor: RoyalColors.gold,
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
              ),
              child: Text(l10n.goBack),
            ),
          ],
        ),
      ),
    );
  }
}
