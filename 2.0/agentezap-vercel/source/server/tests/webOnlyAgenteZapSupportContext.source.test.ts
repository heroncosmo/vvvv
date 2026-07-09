import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("api/http.ts", "utf8");

function getSupportContextSource() {
  const start = source.indexOf("async function buildWebOnlyAgenteZapSupportCustomerContextBlock");
  const end = source.indexOf("function buildWebOnlyMediaPromptBlock");
  assert.notEqual(start, -1, "support customer context builder must exist");
  assert.notEqual(end, -1, "media prompt block must exist after support context builder");
  return source.slice(start, end);
}

function getSupportMediaGuardSource() {
  const start = source.indexOf("function filterWebOnlyAgenteZapSupportCustomerMediaActions");
  const end = source.indexOf("function buildWebOnlyMediaPromptBlock");
  assert.notEqual(start, -1, "support customer media guard must exist");
  assert.notEqual(end, -1, "media prompt block must exist after support customer media guard");
  return source.slice(start, end);
}

test("web-only support context is limited to AgenteZap support owner accounts", () => {
  assert.match(
    source,
    /AGENTEZAP_SUPPORT_CONTEXT_EMAILS[\s\S]*rodrigo4@gmail\.com,agentezapsuporte@agentezap\.online/,
    "support context should default to Rodrigo and official support accounts",
  );

  const fn = getSupportContextSource();
  assert.match(
    fn,
    /AGENTEZAP_SUPPORT_CONTEXT_EMAILS\.has\(ownerEmail\)/,
    "support context must not run for ordinary tenants",
  );
});

test("web-only support context includes real account, connection and media state", () => {
  const fn = getSupportContextSource();

  assert.match(fn, /FROM users u/, "must match customer accounts from users");
  assert.match(fn, /FROM whatsapp_connections wc/, "must include WhatsApp connection state");
  assert.match(fn, /FROM agent_media_library m/, "must include active media library state");
  assert.match(fn, /FROM ai_agent_config a/, "must include agent active state");
  assert.match(
    fn,
    /Imagens, audios, videos ou PDFs enviados nesta conversa de suporte nao entram automaticamente na Biblioteca de Midias/,
    "must warn that support-chat files are not automatically saved in the customer account",
  );
  assert.match(
    fn,
    /So diga que uma midia foi configurada, salva ou enviada se este contexto mostrar a midia ativa na conta correta ou se uma ferramenta\/acao real deste turno confirmar sucesso/,
    "must forbid claiming media setup without real side effect evidence",
  );
  assert.match(
    fn,
    /Midias da biblioteca da conta de suporte nao sao midias da conta do cliente/,
    "must warn that support account media cannot stand in for customer media",
  );
});

test("web-only runtime injects support context into the active prompt before generation", () => {
  assert.match(
    source,
    /const supportCustomerContextPromptBlock = await buildWebOnlyAgenteZapSupportCustomerContextBlock\(\{/,
    "runtime should build support customer context",
  );
  assert.match(
    source,
    /const activePrompt = \[\s*contactContextPromptBlock,\s*supportCustomerContextPromptBlock,\s*body\.customPrompt/s,
    "support context should be included in activePrompt before the tenant prompt",
  );
});

test("web-only support context filters support-owner media actions for customer media setup turns", () => {
  const guard = getSupportMediaGuardSource();
  assert.match(
    guard,
    /isWebOnlyAgenteZapSupportCustomerMediaTurn/,
    "guard should only run for support customer media turns",
  );
  assert.match(
    guard,
    /isWebOnlyAgenteZapSupportTutorialMediaAction/,
    "guard may keep explicit tutorial media but must review each action",
  );
  assert.match(
    source,
    /const suporteCustomerMediaGuard = filterWebOnlyAgenteZapSupportCustomerMediaActions\(\{/,
    "runtime should apply the guard after media actions are assembled",
  );
  assert.match(
    source,
    /agenteZapSupportCustomerMediaGuard:/,
    "runtime trace should expose dropped support media actions for audit",
  );
  assert.match(
    source,
    /filterWebOnlyPublicTestPayloadForSupportCustomerMedia/,
    "public test-agent payload should receive a final support media filter",
  );
  assert.match(
    source,
    /removed support media from public customer media test payload/,
    "public payload filter should log dropped support media actions",
  );
});
