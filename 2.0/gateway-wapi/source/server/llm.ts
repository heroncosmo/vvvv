/**
 * LLM Service - Provider Abstraction Layer
 * 
 * Este módulo fornece funções para chamadas de LLM (Large Language Models)
 * Suporta: OpenRouter (primário), Groq e Mistral (fallback)
 * 
 * Configuração via system_config:
 * - llm_provider: 'openrouter' | 'groq' | 'mistral'
 * - openrouter_api_key: Chave API do OpenRouter
 * - openrouter_model: Modelo do OpenRouter (ex: 'meta-llama/llama-3.3-70b-instruct:free')
 * - groq_api_key: Chave API do Groq
 * - groq_model: Modelo do Groq (ex: 'openai/gpt-oss-20b')
 */

import { getMistralClient, invalidateMistralKeyCache } from './mistralClient';
import { getResolvedLLMConfig, invalidateResolvedLLMConfigCache } from './llmConfigResolver';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ============================================================================
// 🔄 SISTEMA DE ROTAÇÃO DE MODELOS MISTRAL (FALLBACK INTELIGENTE)
// ============================================================================
// Versão: 3.0 - Sistema de Fila Inteligente com Delay de 5 Minutos
// 
// COMPORTAMENTO:
// 1. Tenta modelos Mistral em rotação round-robin
// 2. Se todos falharem, AGUARDA e RETENTA por até 5 MINUTOS
// 3. Só após 5 minutos de falhas contínuas, faz fallback para OpenRouter/Groq
// 4. Cada modelo tem delay específico baseado no rate limit testado
// 5. Respeita a fila por canal existente (human delay)

// ============================================================================
// 🔥 MODELOS VALIDADOS POR STRESS TEST (2 MINUTOS, 4128 REQUISIÇÕES)
// ============================================================================
// Data do teste: Atualizado após benchmark agressivo
// Total testados: 40+ modelos Mistral + OpenRouter
// Resultado: APENAS 4 modelos Mistral funcionam com sucesso consistente
//
// 🥇 mistral-medium-latest - 22.6% sucesso, 10.5 req/min, delay 6s
// 🥈 mistral-medium-2312 - 13.0% sucesso, 6 req/min, delay 10s
// 🥉 mistral-medium - 12.8% sucesso, 6 req/min, delay 10s
// 4️⃣ mistral-large-2411 - 6.3% sucesso, 3 req/min, delay 20s
//
// ⛔ BLOQUEADOS (100% rate limit): mistral-small-*, open-mistral-*, 
//    ministral-*, pixtral-*, codestral-*, mistral-tiny-*
// ============================================================================

// Interface para modelos com rate limit info
interface MistralModelConfig {
  model: string;
  ratePerMinute: number;
  delaySeconds: number;
  successRate: number;
}

// 🔥 MODELOS VALIDADOS ordenados por preferência
const MISTRAL_VALIDATED_MODELS: MistralModelConfig[] = [
  { model: 'mistral-medium-latest', ratePerMinute: 10.5, delaySeconds: 6, successRate: 22.6 },
  { model: 'mistral-medium-2312', ratePerMinute: 6, delaySeconds: 10, successRate: 13.0 },
  { model: 'mistral-medium', ratePerMinute: 6, delaySeconds: 10, successRate: 12.8 },
  { model: 'mistral-large-2411', ratePerMinute: 3, delaySeconds: 20, successRate: 6.3 },
  // Tier 2 - menos testados mas podem funcionar
  { model: 'mistral-large-latest', ratePerMinute: 3, delaySeconds: 20, successRate: 5.0 },
  { model: 'mistral-large-2407', ratePerMinute: 3, delaySeconds: 20, successRate: 5.0 },
  { model: 'mistral-large-2402', ratePerMinute: 3, delaySeconds: 20, successRate: 5.0 },
];

const MISTRAL_FALLBACK_MODELS = MISTRAL_VALIDATED_MODELS.map(m => m.model);

// ============================================================================
// 🕐 SISTEMA DE TRACKING PARA DELAY DE 30 SEGUNDOS
// ============================================================================
// Quando TODOS os modelos Mistral falham, não fazemos fallback imediatamente
// Em vez disso, esperamos até 30seg tentando repetidamente antes de fallback

interface MistralQueueStatus {
  firstFailureTime: number | null;  // Timestamp da primeira falha
  totalAttempts: number;            // Total de tentativas nesta sessão
  lastAttemptTime: number;          // Timestamp da última tentativa
  roundRobinIndex: number;          // Índice atual no round-robin
}

const MISTRAL_EXTERNAL_FALLBACK_DELAY_MS = 30 * 1000; // 30 segundos antes de fallback externo (era 5min - causava retry storm)
const mistralQueueStatus: MistralQueueStatus = {
  firstFailureTime: null,
  totalAttempts: 0,
  lastAttemptTime: 0,
  roundRobinIndex: 0,
};

// ============================================================================
// 🛡️ CIRCUIT BREAKER GLOBAL - Evita tempestade de retries
// ============================================================================
// Quando muitas chamadas Mistral falham em sequência, pula direto para OpenRouter
// sem sequer tentar Mistral. Reseta após período de cooldown.
interface CircuitBreakerState {
  consecutiveFailures: number;
  lastFailureTime: number;
  isOpen: boolean; // true = circuit aberto = pular Mistral
}

const CIRCUIT_BREAKER_THRESHOLD = 5; // Após 5 falhas consecutivas, abrir circuito
const CIRCUIT_BREAKER_RESET_MS = 60 * 1000; // Tentar Mistral novamente após 60seg

const circuitBreaker: CircuitBreakerState = {
  consecutiveFailures: 0,
  lastFailureTime: 0,
  isOpen: false,
};

function isCircuitBreakerOpen(): boolean {
  if (!circuitBreaker.isOpen) return false;
  
  // Verificar se já passou tempo de reset
  const elapsed = Date.now() - circuitBreaker.lastFailureTime;
  if (elapsed >= CIRCUIT_BREAKER_RESET_MS) {
    console.log(`🔄 [CIRCUIT BREAKER] Resetando após ${Math.round(elapsed/1000)}s - tentando Mistral novamente`);
    circuitBreaker.isOpen = false;
    circuitBreaker.consecutiveFailures = 0;
    return false;
  }
  
  const remaining = Math.ceil((CIRCUIT_BREAKER_RESET_MS - elapsed) / 1000);
  console.log(`🛡️ [CIRCUIT BREAKER] ABERTO - pulando Mistral, direto para fallback (reset em ${remaining}s)`);
  return true;
}

function recordCircuitBreakerFailure(): void {
  circuitBreaker.consecutiveFailures++;
  circuitBreaker.lastFailureTime = Date.now();
  
  if (circuitBreaker.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && !circuitBreaker.isOpen) {
    circuitBreaker.isOpen = true;
    console.log(`🛡️ [CIRCUIT BREAKER] ABERTO! ${circuitBreaker.consecutiveFailures} falhas consecutivas - pulando Mistral por ${CIRCUIT_BREAKER_RESET_MS/1000}s`);
  }
}

function recordCircuitBreakerSuccess(): void {
  if (circuitBreaker.consecutiveFailures > 0) {
    console.log(`✅ [CIRCUIT BREAKER] Sucesso! Resetando contador de falhas (era ${circuitBreaker.consecutiveFailures})`);
  }
  circuitBreaker.consecutiveFailures = 0;
  circuitBreaker.isOpen = false;
}

/**
 * Verifica se já passou tempo suficiente para fazer fallback para OpenRouter/Groq
 * Retorna true se podemos fazer fallback, false se devemos continuar tentando Mistral
 */
function canFallbackToExternal(): boolean {
  if (!mistralQueueStatus.firstFailureTime) {
    return false; // Nunca falhou, não precisa fallback
  }
  
  const timeElapsed = Date.now() - mistralQueueStatus.firstFailureTime;
  const canFallback = timeElapsed >= MISTRAL_EXTERNAL_FALLBACK_DELAY_MS;
  
  if (canFallback) {
    console.log(`✅ [MISTRAL QUEUE] Passaram ${Math.round(timeElapsed/1000)}s (${Math.round(timeElapsed/60000)} min) - LIBERADO para fallback externo`);
  } else {
    const remaining = Math.ceil((MISTRAL_EXTERNAL_FALLBACK_DELAY_MS - timeElapsed) / 1000);
    console.log(`⏳ [MISTRAL QUEUE] Aguardando ${remaining}s (${Math.round(remaining/60)} min) antes de fallback externo...`);
  }
  
  return canFallback;
}

/**
 * Registra falha no sistema de fila Mistral
 */
function registerMistralFailure(): void {
  if (!mistralQueueStatus.firstFailureTime) {
    mistralQueueStatus.firstFailureTime = Date.now();
    console.log(`🚨 [MISTRAL QUEUE] Primeira falha registrada - iniciando timer de 5 minutos`);
  }
  mistralQueueStatus.totalAttempts++;
  mistralQueueStatus.lastAttemptTime = Date.now();
}

