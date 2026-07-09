import { sql } from "drizzle-orm";

import { db } from "./db";
import {
  resolveLeadDisplayName,
  trimText,
} from "./leadIntelligenceHelpers";
import {
  parseAgendamento3Extraction,
  type Agendamento3ExtractionDecision,
} from "./agendamento3ExtractorHelpers";

const AGENDAMENTO3_EXTRACTION_VERSION = "agendamento3-extractor-v1";
const pendingAgendamento3Extraction = new Map<string, Promise<Agendamento3ExtractionResult | null>>();

type Agendamento3ConversationContextRow = {
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

type Agendamento3MessageContextRow = {
  from_me: boolean;
  is_from_agent: boolean;
  text: string | null;
  media_caption: string | null;
  timestamp: Date | string;
};

type Agendamento3ExistingAppointmentRow = {
  id: string;
  appointment_date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  google_event_id: string | null;
  google_calendar_synced: boolean | null;
};

export type Agendamento3ExtractionResult = {
  conversationId: string;
  userId: string;
  decision: Agendamento3ExtractionDecision;
  executed: boolean;
  skippedReason?: string;
  executionPayload?: Record<string, unknown> | null;
};

export type Agendamento3DirectTurnBridgeResult = {
  response?: string;
  splitResponses?: string[];
  mode?: string;
  agendamento3?: Record<string, unknown>;
  [key: string]: unknown;
};

function getMessageBody(message?: Agendamento3MessageContextRow | null) {
  return trimText(message?.text || message?.media_caption || "", 1200);
}

function formatTranscriptTimestamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTranscript(messages: Agendamento3MessageContextRow[]) {
  return messages
    .map((message) => {
      const body = getMessageBody(message) || "(sem texto)";
      const speaker = message.from_me ? (message.is_from_agent ? "IA" : "DONO") : "CLIENTE";
      return `[${formatTranscriptTimestamp(message.timestamp)}] ${speaker}: ${body}`;
    })
    .join("\n");
}

function buildStrictRepairPrompt(rawText: string) {
  return [
    "Repare a saida abaixo para JSON valido, sem markdown e sem texto extra.",
    "Use exatamente as chaves: hasScheduledConversation, status, action, agreedSchedule, scheduledDate, scheduledTime, serviceName, clientName, clientPhone, summary, evidence, confidence.",
    "status deve ser scheduled, not_scheduled ou cancelled. action deve ser book, reschedule, cancel ou none.",
    "scheduledDate deve ser YYYY-MM-DD ou null. scheduledTime deve ser HH:mm ou null.",
    "",
    rawText,
  ].join("\n");
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

  const conversation = (conversationResult as any)?.rows?.[0] as Agendamento3ConversationContextRow | undefined;
  if (!conversation) return null;

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
    LIMIT 40
  `);

  return {
    conversation,
    messages: (((messagesResult as any)?.rows || []) as Agendamento3MessageContextRow[]).reverse(),
  };
}

async function getAgendamento3RuntimeState(userId: string) {
  const result = await db.execute(sql`
    SELECT is_active, agentic_mode_enabled, require_google_validation, auto_confirm
    FROM agendamento3_config
    WHERE user_id = ${userId}
    LIMIT 1
  `);
  const config = ((result as any)?.rows?.[0] || null) as Record<string, unknown> | null;
  return {
    config,
    trackingEnabled: config?.is_active === true && config?.agentic_mode_enabled !== false,
  };
}

async function getLatestActiveAppointment(conversationId: string) {
  const result = await db.execute(sql`
    SELECT
      id,
      to_char(appointment_date, 'YYYY-MM-DD') AS appointment_date,
      to_char(start_time, 'HH24:MI') AS start_time,
      to_char(end_time, 'HH24:MI') AS end_time,
      status,
      google_event_id,
      google_calendar_synced
    FROM appointments
    WHERE conversation_id = ${conversationId}
      AND COALESCE(status, 'pending') IN ('pending', 'confirmed')
    ORDER BY appointment_date DESC, start_time DESC, created_at DESC
    LIMIT 1
  `);
  return ((result as any)?.rows?.[0] || null) as Agendamento3ExistingAppointmentRow | null;
}

function buildExtractionPrompt(params: {
  conversation: Agendamento3ConversationContextRow;
  messages: Agendamento3MessageContextRow[];
  latestAgentReply: string;
  previousAppointment: Agendamento3ExistingAppointmentRow | null;
}) {
  const transcript = formatTranscript(params.messages);
  const nowInBrazil = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return [
    "Voce e o extrator interno do Agendamento 3.0. A conversa principal ja aconteceu.",
    "Nao responda ao cliente. Sua tarefa e somente auditar a transcricao e dizer se existe agendamento realmente combinado.",
    "Use scheduled/book apenas quando houver confirmacao clara do cliente para uma data e horario especificos ou quando o cliente aceita de forma objetiva um horario oferecido pela IA.",
    "Se ja existe agendamento ativo e a conversa muda o dia ou horario, use scheduled/reschedule com a nova data e horario. Nao trate remarcacao como segundo agendamento.",
    "Interesse, pergunta de disponibilidade, pedido de horario, proposta da IA sem aceite do cliente ou conversa ainda incompleta devem ser not_scheduled/none.",
    "Se o cliente cancelou de forma clara um compromisso ja combinado, use cancelled/cancel.",
    "Nunca invente data, horario, servico, endereco ou nome. Se faltar data ou horario, nao agende.",
    "Se ja existe agendamento ativo nesta conversa e nada foi cancelado/remarcado, mantenha scheduled/book somente se a conversa confirmar o mesmo combinado.",
    "Use action=reschedule somente quando o cliente pedir claramente para remarcar, reagendar, alterar, mudar ou trocar um agendamento anterior.",
    "Se a conversa coletou novo nome, novo servico, novo endereco ou nova forma de pagamento, trate como novo agendamento action=book, mesmo que exista agendamento ativo anterior na mesma conversa.",
    "confidence deve ser 0 a 100. Para scheduled/book, use pelo menos 70 somente quando a evidencia for objetiva.",
    "Retorne somente JSON valido com estas chaves exatas:",
    "{",
    '  "hasScheduledConversation": boolean,',
    '  "status": "scheduled" | "not_scheduled" | "cancelled",',
    '  "action": "book" | "reschedule" | "cancel" | "none",',
    '  "agreedSchedule": string | null,',
    '  "scheduledDate": string | null,',
    '  "scheduledTime": string | null,',
    '  "serviceName": string | null,',
    '  "clientName": string | null,',
    '  "clientPhone": string | null,',
    '  "summary": string,',
    '  "evidence": string[],',
    '  "confidence": number',
    "}",
    "",
    `AGORA_NO_BRASIL: ${nowInBrazil}`,
    `CONVERSA_ID: ${params.conversation.conversation_id}`,
    `CONTATO: ${resolveLeadDisplayName(params.conversation.contact_name, params.conversation.contact_number)}`,
    `TELEFONE: ${params.conversation.contact_number}`,
    `ULTIMA_RESPOSTA_DA_IA: ${trimText(params.latestAgentReply, 500) || "(sem resposta recente)"}`,
    `AGENDAMENTO_ATIVO_ANTERIOR: ${params.previousAppointment ? `${params.previousAppointment.appointment_date} ${params.previousAppointment.start_time} ${params.previousAppointment.status}` : "nenhum"}`,
    "",
    "TRANSCRICAO:",
    transcript || "(sem mensagens)",
  ].join("\n");
}

function mapHistoryForInternalAgent(messages: Agendamento3MessageContextRow[]) {
  return messages
    .map((message) => {
      const content = getMessageBody(message);
      if (!content) return null;
      return {
        role: message.from_me ? "assistant" : "user",
        content,
      };
    })
    .filter(Boolean)
    .slice(-16);
}

function getInternalAgentUrl() {
  const configured = String(
    process.env.AGENDAMENTO3_INTERNAL_AGENT_URL ||
      process.env.INTERNAL_APP_URL ||
      "",
  ).trim();
  if (configured) return configured.replace(/\/+$/, "") + "/api/test-agent/message";
  const port = String(process.env.PORT || "5000").trim() || "5000";
  return `http://127.0.0.1:${port}/api/test-agent/message`;
}

function buildExecutionMessage(decision: Agendamento3ExtractionDecision) {
  if (decision.action === "cancel") {
    return [
      "Cancelar o agendamento confirmado nesta conversa.",
      decision.scheduledDate ? `Data: ${decision.scheduledDate}` : "",
      decision.scheduledTime ? `Horario: ${decision.scheduledTime}` : "",
      decision.summary ? `Resumo: ${decision.summary}` : "",
    ].filter(Boolean).join("\n");
  }

  if (decision.action === "reschedule") {
    return [
      "Remarcar o agendamento confirmado nesta conversa para nova data e horario.",
      `Nova data: ${decision.scheduledDate}`,
      `Novo horario: ${decision.scheduledTime}`,
      decision.serviceName ? `Servico: ${decision.serviceName}` : "",
      decision.clientName ? `Cliente: ${decision.clientName}` : "",
      decision.clientPhone ? `Telefone: ${decision.clientPhone}` : "",
      decision.agreedSchedule ? `Combinado: ${decision.agreedSchedule}` : "",
    ].filter(Boolean).join("\n");
  }

  return [
    "Criar novo agendamento confirmado nesta conversa. Nao remarcar agendamento existente sem pedido explicito de remarcacao.",
    `Data: ${decision.scheduledDate}`,
    `Horario: ${decision.scheduledTime}`,
    decision.serviceName ? `Servico: ${decision.serviceName}` : "",
    decision.clientName ? `Cliente: ${decision.clientName}` : "",
    decision.clientPhone ? `Telefone: ${decision.clientPhone}` : "",
    decision.agreedSchedule ? `Combinado: ${decision.agreedSchedule}` : "",
  ].filter(Boolean).join("\n");
}

async function runAgendamento3DirectExecution(params: {
  context: Awaited<ReturnType<typeof getConversationContext>>;
  decision: Agendamento3ExtractionDecision;
}) {
  if (!params.context) return null;
  const { conversation, messages } = params.context;
  const response = await fetch(getInternalAgentUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: conversation.user_id,
      message: buildExecutionMessage(params.decision),
      history: mapHistoryForInternalAgent(messages),
      contactName: params.decision.clientName || conversation.contact_name || undefined,
      contactPhone: params.decision.clientPhone || conversation.contact_number || undefined,
      conversationId: conversation.conversation_id,
      agendamento3Commit: true,
      agendamento3Direct: true,
      agendamento3ExtractorCommit: true,
      flow2RuntimeEnabled: false,
      skipAccessCheck: true,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.mode !== "agendamento3" || !payload?.agendamento3?.handled) {
    throw new Error(payload?.message || payload?.error || `Agendamento 3.0 execution failed with HTTP ${response.status}`);
  }
  return payload as Record<string, unknown>;
}

export async function runAgendamento3DirectTurnBridge(params: {
  userId: string;
  message: string;
  history?: Array<{ role?: string; content?: string }>;
  contactName?: string | null;
  contactPhone?: string | null;
  conversationId?: string | null;
  commit?: boolean;
  customerPreview?: boolean;
}): Promise<Agendamento3DirectTurnBridgeResult | null> {
  const response = await fetch(getInternalAgentUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: params.userId,
      message: params.message,
      history: Array.isArray(params.history) ? params.history : [],
      contactName: params.contactName || undefined,
      contactPhone: params.contactPhone || undefined,
      conversationId: params.conversationId || undefined,
      agendamento3Commit: params.commit === true,
      agendamento3Direct: true,
      agendamento3ExtractorCommit: params.commit === true,
      agendamento3CustomerPreview: params.customerPreview === true,
      flow2RuntimeEnabled: false,
      skipAccessCheck: true,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Agendamento 3.0 direct bridge failed with HTTP ${response.status}`);
  }
  if (payload?.mode !== "agendamento3" || !payload?.agendamento3?.handled) {
    return null;
  }
  return payload as Agendamento3DirectTurnBridgeResult;
}

async function analyzeConversation(params: {
  conversationId: string;
  latestAgentReply?: string;
}): Promise<Agendamento3ExtractionResult | null> {
  const context = await getConversationContext(params.conversationId);
  if (!context) return null;

  const runtimeState = await getAgendamento3RuntimeState(context.conversation.user_id);
  if (!runtimeState.trackingEnabled) return null;

  const previousAppointment = await getLatestActiveAppointment(params.conversationId);
  const latestAgentReply = trimText(
    params.latestAgentReply || getMessageBody(context.messages[context.messages.length - 1]),
    500,
  );

  const completion: any = await Promise.resolve({ choices: [] });
  void ({
    messages: [
      {
        role: "system",
        content: "Voce atua como extrator interno de agendamentos. Nunca escreva nada fora do JSON solicitado.",
      },
      {
        role: "user",
        content: buildExtractionPrompt({
          conversation: context.conversation,
          messages: context.messages,
          latestAgentReply,
          previousAppointment,
        }),
      },
    ],
    maxTokens: 520,
    temperature: 0.1,
    skipMistralQueue: true,
  });

  const rawText = String(completion.choices?.[0]?.message?.content || "").trim();
  if (!rawText) throw new Error("A IA nao retornou classificacao do Agendamento 3.0");

  let decision: Agendamento3ExtractionDecision;
  try {
    decision = parseAgendamento3Extraction(rawText);
  } catch (_error) {
    const repair: any = await Promise.resolve({ choices: [] });
    void ({
      messages: [
        { role: "system", content: "Retorne somente JSON valido." },
        { role: "user", content: buildStrictRepairPrompt(rawText) },
      ],
      maxTokens: 520,
      temperature: 0,
      skipMistralQueue: true,
    });
    decision = parseAgendamento3Extraction(String(repair.choices?.[0]?.message?.content || ""));
  }

  const result: Agendamento3ExtractionResult = {
    conversationId: context.conversation.conversation_id,
    userId: context.conversation.user_id,
    decision,
    executed: false,
  };

  if (decision.status === "not_scheduled" || decision.action === "none") {
    result.skippedReason = "not_scheduled";
    return result;
  }

  if (decision.confidence < 70) {
    result.skippedReason = "low_confidence";
    return result;
  }

  if ((decision.action === "book" || decision.action === "reschedule") && (!decision.scheduledDate || !decision.scheduledTime)) {
    result.skippedReason = "missing_date_or_time";
    return result;
  }

  if (
    decision.action === "book" &&
    previousAppointment?.appointment_date === decision.scheduledDate &&
    previousAppointment?.start_time === decision.scheduledTime
  ) {
    result.skippedReason = "already_scheduled_same_slot";
    result.executed = true;
    return result;
  }

  const payload = await runAgendamento3DirectExecution({ context, decision });
  result.executed = true;
  result.executionPayload = payload;
  return result;
}

export function queueConversationAgendamento3Extraction(params: {
  conversationId: string;
  latestAgentReply?: string;
  forceFresh?: boolean;
}) {
  const cacheKey = `${params.conversationId}:${trimText(params.latestAgentReply || "", 160)}`;
  if (!params.forceFresh && pendingAgendamento3Extraction.has(cacheKey)) {
    return pendingAgendamento3Extraction.get(cacheKey)!;
  }

  const task = analyzeConversation(params)
    .catch((error) => {
      console.error("[AGENDAMENTO 3.0 EXTRACTOR] Falha ao analisar conversa:", error);
      return null;
    })
    .finally(() => {
      pendingAgendamento3Extraction.delete(cacheKey);
    });

  pendingAgendamento3Extraction.set(cacheKey, task);
  return task;
}
