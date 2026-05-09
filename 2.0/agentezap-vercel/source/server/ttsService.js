"use strict";
/**
 * 🎙️ TTS SERVICE - Text-to-Speech GRATUITO que FUNCIONA
 *
 * Opções TESTADAS e FUNCIONAIS:
 * 1. Edge TTS - API GRATUITA da Microsoft (Qualidade Neural HD) ⭐ MELHOR
 * 2. google-tts-api - Usa Google Translate (GRATUITO, sem API key)
 * 3. say.js - Usa TTS nativo do Windows (SAPI) - FUNCIONA OFFLINE
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
exports.generateWithEdgeTTS = generateWithEdgeTTS;
exports.generateWithPuterBrazilian = generateWithPuterBrazilian;
exports.generateWithPuterOpenAI = generateWithPuterOpenAI;
exports.generateWithPuterElevenLabs = generateWithPuterElevenLabs;
exports.generateWithWindowsTTS = generateWithWindowsTTS;
exports.generateWithGoogleTTS = generateWithGoogleTTS;
exports.generateTTS = generateTTS;
exports.listWindowsVoices = listWindowsVoices;
exports.cleanupTempFiles = cleanupTempFiles;
var fs_1 = require("fs");
var path_1 = require("path");
var url_1 = require("url");
var child_process_1 = require("child_process");
var util_1 = require("util");
var say_1 = require("say");
var googleTTS = require("google-tts-api");
var execPromise = (0, util_1.promisify)(child_process_1.exec);
// ============================================================
// EDGE TTS - MICROSOFT NEURAL TTS GRATUITO! ⭐ MELHOR OPÇÃO
// ============================================================
/**
 * 🎙️ Edge TTS - Microsoft Neural TTS GRATUITO
 *
 * ✅ 100% GRATUITO - Sem limites, sem API key
 * ✅ Qualidade Neural HD - Voz muito natural
 * ✅ Voz Brasileira - pt-BR-FranciscaNeural (feminina) ou pt-BR-AntonioNeural (masculina)
 * ✅ Rápido - Baixa latência
 *
 * Vozes disponíveis para pt-BR:
 * - pt-BR-FranciscaNeural (feminina, padrão)
 * - pt-BR-AntonioNeural (masculino)
 * - pt-BR-ThalitaNeural (feminina)
 * - pt-BR-LeticiaNeural (feminina)
 */
