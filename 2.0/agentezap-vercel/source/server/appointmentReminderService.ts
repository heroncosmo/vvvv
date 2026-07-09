/**
 * Serviço de Lembretes de Agendamento via IA
 * 
 * Este serviço NÃO envia mensagens automáticas engessadas.
 * Em vez disso, ele usa a IA do agente para gerar mensagens NATURAIS
 * que se adaptam ao estilo de cada negócio.
 * 
 * Fluxo:
 * 1. Verifica agendamentos que precisam de lembrete (X horas antes)
 * 2. Busca histórico da conversa com o cliente
 * 3. Pede para a IA gerar uma mensagem natural de lembrete
 * 4. Envia via WhatsApp como se fosse a IA conversando normalmente
 */

import { supabase } from "./supabaseAuth";
import { db } from "./db";
import { 
  conversations, 
  messages as messagesTable,
  whatsappConnections,
  businessAgentConfigs
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSessions } from "./whatsapp";
import { storage } from "./storage";
import { messageQueueService } from "./messageQueueService";
import { shouldBlockAutomatedConversationSend } from "./conversationAutoPauseGuard";
import { parseCalendarDateTimeWithTimeZone } from "./calendarDateTime";
import { getModuleSchedulingSettings } from "./moduleSchedulingSettings";
import { processResponsePlaceholders } from "./textUtils";
import { getCourseSchedulingRuntimeState } from "./courseSchedulingInsightsService";
import { getAgendamento2RuntimeState } from "./agendamento2InsightsService";
import {
  DEFAULT_COURSE_REMINDER_HOURS_BEFORE,
  normalizeCourseReminderFlowItems,
  type CourseReminderFlowItem,
} from "@shared/courseReminderFlow";
import {
  DEFAULT_AGENDAMENTO2_REMINDER_HOURS_BEFORE,
  normalizeAgendamento2ReminderFlowItems,
  type Agendamento2ReminderFlowItem,
} from "@shared/agendamento2ReminderFlow";
import { formatBrazilWallClockDate } from "./brazilWallClock";

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================

const CHECK_INTERVAL_MS = 60 * 1000; // Verificar a cada minuto

// Cache de lembretes já enviados para evitar duplicatas
const sentRemindersCache = new Map<string, number>(); // appointmentId -> timestamp

// Limpar cache a cada hora
setInterval(() => {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  for (const [key, timestamp] of sentRemindersCache.entries()) {
    if (now - timestamp > ONE_DAY) {
      sentRemindersCache.delete(key);
    }
  }
}, 60 * 60 * 1000);

// ============================================================================
// TIPOS
// ============================================================================

interface AppointmentForReminder {
  id: string;
  user_id: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  location: string;
  status: string;
  reminder_sent: boolean;
}

interface SchedulingConfig {
  user_id: string;
  is_enabled: boolean;
  send_reminder: boolean;
  reminder_hours_before: number;
  reminder_times: number[] | null;
  reminder_message: string;
  service_name: string;
  location: string;
}

interface EmbeddedModuleConfig {
  user_id: string;
  opening_hours?: Record<string, any> | null;
  reminder_message?: string | null;
  salon_name?: string | null;
  service_name?: string | null;
  address?: string | null;
}

interface CourseReminderConfig {
  user_id: string;
  is_active: boolean;
  scheduling_tracker_enabled: boolean;
  course_reminder_enabled: boolean;
  course_reminder_hours_before: number | null;
  course_reminder_flow: CourseReminderFlowItem[] | null;
}

interface CourseInsightReminderCandidate {
  id: string;
  user_id: string;
  connection_id: string;
  conversation_id: string;
  contact_name: string | null;
  contact_number: string;
  agreed_schedule: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  reminder_times_sent: number[] | null;
}

interface Agendamento2ReminderConfig {
  user_id: string;
  is_active: boolean;
  scheduling_tracker_enabled: boolean;
  reminder_enabled: boolean;
  reminder_hours_before: number | null;
  reminder_flow: Agendamento2ReminderFlowItem[] | null;
}

interface Agendamento2InsightReminderCandidate {
  id: string;
  user_id: string;
  connection_id: string;
  conversation_id: string;
  contact_name: string | null;
  contact_number: string;
  agreed_schedule: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  reminder_times_sent: number[] | null;
}

interface Agendamento3ReminderConfig {
  user_id: string;
  is_active: boolean;
  reminder_enabled: boolean;
  reminder_hours_before: number | null;
  reminder_flow: Agendamento2ReminderFlowItem[] | null;
}

interface Agendamento3AppointmentReminderCandidate {
  id: string;
  user_id: string;
  conversation_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  service_name: string | null;
  appointment_date: string;
  start_time: string;
  reminder_times_sent: number[] | null;
}

async function getUserConnectionAndSession(userId: string) {
  const connection = await storage.getConnectionByUserId(userId);
  if (!connection) {
    return { connection: null, session: null };
  }

  const sessions = getSessions();
  return {
    connection,
    session: sessions.get(connection.id) || null,
  };
}

function parseAppointmentDateTime(appointmentDate: string, startTime: string): Date {
  return parseCalendarDateTimeWithTimeZone(`${appointmentDate}T${String(startTime).slice(0, 8)}`);
}

function getBrazilNow(): Date {
  return new Date();
}

function getBrazilIsoDate(date: Date = getBrazilNow()): string {
  return formatBrazilWallClockDate(date) || date.toISOString().slice(0, 10);
}

export function calculateHoursUntilReminderAppointment(
  appointmentDate: string,
  startTime: string,
  reference: Date = new Date(),
): number {
  const scheduledAt = parseAppointmentDateTime(appointmentDate, startTime);
  return (scheduledAt.getTime() - reference.getTime()) / (1000 * 60 * 60);
}

function applyLiteralToken(source: string, token: string, value: string): string {
  if (!source || !token) {
    return source;
  }

  return source.split(token).join(value);
}

function buildCourseReminderReferenceLabel(appointmentDate: Date): string {
  const now = getBrazilNow();
  const appointmentDateKey = getBrazilIsoDate(appointmentDate);
  const todayKey = getBrazilIsoDate(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = getBrazilIsoDate(tomorrow);
  const weekdayLabel = appointmentDate.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
  });
  const dateLabel = appointmentDate.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "long",
  });

  if (appointmentDateKey === todayKey) {
    return `Hoje, ${dateLabel}`;
  }

  if (appointmentDateKey === tomorrowKey) {
    return `Amanhã, ${dateLabel}`;
  }

  return `${weekdayLabel}, ${dateLabel}`;
}

const APPOINTMENT_WEEKDAYS_PT_BR = [
  "domingo",
  "segunda-feira",
  "terca-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sabado",
] as const;

function buildAppointmentMessageDetails(appointment: any) {
  const appointmentDate = parseAppointmentDateTime(appointment.appointment_date, appointment.start_time);
  const dayName = APPOINTMENT_WEEKDAYS_PT_BR[appointmentDate.getDay()] || "";
  const formattedDate = `${appointmentDate.getDate().toString().padStart(2, "0")}/${(appointmentDate.getMonth() + 1).toString().padStart(2, "0")}`;
  const formattedTime = String(appointment.start_time || "").substring(0, 5);

  return { appointmentDate, dayName, formattedDate, formattedTime };
}

function buildAppointmentHistoryContext(conversationHistory: any[] = []): string {
  return conversationHistory
    .map((message) => `${message.fromMe ? "Atendente" : "Cliente"}: ${message.text || "[midia]"}`)
    .join("\n");
}

