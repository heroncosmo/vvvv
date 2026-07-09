import assert from "node:assert/strict";

import {
  getOpeningTextForCustomerMessage,
  isSimpleGreetingMessage,
  prependContextualOpeningInstruction,
  shouldForceContextualOpeningResponse,
  shouldReturnOnlyGreetingOpeningFlow,
  shouldReturnOpeningOnlyResponse,
} from "../initialOpeningReplyPolicy";

assert.equal(isSimpleGreetingMessage("oi"), true);
assert.equal(isSimpleGreetingMessage("Boa tarde!"), true);
assert.equal(isSimpleGreetingMessage("voce tem kit lencol e fronha casal"), false);

assert.equal(
  shouldReturnOpeningOnlyResponse({
    openingRuleSource: "greeting",
    customerMessage: "oi",
  }),
  true,
);

assert.equal(
  shouldReturnOpeningOnlyResponse({
    openingRuleSource: "greeting",
    customerMessage: "voce tem kit lencol e fronha casal",
  }),
  false,
);

assert.equal(
  shouldReturnOpeningOnlyResponse({
    openingRuleSource: "greeting",
    customerMessage: "bom dia\n\ntem painel hulk",
  }),
  false,
);

assert.equal(
  shouldReturnOpeningOnlyResponse({
    openingRuleSource: "off_hours",
    customerMessage: "",
  }),
  true,
);

assert.equal(shouldForceContextualOpeningResponse("oi"), false);
assert.equal(
  shouldForceContextualOpeningResponse("voce tem kit lencol e fronha casal"),
  true,
);
assert.equal(shouldForceContextualOpeningResponse("boa noite\n\ntem painel hulk"), true);
assert.equal(
  shouldForceContextualOpeningResponse("Olá! Posso ter mais informações sobre isso?"),
  true,
);
assert.equal(
  shouldReturnOnlyGreetingOpeningFlow("bom dia"),
  true,
  "saudacao simples pode usar somente o fluxo de abertura",
);
assert.equal(
  shouldReturnOnlyGreetingOpeningFlow("bom dia\n\ntem painel hulk"),
  false,
  "saudacao com pedido concreto precisa continuar para responder o pedido",
);
assert.equal(
  shouldReturnOnlyGreetingOpeningFlow("tyem painel lateral e girassol"),
  false,
  "pedido concreto com erro de digitacao nao pode parar somente na saudacao",
);

assert.equal(
  getOpeningTextForCustomerMessage(
    "Olá! É um prazer te receber aqui!\nComo podemos te ajudar hoje?",
    "Olá! Posso ter mais informações sobre isso?",
  ),
  "Olá! É um prazer te receber aqui!",
  "pedido concreto deve usar apenas a primeira linha da abertura",
);
assert.equal(
  getOpeningTextForCustomerMessage(
    "Olá! É um prazer te receber aqui!\nComo podemos te ajudar hoje?",
    "oi",
  ),
  "Olá! É um prazer te receber aqui!\nComo podemos te ajudar hoje?",
  "saudacao simples preserva abertura completa",
);

assert.equal(
  prependContextualOpeningInstruction({
    customerMessage: "oi",
    baseUserMessage: "oi",
  }),
  "oi",
);

const contextualOpeningInstruction = prependContextualOpeningInstruction({
  customerMessage: "voce tem kit lencol e fronha casal",
  baseUserMessage: "voce tem kit lencol e fronha casal",
});

assert.equal(
  contextualOpeningInstruction.includes("Nao envie apenas a midia sem texto."),
  true,
);
assert.equal(
  contextualOpeningInstruction.endsWith("voce tem kit lencol e fronha casal"),
  true,
);

console.log("initialOpeningReplyPolicy.test.ts ok");
