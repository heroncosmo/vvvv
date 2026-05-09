"use strict";
/**
 * 🗑️ MEDIA CLEANUP SERVICE
 *
 * Serviço de limpeza automática de mídias do Supabase Storage.
 *
 * ESTRATÉGIA DE ECONOMIA DE EGRESS:
 * - Mídias são armazenadas temporariamente (1 hora por padrão)
 * - Após processamento pela IA (transcrição, visão), são deletadas
 * - Cliente pode re-baixar sob demanda apertando botão
 * - Metadados (tipo, tamanho, nome) são preservados no banco
 *
 * ECONOMIA ESTIMADA: ~95% do egress de mídias
 *
 * FLUXO:
 * 1. Mídia chega do WhatsApp → Upload temporário no Storage
 * 2. IA processa (transcreve áudio, analisa imagem)
 * 3. Após 1h → Serviço deleta do Storage
 * 4. Cliente quer ver → Botão re-baixa do WhatsApp (se conectado)
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
exports.startMediaCleanupService = startMediaCleanupService;
exports.stopMediaCleanupService = stopMediaCleanupService;
exports.runCleanup = runCleanup;
exports.forceCleanup = forceCleanup;
exports.getStorageStats = getStorageStats;
exports.forceMediaCleanup = forceMediaCleanup;
var supabaseAuth_1 = require("./supabaseAuth");
var db_1 = require("./db");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var mistralClient_1 = require("./mistralClient");
// Configuração
var BUCKET_NAME = "whatsapp-media";
var CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // Rodar a cada 15 minutos
var MEDIA_TTL_MINUTES = 30; // Tempo de vida das mídias (30 minutos)
var BATCH_SIZE = 100; // Quantos arquivos deletar por lote
// Estado do serviço
var cleanupInterval = null;
var isRunning = false;
/**
 * Inicia o serviço de limpeza automática
 */
function startMediaCleanupService() {
    if (cleanupInterval) {
        console.log("\u26A0\uFE0F [MEDIA CLEANUP] Servi\u00E7o j\u00E1 est\u00E1 rodando");
        return;
    }
    console.log("\n\uD83D\uDDD1\uFE0F \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
    console.log("\uD83D\uDDD1\uFE0F [MEDIA CLEANUP] Iniciando servi\u00E7o de limpeza autom\u00E1tica");
    console.log("\uD83D\uDDD1\uFE0F [MEDIA CLEANUP] Intervalo: ".concat(CLEANUP_INTERVAL_MS / 60000, " minutos"));
    console.log("\uD83D\uDDD1\uFE0F [MEDIA CLEANUP] TTL das m\u00EDdias: ".concat(MEDIA_TTL_MINUTES, " minutos"));
    console.log("\uD83D\uDDD1\uFE0F \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
    // 🔥 CRÍTICO: Executar primeira limpeza IMEDIATAMENTE (após 30 segundos)
    setTimeout(function () {
        console.log("\uD83D\uDE80 [MEDIA CLEANUP] Executando primeira limpeza...");
        void runCleanup();
    }, 30 * 1000); // 30 segundos ao invés de 5 minutos
    // Agendar limpezas periódicas
    cleanupInterval = setInterval(function () {
        void runCleanup();
    }, CLEANUP_INTERVAL_MS);
}
/**
 * Para o serviço de limpeza
 */
function stopMediaCleanupService() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        console.log("\uD83D\uDED1 [MEDIA CLEANUP] Servi\u00E7o parado");
    }
}
/**
 * Executa uma rodada de limpeza de mídias antigas
 */
