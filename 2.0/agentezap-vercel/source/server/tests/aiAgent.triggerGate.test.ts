import assert from "node:assert/strict";
import { evaluateAgentTriggerMatch } from "../agentTriggerGate";

const triggerPhrases = ["20263"];

assert.deepEqual(
  evaluateAgentTriggerMatch({
    triggerPhrases,
    currentMessages: "Protecao solar UV 50+",
    conversationHistory: [],
  }).matched,
  false,
  "nao deve responder quando a conversa ainda nao tem gatilho do cliente",
);

assert.deepEqual(
  evaluateAgentTriggerMatch({
    triggerPhrases,
    currentMessages: "Certo",
    conversationHistory: [
      { fromMe: true, text: "Use o codigo 20263 internamente" },
      { fromMe: true, text: "Ola, como posso ajudar?" },
    ],
  }).matched,
  false,
  "mensagens do dono ou da IA nao podem ativar o gatilho",
);

assert.deepEqual(
  evaluateAgentTriggerMatch({
    triggerPhrases,
    currentMessages: "Boa noite ! 20263",
    conversationHistory: [],
  }),
  { matched: true, foundIn: "last", phrase: "20263" },
  "gatilho na mensagem atual do cliente deve ativar",
);

assert.deepEqual(
  evaluateAgentTriggerMatch({
    triggerPhrases,
    currentMessages: "Voces fazem aquelas bandeiras de rua?",
    conversationHistory: [
      { fromMe: false, text: "Boa noite ! 20263" },
      { fromMe: false, text: "Tenho uma duvida" },
    ],
  }),
  { matched: true, foundIn: "history", phrase: "20263" },
  "gatilho anterior do cliente deve manter a conversa ativa",
);

assert.deepEqual(
  evaluateAgentTriggerMatch({
    triggerPhrases: [],
    currentMessages: "ola",
    conversationHistory: [],
  }),
  { matched: true, foundIn: "no-filter" },
  "sem frases configuradas o agente segue comportamento normal",
);

console.log("aiAgent.triggerGate.test.ts ok");
