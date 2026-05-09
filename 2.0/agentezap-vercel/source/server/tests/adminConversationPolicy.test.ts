import assert from "node:assert/strict";
import { shouldProcessInboundAdminAutomation } from "../adminConversationPolicy";

assert.equal(
  shouldProcessInboundAdminAutomation({ isAgentEnabled: false, followupActive: true }),
  false,
  "mensagem nova nao pode disparar IA quando a conversa estiver desativada, mesmo com follow-up ativo",
);

assert.equal(
  shouldProcessInboundAdminAutomation({
    isAgentEnabled: true,
    isConnectionAiEnabled: false,
    followupActive: true,
  }),
  false,
  "mensagem nova nao pode disparar IA quando o toggle global da conexao do admin estiver desativado",
);

assert.equal(
  shouldProcessInboundAdminAutomation({ isAgentEnabled: true, followupActive: false }),
  false,
  "mensagem nova nao pode disparar IA quando a politica global do admin desativa a automacao",
);

console.log("adminConversationPolicy.test.ts ok");
