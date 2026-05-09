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
exports.convertToWhatsAppAudio = convertToWhatsAppAudio;
exports.checkFFmpegAvailable = checkFFmpegAvailable;
var child_process_1 = require("child_process");
var util_1 = require("util");
var promises_1 = require("fs/promises");
var path_1 = require("path");
var os_1 = require("os");
var crypto_1 = require("crypto");
var execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Converte áudio Base64 de WebM para OGG/Opus para compatibilidade com WhatsApp PTT
 * @param base64Data - Dados do áudio em base64 (pode ter prefixo data:audio/...)
 * @param inputMimeType - Tipo MIME de entrada (ex: audio/webm;codecs=opus)
 * @returns Base64 do áudio convertido em OGG/Opus
 */
function convertToWhatsAppAudio(base64Data, inputMimeType) {
    return __awaiter(this, void 0, void 0, function () {
        var normalizedMime, isOggContainer, isOggDataUrl, tempId, inputExt, inputPath, outputPath, pureBase64, inputBuffer, ffmpegCmd, ffmpegError_1, outputBuffer, outputBase64, _a, error_1, _b;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    normalizedMime = (inputMimeType || '').toLowerCase();
                    isOggContainer = normalizedMime.includes('audio/ogg') ||
                        normalizedMime.includes('application/ogg') ||
                        normalizedMime.startsWith('audio/ogg');
                    isOggDataUrl = base64Data.startsWith('data:audio/ogg') ||
                        base64Data.startsWith('data:application/ogg');
                    if (isOggContainer || isOggDataUrl) {
                        console.log('[AudioConverter] ✅ Áudio já está em OGG, sem conversão necessária');
                        return [2 /*return*/, { data: base64Data, mimeType: 'audio/ogg; codecs=opus' }];
                    }
                    tempId = (0, crypto_1.randomUUID)();
                    inputExt = normalizedMime.includes('webm')
                        ? 'webm'
                        : normalizedMime.includes('mpeg') || normalizedMime.includes('mp3')
                            ? 'mp3'
                            : normalizedMime.includes('mp4')
                                ? 'mp4'
                                : normalizedMime.includes('wav')
                                    ? 'wav'
                                    : normalizedMime.includes('ogg')
                                        ? 'ogg'
                                        : 'bin';
                    inputPath = (0, path_1.join)((0, os_1.tmpdir)(), "audio_input_".concat(tempId, ".").concat(inputExt));
                    outputPath = (0, path_1.join)((0, os_1.tmpdir)(), "audio_output_".concat(tempId, ".ogg"));
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 12, , 17]);
                    console.log('[AudioConverter] 🔄 Iniciando conversão de', inputMimeType, 'para OGG/Opus');
                    pureBase64 = base64Data;
                    if (base64Data.startsWith('data:')) {
                        pureBase64 = base64Data.split(',')[1];
                    }
                    inputBuffer = Buffer.from(pureBase64, 'base64');
                    return [4 /*yield*/, (0, promises_1.writeFile)(inputPath, inputBuffer)];
                case 2:
                    _d.sent();
                    console.log('[AudioConverter] 📝 Arquivo de entrada criado:', inputBuffer.length, 'bytes');
                    ffmpegCmd = "ffmpeg -y -fflags +genpts -i \"".concat(inputPath, "\" -avoid_negative_ts make_zero -c:a libopus -b:a 64k -vbr on -vn -ar 48000 -ac 1 -application voip -f ogg \"").concat(outputPath, "\"");
                    console.log('[AudioConverter] 🎬 Executando FFmpeg...');
                    _d.label = 3;
                case 3:
                    _d.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, execAsync(ffmpegCmd, { timeout: 30000 })];
                case 4:
                    _d.sent(); // 30s timeout
                    return [3 /*break*/, 6];
                case 5:
                    ffmpegError_1 = _d.sent();
                    // FFmpeg às vezes retorna código de saída não-zero mas ainda funciona
                    console.log('[AudioConverter] ⚠️ FFmpeg stderr (pode ser normal):', (_c = ffmpegError_1.stderr) === null || _c === void 0 ? void 0 : _c.slice(0, 200));
                    return [3 /*break*/, 6];
                case 6: return [4 /*yield*/, (0, promises_1.readFile)(outputPath)];
                case 7:
                    outputBuffer = _d.sent();
                    console.log('[AudioConverter] ✅ Conversão concluída:', outputBuffer.length, 'bytes');
                    outputBase64 = outputBuffer.toString('base64');
                    _d.label = 8;
                case 8:
                    _d.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, Promise.all([
                            (0, promises_1.unlink)(inputPath).catch(function () { }),
                            (0, promises_1.unlink)(outputPath).catch(function () { })
                        ])];
                case 9:
                    _d.sent();
                    return [3 /*break*/, 11];
                case 10:
                    _a = _d.sent();
                    return [3 /*break*/, 11];
                case 11: return [2 /*return*/, {
                        data: outputBase64,
                        mimeType: 'audio/ogg; codecs=opus'
                    }];
                case 12:
                    error_1 = _d.sent();
                    console.error('[AudioConverter] ❌ Erro na conversão:', error_1.message);
                    _d.label = 13;
                case 13:
                    _d.trys.push([13, 15, , 16]);
                    return [4 /*yield*/, Promise.all([
                            (0, promises_1.unlink)(inputPath).catch(function () { }),
                            (0, promises_1.unlink)(outputPath).catch(function () { })
                        ])];
                case 14:
                    _d.sent();
                    return [3 /*break*/, 16];
                case 15:
                    _b = _d.sent();
                    return [3 /*break*/, 16];
                case 16:
                    // Em caso de erro, NÃO forçar mimeType incorreto.
                    // Melhor retornar o original para que o chamador possa falhar corretamente.
                    console.log('[AudioConverter] ⚠️ Fallback: usando áudio original sem conversão');
                    return [2 /*return*/, { data: base64Data, mimeType: inputMimeType || 'application/octet-stream' }];
                case 17: return [2 /*return*/];
            }
        });
    });
}
/**
 * Verifica se FFmpeg está disponível no sistema
 */
function checkFFmpegAvailable() {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, execAsync('ffmpeg -version')];
                case 1:
                    _b.sent();
                    console.log('[AudioConverter] ✅ FFmpeg disponível');
                    return [2 /*return*/, true];
                case 2:
                    _a = _b.sent();
                    console.log('[AudioConverter] ⚠️ FFmpeg não disponível');
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
