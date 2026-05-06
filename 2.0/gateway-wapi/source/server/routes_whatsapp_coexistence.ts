import type { Express, Request, Response } from "express";
import { z } from "zod";
import { memoryCache, storage } from "./storage";
import { getUserId, isAuthenticated } from "./supabaseAuth";
import {
  buildOfficialWebhookUrl,
  createWebhookVerifyToken,
  exchangeMetaEmbeddedSignupCode,
  findOfficialConnectionByVerifyToken,
  markOfficialConnectionWebhookVerified,
} from "./metaCloudApi";
import { processMetaCloudWebhookPayload } from "./metaCloudInbound";
import {
  assertWhatsappCoexistenceBetaAccess,
  buildPendingCoexistenceProviderConfig,
  getWhatsappCoexistenceBetaStatus,
  WHATSAPP_CONNECTION_METHODS,
  WHATSAPP_CONNECTION_PROVIDERS,
  WHATSAPP_PROVIDER_STATUS,
} from "./whatsappCoexistence";

const coexistenceCompleteSchema = z.object({
  wabaId: z.string().trim().min(1).optional(),
  businessAccountId: z.string().trim().min(1).optional(),
  phoneNumberId: z.string().trim().min(1).optional(),
  phoneNumber: z.string().trim().min(1).optional(),
  displayPhoneNumber: z.string().trim().min(1).optional(),
  accessToken: z.string().trim().min(1).optional(),
  webhookVerifyToken: z.string().trim().min(1).optional(),
  authorizationCode: z.string().trim().min(1).optional(),
  redirectUri: z.string().trim().min(1).optional(),
  accessTokenExpiresAt: z.union([z.string().trim().min(1), z.number().finite()]).optional(),
  tokenType: z.string().trim().min(1).optional(),
  appId: z.string().trim().min(1).optional(),
  configId: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  markConnected: z.boolean().optional(),
});

function getSafeProviderConfig(connection: { providerConfig?: unknown } | null | undefined) {
  return (connection?.providerConfig as Record<string, any> | null | undefined) || {};
}

function buildStartProviderConfig(connection?: { providerConfig?: unknown } | null) {
  const existingConfig = getSafeProviderConfig(connection);
  const existingVerifyToken = String(existingConfig?.credentials?.webhookVerifyToken || "").trim();
  const webhookVerifyToken = existingVerifyToken || createWebhookVerifyToken();

  return buildPendingCoexistenceProviderConfig(existingConfig, {
    credentials: {
      ...(existingConfig.credentials || {}),
      webhookVerifyToken,
    },
    webhook: {
      ...(existingConfig.webhook || {}),
      url: buildOfficialWebhookUrl(),
    },
  });
}

function normalizeAccessTokenExpiry(value: string | number | undefined): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) return new Date(value).toISOString();
    if (value > 0) return new Date(Date.now() + value * 1000).toISOString();
  }
  return undefined;
}

