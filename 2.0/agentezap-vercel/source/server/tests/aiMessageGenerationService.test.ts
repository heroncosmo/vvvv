import test from "node:test";
import assert from "node:assert/strict";

import {
  generateAIMessage,
  normalizeAIMessageRequest,
  type AIMessageCodexExecutor,
} from "../aiMessageGenerationService";

test("normaliza prompt de geracao com contexto da conversa", () => {
  const normalized = normalizeAIMessageRequest(
    {
      prompt: "Uma saudacao profissional e amigavel",
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

  assert.equal(normalized.originalMessage, "Uma saudacao profissional e amigavel");
  assert.match(normalized.contextSummary, /Rodrigo/);
  assert.match(normalized.contextSummary, /5511999999999/);
  assert.match(normalized.contextSummary, /Quero saber mais/);
});

test("gera mensagem final tanto para prompt quanto para baseMessage via executor Codex", async () => {
  const capturedCalls: Parameters<AIMessageCodexExecutor>[0][] = [];

  const fakeExecutor: AIMessageCodexExecutor = async (params) => {
    capturedCalls.push(params);

    return capturedCalls.length === 1
      ? "Ola, Rodrigo! Tudo bem? Posso te ajudar por aqui."
      : "Oi, Rodrigo! Recebi sua mensagem e ja vou te orientar da melhor forma.";
  };

  const generatedFromPrompt = await generateAIMessage(
    {
      prompt: "Uma saudacao profissional e amigavel",
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
    "Ola, Rodrigo! Tudo bem? Posso te ajudar por aqui.",
  );
  assert.equal(
    generatedFromBaseMessage.generatedMessage,
    "Oi, Rodrigo! Recebi sua mensagem e ja vou te orientar da melhor forma.",
  );
  assert.equal(generatedFromBaseMessage.originalMessage, "Oi Rodrigo, recebi sua mensagem.");
  assert.equal(generatedFromBaseMessage.model, "codex-cli");
  assert.equal(capturedCalls.length, 2);
  assert.match(capturedCalls[0].messages[0].content, /orquestrador conversacional stateful/i);
  assert.match(capturedCalls[1].messages[1].content, /MENSAGEM BASE:/);
});

test("falha fechado sem executor Codex", async () => {
  await assert.rejects(
    () => generateAIMessage({ prompt: "Gerar mensagem" }, null),
    /Codex CLI context-only/,
  );
});
