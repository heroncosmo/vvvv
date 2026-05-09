import { db } from "./db";
import { adminConversations, followupLogs, adminMessages } from "@shared/schema";
import { eq, and, lte, isNull, asc } from "drizzle-orm";
import { getLLMClient } from "./llm";
import {
  getAdminFollowupGlobalConfig,
  isLegacyAdminFollowupConfig,
  LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG,
  normalizeAdminFollowupConfig,
} from "./adminFollowupMigrationService";
import { shouldAutoRescheduleAdminFollowup } from "./adminConversationAutomationState";
import {
  buildAdminPriorityConflictReason,
  buildUserPriorityConflictReason,
  findPriorityUserConversationByContact,
  FOLLOWUP_PRIORITY_EMAIL,
  getFollowupPriorityAdminId,
  mapPriorityUserConversationsByContact,
  normalizePriorityPhoneDigits,
} from "./followupPriorityService";

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================

function getEffectiveConversationConfig(
  conversation: typeof adminConversations.$inferSelect,
  globalConfig: Awaited<ReturnType<typeof getAdminFollowupGlobalConfig>>,
) {
  const normalizedGlobal = normalizeAdminFollowupConfig(globalConfig as any);
  const currentConversationConfig = (conversation.followupConfig as any) || null;

  if (!currentConversationConfig || isLegacyAdminFollowupConfig(currentConversationConfig)) {
    return normalizedGlobal;
  }

  return normalizeAdminFollowupConfig({
    ...normalizedGlobal,
    ...currentConversationConfig,
  });
}

const SAO_PAULO_UTC_OFFSET_MINUTES = -3 * 60;

function getSaoPauloParts(reference: Date) {
  const localMs = reference.getTime() + SAO_PAULO_UTC_OFFSET_MINUTES * 60 * 1000;
  const localDate = new Date(localMs);

  return {
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth(),
    day: localDate.getUTCDate(),
    weekday: localDate.getUTCDay(),
    hours: localDate.getUTCHours(),
    minutes: localDate.getUTCMinutes(),
  };
}

function buildUtcFromSaoPauloParts(year: number, month: number, day: number, hours: number, minutes: number) {
  return new Date(
    Date.UTC(year, month, day, hours, minutes) - SAO_PAULO_UTC_OFFSET_MINUTES * 60 * 1000,
  );
}

function getMinutesOfDay(timeValue: string, fallbackHours: number, fallbackMinutes: number) {
  if (!timeValue || typeof timeValue !== "string") {
    return fallbackHours * 60 + fallbackMinutes;
  }

  const [rawHours, rawMinutes] = timeValue.split(":");
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return fallbackHours * 60 + fallbackMinutes;
  }

  return Math.max(0, Math.min(23, hours)) * 60 + Math.max(0, Math.min(59, minutes));
}

function isWithinBusinessHours(
  config: Partial<typeof LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG> | null | undefined,
  reference: Date = new Date(),
) {
  const normalized = normalizeAdminFollowupConfig(config as any);
  if (normalized.respectBusinessHours === false) return true;

  const parts = getSaoPauloParts(reference);
  const currentMinutes = parts.hours * 60 + parts.minutes;
  const businessStart = getMinutesOfDay(normalized.businessHoursStart, 9, 0);
  const businessEnd = getMinutesOfDay(normalized.businessHoursEnd, 18, 0);

  return normalized.businessDays.includes(parts.weekday) &&
    currentMinutes >= businessStart &&
    currentMinutes < businessEnd;
}

function getNextBusinessTime(
  config: Partial<typeof LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG> | null | undefined,
  reference: Date = new Date(),
) {
  const normalized = normalizeAdminFollowupConfig(config as any);
  if (normalized.respectBusinessHours === false) return reference;

  const businessStart = getMinutesOfDay(normalized.businessHoursStart, 9, 0);

  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const candidateUtc = new Date(reference.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const candidateParts = getSaoPauloParts(candidateUtc);

    if (!normalized.businessDays.includes(candidateParts.weekday)) {
      continue;
    }

    if (dayOffset === 0) {
      const currentMinutes = candidateParts.hours * 60 + candidateParts.minutes;
      if (currentMinutes < businessStart) {
        return buildUtcFromSaoPauloParts(
          candidateParts.year,
          candidateParts.month,
          candidateParts.day,
          Math.floor(businessStart / 60),
          businessStart % 60,
        );
      }

      if (isWithinBusinessHours(normalized, reference)) {
        return reference;
      }
    }

    return buildUtcFromSaoPauloParts(
      candidateParts.year,
      candidateParts.month,
      candidateParts.day,
      Math.floor(businessStart / 60),
      businessStart % 60,
    );
  }

  return reference;
}

function alignToBusinessHours(
  candidate: Date,
  config: Partial<typeof LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG> | null | undefined,
) {
  if (isWithinBusinessHours(config, candidate)) {
    return candidate;
  }

  return getNextBusinessTime(config, candidate);
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function buildDelayDateFromNow(delayMinutes: number) {
  if (!Number.isFinite(delayMinutes) || delayMinutes <= 0) {
    return null;
  }

  const candidate = new Date(Date.now() + delayMinutes * 60 * 1000);
  return isValidDate(candidate) ? candidate : null;
}

function normalizePhoneDigits(value: string | null | undefined): string {
  return normalizePriorityPhoneDigits(value);
}

function extractFirstJsonObject(rawContent: string): string | null {
  if (!rawContent || typeof rawContent !== "string") {
    return null;
  }

  const content = rawContent.trim();
  const start = content.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return content.slice(start, index + 1);
      }
    }
  }

  return null;
}

type FollowUpCallback = (phoneNumber: string, context: string, attempt: number, type: string) => Promise<{ success: boolean, message?: string, error?: string } | void>;
type ScheduledContactCallback = (phoneNumber: string, reason: string) => Promise<void>;

export class FollowUpService {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  // Prevent overlapping cycles (timer overlap can spam leads)
  private isProcessingCycle = false;
  private onFollowUpReady: FollowUpCallback | null = null;
  private onScheduledContactReady: ScheduledContactCallback | null = null;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("🚀 [FOLLOW-UP] Serviço iniciado");
    
    // Verificar a cada 5 minutos (otimizado para reduzir carga no DB)
    this.checkInterval = setInterval(() => this.processFollowUps(), 5 * 60 * 1000);
    // Aguardar 30s antes da primeira execução para não sobrecarregar na inicialização
    setTimeout(async () => {
      await this.repairMissingSchedules();
      await this.processFollowUps();
    }, 30 * 1000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log("🛑 [FOLLOW-UP] Serviço parado");
  }

  registerFollowUpCallback(callback: FollowUpCallback) {
    this.onFollowUpReady = callback;
    console.log("📲 [FOLLOW-UP] Callback registrado");
  }

  registerScheduledContactCallback(callback: ScheduledContactCallback) {
    this.onScheduledContactReady = callback;
    console.log("📲 [AGENDAMENTO] Callback registrado");
  }

  private async getPriorityAdminId(): Promise<string | null> {
    return getFollowupPriorityAdminId();
  }