async function runAppointmentCodexMessage(params: {
  userId: string;
  task: string;
  systemPrompt: string;
  userPrompt: string;
  contactName?: string | null;
  contextArtifacts?: Record<string, unknown>;
}): Promise<string | null> {
  const { runWebOnlyCodexPromptTextForUser } = await import("../api/http");
  const text = await runWebOnlyCodexPromptTextForUser({
    userId: params.userId,
    task: params.task,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ],
    message: params.userPrompt,
    contactName: params.contactName || undefined,
    maxTokens: 220,
    timeoutMs: 90_000,
    contextArtifacts: {
      source: "appointmentReminderService",
      publicMessageAuthor: "codex_cli",
      ...(params.contextArtifacts || {}),
    },
  });
  const trimmed = String(text || "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hydrateCourseReminderText(params: {
  text: string;
  contactName?: string | null;
  scheduledDate: string;
  scheduledTime: string;
}) {
  const appointmentDate = parseAppointmentDateTime(params.scheduledDate, params.scheduledTime);
  const dateLabel = appointmentDate.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeLabel = params.scheduledTime.slice(0, 5);
  const weekdayLabel = appointmentDate.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
  });
  const extendedDateLabel = `${weekdayLabel}, ${appointmentDate.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;

  let hydrated = processResponsePlaceholders(params.text, params.contactName || undefined);
  hydrated = applyLiteralToken(hydrated, "{hora_agendamento}", timeLabel);
  hydrated = applyLiteralToken(hydrated, "{data_agendamento}", dateLabel);
  hydrated = applyLiteralToken(hydrated, "{dia_semana}", weekdayLabel);
  hydrated = applyLiteralToken(hydrated, "{data_agendamento_extenso}", extendedDateLabel);
  hydrated = applyLiteralToken(
    hydrated,
    "{referencia_agendamento}",
    buildCourseReminderReferenceLabel(appointmentDate),
  );

  return hydrated.trim();
}

function hydrateReminderText(params: {
  text: string;
  contactName?: string | null;
  scheduledDate: string;
  scheduledTime: string;
}) {
  const appointmentDate = parseAppointmentDateTime(params.scheduledDate, params.scheduledTime);
  const dateLabel = formatBrazilWallClockDate(appointmentDate, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeLabel = params.scheduledTime.slice(0, 5);
  const weekdayLabel = formatBrazilWallClockDate(appointmentDate, { weekday: "long" });
  const extendedDateLabel = `${weekdayLabel}, ${formatBrazilWallClockDate(appointmentDate, {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;

  let hydrated = processResponsePlaceholders(params.text, params.contactName || undefined);
  hydrated = applyLiteralToken(hydrated, "{hora_agendamento}", timeLabel);
  hydrated = applyLiteralToken(hydrated, "{data_agendamento}", dateLabel);
  hydrated = applyLiteralToken(hydrated, "{dia_semana}", weekdayLabel);
  hydrated = applyLiteralToken(hydrated, "{data_agendamento_extenso}", extendedDateLabel);
  hydrated = applyLiteralToken(
    hydrated,
    "{referencia_agendamento}",
    buildCourseReminderReferenceLabel(appointmentDate),
  );

  return hydrated.trim();
}

export function shouldSendReminderForHoursUntilAppointment(
  hoursUntilAppointment: number,
  reminderHour: number,
  checkIntervalMs: number = CHECK_INTERVAL_MS,
): boolean {
  if (!Number.isFinite(hoursUntilAppointment) || !Number.isFinite(reminderHour) || reminderHour <= 0) {
    return false;
  }

  const intervalHours = checkIntervalMs / (1000 * 60 * 60);
  return hoursUntilAppointment <= reminderHour && hoursUntilAppointment > reminderHour - intervalHours;
}

// ============================================================================
// CLASSE PRINCIPAL
// ============================================================================

export class AppointmentReminderService {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("📅 [APPOINTMENT-REMINDER] Serviço de lembretes iniciado");
    // Verificar a cada minuto
    this.checkInterval = setInterval(() => this.processReminders(), CHECK_INTERVAL_MS);

    // Primeira verificacao imediatamente
    void this.processReminders();
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log("🛑 [APPOINTMENT-REMINDER] Serviço parado");
  }

  private async processCourseUserReminders(config: {
    user_id: string;
    reminder_hours_before: number;
    reminder_flow: CourseReminderFlowItem[];
  }) {
    try {
      const now = getBrazilNow();
      const today = getBrazilIsoDate(now);
      const lastRelevantDate = getBrazilIsoDate(
        new Date(now.getTime() + (config.reminder_hours_before + 24) * 60 * 60 * 1000),
      );

      const { data: insights, error } = await supabase
        .from("course_scheduling_insights")
        .select(
          "id, user_id, connection_id, conversation_id, contact_name, contact_number, agreed_schedule, scheduled_date, scheduled_time, reminder_times_sent",
        )
        .eq("user_id", config.user_id)
        .eq("status", "scheduled")
        .eq("reminder_sent", false)
        .not("scheduled_date", "is", null)
        .not("scheduled_time", "is", null)
        .gte("scheduled_date", today)
        .lte("scheduled_date", lastRelevantDate)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true });

      if (error || !insights || insights.length === 0) {
        return;
      }

      for (const insight of insights as CourseInsightReminderCandidate[]) {
        if (!insight.scheduled_date || !insight.scheduled_time) {
          continue;
        }

        const hoursUntilAppointment = calculateHoursUntilReminderAppointment(
          insight.scheduled_date,
          insight.scheduled_time,
          now,
        );
        if (hoursUntilAppointment <= 0) {
          continue;
        }

        const reminderHour = config.reminder_hours_before || DEFAULT_COURSE_REMINDER_HOURS_BEFORE;
        const sentTimes = Array.isArray(insight.reminder_times_sent) ? insight.reminder_times_sent : [];
        if (sentTimes.includes(reminderHour)) {
          continue;
        }

        const cacheKey = `course_${insight.id}_${reminderHour}h`;
        if (sentRemindersCache.has(cacheKey)) {
          continue;
        }

        if (!shouldSendReminderForHoursUntilAppointment(hoursUntilAppointment, reminderHour)) {
          continue;
        }

        const sent = await this.sendCourseReminderFlow(insight, config.reminder_flow);
        if (!sent) {
          continue;
        }

        const updatedSentTimes = [...sentTimes, reminderHour];
        await supabase
          .from("course_scheduling_insights")
          .update({
            reminder_times_sent: updatedSentTimes,
            reminder_sent: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", insight.id);

        sentRemindersCache.set(cacheKey, Date.now());
      }
    } catch (error) {
      console.error(`Erro ao processar lembretes de cursos para ${config.user_id}:`, error);
    }
  }

  private async sendCourseReminderFlow(
    insight: CourseInsightReminderCandidate,
    reminderFlow: CourseReminderFlowItem[],
  ): Promise<boolean> {
    if (!insight.scheduled_date || !insight.scheduled_time) {
      return false;
    }

    const flowItems = normalizeCourseReminderFlowItems(reminderFlow);
    if (flowItems.length === 0) {
      return false;
    }

    try {
      const connection = await storage.getConnectionByUserId(insight.user_id, insight.connection_id);
      const session = connection ? getSessions().get(connection.id) || null : null;
      if (!connection || !session?.socket) {
        console.log(`Conexao de curso indisponivel para ${insight.user_id}`);
        return false;
      }

      const conversation = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, insight.conversation_id),
          eq(conversations.connectionId, connection.id),
        ),
      });

      if (!conversation) {
        console.log(`Conversa de curso nao encontrada: ${insight.conversation_id}`);
        return false;
      }

      const jid = conversation.remoteJid || `${insight.contact_number}@s.whatsapp.net`;
      const pauseCheck = await shouldBlockAutomatedConversationSend({
        userId: insight.user_id,
        jid,
        conversationId: conversation.id,
        origin: "course_scheduling",
      });
      if (pauseCheck.blocked) {
        console.log(`Lembrete de curso bloqueado para conversa ${conversation.id}`);
        return false;
      }

      let lastSentText = "";
      for (let index = 0; index < flowItems.length; index++) {
        const item = flowItems[index];
        const text = hydrateCourseReminderText({
          text: item.text,
          contactName: insight.contact_name,
          scheduledDate: insight.scheduled_date,
          scheduledTime: insight.scheduled_time,
        });
        if (!text) {
          continue;
        }

        if (index > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }

        const sentMessage = await messageQueueService.executeWithDelay(connection.id, "lembrete de curso", async () => {
          const recheck = await shouldBlockAutomatedConversationSend({
            userId: insight.user_id,
            jid,
            conversationId: conversation.id,
            origin: "course_scheduling",
          });
          if (recheck.blocked) {
            throw new Error("AUTOMATION_PAUSE_BLOCKED");
          }
          return await session.socket.sendMessage(jid, { text });
        });

        if (sentMessage?.key.id) {
          await storage.createMessage({
            conversationId: conversation.id,
            messageId: sentMessage.key.id,
            fromMe: true,
            text,
            timestamp: new Date(),
            status: "sent",
          });
        }

        lastSentText = text;
      }

      if (lastSentText) {
        await storage.updateConversation(conversation.id, {
          lastMessageText: lastSentText,
          lastMessageTime: new Date(),
          lastMessageFromMe: true,
        });
      }
      return Boolean(lastSentText);
    } catch (error) {
      console.error("Erro ao enviar lembrete de curso:", error);
      return false;
    }
  }

  /**
   * Processa todos os agendamentos que precisam de lembrete
   */
  private async processReminders() {
    try {
      console.log("🔍 [APPOINTMENT-REMINDER] Verificando agendamentos...");
      
      // Buscar todos os usuários com agendamento ativo
      const { data: configs, error: configError } = await supabase
        .from('scheduling_config')
        .select('*')
        .eq('is_enabled', true)
        .eq('send_reminder', true);
      
      if (configError && !configs) {
        console.log("📅 [APPOINTMENT-REMINDER] Nenhum usuário com lembretes ativos");
        return;
      }

      for (const config of (configs || []) as SchedulingConfig[]) {
        await this.processUserReminders(config);
      }
      await this.processEmbeddedModuleReminders("salon", "salon_config", "appointments");
      await this.processEmbeddedModuleReminders("provider", "provider_config", "provider_appointments");
      await this.processEmbeddedModuleReminders("clinic", "clinic_config", "clinic_appointments");
      await this.processCourseModuleReminders();
      await this.processAgendamento2ModuleReminders();
      await this.processAgendamento3ModuleReminders();
    } catch (error) {
      console.error("❌ [APPOINTMENT-REMINDER] Erro ao processar lembretes:", error);
    }
  }

  /**
   * Processa lembretes para um usuário específico
   * Suporta múltiplos tempos de lembrete (ex: 24h, 2h, 30min antes)
   */
  private async processEmbeddedModuleReminders(
    moduleName: "salon" | "provider" | "clinic",
    configTable: "salon_config" | "provider_config" | "clinic_config",
    appointmentsTable: "appointments" | "provider_appointments" | "clinic_appointments",
  ) {
    const { data: rawConfigs, error } = await supabase
      .from(configTable)
      .select("user_id, opening_hours, reminder_message, salon_name, service_name, address")
      .eq("is_active", true);

    if (error || !rawConfigs) {
      if (error) {
        console.error(`âŒ [APPOINTMENT-REMINDER] Erro ao buscar configs de ${moduleName}:`, error);
      }
      return;
    }

    for (const rawConfig of rawConfigs as EmbeddedModuleConfig[]) {
      const settings = getModuleSchedulingSettings(rawConfig.opening_hours);
      if (!settings.send_reminder) {
        continue;
      }

      await this.processModuleUserReminders(
        {
          user_id: rawConfig.user_id,
          is_enabled: true,
          send_reminder: settings.send_reminder,
          reminder_hours_before: settings.reminder_hours_before,
          reminder_times: settings.reminder_times,
          reminder_message: rawConfig.reminder_message || "",
          service_name: rawConfig.service_name || rawConfig.salon_name || moduleName,
          location: rawConfig.address || "",
        },
        appointmentsTable,
        moduleName,
      );
    }
  }

  private async processUserReminders(config: SchedulingConfig & { user_id: string }) {
    await this.processModuleUserReminders(config, "appointments", "scheduling");
  }

  private async processCourseModuleReminders() {
    const { data: rawConfigs, error } = await supabase
      .from("course_config")
      .select(
        "user_id, is_active, scheduling_tracker_enabled, course_reminder_enabled, course_reminder_hours_before, course_reminder_flow",
      )
      .eq("is_active", true)
      .eq("course_reminder_enabled", true);

    if (error || !rawConfigs) {
      if (error) {
        console.error("âŒ [APPOINTMENT-REMINDER] Erro ao buscar configs de cursos:", error);
      }
      return;
    }

    for (const rawConfig of rawConfigs as CourseReminderConfig[]) {
      const runtimeState = await getCourseSchedulingRuntimeState(rawConfig.user_id);
      if (!runtimeState.trackingEnabled) {
        continue;
      }

      await this.processCourseUserReminders({
        user_id: rawConfig.user_id,
        reminder_hours_before:
          Number(rawConfig.course_reminder_hours_before) > 0
            ? Number(rawConfig.course_reminder_hours_before)
            : DEFAULT_COURSE_REMINDER_HOURS_BEFORE,
        reminder_flow: normalizeCourseReminderFlowItems(rawConfig.course_reminder_flow),
      });
    }
  }

  private async processAgendamento2UserReminders(config: {
    user_id: string;
    reminder_hours_before: number;
    reminder_flow: Agendamento2ReminderFlowItem[];
  }) {
    try {
      const now = getBrazilNow();
      const today = getBrazilIsoDate(now);
      const lastRelevantDate = getBrazilIsoDate(
        new Date(now.getTime() + (config.reminder_hours_before + 24) * 60 * 60 * 1000),
      );

      const { data: insights, error } = await supabase
        .from("agendamento2_insights")
        .select(
          "id, user_id, connection_id, conversation_id, contact_name, contact_number, agreed_schedule, scheduled_date, scheduled_time, reminder_times_sent",
        )
        .eq("user_id", config.user_id)
        .eq("status", "scheduled")
        .eq("reminder_sent", false)
        .not("scheduled_date", "is", null)
        .not("scheduled_time", "is", null)
        .gte("scheduled_date", today)
        .lte("scheduled_date", lastRelevantDate)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true });

      if (error || !insights || insights.length === 0) {
        return;
      }

      for (const insight of insights as Agendamento2InsightReminderCandidate[]) {
        if (!insight.scheduled_date || !insight.scheduled_time) {
          continue;
        }

        const hoursUntilAppointment = calculateHoursUntilReminderAppointment(
          insight.scheduled_date,
          insight.scheduled_time,
          now,
        );
        if (hoursUntilAppointment <= 0) {
          continue;
        }

        const reminderHour = config.reminder_hours_before || DEFAULT_AGENDAMENTO2_REMINDER_HOURS_BEFORE;
        const sentTimes = Array.isArray(insight.reminder_times_sent) ? insight.reminder_times_sent : [];
        if (sentTimes.includes(reminderHour)) {
          continue;
        }

        const cacheKey = `agendamento2_${insight.id}_${reminderHour}h`;
        if (sentRemindersCache.has(cacheKey)) {
          continue;
        }

        if (!shouldSendReminderForHoursUntilAppointment(hoursUntilAppointment, reminderHour)) {
          continue;
        }

        const sent = await this.sendAgendamento2ReminderFlow(insight, config.reminder_flow);
        if (!sent) {
          continue;
        }

        const updatedSentTimes = [...sentTimes, reminderHour];
        await supabase
          .from("agendamento2_insights")
          .update({
            reminder_times_sent: updatedSentTimes,
            reminder_sent: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", insight.id);

        sentRemindersCache.set(cacheKey, Date.now());
      }
    } catch (error) {
      console.error(`Erro ao processar lembretes do Agendamento 2.0 para ${config.user_id}:`, error);
    }
  }

  private async sendAgendamento2ReminderFlow(
    insight: Agendamento2InsightReminderCandidate,
    reminderFlow: Agendamento2ReminderFlowItem[],
  ): Promise<boolean> {
    if (!insight.scheduled_date || !insight.scheduled_time) {
      return false;
    }

    const flowItems = normalizeAgendamento2ReminderFlowItems(reminderFlow);
    if (flowItems.length === 0) {
      return false;
    }

    try {
      const connection = await storage.getConnectionByUserId(insight.user_id, insight.connection_id);
      const session = connection ? getSessions().get(connection.id) || null : null;
      if (!connection || !session?.socket) {
        console.log(`Conexao do Agendamento 2.0 indisponivel para ${insight.user_id}`);
        return false;
      }

      const conversation = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, insight.conversation_id),
          eq(conversations.connectionId, connection.id),
        ),
      });

      if (!conversation) {
        console.log(`Conversa do Agendamento 2.0 nao encontrada: ${insight.conversation_id}`);
        return false;
      }

      const jid = conversation.remoteJid || `${insight.contact_number}@s.whatsapp.net`;
      const pauseCheck = await shouldBlockAutomatedConversationSend({
        userId: insight.user_id,
        jid,
        conversationId: conversation.id,
        origin: "agendamento2",
      });
      if (pauseCheck.blocked) {
        console.log(`Lembrete do Agendamento 2.0 bloqueado para conversa ${conversation.id}`);
        return false;
      }

      let lastSentText = "";
      for (let index = 0; index < flowItems.length; index++) {
        const item = flowItems[index];
        const text = hydrateReminderText({
          text: item.text,
          contactName: insight.contact_name,
          scheduledDate: insight.scheduled_date,
          scheduledTime: insight.scheduled_time,
        });

        if (!text) {
          continue;
        }

        const sentMessage = await messageQueueService.executeWithDelay(
          connection.id,
          "lembrete do agendamento 2.0",
          async () => {
            const recheck = await shouldBlockAutomatedConversationSend({
              userId: insight.user_id,
              jid,
              conversationId: conversation.id,
              origin: "agendamento2",
            });
            if (recheck.blocked) {
              throw new Error("AUTOMATION_PAUSE_BLOCKED");
            }
            return session.socket.sendMessage(jid, { text });
          },
        );

        if (sentMessage?.key?.id) {
          await storage.createMessage({
            conversationId: conversation.id,
            messageId: sentMessage.key.id,
            fromMe: true,
            text,
            timestamp: new Date(),
            status: "sent",
          });
        }

        lastSentText = text;
      }

      if (!lastSentText) {
        return false;
      }

      await storage.updateConversation(conversation.id, {
        lastMessageText: lastSentText,
        lastMessageTime: new Date(),
      });

      return true;
    } catch (error) {
      console.error(`Erro ao enviar lembrete do Agendamento 2.0 para ${insight.contact_number}:`, error);
      return false;
    }
  }

  private async processAgendamento2ModuleReminders() {
    const { data: rawConfigs, error } = await supabase
      .from("agendamento2_config")
      .select(
        "user_id, is_active, scheduling_tracker_enabled, reminder_enabled, reminder_hours_before, reminder_flow",
      )
      .eq("reminder_enabled", true);

    if (error || !rawConfigs) {
      if (error) {
        console.error("❌ [APPOINTMENT-REMINDER] Erro ao buscar configs do Agendamento 2.0:", error);
      }
      return;
    }

    for (const rawConfig of rawConfigs as Agendamento2ReminderConfig[]) {
      const runtimeState = await getAgendamento2RuntimeState(rawConfig.user_id);
      if (!runtimeState.trackingEnabled) {
        continue;
      }

      await this.processAgendamento2UserReminders({
        user_id: rawConfig.user_id,
        reminder_hours_before:
          Number(rawConfig.reminder_hours_before) > 0
            ? Number(rawConfig.reminder_hours_before)
            : DEFAULT_AGENDAMENTO2_REMINDER_HOURS_BEFORE,
        reminder_flow: normalizeAgendamento2ReminderFlowItems(rawConfig.reminder_flow),
      });
    }
  }

  private async processAgendamento3UserReminders(config: {
    user_id: string;
    reminder_hours_before: number;
    reminder_flow: Agendamento2ReminderFlowItem[];
  }) {
    try {
      const now = getBrazilNow();
      const today = getBrazilIsoDate(now);
      const lastRelevantDate = getBrazilIsoDate(
        new Date(now.getTime() + (config.reminder_hours_before + 24) * 60 * 60 * 1000),
      );

      const { data: appointments, error } = await supabase
        .from("appointments")
        .select("id, user_id, conversation_id, client_name, client_phone, service_name, appointment_date, start_time, reminder_times_sent")
        .eq("user_id", config.user_id)
        .in("status", ["pending", "confirmed"])
        .eq("internal_notes", "agendamento3_agentic")
        .not("appointment_date", "is", null)
        .not("start_time", "is", null)
        .gte("appointment_date", today)
        .lte("appointment_date", lastRelevantDate)
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error || !appointments || appointments.length === 0) {
        return;
      }

      for (const appointment of appointments as Agendamento3AppointmentReminderCandidate[]) {
        if (!appointment.appointment_date || !appointment.start_time) {
          continue;
        }

        const hoursUntilAppointment = calculateHoursUntilReminderAppointment(
          appointment.appointment_date,
          appointment.start_time,
          now,
        );
        if (hoursUntilAppointment <= 0) {
          continue;
        }

        const reminderHour = config.reminder_hours_before || DEFAULT_AGENDAMENTO2_REMINDER_HOURS_BEFORE;
        const sentTimes = Array.isArray(appointment.reminder_times_sent) ? appointment.reminder_times_sent : [];
        if (sentTimes.includes(reminderHour)) {
          continue;
        }

        const cacheKey = `agendamento3_${appointment.id}_${reminderHour}h`;
        if (sentRemindersCache.has(cacheKey)) {
          continue;
        }

        if (!shouldSendReminderForHoursUntilAppointment(hoursUntilAppointment, reminderHour)) {
          continue;
        }

        const sent = await this.sendAgendamento3ReminderFlow(appointment, config.reminder_flow);
        if (!sent) {
          continue;
        }

        const updatedSentTimes = [...sentTimes, reminderHour];
        await supabase
          .from("appointments")
          .update({
            reminder_times_sent: updatedSentTimes,
            reminder_sent: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", appointment.id);

        sentRemindersCache.set(cacheKey, Date.now());
      }
    } catch (error) {
      console.error(`Erro ao processar lembretes do Agendamento 3.0 para ${config.user_id}:`, error);
    }
  }

  private async sendAgendamento3ReminderFlow(
    appointment: Agendamento3AppointmentReminderCandidate,
    reminderFlow: Agendamento2ReminderFlowItem[],
  ): Promise<boolean> {
    if (!appointment.appointment_date || !appointment.start_time || !appointment.client_phone) {
      return false;
    }

    const flowItems = normalizeAgendamento2ReminderFlowItems(reminderFlow);
    if (flowItems.length === 0) {
      return false;
    }

    try {
      let conversation = appointment.conversation_id
        ? await db.query.conversations.findFirst({
            where: eq(conversations.id, appointment.conversation_id),
          })
        : null;
      const connection = conversation?.connectionId
        ? await storage.getConnectionByUserId(appointment.user_id, conversation.connectionId)
        : await storage.getConnectionByUserId(appointment.user_id);
      const session = connection ? getSessions().get(connection.id) || null : null;
      if (!connection || !session?.socket) {
        console.log(`Conexao do Agendamento 3.0 indisponivel para ${appointment.user_id}`);
        return false;
      }

      if (!conversation) {
        conversation = await db.query.conversations.findFirst({
          where: and(
            eq(conversations.connectionId, connection.id),
            eq(conversations.contactNumber, appointment.client_phone),
          ),
        });
      }

      if (!conversation) {
        console.log(`Conversa do Agendamento 3.0 nao encontrada para ${appointment.client_phone}`);
        return false;
      }

      const jid = conversation.remoteJid || `${appointment.client_phone}@s.whatsapp.net`;
      const pauseCheck = await shouldBlockAutomatedConversationSend({
        userId: appointment.user_id,
        jid,
        conversationId: conversation.id,
        origin: "agendamento3",
      });
      if (pauseCheck.blocked) {
        console.log(`Lembrete do Agendamento 3.0 bloqueado para conversa ${conversation.id}`);
        return false;
      }

      let lastSentText = "";
      for (const item of flowItems) {
        const text = hydrateReminderText({
          text: item.text,
          contactName: appointment.client_name || undefined,
          scheduledDate: appointment.appointment_date,
          scheduledTime: appointment.start_time,
        });

        if (!text) {
          continue;
        }

        const sentMessage = await messageQueueService.executeWithDelay(
          connection.id,
          "lembrete do agendamento 3.0",
          async () => {
            const recheck = await shouldBlockAutomatedConversationSend({
              userId: appointment.user_id,
              jid,
              conversationId: conversation!.id,
              origin: "agendamento3",
            });
            if (recheck.blocked) {
              throw new Error("AUTOMATION_PAUSE_BLOCKED");
            }
            return session.socket.sendMessage(jid, { text });
          },
        );

        if (sentMessage?.key?.id) {
          await storage.createMessage({
            conversationId: conversation.id,
            messageId: sentMessage.key.id,
            fromMe: true,
            text,
            timestamp: new Date(),
            status: "sent",
          });
        }

        lastSentText = text;
      }

      if (!lastSentText) {
        return false;
      }

      await storage.updateConversation(conversation.id, {
        lastMessageText: lastSentText,
        lastMessageTime: new Date(),
      });

      return true;
    } catch (error) {
      console.error(`Erro ao enviar lembrete do Agendamento 3.0 para ${appointment.client_phone}:`, error);
      return false;
    }
  }

  private async processAgendamento3ModuleReminders() {
    const { data: rawConfigs, error } = await supabase
      .from("agendamento3_config")
      .select("user_id, is_active, reminder_enabled, reminder_hours_before, reminder_flow")
      .eq("is_active", true)
      .eq("reminder_enabled", true);

    if (error || !rawConfigs) {
      if (error) {
        console.error("❌ [APPOINTMENT-REMINDER] Erro ao buscar configs do Agendamento 3.0:", error);
      }
      return;
    }

    for (const rawConfig of rawConfigs as Agendamento3ReminderConfig[]) {
      await this.processAgendamento3UserReminders({
        user_id: rawConfig.user_id,
        reminder_hours_before:
          Number(rawConfig.reminder_hours_before) > 0
            ? Number(rawConfig.reminder_hours_before)
            : DEFAULT_AGENDAMENTO2_REMINDER_HOURS_BEFORE,
        reminder_flow: normalizeAgendamento2ReminderFlowItems(rawConfig.reminder_flow),
      });
    }
  }

  private async processModuleUserReminders(
    config: SchedulingConfig,
    appointmentsTable: "appointments" | "provider_appointments" | "clinic_appointments",
    moduleName: "scheduling" | "salon" | "provider" | "clinic",
  ) {
    try {
      const now = new Date();
      const brazilNow = getBrazilNow();
      
      // Usar reminder_times (array) se disponível, senão fallback para reminder_hours_before
      const reminderTimes: number[] = (config.reminder_times && Array.isArray(config.reminder_times) && config.reminder_times.length > 0)
        ? [...config.reminder_times].sort((a: number, b: number) => b - a) // Maior primeiro
        : [config.reminder_hours_before || 24];
      
      const maxReminder = Math.max(...reminderTimes);
      
      // Formato de data para comparação - buscar agendamentos nos próximos X horas
      const today = formatBrazilWallClockDate(brazilNow) || "";
      const dayAfterTomorrow = formatBrazilWallClockDate(
        new Date(brazilNow.getTime() + maxReminder * 60 * 60 * 1000 + 24 * 60 * 60 * 1000),
      ) || "";
      
      // Buscar agendamentos confirmados/pendentes que podem precisar de lembrete
      const { data: appointments, error } = await supabase
        .from(appointmentsTable)
        .select('*, reminder_times_sent')
        .eq('user_id', config.user_id)
        .in('status', ['confirmed', 'pending'])
        .gte('appointment_date', today)
        .lte('appointment_date', dayAfterTomorrow)
        .order('appointment_date', { ascending: true })
        .order('start_time', { ascending: true });
      
      if (error || !appointments || appointments.length === 0) {
        return;
      }

      console.log(`📅 [APPOINTMENT-REMINDER] ${appointments.length} agendamentos encontrados para user ${config.user_id}`);

      for (const appointment of appointments) {
        const appointmentDateTime = parseAppointmentDateTime(appointment.appointment_date, appointment.start_time);
        const hoursUntilAppointment = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        
        // Pular se já passou
        if (hoursUntilAppointment <= 0) continue;
        
        // Lembretes já enviados para este agendamento
        const sentTimes: number[] = appointment.reminder_times_sent || [];
        
        // Verificar cada tempo de lembrete configurado
        for (const reminderHour of reminderTimes) {
          // Pular se este lembrete já foi enviado
          if (sentTimes.includes(reminderHour)) continue;
          
          // Cache key inclui o tempo do lembrete
          const cacheKey = `${appointment.id}_${reminderHour}h`;
          if (sentRemindersCache.has(cacheKey)) continue;

          // Enviar apenas dentro da janela exata do ciclo atual
          if (shouldSendReminderForHoursUntilAppointment(hoursUntilAppointment, reminderHour)) {
            console.log(`📤 [APPOINTMENT-REMINDER] Enviando lembrete ${reminderHour}h para ${appointment.client_name} (${cacheKey})`);
            
            await this.sendReminderViaAI(appointment, config, reminderHour, appointmentsTable);
            
            // Marcar este tempo como enviado no DB
            const updatedSentTimes = [...sentTimes, reminderHour];
            await supabase
              .from(appointmentsTable)
              .update({ 
                reminder_times_sent: updatedSentTimes,
                // Manter compatibilidade: marcar reminder_sent=true quando todos foram enviados
                reminder_sent: updatedSentTimes.length >= reminderTimes.length
              })
              .eq('id', appointment.id);
            
            // Adicionar ao cache
            sentRemindersCache.set(cacheKey, Date.now());
            
            // Só enviar um lembrete por ciclo por agendamento
            break;
          }
        }
      }
    } catch (error) {
      console.error(`❌ [APPOINTMENT-REMINDER] Erro ao processar user ${config.user_id}:`, error);
    }
  }

  /**
   * Envia lembrete usando a IA do agente (mensagem natural, não automática)
   */
  private async sendReminderViaAI(
    appointment: AppointmentForReminder, 
    config: SchedulingConfig & { user_id: string },
    reminderHour?: number,
    appointmentsTable: "appointments" | "provider_appointments" | "clinic_appointments" = "appointments"
  ) {
    const userId = config.user_id;
    const clientPhone = appointment.client_phone;
    
    console.log(`📤 [APPOINTMENT-REMINDER] Preparando lembrete para ${clientPhone} - ${appointment.client_name}`);

    try {
      // 1. Verificar se existe conexão WhatsApp ativa
      const { connection, session } = await getUserConnectionAndSession(userId);
      if (!session?.socket) {
        console.log(`⚠️ [APPOINTMENT-REMINDER] WhatsApp não conectado para user ${userId}`);
        return;
      }

      // 2. Buscar conversa existente com o cliente
      if (!connection) {
        console.log(`⚠️ [APPOINTMENT-REMINDER] Conexão não encontrada para user ${userId}`);
        return;
      }

      // Buscar conversa pelo número do cliente
      const conversation = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.connectionId, connection.id),
          eq(conversations.contactNumber, clientPhone)
        )
      });

      if (!conversation) {
        console.log(`⚠️ [APPOINTMENT-REMINDER] Conversa não encontrada com ${clientPhone}`);
        return;
      }

      // 3. Buscar configurações do agente para adaptar o estilo
      const agentConfig = await db.query.businessAgentConfigs.findFirst({
        where: eq(businessAgentConfigs.userId, userId)
      });

      // 4. Buscar histórico recente da conversa
      const recentMessages = await db.query.messages.findMany({
        where: eq(messagesTable.conversationId, conversation.id),
        orderBy: [desc(messagesTable.timestamp)],
        limit: 10
      });

      // 5. Gerar mensagem de lembrete via IA
      const reminderMessage = await this.generateReminderWithAI(
        appointment,
        config,
        agentConfig,
        recentMessages.reverse()
      );

      if (!reminderMessage) {
        console.log(`⚠️ [APPOINTMENT-REMINDER] IA não gerou mensagem de lembrete`);
        return;
      }

      // 6. Enviar mensagem via WhatsApp
      const jid = conversation.remoteJid || `${clientPhone}@s.whatsapp.net`;
      
      console.log(`📤 [APPOINTMENT-REMINDER] Enviando para ${jid}: ${reminderMessage.substring(0, 50)}...`);
      
      // 🛡️ ANTI-BLOQUEIO: Usar executeWithDelay para garantir try/finally
      const pauseCheck = await shouldBlockAutomatedConversationSend({
        userId,
        jid,
        conversationId: conversation.id,
        origin: "scheduling",
      });
      if (pauseCheck.blocked) {
        console.log(`⏸️ [APPOINTMENT-REMINDER] Lembrete bloqueado para conversa ${conversation.id} porque a IA está pausada`);
        return;
      }

      const sentMessage = await messageQueueService.executeWithDelay(connection.id, 'lembrete de agendamento', async () => {
        const recheck = await shouldBlockAutomatedConversationSend({
          userId,
          jid,
          conversationId: conversation.id,
          origin: "scheduling",
        });
        if (recheck.blocked) {
          throw new Error("AUTOMATION_PAUSE_BLOCKED");
        }
        return await session.socket.sendMessage(jid, { text: reminderMessage });
      });

      // 7. Registrar mensagem no histórico
      if (sentMessage?.key.id) {
        await storage.createMessage({
          conversationId: conversation.id,
          messageId: sentMessage.key.id,
          fromMe: true,
          text: reminderMessage,
          timestamp: new Date(),
          status: "sent",
        });
      }

      // 8. Atualizar conversa
      await storage.updateConversation(conversation.id, {
        lastMessageText: reminderMessage,
        lastMessageTime: new Date(),
      });

      // 9. Marcar lembrete como enviado (para lembretes simples sem reminder_times)
      // Nota: Para múltiplos lembretes, o processUserReminders já faz o tracking
      if (!reminderHour) {
        await supabase
          .from(appointmentsTable)
          .update({ reminder_sent: true })
          .eq('id', appointment.id);
        sentRemindersCache.set(appointment.id, Date.now());
      }

      console.log(`✅ [APPOINTMENT-REMINDER] Lembrete ${reminderHour ? reminderHour + 'h' : ''} enviado com sucesso para ${clientPhone}`);

    } catch (error) {
      console.error(`❌ [APPOINTMENT-REMINDER] Erro ao enviar lembrete:`, error);
    }
  }

  /**
   * Gera mensagem de lembrete usando a IA do agente
   * A mensagem será NATURAL e adaptada ao estilo do negócio
   */
  private async generateReminderWithAI(
    appointment: AppointmentForReminder,
    config: SchedulingConfig,
    agentConfig: any,
    conversationHistory: any[]
  ): Promise<string | null> {
    try {
      const { dayName, formattedDate, formattedTime } = buildAppointmentMessageDetails(appointment);
      const historyContext = buildAppointmentHistoryContext(conversationHistory);
      const userId = config.user_id || appointment.user_id;

      const systemPrompt = [
        "Voce e o assistente de atendimento do tenant. Escreva somente a mensagem publica final para WhatsApp.",
        "Use o prompt/configuracao do tenant como fonte de tom, estilo e limites. Nao invente fatos ausentes.",
        "Se o contexto for insuficiente para enviar uma mensagem correta, retorne vazio/no_send pelo contrato Codex; nao gere mensagem fora do Codex.",
        agentConfig?.prompt ? `Prompt completo do tenant:\n${agentConfig.prompt}` : "Prompt do tenant indisponivel.",
      ].join("\n\n");

      const userPrompt = [
        "Tarefa: gerar mensagem de lembrete de agendamento para o cliente.",
        `Cliente: ${appointment.client_name || ""}`,
        `Servico: ${appointment.service_name || ""}`,
        `Data: ${dayName}, ${formattedDate}`,
        `Horario: ${formattedTime}`,
        appointment.location ? `Local: ${appointment.location}` : "Local: nao informado",
        config.reminder_message ? `Modelo/configuracao do tenant para lembrete: ${config.reminder_message}` : "Modelo/configuracao do tenant para lembrete: nao informado",
        historyContext ? `Historico recente da conversa:\n${historyContext}` : "Historico recente da conversa: vazio",
        "Requisitos: mensagem curta, natural, sem bastidor tecnico, sem explicar raciocinio e sem criar promessas fora do contexto.",
      ].join("\n");

      return await runAppointmentCodexMessage({
        userId,
        task: "appointment_reminder_message",
        systemPrompt,
        userPrompt,
        contactName: appointment.client_name,
        contextArtifacts: {
          messageKind: "appointment_reminder",
          appointment,
          schedulingConfig: config,
          agentConfig,
          conversationHistory,
        },
      });
    } catch (error) {
      console.error("[APPOINTMENT-REMINDER] Codex nao gerou mensagem de lembrete:", error);
      return null;
    }
  }

  /**
   * Força envio de lembrete para um agendamento específico (uso manual)
   */
  async sendManualReminder(appointmentId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const { data: appointment, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single();

      if (error || !appointment) {
        return { success: false, error: 'Agendamento não encontrado' };
      }

      const { data: config } = await supabase
        .from('scheduling_config')
        .select('*')
        .eq('user_id', appointment.user_id)
        .single();

      if (!config) {
        return { success: false, error: 'Configuração de agendamento não encontrada' };
      }

      await this.sendReminderViaAI(appointment, { ...config, user_id: appointment.user_id }, undefined, "appointments");
      
      return { success: true, message: 'Lembrete enviado com sucesso' };
    } catch (error: any) {
      return { success: false, error: error.message || 'Erro ao enviar lembrete' };
    }
  }
}

