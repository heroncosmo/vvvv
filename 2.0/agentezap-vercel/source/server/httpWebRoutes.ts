import { createServer, type Server } from "http";
import type { Express, Response } from "express";

const OWNER_ADMIN_EMAIL = "rodrigo4@gmail.com";

function setNoStore(res: Response) {
  res.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

function isOwnerAdminEmail(email?: string | null): boolean {
  return String(email || "").trim().toLowerCase() === OWNER_ADMIN_EMAIL;
}

export async function registerWebOnlyRoutes(app: Express): Promise<Server> {
  const [
    { pool },
    { registerAutologinRoutes },
    supabaseAuthModule,
    { storage },
  ] = await Promise.all([
    import("./db"),
    import("./routes_autologin"),
    import("./supabaseAuth"),
    import("./storage"),
  ]);

  const { getUserId, isAuthenticated, setupAuth } = supabaseAuthModule as any;

  await setupAuth(app);
  registerAutologinRoutes(app);

  app.post("/api/admin/login", async (req: any, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const bcrypt = await import("bcryptjs");
      const validPassword = await bcrypt.compare(password, admin.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.regenerate((err: any) => {
        if (err) {
          console.error("Error regenerating session:", err);
          return res.status(500).json({ message: "Login failed" });
        }

        (req.session as any).adminId = admin.id;
        (req.session as any).adminRole = admin.role;
        (req.session as any).adminEmail = admin.email;

        req.session.save((saveErr: any) => {
          if (saveErr) {
            console.error("Error saving session:", saveErr);
            return res.status(500).json({ message: "Login failed" });
          }

          return res.json({
            success: true,
            admin: {
              id: admin.id,
              email: admin.email,
              role: admin.role,
            },
          });
        });
      });
    } catch (error) {
      console.error("Error in admin login:", error);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/admin/session", async (req: any, res) => {
    setNoStore(res);

    const adminId = req.session?.adminId;
    const adminRole = req.session?.adminRole;
    if (!adminId || !adminRole) {
      return res.status(200).json({ authenticated: false, isAdmin: false });
    }

    let adminEmail: string | null = null;
    try {
      const adminResult = await pool.query("SELECT email FROM admins WHERE id = $1 LIMIT 1", [adminId]);
      adminEmail = adminResult.rows[0]?.email || null;
    } catch (error) {
      console.warn("[Admin Session] Falha ao carregar email do admin:", error);
    }

    return res.status(200).json({
      authenticated: true,
      isAdmin: true,
      adminId,
      role: adminRole,
      email: adminEmail,
      isOwner: isOwnerAdminEmail(adminEmail),
    });
  });

  app.get("/api/team-members/session", async (req: any, res) => {
    try {
      setNoStore(res);

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ authenticated: false });
      }

      const token = authHeader.substring(7);
      const session = await storage.getTeamMemberSession(token);
      if (!session || new Date(session.expiresAt) < new Date()) {
        return res.status(401).json({ authenticated: false });
      }

      const member = await storage.getTeamMember(session.memberId);
      if (!member || !member.isActive) {
        return res.status(401).json({ authenticated: false });
      }

      const owner = await storage.getUser(member.ownerId);
      const { passwordHash: _, ...safeMember } = member as any;

      return res.status(200).json({
        authenticated: true,
        member: safeMember,
        owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
      });
    } catch (error) {
      console.error("Error checking team member session:", error);
      return res.status(500).json({ authenticated: false });
    }
  });

  app.post("/api/team-members/logout", async (req: any, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        await storage.deleteTeamMemberSession(token);
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("Error logging out team member:", error);
      return res.status(500).json({ message: "Erro ao fazer logout" });
    }
  });

  app.get("/api/user/business-type", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      return res.json({ businessType: (user as any).businessType || null });
    } catch (error) {
      console.error("Error getting business type:", error);
      return res.status(500).json({ message: "Failed to get business type" });
    }
  });

  app.put("/api/user/business-type", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { businessType } = req.body;
      if (!businessType) {
        return res.status(400).json({ message: "businessType é obrigatório" });
      }

      await storage.updateUser(userId, { businessType } as any);
      return res.json({ success: true, businessType });
    } catch (error) {
      console.error("Error updating business type:", error);
      return res.status(500).json({ message: "Failed to update business type" });
    }
  });

  return createServer(app);
}