/**
 * Limpa o status da fila após sucesso (reseta o timer de 5 min)
 */
function clearMistralQueueStatus(): void {
  if (mistralQueueStatus.firstFailureTime) {
    console.log(`✅ [MISTRAL QUEUE] Fila limpa após ${mistralQueueStatus.totalAttempts} tentativas`);
  }
  mistralQueueStatus.firstFailureTime = null;
  mistralQueueStatus.totalAttempts = 0;
  mistralQueueStatus.roundRobinIndex = 0;
}

/**
 * Obtém próximo modelo no round-robin e delay recomendado
 */
function getNextMistralModelRoundRobin(): { model: string; delay: number } {
  const modelConfig = MISTRAL_VALIDATED_MODELS[mistralQueueStatus.roundRobinIndex];
  
  // Avança índice para próxima chamada
  mistralQueueStatus.roundRobinIndex = 
    (mistralQueueStatus.roundRobinIndex + 1) % MISTRAL_VALIDATED_MODELS.length;
  
  console.log(`🔄 [MISTRAL QUEUE] Round-robin: ${modelConfig.model} (delay: ${modelConfig.delaySeconds}s, rate: ${modelConfig.ratePerMinute}/min)`);
  
  return {
    model: modelConfig.model,
    delay: modelConfig.delaySeconds * 1000
  };
}

/**
 * Retorna status da fila para exibição (ex: no admin)
 */
export function getMistralQueueInfo(): {
  isInFailureMode: boolean;
  timeUntilFallback: number;
  totalAttempts: number;
  currentModelIndex: number;
  models: MistralModelConfig[];
} {
  const timeElapsed = mistralQueueStatus.firstFailureTime 
    ? Date.now() - mistralQueueStatus.firstFailureTime 
    : 0;
  const timeUntilFallback = Math.max(0, MISTRAL_EXTERNAL_FALLBACK_DELAY_MS - timeElapsed);
  
  return {
    isInFailureMode: mistralQueueStatus.firstFailureTime !== null,
    timeUntilFallback: Math.ceil(timeUntilFallback / 1000),
    totalAttempts: mistralQueueStatus.totalAttempts,
    currentModelIndex: mistralQueueStatus.roundRobinIndex,
    models: MISTRAL_VALIDATED_MODELS,
  };
}

// Tracking de cooldown por modelo (APENAS para a sessão atual)
// Cooldown curto: apenas para evitar retry imediato na mesma mensagem
interface MistralModelCooldown {
  model: string;
  cooldownUntil: number; // timestamp de quando o cooldown termina
  rateLimitCount: number; // quantas vezes foi rate limited nesta sessão
}
const mistralModelCooldowns: Map<string, MistralModelCooldown> = new Map();
const MISTRAL_MODEL_COOLDOWN_MS = 30 * 1000; // 30 segundos de cooldown (curto, pois só afeta retries imediatos)

/**
 * Limpa cooldowns expirados - chamado no início de cada nova mensagem
 * Isso garante que na próxima mensagem o modelo do admin seja tentado novamente
 */
export function clearExpiredMistralCooldowns(): void {
  const now = Date.now();
  let cleared = 0;
  for (const [model, cooldown] of mistralModelCooldowns.entries()) {
    if (cooldown.cooldownUntil < now) {
      mistralModelCooldowns.delete(model);
      cleared++;
    }
  }
  if (cleared > 0) {
    console.log(`🔄 [MISTRAL] Limpou ${cleared} cooldowns expirados`);
  }
}

/**
 * Obtém o próximo modelo Mistral disponível para fallback
 * @param preferredModel Modelo escolhido pelo admin (sempre tenta primeiro)
 * @param excludeModels Modelos que já falharam nesta mensagem (para não repetir)
 * @returns O melhor modelo disponível ou null se todos falharam
 */
function getNextAvailableMistralModel(preferredModel: string, excludeModels: string[] = []): string | null {
  const now = Date.now();
  
  // Limpar cooldowns expirados
  clearExpiredMistralCooldowns();
  
  // 1. Se o modelo preferido NÃO está na lista de exclusão, usar ele
  if (!excludeModels.includes(preferredModel)) {
    const preferredCooldown = mistralModelCooldowns.get(preferredModel);
    if (!preferredCooldown || preferredCooldown.cooldownUntil < now) {
      console.log(`✅ [MISTRAL ROTATION] Usando modelo do admin: ${preferredModel}`);
      return preferredModel;
    }
    const remainingCooldown = Math.ceil((preferredCooldown.cooldownUntil - now) / 1000);
    console.log(`⏳ [MISTRAL ROTATION] Modelo do admin ${preferredModel} em cooldown por ${remainingCooldown}s, buscando fallback...`);
  }
  
  // 2. Procurar fallback na lista de modelos econômicos
  for (const model of MISTRAL_FALLBACK_MODELS) {
    // Pular se já foi tentado nesta mensagem
    if (excludeModels.includes(model)) continue;
    
    // Pular se está em cooldown
    const cooldown = mistralModelCooldowns.get(model);
    if (cooldown && cooldown.cooldownUntil > now) continue;
    
    console.log(`🔄 [MISTRAL ROTATION] Usando fallback: ${model}`);
    return model;
  }
  
  // 3. Se todos falharam, retornar null
  console.log(`❌ [MISTRAL ROTATION] Nenhum modelo disponível! Todos em cooldown ou já tentados.`);
  return null;
}

/**
 * Marca um modelo como em cooldown após rate limit
 * O cooldown é curto para não afetar próximas mensagens
 */
function markMistralModelRateLimited(model: string): void {
  const existing = mistralModelCooldowns.get(model);
  const cooldownMultiplier = existing ? Math.min(existing.rateLimitCount + 1, 3) : 1; // Max 3x cooldown (30s, 60s, 90s)
  const cooldownMs = MISTRAL_MODEL_COOLDOWN_MS * cooldownMultiplier;
  
  mistralModelCooldowns.set(model, {
    model,
    cooldownUntil: Date.now() + cooldownMs,
    rateLimitCount: (existing?.rateLimitCount || 0) + 1
  });
  
  console.log(`🚫 [MISTRAL ROTATION] Modelo ${model} em COOLDOWN por ${cooldownMs/1000}s (rate limit #${(existing?.rateLimitCount || 0) + 1})`);
  
  // Listar modelos de fallback disponíveis
  const now = Date.now();
  const available = MISTRAL_FALLBACK_MODELS.filter(m => {
    const cd = mistralModelCooldowns.get(m);
    return !cd || cd.cooldownUntil < now;
  });
  console.log(`📊 [MISTRAL ROTATION] Fallbacks disponíveis: ${available.length > 0 ? available.join(', ') : 'NENHUM'}`);
}

/**
 * Retorna status de todos os modelos Mistral (para debug/admin)
 */
export function getMistralModelStatus(): { model: string; available: boolean; cooldownRemaining: number; rateLimitCount: number }[] {
  const now = Date.now();
  return MISTRAL_FALLBACK_MODELS.map(model => {
    const cooldown = mistralModelCooldowns.get(model);
    return {
      model,
      available: !cooldown || cooldown.cooldownUntil < now,
      cooldownRemaining: cooldown ? Math.max(0, Math.ceil((cooldown.cooldownUntil - now) / 1000)) : 0,
      rateLimitCount: cooldown?.rateLimitCount || 0
    };
  });
}

// ============================================================================
// 🔄 FUNÇÃO DE RETRY COM EXPONENTIAL BACKOFF PARA CHAMADAS DE API LLM
// ============================================================================
const LLM_MAX_RETRIES = 3;
const LLM_INITIAL_DELAY_MS = 1000;

/**
 * Executa uma operação com retry automático e exponential backoff
 * Específica para chamadas de API LLM (OpenRouter, Groq, etc)
 * 🔄 EXPORTADA para uso em outros módulos
 */