// Singleton
export const appointmentReminderService = new AppointmentReminderService();

/**
 * Envia mensagem personalizada quando o negocio confirma agendamento manual
 */
export async function sendCustomMessageToClient(
  appointment: any,
  userId: string,
  customMessage: string
): Promise<void> {
  const clientPhone = appointment.client_phone;
  const finalMessage = (customMessage || "").trim();
  if (!finalMessage) return;

  try {
    const { connection, session } = await getUserConnectionAndSession(userId);
    if (!session?.socket) {
      console.log(`[CUSTOM CONFIRMATION] WhatsApp nao conectado para user ${userId}`);
      return;
    }

    if (!connection) {
      console.log(`[CUSTOM CONFIRMATION] Conexao nao encontrada para user ${userId}`);
      return;
    }

    let conversation = await storage.getConversationByContactNumber(connection.id, clientPhone);
    if (!conversation) {
      conversation = await storage.createConversation({
        connectionId: connection.id,
        contactNumber: clientPhone,
        contactName: appointment.client_name,
        lastMessageText: null,
        lastMessageTime: null,
        lastMessageFromMe: true,
      });
    }

    const jid = conversation.remoteJid || `${clientPhone}@s.whatsapp.net`;

    const sentMessage = await messageQueueService.executeWithDelay(connection.id, "custom confirmation", async () => {
      return await session.socket.sendMessage(jid, { text: finalMessage });
    });

    if (sentMessage?.key.id) {
      await storage.createMessage({
        conversationId: conversation.id,
        messageId: sentMessage.key.id,
        fromMe: true,
        text: finalMessage,
        timestamp: new Date(),
        status: "sent",
      });
    }

    await storage.updateConversation(conversation.id, {
      lastMessageText: finalMessage,
      lastMessageTime: new Date(),
      lastMessageFromMe: true,
      hasReplied: true,
    });
  } catch (error) {
    console.error("[CUSTOM CONFIRMATION] Erro ao enviar mensagem personalizada:", error);
  }
}

