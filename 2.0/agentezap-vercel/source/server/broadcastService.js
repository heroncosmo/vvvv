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
exports.createAndRunCampaign = createAndRunCampaign;
exports.getCampaignStatus = getCampaignStatus;
exports.cancelCampaign = cancelCampaign;
var drizzle_orm_1 = require("drizzle-orm");
var schema_1 = require("../shared/schema");
var db_1 = require("./db");
var storage_1 = require("./storage");
var whatsapp_1 = require("./whatsapp");
var BROADCAST_MIN_DELAY_MS = 60000;
var BROADCAST_MAX_DELAY_MS = 90000;
var BROADCAST_BATCH_SIZE = 10;
var BROADCAST_BATCH_PAUSE_MS = 600000;
var SOCKET_WAIT_TIMEOUT_MS = 300000;
var SOCKET_POLL_INTERVAL_MS = 30000;
function clampDelayMin(delayMinMs) {
    return Math.max(BROADCAST_MIN_DELAY_MS, Number(delayMinMs || 0));
}
function clampDelayMax(delayMaxMs, delayMinMs) {
    var min = clampDelayMin(delayMinMs);
    return Math.max(BROADCAST_MAX_DELAY_MS, Number(delayMaxMs || 0), min);
}
function applyTemplate(template, name) {
    var safeName = String(name || "Cliente").trim() || "Cliente";
    return template.replace(/\[nome\]/gi, safeName);
}
function formatPhoneToJid(phone) {
    var cleanPhone = String(phone || "").replace(/\D/g, "");
    if (!cleanPhone) {
        throw new Error("Numero de telefone invalido");
    }
    var formattedPhone = cleanPhone;
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        formattedPhone = "55".concat(cleanPhone);
    }
    return "".concat(formattedPhone, "@s.whatsapp.net");
}
function normalizePhone(phone) {
    var cleanPhone = String(phone || "").replace(/\D/g, "");
    if (!cleanPhone) {
        throw new Error("Numero de telefone invalido");
    }
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        return "55".concat(cleanPhone);
    }
    return cleanPhone;
}
function getJidSuffix(jid) {
    var _a;
    return ((_a = jid.split("@")[1]) === null || _a === void 0 ? void 0 : _a.split(":")[0]) || "s.whatsapp.net";
}
function getMediaFallbackText(mediaType) {
    switch (mediaType) {
        case "image":
            return "[Imagem enviada]";
        case "video":
            return "[Video enviado]";
        case "audio":
            return "[Audio enviado]";
        case "document":
            return "[Documento enviado]";
        default:
            return "[Mensagem enviada]";
    }
}
function getPersistedMessageText(messageText, mediaType) {
    var trimmed = messageText.trim();
    if (trimmed) {
        return trimmed;
    }
    return getMediaFallbackText(mediaType);
}
function getConversationPreviewText(messageText, mediaType) {
    var trimmed = messageText.trim();
    if (trimmed) {
        return trimmed;
    }
    return mediaType ? getMediaFallbackText(mediaType).replace("enviado", "").trim() : "[Mensagem]";
}
function sleep(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
function sleepRange(minMs, maxMs) {
    return __awaiter(this, void 0, void 0, function () {
        var delay;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    delay = minMs >= maxMs ? minMs : Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
                    return [4 /*yield*/, sleep(delay)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function parseDataUrl(dataUrl) {
    var match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
        return null;
    }
    return {
        mimeType: match[1],
        buffer: Buffer.from(match[2], "base64"),
    };
}
function guessMimeTypeFromUrl(url, mediaType) {
    var lowerUrl = url.toLowerCase();
    if (mediaType === "image") {
        if (lowerUrl.endsWith(".png"))
            return "image/png";
        if (lowerUrl.endsWith(".webp"))
            return "image/webp";
        return "image/jpeg";
    }
    if (mediaType === "video") {
        if (lowerUrl.endsWith(".webm"))
            return "video/webm";
        if (lowerUrl.endsWith(".mov"))
            return "video/quicktime";
        return "video/mp4";
    }
    if (mediaType === "audio") {
        if (lowerUrl.endsWith(".mp3"))
            return "audio/mpeg";
        if (lowerUrl.endsWith(".wav"))
            return "audio/wav";
        if (lowerUrl.endsWith(".m4a"))
            return "audio/mp4";
        return "audio/ogg; codecs=opus";
    }
    if (lowerUrl.endsWith(".pdf"))
        return "application/pdf";
    if (lowerUrl.endsWith(".doc"))
        return "application/msword";
    if (lowerUrl.endsWith(".docx")) {
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    if (lowerUrl.endsWith(".xlsx")) {
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    return "application/octet-stream";
}
function resolveMediaSource(mediaUrl, mediaType) {
    return __awaiter(this, void 0, void 0, function () {
        var parsed, response, arrayBuffer;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    parsed = parseDataUrl(mediaUrl);
                    if (parsed) {
                        return [2 /*return*/, parsed];
                    }
                    if (!/^https?:\/\//i.test(mediaUrl)) return [3 /*break*/, 3];
                    return [4 /*yield*/, fetch(mediaUrl)];
                case 1:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("Falha ao baixar midia: HTTP ".concat(response.status));
                    }
                    return [4 /*yield*/, response.arrayBuffer()];
                case 2:
                    arrayBuffer = _a.sent();
                    return [2 /*return*/, {
                            mimeType: response.headers.get("content-type") || guessMimeTypeFromUrl(mediaUrl, mediaType),
                            buffer: Buffer.from(arrayBuffer),
                        }];
                case 3: return [2 /*return*/, {
                        mimeType: guessMimeTypeFromUrl(mediaUrl, mediaType),
                        buffer: Buffer.from(mediaUrl, "base64"),
                    }];
            }
        });
    });
}
function buildMessageContent(messageText, mediaUrl, mediaType) {
    return __awaiter(this, void 0, void 0, function () {
        var normalizedMediaType, _a, buffer, mimeType, caption;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!mediaUrl || !mediaType) {
                        return [2 /*return*/, { text: messageText }];
                    }
                    normalizedMediaType = mediaType;
                    return [4 /*yield*/, resolveMediaSource(mediaUrl, normalizedMediaType)];
                case 1:
                    _a = _b.sent(), buffer = _a.buffer, mimeType = _a.mimeType;
                    caption = messageText.trim() || undefined;
                    switch (normalizedMediaType) {
                        case "image":
                            return [2 /*return*/, {
                                    image: buffer,
                                    mimetype: mimeType || "image/jpeg",
                                    caption: caption,
                                }];
                        case "video":
                            return [2 /*return*/, {
                                    video: buffer,
                                    mimetype: mimeType || "video/mp4",
                                    caption: caption,
                                }];
                        case "audio":
                            return [2 /*return*/, {
                                    audio: buffer,
                                    mimetype: mimeType || "audio/ogg; codecs=opus",
                                    ptt: false,
                                }];
                        case "document":
                            return [2 /*return*/, {
                                    document: buffer,
                                    mimetype: mimeType || "application/octet-stream",
                                    fileName: "broadcast-".concat(Date.now()),
                                    caption: caption,
                                }];
                        default:
                            throw new Error("Tipo de midia nao suportado: ".concat(mediaType));
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function applyAiVariation(message, index) {
    var synonyms = {
        "ola": ["oi", "e ai", "hey"],
        "oi": ["ola", "e ai", "hey"],
        "tudo bem": ["como vai", "tudo certo", "tudo ok"],
        "obrigado": ["valeu", "agradeco", "muito obrigado"],
        "obrigada": ["valeu", "agradeco", "muito obrigada"],
        "gostaria": ["queria", "preciso", "adoraria"],
        "pode": ["consegue", "poderia", "daria para"],
        "produto": ["item", "artigo", "oferta"],
        "servico": ["atendimento", "solucao", "suporte"],
        "desconto": ["promocao", "oferta especial", "vantagem"],
    };
    var prefixes = ["", "", "", "Oi, ", "Hey, "];
    var suffixes = ["", "", ".", "!", " Abraco!"];
    var varied = message;
    var replacements = 0;
    var maxReplacements = Math.floor(Math.random() * 2) + 1;
    for (var _i = 0, _a = Object.entries(synonyms); _i < _a.length; _i++) {
        var _b = _a[_i], source = _b[0], targets = _b[1];
        if (replacements >= maxReplacements) {
            break;
        }
        var regex = new RegExp("\\b".concat(source, "\\b"), "i");
        if (regex.test(varied)) {
            var replacement = targets[Math.floor(Math.random() * targets.length)];
            varied = varied.replace(regex, replacement);
            replacements += 1;
        }
    }
    var prefix = prefixes[index % prefixes.length];
    var suffix = suffixes[(index + 1) % suffixes.length];
    if (prefix && !varied.startsWith(prefix)) {
        varied = "".concat(prefix).concat(varied);
    }
    if (suffix && !varied.endsWith(suffix)) {
        varied = varied.replace(/[.!?]+$/g, "");
        varied = "".concat(varied).concat(suffix);
    }
    return varied;
}
function resolveActiveConnection(userId, preferredConnectionId) {
    return __awaiter(this, void 0, void 0, function () {
        var specificConnection, primaryConnected, fallbackConnected;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!preferredConnectionId) return [3 /*break*/, 2];
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.whatsappConnections)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.id, preferredConnectionId), (0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, userId), (0, drizzle_orm_1.eq)(schema_1.whatsappConnections.isConnected, true)))
                            .limit(1)];
                case 1:
                    specificConnection = (_a.sent())[0];
                    if (specificConnection) {
                        return [2 /*return*/, specificConnection];
                    }
                    _a.label = 2;
                case 2: return [4 /*yield*/, db_1.db
                        .select()
                        .from(schema_1.whatsappConnections)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, userId), (0, drizzle_orm_1.eq)(schema_1.whatsappConnections.isConnected, true), (0, drizzle_orm_1.eq)(schema_1.whatsappConnections.isPrimary, true)))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.whatsappConnections.updatedAt))
                        .limit(1)];
                case 3:
                    primaryConnected = (_a.sent())[0];
                    if (primaryConnected) {
                        return [2 /*return*/, primaryConnected];
                    }
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.whatsappConnections)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, userId), (0, drizzle_orm_1.eq)(schema_1.whatsappConnections.isConnected, true)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.whatsappConnections.updatedAt))
                            .limit(1)];
                case 4:
                    fallbackConnected = (_a.sent())[0];
                    return [2 /*return*/, fallbackConnected || null];
            }
        });
    });
}
function resolveSocket(userId, preferredConnectionId) {
    return __awaiter(this, void 0, void 0, function () {
        var connection, session;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveActiveConnection(userId, preferredConnectionId)];
                case 1:
                    connection = _a.sent();
                    if (!connection) {
                        return [2 /*return*/, { connectionId: null, socket: null }];
                    }
                    session = (0, whatsapp_1.getSession)(connection.id);
                    return [2 /*return*/, {
                            connectionId: connection.id,
                            socket: (session === null || session === void 0 ? void 0 : session.socket) || null,
                        }];
            }
        });
    });
}
function waitForSocket(userId, preferredConnectionId) {
    return __awaiter(this, void 0, void 0, function () {
        var startedAt, resolved;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    startedAt = Date.now();
                    _a.label = 1;
                case 1:
                    if (!(Date.now() - startedAt < SOCKET_WAIT_TIMEOUT_MS)) return [3 /*break*/, 4];
                    return [4 /*yield*/, resolveSocket(userId, preferredConnectionId)];
                case 2:
                    resolved = _a.sent();
                    if (resolved.socket) {
                        return [2 /*return*/, resolved];
                    }
                    return [4 /*yield*/, sleep(SOCKET_POLL_INTERVAL_MS)];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, { connectionId: null, socket: null }];
            }
        });
    });
}
function persistBroadcastHistory(params) {
    return __awaiter(this, void 0, void 0, function () {
        var normalizedPhone, previewText, persistedText, jidSuffix, conversation, existingMessage;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!params.campaignConnectionId) {
                        throw new Error("ConnectionId indisponivel para persistir historico do broadcast");
                    }
                    normalizedPhone = normalizePhone(params.contact.phone);
                    previewText = getConversationPreviewText(params.messageText, params.mediaType);
                    persistedText = getPersistedMessageText(params.messageText, params.mediaType);
                    jidSuffix = getJidSuffix(params.jid);
                    return [4 /*yield*/, storage_1.storage.getActiveConversationByContactNumber(params.campaignConnectionId, normalizedPhone)];
                case 1:
                    conversation = _a.sent();
                    if (!!conversation) return [3 /*break*/, 3];
                    return [4 /*yield*/, storage_1.storage.createConversation({
                            connectionId: params.campaignConnectionId,
                            contactNumber: normalizedPhone,
                            remoteJid: params.jid,
                            jidSuffix: jidSuffix,
                            contactName: params.contact.name || normalizedPhone,
                            contactAvatar: null,
                            lastMessageText: previewText,
                            lastMessageTime: params.sentAt,
                            lastMessageFromMe: true,
                            unreadCount: 0,
                            hasReplied: true,
                        })];
                case 2:
                    conversation = _a.sent();
                    _a.label = 3;
                case 3: return [4 /*yield*/, storage_1.storage.getMessageByMessageId(params.messageId)];
                case 4:
                    existingMessage = _a.sent();
                    if (!!existingMessage) return [3 /*break*/, 6];
                    return [4 /*yield*/, storage_1.storage.createMessage({
                            conversationId: conversation.id,
                            messageId: params.messageId,
                            fromMe: true,
                            text: persistedText,
                            timestamp: params.sentAt,
                            status: "sent",
                            isFromAgent: false,
                            mediaType: params.mediaType || null,
                            mediaUrl: params.mediaUrl || null,
                            mediaCaption: params.mediaType ? params.messageText.trim() || null : null,
                        })];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6: return [4 /*yield*/, storage_1.storage.updateConversation(conversation.id, {
                        remoteJid: params.jid,
                        jidSuffix: jidSuffix,
                        contactName: params.contact.name || conversation.contactName || normalizedPhone,
                        lastMessageText: previewText,
                        lastMessageTime: params.sentAt,
                        lastMessageFromMe: true,
                        unreadCount: 0,
                        hasReplied: true,
                    })];
                case 7:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function isCampaignCancelled(campaignId) {
    return __awaiter(this, void 0, void 0, function () {
        var campaign;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({ status: schema_1.broadcastCampaigns.status })
                        .from(schema_1.broadcastCampaigns)
                        .where((0, drizzle_orm_1.eq)(schema_1.broadcastCampaigns.id, campaignId))
                        .limit(1)];
                case 1:
                    campaign = (_a.sent())[0];
                    return [2 /*return*/, (campaign === null || campaign === void 0 ? void 0 : campaign.status) === "cancelled"];
            }
        });
    });
}
function persistProgress(campaignId, values) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .update(schema_1.broadcastCampaigns)
                        .set(__assign(__assign({}, values), { updatedAt: new Date() }))
                        .where((0, drizzle_orm_1.eq)(schema_1.broadcastCampaigns.id, campaignId))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function createAndRunCampaign(userId, payload) {
    return __awaiter(this, void 0, void 0, function () {
        var normalizedDelayMinMs, normalizedDelayMaxMs, insertedCampaign, campaignId;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    normalizedDelayMinMs = clampDelayMin(payload.delayMinMs);
                    normalizedDelayMaxMs = clampDelayMax(payload.delayMaxMs, payload.delayMinMs);
                    return [4 /*yield*/, db_1.db
                            .insert(schema_1.broadcastCampaigns)
                            .values({
                            userId: userId,
                            connectionId: payload.connectionId || null,
                            name: payload.name || "Campanha ".concat(new Date().toLocaleString("pt-BR")),
                            status: "pending",
                            messageTemplate: payload.messageTemplate,
                            mediaUrl: payload.mediaUrl || null,
                            mediaType: payload.mediaType || null,
                            totalContacts: payload.contacts.length,
                            sentCount: 0,
                            failedCount: 0,
                            useAi: Boolean(payload.useAi),
                            delayMinMs: normalizedDelayMinMs,
                            delayMaxMs: normalizedDelayMaxMs,
                            batchSize: BROADCAST_BATCH_SIZE,
                            batchPauseMs: BROADCAST_BATCH_PAUSE_MS,
                            contactsJson: payload.contacts.map(function (contact) { return ({
                                id: contact.id || "".concat(Date.now(), "-").concat(Math.random()),
                                phone: contact.phone,
                                name: contact.name || "Cliente",
                            }); }),
                            resultsJson: [],
                            scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
                        })
                            .returning({ id: schema_1.broadcastCampaigns.id })];
                case 1:
                    insertedCampaign = (_a.sent())[0];
                    campaignId = insertedCampaign.id;
                    void executeCampaign(campaignId).catch(function (error) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, persistProgress(campaignId, {
                                        status: "error",
                                        errorMessage: error instanceof Error ? error.message : String(error),
                                        completedAt: new Date(),
                                    }).catch(function () { return undefined; })];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                    return [2 /*return*/, { campaignId: campaignId }];
            }
        });
    });
}
function executeCampaign(campaignId) {
    return __awaiter(this, void 0, void 0, function () {
        var campaign, contacts, results, sentCount, failedCount, index, contact, resolved, jid, messageText, messageContent, sentMessage, sentAt, messageId, error_1, isLastContact, processedCount;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select()
                        .from(schema_1.broadcastCampaigns)
                        .where((0, drizzle_orm_1.eq)(schema_1.broadcastCampaigns.id, campaignId))
                        .limit(1)];
                case 1:
                    campaign = (_b.sent())[0];
                    if (!campaign) {
                        return [2 /*return*/];
                    }
                    if (campaign.status === "cancelled") {
                        return [2 /*return*/];
                    }
                    contacts = Array.isArray(campaign.contactsJson) ? __spreadArray([], campaign.contactsJson, true) : [];
                    results = [];
                    sentCount = 0;
                    failedCount = 0;
                    return [4 /*yield*/, persistProgress(campaignId, {
                            status: "running",
                            startedAt: campaign.startedAt || new Date(),
                        })];
                case 2:
                    _b.sent();
                    index = 0;
                    _b.label = 3;
                case 3:
                    if (!(index < contacts.length)) return [3 /*break*/, 25];
                    return [4 /*yield*/, isCampaignCancelled(campaignId)];
                case 4:
                    if (!_b.sent()) return [3 /*break*/, 6];
                    return [4 /*yield*/, persistProgress(campaignId, {
                            completedAt: new Date(),
                        })];
                case 5:
                    _b.sent();
                    return [2 /*return*/];
                case 6:
                    contact = contacts[index];
                    return [4 /*yield*/, resolveSocket(campaign.userId, campaign.connectionId)];
                case 7:
                    resolved = _b.sent();
                    if (!!resolved.socket) return [3 /*break*/, 9];
                    return [4 /*yield*/, waitForSocket(campaign.userId, campaign.connectionId)];
                case 8:
                    resolved = _b.sent();
                    _b.label = 9;
                case 9:
                    if (!(resolved.connectionId && resolved.connectionId !== campaign.connectionId)) return [3 /*break*/, 11];
                    return [4 /*yield*/, persistProgress(campaignId, {
                            connectionId: resolved.connectionId,
                        })];
                case 10:
                    _b.sent();
                    campaign.connectionId = resolved.connectionId;
                    _b.label = 11;
                case 11:
                    if (!!resolved.socket) return [3 /*break*/, 13];
                    failedCount += 1;
                    results.push({
                        phone: contact.phone,
                        name: contact.name || "Cliente",
                        status: "failed",
                        error: "Socket indisponivel apos aguardar reconexao por 5 minutos",
                    });
                    return [4 /*yield*/, persistProgress(campaignId, {
                            failedCount: failedCount,
                            resultsJson: results,
                        })];
                case 12:
                    _b.sent();
                    return [3 /*break*/, 20];
                case 13:
                    _b.trys.push([13, 18, , 20]);
                    jid = formatPhoneToJid(contact.phone);
                    messageText = applyTemplate(campaign.messageTemplate, contact.name);
                    if (campaign.useAi) {
                        messageText = applyAiVariation(messageText, index);
                    }
                    return [4 /*yield*/, buildMessageContent(messageText, campaign.mediaUrl, campaign.mediaType)];
                case 14:
                    messageContent = _b.sent();
                    return [4 /*yield*/, resolved.socket.sendMessage(jid, messageContent)];
                case 15:
                    sentMessage = _b.sent();
                    sentAt = new Date();
                    messageId = ((_a = sentMessage === null || sentMessage === void 0 ? void 0 : sentMessage.key) === null || _a === void 0 ? void 0 : _a.id) || "broadcast_".concat(campaignId, "_").concat(index, "_").concat(sentAt.getTime());
                    return [4 /*yield*/, persistBroadcastHistory({
                            campaignConnectionId: resolved.connectionId || campaign.connectionId,
                            contact: contact,
                            jid: jid,
                            messageId: messageId,
                            messageText: messageText,
                            sentAt: sentAt,
                            mediaUrl: campaign.mediaUrl,
                            mediaType: campaign.mediaType,
                        }).catch(function (error) {
                            console.warn("[BROADCAST] Falha ao persistir historico da mensagem enviada:", error);
                        })];
                case 16:
                    _b.sent();
                    sentCount += 1;
                    results.push({
                        phone: contact.phone,
                        name: contact.name || "Cliente",
                        status: "sent",
                        sentAt: sentAt.toISOString(),
                    });
                    return [4 /*yield*/, persistProgress(campaignId, {
                            connectionId: resolved.connectionId || campaign.connectionId,
                            sentCount: sentCount,
                            failedCount: failedCount,
                            resultsJson: results,
                        })];
                case 17:
                    _b.sent();
                    return [3 /*break*/, 20];
                case 18:
                    error_1 = _b.sent();
                    failedCount += 1;
                    results.push({
                        phone: contact.phone,
                        name: contact.name || "Cliente",
                        status: "failed",
                        error: error_1 instanceof Error ? error_1.message : "Erro desconhecido",
                    });
                    return [4 /*yield*/, persistProgress(campaignId, {
                            connectionId: resolved.connectionId || campaign.connectionId,
                            sentCount: sentCount,
                            failedCount: failedCount,
                            resultsJson: results,
                        })];
                case 19:
                    _b.sent();
                    return [3 /*break*/, 20];
                case 20:
                    isLastContact = index === contacts.length - 1;
                    if (isLastContact) {
                        return [3 /*break*/, 24];
                    }
                    processedCount = index + 1;
                    if (!(processedCount % BROADCAST_BATCH_SIZE === 0)) return [3 /*break*/, 22];
                    return [4 /*yield*/, sleep(BROADCAST_BATCH_PAUSE_MS)];
                case 21:
                    _b.sent();
                    return [3 /*break*/, 24];
                case 22: return [4 /*yield*/, sleepRange(campaign.delayMinMs, campaign.delayMaxMs)];
                case 23:
                    _b.sent();
                    _b.label = 24;
                case 24:
                    index += 1;
                    return [3 /*break*/, 3];
                case 25: return [4 /*yield*/, isCampaignCancelled(campaignId)];
                case 26:
                    if (!_b.sent()) return [3 /*break*/, 28];
                    return [4 /*yield*/, persistProgress(campaignId, {
                            completedAt: new Date(),
                        })];
                case 27:
                    _b.sent();
                    return [2 /*return*/];
                case 28: return [4 /*yield*/, persistProgress(campaignId, {
                        status: "completed",
                        sentCount: sentCount,
                        failedCount: failedCount,
                        resultsJson: results,
                        completedAt: new Date(),
                        errorMessage: null,
                    })];
                case 29:
                    _b.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function getCampaignStatus(campaignId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var campaign;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select()
                        .from(schema_1.broadcastCampaigns)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.broadcastCampaigns.id, campaignId), (0, drizzle_orm_1.eq)(schema_1.broadcastCampaigns.userId, userId)))
                        .limit(1)];
                case 1:
                    campaign = (_a.sent())[0];
                    return [2 /*return*/, campaign || null];
            }
        });
    });
}
function cancelCampaign(campaignId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var cancelled;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .update(schema_1.broadcastCampaigns)
                        .set({
                        status: "cancelled",
                        completedAt: new Date(),
                        updatedAt: new Date(),
                    })
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.broadcastCampaigns.id, campaignId), (0, drizzle_orm_1.eq)(schema_1.broadcastCampaigns.userId, userId)))
                        .returning({ id: schema_1.broadcastCampaigns.id })];
                case 1:
                    cancelled = _a.sent();
                    return [2 /*return*/, cancelled.length > 0];
            }
        });
    });
}
exports.default = {
    createAndRunCampaign: createAndRunCampaign,
    getCampaignStatus: getCampaignStatus,
    cancelCampaign: cancelCampaign,
};
