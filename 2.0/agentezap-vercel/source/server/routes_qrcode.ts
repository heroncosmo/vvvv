/**
 * QR Code Inteligente - API Routes
 * Step 1: Backend routes for CRUD + download + business categories
 *
 * Endpoints:
 * GET    /api/qrcodes                       - List user's QR Codes
 * POST   /api/qrcodes                       - Create new QR Code
 * GET    /api/qrcodes/:id                   - Get single QR Code
 * PATCH  /api/qrcodes/:id                   - Update QR Code
 * DELETE /api/qrcodes/:id                   - Delete QR Code
 * GET    /api/qrcodes/:id/download          - Download QR as PNG/SVG
 * GET    /api/qrcodes/templates             - List hardcoded segment templates
 * POST   /api/qrcodes/preview               - Preview QR without saving
 * POST   /api/qrcodes/:id/scan              - Register a scan (analytics)
 *
 * GET    /api/business-categories           - List all active categories (public)
 * GET    /api/business-categories/groups    - List macro-groups with their categories
 * GET    /api/business-categories/:slug     - Get single category by slug
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "./db";
import { getUserId, isAuthenticated } from "./supabaseAuth";
import { businessCategories } from "../shared/schema";
import { eq, asc } from "drizzle-orm";
import {
  createSmartQrcode,
  listUserQrcodes,
  getQrcodeById,
  updateQrcode,
  deleteQrcode,
  registerQrcodeScan,
  getQrcodeTemplates,
  buildWhatsAppUrl,
  generateQrCodeImage,
  generateQrCodeSvg,
  QRCODE_TEMPLATES,
} from "./qrcodeService";
import { smartQrcodeSchema, updateSmartQrcodeSchema } from "../shared/schema";

export function registerQrcodeRoutes(app: Express): void {
  console.log("📱 [QRCode] Registrando rotas QR Code Inteligente...");

  // ─── GET /api/qrcodes/templates ───────────────────────────────────────────
  app.get("/api/qrcodes/templates", (_req: Request, res: Response) => {
    const templates = getQrcodeTemplates();
    return res.json({ templates });
  });

  // ─── POST /api/qrcodes/preview ────────────────────────────────────────────
  // Generate a QR Code preview without saving (for live editor)
  app.post("/api/qrcodes/preview", async (req: Request, res: Response) => {
    try {
      const {
        whatsappNumber,
        welcomeMessage,
        foregroundColor = "#000000",
        backgroundColor = "#ffffff",
        errorCorrection = "H",
        qrSize = 400,
      } = req.body;

      if (!whatsappNumber) {
        return res.status(400).json({ error: "whatsappNumber é obrigatório" });
      }

      const targetUrl = buildWhatsAppUrl(whatsappNumber, welcomeMessage);
      const qrData = await generateQrCodeImage({
        targetUrl,
        size: qrSize,
        foregroundColor,
        backgroundColor,
        errorCorrection,
      });

      return res.json({ qrData, targetUrl });
    } catch (error) {
      console.error("[QRCode] Error generating preview:", error);
      return res.status(500).json({ error: "Erro ao gerar preview" });
    }
  });

  // ─── GET /api/qrcodes ─────────────────────────────────────────────────────
  app.get("/api/qrcodes", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Não autorizado" });

      const qrcodes = await listUserQrcodes(userId);
      return res.json({ qrcodes });
    } catch (error) {
      console.error("[QRCode] Error listing QR Codes:", error);
      return res.status(500).json({ error: "Erro ao listar QR Codes" });
    }
  });

  // ─── POST /api/qrcodes ────────────────────────────────────────────────────
  app.post("/api/qrcodes", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Não autorizado" });

      let body = req.body;

      // Apply template defaults if templateId provided
      if (body.templateId && QRCODE_TEMPLATES[body.templateId]) {
        const tpl = QRCODE_TEMPLATES[body.templateId];
        body = {
          welcomeMessage: tpl.welcomeMessage,
          foregroundColor: tpl.foregroundColor,
          templateName: tpl.name,
          ...body, // body overrides template
        };
      }

      if (!body.targetUrl && body.whatsappNumber) {
        body = {
          ...body,
          targetUrl: buildWhatsAppUrl(body.whatsappNumber, body.welcomeMessage),
        };
      }

      const parsed = smartQrcodeSchema.parse(body);
      const qrcode = await createSmartQrcode(userId, parsed);

      return res.status(201).json({ qrcode });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Dados inválidos", details: error.errors });
      }
      console.error("[QRCode] Error creating QR Code:", error);
      return res.status(500).json({ error: "Erro ao criar QR Code" });
    }
  });

  // ─── GET /api/qrcodes/:id ─────────────────────────────────────────────────
  app.get("/api/qrcodes/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Não autorizado" });

      const qrcode = await getQrcodeById(userId, req.params.id);
      if (!qrcode) {
        return res.status(404).json({ error: "QR Code não encontrado" });
      }

      return res.json({ qrcode });
    } catch (error) {
      console.error("[QRCode] Error fetching QR Code:", error);
      return res.status(500).json({ error: "Erro ao buscar QR Code" });
    }
  });

  // ─── PATCH /api/qrcodes/:id ───────────────────────────────────────────────
  app.patch("/api/qrcodes/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Não autorizado" });

      let body = req.body;

      if (body.templateId && QRCODE_TEMPLATES[body.templateId]) {
        const tpl = QRCODE_TEMPLATES[body.templateId];
        body = {
          welcomeMessage: tpl.welcomeMessage,
          foregroundColor: tpl.foregroundColor,
          templateName: tpl.name,
          ...body,
        };
      }

      const parsed = updateSmartQrcodeSchema.parse(body);
      const qrcode = await updateQrcode(userId, req.params.id, parsed);

      if (!qrcode) {
        return res.status(404).json({ error: "QR Code não encontrado" });
      }

      return res.json({ qrcode });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Dados inválidos", details: error.errors });
      }
      console.error("[QRCode] Error updating QR Code:", error);
      return res.status(500).json({ error: "Erro ao atualizar QR Code" });
    }
  });

  // ─── DELETE /api/qrcodes/:id ──────────────────────────────────────────────
  app.delete("/api/qrcodes/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Não autorizado" });

      const deleted = await deleteQrcode(userId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "QR Code não encontrado" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("[QRCode] Error deleting QR Code:", error);
      return res.status(500).json({ error: "Erro ao deletar QR Code" });
    }
  });

  // ─── GET /api/qrcodes/:id/download ────────────────────────────────────────
  // Query params: format=png|svg  (default: png)
  app.get("/api/qrcodes/:id/download", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Não autorizado" });

      const format = (req.query.format as string) || "png";
      const qrcode = await getQrcodeById(userId, req.params.id);

      if (!qrcode) {
        return res.status(404).json({ error: "QR Code não encontrado" });
      }

      const safeName = qrcode.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();

      if (format === "svg") {
        const svg = await generateQrCodeSvg({
          targetUrl: qrcode.targetUrl,
          size: qrcode.qrSize || 400,
          foregroundColor: qrcode.foregroundColor || "#000000",
          backgroundColor: qrcode.backgroundColor || "#ffffff",
          errorCorrection: (qrcode.errorCorrection || "H") as "L" | "M" | "Q" | "H",
        });

        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}.svg"`);
        return res.send(svg);
      }

      // Default: PNG
      let pngData = qrcode.qrData;
      if (!pngData) {
        pngData = await generateQrCodeImage({
          targetUrl: qrcode.targetUrl,
          size: qrcode.qrSize || 400,
          foregroundColor: qrcode.foregroundColor || "#000000",
          backgroundColor: qrcode.backgroundColor || "#ffffff",
          errorCorrection: (qrcode.errorCorrection || "H") as "L" | "M" | "Q" | "H",
        });
      }

      const base64 = pngData.replace(/^data:image\/png;base64,/, "");
      const buffer = Buffer.from(base64, "base64");

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.png"`);
      res.setHeader("Content-Length", buffer.length);
      return res.send(buffer);
    } catch (error) {
      console.error("[QRCode] Error downloading QR Code:", error);
      return res.status(500).json({ error: "Erro ao baixar QR Code" });
    }
  });

  // ─── POST /api/qrcodes/:id/scan ───────────────────────────────────────────
  app.post("/api/qrcodes/:id/scan", async (req: Request, res: Response) => {
    try {
      const { qrcodeId, userId } = req.body;
      if (!qrcodeId || !userId) {
        return res.status(400).json({ error: "qrcodeId e userId são obrigatórios" });
      }

      await registerQrcodeScan(qrcodeId, userId, {
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("[QRCode] Error registering scan:", error);
      return res.status(500).json({ error: "Erro ao registrar scan" });
    }
  });

  console.log("✅ [QRCode] Rotas registradas com sucesso!");

  // ─── BUSINESS CATEGORIES (public endpoints) ───────────────────────────────

  // GET /api/business-categories — all active, ordered
  app.get("/api/business-categories", async (_req: Request, res: Response) => {
    try {
      const cats = await db
        .select()
        .from(businessCategories)
        .where(eq(businessCategories.isActive, true))
        .orderBy(asc(businessCategories.sortOrder));
      return res.json({ categories: cats });
    } catch (error) {
      console.error("[BusinessCategories] Error listing:", error);
      return res.status(500).json({ error: "Erro ao listar categorias" });
    }
  });

  // GET /api/business-categories/groups — macro-groups with nested categories
  app.get("/api/business-categories/groups", async (_req: Request, res: Response) => {
    try {
      const cats = await db
        .select()
        .from(businessCategories)
        .where(eq(businessCategories.isActive, true))
        .orderBy(asc(businessCategories.sortOrder));

      // Group by categoryGroup
      const grouped: Record<string, {
        group: string;
        groupLabel: string;
        totalUsers: number;
        categories: typeof cats;
      }> = {};

      for (const cat of cats) {
        if (!grouped[cat.categoryGroup]) {
          grouped[cat.categoryGroup] = {
            group: cat.categoryGroup,
            groupLabel: cat.groupLabel,
            totalUsers: 0,
            categories: [],
          };
        }
        grouped[cat.categoryGroup].categories.push(cat);
        grouped[cat.categoryGroup].totalUsers += cat.userCount;
      }

      // Sort groups by totalUsers desc
      const groups = Object.values(grouped).sort((a, b) => b.totalUsers - a.totalUsers);
      return res.json({ groups });
    } catch (error) {
      console.error("[BusinessCategories] Error grouping:", error);
      return res.status(500).json({ error: "Erro ao agrupar categorias" });
    }
  });

  // GET /api/business-categories/:slug — single category
  app.get("/api/business-categories/:slug", async (req: Request, res: Response) => {
    try {
      const [cat] = await db
        .select()
        .from(businessCategories)
        .where(eq(businessCategories.slug, req.params.slug));
      if (!cat) {
        return res.status(404).json({ error: "Categoria não encontrada" });
      }
      return res.json({ category: cat });
    } catch (error) {
      console.error("[BusinessCategories] Error fetching:", error);
      return res.status(500).json({ error: "Erro ao buscar categoria" });
    }
  });

  console.log("✅ [BusinessCategories] Rotas registradas com sucesso!");
}
