import assert from "node:assert/strict";
import test from "node:test";

import { canRecoverFollowUpAfterCompanyOutbound } from "../userFollowUpOutboundRecoveryPolicy";

test("recupera conversa da empresa sem motivo e sem cancelamento anterior", () => {
  assert.equal(
    canRecoverFollowUpAfterCompanyOutbound({
      followupActive: false,
      followupDisabledReason: null,
      isGlobalFollowUpEnabled: true,
      lastMessageFromMe: true,
      lastCompanyOutboundAt: new Date("2026-04-07T10:00:00.000Z"),
      lastCancelledFollowUpAt: null,
    }),
    true,
  );
});

test("nao recupera quando o cliente foi o ultimo a falar", () => {
  assert.equal(
    canRecoverFollowUpAfterCompanyOutbound({
      followupActive: false,
      followupDisabledReason: null,
      isGlobalFollowUpEnabled: true,
      lastMessageFromMe: false,
      lastCompanyOutboundAt: new Date("2026-04-07T10:00:00.000Z"),
      lastCancelledFollowUpAt: null,
    }),
    false,
  );
});

test("recupera quando a empresa falou depois do cancelamento antigo", () => {
  assert.equal(
    canRecoverFollowUpAfterCompanyOutbound({
      followupActive: false,
      followupDisabledReason: null,
      isGlobalFollowUpEnabled: true,
      lastMessageFromMe: true,
      lastCompanyOutboundAt: new Date("2026-04-07T10:00:00.000Z"),
      lastCancelledFollowUpAt: new Date("2026-04-07T09:00:00.000Z"),
    }),
    true,
  );
});

test("nao recupera quando o cancelamento e mais recente que a fala da empresa", () => {
  assert.equal(
    canRecoverFollowUpAfterCompanyOutbound({
      followupActive: false,
      followupDisabledReason: null,
      isGlobalFollowUpEnabled: true,
      lastMessageFromMe: true,
      lastCompanyOutboundAt: new Date("2026-04-07T09:00:00.000Z"),
      lastCancelledFollowUpAt: new Date("2026-04-07T10:00:00.000Z"),
    }),
    false,
  );
});

test("nao recupera quando ha cancelamento e a fala da empresa nao e confiavel", () => {
  assert.equal(
    canRecoverFollowUpAfterCompanyOutbound({
      followupActive: false,
      followupDisabledReason: null,
      isGlobalFollowUpEnabled: true,
      lastMessageFromMe: true,
      lastCompanyOutboundAt: null,
      lastCancelledFollowUpAt: new Date("2026-04-07T10:00:00.000Z"),
    }),
    false,
  );
});

test("nao recupera quando o follow-up foi desativado manualmente", () => {
  assert.equal(
    canRecoverFollowUpAfterCompanyOutbound({
      followupActive: false,
      followupDisabledReason: "Desativado pelo usuário",
      isGlobalFollowUpEnabled: true,
      lastMessageFromMe: true,
      lastCompanyOutboundAt: new Date("2026-04-07T10:00:00.000Z"),
      lastCancelledFollowUpAt: null,
    }),
    false,
  );
});

test("nao recupera conversa marcada como duplicada", () => {
  assert.equal(
    canRecoverFollowUpAfterCompanyOutbound({
      followupActive: false,
      followupDisabledReason: "Duplicado na mesma conexão - outra conversa ativa",
      isGlobalFollowUpEnabled: true,
      lastMessageFromMe: true,
      lastCompanyOutboundAt: new Date("2026-04-07T10:00:00.000Z"),
      lastCancelledFollowUpAt: null,
    }),
    false,
  );
});

test("nao recupera hard stop de irritacao mesmo com cancelamento antigo", () => {
  assert.equal(
    canRecoverFollowUpAfterCompanyOutbound({
      followupActive: false,
      followupDisabledReason: "Cliente demonstrou irritação/desejo de não receber mais mensagens - follow-up desativado automaticamente",
      isGlobalFollowUpEnabled: true,
      lastMessageFromMe: true,
      lastCompanyOutboundAt: new Date("2026-04-07T10:00:00.000Z"),
      lastCancelledFollowUpAt: new Date("2026-04-07T09:00:00.000Z"),
    }),
    false,
  );
});
