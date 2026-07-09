import type { Express, Request, Response } from "express";

import { storage } from "./storage";
import {
  previewStatusAudienceForUser,
  sendStatusPostForUser,
} from "./statusPostingService";
import {
  buildLocalInstanceDevice,
  buildLocalInstanceStatus,
  listInstanceContacts,
  listInstanceConversations,
  listInstanceGroups,
  listInstanceMessages,
  sendMediaDirectViaInstance,
  sendGroupBulkViaInstance,
  sendTextDirectViaInstance,
  sendMediaViaInstance,
  sendTextViaInstance,
  syncInstanceGroupHistory,
} from "./whatsappInstanceApiService";
import { isConnectionOwnedByCurrentProcess } from "./whatsappGatewayOwnership";
import {
  getGatewayRuntimeJobDefinition,
  listGatewayRuntimeJobs,
  runGatewayRuntimeJob,
} from "./waGatewayRuntimeJobs";
import { connectWhatsApp, disconnectWhatsApp, forceResetWhatsApp } from "./whatsapp";

const DEFAULT_INTERNAL_TOKEN = "agentezap-internal-wa-gateway";

function getInternalToken(): string {
  return (process.env.WA_GATEWAY_INTERNAL_TOKEN || DEFAULT_INTERNAL_TOKEN).trim();
}

function isAuthorized(req: Request): boolean {
  return String(req.header("x-wa-gateway-token") || "").trim() === getInternalToken();
}

function parseSendSource(source: unknown): "owner" | "agent" | "followup" | "system" | undefined {
  const value = String(source || "").trim();
  if (value === "owner" || value === "agent" || value === "followup" || value === "system") {
    return value;
  }
  return undefined;
}

async function resolveOwnedConnection(connectionId: string) {
  const connection = await storage.getConnectionById(connectionId);
  if (!connection) {
    const error = new Error("Instancia nao encontrada");
    (error as any).status = 404;
    throw error;
  }

  const owned = await isConnectionOwnedByCurrentProcess(connection);
  if (!owned) {
    const error = new Error("Instancia nao pertence a este gateway");
    (error as any).status = 404;
    throw error;
  }

  return connection;
}

async function withGatewayConnection(
  req: Request,
  res: Response,
  handler: (connection: Awaited<ReturnType<typeof resolveOwnedConnection>>) => Promise<void>,
) {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ message: "Unauthorized gateway request" });
    }

    const connection = await resolveOwnedConnection(String((req.params as any).instanceId || ""));
    await handler(connection);
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    const message = error?.message || "Erro interno no gateway";
    res.status(status).json({ message });
  }
}

function requireGatewayAuthorization(req: Request, res: Response): boolean {
  if (isAuthorized(req)) {
    return true;
  }

  res.status(401).json({ message: "Unauthorized gateway request" });
  return false;
}