/**
 * Envia confirmação ao cliente quando o negócio ACEITA o agendamento
 * Usa a IA para gerar mensagem natural adaptada ao estilo do negócio
 */
export async function sendConfirmationToClientViaAI(
  appointment: any, 
  userId: string
): Promise<void> {
  const clientPhone = appointment.client_phone;
  
  console.log(`📤 [CONFIRMATION] Enviando confirmação para ${clientPhone} - ${appointment.client_name}`);

  try {
    // 1. Buscar configuração de agendamento
    const { data: config } = await supabase
      .from('scheduling_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!config?.is_enabled) {
      console.log(`⚠️ [CONFIRMATION] Agendamento desativado para user ${userId}`);
      return;
    }

    // 2. Verificar se existe conexão WhatsApp ativa
    const { connection, session } = await getUserConnectionAndSession(userId);
    if (!session?.socket) {
      console.log(`⚠️ [CONFIRMATION] WhatsApp não conectado para user ${userId}`);
      return;
    }

    // 3. Buscar conversa existente com o cliente
    if (!connection) {
      console.log(`⚠️ [CONFIRMATION] Conexão não encontrada para user ${userId}`);
      return;
    }

    // Buscar conversa pelo número do cliente
    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.connectionId, connection.id),
        eq(conversations.contactNumber, clientPhone)
      )
    });

    if (!conversation) {
      console.log(`⚠️ [CONFIRMATION] Conversa não encontrada com ${clientPhone}`);
      return;
    }

    // 4. Buscar configurações do agente para adaptar o estilo
    const agentConfig = await db.query.businessAgentConfigs.findFirst({
      where: eq(businessAgentConfigs.userId, userId)
    });

    // 5. Buscar histórico recente da conversa
    const recentMessages = await db.query.messages.findMany({
      where: eq(messagesTable.conversationId, conversation.id),
      orderBy: [desc(messagesTable.timestamp)],
      limit: 10
    });

    // 6. Gerar mensagem de confirmação via IA
    const confirmationMessage = await generateConfirmationWithAI(
      appointment,
      config,
      agentConfig,
      recentMessages.reverse()
    );

    if (!confirmationMessage) {
      console.log(`⚠️ [CONFIRMATION] IA não gerou mensagem de confirmação`);
      return;
    }

    // 7. Enviar mensagem via WhatsApp
    const jid = conversation.remoteJid || `${clientPhone}@s.whatsapp.net`;
    
    console.log(`📤 [CONFIRMATION] Enviando para ${jid}: ${confirmationMessage.substring(0, 50)}...`);
    
    // 🛡️ ANTI-BLOQUEIO: Usar executeWithDelay para garantir try/finally
    const sentMessage = await messageQueueService.executeWithDelay(connection.id, 'confirmação de agendamento', async () => {
      const recheck = await shouldBlockAutomatedConversationSend({
        userId: appointment.user_id,
        jid,
        conversationId: conversation.id,
        origin: "scheduling",
      });
      if (recheck.blocked) {
        throw new Error("AUTOMATION_PAUSE_BLOCKED");
      }
      return await session.socket.sendMessage(jid, { text: confirmationMessage });
    });

    // 8. Registrar mensagem no histórico
    if (sentMessage?.key.id) {
      await storage.createMessage({
        conversationId: conversation.id,
        messageId: sentMessage.key.id,
        fromMe: true,
        text: confirmationMessage,
        timestamp: new Date(),
        status: "sent",
      });
    }

    // 9. Atualizar conversa
    await storage.updateConversation(conversation.id, {
      lastMessageText: confirmationMessage,
      lastMessageTime: new Date(),
    });

    console.log(`✅ [CONFIRMATION] Confirmação enviada para ${clientPhone}`);

  } catch (error) {
    console.error(`❌ [CONFIRMATION] Erro ao enviar confirmação:`, error);
  }
}

