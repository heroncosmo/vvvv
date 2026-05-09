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
exports.registerAutologinRoutes = registerAutologinRoutes;
var db_1 = require("./db");
var supabaseAuth_1 = require("./supabaseAuth");
var supabaseService_1 = require("./supabaseService");
// Read Supabase credentials from env (same resolution order as supabaseAuth.ts)
var supabaseUrl = (0, supabaseService_1.getSupabaseUrl)();
var supabaseServiceKey = (0, supabaseService_1.getSupabaseServiceKey)();
function buildTemporaryAuthPassword() {
    return "AZ-".concat(Math.random().toString(36).slice(2, 10), "!");
}
function registerAutologinRoutes(app) {
    var _this = this;
    app.get('/api/autologin/:token', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var token, rows, userId, redirectTo, e_1, e_2, userEmail, authUserResult, appUserResult, userName, userPhone, authByEmailResult, wrongAuthId, deleteError, _a, recreatedUser, recreateError, generateLinkEndpoint, generateRes, fetchErr_1, body, linkData, parseErr_1, hashedToken, verifyEndpoint, verifyRes, fetchErr_2, body, sessionData, parseErr_2, access_token, refresh_token, error_1;
        var _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    _g.trys.push([0, 37, , 38]);
                    token = req.params.token;
                    if (!token)
                        return [2 /*return*/, res.status(400).json({ error: 'Token ausente' })];
                    return [4 /*yield*/, db_1.pool.query("SELECT user_id, redirect_to\n         FROM admin_autologin_tokens\n         WHERE token = $1\n           AND expires_at > NOW()\n         LIMIT 1", [token])];
                case 1:
                    rows = (_g.sent()).rows;
                    if (!rows || rows.length === 0) {
                        return [2 /*return*/, res.status(401).json({ error: 'Link inválido ou expirado' })];
                    }
                    userId = rows[0].user_id;
                    redirectTo = rows[0].redirect_to || '/conexao';
                    _g.label = 2;
                case 2:
                    _g.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db_1.pool.query("UPDATE admin_autologin_tokens\n           SET used_at = COALESCE(used_at, NOW())\n           WHERE token = $1", [token])];
                case 3:
                    _g.sent();
                    return [3 /*break*/, 5];
                case 4:
                    e_1 = _g.sent();
                    console.warn('[Autologin] Falha ao marcar primeiro uso do token:', e_1);
                    return [3 /*break*/, 5];
                case 5:
                    _g.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, db_1.pool.query('DELETE FROM admin_autologin_tokens WHERE user_id = $1 AND expires_at < NOW()', [userId])];
                case 6:
                    _g.sent();
                    return [3 /*break*/, 8];
                case 7:
                    e_2 = _g.sent();
                    console.warn('[Autologin] Falha ao limpar tokens expirados:', e_2);
                    return [3 /*break*/, 8];
                case 8:
                    if (!supabaseUrl || !supabaseServiceKey) {
                        console.error('[Autologin] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
                        return [2 /*return*/, res.status(500).json({ error: 'Configuração de autenticação ausente' })];
                    }
                    userEmail = null;
                    return [4 /*yield*/, db_1.pool.query('SELECT email FROM auth.users WHERE id = $1::uuid', [userId])];
                case 9:
                    authUserResult = _g.sent();
                    if (!(((_b = authUserResult.rows) === null || _b === void 0 ? void 0 : _b.length) > 0)) return [3 /*break*/, 10];
                    userEmail = authUserResult.rows[0].email;
                    return [3 /*break*/, 16];
                case 10: return [4 /*yield*/, db_1.pool.query('SELECT email, name, phone FROM users WHERE id = $1', [userId])];
                case 11:
                    appUserResult = _g.sent();
                    if (!((_c = appUserResult.rows) === null || _c === void 0 ? void 0 : _c.length) || !appUserResult.rows[0].email) {
                        console.error("[Autologin] Usu\u00E1rio ".concat(userId, " n\u00E3o encontrado em users/auth.users"));
                        return [2 /*return*/, res.status(404).json({ error: 'Usuário não encontrado' })];
                    }
                    userEmail = appUserResult.rows[0].email;
                    userName = appUserResult.rows[0].name || '';
                    userPhone = appUserResult.rows[0].phone || '';
                    return [4 /*yield*/, db_1.pool.query('SELECT id FROM auth.users WHERE lower(email) = lower($1) LIMIT 1', [userEmail])];
                case 12:
                    authByEmailResult = _g.sent();
                    if (!(((_d = authByEmailResult.rows) === null || _d === void 0 ? void 0 : _d.length) > 0)) return [3 /*break*/, 14];
                    wrongAuthId = authByEmailResult.rows[0].id;
                    if (!(wrongAuthId !== userId)) return [3 /*break*/, 14];
                    console.warn("[Autologin] Auth \u00F3rf\u00E3o encontrado por email ".concat(userEmail, ": ").concat(wrongAuthId, ". Recriando com id local ").concat(userId, "."));
                    return [4 /*yield*/, supabaseAuth_1.supabase.auth.admin.deleteUser(wrongAuthId)];
                case 13:
                    deleteError = (_g.sent()).error;
                    if (deleteError) {
                        console.error('[Autologin] Falha ao remover auth órfão:', deleteError);
                        return [2 /*return*/, res.status(500).json({ error: 'Erro ao recuperar autenticação' })];
                    }
                    _g.label = 14;
                case 14: return [4 /*yield*/, supabaseAuth_1.supabase.auth.admin.createUser({
                        id: userId,
                        email: userEmail,
                        password: buildTemporaryAuthPassword(),
                        email_confirm: true,
                        user_metadata: {
                            name: userName,
                            phone: userPhone,
                        },
                    })];
                case 15:
                    _a = _g.sent(), recreatedUser = _a.data, recreateError = _a.error;
                    if (recreateError) {
                        console.error('[Autologin] Falha ao recriar auth user ausente:', recreateError);
                        return [2 /*return*/, res.status(500).json({ error: 'Erro ao recuperar autenticação' })];
                    }
                    console.log("[Autologin] Auth user recriado para userId=".concat(userId, " email=").concat(userEmail, " authId=").concat(((_e = recreatedUser.user) === null || _e === void 0 ? void 0 : _e.id) || 'N/A'));
                    _g.label = 16;
                case 16:
                    if (!userEmail) {
                        return [2 /*return*/, res.status(404).json({ error: 'Usuário não encontrado' })];
                    }
                    generateLinkEndpoint = "".concat(supabaseUrl, "/auth/v1/admin/generate_link");
                    generateRes = void 0;
                    _g.label = 17;
                case 17:
                    _g.trys.push([17, 19, , 20]);
                    return [4 /*yield*/, fetch(generateLinkEndpoint, {
                            method: 'POST',
                            headers: {
                                'Authorization': "Bearer ".concat(supabaseServiceKey),
                                'apikey': supabaseServiceKey,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                type: 'magiclink',
                                email: userEmail,
                            }),
                        })];
                case 18:
                    generateRes = _g.sent();
                    return [3 /*break*/, 20];
                case 19:
                    fetchErr_1 = _g.sent();
                    console.error('[Autologin] Erro de rede ao gerar link:', fetchErr_1);
                    return [2 /*return*/, res.status(500).json({ error: 'Erro ao criar sessão' })];
                case 20:
                    if (!!generateRes.ok) return [3 /*break*/, 22];
                    return [4 /*yield*/, generateRes.text().catch(function () { return ''; })];
                case 21:
                    body = _g.sent();
                    console.error("[Autologin] generate_link retornou ".concat(generateRes.status, ":"), body);
                    return [2 /*return*/, res.status(500).json({ error: 'Erro ao criar sessão' })];
                case 22:
                    linkData = void 0;
                    _g.label = 23;
                case 23:
                    _g.trys.push([23, 25, , 26]);
                    return [4 /*yield*/, generateRes.json()];
                case 24:
                    linkData = _g.sent();
                    return [3 /*break*/, 26];
                case 25:
                    parseErr_1 = _g.sent();
                    console.error('[Autologin] Resposta do generate_link não é JSON válido');
                    return [2 /*return*/, res.status(500).json({ error: 'Erro ao criar sessão' })];
                case 26:
                    hashedToken = ((_f = linkData === null || linkData === void 0 ? void 0 : linkData.properties) === null || _f === void 0 ? void 0 : _f.hashed_token) || (linkData === null || linkData === void 0 ? void 0 : linkData.hashed_token);
                    if (!hashedToken) {
                        console.error('[Autologin] generate_link sem hashed_token:', JSON.stringify(linkData).substring(0, 200));
                        return [2 /*return*/, res.status(500).json({ error: 'Erro ao criar sessão' })];
                    }
                    verifyEndpoint = "".concat(supabaseUrl, "/auth/v1/verify");
                    verifyRes = void 0;
                    _g.label = 27;
                case 27:
                    _g.trys.push([27, 29, , 30]);
                    return [4 /*yield*/, fetch(verifyEndpoint, {
                            method: 'POST',
                            headers: {
                                'apikey': supabaseServiceKey,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                token_hash: hashedToken,
                                type: 'magiclink',
                            }),
                        })];
                case 28:
                    verifyRes = _g.sent();
                    return [3 /*break*/, 30];
                case 29:
                    fetchErr_2 = _g.sent();
                    console.error('[Autologin] Erro de rede ao verificar token:', fetchErr_2);
                    return [2 /*return*/, res.status(500).json({ error: 'Erro ao criar sessão' })];
                case 30:
                    if (!!verifyRes.ok) return [3 /*break*/, 32];
                    return [4 /*yield*/, verifyRes.text().catch(function () { return ''; })];
                case 31:
                    body = _g.sent();
                    console.error("[Autologin] verify retornou ".concat(verifyRes.status, ":"), body);
                    return [2 /*return*/, res.status(500).json({ error: 'Erro ao criar sessão' })];
                case 32:
                    sessionData = void 0;
                    _g.label = 33;
                case 33:
                    _g.trys.push([33, 35, , 36]);
                    return [4 /*yield*/, verifyRes.json()];
                case 34:
                    sessionData = _g.sent();
                    return [3 /*break*/, 36];
                case 35:
                    parseErr_2 = _g.sent();
                    console.error('[Autologin] Resposta do verify não é JSON válido');
                    return [2 /*return*/, res.status(500).json({ error: 'Erro ao criar sessão' })];
                case 36:
                    access_token = sessionData === null || sessionData === void 0 ? void 0 : sessionData.access_token;
                    refresh_token = sessionData === null || sessionData === void 0 ? void 0 : sessionData.refresh_token;
                    if (!access_token || !refresh_token) {
                        console.error('[Autologin] Resposta do verify sem tokens esperados:', JSON.stringify(sessionData).substring(0, 200));
                        return [2 /*return*/, res.status(500).json({ error: 'Erro ao criar sessão' })];
                    }
                    // V23k: Set Express session so cookie-based auth also works
                    // This prevents session drops when navigating between pages
                    if (req.session) {
                        req.session.user = { id: userId, email: userEmail };
                        console.log("[Autologin] Express session sincronizada para userId=".concat(userId, " email=").concat(userEmail));
                    }
                    return [2 /*return*/, res.json({ access_token: access_token, refresh_token: refresh_token, redirect_to: redirectTo })];
                case 37:
                    error_1 = _g.sent();
                    console.error('[Autologin]', error_1);
                    return [2 /*return*/, res.status(500).json({ error: 'Erro interno' })];
                case 38: return [2 /*return*/];
            }
        });
    }); });
}