export function registerWhatsAppGatewayInternalRoutes(app: Express) {
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", mode: "wa-gateway" });
  });

  app.get("/internal/runtime/jobs", async (req: Request, res: Response) => {
    if (!requireGatewayAuthorization(req, res)) {
      return;
    }

    res.json({
      success: true,
      jobs: listGatewayRuntimeJobs(),
    });
  });

  app.post("/internal/runtime/jobs/:jobName/run", async (req: Request, res: Response) => {
    if (!requireGatewayAuthorization(req, res)) {
      return;
    }

    const jobName = String(req.params.jobName || "").trim();
    const definition = getGatewayRuntimeJobDefinition(jobName);
    if (!definition) {
      return res.status(404).json({
        success: false,
        message: `Unknown gateway runtime job: ${jobName}`,
      });
    }

    const startedAt = Date.now();
    try {
      const result = await runGatewayRuntimeJob(jobName);
      return res.json({
        success: true,
        job: jobName,
        durationMs: Date.now() - startedAt,
        ...result,
      });
    } catch (error: any) {
      console.error(`[WA GATEWAY] Runtime job failed job=${jobName}:`, error);
      return res.status(500).json({
        success: false,
        job: jobName,
        message: error?.message || "Failed to run gateway runtime job",
      });
    }
  });

  app.post("/internal/instances/status/bulk", async (req: Request, res: Response) => {
    try {
      if (!isAuthorized(req)) {
        return res.status(401).json({ message: "Unauthorized gateway request" });
      }

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

      const requestedSet = new Set(requestedIds);
      const allConnections = await storage.getAllConnections();
      const ownedConnections = [];

      for (const connection of allConnections) {
        if (!requestedSet.has(connection.id)) {
          continue;
        }
        if (!await isConnectionOwnedByCurrentProcess(connection)) {
          continue;
        }
        ownedConnections.push(connection);
      }

      const items = await Promise.all(
        ownedConnections.map(async (connection) => buildLocalInstanceStatus(connection)),
      );

      res.json({ items });
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      const message = error?.message || "Erro interno no gateway";
      res.status(status).json({ message });
    }
  });

  app.get("/internal/instances/:instanceId/status", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await buildLocalInstanceStatus(connection));
    });
  });

  app.get("/internal/instances/:instanceId/device", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await buildLocalInstanceDevice(connection));
    });
  });

  app.post("/internal/instances/:instanceId/connect", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      connectWhatsApp(connection.userId, connection.id).catch((error) => {
        console.error("[WA GATEWAY] Failed to connect instance:", error);
      });
      res.json({ success: true, instanceId: connection.id, status: "connecting" });
    });
  });

  app.post("/internal/instances/:instanceId/disconnect", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      await disconnectWhatsApp(connection.userId, connection.id);
      res.json({ success: true, instanceId: connection.id });
    });
  });

  app.post("/internal/instances/:instanceId/reset", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = (req.body && typeof req.body === "object") ? req.body as Record<string, unknown> : {};
      await forceResetWhatsApp(connection.userId, connection.id, {
        source: typeof body.source === "string" && body.source.trim()
          ? body.source.trim()
          : "wa_gateway_internal_reset",
      });
      res.json({ success: true, instanceId: connection.id });
    });
  });

  app.get("/internal/instances/:instanceId/conversations", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await listInstanceConversations(connection.id));
    });
  });

  app.get("/internal/instances/:instanceId/conversations/:conversationId/messages", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await listInstanceMessages(connection.id, String((req.params as any).conversationId || "")));
    });
  });

  app.post("/internal/instances/:instanceId/conversations/:conversationId/group-history-sync", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(
        await syncInstanceGroupHistory(
          connection.id,
          String((req.params as any).conversationId || ""),
        ),
      );
    });
  });

  app.get("/internal/instances/:instanceId/contacts", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(await listInstanceContacts(connection.id));
    });
  });

  app.get("/internal/instances/:instanceId/groups", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const groups = await listInstanceGroups(connection);
      res.json(Array.isArray(groups) ? groups : []);
    });
  });

  app.get("/internal/instances/:instanceId/status-posts/preview-audience", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      res.json(
        await previewStatusAudienceForUser(connection.userId, connection.id),
      );
    });
  });

  app.post("/internal/instances/:instanceId/status-posts/send", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = req.body || {};
      res.json(
        await sendStatusPostForUser(connection.userId, body, {
          preferredConnectionId: connection.id,
        }),
      );
    });
  });

  app.post("/internal/instances/:instanceId/messages/send", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = req.body || {};
      if (body.directByNumber === true) {
        return res.json(
          await sendTextDirectViaInstance({
            connection,
            text: String(body.text || "").trim(),
            to: body.to || undefined,
            contactName: body.contactName || undefined,
            validateDestination: body.validateDestination === true,
          }),
        );
      }
      res.json(
        await sendTextViaInstance({
          connection,
          text: String(body.text || "").trim(),
          conversationId: body.conversationId || undefined,
          to: body.to || undefined,
          contactName: body.contactName || undefined,
          validateDestination: body.validateDestination === true,
          isFromAgent: body.isFromAgent === true,
          source: parseSendSource(body.source),
          acceptQueued: body.acceptQueued === true,
        }),
      );
    });
  });

  app.post("/internal/instances/:instanceId/messages/send-media", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = req.body || {};
      if (body.directByNumber === true) {
        return res.json(
          await sendMediaDirectViaInstance({
            connection,
            type: body.type,
            data: body.data,
            mimetype: body.mimetype,
            filename: body.filename,
            caption: body.caption,
            ptt: body.ptt,
            seconds: body.seconds,
            to: body.to || undefined,
            contactName: body.contactName || undefined,
            validateDestination: body.validateDestination === true,
          }),
        );
      }
      res.json(
        await sendMediaViaInstance({
          connection,
          type: body.type,
          data: body.data,
          mimetype: body.mimetype,
          filename: body.filename,
          caption: body.caption,
          ptt: body.ptt,
          seconds: body.seconds,
          conversationId: body.conversationId || undefined,
          to: body.to || undefined,
          contactName: body.contactName || undefined,
          validateDestination: body.validateDestination === true,
          isFromAgent:
            typeof body.isFromAgent === "boolean"
              ? body.isFromAgent
              : undefined,
          source: parseSendSource(body.source),
          acceptQueued: body.acceptQueued === true,
        }),
      );
    });
  });

  app.post("/internal/instances/:instanceId/groups/send-bulk", async (req: Request, res: Response) => {
    await withGatewayConnection(req, res, async (connection) => {
      const body = req.body || {};
      const groupIds = Array.isArray((body as any).groupIds)
        ? (body as any).groupIds.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];
      const message = String((body as any).message || "").trim();

      if (groupIds.length === 0) {
        return res.status(400).json({ message: "Lista de grupos é obrigatória" });
      }

      if (!message) {
        return res.status(400).json({ message: "Mensagem é obrigatória" });
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
}