function generateWithEdgeTTS(text_1) {
    return __awaiter(this, arguments, void 0, function (text, voice, rate, pitch) {
        var tmpDir, tmpFile, escapedText, command, _a, stdout, stderr, _b, buffer, error_1;
        if (voice === void 0) { voice = 'pt-BR-FranciscaNeural'; }
        if (rate === void 0) { rate = '+0%'; }
        if (pitch === void 0) { pitch = '+0Hz'; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    console.log('🎙️ [EDGE-TTS] Gerando áudio com Microsoft Edge TTS (CLI Python)...');
                    console.log('📝 Texto:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
                    console.log('🔊 Voz:', voice, '| Rate:', rate, '| Pitch:', pitch);
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 10, , 11]);
                    tmpDir = path_1.default.join(process.cwd(), 'tmp');
                    return [4 /*yield*/, fs_1.promises.mkdir(tmpDir, { recursive: true })];
                case 2:
                    _c.sent();
                    tmpFile = path_1.default.join(tmpDir, "tts-".concat(Date.now(), ".mp3"));
                    escapedText = text
                        .replace(/\\/g, '\\\\')
                        .replace(/"/g, '\\"')
                        .replace(/'/g, "'\\''")
                        .replace(/\$/g, '\\$')
                        .replace(/`/g, '\\`');
                    command = "python3 -m edge_tts --voice \"".concat(voice, "\" --rate=\"").concat(rate, "\" --pitch=\"").concat(pitch, "\" --text \"").concat(escapedText, "\" --write-media \"").concat(tmpFile, "\"");
                    console.log('🔧 [EDGE-TTS] Executando comando Python...');
                    console.log('📦 Comando:', command.substring(0, 150) + '...');
                    return [4 /*yield*/, execPromise(command, {
                            timeout: 30000,
                            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                        })];
                case 3:
                    _a = _c.sent(), stdout = _a.stdout, stderr = _a.stderr;
                    if (stderr && !stderr.includes('INFO')) {
                        console.warn('⚠️ [EDGE-TTS] STDERR:', stderr);
                    }
                    _c.label = 4;
                case 4:
                    _c.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, fs_1.promises.access(tmpFile)];
                case 5:
                    _c.sent();
                    return [3 /*break*/, 7];
                case 6:
                    _b = _c.sent();
                    throw new Error('Arquivo de áudio não foi gerado');
                case 7: return [4 /*yield*/, fs_1.promises.readFile(tmpFile)];
                case 8:
                    buffer = _c.sent();
                    // Validar buffer
                    if (!buffer || buffer.length < 1000) {
                        throw new Error("\u00C1udio gerado muito pequeno: ".concat((buffer === null || buffer === void 0 ? void 0 : buffer.length) || 0, " bytes"));
                    }
                    // Remover arquivo temporário
                    return [4 /*yield*/, fs_1.promises.unlink(tmpFile).catch(function () { })];
                case 9:
                    // Remover arquivo temporário
                    _c.sent();
                    console.log("\u2705 [EDGE-TTS] \u00C1udio gerado com sucesso: ".concat(buffer.length, " bytes"));
                    return [2 /*return*/, buffer];
                case 10:
                    error_1 = _c.sent();
                    console.error('❌ [EDGE-TTS] Erro completo:', error_1);
                    throw new Error("Edge TTS falhou: ".concat(error_1.message));
                case 11: return [2 /*return*/];
            }
        });
    });
}
function generateWithPuterTTS(options) {
    return __awaiter(this, void 0, void 0, function () {
        var text, _a, provider, _b, voice, _c, engine, _d, language, model, puterApiUrl, requestBody, response, errorText, arrayBuffer, buffer, error_2;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    text = options.text, _a = options.provider, provider = _a === void 0 ? 'aws-polly' : _a, _b = options.voice, voice = _b === void 0 ? 'Camila' : _b, _c = options.engine, engine = _c === void 0 ? 'neural' : _c, _d = options.language, language = _d === void 0 ? 'pt-BR' : _d, model = options.model;
                    console.log('🎙️ [PUTER-TTS] Gerando áudio com Puter.js API...');
                    console.log('📝 Texto:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
                    console.log('🔊 Provider:', provider, '| Voice:', voice, '| Engine:', engine);
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 6, , 7]);
                    puterApiUrl = 'https://api.puter.com/ai/txt2speech';
                    requestBody = {
                        text: text.substring(0, 3000), // Limite de 3000 caracteres
                    };
                    // Configurar opções baseado no provider
                    if (provider === 'aws-polly') {
                        requestBody.provider = 'aws-polly';
                        requestBody.voice = voice;
                        requestBody.engine = engine;
                        requestBody.language = language;
                    }
                    else if (provider === 'openai') {
                        requestBody.provider = 'openai';
                        requestBody.model = model || 'gpt-4o-mini-tts';
                        requestBody.voice = voice || 'alloy';
                        requestBody.response_format = 'mp3';
                    }
                    else if (provider === 'elevenlabs') {
                        requestBody.provider = 'elevenlabs';
                        requestBody.model = model || 'eleven_multilingual_v2';
                        requestBody.voice = voice || '21m00Tcm4TlvDq8ikWAM';
                    }
                    return [4 /*yield*/, fetch(puterApiUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'audio/mpeg',
                            },
                            body: JSON.stringify(requestBody),
                        })];
                case 2:
                    response = _e.sent();
                    if (!!response.ok) return [3 /*break*/, 4];
                    return [4 /*yield*/, response.text()];
                case 3:
                    errorText = _e.sent();
                    throw new Error("Puter API error: ".concat(response.status, " - ").concat(errorText));
                case 4: return [4 /*yield*/, response.arrayBuffer()];
                case 5:
                    arrayBuffer = _e.sent();
                    buffer = Buffer.from(arrayBuffer);
                    console.log("\u2705 [PUTER-TTS] \u00C1udio gerado: ".concat(buffer.length, " bytes"));
                    return [2 /*return*/, buffer];
                case 6:
                    error_2 = _e.sent();
                    console.error('❌ [PUTER-TTS] Erro:', error_2.message);
                    throw error_2;
                case 7: return [2 /*return*/];
            }
        });
    });
}
// Função para usar Puter TTS com vozes brasileiras
function generateWithPuterBrazilian(text) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            // Camila é a voz neural brasileira da AWS Polly
            return [2 /*return*/, generateWithPuterTTS({
                    text: text,
                    provider: 'aws-polly',
                    voice: 'Camila',
                    engine: 'neural',
                    language: 'pt-BR'
                })];
        });
    });
}
// Função para usar Puter TTS com OpenAI
function generateWithPuterOpenAI(text_1) {
    return __awaiter(this, arguments, void 0, function (text, voice) {
        if (voice === void 0) { voice = 'nova'; }
        return __generator(this, function (_a) {
            return [2 /*return*/, generateWithPuterTTS({
                    text: text,
                    provider: 'openai',
                    voice: voice,
                    model: 'gpt-4o-mini-tts'
                })];
        });
    });
}
// Função para usar Puter TTS com ElevenLabs
function generateWithPuterElevenLabs(text) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, generateWithPuterTTS({
                    text: text,
                    provider: 'elevenlabs',
                    model: 'eleven_multilingual_v2'
                })];
        });
    });
}
var __filename = (0, url_1.fileURLToPath)(import.meta.url);
var __dirname = path_1.default.dirname(__filename);
// Diretório temporário para áudios
var TEMP_AUDIO_DIR = path_1.default.join(__dirname, '../temp_audio');
/**
 * Garante que o diretório de áudios temporários existe
 */
