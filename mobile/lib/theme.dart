import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class RoyalColors {
  static const backgroundStart = Color(0xFF1A0533);
  static const backgroundMid = Color(0xFF2D1B69);
  static const backgroundEnd = Color(0xFF0F2B4A);
  static const gold = Color(0xFFFFD700);
  static const rose = Color(0xFFFF85A1);
  static const purple = Color(0xFF9370DB);
  static const sky = Color(0xFF7EC8E3);
  static const mint = Color(0xFF6EE7B7);

  static const backgroundGradient = LinearGradient(
    begin: Alignment.topCenter, end: Alignment.bottomCenter,
    colors: [backgroundStart, backgroundMid, backgroundEnd],
  );

  static const goldGradient = LinearGradient(
    begin: Alignment.topLeft, end: Alignment.bottomRight,
    colors: [gold, Color(0xFFFFA500)],
  );

  static const goldTextGradient = LinearGradient(
    begin: Alignment.topLeft, end: Alignment.bottomRight,
    colors: [gold, rose],
  );
}

enum GlassVariant { card, cardHover, nav, header }

class GlassStyle {
  final Color background;
  final double blur;
  final Color borderColor;

  const GlassStyle({required this.background, required this.blur, required this.borderColor});

  static const card = GlassStyle(background: Color.fromRGBO(255, 255, 255, 0.08), blur: 10, borderColor: Color.fromRGBO(255, 255, 255, 0.12));
  static const cardHover = GlassStyle(background: Color.fromRGBO(255, 255, 255, 0.12), blur: 10, borderColor: Color.fromRGBO(255, 255, 255, 0.12));
  static const nav = GlassStyle(background: Color.fromRGBO(255, 255, 255, 0.10), blur: 16, borderColor: Color.fromRGBO(255, 255, 255, 0.12));
  static const header = GlassStyle(background: Color.fromRGBO(255, 255, 255, 0.06), blur: 12, borderColor: Color.fromRGBO(255, 255, 255, 0.12));

  static GlassStyle fromVariant(GlassVariant variant) {
    return switch (variant) {
      GlassVariant.card => card,
      GlassVariant.cardHover => cardHover,
      GlassVariant.nav => nav,
      GlassVariant.header => header,
    };
  }
}

ThemeData buildRoyalTheme() {
  final base = ThemeData.dark();
  return base.copyWith(
    scaffoldBackgroundColor: Colors.transparent,
    textTheme: GoogleFonts.nunitoTextTheme(base.textTheme).apply(bodyColor: Colors.white, displayColor: Colors.white),
    colorScheme: base.colorScheme.copyWith(primary: RoyalColors.gold, secondary: RoyalColors.rose, surface: RoyalColors.backgroundStart),
  );
}
