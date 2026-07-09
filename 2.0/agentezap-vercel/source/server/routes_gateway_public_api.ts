import type { Express, Request, Response } from "express";

import { storage } from "./storage";
import {
  buildLocalInstanceDevice,
  buildLocalInstanceStatus,
  clearInstanceMessageQueue,
  createInstanceGroup,
  getInstanceMessageMedia,
  getInstanceMessageQueue,
  getInstanceGroupDetails,
  getInstanceGroupInviteCode,
  getInstanceContactProfilePicture,
  joinInstanceGroupByInvite,
  listInstanceContacts,
  listInstanceConversations,
  listInstanceGroups,
  listInstanceGroupParticipants,
  listInstanceMessages,
  leaveInstanceGroup,
  redownloadInstanceMessageMedia,
  revokeInstanceGroupInviteCode,
  sendButtonsDirectViaInstance,
  sendButtonsViaInstance,
  sendContactDirectViaInstance,
  sendContactViaInstance,
  sendInstanceContactPresence,
  sendListDirectViaInstance,
  sendListViaInstance,
  sendGroupBulkViaInstance,
  sendLocationDirectViaInstance,
  sendLocationViaInstance,
  sendMediaDirectViaInstance,
  sendMediaViaInstance,
  sendReactionViaInstance,
  sendTextDirectViaInstance,
  sendTextViaInstance,
  syncInstanceGroupHistory,
  updateInstanceGroupDescription,
  updateInstanceGroupParticipants,
  updateInstanceGroupSubject,
  updateInstanceContactBlockStatus,
  validateInstanceContact,
  validateInstanceContactsBatch,
} from "./whatsappInstanceApiService";
import { parseGatewayAccountToken, verifyGatewayAccountToken } from "./gatewayPlatformTokens";
import { connectWhatsApp, disconnectWhatsApp, forceResetWhatsApp, requestClientPairingCode } from "./whatsapp";
import { deleteConnectionSafely, findReusableDisconnectedConnectionForCreation } from "./whatsappConnectionContinuity";
import { previewStatusAudienceForUser, sendStatusPostForUser } from "./statusPostingService";
import {
  createConnectionGatewayWebhook,
  deleteConnectionGatewayWebhook,
  listConnectionGatewayWebhooks,
  updateConnectionGatewayWebhook,
} from "./gatewayWebhookService";
import { gatewayApiReference } from "./gatewayApiReference";

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
  const referenceCategoriesCount = gatewayApiReference.categories.length;
  const referenceEndpointsCount = gatewayApiReference.categories.reduce(
    (total, category) => total + category.endpoints.length,
    0,
  );

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
          isFromAgent:
            typeof (body as any).isFromAgent === "boolean"
              ? (body as any).isFromAgent
              : undefined,
          source: parseSendSource((body as any).source),
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

  const createTypedMediaSendHandler =
    (type: "image" | "audio" | "video" | "document") => async (req: Request, res: Response) => {
      req.body = {
        ...(req.body || {}),
        type,
      };
      await handleMediaSend(req, res);
    };

  const handleImageSend = createTypedMediaSendHandler("image");
  const handleAudioSend = createTypedMediaSendHandler("audio");
  const handleVideoSend = createTypedMediaSendHandler("video");
  const handleDocumentSend = createTypedMediaSendHandler("document");

  const handleContactSend = async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = req.body || {};

      if ((body as any).directByNumber === true) {
        return res.json(
          await sendContactDirectViaInstance({
            connection,
            phoneNumber: String((body as any).phoneNumber || "").trim(),
            displayName: (body as any).displayName || undefined,
            organization: (body as any).organization || undefined,
            email: (body as any).email || undefined,
            url: (body as any).url || undefined,
            to: (body as any).to || undefined,
            contactName: (body as any).contactName || undefined,
            validateDestination: (body as any).validateDestination === true,
          }),
        );
      }

      res.json(
        await sendContactViaInstance({
          connection,
          phoneNumber: String((body as any).phoneNumber || "").trim(),
          displayName: (body as any).displayName || undefined,
          organization: (body as any).organization || undefined,
          email: (body as any).email || undefined,
          url: (body as any).url || undefined,
          conversationId: (body as any).conversationId || undefined,
          to: (body as any).to || undefined,
          contactName: (body as any).contactName || undefined,
          validateDestination: (body as any).validateDestination === true,
        }),
      );
    });
  };

  const handleLocationSend = async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = req.body || {};

      if ((body as any).directByNumber === true) {
        return res.json(
          await sendLocationDirectViaInstance({
            connection,
            latitude: Number((body as any).latitude),
            longitude: Number((body as any).longitude),
            name: (body as any).name || undefined,
            address: (body as any).address || undefined,
            to: (body as any).to || undefined,
            contactName: (body as any).contactName || undefined,
            validateDestination: (body as any).validateDestination === true,
          }),
        );
      }

      res.json(
        await sendLocationViaInstance({
          connection,
          latitude: Number((body as any).latitude),
          longitude: Number((body as any).longitude),
          name: (body as any).name || undefined,
          address: (body as any).address || undefined,
          conversationId: (body as any).conversationId || undefined,
          to: (body as any).to || undefined,
          contactName: (body as any).contactName || undefined,
          validateDestination: (body as any).validateDestination === true,
        }),
      );
    });
  };

  const handleButtonsSend = async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = req.body || {};

      if ((body as any).directByNumber === true) {
        return res.json(
          await sendButtonsDirectViaInstance({
            connection,
            body: String((body as any).body || "").trim(),
            buttons: Array.isArray((body as any).buttons) ? (body as any).buttons : [],
            header: (body as any).header || undefined,
            footer: (body as any).footer || undefined,
            to: (body as any).to || undefined,
            contactName: (body as any).contactName || undefined,
            validateDestination: (body as any).validateDestination === true,
          }),
        );
      }

      res.json(
        await sendButtonsViaInstance({
          connection,
          body: String((body as any).body || "").trim(),
          buttons: Array.isArray((body as any).buttons) ? (body as any).buttons : [],
          header: (body as any).header || undefined,
          footer: (body as any).footer || undefined,
          conversationId: (body as any).conversationId || undefined,
          to: (body as any).to || undefined,
          contactName: (body as any).contactName || undefined,
          validateDestination: (body as any).validateDestination === true,
        }),
      );
    });
  };

  const handleListSend = async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = req.body || {};

      if ((body as any).directByNumber === true) {
        return res.json(
          await sendListDirectViaInstance({
            connection,
            body: String((body as any).body || "").trim(),
            buttonText: String((body as any).buttonText || "").trim(),
            sections: Array.isArray((body as any).sections) ? (body as any).sections : [],
            header: (body as any).header || undefined,
            footer: (body as any).footer || undefined,
            to: (body as any).to || undefined,
            contactName: (body as any).contactName || undefined,
            validateDestination: (body as any).validateDestination === true,
          }),
        );
      }

      res.json(
        await sendListViaInstance({
          connection,
          body: String((body as any).body || "").trim(),
          buttonText: String((body as any).buttonText || "").trim(),
          sections: Array.isArray((body as any).sections) ? (body as any).sections : [],
          header: (body as any).header || undefined,
          footer: (body as any).footer || undefined,
          conversationId: (body as any).conversationId || undefined,
          to: (body as any).to || undefined,
          contactName: (body as any).contactName || undefined,
          validateDestination: (body as any).validateDestination === true,
        }),
      );
    });
  };

  const handleReactionSend = async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = req.body || {};
      res.json(
        await sendReactionViaInstance({
          connection,
          messageId: String((body as any).messageId || "").trim(),
          emoji: (body as any).emoji || undefined,
          conversationId: (body as any).conversationId || undefined,
        }),
      );
    });
  };

  app.get("/api/integration", (_req: Request, res: Response) => {
    res.json({
      name: "AgenteZap Gateway API",
      version: "v1",
      docsPath: "/api/integration/__intro__",
      referencePath: "/api/integration/__reference__",
      contractPath: "/docs/gateway-wapi-contract.md",
      categoriesCount: referenceCategoriesCount,
      endpointsCount: referenceEndpointsCount,
      authentication: {
        type: "bearer_or_x_api_key",
        header: "Authorization: Bearer <gateway_api_key> or x-api-key: <gateway_api_key>",
      },
    });
  });

  app.get("/api/integration/__reference__", (_req: Request, res: Response) => {
    res.json(gatewayApiReference);
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
      referencePath: "/api/integration/__reference__",
      categoriesCount: referenceCategoriesCount,
      endpointsCount: referenceEndpointsCount,
      webhookEvents: [
        "connection.connected",
        "connection.connecting",
        "connection.disconnected",
        "connection.qr",
        "message.received",
        "message.sent",
        "message.server_ack",
        "message.delivered",
        "message.read",
        "message.played",
        "message.failed",
        "message.updated",
        "message.revoked",
        "presence.updated",
        "conversation.updated",
        "*",
      ],
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
        { method: "GET", path: "/api/integration/instances/:instanceId/conversations/:conversationId/messages/:messageId/media", description: "Consultar midia de uma mensagem" },
        { method: "POST", path: "/api/integration/instances/:instanceId/conversations/:conversationId/messages/:messageId/media/redownload", description: "Tentar rebaixar a midia da mensagem" },
        { method: "GET", path: "/api/integration/instances/:instanceId/contacts", description: "Listar contatos" },
        { method: "GET", path: "/api/integration/instances/:instanceId/contacts/validate", description: "Validar se um numero tem WhatsApp" },
        { method: "POST", path: "/api/integration/instances/:instanceId/contacts/validate-bulk", description: "Validar numeros em lote" },
        { method: "GET", path: "/api/integration/instances/:instanceId/contacts/profile-picture", description: "Buscar foto do contato" },
        { method: "POST", path: "/api/integration/instances/:instanceId/contacts/block", description: "Bloquear ou desbloquear contato" },
        { method: "POST", path: "/api/integration/instances/:instanceId/contacts/presence", description: "Enviar presenca para um contato" },
        { method: "POST", path: "/api/integration/instances/:instanceId/groups", description: "Criar grupo" },
        { method: "POST", path: "/api/integration/instances/:instanceId/groups/join-by-invite", description: "Entrar em grupo por invite code" },
        { method: "GET", path: "/api/integration/instances/:instanceId/groups", description: "Listar grupos" },
        { method: "GET", path: "/api/integration/instances/:instanceId/groups/:groupId", description: "Detalhes de um grupo" },
        { method: "GET", path: "/api/integration/instances/:instanceId/groups/:groupId/participants", description: "Participantes de um grupo" },
        { method: "PATCH", path: "/api/integration/instances/:instanceId/groups/:groupId/subject", description: "Alterar assunto do grupo" },
        { method: "PATCH", path: "/api/integration/instances/:instanceId/groups/:groupId/description", description: "Alterar descricao do grupo" },
        { method: "POST", path: "/api/integration/instances/:instanceId/groups/:groupId/participants", description: "Gerenciar participantes do grupo" },
        { method: "GET", path: "/api/integration/instances/:instanceId/groups/:groupId/invite-code", description: "Consultar invite code do grupo" },
        { method: "POST", path: "/api/integration/instances/:instanceId/groups/:groupId/invite-code/revoke", description: "Revogar invite code do grupo" },
        { method: "POST", path: "/api/integration/instances/:instanceId/groups/:groupId/leave", description: "Sair do grupo" },
        { method: "GET", path: "/api/integration/instances/:instanceId/queue", description: "Status da fila anti-ban da instancia" },
        { method: "POST", path: "/api/integration/instances/:instanceId/queue/clear", description: "Limpar fila pendente da instancia" },
        { method: "GET", path: "/api/integration/instances/:instanceId/webhooks", description: "Listar webhooks da instancia" },
        { method: "POST", path: "/api/integration/instances/:instanceId/webhooks", description: "Criar webhook da instancia" },
        { method: "PATCH", path: "/api/integration/instances/:instanceId/webhooks/:webhookId", description: "Atualizar webhook da instancia" },
        { method: "DELETE", path: "/api/integration/instances/:instanceId/webhooks/:webhookId", description: "Remover webhook da instancia" },
        { method: "POST", path: "/api/integration/instances/:instanceId/groups/send-bulk", description: "Enviar em massa para grupos" },
        { method: "GET", path: "/api/integration/instances/:instanceId/status-posts/preview-audience", description: "Prévia da audiência de status" },
        { method: "POST", path: "/api/integration/instances/:instanceId/status-posts/send", description: "Enviar status/story" },
        { method: "POST", path: "/api/integration/instances/:instanceId/messages/text", description: "Enviar texto" },
        { method: "POST", path: "/api/integration/instances/:instanceId/messages/media", description: "Enviar midia" },
        { method: "POST", path: "/api/integration/instances/:instanceId/messages/image", description: "Enviar imagem" },
        { method: "POST", path: "/api/integration/instances/:instanceId/messages/audio", description: "Enviar audio/ptt" },
        { method: "POST", path: "/api/integration/instances/:instanceId/messages/video", description: "Enviar video" },
        { method: "POST", path: "/api/integration/instances/:instanceId/messages/document", description: "Enviar documento" },
        { method: "POST", path: "/api/integration/instances/:instanceId/messages/contact", description: "Enviar contato/vCard" },
        { method: "POST", path: "/api/integration/instances/:instanceId/messages/location", description: "Enviar localizacao" },
        { method: "POST", path: "/api/integration/instances/:instanceId/messages/buttons", description: "Enviar botoes/menu" },
        { method: "POST", path: "/api/integration/instances/:instanceId/messages/list", description: "Enviar lista/menu" },
        { method: "POST", path: "/api/integration/instances/:instanceId/messages/reaction", description: "Reagir a uma mensagem" },
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

  app.get("/api/integration/instances/:instanceId/conversations/:conversationId/messages/:messageId/media", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(
        await getInstanceMessageMedia(
          connection,
          String((req.params as any).conversationId || ""),
          String((req.params as any).messageId || ""),
        ),
      );
    });
  });

  app.post("/api/integration/instances/:instanceId/conversations/:conversationId/messages/:messageId/media/redownload", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(
        await redownloadInstanceMessageMedia(
          connection,
          String((req.params as any).conversationId || ""),
          String((req.params as any).messageId || ""),
        ),
      );
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

  app.get("/api/integration/instances/:instanceId/contacts/validate", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const phoneNumber = String((req.query as any)?.phoneNumber || (req.query as any)?.phone || "").trim();
      if (!phoneNumber) {
        return res.status(400).json({ message: "phoneNumber is required" });
      }

      res.json(await validateInstanceContact(connection, phoneNumber));
    });
  });

  app.post("/api/integration/instances/:instanceId/contacts/validate-bulk", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const phoneNumbers = Array.isArray((req.body as any)?.phoneNumbers)
        ? (req.body as any).phoneNumbers.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];

      if (phoneNumbers.length === 0) {
        return res.status(400).json({ message: "phoneNumbers is required" });
      }

      res.json({
        success: true,
        items: await validateInstanceContactsBatch(connection, phoneNumbers),
      });
    });
  });

  app.get("/api/integration/instances/:instanceId/contacts/profile-picture", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const phoneNumber = String((req.query as any)?.phoneNumber || (req.query as any)?.phone || "").trim();
      const type = String((req.query as any)?.type || "preview").trim() === "image" ? "image" : "preview";
      if (!phoneNumber) {
        return res.status(400).json({ message: "phoneNumber is required" });
      }

      res.json(await getInstanceContactProfilePicture(connection, phoneNumber, type));
    });
  });

  app.post("/api/integration/instances/:instanceId/contacts/block", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const phoneNumber = String((req.body as any)?.phoneNumber || (req.body as any)?.phone || "").trim();
      const action = String((req.body as any)?.action || "block").trim() === "unblock" ? "unblock" : "block";
      if (!phoneNumber) {
        return res.status(400).json({ message: "phoneNumber is required" });
      }

      res.json(await updateInstanceContactBlockStatus(connection, phoneNumber, action));
    });
  });

  app.post("/api/integration/instances/:instanceId/contacts/presence", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const phoneNumber = String((req.body as any)?.phoneNumber || (req.body as any)?.phone || "").trim();
      const rawPresence = String((req.body as any)?.presence || "").trim();
      const presence =
        rawPresence === "available" ||
        rawPresence === "unavailable" ||
        rawPresence === "composing" ||
        rawPresence === "recording" ||
        rawPresence === "paused"
          ? rawPresence
          : null;

      if (!phoneNumber) {
        return res.status(400).json({ message: "phoneNumber is required" });
      }

      if (!presence) {
        return res.status(400).json({ message: "presence invalida" });
      }

      res.json(await sendInstanceContactPresence(connection, phoneNumber, presence));
    });
  });

  app.get("/api/integration/instances/:instanceId/groups", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const groups = await listInstanceGroups(connection);
      res.json(Array.isArray(groups) ? groups : []);
    });
  });

  app.post("/api/integration/instances/:instanceId/groups", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = req.body || {};
      const subject = String((body as any).subject || (body as any).name || "").trim();
      const participants = Array.isArray((body as any).participants)
        ? (body as any).participants.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];

      res.status(201).json(await createInstanceGroup(connection, subject, participants));
    });
  });

  app.post("/api/integration/instances/:instanceId/groups/join-by-invite", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await joinInstanceGroupByInvite(connection, String((req.body as any)?.inviteCode || "")));
    });
  });

  app.get("/api/integration/instances/:instanceId/groups/:groupId", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(
        await getInstanceGroupDetails(
          connection,
          String((req.params as any).groupId || ""),
        ),
      );
    });
  });

  app.get("/api/integration/instances/:instanceId/groups/:groupId/participants", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(
        await listInstanceGroupParticipants(
          connection,
          String((req.params as any).groupId || ""),
        ),
      );
    });
  });

  app.patch("/api/integration/instances/:instanceId/groups/:groupId/subject", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(
        await updateInstanceGroupSubject(
          connection,
          String((req.params as any).groupId || ""),
          String((req.body as any)?.subject || ""),
        ),
      );
    });
  });

  app.patch("/api/integration/instances/:instanceId/groups/:groupId/description", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(
        await updateInstanceGroupDescription(
          connection,
          String((req.params as any).groupId || ""),
          (req.body as any)?.description,
        ),
      );
    });
  });

  app.post("/api/integration/instances/:instanceId/groups/:groupId/participants", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = req.body || {};
      const participants = Array.isArray((body as any).participants)
        ? (body as any).participants.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];
      const rawAction = String((body as any).action || "").trim();
      const action =
        rawAction === "add" ||
        rawAction === "remove" ||
        rawAction === "promote" ||
        rawAction === "demote"
          ? rawAction
          : null;

      if (!action) {
        return res.status(400).json({ message: "action invalida" });
      }

      res.json(
        await updateInstanceGroupParticipants(
          connection,
          String((req.params as any).groupId || ""),
          participants,
          action,
        ),
      );
    });
  });

  app.get("/api/integration/instances/:instanceId/groups/:groupId/invite-code", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(
        await getInstanceGroupInviteCode(
          connection,
          String((req.params as any).groupId || ""),
        ),
      );
    });
  });

  app.post("/api/integration/instances/:instanceId/groups/:groupId/invite-code/revoke", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(
        await revokeInstanceGroupInviteCode(
          connection,
          String((req.params as any).groupId || ""),
        ),
      );
    });
  });

  app.post("/api/integration/instances/:instanceId/groups/:groupId/leave", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(
        await leaveInstanceGroup(
          connection,
          String((req.params as any).groupId || ""),
        ),
      );
    });
  });

  app.get("/api/integration/instances/:instanceId/queue", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await getInstanceMessageQueue(connection));
    });
  });

  app.post("/api/integration/instances/:instanceId/queue/clear", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await clearInstanceMessageQueue(connection));
    });
  });

  app.get("/api/integration/instances/:instanceId/webhooks", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json({
        success: true,
        items: listConnectionGatewayWebhooks(connection),
      });
    });
  });

  app.post("/api/integration/instances/:instanceId/webhooks", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const webhook = await createConnectionGatewayWebhook(connection, req.body || {});
      res.status(201).json({
        success: true,
        webhook,
      });
    });
  });

  app.patch("/api/integration/instances/:instanceId/webhooks/:webhookId", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const webhookId = String((req.params as any).webhookId || "").trim();
      if (!webhookId) {
        return res.status(400).json({ message: "Webhook nao encontrado" });
      }

      const webhook = await updateConnectionGatewayWebhook(connection, webhookId, req.body || {});
      res.json({
        success: true,
        webhook,
      });
    });
  });

  app.delete("/api/integration/instances/:instanceId/webhooks/:webhookId", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const webhookId = String((req.params as any).webhookId || "").trim();
      if (!webhookId) {
        return res.status(400).json({ message: "Webhook nao encontrado" });
      }

      const removed = await deleteConnectionGatewayWebhook(connection, webhookId);
      if (!removed) {
        return res.status(404).json({ message: "Webhook nao encontrado" });
      }

      res.json({
        success: true,
        webhookId,
      });
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

  app.post("/api/integration/instances/:instanceId/messages/image", handleImageSend);
  app.post("/api/integration/instances/:instanceId/messages/send-image", handleImageSend);

  app.post("/api/integration/instances/:instanceId/messages/audio", handleAudioSend);
  app.post("/api/integration/instances/:instanceId/messages/send-audio", handleAudioSend);

  app.post("/api/integration/instances/:instanceId/messages/video", handleVideoSend);
  app.post("/api/integration/instances/:instanceId/messages/send-video", handleVideoSend);

  app.post("/api/integration/instances/:instanceId/messages/document", handleDocumentSend);
  app.post("/api/integration/instances/:instanceId/messages/send-document", handleDocumentSend);

  app.post("/api/integration/instances/:instanceId/messages/contact", handleContactSend);
  app.post("/api/integration/instances/:instanceId/messages/send-contact", handleContactSend);

  app.post("/api/integration/instances/:instanceId/messages/location", handleLocationSend);
  app.post("/api/integration/instances/:instanceId/messages/send-location", handleLocationSend);

  app.post("/api/integration/instances/:instanceId/messages/buttons", handleButtonsSend);
  app.post("/api/integration/instances/:instanceId/messages/send-buttons", handleButtonsSend);

  app.post("/api/integration/instances/:instanceId/messages/list", handleListSend);
  app.post("/api/integration/instances/:instanceId/messages/send-list", handleListSend);

  app.post("/api/integration/instances/:instanceId/messages/reaction", handleReactionSend);
  app.post("/api/integration/instances/:instanceId/messages/send-reaction", handleReactionSend);
}
