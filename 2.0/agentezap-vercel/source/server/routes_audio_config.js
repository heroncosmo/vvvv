"use strict";
/**
 * Rotas da API para Configuração de Áudio TTS (Falar por Áudio)
 * Permite usuários configurar geração automática de áudio nas respostas da IA
 */
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
exports.registerAudioConfigRoutes = registerAudioConfigRoutes;
var storage_1 = require("./storage");
var supabaseAuth_1 = require("./supabaseAuth");
var ttsService_1 = require("./ttsService");
var schema_1 = require("@shared/schema");
// Helper to get userId from authenticated request
function getUserId(req) {
    return req.user.claims.sub;
}
// Mapeamento de vozes Edge TTS
var VOICE_MAP = {
    female: "pt-BR-FranciscaNeural",
    male: "pt-BR-AntonioNeural",
};
function registerAudioConfigRoutes(app) {
    var _this = this;
    console.log("🎤 [AUDIO-CONFIG] Registrando rotas de configuração de áudio TTS...");
    /**
     * GET /api/audio-config
     * Busca configuração de áudio do usuário logado
     */
    app.get("/api/audio-config", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, config, usage, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    userId = getUserId(req);
                    return [4 /*yield*/, storage_1.storage.getAudioConfig(userId)];
                case 1:
                    config = _a.sent();
                    if (!!config) return [3 /*break*/, 3];
                    return [4 /*yield*/, storage_1.storage.createAudioConfig(userId)];
                case 2:
                    config = _a.sent();
                    _a.label = 3;
                case 3: return [4 /*yield*/, storage_1.storage.canSendAudio(userId)];
                case 4:
                    usage = _a.sent();
                    res.json({
                        config: {
                            isEnabled: config.isEnabled,
                            voiceType: config.voiceType,
                            responseMode: config.responseMode,
                            speed: parseFloat(config.speed),
                        },
                        usage: {
                            used: usage.limit - usage.remaining,
                            remaining: usage.remaining,
                            limit: usage.limit,
                            canSend: usage.canSend,
                        },
                    });
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _a.sent();
                    console.error("[AUDIO-CONFIG] Erro ao buscar config:", error_1);
                    res.status(500).json({ message: "Erro ao buscar configuração de áudio" });
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    }); });
    /**
     * PUT /api/audio-config
     * Atualiza configuração de áudio do usuário
     */
    app.put("/api/audio-config", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, _a, isEnabled, voiceType, responseMode, speed, speedNum, config, error_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    _a = req.body, isEnabled = _a.isEnabled, voiceType = _a.voiceType, responseMode = _a.responseMode, speed = _a.speed;
                    // Validar speed
                    if (speed !== undefined) {
                        speedNum = parseFloat(speed);
                        if (isNaN(speedNum) || speedNum < 0.5 || speedNum > 2.0) {
                            return [2 /*return*/, res.status(400).json({ message: "Velocidade deve ser entre 0.5 e 2.0" })];
                        }
                    }
                    // Validar voiceType
                    if (voiceType && !["female", "male"].includes(voiceType)) {
                        return [2 /*return*/, res.status(400).json({ message: "Tipo de voz inválido. Use 'female' ou 'male'" })];
                    }
                    if (responseMode && !schema_1.audioResponseModes.includes(responseMode)) {
                        return [2 /*return*/, res.status(400).json({
                                message: "Modo de resposta inválido. Use 'audio_on_customer_audio', 'audio_only' ou 'audio_text'",
                            })];
                    }
                    return [4 /*yield*/, storage_1.storage.updateAudioConfig(userId, {
                            isEnabled: isEnabled !== undefined ? isEnabled : undefined,
                            voiceType: voiceType || undefined,
                            responseMode: responseMode || undefined,
                            speed: speed !== undefined ? String(speed) : undefined,
                        })];
                case 1:
                    config = _b.sent();
                    res.json({
                        success: true,
                        config: {
                            isEnabled: config.isEnabled,
                            voiceType: config.voiceType,
                            responseMode: config.responseMode,
                            speed: parseFloat(config.speed),
                        },
                    });
                    return [3 /*break*/, 3];
                case 2:
                    error_2 = _b.sent();
                    console.error("[AUDIO-CONFIG] Erro ao atualizar config:", error_2);
                    res.status(500).json({ message: "Erro ao atualizar configuração de áudio" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    /**
     * GET /api/audio-config/usage
     * Retorna estatísticas de uso de áudio do usuário
     */
    app.get("/api/audio-config/usage", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, usage, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    return [4 /*yield*/, storage_1.storage.canSendAudio(userId)];
                case 1:
                    usage = _a.sent();
                    res.json({
                        used: usage.limit - usage.remaining,
                        remaining: usage.remaining,
                        limit: usage.limit,
                        canSend: usage.canSend,
                    });
                    return [3 /*break*/, 3];
                case 2:
                    error_3 = _a.sent();
                    console.error("[AUDIO-CONFIG] Erro ao buscar uso:", error_3);
                    res.status(500).json({ message: "Erro ao buscar uso de áudio" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    /**
     * POST /api/audio-config/test
     * Gera um áudio de teste com a configuração atual
     * Body: { text?: string, speed?: number }
     */
    app.post("/api/audio-config/test", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, _a, text, overrideSpeed, testText, config, speedToUse, voice, ratePercent, rate, audioBuffer, error_4;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 5, , 6]);
                    userId = getUserId(req);
                    _a = req.body, text = _a.text, overrideSpeed = _a.speed;
                    testText = text || "Olá! Este é um teste da configuração de voz para o seu agente de atendimento.";
                    return [4 /*yield*/, storage_1.storage.getAudioConfig(userId)];
                case 1:
                    config = _b.sent();
                    if (!!config) return [3 /*break*/, 3];
                    return [4 /*yield*/, storage_1.storage.createAudioConfig(userId)];
                case 2:
                    config = _b.sent();
                    _b.label = 3;
                case 3:
                    speedToUse = overrideSpeed !== undefined
                        ? parseFloat(overrideSpeed)
                        : parseFloat(config.speed);
                    voice = VOICE_MAP[config.voiceType] || VOICE_MAP.female;
                    ratePercent = Math.round((speedToUse - 1) * 100);
                    rate = ratePercent >= 0 ? "+".concat(ratePercent, "%") : "".concat(ratePercent, "%");
                    console.log("[AUDIO-CONFIG] Gerando \u00E1udio de teste - Voice: ".concat(voice, ", Rate: ").concat(rate));
                    return [4 /*yield*/, (0, ttsService_1.generateWithEdgeTTS)(testText, voice, rate)];
                case 4:
                    audioBuffer = _b.sent();
                    if (!audioBuffer || audioBuffer.length < 1000) {
                        return [2 /*return*/, res.status(500).json({ message: "Falha ao gerar áudio de teste" })];
                    }
                    // Enviar buffer de áudio
                    res.setHeader("Content-Type", "audio/mpeg");
                    res.setHeader("Content-Disposition", "attachment; filename=\"test_audio.mp3\"");
                    res.send(audioBuffer);
                    return [3 /*break*/, 6];
                case 5:
                    error_4 = _b.sent();
                    console.error("[AUDIO-CONFIG] Erro ao gerar teste:", error_4);
                    res.status(500).json({ message: "Erro ao gerar áudio de teste", error: error_4.message });
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    }); });
    /**
     * POST /api/audio-config/preview
     * Gera preview de áudio com velocidade específica (sem usar config do usuário)
     * Body: { speed: number, voiceType?: 'female' | 'male' }
     */
    app.post("/api/audio-config/preview", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, _a, speed, voiceType, speedNum, previewText, voice, ratePercent, rate, audioBuffer, error_5;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    _a = req.body, speed = _a.speed, voiceType = _a.voiceType;
                    if (speed === undefined || isNaN(parseFloat(speed))) {
                        return [2 /*return*/, res.status(400).json({ message: "Velocidade é obrigatória" })];
                    }
                    speedNum = parseFloat(speed);
                    if (speedNum < 0.5 || speedNum > 2.0) {
                        return [2 /*return*/, res.status(400).json({ message: "Velocidade deve ser entre 0.5 e 2.0" })];
                    }
                    previewText = "Este é um exemplo de como a voz do seu assistente vai soar com esta configuração.";
                    voice = voiceType === "male" ? VOICE_MAP.male : VOICE_MAP.female;
                    ratePercent = Math.round((speedNum - 1) * 100);
                    rate = ratePercent >= 0 ? "+".concat(ratePercent, "%") : "".concat(ratePercent, "%");
                    console.log("[AUDIO-CONFIG] Preview - Voice: ".concat(voice, ", Speed: ").concat(speedNum, ", Rate: ").concat(rate));
                    return [4 /*yield*/, (0, ttsService_1.generateWithEdgeTTS)(previewText, voice, rate)];
                case 1:
                    audioBuffer = _b.sent();
                    if (!audioBuffer || audioBuffer.length < 1000) {
                        return [2 /*return*/, res.status(500).json({ message: "Falha ao gerar preview" })];
                    }
                    // Enviar buffer de áudio
                    res.setHeader("Content-Type", "audio/mpeg");
                    res.setHeader("Content-Disposition", "attachment; filename=\"preview_audio.mp3\"");
                    res.send(audioBuffer);
                    return [3 /*break*/, 3];
                case 2:
                    error_5 = _b.sent();
                    console.error("[AUDIO-CONFIG] Erro ao gerar preview:", error_5);
                    res.status(500).json({ message: "Erro ao gerar preview", error: error_5.message });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    console.log("✅ [AUDIO-CONFIG] Rotas de áudio TTS registradas!");
}
