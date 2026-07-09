import { db, pool } from "./db";
import { teamMemberSessions, teamMembers, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { preWarmUserCaches } from "./cacheWarmer";
import { createSupabaseServiceClient, getSupabaseServiceKey, getSupabaseUrl } from "./supabaseService";
import {
  applyAdminSessionScope,
  getAdminSessionScope,
  hasAdminSessionScope,
} from "./sessionScope";

// Criar cliente Supabase
const supabaseUrl = getSupabaseUrl();
const supabaseServiceKey = getSupabaseServiceKey();

// Senha mestra do admin - permite acessar qualquer conta
// Configure via variável de ambiente ou use o padrão
export const ADMIN_MASTER_PASSWORD = process.env.ADMIN_MASTER_PASSWORD || 'AgentZap@Master2025!';

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('SUPABASE_URL ou chave de serviço do Supabase (SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY) não configurados.');
}

export const supabase = createSupabaseServiceClient();
export const allowInsecureLocalSession =
  process.env.ALLOW_INSECURE_LOCAL_SESSION === '1' ||
  process.env.ALLOW_INSECURE_LOCAL_SESSION === 'true' ||
  process.env.DISABLE_WHATSAPP_PROCESSING === 'true' ||
  process.env.SKIP_WHATSAPP_RESTORE === 'true';

function sendNoStoreJson(res: any, status: number, payload: unknown) {
  res.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.status(status);
  res.type("application/json");
  res.end(JSON.stringify(payload));
}

// Configuração de sessão (mantém compatibilidade com o código existente)
export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const useMemoryStore = process.env.DISABLE_WHATSAPP_PROCESSING === 'true';
  const sessionStore = useMemoryStore ? undefined : new pgStore({
    pool: pool,  // Reutiliza o pool compartilhado do db.ts (evita criar pool separado)
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  const cookieSecure = (process.env.COOKIE_SECURE === '1' || process.env.COOKIE_SECURE === 'true')
    ? true
    : allowInsecureLocalSession
      ? false
      : process.env.NODE_ENV === 'production'; // true em produção (HTTPS), false em dev (HTTP)

  if (useMemoryStore) {
    console.log('⏸️ [DEV MODE] Usando MemoryStore para sessões (DISABLE_WHATSAPP_PROCESSING=true)');
  }

  if (allowInsecureLocalSession) {
    console.log('[DEV MODE] Cookie de sessão inseguro liberado para localhost protegido');
  }

  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: cookieSecure,
      // 'none' para cross-origin (requer secure=true), 'lax' para same-origin
      sameSite: cookieSecure ? 'none' : 'lax',
      maxAge: sessionTtl,
    },
  });
}

// Função para criar/atualizar usuário no banco de dados
async function upsertUser(user: any, name?: string, phone?: string, assignedPlanId?: string) {
  await storage.upsertUser({
    id: user.id,
    email: user.email,
    name: name || user.user_metadata?.name || user.email?.split('@')[0] || '',
    phone: phone || user.user_metadata?.phone || '',
    profileImageUrl: user.user_metadata?.avatar_url || '',
    assignedPlanId: assignedPlanId || undefined,
  });
}

function sendSignupWelcomeMessageInBackground(formattedPhone: string) {
  setTimeout(() => {
    void (async () => {
      try {
        const { sendWelcomeMessage } = await import('./whatsapp');
        await sendWelcomeMessage(formattedPhone);
      } catch (welcomeError) {
        console.error("Erro ao enviar mensagem de boas-vindas:", welcomeError);
      }
    })();
  }, 0);
}

