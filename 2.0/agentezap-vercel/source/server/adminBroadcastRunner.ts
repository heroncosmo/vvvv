import { storage } from "./storage";
import { applyAIVariation } from "./notificationSchedulerService";
import { deleteAdminSentMessage, sendAdminNotification, getAdminSession } from "./whatsapp";
import { waitForAdminBulkSendWindow } from "./adminBulkSendThrottle";
import { renderLeadCampaignTemplate, trimText, type LeadCampaignRecipient } from "./leadIntelligenceHelpers";
import { armLeadReplyOnInbound } from "./leadIntelligenceService";
import { sanitizeAdminBroadcast, sanitizeAdminNotificationConfig } from "./adminMessagingFeaturePolicy";

const ADMIN_BROADCAST_RECOVERY_INTERVAL_MS = 60_000;
const ADMIN_BROADCAST_SESSION_WAIT_MS = 5 * 60_000;
const ADMIN_BROADCAST_SESSION_POLL_MS = 15_000;
const ADMIN_BROADCAST_AI_PREFETCH_WINDOW_DEFAULT = 20;
const ADMIN_BROADCAST_AI_PREFETCH_WINDOW_MAX = 50;
const ADMIN_BROADCAST_AI_MAX_ATTEMPTS = 3;

type BroadcastRecipient = {
  userId?: string;
  phone: string;
  name: string;
  progressKey: string;
  leadId?: string;
  conversationId?: string;
  sourceAccountName?: string | null;
  sourceConnectionName?: string | null;
  sourceConnectionPhone?: string | null;
  businessType?: string | null;
  potentialGrade?: string | null;
  potentialScore?: number | null;
  qualificationReason?: string | null;
  summary?: string | null;
  preparedMessage?: string | null;
  replyMessageOnInbound?: string | null;
  sendAndDelete?: boolean;
};

type BroadcastSnapshot = {
  userIds: string[];
  targetType: string;
  createdAt: string;
};

type ResolvedBroadcastRecipients = {
  recipients: BroadcastRecipient[];
  materializedSnapshot?: BroadcastSnapshot;
  resolvedTotalRecipients: number;
};

const activeBroadcastTasks = new Map<string, Promise<void>>();
let recoveryLoop: NodeJS.Timeout | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAiPrefetchWindow() {
  const rawValue = Number(process.env.ADMIN_BROADCAST_AI_PREFETCH_WINDOW || ADMIN_BROADCAST_AI_PREFETCH_WINDOW_DEFAULT);
  if (!Number.isFinite(rawValue)) {
    return ADMIN_BROADCAST_AI_PREFETCH_WINDOW_DEFAULT;
  }

  return Math.max(1, Math.min(Math.floor(rawValue), ADMIN_BROADCAST_AI_PREFETCH_WINDOW_MAX));
}

function onlyDigits(value: string) {
  let digits = "";
  for (const char of String(value || "")) {
    if (char >= "0" && char <= "9") {
      digits += char;
    }
  }
  return digits;
}

function normalizePhone(phone: string) {
  const digits = onlyDigits(phone);
  if (!digits) {
    return "";
  }

  if (!digits.startsWith("55") && digits.length <= 11) {
    return `55${digits}`;
  }

  return digits;
}

function parseTimestamp(value: unknown) {
  if (!value) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getUserCreatedAt(user: any) {
  return parseTimestamp(user?.created_at || user?.createdAt);
}

function validateRecipientPhone(phone: string) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return {
      isValid: false,
      normalizedPhone,
      errorMessage: "Usuario sem telefone cadastrado",
    };
  }

  if (normalizedPhone.length < 12 || normalizedPhone.length > 13) {
    return {
      isValid: false,
      normalizedPhone,
      errorMessage: `Telefone invalido no cadastro: ${phone}`,
    };
  }

  return {
    isValid: true,
    normalizedPhone,
    errorMessage: undefined,
  };
}

