import test from "node:test";
import assert from "node:assert/strict";

import {
  generateAIMessage,
  normalizeAIMessageRequest,
  type AIMessageLLMExecutor,
} from "../aiMessageGenerationService";

test("normaliza prompt de geração com contexto da conversa", () => {
  const normalized = normalizeAIMessageRequest(
    {
      prompt: "Uma saudação profissional e amigável",
      context: {
        contactName: "Rodrigo",
        lastMessages: ["Cliente: oi", "Atendente: tudo bem?"],
      },
    },
    {
      contactNumber: "5511999999999",
      lastMessageText: "Quero saber mais",
    },
  );

  assert.equal(normalized.originalMessage, "Uma saudação profissional e amigável");
  assert.match(normalized.contextSummary, /Rodrigo/);
  assert.match(normalized.contextSummary, /5511999999999/);
  assert.match(normalized.contextSummary, /Quero saber mais/);
});

test("gera mensagem final tanto para prompt quanto para baseMessage", async () => {
  const capturedCalls: Parameters<AIMessageLLMExecutor>[0][] = [];

  const fakeExecutor: AIMessageLLMExecutor = async (params) => {
    capturedCalls.push(params);

    return {
      choices: [
        {
          message: {
            content:
              capturedCalls.length === 1
                ? "Olá, Rodrigo! Tudo bem? Posso te ajudar por aqui."
                : "Oi, Rodrigo! Recebi sua mensagem e já vou te orientar da melhor forma.",
          },
          finishReason: "stop",
        },
      ],
    };
  };

  const generatedFromPrompt = await generateAIMessage(
    {
      prompt: "Uma saudação profissional e amigável",
      contactName: "Rodrigo",
      context: ["Cliente pediu uma primeira resposta mais humana."],
    },
    null,
    fakeExecutor,
  );

  const generatedFromBaseMessage = await generateAIMessage(
    {
      baseMessage: "Oi Rodrigo, recebi sua mensagem.",
      prompt: "Deixe mais calorosa, sem perder objetividade.",
      contactName: "Rodrigo",
    },
    null,
    fakeExecutor,
  );

  assert.equal(
    generatedFromPrompt.generatedMessage,
    "Olá, Rodrigo! Tudo bem? Posso te ajudar por aqui.",
  );
  assert.equal(
    generatedFromBaseMessage.generatedMessage,
    "Oi, Rodrigo! Recebi sua mensagem e já vou te orientar da melhor forma.",
  );
  assert.equal(generatedFromBaseMessage.originalMessage, "Oi Rodrigo, recebi sua mensagem.");
  assert.equal(capturedCalls.length, 2);
  assert.match(capturedCalls[0].messages[0].content, /orquestrador conversacional stateful/i);
  assert.match(capturedCalls[1].messages[1].content, /MENSAGEM BASE:/);
});
