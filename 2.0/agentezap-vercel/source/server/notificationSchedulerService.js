"use strict";
/**
 * 🔔 SERVIÇO DE NOTIFICAÇÕES AGENDADAS - VERSÃO PROFISSIONAL
 *
 * Responsável por verificar e enviar notificações automáticas:
 * - Lembretes de pagamento (X dias antes do vencimento)
 * - Notificações de atraso (X dias após vencimento)
 * - Check-ins periódicos (a cada X dias)
 * - Alertas de WhatsApp desconectado (após X horas)
 * - Broadcasts programados
 * - ✅ NOVO: Verificação e downgrade de planos vencidos
 *
 * ✅ FUNCIONA MESMO COM WHATSAPP DESCONECTADO (verifica antes de enviar)
 * ✅ GERA MENSAGEM ÚNICA POR CLIENTE COM IA (anti-detecção de bot)
 * ✅ DELAY HUMANO ENTRE MENSAGENS (3-10 segundos)
 * ✅ DELAY ENTRE LOTES (30-60 segundos a cada 15-25 mensagens)
 * ✅ LIMITE DIÁRIO (máximo 500 notificações por admin/dia)
 * ✅ RETRY COM BACKOFF EXPONENCIAL
 *
 * NÃO é um chatbot - apenas envia mensagens informativas
 */
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
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
exports.startNotificationScheduler = startNotificationScheduler;
exports.stopNotificationScheduler = stopNotificationScheduler;
exports.applyAIVariation = applyAIVariation;
exports.processExpiredSubscriptions = processExpiredSubscriptions;
var crypto_1 = require("crypto");
var storage_1 = require("./storage");
var whatsapp_1 = require("./whatsapp");
var llm_1 = require("./llm");
var db_1 = require("./db");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * ✅ SANITIZA RESPOSTA DA IA - Remove múltiplas variações e garante uma única mensagem
 * Problema: A IA às vezes gera 2+ variações separadas por "---", "Ou,", "Opção 2:", etc.
 * Solução: Extrair apenas a PRIMEIRA variação e substituir variáveis residuais
 */
function sanitizeAIVariation(aiOutput, replacements) {
    var result = aiOutput.trim();
    // 1. Remover múltiplas variações - pegar apenas a PRIMEIRA mensagem
    // Padrões comuns de separação de variações:
    var separators = [
        /\n\s*---\s*\n/, // --- separador
        /\n\s*\*?\(?[Oo]u,?\s/, // "Ou, se preferir..."
        /\n\s*\*?\(?[Oo]pção\s*\d/i, // "Opção 2:"
        /\n\s*\*?Versão\s*\d/i, // "Versão 2:"
        /\n\s*\*?Alternativa/i, // "Alternativa:"
        /\n\s*\*?Se preferir/i, // "Se preferir um tom..."
        /\n\s*\*?Outra opção/i, // "Outra opção:"
        /\n\s*\(\s*Ou/, // "(Ou, se preferir"
    ];
    for (var _i = 0, separators_1 = separators; _i < separators_1.length; _i++) {
        var sep = separators_1[_i];
        var match = result.match(sep);
        if (match && match.index && match.index > 30) {
            result = result.substring(0, match.index).trim();
            console.log("[AI SANITIZE] Removida varia\u00E7\u00E3o extra (separador: ".concat(sep.source, ")"));
            break;
        }
    }
    // 2. Substituir variáveis de template que a IA pode ter mantido literalmente
    for (var _a = 0, _b = Object.entries(replacements); _a < _b.length; _a++) {
        var _c = _b[_a], variable = _c[0], value = _c[1];
        result = result.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    // 3. Remover aspas envolventes que a IA pode adicionar
    if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
        result = result.slice(1, -1).trim();
    }
    // 4. Remover prefixos tipo "Aqui está a mensagem:" ou "Mensagem reescrita:"
    result = result.replace(/^(Aqui está[^:]*:|Mensagem[^:]*:|Segue[^:]*:)\s*/i, '').trim();
    return result;
}
function isModuleEnabledForNotificationType(notificationType, config) {
    switch (notificationType) {
        case 'payment_reminder':
            return (config === null || config === void 0 ? void 0 : config.payment_reminder_enabled) !== false;
        case 'overdue_reminder':
            return (config === null || config === void 0 ? void 0 : config.overdue_reminder_enabled) !== false;
        case 'checkin':
        case 'periodic_checkin':
            return (config === null || config === void 0 ? void 0 : config.periodic_checkin_enabled) !== false;
        case 'disconnected':
        case 'disconnected_alert':
            return (config === null || config === void 0 ? void 0 : config.disconnected_alert_enabled) !== false;
        default:
            return true;
    }
}
// Executar a cada 5 minutos para processar notificações agendadas mais rapidamente
var CHECK_INTERVAL_MS = 5 * 60 * 1000;
// Limites anti-bloqueio
var DAILY_NOTIFICATION_LIMIT = 500; // Máximo de notificações por admin por dia
var BATCH_SIZE_MIN = 15; // Tamanho mínimo de lote
var BATCH_SIZE_MAX = 25; // Tamanho máximo de lote
var BATCH_DELAY_MIN_MS = 30000; // 30 segundos entre lotes
var BATCH_DELAY_MAX_MS = 60000; // 60 segundos entre lotes
var schedulerInterval = null;
// Cache de contadores diários (resetado à meia-noite)
var dailyCounters = new Map();
/**
 * Inicia o scheduler de notificações
 */
function startNotificationScheduler() {
    if (schedulerInterval) {
        console.log('🔔 [NOTIFICATION SCHEDULER] Já está rodando');
        return;
    }
    console.log('🔔 [NOTIFICATION SCHEDULER] Iniciando...');
    // Executar imediatamente e depois a cada intervalo
    processNotifications();
    schedulerInterval = setInterval(processNotifications, CHECK_INTERVAL_MS);
}
/**
 * Para o scheduler de notificações
 */
function stopNotificationScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('🔔 [NOTIFICATION SCHEDULER] Parado');
    }
}
// Controle de auto-reorganize (rodar a cada 2 horas, não a cada 5 min)
var lastAutoReorganize = 0;
var AUTO_REORGANIZE_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 horas
/**
 * Processa todas as notificações pendentes
 */
function processNotifications() {
    return __awaiter(this, void 0, void 0, function () {
        var stuckResult, stuckRows, _i, stuckRows_1, row, recoveryErr_1, disconnectedFailedResult, recoveredRows, recoveryErr_2, now, configs, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 13, , 14]);
                    console.log('🔔 [NOTIFICATION SCHEDULER] Verificando notificações...');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n        UPDATE scheduled_notifications\n        SET status = 'pending', updated_at = NOW(), retry_count = COALESCE(retry_count, 0) + 1\n        WHERE status = 'processing'\n          AND updated_at < NOW() - INTERVAL '30 minutes'\n        RETURNING id, recipient_name, notification_type\n      "], ["\n        UPDATE scheduled_notifications\n        SET status = 'pending', updated_at = NOW(), retry_count = COALESCE(retry_count, 0) + 1\n        WHERE status = 'processing'\n          AND updated_at < NOW() - INTERVAL '30 minutes'\n        RETURNING id, recipient_name, notification_type\n      "]))))];
                case 2:
                    stuckResult = _a.sent();
                    stuckRows = stuckResult.rows;
                    if (stuckRows.length > 0) {
                        console.log("\uD83D\uDD14 [RECOVERY] \u267B\uFE0F Resetou ".concat(stuckRows.length, " notifica\u00E7\u00F5es stuck em 'processing' \u2192 'pending'"));
                        for (_i = 0, stuckRows_1 = stuckRows; _i < stuckRows_1.length; _i++) {
                            row = stuckRows_1[_i];
                            console.log("   \u21B3 ".concat(row.recipient_name, " (").concat(row.notification_type, ") ID: ").concat(row.id));
                        }
                    }
                    return [3 /*break*/, 4];
                case 3:
                    recoveryErr_1 = _a.sent();
                    console.error('🔔 [RECOVERY] Erro ao resetar stuck:', recoveryErr_1);
                    return [3 /*break*/, 4];
                case 4:
                    _a.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["\n        UPDATE scheduled_notifications\n        SET status = 'pending', \n            updated_at = NOW(), \n            error_message = NULL,\n            retry_count = COALESCE(retry_count, 0) + 1,\n            scheduled_for = NOW() + (floor(random() * 30) || ' minutes')::interval\n        WHERE status = 'failed'\n          AND error_message LIKE '%WhatsApp%not connected%'\n          AND scheduled_for >= NOW() - INTERVAL '48 hours'\n          AND COALESCE(retry_count, 0) < 3\n        RETURNING id, recipient_name, notification_type\n      "], ["\n        UPDATE scheduled_notifications\n        SET status = 'pending', \n            updated_at = NOW(), \n            error_message = NULL,\n            retry_count = COALESCE(retry_count, 0) + 1,\n            scheduled_for = NOW() + (floor(random() * 30) || ' minutes')::interval\n        WHERE status = 'failed'\n          AND error_message LIKE '%WhatsApp%not connected%'\n          AND scheduled_for >= NOW() - INTERVAL '48 hours'\n          AND COALESCE(retry_count, 0) < 3\n        RETURNING id, recipient_name, notification_type\n      "]))))];
                case 5:
                    disconnectedFailedResult = _a.sent();
                    recoveredRows = disconnectedFailedResult.rows;
                    if (recoveredRows.length > 0) {
                        console.log("\uD83D\uDD14 [RECOVERY] \u267B\uFE0F Reagendou ".concat(recoveredRows.length, " notifica\u00E7\u00F5es que falharam por WhatsApp desconectado"));
                    }
                    return [3 /*break*/, 7];
                case 6:
                    recoveryErr_2 = _a.sent();
                    console.error('🔔 [RECOVERY] Erro ao recuperar falhas por desconexão:', recoveryErr_2);
                    return [3 /*break*/, 7];
                case 7:
                    // ✅ Limpar contadores antigos
                    cleanOldCounters();
                    // ✅ NOVO: Verificar e atualizar planos vencidos automaticamente
                    return [4 /*yield*/, processExpiredSubscriptions()];
                case 8:
                    // ✅ NOVO: Verificar e atualizar planos vencidos automaticamente
                    _a.sent();
                    now = Date.now();
                    if (!(now - lastAutoReorganize >= AUTO_REORGANIZE_INTERVAL_MS)) return [3 /*break*/, 10];
                    return [4 /*yield*/, autoReorganizeAllAdmins()];
                case 9:
                    _a.sent();
                    lastAutoReorganize = now;
                    _a.label = 10;
                case 10: 
                // ✅ PRIMEIRO: Processar fila de scheduled_notifications
                return [4 /*yield*/, processScheduledNotificationsQueue()];
                case 11:
                    // ✅ PRIMEIRO: Processar fila de scheduled_notifications
                    _a.sent();
                    return [4 /*yield*/, getActiveNotificationConfigs()];
                case 12:
                    configs = _a.sent();
                    console.log("\uD83D\uDD14 [NOTIFICATION SCHEDULER] Processamento conclu\u00EDdo (".concat(configs.length, " admins, usando fila com delays)"));
                    return [3 /*break*/, 14];
                case 13:
                    error_1 = _a.sent();
                    console.error('🔔 [NOTIFICATION SCHEDULER] Erro:', error_1);
                    return [3 /*break*/, 14];
                case 14: return [2 /*return*/];
            }
        });
    });
}
/**
 * ✅ AUTO-REORGANIZE: Cria notificações automaticamente para todos os admins
 * Roda a cada 2 horas para garantir que a fila nunca fica vazia
 */
