import { sql } from "drizzle-orm";

import { db } from "./db";
import { getBrazilTimeParts } from "./greetingTime";
import {
  isGoogleCalendarConnected,
  listCalendarBusyWindows,
  removeAppointmentFromCalendar,
  syncAppointmentToCalendar,
} from "./googleCalendarService";
import { chatComplete } from "./llm";
import { parseAgendamento2Insight } from "./agendamento2InsightsHelpers";
import { resolveLeadDisplayName, trimText } from "./leadIntelligenceHelpers";
import { supabase } from "./supabaseAuth";

const AGENDAMENTO2_ANALYSIS_VERSION = "agendamento2-v1";

type Agendamento2ConversationContextRow = {
  conversation_id: string;
  connection_id: string;
  user_id: string;
  contact_number: string;
  contact_name: string | null;
  connection_name: string | null;
  source_phone_number: string | null;
  source_account_name: string | null;
  source_account_email: string | null;
};

type Agendamento2MessageContextRow = {
  from_me: boolean;
  is_from_agent: boolean;
  text: string | null;
  media_caption: string | null;
  timestamp: Date | string;
};

type Agendamento2InsightRecord = {
  id: string;
  conversationId: string;
  connectionId: string;
  userId: string;
  sourceType: "ai" | "google_imported";
  contactNumber: string;
  contactName: string | null;
  status: "scheduled" | "not_scheduled" | "cancelled";
  agreedSchedule: string | null;
  summary: string | null;
  evidence: string[];
  confidence: number;
  scheduledDate: string | null;
  scheduledTime: string | null;
  lastCustomerMessage: string | null;
  lastAgentMessage: string | null;
  lastScheduledAt: string | null;
  lastAnalyzedAt: string | null;
  analysisVersion: string;
  sourceConnectionName: string | null;
  sourceConnectionPhone: string | null;
  sourceAccountName: string | null;
  sourceAccountEmail: string | null;
  rawAnalysis: Record<string, unknown>;
};

type ExistingAgendamento2InsightRow = {
  status: string | null;
  agreed_schedule: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  summary: string | null;
  last_scheduled_at: string | Date | null;
};

type Agendamento2OperationalAppointmentRow = {
  id: string;
  google_event_id: string | null;
  duration_minutes: number | null;
  google_calendar_synced?: boolean | null;
  status?: string | null;
};

type Agendamento2ListParams = {
  userId: string;
  connectionIds: string[];
  query?: string;
  status?: "scheduled" | "cancelled" | "not_scheduled" | "all";
  limit?: number;
  offset?: number;
};

type ImportedGoogleAppointmentListRow = {
  id: string;
  user_id: string;
  client_name: string | null;
  client_phone: string | null;
  service_name: string | null;
  appointment_date: string | null;
  start_time: string | null;
  status: string | null;
  client_notes: string | null;
  location: string | null;
  updated_at: string | Date | null;
  created_at: string | Date | null;
  google_event_id: string | null;
};

export type Agendamento2PromptContext = {
  displayName: string | null;
  agendaPrompt: string | null;
  agendaHoursContext: string | null;
  currentBrazilTime: string | null;
  syncedAgendaContext: string | null;
  entries: Array<{
    contactName: string | null;
    contactNumber: string;
    agreedSchedule: string | null;
    scheduledDate: string | null;
    scheduledTime: string | null;
    summary: string | null;
  }>;
};

const pendingAgendamento2Analysis = new Map<string, Promise<Agendamento2InsightRecord | null>>();

function getMessageBody(message?: Agendamento2MessageContextRow | null) {
  return trimText(message?.text || message?.media_caption || "", 600);
}