export async function withRetryLLM<T>(
  operation: () => Promise<T>,
  operationName: string = "LLM API call",
  maxRetries: number = LLM_MAX_RETRIES,
  initialDelayMs: number = LLM_INITIAL_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Log de início de cada tentativa
      console.log(`🔄 [LLM RETRY] ${operationName} - Tentativa ${attempt}/${maxRetries}...`);
      
      const result = await operation();
      
      // Log de sucesso
      if (attempt > 1) {
        console.log(`✅ [LLM RETRY] ${operationName} - SUCESSO na tentativa ${attempt}/${maxRetries}!`);
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      
      // Extrair status code do erro (pode estar em diferentes formatos)
      const statusCode = error?.status || error?.statusCode || 
                        (error?.message?.match(/error: (\d+)/)?.[1] ? parseInt(error.message.match(/error: (\d+)/)[1]) : null);
      
      // 🔄 RATE LIMIT: Lançar IMEDIATAMENTE para permitir rotação de modelos
      // A rotação é feita na função que chama (chatComplete/callMistralAPI)
      const isRateLimit = statusCode === 429 || 
                          error?.message?.toLowerCase()?.includes('rate limit') ||
                          error?.message?.toLowerCase()?.includes('too many requests');
      
      if (isRateLimit) {
        console.log(`⚡ [LLM RETRY] ${operationName} - RATE LIMIT! Lançando para rotação de modelos...`);
        throw error; // Lançar imediatamente para rotação de modelos
      }
      
      // Verificar se é um erro que vale a pena tentar novamente (exceto rate limit, já tratado acima)
      const isRetryable = 
        statusCode === 500 || // Server error
        statusCode === 502 || // Bad gateway
        statusCode === 503 || // Service unavailable
        statusCode === 504 || // Gateway timeout
        statusCode === 520 || // Cloudflare error
        statusCode === 521 || // Cloudflare error
        statusCode === 522 || // Cloudflare timeout
        statusCode === 523 || // Cloudflare error
        statusCode === 524 || // Cloudflare timeout
        error?.code === 'ECONNRESET' ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ENOTFOUND' ||
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        error?.message?.toLowerCase()?.includes('timeout') ||
        error?.message?.toLowerCase()?.includes('connection') ||
        error?.message?.toLowerCase()?.includes('overloaded') ||
        error?.message?.toLowerCase()?.includes('temporarily unavailable');
      
      if (!isRetryable || attempt === maxRetries) {
        console.error(`❌ [LLM RETRY] ${operationName} - ESGOTOU ${maxRetries} tentativas!`);
        console.error(`   └─ Erro final: ${error?.message || error}`);
        console.error(`   └─ Status: ${statusCode || 'N/A'}`);
        console.error(`   └─ Retryable: ${isRetryable ? 'SIM' : 'NÃO'}`);
        throw error;
      }
      
      // Exponential backoff para erros de servidor (500, 502, etc.)
      const jitter = Math.random() * 500; // 0-500ms de jitter
      const delay = (initialDelayMs * Math.pow(2, attempt - 1)) + jitter;
      
      console.log(`⚠️ [LLM RETRY] ${operationName} - FALHOU tentativa ${attempt}/${maxRetries}`);
      console.log(`   └─ Erro: ${error?.message || 'Unknown'}`);
      console.log(`   └─ Status: ${statusCode || 'N/A'}`);
      console.log(`   └─ Próxima tentativa em: ${Math.round(delay / 1000)}s`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error(`${operationName} falhou após ${maxRetries} tentativas`);
}

/**
 * Invalida o cache de configuração LLM
 */
export function invalidateLLMConfigCache(userId?: string): void {
  invalidateResolvedLLMConfigCache(userId);
  if (!userId) {
    invalidateMistralKeyCache();
  }
  console.log(`[LLM] Cache de configuração invalidado`);
}

/**
 * Obtém configurações de LLM do banco de dados
 * 🔄 EXPORTADA para uso em outros módulos (aiAgent.ts, testAgentService.ts)
 */
export async function getLLMConfig(userId?: string): Promise<{ 
  provider: string; 
  groqApiKey: string; 
  groqModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterProvider: string;
  mistralApiKey: string;
  mistralModel: string;
  nvidiaApiKey: string;
  nvidiaModel: string;
}> {
  const config = await getResolvedLLMConfig(userId);
  console.log(
    `[LLM] Config loaded: provider=${config.provider}, model=${
      config.provider === 'openrouter'
        ? config.openrouterModel
        : config.provider === 'groq'
          ? config.groqModel
          : config.provider === 'nvidia'
            ? config.nvidiaModel
            : config.mistralModel
    }, user=${config.resolvedUserId || 'global'}${config.usesUserOverride ? ', override=ON' : ''}`,
  );
  return config;
}

/**
 * Chama o OpenRouter API COM RETRY AUTOMÁTICO
 * Implementa exponential backoff para lidar com rate limits e erros temporários
 * Suporta provider dinâmico configurado pelo admin (ex: 'together', 'chutes', etc)
 */
async function callOpenRouterAPI(
  messages: ChatMessage[],
  apiKey: string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    openrouterProvider?: string; // Provider dinâmico (ex: 'together', 'chutes', 'hyperbolic', 'auto')
  }
): Promise<string> {
  // 🥇 google/gemma-3-4b-it:free - VALIDADO por stress test: 71.7% sucesso, 19 req/min
  const model = options?.model || 'google/gemma-3-4b-it:free';
  const providerSlug = options?.openrouterProvider || 'auto'; // auto = OpenRouter escolhe o melhor
  
  // 🎯 Só pula provider se for explicitamente 'auto' ou vazio
  const isAutoProvider = providerSlug === 'auto' || providerSlug === '';
  
  console.log(`[LLM] 🚀 Chamando OpenRouter API com modelo: ${model}, provider: ${isAutoProvider ? 'auto (OpenRouter escolhe)' : providerSlug}`);
  
  // 🔄 Usar retry automático para lidar com erros temporários
  return await withRetryLLM(async () => {
    // Construir body da requisição
    const requestBody: any = {
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 500
    };
    
    // 🎯 Adiciona provider se NÃO for 'auto'
    if (!isAutoProvider) {
      requestBody.provider = {
        order: [providerSlug],
        allow_fallbacks: true  // Permitir fallback para outros providers se necessário
      };
    }
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://agentezap.online',
        'X-Title': 'AgenteZap'
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LLM] OpenRouter API error: ${response.status} - ${errorText}`);
      // Criar erro com status para que withRetryLLM possa identificar
      const error = new Error(`OpenRouter API error: ${response.status}`) as any;
      error.status = response.status;
      error.statusCode = response.status;
      throw error;
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log(`[LLM] ✅ OpenRouter respondeu com ${content?.length || 0} caracteres (provider: ${providerSlug})`);
    return typeof content === 'string' ? content : '';
  }, `OpenRouter API (${model})`);
}

/**
 * Chama o Groq API diretamente COM RETRY AUTOMÁTICO
 * Implementa exponential backoff para lidar com rate limits e erros temporários
 */
async function callGroqAPI(
  messages: ChatMessage[],
  apiKey: string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const model = options?.model || 'openai/gpt-oss-20b';
  
  console.log(`[LLM] 🚀 Chamando Groq API com modelo: ${model}`);
  
  // 🔄 Usar retry automático para lidar com erros temporários
  return await withRetryLLM(async () => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 500,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LLM] Groq API error: ${response.status} - ${errorText}`);
      // Criar erro com status para que withRetryLLM possa identificar
      const error = new Error(`Groq API error: ${response.status}`) as any;
      error.status = response.status;
      error.statusCode = response.status;
      throw error;
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log(`[LLM] ✅ Groq respondeu com ${content?.length || 0} caracteres`);
    return typeof content === 'string' ? content : '';
  }, `Groq API (${model})`);
}

/**
 * Chama o NVIDIA NIM API COM RETRY AUTOMÁTICO
 * API OpenAI-compatible em https://integrate.api.nvidia.com/v1
 * 🆕 NVIDIA NIM - Inferência ultra-rápida com modelos otimizados
 * 
 * Modelos recomendados:
 * - nvidia/llama-3.3-nemotron-super-49b-v1 (melhor custo-benefício para chat)
 * - meta/llama-3.1-70b-instruct (multilingual, qualidade alta)
 * - meta/llama-3.1-8b-instruct (ultra rápido)
 */
