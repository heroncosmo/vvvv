import type { Express, Request, Response } from "express";

import { storage } from "./storage";
import { verifyPublicInstanceToken } from "./whatsappInstanceTokens";
import {
  buildLocalInstanceDevice,
  buildLocalInstanceStatus,
  clearInstanceMessageQueue,
  createInstanceGroup,
  getInstanceGroupDetails,
  getInstanceGroupInviteCode,
  getInstanceMessageMedia,
  getInstanceMessageQueue,
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
  sendButtonsViaInstance,
  sendContactViaInstance,
  sendInstanceContactPresence,
  sendListViaInstance,
  sendLocationViaInstance,
  sendMediaViaInstance,
  sendReactionViaInstance,
  sendTextViaInstance,
  updateInstanceGroupDescription,
  updateInstanceGroupParticipants,
  updateInstanceGroupSubject,
  updateInstanceContactBlockStatus,
  validateInstanceContact,
  validateInstanceContactsBatch,
} from "./whatsappInstanceApiService";
import { resolveAppVisibleConnectionOwner } from "./whatsappGatewayAppOwnership";
import {
  clearGatewayInstanceQueue,
  connectGatewayInstance,
  createGatewayInstanceGroup,
  disconnectGatewayInstance,
  getGatewayInstanceGroupDetails,
  getGatewayInstanceGroupInviteCode,
  getGatewayInstanceMessageMedia,
  getGatewayInstanceQueue,
  getGatewayInstanceContactProfilePicture,
  joinGatewayInstanceGroupByInvite,
  listGatewayInstanceContacts,
  listGatewayInstanceConversations,
  listGatewayInstanceGroups,
  listGatewayInstanceGroupParticipants,
  listGatewayInstanceMessages,
  leaveGatewayInstanceGroup,
  redownloadGatewayInstanceMessageMedia,
  resetGatewayInstance,
  revokeGatewayInstanceGroupInviteCode,
  sendGatewayInstanceButtons,
  sendGatewayInstanceContact,
  sendGatewayInstanceContactPresence,
  sendGatewayInstanceList,
  sendGatewayInstanceLocation,
  sendGatewayInstanceMedia,
  sendGatewayInstanceReaction,
  sendGatewayInstanceText,
  updateGatewayInstanceGroupDescription,
  updateGatewayInstanceGroupParticipants,
  updateGatewayInstanceGroupSubject,
  updateGatewayInstanceContactBlockStatus,
  validateGatewayInstanceContact,
  validateGatewayInstanceContactsBatch,
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
  const createTypedPublicMediaHandler =
    (type: "image" | "audio" | "video" | "document") => async (req: Request, res: Response) => {
      req.body = {
        ...(req.body || {}),
        type,
      };

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
    };

  const handlePublicImageSend = createTypedPublicMediaHandler("image");
  const handlePublicAudioSend = createTypedPublicMediaHandler("audio");
  const handlePublicVideoSend = createTypedPublicMediaHandler("video");
  const handlePublicDocumentSend = createTypedPublicMediaHandler("document");

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

  app.get("/api/public/instances/:instanceId/conversations/:conversationId/messages/:messageId/media", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const conversationId = String((req.params as any).conversationId || "");
      const messageId = String((req.params as any).messageId || "");
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await getGatewayInstanceMessageMedia(connection.id, conversationId, messageId)
          : await getInstanceMessageMedia(connection, conversationId, messageId),
      );
    });
  });

  app.post("/api/public/instances/:instanceId/conversations/:conversationId/messages/:messageId/media/redownload", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const conversationId = String((req.params as any).conversationId || "");
      const messageId = String((req.params as any).messageId || "");
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await redownloadGatewayInstanceMessageMedia(connection.id, conversationId, messageId)
          : await redownloadInstanceMessageMedia(connection, conversationId, messageId),
      );
    });
  });

  app.get("/api/public/instances/:instanceId/groups", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await listGatewayInstanceGroups(connection.id)
          : await listInstanceGroups(connection),
      );
    });
  });

  app.post("/api/public/instances/:instanceId/groups", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const body = req.body || {};
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.status(201).json(
        owner === "gateway"
          ? await createGatewayInstanceGroup(connection.id, body)
          : await createInstanceGroup(
              connection,
              String((body as any).subject || (body as any).name || ""),
              Array.isArray((body as any).participants)
                ? (body as any).participants.map((value: unknown) => String(value || "").trim()).filter(Boolean)
                : [],
            ),
      );
    });
  });

  app.post("/api/public/instances/:instanceId/groups/join-by-invite", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const body = req.body || {};
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await joinGatewayInstanceGroupByInvite(connection.id, body)
          : await joinInstanceGroupByInvite(connection, String((body as any).inviteCode || "")),
      );
    });
  });

  app.get("/api/public/instances/:instanceId/groups/:groupId", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const groupId = String((req.params as any).groupId || "");
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await getGatewayInstanceGroupDetails(connection.id, groupId)
          : await getInstanceGroupDetails(connection, groupId),
      );
    });
  });

  app.get("/api/public/instances/:instanceId/groups/:groupId/participants", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const groupId = String((req.params as any).groupId || "");
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await listGatewayInstanceGroupParticipants(connection.id, groupId)
          : await listInstanceGroupParticipants(connection, groupId),
      );
    });
  });

  app.patch("/api/public/instances/:instanceId/groups/:groupId/subject", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const groupId = String((req.params as any).groupId || "");
      const body = req.body || {};
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await updateGatewayInstanceGroupSubject(connection.id, groupId, body)
          : await updateInstanceGroupSubject(connection, groupId, String((body as any).subject || "")),
      );
    });
  });

  app.patch("/api/public/instances/:instanceId/groups/:groupId/description", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const groupId = String((req.params as any).groupId || "");
      const body = req.body || {};
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await updateGatewayInstanceGroupDescription(connection.id, groupId, body)
          : await updateInstanceGroupDescription(connection, groupId, (body as any).description),
      );
    });
  });

  app.post("/api/public/instances/:instanceId/groups/:groupId/participants", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const groupId = String((req.params as any).groupId || "");
      const body = req.body || {};
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

      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await updateGatewayInstanceGroupParticipants(connection.id, groupId, body)
          : await updateInstanceGroupParticipants(
              connection,
              groupId,
              Array.isArray((body as any).participants)
                ? (body as any).participants.map((value: unknown) => String(value || "").trim()).filter(Boolean)
                : [],
              action,
            ),
      );
    });
  });

  app.get("/api/public/instances/:instanceId/groups/:groupId/invite-code", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const groupId = String((req.params as any).groupId || "");
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await getGatewayInstanceGroupInviteCode(connection.id, groupId)
          : await getInstanceGroupInviteCode(connection, groupId),
      );
    });
  });

  app.post("/api/public/instances/:instanceId/groups/:groupId/invite-code/revoke", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const groupId = String((req.params as any).groupId || "");
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await revokeGatewayInstanceGroupInviteCode(connection.id, groupId)
          : await revokeInstanceGroupInviteCode(connection, groupId),
      );
    });
  });

  app.post("/api/public/instances/:instanceId/groups/:groupId/leave", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const groupId = String((req.params as any).groupId || "");
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await leaveGatewayInstanceGroup(connection.id, groupId)
          : await leaveInstanceGroup(connection, groupId),
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

  app.get("/api/public/instances/:instanceId/queue", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await getGatewayInstanceQueue(connection.id)
          : await getInstanceMessageQueue(connection),
      );
    });
  });

  app.post("/api/public/instances/:instanceId/queue/clear", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await clearGatewayInstanceQueue(connection.id)
          : await clearInstanceMessageQueue(connection),
      );
    });
  });

  app.get("/api/public/instances/:instanceId/contacts/validate", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const phoneNumber = String((req.query as any)?.phoneNumber || (req.query as any)?.phone || "").trim();
      if (!phoneNumber) {
        return res.status(400).json({ message: "phoneNumber is required" });
      }

      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await validateGatewayInstanceContact(connection.id, phoneNumber)
          : await validateInstanceContact(connection, phoneNumber),
      );
    });
  });

  app.post("/api/public/instances/:instanceId/contacts/validate-bulk", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const phoneNumbers = Array.isArray((req.body as any)?.phoneNumbers)
        ? (req.body as any).phoneNumbers.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];
      if (phoneNumbers.length === 0) {
        return res.status(400).json({ message: "phoneNumbers is required" });
      }

      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await validateGatewayInstanceContactsBatch(connection.id, phoneNumbers)
          : { success: true, items: await validateInstanceContactsBatch(connection, phoneNumbers) },
      );
    });
  });

  app.get("/api/public/instances/:instanceId/contacts/profile-picture", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const phoneNumber = String((req.query as any)?.phoneNumber || (req.query as any)?.phone || "").trim();
      const type = String((req.query as any)?.type || "preview").trim() === "image" ? "image" : "preview";
      if (!phoneNumber) {
        return res.status(400).json({ message: "phoneNumber is required" });
      }

      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await getGatewayInstanceContactProfilePicture(connection.id, phoneNumber, type)
          : await getInstanceContactProfilePicture(connection, phoneNumber, type),
      );
    });
  });

  app.post("/api/public/instances/:instanceId/contacts/block", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const body = req.body || {};
      const phoneNumber = String((body as any).phoneNumber || (body as any).phone || "").trim();
      if (!phoneNumber) {
        return res.status(400).json({ message: "phoneNumber is required" });
      }

      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await updateGatewayInstanceContactBlockStatus(connection.id, body)
          : await updateInstanceContactBlockStatus(
              connection,
              phoneNumber,
              String((body as any).action || "block").trim() === "unblock" ? "unblock" : "block",
            ),
      );
    });
  });

  app.post("/api/public/instances/:instanceId/contacts/presence", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const body = req.body || {};
      const phoneNumber = String((body as any).phoneNumber || (body as any).phone || "").trim();
      const rawPresence = String((body as any).presence || "").trim();
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

      const owner = await resolveAppVisibleConnectionOwner(connection);
      res.json(
        owner === "gateway"
          ? await sendGatewayInstanceContactPresence(connection.id, body)
          : await sendInstanceContactPresence(connection, phoneNumber, presence),
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

  app.post("/api/public/instances/:instanceId/messages/send-image", handlePublicImageSend);
  app.post("/api/public/instances/:instanceId/messages/send-audio", handlePublicAudioSend);
  app.post("/api/public/instances/:instanceId/messages/send-video", handlePublicVideoSend);
  app.post("/api/public/instances/:instanceId/messages/send-document", handlePublicDocumentSend);

  app.post("/api/public/instances/:instanceId/messages/send-contact", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      const body = req.body || {};
      if (owner === "gateway") {
        res.json(await sendGatewayInstanceContact(connection.id, body));
        return;
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
  });

  app.post("/api/public/instances/:instanceId/messages/send-location", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      const body = req.body || {};
      if (owner === "gateway") {
        res.json(await sendGatewayInstanceLocation(connection.id, body));
        return;
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
  });

  app.post("/api/public/instances/:instanceId/messages/send-buttons", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      const body = req.body || {};
      if (owner === "gateway") {
        res.json(await sendGatewayInstanceButtons(connection.id, body));
        return;
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
  });

  app.post("/api/public/instances/:instanceId/messages/send-list", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      const body = req.body || {};
      if (owner === "gateway") {
        res.json(await sendGatewayInstanceList(connection.id, body));
        return;
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
  });

  app.post("/api/public/instances/:instanceId/messages/send-reaction", async (req: Request, res: Response) => {
    await withAuthenticatedConnection(req, res, async (connection) => {
      const owner = await resolveAppVisibleConnectionOwner(connection);
      const body = req.body || {};
      if (owner === "gateway") {
        res.json(await sendGatewayInstanceReaction(connection.id, body));
        return;
      }
      res.json(
        await sendReactionViaInstance({
          connection,
          messageId: String((body as any).messageId || "").trim(),
          emoji: (body as any).emoji || undefined,
          conversationId: (body as any).conversationId || undefined,
        }),
      );
    });
  });
}
