import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routesSource = readFileSync("server/routes_vps_crons.ts", "utf8");
const jobsSource = readFileSync("server/statefulAppJobs.ts", "utf8");
const httpSource = readFileSync("api/http.ts", "utf8");
const vpsCronSchedulerSource = readFileSync("server/vpsCronScheduler.ts", "utf8");
const paritySource = readFileSync("server/vercelHttpParity.ts", "utf8");

test("VPS cron user-followup entra no handler web-only agentic antes do dispatcher legado", () => {
  const directRouteIndex = routesSource.indexOf(
    'app.all("/api/cron/stateful-jobs/user-followup", delegateBuiltInVercelCron);',
  );
  const genericRouteIndex = routesSource.indexOf('app.all("/api/cron/stateful-jobs/:groupId"');

  assert.ok(directRouteIndex >= 0, "rota especifica de user-followup deve delegar ao api/http web-only");
  assert.ok(genericRouteIndex >= 0, "rota generica de stateful-jobs deve continuar existindo");
  assert.ok(
    directRouteIndex < genericRouteIndex,
    "rota user-followup precisa ser registrada antes da rota generica para nao cair no dispatcher antigo",
  );
});

test("job interno user-followup nao chama mais userFollowUpService.runCycleOnce", () => {
  const jobStart = jobsSource.indexOf('"user-followup": {');
  const nextJobStart = jobsSource.indexOf('"pending-ai-timers": {', jobStart);
  assert.ok(jobStart >= 0 && nextJobStart > jobStart, "bloco do job user-followup deve existir");

  const jobBlock = jobsSource.slice(jobStart, nextJobStart);
  assert.match(jobBlock, /runVpsCronHttpPath\("\/api\/cron\/stateful-jobs\/user-followup"/);
  assert.doesNotMatch(jobBlock, /userFollowUpService\.runCycleOnce/);
  assert.match(jobBlock, /runtime web-only agentic/);
});

test("rotas do painel /api/followup tambem entram no runtime web-only antes do legado Express", () => {
  assert.match(
    paritySource,
    /app\.all\("\/api\/followup\/conversation\/:id\/trigger",\s*delegateToVercelHttpHandler\)/,
    "trigger manual /api/followup deve delegar ao api/http",
  );
  assert.doesNotMatch(
    paritySource,
    /app\.all\("\/api\/followup\/\*",\s*delegateToVercelHttpHandler\)/,
    "nao delegar o prefixo inteiro enquanto /reset nao tiver handler web-only equivalente",
  );

  const triggerStart = httpSource.indexOf("async function handleFollowupConversationTrigger");
  const triggerEnd = httpSource.indexOf("async function handleFollowupStats", triggerStart);
  assert.ok(triggerStart >= 0 && triggerEnd > triggerStart, "trigger manual web-only deve existir");
  const triggerBlock = httpSource.slice(triggerStart, triggerEnd);
  assert.match(triggerBlock, /runWebOnlyUserFollowupJob\(\{\s*conversationId\s*\}\)/);
  assert.doesNotMatch(triggerBlock, /userFollowUpService\.runCycleOnce/);
});

test("autostart de intervalos stateful nao reativa o follow-up legado de clientes", () => {
  const startFunctionStart = jobsSource.indexOf("export function startAutoStartedStatefulIntervalJobs()");
  const stopFunctionStart = jobsSource.indexOf("export function stopAutoStartedStatefulIntervalJobs()", startFunctionStart);
  assert.ok(startFunctionStart >= 0 && stopFunctionStart > startFunctionStart, "funcao de autostart deve existir");

  const startBlock = jobsSource.slice(startFunctionStart, stopFunctionStart);
  assert.doesNotMatch(startBlock, /userFollowUpService\.start\s*\(/);
  assert.match(startBlock, /User follow-up interval is disabled/);
});

test("followup_plan usa provider API normal com fallback e fallback tecnico nao escreve mensagem publica", () => {
  const followupGeneratorStart = httpSource.indexOf("async function generateWebOnlyAgenticFollowupPlan");
  const followupGeneratorEnd = httpSource.indexOf("function resolveWebOnlyNextFollowupDate", followupGeneratorStart);
  assert.ok(followupGeneratorStart >= 0 && followupGeneratorEnd > followupGeneratorStart, "gerador agentico de follow-up deve existir");
  const followupGeneratorBlock = httpSource.slice(followupGeneratorStart, followupGeneratorEnd);
  assert.match(
    followupGeneratorBlock,
    /runWebOnlyFollowupProviderTask\(\{/,
    "follow-up deve usar provider API normal, nao Codex CLI",
  );
  assert.doesNotMatch(
    followupGeneratorBlock,
    /runWebOnlyAgenticTask\(\{/,
    "follow-up nao deve chamar o runtime agentico Codex",
  );
  assert.doesNotMatch(
    followupGeneratorBlock,
    /runWebOnlyCodexCliText/,
    "follow-up nao deve chamar Codex CLI diretamente",
  );
  assert.match(
    followupGeneratorBlock,
    /mediaActions/,
    "plano JSON do provider deve conseguir pedir midias estruturadas para o executor validar",
  );
  assert.doesNotMatch(
    followupGeneratorBlock,
    /objectSchema:\s*webOnlyFollowupPlanSchema/,
    "followup_plan valida JSON no runner de provider e nao deve usar objectSchema do runtime Codex",
  );
  assert.doesNotMatch(
    followupGeneratorBlock,
    /devolva action send_media/,
    "followup_plan nao deve instruir send_media como action do JSON simples",
  );
  assert.match(
    followupGeneratorBlock,
    /Nunca use send_media como valor do campo action/,
    "contrato do follow-up deve alinhar action do plano a send|wait|abort",
  );
  assert.doesNotMatch(
    followupGeneratorBlock,
    /repairWebOnlyFollowupTimingIncoherentMessage/,
    "executor do follow-up nao pode reescrever fala publica por regex; deve bloquear/falhar fechado",
  );

  const providerTaskStart = httpSource.indexOf("async function runWebOnlyFollowupProviderTask");
  const providerTaskEnd = httpSource.indexOf("async function generateWebOnlyAgenticFollowupPlan", providerTaskStart);
  assert.ok(providerTaskStart >= 0 && providerTaskEnd > providerTaskStart, "runner provider de follow-up deve existir");
  const providerTaskBlock = httpSource.slice(providerTaskStart, providerTaskEnd);
  assert.match(providerTaskBlock, /getResolvedLLMConfig\(params\.userId\)/);
  assert.match(providerTaskBlock, /buildWebOnlyFollowupProviderAttempts\(config\)/);
  assert.match(providerTaskBlock, /normalizeWebOnlyFollowupPlanJson\(parsed\)/);
  assert.match(providerTaskBlock, /followup_provider_all_attempts_failed/);
  assert.doesNotMatch(providerTaskBlock, /runWebOnlyAgenticTask|runWebOnlyCodexCliText/);

  const providerAttemptsStart = httpSource.indexOf("function buildWebOnlyFollowupProviderAttempts");
  const providerAttemptsEnd = httpSource.indexOf("function normalizeWebOnlyFollowupProviderMessages", providerAttemptsStart);
  assert.ok(providerAttemptsStart >= 0 && providerAttemptsEnd > providerAttemptsStart, "ordem de providers do follow-up deve existir");
  const providerAttemptsBlock = httpSource.slice(providerAttemptsStart, providerAttemptsEnd);
  assert.match(providerAttemptsBlock, /providerOrder/);
  assert.match(providerAttemptsBlock, /isOpenRouterFreeFallbackModel/);
  assert.match(providerAttemptsBlock, /config\.nvidiaApiKey/);

  const normalizePlanStart = httpSource.indexOf("function normalizeWebOnlyFollowupPlanJson");
  const normalizePlanEnd = httpSource.indexOf("function formatWebOnlyMessagesForStructuredPrompt", normalizePlanStart);
  assert.ok(normalizePlanStart >= 0 && normalizePlanEnd > normalizePlanStart, "normalizador do plano de follow-up deve existir");
  const normalizePlanBlock = httpSource.slice(normalizePlanStart, normalizePlanEnd);
  assert.match(normalizePlanBlock, /rawAction === ["']send_media["']/);
  assert.match(
    normalizePlanBlock,
    /message:\s*["']["']/,
    "send_media legado deve ser aceito como side effect sem texto publico local",
  );
  assert.doesNotMatch(
    normalizePlanBlock,
    /parsed\?\.message|parsed\?\.text/,
    "send_media legado nao deve preservar texto publico fora do contrato estruturado",
  );

  const fallbackStart = httpSource.indexOf("function buildWebOnlyTechnicalFollowupFallbackPlan");
  const fallbackEnd = httpSource.indexOf("function extractWebOnlyFollowupSentMediaNames", fallbackStart);
  assert.ok(fallbackStart >= 0 && fallbackEnd > fallbackStart, "fallback tecnico do follow-up deve existir");
  const fallbackBlock = httpSource.slice(fallbackStart, fallbackEnd);
  assert.doesNotMatch(fallbackBlock, /action:\s*["']send["']/);
  assert.match(fallbackBlock, /action:\s*["']wait["']/);
  assert.match(fallbackBlock, /message:\s*["']["']/);
  assert.match(fallbackBlock, /sem autoria publica/);
});

test("cron interno da VPS dispara user-followup assincrono com trava anti-sobreposicao", () => {
  assert.match(
    vpsCronSchedulerSource,
    /"x-vps-cron-scheduler":\s*"true"[\s\S]*"x-stateful-job-async":\s*"true"/,
    "scheduler interno deve pedir execucao assincrona para nao abortar follow-up longo",
  );
  assert.match(
    httpSource,
    /let webOnlyUserFollowupCronInFlight = false;/,
    "handler web-only deve manter trava de execucao do user-followup",
  );
  assert.match(
    httpSource,
    /if \(webOnlyUserFollowupCronInFlight\)[\s\S]*user_followup_cron_already_running/,
    "handler web-only deve recusar sobreposicao enquanto um ciclo anterior esta rodando",
  );
  assert.match(
    httpSource,
    /setImmediate\(async \(\) => \{[\s\S]*runWebOnlyUserFollowupJob\(options\)[\s\S]*webOnlyUserFollowupCronInFlight = false;/,
    "handler web-only deve executar o ciclo em background e liberar a trava no final",
  );
});

test("recuperacao de follow-up aguardando empresa nao varre messages globalmente", () => {
  const recoveryStart = httpSource.indexOf("async function recoverWebOnlyFollowupsWaitingForCompanyReply");
  const recoveryEnd = httpSource.indexOf("async function hasWebOnlyCustomerReplyInFollowupConversation", recoveryStart);
  assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart, "funcao de recuperacao deve existir");

  const recoveryBlock = httpSource.slice(recoveryStart, recoveryEnd);
  assert.match(
    recoveryBlock,
    /WITH candidate_conversations AS/,
    "recuperacao deve selecionar conversas candidatas antes de consultar messages",
  );
  assert.match(
    recoveryBlock,
    /CROSS JOIN LATERAL \(/,
    "recuperacao deve buscar ultima mensagem por conversa via lateral/index",
  );
  assert.doesNotMatch(
    recoveryBlock,
    /SELECT DISTINCT ON \(m\.conversation_id\)[\s\S]*FROM messages m/,
    "recuperacao nao deve varrer a tabela messages inteira com DISTINCT ON global",
  );
});

test("proxima etapa do follow-up web-only respeita janela comercial configurada", () => {
  const nextDateFunctionStart = httpSource.indexOf("function resolveWebOnlyNextFollowupDate");
  const nextDateFunctionEnd = httpSource.indexOf("function alignWebOnlyFollowupDateToBusinessTime", nextDateFunctionStart);
  assert.ok(nextDateFunctionStart >= 0 && nextDateFunctionEnd > nextDateFunctionStart, "funcao de proxima data deve existir");
  const nextDateBlock = httpSource.slice(nextDateFunctionStart, nextDateFunctionEnd);
  assert.match(
    nextDateBlock,
    /nextCandidate[\s\S]*alignWebOnlyFollowupDateToBusinessTime\(nextCandidate,\s*conversation\)/,
    "proxima tentativa sequencial deve alinhar com business hours/dias",
  );
  assert.match(
    nextDateBlock,
    /loopCandidate[\s\S]*alignWebOnlyFollowupDateToBusinessTime\(loopCandidate,\s*conversation\)/,
    "loop infinito tambem deve alinhar com business hours/dias",
  );
});
