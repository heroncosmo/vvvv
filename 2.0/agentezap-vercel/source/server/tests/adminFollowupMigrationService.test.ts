import test from "node:test";
import assert from "node:assert/strict";

import {
  isAdminConversationMigratedBack,
  isSystemAdminMigrationReason,
  resolveRestoredUserFollowupState,
  shouldKeepFollowupDisabledAfterAdmin,
} from "../adminFollowupMigrationService";

test("reconhece motivos sistêmicos de migração para admin", () => {
  assert.equal(isSystemAdminMigrationReason("Migrado para admin abc em 2026-03-16"), true);
  assert.equal(isSystemAdminMigrationReason("Migração consolidada para admin"), true);
  assert.equal(isSystemAdminMigrationReason("Migra??o consolidada para admin"), true);
  assert.equal(isSystemAdminMigrationReason("Prioridade do admin (execucao)"), true);
  assert.equal(isSystemAdminMigrationReason("Desativado pelo usuário"), false);
});

test("detecta quando a conversa do admin já foi migrada de volta", () => {
  assert.equal(isAdminConversationMigratedBack({ followupMigration: { migratedBackAt: "2026-03-16T12:00:00.000Z" } }), true);
  assert.equal(isAdminConversationMigratedBack({ followupMigration: {} }), false);
  assert.equal(isAdminConversationMigratedBack(null), false);
});

test("mantém desativado quando o admin marcou pago ou cancelamento com opt-out", () => {
  assert.equal(
    shouldKeepFollowupDisabledAfterAdmin({
      latestLogStatus: "cancelled",
      latestLogReason: "Cliente demonstrou irritação e pediu para não receber mais mensagens",
      paymentStatus: "pending",
    }),
    true,
  );

  assert.equal(
    shouldKeepFollowupDisabledAfterAdmin({
      latestLogStatus: "sent",
      latestLogReason: "",
      paymentStatus: "paid",
    }),
    true,
  );
});

test("preserva agenda futura do admin ao restaurar para o usuário", () => {
  const plan = resolveRestoredUserFollowupState({
    config: { intervalsMinutes: [10, 180, 1440], infiniteLoop: true, infiniteLoopMinDays: 15, infiniteLoopMaxDays: 30 },
    sourceStage: 0,
    adminStage: 2,
    adminFollowupActive: true,
    adminNextFollowupAt: "2026-03-17T13:00:00.000Z",
    now: new Date("2026-03-16T20:00:00.000Z"),
  });

  assert.equal(plan.followupActive, true);
  assert.equal(plan.followupStage, 2);
  assert.equal(plan.strategy, "admin_schedule");
  assert.equal(plan.nextFollowupAt?.toISOString(), "2026-03-17T13:00:00.000Z");
});

test("recalcula a agenda quando o admin não tem próximo follow-up válido", () => {
  const plan = resolveRestoredUserFollowupState({
    config: {
      intervalsMinutes: [10, 180, 1440],
      respectBusinessHours: false,
      infiniteLoop: true,
      infiniteLoopMinDays: 15,
      infiniteLoopMaxDays: 30,
    },
    sourceStage: 1,
    sourceLastMessageTime: "2026-03-16T12:00:00.000Z",
    adminStage: 1,
    adminFollowupActive: false,
    adminLastMessageTime: "2026-03-16T15:00:00.000Z",
    now: new Date("2026-03-16T20:00:00.000Z"),
    randomFn: () => 0,
  });

  assert.equal(plan.followupActive, true);
  assert.equal(plan.followupStage, 1);
  assert.equal(plan.strategy, "recalculated");
  assert.equal(plan.nextFollowupAt?.toISOString(), "2026-03-16T20:01:05.000Z");
});