async function callNvidiaAPI(
  messages: ChatMessage[],
  apiKey: string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const model = options?.model || 'nvidia/llama-3.3-nemotron-super-49b-v1';
  
  console.log(`[LLM] 🟢 Chamando NVIDIA NIM API com modelo: ${model}`);
  
  // 🔄 Usar retry automático para lidar com erros temporários
  return await withRetryLLM(async () => {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1024,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LLM] NVIDIA NIM API error: ${response.status} - ${errorText}`);
      const error = new Error(`NVIDIA NIM API error: ${response.status}`) as any;
      error.status = response.status;
      error.statusCode = response.status;
      throw error;
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log(`[LLM] ✅ NVIDIA NIM respondeu com ${content?.length || 0} caracteres`);
    return typeof content === 'string' ? content : '';
  }, `NVIDIA NIM API (${model})`);
}

/**
 * Chama o Mistral API COM ROTAÇÃO AUTOMÁTICA DE MODELOS
 * Quando um modelo atinge rate limit, rotaciona para o próximo disponível
 * 🔧 NOVA VERSÃO: Rotação inteligente entre modelos gratuitos
 */
async function callMistralAPI(
  messages: ChatMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
  }
): Promise<string> {
  const mistral = await getMistralClient(options?.userId);
  
  if (!mistral) {
    console.error('[LLM] Mistral client não disponível');
    return '';
  }
  
  // 🔄 NOVA LÓGICA: Sempre tenta o modelo do admin primeiro
  // Se falhar, usa fallback para modelos econômicos
  const adminModel = options?.model || 'mistral-small-latest';
  const triedModels: string[] = []; // Modelos já tentados nesta mensagem
  
  // Limpar cooldowns expirados no início de cada mensagem
  clearExpiredMistralCooldowns();
  
  console.log(`[LLM] 🎯 Modelo escolhido pelo admin: ${adminModel}`);
  
  // 🔄 Tentar até 15 modelos diferentes (temos 24 modelos de fallback agora)
  const maxModelAttempts = 15;
  let lastError: Error | null = null;
  
  for (let modelAttempt = 1; modelAttempt <= maxModelAttempts; modelAttempt++) {
    // Obter próximo modelo (admin primeiro, depois fallbacks)
    const currentModel = getNextAvailableMistralModel(adminModel, triedModels);
    
    if (!currentModel) {
      console.error('[LLM] ❌ Nenhum modelo Mistral disponível após tentar todos os fallbacks!');
      break;
    }
    
    triedModels.push(currentModel);
    const isAdminModel = currentModel === adminModel;
    
    console.log(`[LLM] 🚀 Chamando Mistral - Modelo: ${currentModel} ${isAdminModel ? '(ADMIN)' : '(FALLBACK)'} [${modelAttempt}/${maxModelAttempts}]`);
    
    try {
      // 🔄 Usar retry para erros temporários (mas só 1 retry para rate limit)
      const result = await withRetryLLM(async () => {
        const response = await mistral.chat.complete({
          model: currentModel!,
          messages: messages,
          temperature: options?.temperature ?? 0.7,
          maxTokens: options?.maxTokens ?? 500,
        });
        
        const content = response.choices?.[0]?.message?.content;
        console.log(`[LLM] ✅ Mistral (${currentModel}) respondeu com ${typeof content === 'string' ? content.length : 0} caracteres`);
        return typeof content === 'string' ? content : '';
      }, `Mistral API (${currentModel})`, 2, 1500); // 2 retries, 1.5s delay
      
      return result;
      
    } catch (error: any) {
      lastError = error;
      
      // Verificar se é rate limit
      const isRateLimit = error?.status === 429 || 
                          error?.statusCode === 429 ||
                          error?.message?.toLowerCase()?.includes('rate limit') ||
                          error?.message?.toLowerCase()?.includes('too many requests');
      
      if (isRateLimit) {
        console.log(`⚠️ [LLM] Rate limit no modelo ${currentModel} - buscando fallback...`);
        markMistralModelRateLimited(currentModel);
        continue; // Tentar próximo modelo na lista de fallback
      }
      
      // Se não for rate limit, propagar erro (não adianta tentar outro modelo)
      console.error(`❌ [LLM] Erro não-recuperável no Mistral (${currentModel}): ${error?.message || error}`);
      throw error;
    }
  }
  
  console.error(`❌ [LLM] Todos os ${triedModels.length} modelos Mistral falharam! Tentados: ${triedModels.join(', ')}`);
  throw lastError || new Error('Todos os modelos Mistral falharam');
}

/**
 * Função principal de chamada LLM - usa provider configurado
 */
export async function callGroq(
  messages: ChatMessage[] | string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
  }
): Promise<string> {
  try {
    // ✅ Suportar tanto array de ChatMessage quanto string simples
    const formattedMessages: ChatMessage[] = typeof messages === 'string' 
      ? [{ role: 'user' as const, content: messages }]
      : messages;
    
    // Obter configuração do provider
    const config = await getLLMConfig(options?.userId);
    
    // Se provider é OpenRouter e tem API key válida
    if (config.provider === 'openrouter' && config.openrouterApiKey && config.openrouterApiKey.length > 20) {
      try {
        return await callOpenRouterAPI(formattedMessages, config.openrouterApiKey, {
          ...options,
          model: options?.model || config.openrouterModel,
          openrouterProvider: config.openrouterProvider // 🎯 Provider dinâmico!
        });
      } catch (openrouterError) {
        console.error('[LLM] Erro no OpenRouter, tentando fallback para Groq:', openrouterError);
        // Fallback para Groq em caso de erro
        if (config.groqApiKey && config.groqApiKey.length > 20) {
          return await callGroqAPI(formattedMessages, config.groqApiKey, {
            ...options,
            model: options?.model || config.groqModel
          });
        }
      }
    }
    
    // Se provider é NVIDIA NIM e tem API key válida
    if (config.provider === 'nvidia' && config.nvidiaApiKey && config.nvidiaApiKey.length > 20) {
      try {
        return await callNvidiaAPI(formattedMessages, config.nvidiaApiKey, {
          ...options,
          model: options?.model || config.nvidiaModel
        });
      } catch (nvidiaError) {
        console.error('[LLM] Erro no NVIDIA NIM, tentando fallback para OpenRouter:', nvidiaError);
        // Fallback para OpenRouter
        if (config.openrouterApiKey && config.openrouterApiKey.length > 20) {
          return await callOpenRouterAPI(formattedMessages, config.openrouterApiKey, {
            ...options,
            model: options?.model || config.openrouterModel,
            openrouterProvider: config.openrouterProvider
          });
        }
        // Fallback para Groq
        if (config.groqApiKey && config.groqApiKey.length > 20) {
          return await callGroqAPI(formattedMessages, config.groqApiKey, {
            ...options,
            model: options?.model || config.groqModel
          });
        }
      }
    }
    
    // Se provider é Groq e tem API key válida
    if (config.provider === 'groq' && config.groqApiKey && config.groqApiKey.length > 20) {
      try {
        return await callGroqAPI(formattedMessages, config.groqApiKey, {
          ...options,
          model: options?.model || config.groqModel
        });
      } catch (groqError) {
        console.error('[LLM] Erro no Groq, tentando fallback para Mistral:', groqError);
        // Fallback para Mistral em caso de erro
        return await callMistralAPI(formattedMessages, options);
      }
    }
    
    // Default: usar Mistral
    return await callMistralAPI(formattedMessages, options);
  } catch (error) {
    console.error('[LLM] Erro ao chamar LLM:', error);
    return '';
  }
}

/**
 * Função para obter o provider atual (para logs/debug)
 */
export async function getCurrentProvider(userId?: string): Promise<string> {
  const config = await getLLMConfig(userId);
  return config.provider;
}

/**
 * Interface compatível com resposta do Mistral
 */
export interface LLMChatResponse {
  choices: Array<{
    message: {
      content: string | null;
    };
    finishReason?: string;
  }>;
}

/**
 * Função de chat completo - substitui getMistralClient().chat.complete()
 * Usa o provider configurado (OpenRouter, Groq ou Mistral)
 * 🔄 COM RETRY AUTOMÁTICO para lidar com rate limits e erros temporários
 */
export async function chatComplete(params: {
  model?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  randomSeed?: number;
  skipMistralQueue?: boolean;
  userId?: string;
}): Promise<LLMChatResponse> {
  const config = await getLLMConfig(params.userId);
  
  // 🔐 VERIFICAÇÃO DE API KEY - Verificar se pelo menos UM provider tem chave configurada
  const hasOpenRouterKey = config.openrouterApiKey && config.openrouterApiKey.length > 20;
  const hasGroqKey = config.groqApiKey && config.groqApiKey.length > 20;
  // 🔧 CORRIGIDO: Verificar Mistral key do banco de dados OU variável de ambiente
  const hasMistralKey = (config.mistralApiKey && config.mistralApiKey.length > 10) || (!!process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.length > 10);
  // 🆕 NVIDIA NIM key
  const hasNvidiaKey = config.nvidiaApiKey && config.nvidiaApiKey.length > 20;
  
  if (!hasOpenRouterKey && !hasGroqKey && !hasMistralKey && !hasNvidiaKey) {
    console.error('❌ [LLM] ERRO: Nenhuma API key configurada!');
    console.error('   └─ Configure uma chave em: Admin → Configurações → Provedor de IA');
    console.error('   └─ Provider atual: ' + config.provider);
    throw new Error('API key não configurada. Configure uma chave de API em: Admin → Configurações → Provedor de IA (LLM)');
  }
  
  // 🆕 Se provider é NVIDIA NIM e tem API key válida
  if (config.provider === 'nvidia' && hasNvidiaKey) {
    try {
      const model = config.nvidiaModel || 'nvidia/llama-3.3-nemotron-super-49b-v1';
      console.log(`[LLM] 🟢 chatComplete via NVIDIA NIM com modelo: ${model}`);
      
      const data = await withRetryLLM(async () => {
        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.nvidiaApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: params.messages,
            max_tokens: params.maxTokens ?? 1024,
            temperature: params.temperature ?? 0.7,
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[LLM] NVIDIA NIM API error: ${response.status} - ${errorText}`);
          const error = new Error(`NVIDIA NIM API error: ${response.status}`) as any;
          error.status = response.status;
          error.statusCode = response.status;
          throw error;
        }
        
        return await response.json();
      }, `NVIDIA NIM chatComplete (${model})`);
      
      const responseContent = data.choices?.[0]?.message?.content;
      const promptTokens = data.usage?.prompt_tokens;
      const completionTokens = data.usage?.completion_tokens;
      
      console.log(`[LLM] ✅ NVIDIA NIM chatComplete respondeu`);
      console.log(`[LLM] 📊 Tokens: prompt=${promptTokens || 'N/A'}, completion=${completionTokens || 'N/A'}`);
      console.log(`[LLM] 📊 Response length: ${responseContent?.length || 0} chars`);
      
      return {
        choices: data.choices?.map((c: any) => ({
          message: { content: c.message?.content ?? null },
          finishReason: c.finish_reason
        })) || []
      };
    } catch (nvidiaError: any) {
      console.error('═══════════════════════════════════════════════════════════════');
      console.error('🔄 [LLM FALLBACK] NVIDIA NIM FALHOU!');
      console.error(`   └─ Erro: ${nvidiaError?.message || nvidiaError}`);
      console.error('🔄 [LLM FALLBACK] Tentando fallback para OpenRouter/Groq/Mistral...');
      console.error('═══════════════════════════════════════════════════════════════');
      // Cai para os fallbacks abaixo
    }
  }
  
  // 🎯 Se provider é Mistral e tem API key válida - USAR COM ROTAÇÃO DE MODELOS
  // 🛡️ CIRCUIT BREAKER: Se Mistral está falhando muito, pular direto para fallback
  if (config.provider === 'mistral' && hasMistralKey && !isCircuitBreakerOpen()) {
    const adminModel = config.mistralModel || 'mistral-small-latest';
    const triedModels: string[] = []; // Modelos já tentados nesta mensagem
    
    // Limpar cooldowns expirados no início de cada mensagem
    clearExpiredMistralCooldowns();
    
    console.log(`[LLM] 🎯 chatComplete via Mistral - Modelo do admin: ${adminModel}`);
    
    // 🔄 Tentar até 5 modelos diferentes (reduzido de 15 para evitar retry storm)
    const maxModelAttempts = 5;
    let lastMistralError: Error | null = null;
    
    for (let modelAttempt = 1; modelAttempt <= maxModelAttempts; modelAttempt++) {
      // Obter próximo modelo (admin primeiro, depois fallbacks)
      const currentModel = getNextAvailableMistralModel(adminModel, triedModels);
      
      if (!currentModel) {
        console.log(`⚠️ [LLM] Nenhum modelo Mistral disponível, tentando fallback para outros providers...`);
        break; // Sair do loop e tentar OpenRouter/Groq
      }
      
      triedModels.push(currentModel);
      const isAdminModel = currentModel === adminModel;
      
      console.log(`[LLM] 🚀 Mistral chatComplete - Modelo: ${currentModel} ${isAdminModel ? '(ADMIN)' : '(FALLBACK)'} [${modelAttempt}/${maxModelAttempts}]`);
      
      try {
        const mistral = await getMistralClient(params.userId);
        
        // 🔄 Usar retry para erros temporários (1 retry por modelo - reduzido de 2 para evitar storm)
        const mistralResponse = await withRetryLLM(async () => {
          return await mistral.chat.complete({
            model: currentModel,
            messages: params.messages as any,
            maxTokens: params.maxTokens ?? 500,
            temperature: params.temperature ?? 0.7,
            randomSeed: params.randomSeed,
          });
        }, `Mistral chatComplete (${currentModel})`, 1, 1500);
        
        console.log(`[LLM] ✅ Mistral chatComplete (${currentModel}) respondeu`);
        
        // ✅ SUCESSO! Limpar status da fila de falhas
        clearMistralQueueStatus();
        recordCircuitBreakerSuccess();
        
        return {
          choices: mistralResponse.choices?.map((c: any) => ({
            message: { content: c.message?.content ?? null },
            finishReason: c.finishReason
          })) || []
        };
        
      } catch (mistralError: any) {
        lastMistralError = mistralError;
        
        // Verificar se é rate limit
        const isRateLimit = mistralError?.status === 429 || 
                            mistralError?.statusCode === 429 ||
                            mistralError?.message?.toLowerCase()?.includes('rate limit') ||
                            mistralError?.message?.toLowerCase()?.includes('too many requests');
        
        if (isRateLimit) {
          console.log(`⚠️ [LLM] Rate limit no modelo ${currentModel} - buscando fallback...`);
          markMistralModelRateLimited(currentModel);
          continue; // Tentar próximo modelo
        }
        
        // Se não for rate limit, logar e continuar para fallback de provider
        console.error(`❌ [LLM] Erro no Mistral (${currentModel}): ${mistralError?.message || mistralError}`);
        break; // Sair do loop e tentar OpenRouter/Groq
      }
    }
    
    // Se chegou aqui, todos os modelos Mistral falharam
    console.error('═══════════════════════════════════════════════════════════════');
    console.error(`🔄 [LLM FALLBACK] Mistral FALHOU após tentar ${triedModels.length} modelos: ${triedModels.join(', ')}`);
    
    // 🛡️ CIRCUIT BREAKER + Registrar falha
    recordCircuitBreakerFailure();
    registerMistralFailure();
    
    // 🕐 VERIFICAR SE PASSARAM 5 MINUTOS - Se não, AGUARDA e RETENTA Mistral
    if (!params.skipMistralQueue && !canFallbackToExternal()) {
      // Obter próximo modelo no round-robin com delay apropriado
      const { model: nextModel, delay } = getNextMistralModelRoundRobin();
      
      console.log(`⏳ [LLM QUEUE] Aguardando ${delay/1000}s antes de retentar ${nextModel}...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Retentar com o próximo modelo do round-robin
      try {
        const mistral = await getMistralClient(params.userId);
        const retryResponse = await mistral.chat.complete({
          model: nextModel,
          messages: params.messages as any,
          maxTokens: params.maxTokens ?? 500,
          temperature: params.temperature ?? 0.7,
          randomSeed: params.randomSeed,
        });
        
        console.log(`[LLM] ✅ Mistral (${nextModel}) respondeu após aguardar delay!`);
        clearMistralQueueStatus(); // Sucesso! Limpar fila
        recordCircuitBreakerSuccess();
        
        return {
          choices: retryResponse.choices?.map((c: any) => ({
            message: { content: c.message?.content ?? null },
            finishReason: c.finishReason
          })) || []
        };
      } catch (retryError: any) {
        console.log(`⚠️ [LLM QUEUE] ${nextModel} falhou novamente, continuando tentativas...`);
        markMistralModelRateLimited(nextModel);
        // Não fazer fallback ainda - deixar próxima chamada tentar novamente
        throw new Error(`Mistral em rate limit - aguardando fila (${getMistralQueueInfo().timeUntilFallback}s restantes para fallback)`);
      }
    }
    
    if (params.skipMistralQueue) {
      console.log(`⚡ [LLM QUEUE] skipMistralQueue=true - liberando fallback externo imediato`);
    } else {
      console.log(`✅ [LLM QUEUE] 5 minutos atingidos - liberando fallback para NVIDIA/OpenRouter/Groq`);
    }
    clearMistralQueueStatus(); // Limpar status para próxima sessão
    
    // 🆕 Tentar fallback para NVIDIA NIM PRIMEIRO (mais rápido)
    if (hasNvidiaKey) {
      console.error('🔄 [LLM FALLBACK] Tentando NVIDIA NIM como fallback (ultra-rápido)...');
      console.error('═══════════════════════════════════════════════════════════════');
      
      try {
        const nvidiaFallbackModel = config.nvidiaModel || 'nvidia/llama-3.3-nemotron-super-49b-v1';
        console.log(`[LLM] 🆘 NVIDIA NIM FALLBACK - Modelo: ${nvidiaFallbackModel}`);
        
        const nvidiaFallbackResponse = await withRetryLLM(async () => {
          const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.nvidiaApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: nvidiaFallbackModel,
              messages: params.messages,
              max_tokens: params.maxTokens ?? 1024,
              temperature: params.temperature ?? 0.7,
            }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[LLM] NVIDIA NIM FALLBACK error: ${response.status} - ${errorText}`);
            const error = new Error(`NVIDIA NIM FALLBACK error: ${response.status}`) as any;
            error.status = response.status;
            throw error;
          }
          
          return await response.json();
        }, `NVIDIA NIM FALLBACK (${nvidiaFallbackModel})`, 2, 1500);
        
        console.log(`[LLM] ✅ NVIDIA NIM FALLBACK respondeu com sucesso!`);
        return {
          choices: nvidiaFallbackResponse.choices?.map((c: any) => ({
            message: { content: c.message?.content ?? null },
            finishReason: c.finish_reason
          })) || []
        };
      } catch (nvidiaFallbackError: any) {
        console.error(`❌ [LLM] NVIDIA NIM FALLBACK também falhou: ${nvidiaFallbackError?.message}`);
        // Continua para tentar OpenRouter
      }
    }
    
    // 🔄 Tentar fallback para OpenRouter
    if (hasOpenRouterKey) {
      console.error('🔄 [LLM FALLBACK] Tentando OpenRouter como fallback...');
      console.error('═══════════════════════════════════════════════════════════════');
      
      try {
        // ✅ EXECUTAR OpenRouter imediatamente como fallback
        // 🥇 google/gemma-3-4b-it:free - VALIDADO: 71.7% sucesso, 19 req/min
        const fallbackModel = config.openrouterModel || 'google/gemma-3-4b-it:free';
        console.log(`[LLM] 🆘 OpenRouter FALLBACK - Modelo: ${fallbackModel}`);
        
        const fallbackResponse = await withRetryLLM(async () => {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.openrouterApiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://agentezap.online',
              'X-Title': 'AgenteZap'
            },
            body: JSON.stringify({
              model: fallbackModel,
              messages: params.messages,
              max_tokens: params.maxTokens ?? 500,
              temperature: params.temperature ?? 0.7,
            }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[LLM] OpenRouter FALLBACK error: ${response.status} - ${errorText}`);
            const error = new Error(`OpenRouter FALLBACK error: ${response.status}`) as any;
            error.status = response.status;
            throw error;
          }
          
          return await response.json();
        }, `OpenRouter FALLBACK (${fallbackModel})`, 3, 2000);
        
        console.log(`[LLM] ✅ OpenRouter FALLBACK respondeu com sucesso!`);
        return {
          choices: fallbackResponse.choices?.map((c: any) => ({
            message: { content: c.message?.content ?? null },
            finishReason: c.finish_reason
          })) || []
        };
      } catch (openrouterFallbackError: any) {
        console.error(`❌ [LLM] OpenRouter FALLBACK também falhou: ${openrouterFallbackError?.message}`);
        // Continua para tentar Groq
      }
    }
    
    // 🔄 Tentar fallback para OpenRouter com mistral-nemo (substituiu Groq)
    if (hasOpenRouterKey) {
      console.error('🔄 [LLM FALLBACK] Tentando OpenRouter (mistral-nemo) como último fallback...');
      console.error('═══════════════════════════════════════════════════════════════');
      
      try {
        const fallbackModel = 'mistralai/mistral-nemo';
        console.log(`[LLM] 🆘 OpenRouter mistral-nemo FALLBACK - Modelo: ${fallbackModel}`);
        
        const nemoFallbackResponse = await withRetryLLM(async () => {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.openrouterApiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://agentezap.online',
              'X-Title': 'AgenteZap'
            },
            body: JSON.stringify({
              model: fallbackModel,
              messages: params.messages,
              max_tokens: params.maxTokens ?? 500,
              temperature: params.temperature ?? 0.7,
            }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[LLM] OpenRouter mistral-nemo FALLBACK error: ${response.status} - ${errorText}`);
            const error = new Error(`OpenRouter mistral-nemo FALLBACK error: ${response.status}`) as any;
            error.status = response.status;
            throw error;
          }
          
          return await response.json();
        }, `OpenRouter mistral-nemo FALLBACK`, 3, 2000);
        
        console.log(`[LLM] ✅ OpenRouter mistral-nemo FALLBACK respondeu!`);
        return {
          choices: nemoFallbackResponse.choices?.map((c: any) => ({
            message: { content: c.message?.content ?? null },
            finishReason: c.finish_reason
          })) || []
        };
      } catch (nemoFallbackError: any) {
        console.error(`❌ [LLM] OpenRouter mistral-nemo FALLBACK também falhou: ${nemoFallbackError?.message}`);
      }
    }
    
    // ❌ Todos os fallbacks falharam
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ [LLM] TODOS OS PROVIDERS FALHARAM!');
    console.error('   └─ Mistral: Todos os modelos em rate limit');
    console.error('   └─ NVIDIA NIM: ' + (hasNvidiaKey ? 'Falhou' : 'Não configurado'));
    console.error('   └─ OpenRouter: ' + (hasOpenRouterKey ? 'Falhou' : 'Não configurado'));
    console.error('   └─ OpenRouter (mistral-nemo): ' + (hasOpenRouterKey ? 'Falhou' : 'Não configurado'));
    console.error('═══════════════════════════════════════════════════════════════');
    throw lastMistralError || new Error('Todos os provedores de LLM falharam');
  }
  
  // Se provider é OpenRouter e tem API key válida (usado quando provider=openrouter)
  if (config.provider === 'openrouter' && config.openrouterApiKey && config.openrouterApiKey.length > 20) {
    try {
      // SEMPRE usar o modelo do OpenRouter configurado no admin
      // Ignorar o params.model pois pode ser um modelo do Mistral (ex: mistral-small-latest)
      const model = config.openrouterModel;
      
      // 🎯 PROVIDER: usar 'auto' para OpenRouter decidir o melhor
      // google/gemma-3-4b-it:free validado por stress test com 71.7% sucesso
      const modelToProviderMap: Record<string, string> = {
        'google/gemma-3-4b-it:free': 'auto',  // Validado: 71.7% sucesso
        'google/gemma-3-4b-it': 'auto',
        'google/gemma-3n-e4b-it': 'together',
        'google/gemma-3n-e2b-it': 'together',
        'google/gemma-3n-e4b-it:free': 'together',
        'google/gemma-3n-e2b-it:free': 'together',
      };
      
      // Usar provider específico do modelo, ou 'auto' para deixar OpenRouter decidir
      const autoProvider = modelToProviderMap[model] || 'auto';
      const configuredProvider = config.openrouterProvider || 'auto';
      
      // Se o modelo precisa de provider específico, usar esse; senão, usar o configurado
      const providerSlug = autoProvider !== 'auto' ? autoProvider : configuredProvider;
      
      console.log(`[LLM] 🚀 chatComplete via OpenRouter com modelo: ${model}, provider: ${providerSlug} (auto-detected: ${autoProvider}, configured: ${configuredProvider})`);
      
      // 🔄 Usar retry automático para lidar com erros temporários
      const data = await withRetryLLM(async () => {
        // 🎯 Construir body da requisição
        // Se provider é 'auto', NÃO incluir campo provider (OpenRouter decide)
        // Se provider é específico, incluir com allow_fallbacks: true
        const requestBody: any = {
          model,
          messages: params.messages,
          max_tokens: params.maxTokens ?? 500,
          temperature: params.temperature ?? 0.7,
        };
        
        // Só adicionar provider se NÃO for 'auto'
        if (providerSlug !== 'auto') {
          requestBody.provider = {
            order: [providerSlug],
            allow_fallbacks: true  // ✅ Permitir fallback se provider não tiver o modelo
          };
        }
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.openrouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://agentezap.online',
            'X-Title': 'AgenteZap'
          },
          body: JSON.stringify(requestBody),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[LLM] OpenRouter API error: ${response.status} - ${errorText}`);
          // Criar erro com status para que withRetryLLM possa identificar
          const error = new Error(`OpenRouter API error: ${response.status}`) as any;
          error.status = response.status;
          error.statusCode = response.status;
          throw error;
        }
        
        return await response.json();
      }, `OpenRouter chatComplete (${model} via ${providerSlug})`);
      
      // 🔍 DEBUG: Log detalhado da resposta do OpenRouter
      const responseContent = data.choices?.[0]?.message?.content;
      const finishReason = data.choices?.[0]?.finish_reason;
      const promptTokens = data.usage?.prompt_tokens;
      const completionTokens = data.usage?.completion_tokens;
      
      console.log(`[LLM] ✅ OpenRouter chatComplete respondeu (provider: ${providerSlug})`);
      console.log(`[LLM] 📊 Tokens: prompt=${promptTokens || 'N/A'}, completion=${completionTokens || 'N/A'}`);
      console.log(`[LLM] 📊 finish_reason: ${finishReason || 'N/A'}`);
      console.log(`[LLM] 📊 Response length: ${responseContent?.length || 0} chars`);
      
      if (!responseContent || responseContent.length === 0) {
        console.warn(`[LLM] ⚠️ RESPOSTA VAZIA do OpenRouter! finish_reason=${finishReason}`);
        console.warn(`[LLM] ⚠️ Full response: ${JSON.stringify(data).substring(0, 500)}`);
      } else {
        console.log(`[LLM] 📝 Response preview: "${responseContent.substring(0, 100)}..."`);
      }
      
      return {
        choices: data.choices?.map((c: any) => ({
          message: { content: c.message?.content ?? null },
          finishReason: c.finish_reason
        })) || []
      };
    } catch (openrouterError: any) {
      console.error('═══════════════════════════════════════════════════════════════');
      console.error('🔄 [LLM FALLBACK] OpenRouter FALHOU após 3 tentativas!');
      console.error(`   └─ Erro: ${openrouterError?.message || openrouterError}`);
      console.error('🔄 [LLM FALLBACK] Tentando NVIDIA NIM antes do Groq...');
      console.error('═══════════════════════════════════════════════════════════════');
      
      // 🔄 Tentar NVIDIA NIM antes do Groq
      if (hasNvidiaKey) {
        try {
          const nvidiaModel = config.nvidiaModel || 'nvidia/llama-3.3-nemotron-super-49b-v1';
          console.log(`[LLM] 🔄 NVIDIA NIM fallback (após OpenRouter falhar) com modelo: ${nvidiaModel}`);
          const nvidiaContent = await callNvidiaAPI(
            params.messages as ChatMessage[],
            config.nvidiaApiKey!,
            {
              model: nvidiaModel,
              maxTokens: params.maxTokens ?? 500,
              temperature: params.temperature ?? 0.7
            }
          );
          
          console.log(`[LLM] ✅ NVIDIA NIM respondeu como fallback do OpenRouter!`);
          return {
            choices: [{
              message: { content: nvidiaContent },
              finishReason: 'stop' as const
            }]
          };
        } catch (nvidiaFallbackError: any) {
          console.error(`[LLM] ❌ NVIDIA NIM fallback também falhou: ${nvidiaFallbackError?.message}`);
        }
      }
      // Continua para tentar Groq
    }
  }
  
  // 🔄 Último fallback: OpenRouter com mistralai/mistral-nemo (substituiu Groq)
  if ((config.provider === 'groq' || config.provider === 'openrouter' || config.provider === 'nvidia' || config.provider === 'mistral') && config.openrouterApiKey && config.openrouterApiKey.length > 20) {
    try {
      const lastResortModel = 'mistralai/mistral-nemo';
      console.log(`[LLM] 🚀 chatComplete via OpenRouter (último recurso) com modelo: ${lastResortModel}`);
      
      const data = await withRetryLLM(async () => {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.openrouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://agentezap.online',
            'X-Title': 'AgenteZap'
          },
          body: JSON.stringify({
            model: lastResortModel,
            messages: params.messages,
            max_tokens: params.maxTokens ?? 500,
            temperature: params.temperature ?? 0.7,
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[LLM] OpenRouter (mistral-nemo) API error: ${response.status} - ${errorText}`);
          const error = new Error(`OpenRouter (mistral-nemo) API error: ${response.status}`) as any;
          error.status = response.status;
          error.statusCode = response.status;
          throw error;
        }
        
        return await response.json();
      }, `OpenRouter mistral-nemo (último recurso)`);
      
      console.log(`[LLM] ✅ OpenRouter mistral-nemo respondeu como último recurso`);
      
      return {
        choices: data.choices?.map((c: any) => ({
          message: { content: c.message?.content ?? null },
          finishReason: c.finish_reason
        })) || []
      };
    } catch (lastResortError: any) {
      console.error('═══════════════════════════════════════════════════════════════');
      console.error('🔄 [LLM FALLBACK] OpenRouter mistral-nemo FALHOU!');
      console.error(`   └─ Erro: ${lastResortError?.message || lastResortError}`);
      console.error('🔄 [LLM FALLBACK] Tentando Mistral como último recurso absoluto...');
      console.error('═══════════════════════════════════════════════════════════════');
    }
  }
  
  // Fallback para Mistral (ÚLTIMO RECURSO - após OpenRouter e Groq falharem)
  console.log('🆘 [LLM FALLBACK FINAL] Usando Mistral como último recurso!');
  const mistralModel = config.mistralModel || 'mistral-small-latest';
  console.log(`[LLM] 🚀 chatComplete via Mistral (fallback) com modelo: ${mistralModel}`);
  const mistral = await getMistralClient(params.userId);
  
  // 🔄 Usar retry automático mesmo no fallback (delay maior: 2s)
  const mistralResponse = await withRetryLLM(async () => {
    return await mistral.chat.complete({
      model: mistralModel, // Usar modelo configurado no admin
      messages: params.messages as any,
      maxTokens: params.maxTokens ?? 500,
      temperature: params.temperature ?? 0.7,
      randomSeed: params.randomSeed,
    });
  }, `Mistral fallback (${mistralModel})`, 3, 2000);
  
  console.log(`[LLM] ✅ Mistral chatComplete respondeu`);
  
  return {
    choices: mistralResponse.choices?.map((c: any) => ({
      message: { content: c.message?.content ?? null },
      finishReason: c.finishReason
    })) || []
  };
}

