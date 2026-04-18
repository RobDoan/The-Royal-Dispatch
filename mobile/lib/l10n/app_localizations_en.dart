// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'The Royal Dispatch';

  @override
  String get appSubtitle => 'Your letters have arrived';

  @override
  String appWriting(String princess) {
    return '$princess is writing your letter...';
  }

  @override
  String get goBack => 'Go Back';

  @override
  String get royalChallenge => 'Your Royal Challenge';

  @override
  String lifeLesson(String princess) {
    return '$princess is crafting your life lesson...';
  }

  @override
  String get pickChildHeading => 'Who\'s reading tonight?';

  @override
  String get pickChildSubheading => 'Tap your name to begin';

  @override
  String get pairingTitle => 'Connect Your Device';

  @override
  String get pairingHint => 'Enter your family code';

  @override
  String get pairingConnect => 'Connect';

  @override
  String get pairingError => 'Invalid code. Please try again.';

  @override
  String get inboxTitle => 'Inbox';

  @override
  String get storyTitle => 'Story';

  @override
  String storyError(String princess) {
    return '$princess\'s letter is on its way — try again in a moment';
  }

  @override
  String get holdToExit => 'Hold to Exit';

  @override
  String get originElsa => 'Kingdom of Arendelle';

  @override
  String get originBelle => 'The Enchanted Castle';

  @override
  String get originCinderella => 'The Royal Palace';

  @override
  String get originAriel => 'Under the Sea';

  @override
  String get originRapunzel => 'Kingdom of Corona';

  @override
  String get originMoana => 'Motunui Island';

  @override
  String get originRaya => 'Kumandra';

  @override
  String get originMirabel => 'The Encanto';

  @override
  String get originChase => 'Adventure Bay (Police Pup)';

  @override
  String get originMarshall => 'Adventure Bay (Fire Pup)';

  @override
  String get originSkye => 'Adventure Bay (Aviation Pup)';

  @override
  String get originRubble => 'Adventure Bay (Construction Pup)';
}