function getProgressKey(userId: string | undefined, phone: string, leadId?: string) {
  if (leadId) {
    return `lead:${leadId}`;
  }
  if (userId) {
    return `user:${userId}`;
  }
  return `phone:${normalizePhone(phone)}`;
}

function getBroadcastKey(adminId: string, broadcastId: string) {
  return `${adminId}:${broadcastId}`;
}

function getConfigFlag<T>(primary: T | undefined, secondary: T | undefined, fallback: T) {
  if (primary !== undefined) {
    return primary;
  }
  if (secondary !== undefined) {
    return secondary;
  }
  return fallback;
}

function getThrottleConfig(config: any, broadcast?: any) {
  const rawMin = Number(
    broadcast?.custom_min_interval_seconds ??
      broadcast?.customMinIntervalSeconds ??
    config?.broadcast_min_interval_seconds ??
      config?.broadcastMinIntervalSeconds ??
      60,
  );
  const rawMax = Number(
    broadcast?.custom_max_interval_seconds ??
      broadcast?.customMaxIntervalSeconds ??
    config?.broadcast_max_interval_seconds ??
      config?.broadcastMaxIntervalSeconds ??
      rawMin,
  );
  const rawBatchSize = Number(
    broadcast?.custom_batch_size ??
      broadcast?.customBatchSize ??
      10,
  );
  const rawBatchPauseSeconds = Number(
    broadcast?.custom_batch_pause_seconds ??
      broadcast?.customBatchPauseSeconds ??
      600,
  );

  const minIntervalSeconds = Math.max(Number.isFinite(rawMin) ? rawMin : 60, 60);
  const maxIntervalSeconds = Math.max(Number.isFinite(rawMax) ? rawMax : minIntervalSeconds, minIntervalSeconds);
  const batchSize = Math.max(Number.isFinite(rawBatchSize) ? Math.round(rawBatchSize) : 10, 1);
  const batchPauseSeconds = Math.max(Number.isFinite(rawBatchPauseSeconds) ? Math.round(rawBatchPauseSeconds) : 600, 0);

  return { minIntervalSeconds, maxIntervalSeconds, batchSize, batchPauseSeconds };
}

async function waitForAdminBulkThrottle(adminId: string, config: any, broadcast: any, label: string) {
  const { minIntervalSeconds, maxIntervalSeconds, batchSize, batchPauseSeconds } = getThrottleConfig(config, broadcast);
  const slot = await waitForAdminBulkSendWindow(adminId, {
    minIntervalSeconds,
    maxIntervalSeconds,
    batchSize,
    batchPauseMs: batchPauseSeconds * 1000,
    scope: "admin-bulk-send",
  });

  if (slot.waitMs > 0) {
    console.log(
      `[ADMIN BROADCAST] ${label}: aguardou ${Math.floor(slot.waitMs / 1000)}s antes do envio #${slot.reservedIndex}`,
    );
  }

  if (slot.batchPauseApplied) {
    console.log(
      `[ADMIN BROADCAST] ${label}: pausa longa aplicada apos o lote #${slot.reservedIndex - 1}`,
    );
  }

  return slot;
}

async function waitForAdminSession(adminId: string, broadcastId: string) {
  const deadline = Date.now() + ADMIN_BROADCAST_SESSION_WAIT_MS;

  while (Date.now() < deadline) {
    const session = getAdminSession(adminId);
    if (session?.socket?.user) {
      return true;
    }

    console.log(
      `[ADMIN BROADCAST ${broadcastId}] Sessao do admin indisponivel. Aguardando reconexao por ${Math.floor(ADMIN_BROADCAST_SESSION_POLL_MS / 1000)}s...`,
    );
    await sleep(ADMIN_BROADCAST_SESSION_POLL_MS);
  }

  return false;
}

function buildRecipientsFromUsers(users: any[]) {
  return users.map((user) => {
    const phone = user.phone || user.whatsappNumber || "";
    const name = user.name || user.fullName || "Cliente";
    return {
      userId: user.id,
      phone,
      name,
      progressKey: getProgressKey(user.id, phone),
    } satisfies BroadcastRecipient;
  });
}