  private async setPriorityBlocked(conversationId: string, blockedReason: string) {
    await db.update(adminConversations)
      .set({
        followupActive: false,
        nextFollowupAt: null,
        followupDisabledReason: blockedReason,
        updatedAt: new Date(),
      })
      .where(eq(adminConversations.id, conversationId));
  }

  private rankPriorityOwner(conversation: typeof adminConversations.$inferSelect) {
    return (
      (conversation.nextFollowupAt ? 10_000 : 0) +
      Math.max(0, Number(conversation.followupStage || 0)) * 100 +
      new Date(
        conversation.lastMessageTime || conversation.updatedAt || conversation.createdAt || new Date(0),
      ).getTime()
    );
  }

  private async getActiveFollowupConflicts(
    contactNumber: string,
    excludeConversationId?: string,
  ): Promise<(typeof adminConversations.$inferSelect)[]> {
    const normalizedTarget = normalizePhoneDigits(contactNumber);
    if (!normalizedTarget) {
      return [];
    }

    const candidates = await db.query.adminConversations.findMany({
      where: eq(adminConversations.followupActive, true),
      orderBy: (table, { desc }) => [desc(table.lastMessageTime), desc(table.createdAt)],
      limit: 5000,
    });

    return candidates.filter((candidate) => {
      if (excludeConversationId && candidate.id === excludeConversationId) {
        return false;
      }

      return normalizePhoneDigits(candidate.contactNumber) === normalizedTarget;
    });
  }

  private async enforcePriorityForConversation(
    conversation: typeof adminConversations.$inferSelect,
  ): Promise<
    | { allowed: true }
    | { allowed: false; keepConversationId: string; blockedReason: string; ownerType: "admin" | "user" }
  > {
    const priorityUserConversation = await findPriorityUserConversationByContact(conversation.contactNumber);
    if (priorityUserConversation) {
      const blockedReason = buildUserPriorityConflictReason(priorityUserConversation.id);
      await this.setPriorityBlocked(conversation.id, blockedReason);
      return {
        allowed: false,
        keepConversationId: priorityUserConversation.id,
        blockedReason,
        ownerType: "user",
      };
    }

    const priorityAdminId = await this.getPriorityAdminId();
    if (!priorityAdminId) {
      return { allowed: true };
    }

    const conflicts = await this.getActiveFollowupConflicts(conversation.contactNumber, conversation.id);
    if (conflicts.length === 0) {
      return { allowed: true };
    }

    const priorityConflicts = conflicts.filter((candidate) => candidate.adminId === priorityAdminId);

    if (conversation.adminId !== priorityAdminId) {
      const keepConversation = priorityConflicts
        .sort((left, right) => this.rankPriorityOwner(right) - this.rankPriorityOwner(left))[0];

      if (keepConversation) {
        const blockedReason = buildAdminPriorityConflictReason(keepConversation.id);
        await this.setPriorityBlocked(conversation.id, blockedReason);
        return { allowed: false, keepConversationId: keepConversation.id, blockedReason, ownerType: "admin" };
      }

      return { allowed: true };
    }

    for (const conflict of conflicts) {
      if (conflict.adminId === priorityAdminId) {
        continue;
      }

      await this.setPriorityBlocked(conflict.id, buildAdminPriorityConflictReason(conversation.id));
    }

    return { allowed: true };
  }

  private async findPreferredConversationByPhone(phoneNumber: string) {
    const normalizedTarget = normalizePhoneDigits(phoneNumber);
    if (!normalizedTarget) {
      return null;
    }

    const priorityAdminId = await this.getPriorityAdminId();
    const candidates = await db.query.adminConversations.findMany({
      orderBy: (table, { desc }) => [desc(table.lastMessageTime), desc(table.createdAt)],
      limit: 5000,
    });

    const matches = candidates.filter((candidate) => normalizePhoneDigits(candidate.contactNumber) === normalizedTarget);
    if (matches.length === 0) {
      return null;
    }

    matches.sort((left, right) => {
      const priorityDelta =
        Number(right.adminId === priorityAdminId) - Number(left.adminId === priorityAdminId);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return this.rankPriorityOwner(right) - this.rankPriorityOwner(left);
    });

    return matches[0];
  }

  private async reconcilePriorityConflicts(limit: number = 5000, adminId?: string) {
    const conversations = await db.query.adminConversations.findMany({
      where: eq(adminConversations.followupActive, true),
      orderBy: (table, { desc }) => [desc(table.lastMessageTime), desc(table.createdAt)],
      limit,
    });
    const priorityUserConversationsByPhone = await mapPriorityUserConversationsByContact(
      Math.max(limit, 5000),
      { activeOnly: true },
    );

    let disabledDuplicates = 0;
    const eligibleAdminConversations: typeof conversations = [];

    for (const conversation of conversations) {
      const normalizedPhone = normalizePhoneDigits(conversation.contactNumber);
      const priorityUserConversation = normalizedPhone
        ? priorityUserConversationsByPhone.get(normalizedPhone) ?? null
        : null;
      if (priorityUserConversation) {
        await this.setPriorityBlocked(
          conversation.id,
          buildUserPriorityConflictReason(priorityUserConversation.id),
        );
        disabledDuplicates += 1;
        continue;
      }

      eligibleAdminConversations.push(conversation);
    }

    const priorityAdminId = await this.getPriorityAdminId();
    if (!priorityAdminId) {
      return { disabledDuplicates };
    }

    const grouped = new Map<string, (typeof conversations)>();
    for (const conversation of eligibleAdminConversations) {
      if (adminId && conversation.adminId !== adminId && conversation.adminId !== priorityAdminId) {
        continue;
      }

      const key = normalizePhoneDigits(conversation.contactNumber);
      if (!key) {
        continue;
      }

      const group = grouped.get(key) || [];
      group.push(conversation);
      grouped.set(key, group);
    }
    for (const group of grouped.values()) {
      const priorityGroup = group.filter((conversation) => conversation.adminId === priorityAdminId);
      if (priorityGroup.length === 0) {
        continue;
      }

      priorityGroup.sort((left, right) => this.rankPriorityOwner(right) - this.rankPriorityOwner(left));
      const keepConversationId = priorityGroup[0]?.id;
      if (!keepConversationId) {
        continue;
      }

      for (const conversation of group) {
        if (conversation.id === keepConversationId) {
          continue;
        }

        await this.setPriorityBlocked(conversation.id, buildAdminPriorityConflictReason(keepConversationId));
        disabledDuplicates += 1;
      }
    }

    return { disabledDuplicates };
  }

