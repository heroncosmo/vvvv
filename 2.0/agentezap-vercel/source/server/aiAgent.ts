import { storage } from "./storage";
import type { Message, AgentRuntimeResponse as AgentRuntimeResponse } from "@shared/schema";
import {
  buildInternalSimulatorConnectionInsert,
  isInternalOnlySimulatorConnection,
} from "./internalSimulatorConnection";
import { parseExplicitBubbleMessages } from "./whatsappMessageSplit";
import { runWithLLMUserContext } from "./llmUserContext";
import { supabase } from "./supabaseAuth";
import {
  getAgendamento2PromptContext,
  queueConversationAgendamento2Insight,
  type Agendamento2PromptContext,
} from "./agendamento2InsightsService";
import {
  queueConversationAgendamento3Extraction,
  runAgendamento3DirectTurnBridge,
} from "./agendamento3ExtractorService";
import { queueConversationCourseSchedulingInsight } from "./courseSchedulingInsightsService";
import { queueConversationDelivery2Order } from "./delivery2OrderService";
import { getEstampariaPromptContext, queueConversationEstampariaRequest, type EstampariaProfile } from "./estampariaService";
// NOTA: generateSystemPrompt, detectJailbreak, detectOffTopic foram removidos
// pois o sistema ADVANCED foi desativado para garantir determinismo nas respostas
import crypto from "crypto";
import { validateAgentResponse } from "./agentValidation";
import {
  parseStructuredAIEnvelope,
  sanitizeAttentionAssessment,
  type AttentionAssessment,
  type StructuredRoutingDecision,
} from "./attentionQueue";
import { buildHumanHandoffRoutingOverride } from "./routingHandoffPolicy";
import {
  attachMediaToProducts,
  fetchProductMediaRows,
  type ProductMediaAsset,
} from "./productCatalogAssets";
import {
  buildCatalogMediaRequestContext,
  harmonizeCatalogProductResponseForSentImages,
  isExplicitCatalogMediaResendRequest,
  selectCatalogProductImage,
  shouldAttachCatalogMediaForReply,
  shouldForceCatalogMediaForKnownSubject,
} from "./productCatalogMediaService";
import {
  buildCatalogProductDeliveryActions,
  hasCatalogVariationMetadata,
  isCatalogProductAvailable,
} from "./productCatalogMessageActions";
import {
  buildMauricioMfcReady50x50PromoReply,
  buildMauricioMfcCatalogPromptBlock,
  extractMauricioMfcPriorCartItems,
  formatMauricioMfcCurrency,
  getMauricioMfcCatalogPriceDescription,
  isMauricioMfcCatalogTenant,
  isMauricioMfcArtReferenceCatalogText,
  looksLikeMauricioMfcCatalogPhotoRequest,
  looksLikeMauricioMfcCartResetIntent,
  looksLikeMauricioMfcReady50x50PromoRequest,
  resolveMauricioMfcRequestedLineKind,
  resolveMauricioMfcCatalogUnitPrice,
  type MauricioMfcCartItemSnapshot,
} from "./mauricioMfcCatalogModule";
// 🛡️ BLINDAGEM UNIVERSAL V3.1 - Sistema de hardening de prompts (inclui pré-blindagem anti-alucinação)
import { analyzeUserPrompt, generateUniversalBlindagem, generatePreBlindagem, validateResponse, extractBusinessName } from "./promptBlindagem";
import { evaluateInboundAutomationGuard } from "./inboundAutomationGuard";
import { getConversationRoutingSnapshot, listOwnerSectors } from "./sectorRoutingService";
import {
  getSuppressingMediaNames,
  shouldSuppressTextResponseForMediaActions,
} from "./mediaResponsePolicy";
import {
  isSimpleGreetingMessage,
  prependContextualOpeningInstruction,
  shouldForceContextualOpeningResponse,
  shouldReturnOnlyGreetingOpeningFlow,
  shouldReturnOpeningOnlyResponse,
} from "./initialOpeningReplyPolicy";
import {
  buildBrazilGreetingPromptInstruction,
  ensureOpeningGreetingForBrazilTime,
  getBrazilGreetingForHour,
  getBrazilTimeDate,
  normalizeConfiguredGreetingForBrazilTime,
} from "./greetingTime";
import {
  buildBrazilTemporalPromptBlock,
  buildBrazilTemporalToolContractBlock,
  enforceBrazilTemporalConsistency,
  getBrazilTemporalContext,
} from "./brazilTemporalContext";
import { evaluateAgentTriggerMatch } from "./agentTriggerGate";
import {
  customerFacingPromptRequestsPlainText,
  isExplicitOperationalMediaRequest,
  sanitizeCustomerFacingResponseText,
} from "./customerFacingResponsePolicy";
import { enforceTrustedPaymentCredentialReply } from "./paymentCredentialGuard";
import { applyFkSemijoiasResponsePolicy } from "./fkSemijoiasResponsePolicy";
import { resolveBittencourtDirectResponse } from "./bittencourtResponsePolicy";
import { buildSchoolTriageResponseFromPrompt } from "./schoolTriageGuard";
import { buildBusinessFaqDirectAnswer } from "./businessFaqDirectAnswer";
import { buildNeuropsiRuntimeResponse } from "./neuropsiResponsePolicy";
import { buildPromptDailyRentalGroupList, buildPromptDailyRentalQuote } from "./promptDailyRentalQuote";
import { applyVicosaPizzaResponseGuard, ensureVicosaPizzaMenuMediaAction } from "./vicosaPizzaResponseGuard";
import {
  extractAgenteZapLiveCliText,
  RODRIGO_AGENT_CREATOR_EMAIL,
  runAgenteZapLiveCliRuntime,
  type AgenteZapLiveCliAction,
  type AgenteZapLiveCliScope,
} from "./agenteZapLiveCliRuntime";
import { buildSubscriptionPlanContextArtifact } from "./subscriptionPlanContext";
import {
  buildVisualFlowFingerprint,
  type VisualFlowFinalAction,
} from "@shared/flowVisualBuilder";
import {
  buildPendingFirstMessageSystemInstruction,
  type PendingFirstMessageRecoveryContext,
} from "./pendingFirstMessageRecovery";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function detectMediaSendingIntent(aiResponseText: string): boolean {
  void aiResponseText;
  return false;
}

type FlowConversationStateStatus = "active" | "completed_continue_ai" | "completed_end" | "handoff";

interface FlowConversationStateRow {
  flow_id: string;
  current_state: string;
  data?: Record<string, any> | null;
  history?: Array<Record<string, any>> | null;
  updated_at?: string | null;
}

function normalizeFlowConversationStateStatus(value: unknown): FlowConversationStateStatus | null {
  const status = String(value || "").trim();
  if (status === "completed_continue_ai" || status === "completed_end" || status === "handoff" || status === "active") {
    return status;
  }
  return null;
}

function buildFlowConversationStatePayload(params: {
  userId: string;
  conversationId: string;
  flowScript: string;
  finalAction: VisualFlowFinalAction;
  selectedFlowId?: string | null;
  selectedStepId?: string | null;
  selectedBranchId?: string | null;
  responseText?: string | null;
  mediaActions?: unknown[];
  conversationHistory?: Message[];
}) {
  const flowId = buildVisualFlowFingerprint(params.flowScript);
  const currentState =
    params.finalAction === "handoff"
      ? "handoff"
      : params.finalAction === "end"
        ? "completed_end"
        : "completed_continue_ai";

  return {
    flowId,
    row: {
      conversation_id: params.conversationId,
      user_id: params.userId,
      flow_id: flowId,
      current_state: currentState,
      data: {
        finalAction: params.finalAction,
        selectedFlowId: params.selectedFlowId || null,
        selectedStepId: params.selectedStepId || null,
        selectedBranchId: params.selectedBranchId || null,
        responseText: params.responseText || null,
        mediaActionsCount: Array.isArray(params.mediaActions) ? params.mediaActions.length : 0,
        flowFingerprint: flowId,
        updatedAt: new Date().toISOString(),
      },
      history: (params.conversationHistory || []).slice(-8).map((message) => ({
        role: message.fromMe ? "assistant" : "user",
        content: String(message.text || message.mediaCaption || "").trim(),
        timestamp:
          message.timestamp instanceof Date
            ? message.timestamp.toISOString()
            : new Date(message.timestamp || Date.now()).toISOString(),
      })),
      updated_at: new Date().toISOString(),
    },
  };
}

async function getFlowConversationState(params: {
  userId: string;
  conversationId: string;
  flowScript: string;
}): Promise<{ status: FlowConversationStateStatus; flowId: string } | null> {
  const flowId = buildVisualFlowFingerprint(params.flowScript);
  const { data, error } = await supabase
    .from("conversation_flow_states")
    .select("flow_id,current_state,data,history,updated_at")
    .eq("conversation_id", params.conversationId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as FlowConversationStateRow;
  if (String(row.flow_id || "").trim() !== flowId) {
    return null;
  }

  const status = normalizeFlowConversationStateStatus(row.current_state);
  if (!status || status === "active") {
    return null;
  }

  if (status !== "handoff") {
    return null;
  }

  return { status, flowId };
}

async function persistFlowConversationState(params: {
  userId: string;
  conversationId: string;
  flowScript: string;
  finalAction: VisualFlowFinalAction;
  selectedFlowId?: string | null;
  selectedStepId?: string | null;
  selectedBranchId?: string | null;
  responseText?: string | null;
  mediaActions?: unknown[];
  conversationHistory?: Message[];
}): Promise<void> {
  const payload = buildFlowConversationStatePayload(params);

  try {
    const { error } = await supabase
      .from("conversation_flow_states")
      .upsert(payload.row, { onConflict: "conversation_id" });

    if (error) {
      console.warn("[AI Agent] Falha ao persistir estado do fluxo:", error);
    }
  } catch (error) {
    console.warn("[AI Agent] Falha inesperada ao persistir estado do fluxo:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🔄 DEDUPLICAÇÃO DE RESPOSTAS - EVITA LOOPS
// ═══════════════════════════════════════════════════════════════════════
const responseHashCache = new Map<string, { hash: string; timestamp: number; count: number }>();

function isDuplicateResponse(conversationKey: string, responseText: string): boolean {
  const hash = crypto.createHash('md5').update(responseText.substring(0, 200)).digest('hex');
  const entry = responseHashCache.get(conversationKey);
  
  if (entry && entry.hash === hash) {
    entry.count++;
    entry.timestamp = Date.now();
    
    if (entry.count >= 3) {
      console.log(`🔄 [Anti-Loop] Mesma resposta detectada ${entry.count}x para ${conversationKey}`);
      return true;
    }
  } else {
    responseHashCache.set(conversationKey, { hash, timestamp: Date.now(), count: 1 });
  }
  
  // Limpar cache antigo (mais de 5 minutos)
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [key, val] of responseHashCache.entries()) {
    if (val.timestamp < fiveMinutesAgo) responseHashCache.delete(key);
  }
  
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
// 🎯 CACHE DE RESPOSTAS POR PERGUNTA - GARANTE DETERMINISMO
// ═══════════════════════════════════════════════════════════════════════
// Este cache garante que a MESMA pergunta sempre retorne a MESMA resposta
// TTL: 30 minutos - suficiente para conversas ativas, limpa memória depois
// ═══════════════════════════════════════════════════════════════════════
interface CachedResponse {
  response: string;
  timestamp: number;
  promptHash: string; // Hash do prompt + mensagem para invalidar se prompt mudar
}

const questionResponseCache = new Map<string, CachedResponse>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

// PROMPT SYNC (ai_agent_config <-> prompt_versions)
interface PromptSyncCacheEntry {
  promptHash: string;
  checkedAt: number;
}

const promptSyncCache = new Map<string, PromptSyncCacheEntry>();
const PROMPT_SYNC_TTL_MS = 5 * 60 * 1000; // 5 minutos

function getCachedResponse(userId: string, messageText: string, promptHash: string): string | null {
  // Gerar chave de cache: userId + hash da mensagem normalizada
  const normalizedMessage = messageText.toLowerCase().trim().replace(/\s+/g, ' ');
  const messageHash = crypto.createHash('md5').update(normalizedMessage).digest('hex');
  const cacheKey = `${userId}:${messageHash}`;
  
  const cached = questionResponseCache.get(cacheKey);
  
  if (cached) {
    // Verificar se não expirou
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      questionResponseCache.delete(cacheKey);
      console.log(`🗑️ [Response Cache] Cache expirado para key ${cacheKey.substring(0, 30)}...`);
      return null;
    }
    
    // Verificar se o prompt mudou (invalidar cache se mudou)
    if (cached.promptHash !== promptHash) {
      questionResponseCache.delete(cacheKey);
      console.log(`🔄 [Response Cache] Prompt mudou, invalidando cache para key ${cacheKey.substring(0, 30)}...`);
      return null;
    }
    
    console.log(`✅ [Response Cache] HIT! Retornando resposta cacheada para "${normalizedMessage.substring(0, 40)}..."`);
    return cached.response;
  }
  
  return null;
}

function setCachedResponse(userId: string, messageText: string, promptHash: string, response: string): void {
  // Não cachear respostas muito curtas (podem ser erros)
  if (response.length < 20) return;
  
  const normalizedMessage = messageText.toLowerCase().trim().replace(/\s+/g, ' ');
  const messageHash = crypto.createHash('md5').update(normalizedMessage).digest('hex');
  const cacheKey = `${userId}:${messageHash}`;
  
  questionResponseCache.set(cacheKey, {
    response,
    timestamp: Date.now(),
    promptHash,
  });
  
  console.log(`💾 [Response Cache] Resposta salva no cache para "${normalizedMessage.substring(0, 40)}..." (${response.length} chars)`);
  
  // Limpar cache antigo periodicamente
  if (questionResponseCache.size > 500) {
    const now = Date.now();
    for (const [key, val] of questionResponseCache.entries()) {
      if (now - val.timestamp > CACHE_TTL_MS) {
        questionResponseCache.delete(key);
      }
    }
    console.log(`🧹 [Response Cache] Limpeza executada, ${questionResponseCache.size} entradas restantes`);
  }
}

// ⚠️ HUMANIZAÇÃO REMOVIDA - Estava corrompendo respostas do agente
// Imports comentados - não usar mais:
// import {
//   humanizeResponse,
//   detectEmotion,
//   adjustToneForEmotion,
//   type HumanizationOptions,
// } from "./humanization";
import {
  getAgentMediaLibrary,
  generateMediaPromptBlock,
  executeMediaActions,
  foldMediaName,
} from "./mediaService";
import { buildDelivery2CodexContext, buildDelivery2MenuMediaActions } from "./delivery2MediaService";

import { processResponsePlaceholders, sanitizeContactName } from "./textUtils";
import {
  generateDeterministicSchedulingReply,
  generateSchedulingPromptBlock,
  generateSchedulingTurnPrompt,
  processSchedulingTags,
  processSchedulingCancelTags,
  clearSchedulingConversationState,
  detectSchedulingIntent,
  getNextAvailableSlots,
  formatAvailableSlotsForAI,
  isSchedulingEnabled,
} from "./schedulingService";
import {
  buildDeterministicSchedulingDisambiguationChatReply,
  buildSchedulingHumanizationUserInstruction,
  classifySchedulingHumanizationCategory,
  validateSchedulingDisambiguationHumanizedReply,
  validateSchedulingSlotListingHumanizedReply,
  type SchedulingHumanizationCategory,
} from "./schedulingHumanization";
import {
  processDeliveryOrderTags,
} from "./deliveryService";
import {
  processDeliveryMessage,
  detectCustomerIntent,
  validatePriceInResponse,
  getDeliveryData,
  isDeliveryEnabled,
} from "./deliveryAIService";
import {
  generateSalonResponse,
  isSalonActive,
} from "./salonAIService";
import {
  generateProviderResponse,
  isProviderActive,
} from "./providerAIService";
import {
  generateClinicResponse,
  isClinicActive,
} from "./clinicAIService";
import { generateSchedulingAiResponse } from "./schedulingAIService";
import {
  generateGrupoOlxCatalogPromptBlock,
  getGrupoOlxCatalogForAI,
  type RealEstateCatalogForAI,
} from "./realEstateCatalogService";
import {
  buildRealEstateConversationContext,
  groundRealEstateReplyForUserTurn,
  maybeGroundRealEstateReply,
} from "./realEstateReplyGrounding";

// ═══════════════════════════════════════════════════════════════════════
// 💇 SISTEMA DE SALÃO DE BELEZA - INTEGRAÇÃO COM IA
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// SISTEMA DE CATALOGO DE PRODUTOS - INTEGRACAO COM IA
// ═══════════════════════════════════════════════════════════════════════
interface ProductForAI {
  id: string;
  name: string;
  price: string | null;
  stock: number;
  controlStock: boolean;
  description: string | null;
  sendDescriptionWithImages: boolean;
  category: string | null;
  link: string | null;
  sku: string | null;
  unit: string;
  imageVariationsEnabled: boolean;
  images: ProductMediaAsset[];
}

interface ProductsForAIResponse {
  active: boolean;
  userId?: string | null;
  instructions: string | null;
  displayInstructions: string | null;
  imageVariationsEnabled: boolean;
  products: ProductForAI[];
  count: number;
}

function formatCatalogPriceForPrompt(price: string | null | undefined): string {
  if (!price) return "Consultar";
  const num = parseFloat(price);
  if (Number.isNaN(num)) return price;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildMessageCatalogReferenceText(message: Pick<Message, "text" | "mediaCaption">): string {
  return [message.mediaCaption, message.text]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
}

function hasCatalogCodeContext(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 24), start).toLowerCase();
  const after = text.slice(end, Math.min(text.length, end + 24)).toLowerCase();
  const context = `${before} ${after}`;
  return (
    context.includes("cod") ||
    context.includes("codigo") ||
    context.includes("código") ||
    context.includes("foto") ||
    context.includes("item")
  );
}

function hasCatalogPriceContext(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 28), start).toLowerCase();
  const after = text.slice(end, Math.min(text.length, end + 12)).toLowerCase();
  const context = `${before} ${after}`;

  return (
    context.includes("preço") ||
    context.includes("preco") ||
    context.includes("valor") ||
    context.includes("quantidade") ||
    context.includes("qtd") ||
    context.includes("subtotal") ||
    context.includes("total") ||
    context.includes("r$")
  );
}

function isBracketedCatalogPhotoMarker(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 10), start).toLowerCase();
  const after = text.slice(end, Math.min(text.length, end + 3)).toLowerCase();

  return before.includes("[foto ") && after.trimStart().startsWith("]");
}

function isStandaloneCatalogCodeAnswer(text: string, start: number, end: number): boolean {
  const before = text.slice(0, start).trim().toLowerCase();
  const after = text.slice(end).trim().toLowerCase();
  const localContext = text.slice(Math.max(0, start - 20), Math.min(text.length, end + 20)).toLowerCase();
  const selectionWords = ["quero", "esse", "essa", "esses", "foto", "item", "codigo", "código", "cod"];

  if (!before && !after) {
    return true;
  }

  if (before.length > 40 || after.length > 40) {
    return false;
  }

  return selectionWords.some((word) => localContext.includes(word));
}

function hasCatalogSelectionVerbContext(text: string, start: number): boolean {
  const lastBreak = Math.max(
    text.lastIndexOf("\n", start - 1),
    text.lastIndexOf("\r", start - 1),
    text.lastIndexOf(".", start - 1),
    text.lastIndexOf(";", start - 1),
  );
  const segment = text.slice(Math.max(0, lastBreak + 1), start).toLowerCase();

  return [
    "quero",
    "vou querer",
    "pode ser",
    "separa",
    "separe",
    "inclui",
    "inclua",
    "orcamento",
    "orçamento",
    "pedido",
  ].some((signal) => segment.includes(signal));
}

function isCatalogOperationalNumberContext(text: string, start: number, end: number, digits: string): boolean {
  const before = text.slice(Math.max(0, start - 44), start).toLowerCase();
  const after = text.slice(end, Math.min(text.length, end + 32)).toLowerCase();
  const numberText = String(digits || "");

  if (/\bx\s*$/.test(before) || /^\s*x\b/.test(after)) return true;
  if (/\b(?:tamanho|tam|medida|medidas)\s+(?:de\s*)?$/.test(before)) return true;
  if (/\b(?:painel|paineis|redondo)\b.{0,28}\bde\s*$/.test(before) && /^(?:50|150)$/.test(numberText)) return true;
  if (/\bde\s*$/.test(before) && /^(?:50|150)$/.test(numberText)) return true;
  if (/\b(?:quantidade|qtd|qtde)\s+(?:de\s*)?$/.test(before)) return true;
  if (/^\s*(?:cm|metro|metros|m)\b/.test(after)) return true;
  if (/^\s*(?:unidade|unidades|und|un|peca|pecas|peça|peças)\b/.test(after)) return true;
  if (/^\s*(?:de\s+cada|cada)\b/.test(after)) return true;

  return false;
}

function extractCatalogCodeMentions(
  value: string | null | undefined,
  knownCodes: Set<number>,
): number[] {
  const text = String(value || "");
  const codes: number[] = [];
  const seen = new Set<number>();
  let index = 0;
  let listContextBudget = 0;

  while (index < text.length) {
    const char = text[index];

    if (char === "\n" || char === "\r" || char === "." || char === ";" || char === ":") {
      listContextBudget = 0;
      index += 1;
      continue;
    }

    const lowerTail = text.slice(index).toLowerCase();
    if (lowerTail.startsWith("codigos") || lowerTail.startsWith("códigos")) {
      listContextBudget = 96;
      index += 7;
      continue;
    }
    if (lowerTail.startsWith("codigo") || lowerTail.startsWith("código")) {
      listContextBudget = 96;
      index += 6;
      continue;
    }
    if (lowerTail.startsWith("cod") || lowerTail.startsWith("cód")) {
      listContextBudget = 96;
      index += 3;
      continue;
    }

    if (char < "0" || char > "9") {
      if (listContextBudget > 0 && char !== "," && char !== " " && char !== "\t" && char !== "e") {
        listContextBudget = Math.max(0, listContextBudget - 1);
      }
      index += 1;
      continue;
    }

    const start = index;
    let digits = "";
    while (index < text.length) {
      const digitChar = text[index];
      if (digitChar < "0" || digitChar > "9") break;
      digits += digitChar;
      index += 1;
    }

    const parsed = Number(digits);
    const hasDirectCatalogContext = hasCatalogCodeContext(text, start, index);
    const isStandaloneAnswer = isStandaloneCatalogCodeAnswer(text, start, index);
    const hasSelectionVerbContext = hasCatalogSelectionVerbContext(text, start);
    const isPriceOnlyContext =
      hasCatalogPriceContext(text, start, index) &&
      !hasDirectCatalogContext &&
      !isStandaloneAnswer &&
      !hasSelectionVerbContext;
    if (
      Number.isInteger(parsed) &&
      knownCodes.has(parsed) &&
      !seen.has(parsed) &&
      !isBracketedCatalogPhotoMarker(text, start, index) &&
      !isCatalogOperationalNumberContext(text, start, index, digits) &&
      !isPriceOnlyContext &&
      (
        hasDirectCatalogContext ||
        isStandaloneAnswer ||
        hasSelectionVerbContext ||
        listContextBudget > 0
      )
    ) {
      seen.add(parsed);
      codes.push(parsed);
    }

    if (listContextBudget > 0) {
      listContextBudget = Math.max(0, listContextBudget - 1);
    }
  }

  return codes;
}

function extractCatalogIdentifiedSelectedCodes(
  value: string | null | undefined,
  knownCodes: Set<number>,
): number[] {
  const text = String(value || "");
  const selectedCodes: number[] = [];
  const seen = new Set<number>();

  const appendCode = (rawCode: string | null | undefined) => {
    const code = Number(rawCode);
    if (Number.isInteger(code) && knownCodes.has(code) && !seen.has(code)) {
      seen.add(code);
      selectedCodes.push(code);
    }
  };

  for (const match of text.matchAll(/\[CATALOGO_IDENTIFICADO:\s*([\s\S]*?)\]/gi)) {
    const block = match[1] || "";
    const explicitSelection = block.match(
      /c[oó]digos?\s+selecionados?\s*:?\s*([\s\S]*?)(?=(?:\s*\|\s*item\b|\s*;\s*item\b|\s+item\s+\d+\b|$))/i,
    );

    if (explicitSelection?.[1]) {
      for (const codeMatch of explicitSelection[1].matchAll(/\d+/g)) {
        appendCode(codeMatch[0]);
      }
      continue;
    }

    for (const itemMatch of block.matchAll(
      /(?:^|[|;])\s*item\s+\d+[\s\S]*?\bc[oó]digo\s*[:#-]?\s*(\d+)/gi,
    )) {
      appendCode(itemMatch[1]);
    }
  }

  return selectedCodes;
}

export function selectCatalogCodesFromConversation(params: {
  currentMessage: string;
  conversationHistory: Pick<Message, "text" | "mediaCaption" | "fromMe">[];
  knownCodes: Set<number>;
  inboundHistoryWindow?: number;
  historyWindow?: number;
}): number[] {
  const {
    currentMessage,
    conversationHistory,
    knownCodes,
    inboundHistoryWindow = 40,
    historyWindow = 24,
  } = params;

  const currentCatalogIdentifiedCodes = extractCatalogIdentifiedSelectedCodes(currentMessage, knownCodes);
  const currentCodes = currentCatalogIdentifiedCodes.length > 0
    ? currentCatalogIdentifiedCodes
    : extractCatalogCodeMentions(currentMessage, knownCodes);
  if (currentCodes.length > 0) {
    return currentCodes;
  }

  const recentInboundSelectionText = (conversationHistory || [])
    .slice(-Math.max(1, inboundHistoryWindow))
    .filter((message) => !message.fromMe)
    .map(buildMessageCatalogReferenceText)
    .filter(Boolean)
    .join("\n");
  const inboundCatalogIdentifiedCodes = extractCatalogIdentifiedSelectedCodes(recentInboundSelectionText, knownCodes);
  const inboundHistoryCodes = inboundCatalogIdentifiedCodes.length > 0
    ? inboundCatalogIdentifiedCodes
    : extractCatalogCodeMentions(recentInboundSelectionText, knownCodes);
  if (inboundHistoryCodes.length > 0) {
    return inboundHistoryCodes;
  }

  const recentHistoryText = (conversationHistory || [])
    .slice(-Math.max(1, historyWindow))
    .map(buildMessageCatalogReferenceText)
    .filter(Boolean)
    .join("\n");
  const historyCatalogIdentifiedCodes = extractCatalogIdentifiedSelectedCodes(recentHistoryText, knownCodes);
  return historyCatalogIdentifiedCodes.length > 0
    ? historyCatalogIdentifiedCodes
    : extractCatalogCodeMentions(recentHistoryText, knownCodes);
}

function collectKnownCatalogVariationCodes(productsData: ProductsForAIResponse | null | undefined): Set<number> {
  const knownCodes = new Set<number>();

  for (const product of productsData?.products || []) {
    for (const image of product.images || []) {
      if (
        typeof image.variation_code === "number" &&
        Number.isFinite(image.variation_code) &&
        image.variation_is_active !== false
      ) {
        knownCodes.add(image.variation_code);
      }
    }
  }

  return knownCodes;
}

function generateExactCatalogVariationGroundingBlock(
  productsData: ProductsForAIResponse,
  currentMessage: string,
  conversationHistory: Message[],
  options: { includeMauricioMfcLegacyPricing?: boolean } = {},
): string {
  const variationByCode = new Map<number, { product: ProductForAI; image: ProductMediaAsset }>();

  for (const product of productsData.products || []) {
    for (const image of product.images || []) {
      if (
        typeof image.variation_code === "number" &&
        image.variation_is_active !== false &&
        !variationByCode.has(image.variation_code)
      ) {
        variationByCode.set(image.variation_code, { product, image });
      }
    }
  }

  if (variationByCode.size === 0) {
    return "";
  }

  const knownCodes = new Set(variationByCode.keys());
  const selectedCodes = selectCatalogCodesFromConversation({
    currentMessage,
    conversationHistory,
    knownCodes,
  });

  if (selectedCodes.length === 0) {
    return "";
  }

  const lines = selectedCodes
    .map((code) => {
      const entry = variationByCode.get(code);
      if (!entry) return "";
      const { product, image } = entry;
      const variationName = image.variation_name || product.name;
      const price = image.variation_price || product.price;
      const mfcPriceDescription =
        options.includeMauricioMfcLegacyPricing === false
          ? null
          : getMauricioMfcCatalogPriceDescription({
              userId: productsData.userId,
              productName: product.name,
              productCategory: product.category,
              productDescription: product.description,
              variationName,
              variationCaption: image.caption,
              variationPrice: image.variation_price,
              contextText: currentMessage,
              includeReady50x50Promo: looksLikeMauricioMfcReady50x50PromoRequest(currentMessage),
            });
      const stock =
        typeof image.variation_stock === "number"
          ? ` | estoque ${image.variation_stock}`
          : "";
      const priceText = mfcPriceDescription
        ? `valores ${mfcPriceDescription}`
        : `preço ${formatCatalogPriceForPrompt(price)}`;
      return `- Código ${code}: produto "${product.name}" | nome "${variationName}" | ${priceText}${stock}`;
    })
    .filter(Boolean)
    .join("\n");

  if (!lines) {
    return "";
  }

  return `REFERÊNCIA PRIORITÁRIA DO CATÁLOGO POR CÓDIGO EXATO:
${lines}

Regras obrigatórias desta referência:
- Se o cliente citou código, responda usando somente os códigos exatos acima.
- Se o cliente enviou uma imagem com legenda do catálogo, a legenda dessa imagem é a seleção exata do cliente.
- Se o cliente respondeu/citou uma mensagem ou imagem do WhatsApp, a mensagem citada é a referência exata para "esse", "essa", "esses" e "quero esse".
- Não substitua por código vizinho, código anterior, próximo código ou item parecido.
- Se houver mais de um código, mantenha cada código como item separado no carrinho/orçamento.
- Não existe limite de itens no carrinho do catálogo: se o cliente citar 4, 5, 10 ou mais códigos válidos, reconheça todos.
- Em pedidos com vários códigos, os dados que aparecem depois de um código pertencem a esse código até aparecer outro código.
- Também leia os dados que aparecem antes do nome/código quando estiverem claramente no mesmo trecho do item.
- Se a mensagem do cliente já informou quantidade, acabamento ou tamanho de um item, considere essa informação preenchida e não diga que está faltando.
- Se houver quantidade e valor do item, calcule subtotal por item e total geral.
- Exemplo: "codigo 40 costurado quantidade 1 e codigo 41 sem costura quantidade 2" significa item código 40 com acabamento costurado e quantidade 1; item código 41 com acabamento sem costura e quantidade 2.
- Exemplo: "2 painéis redondos 50x50 costurados, 1 cilindro código 40 sem costura e 1 painel lateral código 29 costurado" significa três itens completos; não peça quantidade/acabamento/tamanho que já foram informados.
- Painel redondo sempre precisa de tamanho antes de fechar carrinho: 50x50 ou 1,50x1,50. Nunca assuma tamanho padrão para painel redondo.
- Painel lateral e capa/cilindro não precisam de tamanho; peça apenas acabamento e quantidade quando faltar.
- Se faltar quantidade, acabamento ou tamanho obrigatório, pergunte apenas o dado faltante daquele item.`;
}

function normalizeCatalogSelectionIntentText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function looksLikeCatalogCarryForwardSelectionIntent(currentMessage: string): boolean {
  const normalized = normalizeCatalogSelectionIntentText(currentMessage);
  if (!normalized) {
    return false;
  }

  return [
    "quero esse",
    "quero esses",
    "quero essa",
    "quero essas",
    "inclui esse",
    "inclui esses",
    "inclua esse",
    "inclua esses",
    "pode ser esse",
    "pode ser esses",
    "vou querer esse",
    "vou querer esses",
    "sao esses",
    "sao essas",
    "esses ai",
    "essas ai",
    "dessa arte",
    "desta arte",
    "essa arte",
    "essa ultima foto",
    "ultima foto",
  ].some((signal) => normalized.includes(signal));
}

function assistantResponseMentionsCatalogCode(responseText: string, code: number): boolean {
  const normalized = normalizeCatalogSelectionIntentText(responseText);
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes(`codigo ${code}`) ||
    normalized.includes(`codigo: ${code}`) ||
    normalized.includes(`cod ${code}`) ||
    normalized.includes(`cod: ${code}`)
  );
}

function chunkCatalogSelectionCodes(codes: number[], chunkSize: number): number[][] {
  const chunks: number[][] = [];

  for (let index = 0; index < codes.length; index += chunkSize) {
    chunks.push(codes.slice(index, index + chunkSize));
  }

  return chunks;
}

