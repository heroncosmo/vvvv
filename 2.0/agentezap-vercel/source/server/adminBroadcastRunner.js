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
exports.buildAdminBroadcastSnapshot = buildAdminBroadcastSnapshot;
exports.startAdminBroadcastRun = startAdminBroadcastRun;
exports.startAdminBroadcastRecoveryLoop = startAdminBroadcastRecoveryLoop;
var storage_1 = require("./storage");
var notificationSchedulerService_1 = require("./notificationSchedulerService");
var whatsapp_1 = require("./whatsapp");
var adminBulkSendThrottle_1 = require("./adminBulkSendThrottle");
var ADMIN_BROADCAST_RECOVERY_INTERVAL_MS = 60000;
var ADMIN_BROADCAST_SESSION_WAIT_MS = 5 * 60000;
var ADMIN_BROADCAST_SESSION_POLL_MS = 15000;
var ADMIN_BROADCAST_AI_PREFETCH_WINDOW_DEFAULT = 20;
var ADMIN_BROADCAST_AI_PREFETCH_WINDOW_MAX = 50;
var ADMIN_BROADCAST_AI_MAX_ATTEMPTS = 3;
var activeBroadcastTasks = new Map();
var recoveryLoop = null;
function sleep(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
function getAiPrefetchWindow() {
    var rawValue = Number(process.env.ADMIN_BROADCAST_AI_PREFETCH_WINDOW || ADMIN_BROADCAST_AI_PREFETCH_WINDOW_DEFAULT);
    if (!Number.isFinite(rawValue)) {
        return ADMIN_BROADCAST_AI_PREFETCH_WINDOW_DEFAULT;
    }
    return Math.max(1, Math.min(Math.floor(rawValue), ADMIN_BROADCAST_AI_PREFETCH_WINDOW_MAX));
}
function onlyDigits(value) {
    var digits = "";
    for (var _i = 0, _a = String(value || ""); _i < _a.length; _i++) {
        var char = _a[_i];
        if (char >= "0" && char <= "9") {
            digits += char;
        }
    }
    return digits;
}
function normalizePhone(phone) {
    var digits = onlyDigits(phone);
    if (!digits) {
        return "";
    }
    if (!digits.startsWith("55") && digits.length <= 11) {
        return "55".concat(digits);
    }
    return digits;
}
function parseTimestamp(value) {
    if (!value) {
        return 0;
    }
    if (value instanceof Date) {
        return value.getTime();
    }
    var parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
}
function getUserCreatedAt(user) {
    return parseTimestamp((user === null || user === void 0 ? void 0 : user.created_at) || (user === null || user === void 0 ? void 0 : user.createdAt));
}
function validateRecipientPhone(phone) {
    var normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return {
            isValid: false,
            normalizedPhone: normalizedPhone,
            errorMessage: "Usuario sem telefone cadastrado",
        };
    }
    if (normalizedPhone.length < 12 || normalizedPhone.length > 13) {
        return {
            isValid: false,
            normalizedPhone: normalizedPhone,
            errorMessage: "Telefone invalido no cadastro: ".concat(phone),
        };
    }
    return {
        isValid: true,
        normalizedPhone: normalizedPhone,
        errorMessage: undefined,
    };
}
function getProgressKey(userId, phone) {
    if (userId) {
        return "user:".concat(userId);
    }
    return "phone:".concat(normalizePhone(phone));
}
function getBroadcastKey(adminId, broadcastId) {
    return "".concat(adminId, ":").concat(broadcastId);
}
function getConfigFlag(primary, secondary, fallback) {
    if (primary !== undefined) {
        return primary;
    }
    if (secondary !== undefined) {
        return secondary;
    }
    return fallback;
}
function getThrottleConfig(config) {
    var _a, _b, _c, _d;
    var rawMin = Number((_b = (_a = config === null || config === void 0 ? void 0 : config.broadcast_min_interval_seconds) !== null && _a !== void 0 ? _a : config === null || config === void 0 ? void 0 : config.broadcastMinIntervalSeconds) !== null && _b !== void 0 ? _b : 60);
    var rawMax = Number((_d = (_c = config === null || config === void 0 ? void 0 : config.broadcast_max_interval_seconds) !== null && _c !== void 0 ? _c : config === null || config === void 0 ? void 0 : config.broadcastMaxIntervalSeconds) !== null && _d !== void 0 ? _d : rawMin);
    var minIntervalSeconds = Math.max(Number.isFinite(rawMin) ? rawMin : 60, 60);
    var maxIntervalSeconds = Math.max(Number.isFinite(rawMax) ? rawMax : minIntervalSeconds, minIntervalSeconds);
    return { minIntervalSeconds: minIntervalSeconds, maxIntervalSeconds: maxIntervalSeconds };
}
function waitForAdminBulkThrottle(adminId, config, label) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, minIntervalSeconds, maxIntervalSeconds, slot;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = getThrottleConfig(config), minIntervalSeconds = _a.minIntervalSeconds, maxIntervalSeconds = _a.maxIntervalSeconds;
                    return [4 /*yield*/, (0, adminBulkSendThrottle_1.waitForAdminBulkSendWindow)(adminId, {
                            minIntervalSeconds: minIntervalSeconds,
                            maxIntervalSeconds: maxIntervalSeconds,
                            scope: "admin-bulk-send",
                        })];
                case 1:
                    slot = _b.sent();
                    if (slot.waitMs > 0) {
                        console.log("[ADMIN BROADCAST] ".concat(label, ": aguardou ").concat(Math.floor(slot.waitMs / 1000), "s antes do envio #").concat(slot.reservedIndex));
                    }
                    if (slot.batchPauseApplied) {
                        console.log("[ADMIN BROADCAST] ".concat(label, ": pausa longa aplicada apos o lote #").concat(slot.reservedIndex - 1));
                    }
                    return [2 /*return*/, slot];
            }
        });
    });
}
function waitForAdminSession(adminId, broadcastId) {
    return __awaiter(this, void 0, void 0, function () {
        var deadline, session;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    deadline = Date.now() + ADMIN_BROADCAST_SESSION_WAIT_MS;
                    _b.label = 1;
                case 1:
                    if (!(Date.now() < deadline)) return [3 /*break*/, 3];
                    session = (0, whatsapp_1.getAdminSession)(adminId);
                    if ((_a = session === null || session === void 0 ? void 0 : session.socket) === null || _a === void 0 ? void 0 : _a.user) {
                        return [2 /*return*/, true];
                    }
                    console.log("[ADMIN BROADCAST ".concat(broadcastId, "] Sessao do admin indisponivel. Aguardando reconexao por ").concat(Math.floor(ADMIN_BROADCAST_SESSION_POLL_MS / 1000), "s..."));
                    return [4 /*yield*/, sleep(ADMIN_BROADCAST_SESSION_POLL_MS)];
                case 2:
                    _b.sent();
                    return [3 /*break*/, 1];
                case 3: return [2 /*return*/, false];
            }
        });
    });
}
function buildRecipientsFromUsers(users) {
    return users.map(function (user) {
        var phone = user.phone || user.whatsappNumber || "";
        var name = user.name || user.fullName || "Cliente";
        return {
            userId: user.id,
            phone: phone,
            name: name,
            progressKey: getProgressKey(user.id, phone),
        };
    });
}
function filterUsersByTargetType(users, subscriptions, targetType) {
    if (targetType === "with_plan") {
        return users.filter(function (user) {
            return subscriptions === null || subscriptions === void 0 ? void 0 : subscriptions.some(function (subscription) { return subscription.userId === user.id && subscription.status === "active"; });
        });
    }
    if (targetType === "without_plan") {
        return users.filter(function (user) {
            return !(subscriptions === null || subscriptions === void 0 ? void 0 : subscriptions.some(function (subscription) { return subscription.userId === user.id && subscription.status === "active"; }));
        });
    }
    return users;
}
function buildAdminBroadcastSnapshot(targetType) {
    return __awaiter(this, void 0, void 0, function () {
        var users, subscriptions, recipients;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, storage_1.storage.getAllUsers()];
                case 1:
                    users = _b.sent();
                    return [4 /*yield*/, ((_a = storage_1.storage.getAllSubscriptions) === null || _a === void 0 ? void 0 : _a.call(storage_1.storage))];
                case 2:
                    subscriptions = _b.sent();
                    recipients = filterUsersByTargetType(users, subscriptions, targetType);
                    return [2 /*return*/, {
                            totalRecipients: recipients.length,
                            targetFilter: {
                                userIds: recipients.map(function (user) { return user.id; }),
                                targetType: targetType,
                                createdAt: new Date().toISOString(),
                            },
                        }];
            }
        });
    });
}
function resolveRecipientsForBroadcast(broadcast) {
    return __awaiter(this, void 0, void 0, function () {
        var users, subscriptions, snapshot, usersById_1, snapshottedUsers, recipients_1, targetType, broadcastCreatedAt, filteredUsers, beforeCount, recipients;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, storage_1.storage.getAllUsers()];
                case 1:
                    users = _c.sent();
                    return [4 /*yield*/, ((_a = storage_1.storage.getAllSubscriptions) === null || _a === void 0 ? void 0 : _a.call(storage_1.storage))];
                case 2:
                    subscriptions = _c.sent();
                    snapshot = (broadcast.target_filter || broadcast.targetFilter || null);
                    if ((_b = snapshot === null || snapshot === void 0 ? void 0 : snapshot.userIds) === null || _b === void 0 ? void 0 : _b.length) {
                        usersById_1 = new Map(users.map(function (user) { return [user.id, user]; }));
                        snapshottedUsers = snapshot.userIds
                            .map(function (userId) { return usersById_1.get(userId); })
                            .filter(Boolean);
                        recipients_1 = buildRecipientsFromUsers(snapshottedUsers);
                        return [2 /*return*/, {
                                recipients: recipients_1,
                                resolvedTotalRecipients: recipients_1.length,
                            }];
                    }
                    targetType = broadcast.target_type || broadcast.targetType || "all";
                    broadcastCreatedAt = parseTimestamp(broadcast.created_at || broadcast.createdAt);
                    filteredUsers = filterUsersByTargetType(users, subscriptions, targetType);
                    if (broadcastCreatedAt > 0) {
                        beforeCount = filteredUsers.length;
                        filteredUsers = filteredUsers.filter(function (user) {
                            var userCreatedAt = getUserCreatedAt(user);
                            return userCreatedAt === 0 || userCreatedAt <= broadcastCreatedAt;
                        });
                        if (beforeCount !== filteredUsers.length) {
                            console.log("[ADMIN BROADCAST ".concat(broadcast.id, "] Snapshot legado materializado removendo ").concat(beforeCount - filteredUsers.length, " usuario(s) criados apos a campanha."));
                        }
                    }
                    recipients = buildRecipientsFromUsers(filteredUsers);
                    return [2 /*return*/, {
                            recipients: recipients,
                            resolvedTotalRecipients: recipients.length,
                            materializedSnapshot: {
                                userIds: filteredUsers.map(function (user) { return user.id; }),
                                targetType: targetType,
                                createdAt: new Date().toISOString(),
                            },
                        }];
            }
        });
    });
}
function getProgressSnapshot(broadcastId) {
    return __awaiter(this, void 0, void 0, function () {
        var messages, sentCount, failedCount, processedKeys, _i, messages_1, message;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, ((_a = storage_1.storage.getBroadcastMessages) === null || _a === void 0 ? void 0 : _a.call(storage_1.storage, broadcastId))];
                case 1:
                    messages = (_b.sent()) || [];
                    sentCount = 0;
                    failedCount = 0;
                    processedKeys = new Set();
                    for (_i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
                        message = messages_1[_i];
                        if (message.status === "sent") {
                            sentCount += 1;
                        }
                        else if (message.status === "failed") {
                            failedCount += 1;
                        }
                        processedKeys.add(getProgressKey(message.user_id || message.userId || undefined, message.recipient_phone || message.recipientPhone || ""));
                    }
                    return [2 /*return*/, { sentCount: sentCount, failedCount: failedCount, processedKeys: processedKeys }];
            }
        });
    });
}
function buildAiMessageWithRetry(baseMessage, prompt, recipientName, broadcastId, index) {
    return __awaiter(this, void 0, void 0, function () {
        var attempt, latestMessage, error_1, backoffMs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    attempt = 0;
                    latestMessage = baseMessage;
                    _a.label = 1;
                case 1:
                    if (!(attempt < ADMIN_BROADCAST_AI_MAX_ATTEMPTS)) return [3 /*break*/, 8];
                    attempt += 1;
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, (0, notificationSchedulerService_1.applyAIVariation)(baseMessage, prompt, recipientName)];
                case 3:
                    latestMessage = _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    latestMessage = baseMessage;
                    console.warn("[ADMIN BROADCAST ".concat(broadcastId, "] IA falhou para ").concat(recipientName, " (indice ").concat(index + 1, ", tentativa ").concat(attempt, "/").concat(ADMIN_BROADCAST_AI_MAX_ATTEMPTS, "): ").concat(error_1 instanceof Error ? error_1.message : String(error_1)));
                    return [3 /*break*/, 5];
                case 5:
                    if (latestMessage.trim() && latestMessage.trim() !== baseMessage.trim()) {
                        return [2 /*return*/, latestMessage];
                    }
                    if (!(attempt < ADMIN_BROADCAST_AI_MAX_ATTEMPTS)) return [3 /*break*/, 7];
                    backoffMs = attempt * 2000;
                    console.warn("[ADMIN BROADCAST ".concat(broadcastId, "] IA retornou mensagem inalterada para ").concat(recipientName, " (indice ").concat(index + 1, ", tentativa ").concat(attempt, "/").concat(ADMIN_BROADCAST_AI_MAX_ATTEMPTS, "). Nova tentativa em ").concat(Math.floor(backoffMs / 1000), "s."));
                    return [4 /*yield*/, sleep(backoffMs)];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7: return [3 /*break*/, 1];
                case 8: return [2 /*return*/, latestMessage || baseMessage];
            }
        });
    });
}
function createAiPrefetcher(params) {
    var cache = new Map();
    var prefetchWindow = getAiPrefetchWindow();
    var ensure = function (index) {
        if (!params.enabled || cache.has(index) || index >= params.recipients.length) {
            return;
        }
        var recipient = params.recipients[index];
        cache.set(index, buildAiMessageWithRetry(params.templateBuilder(recipient), params.prompt, recipient.name, params.broadcastId, index));
    };
    var prefetch = function (fromIndex) {
        for (var index = fromIndex; index < Math.min(fromIndex + prefetchWindow, params.recipients.length); index += 1) {
            ensure(index);
        }
    };
    return {
        prefetch: prefetch,
        get: function (index) {
            return __awaiter(this, void 0, void 0, function () {
                var _a;
                return __generator(this, function (_b) {
                    ensure(index);
                    return [2 /*return*/, (_a = cache.get(index)) !== null && _a !== void 0 ? _a : Promise.resolve(params.templateBuilder(params.recipients[index]))];
                });
            });
        },
    };
}
function sendBroadcastMessageWithRetry(params) {
    return __awaiter(this, void 0, void 0, function () {
        var lastError, attempt, result, sessionReady, backoffMs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    lastError = "Falha desconhecida";
                    attempt = 1;
                    _a.label = 1;
                case 1:
                    if (!(attempt <= 3)) return [3 /*break*/, 6];
                    return [4 /*yield*/, (0, whatsapp_1.sendAdminNotification)(params.adminId, params.phone, params.message)];
                case 2:
                    result = _a.sent();
                    if (result.success) {
                        return [2 /*return*/, { success: true, error: undefined }];
                    }
                    lastError = result.error || lastError;
                    console.warn("[ADMIN BROADCAST ".concat(params.broadcastId, "] Falha ao enviar para ").concat(params.recipientName, " (tentativa ").concat(attempt, "/3): ").concat(lastError));
                    if (!(attempt < 3)) return [3 /*break*/, 5];
                    return [4 /*yield*/, waitForAdminSession(params.adminId, params.broadcastId)];
                case 3:
                    sessionReady = _a.sent();
                    if (!sessionReady) {
                        return [2 /*return*/, { success: false, error: "Sessao do admin indisponivel durante retry" }];
                    }
                    backoffMs = Math.pow(2, attempt) * 1000;
                    return [4 /*yield*/, sleep(backoffMs)];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    attempt += 1;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, { success: false, error: lastError }];
            }
        });
    });
}
function executeAdminBroadcast(adminId, broadcastId, trigger) {
    return __awaiter(this, void 0, void 0, function () {
        var broadcast, _a, initialSent, initialFailed, processedKeys, config, resolvedRecipients, recipients, totalRecipients, sentCount, failedCount, messageTemplate, aiEnabled, aiPrompt, prefetcher, index, recipient, currentBroadcast, baseMessage, phoneValidation, sessionReady, finalMessage, success, errorMessage, result;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        return __generator(this, function (_s) {
            switch (_s.label) {
                case 0: return [4 /*yield*/, ((_b = storage_1.storage.getAdminBroadcast) === null || _b === void 0 ? void 0 : _b.call(storage_1.storage, adminId, broadcastId))];
                case 1:
                    broadcast = _s.sent();
                    if (!broadcast) {
                        console.warn("[ADMIN BROADCAST ".concat(broadcastId, "] Broadcast nao encontrado para execucao."));
                        return [2 /*return*/];
                    }
                    if (broadcast.status === "completed" || broadcast.status === "cancelled") {
                        console.log("[ADMIN BROADCAST ".concat(broadcastId, "] Ignorando execucao porque status=").concat(broadcast.status, "."));
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, getProgressSnapshot(broadcastId)];
                case 2:
                    _a = _s.sent(), initialSent = _a.sentCount, initialFailed = _a.failedCount, processedKeys = _a.processedKeys;
                    return [4 /*yield*/, ((_c = storage_1.storage.getAdminNotificationConfig) === null || _c === void 0 ? void 0 : _c.call(storage_1.storage, adminId))];
                case 3:
                    config = _s.sent();
                    return [4 /*yield*/, resolveRecipientsForBroadcast(broadcast)];
                case 4:
                    resolvedRecipients = _s.sent();
                    recipients = resolvedRecipients.recipients;
                    totalRecipients = resolvedRecipients.resolvedTotalRecipients;
                    sentCount = initialSent;
                    failedCount = initialFailed;
                    messageTemplate = broadcast.message_template || broadcast.messageTemplate || "";
                    aiEnabled = Boolean(((_e = (_d = broadcast.ai_variation) !== null && _d !== void 0 ? _d : broadcast.aiVariation) !== null && _e !== void 0 ? _e : false) &&
                        getConfigFlag(config === null || config === void 0 ? void 0 : config.ai_variation_enabled, config === null || config === void 0 ? void 0 : config.aiVariationEnabled, false));
                    aiPrompt = String((_g = (_f = config === null || config === void 0 ? void 0 : config.ai_variation_prompt) !== null && _f !== void 0 ? _f : config === null || config === void 0 ? void 0 : config.aiVariationPrompt) !== null && _g !== void 0 ? _g : "");
                    prefetcher = createAiPrefetcher({
                        enabled: aiEnabled,
                        prompt: aiPrompt,
                        broadcastId: broadcastId,
                        recipients: recipients,
                        templateBuilder: function (recipient) {
                            return messageTemplate
                                .replaceAll("{cliente_nome}", recipient.name)
                                .replaceAll("{nome}", recipient.name);
                        },
                    });
                    prefetcher.prefetch(0);
                    if (!resolvedRecipients.materializedSnapshot) return [3 /*break*/, 6];
                    return [4 /*yield*/, ((_h = storage_1.storage.updateAdminBroadcast) === null || _h === void 0 ? void 0 : _h.call(storage_1.storage, adminId, broadcastId, {
                            targetFilter: resolvedRecipients.materializedSnapshot,
                            totalRecipients: totalRecipients,
                        }))];
                case 5:
                    _s.sent();
                    _s.label = 6;
                case 6:
                    console.log("[ADMIN BROADCAST ".concat(broadcastId, "] Iniciando runner (").concat(trigger, "). total=").concat(totalRecipients, ", enviados=").concat(sentCount, ", falhas=").concat(failedCount, ", restante=").concat(Math.max(totalRecipients - sentCount - failedCount, 0)));
                    return [4 /*yield*/, ((_j = storage_1.storage.updateAdminBroadcast) === null || _j === void 0 ? void 0 : _j.call(storage_1.storage, adminId, broadcastId, {
                            sentCount: sentCount,
                            failedCount: failedCount,
                        }))];
                case 7:
                    _s.sent();
                    index = 0;
                    _s.label = 8;
                case 8:
                    if (!(index < recipients.length)) return [3 /*break*/, 23];
                    recipient = recipients[index];
                    prefetcher.prefetch(index + 1);
                    if (processedKeys.has(recipient.progressKey)) {
                        return [3 /*break*/, 22];
                    }
                    return [4 /*yield*/, ((_k = storage_1.storage.getAdminBroadcast) === null || _k === void 0 ? void 0 : _k.call(storage_1.storage, adminId, broadcastId))];
                case 9:
                    currentBroadcast = _s.sent();
                    if (!currentBroadcast || currentBroadcast.status === "cancelled") {
                        console.log("[ADMIN BROADCAST ".concat(broadcastId, "] Execucao interrompida por cancelamento."));
                        return [2 /*return*/];
                    }
                    baseMessage = messageTemplate
                        .replaceAll("{cliente_nome}", recipient.name)
                        .replaceAll("{nome}", recipient.name);
                    phoneValidation = validateRecipientPhone(recipient.phone);
                    if (!!phoneValidation.isValid) return [3 /*break*/, 12];
                    return [4 /*yield*/, ((_l = storage_1.storage.createBroadcastMessage) === null || _l === void 0 ? void 0 : _l.call(storage_1.storage, {
                            broadcastId: broadcastId,
                            adminId: adminId,
                            userId: recipient.userId,
                            recipientPhone: recipient.phone,
                            recipientName: recipient.name,
                            messageOriginal: baseMessage,
                            messageSent: baseMessage,
                            aiVaried: false,
                            status: "failed",
                            errorMessage: phoneValidation.errorMessage,
                        }))];
                case 10:
                    _s.sent();
                    processedKeys.add(recipient.progressKey);
                    failedCount += 1;
                    return [4 /*yield*/, ((_m = storage_1.storage.updateAdminBroadcast) === null || _m === void 0 ? void 0 : _m.call(storage_1.storage, adminId, broadcastId, {
                            sentCount: sentCount,
                            failedCount: failedCount,
                        }))];
                case 11:
                    _s.sent();
                    console.warn("[ADMIN BROADCAST ".concat(broadcastId, "] ").concat(recipient.name, " ignorado antes do throttle: ").concat(phoneValidation.errorMessage));
                    console.log("[ADMIN BROADCAST ".concat(broadcastId, "] Progresso ").concat(sentCount + failedCount, "/").concat(totalRecipients, " | enviados=").concat(sentCount, " | falhas=").concat(failedCount, " | ultimo=").concat(recipient.name, " | status=failed"));
                    return [3 /*break*/, 22];
                case 12: return [4 /*yield*/, waitForAdminSession(adminId, broadcastId)];
                case 13:
                    sessionReady = _s.sent();
                    if (!!sessionReady) return [3 /*break*/, 15];
                    console.warn("[ADMIN BROADCAST ".concat(broadcastId, "] Sessao do admin indisponivel apos janela de espera. Runner sera retomado pelo loop de recuperacao."));
                    return [4 /*yield*/, ((_o = storage_1.storage.updateAdminBroadcast) === null || _o === void 0 ? void 0 : _o.call(storage_1.storage, adminId, broadcastId, {
                            sentCount: sentCount,
                            failedCount: failedCount,
                        }))];
                case 14:
                    _s.sent();
                    return [2 /*return*/];
                case 15:
                    finalMessage = baseMessage;
                    if (!aiEnabled) return [3 /*break*/, 17];
                    return [4 /*yield*/, prefetcher.get(index)];
                case 16:
                    finalMessage = _s.sent();
                    console.log("[ADMIN BROADCAST ".concat(broadcastId, "] IA preparou mensagem para ").concat(recipient.name, " (").concat(index + 1, "/").concat(recipients.length, ")."));
                    _s.label = 17;
                case 17: return [4 /*yield*/, waitForAdminBulkThrottle(adminId, config, "broadcast:".concat(broadcastId, ":").concat(recipient.name, ":").concat(phoneValidation.normalizedPhone))];
                case 18:
                    _s.sent();
                    success = false;
                    errorMessage = void 0;
                    return [4 /*yield*/, sendBroadcastMessageWithRetry({
                            adminId: adminId,
                            phone: phoneValidation.normalizedPhone,
                            message: finalMessage,
                            broadcastId: broadcastId,
                            recipientName: recipient.name,
                        })];
                case 19:
                    result = _s.sent();
                    success = result.success;
                    errorMessage = result.error;
                    return [4 /*yield*/, ((_p = storage_1.storage.createBroadcastMessage) === null || _p === void 0 ? void 0 : _p.call(storage_1.storage, {
                            broadcastId: broadcastId,
                            adminId: adminId,
                            userId: recipient.userId,
                            recipientPhone: recipient.phone,
                            recipientName: recipient.name,
                            messageOriginal: baseMessage,
                            messageSent: finalMessage,
                            aiVaried: aiEnabled && finalMessage !== baseMessage,
                            status: success ? "sent" : "failed",
                            errorMessage: errorMessage,
                        }))];
                case 20:
                    _s.sent();
                    processedKeys.add(recipient.progressKey);
                    if (success) {
                        sentCount += 1;
                    }
                    else {
                        failedCount += 1;
                    }
                    return [4 /*yield*/, ((_q = storage_1.storage.updateAdminBroadcast) === null || _q === void 0 ? void 0 : _q.call(storage_1.storage, adminId, broadcastId, {
                            sentCount: sentCount,
                            failedCount: failedCount,
                        }))];
                case 21:
                    _s.sent();
                    console.log("[ADMIN BROADCAST ".concat(broadcastId, "] Progresso ").concat(sentCount + failedCount, "/").concat(totalRecipients, " | enviados=").concat(sentCount, " | falhas=").concat(failedCount, " | ultimo=").concat(recipient.name, " | status=").concat(success ? "sent" : "failed"));
                    _s.label = 22;
                case 22:
                    index += 1;
                    return [3 /*break*/, 8];
                case 23: return [4 /*yield*/, ((_r = storage_1.storage.updateAdminBroadcast) === null || _r === void 0 ? void 0 : _r.call(storage_1.storage, adminId, broadcastId, {
                        status: "completed",
                        completedAt: new Date(),
                        sentCount: sentCount,
                        failedCount: failedCount,
                    }))];
                case 24:
                    _s.sent();
                    console.log("[ADMIN BROADCAST ".concat(broadcastId, "] Concluido com sucesso. enviados=").concat(sentCount, ", falhas=").concat(failedCount, ", total=").concat(totalRecipients));
                    return [2 /*return*/];
            }
        });
    });
}
function startAdminBroadcastRun(adminId, broadcastId, trigger) {
    if (trigger === void 0) { trigger = "manual"; }
    var taskKey = getBroadcastKey(adminId, broadcastId);
    if (activeBroadcastTasks.has(taskKey)) {
        console.log("[ADMIN BROADCAST ".concat(broadcastId, "] Runner ja ativo. Ignorando trigger=").concat(trigger, "."));
        return;
    }
    var task = executeAdminBroadcast(adminId, broadcastId, trigger)
        .catch(function (error) {
        console.error("[ADMIN BROADCAST ".concat(broadcastId, "] Runner abortado por erro:"), error);
    })
        .finally(function () {
        activeBroadcastTasks.delete(taskKey);
    });
    activeBroadcastTasks.set(taskKey, task);
}
function resumeSendingAdminBroadcasts(reason) {
    return __awaiter(this, void 0, void 0, function () {
        var runningBroadcasts, _i, runningBroadcasts_1, broadcast, adminId;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, ((_a = storage_1.storage.getRunningAdminBroadcasts) === null || _a === void 0 ? void 0 : _a.call(storage_1.storage))];
                case 1:
                    runningBroadcasts = (_b.sent()) || [];
                    if (runningBroadcasts.length > 0) {
                        console.log("[ADMIN BROADCAST] Loop de recuperacao encontrou ".concat(runningBroadcasts.length, " campanha(s) em andamento. trigger=").concat(reason));
                    }
                    for (_i = 0, runningBroadcasts_1 = runningBroadcasts; _i < runningBroadcasts_1.length; _i++) {
                        broadcast = runningBroadcasts_1[_i];
                        adminId = broadcast.admin_id || broadcast.adminId;
                        if (!adminId || !broadcast.id) {
                            continue;
                        }
                        startAdminBroadcastRun(adminId, broadcast.id, reason);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function startAdminBroadcastRecoveryLoop() {
    if (recoveryLoop) {
        return;
    }
    console.log("[ADMIN BROADCAST] Loop de recuperacao inicializado.");
    void resumeSendingAdminBroadcasts("boot");
    recoveryLoop = setInterval(function () {
        void resumeSendingAdminBroadcasts("recovery-loop");
    }, ADMIN_BROADCAST_RECOVERY_INTERVAL_MS);
}
