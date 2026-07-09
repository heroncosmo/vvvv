import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const httpSource = fs.readFileSync(path.resolve(process.cwd(), "api", "http.ts"), "utf8");
const aiAgentSource = fs.readFileSync(path.resolve(process.cwd(), "server", "aiAgent.ts"), "utf8");
const adminAgentServiceSource = fs.readFileSync(path.resolve(process.cwd(), "server", "adminAgentService.ts"), "utf8");
const adminAgentToolCallingSource = fs.readFileSync(path.resolve(process.cwd(), "server", "adminAgentToolCalling.ts"), "utf8");
const routesSource = fs.readFileSync(path.resolve(process.cwd(), "server", "routes.ts"), "utf8");

function blockBetween(startMarker: string, endMarker: string): string {
  const start = httpSource.indexOf(startMarker);
  assert.notEqual(start, -1, `Nao encontrou ${startMarker}`);
  const end = httpSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Nao encontrou fim ${endMarker}`);
  return httpSource.slice(start, end);
}

function routeBlockBetween(startMarker: string, endMarker: string): string {
  const start = routesSource.indexOf(startMarker);
  assert.notEqual(start, -1, `Nao encontrou ${startMarker}`);
  const end = routesSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Nao encontrou fim ${endMarker}`);
  return routesSource.slice(start, end);
}

