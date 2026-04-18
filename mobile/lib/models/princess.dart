import 'package:flutter/material.dart';

class PrincessMeta {
  final String name;
  final String emoji;
  final String origin;
  final Color overlayColor;

  const PrincessMeta({
    required this.name,
    required this.emoji,
    required this.origin,
    required this.overlayColor,
  });
}

String princessImagePath(String id) => 'assets/characters/$id.png';

const Map<String, PrincessMeta> princessMeta = {
  'elsa': PrincessMeta(name: 'Queen Elsa', emoji: '❄️', origin: 'Kingdom of Arendelle', overlayColor: Color.fromRGBO(147, 197, 253, 0.25)),
  'belle': PrincessMeta(name: 'Belle', emoji: '📚', origin: 'The Enchanted Castle', overlayColor: Color.fromRGBO(252, 211, 77, 0.25)),
  'cinderella': PrincessMeta(name: 'Cinderella', emoji: '👠', origin: 'The Royal Palace', overlayColor: Color.fromRGBO(249, 168, 212, 0.25)),
  'ariel': PrincessMeta(name: 'Ariel', emoji: '🐠', origin: 'Under the Sea', overlayColor: Color.fromRGBO(110, 231, 183, 0.25)),
  'rapunzel': PrincessMeta(name: 'Princess Rapunzel', emoji: '🌻', origin: 'Kingdom of Corona', overlayColor: Color.fromRGBO(253, 224, 71, 0.25)),
  'moana': PrincessMeta(name: 'Moana', emoji: '🌊', origin: 'Motunui Island', overlayColor: Color.fromRGBO(56, 189, 248, 0.25)),
  'raya': PrincessMeta(name: 'Raya', emoji: '🐉', origin: 'Kumandra', overlayColor: Color.fromRGBO(167, 139, 250, 0.25)),
  'mirabel': PrincessMeta(name: 'Mirabel', emoji: '🦋', origin: 'The Encanto', overlayColor: Color.fromRGBO(52, 211, 153, 0.25)),
  'chase': PrincessMeta(name: 'Chase', emoji: '🐕‍🦺', origin: 'Adventure Bay (Police Pup)', overlayColor: Color.fromRGBO(59, 130, 246, 0.25)),
  'marshall': PrincessMeta(name: 'Marshall', emoji: '🔥', origin: 'Adventure Bay (Fire Pup)', overlayColor: Color.fromRGBO(239, 68, 68, 0.25)),
  'skye': PrincessMeta(name: 'Skye', emoji: '✈️', origin: 'Adventure Bay (Aviation Pup)', overlayColor: Color.fromRGBO(244, 114, 182, 0.25)),
  'rubble': PrincessMeta(name: 'Rubble', emoji: '🏗️', origin: 'Adventure Bay (Construction Pup)', overlayColor: Color.fromRGBO(251, 191, 36, 0.25)),
};