  /**
   * Processa conversas pendentes de follow-up
   */
  private async processFollowUps() {
    if (this.isProcessingCycle) {
      console.log("⏭️ [FOLLOW-UP] Verificação anterior ainda em execução, pulando ciclo para evitar duplicatas");
      return;
    }

    this.isProcessingCycle = true;
    try {
      // 🛡️ Verificar config global antes de processar
      const globalConfig = await getAdminFollowupGlobalConfig();
      if (!globalConfig.isEnabled) {
        console.log("🛑 [FOLLOW-UP] Follow-up global DESATIVADO na config do admin. Pulando ciclo.");
        return;
      }

      await this.reconcilePriorityConflicts();

      const now = new Date();

      // Buscar conversas que precisam de follow-up
      const pendingConversations = await db.query.adminConversations.findMany({
        where: and(
          eq(adminConversations.followupActive, true),
          lte(adminConversations.nextFollowupAt, now)
        )
      });

      if (pendingConversations.length > 0) {
        console.log(`🔍 [FOLLOW-UP] Encontradas ${pendingConversations.length} conversas para processar`);
      }

      for (const conv of pendingConversations) {
        await this.executeFollowUp(conv);
      }
    } catch (error) {
      console.error("❌ [FOLLOW-UP] Erro ao processar follow-ups:", error);
    }
    finally {
      this.isProcessingCycle = false;
    }
  }

