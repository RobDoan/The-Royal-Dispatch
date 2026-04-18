import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:royal_dispatch/models/story_data.dart';
import 'package:royal_dispatch/services/api_client.dart';
import 'package:royal_dispatch/services/sse_client.dart';
import 'package:royal_dispatch/providers/auth_provider.dart';

final storyProvider = StateNotifierProvider<StoryNotifier, StoryState>(
  (ref) => StoryNotifier(ref),
);

class StoryNotifier extends StateNotifier<StoryState> {
  final Ref _ref;
  StreamSubscription? _sseSubscription;
  Timer? _pollTimer;
  int _pollCount = 0;
  static const _maxPolls = 25; // 25 * 3s = 75s

  StoryNotifier(this._ref) : super(const StoryState.idle());

  void setLoading() => state = const StoryState.loading();
  void setStreaming(String text) => state = StoryState.streaming(text);
  void setReady(StoryData data) => state = StoryState.ready(data);
  void setError(String message) => state = StoryState.error(message);

  void reset() {
    _cancelAll();
    state = const StoryState.idle();
  }

  Future<void> generateViaSSE({
    required String princess,
    required String language,
    required String storyType,
    String? childId,
  }) async {
    _cancelAll();
    state = const StoryState.loading();
    final token = _ref.read(authProvider).value;
    if (token == null) {
      state = const StoryState.error('Not authenticated');
      return;
    }
    final dio = createApiClient(token: token);
    final params = [
      'princess=$princess',
      'language=$language',
      'story_type=$storyType',
      if (childId != null) 'child_id=$childId',
    ].join('&');
    try {
      final stream = connectSse(dio, '/story/generate?$params');
      _sseSubscription = stream.listen(
        (event) {
          switch (event.event) {
            case 'status':
              final data = jsonDecode(event.data) as Map<String, dynamic>;
              state = StoryState.streaming(data['message'] as String? ?? 'Generating...');
            case 'ready' || 'cached':
              final data = jsonDecode(event.data) as Map<String, dynamic>;
              state = StoryState.ready(StoryData.fromJson(data));
              _cancelAll();
            case 'error':
              final data = jsonDecode(event.data) as Map<String, dynamic>;
              state = StoryState.error(data['message'] as String? ?? 'Generation failed');
              _cancelAll();
          }
        },
        onError: (e) {
          state = StoryState.error('Connection error: $e');
          _cancelAll();
        },
        onDone: () {
          if (state is StoryStateLoading || state is StoryStateStreaming) {
            state = const StoryState.error('Stream ended unexpectedly');
          }
        },
      );
    } catch (e) {
      state = StoryState.error('Failed to connect: $e');
    }
  }

  Future<void> requestAndPoll({
    required String princess,
    required String language,
    required String storyType,
    String? childId,
  }) async {
    _cancelAll();
    state = const StoryState.loading();
    final token = _ref.read(authProvider).value;
    if (token == null) {
      state = const StoryState.error('Not authenticated');
      return;
    }
    final dio = createApiClient(token: token);
    try {
      await dio.post('/story', data: {
        'princess': princess,
        'language': language,
        'story_type': storyType,
        'child_id': ?childId,
      });
    } catch (e) {
      state = StoryState.error('Request failed: $e');
      return;
    }
    state = const StoryState.streaming('Generating your story...');
    _pollCount = 0;
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      _pollCount++;
      if (_pollCount > _maxPolls) {
        state = const StoryState.error('Story generation timed out');
        _cancelAll();
        return;
      }
      try {
        final childParam = childId != null ? '&child_id=$childId' : '';
        final response = await dio.get('/story/today/$princess?type=$storyType$childParam');
        final data = StoryData.fromJson(response.data as Map<String, dynamic>);
        state = StoryState.ready(data);
        _cancelAll();
      } catch (e) {
        if (e is DioException && e.response?.statusCode == 404) return;
        state = StoryState.error('Poll error: $e');
        _cancelAll();
      }
    });
  }

  void _cancelAll() {
    _sseSubscription?.cancel();
    _sseSubscription = null;
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  @override
  void dispose() {
    _cancelAll();
    super.dispose();
  }
}
