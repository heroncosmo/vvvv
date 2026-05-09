"use strict";
/**
 * 🗄️ MEDIA STORAGE SERVICE
 *
 * Serviço para upload de mídias (imagens, áudios, vídeos) para o Supabase Storage
 * em vez de salvar como base64 no banco de dados.
 *
 * BENEFÍCIOS:
 * - Reduz Egress do banco em até 90%
 * - Mídias são servidas via CDN (Cached Egress)
 * - Banco fica mais leve e queries mais rápidas
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
exports.uploadMediaToStorage = uploadMediaToStorage;
exports.convertBase64ToStorageUrl = convertBase64ToStorageUrl;
exports.deleteMediaFromStorage = deleteMediaFromStorage;
exports.isStorageUrl = isStorageUrl;
exports.isBase64Url = isBase64Url;
var supabaseAuth_1 = require("./supabaseAuth");
var crypto_1 = require("crypto");
var BUCKET_NAME = "whatsapp-media";
/**
 * Faz upload de um buffer de mídia para o Supabase Storage
 * @param buffer - Buffer contendo os dados da mídia
 * @param mimeType - Tipo MIME do arquivo (ex: image/jpeg, audio/ogg)
 * @param userId - ID do usuário para organização em pastas
 * @param conversationId - ID da conversa (opcional)
 * @returns URL pública da mídia ou null em caso de erro
 */
function uploadMediaToStorage(buffer, mimeType, userId, conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var extension, timestamp, uuid, fileName, filePath, _a, data, error, urlData, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    extension = getExtensionFromMimeType(mimeType);
                    timestamp = Date.now();
                    uuid = (0, crypto_1.randomUUID)().slice(0, 8);
                    fileName = conversationId
                        ? "".concat(conversationId, "_").concat(timestamp, "_").concat(uuid, ".").concat(extension)
                        : "".concat(timestamp, "_").concat(uuid, ".").concat(extension);
                    filePath = "".concat(userId, "/").concat(fileName);
                    console.log("\uD83D\uDCE4 [MediaStorage] Uploading ".concat(buffer.length, " bytes to ").concat(filePath, "..."));
                    return [4 /*yield*/, supabaseAuth_1.supabase.storage
                            .from(BUCKET_NAME)
                            .upload(filePath, buffer, {
                            contentType: mimeType,
                            cacheControl: "3600", // Cache por 1 hora no CDN
                            upsert: false,
                        })];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error) {
                        console.error("\u274C [MediaStorage] Upload failed:", error.message);
                        return [2 /*return*/, null];
                    }
                    urlData = supabaseAuth_1.supabase.storage
                        .from(BUCKET_NAME)
                        .getPublicUrl(filePath).data;
                    if (!(urlData === null || urlData === void 0 ? void 0 : urlData.publicUrl)) {
                        console.error("\u274C [MediaStorage] Failed to get public URL");
                        return [2 /*return*/, null];
                    }
                    console.log("\u2705 [MediaStorage] Uploaded successfully: ".concat(urlData.publicUrl));
                    return [2 /*return*/, {
                            url: urlData.publicUrl,
                            path: filePath,
                            size: buffer.length,
                        }];
                case 2:
                    error_1 = _b.sent();
                    console.error("\u274C [MediaStorage] Unexpected error:", error_1);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Converte uma mídia base64 para URL do Storage
 * @param base64DataUrl - String no formato data:mime/type;base64,xxx
 * @param userId - ID do usuário
 * @param conversationId - ID da conversa (opcional)
 * @returns URL do storage ou a URL original se falhar
 */
function convertBase64ToStorageUrl(base64DataUrl, userId, conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var matches, mimeType, base64Data, buffer, result, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    if (!base64DataUrl.startsWith("data:")) {
                        // Já é uma URL normal, retorna como está
                        return [2 /*return*/, base64DataUrl];
                    }
                    matches = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (!matches) {
                        console.error("\u274C [MediaStorage] Invalid base64 format");
                        return [2 /*return*/, base64DataUrl];
                    }
                    mimeType = matches[1], base64Data = matches[2];
                    buffer = Buffer.from(base64Data, "base64");
                    return [4 /*yield*/, uploadMediaToStorage(buffer, mimeType, userId, conversationId)];
                case 1:
                    result = _a.sent();
                    if (!result) {
                        // Fallback: retorna o base64 original
                        return [2 /*return*/, base64DataUrl];
                    }
                    return [2 /*return*/, result.url];
                case 2:
                    error_2 = _a.sent();
                    console.error("\u274C [MediaStorage] Convert error:", error_2);
                    return [2 /*return*/, base64DataUrl];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Deleta uma mídia do Storage
 */
function deleteMediaFromStorage(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var error, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, supabaseAuth_1.supabase.storage
                            .from(BUCKET_NAME)
                            .remove([filePath])];
                case 1:
                    error = (_a.sent()).error;
                    if (error) {
                        console.error("\u274C [MediaStorage] Delete failed:", error.message);
                        return [2 /*return*/, false];
                    }
                    console.log("\uD83D\uDDD1\uFE0F [MediaStorage] Deleted: ".concat(filePath));
                    return [2 /*return*/, true];
                case 2:
                    error_3 = _a.sent();
                    console.error("\u274C [MediaStorage] Delete error:", error_3);
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Obtém extensão de arquivo baseada no MIME type
 */
function getExtensionFromMimeType(mimeType) {
    var mimeMap = {
        // Imagens
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
        // Áudio
        "audio/ogg": "ogg",
        "audio/ogg; codecs=opus": "ogg",
        "audio/mpeg": "mp3",
        "audio/mp4": "m4a",
        "audio/wav": "wav",
        "audio/webm": "webm",
        // Vídeo
        "video/mp4": "mp4",
        "video/webm": "webm",
        // Documentos
        "application/pdf": "pdf",
        "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.ms-excel": "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    };
    return mimeMap[mimeType] || mimeMap[mimeType.split(";")[0]] || "bin";
}
/**
 * Verifica se uma URL é do Supabase Storage (já migrada)
 */
function isStorageUrl(url) {
    if (!url)
        return false;
    return url.includes("supabase.co/storage") || url.includes("/storage/v1/object/");
}
/**
 * Verifica se uma URL é base64 (precisa migrar)
 */
function isBase64Url(url) {
    if (!url)
        return false;
    return url.startsWith("data:");
}