function autoReorganizeAllAdmins() {
    return __awaiter(this, void 0, void 0, function () {
        var adminResult, adminIds, _i, adminIds_1, adminId, err_1, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 8, , 9]);
                    console.log('🔄 [AUTO-REORGANIZE] Iniciando reorganização automática...');
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["\n      SELECT DISTINCT admin_id FROM admin_notification_config\n      WHERE payment_reminder_enabled = true\n         OR overdue_reminder_enabled = true\n         OR periodic_checkin_enabled = true\n         OR disconnected_alert_enabled = true\n    "], ["\n      SELECT DISTINCT admin_id FROM admin_notification_config\n      WHERE payment_reminder_enabled = true\n         OR overdue_reminder_enabled = true\n         OR periodic_checkin_enabled = true\n         OR disconnected_alert_enabled = true\n    "]))))];
                case 1:
                    adminResult = _a.sent();
                    adminIds = adminResult.rows.map(function (r) { return r.admin_id; });
                    if (adminIds.length === 0) {
                        console.log('🔄 [AUTO-REORGANIZE] Nenhum admin com notificações habilitadas');
                        return [2 /*return*/];
                    }
                    _i = 0, adminIds_1 = adminIds;
                    _a.label = 2;
                case 2:
                    if (!(_i < adminIds_1.length)) return [3 /*break*/, 7];
                    adminId = adminIds_1[_i];
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, autoReorganizeForAdmin(adminId)];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 5:
                    err_1 = _a.sent();
                    console.error("\uD83D\uDD04 [AUTO-REORGANIZE] Erro para admin ".concat(adminId, ":"), err_1);
                    return [3 /*break*/, 6];
                case 6:
                    _i++;
                    return [3 /*break*/, 2];
                case 7:
                    console.log("\uD83D\uDD04 [AUTO-REORGANIZE] Conclu\u00EDdo para ".concat(adminIds.length, " admin(s)"));
                    return [3 /*break*/, 9];
                case 8:
                    error_2 = _a.sent();
                    console.error('🔄 [AUTO-REORGANIZE] Erro geral:', error_2);
                    return [3 /*break*/, 9];
                case 9: return [2 /*return*/];
            }
        });
    });
}
/**
 * Auto-reorganiza notificações para um admin específico
 * Cria entradas em scheduled_notifications para os próximos 14 dias
 */
