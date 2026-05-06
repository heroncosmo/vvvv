import type { Express, Request, Response } from "express";

import { storage } from "./storage";
import { verifyPublicInstanceToken } from "./whatsappInstanceTokens";
import {
  buildLocalInstanceDevice,
  buildLocalInstanceStatus,
  listInstanceContacts,
  listInstanceConversations,
  listInstanceMessages,
  sendMediaViaInstance,
  sendTextViaInstance,
} from "./whatsappInstanceApiService";
import { resolveAppVisibleConnectionOwner } from "./whatsappGatewayAppOwnership";
import {
  connectGatewayInstance,
  disconnectGatewayInstance,
  listGatewayInstanceContacts,
  listGatewayInstanceConversations,
  listGatewayInstanceMessages,
  resetGatewayInstance,
  sendGatewayInstanceMedia,
  sendGatewayInstanceText,
} from "./whatsappGatewayClient";
import { connectWhatsApp, disconnectWhatsApp, forceResetWhatsApp } from "./whatsapp";
import {
  getAppVisibleGatewayInstanceDevice,
  getAppVisibleGatewayInstanceStatus,
} from "./whatsappGatewayAppRuntime";

async function authenticateInstanceRequest(req: Request) {
  const instanceId = String((req.params as any).instanceId || "").trim();
  if (!instanceId) {
    throw new Error("Instance ID ausente");
  }

  const connection = await storage.getConnectionById(instanceId);
  if (!connection) {
    throw new Error("Instancia nao encontrada");
  }

  const authorization = String(req.header("authorization") || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) {
    const error = new Error("Token ausente");
    (error as any).status = 401;
    throw error;
  }

  if (!connection.publicApiEnabled || !verifyPublicInstanceToken(token, connection.publicApiTokenHash || null)) {
    const error = new Error("Token invalido para esta instancia");
    (error as any).status = 401;
    throw error;
  }

  await storage.updateConnection(connection.id, {
    publicApiLastUsedAt: new Date(),
  } as any);

  return connection;
}

async function withAuthenticatedConnection(
  req: Request,
  res: Response,
  handler: (connection: Awaited<ReturnType<typeof authenticateInstanceRequest>>) => Promise<void>,
) {
  try {
    const connection = await authenticateInstanceRequest(req);
    await handler(connection);
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    const message = error?.message || "Erro na API da instancia";
    res.status(status).json({ message });
  }
}

export function registerPublicInstanceApiRoutes(app: Express) {
  app.get("/api/public/instances/:instanceId/status", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await getAppVisibleGatewayInstanceStatus(connection)
          : await buildLocalInstanceStatus(connection),
      );
    });
  });

  app.get("/api/public/instances/:instanceId/device", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await getAppVisibleGatewayInstanceDevice(connection)
          : await buildLocalInstanceDevice(connection),
      );
    });
  });

  app.post("/api/public/instances/:instanceId/connect", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      if (owner === "gateway") {
        res.json(await connectGatewayInstance(connection.id));
        return;
      }
      connectWhatsApp(connection.userId, connection.id).catch((error) => {
        console.error("[PUBLIC INSTANCE API] Failed to connect instance:", error);
      });
      res.json({ success: true, instanceId: connection.id, status: "connecting" });
    });
  });

  app.post("/api/public/instances/:instanceId/disconnect", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      if (owner === "gateway") {
        res.json(await disconnectGatewayInstance(connection.id));
        return;
      }
      await disconnectWhatsApp(connection.userId, connection.id);
      res.json({ success: true, instanceId: connection.id });
    });
  });

  app.post("/api/public/instances/:instanceId/reset", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      if (owner === "gateway") {
        res.json(await resetGatewayInstance(connection.id, {
          source: "public_instance_api_reset",
        }));
        return;
      }
      await forceResetWhatsApp(connection.userId, connection.id, {
        source: "public_instance_api_reset",
      });
      res.json({ success: true, instanceId: connection.id });
    });
  });

  app.get("/api/public/instances/:instanceId/conversations", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await listGatewayInstanceConversations(connection.id)
          : await listInstanceConversations(connection.id),
      );
    });
  });

  app.get("/api/public/instances/:instanceId/conversations/:conversationId/messages", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await listGatewayInstanceMessages(connection.id, String((req.params as any).conversationId || ""))
          : await listInstanceMessages(connection.id, String((req.params as any).conversationId || "")),
      );
    });
  });

  app.get("/api/public/instances/:instanceId/contacts", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await listGatewayInstanceContacts(connection.id)
          : await listInstanceContacts(connection.id),
      );
    });
  });

  app.post("/api/public/instances/:instanceId/messages/send", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      const body = req.body || {};
      if (owner === "gateway") {
        res.json(await sendGatewayInstanceText(connection.id, body));
        return;
      }
      res.json(
        await sendTextViaInstance({
          connection,
          text: String(body.text || "").trim(),
          conversationId: body.conversationId || undefined,
          to: body.to || undefined,
          contactName: body.contactName || undefined,
        }),
      );
    });
  });

  app.post("/api/public/instances/:instanceId/messages/send-media", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      const body = req.body || {};
      if (owner === "gateway") {
        res.json(await sendGatewayInstanceMedia(connection.id, body));
        return;
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
        }),
      );
    });
  });
}
