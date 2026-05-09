import assert from "node:assert/strict";
import {
  parseStructuredAIEnvelope,
  sanitizeAttentionAssessment,
  sanitizeStructuredRoutingDecision,
} from "../attentionQueue";

const fullEnvelope = parseStructuredAIEnvelope(`
<assistant_response>
Perfeito! Vou te ajudar com isso agora.
</assistant_response>
<attention_json>
{"priority":"alta","needsHumanAttention":true,"reason":"Cliente pronto para fechamento humano.","confidence":0.91}
</attention_json>
<routing_json>
{"mode":"route_to_sector","targetSectorId":"sector-123","confidence":0.73,"intent":"financeiro","reason":"Cliente quer tratar cobranca pendente."}
</routing_json>
`);

assert.equal(fullEnvelope.assistantResponse, "Perfeito! Vou te ajudar com isso agora.");
assert.equal(fullEnvelope.attention?.priority, "alta");
assert.equal(fullEnvelope.attention?.needsHumanAttention, true);
assert.equal(fullEnvelope.attention?.reason, "Cliente pronto para fechamento humano.");
assert.equal(fullEnvelope.attention?.confidence, 0.91);
assert.equal(fullEnvelope.routing?.mode, "route_to_sector");
assert.equal(fullEnvelope.routing?.targetSectorId, "sector-123");
assert.equal(fullEnvelope.routing?.confidence, 0.73);
assert.equal(fullEnvelope.routing?.intent, "financeiro");
assert.equal(fullEnvelope.routing?.reason, "Cliente quer tratar cobranca pendente.");

const invalidAttentionEnvelope = parseStructuredAIEnvelope(`
<assistant_response>
Seguimos por aqui normalmente.
</assistant_response>
<attention_json>
{invalid json}
</attention_json>
`);

assert.equal(invalidAttentionEnvelope.assistantResponse, "Seguimos por aqui normalmente.");
assert.equal(invalidAttentionEnvelope.attention, undefined);

const attentionOnlyTail = parseStructuredAIEnvelope(`
Resposta simples ao cliente.
<attention_json>
{"priority":"critica","needsHumanAttention":true,"reason":"Cliente aguardando correcao critica.","confidence":1}
</attention_json>
<routing_json>
{"mode":"keep_current","targetSectorId":null,"confidence":0.11,"intent":"keep_current","reason":"Fluxo atual ainda faz sentido."}
</routing_json>
`);

assert.equal(attentionOnlyTail.assistantResponse, "Resposta simples ao cliente.");
assert.equal(attentionOnlyTail.attention?.priority, "critica");
assert.equal(attentionOnlyTail.routing?.mode, "keep_current");
assert.equal(attentionOnlyTail.routing?.targetSectorId, null);

const invalidRoutingEnvelope = parseStructuredAIEnvelope(`
<assistant_response>
Seguimos por aqui normalmente.
</assistant_response>
<routing_json>
{invalid json}
</routing_json>
`);

assert.equal(invalidRoutingEnvelope.assistantResponse, "Seguimos por aqui normalmente.");
assert.equal(invalidRoutingEnvelope.routing, undefined);

const leakedRoutingInsideAssistant = parseStructuredAIEnvelope(`
<assistant_response>
Perfeito. Vou te passar o link certo agora.
<routing_json>
{"mode":"keep_current","targetSectorId":null,"confidence":1,"intent":"teste_gratis","reason":"Cliente quer testar a plataforma"}
</routing_json>
</assistant_response>
`);

assert.equal(
  leakedRoutingInsideAssistant.assistantResponse,
  "Perfeito. Vou te passar o link certo agora.",
);
assert.equal(leakedRoutingInsideAssistant.routing?.mode, "keep_current");

const danglingRoutingStartTag = parseStructuredAIEnvelope(`
<assistant_response>
Tudo certo, vou seguir por aqui.
<routing_json>
</assistant_response>
`);

assert.equal(danglingRoutingStartTag.assistantResponse, "Tudo certo, vou seguir por aqui.");

const noHumanAttention = sanitizeAttentionAssessment({
  priority: "alta",
  needsHumanAttention: false,
  reason: "",
  confidence: 0.45,
});

assert.deepEqual(noHumanAttention, {
  priority: null,
  needsHumanAttention: false,
  reason: null,
  confidence: 0.45,
});

const fallbackRoutingDecision = sanitizeStructuredRoutingDecision({
  mode: "route_to_sector",
  targetSectorId: "",
  confidence: 1.4,
  intent: "financeiro",
  reason: "Sem setor valido.",
});

assert.deepEqual(fallbackRoutingDecision, {
  mode: "keep_current",
  targetSectorId: null,
  confidence: 1,
  intent: "financeiro",
  reason: "Sem setor valido.",
});

console.log("attentionQueue.test.ts ok");