function runCleanup() {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, stats, cutoffDate_1, _a, files, listError, oldFiles, filePaths, i, batch, deleteError, _i, _b, file, error_1;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    if (isRunning) {
                        console.log("\u23F3 [MEDIA CLEANUP] Limpeza j\u00E1 em andamento, pulando...");
                        return [2 /*return*/, { totalFiles: 0, deletedFiles: 0, freedBytes: 0, errors: 0, duration: 0 }];
                    }
                    isRunning = true;
                    startTime = Date.now();
                    console.log("\n\uD83D\uDDD1\uFE0F [MEDIA CLEANUP] Iniciando limpeza de m\u00EDdias antigas...");
                    stats = {
                        totalFiles: 0,
                        deletedFiles: 0,
                        freedBytes: 0,
                        errors: 0,
                        duration: 0,
                    };
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 11, 12, 13]);
                    // 🎤 CRÍTICO: Transcrever áudios pendentes ANTES de deletar arquivos
                    return [4 /*yield*/, transcribePendingAudios()];
                case 2:
                    // 🎤 CRÍTICO: Transcrever áudios pendentes ANTES de deletar arquivos
                    _d.sent();
                    cutoffDate_1 = new Date(Date.now() - MEDIA_TTL_MINUTES * 60 * 1000);
                    console.log("\uD83D\uDDD1\uFE0F [MEDIA CLEANUP] Deletando arquivos criados antes de: ".concat(cutoffDate_1.toISOString()));
                    return [4 /*yield*/, supabaseAuth_1.supabase.storage
                            .from(BUCKET_NAME)
                            .list("whatsapp-media", {
                            limit: 1000,
                            sortBy: { column: "created_at", order: "asc" },
                        })];
                case 3:
                    _a = _d.sent(), files = _a.data, listError = _a.error;
                    if (listError) {
                        console.error("\u274C [MEDIA CLEANUP] Erro ao listar arquivos:", listError);
                        stats.errors++;
                        return [2 /*return*/, stats];
                    }
                    if (!files || files.length === 0) {
                        console.log("\u2705 [MEDIA CLEANUP] Nenhum arquivo para limpar");
                        return [2 /*return*/, stats];
                    }
                    stats.totalFiles = files.length;
                    console.log("\uD83D\uDCCA [MEDIA CLEANUP] Encontrados ".concat(files.length, " arquivos no bucket"));
                    oldFiles = files.filter(function (file) {
                        if (!file.created_at)
                            return false;
                        var fileDate = new Date(file.created_at);
                        return fileDate < cutoffDate_1;
                    });
                    console.log("\uD83C\uDFAF [MEDIA CLEANUP] ".concat(oldFiles.length, " arquivos com mais de ").concat(MEDIA_TTL_MINUTES, " minutos"));
                    if (oldFiles.length === 0) {
                        console.log("\u2705 [MEDIA CLEANUP] Todos os arquivos s\u00E3o recentes, nada para limpar");
                        return [2 /*return*/, stats];
                    }
                    filePaths = oldFiles.map(function (f) { return "whatsapp-media/".concat(f.name); });
                    i = 0;
                    _d.label = 4;
                case 4:
                    if (!(i < filePaths.length)) return [3 /*break*/, 8];
                    batch = filePaths.slice(i, i + BATCH_SIZE);
                    console.log("\uD83D\uDDD1\uFE0F [MEDIA CLEANUP] Deletando lote ".concat(Math.floor(i / BATCH_SIZE) + 1, "/").concat(Math.ceil(filePaths.length / BATCH_SIZE), " (").concat(batch.length, " arquivos)..."));
                    return [4 /*yield*/, supabaseAuth_1.supabase.storage
                            .from(BUCKET_NAME)
                            .remove(batch)];
                case 5:
                    deleteError = (_d.sent()).error;
                    if (deleteError) {
                        console.error("\u274C [MEDIA CLEANUP] Erro ao deletar lote:", deleteError);
                        stats.errors++;
                    }
                    else {
                        stats.deletedFiles += batch.length;
                        // Estimar bytes liberados (usando metadata se disponível)
                        for (_i = 0, _b = oldFiles.slice(i, i + BATCH_SIZE); _i < _b.length; _i++) {
                            file = _b[_i];
                            if ((_c = file.metadata) === null || _c === void 0 ? void 0 : _c.size) {
                                stats.freedBytes += Number(file.metadata.size);
                            }
                        }
                    }
                    if (!(i + BATCH_SIZE < filePaths.length)) return [3 /*break*/, 7];
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 500); })];
                case 6:
                    _d.sent();
                    _d.label = 7;
                case 7:
                    i += BATCH_SIZE;
                    return [3 /*break*/, 4];
                case 8: 
                // Também limpar arquivos dentro de subpastas (user_id/...)
                return [4 /*yield*/, cleanupSubfolders(cutoffDate_1, stats)];
                case 9:
                    // Também limpar arquivos dentro de subpastas (user_id/...)
                    _d.sent();
                    // Atualizar URLs no banco para indicar que mídia expirou
                    return [4 /*yield*/, markExpiredMediaInDatabase(cutoffDate_1)];
                case 10:
                    // Atualizar URLs no banco para indicar que mídia expirou
                    _d.sent();
                    return [3 /*break*/, 13];
                case 11:
                    error_1 = _d.sent();
                    console.error("\u274C [MEDIA CLEANUP] Erro inesperado:", error_1);
                    stats.errors++;
                    return [3 /*break*/, 13];
                case 12:
                    isRunning = false;
                    stats.duration = Date.now() - startTime;
                    console.log("\n\u2705 [MEDIA CLEANUP] Limpeza conclu\u00EDda!");
                    console.log("\uD83D\uDCCA [MEDIA CLEANUP] Estat\u00EDsticas:");
                    console.log("   - Arquivos verificados: ".concat(stats.totalFiles));
                    console.log("   - Arquivos deletados: ".concat(stats.deletedFiles));
                    console.log("   - Espa\u00E7o liberado: ".concat(formatBytes(stats.freedBytes)));
                    console.log("   - Erros: ".concat(stats.errors));
                    console.log("   - Dura\u00E7\u00E3o: ".concat(stats.duration, "ms\n"));
                    return [7 /*endfinally*/];
                case 13: return [2 /*return*/, stats];
            }
        });
    });
}
/**
 * Limpa arquivos em subpastas (organizados por user_id)
 */
