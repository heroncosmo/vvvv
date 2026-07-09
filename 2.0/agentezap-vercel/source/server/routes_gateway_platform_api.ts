import type { Express, Request, Response } from "express";

import { getUserId, isAuthenticated } from "./supabaseAuth";
import { storage } from "./storage";
import {
  buildGatewayAccountTokenPreview,
  generateGatewayAccountToken,
  hashGatewayAccountToken,
} from "./gatewayPlatformTokens";

function buildGatewayPublicBaseUrl(req: Request): string {
  const explicit =
    process.env.GATEWAY_PUBLIC_API_URL ||
    process.env.WA_GATEWAY_PUBLIC_URL ||
    process.env.PUBLIC_GATEWAY_API_URL ||
    "";

  const baseUrl = explicit.trim() || `${req.protocol}://${req.get("host") || ""}`;
  return baseUrl.replace(/\/+$/, "");
}

async function buildGatewayApiAccessResponse(
  req: Request,
  userId: string,
  tokenValue?: string | null,
) {
  const user = await storage.getUser(userId);
  if (!user) {
    throw new Error("Usuario nao encontrado");
  }

  const baseUrl = buildGatewayPublicBaseUrl(req);

  return {
    success: true,
    userId: user.id,
    gatewayApiEnabled: !!user.gatewayApiEnabled,
    tokenPreview: user.gatewayApiTokenPreview || null,
    tokenValue: tokenValue || null,
    baseUrl,
    integrationApiBaseUrl: `${baseUrl}/api/integration`,
    docsUrl: `${baseUrl}/api/integration/__intro__`,
  };
}

export function registerGatewayPlatformApiRoutes(app: Express) {
  app.get("/api/gateway-platform/api-access", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      res.json(await buildGatewayApiAccessResponse(req, userId));
    } catch (error) {
      console.error("[GATEWAY PLATFORM API] Failed to load API access details:", error);
      res.status(500).json({ message: "Erro ao carregar detalhes da API do gateway" });
    }
  });

  app.post("/api/gateway-platform/api-access", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Usuario nao encontrado" });
      }

      let tokenValue: string | null = null;
      if (!user.gatewayApiTokenHash) {
        tokenValue = generateGatewayAccountToken(user.id);
        await storage.updateUser(user.id, {
          gatewayApiEnabled: true,
          gatewayApiTokenHash: hashGatewayAccountToken(tokenValue),
          gatewayApiTokenPreview: buildGatewayAccountTokenPreview(tokenValue),
          gatewayApiRotatedAt: new Date(),
        });
      } else if (!user.gatewayApiEnabled) {
        await storage.updateUser(user.id, {
          gatewayApiEnabled: true,
        });
      }

      res.json(await buildGatewayApiAccessResponse(req, user.id, tokenValue));
    } catch (error) {
      console.error("[GATEWAY PLATFORM API] Failed to provision API access:", error);
      res.status(500).json({ message: "Erro ao provisionar acesso da API do gateway" });
    }
  });

  app.post("/api/gateway-platform/api-access/rotate", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Usuario nao encontrado" });
      }

      const tokenValue = generateGatewayAccountToken(user.id);
      await storage.updateUser(user.id, {
        gatewayApiEnabled: true,
        gatewayApiTokenHash: hashGatewayAccountToken(tokenValue),
        gatewayApiTokenPreview: buildGatewayAccountTokenPreview(tokenValue),
        gatewayApiRotatedAt: new Date(),
      });

      res.json(await buildGatewayApiAccessResponse(req, user.id, tokenValue));
    } catch (error) {
      console.error("[GATEWAY PLATFORM API] Failed to rotate API token:", error);
      res.status(500).json({ message: "Erro ao rotacionar token da API do gateway" });
    }
  });
}
