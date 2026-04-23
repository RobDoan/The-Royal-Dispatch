import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/providers/call_provider.dart';
import 'package:royal_dispatch/services/call_api.dart';

ProviderContainer _makeContainer() {
  return ProviderContainer(overrides: [
    callApiProvider.overrideWithValue(
      CallApi(baseUrl: "http://t", token: "tok"),
    ),
  ]);
}

void main() {
  test("initial state is idle", () {
    final container = _makeContainer();
    addTearDown(container.dispose);

    expect(container.read(callProvider).status, CallStatus.idle);
  });

  test("transitions through requesting → connecting → inCall", () {
    final container = _makeContainer();
    addTearDown(container.dispose);
    final notifier = container.read(callProvider.notifier);

    notifier.markRequesting();
    expect(container.read(callProvider).status, CallStatus.requesting);

    notifier.markConnecting(princess: "belle", maxDurationSeconds: 300);
    expect(container.read(callProvider).status, CallStatus.connecting);
    expect(container.read(callProvider).princess, "belle");

    notifier.markInCall();
    expect(container.read(callProvider).status, CallStatus.inCall);
  });

  test("error transitions set reason", () {
    final container = _makeContainer();
    addTearDown(container.dispose);
    final notifier = container.read(callProvider.notifier);

    notifier.markError(CallErrorReason.dailyCap);
    expect(container.read(callProvider).status, CallStatus.error);
    expect(container.read(callProvider).error, CallErrorReason.dailyCap);
  });

  test("end resets to idle", () {
    final container = _makeContainer();
    addTearDown(container.dispose);
    final notifier = container.read(callProvider.notifier);

    notifier.markRequesting();
    notifier.markEnded();
    expect(container.read(callProvider).status, CallStatus.ended);

    notifier.reset();
    expect(container.read(callProvider).status, CallStatus.idle);
  });
}