function cleanupSubfolders(cutoffDate, stats) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, folders, foldersError, userFolders, _loop_1, _i, userFolders_1, folder, error_2;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 6, , 7]);
                    return [4 /*yield*/, supabaseAuth_1.supabase.storage
                            .from(BUCKET_NAME)
                            .list("", {
                            limit: 1000,
                        })];
                case 1:
                    _a = _c.sent(), folders = _a.data, foldersError = _a.error;
                    if (foldersError || !folders)
                        return [2 /*return*/];
                    userFolders = folders.filter(function (f) { return f.id === null; });
                    _loop_1 = function (folder) {
                        var _d, userFiles, userFilesError, oldUserFiles, filePaths, deleteError, _e, oldUserFiles_1, file;
                        return __generator(this, function (_f) {
                            switch (_f.label) {
                                case 0:
                                    if (!folder.name)
                                        return [2 /*return*/, "continue"];
                                    return [4 /*yield*/, supabaseAuth_1.supabase.storage
                                            .from(BUCKET_NAME)
                                            .list(folder.name, {
                                            limit: 1000,
                                            sortBy: { column: "created_at", order: "asc" },
                                        })];
                                case 1:
                                    _d = _f.sent(), userFiles = _d.data, userFilesError = _d.error;
                                    if (userFilesError || !userFiles)
                                        return [2 /*return*/, "continue"];
                                    oldUserFiles = userFiles.filter(function (file) {
                                        if (!file.created_at)
                                            return false;
                                        var fileDate = new Date(file.created_at);
                                        return fileDate < cutoffDate;
                                    });
                                    if (oldUserFiles.length === 0)
                                        return [2 /*return*/, "continue"];
                                    filePaths = oldUserFiles.map(function (f) { return "".concat(folder.name, "/").concat(f.name); });
                                    console.log("\uD83D\uDDD1\uFE0F [MEDIA CLEANUP] Deletando ".concat(filePaths.length, " arquivos da pasta ").concat(folder.name, "..."));
                                    return [4 /*yield*/, supabaseAuth_1.supabase.storage
                                            .from(BUCKET_NAME)
                                            .remove(filePaths)];
                                case 2:
                                    deleteError = (_f.sent()).error;
                                    if (deleteError) {
                                        console.error("\u274C [MEDIA CLEANUP] Erro ao deletar arquivos de ".concat(folder.name, ":"), deleteError);
                                        stats.errors++;
                                    }
                                    else {
                                        stats.deletedFiles += filePaths.length;
                                        for (_e = 0, oldUserFiles_1 = oldUserFiles; _e < oldUserFiles_1.length; _e++) {
                                            file = oldUserFiles_1[_e];
                                            if ((_b = file.metadata) === null || _b === void 0 ? void 0 : _b.size) {
                                                stats.freedBytes += Number(file.metadata.size);
                                            }
                                        }
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, userFolders_1 = userFolders;
                    _c.label = 2;
                case 2:
                    if (!(_i < userFolders_1.length)) return [3 /*break*/, 5];
                    folder = userFolders_1[_i];
                    return [5 /*yield**/, _loop_1(folder)];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 7];
                case 6:
                    error_2 = _c.sent();
                    console.error("\u274C [MEDIA CLEANUP] Erro ao limpar subpastas:", error_2);
                    stats.errors++;
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * Marca mensagens com mídia expirada no banco de dados
 * Preserva os metadados mas indica que o arquivo não está mais disponível
 */
function markExpiredMediaInDatabase(cutoffDate) {
    return __awaiter(this, void 0, void 0, function () {
        var result, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db
                            .update(schema_1.messages)
                            .set({
                            mediaUrl: null, // Remove URL (arquivo não existe mais)
                            // mediaType, mediaMimeType são PRESERVADOS para re-download
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNotNull)(schema_1.messages.mediaUrl), 
                        // Apenas URLs do Supabase Storage (não base64)
                        (0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.messages.mediaUrl, '%supabase.co/storage%'), (0, drizzle_orm_1.like)(schema_1.messages.mediaUrl, '%/storage/v1/object/%')), 
                        // Mensagens mais antigas que o cutoff
                        (0, drizzle_orm_1.lt)(schema_1.messages.createdAt, cutoffDate)))
                            .returning({ id: schema_1.messages.id })];
                case 1:
                    result = _a.sent();
                    if (result.length > 0) {
                        console.log("\uD83D\uDCDD [MEDIA CLEANUP] ".concat(result.length, " mensagens marcadas como m\u00EDdia expirada"));
                    }
                    return [3 /*break*/, 3];
                case 2:
                    error_3 = _a.sent();
                    console.error("\u274C [MEDIA CLEANUP] Erro ao atualizar banco:", error_3);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Força limpeza imediata de todas as mídias antigas
 * Útil para chamada manual via API admin
 */
function forceCleanup() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            console.log("\uD83D\uDE80 [MEDIA CLEANUP] Limpeza for\u00E7ada solicitada!");
            return [2 /*return*/, runCleanup()];
        });
    });
}
/**
 * Retorna estatísticas atuais do storage
 */
