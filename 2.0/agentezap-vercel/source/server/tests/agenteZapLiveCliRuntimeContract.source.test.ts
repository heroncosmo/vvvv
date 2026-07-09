import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const codexRuntimeSource = fs.readFileSync(path.resolve(root, 'server', 'agenteZapCodexCliRuntime.ts'), 'utf8');
const liveRuntimeBridgeSource = fs.readFileSync(path.resolve(root, 'server', 'agenteZapLiveCliRuntime.ts'), 'utf8');
const adminSource = fs.readFileSync(path.resolve(root, 'server', 'adminAgentToolCalling.ts'), 'utf8');
const flowScriptEngineSource = fs.readFileSync(path.resolve(root, 'server', 'flowScriptEngine.ts'), 'utf8');
const llmConfigResolverSource = fs.readFileSync(path.resolve(root, 'server', 'llmConfigResolver.ts'), 'utf8');
const sharedSchemaSource = fs.readFileSync(path.resolve(root, 'shared', 'schema.ts'), 'utf8');
const dockerfileSource = fs.readFileSync(path.resolve(root, 'Dockerfile.vps'), 'utf8');

test('live CLI runtime is a thin bridge to the new Codex CLI module', () => {
  assert.match(liveRuntimeBridgeSource.trim(), /^export \* from '\.\/agenteZapCodexCliRuntime';$/);
});

