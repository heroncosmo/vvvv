import { Request, Response, NextFunction } from "express";
import { db, withRetry } from "./db";
import { admins, teamMemberSessions, teamMembers, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { supabase } from "./supabaseAuth";

export async function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  try {
    // Verificar se já tem req.user (autenticação Supabase padrão)
    if (req.user) {
      return next();
    }

    // Verificar autenticação de membro da equipe via Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Buscar sessão do membro
      const [session] = await db
        .select()
        .from(teamMemberSessions)
        .where(eq(teamMemberSessions.token, token))
        .limit(1);
      
      if (session && new Date(session.expiresAt) > new Date()) {
        // Sessão válida - buscar membro e owner
        const [member] = await db
          .select()
          .from(teamMembers)
          .where(eq(teamMembers.id, session.memberId))
          .limit(1);
        
        if (member && member.isActive) {
          // Buscar dados do owner
          const [owner] = await db
            .select()
            .from(users)
            .where(eq(users.id, member.ownerId))
            .limit(1);
          
          if (owner) {
            // Simular req.user com dados do owner + marcação de membro
            (req as any).user = {
              id: owner.id, // ID do owner (para que todas as queries funcionem)
              ...owner,
              isMember: true,
              memberData: member,
            };
            return next();
          }
        }
      }
    }

    // Nenhuma autenticação válida encontrada
    return res.status(401).json({ message: "Unauthorized" });
  } catch (error) {
    console.error("Error in isAuthenticated middleware:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function isAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const localAdminEmail =
      process.env.NODE_ENV !== "production"
        ? req.header("x-local-admin-email")?.trim().toLowerCase()
        : undefined;

    if (localAdminEmail) {
      const [localAdmin] = await withRetry(() =>
        db
          .select()
          .from(admins)
          .where(eq(admins.email, localAdminEmail))
          .limit(1)
      );

      if (localAdmin) {
        (req as any).admin = localAdmin;
        if (req.session) {
          (req.session as any).adminId = localAdmin.id;
          (req.session as any).adminRole = localAdmin.role;
        }
        return next();
      }
    }

    // Check for admin session (email/password login)
    const adminId = (req.session as any)?.adminId;
    // debug minimal
    if (process.env.DEBUG_AUTH === '1') {
      console.log('[isAdmin] path', req.path, 'adminId', adminId);
    }
    if (adminId) {
      const [admin] = await withRetry(() => 
        db
          .select()
          .from(admins)
          .where(eq(admins.id, adminId))
          .limit(1)
      );
      
      if (admin) {
        (req as any).admin = admin;
        return next();
      }
    }

    // Check for Supabase Bearer token if req.user not populated
    let userEmail = (req.user as any)?.claims?.email || (req.user as any)?.email;
    
    if (!userEmail) {
      // Try to get email from Supabase token
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const { data: { user }, error } = await supabase.auth.getUser(token);
          if (!error && user?.email) {
            userEmail = user.email;
          }
        } catch (e) {
          // Token inválido, continuar sem email
        }
      }
    }

    if (!userEmail) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const [admin] = await withRetry(() =>
      db
        .select()
        .from(admins)
        .where(eq(admins.email, userEmail))
        .limit(1)
    );

    if (!admin) {
      return res.status(403).json({ message: "Forbidden - Admin access required" });
    }

    (req as any).admin = admin;
    // Sync adminId into session for endpoints that read from req.session.adminId
    // This ensures compatibility when auth was via Bearer token instead of session cookie
    if (req.session && !(req.session as any).adminId) {
      (req.session as any).adminId = admin.id;
    }
    next();
  } catch (error) {
    console.error("Error checking admin status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function verifyAdminPassword(email: string, password: string): Promise<boolean> {
  try {
    const admin = await db
      .select()
      .from(admins)
      .where(eq(admins.email, email))
      .limit(1);

    if (admin.length === 0) {
      return false;
    }

    return await bcrypt.compare(password, admin[0].passwordHash);
  } catch (error) {
    console.error("Error verifying admin password:", error);
    return false;
  }
}
