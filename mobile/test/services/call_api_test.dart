import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:http/http.dart' as http;
import 'package:royal_dispatch/services/call_api.dart';

class MockClient extends Mock implements http.Client {}

void main() {
  setUpAll(() {
    registerFallbackValue(Uri.parse("http://x"));
  });

  late MockClient client;
  late CallApi api;

  setUp(() {
    client = MockClient();
    api = CallApi(
      baseUrl: "http://backend.test",
      token: "tok",
      httpClient: client,
    );
  });

  test("start returns typed success on 200", () async {
    when(() => client.post(any(), headers: any(named: "headers"), body: any(named: "body")))
        .thenAnswer((_) async => http.Response(
            '{"conversation_id":"c1","signed_url":"wss://x","expires_at":"2026-04-22T00:00:00Z","princess_display_name":"Belle","max_duration_seconds":300}',
            200));

    final result = await api.start(childId: "c-1", princess: "belle", locale: "en");

    expect(result.conversationId, "c1");
    expect(result.signedUrl, "wss://x");
    expect(result.princessDisplayName, "Belle");
    expect(result.maxDurationSeconds, 300);
  });

  test("start maps 409 to CallStartError.dailyCapReached", () async {
    when(() => client.post(any(), headers: any(named: "headers"), body: any(named: "body")))
        .thenAnswer((_) async => http.Response('{"detail":"daily_cap_reached"}', 409));

    expect(
      () => api.start(childId: "c-1", princess: "belle", locale: "en"),
      throwsA(isA<CallStartError>().having((e) => e.reason, "reason", CallStartReason.dailyCapReached)),
    );
  });

  test("start maps 403 to princessNotFavorite", () async {
    when(() => client.post(any(), headers: any(named: "headers"), body: any(named: "body")))
        .thenAnswer((_) async => http.Response('{"detail":"princess_not_favorite"}', 403));

    expect(
      () => api.start(childId: "c-1", princess: "belle", locale: "en"),
      throwsA(isA<CallStartError>().having((e) => e.reason, "reason", CallStartReason.princessNotFavorite)),
    );
  });

  test("start maps 503 to upstreamUnavailable", () async {
    when(() => client.post(any(), headers: any(named: "headers"), body: any(named: "body")))
        .thenAnswer((_) async => http.Response('{"detail":"upstream_unavailable"}', 503));

    expect(
      () => api.start(childId: "c-1", princess: "belle", locale: "en"),
      throwsA(isA<CallStartError>().having((e) => e.reason, "reason", CallStartReason.upstreamUnavailable)),
    );
  });
}
