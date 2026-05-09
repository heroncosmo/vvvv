import type { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import { isAuthenticated } from "../supabaseAuth";
import * as controller from "./tickets.controller";

function normalizeMimeType(mimeType: string | null | undefined): string {
  return String(mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "image/png",
  "image/jpg",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "application/pdf",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "text/plain",
  "text/csv",
]);

const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".mp4",
  ".webm",
  ".mov",
  ".mp3",
  ".m4a",
  ".aac",
  ".ogg",
  ".wav",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".zip",
  ".txt",
  ".csv",
  ".json",
]);

function isAllowedAttachment(file: Express.Multer.File): boolean {
  const normalizedMimeType = normalizeMimeType(file.mimetype);
  if (ALLOWED_ATTACHMENT_MIME_TYPES.has(normalizedMimeType)) {
    return true;
  }

  const extension = path.extname(String(file.originalname || "")).toLowerCase();
  return ALLOWED_ATTACHMENT_EXTENSIONS.has(extension);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    const ok = isAllowedAttachment(file);
    cb(
      ok ? null : new Error("Formato invalido. Envie imagem, video, audio, PDF, documento, planilha, ZIP ou texto."),
      ok,
    );
  },
});

const uploadAttachments = upload.array("attachments", 6);

function handleTicketUpload(req: Request, res: Response, next: NextFunction) {
  uploadAttachments(req, res, (error: any) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "Arquivo muito grande. Envie arquivos de ate 25 MB."
        : error.code === "LIMIT_FILE_COUNT"
          ? "Envie no maximo 6 arquivos por mensagem."
          : error.message;
      return res.status(400).json({ message });
    }

    return res.status(400).json({ message: error.message || "Nao foi possivel anexar o arquivo." });
  });
}

function requireAdmin(req: any, res: any, next: any) {
  const role = req.user?.role || req.session?.user?.role || req.session?.adminRole;
  if (role !== "admin" && role !== "owner") {
    return res.status(403).json({ error: "Acesso restrito a administradores." });
  }
  next();
}

export function registerTicketRoutes(app: Express): void {
  console.log("[Tickets] Registrando rotas de chamados...");

  // User routes
  app.get("/api/tickets", isAuthenticated, controller.listUserTickets);
  app.post("/api/tickets", isAuthenticated, handleTicketUpload, controller.createTicket);
  app.get("/api/tickets/:id", isAuthenticated, controller.getUserTicketById);
  app.patch("/api/tickets/:id", isAuthenticated, controller.updateUserTicket);
  app.delete("/api/tickets/:id", isAuthenticated, controller.deleteUserTicket);
  app.get("/api/tickets/:id/messages", isAuthenticated, controller.listUserTicketMessages);
  app.post("/api/tickets/:id/messages", isAuthenticated, handleTicketUpload, controller.sendUserMessage);
  app.post("/api/tickets/:id/read", isAuthenticated, controller.markUserRead);
  app.post("/api/tickets/route", isAuthenticated, controller.routeTicket);

  // Admin routes
  app.get("/api/admin/tickets", isAuthenticated, requireAdmin, controller.listAdminTickets);
  app.get("/api/admin/tickets/reports", isAuthenticated, requireAdmin, controller.getTicketReports);
  app.get("/api/admin/tickets/:id", isAuthenticated, requireAdmin, controller.getAdminTicketById);
  app.patch("/api/admin/tickets/:id", isAuthenticated, requireAdmin, controller.updateAdminTicket);
  app.patch("/api/admin/tickets/:id/status", isAuthenticated, requireAdmin, controller.updateAdminTicketStatus);
  app.get("/api/admin/tickets/:id/messages", isAuthenticated, requireAdmin, controller.listAdminTicketMessages);
  app.post("/api/admin/tickets/:id/messages", isAuthenticated, requireAdmin, handleTicketUpload, controller.sendAdminMessage);
  app.post("/api/admin/tickets/:id/read", isAuthenticated, requireAdmin, controller.markAdminRead);

  console.log("[Tickets] Rotas registradas com sucesso!");
}
// v2 - Railway build compatible
