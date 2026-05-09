"use strict";
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
exports.normalizeAdminSetupPlan = normalizeAdminSetupPlan;
exports.mapAdminSetupStatusToCustomerReply = mapAdminSetupStatusToCustomerReply;
exports.classifyAdminConversationMode = classifyAdminConversationMode;
exports.openAssistedSetupRequest = openAssistedSetupRequest;
exports.getSetupRequestBundle = getSetupRequestBundle;
exports.analyzeSetupRequest = analyzeSetupRequest;
exports.chatSetupRequest = chatSetupRequest;
exports.approveSetupRequest = approveSetupRequest;
exports.executeSetupRequestCreation = executeSetupRequestCreation;
exports.sendSetupRequestResult = sendSetupRequestResult;
exports.getCustomerAssistedSetupStatusByPhone = getCustomerAssistedSetupStatusByPhone;
var storage_1 = require("./storage");
var llm_1 = require("./llm");
var autologinService_1 = require("./autologinService");
var DEFAULT_PLAN = {
    summary: "",
    pains: [],
    objectives: [],
    workflowKind: "normal",
    companyName: "",
    agentNameSuggestion: "Atendente",
    businessDescription: "",
    mainOffer: "",
    desiredBehavior: "",
    modules: [],
    mediaSuggestions: [],
    missingData: [],
    checklist: [],
    usesScheduling: null,
    restaurantOrderMode: null,
    workDays: [],
    workStartTime: null,
    workEndTime: null,
};
function extractJsonCandidate(raw) {
    var start = raw.indexOf("{");
    var end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start)
        return null;
    return raw.slice(start, end + 1);
}
function normalizeAdminSetupPlan(planLike) {
    var workflow = (planLike === null || planLike === void 0 ? void 0 : planLike.workflowKind) === "delivery" || (planLike === null || planLike === void 0 ? void 0 : planLike.workflowKind) === "agendamento"
        ? planLike.workflowKind
        : "normal";
    var modules = Array.isArray(planLike === null || planLike === void 0 ? void 0 : planLike.modules)
        ? planLike.modules.map(function (item) { return String(item || "").trim(); }).filter(Boolean)
        : [];
    var mediaSuggestions = Array.isArray(planLike === null || planLike === void 0 ? void 0 : planLike.mediaSuggestions)
        ? planLike.mediaSuggestions
            .map(function (item) { return ({
            name: String((item === null || item === void 0 ? void 0 : item.name) || "").trim(),
            type: (item === null || item === void 0 ? void 0 : item.type) === "audio" ||
                (item === null || item === void 0 ? void 0 : item.type) === "image" ||
                (item === null || item === void 0 ? void 0 : item.type) === "video" ||
                (item === null || item === void 0 ? void 0 : item.type) === "document" ||
                (item === null || item === void 0 ? void 0 : item.type) === "flow"
                ? item.type
                : "text",
            description: String((item === null || item === void 0 ? void 0 : item.description) || "").trim(),
            whenToUse: String((item === null || item === void 0 ? void 0 : item.whenToUse) || "").trim(),
        }); })
            .filter(function (item) { return item.name && item.description; })
            .map(function (item) { return (__assign(__assign({}, item), { type: item.type === "text" ? "document" : item.type })); })
        : [];
    var workDays = Array.isArray(planLike === null || planLike === void 0 ? void 0 : planLike.workDays)
        ? planLike.workDays
            .map(function (value) { return Number(value); })
            .filter(function (value) { return Number.isInteger(value) && value >= 0 && value <= 6; })
        : [];
    return __assign(__assign({}, DEFAULT_PLAN), { summary: String((planLike === null || planLike === void 0 ? void 0 : planLike.summary) || "").trim(), pains: Array.isArray(planLike === null || planLike === void 0 ? void 0 : planLike.pains) ? planLike.pains.map(function (item) { return String(item || "").trim(); }).filter(Boolean) : [], objectives: Array.isArray(planLike === null || planLike === void 0 ? void 0 : planLike.objectives) ? planLike.objectives.map(function (item) { return String(item || "").trim(); }).filter(Boolean) : [], workflowKind: workflow, companyName: String((planLike === null || planLike === void 0 ? void 0 : planLike.companyName) || "").trim(), agentNameSuggestion: String((planLike === null || planLike === void 0 ? void 0 : planLike.agentNameSuggestion) || "Atendente").trim() || "Atendente", businessDescription: String((planLike === null || planLike === void 0 ? void 0 : planLike.businessDescription) || "").trim(), mainOffer: String((planLike === null || planLike === void 0 ? void 0 : planLike.mainOffer) || "").trim(), desiredBehavior: String((planLike === null || planLike === void 0 ? void 0 : planLike.desiredBehavior) || "").trim(), modules: modules, mediaSuggestions: mediaSuggestions, missingData: Array.isArray(planLike === null || planLike === void 0 ? void 0 : planLike.missingData) ? planLike.missingData.map(function (item) { return String(item || "").trim(); }).filter(Boolean) : [], checklist: Array.isArray(planLike === null || planLike === void 0 ? void 0 : planLike.checklist) ? planLike.checklist.map(function (item) { return String(item || "").trim(); }).filter(Boolean) : [], usesScheduling: typeof (planLike === null || planLike === void 0 ? void 0 : planLike.usesScheduling) === "boolean" ? planLike.usesScheduling : workflow === "agendamento" ? true : null, restaurantOrderMode: (planLike === null || planLike === void 0 ? void 0 : planLike.restaurantOrderMode) === "full_order" || (planLike === null || planLike === void 0 ? void 0 : planLike.restaurantOrderMode) === "first_contact"
            ? planLike.restaurantOrderMode
            : null, workDays: workDays, workStartTime: String((planLike === null || planLike === void 0 ? void 0 : planLike.workStartTime) || "").trim() || null, workEndTime: String((planLike === null || planLike === void 0 ? void 0 : planLike.workEndTime) || "").trim() || null });
}
function buildRequestStatus(request) {
    if (!request)
        return "pending";
    return String(request.status || "open");
}
function mapAdminSetupStatusToCustomerReply(request) {
    var status = buildRequestStatus(request);
    if (status === "created") {
        return "Perfeito. Sua configuração já ficou pronta e está em validação final. Assim que eu liberar o acesso, te aviso aqui.";
    }
    if (status === "approved" || status === "executing") {
        return "Estou finalizando a sua configuração por aqui. Assim que terminar, eu te atualizo nesta conversa.";
    }
    if (status === "failed") {
        return "Estou revisando um detalhe da sua configuração por aqui. Assim que eu corrigir, eu te atualizo nesta conversa.";
    }
    return "Seu pedido de configuração assistida já está aberto. Um humano vai montar isso com você por aqui e eu te atualizo nesta conversa.";
}
function callJsonLlm(messages, maxTokens) {
    return __awaiter(this, void 0, void 0, function () {
        var client, response, raw, json, error_1;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, llm_1.getLLMClient)()];
                case 1:
                    client = _d.sent();
                    return [4 /*yield*/, client.chat.complete({
                            model: "mistral-small-latest",
                            messages: messages,
                            maxTokens: maxTokens,
                            temperature: 0.1,
                        })];
                case 2:
                    response = _d.sent();
                    raw = String(((_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || "");
                    json = extractJsonCandidate(raw);
                    if (!json)
                        return [2 /*return*/, null];
                    return [2 /*return*/, JSON.parse(json)];
                case 3:
                    error_1 = _d.sent();
                    console.warn("[ADMIN-SETUP] Falha ao interpretar JSON da LLM:", error_1);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function getConversationBundle(conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var conversation, messages;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.storage.getAdminConversation(conversationId)];
                case 1:
                    conversation = _a.sent();
                    if (!conversation) {
                        throw new Error("CONVERSATION_NOT_FOUND");
                    }
                    return [4 /*yield*/, storage_1.storage.getAdminMessages(conversationId)];
                case 2:
                    messages = _a.sent();
                    return [2 /*return*/, { conversation: conversation, messages: messages }];
            }
        });
    });
}
function summarizeConversationForLlm(messages) {
    return messages
        .slice(-80)
        .map(function (message) { return "".concat(message.fromMe ? "ASSISTENTE" : "CLIENTE", ": ").concat(String(message.text || message.mediaCaption || "").trim()); })
        .filter(Boolean)
        .join("\n");
}
function persistConversationSetupState(conversationId, requestId, status) {
    return __awaiter(this, void 0, void 0, function () {
        var conversation, nextContextState;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.storage.getAdminConversation(conversationId)];
                case 1:
                    conversation = _a.sent();
                    if (!conversation)
                        return [2 /*return*/];
                    nextContextState = __assign(__assign({}, (conversation.contextState || {})), { assistedSetupRequestId: requestId, assistedSetupStatus: status, assistedSetupLocked: true });
                    return [4 /*yield*/, storage_1.storage.updateAdminConversation(conversationId, {
                            contextState: nextContextState,
                        })];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function classifyAdminConversationMode(params) {
    return __awaiter(this, void 0, void 0, function () {
        var cleanMessage, recentHistory, parsed;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    cleanMessage = String(params.messageText || "").trim();
                    if (!cleanMessage) {
                        return [2 /*return*/, {
                                mode: "normal_sales",
                                confidence: 0,
                                reason: "Mensagem vazia",
                                requestedHelpLevel: "none",
                            }];
                    }
                    recentHistory = (params.session.conversationHistory || [])
                        .slice(-8)
                        .map(function (item) { return "".concat(item.role === "assistant" ? "ASSISTENTE" : "CLIENTE", ": ").concat(item.content); })
                        .join("\n");
                    return [4 /*yield*/, callJsonLlm([
                            {
                                role: "system",
                                content: "Voc\u00EA classifica o modo de uma conversa comercial da AgenteZap.\n\nRetorne SOMENTE JSON v\u00E1lido:\n{\"mode\":\"auto_self_serve|assisted_setup|human_support|normal_sales\",\"confidence\":0.0,\"reason\":\"...\",\"requestedHelpLevel\":\"explicit|none\"}\n\nRegras:\n- \"assisted_setup\" somente quando o cliente pedir explicitamente para voc\u00EAs configurarem por ele, disser que n\u00E3o consegue sozinho, ou pedir ajuda humana para montar.\n- \"auto_self_serve\" quando o cliente quiser testar, ver funcionando, criar a conta, receber link, simulador ou acessar o sistema por conta pr\u00F3pria.\n- \"human_support\" quando ele pedir falar com humano, liga\u00E7\u00E3o, call ou suporte humano.\n- \"normal_sales\" nos demais casos.\n\nNunca use \"assisted_setup\" s\u00F3 porque o cliente est\u00E1 com d\u00FAvida. Tem que haver pedido expl\u00EDcito de ajuda para configurar por ele.",
                            },
                            {
                                role: "user",
                                content: "Mensagem atual: ".concat(cleanMessage, "\n\nContexto:\n- flowState: ").concat(params.session.flowState || "onboarding", "\n- pendingAction: ").concat(((_a = params.session.pendingAction) === null || _a === void 0 ? void 0 : _a.type) || "nenhuma", "\n- temContaVinculada: ").concat(params.linkedContext.user ? "sim" : "nao", "\n- temAgenteConfigurado: ").concat(params.linkedContext.hasConfiguredAgent ? "sim" : "nao", "\n\nConversa recente:\n").concat(recentHistory || "sem histórico"),
                            },
                        ], 180)];
                case 1:
                    parsed = _b.sent();
                    if (!parsed) {
                        return [2 /*return*/, {
                                mode: "normal_sales",
                                confidence: 0,
                                reason: "Fallback seguro",
                                requestedHelpLevel: "none",
                            }];
                    }
                    return [2 /*return*/, {
                            mode: parsed.mode === "assisted_setup" ||
                                parsed.mode === "auto_self_serve" ||
                                parsed.mode === "human_support"
                                ? parsed.mode
                                : "normal_sales",
                            confidence: Number(parsed.confidence || 0),
                            reason: String(parsed.reason || "").trim(),
                            requestedHelpLevel: parsed.requestedHelpLevel === "explicit" ? "explicit" : "none",
                        }];
            }
        });
    });
}
function openAssistedSetupRequest(params) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, updated, created;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.storage.getAdminSetupRequestByConversationId(params.conversationId)];
                case 1:
                    existing = _a.sent();
                    if (!existing) return [3 /*break*/, 4];
                    return [4 /*yield*/, storage_1.storage.updateAdminSetupRequest(existing.id, {
                            status: "open",
                            requestMode: "assisted_setup",
                            analysisStatus: existing.analysisStatus || "pending",
                            approvalStatus: existing.approvalStatus || "pending",
                            executionStatus: existing.executionStatus || "pending",
                            lockedCustomerHandoff: true,
                            linkedUserId: params.linkedUserId || existing.linkedUserId || undefined,
                            conversationFacts: __assign(__assign({}, (existing.conversationFacts || {})), { openingReason: params.openingReason, openingCustomerMessage: params.customerMessage }),
                        })];
                case 2:
                    updated = _a.sent();
                    return [4 /*yield*/, persistConversationSetupState(params.conversationId, updated.id, updated.status)];
                case 3:
                    _a.sent();
                    return [2 /*return*/, updated];
                case 4: return [4 /*yield*/, storage_1.storage.createAdminSetupRequest({
                        conversationId: params.conversationId,
                        adminId: params.adminId,
                        status: "open",
                        requestMode: "assisted_setup",
                        analysisStatus: "pending",
                        approvalStatus: "pending",
                        executionStatus: "pending",
                        lockedCustomerHandoff: true,
                        linkedUserId: params.linkedUserId,
                        createdByAi: true,
                        conversationFacts: {
                            openingReason: params.openingReason,
                            openingCustomerMessage: params.customerMessage,
                        },
                        suggestedPlan: {},
                        refinedPlan: {},
                        executionResult: {},
                    })];
                case 5:
                    created = _a.sent();
                    return [4 /*yield*/, storage_1.storage.createAdminSetupRequestMessage({
                            requestId: created.id,
                            role: "assistant",
                            messageType: "system",
                            content: "Pedido assistido aberto automaticamente. Motivo: ".concat(params.openingReason || "pedido explícito do cliente", "."),
                            planSnapshot: {},
                            metadata: {
                                source: "customer_handoff",
                                customerMessage: params.customerMessage,
                            },
                            createdBy: "ai",
                        })];
                case 6:
                    _a.sent();
                    return [4 /*yield*/, persistConversationSetupState(params.conversationId, created.id, created.status)];
                case 7:
                    _a.sent();
                    return [2 /*return*/, created];
            }
        });
    });
}
function getSetupRequestBundle(conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var request, messages;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.storage.getAdminSetupRequestByConversationId(conversationId)];
                case 1:
                    request = _a.sent();
                    if (!request) {
                        return [2 /*return*/, { request: null, messages: [] }];
                    }
                    return [4 /*yield*/, storage_1.storage.getAdminSetupRequestMessages(request.id)];
                case 2:
                    messages = _a.sent();
                    return [2 /*return*/, { request: request, messages: messages }];
            }
        });
    });
}
function analyzeSetupRequest(params) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, conversation, messages, request, _b, conversationText, parsed, facts, plan, updated;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, getConversationBundle(params.conversationId)];
                case 1:
                    _a = _c.sent(), conversation = _a.conversation, messages = _a.messages;
                    return [4 /*yield*/, storage_1.storage.getAdminSetupRequestByConversationId(params.conversationId)];
                case 2:
                    _b = (_c.sent());
                    if (_b) return [3 /*break*/, 4];
                    return [4 /*yield*/, openAssistedSetupRequest({
                            conversationId: params.conversationId,
                            adminId: params.adminId,
                            linkedUserId: conversation.linkedUserId || undefined,
                            openingReason: "Análise manual iniciada no admin",
                            customerMessage: conversation.lastMessageText || "",
                        })];
                case 3:
                    _b = (_c.sent());
                    _c.label = 4;
                case 4:
                    request = _b;
                    return [4 /*yield*/, storage_1.storage.updateAdminSetupRequest(request.id, {
                            status: "analyzing",
                            analysisStatus: "running",
                            lockedCustomerHandoff: true,
                        })];
                case 5:
                    _c.sent();
                    conversationText = summarizeConversationForLlm(messages);
                    return [4 /*yield*/, callJsonLlm([
                            {
                                role: "system",
                                content: "Voc\u00EA analisa uma conversa de venda da AgenteZap e monta um plano inicial de configura\u00E7\u00E3o assistida.\n\nRetorne SOMENTE JSON v\u00E1lido:\n{\n  \"facts\": {\n    \"summary\": \"string\",\n    \"customerGoal\": \"string\",\n    \"objections\": [\"...\"],\n    \"customerAskedForHumanSetup\": true\n  },\n  \"plan\": {\n    \"summary\": \"string\",\n    \"pains\": [\"...\"],\n    \"objectives\": [\"...\"],\n    \"workflowKind\": \"delivery|agendamento|normal\",\n    \"companyName\": \"string\",\n    \"agentNameSuggestion\": \"string\",\n    \"businessDescription\": \"string\",\n    \"mainOffer\": \"string\",\n    \"desiredBehavior\": \"string\",\n    \"modules\": [\"crm\",\"kanban\",\"notificador\",\"delivery\",\"agendamento\",\"fluxos\",\"midias\"],\n    \"mediaSuggestions\": [{\"name\":\"string\",\"type\":\"audio|image|video|document|flow\",\"description\":\"string\",\"whenToUse\":\"string\"}],\n    \"missingData\": [\"...\"],\n    \"checklist\": [\"...\"],\n    \"usesScheduling\": true,\n    \"restaurantOrderMode\": \"full_order|first_contact|null\",\n    \"workDays\": [1,2,3,4,5],\n    \"workStartTime\": \"09:00\",\n    \"workEndTime\": \"18:00\"\n  }\n}\n\nUse apenas os dados que realmente aparecem na conversa. Se algo estiver faltando, deixe em missingData.",
                            },
                            {
                                role: "user",
                                content: "Conversa completa:\n".concat(conversationText || "sem mensagens", "\n\n\u00DAltima mensagem do cliente: ").concat(conversation.lastMessageText || "sem mensagem", "\nNome do contato: ").concat(conversation.contactName || "não informado"),
                            },
                        ], 1800)];
                case 6:
                    parsed = _c.sent();
                    facts = (parsed === null || parsed === void 0 ? void 0 : parsed.facts) && typeof parsed.facts === "object" ? parsed.facts : {};
                    plan = normalizeAdminSetupPlan((parsed === null || parsed === void 0 ? void 0 : parsed.plan) || {});
                    return [4 /*yield*/, storage_1.storage.updateAdminSetupRequest(request.id, {
                            status: "draft_ready",
                            analysisStatus: "done",
                            conversationFacts: facts,
                            suggestedPlan: plan,
                            refinedPlan: plan,
                        })];
                case 7:
                    updated = _c.sent();
                    return [4 /*yield*/, storage_1.storage.createAdminSetupRequestMessage({
                            requestId: request.id,
                            role: "assistant",
                            messageType: "analysis",
                            content: "Análise inicial concluída e plano sugerido atualizado.",
                            planSnapshot: plan,
                            metadata: {
                                facts: facts,
                            },
                            createdBy: "ai",
                        })];
                case 8:
                    _c.sent();
                    return [4 /*yield*/, persistConversationSetupState(params.conversationId, request.id, updated.status)];
                case 9:
                    _c.sent();
                    return [2 /*return*/, updated];
            }
        });
    });
}
function chatSetupRequest(params) {
    return __awaiter(this, void 0, void 0, function () {
        var bundle, request, conversationMessages, conversationText, priorMessages, currentPlan, parsed, updatedPlan, replyText, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getSetupRequestBundle(params.conversationId)];
                case 1:
                    bundle = _a.sent();
                    if (!bundle.request) {
                        throw new Error("SETUP_REQUEST_NOT_FOUND");
                    }
                    request = bundle.request;
                    return [4 /*yield*/, getConversationBundle(params.conversationId)];
                case 2:
                    conversationMessages = (_a.sent()).messages;
                    conversationText = summarizeConversationForLlm(conversationMessages);
                    priorMessages = bundle.messages
                        .slice(-10)
                        .map(function (item) { return "".concat(item.role === "assistant" ? "IA" : "DONO", ": ").concat(item.content); })
                        .join("\n");
                    currentPlan = normalizeAdminSetupPlan(request.refinedPlan || request.suggestedPlan || {});
                    return [4 /*yield*/, callJsonLlm([
                            {
                                role: "system",
                                content: "Voc\u00EA ajuda o dono da AgenteZap a refinar um plano de configura\u00E7\u00E3o assistida.\n\nRetorne SOMENTE JSON v\u00E1lido:\n{\n  \"replyText\": \"resposta curta para o dono\",\n  \"updatedPlan\": {\n    \"summary\": \"string\",\n    \"pains\": [\"...\"],\n    \"objectives\": [\"...\"],\n    \"workflowKind\": \"delivery|agendamento|normal\",\n    \"companyName\": \"string\",\n    \"agentNameSuggestion\": \"string\",\n    \"businessDescription\": \"string\",\n    \"mainOffer\": \"string\",\n    \"desiredBehavior\": \"string\",\n    \"modules\": [\"...\"],\n    \"mediaSuggestions\": [{\"name\":\"string\",\"type\":\"audio|image|video|document|flow\",\"description\":\"string\",\"whenToUse\":\"string\"}],\n    \"missingData\": [\"...\"],\n    \"checklist\": [\"...\"],\n    \"usesScheduling\": true,\n    \"restaurantOrderMode\": \"full_order|first_contact|null\",\n    \"workDays\": [1,2,3,4,5],\n    \"workStartTime\": \"09:00\",\n    \"workEndTime\": \"18:00\"\n  }\n}\n\nAtualize o plano apenas com base no pedido do dono e no hist\u00F3rico real.",
                            },
                            {
                                role: "user",
                                content: "Conversa com o cliente:\n".concat(conversationText || "sem mensagens", "\n\nPlano atual:\n").concat(JSON.stringify(currentPlan, null, 2), "\n\nHist\u00F3rico dono x IA:\n").concat(priorMessages || "sem histórico", "\n\nPedido novo do dono:\n").concat(params.message),
                            },
                        ], 2200)];
                case 3:
                    parsed = _a.sent();
                    updatedPlan = normalizeAdminSetupPlan((parsed === null || parsed === void 0 ? void 0 : parsed.updatedPlan) || currentPlan);
                    replyText = String((parsed === null || parsed === void 0 ? void 0 : parsed.replyText) || "Ajustei o plano com base no que você pediu.").trim();
                    return [4 /*yield*/, storage_1.storage.createAdminSetupRequestMessage({
                            requestId: request.id,
                            role: "user",
                            messageType: "chat",
                            content: params.message,
                            planSnapshot: currentPlan,
                            metadata: {},
                            createdBy: params.adminId,
                        })];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, storage_1.storage.updateAdminSetupRequest(request.id, {
                            status: "needs_admin_input",
                            refinedPlan: updatedPlan,
                        })];
                case 5:
                    updated = _a.sent();
                    return [4 /*yield*/, storage_1.storage.createAdminSetupRequestMessage({
                            requestId: request.id,
                            role: "assistant",
                            messageType: "chat",
                            content: replyText,
                            planSnapshot: updatedPlan,
                            metadata: {},
                            createdBy: "ai",
                        })];
                case 6:
                    _a.sent();
                    return [2 /*return*/, { request: updated, reply: replyText }];
            }
        });
    });
}
function approveSetupRequest(params) {
    return __awaiter(this, void 0, void 0, function () {
        var request, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.storage.getAdminSetupRequestByConversationId(params.conversationId)];
                case 1:
                    request = _a.sent();
                    if (!request) {
                        throw new Error("SETUP_REQUEST_NOT_FOUND");
                    }
                    return [4 /*yield*/, storage_1.storage.updateAdminSetupRequest(request.id, {
                            status: "approved",
                            approvalStatus: "approved",
                            approvedByAdmin: params.adminId,
                            approvedAt: new Date(),
                        })];
                case 2:
                    updated = _a.sent();
                    return [4 /*yield*/, storage_1.storage.createAdminSetupRequestMessage({
                            requestId: request.id,
                            role: "assistant",
                            messageType: "approval",
                            content: "Plano aprovado para execução automática.",
                            planSnapshot: normalizeAdminSetupPlan(updated.refinedPlan || updated.suggestedPlan || {}),
                            metadata: {},
                            createdBy: params.adminId,
                        })];
                case 3:
                    _a.sent();
                    return [2 /*return*/, updated];
            }
        });
    });
}
function mapWorkflowKindToSessionPlan(workflowKind) {
    if (workflowKind === "delivery") {
        return { workflowKind: "delivery", usesScheduling: false };
    }
    if (workflowKind === "agendamento") {
        return { workflowKind: "scheduling", usesScheduling: true };
    }
    return { workflowKind: "generic", usesScheduling: false };
}
function createExecutionSession(params) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, createClientSession, getClientSession, updateClientSession, session, mappedWorkflow;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./adminAgentService"); })];
                case 1:
                    _a = _b.sent(), createClientSession = _a.createClientSession, getClientSession = _a.getClientSession, updateClientSession = _a.updateClientSession;
                    session = getClientSession(params.phoneNumber);
                    if (!session) {
                        session = createClientSession(params.phoneNumber);
                    }
                    mappedWorkflow = mapWorkflowKindToSessionPlan(params.plan.workflowKind);
                    session = updateClientSession(params.phoneNumber, {
                        contactName: params.contactName || session.contactName,
                        flowState: "onboarding",
                        agentConfig: __assign(__assign({}, session.agentConfig), { company: params.plan.companyName, name: params.plan.agentNameSuggestion || "Atendente", role: params.plan.mainOffer || params.plan.businessDescription || "atendente virtual", prompt: params.plan.desiredBehavior || params.plan.summary || "Atenda com clareza e objetividade." }),
                        setupProfile: __assign(__assign({}, (session.setupProfile || {})), { questionStage: "ready", answeredBusiness: true, answeredBehavior: true, answeredWorkflow: true, businessSummary: params.plan.businessDescription || params.plan.summary, desiredAgentBehavior: params.plan.desiredBehavior || params.plan.summary, mainOffer: params.plan.mainOffer || undefined, workflowKind: mappedWorkflow.workflowKind, usesScheduling: mappedWorkflow.usesScheduling, restaurantOrderMode: params.plan.workflowKind === "delivery" ? params.plan.restaurantOrderMode || "first_contact" : undefined, workDays: params.plan.workDays.length > 0 ? params.plan.workDays : undefined, workStartTime: params.plan.workStartTime || undefined, workEndTime: params.plan.workEndTime || undefined, rawAnswers: {
                                q1: params.plan.businessDescription || params.plan.summary,
                                q2: params.plan.desiredBehavior || params.plan.summary,
                                q3: params.plan.workflowKind === "delivery"
                                    ? params.plan.restaurantOrderMode || "first_contact"
                                    : params.plan.workflowKind === "agendamento"
                                        ? "".concat(params.plan.workStartTime || "09:00", "-").concat(params.plan.workEndTime || "18:00")
                                        : "atendimento normal",
                            } }),
                    });
                    return [2 /*return*/, session];
            }
        });
    });
}
function executeSetupRequestCreation(params) {
    return __awaiter(this, void 0, void 0, function () {
        var request, conversation, plan, steps, session, _a, createTestAccountWithCredentials, getClientSession, getTestToken, createResult, refreshedSession, userId, _b, user, agentConfig, tokenInfo, panelUrl, executionResult, updated, error_2, failedStep, executionResult, updated;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, storage_1.storage.getAdminSetupRequestByConversationId(params.conversationId)];
                case 1:
                    request = _c.sent();
                    if (!request) {
                        throw new Error("SETUP_REQUEST_NOT_FOUND");
                    }
                    return [4 /*yield*/, getConversationBundle(params.conversationId)];
                case 2:
                    conversation = (_c.sent()).conversation;
                    plan = normalizeAdminSetupPlan(request.refinedPlan || request.suggestedPlan || {});
                    steps = [
                        { id: "create_or_reuse_user", status: "pending", detail: "Aguardando" },
                        { id: "resolve_business_mode", status: "pending", detail: "Aguardando" },
                        { id: "save_prompt_and_config", status: "pending", detail: "Aguardando" },
                        { id: "seed_delivery_or_scheduling_if_needed", status: "pending", detail: "Aguardando" },
                        { id: "create_test_access", status: "pending", detail: "Aguardando" },
                        { id: "validate_result", status: "pending", detail: "Aguardando" },
                    ];
                    return [4 /*yield*/, storage_1.storage.updateAdminSetupRequest(request.id, {
                            status: "executing",
                            executionStatus: "running",
                            lastError: null,
                        })];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4:
                    _c.trys.push([4, 11, , 14]);
                    return [4 /*yield*/, createExecutionSession({
                            phoneNumber: conversation.contactNumber,
                            plan: plan,
                            contactName: conversation.contactName,
                        })];
                case 5:
                    session = _c.sent();
                    steps[0] = { id: "create_or_reuse_user", status: "success", detail: "Sessão preparada para criação idempotente." };
                    steps[1] = {
                        id: "resolve_business_mode",
                        status: "success",
                        detail: "Modo operacional definido como ".concat(plan.workflowKind, "."),
                    };
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./adminAgentService"); })];
                case 6:
                    _a = _c.sent(), createTestAccountWithCredentials = _a.createTestAccountWithCredentials, getClientSession = _a.getClientSession, getTestToken = _a.getTestToken;
                    return [4 /*yield*/, createTestAccountWithCredentials(session)];
                case 7:
                    createResult = _c.sent();
                    if (!createResult.success || !createResult.email || !createResult.simulatorToken) {
                        throw new Error(createResult.error || "CREATE_TEST_ACCOUNT_FAILED");
                    }
                    steps[2] = { id: "save_prompt_and_config", status: "success", detail: "Prompt e configuração do agente salvos." };
                    steps[3] = {
                        id: "seed_delivery_or_scheduling_if_needed",
                        status: "success",
                        detail: plan.workflowKind === "normal"
                            ? "Sem seed estrutural extra para modo normal."
                            : "M\u00F3dulos estruturais aplicados para ".concat(plan.workflowKind, "."),
                    };
                    steps[4] = { id: "create_test_access", status: "success", detail: "Teste e credenciais gerados." };
                    refreshedSession = getClientSession(conversation.contactNumber);
                    userId = refreshedSession === null || refreshedSession === void 0 ? void 0 : refreshedSession.userId;
                    if (!userId) {
                        throw new Error("USER_ID_NOT_RESOLVED");
                    }
                    return [4 /*yield*/, Promise.all([
                            storage_1.storage.getUser(userId),
                            storage_1.storage.getAgentConfig(userId),
                            getTestToken(createResult.simulatorToken),
                            (0, autologinService_1.generateAutologinLink)(userId, "/meu-agente-ia"),
                        ])];
                case 8:
                    _b = _c.sent(), user = _b[0], agentConfig = _b[1], tokenInfo = _b[2], panelUrl = _b[3];
                    if (!user || !(agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.prompt) || !(tokenInfo === null || tokenInfo === void 0 ? void 0 : tokenInfo.token)) {
                        throw new Error("VALIDATION_FAILED");
                    }
                    steps[5] = { id: "validate_result", status: "success", detail: "Conta, prompt, token e auto-login validados." };
                    executionResult = {
                        success: true,
                        userId: userId,
                        email: createResult.email,
                        simulatorToken: createResult.simulatorToken,
                        simulatorUrl: "https://agentezap.online/test/".concat(createResult.simulatorToken),
                        panelUrl: panelUrl,
                        steps: steps,
                    };
                    return [4 /*yield*/, storage_1.storage.updateAdminSetupRequest(request.id, {
                            status: "created",
                            approvalStatus: "approved",
                            executionStatus: "done",
                            linkedUserId: userId,
                            createdTestToken: createResult.simulatorToken,
                            createdAutologinToken: panelUrl,
                            executionResult: executionResult,
                            completedAt: new Date(),
                        })];
                case 9:
                    updated = _c.sent();
                    return [4 /*yield*/, persistConversationSetupState(params.conversationId, request.id, updated.status)];
                case 10:
                    _c.sent();
                    return [2 /*return*/, updated];
                case 11:
                    error_2 = _c.sent();
                    failedStep = steps.find(function (step) { return step.status === "pending"; });
                    if (failedStep) {
                        failedStep.status = "failed";
                        failedStep.detail = (error_2 === null || error_2 === void 0 ? void 0 : error_2.message) || "Falha sem detalhe";
                    }
                    executionResult = {
                        success: false,
                        error: String((error_2 === null || error_2 === void 0 ? void 0 : error_2.message) || error_2),
                        steps: steps,
                    };
                    return [4 /*yield*/, storage_1.storage.updateAdminSetupRequest(request.id, {
                            status: "failed",
                            executionStatus: "failed",
                            lastError: String((error_2 === null || error_2 === void 0 ? void 0 : error_2.message) || error_2),
                            executionResult: executionResult,
                        })];
                case 12:
                    updated = _c.sent();
                    return [4 /*yield*/, persistConversationSetupState(params.conversationId, request.id, updated.status)];
                case 13:
                    _c.sent();
                    return [2 /*return*/, updated];
                case 14: return [2 /*return*/];
            }
        });
    });
}
function sendSetupRequestResult(params) {
    return __awaiter(this, void 0, void 0, function () {
        var request, executionResult, sendAdminConversationMessage, text, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.storage.getAdminSetupRequestByConversationId(params.conversationId)];
                case 1:
                    request = _a.sent();
                    if (!request) {
                        throw new Error("SETUP_REQUEST_NOT_FOUND");
                    }
                    executionResult = (request.executionResult || {});
                    if (!executionResult.success || !executionResult.simulatorUrl || !executionResult.panelUrl) {
                        throw new Error("SETUP_REQUEST_NOT_READY");
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./whatsapp"); })];
                case 2:
                    sendAdminConversationMessage = (_a.sent()).sendAdminConversationMessage;
                    text = "Perfeito. Sua configura\u00E7\u00E3o ficou pronta.\n\n" +
                        "Teste: ".concat(executionResult.simulatorUrl, "\n\n") +
                        "Painel: ".concat(executionResult.panelUrl, "\n\n") +
                        "Voc\u00EA tamb\u00E9m pode ajustar direto no sistema e conhecer CRM, Kanban, conversas, notificador inteligente, fluxos e a conex\u00E3o do WhatsApp.";
                    return [4 /*yield*/, sendAdminConversationMessage(params.adminId, params.conversationId, text)];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, storage_1.storage.updateAdminSetupRequest(request.id, {
                            status: "delivered",
                            executionResult: __assign(__assign({}, executionResult), { sentToCustomerAt: new Date().toISOString() }),
                        })];
                case 4:
                    updated = _a.sent();
                    return [4 /*yield*/, persistConversationSetupState(params.conversationId, request.id, updated.status)];
                case 5:
                    _a.sent();
                    return [2 /*return*/, updated];
            }
        });
    });
}
function getCustomerAssistedSetupStatusByPhone(phoneNumber) {
    return __awaiter(this, void 0, void 0, function () {
        var conversation, request;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.storage.getAdminConversationByPhone(String(phoneNumber || "").replace(/\D/g, ""))];
                case 1:
                    conversation = _a.sent();
                    if (!conversation) {
                        return [2 /*return*/, { request: null, reply: null }];
                    }
                    return [4 /*yield*/, storage_1.storage.getAdminSetupRequestByConversationId(conversation.id)];
                case 2:
                    request = _a.sent();
                    if (!request || request.lockedCustomerHandoff !== true) {
                        return [2 /*return*/, { request: null, reply: null }];
                    }
                    return [2 /*return*/, {
                            request: request,
                            reply: mapAdminSetupStatusToCustomerReply(request),
                        }];
            }
        });
    });
}
