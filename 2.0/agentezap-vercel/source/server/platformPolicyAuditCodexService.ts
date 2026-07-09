import { spawn } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { parseAgenteZapLiveCliJson } from "./agenteZapLiveCliJson";
import { buildMediaEvidenceContext, type MediaEvidenceContext } from "./mediaEvidenceContext";
import { sendOwnerPrivateWhatsAppNotification } from "./ownerWhatsappNotificationService";
import { storage } from "./storage";
import {
  agentMediaLibrary,
  aiAgentConfig,
  businessAgentConfigs,
  conversations,
  messages,
  policyViolations,
  products,
  productsConfig,
  users,
  whatsappConnections,
} from "@shared/schema";

export const PLATFORM_POLICY_AUDIT_SCHEMA_VERSION = "agentezap_policy_audit_v1";

type PolicyAuditDecisionName = "no_action" | "needs_human_review" | "suspend_user";
type PolicyAuditSideEffect = "none" | "suspend_user" | "notify_owner_private";

type PolicyAuditCandidate = {
  userId: string;
  email: string | null;
  latestActivityAt: string | null;
  reason: "recent_ai_activity";
  conversationCount: number;
  aiEnabledConnectionCount: number;
  agentActive: boolean;
};

type PolicyAuditDecision = {
  schemaVersion: typeof PLATFORM_POLICY_AUDIT_SCHEMA_VERSION;
  targetUserId: string;
  targetEmail: string | null;
  decision: PolicyAuditDecisionName;
  confidence: number;
  violationType: string | null;
  reason: string;
  requiredSideEffects: PolicyAuditSideEffect[];
  evidenceQuotes: string[];
  evidenceRecordIds: string[];
  filesRead: string[];
  contextUsed: string[];
  uncertainty: string[];
  ownerNotificationSummary: string | null;
};

type PolicyAuditSnapshot = {
  schemaVersion: typeof PLATFORM_POLICY_AUDIT_SCHEMA_VERSION;
  candidate: PolicyAuditCandidate;
  user: Record<string, unknown>;
  aiAgentConfig: Record<string, unknown> | null;
  businessAgentConfig: Record<string, unknown> | null;
  connections: Array<Record<string, unknown>>;
  mediaLibrary: Array<Record<string, unknown>>;
  productsConfig: Record<string, unknown> | null;
  products: Array<Record<string, unknown>>;
  recentPolicyViolations: Array<Record<string, unknown>>;
  recentConversations: Array<Record<string, unknown>>;
  coverage: Record<string, unknown>;
  evidenceGaps: string[];
};

type CodexProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

type PolicyAuditCandidateResult = {
  candidate: PolicyAuditCandidate;
  snapshot: PolicyAuditSnapshot;
  decision: PolicyAuditDecision;
  rawText: string;
  violations: string[];
  contextDir: string | null;
  execution: PolicyAuditExecutionResult;
};

type PolicyAuditExecutionResult = {
  applied: boolean;
  dryRun: boolean;
  skipped?: string;
  suspensionApplied: boolean;
  notificationSent: boolean;
  notificationError?: string | null;
  violations: string[];
};

type OwnerNotificationRetryResult = {
  attempted: number;
  sent: number;
  failed: number;
};

export type PlatformPolicyAuditRunResult = {
  accepted: boolean;
  skipped?: string;
  dryRun: boolean;
  enabled: boolean;
  startedAt: string;
  finishedAt: string;
  candidates: number;
  processed: number;
  suspended: number;
  needsHumanReview: number;
  noAction: number;
  failed: number;
  ownerNotificationRetries: OwnerNotificationRetryResult;
  results: Array<{
    userId: string;
    email: string | null;
    decision: PolicyAuditDecisionName;
    confidence: number;
    applied: boolean;
    suspensionApplied: boolean;
    notificationSent: boolean;
    skipped?: string;
    violations: string[];
  }>;
};

const STRUCTURAL_POLICY_AUDIT_VIOLATIONS = new Set([
  "schema_version_mismatch",
  "target_user_mismatch",
  "target_email_mismatch",
  "decision_invalid_or_missing",
]);

function readBooleanEnv(key: string, fallback: boolean): boolean {
  const raw = String(process.env[key] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "sim", "on", "enabled"].includes(raw)) return true;
  if (["0", "false", "no", "nao", "off", "disabled"].includes(raw)) return false;
  return fallback;
}

function readIntEnv(key: string, fallback: number): number {
  const parsed = Number(process.env[key] || "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function clampConfidence(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function normalizeString(value: unknown, maxChars = 1200): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`;
}

function normalizeStringArray(value: unknown, maxItems: number, maxChars = 600): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeString(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function getProjectRoot(): string {
  return path.resolve(process.env.AGENTEZAP_CODEX_CLI_PROJECT_ROOT || process.cwd());
}

function getCodexBinary(): string {
  const configured = String(process.env.AGENTEZAP_CODEX_CLI_BIN || process.env.CODEX_CLI_BIN || "").trim();
  if (configured) return configured;
  return process.platform === "win32" ? "codex.cmd" : "codex";
}

function getCodexHome(projectRoot: string): string {
  const configured = String(process.env.AGENTEZAP_CODEX_CLI_HOME || "").trim();
  return path.resolve(configured || path.join(projectRoot, ".codex-runs", "agentezap-codex-chatgpt-home"));
}

function getPolicyAuditModel(): string {
  return String(
    process.env.AGENTEZAP_POLICY_AUDIT_CODEX_MODEL ||
      process.env.AGENTEZAP_CODEX_CLI_RODRIGO_MODEL ||
      "gpt-5.5",
  ).trim();
}

function getPolicyAuditReasoningEffort(): string {
  return String(
    process.env.AGENTEZAP_POLICY_AUDIT_CODEX_REASONING_EFFORT ||
      process.env.AGENTEZAP_CODEX_CLI_RODRIGO_REASONING_EFFORT ||
      process.env.AGENTEZAP_CODEX_CLI_REASONING_EFFORT ||
      "xhigh",
  ).trim();
}

function buildCodexEnv(codexHome: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CODEX_HOME: codexHome,
    NO_COLOR: "1",
  };
  if (String(process.env.AGENTEZAP_CODEX_CLI_AUTH_MODE || "chatgpt").toLowerCase() !== "api_key") {
    delete env.OPENAI_API_KEY;
    delete env.CODEX_API_KEY;
  }
  return env;
}

function runCodexProcess(
  args: string[],
  stdin: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
  timeoutMs: number,
): Promise<CodexProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(getCodexBinary(), args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const limit = 160_000;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3_000).unref();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = (stdout + String(chunk)).slice(-limit);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + String(chunk)).slice(-limit);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut });
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

