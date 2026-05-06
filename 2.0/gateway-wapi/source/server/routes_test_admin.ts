/**
 * routes_test_admin.ts
 *
 * Endpoints exclusivos para os testes E2E Playwright do Admin Agent V2.
 * Todas as rotas são protegidas pelo header `x-test-secret`.
 *
 * Não expõe lógica de negócio nova — reutiliza `processAdminMessage` e
 * `clearClientSession` já exportados de `adminAgentService.ts`.
 */

import { Express, Request, Response } from "express";
import {
  processAdminMessage,
  clearClientSession,
} from "./adminAgentService";
import { persistAdminSession } from "./adminSession";
import { supabase } from "./supabaseAuth";
import { storage } from "./storage";

const TEST_SECRET =
  process.env.TEST_ADMIN_SECRET ?? "agentezap-e2e-test-2024";

function checkSecret(req: Request, res: Response): boolean {
  const provided = req.headers["x-test-secret"];
  if (provided !== TEST_SECRET) {
    res.status(403).json({ error: "Forbidden: invalid x-test-secret" });
    return false;
  }
  return true;
}

export function registerTestAdminRoutes(app: Express): void {

  /**
   * POST /api/test/admin-login
   * Creates an Express server-side admin session (req.session.adminId) so that
   * the React admin panel (`RequireAdmin`) treats subsequent requests as admin.
   *
   * The Playwright browser calls this via `page.request.post()` — the session
   * cookie returned is automatically stored in the browser's cookie jar,
   * making it available on subsequent `page.goto()` navigations.
   */
  app.post("/api/test/admin-login", async (req: Request, res: Response) => {
    const secret =
      (req.headers["x-test-secret"] as string) ??
      (req.query["secret"] as string);
    if (secret !== TEST_SECRET) {
      res.status(403).json({ error: "Forbidden: invalid secret" });
      return;
    }

    try {
      // Pick the first admin from the admins table (no password needed in tests)
      const admins = await storage.getAllAdmins();
      if (!admins?.length) {
        res.status(404).json({ error: "No admins found in DB" });
        return;
      }

      const admin = admins[0];

      await persistAdminSession(req, admin);

      console.log(`[TestAdmin] Admin session created for ${admin.email} (id=${admin.id})`);
      res.json({
        success: true,
        admin: { id: admin.id, email: admin.email, role: admin.role ?? "admin" },
      });
    } catch (err: any) {
      console.error("[TestAdmin] Error in admin-login:", err);
      res.status(500).json({ error: "Erro interno", detail: String(err?.message ?? err) });
    }
  });

  /**
   * POST /api/test/admin-chat
   * Body: { phone: string, message: string, skipTrigger?: boolean }
   * Returns: { text: string }
   */
  app.post("/api/test/admin-chat", async (req: Request, res: Response) => {
    if (!checkSecret(req, res)) return;

    const { phone, phoneNumber, message, skipTrigger } = req.body as {
      phone?: string;
      phoneNumber?: string;
      message: string;
      skipTrigger?: boolean;
    };

    const rawPhone = phone || phoneNumber;

    if (!rawPhone || !message) {
      res
        .status(400)
        .json({ error: "Missing required fields: phone or phoneNumber, message" });
      return;
    }

    try {
      const result = await processAdminMessage(
        rawPhone,
        message,
        undefined, // mediaType
        undefined, // mediaUrl
        skipTrigger === true, // skipTriggerCheck
      );

      const text =
        result?.text ??
        "[sem resposta — processAdminMessage retornou null]";

      // V23: Return splitMessages for bubble rendering
      const splitMessages = result?.splitMessages;
      res.json({ text, actions: result?.actions ?? {}, splitMessages });
    } catch (err: any) {
      console.error("[test/admin-chat] Erro ao processar mensagem:", err);
      res
        .status(500)
        .json({ error: "Erro interno", detail: String(err?.message ?? err) });
    }
  });

  /**
   * DELETE /api/test/admin-chat/clear
   * Body: { phone: string }
   * Returns: { cleared: boolean }
   */
  app.delete(
    "/api/test/admin-chat/clear",
    async (req: Request, res: Response) => {
      if (!checkSecret(req, res)) return;

      const { phone } = req.body as { phone?: string };

      if (!phone) {
        res.status(400).json({ error: "Missing required field: phone" });
        return;
      }

      try {
        const cleared = clearClientSession(phone);
        res.json({ cleared: cleared ?? true });
      } catch (err: any) {
        console.error("[test/admin-chat/clear] Erro ao limpar sessão:", err);
        res.status(500).json({
          error: "Erro interno",
          detail: String(err?.message ?? err),
        });
      }
    },
  );

  /**
   * GET /api/test/admin-session
   * Returns a valid Supabase { access_token, refresh_token } for the oldest
   * Supabase Auth user, created entirely server-side:
   *   1. admin.listUsers() → pick oldest user by email/id
   *   2. admin.generateLink({ type:'magiclink', email }) → get OTP token
   *   3. auth.verifyOtp({ email, token, type:'magiclink' }) → get session
   *
   * The Playwright spec can then inject the tokens into localStorage without
   * navigating through the Supabase verification endpoint.
   */
  app.get("/api/test/admin-session", async (_req: Request, res: Response) => {
    const secret =
      (_req.headers["x-test-secret"] as string) ??
      (_req.query["secret"] as string);
    if (secret !== TEST_SECRET) {
      res.status(403).json({ error: "Forbidden: invalid secret" });
      return;
    }

    try {
      // Step 1 — find the oldest Supabase Auth user (likely the owner)
      const { data: listData, error: listError } =
        await supabase.auth.admin.listUsers({ perPage: 10, page: 1 });

      if (listError || !listData?.users?.length) {
        res.status(404).json({
          error: "No Supabase Auth users found",
          detail: listError?.message,
        });
        return;
      }

      const sortedUsers = listData.users.sort(
        (a, b) =>
          new Date(a.created_at ?? 0).getTime() -
          new Date(b.created_at ?? 0).getTime(),
      );
      const targetUser = sortedUsers[0];
      const email = targetUser.email;

      if (!email) {
        res.status(404).json({ error: "First Supabase user has no email" });
        return;
      }

      console.log(`[TestAdmin] Generating OTP for: ${email}`);

      // Step 2 — generate a magic link OTP (server-side only, not navigated to)
      const { data: linkData, error: linkError } =
        await supabase.auth.admin.generateLink({
          type: "magiclink",
          email,
        });

      if (linkError) {
        console.error("[TestAdmin] generateLink error:", linkError);
        res.status(502).json({
          error: "Failed to generate magic link",
          detail: linkError?.message,
        });
        return;
      }

      const emailOtp: string | undefined =
        (linkData as any)?.properties?.email_otp ??
        (linkData as any)?.data?.properties?.email_otp;

      if (!emailOtp) {
        console.error("[TestAdmin] generateLink returned:", JSON.stringify(linkData).slice(0, 500));
        res.status(502).json({
          error: "generateLink did not return email_otp",
          received: JSON.stringify(linkData).slice(0, 300),
        });
        return;
      }

      console.log(`[TestAdmin] Verifying OTP for ${email}`);

      // Step 3 — verify the OTP server-side to get a real session
      const { data: verifyData, error: verifyError } =
        await supabase.auth.verifyOtp({
          email,
          token: emailOtp,
          type: "magiclink",
        });

      if (verifyError || !verifyData?.session) {
        console.error("[TestAdmin] verifyOtp error:", verifyError);
        res.status(502).json({
          error: "verifyOtp failed",
          detail: verifyError?.message ?? "No session returned",
        });
        return;
      }

      const { access_token, refresh_token, expires_in, token_type } =
        verifyData.session;

      console.log(`[TestAdmin] Session created for ${email} (${targetUser.id})`);

      res.json({
        access_token,
        refresh_token,
        expires_in,
        token_type,
        user_id: targetUser.id,
        email,
      });
    } catch (err: any) {
      console.error("[TestAdmin] Erro ao criar sessão admin:", err);
      res.status(500).json({ error: "Erro interno", detail: String(err?.message ?? err) });
    }
  });

  console.log(
    "✅ [TestAdmin] Routes registered: POST /api/test/admin-chat, DELETE /api/test/admin-chat/clear, GET /api/test/admin-session",
  );
}
