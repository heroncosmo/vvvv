"use strict";
/**
 * QR Code Inteligente Service
 * Step 1: Core service - generate & manage WhatsApp QR Codes
 *
 * Features:
 * - Generate QR Codes pointing to WhatsApp (wa.me links)
 * - Personalization: colors, logo, corner radius
 * - Template support per business segment
 * - Download: PNG (base64), SVG, PDF
 * - Analytics: scan count tracking
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
exports.QRCODE_TEMPLATES = void 0;
exports.buildWhatsAppUrl = buildWhatsAppUrl;
exports.generateQrCodeImage = generateQrCodeImage;
exports.generateQrCodeSvg = generateQrCodeSvg;
exports.createSmartQrcode = createSmartQrcode;
exports.listUserQrcodes = listUserQrcodes;
exports.getQrcodeById = getQrcodeById;
exports.updateQrcode = updateQrcode;
exports.deleteQrcode = deleteQrcode;
exports.registerQrcodeScan = registerQrcodeScan;
exports.getQrcodeTemplates = getQrcodeTemplates;
var qrcode_1 = require("qrcode");
var db_1 = require("./db");
var schema_1 = require("../shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
// ============================================================
// Business Segment Templates
// Pre-defined welcome messages per business type
// ============================================================
exports.QRCODE_TEMPLATES = {
    // DELIVERY
    lanchonete: {
        name: "Lanchonete",
        icon: "🍔",
        welcomeMessage: "Olá! Quero fazer um pedido 🍔",
        categoryGroup: "delivery",
        foregroundColor: "#e65c00",
    },
    pizzaria: {
        name: "Pizzaria",
        icon: "🍕",
        welcomeMessage: "Olá! Quero ver o cardápio de pizzas 🍕",
        categoryGroup: "delivery",
        foregroundColor: "#c0392b",
    },
    restaurante: {
        name: "Restaurante",
        icon: "🍽️",
        welcomeMessage: "Olá! Quero fazer um pedido 🍽️",
        categoryGroup: "delivery",
        foregroundColor: "#27ae60",
    },
    hamburgueria: {
        name: "Hamburgueria",
        icon: "🍔",
        welcomeMessage: "Olá! Quero ver o cardápio de burgers 🍔",
        categoryGroup: "delivery",
        foregroundColor: "#d35400",
    },
    acai: {
        name: "Açaí / Sorveteria",
        icon: "🍧",
        welcomeMessage: "Olá! Quero fazer um pedido 🍧",
        categoryGroup: "delivery",
        foregroundColor: "#8e44ad",
    },
    confeitaria: {
        name: "Confeitaria / Bolos",
        icon: "🎂",
        welcomeMessage: "Olá! Gostaria de informações sobre bolos e doces 🎂",
        categoryGroup: "delivery",
        foregroundColor: "#e91e8c",
    },
    // BELEZA
    salao: {
        name: "Salão de Beleza",
        icon: "💇",
        welcomeMessage: "Olá! Gostaria de agendar um horário 💇",
        categoryGroup: "beleza",
        foregroundColor: "#e91e8c",
    },
    barbearia: {
        name: "Barbearia",
        icon: "✂️",
        welcomeMessage: "Olá! Quero agendar um corte ✂️",
        categoryGroup: "beleza",
        foregroundColor: "#2c3e50",
    },
    estetica: {
        name: "Clínica de Estética",
        icon: "💆",
        welcomeMessage: "Olá! Gostaria de informações sobre os procedimentos 💆",
        categoryGroup: "beleza",
        foregroundColor: "#9b59b6",
    },
    manicure: {
        name: "Manicure / Nail Designer",
        icon: "💅",
        welcomeMessage: "Olá! Quero agendar manicure/pedicure 💅",
        categoryGroup: "beleza",
        foregroundColor: "#e74c3c",
    },
    // SAÚDE
    clinica: {
        name: "Clínica Médica",
        icon: "🏥",
        welcomeMessage: "Olá! Gostaria de agendar uma consulta 🏥",
        categoryGroup: "saude",
        foregroundColor: "#2980b9",
    },
    dentista: {
        name: "Dentista / Odontologia",
        icon: "🦷",
        welcomeMessage: "Olá! Gostaria de agendar uma consulta odontológica 🦷",
        categoryGroup: "saude",
        foregroundColor: "#1abc9c",
    },
    fisioterapia: {
        name: "Fisioterapia / Pilates",
        icon: "🏃",
        welcomeMessage: "Olá! Quero agendar uma sessão 🏃",
        categoryGroup: "saude",
        foregroundColor: "#27ae60",
    },
    veterinario: {
        name: "Veterinário / Pet Shop",
        icon: "🐾",
        welcomeMessage: "Olá! Quero agendar uma consulta para meu pet 🐾",
        categoryGroup: "saude",
        foregroundColor: "#f39c12",
    },
    // EDUCAÇÃO
    academia: {
        name: "Academia / Fitness",
        icon: "🏋️",
        welcomeMessage: "Olá! Quero informações sobre planos e horários 🏋️",
        categoryGroup: "educacao",
        foregroundColor: "#e74c3c",
    },
    escola: {
        name: "Escola / Cursos",
        icon: "📚",
        welcomeMessage: "Olá! Quero informações sobre cursos e matrículas 📚",
        categoryGroup: "educacao",
        foregroundColor: "#2980b9",
    },
    // IMOBILIÁRIO
    imobiliaria: {
        name: "Imobiliária / Corretor",
        icon: "🏠",
        welcomeMessage: "Olá! Tenho interesse em imóveis 🏠",
        categoryGroup: "imobiliario",
        foregroundColor: "#27ae60",
    },
    // AUTOMOTIVO
    oficina: {
        name: "Oficina Mecânica",
        icon: "🔧",
        welcomeMessage: "Olá! Preciso de um orçamento 🔧",
        categoryGroup: "automotivo",
        foregroundColor: "#2c3e50",
    },
    // VAREJO
    loja: {
        name: "Loja / Varejo",
        icon: "🛍️",
        welcomeMessage: "Olá! Quero ver os produtos disponíveis 🛍️",
        categoryGroup: "varejo",
        foregroundColor: "#e74c3c",
    },
    // GENÉRICO
    generico: {
        name: "Negócio Geral",
        icon: "💬",
        welcomeMessage: "Olá! Gostaria de mais informações 💬",
        categoryGroup: "geral",
        foregroundColor: "#2c3e50",
    },
};
// ============================================================
// Helper: Build WhatsApp URL from number + optional message
// ============================================================
function buildWhatsAppUrl(phoneNumber, message) {
    // Normalize: keep only digits
    var digits = phoneNumber.replace(/\D/g, "");
    if (!message) {
        return "https://wa.me/".concat(digits);
    }
    var encoded = encodeURIComponent(message);
    return "https://wa.me/".concat(digits, "?text=").concat(encoded);
}
// ============================================================
// Generate QR Code as base64 PNG Data URL
// ============================================================
function generateQrCodeImage(options) {
    return __awaiter(this, void 0, void 0, function () {
        var targetUrl, _a, size, _b, foregroundColor, _c, backgroundColor, _d, errorCorrection, dataUrl;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    targetUrl = options.targetUrl, _a = options.size, size = _a === void 0 ? 400 : _a, _b = options.foregroundColor, foregroundColor = _b === void 0 ? "#000000" : _b, _c = options.backgroundColor, backgroundColor = _c === void 0 ? "#ffffff" : _c, _d = options.errorCorrection, errorCorrection = _d === void 0 ? "H" : _d;
                    return [4 /*yield*/, qrcode_1.default.toDataURL(targetUrl, {
                            errorCorrectionLevel: errorCorrection,
                            type: "image/png",
                            margin: 1,
                            width: size,
                            color: {
                                dark: foregroundColor,
                                light: backgroundColor,
                            },
                        })];
                case 1:
                    dataUrl = _e.sent();
                    return [2 /*return*/, dataUrl];
            }
        });
    });
}
// ============================================================
// Generate QR Code as SVG string
// ============================================================
function generateQrCodeSvg(options) {
    return __awaiter(this, void 0, void 0, function () {
        var targetUrl, _a, size, _b, foregroundColor, _c, backgroundColor, _d, errorCorrection, svg;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    targetUrl = options.targetUrl, _a = options.size, size = _a === void 0 ? 400 : _a, _b = options.foregroundColor, foregroundColor = _b === void 0 ? "#000000" : _b, _c = options.backgroundColor, backgroundColor = _c === void 0 ? "#ffffff" : _c, _d = options.errorCorrection, errorCorrection = _d === void 0 ? "H" : _d;
                    return [4 /*yield*/, qrcode_1.default.toString(targetUrl, {
                            type: "svg",
                            errorCorrectionLevel: errorCorrection,
                            margin: 1,
                            width: size,
                            color: {
                                dark: foregroundColor,
                                light: backgroundColor,
                            },
                        })];
                case 1:
                    svg = _e.sent();
                    return [2 /*return*/, svg];
            }
        });
    });
}
// ============================================================
// CRUD Operations
// ============================================================
/**
 * Create a new Smart QR Code for a user
 */