export function buildDeterministicCatalogMultiCodeReply(params: {
  productsData: ProductsForAIResponse | null | undefined;
  currentMessage: string;
  conversationHistory: Message[];
  assistantResponse: string | null | undefined;
}): string | null {
  const { productsData, currentMessage, conversationHistory, assistantResponse } = params;

  if (!productsData?.active || !productsData.products?.length) {
    return null;
  }

  if (isExplicitCatalogMediaResendRequest(currentMessage)) {
    return null;
  }

  const variationByCode = new Map<number, { product: ProductForAI; image: ProductMediaAsset }>();
  for (const product of productsData.products || []) {
    for (const image of product.images || []) {
      if (
        typeof image.variation_code === "number" &&
        Number.isFinite(image.variation_code) &&
        image.variation_is_active !== false
      ) {
        variationByCode.set(image.variation_code, { product, image });
      }
    }
  }

  const knownCodes = new Set(variationByCode.keys());
  if (knownCodes.size === 0) {
    return null;
  }

  const catalogIdentifiedCodes = extractCatalogIdentifiedSelectedCodes(currentMessage, knownCodes);
  const currentCodes = catalogIdentifiedCodes.length > 0
    ? catalogIdentifiedCodes
    : extractCatalogCodeMentions(currentMessage, knownCodes);
  const selectedCodes = catalogIdentifiedCodes.length > 0
    ? catalogIdentifiedCodes
    : selectCatalogCodesFromConversation({
        currentMessage,
        conversationHistory,
        knownCodes,
      });

  const hasExplicitSelectionIntent =
    currentCodes.length > 0 || looksLikeCatalogCarryForwardSelectionIntent(currentMessage);

  if (!hasExplicitSelectionIntent || selectedCodes.length < 4) {
    return null;
  }

  const selectedEntries = selectedCodes
    .map((code) => {
      const entry = variationByCode.get(code);
      if (!entry) return null;
      return { code, ...entry };
    })
    .filter(
      (
        entry,
      ): entry is {
        code: number;
        product: ProductForAI;
        image: ProductMediaAsset;
      } => Boolean(entry),
    );

  if (selectedEntries.length !== selectedCodes.length) {
    return null;
  }

  const assistantReply = String(assistantResponse || "").trim();
  if (
    assistantReply &&
    !detectMediaSendingIntent(assistantReply) &&
    selectedCodes.every((code) => assistantResponseMentionsCatalogCode(assistantReply, code))
  ) {
    return null;
  }

  const hasPanelRedondo = selectedEntries.some((entry) =>
    normalizeCatalogSelectionIntentText(entry.image.variation_name || entry.product.name).includes("painel redondo"),
  );
  const hasAcabamentoSensitiveItem = selectedEntries.some((entry) => {
    const normalizedName = normalizeCatalogSelectionIntentText(entry.image.variation_name || entry.product.name);
    return (
      normalizedName.includes("painel") ||
      normalizedName.includes("cilindro") ||
      normalizedName.includes("capa")
    );
  });

  const positionByCode = new Map<number, number>();
  selectedEntries.forEach((entry, index) => {
    positionByCode.set(entry.code, index + 1);
  });

  const bubbles: string[] = [];
  const codeChunks = chunkCatalogSelectionCodes(
    selectedEntries.map((entry) => entry.code),
    3,
  );

  codeChunks.forEach((codeChunk, chunkIndex) => {
    const lines: string[] = [];

    if (chunkIndex === 0) {
      lines.push("Separei os itens pelos códigos exatos que você escolheu:");
      lines.push("");
    }

    for (const code of codeChunk) {
      const entry = selectedEntries.find((selectedEntry) => selectedEntry.code === code);
      if (!entry) {
        continue;
      }

      const variationName = String(entry.image.variation_name || entry.product.name || "").trim();
      const basePrice = String(entry.image.variation_price || entry.product.price || "").trim();
      const mfcPriceDescription = getMauricioMfcCatalogPriceDescription({
        userId: productsData.userId,
        productName: entry.product.name,
        productCategory: entry.product.category,
        productDescription: entry.product.description,
        variationName,
        variationCaption: entry.image.caption,
        variationPrice: entry.image.variation_price,
        contextText: currentMessage,
        includeReady50x50Promo: looksLikeMauricioMfcReady50x50PromoRequest(currentMessage),
      });
      const itemNumber = positionByCode.get(code) || 0;

      lines.push(`*Item ${itemNumber}*`);
      lines.push(`Código: ${code}`);
      lines.push(`Produto: ${variationName || entry.product.name}`);
      if (mfcPriceDescription) {
        lines.push(`Valores: ${mfcPriceDescription}`);
      } else if (basePrice) {
        lines.push(`Valor base: ${formatCatalogPriceForPrompt(basePrice)}`);
      }
      lines.push("");
    }

    if (chunkIndex === codeChunks.length - 1) {
      lines.push("Você quer apenas orçamento ou deseja seguir com o pedido?");
      lines.push("Se quiser seguir, me informe por código a quantidade de cada item.");
      if (hasAcabamentoSensitiveItem) {
        lines.push("Quando existir essa opção, me diga também o acabamento: costurado ou sem costura.");
      }
      if (hasPanelRedondo) {
        lines.push("Para painel redondo, preciso do tamanho: 50x50 ou 1,50x1,50.");
      }
    }

    bubbles.push(lines.join("\n").trim());
  });

  return bubbles.filter(Boolean).join("\n[BOLHA]\n");
}

function looksLikeCatalogMediaLookupSelection(value: string | null | undefined): boolean {
  const normalized = normalizeCatalogSelectionIntentText(value);
  if (!normalized) {
    return false;
  }

  const hasMediaVerb = /\b(manda|mande|mostra|mostre|envia|envie|ver|ve|foto|fotos|imagem|imagens)\b/i.test(normalized);
  const hasCatalogCode = /\b(codigo|cod)\b/i.test(normalized);
  return hasMediaVerb && hasCatalogCode;
}

function looksLikeCatalogDetailContinuation(value: string | null | undefined): boolean {
  const normalized = normalizeCatalogSelectionIntentText(value);
  if (!normalized) {
    return false;
  }

  return /\b(sem costura|costurado|costurada|com costura|acabamento|50\s*x\s*50|50x50|1\s*,?\s*50\s*x\s*1\s*,?\s*50|150\s*x\s*150|quantidade|qtd|qtde|unidade|unidades|uma de cada|um de cada|1 de cada)\b/i.test(normalized);
}

function isOperationalCatalogPaymentOrAddress(value: string | null | undefined): boolean {
  const normalized = normalizeCatalogSelectionIntentText(value);
  if (!normalized) {
    return false;
  }

  return /\b(pix|chave pix|qr code|qrcode|pagamento|pagar|cartao|maquineta|dinheiro|endereco|localizacao|localizacao|mapa|como chegar|onde fica)\b/i.test(normalized);
}

function isCatalogArtReferenceEntry(entry: {
  product: ProductForAI;
  image: ProductMediaAsset;
}): boolean {
  const normalized = normalizeCatalogSelectionIntentText([
    entry.product.name,
    entry.product.category,
    entry.image.variation_name,
    entry.image.caption,
  ].filter(Boolean).join(" "));
  const hasNoPrice = !String(entry.image.variation_price || entry.product.price || "").trim();

  return hasNoPrice && normalized.includes("catalogo") && (normalized.includes("arte") || normalized.includes("foto"));
}

function catalogEntryNeedsSize(entry: {
  product: ProductForAI;
  image: ProductMediaAsset;
}): boolean {
  const normalized = normalizeCatalogSelectionIntentText([
    entry.product.name,
    entry.product.category,
    entry.image.variation_name,
    entry.image.caption,
  ].filter(Boolean).join(" "));

  return normalized.includes("redondo") || normalized.includes("informar tamanho") || normalized.includes("tamanho desejado");
}

function catalogEntryNeedsProductionDetails(entry: {
  product: ProductForAI;
  image: ProductMediaAsset;
}): boolean {
  if (isCatalogArtReferenceEntry(entry)) {
    return false;
  }

  const normalized = normalizeCatalogSelectionIntentText([
    entry.product.name,
    entry.product.category,
    entry.image.variation_name,
    entry.image.caption,
  ].filter(Boolean).join(" "));

  return /\b(painel|paineis|cilindro|cilindros|capa|sublimacao|costura|costurado)\b/i.test(normalized);
}

function extractCatalogOrderDetails(value: string | null | undefined, needsSize: boolean): {
  acabamento: string | null;
  tamanho: string | null;
  quantidade: string | null;
} {
  const normalized = normalizeCatalogSelectionIntentText(value);

  let acabamento: string | null = null;
  if (/\b(sem costura|sem-costura)\b/i.test(normalized)) {
    acabamento = "Sem costura";
  } else if (/\b(costurado|costurada|com costura)\b/i.test(normalized)) {
    acabamento = "Costurado";
  }

  let tamanho: string | null = null;
  if (needsSize) {
    if (/\b50\s*x\s*50\b/i.test(normalized)) {
      tamanho = "50x50";
    } else if (/\b(?:1\s*,?\s*50|150)\s*x\s*(?:1\s*,?\s*50|150)\b/i.test(normalized)) {
      tamanho = "1,50x1,50";
    }
  }

  let quantidade: string | null = null;
  if (/\b(?:1|um|uma)\s+de\s+cada\b/i.test(normalized)) {
    quantidade = "1";
  } else {
    const quantityMatch =
      normalized.match(/\b(?:quantidade|qtd|qtde)\s*(?:de\s*)?(\d{1,3})\b/i) ||
      normalized.match(/\b(\d{1,3})\s*(?:unidade|unidades|und|un|peca|pecas|peça|peças)\b/i);
    if (quantityMatch?.[1]) {
      quantidade = String(Number(quantityMatch[1]));
    } else {
      const wordQuantity = normalized.match(/\b(uma|um|duas|dois|tres|três|quatro|cinco|seis|sete|oito|nove|dez)\s*(?:unidade|unidades|peca|pecas|peça|peças)\b/i)?.[1];
      const wordMap: Record<string, string> = {
        uma: "1",
        um: "1",
        duas: "2",
        dois: "2",
        tres: "3",
        três: "3",
        quatro: "4",
        cinco: "5",
        seis: "6",
        sete: "7",
        oito: "8",
        nove: "9",
        dez: "10",
      };
      quantidade = wordQuantity ? wordMap[wordQuantity] || null : null;
    }
  }

  return { acabamento, tamanho, quantidade };
}