function autoReorganizeForAdmin(adminId) {
    return __awaiter(this, void 0, void 0, function () {
        var now, configResult, rawConfig, config, businessDays, excludedDays, hasExcludedDays, excludedDaysLiteral, staleResult, rescheduled, rescheduleErr_1, sentLogsResult, sentLogs, existingResult, existingScheduled, alreadySentOrScheduled, usersResult, users, scheduledItems, _i, users_1, user, dueDate, startDate, calculatedDue, planValor, hasSubscription, hasSubscriptionForOverdue, dueDateObj, daysUntilDue, _a, _b, daysBefore, scheduleDate, startHour, dueDateObj, daysOverdue, _c, _d, daysAfter, scheduleDate, startHour, minDays, maxDays, randomDays, scheduleDate, startHour, scheduleDate, _e, scheduledItems_1, item, insertErr_1;
        var _f, _g, _h, _j, _k, _l, _m, _o, _p;
        return __generator(this, function (_q) {
            switch (_q.label) {
                case 0:
                    now = new Date();
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["\n    SELECT * FROM admin_notification_config WHERE admin_id = ", "\n  "], ["\n    SELECT * FROM admin_notification_config WHERE admin_id = ", "\n  "])), adminId))];
                case 1:
                    configResult = _q.sent();
                    rawConfig = configResult.rows[0];
                    if (!rawConfig)
                        return [2 /*return*/];
                    config = {
                        paymentReminderEnabled: (_f = rawConfig.payment_reminder_enabled) !== null && _f !== void 0 ? _f : true,
                        paymentReminderDaysBefore: rawConfig.payment_reminder_days_before || [7, 3, 1],
                        paymentReminderMessageTemplate: rawConfig.payment_reminder_message_template || 'Olá {cliente_nome}! Seu pagamento vence em {dias_restantes} dias. Vencimento: {data_vencimento}. Valor: R$ {valor}',
                        paymentReminderAiEnabled: (_g = rawConfig.payment_reminder_ai_enabled) !== null && _g !== void 0 ? _g : true,
                        paymentReminderAiPrompt: rawConfig.payment_reminder_ai_prompt || 'Reescreva de forma natural e personalizada.',
                        overdueReminderEnabled: (_h = rawConfig.overdue_reminder_enabled) !== null && _h !== void 0 ? _h : true,
                        overdueReminderDaysAfter: rawConfig.overdue_reminder_days_after || [1, 3, 7, 14],
                        overdueReminderMessageTemplate: rawConfig.overdue_reminder_message_template || 'Olá {cliente_nome}! Seu pagamento está em atraso há {dias_atraso} dias. Venceu em: {data_vencimento}. Valor: R$ {valor}',
                        overdueReminderAiEnabled: (_j = rawConfig.overdue_reminder_ai_enabled) !== null && _j !== void 0 ? _j : true,
                        overdueReminderAiPrompt: rawConfig.overdue_reminder_ai_prompt || 'Reescreva de forma educada e empática.',
                        periodicCheckinEnabled: (_k = rawConfig.periodic_checkin_enabled) !== null && _k !== void 0 ? _k : true,
                        periodicCheckinMinDays: rawConfig.periodic_checkin_min_days || 7,
                        periodicCheckinMaxDays: rawConfig.periodic_checkin_max_days || 15,
                        periodicCheckinMessageTemplate: rawConfig.periodic_checkin_message_template || 'Olá {cliente_nome}! Passando para ver se está tudo bem!',
                        checkinAiEnabled: (_l = rawConfig.checkin_ai_enabled) !== null && _l !== void 0 ? _l : true,
                        checkinAiPrompt: rawConfig.checkin_ai_prompt || 'Reescreva de forma calorosa e natural.',
                        disconnectedAlertEnabled: (_m = rawConfig.disconnected_alert_enabled) !== null && _m !== void 0 ? _m : true,
                        disconnectedAlertHours: rawConfig.disconnected_alert_hours || 2,
                        disconnectedAlertMessageTemplate: rawConfig.disconnected_alert_message_template || 'Olá {cliente_nome}! Notamos que seu WhatsApp está desconectado.',
                        disconnectedAiEnabled: (_o = rawConfig.disconnected_ai_enabled) !== null && _o !== void 0 ? _o : true,
                        disconnectedAiPrompt: rawConfig.disconnected_ai_prompt || 'Reescreva de forma prestativa.',
                        aiVariationPrompt: rawConfig.ai_variation_prompt || '',
                        businessHoursStart: rawConfig.business_hours_start || '09:00',
                        businessHoursEnd: rawConfig.business_hours_end || '18:00',
                        businessDays: rawConfig.business_days || [1, 2, 3, 4, 5],
                        respectBusinessHours: (_p = rawConfig.respect_business_hours) !== null && _p !== void 0 ? _p : true,
                    };
                    businessDays = config.businessDays || [1, 2, 3, 4, 5];
                    excludedDays = [0, 1, 2, 3, 4, 5, 6].filter(function (d) { return !businessDays.includes(d); });
                    hasExcludedDays = excludedDays.length > 0;
                    excludedDaysLiteral = excludedDays.length > 0 ? excludedDays.join(',') : '-1';
                    _q.label = 2;
                case 2:
                    _q.trys.push([2, 5, , 7]);
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["\n      UPDATE scheduled_notifications\n      SET scheduled_for = (\n        CASE \n          WHEN ", " AND EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo') = ANY(ARRAY[", "]::int[])\n            THEN (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 day' * \n                  CASE WHEN EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo') = 6 THEN 2 ELSE 1 END\n                 ) + (", ")::time + (floor(random() * 120) || ' minutes')::interval\n          ELSE (NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '5 minutes' + (floor(random() * 30) || ' minutes')::interval\n        END\n      ) AT TIME ZONE 'America/Sao_Paulo',\n      updated_at = NOW(),\n      retry_count = COALESCE(retry_count, 0) + 1\n      WHERE admin_id = ", "\n        AND status = 'pending'\n        AND scheduled_for < NOW() - INTERVAL '2 hours'\n        AND COALESCE(retry_count, 0) < 5\n      RETURNING id, notification_type, recipient_name\n    "], ["\n      UPDATE scheduled_notifications\n      SET scheduled_for = (\n        CASE \n          WHEN ", " AND EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo') = ANY(ARRAY[", "]::int[])\n            THEN (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 day' * \n                  CASE WHEN EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo') = 6 THEN 2 ELSE 1 END\n                 ) + (", ")::time + (floor(random() * 120) || ' minutes')::interval\n          ELSE (NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '5 minutes' + (floor(random() * 30) || ' minutes')::interval\n        END\n      ) AT TIME ZONE 'America/Sao_Paulo',\n      updated_at = NOW(),\n      retry_count = COALESCE(retry_count, 0) + 1\n      WHERE admin_id = ", "\n        AND status = 'pending'\n        AND scheduled_for < NOW() - INTERVAL '2 hours'\n        AND COALESCE(retry_count, 0) < 5\n      RETURNING id, notification_type, recipient_name\n    "])), hasExcludedDays, drizzle_orm_1.sql.raw(excludedDaysLiteral), config.businessHoursStart || '09:00', adminId))];
                case 3:
                    staleResult = _q.sent();
                    rescheduled = staleResult.rows;
                    if (rescheduled.length > 0) {
                        console.log("\uD83D\uDD04 [AUTO-REORGANIZE] \u267B\uFE0F Reagendou ".concat(rescheduled.length, " notifica\u00E7\u00F5es atrasadas (antes seriam deletadas)"));
                    }
                    // Deletar apenas as que já falharam 5+ vezes no reagendamento
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["\n      DELETE FROM scheduled_notifications\n      WHERE admin_id = ", "\n        AND status = 'pending'\n        AND scheduled_for < NOW() - INTERVAL '2 hours'\n        AND COALESCE(retry_count, 0) >= 5\n    "], ["\n      DELETE FROM scheduled_notifications\n      WHERE admin_id = ", "\n        AND status = 'pending'\n        AND scheduled_for < NOW() - INTERVAL '2 hours'\n        AND COALESCE(retry_count, 0) >= 5\n    "])), adminId))];
                case 4:
                    // Deletar apenas as que já falharam 5+ vezes no reagendamento
                    _q.sent();
                    return [3 /*break*/, 7];
                case 5:
                    rescheduleErr_1 = _q.sent();
                    console.error('🔄 [AUTO-REORGANIZE] Erro ao reagendar atrasados:', rescheduleErr_1);
                    // Fallback: deletar como antes para não travar
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["\n      DELETE FROM scheduled_notifications\n      WHERE admin_id = ", "\n        AND status = 'pending'\n        AND scheduled_for < NOW()\n    "], ["\n      DELETE FROM scheduled_notifications\n      WHERE admin_id = ", "\n        AND status = 'pending'\n        AND scheduled_for < NOW()\n    "])), adminId))];
                case 6:
                    // Fallback: deletar como antes para não travar
                    _q.sent();
                    return [3 /*break*/, 7];
                case 7: return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["\n    SELECT user_id, notification_type,\n           (metadata->>'daysBefore')::int as days_before,\n           (metadata->>'daysAfter')::int as days_after\n    FROM admin_notification_logs\n    WHERE admin_id = ", "\n    AND created_at > NOW() - INTERVAL '30 days'\n  "], ["\n    SELECT user_id, notification_type,\n           (metadata->>'daysBefore')::int as days_before,\n           (metadata->>'daysAfter')::int as days_after\n    FROM admin_notification_logs\n    WHERE admin_id = ", "\n    AND created_at > NOW() - INTERVAL '30 days'\n  "])), adminId))];
                case 8:
                    sentLogsResult = _q.sent();
                    sentLogs = sentLogsResult.rows || [];
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["\n    SELECT user_id, notification_type,\n           (metadata->>'daysBefore')::int as days_before,\n           (metadata->>'daysAfter')::int as days_after\n    FROM scheduled_notifications\n    WHERE admin_id = ", "\n    AND status = 'pending'\n  "], ["\n    SELECT user_id, notification_type,\n           (metadata->>'daysBefore')::int as days_before,\n           (metadata->>'daysAfter')::int as days_after\n    FROM scheduled_notifications\n    WHERE admin_id = ", "\n    AND status = 'pending'\n  "])), adminId))];
                case 9:
                    existingResult = _q.sent();
                    existingScheduled = existingResult.rows || [];
                    alreadySentOrScheduled = function (userId, type, daysBefore, daysAfter) {
                        var wasSent = sentLogs.some(function (log) {
                            return log.user_id === userId &&
                                log.notification_type === type &&
                                (daysBefore === undefined || log.days_before === daysBefore) &&
                                (daysAfter === undefined || log.days_after === daysAfter);
                        });
                        var isScheduled = existingScheduled.some(function (s) {
                            return s.user_id === userId &&
                                s.notification_type === type &&
                                (daysBefore === undefined || s.days_before === daysBefore) &&
                                (daysAfter === undefined || s.days_after === daysAfter);
                        });
                        return wasSent || isScheduled;
                    };
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["\n    SELECT \n      u.id, u.phone, u.name,\n      s.id as sub_id, s.status as sub_status, \n      s.data_fim, s.data_inicio, s.next_payment_date as next_payment_date,\n      s.plan_id,\n      p.valor as plan_valor, p.nome as plan_nome, p.frequencia_dias as frequencia_dias,\n      COALESCE(wc.is_connected, false) as whatsapp_connected,\n      wc.updated_at as connection_updated_at\n    FROM users u\n    LEFT JOIN LATERAL (\n      SELECT * FROM subscriptions sub \n      WHERE sub.user_id = u.id AND sub.status IN ('active', 'pending', 'expired')\n      ORDER BY sub.created_at DESC LIMIT 1\n    ) s ON true\n    LEFT JOIN plans p ON s.plan_id = p.id\n    LEFT JOIN LATERAL (\n      SELECT c.is_connected, c.updated_at FROM whatsapp_connections c \n      WHERE c.user_id = u.id ORDER BY c.created_at DESC LIMIT 1\n    ) wc ON true\n    WHERE u.id != ", "\n    AND u.id NOT IN (\n      SELECT uu.id FROM users uu \n      JOIN admins a ON a.email = uu.email \n      WHERE a.id = ", "\n    )\n    AND u.role IS DISTINCT FROM 'owner'\n    AND u.phone IS NOT NULL\n    AND u.phone != ''\n  "], ["\n    SELECT \n      u.id, u.phone, u.name,\n      s.id as sub_id, s.status as sub_status, \n      s.data_fim, s.data_inicio, s.next_payment_date as next_payment_date,\n      s.plan_id,\n      p.valor as plan_valor, p.nome as plan_nome, p.frequencia_dias as frequencia_dias,\n      COALESCE(wc.is_connected, false) as whatsapp_connected,\n      wc.updated_at as connection_updated_at\n    FROM users u\n    LEFT JOIN LATERAL (\n      SELECT * FROM subscriptions sub \n      WHERE sub.user_id = u.id AND sub.status IN ('active', 'pending', 'expired')\n      ORDER BY sub.created_at DESC LIMIT 1\n    ) s ON true\n    LEFT JOIN plans p ON s.plan_id = p.id\n    LEFT JOIN LATERAL (\n      SELECT c.is_connected, c.updated_at FROM whatsapp_connections c \n      WHERE c.user_id = u.id ORDER BY c.created_at DESC LIMIT 1\n    ) wc ON true\n    WHERE u.id != ", "\n    AND u.id NOT IN (\n      SELECT uu.id FROM users uu \n      JOIN admins a ON a.email = uu.email \n      WHERE a.id = ", "\n    )\n    AND u.role IS DISTINCT FROM 'owner'\n    AND u.phone IS NOT NULL\n    AND u.phone != ''\n  "])), adminId, adminId))];
                case 10:
                    usersResult = _q.sent();
                    users = usersResult.rows;
                    scheduledItems = [];
                    for (_i = 0, users_1 = users; _i < users_1.length; _i++) {
                        user = users_1[_i];
                        if (!user.phone)
                            continue;
                        dueDate = user.next_payment_date || user.data_fim;
                        if (!dueDate && user.data_inicio && user.frequencia_dias) {
                            startDate = new Date(user.data_inicio);
                            calculatedDue = new Date(startDate);
                            calculatedDue.setDate(calculatedDue.getDate() + (user.frequencia_dias || 30));
                            dueDate = calculatedDue.toISOString();
                        }
                        planValor = user.plan_valor || '0';
                        hasSubscription = user.sub_id && (user.sub_status === 'active' || user.sub_status === 'pending');
                        hasSubscriptionForOverdue = user.sub_id && (user.sub_status === 'active' || user.sub_status === 'pending' || user.sub_status === 'expired');
                        // 1. LEMBRETE DE PAGAMENTO
                        if (config.paymentReminderEnabled && hasSubscription && dueDate) {
                            dueDateObj = new Date(dueDate);
                            daysUntilDue = Math.ceil((dueDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                            for (_a = 0, _b = config.paymentReminderDaysBefore; _a < _b.length; _a++) {
                                daysBefore = _b[_a];
                                if (daysUntilDue > 0 && daysUntilDue <= daysBefore + 7) {
                                    if (alreadySentOrScheduled(user.id, 'payment_reminder', daysBefore))
                                        continue;
                                    scheduleDate = new Date(dueDateObj);
                                    scheduleDate.setDate(scheduleDate.getDate() - daysBefore);
                                    if (scheduleDate <= now) {
                                        scheduleDate.setTime(now.getTime());
                                        scheduleDate.setDate(scheduleDate.getDate() + 1);
                                    }
                                    if (config.respectBusinessHours) {
                                        startHour = config.businessHoursStart.split(':').map(Number)[0];
                                        scheduleDate.setHours(startHour + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0);
                                    }
                                    scheduledItems.push({
                                        admin_id: adminId, user_id: user.id, notification_type: 'payment_reminder',
                                        recipient_phone: user.phone, recipient_name: user.name || 'Cliente',
                                        message_template: config.paymentReminderMessageTemplate,
                                        ai_prompt: config.paymentReminderAiPrompt || config.aiVariationPrompt,
                                        scheduled_for: scheduleDate.toISOString(),
                                        ai_enabled: config.paymentReminderAiEnabled,
                                        metadata: JSON.stringify({ daysBefore: daysBefore, dueDate: dueDateObj.toISOString(), valor: planValor, planName: user.plan_nome || 'Plano' }),
                                    });
                                }
                            }
                        }
                        // 2. COBRANÇA EM ATRASO (inclui planos expirados para continuar cobrando)
                        if (config.overdueReminderEnabled && hasSubscriptionForOverdue && dueDate) {
                            dueDateObj = new Date(dueDate);
                            daysOverdue = Math.ceil((now.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
                            if (daysOverdue > 0) {
                                for (_c = 0, _d = config.overdueReminderDaysAfter; _c < _d.length; _c++) {
                                    daysAfter = _d[_c];
                                    if (daysOverdue >= daysAfter && daysOverdue < daysAfter + 7) {
                                        if (alreadySentOrScheduled(user.id, 'overdue_reminder', undefined, daysAfter))
                                            continue;
                                        scheduleDate = new Date();
                                        if (config.respectBusinessHours) {
                                            startHour = config.businessHoursStart.split(':').map(Number)[0];
                                            scheduleDate.setHours(startHour + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0);
                                        }
                                        if (scheduleDate <= now)
                                            scheduleDate.setDate(scheduleDate.getDate() + 1);
                                        scheduledItems.push({
                                            admin_id: adminId, user_id: user.id, notification_type: 'overdue_reminder',
                                            recipient_phone: user.phone, recipient_name: user.name || 'Cliente',
                                            message_template: config.overdueReminderMessageTemplate,
                                            ai_prompt: config.overdueReminderAiPrompt || config.aiVariationPrompt,
                                            scheduled_for: scheduleDate.toISOString(),
                                            ai_enabled: config.overdueReminderAiEnabled,
                                            metadata: JSON.stringify({ daysAfter: daysAfter, daysOverdue: daysOverdue, dueDate: dueDateObj.toISOString(), valor: planValor, planName: user.plan_nome || 'Plano' }),
                                        });
                                    }
                                }
                            }
                        }
                        // 3. CHECK-IN PERIÓDICO (só com plano ativo)
                        if (config.periodicCheckinEnabled && hasSubscription) {
                            if (!alreadySentOrScheduled(user.id, 'checkin')) {
                                minDays = config.periodicCheckinMinDays;
                                maxDays = config.periodicCheckinMaxDays;
                                randomDays = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;
                                scheduleDate = new Date();
                                scheduleDate.setDate(scheduleDate.getDate() + randomDays);
                                if (config.respectBusinessHours) {
                                    startHour = config.businessHoursStart.split(':').map(Number)[0];
                                    scheduleDate.setHours(startHour + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60), 0);
                                }
                                scheduledItems.push({
                                    admin_id: adminId, user_id: user.id, notification_type: 'checkin',
                                    recipient_phone: user.phone, recipient_name: user.name || 'Cliente',
                                    message_template: config.periodicCheckinMessageTemplate,
                                    ai_prompt: config.checkinAiPrompt || config.aiVariationPrompt,
                                    scheduled_for: scheduleDate.toISOString(),
                                    ai_enabled: config.checkinAiEnabled,
                                    metadata: JSON.stringify({ minDays: minDays, maxDays: maxDays, randomDays: randomDays }),
                                });
                            }
                        }
                        // 4. ALERTA DESCONECTADO (com plano ativo e desconectado)
                        if (config.disconnectedAlertEnabled && hasSubscription && !user.whatsapp_connected) {
                            if (!alreadySentOrScheduled(user.id, 'disconnected')) {
                                scheduleDate = new Date();
                                scheduleDate.setHours(scheduleDate.getHours() + config.disconnectedAlertHours);
                                scheduledItems.push({
                                    admin_id: adminId, user_id: user.id, notification_type: 'disconnected',
                                    recipient_phone: user.phone, recipient_name: user.name || 'Cliente',
                                    message_template: config.disconnectedAlertMessageTemplate,
                                    ai_prompt: config.disconnectedAiPrompt || config.aiVariationPrompt,
                                    scheduled_for: scheduleDate.toISOString(),
                                    ai_enabled: config.disconnectedAiEnabled,
                                    metadata: JSON.stringify({ disconnectedSince: user.connection_updated_at }),
                                });
                            }
                        }
                    }
                    if (!(scheduledItems.length > 0)) return [3 /*break*/, 17];
                    _e = 0, scheduledItems_1 = scheduledItems;
                    _q.label = 11;
                case 11:
                    if (!(_e < scheduledItems_1.length)) return [3 /*break*/, 16];
                    item = scheduledItems_1[_e];
                    _q.label = 12;
                case 12:
                    _q.trys.push([12, 14, , 15]);
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["\n          INSERT INTO scheduled_notifications (\n            admin_id, user_id, notification_type, recipient_phone, recipient_name,\n            message_template, ai_prompt, scheduled_for, ai_enabled, metadata, status\n          ) VALUES (\n            ", ", ", ", ", ",\n            ", ", ", ", ", ",\n            ", ", ", "::timestamp, ", ",\n            ", "::jsonb, 'pending'\n          )\n          ON CONFLICT DO NOTHING\n        "], ["\n          INSERT INTO scheduled_notifications (\n            admin_id, user_id, notification_type, recipient_phone, recipient_name,\n            message_template, ai_prompt, scheduled_for, ai_enabled, metadata, status\n          ) VALUES (\n            ", ", ", ", ", ",\n            ", ", ", ", ", ",\n            ", ", ", "::timestamp, ", ",\n            ", "::jsonb, 'pending'\n          )\n          ON CONFLICT DO NOTHING\n        "])), item.admin_id, item.user_id, item.notification_type, item.recipient_phone, item.recipient_name, item.message_template, item.ai_prompt, item.scheduled_for, item.ai_enabled, item.metadata))];
                case 13:
                    _q.sent();
                    return [3 /*break*/, 15];
                case 14:
                    insertErr_1 = _q.sent();
                    return [3 /*break*/, 15];
                case 15:
                    _e++;
                    return [3 /*break*/, 11];
                case 16:
                    console.log("\uD83D\uDD04 [AUTO-REORGANIZE] Admin ".concat(adminId, ": ").concat(scheduledItems.length, " notifica\u00E7\u00F5es agendadas automaticamente"));
                    return [3 /*break*/, 18];
                case 17:
                    console.log("\uD83D\uDD04 [AUTO-REORGANIZE] Admin ".concat(adminId, ": nenhuma nova notifica\u00E7\u00E3o para agendar"));
                    _q.label = 18;
                case 18: return [2 /*return*/];
            }
        });
    });
}
// 🔒 Lock para evitar processamento duplicado
var isQueueProcessing = false;
/**
 * ✅ PROCESSA FILA DE NOTIFICAÇÕES AGENDADAS (scheduled_notifications)
 * Esta função processa todas as notificações com scheduled_for <= NOW() e status = 'pending'
 * Usa delays anti-banimento e variação IA
 *
 * 🔒 CORREÇÃO BUG DUPLICATAS:
 * - Lock global para evitar execuções paralelas
 * - Marca notificações como 'processing' ANTES de buscar
 * - Verifica se já foi enviada para o mesmo cliente recentemente
 */