/**
 * Gera mensagem de confirmação usando a IA do agente
 * A mensagem será NATURAL e adaptada ao estilo do negócio
 */
async function generateConfirmationWithAI(
  appointment: any,
  config: any,
  agentConfig: any,
  conversationHistory: any[]
): Promise<string | null> {
  try {
    const { dayName, formattedDate, formattedTime } = buildAppointmentMessageDetails(appointment);
    const historyContext = buildAppointmentHistoryContext(conversationHistory);
    const userId = String(appointment.user_id || config?.user_id || "").trim();
    if (!userId) {
      throw new Error("appointment_confirmation_missing_user_id");
    }

    const systemPrompt = [
      "Voce e o assistente de atendimento do tenant. Escreva somente a mensagem publica final para WhatsApp.",
      "Use o prompt/configuracao do tenant como fonte de tom, estilo e limites. Nao invente fatos ausentes.",
      "Se o contexto for insuficiente para confirmar corretamente, retorne vazio/no_send pelo contrato Codex; nao gere mensagem fora do Codex.",
      agentConfig?.prompt ? `Prompt completo do tenant:\n${agentConfig.prompt}` : "Prompt do tenant indisponivel.",
    ].join("\n\n");

    const userPrompt = [
      "Tarefa: gerar mensagem informando que o agendamento foi confirmado.",
      `Cliente: ${appointment.client_name || ""}`,
      `Servico: ${appointment.service_name || ""}`,
      `Data: ${dayName}, ${formattedDate}`,
      `Horario: ${formattedTime}`,
      appointment.location ? `Local: ${appointment.location}` : "Local: nao informado",
      config?.confirmation_message ? `Modelo/configuracao do tenant para confirmacao: ${config.confirmation_message}` : "Modelo/configuracao do tenant para confirmacao: nao informado",
      historyContext ? `Historico recente da conversa:\n${historyContext}` : "Historico recente da conversa: vazio",
      "Requisitos: mensagem curta, natural, sem bastidor tecnico, sem explicar raciocinio e sem criar promessas fora do contexto.",
    ].join("\n");

    return await runAppointmentCodexMessage({
      userId,
      task: "appointment_confirmation_message",
      systemPrompt,
      userPrompt,
      contactName: appointment.client_name,
      contextArtifacts: {
        messageKind: "appointment_confirmation",
        appointment,
        schedulingConfig: config,
        agentConfig,
        conversationHistory,
      },
    });
  } catch (error) {
    console.error("[CONFIRMATION] Codex nao gerou mensagem de confirmacao:", error);
    return null;
  }
}

