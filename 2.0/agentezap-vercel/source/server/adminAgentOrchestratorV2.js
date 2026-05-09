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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processActiveClientMessage = processActiveClientMessage;
var llm_1 = require("./llm");
var adminPendingActionExecutor_1 = require("./adminPendingActionExecutor");
var storage_1 = require("./storage");
var promptHistoryService_1 = require("./promptHistoryService");
var db_1 = require("./db");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var adminPendingActionExecutionPolicy_1 = require("./adminPendingActionExecutionPolicy");
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Pattern helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Word-boundary safe patterns for intent parsing
var AFFIRMATIVE_PATTERNS = [
    /^\b(sim|pode|ok|s|y|yes)\b/i,
    /\b(confirmo|certo|vai|bora|feito|exato|perfeito|claro)\b/i,
    /^(com\s+certeza|tÃ¡\s+bom|beleza|blz)\b/i,
];
var NEGATIVE_PATTERNS = [
    /^\b(nÃ£o|nao|n|no)\b/i,
    /\b(cancela|para|esquece)\b/i,
    /^(deixa\s+(pra\s+lÃ¡|de)?)\b/i,
];
/**
 * Checks if text affirms a pending action using word-boundary matching to avoid
 * false positives from substring matches. Requires explicit standalone intent.
 */
function isAffirmative(text) {
    var norm = text.toLowerCase().trim();
    if (norm === 'poder' ||
        norm.startsWith('poder ') ||
        norm === 'pode' ||
        norm.startsWith('pode ') ||
        norm === 'pode sim' ||
        norm.startsWith('pode sim')) {
        return true;
    }
    return AFFIRMATIVE_PATTERNS.some(function (p) { return p.test(norm); });
}
/**
 * Checks if text negates a pending action using word-boundary matching to avoid
 * false positives from substring matches. Requires explicit standalone intent.
 */
