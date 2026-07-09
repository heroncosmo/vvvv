import { sql } from "drizzle-orm";

import { db } from "./db";
import {
  buildComparablePhoneVariants,
  parseLeadCatalogProfile,
  parseLeadQualification,
  renderLeadCampaignTemplate,
  resolveLeadDisplayName,
  trimText,
  type LeadCampaignRecipient,
} from "./leadIntelligenceHelpers";
import {
  recordRodrigoWhatsappLowQualityLeadLabelFromConversation,
  recordRodrigoWhatsappQualifiedLeadFromConversation,
  shouldSendRodrigoQualifiedLeadEvent,
} from "./rodrigoMetaFunnelService";

const LEAD_INTELLIGENCE_VERSION = "lead-intel-v2";
const DEFAULT_CAMPAIGN_TEMPLATE =
  "Oi {lead_nome}, tudo bem? Sou Rodrigo da AgenteZap. Vi que voce conhece {conta_nome}, que ja usa nossa IA no WhatsApp. Pela sua operacao em {tipo_negocio}, achei que faria sentido te mostrar como essa automacao pode acelerar atendimento e vendas.";

type ConversationContextRow = {
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

type MessageContextRow = {
  from_me: boolean;
  is_from_agent: boolean;
  text: string | null;
  media_caption: string | null;
  timestamp: Date | string;
};

function isLeadIntelligenceProviderBudgetError(error: unknown): boolean {
  const text = String((error as any)?.message || error || "").toLowerCase();
  return (
    text.includes("402") ||
    text.includes("insufficient credits") ||
    text.includes("insufficient_credit") ||
    text.includes("provider budget")
  );
}

type LeadInsightRecord = {
  id: string;
  conversationId: string;
  connectionId: string;
  userId: string;
  contactNumber: string;
  contactName: string | null;
  isPotential: boolean;
  potentialScore: number;
  potentialGrade: string;
  businessType: string | null;
  personaType: string | null;
  summary: string | null;
  qualificationReason: string | null;
  evidence: string[];
  recommendedApproach: string | null;
  recommendedMessage: string | null;
  confidence: number;
  catalogIsQualified: boolean;
  catalogScore: number;
  catalogGrade: string;
  catalogSegment: string | null;
  catalogPersona: string | null;
  catalogRegion: string | null;
  catalogStage: string | null;
  catalogSummary: string | null;
  catalogNeedSummary: string | null;
  catalogBuyerFitSummary: string | null;
  catalogSignals: string[];
  catalogConfidence: number;
  catalogLastAnalyzedAt: string | null;
  adminStatus: string;
  campaignCount: number;
  lastCampaignAt: string | null;
  lastAnalyzedAt: string | null;
  lastCustomerMessage: string | null;
  lastAgentMessage: string | null;
  sourceAccountName: string | null;
  sourceAccountEmail: string | null;
  sourceConnectionName: string | null;
  sourceConnectionPhone: string | null;
  awaitingContactReply: boolean;
  pendingReplyMessage: string | null;
  lastGeneratedMessage: string | null;
  lastGeneratedAt: string | null;
};

type LeadCampaignPreview = {
  leadId: string;
  conversationId: string;
  contactNumber: string;
  leadName: string;
  sourceAccountName: string | null;
  message: string;
  rationale: string;
};

const pendingLeadQualification = new Map<string, Promise<void>>();

function getMessageBody(message?: MessageContextRow | null) {
  return trimText(message?.text || message?.media_caption || "", 600);
}

function formatConversationTranscript(messages: MessageContextRow[]) {
  return messages
    .map((message) => {
      const body = getMessageBody(message) || "(sem texto)";
      const speaker = message.from_me ? (message.is_from_agent ? "IA" : "DONO") : "CLIENTE";
      return `${speaker}: ${body}`;
    })
    .join("\n");
}

function parseTextArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  return [];
}

async function getExistingCustomerPhoneVariantSet() {
  const result = await db.execute(sql`
    SELECT phone
    FROM users
    WHERE COALESCE(phone, '') <> ''
  `);

  const variants = new Set<string>();
  for (const row of ((result as any)?.rows || []) as Array<{ phone?: string | null }>) {
    for (const variant of buildComparablePhoneVariants(row.phone || "")) {
      variants.add(variant);
    }
  }

  return variants;
}

function isLeadExistingCustomer(contactNumber: string, existingCustomerVariants: Set<string>) {
  const leadVariants = buildComparablePhoneVariants(contactNumber);
  return leadVariants.some((variant) => existingCustomerVariants.has(variant));
}