function ensureTempDir() {
    return __awaiter(this, void 0, void 0, function () {
        var error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fs_1.promises.mkdir(TEMP_AUDIO_DIR, { recursive: true })];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    error_3 = _a.sent();
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ============================================================
// OPÇÃO 1: WINDOWS TTS (say.js) - FUNCIONA OFFLINE!
// ============================================================
/**
 * Gera áudio usando o TTS nativo do Windows
 * - 100% gratuito
 * - Funciona OFFLINE
 * - Exporta para WAV
 */
function generateWithWindowsTTS(text_1) {
    return __awaiter(this, arguments, void 0, function (text, speed) {
        var timestamp, outputFile;
        if (speed === void 0) { speed = 1.0; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureTempDir()];
                case 1:
                    _a.sent();
                    timestamp = Date.now();
                    outputFile = path_1.default.join(TEMP_AUDIO_DIR, "windows_tts_".concat(timestamp, ".wav"));
                    console.log('🎙️ [WINDOWS-TTS] Gerando áudio com TTS nativo do Windows...');
                    console.log('📝 Texto:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
                    return [2 /*return*/, new Promise(function (resolve, reject) {
                            // say.export funciona no Windows e Mac
                            say_1.default.export(text, null, speed, outputFile, function (err) {
                                if (err) {
                                    console.error('❌ [WINDOWS-TTS] Erro:', err);
                                    reject(err);
                                    return;
                                }
                                // Ler o arquivo gerado
                                fs_1.promises.readFile(outputFile)
                                    .then(function (buffer) {
                                    console.log("\u2705 [WINDOWS-TTS] \u00C1udio gerado: ".concat(buffer.length, " bytes"));
                                    // Limpar arquivo temporário
                                    fs_1.promises.unlink(outputFile).catch(function () { });
                                    resolve(buffer);
                                })
                                    .catch(reject);
                            });
                        })];
            }
        });
    });
}
// ============================================================
// OPÇÃO 2: GOOGLE TTS (google-tts-api) - GRATUITO!
// ============================================================
/**
 * Gera áudio usando Google Translate TTS
 * - 100% gratuito (usa API pública do Google Translate)
 * - Boa qualidade
 * - Suporta português brasileiro
 */