/**
 * Envia notificação ao cliente quando o negócio CANCELA o agendamento
 * Usa a IA para gerar mensagem natural adaptada ao estilo do negócio
 */
export async function sendCancellationToClientViaAI(
  appointment: any, 
  userId: string,
  reason?: string
): Promise<void> {
  const clientPhone = appointment.client_phone;
  
  console.log(`📤 [CANCELLATION] Enviando notificação de cancelamento para ${clientPhone}`);

  try {
    // 1. Buscar configuração de agendamento
    const { data: config } = await supabase
      .from('scheduling_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!config?.is_enabled) {
      return;
    }

    // 2. Verificar se existe conexão WhatsApp ativa
    const { connection, session } = await getUserConnectionAndSession(userId);
    if (!session?.socket) {
      console.log(`⚠️ [CANCELLATION] WhatsApp não conectado para user ${userId}`);
      return;
    }

    // 3. Buscar conversa existente com o cliente
    if (!connection) {
      return;
    }

    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.connectionId, connection.id),
        eq(conversations.contactNumber, clientPhone)
      )
    });

    if (!conversation) {
      return;
    }

    // 4. Buscar configurações do agente
    const agentConfig = await db.query.businessAgentConfigs.findFirst({
      where: eq(businessAgentConfigs.userId, userId)
    });

    // 5. Gerar mensagem de cancelamento via IA
    const cancellationMessage = await generateCancellationWithAI(
      appointment,
      config,
      agentConfig,
      reason
    );

    if (!cancellationMessage) {
      return;
    }

    // 6. Enviar mensagem via WhatsApp
    const jid = conversation.remoteJid || `${clientPhone}@s.whatsapp.net`;
    
    // 🛡️ ANTI-BLOQUEIO: Usar executeWithDelay para garantir try/finally
    const sentMessage = await messageQueueService.executeWithDelay(connection.id, 'cancelamento de agendamento', async () => {
      const recheck = await shouldBlockAutomatedConversationSend({
        userId,
        jid,
        conversationId: conversation.id,
        origin: "scheduling",
      });
      if (recheck.blocked) {
        throw new Error("AUTOMATION_PAUSE_BLOCKED");
      }
      return await session.socket.sendMessage(jid, { text: cancellationMessage });
    });

    // 7. Registrar mensagem no histórico
    if (sentMessage?.key.id) {
      await storage.createMessage({
        conversationId: conversation.id,
        messageId: sentMessage.key.id,
        fromMe: true,
        text: cancellationMessage,
        timestamp: new Date(),
        status: "sent",
      });
    }

    // 8. Atualizar conversa
    await storage.updateConversation(conversation.id, {
      lastMessageText: cancellationMessage,
      lastMessageTime: new Date(),
    });

    console.log(`✅ [CANCELLATION] Notificação enviada para ${clientPhone}`);

  } catch (error) {
    console.error(`❌ [CANCELLATION] Erro:`, error);
  }
}

