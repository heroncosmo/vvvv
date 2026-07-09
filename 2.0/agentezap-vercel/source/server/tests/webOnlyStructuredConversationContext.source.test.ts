import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "api", "http.ts"), "utf8");
const routesSource = readFileSync(join(process.cwd(), "server", "routes.ts"), "utf8");

test("web-only simulator injects full-conversation structured context before recent history", () => {
  assert.equal(source.includes("function buildWebOnlyStructuredConversationContextBlock"), true);
  assert.equal(source.includes("web_only_conversation_continuity"), true);
  assert.equal(source.includes("hybrid_full_conversation_digest"), true);
  assert.equal(source.includes("olderCustomerSignalMap"), true);
  assert.equal(source.includes("olderCompanySignalMap"), true);
  assert.equal(source.includes("speaker?: \"customer\" | \"agent\" | \"company\""), true);
  assert.equal(source.includes("Mensagens com speaker company foram enviadas manualmente pela empresa"), true);
  assert.equal(source.includes("customerRequestSignalMap"), true);
  assert.equal(source.includes("customerRequestSignalsIncluded"), true);
  assert.equal(source.includes("recapResponseRequirements"), true);
  assert.equal(source.includes("latestCustomerRequestSignal"), true);
  assert.equal(source.includes("function enforceWebOnlyRecapPendingSignal"), true);
  assert.equal(source.includes("function enforceWebOnlyRecapEssentialFacts"), true);
  assert.equal(source.includes("function collectWebOnlyRecapEssentialFacts"), true);
  assert.equal(source.includes("function buildWebOnlyAdjustmentRecapLine"), true);
  assert.equal(source.includes("Contexto lembrado:"), true);
  assert.equal(source.includes("Resumo do ajuste:"), true);
  assert.equal(source.includes("Pedido principal a acompanhar:"), true);
  assert.equal(source.includes('normalized.includes("com base nessa conversa")'), true);
  assert.equal(source.includes('normalized.includes("pedido principal")'), true);
  assert.equal(source.includes("webOnlyResponseCoversCustomerRequest"), true);
  assert.match(
    source,
    /cleanText\s*=\s*enforceWebOnlyRecapPendingSignal\(\{[\s\S]*responseText:\s*cleanText/s,
  );
  assert.equal(source.includes("recentStructuredTurnMap"), true);
  assert.equal(source.includes("function buildWebOnlyStructuredConversationAnswerReminderBlock"), true);
  assert.equal(source.includes("LEMBRETE FINAL DE CONTINUIDADE"), true);
  assert.match(
    source,
    /structuredConversationContext\s*\?\s*\{\s*role:\s*"system",\s*content:\s*structuredConversationContext\s*\}/s,
  );
  assert.match(
    source,
    /async function callWebOnlyLlm[\s\S]*buildWebOnlyStructuredConversationContextBlock[\s\S]*\.\.\.\(structuredConversationContext/s,
  );
  assert.match(
    source,
    /buildWebOnlyTemporalReferenceText\(\{[\s\S]*structuredConversationContext/s,
  );
});

test("web-only simulator loads persisted conversation history when conversationId is provided", () => {
  assert.equal(source.includes("async function loadWebOnlySimulatorConversationHistoryFromDb"), true);
  assert.match(
    source,
    /getWebOnlyExplicitSimulatorConversationId\(body\)[\s\S]*body\?\.loadConversationHistory\s*===\s*false/s,
  );
  assert.match(
    source,
    /JOIN conversations c ON c\.id = m\.conversation_id[\s\S]*JOIN whatsapp_connections wc ON wc\.id = c\.connection_id[\s\S]*wc\.user_id::text = \$2/s,
  );
  assert.match(
    source,
    /const dbHistory = mapMessageRowsToWebOnlyHistory\(rows\)/,
  );
  assert.match(
    source,
    /speaker = row\.fromMe[\s\S]*row\.isFromAgent[\s\S]*"agent"[\s\S]*"company"[\s\S]*"customer"/s,
  );
  assert.match(
    source,
    /entry\.speaker === "company"[\s\S]*role:\s*"system" as const[\s\S]*a empresa respondeu anteriormente nesta conversa/s,
  );
  assert.match(
    source,
    /conversationHistory = await loadWebOnlySimulatorConversationHistoryFromDb\(userId, body, conversationHistory\)/,
  );
  assert.match(
    source,
    /conversationHistory = await loadWebOnlySimulatorConversationHistoryFromDb\(userId, body, conversationHistory\)[\s\S]*const simulatorConversationId/s,
  );
});

test("authenticated agent simulator forwards conversation id to web-only runtime", () => {
  assert.match(routesSource, /conversationId:\s*z\.string\(\)\.optional\(\)/);
  assert.match(routesSource, /conversationKey:\s*z\.string\(\)\.optional\(\)/);
  assert.match(routesSource, /testConversationKey:\s*z\.string\(\)\.optional\(\)/);
  assert.match(
    routesSource,
    /conversationId:\s*result\.data\.conversationId\s*\|\|\s*result\.data\.conversationKey\s*\|\|\s*result\.data\.testConversationKey\s*\|\|\s*null/s,
  );
  assert.match(
    routesSource,
    /contactPhone:\s*result\.data\.contactPhone\s*\|\|\s*result\.data\.contactNumber\s*\|\|\s*result\.data\.phone\s*\|\|\s*null/s,
  );
});

test("web-only simulator does not treat validation questions as repetition complaints", () => {
  assert.match(
    source,
    /function hasWebOnlyCustomerRepetitionComplaint[\s\S]*retoma[\s\S]*validacao[\s\S]*return false/s,
  );
  assert.match(
    source,
    /function hasWebOnlyCustomerRepetitionComplaint[\s\S]*mensagem\\s\+pronta[\s\S]*return false/s,
  );
});

test("web-only OpenCode budget failures skip OpenRouter fallback", () => {
  assert.match(
    source,
    /let preferNonOpenRouterFallback = false;[\s\S]*let skipOpenRouterFallback = false;/s,
  );
  assert.match(
    source,
    /const openCodeBudgetFallback = isWebOnlyOpenCodeProviderBudgetError\(error\);[\s\S]*const openCodeOperationalFallback = isWebOnlyOpenCodeOperationalFallbackError\(error\);[\s\S]*preferNonOpenRouterFallback = openCodeBudgetFallback \|\| openCodeOperationalFallback;[\s\S]*skipOpenRouterFallback = openCodeBudgetFallback \|\| openCodeOperationalFallback;/s,
  );
  assert.match(
    source,
    /if \(provider === "openrouter" && skipOpenRouterFallback\) \{[\s\S]*continue;[\s\S]*\}/s,
  );
  assert.match(
    source,
    /if \(providerOrder\.includes\("openrouter"\) && !skipOpenRouterFallback\)/,
  );
});