function normalizeCustomRecipients(rawRecipients: unknown): BroadcastRecipient[] {
  if (!Array.isArray(rawRecipients)) {
    return [];
  }

  return rawRecipients
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as LeadCampaignRecipient;
      const phone = String(candidate.phone || "").trim();
      if (!phone) {
        return null;
      }

      return {
        userId: candidate.userId,
        phone,
        name: String(candidate.name || "Cliente"),
        leadId: candidate.leadId,
        conversationId: candidate.conversationId,
        sourceAccountName: candidate.sourceAccountName || null,
        sourceConnectionName: candidate.sourceConnectionName || null,
        sourceConnectionPhone: candidate.sourceConnectionPhone || null,
        businessType: candidate.businessType || null,
        potentialGrade: candidate.potentialGrade || null,
        potentialScore: candidate.potentialScore ?? null,
        qualificationReason: candidate.qualificationReason || null,
        summary: candidate.summary || null,
        preparedMessage: candidate.preparedMessage || null,
        replyMessageOnInbound: candidate.replyMessageOnInbound || null,
        sendAndDelete: candidate.sendAndDelete === true,
        progressKey: getProgressKey(candidate.userId, phone, candidate.leadId),
      } satisfies BroadcastRecipient;
    })
    .filter((recipient): recipient is BroadcastRecipient => Boolean(recipient));
}

function renderBroadcastMessage(template: string, recipient: BroadcastRecipient) {
  return renderLeadCampaignTemplate(template, {
    leadId: recipient.leadId,
    conversationId: recipient.conversationId,
    userId: recipient.userId,
    phone: recipient.phone,
    name: recipient.name,
    sourceAccountName: recipient.sourceAccountName,
    sourceConnectionName: recipient.sourceConnectionName,
    sourceConnectionPhone: recipient.sourceConnectionPhone,
    businessType: recipient.businessType,
    potentialGrade: recipient.potentialGrade,
    potentialScore: recipient.potentialScore,
    qualificationReason: recipient.qualificationReason,
    summary: recipient.summary,
  });
}

function filterUsersByTargetType(users: any[], subscriptions: any[] | undefined, targetType: string) {
  if (targetType === "with_plan") {
    return users.filter((user) =>
      subscriptions?.some((subscription) => subscription.userId === user.id && subscription.status === "active"),
    );
  }

  if (targetType === "without_plan") {
    return users.filter((user) =>
      !subscriptions?.some((subscription) => subscription.userId === user.id && subscription.status === "active"),
    );
  }

  return users;
}

export async function buildAdminBroadcastSnapshot(targetType: string) {
  const users = await storage.getAllUsers();
  const subscriptions = await storage.getAllSubscriptions?.();
  const recipients = filterUsersByTargetType(users, subscriptions, targetType);

  return {
    totalRecipients: recipients.length,
    targetFilter: {
      userIds: recipients.map((user) => user.id),
      targetType,
      createdAt: new Date().toISOString(),
    } satisfies BroadcastSnapshot,
  };
}

