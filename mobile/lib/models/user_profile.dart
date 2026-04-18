class ChildInfo {
  final String id;
  final String name;
  final List<String> favoritePrincesses;

  const ChildInfo({required this.id, required this.name, required this.favoritePrincesses});

  factory ChildInfo.fromJson(Map<String, dynamic> json) {
    final rawPrefs = json['preferences'];
    final prefs = rawPrefs != null ? Map<String, dynamic>.from(rawPrefs as Map) : <String, dynamic>{};
    final favorites = (prefs['favorite_princesses'] as List<dynamic>?)?.map((e) => e as String).toList() ?? [];
    return ChildInfo(id: json['id'] as String, name: json['name'] as String, favoritePrincesses: favorites);
  }
}

class UserProfile {
  final String? userId;
  final String? name;
  final List<ChildInfo> children;

  const UserProfile({required this.userId, required this.name, required this.children});

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    final childrenJson = json['children'] as List<dynamic>? ?? [];
    return UserProfile(
      userId: json['user_id'] as String?,
      name: json['name'] as String?,
      children: childrenJson.map((c) => ChildInfo.fromJson(c as Map<String, dynamic>)).toList(),
    );
  }
}
