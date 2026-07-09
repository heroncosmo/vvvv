import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "server", "aiAgent.ts"), "utf8");

test("aiAgent injects a structured conversation context packet for long-running continuity", () => {
  assert.equal(source.includes("function buildStructuredConversationContextBlock"), true);
  assert.equal(source.includes("hybrid_full_conversation_digest"), true);
  assert.equal(source.includes("conversationWindowPolicy"), true);
  assert.equal(source.includes("firstTurns"), true);
  assert.equal(source.includes("olderTurnDigest"), true);
  assert.equal(source.includes("olderCustomerSignalMap"), true);
  assert.equal(source.includes("customerRequestSignalMap"), true);
  assert.equal(source.includes("customerRequestSignalsIncluded"), true);
  assert.equal(source.includes("recapResponseRequirements"), true);
  assert.equal(source.includes("latestCustomerRequestSignal"), true);
  assert.equal(source.includes("recentStructuredTurnMap"), true);
  assert.equal(source.includes("function buildStructuredConversationAnswerReminderBlock"), true);
  assert.equal(source.includes("LEMBRETE FINAL DE CONTINUIDADE"), true);
  assert.equal(source.includes("structuredTurnMap"), true);
  assert.equal(source.includes("=== CONTEXTO ESTRUTURADO DA CONVERSA ==="), true);
  assert.equal(source.includes("function buildManualOwnerConversationContextBlock"), true);
  assert.equal(source.includes("=== CONTEXTO DE RESPOSTAS DA EMPRESA ==="), true);
  assert.equal(source.includes("manualCompanyMessages"), true);
  assert.match(
    source,
    /messages\.push\(\{\s*role:\s*"system",\s*content:\s*structuredConversationContextBlock,\s*\}\);/s,
  );
  assert.match(
    source,
    /messages\.push\(\{\s*role:\s*"system",\s*content:\s*manualOwnerConversationContextBlock,\s*\}\);/s,
  );
});

test("aiAgent long-history summary points to structured context instead of keyword intent parsing", () => {
  assert.equal(source.includes("RESUMO OPERACIONAL DO HISTORICO LONGO"), true);
  assert.equal(source.includes("const intentKeywords ="), false);
  assert.equal(source.includes("INTENCOES DETECTADAS"), false);
});
