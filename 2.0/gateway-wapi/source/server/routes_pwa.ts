import type { Express, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "./supabaseAuth";
import {
  getWebPushSubscriptionStatus,
  getWebPushPublicKey,
  removeWebPushSubscription,
  sendWebPushToUser,
  upsertWebPushSubscription,
} from "./webPushService";

function getUserId(req: any): string {
  return req.user.claims.sub;
}

const pushSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().min(1),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  deviceLabel: z.string().max(255).optional().nullable(),
});

const deleteSubscriptionSchema = z.object({
  endpoint: z.string().min(1).optional().nullable(),
});

const subscriptionStatusSchema = z.object({
  endpoint: z.string().min(1).optional().nullable(),
});

export function registerPwaRoutes(app: Express) {
  app.get("/api/pwa/vapid-public-key", async (_req, res) => {
    try {
      const publicKey = await getWebPushPublicKey();
      res.json({ publicKey });
    } catch (error: any) {
      console.error("[PWA] Erro ao carregar chave pública VAPID:", error);
      res.status(500).json({ message: "Falha ao carregar chave do PWA" });
    }
  });

  app.post("/api/pwa/subscriptions", isAuthenticated, async (req: any, res: Response) => {
    try {
      const parsed = pushSubscriptionSchema.parse(req.body || {});
      const userId = getUserId(req);

      await upsertWebPushSubscription({
        userId,
        subscription: parsed.subscription,
        deviceLabel: parsed.deviceLabel || null,
        userAgent: req.headers["user-agent"],
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("[PWA] Erro ao salvar subscription:", error);
      res.status(400).json({ message: error?.message || "Falha ao salvar subscription" });
    }
  });

  app.delete("/api/pwa/subscriptions", isAuthenticated, async (req: any, res: Response) => {
    try {
      const parsed = deleteSubscriptionSchema.parse(req.body || {});
      const userId = getUserId(req);
      await removeWebPushSubscription(userId, parsed.endpoint || null);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[PWA] Erro ao remover subscription:", error);
      res.status(400).json({ message: error?.message || "Falha ao remover subscription" });
    }
  });

  app.post("/api/pwa/subscriptions/status", isAuthenticated, async (req: any, res: Response) => {
    try {
      const parsed = subscriptionStatusSchema.parse(req.body || {});
      const userId = getUserId(req);
      const status = await getWebPushSubscriptionStatus({
        userId,
        endpoint: parsed.endpoint || null,
      });
      res.json(status);
    } catch (error: any) {
      console.error("[PWA] Erro ao consultar status da subscription:", error);
      res.status(400).json({ message: error?.message || "Falha ao consultar status do push" });
    }
  });

  app.post("/api/pwa/test", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = getUserId(req);
      await sendWebPushToUser(userId, {
        title: "AgenteZap",
        body: "Push do PWA configurado com sucesso.",
        url: "/",
        tag: "agentezap-pwa-test",
        topic: "pwa-test",
        urgency: "high",
        ttlSeconds: 5 * 60,
        renotify: true,
        vibrate: [180, 80, 180],
        timestamp: Date.now(),
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[PWA] Erro ao enviar push de teste:", error);
      res.status(500).json({ message: error?.message || "Falha ao enviar push de teste" });
    }
  });
}
