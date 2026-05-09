import test from "node:test";
import assert from "node:assert/strict";

import {
  canReactivateFollowUpOnCompanyReply,
  isHardStopFollowUpDisableReason,
} from "../userFollowUpReactivationPolicy";
import { buildGlobalFollowUpPauseReason } from "../userFollowUpGlobalPause";

test("trata desativacoes manuais e estruturais como hard stop", () => {
  assert.equal(isHardStopFollowUpDisableReason("Desativado pelo usuário"), true);
  assert.equal(isHardStopFollowUpDisableReason("Usuário desativou follow-up"), true);
  assert.equal(isHardStopFollowUpDisableReason("Número na lista de exclusão"), true);
  assert.equal(isHardStopFollowUpDisableReason("Conta suspensa por violação de políticas"), true);
  assert.equal(isHardStopFollowUpDisableReason("Sequência completa"), false);
  assert.equal(
    isHardStopFollowUpDisableReason(
      "Cliente demonstrou irritação/desejo de não receber mais mensagens - follow-up desativado automaticamente",
    ),
    true,
  );
});

test("reativa conversa inativa sem motivo bloqueante quando a empresa responde", () => {
  assert.equal(
    canReactivateFollowUpOnCompanyReply({
      followupActive: false,
      followupDisabledReason: null,
      isGlobalFollowUpEnabled: true,
    }),
    true,
  );

  assert.equal(
    canReactivateFollowUpOnCompanyReply({
      followupActive: false,
      followupDisabledReason:
        "Cliente respondeu depois do follow-up - aguardando resposta da empresa",
      isGlobalFollowUpEnabled: true,
    }),
    true,
  );
});

test("reativa pausa global antiga quando o toggle atual esta ligado", () => {
  const reason = buildGlobalFollowUpPauseReason({
    currentStage: 2,
    nextFollowupAt: new Date("2026-04-03T15:00:00.000Z"),
    pausedAt: new Date("2026-04-03T12:00:00.000Z"),
  });

  assert.equal(
    canReactivateFollowUpOnCompanyReply({
      followupActive: false,
      followupDisabledReason: reason,
      isGlobalFollowUpEnabled: true,
    }),
    true,
  );
});

test("nao reativa conversa inativa quando o motivo e hard stop ou o toggle global esta desligado", () => {
  assert.equal(
    canReactivateFollowUpOnCompanyReply({
      followupActive: false,
      followupDisabledReason: "Desativado pelo usuário",
      isGlobalFollowUpEnabled: true,
    }),
    false,
  );

  assert.equal(
    canReactivateFollowUpOnCompanyReply({
      followupActive: false,
      followupDisabledReason: null,
      isGlobalFollowUpEnabled: false,
    }),
    false,
  );
});
