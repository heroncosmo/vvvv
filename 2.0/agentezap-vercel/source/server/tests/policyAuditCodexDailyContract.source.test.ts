import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const auditSource = readFileSync("server/platformPolicyAuditCodexService.ts", "utf8");
const ownerNotificationSource = readFileSync("server/ownerWhatsappNotificationService.ts", "utf8");
const cronSource = readFileSync("server/statefulJobCron.ts", "utf8");
const cronHandlerSource = readFileSync("api/cron/stateful-jobs/_handler.ts", "utf8");
const jobsSource = readFileSync("server/statefulAppJobs.ts", "utf8");
const vercelSource = readFileSync("vercel.ts", "utf8");
const routeSource = readFileSync("api/cron/stateful-jobs/policy-audit.ts", "utf8");
const vpsComposeSource = readFileSync("../../infra/vps-single/compose.yml", "utf8");
const vpsEnvExampleSource = readFileSync("../../infra/vps-single/env/app.env.example", "utf8");

function sliceBetween(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `missing start marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `missing end marker after ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

test("policy-audit esta registrado como cron stateful diario", () => {
  assert.match(cronSource, /\|\s*"policy-audit"/);
  assert.match(
    cronSource,
    /"policy-audit":\s*{[\s\S]*path:\s*"\/api\/cron\/stateful-jobs\/policy-audit"[\s\S]*jobs:\s*\["policy-audit"\][\s\S]*defaultSchedule:\s*"0 7 \* \* \*"/,
  );
  assert.match(jobsSource, /"policy-audit":\s*{[\s\S]*runPlatformPolicyAuditOnce\(\)/);
  assert.match(routeSource, /runStatefulCronGroupHandler\("policy-audit"/);
  assert.match(vercelSource, /\/api\/cron\/stateful-jobs\/policy-audit/);
  assert.match(cronSource, /"policy-audit":\s*{[\s\S]*requiresCronSecret:\s*true/);
  assert.match(cronHandlerSource, /hasRequiredVercelCronSecret\(group\)[\s\S]*CRON_SECRET is required/);
});

test("compose da VPS inclui policy-audit com defaults seguros", () => {
  assert.match(vpsComposeSource, /STATEFUL_JOB_CRON_GROUPS:\s*"[^"]*policy-audit[^"]*"/);
  assert.match(vpsComposeSource, /STATEFUL_JOB_CRON_POLICY_AUDIT_SCHEDULE:\s*"0 7 \* \* \*"/);
  assert.match(vpsComposeSource, /AGENTEZAP_POLICY_AUDIT_ENABLED:\s*\$\{AGENTEZAP_POLICY_AUDIT_ENABLED:-false\}/);
  assert.match(vpsComposeSource, /AGENTEZAP_POLICY_AUDIT_DRY_RUN:\s*\$\{AGENTEZAP_POLICY_AUDIT_DRY_RUN:-true\}/);
  assert.match(vpsComposeSource, /AGENTEZAP_POLICY_AUDIT_CODEX_MODEL:\s*\$\{AGENTEZAP_POLICY_AUDIT_CODEX_MODEL:-gpt-5\.5\}/);
  assert.match(
    vpsComposeSource,
    /AGENTEZAP_POLICY_AUDIT_CODEX_REASONING_EFFORT:\s*\$\{AGENTEZAP_POLICY_AUDIT_CODEX_REASONING_EFFORT:-xhigh\}/,
  );
  assert.match(
    vpsComposeSource,
    /AGENTEZAP_POLICY_AUDIT_MEDIA_EVIDENCE_LIMIT:\s*\$\{AGENTEZAP_POLICY_AUDIT_MEDIA_EVIDENCE_LIMIT:-40\}/,
  );

  assert.match(vpsEnvExampleSource, /AGENTEZAP_POLICY_AUDIT_ENABLED=false/);
  assert.match(vpsEnvExampleSource, /AGENTEZAP_POLICY_AUDIT_DRY_RUN=true/);
  assert.match(vpsEnvExampleSource, /AGENTEZAP_POLICY_AUDIT_MEDIA_EVIDENCE_LIMIT=40/);
  assert.match(vpsEnvExampleSource, /AGENTEZAP_POLICY_AUDIT_OWNER_EMAIL=rodrigo4@gmail\.com/);
  assert.match(vpsEnvExampleSource, /AGENTEZAP_POLICY_AUDIT_OWNER_PHONE=5517991956944/);
});

test("auditoria usa Codex CLI read-only com output schema estruturado", () => {
  assert.match(auditSource, /PLATFORM_POLICY_AUDIT_SCHEMA_VERSION\s*=\s*"agentezap_policy_audit_v1"/);
  assert.match(auditSource, /"exec"[\s\S]{0,300}"--sandbox"[\s\S]{0,80}"read-only"/);
  assert.match(auditSource, /"--output-schema"[\s\S]{0,120}schemaFile/);
  assert.match(auditSource, /"--output-last-message"[\s\S]{0,120}outputFile/);
  assert.match(auditSource, /parseAgenteZapLiveCliJson\(rawText\)/);
  assert.match(auditSource, /writePolicyAuditContextFiles\({ contextDir, snapshot, schema }\)/);
});

test("seletor de candidatos nao decide por detector semantico", () => {
  const selectorBlock = sliceBetween(
    auditSource,
    "export async function selectPolicyAuditCandidates",
    "async function getRecentTenantConversations",
  );

  assert.match(selectorBlock, /latest_activity_at/);
  assert.match(selectorBlock, /recent_ai_activity/);
  assert.match(selectorBlock, /AGENTEZAP_POLICY_AUDIT_MAX_CANDIDATES",\s*500/);
  assert.doesNotMatch(selectorBlock, /ILIKE|LOWER\s*\(|LIKE|regexp|to_tsvector/i);
  assert.doesNotMatch(selectorBlock, /prostit|sexual|massag|nude|oracao|oração|pomada/i);
});

test("executor so suspende com contrato JSON completo, confianca, evidencia e dry-run desligado", () => {
  const executorBlock = sliceBetween(
    auditSource,
    "async function executePolicyAuditDecision",
    "export async function runPlatformPolicyAuditOnce",
  );

  const requiredContractIndex = executorBlock.indexOf("decisionHasRequiredSuspensionContract(decision)");
  const confidenceIndex = executorBlock.indexOf("decision.confidence < params.minConfidence");
  const evidenceIndex = executorBlock.indexOf("decision.evidenceQuotes.length === 0 && decision.evidenceRecordIds.length === 0");
  const dryRunIndex = executorBlock.indexOf("!params.enabled || params.dryRun");
  const structuralIndex = executorBlock.indexOf("hasStructuralPolicyAuditViolation(params.codexViolations)");
  const evidenceGapIndex = executorBlock.indexOf("params.snapshot.evidenceGaps.length > 0");
  const idempotencyIndex = executorBlock.indexOf("storage.isUserSuspended");
  const suspendIndex = executorBlock.indexOf("storage.suspendUser");
  const notifyIndex = executorBlock.indexOf("sendOwnerSuspensionNotificationWithRetryMarker");

  for (const [label, index] of Object.entries({
    requiredContractIndex,
    confidenceIndex,
    evidenceIndex,
    dryRunIndex,
    structuralIndex,
    evidenceGapIndex,
    idempotencyIndex,
    suspendIndex,
    notifyIndex,
  })) {
    assert.ok(index >= 0, `missing executor guard: ${label}`);
  }

  assert.ok(requiredContractIndex < suspendIndex);
  assert.ok(confidenceIndex < suspendIndex);
  assert.ok(evidenceIndex < suspendIndex);
  assert.ok(dryRunIndex < suspendIndex);
  assert.ok(structuralIndex < suspendIndex);
  assert.ok(evidenceGapIndex < suspendIndex);
  assert.ok(idempotencyIndex < suspendIndex);
  assert.ok(notifyIndex > suspendIndex);
});

test("violacoes estruturais do JSON do Codex bloqueiam suspensao", () => {
  assert.match(
    auditSource,
    /STRUCTURAL_POLICY_AUDIT_VIOLATIONS[\s\S]*schema_version_mismatch[\s\S]*target_user_mismatch[\s\S]*target_email_mismatch/,
  );
  assert.match(auditSource, /skipped:\s*"structural_codex_contract_violation"/);
});

test("suspend_user exige side effects explicitos de suspensao e aviso privado", () => {
  const contractBlock = sliceBetween(
    auditSource,
    "function decisionHasRequiredSuspensionContract",
    "function buildSuspensionEvidence",
  );

  assert.match(contractBlock, /decision\.decision === "suspend_user"/);
  assert.match(contractBlock, /requiredSideEffects\.includes\("suspend_user"\)/);
  assert.match(contractBlock, /requiredSideEffects\.includes\("notify_owner_private"\)/);
});

test("snapshot de auditoria inclui contexto de tenant, agente, midias, produtos e conversas", () => {
  const snapshotBlock = sliceBetween(
    auditSource,
    "export async function buildPolicyAuditSnapshot",
    "function buildPolicyAuditOutputSchema",
  );

  for (const required of [
    "storage.getUser(candidate.userId)",
    "storage.getAgentConfig(candidate.userId)",
    "storage.getBusinessAgentConfig(candidate.userId)",
    "storage.getConnectionsByUserId(candidate.userId)",
    "agentMediaLibrary",
    "storageUrl: agentMediaLibrary.storageUrl",
    "fileName: agentMediaLibrary.fileName",
    "mimeType: agentMediaLibrary.mimeType",
    "productsConfig",
    "products",
    "policyViolations",
    "getRecentTenantConversations",
    "attachRecentMessages",
  ] as const) {
    assert.ok(snapshotBlock.includes(required), `snapshot deve incluir ${required}`);
  }

  assert.match(snapshotBlock, /AGENTEZAP_POLICY_AUDIT_CONVERSATION_LIMIT",\s*25/);
  assert.match(snapshotBlock, /recent_conversations_outside_snapshot/);
  assert.match(auditSource, /AGENTEZAP_POLICY_AUDIT_FULL_MESSAGES",\s*true/);
  assert.match(auditSource, /storage\.getMessagesByConversationId\(conversationId\)/);
});

test("midia de conversa exige evidencia visual/textual ou gap bloqueante", () => {
  assert.match(auditSource, /import \{ buildMediaEvidenceContext, type MediaEvidenceContext \} from "\.\/mediaEvidenceContext"/);
  assert.match(auditSource, /async function mapMessageForAudit[\s\S]*buildMediaEvidenceContext\(\{[\s\S]*mediaType,[\s\S]*mimeType: mediaMimeType,[\s\S]*mediaUrl: message\.mediaUrl,[\s\S]*userId: params\.userId/);
  assert.match(auditSource, /mediaEvidence:\s*summarizeMediaEvidence\(mediaEvidence\)/);
  assert.match(auditSource, /mediaEvidenceStatus/);
  assert.match(auditSource, /media_evidence_unavailable/);
  assert.match(auditSource, /media_evidence_limit_exceeded/);
  assert.match(auditSource, /media_evidence_extraction_\$\{mediaEvidence\.status\}/);
  assert.match(auditSource, /AGENTEZAP_POLICY_AUDIT_MEDIA_EVIDENCE_LIMIT",\s*40/);
  assert.match(auditSource, /conversation\.mediaEvidenceGaps[\s\S]*evidenceGaps\.push\(normalized\)/);
  assert.match(auditSource, /params\.snapshot\.evidenceGaps\.length > 0[\s\S]*skipped:\s*"evidence_gap_requires_human_review"/);
});

test("midia cadastrada do tenant exige URL, metadados e evidencia visual/textual ou gap", () => {
  assert.match(auditSource, /async function mapAgentMediaLibraryForAudit/);
  assert.match(auditSource, /mapAgentMediaLibraryForAudit\([\s\S]*mediaRows as Array<Record<string, unknown>>,[\s\S]*candidate\.userId,[\s\S]*mediaEvidenceBudget/);
  assert.match(auditSource, /storageUrl: agentMediaLibrary\.storageUrl/);
  assert.match(auditSource, /fileName: agentMediaLibrary\.fileName/);
  assert.match(auditSource, /mimeType: agentMediaLibrary\.mimeType/);
  assert.match(auditSource, /durationSeconds: agentMediaLibrary\.durationSeconds/);
  assert.match(auditSource, /buildMediaEvidenceContext\(\{[\s\S]*mediaType,[\s\S]*mimeType,[\s\S]*mediaUrl: storageUrl,[\s\S]*userId/);
  assert.match(auditSource, /media_library_evidence_unavailable/);
  assert.match(auditSource, /media_library_flow_item_evidence_unavailable/);
  assert.match(auditSource, /mediaLibrary: mediaLibraryAudit\.mediaLibrary/);
  assert.match(auditSource, /mediaLibraryAudit\.evidenceGaps[\s\S]*evidenceGaps\.push\(normalized\)/);
  assert.match(auditSource, /mediaEvidenceRemaining: mediaEvidenceBudget\.remaining/);
});

test("dry-run e disabled sao padrao antes de side effects reais", () => {
  const runBlock = sliceBetween(
    auditSource,
    "export async function runPlatformPolicyAuditOnce",
    "const candidates = await selectPolicyAuditCandidates",
  );
  assert.match(runBlock, /AGENTEZAP_POLICY_AUDIT_ENABLED",\s*false/);
  assert.match(runBlock, /AGENTEZAP_POLICY_AUDIT_DRY_RUN",\s*!enabled/);
  assert.match(runBlock, /enabled && !dryRun[\s\S]*retryPendingOwnerSuspensionNotifications\(\)/);
  assert.match(auditSource, /skipped:\s*"dry_run_or_disabled"/);
});

test("aviso privado nao repassa evidencias explicitas nem motivo longo", () => {
  const notificationBlock = sliceBetween(
    auditSource,
    "function buildOwnerSuspensionNotification",
    "async function executePolicyAuditDecision",
  );

  assert.match(notificationBlock, /policy_violations/);
  assert.doesNotMatch(notificationBlock, /evidenceQuotes|evidenceRecordIds|decision\.reason/);
});

test("falha de aviso privado apos suspensao fica marcada para retry diario", () => {
  assert.match(auditSource, /owner_notification_pending/);
  assert.match(auditSource, /retryPendingOwnerSuspensionNotifications\(\)/);
  assert.match(auditSource, /ownerNotificationRetries/);
  assert.match(auditSource, /owner_notification_pending_retry_scheduled/);
});

test("aviso privado usa conta dona autenticada e nao segredo do chat", () => {
  assert.match(ownerNotificationSource, /owner_notification_email/);
  assert.match(ownerNotificationSource, /owner_notification_number/);
  assert.match(ownerNotificationSource, /storage\.getUserByEmail\(ownerEmail\)/);
  assert.match(ownerNotificationSource, /storage\.getUserActiveConnection/);
  assert.match(ownerNotificationSource, /source:\s*"system"/);
  assert.doesNotMatch(ownerNotificationSource + auditSource, /senha|password/i);
});

test("codigo novo nao hardcoda tenant/conversa do caso real", () => {
  assert.doesNotMatch(
    auditSource + ownerNotificationSource,
    /996838f7-124d-456e-ae62-5be50a95d9eb|rafaelbueno0801|massagista|garota de programa/i,
  );
});
