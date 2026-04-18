import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:royal_dispatch/l10n/app_localizations.dart';
import 'package:royal_dispatch/providers/auth_provider.dart';
import 'package:royal_dispatch/services/api_client.dart';
import 'package:royal_dispatch/theme.dart';
import 'package:royal_dispatch/widgets/glass_card.dart';
import 'package:royal_dispatch/widgets/language_toggle.dart';
import 'package:royal_dispatch/widgets/particles_background.dart';

class PairingScreen extends ConsumerStatefulWidget {
  const PairingScreen({super.key});

  @override
  ConsumerState<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends ConsumerState<PairingScreen> {
  final _tokenController = TextEditingController();
  bool _isLoading = false;
  String? _errorText;

  @override
  void dispose() {
    _tokenController.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    final token = _tokenController.text.trim();
    if (token.isEmpty) {
      setState(() => _errorText = AppLocalizations.of(context)!.pairingError);
      return;
    }

    setState(() {
      _isLoading = true;
      _errorText = null;
    });

    try {
      final dio = createApiClient(token: token);
      await dio.get('/user/me');
      await ref.read(authProvider.notifier).pair(token);
      // Router will redirect automatically based on auth state
    } catch (_) {
      if (mounted) {
        setState(() {
          _errorText = AppLocalizations.of(context)!.pairingError;
        });
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          const ParticlesBackground(),
          SafeArea(
            child: Column(
              children: [
                // Language toggle top-right
                Align(
                  alignment: Alignment.topRight,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 16, right: 16),
                    child: const LanguageToggle(),
                  ),
                ),
                Expanded(
                  child: Center(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(horizontal: 32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Gold gradient title
                          ShaderMask(
                            shaderCallback: (bounds) =>
                                RoyalColors.goldTextGradient.createShader(bounds),
                            child: Text(
                              l10n.appTitle,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontFamily: 'Georgia',
                                fontSize: 36,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          // Subtitle
                          Text(
                            l10n.pairingTitle,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 16,
                              color: Colors.white.withValues(alpha: 0.75),
                            ),
                          ),
                          const SizedBox(height: 40),
                          // Token input card
                          GlassCard(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                            child: TextField(
                              controller: _tokenController,
                              style: const TextStyle(color: Colors.white),
                              decoration: InputDecoration(
                                hintText: l10n.pairingHint,
                                hintStyle: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.4),
                                ),
                                border: InputBorder.none,
                                prefixIcon: Icon(
                                  Icons.vpn_key_outlined,
                                  color: Colors.white.withValues(alpha: 0.5),
                                ),
                              ),
                              onSubmitted: (_) => _connect(),
                            ),
                          ),
                          // Error text
                          if (_errorText != null) ...[
                            const SizedBox(height: 8),
                            Text(
                              _errorText!,
                              style: const TextStyle(
                                color: RoyalColors.rose,
                                fontSize: 13,
                              ),
                            ),
                          ],
                          const SizedBox(height: 24),
                          // Connect button
                          SizedBox(
                            width: double.infinity,
                            height: 52,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: RoyalColors.goldGradient,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: ElevatedButton(
                                onPressed: _isLoading ? null : _connect,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.transparent,
                                  shadowColor: Colors.transparent,
                                  foregroundColor: Colors.black87,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                                child: _isLoading
                                    ? const SizedBox(
                                        width: 24,
                                        height: 24,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2.5,
                                          valueColor: AlwaysStoppedAnimation<Color>(Colors.black54),
                                        ),
                                      )
                                    : Text(
                                        l10n.pairingConnect,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 16,
                                        ),
                                      ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
