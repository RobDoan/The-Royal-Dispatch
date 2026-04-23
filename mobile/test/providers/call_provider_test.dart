import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_dispatch/providers/call_provider.dart';

void main() {
  test("initial state is idle", () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    expect(container.read(callProvider).status, CallStatus.idle);
  });

  test("transitions through requesting → connecting → inCall", () {
    final container = ProviderContainer();
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
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(callProvider.notifier);

    notifier.markError(CallErrorReason.dailyCap);
    expect(container.read(callProvider).status, CallStatus.error);
    expect(container.read(callProvider).error, CallErrorReason.dailyCap);
  });

  test("end resets to idle", () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(callProvider.notifier);

    notifier.markRequesting();
    notifier.markEnded();
    expect(container.read(callProvider).status, CallStatus.ended);

    notifier.reset();
    expect(container.read(callProvider).status, CallStatus.idle);
  });
}
