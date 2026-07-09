import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readSource = (...parts: string[]) => fs.readFileSync(path.resolve(root, ...parts), "utf8");

const adminAgentServiceSource = readSource("server", "adminAgentService.ts");
const adminAgentToolCallingSource = readSource("server", "adminAgentToolCalling.ts");
const actionExecutorSource = readSource("server", "actionExecutorV2.ts");
const pendingPolicySource = readSource("server", "adminPendingActionExecutionPolicy.ts");
const adminSetupRequestSource = readSource("server", "adminSetupRequestService.ts");
const codexRuntimeSource = readSource("server", "agenteZapCodexCliRuntime.ts");
const graphStateSource = readSource("server", "adminAgentGraphState.ts");
const apiHttpSource = readSource("api", "http.ts");
const removedGraphRuntimeFiles = [
  path.resolve(root, "server", "adminAgentGraphClassifier.ts"),
  path.resolve(root, "server", "adminAgentGraphPolicy.ts"),
  path.resolve(root, "server", "adminAgentGraphExecutor.ts"),
  path.resolve(root, "server", "adminAgentGraphValidator.ts"),
  path.resolve(root, "server", "adminAgentTurnAuditor.ts"),
  path.resolve(root, "server", "adminAgentOutputSanitizer.ts"),
  path.resolve(root, "server", "opencodeMimoAgent.ts"),
];

const liveProcessStart = adminAgentToolCallingSource.indexOf("export async function processToolCallingMessage");
const liveCliCallIndex = adminAgentToolCallingSource.indexOf("const liveCliRuntimeResult = await maybeRunAgenteZapLiveCliRuntime");
const failureClosedStart = adminAgentToolCallingSource.indexOf("function buildLiveCliFailureClosedResult");
const failureClosedBlock = adminAgentToolCallingSource.slice(failureClosedStart, failureClosedStart + 500);
const codexPolicyStart = pendingPolicySource.indexOf("codex_create_agent_contract:");
const codexPolicyBlock = pendingPolicySource.slice(codexPolicyStart, codexPolicyStart + 260);
const executeCodexContractStart = actionExecutorSource.indexOf("export async function executeCodexCreateAgentContract");
const executeCodexContractBlock = actionExecutorSource.slice(executeCodexContractStart, executeCodexContractStart + 6500);
const createdAgentValidationFailureStart = actionExecutorSource.indexOf("function hasCreatedAgentValidationFailureText");
const createdAgentValidationFailureBlock = actionExecutorSource.slice(
  createdAgentValidationFailureStart,
  createdAgentValidationFailureStart + 700,
);
const webOnlyManualAgentRespondStart = apiHttpSource.indexOf("async function handleAgentRespond");
const webOnlyManualAgentRespondEnd = apiHttpSource.indexOf("function isInternalGatewayEventAuthorized", webOnlyManualAgentRespondStart);
const webOnlyManualAgentRespondBlock = apiHttpSource.slice(webOnlyManualAgentRespondStart, webOnlyManualAgentRespondEnd);
const webOnlyGatewayAgentStart = apiHttpSource.indexOf("async function runVercelAgentForGatewayEvent");
const webOnlyGatewayAgentEnd = apiHttpSource.indexOf("function isInternalGatewayEventAuthorized", webOnlyGatewayAgentStart);
const webOnlyGatewayAgentBlock = apiHttpSource.slice(webOnlyGatewayAgentStart, webOnlyGatewayAgentEnd);
const adminProcessStart = adminAgentServiceSource.indexOf("export async function processAdminMessage");
const adminProcessEnd = adminAgentServiceSource.indexOf("async function findUserByPhone", adminProcessStart);
const adminProcessBlock = adminAgentServiceSource.slice(adminProcessStart, adminProcessEnd);

assert.ok(liveProcessStart >= 0, "Must locate processToolCallingMessage.");
assert.ok(liveCliCallIndex >= 0, "Admin path must call the live Codex CLI runtime.");
assert.ok(createdAgentValidationFailureStart >= 0, "Must locate created-agent validation failure guard.");
assert.ok(webOnlyManualAgentRespondStart >= 0, "Must locate manual agent respond route.");
assert.ok(webOnlyGatewayAgentStart >= 0, "Must locate gateway agent runtime.");
assert.ok(adminProcessStart >= 0, "Must locate processAdminMessage.");
assert.ok(adminProcessEnd > adminProcessStart, "Must isolate processAdminMessage body.");