function processScheduledNotificationsQueue() {
    return __awaiter(this, void 0, void 0, function () {
        var claimResult, claimedIds, idsArrayStr, pendingResult, pendingNotifications, adminGroups, _i, pendingNotifications_1, notification, adminId, _a, adminGroups_1, _b, adminId, notifications, revertIdsArrayStr, error_3;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 🔒 Verificar lock - evitar processamento paralelo
                    if (isQueueProcessing) {
                        console.log('📋 [QUEUE SCHEDULER] ⏳ Já existe processamento em andamento, ignorando...');
                        return [2 /*return*/];
                    }
                    isQueueProcessing = true;
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 9, 11, 12]);
                    console.log('📋 [QUEUE SCHEDULER] Buscando notificações pendentes...');
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["\n      UPDATE scheduled_notifications\n      SET status = 'processing', updated_at = NOW()\n      WHERE id IN (\n        SELECT id FROM scheduled_notifications\n        WHERE status = 'pending'\n          AND scheduled_for <= NOW()\n        ORDER BY scheduled_for ASC\n        LIMIT 50\n        FOR UPDATE SKIP LOCKED\n      )\n      RETURNING id\n    "], ["\n      UPDATE scheduled_notifications\n      SET status = 'processing', updated_at = NOW()\n      WHERE id IN (\n        SELECT id FROM scheduled_notifications\n        WHERE status = 'pending'\n          AND scheduled_for <= NOW()\n        ORDER BY scheduled_for ASC\n        LIMIT 50\n        FOR UPDATE SKIP LOCKED\n      )\n      RETURNING id\n    "]))))];
                case 2:
                    claimResult = _c.sent();
                    claimedIds = claimResult.rows.map(function (r) { return r.id; });
                    if (claimedIds.length === 0) {
                        console.log('📋 [QUEUE SCHEDULER] Nenhuma notificação pendente para processar');
                        return [2 /*return*/];
                    }
                    console.log("\uD83D\uDCCB [QUEUE SCHEDULER] Reivindicou ".concat(claimedIds.length, " notifica\u00E7\u00F5es para processamento"));
                    idsArrayStr = "'{".concat(claimedIds.join(','), "}'");
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject(["\n      SELECT sn.*, anc.admin_id as config_admin_id,\n             anc.respect_business_hours,\n             anc.business_hours_start,\n             anc.business_hours_end,\n             anc.business_days,\n             anc.ai_variation_enabled,\n             anc.ai_variation_prompt,\n             anc.broadcast_min_interval_seconds,\n             anc.broadcast_max_interval_seconds\n      FROM scheduled_notifications sn\n      LEFT JOIN admin_notification_config anc ON anc.admin_id = sn.admin_id\n      WHERE sn.id = ANY(", "::text[])\n      ORDER BY sn.scheduled_for ASC\n    "], ["\n      SELECT sn.*, anc.admin_id as config_admin_id,\n             anc.respect_business_hours,\n             anc.business_hours_start,\n             anc.business_hours_end,\n             anc.business_days,\n             anc.ai_variation_enabled,\n             anc.ai_variation_prompt,\n             anc.broadcast_min_interval_seconds,\n             anc.broadcast_max_interval_seconds\n      FROM scheduled_notifications sn\n      LEFT JOIN admin_notification_config anc ON anc.admin_id = sn.admin_id\n      WHERE sn.id = ANY(", "::text[])\n      ORDER BY sn.scheduled_for ASC\n    "])), drizzle_orm_1.sql.raw(idsArrayStr)))];
                case 3:
                    pendingResult = _c.sent();
                    pendingNotifications = pendingResult.rows;
                    adminGroups = new Map();
                    for (_i = 0, pendingNotifications_1 = pendingNotifications; _i < pendingNotifications_1.length; _i++) {
                        notification = pendingNotifications_1[_i];
                        adminId = notification.admin_id;
                        if (!adminGroups.has(adminId)) {
                            adminGroups.set(adminId, []);
                        }
                        adminGroups.get(adminId).push(notification);
                    }
                    _a = 0, adminGroups_1 = adminGroups;
                    _c.label = 4;
                case 4:
                    if (!(_a < adminGroups_1.length)) return [3 /*break*/, 7];
                    _b = adminGroups_1[_a], adminId = _b[0], notifications = _b[1];
                    return [4 /*yield*/, processAdminScheduledQueue(adminId, notifications)];
                case 5:
                    _c.sent();
                    _c.label = 6;
                case 6:
                    _a++;
                    return [3 /*break*/, 4];
                case 7:
                    revertIdsArrayStr = "'{".concat(claimedIds.join(','), "}'");
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["\n      UPDATE scheduled_notifications\n      SET status = 'pending', updated_at = NOW()\n      WHERE id = ANY(", "::text[])\n        AND status = 'processing'\n    "], ["\n      UPDATE scheduled_notifications\n      SET status = 'pending', updated_at = NOW()\n      WHERE id = ANY(", "::text[])\n        AND status = 'processing'\n    "])), drizzle_orm_1.sql.raw(revertIdsArrayStr)))];
                case 8:
                    _c.sent();
                    return [3 /*break*/, 12];
                case 9:
                    error_3 = _c.sent();
                    console.error('📋 [QUEUE SCHEDULER] Erro ao processar fila:', error_3);
                    // Em caso de erro, reverter todas para 'pending'
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_15 || (templateObject_15 = __makeTemplateObject(["\n      UPDATE scheduled_notifications\n      SET status = 'pending', updated_at = NOW()\n      WHERE status = 'processing'\n    "], ["\n      UPDATE scheduled_notifications\n      SET status = 'pending', updated_at = NOW()\n      WHERE status = 'processing'\n    "])))).catch(function (e) { return console.error('Erro ao reverter status:', e); })];
                case 10:
                    // Em caso de erro, reverter todas para 'pending'
                    _c.sent();
                    return [3 /*break*/, 12];
                case 11:
                    // 🔓 Liberar lock
                    isQueueProcessing = false;
                    return [7 /*endfinally*/];
                case 12: return [2 /*return*/];
            }
        });
    });
}
/**
 * Processa notificações agendadas de um admin específico
 */