function createSmartQrcode(userId, input) {
    return __awaiter(this, void 0, void 0, function () {
        var slug, qrData, qrcode;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    slug = input.slug;
                    if (!slug) {
                        slug = "".concat(userId.slice(0, 8), "-").concat(Date.now());
                    }
                    return [4 /*yield*/, generateQrCodeImage({
                            targetUrl: input.targetUrl,
                            size: input.qrSize || 400,
                            foregroundColor: input.foregroundColor || "#000000",
                            backgroundColor: input.backgroundColor || "#ffffff",
                            errorCorrection: (input.errorCorrection || "H"),
                        })];
                case 1:
                    qrData = _b.sent();
                    return [4 /*yield*/, db_1.db
                            .insert(schema_1.smartQrcodes)
                            .values({
                            userId: userId,
                            name: input.name,
                            description: input.description || null,
                            slug: slug,
                            whatsappNumber: input.whatsappNumber,
                            welcomeMessage: input.welcomeMessage || null,
                            templateId: input.templateId || null,
                            templateName: input.templateName || null,
                            foregroundColor: input.foregroundColor || "#000000",
                            backgroundColor: input.backgroundColor || "#ffffff",
                            logoUrl: input.logoUrl || null,
                            logoSize: input.logoSize || 20,
                            cornerRadius: input.cornerRadius || 0,
                            errorCorrection: input.errorCorrection || "H",
                            targetUrl: input.targetUrl,
                            qrData: qrData,
                            qrGeneratedAt: new Date(),
                            qrSize: input.qrSize || 400,
                            isActive: (_a = input.isActive) !== null && _a !== void 0 ? _a : true,
                        })
                            .returning()];
                case 2:
                    qrcode = (_b.sent())[0];
                    return [2 /*return*/, qrcode];
            }
        });
    });
}
/**
 * List all QR Codes for a user
 */
