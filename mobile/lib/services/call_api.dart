import 'dart:convert';
import 'package:http/http.dart' as http;

enum CallStartReason {
  dailyCapReached,
  princessNotFavorite,
  childNotFound,
  upstreamUnavailable,
  unknown,
}

class CallStartError implements Exception {
  final CallStartReason reason;
  final int statusCode;
  CallStartError(this.reason, this.statusCode);

  @override
  String toString() => 'CallStartError($reason, status=$statusCode)';
}

class CallStartResult {
  final String conversationId;
  final String signedUrl;
  final String expiresAt;
  final String princessDisplayName;
  final int maxDurationSeconds;

  CallStartResult({
    required this.conversationId,
    required this.signedUrl,
    required this.expiresAt,
    required this.princessDisplayName,
    required this.maxDurationSeconds,
  });

  factory CallStartResult.fromJson(Map<String, dynamic> j) => CallStartResult(
        conversationId: j["conversation_id"] as String,
        signedUrl: j["signed_url"] as String,
        expiresAt: j["expires_at"] as String,
        princessDisplayName: j["princess_display_name"] as String,
        maxDurationSeconds: j["max_duration_seconds"] as int,
      );
}

class CallApi {
  final String baseUrl;
  final String token;
  final http.Client httpClient;

  CallApi({required this.baseUrl, required this.token, http.Client? httpClient})
      : httpClient = httpClient ?? http.Client();

  Future<CallStartResult> start({
    required String childId,
    required String princess,
    required String locale,
  }) async {
    final response = await httpClient.post(
      Uri.parse("$baseUrl/call/start"),
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": token,
      },
      body: jsonEncode({
        "child_id": childId,
        "princess": princess,
        "locale": locale,
      }),
    );

    if (response.statusCode == 200) {
      return CallStartResult.fromJson(jsonDecode(response.body));
    }

    CallStartReason reason;
    switch (response.statusCode) {
      case 409:
        reason = CallStartReason.dailyCapReached;
        break;
      case 403:
        reason = CallStartReason.princessNotFavorite;
        break;
      case 404:
        reason = CallStartReason.childNotFound;
        break;
      case 503:
        reason = CallStartReason.upstreamUnavailable;
        break;
      default:
        reason = CallStartReason.unknown;
    }
    throw CallStartError(reason, response.statusCode);
  }
}
