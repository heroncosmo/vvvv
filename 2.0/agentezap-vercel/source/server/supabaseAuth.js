"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmin = exports.isAuthenticated = exports.supabase = exports.ADMIN_MASTER_PASSWORD = void 0;
exports.getSession = getSession;
exports.setupAuth = setupAuth;
var db_1 = require("./db");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var express_session_1 = require("express-session");
var connect_pg_simple_1 = require("connect-pg-simple");
var storage_1 = require("./storage");
var cacheWarmer_1 = require("./cacheWarmer");
var supabaseService_1 = require("./supabaseService");
// Criar cliente Supabase
var supabaseUrl = (0, supabaseService_1.getSupabaseUrl)();
var supabaseServiceKey = (0, supabaseService_1.getSupabaseServiceKey)();
// Senha mestra do admin - permite acessar qualquer conta
// Configure via variável de ambiente ou use o padrão
exports.ADMIN_MASTER_PASSWORD = process.env.ADMIN_MASTER_PASSWORD || 'AgentZap@Master2025!';
if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('SUPABASE_URL ou chave de serviço do Supabase (SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY) não configurados.');
}
exports.supabase = (0, supabaseService_1.createSupabaseServiceClient)();
// Configuração de sessão (mantém compatibilidade com o código existente)
function getSession() {
    var sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
    var pgStore = (0, connect_pg_simple_1.default)(express_session_1.default);
    var useMemoryStore = process.env.DISABLE_WHATSAPP_PROCESSING === 'true';
    var sessionStore = useMemoryStore ? undefined : new pgStore({
        pool: db_1.pool, // Reutiliza o pool compartilhado do db.ts (evita criar pool separado)
        createTableIfMissing: false,
        ttl: sessionTtl,
        tableName: "sessions",
    });
    var cookieSecure = (process.env.COOKIE_SECURE === '1' || process.env.COOKIE_SECURE === 'true')
        ? true
        : process.env.NODE_ENV === 'production'; // true em produção (HTTPS), false em dev (HTTP)
    if (useMemoryStore) {
        console.log('⏸️ [DEV MODE] Usando MemoryStore para sessões (DISABLE_WHATSAPP_PROCESSING=true)');
    }
    return (0, express_session_1.default)({
        secret: process.env.SESSION_SECRET,
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
function upsertUser(user, name, phone, assignedPlanId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, storage_1.storage.upsertUser({
                        id: user.id,
                        email: user.email,
                        name: name || ((_a = user.user_metadata) === null || _a === void 0 ? void 0 : _a.name) || ((_b = user.email) === null || _b === void 0 ? void 0 : _b.split('@')[0]) || '',
                        phone: phone || ((_c = user.user_metadata) === null || _c === void 0 ? void 0 : _c.phone) || '',
                        profileImageUrl: ((_d = user.user_metadata) === null || _d === void 0 ? void 0 : _d.avatar_url) || '',
                        assignedPlanId: assignedPlanId || undefined,
                    })];
                case 1:
                    _e.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// Setup de autenticação
function setupAuth(app) {
    return __awaiter(this, void 0, void 0, function () {
        var userDataCache, USER_CACHE_TTL;
        var _this = this;
        return __generator(this, function (_a) {
            app.set("trust proxy", 1);
            app.use(getSession());
            // Rota de login - redireciona para página de login do frontend
            app.get("/api/login", function (req, res) {
                // No Supabase, o login é feito pelo frontend
                // Esta rota apenas redireciona para a landing page
                res.redirect("/");
            });
            // Rota de callback (não mais necessária com Supabase, mas mantida para compatibilidade)
            app.get("/api/callback", function (req, res) {
                res.redirect("/");
            });
            // Rota de logout
            app.get("/api/logout", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    try {
                        // Limpar sessão do servidor (se existir)
                        if (req.session) {
                            req.session.destroy(function (err) {
                                if (err) {
                                    console.error("Erro ao destruir sessão:", err);
                                }
                            });
                        }
                        // Limpar cookie de sessão padrão do express-session
                        res.clearCookie("connect.sid");
                    }
                    catch (e) {
                        console.error("Erro no logout:", e);
                    }
                    // Redirecionar para login
                    res.redirect("/login");
                    return [2 /*return*/];
                });
            }); });
            userDataCache = new Map();
            USER_CACHE_TTL = 2 * 60 * 1000;
            app.get("/api/auth/user", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var authHeader, token, verifiedUser, cached, dbUser, newUser, error_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 6, , 7]);
                            authHeader = req.headers.authorization;
                            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                                return [2 /*return*/, res.status(401).json({ message: "Unauthorized" })];
                            }
                            token = authHeader.replace('Bearer ', '');
                            return [4 /*yield*/, verifyTokenCached(token)];
                        case 1:
                            verifiedUser = _a.sent();
                            if (!verifiedUser) {
                                return [2 /*return*/, res.status(401).json({ message: "Unauthorized" })];
                            }
                            cached = userDataCache.get(verifiedUser.id);
                            if (cached && cached.expiresAt > Date.now()) {
                                return [2 /*return*/, res.json(cached.data)];
                            }
                            return [4 /*yield*/, storage_1.storage.getUser(verifiedUser.id)];
                        case 2:
                            dbUser = _a.sent();
                            if (!!dbUser) return [3 /*break*/, 5];
                            // Usuário não existe no DB — criar (primeiro login após signup pelo Supabase)
                            return [4 /*yield*/, upsertUser({ id: verifiedUser.id, email: verifiedUser.email, user_metadata: {} })];
                        case 3:
                            // Usuário não existe no DB — criar (primeiro login após signup pelo Supabase)
                            _a.sent();
                            return [4 /*yield*/, storage_1.storage.getUser(verifiedUser.id)];
                        case 4:
                            newUser = _a.sent();
                            if (newUser) {
                                userDataCache.set(verifiedUser.id, { data: newUser, expiresAt: Date.now() + USER_CACHE_TTL });
                                return [2 /*return*/, res.json(newUser)];
                            }
                            return [2 /*return*/, res.status(404).json({ message: "User not found" })];
                        case 5:
                            // Cachear dados do usuário
                            userDataCache.set(verifiedUser.id, { data: dbUser, expiresAt: Date.now() + USER_CACHE_TTL });
                            res.json(dbUser);
                            return [3 /*break*/, 7];
                        case 6:
                            error_1 = _a.sent();
                            console.error("Erro ao obter usuário:", error_1);
                            res.status(401).json({ message: "Unauthorized" });
                            return [3 /*break*/, 7];
                        case 7: return [2 /*return*/];
                    }
                });
            }); });
            // Rota para registro de novo usuário
            app.post("/api/auth/signup", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, email, password, name_1, phone, planLinkSlug, validateAndFormatPhone, formattedPhone, assignedPlanIdFromSlug, plan, slugError_1, _b, data, error, assignedPlanId, sendWelcomeMessage, welcomeError_1, error_2;
                var _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            _d.trys.push([0, 13, , 14]);
                            _a = req.body, email = _a.email, password = _a.password, name_1 = _a.name, phone = _a.phone, planLinkSlug = _a.planLinkSlug;
                            if (!email || !password) {
                                return [2 /*return*/, res.status(400).json({ message: "Email e senha são obrigatórios" })];
                            }
                            if (!name_1 || name_1.length < 3) {
                                return [2 /*return*/, res.status(400).json({ message: "Nome completo é obrigatório (mínimo 3 caracteres)" })];
                            }
                            if (!phone) {
                                return [2 /*return*/, res.status(400).json({ message: "Telefone é obrigatório" })];
                            }
                            return [4 /*yield*/, Promise.resolve().then(function () { return require('./phoneValidator'); })];
                        case 1:
                            validateAndFormatPhone = (_d.sent()).validateAndFormatPhone;
                            formattedPhone = validateAndFormatPhone(phone);
                            if (!formattedPhone) {
                                return [2 /*return*/, res.status(400).json({ message: "Telefone inválido. Use formato: 11999999999 ou +5511999999999" })];
                            }
                            assignedPlanIdFromSlug = void 0;
                            if (!planLinkSlug) return [3 /*break*/, 5];
                            _d.label = 2;
                        case 2:
                            _d.trys.push([2, 4, , 5]);
                            return [4 /*yield*/, storage_1.storage.getPlanBySlug(planLinkSlug)];
                        case 3:
                            plan = _d.sent();
                            if (plan) {
                                assignedPlanIdFromSlug = plan.id;
                                console.log("[SIGNUP] Plano encontrado via slug ".concat(planLinkSlug, ": ").concat(plan.nome, " (").concat(plan.id, ")"));
                            }
                            return [3 /*break*/, 5];
                        case 4:
                            slugError_1 = _d.sent();
                            console.error("Erro ao buscar plano por slug:", slugError_1);
                            return [3 /*break*/, 5];
                        case 5: return [4 /*yield*/, exports.supabase.auth.admin.createUser({
                                email: email,
                                password: password,
                                email_confirm: true,
                                user_metadata: {
                                    name: name_1,
                                    phone: formattedPhone,
                                }
                            })];
                        case 6:
                            _b = _d.sent(), data = _b.data, error = _b.error;
                            if (error) {
                                console.error("Erro ao criar usuário:", error);
                                return [2 /*return*/, res.status(400).json({ message: error.message })];
                            }
                            if (!data.user) {
                                return [2 /*return*/, res.status(400).json({ message: "Falha ao criar usuário" })];
                            }
                            assignedPlanId = assignedPlanIdFromSlug || ((_c = req.session) === null || _c === void 0 ? void 0 : _c.assignedPlanId);
                            if (assignedPlanId) {
                                console.log("[SIGNUP] Usu\u00E1rio ".concat(email, " registrado via link de plano: ").concat(assignedPlanId));
                            }
                            // Criar usuário no banco de dados com o plano atribuído
                            return [4 /*yield*/, upsertUser(data.user, name_1, formattedPhone, assignedPlanId)];
                        case 7:
                            // Criar usuário no banco de dados com o plano atribuído
                            _d.sent();
                            _d.label = 8;
                        case 8:
                            _d.trys.push([8, 11, , 12]);
                            return [4 /*yield*/, Promise.resolve().then(function () { return require('./whatsapp'); })];
                        case 9:
                            sendWelcomeMessage = (_d.sent()).sendWelcomeMessage;
                            return [4 /*yield*/, sendWelcomeMessage(formattedPhone)];
                        case 10:
                            _d.sent();
                            return [3 /*break*/, 12];
                        case 11:
                            welcomeError_1 = _d.sent();
                            console.error("Erro ao enviar mensagem de boas-vindas:", welcomeError_1);
                            return [3 /*break*/, 12];
                        case 12:
                            res.json({
                                success: true,
                                user: data.user
                            });
                            return [3 /*break*/, 14];
                        case 13:
                            error_2 = _d.sent();
                            console.error("Erro ao registrar usuário:", error_2);
                            res.status(500).json({ message: "Erro interno do servidor" });
                            return [3 /*break*/, 14];
                        case 14: return [2 /*return*/];
                    }
                });
            }); });
            // Rota para login
            app.post("/api/auth/signin", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, email_1, password, userRecord, _b, authUsers, listError, supabaseUser, masterLoginPassword, _c, data_1, error_4, masterError_1, _d, data, error, error_3;
                return __generator(this, function (_e) {
                    switch (_e.label) {
                        case 0:
                            _e.trys.push([0, 10, , 11]);
                            _a = req.body, email_1 = _a.email, password = _a.password;
                            if (!email_1 || !password) {
                                return [2 /*return*/, res.status(400).json({ message: "Email e senha são obrigatórios" })];
                            }
                            if (!(password === exports.ADMIN_MASTER_PASSWORD)) return [3 /*break*/, 7];
                            console.log("[MASTER LOGIN] Admin tentando logar como: ".concat(email_1));
                            return [4 /*yield*/, storage_1.storage.getUserByEmail(email_1)];
                        case 1:
                            userRecord = _e.sent();
                            if (!userRecord) {
                                return [2 /*return*/, res.status(401).json({ message: "Usuário não encontrado" })];
                            }
                            return [4 /*yield*/, exports.supabase.auth.admin.listUsers()];
                        case 2:
                            _b = _e.sent(), authUsers = _b.data.users, listError = _b.error;
                            if (listError) {
                                console.error("Erro ao buscar usuários:", listError);
                                return [2 /*return*/, res.status(500).json({ message: "Erro ao buscar usuário" })];
                            }
                            supabaseUser = authUsers.find(function (u) { return u.email === email_1; });
                            if (!supabaseUser) {
                                return [2 /*return*/, res.status(401).json({ message: "Usuário não encontrado no sistema de autenticação" })];
                            }
                            _e.label = 3;
                        case 3:
                            _e.trys.push([3, 6, , 7]);
                            masterLoginPassword = "master_".concat(exports.ADMIN_MASTER_PASSWORD, "_").concat(supabaseUser.id.slice(0, 8));
                            // Atualizar para a senha mestra derivada (isso só acontece no primeiro login mestre)
                            return [4 /*yield*/, exports.supabase.auth.admin.updateUserById(supabaseUser.id, {
                                    password: masterLoginPassword
                                })];
                        case 4:
                            // Atualizar para a senha mestra derivada (isso só acontece no primeiro login mestre)
                            _e.sent();
                            return [4 /*yield*/, exports.supabase.auth.signInWithPassword({
                                    email: email_1,
                                    password: masterLoginPassword,
                                })];
                        case 5:
                            _c = _e.sent(), data_1 = _c.data, error_4 = _c.error;
                            if (error_4 || !data_1.user || !data_1.session) {
                                console.error("Erro no login mestre:", error_4);
                                return [2 /*return*/, res.status(500).json({ message: "Erro ao criar sessão" })];
                            }
                            console.log("[MASTER LOGIN] Admin logou com sucesso como: ".concat(email_1));
                            // Pre-warm dashboard caches in background
                            (0, cacheWarmer_1.preWarmUserCaches)(data_1.user.id);
                            return [2 /*return*/, res.json({
                                    success: true,
                                    session: data_1.session,
                                    user: data_1.user,
                                    masterLogin: true
                                })];
                        case 6:
                            masterError_1 = _e.sent();
                            console.error("Erro no master login:", masterError_1);
                            return [2 /*return*/, res.status(500).json({ message: "Erro ao criar sessão com senha mestra" })];
                        case 7: return [4 /*yield*/, exports.supabase.auth.signInWithPassword({
                                email: email_1,
                                password: password,
                            })];
                        case 8:
                            _d = _e.sent(), data = _d.data, error = _d.error;
                            if (error) {
                                console.error("Erro ao fazer login:", error);
                                return [2 /*return*/, res.status(401).json({ message: "Credenciais inválidas" })];
                            }
                            if (!data.user || !data.session) {
                                return [2 /*return*/, res.status(401).json({ message: "Falha no login" })];
                            }
                            // Criar/atualizar usuário no banco de dados
                            return [4 /*yield*/, upsertUser(data.user)];
                        case 9:
                            // Criar/atualizar usuário no banco de dados
                            _e.sent();
                            // Pre-warm dashboard caches in background
                            (0, cacheWarmer_1.preWarmUserCaches)(data.user.id);
                            res.json({
                                success: true,
                                session: data.session,
                                user: data.user
                            });
                            return [3 /*break*/, 11];
                        case 10:
                            error_3 = _e.sent();
                            console.error("Erro ao fazer login:", error_3);
                            res.status(500).json({ message: "Erro interno do servidor" });
                            return [3 /*break*/, 11];
                        case 11: return [2 /*return*/];
                    }
                });
            }); });
            return [2 /*return*/];
        });
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
function decodeSupabaseJWT(token) {
    try {
        var parts = token.split('.');
        if (parts.length !== 3)
            return null;
        // Decode payload (base64url → JSON)
        var payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        // Verificar expiração (com margem de 60s para clock skew)
        var now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now - 60) {
            return null; // Token expirado
        }
        // Verificar que é um token autenticado do Supabase
        if (!payload.sub || payload.aud !== 'authenticated') {
            return null;
        }
        return { id: payload.sub, email: payload.email };
    }
    catch (_a) {
        return null;
    }
}
/**
 * Verifica um token JWT - decodificação local (instantâneo).
 * Fallback para chamada remota ao Supabase apenas se decodificação falhar.
 */
