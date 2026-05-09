import { Express, Request, Response } from "express";
import { isAdmin } from "./middleware";
import { storage } from "./storage";
import { db as dbClient } from "./db";
import { z } from "zod";
import {
  followupConfigs,
  conversations,
  users,
  subscriptions,
  plans,
  paymentHistory
} from "@shared/schema";
import { followUpService } from "./followUpService";
import { eq, and, lte, isNull, or } from "drizzle-orm";

// ============================================================================
// ROUTES PARA FOLLOW-UP DE NÃO PAGANTES
// ============================================================================

export function registerNotapayersRoutes(app: Express) {

  // ==================== CONFIGURAÇÃO ====================

  /**
   * GET /api/admin/notapayers/followup-config
   * Retorna configuração atual de follow-up para não pagantes
   */
  app.get("/api/admin/notapayers/followup-config", isAdmin, async (req: any, res: Response) => {
    try {
      const config = await storage.getNotapayerFollowupConfig();

      res.json({
        success: true,
        config: config || {
          isEnabled: false,
          activeDays: 3, // Dias após expiração
          maxAttempts: 3,
          messageTemplate: "Olá! Seu plano expirou. Quer renovar?",
          tone: "friendly",
          useEmojis: true,
          activeDaysStart: 1,
          activeDaysEnd: 7,
        }
      });
    } catch (error: any) {
      console.error("Erro ao buscar configuração:", error);
      res.status(500).json({ success: false, message: "Erro ao buscar configuração" });
    }
  });

  /**
   * PUT /api/admin/notapayers/followup-config
   * Atualiza configuração de follow-up para não pagantes
   */
  app.put("/api/admin/notapayers/followup-config", isAdmin, async (req: any, res: Response) => {
    try {
      const schema = z.object({
        isEnabled: z.boolean().optional(),
        activeDays: z.number().optional(),
        maxAttempts: z.number().optional(),
        messageTemplate: z.string().optional(),
        tone: z.enum(["friendly", "professional", "urgent"]).optional(),
        useEmojis: z.boolean().optional(),
        activeDaysStart: z.number().optional(),
        activeDaysEnd: z.number().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Dados inválidos",
          errors: parsed.error.errors
        });
      }

      const config = await storage.updateNotapayerFollowupConfig(parsed.data);

      res.json({
        success: true,
        config,
        message: "Configuração atualizada com sucesso"
      });
    } catch (error: any) {
      console.error("Erro ao atualizar configuração:", error);
      res.status(500).json({ success: false, message: "Erro ao atualizar configuração" });
    }
  });

  // ==================== LISTA DE NÃO PAGANTES ====================

  /**
   * GET /api/admin/notapayers/list
   * Lista não pagantes elegíveis para follow-up
   */
  app.get("/api/admin/notapayers/list", isAdmin, async (req: any, res: Response) => {
    try {
      const config = await storage.getNotapayerFollowupConfig();

      if (!config || !config.isEnabled) {
        return res.json({
          success: true,
          data: [],
          message: "Follow-up para não pagantes está desativado"
        });
      }

      const now = new Date();
      const activeDaysStart = config.activeDaysStart || 1;
      const activeDaysEnd = config.activeDaysEnd || 7;

      // Buscar assinaturas inativas ou expiradas
      const inactiveSubscriptions = await dbClient.query.subscriptions.findMany({
        where: (subs, { and, lte, or, eq }) => and(
          or(eq(subs.status, 'expired'), eq(subs.status, 'cancelled')),
          lte(subs.dataFim, now)
        ),
        with: {
          user: true,
          plan: true,
        }
      });

      // Filtrar apenas assinaturas dentro do período de follow-up
      const eligibleSubscriptions = inactiveSubscriptions.filter(sub => {
        const dataFim = sub.dataFim ? new Date(sub.dataFim) : null;
        if (!dataFim) return false;
        const daysSinceExpiry = (now.getTime() - dataFim.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceExpiry >= activeDaysStart && daysSinceExpiry <= activeDaysEnd;
      });

      // Contar tentativas já realizadas
      const listWithAttempts = await Promise.all(
        eligibleSubscriptions.map(async (sub) => {
          const attempts = await storage.getNotapayerFollowupAttempts(sub.userId);
          const dataFim = sub.dataFim ? new Date(sub.dataFim) : null;

          return {
            id: sub.id,
            userId: sub.userId,
            userName: (sub as any).user?.name || (sub as any).user?.nome || "Desconhecido",
            userEmail: (sub as any).user?.email || "",
            phone: (sub as any).user?.whatsappNumber || "",
            planName: (sub as any).plan?.nome || "Plano",
            planPrice: (sub as any).plan?.valor || "0",
            expiresAt: sub.dataFim,
            daysSinceExpiry: dataFim ? Math.floor((now.getTime() - dataFim.getTime()) / (1000 * 60 * 60 * 24)) : 0,
            attempts: attempts.length,
            lastAttempt: attempts[attempts.length - 1] || null,
          };
        })
      );

      res.json({
        success: true,
        data: listWithAttempts,
        total: listWithAttempts.length,
      });
    } catch (error: any) {
      console.error("Erro ao listar não pagantes:", error);
      res.status(500).json({ success: false, message: "Erro ao listar não pagantes" });
    }
  });

  // ==================== ENVIAR FOLLOW-UP ====================

  /**
   * POST /api/admin/notapayers/send-followup/:userId
   * Envia follow-up manual para um não pagante específico
   */
  app.post("/api/admin/notapayers/send-followup/:userId", isAdmin, async (req: any, res: Response) => {
    try {
      const { userId } = req.params;

      // Verificar se usuário existe
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "Usuário não encontrado" });
      }

      // Verificar se tem assinatura inativa
      const inactiveSub = await dbClient.query.subscriptions.findFirst({
        where: (subs, { and, lte, or, eq }) => and(
          eq(subs.userId, userId),
          or(eq(subs.status, 'expired'), eq(subs.status, 'cancelled')),
          lte(subs.dataFim, new Date())
        )
      });

      if (!inactiveSub) {
        return res.status(404).json({
          success: false,
          message: "Usuário não tem assinatura inativa"
        });
      }

      // Obter configuração
      const config = await storage.getNotapayerFollowupConfig();
      if (!config) {
        return res.status(500).json({
          success: false,
          message: "Configuração de follow-up não encontrada"
        });
      }

      // Enviar mensagem via WhatsApp
      const message = config.messageTemplate.replace(/{userName}/g, user.name || "cliente");

      // Usar serviço de envio de WhatsApp
      const connection = await storage.getConnectionByUserId(userId);
      if (!connection) {
        return res.status(404).json({
          success: false,
          message: "WhatsApp não conectado para este usuário"
        });
      }

      // Aqui você usaria o serviço de envio de WhatsApp real
      // Por enquanto, vamos apenas registrar no log
      console.log(`[NOTAPAYER-FOLLOWUP] Enviando para ${user.whatsappNumber}: ${message}`);

      // Registrar tentativa
      await storage.createNotapayerFollowupAttempt({
        userId,
        subscriptionId: inactiveSub.id,
        message,
        sentAt: new Date(),
        status: "sent",
      });

      res.json({
        success: true,
        message: "Follow-up enviado com sucesso",
        user: {
          id: user.id,
          name: user.name,
          phone: user.whatsappNumber,
        },
        sentMessage: message,
      });
    } catch (error: any) {
      console.error("Erro ao enviar follow-up:", error);
      res.status(500).json({ success: false, message: "Erro ao enviar follow-up" });
    }
  });

  // ==================== HISTÓRICO ====================

  /**
   * GET /api/admin/notapayers/history
   * Lista histórico de follow-ups enviados
   */
  app.get("/api/admin/notapayers/history", isAdmin, async (req: any, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;

      const attempts = await storage.getNotapayerFollowupHistory(limit);

      res.json({
        success: true,
        data: attempts,
        total: attempts.length,
      });
    } catch (error: any) {
      console.error("Erro ao buscar histórico:", error);
      res.status(500).json({ success: false, message: "Erro ao buscar histórico" });
    }
  });

  // ==================== REATIVAR ASSINATURA ====================

  /**
   * POST /api/admin/notapayers/resubscribe/:userId
   * Reativa assinatura de não pagante (opcional)
   */
  app.post("/api/admin/notapayers/resubscribe/:userId", isAdmin, async (req: any, res: Response) => {
    try {
      const { userId } = req.params;

      // Verificar se usuário existe
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "Usuário não encontrado" });
      }

      // Obter assinatura inativa
      const inactiveSub = await dbClient.query.subscriptions.findFirst({
        where: (subs, { and, lte, or, eq }) => and(
          eq(subs.userId, userId),
          or(eq(subs.status, 'expired'), eq(subs.status, 'cancelled')),
          lte(subs.dataFim, new Date())
        )
      });

      if (!inactiveSub) {
        return res.status(404).json({
          success: false,
          message: "Usuário não tem assinatura inativa"
        });
      }

      // Reativar assinatura (simplificado - você pode implementar reativação real)
      const updatedSub = await dbClient.update(subscriptions)
        .set({
          status: "active",
          dataFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 dias
        })
        .where(eq(subscriptions.id, inactiveSub.id))
        .returning();

      res.json({
        success: true,
        message: "Assinatura reativada com sucesso",
        subscription: updatedSub[0],
      });
    } catch (error: any) {
      console.error("Erro ao reativar assinatura:", error);
      res.status(500).json({ success: false, message: "Erro ao reativar assinatura" });
    }
  });

  console.log("✅ [NOTAPAYERS] Rotas de follow-up para não pagantes registradas");
}
