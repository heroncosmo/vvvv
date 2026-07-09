/**
 * ÃƒÂ°Ã…Â¸Ã‚Â¤Ã¢â‚¬â€œ SERVIÃƒÆ’Ã¢â‚¬Â¡O DE VENDAS AUTOMATIZADO DO ADMIN (RODRIGO) - NOVA VERSÃƒÆ’Ã†â€™O
 * 
 * FLUXO PRINCIPAL:
 * 1. Configurar agente (nome, empresa, funÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o, instruÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes)
 * 2. Modo de teste (#sair para voltar)
 * 3. AprovaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ PIX ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Conectar WhatsApp ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Criar conta
 * 
 * SEM QR CODE / PAREAMENTO durante onboarding!
 * Conta criada automaticamente com email fictÃƒÆ’Ã‚Â­cio para teste.
 */

import { storage } from "./storage";
import { generatePixQRCode } from "./pixService";
import { v4 as uuidv4 } from "uuid";
import { 
  generateAdminMediaPromptBlock, 
  type AdminMedia 
} from "./adminMediaStore";
import {
  scheduleAutoFollowUp,
  cancelFollowUp,
  scheduleContact,
  parseScheduleFromText,
  followUpService,
} from "./followUpService";
import { insertAgentMedia, updateAgentMedia, deleteAgentMedia, getAgentMediaLibrary, getMediaByName } from "./mediaService";
import { pool, withRetry } from "./db";
import { supabase } from "./supabaseAuth";
import { getAccessEntitlement } from "./accessEntitlement";
import { invalidateSchedulingCache } from "./schedulingService";
import { joinBubbleMessages, parseExplicitBubbleMessages } from "./whatsappMessageSplit";
import { repairMojibakeText } from "@shared/mojibake";
import type { InsertAiAgentConfig } from "@shared/schema";
import { sanitizeCustomerFacingResponseText } from "./customerFacingResponsePolicy";

import type { PendingAction } from './actionExecutorV2';

// V19: Admin Agent Tool Calling â€” Motor autÃ´nomo via LLM Tool Calling
import { processToolCallingMessage } from './adminAgentToolCalling';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface ClientSession {
  id: string;
  phoneNumber: string;
  
  // Dados do cliente
  userId?: string;
  email?: string;
  contactName?: string;
  
  // ConfiguraÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o do agente em criaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o
  agentConfig?: {
    name?: string;       // Nome do agente (ex: "Laura")
    company?: string;    // Nome da empresa (ex: "Loja Fashion")
    role?: string;       // FunÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o (ex: "Atendente", "Vendedor")
    prompt?: string;     // InstruÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes detalhadas
    sourceCustomerBrief?: string;
    serviceDescription?: string;
    codexCreateAgentContract?: boolean;
    customerEmail?: string;
  };
  
  // Estado do fluxo
  flowState: 'onboarding' | 'test_mode' | 'post_test' | 'payment_pending' | 'active';
  
  // Controles
  subscriptionId?: string;
  awaitingPaymentProof?: boolean;
  accountCreatedThisSession?: boolean;
  lastInteraction: Date;
  
  // HistÃƒÆ’Ã‚Â³rico
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
  }>;

  // CAMADA 2: Resumo de memÃƒÂ³ria (compactaÃƒÂ§ÃƒÂ£o)
  memorySummary?: string;

  // NEW: Media handling state
  pendingMedia?: {
    url: string;
    type: 'image' | 'audio' | 'video' | 'document';
    description?: string; // AI generated description
    whenCandidate?: string; // candidate trigger provided by admin before confirmation
    summary?: string; // short tag/summary from vision
  };
  uploadedMedia?: Array<{
    url: string;
    type: 'image' | 'audio' | 'video' | 'document';
    description?: string;
    whenToUse: string;
  }>;
  awaitingMediaContext?: boolean;
  awaitingMediaConfirmation?: boolean;
  // V17: Armazena a Ãºltima senha gerada para auto-login URLs
  lastGeneratedPassword?: string;
  
  // V18: Pending action para orquestrador V2 (modo ativo)
  pendingAction?: PendingAction;
  
  setupProfile?: {
    questionStage?: "business" | "behavior" | "workflow" | "hours" | "ready";
    businessSummary?: string;
    mainOffer?: string;
    desiredAgentBehavior?: string;
    wantsAutoFollowUp?: boolean;
    workflowKind?: "generic" | "scheduling" | "salon" | "delivery";
    usesScheduling?: boolean;
    restaurantOrderMode?: "full_order" | "first_contact";
    workDays?: number[];
    workStartTime?: string;
    workEndTime?: string;
    answeredBusiness?: boolean;
    answeredBehavior?: boolean;
    answeredWorkflow?: boolean;
    rawAnswers?: { q1?: string; q2?: string; q3?: string };
  };
}

interface TestAccountCredentials {
  email: string;
  password?: string;
  loginUrl: string;
  simulatorToken?: string;
  isExistingAccount?: boolean;
}

interface GeneratedDemoAssets {
  screenshotUrl?: string;
  videoUrl?: string;
  screenshotPath?: string;
  videoPath?: string;
  error?: string;
}

function mergeGeneratedDemoAssets(
  current?: GeneratedDemoAssets,
  incoming?: GeneratedDemoAssets,
): GeneratedDemoAssets | undefined {
  if (!current && !incoming) return undefined;
  if (!current) return incoming;
  if (!incoming) return current;

  return {
    screenshotUrl: incoming.screenshotUrl ?? current.screenshotUrl,
    videoUrl: incoming.videoUrl ?? current.videoUrl,
    screenshotPath: incoming.screenshotPath ?? current.screenshotPath,
    videoPath: incoming.videoPath ?? current.videoPath,
    error: incoming.error ?? current.error,
  };
}

// ============================================================================
// SISTEMA ANTI-LOOP & MEMÃƒâ€œRIA INTELIGENTE (CAMADA 1 + 2 + 3)
// ============================================================================

import { createHash } from "crypto";

/**
 * Interface de anÃƒÂ¡lise de memÃƒÂ³ria conversacional do admin agent
 */
interface AdminConversationMemory {
  loopDetected: boolean;
  loopType: 'greeting_repeat' | 'question_repeat' | 'response_repeat' | 'stuck_flow' | null;
  repeatedContent: string | null;
  turnsSinceLastNewInfo: number;
  questionsAskedByClient: string[];
  infoAlreadyProvided: string[];
}

/**
 * Cache de hashes de respostas recentes para detecÃƒÂ§ÃƒÂ£o de duplicatas
 */
const recentAdminResponseHashes = new Map<string, Array<{ hash: string; count: number; lastTime: number }>>();

/**
 * Detecta se a resposta ÃƒÂ© duplicata de uma resposta recente (hash MD5)
 * Inspirado em aiAgent.ts isDuplicateResponse()
 */
function isAdminDuplicateResponse(phone: string, responseText: string): boolean {
  const hash = createHash('md5').update(responseText.trim().toLowerCase().substring(0, 200)).digest('hex');
  const now = Date.now();
  const WINDOW_MS = 5 * 60 * 1000; // 5 minutos
  const MAX_REPEATS = 2;
  
  if (!recentAdminResponseHashes.has(phone)) {
    recentAdminResponseHashes.set(phone, []);
  }
  
  const history = recentAdminResponseHashes.get(phone)!;
  // Limpar entradas antigas
  const filtered = history.filter(h => now - h.lastTime < WINDOW_MS);
  
  const existing = filtered.find(h => h.hash === hash);
  if (existing) {
    existing.count++;
    existing.lastTime = now;
    if (existing.count >= MAX_REPEATS) {
      console.log(`Ã°Å¸â€â€ž [ANTI-LOOP] Resposta duplicada detectada para ${phone} (${existing.count}x em ${WINDOW_MS/1000}s)`);
      return true;
    }
  } else {
    filtered.push({ hash, count: 1, lastTime: now });
  }
  
  recentAdminResponseHashes.set(phone, filtered);
  return false;
}

/**
 * V9: Jaccard similarity entre dois textos (word-level)
 * Inspirado em OpenClaw/Reflexion Ã¢â‚¬â€ threshold 0.75 captura respostas "quase idÃƒÂªnticas"
 */
function jaccardWordSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  const setA = new Set(normalize(a));
  const setB = new Set(normalize(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) { if (setB.has(w)) intersection++; }
  return intersection / (setA.size + setB.size - intersection);
}

/**
 * V9: Verifica se a resposta ÃƒÂ© similar ÃƒÂ s ÃƒÂºltimas N mensagens do assistente no histÃƒÂ³rico
 * Retorna true se ÃƒÂ© duplicata/similar (Jaccard > 0.75 ou MD5 match)
 */
function isResponseSimilarToRecentHistory(session: ClientSession, responseText: string, lookback: number = 3): boolean {
  if (!session.conversationHistory?.length) return false;
  const recentAssistant = session.conversationHistory
    .filter(m => m.role === 'assistant')
    .slice(-lookback);
  
  const respNorm = responseText.trim().toLowerCase().substring(0, 300);
  const respHash = createHash('md5').update(respNorm).digest('hex');
  
  for (const msg of recentAssistant) {
    const msgNorm = msg.content.trim().toLowerCase().substring(0, 300);
    // Exact hash match
    if (createHash('md5').update(msgNorm).digest('hex') === respHash) {
      console.log(`Ã°Å¸â€â€ž [ANTI-LOOP-V9] Exact duplicate detected (MD5 match)`);
      return true;
    }
    // Fuzzy Jaccard match
    const similarity = jaccardWordSimilarity(responseText, msg.content);
    if (similarity > 0.75) {
      console.log(`Ã°Å¸â€â€ž [ANTI-LOOP-V9] Fuzzy duplicate detected (Jaccard=${similarity.toFixed(2)})`);
      return true;
    }
  }
  return false;
}

/**
 * AnÃƒÂ¡lise estrutural do histÃƒÂ³rico de conversa para detectar loops e problemas
 * Inspirado em aiAgent.ts analyzeConversationHistory()
 */
function analyzeAdminConversationHistory(history: Array<{ role: string; content: string; timestamp: Date }>): AdminConversationMemory {
  const memory: AdminConversationMemory = {
    loopDetected: false,
    loopType: null,
    repeatedContent: null,
    turnsSinceLastNewInfo: 0,
    questionsAskedByClient: [],
    infoAlreadyProvided: []
  };
  
  const assistantMsgs = history.filter(h => h.role === 'assistant');
  const userMsgs = history.filter(h => h.role === 'user');
  
  if (assistantMsgs.length < 2) return memory;
  
  // 1. Detectar respostas similares do assistente (primeiros 120 chars)
  const recentAssistant = assistantMsgs.slice(-6);
  const prefixes = recentAssistant.map(m => m.content.substring(0, 120).toLowerCase().replace(/[^\w\sÃƒÂ¡ÃƒÂ©ÃƒÂ­ÃƒÂ³ÃƒÂºÃƒÂ ÃƒÂ¢ÃƒÂªÃƒÂ´ÃƒÂ£ÃƒÂµÃƒÂ§]/g, ''));
  
  for (let i = 0; i < prefixes.length; i++) {
    let matchCount = 0;
    for (let j = i + 1; j < prefixes.length; j++) {
      // Similaridade simples: > 60% dos caracteres iguais indica loop
      const longer = Math.max(prefixes[i].length, prefixes[j].length);
      const shorter = Math.min(prefixes[i].length, prefixes[j].length);
      if (shorter > 20 && longer > 0) {
        let matches = 0;
        for (let k = 0; k < shorter; k++) {
          if (prefixes[i][k] === prefixes[j][k]) matches++;
        }
        if (matches / longer > 0.6) matchCount++;
      }
    }
    if (matchCount >= 2) {
      memory.loopDetected = true;
      memory.loopType = 'response_repeat';
      memory.repeatedContent = recentAssistant[i].content.substring(0, 80);
      break;
    }
  }
  
  // 2. Detectar greeting repetido
  const greetingPattern = /^(oi|olÃƒÂ¡|ola|eai|fala|hey|bom dia|boa tarde|boa noite|e aÃƒÂ­|tudo bem)/i;
  const greetingAssistant = recentAssistant.filter(m => greetingPattern.test(m.content.trim()));
  if (greetingAssistant.length >= 3) {
    memory.loopDetected = true;
    memory.loopType = 'greeting_repeat';
    memory.repeatedContent = 'SaudaÃƒÂ§ÃƒÂ£o repetida 3+ vezes';
  }
  
  // 3. Detectar perguntas do assistente repetidas (o agente perguntando a mesma coisa)
  const questionPattern = /\?/;
  const recentQuestions = recentAssistant
    .filter(m => questionPattern.test(m.content))
    .map(m => {
      // Extrair a pergunta principal
      const sentences = m.content.split(/[.!?\n]/).filter(s => s.includes('?'));
      return sentences[0]?.trim().toLowerCase().substring(0, 80) || '';
    })
    .filter(q => q.length > 10);
  
  // Ver se hÃƒÂ¡ perguntas muito similares
  for (let i = 0; i < recentQuestions.length; i++) {
    for (let j = i + 1; j < recentQuestions.length; j++) {
      const q1Words = new Set(recentQuestions[i].split(/\s+/));
      const q2Words = new Set(recentQuestions[j].split(/\s+/));
      const intersection = [...q1Words].filter(w => q2Words.has(w));
      const similarity = intersection.length / Math.max(q1Words.size, q2Words.size);
      if (similarity > 0.5) {
        memory.loopDetected = true;
        memory.loopType = 'question_repeat';
        memory.repeatedContent = recentQuestions[i];
        break;
      }
    }
    if (memory.loopType === 'question_repeat') break;
  }
  
  // 4. Extrair perguntas do cliente nÃƒÂ£o respondidas
  const recentUserMsgs = userMsgs.slice(-5);
  for (const msg of recentUserMsgs) {
    if (msg.content.startsWith('[SISTEMA')) continue; // Ignorar mensagens de sistema
    
    const isQuestion = msg.content.includes('?') || 
      /\b(como|quanto|qual|quando|onde|funciona|pode|tem|aceita|faz|tem como|consigo|dÃƒÂ¡ pra)\b/i.test(msg.content);
    
    if (isQuestion) {
      // Verificar se alguma resposta posterior responde a esta pergunta
      const msgTime = msg.timestamp?.getTime() || 0;
      const laterAssistant = assistantMsgs.filter(a => (a.timestamp?.getTime() || 0) > msgTime);
      
      if (laterAssistant.length === 0 || laterAssistant.every(a => 
        a.content.length < 30 || /consigo sim|claro|pode sim/i.test(a.content.substring(0, 50))
      )) {
        memory.questionsAskedByClient.push(msg.content.substring(0, 100));
      }
    }
  }
  
  // 5. Extrair informaÃƒÂ§ÃƒÂµes que o agente jÃƒÂ¡ forneceu
  for (const msg of recentAssistant) {
    if (/R\$\s*\d+|plano|preÃƒÂ§o|valor/i.test(msg.content)) {
      memory.infoAlreadyProvided.push('preÃƒÂ§o/plano');
    }
    if (/agentezap\.online|simulador|link.*teste/i.test(msg.content)) {
      memory.infoAlreadyProvided.push('link do teste');
    }
    if (/email|senha|login/i.test(msg.content)) {
      memory.infoAlreadyProvided.push('credenciais');
    }
    if (/horÃƒÂ¡rio|segunda|terÃƒÂ§a|quarta|quinta|sexta|sÃƒÂ¡bado|domingo/i.test(msg.content)) {
      memory.infoAlreadyProvided.push('horÃƒÂ¡rios');
    }
  }
  // Deduplicate
  memory.infoAlreadyProvided = [...new Set(memory.infoAlreadyProvided)];
  
  return memory;
}

/**
 * Extrai informaÃƒÂ§ÃƒÂµes que o cliente jÃƒÂ¡ forneceu na conversa
 * Para evitar perguntar de novo
 */
function extractClientProvidedInfo(history: Array<{ role: string; content: string }>): Record<string, string> {
  const info: Record<string, string> = {};
  
  const userMsgs = history.filter(h => h.role === 'user' && !h.content.startsWith('[SISTEMA'));
  
  for (const msg of userMsgs) {
    const text = msg.content;
    
    // Nome do negÃƒÂ³cio
    if (/\b(minha?\s+(empresa|loja|negÃƒÂ³cio|clÃƒÂ­nica|salÃƒÂ£o|restaurante|oficina|pet\s*shop))\s+(?:ÃƒÂ©|se\s*chama|chamada?)\s+["']?([^"'\n,.]+)/i.test(text)) {
      info['negÃƒÂ³cio'] = RegExp.$3?.trim() || '';
    }
    
    // HorÃƒÂ¡rios
    const horarioMatch = text.match(/(\d{1,2})\s*(?:h|hrs?|horas?)\s*(?:ÃƒÂ s?|a|ate?|-)\s*(\d{1,2})\s*(?:h|hrs?|horas?)?/i);
    if (horarioMatch) {
      info['horÃƒÂ¡rio'] = `${horarioMatch[1]}h ÃƒÂ s ${horarioMatch[2]}h`;
    }
    
    // Dias da semana
    const diasMatch = text.match(/(segunda|terÃƒÂ§a|quarta|quinta|sexta|sÃƒÂ¡bado|domingo)[\s,a-zÃƒÂ¡ÃƒÂ©ÃƒÂ­ÃƒÂ³ÃƒÂº]*(segunda|terÃƒÂ§a|quarta|quinta|sexta|sÃƒÂ¡bado|domingo)?/i);
    if (diasMatch) {
      info['dias'] = diasMatch[0];
    }
    
    // Nicho/ramo
    if (/\b(sou|trabalho\s+com|tenho\s+um[a]?)\s+([^.!?\n]{3,40})/i.test(text)) {
      info['ramo'] = RegExp.$2?.trim() || '';
    }
  }
  
  return info;
}

/**
 * Gera bloco de memÃƒÂ³ria conversacional para injetar no prompt
 * Inspirado em aiAgent.ts generateMemoryContextBlock()
 */
function generateAdminMemoryContextBlock(
  memory: AdminConversationMemory, 
  history: Array<{ role: string; content: string }>,
  memorySummary?: string
): string {
  // Se nÃƒÂ£o hÃƒÂ¡ nada relevante, nÃƒÂ£o injeta
  if (!memory.loopDetected && memory.questionsAskedByClient.length === 0 && !memorySummary) {
    return '';
  }
  
  let block = '\nÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â\n';
  block += 'Ã°Å¸Â§Â  MEMÃƒâ€œRIA INTELIGENTE DA CONVERSA\n';
  block += 'Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â\n';
  
  // Resumo de conversa anterior (CAMADA 2)
  if (memorySummary) {
    block += `Ã°Å¸â€œâ€¹ RESUMO DA CONVERSA ANTERIOR:\n${memorySummary}\n\n`;
  }
  
  // Alerta de loop (CAMADA 1)
  if (memory.loopDetected) {
    block += `Ã¢Å¡Â Ã¯Â¸Â ALERTA CRÃƒÂTICO: LOOP DETECTADO (${memory.loopType})!\n`;
    if (memory.repeatedContent) {
      block += `   ConteÃƒÂºdo repetido: "${memory.repeatedContent}"\n`;
    }
    block += `   OBRIGATÃƒâ€œRIO:\n`;
    block += `   - DÃƒÂª uma resposta COMPLETAMENTE DIFERENTE da anterior\n`;
    block += `   - AVANCE a conversa para o prÃƒÂ³ximo passo\n`;
    block += `   - Se o cliente jÃƒÂ¡ respondeu algo, NÃƒÆ’O pergunte de novo\n\n`;
  }
  
  // Perguntas do cliente nÃƒÂ£o respondidas
  if (memory.questionsAskedByClient.length > 0) {
    block += `Ã¢Ââ€œ PERGUNTAS DO CLIENTE SEM RESPOSTA:\n`;
    for (const q of memory.questionsAskedByClient.slice(0, 3)) {
      block += `   - "${q}"\n`;
    }
    block += `   OBRIGATÃƒâ€œRIO: Responda ANTES de fazer novas perguntas.\n\n`;
  }
  
  // Info jÃƒÂ¡ fornecida (evitar repetiÃƒÂ§ÃƒÂ£o)
  if (memory.infoAlreadyProvided.length > 0) {
    block += `Ã¢Å“â€¦ INFORMAÃƒâ€¡Ãƒâ€¢ES JÃƒÂ FORNECIDAS (nÃƒÂ£o repetir):\n`;
    for (const info of memory.infoAlreadyProvided) {
      block += `   - ${info}\n`;
    }
    block += '\n';
  }
  
  // Info que o cliente jÃƒÂ¡ deu (nÃƒÂ£o perguntar de novo)
  const clientInfo = extractClientProvidedInfo(history);
  if (Object.keys(clientInfo).length > 0) {
    block += `Ã°Å¸â€œâ€¹ DADOS QUE O CLIENTE JÃƒÂ INFORMOU (NÃƒÆ’O pergunte de novo):\n`;
    for (const [key, value] of Object.entries(clientInfo)) {
      block += `   - ${key}: ${value}\n`;
    }
    block += '\n';
  }
  
  block += 'Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â\n';
  return block;
}

/**
 * Compacta histÃƒÂ³rico de conversa longo gerando resumo das mensagens antigas
 * Inspirado em OpenClaw auto-compaction
 * CAMADA 2: CompactaÃƒÂ§ÃƒÂ£o Inteligente
 */
async function compactConversationHistory(
  phone: string,
  history: Array<{ role: "user" | "assistant"; content: string; timestamp: Date }>,
  currentSummary?: string
): Promise<{ compactedHistory: Array<{ role: "user" | "assistant"; content: string; timestamp: Date }>; summary: string }> {
  const COMPACT_THRESHOLD = 25;
  const KEEP_RECENT = 15;
  if (history.length < COMPACT_THRESHOLD) {
    return { compactedHistory: history, summary: currentSummary || '' };
  }

  const toCompact = history.slice(0, -KEEP_RECENT);
  const toKeep = history.slice(-KEEP_RECENT);
  try {
    const { runWebOnlyCodexPromptTextForUser } = await import("../api/http");
    const summary = await runWebOnlyCodexPromptTextForUser({
      userId: "admin-history-compaction",
      task: "admin_history_compaction",
      message: toCompact.map((m) => `[${m.role === 'user' ? 'CLIENTE' : 'AGENTE'}]: ${m.content}`).join("\n"),
      messages: [
        { role: "system", content: "Resuma a conversa em fatos duraveis para contexto futuro. Maximo 400 caracteres. Sem fala publica." },
        { role: "user", content: `${currentSummary ? `Resumo anterior:\n${currentSummary}\n\n` : ''}${toCompact.map((m) => `[${m.role === 'user' ? 'CLIENTE' : 'AGENTE'}]: ${m.content.substring(0, 500)}`).join("\n")}` },
      ],
      maxTokens: 220,
      contextArtifacts: { channel: "admin_history_compaction", phone },
    });
    const cleanSummary = String(summary || '').trim().slice(0, 700);
    if (cleanSummary.length > 20) {
      persistMemorySummaryToDB(phone, cleanSummary).catch((err) => console.error(`[COMPACT] Falha ao persistir resumo:`, err));
      return { compactedHistory: toKeep, summary: cleanSummary };
    }
  } catch (error: any) {
    console.error("[COMPACT] Codex runtime failed:", error?.message || error);
  }

  return { compactedHistory: history.slice(-20), summary: currentSummary || '' };
}

/**
 * Persiste o memory_summary no banco (CAMADA 2)
 */
async function persistMemorySummaryToDB(phone: string, summary: string): Promise<void> {
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const conversation = await storage.getAdminConversationByPhone(cleanPhone);
    if (conversation?.id) {
      await storage.updateAdminConversation(conversation.id, { memorySummary: summary });
      console.log(`Ã°Å¸â€™Â¾ [MEMORY] Resumo persistido no DB para ${cleanPhone} (${summary.length} chars)`);
    }
  } catch (err) {
    console.error(`Ã¢Å¡Â Ã¯Â¸Â [MEMORY] Falha ao persistir resumo:`, err);
  }
}

/**
 * Extrai fatos durÃƒÂ¡veis da conversa antes de compactar (CAMADA 3)
 * Inspirado em OpenClaw pre-compaction memory flush
 */