  /**
   * Executa a lógica de follow-up para uma conversa específica
   */
  private async executeFollowUp(conversation: typeof adminConversations.$inferSelect) {
    console.log(`👉 [FOLLOW-UP] Processando ${conversation.contactNumber} (Estágio ${conversation.followupStage})`);

    try {
      // 🛡️ Ler config global do admin
      const globalConfig = await getAdminFollowupGlobalConfig();

      // 🛡️ FOLLOW-UP FOR NON-PAYERS - Check payment status and toggle
      const effectiveConfig = getEffectiveConversationConfig(conversation, globalConfig);
      const followupForNonPayers = conversation.followupForNonPayers ?? true;
      const paymentStatus = conversation.paymentStatus ?? 'pending';

      // Se pagamento confirmado, nunca enviar follow-up
      if (paymentStatus === 'paid') {
        console.log(`🛑 [FOLLOW-UP] Client already paid. Skipping.`);
        await this.logFollowUp(conversation.id, conversation.contactNumber, 'skipped', 'Client already paid', undefined, 'paid', 'paid', conversation.followupStage || 0);
        await this.disableFollowUp(conversation.id, "Cliente já pagou");
        return;
      }

      // 🛡️ Se follow-up para não pagantes está desativado GLOBALMENTE e o status é não pago
      if (!globalConfig.followupNonPayersEnabled && paymentStatus === 'unpaid') {
        console.log(`🛑 [FOLLOW-UP] Follow-up para não pagantes DESATIVADO globalmente. Pulando ${conversation.contactNumber}`);
        await this.logFollowUp(conversation.id, conversation.contactNumber, 'skipped', 'Follow-up não pagantes desativado', undefined, paymentStatus, 'non_payer', conversation.followupStage || 0);
        await this.scheduleNextFollowUp(conversation, 24 * 60); // Reagendar para checar amanhã
        return;
      }

      // 🛡️ Se follow-up para não pagantes está desativado NA CONVERSA e o status é não pago
      if (!followupForNonPayers && (paymentStatus === 'unpaid' || paymentStatus === 'pending')) {
        console.log(`🛑 [FOLLOW-UP] Follow-up para não pagantes desativado nesta conversa. Pulando ${conversation.contactNumber}`);
        await this.logFollowUp(conversation.id, conversation.contactNumber, 'skipped', 'Follow-up não pagantes desativado nesta conversa', undefined, paymentStatus, 'non_payer', conversation.followupStage || 0);
        return;
      }

      // Anti-spam: if a follow-up was sent very recently, do not send again.
      // Protects against accidental re-entry/retries and avoids flooding the lead.
      try {
        const recent = await db.query.followupLogs.findFirst({
          where: and(
            eq(followupLogs.conversationId, conversation.id),
            eq(followupLogs.status, 'sent'),
          ),
          orderBy: (logs, { desc }) => [desc(logs.executedAt)],
        });

        if (recent?.executedAt) {
          const ageMs = Date.now() - new Date(recent.executedAt as any).getTime();
          const cooldownMs = 7 * 60 * 1000;
          if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < cooldownMs) {
            console.log(`??? [FOLLOW-UP] Cooldown ativo (${Math.round(ageMs / 1000)}s) para ${conversation.contactNumber}, evitando spam`);
            await this.scheduleNextFollowUp(conversation, 30);
            return;
          }
        }
      } catch (cooldownErr) {
        console.warn('?? [FOLLOW-UP] Falha ao checar cooldown, continuando:', cooldownErr);
      }

      // ⚠️ IMPORTANTE: Follow-up é INDEPENDENTE da IA!
      // A desativação da IA (isAgentEnabled) NÃO deve cancelar o follow-up
      // Follow-up só deve ser cancelado quando:
      // 1. Toggle global em /followup está desativado (followup_configs.is_enabled)
      // 2. Toggle individual na conversa está desativado (conversations.followupActive)

      // Verificar se o follow-up está ativo para esta conversa
      // Se followupActive for false, NÃO enviar mensagem
      if (!conversation.followupActive) {
        console.log(`🛑 [FOLLOW-UP] Follow-up desativado para ${conversation.contactNumber}. Cancelando.`);
        await this.disableFollowUp(conversation.id, "Follow-up desativado manualmente");
        return;
      }

      const priorityDecision = await this.enforcePriorityForConversation(conversation);
      if (!priorityDecision.allowed) {
        console.log(
          `[FOLLOW-UP] Bloqueado por prioridade de ${FOLLOWUP_PRIORITY_EMAIL} (${priorityDecision.ownerType}) para ${conversation.contactNumber}. Conversa vencedora: ${priorityDecision.keepConversationId}`,
        );
        return;
      }

      // 1. Analisar histórico com IA para decidir ação
      if (!isWithinBusinessHours(effectiveConfig, new Date())) {
        const nextBusinessTime = getNextBusinessTime(effectiveConfig, new Date());
        console.log(`â° [FOLLOW-UP] Fora do horÃ¡rio configurado para ${conversation.contactNumber}. Reagendando para ${nextBusinessTime.toISOString()}`);
        await db.update(adminConversations)
          .set({ nextFollowupAt: nextBusinessTime, updatedAt: new Date() })
          .where(eq(adminConversations.id, conversation.id));
        return;
      }

      const decision = await this.analyzeWithAI(conversation);

      if (decision.action === 'abort') {
        console.log(`🛑 [FOLLOW-UP] Abortado pela IA para ${conversation.contactNumber}: ${decision.reason}`);
        await this.disableFollowUp(conversation.id);
        return;
      }

      if (decision.action === 'wait') {
        console.log(`⏳ [FOLLOW-UP] IA sugeriu esperar para ${conversation.contactNumber}: ${decision.reason}`);
        // Adiar por 24h ou conforme sugerido (simplificado para 24h aqui)
        await this.scheduleNextFollowUp(conversation, 24 * 60);
        return;
      }

      // 2. Se ação for 'send', disparar callback
      if (decision.action === 'send') {
        if (this.onFollowUpReady) {
          console.log(`📤 [FOLLOW-UP] Disparando callback para ${conversation.contactNumber}`);

          // O callback espera (phoneNumber, context, attempt, type)
          // Vamos adaptar os parâmetros
          const attempt = (conversation.followupStage || 0) + 1;
          const type = attempt >= effectiveConfig.intervalsMinutes.length ? 'final' : 'reminder';

          const result = await this.onFollowUpReady(
            conversation.contactNumber,
            decision.context || "Follow-up automático",
            attempt,
            type
          );

          const wasSuccessful = !!(result && typeof result === 'object' && result.success);
          // Log result with enhanced details
          try {
            if (result && typeof result === 'object') {
               await this.logFollowUp(conversation.id, conversation.contactNumber, result.success ? 'sent' : 'failed', result.message, result.error, paymentStatus, type, attempt);
            } else {
               // Fallback for void return (backward compatibility)
               await this.logFollowUp(conversation.id, conversation.contactNumber, 'sent', 'Mensagem enviada (conteúdo não capturado)', undefined, paymentStatus, type, attempt);
            }
          } catch (logError) {
            console.error("Erro ao logar follow-up:", logError);
          }

          // Agendar próximo estágio
          if (wasSuccessful) {
            await this.scheduleNextFollowUp(conversation);
          } else {
            const retryDelayMinutes = effectiveConfig.intervalsMinutes[Math.max(0, conversation.followupStage || 0)]
              || effectiveConfig.intervalsMinutes[0]
              || LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG.intervalsMinutes[0];
            await this.scheduleNextFollowUp(conversation, retryDelayMinutes);
          }
        } else {
          console.warn("⚠️ [FOLLOW-UP] Callback não registrado! Mensagem não enviada.");
        }
      }

    } catch (error) {
      console.error(`❌ [FOLLOW-UP] Erro ao executar para ${conversation.contactNumber}:`, error);
    }
  }

  /**
   * Enhanced log function with payment status and follow-up type
   */
  private async logFollowUp(
    conversationId: string,
    contactNumber: string,
    status: string,
    messageContent: string | undefined,
    errorReason: string | undefined,
    paymentStatus: string,
    followupType: string,
    stage: number | undefined
  ): Promise<void> {
    try {
      await db.insert(followupLogs).values({
        conversationId,
        contactNumber,
        status,
        messageContent,
        errorReason,
        paymentStatus,
        followupType,
        stage,
      });
    } catch (logError) {
      console.error("Erro ao logar follow-up:", logError);
    }
  }

  /**
   * Usa IA para analisar se deve enviar follow-up
   */
  private async analyzeWithAI(conversation: typeof adminConversations.$inferSelect): Promise<{
    action: 'send' | 'wait' | 'abort';
    reason: string;
    context?: string;
  }> {
    const seededLead = (conversation.contextState as any)?.seededLead || null;

    // Fetch messages
    const messages = await db.query.adminMessages.findMany({
      where: eq(adminMessages.conversationId, conversation.id),
      orderBy: (adminMessages, { asc }) => [asc(adminMessages.timestamp)],
      limit: 20
    });

    if (messages.length === 0 && seededLead) {
      return {
        action: 'send',
        reason: 'Contato criou conta no sistema, mas ainda não teve conversa útil no WhatsApp.',
        context: "O cliente criou conta no AgenteZap, ainda não assinou e não há histórico de WhatsApp. Faça um primeiro follow-up curto, consultivo e humano, como lead que já demonstrou interesse ao criar a conta.",
      };
    }

    const lastMessages = messages.map(m => ({
      role: m.fromMe ? "assistant" : "user",
      content: m.text || (m.mediaType ? `[Mídia: ${m.mediaType}]` : "")
    }));

    const prompt = `
      Analise esta conversa de vendas e decida o próximo passo para o sistema de follow-up automático.
      
      Contexto:
      - O cliente parou de responder.
      - Estamos no estágio ${conversation.followupStage} de follow-up.
      - Objetivo: Reengajar o cliente para fechar a venda.
      
      Histórico recente:
      ${JSON.stringify(lastMessages, null, 2)}
      
      Regras de Decisão CRÍTICAS:
      1. ABORT ('abort'): 
         - Se o cliente JÁ FECHOU/CONTRATOU (ex: "já paguei", "fechado", "contratado").
         - Se o cliente disse explicitamente "não tenho interesse", "pare de mandar mensagem".
      
      2. WAIT ('wait'): 
         - Se o cliente está AGUARDANDO UMA RESPOSTA NOSSA (ex: fez uma pergunta e não respondemos ainda).
         - Se o cliente disse "vou ver e te aviso", "falo com você amanhã".
      
      3. SEND ('send'): 
         - Se o cliente simplesmente parou de responder e faz sentido tentar reengajar.
         - Se o cliente não fechou e não estamos devendo resposta.
      
      Responda APENAS um JSON:
      {
        "action": "send" | "wait" | "abort",
        "reason": "breve explicação",
        "context": "dicas para a mensagem de follow-up (ex: focar em benefícios, perguntar se ficou dúvida)"
      }
    `;

    const buildTechnicalFallback = (reason: string) => {
      const lastMessage = messages[messages.length - 1] || null;
      const lastCustomerMessage = [...messages].reverse().find((message) => !message.fromMe) || null;

      if (!lastMessage || lastMessage.fromMe || !lastCustomerMessage) {
        return {
          action: 'send' as const,
          reason,
          context: "Retome a conversa com naturalidade, reconhecendo a pausa e oferecendo ajuda objetiva para avancar.",
        };
      }

      return {
        action: 'wait' as const,
        reason,
        context: "A ultima mensagem foi do cliente. Aguarde ou priorize resposta manual antes de novo follow-up.",
      };
    };

    const parseDecision = (rawContent: unknown) => {
      const content = typeof rawContent === "string" ? rawContent.trim() : "";
      if (!content) {
        console.warn(`[FOLLOW-UP] Resposta vazia da IA para ${conversation.contactNumber}. Usando fallback tecnico.`);
        return buildTechnicalFallback("Fallback tecnico: resposta vazia da IA");
      }

      const jsonBlock = extractFirstJsonObject(content);
      if (!jsonBlock) {
        console.warn(`[FOLLOW-UP] IA respondeu sem JSON valido para ${conversation.contactNumber}. Usando fallback tecnico.`);
        return buildTechnicalFallback("Fallback tecnico: IA nao retornou JSON valido");
      }

      try {
        const parsed = JSON.parse(jsonBlock);
        const action = parsed?.action;

        if (action !== 'send' && action !== 'wait' && action !== 'abort') {
          console.warn(`[FOLLOW-UP] IA retornou action invalida para ${conversation.contactNumber}: ${String(action)}`);
          return buildTechnicalFallback("Fallback tecnico: acao invalida na resposta da IA");
        }

        return {
          action,
          reason: typeof parsed?.reason === "string" && parsed.reason.trim()
            ? parsed.reason.trim()
            : "Decisao automatica do follow-up",
          context: typeof parsed?.context === "string" && parsed.context.trim()
            ? parsed.context.trim()
            : undefined,
        };
      } catch (error) {
        console.warn(`[FOLLOW-UP] Falha ao interpretar JSON da IA para ${conversation.contactNumber}. Usando fallback tecnico.`, error);
        return buildTechnicalFallback("Fallback tecnico: erro ao interpretar JSON da IA");
      }
    };

    try {
      const mistral = await getLLMClient();
      // Usa modelo configurado no banco de dados (sem hardcode)
      const response = await mistral.chat.complete({
        messages: [{ role: "user", content: prompt }]
      });
      const content = response.choices?.[0]?.message?.content || "";
      return parseDecision(content);
    } catch (e) {
      console.error("Erro na análise de IA:", e);
      return buildTechnicalFallback("Fallback tecnico: erro na analise da IA");
    }
  }

  /**
   * Agenda o próximo follow-up ou finaliza se acabou a sequência
   * Uses configurable periodicity from global admin config and conversation config
   */
  private async scheduleNextFollowUp(conversation: typeof adminConversations.$inferSelect, customDelayMinutes?: number) {
    const priorityDecision = await this.enforcePriorityForConversation(conversation);
    if (!priorityDecision.allowed) {
      console.log(
        `[FOLLOW-UP] Reagendamento bloqueado por prioridade de ${FOLLOWUP_PRIORITY_EMAIL} (${priorityDecision.ownerType}) para ${conversation.contactNumber}.`,
      );
      return;
    }

    const currentStage = conversation.followupStage || 0;
    const nextStage = currentStage + 1;

    const globalConfig = await getAdminFollowupGlobalConfig();
    const convConfig = getEffectiveConversationConfig(conversation, globalConfig);
    const finalMinDays = globalConfig.infiniteLoopMinDays ?? convConfig.finalMinDays ?? 15;
    const finalMaxDays = globalConfig.infiniteLoopMaxDays ?? convConfig.finalMaxDays ?? 30;
    const lastConfiguredStage = Math.max(0, convConfig.intervalsMinutes.length - 1);

    if (typeof customDelayMinutes === "number") {
      const customBaseDate = buildDelayDateFromNow(customDelayMinutes);
      if (!customBaseDate) {
        throw new Error(`[FOLLOW-UP] Delay customizado inválido para ${conversation.contactNumber}: ${String(customDelayMinutes)}`);
      }

      const nextDate = alignToBusinessHours(customBaseDate, convConfig);
      if (!isValidDate(nextDate)) {
        throw new Error(`[FOLLOW-UP] Data inválida ao reagendar customizado para ${conversation.contactNumber}`);
      }

      await db.update(adminConversations)
        .set({ nextFollowupAt: nextDate, followupDisabledReason: null, updatedAt: new Date() })
        .where(eq(adminConversations.id, conversation.id));
      return;
    }

    if (nextStage > lastConfiguredStage) {
      // 🔄 Loop infinito com periodicidade configurável
      const safeMinDays = Math.max(1, Number(finalMinDays) || 15);
      const safeMaxDays = Math.max(safeMinDays, Number(finalMaxDays) || safeMinDays);
      const range = Math.max(0, safeMaxDays - safeMinDays);
      const randomDelay = Math.floor(Math.random() * (range + 1) + safeMinDays);
      const nextDate = alignToBusinessHours(
        new Date(Date.now() + randomDelay * 24 * 60 * 60 * 1000),
        convConfig,
      );

      if (!isValidDate(nextDate)) {
        throw new Error(`[FOLLOW-UP] Data inválida ao reagendar loop infinito para ${conversation.contactNumber}`);
      }

      console.log(`🔄 [FOLLOW-UP] Ciclo infinito: Agendando próximo para daqui a ${randomDelay} dias (config: ${safeMinDays}-${safeMaxDays}d)`);

      await db.update(adminConversations)
        .set({
          followupStage: nextStage, // Continua incrementando para saber quantas vezes já tentou
          nextFollowupAt: nextDate,
          followupDisabledReason: null,
          updatedAt: new Date()
        })
        .where(eq(adminConversations.id, conversation.id));

    } else {
      // Usar o intervalo do próximo estágio, igual ao motor legado do follow-up do cliente.
      const delayMinutes = convConfig.intervalsMinutes[nextStage];
      const baseDate = buildDelayDateFromNow(delayMinutes);
      if (!baseDate) {
        throw new Error(`[FOLLOW-UP] Intervalo inválido no estágio ${nextStage} para ${conversation.contactNumber}: ${String(delayMinutes)}`);
      }

      const nextDate = alignToBusinessHours(baseDate, convConfig);
      if (!isValidDate(nextDate)) {
        throw new Error(`[FOLLOW-UP] Data inválida ao reagendar estágio ${nextStage} para ${conversation.contactNumber}`);
      }

      await db.update(adminConversations)
        .set({
          followupStage: nextStage,
          nextFollowupAt: nextDate,
          followupDisabledReason: null,
          updatedAt: new Date()
        })
        .where(eq(adminConversations.id, conversation.id));
    }
  }

  /**
   * Desativa o follow-up para uma conversa
   */
  async disableFollowUp(conversationId: string, reason: string = "Cancelado manualmente") {
    console.log(`🛑 [FOLLOW-UP] Desativando follow-up para conversa ${conversationId}. Motivo: ${reason}`);

    // Get conversation first to log with payment status
    const conversation = await db.query.adminConversations.findFirst({
      where: eq(adminConversations.id, conversationId)
    });

    if (conversation) {
      // Force update regardless of current state to ensure it sticks
      await db.update(adminConversations)
        .set({
          followupActive: false,
          nextFollowupAt: null,
          followupStage: 0,
          followupDisabledReason: reason,
        })
        .where(eq(adminConversations.id, conversationId));

      console.log(`✅ [FOLLOW-UP] Sucesso ao desativar follow-up para ${conversation.contactNumber}. Active: ${conversation.followupActive}`);

      // Log cancellation with payment status
      await this.logFollowUp(
        conversation.id,
        conversation.contactNumber,
        'cancelled',
        reason,
        undefined,
        conversation.paymentStatus || 'pending',
        'cancelled',
        conversation.followupStage || 0
      );
    } else {
      console.warn(`⚠️ [FOLLOW-UP] Falha ao desativar: Conversa ${conversationId} não encontrada ou update falhou.`);
    }
  }

  /**
   * Inicia o ciclo de follow-up para uma nova conversa (ou reinicia)
   */
  async scheduleInitialFollowUp(
    conversationId: string,
    options: { forceRestart?: boolean; allowManualResume?: boolean } = {},
  ) {
    // 🔧 FIX: NÃO resetar se follow-up já está ativo e agendado!
    // Antes: cada mensagem manual do admin resetava para estágio 0 + 10min,
    // destruindo o progresso de follow-up (ex: estágio 5 voltava para 0).
    const existing = await db.query.adminConversations.findFirst({
      where: eq(adminConversations.id, conversationId)
    });
    
    const hasScheduledFollowup = Boolean(existing?.followupActive && existing?.nextFollowupAt);
    if (!shouldAutoRescheduleAdminFollowup({
      conversation: existing,
      forceRestart: options.forceRestart,
      allowManualResume: options.allowManualResume,
      hasScheduledFollowup,
    })) {
      if ((existing?.contextState as any)?.manualFollowupPause === true) {
        console.log(`🛑 [FOLLOW-UP] Conversa ${conversationId} com follow-up pausado manualmente. Não reativando automaticamente.`);
        return;
      }
      console.log(`ℹ️ [FOLLOW-UP] Follow-up já ativo para ${conversationId} (stage=${existing.followupStage}, next=${new Date(existing.nextFollowupAt).toLocaleString()}). NÃO resetando.`);
      return;
    }

    if (existing) {
      const priorityDecision = await this.enforcePriorityForConversation(existing);
      if (!priorityDecision.allowed) {
        console.log(
          `[FOLLOW-UP] Ativação bloqueada por prioridade de ${FOLLOWUP_PRIORITY_EMAIL} (${priorityDecision.ownerType}) para a conversa ${conversationId}.`,
        );
        return {
          active: false,
          blockedReason: priorityDecision.blockedReason,
        };
      }
    }
    
    const globalConfig = await getAdminFollowupGlobalConfig();
    const effectiveConfig = getEffectiveConversationConfig(
      existing || ({
        followupConfig: LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG,
      } as any),
      globalConfig,
    );
    const delayMinutes = effectiveConfig.intervalsMinutes[0] || LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG.intervalsMinutes[0];
    const nextDate = alignToBusinessHours(
      new Date(Date.now() + delayMinutes * 60 * 1000),
      effectiveConfig,
    );

    await db.update(adminConversations)
      .set({ 
        followupActive: true,
        followupStage: 0,
        nextFollowupAt: nextDate,
        followupDisabledReason: null,
        updatedAt: new Date()
      })
      .where(eq(adminConversations.id, conversationId));
      
    if (options.forceRestart && existing?.nextFollowupAt) {
      console.log(`[FOLLOW-UP] Ciclo reiniciado para conversa ${conversationId} em ${delayMinutes} min`);
      return { active: true, nextFollowupAt: nextDate };
    }

    console.log(`✅ [FOLLOW-UP] Agendado inicial para conversa ${conversationId} em ${delayMinutes} min`);
    return { active: true, nextFollowupAt: nextDate };
  }

  /**
   * Helper para agendar pelo telefone (busca a conversa mais recente)
   */
  async scheduleInitialFollowUpByPhone(
    phoneNumber: string,
    options: { forceRestart?: boolean } = {},
  ) {
    const conversation = await this.findPreferredConversationByPhone(phoneNumber);

    if (conversation) {
      await this.scheduleInitialFollowUp(conversation.id, options);
    } else {
      console.warn(`⚠️ [FOLLOW-UP] Conversa não encontrada para ${phoneNumber} ao tentar agendar follow-up inicial`);
    }
  }

  /**
   * Agenda follow-up com delay customizado (solicitado pela IA via [FOLLOWUP:tempo="X"])
   * Ignora follow-up já ativo — a IA pediu explicitamente, então respeita o delay.
   */
  async scheduleCustomFollowUpByPhone(phoneNumber: string, delayMinutes: number, motivo?: string) {
    const conversation = await this.findPreferredConversationByPhone(phoneNumber);

    if (!conversation) {
      console.warn(`⚠️ [FOLLOW-UP] Conversa não encontrada para ${phoneNumber} ao tentar agendar follow-up customizado`);
      return;
    }

    const priorityDecision = await this.enforcePriorityForConversation(conversation);
    if (!priorityDecision.allowed) {
      console.log(
        `[FOLLOW-UP] Agendamento customizado bloqueado por prioridade de ${FOLLOWUP_PRIORITY_EMAIL} (${priorityDecision.ownerType}) para ${phoneNumber}.`,
      );
      return {
        active: false,
        blockedReason: priorityDecision.blockedReason,
      };
    }

    const globalConfig = await getAdminFollowupGlobalConfig();
    const effectiveConfig = getEffectiveConversationConfig(conversation, globalConfig);
    const nextDate = alignToBusinessHours(
      new Date(Date.now() + delayMinutes * 60 * 1000),
      effectiveConfig,
    );

    await db.update(adminConversations)
      .set({ 
        followupActive: true,
        followupStage: 0,
        nextFollowupAt: nextDate,
        followupDisabledReason: null,
        updatedAt: new Date()
      })
      .where(eq(adminConversations.id, conversation.id));

    console.log(`🎯 [FOLLOW-UP] Agendado PROATIVO para ${phoneNumber} em ${delayMinutes}min. Motivo: ${motivo || 'IA solicitou'}. Próximo: ${nextDate.toLocaleString()}`);
  }

  /**
   * Cancela follow-up ativo para um telefone (MANUALMENTE)
   */
  async cancelFollowUpByPhone(phoneNumber: string) {
    const conversation = await this.findPreferredConversationByPhone(phoneNumber);

    if (conversation) {
      await this.disableFollowUp(conversation.id, "Cancelado pelo usuário");
      console.log(`🛑 [FOLLOW-UP] Cancelado manualmente para ${phoneNumber}`);
    }
  }

  /**
   * Reseta ciclo quando cliente responde
   */
  async resetFollowUpCycle(phoneNumber: string) {
    // NOVA LÓGICA: Se o cliente respondeu, não cancelamos permanentemente.
    // Apenas resetamos o ciclo para o estágio 0 (10 minutos após a resposta).
    // Isso garante que se ele parar de responder de novo, o follow-up volta.
    
    const conversation = await this.findPreferredConversationByPhone(phoneNumber);

    if (!conversation) {
      console.warn(`âš ï¸ [FOLLOW-UP] Conversa nÃ£o encontrada para ${phoneNumber} ao tentar resetar ciclo`);
      return;
    }

    const globalConfig = await getAdminFollowupGlobalConfig();
    const effectiveConfig = getEffectiveConversationConfig(conversation, globalConfig);

    const delayMinutes = effectiveConfig.intervalsMinutes[0] || LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG.intervalsMinutes[0];
    const nextDate = alignToBusinessHours(
      new Date(Date.now() + delayMinutes * 60 * 1000),
      effectiveConfig,
    );

    await db.update(adminConversations)
      .set({ 
        followupActive: true,
        followupStage: 0,
        nextFollowupAt: nextDate,
        followupDisabledReason: null,
        updatedAt: new Date()
      })
      .where(eq(adminConversations.id, conversation.id));
      
    console.log(`🔄 [FOLLOW-UP] Cliente respondeu. Ciclo resetado para ${delayMinutes}min (Estágio 0) para ${phoneNumber}`);
  }

  // ============================================================================
  // GETTERS PARA O CALENDÁRIO
  // ============================================================================

  /**
   * Busca logs de follow-up
   */
  async getFollowUpLogs(status?: string) {
    const whereClause = status ? eq(followupLogs.status, status) : undefined;
    
    return await db.query.followupLogs.findMany({
      where: whereClause,
      orderBy: (followupLogs, { desc }) => [desc(followupLogs.executedAt)],
      limit: 100
    });
  }

  /**
   * Retorna eventos para o calendário (follow-ups futuros)
   */
  async getCalendarEvents() {
    const now = new Date();
    
    // Buscar conversas com follow-up ativo
    const activeFollowUps = await db.query.adminConversations.findMany({
      where: and(
        eq(adminConversations.followupActive, true),
        // Trazer apenas os futuros ou atrasados (não nulos)
        lte(adminConversations.nextFollowupAt, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)) // Próximos 30 dias
      )
    });

    // Double check filtering just in case DB returns stale data (unlikely but safe)
    const validFollowUps = activeFollowUps.filter(c => c.followupActive === true);

    return validFollowUps.map(conv => ({
      id: conv.id, // Use ID directly for easier deletion
      phoneNumber: conv.contactNumber,
      type: 'followup',
      title: `Follow-up #${(conv.followupStage || 0) + 1}`,
      scheduledAt: conv.nextFollowupAt,
      status: conv.nextFollowupAt && conv.nextFollowupAt < now ? 'overdue' : 'pending',
      attempt: (conv.followupStage || 0) + 1,
      metadata: {
        conversationId: conv.id,
        stage: conv.followupStage
      }
    }));
  }

  /**
   * Retorna estatísticas para o dashboard
   */
  async getFollowUpStats() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const events = await this.getCalendarEvents();
    
    const stats = {
      pending: events.filter(e => e.status === 'pending' || e.status === 'overdue').length,
      scheduledToday: events.filter(e => 
        e.scheduledAt && 
        new Date(e.scheduledAt) >= today && 
        new Date(e.scheduledAt) < new Date(today.getTime() + 24 * 60 * 60 * 1000)
      ).length,
      scheduledThisWeek: events.filter(e => 
        e.scheduledAt && 
        new Date(e.scheduledAt) >= today && 
        new Date(e.scheduledAt) < nextWeek
      ).length,
      byType: {} as Record<string, number>,
    };
    
    events.forEach(e => {
      stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;
    });
    
    return stats;
  }

  private async getConversationSignals(conversationId: string) {
    const [latestSentLog, latestOutboundMessage] = await Promise.all([
      db.query.followupLogs.findFirst({
        where: and(
          eq(followupLogs.conversationId, conversationId),
          eq(followupLogs.status, "sent"),
        ),
        orderBy: (table, { desc }) => [desc(table.executedAt), desc(table.id)],
      }),
      db.query.adminMessages.findFirst({
        where: and(
          eq(adminMessages.conversationId, conversationId),
          eq(adminMessages.fromMe, true),
        ),
        orderBy: (table, { desc }) => [desc(table.timestamp), desc(table.id)],
      }),
    ]);

    return { latestSentLog, latestOutboundMessage };
  }

  private getCandidateFollowupDate(
    conversation: typeof adminConversations.$inferSelect,
    effectiveConfig: ReturnType<typeof normalizeAdminFollowupConfig>,
    latestSentLog?: { executedAt: Date | null } | null,
    latestOutboundMessage?: { timestamp: Date | null } | null,
  ) {
    const currentStage = Math.max(0, Number(conversation.followupStage || 0));
    const intervalForStage =
      effectiveConfig.intervalsMinutes[currentStage] ||
      effectiveConfig.intervalsMinutes[effectiveConfig.intervalsMinutes.length - 1] ||
      LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG.intervalsMinutes[0];

    if (latestSentLog?.executedAt) {
      const sentAt = new Date(latestSentLog.executedAt);
      if (currentStage >= effectiveConfig.intervalsMinutes.length) {
        return conversation.nextFollowupAt
          ? new Date(conversation.nextFollowupAt)
          : new Date(
              sentAt.getTime() +
              Math.max(1, effectiveConfig.infiniteLoopMinDays ?? effectiveConfig.finalMinDays ?? 15) * 24 * 60 * 60 * 1000,
            );
      }

      return new Date(sentAt.getTime() + intervalForStage * 60 * 1000);
    }

    if (latestOutboundMessage?.timestamp) {
      return new Date(new Date(latestOutboundMessage.timestamp).getTime() + intervalForStage * 60 * 1000);
    }

    const anchor = conversation.lastMessageTime || conversation.createdAt;
    if (anchor) {
      return new Date(new Date(anchor).getTime() + intervalForStage * 60 * 1000);
    }

    if (conversation.nextFollowupAt) {
      return new Date(conversation.nextFollowupAt);
    }

    return null;
  }

  private async normalizeDuplicatePhones(adminId: string, limit: number = 5000) {
    const conversations = await db.query.adminConversations.findMany({
      where: and(
        eq(adminConversations.adminId, adminId),
        eq(adminConversations.followupActive, true),
      ),
      orderBy: (table, { desc }) => [desc(table.lastMessageTime), desc(table.createdAt)],
      limit,
    });

    const grouped = new Map<string, typeof conversations>();
    for (const conversation of conversations) {
      const key = normalizePhoneDigits(conversation.contactNumber) || conversation.id;
      const group = grouped.get(key) || [];
      group.push(conversation);
      grouped.set(key, group);
    }

    let disabledDuplicates = 0;

    for (const group of grouped.values()) {
      if (group.length <= 1) continue;

      const ranked = [];
      for (const conversation of group) {
        const { latestSentLog, latestOutboundMessage } = await this.getConversationSignals(conversation.id);
        const score =
          (latestSentLog ? 1000 : 0) +
          (latestOutboundMessage ? 500 : 0) +
          (conversation.nextFollowupAt ? 100 : 0) +
          Math.min(50, Number(conversation.followupStage || 0));
        const timestamp = new Date(
          conversation.lastMessageTime || conversation.createdAt || conversation.updatedAt || new Date(0),
        ).getTime();
        ranked.push({ conversation, score, timestamp });
      }

      ranked.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);
      const keepConversationId = ranked[0]?.conversation.id;

      for (const entry of ranked.slice(1)) {
        await db.update(adminConversations)
          .set({
            followupActive: false,
            nextFollowupAt: null,
            followupDisabledReason: `duplicate_phone_merged:${keepConversationId}`,
            updatedAt: new Date(),
          })
          .where(eq(adminConversations.id, entry.conversation.id));
        disabledDuplicates += 1;
      }
    }

    return { disabledDuplicates };
  }

  async reorganizeAllFollowups(adminId: string, limit: number = 2000) {
    try {
      const priorityResult = await this.reconcilePriorityConflicts(Math.max(limit * 3, 3000), adminId);
      const duplicateResult = await this.normalizeDuplicatePhones(adminId, Math.max(limit * 3, 3000));
      await this.repairMissingSchedules(limit, adminId);

      const globalConfig = await getAdminFollowupGlobalConfig();
      const conversations = await db.query.adminConversations.findMany({
        where: and(
          eq(adminConversations.adminId, adminId),
          eq(adminConversations.followupActive, true),
        ),
        orderBy: (table, { asc }) => [asc(table.nextFollowupAt), asc(table.lastMessageTime), asc(table.createdAt)],
        limit,
      });

      let reorganized = 0;
      let skipped = 0;
      let offsetMinutes = 1;
      const now = new Date();

      for (const conversation of conversations) {
        const effectiveConfig = getEffectiveConversationConfig(conversation, globalConfig);
        const { latestSentLog, latestOutboundMessage } = await this.getConversationSignals(conversation.id);
        let candidate = this.getCandidateFollowupDate(
          conversation,
          effectiveConfig,
          latestSentLog,
          latestOutboundMessage,
        );

        if (!candidate || Number.isNaN(candidate.getTime())) {
          skipped += 1;
          continue;
        }

        if (candidate <= now) {
          candidate = new Date(now.getTime() + offsetMinutes * 60 * 1000);
          offsetMinutes += 1;
        }

        candidate = alignToBusinessHours(candidate, effectiveConfig);

        await db.update(adminConversations)
          .set({
            nextFollowupAt: candidate,
            updatedAt: new Date(),
          })
          .where(eq(adminConversations.id, conversation.id));

        reorganized += 1;
      }

      console.log(`🔄 [FOLLOW-UP] Reorganização concluída para admin ${adminId}. reorganized=${reorganized} skipped=${skipped} disabledDuplicates=${duplicateResult.disabledDuplicates} priorityDisabled=${priorityResult.disabledDuplicates}`);
      return {
        reorganized,
        skipped,
        disabledDuplicates: duplicateResult.disabledDuplicates,
        priorityDisabled: priorityResult.disabledDuplicates,
      };
    } catch (error) {
      console.error("❌ [FOLLOW-UP] Erro ao reorganizar follow-ups:", error);
      throw error;
    }
  }

  async repairMissingSchedules(limit: number = 1000, adminId?: string) {
    try {
      await this.reconcilePriorityConflicts(Math.max(limit * 3, 3000), adminId);
      const globalConfig = await getAdminFollowupGlobalConfig();
      const brokenConversations = await db.query.adminConversations.findMany({
        where: adminId
          ? and(
              eq(adminConversations.adminId, adminId),
              eq(adminConversations.followupActive, true),
              isNull(adminConversations.nextFollowupAt),
            )
          : and(
              eq(adminConversations.followupActive, true),
              isNull(adminConversations.nextFollowupAt),
            ),
        orderBy: (table, { asc }) => [asc(table.lastMessageTime), asc(table.createdAt)],
        limit,
      });

      if (brokenConversations.length === 0) {
        return;
      }

      let repaired = 0;
      let skippedWithoutOutbound = 0;
      let offsetMinutes = 1;
      const now = new Date();

      for (const conversation of brokenConversations) {
        const priorityDecision = await this.enforcePriorityForConversation(conversation);
        if (!priorityDecision.allowed) {
          continue;
        }

        const effectiveConfig = getEffectiveConversationConfig(conversation, globalConfig);
        const { latestSentLog, latestOutboundMessage } = await this.getConversationSignals(conversation.id);
        let nextDate = this.getCandidateFollowupDate(
          conversation,
          effectiveConfig,
          latestSentLog,
          latestOutboundMessage,
        );

        if (!nextDate || Number.isNaN(nextDate.getTime())) {
          skippedWithoutOutbound += 1;
          continue;
        }

        if (nextDate <= now) {
          nextDate = new Date(now.getTime() + offsetMinutes * 60 * 1000);
          offsetMinutes += 1;
        }

        nextDate = alignToBusinessHours(nextDate, effectiveConfig);

        await db.update(adminConversations)
          .set({
            nextFollowupAt: nextDate,
            updatedAt: new Date(),
          })
          .where(eq(adminConversations.id, conversation.id));

        repaired += 1;
      }

      console.log(`ðŸ› ï¸ [FOLLOW-UP] Reparo de agenda concluÃ­do. scanned=${brokenConversations.length} repaired=${repaired} skippedWithoutOutbound=${skippedWithoutOutbound}`);
    } catch (error) {
      console.error("âŒ [FOLLOW-UP] Erro ao reparar agendas faltantes:", error);
    }
  }
}