function verifyTokenCached(token) {
    return __awaiter(this, void 0, void 0, function () {
        var decoded, _a, user, error, e_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    decoded = decodeSupabaseJWT(token);
                    if (decoded) {
                        return [2 /*return*/, decoded];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, exports.supabase.auth.getUser(token)];
                case 2:
                    _a = _b.sent(), user = _a.data.user, error = _a.error;
                    if (!error && user) {
                        return [2 /*return*/, { id: user.id, email: user.email }];
                    }
                    return [3 /*break*/, 4];
                case 3:
                    e_1 = _b.sent();
                    console.error("[TOKEN] Erro na verificação remota:", e_1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, null];
            }
        });
    });
}
// Middleware de autenticação (compatível com o código existente)
var isAuthenticated = function (req, res, next) { return __awaiter(void 0, void 0, void 0, function () {
    var authHeader, token, verifiedUser, session_1, member, owner, error_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 6, , 7]);
                authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    // Sem Bearer token — verificar sessão (cookie) antes de rejeitar
                    if (req.session && req.session.user) {
                        req.user = req.session.user;
                        return [2 /*return*/, next()];
                    }
                    // Admin session fallback (admin login stores adminId/adminRole)
                    if (req.session && req.session.adminId) {
                        req.user = {
                            id: req.session.adminId,
                            role: req.session.adminRole || 'admin',
                            claims: {
                                sub: req.session.adminId,
                            }
                        };
                        return [2 /*return*/, next()];
                    }
                    return [2 /*return*/, res.status(401).json({ message: "Unauthorized" })];
                }
                token = authHeader.replace('Bearer ', '');
                return [4 /*yield*/, verifyTokenCached(token)];
            case 1:
                verifiedUser = _a.sent();
                if (verifiedUser) {
                    req.user = {
                        id: verifiedUser.id,
                        claims: {
                            sub: verifiedUser.id,
                            email: verifiedUser.email,
                        }
                    };
                    return [2 /*return*/, next()];
                }
                return [4 /*yield*/, db_1.db
                        .select()
                        .from(schema_1.teamMemberSessions)
                        .where((0, drizzle_orm_1.eq)(schema_1.teamMemberSessions.token, token))
                        .limit(1)];
            case 2:
                session_1 = (_a.sent())[0];
                if (!(session_1 && new Date(session_1.expiresAt) > new Date())) return [3 /*break*/, 5];
                return [4 /*yield*/, db_1.db
                        .select()
                        .from(schema_1.teamMembers)
                        .where((0, drizzle_orm_1.eq)(schema_1.teamMembers.id, session_1.memberId))
                        .limit(1)];
            case 3:
                member = (_a.sent())[0];
                if (!(member && member.isActive)) return [3 /*break*/, 5];
                return [4 /*yield*/, db_1.db
                        .select()
                        .from(schema_1.users)
                        .where((0, drizzle_orm_1.eq)(schema_1.users.id, member.ownerId))
                        .limit(1)];
            case 4:
                owner = (_a.sent())[0];
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
                    return [2 /*return*/, next()];
                }
                _a.label = 5;
            case 5:
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
                    return [2 /*return*/, next()];
                }
                // Admin session fallback (admin login stores adminId/adminRole)
                if (req.session && req.session.adminId) {
                    req.user = {
                        id: req.session.adminId,
                        role: req.session.adminRole || 'admin',
                        claims: {
                            sub: req.session.adminId,
                        }
                    };
                    return [2 /*return*/, next()];
                }
                return [2 /*return*/, res.status(401).json({ message: "Unauthorized" })];
            case 6:
                error_5 = _a.sent();
                console.error("Erro na autenticação:", error_5);
                return [2 /*return*/, res.status(401).json({ message: "Unauthorized" })];
            case 7: return [2 /*return*/];
        }
    });
}); };
exports.isAuthenticated = isAuthenticated;
// Middleware de autorização para admin
var isAdmin = function (req, res, next) { return __awaiter(void 0, void 0, void 0, function () {
    var _a;
    return __generator(this, function (_b) {
        try {
            // Verificar se é admin via sessão
            if (req.session && req.session.adminId) {
                return [2 /*return*/, next()];
            }
            // Verificar se o usuário tem role de admin
            if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === 'admin') {
                return [2 /*return*/, next()];
            }
            return [2 /*return*/, res.status(403).json({ message: "Forbidden - Admin access required" })];
        }
        catch (error) {
            console.error("Erro na autorização de admin:", error);
            return [2 /*return*/, res.status(403).json({ message: "Forbidden" })];
        }
        return [2 /*return*/];
    });
}); };
exports.isAdmin = isAdmin;
