"use strict";
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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.registerQrcodeRoutes = registerQrcodeRoutes;
var zod_1 = require("zod");
var db_1 = require("./db");
var schema_1 = require("../shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var qrcodeService_1 = require("./qrcodeService");
var schema_2 = require("../shared/schema");
function getUserId(req) {
    var _a, _b, _c;
    return ((_b = (_a = req.session) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.id) || ((_c = req.user) === null || _c === void 0 ? void 0 : _c.id) || "";
}
function registerQrcodeRoutes(app) {
    var _this = this;
    console.log("📱 [QRCode] Registrando rotas QR Code Inteligente...");
    // ─── GET /api/qrcodes/templates ───────────────────────────────────────────
    app.get("/api/qrcodes/templates", function (_req, res) {
        var templates = (0, qrcodeService_1.getQrcodeTemplates)();
        return res.json({ templates: templates });
    });
    // ─── POST /api/qrcodes/preview ────────────────────────────────────────────
    // Generate a QR Code preview without saving (for live editor)
    app.post("/api/qrcodes/preview", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var _a, whatsappNumber, welcomeMessage, _b, foregroundColor, _c, backgroundColor, _d, errorCorrection, _e, qrSize, targetUrl, qrData, error_1;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _f.trys.push([0, 2, , 3]);
                    _a = req.body, whatsappNumber = _a.whatsappNumber, welcomeMessage = _a.welcomeMessage, _b = _a.foregroundColor, foregroundColor = _b === void 0 ? "#000000" : _b, _c = _a.backgroundColor, backgroundColor = _c === void 0 ? "#ffffff" : _c, _d = _a.errorCorrection, errorCorrection = _d === void 0 ? "H" : _d, _e = _a.qrSize, qrSize = _e === void 0 ? 400 : _e;
                    if (!whatsappNumber) {
                        return [2 /*return*/, res.status(400).json({ error: "whatsappNumber é obrigatório" })];
                    }
                    targetUrl = (0, qrcodeService_1.buildWhatsAppUrl)(whatsappNumber, welcomeMessage);
                    return [4 /*yield*/, (0, qrcodeService_1.generateQrCodeImage)({
                            targetUrl: targetUrl,
                            size: qrSize,
                            foregroundColor: foregroundColor,
                            backgroundColor: backgroundColor,
                            errorCorrection: errorCorrection,
                        })];
                case 1:
                    qrData = _f.sent();
                    return [2 /*return*/, res.json({ qrData: qrData, targetUrl: targetUrl })];
                case 2:
                    error_1 = _f.sent();
                    console.error("[QRCode] Error generating preview:", error_1);
                    return [2 /*return*/, res.status(500).json({ error: "Erro ao gerar preview" })];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ─── GET /api/qrcodes ─────────────────────────────────────────────────────
    app.get("/api/qrcodes", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, qrcodes, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    if (!userId)
                        return [2 /*return*/, res.status(401).json({ error: "Não autorizado" })];
                    return [4 /*yield*/, (0, qrcodeService_1.listUserQrcodes)(userId)];
                case 1:
                    qrcodes = _a.sent();
                    return [2 /*return*/, res.json({ qrcodes: qrcodes })];
                case 2:
                    error_2 = _a.sent();
                    console.error("[QRCode] Error listing QR Codes:", error_2);
                    return [2 /*return*/, res.status(500).json({ error: "Erro ao listar QR Codes" })];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ─── POST /api/qrcodes ────────────────────────────────────────────────────
    app.post("/api/qrcodes", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, body, tpl, parsed, qrcode, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    if (!userId)
                        return [2 /*return*/, res.status(401).json({ error: "Não autorizado" })];
                    body = req.body;
                    if (!body.targetUrl && body.whatsappNumber) {
                        body = __assign(__assign({}, body), { targetUrl: (0, qrcodeService_1.buildWhatsAppUrl)(body.whatsappNumber, body.welcomeMessage) });
                    }
                    // Apply template defaults if templateId provided
                    if (body.templateId && qrcodeService_1.QRCODE_TEMPLATES[body.templateId]) {
                        tpl = qrcodeService_1.QRCODE_TEMPLATES[body.templateId];
                        body = __assign({ welcomeMessage: tpl.welcomeMessage, foregroundColor: tpl.foregroundColor, templateName: tpl.name }, body);
                    }
                    parsed = schema_2.smartQrcodeSchema.parse(body);
                    return [4 /*yield*/, (0, qrcodeService_1.createSmartQrcode)(userId, parsed)];
                case 1:
                    qrcode = _a.sent();
                    return [2 /*return*/, res.status(201).json({ qrcode: qrcode })];
                case 2:
                    error_3 = _a.sent();
                    if (error_3 instanceof zod_1.z.ZodError) {
                        return [2 /*return*/, res.status(400).json({ error: "Dados inválidos", details: error_3.errors })];
                    }
                    console.error("[QRCode] Error creating QR Code:", error_3);
                    return [2 /*return*/, res.status(500).json({ error: "Erro ao criar QR Code" })];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ─── GET /api/qrcodes/:id ─────────────────────────────────────────────────
    app.get("/api/qrcodes/:id", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, qrcode, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    if (!userId)
                        return [2 /*return*/, res.status(401).json({ error: "Não autorizado" })];
                    return [4 /*yield*/, (0, qrcodeService_1.getQrcodeById)(userId, req.params.id)];
                case 1:
                    qrcode = _a.sent();
                    if (!qrcode) {
                        return [2 /*return*/, res.status(404).json({ error: "QR Code não encontrado" })];
                    }
                    return [2 /*return*/, res.json({ qrcode: qrcode })];
                case 2:
                    error_4 = _a.sent();
                    console.error("[QRCode] Error fetching QR Code:", error_4);
                    return [2 /*return*/, res.status(500).json({ error: "Erro ao buscar QR Code" })];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ─── PATCH /api/qrcodes/:id ───────────────────────────────────────────────
    app.patch("/api/qrcodes/:id", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, parsed, qrcode, error_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    if (!userId)
                        return [2 /*return*/, res.status(401).json({ error: "Não autorizado" })];
                    parsed = schema_2.updateSmartQrcodeSchema.parse(req.body);
                    return [4 /*yield*/, (0, qrcodeService_1.updateQrcode)(userId, req.params.id, parsed)];
                case 1:
                    qrcode = _a.sent();
                    if (!qrcode) {
                        return [2 /*return*/, res.status(404).json({ error: "QR Code não encontrado" })];
                    }
                    return [2 /*return*/, res.json({ qrcode: qrcode })];
                case 2:
                    error_5 = _a.sent();
                    if (error_5 instanceof zod_1.z.ZodError) {
                        return [2 /*return*/, res.status(400).json({ error: "Dados inválidos", details: error_5.errors })];
                    }
                    console.error("[QRCode] Error updating QR Code:", error_5);
                    return [2 /*return*/, res.status(500).json({ error: "Erro ao atualizar QR Code" })];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ─── DELETE /api/qrcodes/:id ──────────────────────────────────────────────
    app.delete("/api/qrcodes/:id", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, deleted, error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    if (!userId)
                        return [2 /*return*/, res.status(401).json({ error: "Não autorizado" })];
                    return [4 /*yield*/, (0, qrcodeService_1.deleteQrcode)(userId, req.params.id)];
                case 1:
                    deleted = _a.sent();
                    if (!deleted) {
                        return [2 /*return*/, res.status(404).json({ error: "QR Code não encontrado" })];
                    }
                    return [2 /*return*/, res.json({ success: true })];
                case 2:
                    error_6 = _a.sent();
                    console.error("[QRCode] Error deleting QR Code:", error_6);
                    return [2 /*return*/, res.status(500).json({ error: "Erro ao deletar QR Code" })];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ─── GET /api/qrcodes/:id/download ────────────────────────────────────────
    // Query params: format=png|svg  (default: png)
    app.get("/api/qrcodes/:id/download", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, format, qrcode, safeName, svg, pngData, base64, buffer, error_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 6, , 7]);
                    userId = getUserId(req);
                    if (!userId)
                        return [2 /*return*/, res.status(401).json({ error: "Não autorizado" })];
                    format = req.query.format || "png";
                    return [4 /*yield*/, (0, qrcodeService_1.getQrcodeById)(userId, req.params.id)];
                case 1:
                    qrcode = _a.sent();
                    if (!qrcode) {
                        return [2 /*return*/, res.status(404).json({ error: "QR Code não encontrado" })];
                    }
                    safeName = qrcode.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
                    if (!(format === "svg")) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, qrcodeService_1.generateQrCodeSvg)({
                            targetUrl: qrcode.targetUrl,
                            size: qrcode.qrSize || 400,
                            foregroundColor: qrcode.foregroundColor || "#000000",
                            backgroundColor: qrcode.backgroundColor || "#ffffff",
                            errorCorrection: (qrcode.errorCorrection || "H"),
                        })];
                case 2:
                    svg = _a.sent();
                    res.setHeader("Content-Type", "image/svg+xml");
                    res.setHeader("Content-Disposition", "attachment; filename=\"".concat(safeName, ".svg\""));
                    return [2 /*return*/, res.send(svg)];
                case 3:
                    pngData = qrcode.qrData;
                    if (!!pngData) return [3 /*break*/, 5];
                    return [4 /*yield*/, (0, qrcodeService_1.generateQrCodeImage)({
                            targetUrl: qrcode.targetUrl,
                            size: qrcode.qrSize || 400,
                            foregroundColor: qrcode.foregroundColor || "#000000",
                            backgroundColor: qrcode.backgroundColor || "#ffffff",
                            errorCorrection: (qrcode.errorCorrection || "H"),
                        })];
                case 4:
                    pngData = _a.sent();
                    _a.label = 5;
                case 5:
                    base64 = pngData.replace(/^data:image\/png;base64,/, "");
                    buffer = Buffer.from(base64, "base64");
                    res.setHeader("Content-Type", "image/png");
                    res.setHeader("Content-Disposition", "attachment; filename=\"".concat(safeName, ".png\""));
                    res.setHeader("Content-Length", buffer.length);
                    return [2 /*return*/, res.send(buffer)];
                case 6:
                    error_7 = _a.sent();
                    console.error("[QRCode] Error downloading QR Code:", error_7);
                    return [2 /*return*/, res.status(500).json({ error: "Erro ao baixar QR Code" })];
                case 7: return [2 /*return*/];
            }
        });
    }); });
    // ─── POST /api/qrcodes/:id/scan ───────────────────────────────────────────
    app.post("/api/qrcodes/:id/scan", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var _a, qrcodeId, userId, error_8;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    _a = req.body, qrcodeId = _a.qrcodeId, userId = _a.userId;
                    if (!qrcodeId || !userId) {
                        return [2 /*return*/, res.status(400).json({ error: "qrcodeId e userId são obrigatórios" })];
                    }
                    return [4 /*yield*/, (0, qrcodeService_1.registerQrcodeScan)(qrcodeId, userId, {
                            userAgent: req.headers["user-agent"],
                            ipAddress: req.ip,
                        })];
                case 1:
                    _b.sent();
                    return [2 /*return*/, res.json({ success: true })];
                case 2:
                    error_8 = _b.sent();
                    console.error("[QRCode] Error registering scan:", error_8);
                    return [2 /*return*/, res.status(500).json({ error: "Erro ao registrar scan" })];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    console.log("✅ [QRCode] Rotas registradas com sucesso!");
    // ─── BUSINESS CATEGORIES (public endpoints) ───────────────────────────────
    // GET /api/business-categories — all active, ordered
    app.get("/api/business-categories", function (_req, res) { return __awaiter(_this, void 0, void 0, function () {
        var cats, error_9;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.businessCategories)
                            .where((0, drizzle_orm_1.eq)(schema_1.businessCategories.isActive, true))
                            .orderBy((0, drizzle_orm_1.asc)(schema_1.businessCategories.sortOrder))];
                case 1:
                    cats = _a.sent();
                    return [2 /*return*/, res.json({ categories: cats })];
                case 2:
                    error_9 = _a.sent();
                    console.error("[BusinessCategories] Error listing:", error_9);
                    return [2 /*return*/, res.status(500).json({ error: "Erro ao listar categorias" })];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // GET /api/business-categories/groups — macro-groups with nested categories
    app.get("/api/business-categories/groups", function (_req, res) { return __awaiter(_this, void 0, void 0, function () {
        var cats, grouped, _i, cats_1, cat, groups, error_10;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.businessCategories)
                            .where((0, drizzle_orm_1.eq)(schema_1.businessCategories.isActive, true))
                            .orderBy((0, drizzle_orm_1.asc)(schema_1.businessCategories.sortOrder))];
                case 1:
                    cats = _a.sent();
                    grouped = {};
                    for (_i = 0, cats_1 = cats; _i < cats_1.length; _i++) {
                        cat = cats_1[_i];
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
                    groups = Object.values(grouped).sort(function (a, b) { return b.totalUsers - a.totalUsers; });
                    return [2 /*return*/, res.json({ groups: groups })];
                case 2:
                    error_10 = _a.sent();
                    console.error("[BusinessCategories] Error grouping:", error_10);
                    return [2 /*return*/, res.status(500).json({ error: "Erro ao agrupar categorias" })];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // GET /api/business-categories/:slug — single category
    app.get("/api/business-categories/:slug", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var cat, error_11;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.businessCategories)
                            .where((0, drizzle_orm_1.eq)(schema_1.businessCategories.slug, req.params.slug))];
                case 1:
                    cat = (_a.sent())[0];
                    if (!cat) {
                        return [2 /*return*/, res.status(404).json({ error: "Categoria não encontrada" })];
                    }
                    return [2 /*return*/, res.json({ category: cat })];
                case 2:
                    error_11 = _a.sent();
                    console.error("[BusinessCategories] Error fetching:", error_11);
                    return [2 /*return*/, res.status(500).json({ error: "Erro ao buscar categoria" })];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    console.log("✅ [BusinessCategories] Rotas registradas com sucesso!");
}
