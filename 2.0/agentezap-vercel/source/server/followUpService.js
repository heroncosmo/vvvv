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
exports.parseScheduleFromText = exports.scheduleContact = exports.cancelFollowUp = exports.scheduleAutoFollowUp = exports.followUpService = exports.FollowUpService = void 0;
exports.registerFollowUpCallback = registerFollowUpCallback;
exports.registerScheduledContactCallback = registerScheduledContactCallback;
exports.setMockFollowUpFunctions = setMockFollowUpFunctions;
var db_1 = require("./db");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var llm_1 = require("./llm");
var adminFollowupMigrationService_1 = require("./adminFollowupMigrationService");
var adminConversationAutomationState_1 = require("./adminConversationAutomationState");
// ============================================================================
// CONFIGURAÇÕES
// ============================================================================
function getEffectiveConversationConfig(conversation, globalConfig) {
    var normalizedGlobal = (0, adminFollowupMigrationService_1.normalizeAdminFollowupConfig)(globalConfig);
    var currentConversationConfig = conversation.followupConfig || null;
    if (!currentConversationConfig || (0, adminFollowupMigrationService_1.isLegacyAdminFollowupConfig)(currentConversationConfig)) {
        return normalizedGlobal;
    }
    return (0, adminFollowupMigrationService_1.normalizeAdminFollowupConfig)(__assign(__assign({}, normalizedGlobal), currentConversationConfig));
}
var SAO_PAULO_UTC_OFFSET_MINUTES = -3 * 60;
function getSaoPauloParts(reference) {
    var localMs = reference.getTime() + SAO_PAULO_UTC_OFFSET_MINUTES * 60 * 1000;
    var localDate = new Date(localMs);
    return {
        year: localDate.getUTCFullYear(),
        month: localDate.getUTCMonth(),
        day: localDate.getUTCDate(),
        weekday: localDate.getUTCDay(),
        hours: localDate.getUTCHours(),
        minutes: localDate.getUTCMinutes(),
    };
}
function buildUtcFromSaoPauloParts(year, month, day, hours, minutes) {
    return new Date(Date.UTC(year, month, day, hours, minutes) - SAO_PAULO_UTC_OFFSET_MINUTES * 60 * 1000);
}
function getMinutesOfDay(timeValue, fallbackHours, fallbackMinutes) {
    if (!timeValue || typeof timeValue !== "string") {
        return fallbackHours * 60 + fallbackMinutes;
    }
    var _a = timeValue.split(":"), rawHours = _a[0], rawMinutes = _a[1];
    var hours = Number(rawHours);
    var minutes = Number(rawMinutes);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return fallbackHours * 60 + fallbackMinutes;
    }
    return Math.max(0, Math.min(23, hours)) * 60 + Math.max(0, Math.min(59, minutes));
}
function isWithinBusinessHours(config, reference) {
    if (reference === void 0) { reference = new Date(); }
    var normalized = (0, adminFollowupMigrationService_1.normalizeAdminFollowupConfig)(config);
    if (normalized.respectBusinessHours === false)
        return true;
    var parts = getSaoPauloParts(reference);
    var currentMinutes = parts.hours * 60 + parts.minutes;
    var businessStart = getMinutesOfDay(normalized.businessHoursStart, 9, 0);
    var businessEnd = getMinutesOfDay(normalized.businessHoursEnd, 18, 0);
    return normalized.businessDays.includes(parts.weekday) &&
        currentMinutes >= businessStart &&
        currentMinutes < businessEnd;
}
function getNextBusinessTime(config, reference) {
    if (reference === void 0) { reference = new Date(); }
    var normalized = (0, adminFollowupMigrationService_1.normalizeAdminFollowupConfig)(config);
    if (normalized.respectBusinessHours === false)
        return reference;
    var businessStart = getMinutesOfDay(normalized.businessHoursStart, 9, 0);
    for (var dayOffset = 0; dayOffset < 8; dayOffset += 1) {
        var candidateUtc = new Date(reference.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        var candidateParts = getSaoPauloParts(candidateUtc);
        if (!normalized.businessDays.includes(candidateParts.weekday)) {
            continue;
        }
        if (dayOffset === 0) {
            var currentMinutes = candidateParts.hours * 60 + candidateParts.minutes;
            if (currentMinutes < businessStart) {
                return buildUtcFromSaoPauloParts(candidateParts.year, candidateParts.month, candidateParts.day, Math.floor(businessStart / 60), businessStart % 60);
            }
            if (isWithinBusinessHours(normalized, reference)) {
                return reference;
            }
        }
        return buildUtcFromSaoPauloParts(candidateParts.year, candidateParts.month, candidateParts.day, Math.floor(businessStart / 60), businessStart % 60);
    }
    return reference;
}
function alignToBusinessHours(candidate, config) {
    if (isWithinBusinessHours(config, candidate)) {
        return candidate;
    }
    return getNextBusinessTime(config, candidate);
}
function isValidDate(value) {
    return value instanceof Date && Number.isFinite(value.getTime());
}
function buildDelayDateFromNow(delayMinutes) {
    if (!Number.isFinite(delayMinutes) || delayMinutes <= 0) {
        return null;
    }
    var candidate = new Date(Date.now() + delayMinutes * 60 * 1000);
    return isValidDate(candidate) ? candidate : null;
}
function extractFirstJsonObject(rawContent) {
    if (!rawContent || typeof rawContent !== "string") {
        return null;
    }
    var content = rawContent.trim();
    var start = content.indexOf("{");
    if (start < 0) {
        return null;
    }
    var depth = 0;
    var inString = false;
    var escaped = false;
    for (var index = start; index < content.length; index += 1) {
        var char = content[index];
        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === "\\") {
                escaped = true;
                continue;
            }
            if (char === "\"") {
                inString = false;
            }
            continue;
        }
        if (char === "\"") {
            inString = true;
            continue;
        }
        if (char === "{") {
            depth += 1;
            continue;
        }
        if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return content.slice(start, index + 1);
            }
        }
    }
    return null;
}
var FollowUpService = /** @class */ (function () {
    function FollowUpService() {
        this.checkInterval = null;
        this.isRunning = false;
        // Prevent overlapping cycles (timer overlap can spam leads)
        this.isProcessingCycle = false;
        this.onFollowUpReady = null;
        this.onScheduledContactReady = null;
    }
    FollowUpService.prototype.start = function () {
        var _this = this;
        if (this.isRunning)
            return;
        this.isRunning = true;
        console.log("🚀 [FOLLOW-UP] Serviço iniciado");
        // Verificar a cada 5 minutos (otimizado para reduzir carga no DB)
        this.checkInterval = setInterval(function () { return _this.processFollowUps(); }, 5 * 60 * 1000);
        // Aguardar 30s antes da primeira execução para não sobrecarregar na inicialização
        setTimeout(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.repairMissingSchedules()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.processFollowUps()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }, 30 * 1000);
    };
    FollowUpService.prototype.stop = function () {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.isRunning = false;
        console.log("🛑 [FOLLOW-UP] Serviço parado");
    };
    FollowUpService.prototype.registerFollowUpCallback = function (callback) {
        this.onFollowUpReady = callback;
        console.log("📲 [FOLLOW-UP] Callback registrado");
    };
    FollowUpService.prototype.registerScheduledContactCallback = function (callback) {
        this.onScheduledContactReady = callback;
        console.log("📲 [AGENDAMENTO] Callback registrado");
    };
    /**
     * Processa conversas pendentes de follow-up
     */
    FollowUpService.prototype.processFollowUps = function () {
        return __awaiter(this, void 0, void 0, function () {
            var globalConfig, now, pendingConversations, _i, pendingConversations_1, conv, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.isProcessingCycle) {
                            console.log("⏭️ [FOLLOW-UP] Verificação anterior ainda em execução, pulando ciclo para evitar duplicatas");
                            return [2 /*return*/];
                        }
                        this.isProcessingCycle = true;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 8, 9, 10]);
                        return [4 /*yield*/, (0, adminFollowupMigrationService_1.getAdminFollowupGlobalConfig)()];
                    case 2:
                        globalConfig = _a.sent();
                        if (!globalConfig.isEnabled) {
                            console.log("🛑 [FOLLOW-UP] Follow-up global DESATIVADO na config do admin. Pulando ciclo.");
                            return [2 /*return*/];
                        }
                        now = new Date();
                        return [4 /*yield*/, db_1.db.query.adminConversations.findMany({
                                where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.followupActive, true), (0, drizzle_orm_1.lte)(schema_1.adminConversations.nextFollowupAt, now))
                            })];
                    case 3:
                        pendingConversations = _a.sent();
                        if (pendingConversations.length > 0) {
                            console.log("\uD83D\uDD0D [FOLLOW-UP] Encontradas ".concat(pendingConversations.length, " conversas para processar"));
                        }
                        _i = 0, pendingConversations_1 = pendingConversations;
                        _a.label = 4;
                    case 4:
                        if (!(_i < pendingConversations_1.length)) return [3 /*break*/, 7];
                        conv = pendingConversations_1[_i];
                        return [4 /*yield*/, this.executeFollowUp(conv)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6:
                        _i++;
                        return [3 /*break*/, 4];
                    case 7: return [3 /*break*/, 10];
                    case 8:
                        error_1 = _a.sent();
                        console.error("❌ [FOLLOW-UP] Erro ao processar follow-ups:", error_1);
                        return [3 /*break*/, 10];
                    case 9:
                        this.isProcessingCycle = false;
                        return [7 /*endfinally*/];
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Executa a lógica de follow-up para uma conversa específica
     */
    FollowUpService.prototype.executeFollowUp = function (conversation) {
        return __awaiter(this, void 0, void 0, function () {
            var globalConfig, effectiveConfig, followupForNonPayers, paymentStatus, recent, ageMs, cooldownMs, cooldownErr_1, nextBusinessTime, decision, attempt, type, result, wasSuccessful, logError_1, retryDelayMinutes, error_2;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        console.log("\uD83D\uDC49 [FOLLOW-UP] Processando ".concat(conversation.contactNumber, " (Est\u00E1gio ").concat(conversation.followupStage, ")"));
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 39, , 40]);
                        return [4 /*yield*/, (0, adminFollowupMigrationService_1.getAdminFollowupGlobalConfig)()];
                    case 2:
                        globalConfig = _c.sent();
                        effectiveConfig = getEffectiveConversationConfig(conversation, globalConfig);
                        followupForNonPayers = (_a = conversation.followupForNonPayers) !== null && _a !== void 0 ? _a : true;
                        paymentStatus = (_b = conversation.paymentStatus) !== null && _b !== void 0 ? _b : 'pending';
                        if (!(paymentStatus === 'paid')) return [3 /*break*/, 5];
                        console.log("\uD83D\uDED1 [FOLLOW-UP] Client already paid. Skipping.");
                        return [4 /*yield*/, this.logFollowUp(conversation.id, conversation.contactNumber, 'skipped', 'Client already paid', undefined, 'paid', 'paid', conversation.followupStage || 0)];
                    case 3:
                        _c.sent();
                        return [4 /*yield*/, this.disableFollowUp(conversation.id, "Cliente já pagou")];
                    case 4:
                        _c.sent();
                        return [2 /*return*/];
                    case 5:
                        if (!(!globalConfig.followupNonPayersEnabled && paymentStatus === 'unpaid')) return [3 /*break*/, 8];
                        console.log("\uD83D\uDED1 [FOLLOW-UP] Follow-up para n\u00E3o pagantes DESATIVADO globalmente. Pulando ".concat(conversation.contactNumber));
                        return [4 /*yield*/, this.logFollowUp(conversation.id, conversation.contactNumber, 'skipped', 'Follow-up não pagantes desativado', undefined, paymentStatus, 'non_payer', conversation.followupStage || 0)];
                    case 6:
                        _c.sent();
                        return [4 /*yield*/, this.scheduleNextFollowUp(conversation, 24 * 60)];
                    case 7:
                        _c.sent(); // Reagendar para checar amanhã
                        return [2 /*return*/];
                    case 8:
                        if (!(!followupForNonPayers && (paymentStatus === 'unpaid' || paymentStatus === 'pending'))) return [3 /*break*/, 10];
                        console.log("\uD83D\uDED1 [FOLLOW-UP] Follow-up para n\u00E3o pagantes desativado nesta conversa. Pulando ".concat(conversation.contactNumber));
                        return [4 /*yield*/, this.logFollowUp(conversation.id, conversation.contactNumber, 'skipped', 'Follow-up não pagantes desativado nesta conversa', undefined, paymentStatus, 'non_payer', conversation.followupStage || 0)];
                    case 9:
                        _c.sent();
                        return [2 /*return*/];
                    case 10:
                        _c.trys.push([10, 14, , 15]);
                        return [4 /*yield*/, db_1.db.query.followupLogs.findFirst({
                                where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.followupLogs.conversationId, conversation.id), (0, drizzle_orm_1.eq)(schema_1.followupLogs.status, 'sent')),
                                orderBy: function (logs, _a) {
                                    var desc = _a.desc;
                                    return [desc(logs.executedAt)];
                                },
                            })];
                    case 11:
                        recent = _c.sent();
                        if (!(recent === null || recent === void 0 ? void 0 : recent.executedAt)) return [3 /*break*/, 13];
                        ageMs = Date.now() - new Date(recent.executedAt).getTime();
                        cooldownMs = 7 * 60 * 1000;
                        if (!(Number.isFinite(ageMs) && ageMs >= 0 && ageMs < cooldownMs)) return [3 /*break*/, 13];
                        console.log("??? [FOLLOW-UP] Cooldown ativo (".concat(Math.round(ageMs / 1000), "s) para ").concat(conversation.contactNumber, ", evitando spam"));
                        return [4 /*yield*/, this.scheduleNextFollowUp(conversation, 30)];
                    case 12:
                        _c.sent();
                        return [2 /*return*/];
                    case 13: return [3 /*break*/, 15];
                    case 14:
                        cooldownErr_1 = _c.sent();
                        console.warn('?? [FOLLOW-UP] Falha ao checar cooldown, continuando:', cooldownErr_1);
                        return [3 /*break*/, 15];
                    case 15:
                        if (!!conversation.followupActive) return [3 /*break*/, 17];
                        console.log("\uD83D\uDED1 [FOLLOW-UP] Follow-up desativado para ".concat(conversation.contactNumber, ". Cancelando."));
                        return [4 /*yield*/, this.disableFollowUp(conversation.id, "Follow-up desativado manualmente")];
                    case 16:
                        _c.sent();
                        return [2 /*return*/];
                    case 17:
                        if (!!isWithinBusinessHours(effectiveConfig, new Date())) return [3 /*break*/, 19];
                        nextBusinessTime = getNextBusinessTime(effectiveConfig, new Date());
                        console.log("\u00E2\u008F\u00B0 [FOLLOW-UP] Fora do hor\u00C3\u00A1rio configurado para ".concat(conversation.contactNumber, ". Reagendando para ").concat(nextBusinessTime.toISOString()));
                        return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                                .set({ nextFollowupAt: nextBusinessTime, updatedAt: new Date() })
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversation.id))];
                    case 18:
                        _c.sent();
                        return [2 /*return*/];
                    case 19: return [4 /*yield*/, this.analyzeWithAI(conversation)];
                    case 20:
                        decision = _c.sent();
                        if (!(decision.action === 'abort')) return [3 /*break*/, 22];
                        console.log("\uD83D\uDED1 [FOLLOW-UP] Abortado pela IA para ".concat(conversation.contactNumber, ": ").concat(decision.reason));
                        return [4 /*yield*/, this.disableFollowUp(conversation.id)];
                    case 21:
                        _c.sent();
                        return [2 /*return*/];
                    case 22:
                        if (!(decision.action === 'wait')) return [3 /*break*/, 24];
                        console.log("\u23F3 [FOLLOW-UP] IA sugeriu esperar para ".concat(conversation.contactNumber, ": ").concat(decision.reason));
                        // Adiar por 24h ou conforme sugerido (simplificado para 24h aqui)
                        return [4 /*yield*/, this.scheduleNextFollowUp(conversation, 24 * 60)];
                    case 23:
                        // Adiar por 24h ou conforme sugerido (simplificado para 24h aqui)
                        _c.sent();
                        return [2 /*return*/];
                    case 24:
                        if (!(decision.action === 'send')) return [3 /*break*/, 38];
                        if (!this.onFollowUpReady) return [3 /*break*/, 37];
                        console.log("\uD83D\uDCE4 [FOLLOW-UP] Disparando callback para ".concat(conversation.contactNumber));
                        attempt = (conversation.followupStage || 0) + 1;
                        type = attempt >= effectiveConfig.intervalsMinutes.length ? 'final' : 'reminder';
                        return [4 /*yield*/, this.onFollowUpReady(conversation.contactNumber, decision.context || "Follow-up automático", attempt, type)];
                    case 25:
                        result = _c.sent();
                        wasSuccessful = !!(result && typeof result === 'object' && result.success);
                        _c.label = 26;
                    case 26:
                        _c.trys.push([26, 31, , 32]);
                        if (!(result && typeof result === 'object')) return [3 /*break*/, 28];
                        return [4 /*yield*/, this.logFollowUp(conversation.id, conversation.contactNumber, result.success ? 'sent' : 'failed', result.message, result.error, paymentStatus, type, attempt)];
                    case 27:
                        _c.sent();
                        return [3 /*break*/, 30];
                    case 28: 
                    // Fallback for void return (backward compatibility)
                    return [4 /*yield*/, this.logFollowUp(conversation.id, conversation.contactNumber, 'sent', 'Mensagem enviada (conteúdo não capturado)', undefined, paymentStatus, type, attempt)];
                    case 29:
                        // Fallback for void return (backward compatibility)
                        _c.sent();
                        _c.label = 30;
                    case 30: return [3 /*break*/, 32];
                    case 31:
                        logError_1 = _c.sent();
                        console.error("Erro ao logar follow-up:", logError_1);
                        return [3 /*break*/, 32];
                    case 32:
                        if (!wasSuccessful) return [3 /*break*/, 34];
                        return [4 /*yield*/, this.scheduleNextFollowUp(conversation)];
                    case 33:
                        _c.sent();
                        return [3 /*break*/, 36];
                    case 34:
                        retryDelayMinutes = effectiveConfig.intervalsMinutes[Math.max(0, conversation.followupStage || 0)]
                            || effectiveConfig.intervalsMinutes[0]
                            || adminFollowupMigrationService_1.LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG.intervalsMinutes[0];
                        return [4 /*yield*/, this.scheduleNextFollowUp(conversation, retryDelayMinutes)];
                    case 35:
                        _c.sent();
                        _c.label = 36;
                    case 36: return [3 /*break*/, 38];
                    case 37:
                        console.warn("⚠️ [FOLLOW-UP] Callback não registrado! Mensagem não enviada.");
                        _c.label = 38;
                    case 38: return [3 /*break*/, 40];
                    case 39:
                        error_2 = _c.sent();
                        console.error("\u274C [FOLLOW-UP] Erro ao executar para ".concat(conversation.contactNumber, ":"), error_2);
                        return [3 /*break*/, 40];
                    case 40: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Enhanced log function with payment status and follow-up type
     */
    FollowUpService.prototype.logFollowUp = function (conversationId, contactNumber, status, messageContent, errorReason, paymentStatus, followupType, stage) {
        return __awaiter(this, void 0, void 0, function () {
            var logError_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.insert(schema_1.followupLogs).values({
                                conversationId: conversationId,
                                contactNumber: contactNumber,
                                status: status,
                                messageContent: messageContent,
                                errorReason: errorReason,
                                paymentStatus: paymentStatus,
                                followupType: followupType,
                                stage: stage,
                            })];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        logError_2 = _a.sent();
                        console.error("Erro ao logar follow-up:", logError_2);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Usa IA para analisar se deve enviar follow-up
     */
    FollowUpService.prototype.analyzeWithAI = function (conversation) {
        return __awaiter(this, void 0, void 0, function () {
            var seededLead, messages, lastMessages, prompt, buildTechnicalFallback, parseDecision, mistral, response, content, e_1;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        seededLead = ((_a = conversation.contextState) === null || _a === void 0 ? void 0 : _a.seededLead) || null;
                        return [4 /*yield*/, db_1.db.query.adminMessages.findMany({
                                where: (0, drizzle_orm_1.eq)(schema_1.adminMessages.conversationId, conversation.id),
                                orderBy: function (adminMessages, _a) {
                                    var asc = _a.asc;
                                    return [asc(adminMessages.timestamp)];
                                },
                                limit: 20
                            })];
                    case 1:
                        messages = _e.sent();
                        if (messages.length === 0 && seededLead) {
                            return [2 /*return*/, {
                                    action: 'send',
                                    reason: 'Contato criou conta no sistema, mas ainda não teve conversa útil no WhatsApp.',
                                    context: "O cliente criou conta no AgenteZap, ainda não assinou e não há histórico de WhatsApp. Faça um primeiro follow-up curto, consultivo e humano, como lead que já demonstrou interesse ao criar a conta.",
                                }];
                        }
                        lastMessages = messages.map(function (m) { return ({
                            role: m.fromMe ? "assistant" : "user",
                            content: m.text || (m.mediaType ? "[M\u00EDdia: ".concat(m.mediaType, "]") : "")
                        }); });
                        prompt = "\n      Analise esta conversa de vendas e decida o pr\u00F3ximo passo para o sistema de follow-up autom\u00E1tico.\n      \n      Contexto:\n      - O cliente parou de responder.\n      - Estamos no est\u00E1gio ".concat(conversation.followupStage, " de follow-up.\n      - Objetivo: Reengajar o cliente para fechar a venda.\n      \n      Hist\u00F3rico recente:\n      ").concat(JSON.stringify(lastMessages, null, 2), "\n      \n      Regras de Decis\u00E3o CR\u00CDTICAS:\n      1. ABORT ('abort'): \n         - Se o cliente J\u00C1 FECHOU/CONTRATOU (ex: \"j\u00E1 paguei\", \"fechado\", \"contratado\").\n         - Se o cliente disse explicitamente \"n\u00E3o tenho interesse\", \"pare de mandar mensagem\".\n      \n      2. WAIT ('wait'): \n         - Se o cliente est\u00E1 AGUARDANDO UMA RESPOSTA NOSSA (ex: fez uma pergunta e n\u00E3o respondemos ainda).\n         - Se o cliente disse \"vou ver e te aviso\", \"falo com voc\u00EA amanh\u00E3\".\n      \n      3. SEND ('send'): \n         - Se o cliente simplesmente parou de responder e faz sentido tentar reengajar.\n         - Se o cliente n\u00E3o fechou e n\u00E3o estamos devendo resposta.\n      \n      Responda APENAS um JSON:\n      {\n        \"action\": \"send\" | \"wait\" | \"abort\",\n        \"reason\": \"breve explica\u00E7\u00E3o\",\n        \"context\": \"dicas para a mensagem de follow-up (ex: focar em benef\u00EDcios, perguntar se ficou d\u00FAvida)\"\n      }\n    ");
                        buildTechnicalFallback = function (reason) {
                            var lastMessage = messages[messages.length - 1] || null;
                            var lastCustomerMessage = __spreadArray([], messages, true).reverse().find(function (message) { return !message.fromMe; }) || null;
                            if (!lastMessage || lastMessage.fromMe || !lastCustomerMessage) {
                                return {
                                    action: 'send',
                                    reason: reason,
                                    context: "Retome a conversa com naturalidade, reconhecendo a pausa e oferecendo ajuda objetiva para avancar.",
                                };
                            }
                            return {
                                action: 'wait',
                                reason: reason,
                                context: "A ultima mensagem foi do cliente. Aguarde ou priorize resposta manual antes de novo follow-up.",
                            };
                        };
                        parseDecision = function (rawContent) {
                            var content = typeof rawContent === "string" ? rawContent.trim() : "";
                            if (!content) {
                                console.warn("[FOLLOW-UP] Resposta vazia da IA para ".concat(conversation.contactNumber, ". Usando fallback tecnico."));
                                return buildTechnicalFallback("Fallback tecnico: resposta vazia da IA");
                            }
                            var jsonBlock = extractFirstJsonObject(content);
                            if (!jsonBlock) {
                                console.warn("[FOLLOW-UP] IA respondeu sem JSON valido para ".concat(conversation.contactNumber, ". Usando fallback tecnico."));
                                return buildTechnicalFallback("Fallback tecnico: IA nao retornou JSON valido");
                            }
                            try {
                                var parsed = JSON.parse(jsonBlock);
                                var action = parsed === null || parsed === void 0 ? void 0 : parsed.action;
                                if (action !== 'send' && action !== 'wait' && action !== 'abort') {
                                    console.warn("[FOLLOW-UP] IA retornou action invalida para ".concat(conversation.contactNumber, ": ").concat(String(action)));
                                    return buildTechnicalFallback("Fallback tecnico: acao invalida na resposta da IA");
                                }
                                return {
                                    action: action,
                                    reason: typeof (parsed === null || parsed === void 0 ? void 0 : parsed.reason) === "string" && parsed.reason.trim()
                                        ? parsed.reason.trim()
                                        : "Decisao automatica do follow-up",
                                    context: typeof (parsed === null || parsed === void 0 ? void 0 : parsed.context) === "string" && parsed.context.trim()
                                        ? parsed.context.trim()
                                        : undefined,
                                };
                            }
                            catch (error) {
                                console.warn("[FOLLOW-UP] Falha ao interpretar JSON da IA para ".concat(conversation.contactNumber, ". Usando fallback tecnico."), error);
                                return buildTechnicalFallback("Fallback tecnico: erro ao interpretar JSON da IA");
                            }
                        };
                        _e.label = 2;
                    case 2:
                        _e.trys.push([2, 5, , 6]);
                        return [4 /*yield*/, (0, llm_1.getLLMClient)()];
                    case 3:
                        mistral = _e.sent();
                        return [4 /*yield*/, mistral.chat.complete({
                                messages: [{ role: "user", content: prompt }]
                            })];
                    case 4:
                        response = _e.sent();
                        content = ((_d = (_c = (_b = response.choices) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content) || "";
                        return [2 /*return*/, parseDecision(content)];
                    case 5:
                        e_1 = _e.sent();
                        console.error("Erro na análise de IA:", e_1);
                        return [2 /*return*/, buildTechnicalFallback("Fallback tecnico: erro na analise da IA")];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Agenda o próximo follow-up ou finaliza se acabou a sequência
     * Uses configurable periodicity from global admin config and conversation config
     */
    FollowUpService.prototype.scheduleNextFollowUp = function (conversation, customDelayMinutes) {
        return __awaiter(this, void 0, void 0, function () {
            var currentStage, nextStage, globalConfig, convConfig, finalMinDays, finalMaxDays, lastConfiguredStage, customBaseDate, nextDate, safeMinDays, safeMaxDays, range, randomDelay, nextDate, delayMinutes, baseDate, nextDate;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        currentStage = conversation.followupStage || 0;
                        nextStage = currentStage + 1;
                        return [4 /*yield*/, (0, adminFollowupMigrationService_1.getAdminFollowupGlobalConfig)()];
                    case 1:
                        globalConfig = _e.sent();
                        convConfig = getEffectiveConversationConfig(conversation, globalConfig);
                        finalMinDays = (_b = (_a = globalConfig.infiniteLoopMinDays) !== null && _a !== void 0 ? _a : convConfig.finalMinDays) !== null && _b !== void 0 ? _b : 15;
                        finalMaxDays = (_d = (_c = globalConfig.infiniteLoopMaxDays) !== null && _c !== void 0 ? _c : convConfig.finalMaxDays) !== null && _d !== void 0 ? _d : 30;
                        lastConfiguredStage = Math.max(0, convConfig.intervalsMinutes.length - 1);
                        if (!(typeof customDelayMinutes === "number")) return [3 /*break*/, 3];
                        customBaseDate = buildDelayDateFromNow(customDelayMinutes);
                        if (!customBaseDate) {
                            throw new Error("[FOLLOW-UP] Delay customizado inv\u00E1lido para ".concat(conversation.contactNumber, ": ").concat(String(customDelayMinutes)));
                        }
                        nextDate = alignToBusinessHours(customBaseDate, convConfig);
                        if (!isValidDate(nextDate)) {
                            throw new Error("[FOLLOW-UP] Data inv\u00E1lida ao reagendar customizado para ".concat(conversation.contactNumber));
                        }
                        return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                                .set({ nextFollowupAt: nextDate, updatedAt: new Date() })
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversation.id))];
                    case 2:
                        _e.sent();
                        return [2 /*return*/];
                    case 3:
                        if (!(nextStage > lastConfiguredStage)) return [3 /*break*/, 5];
                        safeMinDays = Math.max(1, Number(finalMinDays) || 15);
                        safeMaxDays = Math.max(safeMinDays, Number(finalMaxDays) || safeMinDays);
                        range = Math.max(0, safeMaxDays - safeMinDays);
                        randomDelay = Math.floor(Math.random() * (range + 1) + safeMinDays);
                        nextDate = alignToBusinessHours(new Date(Date.now() + randomDelay * 24 * 60 * 60 * 1000), convConfig);
                        if (!isValidDate(nextDate)) {
                            throw new Error("[FOLLOW-UP] Data inv\u00E1lida ao reagendar loop infinito para ".concat(conversation.contactNumber));
                        }
                        console.log("\uD83D\uDD04 [FOLLOW-UP] Ciclo infinito: Agendando pr\u00F3ximo para daqui a ".concat(randomDelay, " dias (config: ").concat(safeMinDays, "-").concat(safeMaxDays, "d)"));
                        return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                                .set({
                                followupStage: nextStage, // Continua incrementando para saber quantas vezes já tentou
                                nextFollowupAt: nextDate,
                                updatedAt: new Date()
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversation.id))];
                    case 4:
                        _e.sent();
                        return [3 /*break*/, 7];
                    case 5:
                        delayMinutes = convConfig.intervalsMinutes[nextStage];
                        baseDate = buildDelayDateFromNow(delayMinutes);
                        if (!baseDate) {
                            throw new Error("[FOLLOW-UP] Intervalo inv\u00E1lido no est\u00E1gio ".concat(nextStage, " para ").concat(conversation.contactNumber, ": ").concat(String(delayMinutes)));
                        }
                        nextDate = alignToBusinessHours(baseDate, convConfig);
                        if (!isValidDate(nextDate)) {
                            throw new Error("[FOLLOW-UP] Data inv\u00E1lida ao reagendar est\u00E1gio ".concat(nextStage, " para ").concat(conversation.contactNumber));
                        }
                        return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                                .set({
                                followupStage: nextStage,
                                nextFollowupAt: nextDate,
                                updatedAt: new Date()
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversation.id))];
                    case 6:
                        _e.sent();
                        _e.label = 7;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Desativa o follow-up para uma conversa
     */
    FollowUpService.prototype.disableFollowUp = function (conversationId_1) {
        return __awaiter(this, arguments, void 0, function (conversationId, reason) {
            var conversation;
            if (reason === void 0) { reason = "Cancelado manualmente"; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("\uD83D\uDED1 [FOLLOW-UP] Desativando follow-up para conversa ".concat(conversationId, ". Motivo: ").concat(reason));
                        return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                                where: (0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversationId)
                            })];
                    case 1:
                        conversation = _a.sent();
                        if (!conversation) return [3 /*break*/, 4];
                        // Force update regardless of current state to ensure it sticks
                        return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                                .set({
                                followupActive: false,
                                nextFollowupAt: null,
                                followupStage: 0 // Reset stage too just in case
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversationId))];
                    case 2:
                        // Force update regardless of current state to ensure it sticks
                        _a.sent();
                        console.log("\u2705 [FOLLOW-UP] Sucesso ao desativar follow-up para ".concat(conversation.contactNumber, ". Active: ").concat(conversation.followupActive));
                        // Log cancellation with payment status
                        return [4 /*yield*/, this.logFollowUp(conversation.id, conversation.contactNumber, 'cancelled', reason, undefined, conversation.paymentStatus || 'pending', 'cancelled', conversation.followupStage || 0)];
                    case 3:
                        // Log cancellation with payment status
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        console.warn("\u26A0\uFE0F [FOLLOW-UP] Falha ao desativar: Conversa ".concat(conversationId, " n\u00E3o encontrada ou update falhou."));
                        _a.label = 5;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Inicia o ciclo de follow-up para uma nova conversa (ou reinicia)
     */
    FollowUpService.prototype.scheduleInitialFollowUp = function (conversationId_1) {
        return __awaiter(this, arguments, void 0, function (conversationId, options) {
            var existing, hasScheduledFollowup, globalConfig, effectiveConfig, delayMinutes, nextDate;
            var _a;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversationId)
                        })];
                    case 1:
                        existing = _b.sent();
                        hasScheduledFollowup = Boolean((existing === null || existing === void 0 ? void 0 : existing.followupActive) && (existing === null || existing === void 0 ? void 0 : existing.nextFollowupAt));
                        if (!(0, adminConversationAutomationState_1.shouldAutoRescheduleAdminFollowup)({
                            conversation: existing,
                            forceRestart: options.forceRestart,
                            allowManualResume: options.allowManualResume,
                            hasScheduledFollowup: hasScheduledFollowup,
                        })) {
                            if (((_a = existing === null || existing === void 0 ? void 0 : existing.contextState) === null || _a === void 0 ? void 0 : _a.manualFollowupPause) === true) {
                                console.log("\uD83D\uDED1 [FOLLOW-UP] Conversa ".concat(conversationId, " com follow-up pausado manualmente. N\u00E3o reativando automaticamente."));
                                return [2 /*return*/];
                            }
                            console.log("\u2139\uFE0F [FOLLOW-UP] Follow-up j\u00E1 ativo para ".concat(conversationId, " (stage=").concat(existing.followupStage, ", next=").concat(new Date(existing.nextFollowupAt).toLocaleString(), "). N\u00C3O resetando."));
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, (0, adminFollowupMigrationService_1.getAdminFollowupGlobalConfig)()];
                    case 2:
                        globalConfig = _b.sent();
                        effectiveConfig = getEffectiveConversationConfig(existing || {
                            followupConfig: adminFollowupMigrationService_1.LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG,
                        }, globalConfig);
                        delayMinutes = effectiveConfig.intervalsMinutes[0] || adminFollowupMigrationService_1.LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG.intervalsMinutes[0];
                        nextDate = alignToBusinessHours(new Date(Date.now() + delayMinutes * 60 * 1000), effectiveConfig);
                        return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                                .set({
                                followupActive: true,
                                followupStage: 0,
                                nextFollowupAt: nextDate,
                                updatedAt: new Date()
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversationId))];
                    case 3:
                        _b.sent();
                        if (options.forceRestart && (existing === null || existing === void 0 ? void 0 : existing.nextFollowupAt)) {
                            console.log("[FOLLOW-UP] Ciclo reiniciado para conversa ".concat(conversationId, " em ").concat(delayMinutes, " min"));
                            return [2 /*return*/];
                        }
                        console.log("\u2705 [FOLLOW-UP] Agendado inicial para conversa ".concat(conversationId, " em ").concat(delayMinutes, " min"));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Helper para agendar pelo telefone (busca a conversa mais recente)
     */
    FollowUpService.prototype.scheduleInitialFollowUpByPhone = function (phoneNumber_1) {
        return __awaiter(this, arguments, void 0, function (phoneNumber, options) {
            var conversation;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.adminConversations.contactNumber, phoneNumber),
                            orderBy: function (adminConversations, _a) {
                                var desc = _a.desc;
                                return [desc(adminConversations.lastMessageTime)];
                            }
                        })];
                    case 1:
                        conversation = _a.sent();
                        if (!conversation) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.scheduleInitialFollowUp(conversation.id, options)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        console.warn("\u26A0\uFE0F [FOLLOW-UP] Conversa n\u00E3o encontrada para ".concat(phoneNumber, " ao tentar agendar follow-up inicial"));
                        _a.label = 4;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Agenda follow-up com delay customizado (solicitado pela IA via [FOLLOWUP:tempo="X"])
     * Ignora follow-up já ativo — a IA pediu explicitamente, então respeita o delay.
     */
    FollowUpService.prototype.scheduleCustomFollowUpByPhone = function (phoneNumber, delayMinutes, motivo) {
        return __awaiter(this, void 0, void 0, function () {
            var conversation, globalConfig, effectiveConfig, nextDate;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.adminConversations.contactNumber, phoneNumber),
                            orderBy: function (adminConversations, _a) {
                                var desc = _a.desc;
                                return [desc(adminConversations.lastMessageTime)];
                            }
                        })];
                    case 1:
                        conversation = _a.sent();
                        if (!conversation) {
                            console.warn("\u26A0\uFE0F [FOLLOW-UP] Conversa n\u00E3o encontrada para ".concat(phoneNumber, " ao tentar agendar follow-up customizado"));
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, (0, adminFollowupMigrationService_1.getAdminFollowupGlobalConfig)()];
                    case 2:
                        globalConfig = _a.sent();
                        effectiveConfig = getEffectiveConversationConfig(conversation, globalConfig);
                        nextDate = alignToBusinessHours(new Date(Date.now() + delayMinutes * 60 * 1000), effectiveConfig);
                        return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                                .set({
                                followupActive: true,
                                followupStage: 0,
                                nextFollowupAt: nextDate,
                                updatedAt: new Date()
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversation.id))];
                    case 3:
                        _a.sent();
                        console.log("\uD83C\uDFAF [FOLLOW-UP] Agendado PROATIVO para ".concat(phoneNumber, " em ").concat(delayMinutes, "min. Motivo: ").concat(motivo || 'IA solicitou', ". Pr\u00F3ximo: ").concat(nextDate.toLocaleString()));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Cancela follow-up ativo para um telefone (MANUALMENTE)
     */
    FollowUpService.prototype.cancelFollowUpByPhone = function (phoneNumber) {
        return __awaiter(this, void 0, void 0, function () {
            var conversation;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.adminConversations.contactNumber, phoneNumber)
                        })];
                    case 1:
                        conversation = _a.sent();
                        if (!conversation) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.disableFollowUp(conversation.id, "Cancelado pelo usuário")];
                    case 2:
                        _a.sent();
                        console.log("\uD83D\uDED1 [FOLLOW-UP] Cancelado manualmente para ".concat(phoneNumber));
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Reseta ciclo quando cliente responde
     */
    FollowUpService.prototype.resetFollowUpCycle = function (phoneNumber) {
        return __awaiter(this, void 0, void 0, function () {
            var conversation, globalConfig, effectiveConfig, delayMinutes, nextDate;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.adminConversations.contactNumber, phoneNumber),
                            orderBy: function (adminConversations, _a) {
                                var desc = _a.desc;
                                return [desc(adminConversations.lastMessageTime)];
                            },
                        })];
                    case 1:
                        conversation = _a.sent();
                        if (!conversation) {
                            console.warn("\u00E2\u0161\u00A0\u00EF\u00B8\u008F [FOLLOW-UP] Conversa n\u00C3\u00A3o encontrada para ".concat(phoneNumber, " ao tentar resetar ciclo"));
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, (0, adminFollowupMigrationService_1.getAdminFollowupGlobalConfig)()];
                    case 2:
                        globalConfig = _a.sent();
                        effectiveConfig = getEffectiveConversationConfig(conversation, globalConfig);
                        delayMinutes = effectiveConfig.intervalsMinutes[0] || adminFollowupMigrationService_1.LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG.intervalsMinutes[0];
                        nextDate = alignToBusinessHours(new Date(Date.now() + delayMinutes * 60 * 1000), effectiveConfig);
                        return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                                .set({
                                followupActive: true,
                                followupStage: 0,
                                nextFollowupAt: nextDate,
                                updatedAt: new Date()
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.contactNumber, phoneNumber))];
                    case 3:
                        _a.sent();
                        console.log("\uD83D\uDD04 [FOLLOW-UP] Cliente respondeu. Ciclo resetado para ".concat(delayMinutes, "min (Est\u00E1gio 0) para ").concat(phoneNumber));
                        return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================================
    // GETTERS PARA O CALENDÁRIO
    // ============================================================================
    /**
     * Busca logs de follow-up
     */
    FollowUpService.prototype.getFollowUpLogs = function (status) {
        return __awaiter(this, void 0, void 0, function () {
            var whereClause;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        whereClause = status ? (0, drizzle_orm_1.eq)(schema_1.followupLogs.status, status) : undefined;
                        return [4 /*yield*/, db_1.db.query.followupLogs.findMany({
                                where: whereClause,
                                orderBy: function (followupLogs, _a) {
                                    var desc = _a.desc;
                                    return [desc(followupLogs.executedAt)];
                                },
                                limit: 100
                            })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Retorna eventos para o calendário (follow-ups futuros)
     */
    FollowUpService.prototype.getCalendarEvents = function () {
        return __awaiter(this, void 0, void 0, function () {
            var now, activeFollowUps, validFollowUps;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        now = new Date();
                        return [4 /*yield*/, db_1.db.query.adminConversations.findMany({
                                where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.followupActive, true), 
                                // Trazer apenas os futuros ou atrasados (não nulos)
                                (0, drizzle_orm_1.lte)(schema_1.adminConversations.nextFollowupAt, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)) // Próximos 30 dias
                                )
                            })];
                    case 1:
                        activeFollowUps = _a.sent();
                        validFollowUps = activeFollowUps.filter(function (c) { return c.followupActive === true; });
                        return [2 /*return*/, validFollowUps.map(function (conv) { return ({
                                id: conv.id, // Use ID directly for easier deletion
                                phoneNumber: conv.contactNumber,
                                type: 'followup',
                                title: "Follow-up #".concat((conv.followupStage || 0) + 1),
                                scheduledAt: conv.nextFollowupAt,
                                status: conv.nextFollowupAt && conv.nextFollowupAt < now ? 'overdue' : 'pending',
                                attempt: (conv.followupStage || 0) + 1,
                                metadata: {
                                    conversationId: conv.id,
                                    stage: conv.followupStage
                                }
                            }); })];
                }
            });
        });
    };
    /**
     * Retorna estatísticas para o dashboard
     */
    FollowUpService.prototype.getFollowUpStats = function () {
        return __awaiter(this, void 0, void 0, function () {
            var now, today, nextWeek, events, stats;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        now = new Date();
                        today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
                        return [4 /*yield*/, this.getCalendarEvents()];
                    case 1:
                        events = _a.sent();
                        stats = {
                            pending: events.filter(function (e) { return e.status === 'pending' || e.status === 'overdue'; }).length,
                            scheduledToday: events.filter(function (e) {
                                return e.scheduledAt &&
                                    new Date(e.scheduledAt) >= today &&
                                    new Date(e.scheduledAt) < new Date(today.getTime() + 24 * 60 * 60 * 1000);
                            }).length,
                            scheduledThisWeek: events.filter(function (e) {
                                return e.scheduledAt &&
                                    new Date(e.scheduledAt) >= today &&
                                    new Date(e.scheduledAt) < nextWeek;
                            }).length,
                            byType: {},
                        };
                        events.forEach(function (e) {
                            stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;
                        });
                        return [2 /*return*/, stats];
                }
            });
        });
    };
    FollowUpService.prototype.getConversationSignals = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, latestSentLog, latestOutboundMessage;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, Promise.all([
                            db_1.db.query.followupLogs.findFirst({
                                where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.followupLogs.conversationId, conversationId), (0, drizzle_orm_1.eq)(schema_1.followupLogs.status, "sent")),
                                orderBy: function (table, _a) {
                                    var desc = _a.desc;
                                    return [desc(table.executedAt), desc(table.id)];
                                },
                            }),
                            db_1.db.query.adminMessages.findFirst({
                                where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminMessages.conversationId, conversationId), (0, drizzle_orm_1.eq)(schema_1.adminMessages.fromMe, true)),
                                orderBy: function (table, _a) {
                                    var desc = _a.desc;
                                    return [desc(table.timestamp), desc(table.id)];
                                },
                            }),
                        ])];
                    case 1:
                        _a = _b.sent(), latestSentLog = _a[0], latestOutboundMessage = _a[1];
                        return [2 /*return*/, { latestSentLog: latestSentLog, latestOutboundMessage: latestOutboundMessage }];
                }
            });
        });
    };
    FollowUpService.prototype.getCandidateFollowupDate = function (conversation, effectiveConfig, latestSentLog, latestOutboundMessage) {
        var _a, _b;
        var currentStage = Math.max(0, Number(conversation.followupStage || 0));
        var intervalForStage = effectiveConfig.intervalsMinutes[currentStage] ||
            effectiveConfig.intervalsMinutes[effectiveConfig.intervalsMinutes.length - 1] ||
            adminFollowupMigrationService_1.LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG.intervalsMinutes[0];
        if (latestSentLog === null || latestSentLog === void 0 ? void 0 : latestSentLog.executedAt) {
            var sentAt = new Date(latestSentLog.executedAt);
            if (currentStage >= effectiveConfig.intervalsMinutes.length) {
                return conversation.nextFollowupAt
                    ? new Date(conversation.nextFollowupAt)
                    : new Date(sentAt.getTime() +
                        Math.max(1, (_b = (_a = effectiveConfig.infiniteLoopMinDays) !== null && _a !== void 0 ? _a : effectiveConfig.finalMinDays) !== null && _b !== void 0 ? _b : 15) * 24 * 60 * 60 * 1000);
            }
            return new Date(sentAt.getTime() + intervalForStage * 60 * 1000);
        }
        if (latestOutboundMessage === null || latestOutboundMessage === void 0 ? void 0 : latestOutboundMessage.timestamp) {
            return new Date(new Date(latestOutboundMessage.timestamp).getTime() + intervalForStage * 60 * 1000);
        }
        var anchor = conversation.lastMessageTime || conversation.createdAt;
        if (anchor) {
            return new Date(new Date(anchor).getTime() + intervalForStage * 60 * 1000);
        }
        if (conversation.nextFollowupAt) {
            return new Date(conversation.nextFollowupAt);
        }
        return null;
    };
    FollowUpService.prototype.normalizeDuplicatePhones = function (adminId_1) {
        return __awaiter(this, arguments, void 0, function (adminId, limit) {
            var conversations, grouped, _i, conversations_1, conversation, key, group, disabledDuplicates, _a, _b, group, ranked, _c, group_1, conversation, _d, latestSentLog, latestOutboundMessage, score, timestamp, keepConversationId, _e, _f, entry;
            var _g;
            if (limit === void 0) { limit = 5000; }
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0: return [4 /*yield*/, db_1.db.query.adminConversations.findMany({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId), (0, drizzle_orm_1.eq)(schema_1.adminConversations.followupActive, true)),
                            orderBy: function (table, _a) {
                                var desc = _a.desc;
                                return [desc(table.lastMessageTime), desc(table.createdAt)];
                            },
                            limit: limit,
                        })];
                    case 1:
                        conversations = _h.sent();
                        grouped = new Map();
                        for (_i = 0, conversations_1 = conversations; _i < conversations_1.length; _i++) {
                            conversation = conversations_1[_i];
                            key = (conversation.contactNumber || conversation.id).trim();
                            group = grouped.get(key) || [];
                            group.push(conversation);
                            grouped.set(key, group);
                        }
                        disabledDuplicates = 0;
                        _a = 0, _b = grouped.values();
                        _h.label = 2;
                    case 2:
                        if (!(_a < _b.length)) return [3 /*break*/, 11];
                        group = _b[_a];
                        if (group.length <= 1)
                            return [3 /*break*/, 10];
                        ranked = [];
                        _c = 0, group_1 = group;
                        _h.label = 3;
                    case 3:
                        if (!(_c < group_1.length)) return [3 /*break*/, 6];
                        conversation = group_1[_c];
                        return [4 /*yield*/, this.getConversationSignals(conversation.id)];
                    case 4:
                        _d = _h.sent(), latestSentLog = _d.latestSentLog, latestOutboundMessage = _d.latestOutboundMessage;
                        score = (latestSentLog ? 1000 : 0) +
                            (latestOutboundMessage ? 500 : 0) +
                            (conversation.nextFollowupAt ? 100 : 0) +
                            Math.min(50, Number(conversation.followupStage || 0));
                        timestamp = new Date(conversation.lastMessageTime || conversation.createdAt || conversation.updatedAt || new Date(0)).getTime();
                        ranked.push({ conversation: conversation, score: score, timestamp: timestamp });
                        _h.label = 5;
                    case 5:
                        _c++;
                        return [3 /*break*/, 3];
                    case 6:
                        ranked.sort(function (a, b) { return b.score - a.score || b.timestamp - a.timestamp; });
                        keepConversationId = (_g = ranked[0]) === null || _g === void 0 ? void 0 : _g.conversation.id;
                        _e = 0, _f = ranked.slice(1);
                        _h.label = 7;
                    case 7:
                        if (!(_e < _f.length)) return [3 /*break*/, 10];
                        entry = _f[_e];
                        return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                                .set({
                                followupActive: false,
                                nextFollowupAt: null,
                                followupDisabledReason: "duplicate_phone_merged:".concat(keepConversationId),
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, entry.conversation.id))];
                    case 8:
                        _h.sent();
                        disabledDuplicates += 1;
                        _h.label = 9;
                    case 9:
                        _e++;
                        return [3 /*break*/, 7];
                    case 10:
                        _a++;
                        return [3 /*break*/, 2];
                    case 11: return [2 /*return*/, { disabledDuplicates: disabledDuplicates }];
                }
            });
        });
    };
    FollowUpService.prototype.reorganizeAllFollowups = function (adminId_1) {
        return __awaiter(this, arguments, void 0, function (adminId, limit) {
            var duplicateResult, globalConfig, conversations, reorganized, skipped, offsetMinutes, now, _i, conversations_2, conversation, effectiveConfig, _a, latestSentLog, latestOutboundMessage, candidate, error_3;
            if (limit === void 0) { limit = 2000; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 10, , 11]);
                        return [4 /*yield*/, this.normalizeDuplicatePhones(adminId, Math.max(limit * 3, 3000))];
                    case 1:
                        duplicateResult = _b.sent();
                        return [4 /*yield*/, this.repairMissingSchedules(limit, adminId)];
                    case 2:
                        _b.sent();
                        return [4 /*yield*/, (0, adminFollowupMigrationService_1.getAdminFollowupGlobalConfig)()];
                    case 3:
                        globalConfig = _b.sent();
                        return [4 /*yield*/, db_1.db.query.adminConversations.findMany({
                                where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId), (0, drizzle_orm_1.eq)(schema_1.adminConversations.followupActive, true)),
                                orderBy: function (table, _a) {
                                    var asc = _a.asc;
                                    return [asc(table.nextFollowupAt), asc(table.lastMessageTime), asc(table.createdAt)];
                                },
                                limit: limit,
                            })];
                    case 4:
                        conversations = _b.sent();
                        reorganized = 0;
                        skipped = 0;
                        offsetMinutes = 1;
                        now = new Date();
                        _i = 0, conversations_2 = conversations;
                        _b.label = 5;
                    case 5:
                        if (!(_i < conversations_2.length)) return [3 /*break*/, 9];
                        conversation = conversations_2[_i];
                        effectiveConfig = getEffectiveConversationConfig(conversation, globalConfig);
                        return [4 /*yield*/, this.getConversationSignals(conversation.id)];
                    case 6:
                        _a = _b.sent(), latestSentLog = _a.latestSentLog, latestOutboundMessage = _a.latestOutboundMessage;
                        candidate = this.getCandidateFollowupDate(conversation, effectiveConfig, latestSentLog, latestOutboundMessage);
                        if (!candidate || Number.isNaN(candidate.getTime())) {
                            skipped += 1;
                            return [3 /*break*/, 8];
                        }
                        if (candidate <= now) {
                            candidate = new Date(now.getTime() + offsetMinutes * 60 * 1000);
                            offsetMinutes += 1;
                        }
                        candidate = alignToBusinessHours(candidate, effectiveConfig);
                        return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                                .set({
                                nextFollowupAt: candidate,
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversation.id))];
                    case 7:
                        _b.sent();
                        reorganized += 1;
                        _b.label = 8;
                    case 8:
                        _i++;
                        return [3 /*break*/, 5];
                    case 9:
                        console.log("\uD83D\uDD04 [FOLLOW-UP] Reorganiza\u00E7\u00E3o conclu\u00EDda para admin ".concat(adminId, ". reorganized=").concat(reorganized, " skipped=").concat(skipped, " disabledDuplicates=").concat(duplicateResult.disabledDuplicates));
                        return [2 /*return*/, { reorganized: reorganized, skipped: skipped, disabledDuplicates: duplicateResult.disabledDuplicates }];
                    case 10:
                        error_3 = _b.sent();
                        console.error("❌ [FOLLOW-UP] Erro ao reorganizar follow-ups:", error_3);
                        throw error_3;
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    FollowUpService.prototype.repairMissingSchedules = function () {
        return __awaiter(this, arguments, void 0, function (limit, adminId) {
            var globalConfig, brokenConversations, repaired, skippedWithoutOutbound, offsetMinutes, now, _i, brokenConversations_1, conversation, effectiveConfig, _a, latestSentLog, latestOutboundMessage, nextDate, error_4;
            if (limit === void 0) { limit = 1000; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 8, , 9]);
                        return [4 /*yield*/, (0, adminFollowupMigrationService_1.getAdminFollowupGlobalConfig)()];
                    case 1:
                        globalConfig = _b.sent();
                        return [4 /*yield*/, db_1.db.query.adminConversations.findMany({
                                where: adminId
                                    ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId), (0, drizzle_orm_1.eq)(schema_1.adminConversations.followupActive, true), (0, drizzle_orm_1.isNull)(schema_1.adminConversations.nextFollowupAt))
                                    : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.followupActive, true), (0, drizzle_orm_1.isNull)(schema_1.adminConversations.nextFollowupAt)),
                                orderBy: function (table, _a) {
                                    var asc = _a.asc;
                                    return [asc(table.lastMessageTime), asc(table.createdAt)];
                                },
                                limit: limit,
                            })];
                    case 2:
                        brokenConversations = _b.sent();
                        if (brokenConversations.length === 0) {
                            return [2 /*return*/];
                        }
                        repaired = 0;
                        skippedWithoutOutbound = 0;
                        offsetMinutes = 1;
                        now = new Date();
                        _i = 0, brokenConversations_1 = brokenConversations;
                        _b.label = 3;
                    case 3:
                        if (!(_i < brokenConversations_1.length)) return [3 /*break*/, 7];
                        conversation = brokenConversations_1[_i];
                        effectiveConfig = getEffectiveConversationConfig(conversation, globalConfig);
                        return [4 /*yield*/, this.getConversationSignals(conversation.id)];
                    case 4:
                        _a = _b.sent(), latestSentLog = _a.latestSentLog, latestOutboundMessage = _a.latestOutboundMessage;
                        nextDate = this.getCandidateFollowupDate(conversation, effectiveConfig, latestSentLog, latestOutboundMessage);
                        if (!nextDate || Number.isNaN(nextDate.getTime())) {
                            skippedWithoutOutbound += 1;
                            return [3 /*break*/, 6];
                        }
                        if (nextDate <= now) {
                            nextDate = new Date(now.getTime() + offsetMinutes * 60 * 1000);
                            offsetMinutes += 1;
                        }
                        nextDate = alignToBusinessHours(nextDate, effectiveConfig);
                        return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                                .set({
                                nextFollowupAt: nextDate,
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversation.id))];
                    case 5:
                        _b.sent();
                        repaired += 1;
                        _b.label = 6;
                    case 6:
                        _i++;
                        return [3 /*break*/, 3];
                    case 7:
                        console.log("\u00F0\u0178\u203A \u00EF\u00B8\u008F [FOLLOW-UP] Reparo de agenda conclu\u00C3\u00ADdo. scanned=".concat(brokenConversations.length, " repaired=").concat(repaired, " skippedWithoutOutbound=").concat(skippedWithoutOutbound));
                        return [3 /*break*/, 9];
                    case 8:
                        error_4 = _b.sent();
                        console.error("âŒ [FOLLOW-UP] Erro ao reparar agendas faltantes:", error_4);
                        return [3 /*break*/, 9];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    return FollowUpService;
}());
exports.FollowUpService = FollowUpService;
exports.followUpService = new FollowUpService();
// ============================================================================
// FUNÇÕES LEGADAS / COMPATIBILIDADE
// ============================================================================
function registerFollowUpCallback(callback) {
    exports.followUpService.registerFollowUpCallback(callback);
}
function registerScheduledContactCallback(callback) {
    exports.followUpService.registerScheduledContactCallback(callback);
}
var scheduleAutoFollowUp = function (phoneNumber, delayMinutes, context) {
    // TODO: Implementar compatibilidade se necessário, ou migrar chamadas antigas
    // Por enquanto, apenas loga
    console.warn("⚠️ scheduleAutoFollowUp (legacy) chamado - migrar para scheduleInitialFollowUp");
};
exports.scheduleAutoFollowUp = scheduleAutoFollowUp;
var cancelFollowUp = function (phoneNumber) {
    exports.followUpService.cancelFollowUpByPhone(phoneNumber);
};
exports.cancelFollowUp = cancelFollowUp;
var scheduleContact = function (phoneNumber, date, reason) {
    // TODO: Implementar agendamento pontual
};
exports.scheduleContact = scheduleContact;
var parseScheduleFromText = function (text) {
    var now = new Date();
    var lowerText = text.toLowerCase();
    // Amanhã
    if (lowerText.includes('amanhã') || lowerText.includes('amanha')) {
        var tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        // Tentar extrair hora
        var hourMatch = text.match(/(\d{1,2})\s*(?:h|hora|:)/i);
        if (hourMatch) {
            tomorrow.setHours(parseInt(hourMatch[1]), 0, 0, 0);
        }
        else {
            tomorrow.setHours(10, 0, 0, 0); // Padrão: 10h
        }
        return tomorrow;
    }
    // Próxima semana / segunda / terça etc
    var weekdays = ['domingo', 'segunda', 'terça', 'terca', 'quarta', 'quinta', 'sexta', 'sábado', 'sabado'];
    for (var i = 0; i < weekdays.length; i++) {
        if (lowerText.includes(weekdays[i])) {
            var targetDay = i % 7;
            var currentDay = now.getDay();
            var daysToAdd = targetDay - currentDay;
            if (daysToAdd <= 0)
                daysToAdd += 7;
            var target = new Date(now);
            target.setDate(target.getDate() + daysToAdd);
            var hourMatch = text.match(/(\d{1,2})\s*(?:h|hora|:)/i);
            if (hourMatch) {
                target.setHours(parseInt(hourMatch[1]), 0, 0, 0);
            }
            else {
                target.setHours(10, 0, 0, 0);
            }
            return target;
        }
    }
    // Daqui X dias/horas
    var inXMatch = text.match(/daqui\s*(?:a\s*)?(\d+)\s*(dia|hora|minuto)/i);
    if (inXMatch) {
        var amount = parseInt(inXMatch[1]);
        var unit = inXMatch[2].toLowerCase();
        var target = new Date(now);
        if (unit.startsWith('dia')) {
            target.setDate(target.getDate() + amount);
            target.setHours(10, 0, 0, 0);
        }
        else if (unit.startsWith('hora')) {
            target.setHours(target.getHours() + amount);
        }
        else if (unit.startsWith('minuto')) {
            target.setMinutes(target.getMinutes() + amount);
        }
        return target;
    }
    return null;
};
exports.parseScheduleFromText = parseScheduleFromText;
function setMockFollowUpFunctions(mocks) {
    if (mocks.cancelFollowUp)
        exports.cancelFollowUp = mocks.cancelFollowUp;
    if (mocks.scheduleAutoFollowUp)
        exports.scheduleAutoFollowUp = mocks.scheduleAutoFollowUp;
    if (mocks.scheduleContact)
        exports.scheduleContact = mocks.scheduleContact;
    if (mocks.followUpService)
        exports.followUpService = mocks.followUpService;
}
