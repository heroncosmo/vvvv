import type { Express, Request, Response } from "express";

import { storage } from "./storage";
import {
  buildLocalInstanceDevice,
  buildLocalInstanceStatus,
  listInstanceContacts,
  listInstanceConversations,
  listInstanceGroups,
  listInstanceMessages,
  sendGroupBulkViaInstance,
  sendMediaDirectViaInstance,
  sendMediaViaInstance,
  sendTextDirectViaInstance,
  sendTextViaInstance,
  syncInstanceGroupHistory,
} from "./whatsappInstanceApiService";
import { parseGatewayAccountToken, verifyGatewayAccountToken } from "./gatewayPlatformTokens";
import { connectWhatsApp, disconnectWhatsApp, forceResetWhatsApp, requestClientPairingCode } from "./whatsapp";
import { deleteConnectionSafely, findReusableDisconnectedConnectionForCreation } from "./whatsappConnectionContinuity";
import { previewStatusAudienceForUser, sendStatusPostForUser } from "./statusPostingService";

const DEFAULT_INTERNAL_TOKEN = "agentezap-internal-wa-gateway";

function extractGatewayApiToken(req: Request): string {
  const authorization = String(req.header("authorization") || "");
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return bearerToken || String(req.header("x-api-key") || "").trim();
}

function getInternalToken(): string {
  return (process.env.WA_GATEWAY_INTERNAL_TOKEN || DEFAULT_INTERNAL_TOKEN).trim();
}

function isInternalGatewayServiceRequest(req: Request): boolean {
  return String(req.header("x-wa-gateway-token") || "").trim() === getInternalToken();
}

function parseSendSource(source: unknown): "owner" | "agent" | "followup" | "system" | undefined {
  const value = String(source || "").trim();
  if (value === "owner" || value === "agent" || value === "followup" || value === "system") {
    return value;
  }
  return undefined;
}

async function authenticateGatewayAccountRequest(req: Request) {
  if (isInternalGatewayServiceRequest(req)) {
    const userId = String(req.header("x-gateway-user-id") || "").trim();
    if (!userId) {
      const error = new Error("x-gateway-user-id ausente");
      (error as any).status = 401;
      throw error;
    }

    const user = await storage.getUser(userId);
    if (!user) {
      const error = new Error("Usuario nao encontrado");
      (error as any).status = 404;
      throw error;
    }

    return user;
  }

  const token = extractGatewayApiToken(req);
  if (!token) {
    const error = new Error("API key ausente");
    (error as any).status = 401;
    throw error;
  }

  const parsed = parseGatewayAccountToken(token);
  if (!parsed?.userId) {
    const error = new Error("API key invalida");
    (error as any).status = 401;
    throw error;
  }

  const user = await storage.getUser(parsed.userId);
  if (!user || !user.gatewayApiEnabled || !verifyGatewayAccountToken(token, user.gatewayApiTokenHash || null)) {
    const error = new Error("API key invalida");
    (error as any).status = 401;
    throw error;
  }

  await storage.updateUser(user.id, {
    gatewayApiLastUsedAt: new Date(),
  });

  return user;
}

async function listManagedConnectionsForUser(userId: string) {
  return storage.getConnectionsByUserId(userId);
}

async function resolveManagedConnection(userId: string, instanceId: string) {
  const connection = await storage.getConnectionById(instanceId);
  if (!connection || connection.userId !== userId) {
    const error = new Error("Instancia nao encontrada");
    (error as any).status = 404;
    throw error;
  }

  return connection;
}

async function resolveManagedConnectionFromRequest(req: Request) {
  const instanceId = String((req.params as any).instanceId || "").trim();
  if (!instanceId) {
    const error = new Error("Instancia nao encontrada");
    (error as any).status = 404;
    throw error;
  }

  if (isInternalGatewayServiceRequest(req)) {
    const connection = await storage.getConnectionById(instanceId);
    if (!connection) {
      const error = new Error("Instancia nao encontrada");
      (error as any).status = 404;
      throw error;
    }
    return connection;
  }

  const user = await authenticateGatewayAccountRequest(req);
  return resolveManagedConnection(user.id, instanceId);
}

async function buildGatewayInstanceSummary(connection: Awaited<ReturnType<typeof resolveManagedConnection>>) {
  const [status, device] = await Promise.all([
    buildLocalInstanceStatus(connection),
    buildLocalInstanceDevice(connection),
  ]);

  return {
    instanceId: connection.id,
    connectionName: connection.connectionName || null,
    connectionType: connection.connectionType || null,
    isPrimary: connection.isPrimary ?? null,
    publicApiEnabled: !!connection.publicApiEnabled,
    publicApiTokenPreview: connection.publicApiTokenPreview || null,
    provider: connection.provider || null,
    providerStatus: connection.providerStatus || null,
    status,
    device,
  };
}