function formatTranscriptTimestamp(value?: Date | string | null) {
  if (!value) return "sem horario";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem horario";

  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTranscript(messages: Agendamento2MessageContextRow[]) {
  return messages
    .map((message) => {
      const body = getMessageBody(message) || "(sem texto)";
      const speaker = message.from_me ? (message.is_from_agent ? "IA" : "DONO") : "CLIENTE";
      return `[${formatTranscriptTimestamp(message.timestamp)}] ${speaker}: ${body}`;
    })
    .join("\n");
}

function formatBrazilNow() {
  return new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBrazilDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPromptDateTimeLabel(dateKey: string, timeValue?: string | null) {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return timeValue ? `${dateKey} ${String(timeValue).trim()}` : dateKey;
  }

  const dateLabel = date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

  const normalizedTime = String(timeValue || "").trim();
  return normalizedTime ? `${dateLabel} ${normalizedTime}` : dateLabel;
}

function normalizeClockValue(value?: string | null) {
  const parts = String(value || "").trim().split(":");
  const hour = Number(parts[0]);
  const minute = Number(parts[1] || 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addMinutesToClock(timeValue: string, minutesToAdd: number) {
  const parts = timeValue.split(":");
  const hour = Number(parts[0]);
  const minute = Number(parts[1] || 0);
  const totalMinutes = Math.max(0, hour * 60 + minute + minutesToAdd);
  const normalized = totalMinutes % (24 * 60);
  const nextHour = Math.floor(normalized / 60);
  const nextMinute = normalized % 60;
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

type OperationalAppointmentRow = {
  client_name: string | null;
  client_phone: string | null;
  service_name: string | null;
  appointment_date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  google_event_id: string | null;
  google_calendar_event_id: string | null;
};

async function getUpcomingOperationalAppointments(userId: string) {
  const brazilNowParts = getBrazilTimeParts();
  const startDate = new Date(
    brazilNowParts.year,
    brazilNowParts.month - 1,
    brazilNowParts.day,
    0,
    0,
    0,
    0,
  );
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 14);

  const result = await db.execute(sql`
    SELECT
      client_name,
      client_phone,
      service_name,
      appointment_date,
      start_time,
      end_time,
      status,
      google_event_id,
      google_calendar_event_id
    FROM appointments
    WHERE user_id = ${userId}
      AND appointment_date BETWEEN ${formatBrazilDateKey(startDate)} AND ${formatBrazilDateKey(endDate)}
      AND status IN ('pending', 'confirmed')
    ORDER BY appointment_date ASC, start_time ASC
    LIMIT 24
  `);

  return (((result as any)?.rows || []) as OperationalAppointmentRow[]).map((row) => ({
    client_name: row.client_name ? String(row.client_name) : null,
    client_phone: row.client_phone ? String(row.client_phone) : null,
    service_name: row.service_name ? String(row.service_name) : null,
    appointment_date: row.appointment_date ? String(row.appointment_date) : null,
    start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
    end_time: row.end_time ? String(row.end_time).slice(0, 5) : null,
    status: row.status ? String(row.status) : null,
    google_event_id: row.google_event_id ? String(row.google_event_id) : null,
    google_calendar_event_id: row.google_calendar_event_id ? String(row.google_calendar_event_id) : null,
  }));
}

async function buildSyncedAgendaContext(userId: string) {
  const internalAppointments = await getUpcomingOperationalAppointments(userId);
  const internalEventIds = new Set(
    internalAppointments
      .flatMap((row) => [row.google_event_id, row.google_calendar_event_id])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );

  const sections: string[] = [];

  if (internalAppointments.length > 0) {
    const internalLines = internalAppointments.map((row, index) => {
      const displayName = resolveAgendamento2ContactName({
        contactName: row.client_name,
        contactNumber: row.client_phone,
        summary: row.service_name,
      });
      const timeLabel = formatPromptDateTimeLabel(row.appointment_date || "", row.start_time);
      const endTime = String(row.end_time || "").trim();
      const periodLabel = endTime ? `${timeLabel}-${endTime}` : timeLabel;
      const serviceLabel = trimText(String(row.service_name || "agendamento"), 80) || "agendamento";
      return `${index + 1}. interno | ${periodLabel} | ${displayName} | ${serviceLabel}`;
    });

    sections.push(`AGENDA INTERNA ATUAL:\n${internalLines.join("\n")}`);
  }

  let externalSection = "";
  if (await isGoogleCalendarConnected(userId)) {
    const brazilNowParts = getBrazilTimeParts();
    const rangeStart = `${String(brazilNowParts.year).padStart(4, "0")}-${String(brazilNowParts.month).padStart(2, "0")}-${String(brazilNowParts.day).padStart(2, "0")}T00:00:00`;
    const rangeEndDate = new Date(
      brazilNowParts.year,
      brazilNowParts.month - 1,
      brazilNowParts.day,
      23,
      59,
      59,
      0,
    );
    rangeEndDate.setDate(rangeEndDate.getDate() + 14);
    const rangeEnd = `${formatBrazilDateKey(rangeEndDate)}T23:59:59`;

    const busyResult = await listCalendarBusyWindows(userId, rangeStart, rangeEnd);
    if (busyResult.success && Array.isArray(busyResult.windows)) {
      const windows = busyResult.windows
        .filter((window) => {
          const eventId = String(window.eventId || "").trim();
          return !eventId || !internalEventIds.has(eventId);
        })
        .slice(0, 24);

      if (windows.length > 0) {
        const externalLines = windows.map((window, index) => {
          const startDate = new Date(window.startDateTime);
          const endDate = new Date(window.endDateTime);
          const startLabel = Number.isNaN(startDate.getTime())
            ? String(window.startDateTime)
            : startDate.toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                weekday: "short",
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });
          const endLabel = Number.isNaN(endDate.getTime())
            ? String(window.endDateTime)
            : endDate.toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                hour: "2-digit",
                minute: "2-digit",
              });
          const summary = trimText(String(window.summary || "bloqueio externo"), 90) || "bloqueio externo";
          return `${index + 1}. google-direto | ${startLabel}-${endLabel} | ${summary}`;
        });

        externalSection = `EVENTOS E BLOQUEIOS EXTERNOS (GOOGLE DIRETO):\n${externalLines.join("\n")}`;
      } else {
        externalSection = "EVENTOS E BLOQUEIOS EXTERNOS (GOOGLE DIRETO):\nSem bloqueios extras no periodo.";
      }
    } else if (busyResult.error) {
      externalSection = `EVENTOS E BLOQUEIOS EXTERNOS (GOOGLE DIRETO):\nSnapshot indisponivel agora: ${trimText(busyResult.error, 120)}`;
    }
  }

  if (externalSection) {
    sections.push(externalSection);
  }

  if (!sections.length) {
    return null;
  }

  return sections.join("\n\n");
}

function isSimulatorLabel(value?: string | null) {
  const text = String(value || "").trim();
  return text === "Visitante" || text.startsWith("sim-");
}

function stripSimpleMarkdown(value?: string | null) {
  return String(value || "").split("**").join("").trim();
}

function takeBeforeAny(value: string, markers: string[]) {
  let endIndex = -1;
  for (const marker of markers) {
    const index = value.indexOf(marker);
    if (index > 0 && (endIndex === -1 || index < endIndex)) {
      endIndex = index;
    }
  }
  return endIndex > 0 ? value.slice(0, endIndex) : value;
}

function deriveContactNameFromSummary(summary?: string | null) {
  const text = stripSimpleMarkdown(summary);
  const starts = ["Cliente ", "cliente "];
  const ends = [
    " confirmou",
    " confirmou agendamento",
    " agendou",
    " fechou",
    " solicitou",
  ];

  for (const start of starts) {
    const startIndex = text.indexOf(start);
    if (startIndex < 0) continue;

    const candidate = takeBeforeAny(text.slice(startIndex + start.length), ends).trim();
    if (candidate.length >= 3 && candidate.length <= 80) {
      return candidate;
    }
  }

  return null;
}

function resolveAgendamento2ContactName(params: {
  contactName?: string | null;
  contactNumber?: string | null;
  summary?: string | null;
}) {
  const storedName = String(params.contactName || "").trim();
  if (storedName && !isSimulatorLabel(storedName)) {
    return storedName;
  }

  const extractedName = deriveContactNameFromSummary(params.summary);
  if (extractedName) {
    return extractedName;
  }

  return resolveLeadDisplayName(params.contactName || null, params.contactNumber || "");
}

