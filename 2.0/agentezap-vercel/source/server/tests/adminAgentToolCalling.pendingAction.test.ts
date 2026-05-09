import "dotenv/config";
import assert from "node:assert/strict";
import {
  buildPendingConfirmationAction,
  isExplicitPendingConfirmationReply,
} from "../adminAgentToolCalling";

const pending = buildPendingConfirmationAction(
  "criar_agente",
  {
    nomeEmpresa: "Cardeal Viagens",
    descricaoAtendimento: "Viagens e encomendas",
  },
  "558299590550",
);

assert.ok(pending);
assert.equal(isExplicitPendingConfirmationReply("Show", pending), true);
assert.equal(pending.expiresAt - Date.now() > 24 * 60 * 60 * 1000, true);

console.log("adminAgentToolCalling.pendingAction.test.ts ok");
process.exit(0);
