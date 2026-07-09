import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildEstacaoPizzaDelivery2StructuredReply,
  ESTACAO_PIZZA_BEVERAGES_MEDIA_NAME,
  ESTACAO_PIZZA_MENU_MEDIA_NAME,
  ESTACAO_PIZZA_USER_ID,
  type EstacaoPizzaStructuredExecutor,
} from "../estacaoPizzaResponsePolicy";

const mediaLibrary = [
  {
    id: "menu-flow",
    name: ESTACAO_PIZZA_MENU_MEDIA_NAME,
    mediaType: "flow",
    whenToUse: "Enviar quando o cliente pede cardapio, sabores de pizza ou precisa escolher sabor.",
    flowItems: [
      { type: "media", caption: "Pizzas tradicionais" },
      { type: "media", caption: "Bebidas e complementos" },
    ],
    isActive: true,
  },
  {
    id: "bebidas",
    name: ESTACAO_PIZZA_BEVERAGES_MEDIA_NAME,
    mediaType: "image",
    whenToUse: "Enviar depois que o pedido de pizza esta encaminhado e o cliente pode escolher bebida.",
    caption: "Bebidas disponiveis",
    isActive: true,
  },
];

function executorReturning(decision: unknown, capture?: { prompt?: string; candidates?: unknown[] }): EstacaoPizzaStructuredExecutor {
  return async ({ prompt, mediaCandidates }) => {
    if (capture) {
      capture.prompt = prompt;
      capture.candidates = mediaCandidates;
    }
    return decision;
  };
}

const firstCapture: { prompt?: string; candidates?: unknown[] } = {};
const firstTurn = await buildEstacaoPizzaDelivery2StructuredReply({
  userId: ESTACAO_PIZZA_USER_ID,
  message: "quero uma pizza grande",
  mediaLibrary,
  structuredExecutor: executorReturning({
    action: "ASK_FLAVOR",
    confidence: 94,
    reason: "pizza_size_without_flavor",
    replyText: "Perfeito. Qual sabor voce quer na pizza grande? Pode ser inteira ou meio a meio.",
    size: "grande",
    flavors: [],
    mediaNames: [ESTACAO_PIZZA_MENU_MEDIA_NAME],
  }, firstCapture),
});

assert.ok(firstTurn);
assert.equal(firstTurn.reason, "pizza_size_without_flavor");
assert.equal(firstTurn.source, "structured_executor");
assert.ok(firstTurn.text.includes("pizza grande"));
assert.ok(firstTurn.text.includes("sabor"));
assert.deepEqual(firstTurn.mediaActions, [
  { type: "send_media", media_name: ESTACAO_PIZZA_MENU_MEDIA_NAME },
]);
assert.ok(firstCapture.prompt?.includes("Midias candidatas"));
assert.ok(firstCapture.prompt?.includes(ESTACAO_PIZZA_MENU_MEDIA_NAME));
assert.equal(Array.isArray(firstCapture.candidates), true);

const halfHalfTurn = await buildEstacaoPizzaDelivery2StructuredReply({
  userId: ESTACAO_PIZZA_USER_ID,
  message: "metade calabresa e metade frango",
  mediaLibrary,
  history: [
    { fromMe: false, text: "quero uma pizza grande" },
    { fromMe: true, text: firstTurn.text },
  ],
  structuredExecutor: executorReturning({
    action: "ASK_OBSERVATION",
    confidence: 91,
    reason: "half_half_observation_step",
    replyText: "Fechado: pizza grande meio a meio, metade calabresa e metade frango. Tem alguma observacao?",
    size: "grande",
    flavors: ["calabresa", "frango"],
    mediaNames: [],
  }),
});

assert.ok(halfHalfTurn);
assert.equal(halfHalfTurn.reason, "half_half_observation_step");
assert.ok(halfHalfTurn.text.includes("meio a meio"));
assert.ok(halfHalfTurn.text.includes("observacao"));
assert.deepEqual(halfHalfTurn.mediaActions, []);

const repairedHalfHalfTurn = await buildEstacaoPizzaDelivery2StructuredReply({
  userId: ESTACAO_PIZZA_USER_ID,
  message: "quero uma grande metade calabresa e metade frango",
  mediaLibrary,
  structuredExecutor: executorReturning({
    action: "ASK_HALF_HALF_FLAVORS",
    confidence: 90,
    reason: "half_half_missing_flavors",
    replyText: "Qual sabor voce quer para a outra metade?",
    size: "grande",
    flavors: ["calabresa", "frango"],
    mediaNames: [ESTACAO_PIZZA_MENU_MEDIA_NAME],
  }),
});

assert.ok(repairedHalfHalfTurn);
assert.equal(repairedHalfHalfTurn.reason, "half_half_observation_step");
assert.ok(repairedHalfHalfTurn.text.includes("calabresa"));
assert.ok(repairedHalfHalfTurn.text.includes("frango"));
assert.ok(repairedHalfHalfTurn.text.includes("observacao"));
assert.deepEqual(repairedHalfHalfTurn.mediaActions, []);