function processAdminScheduledQueue(adminId, notifications) {
    return __awaiter(this, void 0, void 0, function () {
        var ensureAdminSessionOperational, adminSession, config, businessConfig, minDelay, maxDelay, batchSize, batchPauseSeconds_1, processed, failed, skipped, _loop_1, i, state_1, error_4;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 7, , 8]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./whatsapp"); })];
                case 1:
                    ensureAdminSessionOperational = (_b.sent()).ensureAdminSessionOperational;
                    return [4 /*yield*/, ensureAdminSessionOperational(adminId, {
                            waitMs: 4000,
                            source: "notification_scheduler",
                            allowPersistedAuthRecovery: true,
                        })];
                case 2:
                    adminSession = _b.sent();
                    if (!(adminSession === null || adminSession === void 0 ? void 0 : adminSession.socket)) {
                        console.log("\u26A0\uFE0F [".concat(adminId, "] WhatsApp desconectado - adiando ").concat(notifications.length, " notifica\u00E7\u00F5es"));
                        return [2 /*return*/];
                    }
                    config = notifications[0];
                    // Verificar horário comercial se habilitado
                    if (config === null || config === void 0 ? void 0 : config.respect_business_hours) {
                        businessConfig = {
                            business_hours_start: config.business_hours_start,
                            business_hours_end: config.business_hours_end,
                            business_days: config.business_days
                        };
                        if (!isWithinBusinessHours(businessConfig)) {
                            console.log("\u23F0 [".concat(adminId, "] Fora do hor\u00E1rio comercial - adiando ").concat(notifications.length, " notifica\u00E7\u00F5es"));
                            return [2 /*return*/];
                        }
                    }
                    minDelay = Math.max((config === null || config === void 0 ? void 0 : config.broadcast_min_interval_seconds) || 30, 30);
                    maxDelay = Math.max((config === null || config === void 0 ? void 0 : config.broadcast_max_interval_seconds) || 60, 60);
                    batchSize = 5;
                    batchPauseSeconds_1 = 300;
                    processed = 0;
                    failed = 0;
                    skipped = 0;
                    _loop_1 = function (i) {
                        var notification, recentSendResult, recentCount, dupCheckErr_1, conversationHistory, historyResult, histErr_1, metadata, finalMessage, systemPrompt, variedMessage, sanitized, clientFirstName, isGenericMessage, aiError_1, sent, errorMsg, maxRetries, _loop_2, attempt, state_2, delay_1, error_5;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    notification = notifications[i];
                                    if (!!isModuleEnabledForNotificationType(notification.notification_type, config)) return [3 /*break*/, 2];
                                    console.log("\uD83D\uDCCB [QUEUE] \uD83D\uDEAB Cancelando ".concat(notification.notification_type, " para ").concat(notification.recipient_name, " - m\u00F3dulo desativado"));
                                    skipped++;
                                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_16 || (templateObject_16 = __makeTemplateObject(["\n          UPDATE scheduled_notifications\n          SET\n            status = 'cancelled',\n            updated_at = NOW(),\n            error_message = COALESCE(NULLIF(error_message, ''), 'Cancelado automaticamente: m\u00F3dulo desativado')\n          WHERE id = ", "\n            AND status IN ('pending', 'processing')\n        "], ["\n          UPDATE scheduled_notifications\n          SET\n            status = 'cancelled',\n            updated_at = NOW(),\n            error_message = COALESCE(NULLIF(error_message, ''), 'Cancelado automaticamente: m\u00F3dulo desativado')\n          WHERE id = ", "\n            AND status IN ('pending', 'processing')\n        "])), notification.id))];
                                case 1:
                                    _c.sent();
                                    return [2 /*return*/, "continue"];
                                case 2:
                                    // Verificar limite diário
                                    if (!canSendNotification(adminId)) {
                                        console.log("\uD83D\uDEAB [".concat(adminId, "] Limite di\u00E1rio atingido - parando processamento"));
                                        return [2 /*return*/, "break"];
                                    }
                                    _c.label = 3;
                                case 3:
                                    _c.trys.push([3, 7, , 8]);
                                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_17 || (templateObject_17 = __makeTemplateObject(["\n          SELECT COUNT(*) as count FROM admin_notification_logs\n          WHERE admin_id = ", "\n            AND recipient_phone = ", "\n            AND notification_type = ", "\n            AND status = 'sent'\n            AND created_at >= NOW() - INTERVAL '4 hours'\n        "], ["\n          SELECT COUNT(*) as count FROM admin_notification_logs\n          WHERE admin_id = ", "\n            AND recipient_phone = ", "\n            AND notification_type = ", "\n            AND status = 'sent'\n            AND created_at >= NOW() - INTERVAL '4 hours'\n        "])), adminId, notification.recipient_phone, notification.notification_type))];
                                case 4:
                                    recentSendResult = _c.sent();
                                    recentCount = parseInt(((_a = recentSendResult.rows[0]) === null || _a === void 0 ? void 0 : _a.count) || '0', 10);
                                    if (!(recentCount > 0)) return [3 /*break*/, 6];
                                    console.log("\uD83D\uDCCB [QUEUE] \u23ED\uFE0F PULANDO ".concat(notification.recipient_name, " - j\u00E1 recebeu ").concat(notification.notification_type, " nas \u00FAltimas 4h (").concat(recentCount, "x)"));
                                    skipped++;
                                    // Marcar como sent para não reprocessar
                                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_18 || (templateObject_18 = __makeTemplateObject(["\n            UPDATE scheduled_notifications \n            SET status = 'skipped_duplicate', updated_at = NOW()\n            WHERE id = ", "\n          "], ["\n            UPDATE scheduled_notifications \n            SET status = 'skipped_duplicate', updated_at = NOW()\n            WHERE id = ", "\n          "])), notification.id))];
                                case 5:
                                    // Marcar como sent para não reprocessar
                                    _c.sent();
                                    return [2 /*return*/, "continue"];
                                case 6: return [3 /*break*/, 8];
                                case 7:
                                    dupCheckErr_1 = _c.sent();
                                    console.error('Erro ao verificar duplicata:', dupCheckErr_1);
                                    return [3 /*break*/, 8];
                                case 8:
                                    _c.trys.push([8, 27, , 29]);
                                    conversationHistory = '';
                                    _c.label = 9;
                                case 9:
                                    _c.trys.push([9, 11, , 12]);
                                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_19 || (templateObject_19 = __makeTemplateObject(["\n            SELECT am.text, am.from_me\n            FROM admin_messages am\n            INNER JOIN admin_conversations ac ON am.conversation_id = ac.id\n            WHERE ac.admin_id = ", "\n            AND (ac.contact_number LIKE ", " OR ac.contact_number LIKE ", ")\n            ORDER BY am.timestamp DESC\n            LIMIT 10\n          "], ["\n            SELECT am.text, am.from_me\n            FROM admin_messages am\n            INNER JOIN admin_conversations ac ON am.conversation_id = ac.id\n            WHERE ac.admin_id = ", "\n            AND (ac.contact_number LIKE ", " OR ac.contact_number LIKE ", ")\n            ORDER BY am.timestamp DESC\n            LIMIT 10\n          "])), adminId, '%' + notification.recipient_phone.slice(-8), notification.recipient_phone + '%'))];
                                case 10:
                                    historyResult = _c.sent();
                                    conversationHistory = historyResult.rows.reverse().map(function (msg) {
                                        return "".concat(msg.from_me ? 'Você' : 'Cliente', ": ").concat(msg.text);
                                    }).join('\n');
                                    return [3 /*break*/, 12];
                                case 11:
                                    histErr_1 = _c.sent();
                                    return [3 /*break*/, 12];
                                case 12:
                                    metadata = typeof notification.metadata === 'string'
                                        ? JSON.parse(notification.metadata || '{}')
                                        : notification.metadata || {};
                                    finalMessage = notification.message_template
                                        .replace(/{cliente_nome}/g, notification.recipient_name || 'Cliente')
                                        .replace(/{dias_restantes}/g, metadata.daysBefore || '')
                                        .replace(/{dias_atraso}/g, metadata.daysOverdue || metadata.daysAfter || '')
                                        .replace(/{data_vencimento}/g, metadata.dueDate ?
                                        new Date(metadata.dueDate).toLocaleDateString('pt-BR') : '')
                                        .replace(/{valor}/g, metadata.valor || '');
                                    if (!notification.ai_enabled) return [3 /*break*/, 16];
                                    _c.label = 13;
                                case 13:
                                    _c.trys.push([13, 15, , 16]);
                                    systemPrompt = notification.ai_prompt || (config === null || config === void 0 ? void 0 : config.ai_variation_prompt) ||
                                        'Reescreva esta mensagem de forma natural e personalizada.';
                                    // Adicionar contexto do cliente
                                    systemPrompt += "\n\nO nome do cliente \u00E9: ".concat(notification.recipient_name || 'Cliente');
                                    if (conversationHistory) {
                                        systemPrompt += "\n\nHIST\u00D3RICO DA CONVERSA COM ESTE CLIENTE:\n---\n".concat(conversationHistory, "\n---\n\nUse este contexto para personalizar a mensagem de forma natural.");
                                    }
                                    systemPrompt += '\n\nREGRAS OBRIGATÓRIAS:';
                                    systemPrompt += '\n1. Retorne APENAS UMA ÚNICA mensagem reescrita.';
                                    systemPrompt += '\n2. NÃO gere múltiplas variações ou opções alternativas.';
                                    systemPrompt += '\n3. NÃO use separadores como "---" ou "Ou, se preferir".';
                                    systemPrompt += '\n4. NÃO inclua explicações, aspas, marcadores ou prefixos.';
                                    systemPrompt += '\n5. Use o nome real do cliente na mensagem, NUNCA use {cliente_nome} ou outras variáveis entre chaves.';
                                    systemPrompt += "\n6. O nome do cliente \u00E9: ".concat(notification.recipient_name || 'Cliente', ". Use este nome diretamente.");
                                    return [4 /*yield*/, (0, llm_1.callGroq)([
                                            { role: 'system', content: systemPrompt },
                                            { role: 'user', content: finalMessage }
                                        ], { temperature: 0.7, maxTokens: 400 })];
                                case 14:
                                    variedMessage = _c.sent();
                                    sanitized = sanitizeAIVariation(variedMessage, {
                                        '{cliente_nome}': notification.recipient_name || 'Cliente',
                                        '{dias_restantes}': metadata.daysBefore || '',
                                        '{dias_atraso}': metadata.daysOverdue || metadata.daysAfter || '',
                                        '{data_vencimento}': metadata.dueDate ? new Date(metadata.dueDate).toLocaleDateString('pt-BR') : '',
                                        '{valor}': metadata.valor || '',
                                    });
                                    clientFirstName = (notification.recipient_name || '').split(' ')[0];
                                    isGenericMessage = !sanitized ||
                                        sanitized.length < 20 ||
                                        sanitized.toLowerCase().includes('como posso ajudar') ||
                                        sanitized.toLowerCase().includes('olá! como posso') ||
                                        sanitized.toLowerCase().includes('em que posso ajudar') ||
                                        sanitized.toLowerCase().includes('posso te ajudar') ||
                                        sanitized === 'Olá!' ||
                                        sanitized === 'Oi!' ||
                                        // Verificar se variáveis de template ficaram sem substituir
                                        sanitized.includes('{cliente_nome}') ||
                                        sanitized.includes('{dias_restantes}') ||
                                        sanitized.includes('{data_vencimento}') ||
                                        sanitized.includes('{valor}');
                                    if (!isGenericMessage) {
                                        finalMessage = sanitized;
                                        console.log("\uD83D\uDCCB [QUEUE] \u2705 IA variou mensagem para ".concat(notification.recipient_name));
                                    }
                                    else {
                                        console.log("\uD83D\uDCCB [QUEUE] \u26A0\uFE0F IA retornou mensagem gen\u00E9rica: \"".concat(sanitized.substring(0, 50), "...\", usando ORIGINAL para ").concat(notification.recipient_name));
                                        // Manter finalMessage original - NÃO ALTERAR
                                    }
                                    return [3 /*break*/, 16];
                                case 15:
                                    aiError_1 = _c.sent();
                                    console.error("\uD83D\uDCCB [QUEUE] \u274C Erro IA para ".concat(notification.recipient_name, ":"), aiError_1);
                                    return [3 /*break*/, 16];
                                case 16:
                                    sent = false;
                                    errorMsg = 'Falha desconhecida';
                                    maxRetries = 3;
                                    _loop_2 = function (attempt) {
                                        var sendResult, backoffMs_1, retryErr_1, backoffMs_2;
                                        return __generator(this, function (_d) {
                                            switch (_d.label) {
                                                case 0:
                                                    _d.trys.push([0, 4, , 7]);
                                                    return [4 /*yield*/, (0, whatsapp_1.sendAdminNotification)(adminId, notification.recipient_phone, finalMessage)];
                                                case 1:
                                                    sendResult = _d.sent();
                                                    sent = sendResult.success;
                                                    errorMsg = sendResult.error || 'Falha desconhecida';
                                                    if (sent)
                                                        return [2 /*return*/, "break"];
                                                    if (!(attempt < maxRetries)) return [3 /*break*/, 3];
                                                    backoffMs_1 = Math.pow(2, attempt) * 2000;
                                                    console.log("\uD83D\uDCCB [QUEUE] \u26A0\uFE0F Tentativa ".concat(attempt, "/").concat(maxRetries, " falhou para ").concat(notification.recipient_name, ": ").concat(errorMsg, ". Retry em ").concat(backoffMs_1 / 1000, "s..."));
                                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, backoffMs_1); })];
                                                case 2:
                                                    _d.sent();
                                                    _d.label = 3;
                                                case 3: return [3 /*break*/, 7];
                                                case 4:
                                                    retryErr_1 = _d.sent();
                                                    errorMsg = String(retryErr_1);
                                                    if (!(attempt < maxRetries)) return [3 /*break*/, 6];
                                                    backoffMs_2 = Math.pow(2, attempt) * 2000;
                                                    console.log("\uD83D\uDCCB [QUEUE] \u26A0\uFE0F Tentativa ".concat(attempt, "/").concat(maxRetries, " erro para ").concat(notification.recipient_name, ": ").concat(errorMsg, ". Retry em ").concat(backoffMs_2 / 1000, "s..."));
                                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, backoffMs_2); })];
                                                case 5:
                                                    _d.sent();
                                                    _d.label = 6;
                                                case 6: return [3 /*break*/, 7];
                                                case 7: return [2 /*return*/];
                                            }
                                        });
                                    };
                                    attempt = 1;
                                    _c.label = 17;
                                case 17:
                                    if (!(attempt <= maxRetries)) return [3 /*break*/, 20];
                                    return [5 /*yield**/, _loop_2(attempt)];
                                case 18:
                                    state_2 = _c.sent();
                                    if (state_2 === "break")
                                        return [3 /*break*/, 20];
                                    _c.label = 19;
                                case 19:
                                    attempt++;
                                    return [3 /*break*/, 17];
                                case 20:
                                    if (sent) {
                                        processed++;
                                        incrementDailyCounter(adminId);
                                        console.log("\uD83D\uDCCB [QUEUE] \u2713 Enviado para ".concat(notification.recipient_name, " (").concat(processed, "/").concat(notifications.length, ")"));
                                    }
                                    else {
                                        failed++;
                                        console.log("\uD83D\uDCCB [QUEUE] \u2717 Falha ao enviar para ".concat(notification.recipient_name, " ap\u00F3s ").concat(maxRetries, " tentativas: ").concat(errorMsg));
                                    }
                                    // Atualizar status da notificação
                                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_20 || (templateObject_20 = __makeTemplateObject(["\n          UPDATE scheduled_notifications \n          SET \n            status = ", ",\n            sent_at = NOW(),\n            final_message = ", ",\n            conversation_context = ", ",\n            error_message = ", "\n          WHERE id = ", "\n        "], ["\n          UPDATE scheduled_notifications \n          SET \n            status = ", ",\n            sent_at = NOW(),\n            final_message = ", ",\n            conversation_context = ", ",\n            error_message = ", "\n          WHERE id = ", "\n        "])), sent ? 'sent' : 'failed', finalMessage, conversationHistory || '', sent ? null : errorMsg, notification.id))];
                                case 21:
                                    // Atualizar status da notificação
                                    _c.sent();
                                    // Registrar log
                                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_21 || (templateObject_21 = __makeTemplateObject(["\n          INSERT INTO admin_notification_logs (\n            admin_id, user_id, notification_type, recipient_phone, recipient_name,\n            message_original, message_sent, status, metadata, created_at, sent_at, error_message\n          ) VALUES (\n            ", ", ", ", ", ",\n            ", ", ", ",\n            ", ", ", ", ", ",\n            ", "::jsonb, NOW(), NOW(),\n            ", "\n          )\n        "], ["\n          INSERT INTO admin_notification_logs (\n            admin_id, user_id, notification_type, recipient_phone, recipient_name,\n            message_original, message_sent, status, metadata, created_at, sent_at, error_message\n          ) VALUES (\n            ", ", ", ", ", ",\n            ", ", ", ",\n            ", ", ", ", ", ",\n            ", "::jsonb, NOW(), NOW(),\n            ", "\n          )\n        "])), adminId, notification.user_id, notification.notification_type, notification.recipient_phone, notification.recipient_name, notification.message_template, finalMessage, sent ? 'sent' : 'failed', typeof notification.metadata === 'string' ? notification.metadata : JSON.stringify(notification.metadata), sent ? null : errorMsg))];
                                case 22:
                                    // Registrar log
                                    _c.sent();
                                    delay_1 = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
                                    if (!((i + 1) % batchSize === 0 && i + 1 < notifications.length)) return [3 /*break*/, 24];
                                    console.log("\uD83D\uDCCB [QUEUE] Pausa de ".concat(batchPauseSeconds_1, "s ap\u00F3s lote de ").concat(batchSize, " mensagens..."));
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, batchPauseSeconds_1 * 1000); })];
                                case 23:
                                    _c.sent();
                                    return [3 /*break*/, 26];
                                case 24:
                                    if (!(i + 1 < notifications.length)) return [3 /*break*/, 26];
                                    console.log("\uD83D\uDCCB [QUEUE] Aguardando ".concat(delay_1, "s antes da pr\u00F3xima mensagem..."));
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay_1 * 1000); })];
                                case 25:
                                    _c.sent();
                                    _c.label = 26;
                                case 26: return [3 /*break*/, 29];
                                case 27:
                                    error_5 = _c.sent();
                                    console.error("\uD83D\uDCCB [QUEUE] Erro processando ".concat(notification.recipient_name, ":"), error_5);
                                    failed++;
                                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_22 || (templateObject_22 = __makeTemplateObject(["\n          UPDATE scheduled_notifications \n          SET status = 'failed', error_message = ", "\n          WHERE id = ", "\n        "], ["\n          UPDATE scheduled_notifications \n          SET status = 'failed', error_message = ", "\n          WHERE id = ", "\n        "])), String(error_5), notification.id))];
                                case 28:
                                    _c.sent();
                                    return [3 /*break*/, 29];
                                case 29: return [2 /*return*/];
                            }
                        });
                    };
                    i = 0;
                    _b.label = 3;
                case 3:
                    if (!(i < notifications.length)) return [3 /*break*/, 6];
                    return [5 /*yield**/, _loop_1(i)];
                case 4:
                    state_1 = _b.sent();
                    if (state_1 === "break")
                        return [3 /*break*/, 6];
                    _b.label = 5;
                case 5:
                    i++;
                    return [3 /*break*/, 3];
                case 6:
                    console.log("\uD83D\uDCCB [QUEUE] Admin ".concat(adminId, ": ").concat(processed, " enviados, ").concat(failed, " falhas, ").concat(skipped, " pulados (duplicatas)"));
                    return [3 /*break*/, 8];
                case 7:
                    error_4 = _b.sent();
                    console.error("\uD83D\uDCCB [QUEUE] Erro ao processar admin ".concat(adminId, ":"), error_4);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * Busca configurações de notificação ativas
 */