function mapInsightRow(row: Record<string, any>): Agendamento2InsightRecord {
  const rawEvidence = Array.isArray(row.evidence_json)
    ? row.evidence_json
    : Array.isArray(row.evidence)
      ? row.evidence
      : [];

  const summary = row.summary ? String(row.summary) : null;
  const contactNumber = String(row.contact_number || "");
  const contactName = resolveAgendamento2ContactName({
    contactName: row.contact_name ? String(row.contact_name) : null,
    contactNumber,
    summary,
  });

  return {
    id: String(row.id || ""),
    conversationId: String(row.conversation_id || ""),
    connectionId: String(row.connection_id || ""),
    userId: String(row.user_id || ""),
    sourceType: row.source_type === "google_imported" ? "google_imported" : "ai",
    contactNumber,
    contactName,
    status: (row.status || "not_scheduled") as Agendamento2InsightRecord["status"],
    agreedSchedule: row.agreed_schedule ? String(row.agreed_schedule) : null,
    summary,
    evidence: rawEvidence.map((entry: unknown) => String(entry)).filter(Boolean),
    confidence: Number(row.confidence || 0),
    scheduledDate: row.scheduled_date ? String(row.scheduled_date) : null,
    scheduledTime: row.scheduled_time ? String(row.scheduled_time) : null,
    lastCustomerMessage: row.last_customer_message ? String(row.last_customer_message) : null,
    lastAgentMessage: row.last_agent_message ? String(row.last_agent_message) : null,
    lastScheduledAt: row.last_scheduled_at ? new Date(row.last_scheduled_at).toISOString() : null,
    lastAnalyzedAt: row.last_analyzed_at ? new Date(row.last_analyzed_at).toISOString() : null,
    analysisVersion: String(row.analysis_version || AGENDAMENTO2_ANALYSIS_VERSION),
    sourceConnectionName: row.source_connection_name ? String(row.source_connection_name) : null,
    sourceConnectionPhone: row.source_connection_phone ? String(row.source_connection_phone) : null,
    sourceAccountName: row.source_account_name ? String(row.source_account_name) : null,
    sourceAccountEmail: row.source_account_email ? String(row.source_account_email) : null,
    rawAnalysis:
      row.raw_analysis && typeof row.raw_analysis === "object"
        ? (row.raw_analysis as Record<string, unknown>)
        : {},
  };
}

function compareAgendamento2AgendaItems(
  left: Pick<Agendamento2InsightRecord, "scheduledDate" | "scheduledTime" | "lastScheduledAt" | "id">,
  right: Pick<Agendamento2InsightRecord, "scheduledDate" | "scheduledTime" | "lastScheduledAt" | "id">,
) {
  const leftDateRank = left.scheduledDate ? 0 : 1;
  const rightDateRank = right.scheduledDate ? 0 : 1;
  if (leftDateRank !== rightDateRank) {
    return leftDateRank - rightDateRank;
  }

  const dateCompare = String(left.scheduledDate || "").localeCompare(String(right.scheduledDate || ""));
  if (dateCompare !== 0) {
    return dateCompare;
  }

  const timeCompare = String(left.scheduledTime || "").localeCompare(String(right.scheduledTime || ""));
  if (timeCompare !== 0) {
    return timeCompare;
  }

  const leftScheduledAt = left.lastScheduledAt ? new Date(left.lastScheduledAt).getTime() : 0;
  const rightScheduledAt = right.lastScheduledAt ? new Date(right.lastScheduledAt).getTime() : 0;
  if (leftScheduledAt !== rightScheduledAt) {
    return rightScheduledAt - leftScheduledAt;
  }

  return String(left.id).localeCompare(String(right.id));
}

async function listImportedGoogleAppointmentsForOperationalAgenda(params: {
  userId: string;
  query?: string;
  status?: "scheduled" | "cancelled" | "not_scheduled" | "all";
}): Promise<Agendamento2InsightRecord[]> {
  if (params.status === "not_scheduled") {
    return [];
  }

  const safeQuery = trimText(params.query || "", 120);
  const queryParts: any[] = [
    sql`user_id = ${params.userId}`,
    sql`conversation_id IS NULL`,
    sql`internal_notes LIKE '[GOOGLE_IMPORTED]%'`,
  ];

  if (params.status === "cancelled") {
    queryParts.push(sql`COALESCE(status, 'pending') = 'cancelled'`);
  } else if (params.status !== "all") {
    queryParts.push(sql`COALESCE(status, 'pending') IN ('pending', 'confirmed')`);
  }

  if (safeQuery.length > 0) {
    const likeTerm = `%${safeQuery}%`;
    queryParts.push(sql`(
      COALESCE(client_name, '') ILIKE ${likeTerm}
      OR COALESCE(service_name, '') ILIKE ${likeTerm}
      OR COALESCE(client_notes, '') ILIKE ${likeTerm}
      OR COALESCE(location, '') ILIKE ${likeTerm}
      OR COALESCE(appointment_date::text, '') ILIKE ${likeTerm}
      OR COALESCE(LEFT(start_time::text, 5), '') ILIKE ${likeTerm}
    )`);
  }

  const whereClause = sql.join(queryParts, sql` AND `);
  const result = await db.execute(sql`
    SELECT
      id,
      user_id,
      client_name,
      client_phone,
      service_name,
      appointment_date,
      start_time,
      status,
      client_notes,
      location,
      updated_at,
      created_at,
      google_event_id
    FROM appointments
    WHERE ${whereClause}
  `);

  return (((result as any)?.rows || []) as ImportedGoogleAppointmentListRow[]).map((row) => {
    const displayName = trimText(
      String(row.client_name || row.service_name || row.client_notes || "Compromisso Google"),
      160,
    );
    const locationEvidence = trimText(String(row.location || ""), 160);
    const eventIdEvidence = trimText(String(row.google_event_id || ""), 120);
    const effectiveStatus = String(row.status || "").trim().toLowerCase() === "cancelled" ? "cancelled" : "scheduled";
    const updatedAt = row.updated_at || row.created_at;

    return {
      id: `google-imported:${String(row.id || "")}`,
      conversationId: "",
      connectionId: "__google_calendar__",
      userId: String(row.user_id || params.userId),
      sourceType: "google_imported",
      contactNumber: String(row.client_phone || ""),
      contactName: displayName || "Compromisso Google",
      status: effectiveStatus as Agendamento2InsightRecord["status"],
      agreedSchedule: "Evento externo criado no Google Calendar",
      summary: trimText(
        String(row.client_notes || row.service_name || row.client_name || "Compromisso importado do Google Calendar."),
        500,
      ),
      evidence: [
        "Origem: Google Calendar",
        locationEvidence ? `Local: ${locationEvidence}` : "",
        eventIdEvidence ? `Evento: ${eventIdEvidence}` : "",
      ].filter(Boolean),
      confidence: 1,
      scheduledDate: row.appointment_date ? String(row.appointment_date) : null,
      scheduledTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
      lastCustomerMessage: null,
      lastAgentMessage: null,
      lastScheduledAt: updatedAt ? new Date(updatedAt).toISOString() : null,
      lastAnalyzedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
      analysisVersion: "google-imported",
      sourceConnectionName: "Google Calendar",
      sourceConnectionPhone: null,
      sourceAccountName: null,
      sourceAccountEmail: null,
      rawAnalysis: {
        origin: "google_imported",
        appointmentId: String(row.id || ""),
        googleEventId: String(row.google_event_id || ""),
      },
    };
  });
}

