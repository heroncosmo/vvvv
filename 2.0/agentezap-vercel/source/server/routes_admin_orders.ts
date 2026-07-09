import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { isAdmin, isAuthenticated } from "./supabaseAuth";
import { canUserAccessOwnerWorkspace } from "./ownerWorkspaceRegistry";
import {
  getAdminOrdersRecoveryConfig,
  getAdminOrdersReport,
  getOwnerAdminRecord,
  isOwnerAdminEmail,
  saveAdminOrdersRecoveryConfig,
  sendAdminOrderRecoveryNow,
  startAdminOrdersRecoveryService,
} from "./adminOrdersRecoveryService";

async function requireOwnerAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = (req as any).admin;
    if (isOwnerAdminEmail(admin?.email)) {
      return next();
    }

    const sessionAdminId = String(
      (req.session as any)?.adminId ||
      (req as any).user?.id ||
      (req as any).user?.claims?.sub ||
      "",
    );

    if (sessionAdminId) {
      const ownerAdmin = await getOwnerAdminRecord();
      if (ownerAdmin?.id === sessionAdminId) {
        return next();
      }
    }

    return res.status(403).json({ message: "Acesso restrito ao owner" });
  } catch (error) {
    console.error("[ADMIN ORDERS] Falha ao validar owner admin:", error);
    return res.status(500).json({ message: "Falha ao validar acesso owner" });
  }
}

function getAuthenticatedUserId(req: Request): string {
  return String(
    (req as any)?.user?.claims?.sub ||
    (req as any)?.user?.id ||
    (req.session as any)?.user?.id ||
    "",
  );
}

async function requireOwnerWorkspaceOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const allowed = await canUserAccessOwnerWorkspace(userId);
    if (!allowed) {
      return res.status(403).json({ message: "Acesso restrito ao workspace do administrador" });
    }

    return next();
  } catch (error) {
    console.error("[OWNER ORDERS] Falha ao validar owner workspace:", error);
    return res.status(500).json({ message: "Falha ao validar acesso owner" });
  }
}

function registerOrdersRouteSet(app: Express, basePath: string, guards: RequestHandler[]) {
  app.get(`${basePath}/orders/report`, ...guards, async (req, res) => {
    try {
      const days = Number(req.query.days || 7);
      const includeTests = String(req.query.includeTests || "false") === "true";
      const [config, report] = await Promise.all([
        getAdminOrdersRecoveryConfig(),
        getAdminOrdersReport(days, includeTests),
      ]);

      res.json({
        ...report,
        config,
      });
    } catch (error) {
      console.error("[Admin Orders] Erro ao carregar relatório:", error);
      res.status(500).json({ message: "Erro ao carregar relatório de pedidos" });
    }
  });

  app.get(`${basePath}/orders/recovery-config`, ...guards, async (_req, res) => {
    try {
      res.json(await getAdminOrdersRecoveryConfig());
    } catch (error) {
      console.error("[Admin Orders] Erro ao carregar configuração:", error);
      res.status(500).json({ message: "Erro ao carregar configuração" });
    }
  });

  app.put(`${basePath}/orders/recovery-config`, ...guards, async (req, res) => {
    try {
      const config = await saveAdminOrdersRecoveryConfig(req.body || {});
      res.json(config);
    } catch (error) {
      console.error("[Admin Orders] Erro ao salvar configuração:", error);
      res.status(500).json({ message: "Erro ao salvar configuração" });
    }
  });

  app.post(`${basePath}/orders/:subscriptionId/send-recovery`, ...guards, async (req, res) => {
    try {
      const step = Number(req.body?.step || 1) === 2 ? 2 : 1;
      const result = await sendAdminOrderRecoveryNow(req.params.subscriptionId, step);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao enviar lembrete";
      res.status(400).json({ message });
    }
  });
}

export function registerAdminOrdersRoutes(app: Express): void {
  registerOrdersRouteSet(app, "/api/admin", [isAdmin, requireOwnerAdmin]);
  registerOrdersRouteSet(app, "/api/owner-workspace", [isAuthenticated, requireOwnerWorkspaceOrders]);
  startAdminOrdersRecoveryService();
}
