import { storage } from "./storage";
import type { Message, MistralResponse } from "@shared/schema";
import {
  buildInternalSimulatorConnectionInsert,
  isInternalOnlySimulatorConnection,
} from "./internalSimulatorConnection";
import { getLLMClient, getCurrentProvider, getLLMConfig, detectMediaSendingIntent, classifyMediaWithLLM, chatComplete } from "./llm";
import { runWithLLMUserContext } from "./llmUserContext";
import { supabase } from "./supabaseAuth";
import {
  getAgendamento2PromptContext,
  queueConversationAgendamento2Insight,
  type Agendamento2PromptContext,
} from "./agendamento2InsightsService";
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
import {
  attachMediaToProducts,
  fetchProductMediaRows,
  type ProductMediaAsset,
} from "./productCatalogAssets";
import {
  harmonizeCatalogProductResponseForSentImages,
  isExplicitCatalogMediaResendRequest,
  selectCatalogProductImage,
  shouldAttachCatalogMediaForReply,
} from "./productCatalogMediaService";
import {
  buildCatalogProductDeliveryActions,
  hasCatalogVariationMetadata,
  isCatalogProductAvailable,
} from "./productCatalogMessageActions";
// 🚀 UNIFIED FLOW ENGINE - Sistema híbrido (IA interpreta, Sistema executa)
import { shouldUseFlowEngine, processWithFlowEngine, FlowStorage } from "./flowIntegration";
// 🛡️ BLINDAGEM UNIVERSAL V3.1 - Sistema de hardening de prompts (inclui pré-blindagem anti-alucinação)
import { analyzeUserPrompt, generateUniversalBlindagem, generatePreBlindagem, validateResponse, extractBusinessName } from "./promptBlindagem";
// 🤖 CHATBOT VISUAL - Suporte ao Flow Builder (chatbot de fluxo predefinido)
import { processChatbotMessage, isChatbotActive } from "./chatbotFlowEngine";
import { evaluateInboundAutomationGuard } from "./inboundAutomationGuard";
import { getConversationRoutingSnapshot, listOwnerSectors } from "./sectorRoutingService";
import { mergeInitialOpeningMediaActions } from "./initialOpeningMediaActions";
import {
  getSuppressingMediaNames,
  shouldSuppressTextResponseForMediaActions,
} from "./mediaResponsePolicy";
import {
  isSimpleGreetingMessage,
  prependContextualOpeningInstruction,
  shouldForceContextualOpeningResponse,
  shouldReturnOpeningOnlyResponse,
} from "./initialOpeningReplyPolicy";
import {
  buildBrazilGreetingPromptInstruction,
  ensureOpeningGreetingForBrazilTime,
  getBrazilGreetingForHour,
  getBrazilTimeDate,
  normalizeConfiguredGreetingForBrazilTime,
} from "./greetingTime";
import { evaluateAgentTriggerMatch } from "./agentTriggerGate";
import {
  isExplicitOperationalMediaRequest,
  sanitizeCustomerFacingResponseText,
} from "./customerFacingResponsePolicy";
import {
  buildVisualFlowFingerprint,
  type VisualFlowFinalAction,
} from "@shared/flowVisualBuilder";

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
// O Mistral API pode ter pequenas variações mesmo com temperature=0
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
  parseMistralResponse,
  executeMediaActions,
  forceMediaDetection,
  foldMediaName,
} from "./mediaService";
import { buildDelivery2MenuMediaActions } from "./delivery2MediaService";

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