function generateWithGoogleTTS(text_1) {
    return __awaiter(this, arguments, void 0, function (text, lang) {
        var normalizedLang, base64, buffer, results, buffers, finalBuffer, error_4;
        if (lang === void 0) { lang = 'pt-BR'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('🎙️ [GOOGLE-TTS] Gerando áudio com Google Translate TTS...');
                    console.log('📝 Texto:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
                    normalizedLang = lang.split('-')[0];
                    console.log('🌐 Idioma:', normalizedLang);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    if (!(text.length <= 200)) return [3 /*break*/, 3];
                    return [4 /*yield*/, googleTTS.getAudioBase64(text, {
                            lang: normalizedLang,
                            slow: false,
                            host: 'https://translate.google.com',
                            timeout: 10000,
                        })];
                case 2:
                    base64 = _a.sent();
                    buffer = Buffer.from(base64, 'base64');
                    console.log("\u2705 [GOOGLE-TTS] \u00C1udio gerado: ".concat(buffer.length, " bytes"));
                    return [2 /*return*/, buffer];
                case 3: return [4 /*yield*/, googleTTS.getAllAudioBase64(text, {
                        lang: normalizedLang,
                        slow: false,
                        host: 'https://translate.google.com',
                        timeout: 10000,
                        splitPunct: '.,!?;:',
                    })];
                case 4:
                    results = _a.sent();
                    buffers = results.map(function (r) { return Buffer.from(r.base64, 'base64'); });
                    finalBuffer = Buffer.concat(buffers);
                    console.log("\u2705 [GOOGLE-TTS] \u00C1udio gerado (".concat(results.length, " partes): ").concat(finalBuffer.length, " bytes"));
                    return [2 /*return*/, finalBuffer];
                case 5:
                    error_4 = _a.sent();
                    console.error('❌ [GOOGLE-TTS] Erro:', error_4.message);
                    throw error_4;
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * Serviço principal de TTS com fallback automático
 * Tenta várias engines até conseguir gerar o áudio
 *
 * Ordem de prioridade (modo auto):
 * 1. Edge TTS (Francisca Neural) - GRATUITO, Qualidade Neural HD ⭐ MELHOR
 * 2. Google TTS - Boa qualidade, sempre funciona
 * 3. Windows TTS - Funciona offline
 */
function generateTTS(options) {
    return __awaiter(this, void 0, void 0, function () {
        var text, _a, provider, _b, speed, _c, lang, audio, audio, audio, audio, audio, audio, audio, providers, lastError, _i, providers_1, prov, audio, error_5;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    text = options.text, _a = options.provider, provider = _a === void 0 ? 'auto' : _a, _b = options.speed, speed = _b === void 0 ? 1.0 : _b, _c = options.lang, lang = _c === void 0 ? 'pt-BR' : _c;
                    if (!text || text.trim().length === 0) {
                        throw new Error('Texto vazio');
                    }
                    console.log("\n\uD83C\uDFA4 [TTS] Iniciando gera\u00E7\u00E3o de \u00E1udio...");
                    console.log("\uD83D\uDCCB Provider: ".concat(provider));
                    console.log("\uD83D\uDCDD Texto (".concat(text.length, " chars): \"").concat(text.substring(0, 50), "...\""));
                    if (!(provider === 'edge')) return [3 /*break*/, 2];
                    return [4 /*yield*/, generateWithEdgeTTS(text, 'pt-BR-FranciscaNeural')];
                case 1:
                    audio = _d.sent();
                    return [2 /*return*/, { audio: audio, provider: 'Edge TTS (Francisca Neural)', format: 'mp3' }];
                case 2:
                    if (!(provider === 'edge-antonio')) return [3 /*break*/, 4];
                    return [4 /*yield*/, generateWithEdgeTTS(text, 'pt-BR-AntonioNeural')];
                case 3:
                    audio = _d.sent();
                    return [2 /*return*/, { audio: audio, provider: 'Edge TTS (Antonio Neural)', format: 'mp3' }];
                case 4:
                    if (!(provider === 'windows')) return [3 /*break*/, 6];
                    return [4 /*yield*/, generateWithWindowsTTS(text, speed)];
                case 5:
                    audio = _d.sent();
                    return [2 /*return*/, { audio: audio, provider: 'Windows TTS', format: 'wav' }];
                case 6:
                    if (!(provider === 'google')) return [3 /*break*/, 8];
                    return [4 /*yield*/, generateWithGoogleTTS(text, lang)];
                case 7:
                    audio = _d.sent();
                    return [2 /*return*/, { audio: audio, provider: 'Google TTS', format: 'mp3' }];
                case 8:
                    if (!(provider === 'puter')) return [3 /*break*/, 10];
                    return [4 /*yield*/, generateWithPuterBrazilian(text)];
                case 9:
                    audio = _d.sent();
                    return [2 /*return*/, { audio: audio, provider: 'Puter (AWS Polly Neural)', format: 'mp3' }];
                case 10:
                    if (!(provider === 'puter-openai')) return [3 /*break*/, 12];
                    return [4 /*yield*/, generateWithPuterOpenAI(text)];
                case 11:
                    audio = _d.sent();
                    return [2 /*return*/, { audio: audio, provider: 'Puter (OpenAI TTS)', format: 'mp3' }];
                case 12:
                    if (!(provider === 'puter-elevenlabs')) return [3 /*break*/, 14];
                    return [4 /*yield*/, generateWithPuterElevenLabs(text)];
                case 13:
                    audio = _d.sent();
                    return [2 /*return*/, { audio: audio, provider: 'Puter (ElevenLabs)', format: 'mp3' }];
                case 14:
                    providers = [
                        { name: 'Edge TTS (Francisca Neural)', fn: function () { return generateWithEdgeTTS(text, 'pt-BR-FranciscaNeural'); }, format: 'mp3' },
                    ];
                    lastError = null;
                    _i = 0, providers_1 = providers;
                    _d.label = 15;
                case 15:
                    if (!(_i < providers_1.length)) return [3 /*break*/, 20];
                    prov = providers_1[_i];
                    _d.label = 16;
                case 16:
                    _d.trys.push([16, 18, , 19]);
                    console.log("\uD83D\uDD04 [TTS] Tentando ".concat(prov.name, "..."));
                    return [4 /*yield*/, prov.fn()];
                case 17:
                    audio = _d.sent();
                    // Verificar se o áudio é válido (mais de 1KB)
                    if (audio && audio.length > 1000) {
                        console.log("\u2705 [TTS] Sucesso com ".concat(prov.name, "! Tamanho: ").concat(audio.length, " bytes"));
                        return [2 /*return*/, {
                                audio: audio,
                                provider: prov.name,
                                format: prov.format
                            }];
                    }
                    else {
                        console.warn("\u26A0\uFE0F [TTS] ".concat(prov.name, " gerou \u00E1udio muito pequeno: ").concat((audio === null || audio === void 0 ? void 0 : audio.length) || 0, " bytes"));
                    }
                    return [3 /*break*/, 19];
                case 18:
                    error_5 = _d.sent();
                    console.warn("\u26A0\uFE0F [TTS] ".concat(prov.name, " falhou:"), error_5.message);
                    lastError = error_5;
                    return [3 /*break*/, 19];
                case 19:
                    _i++;
                    return [3 /*break*/, 15];
                case 20: throw lastError || new Error('Nenhum provider de TTS conseguiu gerar o áudio');
            }
        });
    });
}
/**
 * Lista vozes disponíveis no Windows
 */
function listWindowsVoices() {
    return new Promise(function (resolve, reject) {
        say_1.default.getInstalledVoices(function (err, voices) {
            if (err) {
                reject(err);
            }
            else {
                resolve(voices);
            }
        });
    });
}
/**
 * Limpa arquivos temporários antigos
 */
function cleanupTempFiles() {
    return __awaiter(this, arguments, void 0, function (maxAgeMinutes) {
        var files, now, deleted, _i, files_1, file, filePath, stats, ageMinutes, _a;
        if (maxAgeMinutes === void 0) { maxAgeMinutes = 60; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 8, , 9]);
                    return [4 /*yield*/, ensureTempDir()];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, fs_1.promises.readdir(TEMP_AUDIO_DIR)];
                case 2:
                    files = _b.sent();
                    now = Date.now();
                    deleted = 0;
                    _i = 0, files_1 = files;
                    _b.label = 3;
                case 3:
                    if (!(_i < files_1.length)) return [3 /*break*/, 7];
                    file = files_1[_i];
                    filePath = path_1.default.join(TEMP_AUDIO_DIR, file);
                    return [4 /*yield*/, fs_1.promises.stat(filePath)];
                case 4:
                    stats = _b.sent();
                    ageMinutes = (now - stats.mtime.getTime()) / 1000 / 60;
                    if (!(ageMinutes > maxAgeMinutes)) return [3 /*break*/, 6];
                    return [4 /*yield*/, fs_1.promises.unlink(filePath)];
                case 5:
                    _b.sent();
                    deleted++;
                    _b.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 3];
                case 7: return [2 /*return*/, deleted];
                case 8:
                    _a = _b.sent();
                    return [2 /*return*/, 0];
                case 9: return [2 /*return*/];
            }
        });
    });
}
