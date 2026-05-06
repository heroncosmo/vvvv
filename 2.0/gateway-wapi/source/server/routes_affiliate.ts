import multer from "multer";
import type { Express } from "express";

import { getUserId, isAdmin, isAuthenticated } from "./supabaseAuth";
import {
  getAdminAffiliateOverview,
  getAffiliateDashboard,
  getAffiliatePublicConfig,
  trackAffiliateEvent,
  updateAffiliateProgramSettings,
} from "./affiliateProgramService";
import { uploadMediaToStorage } from "./mediaStorageService";
import {
  approveCommissionRequest,
  approveWithdrawalRequest,
  createCommissionRequest,
  createReferralSupportMaterialsBulk,
  createWithdrawalRequest,
  getAdminReferralSupportMaterialsPage,
  getReferralAdminOverview,
  getReferralDashboard,
  getReferralSupportMaterialsPage,
  logShareAction,
  prepareReferralOutreachCampaign,
  updateReferralProgramCommission,
} from "./referralService";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 24,
  },
});

function parseRewardPerReferral(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = String(value ?? "").trim().replace(",", ".");
  const parsed = Number(normalized);

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return null;
}

export function registerAffiliateRoutes(app: Express) {
  app.get("/api/affiliate/public", async (_req, res) => {
    try {
      const settings = await getAffiliatePublicConfig();
      res.json(settings);
    } catch (error: any) {
      console.error("Error fetching affiliate public config:", error);
      res.status(500).json({ message: "Failed to fetch affiliate public config" });
    }
  });

  app.get("/api/affiliate/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const dashboard = await getAffiliateDashboard(userId);
      res.json(dashboard);
    } catch (error: any) {
      console.error("Error fetching affiliate dashboard:", error);
      res.status(500).json({ message: error.message || "Failed to fetch affiliate dashboard" });
    }
  });

  app.post("/api/affiliate/events", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const type = String(req.body?.type || "").trim() as
        | "link_copied"
        | "message_copied"
        | "campaign_draft_opened"
        | "campaign_sent";

      const allowedTypes = new Set([
        "link_copied",
        "message_copied",
        "campaign_draft_opened",
        "campaign_sent",
      ]);

      if (!allowedTypes.has(type)) {
        return res.status(400).json({ message: "Invalid affiliate event type" });
      }

      const created = await trackAffiliateEvent(userId, type, req.body?.meta);
      res.json(created);
    } catch (error: any) {
      console.error("Error tracking affiliate event:", error);
      res.status(500).json({ message: error.message || "Failed to track affiliate event" });
    }
  });

  app.get("/api/admin/affiliate-program", isAdmin, async (_req, res) => {
    try {
      const overview = await getAdminAffiliateOverview();
      res.json(overview);
    } catch (error: any) {
      console.error("Error fetching admin affiliate overview:", error);
      res.status(500).json({ message: error.message || "Failed to fetch affiliate overview" });
    }
  });

  app.put("/api/admin/affiliate-program/settings", isAdmin, async (req, res) => {
    try {
      const rewardPerReferral = parseRewardPerReferral(req.body?.rewardPerReferral);
      const supportWhatsapp = req.body?.supportWhatsapp ? String(req.body.supportWhatsapp).trim() : undefined;

      if (rewardPerReferral === null) {
        return res.status(400).json({ message: "rewardPerReferral must be a valid number" });
      }

      const updated = await updateAffiliateProgramSettings({
        rewardPerReferral,
        supportWhatsapp,
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating affiliate settings:", error);
      res.status(500).json({ message: error.message || "Failed to update affiliate settings" });
    }
  });

  app.get("/api/referrals/dashboard", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const dashboard = await getReferralDashboard(userId);
      res.json(dashboard);
    } catch (error: any) {
      console.error("Error fetching referral dashboard:", error);
      res.status(500).json({ message: error.message || "Failed to fetch referral dashboard" });
    }
  });

  app.get("/api/referrals/support-materials", isAuthenticated, async (req, res) => {
    try {
      const page = req.query?.page;
      const limit = req.query?.limit;
      const materials = await getReferralSupportMaterialsPage({ page, limit });
      res.json(materials);
    } catch (error: any) {
      console.error("Error fetching referral support materials:", error);
      res.status(500).json({ message: error.message || "Failed to fetch referral support materials" });
    }
  });

  app.post("/api/referrals/share-link", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const channel = String(req.body?.channel || "").trim() || "copy";
      const log = await logShareAction({
        userId,
        channel,
        contactName: req.body?.contactName || null,
        contactPhone: req.body?.contactPhone || null,
        targetConversationId: req.body?.targetConversationId || null,
        messagePreview: req.body?.messagePreview || null,
        metadata: req.body?.metadata || undefined,
      });
      const dashboard = await getReferralDashboard(userId);
      res.json({
        success: true,
        log,
        link: dashboard.link,
      });
    } catch (error: any) {
      console.error("Error logging referral share action:", error);
      res.status(500).json({ message: error.message || "Failed to log referral share action" });
    }
  });

  app.post("/api/referrals/withdrawals", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const request = await createWithdrawalRequest({
        userId,
        amount: req.body?.amount,
        pixType: String(req.body?.pixType || "").trim(),
        pixKey: String(req.body?.pixKey || "").trim(),
        holderName: String(req.body?.holderName || "").trim(),
        documentNumber: req.body?.documentNumber || null,
      });
      res.status(201).json(request);
    } catch (error: any) {
      console.error("Error creating referral withdrawal request:", error);
      const code = error?.message === "INSUFFICIENT_BALANCE" || error?.message === "INVALID_AMOUNT" ? 400 : 500;
      res.status(code).json({ message: error.message || "Failed to create withdrawal request" });
    }
  });

  app.post("/api/referrals/commission-request", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const request = await createCommissionRequest({
        userId,
        requestedAmount: req.body?.requestedAmount,
        justification: String(req.body?.justification || "").trim(),
        attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : undefined,
      });
      res.status(201).json(request);
    } catch (error: any) {
      console.error("Error creating referral commission request:", error);
      const code = error?.message === "INVALID_AMOUNT" ? 400 : 500;
      res.status(code).json({ message: error.message || "Failed to create commission request" });
    }
  });

  app.post("/api/referrals/outreach", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const result = await prepareReferralOutreachCampaign({
        userId,
        contactIds: Array.isArray(req.body?.contactIds) ? req.body.contactIds : undefined,
        conversationIds: Array.isArray(req.body?.conversationIds) ? req.body.conversationIds : undefined,
        name: req.body?.name ? String(req.body.name).trim() : undefined,
        baseMessage: req.body?.baseMessage ? String(req.body.baseMessage).trim() : null,
      });
      res.status(201).json({
        campaignId: result.campaign.id,
        shareUrl: result.shareUrl,
        preparedContacts: result.preparedContacts,
      });
    } catch (error: any) {
      console.error("Error preparing referral outreach campaign:", error);
      res.status(500).json({ message: error.message || "Failed to prepare referral outreach campaign" });
    }
  });

  app.get("/api/admin/referrals/overview", isAdmin, async (_req, res) => {
    try {
      const overview = await getReferralAdminOverview();
      res.json(overview);
    } catch (error: any) {
      console.error("Error fetching admin referral overview:", error);
      res.status(500).json({ message: error.message || "Failed to fetch referral admin overview" });
    }
  });

  app.get("/api/admin/referrals/support-materials", isAdmin, async (req, res) => {
    try {
      const page = req.query?.page;
      const limit = req.query?.limit;
      const materials = await getAdminReferralSupportMaterialsPage({ page, limit });
      res.json(materials);
    } catch (error: any) {
      console.error("Error fetching admin referral support materials:", error);
      res.status(500).json({ message: error.message || "Failed to fetch admin referral support materials" });
    }
  });

  app.post("/api/admin/referrals/support-materials/bulk", isAdmin, upload.array("files", 24), async (req: any, res) => {
    try {
      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) {
        return res.status(400).json({ message: "Nenhum arquivo enviado" });
      }

      const userId = getUserId(req);
      const uploadedFiles: Array<{
        fileUrl: string;
        storagePath: string;
        fileName: string;
        originalFileName: string;
        mimeType: string;
        fileSize: number;
        createdBy: string;
      }> = [];
      const failed: Array<{ fileName: string; reason: string }> = [];

      for (const file of files) {
        const uploaded = await uploadMediaToStorage(file.buffer, file.mimetype, userId);
        if (!uploaded?.url || !uploaded.path) {
          failed.push({
            fileName: file.originalname,
            reason: "Falha ao enviar o arquivo para o storage",
          });
          continue;
        }

        uploadedFiles.push({
          fileUrl: uploaded.url,
          storagePath: uploaded.path,
          fileName: file.originalname,
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          createdBy: userId,
        });
      }

      const created = uploadedFiles.length
        ? await createReferralSupportMaterialsBulk({ files: uploadedFiles })
        : [];

      res.status(201).json({
        success: true,
        totalCreated: created.length,
        items: created,
        failed,
      });
    } catch (error: any) {
      console.error("Error creating referral support materials in bulk:", error);
      res.status(500).json({ message: error.message || "Failed to create referral support materials" });
    }
  });

  app.post("/api/admin/referrals/withdrawals/:id/approve", isAdmin, async (req: any, res) => {
    try {
      const reviewedBy = getUserId(req);
      await approveWithdrawalRequest({
        requestId: req.params.id,
        reviewedBy,
        adminNotes: req.body?.adminNotes || null,
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error approving referral withdrawal:", error);
      const code = error?.message === "REQUEST_NOT_FOUND" ? 404 : 500;
      res.status(code).json({ message: error.message || "Failed to approve withdrawal request" });
    }
  });

  app.post("/api/admin/referrals/commission-requests/:id/approve", isAdmin, async (req: any, res) => {
    try {
      const reviewedBy = getUserId(req);
      await approveCommissionRequest({
        requestId: req.params.id,
        approvedAmount: req.body?.approvedAmount,
        reviewedBy,
        adminNotes: req.body?.adminNotes || null,
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error approving referral commission request:", error);
      const code =
        error?.message === "REQUEST_NOT_FOUND" || error?.message === "INVALID_AMOUNT" ? 400 : 500;
      res.status(code).json({ message: error.message || "Failed to approve commission request" });
    }
  });

  app.post("/api/admin/referrals/program/commission", isAdmin, async (req: any, res) => {
    try {
      const reviewedBy = getUserId(req);
      const updated = await updateReferralProgramCommission({
        amount: req.body?.amount,
        reviewedBy,
      });
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating referral commission program:", error);
      const code = error?.message === "INVALID_AMOUNT" ? 400 : 500;
      res.status(code).json({ message: error.message || "Failed to update referral commission program" });
    }
  });
}
