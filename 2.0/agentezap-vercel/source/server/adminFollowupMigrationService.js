"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG = void 0;
exports.normalizeAdminFollowupConfig = normalizeAdminFollowupConfig;
exports.isLegacyAdminFollowupConfig = isLegacyAdminFollowupConfig;
exports.getAdminFollowupGlobalConfig = getAdminFollowupGlobalConfig;
exports.saveAdminFollowupGlobalConfig = saveAdminFollowupGlobalConfig;
exports.buildAdminFollowupConfigFromUserConfig = buildAdminFollowupConfigFromUserConfig;
exports.migrateUserFollowupsToAdmin = migrateUserFollowupsToAdmin;
exports.migrateUserFollowupLogsToAdmin = migrateUserFollowupLogsToAdmin;
exports.repairAdminFailedFollowupRetries = repairAdminFailedFollowupRetries;
var db_1 = require("./db");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var GLOBAL_FOLLOWUP_CONFIG_KEY = "admin_followup_global_config";
exports.LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG = {
    enabled: true,
    maxAttempts: 8,
    intervalsMinutes: [10, 30, 180, 1440, 4320, 10080, 259200, 432000],
    finalMinDays: 15,
    finalMaxDays: 30,
    businessHoursStart: "09:00",
    businessHoursEnd: "18:00",
    businessDays: [1, 2, 3, 4, 5],
    respectBusinessHours: true,
    tone: "friendly",
    formalityLevel: 3,
    useEmojis: true,
    importantInfo: [],
    infiniteLoop: true,
    infiniteLoopMinDays: 15,
    infiniteLoopMaxDays: 30,
};
function normalizeTimeValue(value, fallback) {
    if (typeof value !== "string" || !value.trim())
        return fallback;
    var parts = value.split(":").map(function (part) { return part.trim(); }).filter(Boolean);
    if (parts.length < 2)
        return fallback;
    var hour = (parts[0] || "00").padStart(2, "0").slice(0, 2);
    var minute = (parts[1] || "00").padStart(2, "0").slice(0, 2);
    return "".concat(hour, ":").concat(minute);
}
function normalizeBusinessDays(value, fallback) {
    if (!Array.isArray(value))
        return fallback;
    var cleaned = value
        .map(function (entry) { return Number(entry); })
        .filter(function (entry) { return Number.isInteger(entry) && entry >= 0 && entry <= 6; });
    return cleaned.length > 0 ? cleaned : fallback;
}
function normalizeIntervals(value, fallback) {
    if (!Array.isArray(value))
        return fallback;
    var cleaned = value
        .map(function (entry) { return Number(entry); })
        .filter(function (entry) { return Number.isFinite(entry) && entry > 0; });
    return cleaned.length > 0 ? cleaned : fallback;
}
function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
}
function normalizeDateKey(value) {
    if (!value)
        return "";
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        return "";
    return date.toISOString();
}
function buildLogDedupKey(data) {
    var _a;
    return [
        data.conversationId || "",
        data.contactNumber || "",
        data.status || "",
        String((_a = data.stage) !== null && _a !== void 0 ? _a : ""),
        normalizeDateKey(data.executedAt),
        normalizeText(data.messageContent),
        normalizeText(data.errorReason),
    ].join("|");
}
function normalizeAdminFollowupConfig(raw) {
    var fallback = exports.LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG;
    return {
        enabled: (raw === null || raw === void 0 ? void 0 : raw.enabled) !== false,
        maxAttempts: Number(raw === null || raw === void 0 ? void 0 : raw.maxAttempts) > 0 ? Number(raw === null || raw === void 0 ? void 0 : raw.maxAttempts) : fallback.maxAttempts,
        intervalsMinutes: normalizeIntervals(raw === null || raw === void 0 ? void 0 : raw.intervalsMinutes, fallback.intervalsMinutes),
        finalMinDays: Number(raw === null || raw === void 0 ? void 0 : raw.finalMinDays) > 0 ? Number(raw === null || raw === void 0 ? void 0 : raw.finalMinDays) : fallback.finalMinDays,
        finalMaxDays: Number(raw === null || raw === void 0 ? void 0 : raw.finalMaxDays) > 0 ? Number(raw === null || raw === void 0 ? void 0 : raw.finalMaxDays) : fallback.finalMaxDays,
        businessHoursStart: normalizeTimeValue(raw === null || raw === void 0 ? void 0 : raw.businessHoursStart, fallback.businessHoursStart),
        businessHoursEnd: normalizeTimeValue(raw === null || raw === void 0 ? void 0 : raw.businessHoursEnd, fallback.businessHoursEnd),
        businessDays: normalizeBusinessDays(raw === null || raw === void 0 ? void 0 : raw.businessDays, fallback.businessDays),
        respectBusinessHours: (raw === null || raw === void 0 ? void 0 : raw.respectBusinessHours) !== false,
        tone: typeof (raw === null || raw === void 0 ? void 0 : raw.tone) === "string" && raw.tone.trim() ? raw.tone : fallback.tone,
        formalityLevel: Number(raw === null || raw === void 0 ? void 0 : raw.formalityLevel) > 0 ? Number(raw === null || raw === void 0 ? void 0 : raw.formalityLevel) : fallback.formalityLevel,
        useEmojis: (raw === null || raw === void 0 ? void 0 : raw.useEmojis) !== false,
        importantInfo: Array.isArray(raw === null || raw === void 0 ? void 0 : raw.importantInfo) ? raw.importantInfo : fallback.importantInfo,
        infiniteLoop: (raw === null || raw === void 0 ? void 0 : raw.infiniteLoop) !== false,
        infiniteLoopMinDays: Number(raw === null || raw === void 0 ? void 0 : raw.infiniteLoopMinDays) > 0 ? Number(raw === null || raw === void 0 ? void 0 : raw.infiniteLoopMinDays) : fallback.infiniteLoopMinDays,
        infiniteLoopMaxDays: Number(raw === null || raw === void 0 ? void 0 : raw.infiniteLoopMaxDays) > 0 ? Number(raw === null || raw === void 0 ? void 0 : raw.infiniteLoopMaxDays) : fallback.infiniteLoopMaxDays,
    };
}
function isLegacyAdminFollowupConfig(raw) {
    if (!raw)
        return true;
    return JSON.stringify(normalizeAdminFollowupConfig(raw)) === JSON.stringify(exports.LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG);
}
function getAdminFollowupGlobalConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var fallback, row, parsed, normalized, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    fallback = __assign({ id: "global", userId: "admin", isEnabled: true, followupNonPayersEnabled: true }, exports.LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, db_1.db.query.systemConfig.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY),
                        })];
                case 2:
                    row = _b.sent();
                    if (!(row === null || row === void 0 ? void 0 : row.valor))
                        return [2 /*return*/, fallback];
                    parsed = JSON.parse(row.valor);
                    normalized = normalizeAdminFollowupConfig(parsed);
                    return [2 /*return*/, __assign(__assign(__assign(__assign({}, fallback), parsed), normalized), { isEnabled: (parsed === null || parsed === void 0 ? void 0 : parsed.isEnabled) !== false, followupNonPayersEnabled: (parsed === null || parsed === void 0 ? void 0 : parsed.followupNonPayersEnabled) !== false })];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, fallback];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function saveAdminFollowupGlobalConfig(data) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, current, hasIsEnabled, hasNonPayerToggle, normalized, merged, valor;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db.query.systemConfig.findFirst({
                        where: (0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY),
                    })];
                case 1:
                    existing = _a.sent();
                    current = (existing === null || existing === void 0 ? void 0 : existing.valor) ? JSON.parse(existing.valor) : {};
                    hasIsEnabled = Object.prototype.hasOwnProperty.call(data, "isEnabled");
                    hasNonPayerToggle = Object.prototype.hasOwnProperty.call(data, "followupNonPayersEnabled");
                    normalized = normalizeAdminFollowupConfig(__assign(__assign({}, current), data));
                    merged = __assign(__assign(__assign({ id: "global", userId: "admin", isEnabled: hasIsEnabled ? data.isEnabled !== false : current.isEnabled !== false, followupNonPayersEnabled: hasNonPayerToggle
                            ? data.followupNonPayersEnabled !== false
                            : current.followupNonPayersEnabled !== false }, current), data), normalized);
                    valor = JSON.stringify(merged);
                    if (!existing) return [3 /*break*/, 3];
                    return [4 /*yield*/, db_1.db
                            .update(schema_1.systemConfig)
                            .set({ valor: valor, updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY))];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, db_1.db.insert(schema_1.systemConfig).values({
                        chave: GLOBAL_FOLLOWUP_CONFIG_KEY,
                        valor: valor,
                    })];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5: return [2 /*return*/, merged];
            }
        });
    });
}
function buildAdminFollowupConfigFromUserConfig(userConfig) {
    if (!userConfig)
        return normalizeAdminFollowupConfig();
    return normalizeAdminFollowupConfig({
        enabled: userConfig.isEnabled !== false,
        maxAttempts: userConfig.maxAttempts,
        intervalsMinutes: userConfig.intervalsMinutes,
        finalMinDays: userConfig.infiniteLoopMinDays,
        finalMaxDays: userConfig.infiniteLoopMaxDays,
        businessHoursStart: userConfig.businessHoursStart,
        businessHoursEnd: userConfig.businessHoursEnd,
        businessDays: userConfig.businessDays,
        respectBusinessHours: userConfig.respectBusinessHours,
        tone: userConfig.tone,
        formalityLevel: userConfig.formalityLevel,
        useEmojis: userConfig.useEmojis,
        importantInfo: userConfig.importantInfo,
        infiniteLoop: userConfig.infiniteLoop,
        infiniteLoopMinDays: userConfig.infiniteLoopMinDays,
        infiniteLoopMaxDays: userConfig.infiniteLoopMaxDays,
    });
}
function shouldSourceWin(sourceStage, sourceNext, target) {
    if (!target)
        return true;
    if (!target.followupActive || !target.nextFollowupAt)
        return true;
    var targetStage = Number(target.followupStage || 0);
    if (targetStage > sourceStage)
        return false;
    if (targetStage < sourceStage)
        return true;
    if (!sourceNext)
        return false;
    return sourceNext.getTime() < new Date(target.nextFollowupAt).getTime();
}
function resolveMigrationActors(params) {
    return __awaiter(this, void 0, void 0, function () {
        var adminId, admin, sourceUserId, user;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    adminId = params.adminId;
                    if (!(!adminId && params.adminEmail)) return [3 /*break*/, 2];
                    return [4 /*yield*/, db_1.db.query.admins.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.admins.email, params.adminEmail),
                        })];
                case 1:
                    admin = _a.sent();
                    adminId = admin === null || admin === void 0 ? void 0 : admin.id;
                    _a.label = 2;
                case 2:
                    if (!adminId) {
                        throw new Error("Admin de destino nao encontrado");
                    }
                    sourceUserId = params.sourceUserId;
                    if (!(!sourceUserId && params.sourceEmail)) return [3 /*break*/, 4];
                    return [4 /*yield*/, db_1.db.query.users.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.users.email, params.sourceEmail),
                        })];
                case 3:
                    user = _a.sent();
                    sourceUserId = user === null || user === void 0 ? void 0 : user.id;
                    _a.label = 4;
                case 4:
                    if (!sourceUserId) {
                        throw new Error("Usuario de origem nao encontrado");
                    }
                    return [2 /*return*/, { adminId: adminId, sourceUserId: sourceUserId }];
            }
        });
    });
}
function migrateUserFollowupsToAdmin(params) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, adminId, sourceUserId, sourceConfig, mappedConfig, globalConfig, sourceConversations, targetConversations, targetMap, created, updated, keptTarget, disabledSource, _i, sourceConversations_1, source, sourceStage, sourceNext, existingTarget, createdConversation, currentState, updatedConversation;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, resolveMigrationActors(params)];
                case 1:
                    _a = _b.sent(), adminId = _a.adminId, sourceUserId = _a.sourceUserId;
                    return [4 /*yield*/, db_1.db.query.followupConfigs.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.followupConfigs.userId, sourceUserId),
                        })];
                case 2:
                    sourceConfig = _b.sent();
                    mappedConfig = buildAdminFollowupConfigFromUserConfig(sourceConfig);
                    return [4 /*yield*/, saveAdminFollowupGlobalConfig(__assign(__assign({}, mappedConfig), { isEnabled: (sourceConfig === null || sourceConfig === void 0 ? void 0 : sourceConfig.isEnabled) !== false }))];
                case 3:
                    globalConfig = _b.sent();
                    return [4 /*yield*/, db_1.db
                            .select({
                            id: schema_1.conversations.id,
                            contactNumber: schema_1.conversations.contactNumber,
                            contactName: schema_1.conversations.contactName,
                            remoteJid: schema_1.conversations.remoteJid,
                            followupStage: schema_1.conversations.followupStage,
                            nextFollowupAt: schema_1.conversations.nextFollowupAt,
                            lastMessageText: schema_1.conversations.lastMessageText,
                            lastMessageTime: schema_1.conversations.lastMessageTime,
                        })
                            .from(schema_1.conversations)
                            .innerJoin(schema_1.whatsappConnections, (0, drizzle_orm_1.eq)(schema_1.whatsappConnections.id, schema_1.conversations.connectionId))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, sourceUserId), (0, drizzle_orm_1.eq)(schema_1.conversations.followupActive, true), (0, drizzle_orm_1.isNotNull)(schema_1.conversations.nextFollowupAt)))];
                case 4:
                    sourceConversations = _b.sent();
                    return [4 /*yield*/, db_1.db.query.adminConversations.findMany({
                            where: (0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId),
                        })];
                case 5:
                    targetConversations = _b.sent();
                    targetMap = new Map(targetConversations.map(function (conv) { return [conv.contactNumber, conv]; }));
                    created = 0;
                    updated = 0;
                    keptTarget = 0;
                    disabledSource = 0;
                    _i = 0, sourceConversations_1 = sourceConversations;
                    _b.label = 6;
                case 6:
                    if (!(_i < sourceConversations_1.length)) return [3 /*break*/, 14];
                    source = sourceConversations_1[_i];
                    sourceStage = Number(source.followupStage || 0);
                    sourceNext = source.nextFollowupAt ? new Date(source.nextFollowupAt) : null;
                    existingTarget = targetMap.get(source.contactNumber) || null;
                    if (!!existingTarget) return [3 /*break*/, 8];
                    return [4 /*yield*/, db_1.db
                            .insert(schema_1.adminConversations)
                            .values({
                            adminId: adminId,
                            contactNumber: source.contactNumber,
                            remoteJid: source.remoteJid,
                            contactName: source.contactName,
                            lastMessageText: source.lastMessageText,
                            lastMessageTime: source.lastMessageTime,
                            unreadCount: 0,
                            isAgentEnabled: true,
                            followupActive: true,
                            followupStage: sourceStage,
                            nextFollowupAt: sourceNext,
                            followupConfig: mappedConfig,
                            contextState: {
                                followupMigration: {
                                    sourceUserId: sourceUserId,
                                    sourceConversationId: source.id,
                                    migratedAt: new Date().toISOString(),
                                    sourceStage: sourceStage,
                                    sourceNextFollowupAt: (sourceNext === null || sourceNext === void 0 ? void 0 : sourceNext.toISOString()) || null,
                                },
                            },
                        })
                            .returning()];
                case 7:
                    createdConversation = (_b.sent())[0];
                    targetMap.set(source.contactNumber, createdConversation);
                    created += 1;
                    return [3 /*break*/, 11];
                case 8:
                    if (!shouldSourceWin(sourceStage, sourceNext, existingTarget)) return [3 /*break*/, 10];
                    currentState = existingTarget.contextState || {};
                    return [4 /*yield*/, db_1.db
                            .update(schema_1.adminConversations)
                            .set({
                            remoteJid: existingTarget.remoteJid || source.remoteJid,
                            contactName: existingTarget.contactName || source.contactName,
                            lastMessageText: source.lastMessageText || existingTarget.lastMessageText,
                            lastMessageTime: source.lastMessageTime || existingTarget.lastMessageTime,
                            followupActive: true,
                            followupStage: sourceStage,
                            nextFollowupAt: sourceNext,
                            followupConfig: mappedConfig,
                            contextState: __assign(__assign({}, currentState), { followupMigration: {
                                    sourceUserId: sourceUserId,
                                    sourceConversationId: source.id,
                                    migratedAt: new Date().toISOString(),
                                    sourceStage: sourceStage,
                                    sourceNextFollowupAt: (sourceNext === null || sourceNext === void 0 ? void 0 : sourceNext.toISOString()) || null,
                                } }),
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, existingTarget.id))
                            .returning()];
                case 9:
                    updatedConversation = (_b.sent())[0];
                    targetMap.set(source.contactNumber, updatedConversation);
                    updated += 1;
                    return [3 /*break*/, 11];
                case 10:
                    keptTarget += 1;
                    _b.label = 11;
                case 11: return [4 /*yield*/, db_1.db
                        .update(schema_1.conversations)
                        .set({
                        followupActive: false,
                        nextFollowupAt: null,
                        followupDisabledReason: "Migrado para admin ".concat(adminId, " em ").concat(new Date().toISOString()),
                        updatedAt: new Date(),
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, source.id))];
                case 12:
                    _b.sent();
                    disabledSource += 1;
                    _b.label = 13;
                case 13:
                    _i++;
                    return [3 /*break*/, 6];
                case 14: return [2 /*return*/, {
                        sourceUserId: sourceUserId,
                        adminId: adminId,
                        sourceConfigApplied: mappedConfig,
                        globalConfigSaved: globalConfig,
                        scanned: sourceConversations.length,
                        created: created,
                        updated: updated,
                        keptTarget: keptTarget,
                        disabledSource: disabledSource,
                    }];
            }
        });
    });
}
function migrateUserFollowupLogsToAdmin(params) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, adminId, sourceUserId, globalConfig, targetConversations, targetByPhone, targetBySourceConversationId, _i, targetConversations_1, conversation, sourceConversationId, targetConversationIds, existingLogs, _b, existingKeys, sourceLogs, sourceConversationIds, sourceConversations, _c, sourceConversationById, sourceConversationByPhone, _d, sourceConversations_2, entry, migrated, skippedExisting, skippedWithoutTarget, createdFromHistory, _e, sourceLogs_1, sourceLog, targetConversation, sourceConversation, createdConversation, aiDecisionReason, errorReason, stage, effectiveConfig, followupType, dedupKey;
        var _f, _g, _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0: return [4 /*yield*/, resolveMigrationActors(params)];
                case 1:
                    _a = _k.sent(), adminId = _a.adminId, sourceUserId = _a.sourceUserId;
                    return [4 /*yield*/, getAdminFollowupGlobalConfig()];
                case 2:
                    globalConfig = _k.sent();
                    return [4 /*yield*/, db_1.db.query.adminConversations.findMany({
                            where: (0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId),
                        })];
                case 3:
                    targetConversations = _k.sent();
                    targetByPhone = new Map();
                    targetBySourceConversationId = new Map();
                    for (_i = 0, targetConversations_1 = targetConversations; _i < targetConversations_1.length; _i++) {
                        conversation = targetConversations_1[_i];
                        if (conversation.contactNumber && !targetByPhone.has(conversation.contactNumber)) {
                            targetByPhone.set(conversation.contactNumber, conversation);
                        }
                        sourceConversationId = (_g = (_f = conversation.contextState) === null || _f === void 0 ? void 0 : _f.followupMigration) === null || _g === void 0 ? void 0 : _g.sourceConversationId;
                        if (sourceConversationId && !targetBySourceConversationId.has(sourceConversationId)) {
                            targetBySourceConversationId.set(sourceConversationId, conversation);
                        }
                    }
                    targetConversationIds = targetConversations.map(function (conversation) { return conversation.id; });
                    if (!(targetConversationIds.length > 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, db_1.db.query.followupLogs.findMany({
                            where: (0, drizzle_orm_1.inArray)(schema_1.followupLogs.conversationId, targetConversationIds),
                        })];
                case 4:
                    _b = _k.sent();
                    return [3 /*break*/, 6];
                case 5:
                    _b = [];
                    _k.label = 6;
                case 6:
                    existingLogs = _b;
                    existingKeys = new Set(existingLogs.map(function (entry) {
                        return buildLogDedupKey({
                            conversationId: entry.conversationId,
                            contactNumber: entry.contactNumber,
                            status: entry.status,
                            stage: entry.stage,
                            executedAt: entry.executedAt,
                            messageContent: entry.messageContent,
                            errorReason: entry.errorReason,
                        });
                    }));
                    return [4 /*yield*/, db_1.db.query.userFollowupLogs.findMany({
                            where: (0, drizzle_orm_1.eq)(schema_1.userFollowupLogs.userId, sourceUserId),
                            orderBy: function (table, _a) {
                                var asc = _a.asc;
                                return [asc(table.executedAt), asc(table.id)];
                            },
                        })];
                case 7:
                    sourceLogs = _k.sent();
                    sourceConversationIds = Array.from(new Set(sourceLogs.map(function (entry) { return entry.conversationId; }).filter(function (entry) { return Boolean(entry); })));
                    if (!(sourceConversationIds.length > 0)) return [3 /*break*/, 9];
                    return [4 /*yield*/, db_1.db
                            .select({
                            id: schema_1.conversations.id,
                            contactNumber: schema_1.conversations.contactNumber,
                            contactName: schema_1.conversations.contactName,
                            remoteJid: schema_1.conversations.remoteJid,
                            followupActive: schema_1.conversations.followupActive,
                            followupStage: schema_1.conversations.followupStage,
                            nextFollowupAt: schema_1.conversations.nextFollowupAt,
                            lastMessageText: schema_1.conversations.lastMessageText,
                            lastMessageTime: schema_1.conversations.lastMessageTime,
                        })
                            .from(schema_1.conversations)
                            .innerJoin(schema_1.whatsappConnections, (0, drizzle_orm_1.eq)(schema_1.whatsappConnections.id, schema_1.conversations.connectionId))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, sourceUserId), (0, drizzle_orm_1.inArray)(schema_1.conversations.id, sourceConversationIds)))];
                case 8:
                    _c = _k.sent();
                    return [3 /*break*/, 10];
                case 9:
                    _c = [];
                    _k.label = 10;
                case 10:
                    sourceConversations = _c;
                    sourceConversationById = new Map(sourceConversations.map(function (entry) { return [entry.id, entry]; }));
                    sourceConversationByPhone = new Map();
                    for (_d = 0, sourceConversations_2 = sourceConversations; _d < sourceConversations_2.length; _d++) {
                        entry = sourceConversations_2[_d];
                        if (entry.contactNumber && !sourceConversationByPhone.has(entry.contactNumber)) {
                            sourceConversationByPhone.set(entry.contactNumber, entry);
                        }
                    }
                    migrated = 0;
                    skippedExisting = 0;
                    skippedWithoutTarget = 0;
                    createdFromHistory = 0;
                    _e = 0, sourceLogs_1 = sourceLogs;
                    _k.label = 11;
                case 11:
                    if (!(_e < sourceLogs_1.length)) return [3 /*break*/, 16];
                    sourceLog = sourceLogs_1[_e];
                    targetConversation = (sourceLog.conversationId ? targetBySourceConversationId.get(sourceLog.conversationId) : null) ||
                        targetByPhone.get(sourceLog.contactNumber);
                    if (!!targetConversation) return [3 /*break*/, 13];
                    sourceConversation = (sourceLog.conversationId ? sourceConversationById.get(sourceLog.conversationId) : null) ||
                        sourceConversationByPhone.get(sourceLog.contactNumber);
                    if (!sourceConversation) {
                        skippedWithoutTarget += 1;
                        return [3 /*break*/, 15];
                    }
                    return [4 /*yield*/, db_1.db
                            .insert(schema_1.adminConversations)
                            .values({
                            adminId: adminId,
                            contactNumber: sourceConversation.contactNumber,
                            remoteJid: sourceConversation.remoteJid,
                            contactName: sourceConversation.contactName,
                            lastMessageText: sourceConversation.lastMessageText || sourceLog.messageContent,
                            lastMessageTime: sourceConversation.lastMessageTime || sourceLog.executedAt,
                            unreadCount: 0,
                            isAgentEnabled: true,
                            followupActive: Boolean(sourceConversation.followupActive && sourceConversation.nextFollowupAt),
                            followupStage: Number(sourceConversation.followupStage || sourceLog.stage || 0),
                            nextFollowupAt: sourceConversation.nextFollowupAt,
                            followupConfig: normalizeAdminFollowupConfig(globalConfig),
                            contextState: {
                                followupMigration: {
                                    sourceUserId: sourceUserId,
                                    sourceConversationId: sourceConversation.id,
                                    migratedAt: new Date().toISOString(),
                                    sourceStage: Number(sourceConversation.followupStage || sourceLog.stage || 0),
                                    sourceNextFollowupAt: ((_j = (_h = sourceConversation.nextFollowupAt) === null || _h === void 0 ? void 0 : _h.toISOString) === null || _j === void 0 ? void 0 : _j.call(_h)) || null,
                                    historyOnly: true,
                                },
                            },
                        })
                            .returning()];
                case 12:
                    createdConversation = (_k.sent())[0];
                    targetConversation = createdConversation;
                    targetByPhone.set(createdConversation.contactNumber, createdConversation);
                    targetBySourceConversationId.set(sourceConversation.id, createdConversation);
                    createdFromHistory += 1;
                    _k.label = 13;
                case 13:
                    aiDecisionReason = sourceLog.aiDecision && typeof sourceLog.aiDecision === "object"
                        ? normalizeText(sourceLog.aiDecision.reason)
                        : "";
                    errorReason = normalizeText(sourceLog.errorReason) || aiDecisionReason || undefined;
                    stage = Number(sourceLog.stage || 0);
                    effectiveConfig = normalizeAdminFollowupConfig(targetConversation.followupConfig || null);
                    followupType = stage >= effectiveConfig.intervalsMinutes.length ? "final" : "regular";
                    dedupKey = buildLogDedupKey({
                        conversationId: targetConversation.id,
                        contactNumber: sourceLog.contactNumber,
                        status: sourceLog.status,
                        stage: stage,
                        executedAt: sourceLog.executedAt,
                        messageContent: sourceLog.messageContent,
                        errorReason: errorReason,
                    });
                    if (existingKeys.has(dedupKey)) {
                        skippedExisting += 1;
                        return [3 /*break*/, 15];
                    }
                    return [4 /*yield*/, db_1.db.insert(schema_1.followupLogs).values({
                            conversationId: targetConversation.id,
                            contactNumber: sourceLog.contactNumber,
                            status: sourceLog.status,
                            messageContent: sourceLog.messageContent,
                            executedAt: sourceLog.executedAt,
                            errorReason: errorReason,
                            paymentStatus: targetConversation.paymentStatus || "pending",
                            followupType: followupType,
                            stage: stage,
                        })];
                case 14:
                    _k.sent();
                    existingKeys.add(dedupKey);
                    migrated += 1;
                    _k.label = 15;
                case 15:
                    _e++;
                    return [3 /*break*/, 11];
                case 16: return [2 /*return*/, {
                        sourceUserId: sourceUserId,
                        adminId: adminId,
                        scanned: sourceLogs.length,
                        migrated: migrated,
                        skippedExisting: skippedExisting,
                        skippedWithoutTarget: skippedWithoutTarget,
                        createdFromHistory: createdFromHistory,
                    }];
            }
        });
    });
}
function repairAdminFailedFollowupRetries(params) {
    return __awaiter(this, void 0, void 0, function () {
        var adminId, admin, globalConfig, failedRows, repaired, nextAtBase, _i, _a, row, stage, effectiveConfig, delayMinutes, scheduledFor;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    adminId = params.adminId;
                    if (!(!adminId && params.adminEmail)) return [3 /*break*/, 2];
                    return [4 /*yield*/, db_1.db.query.admins.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.admins.email, params.adminEmail),
                        })];
                case 1:
                    admin = _b.sent();
                    adminId = admin === null || admin === void 0 ? void 0 : admin.id;
                    _b.label = 2;
                case 2:
                    if (!adminId) {
                        throw new Error("Admin de destino nao encontrado");
                    }
                    return [4 /*yield*/, getAdminFollowupGlobalConfig()];
                case 3:
                    globalConfig = _b.sent();
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n    with latest_log as (\n      select distinct on (l.conversation_id)\n        l.id,\n        l.conversation_id,\n        l.status,\n        l.executed_at\n      from followup_logs l\n      inner join admin_conversations c on c.id = l.conversation_id\n      where c.admin_id = ", "\n      order by l.conversation_id, l.executed_at desc, l.id desc\n    )\n    select c.id, c.followup_stage, c.followup_config\n    from latest_log\n    inner join admin_conversations c on c.id = latest_log.conversation_id\n    where latest_log.status = 'failed'\n      and c.followup_active = true\n      and c.next_followup_at is null\n  "], ["\n    with latest_log as (\n      select distinct on (l.conversation_id)\n        l.id,\n        l.conversation_id,\n        l.status,\n        l.executed_at\n      from followup_logs l\n      inner join admin_conversations c on c.id = l.conversation_id\n      where c.admin_id = ", "\n      order by l.conversation_id, l.executed_at desc, l.id desc\n    )\n    select c.id, c.followup_stage, c.followup_config\n    from latest_log\n    inner join admin_conversations c on c.id = latest_log.conversation_id\n    where latest_log.status = 'failed'\n      and c.followup_active = true\n      and c.next_followup_at is null\n  "])), adminId))];
                case 4:
                    failedRows = _b.sent();
                    repaired = 0;
                    nextAtBase = Date.now();
                    _i = 0, _a = failedRows.rows;
                    _b.label = 5;
                case 5:
                    if (!(_i < _a.length)) return [3 /*break*/, 8];
                    row = _a[_i];
                    stage = Number(row.followup_stage || 0);
                    effectiveConfig = normalizeAdminFollowupConfig(__assign(__assign({}, globalConfig), (row.followup_config || {})));
                    delayMinutes = effectiveConfig.intervalsMinutes[Math.min(stage, effectiveConfig.intervalsMinutes.length - 1)] || 10;
                    nextAtBase += 60 * 1000;
                    scheduledFor = new Date(nextAtBase + delayMinutes * 60 * 1000);
                    return [4 /*yield*/, db_1.db
                            .update(schema_1.adminConversations)
                            .set({
                            nextFollowupAt: scheduledFor,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, row.id))];
                case 6:
                    _b.sent();
                    repaired += 1;
                    _b.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8: return [2 /*return*/, {
                        adminId: adminId,
                        repaired: repaired,
                    }];
            }
        });
    });
}
var templateObject_1;