function extractCatalogSelectionTextForCode(selectionText: string, code: number): string | null {
  const raw = String(selectionText || "");
  if (!raw.trim() || !Number.isInteger(code)) return null;

  const matches = Array.from(raw.matchAll(/\b(?:codigo|c[oó]digo|cod)\s*[:#-]?\s*(\d{1,4})\b/giu))
    .map((match) => ({
      code: Number(match[1]),
      index: match.index ?? -1,
    }))
    .filter((match) => match.index >= 0);

  const currentIndex = matches.findIndex((match) => match.code === code);
  if (currentIndex < 0) return null;

  const start = matches[currentIndex].index;
  const nextStart = matches[currentIndex + 1]?.index ?? raw.length;
  const prefix = raw.slice(0, matches[0]?.index ?? 0).trim();
  const detailSignalPattern =
    /\b(?:sem costura|sem-costura|costurado|costurada|com costura|quantidade|qtd|qtde|unidade|unidades|1\s+de\s+cada|um\s+de\s+cada|uma\s+de\s+cada)\b/i;
  const includePrefix =
    prefix.length > 0 &&
    detailSignalPattern.test(normalizeCatalogSelectionIntentText(prefix));
  const lastCatalogClose = /\[CATALOGO_IDENTIFICADO:/i.test(raw) ? raw.lastIndexOf("]") : -1;
  const suffix = lastCatalogClose >= 0 ? raw.slice(lastCatalogClose + 1).trim() : "";
  const includeSuffix =
    suffix.length > 0 &&
    detailSignalPattern.test(normalizeCatalogSelectionIntentText(suffix));
  const scoped = `${includePrefix ? `${prefix}\n` : ""}${raw.slice(start, nextStart)}${includeSuffix ? `\n${suffix}` : ""}`.trim();
  return scoped || null;
}

function extractMauricioMfcBareQuantityForCodeScope(scopedText: string, fullSelectionText: string): string | null {
  const scoped = normalizeCatalogSelectionIntentText(scopedText)
    .replace(/\b(?:codigo|cod)\s*[:#-]?\s*\d{1,4}\b/giu, " ")
    .replace(/\b(?:hulk|lilo|sthic|stitch|chito|girassol|galaxia|baby shark|mario|super mario|tres palavrinhas|3 palavrinhas)\b/giu, " ");
  const full = normalizeCatalogSelectionIntentText(fullSelectionText);

  if (/\b(?:1|um|uma)\s+de\s+cada\b/i.test(full)) {
    return "1";
  }

  const afterFinish = scoped.match(/\b(?:sem costura|sem-costura|costurado|costurada|com costura)\b\s*(\d{1,3})\b/i);
  if (afterFinish?.[1]) {
    return String(Number(afterFinish[1]));
  }

  return null;
}

function extractCatalogOrderDetailsForItem(params: {
  selectionText: string;
  code: number;
  needsSize: boolean;
  isMauricioMfc: boolean;
}): {
  details: { acabamento: string | null; tamanho: string | null; quantidade: string | null };
  scopedText: string;
} {
  if (!params.isMauricioMfc) {
    return {
      details: extractCatalogOrderDetails(params.selectionText, params.needsSize),
      scopedText: params.selectionText,
    };
  }

  const scopedText = extractCatalogSelectionTextForCode(params.selectionText, params.code) || params.selectionText;
  const details = extractCatalogOrderDetails(scopedText, params.needsSize);
  if (!details.quantidade) {
    details.quantidade = extractMauricioMfcBareQuantityForCodeScope(scopedText, params.selectionText);
  }
  return { details, scopedText };
}

function parseCatalogPriceNumber(value: string | null | undefined): number | null {
  const match = String(value || "").match(/(\d{1,6}(?:[,.]\d{1,2})?)/);
  if (!match?.[1]) {
    return null;
  }
  const raw = match[1];
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : /\.\d{1,2}$/.test(raw)
      ? raw
      : raw.replace(/\./g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatCatalogCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function extractCatalogUnitPriceForDetails(
  entry: { product: ProductForAI; image: ProductMediaAsset },
  details: { acabamento: string | null },
): number | null {
  const caption = String(entry.image.caption || "");
  const normalizedCaption = normalizeCatalogSelectionIntentText(caption);
  const acabamento = normalizeCatalogSelectionIntentText(details.acabamento || "");
  const labelPatterns =
    acabamento.includes("sem costura")
      ? ["sem\\s*costura", "sem-costura"]
      : acabamento.includes("costurado") || acabamento.includes("costurada") || acabamento.includes("com costura")
        ? ["costurad[oa]", "com\\s*costura"]
        : [];

  for (const labelPattern of labelPatterns) {
    const source = normalizedCaption || caption;
    const after = new RegExp(`${labelPattern}[^;|\\n]{0,64}?r\\$?\\s*(\\d{1,6}(?:[,.]\\d{1,2})?)`, "i").exec(source) ||
      new RegExp(`${labelPattern}[^;|\\n]{0,64}?(\\d{1,6}(?:[,.]\\d{1,2})?)`, "i").exec(source);
    if (after?.[1]) {
      const parsed = parseCatalogPriceNumber(after[1]);
      if (parsed != null) return parsed;
    }
    const before = new RegExp(`r\\$?\\s*(\\d{1,6}(?:[,.]\\d{1,2})?)[^;|\\n]{0,64}${labelPattern}`, "i").exec(source) ||
      new RegExp(`(\\d{1,6}(?:[,.]\\d{1,2})?)[^;|\\n]{0,64}${labelPattern}`, "i").exec(source);
    if (before?.[1]) {
      const parsed = parseCatalogPriceNumber(before[1]);
      if (parsed != null) return parsed;
    }
  }

  return parseCatalogPriceNumber(entry.image.variation_price || entry.product.price || null);
}

function buildCatalogArtReferenceReply(count: number): string {
  return "";
}

function extractMauricioMfcPriorCartItemsFromHistory(params: {
  conversationHistory: Message[];
  currentCodes: Set<number>;
  currentMessage: string;
}): MauricioMfcCartItemSnapshot[] {
  if (looksLikeMauricioMfcCartResetIntent(params.currentMessage)) {
    return [];
  }

  for (const message of (params.conversationHistory || []).slice(-24).reverse()) {
    const raw = [
      (message as any)?.text,
      (message as any)?.mediaCaption,
      (message as any)?.media_caption,
    ].filter(Boolean).join("\n");
    if (!raw || !/\b(?:Item\s+\d+|Subtotal|Total dos itens)\b/i.test(raw)) {
      continue;
    }
    if (!(message as any)?.fromMe && !/\bTotal dos itens\b/i.test(raw)) {
      continue;
    }

    const seen = new Set<number>();
    const items = extractMauricioMfcPriorCartItems(raw)
      .filter((item) => !params.currentCodes.has(item.code))
      .filter((item) => {
        if (seen.has(item.code)) return false;
        seen.add(item.code);
        return true;
      });
    if (items.length > 0) {
      return items.slice(0, Math.max(0, 10 - params.currentCodes.size));
    }
  }

  return [];
}

export function buildDeterministicCatalogSelectionReply(params: {
  productsData: ProductsForAIResponse | null | undefined;
  currentMessage: string;
  conversationHistory: Message[];
  assistantResponse: string | null | undefined;
}): string | null {
  const { productsData, currentMessage, conversationHistory, assistantResponse } = params;

  if (!productsData?.active || !productsData.products?.length) {
    return null;
  }

  const hasCatalogIdentified = /\[CATALOGO_IDENTIFICADO:/i.test(currentMessage);

  if (
    isExplicitCatalogMediaResendRequest(currentMessage) ||
    (!hasCatalogIdentified && looksLikeCatalogMediaLookupSelection(currentMessage))
  ) {
    return null;
  }

  if (isOperationalCatalogPaymentOrAddress(currentMessage)) {
    return null;
  }

  const variationByCode = new Map<number, { product: ProductForAI; image: ProductMediaAsset }>();
  for (const product of productsData.products || []) {
    for (const image of product.images || []) {
      if (
        typeof image.variation_code === "number" &&
        Number.isFinite(image.variation_code) &&
        image.variation_is_active !== false
      ) {
        variationByCode.set(image.variation_code, { product, image });
      }
    }
  }

  const knownCodes = new Set(variationByCode.keys());
  if (knownCodes.size === 0) {
    return null;
  }

  const catalogIdentifiedCodes = extractCatalogIdentifiedSelectedCodes(currentMessage, knownCodes);
  const currentCodes = catalogIdentifiedCodes.length > 0
    ? catalogIdentifiedCodes
    : extractCatalogCodeMentions(currentMessage, knownCodes);
  const selectedCodes = catalogIdentifiedCodes.length > 0
    ? catalogIdentifiedCodes
    : selectCatalogCodesFromConversation({
        currentMessage,
        conversationHistory,
        knownCodes,
      });
  const inboundSelectionText = (conversationHistory || [])
    .slice(-40)
    .filter((message) => !message.fromMe)
    .map(buildMessageCatalogReferenceText)
    .filter(Boolean)
    .join("\n");
  const inboundCatalogIdentifiedCodes = extractCatalogIdentifiedSelectedCodes(inboundSelectionText, knownCodes);
  const inboundHistoryCodes = inboundCatalogIdentifiedCodes.length > 0
    ? inboundCatalogIdentifiedCodes
    : extractCatalogCodeMentions(inboundSelectionText, knownCodes);
  const hasCarryForwardSelection = looksLikeCatalogCarryForwardSelectionIntent(currentMessage);
  const hasDetailContinuation =
    currentCodes.length === 0 &&
    inboundHistoryCodes.length > 0 &&
    looksLikeCatalogDetailContinuation(currentMessage);

  if (
    currentCodes.length === 0 &&
    !hasCatalogIdentified &&
    !hasCarryForwardSelection &&
    !hasDetailContinuation
  ) {
    return null;
  }

  const selectedEntries = selectedCodes
    .filter((code) => !hasDetailContinuation || inboundHistoryCodes.includes(code))
    .slice(0, 10)
    .map((code) => {
      const entry = variationByCode.get(code);
      if (!entry) return null;
      return { code, ...entry };
    })
    .filter(
      (
        entry,
      ): entry is {
        code: number;
        product: ProductForAI;
        image: ProductMediaAsset;
      } => Boolean(entry),
    );

  if (selectedEntries.length === 0) {
    return null;
  }

  const shouldPreferDeterministic =
    hasCatalogIdentified ||
    hasDetailContinuation ||
    hasCarryForwardSelection ||
    selectedEntries.length >= 4;
  const assistantReply = String(assistantResponse || "").trim();
  const assistantUnsafeProgress =
    /\b(pix|pagamento|pagar|cartao|maquineta|dinheiro|finalizar|finalizacao)\b/i.test(
      normalizeCatalogSelectionIntentText(assistantReply),
    );

  if (
    !shouldPreferDeterministic &&
    assistantReply &&
    !assistantUnsafeProgress &&
    !detectMediaSendingIntent(assistantReply) &&
    selectedEntries.every((entry) => assistantResponseMentionsCatalogCode(assistantReply, entry.code))
  ) {
    return null;
  }

  const artEntries = selectedEntries.filter((entry) => isCatalogArtReferenceEntry(entry));
  const orderEntries = selectedEntries.filter((entry) => !isCatalogArtReferenceEntry(entry));

  if (orderEntries.length === 0) {
    return null;
  }
  const suppressArtReferenceGuidance =
    isMauricioMfcCatalogTenant({ userId: productsData.userId }) && orderEntries.length > 0 && artEntries.length > 0;
  const isMauricioMfcTenant = isMauricioMfcCatalogTenant({ userId: productsData.userId });
  const currentOrderCodes = new Set(orderEntries.map((entry) => entry.code));
  const mauricioMfcPriorCartItems = isMauricioMfcTenant
    ? extractMauricioMfcPriorCartItemsFromHistory({
        conversationHistory,
        currentCodes: currentOrderCodes,
        currentMessage,
      })
    : [];
  const totalRecognizedOrderItems = mauricioMfcPriorCartItems.length + orderEntries.length;

  const selectionText = [
    currentMessage,
    ...conversationHistory
      .slice(-12)
      .filter((message) => !message.fromMe)
      .map(buildMessageCatalogReferenceText),
  ].filter(Boolean).join("\n");

  const lines: string[] = [
    totalRecognizedOrderItems === 1
      ? "Perfeito, reconheci esse item:"
      : mauricioMfcPriorCartItems.length > 0
        ? `Perfeito, mantive ${mauricioMfcPriorCartItems.length} item(ns) que ja estavam no carrinho e adicionei ${orderEntries.length} novo(s) item(ns):`
        : `Perfeito, reconheci ${orderEntries.length} itens escolhidos no catálogo:`,
    "",
  ];
  let total = 0;
  let totalItemsWithSubtotal = 0;
  let hasMissing = false;
  const examples: string[] = [];

  mauricioMfcPriorCartItems.forEach((item, index) => {
    lines.push(`Item ${index + 1}`);
    lines.push(`Produto: ${item.product}`);
    lines.push(`Código: ${item.code}`);
    if (item.tamanho) {
      lines.push(`Tamanho: ${item.tamanho}`);
    }
    if (item.acabamento) {
      lines.push(`Acabamento: ${item.acabamento}`);
    }
    if (item.quantidade) {
      lines.push(`Quantidade: ${item.quantidade}`);
    }
    if (item.unitPrice != null) {
      lines.push(`Valor: ${formatMauricioMfcCurrency(item.unitPrice)}`);
    }
    if (item.subtotal != null) {
      lines.push(`Subtotal: ${formatMauricioMfcCurrency(item.subtotal)}`);
      total += item.subtotal;
      totalItemsWithSubtotal += 1;
    }
    lines.push("");
  });

  orderEntries.forEach((entry, index) => {
    const itemNumber = mauricioMfcPriorCartItems.length + index + 1;
    const variationName = String(entry.image.variation_name || entry.product.name || "").trim();
    const needsSize = catalogEntryNeedsSize(entry);
    const needsProductionDetails = catalogEntryNeedsProductionDetails(entry);
    const { details, scopedText: itemSelectionText } = extractCatalogOrderDetailsForItem({
      selectionText,
      code: entry.code,
      needsSize,
      isMauricioMfc: isMauricioMfcTenant,
    });
    const missing = [
      needsSize && !details.tamanho ? "tamanho" : null,
      needsProductionDetails && !details.acabamento ? "acabamento" : null,
      !details.quantidade ? "quantidade" : null,
    ].filter(Boolean) as string[];
    const mfcResolvedPrice = resolveMauricioMfcCatalogUnitPrice({
      userId: productsData.userId,
      productName: entry.product.name,
      productCategory: entry.product.category,
      productDescription: entry.product.description,
      variationName,
      variationCaption: entry.image.caption,
      variationPrice: entry.image.variation_price,
      contextText: itemSelectionText,
      details,
    });
    const mfcApplies =
      isMauricioMfcCatalogTenant({ userId: productsData.userId }) &&
      Boolean(mfcResolvedPrice.description || mfcResolvedPrice.kind);
    const suppressMfcSinglePrice =
      mfcApplies &&
      (missing.includes("tamanho") ||
        missing.includes("acabamento") ||
        (mfcResolvedPrice.kind === "redondo" &&
          mfcResolvedPrice.acabamento === "costurado" &&
          missing.includes("quantidade")));
    const unitPrice =
      suppressMfcSinglePrice
        ? null
        : mfcResolvedPrice.price ??
          (mfcResolvedPrice.description ? null : extractCatalogUnitPriceForDetails(entry, details));
    const quantity = Number(details.quantidade || "");

    lines.push(`Item ${itemNumber}`);
    lines.push(`Produto: ${variationName}`);
    lines.push(`Código: ${entry.code}`);
    if (needsSize && details.tamanho) {
      lines.push(`Tamanho: ${details.tamanho}`);
    }
    if (details.acabamento) {
      lines.push(`Acabamento: ${details.acabamento}`);
    }
    if (details.quantidade) {
      lines.push(`Quantidade: ${details.quantidade}`);
    }
    if (unitPrice != null) {
      lines.push(`Valor: ${formatCatalogCurrency(unitPrice)}`);
    } else if (mfcResolvedPrice.description) {
      lines.push(`Valores: ${mfcResolvedPrice.description}`);
    } else if (!suppressMfcSinglePrice && (entry.image.variation_price || entry.product.price)) {
      lines.push(`Valor: ${formatCatalogPriceForPrompt(entry.image.variation_price || entry.product.price)}`);
    }
    if (unitPrice != null && Number.isFinite(quantity) && quantity > 0) {
      const subtotal = unitPrice * quantity;
      lines.push(`Subtotal: ${formatCatalogCurrency(subtotal)}`);
      total += subtotal;
      totalItemsWithSubtotal += 1;
    }
    if (missing.length > 0) {
      hasMissing = true;
      lines.push(`Falta: ${missing.join(", ")}`);
      const exampleParts = [
        needsSize && !details.tamanho ? "50x50" : null,
        needsProductionDetails && !details.acabamento ? "sem costura" : null,
        !details.quantidade ? "1 unidade" : null,
      ].filter(Boolean);
      if (exampleParts.length > 0 && examples.length < 3) {
        examples.push(`código ${entry.code}: ${exampleParts.join(", ")}`);
      }
    }
    lines.push("");
  });

  if (artEntries.length > 0 && !suppressArtReferenceGuidance) {
    const artReferenceReply = buildCatalogArtReferenceReply(artEntries.length);
    if (artReferenceReply) {
      lines.push(artReferenceReply);
      lines.push("");
    }
  }

  if (hasMissing) {
    if (examples.length > 0) {
      lines.push(`Me passa, por favor, esses detalhes por código. Exemplo: "${examples.join("; ")}".`);
    } else {
      lines.push("Me passa, por favor, os detalhes por código para eu seguir sem confundir os itens.");
    }
  } else {
    if (totalItemsWithSubtotal > 1) {
      lines.push(`Total dos itens: ${formatCatalogCurrency(total)}`);
      lines.push("");
    }
    lines.push("Se estiver tudo certo, posso seguir para a forma de pagamento. Se quiser mais algum item, pode me enviar o código ou a foto.");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function getProductsForAI(userId: string): Promise<ProductsForAIResponse | null> {
  try {
    // Verifica se o módulo está ativo
    const { data: config, error: configError } = await supabase
      .from('products_config')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (configError && configError.code !== 'PGRST116') {
      console.error(`📦 [Products] Error fetching config:`, configError);
      return null;
    }
    
    const catalogEnabled =
      config?.is_active === true &&
      config?.send_to_ai === true;
    if (!catalogEnabled) {
      return null;
    }
    
    // Busca produtos ativos
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, price, stock, control_stock, description, send_description_with_images, category, link, sku, unit, image_url')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('name', { ascending: true });
    
    if (error) {
      console.error(`📦 [Products] Error fetching products:`, error);
      return null;
    }
    
    if (!products || products.length === 0) {
      return null;
    }
    
    console.log(`📦 [Products] Found ${products.length} active products for user ${userId}`);

    const productsWithMedia = await attachMediaToProducts(
      products || [],
      await fetchProductMediaRows({
        supabase,
        userId,
        productIds: (products || []).map((product: any) => String(product.id)),
      }),
    );

    const items: ProductForAI[] = (productsWithMedia || []).map((p: any) => {
      const mediaItems = Array.isArray(p.media_items) ? p.media_items : [];
      return {
        id: p.id,
        name: p.name,
        price: p.price ?? null,
        stock: typeof p.stock === 'number' ? p.stock : (parseInt(String(p.stock || '0'), 10) || 0),
        controlStock: p.control_stock === true,
        description: p.description ?? null,
        sendDescriptionWithImages: p.send_description_with_images === true,
        category: p.category ?? null,
        link: p.link ?? null,
        sku: p.sku ?? null,
        unit: p.unit || 'un',
        imageVariationsEnabled: config?.image_variations_enabled === true || mediaItems.some((image: any) => hasCatalogVariationMetadata(image)),
        images: mediaItems,
      };
    });

    return {
      active: true,
      userId,
      instructions: (config as any)?.ai_instructions ?? null,
      displayInstructions: (config as any)?.display_instructions ?? null,
      imageVariationsEnabled: config?.image_variations_enabled === true,
      products: items,
      count: items.length,
    };
  } catch (error) {
    console.error(`📦 [Products] Unexpected error:`, error);
    return null;
  }
}

function generateProductsPromptBlock(
  productsData: ProductsForAIResponse,
  options: { includeMauricioMfcLegacyPromptBlock?: boolean } = {},
): string {
  if (!productsData || !productsData.products || productsData.products.length === 0) {
    return '';
  }

  const productUsesImageVariations = (product: ProductForAI): boolean =>
    product.imageVariationsEnabled === true ||
    product.images.some((image) => hasCatalogVariationMetadata(image));
  
  // Formata preço em BRL
  const formatPrice = (price: string | null): string => {
    if (!price) return 'Consultar';
    const num = parseFloat(price);
    if (isNaN(num)) return price;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  
  // Agrupa por categoria se houver categorias
  const byCategory = new Map<string, ProductForAI[]>();
  const uncategorized: ProductForAI[] = [];
  
  for (const product of productsData.products) {
    if (product.category) {
      const list = byCategory.get(product.category) || [];
      list.push(product);
      byCategory.set(product.category, list);
    } else {
      uncategorized.push(product);
    }
  }
  
  let productsList = '';
  
  // Lista produtos por categoria
  for (const [category, products] of byCategory) {
    productsList += `\n📁 *${category}*:\n`;
    for (const p of products) {
      productsList += `  • ${p.name} - ${formatPrice(p.price)}`;
      if (p.controlStock) {
        productsList += p.stock > 0
          ? ` (${p.stock} ${p.unit} disponivel(is) agora)`
          : ` (indisponivel no momento)`;
      }
      if (p.images.length > 0) productsList += ` [${p.images.length} foto(s) disponivel(is)]`;
      if (productUsesImageVariations(p)) {
        const activeVariations = p.images.filter((image) => image.variation_is_active !== false);
        if (activeVariations.length > 0) {
          const variationSummary = activeVariations
            .slice(0, 6)
            .map((image) => {
              const parts: string[] = [];
              if (typeof image.variation_code === "number") {
                parts.push(`cod ${image.variation_code}`);
              }
              if (image.variation_name) {
                parts.push(`nome ${image.variation_name}`);
              }
              if (image.variation_price) {
                parts.push(formatPrice(image.variation_price));
              }
              if (typeof image.variation_stock === "number") {
                parts.push(`estoque ${image.variation_stock}`);
              }
              return parts.join(" | ");
            })
            .filter(Boolean);
          if (variationSummary.length > 0) {
            productsList += ` {variações: ${variationSummary.join("; ")}}`;
          }
        }
      }
      productsList += '\n';
    }
  }
  
  // Lista produtos sem categoria
  if (uncategorized.length > 0) {
    if (byCategory.size > 0) productsList += '\n📁 *Outros*:\n';
    for (const p of uncategorized) {
      productsList += `  • ${p.name} - ${formatPrice(p.price)}`;
      if (p.controlStock) {
        productsList += p.stock > 0
          ? ` (${p.stock} ${p.unit} disponivel(is) agora)`
          : ` (indisponivel no momento)`;
      }
      if (p.images.length > 0) productsList += ` [${p.images.length} foto(s) disponivel(is)]`;
      if (productUsesImageVariations(p)) {
        const activeVariations = p.images.filter((image) => image.variation_is_active !== false);
        if (activeVariations.length > 0) {
          const variationSummary = activeVariations
            .slice(0, 6)
            .map((image) => {
              const parts: string[] = [];
              if (typeof image.variation_code === "number") {
                parts.push(`cod ${image.variation_code}`);
              }
              if (image.variation_name) {
                parts.push(`nome ${image.variation_name}`);
              }
              if (image.variation_price) {
                parts.push(formatPrice(image.variation_price));
              }
              if (typeof image.variation_stock === "number") {
                parts.push(`estoque ${image.variation_stock}`);
              }
              return parts.join(" | ");
            })
            .filter(Boolean);
          if (variationSummary.length > 0) {
            productsList += ` {variações: ${variationSummary.join("; ")}}`;
          }
        }
      }
      productsList += '\n';
    }
  }
  
  // Instruções customizadas do usuário (comportamento)
  const customInstructions = productsData.instructions 
    ? `\n**INSTRUÇÕES ESPECIAIS DO ADMINISTRADOR:**\n${productsData.instructions}\n` 
    : '';
  
  // Instruções de exibição (formato de listagem)
  const displayInstructions = productsData.displayInstructions
    ? `\n**FORMATO DE APRESENTAÇÃO:**\n${productsData.displayInstructions}\n`
    : '\n**FORMATO DE APRESENTAÇÃO:**\nQuando o cliente pedir a lista, mostre cada produto em uma linha com nome e preço.\n';

  const mauricioMfcPromptBlock =
    options.includeMauricioMfcLegacyPromptBlock === false
      ? ""
      : buildMauricioMfcCatalogPromptBlock({
          userId: productsData.userId,
        });
  
  return `
═══════════════════════════════════════════════════════════════════════
📦 CATÁLOGO DE PRODUTOS/SERVIÇOS (${productsData.count} itens)
═══════════════════════════════════════════════════════════════════════

${productsList}
${customInstructions}
${displayInstructions}
${mauricioMfcPromptBlock}

**INSTRUÇÕES PARA USO DO CATÁLOGO:**
1. Use APENAS os produtos listados acima ao responder sobre preços, disponibilidade e detalhes
2. Se o cliente perguntar algo que não está na lista, diga que não tem essa informação
3. Informe preços exatamente como estão listados
4. Quando o produto estiver com controle de estoque ativo e o estoque for menor ou igual a zero, trate esse item como indisponível no momento
5. Quando o controle de estoque estiver desligado, não use o estoque como bloqueio de disponibilidade
6. Se um item estiver indisponível por estoque controlado, não ofereça envio de fotos, descrição ou link como se houvesse disponibilidade imediata
7. NUNCA invente produtos, preços ou informações que não estão na lista
8. Se houver link do produto, pode mencionar que "pode enviar o link" se relevante, desde que isso não contradiga a indisponibilidade atual
9. Se o cliente estiver claramente falando de um produto específico com fotos e esse item estiver disponível, o orquestrador pode enviar todas as imagens desse produto na ordem cadastrada
10. Se as fotos forem enviadas nesta mesma resposta, diga que está enviando agora ou apresente as fotos logo abaixo. Não pergunte "quer que eu envie?" quando as imagens já estiverem sendo anexadas
11. Quando o catálogo usar variações por imagem, trate cada foto como uma variação do mesmo produto com código próprio, preço próprio e estoque próprio quando esses dados existirem
12. Se o cliente enviar uma imagem e o sistema identificar uma variação do catálogo, use o código, o preço e o estoque dessa variação como referência principal da resposta
13. Quando uma variação estiver inativa, não a ofereça, não a envie e não a trate como opção disponível
14. Quando o cliente mencionar código de foto/variação, use somente o código exato listado no catálogo. Nunca troque por código vizinho, nunca suponha sequência e nunca preencha item por aproximação.
15. Se o cliente mencionar vários códigos, mantenha todos os itens separados no carrinho usando o código, nome e preço exatos de cada variação listada
16. Ao montar carrinho/orçamento, interprete o trecho completo de cada item pedido, não apenas as palavras depois do código.
17. Quantidade, tamanho e acabamento podem aparecer antes do nome, depois do nome ou depois do código; se estiverem no mesmo trecho do item, considere preenchidos.
18. Exemplos obrigatórios de leitura por item:
   - "2 painéis redondos 50x50 costurados" = quantidade 2, produto painel redondo, tamanho 50x50, acabamento costurado.
   - "1 cilindro do Hulk código 40 sem costura" = quantidade 1, código 40, produto cilindro/capa de cilindro, acabamento sem costura; não peça tamanho.
   - "1 painel lateral código 29 costurado" = quantidade 1, código 29, painel lateral, acabamento costurado; não peça tamanho.
19. Painel redondo exige tamanho 50x50 ou 1,50x1,50. Painel lateral, capa de cilindro e cilindro não exigem tamanho.
20. Se o cliente informou todos os dados obrigatórios de um item, nunca diga "falta informar" esse dado. Monte o item com subtotal e mantenha os itens em sequência contínua: Item 1, Item 2, Item 3, Item 4... sem limite artificial.

═══════════════════════════════════════════════════════════════════════
`;
}

async function maybeAttachCatalogProductImages(params: {
  clientMessage: string;
  assistantResponse: string;
  conversationHistory: Message[];
  productsData: ProductsForAIResponse | null;
  sentMedias: string[];
}): Promise<AgentRuntimeResponse["actions"]> {
  const { clientMessage, assistantResponse, conversationHistory, productsData, sentMedias } = params;

  if (!productsData?.products?.length) {
    return [];
  }

  const visualProducts = productsData.products.filter(
    (product) => product.images.length > 0 && isCatalogProductAvailable(product),
  );
  if (!visualProducts.length) {
    return [];
  }

  const mauricioMfcCurrentPhotoRequest =
    isMauricioMfcCatalogTenant({ userId: productsData.userId }) &&
    looksLikeMauricioMfcCatalogPhotoRequest(clientMessage);
  const catalogClientMessage = mauricioMfcCurrentPhotoRequest
    ? clientMessage
    : buildCatalogMediaRequestContext({
        clientMessage,
        conversationHistory,
      }) || clientMessage;
  const allowExplicitResend = isExplicitCatalogMediaResendRequest(catalogClientMessage);
  const mauricioMfcIncludeReady50x50Promo =
    isMauricioMfcCatalogTenant({ userId: productsData.userId }) &&
    looksLikeMauricioMfcReady50x50PromoRequest(catalogClientMessage);
  const mauricioMfcLineKind = isMauricioMfcCatalogTenant({ userId: productsData.userId })
    ? resolveMauricioMfcRequestedLineKind(catalogClientMessage)
    : null;
  const shouldAttachByReply = shouldAttachCatalogMediaForReply({
    clientMessage: catalogClientMessage,
    assistantResponse,
    allowExplicitResend,
  });
  const shouldAttachByKnownSubject = shouldForceCatalogMediaForKnownSubject({
    clientMessage: catalogClientMessage,
    products: visualProducts.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      description: product.description,
      price: product.price,
      imageVariationsEnabled:
        product.imageVariationsEnabled === true ||
        product.images.some((image) => hasCatalogVariationMetadata(image)),
      images: product.images.map((image) => ({
        id: image.id,
        storageUrl: image.storage_url,
        caption: image.caption,
        variationCode: image.variation_code,
        variationName: image.variation_name,
        variationPrice: image.variation_price,
        variationStock: image.variation_stock,
        variationIsActive: image.variation_is_active,
        displayOrder: image.display_order,
      })),
    })),
  });
  if (!shouldAttachByReply && !shouldAttachByKnownSubject) {
    return [];
  }

  const selection = await selectCatalogProductImage({
    userId: productsData.userId,
    clientMessage: catalogClientMessage,
    assistantResponse,
    conversationHistory: conversationHistory.map((message) => ({
      fromMe: !!message.fromMe,
      text: buildMessageCatalogReferenceText(message),
    })),
    products: visualProducts.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      description: product.description,
      price: product.price,
      imageVariationsEnabled:
        product.imageVariationsEnabled === true ||
        product.images.some((image) => hasCatalogVariationMetadata(image)),
      images: product.images.map((image) => ({
        id: image.id,
        storageUrl: image.storage_url,
        caption: image.caption,
        variationCode: image.variation_code,
        variationName: image.variation_name,
        variationPrice: image.variation_price,
        variationStock: image.variation_stock,
        variationIsActive: image.variation_is_active,
        displayOrder: image.display_order,
      })),
    })),
  });

  const selectedProductIds = Array.from(
    new Set(
      (selection.productIds && selection.productIds.length > 0
        ? selection.productIds
        : selection.productId
          ? [selection.productId]
          : []
      ).map((productId) => String(productId || "").trim()).filter(Boolean),
    ),
  );

  if (!selection.shouldSend || selectedProductIds.length === 0) {
    return [];
  }

  const alreadySentMedias = allowExplicitResend ? [] : [...sentMedias];
  const actions: AgentRuntimeResponse["actions"] = [];
  const appendedProducts: string[] = [];

  for (const productId of selectedProductIds) {
    const selectedProduct = visualProducts.find((product) => product.id === productId);
    if (!selectedProduct) {
      continue;
    }

    const productActions = buildCatalogProductDeliveryActions(
      selectedProduct,
      alreadySentMedias,
      {
        userId: productsData.userId,
        contextText: catalogClientMessage,
        mauricioMfcIncludeReady50x50Promo,
        mauricioMfcLineKind,
      },
    );

    if (productActions.length === 0) {
      continue;
    }

    appendedProducts.push(selectedProduct.name);
    for (const action of productActions) {
      const mediaName = String((action as { media_name?: string }).media_name || "").trim();
      if (mediaName) {
        alreadySentMedias.push(mediaName);
      }
      actions.push(action as AgentRuntimeResponse["actions"][number]);
    }
  }

  if (actions.length > 0) {
    console.log(`📦 [Products] ${actions.length} acao(oes) anexada(s) para ${appendedProducts.join(" | ")}`);
  }

  return actions;
}

function countCatalogImageDeliveryActions(actions: AgentRuntimeResponse["actions"]): number {
  return (actions || []).filter((action: any) => {
    const type = String(action?.type || "").trim();
    const mediaName = String(action?.media_name || action?.mediaName || "").trim().toUpperCase();
    return (
      type === "send_media_url" ||
      (type === "send_media" && mediaName.startsWith("CATALOG_PRODUCT_IMAGE:"))
    );
  }).length;
}

function hasCatalogImageDeliveryActions(actions: AgentRuntimeResponse["actions"]): boolean {
  return countCatalogImageDeliveryActions(actions) > 0;
}

function hasCatalogProductImageDeliveryAction(actions: AgentRuntimeResponse["actions"]): boolean {
  return (actions || []).some((action: any) => {
    const type = String(action?.type || "").trim();
    const mediaName = String(action?.media_name || action?.mediaName || "").trim().toUpperCase();
    return mediaName.startsWith("CATALOG_PRODUCT_IMAGE:") && (type === "send_media_url" || type === "send_media");
  });
}

export async function buildMauricioMfcCatalogMediaRecoveryActions(params: {
  userId: string;
  clientMessage: string;
  assistantResponse: string | null | undefined;
  conversationHistory: Message[];
  productsData: ProductsForAIResponse | null;
  sentMedias: string[];
  existingMediaActions?: AgentRuntimeResponse["actions"];
}): Promise<AgentRuntimeResponse["actions"]> {
  const assistantResponse = String(params.assistantResponse || "").trim();
  if (
    !assistantResponse ||
    !isMauricioMfcCatalogTenant({ userId: params.userId }) ||
    !params.productsData?.products?.length ||
    hasCatalogProductImageDeliveryAction(params.existingMediaActions || [])
  ) {
    return [];
  }

  const visualProducts = params.productsData.products.filter(
    (product) => product.images.length > 0 && isCatalogProductAvailable(product),
  );
  if (!visualProducts.length) {
    return [];
  }

  const catalogClientMessage = buildCatalogMediaRequestContext({
    clientMessage: params.clientMessage,
    conversationHistory: params.conversationHistory,
  }) || params.clientMessage;
  const allowExplicitResend = isExplicitCatalogMediaResendRequest(catalogClientMessage);
  const shouldRecover =
    shouldAttachCatalogMediaForReply({
      clientMessage: catalogClientMessage,
      assistantResponse,
      allowExplicitResend,
    }) ||
    shouldForceCatalogMediaForKnownSubject({
      clientMessage: catalogClientMessage,
      products: visualProducts.map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        description: product.description,
        price: product.price,
        imageVariationsEnabled:
          product.imageVariationsEnabled === true ||
          product.images.some((image) => hasCatalogVariationMetadata(image)),
        images: product.images.map((image) => ({
          id: image.id,
          storageUrl: image.storage_url,
          caption: image.caption,
          variationCode: image.variation_code,
          variationName: image.variation_name,
          variationPrice: image.variation_price,
          variationStock: image.variation_stock,
          variationIsActive: image.variation_is_active,
          displayOrder: image.display_order,
        })),
      })),
    });

  if (!shouldRecover) {
    return [];
  }

  const mauricioMfcCurrentPhotoRequest =
    isMauricioMfcCatalogTenant({ userId: params.userId }) &&
    looksLikeMauricioMfcCatalogPhotoRequest(params.clientMessage);
  return maybeAttachCatalogProductImages({
    clientMessage: mauricioMfcCurrentPhotoRequest ? params.clientMessage : catalogClientMessage,
    assistantResponse,
    conversationHistory: params.conversationHistory,
    productsData: params.productsData,
    sentMedias: params.sentMedias,
  });
}

function buildKnownSubjectCatalogDirectReply(actions: AgentRuntimeResponse["actions"]): string {
  const imageCount = countCatalogImageDeliveryActions(actions);
  const photoLabel = imageCount === 1 ? "a foto" : "as fotos";
  return `Tem sim. Vou te enviar ${photoLabel} desse tema agora. Me diga o codigo da arte que voce quer ou marque a foto escolhida.`;
}

const MAURICIO_MFC_ART_REFERENCE_MEDIA_REPLY_V522 = "MAURICIO_MFC_ART_REFERENCE_MEDIA_REPLY_V522";

function shouldUseMauricioMfcArtReferenceMediaReply(params: {
  userId?: string | null;
  actions: AgentRuntimeResponse["actions"];
}): boolean {
  if (!isMauricioMfcCatalogTenant({ userId: params.userId })) {
    return false;
  }

  const catalogImageActions = (params.actions || []).filter((action: any) => {
    const type = String(action?.type || "").trim();
    const mediaName = String(action?.media_name || action?.mediaName || "").trim().toUpperCase();
    return mediaName.startsWith("CATALOG_PRODUCT_IMAGE:") && (type === "send_media_url" || type === "send_media");
  });
  if (catalogImageActions.length === 0) {
    return false;
  }

  return catalogImageActions.every((action: any) => {
    const contextText = [
      action?.caption,
      action?.text,
      action?.media_name,
      action?.mediaName,
    ].filter(Boolean).join(" ");
    return isMauricioMfcArtReferenceCatalogText(contextText);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 🍕 SISTEMA DE DELIVERY - INTEGRAÇÃO COM IA PARA PEDIDOS
// ═══════════════════════════════════════════════════════════════════════
export function shouldRunTraditionalMediaSemanticRescue(params: {
  aiHadMediaIntent: boolean;
  explicitOperationalMediaRequest: boolean;
  hasTraditionalMedia: boolean;
  productsData: ProductsForAIResponse | null;
}): boolean {
  const {
    aiHadMediaIntent,
    explicitOperationalMediaRequest,
    hasTraditionalMedia,
    productsData,
  } = params;

  if (!hasTraditionalMedia) {
    return false;
  }

  if (aiHadMediaIntent || explicitOperationalMediaRequest) {
    return true;
  }

  return false;
}

function normalizeOperationalMediaText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function splitOperationalMediaGuidance(value: string | null | undefined): {
  positive: string;
  negative: string;
} {
  const normalized = normalizeOperationalMediaText(value);
  if (!normalized) {
    return { positive: "", negative: "" };
  }

  const exclusionMarkers = [
    "nunca use",
    "nao use",
    "não use",
    "jamais use",
    "evite usar",
    "exceto para",
  ];

  let cutoff = -1;
  for (const marker of exclusionMarkers) {
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex >= 0 && (cutoff === -1 || markerIndex < cutoff)) {
      cutoff = markerIndex;
    }
  }

  if (cutoff === -1) {
    return { positive: normalized, negative: "" };
  }

  return {
    positive: normalized.slice(0, cutoff).trim(),
    negative: normalized.slice(cutoff).trim(),
  };
}

function getOperationalMediaRequestTermGroups(message: string | null | undefined): string[][] {
  const normalized = normalizeOperationalMediaText(message);
  if (!normalized) {
    return [];
  }

  const groups: string[][] = [];

  if (
    normalized.includes("pix") ||
    normalized.includes("qr code") ||
    normalized.includes("qrcode")
  ) {
    groups.push(["pix", "qr code", "qrcode"]);
  }

  if (
    normalized.includes("endereco") ||
    normalized.includes("localizacao") ||
    normalized.includes("mapa") ||
    normalized.includes("como chegar") ||
    normalized.includes("onde fica") ||
    normalized.includes("fachada") ||
    normalized.includes("foto da loja")
  ) {
    groups.push([
      "endereco",
      "localizacao",
      "mapa",
      "como chegar",
      "onde fica",
      "fachada",
      "foto da loja",
      "entrada da loja",
    ]);
  }

  if (hasExplicitMediaPayloadLanguage(normalized) && isExplicitOperationalMediaRequest(normalized)) {
    groups.push([
      "foto",
      "fotos",
      "imagem",
      "imagens",
      "image",
      "video",
      "videos",
      "audio",
      "audios",
      "arquivo",
      "pdf",
      "documento",
      "anexo",
      "midia",
      "catalogo",
      "catologo",
      "material",
      "produto",
      "produtos",
      "item",
      "itens",
      "modelo",
      "modelos",
      "servico",
      "servicos",
      "cardapio",
      "antes e depois",
    ]);
  }

  return groups;
}

function hasExplicitMediaPayloadLanguage(message: string | null | undefined): boolean {
  const normalized = normalizeOperationalMediaText(message);
  if (!normalized) {
    return false;
  }

  return [
    "video",
    "audio",
    "imagem",
    "foto",
    "fotos",
    "arquivo",
    "pdf",
    "documento",
    "anexo",
    "midia",
    "catologo",
    "catalogo",
  ].some((term) => normalized.includes(term));
}

export function isOperationalTextOnlyFalsePositiveMediaIntent(params: {
  customerMessage: string | null | undefined;
  assistantResponse: string | null | undefined;
  mediaLibrary: Array<{
    name?: string | null;
    mediaType?: string | null;
    description?: string | null;
    whenToUse?: string | null;
    caption?: string | null;
    isActive?: boolean | null;
  }>;
}): boolean {
  const customerMessage = normalizeOperationalMediaText(params.customerMessage);
  const assistantResponse = normalizeOperationalMediaText(params.assistantResponse);

  if (!assistantResponse) {
    return false;
  }

  const customerRequestedOperationalTopic = isExplicitOperationalMediaRequest(customerMessage);
  if (!customerRequestedOperationalTopic) {
    return false;
  }

  const hasMatchingOperationalMedia = hasActiveTraditionalMediaForOperationalRequest({
    message: customerMessage || assistantResponse,
    mediaLibrary: params.mediaLibrary,
  });

  if (hasMatchingOperationalMedia || hasExplicitMediaPayloadLanguage(assistantResponse)) {
    return false;
  }

  const responseReferencesOperationalTopic =
    getOperationalMediaRequestTermGroups(assistantResponse).length > 0 ||
    assistantResponse.includes("chave pix") ||
    assistantResponse.includes("pix da loja") ||
    assistantResponse.includes("pagamento") ||
    assistantResponse.includes("pagar") ||
    assistantResponse.includes("dados para pagamento");

  return responseReferencesOperationalTopic || detectMediaSendingIntent(assistantResponse);
}

export function hasActiveTraditionalMediaForOperationalRequest(params: {
  message: string | null | undefined;
  mediaLibrary: Array<{
    name?: string | null;
    mediaType?: string | null;
    description?: string | null;
    whenToUse?: string | null;
    caption?: string | null;
    isActive?: boolean | null;
  }>;
}): boolean {
  const termGroups = getOperationalMediaRequestTermGroups(params.message);
  if (termGroups.length === 0) {
    return false;
  }

  return (params.mediaLibrary || []).some((media) => {
    if (media?.isActive === false || media?.mediaType === "flow") {
      return false;
    }

    const guidance = splitOperationalMediaGuidance(media?.whenToUse);
    const positiveMediaText = normalizeOperationalMediaText([
      media?.name,
      media?.mediaType,
      media?.description,
      media?.caption,
      guidance.positive,
    ].filter(Boolean).join(" "));
    const negativeMediaText = guidance.negative;

    if (!positiveMediaText) {
      return false;
    }

    return termGroups.some((terms) =>
      terms.some((term) =>
        positiveMediaText.includes(term) && !negativeMediaText.includes(term),
      ),
    );
  });
}

function trimCodeFenceBlock(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  const firstLineBreak = trimmed.indexOf("\n");
  if (firstLineBreak === -1) {
    return trimmed;
  }

  const withoutOpeningFence = trimmed.slice(firstLineBreak + 1);
  const closingFenceIndex = withoutOpeningFence.lastIndexOf("```");
  if (closingFenceIndex === -1) {
    return withoutOpeningFence.trim();
  }

  return withoutOpeningFence.slice(0, closingFenceIndex).trim();
}

function extractJsonObjectBlock(rawText: string): string | null {
  const trimmed = trimCodeFenceBlock(rawText);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return trimmed.slice(start, end + 1);
}

function sanitizeJsonForParsing(rawJson: string): string {
  let sanitized = "";
  let inString = false;
  let escaping = false;

  for (const char of rawJson) {
    if (escaping) {
      sanitized += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      sanitized += char;
      escaping = true;
      continue;
    }

    if (char === "\"") {
      sanitized += char;
      inString = !inString;
      continue;
    }

    if (inString) {
      const code = char.charCodeAt(0);
      if (code < 32) {
        sanitized += " ";
        continue;
      }
    }

    sanitized += char;
  }

  return sanitized;
}

function summarizeAvailableTraditionalMedia(
  mediaLibrary: Array<{
    name?: string | null;
    mediaType?: string | null;
    whenToUse?: string | null;
    isActive?: boolean | null;
  }>,
): string {
  const summarized = mediaLibrary
    .filter((media) => media?.isActive !== false && media?.mediaType !== "flow" && typeof media?.name === "string" && media.name.trim().length > 0)
    .slice(0, 12)
    .map((media, index) => {
      const mediaName = String(media.name || "").trim();
      const mediaType = String(media.mediaType || "midia").trim();
      const whenToUse = String(media.whenToUse || "sem orientacao cadastrada").trim();
      return `${index + 1}. ${mediaName} (${mediaType}) - ${whenToUse}`;
    });

  return summarized.length > 0 ? summarized.join("\n") : "Nenhuma midia tradicional disponivel.";
}

function summarizePlannedMediaActions(actions: AgentRuntimeResponse["actions"]): string {
  const summarized = (actions || []).map((action, index) => {
    if (action.type === "send_media") {
      return `${index + 1}. Biblioteca: ${action.media_name}`;
    }
    if (action.type === "send_media_url") {
      const caption = typeof action.caption === "string" && action.caption.trim().length > 0
        ? ` | legenda: ${action.caption.trim()}`
        : "";
      return `${index + 1}. URL: ${action.media_type}${caption}`;
    }
    if (action.type === "send_text") {
      return `${index + 1}. Texto auxiliar: ${String(action.text || "").trim()}`;
    }
    return `${index + 1}. Tipo nao mapeado`;
  });

  return summarized.length > 0 ? summarized.join("\n") : "Nenhuma acao de midia planejada.";
}










































interface MenuItemForAI {
  id: string;
  name: string;
  description: string | null;
  price: string;
  promotional_price: string | null;
  category_name: string | null;
  preparation_time: number;
  ingredients: string | null;
  serves: number;
  is_featured: boolean;
}

export interface DeliveryMenuForAIResponse {
  active: boolean;
  business_name: string | null;
  business_type: string;
  delivery_fee: number;
  min_order_value: number;
  estimated_delivery_time: number;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  payment_methods: string[];
  categories: { name: string; items: MenuItemForAI[] }[];
  total_items: number;
  displayInstructions: string | null;
}

async function getDeliveryMenuForAI(userId: string): Promise<DeliveryMenuForAIResponse | null> {
  try {
    // Verifica se o módulo de delivery está ativo
    const { data: config, error: configError } = await supabase
      .from('delivery_config')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (configError && configError.code !== 'PGRST116') {
      console.error(`🍕 [Delivery] Error fetching config:`, configError);
      return null;
    }
    
    const menuAllowed = config ? config.send_to_ai !== false : true;
    const deliveryActive = !!config?.is_active;
    if (!menuAllowed) {
      return null;
    }
    
    // Busca categorias ativas
    const { data: categories, error: catError } = await supabase
      .from('menu_categories')
      .select('id, name')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    
    if (catError) {
      console.error(`🍕 [Delivery] Error fetching categories:`, catError);
    }
    
    // Busca itens do cardápio disponíveis
    const { data: items, error: itemsError } = await supabase
      .from('menu_items')
      .select(`
        id, name, description, price, promotional_price, 
        category_id, preparation_time, ingredients, serves, is_featured,
        menu_categories(name)
      `)
      .eq('user_id', userId)
      .eq('is_available', true)
      .order('display_order', { ascending: true });
    
    if (itemsError) {
      console.error(`🍕 [Delivery] Error fetching items:`, itemsError);
      return null;
    }
    
    if (!items || items.length === 0) {
      return null;
    }
    
    // Agrupa itens por categoria
    const categoriesMap = new Map<string, MenuItemForAI[]>();
    
    for (const item of items) {
      const menuItem: MenuItemForAI = {
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        promotional_price: item.promotional_price,
        category_name: (item.menu_categories as any)?.name || null,
        preparation_time: item.preparation_time,
        ingredients: item.ingredients,
        serves: item.serves,
        is_featured: item.is_featured,
      };
      
      const categoryName = (item.menu_categories as any)?.name || 'Outros';
      const list = categoriesMap.get(categoryName) || [];
      list.push(menuItem);
      categoriesMap.set(categoryName, list);
    }
    
    // Converte para array de categorias ordenado
    const categoryList = Array.from(categoriesMap.entries()).map(([name, items]) => ({
      name,
      items
    }));
    
    console.log(`🍕 [Delivery] Found ${items.length} menu items for user ${userId}`);
    if (!deliveryActive) {
      console.log(`?? [Delivery] Delivery inativo, enviando card?pio em modo menu-only.`);
    }

    return {
      active: menuAllowed && items.length > 0,
      business_name: config?.business_name ?? null,
      business_type: config?.business_type ?? 'outros',
      delivery_fee: deliveryActive ? (parseFloat(config?.delivery_fee) || 0) : 0,
      min_order_value: deliveryActive ? (parseFloat(config?.min_order_value) || 0) : 0,
      estimated_delivery_time: deliveryActive ? (config?.estimated_delivery_time || 45) : 45,
      accepts_delivery: deliveryActive ? (config?.accepts_delivery ?? true) : false,
      accepts_pickup: deliveryActive ? (config?.accepts_pickup ?? true) : false,
      payment_methods: config?.payment_methods || ['Dinheiro', 'Cart?o', 'Pix'],
      categories: categoryList,
      total_items: items.length,
      displayInstructions: config?.display_instructions ?? null
    };
  } catch (error) {
    console.error(`🍕 [Delivery] Unexpected error:`, error);
    return null;
  }
}

// 🎨 FUNÇÃO AUXILIAR: Formata cardápio bonito para envio ao cliente
export function formatMenuForCustomer(deliveryData: DeliveryMenuForAIResponse): string {
  if (!deliveryData || !deliveryData.categories || deliveryData.categories.length === 0) {
    return '';
  }
  
  const formatPrice = (price: string | null): string => {
    if (!price) return 'Consultar';
    const num = parseFloat(price);
    if (isNaN(num)) return price;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  
  const businessTypeEmoji: Record<string, string> = {
    'pizzaria': '🍕',
    'hamburgueria': '🍔',
    'lanchonete': '🥪',
    'restaurante': '🍽️',
    'acai': '🍨',
    'japonesa': '🍣',
    'outros': '🍴'
  };
  
  const emoji = businessTypeEmoji[deliveryData.business_type] || '🍴';
  const businessName = deliveryData.business_name || 'Nosso Delivery';
  
  let menuText = `${emoji} *${businessName.toUpperCase()}*\n`;
  menuText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  const MAX_SECTION_CHARS = 350; // Limite para evitar seções muito grandes (margem de segurança)
  
  for (const category of deliveryData.categories) {
    menuText += `📁 *${category.name}*\n\n`;
    
    let currentSection = '';
    let itemCount = 0;
    
    for (const item of category.items) {
      const price = item.promotional_price 
        ? `~${formatPrice(item.price)}~ *${formatPrice(item.promotional_price)}* 🔥` 
        : `*${formatPrice(item.price)}*`;
      
      // Cada produto em uma linha bem formatada
      const itemLine = `${item.is_featured ? '⭐ ' : '▪️ '}${item.name}`;
      let itemText = `${itemLine}\n`;
      
      if (item.description) {
        itemText += `   _${item.description}_\n`;
      }
      
      itemText += `   💰 ${price}`;
      if (item.serves > 1) itemText += ` • Serve ${item.serves}`;
      itemText += '\n\n';
      
      // Se adicionar este item ultrapassar o limite, fecha a seção atual
      if (currentSection.length + itemText.length > MAX_SECTION_CHARS && currentSection.length > 0) {
        menuText += currentSection;
        menuText += '\n'; // Quebra dupla para separar sub-seções da mesma categoria
        currentSection = itemText;
      } else {
        currentSection += itemText;
      }
      
      itemCount++;
    }
    
    // Adiciona o restante da seção
    if (currentSection) {
      menuText += currentSection;
    }
    
    // Quebra dupla entre categorias
    if (deliveryData.categories.indexOf(category) < deliveryData.categories.length - 1) {
      menuText += '\n';
    }
  }
  
  // Informações de entrega
  const paymentMethods = deliveryData.payment_methods.join(', ');
  menuText += `━━━━━━━━━━━━━━━━━━━━\n`;
  menuText += `📋 *INFORMAÇÕES*\n\n`;
  
  if (deliveryData.accepts_delivery) {
    menuText += `🛵 Entrega: ${formatPrice(String(deliveryData.delivery_fee))}\n`;
    menuText += `⏱️ Tempo estimado: ${deliveryData.estimated_delivery_time} min\n`;
  }
  
  if (deliveryData.accepts_pickup) {
    menuText += `🏪 Retirada: GRÁTIS\n`;
  }
  
  if (deliveryData.min_order_value > 0) {
    menuText += `📦 Pedido mínimo: ${formatPrice(String(deliveryData.min_order_value))}\n`;
  }
  
  menuText += `💳 Pagamento: ${paymentMethods}`;
  
  return menuText;
}

function generateDeliveryPromptBlock(deliveryData: DeliveryMenuForAIResponse): string {
  // 🚨 LOG AGRESSIVO - INÍCIO DA FUNÇÃO
  console.log(`\n🚨🚨🚨 [generateDeliveryPromptBlock] ENTRADA 🚨🚨🚨`);
  console.log(`🚨 [generateDeliveryPromptBlock] business_name: ${deliveryData?.business_name}`);
  console.log(`🚨 [generateDeliveryPromptBlock] total_items: ${deliveryData?.total_items}`);
  console.log(`🚨 [generateDeliveryPromptBlock] displayInstructions: "${deliveryData?.displayInstructions?.substring(0, 150) || 'NULL/VAZIO'}..."`);
  
  if (!deliveryData || !deliveryData.categories || deliveryData.categories.length === 0) {
    console.log(`🚨 [generateDeliveryPromptBlock] RETORNANDO VAZIO - sem dados ou categorias`);
    return '';
  }
  
  // Formata preço em BRL
  const formatPrice = (price: string | null): string => {
    if (!price) return 'Consultar';
    const num = parseFloat(price);
    if (isNaN(num)) return price;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  
  // Tipos de negócio com emoji
  const businessTypeEmoji: Record<string, string> = {
    'pizzaria': '🍕',
    'hamburgueria': '🍔',
    'lanchonete': '🥪',
    'restaurante': '🍽️',
    'acai': '🍨',
    'japonesa': '🍣',
    'outros': '🍴'
  };
  
  const emoji = businessTypeEmoji[deliveryData.business_type] || '🍴';
  const businessName = deliveryData.business_name || 'Nosso Delivery';
  
  // Monta o cardápio para o prompt da IA (formato compacto)
  let menuText = '';
  
  for (const category of deliveryData.categories) {
    menuText += `\n📁 *${category.name}*:\n`;
    for (const item of category.items) {
      const price = item.promotional_price 
        ? `~${formatPrice(item.price)}~ ${formatPrice(item.promotional_price)} (PROMO!)` 
        : formatPrice(item.price);
      
      menuText += `  ${item.is_featured ? '⭐ ' : '• '}${item.name} - ${price}`;
      if (item.serves > 1) menuText += ` (serve ${item.serves})`;
      menuText += '\n';
      
      if (item.description) {
        menuText += `    _${item.description}_\n`;
      }
    }
  }
  
  // Formas de pagamento
  const paymentMethods = deliveryData.payment_methods.join(', ');

  // Montar instrução de apresentação
  const displayInstructionsText = deliveryData.displayInstructions 
    ? deliveryData.displayInstructions.trim()
    : '';
  
  // Se as instruções pedem para perguntar primeiro, não usar tag ENVIAR_CARDAPIO_COMPLETO automaticamente
  const askFirstKeywords = ['pergunt', 'primeiro', 'antes', 'categorias', 'quer ver'];
  const shouldAskFirst = askFirstKeywords.some(kw => displayInstructionsText.toLowerCase().includes(kw));
  
  // LOG SUPER AGRESSIVO - DETECCAO DO MODO PERGUNTAR PRIMEIRO
  console.log(`\n🚨🚨🚨 [PERGUNTAR PRIMEIRO] VERIFICAÇÃO 🚨🚨🚨`);
  console.log(`🚨 displayInstructionsText (${displayInstructionsText.length} chars): "${displayInstructionsText.substring(0, 200)}..."`);
  console.log(`🚨 askFirstKeywords: ${JSON.stringify(askFirstKeywords)}`);
  console.log(`🚨 shouldAskFirst = ${shouldAskFirst}`);
  askFirstKeywords.forEach(kw => {
    const found = displayInstructionsText.toLowerCase().includes(kw);
    console.log(`🚨   - "${kw}": ${found ? '✅ ENCONTRADO' : '❌ não'}`);
  });
  if (shouldAskFirst) {
    console.log(`🚨🚨🚨 [PERGUNTAR PRIMEIRO] ⚠️⚠️⚠️ MODO ATIVO! CARDÁPIO NÃO SERÁ INCLUÍDO! 🚨🚨🚨\n`);
  } else {
    console.log(`🚨 [PERGUNTAR PRIMEIRO] Modo NÃO ativo - cardápio será incluído no prompt\n`);
  }
  
  // Gerar lista de categorias para referência (com emojis)
  const categoryList = deliveryData.categories
    .filter(c => c.items && c.items.length > 0)
    .map(c => `${c.name} (${c.items.length} itens)`)
    .join(', ');
    
  // Lista de categorias formatada para apresentação ao cliente
  const categoryListFormatted = deliveryData.categories
    .filter(c => c.items && c.items.length > 0)
    .map(c => c.name)
    .join(', ');

  // 🔥 IMPORTANTE: Se shouldAskFirst=true, NÃO incluir o cardápio detalhado
  // Isso FORÇA a IA a perguntar a categoria porque ela não tem os itens para mostrar
  const menuSection = shouldAskFirst 
    ? `📁 **CATEGORIAS DISPONÍVEIS:** ${categoryList}

⚠️ **CARDÁPIO DETALHADO NÃO CARREGADO PROPOSITALMENTE**
O cardápio completo será enviado APENAS quando você usar [ENVIAR_CARDAPIO_COMPLETO] ou [ENVIAR_CATEGORIA: nome].
Por enquanto, você só sabe as CATEGORIAS - então PERGUNTE qual o cliente quer ver!`
    : `📁 **CATEGORIAS DISPONÍVEIS:** ${categoryList}

${menuText}`;

  return `
═══════════════════════════════════════════════════════════════════════
${emoji} CARDÁPIO - ${businessName.toUpperCase()} (${deliveryData.total_items} itens)
═══════════════════════════════════════════════════════════════════════

${menuSection}
${deliveryData.accepts_delivery ? `• Entrega: Taxa de ${formatPrice(String(deliveryData.delivery_fee))} | Tempo estimado: ~${deliveryData.estimated_delivery_time} min` : ''}
${deliveryData.accepts_pickup ? '• Retirada no local: GRÁTIS' : ''}
${deliveryData.min_order_value > 0 ? `• Pedido mínimo: ${formatPrice(String(deliveryData.min_order_value))}` : ''}
• Formas de pagamento: ${paymentMethods}

${displayInstructionsText ? `
**📝 INSTRUÇÕES DE APRESENTAÇÃO (SIGA ESTAS REGRAS OBRIGATORIAMENTE):**
${displayInstructionsText}
` : ''}

═══════════════════════════════════════════════════════════════════════
${shouldAskFirst ? `
🎯 **MODO DE ATENDIMENTO: PERGUNTAR CATEGORIA PRIMEIRO** 🎯
═══════════════════════════════════════════════════════════════════════

Você é um atendente que **SEMPRE pergunta a categoria** antes de mostrar produtos.
É assim que você funciona - é sua natureza, não uma regra a ser quebrada.

📌 **COMO VOCÊ ATENDE:**
Quando o cliente quiser ver o cardápio/menu/produtos:
1. Você responde de forma simpática perguntando qual categoria ele quer ver
2. Exemplo: "Oi! 😊 Temos: ${categoryList}. Qual você quer ver primeiro?"

📌 **QUANDO ELE ESCOLHER A CATEGORIA:**
Use a tag para mostrar APENAS aquela categoria:
[ENVIAR_CATEGORIA: nome_da_categoria]

Exemplo prático:
- Cliente: "Quero ver o cardápio"
- Você: "Claro! Temos ${categoryList}. Qual te interessa?"
- Cliente: "Pizzas"
- Você: "Aqui estão nossas pizzas! 🍕 [ENVIAR_CATEGORIA: Pizzas]"

📌 **CARDÁPIO COMPLETO - APENAS SE PEDIR EXPLICITAMENTE:**
Se o cliente disser "quero ver TUDO" ou "cardápio COMPLETO", use:
[ENVIAR_CARDAPIO_COMPLETO]

⚠️ **IMPORTANTE:**
- NÃO liste preços/itens manualmente - use as tags
- NÃO envie tudo de primeira - pergunte a categoria
- É assim que você atende - com calma, perguntando primeiro
` : `
🚨🚨🚨 REGRA ABSOLUTAMENTE CRÍTICA E OBRIGATÓRIA 🚨🚨🚨
═══════════════════════════════════════════════════════════════════════

QUANDO O CLIENTE PERGUNTAR SOBRE CARDÁPIO, MENU OU PRODUTOS:
- "Qual o cardápio?" / "O que tem?" / "Me manda o menu" / "Quais produtos?" / etc.

⚠️ VOCÊ É OBRIGADO A RESPONDER COM ESTA TAG NO INÍCIO:
[ENVIAR_CARDAPIO_COMPLETO]

EXEMPLO CORRETO (COPIE ESTE FORMATO):
---
[ENVIAR_CARDAPIO_COMPLETO]

Aqui está nosso cardápio completo! Me avise se quiser fazer um pedido 😊
---

⛔ PROIBIDO: Listar itens/preços manualmente. O sistema inserirá o cardápio completo automaticamente.
⛔ PROIBIDO: Inventar ou resumir o cardápio. Use APENAS a tag.
⛔ PROIBIDO: Citar bebidas, pizzas ou qualquer item sem usar a tag primeiro.

✅ A TAG [ENVIAR_CARDAPIO_COMPLETO] será substituída pelo cardápio formatado bonitinho automaticamente.
`}

**INSTRUÇÕES PARA ATENDIMENTO DE PEDIDOS:**
1. Seja SIMPÁTICO e NATURAL como um atendente humano de ${deliveryData.business_type}
2. 🔴 **REGRA OBRIGATÓRIA - PRIMEIRA MENSAGEM:** Se o cliente NÃO se apresentou com nome, você DEVE perguntar "Qual é o seu nome?" ou "Como você prefere que eu te chame?" ANTES de mostrar cardápio ou falar de produtos. NÃO use "Visitante" - peça o nome real!
3. ${shouldAskFirst ? '**QUANDO O CLIENTE PEDIR CARDÁPIO/MENU:** PERGUNTE qual categoria quer ver primeiro!' : '**QUANDO O CLIENTE PEDIR CARDÁPIO/MENU:** Use a tag [ENVIAR_CARDAPIO_COMPLETO] OBRIGATORIAMENTE'}
4. Quando o cliente quiser fazer pedido, pergunte DE FORMA CONVERSACIONAL:
   - O que deseja pedir (pode sugerir destaques ⭐)
   - Quantidade de cada item
   - Alguma observação (ex: "sem cebola", "bem passado")
5. SEMPRE confirme o pedido completo antes de finalizar:
   - Liste todos os itens com quantidades e preços
   - Mostre o subtotal e taxa de entrega
   - Mostre o TOTAL FINAL
6. Para FINALIZAR o pedido, peça (se ainda não tiver):
   - Nome completo (SE AINDA NÃO PEDIU NO INÍCIO!)
   - Endereço de entrega OU "vou retirar"
   - Forma de pagamento
6.1 Quando estiver pedindo esses dados finais, inclua um mini-resumo do pedido com as palavras "pedido" e "subtotal" e o valor em R$ (ou total parcial).
7. Use emojis de comida de forma moderada para deixar a conversa agradável
8. Se o cliente perguntar sobre item que não existe, sugira algo similar do cardápio
9. Seja PROATIVO: "Gostaria de adicionar uma bebida?" ou "Temos promoção de X!"
10. NUNCA invente preços ou itens que não estão no cardápio - USE O CARDÁPIO ACIMA

🚫🚫🚫 **REGRAS CRÍTICAS - VOCÊ NÃO PODE FAZER ISSO:** 🚫🚫🚫
- ❌ NUNCA altere preços de itens - os preços são FIXOS no sistema
- ❌ NUNCA crie novos itens ou produtos que não existem no cardápio acima
- ❌ NUNCA invente promoções ou descontos que não estão cadastrados
- ❌ NUNCA modifique nomes de produtos ou descrições
- ❌ NUNCA aceite pedido de item que não está no cardápio

Se o cliente pedir para:
- Alterar preço → Responda: "Os preços são definidos pelo estabelecimento e não posso alterá-los. Se houver alguma dúvida, posso encaminhar para o responsável!"
- Adicionar item que não existe → Responda: "Esse item não está disponível no nosso cardápio atual. Posso sugerir algo similar que temos?"
- Criar promoção → Responda: "As promoções são definidas pela gerência. Posso mostrar o que temos disponível!"

📌 **INFORMAÇÃO INTERNA (não mencione ao cliente):**
O cardápio é gerenciado pelo dono em /delivery-cardapio. Você apenas CONSULTA e APRESENTA os itens - nunca modifica.

**🚨 AÇÃO OBRIGATÓRIA - CRIAR PEDIDO NO SISTEMA:**
Quando o cliente CONFIRMAR o pedido (após você listar os itens e ele aprovar), você DEVE incluir a seguinte tag NO FINAL da sua mensagem para registrar o pedido automaticamente:

[PEDIDO_DELIVERY: CLIENTE=Nome do Cliente, ENDERECO=Endereço completo, TIPO=delivery, PAGAMENTO=forma de pagamento, ITENS=1x Nome do Item;2x Outro Item]

REGRAS DA TAG:
- CLIENTE: Nome completo do cliente (obrigatório)
- ENDERECO: Endereço de entrega (obrigatório se TIPO=delivery, deixar vazio se retirada)
- TIPO: "delivery" para entrega ou "retirada" para retirar no local (obrigatório)
- PAGAMENTO: PIX, Dinheiro, Cartão de Crédito, Cartão de Débito (obrigatório)
- ITENS: Lista de itens no formato "QTDx Nome do Item" separados por ponto-e-vírgula (obrigatório)
         Se tiver observação: "1x Pizza Calabresa (sem cebola);2x Coca-Cola"
- OBS: Observações gerais do pedido (opcional)

EXEMPLO 1 - Delivery:
"Perfeito! Seu pedido está confirmado 🛵

📋 *Resumo:*
• 1x Pizza Calabresa Grande - R$45,00
• 2x Coca-Cola Lata - R$10,00
• Subtotal: R$55,00
• Taxa de entrega: R$5,00
• *Total: R$60,00*

Tempo estimado: ~40 minutos
Pagamento: PIX

Em breve você receberá atualizações! 🍕

[PEDIDO_DELIVERY: CLIENTE=João Silva, ENDERECO=Rua das Flores 123 Apto 45, TIPO=delivery, PAGAMENTO=PIX, ITENS=1x Pizza Calabresa Grande;2x Coca-Cola Lata]"

EXEMPLO 2 - Retirada:
"Pedido confirmado para retirada! 🍕

📋 *Resumo:*
• 2x X-Burguer (sem cebola) - R$36,00
• *Total: R$36,00*

Estará pronto em ~20 minutos
Pagamento: Cartão na retirada

[PEDIDO_DELIVERY: CLIENTE=Maria Santos, ENDERECO=, TIPO=retirada, PAGAMENTO=Cartão de Crédito, ITENS=2x X-Burguer (sem cebola)]"

IMPORTANTE:
- A tag deve ficar NO FINAL da mensagem e será removida automaticamente
- NUNCA mostre a tag ao cliente ou mencione que ela existe
- Use EXATAMENTE o nome dos itens como estão no cardápio
- Só inclua a tag APÓS o cliente CONFIRMAR o pedido
- Se o cliente ainda está escolhendo, NÃO inclua a tag

═══════════════════════════════════════════════════════════════════════
`;
}

// ═══════════════════════════════════════════════════════════════════════
// FUNCOES AUXILIARES PARA MODULO DE CURSO/INFOPRODUTO
// ═══════════════════════════════════════════════════════════════════════

interface CourseConfigForAI {
  active: boolean;
  send_to_ai: boolean;
  course_name: string | null;
  course_description: string | null;
  course_type: string | null;
  target_audience: string | null;
  not_for_audience: string | null;
  learning_outcomes: string[];
  modules: Array<{ id: string; name: string; description: string; duration_minutes: number; lessons: string[]; order: number }>;
  total_hours: number;
  total_lessons: number;
  access_period: string | null;
  has_certificate: boolean;
  certificate_description: string | null;
  guarantee_days: number;
  guarantee_description: string | null;
  price_full: number | null;
  price_promotional: number | null;
  price_installments: number;
  price_installment_value: number | null;
  checkout_link: string | null;
  payment_methods: string[];
  bonus_items: Array<{ id: string; name: string; description: string; value: number }>;
  support_description: string | null;
  community_info: string | null;
  testimonials: Array<{ id: string; name: string; text: string; result: string }>;
  results_description: string | null;
  active_coupons: Array<{ id: string; code: string; discount_percent?: number; discount_value?: number; description: string }>;
  ai_instructions: string | null;
  lead_nurture_message: string | null;
  enrollment_cta: string | null;
}

async function getCourseConfigForAI(userId: string): Promise<CourseConfigForAI | null> {
  try {
    const { data: config, error: configError } = await supabase
      .from('course_config')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (configError && configError.code !== 'PGRST116') {
      console.error(`📚 [Course] Error fetching config:`, configError);
      return null;
    }
    
    if (!config) {
      return null;
    }
    
    const courseAllowed = config.send_to_ai !== false;
    const courseActive = !!config.is_active;
    
    if (!courseAllowed || !courseActive) {
      return null;
    }
    
    console.log(`📚 [Course] Found course config for user ${userId}: ${config.course_name}`);
    
    return {
      active: courseActive && courseAllowed,
      send_to_ai: courseAllowed,
      course_name: config.course_name,
      course_description: config.course_description,
      course_type: config.course_type || 'curso_online',
      target_audience: config.target_audience,
      not_for_audience: config.not_for_audience,
      learning_outcomes: config.learning_outcomes || [],
      modules: config.modules || [],
      total_hours: parseFloat(config.total_hours) || 0,
      total_lessons: config.total_lessons || 0,
      access_period: config.access_period || 'vitalício',
      has_certificate: config.has_certificate ?? true,
      certificate_description: config.certificate_description,
      guarantee_days: config.guarantee_days || 7,
      guarantee_description: config.guarantee_description,
      price_full: config.price_full ? parseFloat(config.price_full) : null,
      price_promotional: config.price_promotional ? parseFloat(config.price_promotional) : null,
      price_installments: config.price_installments || 12,
      price_installment_value: config.price_installment_value ? parseFloat(config.price_installment_value) : null,
      checkout_link: config.checkout_link,
      payment_methods: config.payment_methods || ['pix', 'cartao_credito', 'boleto'],
      bonus_items: config.bonus_items || [],
      support_description: config.support_description,
      community_info: config.community_info,
      testimonials: config.testimonials || [],
      results_description: config.results_description,
      active_coupons: config.active_coupons || [],
      ai_instructions: config.ai_instructions,
      lead_nurture_message: config.lead_nurture_message,
      enrollment_cta: config.enrollment_cta,
    };
  } catch (error) {
    console.error(`📚 [Course] Unexpected error:`, error);
    return null;
  }
}

function generateCoursePromptBlock(courseData: CourseConfigForAI): string {
  if (!courseData || !courseData.active) {
    return '';
  }
  
  const formatPrice = (price: number | null): string => {
    if (!price) return 'Consultar';
    return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  
  const courseName = courseData.course_name || 'Curso';
  
  // Formatar módulos
  let modulesText = '';
  if (courseData.modules && courseData.modules.length > 0) {
    modulesText = courseData.modules.map((m, i) => 
      `  ${i + 1}. ${m.name}${m.description ? ` - ${m.description}` : ''}`
    ).join('\n');
  }
  
  // Formatar bônus
  let bonusText = '';
  if (courseData.bonus_items && courseData.bonus_items.length > 0) {
    bonusText = courseData.bonus_items.map(b => 
      `  🎁 ${b.name}${b.value ? ` (valor: ${formatPrice(b.value)})` : ''}`
    ).join('\n');
  }
  
  // Formatar depoimentos (máx 3)
  let testimonialsText = '';
  if (courseData.testimonials && courseData.testimonials.length > 0) {
    testimonialsText = courseData.testimonials.slice(0, 3).map(t => 
      `  ⭐ "${t.text}" - ${t.name}${t.result ? ` (${t.result})` : ''}`
    ).join('\n\n');
  }
  
  // Formatar cupons
  let couponsText = '';
  if (courseData.active_coupons && courseData.active_coupons.length > 0) {
    couponsText = courseData.active_coupons.map(c => 
      `  🎟️ ${c.code}: ${c.discount_percent ? c.discount_percent + '% OFF' : formatPrice(c.discount_value || 0) + ' OFF'}`
    ).join('\n');
  }
  
  // Preço formatado
  const priceInfo = courseData.price_promotional && courseData.price_promotional < (courseData.price_full || 0)
    ? `~${formatPrice(courseData.price_full)}~ *${formatPrice(courseData.price_promotional)}* 🔥 PROMOÇÃO!`
    : formatPrice(courseData.price_full);
  
  const installmentInfo = courseData.price_installment_value 
    ? `ou ${courseData.price_installments}x de ${formatPrice(courseData.price_installment_value)}`
    : courseData.price_full 
      ? `ou em até ${courseData.price_installments}x`
      : '';

  return `
═══════════════════════════════════════════════════════════════════════
📚 INFORMAÇÕES DO CURSO: ${courseName.toUpperCase()}
═══════════════════════════════════════════════════════════════════════

📝 *DESCRIÇÃO:*
${courseData.course_description || 'Curso completo para transformar seu conhecimento.'}

🎯 *PARA QUEM É ESTE CURSO:*
${courseData.target_audience || 'Pessoas interessadas em aprender e evoluir.'}

${courseData.not_for_audience ? `❌ *PARA QUEM NÃO É:*\n${courseData.not_for_audience}\n` : ''}

📖 *CONTEÚDO DO CURSO:*
${courseData.total_hours > 0 ? `• ${courseData.total_hours} horas de conteúdo` : ''}
${courseData.total_lessons > 0 ? `• ${courseData.total_lessons} aulas` : ''}
${modulesText ? `\n*Módulos:*\n${modulesText}` : ''}

💰 *INVESTIMENTO:*
• ${priceInfo}
${installmentInfo ? `• ${installmentInfo}` : ''}
• Formas de pagamento: ${courseData.payment_methods.map(p => p.replace('_', ' ')).join(', ')}

✅ *GARANTIA: ${courseData.guarantee_days} dias*
${courseData.guarantee_description || 'Garantia incondicional de satisfação. Se não gostar, devolvemos seu dinheiro.'}

📱 *ACESSO:*
• Período: ${courseData.access_period || 'Vitalício'}
${courseData.has_certificate ? `• 🎓 Inclui Certificado${courseData.certificate_description ? `: ${courseData.certificate_description}` : ''}` : ''}

${bonusText ? `🎁 *BÔNUS INCLUSOS:*\n${bonusText}\n` : ''}

${courseData.support_description ? `💬 *SUPORTE:*\n${courseData.support_description}\n` : ''}
${courseData.community_info ? `👥 *COMUNIDADE:*\n${courseData.community_info}\n` : ''}

${testimonialsText ? `⭐ *DEPOIMENTOS DE ALUNOS:*\n${testimonialsText}\n` : ''}

${courseData.results_description ? `📈 *RESULTADOS:*\n${courseData.results_description}\n` : ''}

${couponsText ? `🎟️ *CUPONS ATIVOS:*\n${couponsText}\n` : ''}

${courseData.checkout_link ? `🔗 *LINK DE INSCRIÇÃO:* ${courseData.checkout_link}` : ''}

═══════════════════════════════════════════════════════════════════════
🚨 INSTRUÇÕES PARA ATENDIMENTO DE VENDA DE CURSO 🚨
═══════════════════════════════════════════════════════════════════════

${courseData.ai_instructions || 'Você é um especialista em vendas de infoprodutos. Seja empático, mostre o valor do curso e sempre mencione a garantia.'}

**REGRAS ABSOLUTAMENTE OBRIGATÓRIAS:**

1. 🔴 **NUNCA INVENTE INFORMAÇÕES!**
   - NUNCA invente preços diferentes dos listados acima
   - NUNCA invente depoimentos ou resultados de alunos
   - NUNCA invente módulos ou conteúdo que não exista
   - Se não souber algo, diga: "Vou confirmar essa informação e te retorno" ou "Posso transferir para um atendente humano"

2. ✅ **SEMPRE MENCIONE A GARANTIA JUNTO COM O PREÇO:**
   Quando falar de preço, SEMPRE lembre: "E você tem ${courseData.guarantee_days} dias de garantia. Se não gostar, devolvemos seu dinheiro."

3. 🎯 **QUALIFIQUE O LEAD:**
   - Entenda a situação atual do cliente
   - Identifique a dor/problema
   - Mostre como o curso resolve
   - Use perguntas: "O que te atraiu no curso?" / "Qual resultado você busca?"

4. 💰 **TRATE OBJEÇÕES COM EMPATIA:**
   - "Está caro" → Mostre o valor + garantia + parcelamento
   - "Preciso pensar" → "Claro! Qual ponto te deixou em dúvida?" + ${courseData.lead_nurture_message || 'Quando estiver pronto(a), é só me chamar!'}
   - "Não tenho tempo" → Mostre flexibilidade do acesso ${courseData.access_period || 'vitalício'}

5. 🛒 **PARA FECHAR A VENDA:**
   ${courseData.enrollment_cta || 'Garanta sua vaga com desconto especial!'}
   ${courseData.checkout_link ? `Link: ${courseData.checkout_link}` : 'Posso enviar o link de pagamento para você?'}

6. 📞 **SE O CLIENTE INSISTIR EM FALAR COM HUMANO:**
   Respeite e diga: "Sem problemas! Vou encaminhar para nossa equipe de atendimento."

7. ❓ **QUANDO O CLIENTE FECHAR UM AGENDAMENTO:**
   - Se houver confirmacao clara de data, horario, periodo, call, reuniao ou aula, confirme o combinado sem inventar nada
   - Termine a resposta com uma pergunta curta para manter a conversa em andamento
   - Essa pergunta deve ser diretamente ligada ao proximo passo do cliente

8. 🕐 **AGENDA SEM HORARIO PASSADO:**
   - Use sempre a data e a hora atual do Brasil que vieram no contexto dinamico desta conversa
   - Nunca ofereca nem confirme um horario que ja passou no Brasil
   - Se o horario limite de hoje ja tiver passado, avance a conversa para amanha ou para o proximo dia util coerente com o prompt do negocio
   - Se o prompt diferenciar segunda a sexta, sabado e domingo, respeite isso antes de sugerir qualquer data

**FLUXO IDEAL DE CONVERSA:**
INÍCIO → QUALIFICAÇÃO → FAQ/EXPLICAÇÃO → PREÇOS → TRATAMENTO OBJEÇÕES → FECHAMENTO

**NUNCA:**
- Force a venda se o cliente não estiver pronto
- Minta sobre resultados
- Ignore objeções legítimas
- Seja agressivo ou insistente demais

═══════════════════════════════════════════════════════════════════════
`;
}

// ═══════════════════════════════════════════════════════════════════════
// VERIFICACAO DE SUSPENSAO POR VIOLACAO DE POLITICAS
// ═══════════════════════════════════════════════════════════════════════
async function checkUserSuspension(userId: string): Promise<boolean> {
  try {
    const suspensionStatus = await storage.isUserSuspended(userId);
    if (suspensionStatus.suspended) {
      console.log(`🚫 [AI Agent] Usuário ${userId} está SUSPENSO - IA desativada (${suspensionStatus.data?.type})`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`⚠️ [AI Agent] Erro ao verificar suspensão do usuário ${userId}:`, error);
    return true; // Fail-closed: sem verificacao de suspensao, nao gerar fala publica.
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🌅 FUNÇÃO DE SAUDAÇÃO BASEADA NO HORÁRIO DO BRASIL
// ═══════════════════════════════════════════════════════════════════════
function getBrazilGreeting(): { greeting: string; period: string } {
  const brazilTime = getBrazilTimeDate();
  const hour = brazilTime.getHours();
  const greeting = getBrazilGreetingForHour(hour);
  
  if (greeting === "Bom dia") {
    return { greeting, period: "manhã" };
  }

  if (greeting === "Boa tarde") {
    return { greeting, period: "tarde" };
  }

  return { greeting, period: "noite" };
}

// ═══════════════════════════════════════════════════════════════════════
// 🕐 FUNÇÃO PARA OBTER DATA/HORA DO BRASIL (UNIVERSAL)
// ═══════════════════════════════════════════════════════════════════════
// NOTA: Esta função é ESSENCIAL para clientes que têm horário de atendimento
// no prompt. A IA precisa saber a data/hora atual para verificar se está
// dentro ou fora do horário comercial.
// ═══════════════════════════════════════════════════════════════════════
interface BrazilDateTime {
  date: string;           // "23/01/2026"
  time: string;           // "14:30"
  hour: number;           // 14
  minute: number;         // 30
  dayOfWeek: number;      // 0-6 (Domingo-Sábado)
  dayName: string;        // "Quinta-feira"
  dayNameAbrev: string;   // "QUI"
  isWeekend: boolean;     // true se sábado ou domingo
  fullDateTime: string;   // "Sexta-feira, 23/01/2026 às 14:30"
}

function getBrazilDateTime(): BrazilDateTime {
  const brazilTime = getBrazilTimeDate();
  
  const hour = brazilTime.getHours();
  const minute = brazilTime.getMinutes();
  const dayOfWeek = brazilTime.getDay(); // 0=Domingo, 1=Segunda, ... 6=Sábado
  
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const diasSemanaAbrev = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
  
  const date = brazilTime.toLocaleDateString('pt-BR');
  const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  const dayName = diasSemana[dayOfWeek];
  const dayNameAbrev = diasSemanaAbrev[dayOfWeek];
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  return {
    date,
    time,
    hour,
    minute,
    dayOfWeek,
    dayName,
    dayNameAbrev,
    isWeekend,
    fullDateTime: `${dayName}, ${date} às ${time}`,
  };
}

type AgentBusinessHoursKey = 'dom' | 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab';

interface AgentBusinessHoursDay {
  enabled: boolean;
  open: string;
  close: string;
}

type AgentBusinessHoursMap = Record<AgentBusinessHoursKey, AgentBusinessHoursDay>;

const DEFAULT_AGENT_BUSINESS_HOURS: AgentBusinessHoursMap = {
  dom: { enabled: false, open: "", close: "" },
  seg: { enabled: true, open: "09:00", close: "18:00" },
  ter: { enabled: true, open: "09:00", close: "18:00" },
  qua: { enabled: true, open: "09:00", close: "18:00" },
  qui: { enabled: true, open: "09:00", close: "18:00" },
  sex: { enabled: true, open: "09:00", close: "18:00" },
  sab: { enabled: false, open: "", close: "" },
};

const AGENT_DAY_LABELS: Record<AgentBusinessHoursKey, string> = {
  dom: "Domingo",
  seg: "Segunda-feira",
  ter: "Terca-feira",
  qua: "Quarta-feira",
  qui: "Quinta-feira",
  sex: "Sexta-feira",
  sab: "Sabado",
};

function normalizeAgentBusinessHours(
  raw: Partial<Record<AgentBusinessHoursKey, Partial<AgentBusinessHoursDay>>> | null | undefined
): AgentBusinessHoursMap {
  const normalized = { ...DEFAULT_AGENT_BUSINESS_HOURS } as AgentBusinessHoursMap;

  if (!raw) return normalized;

  for (const dayKey of Object.keys(DEFAULT_AGENT_BUSINESS_HOURS) as AgentBusinessHoursKey[]) {
    const source = raw[dayKey];
    if (!source) continue;

    normalized[dayKey] = {
      enabled: source.enabled ?? DEFAULT_AGENT_BUSINESS_HOURS[dayKey].enabled,
      open: source.open ?? DEFAULT_AGENT_BUSINESS_HOURS[dayKey].open,
      close: source.close ?? DEFAULT_AGENT_BUSINESS_HOURS[dayKey].close,
    };
  }

  return normalized;
}

function getAgentBusinessDayKey(dayOfWeek: number): AgentBusinessHoursKey {
  const dayMap: Record<number, AgentBusinessHoursKey> = {
    0: "dom",
    1: "seg",
    2: "ter",
    3: "qua",
    4: "qui",
    5: "sex",
    6: "sab",
  };

  return dayMap[dayOfWeek] || "seg";
}

function isWithinAgentBusinessHours(
  agentConfig: any,
  brazilTime: BrazilDateTime = getBrazilDateTime()
): boolean {
  if ((agentConfig as any)?.businessHoursEnabled !== true) {
    return true;
  }

  const hours = normalizeAgentBusinessHours((agentConfig as any)?.businessHours);
  const dayKey = getAgentBusinessDayKey(brazilTime.dayOfWeek);
  const currentDay = hours[dayKey];

  if (!currentDay?.enabled || !currentDay.open || !currentDay.close) {
    return false;
  }

  const currentMinutes = brazilTime.hour * 60 + brazilTime.minute;
  const [openHour, openMinute] = currentDay.open.split(":").map(Number);
  const [closeHour, closeMinute] = currentDay.close.split(":").map(Number);
  const openMinutes = openHour * 60 + openMinute;
  const closeMinutes = closeHour * 60 + closeMinute;

  return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
}

function formatAgentBusinessHours(agentConfig: any): string {
  const hours = normalizeAgentBusinessHours((agentConfig as any)?.businessHours);
  const lines: string[] = [];

  for (const dayKey of Object.keys(DEFAULT_AGENT_BUSINESS_HOURS) as AgentBusinessHoursKey[]) {
    const day = hours[dayKey];
    if (!day.enabled || !day.open || !day.close) {
      lines.push(`- ${AGENT_DAY_LABELS[dayKey]}: fechado`);
      continue;
    }

    lines.push(`- ${AGENT_DAY_LABELS[dayKey]}: ${day.open} as ${day.close}`);
  }

  return lines.join("\n");
}

interface AgentOpeningRule {
  source: "greeting" | "off_hours";
  text: string;
  variationEnabled: boolean;
}

function generateAgendamento2PromptBlock(agendamento2Data: Agendamento2PromptContext): string {
  if (!agendamento2Data) {
    return "";
  }

  const displayName = agendamento2Data.displayName || "Agendamento 2.0";
  const customPrompt = String(agendamento2Data.agendaPrompt || "").trim();
  const hoursContext = String(agendamento2Data.agendaHoursContext || "").trim();
  const currentBrazilTime = String(agendamento2Data.currentBrazilTime || "").trim();
  const syncedAgendaContext = String(agendamento2Data.syncedAgendaContext || "").trim();
  const entries = Array.isArray(agendamento2Data.entries) ? agendamento2Data.entries : [];

  const entriesText =
    entries.length > 0
      ? entries
          .slice(0, 60)
          .map((entry, index) => {
            const leadName = String(entry.contactName || entry.contactNumber || "Cliente").trim();
            const phone = String(entry.contactNumber || "").trim();
            const shouldExposePhone = Boolean(phone && !phone.startsWith("sim-"));
            const agreedSchedule = String(entry.agreedSchedule || "").trim();
            const scheduledDate = String(entry.scheduledDate || "").trim();
            const scheduledTime = String(entry.scheduledTime || "").trim();
            const summary = String(entry.summary || "").trim();
            const parts = [
              `${index + 1}. ${leadName}`,
              shouldExposePhone ? `telefone: ${phone}` : "",
              agreedSchedule ? `combinado: ${agreedSchedule}` : "",
              scheduledDate ? `data: ${scheduledDate}` : "",
              scheduledTime ? `horario: ${scheduledTime}` : "",
              summary ? `resumo: ${summary}` : "",
            ].filter(Boolean);
            return parts.join(" | ");
          })
          .join("\n")
      : "Nenhum agendamento confirmado foi registrado ainda.";

  return `
═══════════════════════════════════════════════════════════════════════
${displayName.toUpperCase()} - CONTEXTO DE AGENDA VIVA
═══════════════════════════════════════════════════════════════════════

Este modulo nao cria logica operacional fora do prompt.
Quem continua mandando na conversa e o prompt principal do Meu Agente IA.
Use este bloco apenas como contexto adicional para interpretar agenda, horarios, datas e combinados ja fechados.
Nao exponha ao cliente que existe agenda interna, memoria paralela ou modulo auxiliar.
Se houver qualquer conflito entre este bloco e o prompt principal do negocio, respeite o prompt principal do negocio.

PROMPT DE AGENDA DO CLIENTE:
${customPrompt || "Sem prompt adicional configurado."}

HORARIO ATUAL DE BRASILIA:
${currentBrazilTime || "Nao informado."}

HORARIOS DE FUNCIONAMENTO DO NEGOCIO:
${hoursContext || "Sem horarios informados."}

AGENDA SINCRONIZADA DO NEGOCIO:
${syncedAgendaContext || "Sem agenda sincronizada adicional no momento."}

AGENDA VIVA REGISTRADA EM PARALELO:
${entriesText}

REGRAS DE USO:
- Interprete a agenda viva com bom senso e contexto.
- Considere sempre a hora atual do Brasil antes de sugerir datas e horarios.
- Nao trate horario passado como disponivel para hoje.
- Use os combinados anteriores como memoria operacional para evitar contradicoes.

═══════════════════════════════════════════════════════════════════════
`.trim();
}

function generateEstampariaPromptBlock(profile: EstampariaProfile): string {
  const sections = [
    `MODULO ESTAMPARIA ATIVO: ${profile.businessName}`,
    "Atenda seguindo o prompt operacional da estamparia abaixo, mantendo linguagem humana, consultiva e objetiva.",
    "Não explique o processo interno de extração nem fale em módulo interno ao cliente.",
    "Quando o briefing ficar claro o suficiente, siga a conversa normalmente porque o acompanhamento operacional acontece por trás.",
    "O atendimento pelo WhatsApp continua 24 horas. O horário da loja física serve apenas para responder quando o cliente perguntar sobre retirada, visita, endereço ou funcionamento presencial.",
    "Se o cliente estiver no meio de um pedido, continue pelo último estado confirmado da conversa. Não troque para respostas genéricas sobre teste, módulo, explicação do sistema ou 'qual parte você quer ver'.",
    "Quando o cliente confirmar a ideia da arte, confirme o briefing e peça somente o detalhe realmente faltante. Se os dados principais já estiverem claros, diga de forma natural que vai preparar a prévia para aprovação.",
    "Se uma arte já tiver sido enviada na conversa pelo arte-finalista ou pelo fluxo interno, trate a próxima resposta do cliente como feedback, aprovação ou pedido de ajuste daquela arte.",
    "Não diga que a arte/imagem está anexada agora se ela ainda será preparada internamente. Pode dizer que vai preparar a prévia e trazer para aprovação.",
  ];

  if (profile.instagramUrl) sections.push(`Instagram oficial: ${profile.instagramUrl}`);
  if (profile.addressText) sections.push(`Endereço: ${profile.addressText}`);
  if (profile.businessHoursText) sections.push(`Horário da loja física: ${profile.businessHoursText}`);
  if (profile.catalogSummary) sections.push(`Catálogo resumido:\n${profile.catalogSummary}`);
  if (profile.serviceRules) sections.push(`Regras operacionais:\n${profile.serviceRules}`);
  if (profile.artGenerationGuide) sections.push(`Guia de geração de arte:\n${profile.artGenerationGuide}`);
  if (profile.aiPromptText) sections.push(`Prompt base da estamparia:\n${profile.aiPromptText}`);

  return sections.join("\n\n");
}

function getEstampariaAwareOpeningConfig(agentConfig: any, profile: EstampariaProfile | null): any {
  if (!profile) return agentConfig;

  return {
    ...agentConfig,
    businessHoursEnabled: false,
    offHoursMessageEnabled: false,
  };
}

function normalizeAgenteZapSupportRuntimeText(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isAgenteZapSupportCustomerMediaRuntimeTurn(params: {
  prompt?: string | null;
  message: string;
  history: Message[];
}): boolean {
  if (!String(params.prompt || "").includes("CONTEXTO OPERACIONAL DO CLIENTE AGENTEZAP")) {
    return false;
  }

  const text = normalizeAgenteZapSupportRuntimeText([
    params.message,
    ...(params.history || []).slice(-6).map((entry: any) => entry?.text || ""),
  ].join("\n"));
  if (!text) return false;

  const mediaSubject =
    text.includes("midia") ||
    text.includes("imagem") ||
    text.includes("foto") ||
    text.includes("cardapio") ||
    text.includes("catalogo") ||
    text.includes("arquivo") ||
    text.includes("pdf") ||
    text.includes("video") ||
    text.includes("audio");
  const customerAction =
    text.includes("agente") ||
    text.includes("cliente") ||
    text.includes("whatsapp") ||
    text.includes("simulador") ||
    text.includes("biblioteca") ||
    text.includes("enviar") ||
    text.includes("mandar") ||
    text.includes("configurar") ||
    text.includes("cadastrar") ||
    text.includes("salvar");

  return mediaSubject && customerAction;
}

function normalizeAgenteZapSupportRuntimeMediaName(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function isAgenteZapSupportRuntimeTutorialMediaAction(action: any, mediaLibrary: any[]): boolean {
  const actionName = normalizeAgenteZapSupportRuntimeMediaName(action?.media_name || action?.mediaName || action?.name);
  const media = (Array.isArray(mediaLibrary) ? mediaLibrary : []).find((item: any) => {
    const itemName = normalizeAgenteZapSupportRuntimeMediaName(item?.name || item?.media_name || item?.mediaName);
    return itemName && itemName === actionName;
  });
  const text = normalizeAgenteZapSupportRuntimeText([
    action?.media_name,
    action?.mediaName,
    action?.caption,
    action?.text,
    media?.name,
    media?.description,
    media?.whenToUse,
    media?.when_to_use,
    media?.caption,
  ].filter(Boolean).join("\n"));

  return (
    text.includes("tutorial") ||
    text.includes("passo a passo") ||
    text.includes("como cadastrar") ||
    text.includes("como adicionar") ||
    text.includes("biblioteca de midias") ||
    text.includes("meu agente ia") ||
    text.includes("painel de midias")
  );
}

function filterAgenteZapSupportCustomerRuntimeMediaActions(params: {
  prompt?: string | null;
  message: string;
  history: Message[];
  mediaActions: AgentRuntimeResponse["actions"];
  mediaLibrary: any[];
}): { mediaActions: AgentRuntimeResponse["actions"]; dropped: AgentRuntimeResponse["actions"] } {
  if (!isAgenteZapSupportCustomerMediaRuntimeTurn({
    prompt: params.prompt,
    message: params.message,
    history: params.history,
  })) {
    return { mediaActions: params.mediaActions, dropped: [] };
  }

  const kept: AgentRuntimeResponse["actions"] = [];
  const dropped: AgentRuntimeResponse["actions"] = [];
  for (const action of Array.isArray(params.mediaActions) ? params.mediaActions : []) {
    if (isAgenteZapSupportRuntimeTutorialMediaAction(action, params.mediaLibrary)) {
      kept.push(action);
    } else {
      dropped.push(action);
    }
  }

  return { mediaActions: kept, dropped };
}

const TIMED_OPENING_LINE_PLACEHOLDER = "{{saudacao_inicial_horario}}";

function replaceLiteralToken(source: string, token: string, replacement: string): string {
  if (!source || !token) {
    return source;
  }

  return source.split(token).join(replacement);
}

function buildTimedOpeningLine(contactName?: string): string {
  const safeName = sanitizeContactName(contactName);
  const { hour } = getBrazilDateTime();

  if (hour >= 0 && hour < 6) {
    return safeName ? `Olá, ${safeName}! Tudo bem?` : "Olá, tudo bem?";
  }

  if (hour >= 6 && hour < 12) {
    return safeName ? `Bom dia, ${safeName} 😊` : "Bom dia 😊";
  }

  if (hour >= 12 && hour < 18) {
    return safeName ? `Boa tarde, ${safeName} 😊` : "Boa tarde 😊";
  }

  return safeName ? `Boa noite, ${safeName} 😊` : "Boa noite 😊";
}

function resolveTimedOpeningPlaceholders(text: string, contactName?: string): string {
  return replaceLiteralToken(String(text || ""), TIMED_OPENING_LINE_PLACEHOLDER, buildTimedOpeningLine(contactName));
}

export function resolveAgentOpeningRule(agentConfig: any, contactName?: string): AgentOpeningRule | null {
  const businessHoursEnabled = (agentConfig as any)?.businessHoursEnabled === true;
  const offHoursMessageEnabled = (agentConfig as any)?.offHoursMessageEnabled === true;
  const isOpenNow = isWithinAgentBusinessHours(agentConfig);

  if (
    businessHoursEnabled &&
    offHoursMessageEnabled &&
    !isOpenNow &&
    typeof agentConfig?.offHoursMessage === "string" &&
    agentConfig.offHoursMessage.trim()
  ) {
    return {
      source: "off_hours",
      text: processResponsePlaceholders(agentConfig.offHoursMessage.trim(), contactName),
      variationEnabled: (agentConfig as any)?.offHoursVariation === true,
    };
  }

  if (
    (agentConfig as any)?.greetingEnabled === true &&
    typeof agentConfig?.customGreeting === "string" &&
    agentConfig.customGreeting.trim()
  ) {
    const resolvedCustomGreeting = resolveTimedOpeningPlaceholders(
      agentConfig.customGreeting.trim(),
      contactName,
    );

    return {
      source: "greeting",
      text: normalizeConfiguredGreetingForBrazilTime(
        processResponsePlaceholders(resolvedCustomGreeting, contactName),
      ),
      variationEnabled: (agentConfig as any)?.greetingVariation === true,
    };
  }

  return null;
}

function isFirstAgentOpeningOpportunity(
  conversationHistory: Array<{ fromMe?: boolean; isFromAgent?: boolean }>
): boolean {
  return !conversationHistory.some((message) => message.fromMe === true || message.isFromAgent === true);
}

function findGreetingOpeningFlow(mediaLibrary: any[]): any | null {
  return mediaLibrary.find(
    (media: any) =>
      foldMediaName(String(media?.name || "")) === "SAUDACAO_INFO_EXTRA" &&
      media?.mediaType === "flow" &&
      Array.isArray(media?.flowItems) &&
      media.flowItems.length > 0,
  ) || null;
}

export function buildGreetingOpeningFlowActions(params: {
  flowMedia: any;
  openingText: string | null;
  contactName?: string;
}): AgentRuntimeResponse["actions"] {
  const { flowMedia, openingText, contactName } = params;
  const openingMediaName = String(flowMedia?.name || "SAUDACAO_INFO_EXTRA").trim() || "SAUDACAO_INFO_EXTRA";
  const flowItems = Array.isArray(flowMedia?.flowItems) ? [...flowMedia.flowItems] : [];
  const sortedItems = flowItems.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  const openingTextNormalized = openingText?.trim()
    ? normalizeOpeningComparison(openingText.trim())
    : "";
  const fallbackGreetingIndex = openingTextNormalized
    ? sortedItems.findIndex((item: any) => {
        if (item?.type !== "text") {
          return false;
        }

        const hydratedText = processResponsePlaceholders(String(item.text || "").trim(), contactName);
        return Boolean(hydratedText) && normalizeOpeningComparison(hydratedText) === openingTextNormalized;
      })
    : -1;
  const hasGreetingItem =
    sortedItems.some((item: any) => item?.type === "text" && item?.isGreeting === true) ||
    fallbackGreetingIndex >= 0;
  const actions: AgentRuntimeResponse["actions"] = [];

  if (!hasGreetingItem && openingText?.trim()) {
    actions.push({
      type: "send_text",
      text: openingText.trim(),
      media_name: openingMediaName,
      opening_flow_source: "greeting",
    });
  }

  for (const [index, item] of sortedItems.entries()) {
    if (item?.type === "text") {
      const isGreetingItem = item.isGreeting === true || index === fallbackGreetingIndex;
      const rawText = isGreetingItem && openingText?.trim()
        ? openingText.trim()
        : processResponsePlaceholders(String(item.text || "").trim(), contactName);

      if (!rawText) {
        continue;
      }

      actions.push({
        type: "send_text",
        text: rawText,
        media_name: openingMediaName,
        opening_flow_source: "greeting",
      });
      continue;
    }

    if (item?.type === "media" && item?.storageUrl) {
      actions.push({
        type: "send_media_url",
        media_url: item.storageUrl,
        media_type: item.mediaType || "image",
        caption: item.caption ? processResponsePlaceholders(String(item.caption), contactName) : undefined,
        media_name: openingMediaName,
        file_name: item.fileName || undefined,
        opening_flow_source: "greeting",
      });
    }
  }

  return actions;
}

function extractTrackedMediaNames(value: unknown): string[] {
  const text = String(value || "");
  if (!text) return [];

  const names = new Set<string>();
  const patterns = [
    /\bMEDIA_NAME:([^\s,\]\r\n]+)/gi,
    /\[FLOW:([^:\]\s]+)(?::[^\]]*)?\]/gi,
    /\[(?:MEDIA|MIDIA|ENVIAR_MIDIA):([^\]\s]+)\]/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const mediaName = String(match[1] || "").trim();
      if (mediaName) names.add(mediaName);
    }
  }

  return Array.from(names);
}

async function resolveAiAgentOwnerEmail(userId: string): Promise<string> {
  try {
    const user = await storage.getUser(userId);
    return String(user?.email || "").trim().toLowerCase();
  } catch (error: any) {
    console.warn("[AI Agent] Falha ao resolver email do dono para Codex CLI:", error?.message || error);
    return "";
  }
}

function resolveAiAgentLiveCliScope(ownerEmail: string): AgenteZapLiveCliScope {
  return ownerEmail === RODRIGO_AGENT_CREATOR_EMAIL
    ? "rodrigo_agent_creator"
    : "tenant_customer_support";
}

function extractLiveCliMediaActions(actions: AgenteZapLiveCliAction[]): AgentRuntimeResponse["actions"] {
  return (actions || [])
    .filter((action) => action.type === "send_media")
    .map((action) => {
      const args = action.arguments || {};
      const mediaName = String(
        args.mediaName ||
        args.media_name ||
        args.name ||
        args.nome ||
        args.media ||
        "",
      ).trim();
      return mediaName ? { type: "send_media" as const, media_name: mediaName } : null;
    })
    .filter(Boolean) as AgentRuntimeResponse["actions"];
}

const AI_AGENT_LIVE_CLI_TENANT_CONTEXT_SECRET_KEY_RE =
  /(?:api[_-]?key|token|secret|password|authorization|bearer|access[_-]?token|refresh[_-]?token|client[_-]?secret)/i;

function sanitizeAiAgentLiveCliTenantContextValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const output = value.map((item) => sanitizeAiAgentLiveCliTenantContextValue(item, seen));
    seen.delete(value);
    return output;
  }
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = AI_AGENT_LIVE_CLI_TENANT_CONTEXT_SECRET_KEY_RE.test(key)
      ? "[redacted]"
      : sanitizeAiAgentLiveCliTenantContextValue(item, seen);
  }
  seen.delete(value);
  return output;
}

async function loadAiAgentTenantOperationalContext(params: {
  userId: string;
  conversationId?: string | null;
}): Promise<Record<string, unknown>> {
  const { userId, conversationId } = params;
  try {
    const [sectors, snapshot] = await Promise.all([
      listOwnerSectors(userId),
      conversationId ? getConversationRoutingSnapshot(userId, conversationId).catch(() => null) : Promise.resolve(null),
    ]);

    return {
      routingContract: [
        "Setores, membros e snapshot abaixo sao contexto/capacidade do tenant para o Codex decidir actions como route_sector quando o contrato permitir.",
        "O executor SaaS nao escolhe setor por palavra-chave neste pacote; ele apenas valida permissao/ownership e aplica a action estruturada do Codex.",
      ].join(" "),
      sectors,
      currentRoutingSnapshot: snapshot
        ? {
            sectorId: snapshot.sector_id || null,
            sectorName: snapshot.sector_name || null,
            assignedToMemberId: snapshot.assigned_to_member_id || null,
            assignedMemberName: snapshot.assigned_member_name || null,
            orchestrationMode: snapshot.orchestration_mode || "ai",
            canChangeSector: snapshot.can_change_sector !== false,
            transferLockReason: snapshot.transfer_lock_reason || null,
            hasManualHumanReplySinceHandoff: snapshot.has_manual_human_reply_since_handoff === true,
          }
        : null,
    };
  } catch (error: any) {
    return {
      routingContract: "Falha ao carregar setores/snapshot do tenant; nao inferir roteamento local nem substituir a decisao do Codex.",
      sectors: [],
      currentRoutingSnapshot: null,
      loadError: String(error?.message || error || "unknown_error"),
    };
  }
}

async function loadAiAgentSubscriptionPlanContext(userId: string): Promise<Record<string, unknown>> {
  try {
    const { pool } = await import("./db");
    const result = await pool.query(
      `
        SELECT
          s.id,
          s.user_id,
          s.plan_id,
          s.status,
          s.data_inicio,
          s.data_fim,
          s.pending_receipt,
          s.coupon_price,
          s.next_payment_date,
          s.payment_method,
          COALESCE(s.metadata, '{}'::jsonb) AS metadata,
          row_to_json(p) AS plan
        FROM subscriptions s
        JOIN plans p ON p.id = s.plan_id
        CROSS JOIN LATERAL (
          SELECT
            LOWER(COALESCE(s.status, '')) AS normalized_status,
            LOWER(COALESCE(s.metadata->>'createdFrom', '')) AS created_from,
            NULLIF(GREATEST(
              COALESCE(s.next_payment_date, 'epoch'::timestamp),
              COALESCE(s.data_fim, 'epoch'::timestamp)
            ), 'epoch'::timestamp) AS coverage_end
        ) selection
        WHERE s.user_id = $1
        ORDER BY
          CASE
            WHEN selection.normalized_status IN ('active', 'paid')
              AND selection.coverage_end > NOW()
              THEN 0
            WHEN selection.normalized_status IN ('pending', 'pending_pix', 'pending_payment')
              AND selection.created_from = 'plans_checkout'
              THEN 1
            WHEN selection.normalized_status IN ('active', 'paid')
              THEN 2
            WHEN selection.normalized_status IN ('pending', 'pending_pix', 'pending_payment')
              THEN 3
            ELSE 4
          END,
          selection.coverage_end DESC NULLS LAST,
          s.created_at DESC,
          s.updated_at DESC
        LIMIT 1
      `,
      [userId],
    );

    return buildSubscriptionPlanContextArtifact(result.rows[0] || null);
  } catch (error: any) {
    return {
      ...buildSubscriptionPlanContextArtifact(null),
      loadError: String(error?.message || error || "subscription_plan_context_error"),
    };
  }
}

function buildAiAgentTenantContextArtifact(params: {
  userId: string;
  ownerEmail: string;
  conversationId?: string | null;
  agentConfig: any;
  businessConfig?: any;
  contactName?: string | null;
  contactPhone?: string | null;
  operationalContext?: Record<string, unknown> | null;
}): Record<string, unknown> {
  return {
    contract: [
      "Contexto neutro completo do tenant para o Codex CLI vivo no WhatsApp real.",
      "O executor SaaS nao interpreta fluxo, intencao comercial, tom, pergunta obrigatoria ou resposta publica.",
      "Identidade, ordem de atendimento, oferta, midias e estilo devem vir do prompt/configuracao/dados deste tenant.",
    ].join(" "),
    source: "whatsapp_real_agent",
    userId: params.userId,
    ownerEmail: params.ownerEmail,
    conversationId: params.conversationId || null,
    effectivePrompt: String(params.agentConfig?.prompt || ""),
    contact: {
      name: params.contactName || null,
      phone: params.contactPhone || null,
    },
    aiAgentConfig: {
      prompt: String(params.agentConfig?.prompt || ""),
      model: params.agentConfig?.model || null,
      llmConfig: sanitizeAiAgentLiveCliTenantContextValue(params.agentConfig?.llmConfig || params.agentConfig?.llm_config || {}),
      triggerPhrases: sanitizeAiAgentLiveCliTenantContextValue(params.agentConfig?.triggerPhrases || params.agentConfig?.trigger_phrases || []),
      messageSplitChars: params.agentConfig?.messageSplitChars ?? params.agentConfig?.message_split_chars ?? null,
      customGreeting: params.agentConfig?.customGreeting || params.agentConfig?.custom_greeting || null,
      greetingVariation: params.agentConfig?.greetingVariation === true || params.agentConfig?.greeting_variation === true,
      greetingEnabled: params.agentConfig?.greetingEnabled === true || params.agentConfig?.greeting_enabled === true,
      customAddress: params.agentConfig?.customAddress || params.agentConfig?.custom_address || null,
      addressEnabled: params.agentConfig?.addressEnabled === true || params.agentConfig?.address_enabled === true,
      businessHoursEnabled: params.agentConfig?.businessHoursEnabled === true || params.agentConfig?.business_hours_enabled === true,
      businessHours: sanitizeAiAgentLiveCliTenantContextValue(params.agentConfig?.businessHours || params.agentConfig?.business_hours || null),
      offHoursMessageEnabled: params.agentConfig?.offHoursMessageEnabled === true || params.agentConfig?.off_hours_message_enabled === true,
      offHoursVariation: params.agentConfig?.offHoursVariation === true || params.agentConfig?.off_hours_variation === true,
      offHoursMessage: params.agentConfig?.offHoursMessage || params.agentConfig?.off_hours_message || null,
      aiSignatureEnabled: params.agentConfig?.aiSignatureEnabled === true || params.agentConfig?.ai_signature_enabled === true,
      aiSignature: params.agentConfig?.aiSignature || params.agentConfig?.ai_signature || null,
      flowModeActive: params.agentConfig?.flowModeActive === true || params.agentConfig?.flow_mode_active === true,
      flowScript: String(params.agentConfig?.flowScript || params.agentConfig?.flow_script || ""),
    },
    rawAiAgentConfig: sanitizeAiAgentLiveCliTenantContextValue(params.agentConfig || {}),
    businessAgentConfig: {
      companyName: params.businessConfig?.companyName || params.businessConfig?.company_name || null,
      agentName: params.businessConfig?.agentName || params.businessConfig?.agent_name || null,
      companyDescription: params.businessConfig?.companyDescription || params.businessConfig?.company_description || null,
      productsServices: sanitizeAiAgentLiveCliTenantContextValue(params.businessConfig?.productsServices || params.businessConfig?.products_services || null),
      businessInfo: sanitizeAiAgentLiveCliTenantContextValue(params.businessConfig?.businessInfo || params.businessConfig?.business_info || null),
      faqItems: sanitizeAiAgentLiveCliTenantContextValue(params.businessConfig?.faqItems || params.businessConfig?.faq_items || null),
      policies: sanitizeAiAgentLiveCliTenantContextValue(params.businessConfig?.policies || null),
    },
    rawBusinessAgentConfig: sanitizeAiAgentLiveCliTenantContextValue(params.businessConfig || {}),
    operationalContext: sanitizeAiAgentLiveCliTenantContextValue(params.operationalContext || {}),
  };
}

function buildAiAgentMediaContextArtifacts(mediaLibrary: any[]): any[] {
  return (Array.isArray(mediaLibrary) ? mediaLibrary : []).map((media: any) => {
    const mediaName = media?.name ?? null;
    return {
      mediaName,
      actionType: "send_media",
      actionArguments: { mediaName },
      id: media?.id ?? null,
      name: media?.name ?? null,
      mediaType: media?.mediaType || media?.media_type || media?.type || null,
      storageUrl: media?.storageUrl || media?.storage_url || null,
      fileName: media?.fileName || media?.file_name || null,
      mimeType: media?.mimeType || media?.mime_type || null,
      fileSize: media?.fileSize ?? media?.file_size ?? null,
      durationSeconds: media?.durationSeconds ?? media?.duration_seconds ?? null,
      whenToUse: media?.whenToUse || media?.when_to_use || media?.quandoUsar || null,
      description: media?.description || media?.descricao || null,
      caption: media?.caption || null,
      transcription: media?.transcription || null,
      isPtt: media?.isPtt ?? media?.is_ptt ?? null,
      isActive: media?.isActive !== false && media?.is_active !== false,
      sendAlone: media?.sendAlone ?? media?.send_alone ?? null,
      suppressTextResponse: media?.suppressTextResponse ?? media?.suppress_text_response ?? null,
      displayOrder: media?.displayOrder ?? media?.display_order ?? null,
      wapiMediaId: media?.wapiMediaId || media?.wapi_media_id || null,
      flowItems: sanitizeAiAgentLiveCliTenantContextValue(media?.flowItems || media?.flow_items || []),
    };
  });
}

async function runAiAgentCodexPrimaryTurn(params: {
  userId: string;
  ownerEmail: string;
  conversationId: string;
  contactPhone?: string | null;
  messages: ChatMessage[];
  currentMessage: string;
  contextArtifacts?: Record<string, unknown>;
}): Promise<{
  text: string | null;
  mediaActions: AgentRuntimeResponse["actions"];
  skipAutoReplyReason?: string;
  scope: AgenteZapLiveCliScope;
  decision: string;
  violations: string[];
} | null> {
  const scope = resolveAiAgentLiveCliScope(params.ownerEmail);
  const timeoutMs = Number(process.env.AGENTEZAP_CODEX_CLI_WHATSAPP_TIMEOUT_MS || process.env.AGENTEZAP_CODEX_CLI_TIMEOUT_MS || 180_000);
  const result = await runAgenteZapLiveCliRuntime({
    scope,
    ownerEmail: params.ownerEmail,
    userId: params.userId,
    conversationId: params.conversationId,
    contactPhone: params.contactPhone || undefined,
    messages: params.messages,
    currentMessage: params.currentMessage,
    contextArtifacts: params.contextArtifacts,
    timeoutMs,
  });
  const text = extractAgenteZapLiveCliText(result.plan).trim();
  const mediaActions = extractLiveCliMediaActions(result.plan.actions);

  console.log("[AI Agent] Codex CLI primary turn", {
    scope,
    decision: result.plan.decision,
    messages: result.plan.customerFacingMessages.length,
    mediaActions: mediaActions.length,
    violations: result.violations,
  });

  if (result.plan.decision === "no_send" && !text && mediaActions.length === 0) {
    return {
      text: null,
      mediaActions: [],
      skipAutoReplyReason: "codex_no_send",
      scope,
      decision: result.plan.decision,
      violations: result.violations,
    };
  }

  return {
    text: text || null,
    mediaActions,
    scope,
    decision: result.plan.decision,
    violations: result.violations,
  };
}

function normalizeOpeningComparison(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("\r", " ")
    .replaceAll("\n", " ")
    .split(" ")
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getFirstMeaningfulOpeningLine(text: string): string {
  const source = String(text || "").trim();
  if (!source) {
    return "";
  }

  const normalized = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = normalized.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine) {
      return trimmedLine;
    }
  }

  return source;
}

function getOpeningTextForCustomerMessage(openingText: string, customerMessage?: string | null): string {
  const opening = String(openingText || "").trim();
  if (!opening) {
    return opening;
  }

  if (!shouldForceContextualOpeningResponse(customerMessage)) {
    return opening;
  }

  return getFirstMeaningfulOpeningLine(opening) || opening;
}

const REDUNDANT_CONTEXTUAL_OPENING_PREFIXES = [
  "como posso te ajudar?",
  "como posso ajudar?",
  "posso te ajudar?",
  "em que posso te ajudar?",
];

function trimLeadingWhitespace(text: string): string {
  let index = 0;
  while (index < text.length) {
    const current = text[index];
    if (current === " " || current === "\n" || current === "\r" || current === "\t") {
      index += 1;
      continue;
    }
    break;
  }

  return text.slice(index);
}

function removeLeadingRedundantOpeningQuestion(
  responseBody: string | null,
  customerMessage?: string | null,
): string | null {
  const body = String(responseBody || "").trim();
  if (!body) {
    return responseBody;
  }

  if (!shouldForceContextualOpeningResponse(customerMessage)) {
    return body;
  }

  const loweredBody = body.toLocaleLowerCase("pt-BR");
  for (const prefix of REDUNDANT_CONTEXTUAL_OPENING_PREFIXES) {
    if (!loweredBody.startsWith(prefix)) {
      continue;
    }

    const remaining = trimLeadingWhitespace(body.slice(prefix.length));
    return remaining || body;
  }

  return body;
}

function composeMandatoryOpeningResponse(openingText: string, responseBody: string | null): string {
  const opening = openingText.trim();
  const body = String(responseBody || "").trim();

  if (!opening) return body;
  if (!body) return opening;

  if (normalizeOpeningComparison(body).startsWith(normalizeOpeningComparison(opening))) {
    return body;
  }

  return `${opening}\n${body}`;
}

const OPENING_VARIATION_IDENTITY_STOPWORDS = new Set([
  "agradece",
  "ajuda",
  "ajudar",
  "bem",
  "boa",
  "bom",
  "como",
  "contato",
  "noite",
  "ola",
  "olá",
  "podemos",
  "posso",
  "seja",
  "tarde",
  "tudo",
]);

function extractOpeningVariationIdentityTokens(value: string): string[] {
  return normalizeOpeningComparison(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !OPENING_VARIATION_IDENTITY_STOPWORDS.has(token))
    .slice(0, 12);
}

function openingVariationPreservesIdentity(fallback: string, candidate: string): boolean {
  const identityTokens = extractOpeningVariationIdentityTokens(fallback);
  if (identityTokens.length === 0) return true;
  const normalizedCandidate = normalizeOpeningComparison(candidate);
  return identityTokens.some((token) => normalizedCandidate.includes(token));
}

async function generateOpeningOnlyResponse(openingRule: AgentOpeningRule, userId?: string): Promise<string> {
  const fallback = openingRule.text.trim();
  return fallback;
}

export async function repairFirstConcreteOpeningReply(params: {
  llmClient: any;
  model: string | undefined;
  customerMessage: string;
  draftReply: string | null | undefined;
  mediaActionCount: number;
  openingText?: string | null;
  openingFlowAlreadySent?: boolean;
  openingFlowSummary?: string;
}): Promise<string | null> {
  const customerMessage = String(params.customerMessage || "").trim();
  const draftReply = String(params.draftReply || "").trim();
  const openingText = String(params.openingText || "").trim();
  const openingFlowAlreadySent = params.openingFlowAlreadySent === true;
  const openingFlowSummary = String(params.openingFlowSummary || "").trim();

  if (!customerMessage) {
    return draftReply || null;
  }

  const draftWithoutOpening = (() => {
    if (!draftReply) return "";
    if (!openingText) return draftReply;

    if (draftReply.startsWith(openingText)) {
      const remaining = draftReply.slice(openingText.length).trim();
      return remaining.replaceAll("\r\n", "\n").trim();
    }

    return draftReply;
  })();

  if (draftWithoutOpening && !openingFlowAlreadySent) {
    console.log(`🧩 [AI Agent] Mantendo corpo factual da primeira resposta concreta sem reescrita livre`);
    return draftWithoutOpening;
  }

  console.warn("⚠️ [AI Agent] Primeira resposta concreta sem corpo factual do Codex; fail-closed sem reparo local.");
  return null;
}

function hydrateResponseMediaActions(
  actions: AgentRuntimeResponse["actions"] | undefined,
  contactName?: string,
): AgentRuntimeResponse["actions"] {
  const hydrated: AgentRuntimeResponse["actions"] = [];

  for (const action of actions || []) {
    if (!action) {
      continue;
    }

    if (action.type === "send_text") {
      const text = processResponsePlaceholders(String((action as any).text || "").trim(), contactName);
      if (!text) {
        continue;
      }

      hydrated.push({
        ...action,
        text,
      });
      continue;
    }

    if (action.type === "send_media_url") {
      const caption = (action as any).caption
        ? processResponsePlaceholders(String((action as any).caption || ""), contactName)
        : undefined;

      hydrated.push({
        ...action,
        caption,
      });
      continue;
    }

    if (action.type === "send_media") {
      const caption = (action as any).caption
        ? processResponsePlaceholders(String((action as any).caption || ""), contactName)
        : undefined;

      hydrated.push({
        ...action,
        caption,
      } as any);
      continue;
    }

    hydrated.push(action);
  }

  return hydrated;
}

function hasGreetingOpeningFlowAction(actions: AgentRuntimeResponse["actions"] | undefined): boolean {
  return (actions || []).some((action) => {
    if (String((action as any)?.opening_flow_source || "").trim() === "greeting") {
      return true;
    }

    const mediaName = String((action as any)?.media_name || "").trim();
    return mediaName ? foldMediaName(mediaName) === "SAUDACAO_INFO_EXTRA" : false;
  });
}

function describeOpeningMediaActions(actions: AgentRuntimeResponse["actions"]): string {
  const descriptions: string[] = [];

  for (const action of actions) {
    if (action?.type === "send_text") {
      const text = String((action as any).text || "").trim();
      if (text) {
        descriptions.push(`texto: "${text}"`);
      }
      continue;
    }

    if (action?.type === "send_media_url") {
      const mediaType = String((action as any).media_type || "midia").trim();
      const caption = String((action as any).caption || "").trim();
      descriptions.push(
        caption
          ? `${mediaType}: "${caption}"`
          : mediaType,
      );
      continue;
    }

    if (action?.type === "send_media") {
      const mediaName = String((action as any).media_name || "").trim();
      descriptions.push(mediaName ? `midia: ${mediaName}` : "midia");
    }
  }

  return descriptions.join(" | ");
}

function buildAgentInfoPriorityBlock(agentConfig: any, contactName?: string): string | null {
  const rules: string[] = [];
  const safeName = sanitizeContactName(contactName);
  const businessHoursEnabled = (agentConfig as any)?.businessHoursEnabled === true;
  const offHoursMessageEnabled = (agentConfig as any)?.offHoursMessageEnabled === true;
  const isOpenNow = isWithinAgentBusinessHours(agentConfig);
  const businessHoursText = businessHoursEnabled ? formatAgentBusinessHours(agentConfig) : "";
  const nowInBrazil = getBrazilDateTime();
  const openingRule = resolveAgentOpeningRule(agentConfig, contactName);

  rules.push(`${buildBrazilGreetingPromptInstruction()}
Horario atual completo no Brasil: ${nowInBrazil.fullDateTime}.`);

  if (openingRule) {
    if (openingRule.source === "off_hours") {
      if (openingRule.variationEnabled) {
        rules.push(`MENSAGEM CONDICIONAL FORA DO HORARIO:
Quando esta for a primeira resposta da conversa e o horario atual estiver fora do atendimento, crie UMA UNICA abertura baseada nesta mensagem: "${openingRule.text}"
Mantenha o mesmo sentido, mas nao acrescente outra saudacao paralela, outra apresentacao nem uma segunda abertura diferente.
Se o cliente ja chegou fazendo uma pergunta concreta, responda a pergunta na mesma mensagem sem perder o sentido desta abertura.
Horario atual no Brasil: ${nowInBrazil.fullDateTime}. Status atual: FECHADO.`);
      } else {
        rules.push(`MENSAGEM CONDICIONAL FORA DO HORARIO:
Quando esta for a primeira resposta da conversa e o horario atual estiver fora do atendimento, use EXATAMENTE esta abertura: "${openingRule.text}"
Depois dessa abertura, se precisar, continue a resposta sem criar outra saudacao, outra apresentacao nem uma segunda abertura.
Horario atual no Brasil: ${nowInBrazil.fullDateTime}. Status atual: FECHADO.`);
      }
    } else if (openingRule.variationEnabled) {
      rules.push(`SAUDACAO INICIAL PERSONALIZADA:
Na primeira resposta da conversa, crie UMA UNICA saudacao baseada nesta mensagem: "${openingRule.text}"
Voce pode variar a redacao, mas precisa manter o mesmo sentido e o mesmo objetivo.
Nao acrescente outra saudacao paralela, outra apresentacao nem uma segunda abertura diferente.
Se o cliente ja chegou perguntando algo concreto, responda a pergunta nessa mesma mensagem sem ignorar a saudacao configurada.`);
    } else {
      rules.push(`SAUDACAO INICIAL PERSONALIZADA:
Na primeira resposta da conversa, abra EXATAMENTE com esta saudacao: "${openingRule.text}"
Depois dessa abertura, se precisar, continue a resposta sem criar outra saudacao, outra apresentacao nem uma segunda abertura.
Se o cliente ja chegou perguntando algo concreto, responda a pergunta nessa mesma mensagem mantendo esta abertura.`);
    }
  }

  if ((agentConfig as any)?.addressEnabled === true && agentConfig?.customAddress) {
    rules.push(`ENDERECO FIXO DO NEGOCIO:
Quando o cliente perguntar sobre localizacao, endereco, como chegar ou onde fica, responda com este endereco oficial: "${agentConfig.customAddress}"
Nao invente, nao adapte e nao substitua por outro endereco.`);
  }

  if (businessHoursEnabled) {
    rules.push(`HORARIO OFICIAL DE FUNCIONAMENTO:
Use somente os horarios abaixo para falar de dias e horarios de atendimento:
${businessHoursText}
Horario atual no Brasil: ${nowInBrazil.fullDateTime}. Status atual: ${isOpenNow ? "ABERTO" : "FECHADO"}.
Nao invente horario extra, nao diga que esta aberto se estiver fechado e nao diga que esta fechado se estiver aberto.`);
  }

  if (businessHoursEnabled && offHoursMessageEnabled && agentConfig?.offHoursMessage) {
    rules.push(`REGRA EXTRA FORA DO HORARIO:
Se a conversa chegar fora do horario de atendimento, use esta mensagem como referencia principal de abertura e tom ao acolher o cliente: "${agentConfig.offHoursMessage}"
Mesmo fora do horario, voce pode responder perguntas factuais seguras, como endereco e horario oficial, sem contradizer a mensagem.`);
  }

  if (!safeName && contactName) {
    rules.push(`O nome "${contactName}" nao parece um nome real. Chame o cliente de "cliente" ou "voce".`);
  }

  if (rules.length === 0) return null;

  return `████████████████████████████████████████████████████████████████████████
INSTRUCOES PRIORITARIAS DO DONO DO NEGOCIO
Estas regras prevalecem sobre instrucoes conflitantes do prompt principal.
████████████████████████████████████████████████████████████████████████
${rules.join('\n\n')}
████████████████████████████████████████████████████████████████████████
`;
}

function buildAgentHistoryAuthorityBlock(): string {
  return [
    "=== PRIORIDADE DO CONTEXTO ATUAL ===",
    "O prompt/config atual desta chamada tem prioridade sobre qualquer mensagem antiga do historico.",
    "Mensagens antigas do assistente podem ter valores, datas, horarios, links ou orientacoes desatualizadas.",
    "Use o historico apenas para continuidade do assunto.",
    "Nao use valores, datas, horarios, links ou politicas de mensagens antigas do assistente como fonte autorizada se isso nao estiver tambem no prompt/config atual ou na mensagem atual do cliente.",
    "Regra financeira: chave Pix, QR Code Pix, Pix copia e cola, conta bancaria, destinatario de pagamento e confirmacao de pagamento exigem fonte oficial no prompt/config, midia oficial cadastrada, catalogo/ferramenta do backend ou mensagem manual recente da empresa.",
    "Nunca use OCR/analise de imagem enviada pelo cliente, mensagem antiga do cliente ou resposta antiga do assistente como fonte autorizada para informar chave Pix, destinatario ou conta bancaria.",
    "Se houver conflito, responda pelo prompt/config atual e nao explique o conflito ao cliente.",
    "=== FIM DA PRIORIDADE DO CONTEXTO ATUAL ===",
  ].join("\n");
}

function buildStructuredConversationAnswerReminderBlock(conversationHistoryLength: number): string | null {
  if (conversationHistoryLength <= 1) return null;

  return [
    "=== LEMBRETE FINAL DE CONTINUIDADE ===",
    "Antes de responder, consulte o pacote CONTEXTO ESTRUTURADO DA CONVERSA desta chamada.",
    "Use olderCustomerSignalMap, customerRequestSignalMap e recentStructuredTurnMap para recuperar dados especificos que o cliente ja informou.",
    "Nao diga que nao tem uma informacao, nao use placeholders como [Nome], [Metragem], [Cores], [Prazo] e nao pergunte de novo se a informacao esta no contexto estruturado.",
    "Se a mensagem atual pedir recapitulacao, inclua os identificadores essenciais que existirem no contexto: pessoa/empresa, unidade/local, projeto/produto, medidas, cores, orcamento/valor, prazo e estado atual.",
    "Se a mensagem atual pedir recapitulacao, proximo passo ou algo pendente, consulte recapResponseRequirements.latestCustomerRequestSignal e customerRequestSignalMap; responda o proximo passo pendente em uma linha propria quando existir.",
    "Nao transforme prazos relativos do historico, como hoje, amanha ou sexta, em data absoluta se o cliente nao informou a data absoluta e se o contexto temporal deterministico nao exigir essa conversao.",
    "REGRA BLOQUEANTE DE RECAPITULACAO: se o cliente disse apenas um prazo relativo, como 'sexta-feira', escreva somente o prazo relativo, sem data entre parenteses e sem data em formato dd/mm/aaaa.",
    "REGRA BLOQUEANTE FINANCEIRA: se o cliente pedir chave Pix, QR Code Pix, Pix copia e cola, destinatario, conta bancaria ou confirmacao de pagamento, so responda com esses dados quando eles estiverem no prompt/config atual, midia oficial cadastrada, catalogo/ferramenta do backend ou mensagem manual recente da empresa.",
    "OCR de comprovante, texto de imagem enviada pelo cliente, mensagem antiga do cliente e resposta antiga do assistente servem apenas como relato do cliente, nunca como fonte oficial para enviar dado financeiro.",
    "Se houver conflito, a correcao mais recente do cliente e a mensagem atual vencem.",
    "=== FIM DO LEMBRETE FINAL DE CONTINUIDADE ===",
  ].join("\n");
}

function truncateConversationContextValue(value: unknown, maxLength = 420): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

const STRUCTURED_CONTEXT_FIRST_TURNS = 8;
const STRUCTURED_CONTEXT_RECENT_TURNS = 32;
const STRUCTURED_CONTEXT_OLDER_DIGEST_TURNS = 72;
const STRUCTURED_CONTEXT_OLDER_CUSTOMER_DIGEST_TURNS = 72;
const STRUCTURED_CONTEXT_CUSTOMER_REQUEST_TURNS = 18;
const STRUCTURED_CONTEXT_CUSTOMER_REQUEST_STRONG_SIGNALS = [
  "quero receber",
  "quero que envie",
  "me envie",
  "me manda",
  "manda",
  "mande",
  "enviar",
  "envio",
  "preciso",
  "pendente",
  "proximo passo",
  "antes de aprovar",
  "para aprovar",
  "confirmar",
];
const STRUCTURED_CONTEXT_CUSTOMER_REQUEST_SUPPORTING_SIGNALS = [
  "foto",
  "prototipo",
  "modelo",
  "orcamento",
  "prazo",
  "valor",
  "agenda",
  "horario",
  "link",
  "catalogo",
  "pdf",
  "video",
  "audio",
  "confirmacao",
  "aprovacao",
  "aprovar",
];

function getConversationContextTimestamp(message: Message): string | null {
  const rawTimestamp = (message as any)?.timestamp;
  if (!rawTimestamp) return null;

  try {
    const date = rawTimestamp instanceof Date ? rawTimestamp : new Date(rawTimestamp);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch {
    return null;
  }
}

function getConversationContextSpeaker(message: Message): "agent" | "owner_manual" | "customer" {
  if (message.isFromAgent === true) return "agent";
  if (message.fromMe === true) return "owner_manual";
  return "customer";
}

function selectChronologicalContextSlice<T>(items: T[], maxItems: number): Array<{ item: T; sourceIndex: number }> {
  if (items.length <= maxItems) {
    return items.map((item, sourceIndex) => ({ item, sourceIndex }));
  }

  const selected: Array<{ item: T; sourceIndex: number }> = [];
  const usedIndexes = new Set<number>();

  for (let slot = 0; slot < maxItems; slot++) {
    const sourceIndex = Math.round((slot * (items.length - 1)) / Math.max(1, maxItems - 1));
    if (usedIndexes.has(sourceIndex)) continue;
    usedIndexes.add(sourceIndex);
    selected.push({ item: items[sourceIndex], sourceIndex });
  }

  return selected;
}

function scoreStructuredCustomerRequestSignal(value: unknown): number {
  const normalized = normalizeOperationalMediaText(String(value || ""));
  if (!normalized) return 0;

  let score = normalized.includes("?") ? 2 : 0;
  for (const signal of STRUCTURED_CONTEXT_CUSTOMER_REQUEST_STRONG_SIGNALS) {
    if (normalized.includes(signal)) score += 3;
  }
  for (const signal of STRUCTURED_CONTEXT_CUSTOMER_REQUEST_SUPPORTING_SIGNALS) {
    if (normalized.includes(signal)) score += 1;
  }
  return score;
}

function buildStructuredConversationContextBlock(params: {
  conversationHistory: Message[];
  currentMessage: string;
  contactName?: string;
  sentMedias?: string[];
}): string | null {
  const history = Array.isArray(params.conversationHistory)
    ? params.conversationHistory
    : [];

  if (history.length === 0) {
    return null;
  }

  const toContextTurn = (message: Message, index: number, maxTextLength = 420) => ({
    index,
    speaker: getConversationContextSpeaker(message),
    text: truncateConversationContextValue(message.text || message.mediaCaption || "", maxTextLength),
    mediaType: truncateConversationContextValue((message as any)?.mediaType || "", 80) || null,
    timestamp: getConversationContextTimestamp(message),
  });

  const latestCustomerMessage = [...history]
    .reverse()
    .find((message) => message.fromMe === false);
  const latestAgentReply = [...history]
    .reverse()
    .find((message) => message.isFromAgent === true);
  const latestManualOwnerMessage = [...history]
    .reverse()
    .find((message) => message.fromMe === true && message.isFromAgent !== true);
  const recentTurnCount = Math.min(history.length, STRUCTURED_CONTEXT_RECENT_TURNS);
  const recentStartIndex = Math.max(0, history.length - recentTurnCount);
  const firstTurns = history
    .slice(0, Math.min(history.length, STRUCTURED_CONTEXT_FIRST_TURNS))
    .map((message, offset) => toContextTurn(message, offset, 520));
  const recentStructuredTurnMap = history
    .slice(recentStartIndex)
    .map((message, offset) => toContextTurn(message, recentStartIndex + offset, 720));
  const olderDigestStartIndex = firstTurns.length;
  const olderMessagesForDigest = history.slice(olderDigestStartIndex, recentStartIndex);
  const olderTurnDigest = selectChronologicalContextSlice(olderMessagesForDigest, STRUCTURED_CONTEXT_OLDER_DIGEST_TURNS)
    .map(({ item, sourceIndex }) => toContextTurn(item, olderDigestStartIndex + sourceIndex, 260));
  const olderCustomerMessages = olderMessagesForDigest
    .map((message, sourceIndex) => ({ message, sourceIndex }))
    .filter(({ message }) => getConversationContextSpeaker(message) === "customer");
  const olderCustomerSignalMap = selectChronologicalContextSlice(olderCustomerMessages, STRUCTURED_CONTEXT_OLDER_CUSTOMER_DIGEST_TURNS)
    .map(({ item }) => toContextTurn(item.message, olderDigestStartIndex + item.sourceIndex, 320));
  const customerRequestSignalMap = history
    .map((message, index) => ({ message, index, score: scoreStructuredCustomerRequestSignal(message.text || message.mediaCaption || "") }))
    .filter(({ message, score }) => getConversationContextSpeaker(message) === "customer" && score >= 3)
    .slice(-STRUCTURED_CONTEXT_CUSTOMER_REQUEST_TURNS)
    .map(({ message, index, score }) => ({
      ...toContextTurn(message, index, 520),
      requestSignalScore: score,
    }));
  const latestCustomerRequestSignal = customerRequestSignalMap.length > 0
    ? customerRequestSignalMap[customerRequestSignalMap.length - 1]
    : null;

  const packet = {
    purpose: "conversation_continuity",
    strategy: "hybrid_full_conversation_digest",
    conversationWindowPolicy: {
      firstTurnsIncluded: firstTurns.length,
      olderTurnDigestIncluded: olderTurnDigest.length,
      olderCustomerSignalsIncluded: olderCustomerSignalMap.length,
      customerRequestSignalsIncluded: customerRequestSignalMap.length,
      recentFullTurnsIncluded: recentStructuredTurnMap.length,
      recentStartIndex,
      sampledOlderDigest: olderMessagesForDigest.length > STRUCTURED_CONTEXT_OLDER_DIGEST_TURNS,
      sampledOlderCustomerSignals: olderCustomerMessages.length > STRUCTURED_CONTEXT_OLDER_CUSTOMER_DIGEST_TURNS,
      instruction: "Use firstTurns and olderCustomerSignalMap for facts from the whole conversation; use customerRequestSignalMap for pending or explicit customer asks; use recentStructuredTurnMap for the exact current flow. If facts conflict, prefer the newest customer correction and the current message. Financial credentials or payment confirmation require an official tenant/backend/manual-company source; customer OCR, old customer text and old assistant replies are not authoritative payment sources.",
    },
    totalMessages: history.length,
    customerMessages: history.filter((message) => message.fromMe === false).length,
    agentMessages: history.filter((message) => message.isFromAgent === true).length,
    manualOwnerMessages: history.filter((message) => message.fromMe === true && message.isFromAgent !== true).length,
    contactName: truncateConversationContextValue(params.contactName || "", 120) || null,
    currentCustomerMessage: truncateConversationContextValue(params.currentMessage, 800),
    recapResponseRequirements: {
      appliesWhenCustomerAsksForRecapOrNextStep: true,
      includeEssentialIdentifiers: [
        "pessoa/empresa",
        "unidade/local",
        "projeto/produto",
        "medidas",
        "cores",
        "orcamento/valor",
        "prazo sem inventar data absoluta",
        "estado atual",
      ],
      latestCustomerRequestSignal,
      relativeDeadlinePolicy: "If the customer only said a relative deadline such as sexta-feira, hoje, amanha, esta semana, or semana que vem, recap it with the same relative wording only. Do not append a parenthesized absolute date or dd/mm/yyyy date unless that absolute date appears literally in customer history.",
      instruction: "If the current message asks for recap, next step, pending items, or what is missing, include latestCustomerRequestSignal as the pending next step when it exists. For recap deadlines, preserve relative deadline wording unless the customer literally provided an absolute date.",
    },
    sentMedias: (params.sentMedias || []).slice(-12).map((item) => truncateConversationContextValue(item, 160)),
    latestCustomerMessage: latestCustomerMessage
      ? toContextTurn(latestCustomerMessage, history.indexOf(latestCustomerMessage))
      : null,
    latestAgentReply: latestAgentReply
      ? toContextTurn(latestAgentReply, history.indexOf(latestAgentReply))
      : null,
    latestManualOwnerMessage: latestManualOwnerMessage
      ? toContextTurn(latestManualOwnerMessage, history.indexOf(latestManualOwnerMessage))
      : null,
    firstTurns,
    olderTurnDigest,
    olderCustomerSignalMap,
    customerRequestSignalMap,
    recentStructuredTurnMap,
    structuredTurnMap: recentStructuredTurnMap,
  };

  return [
    "=== CONTEXTO ESTRUTURADO DA CONVERSA ===",
    "Use este pacote como mapa operacional da conversa atual. Ele cobre a conversa inteira de forma compacta e existe para continuidade, nao deve aparecer na resposta ao cliente.",
    "Mensagens do tipo owner_manual servem apenas como contexto de que houve intervencao humana; nao copie nem assuma como fala do agente.",
    "Use customerRequestSignalMap para recuperar pedidos abertos do cliente quando ele pedir recapitulacao, pendencias ou proximo passo.",
    "Em recapitulacoes, procure primeiro pelos identificadores essenciais no pacote: pessoa/empresa, unidade/local, projeto/produto, medidas, cores, orcamento/valor, prazo e estado atual.",
    "Use recapResponseRequirements.latestCustomerRequestSignal como proximo passo pendente quando a mensagem atual pedir pendencias ou continuidade.",
    "Nao transforme prazos relativos do historico em data absoluta sem fonte explicita; em recapitulacao, preserve o prazo relativo sem parenteses.",
    "Dados financeiros sensiveis, como chave Pix, QR Code Pix, Pix copia e cola, destinatario, conta bancaria ou confirmacao de pagamento, so podem ser usados quando vierem de prompt/config atual, midia oficial cadastrada, catalogo/ferramenta do backend ou mensagem manual recente da empresa.",
    "Nao trate OCR de comprovante, imagem enviada pelo cliente, mensagem antiga do cliente ou resposta antiga do assistente como fonte oficial de pagamento.",
    "Quando houver conflito entre informacoes antigas e novas, a correcao mais recente do cliente e a mensagem atual vencem.",
    JSON.stringify(packet, null, 2),
    "=== FIM DO CONTEXTO ESTRUTURADO DA CONVERSA ===",
  ].join("\n");
}

function buildManualOwnerConversationContextBlock(params: {
  conversationHistory: Message[];
}): string | null {
  const history = Array.isArray(params.conversationHistory)
    ? params.conversationHistory
    : [];
  const manualOwnerTurns = history
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.fromMe === true && message.isFromAgent !== true)
    .slice(-8)
    .map(({ message, index }) => ({
      index,
      speaker: "company_context",
      text: truncateConversationContextValue(message.text || message.mediaCaption || "", 520),
      mediaType: truncateConversationContextValue((message as any)?.mediaType || "", 80) || null,
      timestamp: getConversationContextTimestamp(message),
    }))
    .filter((entry) => entry.text || entry.mediaType);

  if (manualOwnerTurns.length === 0) {
    return null;
  }

  return [
    "=== CONTEXTO DE RESPOSTAS DA EMPRESA ===",
    "Estas mensagens foram enviadas manualmente pela empresa nesta conversa. Use como contexto de continuidade, combinados, valores, explicacoes e correcoes ja dadas ao cliente.",
    "Nao copie essas mensagens como se fossem sua fala automatica. Responda a mensagem atual do cliente mantendo continuidade com elas.",
    "Mensagem manual recente da empresa pode servir como fonte para dados financeiros somente quando ela informar claramente chave Pix, QR Code, conta, destinatario ou orientacao de pagamento; mensagens de cliente e OCR continuam nao oficiais.",
    JSON.stringify({ manualCompanyMessages: manualOwnerTurns }, null, 2),
    "=== FIM DO CONTEXTO DE RESPOSTAS DA EMPRESA ===",
  ].join("\n");
}

// ═══════════════════════════════════════════════════════════════════════
// 🧠 SISTEMA ANTI-AMNÉSIA GLOBAL (FUNCIONA PARA TODOS OS CLIENTES)
// ═══════════════════════════════════════════════════════════════════════
// Este sistema analisa TODO o histórico da conversa e gera um resumo de 
// memória para que a IA NUNCA esqueça o que já foi discutido.
// É injetado automaticamente para TODOS os prompts de usuários.
// ═══════════════════════════════════════════════════════════════════════

interface ConversationMemory {
  hasGreeted: boolean;           // Já cumprimentou?
  greetingCount: number;         // Quantas vezes cumprimentamos?
  hasAskedName: boolean;         // Já perguntou o nome?
  nameQuestionCount: number;     // Quantas vezes perguntamos o nome?
  hasExplainedProduct: boolean;  // Já explicou o produto/serviço?
  hasAskedBusiness: boolean;     // Já perguntou sobre o negócio do cliente?
  businessQuestionCount: number; // Quantas vezes perguntamos sobre negócio?
  hasSentMedia: string[];        // Quais mídias foram enviadas?
  hasPromisedToSend: string[];   // Prometeu enviar algo?
  hasAnsweredQuestions: string[]; // Quais perguntas já respondeu?
  clientQuestions: string[];     // O que o cliente perguntou?
  clientInfo: {                  // Informações coletadas sobre o cliente
    name?: string;
    business?: string;
    interests?: string[];
    objections?: string[];
    stage?: string;
  };
  lastTopics: string[];          // Últimos assuntos discutidos
  pendingActions: string[];      // Ações prometidas mas não cumpridas
  loopDetected: boolean;         // Detectado padrão de loop?
  loopReason: string;            // Razão do loop detectado
}

export function analyzeConversationHistory(
  conversationHistory: Array<{ fromMe?: boolean; text?: string | null; timestamp?: Date | null; isFromAgent?: boolean }>,
  contactName?: string
): ConversationMemory {
  const memory: ConversationMemory = {
    hasGreeted: false,
    greetingCount: 0,
    hasAskedName: false,
    nameQuestionCount: 0,
    hasExplainedProduct: false,
    hasAskedBusiness: false,
    businessQuestionCount: 0,
    hasSentMedia: [],
    hasPromisedToSend: [],
    hasAnsweredQuestions: [],
    clientQuestions: [],
    clientInfo: { name: contactName },
    lastTopics: [],
    pendingActions: [],
    loopDetected: false,
    loopReason: '',
  };

  if (!conversationHistory || conversationHistory.length === 0) {
    return memory;
  }

  // Padrões de detecção
  const greetingPatterns = /^(oi|olá|ola|bom dia|boa tarde|boa noite|e aí|eae|hey|hello|fala|salve)/i;
  const nameQuestionPatterns = /(qual (é |seu |o seu )?nome|como (você |vc |tu )?(se )?chama|posso te chamar de)/i;
  const businessQuestionPatterns = /(qual (é |seu |o seu )?(negócio|ramo|área|empresa|trabalho)|o que (você |vc )?(faz|vende)|que tipo de|qual seu segmento)/i;
  // Promessas explícitas ("Vou te enviar...")
  const promisePatterns = /(vou (te )?(enviar|mandar|mostrar)|deixa eu (enviar|mandar)|te (envio|mando)|já já (envio|mando)|segue (o|a) |vou te enviar|aqui está|veja o)/i;
  // Ofertas/Perguntas ("Posso te enviar?", "Quer ver?", "Topico te mostrar")
  const offerPatterns = /(posso (te )?(enviar|mandar|mostrar)|quer (ver|que eu envie|que eu mostre)|topa (ver|conhecer)|gostaria de (ver|receber)|topico te (mostrar|enviar)|qual opção você prefere)/i;
  // Aceite do cliente ("Sim", "Pode", "Aguardo", "Quero") - MAIS ABRANGENTE
  const acceptancePatterns = /^(sim|pode|claro|com certeza|quero|manda|envia|aguardo|estou aguardando|ok|blz|tá bom|pode ser|beleza|show|perfeito|ótimo|otimo|bora|vamos|fechou|combinado|certo|isso|exato|manda aí|manda ai|por favor|please|yes|yep|yeah)/i;

  const questionPatterns = /\?$/;
  const mediaPatterns = /(vídeo|video|foto|imagem|áudio|audio|documento|pdf|arquivo|demonstração|demo)/i;
  const pricePatterns = /(preço|valor|quanto custa|R\$|\d+,\d{2}|\d+\.\d{2})/i;
  const featurePatterns = /(funcionalidade|recurso|função|como funciona|o que faz|benefício)/i;

  let lastOfferContent: string | null = null; // O que foi oferecido por último?

  for (const msg of conversationHistory) {
    if (!msg.text) continue;
    const text = msg.text.toLowerCase();
    
    // 🛡️ CORREÇÃO CRÍTICA: Só considerar como "nossa mensagem" se foi do AGENTE (IA)
    // Mensagens manuais do dono (fromMe=true, isFromAgent=false) NÃO devem ser analisadas
    // como se fossem do agente, pois podem conter assuntos diferentes (ex: vendendo AgenteZap)
    const isFromAgent = msg.isFromAgent === true;
    const isFromOwner = msg.fromMe === true && msg.isFromAgent === false;
    const isFromClient = msg.fromMe === false;

    // Ignorar mensagens manuais do dono para análise de memória
    if (isFromOwner) {
      continue;
    }

    if (isFromAgent) {
      // Análise das mensagens DO AGENTE (IA)
      if (greetingPatterns.test(text)) {
        memory.hasGreeted = true;
        memory.greetingCount++;
      }
      if (nameQuestionPatterns.test(text)) {
        memory.hasAskedName = true;
        memory.nameQuestionCount++;
      }
      if (businessQuestionPatterns.test(text)) {
        memory.hasAskedBusiness = true;
        memory.businessQuestionCount++;
      }
      if (pricePatterns.test(text)) {
        memory.hasExplainedProduct = true;
        memory.hasAnsweredQuestions.push("preço/valor");
      }
      if (featurePatterns.test(text)) {
        memory.hasExplainedProduct = true;
        memory.hasAnsweredQuestions.push("funcionalidades");
      }

      // Detectar promessas de envio
      if (promisePatterns.test(text)) {
        const mediaMatch = text.match(mediaPatterns);
        if (mediaMatch) {
          memory.hasPromisedToSend.push(mediaMatch[0]);
        }
      }

      // Detectar OFERTAS de envio (possível pendência se cliente aceitar)
      if (offerPatterns.test(text)) {
        const mediaMatch = text.match(mediaPatterns);
        if (mediaMatch) {
          lastOfferContent = mediaMatch[0]; // Guardar o que foi oferecido (ex: "vídeo")
        } else if (text.includes("como funciona") || text.includes("demonstra")) {
          lastOfferContent = "explicação/vídeo";
        }
      } else {
        // Se falamos outra coisa que não é oferta, limpamos a oferta pendente?
        // Não necessariamente, o cliente pode responder a oferta depois.
        // Mas vamos manter simples: só a última oferta conta.
      }

      // Detectar mídias enviadas
      if (text.includes("[vídeo") || text.includes("[video") || 
          text.includes("enviando vídeo") || text.includes("veja o vídeo") || text.includes("segue o vídeo")) {
        memory.hasSentMedia.push("vídeo");
        // Se enviamos, removemos da lista de promessas e ofertas
        lastOfferContent = null; 
      }
      if (text.includes("[imagem") || text.includes("[foto") || 
          text.includes("enviando imagem") || text.includes("veja a imagem")) {
        memory.hasSentMedia.push("imagem");
        lastOfferContent = null;
      }
      if (text.includes("[áudio") || text.includes("[audio")) {
        memory.hasSentMedia.push("áudio");
      }

    } else if (isFromClient) {
      // Análise das mensagens do cliente
      // 🚨 CRÍTICO: Se cliente aceitou oferta ou disse "aguardo"
      if (lastOfferContent && acceptancePatterns.test(text)) {
        memory.pendingActions.push(`CLIENTE ACEITOU SUA OFERTA! Envie agora: ${lastOfferContent}`);
        memory.hasPromisedToSend.push(lastOfferContent); // Tratar como promessa agora
        lastOfferContent = null; // Oferta aceita e processada
      }
      
      // Se cliente disse "aguardo" ou similar, SEMPRE adicionar ação pendente
      if (text.match(/aguardo|esperando|fico no aguardo|estou esperando|esperarei|pode mandar|pode enviar|manda aí|manda ai/i)) {
         // Procurar no histórico o que foi prometido (APENAS do agente, não do dono)
         const lastAgentMessages = conversationHistory.filter(m => m.isFromAgent === true).slice(-5);
         let promisedItem = "o que foi prometido";
         for (const msg of lastAgentMessages) {
            if (msg.text && msg.text.match(/vídeo|video|áudio|audio|imagem|foto|explicar|mostrar|demonstr/i)) {
               const match = msg.text.match(/(vídeo|video|áudio|audio|imagem|foto)/i);

               if (match) promisedItem = match[0];
               break;
            }
         }
         memory.pendingActions.push(`CLIENTE DISSE "${text.substring(0, 20)}"! ENVIE AGORA: ${promisedItem}. NÃO PERGUNTE NADA, APENAS ENVIE!`);
      }

      if (questionPatterns.test(text)) {
        // Extrair o assunto da pergunta
        if (pricePatterns.test(text)) {
          memory.clientQuestions.push("preço");
        }
        if (featurePatterns.test(text)) {
          memory.clientQuestions.push("funcionalidades");
        }
        if (text.includes("como")) {
          memory.clientQuestions.push("como funciona");
        }
      }

      // Detectar informações do cliente
      if (text.match(/trabalho com|tenho (uma |um )?(loja|empresa|negócio)|meu (negócio|ramo)/i)) {
        memory.clientInfo.business = text;
      }

      // Detectar interesses
      if (text.match(/me interessa|quero saber|gostaria de|preciso de/i)) {
        memory.clientInfo.interests = memory.clientInfo.interests || [];
        memory.clientInfo.interests.push(text.substring(0, 50));
      }

      // Detectar objeções
      if (text.match(/caro|não sei|vou pensar|depois|agora não|muito|difícil/i)) {
        memory.clientInfo.objections = memory.clientInfo.objections || [];
        memory.clientInfo.objections.push(text.substring(0, 50));
      }
    }
  }

  // Verificar promessas não cumpridas
  for (const promised of memory.hasPromisedToSend) {
    if (!memory.hasSentMedia.includes(promised)) {
      memory.pendingActions.push(`Enviar ${promised} que foi prometido`);
    }
  }

  // Extrair últimos tópicos (das últimas 5 mensagens)
  const recentMessages = conversationHistory.slice(-5);
  for (const msg of recentMessages) {
    if (msg.text) {
      if (pricePatterns.test(msg.text)) memory.lastTopics.push("preço");
      if (featurePatterns.test(msg.text)) memory.lastTopics.push("funcionalidades");
      if (mediaPatterns.test(msg.text)) memory.lastTopics.push("mídia/demonstração");
    }
  }

  // 🚨 DETECÇÃO DE LOOPS - Padrões repetitivos que indicam problema
  if (memory.greetingCount >= 2) {
    memory.loopDetected = true;
    memory.loopReason = `Saudação repetida ${memory.greetingCount}x`;
  }
  if (memory.nameQuestionCount >= 2) {
    memory.loopDetected = true;
    memory.loopReason = `Pergunta de nome repetida ${memory.nameQuestionCount}x`;
  }
  if (memory.businessQuestionCount >= 2) {
    memory.loopDetected = true;
    memory.loopReason = `Pergunta de negócio repetida ${memory.businessQuestionCount}x`;
  }

  // Detectar mensagens idênticas do agente
  const agentMessages = conversationHistory.filter(m => m.fromMe).map(m => m.text?.substring(0, 100) || '');
  const messageFrequency = new Map<string, number>();
  for (const msg of agentMessages) {
    if (msg.length > 20) { // Ignorar msgs muito curtas
      const count = (messageFrequency.get(msg) || 0) + 1;
      messageFrequency.set(msg, count);
      if (count >= 3) {
        memory.loopDetected = true;
        memory.loopReason = `Mensagem repetida ${count}x: "${msg.substring(0, 30)}..."`;
      }
    }
  }

  return memory;
}

function generateMemoryContextBlock(
  memory: ConversationMemory,
  contactName?: string
): string {
  const sections: string[] = [];

  // Nome do cliente - SEMPRE usar se disponível (sanitizado)
  const clientName = sanitizeContactName(contactName) || null;

  sections.push(`
═══════════════════════════════════════════════════════════════════════════════
🧠 MEMÓRIA DA CONVERSA (NUNCA ESQUEÇA - ANTI-AMNÉSIA)
═══════════════════════════════════════════════════════════════════════════════`);

  // 🚨 ALERTA DE LOOP DETECTADO - PRIORIDADE MÁXIMA
  if (memory.loopDetected) {
    sections.push(`
🚨🚨🚨 ALERTA CRÍTICO: LOOP DETECTADO! 🚨🚨🚨
═══════════════════════════════════════════════════════════════════════════════
PROBLEMA: ${memory.loopReason}

VOCÊ ESTÁ REPETINDO AS MESMAS COISAS!
ISSO FAZ VOCÊ PARECER UM ROBÔ BURRO E AFASTA CLIENTES!

INSTRUÇÕES OBRIGATÓRIAS:
1. NÃO cumprimente de novo (você já cumprimentou ${memory.greetingCount}x!)
2. NÃO pergunte o nome de novo (você já perguntou ${memory.nameQuestionCount}x!)
3. NÃO pergunte sobre negócio de novo (você já perguntou ${memory.businessQuestionCount}x!)
4. AVANCE a conversa - pergunte algo NOVO ou ofereça algo NOVO
5. Se não sabe o que fazer, pergunte: "Tem mais alguma dúvida?"

SE CONTINUAR REPETINDO = CLIENTE PERDIDO!
═══════════════════════════════════════════════════════════════════════════════`);
  }

  // 1. Nome do cliente - TÉCNICA DE VENDAS: Usar o nome gera rapport
  if (clientName) {
    sections.push(`
👤 NOME DO CLIENTE: ${clientName}
   → Use o nome ${clientName} naturalmente na conversa (técnica de rapport)
   → Exemplo: "Entendi, ${clientName}..." ou "${clientName}, vou te explicar..."
   → NÃO chame de "cara", "véi", "mano" - seja profissional mas acolhedor`);
  } else {
    sections.push(`
👤 NOME DO CLIENTE: Não identificado
   → Trate como "você" de forma respeitosa
   → Se apropriado, pergunte o nome UMA VEZ para personalizar o atendimento`);
  }

  // 2. Status da conversa
  if (memory.hasGreeted) {
    sections.push(`
🚫 CUMPRIMENTO: JÁ FOI FEITO!
   → NÃO cumprimente novamente (sem "Oi", "Olá", "Bom dia")
   → NÃO se apresente de novo
   → Vá DIRETO ao assunto - continue a conversa naturalmente`);
  }

  // 3. Informações já coletadas
  if (memory.hasAskedName) {
    sections.push(`
✅ JÁ PERGUNTOU O NOME: Não pergunte novamente`);
  }
  if (memory.hasAskedBusiness) {
    sections.push(`
✅ JÁ PERGUNTOU SOBRE O NEGÓCIO: Não pergunte novamente`);
  }
  if (memory.hasExplainedProduct) {
    sections.push(`
✅ JÁ EXPLICOU PRODUTO/SERVIÇO: Não repita explicações básicas`);
  }

  // 4. Perguntas já respondidas
  if (memory.hasAnsweredQuestions.length > 0) {
    sections.push(`
📝 PERGUNTAS JÁ RESPONDIDAS (não repita):
   → ${[...new Set(memory.hasAnsweredQuestions)].join(", ")}`);
  }

  // 5. Mídias enviadas
  if (memory.hasSentMedia.length > 0) {
    sections.push(`
📁 MÍDIAS JÁ ENVIADAS (não repita):
   → ${[...new Set(memory.hasSentMedia)].join(", ")}`);
  }

  // 6. AÇÕES PENDENTES - CRÍTICO!
  if (memory.pendingActions.length > 0) {
    sections.push(`
🚨 URGENTE: AÇÃO PENDENTE DETECTADA (PRIORIDADE MÁXIMA) 🚨
═══════════════════════════════════════════════════════════════════════════════
O cliente está AGUARDANDO uma ação que você prometeu ou uma resposta específica.
IGNORE saudações. IGNORE apresentações. NÃO pergunte "como posso ajudar".
VOCÊ JÁ SABE O QUE FAZER. EXECUTE A AÇÃO ABAIXO IMEDIATAMENTE:

   → ${memory.pendingActions.join("\n   → ")}

⚠️ REGRA DE OURO: Se a ação é mandar um vídeo/áudio, MANDE AGORA. Não fale que vai mandar, MANDE.`);
  }

  // 7. Contexto do cliente
  if (memory.clientInfo.business) {
    sections.push(`
🏢 NEGÓCIO DO CLIENTE: ${memory.clientInfo.business.substring(0, 100)}
   → Personalize suas respostas para este segmento`);
  }
  if (memory.clientInfo.interests && memory.clientInfo.interests.length > 0) {
    sections.push(`
💡 INTERESSES DO CLIENTE:
   → ${memory.clientInfo.interests.slice(0, 3).join("\n   → ")}`);
  }
  if (memory.clientInfo.objections && memory.clientInfo.objections.length > 0) {
    sections.push(`
🤔 OBJEÇÕES/PREOCUPAÇÕES DO CLIENTE:
   → ${memory.clientInfo.objections.slice(0, 3).join("\n   → ")}
   → Trabalhe essas objeções com empatia`);
  }

  // 8. Últimos tópicos
  if (memory.lastTopics.length > 0) {
    sections.push(`
📌 ÚLTIMOS ASSUNTOS DISCUTIDOS:
   → ${[...new Set(memory.lastTopics)].join(", ")}
   → Continue nesses tópicos ou avance naturalmente`);
  }

  sections.push(`
═══════════════════════════════════════════════════════════════════════════════
🎯 REGRAS UNIVERSAIS DE VENDAS (TÉCNICAS PROFISSIONAIS)
═══════════════════════════════════════════════════════════════════════════════

1. PERSONALIZAÇÃO (Rapport):
   → Use o nome do cliente naturalmente (gera confiança)
   → Referencie informações que ele já compartilhou
   → Mostre que você LEMBRA da conversa anterior

2. CONSISTÊNCIA:
   → Se prometeu algo, CUMPRA
   → Se explicou algo, não repita do zero
   → Se fez uma pergunta, ESPERE a resposta antes de perguntar outra

3. ESCUTA ATIVA:
   → Responda EXATAMENTE o que foi perguntado
   → Não mude de assunto sem motivo
   → Reconheça objeções antes de contorná-las

4. PROGRESSÃO:
   → Cada mensagem deve AVANÇAR a conversa
   → Não fique em loops repetindo as mesmas informações
   → Tenha um objetivo claro (demo, venda, agendamento)

5. HUMANIZAÇÃO (sem gírias excessivas):
   → Seja profissional mas acolhedor
   → Use emojis com moderação (1-2 por mensagem)
   → Frases curtas e diretas (máx 4-5 linhas por mensagem) - EXCETO quando:
      • O cliente pedir lista/cardápio/categorias/produtos COMPLETOS
      • O prompt instrui enviar lista INTEIRA/COMPLETA
      • Nestes casos: ENVIE A LISTA TODA, SEM CORTAR NADA
   → NÃO use: "cara", "véi", "mano", "brother" - use o NOME do cliente

═══════════════════════════════════════════════════════════════════════════════`);

  return sections.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════
// 🧠 FUNÇÃO PARA GERAR BLOCO DE CONTEXTO DINÂMICO (NOME, HORÁRIO, ETC)
// ═══════════════════════════════════════════════════════════════════════
// FILOSOFIA: Passar APENAS informações para a IA decidir como usar.
// A IA lê o prompt do cliente e decide: se tem {{nome}}, substitui.
// Se tem gíria no prompt, usa gíria. Se tem formalidade, usa formalidade.
// NÃO IMPOR REGRAS - apenas INFORMAR contexto.
// ═══════════════════════════════════════════════════════════════════════
function generateDynamicContextBlock(
  contactName?: string,
  sentMedias?: string[],
  conversationHistory?: Array<{ fromMe?: boolean; text?: string | null; timestamp?: Date | null }>,
  currentMessage?: string | null,
  promptReference?: string | null,
): string {
  // FIX v4: ADICIONADO data/hora do Brasil novamente!
  // Clientes como JB Elétrica precisam saber o horário para verificar
  // se está dentro ou fora do horário de atendimento.
  // A informação é contextual (não afeta determinismo da resposta).
  const brazilTime = getBrazilDateTime();
  const brazilTemporalContext = getBrazilTemporalContext();
  
  const formattedName = sanitizeContactName(contactName);
  
  const sentMediasList = sentMedias && sentMedias.length > 0 
    ? sentMedias.join(", ") 
    : "nenhuma ainda";
  const temporalReferenceText = [
    currentMessage || "",
    promptReference || "",
    ...(conversationHistory || []).slice(-12).map((msg) => msg.text || ""),
  ].filter(Boolean).join("\n").slice(0, 24000);
  
  // 🔄 DETECTAR SE JÁ HOUVE CONVERSA HOJE
  // Se já temos histórico de conversa hoje, a IA NÃO deve cumprimentar novamente
  let alreadyTalkedToday = false;
  let hasFollowUpMessage = false;
  
  if (conversationHistory && conversationHistory.length > 0) {
    const today = brazilTemporalContext.dateKey;
    alreadyTalkedToday = conversationHistory.some(msg => {
      if (!msg.timestamp) return false;
      const msgDate = getBrazilTemporalContext(new Date(msg.timestamp)).dateKey;
      return msgDate === today && msg.fromMe === true; // Nós já enviamos msg hoje
    });
    
    // Detectar se última msg nossa foi follow-up (mensagem de reengajamento)
    const lastOurMessage = conversationHistory.filter(m => m.fromMe).slice(-1)[0];
    if (lastOurMessage?.text) {
      const followUpPatterns = [
        'lembrei de você',
        'passando pra ver',
        'conseguiu pensar',
        'ficou alguma dúvida',
        'como combinamos',
        'retomando'
      ];
      hasFollowUpMessage = followUpPatterns.some(p => 
        lastOurMessage.text?.toLowerCase().includes(p)
      );
    }
  }
  
  // CONTEXTO COM DATA/HORA DO BRASIL - IA interpreta conforme prompt do cliente
  let contextBlock = `
═══════════════════════════════════════════════════════════════════════════════
📋 INFORMAÇÕES DO CONTEXTO ATUAL
═══════════════════════════════════════════════════════════════════════════════

🕐 DATA E HORA ATUAL (BRASIL - Horário de Brasília):
   • Data: ${brazilTime.date}
   • Hora: ${brazilTime.time}
   • Dia da semana: ${brazilTime.dayName}
   ${brazilTime.isWeekend ? '⚠️ HOJE É FIM DE SEMANA (Sábado/Domingo)' : ''}

${buildBrazilTemporalPromptBlock()}

${buildBrazilTemporalToolContractBlock({ referenceText: temporalReferenceText })}

👤 Nome do cliente: ${formattedName || "(não identificado - use 'você' se precisar)"}
📁 Mídias já enviadas nesta conversa: ${sentMediasList}

INSTRUÇÕES IMPORTANTES:
- USE A DATA/HORA ACIMA para verificar horários de funcionamento mencionados no prompt
- Se o prompt menciona horário de atendimento, VERIFIQUE se está dentro ou fora
- Nunca ofereça nem confirme horário que já ficou no passado em relação à hora atual do Brasil
- Se o horário de hoje já tiver passado no contexto do negócio, avance para o próximo horário válido em vez de insistir no mesmo dia
- Se o prompt do negócio diferenciar segunda a sexta, sábado e domingo, respeite isso ao interpretar "hoje", "amanhã", "mais tarde" e dias da semana
- Se seu prompt usa variáveis como {{nome}}, {nome}, [nome], [cliente] etc → substitua por "${formattedName || 'você'}"
- Não repita mídias que já foram enviadas
- SIGA O ESTILO DO SEU PROMPT (gírias, formalidade, etc)`;

  // 🚨 INSTRUÇÕES CRÍTICAS SOBRE CUMPRIMENTOS
  if (alreadyTalkedToday) {
    contextBlock += `

⚠️ ATENÇÃO - CONTINUAÇÃO DE CONVERSA:
- JÁ CONVERSAMOS COM ESTE CLIENTE HOJE!
- NÃO cumprimente novamente (sem "Bom dia", "Oi", "Olá", "Boa tarde")
- NÃO se apresente de novo (sem "Sou X da empresa Y")
- CONTINUE a conversa naturalmente de onde parou
- Responda diretamente ao que o cliente perguntou/disse`;
  }
  
  if (hasFollowUpMessage) {
    contextBlock += `

🔄 RETOMADA APÓS FOLLOW-UP:
- A última mensagem foi um follow-up de reengajamento
- O cliente está VOLTANDO a conversar - seja receptivo!
- NÃO repita o que já foi dito no follow-up
- Avance a conversa para o próximo passo`;
  }

  contextBlock += `
═══════════════════════════════════════════════════════════════════════════════
`;
  
  return contextBlock;
}

// ═══════════════════════════════════════════════════════════════════════
// 🔄 FUNÇÃO PARA LIMPAR PLACEHOLDERS QUE A IA NÃO SUBSTITUIU
// ═══════════════════════════════════════════════════════════════════════
// FILOSOFIA: A IA deve substituir as variáveis. Esta função é apenas
// uma rede de segurança para limpar qualquer {{nome}} ou {nome} que
// escapou. NÃO força saudações - respeita 100% o estilo do prompt.
// ═══════════════════════════════════════════════════════════════════════


// 🔄 FUNÇÃO DE RETRY AUTOMÁTICO PARA CHAMADAS DE API
// Implementa exponential backoff para lidar com rate limits e erros temporários
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000,
  operationName: string = "API call"
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Log de início de cada tentativa
      console.log(`🔄 [AI RETRY] ${operationName} - Tentativa ${attempt}/${maxRetries}...`);
      
      const result = await operation();
      
      // Log de sucesso
      if (attempt > 1) {
        console.log(`✅ [AI RETRY] ${operationName} - SUCESSO na tentativa ${attempt}/${maxRetries}!`);
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      
      // Verificar se é um erro que vale a pena tentar novamente
      // ⚠️ 429 (rate limit) NÃO é retentável aqui - o llm.ts já faz rotação de modelos internamente
      // Retentar 429 no nível externo causa tempestade de retries exponencial
      const isRateLimitError = 
        error?.statusCode === 429 || 
        error?.message?.includes('rate limit') ||
        error?.message?.includes('aguardando fila');
      
      if (isRateLimitError) {
        console.log(`⚡ [AI RETRY] Rate limit detectado - NÃO retentando (llm.ts já fez rotação de modelos)`);
        throw error;
      }
      
      const isRetryable = 
        error?.statusCode === 500 || // Server error
        error?.statusCode === 502 || // Bad gateway
        error?.statusCode === 503 || // Service unavailable
        error?.statusCode === 504 || // Gateway timeout
        error?.code === 'ECONNRESET' ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ENOTFOUND' ||
        error?.message?.includes('timeout') ||
        error?.message?.includes('connection');
      
      if (!isRetryable || attempt === maxRetries) {
        console.error(`❌ [AI RETRY] ${operationName} - ESGOTOU ${maxRetries} tentativas!`);
        console.error(`   └─ Erro final: ${error?.message || error}`);
        console.error(`   └─ Status: ${error?.statusCode || 'N/A'}`);
        console.error(`   └─ Retryable: ${isRetryable ? 'SIM' : 'NÃO'}`);
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s...
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      console.log(`⚠️ [AI RETRY] ${operationName} - FALHOU tentativa ${attempt}/${maxRetries}`);
      console.log(`   └─ Erro: ${error?.message || 'Unknown'}`);
      console.log(`   └─ Status: ${error?.statusCode || 'N/A'}`);
      console.log(`   └─ Próxima tentativa em: ${delay}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error(`${operationName} falhou após ${maxRetries} tentativas`);
}

// 🔔 FUNÇÃO PARA GERAR PROMPT DE NOTIFICAÇÃO DINÂMICO E UNIVERSAL
// Suporta detecção em mensagens do cliente E respostas do agente
function getNotificationPrompt(trigger: string | null | undefined, manualKeywords?: string): string {
  // Proteção contra trigger undefined ou null
  if (!trigger) {
    console.warn('⚠️ [getNotificationPrompt] trigger está undefined/null - retornando string vazia');
    return '';
  }
  const triggerLower = trigger.toLowerCase();
  
  // Combinar palavras-chave predefinidas + manuais
  let keywords: string[] = [];
  let actionDesc = "";
  
  // Palavras-chave baseadas no tipo de gatilho
  if (triggerLower.includes("agendar") || triggerLower.includes("horário") || triggerLower.includes("marcar")) {
    keywords.push("agendar", "agenda", "marcar", "marca", "reservar", "reserva", "tem vaga", "tem horário", "horário disponível", "me encaixa", "encaixe");
    actionDesc = "agendamento";
  } 
  if (triggerLower.includes("reembolso") || triggerLower.includes("devolver") || triggerLower.includes("devolução")) {
    keywords.push("reembolso", "devolver", "devolução", "quero meu dinheiro", "cancelar pedido", "estornar", "estorno");
    actionDesc = actionDesc || "reembolso";
  }
  if (triggerLower.includes("humano") || triggerLower.includes("atendente") || triggerLower.includes("pessoa")) {
    keywords.push("falar com humano", "atendente", "pessoa real", "falar com alguém", "quero um humano", "passa pra alguém");
    actionDesc = actionDesc || "atendente humano";
  }
  if (triggerLower.includes("preço") || triggerLower.includes("valor") || triggerLower.includes("quanto custa")) {
    keywords.push("preço", "valor", "quanto custa", "quanto é", "qual o preço", "tabela de preço");
    actionDesc = actionDesc || "preço";
  }
  if (triggerLower.includes("reclama") || triggerLower.includes("problema") || triggerLower.includes("insatisf")) {
    keywords.push("reclamação", "problema", "insatisfeito", "não funcionou", "com defeito", "quebrou", "errado");
    actionDesc = actionDesc || "reclamação";
  }
  if (triggerLower.includes("comprar") || triggerLower.includes("pedido") || triggerLower.includes("encomendar")) {
    keywords.push("comprar", "quero comprar", "fazer pedido", "encomendar", "pedir", "quero pedir");
    actionDesc = actionDesc || "compra";
  }
  
  // Detectar gatilhos de FINALIZAÇÃO de coleta (universal para qualquer negócio)
  if (triggerLower.includes("finalizar") || triggerLower.includes("encaminhar") || triggerLower.includes("equipe") || triggerLower.includes("informações") || triggerLower.includes("coleta")) {
    keywords.push(
      "encaminhar agora", "vou encaminhar", "já encaminho", "encaminhando",
      "nossa equipe", "equipe analisar", "equipe vai",
      "já recebi", "recebi as fotos", "recebi as informações", "informações completas",
      "vou passar", "já passo", "passando para",
      "aguarde", "fique no aguardo", "retornamos", "entraremos em contato",
      "atendimento vai continuar", "humano vai assumir", "atendente vai"
    );
    actionDesc = actionDesc || "coleta finalizada";
  }
  
  // Se não detectou tipo específico, extrair keywords do trigger + manuais
  if (keywords.length === 0) {
    const extractedKeywords = trigger
      .replace(/me notifique quando o cliente|quiser|quer|pedir|mencionar|falar sobre|ou quando|atendimento automático|finalizar|coleta|informações iniciais/gi, "")
      .trim();
    if (extractedKeywords) {
      keywords.push(...extractedKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0));
    }
    actionDesc = "gatilho personalizado";
  }
  
  // Adicionar palavras-chave manuais se fornecidas
  if (manualKeywords) {
    const manualList = manualKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
    keywords.push(...manualList);
  }
  
  // Remover duplicatas (compatível com ES5)
  const uniqueKeywords = keywords.filter((value, index, self) => self.indexOf(value) === index);
  
  return `
### REGRA DE NOTIFICACAO INTELIGENTE ###

PALAVRAS-GATILHO: ${uniqueKeywords.join(', ')}

## INSTRUÇÃO CRÍTICA ##
Adicione a tag [NOTIFY: ${actionDesc}] quando QUALQUER uma das condições for verdadeira:

1. **MENSAGEM DO CLIENTE** contém uma palavra-gatilho
2. **SUA PRÓPRIA RESPOSTA** indica que a tarefa/coleta foi concluída
3. **VOCÊ VAI ENCAMINHAR** para equipe humana ou outra área
4. **O ATENDIMENTO AUTOMÁTICO** atingiu seu objetivo

## EXEMPLOS DE QUANDO NOTIFICAR ##

### Cliente solicita algo:
- "Quero agendar" -> [NOTIFY: ${actionDesc}]
- "Tem vaga amanhã?" -> [NOTIFY: ${actionDesc}]

### Você (agente) finaliza coleta de informações:
- "Recebi as fotos e o bairro, vou encaminhar para nossa equipe" -> [NOTIFY: ${actionDesc}]
- "Perfeito! Já tenho tudo que preciso, vou passar para o atendimento" -> [NOTIFY: ${actionDesc}]
- "Informações completas! Aguarde que nossa equipe vai analisar" -> [NOTIFY: ${actionDesc}]

### Você vai transferir para humano:
- "Vou encaminhar agora para nossa equipe analisar" -> [NOTIFY: ${actionDesc}]
- "Nossa equipe já vai te retornar" -> [NOTIFY: ${actionDesc}]

## QUANDO NÃO NOTIFICAR ##
- Cliente apenas perguntou algo genérico
- Conversa ainda está em andamento sem gatilho específico
- Você está apenas explicando algo ou respondendo dúvidas

IMPORTANTE: A tag [NOTIFY: ${actionDesc}] deve estar NO FINAL da sua resposta.
`;
}

// Tipo de retorno expandido para incluir ações de mídia
export interface AIResponseResult {
  text: string | null;
  mediaActions?: AgentRuntimeResponse['actions'];
  skipAutoReplyReason?: string;
  skipAutoReplyViolations?: string[];
  attention?: AttentionAssessment;
  routing?: StructuredRoutingDecision;
  notification?: {
    shouldNotify: boolean;
    reason: string;
  };
  appointmentCreated?: any;
  deliveryOrderCreated?: any;
}

type Agendamento3RealtimeGuardIntent = "preview" | "commit";

function normalizeAgendamento3GuardText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function detectAgendamento3RealtimeGuardIntent(responseText: string): Agendamento3RealtimeGuardIntent | null {
  const text = normalizeAgendamento3GuardText(responseText);
  if (!text) return null;
  const hasSchedulingTerm = /\b(agenda|agendamento|horario|disponivel|reuniao|entrevista|atendimento|online|on-line|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(text);
  if (!hasSchedulingTerm) return null;

  const hasConfirmedMeetingText =
    /\bconfirmad[ao]s?\b.{0,100}\b(reuniao|entrevista|atendimento|agenda|agendamento|horario)\b/.test(text) ||
    /\b(reuniao|entrevista|atendimento|agenda|agendamento|horario)\b.{0,100}\bconfirmad[ao]s?\b/.test(text) ||
    /\bdata escolhida\b.{0,180}\bhorario escolhido\b/.test(text);

  if (
    hasConfirmedMeetingText ||
    /\bseu agendamento foi confirmado\b/.test(text) ||
    /\bagendamento (?:esta |foi )?confirmado\b/.test(text) ||
    /\bhorario (?:esta |foi )?confirmado\b/.test(text) ||
    /\bconfirmado para \d{1,2}\/\d{1,2}/.test(text)
  ) {
    return "commit";
  }

  if (
    /\bproximo horario\b/.test(text) ||
    /\bhorario realmente disponivel\b/.test(text) ||
    /\bhorario disponivel\b/.test(text) ||
    /\bfunciona para voce\b/.test(text) ||
    /\bposso confirmar esse agendamento\b/.test(text)
  ) {
    return "preview";
  }

  return null;
}

function buildAgendamento3RealtimeGuardHistory(
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>,
): Array<{ role: "assistant" | "user"; content: string }> {
  return (conversationHistory || [])
    .map((message) => ({
      role: message.fromMe ? "assistant" as const : "user" as const,
      content: String(message.text || "").trim(),
    }))
    .filter((message) => message.content.length > 0);
}

async function validateAgendamento3RealtimeResponse(params: {
  userId: string;
  newMessageText: string;
  responseText: string;
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>;
  contactName?: string | null;
  contactPhone?: string | null;
  conversationId?: string | null;
}): Promise<{ text: string; appointmentCreated?: unknown; intent: Agendamento3RealtimeGuardIntent } | null> {
  const intent = detectAgendamento3RealtimeGuardIntent(params.responseText);
  if (!intent || !params.conversationId || !params.contactPhone || !params.newMessageText.trim()) return null;

  const bridgeMessage = intent === "commit"
    ? [
      "Validar e executar a confirmacao de agendamento que a resposta do agente iria enviar.",
      `Mensagem mais recente do cliente: ${params.newMessageText}`,
      `Resposta do agente a validar: ${params.responseText}`,
    ].join("\n")
    : params.newMessageText;

  const payload = await runAgendamento3DirectTurnBridge({
    userId: params.userId,
    message: bridgeMessage,
    history: buildAgendamento3RealtimeGuardHistory(params.conversationHistory),
    contactName: params.contactName || undefined,
    contactPhone: params.contactPhone,
    conversationId: params.conversationId,
    commit: intent === "commit",
    customerPreview: intent === "preview",
  });

  const directText = String(payload?.response || "").trim();
  if (!directText) return null;

  return {
    text: directText,
    appointmentCreated: (payload?.agendamento3 as any)?.appointment,
    intent,
  };
}

async function buildRoutingDecisionPromptBlock(params: {
  userId: string;
  conversationId?: string;
}): Promise<string> {
  const { userId, conversationId } = params;

  const sectors = await listOwnerSectors(userId);
  if (!sectors.length) {
    return `
═══════════════════════════════════════════════════════════════════════════════
HANDOFF CONTROLADO

Nao ha setores configurados para esta conta.
No bloco <routing_json>, use sempre:
{"mode":"keep_current","targetSectorId":null,"confidence":0,"intent":"no_sectors_configured","reason":"Nenhum setor configurado para handoff."}
═══════════════════════════════════════════════════════════════════════════════
`;
  }

  let currentRoutingSummary = "Sem snapshot de roteamento disponivel para esta conversa.";
  if (conversationId) {
    try {
      const snapshot = await getConversationRoutingSnapshot(userId, conversationId);
      if (snapshot) {
        currentRoutingSummary = JSON.stringify({
          sectorId: snapshot.sector_id || null,
          sectorName: snapshot.sector_name || null,
          assignedToMemberId: snapshot.assigned_to_member_id || null,
          assignedMemberName: snapshot.assigned_member_name || null,
          orchestrationMode: snapshot.orchestration_mode || "ai",
          canChangeSector: snapshot.can_change_sector !== false,
          transferLockReason: snapshot.transfer_lock_reason || null,
          hasManualHumanReplySinceHandoff: snapshot.has_manual_human_reply_since_handoff === true,
        });
      }
    } catch (error) {
      console.warn("[AI Agent] Falha ao carregar snapshot de roteamento para o prompt:", error);
    }
  }

  const sectorCatalog = sectors
    .map((sector, index) =>
      `${index + 1}. ${JSON.stringify({
        id: sector.id,
        name: sector.name,
        description: sector.description || "",
        aiHandoffMode: sector.ai_handoff_mode || "copilot",
        memberCount: sector.member_count || 0,
      })}`,
    )
    .join("\n");

  return `
═══════════════════════════════════════════════════════════════════════════════
HANDOFF CONTROLADO

Sua resposta continua sendo a principal prioridade. Junto dela, decida se esta
mensagem deve permanecer no fluxo atual ou ser encaminhada para UM setor.

Regras:
- Use a conversa inteira, memoria, historico e contexto atual.
- Nao use combinacao literal de palavras; interprete intencao e continuidade.
- So troque de setor quando isso melhorar claramente o atendimento agora.
- Se o snapshot indicar canChangeSector=false, mantenha keep_current.
- Se a conversa ja estiver no setor certo, mantenha keep_current.
- Nunca invente setor. Use apenas um targetSectorId da lista abaixo.
- Se estiver em duvida real, mantenha keep_current.
- Se a resposta ao cliente disser que uma pessoa, atendente, humano ou equipe vai assumir, continuar ou dar continuidade, o <routing_json> deve usar route_to_sector para o setor human_only compativel.
- Nao escreva que a equipe/humano vai continuar e ao mesmo tempo use keep_current. Isso deixa a IA continuar falando depois de prometer handoff.
- Se nao houver setor human_only compativel, nao prometa handoff humano; continue coletando o dado faltante ou explique o proximo passo que a propria IA consegue fazer.

Snapshot atual:
${currentRoutingSummary}

Setores disponiveis:
${sectorCatalog}

Formato obrigatorio do bloco de roteamento:
<routing_json>
{"mode":"keep_current"|"route_to_sector","targetSectorId":"id-ou-null","confidence":0-1,"intent":"string-curta","reason":"motivo operacional curto"}
</routing_json>
═══════════════════════════════════════════════════════════════════════════════
`;
}

async function alignRoutingWithPromisedHumanHandoff(params: {
  userId: string;
  conversationId?: string | null;
  responseText: string | null | undefined;
  currentRouting?: StructuredRoutingDecision | null;
}): Promise<StructuredRoutingDecision | undefined> {
  const { userId, conversationId, responseText, currentRouting } = params;
  if (!conversationId || !responseText) {
    return currentRouting || undefined;
  }

  try {
    const [sectors, snapshot] = await Promise.all([
      listOwnerSectors(userId),
      getConversationRoutingSnapshot(userId, conversationId).catch(() => null),
    ]);

    const override = buildHumanHandoffRoutingOverride({
      responseText,
      currentRouting,
      sectors,
      canChangeSector: snapshot?.can_change_sector !== false,
      currentOrchestrationMode: snapshot?.orchestration_mode || null,
    });

    if (override) {
      console.log(
        `[AI Agent] Handoff humano prometido na resposta; routing_json ajustado para setor ${override.targetSectorId}.`,
      );
      return override;
    }
  } catch (error) {
    console.warn("[AI Agent] Falha ao alinhar handoff humano prometido com routing_json:", error);
  }

  return currentRouting || undefined;
}

function extractFirstJsonObjectCandidate(rawContent: string | null): string | null {
  if (!rawContent) return null;

  const startIndex = rawContent.indexOf("{");
  if (startIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < rawContent.length; index++) {
    const currentChar = rawContent[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (currentChar === "\\") {
        escaping = true;
        continue;
      }

      if (currentChar === "\"") {
        inString = false;
      }

      continue;
    }

    if (currentChar === "\"") {
      inString = true;
      continue;
    }

    if (currentChar === "{") {
      depth += 1;
      continue;
    }

    if (currentChar === "}") {
      depth -= 1;
      if (depth === 0) {
        return rawContent.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function buildAttentionTranscriptSnippet(conversationHistory: Message[]) {
  return conversationHistory
    .slice(-16)
    .map((message) => {
      const speaker = message.fromMe ? (message.isFromAgent ? "IA" : "DONO") : "CLIENTE";
      const body = String(message.text || message.mediaCaption || "(sem texto)").trim().slice(0, 240);
      return `${speaker}: ${body || "(sem texto)"}`;
    })
    .join("\n");
}

export async function classifyConversationAttentionOnly(
  userId: string,
  conversationHistory: Message[],
  latestCustomerMessage: string,
  options?: {
    contactName?: string;
    contactPhone?: string;
  },
): Promise<AttentionAssessment | undefined> {
  return undefined;
}

async function resolveAttentionAssessmentWithFallback(params: {
  parsedAttention?: AttentionAssessment;
  llmClient: any;
  model: string | undefined;
  provider: string;
  conversationHistory: Message[];
  latestCustomerMessage: string;
  assistantResponse: string | null;
}): Promise<AttentionAssessment | undefined> {
  if (params.parsedAttention) {
    return params.parsedAttention;
  }

  if (!params.assistantResponse) {
    return undefined;
  }

  console.warn("⚠️ [Attention Queue] Sem avaliacao estruturada do Codex; sem fallback LLM local.");
  return undefined;
}

// 📝 Converter formatação Markdown para WhatsApp
// WhatsApp usa: *negrito* _itálico_ ~tachado~ ```mono```
function convertMarkdownToWhatsApp(text: string): string {
  let converted = text;
  
  // 0. FIX 2026-05-27: Remove separator lines that leak from system prompt
  // The AI sometimes copies ━━━, ═══, ---, ___  or *** separators into responses
  converted = converted.replace(/^[\s]*[━═─—\-_*]{3,}[\s]*$/gm, '');
  
  // 0b. FIX 2026-02-26: Remove padrões de traços que fazem parecer IA/GPT
  // 1) Linhas com 2+ traços consecutivos (ex: "--", "---", "-----")
  converted = converted.replace(/\-{2,}/g, '');
  // 2) Traços usados como bullet points no início de linhas: "- item" → "• item"
  converted = converted.replace(/^[\s]*-\s+/gm, '• ');
  // 3) Em-dashes (—) usados como separadores em frases: " — " → ", "
  converted = converted.replace(/\s*—\s*/g, ', ');
  // 4) En-dashes (–) usados como separadores: " – " → ", "
  converted = converted.replace(/\s*–\s*/g, ', ');
  // 5) Traço isolado usado como separador entre conceitos: " - " → ", "
  // CUIDADO: Não remover traços em palavras compostas (segunda-feira) ou negativos (-5)
  converted = converted.replace(/(?<=[a-záéíóúàâêôãõ\s])\s+-\s+(?=[a-záéíóúàâêôãõA-Z])/g, ', ');
  
  // Clean up resulting multiple blank lines
  converted = converted.replace(/\n{3,}/g, '\n\n');
  // Clean up multiple commas
  converted = converted.replace(/,\s*,/g, ',');
  // Clean up leading comma at start of line
  converted = converted.replace(/^\s*,\s*/gm, '');
  
  // 1. Negrito: **texto** → *texto*
  // Regex: Match **...** mas não pegar ***... (que seria bold+italic)
  converted = converted.replace(/\*\*(?!\*)(.+?)\*\*(?!\*)/g, '*$1*');
  
  // 2. Tachado: ~~texto~~ → ~texto~
  converted = converted.replace(/~~(.+?)~~/g, '~$1~');
  
  // 3. Mono (code inline): `texto` → ```texto``` (WhatsApp prefere triplo)
  // Mas preservar blocos de código que já são ```...```
  converted = converted.replace(/(?<!`)\`(?!``)(.+?)\`(?!`)/g, '```$1```');
  
  return converted.trim();
}

// Opções extras para contexto dinâmico
export interface AIResponseOptions {
  contactName?: string;  // Nome do cliente (pushName do WhatsApp)
  contactPhone?: string; // Telefone do cliente (para agendamento)
  sentMedias?: string[]; // Lista de mídias já enviadas nesta conversa
  conversationId?: string; // ID da conversa (para vincular pedidos de delivery)
  isCTWAFallback?: boolean;
  pendingFirstMessageRecovery?: PendingFirstMessageRecoveryContext;
}

// ═══════════════════════════════════════════════════════════════════════
// 🧹 FUNÇÃO PARA LIMPAR VAZAMENTOS DE INSTRUÇÕES NA RESPOSTA DA IA
// Remove instruções técnicas que a IA às vezes copia do prompt para a resposta
// Ex: "Use exatamente o texto abaixo..." não deve aparecer na mensagem ao cliente
// ═══════════════════════════════════════════════════════════════════════
function stripInternalInstructionBlocksFromResponse(responseText: string): string {
  let cleanedText = String(responseText || '').replace(/\r\n/g, '\n');
  if (!cleanedText.trim()) return '';

  const assistantResponseMatch = cleanedText.match(/<assistant_response>\s*([\s\S]*?)\s*<\/assistant_response>/i);
  if (assistantResponseMatch && /<\/?(?:assistant_response|attention_json|actions_json|routing_json)>/i.test(cleanedText)) {
    cleanedText = assistantResponseMatch[1];
  }

  cleanedText = cleanedText
    .replace(/<attention_json>[\s\S]*?<\/attention_json>/gi, '')
    .replace(/<actions_json>[\s\S]*?<\/actions_json>/gi, '')
    .replace(/<routing_json>[\s\S]*?<\/routing_json>/gi, '')
    .replace(/<augmented_response>[\s\S]*?<\/augmented_response>/gi, '');

  const internalSectionMarkers = [
    /(?:^|\n)\s*=+\s*REGRA UNIVERSAL PARA LINKS NO WHATSAPP\s*=+[\s\S]*?(?=(?:^|\n)\s*=+\s*REGRA UNIVERSAL DE FORMATO WHATSAPP\s*=+|$)/i,
    /(?:^|\n)\s*=+\s*REGRA UNIVERSAL DE FORMATO WHATSAPP\s*=+[\s\S]*$/i,
  ];

  for (const marker of internalSectionMarkers) {
    cleanedText = cleanedText.replace(marker, '\n');
  }

  const internalCodeMarker = cleanedText.search(
    /(?:^|\n)\s*(?:[-*_]{3,}\s*)?(?:\*{0,2}\s*)?(?:codigo|c[oó]digo)\s+de\s+resposta\b|(?:^|\n)\s*(?:[-*_]{3,}\s*)?(?:\*{0,2}\s*)?resposta\s+com\s+tags\b|(?:^|\n)\s*(?:[-*_]{3,}\s*)?(?:\*{0,2}\s*)?resposta\s+esperada\s+(?:do\s+)?cliente\b/i,
  );
  if (internalCodeMarker > 0) {
    cleanedText = cleanedText.slice(0, internalCodeMarker);
  } else if (internalCodeMarker === 0) {
    cleanedText = cleanedText.replace(/^(?:[-*_]{3,}\s*)?(?:\*{0,2}\s*)?(?:codigo|c[oó]digo)\s+de\s+resposta[\s\S]*$/i, '');
  }

  return cleanedText
    .replace(/(?:^|\n)\s*\*{0,2}\s*aqui\s+vai\s+a\s+resposta\s*\*{0,2}\s*:?\s*/giu, '\n')
    .replace(/(?:^|\n)\s*\*{0,2}\s*aqui\s+vai\s+o\s+json\s+d[ae]\s+aten[cç][aã]o\s*\*{0,2}[\s\S]*$/iu, '')
    .replace(/^\s*\*{0,2}\s*resposta\s+final\s*\*{0,2}\s*:?\s*/i, '')
    .replace(/<\/?(?:assistant_response|attention_json|actions_json|routing_json|augmented_response)>/gi, '')
    .replace(/(?:^|\n)\s*---\s*$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanInstructionLeaks(responseText: string): string {
  const originalText = responseText;
  let cleanedText = stripInternalInstructionBlocksFromResponse(responseText);
  
  // Padrões de instruções técnicas que vazam na resposta
  const instructionPatterns = [
    // "Use exatamente o texto abaixo..." e variações
    /^\s*\*?\*?\s*use\s+\*?exatamente\*?\s+o\s+texto\s+abaixo[^"]*?:\s*/i,
    /^\s*use\s+o\s+(?:modelo|texto)\s+abaixo[^"]*?:\s*/i,
    // "Envie apenas o texto:" e variações
    /envie\s+\*?\*?apenas\*?\*?\s*o\s+texto:?\s*/i,
    // "sem exibir instruções ou notas técnicas"
    /,?\s*sem\s+exibir\s+instru[cç][oõ]es\s+ou\s+notas\s+t[eé]cnicas[^"]*?[:.]?\s*/i,
    // "(ex: "Use exatamente...")"
    /\s*\(ex:?\s*[""][^""]+[""]\.?\)\s*\.?\s*/gi,
    // "mantendo o tom natural e direto:"
    /,?\s*mantendo\s+o\s+tom\s+natural\s+(?:e\s+)?direto:?\s*/i,
    // "sem alterar nome, estrutura ou tom:"
    /,?\s*sem\s+alterar\s+nome,?\s+estrutura\s+ou\s+tom:?\s*/i,
    // Remover asteriscos soltos no início
    /^\s*\*+\s*/,
  ];
  
  // Aplicar cada padrão de limpeza
  for (const pattern of instructionPatterns) {
    cleanedText = cleanedText.replace(pattern, '');
  }
  
  // Se a resposta começa com aspas duplas, provavelmente é o texto entre aspas que queremos
  // Extrair o conteúdo entre as primeiras aspas
  const quotedTextMatch = cleanedText.match(/^[""]([^""]+)[""]$/);
  if (quotedTextMatch) {
    cleanedText = quotedTextMatch[1];
  }
  
  // Se ainda tem aspas no início (sem fechar), remover
  cleanedText = cleanedText.replace(/^[""]/, '').replace(/[""]$/, '');
  
  // Limpar espaços extras
  cleanedText = cleanedText.trim();
  
  // Se limpamos algo significativo, logar
  if (cleanedText !== originalText) {
    console.log(`🧹 [AI Agent] Limpeza de instruções vazadas:`);
    console.log(`   Original (${originalText.length} chars): "${originalText.substring(0, 100)}..."`);
    console.log(`   Limpo (${cleanedText.length} chars): "${cleanedText.substring(0, 100)}..."`);
  }
  
  return cleanedText;
}

// ═══════════════════════════════════════════════════════════════════════
// 🎯 FUNÇÃO PARA DETECTAR PEDIDOS DE FORMATAÇÃO LINHA POR LINHA NO CHAT
// Detecta quando o cliente pede que a resposta seja formatada com quebras de linha
// Exemplos: "cada frase em uma linha", "linha por linha", "separado por linha"
// ═══════════════════════════════════════════════════════════════════════
interface FormattingRequest {
  detected: boolean;
  type: 'line-by-line' | 'compact' | null;
  matchedPhrase: string | null;
}

function detectFormattingRequest(conversationHistory: Array<{text?: string | null, fromMe?: boolean}>, newMessageText: string): FormattingRequest {
  // Juntar todas as mensagens do cliente (não as do agente)
  const clientMessages = conversationHistory
    .filter(m => !m.fromMe)
    .map(m => m.text || '')
    .concat([newMessageText || ''])
    .join(' ')
    .toLowerCase();
  
  // Padrões que indicam pedido de formatação LINHA POR LINHA
  const lineByLinePatterns = [
    // Padrões mais genéricos (colocados primeiro para máxima captura)
    /cada\s+um\s+(?:em\s+)?(?:uma\s+)?linha/i,                        // "cada um em uma linha"
    /um\s+(?:em\s+)?cada\s+linha/i,                                    // "um em cada linha"  
    /em\s+(?:uma\s+)?linha\s+(?:separada|diferente|própria)/i,        // "em uma linha separada"
    /(?:cada|um)\s+(?:em\s+)?(?:sua\s+)?(?:própria\s+)?linha/i,       // "cada em sua própria linha"
    // Padrões específicos
    /cada\s+(?:frase|item|bene?f[íi]cio|coisa)\s+(?:em\s+)?(?:uma\s+)?linha/i,
    /linha\s+por\s+linha/i,
    /separad[oa]\s+por\s+linha/i,
    /uma\s+(?:frase|coisa|item)\s+(?:por|em\s+cada)\s+linha/i,
    /em\s+linhas\s+separadas/i,
    /cada\s+linha\s+(?:separada|individual)/i,
    /formata(?:r|do|ção)?\s+(?:com\s+)?(?:quebras?\s+de\s+)?linha/i,
    /(?:pode|quero|gostaria)\s+(?:que\s+)?(?:cada|as)\s+(?:frase|linha)/i,
    /(?:envia|manda)\s+(?:cada|em)\s+linha/i,
    /um\s+(?:item|bene?f[íi]cio)\s+por\s+(?:mensagem|linha)/i,
    /quebra(?:s)?\s+de\s+linha/i,
    /coloca(?:r)?\s+(?:cada\s+)?(?:um|uma)\s+(?:em\s+)?(?:cada\s+)?linha/i,
    /linha\s+separada/i,
  ];
  
  // Padrões que indicam pedido de formatação COMPACTA (tudo junto)
  const compactPatterns = [
    /tudo\s+junto/i,
    /sem\s+quebra/i,
    /texto\s+corrido/i,
    /parágrafo\s+único/i,
    /não\s+precisa\s+(?:de\s+)?linha/i,
  ];
  
  // Verificar padrões de linha por linha
  for (const pattern of lineByLinePatterns) {
    const match = clientMessages.match(pattern);
    if (match) {
      console.log(`🎯 [AI Agent] PEDIDO DE FORMATAÇÃO DETECTADO: linha-por-linha`);
      console.log(`   Frase detectada: "${match[0]}"`);
      return { detected: true, type: 'line-by-line', matchedPhrase: match[0] };
    }
  }
  
  // Verificar padrões de compacto
  for (const pattern of compactPatterns) {
    const match = clientMessages.match(pattern);
    if (match) {
      console.log(`🎯 [AI Agent] PEDIDO DE FORMATAÇÃO DETECTADO: compacto`);
      console.log(`   Frase detectada: "${match[0]}"`);
      return { detected: true, type: 'compact', matchedPhrase: match[0] };
    }
  }
  
  return { detected: false, type: null, matchedPhrase: null };
}

// Gerar instrução de formatação para injetar no prompt
function generateFormattingInstruction(formattingRequest: FormattingRequest): string {
  if (!formattingRequest.detected) return '';
  
  if (formattingRequest.type === 'line-by-line') {
    return `
═══════════════════════════════════════════════════════════════════════════════
🎯 INSTRUÇÃO CRÍTICA DE FORMATAÇÃO (O CLIENTE PEDIU EXPLICITAMENTE!)
═══════════════════════════════════════════════════════════════════════════════

O cliente PEDIU para você formatar com CADA FRASE EM UMA LINHA SEPARADA.
Frase detectada: "${formattingRequest.matchedPhrase}"

OBRIGATÓRIO:
- Coloque CADA item, benefício ou informação em SUA PRÓPRIA LINHA
- Use quebra de linha entre cada item
- NÃO coloque múltiplos itens na mesma linha
- Emojis devem aparecer NO INÍCIO de cada linha

EXEMPLO CORRETO:
🎹 Produza mais rápido
🎹 +1000 livrarias de piano
🇧🇷 Timbres brasileiros
🔥 Acesso vitalício

EXEMPLO ERRADO (NÃO FAÇA ISSO):
🎹 Produza mais rápido 🎹 +1000 livrarias 🇧🇷 Timbres brasileiros 🔥 Acesso vitalício

SIGA A PREFERÊNCIA DO CLIENTE!
═══════════════════════════════════════════════════════════════════════════════
`;
  }
  
  if (formattingRequest.type === 'compact') {
    return `
═══════════════════════════════════════════════════════════════════════════════
🎯 INSTRUÇÃO DE FORMATAÇÃO (O CLIENTE PEDIU TEXTO COMPACTO)
═══════════════════════════════════════════════════════════════════════════════

O cliente PEDIU para você enviar texto mais compacto, sem quebras de linha excessivas.
Frase detectada: "${formattingRequest.matchedPhrase}"

OBRIGATÓRIO:
- Mantenha o texto em formato de parágrafo corrido
- Evite quebras de linha entre itens
- Use vírgulas ou pontos para separar itens

SIGA A PREFERÊNCIA DO CLIENTE!
═══════════════════════════════════════════════════════════════════════════════
`;
  }
  
  return '';
}

export async function generateAIResponse(
  userId: string,
  conversationHistory: Message[],
  newMessageText: string,
  options?: AIResponseOptions,
  testDependencies?: {
    getBusinessAgentConfig?: (id: string) => Promise<any>,
    getAgentConfig?: (id: string) => Promise<any>,
    getAgentMediaLibrary?: (id: string) => Promise<any>
  }
): Promise<AIResponseResult | null> {
  return runWithLLMUserContext(userId, async () => {
    const isSuspended = await checkUserSuspension(userId);
    if (isSuspended) return null;

    const contactName = options?.contactName || null;
    const contactPhone = options?.contactPhone || "";
    const conversationId = options?.conversationId || `real-${userId}-${Math.floor(Date.now() / 60000)}`;

    const guard = await evaluateInboundAutomationGuard({
      userId,
      connectionId: options?.conversationId || conversationId,
      conversationId,
      contactNumber: contactPhone,
      contactName,
      inboundText: newMessageText,
      conversationHistory,
    });
    if (guard.shouldBlock) return null;

    if (contactPhone && await storage.isNumberExcluded(userId, contactPhone)) {
      return null;
    }

    const [businessConfig, agentConfig, mediaLibrary, ownerEmail] = await Promise.all([
      testDependencies?.getBusinessAgentConfig
        ? testDependencies.getBusinessAgentConfig(userId)
        : storage.getBusinessAgentConfig?.(userId),
      testDependencies?.getAgentConfig
        ? testDependencies.getAgentConfig(userId)
        : storage.getAgentConfig(userId),
      testDependencies?.getAgentMediaLibrary
        ? testDependencies.getAgentMediaLibrary(userId)
        : getAgentMediaLibrary(userId),
      resolveAiAgentOwnerEmail(userId),
    ]);

    if (!agentConfig || agentConfig.isActive !== true) {
      return null;
    }

    const sentMedias = options?.sentMedias || [];
    const messages: ChatMessage[] = [
      ...conversationHistory
        .map((message) => {
          const content = String(message.text || message.mediaCaption || "").trim();
          if (!content) return null;
          return {
            role: message.fromMe ? "assistant" as const : "user" as const,
            content,
          };
        })
        .filter(Boolean) as ChatMessage[],
      { role: "user", content: newMessageText },
    ];

    const [tenantOperationalContext, delivery2CodexContext, productsData, subscriptionPlanContext] = await Promise.all([
      loadAiAgentTenantOperationalContext({ userId, conversationId }),
      buildDelivery2CodexContext({ userId, mediaLibrary, sentMedias }).catch((error: any) => ({
        loadError: String(error?.message || error || "delivery2_context_error"),
      })),
      getProductsForAI(userId).catch((error: any) => ({
        active: false,
        loadError: String(error?.message || error || "products_context_error"),
      })),
      loadAiAgentSubscriptionPlanContext(userId),
    ]);

    const tenantContextArtifact = buildAiAgentTenantContextArtifact({
      userId,
      ownerEmail,
      conversationId,
      agentConfig,
      businessConfig,
      contactName,
      contactPhone,
      operationalContext: tenantOperationalContext,
    });
    const agentMediaContextArtifacts = buildAiAgentMediaContextArtifacts(mediaLibrary);

    const codexResult = await runAiAgentCodexPrimaryTurn({
      userId,
      ownerEmail,
      conversationId,
      contactPhone,
      messages,
      currentMessage: newMessageText,
      contextArtifacts: {
        channel: options?.channel || "whatsapp",
        ownerEmail,
        agentConfig,
        businessConfig,
        contactName,
        contactPhone,
        sentMedias,
        conversationId,
        options: {
          hasConversationId: Boolean(options?.conversationId),
          pendingFirstMessageRecovery: Boolean(options?.pendingFirstMessageRecovery),
        },
        tenantContext: tenantContextArtifact,
        subscriptionPlanContext,
        delivery2: delivery2CodexContext,
        agentMediaContract: [
          "Midias abaixo sao capacidade/contexto cadastrados pelo tenant.",
          "Campos como whenToUse, caption, transcription, suppressTextResponse e flowItems sao evidencia para o Codex entender o tenant; nao sao seletor deterministico nem autorizam ferramenta local a escolher fluxo ou resposta publica.",
          "Para enviar uma midia, o Codex deve devolver action send_media com mediaName correspondente; o executor apenas valida e envia.",
          "Nao prometa envio de foto, video, audio, PDF ou fluxo sem action estruturada correspondente.",
        ].join(" "),
        mediaLibrary: agentMediaContextArtifacts,
        agentMedia: agentMediaContextArtifacts,
        productCatalog: sanitizeAiAgentLiveCliTenantContextValue(productsData || null),
        conversationHistoryRaw: sanitizeAiAgentLiveCliTenantContextValue(conversationHistory),
      },
    });

    if (!codexResult || (!codexResult.text && codexResult.mediaActions.length === 0)) {
      return {
        text: null,
        mediaActions: codexResult?.mediaActions || [],
        skipAutoReplyReason: codexResult?.skipAutoReplyReason || "codex_no_send",
        skipAutoReplyViolations: codexResult?.violations || [],
        notification: undefined,
        appointmentCreated: undefined,
        deliveryOrderCreated: undefined,
      };
    }

    return {
      text: codexResult.text,
      mediaActions: codexResult.mediaActions,
      notification: undefined,
      appointmentCreated: undefined,
      deliveryOrderCreated: undefined,
    };
  });
}
async function runSimulatorOperationalInsights(params: {
  userId: string;
  simulatorContactPhone: string;
  contactName: string;
  history: Message[];
  customerMessage: string;
  agentReply?: string | null;
}): Promise<string | null> {
  try {
    const conversationId = await persistSimulatorConversationForInsights(params);
    if (!conversationId) return null;

    const latestAgentReply = params.agentReply || "[fluxo de abertura]";

    void queueConversationCourseSchedulingInsight({
      conversationId,
      latestAgentReply,
    });
    void queueConversationAgendamento2Insight({
      conversationId,
      latestAgentReply,
    });
    void queueConversationAgendamento3Extraction({
      conversationId,
      latestAgentReply,
      forceFresh: true,
    });

    await queueConversationEstampariaRequest({
      conversationId,
      latestAgentReply,
      forceFresh: true,
    });

    return conversationId;
  } catch (error) {
    console.warn("🧪 [SIMULADOR] Falha ao rodar insights operacionais:", error);
    return null;
  }
}

function hasSimulatorTriggerMatch(params: {
  triggerPhrases?: string[] | null;
  messageText: string;
  conversationHistory: Message[];
}): { matched: boolean; foundIn: "last" | "history" | "no-filter" | "none"; phrase?: string } {
  return evaluateAgentTriggerMatch({
    triggerPhrases: params.triggerPhrases,
    currentMessages: params.messageText,
    conversationHistory: params.conversationHistory,
  });
}

function normalizePromptFormatText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function enforcePromptCriticalRentalPaymentRule(params: {
  text: string;
  prompt: unknown;
  message: unknown;
}): string {
  const normalizedPrompt = normalizePromptFormatText(params.prompt);
  if (
    !normalizedPrompt.includes("regra critica de pagamento") ||
    !normalizedPrompt.includes("locacao e somente a vista") ||
    !normalizedPrompt.includes("6x") ||
    !normalizedPrompt.includes("somente para venda")
  ) {
    return params.text;
  }

  const normalizedMessage = normalizePromptFormatText(params.message);
  const isRentalPaymentQuestion =
    /\b(locacao|aluguel|alugar|diaria|locar)\b/.test(normalizedMessage) &&
    /\b(cartao|credito|parcel|divid|6x|forma de pagamento|pagamento)\b/.test(normalizedMessage);

  if (!isRentalPaymentQuestion) {
    return params.text;
  }

  const asksPriceOrSize =
    /\b(valor|preco|orcamento|quanto|custa|10x10|10 x 10|5x5|5 x 5)\b/.test(normalizedMessage);

  const paymentLines = [
    "Pagamento da locacao: somente a vista.",
    "Parcelamento no cartao em ate 6x e somente para venda.",
  ];

  if (!asksPriceOrSize) {
    return paymentLines.join("\n");
  }

  return [
    "Locacao: 10x10m R$ 1.400,00 e 5x5m R$ 750,00 (diaria/final de semana).",
    ...paymentLines,
  ].join("\n");
}

function extractExactGroupListBlockFromPrompt(prompt: unknown): string | null {
  const source = String(prompt || "").replace(/\r\n/g, "\n");
  const start = source.search(/grupos,\s*modelos\s*e\s*valores/i);
  if (start < 0) return null;

  const rest = source.slice(start);
  const endCandidates = [
    rest.search(/\n\s*REQUISITOS\b/i),
    rest.search(/\n\s*FECHAMENTO\b/i),
  ].filter((index) => index > 0);
  const end = endCandidates.length ? Math.min(...endCandidates) : rest.length;
  const block = rest.slice(0, end).trim();

  if (!block.includes("[BOLHA]")) return null;
  if (!/^\s*1\.\s*Grupo\b/im.test(block)) return null;
  if (!/^\s*4\.\s*Grupo\b/im.test(block)) return null;
  if (!/Valor\s+di[áa]ria/i.test(block)) return null;

  return block;
}

function enforceExactGroupListBubbles(params: {
  text: string;
  prompt: unknown;
  message: unknown;
}): string {
  const exactBlock = extractExactGroupListBlockFromPrompt(params.prompt);
  if (!exactBlock) return params.text;

  const normalizedText = normalizePromptFormatText(params.text);
  const normalizedMessage = normalizePromptFormatText(params.message);
  const looksLikeGroupList =
    normalizedText.includes("grupo a") &&
    normalizedText.includes("grupo h") &&
    /\bvalor\s+diari[ao]\b/.test(normalizedText);
  const looksLikeDirectOptionSelection = /^\s*(?:[1-6]|[a-h])\s*$/i.test(String(params.message || "").trim());
  const requestedGroupList =
    looksLikeDirectOptionSelection ||
    /\b(grupo|grupos|valor|valores|orcamento|opcao\s*1|opcao|opcoes|reserva)\b/.test(normalizedMessage);

  if (!looksLikeGroupList || !requestedGroupList) {
    return params.text;
  }

  return exactBlock;
}

function normalizeWaldyrRuntimeRealEstateText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

type WaldyrRuntimeProject = {
  id: string;
  name: string;
  aliases: string[];
  location?: string;
  materialMode: "brisas" | "main_link" | "team_confirm";
};

const WALDYR_RUNTIME_PROJECTS: WaldyrRuntimeProject[] = [
  {
    id: "brisas",
    name: "Brisas da Lagoa",
    aliases: ["brisas da lagoa", "brisas", "lagoa"],
    location: "Araruama RJ",
    materialMode: "brisas",
  },
  {
    id: "seleto_amoreiras",
    name: "Seleto Amoreiras",
    aliases: ["seleto amoreiras", "seleto", "amoreiras"],
    materialMode: "team_confirm",
  },
  {
    id: "orla_recreio",
    name: "Orla Recreio/Pontal",
    aliases: ["orla recreio", "orla pontal", "orla reserva", "orla prainha", "orla", "pontal", "prainha", "reserva", "recreio", "cury"],
    materialMode: "main_link",
  },
  {
    id: "marine_barra",
    name: "Marine Barra Residence",
    aliases: ["marine barra", "marine barra residence", "barra olimpica"],
    materialMode: "main_link",
  },
  {
    id: "origem_sao_cristovao",
    name: "Origem Sao Cristovao",
    aliases: ["origem sao cristovao", "origem", "sao cristovao"],
    materialMode: "main_link",
  },
  {
    id: "lunar_residence",
    name: "Lunar Residence",
    aliases: ["lunar residence", "lunar"],
    materialMode: "main_link",
  },
  {
    id: "like_jardim_oriente",
    name: "Like Jardim Oriente",
    aliases: ["like jardim oriente", "like"],
    materialMode: "main_link",
  },
  {
    id: "up_life_residence",
    name: "Up Life Residence",
    aliases: ["up life residence", "up life"],
    materialMode: "main_link",
  },
  {
    id: "speciale_vila_ema",
    name: "Speciale Vila Ema",
    aliases: ["speciale vila ema", "speciale"],
    materialMode: "main_link",
  },
  {
    id: "reserva_dos_manacas",
    name: "Reserva dos Manacas",
    aliases: ["reserva dos manacas", "manacas"],
    materialMode: "main_link",
  },
  {
    id: "sao_jose_campos",
    name: "Sao Jose dos Campos",
    aliases: ["sao jose dos campos", "sjc"],
    materialMode: "main_link",
  },
];

const WALDYR_RUNTIME_CONFIGURED_PROJECT_STOPWORDS = new Set([
  "barra",
  "barra da tijuca",
  "capital rj",
  "centro do rj ou de sp",
  "apresentacao",
  "apresentacoes",
  "fotos e videos",
  "mais fotos e videos",
  "fotos adicionais",
  "link principal",
  "link principal de materiais",
  "qual opcao voce prefere",
  "informacao",
  "informacoes",
  "quero informacao",
  "quero informacoes",
  "ola quero informacoes",
  "nova iguacu",
  "nova iguacu",
  "rio de janeiro",
  "regiao dos lagos",
  "sao jose dos campos",
  "sao jose campos",
  "sao paulo",
  "sjc",
  "zona",
  "norte",
  "sul",
  "baixada",
  "sudoeste",
  "oeste",
]);

function isWaldyrRuntimeConfiguredProjectPhrase(value: unknown): boolean {
  const normalized = normalizeWaldyrRuntimeRealEstateText(value);
  if (normalized.length < 3) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (WALDYR_RUNTIME_CONFIGURED_PROJECT_STOPWORDS.has(normalized)) return false;
  if (
    /^(oi|ola|bom dia|boa tarde|boa noite|tudo bem|foto|fotos|video|videos|fotos e videos|mais fotos e videos|fotos adicionais|imagem|imagens|material|materiais|apresentacao|apresentacoes|midia|midias|book|link|links|link principal|link principal de materiais|agenda|agendar visita|visita|visitar|horario|financiamento|simulacao|simular|caixa economica federal|fab|marinha|exercito|cefiae|poupex|imovel|imoveis|imovel pronto|imovel pronto ou na planta|pronto|prontos|usado|usados|na planta|opcao a|opcao b|opcao c|qual opcao voce prefere)$/.test(normalized)
  ) {
    return false;
  }
  return true;
}

function formatWaldyrRuntimeConfiguredProjectName(value: unknown): string {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:|/\\-]+|[\s,.;:|/\\-]+$/g, "")
    .trim();
  const normalized = normalizeWaldyrRuntimeRealEstateText(text);
  if (text && (text === text.toLowerCase() || text === text.toUpperCase())) {
    return normalized
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return text || "empreendimento cadastrado";
}

function buildWaldyrRuntimeConfiguredProjects(triggerPhrases: unknown): WaldyrRuntimeProject[] {
  if (!Array.isArray(triggerPhrases)) return [];
  const projects: WaldyrRuntimeProject[] = [];
  const seen = new Set<string>();

  for (const phrase of triggerPhrases) {
    const parts = String(phrase || "")
      .split(/[,.;|/\n]+/g)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts) {
      if (!isWaldyrRuntimeConfiguredProjectPhrase(part)) continue;
      const name = formatWaldyrRuntimeConfiguredProjectName(part);
      const alias = normalizeWaldyrRuntimeRealEstateText(name);
      if (!alias || seen.has(alias)) continue;
      seen.add(alias);
      projects.push({
        id: `configured_${alias.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64)}`,
        name,
        aliases: [alias],
        materialMode: "main_link",
      });
      if (projects.length >= 120) return projects;
    }
  }

  return projects;
}

type WaldyrRuntimeProjectMatch = {
  project: WaldyrRuntimeProject;
  aliasLength: number;
  regionOnly: boolean;
  configuredProject: boolean;
  order: number;
};

function isWaldyrRuntimeRegionProject(project: WaldyrRuntimeProject): boolean {
  return project.id === "sao_jose_campos";
}

function findWaldyrRuntimeMatchedAlias(source: string, aliases: string[]): string | null {
  let bestAlias: string | null = null;
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`\\b${escaped}\\b`).test(source)) continue;
    if (!bestAlias || alias.length > bestAlias.length) {
      bestAlias = alias;
    }
  }
  return bestAlias;
}

function sortWaldyrRuntimeProjectMatches(
  a: WaldyrRuntimeProjectMatch,
  b: WaldyrRuntimeProjectMatch,
): number {
  if (a.regionOnly !== b.regionOnly) return a.regionOnly ? 1 : -1;
  if (a.configuredProject !== b.configuredProject) return a.configuredProject ? 1 : -1;
  if (a.aliasLength !== b.aliasLength) return b.aliasLength - a.aliasLength;
  return a.order - b.order;
}

function resolveWaldyrRuntimeProject(
  promptText: string,
  messageText: string,
  turnContext: string | string[],
  triggerPhrases?: unknown,
  options: { allowTurnContextFallback?: boolean } = {},
): WaldyrRuntimeProject | null {
  const sources = [messageText];
  const turnContextSources = Array.isArray(turnContext) ? turnContext : [turnContext];
  if (options.allowTurnContextFallback !== false) {
    for (const contextSource of turnContextSources) {
      if (contextSource && contextSource !== messageText) {
        sources.push(contextSource);
      }
    }
  }
  const projects = [
    ...WALDYR_RUNTIME_PROJECTS,
    ...buildWaldyrRuntimeConfiguredProjects(triggerPhrases),
  ];
  for (const source of sources) {
    const matches: WaldyrRuntimeProjectMatch[] = [];
    projects.forEach((project, order) => {
      const promptHasProject = project.aliases.some((alias) => promptText.includes(alias));
      const configuredProject = project.id.startsWith("configured_");
      if (!configuredProject && !promptHasProject) return;
      const matchedAlias = findWaldyrRuntimeMatchedAlias(source, project.aliases);
      if (!matchedAlias) return;
      matches.push({
        project,
        aliasLength: matchedAlias.length,
        regionOnly: isWaldyrRuntimeRegionProject(project),
        configuredProject,
        order,
      });
    });
    if (matches.length > 0) {
      matches.sort(sortWaldyrRuntimeProjectMatches);
      return matches[0].project;
    }
  }
  return null;
}

function hasExplicitWaldyrRuntimeCurrentProjectSignal(messageText: string): boolean {
  return (
    /\b(empreendimento|apartamento|imovel|imoveis|residencial|residence|condominio|condominios)\b/.test(messageText) &&
    /\b(informacao|informacoes|apresentacao|foto|fotos|video|videos|material|materiais|sobre|quero|tem|possui|procuro)\b/.test(messageText)
  );
}

function buildWaldyrRuntimeBrisasMaterialText(): string {
  return [
    "*Central de Atendimento:*",
    "Seguem os materiais do *Brisas da Lagoa*, em Araruama RJ:",
    "",
    "Apresentacao:",
    "https://drive.google.com/file/d/1yGSXawP8JxauwxsoQEmoxx8UaBPbGFHy/view?usp=drive_link",
    "",
    "Fotos e videos:",
    "https://drive.google.com/drive/folders/1PiuPClz51K37Y4AVO7PLw_J60aukiDTs?usp=drive_link",
    "",
    "Fotos adicionais:",
    "https://drive.google.com/drive/folders/1_s0mASLLr_o0MIRJyub5pdZkt4RvHeI7?usp=drive_link",
    "",
    "Se quiser, tambem posso deixar sua simulacao ou visita como solicitacao para a equipe confirmar.",
  ].join("\n");
}

function buildWaldyrRuntimeProjectOpeningText(project: WaldyrRuntimeProject): string {
  const place = project.location ? ` fica em ${project.location}` : " esta nos materiais cadastrados";
  return [
    "*Central de Atendimento:*",
    `Claro. O *${project.name}*${place}.`,
    "",
    "Posso te ajudar agora com:",
    "A) Fotos, videos ou apresentacao",
    "B) Simulacao de financiamento",
    "C) Agendar visita",
    "",
    "Qual opcao voce prefere?",
  ].join("\n");
}

function buildWaldyrRuntimeProjectMaterialText(project: WaldyrRuntimeProject): string {
  if (project.materialMode === "brisas") {
    return buildWaldyrRuntimeBrisasMaterialText();
  }
  if (project.materialMode === "main_link") {
    return [
      "*Central de Atendimento:*",
      `Encontrei o *${project.name}* nos materiais cadastrados da WAL.`,
      "",
      "Link principal de materiais:",
      "https://linktr.ee/pagina.principal.wal",
      "",
      "A equipe confirma o material especifico desse empreendimento. Se quiser, tambem posso deixar sua simulacao ou visita como solicitacao para a equipe confirmar.",
    ].join("\n");
  }
  return [
    "*Central de Atendimento:*",
    `Encontrei o *${project.name}* nos materiais cadastrados.`,
    "A equipe confirma o material correto desse empreendimento.",
    "Voce quer apresentacao, fotos, video, plantas, simulacao ou visita?",
  ].join("\n");
}

function buildWaldyrRuntimeRealEstateContract(params: {
  prompt: unknown;
  triggerPhrases?: unknown;
  message: unknown;
  conversationHistory: Message[];
}): string | null {
  const promptText = normalizeWaldyrRuntimeRealEstateText(params.prompt);
  if (!promptText.includes("wal_canonico_brisas") && !promptText.includes("wal canonico brisas")) {
    return null;
  }
  if (!promptText.includes("brisas da lagoa")) {
    return null;
  }

  const messageText = normalizeWaldyrRuntimeRealEstateText(params.message);
  if (!messageText) {
    return null;
  }

  const recentHistoryText = normalizeWaldyrRuntimeRealEstateText(
    (params.conversationHistory || [])
      .slice(-3)
      .map((message) => [message.text, message.mediaCaption].filter(Boolean).join("\n"))
      .join("\n"),
  );
  const recentHistoryProjectSources = (params.conversationHistory || [])
    .slice(-3)
    .reverse()
    .map((message) => normalizeWaldyrRuntimeRealEstateText([message.text, message.mediaCaption].filter(Boolean).join("\n")))
    .filter(Boolean);
  const hasExplicitCurrentProjectSignal = hasExplicitWaldyrRuntimeCurrentProjectSignal(messageText);
  const hasMaterialIntent =
    /\b(foto|fotos|video|videos|material|materiais|apresentacao|book|link|links|manda|mandar|envia|enviar|encaminha|encaminhar|mostra|mostrar)\b/.test(messageText);
  const hasInformationIntent =
    /\b(informacao|informacoes|info|saber|detalhe|detalhes|conhecer|conheca|sobre|interesse|interessado|quero conhecer|quero saber)\b/.test(messageText);
  const isShortMaterialContinuation =
    /^(a|opcao a|opcao de letra a|letra a|mais fotos e videos|fotos e videos)$/.test(messageText);
  const allowContextProjectFallback =
    !hasExplicitCurrentProjectSignal && (isShortMaterialContinuation || hasMaterialIntent);
  const projectTurnContext = allowContextProjectFallback
    ? `${recentHistoryText} ${messageText}`.trim()
    : messageText;
  const projectResolverContext = allowContextProjectFallback
    ? recentHistoryProjectSources
    : messageText;
  const hasBrisasContext =
    /\bbrisas\b/.test(projectTurnContext) ||
    /\blagoa\b/.test(projectTurnContext) ||
    (
      /\bararuama\b/.test(projectTurnContext) &&
      /\b(casa|casas|condominio|condominios|imovel|imoveis|residence|residencial)\b/.test(projectTurnContext)
    );
  const waldyrProject = resolveWaldyrRuntimeProject(
    promptText,
    messageText,
    projectResolverContext,
    params.triggerPhrases,
    { allowTurnContextFallback: allowContextProjectFallback },
  );
  const projectContext = waldyrProject?.id === "brisas" ? hasBrisasContext : Boolean(waldyrProject);
  const hasDirectBrisasInquiry =
    /\bbrisas\b/.test(messageText) ||
    (
      /\blagoa\b/.test(messageText) &&
      /\b(araruama|condominio|condominios|casa|casas|imovel|imoveis|empreendimento)\b/.test(messageText)
    );
  const hasNearbyContext =
    /\b(faculdade|universidade|escola|creche|hospital|mercado|shopping|comercio|onibus|transporte|praia|perto|proximo|proxima|arredores|redondeza|bairro)\b/.test(projectTurnContext);
  const hasSimulationIntent = /\b(simulacao|simular|financiamento|financiar|renda|entrada|fgts)\b/.test(messageText);
  const isShortAffirmative = /^(sim|s|isso|pode|pode ser|quero|ok|blz|beleza|certo|aham|ta|tá)$/.test(messageText);
  const hasSimulationProvidedData =
    /\b(nome|telefone|tel|renda|entrada|fgts|financiamento|financiar|militar|fab)\b/.test(messageText) &&
    (
      /\d{8,}/.test(messageText) ||
      /\b(renda|entrada|fgts|militar|fab)\b/.test(messageText)
    );

  if ((hasBrisasContext || projectContext) && hasNearbyContext && (!hasSimulationIntent || isShortAffirmative)) {
    const projectName = waldyrProject?.name || "Brisas da Lagoa";
    return [
      "*Central de Atendimento:*",
      "Consigo deixar essa duvida sobre a regiao para a equipe confirmar com precisao.",
      `Se for sobre o *${projectName}*, tambem posso te enviar agora as fotos, videos e a apresentacao do empreendimento.`,
    ].join("\n");
  }

  if ((hasBrisasContext || projectContext) && (hasMaterialIntent || isShortMaterialContinuation)) {
    return buildWaldyrRuntimeProjectMaterialText(waldyrProject || WALDYR_RUNTIME_PROJECTS[0]);
  }

  if ((hasDirectBrisasInquiry || waldyrProject) && hasInformationIntent && !hasMaterialIntent && !hasSimulationIntent) {
    return buildWaldyrRuntimeProjectOpeningText(waldyrProject || WALDYR_RUNTIME_PROJECTS[0]);
  }

  if ((hasBrisasContext || projectContext) && hasSimulationIntent && !hasMaterialIntent && hasSimulationProvidedData) {
    const projectName = waldyrProject?.name || "Brisas da Lagoa";
    return [
      "*Central de Atendimento:*",
      `Recebi esses dados da simulacao do *${projectName}*.`,
      "Vou deixar como solicitacao para a equipe conferir e te retornar com a orientacao correta.",
    ].join("\n");
  }

  if ((hasDirectBrisasInquiry || waldyrProject) && !hasMaterialIntent && !hasSimulationIntent) {
    return buildWaldyrRuntimeProjectOpeningText(waldyrProject || WALDYR_RUNTIME_PROJECTS[0]);
  }

  return null;
}
