import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/services/sse_client.dart';

void main() {
  test('parseSseLines extracts event and data', () {
    final lines = ['event: status', 'data: {"message": "generating"}', ''];
    final events = parseSseLines(lines);
    expect(events.length, 1);
    expect(events[0].event, 'status');
    expect(events[0].data, '{"message": "generating"}');
  });

  test('parseSseLines handles multiple events', () {
    final lines = [
      'event: status', 'data: {"message": "step 1"}', '',
      'event: ready', 'data: {"story_text": "Once...", "audio_url": "http://x.mp3"}', '',
    ];
    final events = parseSseLines(lines);
    expect(events.length, 2);
    expect(events[0].event, 'status');
    expect(events[1].event, 'ready');
  });

  test('parseSseLines skips comment lines', () {
    final lines = [': keep-alive', 'event: status', 'data: {"ok": true}', ''];
    final events = parseSseLines(lines);
    expect(events.length, 1);
    expect(events[0].event, 'status');
  });

  test('parseSseLines handles data-only lines (no event field)', () {
    final lines = ['data: {"ping": true}', ''];
    final events = parseSseLines(lines);
    expect(events.length, 1);
    expect(events[0].event, 'message');
    expect(events[0].data, '{"ping": true}');
  });
}