assert.match(
  httpSource,
  /async function runWebOnlyCodexCliText[\s\S]*runAgenteZapLiveCliRuntime\(\{[\s\S]*scope,[\s\S]*ownerEmail,[\s\S]*userId:[\s\S]*conversationId,[\s\S]*contactPhone:[\s\S]*messages:[\s\S]*currentMessage:/,
  "rotas web-only devem chamar o runner Codex CLI real com contexto de conversa",
);

assert.match(
  httpSource,
  /if \(!content\) \{[\s\S]*result\.plan\.decision === "no_send"[\s\S]*return ""[\s\S]*throw new Error\("Codex CLI retornou resposta vazia"\)/,
  "web-only deve tratar no_send estruturado do Codex como resposta vazia valida, nao como erro/fallback legado",
);

assert.match(
  httpSource,
  /function buildWebOnlyMediaActionsFromLiveCliActions[\s\S]*extractWebOnlyLiveCliSendMediaName[\s\S]*mediaActions\.push\(\{[\s\S]*type:\s*"send_media"[\s\S]*media_name:/,
  "web-only deve preservar actions send_media do Codex como mediaActions executaveis pelo simulador, sem regra tenant-only",
);

assert.match(
  httpSource,
  /function extractWebOnlyLiveCliSendMediaName[\s\S]*const tagged = raw\.match[\s\S]*MEDIA\|ENVIAR_MIDIA\|MIDIA[\s\S]*tagged\?\.\[1\] \|\| raw/,
  "send_media do Codex deve aceitar mediaName ja embrulhado em [MEDIA:*] sem gerar tag quebrada",
);

assert.match(
  httpSource,
  /function resolvePublicTestAgentRequestTimeoutMs[\s\S]*resolveWebOnlySimulatorLlmProviderTimeoutMs\(body\)[\s\S]*providerTimeoutMs \+ 60_000[\s\S]*PUBLIC_TEST_AGENT_REQUEST_TIMEOUT_MS/,
  "rota publica de teste deve alinhar timeout de request ao timeout do runtime Codex, sem corte fixo de 60s",
);

assert.match(
  httpSource,
  /async function handlePublicTestAgentMessage[\s\S]*requestTimeoutMs = resolvePublicTestAgentRequestTimeoutMs\(body\)[\s\S]*setTimeout\(\(\) =>[\s\S]*requestTimeoutMs/,
  "handlePublicTestAgentMessage deve recriar o timer depois de ler o body e aplicar o timeout calculado",
);

assert.match(
  httpSource,
  /const codexText = await runWebOnlyCodexCliText\(\{[\s\S]*task:\s*"web_only_llm"[\s\S]*onStructuredActions:\s*params\.onStructuredActions[\s\S]*contextArtifacts:\s*\{[\s\S]*channel:\s*"web_only_llm"/,
  "callWebOnlyLlm deve propagar actions send_media estruturadas do Codex para o contrato tecnico de midia",
);

assert.match(
  httpSource,
  /const cleanedMediaResponse = stripWebOnlyTextualMediaTags\(repairWebOnlyOutgoingText\(String\(rawResponseText \|\| ""\)\)\);[\s\S]*const structuredMediaActionRequests = buildWebOnlyMediaActionsFromLiveCliActions\(liveCliStructuredActions\);[\s\S]*textual_media_tag_without_structured_action/,
  "web-only deve falhar fechado quando o Codex devolver tag textual de midia sem action send_media estruturada",
);

assert.match(
  httpSource,
  /function buildWebOnlyProductCatalogMediaPromptBlockFromRows[\s\S]*MIDIAS DO CATALOGO DE PRODUTOS[\s\S]*Contrato de saida:[\s\S]*action send_media[\s\S]*ACTION_MEDIA_NAME/,
  "web-only deve expor midias do catalogo de produtos como contexto/capacidade para action send_media estruturada",
);

assert.doesNotMatch(
  httpSource,
  /function buildWebOnlyLiveCliMediaTagsFromActions|includeActionTagsInText|parseWebOnlyMediaTaggedResponse|\[MEDIA:\$\{mediaName\}/,
  "web-only nao deve manter helpers/parsers de tag textual de midia como ferramenta paralela ao contrato Codex",
);

assert.doesNotMatch(
  httpSource,
  /buildWebOnlyCleanM2QuoteText|extractWebOnlyQuoteDimensionText|Bom dia! Fica/,
  "web-only nao deve manter builder orfao que escreve orcamento M2 como fala publica local",
);

assert.doesNotMatch(
  httpSource,
  /WebOnlyEstampariaProductCategory|buildWebOnlyEstampariaDuplicateMediaTextFallback|extractWebOnlyQuantity|detectWebOnlyEstampariaProductCategories|classifyWebOnlyEstampariaMedia|scoreWebOnlyEstampariaMediaForCategory|buildWebOnlyEstampariaProductMediaActions|isWebOnlyEstampariaFreightQuestion|sanitizeWebOnlyEstampariaFreightResponse|windPromo|windVisual|R\$ 62,98|R\$ 50,98|R\$ 2,99|nome individual|frete certinho|transportadora/,
  "web-only nao deve manter fallback orfao tenant-specific de estamparia como fala publica local",
);

assert.doesNotMatch(
  httpSource,
  /buildWebOnlyUnfulfilledVideoPromiseFallback|Tenho mais de um video disponivel aqui|No momento nao encontrei um video validado/,
  "web-only nao deve escrever fala publica local quando promessa de video nao tem action send_media valida",
);

assert.doesNotMatch(
  httpSource,
  /inferWebOnlyAgenteZapFunnelSentMediasFromPriorInbound/,
  "web-only nao deve inferir estado de funil AgenteZap em sentMedias por regex local",
);

assert.match(
  httpSource,
  /const sentMediasForAgent = extractSentMediaNamesFromRows\(rowsBeforeTarget, mediaLibraryForOpening\);[\s\S]*enqueueVercelAgentResponseJob/,
  "manual respond deve entregar ao Codex somente midias extraidas do historico real",
);

assert.match(
  httpSource,
  /const sentMediasForAgent = extractSentMediaNamesFromRows\(\s*canResumePartialCatalogMedia \? rows : rowsBeforeTarget,\s*mediaLibraryForOpening,\s*\);[\s\S]*runWebOnlyAgentTestForUser/,
  "geracao manual web-only deve preservar apenas sentMedias observaveis no historico real",
);

assert.match(
  httpSource,
  /function reconcileWebOnlyResponseLinksAndMedia[\s\S]*hasWebOnlyStrongVideoPromise\(text\)[\s\S]*!hasWebOnlyVideoMediaAction\(mediaActions, params\.mediaLibrary\)[\s\S]*text = ""[\s\S]*guardedUnfulfilledVideoPromise/,
  "promessa de video sem midia estruturada deve falhar fechada com texto vazio e trace tecnico",
);

assert.match(
  httpSource,
  /function buildWebOnlyProductCatalogMediaContextArtifacts[\s\S]*actionType:\s*"send_media"[\s\S]*actionArguments:\s*\{ mediaName \}/,
  "web-only deve expor midias do catalogo tambem como artifact estruturado para action send_media do Codex",
);

assert.match(
  httpSource,
  /function buildWebOnlyAgentMediaContextArtifacts[\s\S]*actionType:\s*"send_media"[\s\S]*actionArguments:\s*\{ mediaName \}/,
  "web-only deve expor agent_media_library como artifact estruturado generico para action send_media do Codex",
);

const productCatalogPromptBlock = blockBetween(
  "function buildWebOnlyProductCatalogMediaPromptBlockFromRows",
  "async function buildWebOnlyProductCatalogMediaContext",
);

assert.doesNotMatch(
  productCatalogPromptBlock,
  /Mauricio|MFC|isMauricioMfcCatalogTenant/,
  "contexto de midias do catalogo para Codex nao pode conter regra tenant-only MFC",
);

assert.match(
  httpSource,
  /buildWebOnlyMediaPromptBlock\(mediaLibrary\),[\s\S]*productCatalogMediaContext\.promptBlock,/,
  "callWebOnlyLlm deve receber o bloco de midias do catalogo junto das midias tradicionais",
);

assert.match(
  httpSource,
  /const agentMediaContextArtifacts = buildWebOnlyAgentMediaContextArtifacts\(mediaLibrary\);[\s\S]*liveCliContextArtifacts\.agentMediaContract[\s\S]*liveCliContextArtifacts\.agentMedia = agentMediaContextArtifacts/,
  "callWebOnlyLlm deve passar midias cadastradas do tenant como contextArtifacts genericos para o Codex",
);

assert.match(
  httpSource,
  /liveCliContextArtifacts\.agentMediaContract = \[[\s\S]*whenToUse, caption, transcription, suppressTextResponse e flowItems abaixo sao evidencia\/contexto do tenant[\s\S]*nao seletor deterministico nem fluxo local/,
  "contrato web-only de midias deve tratar metadados como contexto do Codex, nao seletor deterministico local",
);

const agentMediaArtifactsBlock = blockBetween(
  "function buildWebOnlyAgentMediaContextArtifacts",
  "function buildWebOnlyCatalogVirtualMediaName",
);

assert.doesNotMatch(
  agentMediaArtifactsBlock,
  /\.slice\(/,
  "agentMedia contextArtifacts nao podem truncar descricao/whenToUse/transcricao/flowItems antes do Codex",
);

assert.match(
  agentMediaArtifactsBlock,
  /flowItems:\s*sanitizeWebOnlyTenantContextValue/,
  "agentMedia contextArtifacts devem entregar flowItems como contexto bruto sanitizado",
);

assert.match(
  httpSource,
  /const delivery2CodexContext = await buildDelivery2CodexContext\(\{[\s\S]*userId,[\s\S]*mediaLibrary,[\s\S]*sentMedias: body\.sentMedias,[\s\S]*\}\)/,
  "Delivery 2.0 ativo deve virar contexto estruturado generico para o Codex no teste publico",
);

const tenantContextArtifactBlock = blockBetween(
  "function buildWebOnlyTenantContextArtifact",
  "function buildWebOnlyAgentMediaContextArtifacts",
);

const tenantContextSanitizerBlock = blockBetween(
  "function sanitizeWebOnlyTenantContextValue",
  "async function loadWebOnlyTenantOperationalContext",
);

assert.doesNotMatch(
  tenantContextSanitizerBlock,
  /\.slice\(/,
  "tenantContext web-only nao pode truncar arrays/configuracoes antes de entregar ao Codex",
);

assert.match(
  tenantContextSanitizerBlock,
  /WeakSet<object>/,
  "tenantContext web-only pode proteger contra ciclo, mas nao cortar conteudo util",
);

assert.ok(
  tenantContextSanitizerBlock.indexOf("if (seen.has(value))") < tenantContextSanitizerBlock.indexOf("if (Array.isArray(value))"),
  "tenantContext web-only deve proteger arrays circulares antes de mapear itens",
);

const tenantOperationalContextBlock = blockBetween(
  "async function loadWebOnlyTenantOperationalContext",
  "function buildWebOnlyTenantContextArtifact",
);

assert.match(
  tenantOperationalContextBlock,
  /FROM sectors s[\s\S]*WHERE s\.owner_id = \$1/,
  "web-only deve carregar setores por owner_id como contexto operacional do tenant",
);

assert.match(
  tenantOperationalContextBlock,
  /Setores e membros abaixo sao contexto\/capacidade do tenant para o Codex decidir actions como route_sector/,
  "setores devem ser entregues como contexto/capacidade, nao como roteador local",
);

assert.match(
  tenantOperationalContextBlock,
  /O executor SaaS nao escolhe setor por palavra-chave neste pacote/,
  "executor web-only nao pode decidir roteamento por palavra-chave antes do Codex",
);

assert.match(
  tenantContextArtifactBlock,
  /Contexto neutro completo do tenant para o Codex CLI vivo/,
  "web-only deve declarar tenantContext como contexto neutro, nao regra individual",
);

assert.match(
  tenantContextArtifactBlock,
  /effectivePrompt:\s*params\.activePrompt/,
  "tenantContext web-only deve entregar o prompt efetivo ao Codex",
);

assert.match(
  tenantContextArtifactBlock,
  /storedPrompt:\s*String\(config\?\.prompt \|\| ""\)/,
  "tenantContext web-only deve preservar tambem o prompt salvo do tenant",
);

assert.match(
  tenantContextArtifactBlock,
  /flowScript:\s*String\(config\?\.flow_script \|\| ""\)/,
  "tenantContext web-only deve entregar flow_script como contexto, sem executor decidir fluxo",
);

assert.match(
  tenantContextArtifactBlock,
  /businessAgentConfig:/,
  "web-only deve entregar prompt/config/business do tenant como contexto neutro completo para o Codex, sem regra individual",
);

assert.match(
  httpSource,
  /TO_JSONB\(aic\) AS "aiAgentConfigRaw"[\s\S]*COALESCE\(TO_JSONB\(bac\), '\{\}'::jsonb\) AS "businessAgentConfigRaw"/,
  "query web-only deve carregar linhas brutas de ai_agent_config e business_agent_configs para contexto completo",
);

assert.match(
  tenantContextArtifactBlock,
  /rawAiAgentConfig:\s*sanitizeWebOnlyTenantContextValue\(config\?\.aiAgentConfigRaw \|\| \{\}\)/,
  "tenantContext web-only deve incluir ai_agent_config bruto sanitizado",
);

assert.match(
  tenantContextArtifactBlock,
  /rawBusinessAgentConfig:\s*sanitizeWebOnlyTenantContextValue\(config\?\.businessAgentConfigRaw \|\| \{\}\)/,
  "tenantContext web-only deve incluir business_agent_configs bruto sanitizado",
);

assert.match(
  tenantContextArtifactBlock,
  /operationalContext:\s*sanitizeWebOnlyTenantContextValue\(params\.operationalContext \|\| \{\}\)/,
  "tenantContext web-only deve incluir contexto operacional/setores junto do prompt/config",
);

const webOnlyTenantContextCallBlock = blockBetween(
  "const webOnlyTenantContextArtifact = buildWebOnlyTenantContextArtifact",
  "const productCatalogMediaContext",
);

assert.match(
  webOnlyTenantContextCallBlock,
  /userId,[\s\S]*config,[\s\S]*activePrompt,[\s\S]*promptSource:[\s\S]*contactName,[\s\S]*contactPhone:[\s\S]*operationalContext:\s*webOnlyTenantOperationalContext/,
  "runWebOnlyAgentTestForUserInternal deve montar contexto bruto do tenant depois do prompt efetivo",
);

const liveCliContextArtifactsBlock = blockBetween(
  "const liveCliContextArtifacts: Record<string, unknown> = {",
  "let rawResponseText = \"\";",
);

assert.match(
  liveCliContextArtifactsBlock,
  /tenantContext:\s*webOnlyTenantContextArtifact/,
  "contextArtifacts web-only devem sempre incluir tenantContext antes de midias/catalogo/delivery",
);

assert.match(
  httpSource,
  /if \(delivery2CodexContext\) \{[\s\S]*liveCliContextArtifacts\.delivery2 = delivery2CodexContext;[\s\S]*\}/,
  "contextArtifacts do Codex web-only devem receber delivery2 sem regra tenant-only",
);

assert.match(
  httpSource,
  /if \(productCatalogMediaContext\.artifacts\.length > 0\)[\s\S]*liveCliContextArtifacts\.productCatalogMediaContract[\s\S]*liveCliContextArtifacts\.productCatalogMedia = productCatalogMediaContext\.artifacts/,
  "callWebOnlyLlm deve passar catalogo de produtos estruturado para 07-context-artifacts do Codex",
);

const productCatalogArtifactsBlock = blockBetween(
  "function buildWebOnlyProductCatalogMediaContextArtifacts",
  "async function loadWebOnlyProductCatalogMediaRows",
);

assert.doesNotMatch(
  productCatalogArtifactsBlock,
  /\.slice\(/,
  "productCatalogMedia contextArtifacts nao podem truncar catalogo/produtos antes do Codex",
);

const productCatalogRowsBlock = blockBetween(
  "async function loadWebOnlyProductCatalogMediaRows",
  "function buildWebOnlyProductCatalogMediaPromptBlockFromRows",
);

assert.match(
  productCatalogRowsBlock,
  /limit\?: number/,
  "carregador do catalogo web-only deve permitir contexto completo sem limite default",
);

assert.match(
  productCatalogRowsBlock,
  /\$\{hasLimit \? "LIMIT \$2" : ""\}/,
  "LIMIT do catalogo web-only so pode existir quando solicitado explicitamente",
);

assert.match(
  httpSource,
  /async function buildWebOnlyProductCatalogMediaContext\(userId: string\)[\s\S]*loadWebOnlyProductCatalogMediaRows\(userId\)/,
  "pacote Codex de catalogo deve carregar linhas sem limite silencioso",
);

assert.match(
  httpSource,
  /contextArtifacts:\s*liveCliContextArtifacts/,
  "callWebOnlyLlm deve encaminhar artifacts genericos com tenantContext obrigatorio",
);

assert.match(
  httpSource,
  /\.\.\.\(params\.contextArtifacts \|\| \{\}\),[\s\S]*channel:\s*"web_only_llm"/,
  "callWebOnlyLlm deve encaminhar contextArtifacts ao runner Codex principal",
);

assert.match(
  httpSource,
  /async function hydrateWebOnlyCatalogTaggedMediaActions[\s\S]*type:\s*"send_media_url"[\s\S]*source:\s*"product_catalog"/,
  "tags de midia do catalogo decididas pelo Codex devem virar send_media_url auditavel",
);

assert.match(
  httpSource,
  /function expandWebOnlySimulatorMediaAction[\s\S]*const directAction:[\s\S]*"source"[\s\S]*"product_id"[\s\S]*directAction\[auditKey\] = action\[auditKey\]/,
  "expansao final de send_media_url deve preservar metadados auditaveis do catalogo",
);

assert.match(
  httpSource,
  /structuredMediaActionRequests\.length > 0[\s\S]*hydrateWebOnlyCatalogTaggedMediaActions[\s\S]*hydratedActions\.flatMap/,
  "hidratacao de actions do catalogo deve acontecer antes da expansao de midias do simulador",
);

assert.match(
  httpSource,
  /function buildWebOnlyLiveCliRawSplitResponses\(text: unknown,\s*config\?: any\)[\s\S]*parseWebOnlyBubbleMessages\(rawText,\s*\{\s*preserveUrlSchemes:\s*true\s*\}\)[\s\S]*splitWebOnlyMessageHumanLike\(rawText,\s*config\?\.message_split_chars/,
  "web-only deve preservar [BOLHA]/URL do Codex vivo e aplicar somente o splitter tecnico por limite do tenant quando nao houver marcador explicito",
);

assert.doesNotMatch(
  httpSource,
  /agentezap_tool_calling_funnel|tryRunWebOnlyAgenteZapToolCallingFunnel|shouldRunWebOnlyAgenteZapCreatorFunnel|processToolCallingMessage/,
  "web-only nao deve usar funil especial/tool-calling paralelo antes do runtime Codex unificado",
);

const adminLiveCliBridgeStart = adminAgentToolCallingSource.indexOf("async function maybeRunAgenteZapLiveCliRuntime");
const adminLiveCliBridgeEnd = adminAgentToolCallingSource.indexOf("const MAX_TOOL_ROUNDS", adminLiveCliBridgeStart);
assert.ok(
  adminLiveCliBridgeStart >= 0 && adminLiveCliBridgeEnd > adminLiveCliBridgeStart,
  "Must locate admin live CLI bridge.",
);
const adminLiveCliBridgeBlock = adminAgentToolCallingSource.slice(adminLiveCliBridgeStart, adminLiveCliBridgeEnd);

assert.match(
  adminLiveCliBridgeBlock,
  /const liveText = result\.plan\.customerFacingMessages\.filter\(Boolean\)\.join\('\\n\\n'\)\.trim\(\);[\s\S]*hasTextualMediaTag\(liveText\)[\s\S]*return buildLiveCliFailureClosedResult[\s\S]*responseText:\s*liveText/,
  "bridge WhatsApp do processToolCallingMessage deve usar customerFacingMessages do Codex vivo e falhar fechado em tag textual de midia",
);

assert.doesNotMatch(
  adminLiveCliBridgeBlock,
  /sanitizeCustomerFacingResponseText|String\(result\?\.responseText/,
  "bridge WhatsApp do processToolCallingMessage nao deve sanitizar ou recompor texto publico do Codex CLI vivo",
);

assert.match(
  httpSource,
  /function resolveWebOnlyCodexScope[\s\S]*task\.startsWith\("prompt_edit"\)[\s\S]*"personalize_prompt"[\s\S]*RODRIGO_AGENT_CREATOR_EMAIL[\s\S]*"rodrigo_agent_creator"[\s\S]*"tenant_customer_support"/,
  "web-only deve escolher escopo por tarefa e email do dono",
);

const callWebOnlyLlmBlock = blockBetween(
  "async function callWebOnlyLlm(params:",
  "async function handleAgentTest",
);

assert.match(
  callWebOnlyLlmBlock,
  /const codexText = await runWebOnlyCodexCliText\(\{[\s\S]*task:\s*"web_only_llm"[\s\S]*onStructuredActions:\s*params\.onStructuredActions[\s\S]*channel:\s*"web_only_llm"/,
  "callWebOnlyLlm deve usar Codex CLI diretamente com contexto completo e actions estruturadas de midia",
);

assert.doesNotMatch(
  callWebOnlyLlmBlock,
  /shouldThrowWebOnlyOpenCodeFailure|buildWebOnlyAgenticSdkCandidates|getWebOnlyMistralChatKeys|chatComplete|legacyFallback|useOpenCodeMimo|forceOpenCodeGoCli/,
  "web-only nao deve manter SDK/provedor/fallback legado em callWebOnlyLlm",
);

const agenticTaskBlock = blockBetween(
  "async function runWebOnlyAgenticTask(params:",
  "type PromptEditLlmResult",
);

assert.match(
  agenticTaskBlock,
  /engine:\s*"codex_cli"[\s\S]*const text = await runWebOnlyCodexCliText\(\{[\s\S]*channel:\s*"web_only_agentic_task"/,
  "tarefas agenticas textuais devem usar Codex CLI como unico cerebro",
);

assert.doesNotMatch(
  agenticTaskBlock,
  /shouldUseWebOnlyOpenCodeForAgenticTask|legacyFallback|buildWebOnlyAgenticSdkCandidates|chatComplete|useOpenCodeMimo|forceOpenCodeGoCli|Mistral|NVIDIA/,
  "tarefas agenticas textuais nao devem conter fallback/provider antigo",
);

const promptEditBlock = blockBetween(
  "async function callPromptEditLlm(params:",
  "function isPromptEditConfirmation",
);

assert.match(
  promptEditBlock,
  /const text = await runWebOnlyCodexCliText\(\{[\s\S]*task:\s*"prompt_edit_llm"[\s\S]*provider:\s*"codex-cli"[\s\S]*strategy:\s*"codex_cli_prompt_edit"/,
  "edicao/configuracao do agente deve usar Codex CLI, nao OpenCode como cerebro",
);

assert.doesNotMatch(
  promptEditBlock,
  /isWebOnlyOpenCodeCliPreferred|isWebOnlyOpenCodeCliStrict|allowRuntimeFallback|buildPromptEditModelCandidates|chatComplete|useOpenCodeMimo|forceOpenCodeGoCli|Mistral|NVIDIA/,
  "edicao/configuracao nao deve cair para provedores legados quando Codex CLI vivo estiver ativo",
);

const generatePromptRouteBlock = routeBlockBetween(
  'app.post("/api/agent/generate-prompt"',
  'app.post("/api/agent/edit-prompt-stream"',
);

assert.match(
  generatePromptRouteBlock,
  /runWebOnlyCodexPromptTextForUser[\s\S]*task:\s*"prompt_edit_generate_initial"/,
  "geracao inicial de prompt deve usar o mesmo runtime Codex do Personalize quando ativo",
);

assert.doesNotMatch(
  generatePromptRouteBlock,
  /getLLMClient|useOpenCodeMimo|forceOpenCodeGoCli|mistral|Mistral|chatComplete/,
  "geracao inicial de prompt nao deve manter caminho legado/provider antigo",
);

const authenticatedSimulatorRouteBlock = routeBlockBetween(
  'app.post("/api/agent/test"',
  "// PARTE 5 - MODO FLUXO",
);

assert.match(
  authenticatedSimulatorRouteBlock,
  /runWebOnlyAgentTestForUser\(userId,[\s\S]*mode:\s*"codex_runtime_required_failed"[\s\S]*splitResponses:\s*\[\][\s\S]*mediaActions:\s*\[\]/,
  "simulador autenticado deve usar runWebOnlyAgentTestForUser e falhar fechado sem testAgentResponse legado",
);

const authenticatedSimulatorFailureBlock = authenticatedSimulatorRouteBlock.match(
  /mode:\s*"codex_runtime_required_failed"[\s\S]{0,700}mediaActions:\s*\[\]/,
)?.[0] || "";

assert.doesNotMatch(
  authenticatedSimulatorFailureBlock,
  /message:\s*"[^"]*(Codex|OpenCode|CLI|gpt-5)[^"]*"/,
  "mensagens de erro publicas do simulador nao devem expor ferramenta/modelo interno",
);

assert.doesNotMatch(
  httpSource,
  /agenteZapToolCallingFunnel|buildWebOnlyLiveCliRawSplitResponses\(agenteZapToolCallingFunnel\.text/,
  "web-only nao deve ter retorno antecipado de funil paralelo; o runtime Codex unificado deve responder",
);

assert.doesNotMatch(
  httpSource,
  /webOnlyLiveCliPrimaryResponseEnabled|!isAgenteZapLiveCliRuntimeEnabled\(\)/,
  "api/http.ts nao deve manter runtime legado atras de flag quando Codex CLI e o cerebro primario",
);

assert.match(
  httpSource,
  /mode:\s*"web_only_codex_cli"[\s\S]*action:\s*"codex_cli_context_only"/,
  "simulador web-only deve retornar pelo caminho unico Codex CLI context-only",
);

assert.match(
  httpSource,
  /function sanitizeWebOnlyLiveCliCustomerTextGuardrail[\s\S]*assistant_response[\s\S]*attention_json[\s\S]*routing_json[\s\S]*actions_json[\s\S]*\[NOTIFY:/,
  "Codex vivo web-only deve remover apenas artefatos internos antes de expor texto ao cliente",
);

const finalTextArtifactsBlock = blockBetween(
  "function sanitizeWebOnlyFinalCustomerTextArtifacts",
  "function escapeWebOnlyRegExpLiteral",
);

assert.match(
  finalTextArtifactsBlock,
  /total\\s\+final\\b[\s\S]*internamente[\s\S]*text\s*=\s*""/,
  "formula interna de total deve falhar fechado/vazio, sem frase publica local",
);

assert.doesNotMatch(
  finalTextArtifactsBlock,
  /Bom dia!\s*Fica|amounts\?\.length\s*\?\s*`Bom dia/,
  "guardrail final web-only nao deve escrever fala publica local para formula interna",
);

assert.match(
  httpSource,
  /function buildWebOnlyLiveCliRawSplitResponses\(text: unknown,\s*config\?: any\)[\s\S]*sanitizeWebOnlyLiveCliCustomerTextGuardrail\(text\)[\s\S]*parseWebOnlyBubbleMessages\(rawText,\s*\{\s*preserveUrlSchemes:\s*true\s*\}\)[\s\S]*splitWebOnlyMessageHumanLike\(rawText,\s*config\?\.message_split_chars/,
  "split bruto do Codex vivo deve passar por guardrails tecnicos de vazamento, [BOLHA], URL e limite do tenant sem reescrever texto publico",
);

assert.match(
  httpSource,
  /function normalizeWebOnlySplitResponsesForSend\(parts: unknown\[\]\)[\s\S]*sanitizeWebOnlyFinalCustomerTextArtifacts\(repairWebOnlyOutgoingText\(item\)\)[\s\S]*sanitizeWebOnlyFinalCustomerTextArtifacts\(repairWebOnlyOutgoingText\(part\)\)/,
  "bolhas finais enviadas pelo gateway devem remover [NOTIFY] e outros artefatos internos mesmo quando vierem em splitResponses",
);

assert.match(
  httpSource,
  /Preserve a URL exatamente como veio do prompt, historico ou contexto, incluindo http:\/\/ ou https:\/\//,
  "prompt universal de links nao deve orientar Codex vivo a remover esquema de URLs configuradas pelo tenant",
);

assert.match(
  httpSource,
  /const splitMessages = buildWebOnlyLiveCliRawSplitResponses\(cleanText,\s*config\)/,
  "retorno final web-only deve usar apenas splitter tecnico sobre texto do Codex vivo",
);

const mediaArbitratorBlock = blockBetween(
  "async function arbitrateWebOnlyMediaActionsWithAgenticRuntime(input:",
  "function normalizeNotifierPhoneDigits",
);

const disabledByRequestIndex = mediaArbitratorBlock.indexOf("skipped: \"disabled_by_request\"");
const deterministicLineBuilderIndex = mediaArbitratorBlock.indexOf(
  ["buildWebOnly", "DeterministicLineMediaActions"].join(""),
);
assert.ok(
  disabledByRequestIndex >= 0 && deterministicLineBuilderIndex < 0,
  "arbitro de midia web-only nao deve injetar midia deterministica local quando Codex CLI vivo e primario",
);

assert.match(
  mediaArbitratorBlock,
  /if \(input\.disabled === true\) \{[\s\S]*mediaActions,[\s\S]*skipped:\s*"disabled_by_request"/,
  "arbitro desativado deve devolver apenas as actions recebidas do contrato Codex",
);

assert.match(
  httpSource,
  /const manualNotification = detectManualWebOnlyNotification\(notificationConfig,[\s\S]*clientMessage: message,[\s\S]*agentMessage: splitMessages\.join\("\\n"\)/,
  "web-only deve detectar notificacao manual configurada mesmo quando Codex CLI vivo e o cerebro primario",
);

assert.match(
  httpSource,
  /async function sendWebOnlyAgentNotificationsForGatewayEvent\(params: \{[\s\S]*userId: string;[\s\S]*loadWebOnlyNotificationConfig\(params\.userId\)[\s\S]*detectManualWebOnlyNotification\(notificationConfig,[\s\S]*agentMessage: params\.agentMessage/,
  "envio gateway deve recalcular notificacao manual configurada quando o payload do Codex vier sem notification",
);

assert.match(
  httpSource,
  /async function maybePauseWebOnlyConversationAfterNotificationHandoff\(params: \{[\s\S]*SELECT COALESCE\(bac\.escalate_to_human, false\) AS "escalateToHuman"[\s\S]*INSERT INTO agent_disabled_conversations[\s\S]*auto_reactivate_after_minutes[\s\S]*VALUES \(\$1, NOW\(\), NULL, false, NULL\)/,
  "handoff por notificacao deve pausar somente a conversa quando o tenant habilitou escalate_to_human",
);

assert.doesNotMatch(
  httpSource,
  /maybePauseWebOnlyConversationAfterNotificationHandoff[\s\S]{0,2500}UPDATE whatsapp_connections[\s\S]{0,250}ai_enabled\s*=\s*false/,
  "handoff por notificacao nao pode desligar a conexao inteira do tenant",
);

for (const [pattern, description] of [
  [/buildTicoLocacoesDeterministicTurn|ticoLocacoesTurn/, "Tico Locacoes deterministic turn"],
  [/buildBusinessFaqDirectAnswer|business_faq_direct_answer|earlyBusinessFaqDirectAnswer/, "business FAQ direct answer"],
  [/applyWebOnlyAgenteZapStrictFunnelGuard|resolveWebOnlyAgenteZapStrictFunnelStage|buildWebOnlyAgenteZapStrictFunnelMediaActions/, "AgenteZap strict funnel guard"],
  [/buildWebOnlyConfiguredFlowFastPathPayload|buildWebOnlyConfiguredFlowFallbackActions|WEB_ONLY_CONFIGURED_FLOW/, "configured flow fallback/fast path"],
  [/buildWebOnlyRecognizedCatalogSelectionResponse|buildWebOnlyExactCatalogSelectionResponseFromCodes|buildWebOnlyCatalogSelectionResponseFromAnalyzedImages/, "catalog selection legacy direct response"],
  [/buildWebOnlyArtReferenceCatalogContinuationResponse|buildMauricioMfcLinePriceInquiryReply|buildMauricioMfcPendingItemContinuationReply/, "tenant-specific legacy direct response"],
  [/buildEstacaoPizzaDelivery2StructuredReply/, "Estacao Pizza structured legacy builder"],
] as const) {
  assert.doesNotMatch(
    httpSource,
    pattern,
    `Web-only ${description} must be physically removed, not left as a disabled legacy route.`,
  );
}

const generateAIResponseStart = aiAgentSource.indexOf("export async function generateAIResponse(");
const generateAIResponseEnd = aiAgentSource.indexOf("async function runSimulatorOperationalInsights", generateAIResponseStart);
const generateAIResponseBody = generateAIResponseStart >= 0 && generateAIResponseEnd > generateAIResponseStart
  ? aiAgentSource.slice(generateAIResponseStart, generateAIResponseEnd)
  : "";

assert.ok(generateAIResponseBody, "generateAIResponse Codex-only wrapper must be present.");
assert.doesNotMatch(
  generateAIResponseBody,
  /liveCliPrimaryResponseEnabled|buildEstacaoPizzaDelivery2StructuredReply|resolveBittencourtDirectResponse|mauricioMfcPendingContinuation|neuropsiRuntimeResponse|applyFkSemijoiasResponsePolicy/,
  "Real WhatsApp generateAIResponse must no longer contain legacy branch builders behind Codex flags.",
);
assert.match(
  generateAIResponseBody,
  /runAiAgentCodexPrimaryTurn[\s\S]*codex_no_send/,
  "Real WhatsApp generateAIResponse must call Codex and fail closed on no_send.",
);

assert.doesNotMatch(
  httpSource,
  /buildWebOnlyAgenteZapToolCallingHistory|tryRunWebOnlyAgenteZapToolCallingFunnel/,
  "Web-only Rodrigo path must not keep the removed tool-calling funnel helpers.",
);

const realAgenteZapHistoryStart = adminAgentServiceSource.indexOf("const mappedHistory = session.conversationHistory.map");
const realAgenteZapHistoryEnd = adminAgentServiceSource.indexOf("const result = await processToolCallingMessage", realAgenteZapHistoryStart);
assert.ok(
  realAgenteZapHistoryStart >= 0 && realAgenteZapHistoryEnd > realAgenteZapHistoryStart,
  "Must locate real WhatsApp AgenteZap tool-calling history handoff.",
);
const realAgenteZapHistoryBlock = adminAgentServiceSource.slice(realAgenteZapHistoryStart, realAgenteZapHistoryEnd);
assert.match(
  realAgenteZapHistoryBlock,
  /const mappedHistory = session\.conversationHistory\.map\(m => \(\{[\s\S]*role:\s*m\.role as 'user' \| 'assistant'[\s\S]*content:\s*m\.content/,
  "Real WhatsApp Rodrigo/Codex caller must pass the loaded session history into processToolCallingMessage.",
);
assert.doesNotMatch(
  realAgenteZapHistoryBlock,
  /\.slice\(-\d+\)/,
  "Real WhatsApp Rodrigo/Codex bridge must pass the loaded conversation history without truncating it before processToolCallingMessage.",
);

assert.match(
  adminAgentToolCallingSource,
  /const historySlice = conversationHistory;[\s\S]*\.\.\.historySlice\.map\(m => \(\{ role: m\.role, content: m\.content \}\)\)/,
  "processToolCallingMessage must hand the received conversation history to Codex without a local slice window.",
);

assert.doesNotMatch(
  aiAgentSource,
  /export async function testAgentResponse|testAgentResponse\(/,
  "Authenticated simulator legacy function must be physically removed; simulators must use runWebOnlyAgentTestForUser/Codex CLI.",
);

console.log("webOnlyCodexCliRoutes.source.test.ts: ok");