async function getConversationLeadContext(conversationId: string) {
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

  const conversationRow = (conversationResult as any)?.rows?.[0] as ConversationContextRow | undefined;
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
    LIMIT 24
  `);

  const messages = (((messagesResult as any)?.rows || []) as MessageContextRow[]).reverse();

  return {
    conversation: conversationRow,
    messages,
  };
}

function buildLeadQualificationPrompt(params: {
  conversation: ConversationContextRow;
  messages: MessageContextRow[];
  latestAgentReply: string;
}) {
  const transcript = formatConversationTranscript(params.messages);
  const sourceLabel =
    trimText(params.conversation.source_account_name, 120) ||
    trimText(params.conversation.connection_name, 120) ||
    "cliente do SaaS";

  return [
    "Analise internamente se o contato abaixo parece ser um potencial cliente do AgenteZap.",
    "Nosso produto eh um SaaS de WhatsApp com IA para empreendedores, empresas e operacoes comerciais.",
    "Nao classifique bem contatos que parecem apenas consumidor final ou pessoa fisica sem sinais de negocio.",
    "Se a evidencia for fraca, prefira marcar como nao potencial ou baixo potencial.",
    "Use apenas o conteudo da conversa e os metadados fornecidos.",
    "Todos os campos de texto devem ser curtos, objetivos e em uma unica linha.",
    "Use potentialScore como inteiro de 0 a 100.",
    "Use no maximo 4 evidencias com ate 120 caracteres cada.",
    "summary deve ter ate 220 caracteres.",
    "qualificationReason deve ter ate 280 caracteres.",
    "recommendedApproach deve ter ate 180 caracteres.",
    "recommendedMessage deve ser null, exceto se houver um gancho muito claro em ate 120 caracteres.",
    "Nao use markdown, listas numeradas nem blocos de codigo dentro dos valores.",
    "Retorne somente JSON valido com estas chaves exatas:",
    "{",
    '  "isPotentialLead": boolean,',
    '  "potentialScore": number,',
    '  "potentialGrade": "alto" | "medio" | "baixo" | "descartar",',
    '  "businessType": string | null,',
    '  "personaType": string | null,',
    '  "summary": string,',
    '  "qualificationReason": string,',
    '  "evidence": string[],',
    '  "recommendedApproach": string | null,',
    '  "recommendedMessage": string | null,',
    '  "confidence": number',
    "}",
    "",
    `Conta fonte: ${sourceLabel}`,
    `WhatsApp fonte: ${trimText(params.conversation.source_phone_number, 40) || "nao informado"}`,
    `Contato: ${trimText(params.conversation.contact_name, 120) || "Sem nome"} (${params.conversation.contact_number})`,
    `Ultima resposta da IA: ${trimText(params.latestAgentReply, 500) || "nao informado"}`,
    "",
    "Transcricao recente:",
    transcript || "(sem historico recente)",
  ].join("\n");
}

function buildCompactLeadQualificationPrompt(params: {
  conversation: ConversationContextRow;
  messages: MessageContextRow[];
  latestAgentReply: string;
}) {
  const compactTranscript = params.messages
    .slice(-10)
    .map((message) => {
      const body = getMessageBody(message) || "(sem texto)";
      const speaker = message.from_me ? (message.is_from_agent ? "IA" : "DONO") : "CLIENTE";
      return `${speaker}: ${trimText(body, 220)}`;
    })
    .join("\n");

  return [
    "Classifique se o contato eh potencial cliente do AgenteZap.",
    "AgenteZap vende SaaS de WhatsApp com IA para negocios.",
    "Se parecer consumidor final sem negocio, marque como nao potencial.",
    "Retorne JSON compacto em uma unica linha.",
    "potentialScore e confidence devem ser inteiros de 0 a 100.",
    "summary max 120 chars.",
    "qualificationReason max 140 chars.",
    "businessType e personaType max 60 chars.",
    "recommendedApproach max 80 chars.",
    "recommendedMessage deve ser null.",
    "evidence max 2 itens curtos.",
    'Chaves exatas: "isPotentialLead","potentialScore","potentialGrade","businessType","personaType","summary","qualificationReason","evidence","recommendedApproach","recommendedMessage","confidence".',
    "",
    `Conta fonte: ${trimText(params.conversation.source_account_name || params.conversation.connection_name || "", 120) || "cliente do SaaS"}`,
    `Contato: ${trimText(params.conversation.contact_name, 120) || "Sem nome"} (${params.conversation.contact_number})`,
    `Ultima resposta da IA: ${trimText(params.latestAgentReply, 220) || "nao informado"}`,
    "Transcricao:",
    compactTranscript || "(sem historico recente)",
  ].join("\n");
}

function buildLeadCatalogPrompt(params: {
  conversation: ConversationContextRow;
  messages: MessageContextRow[];
  latestAgentReply: string;
}) {
  const transcript = formatConversationTranscript(params.messages);
  const sourceLabel =
    trimText(params.conversation.source_account_name, 120) ||
    trimText(params.conversation.connection_name, 120) ||
    "cliente do SaaS";

  return [
    "Analise o contato abaixo como um lead catalogado do SaaS para uso interno futuro.",
    "Objetivo: manter um banco de leads com perfil, maturidade e aderencia comercial, inclusive para futura venda de leads.",
    "Todo contato deve receber uma leitura util, mesmo quando nao for bom lead.",
    "Use apenas o conteudo da conversa e os metadados fornecidos.",
    "Se o contato parecer consumidor final, ainda descreva o perfil, mas marque baixa qualificacao.",
    "Todos os campos de texto devem ser curtos, objetivos e em uma unica linha.",
    "qualificationScore e confidence devem ser inteiros de 0 a 100.",
    "qualificationGrade deve ser alto, medio, baixo ou descartar.",
    "leadStage deve ser um destes: novo, interesse, qualificado, urgente ou descartar.",
    "signals pode ter ate 5 itens curtos.",
    "summary deve resumir quem eh o lead em ate 220 caracteres.",
    "needSummary deve resumir a principal necessidade em ate 220 caracteres.",
    "buyerFitSummary deve resumir para quem esse lead poderia ser vendido ou aproveitado em ate 220 caracteres.",
    "Retorne somente JSON valido com estas chaves exatas:",
    "{",
    '  "isQualifiedLead": boolean,',
    '  "qualificationScore": number,',
    '  "qualificationGrade": "alto" | "medio" | "baixo" | "descartar",',
    '  "segment": string | null,',
    '  "persona": string | null,',
    '  "region": string | null,',
    '  "leadStage": "novo" | "interesse" | "qualificado" | "urgente" | "descartar",',
    '  "summary": string,',
    '  "needSummary": string,',
    '  "buyerFitSummary": string,',
    '  "signals": string[],',
    '  "confidence": number',
    "}",
    "",
    `Conta fonte: ${sourceLabel}`,
    `WhatsApp fonte: ${trimText(params.conversation.source_phone_number, 40) || "nao informado"}`,
    `Contato: ${trimText(params.conversation.contact_name, 120) || "Sem nome"} (${params.conversation.contact_number})`,
    `Ultima resposta da IA: ${trimText(params.latestAgentReply, 500) || "nao informado"}`,
    "",
    "Transcricao recente:",
    transcript || "(sem historico recente)",
  ].join("\n");
}

function buildCompactLeadCatalogPrompt(params: {
  conversation: ConversationContextRow;
  messages: MessageContextRow[];
  latestAgentReply: string;
}) {
  const compactTranscript = params.messages
    .slice(-10)
    .map((message) => {
      const body = getMessageBody(message) || "(sem texto)";
      const speaker = message.from_me ? (message.is_from_agent ? "IA" : "DONO") : "CLIENTE";
      return `${speaker}: ${trimText(body, 180)}`;
    })
    .join("\n");

  return [
    "Classifique e catalogue o contato abaixo para banco de leads interno.",
    "Retorne JSON compacto em uma unica linha.",
    "Mesmo se for lead fraco, gere perfil resumido.",
    "qualificationScore e confidence devem ser inteiros de 0 a 100.",
    "summary, needSummary e buyerFitSummary max 120 chars.",
    "segment, persona e region max 60 chars.",
    "signals max 3 itens curtos.",
    'Chaves exatas: "isQualifiedLead","qualificationScore","qualificationGrade","segment","persona","region","leadStage","summary","needSummary","buyerFitSummary","signals","confidence".',
    "",
    `Conta fonte: ${trimText(params.conversation.source_account_name || params.conversation.connection_name || "", 120) || "cliente do SaaS"}`,
    `Contato: ${trimText(params.conversation.contact_name, 120) || "Sem nome"} (${params.conversation.contact_number})`,
    `Ultima resposta da IA: ${trimText(params.latestAgentReply, 220) || "nao informado"}`,
    "Transcricao:",
    compactTranscript || "(sem historico recente)",
  ].join("\n");
}

async function requestCompactLeadQualification(params: {
  conversation: ConversationContextRow;
  messages: MessageContextRow[];
  latestAgentReply: string;
}) {
  void params;
  return null;
}

async function requestStrictLeadQualificationJson(params: {
  conversation: ConversationContextRow;
  messages: MessageContextRow[];
  latestAgentReply: string;
}) {
  void params;
  return null;
}

async function requestCompactLeadCatalogProfile(params: {
  conversation: ConversationContextRow;
  messages: MessageContextRow[];
  latestAgentReply: string;
}) {
  void params;
  return null;
}

async function requestStrictLeadCatalogProfileJson(params: {
  conversation: ConversationContextRow;
  messages: MessageContextRow[];
  latestAgentReply: string;
}) {
  void params;
  return null;
}

function buildLeadRecipient(record: LeadInsightRecord): LeadCampaignRecipient {
  return {
    leadId: record.id,
    conversationId: record.conversationId,
    userId: record.userId,
    phone: record.contactNumber,
    name: resolveLeadDisplayName(record.contactName, record.contactNumber),
    sourceAccountName: record.sourceAccountName,
    sourceConnectionName: record.sourceConnectionName,
    sourceConnectionPhone: record.sourceConnectionPhone,
    businessType: record.businessType,
    personaType: record.personaType,
    potentialGrade: record.potentialGrade,
    potentialScore: record.potentialScore,
    qualificationReason: record.qualificationReason,
    summary: record.summary,
    recommendedApproach: record.recommendedApproach,
  };
}

function mapLeadInsightRow(row: any): LeadInsightRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id || row.conversationId),
    connectionId: String(row.connection_id || row.connectionId),
    userId: String(row.user_id || row.userId),
    contactNumber: String(row.contact_number || row.contactNumber),
    contactName: row.contact_name || row.contactName || null,
    isPotential: Boolean(row.is_potential ?? row.isPotential),
    potentialScore: Number(row.potential_score ?? row.potentialScore ?? 0),
    potentialGrade: String(row.potential_grade || row.potentialGrade || "baixo"),
    businessType: row.business_type || row.businessType || null,
    personaType: row.persona_type || row.personaType || null,
    summary: row.summary || null,
    qualificationReason: row.qualification_reason || row.qualificationReason || null,
    evidence: parseTextArray(row.evidence_json ?? row.evidenceJson),
    recommendedApproach: row.recommended_approach || row.recommendedApproach || null,
    recommendedMessage: row.recommended_message || row.recommendedMessage || null,
    confidence: Number(row.confidence ?? 0),
    catalogIsQualified: Boolean(row.catalog_is_qualified ?? row.catalogIsQualified),
    catalogScore: Number(row.catalog_score ?? row.catalogScore ?? 0),
    catalogGrade: String(row.catalog_grade || row.catalogGrade || "baixo"),
    catalogSegment: row.catalog_segment || row.catalogSegment || null,
    catalogPersona: row.catalog_persona || row.catalogPersona || null,
    catalogRegion: row.catalog_region || row.catalogRegion || null,
    catalogStage: row.catalog_stage || row.catalogStage || null,
    catalogSummary: row.catalog_summary || row.catalogSummary || null,
    catalogNeedSummary: row.catalog_need_summary || row.catalogNeedSummary || null,
    catalogBuyerFitSummary: row.catalog_buyer_fit_summary || row.catalogBuyerFitSummary || null,
    catalogSignals: parseTextArray(row.catalog_signals_json ?? row.catalogSignalsJson),
    catalogConfidence: Number(row.catalog_confidence ?? row.catalogConfidence ?? 0),
    catalogLastAnalyzedAt: row.catalog_last_analyzed_at || row.catalogLastAnalyzedAt || null,
    adminStatus: String(row.admin_status || row.adminStatus || "new"),
    campaignCount: Number(row.campaign_count ?? row.campaignCount ?? 0),
    lastCampaignAt: row.last_campaign_at || row.lastCampaignAt || null,
    lastAnalyzedAt: row.last_analyzed_at || row.lastAnalyzedAt || null,
    lastCustomerMessage: row.last_customer_message || row.lastCustomerMessage || null,
    lastAgentMessage: row.last_agent_message || row.lastAgentMessage || null,
    sourceAccountName: row.source_account_name || row.sourceAccountName || null,
    sourceAccountEmail: row.source_account_email || row.sourceAccountEmail || null,
    sourceConnectionName: row.source_connection_name || row.sourceConnectionName || null,
    sourceConnectionPhone: row.source_connection_phone || row.sourceConnectionPhone || null,
    awaitingContactReply: Boolean(row.awaiting_contact_reply ?? row.awaitingContactReply),
    pendingReplyMessage: row.pending_reply_message || row.pendingReplyMessage || null,
    lastGeneratedMessage: row.last_generated_message || row.lastGeneratedMessage || null,
    lastGeneratedAt: row.last_generated_at || row.lastGeneratedAt || null,
  };
}

export async function analyzeConversationLead(params: {
  conversationId: string;
  latestAgentReply?: string;
}) {
  const context = await getConversationLeadContext(params.conversationId);
  if (!context) {
    return null;
  }

  const customerMessages = context.messages.filter((message) => !message.from_me);
  const agentMessages = context.messages.filter((message) => message.from_me && message.is_from_agent);
  const latestCustomerMessage = getMessageBody(customerMessages[customerMessages.length - 1]);
  const latestAgentReply =
    trimText(params.latestAgentReply, 1000) ||
    getMessageBody(agentMessages[agentMessages.length - 1]);

  if (!latestCustomerMessage || !latestAgentReply) {
    return null;
  }

  void buildLeadQualificationPrompt({
    conversation: context.conversation,
    messages: context.messages,
    latestAgentReply,
  });

  const qualificationRawText: string | null = null;
  if (!qualificationRawText) {
    console.warn("[LEAD INTELLIGENCE] Analise LLM legada desativada; sem contrato Codex, lead nao sera gravado.");
    return null;
  }

  let parsedQualification;
  try {
    parsedQualification = parseLeadQualification(qualificationRawText);
  } catch (error) {
    console.warn("[LEAD INTELLIGENCE] JSON invalido na classificacao AgenteZap, tentando reclassificacao compacta...");
    const compactResponse = await requestCompactLeadQualification({
      conversation: context.conversation,
      messages: context.messages,
      latestAgentReply,
    });
    try {
      parsedQualification = parseLeadQualification(compactResponse);
    } catch (compactError) {
      console.warn("[LEAD INTELLIGENCE] JSON compacto invalido, tentando resposta estritamente minificada...");
      const strictResponse = await requestStrictLeadQualificationJson({
        conversation: context.conversation,
        messages: context.messages,
        latestAgentReply,
      });
      if (!strictResponse) {
        console.warn("[LEAD INTELLIGENCE] Reparo JSON legado de qualificacao desativado; lead nao sera gravado.");
        return null;
      }
      parsedQualification = parseLeadQualification(strictResponse);
    }
  }

  void buildLeadCatalogPrompt({
    conversation: context.conversation,
    messages: context.messages,
    latestAgentReply,
  });

  const catalogRawText: string | null = null;
  if (!catalogRawText) {
    console.warn("[LEAD INTELLIGENCE] Catalogacao LLM legada desativada; sem contrato Codex, lead nao sera gravado.");
    return null;
  }

  let parsedCatalog;
  try {
    parsedCatalog = parseLeadCatalogProfile(catalogRawText);
  } catch (error) {
    console.warn("[LEAD INTELLIGENCE] JSON invalido no catalogo de leads, tentando perfil compacto...");
    const compactResponse = await requestCompactLeadCatalogProfile({
      conversation: context.conversation,
      messages: context.messages,
      latestAgentReply,
    });
    try {
      parsedCatalog = parseLeadCatalogProfile(compactResponse);
    } catch (compactError) {
      console.warn("[LEAD INTELLIGENCE] JSON compacto do catalogo invalido, tentando resposta estritamente minificada...");
      const strictResponse = await requestStrictLeadCatalogProfileJson({
        conversation: context.conversation,
        messages: context.messages,
        latestAgentReply,
      });
      if (!strictResponse) {
        console.warn("[LEAD INTELLIGENCE] Reparo JSON legado de catalogo desativado; lead nao sera gravado.");
        return null;
      }
      parsedCatalog = parseLeadCatalogProfile(strictResponse);
    }
  }

  const combinedRawAnalysis = {
    agentezap: parsedQualification,
    catalog: parsedCatalog,
  };

  const upsertResult = await db.execute(sql`
    INSERT INTO conversation_lead_intelligence (
      conversation_id,
      connection_id,
      user_id,
      contact_number,
      contact_name,
      is_potential,
      potential_score,
      potential_grade,
      business_type,
      persona_type,
      summary,
      qualification_reason,
      evidence_json,
      recommended_approach,
      recommended_message,
      confidence,
      catalog_is_qualified,
      catalog_score,
      catalog_grade,
      catalog_segment,
      catalog_persona,
      catalog_region,
      catalog_stage,
      catalog_summary,
      catalog_need_summary,
      catalog_buyer_fit_summary,
      catalog_signals_json,
      catalog_confidence,
      catalog_last_analyzed_at,
      last_analyzed_at,
      last_customer_message,
      last_agent_message,
      raw_analysis,
      analysis_version,
      updated_at
    ) VALUES (
      ${context.conversation.conversation_id},
      ${context.conversation.connection_id},
      ${context.conversation.user_id},
      ${context.conversation.contact_number},
      ${context.conversation.contact_name},
      ${parsedQualification.isPotentialLead},
      ${parsedQualification.potentialScore},
      ${parsedQualification.potentialGrade},
      ${parsedQualification.businessType},
      ${parsedQualification.personaType},
      ${parsedQualification.summary},
      ${parsedQualification.qualificationReason},
      ${JSON.stringify(parsedQualification.evidence)},
      ${parsedQualification.recommendedApproach},
      ${parsedQualification.recommendedMessage || DEFAULT_CAMPAIGN_TEMPLATE},
      ${parsedQualification.confidence},
      ${parsedCatalog.isQualifiedLead},
      ${parsedCatalog.qualificationScore},
      ${parsedCatalog.qualificationGrade},
      ${parsedCatalog.segment},
      ${parsedCatalog.persona},
      ${parsedCatalog.region},
      ${parsedCatalog.leadStage},
      ${parsedCatalog.summary},
      ${parsedCatalog.needSummary},
      ${parsedCatalog.buyerFitSummary},
      ${JSON.stringify(parsedCatalog.signals)},
      ${parsedCatalog.confidence},
      NOW(),
      NOW(),
      ${latestCustomerMessage},
      ${latestAgentReply},
      ${JSON.stringify(combinedRawAnalysis)},
      ${LEAD_INTELLIGENCE_VERSION},
      NOW()
    )
    ON CONFLICT (conversation_id) DO UPDATE SET
      connection_id = EXCLUDED.connection_id,
      user_id = EXCLUDED.user_id,
      contact_number = EXCLUDED.contact_number,
      contact_name = EXCLUDED.contact_name,
      is_potential = EXCLUDED.is_potential,
      potential_score = EXCLUDED.potential_score,
      potential_grade = EXCLUDED.potential_grade,
      business_type = EXCLUDED.business_type,
      persona_type = EXCLUDED.persona_type,
      summary = EXCLUDED.summary,
      qualification_reason = EXCLUDED.qualification_reason,
      evidence_json = EXCLUDED.evidence_json,
      recommended_approach = EXCLUDED.recommended_approach,
      recommended_message = EXCLUDED.recommended_message,
      confidence = EXCLUDED.confidence,
      catalog_is_qualified = EXCLUDED.catalog_is_qualified,
      catalog_score = EXCLUDED.catalog_score,
      catalog_grade = EXCLUDED.catalog_grade,
      catalog_segment = EXCLUDED.catalog_segment,
      catalog_persona = EXCLUDED.catalog_persona,
      catalog_region = EXCLUDED.catalog_region,
      catalog_stage = EXCLUDED.catalog_stage,
      catalog_summary = EXCLUDED.catalog_summary,
      catalog_need_summary = EXCLUDED.catalog_need_summary,
      catalog_buyer_fit_summary = EXCLUDED.catalog_buyer_fit_summary,
      catalog_signals_json = EXCLUDED.catalog_signals_json,
      catalog_confidence = EXCLUDED.catalog_confidence,
      catalog_last_analyzed_at = EXCLUDED.catalog_last_analyzed_at,
      last_analyzed_at = EXCLUDED.last_analyzed_at,
      last_customer_message = EXCLUDED.last_customer_message,
      last_agent_message = EXCLUDED.last_agent_message,
      raw_analysis = COALESCE(conversation_lead_intelligence.raw_analysis, '{}'::jsonb) || EXCLUDED.raw_analysis,
      analysis_version = EXCLUDED.analysis_version,
      updated_at = NOW()
    RETURNING *
  `);

  const insight = mapLeadInsightRow((upsertResult as any)?.rows?.[0] || {});
  if (
    shouldSendRodrigoQualifiedLeadEvent({
      isPotential: insight.isPotential,
      potentialScore: insight.potentialScore,
      potentialGrade: insight.potentialGrade,
    })
  ) {
    void recordRodrigoWhatsappQualifiedLeadFromConversation({
      conversationId: insight.conversationId,
      isPotential: insight.isPotential,
      potentialScore: insight.potentialScore,
      potentialGrade: insight.potentialGrade,
      businessType: insight.businessType,
    }).catch((error) => {
      console.warn("[Rodrigo Meta Funnel] LeadSubmitted skipped:", error?.message || error);
    });
  } else {
    void recordRodrigoWhatsappLowQualityLeadLabelFromConversation({
      conversationId: insight.conversationId,
      isPotential: insight.isPotential,
      potentialScore: insight.potentialScore,
      potentialGrade: insight.potentialGrade,
      businessType: insight.businessType,
    }).catch((error) => {
      console.warn("[Rodrigo Meta Funnel] Low quality label skipped:", error?.message || error);
    });
  }

  return insight;
}

export function queueConversationLeadQualification(params: {
  conversationId: string;
  latestAgentReply?: string;
}) {
  const existing = pendingLeadQualification.get(params.conversationId);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    try {
      await analyzeConversationLead(params);
    } catch (error) {
      if (isLeadIntelligenceProviderBudgetError(error)) {
        console.warn("[LEAD INTELLIGENCE] Analise auxiliar pulada por limite do provedor secundario.");
      } else {
        console.error("[LEAD INTELLIGENCE] Falha ao analisar conversa:", error);
      }
    } finally {
      pendingLeadQualification.delete(params.conversationId);
    }
  })();

  pendingLeadQualification.set(params.conversationId, task);
  return task;
}

export async function listLeadInsights(filters?: {
  search?: string;
  grade?: string;
  status?: string;
  onlyPotential?: boolean;
}) {
  const conditions = [sql`1 = 1`];
  const search = trimText(filters?.search, 120);
  const grade = trimText(filters?.grade, 32).toLowerCase();
  const status = trimText(filters?.status, 32).toLowerCase();

  if (filters?.onlyPotential) {
    conditions.push(sql`cli.is_potential = true`);
  }

  if (grade && grade !== "todos") {
    conditions.push(sql`LOWER(cli.potential_grade) = ${grade}`);
  }

  if (status && status !== "todos") {
    conditions.push(sql`LOWER(cli.admin_status) = ${status}`);
  }

  if (search) {
    const term = `%${search}%`;
    conditions.push(sql`
      (
        cli.contact_name ILIKE ${term}
        OR cli.contact_number ILIKE ${term}
        OR COALESCE(cli.business_type, '') ILIKE ${term}
        OR COALESCE(cli.summary, '') ILIKE ${term}
        OR COALESCE(u.name, '') ILIKE ${term}
        OR COALESCE(wc.connection_name, '') ILIKE ${term}
      )
    `);
  }

  const result = await db.execute(sql`
    SELECT
      cli.*,
      u.name AS source_account_name,
      u.email AS source_account_email,
      wc.connection_name AS source_connection_name,
      wc.phone_number AS source_connection_phone
    FROM conversation_lead_intelligence cli
    INNER JOIN users u ON u.id = cli.user_id
    INNER JOIN whatsapp_connections wc ON wc.id = cli.connection_id
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY cli.last_analyzed_at DESC NULLS LAST, cli.updated_at DESC
    LIMIT 300
  `);

  const existingCustomerVariants = await getExistingCustomerPhoneVariantSet();

  return (((result as any)?.rows || []) as any[])
    .map(mapLeadInsightRow)
    .filter((lead) => !isLeadExistingCustomer(lead.contactNumber, existingCustomerVariants));
}

export async function listLeadCatalog(filters?: {
  search?: string;
  grade?: string;
  stage?: string;
  onlyQualified?: boolean;
}) {
  const conditions = [sql`1 = 1`];
  const search = trimText(filters?.search, 120);
  const grade = trimText(filters?.grade, 32).toLowerCase();
  const stage = trimText(filters?.stage, 32).toLowerCase();

  if (filters?.onlyQualified) {
    conditions.push(sql`cli.catalog_is_qualified = true`);
  }

  if (grade && grade !== "todos") {
    conditions.push(sql`LOWER(cli.catalog_grade) = ${grade}`);
  }

  if (stage && stage !== "todos") {
    conditions.push(sql`LOWER(COALESCE(cli.catalog_stage, '')) = ${stage}`);
  }

  if (search) {
    const term = `%${search}%`;
    conditions.push(sql`
      (
        cli.contact_name ILIKE ${term}
        OR cli.contact_number ILIKE ${term}
        OR COALESCE(cli.catalog_segment, '') ILIKE ${term}
        OR COALESCE(cli.catalog_persona, '') ILIKE ${term}
        OR COALESCE(cli.catalog_summary, '') ILIKE ${term}
        OR COALESCE(cli.catalog_need_summary, '') ILIKE ${term}
        OR COALESCE(u.name, '') ILIKE ${term}
        OR COALESCE(wc.connection_name, '') ILIKE ${term}
      )
    `);
  }

  const result = await db.execute(sql`
    SELECT
      cli.*,
      u.name AS source_account_name,
      u.email AS source_account_email,
      wc.connection_name AS source_connection_name,
      wc.phone_number AS source_connection_phone
    FROM conversation_lead_intelligence cli
    INNER JOIN users u ON u.id = cli.user_id
    INNER JOIN whatsapp_connections wc ON wc.id = cli.connection_id
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY cli.catalog_last_analyzed_at DESC NULLS LAST, cli.updated_at DESC
    LIMIT 400
  `);

  return (((result as any)?.rows || []) as any[]).map(mapLeadInsightRow);
}

export async function getLeadInsightsByIds(ids: string[]) {
  const cleanedIds = ids.map((id) => trimText(id, 80)).filter(Boolean);
  if (cleanedIds.length === 0) {
    return [];
  }

  const idList = sql.join(
    cleanedIds.map((id) => sql`${id}`),
    sql`, `,
  );

  const result = await db.execute(sql`
    SELECT
      cli.*,
      u.name AS source_account_name,
      u.email AS source_account_email,
      wc.connection_name AS source_connection_name,
      wc.phone_number AS source_connection_phone
    FROM conversation_lead_intelligence cli
    INNER JOIN users u ON u.id = cli.user_id
    INNER JOIN whatsapp_connections wc ON wc.id = cli.connection_id
    WHERE cli.id IN (${idList})
    ORDER BY cli.last_analyzed_at DESC NULLS LAST
  `);

  const existingCustomerVariants = await getExistingCustomerPhoneVariantSet();

  return (((result as any)?.rows || []) as any[])
    .map(mapLeadInsightRow)
    .filter((lead) => !isLeadExistingCustomer(lead.contactNumber, existingCustomerVariants));
}

export async function updateLeadInsightAdminStatus(id: string, adminStatus: string) {
  const normalizedStatus = trimText(adminStatus, 32).toLowerCase() || "new";
  const result = await db.execute(sql`
    UPDATE conversation_lead_intelligence
    SET admin_status = ${normalizedStatus},
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `);

  const row = (result as any)?.rows?.[0];
  return row ? mapLeadInsightRow(row) : null;
}

export async function markLeadInsightsQueued(ids: string[]) {
  const cleanedIds = ids.map((id) => trimText(id, 80)).filter(Boolean);
  if (cleanedIds.length === 0) {
    return;
  }

  const idList = sql.join(
    cleanedIds.map((id) => sql`${id}`),
    sql`, `,
  );

  await db.execute(sql`
    UPDATE conversation_lead_intelligence
    SET admin_status = 'queued',
        campaign_count = campaign_count + 1,
        last_campaign_at = NOW(),
        updated_at = NOW()
    WHERE id IN (${idList})
  `);
}

export async function reanalyzeLeadInsightById(id: string) {
  const result = await db.execute(sql`
    SELECT conversation_id
    FROM conversation_lead_intelligence
    WHERE id = ${id}
    LIMIT 1
  `);

  const conversationId = (result as any)?.rows?.[0]?.conversation_id;
  if (!conversationId) {
    return null;
  }

  return analyzeConversationLead({ conversationId: String(conversationId) });
}

export async function generateLeadCampaignTemplate(
  leadIds: string[],
  options?: {
    baseManualText?: string;
  },
) {
  const leads = await getLeadInsightsByIds(leadIds);
  if (leads.length === 0) {
    return {
      messageTemplate: "",
      rationale: "Nenhum lead selecionado; sem mensagem local gerada.",
      previews: [] as LeadCampaignPreview[],
    };
  }

  const baseManualText = trimText(options?.baseManualText, 1200);

  const sample = leads
    .slice(0, 25)
    .map((lead, index) => {
      const recipient = buildLeadRecipient(lead);
      return [
        `${index + 1}. leadId=${lead.id}`,
        `lead_nome=${recipient.name}`,
        `telefone=${trimText(recipient.phone, 40) || "nao informado"}`,
        `conta_nome=${trimText(recipient.sourceAccountName || recipient.sourceConnectionName || "", 120) || "nao informado"}`,
        `tipo_negocio=${trimText(recipient.businessType || "", 120) || "nao identificado"}`,
        `grau_potencial=${trimText(recipient.potentialGrade || "", 32) || "baixo"}`,
        `leitura_ia=${trimText(recipient.summary || "", 180) || "nao informado"}`,
        `perfil_detectado=${trimText(recipient.businessType || recipient.personaType || "", 160) || "nao identificado"}`,
        `abordagem_sugerida=${trimText(recipient.recommendedApproach || "", 180) || "nao informado"}`,
        `motivo_lead=${trimText(recipient.qualificationReason || recipient.summary || "", 220) || "nao informado"}`,
      ].join(" | ");
    })
    .join("\n");

  const prompt = [
    "Gere mensagens individuais de WhatsApp para prospeccao do AgenteZap.",
    "Cada mensagem deve usar primeiro a Abordagem sugerida. Perfil detectado e Leitura da IA entram como apoio de contexto.",
    "Nao invente fatos, resultados, numeros, descontos ou dores que nao estejam no contexto.",
    "O tom deve ser humano, direto e elegante, sem parecer spam.",
    "Se houver texto-base manual, use-o apenas como direcao e adapte para cada lead sem copiar mecanicamente.",
    "Fale naturalmente que outro cliente nosso, representado por conta_nome, ja usa nossa IA.",
    "Assine como Rodrigo da AgenteZap quando fizer sentido.",
    "Se o lead nao tiver nome, voce pode usar o telefone como fallback leve na saudacao, sem parecer robo.",
    'Retorne SOMENTE JSON valido neste formato: {"messageTemplate": string, "rationale": string, "items":[{"leadId": string, "message": string, "rationale": string}]}',
    baseManualText ? `Texto-base manual do admin: ${baseManualText}` : "Texto-base manual do admin: (vazio)",
    "",
    "Amostra de leads:",
    sample,
  ].join("\n");

  const fallbackPreviews = leads.map((lead) => {
    const recipient = buildLeadRecipient(lead);
    const manualMessage = baseManualText ? renderLeadCampaignTemplate(baseManualText, recipient) : "";
    return {
      leadId: lead.id,
      conversationId: lead.conversationId,
      contactNumber: lead.contactNumber,
      leadName: recipient.name,
      sourceAccountName: lead.sourceAccountName,
      message: manualMessage,
      rationale: manualMessage
        ? "Texto-base manual renderizado sem autoria local de IA."
        : "Geracao Codex-only indisponivel; sem mensagem local gerada.",
    } satisfies LeadCampaignPreview;
  });

  void prompt;

  return {
    messageTemplate: trimText(baseManualText, 1200),
    rationale: baseManualText
      ? "Texto-base manual preservado; geracao LLM legada desativada."
      : "Geracao LLM legada desativada; sem fallback local de mensagem publica.",
    previews: fallbackPreviews,
  };
}

export async function armLeadReplyOnInbound(params: {
  leadId: string;
  replyMessage: string;
  lastGeneratedMessage?: string;
}) {
  const replyMessage = trimText(params.replyMessage, 1200);
  const lastGeneratedMessage =
    trimText(params.lastGeneratedMessage, 1200) || replyMessage;

  if (!replyMessage) {
    return;
  }

  await db.execute(sql`
    UPDATE conversation_lead_intelligence
    SET awaiting_contact_reply = true,
        pending_reply_message = ${replyMessage},
        last_generated_message = ${lastGeneratedMessage},
        last_generated_at = NOW(),
        updated_at = NOW()
    WHERE id = ${params.leadId}
  `);
}

export async function saveLeadGeneratedMessage(params: {
  leadId: string;
  generatedMessage: string;
  clearPendingReply?: boolean;
}) {
  const generatedMessage = trimText(params.generatedMessage, 1200);
  if (!generatedMessage) {
    return;
  }

  if (params.clearPendingReply) {
    await db.execute(sql`
      UPDATE conversation_lead_intelligence
      SET last_generated_message = ${generatedMessage},
          last_generated_at = NOW(),
          awaiting_contact_reply = false,
          pending_reply_message = NULL,
          updated_at = NOW()
      WHERE id = ${params.leadId}
    `);
    return;
  }

  await db.execute(sql`
    UPDATE conversation_lead_intelligence
    SET last_generated_message = ${generatedMessage},
        last_generated_at = NOW(),
        updated_at = NOW()
    WHERE id = ${params.leadId}
  `);
}

export async function consumeLeadReplyForConversation(params: {
  conversationId?: string | null;
  contactNumber?: string | null;
}) {
  const conversationId = trimText(params.conversationId, 80);
  const contactNumber = trimText(params.contactNumber, 40);

  if (!conversationId && !contactNumber) {
    return null;
  }

  const result = await db.execute(sql`
    SELECT *
    FROM conversation_lead_intelligence
    WHERE awaiting_contact_reply = true
      AND (
        ${conversationId ? sql`conversation_id = ${conversationId}` : sql`false`}
        OR ${contactNumber ? sql`contact_number = ${contactNumber}` : sql`false`}
      )
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  const row = (result as any)?.rows?.[0];
  if (!row) {
    return null;
  }

  await db.execute(sql`
    UPDATE conversation_lead_intelligence
    SET awaiting_contact_reply = false,
        pending_reply_message = NULL,
        admin_status = 'contacted',
        updated_at = NOW()
    WHERE id = ${row.id}
  `);

  return {
    leadId: String(row.id),
    conversationId: String(row.conversation_id || ""),
    replyMessage: trimText(row.pending_reply_message || row.last_generated_message || "", 1200),
  };
}

export function buildLeadCampaignRecipients(leads: LeadInsightRecord[]) {
  return leads.map(buildLeadRecipient);
}

export { renderLeadCampaignTemplate };