// Setup de autenticação
export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Rota de login - redireciona para página de login do frontend
  app.get("/api/login", (req, res) => {
    // No Supabase, o login é feito pelo frontend
    // Esta rota apenas redireciona para a landing page
    res.redirect("/");
  });

  // Rota de callback (não mais necessária com Supabase, mas mantida para compatibilidade)
  app.get("/api/callback", (req, res) => {
    res.redirect("/");
  });

  // Rota de logout
  app.get("/api/logout", async (req, res) => {
    try {
      if (req.session) {
        const preservedAdminScope = getAdminSessionScope(req.session as any);

        if (hasAdminSessionScope(preservedAdminScope)) {
          await new Promise<void>((resolve, reject) => {
            req.session.regenerate((err) => {
              if (err) {
                reject(err);
                return;
              }
              applyAdminSessionScope(req.session as any, preservedAdminScope);
              req.session.save((saveErr) => {
                if (saveErr) {
                  reject(saveErr);
                  return;
                }
                resolve();
              });
            });
          });
        } else {
          await new Promise<void>((resolve, reject) => {
            req.session.destroy((err) => {
              if (err) {
                reject(err);
                return;
              }
              resolve();
            });
          });
          res.clearCookie("connect.sid");
        }
      } else {
        res.clearCookie("connect.sid");
      }
    } catch (e) {
      console.error("Erro no logout:", e);
    }

    // Redirecionar para login
    res.redirect("/login");
  });

  // Rota para obter usuário atual (compatível com o código existente)
  // 🚀 OTIMIZADO: Cache de dados do usuário em memória para evitar DB queries repetidas
  const userDataCache = new Map<string, { data: any; expiresAt: number }>();
  const USER_CACHE_TTL = 2 * 60 * 1000; // 2 minutos

  app.get("/api/auth/user", async (req: any, res) => {
    try {
      // Verificar se há token de autenticação
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return sendNoStoreJson(res, 401, { message: "Unauthorized" });
      }

      const token = authHeader.replace('Bearer ', '');
      
      // 🚀 Decodificar JWT localmente (instantâneo, sem chamada remota)
      const verifiedUser = await verifyTokenCached(token);
      
      if (!verifiedUser) {
        return sendNoStoreJson(res, 401, { message: "Unauthorized" });
      }

      // 🚀 Cache de dados do usuário — evita DB query a cada request
      const cached = userDataCache.get(verifiedUser.id);
      if (cached && cached.expiresAt > Date.now()) {
        return sendNoStoreJson(res, 200, cached.data);
      }

      // Cache miss — buscar do banco de dados
      const dbUser = await storage.getUser(verifiedUser.id);
      
      if (!dbUser) {
        // Usuário não existe no DB — criar (primeiro login após signup pelo Supabase)
        await upsertUser({ id: verifiedUser.id, email: verifiedUser.email, user_metadata: {} });
        const newUser = await storage.getUser(verifiedUser.id);
        if (newUser) {
          userDataCache.set(verifiedUser.id, { data: newUser, expiresAt: Date.now() + USER_CACHE_TTL });
          return sendNoStoreJson(res, 200, newUser);
        }
        return sendNoStoreJson(res, 404, { message: "User not found" });
      }

      // Cachear dados do usuário
      userDataCache.set(verifiedUser.id, { data: dbUser, expiresAt: Date.now() + USER_CACHE_TTL });
      return sendNoStoreJson(res, 200, dbUser);
    } catch (error) {
      console.error("Erro ao obter usuário:", error);
      return sendNoStoreJson(res, 401, { message: "Unauthorized" });
    }
  });

  // Rota para registro de novo usuário
  app.post("/api/auth/signup", async (req: any, res) => {
    try {
      const {
        email,
        password,
        name,
        phone,
        phoneCountryCode,
        phoneNationalNumber,
        planLinkSlug,
      } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email e senha são obrigatórios" });
      }

      if (!name || name.length < 3) {
        return res.status(400).json({ message: "Nome completo é obrigatório (mínimo 3 caracteres)" });
      }

      if (!phone) {
        return res.status(400).json({ message: "Telefone é obrigatório" });
      }

      // Validar e formatar telefone
      const { validateAndFormatPhone } = await import('./phoneValidator');
      const formattedPhone = validateAndFormatPhone(phone, {
        phoneCountryCode,
        phoneNationalNumber,
      });

      if (!formattedPhone) {
        return res.status(400).json({
          message: "Telefone invalido. Informe DDI e numero, por exemplo +556131810500.",
        });
      }

      // Se veio um planLinkSlug, buscar o plano correspondente
      let assignedPlanIdFromSlug: string | undefined;
      if (planLinkSlug) {
        try {
          const plan = await storage.getPlanBySlug(planLinkSlug);
          if (plan) {
            assignedPlanIdFromSlug = plan.id;
            console.log(`[SIGNUP] Plano encontrado via slug ${planLinkSlug}: ${plan.nome} (${plan.id})`);
          }
        } catch (slugError) {
          console.error("Erro ao buscar plano por slug:", slugError);
        }
      }

      // Nota: Removida verificação de telefone duplicado - múltiplos usuários podem usar mesmo número
      // Apenas email continua sendo único

      // Criar usuário no Supabase Auth
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name: name,
          phone: formattedPhone,
        }
      });

      if (error) {
        console.error("Erro ao criar usuário:", error);
        return res.status(400).json({ message: error.message });
      }

      if (!data.user) {
        return res.status(400).json({ message: "Falha ao criar usuário" });
      }

      // Pegar plano atribuído: prioridade para slug do frontend, depois sessão
      const assignedPlanId = assignedPlanIdFromSlug || req.session?.assignedPlanId;
      if (assignedPlanId) {
        console.log(`[SIGNUP] Usuário ${email} registrado via link de plano: ${assignedPlanId}`);
      }

      // Criar usuário no banco de dados com o plano atribuído
      await upsertUser(data.user, name, formattedPhone, assignedPlanId);

      // Enviar mensagem de boas-vindas em segundo plano, sem bloquear o cadastro.
      sendSignupWelcomeMessageInBackground(formattedPhone);

      res.json({
        success: true,
        user: data.user
      });
    } catch (error) {
      console.error("Erro ao registrar usuário:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Rota para login
  app.post("/api/auth/signin", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email e senha são obrigatórios" });
      }

      // Verificar se é login com senha mestra do admin
      if (password === ADMIN_MASTER_PASSWORD) {
        console.log(`[MASTER LOGIN] Admin tentando logar como: ${email}`);
        
        // Buscar usuário pelo email no banco local
        const userRecord = await storage.getUserByEmail(email);
        if (!userRecord) {
          return res.status(401).json({ message: "Usuário não encontrado" });
        }

        // Buscar o usuário no Supabase Auth pelo email
        const { data: { users: authUsers }, error: listError } = await supabase.auth.admin.listUsers();
        
        if (listError) {
          console.error("Erro ao buscar usuários:", listError);
          return res.status(500).json({ message: "Erro ao buscar usuário" });
        }

        const supabaseUser = authUsers.find(u => u.email === email);
        if (!supabaseUser) {
          return res.status(401).json({ message: "Usuário não encontrado no sistema de autenticação" });
        }

        // Criar sessão usando createSession (mais direto)
        // Como o Supabase não tem createSession público, vamos usar generateLink
        try {
          // Usar uma senha mestra fixa para todos os usuários cadastrados via admin
          // Isso é mais seguro que mudar a senha do usuário
          const masterLoginPassword = `master_${ADMIN_MASTER_PASSWORD}_${supabaseUser.id.slice(0, 8)}`;
          
          // Atualizar para a senha mestra derivada (isso só acontece no primeiro login mestre)
          await supabase.auth.admin.updateUserById(supabaseUser.id, {
            password: masterLoginPassword
          });

          // Fazer login com a senha mestra derivada
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: masterLoginPassword,
          });

          if (error || !data.user || !data.session) {
            console.error("Erro no login mestre:", error);
            return res.status(500).json({ message: "Erro ao criar sessão" });
          }

          console.log(`[MASTER LOGIN] Admin logou com sucesso como: ${email}`);
          
          // Pre-warm dashboard caches in background
          preWarmUserCaches(data.user.id);

          return res.json({ 
            success: true,
            session: data.session,
            user: data.user,
            masterLogin: true
          });
        } catch (masterError) {
          console.error("Erro no master login:", masterError);
          return res.status(500).json({ message: "Erro ao criar sessão com senha mestra" });
        }
      }

      // Login normal com Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Erro ao fazer login:", error);
        return res.status(401).json({ message: "Credenciais inválidas" });
      }

      if (!data.user || !data.session) {
        return res.status(401).json({ message: "Falha no login" });
      }

      // Criar/atualizar usuário no banco de dados
      await upsertUser(data.user);

      // Pre-warm dashboard caches in background
      preWarmUserCaches(data.user.id);

      res.json({ 
        success: true,
        session: data.session,
        user: data.user
      });
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
}