function extractDurableFactsFromHistory(
  history: Array<{ role: string; content: string }>,
  currentState: Record<string, any>
): Record<string, any> {
  const facts: Record<string, any> = { ...(currentState.clientProfile || {}) };
  
  for (const msg of history) {
    if (msg.content.startsWith('[SISTEMA')) continue;
    
    if (msg.role === 'user') {
      // Detectar nome do negÃƒÂ³cio
      const businessMatch = msg.content.match(/(?:minha?|da|do)\s+(empresa|loja|negÃƒÂ³cio|clÃƒÂ­nica|salÃƒÂ£o|restaurante|oficina|barbearia|pet\s*shop|consultÃƒÂ³rio|academia|escola|padaria)\s+(?:ÃƒÂ©|se\s*chama|chamada?)\s+["']?([^"'\n,.!?]+)/i);
      if (businessMatch) {
        facts.negocio = businessMatch[2]?.trim();
        facts.nicho = businessMatch[1]?.trim();
      }
      
      // Detectar ramo/nicho
      const nichoMatch = msg.content.match(/\b(sou|trabalho\s+com|tenho\s+um[a]?|meu\s+segmento|meu\s+ramo)\s+(?:de\s+)?([^.!?\n]{3,30})/i);
      if (nichoMatch && !facts.nicho) {
        facts.nicho = nichoMatch[2]?.trim();
      }
      
      // Detectar interesse/objeÃƒÂ§ÃƒÂ£o
      if (/\b(caro|muito caro|sem grana|sem dinheiro|nÃƒÂ£o tenho|nao tenho|sem condiÃƒÂ§ÃƒÂ£o)\b/i.test(msg.content)) {
        if (!facts.objecoes) facts.objecoes = [];
        if (!facts.objecoes.includes('preÃƒÂ§o')) facts.objecoes.push('preÃƒÂ§o');
      }
      if (/\b(pensar|vou ver|depois|mais tarde|agora nÃƒÂ£o|agora nao)\b/i.test(msg.content)) {
        if (!facts.objecoes) facts.objecoes = [];
        if (!facts.objecoes.includes('timing')) facts.objecoes.push('timing');
      }
    }
  }
  
  return facts;
}

// ============================================================================
// FIM DO SISTEMA ANTI-LOOP & MEMÃƒâ€œRIA INTELIGENTE
// ============================================================================

function cleanupAdminResponseArtifacts(text: string): string {
  let cleaned = convertAdminMarkdownToWhatsApp(text)
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ")
    .replace(/\uFFFD/g, "")
    .replace(/Ã¯Â¿Â½/g, "")
    .replace(/^[ \t]*[-_*]{3,}[ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
  
  // V16: Final mojibake safety net â€” preserva acentos corretos
  cleaned = cleaned
    .replace(/vocÃƒÂª/gi, "vocÃª")
    .replace(/nÃƒÂ£o/gi, "nÃ£o")
    .replace(/jÃƒÂ¡/gi, "jÃ¡")
    .replace(/negÃƒÂ³cio/gi, "negÃ³cio")
    .replace(/dÃƒÂºvida/gi, "dÃºvida")
    .replace(/preÃƒÂ§o/gi, "preÃ§o")
    .replace(/informaÃƒÂ§ÃƒÂ£o/gi, "informaÃ§Ã£o")
    .replace(/configuraÃƒÂ§ÃƒÂ£o/gi, "configuraÃ§Ã£o")
    .replace(/grÃƒÂ¡tis/gi, "grÃ¡tis")
    .replace(/serviÃƒÂ§o/gi, "serviÃ§o")
    .replace(/horÃƒÂ¡rio/gi, "horÃ¡rio")
    .replace(/criaÃƒÂ§ÃƒÂ£o/gi, "criaÃ§Ã£o")
    .replace(/funÃƒÂ§ÃƒÂ£o/gi, "funÃ§Ã£o")
    .replace(/soluÃƒÂ§ÃƒÂ£o/gi, "soluÃ§Ã£o")
    .replace(/RecepÃƒÂ§ÃƒÂ£o/gi, "RecepÃ§Ã£o")
    .replace(/ÃƒÂ£o\b/g, "Ã£o")
    .replace(/ÃƒÂ©/g, "Ã©")
    .replace(/ÃƒÂ¡/g, "Ã¡")
    .replace(/ÃƒÂª/g, "Ãª")
    .replace(/ÃƒÂ³/g, "Ã³")
    .replace(/ÃƒÂº/g, "Ãº")
    .replace(/ÃƒÂ§/g, "Ã§")
    .replace(/ÃƒÂ­/g, "Ã­")
    .replace(/ÃƒÂ´/g, "Ã´")
    .replace(/ÃƒÂµ/g, "Ãµ")
    .replace(/Ãƒ /g, "Ã ")
    .replace(/ÃƒÂ¢/g, "Ã¢")
    .replace(/[ÃƒÃ‚]{2,}/g, " ")
    .replace(/\s{2,}/g, " ");
  
  // V16: Remove URL_0, URL_1 etc. placeholders hallucinated by LLM
  cleaned = cleaned.replace(/\bURL_\d+\b/gi, "").replace(/\s{2,}/g, " ").trim();
  
  // V16: Removido nuclear mojibake cleanup que destruÃ­a palavras portuguesas vÃ¡lidas
  
  return cleaned;
}

function repairCommonMojibake(text: string): string {
  return repairMojibakeText(String(text || ""));
}

function convertAdminMarkdownToWhatsApp(text: string): string {
  let converted = repairCommonMojibake(String(text || ""));

  converted = converted.replace(/^[\s]*[Ã¢â€ÂÃ¢â€¢ÂÃ¢â€â‚¬Ã¢â‚¬â€\-_*]{3,}[\s]*$/gm, "");
  converted = converted.replace(/\-{2,}/g, "");
  converted = converted.replace(/^[\s]*-\s+/gm, "Ã¢â‚¬Â¢ ");
  converted = converted.replace(/\s*Ã¢â‚¬â€\s*/g, ", ");
  converted = converted.replace(/\s*Ã¢â‚¬â€œ\s*/g, ", ");
  converted = converted.replace(/(?<=[a-zÃƒÂ¡ÃƒÂ©ÃƒÂ­ÃƒÂ³ÃƒÂºÃƒÂ ÃƒÂ¢ÃƒÂªÃƒÂ´ÃƒÂ£ÃƒÂµÃƒÂ§\s])\s+-\s+(?=[a-zÃƒÂ¡ÃƒÂ©ÃƒÂ­ÃƒÂ³ÃƒÂºÃƒÂ ÃƒÂ¢ÃƒÂªÃƒÂ´ÃƒÂ£ÃƒÂµÃƒÂ§A-Z])/g, ", ");
  converted = converted.replace(/\n{3,}/g, "\n\n");
  converted = converted.replace(/,\s*,/g, ",");
  converted = converted.replace(/^\s*,\s*/gm, "");
  // V18: Markdown -> WhatsApp bold conversion
  // 1. Convert ### headers to *bold* (WhatsApp doesnt support markdown headers)
  converted = converted.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");

  // 2. Convert markdown bullet points (* item) to bullet BEFORE bold conversion
  converted = converted.replace(/^\*\s+/gm, "\u2022 ");

  // 3. Convert **bold** to *bold* (WhatsApp single asterisk)
  converted = converted.replace(/\*\*(?!\*)(.+?)\*\*(?!\*)/g, "*$1*");

  // 4. Fix double ** that survived (e.g. from ### *text* producing **text**)
  converted = converted.replace(/\*{2,}([^*\n]+?)\*{2,}/g, "*$1*");

  // 5. Fix bold with trailing/leading spaces: *text * or * text*
  // WhatsApp needs * touching text directly, no spaces
  converted = converted.replace(/\*\s+([^*\n]+?)\*/g, "*$1*");
  converted = converted.replace(/\*([^*\n]+?)\s+\*/g, "*$1*");

  converted = converted.replace(/~~(.+?)~~/g, "~$1~");
  converted = converted.replace(/(?<!`)\`(?!``)(.+?)\`(?!`)/g, "```$1```");
  converted = repairCommonMojibake(converted);

  return converted.trim();
}

const ADMIN_TEST_TOKENS_TABLE = "admin_test_tokens";
let ensureAdminTestTokensTablePromise: Promise<void> | null = null;

async function ensureAdminTestTokensTable(): Promise<void> {
  if (!ensureAdminTestTokensTablePromise) {
    ensureAdminTestTokensTablePromise = withRetry(async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${ADMIN_TEST_TOKENS_TABLE} (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          agent_name TEXT NOT NULL,
          company TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_admin_test_tokens_user_id
        ON ${ADMIN_TEST_TOKENS_TABLE}(user_id);

        CREATE INDEX IF NOT EXISTS idx_admin_test_tokens_expires_at
        ON ${ADMIN_TEST_TOKENS_TABLE}(expires_at);
      `);
    });
  }

  try {
    await ensureAdminTestTokensTablePromise;
  } catch (error) {
    ensureAdminTestTokensTablePromise = null;
    throw error;
  }
}

// Token de teste para simulador
interface TestToken {
  token: string;
  userId: string;
  agentName: string;
  company: string;
  createdAt: Date;
  expiresAt: Date;
}

// Cache de sessÃƒÆ’Ã‚Âµes de clientes em memÃƒÆ’Ã‚Â³ria
export const clientSessions = new Map<string, ClientSession>();

/**
 * Persiste linked_user_id e last_test_token na conversa do banco
 * para nÃƒÂ£o perder contexto entre reinÃƒÂ­cios
 */
async function persistConversationLink(phoneNumber: string, linkedUserId: string, testToken?: string): Promise<void> {
  try {
    const cleanPhone = normalizePhoneForAccount(phoneNumber);
    const conversation = await storage.getAdminConversationByPhone(cleanPhone);
    if (conversation?.id) {
      const updates: Record<string, any> = { linkedUserId };
      if (testToken) updates.lastTestToken = testToken;
      await storage.updateAdminConversation(conversation.id, updates);
      console.log(`Ã°Å¸â€™Â¾ [STATE] Persistido link: user=${linkedUserId}, token=${testToken || "N/A"} para conversa ${conversation.id}`);
    }
  } catch (err) {
    console.error("Ã¢Å¡Â Ã¯Â¸Â [STATE] Falha ao persistir link da conversa:", err);
  }
}

/**
 * Persiste o estado contextual da conversa para retomada inteligente
 */
async function persistConversationState(phoneNumber: string, state: Record<string, any>): Promise<void> {
  try {
    const cleanPhone = normalizePhoneForAccount(phoneNumber);
    const conversation = await storage.getAdminConversationByPhone(cleanPhone);
    if (conversation?.id) {
      const currentState = (conversation as any).contextState || {};
      // Serialize pendingAction as JSON string (or null) per explicit contract
      const stateToMerge = { ...state };
      if ("pendingAction" in stateToMerge) {
        stateToMerge.pendingAction = stateToMerge.pendingAction
          ? JSON.stringify(stateToMerge.pendingAction)
          : null;
      }
      const mergedState = { ...currentState, ...stateToMerge };
      await storage.updateAdminConversation(conversation.id, { contextState: mergedState } as any);
    }
  } catch (err) {
    console.error("Ã¢Å¡Â Ã¯Â¸Â [STATE] Falha ao persistir estado:", err);
  }
}

/**
 * Restaura o vÃƒÂ­nculo da conversa a partir do banco persistido
 */
async function restoreConversationLink(phoneNumber: string): Promise<{ linkedUserId?: string; lastTestToken?: string }> {
  try {
    const cleanPhone = normalizePhoneForAccount(phoneNumber);
    const conversation = await storage.getAdminConversationByPhone(cleanPhone);
    if (conversation) {
      return {
        linkedUserId: (conversation as any).linkedUserId || undefined,
        lastTestToken: (conversation as any).lastTestToken || undefined,
      };
    }
  } catch (err) {
    console.error("Ã¢Å¡Â Ã¯Â¸Â [STATE] Falha ao restaurar link:", err);
  }
  return {};
}

const DEFAULT_ADMIN_AGENT_OWNER_EMAIL = "rodrigo4@gmail.com";
let cachedAdminAgentOwnerUserId: string | undefined;
let adminAgentOwnerCacheExpiry = 0;

function normalizeContactName(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  let cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  if (cleaned.includes("@")) return undefined;
  if (/^\+?\d+$/.test(cleaned)) return undefined;
  if (/^(unknown|sem nome|nÃƒÆ’Ã‚Â£o identificado|nao identificado|null|undefined|contato)$/i.test(cleaned)) {
    return undefined;
  }
  if (cleaned.length < 2) return undefined;
  if (cleaned.length > 80) cleaned = cleaned.slice(0, 80).trim();
  return cleaned;
}

function extractDelimitedBlock(source: string, startTag: string, endTag: string): string | undefined {
  const text = String(source || "");
  const lower = text.toLowerCase();
  const start = lower.indexOf(startTag.toLowerCase());
  if (start < 0) return undefined;
  const contentStart = start + startTag.length;
  const end = lower.indexOf(endTag.toLowerCase(), contentStart);
  if (end < 0 || end <= contentStart) return undefined;
  const content = text.slice(contentStart, end).trim();
  return content || undefined;
}

function normalizeAdminLLMCustomerText(raw: string): string {
  const assistantResponse = extractDelimitedBlock(raw, "<assistant_response>", "</assistant_response>");
  const candidate = assistantResponse || raw;
  const sanitized = sanitizeCustomerFacingResponseText(candidate);
  return normalizeVisibleBubbleMarkers(sanitized || candidate).trim();
}

function normalizeVisibleBubbleMarkers(text: string): string {
  return String(text || "")
    .split("[BOLHA]")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

function generateFallbackClientName(phoneNumber: string): string {
  const cleanPhone = normalizePhoneForAccount(phoneNumber);
  const suffix = cleanPhone.slice(-4).padStart(4, "0");
  return `Cliente ${suffix}`;
}

function shouldRefreshStoredUserName(name?: string | null): boolean {
  const normalized = (name || "").trim().toLowerCase();
  if (!normalized) return true;
  if (/^cliente\s+\d{1,8}$/.test(normalized)) return true;

  const placeholders = new Set([
    "cliente",
    "cliente teste",
    "novo cliente",
    "contato",
    "sem nome",
    "nao identificado",
    "nÃƒÆ’Ã‚Â£o identificado",
    "unknown",
    "undefined",
  ]);

  return placeholders.has(normalized);
}

function normalizeTextToken(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAdminSemanticText(value?: string | null): string {
  const source = String(value || "").toLowerCase().normalize("NFD");
  let result = "";
  let previousWasSpace = true;

  for (const char of source) {
    const code = char.charCodeAt(0);
    const isCombiningMark = code >= 0x0300 && code <= 0x036f;
    if (isCombiningMark) {
      continue;
    }

    const isLetterOrDigit =
      (code >= 48 && code <= 57) ||
      (code >= 97 && code <= 122);
    const isWhitespace =
      char === " " ||
      char === "\n" ||
      char === "\r" ||
      char === "\t" ||
      char === "\f" ||
      char === "\v";

    if (!isLetterOrDigit) {
      if (!isWhitespace) {
        if (!previousWasSpace && result.length > 0) {
          result += " ";
        }
        previousWasSpace = true;
        continue;
      }
    }

    if (isWhitespace) {
      if (!previousWasSpace && result.length > 0) {
        result += " ";
      }
      previousWasSpace = true;
      continue;
    }

    result += char;
    previousWasSpace = false;
  }

  return result.trim();
}

function messageIncludesFragments(message: string, fragments: string[]): boolean {
  for (const fragment of fragments) {
    if (message.includes(fragment)) {
      return true;
    }
  }
  return false;
}

function shouldBypassOnboardingGraph(params: {
  session: ClientSession;
  messageText: string;
  mediaType?: string;
}): boolean {
  const { session, messageText, mediaType } = params;
  if (mediaType && mediaType !== "text" && mediaType !== "chat") {
    return false;
  }

  const normalized = normalizeAdminSemanticText(messageText);
  if (!normalized) {
    return false;
  }

  const productQuestionFragments = [
    "funcionalidade",
    "funcionalidades",
    "recurso",
    "recursos",
    "feature",
    "features",
    "como funciona",
    "como voces funcionam",
    "o que da pra fazer",
    "o que da para fazer",
    "o que voces fazem",
    "me mostra o sistema",
    "mostrar o sistema",
    "video do sistema",
    "video mostrando",
    "tem video",
    "tem um video",
    "cadastro",
    "calibrar",
    "calibra",
    "editar o agente",
    "crm",
    "kanban",
    "agendamento",
    "agenda",
    "follow up",
    "followup",
    "site",
    "link",
  ];
  const businessDumpFragments = [
    "minha empresa",
    "meu negocio",
    "tenho uma empresa",
    "vendo",
    "ofereco",
    "trabalho com",
    "sou ",
    "quero que o agente",
    "o agente responda",
    "atenda clientes",
    "meus clientes",
  ];

  const asksAboutProduct = messageIncludesFragments(normalized, productQuestionFragments);
  if (!asksAboutProduct) {
    return false;
  }

  const isBusinessDump = messageIncludesFragments(normalized, businessDumpFragments);
  const alreadyHasBusinessContext = Boolean(
    session.setupProfile?.businessSummary ||
    session.setupProfile?.answeredBusiness ||
    session.agentConfig?.company,
  );

  return !isBusinessDump || alreadyHasBusinessContext;
}

const CREATE_INTENT_HINTS = [
  "quero testar",
  "quero conhecer",
  "pode criar",
  "pode montar",
  "cria pra mim",
  "criar pra mim",
  "cria para mim",
  "criar para mim",
  "pode fazer",
  "pode seguir",
  "pode prosseguir",
  "pode tocar",
  "pode mandar",
  "fecha o teste",
  "pode criar sim",
];

const MASS_BROADCAST_HINTS = [
  "envio em massa",
  "disparo",
  "disparar",
  "campanha",
  "campanhas",
  "lista vip",
  "mandar pra todos",
  "manda pra todos",
  "divulgar oferta",
];

function hasExplicitCreateIntent(message: string): boolean {
  const normalized = normalizeTextToken(message);
  if (!normalized) return false;

  if (CREATE_INTENT_HINTS.some((hint) => normalized.includes(hint))) {
    return true;
  }

  return /\b(cria|criar|crie|monta|montar)\b/.test(normalized) &&
    !looksLikeQuestionMessage(message);
}

function trimBusinessCandidate(raw?: string | null): string {
  return String(raw || "")
    .split(/[\n.!?]+/)[0]
    .replace(/\b(fa[cÃƒÂ§]o|trabalho com|vendo|ofere[cÃƒÂ§]o|atendo)\b.*$/i, "")
    .replace(/\s+e\s+(?:quero|preciso|gostaria|pretendo|vou|desejo|preciso\s+de)\s+.*$/i, "")
    .replace(/\s+com\s+(?:corte|barba|manicure|massagem|consulta|consultas|avaliacao|avaliaÃƒÂ§ÃƒÂ£o|retorno|servic(?:o|os)|produto(?:s)?|venda(?:s)?|pedido(?:s)?|marketing|roupa(?:s)?|marmita(?:s)?|lanche(?:s)?|pizza(?:s)?|acai|a[cÃƒÂ§]ai)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBusinessNameCandidate(userMessage: string): string | undefined {
  const source = String(userMessage || "")
    .replace(/\*\*/g, "")
    .replace(/[_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return undefined;

  const normalizedSource = normalizeTextToken(source);
  const hasExplicitBusinessMarker =
    /\b(meu negocio|minha empresa|minha loja|minha barbearia|minha imobiliaria|meu ecommerce|meu e-commerce|minha loja virtual|meu petshop|meu pet|minha clinica|meu consultorio|meu salao|minha academia|meu restaurante|minha lanchonete|meu delivery|nome do negocio|nome da empresa|nome do petshop|nome da imobiliaria|nome do ecommerce|nome da loja virtual|nome da barbearia|nome do salao|nome da clinica|nome do restaurante|nome da academia|nome da loja|nome do consultorio|nome da lanchonete|nome do bar|nome da pizzaria|nome da hamburgueria|o nome e|o nome eh|se chama|chama se|sou da|sou do|sou de|sou a|sou o|somos a|somos o|somos da|somos do|somos de|nos somos|trabalho com|nos vendemos|a gente vende|nossa empresa e|nosso negocio e|empresa e|empresa eh|negocio e|negocio eh|tenho a|tenho o|tenho um|tenho uma|eu tenho)\b/.test(
      normalizedSource,
    );
  if (looksLikeQuestionMessage(source) && !hasExplicitBusinessMarker) {
    return undefined;
  }

  const directPatterns = [
    /(?:agente|ia|atendente|rob[oÃ´])\s+(?:para|pra|pro)\s+(?:meu|minha|nosso|nossa|o|a)?\s*(?:pet\s?shop|e-?commerce|loja\s+virtual|barbearia|barber|cl[iÃ­]nica|imobili[aÃ¡]ria|restaurante|sal[aÃ£]o(?:\s+de\s+beleza)?|academia|loja|consult[oÃ³]rio|lanchonete|delivery|hamburgueria|pizzaria|padaria|of[iÃ­]cina|est[Ãºu]dio|escrit[oÃ³]rio|bar|caf[eÃ©]|escola|curso|mercado|pet)\s+(.+)$/i,
    /(?:meu|minha|nosso|nossa)\s+(?:pet\s?shop|e-?commerce|loja\s+virtual|barbearia|barber|cl[iÃ­]nica|imobili[aÃ¡]ria|restaurante|sal[aÃ£]o(?:\s+de\s+beleza)?|academia|loja|consult[oÃ³]rio|lanchonete|delivery|hamburgueria|pizzaria|padaria|of[iÃ­]cina|est[Ãºu]dio|escrit[oÃ³]rio|bar|caf[eÃ©]|escola|curso|mercado|pet)(?:\s+(?:de|da|do)\s+[a-zA-Z\u00C0-\u00FF0-9]+(?:\s+[a-zA-Z\u00C0-\u00FF0-9]+){0,3})?\s+(?:se\s+chama|chama(?:[-\s]*se)?|chamad[ao]|[eÃ©]|eh)\s+(.+)$/i,
    /(?:meu|minha|nosso|nossa)\s+(?:pet\s?shop|e-?commerce|loja\s+virtual|barbearia|barber|cl[iÃ­]nica|imobili[aÃ¡]ria|restaurante|sal[aÃ£]o(?:\s+de\s+beleza)?|academia|loja|consult[oÃ³]rio|lanchonete|delivery|hamburgueria|pizzaria|padaria|of[iÃ­]cina|est[Ãºu]dio|escrit[oÃ³]rio|bar|caf[eÃ©]|escola|curso|mercado|pet)\s+(.+)$/i,
    /(?:tenho\s+(?:a|o|um|uma)\s+)?(?:pet\s?shop|e-?commerce|loja\s+virtual|barbearia|barber|cl[iÃ­]nica|imobili[aÃ¡]ria|restaurante|sal[aÃ£]o(?:\s+de\s+beleza)?|academia|loja|consult[oÃ³]rio|lanchonete|delivery|hamburgueria|pizzaria|padaria|of[iÃ­]cina|est[Ãºu]dio|escrit[oÃ³]rio|bar|caf[eÃ©]|escola|curso|mercado|pet)(?:\s+(?:de|da|do)\s+[a-zA-Z\u00C0-\u00FF0-9]+(?:\s+[a-zA-Z\u00C0-\u00FF0-9]+){0,3})?\s+(?:se\s+chama|chama(?:[-\s]*se)?|chamad[ao]|[eÃ©]|eh)\s+(.+)$/i,
    /(?:meu negocio|minha empresa|empresa|negocio)\s*(?:e|eh|Ã©|:|-)\s*(.+)$/i,
    /(?:sou da|sou do|sou de)\s+(.+)$/i,
    /(?:tenho\s+(?:a|o|um|uma))\s+(.+)$/i,
    /(?:somos\s+(?:a|o|da|do|de)|n[oÃ³]s\s+somos)\s+(.+)$/i,
    /(?:aqui\s+(?:e|eh|Ã©)\s+(?:a|o))\s+(.+)$/i,
    /(?:falo\s+(?:da|do|de))\s+(.+)$/i,
    /(?:trabalho com)\s+(.+)$/i,
    /(?:entao|entÃ£o)\s*(?:e|eh|Ã©)\s+(.+)$/i,
    /(?:se chama|chama[-\s]*se)\s+(.+)$/i,
    /(?:o nome (?:e|eh|Ã©))\s+(.+)$/i,
    /(?:o\s+)?nome\s+d[oae]\s+(?:meu\s+|minha\s+|nosso\s+|nossa\s+)?(?:pet\s?shop|barbearia|barber|cl[iÃ­]nica(?:\s+\w+)?|imobili[aÃ¡]ria|restaurante|sal[aÃ£]o(?:\s+de\s+beleza)?|academia|loja|neg[oÃ³]cio|empresa|consult[oÃ³]rio|lanchonete|delivery|hamburgueria|pizzaria|padaria|of[iÃ­]cina|est[Ãºu]dio|escrit[oÃ³]rio|bar|caf[eÃ©]|escola|curso|mercado|pet)\s+(?:[eÃ©]|eh)\s+(.+)$/i,
    /(?:nome (?:e|eh|Ã©|do|da))\s+(.+)$/i,
  ];

  for (const pattern of directPatterns) {
    const match = source.match(pattern);
    const candidate = sanitizeCompanyName(trimBusinessCandidate(match?.[1]));
    if (candidate) return candidate;
  }

  // Protect abbreviation dots from splitting (Dr., Dra., Sr., Sra., Prof., Profa., Eng.)
  const protectedSource = source.replace(/\b(Dra?|Sra?|Profa?|Eng)\.\s*/gi, '$1 ');
  const segments = protectedSource
    .split(/[\n,.;|]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const fillerOnly = new Set([
    "sim",
    "isso",
    "ok",
    "beleza",
    "blz",
    "bora",
    "vamos",
    "pode",
    "pode sim",
    "claro",
    "fechado",
  ]);

  for (const segment of segments) {
    let candidate = segment;

    candidate = candidate
      .replace(/^(sim|isso|ok|beleza|blz|bora|vamos|pode|pode sim)\b[\s,:-]*/i, "")
      .replace(/^(eae|e ai|opa|oi|ola|fala)\s+(mano|cara|brother|bro|parceiro|amigo|chefe|velho)?\s*[\s,:-]*/i, "")
      .replace(/^(ja falei|eu ja falei)\b[\s,:-]*/i, "")
      .replace(/^(quero testar|quero conhecer)\b[\s,:-]*/i, "")
      .replace(/^[!?.,;:\s]+/, "") // Strip leading punctuation left after prefix removals
      .replace(/^(pode criar|pode montar|pode fazer|pode seguir|pode prosseguir)\b[\s,:-]*/i, "")
      .replace(/^(cria|criar|crie|monta|montar)\b[\s,:-]*/i, "")
      .replace(/^(pra me conhecer|para me conhecer|pra conhecer|para conhecer)\b[\s,:-]*/i, "")
      .replace(/^(o nome e|o nome eh|o nome Ã©)\b[\s,:-]*/i, "")
      .replace(/^(entao e|entao eh|entao Ã©|entÃ£o e|entÃ£o eh|entÃ£o Ã©)\b[\s,:-]*/i, "")
      .replace(/^(o agente|meu agente|agente)\b[\s,:-]*/i, "")
      .replace(/^(pra|para|pro|da|do|de|o|a|um|uma)\b[\s,:-]*/i, "")
      .trim();

    if (fillerOnly.has(normalizeTextToken(candidate))) {
      continue;
    }

    const sanitized = sanitizeCompanyName(trimBusinessCandidate(candidate));
    if (sanitized) {
      return sanitized;
    }
  }

  return undefined;
}
function sanitizeCompanyName(raw?: string | null): string | undefined {
  if (!raw) return undefined;

  let cleaned = String(raw)
    .replace(/[\[\{<][^\]\}>]*[\]\}>]/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^(?:meu negocio|minha empresa|empresa|negocio)\s*(?:e|:|-)\s*/i, "")
    .replace(/^(?:eu\s+)?tenho\s+(?:um|uma|a|o)\s+/i, "")
    .replace(/^(?:agente|ia|atendente|rob[oÃ´])\s+(?:para|pra|pro)\s+(?:meu|minha|nosso|nossa|o|a)?\s*(?:pet\s?shop|e-?commerce|loja\s+virtual|barbearia|cl[iÃ­]nica|imobili[aÃ¡]ria|restaurante|sal[aÃ£]o(?:\s+de\s+beleza)?|academia|loja|consult[oÃ³]rio|lanchonete|delivery|hamburgueria|pizzaria|neg[oÃ³]cio|empresa)\s+/i, "")
    .replace(/^(?:meu|minha|nosso|nossa|seu|sua)\s+(?:pet\s?shop|e-?commerce|loja\s+virtual|barbearia|cl[iÃ­]nica|imobili[aÃ¡]ria|restaurante|sal[aÃ£]o(?:\s+de\s+beleza)?|academia|loja|consult[oÃ³]rio|lanchonete|delivery|hamburgueria|pizzaria|neg[oÃ³]cio|empresa)\s+(?:se\s+chama|chama(?:[-\s]*se)?|chamad[ao]|[eÃ©]|eh)?\s*/i, "")
    .replace(/^sou\s+(?:a|o|da|do|de)\s+/i, "")
    .replace(/^(?:somos\s+(?:a|o|da|do|de)|n[oÃ³]s\s+somos)\s+/i, "")
    .replace(/^(?:n[oÃ³]s\s+vendemos|a gente vende)\s+/i, "")
    .replace(/^aqui\s+(?:e|eh|Ã©)\s+(?:a|o)\s+/i, "")
    .replace(/^falo\s+(?:da|do|de)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  cleaned = cleaned
    .replace(/\s+e\s+eu\s+(?:vendo|faco|faÃ§o|trabalho|atendo|ofereco|ofereÃ§o|sou)\b.*$/i, "")
    .replace(/\s+e\s+(?:vendo|faco|faÃ§o|trabalho|atendo|ofereco|ofereÃ§o)\b.*$/i, "")
    .replace(/\s+e\s+eu$/i, "")
    .replace(/\s+e\s+meu\b.*$/i, "")
    .replace(/\s+e\s+minha\b.*$/i, "")
    .replace(/\s+com\s+(?:corte|barba|manicure|massagem|consulta|consultas|avaliacao|avaliaÃƒÂ§ÃƒÂ£o|retorno|servic(?:o|os)|produto(?:s)?|venda(?:s)?|pedido(?:s)?|marketing|roupa(?:s)?|marmita(?:s)?|lanche(?:s)?|pizza(?:s)?|acai|a[cÃƒÂ§]ai)\b.*$/i, "")
    .trim();

  cleaned = cleaned
    .replace(/[,:;.!]+$/g, "")
    .replace(/\s*[-â€“â€”]+\s*$/g, "")
    .replace(/\b(e|de|do|da|dos|das)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return undefined;
  if (cleaned.length > 80) cleaned = cleaned.slice(0, 80).trim();
  if (cleaned.length < 3) return undefined;

  const normalized = normalizeTextToken(cleaned);
  const hasExplicitBusinessIdentityPrefix =
    /^(meu negocio|minha empresa|minha loja|nome do negocio|nome da empresa|sou da|sou do|sou de|somos a|somos o|somos da|somos do|somos de|nos somos|nos vendemos|a gente vende|nossa empresa e|nosso negocio e|empresa e|empresa eh|negocio e|negocio eh)\b/.test(
      normalized,
    );
  const looksLikeCommercialQuestion =
    /\b(como funciona|quanto custa|qual o preco|qual o valor|me fala o preco|me fala o valor|quero saber o preco|quero saber o valor)\b/.test(
      normalized,
    ) || /^(me fala|me explica|explica|quero saber|me diz)\b/.test(normalized);
  if (looksLikeCommercialQuestion && !hasExplicitBusinessIdentityPrefix) return undefined;

  const looksLikeSetupCommand =
    /\b(cria|criar|crie|monta|montar|manda|envia|enviar|gera|gerar)\b/.test(normalized) &&
    /\b(agente|link|teste|conta)\b/.test(normalized);
  if (looksLikeSetupCommand) return undefined;
  if (/^meu agente\b/.test(normalized)) return undefined;
  // Reject personal-statement fragments: "sou a dra", "sou o joao", etc.
  if (/^sou\s+(a|o|um|uma)\s+/i.test(cleaned) && cleaned.length < 25) return undefined;

  const blocked = new Set([
    "nome",
    "nome da empresa",
    "empresa",
    "minha empresa",
    "meu negocio",
    "negocio",
    "company",
    "my company",
    "test",
    "teste",
    "empresa teste",
    "empresa ficticia",
    "agentezap",
    "undefined",
    "null",
    "oi",
    "ola",
    "opa",
    "e ai",
    "eae",
    "fala",
    "bom dia",
    "boa tarde",
    "boa noite",
    "tudo bem",
    "oi tudo bem",
    "ola tudo bem",
    "e ai beleza",
    "e ai tudo bem",
    "mas",
    "mas o",
    "ah",
    "ah ta",
    "entao",
    "entao ta",
    "to com pressa",
    "tÃ´ com pressa",
    "estou com pressa",
    "estou com pouco tempo",
    "meu agente",
    "meu agente e manda link",
    "cria meu agente",
    "manda link",
    "cara",
    "poxa",
    "tipo",
    "isso ai",
    "isso ae",
    "show",
    "massa",
    "como funciona",
    "quanto custa",
    "qual o preco",
    "qual o valor",
    "me fala o preco",
    "me fala o valor",
    "quero saber o preco",
    "quero saber o valor",
    "confirmo",
    "confirmado",
    "confirma",
    "pode criar",
    "pode criar confirmo",
    "pode criar sim",
    "pode prosseguir",
    "pode seguir",
  ]);

  if (blocked.has(normalized)) return undefined;

  const startsAsGreeting = /^(oi|ola|opa|e ai|eae|fala|bom dia|boa tarde|boa noite)\b/.test(normalized);
  if (
    startsAsGreeting &&
    (normalized.split(/\s+/).length <= 3 ||
      /\b(como|qual|quanto|funciona|preco|valor|quero|explica)\b/.test(normalized))
  ) {
    return undefined;
  }

  const descriptionPatterns = [
    /^(?:me fala|me explica|explica|quero saber|me diz)\b/i,
    /^(?:so|sÃƒÂ³)\s+(?:venda|vendas|atendimento|follow)/i,
    /(?:tambem|tambÃƒÂ©m)\s+(?:pode|faz|quer)/i,
    /^(?:quero|quer|preciso|gostaria|pode)\s/i,
    /^(?:faz|fazer|tirar|cobrar|agendar|vender)\s/i,
    /(?:follow[\s-]?up|followup)/i,
    /^(?:sim|isso|ok|beleza|pode ser|blz)\s/i,
    /^(?:to|tÃ´|estou)\s+sem\b/i,
    /^(?:to|tÃ´|estou)\s+com\s+(?:pressa|pouco tempo)\b/i,
    /(?:cria|criar|crie|monta|montar)\s+(?:meu\s+)?agente/i,
    /(?:manda|envia|enviar)\s+(?:o\s+)?link/i,
    /^(?:nao|nÃ£o)\s+(?:tenho|sei|quero)\b/i,
    /^(?:depois|agora nao|agora nÃ£o)\b/i,
    /(?:atendimento|agendamento|venda)\s+(?:e|ou|com|tambem|tambÃƒÂ©m)/i,
    /^(?:ah|entao|entÃƒÂ£o|mas|cara|poxa|tipo)\b/i,
  ];
  for (const pattern of descriptionPatterns) {
    if (pattern.test(cleaned)) return undefined;
  }

  if (
    /^(oi|ola|opa|e ai|eae|fala|bom dia|boa tarde|boa noite|tudo bem)$/i.test(normalized) ||
    /^\??\s*(como|qual|quanto|quando|onde|porque|por que)\b/i.test(normalized)
  ) {
    return undefined;
  }

  return cleaned;
}

function isLikelyBusinessNameCandidate(candidate?: string | null): boolean {
  const cleaned = sanitizeCompanyName(candidate);
  if (!cleaned) return false;

  const normalized = normalizeTextToken(cleaned);
  if (!normalized) return false;

  if (isSimpleGreetingMessage(cleaned)) return false;
  if (looksLikeQuestionMessage(cleaned)) return false;
  if (isMetaCommentary(cleaned)) return false;

  if (
    /\b(preco|valor|plano|assinatura|pix|pagamento|comprovante|duvida|duvidas|como funciona|quanto custa)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  if (
    /\b(to sem|tÃ´ sem|estou sem|sem grana|sem dinheiro|nao tenho dinheiro|nÃ£o tenho dinheiro|nao sei|nÃ£o sei|depois te falo|agora nao|agora nÃ£o)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  const genericOnly = new Set([
    "empresa",
    "negocio",
    "meu negocio",
    "minha empresa",
    "delivery",
    "restaurante",
    "lanchonete",
    "barbearia",
    "clinica",
    "salao",
    "agencia",
    "consultoria",
  ]);
  if (genericOnly.has(normalized)) return false;

  if (/\b(quero|preciso|vou|to|tÃ´|estou|trabalho|vendo|faco|faÃ§o|atendo|me ajuda|pode)\b/.test(normalized)) {
    return false;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 1 && words[0].length < 4) return false;

  return true;
}
interface ExtractedBusinessInfo {
  companyName?: string;
  businessDescription?: string;
  agentType?: "generic" | "delivery" | "salon" | "scheduling";
  mainProduct?: string;
}

/**
 * Usa o runtime Codex para extrair dados estruturados do negocio.
 */
async function extractBusinessInfoWithLLM(userMessage: string): Promise<ExtractedBusinessInfo> {
  try {
    const cleanUserMessage = repairMojibakeText(userMessage);
    const { runWebOnlyCodexPromptTextForUser } = await import("../api/http");
    const raw = await runWebOnlyCodexPromptTextForUser({
      userId: "admin-business-info-extract",
      task: "admin_business_info_json",
      message: cleanUserMessage,
      messages: [
        { role: "system", content: "Extraia informacoes do negocio em JSON puro com campos companyName, businessDescription, agentType e mainProduct. Use null quando nao souber. Sem markdown." },
        { role: "user", content: cleanUserMessage },
      ],
      maxTokens: 300,
      contextArtifacts: { channel: "admin_business_info_extraction" },
    });
    const jsonStr = String(raw || "").replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
    const parsedRaw = JSON.parse(jsonStr);
    const parsed = parsedRaw && typeof parsedRaw === "object" ? (parsedRaw as Record<string, unknown>) : {};

    const result: ExtractedBusinessInfo = {};
    if (parsed.companyName && typeof parsed.companyName === "string" && parsed.companyName !== "null") {
      result.companyName = sanitizeCompanyName(parsed.companyName) || undefined;
    }
    if (parsed.businessDescription && typeof parsed.businessDescription === "string") {
      result.businessDescription = String(parsed.businessDescription).slice(0, 300);
    }
    if (["delivery", "salon", "scheduling", "generic"].includes(String(parsed.agentType || ""))) {
      result.agentType = parsed.agentType as ExtractedBusinessInfo["agentType"];
    }
    if (parsed.mainProduct && typeof parsed.mainProduct === "string") {
      result.mainProduct = String(parsed.mainProduct).slice(0, 120);
    }
    return result;
  } catch (error) {
    console.error("[BUSINESS-EXTRACT] Codex runtime failed:", error);
    return {};
  }
}

function parseExistingAgentIdentity(prompt?: string | null): { agentName?: string; company?: string } {
  const source = String(prompt || "").replace(/\s+/g, " ").trim();
  if (!source) {
    return {};
  }

  // V14: Try new format first: "Seu nome ÃƒÂ© X. VocÃƒÂª trabalha na Y."
  const newFormatName = source.match(/Seu\s+nome\s+[ÃƒÂ©e]\s+([^.]+)\./i);
  const newFormatCompany = source.match(/Voc[ÃƒÂªe]\s+trabalha\s+na\s+([^.]+)\./i);
  if (newFormatName || newFormatCompany) {
    const agentName = normalizeContactName(newFormatName?.[1]);
    const company = sanitizeCompanyName(newFormatCompany?.[1]);
    if (agentName || company) return { agentName, company };
  }

  // Old format: "VocÃƒÂª ÃƒÂ© X, role da Y."
  const introMatch = source.match(/Voc[ÃƒÂªe]\s+[ÃƒÂ©e]\s+([^,\n.]+)(?:,\s*[^.\n]+)?\s+da\s+([^.\n]+)/i);
  const agentName = normalizeContactName(introMatch?.[1]);
  const company = sanitizeCompanyName(introMatch?.[2]);

  // Fallback: try PERSONA line "Sou X da Y"
  if (!agentName && !company) {
    const personaMatch = source.match(/PERSONA:[^\n]*Sou\s+([^\s]+(?:\s+[^\s]+)?)\s+da\s+([^.'"\n]+)/i);
    if (personaMatch) {
      return {
        agentName: normalizeContactName(personaMatch[1]),
        company: sanitizeCompanyName(personaMatch[2]),
      };
    }
  }

  return { agentName, company };
}

function looksLikeQuestionMessage(message: string): boolean {
  const normalized = normalizeTextToken(message);
  return (
    message.includes("?") ||
    /^(como|qual|quais|quanto|quando|onde|porque|por que|funciona|serve|da para|d[aÃƒÂ¡] pra)/.test(normalized)
  );
}

const FREE_ADMIN_WHATSAPP_EDIT_LIMIT = 5;
const DEFAULT_WORK_START = "09:00";
const DEFAULT_WORK_END = "18:00";
const PIX_PAYMENT_LINK = "https://agentezap.online/pagamento.html";
const PIX_KEY_PHONE = "17981465183";
const PIX_HOLDER_NAME = "MARIA FERNANDES DE BESSA MACEDO";
const PIX_BANK_NAME = "Nubank";
const PIX_COPIA_COLA =
  "00020101021126360014br.gov.bcb.pix0114+5517981465183520400005303986540599.995802BR5924MARIA FERNANDES DE BESSA6009COSMORAMA622905257C07EAC7D06B485DACDC9D83A6304CA88";
const DAY_KEY_ORDER = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function isSimpleGreetingMessage(message: string): boolean {
  const normalized = normalizeTextToken(message);
  if (!normalized) return true;
  return /^(oi|ola|opa|e ai|eae|fala|bom dia|boa tarde|boa noite|tudo bem|oii+)$/.test(normalized);
}

function hasExplicitBusinessIdentitySignal(message: string): boolean {
  const normalized = normalizeTextToken(message);
  if (!normalized) return false;

  const hasStrongIdentitySignal = /\b(meu negocio|minha loja|minha empresa|eu vendo|eu faco|trabalho com|sou da|sou do|sou de|sou a|sou o|somos a|somos o|somos da|somos do|somos de|nos somos|nos vendemos|a gente vende|nossa empresa e|nosso negocio e|aqui e a|aqui e o|falo da|falo do|nome do negocio|nome da empresa|tenho a|tenho o|tenho um|tenho uma|eu tenho)\b/.test(
    normalized,
  );
  if (hasStrongIdentitySignal) return true;

  return /\b(?:eu\s+)?tenho\s+(?:um|uma|a|o)\s+(barbearia|loja|restaurante|clinica|salao|delivery|hamburgueria|pizzaria|pet shop|agencia|consultoria|academia|farmacia|padaria|mercado|studio|estudio|escritorio|ecommerce|e-commerce|bicicletaria|bike shop)\b/.test(
    normalized,
  );
}

function isGenericIntentWithoutBusinessIdentity(message: string): boolean {
  const normalized = normalizeTextToken(message);
  if (!normalized) return false;

  const hasIntentVerb =
    /\b(quero|preciso|gostaria|vim de anuncio|vim do anuncio|automatizar|criar agente|criar um agente|atendimento no whatsapp|comercial no whatsapp)\b/.test(
      normalized,
    );
  const hasDomainKeyword =
    /\b(delivery|restaurante|lanchonete|barbearia|clinica|salao|consultoria|agencia|marketing|loja|bicicletaria|bike shop)\b/.test(
      normalized,
    );
  const hasExplicitBusinessIdentity = hasExplicitBusinessIdentitySignal(message);
  const hasStandaloneBusinessName = isLikelyBusinessNameCandidate(extractBusinessNameCandidate(message));

  return hasIntentVerb && hasDomainKeyword && !hasExplicitBusinessIdentity && !hasStandaloneBusinessName;
}

function isQuestionOnlyBusinessProbe(message: string): boolean {
  if (!looksLikeQuestionMessage(message)) return false;

  const normalized = normalizeTextToken(message);
  const hasExplicitBusinessIdentity = hasExplicitBusinessIdentitySignal(message);
  const hasStandaloneBusinessName = isLikelyBusinessNameCandidate(extractBusinessNameCandidate(message));
  const hasOperationalBusinessSignal =
    /\b(quero que|preciso que|o robo|o agente|meu atendimento)\b/.test(normalized) &&
    /\b(cardapio|pedido|produto|servico|duvida|agendamento|venda|entrega)\b/.test(normalized);

  return !hasExplicitBusinessIdentity && !hasStandaloneBusinessName && !hasOperationalBusinessSignal;
}

function hasPotentialBusinessIdentitySignal(message: string): boolean {
  const normalized = normalizeTextToken(message);
  if (!normalized) return false;

  if (isSimpleGreetingMessage(message)) return false;
  if (isMetaCommentary(message)) return false;

  const hasPriceOnlySignal = /\b(preco|valor|mensalidade|quanto custa|plano|assinatura|pix|pagamento)\b/.test(normalized);
  const hasDomainKeyword = /\b(meu negocio|minha loja|minha empresa|eu tenho|eu vendo|eu faco|trabalho com|barbearia|loja|restaurante|clinica|salao|delivery|hamburgueria|pet shop|agencia|escritorio|consultoria|academia|farmacia|padaria|mercado|ecommerce|e-commerce|loja virtual|bicicletaria|bike shop)\b/.test(
    normalized,
  );
  const hasExplicitBusinessIdentity = hasExplicitBusinessIdentitySignal(message);
  const hasStandaloneBusinessName = isLikelyBusinessNameCandidate(extractBusinessNameCandidate(message));
  const hasBusinessSignal = hasDomainKeyword || hasExplicitBusinessIdentity || hasStandaloneBusinessName;

  if (hasPriceOnlySignal && !hasBusinessSignal) return false;
  if (isGenericIntentWithoutBusinessIdentity(message)) return false;
  if (isQuestionOnlyBusinessProbe(message)) return false;

  return hasBusinessSignal;
}

function getSessionFirstName(session: ClientSession): string | undefined {
  const contactName = normalizeContactName(session.contactName);
  const usableContactName = shouldRefreshStoredUserName(contactName) ? undefined : contactName;
  const firstNameCandidate = usableContactName ? usableContactName.split(/\s+/)[0] : "";
  if (!firstNameCandidate || /^cliente$/i.test(firstNameCandidate)) {
    return undefined;
  }
  return firstNameCandidate;
}

function isIdentityQuestion(message: string): boolean {
  const normalized = normalizeTextToken(message);
  if (!normalized) return false;

  return (
    normalized.includes("quem e voce") ||
    normalized.includes("quem e vc") ||
    normalized.includes("vocÃƒÂª ÃƒÂ© quem") ||
    normalized.includes("voce e quem") ||
    normalized.includes("com quem eu falo") ||
    normalized.includes("quem ta falando") ||
    normalized.includes("quem estÃƒÂ¡ falando") ||
    normalized.includes("quem fala")
  );
}

function hasGeneralEditIntent(message: string): boolean {
  const normalized = normalizeTextToken(message);
  if (!normalized) return false;

  // Se a mensagem tem intenÃƒÂ§ÃƒÂ£o de pagamento/assinatura, NÃƒÆ’O ÃƒÂ© edit intent
  if (hasPaymentSubscriptionIntent(normalized)) return false;

  // Evita falsos positivos em perguntas genÃƒÂ©ricas de lead novo
  // (ex.: "dÃƒÂ¡ pra mudar depois?") que nÃƒÂ£o indicam conta/agente jÃƒÂ¡ existente.
  return /\b(editar|edita|alterar|altera|mudar|muda|ajustar|ajusta|calibrar|calibra|corrigir|corrige|mexer|revisar|revisa|configura|configurar|troca|trocar|atualizar|atualiza|personalizar|personaliza)\b/.test(
    normalized,
  );
}

function hasExistingAccountReference(message: string): boolean {
  const normalized = normalizeTextToken(message);
  if (!normalized) return false;

  return /\b(meu agente|minha conta|meu painel|minha configuracao|meu prompt|ja tenho conta|ja uso|ja tenho|ja estou|conta ja criada|agente ja criado)\b/.test(
    normalized,
  );
}

/**
 * Detecta intenÃƒÂ§ÃƒÂ£o de pagamento/assinatura (NÃƒÆ’O ÃƒÂ© ediÃƒÂ§ÃƒÂ£o)
 */
function hasPaymentSubscriptionIntent(normalizedMessage: string): boolean {
  return /\b(assinar|assinatura|pagar|pagamento|pix|plano\s+(mensal|anual|trimestral)|comprovante|boleto|fatura|cobran[cÃƒÂ§]a|valor|pre[cÃƒÂ§]o|custa|custo)\b/.test(normalizedMessage);
}

function hasStartedGuidedSetup(session: ClientSession): boolean {
  const profile = session.setupProfile;
  if (!profile) return false;
  // ANY questionStage means we already asked at least Q1 Ã¢â€ â€™ setup has started
  return Boolean(
    profile.questionStage ||
      profile.answeredBusiness ||
      profile.answeredBehavior ||
      profile.answeredWorkflow,
  );
}

function isResumeOnboardingIntent(message: string): boolean {
  const normalized = normalizeTextToken(message);
  if (!normalized) return false;

  return (
    /\b(vamos continuar|vamos terminar|vamos seguir|podemos continuar|podemos seguir|pode continuar|pode seguir)\b/.test(normalized) ||
    /\b(continua|continue|seguir|segue|prossegue|prosseguir|terminar|termina|retomar|retoma|followp|fup|follow[\s-]?up)\b/.test(normalized) ||
    /\b(criar um novo|quero criar um novo|cria um novo|novo agente)\b/.test(normalized)
  );
}

function looksLikeCurrentGuidedAnswer(
  profile: NonNullable<ClientSession["setupProfile"]>,
  message: string,
): boolean {
  const normalized = normalizeTextToken(message);
  if (!normalized) return false;

  if (!profile.answeredBusiness) {
    const hasExplicitBusinessIdentity = hasExplicitBusinessIdentitySignal(message);
    const hasStandaloneBusinessName = isLikelyBusinessNameCandidate(extractBusinessNameCandidate(message));
    if (isQuestionOnlyBusinessProbe(message) && !hasExplicitBusinessIdentity && !hasStandaloneBusinessName) {
      return false;
    }
    const hasBusinessDomainKeyword =
      /\b(barbearia|loja|restaurante|clinica|salao|delivery|hamburgueria|pizzaria|acai|a[cÃ§]ai|pet shop|agencia|escritorio|consultoria|academia|farmacia|padaria|mercado|ecommerce|e-commerce|loja virtual)\b/i.test(
        normalized,
      );

    return Boolean(
      hasExplicitBusinessIdentity ||
        hasStandaloneBusinessName ||
        (extractMainOfferFromBusinessSummary(message) &&
          hasBusinessDomainKeyword &&
          !looksLikeQuestionMessage(message)),
    );
  }

  if (!profile.answeredBehavior) {
    return (
      normalized.includes("quero que ele") ||
      normalized.includes("quero que o agente") ||
      /\b(venda|vender|follow[ -]?up|duvida|duvidas|agenda|agendamento|agendar|cobran|cobrar|recuperar|suporte|comercial|qualifica|responder|fechar|atender|mistur)\b/.test(normalized)
    );
  }

  if (!profile.answeredWorkflow) {
    const parsedHours = parseWorkWindow(message);
    return Boolean(
      parseRestaurantOrderMode(message) ||
        parseSchedulingPreference(message, { allowPlainYesNo: false }) !== undefined ||
        parseGenericWorkflowFollowUpPreference(message) !== undefined ||
        parseWorkDays(message)?.length ||
        parsedHours.workStartTime ||
        parsedHours.workEndTime,
    );
  }

  if (profile.questionStage === "hours" || shouldRequireHours(profile)) {
    const parsedHours = parseWorkWindow(message);
    return Boolean(parseWorkDays(message)?.length || parsedHours.workStartTime || parsedHours.workEndTime);
  }

  return false;
}

/**
 * V10: Detecta mensagens meta (reclamaÃƒÂ§ÃƒÂ£o, comentÃƒÂ¡rio sobre o fluxo)
 * que NÃƒÆ’O devem ser tratadas como respostas a perguntas guiadas
 */
function isMetaCommentary(message: string): boolean {
  const normalized = normalizeTextToken(message);
  return /\b(ta repetindo|ja disse|jÃƒÂ¡ disse|ja falei|jÃƒÂ¡ falei|ja falou|jÃƒÂ¡ falou|isso ja falou|isso jÃƒÂ¡ falou|voce nao le|voce nao leu|nÃƒÂ£o entendeu|nao entendeu|repete tudo|repetindo tudo|parece robo|parece robÃƒÂ´|resposta robotica|resposta robÃƒÂ³tica|igual robo|igual robÃƒÂ´|bug|travou|loop)\b/.test(
    normalized,
  );
}

/**
 * V10: Detecta mensagens puramente sobre preÃƒÂ§o/valor sem info de negÃƒÂ³cio
 */
function isPurelyPriceQuestion(message: string): boolean {
  const normalized = normalizeTextToken(message);
  if (normalized.length > 60) return false; // Mensagens longas provavelmente contÃƒÂªm info de negÃƒÂ³cio
  const hasPriceKeyword = /\b(preco|valor|mensalidade|quanto custa|quanto e|quanto ÃƒÂ©|quanto vai custar|fala o preco|fala o valor|me fala o preco|me fala o valor|qual o preco|qual o valor|plano|assinatura)\b/.test(normalized);
  const hasBusinessInfo = /\b(meu negocio|minha loja|minha empresa|eu tenho|eu vendo|eu faco|trabalho com|barbearia|loja|restaurante|clinica|salao|delivery|hamburgueria|pet shop|ecommerce|e-commerce|loja virtual)\b/.test(normalized);
  return hasPriceKeyword && !hasBusinessInfo;
}

function isOnboardingSideQuestion(
  message: string,
  profile: NonNullable<ClientSession["setupProfile"]>,
): boolean {
  const normalized = normalizeTextToken(message);
  // V10: Perguntas puramente sobre preÃƒÂ§o sÃƒÂ£o SEMPRE side questions
  // mesmo que looksLikeCurrentGuidedAnswer retorne true
  if (isPurelyPriceQuestion(message)) return true;
  // V10: Meta-commentary ÃƒÂ© side question (reclamaÃƒÂ§ÃƒÂµes sobre repetiÃƒÂ§ÃƒÂ£o etc)
  if (isMetaCommentary(message)) {
    return !looksLikeCurrentGuidedAnswer(profile, message);
  }
  if (!profile.answeredBusiness && isQuestionOnlyBusinessProbe(message)) return true;
  if (
    /\b(mudar|editar|ajustar|trocar)\b/.test(normalized) &&
    /\b(item|itens|produto|produtos|cardapio|horario|horarios)\b/.test(normalized)
  ) {
    return true;
  }
  const isPriceOrFeatureMention = /\b(plano|preco|valor|mensalidade|assinatura|quanto custa|pix|pagamento)\b/.test(normalized);
  if (!isPriceOrFeatureMention && !looksLikeQuestionMessage(message)) return false;

  // V15: Se tem interrogaÃ§Ã£o explÃ­cita E NÃƒO parece resposta do fluxo,
  // tratar como side question sempre (LGPD, integraÃ§Ãµes, ERP, idiomas, etc.)
  const hasExplicitQuestionMark = message.includes("?");
  if (hasExplicitQuestionMark) {
    // Mensagens com ? sÃ£o quase sempre perguntas laterais, nÃ£o respostas guiadas
    // ExceÃ§Ã£o: se for CLARAMENTE uma resposta guiada (ex: "segunda a sexta?")
    const isObviousGuidedAnswer = /^(sim|nao|ok|segunda|terca|quarta|quinta|sexta|sabado|domingo|das?\s+\d|ate?\s+\d|\d{1,2}[h:])/i.test(normalizeTextToken(message));
    if (!isObviousGuidedAnswer) return true;
  }

  if (looksLikeCurrentGuidedAnswer(profile, message)) return false;

  // V16: Se estÃ¡ no stage workflow/delivery e a mensagem descreve fluxo de pedido
  // (contÃ©m pedido + termos operacionais como sabor, endereco, pagamento),
  // NÃƒO tratar como side question â€” Ã© resposta ao workflow.
  if (
    !profile.answeredWorkflow &&
    profile.workflowKind === "delivery" &&
    /\b(pedido|cardapio|delivery)\b/.test(normalized) &&
    /\b(sabor|tamanho|endereco|pagamento|entrega|pegando|pegar|conclu|finaliz|fechar|fecha)\b/.test(normalized)
  ) {
    return false;
  }

  // V15: Se Ã© uma pergunta e NÃƒO Ã© resposta do fluxo guiado, tratar como side question
  // Isso permite que QUALQUER pergunta (LGPD, idiomas, integraÃ§Ãµes, etc.) seja respondida pela LLM
  if (looksLikeQuestionMessage(message)) return true;

  return (
    /\b(plano|preco|valor|mensalidade|assinatura|quanto custa|pix|pagamento)\b/.test(normalized) ||
    /\b(como funciona|funciona|como conecta|conectar|whatsapp|teste|suporte)\b/.test(normalized) ||
    /\b(audio|video|foto|imagem|midia|midea|crm|kanban|follow[ -]?up|notificador)\b/.test(normalized)
  );
}

function countRecentUserMessages(
  session: ClientSession,
  predicate: (message: string) => boolean,
  maxMessages: number = 8,
): number {
  const recentUserMessages = session.conversationHistory
    .filter((item) => item.role === "user" && item.content)
    .slice(-maxMessages);

  return recentUserMessages.reduce(
    (total, item) => total + (predicate(String(item.content)) ? 1 : 0),
    0,
  );
}

function getOrCreateSetupProfile(session: ClientSession): NonNullable<ClientSession["setupProfile"]> {
  const current = session.setupProfile || { questionStage: "business" as const };
  if (!current.questionStage) current.questionStage = "business";
  return current;
}

function extractMainOfferFromBusinessSummary(summary?: string): string | undefined {
  const source = String(summary || "").replace(/\s+/g, " ").trim();
  if (!source) return undefined;

  const explicit = source.match(
    /(?:trabalho com|faÃƒÂ§o|faco|vendo|ofereÃƒÂ§o|ofereco|meu principal servico e|meu principal serviÃƒÂ§o ÃƒÂ©)\s+(.+)$/i,
  );
  const candidate = explicit?.[1]?.trim();
  if (candidate && candidate.length >= 3) {
    return candidate.slice(0, 120);
  }

  const segments = source
    .split(/[-,;|]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length > 1) {
    const tail = segments[segments.length - 1];
    if (tail.length >= 3) {
      return tail.slice(0, 120);
    }
  }

  return source.slice(0, 120);
}

function inferWorkflowKindFromProfile(
  companyName?: string,
  businessSummary?: string,
  explicitScheduling?: boolean,
): "generic" | "scheduling" | "salon" | "delivery" {
  const normalized = normalizeTextToken(`${companyName || ""} ${businessSummary || ""}`);

  if (
    /(barbearia|barbeiro|cabeleire|cabelere|salao|salÃƒÂ£o|manicure|pedicure|estetica|estÃƒÂ©tica|lash|sobrancelha)/.test(
      normalized,
    )
  ) {
    return "salon";
  }

  if (
    /(restaurante|lanchonete|delivery|hamburgueria|hamburger|pizzaria|pizza|acai|aÃƒÂ§ai|sushi|japonesa|lanche|marmita)/.test(
      normalized,
    )
  ) {
    return "delivery";
  }

  if (explicitScheduling) {
    return "scheduling";
  }

  return "generic";
}

function parseRestaurantOrderMode(
  message: string,
): "full_order" | "first_contact" | undefined {
  const normalized = normalizeTextToken(message);
  if (!normalized) return undefined;

  if (
    normalized.includes("primeiro atendimento") ||
    normalized.includes("so o primeiro atendimento") ||
    normalized.includes("sÃƒÂ³ o primeiro atendimento") ||
    normalized.includes("so atender primeiro") ||
    normalized.includes("apenas o primeiro atendimento") ||
    normalized.includes("so qualificar") ||
    normalized.includes("sÃƒÂ³ qualificar")
  ) {
    return "first_contact";
  }

  if (
    normalized.includes("pedido ate o final") ||
    normalized.includes("pedido atÃƒÂ© o final") ||
    normalized.includes("pedido ate o fim") ||
    normalized.includes("pedido atÃƒÂ© o fim") ||
    normalized.includes("ate o fim no whatsapp") ||
    normalized.includes("atÃƒÂ© o fim no whatsapp") ||
    normalized.includes("ate o fim no zap") ||
    normalized.includes("pedido completo") ||
    normalized.includes("fechar o pedido") ||
    normalized.includes("fechar pedido") ||
    normalized.includes("fecha pedido") ||
    normalized.includes("feche pedido") ||
    normalized.includes("concluir o pedido") ||
    normalized.includes("concluir pedido") ||
    normalized.includes("conclua o pedido") ||
    normalized.includes("conclua pedido") ||
    normalized.includes("finalizar o pedido") ||
    normalized.includes("finalizar pedido") ||
    normalized.includes("finalize o pedido") ||
    normalized.includes("finalize pedido")
  ) {
    return "full_order";
  }

  if (
    (normalized.includes("tudo no whatsapp") || normalized.includes("tudo no zap")) &&
    (normalized.includes("pagamento") ||
      normalized.includes("do cardapio ao pagamento") ||
      normalized.includes("do cardapio ao fechamento") ||
      normalized.includes("do cardapio ate fechar") ||
      normalized.includes("do inicio ao fim") ||
      normalized.includes("do comeÃƒÂ§o ao fim") ||
      normalized.includes("do comeco ao fim"))
  ) {
    return "full_order";
  }

  if (
    normalized.includes("depois passe pra voce") ||
    normalized.includes("depois passa pra voce") ||
    normalized.includes("depois me chama") ||
    normalized.includes("depois eu assumo")
  ) {
    return "first_contact";
  }

  // HeurÃƒÂ­stica padrÃƒÂ£o para delivery: quando o cliente descreve fluxo completo
  // (mostrar cardÃƒÂ¡pio + pegar/confirmar pedido), assumir fechamento total.
  const mentionsOrderFlow =
    /\b(cardapio|cardÃƒÂ¡pio|pedido|sabores|entrega|endereco|endereÃƒÂ§o|sabor|tamanho)\b/.test(normalized) &&
    /\b(mostrar|mostre|mostrando|pegar|pega|pegando|confirmar|confirma|confirmando|fechar|fecha|fechando|finalizar|finaliza|finalizando|concluir|conclua|concluindo)\b/.test(
      normalized,
    );
  if (mentionsOrderFlow) {
    return "full_order";
  }

  return undefined;
}

function parseLooseBinaryAnswer(message: string): boolean | undefined {
  const normalized = normalizeTextToken(message);
  if (!normalized) return undefined;

  const compact = normalized
    .replace(/[!?.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    /^(sim|isso|isso mesmo|isso ai|isso ae|ok|okay|blz|beleza|fechado|combinado|perfeito|pode ser|quero sim|pode)$/.test(
      compact,
    )
  ) {
    return true;
  }

  if (/^(nao|negativo|nao quero|prefiro nao|deixa sem|sem isso|melhor nao)$/.test(compact)) {
    return false;
  }

  return undefined;
}

function parseSchedulingPreference(
  message: string,
  options?: {
    allowPlainYesNo?: boolean;
  },
): boolean | undefined {
  const normalized = normalizeTextToken(message);
  if (!normalized) return undefined;

  const hasExplicitNegativeScheduling =
    /\bnao\b[\w\s]{0,20}\b(agenda|agendamento|agendar|marcar|horario)\b/.test(normalized) ||
    /\bsem\b[\w\s]{0,12}\b(agenda|agendamento)\b/.test(normalized) ||
    /\b(somente|so|apenas)\b[\w\s]{0,20}\b(venda|vendas|comercial|atendimento)\b/.test(normalized);

  if (hasExplicitNegativeScheduling) {
    return false;
  }

  if (
    normalized.includes("nao agenda") ||
    normalized.includes("nÃƒÂ£o agenda") ||
    normalized.includes("nao uso agendamento") ||
    normalized.includes("nÃƒÂ£o uso agendamento") ||
    normalized.includes("nao usa agendamento") ||
    normalized.includes("nÃƒÂ£o usa agendamento") ||
    normalized.includes("nao uso agenda") ||
    normalized.includes("nÃƒÂ£o uso agenda") ||
    normalized.includes("sem agenda") ||
    normalized.includes("sem agendamento") ||
    normalized.includes("nao precisa agendar") ||
    normalized.includes("nÃƒÂ£o precisa agendar") ||
    normalized.includes("so responde") ||
    normalized.includes("sÃƒÂ³ responde") ||
    normalized.includes("somente venda") ||
    normalized.includes("somente vendas") ||
    normalized.includes("so venda") ||
    normalized.includes("so vendas") ||
    normalized.includes("sÃƒÂ³ venda") ||
    normalized.includes("sÃƒÂ³ vendas") ||
    normalized.includes("apenas venda") ||
    normalized.includes("apenas vendas") ||
    normalized.includes("somente comercial") ||
    normalized.includes("so comercial") ||
    normalized.includes("sÃƒÂ³ comercial")
  ) {
    return false;
  }

  if (
    normalized.includes("agendamento") ||
    normalized.includes("agendar") ||
    normalized.includes("marcar horario") ||
    normalized.includes("marcar horÃƒÂ¡rio") ||
    normalized.includes("agenda") ||
    normalized.includes("horario") ||
    normalized.includes("horÃƒÂ¡rio")
  ) {
    return true;
  }

  if (options?.allowPlainYesNo !== false) {
    const looseBinary = parseLooseBinaryAnswer(message);
    if (looseBinary !== undefined) return looseBinary;
    if (/\bsim\b/.test(normalized)) return true;
    if (/\bnao\b/.test(normalized)) return false;
  }

  return undefined;
}

function hasSchedulingSignal(message?: string | null): boolean {
  const normalized = normalizeTextToken(message);
  if (!normalized) return false;

  return (
    normalized.includes("agendamento") ||
    normalized.includes("agendar") ||
    normalized.includes("agenda") ||
    normalized.includes("horario") ||
    normalized.includes("horÃƒÂ¡rio") ||
    normalized.includes("consulta") ||
    normalized.includes("reservar") ||
    normalized.includes("reserva")
  );
}

function shouldUseSchedulingWorkflowQuestion(
  profile: NonNullable<ClientSession["setupProfile"]>,
): boolean {
  if (profile.workflowKind === "delivery") return false;
  if (profile.workflowKind === "salon" || profile.workflowKind === "scheduling") return true;
  if (profile.usesScheduling === true) return true;

  return (
    hasSchedulingSignal(profile.businessSummary) ||
    hasSchedulingSignal(profile.desiredAgentBehavior)
  );
}

function parseGenericWorkflowFollowUpPreference(message: string): boolean | undefined {
  const normalized = normalizeTextToken(message);
  if (!normalized) return undefined;

  // V12: Broad affirmative catch-all ("tudo", "quero tudo", "pode ser", "isso", "followp", "com followp", "fup")
  if (
    /\btudo\b/.test(normalized) ||
    /\bcom\s*follow\s*u?p?\b/.test(normalized) ||
    /\bfollowp\b/.test(normalized) ||
    /\bfup\b/.test(normalized) ||
    /\bpode\s*ser\b/.test(normalized) ||
    /\bisso\b/.test(normalized) ||
    /\bquero\b/.test(normalized) ||
    /\bcom\s*certeza\b/.test(normalized) ||
    /\bclaro\b/.test(normalized) ||
    /\bfaz\s*tudo\b/.test(normalized) ||
    /\btodos?\s*(os)?\s*(servic|recurs)/.test(normalized) ||
    normalized.includes("follow up") ||
    normalized.includes("follow-up") ||
    normalized.includes("recuperar cliente") ||
    normalized.includes("recuperar quem nao respondeu") ||
    normalized.includes("recuperar quem nÃƒÂ£o respondeu") ||
    normalized.includes("continuar tentando") ||
    normalized.includes("voltar a falar") ||
    normalized.includes("correr atras") ||
    normalized.includes("correr atrÃƒÂ¡s")
  ) {
    return true;
  }

  if (
    normalized.includes("somente venda") ||
    normalized.includes("somente vendas") ||
    normalized.includes("so venda") ||
    normalized.includes("so vendas") ||
    normalized.includes("sÃƒÂ³ venda") ||
    normalized.includes("sÃƒÂ³ vendas") ||
    normalized.includes("apenas venda") ||
    normalized.includes("apenas vendas") ||
    normalized.includes("sÃƒÂ³ atender") ||
    normalized.includes("so atender") ||
    normalized.includes("me avisa") ||
    normalized.includes("me chamar") ||
    normalized.includes("me chama") ||
    normalized.includes("te avisa") ||
    normalized.includes("te chama") ||
    normalized.includes("somente comercial") ||
    normalized.includes("so comercial") ||
    normalized.includes("sÃƒÂ³ comercial") ||
    /\bnao\s*precisa\b/.test(normalized) ||
    /\bsem\s*follow\b/.test(normalized) ||
    /\bsem\s*fup\b/.test(normalized)
  ) {
    return false;
  }

  const looseBinary = parseLooseBinaryAnswer(message);
  if (looseBinary !== undefined) return looseBinary;
  if (/\bsim\b/.test(normalized)) return true;
  if (/\bnao\b/.test(normalized)) return false;

  return undefined;
}

function normalizeClockHour(rawHour?: string, rawMinute?: string): string | undefined {
  if (!rawHour) return undefined;
  const hour = Number(rawHour);
  const minute = Number(rawMinute || "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeLooseHourTokens(message: string): string {
  return String(message || "")
    .replace(/\b(\d{1,2})\s*h\s*(\d{2})\b/gi, "$1:$2")
    .replace(/\b(\d{1,2})h(\d{2})\b/gi, "$1:$2")
    .replace(/\b(\d{1,2})hs\b/gi, "$1:00")
    .replace(/\b(\d{1,2})h\b/gi, "$1:00")
    .replace(/\b(\d{1,2})\s*h\b/gi, "$1:00");
}

function parseWorkWindow(message: string): { workStartTime?: string; workEndTime?: string } {
  const source = normalizeLooseHourTokens(message)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return {};

  const rangePatterns = [
    /(?:das?|de)\s*(\d{1,2})(?::(\d{2}))?\s*(?:as|a|ate|-|\/)\s*(\d{1,2})(?::(\d{2}))?/i,
    /(\d{1,2})(?::(\d{2}))?\s*(?:as|a|ate|-|\/)\s*(\d{1,2})(?::(\d{2}))?/i,
  ];

  for (const pattern of rangePatterns) {
    const match = source.match(pattern);
    if (!match) continue;

    const start = normalizeClockHour(match[1], match[2]);
    const end = normalizeClockHour(match[3], match[4]);
    if (start && end) {
      return { workStartTime: start, workEndTime: end };
    }
  }

  return {};
}

function parseWorkDays(message: string): number[] | undefined {
  const normalized = normalizeTextToken(message);
  if (!normalized) return undefined;

  if (normalized.includes("todos os dias")) {
    return [0, 1, 2, 3, 4, 5, 6];
  }

  const dayAliases = [
    { value: 0, aliases: ["domingo", "dom"] },
    { value: 1, aliases: ["segunda", "segunda feira", "seg"] },
    { value: 2, aliases: ["terca", "terca feira", "ter"] },
    { value: 3, aliases: ["quarta", "quarta feira", "qua"] },
    { value: 4, aliases: ["quinta", "quinta feira", "qui"] },
    { value: 5, aliases: ["sexta", "sexta feira", "sex"] },
    { value: 6, aliases: ["sabado", "sab"] },
  ] as const;

  const findDayIndex = (text: string): number | undefined => {
    for (const day of dayAliases) {
      if (day.aliases.some((alias) => text.includes(alias))) {
        return day.value;
      }
    }
    return undefined;
  };

  const rangeMatch = normalized.match(
    /(?:de\s+)?(segunda(?: feira)?|seg|terca(?: feira)?|ter|quarta(?: feira)?|qua|quinta(?: feira)?|qui|sexta(?: feira)?|sex|sabado|sab|domingo|dom)\s*(?:a|ate|-|\/)\s*(segunda(?: feira)?|seg|terca(?: feira)?|ter|quarta(?: feira)?|qua|quinta(?: feira)?|qui|sexta(?: feira)?|sex|sabado|sab|domingo|dom)/,
  );

  if (rangeMatch) {
    const start = findDayIndex(rangeMatch[1]);
    const end = findDayIndex(rangeMatch[2]);
    if (start !== undefined && end !== undefined) {
      const days: number[] = [];
      let current = start;
      for (let safety = 0; safety < 7; safety += 1) {
        days.push(current);
        if (current === end) break;
        current = (current + 1) % 7;
      }
      return Array.from(new Set(days));
    }
  }

  const matches = dayAliases
    .filter((day) => day.aliases.some((alias) => new RegExp(`\\b${alias}\\b`).test(normalized)))
    .map((day) => day.value);

  if (matches.length > 0) {
    return Array.from(new Set(matches));
  }

  return undefined;
}
function buildBusinessHoursMap(
  enabledDays?: number[],
  openTime: string = DEFAULT_WORK_START,
  closeTime: string = DEFAULT_WORK_END,
) {
  const activeDays = new Set((enabledDays && enabledDays.length > 0 ? enabledDays : [1, 2, 3, 4, 5]).map(Number));
  const businessHours: Record<string, { enabled: boolean; open: string; close: string }> = {};

  DAY_KEY_ORDER.forEach((dayKey, index) => {
    const isEnabled = activeDays.has(index);
    businessHours[dayKey] = {
      enabled: isEnabled,
      open: openTime,
      close: closeTime,
    };
  });

  return businessHours;
}

function formatBusinessDaysForHumans(days?: number[]): string {
  const labels = ["domingo", "segunda", "terÃƒÂ§a", "quarta", "quinta", "sexta", "sÃƒÂ¡bado"];
  const validDays = (days || []).filter((day) => day >= 0 && day <= 6).sort((a, b) => a - b);
  if (validDays.length === 0) return "segunda a sexta";
  // V9: Detectar faixas contÃƒÂ­guas e exibir como "segunda a sÃƒÂ¡bado"
  const isContiguous = validDays.length > 1 && validDays.every((day, i) => i === 0 || day === validDays[i - 1] + 1);
  if (isContiguous && validDays.length > 2) {
    return `${labels[validDays[0]]} a ${labels[validDays[validDays.length - 1]]}`;
  }
  return validDays.map((day) => labels[day]).join(", ");
}

function getPanelPathForWorkflow(
  workflowKind?: "generic" | "scheduling" | "salon" | "delivery",
): string {
  switch (workflowKind) {
    case "salon":
      return "/salon-menu";
    case "delivery":
      return "/delivery-2";
    case "scheduling":
      return "/agendamentos";
    default:
      return "/meu-agente-ia";
  }
}

function shouldRequireHours(profile: NonNullable<ClientSession["setupProfile"]>): boolean {
  if (profile.workflowKind === "delivery") return false;
  if (profile.workflowKind === "salon") return profile.usesScheduling !== false;
  if (profile.workflowKind === "scheduling") return profile.usesScheduling !== false;
  return profile.usesScheduling === true;
}

function isSetupProfileReady(profile?: ClientSession["setupProfile"]): boolean {
  if (!profile?.answeredBusiness || !profile.answeredBehavior || !profile.answeredWorkflow) {
    return false;
  }

  if (!shouldRequireHours(profile)) {
    return true;
  }

  return Boolean(
    profile.workDays &&
      profile.workDays.length > 0 &&
      profile.workStartTime &&
      profile.workEndTime,
  );
}

function tryAutofillGuidedProfileFromSingleMessage(
  profile: NonNullable<ClientSession["setupProfile"]>,
  message: string,
): void {
  const normalized = normalizeTextToken(message);
  if (!normalized) return;

  const hasBehaviorSignal =
    /\b(quero que|preciso que|ele vai|ele deve|atender|vender|agendar|tirar duvida|tirar duvidas|cobrar|follow[\s-]?up|pedido|fechar)\b/.test(
      normalized,
    ) || normalized.split(/\s+/).length >= 14;

  if (!profile.answeredBehavior && hasBehaviorSignal) {
    profile.desiredAgentBehavior = message;
    profile.answeredBehavior = true;
    if (!profile.rawAnswers) profile.rawAnswers = {};
    if (!profile.rawAnswers.q2) profile.rawAnswers.q2 = message;
    profile.questionStage = "workflow";
  }

  if (!profile.answeredBehavior || profile.answeredWorkflow) {
    return;
  }

  profile.workflowKind =
    profile.workflowKind ||
    inferWorkflowKindFromProfile(undefined, message, profile.usesScheduling);

  if (profile.workflowKind === "delivery") {
    const orderMode = parseRestaurantOrderMode(message);
    if (!orderMode) return;
    profile.restaurantOrderMode = orderMode;
    profile.usesScheduling = false;
    profile.answeredWorkflow = true;
    profile.questionStage = "ready";
    if (!profile.rawAnswers) profile.rawAnswers = {};
    if (!profile.rawAnswers.q3) profile.rawAnswers.q3 = message;
    return;
  }

  const parsedDays = parseWorkDays(message);
  const parsedHours = parseWorkWindow(message);
  const useSchedulingQuestion = shouldUseSchedulingWorkflowQuestion(profile);
  const schedulingPreference =
    parseSchedulingPreference(message, {
      allowPlainYesNo: useSchedulingQuestion || profile.workflowKind === "salon",
    }) ?? (profile.workflowKind === "salon" ? true : undefined);
  const genericFollowUpPreference = parseGenericWorkflowFollowUpPreference(message);

  if (parsedDays?.length) profile.workDays = parsedDays;
  if (parsedHours.workStartTime) profile.workStartTime = parsedHours.workStartTime;
  if (parsedHours.workEndTime) profile.workEndTime = parsedHours.workEndTime;

  if (useSchedulingQuestion) {
    if (schedulingPreference === undefined) return;
    profile.usesScheduling = schedulingPreference;
    if (schedulingPreference && profile.workflowKind === "generic") {
      profile.workflowKind = "scheduling";
    }
    profile.answeredWorkflow = true;
    profile.questionStage = shouldRequireHours(profile) ? "hours" : "ready";
  } else if (schedulingPreference === true) {
    profile.usesScheduling = true;
    if (profile.workflowKind === "generic") {
      profile.workflowKind = "scheduling";
    }
    profile.answeredWorkflow = true;
    profile.questionStage = shouldRequireHours(profile) ? "hours" : "ready";
  } else if (schedulingPreference === false || genericFollowUpPreference !== undefined) {
    profile.usesScheduling = false;
    profile.wantsAutoFollowUp = genericFollowUpPreference ?? false;
    profile.answeredWorkflow = true;
    profile.questionStage = "ready";
  } else {
    return;
  }

  if (!profile.rawAnswers) profile.rawAnswers = {};
  if (!profile.rawAnswers.q3) profile.rawAnswers.q3 = message;
}

function buildStructuredAgentInstructions(session: ClientSession): string {
  const profile = session.setupProfile;
  const config = session.agentConfig || {};
  const company = sanitizeCompanyName(config.company) || "empresa";
  const workflowKind = profile?.workflowKind || inferWorkflowKindFromProfile(company, profile?.businessSummary);
  const role = config.role || inferRoleFromBusinessName(company);
  const parts: string[] = [];

  // Incluir respostas brutas do cliente para contexto rico
  if (profile?.rawAnswers?.q1) {
    parts.push(`[Resposta original do cliente sobre o negÃƒÂ³cio]: ${profile.rawAnswers.q1}`);
  }
  if (profile?.rawAnswers?.q2) {
    parts.push(`[Resposta original sobre comportamento desejado]: ${profile.rawAnswers.q2}`);
  }
  if (profile?.rawAnswers?.q3) {
    parts.push(`[Resposta original sobre fluxo/horÃƒÂ¡rios]: ${profile.rawAnswers.q3}`);
  }

  if (profile?.businessSummary) {
    parts.push(`NegÃƒÂ³cio do cliente: ${profile.businessSummary}.`);
  }

  if (profile?.mainOffer) {
    parts.push(`Principal serviÃƒÂ§o/produto: ${profile.mainOffer}.`);
  }

  parts.push(`Tipo de negÃƒÂ³cio detectado: ${workflowKind}.`);
  const agentDisplayName = config.name || "Atendente";
  parts.push(`Seu nome ÃƒÂ© ${agentDisplayName}. VocÃƒÂª trabalha na ${company}. Atue como ${role} da ${company}, com linguagem humana, objetiva e segura.`);
  parts.push(`Quando se apresentar, diga: "Sou o(a) ${agentDisplayName}, da ${company}". NUNCA use placeholders como "[Seu Nome]" ou "[Nome]" Ã¢â‚¬" seu nome real ÃƒÂ© ${agentDisplayName}.`);

  if (profile?.desiredAgentBehavior) {
    parts.push(`Forma de atendimento desejada: ${profile.desiredAgentBehavior}.`);
  }

  if (workflowKind === "generic" && typeof profile?.wantsAutoFollowUp === "boolean") {
    parts.push(
      profile.wantsAutoFollowUp
        ? "Depois do primeiro atendimento, faÃƒÂ§a follow-up automÃƒÂ¡tico de forma natural para recuperar quem sumiu e continuar a venda."
        : "NÃƒÂ£o force follow-up automÃƒÂ¡tico em todo caso. Foque em atendimento e vendas, e sÃƒÂ³ chame o responsÃƒÂ¡vel quando realmente precisar.",
    );
  }

  parts.push(
    "Sempre confirme dados importantes antes de concluir algo. Nunca invente preÃƒÂ§o, horÃƒÂ¡rio ou disponibilidade que nÃƒÂ£o estejam configurados.",
  );

  if (workflowKind === "delivery") {
    if (profile?.restaurantOrderMode === "full_order") {
      parts.push(
        "Fluxo restaurante: conduza o atendimento atÃƒÂ© fechar o pedido quando o cardÃƒÂ¡pio estiver configurado, confirme itens e total antes de concluir.",
      );
    } else {
      parts.push(
        "Fluxo restaurante: faÃƒÂ§a o primeiro atendimento, entenda o pedido e prepare o terreno, mas sem finalizar um pedido completo sem validaÃƒÂ§ÃƒÂ£o humana.",
      );
    }
  }

  if (shouldRequireHours(profile || {})) {
    const workDays = formatBusinessDaysForHumans(profile?.workDays);
    const start = profile?.workStartTime || DEFAULT_WORK_START;
    const end = profile?.workEndTime || DEFAULT_WORK_END;
    parts.push(
      `HorÃƒÂ¡rio operacional real: somente ${workDays}, das ${start} ÃƒÂ s ${end}. Nunca ofereÃƒÂ§a horÃƒÂ¡rios fora dessa janela.`,
    );

    if (workflowKind === "salon") {
      parts.push(
        "Use o mÃƒÂ³dulo de salÃƒÂ£o para validar serviÃƒÂ§os, profissionais e horÃƒÂ¡rios reais antes de confirmar qualquer agendamento.",
      );
    } else {
      parts.push(
        "Use o mÃƒÂ³dulo de agendamentos para sugerir e confirmar apenas horÃƒÂ¡rios vÃƒÂ¡lidos.",
      );
    }
  } else if (profile?.usesScheduling === false) {
    parts.push("NÃƒÂ£o use agendamento automÃƒÂ¡tico. Foque em tirar dÃƒÂºvidas, qualificar e encaminhar o cliente.");
  }

  return parts.join("\n");
}

async function shouldForceFreeEditLimitForUser(userId: string): Promise<boolean> {
  const user = await storage.getUser(userId).catch(() => undefined);
  const email = String((user as any)?.email || "").toLowerCase();
  return email.endsWith("@agentezap.online") || email.endsWith("@agentezap.com");
}

async function getAdminEditAllowance(userId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  hasActiveSubscription: boolean;
}> {
  const entitlement = await getAccessEntitlement(userId);
  const forceFreeLimit = await shouldForceFreeEditLimitForUser(userId);

  if (entitlement.hasActiveSubscription && !forceFreeLimit) {
    return {
      allowed: true,
      used: 0,
      limit: FREE_ADMIN_WHATSAPP_EDIT_LIMIT,
      hasActiveSubscription: true,
    };
  }

  const usage = await storage.getDailyUsage(userId);
  return {
    allowed: usage.promptEditsCount < FREE_ADMIN_WHATSAPP_EDIT_LIMIT,
    used: usage.promptEditsCount,
    limit: FREE_ADMIN_WHATSAPP_EDIT_LIMIT,
    hasActiveSubscription: false,
  };
}

function hasCompleteTestCredentials(
  credentials?: Partial<TestAccountCredentials> | null,
): credentials is TestAccountCredentials & { simulatorToken: string } {
  if (!credentials) return false;
  const hasEmail = Boolean(String(credentials.email || "").trim());
  const hasLoginUrl = Boolean(String(credentials.loginUrl || "").trim());
  const hasToken = Boolean(String(credentials.simulatorToken || "").trim());
  return hasEmail && hasLoginUrl && hasToken;
}

async function consumeAdminPromptEdit(userId: string): Promise<void> {
  const entitlement = await getAccessEntitlement(userId);
  const forceFreeLimit = await shouldForceFreeEditLimitForUser(userId);

  if (!entitlement.hasActiveSubscription || forceFreeLimit) {
    await storage.incrementPromptEdits(userId);
  }
}
async function getPersistedWorkflowKind(
  userId: string,
): Promise<"generic" | "scheduling" | "salon" | "delivery"> {
  const [deliveryResult, schedulingResult, salonResult] = await Promise.all([
    supabase.from("delivery_config").select("is_active").eq("user_id", userId).maybeSingle(),
    supabase.from("scheduling_config").select("is_enabled").eq("user_id", userId).maybeSingle(),
    supabase.from("salon_config").select("is_active").eq("user_id", userId).maybeSingle(),
  ]);

  if (salonResult.data?.is_active === true) return "salon";
  if (deliveryResult.data?.is_active === true) return "delivery";
  if (schedulingResult.data?.is_enabled === true) return "scheduling";
  return "generic";
}

async function updateAgentBusinessHours(
  userId: string,
  workDays?: number[],
  workStartTime?: string,
  workEndTime?: string,
): Promise<void> {
  if (!workDays || workDays.length === 0 || !workStartTime || !workEndTime) {
    return;
  }

  await saveAgentConfigPatch(userId, {
    businessHoursEnabled: true,
    businessHours: buildBusinessHoursMap(workDays, workStartTime, workEndTime),
  });
}

async function saveAgentConfigPatch(
  userId: string,
  data: Partial<InsertAiAgentConfig>,
): Promise<void> {
  const existingConfig = await storage.getAgentConfig(userId);

  if (existingConfig) {
    await storage.updateAgentConfig(userId, data);
    return;
  }

  await storage.upsertAgentConfig(userId, {
    prompt: "Seja prestativo, educado e atenda o cliente com clareza.",
    isActive: true,
    model: "gpt-5.4-mini",
    triggerPhrases: [],
    messageSplitChars: 400,
    responseDelaySeconds: 30,
    ...data,
  });
}

async function ensureSalonSeedData(
  userId: string,
  companyName: string,
  mainOffer?: string,
): Promise<void> {
  const { data: services } = await supabase
    .from("scheduling_services")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (!services || services.length === 0) {
    await supabase.from("scheduling_services").insert({
      user_id: userId,
      name: mainOffer || "Atendimento principal",
      description: `ServiÃƒÂ§o inicial configurado automaticamente para ${companyName}.`,
      duration_minutes: 60,
      price: null,
      is_active: true,
      color: "#0f766e",
      display_order: 1,
    });
  }

  const { data: professionals } = await supabase
    .from("scheduling_professionals")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (!professionals || professionals.length === 0) {
    await supabase.from("scheduling_professionals").insert({
      user_id: userId,
      name: "Equipe principal",
      bio: `Profissional padrÃƒÂ£o criado para ${companyName}.`,
      avatar_url: null,
      is_active: true,
      display_order: 1,
      work_schedule: {},
    });
  }
}

async function ensureDeliverySeedData(
  userId: string,
  companyName: string,
  mainOffer?: string,
  orderMode?: "full_order" | "first_contact",
): Promise<void> {
  const { data: categories } = await supabase
    .from("menu_categories")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  let categoryId = categories?.[0]?.id;
  if (!categoryId) {
    const { data: insertedCategory } = await supabase
      .from("menu_categories")
      .insert({
        user_id: userId,
        name: "ConfiguraÃƒÂ§ÃƒÂ£o inicial",
        description: `Categoria criada automaticamente para ${companyName}.`,
        display_order: 1,
        is_active: true,
      })
      .select("id")
      .single();

    categoryId = insertedCategory?.id;
  }

  const { data: items } = await supabase
    .from("menu_items")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if ((!items || items.length === 0) && categoryId) {
    await supabase.from("menu_items").insert({
      user_id: userId,
      category_id: categoryId,
      name: mainOffer || "Atendimento inicial",
      description:
        orderMode === "full_order"
          ? "Item piloto criado para testar o fluxo completo de pedidos. Depois podemos cadastrar o cardÃƒÂ¡pio real."
          : "Item piloto criado para o primeiro atendimento enquanto o cardÃƒÂ¡pio real ainda estÃƒÂ¡ sendo configurado.",
      price: "0.00",
      preparation_time: 30,
      is_available: true,
      is_featured: true,
      options: [],
      serves: 1,
      display_order: 1,
    });
  }
}

async function applyStructuredSetupToUser(
  userId: string,
  session: ClientSession,
): Promise<{
  workflowKind: "generic" | "scheduling" | "salon" | "delivery";
}> {
  const profile = session.setupProfile;
  const companyName = sanitizeCompanyName(session.agentConfig?.company) || "Empresa";
  const workflowKind =
    profile?.workflowKind || inferWorkflowKindFromProfile(companyName, profile?.businessSummary, profile?.usesScheduling);

  const workDays = profile?.workDays && profile.workDays.length > 0 ? profile.workDays : [1, 2, 3, 4, 5];
  const workStartTime = profile?.workStartTime || DEFAULT_WORK_START;
  const workEndTime = profile?.workEndTime || DEFAULT_WORK_END;

  await storage.updateUser(userId, {
    businessType:
      workflowKind === "delivery"
        ? "delivery"
        : workflowKind === "salon"
          ? "salon"
          : workflowKind === "scheduling"
            ? "agendamento"
            : "servico",
  });

  if (shouldRequireHours(profile || {})) {
    await updateAgentBusinessHours(userId, workDays, workStartTime, workEndTime);
  }

  if (workflowKind === "salon") {
    await supabase.from("salon_config").upsert(
      {
        user_id: userId,
        is_active: profile?.usesScheduling !== false,
        send_to_ai: true,
        salon_name: companyName,
        salon_type: normalizeTextToken(companyName).includes("barbear") ? "barbershop" : "salon",
        opening_hours: buildBusinessHoursMap(workDays, workStartTime, workEndTime),
        slot_duration: 30,
        buffer_between: 10,
        max_advance_days: 30,
        min_notice_hours: 2,
        min_notice_minutes: 0,
        allow_cancellation: true,
        cancellation_notice_hours: 4,
        use_services: true,
        use_professionals: true,
        allow_multiple_services: false,
        ai_instructions:
          profile?.desiredAgentBehavior ||
          "Atenda com naturalidade, ofereÃƒÂ§a serviÃƒÂ§os reais e confirme apenas horÃƒÂ¡rios disponÃƒÂ­veis.",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    await ensureSalonSeedData(userId, companyName, profile?.mainOffer);
    await supabase
      .from("delivery_config")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    await supabase
      .from("scheduling_config")
      .update({ is_enabled: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    invalidateSchedulingCache(userId);
    return { workflowKind };
  }

  if (workflowKind === "delivery") {
    const shouldRunFullOrder = profile?.restaurantOrderMode === "full_order";
    await supabase.from("delivery_config").upsert(
      {
        user_id: userId,
        is_active: shouldRunFullOrder,
        send_to_ai: true,
        business_name: companyName,
        business_type: "restaurante",
        delivery_fee: 0,
        min_order_value: 0,
        estimated_delivery_time: 45,
        delivery_radius_km: 10,
        payment_methods: ["dinheiro", "cartao", "pix"],
        accepts_delivery: true,
        accepts_pickup: true,
        opening_hours: buildBusinessHoursMap(workDays, workStartTime, workEndTime),
        ai_instructions:
          shouldRunFullOrder
            ? "Atenda com naturalidade, mostre o cardÃƒÂ¡pio configurado, monte o pedido com cuidado e confirme antes de concluir."
            : "FaÃƒÂ§a o primeiro atendimento, entenda o pedido e organize o contexto, mas sem finalizar o pedido completo sem validaÃƒÂ§ÃƒÂ£o humana.",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    await ensureDeliverySeedData(userId, companyName, profile?.mainOffer, profile?.restaurantOrderMode);
    await supabase
      .from("salon_config")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    await supabase
      .from("scheduling_config")
      .update({ is_enabled: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    invalidateSchedulingCache(userId);
    return { workflowKind };
  }

  if (workflowKind === "scheduling" && profile?.usesScheduling !== false) {
    const schedulingPayload = {
      user_id: userId,
      is_enabled: true,
      service_name: profile?.mainOffer || "Atendimento",
      service_duration: 60,
      location: companyName,
      location_type: "presencial",
      available_days: workDays,
      work_start_time: workStartTime,
      work_end_time: workEndTime,
      break_start_time: "12:00",
      break_end_time: "13:00",
      has_break: false,
      slot_duration: 60,
      buffer_between_appointments: 15,
      max_appointments_per_day: 10,
      advance_booking_days: 30,
      min_booking_notice_hours: 2,
      require_confirmation: true,
      auto_confirm: false,
      allow_cancellation: true,
      send_reminder: true,
      reminder_hours_before: 24,
      google_calendar_enabled: false,
      confirmation_message: "Seu agendamento foi confirmado!",
      reminder_message: "Lembrete: vocÃƒÂª tem um agendamento marcado.",
      cancellation_message: "Seu agendamento foi cancelado.",
      updated_at: new Date().toISOString(),
    };

    const { data: existingSchedulingRows, error: existingSchedulingError } = await supabase
      .from("scheduling_config")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (existingSchedulingError) {
      throw existingSchedulingError;
    }

    if (existingSchedulingRows && existingSchedulingRows.length > 0) {
      const { error: updateSchedulingError } = await supabase
        .from("scheduling_config")
        .update(schedulingPayload)
        .eq("user_id", userId);

      if (updateSchedulingError) {
        throw updateSchedulingError;
      }
    } else {
      const { error: insertSchedulingError } = await supabase
        .from("scheduling_config")
        .insert(schedulingPayload);

      if (insertSchedulingError) {
        throw insertSchedulingError;
      }
    }

    await supabase
      .from("salon_config")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    await supabase
      .from("delivery_config")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    invalidateSchedulingCache(userId);
    return { workflowKind };
  }

  await supabase
    .from("salon_config")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  await supabase
    .from("delivery_config")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  await supabase
    .from("scheduling_config")
    .update({ is_enabled: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  await saveAgentConfigPatch(userId, {
    businessHoursEnabled: false,
  });
  invalidateSchedulingCache(userId);

  return { workflowKind: "generic" };
}

function parseExistingClientPromptAdjustments(message: string): {
  requested: boolean;
  agentName?: string;
  company?: string;
  moreCommercial?: boolean;
} {
  const normalized = normalizeTextToken(message);
  if (!normalized) return { requested: false };

  const moreCommercial =
    normalized.includes("mais comercial") ||
    normalized.includes("tom comercial") ||
    normalized.includes("mais vendedor") ||
    normalized.includes("tom de vendedor");

  let agentName: string | undefined;
  let company: string | undefined;

  // PadrÃƒÂ£o 1: "identifica-se como X da Y", "apresenta-se como X da Y"
  const identityMatch = String(message || "").match(
    /(?:identific(?:a|ar|ando)(?:-?se)?|apresent(?:a|ar)(?:-?se)?|come[cÃƒÂ§]a(?:r)?(?:\s+se)?\s+identificando)\s+como\s+([^.!?\n]+)/i,
  );

  // PadrÃƒÂ£o 2: "altera para X da Y", "muda para X da Y", "troca para X da Y"
  const alteraParaMatch = !identityMatch && String(message || "").match(
    /(?:alter[ae]|mud[ae]|troc[ae]|coloc[ae]|bot[ae]|p[oÃƒÂµ]e)\s+(?:o\s+(?:nome|agente)\s+)?(?:pra|para)\s+(?:o\s+)?([^.!?\n]+)/i,
  );

  // PadrÃƒÂ£o 3: "meu agente seja X", "quero que o agente seja X", "o nome seja X"
  const sejaMatch = !identityMatch && !alteraParaMatch && String(message || "").match(
    /(?:(?:meu\s+)?agente\s+(?:se\s+cham[ea]r?|seja)|(?:faz|fa[cÃƒÂ§]a|quero\s+que)\s+(?:o\s+)?(?:agente|nome|ele)\s+(?:se\s+cham[ea]r?|seja)|(?:o\s+)?nome\s+(?:do\s+agente\s+)?seja|(?:ele\s+)?se\s+cham[ea]r?)\s+(?:o\s+)?([^.!?\n]+)/i,
  );

  // PadrÃƒÂ£o 4: "o vendedor X da Y", "o atendente X da Y" (quando combinado com verbo de ediÃƒÂ§ÃƒÂ£o)
  const vendedorMatch = !identityMatch && !alteraParaMatch && !sejaMatch && 
    hasGeneralEditIntent(message) && 
    String(message || "").match(
      /(?:o\s+)?(?:vendedor|atendente|consultor|agente)\s+([A-Za-z][A-Za-z]+(?:\s+[A-Za-z][A-Za-z]+)*)\s+(?:d[aoe]\s+)([^.!?\n]+)/i,
    );

  // PadrÃƒÂ£o 5: "nome do agente para X" ou "nome para X"
  const nomeParaMatch = !identityMatch && !alteraParaMatch && !sejaMatch && !vendedorMatch &&
    String(message || "").match(
      /(?:o\s+)?nome\s+(?:do\s+(?:agente|atendente|bot)\s+)?(?:pra|para)\s+(?:o\s+)?([^.!?\n]+)/i,
    );

  const rawMatch = identityMatch || alteraParaMatch || sejaMatch || nomeParaMatch;
  let identityRaw = rawMatch?.[1]
    ?.replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Para vendedorMatch, combinar nome e empresa
  if (vendedorMatch && !identityRaw) {
    agentName = normalizeContactName(vendedorMatch[1]) || undefined;
    company = sanitizeCompanyName(vendedorMatch[2]) || undefined;
  }

  if (identityRaw) {
    // Limpa sufixos irrelevantes: "que meu agente seja o vendedor Rodrigo"
    identityRaw = identityRaw
      .replace(/\s+que\s+(?:meu\s+)?(?:agente|ele)\s+seja\s+(?:o\s+)?(?:vendedor|atendente|consultor)?\s*/i, " ")
      .replace(/\s+e\s+(?:meu\s+)?(?:agente|ele)\s+(?:seja|se\s+chame?)\s+(?:o\s+)?(?:vendedor|atendente|consultor)?\s*/i, " ")
      .trim();

    const splitMatch = identityRaw.match(/^(.+?)\s+d[ao]\s+(.+)$/i);
    if (splitMatch) {
      agentName = normalizeContactName(splitMatch[1]) || agentName;
      company = sanitizeCompanyName(splitMatch[2]) || company;
    } else {
      agentName = normalizeContactName(identityRaw) || agentName;
    }
  }

  const hasIdentityChange = Boolean(agentName || company);

  return {
    requested: Boolean(hasIdentityChange || moreCommercial),
    agentName,
    company,
    moreCommercial,
  };
}

function applyExistingClientPromptAdjustments(
  currentPrompt: string,
  updates: {
    agentName?: string;
    company?: string;
    moreCommercial?: boolean;
    fallbackCompany?: string;
  },
): {
  prompt: string;
  agentName?: string;
  company?: string;
  changed: boolean;
} {
  let nextPrompt = String(currentPrompt || "");
  if (!nextPrompt) {
    return {
      prompt: nextPrompt,
      agentName: updates.agentName,
      company: updates.company || updates.fallbackCompany,
      changed: false,
    };
  }

  const existingIdentity = parseExistingAgentIdentity(nextPrompt);
  const company = updates.company || existingIdentity.company || sanitizeCompanyName(updates.fallbackCompany);
  const agentName = updates.agentName || existingIdentity.agentName || "Atendente";
  const role = inferRoleFromBusinessName(company);
  let changed = false;

  if (company) {
    // V14: Handle new prompt format: "Seu nome ÃƒÂ© X. VocÃƒÂª trabalha na Y. Atue como role da Y..."
    if (/Seu\s+nome\s+[ÃƒÂ©e]\s+[^.]+\./i.test(nextPrompt)) {
      const replacedName = nextPrompt.replace(
        /Seu\s+nome\s+[ÃƒÂ©e]\s+[^.]+\./i,
        `Seu nome ÃƒÂ© ${agentName}.`,
      );
      if (replacedName !== nextPrompt) {
        nextPrompt = replacedName;
        changed = true;
      }
    }
    if (/Voc[ÃƒÂªe]\s+trabalha\s+na\s+[^.]+\./i.test(nextPrompt)) {
      const replacedCompany = nextPrompt.replace(
        /Voc[ÃƒÂªe]\s+trabalha\s+na\s+[^.]+\./i,
        `VocÃƒÂª trabalha na ${company}.`,
      );
      if (replacedCompany !== nextPrompt) {
        nextPrompt = replacedCompany;
        changed = true;
      }
    }
    if (/Atue\s+como\s+[^,]+\s+da\s+[^,]+,/i.test(nextPrompt)) {
      const replacedRole = nextPrompt.replace(
        /Atue\s+como\s+[^,]+\s+da\s+[^,]+,/i,
        `Atue como ${role} da ${company},`,
      );
      if (replacedRole !== nextPrompt) {
        nextPrompt = replacedRole;
        changed = true;
      }
    }
    // V14: Update anti-placeholder and presentation lines
    if (/diga:\s*"Sou\s+o\(a\)\s+[^"]+,\s+da\s+[^"]+"/i.test(nextPrompt)) {
      nextPrompt = nextPrompt.replace(
        /diga:\s*"Sou\s+o\(a\)\s+[^"]+,\s+da\s+[^"]+"/i,
        `diga: "Sou o(a) ${agentName}, da ${company}"`,
      );
      changed = true;
    }
    if (/seu\s+nome\s+real\s+[ÃƒÂ©e]\s+[^.]+\./i.test(nextPrompt)) {
      nextPrompt = nextPrompt.replace(
        /seu\s+nome\s+real\s+[ÃƒÂ©e]\s+[^.]+\./i,
        `seu nome real ÃƒÂ© ${agentName}.`,
      );
      changed = true;
    }

    // Old format: "# IDENTIDADE" / "# SOBRE A EMPRESA" sections
    const identityLine = `VocÃƒÂª ÃƒÂ© ${agentName}, ${role} da ${company}.`;
    const nextWithIdentity = nextPrompt.replace(/(# IDENTIDADE\s*\n)[^\n]*/i, `$1${identityLine}`);
    if (nextWithIdentity !== nextPrompt) {
      nextPrompt = nextWithIdentity;
      changed = true;
    }

    const nextWithCompany = nextPrompt.replace(/(# SOBRE A EMPRESA\s*\n)[^\n]*/i, `$1${company}`);
    if (nextWithCompany !== nextPrompt) {
      nextPrompt = nextWithCompany;
      changed = true;
    }

    const personaLine = `9. PERSONA: Se perguntarem quem ÃƒÂ©, diga 'Sou ${agentName} da ${company}'. Nunca diga 'Sou um assistente virtual'.`;
    if (/9\.\s*PERSONA:[^\n]*/i.test(nextPrompt)) {
      const replacedPersona = nextPrompt.replace(/9\.\s*PERSONA:[^\n]*/i, personaLine);
      if (replacedPersona !== nextPrompt) {
        nextPrompt = replacedPersona;
        changed = true;
      }
    } else {
      nextPrompt = `${nextPrompt.trim()}\n${personaLine}`;
      changed = true;
    }

    const greetingExample = `${agentName}: "OlÃƒÂ¡! Ã°Å¸â€˜â€¹ Bem-vindo ÃƒÂ  ${company}! Como posso te ajudar hoje?"`;
    if (/Cliente:\s*"Oi"\s*\n[^\n]+:\s*"[^"]*"/i.test(nextPrompt)) {
      const replacedExample = nextPrompt.replace(
        /(Cliente:\s*"Oi"\s*\n)[^\n]+:\s*"[^"]*"/i,
        `$1${greetingExample}`,
      );
      if (replacedExample !== nextPrompt) {
        nextPrompt = replacedExample;
        changed = true;
      }
    }
  }

  if (updates.moreCommercial) {
    const commercialLine =
      "Use um tom mais comercial, mas natural, focado em conversÃƒÂ£o e em conduzir a venda sem parecer robÃƒÂ´.";
    if (!nextPrompt.includes(commercialLine)) {
      nextPrompt = `${nextPrompt.trim()}\n${commercialLine}`;
      changed = true;
    }
  }

  return { prompt: nextPrompt, agentName, company, changed };
}

function buildAutoLoginUrl(baseUrl: string, email: string, password: string, targetPath: string = "/plans"): string {
  const credentials = `${email}:${password}`;
  const encoded = Buffer.from(credentials, "utf-8").toString("base64");
  return `${baseUrl}${targetPath}?al=${encoded}`;
}

/**
 * V22: Post-processing - injeta auto-login em TODAS as URLs do AgenteZap
 * Usa o autologinService para gerar tokens DB-backed (sobrevive PM2 restart)
 * Quando a LLM gera respostas com URLs como /plans, /conexao, /login, /meu-agente-ia,
 * este post-processor substitui por links com auto-login real via token no banco.
 */
async function injectAutoLoginUrls(text: string, session: ClientSession): Promise<string> {
  // Primeiro: precisamos saber o userId para gerar o autologin token
  let userId: string | undefined;
  
  // Tentar obter userId da sessÃ£o ou do banco
  if (session.phoneNumber) {
    try {
      const user = await findUserByPhone(session.phoneNumber);
      userId = user?.id;
    } catch (e) {}
  }
  
  if (!userId) {
    console.log(`ðŸ” [V22] injectAutoLoginUrls: sem userId para ${session.phoneNumber || 'NULL'}, pulando`);
    return text;
  }
  
  const baseUrl = canonicalizeAgenteZapPublicBaseUrl(process.env.APP_URL);
  
  // Paths que devem ter auto-login
  const autoLoginPaths = ["/plans", "/conexao", "/conexÃ£o", "/login", "/meu-agente-ia"];
  
  // Importar o serviÃ§o de autologin
  const { generateAutologinLink } = await import("./autologinService");
  
  // Cache de links gerados nesta chamada (para nÃ£o gerar mÃºltiplos tokens para mesmo path)
  const linkCache = new Map<string, string>();
  
  // PASSO 1: Substituir URLs BARE (sem ?al= ou ?token=) com auto-login
  for (const path of autoLoginPaths) {
    const escapedBase = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    
    // Match URL completa sem ?token= ou ?al= jÃ¡ presente
    const pattern = new RegExp(
      `(${escapedBase}${escapedPath})(?!\\?(al|token)=)(?=[)\\s\\n\\r,;!?*\\]"'\`>}]|$)`,
      "gi"
    );
    
    if (pattern.test(text)) {
      const normalizedPath = path.replace(/Ã£/g, 'a');
      if (!linkCache.has(normalizedPath)) {
        try {
          const autologinUrl = await generateAutologinLink(userId, normalizedPath);
          linkCache.set(normalizedPath, autologinUrl);
          console.log(`ðŸ”‘ [V22] Auto-login gerado: ${normalizedPath} -> ${autologinUrl.substring(0, 60)}...`);
        } catch (e) {
          console.error(`âŒ [V22] Erro ao gerar autologin para ${path}:`, e);
          continue;
        }
      }
      
      const autologinUrl = linkCache.get(normalizedPath);
      if (autologinUrl) {
        pattern.lastIndex = 0;
        text = text.replace(pattern, autologinUrl);
      }
    }
  }
  
  // PASSO 2: Substituir URLs com ?al=Base64 antigo pelo novo formato com token
  for (const path of autoLoginPaths) {
    const escapedBase = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    
    // Match URL com ?al=<base64> (formato antigo)
    const oldFormatPattern = new RegExp(
      `${escapedBase}${escapedPath}\\?al=[A-Za-z0-9+/=]+`,
      "gi"
    );
    
    if (oldFormatPattern.test(text)) {
      const normalizedPath = path.replace(/Ã£/g, 'a');
      if (!linkCache.has(normalizedPath)) {
        try {
          const autologinUrl = await generateAutologinLink(userId, normalizedPath);
          linkCache.set(normalizedPath, autologinUrl);
          console.log(`ðŸ”‘ [V22c] Auto-login substituindo ?al= antigo: ${normalizedPath} -> ${autologinUrl.substring(0, 60)}...`);
        } catch (e) {
          console.error(`âŒ [V22c] Erro ao gerar autologin para ${path}:`, e);
          continue;
        }
      }
      
      const autologinUrl = linkCache.get(normalizedPath);
      if (autologinUrl) {
        oldFormatPattern.lastIndex = 0;
        text = text.replace(oldFormatPattern, autologinUrl);
      }
    }
  }
  
  if (linkCache.size > 0) {
    console.log(`ðŸ”‘ [V22] Auto-login injetado: ${linkCache.size} link(s) substituÃ­dos`);
  }
  
  return text;
}

async function buildPixPaymentInstructions(session?: ClientSession): Promise<string> {
  void session;
  return "";
}
function getLastAssistantMessage(session: ClientSession): string {
  for (let index = session.conversationHistory.length - 1; index >= 0; index -= 1) {
    const item = session.conversationHistory[index];
    if (item.role === "assistant" && item.content) {
      return item.content;
    }
  }
  return "";
}

function getLastDeliveredTestToken(session?: ClientSession): string | undefined {
  if (!session?.conversationHistory?.length) return undefined;

  for (let index = session.conversationHistory.length - 1; index >= 0; index -= 1) {
    const item = session.conversationHistory[index];
    if (item.role !== "assistant" || !item.content) continue;

    const matches = Array.from(String(item.content).matchAll(/\/test\/([a-f0-9]{8,})/gi));
    if (matches.length > 0) {
      const token = matches[matches.length - 1]?.[1];
      if (token) return token;
    }
  }

  return undefined;
}

async function findUserLinkedToDeliveredTestToken(session?: ClientSession): Promise<any | undefined> {
  const token = getLastDeliveredTestToken(session);
  if (!token) return undefined;

  try {
    const tokenInfo = await getTestToken(token);
    if (!tokenInfo?.userId) return undefined;
    return await storage.getUser(tokenInfo.userId);
  } catch {
    return undefined;
  }
}

function assistantAskedForBusinessName(session: ClientSession): boolean {
  const normalized = normalizeTextToken(getLastAssistantMessage(session));
  if (!normalized) return false;

  const hints = [
    "nome do seu negocio",
    "nome do negocio",
    "nome da empresa",
    "nome da sua",
    "nome do seu",
    "qual e o nome",
    "qual o nome",
    "como chama seu",
    "como chama sua",
    "como se chama",
    "me fala o nome",
    "me passa o nome",
    "me diz o nome",
    "me dizer o nome",
    "me diga o nome",
    "me conta o nome",
    "me fale o nome",
  ];

  return hints.some((hint) => normalized.includes(hint));
}

function inferRoleFromBusinessName(companyName?: string): string {
  const normalized = normalizeTextToken(companyName);
  if (!normalized) return "atendente virtual";
  if (normalized.includes("barbearia")) return "atendente da barbearia";
  if (normalized.includes("estetica") || normalized.includes("beleza") || normalized.includes("lash") || normalized.includes("sobrancelha")) return "atendente da estÃ©tica";
  if (normalized.includes("salao") || normalized.includes("salon")) return "atendente do salÃ£o";
  if (normalized.includes("clinica") || normalized.includes("consultorio")) return "atendente da clÃ­nica";
  if (normalized.includes("delivery") || normalized.includes("lanchonete") || normalized.includes("restaurante")) {
    return "atendente do delivery";
  }
  if (normalized.includes("pet") || normalized.includes("veterinar")) return "atendente do pet shop";
  if (normalized.includes("academia") || normalized.includes("fitness")) return "atendente da academia";
  return "atendente virtual";
}

function shouldDiscussMassBroadcast(userMessage: string): boolean {
  const normalized = normalizeTextToken(userMessage);
  if (!normalized) return false;
  return MASS_BROADCAST_HINTS.some((hint) => normalized.includes(hint));
}

function stripUnsolicitedMassBroadcast(text: string, userMessage: string): string {
  if (shouldDiscussMassBroadcast(userMessage)) {
    return text;
  }

  const bannedPattern = /(envio em massa|disparo(?:s)?|campanha(?:s)?(?: em massa)?|lista vip)/i;
  const filteredLines = String(text || "")
    .split("\n")
    .filter((line) => !bannedPattern.test(line));

  return filteredLines.join("\n");
}

function normalizePendingCreatePromises(text: string): string {
  let normalized = String(text || "");

  normalized = normalized.replace(
    /\b(vou|eu vou|ja vou)\s+(criar|montar)\b[^.!?\n]*/gi,
    "Se vocÃª quiser, eu crio por aqui assim que vocÃª me confirmar o nome do negÃ³cio",
  );
  normalized = normalized.replace(
    /\b(ja estou|estou)\s+(criando|montando)\b[^.!?\n]*/gi,
    "Assim que vocÃª me confirmar o nome do negÃ³cio, eu sigo com a criaÃ§Ã£o",
  );
  normalized = normalized.replace(
    /\b(te mando|vou te mandar)\s+o link\s+(agora|ja)\b/gi,
    "Assim que eu concluir a criaÃ§Ã£o, eu te mando o link aqui mesmo",
  );

  return normalized;
}

function normalizeUndeliveredDeliveryClaims(text: string): string {
  const source = String(text || "").trim();
  if (!source) return source;

  const normalizedSource = normalizeTextToken(source);
  const realTestLinkPattern = /https?:\/\/[^\s]*\/test\/[a-z0-9]{8,}/i;
  const fakeDeliveryPattern =
    /\b(seu agente ja esta no ar|seu agente ja esta pronto|ja esta pronto para voce testar|ja criei|ja ficou pronto|clique aqui pra ver ele funcionando|o que voce vai ver|teste pronto|prontinho|aqui estao os links|links para voce conhecer|simulador publico|painel de controle)\b/i;
  const placeholderCredentialsPattern = /\b(usuario:\s*seu email|email:\s*seu email|seu email|senha(?:\s+temporaria)?:\s*123456)\b/i;
  const emptyDeliverySlotPattern = /\b(simulador|teste publico|painel|login)\b[^\n]*:\s*(?:\n|$)/i;

  const seemsFakeReady =
    fakeDeliveryPattern.test(normalizedSource) ||
    placeholderCredentialsPattern.test(normalizedSource) ||
    emptyDeliverySlotPattern.test(source);

  if (realTestLinkPattern.test(source) || !seemsFakeReady) {
    return source;
  }

  return "Eu ainda nÃ£o finalizei a criaÃ§Ã£o de verdade. Assim que eu concluir e gerar o link real do seu agente, eu te mando aqui mesmo.";
}

function isClaimingReadyWithoutRealDelivery(text: string): boolean {
  const source = String(text || "").trim();
  if (!source) return false;

  const normalizedSource = normalizeTextToken(source);
  const realTestLinkPattern = /https?:\/\/[^\s]*\/test\/[a-z0-9]{8,}/i;
  const realEmailPattern = /\b\d{10,15}@agentezap\.(?:online|com)\b/i;
  const readyClaimPattern =
    /\b(seu agente ja esta pronto|teste pronto|ja criei|prontinho|simulador publico|painel de controle|aqui estao os links|links para voce conhecer)\b/i;
  const placeholderPattern = /\b(seu email|senha(?:\s+temporaria)?:\s*123456)\b/i;
  const emptyDeliverySlotPattern = /\b(simulador|teste publico|painel|login)\b[^\n]*:\s*(?:\n|$)/i;

  if (realTestLinkPattern.test(source) && realEmailPattern.test(source)) {
    return false;
  }

  if (!readyClaimPattern.test(normalizedSource)) {
    return false;
  }

  return (
    placeholderPattern.test(normalizedSource) ||
    emptyDeliverySlotPattern.test(source) ||
    !realTestLinkPattern.test(source)
  );
}

function sessionHasDeliveredTestLink(session?: ClientSession): boolean {
  if (!session?.conversationHistory?.length) return false;

  const deliveredToken = getLastDeliveredTestToken(session);
  const tokenPattern = deliveredToken
    ? new RegExp(`/test/${deliveredToken}\\b`, "i")
    : /https?:\/\/[^\s]*\/test\/[a-z0-9]{8,}/i;

  const hasRealTestLink = session.conversationHistory.some(
    (item) => item.role === "assistant" && tokenPattern.test(String(item.content || "")),
  );

  // Basta verificar se o link de teste foi entregue. Nao requer "access hints".
  return hasRealTestLink;
}

function enforceAdminResponseConsistency(
  session: ClientSession,
  text: string,
  userMessage: string,
  hasDeliveredCredentials: boolean,
): string {
  let adjusted = stripUnsolicitedMassBroadcast(text, userMessage);

  if (!hasDeliveredCredentials && !sessionHasDeliveredTestLink(session)) {
    adjusted = normalizePendingCreatePromises(adjusted);
    adjusted = normalizeUndeliveredDeliveryClaims(adjusted);
  }

  return adjusted;
}

function buildSimulatorLink(loginUrl?: string, simulatorToken?: string): string {
  const baseUrl = canonicalizeAgenteZapPublicBaseUrl(loginUrl || process.env.APP_URL);
  if (!simulatorToken) {
    return "";
  }
  return `${baseUrl}/test/${simulatorToken}`;
}

function normalizePhoneForAccount(phoneNumber: string): string {
  return String(phoneNumber || "").replace(/\D/g, "");
}

const AGENTEZAP_PUBLIC_BASE_DOMAIN = "agentezap.online";
const AGENTEZAP_PUBLIC_CANONICAL_SUBDOMAIN = "www";

function canonicalizeAgenteZapPublicBaseUrl(value?: string): string {
  const fallbackBaseUrl = `https://${AGENTEZAP_PUBLIC_CANONICAL_SUBDOMAIN}.${AGENTEZAP_PUBLIC_BASE_DOMAIN}`;
  const raw = String(value || process.env.PUBLIC_BASE_URL || fallbackBaseUrl).trim() || fallbackBaseUrl;
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (parsed.hostname.toLowerCase() === AGENTEZAP_PUBLIC_BASE_DOMAIN) {
      parsed.hostname = `${AGENTEZAP_PUBLIC_CANONICAL_SUBDOMAIN}.${AGENTEZAP_PUBLIC_BASE_DOMAIN}`;
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return raw.replace(/^http:\/\//i, "https://").replace(/\/+$/, "");
  }
}

function extractTestTokenFromDeliveryText(text: string): string | undefined {
  const match = String(text || "").match(/\/test\/([a-z0-9]{8,})/i);
  return match?.[1];
}

async function isAiDeliveryTextConsistentForSession(
  session: ClientSession,
  text: string,
): Promise<boolean> {
  const source = String(text || "");
  const token = extractTestTokenFromDeliveryText(source);
  if (!token) return false;

  const hasLoginLink = /https?:\/\/[^\s]*\/login\b/i.test(source) || source.includes("/login");
  if (!hasLoginLink) return false;

  const expectedEmail = generateTempEmail(session.phoneNumber).toLowerCase();
  if (!source.toLowerCase().includes(expectedEmail)) return false;

  const tokenInfo = await getTestToken(token);
  if (!tokenInfo?.userId) return false;

  if (session.userId && String(tokenInfo.userId) !== String(session.userId)) {
    return false;
  }

  return true;
}

function detectDemoRequest(messageText: string): { wantsScreenshot: boolean; wantsVideo: boolean } {
  void messageText;
  return { wantsScreenshot: false, wantsVideo: false };
}

function buildGeneratedMediaAction(
  mediaType: "image" | "video",
  storageUrl: string,
  caption: string,
): {
  type: "send_media";
  media_name: string;
  mediaData: AdminMedia;
} {
  const nowIso = new Date().toISOString();
  const suffix = mediaType === "image" ? "PRINT" : "VIDEO";

  return {
    type: "send_media",
    media_name: `DEMO_${suffix}`,
    mediaData: {
      id: `generated-demo-${suffix.toLowerCase()}-${Date.now()}`,
      adminId: "system",
      name: `DEMO_${suffix}`,
      mediaType,
      storageUrl,
      fileName: mediaType === "image" ? `demo-${Date.now()}.png` : `demo-${Date.now()}.webm`,
      mimeType: mediaType === "image" ? "image/png" : "video/webm",
      description: caption,
      caption,
      isActive: true,
      sendAlone: false,
      displayOrder: 0,
      createdAt: nowIso,
    },
  };
}

async function ensureTestCredentialsForFlow(
  session: ClientSession,
  current?: TestAccountCredentials,
): Promise<TestAccountCredentials | null> {
  if (hasCompleteTestCredentials(current)) {
    return current;
  }

  // Creation is no longer allowed from the legacy demo/media helper. Agent
  // materialization must come from the Codex JSON contract executor.
  return null;
}

async function maybeGenerateDemoAssets(
  session: ClientSession,
  opts: {
    wantsScreenshot: boolean;
    wantsVideo: boolean;
    credentials?: TestAccountCredentials;
  },
): Promise<{ demoAssets?: GeneratedDemoAssets; credentials?: TestAccountCredentials }> {
  void session;
  void opts;
  return {};
}

/**
 * Gera token de teste para o simulador de WhatsApp
 * AGORA PERSISTE NO SUPABASE para funcionar no Railway apÃƒÆ’Ã‚Â³s reinÃƒÆ’Ã‚Â­cio
 */
export async function generateTestToken(userId: string, agentName: string, company: string): Promise<TestToken> {
  const token = uuidv4().replace(/-/g, '').substring(0, 16);
  
  const testToken: TestToken = {
    token,
    userId,
    agentName,
    company,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
  };
  
  await ensureAdminTestTokensTable();

  await withRetry(async () => {
    await pool.query(
      `
        INSERT INTO ${ADMIN_TEST_TOKENS_TABLE} (
          token,
          user_id,
          agent_name,
          company,
          created_at,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        testToken.token,
        testToken.userId,
        testToken.agentName,
        testToken.company,
        testToken.createdAt.toISOString(),
        testToken.expiresAt.toISOString(),
      ],
    );
  });

  console.log(`Ã°Å¸Å½Â« [SALES] Token de teste gerado e salvo no DB local: ${token} para userId: ${userId}`);
  
  return testToken;
}

/**
 * Busca informaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes do token de teste no Supabase
 */
export async function getTestToken(token: string): Promise<TestToken | undefined> {
  try {
    await ensureAdminTestTokensTable();

    const result = await withRetry(() =>
      pool.query(
        `
          SELECT token, user_id, agent_name, company, created_at, expires_at
          FROM ${ADMIN_TEST_TOKENS_TABLE}
          WHERE token = $1
            AND expires_at > NOW()
          LIMIT 1
        `,
        [token],
      ),
    );

    const data = result.rows[0];

    if (!data) {
      console.log(`Ã¢ÂÅ’ [SALES] Token nÃƒÂ£o encontrado ou expirado: ${token}`);
      return undefined;
    }
    
    return {
      token: data.token,
      userId: data.user_id,
      agentName: data.agent_name,
      company: data.company,
      createdAt: new Date(data.created_at),
      expiresAt: new Date(data.expires_at),
    };
  } catch (err) {
    console.error(`Ã¢ÂÅ’ [SALES] Erro ao buscar token:`, err);
    return undefined;
  }
}

/**
 * Atualiza o nome/empresa em TODOS os tokens ativos do usuÃƒÆ’Ã‚Â¡rio
 * Isso garante que o Simulador reflita as mudanÃƒÆ’Ã‚Â§as imediatamente
 */
export async function updateUserTestTokens(userId: string, updates: { agentName?: string; company?: string }) {
  try {
    await ensureAdminTestTokensTable();

    const updateFields: string[] = [];
    const params: unknown[] = [];

    if (updates.agentName) {
      params.push(updates.agentName);
      updateFields.push(`agent_name = $${params.length}`);
    }

    if (updates.company) {
      params.push(updates.company);
      updateFields.push(`company = $${params.length}`);
    }

    if (updateFields.length === 0) return;

    params.push(userId);

    await withRetry(() =>
      pool.query(
        `
          UPDATE ${ADMIN_TEST_TOKENS_TABLE}
          SET ${updateFields.join(", ")}
          WHERE user_id = $${params.length}
            AND expires_at > NOW()
        `,
        params,
      ),
    );

    console.log(`Ã¢Å“â€¦ [SALES] Tokens atualizados para usuÃƒÂ¡rio ${userId}:`, updates);
  } catch (err) {
    console.error(`Ã¢ÂÅ’ [SALES] Erro ao atualizar tokens:`, err);
  }
}

// ============================================================================
// FUNÃƒÆ’Ã¢â‚¬Â¡ÃƒÆ’Ã¢â‚¬Â¢ES DE GERENCIAMENTO DE SESSÃƒÆ’Ã†â€™O
// ============================================================================

export function getClientSession(phoneNumber: string): ClientSession | undefined {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  return clientSessions.get(cleanPhone);
}

export function createClientSession(phoneNumber: string): ClientSession {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  
  const session: ClientSession = {
    id: uuidv4(),
    phoneNumber: cleanPhone,
    flowState: 'onboarding',
    lastInteraction: new Date(),
    conversationHistory: [],
  };
  
  clientSessions.set(cleanPhone, session);
  console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â± [SALES] Nova sessÃƒÆ’Ã‚Â£o criada para ${cleanPhone}`);
  return session;
}

export function updateClientSession(phoneNumber: string, updates: Partial<ClientSession>): ClientSession {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  let session = clientSessions.get(cleanPhone);
  
  if (!session) {
    session = createClientSession(cleanPhone);
  }
  
  Object.assign(session, updates, { lastInteraction: new Date() });
  clientSessions.set(cleanPhone, session);

  // Auto-persist setupProfile + flowState + pendingAction to DB so it survives server restarts
  if (updates.setupProfile || updates.flowState || updates.pendingAction !== undefined) {
    persistConversationState(cleanPhone, {
      setupProfile: session.setupProfile || null,
      flowState: session.flowState,
      pendingAction: session.pendingAction || null,
    }).catch(() => {});
  }

  return session;
}

// Set de telefones que tiveram histÃƒÆ’Ã‚Â³rico limpo recentemente (para nÃƒÆ’Ã‚Â£o restaurar do banco)
const clearedPhones = new Set<string>();

// Set de telefones que devem ser forÃƒÆ’Ã‚Â§ados para onboarding (tratar como cliente novo)
// Isso ÃƒÆ’Ã‚Â© usado quando admin limpa histÃƒÆ’Ã‚Â³rico e quer recomeÃƒÆ’Ã‚Â§ar do zero
const forceOnboardingPhones = new Set<string>();

/**
 * Verifica se telefone deve ser forÃƒÆ’Ã‚Â§ado para onboarding
 */
export function shouldForceOnboarding(phoneNumber: string): boolean {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  return forceOnboardingPhones.has(cleanPhone);
}

/**
 * Remove telefone do forceOnboarding (quando cliente jÃƒÆ’Ã‚Â¡ criou conta)
 */
export function stopForceOnboarding(phoneNumber: string): void {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  if (forceOnboardingPhones.has(cleanPhone)) {
    forceOnboardingPhones.delete(cleanPhone);
    console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬Å“ [SALES] Telefone ${cleanPhone} removido do forceOnboarding (conta criada)`);
  }
}

/**
 * Verifica se telefone teve histÃƒÆ’Ã‚Â³rico limpo recentemente
 */
export function wasChatCleared(phoneNumber: string): boolean {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  return clearedPhones.has(cleanPhone);
}

/**
 * Limpa sessÃƒÆ’Ã‚Â£o do cliente (para testes)
 * Quando admin limpa histÃƒÆ’Ã‚Â³rico, o cliente ÃƒÆ’Ã‚Â© tratado como NOVO
 * mesmo que jÃƒÆ’Ã‚Â¡ tenha conta no sistema
 */
export function clearClientSession(phoneNumber: string): boolean {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  console.log(`ÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â¹ [SESSION] Solicitada limpeza para: ${phoneNumber} -> ${cleanPhone}`);
  
  const existed = clientSessions.has(cleanPhone);
  clientSessions.delete(cleanPhone);
  cancelFollowUp(cleanPhone);
  
  // Marcar que este telefone teve histÃƒÆ’Ã‚Â³rico limpo (impede restauraÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o do banco)
  clearedPhones.add(cleanPhone);
  
  // IMPORTANTE: ForÃƒÆ’Ã‚Â§ar onboarding - mesmo que cliente tenha conta, tratar como novo
  forceOnboardingPhones.add(cleanPhone);
  
  // Limpar automaticamente apÃƒÆ’Ã‚Â³s 30 minutos (tempo suficiente para testar)
  setTimeout(() => {
    clearedPhones.delete(cleanPhone);
    forceOnboardingPhones.delete(cleanPhone);
    console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬Å“ [SALES] Telefone ${cleanPhone} removido do forceOnboarding (timeout)`);
  }, 30 * 60 * 1000);
  
  if (existed) {
    console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬â€Ã¢â‚¬ËœÃƒÂ¯Ã‚Â¸Ã‚Â [SALES] SessÃƒÆ’Ã‚Â£o do cliente ${cleanPhone} removida da memÃƒÆ’Ã‚Â³ria`);
  } else {
    console.log(`ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â [SALES] SessÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o encontrada em memÃƒÆ’Ã‚Â³ria para ${cleanPhone} (mas marcado como limpo)`);
  }
  console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬â„¢ [SALES] Telefone ${cleanPhone} marcado como limpo + forceOnboarding (serÃƒÆ’Ã‚Â¡ tratado como cliente novo)`);
  return existed;
}

export async function resetAdminAgentLeadState(input: {
  userId?: string;
  phoneNumber?: string;
  reason?: string;
}): Promise<{
  success: true;
  phones: string[];
  sessionCleared: number;
  conversationsReset: number;
  tokensExpired: number;
}> {
  const phoneSet = new Set<string>();
  const addPhone = (value: unknown) => {
    const clean = String(value || "").replace(/\D/g, "");
    if (clean.length >= 8) {
      phoneSet.add(clean);
    }
  };

  addPhone(input.phoneNumber);

  if (input.userId) {
    const userResult = await pool.query(
      "SELECT id, email, phone, whatsapp_number FROM users WHERE id = $1 LIMIT 1",
      [input.userId],
    );
    const user = userResult.rows[0];
    if (user) {
      addPhone(user.phone);
      addPhone(user.whatsapp_number);
      const email = String(user.email || "").trim().toLowerCase();
      if (email.endsWith("@agentezap.online")) {
        addPhone(email.split("@")[0]);
      }
    }

    const connectionResult = await pool.query(
      "SELECT phone_number FROM whatsapp_connections WHERE user_id = $1",
      [input.userId],
    );
    for (const row of connectionResult.rows) {
      addPhone(row.phone_number);
    }

    const conversationResult = await pool.query(
      "SELECT contact_number FROM admin_conversations WHERE linked_user_id = $1",
      [input.userId],
    );
    for (const row of conversationResult.rows) {
      addPhone(row.contact_number);
    }
  }

  const phones = Array.from(phoneSet);
  let sessionCleared = 0;
  for (const phone of phones) {
    if (clearClientSession(phone)) {
      sessionCleared += 1;
    }
  }

  let conversationsReset = 0;
  if (phones.length > 0 || input.userId) {
    const resetResult = await pool.query(
      `
        UPDATE admin_conversations
        SET context_state = '{}'::jsonb,
            memory_summary = NULL,
            linked_user_id = NULL,
            last_test_token = NULL,
            last_successful_action = NULL,
            pending_slot = NULL,
            followup_stage = 0,
            next_followup_at = NULL,
            updated_at = NOW()
        WHERE ($1::text IS NOT NULL AND linked_user_id = $1)
           OR ($2::text[] IS NOT NULL AND regexp_replace(contact_number, '\\D', '', 'g') = ANY($2::text[]))
      `,
      [input.userId || null, phones.length > 0 ? phones : null],
    );
    conversationsReset = resetResult.rowCount || 0;
  }

  let tokensExpired = 0;
  if (input.userId) {
    await ensureAdminTestTokensTable();
    const tokenResult = await pool.query(
      `
        UPDATE admin_test_tokens
        SET expires_at = LEAST(expires_at, NOW())
        WHERE user_id = $1
      `,
      [input.userId],
    );
    tokensExpired += tokenResult.rowCount || 0;
  }

  return {
    success: true,
    phones,
    sessionCleared,
    conversationsReset,
    tokensExpired,
  };
}

/**
 * Gera email fictÃƒÆ’Ã‚Â­cio para conta temporÃƒÆ’Ã‚Â¡ria
 */
function generateTempEmail(phoneNumber: string): string {
  const cleanPhone = normalizePhoneForAccount(phoneNumber);
  return `${cleanPhone}@agentezap.online`;
}

function normalizeCustomerEmailForAccount(value: unknown): string {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > 254) return "";
  if (email.endsWith("@agentezap.online")) return "";
  if (["eu@email.com", "seu@email.com", "email@email.com", "teste@teste.com"].includes(email)) return "";
  if (/@(?:example|exemplo)\./i.test(email)) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

async function ensureCanonicalEmailForUser(
  userId: string,
  currentEmail: string | undefined,
  canonicalEmail: string,
): Promise<string> {
  const currentNormalized = String(currentEmail || "").trim().toLowerCase();
  const canonicalNormalized = canonicalEmail.toLowerCase();

  if (currentNormalized === canonicalNormalized) {
    return canonicalEmail;
  }

  try {
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(userId, {
      email: canonicalEmail,
      email_confirm: true,
    });

    if (authUpdateError) {
      throw authUpdateError;
    }

    await storage.updateUser(userId, { email: canonicalEmail });
    console.log(`[SALES] Email canonical aplicado para ${userId}: ${canonicalEmail}`);
    return canonicalEmail;
  } catch (error) {
    console.warn(`[SALES] Nao foi possivel canonicalizar email para ${userId}. Mantendo email atual.`,
      error,
    );
    return currentEmail || canonicalEmail;
  }
}

async function resolveSessionContactName(session: ClientSession): Promise<string> {
  const fromSession = normalizeContactName(session.contactName);
  if (fromSession) return fromSession;

  try {
    const conversation = await storage.getAdminConversationByPhone(normalizePhoneForAccount(session.phoneNumber));
    const fromConversation = normalizeContactName(conversation?.contactName);
    if (fromConversation) {
      updateClientSession(session.phoneNumber, { contactName: fromConversation });
      return fromConversation;
    }
  } catch (error) {
    console.log("ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â [SALES] NÃƒÆ’Ã‚Â£o foi possÃƒÆ’Ã‚Â­vel obter nome do contato no histÃƒÆ’Ã‚Â³rico:", error);
  }

  return generateFallbackClientName(session.phoneNumber);
}

/**
 * Gera senha temporÃƒÆ’Ã‚Â¡ria aleatÃƒÆ’Ã‚Â³ria
 */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = 'AZ-';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// PROMPT TEMPLATE V2 Ã¢â‚¬â€ Inspirado em Dify (seÃƒÂ§ÃƒÂµes XML), melhores prÃƒÂ¡ticas
// de agentes LLM e adaptaÃƒÂ§ÃƒÂ£o por nicho (delivery/salon/scheduling/generic)
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

function getNicheExamples(workflowKind: string, agentName: string, companyName: string): string {
  switch (workflowKind) {
    case "delivery":
      return `
<exemplos_conversa>
EXEMPLO 1 Ã¢â‚¬â€ Cliente quer pedir:
Cliente: "oi, quero fazer um pedido"
${agentName}: "E aÃƒÂ­! Beleza? Aqui ÃƒÂ© o ${agentName} da ${companyName} Ã°Å¸ËœÅ  Me fala o que vc tÃƒÂ¡ querendo que eu jÃƒÂ¡ monto pra vc"
Cliente: "2 pizzas grandes"
${agentName}: "Show! 2 pizzas grandes Ã°Å¸Ââ€¢ Quais sabores vc quer? Temos os clÃƒÂ¡ssicos e uns especiais que saem bastante"
Cliente: "calabresa e 4 queijos"
${agentName}: "Boa escolha! EntÃƒÂ£o fica 2 pizzas grandes: calabresa e 4 queijos. Me passa o endereÃƒÂ§o de entrega e a forma de pagamento que eu jÃƒÂ¡ finalizo"

EXEMPLO 2 Ã¢â‚¬â€ Cliente pergunta cardÃƒÂ¡pio:
Cliente: "tem o que aÃƒÂ­?"
${agentName}: "Tem sim! Deixa eu te passar as opÃƒÂ§ÃƒÂµes. Quer ver por categoria? Temos pizzas, lanches e bebidas. Qual te interessa mais?"
</exemplos_conversa>`;

    case "salon":
      return `
<exemplos_conversa>
EXEMPLO 1 Ã¢â‚¬â€ Cliente quer agendar:
Cliente: "quero marcar um horÃƒÂ¡rio"
${agentName}: "Oi! Tudo bem? Aqui ÃƒÂ© o ${agentName} da ${companyName} Ã¢Å“â€šÃ¯Â¸Â Qual serviÃƒÂ§o vc tÃƒÂ¡ precisando? Corte, barba, coloraÃƒÂ§ÃƒÂ£o..."
Cliente: "corte masculino"
${agentName}: "Beleza! Corte masculino. Tem preferÃƒÂªncia de profissional ou posso ver o primeiro horÃƒÂ¡rio disponÃƒÂ­vel pra vc?"
Cliente: "pode ser qualquer um, quero pra amanhÃƒÂ£"
${agentName}: "Deixa eu ver aqui... amanhÃƒÂ£ temos horÃƒÂ¡rio ÃƒÂ s 10h e ÃƒÂ s 14h30. Qual fica melhor pra vc?"

EXEMPLO 2 Ã¢â‚¬â€ Cliente pergunta preÃƒÂ§o:
Cliente: "quanto tÃƒÂ¡ o corte?"
${agentName}: "Corte masculino tÃƒÂ¡ R$ 45. Se quiser fazer barba junto sai R$ 65 o combo, vale bastante a pena Ã°Å¸Ëœâ€° Quer agendar?"
</exemplos_conversa>`;

    case "scheduling":
      return `
<exemplos_conversa>
EXEMPLO 1 Ã¢â‚¬â€ Cliente quer agendar:
Cliente: "preciso marcar uma consulta"
${agentName}: "Oi! Aqui ÃƒÂ© o ${agentName} da ${companyName} Ã°Å¸ËœÅ  Vou te ajudar a agendar. Qual tipo de atendimento vc precisa?"
Cliente: "avaliaÃƒÂ§ÃƒÂ£o"
${agentName}: "Certinho! AvaliaÃƒÂ§ÃƒÂ£o. Vc tem preferÃƒÂªncia de dia e horÃƒÂ¡rio? Vou verificar a disponibilidade pra vc"
Cliente: "quarta de manhÃƒÂ£"
${agentName}: "Quarta de manhÃƒÂ£ temos ÃƒÂ s 9h e ÃƒÂ s 10h30. Qual fica melhor pra vc?"

EXEMPLO 2 Ã¢â‚¬â€ Cliente quer reagendar:
Cliente: "preciso mudar meu horÃƒÂ¡rio"
${agentName}: "Sem problema! Me passa seu nome completo que eu localizo seu agendamento e a gente remarca rapidinho"
</exemplos_conversa>`;

    default: // generic
      return `
<exemplos_conversa>
EXEMPLO 1 Ã¢â‚¬â€ Cliente interessado:
Cliente: "oi, quero saber mais"
${agentName}: "E aÃƒÂ­! Tudo bem? Aqui ÃƒÂ© o ${agentName} da ${companyName} Ã°Å¸ËœÅ  Me conta o que vc tÃƒÂ¡ procurando que eu te explico tudo"
Cliente: "vi o anÃƒÂºncio de vocÃƒÂªs"
${agentName}: "Que bom que viu! Vc se interessou por qual produto/serviÃƒÂ§o? Assim eu jÃƒÂ¡ te passo as condiÃƒÂ§ÃƒÂµes certinhas"

EXEMPLO 2 Ã¢â‚¬â€ Cliente com objeÃƒÂ§ÃƒÂ£o de preÃƒÂ§o:
Cliente: "achei caro"
${agentName}: "Entendo! Mas olha, o diferencial nosso ÃƒÂ© [valor especÃƒÂ­fico]. E consigo ver uma condiÃƒÂ§ÃƒÂ£o especial pra vc fechar agora, quer que eu verifique?"
</exemplos_conversa>`;
  }
}

function getNicheRules(workflowKind: string): string {
  switch (workflowKind) {
    case "delivery":
      return `
<regras_nicho>
- SEMPRE confirme os itens do pedido ANTES de finalizar
- Pergunte endereÃƒÂ§o de entrega e forma de pagamento
- Se o cardÃƒÂ¡pio estiver configurado, use os preÃƒÂ§os reais. NUNCA invente preÃƒÂ§o
- Informe tempo estimado de entrega se souber
- Se nÃƒÂ£o souber um item, diga que vai verificar Ã¢â‚¬â€ nÃƒÂ£o invente
- Sugira complementos (bebida, sobremesa) de forma natural, SEM forÃƒÂ§ar
</regras_nicho>`;

    case "salon":
      return `
<regras_nicho>
- SEMPRE verifique disponibilidade REAL antes de confirmar horÃƒÂ¡rio
- Pergunte qual profissional o cliente prefere
- Confirme serviÃƒÂ§o + dia + horÃƒÂ¡rio antes de fechar
- Use o mÃƒÂ³dulo de salÃƒÂ£o para validar horÃƒÂ¡rios reais
- Se o cliente marcar fora do horÃƒÂ¡rio, informe os disponÃƒÂ­veis
- Sugira serviÃƒÂ§os complementares de forma natural (ex: "quer fazer barba junto?")
</regras_nicho>`;

    case "scheduling":
      return `
<regras_nicho>
- SEMPRE consulte a agenda real antes de confirmar
- Confirme tipo de atendimento + dia + horÃƒÂ¡rio com o cliente
- Use o mÃƒÂ³dulo de agendamentos para validar disponibilidade
- Nunca confirme horÃƒÂ¡rio que nÃƒÂ£o existe na agenda
- Se nÃƒÂ£o tiver vaga, ofereÃƒÂ§a alternativas prÃƒÂ³ximas
- PeÃƒÂ§a nome completo e contato para o registro
</regras_nicho>`;

    default:
      return `
<regras_nicho>
- Foque em entender o que o cliente precisa e conduza para a soluÃƒÂ§ÃƒÂ£o
- Se o cliente perguntar preÃƒÂ§o, gere valor ANTES e depois informe
- Adapte o discurso: cliente apressado = direto, cliente curioso = explique mais
- Sugira produtos/serviÃƒÂ§os complementares quando fizer sentido
- Se nÃƒÂ£o souber uma informaÃƒÂ§ÃƒÂ£o, diga que vai verificar
- Conduza sempre para o prÃƒÂ³ximo passo (compra, agendamento, contato)
</regras_nicho>`;
  }
}

const RODRIGO_PROMPT_TEMPLATE = `<identidade>
VocÃƒÂª ÃƒÂ© *{NOME_AGENTE}*, {FUNCAO_AGENTE} da *{NOME_EMPRESA}*.
Canal: WhatsApp.
VocÃƒÂª fala como humano Ã¢â‚¬â€ experiente, carismÃƒÂ¡tico, confiante e direto.
VocÃƒÂª NÃƒÆ’O ÃƒÂ© um chatbot. VocÃƒÂª ÃƒÂ© {NOME_AGENTE}, uma pessoa real que atende clientes.
</identidade>

<objetivo>
Atender o cliente, tirar dÃƒÂºvidas sobre {PRODUTOS_SERVICOS} e conduzir para {OBJETIVO_FINAL}.
VocÃƒÂª NÃƒÆ’O espera o cliente perguntar tudo. VocÃƒÂª CONDUZ a conversa.
</objetivo>

<tom_de_voz>
- Linguagem de WhatsApp: vc, tÃƒÂ¡, nÃƒÂ©, tbm, pra
- CarismÃƒÂ¡tico, direto e persuasivo
- Conversa fluida, sem parecer roteiro
- Sempre passa seguranÃƒÂ§a e conhecimento
- Nunca responde seco Ã¢â‚¬â€ toda mensagem tem personalidade
- Use emojis com moderaÃƒÂ§ÃƒÂ£o (1-2 por mensagem, no mÃƒÂ¡ximo)
- NEGRITO: Use APENAS UM asterisco (*texto*). NUNCA use dois (**texto**)
</tom_de_voz>

<mentalidade_comercial>
EM TODA MENSAGEM, vocÃƒÂª estÃƒÂ¡ construindo valor e conduzindo o cliente.
Isso NÃƒÆ’O significa empurrar preÃƒÂ§o. Significa:
- Educar sobre o produto/serviÃƒÂ§o
- ReforÃƒÂ§ar diferenciais
- Antecipar objeÃƒÂ§ÃƒÂµes antes que apareÃƒÂ§am
- Usar prova social e autoridade quando possÃƒÂ­vel
- Criar senso de oportunidade (sem forÃƒÂ§ar urgÃƒÂªncia fake)
Toda resposta deve conter pelo menos UM desses: valor percebido, autoridade, antecipaÃƒÂ§ÃƒÂ£o de objeÃƒÂ§ÃƒÂ£o ou visÃƒÂ£o de ganho.
</mentalidade_comercial>

<primeira_resposta>
Na PRIMEIRA mensagem vocÃƒÂª deve:
1. Se apresentar brevemente (nome + empresa)
2. Mostrar interesse genuÃƒÂ­no no que o cliente precisa
3. Fazer UMA pergunta que conduza a conversa

NÃƒÆ’O despeje tudo de uma vez. Crie curiosidade progressiva.
Adapte conforme o que o cliente escreveu:
- "oi" / "olÃƒÂ¡" Ã¢â€ â€™ apresente-se e pergunte como pode ajudar
- Pergunta especÃƒÂ­fica Ã¢â€ â€™ responda E faÃƒÂ§a uma pergunta de conduÃƒÂ§ÃƒÂ£o
- Pedindo preÃƒÂ§o Ã¢â€ â€™ gere um pouco de valor, depois informe
- Desconfiado Ã¢â€ â€™ reforce autoridade e credibilidade
</primeira_resposta>

{EXEMPLOS_CONVERSA}

{REGRAS_NICHO}

<guardrails>
NUNCA faÃƒÂ§a:
- Dizer que ÃƒÂ© IA, robÃƒÂ´, chatbot ou assistente virtual
- Inventar preÃƒÂ§o, horÃƒÂ¡rio ou disponibilidade que NÃƒÆ’O estejam configurados
- Prometer algo que nÃƒÂ£o pode cumprir
- Insistir se o cliente pedir para parar
- Usar "Posso ajudar em algo mais?" (robÃƒÂ³tico)
- Usar "Aguarde um momento" (prefira "vou verificar pra vc")
- Usar listas com bullet points Ã¢â‚¬â€ fale em parÃƒÂ¡grafos corridos como no WhatsApp
- Repetir cardÃƒÂ¡pio/catÃƒÂ¡logo toda hora Ã¢â‚¬â€ sÃƒÂ³ quando perguntarem

SEMPRE faÃƒÂ§a:
- Confirmar dados importantes antes de concluir
- Se nÃƒÂ£o souber, diga "vou verificar" Ã¢â‚¬â€ nunca invente
- Se perguntarem quem ÃƒÂ©, diga "Sou {NOME_AGENTE} da {NOME_EMPRESA}"
- Usar *negrito* com UM asterisco sÃƒÂ³
- Conduzir para o prÃƒÂ³ximo passo da conversa
</guardrails>

<contexto_negocio>
{CONTEXTO_COMPLETO}
</contexto_negocio>`

function preserveOriginalInstructionsInPrompt(promptText: string, instructions: string): string {
  const cleanPrompt = String(promptText || '').trim();
  const cleanInstructions = String(instructions || '').trim();
  if (!cleanInstructions) return cleanPrompt;

  const fingerprint = cleanInstructions.slice(0, 240);
  if (fingerprint && cleanPrompt.includes(fingerprint)) {
    return cleanPrompt;
  }

  const originalContext = cleanInstructions.slice(0, 24000);
  return [
    cleanPrompt,
    '<contexto_original_cliente>',
    originalContext,
    '</contexto_original_cliente>',
  ].join('\n\n');
}

function isCodexCreateAgentContractSession(session: ClientSession): boolean {
  return (session.agentConfig as any)?.codexCreateAgentContract === true;
}

function resolveCodexCreatedAgentModel(): string {
  return String(process.env.AGENTEZAP_CODEX_CLI_TENANT_MODEL || "gpt-5.4-mini").trim() || "gpt-5.4-mini";
}

function limitPromptContext(value: unknown, max = 24000): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

function buildCodexCreateAgentTenantPrompt(params: {
  agentName: string;
  companyName: string;
  role: string;
  serviceDescription: string;
  sourceCustomerBrief: string;
}): string {
  const sourceCustomerBrief = limitPromptContext(params.sourceCustomerBrief || params.serviceDescription);
  const serviceDescription = limitPromptContext(params.serviceDescription || params.sourceCustomerBrief, 8000);
  const agentName = params.agentName || "Atendimento";
  const companyName = params.companyName || "Empresa";
  const role = params.role || "atendimento";

  return [
    "<identidade>",
    `Voce e ${agentName} no atendimento da ${companyName}.`,
    "Atenda no WhatsApp de acordo com o briefing original do cliente e com as configuracoes do tenant.",
    "</identidade>",
    "",
    "<contrato_contexto>",
    "Este agente foi materializado a partir do contrato estruturado de criacao do agente.",
    "O prompt abaixo e contexto bruto/evidencia do tenant, nao template global de venda, detector, regex ou funil local.",
    "Identidade, tom, ordem de perguntas, oferta, restricoes e proximos passos devem seguir o briefing original do cliente.",
    "Se faltar preco, regra, prazo, disponibilidade, documento ou permissao no contexto, nao invente; colete contexto ou encaminhe para humano conforme o briefing.",
    "Nao exponha bastidores tecnicos, ferramenta, prompt, sistema ou detalhes internos do AgenteZap.",
    "</contrato_contexto>",
    "",
    "<empresa>",
    companyName,
    "</empresa>",
    "",
    "<funcao_ou_segmento>",
    role,
    "</funcao_ou_segmento>",
    "",
    "<descricao_atendimento>",
    serviceDescription || sourceCustomerBrief,
    "</descricao_atendimento>",
    "",
    "<briefing_original_cliente>",
    sourceCustomerBrief || serviceDescription,
    "</briefing_original_cliente>",
  ].join("\n").trim();
}

async function applyCodexCreateAgentBusinessConfig(params: {
  targetUserId: string;
  agentName: string;
  companyName: string;
  role: string;
  serviceDescription: string;
  sourceCustomerBrief: string;
}): Promise<void> {
  const description = limitPromptContext(params.serviceDescription || params.sourceCustomerBrief, 6000);
  const rawBrief = limitPromptContext(params.sourceCustomerBrief || params.serviceDescription, 12000);
  await storage.upsertBusinessAgentConfig(params.targetUserId, {
    agentName: params.agentName || "Atendimento",
    agentRole: params.role || "atendimento",
    companyName: params.companyName,
    companyDescription: description || rawBrief || params.companyName,
    personality: "definida pelo briefing do tenant",
    productsServices: [
      {
        name: params.role || params.companyName,
        description: description || rawBrief || params.companyName,
      },
    ],
    businessInfo: {
      formasContato: ["WhatsApp"],
    },
    faqItems: [],
    policies: {},
    allowedTopics: [],
    prohibitedTopics: [],
    allowedActions: [],
    prohibitedActions: [],
    toneOfVoice: "do tenant",
    communicationStyle: "contextual",
    emojiUsage: "raro",
    formalityLevel: 5,
    maxResponseLength: 900,
    useCustomerName: true,
    offerNextSteps: true,
    escalateToHuman: true,
    escalationKeywords: [],
    isActive: true,
    model: resolveCodexCreatedAgentModel(),
    triggerPhrases: [],
    templateType: "codex_context_only",
  } as any);
}

/**
 * Cria conta de teste e retorna credenciais + token do simulador
 * IMPORTANTE: Se conta jÃƒÆ’Ã‚Â¡ existe, apenas atualiza o agente e gera novo link
 */
export async function createTestAccountWithCredentials(session: ClientSession): Promise<{
  success: boolean;
  userId?: string;
  email?: string;
  password?: string;
  loginUrl?: string;
  simulatorToken?: string;
  agentName?: string;
  companyName?: string;
  isExistingAccount?: boolean;
  error?: string;
}> {
  try {
    const cleanPhone = normalizePhoneForAccount(session.phoneNumber);
    const email =
      normalizeCustomerEmailForAccount((session.agentConfig as any)?.customerEmail) ||
      generateTempEmail(session.phoneNumber);
    const password = generateTempPassword();
    const loginUrl = canonicalizeAgenteZapPublicBaseUrl(process.env.APP_URL);
    const contactName = await resolveSessionContactName(session);
    
    const applyAgentConfig = async (targetUserId: string): Promise<{ agentName: string; companyName: string }> => {
      const existingConfig = await storage.getAgentConfig(targetUserId);
      const existingIdentity = parseExistingAgentIdentity(existingConfig?.prompt);
      const incomingCompany = sanitizeCompanyName(session.agentConfig?.company);
      const incomingName = normalizeContactName(session.agentConfig?.name);
      const incomingPrompt = (session.agentConfig?.prompt || "").trim();
      const codexCreateAgentContract = isCodexCreateAgentContractSession(session);
      const hasIncomingConfigValues = Boolean(
        incomingCompany || incomingName || incomingPrompt,
      );

      // TRACE LOGGING: Rastrear decisÃµes de applyAgentConfig
      console.log(`ðŸ“‹ [APPLY-CONFIG] userId=${targetUserId} | existingPromptLen=${existingConfig?.prompt?.length || 0} | existingCompany="${existingIdentity.company || 'N/A'}" | incomingCompany="${incomingCompany || 'N/A'}" | incomingName="${incomingName || 'N/A'}" | hasIncoming=${hasIncomingConfigValues} | flowState=${session.flowState}`);
      const setupProfileReady = isSetupProfileReady(session.setupProfile);

      if (!hasIncomingConfigValues && !setupProfileReady && existingConfig?.prompt && existingIdentity.company) {
        console.log(`â­ï¸ [APPLY-CONFIG] EARLY RETURN â€” no incoming changes, keeping existing config for ${targetUserId}`);
        return {
          agentName: existingIdentity.agentName || "Atendente",
          companyName: existingIdentity.company,
        };
      }

      if (!codexCreateAgentContract) {
        throw new Error("CODEX_CREATE_AGENT_CONTRACT_REQUIRED");
      }

      let agentName = normalizeContactName(session.agentConfig?.name) || existingIdentity.agentName;
      if (!agentName || agentName === "Atendente" || agentName === "Agente") {
        agentName = "Atendimento";
      }

      const companyName = sanitizeCompanyName(session.agentConfig?.company) || existingIdentity.company;
      if (!companyName) {
        throw new Error("MISSING_COMPANY_NAME");
      }

      const agentRole = (session.agentConfig?.role || inferRoleFromBusinessName(companyName))
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || "atendente virtual";
      const instructions = session.agentConfig?.prompt || "Seja prestativo, educado e ajude os clientes com informaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes sobre produtos e serviÃƒÆ’Ã‚Â§os.";
      const serviceDescription = limitPromptContext((session.agentConfig as any)?.serviceDescription || instructions, 12000);
      const sourceCustomerBrief = limitPromptContext(session.agentConfig?.sourceCustomerBrief || instructions, 24000);
      const detectedWorkflowKind = session.setupProfile?.workflowKind || inferWorkflowKindFromProfile(companyName, session.setupProfile?.businessSummary) || "generic";
      const fullPrompt = buildCodexCreateAgentTenantPrompt({
        agentName,
        companyName,
        role: agentRole,
        serviceDescription,
        sourceCustomerBrief,
      });
      const promptAlreadyUpToDate =
        Boolean(existingConfig?.prompt) &&
        String(existingConfig?.prompt || "").trim() === fullPrompt.trim();
      const shouldApplyPromptUpdate = !promptAlreadyUpToDate;
      const shouldApplyStructuredSetup = setupProfileReady;
      const modelForAgentConfig = resolveCodexCreatedAgentModel();

      // TRACE: Log decisÃµes de atualizaÃ§Ã£o
      console.log(`ðŸ“‹ [APPLY-CONFIG] company="${companyName}" | agent="${agentName}" | workflow=${detectedWorkflowKind} | newPromptLen=${fullPrompt.length} | upToDate=${promptAlreadyUpToDate} | shouldUpdate=${shouldApplyPromptUpdate}`);
      // CORREÃƒâ€¡ÃƒÆ’O: CriaÃƒÂ§ÃƒÂ£o inicial e setup guiado NÃƒÆ’O contam como calibraÃƒÂ§ÃƒÂ£o.
      // SÃƒÂ³ conta como calibraÃƒÂ§ÃƒÂ£o se o agente JÃƒÂ tinha um prompt configurado E real
      // e o usuÃƒÂ¡rio estÃƒÂ¡ pedindo uma ALTERAÃƒâ€¡ÃƒÆ’O explÃƒÂ­cita (nÃƒÂ£o o setup inicial).
      const isInitialSetup = !existingConfig?.prompt || !existingIdentity.company;
      const isGuidedOnboardingSetup = session.flowState === "onboarding" || 
        Boolean(session.setupProfile?.questionStage);
      const shouldCountEdit = Boolean(
        existingConfig && 
        !isInitialSetup && 
        !isGuidedOnboardingSetup && 
        (shouldApplyPromptUpdate || shouldApplyStructuredSetup)
      );

      console.log(`ðŸ“‹ [APPLY-CONFIG] isInitialSetup=${isInitialSetup} | isGuidedOnboarding=${isGuidedOnboardingSetup} | shouldCountEdit=${shouldCountEdit}`);

      if (shouldCountEdit) {
        const allowance = await getAdminEditAllowance(targetUserId);
        console.log(`ðŸ“‹ [APPLY-CONFIG] Edit allowance: allowed=${allowance.allowed} | used=${allowance.used}/${allowance.limit} | hasSub=${allowance.hasActiveSubscription}`);
        if (!allowance.allowed) {
          console.error(`âŒ [APPLY-CONFIG] FREE_EDIT_LIMIT_REACHED for ${targetUserId} â€” prompt NOT updated!`);
          const limitError = new Error("FREE_EDIT_LIMIT_REACHED");
          (limitError as any).used = allowance.used;
          throw limitError;
        }
      }

      if (shouldApplyPromptUpdate) {
        console.log(`ðŸ“ [APPLY-CONFIG] Upserting prompt for ${targetUserId}: ${fullPrompt.length} chars, company="${companyName}"`);
        const upsertResult = await storage.upsertAgentConfig(targetUserId, {
          prompt: fullPrompt,
          isActive: true,
          model: modelForAgentConfig,
          triggerPhrases: [],
          messageSplitChars: 400,
          responseDelaySeconds: 30,
        });
        console.log(`ðŸ“ [APPLY-CONFIG] Upsert returned: promptLen=${upsertResult?.prompt?.length || 0}`);

        // POST-UPDATE VERIFICATION: Ler do DB e confirmar que o prompt foi salvo
        const verifyConfig = await storage.getAgentConfig(targetUserId);
        const savedPromptLen = verifyConfig?.prompt?.length || 0;
        const savedContainsCompany = (verifyConfig?.prompt || "").toLowerCase().includes(companyName.toLowerCase());
        
        if (savedPromptLen < 100 || !savedContainsCompany) {
          console.error(`âŒ [VERIFY] Prompt verification FAILED! savedLen=${savedPromptLen} | containsCompany=${savedContainsCompany} | expected="${companyName}"`);
          // RETRY com upsert direto
          console.log(`ðŸ”„ [VERIFY] Retrying prompt upsert for ${targetUserId}...`);
          await storage.upsertAgentConfig(targetUserId, { prompt: fullPrompt, isActive: true, model: modelForAgentConfig });
          const retryVerify = await storage.getAgentConfig(targetUserId);
          if (!(retryVerify?.prompt || "").toLowerCase().includes(companyName.toLowerCase())) {
            console.error(`âŒ [VERIFY] RETRY ALSO FAILED for ${targetUserId}! Critical bug.`);
          } else {
            console.log(`âœ… [VERIFY] Retry succeeded for ${targetUserId}`);
          }
        } else {
          console.log(`âœ… [VERIFY] Prompt verified for ${targetUserId}: ${savedPromptLen} chars, company "${companyName}" found`);

          // SYNC prompt_versions to prevent PROMPT SYNC from reverting
          try {
            const { salvarVersaoPrompt } = await import("./promptHistoryService");
            await salvarVersaoPrompt({
              userId: targetUserId,
              configType: "ai_agent_config",
              promptContent: fullPrompt,
              editSummary: (codexCreateAgentContract ? "Config via Codex create-agent: " : "Config via admin agent: ") + companyName,
              editType: "ia",
            });
            console.log("[APPLY-CONFIG] prompt_versions synced for " + targetUserId);
          } catch (pvErr) {
            console.warn("[APPLY-CONFIG] Failed to sync prompt_versions:", pvErr);
          }
        }
      } else {
        console.log(`â­ï¸ [APPLY-CONFIG] Prompt already up-to-date, skipping upsert for ${targetUserId}`);
      }

      if (shouldApplyStructuredSetup) {
        await applyStructuredSetupToUser(targetUserId, session);
      }

      if (codexCreateAgentContract) {
        await applyCodexCreateAgentBusinessConfig({
          targetUserId,
          agentName,
          companyName,
          role: agentRole,
          serviceDescription,
          sourceCustomerBrief,
        });
      }

      if (shouldCountEdit) {
        await consumeAdminPromptEdit(targetUserId);
        console.log(`ðŸ“Š [QUOTA] CalibraÃ§Ã£o contada para ${targetUserId} (alteraÃ§Ã£o real, nÃ£o setup inicial)`);
      } else if (!isInitialSetup && (shouldApplyPromptUpdate || shouldApplyStructuredSetup)) {
        console.log(`ðŸ“Š [QUOTA] Setup guiado aplicado para ${targetUserId} - NÃƒO conta como calibraÃ§Ã£o`);
      }

      console.log(`âœ… [SALES] Agente "${agentName}" configurado para ${companyName} | promptUpdated=${shouldApplyPromptUpdate} | structuredSetup=${shouldApplyStructuredSetup}`);
      return { agentName, companyName };
    };
    
    // Verificar se jÃƒÆ’Ã‚Â¡ existe usuÃƒÆ’Ã‚Â¡rio com esse telefone OU email
    const users = await storage.getAllUsers();
    let existing = users.find(u => normalizePhoneForAccount(u.phone || "") === cleanPhone);
    
    // Fallback por e-mail fixo do nÃƒÆ’Ã‚Âºmero
    if (!existing) {
      existing = users.find(u => (u.email || "").toLowerCase() === email.toLowerCase());
    }
    
    if (existing) {
      console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬Å¾ [SALES] UsuÃƒÆ’Ã‚Â¡rio jÃƒÆ’Ã‚Â¡ existe (${existing.email}), atualizando agente...`);
      const updates: Partial<{ name: string; email: string; phone: string; whatsappNumber: string }> = {};
      if (shouldRefreshStoredUserName(existing.name)) updates.name = contactName;
      if (!existing.email) updates.email = email;
      if (normalizePhoneForAccount(existing.phone || "") !== cleanPhone) updates.phone = cleanPhone;
      if (normalizePhoneForAccount((existing as any).whatsappNumber || "") !== cleanPhone) updates.whatsappNumber = cleanPhone;
      if (Object.keys(updates).length > 0) {
        existing = await storage.updateUser(existing.id, updates);
      }

      const resolvedEmail = await ensureCanonicalEmailForUser(
        existing.id,
        String(existing.email || updates.email || ""),
        email,
      );

      const { agentName, companyName } = await applyAgentConfig(existing.id);
      
      // V13: If we created this user earlier in the same session, it's NOT a returning user
      const wasCreatedThisSession = session.accountCreatedThisSession === true;
      // V14: If phone was in forceOnboarding (simulator reset / #limpar), treat as NEW user
      const wasForceOnboarding = shouldForceOnboarding(session.phoneNumber);
      
      updateClientSession(session.phoneNumber, {
        userId: existing.id,
        email: resolvedEmail,
        contactName,
        flowState: 'post_test',
        setupProfile: undefined,
      });
      
      // Gerar token para simulador (persiste no Supabase)
      const tokenAgentName = session.agentConfig?.name || agentName || "Agente";
      const tokenCompany = session.agentConfig?.company || companyName || "Empresa";
      const testToken = await generateTestToken(existing.id, tokenAgentName, tokenCompany);
      
      console.log(`ÃƒÂ°Ã…Â¸Ã…Â½Ã‚Â¯ [SALES] Link do simulador gerado para usuÃƒÆ’Ã‚Â¡rio existente: ${testToken.token}`);
      
      // Persistir vÃƒÂ­nculo no banco para nÃƒÂ£o perder entre reinÃƒÂ­cios
      await persistConversationLink(session.phoneNumber, existing.id, testToken.token);
      
      // Remover do forceOnboarding para que o prÃƒÆ’Ã‚Â³ximo prompt reconheÃƒÆ’Ã‚Â§a o usuÃƒÆ’Ã‚Â¡rio
      stopForceOnboarding(session.phoneNumber);

      // V16: Regenerar senha temporÃ¡ria para usuÃ¡rios existentes e atualizar no Auth
      const newPassword = generateTempPassword();
      try {
        await supabase.auth.admin.updateUserById(existing.id, { password: newPassword });
        console.log(`[SALES] Senha regenerada para usuÃ¡rio existente ${existing.id}`);
      } catch (pwErr) {
        console.error("[SALES] Erro ao regenerar senha:", pwErr);
      }

      return {
        success: true,
        userId: existing.id,
        email: resolvedEmail,
        password: newPassword,
        loginUrl,
        simulatorToken: testToken.token,
        agentName,
        companyName,
        isExistingAccount: (wasCreatedThisSession || wasForceOnboarding) ? false : true,
      };
    }
    
    // Criar novo usuÃƒÆ’Ã‚Â¡rio no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        name: contactName,
        phone: cleanPhone,
      }
    });
    
    if (authError) {
      const emailAlreadyExists =
        authError.message?.includes("email") || (authError as any).code === "email_exists";

      if (emailAlreadyExists) {
        console.warn(`[SALES] Supabase Auth retornou email_exists para ${email}. Tentando recuperacao.`);
      } else {
        console.error("[SALES] Erro ao criar usuÃƒÆ’Ã‚Â¡rio Supabase:", authError);
      }
      
      // Se email jÃƒÆ’Ã‚Â¡ existe, tentar buscar usuÃƒÆ’Ã‚Â¡rio existente pelo email
      if (emailAlreadyExists) {
        console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬Å¾ [SALES] Email jÃƒÆ’Ã‚Â¡ existe, buscando usuÃƒÆ’Ã‚Â¡rio existente...`);
        
        // IMPORTANTE: Buscar lista ATUALIZADA de usuÃƒÆ’Ã‚Â¡rios (nÃƒÆ’Ã‚Â£o usar a variÃƒÆ’Ã‚Â¡vel 'users' antiga)
        const freshUsers = await storage.getAllUsers();
        const existingByEmail = freshUsers.find(u => (u.email || "").toLowerCase() === email.toLowerCase());
        if (existingByEmail) {
          const recoveryUpdates: Partial<{ name: string; phone: string; whatsappNumber: string }> = {};
          if (shouldRefreshStoredUserName(existingByEmail.name)) {
            recoveryUpdates.name = contactName;
          }
          if (normalizePhoneForAccount(existingByEmail.phone || "") !== cleanPhone) {
            recoveryUpdates.phone = cleanPhone;
          }
          if (normalizePhoneForAccount((existingByEmail as any).whatsappNumber || "") !== cleanPhone) {
            recoveryUpdates.whatsappNumber = cleanPhone;
          }
          if (Object.keys(recoveryUpdates).length > 0) {
            await storage.updateUser(existingByEmail.id, recoveryUpdates);
          }

          const resolvedEmail = await ensureCanonicalEmailForUser(
            existingByEmail.id,
            String(existingByEmail.email || ""),
            email,
          );

          const { agentName, companyName } = await applyAgentConfig(existingByEmail.id);
          
          updateClientSession(session.phoneNumber, {
            userId: existingByEmail.id,
            email: resolvedEmail,
            contactName,
            flowState: 'post_test',
            setupProfile: undefined,
          });
          
          const testToken = await generateTestToken(existingByEmail.id, 
            session.agentConfig?.name || agentName || "Agente",
            session.agentConfig?.company || companyName || "Empresa",
          );
          
          console.log(`ÃƒÂ°Ã…Â¸Ã…Â½Ã‚Â¯ [SALES] Link gerado apÃƒÆ’Ã‚Â³s recuperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o de email_exists: ${testToken.token}`);
          await persistConversationLink(session.phoneNumber, existingByEmail.id, testToken.token);
          
          // Remover do forceOnboarding
          const wasForceOnboardingRecovery = shouldForceOnboarding(session.phoneNumber);
          const wasCreatedRecovery = session.accountCreatedThisSession === true;
          stopForceOnboarding(session.phoneNumber);

          // V16: Regenerar senha para recovery path tambÃ©m
          const recoveryPassword = generateTempPassword();
          try {
            await supabase.auth.admin.updateUserById(existingByEmail.id, { password: recoveryPassword });
          } catch (pwErr) {
            console.error("[SALES] Erro ao regenerar senha (recovery):", pwErr);
          }

          return {
            success: true,
            userId: existingByEmail.id,
            email: resolvedEmail,
            password: recoveryPassword,
            loginUrl,
            simulatorToken: testToken.token,
            agentName,
            companyName,
            isExistingAccount: (wasCreatedRecovery || wasForceOnboardingRecovery) ? false : true,
          };
        }

        try {
          let existingAuthUser: any | undefined;
          const AUTH_PAGE_SIZE = 200;
          const AUTH_MAX_PAGES = 40;

          for (let page = 1; page <= AUTH_MAX_PAGES && !existingAuthUser; page += 1) {
            const { data: authUsersData, error: authListError } = await supabase.auth.admin.listUsers({
              page,
              perPage: AUTH_PAGE_SIZE,
            } as any);

            if (authListError) {
              console.warn(`[SALES] Falha ao listar Auth users na pagina ${page}: ${authListError.message}`);
              break;
            }

            const authUsers = Array.isArray((authUsersData as any)?.users) ? (authUsersData as any).users : [];
            existingAuthUser = authUsers.find((candidate: any) => {
              return String(candidate?.email || "").toLowerCase() === email.toLowerCase();
            });

            if (authUsers.length < AUTH_PAGE_SIZE) {
              break;
            }
          }

          if (existingAuthUser?.id) {
            console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬Å¾ [SALES] UsuÃƒÆ’Ã‚Â¡rio encontrado apenas no Auth. Recriando registro local...`);

            const recoveredUser = await storage.upsertUser({
              id: existingAuthUser.id,
              email,
              name: contactName,
              phone: cleanPhone,
              whatsappNumber: cleanPhone,
              role: "user",
            });

            const { agentName, companyName } = await applyAgentConfig(recoveredUser.id);

            updateClientSession(session.phoneNumber, {
              userId: recoveredUser.id,
              email,
              contactName,
              flowState: 'post_test',
              setupProfile: undefined,
            });

            const testToken = await generateTestToken(
              recoveredUser.id,
              session.agentConfig?.name || agentName || "Agente",
              session.agentConfig?.company || companyName || "Empresa",
            );

            console.log(`ÃƒÂ°Ã…Â¸Ã…Â½Ã‚Â¯ [SALES] Link gerado apÃƒÆ’Ã‚Â³s recuperar usuÃƒÆ’Ã‚Â¡rio ÃƒÆ’Ã‚Â³rfÃƒÆ’Ã‚Â£o do Auth: ${testToken.token}`);
            await persistConversationLink(session.phoneNumber, recoveredUser.id, testToken.token);
            const wasForceOnboardingOrphan = shouldForceOnboarding(session.phoneNumber);
            const wasCreatedOrphan = session.accountCreatedThisSession === true;
            stopForceOnboarding(session.phoneNumber);

            // V17.2: Regenerar senha para orphan recovery path (auto-login)
            const orphanPassword = generateTempPassword();
            try {
              await supabase.auth.admin.updateUserById(recoveredUser.id, { password: orphanPassword });
              console.log(`[SALES] Senha regenerada para usuÃ¡rio Ã³rfÃ£o ${recoveredUser.id}`);
            } catch (pwErr) {
              console.error("[SALES] Erro ao regenerar senha (orphan):", pwErr);
            }

            return {
              success: true,
              userId: recoveredUser.id,
              email,
              password: orphanPassword,
              loginUrl,
              simulatorToken: testToken.token,
              agentName,
              companyName,
              isExistingAccount: (wasCreatedOrphan || wasForceOnboardingOrphan) ? false : true,
            };
          }
        } catch (authRecoveryError) {
          console.error("[SALES] Erro ao recuperar usuario orfao no Auth:", authRecoveryError);
        }
      }
      
      return { success: false, error: authError.message };
    }
    
    if (!authData.user) {
      return { success: false, error: "Falha ao criar usuÃƒÆ’Ã‚Â¡rio" };
    }
    
    // Criar usuÃƒÆ’Ã‚Â¡rio no banco de dados
    const user = await storage.upsertUser({
      id: authData.user.id,
      email: email,
      name: contactName,
      phone: cleanPhone,
      whatsappNumber: cleanPhone,
      role: "user",
    });
    
    const { agentName, companyName } = await applyAgentConfig(user.id);
    
    // Usuario criado no Gratis permanente; Plus libera prioridade rapida e ferramentas.
    console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã…Â  [SALES] Usuario ${user.id} criado no Gratis permanente`);
    
    updateClientSession(session.phoneNumber, { 
      userId: user.id, 
      email: email,
      contactName,
      flowState: 'post_test',
      setupProfile: undefined,
    });

    // Processar mÃƒÆ’Ã‚Â­dias pendentes da sessÃƒÆ’Ã‚Â£o (enviadas durante o onboarding)
    if (session.uploadedMedia && session.uploadedMedia.length > 0) {
        console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â¸ [SALES] Processando ${session.uploadedMedia.length} mÃƒÆ’Ã‚Â­dias pendentes para o novo usuÃƒÆ’Ã‚Â¡rio...`);
        for (const media of session.uploadedMedia) {
            try {
                await insertAgentMedia({
                    userId: user.id,
                    name: `MEDIA_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                    mediaType: media.type,
                    storageUrl: media.url,
                    description: media.description || "MÃƒÆ’Ã‚Â­dia enviada no onboarding",
                    whenToUse: media.whenToUse,
                    isActive: true,
                    sendAlone: false,
                    displayOrder: 0,
                });
                console.log(`ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ [SALES] MÃƒÆ’Ã‚Â­dia pendente salva para ${user.id}`);
            } catch (err) {
                console.error(`ÃƒÂ¢Ã‚ÂÃ…â€™ [SALES] Erro ao salvar mÃƒÆ’Ã‚Â­dia pendente:`, err);
            }
        }
        // Limpar mÃƒÆ’Ã‚Â­dias pendentes da sessÃƒÆ’Ã‚Â£o
        updateClientSession(session.phoneNumber, { uploadedMedia: [] });
    }
    
    // Gerar token para simulador (persiste no Supabase)
    const tokenAgentName = session.agentConfig?.name || agentName || "Agente";
    const tokenCompany = session.agentConfig?.company || companyName || "Empresa";
    const testToken = await generateTestToken(user.id, tokenAgentName, tokenCompany);
    
    console.log(`ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ [SALES] Conta de teste criada: ${email} (ID: ${user.id})`);
    
    // Persistir vÃƒÂ­nculo no banco para nÃƒÂ£o perder entre reinÃƒÂ­cios
    await persistConversationLink(session.phoneNumber, user.id, testToken.token);
    
    // Remover do forceOnboarding
    stopForceOnboarding(session.phoneNumber);

    // V13: Track that we created the user in this session
    updateClientSession(session.phoneNumber, { accountCreatedThisSession: true });
    
    return {
      success: true,
      userId: user.id,
      email: email,
      password: password,
      loginUrl,
      simulatorToken: testToken.token,
      agentName,
      companyName,
      isExistingAccount: false,
    };
  } catch (error) {
    console.error("[SALES] Erro ao criar conta de teste:", error);
    if ((error as any)?.message === "FREE_EDIT_LIMIT_REACHED") {
      const used = Number((error as any)?.used || FREE_ADMIN_WHATSAPP_EDIT_LIMIT);
      return { success: false, error: `FREE_EDIT_LIMIT_REACHED:${used}` };
    }
    return { success: false, error: String(error) };
  }
}

export function addToConversationHistory(phoneNumber: string, role: "user" | "assistant", content: string) {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const session = clientSessions.get(cleanPhone);
  
  if (session) {
    session.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });
    
    // CAMADA 2: CompactaÃƒÂ§ÃƒÂ£o inteligente ao invÃƒÂ©s de truncar com slice(-30)
    if (session.conversationHistory.length > 25) {
      // Dispara compactaÃƒÂ§ÃƒÂ£o assÃƒÂ­ncrona
      compactConversationHistory(cleanPhone, session.conversationHistory, session.memorySummary)
        .then(({ compactedHistory, summary }) => {
          // SÃƒÂ³ aplica se a sessÃƒÂ£o ainda existe e nÃƒÂ£o foi limpa
          const currentSession = clientSessions.get(cleanPhone);
          if (currentSession && currentSession.conversationHistory.length > 20) {
            currentSession.conversationHistory = compactedHistory;
            currentSession.memorySummary = summary;
            console.log(`Ã°Å¸Â§Â¹ [COMPACT] HistÃƒÂ³rico compactado: ${currentSession.conversationHistory.length} msgs + resumo (${summary.length} chars)`);
          }
        })
        .catch(err => {
          console.error(`Ã¢Å¡Â Ã¯Â¸Â [COMPACT] Erro na compactaÃƒÂ§ÃƒÂ£o, usando fallback:`, err);
          // Fallback: truncar simples
          if (session.conversationHistory.length > 30) {
            session.conversationHistory = session.conversationHistory.slice(-30);
          }
        });
    }
  }
}

// ============================================================================
// PROCESSADOR PRINCIPAL DE MENSAGENS
// ============================================================================

export interface AdminAgentResponse {
  text: string;
  splitMessages?: string[]; // V22: bolhas separadas por [BOLHA] da IA
  mediaActions?: Array<{
    type: 'send_media';
    media_name: string;
    mediaData?: AdminMedia;
  }>;
  actions?: {
    sendPix?: boolean;
    notifyOwner?: boolean;
    startTestMode?: boolean;
    disconnectWhatsApp?: boolean;
    connectWhatsApp?: boolean;
    sendQrCode?: boolean;
    testAccountCredentials?: TestAccountCredentials;
    demoAssets?: GeneratedDemoAssets;
  };
}

async function getAdminAgentConfig(): Promise<{
  triggerPhrases: string[];
  messageSplitChars: number;
  responseDelaySeconds: number;
  isActive: boolean;
  promptStyle: "nuclear" | "human";
}> {
  try {
    const triggerPhrasesConfig = await storage.getSystemConfig("admin_agent_trigger_phrases");
    const splitCharsConfig = await storage.getSystemConfig("admin_agent_message_split_chars");
    const delayConfig = await storage.getSystemConfig("admin_agent_response_delay_seconds");
    const isEnabledConfig = await storage.getSystemConfig("admin_agent_enabled");
    const legacyIsActiveConfig = await storage.getSystemConfig("admin_agent_is_active");
    const promptStyleConfig = await storage.getSystemConfig("admin_agent_prompt_style");
    
    let triggerPhrases: string[] = [];
    if (triggerPhrasesConfig?.valor) {
      try {
        const parsed = JSON.parse(triggerPhrasesConfig.valor);
        if (Array.isArray(parsed)) {
          triggerPhrases = parsed;
        } else {
          triggerPhrases = [];
        }
      } catch {
        // Fallback: se falhar o parse JSON, tentar usar como string crua (separada por vÃƒÆ’Ã‚Â­rgula)
        // Isso corrige o bug onde uma string simples salva no banco era ignorada, ativando o modo "no-filter"
        const raw = triggerPhrasesConfig.valor.trim();
        if (raw.length > 0) {
          if (raw.includes(',')) {
            triggerPhrases = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
          } else {
            triggerPhrases = [raw];
          }
        } else {
          triggerPhrases = [];
        }
      }
    }
    
    return {
      triggerPhrases,
      messageSplitChars: parseInt(splitCharsConfig?.valor || "400", 10),
      responseDelaySeconds: parseInt(delayConfig?.valor || "30", 10),
      isActive: isEnabledConfig?.valor === "true" || legacyIsActiveConfig?.valor === "true",
      promptStyle: (promptStyleConfig?.valor as "nuclear" | "human") || "nuclear",
    };
  } catch (error) {
    console.error("[SALES] Erro ao carregar config, usando defaults:", error);
    return {
      triggerPhrases: [],
      messageSplitChars: 400,
      responseDelaySeconds: 30,
      isActive: true,
      promptStyle: "nuclear",
    };
  }
}

function checkTriggerPhrases(
  message: string,
  conversationHistory: Array<{ content: string }>,
  triggerPhrases: string[]
): { hasTrigger: boolean; foundIn: string } {
  console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â [TRIGGER CHECK] Iniciando verificaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o`);
  console.log(`   - Frases configuradas: ${JSON.stringify(triggerPhrases)}`);
  console.log(`   - Mensagem atual: "${message}"`);
  console.log(`   - HistÃƒÆ’Ã‚Â³rico: ${conversationHistory.length} mensagens`);

  if (!triggerPhrases || triggerPhrases.length === 0) {
    console.log(`   ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ [TRIGGER CHECK] Lista vazia = Aprovado (no-filter)`);
    return { hasTrigger: true, foundIn: "no-filter" };
  }
  
  const normalize = (s: string) => (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const allMessages = [
    ...conversationHistory.map(m => m.content || ""),
    message
  ].join(" ");

  let foundIn = "none";
  const hasTrigger = triggerPhrases.some(phrase => {
    const normPhrase = normalize(phrase);
    const normMsg = normalize(message);
    const normAll = normalize(allMessages);

    const inLast = normMsg.includes(normPhrase);
    const inAll = inLast ? false : normAll.includes(normPhrase);
    
    if (inLast) {
        console.log(`   ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ [TRIGGER CHECK] Encontrado na mensagem atual: "${phrase}"`);
        foundIn = "last"; 
    } else if (inAll) {
        console.log(`   ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ [TRIGGER CHECK] Encontrado no histÃƒÆ’Ã‚Â³rico: "${phrase}"`);
        foundIn = "history";
    }
    
    return inLast || inAll;
  });

  if (!hasTrigger) {
      console.log(`   ÃƒÂ¢Ã‚ÂÃ…â€™ [TRIGGER CHECK] Nenhuma frase encontrada.`);
  }

  return { hasTrigger, foundIn };
}

export async function processAdminMessage(
  phoneNumber: string,
  messageText: string,
  mediaType?: string,
  mediaUrl?: string,
  skipTriggerCheck: boolean = false,
  contactName?: string,
  sendIntermediateMessage?: (text: string) => Promise<void>,
  mediaMimeType?: string | null,
): Promise<AdminAgentResponse | null> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  
  // ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â
  // Obter ou criar sessÃƒÆ’Ã‚Â£o
  let session = getClientSession(cleanPhone);
  console.log(`ðŸ” [V17.2-DEBUG] processAdminMessage START: phone=${cleanPhone}, sessionExists=${!!session}, lastGeneratedPassword=${session?.lastGeneratedPassword ? 'SET(' + session.lastGeneratedPassword.length + ')' : 'NULL'}, email=${session?.email || 'NULL'}, flowState=${session?.flowState || 'NULL'}`);
  if (!session) {
    session = createClientSession(cleanPhone);
    const shouldRestorePersistedContext =
      !wasChatCleared(cleanPhone) && !shouldForceOnboarding(cleanPhone);

    // Restore setup state from DB if session was lost (e.g. server restart)
    if (shouldRestorePersistedContext) {
      try {
        const conversation = await storage.getAdminConversationByPhone(cleanPhone);
        const ctxState = (conversation as any)?.contextState;
        if (ctxState && typeof ctxState === "object") {
          if (ctxState.setupProfile && !session.setupProfile) {
            session = updateClientSession(cleanPhone, {
              setupProfile: ctxState.setupProfile,
              flowState: ctxState.flowState || session.flowState,
            });
            console.log(`Ã°Å¸â€â€ž [STATE] Restaurado setupProfile do banco para ${cleanPhone} (stage: ${ctxState.setupProfile.questionStage})`);
          }
          if (ctxState.pendingAction && !session.pendingAction) {
            // Defensive parse: accept JSON string (new contract) and raw object (legacy)
            let restored: any = ctxState.pendingAction;
            if (typeof restored === "string") {
              try { restored = JSON.parse(restored); } catch { restored = null; }
            }
            if (restored && restored.expiresAt && restored.expiresAt > Date.now()) {
              session = updateClientSession(cleanPhone, { pendingAction: restored });
              console.log(
                '[STATE] Restaurado pendingAction do banco para ' +
                  cleanPhone +
                  ' (tipo=' +
                  restored.type +
                  ')',
              );
            } else {
              console.log('[STATE] pendingAction expirado ou invalido descartado para ' + cleanPhone);
            }
          }
        }

        // CAMADA 2: Restaurar memorySummary do banco
        if (conversation?.memorySummary && !session.memorySummary) {
          session.memorySummary = conversation.memorySummary as string;
          console.log(`Ã°Å¸Â§Â  [MEMORY] Restaurado memorySummary do banco para ${cleanPhone} (${session.memorySummary.length} chars)`);
        }

        // CAMADA 3: Restaurar fatos durÃƒÂ¡veis do context_state
        if (ctxState?.clientProfile) {
          persistConversationState(cleanPhone, { clientProfile: ctxState.clientProfile }).catch(() => {});
          console.log(`Ã°Å¸â€œâ€¹ [MEMORY] Restaurado clientProfile do banco para ${cleanPhone}`);
        }
      } catch (err) {
        console.log(`Ã¢Å¡Â Ã¯Â¸Â [STATE] Erro ao restaurar estado do banco para ${cleanPhone}:`, err);
      }
    }
  }

  const resolvedIncomingContactName = normalizeContactName(contactName);
  if (resolvedIncomingContactName && session.contactName !== resolvedIncomingContactName) {
    session = updateClientSession(cleanPhone, { contactName: resolvedIncomingContactName });
  } else if (!session.contactName) {
    try {
      const conversation = await storage.getAdminConversationByPhone(cleanPhone);
      const dbContactName = normalizeContactName(conversation?.contactName);
      if (dbContactName) {
        session = updateClientSession(cleanPhone, { contactName: dbContactName });
      }
    } catch (error) {
      console.log(`ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â [SALES] NÃƒÆ’Ã‚Â£o foi possÃƒÆ’Ã‚Â­vel carregar contactName de ${cleanPhone}:`, error);
    }
  }

  const hadAssistantHistoryBefore = session.conversationHistory.some((msg) => msg.role === "assistant");
  
  // Comment 1 fix: Resolve linked user BEFORE onboarding routing guard so post_test clients
  // with recovered userId don't bypass V2 and get stuck in onboarding.
  const linkedContext = await resolveLinkedUserForSession(session);
  session = linkedContext.session;
  const bypassOnboardingGraph = shouldBypassOnboardingGraph({
    session,
    messageText,
    mediaType,
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // V19: ADMIN TOOL CALLING â€” Motor autÃ´nomo via LLM Tool Calling
  // Quando ADMIN_TOOL_CALLING=true, TODAS as mensagens (onboarding + ativos)
  // sÃ£o roteadas para o motor de Tool Calling que decide autonomamente qual
  // ferramenta usar. Substitui completamente o sistema de stages/regex.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  {
    console.log(`[V19-ToolCalling] Roteando para processToolCallingMessage (phone=${cleanPhone}, userId=${session.userId || 'novo'}, flowState=${session.flowState})`);
    try {
      // Persistir mensagem do usuÃ¡rio no histÃ³rico
      let userHistoryContent = messageText;
      if (mediaType && mediaType !== 'text' && mediaType !== 'chat') {
        userHistoryContent += `\n[SISTEMA: O usuÃ¡rio enviou uma mÃ­dia do tipo ${mediaType}.]`;
      }
      addToConversationHistory(cleanPhone, "user", userHistoryContent);

      // Mapear conversationHistory para o formato esperado
      const mappedHistory = session.conversationHistory.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const result = await processToolCallingMessage(
        cleanPhone,
        messageText,
        session.userId,
        mappedHistory,
        session.pendingAction,
        session.agentConfig,
        session.contactName,
        mediaType,
        mediaUrl,
        sendIntermediateMessage,
        session.pendingMedia,
        undefined,
        { mediaMimeType: mediaMimeType || undefined },
      );

      const toolCallingSessionUpdates: Partial<ClientSession> = {};
      if (result.newPendingAction) {
        toolCallingSessionUpdates.pendingAction = result.newPendingAction;
      } else if (result.clearPendingAction) {
        (toolCallingSessionUpdates as any).pendingAction = null;
      }
      if (result.consumedPendingMedia) {
        (toolCallingSessionUpdates as any).pendingMedia = undefined;
        toolCallingSessionUpdates.awaitingMediaConfirmation = false;
        toolCallingSessionUpdates.awaitingMediaContext = false;
      }
      if (Object.keys(toolCallingSessionUpdates).length > 0) {
        session = updateClientSession(cleanPhone, toolCallingSessionUpdates);
      }

      const customerResponseText = normalizeAdminLLMCustomerText(String(result.responseText || ""));
      if (!customerResponseText.trim()) {
        console.error(`[V19-ToolCalling] Executor retornou sem fala publica valida; fail-closed (phone=${cleanPhone})`);
        return null;
      }

      // Adicionar resposta ao histÃ³rico
      addToConversationHistory(cleanPhone, "assistant", customerResponseText);

      return {
        text: customerResponseText,
        actions: {},
      };
    } catch (err) {
      console.error(`[V19-ToolCalling] Erro ao processar mensagem:`, err);
      return null;
    }
  }

  console.error(`[V19-ToolCalling] Codex/tool-calling finished without valid public text; legacy admin fallback removed (phone=${cleanPhone})`);
  return null;
}

// ============================================================================
// FUNÃƒÆ’Ã¢â‚¬Â¡ÃƒÆ’Ã¢â‚¬Â¢ES AUXILIARES
// ============================================================================

async function findUserByPhone(phone: string): Promise<any | undefined> {
  try {
    const cleanPhone = normalizePhoneForAccount(phone);
    const users = await storage.getAllUsers();
    const byRecency = [...users].sort((a: any, b: any) => {
      const aTime = new Date(a?.createdAt || a?.created_at || 0).getTime();
      const bTime = new Date(b?.createdAt || b?.created_at || 0).getTime();
      return bTime - aTime;
    });

    const whatsappMatch = byRecency.find(
      (u: any) => normalizePhoneForAccount((u?.whatsappNumber as string) || (u?.whatsapp_number as string) || "") === cleanPhone,
    );
    if (whatsappMatch) {
      return whatsappMatch;
    }

    return byRecency.find(
      (u: any) => normalizePhoneForAccount((u?.phone as string) || "") === cleanPhone,
    );
  } catch {
    return undefined;
  }
}

async function resolveLinkedUserForSession(session: ClientSession): Promise<{
  session: ClientSession;
  user?: any;
  hasConfiguredAgent: boolean;
}> {
  if (shouldForceOnboarding(session.phoneNumber)) {
    return { session, user: undefined, hasConfiguredAgent: false };
  }

  let linkedUser: any | undefined;
  if (session.userId) {
    linkedUser = await storage.getUser(session.userId).catch(() => undefined);
  }

  // Se nÃƒÂ£o encontrou pela sessÃƒÂ£o em memÃƒÂ³ria, tenta pelo estado persistido no banco
  if (!linkedUser) {
    const persistedLink = await restoreConversationLink(session.phoneNumber);
    if (persistedLink.linkedUserId) {
      linkedUser = await storage.getUser(persistedLink.linkedUserId).catch(() => undefined);
      if (linkedUser) {
        console.log(`Ã°Å¸â€™Â¾ [STATE] Restaurado vÃƒÂ­nculo persistido: user=${linkedUser.id} para ${session.phoneNumber}`);
      }
    }
  }

  if (!linkedUser) {
    linkedUser = await findUserLinkedToDeliveredTestToken(session);
  }

  if (!linkedUser) {
    linkedUser = await findUserByPhone(session.phoneNumber);
  }

  if (!linkedUser) {
    return { session, user: undefined, hasConfiguredAgent: false };
  }

  if (session.userId !== linkedUser.id || session.email !== linkedUser.email) {
    session = updateClientSession(session.phoneNumber, {
      userId: linkedUser.id,
      email: linkedUser.email || session.email,
    });
  }

  const agentConfig = await storage.getAgentConfig(linkedUser.id).catch(() => undefined);
  return {
    session,
    user: linkedUser,
    hasConfiguredAgent: Boolean(agentConfig),
  };
}

async function maybeHandleDirectConversationTurn(
  session: ClientSession,
  userMessage: string,
  linkedContext: { user?: any; hasConfiguredAgent: boolean },
  options: { hadAssistantHistory: boolean },
): Promise<{ handled: boolean; text?: string }> {
  void session;
  void userMessage;
  void linkedContext;
  void options;
  return { handled: false };
}
export async function createClientAccount(session: ClientSession): Promise<{ userId: string; success: boolean; error?: string }> {
  try {
    // Fluxo WhatsApp: email sempre canonico do numero.
    const email = generateTempEmail(session.phoneNumber);
    const cleanPhone = normalizePhoneForAccount(session.phoneNumber);
    const contactName = await resolveSessionContactName(session);
    
    // Verificar se jÃƒÆ’Ã‚Â¡ existe
    const users = await storage.getAllUsers();
    const existing = users.find(u => normalizePhoneForAccount(u.phone || "") === cleanPhone) ||
      users.find(u => (u.email || "").toLowerCase() === email.toLowerCase());
    if (existing) {
      if (shouldRefreshStoredUserName(existing.name)) {
        await storage.updateUser(existing.id, { name: contactName, phone: cleanPhone, whatsappNumber: cleanPhone });
      }
      const resolvedEmail = await ensureCanonicalEmailForUser(
        existing.id,
        String(existing.email || ""),
        email,
      );
      updateClientSession(session.phoneNumber, { userId: existing.id, email: resolvedEmail, contactName });
      return { userId: existing.id, success: true };
    }
    
    // Criar usuÃƒÆ’Ã‚Â¡rio
    const user = await storage.upsertUser({
      email: email,
      name: contactName,
      phone: cleanPhone,
      whatsappNumber: cleanPhone,
      role: "user",
    });
    
    // Criar config do agente
    if (session.agentConfig?.prompt) {
      const fullPrompt = `VocÃƒÆ’Ã‚Âª ÃƒÆ’Ã‚Â© ${session.agentConfig.name || "o atendente"}, ${session.agentConfig.role || "atendente"} da ${session.agentConfig.company || "empresa"}.

${session.agentConfig.prompt}

REGRAS:
- Seja educado e prestativo
- Respostas curtas e objetivas
- Linguagem natural
- NÃƒÆ’Ã‚Â£o invente informaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes
- IMPORTANTE: Sempre se apresente com seu nome e empresa se perguntarem quem ÃƒÆ’Ã‚Â©, para nÃƒÆ’Ã‚Â£o parecer robÃƒÆ’Ã‚Â´. Ex: "Sou o ${session.agentConfig.name || "Atendente"} da ${session.agentConfig.company || "Empresa"}".`;

      await storage.upsertAgentConfig(user.id, {
        prompt: fullPrompt,
        isActive: true,
        model: undefined, // Modelo de atendimento resolvido pelo runtime Codex vivo.
        triggerPhrases: [],
        messageSplitChars: 400,
        responseDelaySeconds: 30,
      });
    }
    
    // Conta criada no Gratis permanente; Plus libera prioridade rapida e ferramentas.
    console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã…Â  [SALES] Conta criada no Gratis permanente`);
    
    updateClientSession(session.phoneNumber, { userId: user.id, email: email, contactName });
    console.log(`ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ [SALES] Conta criada: ${email} (ID: ${user.id})`);
    
    return { userId: user.id, success: true };
  } catch (error) {
    console.error("[SALES] Erro ao criar conta:", error);
    return { userId: "", success: false, error: String(error) };
  }
}

export async function getOwnerNotificationNumber(): Promise<string> {
  const config = await storage.getSystemConfig("owner_notification_number");
  return config?.valor || "5517991956944";
}

export async function setOwnerNotificationNumber(number: string): Promise<void> {
  await storage.updateSystemConfig("owner_notification_number", number);
}

// ============================================================
// HELPERS ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â sanitizaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o e truncamento para prompts de follow-up
// ============================================================

/** Remove caracteres de controle problemÃƒÆ’Ã‚Â¡ticos (exceto \n e \t) e normaliza espaÃƒÆ’Ã‚Â§os */
function sanitizeStr(value: unknown, maxChars = 2000): string {
  if (value === null || value === undefined) return "";
  const s = String(value)
    // Remove null-bytes e outros caracteres de controle (exceto \n, \r, \t)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    // Normaliza quebras de linha
    .replace(/\r\n/g, "\n")
    .trim();
  return s.length <= maxChars ? s : s.slice(0, maxChars) + "ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦[truncado]";
}

/** Trunca histÃƒÆ’Ã‚Â³rico de mensagens para no mÃƒÆ’Ã‚Â¡ximo N mensagens e M caracteres totais */
function truncateHistory(lines: string[], maxLines = 15, maxChars = 3000): string {
  const recent = lines.slice(-maxLines);
  const joined = recent.join("\n");
  if (joined.length <= maxChars) return joined;
  // Truncar pelos ÃƒÆ’Ã‚Âºltimos maxChars caracteres (mantÃƒÆ’Ã‚Â©m fim da conversa)
  return "ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦[histÃƒÆ’Ã‚Â³rico truncado]\n" + joined.slice(-maxChars);
}

/**
 * Gera resposta de follow-up contextualizada
 */
export async function generateFollowUpResponse(phoneNumber: string, context: string): Promise<string> {
  console.warn("[FOLLOWUP] no_send: admin follow-up public text must come from structured Codex contract", {
    phoneNumber,
    contextLength: String(context || "").length,
  });
  return "";
}

/**
 * Gera resposta para contato agendado
 */
export async function generateScheduledContactResponse(phoneNumber: string, reason: string): Promise<string> {
  console.warn("[SCHEDULED-CONTACT] no_send: admin scheduled-contact public text must come from structured Codex contract", {
    phoneNumber,
    reasonLength: String(reason || "").length,
  });
  return "";
}


























