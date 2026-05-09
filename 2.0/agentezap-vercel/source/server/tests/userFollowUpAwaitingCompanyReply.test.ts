import test from "node:test";
import assert from "node:assert/strict";

import {
  isWaitingForCompanyReplyReason,
  shouldHoldFollowUpUntilCompanyReply,
  WAITING_FOR_COMPANY_REPLY_REASON,
} from "../userFollowUpAwaitingCompanyReply";

test("reconhece o motivo canonico e o motivo legado de espera pela empresa", () => {
  assert.equal(isWaitingForCompanyReplyReason(WAITING_FOR_COMPANY_REPLY_REASON), true);
  assert.equal(
    isWaitingForCompanyReplyReason("Cliente respondeu - aguardando resposta da empresa"),
    true,
  );
  assert.equal(isWaitingForCompanyReplyReason("Desativado pelo usuário"), false);
});

test("mantem a conversa em espera quando o cliente foi o ultimo a falar", () => {
  assert.equal(
    shouldHoldFollowUpUntilCompanyReply({
      followupStage: 2,
      lastMessageFromMe: false,
      followupDisabledReason: null,
    }),
    true,
  );
});

test("nao trata agendamento manual como espera pela empresa", () => {
  assert.equal(
    shouldHoldFollowUpUntilCompanyReply({
      followupStage: -1,
      lastMessageFromMe: false,
      followupDisabledReason: WAITING_FOR_COMPANY_REPLY_REASON,
    }),
    false,
  );
});

test("nao preserva espera antiga quando a ultima mensagem ja e da empresa", () => {
  assert.equal(
    shouldHoldFollowUpUntilCompanyReply({
      followupStage: 0,
      lastMessageFromMe: true,
      followupDisabledReason: WAITING_FOR_COMPANY_REPLY_REASON,
    }),
    false,
  );
});