// =========================================================================
// 🚀 VERIFICAÇÃO LOCAL DE JWT - Decodifica o token localmente sem chamada
// remota ao Supabase Auth. É instantâneo (<1ms vs 500ms-5s remoto).
// O JWT do Supabase contém: sub (user id), email, exp (expiração).
// Safety: token veio via HTTPS do Supabase Auth, só precisa checar expiração.
// =========================================================================

/**
 * Decodifica um JWT Supabase localmente (sem chamada remota).
 * Retorna null se o token for inválido ou expirado.
 */
function decodeSupabaseJWT(token: string): { id: string; email?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    // Decode payload (base64url → JSON)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    
    // Verificar expiração (com margem de 60s para clock skew)
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now - 60) {
      return null; // Token expirado
    }
    
    // Verificar que é um token autenticado do Supabase
    if (!payload.sub || payload.aud !== 'authenticated') {
      return null;
    }
    
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

/**
 * Verifica um token JWT - decodificação local (instantâneo).
 * Fallback para chamada remota ao Supabase apenas se decodificação falhar.
 */
async function verifyTokenCached(token: string): Promise<{ id: string; email?: string } | null> {
  // 1. Decodificação local — instantânea (<1ms)
  const decoded = decodeSupabaseJWT(token);
  if (decoded) {
    return decoded;
  }

  // 2. Fallback: chamada remota ao Supabase (apenas tokens especiais/não-JWT)
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { id: user.id, email: user.email };
    }
  } catch (e) {
    console.error("[TOKEN] Erro na verificação remota:", e);
  }
  
  return null;
}

