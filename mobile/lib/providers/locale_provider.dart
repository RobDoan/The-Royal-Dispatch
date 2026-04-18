import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:royal_dispatch/providers/family_provider.dart';

const _localeKey = 'locale';

final localeProvider = StateNotifierProvider<LocaleNotifier, Locale>((ref) {
  final prefs = ref.read(sharedPrefsProvider);
  final saved = prefs.getString(_localeKey);
  return LocaleNotifier(prefs, saved != null ? Locale(saved) : const Locale('en'));
});

class LocaleNotifier extends StateNotifier<Locale> {
  final SharedPreferences _prefs;
  LocaleNotifier(this._prefs, Locale initial) : super(initial);

  void toggle() {
    final next = state.languageCode == 'en' ? const Locale('vi') : const Locale('en');
    state = next;
    _prefs.setString(_localeKey, next.languageCode);
  }
}