/**
 * Objeto wrapper que simula interface do getMistralClient()
 * Permite usar: const client = await getLLMClient(); client.chat.complete(...)
 */
export async function getLLMClient(userId?: string) {
  return {
    chat: {
      complete: (params: Parameters<typeof chatComplete>[0]) =>
        chatComplete({
          ...params,
          userId: params?.userId || userId,
        }),
    }
  };
}

/**
 * Gera texto usando o LLM configurado (Groq ou Mistral)
 * Substitui generateWithMistral para usar o provider configurado no admin
 */
export async function generateWithLLM(
  systemPrompt: string,
  userMessage: string,
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    userId?: string;
  }
): Promise<string> {
  try {
    const response = await chatComplete({
      model: options?.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      maxTokens: options?.maxTokens || 500,
      temperature: options?.temperature ?? 0.7,
      userId: options?.userId,
    });
    
    if (!response || !response.choices || response.choices.length === 0) {
      throw new Error("No response from LLM");
    }
    
    return (response.choices[0].message.content as string) || "";
  } catch (error: any) {
    console.error("[LLM] Error generating text:", error);
    throw new Error(`Failed to generate text: ${error.message}`);
  }
}

// ==================== MEDIA CLASSIFICATION ====================

/**
 * Tipos para classificação de mídia
 */