function listUserQrcodes(userId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, db_1.db
                    .select()
                    .from(schema_1.smartQrcodes)
                    .where((0, drizzle_orm_1.eq)(schema_1.smartQrcodes.userId, userId))
                    .orderBy(schema_1.smartQrcodes.createdAt)];
        });
    });
}
/**
 * Get a single QR Code by ID (must belong to user)
 */
function getQrcodeById(userId, qrcodeId) {
    return __awaiter(this, void 0, void 0, function () {
        var qrcode;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select()
                        .from(schema_1.smartQrcodes)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.smartQrcodes.id, qrcodeId), (0, drizzle_orm_1.eq)(schema_1.smartQrcodes.userId, userId)))];
                case 1:
                    qrcode = (_a.sent())[0];
                    return [2 /*return*/, qrcode || null];
            }
        });
    });
}
/**
 * Update a QR Code (regenerates QR image if visual options changed)
 */
function updateQrcode(userId, qrcodeId, input) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, needsRegeneration, qrData, qrGeneratedAt, targetUrl, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getQrcodeById(userId, qrcodeId)];
                case 1:
                    existing = _a.sent();
                    if (!existing)
                        return [2 /*return*/, null];
                    needsRegeneration = input.foregroundColor !== undefined ||
                        input.backgroundColor !== undefined ||
                        input.qrSize !== undefined ||
                        input.errorCorrection !== undefined;
                    qrData = existing.qrData;
                    qrGeneratedAt = existing.qrGeneratedAt;
                    if (!needsRegeneration) return [3 /*break*/, 3];
                    targetUrl = existing.targetUrl;
                    return [4 /*yield*/, generateQrCodeImage({
                            targetUrl: targetUrl,
                            size: input.qrSize || existing.qrSize || 400,
                            foregroundColor: input.foregroundColor || existing.foregroundColor || "#000000",
                            backgroundColor: input.backgroundColor || existing.backgroundColor || "#ffffff",
                            errorCorrection: (input.errorCorrection || existing.errorCorrection || "H"),
                        })];
                case 2:
                    qrData = _a.sent();
                    qrGeneratedAt = new Date();
                    _a.label = 3;
                case 3: return [4 /*yield*/, db_1.db
                        .update(schema_1.smartQrcodes)
                        .set(__assign(__assign({}, input), { qrData: qrData, qrGeneratedAt: qrGeneratedAt || undefined, updatedAt: new Date() }))
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.smartQrcodes.id, qrcodeId), (0, drizzle_orm_1.eq)(schema_1.smartQrcodes.userId, userId)))
                        .returning()];
                case 4:
                    updated = (_a.sent())[0];
                    return [2 /*return*/, updated || null];
            }
        });
    });
}
/**
 * Delete a QR Code
 */
