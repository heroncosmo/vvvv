import { db } from "./db";
import { 
  followupLogs,
  adminConversations,
  conversations,
  users,
  subscriptions,
  plans,
  paymentHistory,
} from "@shared/schema";
import { eq, desc, and, lte, isNull } from "drizzle-orm";

/**
 * Armazenamento para follow-up de não pagantes
 * Gerencia configurações, tentativas e histórico
 */

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

interface NotapayerFollowupConfig {
  id?: number;
  isEnabled: boolean;
  activeDays: number;
  maxAttempts: number;
  messageTemplate: string;
  tone: "friendly" | "professional" | "urgent";
  useEmojis: boolean;
  activeDaysStart: number;
  activeDaysEnd: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Busca ou cria configuração de follow-up para não pagantes
 */
async function getNotapayerFollowupConfig(): Promise<NotapayerFollowupConfig | null> {
  const config = await db.query.followupLogs.findFirst({
    where: eq(followupLogs.id, 1), // Usando ID 1 como configuração global
  });

  if (config) {
    return {
      id: config.id,
      isEnabled: config.messageContent === "true", // Hack para compatibilidade
      activeDays: 3,
      maxAttempts: 3,
      messageTemplate: config.messageContent || "Olá! Seu plano expirou. Quer renovar?",
      tone: "friendly",
      useEmojis: true,
      activeDaysStart: 1,
      activeDaysEnd: 7,
    };
  }

  return null;
}

/**
 * Atualiza configuração de follow-up para não pagantes
 */
async function updateNotapayerFollowupConfig(data: Partial<NotapayerFollowupConfig>): Promise<NotapayerFollowupConfig> {
  const now = new Date();
  
  const [updated] = await db.update(followupLogs)
    .set({
      messageContent: JSON.stringify(data),
      updatedAt: now,
    })
    .where(eq(followupLogs.id, 1))
    .returning();

  if (updated) {
    return {
      id: updated.id,
      isEnabled: data.isEnabled ?? false,
      activeDays: data.activeDays ?? 3,
      maxAttempts: data.maxAttempts ?? 3,
      messageTemplate: data.messageTemplate ?? "Olá! Seu plano expirou. Quer renovar?",
      tone: data.tone ?? "friendly",
      useEmojis: data.useEmojis ?? true,
      activeDaysStart: data.activeDaysStart ?? 1,
      activeDaysEnd: data.activeDaysEnd ?? 7,
      updatedAt: updated.updatedAt,
    };
  }

  // Criar nova configuração
  const [newConfig] = await db.insert(followupLogs)
    .values({
      id: 1,
      messageContent: JSON.stringify(data),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return {
    id: newConfig.id,
    isEnabled: data.isEnabled ?? false,
    activeDays: data.activeDays ?? 3,
    maxAttempts: data.maxAttempts ?? 3,
    messageTemplate: data.messageTemplate ?? "Olá! Seu plano expirou. Quer renovar?",
    tone: data.tone ?? "friendly",
    useEmojis: data.useEmojis ?? true,
    activeDaysStart: data.activeDaysStart ?? 1,
    activeDaysEnd: data.activeDaysEnd ?? 7,
    createdAt: newConfig.createdAt,
    updatedAt: newConfig.updatedAt,
  };
}

// ============================================================================
// TENTATIVAS DE FOLLOW-UP
// ============================================================================

interface NotapayerFollowupAttempt {
  id?: number;
  userId: string;
  subscriptionId: number;
  message: string;
  sentAt: Date;
  status: "sent" | "failed" | "cancelled";
  response?: string;
  responseDate?: Date;
}

/**
 * Cria registro de tentativa de follow-up
 */
async function createNotapayerFollowupAttempt(data: NotapayerFollowupAttempt): Promise<NotapayerFollowupAttempt> {
  const [attempt] = await db.insert(followupLogs)
    .values({
      messageContent: data.message,
      status: data.status,
      executedAt: data.sentAt,
      createdAt: data.sentAt,
    })
    .returning();

  return {
    id: attempt.id,
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    message: data.message,
    sentAt: data.sentAt,
    status: data.status,
  };
}

/**
 * Busca tentativas de follow-up para um usuário
 */
async function getNotapayerFollowupAttempts(userId: string): Promise<NotapayerFollowupAttempt[]> {
  const attempts = await db.query.followupLogs.findMany({
    where: eq(followupLogs.id, userId), // Usando ID do usuário como hack
    orderBy: (logs, { desc }) => [desc(logs.executedAt)],
  });

  return attempts.map(attempt => ({
    id: attempt.id,
    userId: userId,
    subscriptionId: 0,
    message: attempt.messageContent || "",
    sentAt: new Date(attempt.executedAt || attempt.createdAt),
    status: attempt.status as "sent" | "failed" | "cancelled",
  }));
}

/**
 * Busca histórico completo de follow-ups
 */
async function getNotapayerFollowupHistory(limit: number = 100): Promise<NotapayerFollowupAttempt[]> {
  const attempts = await db.query.followupLogs.findMany({
    where: eq(followupLogs.id, 1), // Hack para buscar todos
    orderBy: (logs, { desc }) => [desc(logs.executedAt)],
    limit,
  });

  return attempts.map(attempt => ({
    id: attempt.id,
    userId: "",
    subscriptionId: 0,
    message: attempt.messageContent || "",
    sentAt: new Date(attempt.executedAt || attempt.createdAt),
    status: attempt.status as "sent" | "failed" | "cancelled",
  }));
}

// ============================================================================
// EXPORTS
// ============================================================================

export const notapayerFollowupStorage = {
  getNotapayerFollowupConfig,
  updateNotapayerFollowupConfig,
  createNotapayerFollowupAttempt,
  getNotapayerFollowupAttempts,
  getNotapayerFollowupHistory,
};
