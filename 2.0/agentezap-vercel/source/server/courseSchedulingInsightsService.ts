import { sql } from "drizzle-orm";

import { db } from "./db";
import {
  parseCourseSchedulingInsight,
} from "./courseSchedulingInsightsHelpers";
import {
  resolveLeadDisplayName,
  trimText,
} from "./leadIntelligenceHelpers";
import { supabase } from "./supabaseAuth";

const COURSE_SCHEDULING_ANALYSIS_VERSION = "course-scheduling-v2";

type CourseConversationContextRow = {
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

type CourseMessageContextRow = {
  from_me: boolean;
  is_from_agent: boolean;
  text: string | null;
  media_caption: string | null;
  timestamp: Date | string;
};

type CourseSchedulingInsightRecord = {
  id: string;
  conversationId: string;
  connectionId: string;
  userId: string;
  contactNumber: string;
  contactName: string | null;
  status: "scheduled" | "not_scheduled" | "cancelled";
  agreedSchedule: string | null;
  summary: string | null;
  evidence: string[];
  confidence: number;
  lastCustomerMessage: string | null;
  lastAgentMessage: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  lastScheduledAt: string | null;
  lastAnalyzedAt: string | null;
  analysisVersion: string;
  sourceConnectionName: string | null;
  sourceConnectionPhone: string | null;
  sourceAccountName: string | null;
  sourceAccountEmail: string | null;
  rawAnalysis: Record<string, unknown>;
};

type ExistingInsightRow = {
  status: string | null;
  agreed_schedule: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  summary: string | null;
  last_scheduled_at: string | Date | null;
};

type CourseSchedulingListParams = {
  userId: string;
  connectionIds: string[];
  query?: string;
  status?: "scheduled" | "cancelled" | "not_scheduled" | "all";
  limit?: number;
  offset?: number;
};

const pendingCourseScheduling = new Map<string, Promise<CourseSchedulingInsightRecord | null>>();

function getMessageBody(message?: CourseMessageContextRow | null) {
  return trimText(message?.text || message?.media_caption || "", 600);
}

function formatTranscriptTimestamp(value?: Date | string | null) {
  if (!value) {
    return "sem horario";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "sem horario";
  }

  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCourseTranscript(messages: CourseMessageContextRow[]) {
  return messages
    .map((message) => {
      const body = getMessageBody(message) || "(sem texto)";
      const speaker = message.from_me ? (message.is_from_agent ? "IA" : "DONO") : "CLIENTE";
      return `[${formatTranscriptTimestamp(message.timestamp)}] ${speaker}: ${body}`;
    })
    .join("\n");
}

function mapCourseSchedulingInsightRow(row: Record<string, any>): CourseSchedulingInsightRecord {
  const rawEvidence = Array.isArray(row.evidence_json)
    ? row.evidence_json
    : Array.isArray(row.evidence)
      ? row.evidence
      : [];

  return {
    id: String(row.id || ""),
    conversationId: String(row.conversation_id || ""),
    connectionId: String(row.connection_id || ""),
    userId: String(row.user_id || ""),
    contactNumber: String(row.contact_number || ""),
    contactName: row.contact_name ? String(row.contact_name) : null,
    status: (row.status || "not_scheduled") as CourseSchedulingInsightRecord["status"],
    agreedSchedule: row.agreed_schedule ? String(row.agreed_schedule) : null,
    summary: row.summary ? String(row.summary) : null,
    evidence: rawEvidence.map((entry: unknown) => String(entry)).filter(Boolean),
    confidence: Number(row.confidence || 0),
    lastCustomerMessage: row.last_customer_message ? String(row.last_customer_message) : null,
    lastAgentMessage: row.last_agent_message ? String(row.last_agent_message) : null,
    scheduledDate: row.scheduled_date ? String(row.scheduled_date) : null,
    scheduledTime: row.scheduled_time ? String(row.scheduled_time) : null,
    lastScheduledAt: row.last_scheduled_at ? new Date(row.last_scheduled_at).toISOString() : null,
    lastAnalyzedAt: row.last_analyzed_at ? new Date(row.last_analyzed_at).toISOString() : null,
    analysisVersion: String(row.analysis_version || COURSE_SCHEDULING_ANALYSIS_VERSION),
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

export async function getCourseSchedulingRuntimeState(userId: string) {
  const [
    courseConfigResult,
    schedulingConfigResult,
    salonConfigResult,
    providerConfigResult,
    clinicConfigResult,
  ] = await Promise.all([
    supabase
      .from("course_config")
      .select("is_active, send_to_ai, scheduling_tracker_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("scheduling_config").select("is_enabled").eq("user_id", userId).maybeSingle(),
    supabase.from("salon_config").select("is_active").eq("user_id", userId).maybeSingle(),
    supabase.from("provider_config").select("is_active").eq("user_id", userId).maybeSingle(),
    supabase.from("clinic_config").select("is_active").eq("user_id", userId).maybeSingle(),
  ]);

  const courseActive = !!courseConfigResult.data?.is_active;
  const trackerRequested = courseConfigResult.data?.scheduling_tracker_enabled === true;
  const hasOperationalScheduling =
    !!schedulingConfigResult.data?.is_enabled ||
    !!salonConfigResult.data?.is_active ||
    !!providerConfigResult.data?.is_active ||
    !!clinicConfigResult.data?.is_active;

  return {
    courseActive,
    trackerRequested,
    hasOperationalScheduling,
    trackingEnabled: courseActive && trackerRequested && !hasOperationalScheduling,
    courseConfig: courseConfigResult.data || null,
  };
}

async function getConversationCourseSchedulingContext(conversationId: string) {
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
    | CourseConversationContextRow
    | undefined;
  if (!conversationRow) {
    return null;
  }

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

  const messages = (((messagesResult as any)?.rows || []) as CourseMessageContextRow[]).reverse();

  return {
    conversation: conversationRow,
    messages,
  };
}

function buildCourseSchedulingPrompt(params: {
  conversation: CourseConversationContextRow;
  messages: CourseMessageContextRow[];
  latestAgentReply: string;
  previousInsight: ExistingInsightRow | null;
}) {
  const transcript = formatCourseTranscript(params.messages);
  const previousStatus = trimText(params.previousInsight?.status || "", 40);
  const previousSchedule = trimText(params.previousInsight?.agreed_schedule || "", 180);
  const nowInBrazil = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return [
    "Analise internamente se esta conversa de venda de curso fechou um agendamento.",
    "Agendamento aqui significa que a pessoa confirmou horario, data, periodo, aula experimental, call, reuniao, avaliacao ou encontro equivalente ligado ao fechamento.",
    "Interesse, duvida, intencao de marcar ou pedido de informacoes ainda nao contam como agendamento fechado.",
    "Se ja houve um agendamento claro antes e nada foi cancelado, mantenha status scheduled.",
    "Se houver cancelamento, remarcacao negada ou desistência explicita do horario, use cancelled.",
    "Use apenas a conversa e os metadados fornecidos.",
    "Todos os textos devem ser curtos, objetivos e em uma unica linha.",
    "summary deve ter ate 220 caracteres.",
    "agreedSchedule deve resumir o combinado em linguagem natural, sem inventar horario.",
    "scheduledDate deve ser YYYY-MM-DD quando houver data clara do agendamento, senao null.",
    "scheduledTime deve ser HH:mm quando houver horario claro do agendamento, senao null.",
    "evidence deve ter no maximo 4 itens curtos.",
    "followUpQuestionSuggestion deve ser uma pergunta curta e natural para manter a conversa andando quando houver agendamento fechado.",
    "confidence deve ser inteiro de 0 a 100.",
    "Nao use markdown nem blocos de codigo.",
    "Use os horarios reais da transcricao para interpretar referencias relativas como hoje, amanha, segunda, sabado e domingo.",
    "Nunca invente data nem horario que nao estejam sustentados pela conversa.",
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
    `CONTA: ${trimText(params.conversation.source_account_name, 120) || "Conta principal"}`,
    `CONEXAO: ${trimText(params.conversation.connection_name, 120) || "Canal principal"}`,
    `CONTATO: ${resolveLeadDisplayName(params.conversation.contact_name, params.conversation.contact_number)}`,
    `NUMERO: ${trimText(params.conversation.contact_number, 60)}`,
    `ULTIMA_RESPOSTA_IA: ${trimText(params.latestAgentReply, 400) || "(sem resposta recente)"}`,
    `STATUS_ANTERIOR: ${previousStatus || "nenhum"}`,
    `AGENDAMENTO_ANTERIOR: ${previousSchedule || "nenhum"}`,
    `DATA_ANTERIOR: ${trimText(params.previousInsight?.scheduled_date || "", 20) || "nenhuma"}`,
    `HORARIO_ANTERIOR: ${trimText(params.previousInsight?.scheduled_time || "", 10) || "nenhum"}`,
    "",
    "TRANSCRICAO:",
    transcript || "(sem mensagens)",
  ].join("\n");
}

async function requestStrictCourseSchedulingInsightJson(params: {
  conversation: CourseConversationContextRow;
  messages: CourseMessageContextRow[];
  latestAgentReply: string;
  previousInsight: ExistingInsightRow | null;
}) {
  void params;
  return null;
}

async function requestCourseSchedulingInsightJson(params: {
  conversation: CourseConversationContextRow;
  messages: CourseMessageContextRow[];
  latestAgentReply: string;
  previousInsight: ExistingInsightRow | null;
}) {
  void params;
  return null;
}

async function getExistingCourseInsight(conversationId: string) {
  const result = await db.execute(sql`
    SELECT
      status,
      agreed_schedule,
      scheduled_date,
      scheduled_time,
      summary,
      last_scheduled_at
    FROM course_scheduling_insights
    WHERE conversation_id = ${conversationId}
    LIMIT 1
  `);

  return ((result as any)?.rows?.[0] || null) as ExistingInsightRow | null;
}

async function analyzeConversationCourseScheduling(params: {
  conversationId: string;
  latestAgentReply?: string;
}) {
  const context = await getConversationCourseSchedulingContext(params.conversationId);
  if (!context) {
    return null;
  }

  const runtimeState = await getCourseSchedulingRuntimeState(context.conversation.user_id);
  if (!runtimeState.trackingEnabled) {
    return null;
  }

  const previousInsight = await getExistingCourseInsight(params.conversationId);
  const latestAgentReply = trimText(
    params.latestAgentReply || getMessageBody(context.messages[context.messages.length - 1]),
    400,
  );

  const rawText = await requestCourseSchedulingInsightJson({
    conversation: context.conversation,
    messages: context.messages,
    latestAgentReply,
    previousInsight,
  });
  if (!rawText) {
    console.warn("[COURSE SCHEDULING] Analise LLM legada desativada; sem contrato Codex, insight nao sera gravado.");
    return null;
  }

  let parsed: ReturnType<typeof parseCourseSchedulingInsight>;
  try {
    parsed = parseCourseSchedulingInsight(rawText);
  } catch (parseError) {
    console.warn("[COURSE SCHEDULING] JSON invalido na primeira resposta, solicitando versao estrita...");
    const strictRawText = await requestStrictCourseSchedulingInsightJson({
      conversation: context.conversation,
      messages: context.messages,
      latestAgentReply,
      previousInsight,
    });
    if (!strictRawText) {
      console.warn("[COURSE SCHEDULING] Reparo JSON legado desativado; insight nao sera gravado.");
      return null;
    }
    parsed = parseCourseSchedulingInsight(strictRawText);
  }
  const normalized = normalizeParsedCourseSchedulingInsight(parsed, previousInsight);
  const lastCustomerMessage = [...context.messages].reverse().find((message) => !message.from_me);
  const lastAgentMessage = [...context.messages]
    .reverse()
    .find((message) => message.from_me && message.is_from_agent);

  const upsertResult = await db.execute(sql`
    INSERT INTO course_scheduling_insights (
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
      ${resolveLeadDisplayName(context.conversation.contact_name, context.conversation.contact_number)},
      ${normalized.status},
      ${normalized.agreedSchedule},
      ${normalized.scheduledDate},
      ${normalized.scheduledTime},
      ${normalized.summary},
      ${JSON.stringify(normalized.evidence)}::jsonb,
      ${normalized.confidence},
      ${getMessageBody(lastCustomerMessage) || null},
      ${trimText(latestAgentReply || getMessageBody(lastAgentMessage), 600) || null},
      ${normalized.status === "scheduled" ? sql`NOW()` : null},
      NOW(),
      ${JSON.stringify({
        ...normalized,
        latestAgentReply,
      })}::jsonb,
      ${COURSE_SCHEDULING_ANALYSIS_VERSION},
      NOW()
    )
    ON CONFLICT (conversation_id) DO UPDATE SET
      contact_name = EXCLUDED.contact_name,
      status = EXCLUDED.status,
      agreed_schedule = COALESCE(EXCLUDED.agreed_schedule, course_scheduling_insights.agreed_schedule),
      scheduled_date = COALESCE(EXCLUDED.scheduled_date, course_scheduling_insights.scheduled_date),
      scheduled_time = COALESCE(EXCLUDED.scheduled_time, course_scheduling_insights.scheduled_time),
      summary = EXCLUDED.summary,
      evidence_json = EXCLUDED.evidence_json,
      confidence = EXCLUDED.confidence,
      last_customer_message = EXCLUDED.last_customer_message,
      last_agent_message = EXCLUDED.last_agent_message,
      reminder_times_sent = CASE
        WHEN EXCLUDED.status = 'scheduled'
          AND (
            coalesce(EXCLUDED.scheduled_date, '') <> coalesce(course_scheduling_insights.scheduled_date, '')
            OR coalesce(EXCLUDED.scheduled_time, '') <> coalesce(course_scheduling_insights.scheduled_time, '')
          )
        THEN '[]'::jsonb
        ELSE course_scheduling_insights.reminder_times_sent
      END,
      reminder_sent = CASE
        WHEN EXCLUDED.status = 'scheduled'
          AND (
            coalesce(EXCLUDED.scheduled_date, '') <> coalesce(course_scheduling_insights.scheduled_date, '')
            OR coalesce(EXCLUDED.scheduled_time, '') <> coalesce(course_scheduling_insights.scheduled_time, '')
          )
        THEN false
        ELSE course_scheduling_insights.reminder_sent
      END,
      last_scheduled_at = CASE
        WHEN EXCLUDED.status = 'scheduled' THEN EXCLUDED.last_scheduled_at
        ELSE course_scheduling_insights.last_scheduled_at
      END,
      last_analyzed_at = NOW(),
      raw_analysis = EXCLUDED.raw_analysis,
      analysis_version = EXCLUDED.analysis_version,
      updated_at = NOW()
    RETURNING *
  `);

  const row = ((upsertResult as any)?.rows?.[0] || {}) as Record<string, any>;
  return mapCourseSchedulingInsightRow({
    ...row,
    source_connection_name: context.conversation.connection_name,
    source_connection_phone: context.conversation.source_phone_number,
    source_account_name: context.conversation.source_account_name,
    source_account_email: context.conversation.source_account_email,
  });
}

function normalizeParsedCourseSchedulingInsight(
  parsed: ReturnType<typeof parseCourseSchedulingInsight>,
  previousInsight: ExistingInsightRow | null,
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

  return parsed;
}

export async function listCourseSchedulingInsights(params: CourseSchedulingListParams) {
  const limit = Math.max(1, Math.min(params.limit ?? 100, 200));
  const offset = Math.max(0, params.offset ?? 0);
  const normalizedQuery = trimText(params.query || "", 120).toLowerCase();
  const status = params.status || "scheduled";
  const queryParts: any[] = [
    sql`csi.user_id = ${params.userId}`,
  ];

  if (params.connectionIds.length === 0) {
    return {
      data: [] as CourseSchedulingInsightRecord[],
      total: 0,
      hasMore: false,
      offset,
      limit,
    };
  }

  queryParts.push(
    sql`csi.connection_id IN (${sql.join(
      params.connectionIds.map((connectionId) => sql`${connectionId}`),
      sql`, `,
    )})`,
  );

  if (status !== "all") {
    queryParts.push(sql`csi.status = ${status}`);
  }

  if (normalizedQuery) {
    const likeTerm = `%${normalizedQuery}%`;
    queryParts.push(sql`
      (
        lower(coalesce(csi.contact_name, '')) like ${likeTerm}
        OR lower(coalesce(csi.contact_number, '')) like ${likeTerm}
        OR lower(coalesce(csi.summary, '')) like ${likeTerm}
        OR lower(coalesce(csi.agreed_schedule, '')) like ${likeTerm}
      )
    `);
  }

  const whereClause = sql.join(queryParts, sql` AND `);

  const totalResult = await db.execute(sql`
    SELECT count(*)::int AS count
    FROM course_scheduling_insights csi
    WHERE ${whereClause}
  `);

  const dataResult = await db.execute(sql`
    SELECT
      csi.*,
      wc.connection_name AS source_connection_name,
      wc.phone_number AS source_connection_phone,
      u.name AS source_account_name,
      u.email AS source_account_email
    FROM course_scheduling_insights csi
    INNER JOIN whatsapp_connections wc ON wc.id = csi.connection_id
    INNER JOIN users u ON u.id = csi.user_id
    WHERE ${whereClause}
    ORDER BY
      CASE csi.status
        WHEN 'scheduled' THEN 0
        WHEN 'cancelled' THEN 1
        ELSE 2
      END,
      csi.last_scheduled_at DESC NULLS LAST,
      csi.updated_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const data = (((dataResult as any)?.rows || []) as Array<Record<string, any>>).map(
    mapCourseSchedulingInsightRow,
  );
  const total = Number((totalResult as any)?.rows?.[0]?.count || 0);

  return {
    data,
    total,
    hasMore: offset + data.length < total,
    offset,
    limit,
  };
}

export function queueConversationCourseSchedulingInsight(params: {
  conversationId: string;
  latestAgentReply?: string;
}) {
  const existing = pendingCourseScheduling.get(params.conversationId);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    try {
      return await analyzeConversationCourseScheduling(params);
    } catch (error) {
      console.error("[COURSE SCHEDULING] Falha ao analisar conversa:", error);
      return null;
    } finally {
      pendingCourseScheduling.delete(params.conversationId);
    }
  })();

  pendingCourseScheduling.set(params.conversationId, task);
  return task;
}