// PRICE FLOW ENFORCEMENT - R$49 leads devem citar o plano corretamente
function normalizePriceLeadText(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldEnforcePriceFlow(messageText: string, prompt: string): boolean {
  if (!messageText || !prompt) return false;
  const normalized = normalizePriceLeadText(messageText);
  const mentionsPrice = normalized.includes("r$ 49") || normalized.includes("r$49") || normalized.includes("49/mes") || normalized.includes("49 mes");
  if (!mentionsPrice) return false;
  // So aplicar quando o prompt claramente e o de vendas da AgenteZAP
  const hasAgenteZap = /AgenteZAP/i.test(prompt);
  const hasPrice = /R\$\s*49/i.test(prompt);
  return hasAgenteZap && hasPrice;
}

function extractIdentityFromPrompt(prompt: string): { agentName?: string; companyName?: string } {
  if (!prompt) return {};
  const normalized = normalizePriceLeadText(prompt);
  const nameMatch =
    normalized.match(/voce e \*\*([^*]+)\*\*/i) ||
    normalized.match(/voce e ([a-z][a-z\s'-]{1,40})/i);
  const companyMatch =
    normalized.match(/da \*\*([^*]+)\*\*/i) ||
    normalized.match(/da ([a-z][a-z\s'-]{1,60})/i);
  return {
    agentName: nameMatch?.[1]?.trim(),
    companyName: companyMatch?.[1]?.trim(),
  };
}

function buildPriceFlowFallback(
  contactName: string | undefined,
  prompt: string
): string {
  const { agentName, companyName } = extractIdentityFromPrompt(prompt);
  const safeName = sanitizeContactName(contactName);
  const namePart = safeName ? `, ${safeName}` : "";
  const agentPart = agentName
    ? `${agentName} da ${companyName || "AgenteZAP"}`
    : `Aqui da ${companyName || "AgenteZAP"}`;
  return `Ola${namePart}! Tudo bem? ${agentPart} aqui. Que otimo que voce tem interesse no plano ilimitado por R$49/mes! Me conta: qual a maior dor que voce enfrenta hoje no atendimento? Assim eu te mostro como o ${companyName || "AgenteZAP"} resolve isso pra voce.`;
}


// ═══════════════════════════════════════════════════════════════════════
// 💇 SISTEMA DE SALÃO DE BELEZA - INTEGRAÇÃO COM IA
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// � SISTEMA DE CATÁLOGO DE PRODUTOS - INTEGRAÇÃO COM IA
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

  const currentCodes = extractCatalogCodeMentions(currentMessage, knownCodes);
  if (currentCodes.length > 0) {
    return currentCodes;
  }

  const recentInboundSelectionText = (conversationHistory || [])
    .slice(-Math.max(1, inboundHistoryWindow))
    .filter((message) => !message.fromMe)
    .map(buildMessageCatalogReferenceText)
    .filter(Boolean)
    .join("\n");
  const inboundHistoryCodes = extractCatalogCodeMentions(recentInboundSelectionText, knownCodes);
  if (inboundHistoryCodes.length > 0) {
    return inboundHistoryCodes;
  }

  const recentHistoryText = (conversationHistory || [])
    .slice(-Math.max(1, historyWindow))
    .map(buildMessageCatalogReferenceText)
    .filter(Boolean)
    .join("\n");
  return extractCatalogCodeMentions(recentHistoryText, knownCodes);
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
      const stock =
        typeof image.variation_stock === "number"
          ? ` | estoque ${image.variation_stock}`
          : "";
      return `- Código ${code}: produto "${product.name}" | nome "${variationName}" | preço ${formatCatalogPriceForPrompt(price)}${stock}`;
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

  const currentCodes = extractCatalogCodeMentions(currentMessage, knownCodes);
  const selectedCodes = selectCatalogCodesFromConversation({
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
      const itemNumber = positionByCode.get(code) || 0;

      lines.push(`*Item ${itemNumber}*`);
      lines.push(`Código: ${code}`);
      lines.push(`Produto: ${variationName || entry.product.name}`);
      if (basePrice) {
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

async function getProductsForAI(userId: string): Promise<ProductsForAIResponse | null> {
  try {
    // Verifica se o módulo está ativo
    const { data: config, error: configError } = await supabase
      .from('products_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
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

function generateProductsPromptBlock(productsData: ProductsForAIResponse): string {
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
  
  return `
═══════════════════════════════════════════════════════════════════════
📦 CATÁLOGO DE PRODUTOS/SERVIÇOS (${productsData.count} itens)
═══════════════════════════════════════════════════════════════════════

${productsList}
${customInstructions}
${displayInstructions}

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
}): Promise<MistralResponse["actions"]> {
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

  const allowExplicitResend = isExplicitCatalogMediaResendRequest(clientMessage);
  if (
    !shouldAttachCatalogMediaForReply({
      clientMessage,
      assistantResponse,
      allowExplicitResend,
    })
  ) {
    return [];
  }

  const selection = await selectCatalogProductImage({
    clientMessage,
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
  const actions: MistralResponse["actions"] = [];
  const appendedProducts: string[] = [];

  for (const productId of selectedProductIds) {
    const selectedProduct = visualProducts.find((product) => product.id === productId);
    if (!selectedProduct) {
      continue;
    }

    const productActions = buildCatalogProductDeliveryActions(
      selectedProduct,
      alreadySentMedias,
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
      actions.push(action as MistralResponse["actions"][number]);
    }
  }

  if (actions.length > 0) {
    console.log(`📦 [Products] ${actions.length} acao(oes) anexada(s) para ${appendedProducts.join(" | ")}`);
  }

  return actions;
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

type MediaAlignmentExecutor = typeof chatComplete;

export interface MediaExecutionAlignmentDecision {
  hasImmediateDeliveryClaim: boolean;
  textShouldWaitForMedia: boolean;
  shouldRewriteWithoutMedia: boolean;
  rewrittenText: string | null;
  reason: string;
}

export function shouldApplyHonestNoMediaFallback(params: {
  shouldSemanticallyAlignTextWithoutMedia: boolean;
  mediaActionsCount: number;
  responseText: string | null | undefined;
  activeEstampariaProfile: boolean;
  alignmentDecision: Pick<MediaExecutionAlignmentDecision, "shouldRewriteWithoutMedia" | "hasImmediateDeliveryClaim"> | null;
}): boolean {
  if (!params.shouldSemanticallyAlignTextWithoutMedia) return false;
  if (params.mediaActionsCount > 0) return false;
  if (!params.responseText || !String(params.responseText).trim()) return false;
  if (params.activeEstampariaProfile) return false;
  if (!params.alignmentDecision) return false;
  if (params.alignmentDecision.shouldRewriteWithoutMedia) return false;
  return params.alignmentDecision.hasImmediateDeliveryClaim;
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

function summarizePlannedMediaActions(actions: MistralResponse["actions"]): string {
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
    return `${index + 1}. Acao desconhecida`;
  });

  return summarized.length > 0 ? summarized.join("\n") : "Nenhuma acao de midia planejada.";
}

function buildSafeMediaTopicLabel(rawName: string): string {
  const words = String(rawName || "")
    .split("_")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (words.length === 0) {
    return "uma funcionalidade especifica";
  }

  return words.join(" ");
}

function buildSafeMediaExpectationFallback(params: {
  contactName?: string | null;
  mediaLibrary: Array<{
    name?: string | null;
    mediaType?: string | null;
    isActive?: boolean | null;
  }>;
}): string {
  const topicLabels = Array.from(
    new Set(
      (params.mediaLibrary || [])
        .filter((media) => media?.isActive !== false && media?.mediaType === "video" && typeof media?.name === "string")
        .map((media) => buildSafeMediaTopicLabel(String(media.name || "")))
        .filter(Boolean),
    ),
  )
    .sort((left, right) => left.length - right.length)
    .slice(0, 3);

  const greeting = params.contactName ? `${params.contactName}, ` : "";

  if (topicLabels.length > 0) {
    return `${greeting}tenho vídeos de funcionalidades específicas, como ${topicLabels.join(", ")}. Me diz qual dessas partes você quer ver primeiro que eu te mostro a funcionalidade certa.`;
  }

  return `${greeting}posso continuar te ajudando por aqui sem prometer mídia que não foi anexada agora. Me diz o que você quer resolver neste momento.`;
}

export async function resolveMediaExecutionAlignment(params: {
  customerMessage: string;
  assistantResponse: string | null | undefined;
  mediaActions: MistralResponse["actions"];
  mediaLibrary: Array<{
    name?: string | null;
    mediaType?: string | null;
    whenToUse?: string | null;
    isActive?: boolean | null;
  }>;
  operationalContext?: string | null;
  llmExecutor?: MediaAlignmentExecutor;
}): Promise<MediaExecutionAlignmentDecision> {
  const assistantResponse = typeof params.assistantResponse === "string" ? params.assistantResponse.trim() : "";
  if (!assistantResponse) {
    return {
      hasImmediateDeliveryClaim: false,
      textShouldWaitForMedia: false,
      shouldRewriteWithoutMedia: false,
      rewrittenText: null,
      reason: "sem_texto",
    };
  }

  const plannedMediaCount = Array.isArray(params.mediaActions) ? params.mediaActions.length : 0;
  const llmExecutor = params.llmExecutor || chatComplete;

  const systemPrompt = [
    "Voce reconcilia o texto final de um orquestrador de IA com o plano real de envio de midia.",
    "Sua prioridade e impedir que o cliente receba uma promessa falsa de envio.",
    "Regras obrigatorias:",
    "1. Se o texto disser ou implicar que a midia esta sendo enviada agora, ja foi anexada ou o cliente deve assistir ou ouvir algo neste momento, marque hasImmediateDeliveryClaim=true.",
    "2. Se nao existir nenhuma acao real de midia planejada, nunca permita texto dizendo que vai enviar agora. Reescreva de forma verdadeira, mantendo o objetivo comercial e sem inventar midia inexistente.",
    "3. Se existir acao real de midia planejada e o texto depender desse envio imediato, marque textShouldWaitForMedia=true.",
    "4. So reescreva quando realmente necessario. Nao use markdown, nao invente recursos, nao use placeholders.",
    "5. Quando nao houver midia planejada mas houver midias disponiveis sobre temas especificos, voce pode oferecer essas opcoes de forma verdadeira, sem dizer que ja esta enviando.",
    "6. Se houver contexto operacional dizendo que uma arte sera preparada internamente, nao trate isso como promessa de midia anexada agora.",
    "Responda apenas JSON com os campos: hasImmediateDeliveryClaim, textShouldWaitForMedia, shouldRewriteWithoutMedia, rewrittenText, reason.",
  ].join("\n");

  const userPrompt = [
    `Mensagem atual do cliente: "${String(params.customerMessage || "").trim()}"`,
    "",
    "Texto final atual do agente:",
    assistantResponse,
    "",
    "Acoes reais de midia planejadas:",
    summarizePlannedMediaActions(params.mediaActions || []),
    "",
    "Biblioteca de midias tradicionais disponiveis:",
    summarizeAvailableTraditionalMedia(params.mediaLibrary || []),
    "",
    "Contexto operacional adicional:",
    params.operationalContext || "(nenhum)",
  ].join("\n");

  try {
    const response = await llmExecutor({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 260,
      temperature: 0.1,
    });

    const rawContent = String(response?.choices?.[0]?.message?.content || "").trim();
    const jsonBlock = extractJsonObjectBlock(rawContent);
    if (!jsonBlock) {
      return {
        hasImmediateDeliveryClaim: false,
        textShouldWaitForMedia: false,
        shouldRewriteWithoutMedia: false,
        rewrittenText: null,
        reason: "json_ausente",
      };
    }

    const parsed = JSON.parse(sanitizeJsonForParsing(jsonBlock)) as Partial<MediaExecutionAlignmentDecision>;
    const rewrittenText = typeof parsed.rewrittenText === "string" && parsed.rewrittenText.trim().length > 0
      ? parsed.rewrittenText.trim()
      : null;

    const normalizedDecision: MediaExecutionAlignmentDecision = {
      hasImmediateDeliveryClaim: parsed.hasImmediateDeliveryClaim === true,
      textShouldWaitForMedia: parsed.textShouldWaitForMedia === true && plannedMediaCount > 0,
      shouldRewriteWithoutMedia: parsed.shouldRewriteWithoutMedia === true && plannedMediaCount === 0,
      rewrittenText,
      reason: typeof parsed.reason === "string" && parsed.reason.trim().length > 0
        ? parsed.reason.trim()
        : "sem_razao",
    };

    if (plannedMediaCount > 0) {
      normalizedDecision.shouldRewriteWithoutMedia = false;
    }

    if (!normalizedDecision.shouldRewriteWithoutMedia) {
      normalizedDecision.rewrittenText = null;
    }

    return normalizedDecision;
  } catch (error) {
    console.error("[AI Agent] Erro ao alinhar texto com plano de midia:", error);
    return {
      hasImmediateDeliveryClaim: false,
      textShouldWaitForMedia: false,
      shouldRewriteWithoutMedia: false,
      rewrittenText: null,
      reason: "erro_alinhamento",
    };
  }
}

export function applyMediaExecutionAlignment(params: {
  responseText: string | null;
  mediaActions: MistralResponse["actions"];
  alignment: MediaExecutionAlignmentDecision | null | undefined;
}): { responseText: string | null; mediaActions: MistralResponse["actions"] } {
  const alignment = params.alignment;
  let responseText = params.responseText;
  let mediaActions = Array.isArray(params.mediaActions) ? [...params.mediaActions] : [];

  if (!alignment) {
    return { responseText, mediaActions };
  }

  if (alignment.shouldRewriteWithoutMedia && alignment.rewrittenText) {
    responseText = alignment.rewrittenText;
  }

  if (
    responseText &&
    mediaActions.length > 0 &&
    alignment.hasImmediateDeliveryClaim &&
    alignment.textShouldWaitForMedia
  ) {
    mediaActions = [
      ...mediaActions,
      {
        type: "send_text",
        text: responseText,
      },
    ];
    responseText = null;
  }

  return { responseText, mediaActions };
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
      .single();
    
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
  
  // � LOG SUPER AGRESSIVO - DETECÇÃO DO MODO PERGUNTAR PRIMEIRO
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
// � FUNÇÕES AUXILIARES PARA MÓDULO DE CURSO/INFOPRODUTO
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
      .single();
    
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
// �🚫 VERIFICAÇÃO DE SUSPENSÃO POR VIOLAÇÃO DE POLÍTICAS
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
    return false; // Em caso de erro, permitir funcionamento normal
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
}): MistralResponse["actions"] {
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
  const actions: MistralResponse["actions"] = [];

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

function normalizeAgenteZapFunnelText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s$,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTrackedMediaNames(value: unknown): string[] {
  const text = String(value || "");
  if (!text) return [];

  const names = new Set<string>();
  const patterns = [
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

function isAgenteZapCommercialFunnelConfig(agentConfig: any, businessConfig: any): boolean {
  const company = normalizeAgenteZapFunnelText([
    businessConfig?.companyName,
    businessConfig?.company_name,
    businessConfig?.company,
  ].filter(Boolean).join(" "));
  if (company === "agentezap" || company === "agente zap") {
    return true;
  }

  const prompt = normalizeAgenteZapFunnelText(agentConfig?.prompt || "");
  return Boolean(
    prompt.includes("voce e rodrigo") &&
      prompt.includes("consultor da agentezap") &&
      prompt.includes("regra prioritaria do funil atual"),
  );
}

type ConfiguredSequentialFunnelStage = {
  index: number;
  media: any;
  mediaName: string;
  foldedName: string;
};

function removeNegativeFunnelStageGuidance(guidance: string): string {
  return guidance
    .replace(/\b(?:nao|nunca)\s+(?:usar|enviar|mande|envie|mandar|repetir|falar)[^.]{0,220}(?:etapa|resposta|mensagem|funil)[^.]*\.?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function configuredSequentialFunnelStageLooksAgenteZap(stage: ConfiguredSequentialFunnelStage): boolean {
  const text = normalizeAgenteZapFunnelText([
    stage.mediaName,
    stage.media?.description,
    stage.media?.whenToUse,
    stage.media?.when_to_use,
    stage.media?.caption,
  ].filter(Boolean).join(" "));
  return text.includes("agentezap") || text.includes("agente zap");
}

function resolveConfiguredSequentialFunnelStageIndex(media: any): number | null {
  const guidance = normalizeAgenteZapFunnelText([
    media?.name,
    media?.description,
    media?.whenToUse,
    media?.when_to_use,
    media?.caption,
  ].filter(Boolean).join(" "));
  if (!guidance) return null;

  const positiveGuidance = removeNegativeFunnelStageGuidance(guidance);
  const funnel = /\b(funil|etapa|resposta comercial|lead)\b/.test(positiveGuidance);
  const explicitStage3 = /\b(etapa\s*3|midia obrigatoria da terceira etapa|obrigatorio enviar na terceira etapa|enviar na terceira etapa|terceira etapa do funil|terceira etapa|terceira resposta|terceira mensagem)\b/.test(positiveGuidance);
  const explicitStage2 = /\b(etapa\s*2|enviar na segunda resposta|segunda etapa do funil|segunda etapa|segunda resposta|segunda mensagem)\b/.test(positiveGuidance);
  const explicitStage1 = /\b(etapa\s*1|primeira etapa|primeira resposta|primeira mensagem|inicio do funil)\b/.test(positiveGuidance);

  if (funnel && explicitStage3) return 3;
  if (funnel && explicitStage2) return 2;
  if (funnel && explicitStage1) return 1;

  const openingFlow = /\b(fluxo de abertura|sequencia inicial|saudacao inicial|abertura do atendimento|inicio do atendimento|mensagem inicial)\b/.test(guidance);
  const openingContext = /\b(info|atendimento|lead|funil|sequencia|fluxo|resposta)\b/.test(guidance);
  if (openingFlow && openingContext) return 1;

  const required = /\b(obrigatorio|obrigatoria|sempre|deve|precisa|enviar|envie|mande)\b/.test(positiveGuidance);
  if (!required || !funnel) return null;

  if (explicitStage3) return 3;
  if (explicitStage2) return 2;
  if (explicitStage1 || /\b(saudacao|saudacao inicial)\b/.test(positiveGuidance)) return 1;
  return null;
}

function getConfiguredSequentialFunnelStages(mediaLibrary: any[]): ConfiguredSequentialFunnelStage[] {
  const byIndex = new Map<number, ConfiguredSequentialFunnelStage>();
  (mediaLibrary || [])
    .filter((media: any) => media?.isActive !== false)
    .map((media: any) => {
      const index = resolveConfiguredSequentialFunnelStageIndex(media);
      const mediaName = String(media?.name || "").trim();
      const foldedName = foldMediaName(mediaName);
      if (!index || !mediaName || !foldedName) return null;
      return { index, media, mediaName, foldedName };
    })
    .filter(Boolean)
    .sort((left: any, right: any) => {
      const leftOrder = Number(left.media?.displayOrder ?? left.media?.display_order ?? 9999);
      const rightOrder = Number(right.media?.displayOrder ?? right.media?.display_order ?? 9999);
      const orderDiff = leftOrder - rightOrder;
      return orderDiff || left.index - right.index;
    })
    .forEach((stage: ConfiguredSequentialFunnelStage) => {
      if (!byIndex.has(stage.index)) byIndex.set(stage.index, stage);
    });

  const stages = Array.from(byIndex.values()).sort((left, right) => left.index - right.index);
  return stages.length >= 2 && stages[0]?.index === 1 ? stages : [];
}

function collectAgenteZapFunnelSentMedias(params: {
  sentMedias: string[];
  conversationHistory: Array<{ fromMe?: boolean; isFromAgent?: boolean; text?: string | null; mediaCaption?: string | null }>;
  agentConfig: any;
}): Set<string> {
  const sent = new Set<string>();
  for (const mediaName of params.sentMedias || []) {
    const folded = foldMediaName(mediaName);
    if (folded) sent.add(folded);
  }

  let hasPriorAgentOpeningText = false;
  const configuredGreeting = normalizeAgenteZapFunnelText(params.agentConfig?.customGreeting || "");

  for (const message of params.conversationHistory || []) {
    if (message?.fromMe !== true && message?.isFromAgent !== true) continue;
    const combinedText = [message.text, message.mediaCaption].filter(Boolean).join(" ");
    for (const mediaName of extractTrackedMediaNames(combinedText)) {
      const folded = foldMediaName(mediaName);
      if (folded) sent.add(folded);
    }

    const normalizedMessage = normalizeAgenteZapFunnelText(message.text || "");
    if (
      normalizedMessage &&
      (
        normalizedMessage.includes("vender mais") ||
        normalizedMessage.includes("atender melhor") ||
        normalizedMessage.includes("organizar leads") ||
        (configuredGreeting && normalizeAgenteZapFunnelText(configuredGreeting).slice(0, 50) && normalizedMessage.includes("me fala rapidinho"))
      )
    ) {
      hasPriorAgentOpeningText = true;
    }
  }

  if (hasPriorAgentOpeningText) {
    sent.add("SAUDACAO_INFO_EXTRA");
  }

  return sent;
}

function extractAgenteZapBusinessLabelFromRawText(rawText: string): string | null {
  const source = String(rawText || "").replace(/\s+/g, " ").trim();
  const patterns = [
    /\btrabalho\s+com\s+([^.!?\n,;]{3,90})/i,
    /\batuo\s+com\s+([^.!?\n,;]{3,90})/i,
    /\b(?:tenho|possuo)\s+(?:uma|um)\s+([^.!?\n,;]{3,90})/i,
    /\bmeu\s+neg[oó]cio\s+(?:e|é)\s+([^.!?\n,;]{3,90})/i,
    /\bsou\s+([^.!?\n,;]{3,70})/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    const candidate = match?.[1]?.trim();
    if (!candidate) continue;
    const cleaned = candidate
      .replace(/\b(eu|voce|você|preciso|quero|gostaria|saber|como|funciona)\b.*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 3 && cleaned.length <= 90) {
      return cleaned;
    }
  }

  return null;
}

function inferAgenteZapLeadContext(message: string, history: Array<{ text?: string | null }>) {
  const rawContextText = [
    ...(history || []).slice(-4).map((entry) => entry?.text || ""),
    message,
  ].join(" ");
  const text = normalizeAgenteZapFunnelText(rawContextText);

  let businessLabel = extractAgenteZapBusinessLabelFromRawText(rawContextText) || "negócio";
  if (businessLabel === "negócio") {
    if (/\b(pizzaria|pizza)\b/.test(text)) businessLabel = /\b(delivery|entrega|pedido|pedidos)\b/.test(text) ? "pizzaria delivery" : "pizzaria";
    else if (/\b(delivery|restaurante|marmita|marmitas|acai|lanchonete|hamburgueria)\b/.test(text)) businessLabel = "delivery";
    else if (/\b(imobiliaria|imovel|imoveis|corretor)\b/.test(text)) businessLabel = "imobiliária";
    else if (/\b(clinica|estetica|procedimento|odontologica|dentista)\b/.test(text)) businessLabel = "clínica";
    else if (/\b(salao|barbearia|beleza)\b/.test(text)) businessLabel = "salão";
    else if (/\b(escola|curso|cursos|matricula)\b/.test(text)) businessLabel = "escola de cursos";
    else if (/\b(oficina|mecanica|mecanico|orcamento)\b/.test(text)) businessLabel = "oficina";
  }

  let pain = "responder rápido, organizar as dúvidas e não deixar oportunidade esfriar";
  if (/\b(agilizar|rapido|demora|demoro|atraso|esperando)\b/.test(text)) {
    pain = "agilizar o atendimento e não deixar o cliente esperando";
  } else if (/\b(vender|vendas|pedido|pedidos)\b/.test(text)) {
    pain = "puxar mais pedidos e responder o cliente na hora certa";
  } else if (/\b(leads|lead|qualificar|organizar)\b/.test(text)) {
    pain = "organizar os leads e separar quem tem mais chance de comprar";
  }

  return { businessLabel, pain };
}

function buildAgenteZapSecondStageText(params: {
  message: string;
  history: Array<{ text?: string | null }>;
}): string {
  const context = inferAgenteZapLeadContext(params.message, params.history);
  return [
    `Boa. Para ${context.businessLabel}, o ponto é ${context.pain}.`,
    "O AgenteZap entra justamente nesse primeiro atendimento do WhatsApp, responde com base nas suas regras e ajuda a conduzir o cliente.",
    "Você prefere configurar sozinho com os cursos em vídeo e o chat criador de agente dentro da plataforma, ou prefere que a equipe configure para você?",
  ].join("[BOLHA]");
}

function buildAgenteZapThirdStageText(params: {
  message: string;
  history: Array<{ text?: string | null }>;
}): string {
  const context = inferAgenteZapLeadContext(params.message, params.history);
  return [
    `Perfeito. Para testar na prática com ${context.businessLabel}, agora crie a conta pelo link e veja por dentro.`,
    "Se for configurar sozinho, use os cursos em vídeo e o chat criador de agente dentro da plataforma. Se quiser a equipe configurando para você, ative o plano de R$99,99 e me envie o e-mail usado na conta.",
    "www.agentezap.online",
  ].join("[BOLHA]");
}

function buildAgenteZapMediaAction(media: any): MistralResponse["actions"][number] | null {
  if (!media?.name) return null;
  return { type: "send_media", media_name: media.name };
}

function applyAgenteZapConfiguredFunnelGuard(params: {
  enabled: boolean;
  message: string;
  conversationHistory: Array<{ fromMe?: boolean; isFromAgent?: boolean; text?: string | null; mediaCaption?: string | null }>;
  sentMedias: string[];
  text: string | null;
  mediaActions: MistralResponse["actions"];
  mediaLibrary: any[];
  agentConfig: any;
  businessConfig: any;
}): { text: string | null; mediaActions: MistralResponse["actions"]; stage: string | null } {
  if (!params.enabled) {
    return { text: params.text, mediaActions: params.mediaActions, stage: null };
  }

  const configuredStages = getConfiguredSequentialFunnelStages(params.mediaLibrary);
  const hasConfiguredFunnel = configuredStages.length >= 2;
  const isAgenteZapFunnel =
    isAgenteZapCommercialFunnelConfig(params.agentConfig, params.businessConfig) ||
    configuredStages.some((stage) => configuredSequentialFunnelStageLooksAgenteZap(stage));

  if (!hasConfiguredFunnel || !isAgenteZapFunnel) {
    return { text: params.text, mediaActions: params.mediaActions, stage: null };
  }

  const sent = collectAgenteZapFunnelSentMedias({
    sentMedias: params.sentMedias,
    conversationHistory: params.conversationHistory,
    agentConfig: params.agentConfig,
  });
  const firstStage = configuredStages[0];
  const pendingStage = configuredStages.find((stage) => !sent.has(stage.foldedName)) || null;

  if (!firstStage || !sent.has(firstStage.foldedName) || !pendingStage) {
    return { text: params.text, mediaActions: params.mediaActions, stage: null };
  }

  if (pendingStage.index === 2) {
    const requiredAction = buildAgenteZapMediaAction(pendingStage.media);
    const kept = (params.mediaActions || []).filter((action: any) =>
      foldMediaName(action?.media_name || action?.mediaName) === pendingStage.foldedName,
    );
    return {
      text: buildAgenteZapSecondStageText(params),
      mediaActions: requiredAction ? (kept.length > 0 ? kept : [requiredAction]) : kept,
      stage: `configured_funnel_stage_${pendingStage.index}`,
    };
  }

  if (pendingStage.index >= 3) {
    const requiredAction = buildAgenteZapMediaAction(pendingStage.media);
    const kept = (params.mediaActions || []).filter((action: any) =>
      foldMediaName(action?.media_name || action?.mediaName) === pendingStage.foldedName,
    );
    return {
      text: buildAgenteZapThirdStageText(params),
      mediaActions: requiredAction ? (kept.length > 0 ? kept : [requiredAction]) : kept,
      stage: `configured_funnel_stage_${pendingStage.index}`,
    };
  }

  return { text: params.text, mediaActions: params.mediaActions, stage: null };
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

async function generateOpeningOnlyResponse(openingRule: AgentOpeningRule): Promise<string> {
  const fallback = openingRule.text.trim();
  if (!openingRule.variationEnabled) {
    return fallback;
  }

  try {
    const llmClient = await getLLMClient();
    if (!llmClient) {
      return fallback;
    }

    const chatResponse = await withRetry(
      async () => {
        return await llmClient.chat.complete({
          messages: [
            {
              role: "system",
              content: `Sua unica tarefa e reescrever uma mensagem inicial curta.
Responda com UMA unica mensagem curta e completa.
Nao faca perguntas.
Nao acrescente segunda saudacao.
Nao se apresente.
Nao explique nada alem da propria mensagem.
Mantenha exatamente o mesmo sentido do texto-base.`,
            },
            {
              role: "user",
              content: `Reescreva esta mensagem mantendo o mesmo sentido: "${fallback}"`,
            },
          ] as any,
          maxTokens: 120,
          temperature: 0.2,
          randomSeed: 42,
        });
      },
      1,
      1000,
      "LLM opening-only",
    );

    const content = chatResponse.choices?.[0]?.message?.content;
    const responseText = typeof content === "string" ? content.trim() : "";
    return responseText || fallback;
  } catch (error) {
    console.error("⚠️ [AI Agent] Falha ao gerar variacao de abertura. Usando texto base.", error);
    return fallback;
  }
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

  const fallbackReply = openingFlowAlreadySent
    ? null
    : params.mediaActionCount > 0
      ? `Perfeito! Vou te mostrar agora as opcoes relacionadas ao que voce pediu.`
      : `Perfeito! Ja vou te ajudar com o que voce pediu.`;

  if (draftWithoutOpening && !openingFlowAlreadySent) {
    console.log(`🧩 [AI Agent] Mantendo corpo factual da primeira resposta concreta sem reescrita livre`);
    return draftWithoutOpening;
  }

  try {
    console.log(`🧩 [AI Agent] Reparando primeira resposta concreta com ${params.mediaActionCount} mídia(s)`);
    const chatResponse = await withRetry(
      async () =>
        params.llmClient.chat.complete({
          model: params.model,
          messages: [
            {
              role: "system",
              content: `Sua tarefa e ESCREVER a PRIMEIRA resposta textual de um atendimento de WhatsApp.
O cliente iniciou a conversa com um pedido concreto.
O texto atual do agente serve apenas como referencia de tom e contexto.

REGRAS:
- Escreva UMA unica resposta curta em portugues do Brasil.
- Essa resposta curta deve ajudar imediatamente no pedido do cliente.
- Nao invente detalhes nao confirmados.
- Se houver midias sendo enviadas, mencione isso naturalmente quando fizer sentido.
- Nao responda apenas pedindo nome.
- Se ainda precisar pedir alguma informacao, faca isso somente depois de ajudar.
- Nao explique regras, nao use aspas e nao cite que esta reescrevendo.
${openingFlowAlreadySent
  ? `- A abertura configurada do agente JA sera enviada separadamente pelo sistema nesta mesma resposta.
- Essa abertura separada ja cobre saudacao, apresentacao e possiveis perguntas iniciais.
- Elimine qualquer trecho redundante de saudacao, apresentacao ou pergunta que a abertura ja esteja cobrindo.
- Se a abertura separada ja bastar para encaminhar o primeiro passo, retorne vazio.`
  : ""}

Retorne somente o texto final, sem aspas e sem explicacoes.`,
            },
            {
              role: "user",
              content: `Mensagem inicial do cliente:
${customerMessage}

Texto atual do agente:
${draftWithoutOpening || draftReply || "(vazio)"}

Quantidade de midias enviadas nesta resposta: ${params.mediaActionCount}
${openingText ? `Abertura fixa configurada: ${openingText}` : ""}
${openingFlowSummary ? `Abertura separada enviada pelo sistema: ${openingFlowSummary}` : ""}`,
            },
          ] as any,
          maxTokens: 220,
          temperature: 0.0,
          randomSeed: 42,
        }),
      1,
      1000,
      "LLM first concrete opening repair",
    );

    const repairedContent = String(chatResponse.choices?.[0]?.message?.content || "").trim();
    if (!repairedContent) {
      console.log(`🧩 [AI Agent] Reparador retornou corpo vazio para a primeira resposta concreta`);
      return fallbackReply;
    }
    console.log(`🧩 [AI Agent] Primeira resposta concreta reparada: ${repairedContent.substring(0, 120)}...`);
    return repairedContent;
  } catch (error) {
    console.warn("⚠️ [AI Agent] Falha ao reparar primeira resposta concreta:", error);
    return fallbackReply;
  }
}

function hydrateResponseMediaActions(
  actions: MistralResponse["actions"] | undefined,
  contactName?: string,
): MistralResponse["actions"] {
  const hydrated: MistralResponse["actions"] = [];

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

function hasGreetingOpeningFlowAction(actions: MistralResponse["actions"] | undefined): boolean {
  return (actions || []).some((action) => {
    if (String((action as any)?.opening_flow_source || "").trim() === "greeting") {
      return true;
    }

    const mediaName = String((action as any)?.media_name || "").trim();
    return mediaName ? foldMediaName(mediaName) === "SAUDACAO_INFO_EXTRA" : false;
  });
}

function describeOpeningMediaActions(actions: MistralResponse["actions"]): string {
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

async function finalizeFlowEngineResponse(params: {
  userId: string;
  agentConfig: any;
  customerMessage: string;
  conversationHistory: Message[];
  contactName?: string;
  text: string | null | undefined;
  mediaActions?: MistralResponse["actions"];
  mediaLibrary?: Array<{ name: string; suppressTextResponse?: boolean | null }>;
}): Promise<{ text: string | null; mediaActions: MistralResponse["actions"] }> {
  const openingRuleForCurrentTurn = resolveAgentOpeningRule(params.agentConfig, params.contactName);
  let responseText =
    params.text === null || params.text === undefined
      ? null
      : processResponsePlaceholders(String(params.text), params.contactName);
  const mediaActions = hydrateResponseMediaActions(params.mediaActions, params.contactName);
  const suppressingMediaNames = getSuppressingMediaNames(mediaActions, params.mediaLibrary);
  const openingText = String(openingRuleForCurrentTurn?.text || "").trim();
  const openingAlreadyCoveredByMedia =
    Boolean(openingText) &&
    mediaActions.some((action) => {
      if (action?.type !== "send_text") {
        return false;
      }

      const actionText = String((action as any).text || "").trim();
      if (!actionText) {
        return false;
      }

      return normalizeOpeningComparison(actionText) === normalizeOpeningComparison(openingText);
    });
  const greetingOpeningFlowAlreadyAttached = hasGreetingOpeningFlowAction(mediaActions);

  if (greetingOpeningFlowAlreadyAttached) {
    return {
      text: null,
      mediaActions,
    };
  }

  if (
    params.conversationHistory.length === 0 &&
    (openingAlreadyCoveredByMedia || greetingOpeningFlowAlreadyAttached)
  ) {
    return {
      text: null,
      mediaActions,
    };
  }

  if (suppressingMediaNames.length > 0) {
    console.log(`📁 [Flow Engine] Mídia configurada para suprimir texto principal: ${suppressingMediaNames.join(", ")}`);
    return {
      text: null,
      mediaActions,
    };
  }

  if (
    params.conversationHistory.length === 0 &&
    shouldForceContextualOpeningResponse(params.customerMessage) &&
    mediaActions.length > 0
  ) {
    try {
      const llmClient = await getLLMClient(params.userId);
      const currentProvider = await getCurrentProvider(params.userId);
      const model = currentProvider === "groq" ? undefined : params.agentConfig?.model;

      responseText = await repairFirstConcreteOpeningReply({
        llmClient,
        model,
        customerMessage: params.customerMessage,
        draftReply: responseText,
        mediaActionCount: mediaActions.length,
        openingText: getOpeningTextForCustomerMessage(openingText, params.customerMessage),
        openingFlowAlreadySent: true,
        openingFlowSummary: describeOpeningMediaActions(mediaActions),
      });

      if (responseText !== null && responseText !== undefined) {
        responseText = processResponsePlaceholders(responseText, params.contactName);
      }
    } catch (repairError) {
      console.warn(`⚠️ [Flow Engine] Falha ao reparar primeira resposta concreta com abertura separada:`, repairError);
    }
  }

  return {
    text: responseText,
    mediaActions,
  };
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
function generateDynamicContextBlock(contactName?: string, sentMedias?: string[], conversationHistory?: Array<{ fromMe?: boolean; text?: string | null; timestamp?: Date | null }>): string {
  // � FIX v4: ADICIONADO data/hora do Brasil novamente!
  // Clientes como JB Elétrica precisam saber o horário para verificar
  // se está dentro ou fora do horário de atendimento.
  // A informação é contextual (não afeta determinismo da resposta).
  const brazilTime = getBrazilDateTime();
  
  const formattedName = sanitizeContactName(contactName);
  
  const sentMediasList = sentMedias && sentMedias.length > 0 
    ? sentMedias.join(", ") 
    : "nenhuma ainda";
  
  // 🔄 DETECTAR SE JÁ HOUVE CONVERSA HOJE
  // Se já temos histórico de conversa hoje, a IA NÃO deve cumprimentar novamente
  let alreadyTalkedToday = false;
  let hasFollowUpMessage = false;
  
  if (conversationHistory && conversationHistory.length > 0) {
    const today = new Date().toDateString();
    alreadyTalkedToday = conversationHistory.some(msg => {
      if (!msg.timestamp) return false;
      const msgDate = new Date(msg.timestamp).toDateString();
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
  mediaActions?: MistralResponse['actions'];
  attention?: AttentionAssessment;
  routing?: StructuredRoutingDecision;
  notification?: {
    shouldNotify: boolean;
    reason: string;
  };
  appointmentCreated?: any;
  deliveryOrderCreated?: any;
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
  return runWithLLMUserContext(userId, async () => {
    try {
      const isSuspended = await checkUserSuspension(userId);
      if (isSuspended) {
        console.log(`⚠️ [Attention Queue] Classificação ignorada: usuário ${userId} suspenso.`);
        return undefined;
      }

      if (options?.contactPhone) {
        const isExcluded = await storage.isNumberExcluded(userId, options.contactPhone);
        if (isExcluded) {
          console.log(`⚠️ [Attention Queue] Classificação ignorada: ${options.contactPhone} está na lista de exclusão.`);
          return undefined;
        }
      }

      const llmClient = await getLLMClient();
      if (!llmClient) {
        console.warn("⚠️ [Attention Queue] Classificação sem resposta: LLM indisponível.");
        return undefined;
      }

      const currentProvider = await getCurrentProvider();
      const businessConfig = await storage.getBusinessAgentConfig?.(userId);
      const agentConfig = await storage.getAgentConfig(userId);
      const model = currentProvider === "groq"
        ? undefined
        : (businessConfig?.model || agentConfig?.model);
      const transcript = buildAttentionTranscriptSnippet(conversationHistory);
      const contactLabel = options?.contactName?.trim() || options?.contactPhone?.trim() || "Contato";

      const classificationResponse = await withRetry(
        async () =>
          llmClient.chat.complete({
            model,
            messages: [
              {
                role: "system",
                content: [
                  "Voce classifica prioridade de atencao humana em conversas de WhatsApp.",
                  "Retorne somente JSON valido, sem markdown e sem texto extra.",
                  "Chaves obrigatorias: priority, needsHumanAttention, reason, confidence.",
                  'priority deve ser \"critica\", \"alta\", \"media\", \"baixa\" ou null.',
                  "needsHumanAttention deve ser boolean.",
                  "reason deve ser curta, operacional e baseada no contexto.",
                  "confidence deve ser numero entre 0 e 1.",
                ].join("\n"),
              },
              {
                role: "user",
                content: [
                  "Decida se esta conversa precisa de olhar humano agora, mesmo sem resposta automatica.",
                  "Nao use regra fixa; interprete contexto, intencao, risco, travamento e continuidade.",
                  `Contato: ${contactLabel}`,
                  `Ultima mensagem do cliente: ${latestCustomerMessage.trim().slice(0, 320) || "(sem texto)"}`,
                  "",
                  "Trecho recente da conversa:",
                  transcript || "(sem historico)",
                ].join("\n"),
              },
            ],
            maxTokens: 180,
            temperature: 0,
            randomSeed: 42,
          }),
        1,
        800,
        `Attention classify-only (${currentProvider})`,
      );

      const rawContent = classificationResponse?.choices?.[0]?.message?.content;
      const jsonCandidate = extractFirstJsonObjectCandidate(
        typeof rawContent === "string" ? rawContent : null,
      );

      if (!jsonCandidate) {
        console.warn("⚠️ [Attention Queue] Classificação sem JSON aproveitável.");
        return undefined;
      }

      return sanitizeAttentionAssessment(JSON.parse(jsonCandidate));
    } catch (error) {
      console.warn("⚠️ [Attention Queue] Falha na classificação sem resposta automática:", error);
      return undefined;
    }
  });
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

  const transcript = buildAttentionTranscriptSnippet(params.conversationHistory);

  try {
    const fallbackResponse = await withRetry(
      async () =>
        params.llmClient.chat.complete({
          model: params.model,
          messages: [
            {
              role: "system",
              content: [
                "Voce classifica prioridade de atencao humana em conversas de WhatsApp.",
                "Retorne somente JSON valido, sem markdown e sem texto extra.",
                "Chaves obrigatorias: priority, needsHumanAttention, reason, confidence.",
                'priority deve ser "critica", "alta", "media", "baixa" ou null.',
                "needsHumanAttention deve ser boolean.",
                "reason deve ser curta e operacional.",
                "confidence deve ser numero entre 0 e 1.",
              ].join("\n"),
            },
            {
              role: "user",
              content: [
                "Decida se esta conversa merece olhar humano agora.",
                "Nao use regra comercial fixa; interprete contexto, intencao, risco e travamento.",
                "",
                `Ultima mensagem do cliente: ${params.latestCustomerMessage.trim().slice(0, 280) || "(sem texto)"}`,
                `Resposta final da IA: ${params.assistantResponse.trim().slice(0, 400)}`,
                "",
                "Trecho recente da conversa:",
                transcript || "(sem historico)",
              ].join("\n"),
            },
          ],
          maxTokens: 180,
          temperature: 0,
          randomSeed: 42,
        }),
      1,
      800,
      `Attention fallback (${params.provider})`,
    );

    const rawContent = fallbackResponse?.choices?.[0]?.message?.content;
    const jsonCandidate = extractFirstJsonObjectCandidate(
      typeof rawContent === "string" ? rawContent : null,
    );

    if (!jsonCandidate) {
      console.warn("⚠️ [Attention Queue] Fallback da IA retornou sem JSON aproveitavel.");
      return undefined;
    }

    return sanitizeAttentionAssessment(JSON.parse(jsonCandidate));
  } catch (error) {
    console.warn("⚠️ [Attention Queue] Falha no fallback de classificacao:", error);
    return undefined;
  }
}

// 📝 Converter formatação Markdown para WhatsApp
// WhatsApp usa: *negrito* _itálico_ ~tachado~ ```mono```
// Mistral retorna: **negrito** *itálico* ~~tachado~~ `mono`
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
}

// ═══════════════════════════════════════════════════════════════════════
// 🧹 FUNÇÃO PARA LIMPAR VAZAMENTOS DE INSTRUÇÕES NA RESPOSTA DA IA
// Remove instruções técnicas que a IA às vezes copia do prompt para a resposta
// Ex: "Use exatamente o texto abaixo..." não deve aparecer na mensagem ao cliente
// ═══════════════════════════════════════════════════════════════════════
function cleanInstructionLeaks(responseText: string): string {
  const originalText = responseText;
  let cleanedText = responseText;
  
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
  try {
    // 🚫 VERIFICAÇÃO DE SUSPENSÃO POR VIOLAÇÃO DE POLÍTICAS
    // Usuários suspensos não podem usar a IA
    const isSuspended = await checkUserSuspension(userId);
    if (isSuspended) {
      console.log(`\n${'!'.repeat(60)}`);
      console.log(`🚫 [AI Agent] RETURN NULL #1: Usuário ${userId} está SUSPENSO`);
      console.log(`${'!'.repeat(60)}\n`);
      return null;
    }

    // 🌅 EXTRAIR CONTEXTO DINÂMICO
    const contactName = options?.contactName;
    const sentMedias = options?.sentMedias || [];
    const contactPhone = options?.contactPhone || '';
    const conversationId =
      options?.conversationId || `real-${userId}-${Math.floor(Date.now() / 60000)}`;
    
    const automationGuardDecision = await evaluateInboundAutomationGuard({
      userId,
      connectionId: options?.conversationId || conversationId,
      conversationId,
      contactNumber: contactPhone,
      contactName: contactName || null,
      inboundText: newMessageText,
      conversationHistory,
    });
    if (
      automationGuardDecision.shouldBlock &&
      automationGuardDecision.kind === "saas_channel"
    ) {
      console.log(`\n${'!'.repeat(60)}`);
      console.log(`🤖 [AI Agent] RETURN NULL #2: Canal interno do SaaS detectado - IGNORANDO`);
      console.log(`   Razão: ${automationGuardDecision.reason}`);
      console.log(`   Contato: ${contactName || 'N/A'}`);
      console.log(`   Mensagem: ${newMessageText.substring(0, 50)}...`);
      console.log(`${'!'.repeat(60)}\n`);
      return null;
    }

    if (contactPhone) {
      const isExcluded = await storage.isNumberExcluded(userId, contactPhone);
      if (isExcluded) {
        console.log(`\n${'!'.repeat(60)}`);
        console.log(`🚫 [AI Agent] RETURN NULL #2.5: Número ${contactPhone} está na lista de exclusão`);
        console.log(`${'!'.repeat(60)}\n`);
        return null;
      }
    }
    
    console.log(`👤 [AI Agent] Nome do cliente: ${contactName || 'Não identificado'}`);
    console.log(`📁 [AI Agent] Mídias já enviadas: ${sentMedias.length > 0 ? sentMedias.join(', ') : 'nenhuma'}`);
    
    // 🆕 TENTAR BUSCAR BUSINESS CONFIG PRIMEIRO (novo sistema)
    // Usar dependência injetada se existir (para testes)
    let businessConfig;
    if (testDependencies?.getBusinessAgentConfig) {
      businessConfig = await testDependencies.getBusinessAgentConfig(userId);
    } else {
      businessConfig = await storage.getBusinessAgentConfig?.(userId);
    }
    
    // 🔄 FALLBACK: Buscar config legado se novo não existir
    let agentConfig;
    if (testDependencies?.getAgentConfig) {
      agentConfig = await testDependencies.getAgentConfig(userId);
    } else {
      agentConfig = await storage.getAgentConfig(userId);
    }

    // PROMPT SYNC: keep ai_agent_config aligned with prompt_versions current
    // Avoids simulator/editor prompt diverging from WhatsApp runtime
    // Skips when customPrompt is used
    if (!testDependencies?.getAgentConfig && agentConfig?.prompt) {
      const now = Date.now();
      const agentPromptHash = crypto.createHash('md5').update(agentConfig.prompt).digest('hex').substring(0, 8);
      const cached = promptSyncCache.get(userId);
      const cacheValid = cached && cached.promptHash === agentPromptHash && (now - cached.checkedAt) < PROMPT_SYNC_TTL_MS;

      if (!cacheValid) {
        try {
          const { obterVersaoAtual } = await import('./promptHistoryService');
          const currentVersion = await obterVersaoAtual(userId, 'ai_agent_config');

          if (currentVersion?.prompt_content && currentVersion.prompt_content !== agentConfig.prompt) {
            const versionHash = crypto.createHash('md5').update(currentVersion.prompt_content).digest('hex').substring(0, 8);
            console.log(`[PROMPT SYNC] Mismatch detected. config hash: ${agentPromptHash}, versions hash: ${versionHash}`);

            // BIDIRECTIONAL SYNC: compare timestamps to determine source of truth
            const configTime = agentConfig.updatedAt ? new Date(agentConfig.updatedAt).getTime() : 0;
            const versionTime = currentVersion.updated_at ? new Date(currentVersion.updated_at).getTime() : 0;

            if (configTime > versionTime) {
              // ai_agent_config is NEWER (admin agent / SALVAR_CONFIG wrote) -> sync TO prompt_versions
              console.log(`[PROMPT SYNC] ai_agent_config is newer (${new Date(configTime).toISOString()} > ${new Date(versionTime).toISOString()}) - syncing TO prompt_versions`);
              try {
                const { salvarVersaoPrompt } = await import('./promptHistoryService');
                await salvarVersaoPrompt({
                  userId,
                  configType: 'ai_agent_config',
                  promptContent: agentConfig.prompt,
                  editSummary: 'Auto-sync from admin agent update',
                  editType: 'ia'
                });
                console.log(`[PROMPT SYNC] prompt_versions updated from ai_agent_config`);
              } catch (syncErr) {
                console.error(`[PROMPT SYNC] Failed to sync to prompt_versions:`, syncErr);
              }
            } else {
              // prompt_versions is NEWER (UI restore/edit) -> sync TO ai_agent_config
              console.log(`[PROMPT SYNC] prompt_versions is newer - syncing TO ai_agent_config`);
              agentConfig = { ...agentConfig, prompt: currentVersion.prompt_content };
              try {
                await storage.updateAgentConfig(userId, { prompt: currentVersion.prompt_content });
                console.log(`[PROMPT SYNC] ai_agent_config updated from prompt_versions`);
              } catch (syncErr) {
                console.error(`[PROMPT SYNC] Failed to sync to ai_agent_config:`, syncErr);
              }
            }
          }

          const finalHash = crypto.createHash('md5').update(agentConfig.prompt).digest('hex').substring(0, 8);
          promptSyncCache.set(userId, { promptHash: finalHash, checkedAt: now });
        } catch (syncError) {
          console.error(`[PROMPT SYNC] Erro ao checar prompt_versions:`, syncError);
          promptSyncCache.set(userId, { promptHash: agentPromptHash, checkedAt: now });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🎯 DEBUG: Mostrar status das configurações
    // ═══════════════════════════════════════════════════════════════════════
    console.log(`\n🔍 [AI Agent] Verificando configurações para user ${userId}:`);
    console.log(`   📊 Legacy (ai_agent_config): ${agentConfig ? `exists, isActive=${agentConfig.isActive}` : 'NOT FOUND'}`);
    console.log(`   📊 Business (business_agent_configs): ${businessConfig ? `exists, isActive=${businessConfig.isActive}` : 'NOT FOUND'}`);

    // ═══════════════════════════════════════════════════════════════════════
    // 🎯 VERIFICAR SE HISTÓRICO ESTÁ ATIVO (busca SEMPRE, não só primeira vez)
    // ═══════════════════════════════════════════════════════════════════════
    const isHistoryModeActive = agentConfig?.fetchHistoryOnFirstResponse === true;
    
    if (isHistoryModeActive) {
      console.log(`📜 [AI Agent] MODO HISTÓRICO ATIVO - ${conversationHistory.length} mensagens serão analisadas com sistema inteligente`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🎯 LÓGICA DE ATIVAÇÃO DO AGENTE:
    // 
    // O `ai_agent_config.isActive` (página /meu-agente-ia) é o PRINCIPAL.
    // Ele controla se o agente responde ou não.
    // 
    // O `business_agent_configs.isActive` controla apenas se usa o "modo
    // avançado" com features extras (jailbreak detection, off-topic, etc.)
    // ═══════════════════════════════════════════════════════════════════════

    if (!agentConfig || !agentConfig.isActive) {
      console.log(`\n${'!'.repeat(60)}`);
      console.log(`❌ [AI Agent] RETURN NULL #3: agentConfig não encontrado ou INATIVO`);
      console.log(`   userId: ${userId}`);
      console.log(`   agentConfig exists: ${!!agentConfig}`);
      console.log(`   agentConfig.isActive: ${agentConfig?.isActive}`);
      console.log(`${'!'.repeat(60)}\n`);
      return null;
    }
    
    console.log(`   ✅ [AI Agent] Agent ENABLED (legacy isActive=true), processing response...`);

    const triggerGate = evaluateAgentTriggerMatch({
      triggerPhrases: agentConfig.triggerPhrases,
      currentMessages: newMessageText,
      conversationHistory,
    });

    if (!triggerGate.matched) {
      const configuredTriggers = (agentConfig.triggerPhrases || []).join(", ");
      console.log(`\n${'!'.repeat(60)}`);
      console.log(`[AI Agent] RETURN NULL #4: nenhuma frase gatilho encontrada na conversa do cliente`);
      console.log(`   userId: ${userId}`);
      console.log(`   Trigger phrases configuradas: ${configuredTriggers}`);
      console.log(`   Mensagem atual: "${newMessageText.substring(0, 100)}"`);
      console.log(`   Escopo: somente mensagens recebidas do cliente nesta conversa`);
      console.log(`${'!'.repeat(60)}\n`);
      return null;
    }

    if (triggerGate.foundIn !== "no-filter") {
      console.log(
        `✅ [AI Agent] Trigger phrase detected (${triggerGate.foundIn}) for user ${userId}, proceeding with response`,
      );
    }

    let activeEstampariaProfile: EstampariaProfile | null = null;
    try {
      activeEstampariaProfile = await getEstampariaPromptContext(userId);
      if (activeEstampariaProfile) {
        console.log(`🎨 [AI Agent] Estamparia ACTIVE - opening hours treated as informational context`);
      }
    } catch (estampariaError) {
      console.error(`🎨 [AI Agent] Error preloading Estamparia config:`, estampariaError);
    }

    const openingAwareAgentConfig = getEstampariaAwareOpeningConfig(agentConfig, activeEstampariaProfile);
    const isFirstOpening = isFirstAgentOpeningOpportunity(conversationHistory);
    let openingMediaActions: MistralResponse["actions"] = [];
    const initialOpeningRule = isFirstOpening
      ? resolveAgentOpeningRule(openingAwareAgentConfig, contactName)
      : null;

    if (isFirstOpening) {
      const isGreetingOpeningEnabled = (agentConfig as any)?.greetingEnabled === true;
      const isOffHoursOpening = initialOpeningRule?.source === "off_hours";
      const openingOnlyText = initialOpeningRule
        ? await generateOpeningOnlyResponse(initialOpeningRule)
        : null;

      if (sentMedias.length === 0) {
        let openingMediaLibrary;
        if (testDependencies?.getAgentMediaLibrary) {
          openingMediaLibrary = await testDependencies.getAgentMediaLibrary(userId);
        } else {
          openingMediaLibrary = await getAgentMediaLibrary(userId);
        }

        if (openingMediaLibrary.length > 0) {
          if (isGreetingOpeningEnabled && !isOffHoursOpening) {
            const greetingOpeningFlow = findGreetingOpeningFlow(openingMediaLibrary);

            if (greetingOpeningFlow) {
              const greetingFlowActions = buildGreetingOpeningFlowActions({
                flowMedia: greetingOpeningFlow,
                openingText: openingOnlyText,
                contactName,
              });

              if (greetingFlowActions.length > 0) {
                console.log(`📁 [AI Agent] Primeira resposta - usando fluxo configurado da saudação (${greetingFlowActions.length} etapas)`);
                return {
                  text: null,
                  mediaActions: greetingFlowActions,
                  notification: undefined,
                  appointmentCreated: undefined,
                  deliveryOrderCreated: undefined,
                };
              }
            }
          }

          console.log(`📁 [AI Agent] Primeira resposta - avaliando mídia inicial via LLM`);

          const openingMediaDecision = await classifyMediaWithLLM({
            clientMessage: newMessageText,
            conversationHistory: conversationHistory.map((message) => ({
              text: message.text,
              fromMe: message.fromMe,
            })),
            mediaLibrary: openingMediaLibrary.map((media: any) => ({
              name: media.name,
              type: media.type,
              whenToUse: media.whenToUse,
              isActive: media.isActive,
            })),
            sentMedias,
            aiResponseText: openingOnlyText,
          });

          if (openingMediaDecision.shouldSend && openingMediaDecision.mediaName) {
            const openingMedia = openingMediaLibrary.find(
              (media: any) => String(media.name || "").toUpperCase() === openingMediaDecision.mediaName!.toUpperCase(),
            );

            if (openingMedia) {
              openingMediaActions = [
                {
                  type: 'send_media',
                  media_name: openingMedia.name,
                },
              ];
              console.log(`📁 [AI Agent] Mídia inicial adicionada na abertura: ${openingMedia.name}`);
            } else {
              console.log(`📁 [AI Agent] LLM escolheu mídia inicial inexistente na biblioteca: ${openingMediaDecision.mediaName}`);
            }
          } else {
            console.log(`📁 [AI Agent] Nenhuma mídia inicial selecionada para a abertura: ${openingMediaDecision.reason}`);
          }
        }
      }

      if (initialOpeningRule && shouldReturnOpeningOnlyResponse({
        openingRuleSource: initialOpeningRule.source,
        customerMessage: newMessageText,
      })) {
        console.log(`📌 [AI Agent] Primeira resposta configurada - retornando somente a abertura (${initialOpeningRule.source})`);
        return {
          text: openingOnlyText,
          mediaActions: openingMediaActions,
          notification: undefined,
          appointmentCreated: undefined,
          deliveryOrderCreated: undefined,
        };
      }

      if (initialOpeningRule) {
        console.log(`📌 [AI Agent] Primeira resposta com pergunta concreta - mantendo LLM para combinar abertura e resposta`);
      }

      if (openingMediaActions.length > 0) {
        console.log(`📌 [AI Agent] Primeira resposta com mídia inicial - mantendo fluxo normal para combinar texto da LLM`);
      }
    }

    // Price-flow enforcement (R$49)
    const priceFlowEnabled = shouldEnforcePriceFlow(newMessageText, agentConfig.prompt || "");
    const priceFlowFallback = priceFlowEnabled
      ? buildPriceFlowFallback(contactName, agentConfig.prompt || "")
      : null;
    if (priceFlowEnabled) {
      console.log(`[PRICE FLOW] Enforcement active for this lead`);
    }

    // A biblioteca precisa estar disponível antes dos caminhos de Flow Engine,
    // porque eles também finalizam resposta com ações de mídia.
    let mediaLibrary;
    if (testDependencies?.getAgentMediaLibrary) {
      mediaLibrary = await testDependencies.getAgentMediaLibrary(userId);
    } else {
      mediaLibrary = await getAgentMediaLibrary(userId);
    }
    const hasMedia = mediaLibrary.length > 0;

    if (hasMedia) {
      console.log(`📁 [AI Agent] Found ${mediaLibrary.length} media items for user ${userId}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🔀 PARTE 5 - MODO FLUXO: GUARDRAIL FORTE (produção/WhatsApp)
    // Quando flowModeActive=true, toda resposta real segue o roteiro.
    // ═══════════════════════════════════════════════════════════════════════
    const prodFlowModeActive = (agentConfig as any).flowModeActive === true;
    const prodFlowScript = (agentConfig as any).flowScript;
    const prodFlowRuntimeState =
      prodFlowModeActive && prodFlowScript && prodFlowScript.trim().length > 10
        ? await getFlowConversationState({
            userId,
            conversationId,
            flowScript: prodFlowScript,
          })
        : null;

    if (prodFlowRuntimeState?.status === "handoff") {
      console.log(`🔀 [AI Agent PROD] conversa já encaminhada para humano; desativando IA da conversa`);
      await storage.disableAgentForConversation(conversationId, null);
      return {
        text: "Vou direcionar seu atendimento para uma pessoa da equipe.",
        mediaActions: [],
      };
    }

    if (
      prodFlowModeActive &&
      prodFlowScript &&
      prodFlowScript.trim().length > 10 &&
      !prodFlowRuntimeState
    ) {
      console.log(`🔀 [AI Agent PROD] ✅ MODO FLUXO ATIVO - usando FlowScriptEngine`);
      let rawFlowResult: { response?: string; mediaActions?: MistralResponse["actions"] } | null = null;
      try {
        const { executeFlowResponse } = await import("./flowScriptEngine");
        const flowHistory = conversationHistory.slice(-10).map(msg => ({
          role: (msg.fromMe ? "assistant" : "user") as "user" | "assistant",
          content: msg.text || "",
        }));
        const flowResult = await executeFlowResponse(newMessageText, prodFlowScript, flowHistory, userId);
        rawFlowResult = flowResult;
        const groundedFlowResponse =
          (await groundRealEstateReplyForUserTurn({
            userId,
            customerMessage: newMessageText,
            responseText: flowResult.response,
            conversationHistory,
          })) || flowResult.response;
        const finalizedFlowResponse = await finalizeFlowEngineResponse({
          userId,
          agentConfig,
          customerMessage: newMessageText,
          conversationHistory,
          contactName,
          text: groundedFlowResponse,
          mediaActions: flowResult.mediaActions || [],
          mediaLibrary,
        });

        if (flowResult.finalAction) {
          await persistFlowConversationState({
            userId,
            conversationId,
            flowScript: prodFlowScript,
            finalAction: flowResult.finalAction,
            selectedFlowId: flowResult.selectedFlowId || null,
            selectedStepId: flowResult.selectedStepId || null,
            selectedBranchId: flowResult.selectedBranchId || null,
            responseText: finalizedFlowResponse.text,
            mediaActions: finalizedFlowResponse.mediaActions || [],
            conversationHistory,
          });

          if (flowResult.finalAction === "handoff") {
            await storage.disableAgentForConversation(conversationId, null);
          }
        }

        console.log(`🔀 [AI Agent FLUXO PROD] Resposta (${flowResult.response.length} chars)`);
        return {
          text: finalizedFlowResponse.text,
          mediaActions: finalizedFlowResponse.mediaActions || [],
        };
      } catch (flowErr: any) {
        console.error(`🔀 [AI Agent FLUXO PROD] Erro:`, flowErr);
        const safeFlowText = processResponsePlaceholders(
          String(rawFlowResult?.response || "").trim(),
          contactName,
        );
        if (safeFlowText) {
          console.warn(`🔀 [AI Agent FLUXO PROD] Pós-processamento falhou; enviando resposta bruta do fluxo para não quebrar atendimento.`);
          return {
            text: safeFlowText,
            mediaActions: rawFlowResult?.mediaActions || [],
          };
        }
        console.warn(`🔀 [AI Agent FLUXO PROD] Sem resposta segura do fluxo; seguindo para o processamento padrão em vez de enviar fallback genérico.`);
      }
    }

    
    // ═══════════════════════════════════════════════════════════════════════
    // 🔗 INTEGRAÇÃO COM FLOW ENGINE
    // 
    // ARQUITETURA HÍBRIDA:
    // IA INTERPRETA → FLUXO EXECUTA → IA HUMANIZA
    //
    // Quando um fluxo está definido para esse usuário, o sistema:
    // 1. IA interpreta a intenção da mensagem
    // 2. Fluxo executa ações determinísticas (não inventa)
    // 3. IA humaniza a resposta do fluxo
    //
    // Isso previne variação de respostas pois o "core" é determinístico
    // ═══════════════════════════════════════════════════════════════════════
    let bypassFlowEngine = false;
    try {
      const [deliveryEnabled, schedulingEnabled, salonEnabled, providerEnabled, clinicEnabled] = await Promise.all([
        isDeliveryEnabled(userId),
        isSchedulingEnabled(userId),
        isSalonActive(userId),
        isProviderActive(userId),
        isClinicActive(userId),
      ]);
      bypassFlowEngine = deliveryEnabled || schedulingEnabled || salonEnabled || providerEnabled || clinicEnabled;
      if (bypassFlowEngine) {
        console.log(`🚫 [AI Agent] FlowEngine ignorado (delivery/agendamento/salon ativo)`);
      }
    } catch (bypassError) {
      console.log(`⚠️ [AI Agent] Não foi possível verificar delivery/agendamento/salon:`, bypassError);
    }

    if (!bypassFlowEngine) {
      try {
        const useFlowEngine = await shouldUseFlowEngine(userId);
        if (useFlowEngine) {
          let flowInSync = true;
          try {
            const flow = await FlowStorage.loadFlow(userId);
            const currentPrompt = agentConfig?.prompt || "";
            const sourcePrompt = flow?.sourcePrompt || "";
            if (!flow || !sourcePrompt || !currentPrompt) {
              flowInSync = false;
            } else {
              const promptHash = crypto.createHash('md5').update(currentPrompt).digest('hex').substring(0, 8);
              const sourceHash = crypto.createHash('md5').update(sourcePrompt).digest('hex').substring(0, 8);
              flowInSync = promptHash == sourceHash;
              if (!flowInSync) {
                console.log(`?? [Flow Engine] Flow desatualizado (promptHash=${promptHash} sourceHash=${sourceHash}) - usando sistema legado`);
                console.log(`?? [Flow Engine] sourcePrompt len=${sourcePrompt.length}, prompt len=${currentPrompt.length}`);
              }
            }
          } catch (flowSyncError) {
            flowInSync = false;
            console.log(`?? [Flow Engine] Falha ao validar sync do flow - usando sistema legado`, flowSyncError);
          }

          if (!flowInSync) {
            // Flow fora de sync com o prompt atual - seguir com IA livre
          } else {
            console.log(`\n🔗 [AI Agent] Detectado FlowEngine ativo - usando arquitetura IA+Fluxo`);
            console.log(`   → IA INTERPRETA a intenção`);
            console.log(`   → FLUXO EXECUTA ações determinísticas`);
            console.log(`   → IA HUMANIZA a resposta\n`);
            
            // 🔧 CORREÇÃO: Obter API key do provider configurado (OpenRouter/Groq/Mistral)
            const llmConfig = await getLLMConfig(userId);
            const apiKey = llmConfig.provider === 'openrouter' 
              ? llmConfig.openrouterApiKey 
              : llmConfig.provider === 'groq' 
                ? llmConfig.groqApiKey 
                : (llmConfig.mistralApiKey || process.env.MISTRAL_API_KEY || '');
                
            if (!apiKey) {
              console.log(`⚠️ [Flow Engine] Sem API key para provider ${llmConfig.provider}, usando sistema legado`);
            } else {
              const flowResult = await processWithFlowEngine(
                userId,
                conversationId,
                newMessageText,
                apiKey,
                {
                  contactName,
                  history: conversationHistory.map(m => ({ 
                    fromMe: m.fromMe, 
                    text: m.text || '' 
                  }))
                }
              );
              
              if (flowResult) {
                const groundedFlowText =
                  (await groundRealEstateReplyForUserTurn({
                    userId,
                    customerMessage: newMessageText,
                    responseText: flowResult.text,
                    conversationHistory,
                  })) || flowResult.text;
                const finalizedFlowResult = await finalizeFlowEngineResponse({
                  userId,
                  agentConfig,
                  customerMessage: newMessageText,
                  conversationHistory,
                  contactName,
                  text: groundedFlowText,
                  mediaActions: flowResult.mediaActions || [],
                  mediaLibrary,
                });
                console.log(`✅ [Flow Engine] Resposta gerada com sucesso`);
                return {
                  text: finalizedFlowResult.text,
                  mediaActions: finalizedFlowResult.mediaActions,
                  notification: undefined,
                  appointmentCreated: undefined,
                  deliveryOrderCreated: undefined
                };
              } else {
                console.log(`⚠️ [Flow Engine] Sem resposta, usando sistema legado`);
              }
            }
          }
        }
      } catch (flowError) {
        console.error(`⚠️ [Flow Engine] Erro:`, flowError);
        // Continua com sistema legado
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // 🍕 INTERCEPTAÇÃO DE DELIVERY - NOVO SISTEMA DETERMINÍSTICO (2025)
    // 
    // SE o delivery está ativo e a intenção do cliente é ver o cardápio,
    // retornamos os dados DIRETAMENTE do banco, sem chamar a IA.
    // Isso resolve os problemas:
    // - IA ignorando [ENVIAR_CARDAPIO_COMPLETO]
    // - IA inventando preços/produtos
    // - Cardápio incompleto (3 itens vs 36)
    // ═══════════════════════════════════════════════════════════════════════
    // 🍕 NOVO SISTEMA DE DELIVERY (SEMPRE TENTA PROCESSAR SE ATIVO)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      console.log(`🍕 [AI Agent] Tentando processar com sistema de delivery...`);
      
      const deliveryResponse = await processDeliveryMessage(
        userId,
        newMessageText,
        conversationHistory?.filter(m => m.text !== null).map(m => ({ fromMe: m.fromMe, text: m.text as string })),
        options?.contactPhone,
        options?.conversationId
      );
      
      if (deliveryResponse && (deliveryResponse.bubbles.length > 0 || (deliveryResponse.mediaActions?.length ?? 0) > 0)) {
        console.log(`🍕 [AI Agent] ✅ Sistema de delivery retornou ${deliveryResponse.bubbles.length} bolha(s)`);
        console.log(`🍕 [AI Agent] Intent: ${deliveryResponse.intent}`);
        
        // Combinar bolhas em uma resposta (o sistema de envio vai dividir)
        const combinedResponse = deliveryResponse.bubbles.join('\n\n');
        
        // Log da resposta para debug
        console.log(`🍕 [AI Agent] Preview: ${combinedResponse.substring(0, 200)}...`);
        console.log(`🍕 [AI Agent] Total chars: ${combinedResponse.length}`);
        
        let mediaActions: MistralResponse['actions'] = deliveryResponse.mediaActions || [];
        // V23e: Delivery já decide suas próprias mídias via processDeliveryMessage.
        // Não forçar mídia adicional via forceMediaDetection.

        return {
          text: combinedResponse,
          mediaActions,
          notification: undefined,
          appointmentCreated: undefined,
          deliveryOrderCreated: deliveryResponse.deliveryOrderCreated,
        };
      } else {
        console.log(`🍕 [AI Agent] Delivery não ativo ou sem resposta - continuando fluxo normal`);
      }
    } catch (deliveryError) {
      console.error(`🍕 [AI Agent] Erro no sistema de delivery:`, deliveryError);
      console.log(`🍕 [AI Agent] Continuando com fluxo normal...`);
    }
    // ═══════════════════════════════════════════════════════════════════════
    
    // ═══════════════════════════════════════════════════════════════════════
    // 💇 SISTEMA DE SALÃO DE BELEZA - AGENDAMENTOS
    // Similar ao delivery, mas para salões de beleza
    // ═══════════════════════════════════════════════════════════════════════
    try {
      console.log(`💇 [AI Agent] Tentando processar com sistema de salão...`);
      
      const salonResponse = await generateSalonResponse(
        userId,
        options?.conversationId || '',
        options?.contactPhone || '',
        newMessageText,
        conversationHistory?.filter(m => m.text !== null).map(m => ({ fromMe: m.fromMe, text: m.text as string }))
      );
      
      if (salonResponse && salonResponse.text) {
        console.log(`💇 [AI Agent] ✅ Sistema de salão retornou resposta`);
        console.log(`💇 [AI Agent] Preview: ${salonResponse.text.substring(0, 150)}...`);
        
        return {
          text: salonResponse.text,
          mediaActions: [],
          notification: undefined,
          appointmentCreated: salonResponse.shouldSave ? true : undefined,
          deliveryOrderCreated: undefined,
        };
      } else {
        console.log(`💇 [AI Agent] Salão não ativo ou sem resposta - continuando fluxo normal`);
      }
    } catch (salonError) {
      console.error(`💇 [AI Agent] Erro no sistema de salão:`, salonError);
      console.log(`💇 [AI Agent] Continuando com fluxo normal...`);
    }
    // ═══════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════
    // 🔧 SISTEMA DE PRESTADOR DE SERVIÇO - AGENDAMENTOS
    // ═══════════════════════════════════════════════════════════════════════
    try {
      console.log(`🔧 [AI Agent] Tentando processar com sistema de prestador...`);

      const providerResponse = await generateProviderResponse(
        userId,
        options?.conversationId || "",
        options?.contactPhone || "",
        newMessageText,
        conversationHistory?.filter((m) => m.text !== null).map((m) => ({ fromMe: m.fromMe, text: m.text as string })),
      );

      if (providerResponse?.text) {
        return {
          text: providerResponse.text,
          mediaActions: [],
          notification: undefined,
          appointmentCreated: providerResponse.shouldSave ? true : undefined,
          deliveryOrderCreated: undefined,
        };
      }
    } catch (providerError) {
      console.error(`🔧 [AI Agent] Erro no sistema de prestador:`, providerError);
    }
    // ═══════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════
    // 🏥 SISTEMA DE CLINICA - AGENDAMENTOS
    // ═══════════════════════════════════════════════════════════════════════
    try {
      console.log(`🏥 [AI Agent] Tentando processar com sistema de clinica...`);

      const clinicResponse = await generateClinicResponse(
        userId,
        options?.conversationId || "",
        options?.contactPhone || "",
        newMessageText,
        conversationHistory?.filter((m) => m.text !== null).map((m) => ({ fromMe: m.fromMe, text: m.text as string })),
      );

      if (clinicResponse?.text) {
        return {
          text: clinicResponse.text,
          mediaActions: [],
          notification: undefined,
          appointmentCreated: clinicResponse.shouldSave ? true : undefined,
          deliveryOrderCreated: undefined,
        };
      }
    } catch (clinicError) {
      console.error(`🏥 [AI Agent] Erro no sistema de clinica:`, clinicError);
    }
    // ═══════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════
    // 📅 SISTEMA CONVERSACIONAL DE AGENDAMENTO - OPENCLAW STYLE
    // Motor novo inspirado no salão, sem mexer no módulo do salão.
    // ═══════════════════════════════════════════════════════════════════════
    try {
      console.log(`📅 [AI Agent] Tentando processar com motor conversacional de agendamento...`);

      const schedulingAiResponse = await generateSchedulingAiResponse(
        userId,
        options?.conversationId || "",
        options?.contactPhone || "",
        newMessageText,
        conversationHistory?.filter((message) => message.text !== null).map((message) => ({
          fromMe: message.fromMe,
          text: message.text as string,
        })),
      );

      if (schedulingAiResponse?.text) {
        console.log(`📅 [AI Agent] ✅ Motor conversacional de agendamento retornou resposta`);
        return {
          text: schedulingAiResponse.text,
          mediaActions: [],
          notification: undefined,
          appointmentCreated: schedulingAiResponse.appointmentCreated,
          deliveryOrderCreated: undefined,
        };
      }

      console.log(`📅 [AI Agent] Motor conversacional de agendamento não assumiu o turno - continuando fluxo legado`);
    } catch (schedulingAiError) {
      console.error(`📅 [AI Agent] Erro no motor conversacional de agendamento:`, schedulingAiError);
      console.log(`📅 [AI Agent] Continuando com fluxo legado de agendamento...`);
    }
    // ═══════════════════════════════════════════════════════════════════════

    // 📅 HUMANIZAÇÃO: mensagens de agendamento sem tags de booking passam pelo LLM
    let schedulingReplyForHumanization: string | null = null;
    let schedulingReplyCategory: SchedulingHumanizationCategory = 'OTHER';
    let schedulingDirectReply: string | null = null;
    let schedulingDisambiguationFallbackReply: string | null = null;
    let schedulingBookingResult: { appointmentCreated?: any } = {};

    try {
      if (contactPhone && newMessageText) {
        const deterministicSchedulingReply = await generateDeterministicSchedulingReply(
          userId,
          contactPhone,
          newMessageText,
          conversationHistory.map((message) => ({
            text: message.text,
            fromMe: message.fromMe,
          })),
        );

        if (deterministicSchedulingReply) {
          const isBookingAction = deterministicSchedulingReply.includes('[AGENDAR:') || deterministicSchedulingReply.includes('[CANCELAR:');

          if (isBookingAction) {
            // Processar tags no banco (criar/cancelar agendamento) e depois humanizar o texto
            let processedDeterministicReply = deterministicSchedulingReply;
            let appointmentCreated: any = undefined;

            if (options?.contactPhone) {
              const schedulingResult = await processSchedulingTags(
                processedDeterministicReply,
                userId,
                options.contactPhone,
                options.conversationId,
              );
              processedDeterministicReply = schedulingResult.text;
              if (schedulingResult.appointmentCreated) {
                appointmentCreated = schedulingResult.appointmentCreated;
              }

              const cancelResult = await processSchedulingCancelTags(
                processedDeterministicReply,
                userId,
                options.contactPhone,
              );
              processedDeterministicReply = cancelResult.text;
            }

            // Limpar estado de agendamento após booking/cancel processado com sucesso
            if (options?.contactPhone) {
              clearSchedulingConversationState(userId, options.contactPhone);
              console.log(`📅 [AI Agent] Estado de agendamento limpo após booking/cancel`);
            }

            // Guardar resultado do booking para retornar junto com a resposta humanizada
            schedulingBookingResult = { appointmentCreated };

            // Passar o texto já processado (sem tags) pelo LLM para humanizar
            schedulingReplyForHumanization = processedDeterministicReply.trim();

            if (deterministicSchedulingReply.includes('[CANCELAR:')) {
              schedulingReplyCategory = 'CANCELLATION';
            } else {
              schedulingReplyCategory = 'BOOKING_CONFIRMATION';
            }

            console.log(`📅 [AI Agent] Booking/cancel processado no banco — texto será humanizado pelo LLM (categoria: ${schedulingReplyCategory})`);
          } else {
            // Mensagens não-booking (orçamento, horários, pedido de nome/endereço):
            // Passar pelo LLM para humanizar com a personalidade do negócio
            schedulingReplyCategory = classifySchedulingHumanizationCategory(
              deterministicSchedulingReply,
            );

            if (schedulingReplyCategory === 'DISAMBIGUATION') {
              schedulingDisambiguationFallbackReply = buildDeterministicSchedulingDisambiguationChatReply(
                deterministicSchedulingReply,
                agentConfig.prompt || "",
              );
              schedulingReplyForHumanization = deterministicSchedulingReply;
              schedulingDirectReply = null;
              console.log(`📅 [AI Agent] Desambiguação de agenda será humanizada seguindo o prompt do cliente, com fallback seguro do catálogo`);
            } else {
              schedulingReplyForHumanization = deterministicSchedulingReply;
            }

            console.log(`📅 [AI Agent] Resposta de agendamento será tratada (${deterministicSchedulingReply.length} chars, categoria: ${schedulingReplyCategory})`);
          }
        }
      }
    } catch (deterministicSchedulingError) {
      console.error(`📅 [AI Agent] Erro ao aplicar resposta determinística de agenda:`, deterministicSchedulingError);
    }
    
    // 🎯 SISTEMA ÚNICO: SEMPRE USA O SISTEMA LEGACY (DETERMINÍSTICO)
    // O sistema ADVANCED foi removido pois causava variação nas respostas
    // devido ao tamanho do prompt (15000+ chars) que prejudica determinismo da Mistral
    const useAdvancedSystem = false; // FORÇADO FALSE - LEGACY APENAS
    
    console.log(`📝 [AI Agent] Using LEGACY system (deterministic) for user ${userId}`);

    // 📝 DEBUG: Log do config do agente para verificar se prompt está correto
    console.log(`\n🤖 [AI Agent] ═══════════════════════════════════════════════════`);
    console.log(`🤖 [AI Agent] Config para user ${userId} respondendo cliente:`);
    console.log(`   Model (legacy, ignorado): ${agentConfig.model} → real: system_config.openrouter_model`);
    console.log(`   Active: ${agentConfig.isActive}`);
    console.log(`   Trigger phrases: ${agentConfig.triggerPhrases?.length || 0}`);
    console.log(`   Prompt length: ${agentConfig.prompt?.length || 0} chars`);
    console.log(`   Prompt (primeiros 150 chars): ${agentConfig.prompt?.substring(0, 150) || 'N/A'}...`);
    console.log(`   Prompt (MD5 para debug): ${crypto.createHash('md5').update(agentConfig.prompt || '').digest('hex').substring(0, 8)}`);
    console.log(`🤖 [AI Agent] ═══════════════════════════════════════════════════\n`);

    // NOTA: Detecção de jailbreak foi removida (era apenas para sistema ADVANCED)

    // NOTA: Detecção Off-Topic foi removida (era apenas para sistema ADVANCED)

     // 🎨 GERAR SYSTEM PROMPT (LEGACY APENAS)
     let systemPrompt: string;
     
     // 📁 GERAR BLOCO DE MÍDIAS SE DISPONÍVEL
     const mediaPromptBlock = hasMedia ? generateMediaPromptBlock(mediaLibrary) : '';
     
     // 🌅 GERAR BLOCO DE CONTEXTO DINÂMICO (NOME, HORÁRIO, MÍDIAS JÁ ENVIADAS)
     const dynamicContextBlock = generateDynamicContextBlock(contactName, sentMedias, conversationHistory);
     
     // 🧠 SISTEMA ANTI-AMNÉSIA GLOBAL (para TODOS os clientes)
     const conversationMemory = analyzeConversationHistory(conversationHistory, contactName);
     const memoryContextBlock = generateMemoryContextBlock(conversationMemory, contactName);
     console.log(`🧠 [AI Agent] Memory analysis: greeted=${conversationMemory.hasGreeted}, pendingActions=${conversationMemory.pendingActions.length}, sentMedia=${conversationMemory.hasSentMedia.length}`);
     
     // �️ BLINDAGEM UNIVERSAL V3 - Sistema de hardening de prompts
     // Analisa o prompt do usuário para extrair contexto e gerar blindagem personalizada
     const promptAnalysis = analyzeUserPrompt(agentConfig.prompt);
     const preBlindagem = generatePreBlindagem(promptAnalysis); // NOVA: Vai no INÍCIO do prompt
     const blindagemUniversal = generateUniversalBlindagem(promptAnalysis);
     const nomeNegocio = promptAnalysis.businessName;
     
     console.log(`🛡️ [Blindagem V3] Análise do prompt: negócio="${nomeNegocio}", tipo="${promptAnalysis.businessType}"`);
     
     systemPrompt = preBlindagem + agentConfig.prompt + `

  ---
  
  ${dynamicContextBlock}
  
  ${blindagemUniversal}
  
  ═══════════════════════════════════════════════════════════════════════════════════
  📋 REGRAS ESPECÍFICAS DO SISTEMA (COMPLEMENTARES)
  ═══════════════════════════════════════════════════════════════════════════════════

  🎤 REGRA SOBRE ÁUDIOS:
  - Você ENTENDE mensagens de voz (são transcritas automaticamente)
  - NUNCA diga "não consigo ouvir áudios" - PROIBIDO
  - Se não transcreveu: "Desculpa, não entendi bem. Pode repetir?"

  🖼️ REGRA SOBRE IMAGENS:
  - Você VÊ imagens (são analisadas automaticamente)
  - Use a descrição fornecida "(Cliente enviou imagem: ...)"
  - NUNCA diga "não consigo ver imagens" - PROIBIDO

  📋 REGRA DE FORMATAÇÃO VERBATIM:
  - Se o prompt diz "envie EXATAMENTE" → COPIE LITERALMENTE
  - PRESERVE quebras de linha, * (negrito), _ (itálico), emojis

  📱 REGRA UNIVERSAL DE FORMATO WHATSAPP:
  - Para negrito no WhatsApp use exatamente um asterisco antes e um depois: *texto*
  - Nunca use markdown com dois asteriscos como **texto**
  - Se a assinatura do agente estiver ativa, NAO escreva o nome do agente no inicio da resposta
  - Nao comece com "Nome:", "*Nome:*" ou o nome configurado do agente; o sistema adiciona a assinatura automaticamente

  🍕 REGRA PARA CARDÁPIO/MENU:
  - Quando pedirem cardápio/menu/lista de produtos:
    → USE A TAG: [ENVIAR_CARDAPIO_COMPLETO]
    → NUNCA liste produtos manualmente
    → Exemplo: "[ENVIAR_CARDAPIO_COMPLETO]\\n\\nAqui está! 😊 O que vai querer?"

  💬 ESTILO DE COMUNICAÇÃO - MENSAGENS CURTAS E NATURAIS:
  - Responda SEMPRE de forma BREVE: no máximo 2-3 frases por bloco.
  - Fale como uma pessoa real no WhatsApp: direto, casual, sem textão.
  - SO use [BOLHA] quando a resposta TOTAL ultrapassar 400 caracteres. Se a resposta inteira couber em 400 chars, NAO use [BOLHA].
  - A regra de links abaixo tem prioridade sobre textos prontos/exatos que contenham URL: preserve o conteudo, mas ajuste a separacao da URL com [BOLHA].
  - EXCECAO OBRIGATORIA PARA LINKS: se a resposta realmente precisar conter uma URL/link que exista no prompt, historico ou contexto, coloque o texto explicativo em uma bolha sem URL, depois use [BOLHA] e envie a URL sozinha na bolha seguinte.
  - Nunca invente link e nunca force link quando o cliente/prompt nao pediu nem trouxe um link aplicavel.
  - A bolha do link deve conter somente a URL, sem chamada, pontuacao, emoji ou outro texto, para o WhatsApp gerar preview limpo.
  - Quando enviar link, encerre a resposta no link. Nao continue com pergunta, CTA ou complemento depois da URL.
  - Se precisar continuar depois do link, use outra [BOLHA] apos a URL: "Texto antes[BOLHA]https://exemplo.com[BOLHA]Pergunta final".
  - Nunca escreva pergunta, CTA ou complemento na mesma bolha da URL.
  - Quando precisar dividir, cada bolha deve ter NO MAXIMO 400 caracteres.
  - Máximo 2-3 blocos separados por [BOLHA]. Nao fragmente demais.
  - Exemplo SEM bolha (curto): "Olá! Tudo bem? Aqui é o João da Bicicletaria! Como posso te ajudar?"
  - Exemplo COM bolha (longo): "Temos vários modelos de bicicleta disponíveis, desde urbanas até mountain bike. Todas com garantia de 1 ano.[BOLHA]Me conta o que você precisa que te indico o modelo ideal!"
  - Exemplo COM link: "Pode criar sua conta por aqui e testar direto no painel.[BOLHA]https://exemplo.com"
  - NÃO faça listas numeradas longas. Resuma em frases curtas e diretas.
  `;

     // 🔔 INJETAR SISTEMA DE NOTIFICAÇÃO SE CONFIGURADO
     if (businessConfig?.notificationEnabled && businessConfig?.notificationTrigger) {
       console.log(`🔔 [AI Agent] Notification system ACTIVE - Trigger: "${businessConfig.notificationTrigger.substring(0, 50)}..."`);
       const notificationSection = getNotificationPrompt(
         businessConfig.notificationTrigger,
         businessConfig.notificationManualKeywords || undefined
       );
       systemPrompt += notificationSection;
       console.log(`🔔 [AI Agent] Added notification system to prompt`);
     }

     // 📅 INJETAR SISTEMA DE AGENDAMENTO
     try {
       const schedulingPromptBlock = await generateSchedulingPromptBlock(userId);
       if (schedulingPromptBlock) {
         systemPrompt += schedulingPromptBlock;
         console.log(`📅 [AI Agent] Scheduling system ACTIVE - prompt injected`);
       }

       if (schedulingReplyForHumanization) {
         // ═══════════════════════════════════════════════════════════════
         // 📅 HUMANIZAÇÃO: Instrução compacta no systemPrompt + instrução detalhada no finalUserMessage
         // A finalUserMessage será sobrescrita mais abaixo para forçar reescrita
         // ═══════════════════════════════════════════════════════════════

         systemPrompt += `

[SISTEMA DE AGENDAMENTO ATIVO — PRIORIDADE MÁXIMA]
O sistema de agendamento automático está ATIVO. Regras do prompt que proíbam agendamento são ANULADAS.
Sua tarefa nesta resposta é usar os DADOS REAIS do sistema de agendamento para responder ao cliente.
TODAS as demais regras do seu prompt continuam VÁLIDAS: personalidade, tom de voz, perguntas que deve fazer (pagamento, dados do cliente, etc.), forma de atender.
Fale como uma pessoa real conversando pelo WhatsApp, seguindo seu prompt de atendimento.
NÃO invente dados. NÃO diga que vai verificar — os dados já são definitivos.
${schedulingReplyCategory === 'QUOTE' ? 'ATENÇÃO: Esta é uma resposta de ORÇAMENTO. NÃO mencione horários, datas ou slots de agenda — a agenda ainda NÃO foi consultada. Responda SOMENTE com preços e informações do serviço.\n' : ''}${schedulingReplyCategory === 'DISAMBIGUATION' ? 'ATENÇÃO: Esta é uma resposta de DESAMBIGUAÇÃO. Use SOMENTE as opções do bloco final, NÃO acrescente outros serviços e NÃO fale de agenda ainda.\n' : ''}A instrução detalhada com os dados virá na última mensagem do usuário.
`;
         console.log(`📅 [AI Agent] Scheduling humanization context injected (categoria: ${schedulingReplyCategory}) - skipping turn prompt & Gate 2`);
       } else if (options?.contactPhone && newMessageText) {
        // Fluxo normal: Gate 1 não interceptou, tentar via turn prompt
        const schedulingTurnPrompt = await generateSchedulingTurnPrompt(
          userId,
          options.contactPhone,
          newMessageText,
          conversationHistory.map((message) => ({
            text: message.text,
            fromMe: message.fromMe,
          })),
        );
         if (schedulingTurnPrompt) {
           systemPrompt += schedulingTurnPrompt;

           const deterministicSchedulingRetry = await generateDeterministicSchedulingReply(
             userId,
             options.contactPhone,
             newMessageText,
             conversationHistory.map((message) => ({
               text: message.text,
               fromMe: message.fromMe,
             })),
           );

           if (deterministicSchedulingRetry) {
             const isRetryBookingAction = deterministicSchedulingRetry.includes('[AGENDAR:') || deterministicSchedulingRetry.includes('[CANCELAR:');
             if (isRetryBookingAction) {
               // Booking/cancel: processar tags no banco e depois humanizar
               let processedRetryReply = deterministicSchedulingRetry;
               let retryAppointmentCreated: any = undefined;

               const schedulingResult = await processSchedulingTags(
                 processedRetryReply,
                 userId,
                 options.contactPhone,
                 options.conversationId,
               );
               processedRetryReply = schedulingResult.text;
               if (schedulingResult.appointmentCreated) {
                 retryAppointmentCreated = schedulingResult.appointmentCreated;
               }

               const cancelResult = await processSchedulingCancelTags(
                 processedRetryReply,
                 userId,
                 options.contactPhone,
               );
               processedRetryReply = cancelResult.text;

               // Guardar booking result e humanizar pelo LLM
               schedulingBookingResult = { appointmentCreated: retryAppointmentCreated };
               schedulingReplyForHumanization = processedRetryReply.trim();

               if (deterministicSchedulingRetry.includes('[CANCELAR:')) {
                 schedulingReplyCategory = 'CANCELLATION';
               } else {
                 schedulingReplyCategory = 'BOOKING_CONFIRMATION';
               }

               console.log(`📅 [AI Agent] Gate 2 booking/cancel processado — texto será humanizado pelo LLM (categoria: ${schedulingReplyCategory})`);
             } else {
               // Non-booking: o turn prompt já injetou contexto, LLM vai humanizar
               schedulingReplyCategory = classifySchedulingHumanizationCategory(
                 deterministicSchedulingRetry,
               );

               if (schedulingReplyCategory === 'DISAMBIGUATION') {
                 schedulingDisambiguationFallbackReply = buildDeterministicSchedulingDisambiguationChatReply(
                   deterministicSchedulingRetry,
                   agentConfig.prompt || "",
                 );
                 schedulingReplyForHumanization = deterministicSchedulingRetry;
                 schedulingDirectReply = null;
                 console.log(`📅 [AI Agent] Gate 2 vai humanizar a desambiguação seguindo o prompt do cliente, com fallback seguro do catálogo`);
               } else {
                 schedulingReplyForHumanization = deterministicSchedulingRetry;
               }

               console.log(`📅 [AI Agent] Gate 2: scheduling reply será tratada (categoria: ${schedulingReplyCategory})`);
             }
           }
         }
       }
     } catch (schedError) {
       console.error(`📅 [AI Agent] Error loading scheduling config:`, schedError);
     }

     let productsData: ProductsForAIResponse | null = null;

     // 📦 INJETAR CATÁLOGO DE PRODUTOS (se ativo)
     try {
       productsData = await getProductsForAI(userId);
       if (productsData && productsData.active && productsData.count > 0) {
         const productsPromptBlock = generateProductsPromptBlock(productsData);
         systemPrompt += '\n\n' + productsPromptBlock;
         const exactVariationGroundingBlock = generateExactCatalogVariationGroundingBlock(
           productsData,
           newMessageText,
           conversationHistory,
         );
         if (exactVariationGroundingBlock) {
           systemPrompt += '\n\n' + exactVariationGroundingBlock;
         }
         console.log(`📦 [AI Agent] Products catalog ACTIVE - ${productsData.count} products injected into prompt`);
       }
     } catch (prodError) {
       console.error(`📦 [AI Agent] Error loading products:`, prodError);
     }

      let realEstateCatalog: RealEstateCatalogForAI | null = null;

      // 🏠 INJETAR CATALOGO IMOBILIARIO (se ativo)
      try {
        const realEstateConversationContext = buildRealEstateConversationContext(conversationHistory);
        realEstateCatalog = await getGrupoOlxCatalogForAI(userId, newMessageText || "", {
          conversationHistory: realEstateConversationContext,
        });
        if (
          realEstateCatalog &&
          realEstateCatalog.active &&
          (
            realEstateCatalog.retrievedCount > 0 ||
            (realEstateCatalog.inventoryListings?.length || 0) > 0 ||
            realEstateCatalog.specialInstructions.length > 0
          )
        ) {
          const realEstatePromptBlock = generateGrupoOlxCatalogPromptBlock(realEstateCatalog);
          const specialRealEstateRules = [
            "Se nao houver valor confirmado no catalogo ou no historico, nao cite preco.",
            ...realEstateCatalog.specialInstructions,
          ];
          if (realEstatePromptBlock) {
            systemPrompt += "\n\n" + realEstatePromptBlock;
          }
          if (specialRealEstateRules.length > 0) {
            systemPrompt +=
              "\n\nREGRAS EXTRAS DA IMOBILIARIA:\n" +
              specialRealEstateRules.map((rule, index) => `${index + 1}. ${rule}`).join("\n");
          }
         console.log(
           `🏠 [AI Agent] Real estate catalog ACTIVE - ${realEstateCatalog.retrievedCount}/${realEstateCatalog.totalCount} listings injected into prompt`,
         );
       }
     } catch (realEstateError) {
       console.error("🏠 [AI Agent] Error loading real estate catalog:", realEstateError);
     }

     const shouldIdentifyRealEstatePropertyFirst = Boolean(
       realEstateCatalog?.active && realEstateCatalog.requiresPropertyIdentificationFirst,
     );

     // 🍕 INJETAR CARDÁPIO DE DELIVERY (se ativo)
     try {
       const deliveryData = await getDeliveryMenuForAI(userId);
       if (deliveryData && deliveryData.active && deliveryData.total_items > 0) {
         const deliveryPromptBlock = generateDeliveryPromptBlock(deliveryData);
         systemPrompt += '\n\n' + deliveryPromptBlock;
         console.log(`🍕 [AI Agent] Delivery menu ACTIVE - ${deliveryData.total_items} items injected into prompt`);
       }
     } catch (deliveryError) {
       console.error(`🍕 [AI Agent] Error loading delivery menu:`, deliveryError);
     }

     // 📚 INJETAR CONTEXTO DE CURSO/INFOPRODUTO (se ativo)
     try {
       const courseData = await getCourseConfigForAI(userId);
       if (courseData && courseData.active) {
         const coursePromptBlock = generateCoursePromptBlock(courseData);
         systemPrompt += '\n\n' + coursePromptBlock;
         console.log(`📚 [AI Agent] Course config ACTIVE - ${courseData.course_name} injected into prompt`);
       }
     } catch (courseError) {
       console.error(`📚 [AI Agent] Error loading course config:`, courseError);
     }

     try {
       const estampariaProfile = activeEstampariaProfile;
       if (estampariaProfile) {
         const estampariaPromptBlock = generateEstampariaPromptBlock(estampariaProfile);
         systemPrompt += "\n\n" + estampariaPromptBlock;
         console.log(`🎨 [AI Agent] Estamparia ACTIVE - prompt block injected`);
       }
     } catch (estampariaError) {
       console.error(`🎨 [AI Agent] Error loading Estamparia config:`, estampariaError);
     }

     try {
       const agendamento2Data = await getAgendamento2PromptContext(userId);
       if (agendamento2Data) {
         const agendamento2PromptBlock = generateAgendamento2PromptBlock(agendamento2Data);
         systemPrompt += "\n\n" + agendamento2PromptBlock;
         console.log(`📅 [AI Agent] Agendamento 2.0 ACTIVE - prompt block injected`);
       }
     } catch (agendamento2Error) {
       console.error(`📅 [AI Agent] Error loading Agendamento 2.0 config:`, agendamento2Error);
     }

     // 🧠 ADICIONAR SISTEMA ANTI-AMNÉSIA
     systemPrompt += memoryContextBlock;
     
     // 📁 ADICIONAR BLOCO DE MÍDIAS AO PROMPT (PRIORIDADE MÁXIMA - DEVE SER O ÚLTIMO ANTES DAS MENSAGENS)
     // Motivo: Instruções de mídia precisam estar "frescas" na memória do modelo
     // Se ficarem no meio do prompt, são diluídas por outras regras
     if (mediaPromptBlock) {
       systemPrompt += '\n\n' + mediaPromptBlock;
       console.log(`📁 [AI Agent] Added media block to prompt (${mediaPromptBlock.length} chars) - POSITIONED AT END FOR MAXIMUM PRIORITY`);
     }

     const routingDecisionPromptBlock = await buildRoutingDecisionPromptBlock({
       userId,
       conversationId: options?.conversationId,
     });
     if (routingDecisionPromptBlock) {
       systemPrompt += "\n\n" + routingDecisionPromptBlock;
     }

     systemPrompt += `

═══════════════════════════════════════════════════════════════════════════════
FILA DE ATENCAO HUMANA

Pergunta central:
"Se o dono da operacao pudesse olhar so algumas conversas agora, essa deveria entrar primeiro?"

Regras:
- Decida pela conversa inteira e pelo contexto do agente.
- Nao use regras fixas de nicho, segmento ou scoring comercial rigido.
- Prioridade e sobre atencao humana util agora, nao so venda.
- Use "critica", "alta", "media", "baixa" ou null.
- Marque needsHumanAttention=true quando uma acao humana rapida fizer diferenca relevante.
- Motivos validos incluem: intencao forte precisando fechamento humano, correcao necessaria, duvida sensivel, conversa travada/confusa, risco de perda, decisao importante, urgencia operacional.
- Se nao houver motivo real para subir na fila, use needsHumanAttention=false e priority=null.
- confidence deve ser um numero entre 0 e 1.
- reason deve ser curta, objetiva e operacional.

Formato OBRIGATORIO da saida final:
<assistant_response>
mensagem final para o cliente, incluindo quaisquer tags operacionais ja usadas pelo sistema
</assistant_response>
<attention_json>
{"priority":"alta","needsHumanAttention":true,"reason":"Cliente pronto para fechamento humano.","confidence":0.91}
</attention_json>
<routing_json>
{"mode":"keep_current","targetSectorId":null,"confidence":0.08,"intent":"keep_current","reason":"A conversa pode seguir no fluxo atual."}
</routing_json>

Nao escreva nada fora desses tres blocos.
═══════════════════════════════════════════════════════════════════════════════
`;

     console.log(`📝 [AI Agent] Using LEGACY prompt (${systemPrompt.length} chars) - DETERMINISTIC MODE`);

    const infoPriorityBlock = buildAgentInfoPriorityBlock(openingAwareAgentConfig, contactName);
    if (infoPriorityBlock) {
      systemPrompt = `${infoPriorityBlock}\n${systemPrompt}`;
      console.log(`📌 [AI Agent] Bloco Info prependido ao prompt principal`);
    }

    const openingRuleForCurrentTurn = isFirstAgentOpeningOpportunity(conversationHistory)
      ? resolveAgentOpeningRule(openingAwareAgentConfig, contactName)
      : null;

     const messages: Array<{ role: string; content: string }> = [
      {
        role: "system",
        content: systemPrompt,
      },
     ];

    // ═══════════════════════════════════════════════════════════════════════
    // 🎯 DETECTAR PEDIDO DE FORMATAÇÃO DO CLIENTE (linha por linha, compacto, etc)
    // ═══════════════════════════════════════════════════════════════════════
    const formattingRequest = detectFormattingRequest(conversationHistory, newMessageText);
    if (formattingRequest.detected) {
      const formattingInstruction = generateFormattingInstruction(formattingRequest);
      messages.push({
        role: "system",
        content: formattingInstruction,
      });
      console.log(`🎯 [AI Agent] Instrução de formatação "${formattingRequest.type}" injetada no prompt`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🚨 DETECTAR PEDIDO DE LISTA/CARDÁPIO/CATEGORIAS - FORÇAR RESPOSTA COMPLETA
    // Esta é uma mensagem de SYSTEM separada para ter MÁXIMA PRIORIDADE
    // 📜 INSTRUÇÃO ESPECIAL QUANDO MODO HISTÓRICO ESTÁ ATIVO
    // Ajuda a IA a entender que deve analisar o contexto completo da conversa
    if (isHistoryModeActive && conversationHistory.length > 0) {
      // Verificar se a IA j? respondeu antes
      const hasAgentResponded = conversationHistory.some(m => m.isFromAgent);
      const hasOwnerMessages = conversationHistory.some(m => m.fromMe && !m.isFromAgent);
      const clientMessagesCount = conversationHistory.filter(m => !m.fromMe).length;
      const hasPriorContext = hasAgentResponded || hasOwnerMessages || clientMessagesCount > 1;

      if (hasPriorContext) {
        const historyContext = hasAgentResponded 
          ? `
[?? CONTEXTO DE HIST?RICO ATIVO]

Esta conversa tem hist?rico ativo. Voc? j? interagiu com este cliente antes.
ANALISE o hist?rico completo para manter consist?ncia e continuidade.
N?O repita informa??es j? fornecidas. Continue de onde parou.
`
          : `
[?? CONTEXTO IMPORTANTE - ASSUMINDO ATENDIMENTO]

Voc? est? ASSUMINDO o atendimento de um cliente que J? CONVERSOU anteriormente.
O hist?rico abaixo mostra todas as intera??es anteriores (possivelmente com humano).

INSTRU??ES CR?TICAS:
1. ANALISE todo o hist?rico para entender o contexto
2. IDENTIFIQUE o que o cliente j? perguntou/comprou/quer
3. CONTINUE a conversa de forma natural, sem repetir informa??es j? dadas
4. N?O se apresente como se fosse a primeira vez - o cliente j? conhece a empresa
5. Se houve algum pedido/solicita??o anterior, REFERENCIE isso naturalmente
6. Seja CONSISTENTE com qualquer promessa ou informa??o dada anteriormente

O cliente N?O SABE que voc? ? uma IA assumindo. Mantenha a continuidade!
`;

        messages.push({
          role: "system",
          content: historyContext
        });
        console.log(`?? [AI Agent] Instru??o de hist?rico adicionada (j? respondeu: ${hasAgentResponded}, priorContext: ${hasPriorContext}, clientMsgs: ${clientMessagesCount})`);
      } else {
        console.log(`?? [AI Agent] Instru??o de hist?rico ignorada (sem contexto pr?vio real).`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧠 SISTEMA DE MEMÓRIA INTELIGENTE (ConversationSummaryBufferMemory)
    // 
    // Baseado em pesquisa: https://www.pinecone.io/learn/series/langchain/langchain-conversational-memory/
    // 
    // ESTRATÉGIA:
    // 1. Se histórico <= 40 msgs: enviar tudo na íntegra
    // 2. Se histórico > 40 msgs: 
    //    - Últimas 30 mensagens: enviar na íntegra (contexto recente detalhado)
    //    - Mensagens antigas: criar RESUMO compacto (economia de tokens)
    // 
    // Isso permite:
    // - Conversas longas sem explodir tokens
    // - Manter contexto completo do histórico
    // - IA entende todo o relacionamento com o cliente
    // ═══════════════════════════════════════════════════════════════════════
    
    const RECENT_MESSAGES_COUNT = 30; // Quantas mensagens recentes manter na íntegra
    const MAX_MESSAGES_BEFORE_SUMMARY = 40; // Quando começar a resumir
    
    let recentMessages: Message[] = [];
    let historySummary: string | null = null;
    
    if (isHistoryModeActive && conversationHistory.length > MAX_MESSAGES_BEFORE_SUMMARY) {
      // 📚 MODO RESUMO: Histórico grande - criar resumo das antigas + recentes na íntegra
      const oldMessages = conversationHistory.slice(0, -RECENT_MESSAGES_COUNT);
      recentMessages = conversationHistory.slice(-RECENT_MESSAGES_COUNT);
      
      // Criar resumo inteligente das mensagens antigas
      // Agrupa por tópicos/intenções detectadas
      const clientMessages = oldMessages.filter(m => !m.fromMe).map(m => m.text || '');
      const agentMessages = oldMessages.filter(m => m.fromMe).map(m => m.text || '');
      
      // Extrair tópicos principais (primeiras palavras de cada mensagem do cliente)
      const topics = clientMessages
        .map(text => text.substring(0, 60).replace(/[^\w\sáàãâéèêíìîóòõôúùûç]/gi, ''))
        .filter(t => t.length > 5)
        .slice(0, 10); // Max 10 tópicos
      
      // Detectar intenções comuns
      const intentKeywords = {
        preco: ['preço', 'valor', 'quanto', 'custa', 'custo'],
        agendamento: ['agendar', 'marcar', 'horário', 'agenda', 'disponível'],
        duvida: ['dúvida', 'pergunta', 'como', 'funciona', 'pode'],
        problema: ['problema', 'erro', 'não funciona', 'ajuda', 'urgente'],
        compra: ['comprar', 'adquirir', 'pedido', 'encomendar', 'quero'],
        informacao: ['informação', 'saber', 'qual', 'onde', 'quando']
      };
      
      const detectedIntents: string[] = [];
      const allClientText = clientMessages.join(' ').toLowerCase();
      
      for (const [intent, keywords] of Object.entries(intentKeywords)) {
        if (keywords.some(kw => allClientText.includes(kw))) {
          detectedIntents.push(intent);
        }
      }
      
      historySummary = `
[📜 RESUMO DO HISTÓRICO ANTERIOR - ${oldMessages.length} mensagens]

👤 CLIENTE já interagiu ${clientMessages.length}x. Tópicos abordados:
${topics.length > 0 ? topics.map(t => `• ${t}`).join('\n') : '• Conversas gerais'}

🎯 INTENÇÕES DETECTADAS: ${detectedIntents.length > 0 ? detectedIntents.join(', ') : 'conversação geral'}

🤖 VOCÊ já respondeu ${agentMessages.length}x nesta conversa.

⚠️ IMPORTANTE: Use este contexto para entender o relacionamento com o cliente. Não repita informações já dadas. Continue de onde parou.
`;
      
      console.log(`📚 [AI Agent] Histórico grande (${conversationHistory.length} msgs) - Resumindo ${oldMessages.length} antigas + ${recentMessages.length} recentes na íntegra`);
      console.log(`📚 [AI Agent] Intenções detectadas: ${detectedIntents.join(', ') || 'nenhuma específica'}`);
      
    } else if (isHistoryModeActive) {
      // 📋 MODO COMPLETO: Histórico pequeno - enviar tudo na íntegra
      recentMessages = conversationHistory.slice(-100); // Limite de segurança
      console.log(`📋 [AI Agent] Histórico pequeno (${conversationHistory.length} msgs) - Enviando tudo na íntegra`);
      
    } else {
      // 📝 MODO PADRÃO: Sem histórico ativo - comportamento original
      recentMessages = conversationHistory.slice(-100);
    }
    
    // Adicionar resumo do histórico se existir
    if (historySummary) {
      messages.push({
        role: "system",
        content: historySummary
      });
    }

    // 🛡️ ANTI-AMNESIA PROMPT INJECTION
    // Adicionar instrução explícita para não se repetir se já houver histórico
    // ATIVADO SEMPRE QUE HÁ HISTÓRICO (independente de fetchHistoryOnFirstResponse)
    if (conversationHistory.length > 1) {
        // Detectar se cliente está mandando saudação repetida no meio da conversa
        const lastMessages = conversationHistory.slice(-4);
        const clientMessages = lastMessages.filter(m => !m.fromMe);
        const agentMessages = lastMessages.filter(m => m.fromMe);
        
        // Verificar se já temos respostas do agente (conversa em andamento)
        const hasAgentReplies = agentMessages.length > 0;
        
        // Verificar se nova mensagem é uma saudação simples
        const isSaudacao = isSimpleGreetingMessage(newMessageText || '');
        
        // Detectar se a mensagem atual já contém informações do negócio do cliente
        const msgLower = (newMessageText || '').toLowerCase();
        const jaDisseOQueTrabalha = /trabalho|faço|vendo|sou|tenho|minha|empresa|loja|negócio|vendas|atendimento|clientes/i.test(msgLower);
        const jaPediuAjuda = /preciso|quero|gostaria|ajuda|ajudar|responder|automatizar|atender/i.test(msgLower);
        
        // Detectar se o agente já interagiu anteriormente
        const jaInteragiu = agentMessages.length > 0;

        // Gerar resumo do contexto para a IA
        const contextSummary = hasAgentReplies 
          ? `O cliente já disse: ${clientMessages.map(m => `"${(m.text || '').substring(0, 50)}"`).join(', ')}`
          : '';
        
        const antiAmnesiaPrompt = `
═══════════════════════════════════════════════════════════════════════════════
⚠️ REGRAS CRÍTICAS DE CONTINUIDADE (OBRIGATÓRIO - SEMPRE SIGA)
═══════════════════════════════════════════════════════════════════════════════

Esta é uma CONVERSA EM ANDAMENTO com ${conversationHistory.length} mensagens.
${contextSummary}

🚫 PROIBIDO (vai fazer você parecer um robô burro):
   ❌ Perguntar "o que você faz?" de novo se cliente JÁ RESPONDEU (inclusive na msg atual!)
   ${jaInteragiu ? '❌ Se apresentar novamente (dizer Nome, Cargo ou Empresa) - O CLIENTE JÁ TE CONHECE!' : ''}
   ${jaInteragiu ? '❌ Repetir a mesma pergunta feita anteriormente - verifique o histórico!' : ''}
   ❌ Ignorar o contexto e recomeçar a conversa do zero
   ❌ Dar a mesma saudação inicial para um novo "oi" no meio da conversa
   ❌ Escrever a palavra "Áudio", "Audio", "Imagem", "Vídeo" SOLTA no texto
   ❌ Repetir o nome do cliente mais de 1x na mesma resposta
   ❌ Concatenar múltiplas respostas em uma só (uma resposta por vez!)
   ❌ SIMULAR O CLIENTE (Nunca escreva "Cliente:", "Rodrigo:", ou invente a resposta dele)
   ❌ RESPONDER A SI MESMO (Nunca faça uma pergunta e responda na mesma mensagem)

✅ OBRIGATÓRIO:
   ✅ Se cliente manda "oi/olá/tudo bem" de novo → responda a saudação de forma BREVE e retome o assunto (no idioma da conversa)
   ✅ Se cliente repete uma pergunta → responda brevemente ("como eu disse, ...")
   ✅ Se cliente responde "sim/não" → entenda o contexto da pergunta anterior
   ✅ Continue de onde parou naturalmente
   ✅ LEIA A MENSAGEM ATUAL INTEIRA - se o cliente já diz o que trabalha/precisa NA PRÓPRIA MENSAGEM, não pergunte de novo!
   ✅ Use o nome do cliente NO MÁXIMO 1 vez por mensagem
   ✅ Responda de forma NATURAL e CURTA (máx 2-3 frases)
   ✅ PARE DE ESCREVER assim que terminar sua vez. AGUARDE o cliente.

${isSaudacao ? `
🎯 ATENÇÃO: O cliente acabou de mandar "${newMessageText}" que é uma SAUDAÇÃO REPETIDA.
   INSTRUÇÃO: Responda a saudação de forma BREVE e pergunte como ajudar, mantendo o idioma e o tom da conversa.
   EXEMPLO (PT): "Oi! Em que posso ajudar?"
   EXEMPLO (EN): "Hi! How can I help?"
   🚫 NÃO se apresente novamente.
   🚫 NÃO repita a pergunta de qualificação ("o que você faz?") se já foi feita.
` : ''}
${jaDisseOQueTrabalha || jaPediuAjuda ? `
🎯 ATENÇÃO: A mensagem ATUAL do cliente JÁ CONTÉM informações importantes!
   O cliente disse: "${newMessageText.substring(0, 100)}"
   ${jaDisseOQueTrabalha ? '→ ELE JÁ DISSE O QUE FAZ/TRABALHA - NÃO PERGUNTE DE NOVO!' : ''}
   ${jaPediuAjuda ? '→ ELE JÁ DISSE O QUE PRECISA - responda a necessidade dele!' : ''}
` : ''}
═══════════════════════════════════════════════════════════════════════════════
`;
        
        messages.push({
            role: "system",
            content: antiAmnesiaPrompt
        });
        
        console.log(`🛡️ [AI Agent] Anti-amnesia prompt injetado (${conversationHistory.length} msgs, saudação=${isSaudacao}, hasReplies=${hasAgentReplies}, jaDisseNegocio=${jaDisseOQueTrabalha})`);
    }
    
    // 🧹 REMOVER DUPLICATAS: Mensagens idênticas confundem a IA
    // MELHORADO: Remove duplicatas adjacentes, mas permite repetição se houver intervalo
    const uniqueMessages: Message[] = [];
    
    for (let i = 0; i < recentMessages.length; i++) {
      const current = recentMessages[i];
      const prev = uniqueMessages.length > 0 ? uniqueMessages[uniqueMessages.length - 1] : null;
      
      // Se for mensagem do mesmo autor com mesmo texto da anterior, ignora (spam)
      if (prev && prev.fromMe === current.fromMe && prev.text === current.text) {
         console.log(`⚠️ [AI Agent] Mensagem duplicada ADJACENTE removida: ${(current.text || '').substring(0, 30)}...`);
         continue;
      }
      
      uniqueMessages.push(current);
    }
    
    console.log(`📋 [AI Agent] Enviando ${uniqueMessages.length} mensagens de contexto (${recentMessages.length - uniqueMessages.length} duplicatas removidas):`);
    
    // Adicionar mensagens do histórico (exceto a última se for do user com mesmo texto que newMessageText)
    for (let i = 0; i < uniqueMessages.length; i++) {
      const msg = uniqueMessages[i];
      
      // 🛡️ CORREÇÃO CRÍTICA: Distinguir mensagens do AGENTE vs mensagens do DONO
      // - isFromAgent=true → A IA enviou esta mensagem → role="assistant"
      // - fromMe=true, isFromAgent=false → O DONO enviou manualmente → NÃO é assistant!
      // - fromMe=false → Cliente enviou → role="user"
      // 
      // BUG ANTERIOR: Mensagens manuais do dono (ex: vendendo AgenteZap) eram tratadas como
      // "assistant", fazendo a IA ALUCINAR e continuar o assunto errado!
      let role: "assistant" | "user" | "system";
      
      if (msg.isFromAgent === true) {
        // A IA realmente enviou esta mensagem
        role = "assistant";
      } else if (msg.fromMe === true && msg.isFromAgent === false) {
        // O DONO enviou manualmente - NÃO INCLUIR como assistant!
        // Opção 1: Pular completamente (dono pode falar coisas fora do escopo)
        // Opção 2: Incluir como contexto de "sistema" (menos confuso para IA)
        // Vamos pular para evitar que IA copie mensagens do dono
        console.log(`   ${i + 1}. [DONO] ${(msg.text || "").substring(0, 50)}... (IGNORADA - msg manual do dono)`);
        continue;
      } else {
        // Cliente enviou
        role = "user";
      }
      
      const isLastMessage = i === uniqueMessages.length - 1;
      
      // Se última mensagem do histórico for do user com mesmo texto que newMessageText, pular (evitar duplicação)
      if (isLastMessage && !msg.fromMe && msg.text === newMessageText) {
        console.log(`   ${i + 1}. [${role}] ${(msg.text || "").substring(0, 50)}... (PULADA - duplicata da nova mensagem)`);
        continue;
      }
      
      const preview = (msg.text || "").substring(0, 50);
      console.log(`   ${i + 1}. [${role}] ${preview}...`);
      
      // 🛡️ FIX: Mistral API rejects empty content. Ensure content is never empty.
      let content = msg.text || "";
      if (!content.trim()) {
        if (msg.mediaType) {
          content = `[Arquivo de ${msg.mediaType}]`;
        } else {
          content = "[Mensagem vazia]";
        }
      }
      
      // 🛡️ FIX: Limpar TODOS os marcadores internos de mídia que não devem aparecer no contexto da IA
      // Isso evita que a IA "aprenda" a repetir esses textos problemáticos
      
      // 1. Limpar padrões de mídia sincronizada do WhatsApp (🎤 Áudio, 🎵 Áudio, 📷 Imagem, etc.)
      // CRÍTICO: Esses textos são salvos quando mídias são sincronizadas do WhatsApp
      // 🎤 FIX 2025: Adicionar TODOS os padrões encontrados no banco de dados
      const audioPatterns = [
        '🎤 Áudio', '🎤 Audio', '🎤Áudio', '🎤Audio',
        '🎵 Áudio', '🎵 Audio', '🎵Áudio', '🎵Audio',  // 🎵 é usado também pelo WhatsApp!
        '[Áudio recebido]', '[Audio recebido]',
        '[Áudio enviado]', '[Audio enviado]',
        '*Áudio*', '*Audio*',
        'Áudio', 'Audio'  // Fallback para casos simples
      ];
      
      // Verificar se a mensagem é APENAS um marcador de áudio (sem transcrição)
      const trimmedContent = content.trim();
      const isAudioMarker = audioPatterns.some(pattern => 
        trimmedContent === pattern || 
        trimmedContent.toLowerCase() === pattern.toLowerCase()
      );
      
      if (isAudioMarker) {
        // Se a mensagem é APENAS o marcador de áudio, indicar que foi mensagem de voz
        // MAS instruir a IA a pedir que repita de forma educada (não dizer que não entende)
        content = '(o cliente enviou uma mensagem de voz que não pôde ser transcrita - peça educadamente que ele repita ou envie por texto)';
      } else if (/^[🎤🎵]\s*[ÁáAa]udio\s+/i.test(content)) {
        // PROBLEMA CRÍTICO: A IA está gerando texto que começa com "🎤 Áudio" ou "🎵 Áudio"
        // Remover esse prefixo para evitar que a IA aprenda este padrão
        content = content.replace(/^[🎤🎵]\s*[ÁáAa]udio\s*/i, '');
      }
      
      // 🖼️ TRATAMENTO DE IMAGENS ANALISADAS
      // Se a imagem foi analisada pelo Vision, manter a descrição para a IA entender
      if (content.includes('[IMAGEM ANALISADA:')) {
        // Manter o conteúdo da análise - a IA precisa saber o que tem na imagem!
        // IMPORTANTE: Deixar MUITO claro que o conteúdo veio do cliente, não do negócio do agente
        const match = content.match(/\[IMAGEM ANALISADA:\s*(.*?)\]/s);
        const catalogMatch = content.match(/\[CATALOGO_IDENTIFICADO:\s*(.*?)\]/s);
        if (match && match[1]) {
          const catalogContext = catalogMatch && catalogMatch[1]
            ? ` O sistema identificou a seguinte referência do catálogo nessa imagem do cliente: "${catalogMatch[1].trim()}". Use isso como pista forte para responder com o produto, a variação, o preço e o estoque corretos se fizer sentido.`
            : "";
          content = `(O cliente enviou uma imagem com o seguinte conteúdo: "${match[1].trim()}" — Este conteúdo foi enviado PELO CLIENTE e NÃO representa os produtos, serviços ou área de atuação do seu negócio. Responda no contexto do SEU negócio habitual.${catalogContext})`;
        }
      } else if (content === '📷 Imagem' || content === '🖼️ Imagem' || content === '*Imagem*') {
        // Imagem não foi analisada (fallback)
        content = '(cliente enviou uma imagem que não pôde ser analisada - pergunte educadamente sobre o que se trata)';
      }
      
      if (content === '🎥 Vídeo' || content === '🎬 Vídeo') {
        content = '(vídeo enviado)';
      }
      if (content === '📄 Documento' || content === '📎 Documento') {
        content = '(documento enviado)';
      }
      
      // 2. Limpar padrões internos de mídia enviada pelo agente
      // CRÍTICO: Remover completamente este texto para não confundir a IA
      if (content.includes('[ÁUDIO ENVIADO PELO AGENTE]')) {
        content = content.replace(/\[ÁUDIO ENVIADO PELO AGENTE\]:[^]*/gi, '');
        content = content.replace(/\[ÁUDIO ENVIADO PELO AGENTE\]/gi, '');
      }
      // Limpar formato antigo [Áudio enviado: ...] - IA estava copiando isso na resposta
      if (content.includes('[Áudio enviado:')) {
        content = content.replace(/\[Áudio enviado:[^\]]*\]/gi, '');
      }
      if (content.includes('[Imagem enviada:')) {
        content = content.replace(/\[Imagem enviada:[^\]]*\]/gi, '');
      }
      if (content.includes('[Vídeo enviado:')) {
        content = content.replace(/\[Vídeo enviado:[^\]]*\]/gi, '');
      }
      if (content.includes('[Documento enviado:')) {
        content = content.replace(/\[Documento enviado:[^\]]*\]/gi, '');
      }
      if (content.includes('[IMAGEM ENVIADA:')) {
        content = content.replace(/\[IMAGEM ENVIADA:[^\]]*\]/gi, '');
      }
      if (content.includes('[VÍDEO ENVIADO:')) {
        content = content.replace(/\[VÍDEO ENVIADO:[^\]]*\]/gi, '');
      }
      if (content.includes('[DOCUMENTO ENVIADO:')) {
        content = content.replace(/\[DOCUMENTO ENVIADO:[^\]]*\]/gi, '');
      }
      
      // 🛡️ LIMPEZA EXTRA: Remover qualquer menção a "Áudio" ou "Audio" isolada
      content = content.replace(/\*[ÁáAa]udio\*/gi, '');
      content = content.replace(/\[[ÁáAa]udio[^\]]*\]/gi, '');
      content = content.replace(/\s+[ÁáAa]udio\s+/gi, ' ');
      
      // 3. Limpar qualquer texto vazio resultante
      content = content.trim();
      if (!content) {
        // Se após limpar ficou vazio, marcar que foi mídia (sem usar a palavra Áudio/Audio)
        if (msg.mediaType) {
          content = msg.mediaType === 'audio' ? '(mensagem de voz)' : 
                    msg.mediaType === 'image' ? '(imagem)' : 
                    msg.mediaType === 'video' ? '(vídeo)' : '(arquivo)';
        } else {
          content = '(mensagem de mídia)';
        }
      }
      
      messages.push({
        role,
        content,
      });
    }

    // ✅ SEMPRE adicionar a nova mensagem do user como última (Mistral exige que última seja user)
    console.log(`   ${uniqueMessages.length + 1}. [user] ${newMessageText.substring(0, 50)}... (NOVA MENSAGEM)`);
    
    // 🛡️ FIX: Ensure newMessageText is not empty
    let finalUserMessage = newMessageText.trim() || "[Mensagem vazia]";
    
    // 🛡️ ANTI-AMNÉSIA FORÇADO: Se é saudação repetida com histórico, FORÇAR instrução na mensagem
    const isSaudacaoSimples = isSimpleGreetingMessage(finalUserMessage);
    const hasAgentRepliesInHistory = uniqueMessages.some(m => m.fromMe);
    
    if (isSaudacaoSimples && hasAgentRepliesInHistory && uniqueMessages.length >= 2) {
      console.log(`🛡️ [AI Agent] SAUDAÇÃO REPETIDA DETECTADA! Forçando instrução anti-repetição na mensagem.`);
      
      // Pegar a última resposta do agente para contexto
      const lastAgentMsg = [...uniqueMessages].reverse().find(m => m.fromMe);
      const lastAgentText = lastAgentMsg?.text?.substring(0, 80) || '';
      
      // Adicionar instrução JUNTO com a mensagem do usuário
      finalUserMessage = `[INSTRUÇÃO CRÍTICA PARA O ASSISTENTE: O cliente mandou "${finalUserMessage}" de novo. Esta é uma SAUDAÇÃO REPETIDA em uma conversa já iniciada. Sua última resposta foi: "${lastAgentText}...". NÃO se apresente novamente. NÃO pergunte o que ele faz de novo. Responda apenas uma saudação curta e pergunte como ajudar (no idioma da conversa).]

Mensagem do cliente: ${newMessageText.trim()}`;
    }
    
    // 🎯 FIX CRÍTICO: Detectar pedido de LISTA/CARDÁPIO/PACK e forçar resposta COMPLETA
    const listPhrases = ['o que tem', 'que tem', 'o que vem', 'quais são', 'quais sao', 'lista', 'cardápio', 'cardapio', 'categorias', 'produtos', 'tudo que tem', 'todas', 'todos', 'completo', 'completa', 'inteiro', 'inteira', 'pack', 'superpack'];
    const isAskingForListInMessage = listPhrases.some(kw => newMessageText.toLowerCase().includes(kw));
    
    if (isAskingForListInMessage) {
      console.log(`📋 [AI Agent] PEDIDO DE LISTA DETECTADO! Extraindo lista do prompt...`);
      
      // 🎯 SOLUÇÃO DEFINITIVA (TESTADA E APROVADA - 100% sucesso):
      // Extrair lista numerada do prompt e INJETAR diretamente na mensagem
      // Isso garante que a IA RECEBA a lista completa, independente do tamanho do prompt
      // FIX: Usar systemPrompt (já construído) ou agentConfig.prompt como fallback
      const promptToSearch = systemPrompt || agentConfig.prompt || '';
      
      // Regex para encontrar listas numeradas (1. Item\n2. Item\n...)
      // Busca sequências de pelo menos 10 itens numerados consecutivos
      const numberedListRegex = /(?:^|\n)((?:\d{1,3}\.\s*[^\n]+(?:\n|$)){10,})/;
      const listMatch = promptToSearch.match(numberedListRegex);
      
      if (listMatch) {
        const extractedList = listMatch[1].trim();
        const itemCount = (extractedList.match(/^\d{1,3}\./gm) || []).length;
        console.log(`📋 [AI Agent] ✅ LISTA EXTRAÍDA: ${itemCount} itens (${extractedList.length} chars)`);
        
        // 🚀 TÉCNICA VENCEDORA: Injetar lista na user message (testado - 100% sucesso)
        finalUserMessage = `O cliente perguntou: "${newMessageText.trim()}"

Copie esta lista COMPLETA (${itemCount} itens):

${extractedList}`;
      } else {
        console.log(`📋 [AI Agent] ⚠️ Nenhuma lista numerada detectada no prompt`);
        // Fallback: instrução genérica
        finalUserMessage = `[INSTRUÇÃO: O cliente está pedindo lista/cardápio. Envie a lista COMPLETA do seu conhecimento, item por item, sem cortar nada]

Cliente: ${newMessageText.trim()}`;
      }
    }

    // 📅 HUMANIZAÇÃO: Quando ativa, substituir finalUserMessage para forçar reescrita
    // Isso garante que a ÚLTIMA instrução ao LLM seja a tarefa de humanizar,
    // em vez da mensagem crua do cliente (que faria o LLM seguir o prompt do negócio)
    if (schedulingReplyForHumanization) {
      finalUserMessage = buildSchedulingHumanizationUserInstruction({
        category: schedulingReplyCategory,
        schedulingReplyForHumanization,
        nomeNegocio,
        promptDoNegocio: agentConfig.prompt || "",
      });

      console.log(`📅 [AI Agent] finalUserMessage substituída para humanização (categoria: ${schedulingReplyCategory})`);
    }

    if (isFirstAgentOpeningOpportunity(conversationHistory) && !shouldIdentifyRealEstatePropertyFirst) {
      finalUserMessage = prependContextualOpeningInstruction({
        customerMessage: newMessageText,
        baseUserMessage: finalUserMessage,
      });
    }

    if (schedulingDirectReply) {
      let directResponseText = schedulingDirectReply;

      if (openingRuleForCurrentTurn) {
        const openingOnlyText = await generateOpeningOnlyResponse(openingRuleForCurrentTurn);
        directResponseText = composeMandatoryOpeningResponse(
          getOpeningTextForCustomerMessage(openingOnlyText, newMessageText),
          removeLeadingRedundantOpeningQuestion(directResponseText, newMessageText),
        );
      }

      console.log(`📅 [AI Agent] Resposta de desambiguação retornada sem reescrita livre do LLM`);
      return {
        text: directResponseText,
        mediaActions: [],
        notification: undefined,
        appointmentCreated: schedulingBookingResult.appointmentCreated || undefined,
        deliveryOrderCreated: undefined,
      };
    }

    if (openingRuleForCurrentTurn && !schedulingReplyForHumanization) {
      const mustContinueAfterOpening =
        !shouldIdentifyRealEstatePropertyFirst &&
        shouldForceContextualOpeningResponse(newMessageText);
      if (openingRuleForCurrentTurn.variationEnabled) {
        messages.push({
          role: "system",
          content: `ABERTURA OBRIGATORIA DESTA RESPOSTA:
Esta ainda e a primeira resposta da conversa.
Use apenas UMA abertura baseada neste texto: "${openingRuleForCurrentTurn.text}"
Mantenha o mesmo sentido, mas nao escreva uma segunda saudacao, nao acrescente outra apresentacao e nao assine novamente depois.
${mustContinueAfterOpening
  ? `O cliente ja chegou com um pedido concreto nesta mesma mensagem: "${newMessageText.trim()}".
Depois da abertura, responda DIRETAMENTE a esse pedido antes de fazer qualquer nova pergunta.`
  : `Se o cliente fez uma pergunta, responda essa pergunta na mesma mensagem depois da abertura.`}`,
        });
      } else {
        messages.push({
          role: "system",
          content: `ABERTURA OBRIGATORIA DESTA RESPOSTA:
Esta ainda e a primeira resposta da conversa.
A resposta final vai comecar exatamente com este texto: "${openingRuleForCurrentTurn.text}"
Sua tarefa e escrever somente o restante da resposta depois dessa abertura.
Nao repita saudacao, nao se apresente de novo, nao escreva outra abertura parecida.
${mustContinueAfterOpening
  ? `O cliente ja fez um pedido concreto nesta mesma mensagem: "${newMessageText.trim()}".
A abertura sozinha NAO basta. Depois dela, responda objetivamente ao pedido do cliente antes de qualquer nova pergunta.`
  : `Se a abertura por si so ja bastar, responda com corpo vazio.`}`,
        });
      }
    }

    if (
      isFirstAgentOpeningOpportunity(conversationHistory) &&
      !shouldIdentifyRealEstatePropertyFirst &&
      shouldForceContextualOpeningResponse(newMessageText)
    ) {
      messages.push({
        role: "system",
        content: `PRIORIDADE MAXIMA NESTA PRIMEIRA RESPOSTA:
O cliente iniciou a conversa com uma demanda concreta: "${newMessageText.trim()}".
Nao use esta primeira resposta apenas para pedir nome, apenas para saudar ou apenas para qualificar o cliente.
Entregue uma resposta util ao pedido do cliente NESTA MESMA mensagem.
Se ainda precisar pedir nome ou outra informacao, faca isso somente depois de responder o que ele pediu agora.`,
      });

      if (openingMediaActions.length > 0) {
        const openingFlowSummary = describeOpeningMediaActions(openingMediaActions);
        messages.push({
          role: "system",
          content: `ABERTURA JA ENVIADA PELO SISTEMA:
Nesta primeira resposta, o sistema ja vai enviar separadamente a abertura configurada do agente.
Nao repita saudacao, apresentacao, pergunta inicial nem o mesmo passo que essa abertura ja cobre.
Use o texto apenas para complementar com algo util ao pedido do cliente.
Se a abertura separada ja bastar para encaminhar esta etapa, responda com corpo vazio.
${openingFlowSummary ? `Resumo da abertura separada: ${openingFlowSummary}` : ""}`,
        });
      }
    }
    
    messages.push({
      role: "user",
      content: finalUserMessage,
    });

    // 🚀 SISTEMA DE LLM MULTI-PROVIDER (Groq/Mistral)
    const llmClient = await getLLMClient();
    const currentProvider = await getCurrentProvider();
    
    // ════════════════════════════════════════════════════════════════════════════
    // 🎯 TOKENS SEM LIMITE ARTIFICIAL - Deixar a IA responder naturalmente
    // A divisão em partes menores é feita DEPOIS pelo splitMessageHumanLike
    // Isso garante que NENHUM conteúdo seja cortado - apenas dividido em blocos
    // ════════════════════════════════════════════════════════════════════════════
    
    // Perguntas curtas = respostas proporcionais, mas SEM corte forçado
    const questionLength = newMessageText.length;
    
    // 🔧 FIX: Detectar se cliente está pedindo LISTA/CARDÁPIO/CATEGORIAS
    // ou montando um pedido de catálogo com muitos códigos válidos.
    // Nestes casos, usar maxTokens muito maior para garantir resposta completa.
    const listKeywords = ['lista', 'cardápio', 'cardapio', 'categorias', 'produtos', 'o que tem', 'que tem', 'o que vem', 'que vem', 'tudo que tem', 'quais são', 'quais sao', 'todas', 'todos', 'completo', 'completa', 'inteiro', 'inteira', 'pack', 'superpack'];
    const isAskingForList = listKeywords.some(kw => newMessageText.toLowerCase().includes(kw));
    const catalogKnownCodes = collectKnownCatalogVariationCodes(productsData);
    const selectedCatalogCodesCount = catalogKnownCodes.size > 0
      ? selectCatalogCodesFromConversation({
          currentMessage: newMessageText,
          conversationHistory,
          knownCodes: catalogKnownCodes,
        }).length
      : 0;
    const isAskingForCatalogMultiItem = selectedCatalogCodesCount >= 4;
    
    // Base generosa para permitir respostas completas
    // 1 token ≈ 3-4 caracteres em português
    // 2000 tokens ≈ 6000-8000 chars (mensagens bem longas)
    // 🔧 FIX: Se pedir lista, usar 8000 tokens (≈24000-32000 chars) para listas MUITO grandes como 71 categorias
    // V23: Reduzido para gerar respostas curtas com [BOLHA] de 400 chars max
    // Listas continuam com tokens altos para não cortar
    const catalogMultiItemMaxTokens = Math.max(2800, selectedCatalogCodesCount * 320);
    const baseMaxTokens = isAskingForList
      ? 8000
      : isAskingForCatalogMultiItem
        ? catalogMultiItemMaxTokens
        : (questionLength < 20 ? 500 : questionLength < 50 ? 600 : 800);
    
    if (isAskingForList) {
      console.log(`📋 [AI Agent] Detectado pedido de LISTA - usando maxTokens aumentado: ${baseMaxTokens}`);
    }
    if (isAskingForCatalogMultiItem) {
      console.log(`📦 [AI Agent] Detectado pedido de catálogo com ${selectedCatalogCodesCount} código(s) válidos - usando maxTokens aumentado: ${baseMaxTokens}`);
    }
    
    // 🆕 Se usar sistema avançado, respeitar maxResponseLength configurado
    // Usar MAX ao invés de MIN para garantir que resposta não seja cortada
    const configMaxTokens = useAdvancedSystem && businessConfig?.maxResponseLength
      ? Math.ceil(businessConfig.maxResponseLength / 3) // aprox 3 chars por token
      : baseMaxTokens;
    
    // Usar o MAIOR valor para garantir resposta completa
    // O splitMessageHumanLike cuida da divisão em partes menores depois
    const maxTokens = Math.max(configMaxTokens, baseMaxTokens);
    
    console.log(`🎯 [AI Agent] Pergunta: ${questionLength} chars → maxTokens: ${maxTokens} (SEM LIMITE - divisão em partes é depois)`);
    
    // Determinar modelo (usar config do business ou legacy)
    // Para Groq, usar modelo configurado no system_config; para Mistral, usar o do agentConfig
    const model = currentProvider === 'groq' 
      ? undefined  // Deixar o LLM client usar o modelo configurado
      : (useAdvancedSystem && businessConfig?.model 
          ? businessConfig.model 
          : agentConfig.model);
    
    // ════════════════════════════════════════════════════════════════════════════
    // 🎯 CACHE DE RESPOSTAS: Garante que mesma pergunta = mesma resposta SEMPRE
    // O Mistral API tem variação mesmo com temperature=0, então usamos cache
    // para garantir determinismo absoluto entre Simulador e WhatsApp
    // ════════════════════════════════════════════════════════════════════════════
    
    // Gerar hash do prompt para validar cache (se prompt mudar, cache é invalidado)
    const promptHash = crypto.createHash('md5')
      .update((agentConfig?.prompt || '').substring(0, 500))
      .digest('hex')
      .substring(0, 8);
    
    // ⚠️ CACHE DESATIVADO TEMPORARIAMENTE
    // Motivo: O cache estava causando problemas porque a resposta precisa considerar
    // o contexto da conversa (histórico), não apenas a mensagem atual.
    // Uma mesma mensagem "oi" pode ter respostas diferentes dependendo do histórico.
    // TODO: Implementar cache mais inteligente que considere o contexto
    /*
    // Verificar se temos resposta cacheada para esta pergunta
    const cachedResponse = getCachedResponse(userId, newMessageText, promptHash);
    if (cachedResponse) {
      console.log(`✅ [CACHE HIT] Usando resposta cacheada para evitar variação do Mistral`);
      // Retornar resposta cacheada diretamente (pular chamada do Mistral)
      const processedCached = processResponsePlaceholders(cachedResponse, contactName, contactPhone);
      return {
        text: processedCached,
        mediaActions: [],
        notification: undefined,
      };
    }
    */
    
    // 🔄 CHAMADA COM RETRY AUTOMÁTICO PARA ERROS DE API (rate limit, timeout, etc)
    // 🎯 TEMPERATURE 0.0 + SEED FIXO: Respostas 100% DETERMINÍSTICAS
    // REMOVIDA VARIAÇÃO: Usuário solicitou remover variação do simulador e WhatsApp debug
    // randomSeed: Garante que mesma pergunta = mesma resposta SEMPRE
    // NOTA: O modelo real é definido em llm.ts usando config.openrouterModel do system_config
    console.log(`🔧 [AI-CONFIG] DETERMINISM: provider=${currentProvider}, temperature=0.0, randomSeed=42, model=from-system-config (llm.ts usa openrouterModel)`);
    // ⚠️ RETRY REDUZIDO: llm.ts já tem rotação de 5 modelos + fallback OpenRouter/Groq
    // Outer retry=1: só retenta 1x para erros de servidor (500/502/503/504)
    // Rate limits (429) são tratados internamente pelo llm.ts com rotação de modelos
    const chatResponse = await withRetry(
      async () => {
        return await llmClient.chat.complete({
          model,
          messages: messages as any,
          maxTokens, // Dinâmico baseado na pergunta e config
          temperature: 0.0, // ZERO: Resposta determinística
          randomSeed: 42, // SEED FIXO: Garante determinismo absoluto
        });
      },
      1, // 1 tentativa (era 3 - causava retry storm multiplicando chamadas)
      1500, // Delay inicial de 1.5s
      `LLM API (${currentProvider})`
    );

    const content = chatResponse.choices?.[0]?.message?.content;
    const parsedEnvelope = parseStructuredAIEnvelope(typeof content === 'string' ? content : null);
    let responseText = parsedEnvelope.assistantResponse;
    const routing = parsedEnvelope.routing;
    const attention = await resolveAttentionAssessmentWithFallback({
      parsedAttention: parsedEnvelope.attention,
      llmClient,
      model,
      provider: currentProvider,
      conversationHistory,
      latestCustomerMessage: newMessageText,
      assistantResponse: parsedEnvelope.assistantResponse,
    });
    let notification: { shouldNotify: boolean; reason: string; } | undefined;
    
    // ═══════════════════════════════════════════════════════════════════════
    // 🔧 FIX 2026-02-26: DETECÇÃO DE RESPOSTA TRUNCADA (cortada pela metade)
    // Se a LLM parou por max_tokens, a resposta pode estar incompleta.
    // Detectar e completar se possível.
    // ═══════════════════════════════════════════════════════════════════════
    const finishReason = chatResponse.choices?.[0]?.finishReason || chatResponse.choices?.[0]?.finish_reason;
    if (responseText && finishReason === 'length') {
      console.log(`⚠️ [AI Agent] Resposta TRUNCADA detectada (finish_reason=length)! maxTokens=${maxTokens}, chars=${responseText.length}`);
      
      // Detectar padrões de truncamento: lista numerada cortada, frase sem pontuação final
      const lastLine = responseText.trim().split('\n').pop() || '';
      const isMidList = /^\d{1,3}\.?\s*$/.test(lastLine.trim()); // "3." ou "3" sozinho
      const isMidSentence = !/[.!?:)\]"…]$/.test(responseText.trim()); // Não termina com pontuação
      
      if (isMidList || isMidSentence) {
        console.log(`⚠️ [AI Agent] Resposta cortada no meio de ${isMidList ? 'lista' : 'frase'}. Removendo parte incompleta...`);
        
        // Remover a última linha/frase incompleta para não enviar conteúdo cortado
        const lines = responseText.trim().split('\n');
        if (isMidList && lines.length > 1) {
          // Remover última linha da lista que está incompleta (ex: "3." sem conteúdo)
          lines.pop();
          responseText = lines.join('\n');
        } else if (isMidSentence && !isMidList) {
          // Remover última frase incompleta - encontrar último ponto final válido
          const lastPunctuation = responseText.search(/[.!?][^.!?]*$/);
          if (lastPunctuation > responseText.length * 0.5) {
            // Só cortar se o ponto está na segunda metade (não perder muito conteúdo)
            responseText = responseText.substring(0, lastPunctuation + 1);
          }
        }
        console.log(`✂️ [AI Agent] Resposta ajustada: ${responseText.length} chars`);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // 🧠 FILOSOFIA: DEIXAR A IA PROCESSAR NATURALMENTE
    // A IA lê o prompt do cliente e gera a resposta seguindo as instruções.
    // NÃO FAZEMOS tratamento especial - a IA é inteligente o suficiente.
    // ═══════════════════════════════════════════════════════════════════════
    
    if (responseText) {
      // 🚫 FIX: Detectar e remover duplicação na resposta do Mistral
      // As vezes a API retorna texto 2x separado por \n\n
      const paragraphs = responseText.split('\n\n');
      const halfLength = Math.floor(paragraphs.length / 2);
      
      if (paragraphs.length > 2 && paragraphs.length % 2 === 0) {
        const firstHalf = paragraphs.slice(0, halfLength).join('\n\n');
        const secondHalf = paragraphs.slice(halfLength).join('\n\n');
        
        if (firstHalf === secondHalf) {
          console.log(`⚠️ [AI Agent] Resposta duplicada detectada do Mistral, usando apenas primeira metade`);
          console.log(`   Original length: ${responseText.length} chars`);
          responseText = firstHalf;
          console.log(`   Fixed length: ${responseText.length} chars`);
        }
      }
      
      // 📝 FIX: Converter formatação Markdown para WhatsApp
      // WhatsApp: *negrito* _itálico_ ~tachado~ ```mono```
      // Markdown:  **negrito** *itálico* ~~tachado~~ `mono`
      responseText = convertMarkdownToWhatsApp(responseText);

      // 🔔 NOTIFICATION SYSTEM: Check for [NOTIFY: ...] tag
      console.log(`🔔 [AI Agent] Checking for NOTIFY tag in response...`);
      console.log(`   Response snippet (last 100 chars): "${responseText.slice(-100)}"`);
      
      const notifyMatch = responseText.match(/\[NOTIFY: (.*?)\]/);
      if (notifyMatch) {
        notification = {
          shouldNotify: true,
          reason: notifyMatch[1].trim()
        };
        // Remove tag from response
        responseText = responseText.replace(/\[NOTIFY: .*?\]/g, '').trim();
        console.log(`🔔 [AI Agent] ✅ Notification trigger detected: ${notification.reason}`);
      } else {
        console.log(`🔔 [AI Agent] ❌ No NOTIFY tag found in response`);
      }
      
      // 🛡️ SEGURANÇA: Remover qualquer vazamento de texto de notificação que a IA possa ter gerado
      // Isso evita que a IA "invente" notificações no formato errado
      if (responseText.includes('🔔 NOTIFICAÇÃO') || responseText.includes('NOTIFICAÇÃO DO AGENTE')) {
        console.log(`⚠️ [AI Agent] Detectado vazamento de template de notificação! Limpando...`);
        // Remover bloco de notificação que pode ter vazado
        responseText = responseText.replace(/🔔\s*\*?NOTIFICAÇÃO[^]*?(Cliente:|Última mensagem:)[^"]*"[^"]*"/gi, '').trim();
        responseText = responseText.replace(/🔔[^]*?Motivo:[^\n]*/gi, '').trim();
      }
      
      // �️ FIX: Remover "[Mensagem vazia]" que pode aparecer quando histórico tinha mídia sem texto
      if (responseText.includes('[Mensagem vazia]')) {
        responseText = responseText.replace(/\[Mensagem vazia\]\s*/g, '').trim();
        console.log(`⚠️ [AI Agent] Removido "[Mensagem vazia]" da resposta`);
      }
      
      // �🚨 POST-PROCESSING: Detectar e limpar possíveis vazamentos de instruções do prompt
      // CUIDADO: Não truncar agressivamente - apenas limpar padrões específicos problemáticos
      
      // 🆕 FIX: Remover instruções técnicas que vazam na resposta da IA
      // Padrões como "Use exatamente o texto abaixo..." são instruções, não respostas
      responseText = cleanInstructionLeaks(responseText);
      
      // 1. Detectar se tem texto que parece ser do prompt (padrões de instrução)
      // 🔧 FIX 2025-01: DESABILITADA lógica agressiva de prompt leak
      // Essa lógica estava cortando respostas legítimas sobre preços/planos
      // Ex: "1. R$49,99/mês por número (total de R$199,96/mês) 2." era cortada incorretamente
      // A função cleanInstructionLeaks já faz a limpeza necessária sem cortar conteúdo válido
      const hasPromptLeak = false; // Desabilitado - era muito agressivo
      
      if (hasPromptLeak) {
        console.log(`⚠️ [AI Agent] Detectado vazamento de prompt! Limpando...`);
        const originalLength = responseText.length;
        
        // Tentar cortar no primeiro ponto final após conteúdo válido
        const sentences = responseText.split(/\.\s+/);
        let cleanedResponse = '';
        
        for (const sentence of sentences) {
          // Parar se encontrar texto que parece instrução
          if (sentence.includes('online/cadastro') ||
              sentence.includes('Depois de logado') ||
              sentence.includes('clica em Ilimitado') ||
              sentence.includes('no menu do lado esquerdo')) {
            break;
          }
          cleanedResponse += sentence + '. ';
        }
        
        // Se conseguiu extrair algo válido, usar
        if (cleanedResponse.trim().length > 50) {
          responseText = cleanedResponse.trim();
          console.log(`✂️ [AI Agent] Resposta limpa de ${originalLength} para ${responseText.length} chars`);
        }
      }

      if (
        responseText
        && schedulingReplyCategory === 'DISAMBIGUATION'
        && schedulingReplyForHumanization
      ) {
        const disambiguationValidation = validateSchedulingDisambiguationHumanizedReply({
          replyText: responseText,
          structuredReply: schedulingReplyForHumanization,
          promptDoNegocio: agentConfig.prompt || "",
        });

        if (!disambiguationValidation.isValid) {
          console.log(`📅 [AI Agent] Desambiguação humanizada invalidada; aplicando fallback seguro (${disambiguationValidation.issues.join(", ")})`);
          responseText = disambiguationValidation.fallbackReply;

          if (openingRuleForCurrentTurn) {
            const openingOnlyText = await generateOpeningOnlyResponse(openingRuleForCurrentTurn);
            responseText = composeMandatoryOpeningResponse(
              getOpeningTextForCustomerMessage(openingOnlyText, newMessageText),
              removeLeadingRedundantOpeningQuestion(responseText, newMessageText),
            );
          }
        } else {
          console.log(`📅 [AI Agent] Desambiguação humanizada validada com sucesso`);
        }
      }

      if (
        responseText
        && schedulingReplyCategory === 'SLOT_LISTING'
        && schedulingReplyForHumanization
      ) {
        const slotListingValidation = validateSchedulingSlotListingHumanizedReply({
          replyText: responseText,
          structuredReply: schedulingReplyForHumanization,
          promptDoNegocio: agentConfig.prompt || "",
        });

        if (!slotListingValidation.isValid) {
          console.log(`📅 [AI Agent] Lista de horarios humanizada invalidada; aplicando fallback seguro (${slotListingValidation.issues.join(", ")})`);
          responseText = slotListingValidation.fallbackReply;

          if (openingRuleForCurrentTurn) {
            const openingOnlyText = await generateOpeningOnlyResponse(openingRuleForCurrentTurn);
            responseText = composeMandatoryOpeningResponse(
              getOpeningTextForCustomerMessage(openingOnlyText, newMessageText),
              removeLeadingRedundantOpeningQuestion(responseText, newMessageText),
            );
          }
        } else {
          console.log(`📅 [AI Agent] Lista de horarios humanizada validada com sucesso`);
        }
      }
      
      // 🛡️ VALIDAÇÃO DE RESPOSTA (apenas no sistema avançado)
      if (useAdvancedSystem && businessConfig) {
        const validation = validateAgentResponse(responseText, businessConfig);
        
        if (!validation.isValid) {
          console.log(`⚠️ [AI Agent] Response validation FAILED:`);
          console.log(`   Maintains identity: ${validation.maintainsIdentity}`);
          console.log(`   Stays in scope: ${validation.staysInScope}`);
          console.log(`   Issues: ${validation.issues.join(', ')}`);
          
          // Se violou identidade, rejeitar resposta e retornar fallback
          if (!validation.maintainsIdentity) {
            console.log(`🚨 [AI Agent] CRITICAL: Response breaks identity! Using fallback.`);
            return {
              text: `Desculpe, tive um problema ao processar sua mensagem. Sou ${businessConfig.agentName} da ${businessConfig.companyName}. Como posso te ajudar com ${businessConfig.allowedTopics?.[0] || "nossos serviços"}?`,
              mediaActions: [],
            };
          }
          
          // Se saiu do escopo mas mantém identidade, apenas logar
          if (!validation.staysInScope) {
            console.log(`⚠️ [AI Agent] WARNING: Response may be out of scope. Proceeding anyway.`);
          }
        } else {
          console.log(`✅ [AI Agent] Response validation PASSED`);
        }
        
        // ⚠️ HUMANIZAÇÃO REMOVIDA - Estava corrompendo respostas do agente
        // A IA já gera respostas naturais no prompt, não precisa de pós-processamento
        // que adiciona saudações/emojis indesejados
        // 
        // Código removido:
        // - detectEmotion() / adjustToneForEmotion()
        // - humanizeResponse() com saudações/conectores/emojis
        //
        // A resposta da Mistral agora é usada EXATAMENTE como gerada
        console.log(`✅ [AI Agent] Usando resposta original da IA (sem humanização extra)`);
      }
      
      console.log(`✅ [AI Agent] Resposta gerada: ${responseText.substring(0, 100)}...`);
    }
    
    // 🍕 PROCESSAR TAG DE CARDÁPIO: [ENVIAR_CARDAPIO_COMPLETO]
    if (responseText && responseText.includes('[ENVIAR_CARDAPIO_COMPLETO]')) {
      console.log(`🍕 [AI Agent] Tag [ENVIAR_CARDAPIO_COMPLETO] detectada! Buscando cardápio para userId=${userId}...`);
      
      const deliveryMenu = await getDeliveryMenuForAI(userId);
      console.log(`🍕 [AI Agent] DEBUG getDeliveryMenuForAI retornou: ${deliveryMenu ? `active=${deliveryMenu.active}, items=${deliveryMenu.total_items}` : 'NULL'}`);
      
      // 🔥 VERIFICAR SE DEVE PERGUNTAR CATEGORIA PRIMEIRO
      // Se as displayInstructions pedem para perguntar primeiro, BLOQUEAR o envio do cardápio completo
      // e substituir pela pergunta de categoria
      const displayInstructions = deliveryMenu?.displayInstructions || '';
      const askFirstKeywords = ['pergunt', 'primeiro', 'antes', 'categorias', 'quer ver'];
      const shouldAskFirst = askFirstKeywords.some(kw => displayInstructions.toLowerCase().includes(kw));
      
      if (shouldAskFirst && deliveryMenu && deliveryMenu.active) {
        console.log(`🍕 [AI Agent] ⚠️ MODO PERGUNTAR PRIMEIRO ATIVO! Bloqueando envio do cardápio completo...`);
        console.log(`🍕 [AI Agent] displayInstructions: "${displayInstructions.substring(0, 100)}..."`);
        
        // Gerar lista de categorias
        const categoryList = deliveryMenu.categories
          .filter(c => c.items && c.items.length > 0)
          .map(c => c.name)
          .join(', ');
        
        // Substituir a tag pela pergunta de categoria (de forma natural)
        const perguntaCategoria = `Temos: ${categoryList}. Qual você quer ver? 😊`;
        responseText = responseText.replace(/\[ENVIAR_CARDAPIO_COMPLETO\]/g, perguntaCategoria);
        console.log(`🍕 [AI Agent] ✅ Tag substituída pela pergunta de categoria: "${perguntaCategoria}"`);
      } else if (deliveryMenu && deliveryMenu.active) {
        console.log(`🍕 [AI Agent] Cardápio obtido: ${deliveryMenu.total_items} itens, ${deliveryMenu.categories.length} categorias`);
        deliveryMenu.categories.forEach(cat => {
          console.log(`   - ${cat.name}: ${cat.items.length} itens`);
        });
        
        const formattedMenu = formatMenuForCustomer(deliveryMenu);
        console.log(`🍕 [AI Agent] DEBUG formattedMenu length=${formattedMenu.length}`);
        
        // Substituir a tag pelo cardápio formatado
        responseText = responseText.replace(/\[ENVIAR_CARDAPIO_COMPLETO\]/g, formattedMenu);
        console.log(`🍕 [AI Agent] ✅ Cardápio formatado inserido (${formattedMenu.length} chars)`);
        console.log(`🍕 [AI Agent] Preview: ${formattedMenu.substring(0, 200)}...`);
      } else {
        // Se não tem cardápio ativo, remover a tag e deixar a mensagem da IA
        responseText = responseText.replace(/\[ENVIAR_CARDAPIO_COMPLETO\]/g, '');
        console.log(`⚠️ [AI Agent] Cardápio não disponível - tag removida. deliveryMenu=${JSON.stringify(deliveryMenu)?.substring(0, 200)}`);
      }
    } else {
      console.log(`⚠️ [AI Agent] TAG NÃO DETECTADA! Response: ${responseText?.substring(0, 300)}`);
      
      // 🛡️ FALLBACK: Se a pergunta do cliente pediu cardápio/menu mas a IA não usou a tag,
      // verificar se devemos injetar o cardápio mesmo assim
      // PORÉM: Se "perguntar primeiro" estiver ativo, NÃO fazer fallback
      const perguntaPediuCardapio = /cardápio|cardapio|menu|o que tem|oque tem|quais produto|quais os produto|me manda o menu|mostra o menu|ver o cardápio|ver cardápio/i.test(newMessageText || '');
      const respostaTemPrecos = /R\$\s*\d+|reais|\d+,\d{2}/i.test(responseText || '');
      
      if (perguntaPediuCardapio && respostaTemPrecos) {
        console.log(`🛡️ [AI Agent] FALLBACK: Cliente pediu cardápio mas IA listou preços manualmente! Verificando displayInstructions...`);
        const deliveryMenu = await getDeliveryMenuForAI(userId);
        
        // Verificar se deve perguntar primeiro
        const displayInstructions = deliveryMenu?.displayInstructions || '';
        const askFirstKeywords = ['pergunt', 'primeiro', 'antes', 'categorias', 'quer ver'];
        const shouldAskFirst = askFirstKeywords.some(kw => displayInstructions.toLowerCase().includes(kw));
        
        if (shouldAskFirst) {
          console.log(`🛡️ [AI Agent] ⚠️ FALLBACK BLOQUEADO - Modo "perguntar primeiro" ativo!`);
        } else if (deliveryMenu && deliveryMenu.active && deliveryMenu.total_items > 0) {
          const formattedMenu = formatMenuForCustomer(deliveryMenu);
          // Substituir a resposta inteira pelo cardápio formatado + mensagem amigável
          responseText = `${formattedMenu}\n\nAqui está nosso cardápio completo! 😊 Quer fazer um pedido?`;
          console.log(`🛡️ [AI Agent] ✅ FALLBACK aplicado - cardápio completo injetado (${formattedMenu.length} chars)`);
        }
      }
    }
    
    // 📁 PROCESSAR TAG DE CATEGORIA: [ENVIAR_CATEGORIA: nome_categoria]
    // Esta tag permite enviar apenas uma categoria específica do cardápio
    const categoryTagRegex = /\[ENVIAR_CATEGORIA:\s*([^\]]+)\]/gi;
    let categoryMatch;
    while ((categoryMatch = categoryTagRegex.exec(responseText || '')) !== null) {
      const [fullTag, categoryName] = categoryMatch;
      console.log(`📁 [AI Agent] Tag [ENVIAR_CATEGORIA: ${categoryName}] detectada!`);
      
      const deliveryMenu = await getDeliveryMenuForAI(userId);
      if (deliveryMenu && deliveryMenu.active) {
        // Encontrar a categoria pelo nome (busca parcial, case-insensitive)
        const normalizedSearch = categoryName.toLowerCase().trim();
        const matchingCategory = deliveryMenu.categories.find(cat => 
          cat.name.toLowerCase().includes(normalizedSearch) ||
          normalizedSearch.includes(cat.name.toLowerCase().replace(/[🍕🍫🥟🍹🧀]/g, '').trim())
        );
        
        if (matchingCategory && matchingCategory.items.length > 0) {
          console.log(`📁 [AI Agent] Categoria encontrada: ${matchingCategory.name} com ${matchingCategory.items.length} itens`);
          
          // Formatar apenas essa categoria
          const formatPrice = (price: string | null): string => {
            if (!price) return 'Consultar';
            const num = parseFloat(price);
            if (isNaN(num)) return price;
            return `R$ ${num.toFixed(2).replace('.', ',')}`;
          };
          
          let categoryText = `*${matchingCategory.name}*\n`;
          for (const item of matchingCategory.items) {
            const priceText = item.promotional_price 
              ? `~${formatPrice(item.price)}~ *${formatPrice(item.promotional_price)}*`
              : formatPrice(item.price);
            categoryText += `• ${item.name} - ${priceText}\n`;
            if (item.description) {
              categoryText += `  _${item.description}_\n`;
            }
          }
          
          responseText = responseText!.replace(fullTag, categoryText);
          console.log(`📁 [AI Agent] ✅ Categoria "${matchingCategory.name}" inserida (${categoryText.length} chars)`);
        } else {
          console.log(`⚠️ [AI Agent] Categoria "${categoryName}" não encontrada`);
          responseText = responseText!.replace(fullTag, `(Categoria "${categoryName}" não encontrada)`);
        }
      } else {
        responseText = responseText!.replace(fullTag, '');
      }
    }
    
    // 📁 PROCESSAR MÍDIAS: Detectar tags [ENVIAR_MIDIA:NOME] na resposta
    // V23i: Sempre limpar tags da resposta, mesmo sem mídia na biblioteca
    let mediaActions: MistralResponse['actions'] = [];
    let shouldSemanticallyAlignTextWithoutMedia = false;
    
    if (responseText) {
      const parsedResponse = parseMistralResponse(responseText);
      
      if (parsedResponse) {
        // Extrair ações de mídia detectadas pelas tags
        mediaActions = parsedResponse.actions || [];
        
        // Usar o texto limpo (sem as tags de mídia)
        if (parsedResponse.messages && parsedResponse.messages.length > 0) {
          responseText = parsedResponse.messages.map(m => m.content).join('\n\n');
          // Limpar espaços HORIZONTAIS extras que podem sobrar (preservar quebras de linha!)
          responseText = responseText.replace(/[ \t]+/g, ' ').trim();
        }
        
        if (mediaActions.length > 0) {
          console.log(`📁 [AI Agent] Tags de mídia detectadas: ${mediaActions.map(a => a.media_name).join(', ')}`);
          
          // 🛡️ FILTRAR MÍDIAS JÁ ENVIADAS (nunca repetir)
          const originalCount = mediaActions.length;
          mediaActions = mediaActions.filter(action => {
            const mediaName = foldMediaName(action.media_name);
            const alreadySent = sentMedias.some(sent => foldMediaName(sent) === mediaName);
            if (alreadySent) {
              console.log(`⚠️ [AI Agent] Mídia ${action.media_name} já foi enviada - REMOVIDA para eviar duplicação`);
            }
            return !alreadySent;
          });
          
          if (mediaActions.length < originalCount) {
            console.log(`📁 [AI Agent] ${originalCount - mediaActions.length} mídia(s) removida(s) por já terem sido enviadas`);
          }
        }
      }
    }
    
    // 🚨 RESGATE DE MÍDIA - Apenas quando IA DISSE que vai enviar mas ESQUECEU a tag
    // V23e: Removido o sistema agressivo que fazia SEGUNDA chamada LLM para forçar mídia.
    // Agora confiamos na decisão da IA principal (que já tem o prompt de mídia).
    // Só intervém se a IA EXPLICITAMENTE disse "vou te enviar um áudio/vídeo/foto" mas não incluiu [MEDIA:].
    let shouldSkipGenericFallbackForOperationalTextRequest = false;

    if (hasMedia && mediaActions.length === 0) {
      const aiHadMediaIntent = responseText ? detectMediaSendingIntent(responseText) : false;
      const explicitOperationalMediaRequest = isExplicitOperationalMediaRequest(newMessageText);
      const hasMatchingOperationalMediaForRequest = explicitOperationalMediaRequest
        ? hasActiveTraditionalMediaForOperationalRequest({
            message: newMessageText,
            mediaLibrary: (mediaLibrary || []).map((media) => ({
              name: media.name,
              mediaType: media.mediaType,
              description: media.description,
              whenToUse: media.whenToUse,
              caption: media.caption,
              isActive: media.isActive,
            })),
          })
        : false;
      shouldSkipGenericFallbackForOperationalTextRequest =
        explicitOperationalMediaRequest && !hasMatchingOperationalMediaForRequest;
      const ignoreOperationalFalsePositiveMediaIntent =
        aiHadMediaIntent &&
        isOperationalTextOnlyFalsePositiveMediaIntent({
          customerMessage: newMessageText,
          assistantResponse: responseText,
          mediaLibrary: (mediaLibrary || []).map((media) => ({
            name: media.name,
            mediaType: media.mediaType,
            description: media.description,
            whenToUse: media.whenToUse,
            caption: media.caption,
            isActive: media.isActive,
          })),
        });
      const effectiveAiHadMediaIntent =
        aiHadMediaIntent && !ignoreOperationalFalsePositiveMediaIntent;
      const shouldRunSemanticMediaRescue = shouldRunTraditionalMediaSemanticRescue({
        aiHadMediaIntent: effectiveAiHadMediaIntent,
        explicitOperationalMediaRequest: explicitOperationalMediaRequest && hasMatchingOperationalMediaForRequest,
        hasTraditionalMedia: hasMedia,
        productsData,
      });

      if (shouldRunSemanticMediaRescue) {
        console.log(`\n🚨 [AI Agent] ⚡ Resgate de mídia ativado!`);
        if (effectiveAiHadMediaIntent) {
        console.log(`🚨 [AI Agent] 💬 Resposta: "${responseText!.substring(0, 200)}..."`);
        }
        if (explicitOperationalMediaRequest && hasMatchingOperationalMediaForRequest && !aiHadMediaIntent) {
          console.log(`🚨 [AI Agent] 📍 Pedido operacional explícito detectado na mensagem atual`);
        }
        
        const forceResult = await forceMediaDetection(
          newMessageText,
          conversationHistory,
          mediaLibrary,
          sentMedias,
          responseText || undefined
        );
        
        if (forceResult.shouldSendMedia && forceResult.mediaToSend) {
          console.log(`🚨 [AI Agent] 🎯 RESGATE: ${forceResult.mediaToSend.name}`);
          
          mediaActions.push({
            type: 'send_media',
            media_name: forceResult.mediaToSend.name,
          });
          
          console.log(`🚨 [AI Agent] ✅ Mídia ${forceResult.mediaToSend.name} ADICIONADA via resgate!`);
        } else {
          console.log(`🚨 [AI Agent] ❌ Resgate não encontrou mídia adequada`);
          shouldSemanticallyAlignTextWithoutMedia =
            effectiveAiHadMediaIntent || (explicitOperationalMediaRequest && hasMatchingOperationalMediaForRequest);
        }
      } else {
        console.log(`📁 [AI Agent] IA não incluiu mídia - decisão respeitada (sem forçar)`);
      }
    }

    if (hasMedia) {
      const delivery2MenuActions = await buildDelivery2MenuMediaActions({
        userId,
        messageText: newMessageText,
        conversationHistory,
        mediaLibrary,
      });

      if (delivery2MenuActions.length > 0) {
        const existingMediaNames = new Set(
          mediaActions
            .map((action) => String(action.media_name || "").trim())
            .filter(Boolean)
            .map((name) => foldMediaName(name)),
        );

        for (const action of delivery2MenuActions) {
          const foldedName = foldMediaName(action.media_name);
          if (existingMediaNames.has(foldedName)) {
            continue;
          }
          existingMediaNames.add(foldedName);
          mediaActions.push(action);
        }

        if (delivery2MenuActions.length > 0) {
          console.log(`🍕 [AI Agent] Fluxo de cardápio do Delivery 2.0 anexado para esta conversa`);
        }
      }
    }

    let deterministicCatalogMultiCodeReplyApplied = false;

    if (responseText) {
      const deterministicCatalogMultiCodeReply = buildDeterministicCatalogMultiCodeReply({
        productsData,
        currentMessage: newMessageText,
        conversationHistory,
        assistantResponse: responseText,
      });

      if (deterministicCatalogMultiCodeReply) {
        responseText = deterministicCatalogMultiCodeReply;
        deterministicCatalogMultiCodeReplyApplied = true;
        mediaActions = mediaActions.filter((action) => {
          const mediaName = String(action?.media_name || "").trim().toUpperCase();
          return !mediaName.startsWith("CATALOG_PRODUCT_IMAGE:");
        });
        console.log(`📦 [AI Agent] Resposta determinística aplicada para seleção longa do catálogo`);
      }
    }

    if (responseText && !deterministicCatalogMultiCodeReplyApplied) {
      const catalogMediaActions = await maybeAttachCatalogProductImages({
        clientMessage: newMessageText,
        assistantResponse: responseText,
        conversationHistory,
        productsData,
        sentMedias,
      });

      if (catalogMediaActions.length > 0) {
        const selectedProductLabel = Array.from(
          new Set(
            catalogMediaActions
              .map((action) => String(action.caption || "").trim())
              .filter(Boolean),
          ),
        ).join(" e ");

        responseText = await harmonizeCatalogProductResponseForSentImages({
          assistantResponse: responseText,
          productLabel: selectedProductLabel || "produto",
          imageCount: catalogMediaActions.length,
        });

        const existingMediaNames = new Set(
          mediaActions
            .map((action) => String(action.media_name || "").toUpperCase())
            .filter(Boolean),
        );

        for (const action of catalogMediaActions) {
          const mediaName = String(action.media_name || "").toUpperCase();
          if (mediaName && existingMediaNames.has(mediaName)) {
            continue;
          }
          if (mediaName) {
            existingMediaNames.add(mediaName);
          }
          mediaActions.push(action);
        }
      }
    }

    const agenteZapFunnelGuard = applyAgenteZapConfiguredFunnelGuard({
      enabled: true,
      message: newMessageText,
      conversationHistory,
      sentMedias,
      text: responseText,
      mediaActions,
      mediaLibrary,
      agentConfig,
      businessConfig,
    });
    if (agenteZapFunnelGuard.stage) {
      responseText = agenteZapFunnelGuard.text;
      mediaActions = agenteZapFunnelGuard.mediaActions;
      console.log(`📌 [AI Agent] Funil sequencial configurado aplicado no runtime stateful: ${agenteZapFunnelGuard.stage}`);
    }
    
    // 🔄 PROCESSAR PLACEHOLDERS NA RESPOSTA FINAL ({{nome}}, saudações)
    if (responseText !== null && responseText !== undefined) {
      responseText = maybeGroundRealEstateReply({
        customerMessage: newMessageText || "",
        responseText,
        catalog: realEstateCatalog,
        conversationHistory,
      });
      responseText = processResponsePlaceholders(responseText, contactName);
      console.log(`🔄 [AI Agent] Placeholders processados na resposta`);
    }

    if (openingRuleForCurrentTurn && !openingRuleForCurrentTurn.variationEnabled) {
      responseText = composeMandatoryOpeningResponse(
        getOpeningTextForCustomerMessage(openingRuleForCurrentTurn.text, newMessageText),
        removeLeadingRedundantOpeningQuestion(responseText, newMessageText),
      );
      console.log(`📌 [AI Agent] Abertura obrigatoria fixa aplicada na resposta`);
    }

    mediaActions = mergeInitialOpeningMediaActions(openingMediaActions, mediaActions);
    const suppressingMediaNames = getSuppressingMediaNames(mediaActions, mediaLibrary);
    const greetingOpeningFlowAttached = hasGreetingOpeningFlowAction(mediaActions);

    if (greetingOpeningFlowAttached) {
      console.log(`📌 [AI Agent] Fluxo de saudação dedicado anexado - suprimindo texto livre da LLM`);
      responseText = null;
    }

    if (suppressingMediaNames.length > 0) {
      console.log(`📁 [AI Agent] Mídia configurada para suprimir texto principal: ${suppressingMediaNames.join(", ")}`);
      responseText = null;
    }

    if (
      conversationHistory.length === 0 &&
      !shouldIdentifyRealEstatePropertyFirst &&
      shouldForceContextualOpeningResponse(newMessageText) &&
      !greetingOpeningFlowAttached &&
      !shouldSuppressTextResponseForMediaActions(mediaActions, mediaLibrary)
    ) {
      if (hasGreetingOpeningFlowAction(openingMediaActions)) {
        responseText = null;
      } else {
      responseText = await repairFirstConcreteOpeningReply({
        llmClient,
        model,
        customerMessage: newMessageText,
        draftReply: responseText,
        mediaActionCount: mediaActions.length,
        openingText: getOpeningTextForCustomerMessage(openingRuleForCurrentTurn?.text || "", newMessageText),
        openingFlowAlreadySent: openingMediaActions.length > 0,
        openingFlowSummary: describeOpeningMediaActions(openingMediaActions),
      });

      if (responseText !== null && responseText !== undefined) {
        responseText = processResponsePlaceholders(responseText, contactName);
      }
      }
    }
    

    // Price-flow enforcement: garantir mencao ao R$49 quando lead pediu preco
    if (priceFlowFallback) {
      const responseNormalized = normalizePriceLeadText(responseText || "");
      const hasPriceMention = responseNormalized.includes("r$ 49") || responseNormalized.includes("r$49") || responseNormalized.includes("49/mes") || responseNormalized.includes("49 mes");
      if (!hasPriceMention) {
        console.log(`[PRICE FLOW] Fallback aplicado`);
        responseText = priceFlowFallback;
      }
    }

    if (responseText && options?.contactPhone && newMessageText && !schedulingReplyForHumanization) {
      // Gate 3: Só override se NÃO houve humanização (senão o LLM já reescreveu)
      try {
        const deterministicSchedulingOverride = await generateDeterministicSchedulingReply(
          userId,
          options.contactPhone,
          newMessageText,
          conversationHistory.map((message) => ({
            text: message.text,
            fromMe: message.fromMe,
          })),
        );

        if (deterministicSchedulingOverride) {
          const isOverrideBookingAction = deterministicSchedulingOverride.includes('[AGENDAR:') || deterministicSchedulingOverride.includes('[CANCELAR:');
          if (isOverrideBookingAction) {
            // Booking/cancel: sempre override
            console.log(`📅 [AI Agent] Resposta livre revalidada pelo executor determinístico de agenda (booking/cancel)`);
            responseText = deterministicSchedulingOverride;
          } else {
            // Non-booking: não sobrescrever a resposta humanizada do LLM
            console.log(`📅 [AI Agent] Gate 3: scheduling reply non-booking - mantendo resposta do LLM`);
          }
        }
      } catch (schedulingOverrideError) {
        console.error(`📅 [AI Agent] Erro ao validar resposta livre de agenda:`, schedulingOverrideError);
      }
    } else if (schedulingReplyForHumanization) {
      console.log(`📅 [AI Agent] Gate 3 SKIPPED: LLM já humanizou a resposta de agendamento`);
    }

    // 📅 PROCESSAR TAGS DE AGENDAMENTO [AGENDAR: DATA=..., HORA=..., NOME=...]
    // Se o booking já foi processado no Gate 1, aproveitar o resultado
    let appointmentCreated: any = schedulingBookingResult.appointmentCreated || undefined;
    if (responseText && options?.contactPhone) {
      try {
        const schedulingResult = await processSchedulingTags(
          responseText,
          userId,
          options.contactPhone,
          options.conversationId,
        );
        responseText = schedulingResult.text;
        if (schedulingResult.appointmentCreated) {
          appointmentCreated = schedulingResult.appointmentCreated;
          console.log(`📅 [AI Agent] Appointment created: ${appointmentCreated.id} for ${appointmentCreated.client_name}`);
        }
      } catch (schedError) {
        console.error(`📅 [AI Agent] Error processing scheduling tags:`, schedError);
      }
    }

    // 📅 PROCESSAR TAGS DE CANCELAMENTO [CANCELAR: DATA=..., HORA=..., NOME=...]
    if (responseText && options?.contactPhone) {
      try {
        const cancelResult = await processSchedulingCancelTags(responseText, userId, options.contactPhone);
        responseText = cancelResult.text;
        if (cancelResult.appointmentCancelled) {
          console.log(`📅 [AI Agent] Appointment cancelled successfully`);
        }
      } catch (cancelError) {
        console.error(`📅 [AI Agent] Error processing cancellation tags:`, cancelError);
      }
    }

    // 🍕 PROCESSAR TAGS DE PEDIDO DE DELIVERY [PEDIDO_DELIVERY: ...]
    let deliveryOrderCreated: any = undefined;
    if (responseText && options?.contactPhone) {
      try {
        const deliveryResult = await processDeliveryOrderTags(
          responseText, 
          userId, 
          options.contactPhone,
          options.conversationId
        );
        responseText = deliveryResult.text;
        if (deliveryResult.orderCreated) {
          deliveryOrderCreated = deliveryResult.orderCreated;
          console.log(`🍕 [AI Agent] Delivery order created: #${deliveryOrderCreated.id} for ${deliveryOrderCreated.customer_name}`);
        }
      } catch (deliveryError) {
        console.error(`🍕 [AI Agent] Error processing delivery order tags:`, deliveryError);
      }
    }

    let mediaExecutionAlignmentDecision: MediaExecutionAlignmentDecision | null = null;
    if (responseText && (mediaActions.length > 0 || shouldSemanticallyAlignTextWithoutMedia)) {
      mediaExecutionAlignmentDecision = await resolveMediaExecutionAlignment({
        customerMessage: newMessageText || "",
        assistantResponse: responseText,
        mediaActions,
        mediaLibrary: (mediaLibrary || []).map((media) => ({
          name: media.name,
          mediaType: media.mediaType,
          whenToUse: media.whenToUse,
          isActive: media.isActive,
        })),
        operationalContext: activeEstampariaProfile
          ? "Módulo Estamparia ativo: preparar ou gerar arte para revisão interna não significa que a imagem foi anexada nesta resposta. Preserve a continuidade do pedido e reescreva apenas se o texto disser que a mídia já está sendo enviada agora."
          : null,
      });

      if (
        mediaExecutionAlignmentDecision.shouldRewriteWithoutMedia &&
        mediaExecutionAlignmentDecision.rewrittenText
      ) {
        console.log(
          `🧠 [AI Agent] Texto reescrito para não prometer mídia sem envio real (${mediaExecutionAlignmentDecision.reason})`,
        );
        responseText = processResponsePlaceholders(
          mediaExecutionAlignmentDecision.rewrittenText,
          contactName,
        );
      }

      if (shouldApplyHonestNoMediaFallback({
        shouldSemanticallyAlignTextWithoutMedia,
        mediaActionsCount: mediaActions.length,
        responseText,
        activeEstampariaProfile: Boolean(activeEstampariaProfile),
        alignmentDecision: mediaExecutionAlignmentDecision,
      })) {
        console.log(`🧠 [AI Agent] Aplicando fallback honesto para não prometer mídia sem ação real`);
        responseText = buildSafeMediaExpectationFallback({
          contactName,
          mediaLibrary: (mediaLibrary || []).map((media) => ({
            name: media.name,
            mediaType: media.mediaType,
            isActive: media.isActive,
          })),
        });
      }
    }
    
    // 🔄 VERIFICAÇÃO ANTI-LOOP - Não enviar mesma resposta repetidamente
    if (responseText) {
      const conversationKey = `${userId}:${options?.contactPhone || options?.contactName || 'unknown'}`;
      if (isDuplicateResponse(conversationKey, responseText)) {
        console.log(`🔄 [AI Agent] Resposta duplicada detectada - BLOQUEANDO para evitar loop`);
        console.log(`   Resposta: ${responseText.substring(0, 80)}...`);
        return null;
      }
    }

    // 🍕 VALIDAÇÃO CRÍTICA DE PREÇOS - Impede IA de inventar preços de delivery
    // Esta validação ocorre em TODAS as respostas quando o delivery está ativo
    if (responseText) {
      try {
        const deliveryData = await getDeliveryData(userId);
        if (deliveryData && deliveryData.totalItems > 0) {
          // Verificar se a resposta contém preços (R$ XX,XX)
          const hasPrice = /R\$\s*\d+[.,]\d{2}/i.test(responseText);

          if (hasPrice) {
            console.log(`🍕 [AI Agent] Resposta contém preços - validando contra cardápio...`);

            const validation = validatePriceInResponse(responseText, deliveryData);

            if (!validation.valid) {
              console.log(`⚠️ [AI Agent] PREÇOS INCORRETOS DETECTADOS E CORRIGIDOS:`);
              validation.errors.forEach(err => console.log(`   - ${err}`));
              responseText = validation.corrected;
              console.log(`✅ [AI Agent] Resposta corrigida aplicada`);
            } else {
              console.log(`✅ [AI Agent] Preços validados - todos corretos`);
            }
          }
        }
      } catch (priceValidationError) {
        console.error(`⚠️ [AI Agent] Erro na validação de preços (continuando):`, priceValidationError);
      }
    }

    if (responseText !== null && responseText !== undefined) {
      const sanitizedCustomerText = sanitizeCustomerFacingResponseText(responseText);
      if (sanitizedCustomerText !== responseText) {
        console.log(`🧼 [AI Agent] Resposta sanitizada para evitar vazamento de instrucoes internas`);
      }
      responseText = sanitizedCustomerText;
    }

    const alignedMediaExecution = applyMediaExecutionAlignment({
      responseText,
      mediaActions,
      alignment: mediaExecutionAlignmentDecision,
    });
    responseText = alignedMediaExecution.responseText;
    mediaActions = alignedMediaExecution.mediaActions;

    const shouldForceTimedGreetingBeforeFirstMedia =
      conversationHistory.length === 0 &&
      shouldForceContextualOpeningResponse(newMessageText) &&
      mediaActions.length > 0 &&
      !hasGreetingOpeningFlowAction(mediaActions) &&
      !shouldSuppressTextResponseForMediaActions(mediaActions, mediaLibrary);

    if (shouldForceTimedGreetingBeforeFirstMedia) {
      responseText = ensureOpeningGreetingForBrazilTime(responseText);
      console.log(`🌅 [AI Agent] Saudação inicial por horário de Brasília garantida antes da primeira mídia`);
    }

    if (
      mediaExecutionAlignmentDecision?.textShouldWaitForMedia &&
      mediaExecutionAlignmentDecision?.hasImmediateDeliveryClaim &&
      responseText === null
    ) {
      console.log(
        `🧠 [AI Agent] Texto principal convertido em ação posterior para só sair depois da mídia (${mediaExecutionAlignmentDecision.reason})`,
      );
    }

    if (options?.conversationId) {
      void queueConversationEstampariaRequest({
        conversationId: options.conversationId,
        latestAgentReply: responseText || "[fluxo de abertura]",
      });
      void queueConversationDelivery2Order({
        conversationId: options.conversationId,
        latestAgentReply: responseText || "[fluxo de abertura]",
      });
    }

    return {
      text: responseText,
      mediaActions,
      attention,
      routing,
      notification,
      appointmentCreated,
      deliveryOrderCreated,
    };
  } catch (error: any) {
    console.error("Error generating AI response:", error);
    
    // 🔍 DEBUG: Tentar extrair detalhes do erro da API
    if (error?.body && typeof error.body.pipe === 'function') {
      console.error("⚠️ [AI Agent] API Error Body is a stream, cannot read directly.");
    } else if (error?.response) {
      try {
        const errorBody = await error.response.text();
        console.error(`⚠️ [AI Agent] API Error Details: ${errorBody}`);
      } catch (e) {
        console.error("⚠️ [AI Agent] Could not read API error body");
      }
    } else if (error?.message) {
      console.error(`⚠️ [AI Agent] Error message: ${error.message}`);
    }
    
    return null;
  }
  });
}

function normalizeSimulatorSessionId(sessionId?: string): string {
  const raw = String(sessionId || "").trim().toLowerCase();
  return raw.replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "default";
}

function buildSimulatorSessionHash(userId: string, sessionId?: string): string {
  const seed = `${userId}:${normalizeSimulatorSessionId(sessionId)}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8) || "sim";
}

function buildSimulatorConversationId(
  userId: string,
  sessionId?: string,
  prefix: string = "simulator"
): string {
  const userPrefix = userId.split("-")[0] || "user";
  return `${prefix}-${userPrefix}-${buildSimulatorSessionHash(userId, sessionId)}`;
}

function buildSimulatorContactPhone(userId: string, sessionId?: string): string {
  const userPrefix = userId.split("-")[0] || "user";
  return `sim-${userPrefix}-${buildSimulatorSessionHash(userId, sessionId)}`;
}

async function persistSimulatorConversationForInsights(params: {
  userId: string;
  simulatorContactPhone: string;
  contactName: string;
  history: Message[];
  customerMessage: string;
  agentReply?: string | null;
}): Promise<string | null> {
  const existingConnections = await storage.getConnectionsByUserId(params.userId);
  let connection =
    existingConnections.find((candidate) => isInternalOnlySimulatorConnection(candidate)) || null;

  if (!connection) {
    connection = await storage.createConnection(
      buildInternalSimulatorConnectionInsert(params.userId),
    );
  }

  let conversation =
    (await storage.getConversationByContactNumber(connection.id, params.simulatorContactPhone)) ||
    null;

  if (!conversation) {
    conversation = await storage.createConversation({
      connectionId: connection.id,
      contactNumber: params.simulatorContactPhone,
      remoteJid: `${params.simulatorContactPhone}@s.whatsapp.net`,
      jidSuffix: "s.whatsapp.net",
      contactName: params.contactName,
      contactAvatar: null,
      lastMessageText: null,
      lastMessageTime: null,
      lastMessageFromMe: null,
      unreadCount: 0,
    });
  }

  await storage.clearConversationOperationalHistory(conversation.id);

  const transcript: Array<{
    fromMe: boolean;
    text: string;
    timestamp: Date;
    isFromAgent: boolean;
  }> = [];

  const baseTimeMs =
    params.history
      .map((message) =>
        message.timestamp instanceof Date
          ? message.timestamp.getTime()
          : new Date(message.timestamp || Date.now()).getTime(),
      )
      .filter((time) => Number.isFinite(time))
      .sort((a, b) => a - b)[0] || Date.now();

  params.history.forEach((message, index) => {
    const text = String(message.text || "").trim();
    if (!text) return;

    const timestamp =
      message.timestamp instanceof Date
        ? message.timestamp
        : new Date(message.timestamp || baseTimeMs + index * 1000);

    transcript.push({
      fromMe: Boolean(message.fromMe),
      text,
      timestamp,
      isFromAgent: Boolean(message.fromMe || message.isFromAgent),
    });
  });

  const lastKnownTimeMs =
    transcript[transcript.length - 1]?.timestamp.getTime() || Date.now();

  transcript.push({
    fromMe: false,
    text: params.customerMessage,
    timestamp: new Date(lastKnownTimeMs + 1000),
    isFromAgent: false,
  });

  const finalAgentReply = String(params.agentReply || "").trim();
  if (finalAgentReply) {
    transcript.push({
      fromMe: true,
      text: finalAgentReply,
      timestamp: new Date(lastKnownTimeMs + 2000),
      isFromAgent: true,
    });
  }

  for (let index = 0; index < transcript.length; index++) {
    const message = transcript[index];
    await storage.createMessage({
      conversationId: conversation.id,
      messageId: `sim-audit-${Date.now()}-${index}-${message.fromMe ? "agent" : "client"}`,
      fromMe: message.fromMe,
      text: message.text,
      timestamp: message.timestamp,
      status: message.fromMe ? "sent" : "received",
      isFromAgent: message.isFromAgent,
    });
  }

  const lastMessage = transcript[transcript.length - 1];
  await storage.updateConversation(conversation.id, {
    remoteJid: `${params.simulatorContactPhone}@s.whatsapp.net`,
    jidSuffix: "s.whatsapp.net",
    contactName: params.contactName,
    lastMessageText: lastMessage?.text || null,
    lastMessageTime: lastMessage?.timestamp || null,
    lastMessageFromMe: lastMessage?.fromMe || false,
    unreadCount: 0,
    hasReplied: transcript.some((message) => message.fromMe),
  });

  return conversation.id;
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

/**
 * 🧪 SIMULADOR UNIFICADO - USA EXATAMENTE O MESMO FLUXO DO WHATSAPP
 * 
 * Esta função agora chama generateAIResponse internamente para garantir
 * que o simulador se comporta IDENTICAMENTE ao agente real.
 * 
 * Diferenças controladas:
 * - conversationHistory: vem do parâmetro (simulador mantém em memória)
 * - contactName: configurável (default "Visitante")
 * - sentMedias: rastreado pelo simulador
 * - appointmentCreated: retorna agendamento criado (se houver)
 */
export async function testAgentResponse(
  userId: string,
  testMessage: string,
  customPrompt?: string,
  conversationHistory?: Array<{
    id?: string;
    text?: string | null;
    fromMe?: boolean;
    timestamp?: Date;
  }>,
  sentMedias?: string[],
  contactName?: string,
  sessionId?: string
): Promise<{ text: string | null; mediaActions: MistralResponse['actions']; appointmentCreated?: any; deliveryOrderCreated?: any }> {
  return runWithLLMUserContext(userId, async () => {
  try {
    console.log(`\n🧪 ═══════════════════════════════════════════════════════════════`);
    console.log(`🧪 [SIMULADOR] Nome do contato: ${contactName}`);
    console.log(`🧪 ═══════════════════════════════════════════════════════════════`);
    
    // 🔐 VERIFICAÇÃO DE API KEY ANTES DE TUDO
    // Se não houver API key configurada, retorna mensagem de erro amigável
    const llmConfig = await getLLMConfig(userId);
    const hasOpenRouterKey = llmConfig.openrouterApiKey && llmConfig.openrouterApiKey.length > 20;
    const hasGroqKey = llmConfig.groqApiKey && llmConfig.groqApiKey.length > 20;
    const hasMistralKey = (llmConfig.mistralApiKey && llmConfig.mistralApiKey.length > 10) || (!!process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.length > 10);
    
    if (!hasOpenRouterKey && !hasGroqKey && !hasMistralKey) {
      console.error('🧪 [SIMULADOR] ❌ ERRO: Nenhuma API key configurada!');
      return {
        text: "⚠️ **Simulador Indisponível**\n\nNenhuma chave de API (LLM) está configurada.\n\n📋 Para resolver:\n1. Vá em **Admin → Configurações**\n2. Escolha um provedor (OpenRouter é gratuito!)\n3. Cole sua chave de API\n4. Salve e teste novamente\n\n💡 Dica: OpenRouter oferece modelos gratuitos como GPT-OSS 20B",
        mediaActions: [],
        appointmentCreated: undefined,
        deliveryOrderCreated: undefined
      };
    }
    
    const agentConfig = await storage.getAgentConfig(userId);

    if (!agentConfig) {
      throw new Error("Agent not configured");
    }

    let mediaLibrary: Array<{ name: string; suppressTextResponse?: boolean | null }> = [];
    try {
      mediaLibrary = await getAgentMediaLibrary(userId);
    } catch (mediaLibraryError) {
      console.warn(`⚠️ [SIMULADOR] Falha ao carregar biblioteca de mídias do agente:`, mediaLibraryError);
    }
    
    // Preparar histórico de conversação (converter formato simples para Message[])
    const history: Message[] = ((conversationHistory || []) as Message[]);
    const simulatorSessionId = sessionId || userId;
    const simulatorConversationId = buildSimulatorConversationId(userId, simulatorSessionId);
    const simulatorChatbotConversationId = buildSimulatorConversationId(
      userId,
      simulatorSessionId,
      "simulator-chatbot"
    );
    const simulatorContactPhone = buildSimulatorContactPhone(userId, simulatorSessionId);
    
    console.log(`🧪 [SIMULADOR] Histórico: ${history.length} mensagens`);
    console.log(`🧪 [SIMULADOR] Mídias já enviadas: ${sentMedias?.length || 0}`);
    console.log(`🧪 [SIMULADOR] Sessão: ${simulatorSessionId} | Contato: ${simulatorContactPhone}`);

    const simulatorTriggerResult = hasSimulatorTriggerMatch({
      triggerPhrases: agentConfig.triggerPhrases,
      messageText: testMessage,
      conversationHistory: history,
    });

    if (!simulatorTriggerResult.matched) {
      console.log(`⏸️ [SIMULADOR] Sem resposta: nenhuma frase gatilho encontrada para user ${userId}`);
      console.log(`   Trigger phrases configuradas: ${(agentConfig.triggerPhrases || []).join(", ")}`);
      console.log(`   Mensagem atual: "${testMessage.substring(0, 100)}"`);
      return {
        text: null,
        mediaActions: [],
        appointmentCreated: undefined,
        deliveryOrderCreated: undefined,
      };
    }

    if (simulatorTriggerResult.foundIn !== "no-filter") {
      console.log(`✅ [SIMULADOR] Trigger phrase detected (${simulatorTriggerResult.foundIn}) for user ${userId}`);
    }
    
    // O simulador nao faz mais atalho de primeira resposta.
    // Assim ele respeita a mesma orquestracao do WhatsApp real para saudacao,
    // horario, mensagem fora do horario e respostas factuais na primeira interacao.
    
    // ═══════════════════════════════════════════════════════════════════════
    // 🔀 PARTE 5 - MODO FLUXO: VERIFICAR SE FLUXO ESTÁ ATIVO (PRIORIDADE MÁXIMA)
    // Quando flowModeActive=true, a IA segue estritamente o roteiro.
    // Sem improviso, sem saída do fluxo, guardrails fortes.
    // ═══════════════════════════════════════════════════════════════════════
    const flowModeActive = (agentConfig as any).flowModeActive === true;
    const flowScript = (agentConfig as any).flowScript;
    const flowRuntimeState =
      flowModeActive && flowScript && flowScript.trim().length > 10
        ? await getFlowConversationState({
            userId,
            conversationId: simulatorConversationId,
            flowScript,
          })
        : null;

    // 🔀 PARTE 5 CORREÇÃO CRÍTICA:
    // Se flowModeActive=true, o roteiro tem PRIORIDADE MÁXIMA mesmo que customPrompt seja passado.
    // Isso garante que o simulador e o atendimento real sempre usem o mesmo FlowScriptEngine.
    if (flowRuntimeState?.status === "handoff") {
      console.log(`🔀 [SIMULADOR] conversa já encaminhada para humano; desativando IA da conversa`);
      await storage.disableAgentForConversation(simulatorConversationId, null);
      await runSimulatorOperationalInsights({
        userId,
        simulatorContactPhone,
        contactName,
        history,
        customerMessage: testMessage,
        agentReply: "Vou direcionar seu atendimento para uma pessoa da equipe.",
      });
      return {
        text: "Vou direcionar seu atendimento para uma pessoa da equipe.",
        mediaActions: [],
      };
    }

    if (flowModeActive && flowScript && flowScript.trim().length > 10 && !flowRuntimeState) {
      console.log(`🔀 [SIMULADOR] ✅ MODO FLUXO ATIVO - usando FlowScriptEngine (prioridade máxima)`);
      
      try {
        const { executeFlowResponse } = await import("./flowScriptEngine");
        
        // Converter histórico para formato do FlowScriptEngine
        const flowHistory = history.slice(-10).map(msg => ({
          role: (msg.fromMe ? "assistant" : "user") as "user" | "assistant",
          content: msg.text || "",
        }));
        
        const flowResult = await executeFlowResponse(testMessage, flowScript, flowHistory, userId);
        let finalText = flowResult.response;
        let finalMediaActions = flowResult.mediaActions || [];

        try {
          const groundedFlowResponse =
            (await groundRealEstateReplyForUserTurn({
              userId,
              customerMessage: testMessage,
              responseText: flowResult.response,
              conversationHistory: history,
            })) || flowResult.response;
          const finalizedFlowResult = await finalizeFlowEngineResponse({
            userId,
            agentConfig,
            customerMessage: testMessage,
            conversationHistory: history,
            contactName,
            text: groundedFlowResponse,
            mediaActions: flowResult.mediaActions || [],
            mediaLibrary,
          });

          finalText = finalizedFlowResult.text || flowResult.response;
          finalMediaActions = finalizedFlowResult.mediaActions || flowResult.mediaActions || [];

          if (flowResult.finalAction) {
            await persistFlowConversationState({
              userId,
              conversationId: simulatorConversationId,
              flowScript,
              finalAction: flowResult.finalAction,
              selectedFlowId: flowResult.selectedFlowId || null,
              selectedStepId: flowResult.selectedStepId || null,
              selectedBranchId: flowResult.selectedBranchId || null,
              responseText: finalText,
              mediaActions: finalMediaActions,
              conversationHistory: history.map((message) => ({
                id: message.id,
                chatId: message.chatId,
                text: message.text,
                fromMe: message.fromMe,
                timestamp: message.timestamp,
                isFromAgent: message.isFromAgent,
              })) as Message[],
            });

            if (flowResult.finalAction === "handoff") {
              await storage.disableAgentForConversation(simulatorConversationId, null);
            }
          }
        } catch (flowPostProcessError) {
          console.warn(`⚠️ [SIMULADOR FLUXO] Falha no pós-processamento; usando resposta bruta do fluxo:`, flowPostProcessError);
        }
        
        console.log(`🔀 [SIMULADOR FLUXO] Resposta gerada (${flowResult.response.length} chars)`);
        
        await runSimulatorOperationalInsights({
          userId,
          simulatorContactPhone,
          contactName,
          history,
          customerMessage: testMessage,
          agentReply: finalText,
        });

        return {
          text: finalText,
          mediaActions: finalMediaActions,
        };
      } catch (flowError: any) {
        console.error(`🔀 [SIMULADOR FLUXO] Erro no FlowScriptEngine:`, flowError);
        await runSimulatorOperationalInsights({
          userId,
          simulatorContactPhone,
          contactName,
          history,
          customerMessage: testMessage,
          agentReply: "Olá! Estou disponível para ajudar. Por favor, siga as instruções do atendimento. 😊",
        });
        return {
          text: "Olá! Estou disponível para ajudar. Por favor, siga as instruções do atendimento. 😊",
          mediaActions: [],
        };
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🤖 CHATBOT VISUAL (FLOW BUILDER) - VERIFICAR PRIMEIRO
    // O chatbot visual tem prioridade sobre FlowEngine e IA
    // ═══════════════════════════════════════════════════════════════════════
    if (!customPrompt) {
      const chatbotActive = await isChatbotActive(userId);
      
      if (chatbotActive) {
        console.log(`🧪 [SIMULADOR] 🤖 Chatbot Visual ATIVO - usando Flow Builder`);
        
        // Determinar se é primeiro contato (histórico vazio)
        const isFirstContact = !history || history.length === 0;
        
        const chatbotResponse = await processChatbotMessage(
          userId,
          simulatorChatbotConversationId,
          simulatorContactPhone,
          testMessage,
          isFirstContact
        );
        
        if (chatbotResponse && chatbotResponse.messages.length > 0) {
          console.log(`🧪 [SIMULADOR] ✅ Chatbot Visual respondeu com ${chatbotResponse.messages.length} mensagens`);
          
          // Converter resposta do chatbot para formato do simulador
          const responseTexts: string[] = [];
          const mediaActions: MistralResponse['actions'] = [];
          
          for (const msg of chatbotResponse.messages) {
            if (msg.type === 'text') {
              responseTexts.push(msg.content);
            } else if (msg.type === 'buttons') {
              // Formatar botões como texto para o simulador (com indicador de POLL)
              let buttonText = msg.content.body || '';
              if (msg.content.header) {
                buttonText = `*${msg.content.header}*\n\n${buttonText}`;
              }
              buttonText += '\n\n📊 *ENQUETE (Poll):*';
              for (const btn of msg.content.buttons) {
                buttonText += `\n🔘 ${btn.title}`;
              }
              if (msg.content.footer) {
                buttonText += `\n\n_${msg.content.footer}_`;
              }
              responseTexts.push(buttonText);
            } else if (msg.type === 'list') {
              // Formatar lista como texto para o simulador
              let listText = msg.content.body || '';
              if (msg.content.header) {
                listText = `*${msg.content.header}*\n\n${listText}`;
              }
              listText += `\n\n📋 *LISTA (${msg.content.button_text || 'Ver opções'}):*`;
              for (const section of msg.content.sections || []) {
                if (section.title) {
                  listText += `\n\n*${section.title}*`;
                }
                for (const row of section.rows || []) {
                  listText += `\n• ${row.title}`;
                  if (row.description) {
                    listText += ` - ${row.description}`;
                  }
                }
              }
              if (msg.content.footer) {
                listText += `\n\n_${msg.content.footer}_`;
              }
              responseTexts.push(listText);
            } else if (msg.type === 'media') {
              mediaActions.push({
                type: 'send_media',
                media_name: msg.content.url,
                media_url: msg.content.url,
                caption: msg.content.caption
              });
              if (msg.content.caption) {
                responseTexts.push(`📎 *Mídia*: ${msg.content.caption}`);
              }
            }
          }
          
          const fullResponse = responseTexts.join('\n\n---\n\n');
          console.log(`🧪 [SIMULADOR] 🤖 Chatbot Visual resposta: "${fullResponse.substring(0, 100)}..."`);
          console.log(`🧪 ═══════════════════════════════════════════════════════════════\n`);
          
          await runSimulatorOperationalInsights({
            userId,
            simulatorContactPhone,
            contactName,
            history,
            customerMessage: testMessage,
            agentReply: fullResponse,
          });

          return {
            text: fullResponse,
            mediaActions,
            appointmentCreated: undefined,
            deliveryOrderCreated: undefined
          };
        }
        
        console.log(`🧪 [SIMULADOR] ⚠️ Chatbot Visual não gerou resposta, fallback para FlowEngine/IA`);
      }
    }
    
    // 🚀 VERIFICAR SE DEVE USAR FLOW ENGINE (Sistema Híbrido)
    // Se customPrompt foi fornecido, NÃO usar FlowEngine (teste de prompt não salvo)
    // 🍕 BYPASS FlowEngine quando delivery/scheduling está ativo (usar sistema determinístico)
    let bypassFlowEngineForDelivery = false;
    try {
      const [deliveryEnabled, schedulingEnabled, salonEnabled, providerEnabled, clinicEnabled] = await Promise.all([
        isDeliveryEnabled(userId),
        isSchedulingEnabled(userId),
        isSalonActive(userId),
        isProviderActive(userId),
        isClinicActive(userId),
      ]);
      bypassFlowEngineForDelivery = deliveryEnabled || schedulingEnabled || salonEnabled || providerEnabled || clinicEnabled;
      if (bypassFlowEngineForDelivery) {
        console.log(`🧪 [SIMULADOR] 🍕 BYPASS FlowEngine - delivery/agendamento/salão ativo`);
      }
    } catch (bypassErr) {
      console.log(`⚠️ [SIMULADOR] Erro ao verificar delivery/scheduling:`, bypassErr);
    }

    const effectiveCustomPrompt = bypassFlowEngineForDelivery ? undefined : customPrompt;
    if (bypassFlowEngineForDelivery && customPrompt) {
      console.log(`🧪 [SIMULADOR] 🍕 Ignorando customPrompt porque delivery/agendamento/salão está ativo`);
    }
    
    const useFlowEngine = !effectiveCustomPrompt && !bypassFlowEngineForDelivery && await shouldUseFlowEngine(userId);
    
    if (useFlowEngine) {
      console.log(`🧪 [SIMULADOR] 🚀 Usando FLOW ENGINE (Sistema Híbrido)`);
      console.log(`🧪 [SIMULADOR] IA → Interpreta intenção`);
      console.log(`🧪 [SIMULADOR] Sistema → Executa ação (determinístico)`);
      console.log(`🧪 [SIMULADOR] IA → Humaniza resposta`);
      
      // Verificar se LLM está configurado
      const llmClient = await getLLMClient(userId);
      if (!llmClient) {
        throw new Error("LLM não configurado");
      }
      
      // 🔧 CORREÇÃO: Obter API key do provider configurado (OpenRouter/Groq/Mistral)
      const llmConfig = await getLLMConfig(userId);
      const apiKey = llmConfig.provider === 'openrouter' 
        ? llmConfig.openrouterApiKey 
        : llmConfig.provider === 'groq' 
          ? llmConfig.groqApiKey 
          : (llmConfig.mistralApiKey || process.env.MISTRAL_API_KEY || '');
      
      if (!apiKey) {
        console.log(`⚠️ [SIMULADOR] Sem API key para provider ${llmConfig.provider}, usando sistema legado`);
      } else {
        const flowResult = await processWithFlowEngine(
          userId,
          simulatorConversationId,
          testMessage,
          apiKey,
          {
            contactName,
            history: history.map(m => ({ fromMe: m.fromMe, text: m.text || '' }))
          }
        );
        
        if (flowResult) {
          const groundedFlowText =
            (await groundRealEstateReplyForUserTurn({
              userId,
              customerMessage: testMessage,
              responseText: flowResult.text,
              conversationHistory: history,
            })) || flowResult.text;
          const finalizedFlowResult = await finalizeFlowEngineResponse({
            userId,
            agentConfig,
            customerMessage: testMessage,
            conversationHistory: history,
            contactName,
            text: groundedFlowText,
            mediaActions: flowResult.mediaActions || [],
            mediaLibrary,
          });
          console.log(`🧪 [SIMULADOR] ✅ FlowEngine respondeu: "${flowResult.text?.substring(0, 80)}..."`);
          console.log(`🧪 ═══════════════════════════════════════════════════════════════\n`);
          
          await runSimulatorOperationalInsights({
            userId,
            simulatorContactPhone,
            contactName,
            history,
            customerMessage: testMessage,
            agentReply: finalizedFlowResult.text,
          });

          return {
            text: finalizedFlowResult.text,
            mediaActions: finalizedFlowResult.mediaActions,
            appointmentCreated: undefined,
            deliveryOrderCreated: undefined
          };
        }
        
        console.log(`🧪 [SIMULADOR] ⚠️ FlowEngine sem resposta, fallback para sistema legado`);
      }
    } else {
      console.log(`🧪 [SIMULADOR] 📋 Usando sistema LEGADO (IA livre)`);
      if (effectiveCustomPrompt) {
        console.log(`🧪 [SIMULADOR] 📝 customPrompt fornecido - testando prompt não salvo`);
      }
    }
    
    // 🎯 FALLBACK: CHAMAR generateAIResponse - SISTEMA LEGADO
    // Isso é usado quando:
    // - Não há FlowDefinition para o usuário
    // - customPrompt foi fornecido (teste de prompt não salvo)
    // - FlowEngine não conseguiu processar a mensagem
    
    const result = await generateAIResponse(
      userId,
      history,
      testMessage,
      {
        contactName,
        // Use an isolated synthetic contact id in simulator mode to avoid
        // anti-loop collisions between independent test sessions.
        contactPhone: simulatorContactPhone,
        conversationId: simulatorConversationId,
        sentMedias: sentMedias || [],
      },
      effectiveCustomPrompt ? {
        getAgentConfig: async () => ({
          ...agentConfig,
          prompt: effectiveCustomPrompt,
        }),
      } : undefined
    );
    
    if (!result) {
      console.log(`🧪 [SIMULADOR] ⚠️ Sem resposta do generateAIResponse`);
      return { text: null, mediaActions: [], appointmentCreated: undefined, deliveryOrderCreated: undefined };
    }

    if (
      history.length === 0 &&
      result.text !== null &&
      result.text !== undefined &&
      shouldForceContextualOpeningResponse(testMessage) &&
      Array.isArray(result.mediaActions) &&
      result.mediaActions.length > 0
    ) {
      let simulatorEstampariaProfile: EstampariaProfile | null = null;
      try {
        simulatorEstampariaProfile = await getEstampariaPromptContext(userId);
      } catch (estampariaError) {
        console.error(`🧪 [SIMULADOR] Error loading Estamparia opening config:`, estampariaError);
      }
      const openingRuleForCurrentTurn = resolveAgentOpeningRule(
        getEstampariaAwareOpeningConfig(agentConfig, simulatorEstampariaProfile),
        contactName,
      );
      const hasDedicatedGreetingOpeningFlow = hasGreetingOpeningFlowAction(result.mediaActions);
      const contextualOpeningText = getOpeningTextForCustomerMessage(
        openingRuleForCurrentTurn?.text || "",
        testMessage,
      );
      const resultAlreadyStartsWithConfiguredOpening =
        Boolean(contextualOpeningText) &&
        normalizeOpeningComparison(String(result.text || "")).startsWith(
          normalizeOpeningComparison(contextualOpeningText),
        );
      const hasFixedOpeningComposedInText =
        Boolean(openingRuleForCurrentTurn) &&
        openingRuleForCurrentTurn?.variationEnabled !== true &&
        resultAlreadyStartsWithConfiguredOpening;

      if (hasDedicatedGreetingOpeningFlow) {
        result.text = null;
      } else if (!hasFixedOpeningComposedInText) {
        try {
          const llmClient = await getLLMClient();
          const currentProvider = await getCurrentProvider();
          const model = currentProvider === 'groq' ? undefined : agentConfig.model;
          const openingFlowAlreadySent = hasGreetingOpeningFlowAction(result.mediaActions);
          result.text = await repairFirstConcreteOpeningReply({
            llmClient,
            model,
            customerMessage: testMessage,
            draftReply: result.text,
            mediaActionCount: result.mediaActions.length,
            openingText: contextualOpeningText,
            openingFlowAlreadySent,
            openingFlowSummary: describeOpeningMediaActions(result.mediaActions),
          });
        } catch (repairError) {
          console.warn(`🧪 [SIMULADOR] Falha ao reparar primeira resposta concreta:`, repairError);
        }
      }
    }
    
    console.log(`🧪 [SIMULADOR] ✅ Resposta gerada: ${result.text?.substring(0, 80)}...`);
    console.log(`🧪 [SIMULADOR] 📁 Mídias na resposta: ${result.mediaActions?.length || 0}`);
    if (result.appointmentCreated) {
      console.log(`🧪 [SIMULADOR] 📅 Agendamento criado: ${result.appointmentCreated.id}`);
    }
    if (result.deliveryOrderCreated) {
      console.log(`🧪 [SIMULADOR] 🍕 Pedido de delivery criado: #${result.deliveryOrderCreated.id}`);
    }
    console.log(`🧪 ═══════════════════════════════════════════════════════════════\n`);

    await runSimulatorOperationalInsights({
      userId,
      simulatorContactPhone,
      contactName,
      history,
      customerMessage: testMessage,
      agentReply: result.text,
    });
    
    return { 
      text: result.text, 
      mediaActions: result.mediaActions || [],
      appointmentCreated: result.appointmentCreated,
      deliveryOrderCreated: result.deliveryOrderCreated
    };
  } catch (error) {
    console.error("🧪 [SIMULADOR] Error:", error);
    throw error;
  }
  });
}


