/**
 * 🔄 Auto-Reactivation Service - OTIMIZADO para Supabase
 * 
 * Este serviço verifica periodicamente conversas pausadas que têm timer de auto-reativação
 * configurado e reativa a IA quando o timer expira.
 * 
 * 🔥 OTIMIZAÇÕES IMPLEMENTADAS:
 * 1. Query 100% SQL - sem filtro em JavaScript (reduz Egress)
 * 2. Índice parcial no PostgreSQL para performance
 * 3. Polling dinâmico - ajusta intervalo baseado em timers ativos
 * 4. Limite por batch (10) para não sobrecarregar
 * 5. EXISTS check antes de query pesada
 * 
 * Lógica:
 * 1. Owner envia mensagem → IA pausada com ownerLastReplyAt = now()
 * 2. Cliente envia mensagem → clientHasPendingMessage = true
 * 3. Timer expira (now > ownerLastReplyAt + autoReactivateAfterMinutes)
 * 4. Se clientHasPendingMessage = true → reativar IA e disparar resposta
 */

import { storage } from "./storage";
import { triggerAgentResponseForConversation, broadcastToUser } from "./whatsapp";
import { shouldSkipStaleAutoReactivateReply } from "./autoReactivatePolicy";

// 🔥 INTERVALOS DINÂMICOS para economia de recursos
const CHECK_INTERVAL_FAST_MS = 30 * 1000;   // 30s quando há timers ativos
const CHECK_INTERVAL_SLOW_MS = 5 * 60 * 1000; // 5min quando não há timers ativos
const CHECK_INTERVAL_IDLE_MS = 10 * 60 * 1000; // 10min modo idle (nenhum timer configurado)

let checkInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let currentIntervalMs = CHECK_INTERVAL_SLOW_MS;
let consecutiveEmptyChecks = 0;
let lastActiveTimerCount = 0;

/**
 * Inicia o serviço de auto-reativação
 */
export function startAutoReactivationService() {
  if (checkInterval) {
    console.log(`⏰ [AUTO-REACTIVATE] Serviço já está rodando`);
    return;
  }

  console.log(`⏰ [AUTO-REACTIVATE] Iniciando serviço otimizado (intervalo inicial: ${currentIntervalMs / 1000}s)`);
  
  scheduleNextCheck();

  // Executar primeira verificação após 5s
  setTimeout(async () => {
    if (!isRunning) {
      await runCheck();
    }
  }, 5000);
}

/**
 * Agenda a próxima verificação com intervalo dinâmico
 */
function scheduleNextCheck() {
  if (checkInterval) {
    clearTimeout(checkInterval);
  }
  
  checkInterval = setTimeout(async () => {
    await runCheck();
    scheduleNextCheck(); // Reagendar após conclusão
  }, currentIntervalMs);
}

/**
 * Executa uma verificação
 */
async function runCheck() {
  if (isRunning) {
    console.log(`⏰ [AUTO-REACTIVATE] Verificação anterior ainda em execução, pulando...`);
    return;
  }
  
  isRunning = true;
  try {
    await checkAndReactivateConversations();
  } catch (error) {
    console.error(`❌ [AUTO-REACTIVATE] Erro na verificação:`, error);
  } finally {
    isRunning = false;
  }
}

export async function runAutoReactivationCheck(): Promise<{ accepted: boolean; skipped?: string }> {
  if (isRunning) {
    return {
      accepted: false,
      skipped: "busy",
    };
  }

  await runCheck();
  return { accepted: true };
}

/**
 * Ajusta o intervalo de polling baseado na atividade
 */
async function adjustPollingInterval() {
  try {
    // Contar timers ativos
    const activeTimers = await storage.countActiveAutoReactivateTimers();
    lastActiveTimerCount = activeTimers;
    
    let newInterval: number;
    let reason: string;
    
    if (activeTimers === 0) {
      // Nenhum timer configurado - modo idle
      newInterval = CHECK_INTERVAL_IDLE_MS;
      reason = "nenhum timer ativo";
      consecutiveEmptyChecks = 0;
    } else if (consecutiveEmptyChecks >= 10) {
      // Muitas verificações vazias - reduzir frequência
      newInterval = CHECK_INTERVAL_SLOW_MS;
      reason = `${consecutiveEmptyChecks} checks vazios consecutivos`;
    } else {
      // Há timers ativos - modo rápido
      newInterval = CHECK_INTERVAL_FAST_MS;
      reason = `${activeTimers} timers ativos`;
    }
    
    // Só logar se mudou
    if (newInterval !== currentIntervalMs) {
      console.log(`⏰ [AUTO-REACTIVATE] Intervalo ajustado: ${currentIntervalMs/1000}s → ${newInterval/1000}s (${reason})`);
      currentIntervalMs = newInterval;
    }
  } catch (error) {
    console.error(`❌ [AUTO-REACTIVATE] Erro ao ajustar intervalo:`, error);
  }
}

/**
 * Para o serviço de auto-reativação
 */
export function stopAutoReactivationService() {
  if (checkInterval) {
    clearTimeout(checkInterval);
    checkInterval = null;
    console.log(`⏰ [AUTO-REACTIVATE] Serviço parado`);
  }
}

/**
 * Verifica e reativa conversas que expiraram o timer
 */
