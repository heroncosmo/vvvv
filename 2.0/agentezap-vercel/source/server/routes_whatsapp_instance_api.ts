import type { Express, Request, Response } from "express";

import { getUserId, isAuthenticated } from "./supabaseAuth";
import { storage } from "./storage";
import {
  buildLocalInstanceDevice,
  buildLocalInstanceStatus,
} from "./whatsappInstanceApiService";
import {
  buildPublicInstanceTokenPreview,
  generatePublicInstanceToken,
  hashPublicInstanceToken,
} from "./whatsappInstanceTokens";
import {
  isPublicInstanceApiCanaryEnabledForConnection,
} from "./whatsappGatewayOwnership";
import { resolveAppVisibleConnectionOwner } from "./whatsappGatewayAppOwnership";
import {
} from "./whatsappGatewayClient";
import {
  getAppVisibleGatewayInstanceDevice,
  getAppVisibleGatewayInstanceStatus,
} from "./whatsappGatewayAppRuntime";

function buildInstanceBaseUrl(req: Request, instanceId: string): string {
  return `${req.protocol}://${req.get("host")}/api/public/instances/${instanceId}`;
}

async function buildApiAccessResponse(
  req: Request,
  connectionId: string,
  tokenValue?: string | null,
) {
  const connection = await storage.getConnectionById(connectionId);
  if (!connection) {
    throw new Error("Conexao nao encontrada");
  }

  const owner = await resolveAppVisibleConnectionOwner(connection);
  const [status, device] =
    owner === "gateway"
      ? await Promise.all([
          getAppVisibleGatewayInstanceStatus(connection),
          getAppVisibleGatewayInstanceDevice(connection),
        ])
      : await Promise.all([
          buildLocalInstanceStatus(connection),
          buildLocalInstanceDevice(connection),
        ]);

  return {
    success: true,
    instanceId: connection.id,
    owner,
    publicApiEnabled: !!connection.publicApiEnabled,
    tokenPreview: connection.publicApiTokenPreview || null,
    tokenValue: tokenValue || null,
    baseUrl: buildInstanceBaseUrl(req, connection.id),
    status,
    device,
  };
}

export function registerWhatsAppInstanceApiRoutes(app: Express) {
  app.post("/api/whatsapp/connections/:connectionId/api-access", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      const connection = await storage.getConnectionById((req.params as any).connectionId);
      if (!connection || connection.userId !== userId) {
        return res.status(404).json({ message: "Conexao nao encontrada" });
      }

      const canaryEnabled = await isPublicInstanceApiCanaryEnabledForConnection(connection);
      if (!canaryEnabled) {
        return res.status(403).json({ message: "API externa indisponivel para esta conexao" });
      }

      let tokenValue: string | null = null;
      if (!connection.publicApiTokenHash) {
        tokenValue = generatePublicInstanceToken();
        await storage.updateConnection(connection.id, {
          publicApiEnabled: true,
          publicApiTokenHash: hashPublicInstanceToken(tokenValue),
          publicApiTokenPreview: buildPublicInstanceTokenPreview(tokenValue),
          publicApiRotatedAt: new Date(),
        } as any);
      } else if (!connection.publicApiEnabled) {
        await storage.updateConnection(connection.id, {
          publicApiEnabled: true,
        } as any);
      }

      res.json(await buildApiAccessResponse(req, connection.id, tokenValue));
    } catch (error) {
      console.error("[INSTANCE API] Failed to load API access details:", error);
      res.status(500).json({ message: "Erro ao carregar detalhes da API da instancia" });
    }
  });

  app.post("/api/whatsapp/connections/:connectionId/api-access/rotate", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      const connection = await storage.getConnectionById((req.params as any).connectionId);
      if (!connection || connection.userId !== userId) {
        return res.status(404).json({ message: "Conexao nao encontrada" });
      }

      const canaryEnabled = await isPublicInstanceApiCanaryEnabledForConnection(connection);
      if (!canaryEnabled) {
        return res.status(403).json({ message: "API externa indisponivel para esta conexao" });
      }

      const tokenValue = generatePublicInstanceToken();
      await storage.updateConnection(connection.id, {
        publicApiEnabled: true,
        publicApiTokenHash: hashPublicInstanceToken(tokenValue),
        publicApiTokenPreview: buildPublicInstanceTokenPreview(tokenValue),
        publicApiRotatedAt: new Date(),
      } as any);

      res.json(await buildApiAccessResponse(req, connection.id, tokenValue));
    } catch (error) {
      console.error("[INSTANCE API] Failed to rotate API token:", error);
      res.status(500).json({ message: "Erro ao rotacionar token da API" });
    }
  });
}