async function assertCodexAuth(env: NodeJS.ProcessEnv, cwd: string, timeoutMs: number): Promise<void> {
  if (readBooleanEnv("AGENTEZAP_CODEX_CLI_SKIP_LOGIN_STATUS", false)) return;
  const result = await runCodexProcess(["login", "status"], "", env, cwd, Math.min(timeoutMs, 20_000));
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(
      [
        `codex_login_status_failed CODEX_HOME=${String(env.CODEX_HOME || "")}`,
        "Autentique o Codex CLI nesse ambiente antes de ativar o job de auditoria.",
        result.stderr || result.stdout,
      ].join("\n"),
    );
  }
}

export async function selectPolicyAuditCandidates(params: {
  lookbackHours?: number;
  limit?: number;
} = {}): Promise<PolicyAuditCandidate[]> {
  const lookbackHours = params.lookbackHours || readIntEnv("AGENTEZAP_POLICY_AUDIT_LOOKBACK_HOURS", 168);
  const limit = params.limit || readIntEnv("AGENTEZAP_POLICY_AUDIT_MAX_CANDIDATES", 500);
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  const result = await db.execute(sql`
    WITH tenant_activity AS (
      SELECT
        u.id AS user_id,
        u.email AS email,
        GREATEST(
          COALESCE(MAX(c.last_message_time), 'epoch'::timestamp),
          COALESCE(MAX(wc.updated_at), 'epoch'::timestamp),
          COALESCE(MAX(a.updated_at), 'epoch'::timestamp),
          COALESCE(MAX(u.updated_at), 'epoch'::timestamp),
          COALESCE(MAX(u.created_at), 'epoch'::timestamp)
        ) AS latest_activity_at,
        COUNT(DISTINCT c.id) FILTER (WHERE c.last_message_time >= ${since}) AS conversation_count,
        COUNT(DISTINCT wc.id) FILTER (WHERE wc.ai_enabled IS TRUE) AS ai_enabled_connection_count,
        BOOL_OR(COALESCE(a.is_active, false)) AS agent_active
      FROM ${users} u
      LEFT JOIN ${aiAgentConfig} a ON a.user_id = u.id
      LEFT JOIN ${whatsappConnections} wc ON wc.user_id = u.id
      LEFT JOIN ${conversations} c ON c.connection_id = wc.id
      WHERE u.suspended_at IS NULL
      GROUP BY u.id, u.email
    )
    SELECT
      user_id,
      email,
      latest_activity_at,
      conversation_count,
      ai_enabled_connection_count,
      agent_active
    FROM tenant_activity
    WHERE latest_activity_at >= ${since}
      AND (agent_active IS TRUE OR ai_enabled_connection_count > 0)
    ORDER BY latest_activity_at DESC
    LIMIT ${limit}
  `);

  const rows = ((result as any).rows || []) as Array<Record<string, unknown>>;
  return rows
    .map((row) => ({
      userId: String(row.user_id || "").trim(),
      email: row.email ? String(row.email) : null,
      latestActivityAt: row.latest_activity_at ? new Date(row.latest_activity_at as any).toISOString() : null,
      reason: "recent_ai_activity" as const,
      conversationCount: Number(row.conversation_count || 0),
      aiEnabledConnectionCount: Number(row.ai_enabled_connection_count || 0),
      agentActive: row.agent_active === true,
    }))
    .filter((candidate) => Boolean(candidate.userId));
}

async function getRecentTenantConversations(userId: string, limit: number) {
  return db
    .select({
      id: conversations.id,
      connectionId: conversations.connectionId,
      contactNumber: conversations.contactNumber,
      contactName: conversations.contactName,
      lastMessageText: conversations.lastMessageText,
      lastMessageTime: conversations.lastMessageTime,
      lastMessageFromMe: conversations.lastMessageFromMe,
      needsHumanAttention: conversations.needsHumanAttention,
      attentionReason: conversations.attentionReason,
      followupActive: conversations.followupActive,
      isClosed: conversations.isClosed,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      connectionName: whatsappConnections.connectionName,
      connectionPhoneNumber: whatsappConnections.phoneNumber,
      connectionAiEnabled: whatsappConnections.aiEnabled,
    })
    .from(conversations)
    .innerJoin(whatsappConnections, eq(conversations.connectionId, whatsappConnections.id))
    .where(eq(whatsappConnections.userId, userId))
    .orderBy(sql`${conversations.lastMessageTime} DESC NULLS LAST`)
    .limit(limit);
}

type PolicyAuditMessageMapping = {
  mapped: Record<string, unknown>;
  evidenceGaps: string[];
};

type MediaEvidenceBudget = {
  remaining: number;
};

function claimMediaEvidenceSlot(budget: MediaEvidenceBudget): boolean {
  if (budget.remaining <= 0) return false;
  budget.remaining -= 1;
  return true;
}

function isMeaningfulExtractedMediaText(value: unknown): boolean {
  const text = normalizeString(value, 4000);
  if (!text) return false;
  if (/^\[(audio|imagem|image|video|documento|document) recebido/i.test(text.trim())) {
    return text.length > 80;
  }
  return true;
}

function summarizeMediaEvidence(evidence: MediaEvidenceContext | null) {
  if (!evidence) return null;
  return {
    kind: evidence.kind,
    provider: evidence.provider,
    status: evidence.status,
    mimeType: evidence.mimeType,
    mediaType: evidence.mediaType,
    extractedText: evidence.extractedText ? normalizeString(evidence.extractedText, 8000) : null,
    error: evidence.error ? normalizeString(evidence.error, 240) : null,
  };
}

function mediaUrlKind(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.startsWith("data:")) return "data_uri";
  if (text.startsWith("http://") || text.startsWith("https://")) return "remote_url";
  return "stored_reference";
}

function contextStorageUrl(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.startsWith("data:") && text.length > 500) {
    return `${text.slice(0, 160)}...[data_uri_truncated length=${text.length}]`;
  }
  return normalizeString(text, 2000);
}

function hasLibraryMediaEvidence(params: {
  mediaType: string | null;
  transcription: string | null;
  mediaEvidence: MediaEvidenceContext | null;
}): boolean {
  if (isMeaningfulExtractedMediaText(params.mediaEvidence?.extractedText)) return true;
  if (params.mediaType === "audio" && isMeaningfulExtractedMediaText(params.transcription)) return true;
  return false;
}

