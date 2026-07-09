import assert from "node:assert/strict";

import {
  connectionRecordLooksConnectedForFollowUp,
  shouldRecoverWaitingConnectionReason,
  WAITING_FOR_WHATSAPP_CONNECTION_REASON,
} from "../userFollowUpConnectionState.ts";

assert.equal(
  shouldRecoverWaitingConnectionReason(WAITING_FOR_WHATSAPP_CONNECTION_REASON, true),
  true,
  "deve limpar o motivo quando o canal estiver ativo",
);

assert.equal(
  shouldRecoverWaitingConnectionReason(WAITING_FOR_WHATSAPP_CONNECTION_REASON, false),
  false,
  "nao deve limpar o motivo se o canal ainda estiver offline",
);

assert.equal(
  shouldRecoverWaitingConnectionReason(
    "Cliente foi o ultimo a falar - aguardar resposta da empresa antes de follow-up",
    true,
  ),
  false,
  "nao deve limpar motivos semanticos que nao sao espera de conexao",
);

assert.equal(
  shouldRecoverWaitingConnectionReason(null, true),
  false,
  "nao deve limpar quando nao existe motivo salvo",
);

assert.equal(
  connectionRecordLooksConnectedForFollowUp({
    isConnected: true,
    providerStatus: "disconnected",
  }),
  true,
  "isConnected=true deve manter follow-up ativo durante status transitorio recuperavel",
);

assert.equal(
  connectionRecordLooksConnectedForFollowUp({
    isConnected: true,
    providerStatus: "logged_out",
  }),
  false,
  "logout explicito nao deve ser tratado como conexao ativa",
);

assert.equal(
  connectionRecordLooksConnectedForFollowUp({
    isConnected: false,
    providerStatus: "connected",
  }),
  true,
  "provider_status connected continua sendo sinal operacional",
);

console.log("userFollowUpWaitingConnectionRecovery.test.ts ok");
