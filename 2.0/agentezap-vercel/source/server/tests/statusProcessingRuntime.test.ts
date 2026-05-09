import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExpiredImmediateScheduledStatusMessage,
  buildInterruptedScheduledStatusMessage,
  createStatusSendTimeoutError,
  getScheduledStatusPresentation,
  shouldExpireInterruptedImmediateStatus,
  shouldRecoverInterruptedScheduledStatus,
  withStatusSendTimeout,
} from "../statusProcessingRuntime";

test("withStatusSendTimeout retorna quando a operacao conclui a tempo", async () => {
  const result = await withStatusSendTimeout(Promise.resolve("ok"), 100);
  assert.equal(result, "ok");
});

test("withStatusSendTimeout falha quando o envio trava", async () => {
  await assert.rejects(
    () => withStatusSendTimeout(new Promise(() => undefined), 20),
    (error: Error) => {
      assert.equal(error.name, "StatusSendTimeoutError");
      assert.match(error.message, /timed out/i);
      return true;
    },
  );
});

test("shouldRecoverInterruptedScheduledStatus detecta processamento herdado de boot anterior", () => {
  const bootStartedAt = new Date("2026-03-13T02:49:14.498Z");
  const updatedAt = new Date("2026-03-13T02:49:04.710Z");

  assert.equal(
    shouldRecoverInterruptedScheduledStatus({
      status: "processing",
      updatedAt,
      schedulerBootStartedAt: bootStartedAt,
      now: new Date("2026-03-13T02:49:30.000Z"),
    }),
    true,
  );

  assert.equal(
    shouldRecoverInterruptedScheduledStatus({
      status: "processing",
      updatedAt: new Date("2026-03-13T02:49:20.000Z"),
      schedulerBootStartedAt: bootStartedAt,
      now: new Date("2026-03-13T02:49:30.000Z"),
    }),
    false,
  );
});

test("getScheduledStatusPresentation troca processamento herdado por retomando envio", () => {
  const presentation = getScheduledStatusPresentation({
    status: "processing",
    updatedAt: "2026-03-13T02:49:04.710Z",
    schedulerBootStartedAt: "2026-03-13T02:49:14.498Z",
    errorMessage: null,
  });

  assert.equal(presentation.displayStatus, "retrying");
  assert.equal(presentation.wasInterrupted, true);
  assert.match(String(presentation.statusDetail), /retomar/i);
});

test("helpers de mensagem de recuperacao sao legiveis", () => {
  const error = createStatusSendTimeoutError(30_000);
  assert.equal(error.name, "StatusSendTimeoutError");
  assert.match(error.message, /30s/);
  assert.match(buildInterruptedScheduledStatusMessage(new Date("2026-03-13T02:49:30.000Z")), /Retomando/i);
  assert.match(buildInterruptedScheduledStatusMessage(new Date("2026-04-07T04:11:00.000Z")), /01:11/);
  assert.match(buildExpiredImmediateScheduledStatusMessage(new Date("2026-03-13T02:59:30.000Z")), /expirou/i);
});

test("shouldExpireInterruptedImmediateStatus bloqueia envio imediato velho demais", () => {
  assert.equal(
    shouldExpireInterruptedImmediateStatus({
      status: "processing",
      updatedAt: new Date("2026-03-13T02:49:04.710Z"),
      schedulerBootStartedAt: new Date("2026-03-13T02:49:14.498Z"),
      createdAt: new Date("2026-03-13T02:00:00.000Z"),
      requestedAction: "now",
      now: new Date("2026-03-13T02:49:30.000Z"),
    }),
    true,
  );

  assert.equal(
    shouldExpireInterruptedImmediateStatus({
      status: "processing",
      updatedAt: new Date("2026-03-13T02:49:04.710Z"),
      schedulerBootStartedAt: new Date("2026-03-13T02:49:14.498Z"),
      createdAt: new Date("2026-03-13T02:45:00.000Z"),
      requestedAction: "now",
      now: new Date("2026-03-13T02:49:30.000Z"),
    }),
    false,
  );
});