async function mapMessageForAudit(
  message: any,
  params: { userId: string; canExtractMediaEvidence: boolean },
): Promise<PolicyAuditMessageMapping> {
  const evidenceGaps: string[] = [];
  const text = normalizeString(message.text, 12000);
  const mediaType = normalizeString(message.mediaType, 80) || null;
  const mediaCaption = normalizeString(message.mediaCaption, 2000) || null;
  const mediaMimeType = normalizeString(message.mediaMimeType, 160) || null;
  const hasMediaUrl = Boolean(message.mediaUrl);
  const hasMedia = Boolean(mediaType || mediaCaption || mediaMimeType || hasMediaUrl);
  let mediaEvidence: MediaEvidenceContext | null = null;

  if (hasMedia && hasMediaUrl && params.canExtractMediaEvidence) {
    mediaEvidence = await buildMediaEvidenceContext({
      mediaType,
      mimeType: mediaMimeType,
      mediaUrl: message.mediaUrl,
      userId: params.userId,
    });
  }

  const hasExtractedEvidence =
    isMeaningfulExtractedMediaText(text) ||
    isMeaningfulExtractedMediaText(mediaCaption) ||
    isMeaningfulExtractedMediaText(mediaEvidence?.extractedText);
  const recordId = normalizeString(message.id || message.messageId || "unknown", 120);

  if (hasMedia && !hasExtractedEvidence) {
    evidenceGaps.push(`media_evidence_unavailable:${recordId}`);
  }
  if (hasMedia && hasMediaUrl && !params.canExtractMediaEvidence) {
    evidenceGaps.push(`media_evidence_limit_exceeded:${recordId}`);
  }
  if (hasMedia && hasMediaUrl && mediaEvidence && mediaEvidence.status !== "ok") {
    evidenceGaps.push(`media_evidence_extraction_${mediaEvidence.status}:${recordId}`);
  }

  return {
    evidenceGaps,
    mapped: {
    id: message.id,
    messageId: message.messageId,
    role: message.fromMe ? (message.isFromAgent ? "ai_agent" : "owner_or_team") : "customer",
      text,
    timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : null,
    status: message.status || null,
      mediaType,
      mediaCaption,
      hasMediaUrl,
      mediaUrlKind: mediaUrlKind(message.mediaUrl),
      mediaMimeType,
      mediaEvidence: summarizeMediaEvidence(mediaEvidence),
      mediaEvidenceStatus: mediaEvidence?.status || (hasMedia ? "unavailable" : "not_media"),
      mediaEvidenceGaps: evidenceGaps,
    },
  };
}

async function attachRecentMessages(
  conversationRows: Array<Record<string, unknown>>,
  messageLimit: number,
  userId: string,
  mediaEvidenceBudget: MediaEvidenceBudget,
) {
  const includeFullMessages = readBooleanEnv("AGENTEZAP_POLICY_AUDIT_FULL_MESSAGES", true);
  const enriched: Array<Record<string, unknown>> = [];
  for (const conversation of conversationRows) {
    const conversationId = String(conversation.id || "");
    if (!conversationId) continue;
    const fullMessages = includeFullMessages
      ? await storage.getMessagesByConversationId(conversationId)
      : null;
    const page = fullMessages
      ? { messages: fullMessages, hasMore: false }
      : await storage.getMessagesByConversationIdPaginated(conversationId, messageLimit);
    const orderedMessages = [...page.messages].sort((a: any, b: any) => {
      const left = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const right = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return left - right;
    });
    const mappedMessages: Array<Record<string, unknown>> = [];
    const mediaEvidenceGaps: string[] = [];
    for (const message of orderedMessages) {
      const hasMediaUrl = Boolean((message as any).mediaUrl);
      const canExtractMediaEvidence = hasMediaUrl && claimMediaEvidenceSlot(mediaEvidenceBudget);
      const mapping = await mapMessageForAudit(message, {
        userId,
        canExtractMediaEvidence,
      });
      mappedMessages.push(mapping.mapped);
      mediaEvidenceGaps.push(...mapping.evidenceGaps);
    }
    enriched.push({
      ...conversation,
      messagesMode: includeFullMessages ? "full_conversation" : "limited_window",
      messagesHasMoreBeforeWindow: page.hasMore,
      messagesIncluded: mappedMessages,
      mediaEvidenceGaps,
    });
  }
  return enriched;
}

async function mapAgentMediaFlowItemForAudit(
  item: any,
  params: { userId: string; parentId: string; index: number; mediaEvidenceBudget: MediaEvidenceBudget },
): Promise<PolicyAuditMessageMapping> {
  const evidenceGaps: string[] = [];
  const storageUrl = String(item?.storageUrl || item?.mediaUrl || "").trim();
  const mediaType = normalizeString(item?.mediaType || item?.type, 80) || null;
  const mimeType = normalizeString(item?.mimeType, 160) || null;
  const caption = normalizeString(item?.caption, 2000) || null;
  const text = normalizeString(item?.text, 4000) || null;
  const fileName = normalizeString(item?.fileName, 260) || null;
  const recordId = `${params.parentId}:flow:${normalizeString(item?.id || params.index, 80)}`;
  const isMediaItem = String(item?.type || "").toLowerCase() === "media" || Boolean(storageUrl);
  let mediaEvidence: MediaEvidenceContext | null = null;

  if (isMediaItem && storageUrl && claimMediaEvidenceSlot(params.mediaEvidenceBudget)) {
    mediaEvidence = await buildMediaEvidenceContext({
      mediaType,
      mimeType,
      mediaUrl: storageUrl,
      userId: params.userId,
    });
  }

  if (isMediaItem && !storageUrl) {
    evidenceGaps.push(`media_library_flow_item_storage_url_missing:${recordId}`);
  }
  if (isMediaItem && storageUrl && !hasLibraryMediaEvidence({ mediaType, transcription: null, mediaEvidence })) {
    evidenceGaps.push(`media_library_flow_item_evidence_unavailable:${recordId}`);
  }
  if (isMediaItem && storageUrl && mediaEvidence && mediaEvidence.status !== "ok") {
    evidenceGaps.push(`media_library_flow_item_evidence_extraction_${mediaEvidence.status}:${recordId}`);
  }

  return {
    evidenceGaps,
    mapped: {
      id: item?.id || null,
      order: item?.order ?? params.index,
      type: item?.type || null,
      text,
      caption,
      mediaType,
      mimeType,
      fileName,
      hasStorageUrl: Boolean(storageUrl),
      storageUrlKind: mediaUrlKind(storageUrl),
      storageUrl: contextStorageUrl(storageUrl),
      mediaEvidence: summarizeMediaEvidence(mediaEvidence),
      mediaEvidenceGaps: evidenceGaps,
    },
  };
}