function getActiveNotificationConfigs() {
    return __awaiter(this, void 0, void 0, function () {
        var result, error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_23 || (templateObject_23 = __makeTemplateObject(["\n      SELECT * FROM admin_notification_config \n      WHERE payment_reminder_enabled = true \n         OR overdue_reminder_enabled = true \n         OR periodic_checkin_enabled = true\n         OR disconnected_alert_enabled = true\n    "], ["\n      SELECT * FROM admin_notification_config \n      WHERE payment_reminder_enabled = true \n         OR overdue_reminder_enabled = true \n         OR periodic_checkin_enabled = true\n         OR disconnected_alert_enabled = true\n    "]))))];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.rows];
                case 2:
                    error_6 = _a.sent();
                    console.error('Erro ao buscar configs de notificação:', error_6);
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Processa notificações para um admin específico
 */
function processAdminNotifications(config) {
    return __awaiter(this, void 0, void 0, function () {
        var adminId, users, _i, users_2, user, error_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    adminId = config.admin_id;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 13, , 14]);
                    // Verificar horário comercial
                    if (config.respect_business_hours && !isWithinBusinessHours(config)) {
                        console.log("\uD83D\uDD14 [".concat(adminId, "] Fora do hor\u00E1rio comercial, pulando..."));
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, getAdminUsers(adminId)];
                case 2:
                    users = _a.sent();
                    _i = 0, users_2 = users;
                    _a.label = 3;
                case 3:
                    if (!(_i < users_2.length)) return [3 /*break*/, 12];
                    user = users_2[_i];
                    if (!config.disconnected_alert_enabled) return [3 /*break*/, 5];
                    return [4 /*yield*/, checkDisconnectedAlert(config, user)];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    if (!(config.payment_reminder_enabled && user.planExpiresAt)) return [3 /*break*/, 7];
                    return [4 /*yield*/, checkPaymentReminder(config, user)];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7:
                    if (!(config.overdue_reminder_enabled && user.planExpiresAt)) return [3 /*break*/, 9];
                    return [4 /*yield*/, checkOverdueReminder(config, user)];
                case 8:
                    _a.sent();
                    _a.label = 9;
                case 9:
                    if (!config.periodic_checkin_enabled) return [3 /*break*/, 11];
                    return [4 /*yield*/, checkPeriodicCheckin(config, user)];
                case 10:
                    _a.sent();
                    _a.label = 11;
                case 11:
                    _i++;
                    return [3 /*break*/, 3];
                case 12: return [3 /*break*/, 14];
                case 13:
                    error_7 = _a.sent();
                    console.error("\uD83D\uDD14 [".concat(adminId, "] Erro ao processar notifica\u00E7\u00F5es:"), error_7);
                    return [3 /*break*/, 14];
                case 14: return [2 /*return*/];
            }
        });
    });
}
/**
 * Verifica se está dentro do horário comercial
 */
function isWithinBusinessHours(config) {
    // Usar fuso horário de Brasília para verificar horário comercial
    var now = new Date();
    var options = { timeZone: 'America/Sao_Paulo' };
    // Obter dia da semana em Brasília
    var dayOfWeek = new Date(now.toLocaleString('en-US', options)).getDay(); // 0 = domingo, 6 = sábado
    // Obter hora atual em Brasília no formato HH:MM
    var currentTime = now.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    // Verificar dia da semana
    var businessDays = config.business_days || [1, 2, 3, 4, 5];
    if (!businessDays.includes(dayOfWeek)) {
        console.log("\u23F0 [BUSINESS HOURS] Dia ".concat(dayOfWeek, " n\u00E3o est\u00E1 nos dias comerciais: ").concat(businessDays));
        return false;
    }
    // Verificar horário
    var startTime = (config.business_hours_start || '09:00').slice(0, 5);
    var endTime = (config.business_hours_end || '18:00').slice(0, 5);
    var isWithin = currentTime >= startTime && currentTime <= endTime;
    console.log("\u23F0 [BUSINESS HOURS] Hora atual BRT: ".concat(currentTime, ", Comercial: ").concat(startTime, "-").concat(endTime, ", Permitido: ").concat(isWithin));
    return isWithin;
}
/**
 * Busca usuários de um admin
 * NOTE: There is NO parent_id column in the users table.
 * In this single-admin system, all users belong to the admin.
 * We exclude the admin's own user record (matched by email from admins table).
 */
function getAdminUsers(adminId) {
    return __awaiter(this, void 0, void 0, function () {
        var result, error_8;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_24 || (templateObject_24 = __makeTemplateObject(["\n      SELECT \n        u.id,\n        u.phone,\n        u.name,\n        COALESCE(wc.is_connected, false) as whatsapp_connected,\n        CASE\n          WHEN COALESCE(wc.is_connected, false) = false THEN wc.updated_at\n          ELSE NULL\n        END as whatsapp_disconnected_at,\n        s.expires_at as plan_expires_at,\n        s.status as subscription_status\n      FROM users u\n      LEFT JOIN LATERAL (\n        SELECT\n          c.is_connected,\n          c.updated_at\n        FROM whatsapp_connections c\n        WHERE c.user_id = u.id\n        ORDER BY c.created_at DESC\n        LIMIT 1\n      ) wc ON true\n      LEFT JOIN subscriptions s ON s.user_id = u.id\n      WHERE u.id != (\n        SELECT uu.id FROM users uu \n        JOIN admins a ON a.email = uu.email \n        WHERE a.id = ", "\n        LIMIT 1\n      )\n      AND u.role != 'owner'\n      ORDER BY u.created_at DESC\n    "], ["\n      SELECT \n        u.id,\n        u.phone,\n        u.name,\n        COALESCE(wc.is_connected, false) as whatsapp_connected,\n        CASE\n          WHEN COALESCE(wc.is_connected, false) = false THEN wc.updated_at\n          ELSE NULL\n        END as whatsapp_disconnected_at,\n        s.expires_at as plan_expires_at,\n        s.status as subscription_status\n      FROM users u\n      LEFT JOIN LATERAL (\n        SELECT\n          c.is_connected,\n          c.updated_at\n        FROM whatsapp_connections c\n        WHERE c.user_id = u.id\n        ORDER BY c.created_at DESC\n        LIMIT 1\n      ) wc ON true\n      LEFT JOIN subscriptions s ON s.user_id = u.id\n      WHERE u.id != (\n        SELECT uu.id FROM users uu \n        JOIN admins a ON a.email = uu.email \n        WHERE a.id = ", "\n        LIMIT 1\n      )\n      AND u.role != 'owner'\n      ORDER BY u.created_at DESC\n    "])), adminId))];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.rows];
                case 2:
                    error_8 = _a.sent();
                    console.error('Erro ao buscar usuários do admin:', error_8);
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Verifica alerta de WhatsApp desconectado
 */
