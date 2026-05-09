/**
 * 🔔 SERVIÇO DE NOTIFICAÇÕES AGENDADAS - VERSÃO PROFISSIONAL
 * 
 * Responsável por verificar e enviar notificações automáticas:
 * - Lembretes de pagamento (X dias antes do vencimento)
 * - Notificações de atraso (X dias após vencimento)
 * - Check-ins periódicos (a cada X dias)
 * - Alertas de WhatsApp desconectado (após X horas)
 * - Broadcasts programados
 * - ✅ NOVO: Verificação e downgrade de planos vencidos
 * 
 * ✅ FUNCIONA MESMO COM WHATSAPP DESCONECTADO (verifica antes de enviar)
 * ✅ GERA MENSAGEM ÚNICA POR CLIENTE COM IA (anti-detecção de bot)
 * ✅ DELAY HUMANO ENTRE MENSAGENS (3-10 segundos)
 * ✅ DELAY ENTRE LOTES (30-60 segundos a cada 15-25 mensagens)
 * ✅ LIMITE DIÁRIO (máximo 500 notificações por admin/dia)
 * ✅ RETRY COM BACKOFF EXPONENCIAL
 * 
 * NÃO é um chatbot - apenas envia mensagens informativas
 */

import crypto from "crypto";
import { storage } from "./storage";
import { sendAdminNotification } from "./whatsapp";
import { callGroq } from "./llm";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { sanitizeAdminNotificationConfig } from "./adminMessagingFeaturePolicy";

/**
 * ✅ SANITIZA RESPOSTA DA IA - Remove múltiplas variações e garante uma única mensagem
 * Problema: A IA às vezes gera 2+ variações separadas por "---", "Ou,", "Opção 2:", etc.
 * Solução: Extrair apenas a PRIMEIRA variação e substituir variáveis residuais
 */