/**
 * Gera mensagem de cancelamento usando a IA
 */
async function generateCancellationWithAI(
  appointment: any,
  config: any,
  agentConfig: any,
  reason?: string
): Promise<string | null> {
  try {
    const { dayName, formattedDate, formattedTime } = buildAppointmentMessageDetails(appointment);
    const userId = String(appointment.user_id || config?.user_id || "").trim();
    if (!userId) {
      throw new Error("appointment_cancellation_missing_user_id");
    }

    const systemPrompt = [
      "Voce e o assistente de atendimento do tenant. Escreva somente a mensagem publica final para WhatsApp.",
      "Use o prompt/configuracao do tenant como fonte de tom, estilo e limites. Nao invente fatos ausentes.",
      "Se o contexto for insuficiente para cancelar corretamente, retorne vazio/no_send pelo contrato Codex; nao gere mensagem fora do Codex.",
      agentConfig?.prompt ? `Prompt completo do tenant:\n${agentConfig.prompt}` : "Prompt do tenant indisponivel.",
    ].join("\n\n");

    const userPrompt = [
      "Tarefa: gerar mensagem informando que o agendamento foi cancelado pelo negocio.",
      `Cliente: ${appointment.client_name || ""}`,
      `Servico: ${appointment.service_name || ""}`,
      `Data: ${dayName}, ${formattedDate}`,
      `Horario: ${formattedTime}`,
      reason ? `Motivo informado: ${reason}` : "Motivo informado: nao informado",
      config?.cancellation_message ? `Modelo/configuracao do tenant para cancelamento: ${config.cancellation_message}` : "Modelo/configuracao do tenant para cancelamento: nao informado",
      "Requisitos: mensagem curta, natural, sem bastidor tecnico, sem explicar raciocinio e sem criar promessas fora do contexto.",
    ].join("\n");

    return await runAppointmentCodexMessage({
      userId,
      task: "appointment_cancellation_message",
      systemPrompt,
      userPrompt,
      contactName: appointment.client_name,
      contextArtifacts: {
        messageKind: "appointment_cancellation",
        appointment,
        schedulingConfig: config,
        agentConfig,
        reason: reason || null,
      },
    });
  } catch (error) {
    console.error("[CANCELLATION] Codex nao gerou mensagem de cancelamento:", error);
    return null;
  }
}
