import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:royal_dispatch/app.dart';
import 'package:royal_dispatch/providers/audio_provider.dart';
import 'package:royal_dispatch/providers/family_provider.dart';
import 'package:royal_dispatch/services/audio_handler.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load();
  final prefs = await SharedPreferences.getInstance();
  final audioHandler = await AudioService.init(
    builder: () => RoyalAudioHandler(),
    config: const AudioServiceConfig(
      androidNotificationChannelId: 'com.royaldispatch.audio',
      androidNotificationChannelName: 'Royal Dispatch',
      androidNotificationOngoing: true,
    ),
  );
  runApp(
    ProviderScope(
      overrides: [
        sharedPrefsProvider.overrideWithValue(prefs),
        audioHandlerProvider.overrideWithValue(audioHandler),
      ],
      child: const RoyalDispatchApp(),
    ),
  );
}
