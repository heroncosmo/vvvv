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
exports.ensureQrCodeSentToClient = ensureQrCodeSentToClient;
exports.ensurePairingCodeSentToClient = ensurePairingCodeSentToClient;
var backgroundQrJobs = new Set();
var backgroundPairingJobs = new Set();
var defaultSleep = function (ms) { return new Promise(function (resolve) { return setTimeout(resolve, ms); }); };
function extractQrBuffer(qrCodeData) {
    // Accepts both data URLs (data:image/png;base64,...) and raw base64.
    var trimmed = qrCodeData.trim();
    var base64 = trimmed.includes(",") ? trimmed.split(",")[1] : trimmed;
    if (!base64)
        return null;
    try {
        return Buffer.from(base64, "base64");
    }
    catch (_a) {
        return null;
    }
}
function pickProgressMessage(kind, tick) {
    if (kind === "pairing") {
        var msgs_1 = [
            "🔄 Gerando seu código de pareamento… só um instante.",
            "⏳ Ainda gerando o código… já já te envio aqui.",
            "📲 Quase lá… estou finalizando o código de 8 dígitos.",
            "✅ Só mais um pouquinho… mantendo a tentativa ativa.",
        ];
        return msgs_1[tick % msgs_1.length];
    }
    var msgs = [
        "📱 Gerando seu QR Code agora… só um instante.",
        "⏳ Ainda gerando o QR Code… pode aguardar mais um pouquinho.",
        "🔄 Estou mantendo a tentativa ativa… já já te envio o QR Code.",
        "✅ Quase lá… assim que aparecer eu envio automaticamente.",
    ];
    return msgs[tick % msgs.length];
}
function ensureQrCodeSentToClient(params) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, contactNumber, getConnectionByUserId, connectWhatsApp, sendText, sendImage, _a, sleep, _b, now, _c, maxWaitMs, existing, _d, startedAt, lastProgressAt, tick, conn, qrBuffer, elapsed, jobKey;
        var _this = this;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    userId = params.userId, contactNumber = params.contactNumber, getConnectionByUserId = params.getConnectionByUserId, connectWhatsApp = params.connectWhatsApp, sendText = params.sendText, sendImage = params.sendImage, _a = params.sleep, sleep = _a === void 0 ? defaultSleep : _a, _b = params.now, now = _b === void 0 ? Date.now : _b, _c = params.maxWaitMs, maxWaitMs = _c === void 0 ? 180000 : _c;
                    return [4 /*yield*/, getConnectionByUserId(userId)];
                case 1:
                    existing = _e.sent();
                    if (!(existing === null || existing === void 0 ? void 0 : existing.isConnected)) return [3 /*break*/, 3];
                    return [4 /*yield*/, sendText("✅ Seu WhatsApp já está conectado e funcionando!\n\nSe quiser desconectar para gerar um novo QR Code, é só digitar 'desconectar'.")];
                case 2:
                    _e.sent();
                    return [2 /*return*/, { alreadyConnected: true, sent: true }];
                case 3: return [4 /*yield*/, sendText(pickProgressMessage("qr", 0))];
                case 4:
                    _e.sent();
                    _e.label = 5;
                case 5:
                    _e.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, connectWhatsApp(userId)];
                case 6:
                    _e.sent();
                    return [3 /*break*/, 8];
                case 7:
                    _d = _e.sent();
                    return [3 /*break*/, 8];
                case 8:
                    startedAt = now();
                    lastProgressAt = 0;
                    tick = 0;
                    _e.label = 9;
                case 9:
                    if (!(now() - startedAt < maxWaitMs)) return [3 /*break*/, 18];
                    return [4 /*yield*/, sleep(1000)];
                case 10:
                    _e.sent();
                    return [4 /*yield*/, getConnectionByUserId(userId)];
                case 11:
                    conn = _e.sent();
                    if (!(conn === null || conn === void 0 ? void 0 : conn.isConnected)) return [3 /*break*/, 13];
                    return [4 /*yield*/, sendText("✅ Conectado! Seu WhatsApp já está funcionando aqui.")];
                case 12:
                    _e.sent();
                    return [2 /*return*/, { alreadyConnected: false, sent: true }];
                case 13:
                    if (!(conn === null || conn === void 0 ? void 0 : conn.qrCode)) return [3 /*break*/, 15];
                    qrBuffer = extractQrBuffer(conn.qrCode);
                    if (!qrBuffer) return [3 /*break*/, 15];
                    return [4 /*yield*/, sendImage(qrBuffer, "📱 Aqui está o QR Code!\n\n1️⃣ Abra o WhatsApp no celular\n2️⃣ Vá em Configurações > Aparelhos Conectados\n3️⃣ Toque em 'Conectar Aparelho'\n4️⃣ Escaneie este QR Code!\n\n⏰ O QR Code expira em alguns minutos!")];
                case 14:
                    _e.sent();
                    return [2 /*return*/, { alreadyConnected: false, sent: true }];
                case 15:
                    elapsed = now() - startedAt;
                    if (!(elapsed - lastProgressAt >= 10000)) return [3 /*break*/, 17];
                    tick += 1;
                    lastProgressAt = elapsed;
                    return [4 /*yield*/, sendText(pickProgressMessage("qr", tick))];
                case 16:
                    _e.sent();
                    _e.label = 17;
                case 17: return [3 /*break*/, 9];
                case 18: 
                // Do not ask the client to retry; keep it clear and automatic.
                return [4 /*yield*/, sendText("⏳ Ainda não consegui gerar o QR Code por aqui, mas eu continuo tentando e te envio automaticamente assim que aparecer.\n\nSe preferir, eu também posso conectar pelo código de 8 dígitos.")];
                case 19:
                    // Do not ask the client to retry; keep it clear and automatic.
                    _e.sent();
                    jobKey = "qr:".concat(userId);
                    if (!backgroundQrJobs.has(jobKey)) {
                        backgroundQrJobs.add(jobKey);
                        (function () { return __awaiter(_this, void 0, void 0, function () {
                            var _a, bgStart, bgMax, conn, qrBuffer;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        _b.trys.push([0, , 13, 14]);
                                        _b.label = 1;
                                    case 1:
                                        _b.trys.push([1, 3, , 4]);
                                        return [4 /*yield*/, connectWhatsApp(userId)];
                                    case 2:
                                        _b.sent();
                                        return [3 /*break*/, 4];
                                    case 3:
                                        _a = _b.sent();
                                        return [3 /*break*/, 4];
                                    case 4:
                                        bgStart = now();
                                        bgMax = 10 * 60000;
                                        _b.label = 5;
                                    case 5:
                                        if (!(now() - bgStart < bgMax)) return [3 /*break*/, 12];
                                        return [4 /*yield*/, sleep(5000)];
                                    case 6:
                                        _b.sent();
                                        return [4 /*yield*/, getConnectionByUserId(userId)];
                                    case 7:
                                        conn = _b.sent();
                                        if (!(conn === null || conn === void 0 ? void 0 : conn.isConnected)) return [3 /*break*/, 9];
                                        return [4 /*yield*/, sendText("✅ Conectado! Seu WhatsApp já está funcionando aqui.")];
                                    case 8:
                                        _b.sent();
                                        return [2 /*return*/];
                                    case 9:
                                        if (!(conn === null || conn === void 0 ? void 0 : conn.qrCode)) return [3 /*break*/, 11];
                                        qrBuffer = extractQrBuffer(conn.qrCode);
                                        if (!qrBuffer) return [3 /*break*/, 11];
                                        return [4 /*yield*/, sendImage(qrBuffer, "📱 Aqui está o QR Code!\n\n1️⃣ Abra o WhatsApp no celular\n2️⃣ Vá em Configurações > Aparelhos Conectados\n3️⃣ Toque em 'Conectar Aparelho'\n4️⃣ Escaneie este QR Code!\n\n⏰ O QR Code expira em alguns minutos!")];
                                    case 10:
                                        _b.sent();
                                        return [2 /*return*/];
                                    case 11: return [3 /*break*/, 5];
                                    case 12: return [3 /*break*/, 14];
                                    case 13:
                                        backgroundQrJobs.delete(jobKey);
                                        return [7 /*endfinally*/];
                                    case 14: return [2 /*return*/];
                                }
                            });
                        }); })();
                    }
                    return [2 /*return*/, { alreadyConnected: false, sent: false }];
            }
        });
    });
}
function ensurePairingCodeSentToClient(params) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, contactNumber, getConnectionByUserId, requestPairingCode, sendText, _a, sleep, _b, now, _c, maxAttempts, existing, attempt, code, codeFormatted, jobKey;
        var _this = this;
        var _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    userId = params.userId, contactNumber = params.contactNumber, getConnectionByUserId = params.getConnectionByUserId, requestPairingCode = params.requestPairingCode, sendText = params.sendText, _a = params.sleep, sleep = _a === void 0 ? defaultSleep : _a, _b = params.now, now = _b === void 0 ? Date.now : _b, _c = params.maxAttempts, maxAttempts = _c === void 0 ? 6 : _c;
                    return [4 /*yield*/, getConnectionByUserId(userId)];
                case 1:
                    existing = _e.sent();
                    if (!(existing === null || existing === void 0 ? void 0 : existing.isConnected)) return [3 /*break*/, 3];
                    return [4 /*yield*/, sendText("✅ Seu WhatsApp já está conectado e funcionando!\n\nSe quiser desconectar para gerar um novo código, é só digitar 'desconectar'.")];
                case 2:
                    _e.sent();
                    return [2 /*return*/, { alreadyConnected: true, sent: true }];
                case 3: return [4 /*yield*/, sendText(pickProgressMessage("pairing", 0))];
                case 4:
                    _e.sent();
                    attempt = 1;
                    _e.label = 5;
                case 5:
                    if (!(attempt <= maxAttempts)) return [3 /*break*/, 12];
                    return [4 /*yield*/, requestPairingCode(userId, contactNumber)];
                case 6:
                    code = _e.sent();
                    if (!code) return [3 /*break*/, 8];
                    codeFormatted = ((_d = code.match(/.{1,4}/g)) === null || _d === void 0 ? void 0 : _d.join("-")) || code;
                    return [4 /*yield*/, sendText("\uD83D\uDD11 Seu c\u00F3digo de pareamento:\n\n*".concat(codeFormatted, "*\n\nAgora \u00E9 s\u00F3:\n1\uFE0F\u20E3 Abrir o WhatsApp no celular\n2\uFE0F\u20E3 Ir em Configura\u00E7\u00F5es > Aparelhos Conectados\n3\uFE0F\u20E3 Tocar em \"Conectar Aparelho\"\n4\uFE0F\u20E3 Tocar em \"Conectar com n\u00FAmero de telefone\"\n5\uFE0F\u20E3 Digitar esse c\u00F3digo!\n\n\u23F0 O c\u00F3digo expira em alguns minutos, ent\u00E3o use logo!"))];
                case 7:
                    _e.sent();
                    return [2 /*return*/, { alreadyConnected: false, sent: true, code: code }];
                case 8: return [4 /*yield*/, sendText(pickProgressMessage("pairing", attempt))];
                case 9:
                    _e.sent();
                    return [4 /*yield*/, sleep(10000)];
                case 10:
                    _e.sent();
                    _e.label = 11;
                case 11:
                    attempt++;
                    return [3 /*break*/, 5];
                case 12: return [4 /*yield*/, sendText("⏳ Não consegui gerar o código de pareamento agora, mas vou continuar tentando.\n\nSe você preferir, eu também consigo conectar por QR Code.")];
                case 13:
                    _e.sent();
                    jobKey = "pairing:".concat(userId);
                    if (!backgroundPairingJobs.has(jobKey)) {
                        backgroundPairingJobs.add(jobKey);
                        (function () { return __awaiter(_this, void 0, void 0, function () {
                            var bgStart, bgMax, attempt, conn, code, codeFormatted;
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        _b.trys.push([0, , 10, 11]);
                                        bgStart = now();
                                        bgMax = 10 * 60000;
                                        attempt = 0;
                                        _b.label = 1;
                                    case 1:
                                        if (!(now() - bgStart < bgMax)) return [3 /*break*/, 9];
                                        attempt += 1;
                                        return [4 /*yield*/, sleep(15000)];
                                    case 2:
                                        _b.sent();
                                        return [4 /*yield*/, getConnectionByUserId(userId)];
                                    case 3:
                                        conn = _b.sent();
                                        if (!(conn === null || conn === void 0 ? void 0 : conn.isConnected)) return [3 /*break*/, 5];
                                        return [4 /*yield*/, sendText("✅ Conectado! Seu WhatsApp já está funcionando aqui.")];
                                    case 4:
                                        _b.sent();
                                        return [2 /*return*/];
                                    case 5: return [4 /*yield*/, requestPairingCode(userId, contactNumber)];
                                    case 6:
                                        code = _b.sent();
                                        if (!code) return [3 /*break*/, 8];
                                        codeFormatted = ((_a = code.match(/.{1,4}/g)) === null || _a === void 0 ? void 0 : _a.join("-")) || code;
                                        return [4 /*yield*/, sendText("\uD83D\uDD11 Seu c\u00F3digo de pareamento:\n\n*".concat(codeFormatted, "*\n\nAgora \u00E9 s\u00F3:\n1\uFE0F\u20E3 Abrir o WhatsApp no celular\n2\uFE0F\u20E3 Ir em Configura\u00E7\u00F5es > Aparelhos Conectados\n3\uFE0F\u20E3 Tocar em \"Conectar Aparelho\"\n4\uFE0F\u20E3 Tocar em \"Conectar com n\u00FAmero de telefone\"\n5\uFE0F\u20E3 Digitar esse c\u00F3digo!\n\n\u23F0 O c\u00F3digo expira em alguns minutos, ent\u00E3o use logo!"))];
                                    case 7:
                                        _b.sent();
                                        return [2 /*return*/];
                                    case 8:
                                        // Evitar logica infinita em silêncio se o cliente desconectou/alterou.
                                        if (attempt >= 20)
                                            return [2 /*return*/];
                                        return [3 /*break*/, 1];
                                    case 9: return [3 /*break*/, 11];
                                    case 10:
                                        backgroundPairingJobs.delete(jobKey);
                                        return [7 /*endfinally*/];
                                    case 11: return [2 /*return*/];
                                }
                            });
                        }); })();
                    }
                    return [2 /*return*/, { alreadyConnected: false, sent: false }];
            }
        });
    });
}