function checkDisconnectedAlert(config, user) {
    return __awaiter(this, void 0, void 0, function () {
        var disconnectedAt, hoursDisconnected, alertHours, recentlySent;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (user.whatsapp_connected)
                        return [2 /*return*/];
                    disconnectedAt = user.whatsapp_disconnected_at ? new Date(user.whatsapp_disconnected_at) : null;
                    if (!disconnectedAt)
                        return [2 /*return*/];
                    hoursDisconnected = (Date.now() - disconnectedAt.getTime()) / (1000 * 60 * 60);
                    alertHours = config.disconnected_alert_hours || 2;
                    if (!(hoursDisconnected >= alertHours)) return [3 /*break*/, 3];
                    return [4 /*yield*/, wasNotificationSentRecently(config.admin_id, user.id, 'disconnected', // ✅ Tipo correto
                        24)];
                case 1:
                    recentlySent = _a.sent();
                    if (!!recentlySent) return [3 /*break*/, 3];
                    // ✅ CORRIGIDO: Usar 'disconnected' para consistência com a fila
                    return [4 /*yield*/, sendNotification(config, user, 'disconnected', {
                            hoursDisconnected: Math.floor(hoursDisconnected),
                        })];
                case 2:
                    // ✅ CORRIGIDO: Usar 'disconnected' para consistência com a fila
                    _a.sent();
                    _a.label = 3;
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Verifica lembrete de pagamento
 */
function checkPaymentReminder(config, user) {
    return __awaiter(this, void 0, void 0, function () {
        var expiresAt, daysUntilExpiration, reminderDays, sortedDays, _i, sortedDays_1, days, recentlySent;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    expiresAt = new Date(user.plan_expires_at);
                    daysUntilExpiration = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    reminderDays = config.payment_reminder_days_before || [7, 3, 1];
                    sortedDays = __spreadArray([], reminderDays, true).sort(function (a, b) { return b - a; });
                    _i = 0, sortedDays_1 = sortedDays;
                    _a.label = 1;
                case 1:
                    if (!(_i < sortedDays_1.length)) return [3 /*break*/, 5];
                    days = sortedDays_1[_i];
                    if (!(daysUntilExpiration > 0 && daysUntilExpiration <= days)) return [3 /*break*/, 4];
                    return [4 /*yield*/, wasNotificationSentRecently(config.admin_id, user.id, 'payment_reminder', 48 // Não reenviar se já enviou nas últimas 48h
                        )];
                case 2:
                    recentlySent = _a.sent();
                    if (!!recentlySent) return [3 /*break*/, 4];
                    return [4 /*yield*/, sendNotification(config, user, 'payment_reminder', {
                            daysUntilExpiration: daysUntilExpiration,
                            expirationDate: expiresAt.toLocaleDateString('pt-BR'),
                        })];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5]; // Enviar apenas um lembrete por vez
                case 4:
                    _i++;
                    return [3 /*break*/, 1];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Verifica notificação de atraso
 */
function checkOverdueReminder(config, user) {
    return __awaiter(this, void 0, void 0, function () {
        var expiresAt, daysOverdue, overdueReminderDays, sortedOverdueDays, _i, sortedOverdueDays_1, days, recentlySent;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    expiresAt = new Date(user.plan_expires_at);
                    daysOverdue = Math.ceil((Date.now() - expiresAt.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysOverdue <= 0)
                        return [2 /*return*/]; // Plano ainda válido
                    overdueReminderDays = config.overdue_reminder_days_after || [1, 3, 7, 14];
                    sortedOverdueDays = __spreadArray([], overdueReminderDays, true).sort(function (a, b) { return a - b; });
                    _i = 0, sortedOverdueDays_1 = sortedOverdueDays;
                    _a.label = 1;
                case 1:
                    if (!(_i < sortedOverdueDays_1.length)) return [3 /*break*/, 5];
                    days = sortedOverdueDays_1[_i];
                    if (!(daysOverdue >= days)) return [3 /*break*/, 4];
                    return [4 /*yield*/, wasNotificationSentRecently(config.admin_id, user.id, 'overdue_reminder', 48)];
                case 2:
                    recentlySent = _a.sent();
                    if (!!recentlySent) return [3 /*break*/, 4];
                    return [4 /*yield*/, sendNotification(config, user, 'overdue_reminder', {
                            daysOverdue: daysOverdue,
                            expirationDate: expiresAt.toLocaleDateString('pt-BR'),
                        })];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    _i++;
                    return [3 /*break*/, 1];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Verifica check-in periódico
 */
function checkPeriodicCheckin(config, user) {
    return __awaiter(this, void 0, void 0, function () {
        var lastLog, minDays, maxDays, randomInterval, daysSinceLastCheckin;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getLastNotificationLog(config.admin_id, user.id, 'periodic_checkin')];
                case 1:
                    lastLog = _a.sent();
                    minDays = config.periodic_checkin_min_days || 7;
                    maxDays = config.periodic_checkin_max_days || 15;
                    randomInterval = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;
                    if (!!lastLog) return [3 /*break*/, 3];
                    // Primeira vez - enviar após intervalo mínimo
                    return [4 /*yield*/, sendNotification(config, user, 'periodic_checkin', {
                            randomInterval: randomInterval,
                        })];
                case 2:
                    // Primeira vez - enviar após intervalo mínimo
                    _a.sent();
                    return [3 /*break*/, 5];
                case 3:
                    daysSinceLastCheckin = Math.ceil((Date.now() - new Date(lastLog.created_at).getTime()) / (1000 * 60 * 60 * 24));
                    if (!(daysSinceLastCheckin >= randomInterval)) return [3 /*break*/, 5];
                    return [4 /*yield*/, sendNotification(config, user, 'periodic_checkin', {
                            daysSinceLastCheckin: daysSinceLastCheckin,
                            randomInterval: randomInterval,
                        })];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Envia uma notificação COM VERIFICAÇÃO DE SESSÃO E RETRY
 */
function sendNotification(config, user, type, data) {
    return __awaiter(this, void 0, void 0, function () {
        var getAdminSession, adminSession, template, message, result, _loop_3, attempt, state_3, error_9;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 11, , 12]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./whatsapp"); })];
                case 1:
                    getAdminSession = (_d.sent()).getAdminSession;
                    adminSession = getAdminSession(config.admin_id);
                    if (!(!adminSession || !((_a = adminSession.socket) === null || _a === void 0 ? void 0 : _a.user))) return [3 /*break*/, 3];
                    console.log("\u26A0\uFE0F [".concat(config.admin_id, "] WhatsApp desconectado - pulando notifica\u00E7\u00E3o"));
                    // Registrar falha por WhatsApp offline
                    return [4 /*yield*/, ((_b = storage_1.storage.createAdminNotificationLog) === null || _b === void 0 ? void 0 : _b.call(storage_1.storage, {
                            adminId: config.admin_id,
                            userId: user.id,
                            notificationType: type,
                            recipientPhone: user.phone,
                            recipientName: user.name,
                            messageSent: '',
                            messageOriginal: '',
                            status: 'failed',
                            errorMessage: 'WhatsApp do admin desconectado',
                            metadata: data,
                        }))];
                case 2:
                    // Registrar falha por WhatsApp offline
                    _d.sent();
                    return [2 /*return*/];
                case 3:
                    // ✅ VERIFICAR LIMITE DIÁRIO
                    if (!canSendNotification(config.admin_id)) {
                        console.log("\uD83D\uDEAB [".concat(config.admin_id, "] Limite di\u00E1rio atingido (").concat(DAILY_NOTIFICATION_LIMIT, "/dia)"));
                        return [2 /*return*/];
                    }
                    template = '';
                    switch (type) {
                        case 'payment_reminder':
                            template = config.payment_reminder_message_template || '';
                            break;
                        case 'overdue_reminder':
                            template = config.overdue_reminder_message_template || '';
                            break;
                        case 'periodic_checkin':
                            template = config.periodic_checkin_message_template || '';
                            break;
                        case 'disconnected': // ✅ CORRIGIDO: Aceita 'disconnected' (tipo padronizado)
                        case 'disconnected_alert': // Mantém retrocompatibilidade
                            template = config.disconnected_alert_message_template || '';
                            break;
                    }
                    if (!template) {
                        console.log("\uD83D\uDD14 Template vazio para ".concat(type, ", pulando..."));
                        return [2 /*return*/];
                    }
                    message = template
                        .replace(/\{cliente_nome\}/g, user.name || 'Cliente')
                        .replace(/\{nome\}/g, user.name || 'Cliente')
                        .replace(/\{dias_restantes\}/g, data.daysUntilExpiration || '')
                        .replace(/\{dias_atraso\}/g, data.daysOverdue || '')
                        .replace(/\{dias\}/g, data.daysUntilExpiration || data.daysOverdue || data.daysSinceLastCheckin || '')
                        .replace(/\{data_vencimento\}/g, data.expirationDate || '')
                        .replace(/\{data\}/g, data.expirationDate || '')
                        .replace(/\{valor\}/g, data.valor || '')
                        .replace(/\{horas\}/g, data.hoursDisconnected || '');
                    if (!config.ai_variation_enabled) return [3 /*break*/, 5];
                    return [4 /*yield*/, applyAIVariation(message, config.ai_variation_prompt, user.name)];
                case 4:
                    message = _d.sent();
                    _d.label = 5;
                case 5:
                    result = { success: false, error: '' };
                    _loop_3 = function (attempt) {
                        var backoffMs_3;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0: return [4 /*yield*/, (0, whatsapp_1.sendAdminNotification)(config.admin_id, user.phone, message)];
                                case 1:
                                    result = _e.sent();
                                    if (result.success)
                                        return [2 /*return*/, "break"];
                                    if (!(attempt < 3)) return [3 /*break*/, 3];
                                    backoffMs_3 = Math.pow(2, attempt) * 1000;
                                    console.log("\u23F3 [".concat(config.admin_id, "] Tentativa ").concat(attempt, " falhou, aguardando ").concat(backoffMs_3, "ms..."));
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, backoffMs_3); })];
                                case 2:
                                    _e.sent();
                                    _e.label = 3;
                                case 3: return [2 /*return*/];
                            }
                        });
                    };
                    attempt = 1;
                    _d.label = 6;
                case 6:
                    if (!(attempt <= 3)) return [3 /*break*/, 9];
                    return [5 /*yield**/, _loop_3(attempt)];
                case 7:
                    state_3 = _d.sent();
                    if (state_3 === "break")
                        return [3 /*break*/, 9];
                    _d.label = 8;
                case 8:
                    attempt++;
                    return [3 /*break*/, 6];
                case 9: 
                // Registrar log
                return [4 /*yield*/, ((_c = storage_1.storage.createAdminNotificationLog) === null || _c === void 0 ? void 0 : _c.call(storage_1.storage, {
                        adminId: config.admin_id,
                        userId: user.id,
                        notificationType: type,
                        recipientPhone: user.phone,
                        recipientName: user.name,
                        messageSent: message,
                        messageOriginal: template,
                        status: result.success ? 'sent' : 'failed',
                        errorMessage: result.error,
                        metadata: __assign(__assign({}, data), { aiVariationUsed: config.ai_variation_enabled }),
                    }))];
                case 10:
                    // Registrar log
                    _d.sent();
                    if (result.success) {
                        // Incrementar contador diário
                        incrementDailyCounter(config.admin_id);
                        console.log("\u2705 [".concat(config.admin_id, "] ").concat(type, " enviado para ").concat(user.phone));
                    }
                    else {
                        console.error("\u274C [".concat(config.admin_id, "] Falha ao enviar ").concat(type, " ap\u00F3s 3 tentativas:"), result.error);
                    }
                    return [3 /*break*/, 12];
                case 11:
                    error_9 = _d.sent();
                    console.error("\uD83D\uDD14 Erro ao enviar notifica\u00E7\u00E3o ".concat(type, ":"), error_9);
                    return [3 /*break*/, 12];
                case 12: return [2 /*return*/];
            }
        });
    });
}
/**
 * ✅ APLICA VARIAÇÃO COM IA NA MENSAGEM - GERA MENSAGEM ÚNICA PARA CADA CLIENTE
 * Isso evita detecção de bot pelo WhatsApp
 * ✅ CORRIGIDO: Agora garante UMA ÚNICA variação e substitui {cliente_nome}
 */