async function mapAgentMediaLibraryForAudit(
  rows: Array<Record<string, unknown>>,
  userId: string,
  mediaEvidenceBudget: MediaEvidenceBudget,
): Promise<{ mediaLibrary: Array<Record<string, unknown>>; evidenceGaps: string[] }> {
  const mediaLibrary: Array<Record<string, unknown>> = [];
  const evidenceGaps: string[] = [];

  for (const row of rows) {
    const id = normalizeString(row.id, 120);
    const mediaType = normalizeString(row.mediaType, 80) || null;
    const storageUrl = String(row.storageUrl || "").trim();
    const mimeType = normalizeString(row.mimeType, 160) || null;
    const transcription = normalizeString(row.transcription, 8000) || null;
    const isFlow = mediaType === "flow";
    const hasTopLevelMedia = Boolean(!isFlow && mediaType && mediaType !== "text");
    let mediaEvidence: MediaEvidenceContext | null = null;

    if (hasTopLevelMedia && storageUrl && claimMediaEvidenceSlot(mediaEvidenceBudget)) {
      mediaEvidence = await buildMediaEvidenceContext({
        mediaType,
        mimeType,
        mediaUrl: storageUrl,
        userId,
      });
    }

    const rowGaps: string[] = [];
    if (hasTopLevelMedia && !storageUrl) {
      rowGaps.push(`media_library_storage_url_missing:${id || "unknown"}`);
    }
    if (hasTopLevelMedia && storageUrl && !hasLibraryMediaEvidence({ mediaType, transcription, mediaEvidence })) {
      rowGaps.push(`media_library_evidence_unavailable:${id || "unknown"}`);
    }
    if (hasTopLevelMedia && storageUrl && mediaEvidence && mediaEvidence.status !== "ok") {
      rowGaps.push(`media_library_evidence_extraction_${mediaEvidence.status}:${id || "unknown"}`);
    }

    const rawFlowItems = Array.isArray(row.flowItems) ? row.flowItems : [];
    const mappedFlowItems: Array<Record<string, unknown>> = [];
    for (const [index, item] of rawFlowItems.entries()) {
      const flowMapping = await mapAgentMediaFlowItemForAudit(item, {
        userId,
        parentId: id || "unknown",
        index,
        mediaEvidenceBudget,
      });
      mappedFlowItems.push(flowMapping.mapped);
      rowGaps.push(...flowMapping.evidenceGaps);
    }

    evidenceGaps.push(...rowGaps);
    mediaLibrary.push({
      id: row.id,
      name: row.name,
      mediaType,
      storageUrl: contextStorageUrl(storageUrl),
      storageUrlKind: mediaUrlKind(storageUrl),
      fileName: normalizeString(row.fileName, 260) || null,
      fileSize: row.fileSize ?? null,
      mimeType,
      durationSeconds: row.durationSeconds ?? null,
      description: normalizeString(row.description, 4000),
      whenToUse: normalizeString(row.whenToUse, 4000) || null,
      caption: normalizeString(row.caption, 2000) || null,
      transcription,
      suppressTextResponse: row.suppressTextResponse,
      flowItems: mappedFlowItems,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      mediaEvidence: summarizeMediaEvidence(mediaEvidence),
      mediaEvidenceGaps: rowGaps,
    });
  }

  return { mediaLibrary, evidenceGaps };
}

export async function buildPolicyAuditSnapshot(
  candidate: PolicyAuditCandidate,
  params: {
    conversationLimit?: number;
    messageLimitPerConversation?: number;
  } = {},
): Promise<PolicyAuditSnapshot> {
  const conversationLimit = params.conversationLimit || readIntEnv("AGENTEZAP_POLICY_AUDIT_CONVERSATION_LIMIT", 25);
  const messageLimitPerConversation =
    params.messageLimitPerConversation || readIntEnv("AGENTEZAP_POLICY_AUDIT_MESSAGES_PER_CONVERSATION", 200);

  const [
    userRecord,
    agentConfig,
    businessConfig,
    connections,
    mediaRows,
    productConfigRows,
    productRows,
    violationRows,
    recentConversationRows,
  ] = await Promise.all([
    storage.getUser(candidate.userId),
    storage.getAgentConfig(candidate.userId).catch(() => undefined),
    storage.getBusinessAgentConfig(candidate.userId).catch(() => undefined),
    storage.getConnectionsByUserId(candidate.userId).catch(() => []),
    db
      .select({
        id: agentMediaLibrary.id,
        name: agentMediaLibrary.name,
        mediaType: agentMediaLibrary.mediaType,
        storageUrl: agentMediaLibrary.storageUrl,
        fileName: agentMediaLibrary.fileName,
        fileSize: agentMediaLibrary.fileSize,
        mimeType: agentMediaLibrary.mimeType,
        durationSeconds: agentMediaLibrary.durationSeconds,
        description: agentMediaLibrary.description,
        whenToUse: agentMediaLibrary.whenToUse,
        caption: agentMediaLibrary.caption,
        transcription: agentMediaLibrary.transcription,
        suppressTextResponse: agentMediaLibrary.suppressTextResponse,
        flowItems: agentMediaLibrary.flowItems,
        isActive: agentMediaLibrary.isActive,
        createdAt: agentMediaLibrary.createdAt,
        updatedAt: agentMediaLibrary.updatedAt,
      })
      .from(agentMediaLibrary)
      .where(eq(agentMediaLibrary.userId, candidate.userId))
      .orderBy(desc(agentMediaLibrary.updatedAt))
      .limit(readIntEnv("AGENTEZAP_POLICY_AUDIT_MEDIA_LIMIT", 40)),
    db
      .select()
      .from(productsConfig)
      .where(eq(productsConfig.userId, candidate.userId))
      .limit(1),
    db
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        stock: products.stock,
        controlStock: products.controlStock,
        description: products.description,
        category: products.category,
        link: products.link,
        sku: products.sku,
        isActive: products.isActive,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .where(eq(products.userId, candidate.userId))
      .orderBy(desc(products.updatedAt))
      .limit(readIntEnv("AGENTEZAP_POLICY_AUDIT_PRODUCT_LIMIT", 80)),
    db
      .select({
        id: policyViolations.id,
        violationType: policyViolations.violationType,
        description: policyViolations.description,
        status: policyViolations.status,
        resultedInSuspension: policyViolations.resultedInSuspension,
        internalNotes: policyViolations.internalNotes,
        createdAt: policyViolations.createdAt,
        updatedAt: policyViolations.updatedAt,
      })
      .from(policyViolations)
      .where(eq(policyViolations.userId, candidate.userId))
      .orderBy(desc(policyViolations.createdAt))
      .limit(10),
    getRecentTenantConversations(candidate.userId, conversationLimit),
  ]);

  const mediaEvidenceBudget = {
    remaining: readIntEnv("AGENTEZAP_POLICY_AUDIT_MEDIA_EVIDENCE_LIMIT", 40),
  };
  const mediaLibraryAudit = await mapAgentMediaLibraryForAudit(
    mediaRows as Array<Record<string, unknown>>,
    candidate.userId,
    mediaEvidenceBudget,
  );
  const recentConversations = await attachRecentMessages(
    recentConversationRows as Array<Record<string, unknown>>,
    messageLimitPerConversation,
    candidate.userId,
    mediaEvidenceBudget,
  );
  const evidenceGaps: string[] = [];
  if (recentConversations.some((conversation) => conversation.messagesHasMoreBeforeWindow === true)) {
    evidenceGaps.push("older_messages_exist_outside_snapshot");
  }
  if (candidate.conversationCount > conversationLimit) {
    evidenceGaps.push("recent_conversations_outside_snapshot");
  }
  for (const gap of mediaLibraryAudit.evidenceGaps) {
    const normalized = normalizeString(gap, 240);
    if (normalized) evidenceGaps.push(normalized);
  }
  for (const conversation of recentConversations) {
    const mediaEvidenceGaps = Array.isArray(conversation.mediaEvidenceGaps)
      ? conversation.mediaEvidenceGaps
      : [];
    for (const gap of mediaEvidenceGaps) {
      const normalized = normalizeString(gap, 240);
      if (normalized) evidenceGaps.push(normalized);
    }
  }

  return {
    schemaVersion: PLATFORM_POLICY_AUDIT_SCHEMA_VERSION,
    candidate,
    user: {
      id: userRecord?.id || candidate.userId,
      email: userRecord?.email || candidate.email,
      name: userRecord?.name || null,
      phone: userRecord?.phone || null,
      role: userRecord?.role || null,
      businessType: (userRecord as any)?.businessType || null,
      createdAt: userRecord?.createdAt || null,
      updatedAt: userRecord?.updatedAt || null,
      suspendedAt: (userRecord as any)?.suspendedAt || null,
      suspensionType: (userRecord as any)?.suspensionType || null,
    },
    aiAgentConfig: agentConfig ? (agentConfig as Record<string, unknown>) : null,
    businessAgentConfig: businessConfig ? (businessConfig as Record<string, unknown>) : null,
    connections: connections.map((connection: any) => ({
      id: connection.id,
      phoneNumber: connection.phoneNumber,
      connectionName: connection.connectionName,
      isConnected: connection.isConnected,
      providerStatus: connection.providerStatus,
      aiEnabled: connection.aiEnabled,
      isPrimary: connection.isPrimary,
      updatedAt: connection.updatedAt,
    })),
    mediaLibrary: mediaLibraryAudit.mediaLibrary,
    productsConfig: productConfigRows[0] ? productConfigRows[0] as Record<string, unknown> : null,
    products: productRows as Array<Record<string, unknown>>,
    recentPolicyViolations: violationRows as Array<Record<string, unknown>>,
    recentConversations,
    coverage: {
      candidateReason: candidate.reason,
      conversationLimit,
      messageLimitPerConversation,
      conversationsIncluded: recentConversations.length,
      mediaIncluded: mediaLibraryAudit.mediaLibrary.length,
      productsIncluded: productRows.length,
      mediaEvidenceLimit: readIntEnv("AGENTEZAP_POLICY_AUDIT_MEDIA_EVIDENCE_LIMIT", 40),
      mediaEvidenceRemaining: mediaEvidenceBudget.remaining,
      selectedAt: new Date().toISOString(),
      latestActivityAt: candidate.latestActivityAt,
    },
    evidenceGaps,
  };
}