function isNegative(text) {
    var norm = text.toLowerCase().trim();
    return NEGATIVE_PATTERNS.some(function (p) { return p.test(norm); });
}
function isTechnicalFailureMessage(text) {
    var normalized = String(text || '').toLowerCase();
    return (normalized.includes('erro desconhecido') ||
        normalized.includes('nÃ£o foi possÃ­vel') ||
        normalized.includes('nao foi possivel') ||
        normalized.includes('ocorreu um erro') ||
        normalized.includes('tente novamente'));
}
function buildSilentRetryReply(pendingAction) {
    switch (pendingAction.type) {
        case 'edit_prompt':
            return 'Estou concluindo esse ajuste aqui. Em instantes eu te confirmo como ficou.';
        case 'save_media':
            return 'Estou salvando essa mÃ­dia aqui. Em instantes eu te confirmo como ficou.';
        default:
            return 'Estou concluindo isso aqui. Em instantes eu te confirmo.';
    }
}
function waitBeforeRetry(delayMs) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delayMs); })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function executePendingActionWithSilentRetry(pendingAction, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var result, policy;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, adminPendingActionExecutor_1.executeActionWithTechnicalRetry)(pendingAction, userId)];
                case 1:
                    result = _a.sent();
                    if (result.success) {
                        return [2 /*return*/, { responseText: result.responseText }];
                    }
                    if (!result.lastFailureWasTechnical) {
                        return [2 /*return*/, { responseText: result.responseText }];
                    }
                    policy = (0, adminPendingActionExecutionPolicy_1.getPendingActionExecutionPolicy)(pendingAction.type);
                    return [2 /*return*/, {
                            responseText: (0, adminPendingActionExecutionPolicy_1.buildPendingActionRecoveryReply)(pendingAction.type),
                            keepPendingAction: __assign(__assign({}, pendingAction), { expiresAt: Date.now() + policy.keepPendingAliveMs }),
                        }];
            }
        });
    });
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// System prompt builder
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildOrchestratorSystemPrompt(userId, conversationHistory, mediaInfo, accountStatus, promptSummary, mediaLibrarySummary) {
    var historyCtx = conversationHistory.length > 0
        ? "\n\n\u00C3\u0161ltimas mensagens:\n".concat(conversationHistory
            .slice(-6)
            .map(function (m) { return "".concat(m.role === 'user' ? 'Cliente' : 'Assistente', ": ").concat(m.content); })
            .join('\n'))
        : '';
    var mediaCtx = mediaInfo ? "\n\nM\u00C3\u00ADdia recebida: ".concat(mediaInfo) : '';
    var accountCtx = accountStatus ? "\n\nStatus da conta: ".concat(accountStatus) : '';
    var promptCtx = promptSummary ? "\n\nPrompt atual (resumo): ".concat(promptSummary) : '';
    var mediaLibCtx = mediaLibrarySummary ? "\n\nBiblioteca de m\u00C3\u00ADdia: ".concat(mediaLibrarySummary) : '';
    return "Voc\u00C3\u00AA \u00C3\u00A9 o assistente de configura\u00C3\u00A7\u00C3\u00A3o do AgenteZap para o usu\u00C3\u00A1rio ".concat(userId, ".\nSeu objetivo \u00C3\u00A9 entender o que o usu\u00C3\u00A1rio quer fazer e retornar SOMENTE JSON v\u00C3\u00A1lido \u00E2\u20AC\u201D sem texto adicional.\n\nA\u00C3\u00A7\u00C3\u00B5es dispon\u00C3\u00ADveis:\n- EDITAR_PROMPT: editar o prompt do agente (par\u00C3\u00A2metro: descricaoMudanca)\n- SALVAR_MIDIA: salvar uma m\u00C3\u00ADdia na biblioteca (par\u00C3\u00A2metros: name, mediaUrl, mediaType, whenToUse, description)\n- GERAR_LINK_CONEXAO: gerar link de acesso direto ao painel de conex\u00C3\u00A3o\n- INFORMAR_PLANOS: informar os planos dispon\u00C3\u00ADveis e pre\u00C3\u00A7os\n- NENHUMA: resposta informativa, sem a\u00C3\u00A7\u00C3\u00A3o t\u00C3\u00A9cnica\n").concat(historyCtx).concat(mediaCtx).concat(accountCtx).concat(promptCtx).concat(mediaLibCtx, "\n\nResponda SEMPRE neste formato JSON exato (sem markdown, sem texto fora do JSON):\n{\n  \"resposta\": \"Mensagem amig\u00C3\u00A1vel para o usu\u00C3\u00A1rio\",\n  \"acao\": {\n    \"tipo\": \"NENHUMA\",\n    \"parametros\": {}\n  },\n  \"requerConfirmacao\": false\n}\n\nRegras:\n- Se a a\u00C3\u00A7\u00C3\u00A3o for destrutiva ou irrevers\u00C3\u00ADvel (editar prompt), defina requerConfirmacao=true\n- Receber \u00C3\u00A1udio, imagem, v\u00C3\u00ADdeo ou documento N\u00C3\u0192O significa pedido de cadastrar m\u00C3\u00ADdia. Por padr\u00C3\u00A3o, trate a m\u00C3\u00ADdia como o canal da conversa.\n- S\u00C3\u00B3 escolha SALVAR_MIDIA quando o cliente pedir explicitamente para cadastrar, adicionar, salvar ou fazer o agente usar aquele arquivo.\n- Se a m\u00C3\u00ADdia foi s\u00C3\u00B3 o meio pelo qual o cliente enviou a instru\u00C3\u00A7\u00C3\u00A3o, n\u00C3\u00A3o mencione o arquivo na resposta. Responda somente \u00C3\u00A0 inten\u00C3\u00A7\u00C3\u00A3o principal.\n- Para SALVAR_MIDIA: sempre defina requerConfirmacao=true antes de salvar, mesmo quando mediaUrl e whenToUse j\u00C3\u00A1 estiverem presentes.\n- Para GERAR_LINK_CONEXAO e INFORMAR_PLANOS, requerConfirmacao=false\n- Responda em portugu\u00C3\u00AAs brasileiro\n\nInstru\u00C3\u00A7\u00C3\u00B5es de tom e linguagem para o campo \"resposta\" (o que o cliente v\u00C3\u00AA):\n- Escreva como Rodrigo, Inteligencia Artificial da AgenteZap, com tom caloroso, natural, humano e empatico, sem soar robotico\n- Se houver nome do cliente no contexto, use esse nome com naturalidade na primeira resposta\n- Prefira respostas curtas e claras, como uma conversa real de WhatsApp\n- Se o cliente vier com uma duvida ou intencao especifica, responda isso primeiro antes de oferecer teste\n- Ofereca configurar o teste gratuito como ajuda opcional, nao como pressao\n- Evite comecar as respostas com \"nao\"; prefira linguagem positiva e leve\n- Adapte o tom ao contexto: seja acolhedor com clientes novos curiosos, prestativo com quem j\u00C3\u00A1 tem conta\n- Use linguagem natural do dia a dia, sem emojis, emoticons ou s\u00C3\u00ADmbolos decorativos\n- NUNCA use travess\u00C3\u00A3o ou em dash (\u00E2\u20AC\u201D) na resposta ao cliente; prefira v\u00C3\u00ADrgula, ponto, dois-pontos ou par\u00C3\u00AAnteses\n- NUNCA mencione termos t\u00C3\u00A9cnicos internos na resposta: JSON, a\u00C3\u00A7\u00C3\u00B5es, EDITAR_PROMPT, SALVAR_MIDIA, requerConfirmacao, par\u00C3\u00A2metros, etc.\n- Se o cliente mudar de assunto, acompanhe naturalmente \u00E2\u20AC\u201D n\u00C3\u00A3o reinicie o fluxo nem repita apresenta\u00C3\u00A7\u00C3\u00B5es\n- Se a inten\u00C3\u00A7\u00C3\u00A3o n\u00C3\u00A3o estiver clara, fa\u00C3\u00A7a UMA pergunta aberta e amig\u00C3\u00A1vel; evite listar op\u00C3\u00A7\u00C3\u00B5es como se fosse um menu\n- Se o cliente pedir suporte humano ou falar com uma pessoa, oriente a chamar no WhatsApp +5517991648288 e diga que basta tocar no numero e clicar em conversar\n- A resposta deve soar proxima, clara e interessada no sucesso do cliente");
}
var LLM_FALLBACK = {
    resposta: (0, adminPendingActionExecutionPolicy_1.buildGenericAssistantFallbackReply)(),
    acao: { tipo: 'NENHUMA', parametros: {} },
    requerConfirmacao: false,
};
function callOrchestratorLLM(messageText, systemPrompt, conversationHistory) {
    return __awaiter(this, void 0, void 0, function () {
        var historySlice, messages, response, raw, cleaned, parsed, e_1;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    historySlice = conversationHistory.slice(-20);
                    messages = __spreadArray(__spreadArray([
                        { role: 'system', content: systemPrompt }
                    ], historySlice.map(function (m) { return ({ role: m.role, content: m.content }); }), true), [
                        { role: 'user', content: messageText },
                    ], false);
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, llm_1.chatComplete)({ messages: messages, maxTokens: 800, temperature: 0.4 })];
                case 2:
                    response = _d.sent();
                    raw = ((_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
                    cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
                    parsed = JSON.parse(cleaned);
                    return [2 /*return*/, parsed];
                case 3:
                    e_1 = _d.sent();
                    console.error('[OrchestratorV2] JSON invÃ¡lido retornado pelo LLM:', e_1);
                    return [2 /*return*/, LLM_FALLBACK];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Mapping helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function mapLLMTypeToPendingActionType(llmTipo) {
    switch (llmTipo) {
        case 'EDITAR_PROMPT': return 'edit_prompt';
        case 'SALVAR_MIDIA': return 'save_media';
        case 'GERAR_LINK_CONEXAO': return 'GERAR_LINK_CONEXAO';
        case 'INFORMAR_PLANOS': return 'INFORMAR_PLANOS';
        default: return 'NENHUMA';
    }
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main export
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function processActiveClientMessage(phoneNumber, messageText, userId, conversationHistory, pendingAction, mediaType, mediaUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var result_1, mediaInfo, accountStatus, promptSummary, mediaLibrarySummary, subscription, e_2, versions, current, versionNumber, e_3, mediaRecords, names, e_4, systemPrompt, llmResult, actionTipo, actionParams, hasUrl, hasWhen, mappedType, newPendingAction, hasMediaUrl, hasWhenToUse, missing, ephemeralAction, result;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    console.log("[OrchestratorV2] Mensagem de ".concat(phoneNumber, ", pendingAction=").concat((_a = pendingAction === null || pendingAction === void 0 ? void 0 : pendingAction.type) !== null && _a !== void 0 ? _a : 'none'));
                    if (!pendingAction) return [3 /*break*/, 4];
                    if (!(pendingAction.expiresAt < Date.now())) return [3 /*break*/, 1];
                    console.log('[OrchestratorV2] pendingAction expirado â€” chamando LLM');
                    return [3 /*break*/, 4];
                case 1:
                    if (!isAffirmative(messageText)) return [3 /*break*/, 3];
                    console.log('[OrchestratorV2] ConfirmaÃ§Ã£o afirmativa â€” executando aÃ§Ã£o');
                    return [4 /*yield*/, executePendingActionWithSilentRetry(pendingAction, userId)];
                case 2:
                    result_1 = _d.sent();
                    return [2 /*return*/, {
                            responseText: result_1.responseText,
                            newPendingAction: result_1.keepPendingAction,
                        }];
                case 3:
                    // 1c. Negative cancellation
                    if (isNegative(messageText)) {
                        console.log('[OrchestratorV2] Cancelamento â€” descartando pendingAction');
                        return [2 /*return*/, { responseText: 'Ok, cancelei. Como posso ajudar?' }];
                    }
                    // 1d. Ambiguous â€” repeat confirmation question, keep pending action alive
                    console.log('[OrchestratorV2] Resposta ambÃ­gua â€” mantendo pendingAction e pedindo confirmaÃ§Ã£o');
                    return [2 /*return*/, {
                            responseText: "".concat(pendingAction.proposedText, "\n\nConfirma? (sim / n\u00C3\u00A3o)"),
                            newPendingAction: pendingAction,
                        }];
                case 4:
                    mediaInfo = mediaType && mediaUrl ? "".concat(mediaType, " \u00E2\u2020\u2019 ").concat(mediaUrl) : undefined;
                    _d.label = 5;
                case 5:
                    _d.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, storage_1.storage.getUserSubscription(userId)];
                case 6:
                    subscription = _d.sent();
                    if (subscription && subscription.plan) {
                        accountStatus = "".concat(subscription.plan.name || subscription.plan.planName || 'Ativo', " (ativo)");
                    }
                    return [3 /*break*/, 8];
                case 7:
                    e_2 = _d.sent();
                    console.warn('[OrchestratorV2] Erro ao buscar assinatura:', e_2);
                    return [3 /*break*/, 8];
                case 8:
                    _d.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, (0, promptHistoryService_1.listarVersoes)(userId)];
                case 9:
                    versions = _d.sent();
                    if (versions && versions.length > 0) {
                        current = versions.find(function (v) { return v.is_current; }) || versions[0];
                        versionNumber = current.version_number || versions.length;
                        promptSummary = "".concat(versions.length, " vers\u00C3\u00A3o").concat(versions.length > 1 ? 's' : '', " (v").concat(versionNumber, " atual)");
                    }
                    else {
                        promptSummary = 'Nenhuma versÃ£o registrada';
                    }
                    return [3 /*break*/, 11];
                case 10:
                    e_3 = _d.sent();
                    console.warn('[OrchestratorV2] Erro ao buscar versÃµes de prompt:', e_3);
                    return [3 /*break*/, 11];
                case 11:
                    _d.trys.push([11, 13, , 14]);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.agentMediaLibrary)
                            .where((0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.userId, userId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.agentMediaLibrary.id))
                            .limit(5)];
                case 12:
                    mediaRecords = _d.sent();
                    if (mediaRecords && mediaRecords.length > 0) {
                        names = mediaRecords.map(function (m) { return m.name; }).join(', ');
                        mediaLibrarySummary = "".concat(mediaRecords.length, " m\u00C3\u00ADdia").concat(mediaRecords.length > 1 ? 's' : '', " (").concat(names, ")");
                    }
                    else {
                        mediaLibrarySummary = 'Nenhuma mÃ­dia salva';
                    }
                    return [3 /*break*/, 14];
                case 13:
                    e_4 = _d.sent();
                    console.warn('[OrchestratorV2] Erro ao buscar biblioteca de mÃ­dia:', e_4);
                    return [3 /*break*/, 14];
                case 14:
                    systemPrompt = buildOrchestratorSystemPrompt(userId, conversationHistory, mediaInfo, accountStatus, promptSummary, mediaLibrarySummary);
                    return [4 /*yield*/, callOrchestratorLLM(messageText, systemPrompt, conversationHistory)];
                case 15:
                    llmResult = _d.sent();
                    actionTipo = ((_b = llmResult.acao) === null || _b === void 0 ? void 0 : _b.tipo) || 'NENHUMA';
                    actionParams = ((_c = llmResult.acao) === null || _c === void 0 ? void 0 : _c.parametros) || {};
                    console.log("[OrchestratorV2] LLM decidiu: tipo=\"".concat(actionTipo, "\", requerConfirmacao=").concat(llmResult.requerConfirmacao));
                    // Enrich media params with what was received in the message
                    if (actionTipo === 'SALVAR_MIDIA') {
                        if (mediaUrl)
                            actionParams.mediaUrl = actionParams.mediaUrl || mediaUrl;
                        if (mediaType)
                            actionParams.mediaType = actionParams.mediaType || mediaType;
                        hasUrl = String(actionParams.mediaUrl || actionParams.storageUrl || '').trim();
                        hasWhen = String(actionParams.whenToUse || '').trim();
                        if (hasUrl && hasWhen && llmResult.requerConfirmacao) {
                            console.log('[OrchestratorV2] SALVAR_MIDIA: mediaUrl + whenToUse presentes â€” forÃ§ando requerConfirmacao=false para execuÃ§Ã£o imediata');
                            llmResult.requerConfirmacao = false;
                        }
                    }
                    mappedType = mapLLMTypeToPendingActionType(actionTipo);
                    // â”€â”€ 2a. Action with confirmation required â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                    if (llmResult.requerConfirmacao) {
                        newPendingAction = {
                            type: mappedType,
                            payload: actionParams,
                            proposedText: llmResult.resposta,
                            expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
                        };
                        console.log("[OrchestratorV2] Criando pendingAction tipo=\"".concat(mappedType, "\", expira em 10min"));
                        return [2 /*return*/, { responseText: "".concat(llmResult.resposta, "\n\nConfirma? (sim / n\u00C3\u00A3o)"), newPendingAction: newPendingAction }];
                    }
                    // â”€â”€ 2b. No action â€” return LLM response text directly â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                    if (actionTipo === 'NENHUMA') {
                        return [2 /*return*/, { responseText: llmResult.resposta }];
                    }
                    // â”€â”€ 2c. Execute action immediately (no confirmation needed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                    // Guard: for SALVAR_MIDIA, both mediaUrl and whenToUse must be present
                    if (actionTipo === 'SALVAR_MIDIA') {
                        hasMediaUrl = String(actionParams.mediaUrl || actionParams.storageUrl || '').trim();
                        hasWhenToUse = String(actionParams.whenToUse || '').trim();
                        if (!hasMediaUrl || !hasWhenToUse) {
                            console.log('[OrchestratorV2] SALVAR_MIDIA bloqueado: faltam mediaUrl ou whenToUse');
                            missing = [];
                            if (!hasMediaUrl)
                                missing.push('a URL/localizaÃ§Ã£o da mÃ­dia');
                            if (!hasWhenToUse)
                                missing.push('o contexto de quando usar');
                            return [2 /*return*/, {
                                    responseText: "\u00E2\u0161\u00A0\u00EF\u00B8\u008F Para salvar a m\u00C3\u00ADdia corretamente, preciso que voc\u00C3\u00AA me diga ".concat(missing.join(' e '), ". Pode detalhar?"),
                                }];
                        }
                    }
                    ephemeralAction = {
                        type: mappedType,
                        payload: actionParams,
                        proposedText: llmResult.resposta,
                        expiresAt: Date.now() + 60000, // not persisted, but set a safe expiry
                    };
                    return [4 /*yield*/, (0, adminPendingActionExecutor_1.executeActionWithTechnicalRetry)(ephemeralAction, userId)];
                case 16:
                    result = _d.sent();
                    if (!result.success && result.lastFailureWasTechnical) {
                        return [2 /*return*/, { responseText: (0, adminPendingActionExecutionPolicy_1.buildPendingActionRecoveryReply)(ephemeralAction.type) }];
                    }
                    return [2 /*return*/, { responseText: result.responseText }];
            }
        });
    });
}