async function resolveRecipientsForBroadcast(broadcast: any): Promise<ResolvedBroadcastRecipients> {
  const customRecipients = normalizeCustomRecipients(
    broadcast.custom_recipients || broadcast.customRecipients,
  );
  if (customRecipients.length > 0) {
    return {
      recipients: customRecipients,
      resolvedTotalRecipients: customRecipients.length,
    };
  }

  const users = await storage.getAllUsers();
  const subscriptions = await storage.getAllSubscriptions?.();
  const snapshot = (broadcast.target_filter || broadcast.targetFilter || null) as BroadcastSnapshot | null;

  if (snapshot?.userIds?.length) {
    const usersById = new Map(users.map((user) => [user.id, user]));
    const snapshottedUsers = snapshot.userIds
      .map((userId) => usersById.get(userId))
      .filter(Boolean);

    const recipients = buildRecipientsFromUsers(snapshottedUsers);
    return {
      recipients,
      resolvedTotalRecipients: recipients.length,
    };
  }

  const targetType = broadcast.target_type || broadcast.targetType || "all";
  const broadcastCreatedAt = parseTimestamp(broadcast.created_at || broadcast.createdAt);
  let filteredUsers = filterUsersByTargetType(users, subscriptions, targetType);

  if (broadcastCreatedAt > 0) {
    const beforeCount = filteredUsers.length;
    filteredUsers = filteredUsers.filter((user) => {
      const userCreatedAt = getUserCreatedAt(user);
      return userCreatedAt === 0 || userCreatedAt <= broadcastCreatedAt;
    });

    if (beforeCount !== filteredUsers.length) {
      console.log(
        `[ADMIN BROADCAST ${broadcast.id}] Snapshot legado materializado removendo ${beforeCount - filteredUsers.length} usuario(s) criados apos a campanha.`,
      );
    }
  }

  const recipients = buildRecipientsFromUsers(filteredUsers);
  return {
    recipients,
    resolvedTotalRecipients: recipients.length,
    materializedSnapshot: {
      userIds: filteredUsers.map((user) => user.id),
      targetType,
      createdAt: new Date().toISOString(),
    } satisfies BroadcastSnapshot,
  };
}

async function getProgressSnapshot(broadcastId: string) {
  const messages = (await storage.getBroadcastMessages?.(broadcastId)) || [];
  let sentCount = 0;
  let failedCount = 0;
  const processedKeys = new Set<string>();

  for (const message of messages) {
    if (message.status === "sent") {
      sentCount += 1;
    } else if (message.status === "failed") {
      failedCount += 1;
    }

    processedKeys.add(
      getProgressKey(
        message.user_id || message.userId || undefined,
        message.recipient_phone || message.recipientPhone || "",
        message.lead_id || message.leadId || undefined,
      ),
    );
  }

  return { sentCount, failedCount, processedKeys };
}