async function withGatewayAccount(
  req: Request,
  res: Response,
  handler: (user: Awaited<ReturnType<typeof authenticateGatewayAccountRequest>>) => Promise<void>,
) {
  try {
    const user = await authenticateGatewayAccountRequest(req);
    await handler(user);
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    const message = error?.message || "Erro na API do gateway";
    res.status(status).json({ message });
  }
}

async function withGatewayConnection(
  req: Request,
  res: Response,
  handler: (connection: Awaited<ReturnType<typeof resolveManagedConnectionFromRequest>>) => Promise<void>,
) {
  try {
    const connection = await resolveManagedConnectionFromRequest(req);
    await handler(connection);
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    const message = error?.message || "Erro na API do gateway";
    res.status(status).json({ message });
  }
}

export function registerGatewayPublicApiRoutes(app: Express) {
  const handleTextSend = async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = req.body || {};

      if ((body as any).directByNumber === true) {
        return res.json(
          await sendTextDirectViaInstance({
            connection,
            text: String((body as any).text || "").trim(),
            to: (body as any).to || undefined,
            contactName: (body as any).contactName || undefined,
            validateDestination: (body as any).validateDestination === true,
          }),
        );
      }

      res.json(
        await sendTextViaInstance({
          connection,
          text: String((body as any).text || "").trim(),
          conversationId: (body as any).conversationId || undefined,
          to: (body as any).to || undefined,
          contactName: (body as any).contactName || undefined,
          validateDestination: (body as any).validateDestination === true,
          isFromAgent: (body as any).isFromAgent === true,
          source: parseSendSource((body as any).source),
          bypassDeduplication: (body as any).bypassDeduplication === true,
          acceptQueued: (body as any).acceptQueued === true,
          clientMessageId: (body as any).clientMessageId || undefined,
          existingMessageDbId: (body as any).existingMessageDbId || undefined,
        }),
      );
    });
  };

  const handleMediaSend = async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = req.body || {};

      if ((body as any).directByNumber === true) {
        return res.json(
          await sendMediaDirectViaInstance({
            connection,
            type: (body as any).type,
            data: (body as any).data,
            mimetype: (body as any).mimetype,
            filename: (body as any).filename,
            caption: (body as any).caption,
            trackingMediaName: (body as any).trackingMediaName || (body as any).mediaName || (body as any).media_name,
            ptt: (body as any).ptt,
            seconds: (body as any).seconds,
            to: (body as any).to || undefined,
            contactName: (body as any).contactName || undefined,
            validateDestination: (body as any).validateDestination === true,
          }),
        );
      }

      res.json(
        await sendMediaViaInstance({
          connection,
          type: (body as any).type,
          data: (body as any).data,
          mimetype: (body as any).mimetype,
          filename: (body as any).filename,
          caption: (body as any).caption,
          trackingMediaName: (body as any).trackingMediaName || (body as any).mediaName || (body as any).media_name,
          ptt: (body as any).ptt,
          seconds: (body as any).seconds,
          conversationId: (body as any).conversationId || undefined,
          to: (body as any).to || undefined,
          contactName: (body as any).contactName || undefined,
          validateDestination: (body as any).validateDestination === true,
          isFromAgent: (body as any).isFromAgent === true,
          source: parseSendSource((body as any).source),
        }),
      );
    });
  };

  app.get("/api/integration", (_req: Request, res: Response) => {
    res.json({
      name: "AgenteZap Gateway API",
      version: "v1",
      docsPath: "/api/integration/__intro__",
      authentication: {
        type: "bearer_or_x_api_key",
        header: "Authorization: Bearer <gateway_api_key> or x-api-key: <gateway_api_key>",
      },
    });
  });

  app.get("/api/integration/__intro__", (_req: Request, res: Response) => {
    res.json({
      title: "AgenteZap Gateway API Integration",
      description:
        "API publica do runtime WhatsApp do AgenteZap. Use uma API key mestra da conta para listar, criar e operar instancias gerenciadas por este gateway.",
      authentication: {
        type: "bearer_or_x_api_key",
        notes: [
          "Gere sua API key mestra no painel do AgenteZap.",
          "Cada conta enxerga e gerencia apenas as proprias instancias.",
          "As operacoes desta API exigem que a instancia esteja hospedada neste gateway.",
        ],
      },
      endpoints: [
        { method: "GET", path: "/api/integration/instances", description: "Listar instancias da conta" },
        { method: "POST", path: "/api/integration/instances", description: "Criar uma nova instancia" },
        { method: "DELETE", path: "/api/integration/instances/:instanceId", description: "Excluir uma instancia secundaria" },
        { method: "GET", path: "/api/integration/instances/:instanceId/status", description: "Status da instancia" },
        { method: "GET", path: "/api/integration/instances/:instanceId/device", description: "Dados do device conectado" },
        { method: "POST", path: "/api/integration/instances/:instanceId/connect", description: "Iniciar conexao/pairing" },
        { method: "POST", path: "/api/integration/instances/:instanceId/disconnect", description: "Desconectar instancia" },
        { method: "POST", path: "/api/integration/instances/:instanceId/reset", description: "Resetar instancia" },
        { method: "POST", path: "/api/integration/instances/:instanceId/pairing-code", description: "Gerar pairing code para a instancia" },
        { method: "GET", path: "/api/integration/instances/:instanceId/conversations", description: "Listar conversas" },
        { method: "GET", path: "/api/integration/instances/:instanceId/conversations/:conversationId/messages", description: "Listar mensagens de uma conversa" },
        { method: "GET", path: "/api/integration/instances/:instanceId/contacts", description: "Listar contatos" },
        { method: "GET", path: "/api/integration/instances/:instanceId/groups", description: "Listar grupos" },
        { method: "POST", path: "/api/integration/instances/:instanceId/groups/send-bulk", description: "Enviar em massa para grupos" },
        { method: "GET", path: "/api/integration/instances/:instanceId/status-posts/preview-audience", description: "Prévia da audiência de status" },
        { method: "POST", path: "/api/integration/instances/:instanceId/status-posts/send", description: "Enviar status/story" },
        { method: "POST", path: "/api/integration/instances/:instanceId/messages/text", description: "Enviar texto" },
        { method: "POST", path: "/api/integration/instances/:instanceId/messages/media", description: "Enviar midia" },
      ],
    });
  });

  app.post("/api/integration/instances/status/bulk", async (req: Request, res: Response) => {
    try {
      const requestedIds = Array.from(
        new Set(
          (Array.isArray((req.body as any)?.instanceIds) ? (req.body as any).instanceIds : [])
            .map((value: unknown) => String(value || "").trim())
            .filter(Boolean),
        ),
      );

      if (requestedIds.length === 0) {
        return res.json({ items: [] });
      }

      if (isInternalGatewayServiceRequest(req)) {
        const items = await Promise.all(
          requestedIds.map(async (instanceId) => {
            const connection = await storage.getConnectionById(instanceId);
            if (!connection) {
              return null;
            }
            return buildLocalInstanceStatus(connection);
          }),
        );
        return res.json({ items: items.filter(Boolean) });
      }

      await withGatewayAccount(req, res, async (user) => {
        const allowedConnections = await storage.getConnectionsByUserId(user.id);
        const allowedMap = new Map(allowedConnections.map((connection) => [connection.id, connection]));
        const items = await Promise.all(
          requestedIds.map(async (instanceId) => {
            const connection = allowedMap.get(instanceId);
            if (!connection) {
              return null;
            }
            return buildLocalInstanceStatus(connection as any);
          }),
        );
        res.json({ items: items.filter(Boolean) });
      });
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      const message = error?.message || "Erro na API do gateway";
      res.status(status).json({ message });
    }
  });

  app.get("/api/integration/instances", async (req: Request, res: Response) => {
    await withGatewayAccount(req, res, async (user) => {
      const connections = await listManagedConnectionsForUser(user.id);
      const items = await Promise.all(connections.map((connection) => buildGatewayInstanceSummary(connection as any)));
      res.json({ success: true, items });
    });
  });

  app.post("/api/integration/instances", async (req: Request, res: Response) => {
    await withGatewayAccount(req, res, async (user) => {
      const body = (req.body && typeof req.body === "object") ? req.body as Record<string, unknown> : {};
      const connectionName = String(body.connectionName || body.name || "").trim();
      const connectionType = String(body.connectionType || "secondary").trim() || "secondary";
      const allowReuse = body.reuseExistingDisconnected !== false;

      if (allowReuse) {
        const reusableConnection = await findReusableDisconnectedConnectionForCreation(user.id);
        if (reusableConnection) {
          return res.json({
            success: true,
            reusedExistingConnection: true,
            instance: await buildGatewayInstanceSummary(reusableConnection as any),
          });
        }
      }

      const existingConnections = await storage.getConnectionsByUserId(user.id);
      if (existingConnections.length >= 5) {
        return res.status(400).json({ message: "Limite de 5 instancias atingido" });
      }

      const newConnection = await storage.createConnection({
        userId: user.id,
        connectionName: connectionName || `Conexao ${existingConnections.length + 1}`,
        connectionType,
        isPrimary: existingConnections.length === 0,
        isConnected: false,
      });

      res.status(201).json({
        success: true,
        instance: await buildGatewayInstanceSummary(newConnection as any),
      });
    });
  });

  app.delete("/api/integration/instances/:instanceId", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      if (connection.isPrimary) {
        return res.status(400).json({ message: "Nao e possivel excluir a instancia principal" });
      }

      const deleteResult = await deleteConnectionSafely(connection.id);
      if (deleteResult.blockedByHistory) {
        return res.status(400).json({
          message: "Esta instancia possui historico de conversas. Desconecte em vez de excluir para preservar o atendimento.",
          blockedByHistory: true,
        });
      }

      res.json({
        success: true,
        instanceId: connection.id,
        mergedIntoConnectionId: deleteResult.mergedIntoConnectionId || null,
      });
    });
  });

  app.get("/api/integration/instances/:instanceId/status", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await buildLocalInstanceStatus(connection));
    });
  });

  app.get("/api/integration/instances/:instanceId/device", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await buildLocalInstanceDevice(connection));
    });
  });

  app.post("/api/integration/instances/:instanceId/connect", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      connectWhatsApp(connection.userId, connection.id).catch((error) => {
        console.error("[GATEWAY PUBLIC API] Failed to connect instance:", error);
      });
      res.json({ success: true, instanceId: connection.id, status: "connecting" });
    });
  });

  app.post("/api/integration/instances/:instanceId/disconnect", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      await disconnectWhatsApp(connection.userId, connection.id);
      res.json({ success: true, instanceId: connection.id });
    });
  });

  app.post("/api/integration/instances/:instanceId/reset", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = (req.body && typeof req.body === "object") ? req.body as Record<string, unknown> : {};
      await forceResetWhatsApp(connection.userId, connection.id, {
        source: typeof body.source === "string" && body.source.trim()
          ? body.source.trim()
          : "gateway_public_api_reset",
      });
      res.json({ success: true, instanceId: connection.id });
    });
  });

  app.post("/api/integration/instances/:instanceId/pairing-code", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const phoneNumber = String((req.body as any)?.phoneNumber || "").replace(/\D/g, "");
      if (!phoneNumber) {
        return res.status(400).json({ message: "phoneNumber is required" });
      }

      const code = await requestClientPairingCode(connection.userId, phoneNumber, connection.id);
      if (!code) {
        return res.status(503).json({ message: "Nao foi possivel gerar o pairing code" });
      }

      res.json({ success: true, instanceId: connection.id, pairingCode: code });
    });
  });

  app.get("/api/integration/instances/:instanceId/conversations", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await listInstanceConversations(connection.id));
    });
  });

  app.get("/api/integration/instances/:instanceId/conversations/:conversationId/messages", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await listInstanceMessages(connection.id, String((req.params as any).conversationId || "")));
    });
  });

  app.post("/api/integration/instances/:instanceId/conversations/:conversationId/group-history-sync", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await syncInstanceGroupHistory(connection.id, String((req.params as any).conversationId || "")));
    });
  });

  app.get("/api/integration/instances/:instanceId/contacts", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await listInstanceContacts(connection.id));
    });
  });

  app.get("/api/integration/instances/:instanceId/groups", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const groups = await listInstanceGroups(connection);
      res.json(Array.isArray(groups) ? groups : []);
    });
  });

  app.post("/api/integration/instances/:instanceId/groups/send-bulk", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = req.body || {};
      const groupIds = Array.isArray((body as any).groupIds)
        ? (body as any).groupIds.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];
      const message = String((body as any).message || "").trim();

      if (groupIds.length === 0) {
        return res.status(400).json({ message: "Lista de grupos e obrigatoria" });
      }

      if (!message) {
        return res.status(400).json({ message: "Mensagem e obrigatoria" });
      }

      res.json(
        await sendGroupBulkViaInstance({
          connection,
          groupIds,
          message,
          settings:
            body && typeof body === "object" && (body as any).settings && typeof (body as any).settings === "object"
              ? ((body as any).settings as Record<string, unknown>)
              : null,
        }),
      );
    });
  });

  app.get("/api/integration/instances/:instanceId/status-posts/preview-audience", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await previewStatusAudienceForUser(connection.userId, connection.id));
    });
  });

  app.post("/api/integration/instances/:instanceId/status-posts/send", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(
        await sendStatusPostForUser(connection.userId, req.body || {}, {
          preferredConnectionId: connection.id,
        }),
      );
    });
  });

  app.post("/api/integration/instances/:instanceId/messages/text", handleTextSend);
  app.post("/api/integration/instances/:instanceId/messages/send", handleTextSend);

  app.post("/api/integration/instances/:instanceId/messages/media", handleMediaSend);
  app.post("/api/integration/instances/:instanceId/messages/send-media", handleMediaSend);
}