export interface MediaClassificationInput {
  clientMessage: string;
  conversationHistory: Array<{ text: string; fromMe: boolean }>;
  mediaLibrary: Array<{ 
    name: string; 
    type: string; 
    whenToUse?: string;
    isActive?: boolean;
  }>;
  sentMedias?: string[];
  /** Texto da resposta da IA principal (quando ela mencionou enviar mídia mas esqueceu a tag) */
  aiResponseText?: string;
}

export interface MediaClassificationResult {
  shouldSend: boolean;
  mediaName: string | null;
  confidence: number;
  reason: string;
}

/**
 * Classifica qual mídia deve ser enviada baseado na conversa
 * Usa o LLM configurado (Groq ou Mistral)
 */
export async function classifyMediaWithLLM(
  input: MediaClassificationInput
): Promise<MediaClassificationResult> {
  const startTime = Date.now();
  
  try {
    console.log(`\n🤖 [MEDIA AI] ════════════════════════════════════════════════`);
    console.log(`🤖 [MEDIA AI] Iniciando classificação de mídia com LLM...`);
    
    const { clientMessage, conversationHistory, mediaLibrary, sentMedias = [], aiResponseText } = input;
    
    // Filtrar mídias já enviadas e inativas
    const availableMedia = mediaLibrary.filter(m => {
      const alreadySent = sentMedias.some(sent => sent.toUpperCase() === m.name.toUpperCase());
      return !alreadySent && m.isActive !== false;
    });
    
    if (availableMedia.length === 0) {
      console.log(`🤖 [MEDIA AI] ❌ Nenhuma mídia disponível`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Nenhuma mídia disponível' };
    }
    
    // 🔍 Detectar se a IA principal expressou intenção de enviar mídia
    const aiIntendedToSendMedia = aiResponseText ? detectMediaSendingIntent(aiResponseText) : false;
    if (aiIntendedToSendMedia) {
      console.log(`🤖 [MEDIA AI] 🎯 IA principal EXPRESSOU INTENÇÃO de enviar mídia na resposta!`);
      console.log(`🤖 [MEDIA AI] 💬 Resposta IA: "${aiResponseText!.substring(0, 150)}..."`);
    }
    
    // Detectar se é primeira mensagem
    const clientMsgCount = conversationHistory.filter(m => !m.fromMe).length;
    const isFirstMessage = clientMsgCount <= 1;
    
    // Formatar histórico recente (últimas 5 mensagens)
    const recentHistory = conversationHistory
      .slice(-10)
      .map(m => `${m.fromMe ? 'Agente' : 'Cliente'}: ${m.text || '(sem texto)'}`)
      .join('\n');
    
    // Formatar biblioteca de mídia
    const mediaListForAI = availableMedia
      .map((m, i) => `${i + 1}. NOME: "${m.name}" | TIPO: ${m.type} | QUANDO USAR: ${m.whenToUse || 'não especificado'}`)
      .join('\n');
    
    // Prompt de classificação
    const systemPrompt = `Você é um sistema de classificação de mídia para um chatbot de WhatsApp.
Sua tarefa é analisar a conversa e decidir SE e QUAL mídia deve ser enviada ao cliente.

## REGRAS IMPORTANTES:
1. A MENSAGEM ATUAL DO CLIENTE tem prioridade total sobre o histórico anterior.
2. Se a mensagem atual for sobre Pix, chave Pix, QR Code, comprovante, endereço, localização, mapa, horário ou funcionamento, só recomende mídia se existir uma mídia claramente feita para esse assunto atual.
3. Se a mensagem atual for sobre tema, catálogo, produto, foto, arte ou outro item, NUNCA use uma mídia operacional como Pix, endereço, mapa ou horário como substituto.
4. Se a IA principal disser que o tema/produto não está cadastrado, não foi encontrado ou depende de atendimento humano, responda NO_MEDIA em vez de escolher uma mídia aleatória.
5. Se nenhuma mídia for claramente apropriada para o assunto atual, responda NO_MEDIA.
6. Se for PRIMEIRA MENSAGEM do cliente (saudação como "oi", "olá", "bom dia"), procure por mídia de boas-vindas/início.
7. Apenas recomende mídia se for CLARAMENTE RELEVANTE para o contexto.
8. NÃO recomende mídia se o cliente estiver fazendo perguntas específicas que não precisam de mídia.
9. Leia o campo "QUANDO USAR" de cada mídia para entender quando é apropriado enviar.
10. Confiança deve ser entre 0-100 (apenas envie se > 60).
${aiIntendedToSendMedia ? `
## 🚨 CONTEXTO CRÍTICO: A IA PRINCIPAL JÁ DECIDIU ENVIAR MÍDIA!
A IA que gerou a resposta ao cliente JÁ EXPRESSOU INTENÇÃO de enviar mídia.
Ela disse algo como "vou te enviar", "segue o vídeo", "aqui está o áudio", etc.
Portanto, você DEVE encontrar a mídia mais adequada para enviar.
NÃO responda NO_MEDIA a menos que NENHUMA mídia seja claramente relevante para o assunto atual.
A prioridade continua sendo o assunto da mensagem atual. Se a IA principal falou em mídia, mas a biblioteca disponível não combina com o assunto atual, responda NO_MEDIA.
A confiança mínima DEVE ser 70+ quando a IA já decidiu enviar.
` : ''}
## RESPONDA APENAS EM JSON:
{"decision": "SEND" ou "NO_MEDIA", "mediaName": "NOME_EXATO_DA_MIDIA" ou null, "confidence": 0-100, "reason": "explicação breve"}`;

    const userPrompt = `## CONTEXTO:
É a primeira mensagem do cliente? ${isFirstMessage ? 'SIM' : 'NÃO'}
Mensagem atual do cliente: "${clientMessage}"
${aiResponseText ? `\n## RESPOSTA DA IA PRINCIPAL (que será enviada ao cliente):\n"${aiResponseText.substring(0, 500)}"\n` : ''}
## HISTÓRICO RECENTE:
${recentHistory || '(primeira interação)'}

## MÍDIAS DISPONÍVEIS:
${mediaListForAI}

## MÍDIAS JÁ ENVIADAS (não repetir):
${sentMedias.join(', ') || 'nenhuma'}

Analise e decida se alguma mídia deve ser enviada. Responda APENAS o JSON.`;

    const response = await chatComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      maxTokens: 150,
      temperature: 0.1, // Baixa para decisões mais consistentes
    });
    
    const elapsedMs = Date.now() - startTime;
    
    if (!response || !response.choices || response.choices.length === 0) {
      console.log(`🤖 [MEDIA AI] ❌ Sem resposta da API (${elapsedMs}ms)`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Sem resposta da API' };
    }
    
    const rawResponse = response.choices[0].message.content as string;
    console.log(`🤖 [MEDIA AI] 📥 Resposta bruta (${elapsedMs}ms): ${rawResponse}`);
    
    // 🔧 FIX: Extração robusta de JSON com fallback para JSON incompleto
    let jsonToParse: string | null = null;
    
    // Tentar extrair JSON completo primeiro
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonToParse = jsonMatch[0];
    } else {
      // Tentar consertar JSON incompleto (sem } final)
      const incompleteMatch = rawResponse.match(/\{[\s\S]*/);
      if (incompleteMatch) {
        let attempt = incompleteMatch[0].trim();
        // Remover markdown se existir
        attempt = attempt.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '');
        // Contar { e } para adicionar os faltantes
        const openBraces = (attempt.match(/\{/g) || []).length;
        const closeBraces = (attempt.match(/\}/g) || []).length;
        const missingBraces = openBraces - closeBraces;
        if (missingBraces > 0) {
          attempt += '}'.repeat(missingBraces);
          console.log(`🤖 [MEDIA AI] 🔧 JSON consertado (adicionado ${missingBraces} chave(s) faltante(s))`);
        }
        jsonToParse = attempt;
      }
    }
    
    if (!jsonToParse) {
      console.log(`🤖 [MEDIA AI] ⚠️ Não conseguiu extrair JSON`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Resposta não é JSON válido' };
    }
    
    try {
      // Limpar markdown code blocks se presentes
      jsonToParse = jsonToParse.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      const parsed = JSON.parse(jsonToParse);
      
      // 🔧 FIX: Threshold dinâmico - se a IA principal já decidiu enviar, aceitar com confiança mais baixa
      const confidenceThreshold = aiIntendedToSendMedia ? 20 : 40;
      
      const result: MediaClassificationResult = {
        shouldSend: parsed.decision === 'SEND' && parsed.confidence >= confidenceThreshold,
        mediaName: parsed.mediaName || null,
        confidence: parsed.confidence || 0,
        reason: parsed.reason || 'Sem razão especificada'
      };
      
      console.log(`🤖 [MEDIA AI] ════════════════════════════════════════════════`);
      if (result.shouldSend) {
        console.log(`🤖 [MEDIA AI] ✅ DECISÃO: ENVIAR "${result.mediaName}"`);
      } else {
        console.log(`🤖 [MEDIA AI] ❌ DECISÃO: NÃO ENVIAR (threshold=${confidenceThreshold}%)`);
        // 🔧 FIX: Log extra para debug quando confidence está entre 40-60%
        if (parsed.confidence >= 30 && parsed.confidence < confidenceThreshold) {
          console.log(`🤖 [MEDIA AI] ⚠️ ATENÇÃO: Confiança ${parsed.confidence}% próxima do threshold`);
        }
      }
      console.log(`🤖 [MEDIA AI] 📊 Confiança: ${result.confidence}%`);
      console.log(`🤖 [MEDIA AI] 💡 Razão: ${result.reason}`);
      console.log(`🤖 [MEDIA AI] ⏱️ Tempo: ${elapsedMs}ms`);
      console.log(`🤖 [MEDIA AI] ════════════════════════════════════════════════\n`);
      
      return result;
    } catch (parseError) {
      console.log(`🤖 [MEDIA AI] ⚠️ Erro ao parsear JSON: ${parseError}`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Erro ao parsear resposta' };
    }
    
  } catch (error: any) {
    console.error(`🤖 [MEDIA AI] ❌ ERRO: ${error.message}`);
    // Em caso de erro, retorna "não enviar" para não quebrar o fluxo
    return { shouldSend: false, mediaName: null, confidence: 0, reason: `Erro: ${error.message}` };
  }
}

/**
 * 🔍 Detecta se o texto da IA expressa intenção de enviar mídia
 * Usado para saber se o forceMediaDetection deve ser mais agressivo
 * 
 * Retorna true se a IA disse algo como "vou te enviar", "segue o vídeo", etc.
 */
export function detectMediaSendingIntent(aiResponseText: string): boolean {
  if (!aiResponseText) return false;
  
  const normalized = aiResponseText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  // Padrões que indicam que a IA quer enviar mídia
  const mediaIntentPatterns = [
    // Frases de envio direto
    /vou\s+te\s+enviar/,
    /vou\s+enviar/,
    /ja\s+te\s+envio/,
    /te\s+envio\s+/,
    /te\s+mando\s+/,
    /vou\s+te\s+mandar/,
    /vou\s+mandar/,
    /enviando\s+(o|a|um|uma|esse|essa|este|esta|pra|para)/,
    /segue\s+(o|a|um|uma)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
    /aqui\s+esta\s+(o|a|um|uma)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
    /confira?\s+(o|a|esse|essa|este|esta)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
    /olha?\s+(o|a|esse|essa|este|esta)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
    /assista\s+(o|a|esse|essa|este|esta)/,
    /ouca\s+(o|a|esse|essa|este|esta)/,
    /veja\s+(o|a|esse|essa|este|esta)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
    /da\s+uma\s+olhada\s+n(o|a|esse|essa)/,
    /deixa\s+eu\s+te\s+(enviar|mandar|mostrar|passar)/,
    /to\s+te\s+enviando/,
    /estou\s+te\s+enviando/,
    /ja\s+estou\s+enviando/,
    /preparei\s+(um|uma|esse|essa)\s+(video|audio|imagem|documento|material)/,
    /tenho\s+(um|uma)\s+(video|audio|imagem|material)\s+(pra|para)\s+(voce|vc|ti)/,
    // Frases indicando conteúdo multimídia  
    /vai\s+receber\s+(o|a|um|uma)/,
    /pode\s+assistir/,
    /pode\s+ouvir/,
    /pode\s+conferir\s+(o|a|esse|essa|no|na)\s*(video|audio)/,
  ];
  
  for (const pattern of mediaIntentPatterns) {
    if (pattern.test(normalized)) {
      return true;
    }
  }
  
  return false;
}