function deleteQrcode(userId, qrcodeId) {
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .delete(schema_1.smartQrcodes)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.smartQrcodes.id, qrcodeId), (0, drizzle_orm_1.eq)(schema_1.smartQrcodes.userId, userId)))
                        .returning({ id: schema_1.smartQrcodes.id })];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0];
            }
        });
    });
}
/**
 * Register a scan event for analytics
 */
function registerQrcodeScan(qrcodeId, userId, metadata) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, _b;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: 
                // Insert scan log
                return [4 /*yield*/, db_1.db.insert(schema_1.qrcodeScanLogs).values({
                        qrcodeId: qrcodeId,
                        userId: userId,
                        scannedAt: new Date(),
                        userAgent: (metadata === null || metadata === void 0 ? void 0 : metadata.userAgent) || null,
                        ipAddress: (metadata === null || metadata === void 0 ? void 0 : metadata.ipAddress) || null,
                        referrer: (metadata === null || metadata === void 0 ? void 0 : metadata.referrer) || null,
                    })];
                case 1:
                    // Insert scan log
                    _d.sent();
                    _b = (_a = db_1.db
                        .update(schema_1.smartQrcodes))
                        .set;
                    _c = {};
                    return [4 /*yield*/, db_1.db
                            .select({ scanCount: schema_1.smartQrcodes.scanCount })
                            .from(schema_1.smartQrcodes)
                            .where((0, drizzle_orm_1.eq)(schema_1.smartQrcodes.id, qrcodeId))
                            .then(function (r) { var _a; return (((_a = r[0]) === null || _a === void 0 ? void 0 : _a.scanCount) || 0) + 1; })];
                case 2: 
                // Increment counter on the QR code
                return [4 /*yield*/, _b.apply(_a, [(_c.scanCount = (_d.sent()),
                            _c.lastScannedAt = new Date(),
                            _c)])
                        .where((0, drizzle_orm_1.eq)(schema_1.smartQrcodes.id, qrcodeId))];
                case 3:
                    // Increment counter on the QR code
                    _d.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Get available templates list (for frontend display)
 */
function getQrcodeTemplates() {
    return Object.entries(exports.QRCODE_TEMPLATES).map(function (_a) {
        var id = _a[0], template = _a[1];
        return (__assign({ id: id }, template));
    });
}