const stateRepairHalfHalfTurn = await buildEstacaoPizzaDelivery2StructuredReply({
  userId: ESTACAO_PIZZA_USER_ID,
  message: "calabresa e mussarela",
  mediaLibrary,
  history: [
    { fromMe: false, text: "quero meio a meio" },
    { fromMe: true, text: "Quais sabores voce quer para cada metade?" },
  ],
  structuredExecutor: async () => {
    throw new Error("state repair should run before provider");
  },
});

assert.ok(stateRepairHalfHalfTurn);
assert.equal(stateRepairHalfHalfTurn.source, "structured_state_repair");
assert.equal(stateRepairHalfHalfTurn.reason, "half_half_observation_step");
assert.ok(stateRepairHalfHalfTurn.text.includes("observacao"));
assert.deepEqual(stateRepairHalfHalfTurn.mediaActions, []);

const observationTurn = await buildEstacaoPizzaDelivery2StructuredReply({
  userId: ESTACAO_PIZZA_USER_ID,
  message: "sem cebola",
  mediaLibrary,
  history: [
    { fromMe: false, text: "quero uma pizza grande" },
    { fromMe: true, text: firstTurn.text },
    { fromMe: false, text: "metade calabresa e metade frango" },
    { fromMe: true, text: halfHalfTurn.text },
  ],
  structuredExecutor: executorReturning({
    action: "OFFER_BEVERAGES",
    confidence: 88,
    reason: "half_half_observation_recorded",
    replyText: "Anotado, sem cebola. Quer escolher alguma bebida para acompanhar?",
    observation: "sem cebola",
    mediaNames: [ESTACAO_PIZZA_BEVERAGES_MEDIA_NAME],
  }),
});

assert.ok(observationTurn);
assert.equal(observationTurn.reason, "half_half_observation_recorded");
assert.ok(observationTurn.text.includes("sem cebola"));
assert.deepEqual(observationTurn.mediaActions, [
  { type: "send_media", media_name: ESTACAO_PIZZA_BEVERAGES_MEDIA_NAME },
]);

const missingFlavorTurn = await buildEstacaoPizzaDelivery2StructuredReply({
  userId: ESTACAO_PIZZA_USER_ID,
  message: "quero meio a meio",
  mediaLibrary,
  structuredExecutor: executorReturning({
    action: "ASK_HALF_HALF_FLAVORS",
    confidence: 86,
    reason: "half_half_missing_flavors",
    replyText: "Me fala os dois sabores da pizza meio a meio.",
    flavors: [],
    mediaNames: ["MIDIA_INVENTADA"],
  }),
});

assert.ok(missingFlavorTurn);
assert.equal(missingFlavorTurn.reason, "half_half_missing_flavors");
assert.deepEqual(missingFlavorTurn.mediaActions, []);

const passThrough = await buildEstacaoPizzaDelivery2StructuredReply({
  userId: ESTACAO_PIZZA_USER_ID,
  message: "qual horario de entrega hoje?",
  mediaLibrary,
  structuredExecutor: executorReturning({
    action: "PASS_THROUGH",
    confidence: 96,
    reason: "not_estacao_delivery2_turn",
    replyText: "",
    mediaNames: [],
  }),
});

assert.equal(passThrough, null);

let otherTenantExecutorCalled = false;
const otherTenant = await buildEstacaoPizzaDelivery2StructuredReply({
  userId: "tenant-generico",
  message: "quero uma pizza grande",
  mediaLibrary,
  structuredExecutor: async () => {
    otherTenantExecutorCalled = true;
    return {};
  },
});

assert.equal(otherTenant, null);
assert.equal(otherTenantExecutorCalled, false);

const moduleSource = readFileSync(resolve(process.cwd(), "server/estacaoPizzaResponsePolicy.ts"), "utf8");
assert.ok(moduleSource.includes("generateObject"));
assert.ok(moduleSource.includes("estacaoPizzaTurnSchema"));
assert.ok(moduleSource.includes("structuredExecutor"));

const aiAgentSource = readFileSync(resolve(process.cwd(), "server/aiAgent.ts"), "utf8");
assert.ok(aiAgentSource.includes("buildEstacaoPizzaDelivery2StructuredReply"));
assert.ok(aiAgentSource.includes("mediaLibrary"));

const httpSource = readFileSync(resolve(process.cwd(), "api/http.ts"), "utf8");
assert.ok(httpSource.includes("buildEstacaoPizzaDelivery2StructuredReply"));
assert.ok(httpSource.includes("tenant_structured_delivery2_contract"));

console.log("estacaoPizzaResponsePolicy.test.ts ok");
process.exit(0);