function buildPolicyAuditOutputSchema(snapshot: PolicyAuditSnapshot): Record<string, unknown> {
  const targetEmail = snapshot.candidate.email || null;
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "schemaVersion",
      "targetUserId",
      "targetEmail",
      "decision",
      "confidence",
      "violationType",
      "reason",
      "requiredSideEffects",
      "evidenceQuotes",
      "evidenceRecordIds",
      "filesRead",
      "contextUsed",
      "uncertainty",
      "ownerNotificationSummary",
    ],
    properties: {
      schemaVersion: { type: "string", const: PLATFORM_POLICY_AUDIT_SCHEMA_VERSION },
      targetUserId: { type: "string", const: snapshot.candidate.userId },
      targetEmail: targetEmail === null
        ? { type: "null" }
        : { type: "string", const: targetEmail },
      decision: { type: "string", enum: ["no_action", "needs_human_review", "suspend_user"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      violationType: {
        type: ["string", "null"],
        enum: [
          "adult_content",
          "sexual_services",
          "nudity_or_explicit_media",
          "religious_practice_by_ai",
          "illegal_activity",
          "other_platform_policy",
          null,
        ],
      },
      reason: { type: "string", maxLength: 1200 },
      requiredSideEffects: {
        type: "array",
        items: { type: "string", enum: ["none", "suspend_user", "notify_owner_private"] },
        minItems: 1,
        maxItems: 3,
      },
      evidenceQuotes: { type: "array", items: { type: "string", maxLength: 500 }, maxItems: 8 },
      evidenceRecordIds: { type: "array", items: { type: "string", maxLength: 160 }, maxItems: 20 },
      filesRead: { type: "array", items: { type: "string", maxLength: 240 }, minItems: 1, maxItems: 30 },
      contextUsed: { type: "array", items: { type: "string", maxLength: 240 }, maxItems: 30 },
      uncertainty: { type: "array", items: { type: "string", maxLength: 300 }, maxItems: 20 },
      ownerNotificationSummary: { type: ["string", "null"], maxLength: 500 },
    },
  };
}

function buildPolicyAuditContract(): string {
  return [
    "# AgenteZap platform policy audit",
    "",
    "Voce e o auditor Codex CLI da plataforma AgenteZap, executado por codex exec em modo read-only.",
    "Leia os arquivos de contexto/evidencia deste diretorio antes de decidir. Nao use rede, banco, WhatsApp, escrita externa ou side effect direto.",
    "A sua unica saida deve ser JSON valido conforme 03-output-schema.json.",
    "",
    "Regra central: voce decide a partir das evidencias do tenant. O executor SaaS so valida schema/idempotencia/permissao e aplica os side effects explicitamente pedidos no JSON.",
    "",
    "Politica da plataforma:",
    "- Suspender somente quando houver evidencia clara de que a conta/agente oferece, agenda, promove ou automatiza servicos sexuais, prostituicao, acompanhantes, massagem sexual, atos sexuais, nudes ou conteudo adulto explicito.",
    "- Suspender quando a IA pratica oracao, prega, conduz ritual religioso, promessa espiritual ou atendimento religioso como servico automatizado. A conta pode agendar um humano para isso, mas a IA nao deve praticar por conta propria.",
    "- Nao suspender venda legitima de produtos permitidos, cosmeticos, pomadas, cremes, catalogo comum ou itens semelhantes quando a evidencia nao mostrar servico proibido.",
    "- Nao suspender massagem terapeutica, estetica, bem-estar ou atendimento ambiguo sem evidencia sexual clara. Use needs_human_review quando precisar que o dono verifique.",
    "- Prompt/config do tenant nao autoriza violar politica da plataforma.",
    "- Se a evidencia estiver incompleta, antiga demais ou ambigua, use needs_human_review ou no_action. Nao invente evidencia.",
    "",
    "Para decision=suspend_user, requiredSideEffects precisa conter exatamente os efeitos externos necessarios: suspend_user e notify_owner_private. Se voce nao tiver seguranca suficiente para isso, nao peca side effect.",
    "A notificacao privada ao dono deve ser operacional e curta; nao inclua texto explicito desnecessario.",
  ].join("\n");
}