export async function getAgendamento2RuntimeState(userId: string) {
  const [
    agendamento2ConfigResult,
    schedulingConfigResult,
    salonConfigResult,
    providerConfigResult,
    clinicConfigResult,
    courseConfigResult,
  ] = await Promise.all([
    supabase
      .from("agendamento2_config")
      .select("is_active, send_to_ai, display_name, agenda_prompt, agenda_hours_context, scheduling_tracker_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("scheduling_config").select("is_enabled").eq("user_id", userId).maybeSingle(),
    supabase.from("salon_config").select("is_active").eq("user_id", userId).maybeSingle(),
    supabase.from("provider_config").select("is_active").eq("user_id", userId).maybeSingle(),
    supabase.from("clinic_config").select("is_active").eq("user_id", userId).maybeSingle(),
    supabase.from("course_config").select("is_active").eq("user_id", userId).maybeSingle(),
  ]);

  const trackerRequested = agendamento2ConfigResult.data?.scheduling_tracker_enabled === true;
  const moduleActive = agendamento2ConfigResult.data?.is_active === true || trackerRequested;
  const hasConflictingModule =
    !!salonConfigResult.data?.is_active ||
    !!providerConfigResult.data?.is_active ||
    !!clinicConfigResult.data?.is_active ||
    !!courseConfigResult.data?.is_active;

  return {
    moduleActive,
    trackerRequested,
    hasSharedOperationalBase: !!schedulingConfigResult.data?.is_enabled,
    hasConflictingModule,
    trackingEnabled: moduleActive && trackerRequested && !hasConflictingModule,
    config: agendamento2ConfigResult.data || null,
  };
}

export async function getAgendamento2PromptContext(userId: string): Promise<Agendamento2PromptContext | null> {
  const runtimeState = await getAgendamento2RuntimeState(userId);
  const config = runtimeState.config;
  if (!config || config.send_to_ai === false || !runtimeState.trackingEnabled) {
    return null;
  }

  const result = await db.execute(sql`
    SELECT
      contact_name,
      contact_number,
      agreed_schedule,
      scheduled_date,
      scheduled_time,
      summary
    FROM agendamento2_insights
    WHERE user_id = ${userId}
      AND status = 'scheduled'
      AND scheduled_date IS NOT NULL
      AND to_date(scheduled_date, 'YYYY-MM-DD')
        BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
        AND ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date + INTERVAL '30 days')::date
      AND (
        to_date(scheduled_date, 'YYYY-MM-DD') > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
        OR (
          to_date(scheduled_date, 'YYYY-MM-DD') = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
          AND (
            scheduled_time IS NULL
            OR scheduled_time::time >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::time
          )
        )
      )
    ORDER BY
      CASE WHEN scheduled_date IS NULL THEN 1 ELSE 0 END,
      scheduled_date ASC NULLS LAST,
      scheduled_time ASC NULLS LAST,
      updated_at DESC
    LIMIT 60
  `);

  const entries = (((result as any)?.rows || []) as Array<Record<string, any>>).map((row) => {
    const summary = row.summary ? String(row.summary) : null;
    const contactNumber = String(row.contact_number || "");

    return {
      contactName: resolveAgendamento2ContactName({
        contactName: row.contact_name ? String(row.contact_name) : null,
        contactNumber,
        summary,
      }),
      contactNumber,
      agreedSchedule: row.agreed_schedule ? String(row.agreed_schedule) : null,
      scheduledDate: row.scheduled_date ? String(row.scheduled_date) : null,
      scheduledTime: row.scheduled_time ? String(row.scheduled_time) : null,
      summary,
    };
  });

  return {
    displayName: config.display_name ? String(config.display_name) : "Agendamento 2.0",
    agendaPrompt: config.agenda_prompt ? String(config.agenda_prompt) : null,
    agendaHoursContext: config.agenda_hours_context ? String(config.agenda_hours_context) : null,
    currentBrazilTime: formatBrazilNow(),
    syncedAgendaContext: await buildSyncedAgendaContext(userId),
    entries,
  };
}

async function getConversationContext(conversationId: string) {
  const conversationResult = await db.execute(sql`
    SELECT
      c.id AS conversation_id,
      c.connection_id,
      wc.user_id,
      c.contact_number,
      c.contact_name,
      wc.connection_name,
      wc.phone_number AS source_phone_number,
      u.name AS source_account_name,
      u.email AS source_account_email
    FROM conversations c
    INNER JOIN whatsapp_connections wc ON wc.id = c.connection_id
    INNER JOIN users u ON u.id = wc.user_id
    WHERE c.id = ${conversationId}
    LIMIT 1
  `);

  const conversationRow = (conversationResult as any)?.rows?.[0] as
    | Agendamento2ConversationContextRow
    | undefined;
  if (!conversationRow) return null;

  const messagesResult = await db.execute(sql`
    SELECT
      from_me,
      is_from_agent,
      text,
      media_caption,
      timestamp
    FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY timestamp DESC
    LIMIT 30
  `);

  const messages = (((messagesResult as any)?.rows || []) as Agendamento2MessageContextRow[]).reverse();

  return {
    conversation: conversationRow,
    messages,
  };
}

function buildInsightPrompt(params: {
  conversation: Agendamento2ConversationContextRow;
  messages: Agendamento2MessageContextRow[];
  latestAgentReply: string;
  previousInsight: ExistingAgendamento2InsightRow | null;
}) {
  const transcript = formatTranscript(params.messages);
  const previousStatus = trimText(params.previousInsight?.status || "", 40);
  const previousSchedule = trimText(params.previousInsight?.agreed_schedule || "", 180);
  const previousDate = trimText(params.previousInsight?.scheduled_date || "", 20);
  const previousTime = trimText(params.previousInsight?.scheduled_time || "", 10);
  const nowInBrazil = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return [
    "Analise internamente se esta conversa fechou um agendamento de atendimento, visita, servico, reuniao, avaliacao ou compromisso equivalente.",
    "O objetivo e registrar em paralelo apenas o que ficou realmente combinado, sem criar logica operacional nova.",
    "Interesse, duvida, pedido de disponibilidade, consulta de agenda, pergunta sobre horario ou sugestao ainda nao contam como agendamento fechado.",
    "So use status scheduled quando houver confirmacao clara do cliente para data, horario ou periodo realmente combinado.",
    "Se a IA apenas ofereceu um horario e o cliente nao aceitou de forma objetiva, use not_scheduled.",
    "Se ja houve um agendamento claro antes e nada foi cancelado explicitamente, mantenha status scheduled.",
    "So use status cancelled quando houver cancelamento, desistencia ou remarcacao negada de forma clara e explicita na conversa.",
    "Nao trate critica, correcao de cadastro, falta de endereco ou pendencia operacional como cancelamento automatico.",
    "Interesse, consulta de agenda, pedido de horario, duvida ou sugestao ainda nao contam como agendamento fechado.",
    "Se houve confirmacao clara de data e horario, use status scheduled.",
    "Se houve cancelamento ou desistência clara do combinado atual, use status cancelled.",
    "Se houver remarcacao com novo combinado claro, mantenha status scheduled com o horario mais recente.",
    "Use a hora atual do Brasil e os timestamps da conversa para nao tratar horario passado como agendamento valido de hoje.",
    "Todos os textos devem ser curtos, objetivos e em uma unica linha.",
    "summary deve ter ate 220 caracteres.",
    "agreedSchedule deve resumir o combinado em linguagem natural, sem inventar horario.",
    "scheduledDate deve ser YYYY-MM-DD ou null.",
    "scheduledTime deve ser HH:mm ou null.",
    "Se a conversa fechou so periodo sem horario exato, deixe scheduledTime como null.",
    "Nunca invente data, horario, endereco ou pagamento que nao estejam sustentados pela conversa.",
    "Retorne somente JSON valido com estas chaves exatas:",
    "{",
    '  "hasScheduledConversation": boolean,',
    '  "status": "scheduled" | "not_scheduled" | "cancelled",',
    '  "agreedSchedule": string | null,',
    '  "scheduledDate": string | null,',
    '  "scheduledTime": string | null,',
    '  "summary": string,',
    '  "evidence": string[],',
    '  "followUpQuestionSuggestion": string | null,',
    '  "confidence": number',
    "}",
    "",
    `AGORA_NO_BRASIL: ${nowInBrazil}`,
    `CONVERSA_ID: ${params.conversation.conversation_id}`,
    `CONTATO: ${resolveLeadDisplayName(params.conversation.contact_name, params.conversation.contact_number)}`,
    `TELEFONE: ${params.conversation.contact_number}`,
    `ULTIMA_RESPOSTA_DA_IA: ${trimText(params.latestAgentReply, 400) || "(sem resposta)"}`,
    `STATUS_ANTERIOR: ${previousStatus || "(sem status anterior)"}`,
    `COMBINADO_ANTERIOR: ${previousSchedule || "(sem combinado anterior)"}`,
    `DATA_ANTERIOR: ${previousDate || "(sem data anterior)"}`,
    `HORARIO_ANTERIOR: ${previousTime || "(sem horario anterior)"}`,
    "",
    "TRANSCRICAO:",
    transcript || "(sem mensagens)",
  ].join("\n");
}

async function requestStrictInsightJson(params: {
  conversation: Agendamento2ConversationContextRow;
  messages: Agendamento2MessageContextRow[];
  latestAgentReply: string;
  previousInsight: ExistingAgendamento2InsightRow | null;
}) {
  const completion = await chatComplete({
    messages: [
      {
        role: "system",
        content:
          "Voce corrige respostas JSON para uso interno. Retorne apenas um unico objeto JSON valido, minificado e sem comentarios.",
      },
      {
        role: "user",
        content: [
          buildInsightPrompt(params),
          "",
          "Retorne agora apenas um JSON valido e minificado, sem markdown e sem texto adicional.",
        ].join("\n"),
      },
    ],
    maxTokens: 320,
    temperature: 0,
    skipMistralQueue: true,
  });

  const rawText = String(completion.choices?.[0]?.message?.content || "").trim();
  if (!rawText) {
    throw new Error("A IA nao retornou JSON estrito do Agendamento 2.0");
  }

  return rawText;
}

async function getExistingInsight(conversationId: string) {
  const result = await db.execute(sql`
    SELECT
      status,
      agreed_schedule,
      scheduled_date,
      scheduled_time,
      summary,
      last_scheduled_at
    FROM agendamento2_insights
    WHERE conversation_id = ${conversationId}
    LIMIT 1
  `);

  return ((result as any)?.rows?.[0] || null) as ExistingAgendamento2InsightRow | null;
}

async function getAgendamento2OperationalDefaults(userId: string) {
  const result = await db.execute(sql`
    SELECT
      slot_duration,
      service_name,
      location,
      location_type
    FROM scheduling_config
    WHERE user_id = ${userId}
    LIMIT 1
  `);

  const row = ((result as any)?.rows?.[0] || {}) as Record<string, any>;
  const durationMinutes = Number(row.slot_duration);

  return {
    durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 60,
    serviceName: trimText(String(row.service_name || "Agendamento 2.0"), 180) || "Agendamento 2.0",
    location: trimText(String(row.location || ""), 500) || null,
    locationType: trimText(String(row.location_type || "presencial"), 50) || "presencial",
  };
}

async function findAgendamento2OperationalAppointment(params: {
  userId: string;
  conversationId: string;
  contactNumber: string;
  scheduledDate: string;
  scheduledTime: string;
}) {
  const result = await db.execute(sql`
    SELECT
      id,
      google_event_id,
      duration_minutes,
      google_calendar_synced,
      status
    FROM appointments
    WHERE user_id = ${params.userId}
      AND COALESCE(status, 'pending') IN ('pending', 'confirmed')
      AND (
        conversation_id = ${params.conversationId}
        OR (
          client_phone = ${params.contactNumber}
          AND appointment_date = ${params.scheduledDate}
          AND LEFT(start_time::text, 5) = ${params.scheduledTime}
        )
      )
    ORDER BY
      CASE WHEN conversation_id = ${params.conversationId} THEN 0 ELSE 1 END,
      updated_at DESC NULLS LAST
    LIMIT 1
  `);

  return ((result as any)?.rows?.[0] || null) as Agendamento2OperationalAppointmentRow | null;
}

async function getActiveOperationalAppointmentForInsight(insight: Pick<
  Agendamento2InsightRecord,
  "userId" | "conversationId"
>) {
  const result = await db.execute(sql`
    SELECT
      id,
      google_event_id,
      duration_minutes,
      google_calendar_synced,
      status
    FROM appointments
    WHERE user_id = ${insight.userId}
      AND conversation_id = ${insight.conversationId}
      AND COALESCE(status, 'pending') IN ('pending', 'confirmed')
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  `);

  return ((result as any)?.rows?.[0] || null) as Agendamento2OperationalAppointmentRow | null;
}

async function cancelAgendamento2OperationalAppointment(insight: Agendamento2InsightRecord) {
  const result = await db.execute(sql`
    SELECT
      id,
      google_event_id,
      duration_minutes
    FROM appointments
    WHERE user_id = ${insight.userId}
      AND conversation_id = ${insight.conversationId}
      AND COALESCE(status, 'pending') IN ('pending', 'confirmed')
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  `);

  const appointment = ((result as any)?.rows?.[0] || null) as Agendamento2OperationalAppointmentRow | null;
  if (!appointment) return;

  const googleEventId = String(appointment.google_event_id || "").trim();
  if (googleEventId && await isGoogleCalendarConnected(insight.userId)) {
    const removalResult = await removeAppointmentFromCalendar(insight.userId, googleEventId);
    if (!removalResult.success) {
      console.warn("[AGENDAMENTO 2.0] Nao foi possivel remover evento Google direto:", removalResult.error);
    }
  }

  await db.execute(sql`
    UPDATE appointments
    SET
      status = 'cancelled',
      cancelled_at = NOW(),
      cancelled_by = 'ai',
      cancellation_reason = ${trimText(insight.summary || "Cancelado pelo Agendamento 2.0", 500)},
      google_event_id = NULL,
      google_calendar_synced = false,
      updated_at = NOW()
    WHERE id = ${appointment.id}
  `);
}

async function syncAgendamento2InsightToOperationalAgenda(insight: Agendamento2InsightRecord) {
  if (insight.status === "cancelled") {
    await cancelAgendamento2OperationalAppointment(insight);
    return;
  }

  if (insight.status !== "scheduled" || !insight.scheduledDate || !insight.scheduledTime) {
    return;
  }

  const scheduledTime = normalizeClockValue(insight.scheduledTime);
  const scheduledDate = trimText(insight.scheduledDate, 20);
  if (!scheduledTime || !scheduledDate) return;

  const defaults = await getAgendamento2OperationalDefaults(insight.userId);
  const endTime = addMinutesToClock(scheduledTime, defaults.durationMinutes);
  const clientName = trimText(insight.contactName || insight.contactNumber || "Cliente", 255) || "Cliente";
  const serviceName =
    trimText(insight.agreedSchedule || insight.summary || defaults.serviceName, 180) || defaults.serviceName;
  const clientNotes = trimText(
    [
      insight.agreedSchedule ? `Combinado: ${insight.agreedSchedule}` : "",
      insight.summary ? `Resumo: ${insight.summary}` : "",
    ].filter(Boolean).join("\n"),
    1000,
  ) || null;
  const operationalContext = {
    source: "agendamento2",
    insightId: insight.id,
    conversationId: insight.conversationId,
    agreedSchedule: insight.agreedSchedule,
    summary: insight.summary,
    evidence: insight.evidence,
  };

  const existingAppointment = await findAgendamento2OperationalAppointment({
    userId: insight.userId,
    conversationId: insight.conversationId,
    contactNumber: insight.contactNumber,
    scheduledDate,
    scheduledTime,
  });

  const writeResult = existingAppointment
    ? await db.execute(sql`
        UPDATE appointments
        SET
          client_name = ${clientName},
          client_phone = ${insight.contactNumber},
          service_name = ${serviceName},
          appointment_date = ${scheduledDate},
          start_time = ${scheduledTime},
          end_time = ${endTime},
          duration_minutes = ${defaults.durationMinutes},
          location = ${defaults.location},
          location_type = ${defaults.locationType},
          conversation_id = ${insight.conversationId},
          status = 'confirmed',
          confirmed_by_client = true,
          confirmed_by_business = true,
          confirmed_at = COALESCE(confirmed_at, NOW()),
          created_by_ai = true,
          client_notes = ${clientNotes},
          ai_conversation_context = ${JSON.stringify(operationalContext)}::jsonb,
          updated_at = NOW()
        WHERE id = ${existingAppointment.id}
        RETURNING id, google_event_id, duration_minutes
      `)
    : await db.execute(sql`
        INSERT INTO appointments (
          user_id,
          client_name,
          client_phone,
          service_name,
          appointment_date,
          start_time,
          end_time,
          duration_minutes,
          location,
          location_type,
          conversation_id,
          status,
          confirmed_by_client,
          confirmed_by_business,
          confirmed_at,
          created_by_ai,
          client_notes,
          reminder_sent,
          ai_conversation_context
        ) VALUES (
          ${insight.userId},
          ${clientName},
          ${insight.contactNumber},
          ${serviceName},
          ${scheduledDate},
          ${scheduledTime},
          ${endTime},
          ${defaults.durationMinutes},
          ${defaults.location},
          ${defaults.locationType},
          ${insight.conversationId},
          'confirmed',
          true,
          true,
          NOW(),
          true,
          ${clientNotes},
          false,
          ${JSON.stringify(operationalContext)}::jsonb
        )
        RETURNING id, google_event_id, duration_minutes
      `);

  const appointment = ((writeResult as any)?.rows?.[0] || null) as Agendamento2OperationalAppointmentRow | null;
  if (!appointment || !(await isGoogleCalendarConnected(insight.userId))) {
    return;
  }

  const syncResult = await syncAppointmentToCalendar(
    insight.userId,
    {
      id: appointment.id,
      clientName,
      clientPhone: insight.contactNumber,
      appointmentDate: scheduledDate,
      appointmentTime: scheduledTime,
      serviceName,
      notes: clientNotes || undefined,
      googleEventId: appointment.google_event_id || undefined,
      location: defaults.location || undefined,
      extraDetails: [
        "Origem: Agendamento 2.0",
        insight.conversationId ? `Conversa: ${insight.conversationId}` : "",
      ].filter(Boolean),
    },
    appointment.duration_minutes || defaults.durationMinutes,
  );

  if (!syncResult.success || !syncResult.eventId) {
    console.warn("[AGENDAMENTO 2.0] Nao foi possivel sincronizar com Google direto:", syncResult.error);
    return;
  }

  await db.execute(sql`
    UPDATE appointments
    SET
      google_event_id = ${syncResult.eventId},
      google_calendar_synced = true,
      updated_at = NOW()
    WHERE id = ${appointment.id}
  `);
}

async function reconcileAgendamento2OperationalSync(insights: Agendamento2InsightRecord[]) {
  const scheduledInsights = insights.filter(
    (insight) => insight.status === "scheduled" && insight.scheduledDate && insight.scheduledTime,
  );
  if (scheduledInsights.length === 0) {
    return;
  }

  const googleConnectionCache = new Map<string, boolean>();

  for (const insight of scheduledInsights) {
    try {
      const activeAppointment = await getActiveOperationalAppointmentForInsight(insight);
      const googleConnected = googleConnectionCache.has(insight.userId)
        ? googleConnectionCache.get(insight.userId) === true
        : await isGoogleCalendarConnected(insight.userId);

      if (!googleConnectionCache.has(insight.userId)) {
        googleConnectionCache.set(insight.userId, googleConnected);
      }

      const needsAppointmentRepair = !activeAppointment;
      const needsGoogleRepair =
        googleConnected &&
        Boolean(activeAppointment) &&
        (
          !trimText(activeAppointment?.google_event_id || "", 200) ||
          activeAppointment?.google_calendar_synced !== true
        );

      if (!needsAppointmentRepair && !needsGoogleRepair) {
        continue;
      }

      await syncAgendamento2InsightToOperationalAgenda(insight);
    } catch (error) {
      console.warn("[AGENDAMENTO 2.0] Falha ao reconciliar sync operacional:", {
        conversationId: insight.conversationId,
        error,
      });
    }
  }
}

async function analyzeConversation(params: {
  conversationId: string;
  latestAgentReply?: string;
}) {
  const context = await getConversationContext(params.conversationId);
  if (!context) return null;

  const runtimeState = await getAgendamento2RuntimeState(context.conversation.user_id);
  if (!runtimeState.trackingEnabled) return null;

  const previousInsight = await getExistingInsight(params.conversationId);
  const latestAgentReply = trimText(
    params.latestAgentReply || getMessageBody(context.messages[context.messages.length - 1]),
    400,
  );

  const completion = await chatComplete({
    messages: [
      {
        role: "system",
        content:
          "Voce atua como auditor interno de agendamentos fechados. Nunca escreva nada fora do JSON solicitado.",
      },
      {
        role: "user",
        content: buildInsightPrompt({
          conversation: context.conversation,
          messages: context.messages,
          latestAgentReply,
          previousInsight,
        }),
      },
    ],
    maxTokens: 420,
    temperature: 0.1,
    skipMistralQueue: true,
  });

  const rawText = String(completion.choices?.[0]?.message?.content || "").trim();
  if (!rawText) {
    throw new Error("A IA nao retornou classificacao do Agendamento 2.0");
  }

  let parsed: ReturnType<typeof parseAgendamento2Insight>;
  try {
    parsed = parseAgendamento2Insight(rawText);
  } catch (_error) {
    const strictRawText = await requestStrictInsightJson({
      conversation: context.conversation,
      messages: context.messages,
      latestAgentReply,
      previousInsight,
    });
    parsed = parseAgendamento2Insight(strictRawText);
  }

  const normalized = normalizeParsedAgendamento2Insight(parsed, previousInsight);
  const resolvedContactName = resolveAgendamento2ContactName({
    contactName: context.conversation.contact_name,
    contactNumber: context.conversation.contact_number,
    summary: normalized.summary,
  });

  const shouldStampScheduleAt =
    normalized.status === "scheduled" &&
    (
      previousInsight?.status !== "scheduled" ||
      previousInsight?.agreed_schedule !== normalized.agreedSchedule ||
      previousInsight?.scheduled_date !== normalized.scheduledDate ||
      previousInsight?.scheduled_time !== normalized.scheduledTime
    );

  const upsertResult = await db.execute(sql`
    INSERT INTO agendamento2_insights (
      conversation_id,
      connection_id,
      user_id,
      contact_number,
      contact_name,
      status,
      agreed_schedule,
      scheduled_date,
      scheduled_time,
      summary,
      evidence_json,
      confidence,
      last_customer_message,
      last_agent_message,
      last_scheduled_at,
      last_analyzed_at,
      raw_analysis,
      analysis_version,
      updated_at
    ) VALUES (
      ${context.conversation.conversation_id},
      ${context.conversation.connection_id},
      ${context.conversation.user_id},
      ${context.conversation.contact_number},
      ${resolvedContactName},
      ${normalized.status},
      ${normalized.agreedSchedule},
      ${normalized.scheduledDate},
      ${normalized.scheduledTime},
      ${normalized.summary},
      ${JSON.stringify(normalized.evidence)}::jsonb,
      ${normalized.confidence},
      ${getMessageBody(context.messages.filter((message) => !message.from_me).slice(-1)[0]) || null},
      ${latestAgentReply || null},
      ${shouldStampScheduleAt ? new Date() : previousInsight?.last_scheduled_at || null},
      ${new Date()},
      ${JSON.stringify({
        ...normalized,
        latestAgentReply,
        source: "agendamento2",
      })}::jsonb,
      ${AGENDAMENTO2_ANALYSIS_VERSION},
      ${new Date()}
    )
    ON CONFLICT (conversation_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      agreed_schedule = EXCLUDED.agreed_schedule,
      scheduled_date = EXCLUDED.scheduled_date,
      scheduled_time = EXCLUDED.scheduled_time,
      summary = EXCLUDED.summary,
      evidence_json = EXCLUDED.evidence_json,
      confidence = EXCLUDED.confidence,
      last_customer_message = EXCLUDED.last_customer_message,
      last_agent_message = EXCLUDED.last_agent_message,
      last_scheduled_at = COALESCE(EXCLUDED.last_scheduled_at, agendamento2_insights.last_scheduled_at),
      last_analyzed_at = EXCLUDED.last_analyzed_at,
      raw_analysis = EXCLUDED.raw_analysis,
      analysis_version = EXCLUDED.analysis_version,
      updated_at = EXCLUDED.updated_at
    RETURNING *
  `);

  const row = ((upsertResult as any)?.rows?.[0] || null) as Record<string, any> | null;
  if (!row) return null;

  const insight = mapInsightRow(row);
  try {
    await syncAgendamento2InsightToOperationalAgenda(insight);
  } catch (syncError) {
    console.warn("[AGENDAMENTO 2.0] Falha ao espelhar insight na agenda operacional:", syncError);
  }
  return insight;
}

function normalizeParsedAgendamento2Insight(
  parsed: ReturnType<typeof parseAgendamento2Insight>,
  previousInsight: ExistingAgendamento2InsightRow | null,
) {
  if (previousInsight?.status === "scheduled" && parsed.status === "not_scheduled") {
    return {
      ...parsed,
      status: "scheduled" as const,
      agreedSchedule: parsed.agreedSchedule || previousInsight.agreed_schedule || null,
      summary:
        parsed.summary ||
        trimText(previousInsight.summary || "Agendamento confirmado anteriormente nesta conversa.", 260),
      scheduledDate: parsed.scheduledDate || previousInsight.scheduled_date || null,
      scheduledTime: parsed.scheduledTime || previousInsight.scheduled_time || null,
    };
  }

  if (parsed.status === "scheduled" && !parsed.agreedSchedule && previousInsight?.agreed_schedule) {
    return {
      ...parsed,
      agreedSchedule: trimText(previousInsight.agreed_schedule, 180) || null,
      scheduledDate: parsed.scheduledDate || previousInsight.scheduled_date || null,
      scheduledTime: parsed.scheduledTime || previousInsight.scheduled_time || null,
    };
  }

  return {
    ...parsed,
    agreedSchedule:
      parsed.agreedSchedule ||
      previousInsight?.agreed_schedule ||
      null,
    scheduledDate:
      parsed.status === "scheduled"
        ? parsed.scheduledDate || previousInsight?.scheduled_date || null
        : null,
    scheduledTime:
      parsed.status === "scheduled"
        ? parsed.scheduledTime || previousInsight?.scheduled_time || null
        : null,
  };
}

export async function listAgendamento2Insights(params: Agendamento2ListParams) {
  const safeStatus = params.status || "scheduled";
  const safeQuery = trimText(params.query || "", 120);
  const limit = Math.max(1, Math.min(params.limit || 100, 200));
  const offset = Math.max(0, params.offset || 0);
  const mergedWindowLimit = Math.max(limit, offset + limit);

  if (params.connectionIds.length === 0) {
    const importedOnlyData = (await listImportedGoogleAppointmentsForOperationalAgenda({
      userId: params.userId,
      query: safeQuery,
      status: safeStatus,
    })).sort(compareAgendamento2AgendaItems);

    return {
      data: importedOnlyData.slice(offset, offset + limit),
      total: importedOnlyData.length,
      hasMore: offset + limit < importedOnlyData.length,
      offset,
      limit,
    };
  }

  const queryParts: any[] = [
    sql`a2i.user_id = ${params.userId}`,
    sql`a2i.connection_id IN (${sql.join(
      params.connectionIds.map((connectionId) => sql`${connectionId}`),
      sql`, `,
    )})`,
  ];

  if (safeStatus !== "all") {
    queryParts.push(sql`a2i.status = ${safeStatus}`);
  }

  if (safeQuery.length > 0) {
    const likeTerm = `%${safeQuery}%`;
    queryParts.push(sql`(
      COALESCE(a2i.contact_name, '') ILIKE ${likeTerm}
      OR a2i.contact_number ILIKE ${likeTerm}
      OR COALESCE(a2i.summary, '') ILIKE ${likeTerm}
      OR COALESCE(a2i.agreed_schedule, '') ILIKE ${likeTerm}
    )`);
  }

  const whereClause = sql.join(queryParts, sql` AND `);

  const result = await db.execute(sql`
    SELECT
      a2i.*,
      wc.connection_name AS source_connection_name,
      wc.phone_number AS source_connection_phone,
      u.name AS source_account_name,
      u.email AS source_account_email
    FROM agendamento2_insights a2i
    INNER JOIN whatsapp_connections wc ON wc.id = a2i.connection_id
    INNER JOIN users u ON u.id = a2i.user_id
    WHERE ${whereClause}
    ORDER BY
      CASE WHEN a2i.scheduled_date IS NULL THEN 1 ELSE 0 END,
      a2i.scheduled_date ASC NULLS LAST,
      a2i.scheduled_time ASC NULLS LAST,
      a2i.last_scheduled_at DESC NULLS LAST,
      a2i.updated_at DESC
    LIMIT ${mergedWindowLimit}
  `);

  const totalResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM agendamento2_insights a2i
    WHERE ${whereClause}
  `);

  const aiData = (((result as any)?.rows || []) as Array<Record<string, any>>).map(mapInsightRow);
  await reconcileAgendamento2OperationalSync(aiData);

  const googleImportedData = await listImportedGoogleAppointmentsForOperationalAgenda({
    userId: params.userId,
    query: safeQuery,
    status: safeStatus,
  });

  const mergedData = [...aiData, ...googleImportedData]
    .sort(compareAgendamento2AgendaItems)
    .slice(offset, offset + limit);
  const total = Number((totalResult as any)?.rows?.[0]?.count || 0) + googleImportedData.length;

  return {
    data: mergedData,
    total,
    hasMore: offset + mergedData.length < total,
    offset,
    limit,
  };
}

export async function reconcileAgendamento2OperationalSyncForUser(params: {
  userId: string;
  conversationId?: string;
  limit?: number;
}) {
  const queryParts: any[] = [
    sql`a2i.user_id = ${params.userId}`,
    sql`a2i.status = 'scheduled'`,
    sql`a2i.scheduled_date IS NOT NULL`,
    sql`a2i.scheduled_time IS NOT NULL`,
  ];

  if (params.conversationId) {
    queryParts.push(sql`a2i.conversation_id = ${params.conversationId}`);
  }

  const whereClause = sql.join(queryParts, sql` AND `);
  const limit = Math.max(1, Math.min(params.limit || 20, 100));

  const result = await db.execute(sql`
    SELECT
      a2i.*,
      wc.connection_name AS source_connection_name,
      wc.phone_number AS source_connection_phone,
      u.name AS source_account_name,
      u.email AS source_account_email
    FROM agendamento2_insights a2i
    INNER JOIN whatsapp_connections wc ON wc.id = a2i.connection_id
    INNER JOIN users u ON u.id = a2i.user_id
    WHERE ${whereClause}
    ORDER BY a2i.last_scheduled_at DESC NULLS LAST, a2i.updated_at DESC
    LIMIT ${limit}
  `);

  const insights = (((result as any)?.rows || []) as Array<Record<string, any>>).map(mapInsightRow);
  await reconcileAgendamento2OperationalSync(insights);

  return insights.length;
}

export function queueConversationAgendamento2Insight(params: {
  conversationId: string;
  latestAgentReply?: string;
}) {
  const existing = pendingAgendamento2Analysis.get(params.conversationId);
  if (existing) return existing;

  const task = (async () => {
    try {
      return await analyzeConversation(params);
    } catch (error) {
      console.error("[AGENDAMENTO 2.0] Falha ao analisar conversa:", error);
      return null;
    } finally {
      pendingAgendamento2Analysis.delete(params.conversationId);
    }
  })();

  pendingAgendamento2Analysis.set(params.conversationId, task);
  return task;
}
