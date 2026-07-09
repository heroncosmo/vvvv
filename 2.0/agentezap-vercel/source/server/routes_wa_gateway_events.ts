import type { Express, Request, Response } from "express";

import { broadcastToUser } from "./appRealtime";

const DEFAULT_INTERNAL_TOKEN = "agentezap-internal-wa-gateway";

function getInternalToken(): string {
  return (process.env.WA_GATEWAY_INTERNAL_TOKEN || DEFAULT_INTERNAL_TOKEN).trim();
}

function isAuthorized(req: Request): boolean {
  return String(req.header("x-wa-gateway-token") || "").trim() === getInternalToken();
}

export function registerWhatsAppGatewayEventRoutes(app: Express) {
  app.post("/api/internal/wa-gateway/events", async (req: Request, res: Response) => {
    try {
      if (!isAuthorized(req)) {
        return res.status(401).json({ message: "Unauthorized gateway event" });
      }

      const userId = String((req.body as any)?.userId || "").trim();
      const data = (req.body as any)?.data;

      if (!userId || !data || typeof data !== "object") {
        return res.status(400).json({ message: "Invalid gateway event payload" });
      }

      broadcastToUser(userId, data);
      res.json({ success: true });
    } catch (error) {
      console.error("[WA GATEWAY EVENT] Failed to process gateway event:", error);
      res.status(500).json({ message: "Failed to process gateway event" });
    }
  });
}
