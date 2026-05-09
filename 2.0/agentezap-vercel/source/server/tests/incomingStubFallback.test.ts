import assert from "node:assert/strict";
import {
  isInitialMetaStubFallbackCandidate,
  isTechnicalStubMessage,
  normalizeInitialStubMessageForAI,
} from "../incomingStubFallback";

assert.equal(isTechnicalStubMessage("[WhatsApp] Mensagem incompleta (stubType=2)"), true);
assert.equal(isTechnicalStubMessage("Oi, tenho interesse"), false);
assert.equal(isInitialMetaStubFallbackCandidate("[WhatsApp] Mensagem incompleta (stubType=2)"), true);
assert.equal(isInitialMetaStubFallbackCandidate("[Mensagem de protocolo]"), false);
assert.equal(isInitialMetaStubFallbackCandidate("[Mensagem nao suportada: poll]"), false);

assert.deepEqual(
  normalizeInitialStubMessageForAI("[WhatsApp] Mensagem incompleta (stubType=2)", [
    { fromMe: false, text: "[WhatsApp] Mensagem incompleta (stubType=2)" },
  ]),
  {
    text: "Oi, tenho interesse.",
    wasNormalized: true,
    reason: "initial_meta_stub",
  },
);

assert.deepEqual(
  normalizeInitialStubMessageForAI("[WhatsApp] Mensagem incompleta (stubType=2)", [
    { fromMe: false, text: "[WhatsApp] Mensagem incompleta (stubType=2)" },
    { fromMe: true, isFromAgent: true, text: "Oi! Como posso ajudar?" },
  ]),
  {
    text: "[WhatsApp] Mensagem incompleta (stubType=2)",
    wasNormalized: false,
    reason: "conversation_already_started",
  },
);

console.log("incomingStubFallback.test.ts ok");
