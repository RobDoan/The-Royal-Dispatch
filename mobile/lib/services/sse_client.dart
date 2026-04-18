import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';

class SseEvent {
  final String event;
  final String data;
  const SseEvent({required this.event, required this.data});
}

List<SseEvent> parseSseLines(List<String> lines) {
  final events = <SseEvent>[];
  String? currentEvent;
  String? currentData;

  for (final line in lines) {
    if (line.startsWith(':')) continue;
    if (line.isEmpty) {
      if (currentData != null) {
        events.add(SseEvent(event: currentEvent ?? 'message', data: currentData));
      }
      currentEvent = null;
      currentData = null;
      continue;
    }
    if (line.startsWith('event: ')) {
      currentEvent = line.substring(7);
    } else if (line.startsWith('data: ')) {
      currentData = line.substring(6);
    }
  }
  return events;
}

Stream<SseEvent> connectSse(Dio dio, String url) async* {
  final response = await dio.get<ResponseBody>(url, options: Options(responseType: ResponseType.stream));
  final stream = response.data!.stream;
  final buffer = StringBuffer();

  await for (final chunk in stream) {
    buffer.write(utf8.decode(chunk));
    final text = buffer.toString();
    final parts = text.split('\n');
    buffer.clear();
    buffer.write(parts.last);
    final completedLines = parts.sublist(0, parts.length - 1);
    final events = parseSseLines(completedLines);
    for (final event in events) {
      yield event;
    }
  }

  if (buffer.isNotEmpty) {
    final remaining = buffer.toString().split('\n');
    final events = parseSseLines([...remaining, '']);
    for (final event in events) {
      yield event;
    }
  }
}
