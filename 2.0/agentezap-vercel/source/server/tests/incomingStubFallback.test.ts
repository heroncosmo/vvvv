import assert from "node:assert/strict";
import {
  isInitialMetaStubFallbackCandidate,
  isTechnicalStubMessage,
  normalizeInitialStubMessageForAI,
  UNRESOLVED_INCOMING_STUB_TEXT,
} from "../incomingStubFallback";

assert.equal(isTechnicalStubMessage("[WhatsApp] Mensagem incompleta (stubType=2)"), true);
assert.equal(isTechnicalStubMessage("[Mensagem de protocolo]"), true);
assert.equal(isTechnicalStubMessage("[Mensagem nao suportada: poll]"), true);
assert.equal(isTechnicalStubMessage(UNRESOLVED_INCOMING_STUB_TEXT), true);
assert.equal(isTechnicalStubMessage("Oi, tenho interesse"), false);
assert.equal(isInitialMetaStubFallbackCandidate("[WhatsApp] Mensagem incompleta (stubType=2)"), true);
assert.equal(isInitialMetaStubFallbackCandidate("[Mensagem de protocolo]"), false);
assert.equal(isInitialMetaStubFallbackCandidate("[Mensagem nao suportada: poll]"), false);

assert.deepEqual(
  normalizeInitialStubMessageForAI("[WhatsApp] Mensagem incompleta (stubType=2)", [
    { fromMe: false, text: "[WhatsApp] Mensagem incompleta (stubType=2)" },
  ]),
  {
    text: "[WhatsApp] Mensagem incompleta (stubType=2)",
    wasNormalized: false,
    reason: "initial_meta_stub_unresolved",
  },
);

assert.deepEqual(
  normalizeInitialStubMessageForAI("[Mensagem de protocolo]", [
    { fromMe: false, text: "[Mensagem de protocolo]" },
  ]),
  {
    text: "[Mensagem de protocolo]",
    wasNormalized: false,
    reason: "not_initial_meta_stub",
  },
);

assert.deepEqual(
  normalizeInitialStubMessageForAI("[Mensagem nao suportada: poll]", [
    { fromMe: false, text: "[Mensagem nao suportada: poll]" },
  ]),
  {
    text: "[Mensagem nao suportada: poll]",
    wasNormalized: false,
    reason: "not_initial_meta_stub",
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
