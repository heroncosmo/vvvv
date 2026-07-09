import assert from "node:assert/strict";
import { agentMediaSchema, flowItemSchema } from "../../shared/schema";

const greetingItem = flowItemSchema.parse({
  id: "greeting-1",
  order: 0,
  type: "text",
  text: "Olá {nome}, tudo bem?",
  isGreeting: true,
});

assert.equal(greetingItem.isGreeting, true, "flowItemSchema deve preservar isGreeting");

const mediaPayload = agentMediaSchema.parse({
  userId: "user-1",
  name: "SAUDACAO_INFO_EXTRA",
  mediaType: "flow",
  storageUrl: "",
  description: "Fluxo de abertura",
  flowItems: [
    {
      id: "greeting-1",
      order: 0,
      type: "text",
      text: "Olá {nome}, tudo bem?",
      isGreeting: true,
    },
    {
      id: "text-2",
      order: 1,
      type: "text",
      text: "Posso te ajudar com produtos ou pedidos.",
    },
  ],
});

assert.equal(
  mediaPayload.flowItems?.[0]?.isGreeting,
  true,
  "agentMediaSchema deve aceitar a saudação principal dentro de flowItems",
);

console.log("greetingFlowPersistence.test.ts ok");
process.exit(0);
