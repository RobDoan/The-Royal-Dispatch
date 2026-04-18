import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:royal_dispatch/l10n/app_localizations.dart';
import 'package:royal_dispatch/router.dart';
import 'package:royal_dispatch/theme.dart';
import 'package:royal_dispatch/providers/locale_provider.dart';

class RoyalDispatchApp extends ConsumerWidget {
  const RoyalDispatchApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final locale = ref.watch(localeProvider);
    return MaterialApp.router(
      title: 'The Royal Dispatch',
      theme: buildRoyalTheme(),
      locale: locale,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en'), Locale('vi')],
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
