import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

Dio createApiClient({String? token}) {
  final baseUrl = dotenv.env['API_BASE_URL'] ?? 'http://localhost:8000';
  final dio = Dio(BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 90),
  ));

  if (token != null) {
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        final uri = options.uri;
        final separator = uri.queryParameters.isEmpty ? '?' : '&';
        options.path = '${options.path}${separator}token=$token';
        handler.next(options);
      },
    ));
  }
  return dio;
}
