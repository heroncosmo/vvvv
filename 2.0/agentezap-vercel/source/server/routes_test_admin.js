"use strict";
/**
 * routes_test_admin.ts
 *
 * Endpoints exclusivos para os testes E2E Playwright do Admin Agent V2.
 * Todas as rotas são protegidas pelo header `x-test-secret`.
 *
 * Não expõe lógica de negócio nova — reutiliza `processAdminMessage` e
 * `clearClientSession` já exportados de `adminAgentService.ts`.
 */
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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTestAdminRoutes = registerTestAdminRoutes;
var adminAgentService_1 = require("./adminAgentService");
var supabaseAuth_1 = require("./supabaseAuth");
var storage_1 = require("./storage");
var TEST_SECRET = (_a = process.env.TEST_ADMIN_SECRET) !== null && _a !== void 0 ? _a : "agentezap-e2e-test-2024";
function checkSecret(req, res) {
    var provided = req.headers["x-test-secret"];
    if (provided !== TEST_SECRET) {
        res.status(403).json({ error: "Forbidden: invalid x-test-secret" });
        return false;
    }
    return true;
}
function registerTestAdminRoutes(app) {
    var _this = this;
    /**
     * POST /api/test/admin-login
     * Creates an Express server-side admin session (req.session.adminId) so that
     * the React admin panel (`RequireAdmin`) treats subsequent requests as admin.
     *
     * The Playwright browser calls this via `page.request.post()` — the session
     * cookie returned is automatically stored in the browser's cookie jar,
     * making it available on subsequent `page.goto()` navigations.
     */
    app.post("/api/test/admin-login", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var secret, admins, admin_1, err_1;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    secret = (_a = req.headers["x-test-secret"]) !== null && _a !== void 0 ? _a : req.query["secret"];
                    if (secret !== TEST_SECRET) {
                        res.status(403).json({ error: "Forbidden: invalid secret" });
                        return [2 /*return*/];
                    }
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, storage_1.storage.getAllAdmins()];
                case 2:
                    admins = _c.sent();
                    if (!(admins === null || admins === void 0 ? void 0 : admins.length)) {
                        res.status(404).json({ error: "No admins found in DB" });
                        return [2 /*return*/];
                    }
                    admin_1 = admins[0];
                    // Regenerate session to avoid fixation, then set admin fields
                    req.session.regenerate(function (err) {
                        var _a;
                        if (err) {
                            console.error("[TestAdmin] session.regenerate error:", err);
                            res.status(500).json({ error: "Session creation failed", detail: String(err) });
                            return;
                        }
                        req.session.adminId = admin_1.id;
                        req.session.adminRole = (_a = admin_1.role) !== null && _a !== void 0 ? _a : "admin";
                        req.session.save(function (saveErr) {
                            var _a;
                            if (saveErr) {
                                console.error("[TestAdmin] session.save error:", saveErr);
                                res.status(500).json({ error: "Session save failed", detail: String(saveErr) });
                                return;
                            }
                            console.log("[TestAdmin] Admin session created for ".concat(admin_1.email, " (id=").concat(admin_1.id, ")"));
                            res.json({
                                success: true,
                                admin: { id: admin_1.id, email: admin_1.email, role: (_a = admin_1.role) !== null && _a !== void 0 ? _a : "admin" },
                            });
                        });
                    });
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _c.sent();
                    console.error("[TestAdmin] Error in admin-login:", err_1);
                    res.status(500).json({ error: "Erro interno", detail: String((_b = err_1 === null || err_1 === void 0 ? void 0 : err_1.message) !== null && _b !== void 0 ? _b : err_1) });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    /**
     * POST /api/test/admin-chat
     * Body: { phone: string, message: string, skipTrigger?: boolean }
     * Returns: { text: string }
     */
    app.post("/api/test/admin-chat", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var _a, phone, phoneNumber, message, skipTrigger, rawPhone, result, text, splitMessages, err_2;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    if (!checkSecret(req, res))
                        return [2 /*return*/];
                    _a = req.body, phone = _a.phone, phoneNumber = _a.phoneNumber, message = _a.message, skipTrigger = _a.skipTrigger;
                    rawPhone = phone || phoneNumber;
                    if (!rawPhone || !message) {
                        res
                            .status(400)
                            .json({ error: "Missing required fields: phone or phoneNumber, message" });
                        return [2 /*return*/];
                    }
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, adminAgentService_1.processAdminMessage)(rawPhone, message, undefined, // mediaType
                        undefined, // mediaUrl
                        skipTrigger === true)];
                case 2:
                    result = _e.sent();
                    text = (_b = result === null || result === void 0 ? void 0 : result.text) !== null && _b !== void 0 ? _b : "[sem resposta — processAdminMessage retornou null]";
                    splitMessages = result === null || result === void 0 ? void 0 : result.splitMessages;
                    res.json({ text: text, actions: (_c = result === null || result === void 0 ? void 0 : result.actions) !== null && _c !== void 0 ? _c : {}, splitMessages: splitMessages });
                    return [3 /*break*/, 4];
                case 3:
                    err_2 = _e.sent();
                    console.error("[test/admin-chat] Erro ao processar mensagem:", err_2);
                    res
                        .status(500)
                        .json({ error: "Erro interno", detail: String((_d = err_2 === null || err_2 === void 0 ? void 0 : err_2.message) !== null && _d !== void 0 ? _d : err_2) });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    /**
     * DELETE /api/test/admin-chat/clear
     * Body: { phone: string }
     * Returns: { cleared: boolean }
     */
    app.delete("/api/test/admin-chat/clear", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var phone, cleared;
        var _a;
        return __generator(this, function (_b) {
            if (!checkSecret(req, res))
                return [2 /*return*/];
            phone = req.body.phone;
            if (!phone) {
                res.status(400).json({ error: "Missing required field: phone" });
                return [2 /*return*/];
            }
            try {
                cleared = (0, adminAgentService_1.clearClientSession)(phone);
                res.json({ cleared: cleared !== null && cleared !== void 0 ? cleared : true });
            }
            catch (err) {
                console.error("[test/admin-chat/clear] Erro ao limpar sessão:", err);
                res.status(500).json({
                    error: "Erro interno",
                    detail: String((_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err),
                });
            }
            return [2 /*return*/];
        });
    }); });
    /**
     * POST /api/test/admin-conversations/:id/send
     * Body: { text: string, adminId?: string, adminEmail?: string }
     * Envia mensagem manual usando a sessão real do admin já conectada no processo principal.
     */
    app.post("/api/test/admin-conversations/:id/send", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var id, _a, text, adminId, adminEmail, admins, normalizedEmail_1, resolvedAdmin, sendAdminConversationMessage, err_3;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    if (!checkSecret(req, res))
                        return [2 /*return*/];
                    id = req.params.id;
                    _a = req.body, text = _a.text, adminId = _a.adminId, adminEmail = _a.adminEmail;
                    if (!id || !(text === null || text === void 0 ? void 0 : text.trim())) {
                        res.status(400).json({ error: "Missing required fields: id, text" });
                        return [2 /*return*/];
                    }
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, storage_1.storage.getAllAdmins()];
                case 2:
                    admins = _d.sent();
                    if (!(admins === null || admins === void 0 ? void 0 : admins.length)) {
                        res.status(404).json({ error: "No admins found" });
                        return [2 /*return*/];
                    }
                    normalizedEmail_1 = String(adminEmail || "").trim().toLowerCase();
                    resolvedAdmin = admins.find(function (admin) { return admin.id === adminId; }) ||
                        admins.find(function (admin) { return normalizedEmail_1 && String(admin.email || "").trim().toLowerCase() === normalizedEmail_1; }) ||
                        admins.find(function (admin) { return admin.role === "owner"; }) ||
                        admins[0];
                    if (!(resolvedAdmin === null || resolvedAdmin === void 0 ? void 0 : resolvedAdmin.id)) {
                        res.status(404).json({ error: "Unable to resolve admin sender" });
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./whatsapp"); })];
                case 3:
                    sendAdminConversationMessage = (_d.sent()).sendAdminConversationMessage;
                    return [4 /*yield*/, sendAdminConversationMessage(resolvedAdmin.id, id, text.trim())];
                case 4:
                    _d.sent();
                    res.json({
                        success: true,
                        admin: {
                            id: resolvedAdmin.id,
                            email: resolvedAdmin.email,
                            role: (_b = resolvedAdmin.role) !== null && _b !== void 0 ? _b : "admin",
                        },
                        conversationId: id,
                    });
                    return [3 /*break*/, 6];
                case 5:
                    err_3 = _d.sent();
                    console.error("[test/admin-conversations/send] Erro ao enviar mensagem manual:", err_3);
                    res.status(500).json({
                        error: "Erro interno",
                        detail: String((_c = err_3 === null || err_3 === void 0 ? void 0 : err_3.message) !== null && _c !== void 0 ? _c : err_3),
                    });
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    }); });
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
    app.get("/api/test/admin-session", function (_req, res) { return __awaiter(_this, void 0, void 0, function () {
        var secret, _a, listData, listError, sortedUsers, targetUser, email, _b, linkData, linkError, emailOtp, _c, verifyData, verifyError, _d, access_token, refresh_token, expires_in, token_type, err_4;
        var _e, _f, _g, _h, _j, _k, _l, _m;
        return __generator(this, function (_o) {
            switch (_o.label) {
                case 0:
                    secret = (_e = _req.headers["x-test-secret"]) !== null && _e !== void 0 ? _e : _req.query["secret"];
                    if (secret !== TEST_SECRET) {
                        res.status(403).json({ error: "Forbidden: invalid secret" });
                        return [2 /*return*/];
                    }
                    _o.label = 1;
                case 1:
                    _o.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, supabaseAuth_1.supabase.auth.admin.listUsers({ perPage: 10, page: 1 })];
                case 2:
                    _a = _o.sent(), listData = _a.data, listError = _a.error;
                    if (listError || !((_f = listData === null || listData === void 0 ? void 0 : listData.users) === null || _f === void 0 ? void 0 : _f.length)) {
                        res.status(404).json({
                            error: "No Supabase Auth users found",
                            detail: listError === null || listError === void 0 ? void 0 : listError.message,
                        });
                        return [2 /*return*/];
                    }
                    sortedUsers = listData.users.sort(function (a, b) {
                        var _a, _b;
                        return new Date((_a = a.created_at) !== null && _a !== void 0 ? _a : 0).getTime() -
                            new Date((_b = b.created_at) !== null && _b !== void 0 ? _b : 0).getTime();
                    });
                    targetUser = sortedUsers[0];
                    email = targetUser.email;
                    if (!email) {
                        res.status(404).json({ error: "First Supabase user has no email" });
                        return [2 /*return*/];
                    }
                    console.log("[TestAdmin] Generating OTP for: ".concat(email));
                    return [4 /*yield*/, supabaseAuth_1.supabase.auth.admin.generateLink({
                            type: "magiclink",
                            email: email,
                        })];
                case 3:
                    _b = _o.sent(), linkData = _b.data, linkError = _b.error;
                    if (linkError) {
                        console.error("[TestAdmin] generateLink error:", linkError);
                        res.status(502).json({
                            error: "Failed to generate magic link",
                            detail: linkError === null || linkError === void 0 ? void 0 : linkError.message,
                        });
                        return [2 /*return*/];
                    }
                    emailOtp = (_h = (_g = linkData === null || linkData === void 0 ? void 0 : linkData.properties) === null || _g === void 0 ? void 0 : _g.email_otp) !== null && _h !== void 0 ? _h : (_k = (_j = linkData === null || linkData === void 0 ? void 0 : linkData.data) === null || _j === void 0 ? void 0 : _j.properties) === null || _k === void 0 ? void 0 : _k.email_otp;
                    if (!emailOtp) {
                        console.error("[TestAdmin] generateLink returned:", JSON.stringify(linkData).slice(0, 500));
                        res.status(502).json({
                            error: "generateLink did not return email_otp",
                            received: JSON.stringify(linkData).slice(0, 300),
                        });
                        return [2 /*return*/];
                    }
                    console.log("[TestAdmin] Verifying OTP for ".concat(email));
                    return [4 /*yield*/, supabaseAuth_1.supabase.auth.verifyOtp({
                            email: email,
                            token: emailOtp,
                            type: "magiclink",
                        })];
                case 4:
                    _c = _o.sent(), verifyData = _c.data, verifyError = _c.error;
                    if (verifyError || !(verifyData === null || verifyData === void 0 ? void 0 : verifyData.session)) {
                        console.error("[TestAdmin] verifyOtp error:", verifyError);
                        res.status(502).json({
                            error: "verifyOtp failed",
                            detail: (_l = verifyError === null || verifyError === void 0 ? void 0 : verifyError.message) !== null && _l !== void 0 ? _l : "No session returned",
                        });
                        return [2 /*return*/];
                    }
                    _d = verifyData.session, access_token = _d.access_token, refresh_token = _d.refresh_token, expires_in = _d.expires_in, token_type = _d.token_type;
                    console.log("[TestAdmin] Session created for ".concat(email, " (").concat(targetUser.id, ")"));
                    res.json({
                        access_token: access_token,
                        refresh_token: refresh_token,
                        expires_in: expires_in,
                        token_type: token_type,
                        user_id: targetUser.id,
                        email: email,
                    });
                    return [3 /*break*/, 6];
                case 5:
                    err_4 = _o.sent();
                    console.error("[TestAdmin] Erro ao criar sessão admin:", err_4);
                    res.status(500).json({ error: "Erro interno", detail: String((_m = err_4 === null || err_4 === void 0 ? void 0 : err_4.message) !== null && _m !== void 0 ? _m : err_4) });
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    }); });
    console.log("✅ [TestAdmin] Routes registered: POST /api/test/admin-chat, DELETE /api/test/admin-chat/clear, GET /api/test/admin-session");
}
