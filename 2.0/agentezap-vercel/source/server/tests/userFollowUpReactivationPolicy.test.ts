import test from "node:test";
import assert from "node:assert/strict";

import {
  canReactivateFollowUpOnCompanyReply,
  isHardStopFollowUpDisableReason,
} from "../userFollowUpReactivationPolicy";
import { buildGlobalFollowUpPauseReason } from "../userFollowUpGlobalPause";

test("trata desativacoes manuais e estruturais como hard stop", () => {
  assert.equal(isHardStopFollowUpDisableReason("Desativado pelo usuario"), true);
  assert.equal(isHardStopFollowUpDisableReason("Desativado pelo usu\u00e1rio"), true);
  assert.equal(isHardStopFollowUpDisableReason("Usuario desativou follow-up"), true);
  assert.equal(isHardStopFollowUpDisableReason("Usu\u00e1rio desativou follow-up"), true);
  assert.equal(isHardStopFollowUpDisableReason("Numero na lista de exclusao"), true);
  assert.equal(isHardStopFollowUpDisableReason("N\u00famero na lista de exclus\u00e3o"), true);
  assert.equal(isHardStopFollowUpDisableReason("Conta suspensa por violacao de politicas"), true);
  assert.equal(isHardStopFollowUpDisableReason("Sequencia completa"), true);
  assert.equal(isHardStopFollowUpDisableReason("Conversa encerrada pelo atendente"), true);
  assert.equal(
    isHardStopFollowUpDisableReason(
      "Follow-up pausado: conversa indica pagamento, agendamento, cliente convertido ou pedido concluido.",
    ),
    true,
  );
  assert.equal(
    isHardStopFollowUpDisableReason(
      "Conversa pertence a outro numero WhatsApp. Follow-up bloqueado para evitar envio pelo numero atual.",
    ),
    true,
  );
  assert.equal(
    isHardStopFollowUpDisableReason(
      "Follow-up automatico nao esta disponivel para grupos.",
    ),
    true,
  );
  assert.equal(
    isHardStopFollowUpDisableReason(
      "Cliente demonstrou irritacao/desejo de nao receber mais mensagens - follow-up desativado automaticamente",
    ),
    true,
  );
});

test("mantem compatibilidade com motivos antigos salvos com codificacao quebrada", () => {
  assert.equal(isHardStopFollowUpDisableReason("Desativado pelo usu\u00c3\u00a1rio"), true);
  assert.equal(isHardStopFollowUpDisableReason("N\u00c3\u00bamero na lista de exclus\u00c3\u00a3o"), true);
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
      followupDisabledReason: "Desativado pelo usuario",
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