test('Codex CLI runtime runs codex exec with context files and structured schema', () => {
  assert.match(codexRuntimeSource, /spawn\(getCodexBinary\(\), args/);
  assert.match(codexRuntimeSource, /'exec'/);
  assert.match(codexRuntimeSource, /'--ignore-user-config'/);
  assert.match(codexRuntimeSource, /'--ephemeral'/);
  assert.match(codexRuntimeSource, /'--sandbox'[\s\S]*'read-only'/);
  assert.match(codexRuntimeSource, /'--json'/);
  assert.match(codexRuntimeSource, /'--output-schema'/);
  assert.match(codexRuntimeSource, /'--output-last-message'/);
  assert.match(codexRuntimeSource, /'--cd'[\s\S]*params\.projectRoot/);
  assert.match(codexRuntimeSource, /CODEX_HOME:\s*codexHome/);
  assert.match(codexRuntimeSource, /codex login --device-auth/);
  assert.match(codexRuntimeSource, /function writeCodexCliContextFiles/);
  assert.match(codexRuntimeSource, /00-runtime-contract\.md/);
  assert.match(codexRuntimeSource, /01-turn\.json/);
  assert.match(codexRuntimeSource, /02-conversation\.md/);
  assert.match(codexRuntimeSource, /03-conversation\.json/);
  assert.match(codexRuntimeSource, /04-pending-action\.json/);
  assert.match(codexRuntimeSource, /05-output-schema\.json/);
  assert.match(codexRuntimeSource, /06-allowed-actions\.json/);
  assert.match(codexRuntimeSource, /07-context-artifacts\.json/);
  assert.match(codexRuntimeSource, /08-tenant-prompt\.md/);
  assert.match(codexRuntimeSource, /extractTenantPromptContext/);
  assert.match(codexRuntimeSource, /root\?\.tenantContext\?\.effectivePrompt/);
  assert.match(codexRuntimeSource, /root\?\.tenantContext\?\.activePrompt/);
  assert.match(codexRuntimeSource, /contextArtifacts/);
  assert.match(codexRuntimeSource, /formatConversationMarkdown\(input\.messages\)/);
  assert.match(codexRuntimeSource, /buildAgenteZapCodexCliOutputSchema/);
  assert.match(codexRuntimeSource, /additionalProperties:\s*false/);
  assert.match(codexRuntimeSource, /schemaVersion:\s*\{\s*type:\s*'string',\s*const:\s*AGENTEZAP_LIVE_CLI_SCHEMA_VERSION\s*\}/);
  assert.match(codexRuntimeSource, /scope:\s*\{\s*type:\s*'string',\s*const:\s*effectiveScope\s*\}/);
  assert.match(codexRuntimeSource, /decision:\s*\{\s*type:\s*'string',\s*enum:/);
  assert.match(codexRuntimeSource, /type:\s*\{\s*type:\s*'string',\s*enum:\s*ALL_ACTIONS\s*\}/);
  assert.match(codexRuntimeSource, /required:\s*\['type',\s*'requiresConfirmation',\s*'reason',\s*'arguments'\]/);
  assert.doesNotMatch(codexRuntimeSource, /\btool\b|ferramenta|ferramentas/);
  assert.match(codexRuntimeSource, /additionalProperties:\s*false,[\s\S]*required:\s*ACTION_ARGUMENT_KEYS/);
  assert.match(codexRuntimeSource, /PACOTE CRITICO INLINE DE RECUPERACAO/);
  assert.match(codexRuntimeSource, /buildAgenteZapInlineRecoveryContext/);
  assert.match(codexRuntimeSource, /tenantPromptMarkdown/);
  assert.match(codexRuntimeSource, /tenantPromptInlineTruncated/);
  assert.match(codexRuntimeSource, /tenantPromptChars/);
  assert.match(codexRuntimeSource, /extractTenantPromptContext\(input\.contextArtifacts \|\| \{\}\)/);
  assert.match(codexRuntimeSource, /compactForInlineContext\(tenantPrompt,\s*tenantPromptInlineLimit\)/);
  assert.match(codexRuntimeSource, /planIndicatesSandboxReadFailure/);
  assert.match(codexRuntimeSource, /codex_cli_retry_after_sandbox_read_failure/);
  assert.match(codexRuntimeSource, /Isso e um falso bloqueio operacional quando existe o PACOTE CRITICO INLINE DE RECUPERACAO/);
});

test('inline recovery carries tenant prompt context without tenant-specific hardcode', () => {
  const inlineStart = codexRuntimeSource.indexOf('function buildAgenteZapInlineRecoveryContext');
  const inlineEnd = codexRuntimeSource.indexOf('function writeCodexCliContextFiles', inlineStart);
  assert.notEqual(inlineStart, -1, 'must locate inline recovery builder');
  assert.notEqual(inlineEnd, -1, 'must locate end of inline recovery builder');
  const inlineBlock = codexRuntimeSource.slice(inlineStart, inlineEnd);

  assert.match(inlineBlock, /const tenantPrompt = extractTenantPromptContext\(input\.contextArtifacts \|\| \{\}\)/);
  assert.match(inlineBlock, /tenantPromptInlineLimit/);
  assert.match(inlineBlock, /tenantPromptAvailable:\s*Boolean\(tenantPrompt\)/);
  assert.match(inlineBlock, /tenantPromptChars:\s*tenantPrompt\.length/);
  assert.match(inlineBlock, /tenantPromptInlineTruncated:\s*tenantPrompt\.length > tenantPromptInlineLimit/);
  assert.match(inlineBlock, /tenantPromptMarkdown:\s*tenantPrompt[\s\S]*compactForInlineContext\(tenantPrompt,\s*tenantPromptInlineLimit\)/);
  assert.doesNotMatch(inlineBlock, /Ceara|Cear[aá]|Rent A Car|Fazer um or[cç]amento|Reservar um carro|Ver requisitos/i);
});

test('Codex timeout retries through Codex itself instead of inventing public fallback text', () => {
  assert.match(codexRuntimeSource, /function isCodexRetryableExecutionTimeout/);
  assert.match(codexRuntimeSource, /text\.includes\('codex_exec_failed'\) && text\.includes\('timedout=true'\)/);
  assert.match(codexRuntimeSource, /function buildCodexExecutionTimeoutRetryInstructions/);
  assert.match(codexRuntimeSource, /AGENTEZAP_CODEX_CLI_TIMEOUT_RETRY_MS/);
  assert.match(codexRuntimeSource, /codex_cli_retry_after_timeout_before_final_json/);
  assert.match(codexRuntimeSource, /runWithOperationalRetry\(primaryModel\)/);
  assert.match(codexRuntimeSource, /runWithOperationalRetry\(fallbackModel/);
  assert.match(codexRuntimeSource, /A tentativa anterior do codex exec atingiu timeout antes de gravar um JSON final confiavel/);
  assert.match(codexRuntimeSource, /Isso nao autoriza resposta local, fallback textual, frase pronta, resumo inventado ou decisao fora do Codex/);
  assert.match(codexRuntimeSource, /A mensagem publica, se houver, ainda deve vir somente do prompt\/configuracao\/dados do tenant e do historico real/);
  assert.doesNotMatch(codexRuntimeSource, /timeout[\s\S]{0,600}Me conta/);
  assert.doesNotMatch(codexRuntimeSource, /timeout[\s\S]{0,600}Perfeito/);
});

test('Codex model selection keeps Rodrigo and Personalize on gpt-5.5 and excludes follow-up from Codex policy', () => {
  assert.match(codexRuntimeSource, /RODRIGO_AGENT_CREATOR_EMAIL\s*=\s*'rodrigo4@gmail\.com'/);
  assert.doesNotMatch(codexRuntimeSource, /function isCodexFollowupPlanTask/);
  assert.doesNotMatch(codexRuntimeSource, /AGENTEZAP_CODEX_CLI_FOLLOWUP_MODEL/);
  assert.doesNotMatch(codexRuntimeSource, /AGENTEZAP_CODEX_CLI_FOLLOWUP_REASONING_EFFORT/);
  assert.doesNotMatch(codexRuntimeSource, /=== 'followup_plan'/);
  assert.match(codexRuntimeSource, /AGENTEZAP_CODEX_CLI_RODRIGO_MODEL \|\| 'gpt-5\.5'/);
  assert.match(codexRuntimeSource, /params\.scope === 'personalize_prompt'[\s\S]*AGENTEZAP_CODEX_CLI_PERSONALIZE_MODEL \|\| 'gpt-5\.5'/);
  assert.match(codexRuntimeSource, /AGENTEZAP_CODEX_CLI_TENANT_MODEL \|\| 'gpt-5\.4-mini'/);
  assert.match(codexRuntimeSource, /AGENTEZAP_CODEX_CLI_TENANT_FALLBACK_MODEL \|\| 'gpt-5\.4-mini'/);
  assert.match(codexRuntimeSource, /function isCodexModelQuotaFailure/);
  assert.match(codexRuntimeSource, /!isRodrigoCodexOwner\(params\.ownerEmail\)[\s\S]*fallbackModel[\s\S]*isCodexModelQuotaFailure\(error\)/);
  assert.match(codexRuntimeSource, /normalizeEmail\(params\.ownerEmail\) === RODRIGO_AGENT_CREATOR_EMAIL/);
  assert.match(codexRuntimeSource, /model:\$\{usedModel\}/);
  assert.doesNotMatch(codexRuntimeSource, /model:gpt-5\.5/);
  assert.match(codexRuntimeSource, /tenant_model_fallback_from:\$\{primaryModel\}/);
  assert.match(codexRuntimeSource, /gpt-5\.4-mini/);
});

test('Rodrigo live CLI scopes can request tenant media through structured send_media actions', () => {
  const creatorStart = codexRuntimeSource.indexOf('const RODRIGO_CREATOR_ACTIONS');
  const creatorEnd = codexRuntimeSource.indexOf('const RODRIGO_EXISTING_ACCOUNT_ACTIONS', creatorStart);
  const existingStart = creatorEnd;
  const existingEnd = codexRuntimeSource.indexOf('const PERSONALIZE_ACTIONS', existingStart);
  assert.notEqual(creatorStart, -1, 'must locate Rodrigo creator actions');
  assert.notEqual(creatorEnd, -1, 'must locate end of Rodrigo creator actions');
  assert.notEqual(existingStart, -1, 'must locate Rodrigo existing-account actions');
  assert.notEqual(existingEnd, -1, 'must locate end of Rodrigo existing-account actions');

  const creatorActions = codexRuntimeSource.slice(creatorStart, creatorEnd);
  const existingActions = codexRuntimeSource.slice(existingStart, existingEnd);
  assert.match(creatorActions, /'send_media'/, 'Rodrigo creator scope must allow Codex-authored media actions');
  assert.match(existingActions, /'send_media'/, 'Rodrigo existing-account scope must allow Codex-authored media actions');
  assert.match(codexRuntimeSource, /Para send_media, use arguments\.mediaName com o nome exato da midia no contexto/);
  assert.doesNotMatch(codexRuntimeSource, /function\s+selectRodrigo.*Media|rodrigo.*media.*regex|MEDIA:\*\]/i);
});

test('Codex runtime does not contain OpenCode brain, local Rodrigo repair rules, or public fallback text repair', () => {
  assert.doesNotMatch(codexRuntimeSource, /chatComplete/);
  assert.doesNotMatch(codexRuntimeSource, /useOpenCodeMimo/);
  assert.doesNotMatch(codexRuntimeSource, /forceOpenCodeGoCli/);
  assert.doesNotMatch(codexRuntimeSource, /extractOpenCodeMimoEnvelope/);
  assert.doesNotMatch(codexRuntimeSource, /rodrigoCreator[A-Z]/);
  assert.doesNotMatch(codexRuntimeSource, /O caminho padrao e assistido pelo WhatsApp/);
  assert.doesNotMatch(codexRuntimeSource, /cumprimente quando fizer sentido/);
  assert.match(codexRuntimeSource, /Identidade, tom, oferta, ordem de perguntas e jeito de conduzir o lead devem vir do prompt\/configuracao do tenant Rodrigo/);
  assert.match(codexRuntimeSource, /Identidade, tom, saudacao, perguntas, oferta e estilo de mensagem devem vir do prompt\/configuracao\/dados do tenant/);
  assert.doesNotMatch(codexRuntimeSource, /buildMissingOutputFallbackMessage/);
  assert.doesNotMatch(codexRuntimeSource, /live_cli_missing_public_output_repaired/);
  assert.match(codexRuntimeSource, /codex_cli_missing_public_output_fail_closed/);
  assert.match(codexRuntimeSource, /codex_cli_failed_closed/);
  assert.match(codexRuntimeSource, /decision:\s*'no_send'/);
});

test('admin path uses only live Codex runtime for sensitive decisions and fails closed without invented text', () => {
  const processStart = adminSource.indexOf('export async function processToolCallingMessage');
  const liveCallIndex = adminSource.indexOf('const liveCliRuntimeResult = await maybeRunAgenteZapLiveCliRuntime');

  assert.notEqual(processStart, -1, 'must locate processToolCallingMessage');
  assert.notEqual(liveCallIndex, -1, 'admin path must call live CLI runtime');
  const processBeforeLiveCli = adminSource.slice(processStart, liveCallIndex);
  assert.match(
    processBeforeLiveCli,
    /const context = await gatherClientContext\(userId,\s*phoneNumber,\s*runtimeOptions\?\.conversationId\)/,
  );
  assert.match(adminSource, /contextArtifacts:\s*\{[\s\S]*adminToolCallingContext:\s*context[\s\S]*agentConfig[\s\S]*pendingMedia:\s*pendingMedia[\s\S]*recentMediaBuffer:\s*recentMediaBuffer/);
  assert.doesNotMatch(
    adminSource,
    /tryRecoverImplicitCreateConfirmation|tryExecuteDirectAccountIntent|decidePendingActionReply|processWithJsonFallback|shouldPreferOpenCodeForAdminToolCalling/,
    'local recovery, direct intent, pending decision and fallback JSON must not exist in the live admin bridge',
  );
  assert.doesNotMatch(adminSource, /chatComplete\(|useOpenCodeMimo|forceOpenCodeGoCli|withMistralClientFallback|skipMistralQueue/);

  const failureClosedStart = adminSource.indexOf('function buildLiveCliFailureClosedResult');
  const failureClosedBlock = adminSource.slice(failureClosedStart, failureClosedStart + 700);
  assert.match(failureClosedBlock, /responseText:\s*''/);
  assert.doesNotMatch(failureClosedBlock, /Recebi o contexto|me confirma|preparo a proposta|continuar com segurança/);
  assert.match(adminSource, /function buildLiveCliFailureClosedResult[\s\S]*responseText:\s*''[\s\S]*newPendingAction:\s*params\.pendingAction[\s\S]*clearPendingAction:\s*false/);
  assert.doesNotMatch(adminSource, /AgenteZapLiveCliRuntime falhou; seguindo runtime atual/);
});

test('disabled flow script engine does not expose OpenCode runtime options', () => {
  assert.doesNotMatch(flowScriptEngineSource, /useOpenCodeMimo|forceOpenCodeGoCli|opencodeMimoAgent/);
});

test('LLM config schema and resolver do not keep OpenCode provider switches', () => {
  assert.doesNotMatch(
    [llmConfigResolverSource, sharedSchemaSource].join('\n'),
    /opencodeGo|openCodeMimo|OPENCODE|OpenCodeGo|OpenCode MiMo/,
  );
});

test('container installs Codex CLI and compose keeps a persistent CODEX_HOME', () => {
  assert.match(dockerfileSource, /npm install -g[\s\S]*@openai\/codex@0\.142\.5/);
  const composeSource = fs.readFileSync(path.resolve(root, '..', '..', 'infra', 'vps-single', 'compose.yml'), 'utf8');
  assert.match(composeSource, /AGENTEZAP_CODEX_CLI_HOME/);
  assert.match(composeSource, /AGENTEZAP_CODEX_CLI_TENANT_MODEL:\s*\$\{AGENTEZAP_CODEX_CLI_TENANT_MODEL:-gpt-5\.4-mini\}/);
  assert.match(composeSource, /AGENTEZAP_CODEX_CLI_TENANT_FALLBACK_MODEL:\s*\$\{AGENTEZAP_CODEX_CLI_TENANT_FALLBACK_MODEL:-gpt-5\.4-mini\}/);
  assert.match(composeSource, /AGENTEZAP_CODEX_CLI_RODRIGO_MODEL:\s*\$\{AGENTEZAP_CODEX_CLI_RODRIGO_MODEL:-gpt-5\.5\}/);
  assert.match(composeSource, /AGENTEZAP_CODEX_CLI_PERSONALIZE_MODEL:\s*\$\{AGENTEZAP_CODEX_CLI_PERSONALIZE_MODEL:-gpt-5\.5\}/);
  assert.match(composeSource, /\/data\/agentezap\/runtime\/codex-home:\/data\/agentezap\/runtime\/codex-home/);
});