export let followUpService = new FollowUpService();

// ============================================================================
// FUNÇÕES LEGADAS / COMPATIBILIDADE
// ============================================================================

export function registerFollowUpCallback(callback: FollowUpCallback) {
  followUpService.registerFollowUpCallback(callback);
}

export function registerScheduledContactCallback(callback: ScheduledContactCallback) {
  followUpService.registerScheduledContactCallback(callback);
}

export let scheduleAutoFollowUp = function(phoneNumber: string, delayMinutes: number, context: string) {
    // TODO: Implementar compatibilidade se necessário, ou migrar chamadas antigas
    // Por enquanto, apenas loga
    console.warn("⚠️ scheduleAutoFollowUp (legacy) chamado - migrar para scheduleInitialFollowUp");
}

export let cancelFollowUp = function(phoneNumber: string) {
  followUpService.cancelFollowUpByPhone(phoneNumber);
}

export let scheduleContact = function(phoneNumber: string, date: Date, reason: string) {
    // TODO: Implementar agendamento pontual
}

export let parseScheduleFromText = function(text: string): Date | null {
  const now = new Date();
  const lowerText = text.toLowerCase();
  
  // Amanhã
  if (lowerText.includes('amanhã') || lowerText.includes('amanha')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Tentar extrair hora
    const hourMatch = text.match(/(\d{1,2})\s*(?:h|hora|:)/i);
    if (hourMatch) {
      tomorrow.setHours(parseInt(hourMatch[1]), 0, 0, 0);
    } else {
      tomorrow.setHours(10, 0, 0, 0); // Padrão: 10h
    }
    
    return tomorrow;
  }
  
  // Próxima semana / segunda / terça etc
  const weekdays = ['domingo', 'segunda', 'terça', 'terca', 'quarta', 'quinta', 'sexta', 'sábado', 'sabado'];
  for (let i = 0; i < weekdays.length; i++) {
    if (lowerText.includes(weekdays[i])) {
      const targetDay = i % 7;
      const currentDay = now.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;
      
      const target = new Date(now);
      target.setDate(target.getDate() + daysToAdd);
      
      const hourMatch = text.match(/(\d{1,2})\s*(?:h|hora|:)/i);
      if (hourMatch) {
        target.setHours(parseInt(hourMatch[1]), 0, 0, 0);
      } else {
        target.setHours(10, 0, 0, 0);
      }
      
      return target;
    }
  }
  
  // Daqui X dias/horas
  const inXMatch = text.match(/daqui\s*(?:a\s*)?(\d+)\s*(dia|hora|minuto)/i);
  if (inXMatch) {
    const amount = parseInt(inXMatch[1]);
    const unit = inXMatch[2].toLowerCase();
    const target = new Date(now);
    
    if (unit.startsWith('dia')) {
      target.setDate(target.getDate() + amount);
      target.setHours(10, 0, 0, 0);
    } else if (unit.startsWith('hora')) {
      target.setHours(target.getHours() + amount);
    } else if (unit.startsWith('minuto')) {
      target.setMinutes(target.getMinutes() + amount);
    }
    
    return target;
  }
  
  return null;
}

export function setMockFollowUpFunctions(mocks: any) {
  if (mocks.cancelFollowUp) cancelFollowUp = mocks.cancelFollowUp;
  if (mocks.scheduleAutoFollowUp) scheduleAutoFollowUp = mocks.scheduleAutoFollowUp;
  if (mocks.scheduleContact) scheduleContact = mocks.scheduleContact;
  if (mocks.followUpService) followUpService = mocks.followUpService;
}




