"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🗄️ SERVIÇO DE HISTÓRICO DE EDIÇÃO DE PROMPTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gerencia:
 * 1. Histórico de versões do prompt (para restaurar)
 * 2. Histórico de chat (conversa natural sobre as edições)
 *
 * Usa Supabase/PostgreSQL via pool direto (não Drizzle).
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
exports.salvarVersaoPrompt = salvarVersaoPrompt;
exports.listarVersoes = listarVersoes;
exports.obterVersao = obterVersao;
exports.obterVersaoAtual = obterVersaoAtual;
exports.restaurarVersao = restaurarVersao;
exports.salvarMensagemChat = salvarMensagemChat;
exports.listarChatHistory = listarChatHistory;
exports.limparChatHistory = limparChatHistory;
exports.editarPromptComHistorico = editarPromptComHistorico;
var db_1 = require("./db");
// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE VERSÃO
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Salva uma nova versão do prompt
 */
function salvarVersaoPrompt(params) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, _a, configType, promptContent, _b, editSummary, _c, editType, _d, editDetails, currentVersionResult, currentVersion, existingVersionResult, maxVersionResult, nextVersion, updateResult, insertResult, newVersion, syncErr_1, error_1;
        var _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    userId = params.userId, _a = params.configType, configType = _a === void 0 ? 'ai_agent_config' : _a, promptContent = params.promptContent, _b = params.editSummary, editSummary = _b === void 0 ? null : _b, _c = params.editType, editType = _c === void 0 ? 'manual' : _c, _d = params.editDetails, editDetails = _d === void 0 ? [] : _d;
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 14, , 15]);
                    console.log("[HistoryService] \uD83D\uDCDD Salvando nova vers\u00E3o para user ".concat(userId, ", tipo: ").concat(editType));
                    return [4 /*yield*/, db_1.pool.query("SELECT id, version_number, prompt_content \n       FROM prompt_versions \n       WHERE user_id = $1 AND config_type = $2 AND is_current = true\n       LIMIT 1", [userId, configType])];
                case 2:
                    currentVersionResult = _f.sent();
                    if (!(currentVersionResult.rows.length > 0)) return [3 /*break*/, 5];
                    currentVersion = currentVersionResult.rows[0];
                    if (!(currentVersion.prompt_content === promptContent)) return [3 /*break*/, 4];
                    console.log("[HistoryService] \u26A0\uFE0F DUPLICATA EVITADA! Conte\u00FAdo id\u00EAntico \u00E0 vers\u00E3o atual v".concat(currentVersion.version_number));
                    console.log("[HistoryService] \u2139\uFE0F Retornando vers\u00E3o existente (id: ".concat(currentVersion.id, ")"));
                    return [4 /*yield*/, db_1.pool.query("SELECT * FROM prompt_versions WHERE id = $1", [currentVersion.id])];
                case 3:
                    existingVersionResult = _f.sent();
                    return [2 /*return*/, existingVersionResult.rows[0]];
                case 4:
                    console.log("[HistoryService] \u2713 Conte\u00FAdo diferente da v".concat(currentVersion.version_number, ", criando nova vers\u00E3o"));
                    return [3 /*break*/, 6];
                case 5:
                    console.log("[HistoryService] \u2139\uFE0F Nenhuma vers\u00E3o atual encontrada, criando primeira vers\u00E3o");
                    _f.label = 6;
                case 6: return [4 /*yield*/, db_1.pool.query("SELECT COALESCE(MAX(version_number), 0) as max_version \n       FROM prompt_versions \n       WHERE user_id = $1 AND config_type = $2", [userId, configType])];
                case 7:
                    maxVersionResult = _f.sent();
                    nextVersion = (((_e = maxVersionResult.rows[0]) === null || _e === void 0 ? void 0 : _e.max_version) || 0) + 1;
                    console.log("[HistoryService] Pr\u00F3ximo n\u00FAmero de vers\u00E3o: ".concat(nextVersion));
                    return [4 /*yield*/, db_1.pool.query("UPDATE prompt_versions SET is_current = false \n       WHERE user_id = $1 AND config_type = $2 AND is_current = true\n       RETURNING version_number", [userId, configType])];
                case 8:
                    updateResult = _f.sent();
                    if (updateResult.rows.length > 0) {
                        console.log("[HistoryService] \uD83D\uDD04 Vers\u00F5es anteriores desmarcadas: ".concat(updateResult.rows.map(function (r) { return "v".concat(r.version_number); }).join(', ')));
                    }
                    return [4 /*yield*/, db_1.pool.query("INSERT INTO prompt_versions (\n        user_id, config_type, version_number, prompt_content, \n        edit_summary, edit_type, edit_details, is_current\n      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)\n      RETURNING *", [userId, configType, nextVersion, promptContent, editSummary, editType, JSON.stringify(editDetails)])];
                case 9:
                    insertResult = _f.sent();
                    newVersion = insertResult.rows[0];
                    if (!(configType === 'ai_agent_config')) return [3 /*break*/, 13];
                    _f.label = 10;
                case 10:
                    _f.trys.push([10, 12, , 13]);
                    return [4 /*yield*/, db_1.pool.query("UPDATE ai_agent_config SET prompt = $1, updated_at = now() WHERE user_id = $2", [promptContent, userId])];
                case 11:
                    _f.sent();
                    console.log("[HistoryService] Sync ai_agent_config.prompt for user ".concat(userId));
                    return [3 /*break*/, 13];
                case 12:
                    syncErr_1 = _f.sent();
                    console.error('[HistoryService] Failed to sync ai_agent_config:', syncErr_1);
                    return [3 /*break*/, 13];
                case 13:
                    console.log("[HistoryService] \u2705 Nova vers\u00E3o v".concat(nextVersion, " salva (id: ").concat(newVersion.id, ", is_current: true, prompt length: ").concat(promptContent.length, ")"));
                    return [2 /*return*/, newVersion];
                case 14:
                    error_1 = _f.sent();
                    console.error('[HistoryService] ❌ Erro ao salvar versão:', error_1);
                    return [2 /*return*/, null];
                case 15: return [2 /*return*/];
            }
        });
    });
}
/**
 * Lista todas as versões de um usuário
 */
