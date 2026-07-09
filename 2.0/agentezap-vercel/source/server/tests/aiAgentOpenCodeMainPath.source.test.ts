import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const aiAgentSource = fs.readFileSync(path.resolve(process.cwd(), "server", "aiAgent.ts"), "utf8");

const codexBlockStart = aiAgentSource.indexOf("async function runAiAgentCodexPrimaryTurn");
assert.notEqual(codexBlockStart, -1, "Nao encontrou helper principal Codex do aiAgent");
const codexBlockEnd = aiAgentSource.indexOf("function normalizeOpeningComparison", codexBlockStart);
assert.notEqual(codexBlockEnd, -1, "Nao encontrou fim do helper principal Codex");
const codexBlock = aiAgentSource.slice(codexBlockStart, codexBlockEnd);

assert.match(
  codexBlock,
  /runAgenteZapLiveCliRuntime\(\{[\s\S]*scope,[\s\S]*ownerEmail:[\s\S]*userId:[\s\S]*conversationId:[\s\S]*contactPhone:[\s\S]*messages:[\s\S]*currentMessage:/,
  "resposta principal do agente deve passar contexto completo para o Codex CLI vivo",
);

assert.match(
  aiAgentSource,
  /const codexResult = await runAiAgentCodexPrimaryTurn\(\{[\s\S]*messages,[\s\S]*currentMessage:\s*newMessageText/,
  "generateAIResponse deve usar Codex CLI quando o runtime vivo estiver ativo",
);

assert.doesNotMatch(
  aiAgentSource,
  /await generateDeterministicSchedulingReply\(/,
  "agendamento deterministico legado nao pode decidir resposta/side effect no caminho vivo do Codex",
);

assert.match(
  aiAgentSource,
  /const \[tenantOperationalContext, delivery2CodexContext, productsData\] = await Promise\.all\(\[[\s\S]*buildDelivery2CodexContext\(\{ userId, mediaLibrary, sentMedias \}\)/,
  "WhatsApp real deve montar contexto Delivery 2.0 antes de chamar o Codex vivo",
);

assert.match(
  aiAgentSource,
  /contextArtifacts:\s*\{[\s\S]*delivery2:\s*delivery2CodexContext,[\s\S]*mediaLibrary:/,
  "contextArtifacts do WhatsApp devem entregar delivery2 ao Codex sem executor local decidir fluxo",
);

const liveCliTenantContextStart = aiAgentSource.indexOf("function buildAiAgentTenantContextArtifact");
assert.notEqual(liveCliTenantContextStart, -1, "Nao encontrou builder de tenantContext do WhatsApp real");
const liveCliTenantContextEnd = aiAgentSource.indexOf("function buildAiAgentMediaContextArtifacts", liveCliTenantContextStart);
assert.notEqual(liveCliTenantContextEnd, -1, "Nao encontrou fim do builder de tenantContext do WhatsApp real");
const liveCliTenantContextBlock = aiAgentSource.slice(liveCliTenantContextStart, liveCliTenantContextEnd);

assert.match(
  liveCliTenantContextBlock,
  /source:\s*"whatsapp_real_agent"[\s\S]*effectivePrompt:\s*String\(params\.agentConfig\?\.prompt \|\| ""\)/,
  "WhatsApp real deve registrar tenantContext explicito com prompt efetivo do tenant",
);

assert.match(
  liveCliTenantContextBlock,
  /rawAiAgentConfig:\s*sanitizeAiAgentLiveCliTenantContextValue\(params\.agentConfig \|\| \{\}\)/,
  "WhatsApp real deve anexar ai_agent_config bruto sanitizado ao Codex",
);

assert.match(
  liveCliTenantContextBlock,
  /rawBusinessAgentConfig:\s*sanitizeAiAgentLiveCliTenantContextValue\(params\.businessConfig \|\| \{\}\)/,
  "WhatsApp real deve anexar business_agent_configs bruto sanitizado ao Codex",
);

assert.match(
  liveCliTenantContextBlock,
  /operationalContext:\s*sanitizeAiAgentLiveCliTenantContextValue\(params\.operationalContext \|\| \{\}\)/,
  "WhatsApp real deve anexar setores/snapshot como contexto operacional do tenant",
);

const liveCliOperationalContextStart = aiAgentSource.indexOf("async function loadAiAgentTenantOperationalContext");
assert.notEqual(liveCliOperationalContextStart, -1, "Nao encontrou loader de contexto operacional do WhatsApp real");
const liveCliOperationalContextEnd = aiAgentSource.indexOf("function buildAiAgentTenantContextArtifact", liveCliOperationalContextStart);
assert.notEqual(liveCliOperationalContextEnd, -1, "Nao encontrou fim do loader de contexto operacional do WhatsApp real");
const liveCliOperationalContextBlock = aiAgentSource.slice(liveCliOperationalContextStart, liveCliOperationalContextEnd);

assert.match(
  liveCliOperationalContextBlock,
  /listOwnerSectors\(userId\)[\s\S]*getConversationRoutingSnapshot\(userId,\s*conversationId\)/,
  "WhatsApp real deve carregar setores e snapshot como contexto do Codex, nao escolher setor localmente",
);

assert.match(
  liveCliOperationalContextBlock,
  /O executor SaaS nao escolhe setor por palavra-chave/,
  "contrato de setores deve deixar claro que o executor nao roteia por keyword",
);

const liveCliMediaContextStart = aiAgentSource.indexOf("function buildAiAgentMediaContextArtifacts");
assert.notEqual(liveCliMediaContextStart, -1, "Nao encontrou builder de midias do WhatsApp real");
const liveCliMediaContextEnd = aiAgentSource.indexOf("async function runAiAgentCodexPrimaryTurn", liveCliMediaContextStart);
assert.notEqual(liveCliMediaContextEnd, -1, "Nao encontrou fim do builder de midias do WhatsApp real");
const liveCliMediaContextBlock = aiAgentSource.slice(liveCliMediaContextStart, liveCliMediaContextEnd);

assert.match(
  liveCliMediaContextBlock,
  /storageUrl:[\s\S]*fileName:[\s\S]*mimeType:[\s\S]*whenToUse:[\s\S]*description:[\s\S]*caption:[\s\S]*transcription:[\s\S]*suppressTextResponse:[\s\S]*flowItems:\s*sanitizeAiAgentLiveCliTenantContextValue/,
  "WhatsApp real deve entregar midias com URL/arquivo/tipo/whenToUse/descricao/legenda/transcricao/suppressTextResponse/flowItems completos ao Codex",
);

assert.doesNotMatch(
  liveCliMediaContextBlock,
  /\.slice\(/,
  "builder de midias do WhatsApp real nao pode truncar silenciosamente contexto antes do Codex",
);

assert.match(
  aiAgentSource,
  /loadAiAgentTenantOperationalContext\(\{ userId, conversationId \}\)[\s\S]*const tenantContextArtifact = buildAiAgentTenantContextArtifact/,
  "generateAIResponse deve montar tenantContext operacional antes de chamar Codex no WhatsApp real",
);

assert.match(
  aiAgentSource,
  /contextArtifacts:\s*\{[\s\S]*tenantContext:\s*tenantContextArtifact,[\s\S]*delivery2:\s*delivery2CodexContext,[\s\S]*agentMediaContract:\s*\[[\s\S]*whenToUse, caption, transcription, suppressTextResponse e flowItems sao evidencia[\s\S]*agentMedia:\s*agentMediaContextArtifacts,[\s\S]*productCatalog:\s*sanitizeAiAgentLiveCliTenantContextValue\(productsData \|\| null\),[\s\S]*conversationHistoryRaw:\s*sanitizeAiAgentLiveCliTenantContextValue\(conversationHistory\)/,
  "WhatsApp real deve entregar tenantContext, midias, catalogo e historico como evidencia para o Codex",
);

assert.match(
  aiAgentSource,
  /resolveAiAgentOwnerEmail\(userId\)[\s\S]*runAiAgentCodexPrimaryTurn\(\{[\s\S]*ownerEmail,/,
  "WhatsApp real deve resolver e passar ownerEmail ao runner Codex, onde Rodrigo usa o modelo dedicado",
);

assert.match(
  aiAgentSource,
  /if \(!codexResult \|\| \(!codexResult\.text && codexResult\.mediaActions\.length === 0\)\) \{[\s\S]*skipAutoReplyReason: codexResult\?\.skipAutoReplyReason \|\| "codex_no_send"/,
  "falha/vazio do Codex no caminho principal nao deve cair para LLM legado",
);

assert.match(
  aiAgentSource,
  /export interface AIResponseResult \{[\s\S]*skipAutoReplyReason\?: string;/,
  "resultado da IA deve expor motivo operacional quando o Codex decide nao enviar resposta publica",
);

assert.match(
  codexBlock,
  /\): Promise<\{[\s\S]*mediaActions: AgentRuntimeResponse\["actions"\];[\s\S]*skipAutoReplyReason\?: string;[\s\S]*scope: AgenteZapLiveCliScope;/,
  "helper interno do Codex deve tipar skipAutoReplyReason para nao quebrar typecheck",
);

assert.match(
  codexBlock,
  /result\.plan\.decision === "no_send"[\s\S]*skipAutoReplyReason: "codex_no_send"/,
  "decisao no_send do Codex deve voltar como estado operacional, nao como erro sem texto",
);

assert.match(
  aiAgentSource,
  /skipAutoReplyReason: codexResult\?\.skipAutoReplyReason \|\| "codex_no_send"/,
  "caminho principal deve preservar o motivo no_send para a fila finalizar sem retry falso",
);

assert.match(
  aiAgentSource,
  /const initialMediaActions =\s*!isAgenteZapLiveCliRuntimeEnabled\(\)\s*&&\s*params\.isFirstOpening\s*&&\s*params\.openingMediaActions\?\.length/s,
  "Codex vivo nao pode mesclar openingMediaActions locais; midia inicial deve vir do JSON Codex",
);

assert.match(
  aiAgentSource,
  /if \(liveCliPrimaryResponseEnabled\) \{\s*console\.log\(`[^`]*fluxo de saudação disponível apenas como contexto para o Codex CLI`\);\s*\} else if \(hasConcreteFirstOpeningRequest\) \{\s*openingMediaActions = greetingFlowActions;/s,
  "fluxo de saudacao local deve virar apenas contexto quando Codex vivo estiver ativo",
);

assert.match(
  aiAgentSource,
  /if \(liveCliPrimaryResponseEnabled\) \{\s*console\.log\(`[^`]*funil AgenteZap configurado fica apenas como contexto do Codex CLI/s,
  "funil/midia configurada local deve virar apenas contexto quando Codex vivo estiver ativo",
);

assert.doesNotMatch(
  codexBlock,
  /chatComplete|useOpenCodeMimo|forceOpenCodeGoCli|llmClient\.chat\.complete/,
  "helper principal Codex nao deve chamar OpenCode/chatComplete legado",
);

console.log("aiAgentCodexMainPath.source.test.ts: ok");