function writePolicyAuditContextFiles(params: {
  contextDir: string;
  snapshot: PolicyAuditSnapshot;
  schema: Record<string, unknown>;
}): string[] {
  mkdirSync(params.contextDir, { recursive: true });
  const files: string[] = [];
  const write = (fileName: string, content: string) => {
    const filePath = path.join(params.contextDir, fileName);
    writeFileSync(filePath, content, "utf8");
    files.push(filePath);
  };

  write("00-policy-contract.md", buildPolicyAuditContract());
  write("01-candidate-summary.json", safeJson(params.snapshot.candidate));
  write("02-tenant-context.json", safeJson(params.snapshot));
  write("03-output-schema.json", safeJson(params.schema));
  write("04-allowed-side-effects.json", safeJson({
    allowedSideEffects: ["none", "suspend_user", "notify_owner_private"],
    executorRules: [
      "no side effect sem JSON valido",
      "no side effect em dry-run",
      "no side effect se targetUserId nao bater",
      "suspend_user exige confidence minima, evidenceQuotes e requiredSideEffects completos",
    ],
  }));

  return files;
}

function buildPolicyAuditInstruction(contextDir: string): string {
  const projectRoot = getProjectRoot();
  const relativeContextDir = path.relative(projectRoot, contextDir) || contextDir;
  return [
    "Execute a auditoria de politica deste tenant usando somente leitura local.",
    "",
    "Arquivos de contexto:",
    relativeContextDir,
    "",
    "Leia no minimo:",
    "- 00-policy-contract.md",
    "- 01-candidate-summary.json",
    "- 02-tenant-context.json",
    "- 03-output-schema.json",
    "- 04-allowed-side-effects.json",
    "",
    "Use comandos locais somente para leitura, como rg, cat, sed, ls ou Get-Content.",
    "Responda somente o JSON final conforme 03-output-schema.json.",
  ].join("\n");
}

function normalizePolicyAuditDecision(
  value: unknown,
  snapshot: PolicyAuditSnapshot,
): { decision: PolicyAuditDecision; violations: string[] } {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const violations: string[] = [];

  if (raw.schemaVersion !== PLATFORM_POLICY_AUDIT_SCHEMA_VERSION) {
    violations.push("schema_version_mismatch");
  }

  const allowedDecisions: PolicyAuditDecisionName[] = ["no_action", "needs_human_review", "suspend_user"];
  const decision = allowedDecisions.includes(raw.decision as PolicyAuditDecisionName)
    ? raw.decision as PolicyAuditDecisionName
    : "needs_human_review";
  if (!allowedDecisions.includes(raw.decision as PolicyAuditDecisionName)) {
    violations.push("decision_invalid_or_missing");
  }

  const targetUserId = String(raw.targetUserId || "").trim();
  if (targetUserId !== snapshot.candidate.userId) {
    violations.push("target_user_mismatch");
  }

  const targetEmail = raw.targetEmail === null || raw.targetEmail === undefined
    ? null
    : String(raw.targetEmail || "").trim();
  if ((targetEmail || null) !== (snapshot.candidate.email || null)) {
    violations.push("target_email_mismatch");
  }

  const sideEffects = normalizeStringArray(raw.requiredSideEffects, 3, 80)
    .filter((item): item is PolicyAuditSideEffect =>
      ["none", "suspend_user", "notify_owner_private"].includes(item),
    );

  return {
    decision: {
      schemaVersion: PLATFORM_POLICY_AUDIT_SCHEMA_VERSION,
      targetUserId: snapshot.candidate.userId,
      targetEmail: snapshot.candidate.email || null,
      decision,
      confidence: clampConfidence(raw.confidence),
      violationType: raw.violationType === null || raw.violationType === undefined
        ? null
        : normalizeString(raw.violationType, 120),
      reason: normalizeString(raw.reason, 1200),
      requiredSideEffects: sideEffects.length > 0 ? sideEffects : ["none"],
      evidenceQuotes: normalizeStringArray(raw.evidenceQuotes, 8, 500),
      evidenceRecordIds: normalizeStringArray(raw.evidenceRecordIds, 20, 160),
      filesRead: normalizeStringArray(raw.filesRead, 30, 240),
      contextUsed: normalizeStringArray(raw.contextUsed, 30, 240),
      uncertainty: normalizeStringArray(raw.uncertainty, 20, 300),
      ownerNotificationSummary: raw.ownerNotificationSummary === null || raw.ownerNotificationSummary === undefined
        ? null
        : normalizeString(raw.ownerNotificationSummary, 500),
    },
    violations,
  };
}

function buildFailClosedDecision(
  snapshot: PolicyAuditSnapshot,
  reason: string,
): PolicyAuditDecision {
  return {
    schemaVersion: PLATFORM_POLICY_AUDIT_SCHEMA_VERSION,
    targetUserId: snapshot.candidate.userId,
    targetEmail: snapshot.candidate.email || null,
    decision: "needs_human_review",
    confidence: 0,
    violationType: null,
    reason: normalizeString(reason, 600),
    requiredSideEffects: ["none"],
    evidenceQuotes: [],
    evidenceRecordIds: [],
    filesRead: [],
    contextUsed: ["codex_audit_failed_closed"],
    uncertainty: ["codex_cli_failed_or_returned_invalid_json"],
    ownerNotificationSummary: null,
  };
}