function getStorageStats() {
    return __awaiter(this, void 0, void 0, function () {
        var files, cutoffDate, totalSize, oldSize, oldCount, _i, files_1, file, size, error_4;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, supabaseAuth_1.supabase.storage
                            .from(BUCKET_NAME)
                            .list("", { limit: 10000 })];
                case 1:
                    files = (_b.sent()).data;
                    if (!files) {
                        return [2 /*return*/, { totalFiles: 0, totalSize: "0 B", oldFiles: 0, oldSize: "0 B" }];
                    }
                    cutoffDate = new Date(Date.now() - MEDIA_TTL_MINUTES * 60 * 1000);
                    totalSize = 0;
                    oldSize = 0;
                    oldCount = 0;
                    for (_i = 0, files_1 = files; _i < files_1.length; _i++) {
                        file = files_1[_i];
                        size = ((_a = file.metadata) === null || _a === void 0 ? void 0 : _a.size) ? Number(file.metadata.size) : 0;
                        totalSize += size;
                        if (file.created_at && new Date(file.created_at) < cutoffDate) {
                            oldCount++;
                            oldSize += size;
                        }
                    }
                    return [2 /*return*/, {
                            totalFiles: files.length,
                            totalSize: formatBytes(totalSize),
                            oldFiles: oldCount,
                            oldSize: formatBytes(oldSize),
                        }];
                case 2:
                    error_4 = _b.sent();
                    console.error("\u274C [MEDIA CLEANUP] Erro ao obter estat\u00EDsticas:", error_4);
                    return [2 /*return*/, { totalFiles: 0, totalSize: "0 B", oldFiles: 0, oldSize: "0 B" }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Formata bytes para exibição legível
 */
function formatBytes(bytes) {
    if (bytes === 0)
        return "0 B";
    var k = 1024;
    var sizes = ["B", "KB", "MB", "GB", "TB"];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
/**
 * 🎤 TRANSCRIÇÃO PREVENTIVA: Transcreve áudios que ainda não foram transcritos
 * ANTES de expirar a mídia.
 *
 * Isso garante que:
 * 1. Áudios do CLIENTE são transcritos antes de deletar
 * 2. Áudios do DONO (fromMe=true) também são transcritos
 * 3. A transcrição fica salva mesmo depois da mídia expirar
 */
function transcribePendingAudios() {
    return __awaiter(this, void 0, void 0, function () {
        var cutoffDate, pendingAudios, _i, pendingAudios_1, audio, hasRealTranscription, audioBuffer, base64Part, response, arrayBuffer, transcription, error_5, error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 15, , 16]);
                    cutoffDate = new Date(Date.now() - MEDIA_TTL_MINUTES * 60 * 1000);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.messages)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.messages.mediaType, "audio"), (0, drizzle_orm_1.isNotNull)(schema_1.messages.mediaUrl), 
                        // Mensagens que vão expirar em breve
                        (0, drizzle_orm_1.lt)(schema_1.messages.createdAt, new Date(Date.now() - (MEDIA_TTL_MINUTES - 5) * 60 * 1000))))
                            .limit(20)];
                case 1:
                    pendingAudios = _a.sent();
                    if (pendingAudios.length === 0) {
                        return [2 /*return*/];
                    }
                    console.log("\uD83C\uDFA4 [MEDIA CLEANUP] ".concat(pendingAudios.length, " \u00E1udios pendentes de transcri\u00E7\u00E3o antes de expirar"));
                    _i = 0, pendingAudios_1 = pendingAudios;
                    _a.label = 2;
                case 2:
                    if (!(_i < pendingAudios_1.length)) return [3 /*break*/, 14];
                    audio = pendingAudios_1[_i];
                    hasRealTranscription = audio.text &&
                        !audio.text.startsWith('🎵') &&
                        !audio.text.startsWith('🎤') &&
                        !audio.text.startsWith('[Áudio') &&
                        audio.text.length > 20;
                    if (hasRealTranscription) {
                        return [3 /*break*/, 13]; // Já transcrito
                    }
                    if (!audio.mediaUrl) {
                        return [3 /*break*/, 13]; // Sem URL
                    }
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 12, , 13]);
                    console.log("\uD83C\uDFA4 [MEDIA CLEANUP] Transcrevendo \u00E1udio ".concat(audio.id, " antes de expirar..."));
                    audioBuffer = null;
                    if (!audio.mediaUrl.startsWith("data:")) return [3 /*break*/, 4];
                    base64Part = audio.mediaUrl.split(",")[1];
                    if (base64Part) {
                        audioBuffer = Buffer.from(base64Part, "base64");
                    }
                    return [3 /*break*/, 7];
                case 4:
                    if (!audio.mediaUrl.startsWith("http")) return [3 /*break*/, 7];
                    return [4 /*yield*/, fetch(audio.mediaUrl)];
                case 5:
                    response = _a.sent();
                    if (!response.ok) return [3 /*break*/, 7];
                    return [4 /*yield*/, response.arrayBuffer()];
                case 6:
                    arrayBuffer = _a.sent();
                    audioBuffer = Buffer.from(arrayBuffer);
                    _a.label = 7;
                case 7:
                    if (!audioBuffer || audioBuffer.length === 0) {
                        console.log("\u26A0\uFE0F [MEDIA CLEANUP] N\u00E3o foi poss\u00EDvel baixar \u00E1udio ".concat(audio.id));
                        return [3 /*break*/, 13];
                    }
                    return [4 /*yield*/, (0, mistralClient_1.transcribeAudioWithMistral)(audioBuffer, {
                            fileName: "whatsapp-audio.ogg",
                        })];
                case 8:
                    transcription = _a.sent();
                    if (!(transcription && transcription.length > 0)) return [3 /*break*/, 10];
                    // Atualizar texto da mensagem com transcrição
                    return [4 /*yield*/, db_1.db
                            .update(schema_1.messages)
                            .set({ text: transcription })
                            .where((0, drizzle_orm_1.eq)(schema_1.messages.id, audio.id))];
                case 9:
                    // Atualizar texto da mensagem com transcrição
                    _a.sent();
                    console.log("\u2705 [MEDIA CLEANUP] \u00C1udio ".concat(audio.id, " transcrito: \"").concat(transcription.substring(0, 50), "...\""));
                    _a.label = 10;
                case 10: 
                // Delay entre transcrições para não sobrecarregar API
                return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                case 11:
                    // Delay entre transcrições para não sobrecarregar API
                    _a.sent();
                    return [3 /*break*/, 13];
                case 12:
                    error_5 = _a.sent();
                    console.error("\u274C [MEDIA CLEANUP] Erro ao transcrever \u00E1udio ".concat(audio.id, ":"), error_5);
                    return [3 /*break*/, 13];
                case 13:
                    _i++;
                    return [3 /*break*/, 2];
                case 14: return [3 /*break*/, 16];
                case 15:
                    error_6 = _a.sent();
                    console.error("\u274C [MEDIA CLEANUP] Erro ao buscar \u00E1udios pendentes:", error_6);
                    return [3 /*break*/, 16];
                case 16: return [2 /*return*/];
            }
        });
    });
}
/**
 * Força execução imediata de limpeza (usado por endpoint admin)
 */
function forceMediaCleanup() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\uD83D\uDE80 [MEDIA CLEANUP] Limpeza FOR\u00C7ADA iniciada pelo admin");
                    return [4 /*yield*/, runCleanup()];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