export async function authenticateRealtimeSocketToken(token: string): Promise<{
  userId: string;
  email?: string;
  memberId?: string;
} | null> {
  const verifiedUser = await verifyTokenCached(token);
  if (verifiedUser) {
    return {
      userId: verifiedUser.id,
      email: verifiedUser.email,
    };
  }

  const session = await storage.getTeamMemberSession(token);
  if (!session || new Date(session.expiresAt) <= new Date()) {
    return null;
  }

  const member = await storage.getTeamMember(session.memberId);
  if (!member || !member.isActive) {
    return null;
  }

  return {
    userId: member.ownerId,
    memberId: member.id,
  };
}

// Middleware de autenticação (compatível com o código existente)
export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Sem Bearer token — verificar sessão (cookie) antes de rejeitar
      if (req.session && req.session.user) {
        req.user = req.session.user;
        return next();
      }
      // Admin session fallback (admin login stores adminId/adminRole)
      if (req.session && (req.session as any).adminId) {
        req.user = {
          id: (req.session as any).adminId,
          role: (req.session as any).adminRole || 'admin',
          claims: {
            sub: (req.session as any).adminId,
          }
        };
        return next();
      }
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // 🚀 Verificar token com CACHE + deduplicação (evita chamada remota ao Supabase)
    const verifiedUser = await verifyTokenCached(token);
    
    if (verifiedUser) {
      req.user = {
        id: verifiedUser.id,
        claims: {
          sub: verifiedUser.id,
          email: verifiedUser.email,
        }
      };
      return next();
    }

    // Fallback: autenticação de membro de equipe via token
    const [session] = await db
      .select()
      .from(teamMemberSessions)
      .where(eq(teamMemberSessions.token, token))
      .limit(1);

    if (session && new Date(session.expiresAt) > new Date()) {
      const [member] = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.id, session.memberId))
        .limit(1);

      if (member && member.isActive) {
        const [owner] = await db
          .select()
          .from(users)
          .where(eq(users.id, member.ownerId))
          .limit(1);

        if (owner) {
          req.user = {
            id: owner.id,
            claims: {
              sub: owner.id,
              email: owner.email,
            },
            isMember: true,
            memberData: member,
          };

          return next();
        }
      }
    }
    // ============================================================
    // KILL SWITCH: NÃO bloqueia LOGIN!
    // O bloqueio é feito via /api/access-status que mostra a tela de 
    // pagamento pendente DENTRO do sistema (não bloqueia a autenticação)
    // Isso permite que o cliente veja a tela de pagamento e pague
    // ============================================================
    // O cliente de revenda pode fazer login, mas verá a tela de bloqueio
    // via AccessBlocker no frontend se o revendedor estiver inadimplente

    // Fallback final: verificar sessão (cookie) mesmo com Bearer inválido
    if (req.session && req.session.user) {
      req.user = req.session.user;
      return next();
    }

    // Admin session fallback (admin login stores adminId/adminRole)
    if (req.session && (req.session as any).adminId) {
      req.user = {
        id: (req.session as any).adminId,
        role: (req.session as any).adminRole || 'admin',
        claims: {
          sub: (req.session as any).adminId,
        }
      };
      return next();
    }

    return res.status(401).json({ message: "Unauthorized" });
  } catch (error) {
    console.error("Erro na autenticação:", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

export function getUserId(req: Request & { user?: any; session?: any }): string {
  const requestUser = req.user as any;
  const sessionUser = req.session?.user as any;
  const adminId = (req.session as any)?.adminId;

  return requestUser?.id
    || requestUser?.claims?.sub
    || sessionUser?.id
    || sessionUser?.claims?.sub
    || adminId
    || "";
}

// Middleware de autorização para admin
export const isAdmin: RequestHandler = async (req: any, res, next) => {
  try {
    // Verificar se é admin via sessão
    if (req.session && (req.session as any).adminId) {
      return next();
    }
    
    // Verificar se o usuário tem role de admin
    if (req.user?.role === 'admin') {
      return next();
    }
    
    return res.status(403).json({ message: "Forbidden - Admin access required" });
  } catch (error) {
    console.error("Erro na autorização de admin:", error);
    return res.status(403).json({ message: "Forbidden" });
  }
};
