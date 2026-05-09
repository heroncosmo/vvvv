import assert from "node:assert/strict";

import {
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

console.log("userFollowUpWaitingConnectionRecovery.test.ts ok");