assert.match(
  adminAgentToolCallingSource,
  /const context = await gatherClientContext\(userId,\s*phoneNumber,\s*runtimeOptions\?\.conversationId\)/,
  "Codex must receive gathered tenant/conversation context before sensitive decisions.",
);

assert.match(
  adminAgentToolCallingSource,
  /maybeRunAgenteZapLiveCliRuntime\(\{[\s\S]*messages:\s*liveCliMessages as ChatMessage\[\][\s\S]*contextArtifacts:\s*\{[\s\S]*adminToolCallingContext:\s*context[\s\S]*agentConfig[\s\S]*pendingMedia:[\s\S]*recentMediaBuffer:[\s\S]*currentMediaEvidence:/,
  "Live Codex runtime must receive transcript plus tenant, agent, media, pending and evidence context.",
);

assert.doesNotMatch(
  adminAgentToolCallingSource,
  /maybeRunAgenteZapLiveCliRuntime\(\{[\s\S]*messages:\s*messages as ChatMessage\[\]/,
  "Legacy tool-calling system prompt must not be sent as the Codex conversation transcript.",
);

assert.doesNotMatch(
  adminAgentToolCallingSource,
  /shouldPreferOpenCodeForAdminToolCalling|processWithJsonFallback|chatComplete\(|useOpenCodeMimo|forceOpenCodeGoCli|withMistralClientFallback|skipMistralQueue|tryExecuteDirectAccountIntent|decidePendingActionReply/,
  "Admin bridge must not keep fallback/provider branches or local semantic intent decisions.",
);

assert.match(
  codexRuntimeSource,
  /required:\s*\['type',\s*'requiresConfirmation',\s*'reason',\s*'arguments'\]/,
  "Codex action schema must describe structured capabilities without a legacy tool field.",
);

assert.doesNotMatch(
  codexRuntimeSource,
  /\btool\b|ferramenta|ferramentas/,
  "Codex runtime prompt/schema must not frame creation as a local tool brain.",
);

assert.match(
  adminAgentToolCallingSource,
  /const createAction = firstLiveCliAction\(result\.plan\.actions,\s*\[[\s\S]*'summarize_before_create_agent'[\s\S]*'prepare_create_agent'[\s\S]*'revise_agent_summary'/,
  "Create-agent intent must come from Codex JSON actions, not local intent detection.",
);

assert.match(
  adminAgentToolCallingSource,
  /function buildCodexCreateAgentPendingContract[\s\S]*type:\s*'codex_create_agent_contract'[\s\S]*sourceCustomerBrief/,
  "Pending creation must be a Codex create-agent contract carrying the customer brief/context.",
);

assert.match(
  adminAgentToolCallingSource,
  /executeCodexCreateAgentContract\(\{[\s\S]*phoneNumber:\s*params\.phoneNumber[\s\S]*payload:\s*pendingContract\.payload/,
  "Admin path must execute only the structured Codex create-agent contract.",
);

assert.doesNotMatch(
  adminAgentToolCallingSource,
  /function normalizeCreateAgentDeliveryText|buildCreatePendingActionFromAssistantOffer|tryRecoverImplicitCreateConfirmation|inferPendingActionFromAssistantReply|recentAssistantOfferedAgentCreation|criar_agente|CRIAR_CONTA_TESTE/,
  "Legacy create-agent local helpers/actions must not exist in admin tool calling.",
);

assert.match(
  failureClosedBlock,
  /responseText:\s*''[\s\S]*newPendingAction:\s*params\.pendingAction[\s\S]*clearPendingAction:\s*false/,
  "Live Codex failure must fail closed with no executor-authored public text.",
);

assert.match(
  actionExecutorSource,
  /case 'codex_create_agent_contract':[\s\S]*return executeCodexCreateAgentContract\(\{/,
  "Action executor must expose only the Codex create-agent contract side effect.",
);

assert.doesNotMatch(
  actionExecutorSource,
  /case\s+['"]criar_agente['"]|type:\s*['"]criar_agente['"]|CRIAR_CONTA_TESTE/,
  "Action executor must not keep the old criar_agente action.",
);

assert.match(
  executeCodexContractBlock,
  /agentConfig\.codexCreateAgentContract = true[\s\S]*createTestAccountWithCredentials\(session\)[\s\S]*validateCreatedAgentBeforeDelivery\(\{[\s\S]*simulatorToken:\s*testResult\.simulatorToken[\s\S]*artifacts:\s*CodexCreateAgentExecutionArtifacts[\s\S]*simulatorUrl:\s*buildSimulatorUrl\(credentials\.simulatorToken\)[\s\S]*responseText:\s*''/,
  "Codex contract executor must materialize and validate, then return neutral artifacts without authoring public delivery text.",
);

assert.match(
  adminAgentToolCallingSource,
  /renderCodexCreateAgentDeliveryMessage[\s\S]*codexCreateAgentExecution[\s\S]*customerFacingMessages[\s\S]*simulatorUrl/,
  "Public create-agent delivery must be rendered by a second Codex pass using validated side-effect evidence.",
);

assert.match(
  adminAgentToolCallingSource,
  /function extractPublicUrlsFromText[\s\S]*function isCodexAuthoredCreateAgentDeliveryTextValid[\s\S]*uniqueUrls\.length !== 1[\s\S]*plans\|conexao\|connect\|login[\s\S]*senha\|password\|credencia/,
  "Codex-authored create-agent delivery must validate exact public URLs and reject panel/credentials/plan links.",
);

assert.match(
  adminAgentToolCallingSource,
  /executeCodexCreateAgentContract\(\{[\s\S]*renderCodexCreateAgentDeliveryMessage\(\{[\s\S]*executionResult/s,
  "Create-agent execution result must be passed back to Codex before any public delivery message is sent.",
);

assert.match(
  actionExecutorSource,
  /validateCreatedAgentBeforeDelivery[\s\S]*runWebOnlyAgentTestForUser[\s\S]*skipAccessCheck:\s*true[\s\S]*history\.push\(\{ role: "user"[\s\S]*history\.push\(\{ role: "assistant"/,
  "Generated agent validation must use the real/equivalent public test runtime with accumulated conversation history.",
);

assert.doesNotMatch(
  executeCodexContractBlock,
  /responseText:\s*['"][^'"]*(Nao foi possivel|Ocorreu um erro|instabilidade|mande a mensagem)/i,
  "Codex create-agent side-effect failures must not author public fallback text.",
);

assert.doesNotMatch(
  actionExecutorSource,
  /function buildValidatedCreateAgentDeliveryText|Teste seu agente aqui|Pronto\. Criei|Pronto\. Atualizei|Entra e conversa com ele/,
  "Action executor must not author the final create-agent public copy or link delivery.",
);

assert.doesNotMatch(
  createdAgentValidationFailureBlock,
  /normalized\.includes\("api"\)/,
  "Created-agent validation must not reject normal words like aparelho because they contain the substring api.",
);

assert.match(
  createdAgentValidationFailureBlock,
  /\/\\bapi\\b\//,
  "Created-agent validation should reject the technical term API only as a standalone word.",
);

assert.match(
  adminAgentServiceSource,
  /function isCodexCreateAgentContractSession[\s\S]*codexCreateAgentContract[\s\S]*function buildCodexCreateAgentTenantPrompt/,
  "Materialization must have a dedicated context-only session path for Codex-created agents.",
);

assert.doesNotMatch(
  adminAgentServiceSource,
  /generateProfessionalAgentPrompt|commonNames\[Math\.floor\(Math\.random\(\)|CODEX_CREATE_AGENT_CONTRACT_REQUIRED[\s\S]{0,120}catch/,
  "Create-agent materialization must remove the legacy prompt generator, random-name branch and catch-and-continue contract bypass.",
);

assert.match(
  adminAgentServiceSource,
  /if \(!codexCreateAgentContract\) \{[\s\S]*throw new Error\("CODEX_CREATE_AGENT_CONTRACT_REQUIRED"\)[\s\S]*const fullPrompt = buildCodexCreateAgentTenantPrompt\([\s\S]*const modelForAgentConfig = resolveCodexCreatedAgentModel\(\)/,
  "Agent materialization must fail closed without a Codex contract and use the Codex context prompt/model path.",
);

assert.match(
  adminAgentServiceSource,
  /function normalizePhoneForAccount\(phoneNumber: string\): string \{[\s\S]*return String\(phoneNumber \|\| ""\)\.replace\(\/\\D\/g,\s*""\)/,
  "Admin agent service must define normalizePhoneForAccount for create-agent account creation.",
);

assert.match(
  adminAgentServiceSource,
  /export async function createTestAccountWithCredentials[\s\S]*const cleanPhone = normalizePhoneForAccount\(session\.phoneNumber\)/,
  "Codex create-agent account creation must normalize the lead phone with the shared helper.",
);

assert.match(
  actionExecutorSource,
  /function normalizeCustomerEmailForCreateAgent[\s\S]*email\.endsWith\('@agentezap\.online'\)[\s\S]*eu@email\.com[\s\S]*example/,
  "Create-agent email normalization must reject technical AgenteZap fallback emails and obvious OCR/example placeholders.",
);

assert.match(
  actionExecutorSource,
  /function extractCustomerEmailFromCreateAgentPayload[\s\S]*const matches = text\.match\([^)]+@[^\n]+\)[\s\S]*normalizeCustomerEmailForCreateAgent\(match\)/,
  "Codex create-agent contract must extract only literal non-AgenteZap customer emails from payload or preserved customer brief.",
);

assert.match(
  actionExecutorSource,
  /function canonicalizeAgenteZapPublicBaseUrl[\s\S]*www\.agentezap\.online[\s\S]*parsed\.hostname\.toLowerCase\(\) === 'agentezap\.online'[\s\S]*export function buildSimulatorUrl[\s\S]*canonicalizeAgenteZapPublicBaseUrl\(process\.env\.APP_URL\)[\s\S]*\/test\/\$\{token\}/,
  "Codex create-agent simulator URLs must use the public AgenteZap www domain even when APP_URL is configured without www.",
);

assert.match(
  adminAgentServiceSource,
  /function canonicalizeAgenteZapPublicBaseUrl[\s\S]*www\.agentezap\.online[\s\S]*parsed\.hostname\.toLowerCase\(\) === "agentezap\.online"/,
  "Admin agent service must define a public AgenteZap URL canonicalizer that prefers www.",
);

assert.match(
  adminAgentServiceSource,
  /function buildSimulatorLink[\s\S]*canonicalizeAgenteZapPublicBaseUrl\(loginUrl \|\| process\.env\.APP_URL\)[\s\S]*\/test\/\$\{simulatorToken\}/,
  "Admin agent simulator links must canonicalize AgenteZap public links to www before delivery.",
);

assert.match(
  adminSetupRequestSource,
  /simulatorUrl:\s*`https:\/\/www\.agentezap\.online\/test\/\$\{simulatorToken\}`/,
  "Admin setup requests must store public test links with the www AgenteZap domain.",
);

assert.match(
  actionExecutorSource,
  /const resolvedCustomerEmail = extractCustomerEmailFromCreateAgentPayload\([\s\S]*payload\.customerEmail[\s\S]*payload\.leadEmail[\s\S]*payload\.contactEmail[\s\S]*payload\.accountEmail[\s\S]*payload\.sourceCustomerBrief[\s\S]*payload\.fullCustomerContext[\s\S]*agentConfig\.customerEmail = resolvedCustomerEmail/,
  "Codex create-agent contract must pass customer email from structured fields or preserved sourceCustomerBrief into account creation context when available.",
);

assert.match(
  codexRuntimeSource,
  /arguments\.customerEmail[\s\S]*Nao invente e-mail[\s\S]*customerEmail null/,
  "Rodrigo create-agent runtime contract must tell Codex to copy an explicit customer email and never invent one.",
);

assert.match(
  adminAgentServiceSource,
  /customerEmail\?: string/,
  "Create-agent session config must carry a validated customer email when Codex extracts one.",
);

assert.match(
  adminAgentServiceSource,
  /function normalizeCustomerEmailForAccount\(value: unknown\): string[\s\S]*email\.endsWith\("@agentezap\.online"\)[\s\S]*eu@email\.com[\s\S]*example[\s\S]*const email =[\s\S]*normalizeCustomerEmailForAccount\(\(session\.agentConfig as any\)\?\.customerEmail\)[\s\S]*generateTempEmail\(session\.phoneNumber\)/,
  "Account creation must prefer a real customer email and fall back to the technical phone email only when needed, rejecting obvious placeholders.",
);

assert.doesNotMatch(
  actionExecutorSource,
  /buildAdminPlanReplyText|Fluxo \*|M.dia \*|Para salvar esse fluxo|Para salvar a m.dia|A..o desconhecida|Teste no simulador agora/s,
  "Action executor must not author media/plan/unknown-action public copy.",
);

assert.doesNotMatch(
  graphStateSource,
  /create_agent|Perfeito! Vou criar|Perfeito! Criando|criar agente automaticamente/,
  "State-only graph support must not retain create-agent routing/copy.",
);

assert.deepEqual(
  removedGraphRuntimeFiles.filter((file) => fs.existsSync(file)),
  [],
  "Legacy graph/OpenCode classifier/policy/executor/validator/auditor/sanitizer/brain modules must be physically removed.",
);

assert.doesNotMatch(
  adminAgentServiceSource,
  /shouldCreateAgent bloqueado/,
  "Admin service must not depend on a late block for graph create-agent side effects.",
);

assert.match(
  adminProcessBlock,
  /processToolCallingMessage\([\s\S]*customerResponseText[\s\S]*return \{[\s\S]*text:\s*customerResponseText[\s\S]*Codex\/tool-calling finished without valid public text; legacy admin fallback removed[\s\S]*return null;/,
  "Admin service must rely on structured tool-calling output and fail closed when it has no valid public text.",
);

assert.doesNotMatch(
  adminProcessBlock,
  /isAgenteZapLiveCliRuntimeEnabled|generateAIResponse|parseActions|executeActions|buildPixPaymentInstructions|scheduleInitialFollowUpByPhone|awaitingPaymentProof|messageText\.match|#limpar|#reset|#novo|#reset-suave/,
  "processAdminMessage must not keep flag/regex-gated local public-reply/action bypasses around tool-calling.",
);

assert.doesNotMatch(
  adminAgentServiceSource,
  /export async function generateAIResponse|function parseActions|export async function executeActions|Legacy admin prompt stubs/,
  "Admin service must not keep orphaned legacy public-reply/action parser exports.",
);

assert.doesNotMatch(
  adminAgentServiceSource,
  /function (?:buildReturningClientGreeting|buildExistingAccountSetupIntro|buildUnlinkedEditHelp|buildGuidedIntroQuestion|buildGuidedContextPreservingAnswer|buildGuidedStageClarification|buildAdminEditLimitMessage|getPendingGuidedQuestion|getGuidedBusinessQuestion|getGuidedBehaviorQuestion|getGuidedWorkflowQuestion|getGuidedHoursQuestion|getGuidedMissingHoursQuestion|inferSalonLabel)\b|agentezap\.online\/settings/,
  "Admin service must not keep dead local public-reply builders or guided-question stubs outside the Codex contract.",
);

assert.doesNotMatch(
  adminAgentServiceSource,
  /classifyEditIntentWithLLM|maybeApplyStructuredExistingClientUpdate|admin_existing_client_edit_json|EDIT-LLM|hasEditIntent/,
  "Admin service must not keep dead local edit-intent classifiers or structured existing-client update stubs.",
);

assert.doesNotMatch(
  adminAgentServiceSource,
  /CRIAR_CONTA_TESTE|AUTO-FACTORY|shouldAutoCreateTestAccount|hasConfirmedAgentCreationThisTurn|createAllowedThisTurn|createConfirmedThisTurn|safeActions/,
  "Admin service must not keep local create-agent tags, auto-factory shortcuts or confirmation detectors.",
);

assert.match(
  pendingPolicySource,
  /codex_create_agent_contract/,
  "Pending-action policy must know the Codex create-agent contract type.",
);

assert.doesNotMatch(
  pendingPolicySource,
  /criar_agente|CRIAR_CONTA_TESTE/,
  "Pending-action policy must not keep the old create-agent type.",
);

assert.match(
  codexPolicyBlock,
  /maxAttempts:\s*1[\s\S]*retryBaseDelayMs:\s*0[\s\S]*keepPendingAliveMs:\s*12\s*\*\s*60_000/,
  "Codex create-agent failures must remain pending/fail-closed with no retry delay.",
);

assert.doesNotMatch(
  pendingPolicySource,
  /recoveryReply|buildPendingActionRecoveryReply|buildGenericAssistantFallbackReply/,
  "Pending-action policy must not carry local public recovery/fallback copy.",
);

assert.match(
  adminSetupRequestSource,
  /executeCodexCreateAgentContract\(\{[\s\S]*phoneNumber:\s*conversation\.contactNumber[\s\S]*sourceCustomerBrief:\s*JSON\.stringify\(plan\)/,
  "Admin setup execution must go through the same Codex create-agent contract executor.",
);

assert.match(
  adminSetupRequestSource,
  /createResult\.artifacts\?\.simulatorToken[\s\S]*createResult\.artifacts\?\.simulatorUrl/,
  "Admin setup must consume simulator artifacts from the deterministic executor instead of parsing public response text.",
);

assert.doesNotMatch(
  adminSetupRequestSource,
  /createTestAccountWithCredentials\(/,
  "Admin setup must not bypass the Codex create-agent contract executor.",
);

assert.match(
  apiHttpSource,
  /allowRodrigoCreateAgentContract:\s*true[\s\S]*abortSignal:\s*generationAbort\.signal/,
  "WhatsApp real must explicitly opt into Rodrigo create-agent side effects and carry the generation abort signal.",
);

assert.match(
  webOnlyGatewayAgentBlock,
  /const history = mapMessageRowsToWebOnlyHistory\(rowsBeforePrompt\)/,
  "Gateway WhatsApp agent must pass the full loaded conversation history to Codex, not only the last 16 rows.",
);

assert.doesNotMatch(
  webOnlyGatewayAgentBlock,
  /rowsBeforePrompt\.slice\(-16\)/,
  "Gateway WhatsApp agent must not silently drop older lead context such as email/business details.",
);

assert.match(
  webOnlyManualAgentRespondBlock,
  /const history = mapMessageRowsToWebOnlyHistory\(rowsBeforePrompt\)/,
  "Manual agent response route must pass the full loaded conversation history to Codex, not only the last 16 rows.",
);

assert.doesNotMatch(
  webOnlyManualAgentRespondBlock,
  /rowsBeforePrompt\.slice\(-16\)/,
  "Manual agent response route must not silently drop older lead context such as email/business details.",
);

assert.match(
  apiHttpSource,
  /function buildWebOnlyCreateAgentSourceBrief[\s\S]*extractWebOnlyCustomerEmailFromHistory[\s\S]*Email explicito no historico[\s\S]*\.map\(\(entry\) =>/,
  "Web-only create-agent source brief must preserve full history context and surface exact customer emails as neutral evidence.",
);

assert.match(
  apiHttpSource,
  /body\.allowRodrigoCreateAgentContract === true[\s\S]*createAgentSourceEvidence = buildWebOnlyCreateAgentSourceEvidence/,
  "Rodrigo create-agent runtime must attach neutral source evidence before Codex generation when side effects are explicitly enabled.",
);

assert.match(
  apiHttpSource,
  /function buildWebOnlyCreateAgentSourceEvidence[\s\S]*sourceCustomerBrief[\s\S]*customerEmail[\s\S]*historyLength/,
  "Create-agent source evidence must carry the preserved briefing and literal customer email as data transport, not as a local decision.",
);

assert.match(
  apiHttpSource,
  /function normalizeWebOnlyCustomerEmail\(value: unknown\): string[\s\S]*eu@email\.com[\s\S]*example[\s\S]*function extractWebOnlyCustomerEmailFromText/,
  "Web-only create-agent email extraction must reject placeholder emails from OCR/examples before selecting the real lead email.",
);

assert.match(
  apiHttpSource,
  /function normalizeWebOnlyCreateAgentUrl[\s\S]*parsed\.hostname\.toLowerCase\(\) === "agentezap\.online"[\s\S]*www\.agentezap\.online[\s\S]*Links publicos do AgenteZap devem aparecer com o dominio completo https:\/\/www\.agentezap\.online/,
  "Web-only Codex create-agent delivery must canonicalize and instruct public AgenteZap links with www.",
);

assert.match(
  adminAgentToolCallingSource,
  /function normalizePublicUrlForComparison[\s\S]*parsed\.hostname\.toLowerCase\(\) === 'agentezap\.online'[\s\S]*www\.agentezap\.online[\s\S]*Links publicos do AgenteZap devem aparecer com o dominio completo https:\/\/www\.agentezap\.online/,
  "Admin Codex create-agent delivery must canonicalize and instruct public AgenteZap links with www.",
);

assert.doesNotMatch(
  apiHttpSource,
  /function buildWebOnlyCreateAgentSourceBrief[\s\S]*\.slice\(-16\)[\s\S]*function buildWebOnlyCreateAgentPayload/,
  "Web-only create-agent source brief must not silently truncate to the last 16 turns before executor side effects.",
);

assert.match(
  apiHttpSource,
  /const sourceEvidence = extractWebOnlyCreateAgentSourceEvidence\(params\.contextArtifacts\)[\s\S]*const actionSourceCustomerBrief = getWebOnlyActionStringArg[\s\S]*sourceEvidence\.sourceCustomerBrief[\s\S]*actionSourceCustomerBrief[\s\S]*const supplementalActionBrief[\s\S]*const fullSourceCustomerBrief[\s\S]*normalizeWebOnlyCustomerEmail\(getWebOnlyActionStringArg\(args, \[[\s\S]*"customerEmail"[\s\S]*"accountEmail"[\s\S]*sourceEvidence\.customerEmail[\s\S]*extractWebOnlyCustomerEmailFromHistory\(params\.history, params\.message\)[\s\S]*extractWebOnlyCustomerEmailFromText\(fullSourceCustomerBrief\)[\s\S]*sourceCustomerBrief: fullSourceCustomerBrief[\s\S]*customerEmail: customerEmail \|\| null/,
  "Web-only create-agent payload must preserve neutral source evidence over Codex summaries and normalize Codex email args before using full history/brief email data.",
);

assert.doesNotMatch(
  apiHttpSource,
  /const customerEmail =\s*getWebOnlyActionStringArg\(args, \["customerEmail", "email", "leadEmail", "contactEmail", "accountEmail"\]\)/,
  "Web-only create-agent payload must not let a raw Codex email argument mask a real email preserved in source evidence.",
);

assert.match(
  apiHttpSource,
  /body\.allowRodrigoCreateAgentContract === true[\s\S]*maybeExecuteWebOnlyRodrigoCreateAgentAction/,
  "Web-only runtime must not enable create-agent side effects unless the caller explicitly opts in.",
);

assert.match(
  apiHttpSource,
  /ownerEmail !== RODRIGO_AGENT_CREATOR_EMAIL[\s\S]*return null/,
  "Create-agent side effect in the web-only route must remain isolated to Rodrigo owner scope.",
);

assert.match(
  apiHttpSource,
  /Rodrigo create-agent action without companyName[\s\S]*return "";/,
  "Invalid create-agent actions must fail closed instead of sending the original Codex text without a side effect.",
);

assert.match(
  apiHttpSource,
  /web_only_codex_request_aborted_before_start[\s\S]*web_only_codex_request_aborted_after_generation[\s\S]*params\.onStructuredActions\?\./,
  "Abort/freshness signal must be checked before structured actions can be exposed to side-effect executors.",
);

assert.match(
  apiHttpSource,
  /executeCodexCreateAgentContract\(\{[\s\S]*renderWebOnlyCodexCreateAgentDeliveryMessage\(\{/,
  "Web-only Rodrigo create-agent path must materialize via the Codex contract and then ask Codex to render delivery text from validated evidence.",
);

assert.match(
  adminSetupRequestSource,
  /SETUP_RESULT_PUBLIC_DELIVERY_REQUIRES_CODEX_RUNTIME/,
  "Assisted setup must fail closed instead of sending local public setup delivery text.",
);

assert.doesNotMatch(
  adminSetupRequestSource,
  /sendAdminConversationMessage[\s\S]*executionResult\.simulatorUrl|Teste:\s*\$\{executionResult\.simulatorUrl\}|Painel:\s*\$\{executionResult\.panelUrl\}/,
  "Assisted setup must not author public simulator/panel delivery text locally.",
);

assert.doesNotMatch(
  [
    adminAgentToolCallingSource,
    actionExecutorSource,
    pendingPolicySource,
    adminSetupRequestSource,
  ].join("\n"),
  /Tive uma instabilidade|Mande a mensagem de novo|mande a mensagem de novo|Perfeito\. Vou montar o agente|vou montar o agente de teste/i,
  "Create-agent runtime/executor code must not contain fixed customer-facing fallback or delivery copy.",
);
