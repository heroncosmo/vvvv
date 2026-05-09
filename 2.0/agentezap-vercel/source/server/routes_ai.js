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
exports.registerAIRoutes = registerAIRoutes;
var supabaseAuth_1 = require("./supabaseAuth");
var db_1 = require("./db");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
// ============================================================================
// ROTAS DE IA PARA AGENDAMENTO DE MENSAGENS
// ============================================================================
function registerAIRoutes(app) {
    var _this = this;
    /**
     * POST /api/ai/generate-message
     * Gerar uma mensagem com base em uma mensagem base e contexto
     */
    app.post("/api/ai/generate-message", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var _a, conversationId, baseMessage, context, conversationContext, conversation, fullContext, MistralClient, mistral, response, generatedMessage, error_1;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 5, , 6]);
                    _a = req.body, conversationId = _a.conversationId, baseMessage = _a.baseMessage, context = _a.context;
                    // Validação
                    if (!baseMessage || typeof baseMessage !== 'string') {
                        return [2 /*return*/, res.status(400).json({ message: "baseMessage (string) é obrigatório" })];
                    }
                    conversationContext = "";
                    if (!conversationId) return [3 /*break*/, 2];
                    return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.conversations.id, conversationId)
                        })];
                case 1:
                    conversation = _d.sent();
                    if (conversation) {
                        conversationContext = "\n            Nome: ".concat(conversation.contactName || 'Não informado', "\n            Telefone: ").concat(conversation.contactNumber || 'Não informado', "\n            \u00DAltima mensagem: ").concat(conversation.lastMessageText || 'Nenhuma', "\n          ");
                    }
                    _d.label = 2;
                case 2:
                    fullContext = "\n        Contexto: ".concat(context || 'Agendamento de mensagem', "\n        Informa\u00E7\u00F5es do cliente:\n        ").concat(conversationContext, "\n        Mensagem base para melhoria:\n        ").concat(baseMessage, "\n      ");
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./mistralClient"); })];
                case 3:
                    MistralClient = (_d.sent()).MistralClient;
                    mistral = new MistralClient();
                    return [4 /*yield*/, mistral.chat.completions.create({
                            model: "mistral-large-latest",
                            messages: [
                                {
                                    role: "system",
                                    content: "Você é um assistente de atendimento ao cliente profissional. Melhore a mensagem base para torná-la mais clara, educada e eficaz, mantendo o tom original. Seja conciso e direto."
                                },
                                {
                                    role: "user",
                                    content: fullContext
                                }
                            ],
                            max_tokens: 500,
                            temperature: 0.7
                        })];
                case 4:
                    response = _d.sent();
                    generatedMessage = ((_c = (_b = response.choices[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || baseMessage;
                    res.json({
                        generatedMessage: generatedMessage,
                        originalMessage: baseMessage,
                        model: "mistral-large-latest"
                    });
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _d.sent();
                    console.error("Erro ao gerar mensagem com IA:", error_1);
                    res.status(500).json({
                        message: "Erro ao gerar mensagem com IA",
                        error: error_1.message
                    });
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    }); });
    /**
     * POST /api/user/ai/generate-message
     * Versão para usuários regulares autenticados (isAuthenticated)
     */
    app.post("/api/user/ai/generate-message", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var _a, conversationId, baseMessage, context, conversationContext, conversation, fullContext, MistralClient, mistral, response, generatedMessage, error_2;
        var _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _f.trys.push([0, 5, , 6]);
                    _a = req.body, conversationId = _a.conversationId, baseMessage = _a.baseMessage, context = _a.context;
                    if (!baseMessage || typeof baseMessage !== 'string') {
                        return [2 /*return*/, res.status(400).json({ message: "baseMessage (string) é obrigatório" })];
                    }
                    conversationContext = "";
                    if (!conversationId) return [3 /*break*/, 2];
                    return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.conversations.id, conversationId)
                        })];
                case 1:
                    conversation = _f.sent();
                    if (conversation) {
                        conversationContext = "\n            Nome: ".concat(conversation.contactName || 'Não informado', "\n            Telefone: ").concat(conversation.contactNumber || 'Não informado', "\n            \u00DAltima mensagem: ").concat(conversation.lastMessageText || 'Nenhuma', "\n          ");
                    }
                    _f.label = 2;
                case 2:
                    fullContext = "\n        Contexto: ".concat(context || 'Agendamento de mensagem', "\n        Informa\u00E7\u00F5es do cliente:\n        ").concat(conversationContext, "\n        Mensagem base para melhoria:\n        ").concat(baseMessage, "\n      ");
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./mistralClient"); })];
                case 3:
                    MistralClient = (_f.sent()).MistralClient;
                    mistral = new MistralClient();
                    return [4 /*yield*/, mistral.chat.completions.create({
                            model: "mistral-large-latest",
                            messages: [
                                {
                                    role: "system",
                                    content: "Você é um assistente de atendimento ao cliente profissional. Melhore a mensagem base para torná-la mais clara, educada e eficaz, mantendo o tom original. Seja conciso e direto."
                                },
                                {
                                    role: "user",
                                    content: fullContext
                                }
                            ],
                            max_tokens: 500,
                            temperature: 0.7
                        })];
                case 4:
                    response = _f.sent();
                    generatedMessage = ((_c = (_b = response.choices[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || baseMessage;
                    res.json({
                        generatedMessage: generatedMessage,
                        originalMessage: baseMessage,
                        model: "mistral-large-latest"
                    });
                    return [3 /*break*/, 6];
                case 5:
                    error_2 = _f.sent();
                    console.error("Erro ao gerar mensagem com IA (user):", error_2);
                    // Fallback: return original message if AI fails
                    res.json({
                        generatedMessage: ((_d = req.body) === null || _d === void 0 ? void 0 : _d.baseMessage) || "",
                        originalMessage: ((_e = req.body) === null || _e === void 0 ? void 0 : _e.baseMessage) || "",
                        model: "fallback"
                    });
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    }); });
    console.log("✅ [AI ROUTES] Rotas de IA registradas");
}
