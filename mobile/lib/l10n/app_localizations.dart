import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_vi.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('vi'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'The Royal Dispatch'**
  String get appTitle;

  /// No description provided for @appSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Your letters have arrived'**
  String get appSubtitle;

  /// No description provided for @appWriting.
  ///
  /// In en, this message translates to:
  /// **'{princess} is writing your letter...'**
  String appWriting(String princess);

  /// No description provided for @goBack.
  ///
  /// In en, this message translates to:
  /// **'Go Back'**
  String get goBack;

  /// No description provided for @royalChallenge.
  ///
  /// In en, this message translates to:
  /// **'Your Royal Challenge'**
  String get royalChallenge;

  /// No description provided for @lifeLesson.
  ///
  /// In en, this message translates to:
  /// **'{princess} is crafting your life lesson...'**
  String lifeLesson(String princess);

  /// No description provided for @pickChildHeading.
  ///
  /// In en, this message translates to:
  /// **'Who\'s reading tonight?'**
  String get pickChildHeading;

  /// No description provided for @pickChildSubheading.
  ///
  /// In en, this message translates to:
  /// **'Tap your name to begin'**
  String get pickChildSubheading;

  /// No description provided for @pairingTitle.
  ///
  /// In en, this message translates to:
  /// **'Connect Your Device'**
  String get pairingTitle;

  /// No description provided for @pairingHint.
  ///
  /// In en, this message translates to:
  /// **'Enter your family code'**
  String get pairingHint;

  /// No description provided for @pairingConnect.
  ///
  /// In en, this message translates to:
  /// **'Connect'**
  String get pairingConnect;

  /// No description provided for @pairingError.
  ///
  /// In en, this message translates to:
  /// **'Invalid code. Please try again.'**
  String get pairingError;

  /// No description provided for @inboxTitle.
  ///
  /// In en, this message translates to:
  /// **'Inbox'**
  String get inboxTitle;

  /// No description provided for @storyTitle.
  ///
  /// In en, this message translates to:
  /// **'Story'**
  String get storyTitle;

  /// No description provided for @storyError.
  ///
  /// In en, this message translates to:
  /// **'{princess}\'s letter is on its way — try again in a moment'**
  String storyError(String princess);

  /// No description provided for @holdToExit.
  ///
  /// In en, this message translates to:
  /// **'Hold to Exit'**
  String get holdToExit;

  /// No description provided for @originElsa.
  ///
  /// In en, this message translates to:
  /// **'Kingdom of Arendelle'**
  String get originElsa;

  /// No description provided for @originBelle.
  ///
  /// In en, this message translates to:
  /// **'The Enchanted Castle'**
  String get originBelle;

  /// No description provided for @originCinderella.
  ///
  /// In en, this message translates to:
  /// **'The Royal Palace'**
  String get originCinderella;

  /// No description provided for @originAriel.
  ///
  /// In en, this message translates to:
  /// **'Under the Sea'**
  String get originAriel;

  /// No description provided for @originRapunzel.
  ///
  /// In en, this message translates to:
  /// **'Kingdom of Corona'**
  String get originRapunzel;

  /// No description provided for @originMoana.
  ///
  /// In en, this message translates to:
  /// **'Motunui Island'**
  String get originMoana;

  /// No description provided for @originRaya.
  ///
  /// In en, this message translates to:
  /// **'Kumandra'**
  String get originRaya;

  /// No description provided for @originMirabel.
  ///
  /// In en, this message translates to:
  /// **'The Encanto'**
  String get originMirabel;

  /// No description provided for @originChase.
  ///
  /// In en, this message translates to:
  /// **'Adventure Bay (Police Pup)'**
  String get originChase;

  /// No description provided for @originMarshall.
  ///
  /// In en, this message translates to:
  /// **'Adventure Bay (Fire Pup)'**
  String get originMarshall;

  /// No description provided for @originSkye.
  ///
  /// In en, this message translates to:
  /// **'Adventure Bay (Aviation Pup)'**
  String get originSkye;

  /// No description provided for @originRubble.
  ///
  /// In en, this message translates to:
  /// **'Adventure Bay (Construction Pup)'**
  String get originRubble;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'vi'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'vi':
      return AppLocalizationsVi();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