export function registerWhatsappCoexistenceRoutes(app: Express) {
  app.get("/api/webhooks/whatsapp/cloud-api", async (req: Request, res: Response) => {
    try {
      const mode = String(req.query["hub.mode"] || "").trim();
      const verifyToken = String(req.query["hub.verify_token"] || "").trim();
      const challenge = String(req.query["hub.challenge"] || "");

      if (mode !== "subscribe" || !verifyToken) {
        return res.status(400).send("invalid webhook verification");
      }

      const connection = await findOfficialConnectionByVerifyToken(verifyToken);
      if (!connection) {
        return res.status(403).send("forbidden");
      }

      await markOfficialConnectionWebhookVerified(connection, {
        lastEventAt: new Date().toISOString(),
        lastPayload: {
          verificationMode: mode,
        },
      });
      memoryCache.invalidate(`api:wa-conn:${connection.userId}`);
      memoryCache.invalidate(`api:wa-conn:${connection.userId}:default`);

      return res.status(200).send(challenge);
    } catch (error) {
      console.error("[COEXISTENCE] Error verifying Meta webhook:", error);
      return res.status(500).send("webhook verification failed");
    }
  });

  app.post("/api/webhooks/whatsapp/cloud-api", async (req: Request, res: Response) => {
    try {
      await processMetaCloudWebhookPayload((req as any).body || {});
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("[COEXISTENCE] Error processing Meta webhook:", error);
      return res.status(500).json({ message: "Erro ao processar webhook da Cloud API" });
    }
  });

  app.get("/api/whatsapp/coexistence/beta", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      const status = await getWhatsappCoexistenceBetaStatus(userId);
      res.json(status);
    } catch (error) {
      console.error("[COEXISTENCE] Error fetching beta status:", error);
      res.status(500).json({ message: "Erro ao obter status da coexistência oficial" });
    }
  });

  app.post("/api/whatsapp/coexistence/primary/start", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      await assertWhatsappCoexistenceBetaAccess(userId);

      const existingConnection = await storage.getConnectionByUserId(userId);
      const connection = existingConnection
        ? await storage.updateConnection(existingConnection.id, {
            provider: WHATSAPP_CONNECTION_PROVIDERS.META_CLOUD_API,
            connectionMethod: WHATSAPP_CONNECTION_METHODS.COEXISTENCE,
            providerStatus: WHATSAPP_PROVIDER_STATUS.PENDING_SETUP,
            isConnected: false,
            qrCode: null,
            sessionData: null,
            connectionName: existingConnection.connectionName || "Canal Oficial",
            connectionType: existingConnection.connectionType || "primary",
            isPrimary: existingConnection.isPrimary ?? true,
            providerConfig: buildStartProviderConfig(existingConnection),
          })
        : await storage.createConnection({
            userId,
            isConnected: false,
            provider: WHATSAPP_CONNECTION_PROVIDERS.META_CLOUD_API,
            connectionMethod: WHATSAPP_CONNECTION_METHODS.COEXISTENCE,
            providerStatus: WHATSAPP_PROVIDER_STATUS.PENDING_SETUP,
            connectionName: "Canal Oficial",
            connectionType: "primary",
            isPrimary: true,
            providerConfig: buildStartProviderConfig(undefined),
          });

      memoryCache.invalidate(`api:wa-conn:${userId}`);
      memoryCache.invalidate(`api:wa-conn:${userId}:default`);

      res.json({
        success: true,
        connection,
        launchConfig: (connection.providerConfig as any)?.launchConfig || null,
      });
    } catch (error: any) {
      console.error("[COEXISTENCE] Error starting primary setup:", error);
      res.status(error?.statusCode || 500).json({
        message: error?.message || "Erro ao iniciar configuração da coexistência oficial",
      });
    }
  });

  app.post("/api/whatsapp/connections/:connectionId/coexistence/start", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      await assertWhatsappCoexistenceBetaAccess(userId);

      const connection = await storage.getConnectionById((req.params as any).connectionId);
      if (!connection || connection.userId !== userId) {
        return res.status(404).json({ message: "Conexão não encontrada" });
      }

      const updated = await storage.updateConnection(connection.id, {
        provider: WHATSAPP_CONNECTION_PROVIDERS.META_CLOUD_API,
        connectionMethod: WHATSAPP_CONNECTION_METHODS.COEXISTENCE,
        providerStatus: WHATSAPP_PROVIDER_STATUS.PENDING_SETUP,
        isConnected: false,
        qrCode: null,
        sessionData: null,
        connectionName: connection.connectionName || "Canal Oficial",
        providerConfig: buildStartProviderConfig(connection),
      });

      memoryCache.invalidate(`api:wa-conn:${userId}`);
      memoryCache.invalidate(`api:wa-conn:${userId}:default`);

      res.json({
        success: true,
        connection: updated,
        launchConfig: (updated.providerConfig as any)?.launchConfig || null,
      });
    } catch (error: any) {
      console.error("[COEXISTENCE] Error starting setup:", error);
      res.status(error?.statusCode || 500).json({
        message: error?.message || "Erro ao iniciar configuração da coexistência oficial",
      });
    }
  });

  app.get("/api/whatsapp/connections/:connectionId/coexistence/status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      await assertWhatsappCoexistenceBetaAccess(userId);

      const connection = await storage.getConnectionById((req.params as any).connectionId);
      if (!connection || connection.userId !== userId) {
        return res.status(404).json({ message: "Conexão não encontrada" });
      }

      res.json({
        success: true,
        provider: connection.provider,
        providerStatus: connection.providerStatus,
        isConnected: connection.isConnected,
        providerConfig: connection.providerConfig || null,
      });
    } catch (error: any) {
      console.error("[COEXISTENCE] Error fetching status:", error);
      res.status(error?.statusCode || 500).json({
        message: error?.message || "Erro ao consultar status da coexistência oficial",
      });
    }
  });

  app.post("/api/whatsapp/connections/:connectionId/coexistence/complete", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      await assertWhatsappCoexistenceBetaAccess(userId);

      const parsed = coexistenceCompleteSchema.safeParse((req as any).body || {});
      if (!parsed.success) {
        return res.status(400).json({
          message: "Payload inválido para concluir coexistência oficial",
          issues: parsed.error.flatten(),
        });
      }

      const connection = await storage.getConnectionById((req.params as any).connectionId);
      if (!connection || connection.userId !== userId) {
        return res.status(404).json({ message: "Conexão não encontrada" });
      }

      const payload = parsed.data;
      let accessToken = payload.accessToken;
      let tokenType = payload.tokenType;
      let accessTokenExpiresAt = normalizeAccessTokenExpiry(payload.accessTokenExpiresAt);

      if (!accessToken && payload.authorizationCode) {
        const exchange = await exchangeMetaEmbeddedSignupCode({
          code: payload.authorizationCode,
          redirectUri: payload.redirectUri || undefined,
        });
        accessToken = exchange.accessToken;
        tokenType = tokenType || exchange.tokenType;
        accessTokenExpiresAt =
          accessTokenExpiresAt ||
          (exchange.expiresIn ? new Date(Date.now() + exchange.expiresIn * 1000).toISOString() : undefined);
      }

      const currentProviderConfig = getSafeProviderConfig(connection);
      const webhookVerifyToken = String(
        payload.webhookVerifyToken || currentProviderConfig?.credentials?.webhookVerifyToken || createWebhookVerifyToken(),
      ).trim();

      const mergedConfig = buildPendingCoexistenceProviderConfig(currentProviderConfig, {
        embeddedSignup: {
          ...(currentProviderConfig.embeddedSignup || {}),
          wabaId: payload.wabaId,
          businessAccountId: payload.businessAccountId,
          phoneNumberId: payload.phoneNumberId,
          displayPhoneNumber: payload.displayPhoneNumber,
          appId: payload.appId,
          configId: payload.configId,
          metadata: {
            ...(currentProviderConfig?.embeddedSignup?.metadata || {}),
            ...(payload.metadata || {}),
          },
        },
        credentials: {
          ...(currentProviderConfig.credentials || {}),
          ...(accessToken ? { accessToken } : {}),
          ...(accessTokenExpiresAt ? { accessTokenExpiresAt } : {}),
          ...(tokenType ? { tokenType } : {}),
          webhookVerifyToken,
        },
        webhook: {
          ...(currentProviderConfig.webhook || {}),
          url: buildOfficialWebhookUrl(),
        },
      });

      const updated = await storage.updateConnection(connection.id, {
        provider: WHATSAPP_CONNECTION_PROVIDERS.META_CLOUD_API,
        connectionMethod: WHATSAPP_CONNECTION_METHODS.COEXISTENCE,
        providerStatus: payload.markConnected
          ? WHATSAPP_PROVIDER_STATUS.CONNECTED
          : accessToken
            ? WHATSAPP_PROVIDER_STATUS.AWAITING_WEBHOOK
            : WHATSAPP_PROVIDER_STATUS.PENDING_SETUP,
        isConnected: payload.markConnected === true,
        phoneNumber: payload.phoneNumber || payload.displayPhoneNumber || connection.phoneNumber,
        qrCode: null,
        sessionData: null,
        providerConfig: mergedConfig,
      });

      memoryCache.invalidate(`api:wa-conn:${userId}`);
      memoryCache.invalidate(`api:wa-conn:${userId}:default`);

      res.json({
        success: true,
        connection: updated,
        webhookUrl: buildOfficialWebhookUrl(),
      });
    } catch (error: any) {
      console.error("[COEXISTENCE] Error completing setup:", error);
      res.status(error?.statusCode || 500).json({
        message: error?.message || "Erro ao concluir configuração da coexistência oficial",
      });
    }
  });
}