function applyAIVariation(message, customPrompt, clientName) {
    return __awaiter(this, void 0, void 0, function () {
        var prompt_1, result, sanitized, isGenericMessage, error_10;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    prompt_1 = customPrompt ||
                        "Reescreva esta mensagem mantendo o mesmo significado mas com palavras e estrutura diferentes.\n      Mantenha tom profissional e cordial.\n      Varie sauda\u00E7\u00F5es, conectivos e express\u00F5es.";
                    // ✅ Adicionar regras obrigatórias ao prompt
                    prompt_1 += '\n\nREGRAS OBRIGATÓRIAS:';
                    prompt_1 += '\n1. Retorne APENAS UMA ÚNICA mensagem reescrita.';
                    prompt_1 += '\n2. NÃO gere múltiplas variações ou opções alternativas.';
                    prompt_1 += '\n3. NÃO use separadores como "---" ou "Ou, se preferir".';
                    prompt_1 += '\n4. NÃO inclua explicações, aspas, marcadores ou prefixos.';
                    prompt_1 += '\n5. NÃO use variáveis como {cliente_nome} - use o nome real do cliente diretamente.';
                    if (clientName) {
                        prompt_1 += "\n6. O nome do cliente \u00E9: ".concat(clientName, ". Use este nome diretamente na mensagem.");
                    }
                    return [4 /*yield*/, (0, llm_1.callGroq)([
                            { role: 'system', content: prompt_1 },
                            { role: 'user', content: message },
                        ], {
                            temperature: 0.7,
                            max_tokens: 400,
                        })];
                case 1:
                    result = _a.sent();
                    sanitized = sanitizeAIVariation(result, {
                        '{cliente_nome}': clientName || 'Cliente',
                    });
                    isGenericMessage = !sanitized ||
                        sanitized.length < 20 ||
                        sanitized.toLowerCase().includes('como posso ajudar') ||
                        sanitized.toLowerCase().includes('olá! como posso') ||
                        sanitized.toLowerCase().includes('em que posso ajudar') ||
                        sanitized.toLowerCase().includes('posso te ajudar') ||
                        sanitized === 'Olá!' ||
                        sanitized === 'Oi!' ||
                        // Verificar se variáveis de template ficaram sem substituir
                        sanitized.includes('{cliente_nome}') ||
                        sanitized.includes('{dias_restantes}') ||
                        sanitized.includes('{data_vencimento}') ||
                        sanitized.includes('{valor}');
                    if (isGenericMessage) {
                        console.log("\u26A0\uFE0F [AI VARIATION] Mensagem gen\u00E9rica detectada, usando original: \"".concat(sanitized.substring(0, 30), "...\""));
                        return [2 /*return*/, message]; // Retornar mensagem original
                    }
                    return [2 /*return*/, sanitized];
                case 2:
                    error_10 = _a.sent();
                    console.error('⚠️ Erro ao aplicar variação IA:', error_10);
                    return [2 /*return*/, message]; // Retornar mensagem original se falhar
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * ✅ VERIFICA SE PODE ENVIAR NOTIFICAÇÃO (limite diário)
 */
function canSendNotification(adminId) {
    var today = new Date().toISOString().split('T')[0];
    var key = "".concat(adminId, "_").concat(today);
    var counter = dailyCounters.get(key);
    if (!counter || counter.date !== today) {
        // Novo dia ou primeiro envio
        return true;
    }
    return counter.count < DAILY_NOTIFICATION_LIMIT;
}
/**
 * ✅ INCREMENTA CONTADOR DIÁRIO
 */
function incrementDailyCounter(adminId) {
    var today = new Date().toISOString().split('T')[0];
    var key = "".concat(adminId, "_").concat(today);
    var counter = dailyCounters.get(key);
    if (!counter || counter.date !== today) {
        dailyCounters.set(key, { count: 1, date: today });
    }
    else {
        counter.count++;
    }
}
/**
 * ✅ LIMPA CONTADORES ANTIGOS (executar diariamente)
 */
function cleanOldCounters() {
    var today = new Date().toISOString().split('T')[0];
    for (var _i = 0, _a = dailyCounters.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], counter = _b[1];
        if (counter.date !== today) {
            dailyCounters.delete(key);
        }
    }
}
/**
 * Verifica se uma notificação foi enviada recentemente
 */
function wasNotificationSentRecently(adminId, userId, notificationType, hoursAgo) {
    return __awaiter(this, void 0, void 0, function () {
        var cutoffTime, result, error_11;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_25 || (templateObject_25 = __makeTemplateObject(["\n      SELECT COUNT(*) as count FROM admin_notification_logs\n      WHERE admin_id = ", "\n        AND user_id = ", "\n        AND notification_type = ", "\n        AND created_at >= ", "\n        AND status = 'sent'\n      LIMIT 1\n    "], ["\n      SELECT COUNT(*) as count FROM admin_notification_logs\n      WHERE admin_id = ", "\n        AND user_id = ", "\n        AND notification_type = ", "\n        AND created_at >= ", "\n        AND status = 'sent'\n      LIMIT 1\n    "])), adminId, userId, notificationType, cutoffTime.toISOString()))];
                case 1:
                    result = _b.sent();
                    return [2 /*return*/, (((_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.count) || 0) > 0];
                case 2:
                    error_11 = _b.sent();
                    console.error('Erro ao verificar notificação recente:', error_11);
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Busca último log de notificação
 */
function getLastNotificationLog(adminId, userId, notificationType) {
    return __awaiter(this, void 0, void 0, function () {
        var result, error_12;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_26 || (templateObject_26 = __makeTemplateObject(["\n      SELECT * FROM admin_notification_logs\n      WHERE admin_id = ", "\n        AND user_id = ", "\n        AND notification_type = ", "\n        AND status = 'sent'\n      ORDER BY created_at DESC\n      LIMIT 1\n    "], ["\n      SELECT * FROM admin_notification_logs\n      WHERE admin_id = ", "\n        AND user_id = ", "\n        AND notification_type = ", "\n        AND status = 'sent'\n      ORDER BY created_at DESC\n      LIMIT 1\n    "])), adminId, userId, notificationType))];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.rows[0] || null];
                case 2:
                    error_12 = _a.sent();
                    console.error('Erro ao buscar último log:', error_12);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * 📦 VERIFICA E ATUALIZA PLANOS VENCIDOS AUTOMATICAMENTE
 *
 * Esta função é executada periodicamente para:
 * 1. Encontrar subscriptions com status='active' mas data_fim < NOW()
 * 2. Marcar essas subscriptions como 'expired'
 * 3. Logar as alterações para auditoria
 *
 * IMPORTANTE: Clientes com plano vencido voltam ao limite de 25 mensagens de teste
 * A verificação de limite é feita no whatsapp.ts ao processar mensagens
 */
function processExpiredSubscriptions() {
    return __awaiter(this, void 0, void 0, function () {
        var result, expiredSubs, _i, expiredSubs_1, sub, logError_1, error_13;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 10, , 11]);
                    console.log('📦 [SUBSCRIPTION CHECKER] Verificando planos vencidos...');
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_27 || (templateObject_27 = __makeTemplateObject(["\n      UPDATE subscriptions\n      SET status = 'expired', updated_at = NOW()\n      WHERE status = 'active'\n        AND data_fim IS NOT NULL\n        AND data_fim < NOW()\n        AND (\n          -- Se n\u00E3o \u00E9 pagamento recorrente, expira imediatamente\n          next_payment_date IS NULL\n          OR\n          -- Se \u00E9 recorrente, d\u00E1 5 dias de car\u00EAncia ap\u00F3s next_payment_date\n          next_payment_date + INTERVAL '5 days' < NOW()\n        )\n      RETURNING id, user_id, data_fim, plan_id\n    "], ["\n      UPDATE subscriptions\n      SET status = 'expired', updated_at = NOW()\n      WHERE status = 'active'\n        AND data_fim IS NOT NULL\n        AND data_fim < NOW()\n        AND (\n          -- Se n\u00E3o \u00E9 pagamento recorrente, expira imediatamente\n          next_payment_date IS NULL\n          OR\n          -- Se \u00E9 recorrente, d\u00E1 5 dias de car\u00EAncia ap\u00F3s next_payment_date\n          next_payment_date + INTERVAL '5 days' < NOW()\n        )\n      RETURNING id, user_id, data_fim, plan_id\n    "]))))];
                case 1:
                    result = _a.sent();
                    expiredSubs = result.rows;
                    if (!(expiredSubs.length > 0)) return [3 /*break*/, 8];
                    console.log("\uD83D\uDCE6 [SUBSCRIPTION CHECKER] \u26A0\uFE0F ".concat(expiredSubs.length, " plano(s) marcado(s) como expirado(s):"));
                    _i = 0, expiredSubs_1 = expiredSubs;
                    _a.label = 2;
                case 2:
                    if (!(_i < expiredSubs_1.length)) return [3 /*break*/, 7];
                    sub = expiredSubs_1[_i];
                    console.log("   - Subscription ".concat(sub.id, ": User ").concat(sub.user_id, ", venceu em ").concat(sub.data_fim));
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_28 || (templateObject_28 = __makeTemplateObject(["\n            INSERT INTO admin_notification_logs (\n              id, admin_id, user_id, client_phone, \n              notification_type, message_content, status, created_at\n            ) VALUES (\n              ", ",\n              ", ",\n              ", ",\n              'SYSTEM',\n              'subscription_expired',\n              ", ",\n              'sent',\n              NOW()\n            )\n          "], ["\n            INSERT INTO admin_notification_logs (\n              id, admin_id, user_id, client_phone, \n              notification_type, message_content, status, created_at\n            ) VALUES (\n              ", ",\n              ", ",\n              ", ",\n              'SYSTEM',\n              'subscription_expired',\n              ", ",\n              'sent',\n              NOW()\n            )\n          "])), crypto_1.default.randomUUID(), sub.user_id, sub.user_id, 'Plano expirado automaticamente. data_fim: ' + sub.data_fim + '. Cliente volta ao limite de 25 mensagens de teste.'))];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 5:
                    logError_1 = _a.sent();
                    console.error('Erro ao logar expiração:', logError_1);
                    return [3 /*break*/, 6];
                case 6:
                    _i++;
                    return [3 /*break*/, 2];
                case 7: return [3 /*break*/, 9];
                case 8:
                    console.log('📦 [SUBSCRIPTION CHECKER] ✅ Nenhum plano vencido para atualizar');
                    _a.label = 9;
                case 9: return [3 /*break*/, 11];
                case 10:
                    error_13 = _a.sent();
                    console.error('📦 [SUBSCRIPTION CHECKER] Erro:', error_13);
                    return [3 /*break*/, 11];
                case 11: return [2 /*return*/];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14, templateObject_15, templateObject_16, templateObject_17, templateObject_18, templateObject_19, templateObject_20, templateObject_21, templateObject_22, templateObject_23, templateObject_24, templateObject_25, templateObject_26, templateObject_27, templateObject_28;