export async function runCodexPolicyAuditForSnapshot(
  snapshot: PolicyAuditSnapshot,
  params: { timeoutMs?: number } = {},
): Promise<{
  decision: PolicyAuditDecision;
  rawText: string;
  violations: string[];
  contextDir: string | null;
}> {
  const projectRoot = getProjectRoot();
  const codexHome = getCodexHome(projectRoot);
  const contextBase = path.join(projectRoot, ".codex-runs", "policy-audit-contexts");
  mkdirSync(contextBase, { recursive: true });
  const contextDir = mkdtempSync(path.join(contextBase, "audit-"));
  const timeoutMs = params.timeoutMs || readIntEnv("AGENTEZAP_POLICY_AUDIT_CODEX_TIMEOUT_MS", 180_000);
  const schema = buildPolicyAuditOutputSchema(snapshot);
  const schemaFile = path.join(contextDir, "output-schema.json");
  const outputFile = path.join(contextDir, "codex-final.json");

  try {
    if (existsSync(outputFile)) {
      rmSync(outputFile, { force: true });
    }
    writeFileSync(schemaFile, safeJson(schema), "utf8");
    writePolicyAuditContextFiles({ contextDir, snapshot, schema });

    const env = buildCodexEnv(codexHome);
    mkdirSync(codexHome, { recursive: true });
    await assertCodexAuth(env, projectRoot, timeoutMs);

    const cliArgs = [
      "exec",
      "--ignore-user-config",
      "--ephemeral",
      "--config",
      "history.persistence=\"none\"",
      "--config",
      "features.memories=false",
      "--config",
      "memories.use_memories=false",
      "--config",
      "memories.generate_memories=false",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--cd",
      projectRoot,
      "--model",
      getPolicyAuditModel(),
      "--config",
      `model_reasoning_effort="${getPolicyAuditReasoningEffort()}"`,
      "--json",
      "--output-schema",
      schemaFile,
      "--output-last-message",
      outputFile,
      "-",
    ];

    const result = await runCodexProcess(
      cliArgs,
      buildPolicyAuditInstruction(contextDir),
      env,
      projectRoot,
      timeoutMs,
    );
    if (result.exitCode !== 0 || result.timedOut) {
      throw new Error(`codex_policy_audit_failed exit=${result.exitCode} timedOut=${result.timedOut}\n${result.stderr || result.stdout}`);
    }

    const rawText = existsSync(outputFile) ? readFileSync(outputFile, "utf8").trim() : result.stdout.trim();
    const normalized = normalizePolicyAuditDecision(parseAgenteZapLiveCliJson(rawText), snapshot);
    normalized.decision.filesRead = [
      ...normalized.decision.filesRead,
      path.relative(projectRoot, contextDir),
    ].slice(0, 30);
    normalized.decision.contextUsed = [
      ...normalized.decision.contextUsed,
      "codex_exec_policy_audit_context_files",
      `model:${getPolicyAuditModel()}`,
    ].slice(0, 30);
    return {
      decision: normalized.decision,
      rawText,
      violations: normalized.violations,
      contextDir,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[PlatformPolicyAudit] Codex fail-closed:", message);
    return {
      decision: buildFailClosedDecision(snapshot, message),
      rawText: "",
      violations: ["codex_policy_audit_failed_closed", message.slice(0, 500)],
      contextDir,
    };
  }
}

function decisionHasRequiredSuspensionContract(decision: PolicyAuditDecision): boolean {
  return (
    decision.decision === "suspend_user" &&
    decision.requiredSideEffects.includes("suspend_user") &&
    decision.requiredSideEffects.includes("notify_owner_private")
  );
}

function buildSuspensionEvidence(snapshot: PolicyAuditSnapshot, decision: PolicyAuditDecision, contextDir: string | null) {
  return [{
    source: "codex_policy_audit",
    schemaVersion: PLATFORM_POLICY_AUDIT_SCHEMA_VERSION,
    targetUserId: snapshot.candidate.userId,
    targetEmail: snapshot.candidate.email || null,
    violationType: decision.violationType,
    reason: decision.reason,
    confidence: decision.confidence,
    evidenceQuotes: decision.evidenceQuotes,
    evidenceRecordIds: decision.evidenceRecordIds,
    filesRead: decision.filesRead,
    contextDir,
    coverage: snapshot.coverage,
    evidenceGaps: snapshot.evidenceGaps,
    decidedAt: new Date().toISOString(),
  }];
}

function buildOwnerSuspensionNotification(snapshot: PolicyAuditSnapshot, decision: PolicyAuditDecision): string[] {
  const tenantLabel = snapshot.candidate.email || snapshot.candidate.userId;
  return [
    "AgenteZap: conta suspensa automaticamente por politica da plataforma.",
    `Cliente: ${tenantLabel}`,
    `Tipo: ${decision.violationType || "politica"}`,
    "IA, conexoes e follow-ups do cliente foram desativados.",
    "Evidencias completas ficaram registradas em policy_violations para verificacao.",
  ];
}

async function appendPolicyViolationInternalNote(userId: string, note: string): Promise<void> {
  const safeNote = `\n${new Date().toISOString()} ${note}`;
  await db.execute(sql`
    UPDATE ${policyViolations}
       SET internal_notes = COALESCE(internal_notes, '') || ${safeNote},
           updated_at = now()
     WHERE id = (
       SELECT id
         FROM ${policyViolations}
        WHERE user_id = ${userId}
          AND resulted_in_suspension IS TRUE
        ORDER BY created_at DESC
        LIMIT 1
     )
  `);
}

async function sendOwnerSuspensionNotificationWithRetryMarker(
  snapshot: PolicyAuditSnapshot,
  decision: PolicyAuditDecision,
): Promise<{ sent: boolean; error?: string | null }> {
  try {
    const notification = await sendOwnerPrivateWhatsAppNotification({
      message: buildOwnerSuspensionNotification(snapshot, decision),
      contactName: "Rodrigo - auditoria AgenteZap",
    });

    if (notification.success) {
      await appendPolicyViolationInternalNote(snapshot.candidate.userId, "owner_notification_sent");
      return { sent: true };
    }

    const error = notification.error || "owner_notification_failed";
    await appendPolicyViolationInternalNote(
      snapshot.candidate.userId,
      `owner_notification_pending error=${normalizeString(error, 180)}`,
    );
    return { sent: false, error };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendPolicyViolationInternalNote(
      snapshot.candidate.userId,
      `owner_notification_pending error=${normalizeString(message, 180)}`,
    );
    return { sent: false, error: message };
  }
}

async function retryPendingOwnerSuspensionNotifications(): Promise<OwnerNotificationRetryResult> {
  const limit = readIntEnv("AGENTEZAP_POLICY_AUDIT_OWNER_NOTIFICATION_RETRY_LIMIT", 50);
  const result = await db.execute(sql`
    SELECT
      u.id AS user_id,
      u.email AS email,
      u.suspension_type AS suspension_type,
      u.suspension_reason AS suspension_reason,
      pv.id AS violation_id,
      pv.internal_notes AS internal_notes
    FROM ${users} u
    INNER JOIN LATERAL (
      SELECT id, internal_notes
        FROM ${policyViolations}
       WHERE user_id = u.id
         AND resulted_in_suspension IS TRUE
       ORDER BY created_at DESC
       LIMIT 1
    ) pv ON true
    WHERE u.suspended_at IS NOT NULL
    ORDER BY u.suspended_at DESC
    LIMIT ${Math.max(limit * 3, limit)}
  `);

  const rows = (((result as any).rows || []) as Array<Record<string, unknown>>)
    .filter((row) => {
      const notes = String(row.internal_notes || "").toLowerCase();
      return notes.includes("owner_notification_pending") && !notes.includes("owner_notification_sent");
    })
    .slice(0, limit);
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const userId = String(row.user_id || "").trim();
    if (!userId) continue;
    const snapshot = {
      candidate: {
        userId,
        email: row.email ? String(row.email) : null,
      },
    } as PolicyAuditSnapshot;
    const decision = {
      violationType: row.suspension_type ? String(row.suspension_type) : "other_platform_policy",
    } as PolicyAuditDecision;

    const notification = await sendOwnerSuspensionNotificationWithRetryMarker(snapshot, decision);
    if (notification.sent) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return {
    attempted: rows.length,
    sent,
    failed,
  };
}

function hasStructuralPolicyAuditViolation(violations: string[]): boolean {
  return violations.some((violation) => STRUCTURAL_POLICY_AUDIT_VIOLATIONS.has(violation));
}

async function executePolicyAuditDecision(params: {
  snapshot: PolicyAuditSnapshot;
  decision: PolicyAuditDecision;
  contextDir: string | null;
  enabled: boolean;
  dryRun: boolean;
  minConfidence: number;
  codexViolations: string[];
}): Promise<PolicyAuditExecutionResult> {
  const violations: string[] = [];
  const decision = params.decision;

  if (hasStructuralPolicyAuditViolation(params.codexViolations)) {
    return {
      applied: false,
      dryRun: params.dryRun,
      skipped: "structural_codex_contract_violation",
      suspensionApplied: false,
      notificationSent: false,
      violations: ["structural_codex_contract_violation", ...params.codexViolations, ...violations],
    };
  }

  if (decision.decision !== "suspend_user") {
    return {
      applied: false,
      dryRun: params.dryRun,
      skipped: decision.decision,
      suspensionApplied: false,
      notificationSent: false,
      violations,
    };
  }

  if (!decisionHasRequiredSuspensionContract(decision)) {
    return {
      applied: false,
      dryRun: params.dryRun,
      skipped: "missing_required_side_effects",
      suspensionApplied: false,
      notificationSent: false,
      violations: ["missing_suspend_or_notify_side_effect", ...violations],
    };
  }

  if (decision.confidence < params.minConfidence) {
    return {
      applied: false,
      dryRun: params.dryRun,
      skipped: "confidence_below_threshold",
      suspensionApplied: false,
      notificationSent: false,
      violations: ["confidence_below_threshold", ...violations],
    };
  }

  if (!decision.violationType || decision.violationType === "other_platform_policy") {
    return {
      applied: false,
      dryRun: params.dryRun,
      skipped: "violation_type_not_specific",
      suspensionApplied: false,
      notificationSent: false,
      violations: ["violation_type_not_specific", ...violations],
    };
  }

  if (decision.evidenceQuotes.length === 0 && decision.evidenceRecordIds.length === 0) {
    return {
      applied: false,
      dryRun: params.dryRun,
      skipped: "missing_evidence_references",
      suspensionApplied: false,
      notificationSent: false,
      violations: ["missing_evidence_references", ...violations],
    };
  }

  if (params.snapshot.evidenceGaps.length > 0) {
    return {
      applied: false,
      dryRun: params.dryRun,
      skipped: "evidence_gap_requires_human_review",
      suspensionApplied: false,
      notificationSent: false,
      violations: ["evidence_gap_requires_human_review", ...params.snapshot.evidenceGaps, ...violations],
    };
  }

  if (!params.enabled || params.dryRun) {
    return {
      applied: false,
      dryRun: params.dryRun,
      skipped: "dry_run_or_disabled",
      suspensionApplied: false,
      notificationSent: false,
      violations,
    };
  }

  const existingSuspension = await storage.isUserSuspended(params.snapshot.candidate.userId);
  if (existingSuspension.suspended) {
    return {
      applied: false,
      dryRun: params.dryRun,
      skipped: "already_suspended",
      suspensionApplied: false,
      notificationSent: false,
      violations,
    };
  }

  await storage.suspendUser(
    params.snapshot.candidate.userId,
    decision.violationType,
    decision.reason || `Suspensao automatica por ${decision.violationType}`,
    undefined,
    buildSuspensionEvidence(params.snapshot, decision, params.contextDir),
  );

  const notification = await sendOwnerSuspensionNotificationWithRetryMarker(params.snapshot, decision);

  return {
    applied: true,
    dryRun: params.dryRun,
    suspensionApplied: true,
    notificationSent: notification.sent,
    notificationError: notification.sent ? null : notification.error || "owner_notification_failed",
    violations: notification.sent ? violations : ["owner_notification_pending_retry_scheduled", ...violations],
  };
}

export async function runPlatformPolicyAuditOnce(params: {
  enabled?: boolean;
  dryRun?: boolean;
  candidateLimit?: number;
  lookbackHours?: number;
  minConfidence?: number;
} = {}): Promise<PlatformPolicyAuditRunResult> {
  const startedAt = new Date();
  const enabled = params.enabled ?? readBooleanEnv("AGENTEZAP_POLICY_AUDIT_ENABLED", false);
  const dryRun = params.dryRun ?? readBooleanEnv("AGENTEZAP_POLICY_AUDIT_DRY_RUN", !enabled);
  const minConfidence = params.minConfidence ?? Number(process.env.AGENTEZAP_POLICY_AUDIT_MIN_CONFIDENCE || 0.82);
  const ownerNotificationRetries = enabled && !dryRun
    ? await retryPendingOwnerSuspensionNotifications()
    : { attempted: 0, sent: 0, failed: 0 };

  const candidates = await selectPolicyAuditCandidates({
    limit: params.candidateLimit,
    lookbackHours: params.lookbackHours,
  });

  const results: PolicyAuditCandidateResult[] = [];
  for (const candidate of candidates) {
    const snapshot = await buildPolicyAuditSnapshot(candidate);
    if (snapshot.user.suspendedAt) {
      const decision = buildFailClosedDecision(snapshot, "tenant_already_suspended");
      const execution: PolicyAuditExecutionResult = {
        applied: false,
        dryRun,
        skipped: "already_suspended",
        suspensionApplied: false,
        notificationSent: false,
        violations: [],
      };
      results.push({ candidate, snapshot, decision, rawText: "", violations: [], contextDir: null, execution });
      continue;
    }

    const codexResult = await runCodexPolicyAuditForSnapshot(snapshot);
    const execution = await executePolicyAuditDecision({
      snapshot,
      decision: codexResult.decision,
      contextDir: codexResult.contextDir,
      enabled,
      dryRun,
      minConfidence,
      codexViolations: codexResult.violations,
    });
    results.push({
      candidate,
      snapshot,
      decision: codexResult.decision,
      rawText: codexResult.rawText,
      violations: [...codexResult.violations, ...execution.violations],
      contextDir: codexResult.contextDir,
      execution,
    });
  }

  const finishedAt = new Date();
  return {
    accepted: true,
    dryRun,
    enabled,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    candidates: candidates.length,
    processed: results.length,
    suspended: results.filter((result) => result.execution.suspensionApplied).length,
    needsHumanReview: results.filter((result) => result.decision.decision === "needs_human_review").length,
    noAction: results.filter((result) => result.decision.decision === "no_action").length,
    failed: results.filter((result) => result.violations.includes("codex_policy_audit_failed_closed")).length,
    ownerNotificationRetries,
    results: results.map((result) => ({
      userId: result.candidate.userId,
      email: result.candidate.email,
      decision: result.decision.decision,
      confidence: result.decision.confidence,
      applied: result.execution.applied,
      suspensionApplied: result.execution.suspensionApplied,
      notificationSent: result.execution.notificationSent,
      skipped: result.execution.skipped,
      violations: result.violations,
    })),
  };
}