async function checkAndReactivateConversations() {
  try {
    // 🔥 OTIMIZAÇÃO: Verificar rapidamente se há algo para processar
    const hasPending = await storage.hasConversationsToAutoReactivate();
    
    if (!hasPending) {
      consecutiveEmptyChecks++;
      await adjustPollingInterval();
      return;
    }

    // Resetar contador de checks vazios
    consecutiveEmptyChecks = 0;
    
    // Buscar conversas que precisam ser reativadas (limitado a 10)
    const conversationsToReactivate = await storage.getConversationsToAutoReactivate();
    
    if (conversationsToReactivate.length === 0) {
      await adjustPollingInterval();
      return;
    }

    console.log(`⏰ [AUTO-REACTIVATE] Processando ${conversationsToReactivate.length} conversas`);

    for (const conv of conversationsToReactivate) {
      try {
        // 1. Buscar dados da conversa para notificar o usuário correto
        const conversation = await storage.getConversation(conv.conversationId);
        if (!conversation) {
          console.log(`⚠️ [AUTO-REACTIVATE] Conversa ${conv.conversationId} não encontrada, removendo...`);
          await storage.enableAgentForConversation(conv.conversationId);
          continue;
        }

        // 2. Buscar conexão para obter userId
        const connection = await storage.getConnectionById(conversation.connectionId);
        if (!connection) {
          console.log(`⚠️ [AUTO-REACTIVATE] Conexão não encontrada para conversa ${conv.conversationId}`);
          await storage.enableAgentForConversation(conv.conversationId);
          continue;
        }

        // 🐛 FIX CRÍTICO: Verificar se a IA está ativa GLOBALMENTE antes de reativar
        // Se o usuário desligou a IA no toggle "IA ON" em /meu-agente-ia, NÃO reativar
        const businessAgentConfig = await storage.getBusinessAgentConfig(connection.userId);
        if (!businessAgentConfig?.isActive) {
          console.log(`🚫 [AUTO-REACTIVATE] IA desativada GLOBALMENTE para user ${connection.userId} - NÃO reativando conversa ${conv.conversationId}`);
          // Não remove da tabela de disabled - mantém pausada
          // Quando o usuário reativar globalmente, as mensagens pendentes serão processadas
          continue;
        }

        // 🐛 FIX: Verificar também o agentConfig (tabela ai_agent_config)
        const agentConfig = await storage.getAgentConfig(connection.userId);
        if (!agentConfig?.isActive) {
          console.log(`🚫 [AUTO-REACTIVATE] Agente IA desativado em ai_agent_config para user ${connection.userId} - NÃO reativando`);
          continue;
        }

        console.log(`🔄 [AUTO-REACTIVATE] Reativando IA para conversa ${conv.conversationId} (${conversation.contactName || conversation.contactNumber})`);

        // 3. Reativar a IA (remover da tabela de desabilitados)
        await storage.enableAgentForConversation(conv.conversationId);

        // 4. Notificar frontend sobre a reativação
        broadcastToUser(connection.userId, {
          type: "agent_auto_reactivated",
          conversationId: conv.conversationId,
          reason: "timer_expired",
          hasPendingMessage: (conv as any).clientHasPendingMessage ?? false,
        });

        // 5. Disparar resposta da IA APENAS se houver mensagem pendente do cliente
        // Se não há mensagem pendente, a IA só precisa estar ativa para responder a próxima mensagem
        if ((conv as any).clientHasPendingMessage) {
          const skipStalePendingReply = shouldSkipStaleAutoReactivateReply({
            autoReactivateAfterMinutes: (conv as any).autoReactivateAfterMinutes,
            clientLastMessageAt: (conv as any).clientLastMessageAt,
            conversationLastMessageAt: (conversation as any).lastMessageTime ?? (conversation as any).last_message_time,
          });

          if (skipStalePendingReply) {
            console.log(`[AUTO-REACTIVATE] IA reativada para ${conv.conversationId}, mas sem responder pendencia antiga`);
            continue;
          }

          try {
            const triggerResult = await triggerAgentResponseForConversation(connection.userId, conv.conversationId);
            console.log(`✅ [AUTO-REACTIVATE] IA reativada e respondendo para ${conv.conversationId}: ${triggerResult.reason}`);
          } catch (triggerError) {
            console.error(`❌ [AUTO-REACTIVATE] Erro ao disparar resposta para ${conv.conversationId}:`, triggerError);
          }
        } else {
          console.log(`✅ [AUTO-REACTIVATE] IA reativada para ${conv.conversationId} (sem msg pendente - aguardando próxima mensagem do cliente)`);
        }

      } catch (convError) {
        console.error(`❌ [AUTO-REACTIVATE] Erro ao processar conversa ${conv.conversationId}:`, convError);
      }
    }

    // Ajustar intervalo após processamento
    await adjustPollingInterval();

  } catch (error) {
    console.error(`❌ [AUTO-REACTIVATE] Erro ao buscar conversas:`, error);
  }
}

/**
 * Força uma verificação imediata (útil para testes)
 */
export async function forceCheckAutoReactivation() {
  console.log(`⏰ [AUTO-REACTIVATE] Forçando verificação imediata...`);
  await checkAndReactivateConversations();
}

/**
 * Retorna estatísticas do serviço (útil para monitoramento)
 */
export function getAutoReactivationStats() {
  return {
    isRunning: !!checkInterval,
    currentIntervalMs,
    consecutiveEmptyChecks,
    lastActiveTimerCount,
    intervalMode: currentIntervalMs === CHECK_INTERVAL_FAST_MS ? 'fast' : 
                  currentIntervalMs === CHECK_INTERVAL_SLOW_MS ? 'slow' : 'idle'
  };
}