function listarVersoes(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, configType, limite) {
        var result, error_2;
        if (configType === void 0) { configType = 'ai_agent_config'; }
        if (limite === void 0) { limite = 50; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.pool.query("SELECT * FROM prompt_versions \n       WHERE user_id = $1 AND config_type = $2 \n       ORDER BY version_number DESC \n       LIMIT $3", [userId, configType, limite])];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.rows || []];
                case 2:
                    error_2 = _a.sent();
                    console.error('[HistoryService] Erro ao listar versões:', error_2);
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Obtém uma versão específica
 */
function obterVersao(versionId) {
    return __awaiter(this, void 0, void 0, function () {
        var result, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.pool.query("SELECT * FROM prompt_versions WHERE id = $1", [versionId])];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.rows[0] || null];
                case 2:
                    error_3 = _a.sent();
                    console.error('[HistoryService] Erro ao obter versão:', error_3);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Obtém a versão atual (is_current = true)
 */
function obterVersaoAtual(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, configType) {
        var result, error_4;
        if (configType === void 0) { configType = 'ai_agent_config'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.pool.query("SELECT * FROM prompt_versions \n       WHERE user_id = $1 AND config_type = $2 AND is_current = true\n       ORDER BY version_number DESC, created_at DESC\n       LIMIT 1", [userId, configType])];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.rows[0] || null];
                case 2:
                    error_4 = _a.sent();
                    console.error('[HistoryService] Erro ao obter versão atual:', error_4);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Restaura uma versão anterior
 * Cria uma nova versão com o conteúdo da versão selecionada
 */
function restaurarVersao(versionId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var versaoOriginal, novaVersao, error_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, obterVersao(versionId)];
                case 1:
                    versaoOriginal = _a.sent();
                    if (!versaoOriginal) {
                        console.error('[HistoryService] Versão não encontrada:', versionId);
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, salvarVersaoPrompt({
                            userId: userId,
                            configType: versaoOriginal.config_type,
                            promptContent: versaoOriginal.prompt_content,
                            editSummary: "Restaurado da vers\u00E3o ".concat(versaoOriginal.version_number),
                            editType: 'restore',
                            editDetails: [{ restored_from: versionId, original_version: versaoOriginal.version_number }]
                        })];
                case 2:
                    novaVersao = _a.sent();
                    return [2 /*return*/, novaVersao];
                case 3:
                    error_5 = _a.sent();
                    console.error('[HistoryService] Erro ao restaurar versão:', error_5);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE CHAT
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Salva uma mensagem no histórico de chat
 */
function salvarMensagemChat(params) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, _a, configType, role, content, _b, versionId, _c, metadata, result, error_6;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    userId = params.userId, _a = params.configType, configType = _a === void 0 ? 'ai_agent_config' : _a, role = params.role, content = params.content, _b = params.versionId, versionId = _b === void 0 ? null : _b, _c = params.metadata, metadata = _c === void 0 ? {} : _c;
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, db_1.pool.query("INSERT INTO prompt_edit_chat (\n        user_id, config_type, role, content, version_id, metadata\n      ) VALUES ($1, $2, $3, $4, $5, $6)\n      RETURNING *", [userId, configType, role, content, versionId, JSON.stringify(metadata)])];
                case 2:
                    result = _d.sent();
                    return [2 /*return*/, result.rows[0] || null];
                case 3:
                    error_6 = _d.sent();
                    console.error('[HistoryService] Erro ao salvar mensagem de chat:', error_6);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Lista o histórico de chat de um usuário
 */