function sanitizeAIVariation(
  aiOutput: string,
  replacements: Record<string, string>
): string {
  let result = aiOutput.trim();
  
  // 1. Remover múltiplas variações - pegar apenas a PRIMEIRA mensagem
  // Padrões comuns de separação de variações:
  const separators = [
    /\n\s*---\s*\n/,                    // --- separador
    /\n\s*\*?\(?[Oo]u,?\s/,              // "Ou, se preferir..."
    /\n\s*\*?\(?[Oo]pção\s*\d/i,         // "Opção 2:"
    /\n\s*\*?Versão\s*\d/i,              // "Versão 2:"
    /\n\s*\*?Alternativa/i,              // "Alternativa:"
    /\n\s*\*?Se preferir/i,              // "Se preferir um tom..."
    /\n\s*\*?Outra opção/i,              // "Outra opção:"
    /\n\s*\(\s*Ou/,                      // "(Ou, se preferir"
  ];
  
  for (const sep of separators) {
    const match = result.match(sep);
    if (match && match.index && match.index > 30) {
      result = result.substring(0, match.index).trim();
      console.log(`[AI SANITIZE] Removida variação extra (separador: ${sep.source})`);
      break;
    }
  }
  
  // 2. Substituir variáveis de template que a IA pode ter mantido literalmente
  for (const [variable, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  
  // 3. Remover aspas envolventes que a IA pode adicionar
  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
    result = result.slice(1, -1).trim();
  }
  
  // 4. Remover prefixos tipo "Aqui está a mensagem:" ou "Mensagem reescrita:"
  result = result.replace(/^(Aqui está[^:]*:|Mensagem[^:]*:|Segue[^:]*:)\s*/i, '').trim();
  
  return result;
}

function buildAIVariationPrompt(customPrompt?: string, clientName?: string): string {
  const basePrompt = (customPrompt || `Reescreva esta mensagem mantendo o mesmo significado mas com palavras e estrutura diferentes.
      Mantenha tom profissional e cordial.
      Varie saudações, conectivos e expressões.`).trim();

  const rules = [
    basePrompt,
    "",
    "TAREFA REAL:",
    "1. Reescreva somente a mensagem recebida no turno do usuário.",
    "2. Use a mensagem do usuário como fonte única da verdade para fatos concretos.",
    "3. Preserve nomes próprios, nome da empresa, produto, links, valores, horários e instruções já presentes na mensagem original.",
    "4. Nunca troque fatos reais por placeholders, colchetes, chaves ou nomes genéricos.",
    "5. Nunca invente empresa, assinatura, cargo, contexto ou promessa que não estejam explícitos na mensagem original.",
    "6. Se faltar alguma informação, omita em vez de inventar.",
    "",
    "REGRAS OBRIGATÓRIAS:",
    "1. Retorne APENAS UMA ÚNICA mensagem reescrita.",
    "2. NÃO gere múltiplas variações ou opções alternativas.",
    "3. NÃO use separadores como \"---\" ou \"Ou, se preferir\".",
    "4. NÃO inclua explicações, aspas, marcadores ou prefixos.",
    "5. NÃO use variáveis como {cliente_nome}, {{name}}, [seu nome] ou [nome da empresa].",
    "6. Se a mensagem original já apresenta o atendente ou a empresa, preserve essa identidade sem trocar por termos genéricos.",
    "7. Se a melhor opção for manter a mensagem quase igual para não perder fatos, faça isso.",
  ];

  if (clientName) {
    rules.push(`8. O nome real do cliente disponível no contexto é: ${clientName}.`);
  }

  return rules.join("\n");
}

interface NotificationJob {
  type: 'payment_reminder' | 'overdue_reminder' | 'periodic_checkin' | 'disconnected_alert';
  adminId: string;
  userId: string;
  phone: string;
  userName: string;
  data: any;
}

function isModuleEnabledForNotificationType(notificationType: string, config: any): boolean {
  switch (notificationType) {
    case 'payment_reminder':
      return config?.payment_reminder_enabled !== false;
    case 'overdue_reminder':
      return config?.overdue_reminder_enabled !== false;
    case 'checkin':
    case 'periodic_checkin':
      return config?.periodic_checkin_enabled !== false;
    case 'disconnected':
    case 'disconnected_alert':
      return config?.disconnected_alert_enabled !== false;
    default:
      return true;
  }
}

function isBillingNotificationType(notificationType: string): boolean {
  return notificationType === 'payment_reminder' || notificationType === 'overdue_reminder';
}

async function hasActiveSubscriptionForUser(userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  const result = await db.execute(sql`
    SELECT 1
    FROM subscriptions
    WHERE user_id = ${userId}
      AND status = 'active'
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

// Executar a cada 5 minutos para processar notificações agendadas mais rapidamente
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Limites anti-bloqueio
const DAILY_NOTIFICATION_LIMIT = 500; // Máximo de notificações por admin por dia
const BATCH_SIZE_MIN = 15; // Tamanho mínimo de lote
const BATCH_SIZE_MAX = 25; // Tamanho máximo de lote
const BATCH_DELAY_MIN_MS = 30000; // 30 segundos entre lotes
const BATCH_DELAY_MAX_MS = 60000; // 60 segundos entre lotes

let schedulerInterval: NodeJS.Timeout | null = null;
let notificationProcessing = false;

// Cache de contadores diários (resetado à meia-noite)
const dailyCounters: Map<string, { count: number; date: string }> = new Map();
const ACTIVE_NOTIFICATION_CONFIGS_CACHE_TTL_MS = 2 * 60 * 1000;
const EXPIRED_SUBSCRIPTIONS_CHECK_INTERVAL_MS = 60 * 60 * 1000;
let cachedActiveNotificationConfigs:
  | { rows: any[]; expiresAt: number }
  | null = null;
let lastExpiredSubscriptionsCheckAt = 0;

/**
 * Inicia o scheduler de notificações
 */
export function startNotificationScheduler(): void {
  if (schedulerInterval) {
    console.log('🔔 [NOTIFICATION SCHEDULER] Já está rodando');
    return;
  }

  console.log('🔔 [NOTIFICATION SCHEDULER] Iniciando...');
  
  // Executar imediatamente e depois a cada intervalo
  processNotifications();
  schedulerInterval = setInterval(processNotifications, CHECK_INTERVAL_MS);
}

/**
 * Para o scheduler de notificações
 */
export function stopNotificationScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('🔔 [NOTIFICATION SCHEDULER] Parado');
  }
}

// Controle de auto-reorganize (rodar a cada 2 horas, não a cada 5 min)
let lastAutoReorganize: number = 0;
const AUTO_REORGANIZE_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 horas

/**
 * Processa todas as notificações pendentes
 */
async function processNotifications(): Promise<void> {
  if (notificationProcessing) {
    console.log('🔔 [NOTIFICATION SCHEDULER] Processamento já em andamento, pulando...');
    return;
  }

  notificationProcessing = true;
  try {
    console.log('🔔 [NOTIFICATION SCHEDULER] Verificando notificações...');
    const activeConfigs = await getActiveNotificationConfigs();

    // ✅ RECOVERY: Resetar notificações stuck em 'processing' por mais de 30min (crash do servidor)
    try {
      const stuckResult = await db.execute(sql`
        UPDATE scheduled_notifications
        SET status = 'pending', updated_at = NOW(), retry_count = COALESCE(retry_count, 0) + 1
        WHERE status = 'processing'
          AND updated_at < NOW() - INTERVAL '30 minutes'
        RETURNING id, recipient_name, notification_type
      `);
      const stuckRows = stuckResult.rows as any[];
      if (stuckRows.length > 0) {
        console.log(`🔔 [RECOVERY] ♻️ Resetou ${stuckRows.length} notificações stuck em 'processing' → 'pending'`);
        for (const row of stuckRows) {
          console.log(`   ↳ ${row.recipient_name} (${row.notification_type}) ID: ${row.id}`);
        }
      }
    } catch (recoveryErr) {
      console.error('🔔 [RECOVERY] Erro ao resetar stuck:', recoveryErr);
    }

    // ✅ RECOVERY: Resetar notificações que falharam por WhatsApp desconectado (últimas 48h, max 3 retries)
    try {
      const disconnectedFailedResult = await db.execute(sql`
        UPDATE scheduled_notifications
        SET status = 'pending', 
            updated_at = NOW(), 
            error_message = NULL,
            retry_count = COALESCE(retry_count, 0) + 1,
            scheduled_for = NOW() + (floor(random() * 30) || ' minutes')::interval
        WHERE status = 'failed'
          AND error_message LIKE '%WhatsApp%not connected%'
          AND scheduled_for >= NOW() - INTERVAL '48 hours'
          AND COALESCE(retry_count, 0) < 3
        RETURNING id, recipient_name, notification_type
      `);
      const recoveredRows = disconnectedFailedResult.rows as any[];
      if (recoveredRows.length > 0) {
        console.log(`🔔 [RECOVERY] ♻️ Reagendou ${recoveredRows.length} notificações que falharam por WhatsApp desconectado`);
      }
    } catch (recoveryErr) {
      console.error('🔔 [RECOVERY] Erro ao recuperar falhas por desconexão:', recoveryErr);
    }

    // ✅ Limpar contadores antigos
    cleanOldCounters();

    // ✅ NOVO: Verificar e atualizar planos vencidos automaticamente
    await processExpiredSubscriptionsIfDue();

    // ✅ AUTO-REORGANIZE: Criar novas notificações automaticamente (a cada 2h)
    const now = Date.now();
    if (now - lastAutoReorganize >= AUTO_REORGANIZE_INTERVAL_MS) {
      await autoReorganizeAllAdmins(activeConfigs);
      lastAutoReorganize = now;
    }

    // ✅ PRIMEIRO: Processar fila de scheduled_notifications
    await processScheduledNotificationsQueue();

    // ✅ REMOVIDO: processAdminNotifications() era o caminho ANTIGO que enviava diretamente
    // SEM delays anti-ban e com variáveis erradas ({nome} ao invés de {cliente_nome}).
    // O sistema de fila (autoReorganize + processScheduledNotificationsQueue) já cobre
    // TODOS os casos com delays adequados (30-60s) e variáveis corretas.
    // NÃO usar mais o caminho direto.
    
    console.log(`🔔 [NOTIFICATION SCHEDULER] Processamento concluído (${activeConfigs.length} admins, usando fila com delays)`);
  } catch (error) {
    console.error('🔔 [NOTIFICATION SCHEDULER] Erro:', error);
  } finally {
    notificationProcessing = false;
  }
}

export async function runNotificationSchedulerCycle(): Promise<{ accepted: boolean; skipped?: string }> {
  if (notificationProcessing) {
    return {
      accepted: false,
      skipped: "busy",
    };
  }

  await processNotifications();
  return { accepted: true };
}

/**
 * ✅ AUTO-REORGANIZE: Cria notificações automaticamente para todos os admins
 * Roda a cada 2 horas para garantir que a fila nunca fica vazia
 */
async function autoReorganizeAllAdmins(configs?: any[]): Promise<void> {
  try {
    console.log('🔄 [AUTO-REORGANIZE] Iniciando reorganização automática...');
    const configRows = configs || await getActiveNotificationConfigs();
    const adminIds = Array.from(
      new Set(
        configRows
          .map((row: any) => row?.admin_id)
          .filter((adminId: any) => typeof adminId === "string" && adminId.length > 0),
      ),
    );
    
    if (adminIds.length === 0) {
      console.log('🔄 [AUTO-REORGANIZE] Nenhum admin com notificações habilitadas');
      return;
    }
    
    for (const adminId of adminIds) {
      try {
        await autoReorganizeForAdmin(adminId);
      } catch (err) {
        console.error(`🔄 [AUTO-REORGANIZE] Erro para admin ${adminId}:`, err);
      }
    }
    
    console.log(`🔄 [AUTO-REORGANIZE] Concluído para ${adminIds.length} admin(s)`);
  } catch (error) {
    console.error('🔄 [AUTO-REORGANIZE] Erro geral:', error);
  }
}

/**
 * Auto-reorganiza notificações para um admin específico
 * Cria entradas em scheduled_notifications para os próximos 14 dias
 */
async function autoReorganizeForAdmin(adminId: string): Promise<void> {
  const now = new Date();
  
  // Buscar config do admin
  const configResult = await db.execute(sql`
    SELECT * FROM admin_notification_config WHERE admin_id = ${adminId}
  `);
  const rawConfig = sanitizeAdminNotificationConfig((configResult.rows as any[])[0]);
  if (!rawConfig) return;
  
  const config = {
    paymentReminderEnabled: rawConfig.payment_reminder_enabled ?? true,
    paymentReminderDaysBefore: rawConfig.payment_reminder_days_before || [7, 3, 1],
    paymentReminderMessageTemplate: rawConfig.payment_reminder_message_template || 'Olá {cliente_nome}! Seu pagamento vence em {dias_restantes} dias. Vencimento: {data_vencimento}. Valor: R$ {valor}',
    paymentReminderAiEnabled: rawConfig.payment_reminder_ai_enabled ?? false,
    paymentReminderAiPrompt: rawConfig.payment_reminder_ai_prompt || '',
    overdueReminderEnabled: rawConfig.overdue_reminder_enabled ?? true,
    overdueReminderDaysAfter: rawConfig.overdue_reminder_days_after || [1, 3, 7, 14],
    overdueReminderMessageTemplate: rawConfig.overdue_reminder_message_template || 'Olá {cliente_nome}! Seu pagamento está em atraso há {dias_atraso} dias. Venceu em: {data_vencimento}. Valor: R$ {valor}',
    overdueReminderAiEnabled: rawConfig.overdue_reminder_ai_enabled ?? false,
    overdueReminderAiPrompt: rawConfig.overdue_reminder_ai_prompt || '',
    periodicCheckinEnabled: rawConfig.periodic_checkin_enabled ?? true,
    periodicCheckinMinDays: rawConfig.periodic_checkin_min_days || 7,
    periodicCheckinMaxDays: rawConfig.periodic_checkin_max_days || 15,
    periodicCheckinMessageTemplate: rawConfig.periodic_checkin_message_template || 'Olá {cliente_nome}! Passando para ver se está tudo bem!',
    checkinAiEnabled: rawConfig.checkin_ai_enabled ?? false,
    checkinAiPrompt: rawConfig.checkin_ai_prompt || '',
    disconnectedAlertEnabled: rawConfig.disconnected_alert_enabled ?? true,
    disconnectedAlertHours: rawConfig.disconnected_alert_hours || 2,
    disconnectedAlertMessageTemplate: rawConfig.disconnected_alert_message_template || 'Olá {cliente_nome}! Notamos que seu WhatsApp está desconectado.',
    disconnectedAiEnabled: rawConfig.disconnected_ai_enabled ?? false,
    disconnectedAiPrompt: rawConfig.disconnected_ai_prompt || '',
    aiVariationPrompt: rawConfig.ai_variation_prompt || '',
    businessHoursStart: rawConfig.business_hours_start || '09:00',
    businessHoursEnd: rawConfig.business_hours_end || '18:00',
    businessDays: rawConfig.business_days || [1, 2, 3, 4, 5],
    respectBusinessHours: rawConfig.respect_business_hours ?? true,
  };
  
  // ✅ CORRIGIDO: Reagendar pendentes atrasados para o próximo horário comercial
  // Agora usa business_days da config do admin (não mais hardcoded Sáb/Dom)
  const businessDays = config.businessDays || [1, 2, 3, 4, 5];
  const excludedDays = [0, 1, 2, 3, 4, 5, 6].filter(d => !businessDays.includes(d));
  // Se todos os dias estão habilitados, não precisamos pular fins de semana
  const hasExcludedDays = excludedDays.length > 0;
  // Build excluded days as SQL literal to avoid "cannot cast type record to integer[]" error
  // When passing a JS array via drizzle sql template, Postgres receives it as a record type
  // which cannot be cast to integer[]. Use sql.raw() to inline the values directly.
  const excludedDaysLiteral = excludedDays.length > 0 ? excludedDays.join(',') : '-1';
  try {
    const staleResult = await db.execute(sql`
      UPDATE scheduled_notifications
      SET scheduled_for = (
        CASE 
          WHEN ${hasExcludedDays} AND EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo') = ANY(ARRAY[${sql.raw(excludedDaysLiteral)}]::int[])
            THEN (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 day' * 
                  CASE WHEN EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo') = 6 THEN 2 ELSE 1 END
                 ) + (${config.businessHoursStart || '09:00'})::time + (floor(random() * 120) || ' minutes')::interval
          ELSE (NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '5 minutes' + (floor(random() * 30) || ' minutes')::interval
        END
      ) AT TIME ZONE 'America/Sao_Paulo',
      updated_at = NOW(),
      retry_count = COALESCE(retry_count, 0) + 1
      WHERE admin_id = ${adminId}
        AND status = 'pending'
        AND scheduled_for < NOW() - INTERVAL '2 hours'
        AND COALESCE(retry_count, 0) < 5
      RETURNING id, notification_type, recipient_name
    `);
    const rescheduled = staleResult.rows as any[];
    if (rescheduled.length > 0) {
      console.log(`🔄 [AUTO-REORGANIZE] ♻️ Reagendou ${rescheduled.length} notificações atrasadas (antes seriam deletadas)`);
    }
    
    // Deletar apenas as que já falharam 5+ vezes no reagendamento
    await db.execute(sql`
      DELETE FROM scheduled_notifications
      WHERE admin_id = ${adminId}
        AND status = 'pending'
        AND scheduled_for < NOW() - INTERVAL '2 hours'
        AND COALESCE(retry_count, 0) >= 5
    `);
  } catch (rescheduleErr) {
    console.error('🔄 [AUTO-REORGANIZE] Erro ao reagendar atrasados:', rescheduleErr);
    // Fallback: deletar como antes para não travar
    await db.execute(sql`
      DELETE FROM scheduled_notifications
      WHERE admin_id = ${adminId}
        AND status = 'pending'
        AND scheduled_for < NOW()
    `);
  }
  
  // Buscar logs enviados (30 dias)
  const sentLogsResult = await db.execute(sql`
    SELECT user_id, notification_type,
           (metadata->>'daysBefore')::int as days_before,
           (metadata->>'daysAfter')::int as days_after
    FROM admin_notification_logs
    WHERE admin_id = ${adminId}
    AND created_at > NOW() - INTERVAL '30 days'
  `);
  const sentLogs = sentLogsResult.rows || [];
  
  // Buscar pendentes existentes
  const existingResult = await db.execute(sql`
    SELECT user_id, notification_type,
           (metadata->>'daysBefore')::int as days_before,
           (metadata->>'daysAfter')::int as days_after
    FROM scheduled_notifications
    WHERE admin_id = ${adminId}
    AND status = 'pending'
  `);
  const existingScheduled = existingResult.rows || [];
  
  const alreadySentOrScheduled = (userId: string, type: string, daysBefore?: number, daysAfter?: number) => {
    const wasSent = sentLogs.some((log: any) =>
      log.user_id === userId &&
      log.notification_type === type &&
      (daysBefore === undefined || log.days_before === daysBefore) &&
      (daysAfter === undefined || log.days_after === daysAfter)
    );
    const isScheduled = existingScheduled.some((s: any) =>
      s.user_id === userId &&
      s.notification_type === type &&
      (daysBefore === undefined || s.days_before === daysBefore) &&
      (daysAfter === undefined || s.days_after === daysAfter)
    );
    return wasSent || isScheduled;
  };
  
  // Buscar usuários com subscriptions e connections
  const usersResult = await db.execute(sql`
    SELECT 
      u.id, u.phone, u.name,
      s.id as sub_id, s.status as sub_status, 
      s.data_fim, s.data_inicio, s.next_payment_date as next_payment_date,
      s.plan_id,
      p.valor as plan_valor, p.nome as plan_nome, p.frequencia_dias as frequencia_dias,
      COALESCE(wc.is_connected_effective, false) as whatsapp_connected,
      wc.phone_number as connection_phone_number,
      wc.updated_at as connection_updated_at
    FROM users u
    LEFT JOIN LATERAL (
      SELECT * FROM subscriptions sub 
      WHERE sub.user_id = u.id AND sub.status IN ('active', 'pending', 'expired')
      ORDER BY sub.created_at DESC LIMIT 1
    ) s ON true
    LEFT JOIN plans p ON s.plan_id = p.id
    LEFT JOIN LATERAL (
      SELECT
        CASE
          WHEN c.provider = 'baileys'
            AND COALESCE(NULLIF(c.connection_method, ''), 'qr') <> 'coexistence'
            AND COALESCE(NULLIF(c.provider_status, ''), 'inactive') = 'connected'
          THEN true
          ELSE COALESCE(c.is_connected, false)
        END as is_connected_effective,
        c.phone_number,
        c.updated_at
      FROM whatsapp_connections c 
      WHERE c.user_id = u.id ORDER BY c.created_at DESC LIMIT 1
    ) wc ON true
    WHERE u.id != ${adminId}
    AND u.id NOT IN (
      SELECT uu.id FROM users uu 
      JOIN admins a ON a.email = uu.email 
      WHERE a.id = ${adminId}
    )
    AND u.role IS DISTINCT FROM 'owner'
    AND u.phone IS NOT NULL
    AND u.phone != ''
  `);
  const users = usersResult.rows as any[];
  
  const scheduledItems: any[] = [];
  
  for (const user of users) {
    if (!user.phone) continue;
    
    // Calcular data de vencimento
    let dueDate = user.next_payment_date || user.data_fim;
    if (!dueDate && user.data_inicio && user.frequencia_dias) {
      const startDate = new Date(user.data_inicio);
      const calculatedDue = new Date(startDate);
      calculatedDue.setDate(calculatedDue.getDate() + (user.frequencia_dias || 30));
      dueDate = calculatedDue.toISOString();
    }
    
    const planValor = user.plan_valor || '0';
    const hasActivePlan = user.sub_status === 'active';
    const hasSubscription = user.sub_id && !hasActivePlan && user.sub_status === 'pending';
    // Para cobrança, incluir planos pendentes ou expirados, mas nunca quem já está ativo.
    const hasSubscriptionForOverdue = user.sub_id && !hasActivePlan && (user.sub_status === 'pending' || user.sub_status === 'expired');
    const hadConnectedWhatsappBefore = Boolean(user.connection_phone_number);
    const isDisconnectedAfterConnection = hadConnectedWhatsappBefore && !user.whatsapp_connected;
    
    // 1. LEMBRETE DE PAGAMENTO
    if (config.paymentReminderEnabled && hasSubscription && dueDate) {
      const dueDateObj = new Date(dueDate);
      const daysUntilDue = Math.ceil((dueDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      for (const daysBefore of config.paymentReminderDaysBefore) {
        if (daysUntilDue > 0 && daysUntilDue <= daysBefore + 7) {
          if (alreadySentOrScheduled(user.id, 'payment_reminder', daysBefore)) continue;
          
          const scheduleDate = new Date(dueDateObj);
          scheduleDate.setDate(scheduleDate.getDate() - daysBefore);
          if (scheduleDate <= now) {
            scheduleDate.setTime(now.getTime());
            scheduleDate.setDate(scheduleDate.getDate() + 1);
          }
          if (config.respectBusinessHours) {
            const [startHour] = config.businessHoursStart.split(':').map(Number);
            scheduleDate.setHours(startHour + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0);
          }
          
          scheduledItems.push({
            admin_id: adminId, user_id: user.id, notification_type: 'payment_reminder',
            recipient_phone: user.phone, recipient_name: user.name || 'Cliente',
            message_template: config.paymentReminderMessageTemplate,
            ai_prompt: config.paymentReminderAiPrompt || config.aiVariationPrompt,
            scheduled_for: scheduleDate.toISOString(),
            ai_enabled: config.paymentReminderAiEnabled,
            metadata: JSON.stringify({ daysBefore, dueDate: dueDateObj.toISOString(), valor: planValor, planName: user.plan_nome || 'Plano' }),
          });
        }
      }
    }
    
    // 2. COBRANÇA EM ATRASO (inclui planos expirados para continuar cobrando)
    if (config.overdueReminderEnabled && hasSubscriptionForOverdue && dueDate) {
      const dueDateObj = new Date(dueDate);
      const daysOverdue = Math.ceil((now.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysOverdue > 0) {
        for (const daysAfter of config.overdueReminderDaysAfter) {
          if (daysOverdue >= daysAfter && daysOverdue < daysAfter + 7) {
            if (alreadySentOrScheduled(user.id, 'overdue_reminder', undefined, daysAfter)) continue;
            
            const scheduleDate = new Date();
            if (config.respectBusinessHours) {
              const [startHour] = config.businessHoursStart.split(':').map(Number);
              scheduleDate.setHours(startHour + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0);
            }
            if (scheduleDate <= now) scheduleDate.setDate(scheduleDate.getDate() + 1);
            
            scheduledItems.push({
              admin_id: adminId, user_id: user.id, notification_type: 'overdue_reminder',
              recipient_phone: user.phone, recipient_name: user.name || 'Cliente',
              message_template: config.overdueReminderMessageTemplate,
              ai_prompt: config.overdueReminderAiPrompt || config.aiVariationPrompt,
              scheduled_for: scheduleDate.toISOString(),
              ai_enabled: config.overdueReminderAiEnabled,
              metadata: JSON.stringify({ daysAfter, daysOverdue, dueDate: dueDateObj.toISOString(), valor: planValor, planName: user.plan_nome || 'Plano' }),
            });
          }
        }
      }
    }
    
    // 3. CHECK-IN PERIÓDICO (só com plano ativo)
    if (config.periodicCheckinEnabled && hasSubscription) {
      if (!alreadySentOrScheduled(user.id, 'checkin')) {
        const minDays = config.periodicCheckinMinDays;
        const maxDays = config.periodicCheckinMaxDays;
        const randomDays = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;
        
        const scheduleDate = new Date();
        scheduleDate.setDate(scheduleDate.getDate() + randomDays);
        if (config.respectBusinessHours) {
          const [startHour] = config.businessHoursStart.split(':').map(Number);
          scheduleDate.setHours(startHour + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60), 0);
        }
        
        scheduledItems.push({
          admin_id: adminId, user_id: user.id, notification_type: 'checkin',
          recipient_phone: user.phone, recipient_name: user.name || 'Cliente',
          message_template: config.periodicCheckinMessageTemplate,
          ai_prompt: config.checkinAiPrompt || config.aiVariationPrompt,
          scheduled_for: scheduleDate.toISOString(),
          ai_enabled: config.checkinAiEnabled,
          metadata: JSON.stringify({ minDays, maxDays, randomDays }),
        });
      }
    }
    
    // 4. ALERTA DESCONECTADO (somente para quem já conectou e depois ficou offline)
    if (config.disconnectedAlertEnabled && isDisconnectedAfterConnection) {
      if (!alreadySentOrScheduled(user.id, 'disconnected')) {
        const disconnectedAt = user.connection_updated_at ? new Date(user.connection_updated_at) : null;
        const hasValidDisconnectedAt = disconnectedAt instanceof Date && !Number.isNaN(disconnectedAt.getTime());
        const scheduleDate = hasValidDisconnectedAt
          ? new Date(disconnectedAt.getTime() + (config.disconnectedAlertHours * 60 * 60 * 1000))
          : new Date(now.getTime() + (config.disconnectedAlertHours * 60 * 60 * 1000));

        if (scheduleDate <= now) {
          scheduleDate.setTime(now.getTime());
        }
        
        scheduledItems.push({
          admin_id: adminId, user_id: user.id, notification_type: 'disconnected',
          recipient_phone: user.phone, recipient_name: user.name || 'Cliente',
          message_template: config.disconnectedAlertMessageTemplate,
          ai_prompt: config.disconnectedAiPrompt || config.aiVariationPrompt,
          scheduled_for: scheduleDate.toISOString(),
          ai_enabled: config.disconnectedAiEnabled,
          metadata: JSON.stringify({
            disconnectedSince: hasValidDisconnectedAt ? disconnectedAt.toISOString() : user.connection_updated_at,
            hadConnectedBefore: true,
          }),
        });
      }
    }
  }
  
  // Inserir novos agendamentos
  if (scheduledItems.length > 0) {
    for (const item of scheduledItems) {
      try {
        await db.execute(sql`
          INSERT INTO scheduled_notifications (
            admin_id, user_id, notification_type, recipient_phone, recipient_name,
            message_template, ai_prompt, scheduled_for, ai_enabled, metadata, status
          ) VALUES (
            ${item.admin_id}, ${item.user_id}, ${item.notification_type},
            ${item.recipient_phone}, ${item.recipient_name}, ${item.message_template},
            ${item.ai_prompt}, ${item.scheduled_for}::timestamp, ${item.ai_enabled},
            ${item.metadata}::jsonb, 'pending'
          )
          ON CONFLICT DO NOTHING
        `);
      } catch (insertErr) {
        // ignore duplicates
      }
    }
    console.log(`🔄 [AUTO-REORGANIZE] Admin ${adminId}: ${scheduledItems.length} notificações agendadas automaticamente`);
  } else {
    console.log(`🔄 [AUTO-REORGANIZE] Admin ${adminId}: nenhuma nova notificação para agendar`);
  }
}

// 🔒 Lock para evitar processamento duplicado
let isQueueProcessing = false;

/**
 * ✅ PROCESSA FILA DE NOTIFICAÇÕES AGENDADAS (scheduled_notifications)
 * Esta função processa todas as notificações com scheduled_for <= NOW() e status = 'pending'
 * Usa delays anti-banimento e variação IA
 * 
 * 🔒 CORREÇÃO BUG DUPLICATAS:
 * - Lock global para evitar execuções paralelas
 * - Marca notificações como 'processing' ANTES de buscar
 * - Verifica se já foi enviada para o mesmo cliente recentemente
 */
async function processScheduledNotificationsQueue(): Promise<void> {
  // 🔒 Verificar lock - evitar processamento paralelo
  if (isQueueProcessing) {
    console.log('📋 [QUEUE SCHEDULER] ⏳ Já existe processamento em andamento, ignorando...');
    return;
  }
  
  isQueueProcessing = true;
  
  try {
    console.log('📋 [QUEUE SCHEDULER] Buscando notificações pendentes...');
    
    // ✅ PRIMEIRO: Marcar como 'processing' para evitar duplicatas
    // Usa FOR UPDATE SKIP LOCKED para evitar race conditions entre processos
    const claimResult = await db.execute(sql`
      UPDATE scheduled_notifications
      SET status = 'processing', updated_at = NOW()
      WHERE id IN (
        SELECT id FROM scheduled_notifications
        WHERE status = 'pending'
          AND scheduled_for <= NOW()
        ORDER BY scheduled_for ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `);
    
    const claimedIds = (claimResult.rows as any[]).map(r => r.id);
    
    if (claimedIds.length === 0) {
      console.log('📋 [QUEUE SCHEDULER] Nenhuma notificação pendente para processar');
      return;
    }
    
    console.log(`📋 [QUEUE SCHEDULER] Reivindicou ${claimedIds.length} notificações para processamento`);
    
    // Buscar os dados completos das notificações reivindicadas
    // ✅ CORREÇÃO: Usar sql.raw() para strings literais no template SQL
    // O id é VARCHAR, não UUID - usar cast para text[]
    const idsArrayStr = `'{${claimedIds.join(',')}}'`;
    const pendingResult = await db.execute(sql`
      SELECT sn.*, anc.admin_id as config_admin_id,
             anc.respect_business_hours,
             anc.business_hours_start,
             anc.business_hours_end,
             anc.business_days,
             anc.ai_variation_enabled,
             anc.ai_variation_prompt,
             anc.broadcast_min_interval_seconds,
             anc.broadcast_max_interval_seconds
      FROM scheduled_notifications sn
      LEFT JOIN admin_notification_config anc ON anc.admin_id = sn.admin_id
      WHERE sn.id = ANY(${sql.raw(idsArrayStr)}::text[])
      ORDER BY sn.scheduled_for ASC
    `);
    
    const pendingNotifications = pendingResult.rows as any[];
    
    // Agrupar por admin para verificar conexão uma vez
    const adminGroups = new Map<string, any[]>();
    for (const notification of pendingNotifications) {
      const adminId = notification.admin_id;
      if (!adminGroups.has(adminId)) {
        adminGroups.set(adminId, []);
      }
      adminGroups.get(adminId)!.push(notification);
    }
    
    // Processar cada admin
    for (const [adminId, notifications] of adminGroups) {
      await processAdminScheduledQueue(adminId, notifications);
    }
    
    // ✅ Reverter notificações que não foram processadas (ainda em 'processing')
    // Usando sql.raw() para strings literais no template SQL
    // O id é VARCHAR, não UUID - usar cast para text[]
    const revertIdsArrayStr = `'{${claimedIds.join(',')}}'`;
    await db.execute(sql`
      UPDATE scheduled_notifications
      SET status = 'pending', updated_at = NOW()
      WHERE id = ANY(${sql.raw(revertIdsArrayStr)}::text[])
        AND status = 'processing'
    `);
    
  } catch (error) {
    console.error('📋 [QUEUE SCHEDULER] Erro ao processar fila:', error);
    
    // Em caso de erro, reverter todas para 'pending'
    await db.execute(sql`
      UPDATE scheduled_notifications
      SET status = 'pending', updated_at = NOW()
      WHERE status = 'processing'
    `).catch(e => console.error('Erro ao reverter status:', e));
    
  } finally {
    // 🔓 Liberar lock
    isQueueProcessing = false;
  }
}

/**
 * Processa notificações agendadas de um admin específico
 */
async function processAdminScheduledQueue(adminId: string, notifications: any[]): Promise<void> {
  try {
    // Verificar conexão WhatsApp real ou recuperável
    const { ensureAdminSessionOperational } = await import("./whatsapp");
    const adminSession = await ensureAdminSessionOperational(adminId, {
      waitMs: 4000,
      source: "notification_scheduler",
      allowPersistedAuthRecovery: true,
    });

    if (!adminSession?.socket) {
      console.log(`⚠️ [${adminId}] WhatsApp desconectado - adiando ${notifications.length} notificações`);
      return;
    }
    
    // Pegar config da primeira notificação (já incluído no JOIN)
    const config = notifications[0];
    
    // Verificar horário comercial se habilitado
    if (config?.respect_business_hours) {
      const businessConfig = {
        business_hours_start: config.business_hours_start,
        business_hours_end: config.business_hours_end,
        business_days: config.business_days
      };
      
      if (!isWithinBusinessHours(businessConfig)) {
        console.log(`⏰ [${adminId}] Fora do horário comercial - adiando ${notifications.length} notificações`);
        return;
      }
    }
    
    // ✅ CONFIGS ANTI-BAN MELHORADAS
    // Delays maiores para evitar detecção de broadcast
    const minDelay = Math.max(config?.broadcast_min_interval_seconds || 30, 30); // MÍNIMO 30s
    const maxDelay = Math.max(config?.broadcast_max_interval_seconds || 60, 60); // MÍNIMO 60s
    const batchSize = 5; // Reduzido de 10 para 5
    const batchPauseSeconds = 300; // 5 MINUTOS de pausa entre lotes (era 60s)
    
    let processed = 0;
    let failed = 0;
    let skipped = 0;
    const recentSentKeys = new Set<string>();
    const uniquePhones = Array.from(
      new Set(
        notifications
          .map((notification) => notification.recipient_phone)
          .filter((phone) => typeof phone === "string" && phone.length > 0),
      ),
    );
    const uniqueTypes = Array.from(
      new Set(
        notifications
          .map((notification) => notification.notification_type)
          .filter((notificationType) => typeof notificationType === "string" && notificationType.length > 0),
      ),
    );

    if (uniquePhones.length > 0 && uniqueTypes.length > 0) {
      try {
        const recentSendResult = await db.execute(sql`
          SELECT recipient_phone, notification_type
          FROM admin_notification_logs
          WHERE admin_id = ${adminId}
            AND status = 'sent'
            AND created_at >= NOW() - INTERVAL '4 hours'
            AND recipient_phone IN (${sql.join(uniquePhones.map((phone) => sql`${phone}`), sql`, `)})
            AND notification_type IN (${sql.join(uniqueTypes.map((notificationType) => sql`${notificationType}`), sql`, `)})
          GROUP BY recipient_phone, notification_type
        `);

        for (const row of recentSendResult.rows as any[]) {
          recentSentKeys.add(buildRecentNotificationKey(row.recipient_phone, row.notification_type));
        }
      } catch (dupSeedErr) {
        console.error(`Erro ao pré-carregar duplicatas recentes do admin ${adminId}:`, dupSeedErr);
      }
    }
    
    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];

      // Regra de segurança: se o módulo estiver desativado, cancelar qualquer pendente.
      if (!isModuleEnabledForNotificationType(notification.notification_type, config)) {
        console.log(`📋 [QUEUE] 🚫 Cancelando ${notification.notification_type} para ${notification.recipient_name} - módulo desativado`);
        skipped++;

        await db.execute(sql`
          UPDATE scheduled_notifications
          SET
            status = 'cancelled',
            updated_at = NOW(),
            error_message = COALESCE(NULLIF(error_message, ''), 'Cancelado automaticamente: módulo desativado')
          WHERE id = ${notification.id}
            AND status IN ('pending', 'processing')
        `);
        continue;
      }
      
      if (isBillingNotificationType(notification.notification_type) && (await hasActiveSubscriptionForUser(notification.user_id))) {
        console.log(`[QUEUE] Cancelando ${notification.notification_type} para ${notification.recipient_name} - cliente já possui assinatura ativa`);
        skipped++;

        await db.execute(sql`
          UPDATE scheduled_notifications
          SET
            status = 'skipped_active_plan',
            updated_at = NOW(),
            error_message = COALESCE(NULLIF(error_message, ''), 'Cancelado automaticamente: cliente já possui assinatura ativa')
          WHERE id = ${notification.id}
            AND status IN ('pending', 'processing')
        `);
        continue;
      }

      // Verificar limite diário
      if (!canSendNotification(adminId)) {
        console.log(`🚫 [${adminId}] Limite diário atingido - parando processamento`);
        break;
      }
      
      const recentNotificationKey = buildRecentNotificationKey(
        notification.recipient_phone,
        notification.notification_type,
      );
      if (recentNotificationKey && recentSentKeys.has(recentNotificationKey)) {
        console.log(`📋 [QUEUE] ⏭️ PULANDO ${notification.recipient_name} - já recebeu ${notification.notification_type} nas últimas 4h`);
        skipped++;

        await db.execute(sql`
          UPDATE scheduled_notifications 
          SET status = 'skipped_duplicate', updated_at = NOW()
          WHERE id = ${notification.id}
        `);
        continue;
      }
      
      try {
        // Buscar histórico de conversa para contexto
        let conversationHistory = '';
        try {
          const historyResult = await db.execute(sql`
            SELECT am.text, am.from_me
            FROM admin_messages am
            INNER JOIN admin_conversations ac ON am.conversation_id = ac.id
            WHERE ac.admin_id = ${adminId}
            AND (ac.contact_number LIKE ${'%' + notification.recipient_phone.slice(-8)} OR ac.contact_number LIKE ${notification.recipient_phone + '%'})
            ORDER BY am.timestamp DESC
            LIMIT 10
          `);
          
          conversationHistory = (historyResult.rows as any[]).reverse().map(msg => 
            `${msg.from_me ? 'Você' : 'Cliente'}: ${msg.text}`
          ).join('\n');
        } catch (histErr) {
          // Ignorar erro de histórico
        }
        
        // Preparar mensagem com variáveis
        const metadata = typeof notification.metadata === 'string' 
          ? JSON.parse(notification.metadata || '{}') 
          : notification.metadata || {};
          
        let finalMessage = notification.message_template
          .replace(/{cliente_nome}/g, notification.recipient_name || 'Cliente')
          .replace(/{dias_restantes}/g, metadata.daysBefore || '')
          .replace(/{dias_atraso}/g, metadata.daysOverdue || metadata.daysAfter || '')
          .replace(/{data_vencimento}/g, metadata.dueDate ? 
            new Date(metadata.dueDate).toLocaleDateString('pt-BR') : '')
          .replace(/{valor}/g, metadata.valor || '');
        
        // Aplicar variação IA se habilitada
        if (notification.ai_enabled) {
          try {
            let systemPrompt = notification.ai_prompt || config?.ai_variation_prompt || 
              'Reescreva esta mensagem de forma natural e personalizada.';
            
            // Adicionar contexto do cliente
            systemPrompt += `\n\nO nome do cliente é: ${notification.recipient_name || 'Cliente'}`;
            
            if (conversationHistory) {
              systemPrompt += `\n\nHISTÓRICO DA CONVERSA COM ESTE CLIENTE:\n---\n${conversationHistory}\n---\n\nUse este contexto para personalizar a mensagem de forma natural.`;
            }
            
            systemPrompt += '\n\nREGRAS OBRIGATÓRIAS:';
            systemPrompt += '\n1. Retorne APENAS UMA ÚNICA mensagem reescrita.';
            systemPrompt += '\n2. NÃO gere múltiplas variações ou opções alternativas.';
            systemPrompt += '\n3. NÃO use separadores como "---" ou "Ou, se preferir".';
            systemPrompt += '\n4. NÃO inclua explicações, aspas, marcadores ou prefixos.';
            systemPrompt += '\n5. Use o nome real do cliente na mensagem, NUNCA use {cliente_nome} ou outras variáveis entre chaves.';
            systemPrompt += `\n6. O nome do cliente é: ${notification.recipient_name || 'Cliente'}. Use este nome diretamente.`;
            
            // ✅ CORRIGIDO: Usar array de ChatMessage ao invés de string
            const variedMessage = await callGroq(
              [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: finalMessage }
              ],
              { temperature: 0.7, maxTokens: 400 }
            );
            
            // ✅ SANITIZAR: Remover múltiplas variações e substituir variáveis residuais
            const sanitized = sanitizeAIVariation(variedMessage, {
              '{cliente_nome}': notification.recipient_name || 'Cliente',
              '{dias_restantes}': metadata.daysBefore || '',
              '{dias_atraso}': metadata.daysOverdue || metadata.daysAfter || '',
              '{data_vencimento}': metadata.dueDate ? new Date(metadata.dueDate).toLocaleDateString('pt-BR') : '',
              '{valor}': metadata.valor || '',
            });
            
            // ✅ PROTEÇÃO REFORÇADA: Verificar se retornou mensagem válida (não genérica)
            const clientFirstName = (notification.recipient_name || '').split(' ')[0];
            const isGenericMessage = 
              !sanitized ||
              sanitized.length < 20 ||
              sanitized.toLowerCase().includes('como posso ajudar') ||
              sanitized.toLowerCase().includes('olá! como posso') ||
              sanitized.toLowerCase().includes('em que posso ajudar') ||
              sanitized.toLowerCase().includes('posso te ajudar') ||
              sanitized === 'Olá!' ||
              sanitized === 'Oi!' ||
              // Verificar se variáveis de template ficaram sem substituir
              sanitized.includes('{cliente_nome}') ||
              sanitized.includes('{dias_restantes}') ||
              sanitized.includes('{data_vencimento}') ||
              sanitized.includes('{valor}');
            
            if (!isGenericMessage) {
              finalMessage = sanitized;
              console.log(`📋 [QUEUE] ✅ IA variou mensagem para ${notification.recipient_name}`);
            } else {
              console.log(`📋 [QUEUE] ⚠️ IA retornou mensagem genérica: "${sanitized.substring(0, 50)}...", usando ORIGINAL para ${notification.recipient_name}`);
              // Manter finalMessage original - NÃO ALTERAR
            }
          } catch (aiError) {
            console.error(`📋 [QUEUE] ❌ Erro IA para ${notification.recipient_name}:`, aiError);
            // Continuar com mensagem original se IA falhar
          }
        }
        
        // Enviar mensagem COM RETRY (até 3 tentativas com backoff exponencial)
        let sent = false;
        let errorMsg = 'Falha desconhecida';
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const sendResult = await sendAdminNotification(adminId, notification.recipient_phone, finalMessage);
            sent = sendResult.success;
            errorMsg = sendResult.error || 'Falha desconhecida';
            
            if (sent) break;
            
            if (attempt < maxRetries) {
              const backoffMs = Math.pow(2, attempt) * 2000; // 4s, 8s
              console.log(`📋 [QUEUE] ⚠️ Tentativa ${attempt}/${maxRetries} falhou para ${notification.recipient_name}: ${errorMsg}. Retry em ${backoffMs/1000}s...`);
              await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
          } catch (retryErr) {
            errorMsg = String(retryErr);
            if (attempt < maxRetries) {
              const backoffMs = Math.pow(2, attempt) * 2000;
              console.log(`📋 [QUEUE] ⚠️ Tentativa ${attempt}/${maxRetries} erro para ${notification.recipient_name}: ${errorMsg}. Retry em ${backoffMs/1000}s...`);
              await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
          }
        }
        
        if (sent) {
          processed++;
          incrementDailyCounter(adminId);
          if (recentNotificationKey) {
            recentSentKeys.add(recentNotificationKey);
          }
          console.log(`📋 [QUEUE] ✓ Enviado para ${notification.recipient_name} (${processed}/${notifications.length})`);
        } else {
          failed++;
          console.log(`📋 [QUEUE] ✗ Falha ao enviar para ${notification.recipient_name} após ${maxRetries} tentativas: ${errorMsg}`);
        }
        
        // Atualizar status da notificação
        await db.execute(sql`
          UPDATE scheduled_notifications 
          SET 
            status = ${sent ? 'sent' : 'failed'},
            sent_at = NOW(),
            final_message = ${finalMessage},
            conversation_context = ${conversationHistory || ''},
            error_message = ${sent ? null : errorMsg}
          WHERE id = ${notification.id}
        `);
        
        // Registrar log
        await db.execute(sql`
          INSERT INTO admin_notification_logs (
            admin_id, user_id, notification_type, recipient_phone, recipient_name,
            message_original, message_sent, status, metadata, created_at, sent_at, error_message
          ) VALUES (
            ${adminId}, ${notification.user_id}, ${notification.notification_type},
            ${notification.recipient_phone}, ${notification.recipient_name},
            ${notification.message_template}, ${finalMessage}, ${sent ? 'sent' : 'failed'},
            ${typeof notification.metadata === 'string' ? notification.metadata : JSON.stringify(notification.metadata)}::jsonb, NOW(), NOW(),
            ${sent ? null : errorMsg}
          )
        `);
        
        // DELAY ENTRE MENSAGENS (anti-ban) - SEMPRE USAR
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        
        // Pausa maior a cada lote de 10
        if ((i + 1) % batchSize === 0 && i + 1 < notifications.length) {
          console.log(`📋 [QUEUE] Pausa de ${batchPauseSeconds}s após lote de ${batchSize} mensagens...`);
          await new Promise(resolve => setTimeout(resolve, batchPauseSeconds * 1000));
        } else if (i + 1 < notifications.length) {
          console.log(`📋 [QUEUE] Aguardando ${delay}s antes da próxima mensagem...`);
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
        
      } catch (error) {
        console.error(`📋 [QUEUE] Erro processando ${notification.recipient_name}:`, error);
        failed++;
        await db.execute(sql`
          UPDATE scheduled_notifications 
          SET status = 'failed', error_message = ${String(error)}
          WHERE id = ${notification.id}
        `);
      }
    }
    
    console.log(`📋 [QUEUE] Admin ${adminId}: ${processed} enviados, ${failed} falhas, ${skipped} pulados (duplicatas)`);
    
  } catch (error) {
    console.error(`📋 [QUEUE] Erro ao processar admin ${adminId}:`, error);
  }
}

/**
 * Busca configurações de notificação ativas
 */
async function getActiveNotificationConfigs(): Promise<any[]> {
  try {
    if (cachedActiveNotificationConfigs && cachedActiveNotificationConfigs.expiresAt > Date.now()) {
      return cachedActiveNotificationConfigs.rows;
    }

    const result = await db.execute(sql`
      SELECT * FROM admin_notification_config 
      WHERE payment_reminder_enabled = true 
         OR overdue_reminder_enabled = true 
         OR periodic_checkin_enabled = true
         OR disconnected_alert_enabled = true
    `);
    const rows = result.rows as any[];
    cachedActiveNotificationConfigs = {
      rows,
      expiresAt: Date.now() + ACTIVE_NOTIFICATION_CONFIGS_CACHE_TTL_MS,
    };
    return rows;
  } catch (error) {
    console.error('Erro ao buscar configs de notificação:', error);
    return [];
  }
}

/**
 * Processa notificações para um admin específico
 */
async function processAdminNotifications(config: any): Promise<void> {
  const adminId = config.admin_id;
  
  try {
    // Verificar horário comercial
    if (config.respect_business_hours && !isWithinBusinessHours(config)) {
      console.log(`🔔 [${adminId}] Fora do horário comercial, pulando...`);
      return;
    }

    // Buscar usuários do admin
    const users = await getAdminUsers(adminId);
    
    for (const user of users) {
      // Verificar se WhatsApp está desconectado
      if (config.disconnected_alert_enabled) {
        await checkDisconnectedAlert(config, user);
      }

      // Verificar lembretes de pagamento
      if (config.payment_reminder_enabled && user.planExpiresAt) {
        await checkPaymentReminder(config, user);
      }

      // Verificar notificações de atraso
      if (config.overdue_reminder_enabled && user.planExpiresAt) {
        await checkOverdueReminder(config, user);
      }

      // Verificar check-in periódico
      if (config.periodic_checkin_enabled) {
        await checkPeriodicCheckin(config, user);
      }
    }
  } catch (error) {
    console.error(`🔔 [${adminId}] Erro ao processar notificações:`, error);
  }
}

/**
 * Verifica se está dentro do horário comercial
 */
function isWithinBusinessHours(config: any): boolean {
  // Usar fuso horário de Brasília para verificar horário comercial
  const now = new Date();
  const options = { timeZone: 'America/Sao_Paulo' };
  
  // Obter dia da semana em Brasília
  const dayOfWeek = new Date(now.toLocaleString('en-US', options)).getDay(); // 0 = domingo, 6 = sábado
  
  // Obter hora atual em Brasília no formato HH:MM
  const currentTime = now.toLocaleTimeString('pt-BR', { 
    timeZone: 'America/Sao_Paulo', 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false 
  });

  // Verificar dia da semana
  const businessDays = config.business_days || [1, 2, 3, 4, 5];
  if (!businessDays.includes(dayOfWeek)) {
    console.log(`⏰ [BUSINESS HOURS] Dia ${dayOfWeek} não está nos dias comerciais: ${businessDays}`);
    return false;
  }

  // Verificar horário
  const startTime = (config.business_hours_start || '09:00').slice(0, 5);
  const endTime = (config.business_hours_end || '18:00').slice(0, 5);
  
  const isWithin = currentTime >= startTime && currentTime <= endTime;
  console.log(`⏰ [BUSINESS HOURS] Hora atual BRT: ${currentTime}, Comercial: ${startTime}-${endTime}, Permitido: ${isWithin}`);
  
  return isWithin;
}

/**
 * Busca usuários de um admin
 * NOTE: There is NO parent_id column in the users table.
 * In this single-admin system, all users belong to the admin.
 * We exclude the admin's own user record (matched by email from admins table).
 */
async function getAdminUsers(adminId: string): Promise<any[]> {
  try {
    const result = await db.execute(sql`
      SELECT 
        u.id,
        u.phone,
        u.name,
        COALESCE(wc.is_connected_effective, false) as whatsapp_connected,
        wc.phone_number as whatsapp_phone_number,
        CASE
          WHEN COALESCE(wc.is_connected_effective, false) = false AND wc.phone_number IS NOT NULL THEN wc.updated_at
          ELSE NULL
        END as whatsapp_disconnected_at,
        s.expires_at as plan_expires_at,
        s.status as subscription_status
      FROM users u
      LEFT JOIN LATERAL (
        SELECT
          CASE
            WHEN c.provider = 'baileys'
              AND COALESCE(NULLIF(c.connection_method, ''), 'qr') <> 'coexistence'
              AND COALESCE(NULLIF(c.provider_status, ''), 'inactive') = 'connected'
            THEN true
            ELSE COALESCE(c.is_connected, false)
          END as is_connected_effective,
          c.phone_number,
          c.updated_at
        FROM whatsapp_connections c
        WHERE c.user_id = u.id
        ORDER BY c.created_at DESC
        LIMIT 1
      ) wc ON true
      LEFT JOIN subscriptions s ON s.user_id = u.id
      WHERE u.id != (
        SELECT uu.id FROM users uu 
        JOIN admins a ON a.email = uu.email 
        WHERE a.id = ${adminId}
        LIMIT 1
      )
      AND u.role != 'owner'
      ORDER BY u.created_at DESC
    `);
    return result.rows;
  } catch (error) {
    console.error('Erro ao buscar usuários do admin:', error);
    return [];
  }
}

/**
 * Verifica alerta de WhatsApp desconectado
 */
async function checkDisconnectedAlert(config: any, user: any): Promise<void> {
  if (user.whatsapp_connected) return;
  if (!user.whatsapp_phone_number) return;

  const disconnectedAt = user.whatsapp_disconnected_at ? new Date(user.whatsapp_disconnected_at) : null;
  if (!disconnectedAt) return;

  const hoursDisconnected = (Date.now() - disconnectedAt.getTime()) / (1000 * 60 * 60);
  const alertHours = config.disconnected_alert_hours || 2;

  if (hoursDisconnected >= alertHours) {
    // ✅ CORRIGIDO: Verificar usando 'disconnected' (tipo real usado nos logs)
    // Antes usava 'disconnected_alert' que nunca encontrava nos logs
    const recentlySent = await wasNotificationSentRecently(
      config.admin_id,
      user.id,
      'disconnected', // ✅ Tipo correto
      24
    );

    if (!recentlySent) {
      // ✅ CORRIGIDO: Usar 'disconnected' para consistência com a fila
      await sendNotification(config, user, 'disconnected', {
        hoursDisconnected: Math.floor(hoursDisconnected),
      });
    }
  }
}

/**
 * Verifica lembrete de pagamento
 */
async function checkPaymentReminder(config: any, user: any): Promise<void> {
  const expiresAt = new Date(user.plan_expires_at);
  const daysUntilExpiration = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const reminderDays = config.payment_reminder_days_before || [7, 3, 1];
  
  // Ordenar do maior para o menor (ex: [7, 3, 1]) para enviar o lembrete mais relevante
  const sortedDays = [...reminderDays].sort((a: number, b: number) => b - a);
  
  for (const days of sortedDays) {
    // ✅ FIX: Usar range ao invés de === para não perder notificações
    // Se faltam X dias ou menos que X (mas mais que o próximo nível), enviar
    if (daysUntilExpiration > 0 && daysUntilExpiration <= days) {
      const recentlySent = await wasNotificationSentRecently(
        config.admin_id,
        user.id,
        'payment_reminder',
        48 // Não reenviar se já enviou nas últimas 48h
      );

      if (!recentlySent) {
        await sendNotification(config, user, 'payment_reminder', {
          daysUntilExpiration: daysUntilExpiration,
          expirationDate: expiresAt.toLocaleDateString('pt-BR'),
        });
        break; // Enviar apenas um lembrete por vez
      }
    }
  }
}

/**
 * Verifica notificação de atraso
 */
async function checkOverdueReminder(config: any, user: any): Promise<void> {
  const expiresAt = new Date(user.plan_expires_at);
  const daysOverdue = Math.ceil((Date.now() - expiresAt.getTime()) / (1000 * 60 * 60 * 24));

  if (daysOverdue <= 0) return; // Plano ainda válido

  const overdueReminderDays = config.overdue_reminder_days_after || [1, 3, 7, 14];
  
  // Ordenar do menor para o maior (ex: [1, 3, 7, 14]) - enviar a cobrança mais adequada
  const sortedOverdueDays = [...overdueReminderDays].sort((a: number, b: number) => a - b);
  
  for (const days of sortedOverdueDays) {
    // ✅ FIX: Usar range ao invés de === para não perder cobranças
    if (daysOverdue >= days) {
      const recentlySent = await wasNotificationSentRecently(
        config.admin_id,
        user.id,
        'overdue_reminder',
        48
      );

      if (!recentlySent) {
        await sendNotification(config, user, 'overdue_reminder', {
          daysOverdue: daysOverdue,
          expirationDate: expiresAt.toLocaleDateString('pt-BR'),
        });
        break;
      }
    }
  }
}

/**
 * Verifica check-in periódico
 */
async function checkPeriodicCheckin(config: any, user: any): Promise<void> {
  // Buscar última interação
  const lastLog = await getLastNotificationLog(config.admin_id, user.id, 'periodic_checkin');
  
  const minDays = config.periodic_checkin_min_days || 7;
  const maxDays = config.periodic_checkin_max_days || 15;
  
  // Escolher intervalo aleatório entre min e max
  const randomInterval = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;
  
  if (!lastLog) {
    // Primeira vez - enviar após intervalo mínimo
    await sendNotification(config, user, 'periodic_checkin', {
      randomInterval,
    });
  } else {
    const daysSinceLastCheckin = Math.ceil(
      (Date.now() - new Date(lastLog.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLastCheckin >= randomInterval) {
      await sendNotification(config, user, 'periodic_checkin', {
        daysSinceLastCheckin,
        randomInterval,
      });
    }
  }
}

/**
 * Envia uma notificação COM VERIFICAÇÃO DE SESSÃO E RETRY
 */
async function sendNotification(
  config: any,
  user: any,
  type: string,
  data: any
): Promise<void> {
  try {
    const effectiveConfig = sanitizeAdminNotificationConfig(config) || {};

    // ✅ VERIFICAR SE ADMIN TEM SESSÃO WHATSAPP ATIVA
    const { getAdminSession } = await import("./whatsapp");
    const adminSession = getAdminSession(effectiveConfig.admin_id);
    
    if (!adminSession || !adminSession.socket?.user) {
      console.log(`⚠️ [${effectiveConfig.admin_id}] WhatsApp desconectado - pulando notificação`);
      
      // Registrar falha por WhatsApp offline
      await storage.createAdminNotificationLog?.({
        adminId: effectiveConfig.admin_id,
        userId: user.id,
        notificationType: type,
        recipientPhone: user.phone,
        recipientName: user.name,
        messageSent: '',
        messageOriginal: '',
        status: 'failed',
        errorMessage: 'WhatsApp do admin desconectado',
        metadata: data,
      });
      
      return;
    }

    // ✅ VERIFICAR LIMITE DIÁRIO
    if (!canSendNotification(effectiveConfig.admin_id)) {
      console.log(`🚫 [${effectiveConfig.admin_id}] Limite diário atingido (${DAILY_NOTIFICATION_LIMIT}/dia)`);
      return;
    }

    // Selecionar template
    let template = '';
    switch (type) {
      case 'payment_reminder':
        template = effectiveConfig.payment_reminder_message_template || '';
        break;
      case 'overdue_reminder':
        template = effectiveConfig.overdue_reminder_message_template || '';
        break;
      case 'periodic_checkin':
        template = effectiveConfig.periodic_checkin_message_template || '';
        break;
      case 'disconnected':  // ✅ CORRIGIDO: Aceita 'disconnected' (tipo padronizado)
      case 'disconnected_alert':  // Mantém retrocompatibilidade
        template = effectiveConfig.disconnected_alert_message_template || '';
        break;
    }

    if (!template) {
      console.log(`🔔 Template vazio para ${type}, pulando...`);
      return;
    }

    // Substituir variáveis (suporta tanto {cliente_nome} quanto {nome})
    let message = template
      .replace(/\{cliente_nome\}/g, user.name || 'Cliente')
      .replace(/\{nome\}/g, user.name || 'Cliente')
      .replace(/\{dias_restantes\}/g, data.daysUntilExpiration || '')
      .replace(/\{dias_atraso\}/g, data.daysOverdue || '')
      .replace(/\{dias\}/g, data.daysUntilExpiration || data.daysOverdue || data.daysSinceLastCheckin || '')
      .replace(/\{data_vencimento\}/g, data.expirationDate || '')
      .replace(/\{data\}/g, data.expirationDate || '')
      .replace(/\{valor\}/g, data.valor || '')
      .replace(/\{horas\}/g, data.hoursDisconnected || '');

    // ✅ APLICAR VARIAÇÃO COM IA SE HABILITADO (anti-bot)
    if (effectiveConfig.ai_variation_enabled) {
      message = await applyAIVariation(message, effectiveConfig.ai_variation_prompt, user.name);
    }

    // ✅ ENVIAR COM RETRY (até 3 tentativas com backoff exponencial)
    let result = { success: false, error: '' };
    for (let attempt = 1; attempt <= 3; attempt++) {
      result = await sendAdminNotification(effectiveConfig.admin_id, user.phone, message);
      
      if (result.success) break;
      
      // Backoff exponencial: 2s, 4s, 8s
      if (attempt < 3) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`⏳ [${effectiveConfig.admin_id}] Tentativa ${attempt} falhou, aguardando ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    // Registrar log
      await storage.createAdminNotificationLog?.({
      adminId: effectiveConfig.admin_id,
      userId: user.id,
      notificationType: type,
      recipientPhone: user.phone,
      recipientName: user.name,
      messageSent: message,
      messageOriginal: template,
      status: result.success ? 'sent' : 'failed',
      errorMessage: result.error,
      metadata: {
        ...data,
        aiVariationUsed: effectiveConfig.ai_variation_enabled,
      },
    });

    if (result.success) {
      // Incrementar contador diário
      incrementDailyCounter(effectiveConfig.admin_id);
      console.log(`✅ [${effectiveConfig.admin_id}] ${type} enviado para ${user.phone}`);
    } else {
      console.error(`❌ [${effectiveConfig.admin_id}] Falha ao enviar ${type} após 3 tentativas:`, result.error);
    }
  } catch (error) {
    console.error(`🔔 Erro ao enviar notificação ${type}:`, error);
  }
}

/**
 * ✅ APLICA VARIAÇÃO COM IA NA MENSAGEM - GERA MENSAGEM ÚNICA PARA CADA CLIENTE
 * Isso evita detecção de bot pelo WhatsApp
 * ✅ CORRIGIDO: Agora garante UMA ÚNICA variação e substitui {cliente_nome}
 */
export async function applyAIVariation(message: string, customPrompt?: string, clientName?: string): Promise<string> {
  try {
    const prompt = buildAIVariationPrompt(customPrompt, clientName);
    const groundedUserMessage = [
      "MENSAGEM BASE (fonte única da verdade):",
      message,
      clientName ? `NOME REAL DO CLIENTE NO CONTEXTO: ${clientName}` : "",
      "Tarefa: varie a mensagem base preservando os fatos concretos e a identidade já presentes nela.",
    ].filter(Boolean).join("\n\n");

    const result = await callGroq([
      { role: 'system', content: prompt },
      { role: 'user', content: groundedUserMessage },
    ], {
      temperature: 0.7,
      max_tokens: 400,
    });

    // ✅ SANITIZAR: Remover múltiplas variações e substituir variáveis residuais
    const sanitized = sanitizeAIVariation(result, {
      '{cliente_nome}': clientName || 'Cliente',
    });
    
    // ✅ PROTEÇÃO REFORÇADA contra mensagens genéricas e variáveis não-substituídas
    const isGenericMessage = 
      !sanitized ||
      sanitized.length < 20 ||
      sanitized.toLowerCase().includes('como posso ajudar') ||
      sanitized.toLowerCase().includes('olá! como posso') ||
      sanitized.toLowerCase().includes('em que posso ajudar') ||
      sanitized.toLowerCase().includes('posso te ajudar') ||
      sanitized === 'Olá!' ||
      sanitized === 'Oi!' ||
      // Verificar se variáveis de template ficaram sem substituir
      sanitized.includes('{cliente_nome}') ||
      sanitized.includes('{dias_restantes}') ||
      sanitized.includes('{data_vencimento}') ||
      sanitized.includes('{valor}');
    
    if (isGenericMessage) {
      console.log(`⚠️ [AI VARIATION] Mensagem genérica detectada, usando original: "${sanitized.substring(0, 30)}..."`);
      return message; // Retornar mensagem original
    }

    return sanitized;
  } catch (error) {
    console.error('⚠️ Erro ao aplicar variação IA:', error);
    return message; // Retornar mensagem original se falhar
  }
}

/**
 * ✅ VERIFICA SE PODE ENVIAR NOTIFICAÇÃO (limite diário)
 */
function canSendNotification(adminId: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  const key = `${adminId}_${today}`;
  
  const counter = dailyCounters.get(key);
  
  if (!counter || counter.date !== today) {
    // Novo dia ou primeiro envio
    return true;
  }
  
  return counter.count < DAILY_NOTIFICATION_LIMIT;
}

/**
 * ✅ INCREMENTA CONTADOR DIÁRIO
 */
function incrementDailyCounter(adminId: string): void {
  const today = new Date().toISOString().split('T')[0];
  const key = `${adminId}_${today}`;
  
  const counter = dailyCounters.get(key);
  
  if (!counter || counter.date !== today) {
    dailyCounters.set(key, { count: 1, date: today });
  } else {
    counter.count++;
  }
}

/**
 * ✅ LIMPA CONTADORES ANTIGOS (executar diariamente)
 */
function cleanOldCounters(): void {
  const today = new Date().toISOString().split('T')[0];
  
  for (const [key, counter] of dailyCounters.entries()) {
    if (counter.date !== today) {
      dailyCounters.delete(key);
    }
  }
}

/**
 * Verifica se uma notificação foi enviada recentemente
 */
async function wasNotificationSentRecently(
  adminId: string,
  userId: string,
  notificationType: string,
  hoursAgo: number
): Promise<boolean> {
  try {
    const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM admin_notification_logs
      WHERE admin_id = ${adminId}
        AND user_id = ${userId}
        AND notification_type = ${notificationType}
        AND created_at >= ${cutoffTime.toISOString()}
        AND status = 'sent'
      LIMIT 1
    `);

    return (result.rows[0]?.count || 0) > 0;
  } catch (error) {
    console.error('Erro ao verificar notificação recente:', error);
    return false;
  }
}

/**
 * Busca último log de notificação
 */
async function getLastNotificationLog(
  adminId: string,
  userId: string,
  notificationType: string
): Promise<any | null> {
  try {
    const result = await db.execute(sql`
      SELECT * FROM admin_notification_logs
      WHERE admin_id = ${adminId}
        AND user_id = ${userId}
        AND notification_type = ${notificationType}
        AND status = 'sent'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return result.rows[0] || null;
  } catch (error) {
    console.error('Erro ao buscar último log:', error);
    return null;
  }
}

function buildRecentNotificationKey(phone: unknown, notificationType: unknown): string | null {
  if (typeof phone !== 'string' || typeof notificationType !== 'string') {
    return null;
  }

  if (!phone || !notificationType) {
    return null;
  }

  return `${phone}::${notificationType}`;
}

async function processExpiredSubscriptionsIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastExpiredSubscriptionsCheckAt < EXPIRED_SUBSCRIPTIONS_CHECK_INTERVAL_MS) {
    return;
  }

  await processExpiredSubscriptions();
  lastExpiredSubscriptionsCheckAt = now;
}

/**
 * 📦 VERIFICA E ATUALIZA PLANOS VENCIDOS AUTOMATICAMENTE
 * 
 * Esta função é executada periodicamente para:
 * 1. Encontrar subscriptions com status='active' mas data_fim < NOW()
 * 2. Marcar essas subscriptions como 'expired'
 * 3. Logar as alterações para auditoria
 * 
 * IMPORTANTE: Clientes com plano vencido voltam ao limite de 25 mensagens de teste
 * A verificação de limite é feita no whatsapp.ts ao processar mensagens
 */
export async function processExpiredSubscriptions(): Promise<void> {
  try {
    console.log('📦 [SUBSCRIPTION CHECKER] Verificando planos vencidos...');
    
    // Buscar subscriptions que estão active mas com data_fim no passado
    // Adicionar período de carência de 5 dias para pagamentos recorrentes
    const result = await db.execute(sql`
      UPDATE subscriptions
      SET status = 'expired', updated_at = NOW()
      WHERE status = 'active'
        AND data_fim IS NOT NULL
        AND data_fim < NOW()
        AND (
          -- Se não é pagamento recorrente, expira imediatamente
          next_payment_date IS NULL
          OR
          -- Se é recorrente, dá 5 dias de carência após next_payment_date
          next_payment_date + INTERVAL '5 days' < NOW()
        )
      RETURNING id, user_id, data_fim, plan_id
    `);
    
    const expiredSubs = result.rows as any[];
    
    if (expiredSubs.length > 0) {
      console.log(`📦 [SUBSCRIPTION CHECKER] ⚠️ ${expiredSubs.length} plano(s) marcado(s) como expirado(s):`);
      
      for (const sub of expiredSubs) {
        console.log(`   - Subscription ${sub.id}: User ${sub.user_id}, venceu em ${sub.data_fim}`);
        
        // Logar para auditoria
        try {
          await db.execute(sql`
            INSERT INTO admin_notification_logs (
              id, admin_id, user_id, client_phone, 
              notification_type, message_content, status, created_at
            ) VALUES (
              ${crypto.randomUUID()},
              ${sub.user_id},
              ${sub.user_id},
              'SYSTEM',
              'subscription_expired',
              ${'Plano expirado automaticamente. data_fim: ' + sub.data_fim + '. Cliente volta ao limite de 25 mensagens de teste.'},
              'sent',
              NOW()
            )
          `);
        } catch (logError) {
          console.error('Erro ao logar expiração:', logError);
        }
      }
    } else {
      console.log('📦 [SUBSCRIPTION CHECKER] ✅ Nenhum plano vencido para atualizar');
    }
    
  } catch (error) {
    console.error('📦 [SUBSCRIPTION CHECKER] Erro:', error);
  }
}