async function buildAiMessageWithRetry(
  baseMessage: string,
  prompt: string,
  recipientName: string,
  broadcastId: string,
  index: number,
) {
  let attempt = 0;
  let latestMessage = baseMessage;

  while (attempt < ADMIN_BROADCAST_AI_MAX_ATTEMPTS) {
    attempt += 1;
    try {
      latestMessage = await applyAIVariation(baseMessage, prompt, recipientName);
    } catch (error) {
      latestMessage = baseMessage;
      console.warn(
        `[ADMIN BROADCAST ${broadcastId}] IA falhou para ${recipientName} (indice ${index + 1}, tentativa ${attempt}/${ADMIN_BROADCAST_AI_MAX_ATTEMPTS}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (latestMessage.trim() && latestMessage.trim() !== baseMessage.trim()) {
      return latestMessage;
    }

    if (attempt < ADMIN_BROADCAST_AI_MAX_ATTEMPTS) {
      const backoffMs = attempt * 2000;
      console.warn(
        `[ADMIN BROADCAST ${broadcastId}] IA retornou mensagem inalterada para ${recipientName} (indice ${index + 1}, tentativa ${attempt}/${ADMIN_BROADCAST_AI_MAX_ATTEMPTS}). Nova tentativa em ${Math.floor(backoffMs / 1000)}s.`,
      );
      await sleep(backoffMs);
    }
  }

  return latestMessage || baseMessage;
}

function createAiPrefetcher(params: {
  enabled: boolean;
  prompt: string;
  broadcastId: string;
  recipients: BroadcastRecipient[];
  templateBuilder: (recipient: BroadcastRecipient) => string;
}) {
  const cache = new Map<number, Promise<string>>();
  const prefetchWindow = getAiPrefetchWindow();

  const ensure = (index: number) => {
    if (!params.enabled || cache.has(index) || index >= params.recipients.length) {
      return;
    }

    const recipient = params.recipients[index];
    cache.set(
      index,
      buildAiMessageWithRetry(
        params.templateBuilder(recipient),
        params.prompt,
        recipient.name,
        params.broadcastId,
        index,
      ),
    );
  };

  const prefetch = (fromIndex: number) => {
    for (let index = fromIndex; index < Math.min(fromIndex + prefetchWindow, params.recipients.length); index += 1) {
      ensure(index);
    }
  };

  return {
    prefetch,
    async get(index: number) {
      ensure(index);
      return cache.get(index) ?? Promise.resolve(params.templateBuilder(params.recipients[index]));
    },
  };
}

async function sendBroadcastMessageWithRetry(params: {
  adminId: string;
  phone: string;
  message: string;
  broadcastId: string;
  recipientName: string;
}): Promise<{
  success: boolean;
  error?: string;
  messageId?: string;
  remoteJid?: string;
}> {
  let lastError = "Falha desconhecida";
  let deliveredMessageId: string | undefined;
  let deliveredRemoteJid: string | undefined;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await sendAdminNotification(params.adminId, params.phone, params.message);

    if (result.success) {
      deliveredMessageId = result.messageId;
      deliveredRemoteJid = result.remoteJid;
      return { success: true, error: undefined, messageId: deliveredMessageId, remoteJid: deliveredRemoteJid };
    }

    lastError = result.error || lastError;
    console.warn(
      `[ADMIN BROADCAST ${params.broadcastId}] Falha ao enviar para ${params.recipientName} (tentativa ${attempt}/3): ${lastError}`,
    );

    if (attempt < 3) {
      const sessionReady = await waitForAdminSession(params.adminId, params.broadcastId);
      if (!sessionReady) {
        return { success: false, error: "Sessao do admin indisponivel durante retry" };
      }

      const backoffMs = Math.pow(2, attempt) * 1000;
      await sleep(backoffMs);
    }
  }

  return { success: false, error: lastError, messageId: deliveredMessageId, remoteJid: deliveredRemoteJid };
}

async function executeAdminBroadcast(adminId: string, broadcastId: string, trigger: string) {
  const broadcast = await storage.getAdminBroadcast?.(adminId, broadcastId);
  if (!broadcast) {
    console.warn(`[ADMIN BROADCAST ${broadcastId}] Broadcast nao encontrado para execucao.`);
    return;
  }

  if (broadcast.status === "completed" || broadcast.status === "cancelled") {
    console.log(`[ADMIN BROADCAST ${broadcastId}] Ignorando execucao porque status=${broadcast.status}.`);
    return;
  }

  const { sentCount: initialSent, failedCount: initialFailed, processedKeys } = await getProgressSnapshot(broadcastId);
  const config = sanitizeAdminNotificationConfig(await storage.getAdminNotificationConfig?.(adminId));
  const normalizedBroadcast = sanitizeAdminBroadcast(broadcast) || broadcast;
  const resolvedRecipients = await resolveRecipientsForBroadcast(normalizedBroadcast);
  const recipients = resolvedRecipients.recipients;
  const totalRecipients = resolvedRecipients.resolvedTotalRecipients;

  let sentCount = initialSent;
  let failedCount = initialFailed;
  const messageTemplate = normalizedBroadcast.message_template || normalizedBroadcast.messageTemplate || "";
  const aiEnabled = Boolean(
    (normalizedBroadcast.ai_variation ?? normalizedBroadcast.aiVariation ?? false) &&
      getConfigFlag(config?.ai_variation_enabled, config?.aiVariationEnabled, false),
  );
  const aiPrompt = String(config?.ai_variation_prompt ?? config?.aiVariationPrompt ?? "");
  const prefetcher = createAiPrefetcher({
    enabled: aiEnabled,
    prompt: aiPrompt,
    broadcastId,
    recipients,
    templateBuilder: (recipient) =>
      renderBroadcastMessage(messageTemplate, recipient),
  });

  prefetcher.prefetch(0);

  if (resolvedRecipients.materializedSnapshot) {
    await storage.updateAdminBroadcast?.(adminId, broadcastId, {
      targetFilter: resolvedRecipients.materializedSnapshot,
      totalRecipients,
    });
  }

  console.log(
    `[ADMIN BROADCAST ${broadcastId}] Iniciando runner (${trigger}). total=${totalRecipients}, enviados=${sentCount}, falhas=${failedCount}, restante=${Math.max(totalRecipients - sentCount - failedCount, 0)}`,
  );

  await storage.updateAdminBroadcast?.(adminId, broadcastId, {
    sentCount,
    failedCount,
  });

  for (let index = 0; index < recipients.length; index += 1) {
    const recipient = recipients[index];
    prefetcher.prefetch(index + 1);

    if (processedKeys.has(recipient.progressKey)) {
      continue;
    }

    const currentBroadcast = await storage.getAdminBroadcast?.(adminId, broadcastId);
    if (!currentBroadcast || currentBroadcast.status === "cancelled") {
      console.log(`[ADMIN BROADCAST ${broadcastId}] Execucao interrompida por cancelamento.`);
      return;
    }

    const baseMessage = trimText(recipient.preparedMessage || "", 1200) || renderBroadcastMessage(messageTemplate, recipient);

    const phoneValidation = validateRecipientPhone(recipient.phone);
    if (!phoneValidation.isValid) {
      await storage.createBroadcastMessage?.({
        broadcastId,
        adminId,
        userId: recipient.userId,
        recipientPhone: recipient.phone,
        recipientName: recipient.name,
        messageOriginal: baseMessage,
        messageSent: baseMessage,
        aiVaried: false,
        status: "failed",
        errorMessage: phoneValidation.errorMessage,
      });

      processedKeys.add(recipient.progressKey);
      failedCount += 1;

      await storage.updateAdminBroadcast?.(adminId, broadcastId, {
        sentCount,
        failedCount,
      });

      console.warn(
        `[ADMIN BROADCAST ${broadcastId}] ${recipient.name} ignorado antes do throttle: ${phoneValidation.errorMessage}`,
      );
      console.log(
        `[ADMIN BROADCAST ${broadcastId}] Progresso ${sentCount + failedCount}/${totalRecipients} | enviados=${sentCount} | falhas=${failedCount} | ultimo=${recipient.name} | status=failed`,
      );
      continue;
    }

    const sessionReady = await waitForAdminSession(adminId, broadcastId);
    if (!sessionReady) {
      console.warn(
        `[ADMIN BROADCAST ${broadcastId}] Sessao do admin indisponivel apos janela de espera. Runner sera retomado pelo loop de recuperacao.`,
      );
      await storage.updateAdminBroadcast?.(adminId, broadcastId, {
        sentCount,
        failedCount,
      });
      return;
    }

    let finalMessage = baseMessage;
    if (aiEnabled && !recipient.preparedMessage) {
      finalMessage = await prefetcher.get(index);
      console.log(
        `[ADMIN BROADCAST ${broadcastId}] IA preparou mensagem para ${recipient.name} (${index + 1}/${recipients.length}).`,
      );
    }

    await waitForAdminBulkThrottle(
      adminId,
      config,
      broadcast,
      `broadcast:${broadcastId}:${recipient.name}:${phoneValidation.normalizedPhone}`,
    );

    let success = false;
    let errorMessage: string | undefined;

    const result = await sendBroadcastMessageWithRetry({
      adminId,
      phone: phoneValidation.normalizedPhone,
      message: finalMessage,
      broadcastId,
      recipientName: recipient.name,
    });
    success = result.success;
    errorMessage = result.error;

    if (success && recipient.sendAndDelete && recipient.leadId && result.messageId && result.remoteJid) {
      await sleep(8000);
      const deleteResult = await deleteAdminSentMessage({
        adminId,
        remoteJid: result.remoteJid,
        messageId: result.messageId,
      });

      if (deleteResult.success) {
        await armLeadReplyOnInbound({
          leadId: recipient.leadId,
          replyMessage: trimText(recipient.replyMessageOnInbound || finalMessage, 1200) || finalMessage,
          lastGeneratedMessage: finalMessage,
        });
      } else {
        console.warn(
          `[ADMIN BROADCAST ${broadcastId}] Falha ao apagar teaser de ${recipient.name}: ${deleteResult.error || "erro desconhecido"}`,
        );
      }
    }

    await storage.createBroadcastMessage?.({
      broadcastId,
      adminId,
      userId: recipient.userId,
      recipientPhone: recipient.phone,
      recipientName: recipient.name,
      messageOriginal: baseMessage,
      messageSent: finalMessage,
      aiVaried: aiEnabled && finalMessage !== baseMessage,
      status: success ? "sent" : "failed",
      errorMessage,
    });

    processedKeys.add(recipient.progressKey);

    if (success) {
      sentCount += 1;
    } else {
      failedCount += 1;
    }

    await storage.updateAdminBroadcast?.(adminId, broadcastId, {
      sentCount,
      failedCount,
    });

    console.log(
      `[ADMIN BROADCAST ${broadcastId}] Progresso ${sentCount + failedCount}/${totalRecipients} | enviados=${sentCount} | falhas=${failedCount} | ultimo=${recipient.name} | status=${success ? "sent" : "failed"}`,
    );
  }

  await storage.updateAdminBroadcast?.(adminId, broadcastId, {
    status: "completed",
    completedAt: new Date(),
    sentCount,
    failedCount,
  });

  console.log(
    `[ADMIN BROADCAST ${broadcastId}] Concluido com sucesso. enviados=${sentCount}, falhas=${failedCount}, total=${totalRecipients}`,
  );
}

export function startAdminBroadcastRun(adminId: string, broadcastId: string, trigger = "manual") {
  const taskKey = getBroadcastKey(adminId, broadcastId);
  if (activeBroadcastTasks.has(taskKey)) {
    console.log(`[ADMIN BROADCAST ${broadcastId}] Runner ja ativo. Ignorando trigger=${trigger}.`);
    return;
  }

  const task = executeAdminBroadcast(adminId, broadcastId, trigger)
    .catch((error) => {
      console.error(`[ADMIN BROADCAST ${broadcastId}] Runner abortado por erro:`, error);
    })
    .finally(() => {
      activeBroadcastTasks.delete(taskKey);
    });

  activeBroadcastTasks.set(taskKey, task);
}

export async function resumeSendingAdminBroadcasts(reason: string = "manual-run") {
  const runningBroadcasts = (await storage.getRunningAdminBroadcasts?.()) || [];
  if (runningBroadcasts.length > 0) {
    console.log(
      `[ADMIN BROADCAST] Loop de recuperacao encontrou ${runningBroadcasts.length} campanha(s) em andamento. trigger=${reason}`,
    );
  }

  for (const broadcast of runningBroadcasts) {
    const adminId = broadcast.admin_id || broadcast.adminId;
    if (!adminId || !broadcast.id) {
      continue;
    }
    startAdminBroadcastRun(adminId, broadcast.id, reason);
  }
}

export function startAdminBroadcastRecoveryLoop() {
  if (recoveryLoop) {
    return;
  }

  console.log("[ADMIN BROADCAST] Loop de recuperacao inicializado.");
  void resumeSendingAdminBroadcasts("boot");
  recoveryLoop = setInterval(() => {
    void resumeSendingAdminBroadcasts("recovery-loop");
  }, ADMIN_BROADCAST_RECOVERY_INTERVAL_MS);
}

export function stopAdminBroadcastRecoveryLoop() {
  if (!recoveryLoop) {
    return;
  }

  clearInterval(recoveryLoop);
  recoveryLoop = null;
}