function listarChatHistory(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, configType, limite) {
        var result, error_7;
        var _a, _b, _c, _d;
        if (configType === void 0) { configType = 'ai_agent_config'; }
        if (limite === void 0) { limite = 100; }
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _e.trys.push([0, 2, , 3]);
                    // 📝 FIX v2: Buscar os ÚLTIMOS 'limite' registros e reordenar ASC
                    console.log("[HistoryService] \uD83D\uDCDC Buscando chat history para user ".concat(userId, ", limite ").concat(limite));
                    return [4 /*yield*/, db_1.pool.query("SELECT * FROM (\n         SELECT * FROM prompt_edit_chat \n         WHERE user_id = $1 AND config_type = $2 \n         ORDER BY created_at DESC \n         LIMIT $3\n       ) sub\n       ORDER BY created_at ASC", [userId, configType, limite])];
                case 1:
                    result = _e.sent();
                    console.log("[HistoryService] \u2705 Retornando ".concat(((_a = result.rows) === null || _a === void 0 ? void 0 : _a.length) || 0, " mensagens"));
                    if (((_b = result.rows) === null || _b === void 0 ? void 0 : _b.length) > 0) {
                        console.log("[HistoryService] Primeira: \"".concat((_c = result.rows[0].content) === null || _c === void 0 ? void 0 : _c.substring(0, 50), "...\""));
                        console.log("[HistoryService] \u00DAltima: \"".concat((_d = result.rows[result.rows.length - 1].content) === null || _d === void 0 ? void 0 : _d.substring(0, 50), "...\""));
                    }
                    return [2 /*return*/, result.rows || []];
                case 2:
                    error_7 = _e.sent();
                    console.error('[HistoryService] ❌ Erro ao listar chat:', error_7);
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Limpa o histórico de chat (mantém versões)
 */
function limparChatHistory(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, configType) {
        var error_8;
        if (configType === void 0) { configType = 'ai_agent_config'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.pool.query("DELETE FROM prompt_edit_chat WHERE user_id = $1 AND config_type = $2", [userId, configType])];
                case 1:
                    _a.sent();
                    return [2 /*return*/, true];
                case 2:
                    error_8 = _a.sent();
                    console.error('[HistoryService] Erro ao limpar chat:', error_8);
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO COMBINADA: Editar e Salvar Histórico
// ═══════════════════════════════════════════════════════════════════════════
var promptEditService_1 = require("./promptEditService");
/**
 * Edita o prompt via IA e salva no histórico
 * Esta é a função principal que combina tudo:
 * 1. Salva mensagem do usuário no chat
 * 2. Chama a IA para editar
 * 3. Salva a resposta da IA no chat
 * 4. Se houve edição, salva nova versão
 * 5. Retorna resultado completo
 */
function editarPromptComHistorico(userId_1, promptAtual_1, instrucaoUsuario_1, apiKey_1) {
    return __awaiter(this, arguments, void 0, function (userId, promptAtual, instrucaoUsuario, apiKey, configType) {
        var mensagemUsuario, resultado, novaVersao, mensagemAssistente;
        if (configType === void 0) { configType = 'ai_agent_config'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, salvarMensagemChat({
                        userId: userId,
                        configType: configType,
                        role: 'user',
                        content: instrucaoUsuario
                    })];
                case 1:
                    mensagemUsuario = _a.sent();
                    return [4 /*yield*/, (0, promptEditService_1.editarPromptViaIA)(promptAtual, instrucaoUsuario, apiKey, 'mistral')];
                case 2:
                    resultado = _a.sent();
                    novaVersao = null;
                    if (!(resultado.success && resultado.novoPrompt !== promptAtual)) return [3 /*break*/, 4];
                    return [4 /*yield*/, salvarVersaoPrompt({
                            userId: userId,
                            configType: configType,
                            promptContent: resultado.novoPrompt,
                            editSummary: resultado.mensagemChat,
                            editType: 'ia',
                            editDetails: resultado.detalhes
                        })];
                case 3:
                    novaVersao = _a.sent();
                    _a.label = 4;
                case 4: return [4 /*yield*/, salvarMensagemChat({
                        userId: userId,
                        configType: configType,
                        role: 'assistant',
                        content: resultado.mensagemChat,
                        versionId: novaVersao === null || novaVersao === void 0 ? void 0 : novaVersao.id,
                        metadata: {
                            edicoes_aplicadas: resultado.edicoesAplicadas,
                            edicoes_falharam: resultado.edicoesFalharam,
                            success: resultado.success
                        }
                    })];
                case 5:
                    mensagemAssistente = _a.sent();
                    return [2 /*return*/, {
                            resultado: resultado,
                            versao: novaVersao,
                            mensagensChat: {
                                user: mensagemUsuario,
                                assistant: mensagemAssistente
                            }
                        }];
            }
        });
    });
}
