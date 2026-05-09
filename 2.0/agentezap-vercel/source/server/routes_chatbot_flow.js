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
exports.registerChatbotFlowRoutes = registerChatbotFlowRoutes;
var db_1 = require("./db");
var supabaseAuth_1 = require("./supabaseAuth");
var drizzle_orm_1 = require("drizzle-orm");
var multer_1 = require("multer");
// Configurar multer para upload em memória
var uploadMedia = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: function (req, file, cb) {
        // Aceitar imagens, áudios, vídeos e documentos
        var allowedMimes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/webm',
            'video/mp4', 'video/webm', 'video/quicktime',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error("Tipo de arquivo n\u00E3o permitido: ".concat(file.mimetype)));
        }
    }
});
// Flag para verificar se o bucket existe
var chatbotMediaBucketChecked = false;
function registerChatbotFlowRoutes(app) {
    var _this = this;
    console.log('📦 [CHATBOT_FLOW] Registrando rotas do construtor de fluxo de chatbot...');
    // ============================================================
    // CONFIGURAÇÃO DO CHATBOT
    // ============================================================
    // Obter configuração do chatbot do usuário
    app.get("/api/chatbot/config", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_1, result, newConfig, created, error_1;
        var _this = this;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 5, , 6]);
                    userId_1 = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    if (!userId_1) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n          SELECT * FROM chatbot_configs WHERE user_id = ", "\n        "], ["\n          SELECT * FROM chatbot_configs WHERE user_id = ", "\n        "])), userId_1))];
                            });
                        }); })];
                case 1:
                    result = _b.sent();
                    if (!(result.rows.length === 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["\n            INSERT INTO chatbot_configs (user_id, name)\n            VALUES (", ", 'Meu Rob\u00F4')\n            ON CONFLICT (user_id) DO NOTHING\n            RETURNING *\n          "], ["\n            INSERT INTO chatbot_configs (user_id, name)\n            VALUES (", ", 'Meu Rob\u00F4')\n            ON CONFLICT (user_id) DO NOTHING\n            RETURNING *\n          "])), userId_1))];
                            });
                        }); })];
                case 2:
                    newConfig = _b.sent();
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["\n            SELECT * FROM chatbot_configs WHERE user_id = ", "\n          "], ["\n            SELECT * FROM chatbot_configs WHERE user_id = ", "\n          "])), userId_1))];
                            });
                        }); })];
                case 3:
                    created = _b.sent();
                    return [2 /*return*/, res.json(created.rows[0] || null)];
                case 4:
                    res.json(result.rows[0]);
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _b.sent();
                    console.error('[CHATBOT_FLOW] Erro ao buscar config:', error_1);
                    res.status(500).json({ error: "Erro ao buscar configuração do chatbot" });
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    }); });
    // Handler para criar/atualizar config (suporta PUT e POST)
    var handleConfigSave = function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_2, _a, name_1, description_1, welcome_message_1, fallback_message_1, goodbye_message_1, is_active_1, is_published_1, typing_delay_ms_1, message_delay_ms_1, collect_user_data_1, send_welcome_on_first_contact_1, restart_on_keyword_1, restart_keywords_1, advanced_settings, defaultAdvancedSettings, finalAdvancedSettings_1, result, exclusivityError_1, error_2;
        var _this = this;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 7, , 8]);
                    userId_2 = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
                    if (!userId_2) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    _a = req.body, name_1 = _a.name, description_1 = _a.description, welcome_message_1 = _a.welcome_message, fallback_message_1 = _a.fallback_message, goodbye_message_1 = _a.goodbye_message, is_active_1 = _a.is_active, is_published_1 = _a.is_published, typing_delay_ms_1 = _a.typing_delay_ms, message_delay_ms_1 = _a.message_delay_ms, collect_user_data_1 = _a.collect_user_data, send_welcome_on_first_contact_1 = _a.send_welcome_on_first_contact, restart_on_keyword_1 = _a.restart_on_keyword, restart_keywords_1 = _a.restart_keywords, advanced_settings = _a.advanced_settings;
                    defaultAdvancedSettings = {
                        enable_hybrid_ai: true,
                        ai_confidence_threshold: 0.7,
                        fallback_to_flow: true,
                        interpret_dates: true,
                        interpret_times: true,
                        intent_keywords: {}
                    };
                    finalAdvancedSettings_1 = advanced_settings
                        ? __assign(__assign({}, defaultAdvancedSettings), advanced_settings) : defaultAdvancedSettings;
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["\n          INSERT INTO chatbot_configs (\n            user_id, name, description, welcome_message, fallback_message,\n            goodbye_message, is_active, is_published, typing_delay_ms,\n            message_delay_ms, collect_user_data, send_welcome_on_first_contact,\n            restart_on_keyword, restart_keywords, advanced_settings\n          ) VALUES (\n            ", ", ", ", ", ", \n            ", ",\n            ", ",\n            ", ",\n            ", ", ", ",\n            ", ", ", ",\n            ", ", ", ",\n            ", ", \n            ", ",\n            ", "::jsonb\n          )\n          ON CONFLICT (user_id) DO UPDATE SET\n            name = EXCLUDED.name,\n            description = EXCLUDED.description,\n            welcome_message = EXCLUDED.welcome_message,\n            fallback_message = EXCLUDED.fallback_message,\n            goodbye_message = EXCLUDED.goodbye_message,\n            is_active = EXCLUDED.is_active,\n            is_published = EXCLUDED.is_published,\n            typing_delay_ms = EXCLUDED.typing_delay_ms,\n            message_delay_ms = EXCLUDED.message_delay_ms,\n            collect_user_data = EXCLUDED.collect_user_data,\n            send_welcome_on_first_contact = EXCLUDED.send_welcome_on_first_contact,\n            restart_on_keyword = EXCLUDED.restart_on_keyword,\n            restart_keywords = EXCLUDED.restart_keywords,\n            advanced_settings = EXCLUDED.advanced_settings,\n            updated_at = now(),\n            version = chatbot_configs.version + 1\n          RETURNING *\n        "], ["\n          INSERT INTO chatbot_configs (\n            user_id, name, description, welcome_message, fallback_message,\n            goodbye_message, is_active, is_published, typing_delay_ms,\n            message_delay_ms, collect_user_data, send_welcome_on_first_contact,\n            restart_on_keyword, restart_keywords, advanced_settings\n          ) VALUES (\n            ", ", ", ", ", ", \n            ", ",\n            ", ",\n            ", ",\n            ", ", ", ",\n            ", ", ", ",\n            ", ", ", ",\n            ", ", \n            ", ",\n            ", "::jsonb\n          )\n          ON CONFLICT (user_id) DO UPDATE SET\n            name = EXCLUDED.name,\n            description = EXCLUDED.description,\n            welcome_message = EXCLUDED.welcome_message,\n            fallback_message = EXCLUDED.fallback_message,\n            goodbye_message = EXCLUDED.goodbye_message,\n            is_active = EXCLUDED.is_active,\n            is_published = EXCLUDED.is_published,\n            typing_delay_ms = EXCLUDED.typing_delay_ms,\n            message_delay_ms = EXCLUDED.message_delay_ms,\n            collect_user_data = EXCLUDED.collect_user_data,\n            send_welcome_on_first_contact = EXCLUDED.send_welcome_on_first_contact,\n            restart_on_keyword = EXCLUDED.restart_on_keyword,\n            restart_keywords = EXCLUDED.restart_keywords,\n            advanced_settings = EXCLUDED.advanced_settings,\n            updated_at = now(),\n            version = chatbot_configs.version + 1\n          RETURNING *\n        "])), userId_2, name_1 || 'Meu Robô', description_1 || null, welcome_message_1 || 'Olá! 👋 Como posso ajudar você hoje?', fallback_message_1 || 'Desculpe, não entendi. Por favor, escolha uma das opções abaixo:', goodbye_message_1 || 'Foi um prazer atender você! Até mais! 👋', is_active_1 !== null && is_active_1 !== void 0 ? is_active_1 : false, is_published_1 !== null && is_published_1 !== void 0 ? is_published_1 : false, typing_delay_ms_1 !== null && typing_delay_ms_1 !== void 0 ? typing_delay_ms_1 : 1500, message_delay_ms_1 !== null && message_delay_ms_1 !== void 0 ? message_delay_ms_1 : 500, collect_user_data_1 !== null && collect_user_data_1 !== void 0 ? collect_user_data_1 : true, send_welcome_on_first_contact_1 !== null && send_welcome_on_first_contact_1 !== void 0 ? send_welcome_on_first_contact_1 : true, restart_on_keyword_1 !== null && restart_on_keyword_1 !== void 0 ? restart_on_keyword_1 : true, restart_keywords_1 ? "{".concat(restart_keywords_1.join(','), "}") : '{menu,início,inicio,voltar,reiniciar}', JSON.stringify(finalAdvancedSettings_1)))];
                            });
                        }); })];
                case 1:
                    result = _c.sent();
                    if (!(is_active_1 === true)) return [3 /*break*/, 6];
                    console.log("\uD83D\uDD04 [CHATBOT_CONFIG] Rob\u00F4 Fluxo ativado - desativando Meu Agente IA para user ".concat(userId_2));
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 5, , 6]);
                    // Desativar ai_agent_config
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["\n            UPDATE ai_agent_config \n            SET is_active = false, updated_at = now()\n            WHERE user_id = ", "\n          "], ["\n            UPDATE ai_agent_config \n            SET is_active = false, updated_at = now()\n            WHERE user_id = ", "\n          "])), userId_2))];
                case 3:
                    // Desativar ai_agent_config
                    _c.sent();
                    console.log("\u2705 [CHATBOT_CONFIG] ai_agent_config desativado");
                    // Desativar business_agent_configs
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["\n            UPDATE business_agent_configs \n            SET is_active = false, updated_at = now()\n            WHERE user_id = ", "\n          "], ["\n            UPDATE business_agent_configs \n            SET is_active = false, updated_at = now()\n            WHERE user_id = ", "\n          "])), userId_2))];
                case 4:
                    // Desativar business_agent_configs
                    _c.sent();
                    console.log("\u2705 [CHATBOT_CONFIG] business_agent_configs desativado");
                    return [3 /*break*/, 6];
                case 5:
                    exclusivityError_1 = _c.sent();
                    console.error("\u26A0\uFE0F [CHATBOT_CONFIG] Erro ao desativar Meu Agente IA:", exclusivityError_1);
                    return [3 /*break*/, 6];
                case 6:
                    res.json(result.rows[0]);
                    return [3 /*break*/, 8];
                case 7:
                    error_2 = _c.sent();
                    console.error('[CHATBOT_FLOW] Erro ao salvar config:', error_2);
                    res.status(500).json({ error: "Erro ao salvar configuração do chatbot" });
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    }); };
    // Criar ou atualizar configuração do chatbot (PUT)
    app.put("/api/chatbot/config", supabaseAuth_1.isAuthenticated, handleConfigSave);
    // Suporte a POST também (para compatibilidade com flow-builder-studio)
    app.post("/api/chatbot/config", supabaseAuth_1.isAuthenticated, handleConfigSave);
    // ============================================================
    // GERENCIAMENTO DE NÓS DO FLUXO
    // ============================================================
    // Listar todos os nós do fluxo
    app.get("/api/chatbot/nodes", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_3, result, error_3;
        var _this = this;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId_3 = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    if (!userId_3) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["\n          SELECT n.* FROM chatbot_flow_nodes n\n          JOIN chatbot_configs c ON n.chatbot_id = c.id\n          WHERE c.user_id = ", "\n          ORDER BY n.display_order ASC, n.created_at ASC\n        "], ["\n          SELECT n.* FROM chatbot_flow_nodes n\n          JOIN chatbot_configs c ON n.chatbot_id = c.id\n          WHERE c.user_id = ", "\n          ORDER BY n.display_order ASC, n.created_at ASC\n        "])), userId_3))];
                            });
                        }); })];
                case 1:
                    result = _b.sent();
                    res.json(result.rows);
                    return [3 /*break*/, 3];
                case 2:
                    error_3 = _b.sent();
                    console.error('[CHATBOT_FLOW] Erro ao listar nós:', error_3);
                    res.status(500).json({ error: "Erro ao listar nós do fluxo" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // Criar novo nó
    app.post("/api/chatbot/nodes", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_4, nodes, configResult_1, chatbotId_1, newConfig, results, _loop_1, _i, nodes_1, node, _a, node_id_1, name_2, node_type_1, content_1, next_node_id_1, position_x_1, position_y_1, display_order_1, configResult, chatbotId_2, newConfig, result, error_4;
        var _this = this;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 16, , 17]);
                    userId_4 = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
                    if (!userId_4) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    nodes = req.body.nodes;
                    if (!Array.isArray(nodes)) return [3 /*break*/, 10];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["\n            SELECT id FROM chatbot_configs WHERE user_id = ", "\n          "], ["\n            SELECT id FROM chatbot_configs WHERE user_id = ", "\n          "])), userId_4))];
                            });
                        }); })];
                case 1:
                    configResult_1 = _c.sent();
                    if (!(configResult_1.rows.length === 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["\n              INSERT INTO chatbot_configs (user_id, name)\n              VALUES (", ", 'Meu Rob\u00F4')\n              RETURNING id\n            "], ["\n              INSERT INTO chatbot_configs (user_id, name)\n              VALUES (", ", 'Meu Rob\u00F4')\n              RETURNING id\n            "])), userId_4))];
                            });
                        }); })];
                case 2:
                    newConfig = _c.sent();
                    chatbotId_1 = newConfig.rows[0].id;
                    return [3 /*break*/, 4];
                case 3:
                    chatbotId_1 = configResult_1.rows[0].id;
                    _c.label = 4;
                case 4: 
                // Limpar nós antigos e salvar os novos
                return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["\n            DELETE FROM chatbot_flow_nodes WHERE chatbot_id = ", "\n          "], ["\n            DELETE FROM chatbot_flow_nodes WHERE chatbot_id = ", "\n          "])), chatbotId_1))];
                        });
                    }); })];
                case 5:
                    // Limpar nós antigos e salvar os novos
                    _c.sent();
                    results = [];
                    _loop_1 = function (node) {
                        var result_1;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0: return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                                        var _a, _b, _c;
                                        return __generator(this, function (_d) {
                                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["\n              INSERT INTO chatbot_flow_nodes (\n                chatbot_id, node_id, name, node_type, content,\n                next_node_id, position_x, position_y, display_order\n              ) VALUES (\n                ", ", ", ", ", ", ", ",\n                ", ", ", ",\n                ", ", ", ", ", "\n              )\n              RETURNING *\n            "], ["\n              INSERT INTO chatbot_flow_nodes (\n                chatbot_id, node_id, name, node_type, content,\n                next_node_id, position_x, position_y, display_order\n              ) VALUES (\n                ", ", ", ", ", ", ", ",\n                ", ", ", ",\n                ", ", ", ", ", "\n              )\n              RETURNING *\n            "])), chatbotId_1, node.node_id, node.name, node.node_type, JSON.stringify(node.content || {}), node.next_node_id || null, (_a = node.position_x) !== null && _a !== void 0 ? _a : 0, (_b = node.position_y) !== null && _b !== void 0 ? _b : 0, (_c = node.display_order) !== null && _c !== void 0 ? _c : 0))];
                                        });
                                    }); })];
                                case 1:
                                    result_1 = _d.sent();
                                    results.push(result_1.rows[0]);
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, nodes_1 = nodes;
                    _c.label = 6;
                case 6:
                    if (!(_i < nodes_1.length)) return [3 /*break*/, 9];
                    node = nodes_1[_i];
                    return [5 /*yield**/, _loop_1(node)];
                case 7:
                    _c.sent();
                    _c.label = 8;
                case 8:
                    _i++;
                    return [3 /*break*/, 6];
                case 9: return [2 /*return*/, res.json(results)];
                case 10:
                    _a = req.body, node_id_1 = _a.node_id, name_2 = _a.name, node_type_1 = _a.node_type, content_1 = _a.content, next_node_id_1 = _a.next_node_id, position_x_1 = _a.position_x, position_y_1 = _a.position_y, display_order_1 = _a.display_order;
                    if (!node_id_1 || !name_2 || !node_type_1) {
                        return [2 /*return*/, res.status(400).json({ error: "node_id, name e node_type são obrigatórios" })];
                    }
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["\n          SELECT id FROM chatbot_configs WHERE user_id = ", "\n        "], ["\n          SELECT id FROM chatbot_configs WHERE user_id = ", "\n        "])), userId_4))];
                            });
                        }); })];
                case 11:
                    configResult = _c.sent();
                    if (!(configResult.rows.length === 0)) return [3 /*break*/, 13];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject(["\n            INSERT INTO chatbot_configs (user_id, name)\n            VALUES (", ", 'Meu Rob\u00F4')\n            RETURNING id\n          "], ["\n            INSERT INTO chatbot_configs (user_id, name)\n            VALUES (", ", 'Meu Rob\u00F4')\n            RETURNING id\n          "])), userId_4))];
                            });
                        }); })];
                case 12:
                    newConfig = _c.sent();
                    chatbotId_2 = newConfig.rows[0].id;
                    return [3 /*break*/, 14];
                case 13:
                    chatbotId_2 = configResult.rows[0].id;
                    _c.label = 14;
                case 14: return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["\n          INSERT INTO chatbot_flow_nodes (\n            chatbot_id, node_id, name, node_type, content,\n            next_node_id, position_x, position_y, display_order\n          ) VALUES (\n            ", ", ", ", ", ", ", ",\n            ", ", ", ",\n            ", ", ", ", ", "\n          )\n          ON CONFLICT (chatbot_id, node_id) DO UPDATE SET\n            name = EXCLUDED.name,\n            node_type = EXCLUDED.node_type,\n            content = EXCLUDED.content,\n            next_node_id = EXCLUDED.next_node_id,\n            position_x = EXCLUDED.position_x,\n            position_y = EXCLUDED.position_y,\n            display_order = EXCLUDED.display_order,\n            updated_at = now()\n          RETURNING *\n        "], ["\n          INSERT INTO chatbot_flow_nodes (\n            chatbot_id, node_id, name, node_type, content,\n            next_node_id, position_x, position_y, display_order\n          ) VALUES (\n            ", ", ", ", ", ", ", ",\n            ", ", ", ",\n            ", ", ", ", ", "\n          )\n          ON CONFLICT (chatbot_id, node_id) DO UPDATE SET\n            name = EXCLUDED.name,\n            node_type = EXCLUDED.node_type,\n            content = EXCLUDED.content,\n            next_node_id = EXCLUDED.next_node_id,\n            position_x = EXCLUDED.position_x,\n            position_y = EXCLUDED.position_y,\n            display_order = EXCLUDED.display_order,\n            updated_at = now()\n          RETURNING *\n        "])), chatbotId_2, node_id_1, name_2, node_type_1, JSON.stringify(content_1 || {}), next_node_id_1 || null, position_x_1 !== null && position_x_1 !== void 0 ? position_x_1 : 0, position_y_1 !== null && position_y_1 !== void 0 ? position_y_1 : 0, display_order_1 !== null && display_order_1 !== void 0 ? display_order_1 : 0))];
                        });
                    }); })];
                case 15:
                    result = _c.sent();
                    res.json(result.rows[0]);
                    return [3 /*break*/, 17];
                case 16:
                    error_4 = _c.sent();
                    console.error('[CHATBOT_FLOW] Erro ao criar nó:', error_4);
                    res.status(500).json({ error: "Erro ao criar nó do fluxo" });
                    return [3 /*break*/, 17];
                case 17: return [2 /*return*/];
            }
        });
    }); });
    // Atualizar nó
    app.put("/api/chatbot/nodes/:nodeId", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_5, nodeId_1, _a, name_3, content_2, next_node_id_2, position_x_2, position_y_2, display_order_2, result, error_5;
        var _this = this;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    userId_5 = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
                    if (!userId_5) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    nodeId_1 = req.params.nodeId;
                    _a = req.body, name_3 = _a.name, content_2 = _a.content, next_node_id_2 = _a.next_node_id, position_x_2 = _a.position_x, position_y_2 = _a.position_y, display_order_2 = _a.display_order;
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_16 || (templateObject_16 = __makeTemplateObject(["\n          UPDATE chatbot_flow_nodes n\n          SET \n            name = COALESCE(", ", n.name),\n            content = COALESCE(", "::jsonb, n.content),\n            next_node_id = ", ",\n            position_x = COALESCE(", ", n.position_x),\n            position_y = COALESCE(", ", n.position_y),\n            display_order = COALESCE(", ", n.display_order),\n            updated_at = now()\n          FROM chatbot_configs c\n          WHERE n.chatbot_id = c.id\n            AND c.user_id = ", "\n            AND n.node_id = ", "\n          RETURNING n.*\n        "], ["\n          UPDATE chatbot_flow_nodes n\n          SET \n            name = COALESCE(", ", n.name),\n            content = COALESCE(", "::jsonb, n.content),\n            next_node_id = ", ",\n            position_x = COALESCE(", ", n.position_x),\n            position_y = COALESCE(", ", n.position_y),\n            display_order = COALESCE(", ", n.display_order),\n            updated_at = now()\n          FROM chatbot_configs c\n          WHERE n.chatbot_id = c.id\n            AND c.user_id = ", "\n            AND n.node_id = ", "\n          RETURNING n.*\n        "])), name_3, content_2 ? JSON.stringify(content_2) : null, next_node_id_2 === undefined ? (0, drizzle_orm_1.sql)(templateObject_15 || (templateObject_15 = __makeTemplateObject(["n.next_node_id"], ["n.next_node_id"]))) : next_node_id_2 || null, position_x_2, position_y_2, display_order_2, userId_5, nodeId_1))];
                            });
                        }); })];
                case 1:
                    result = _c.sent();
                    if (result.rows.length === 0) {
                        return [2 /*return*/, res.status(404).json({ error: "Nó não encontrado" })];
                    }
                    res.json(result.rows[0]);
                    return [3 /*break*/, 3];
                case 2:
                    error_5 = _c.sent();
                    console.error('[CHATBOT_FLOW] Erro ao atualizar nó:', error_5);
                    res.status(500).json({ error: "Erro ao atualizar nó do fluxo" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // Deletar nó
    app.delete("/api/chatbot/nodes/:nodeId", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_6, nodeId_2, error_6;
        var _this = this;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    userId_6 = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    if (!userId_6) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    nodeId_2 = req.params.nodeId;
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_17 || (templateObject_17 = __makeTemplateObject(["\n          DELETE FROM chatbot_flow_nodes n\n          USING chatbot_configs c\n          WHERE n.chatbot_id = c.id\n            AND c.user_id = ", "\n            AND n.node_id = ", "\n        "], ["\n          DELETE FROM chatbot_flow_nodes n\n          USING chatbot_configs c\n          WHERE n.chatbot_id = c.id\n            AND c.user_id = ", "\n            AND n.node_id = ", "\n        "])), userId_6, nodeId_2))];
                            });
                        }); })];
                case 1:
                    _b.sent();
                    // Também deletar conexões relacionadas
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_18 || (templateObject_18 = __makeTemplateObject(["\n          DELETE FROM chatbot_flow_connections conn\n          USING chatbot_configs c\n          WHERE conn.chatbot_id = c.id\n            AND c.user_id = ", "\n            AND (conn.from_node_id = ", " OR conn.to_node_id = ", ")\n        "], ["\n          DELETE FROM chatbot_flow_connections conn\n          USING chatbot_configs c\n          WHERE conn.chatbot_id = c.id\n            AND c.user_id = ", "\n            AND (conn.from_node_id = ", " OR conn.to_node_id = ", ")\n        "])), userId_6, nodeId_2, nodeId_2))];
                            });
                        }); })];
                case 2:
                    // Também deletar conexões relacionadas
                    _b.sent();
                    res.json({ success: true });
                    return [3 /*break*/, 4];
                case 3:
                    error_6 = _b.sent();
                    console.error('[CHATBOT_FLOW] Erro ao deletar nó:', error_6);
                    res.status(500).json({ error: "Erro ao deletar nó do fluxo" });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    // Salvar múltiplos nós de uma vez (batch save)
    app.post("/api/chatbot/nodes/batch", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_7, nodes, configResult, chatbotId_3, newConfig, results, _loop_2, _i, nodes_2, node, error_7;
        var _this = this;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 9, , 10]);
                    userId_7 = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    if (!userId_7) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    nodes = req.body.nodes;
                    if (!Array.isArray(nodes)) {
                        return [2 /*return*/, res.status(400).json({ error: "nodes deve ser um array" })];
                    }
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_19 || (templateObject_19 = __makeTemplateObject(["\n          SELECT id FROM chatbot_configs WHERE user_id = ", "\n        "], ["\n          SELECT id FROM chatbot_configs WHERE user_id = ", "\n        "])), userId_7))];
                            });
                        }); })];
                case 1:
                    configResult = _b.sent();
                    if (!(configResult.rows.length === 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_20 || (templateObject_20 = __makeTemplateObject(["\n            INSERT INTO chatbot_configs (user_id, name)\n            VALUES (", ", 'Meu Rob\u00F4')\n            RETURNING id\n          "], ["\n            INSERT INTO chatbot_configs (user_id, name)\n            VALUES (", ", 'Meu Rob\u00F4')\n            RETURNING id\n          "])), userId_7))];
                            });
                        }); })];
                case 2:
                    newConfig = _b.sent();
                    chatbotId_3 = newConfig.rows[0].id;
                    return [3 /*break*/, 4];
                case 3:
                    chatbotId_3 = configResult.rows[0].id;
                    _b.label = 4;
                case 4:
                    results = [];
                    _loop_2 = function (node) {
                        var result;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0: return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                                        var _a, _b, _c;
                                        return __generator(this, function (_d) {
                                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_21 || (templateObject_21 = __makeTemplateObject(["\n            INSERT INTO chatbot_flow_nodes (\n              chatbot_id, node_id, name, node_type, content,\n              next_node_id, position_x, position_y, display_order\n            ) VALUES (\n              ", ", ", ", ", ", ", ",\n              ", ", ", ",\n              ", ", ", ", ", "\n            )\n            ON CONFLICT (chatbot_id, node_id) DO UPDATE SET\n              name = EXCLUDED.name,\n              node_type = EXCLUDED.node_type,\n              content = EXCLUDED.content,\n              next_node_id = EXCLUDED.next_node_id,\n              position_x = EXCLUDED.position_x,\n              position_y = EXCLUDED.position_y,\n              display_order = EXCLUDED.display_order,\n              updated_at = now()\n            RETURNING *\n          "], ["\n            INSERT INTO chatbot_flow_nodes (\n              chatbot_id, node_id, name, node_type, content,\n              next_node_id, position_x, position_y, display_order\n            ) VALUES (\n              ", ", ", ", ", ", ", ",\n              ", ", ", ",\n              ", ", ", ", ", "\n            )\n            ON CONFLICT (chatbot_id, node_id) DO UPDATE SET\n              name = EXCLUDED.name,\n              node_type = EXCLUDED.node_type,\n              content = EXCLUDED.content,\n              next_node_id = EXCLUDED.next_node_id,\n              position_x = EXCLUDED.position_x,\n              position_y = EXCLUDED.position_y,\n              display_order = EXCLUDED.display_order,\n              updated_at = now()\n            RETURNING *\n          "])), chatbotId_3, node.node_id, node.name, node.node_type, JSON.stringify(node.content || {}), node.next_node_id || null, (_a = node.position_x) !== null && _a !== void 0 ? _a : 0, (_b = node.position_y) !== null && _b !== void 0 ? _b : 0, (_c = node.display_order) !== null && _c !== void 0 ? _c : 0))];
                                        });
                                    }); })];
                                case 1:
                                    result = _c.sent();
                                    results.push(result.rows[0]);
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, nodes_2 = nodes;
                    _b.label = 5;
                case 5:
                    if (!(_i < nodes_2.length)) return [3 /*break*/, 8];
                    node = nodes_2[_i];
                    return [5 /*yield**/, _loop_2(node)];
                case 6:
                    _b.sent();
                    _b.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8:
                    res.json(results);
                    return [3 /*break*/, 10];
                case 9:
                    error_7 = _b.sent();
                    console.error('[CHATBOT_FLOW] Erro ao salvar nós em batch:', error_7);
                    res.status(500).json({ error: "Erro ao salvar nós do fluxo" });
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    }); });
    // ============================================================
    // GERENCIAMENTO DE CONEXÕES
    // ============================================================
    // Listar conexões
    app.get("/api/chatbot/connections", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_8, result, error_8;
        var _this = this;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId_8 = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    if (!userId_8) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_22 || (templateObject_22 = __makeTemplateObject(["\n          SELECT conn.* FROM chatbot_flow_connections conn\n          JOIN chatbot_configs c ON conn.chatbot_id = c.id\n          WHERE c.user_id = ", "\n        "], ["\n          SELECT conn.* FROM chatbot_flow_connections conn\n          JOIN chatbot_configs c ON conn.chatbot_id = c.id\n          WHERE c.user_id = ", "\n        "])), userId_8))];
                            });
                        }); })];
                case 1:
                    result = _b.sent();
                    res.json(result.rows);
                    return [3 /*break*/, 3];
                case 2:
                    error_8 = _b.sent();
                    console.error('[CHATBOT_FLOW] Erro ao listar conexões:', error_8);
                    res.status(500).json({ error: "Erro ao listar conexões do fluxo" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // Criar conexão
    app.post("/api/chatbot/connections", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_9, _a, from_node_id_1, from_handle_1, to_node_id_1, label_1, configResult, chatbotId_4, result, error_9;
        var _this = this;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 3, , 4]);
                    userId_9 = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
                    if (!userId_9) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    _a = req.body, from_node_id_1 = _a.from_node_id, from_handle_1 = _a.from_handle, to_node_id_1 = _a.to_node_id, label_1 = _a.label;
                    if (!from_node_id_1 || !to_node_id_1) {
                        return [2 /*return*/, res.status(400).json({ error: "from_node_id e to_node_id são obrigatórios" })];
                    }
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_23 || (templateObject_23 = __makeTemplateObject(["\n          SELECT id FROM chatbot_configs WHERE user_id = ", "\n        "], ["\n          SELECT id FROM chatbot_configs WHERE user_id = ", "\n        "])), userId_9))];
                            });
                        }); })];
                case 1:
                    configResult = _c.sent();
                    if (configResult.rows.length === 0) {
                        return [2 /*return*/, res.status(400).json({ error: "Chatbot não configurado" })];
                    }
                    chatbotId_4 = configResult.rows[0].id;
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_24 || (templateObject_24 = __makeTemplateObject(["\n          INSERT INTO chatbot_flow_connections (\n            chatbot_id, from_node_id, from_handle, to_node_id, label\n          ) VALUES (\n            ", ", ", ", ", ",\n            ", ", ", "\n          )\n          ON CONFLICT (chatbot_id, from_node_id, from_handle) DO UPDATE SET\n            to_node_id = EXCLUDED.to_node_id,\n            label = EXCLUDED.label\n          RETURNING *\n        "], ["\n          INSERT INTO chatbot_flow_connections (\n            chatbot_id, from_node_id, from_handle, to_node_id, label\n          ) VALUES (\n            ", ", ", ", ", ",\n            ", ", ", "\n          )\n          ON CONFLICT (chatbot_id, from_node_id, from_handle) DO UPDATE SET\n            to_node_id = EXCLUDED.to_node_id,\n            label = EXCLUDED.label\n          RETURNING *\n        "])), chatbotId_4, from_node_id_1, from_handle_1 || 'default', to_node_id_1, label_1 || null))];
                            });
                        }); })];
                case 2:
                    result = _c.sent();
                    res.json(result.rows[0]);
                    return [3 /*break*/, 4];
                case 3:
                    error_9 = _c.sent();
                    console.error('[CHATBOT_FLOW] Erro ao criar conexão:', error_9);
                    res.status(500).json({ error: "Erro ao criar conexão do fluxo" });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    // Deletar conexão
    app.delete("/api/chatbot/connections", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_10, _a, from_node_id_2, from_handle_2, error_10;
        var _this = this;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    userId_10 = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
                    if (!userId_10) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    _a = req.body, from_node_id_2 = _a.from_node_id, from_handle_2 = _a.from_handle;
                    if (!from_node_id_2) {
                        return [2 /*return*/, res.status(400).json({ error: "from_node_id é obrigatório" })];
                    }
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_25 || (templateObject_25 = __makeTemplateObject(["\n          DELETE FROM chatbot_flow_connections conn\n          USING chatbot_configs c\n          WHERE conn.chatbot_id = c.id\n            AND c.user_id = ", "\n            AND conn.from_node_id = ", "\n            AND conn.from_handle = ", "\n        "], ["\n          DELETE FROM chatbot_flow_connections conn\n          USING chatbot_configs c\n          WHERE conn.chatbot_id = c.id\n            AND c.user_id = ", "\n            AND conn.from_node_id = ", "\n            AND conn.from_handle = ", "\n        "])), userId_10, from_node_id_2, from_handle_2 || 'default'))];
                            });
                        }); })];
                case 1:
                    _c.sent();
                    res.json({ success: true });
                    return [3 /*break*/, 3];
                case 2:
                    error_10 = _c.sent();
                    console.error('[CHATBOT_FLOW] Erro ao deletar conexão:', error_10);
                    res.status(500).json({ error: "Erro ao deletar conexão do fluxo" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // Salvar conexões em batch
    app.post("/api/chatbot/connections/batch", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_11, _a, connections, replace, configResult, chatbotId_5, results, _loop_3, _i, connections_1, conn, error_11;
        var _this = this;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 8, , 9]);
                    userId_11 = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
                    if (!userId_11) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    _a = req.body, connections = _a.connections, replace = _a.replace;
                    if (!Array.isArray(connections)) {
                        return [2 /*return*/, res.status(400).json({ error: "connections deve ser um array" })];
                    }
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_26 || (templateObject_26 = __makeTemplateObject(["\n          SELECT id FROM chatbot_configs WHERE user_id = ", "\n        "], ["\n          SELECT id FROM chatbot_configs WHERE user_id = ", "\n        "])), userId_11))];
                            });
                        }); })];
                case 1:
                    configResult = _c.sent();
                    if (configResult.rows.length === 0) {
                        return [2 /*return*/, res.status(400).json({ error: "Chatbot não configurado" })];
                    }
                    chatbotId_5 = configResult.rows[0].id;
                    if (!replace) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_27 || (templateObject_27 = __makeTemplateObject(["\n            DELETE FROM chatbot_flow_connections WHERE chatbot_id = ", "\n          "], ["\n            DELETE FROM chatbot_flow_connections WHERE chatbot_id = ", "\n          "])), chatbotId_5))];
                            });
                        }); })];
                case 2:
                    _c.sent();
                    _c.label = 3;
                case 3:
                    results = [];
                    _loop_3 = function (conn) {
                        var result;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0: return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                                        return __generator(this, function (_a) {
                                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_28 || (templateObject_28 = __makeTemplateObject(["\n            INSERT INTO chatbot_flow_connections (\n              chatbot_id, from_node_id, from_handle, to_node_id, label\n            ) VALUES (\n              ", ", ", ", ", ",\n              ", ", ", "\n            )\n            ON CONFLICT (chatbot_id, from_node_id, from_handle) DO UPDATE SET\n              to_node_id = EXCLUDED.to_node_id,\n              label = EXCLUDED.label\n            RETURNING *\n          "], ["\n            INSERT INTO chatbot_flow_connections (\n              chatbot_id, from_node_id, from_handle, to_node_id, label\n            ) VALUES (\n              ", ", ", ", ", ",\n              ", ", ", "\n            )\n            ON CONFLICT (chatbot_id, from_node_id, from_handle) DO UPDATE SET\n              to_node_id = EXCLUDED.to_node_id,\n              label = EXCLUDED.label\n            RETURNING *\n          "])), chatbotId_5, conn.from_node_id, conn.from_handle || 'default', conn.to_node_id, conn.label || null))];
                                        });
                                    }); })];
                                case 1:
                                    result = _d.sent();
                                    results.push(result.rows[0]);
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, connections_1 = connections;
                    _c.label = 4;
                case 4:
                    if (!(_i < connections_1.length)) return [3 /*break*/, 7];
                    conn = connections_1[_i];
                    return [5 /*yield**/, _loop_3(conn)];
                case 5:
                    _c.sent();
                    _c.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7:
                    res.json(results);
                    return [3 /*break*/, 9];
                case 8:
                    error_11 = _c.sent();
                    console.error('[CHATBOT_FLOW] Erro ao salvar conexões em batch:', error_11);
                    res.status(500).json({ error: "Erro ao salvar conexões do fluxo" });
                    return [3 /*break*/, 9];
                case 9: return [2 /*return*/];
            }
        });
    }); });
    // ============================================================
    // SALVAR FLUXO COMPLETO (Nós + Conexões)
    // ============================================================
    app.post("/api/chatbot/flow/save", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_12, _a, nodes, connections, config_1, configResult, chatbotId_6, newConfig, _loop_4, _i, nodes_3, node, _loop_5, _b, connections_2, conn, clearFlowCache, error_12;
        var _this = this;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 18, , 19]);
                    userId_12 = (_c = req.user) === null || _c === void 0 ? void 0 : _c.id;
                    if (!userId_12) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    _a = req.body, nodes = _a.nodes, connections = _a.connections, config_1 = _a.config;
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_29 || (templateObject_29 = __makeTemplateObject(["\n          SELECT id FROM chatbot_configs WHERE user_id = ", "\n        "], ["\n          SELECT id FROM chatbot_configs WHERE user_id = ", "\n        "])), userId_12))];
                            });
                        }); })];
                case 1:
                    configResult = _d.sent();
                    if (!(configResult.rows.length === 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_30 || (templateObject_30 = __makeTemplateObject(["\n            INSERT INTO chatbot_configs (user_id, name)\n            VALUES (", ", ", ")\n            RETURNING id\n          "], ["\n            INSERT INTO chatbot_configs (user_id, name)\n            VALUES (", ", ", ")\n            RETURNING id\n          "])), userId_12, (config_1 === null || config_1 === void 0 ? void 0 : config_1.name) || 'Meu Robô'))];
                            });
                        }); })];
                case 2:
                    newConfig = _d.sent();
                    chatbotId_6 = newConfig.rows[0].id;
                    return [3 /*break*/, 4];
                case 3:
                    chatbotId_6 = configResult.rows[0].id;
                    _d.label = 4;
                case 4:
                    if (!config_1) return [3 /*break*/, 6];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_31 || (templateObject_31 = __makeTemplateObject(["\n            UPDATE chatbot_configs SET\n              name = COALESCE(", ", name),\n              description = ", ",\n              welcome_message = COALESCE(", ", welcome_message),\n              fallback_message = COALESCE(", ", fallback_message),\n              goodbye_message = COALESCE(", ", goodbye_message),\n              updated_at = now(),\n              version = version + 1\n            WHERE id = ", "\n          "], ["\n            UPDATE chatbot_configs SET\n              name = COALESCE(", ", name),\n              description = ", ",\n              welcome_message = COALESCE(", ", welcome_message),\n              fallback_message = COALESCE(", ", fallback_message),\n              goodbye_message = COALESCE(", ", goodbye_message),\n              updated_at = now(),\n              version = version + 1\n            WHERE id = ", "\n          "])), config_1.name, config_1.description || null, config_1.welcome_message, config_1.fallback_message, config_1.goodbye_message, chatbotId_6))];
                            });
                        }); })];
                case 5:
                    _d.sent();
                    _d.label = 6;
                case 6: 
                // Deletar nós e conexões antigas
                return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_32 || (templateObject_32 = __makeTemplateObject(["\n          DELETE FROM chatbot_flow_connections WHERE chatbot_id = ", "\n        "], ["\n          DELETE FROM chatbot_flow_connections WHERE chatbot_id = ", "\n        "])), chatbotId_6))];
                        });
                    }); })];
                case 7:
                    // Deletar nós e conexões antigas
                    _d.sent();
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_33 || (templateObject_33 = __makeTemplateObject(["\n          DELETE FROM chatbot_flow_nodes WHERE chatbot_id = ", "\n        "], ["\n          DELETE FROM chatbot_flow_nodes WHERE chatbot_id = ", "\n        "])), chatbotId_6))];
                            });
                        }); })];
                case 8:
                    _d.sent();
                    if (!Array.isArray(nodes)) return [3 /*break*/, 12];
                    _loop_4 = function (node) {
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0: return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                                        var _a, _b, _c, _d, _e, _f, _g;
                                        return __generator(this, function (_h) {
                                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_34 || (templateObject_34 = __makeTemplateObject(["\n              INSERT INTO chatbot_flow_nodes (\n                chatbot_id, node_id, name, node_type, content,\n                next_node_id, position_x, position_y, display_order\n              ) VALUES (\n                ", ", ", ", ", ", ", ",\n                ", ", ", ",\n                ", ", \n                ", ", \n                ", "\n              )\n            "], ["\n              INSERT INTO chatbot_flow_nodes (\n                chatbot_id, node_id, name, node_type, content,\n                next_node_id, position_x, position_y, display_order\n              ) VALUES (\n                ", ", ", ", ", ", ", ",\n                ", ", ", ",\n                ", ", \n                ", ", \n                ", "\n              )\n            "])), chatbotId_6, node.node_id || node.id, node.name, node.node_type || node.type, JSON.stringify(node.content || node.data || {}), node.next_node_id || null, (_c = (_a = node.position_x) !== null && _a !== void 0 ? _a : (_b = node.position) === null || _b === void 0 ? void 0 : _b.x) !== null && _c !== void 0 ? _c : 0, (_f = (_d = node.position_y) !== null && _d !== void 0 ? _d : (_e = node.position) === null || _e === void 0 ? void 0 : _e.y) !== null && _f !== void 0 ? _f : 0, (_g = node.display_order) !== null && _g !== void 0 ? _g : 0))];
                                        });
                                    }); })];
                                case 1:
                                    _e.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, nodes_3 = nodes;
                    _d.label = 9;
                case 9:
                    if (!(_i < nodes_3.length)) return [3 /*break*/, 12];
                    node = nodes_3[_i];
                    return [5 /*yield**/, _loop_4(node)];
                case 10:
                    _d.sent();
                    _d.label = 11;
                case 11:
                    _i++;
                    return [3 /*break*/, 9];
                case 12:
                    if (!Array.isArray(connections)) return [3 /*break*/, 16];
                    _loop_5 = function (conn) {
                        return __generator(this, function (_f) {
                            switch (_f.label) {
                                case 0: return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                                        return __generator(this, function (_a) {
                                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_35 || (templateObject_35 = __makeTemplateObject(["\n              INSERT INTO chatbot_flow_connections (\n                chatbot_id, from_node_id, from_handle, to_node_id, label\n              ) VALUES (\n                ", ", ", ", \n                ", ",\n                ", ", ", "\n              )\n            "], ["\n              INSERT INTO chatbot_flow_connections (\n                chatbot_id, from_node_id, from_handle, to_node_id, label\n              ) VALUES (\n                ", ", ", ", \n                ", ",\n                ", ", ", "\n              )\n            "])), chatbotId_6, conn.from_node_id || conn.source, conn.from_handle || conn.sourceHandle || 'default', conn.to_node_id || conn.target, conn.label || null))];
                                        });
                                    }); })];
                                case 1:
                                    _f.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _b = 0, connections_2 = connections;
                    _d.label = 13;
                case 13:
                    if (!(_b < connections_2.length)) return [3 /*break*/, 16];
                    conn = connections_2[_b];
                    return [5 /*yield**/, _loop_5(conn)];
                case 14:
                    _d.sent();
                    _d.label = 15;
                case 15:
                    _b++;
                    return [3 /*break*/, 13];
                case 16: return [4 /*yield*/, Promise.resolve().then(function () { return require("./chatbotFlowEngine"); })];
                case 17:
                    clearFlowCache = (_d.sent()).clearFlowCache;
                    clearFlowCache(userId_12);
                    console.log("\uD83D\uDD04 [CHATBOT_FLOW] Cache limpo para usu\u00E1rio ".concat(userId_12, " ap\u00F3s salvar fluxo"));
                    res.json({ success: true, chatbotId: chatbotId_6 });
                    return [3 /*break*/, 19];
                case 18:
                    error_12 = _d.sent();
                    console.error('[CHATBOT_FLOW] Erro ao salvar fluxo:', error_12);
                    res.status(500).json({ error: "Erro ao salvar fluxo completo" });
                    return [3 /*break*/, 19];
                case 19: return [2 /*return*/];
            }
        });
    }); });
    // Carregar fluxo completo
    app.get("/api/chatbot/flow", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_13, configResult, config_2, nodesResult, connectionsResult, error_13;
        var _this = this;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 4, , 5]);
                    userId_13 = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    if (!userId_13) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_36 || (templateObject_36 = __makeTemplateObject(["\n          SELECT * FROM chatbot_configs WHERE user_id = ", "\n        "], ["\n          SELECT * FROM chatbot_configs WHERE user_id = ", "\n        "])), userId_13))];
                            });
                        }); })];
                case 1:
                    configResult = _b.sent();
                    if (configResult.rows.length === 0) {
                        return [2 /*return*/, res.json({ config: null, nodes: [], connections: [] })];
                    }
                    config_2 = configResult.rows[0];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_37 || (templateObject_37 = __makeTemplateObject(["\n          SELECT * FROM chatbot_flow_nodes \n          WHERE chatbot_id = ", "\n          ORDER BY display_order ASC, created_at ASC\n        "], ["\n          SELECT * FROM chatbot_flow_nodes \n          WHERE chatbot_id = ", "\n          ORDER BY display_order ASC, created_at ASC\n        "])), config_2.id))];
                            });
                        }); })];
                case 2:
                    nodesResult = _b.sent();
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_38 || (templateObject_38 = __makeTemplateObject(["\n          SELECT * FROM chatbot_flow_connections \n          WHERE chatbot_id = ", "\n        "], ["\n          SELECT * FROM chatbot_flow_connections \n          WHERE chatbot_id = ", "\n        "])), config_2.id))];
                            });
                        }); })];
                case 3:
                    connectionsResult = _b.sent();
                    res.json({
                        config: config_2,
                        nodes: nodesResult.rows,
                        connections: connectionsResult.rows
                    });
                    return [3 /*break*/, 5];
                case 4:
                    error_13 = _b.sent();
                    console.error('[CHATBOT_FLOW] Erro ao carregar fluxo:', error_13);
                    res.status(500).json({ error: "Erro ao carregar fluxo" });
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); });
    // ============================================================
    // TEMPLATES - Com fallback para templates hard-coded
    // ============================================================
    // Templates hard-coded para garantir funcionamento
    var HARDCODED_TEMPLATES = [
        {
            id: 'tpl_atendimento_basico',
            name: 'Atendimento Básico',
            description: 'Fluxo simples de boas-vindas com menu de opções',
            category: 'atendimento',
            is_featured: true,
            is_active: true,
            usage_count: 0,
            flow_data: {
                config: { name: 'Atendimento Básico', welcome_message: 'Olá! 👋 Seja bem-vindo!', fallback_message: 'Não entendi. Por favor, escolha uma opção:' },
                nodes: [
                    { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
                    { node_id: 'msg_boas_vindas', name: 'Boas-vindas', node_type: 'message', content: { message: 'Olá! 👋 Seja bem-vindo(a)!\n\nComo posso ajudar você hoje?' }, position_x: 250, position_y: 150 },
                    { node_id: 'btn_menu', name: 'Menu Principal', node_type: 'buttons', content: { message: 'Escolha uma opção:', buttons: [{ id: 'btn_1', text: '1️⃣ Conhecer produtos', value: '1' }, { id: 'btn_2', text: '2️⃣ Falar com atendente', value: '2' }, { id: 'btn_3', text: '3️⃣ Horário de funcionamento', value: '3' }] }, position_x: 250, position_y: 280 },
                    { node_id: 'msg_produtos', name: 'Produtos', node_type: 'message', content: { message: '📦 Temos diversos produtos!\n\nAcesse nosso catálogo ou me conte o que está procurando.' }, position_x: 50, position_y: 420 },
                    { node_id: 'msg_atendente', name: 'Atendente', node_type: 'message', content: { message: '👤 Vou transferir você para um atendente humano.\n\nAguarde um momento, por favor!' }, position_x: 250, position_y: 420 },
                    { node_id: 'msg_horario', name: 'Horário', node_type: 'message', content: { message: '🕐 Nosso horário de atendimento:\n\n📅 Segunda a Sexta: 8h às 18h\n📅 Sábado: 8h às 12h\n📅 Domingo: Fechado' }, position_x: 450, position_y: 420 },
                    { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 550 }
                ],
                connections: [
                    { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_boas_vindas' },
                    { from_node_id: 'msg_boas_vindas', from_handle: 'default', to_node_id: 'btn_menu' },
                    { from_node_id: 'btn_menu', from_handle: 'btn_1', to_node_id: 'msg_produtos', label: '1' },
                    { from_node_id: 'btn_menu', from_handle: 'btn_2', to_node_id: 'msg_atendente', label: '2' },
                    { from_node_id: 'btn_menu', from_handle: 'btn_3', to_node_id: 'msg_horario', label: '3' },
                    { from_node_id: 'msg_produtos', from_handle: 'default', to_node_id: 'end_1' },
                    { from_node_id: 'msg_atendente', from_handle: 'default', to_node_id: 'end_1' },
                    { from_node_id: 'msg_horario', from_handle: 'default', to_node_id: 'end_1' }
                ]
            }
        },
        {
            id: 'tpl_coleta_leads',
            name: 'Coleta de Leads',
            description: 'Captura nome, email e telefone do cliente',
            category: 'vendas',
            is_featured: true,
            is_active: true,
            usage_count: 0,
            flow_data: {
                config: { name: 'Coleta de Leads', welcome_message: 'Olá! Vamos começar seu cadastro.', fallback_message: 'Por favor, responda a pergunta acima.' },
                nodes: [
                    { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
                    { node_id: 'msg_intro', name: 'Introdução', node_type: 'message', content: { message: '👋 Olá! Que bom ter você aqui!\n\nPara prosseguir, preciso de algumas informações.' }, position_x: 250, position_y: 150 },
                    { node_id: 'collect_nome', name: 'Coletar Nome', node_type: 'collect', content: { variable: 'nome', message: '📝 Qual é o seu nome completo?', validation: 'text' }, position_x: 250, position_y: 280 },
                    { node_id: 'collect_email', name: 'Coletar Email', node_type: 'collect', content: { variable: 'email', message: '📧 Qual é o seu melhor email?', validation: 'email' }, position_x: 250, position_y: 410 },
                    { node_id: 'collect_telefone', name: 'Coletar Telefone', node_type: 'collect', content: { variable: 'telefone', message: '📱 Qual é o seu telefone com DDD?', validation: 'phone' }, position_x: 250, position_y: 540 },
                    { node_id: 'msg_confirmacao', name: 'Confirmação', node_type: 'message', content: { message: '✅ Perfeito, {{nome}}!\n\nSeus dados foram registrados com sucesso.\n\nEntraremos em contato em breve!' }, position_x: 250, position_y: 670 },
                    { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 800 }
                ],
                connections: [
                    { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_intro' },
                    { from_node_id: 'msg_intro', from_handle: 'default', to_node_id: 'collect_nome' },
                    { from_node_id: 'collect_nome', from_handle: 'default', to_node_id: 'collect_email' },
                    { from_node_id: 'collect_email', from_handle: 'default', to_node_id: 'collect_telefone' },
                    { from_node_id: 'collect_telefone', from_handle: 'default', to_node_id: 'msg_confirmacao' },
                    { from_node_id: 'msg_confirmacao', from_handle: 'default', to_node_id: 'end_1' }
                ]
            }
        },
        {
            id: 'tpl_agendamento',
            name: 'Agendamento Simples',
            description: 'Fluxo para agendar horários',
            category: 'agendamento',
            is_featured: true,
            is_active: true,
            usage_count: 0,
            flow_data: {
                config: { name: 'Agendamento', welcome_message: 'Olá! Vamos agendar seu horário.', fallback_message: 'Por favor, escolha uma opção válida.' },
                nodes: [
                    { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
                    { node_id: 'msg_intro', name: 'Introdução', node_type: 'message', content: { message: '📅 Olá! Vou ajudar você a agendar um horário.\n\nVamos lá?' }, position_x: 250, position_y: 150 },
                    { node_id: 'collect_nome', name: 'Nome', node_type: 'collect', content: { variable: 'nome', message: 'Qual é o seu nome?', validation: 'text' }, position_x: 250, position_y: 280 },
                    { node_id: 'btn_dia', name: 'Dia', node_type: 'buttons', content: { message: '{{nome}}, qual dia você prefere?', buttons: [{ id: 'seg', text: 'Segunda-feira', value: 'Segunda' }, { id: 'ter', text: 'Terça-feira', value: 'Terça' }, { id: 'qua', text: 'Quarta-feira', value: 'Quarta' }, { id: 'qui', text: 'Quinta-feira', value: 'Quinta' }, { id: 'sex', text: 'Sexta-feira', value: 'Sexta' }] }, position_x: 250, position_y: 410 },
                    { node_id: 'btn_horario', name: 'Horário', node_type: 'buttons', content: { message: 'Qual horário?', buttons: [{ id: 'h1', text: '09:00', value: '09:00' }, { id: 'h2', text: '10:00', value: '10:00' }, { id: 'h3', text: '14:00', value: '14:00' }, { id: 'h4', text: '15:00', value: '15:00' }, { id: 'h5', text: '16:00', value: '16:00' }] }, position_x: 250, position_y: 540 },
                    { node_id: 'msg_confirm', name: 'Confirmação', node_type: 'message', content: { message: '✅ Agendamento confirmado!\n\n📅 Dia: {{dia}}\n⏰ Horário: {{horario}}\n\nAguardamos você, {{nome}}!' }, position_x: 250, position_y: 670 },
                    { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 800 }
                ],
                connections: [
                    { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_intro' },
                    { from_node_id: 'msg_intro', from_handle: 'default', to_node_id: 'collect_nome' },
                    { from_node_id: 'collect_nome', from_handle: 'default', to_node_id: 'btn_dia' },
                    { from_node_id: 'btn_dia', from_handle: 'seg', to_node_id: 'btn_horario' },
                    { from_node_id: 'btn_dia', from_handle: 'ter', to_node_id: 'btn_horario' },
                    { from_node_id: 'btn_dia', from_handle: 'qua', to_node_id: 'btn_horario' },
                    { from_node_id: 'btn_dia', from_handle: 'qui', to_node_id: 'btn_horario' },
                    { from_node_id: 'btn_dia', from_handle: 'sex', to_node_id: 'btn_horario' },
                    { from_node_id: 'btn_horario', from_handle: 'h1', to_node_id: 'msg_confirm' },
                    { from_node_id: 'btn_horario', from_handle: 'h2', to_node_id: 'msg_confirm' },
                    { from_node_id: 'btn_horario', from_handle: 'h3', to_node_id: 'msg_confirm' },
                    { from_node_id: 'btn_horario', from_handle: 'h4', to_node_id: 'msg_confirm' },
                    { from_node_id: 'btn_horario', from_handle: 'h5', to_node_id: 'msg_confirm' },
                    { from_node_id: 'msg_confirm', from_handle: 'default', to_node_id: 'end_1' }
                ]
            }
        },
        {
            id: 'tpl_delivery',
            name: 'Delivery/Pizzaria',
            description: 'Cardápio DINÂMICO - carrega itens reais do seu cadastro de delivery',
            category: 'delivery',
            is_featured: true,
            is_active: true,
            usage_count: 0,
            flow_data: {
                config: {
                    name: 'Delivery Dinâmico',
                    welcome_message: 'Olá! Bem-vindo ao nosso delivery!',
                    fallback_message: 'Por favor, escolha uma opção do menu.',
                    // Flag especial para indicar que este template usa dados dinâmicos
                    useDynamicMenu: true
                },
                nodes: [
                    { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
                    { node_id: 'msg_boas_vindas', name: 'Boas-vindas', node_type: 'message', content: { text: '🍕 Olá! Bem-vindo(a) ao nosso delivery!\n\nTemos os melhores produtos para você! 🎉' }, position_x: 250, position_y: 150 },
                    { node_id: 'btn_menu', name: 'Menu Principal', node_type: 'buttons', content: { body: 'O que você deseja?', buttons: [{ id: 'fazer_pedido', title: '🛒 Fazer Pedido' }, { id: 'ver_carrinho', title: '📦 Ver Carrinho' }, { id: 'horario', title: '⏰ Horário' }] }, position_x: 250, position_y: 280 },
                    // Este nó é especial - carrega dados dinâmicos do Supabase
                    { node_id: 'list_cardapio', name: 'Cardápio', node_type: 'list', content: {
                            body: '📋 *NOSSO CARDÁPIO*\n\nEscolha um item para adicionar ao pedido:',
                            button_text: 'Ver Cardápio',
                            // Marcador especial: DYNAMIC_MENU será substituído pelos itens reais
                            sections: [{ title: '⏳ Carregando cardápio...', rows: [{ id: 'loading', title: 'Aguarde...', description: 'Buscando itens do cardápio' }] }],
                            dynamicSource: 'menu_items' // Indica que deve buscar do Supabase
                        }, position_x: 100, position_y: 420 },
                    { node_id: 'msg_item_adicionado', name: 'Item Adicionado', node_type: 'message', content: { text: '✅ *{{item_nome}}* adicionado ao carrinho!\n\n💰 Subtotal: R$ {{carrinho_total}}\n\nDeseja adicionar mais itens?' }, position_x: 100, position_y: 550 },
                    { node_id: 'btn_mais_itens', name: 'Mais Itens?', node_type: 'buttons', content: { body: 'O que deseja fazer?', buttons: [{ id: 'mais', title: '➕ Adicionar Mais' }, { id: 'finalizar', title: '✅ Finalizar Pedido' }] }, position_x: 100, position_y: 680 },
                    { node_id: 'msg_carrinho', name: 'Carrinho', node_type: 'message', content: { text: '🛒 *SEU CARRINHO*\n\n{{carrinho_itens}}\n\n💰 *Total: R$ {{carrinho_total}}*' }, position_x: 350, position_y: 420 },
                    { node_id: 'btn_carrinho_acao', name: 'Ação Carrinho', node_type: 'buttons', content: { body: 'O que deseja fazer?', buttons: [{ id: 'continuar', title: '➕ Continuar Comprando' }, { id: 'finalizar', title: '✅ Finalizar Pedido' }, { id: 'limpar', title: '🗑️ Limpar Carrinho' }] }, position_x: 350, position_y: 550 },
                    { node_id: 'msg_horario', name: 'Horário', node_type: 'message', content: { text: '⏰ *HORÁRIO DE FUNCIONAMENTO*\n\n📅 Segunda a Domingo\n🕐 18h às 23h\n📍 Entrega em até 45 minutos\n🚚 Taxa de entrega: R$ 5,00' }, position_x: 500, position_y: 420 },
                    { node_id: 'input_endereco', name: 'Endereço', node_type: 'input', content: { variable_name: 'endereco', message: '📍 Qual é o endereço de entrega?\n\n(Rua, número, bairro)', validation: 'text' }, position_x: 250, position_y: 810 },
                    { node_id: 'btn_pagamento', name: 'Pagamento', node_type: 'buttons', content: { body: '💳 Como deseja pagar?', buttons: [{ id: 'pix', title: '📱 PIX' }, { id: 'cartao', title: '💳 Cartão' }, { id: 'dinheiro', title: '💵 Dinheiro' }] }, position_x: 250, position_y: 940 },
                    // Este nó é especial - cria o pedido no Supabase
                    { node_id: 'msg_confirmacao', name: 'Confirmação', node_type: 'message', content: {
                            text: '✅ *PEDIDO CONFIRMADO!*\n\n🛒 {{carrinho_itens}}\n📍 {{endereco}}\n💳 {{pagamento}}\n💰 *Total: R$ {{carrinho_total}}*\n\n⏱️ Tempo estimado: 45 min\n\nObrigado pela preferência! 🙏',
                            // Flag especial para criar pedido no Supabase
                            createOrder: true
                        }, position_x: 250, position_y: 1070 },
                    { node_id: 'msg_carrinho_limpo', name: 'Carrinho Limpo', node_type: 'message', content: { text: '🗑️ Carrinho limpo!\n\nDeseja fazer um novo pedido?' }, position_x: 500, position_y: 680 },
                    { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 1200 }
                ],
                connections: [
                    { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_boas_vindas' },
                    { from_node_id: 'msg_boas_vindas', from_handle: 'default', to_node_id: 'btn_menu' },
                    { from_node_id: 'btn_menu', from_handle: 'fazer_pedido', to_node_id: 'list_cardapio' },
                    { from_node_id: 'btn_menu', from_handle: 'button_fazer_pedido', to_node_id: 'list_cardapio' },
                    { from_node_id: 'btn_menu', from_handle: 'ver_carrinho', to_node_id: 'msg_carrinho' },
                    { from_node_id: 'btn_menu', from_handle: 'button_ver_carrinho', to_node_id: 'msg_carrinho' },
                    { from_node_id: 'btn_menu', from_handle: 'horario', to_node_id: 'msg_horario' },
                    { from_node_id: 'btn_menu', from_handle: 'button_horario', to_node_id: 'msg_horario' },
                    // Qualquer item selecionado do cardápio vai para "item adicionado"
                    { from_node_id: 'list_cardapio', from_handle: 'default', to_node_id: 'msg_item_adicionado' },
                    { from_node_id: 'msg_item_adicionado', from_handle: 'default', to_node_id: 'btn_mais_itens' },
                    { from_node_id: 'btn_mais_itens', from_handle: 'mais', to_node_id: 'list_cardapio' },
                    { from_node_id: 'btn_mais_itens', from_handle: 'button_mais', to_node_id: 'list_cardapio' },
                    { from_node_id: 'btn_mais_itens', from_handle: 'finalizar', to_node_id: 'input_endereco' },
                    { from_node_id: 'btn_mais_itens', from_handle: 'button_finalizar', to_node_id: 'input_endereco' },
                    { from_node_id: 'msg_carrinho', from_handle: 'default', to_node_id: 'btn_carrinho_acao' },
                    { from_node_id: 'btn_carrinho_acao', from_handle: 'continuar', to_node_id: 'list_cardapio' },
                    { from_node_id: 'btn_carrinho_acao', from_handle: 'button_continuar', to_node_id: 'list_cardapio' },
                    { from_node_id: 'btn_carrinho_acao', from_handle: 'finalizar', to_node_id: 'input_endereco' },
                    { from_node_id: 'btn_carrinho_acao', from_handle: 'button_finalizar', to_node_id: 'input_endereco' },
                    { from_node_id: 'btn_carrinho_acao', from_handle: 'limpar', to_node_id: 'msg_carrinho_limpo' },
                    { from_node_id: 'btn_carrinho_acao', from_handle: 'button_limpar', to_node_id: 'msg_carrinho_limpo' },
                    { from_node_id: 'msg_horario', from_handle: 'default', to_node_id: 'btn_menu' },
                    { from_node_id: 'msg_carrinho_limpo', from_handle: 'default', to_node_id: 'btn_menu' },
                    { from_node_id: 'input_endereco', from_handle: 'default', to_node_id: 'btn_pagamento' },
                    { from_node_id: 'btn_pagamento', from_handle: 'pix', to_node_id: 'msg_confirmacao' },
                    { from_node_id: 'btn_pagamento', from_handle: 'button_pix', to_node_id: 'msg_confirmacao' },
                    { from_node_id: 'btn_pagamento', from_handle: 'cartao', to_node_id: 'msg_confirmacao' },
                    { from_node_id: 'btn_pagamento', from_handle: 'button_cartao', to_node_id: 'msg_confirmacao' },
                    { from_node_id: 'btn_pagamento', from_handle: 'dinheiro', to_node_id: 'msg_confirmacao' },
                    { from_node_id: 'btn_pagamento', from_handle: 'button_dinheiro', to_node_id: 'msg_confirmacao' },
                    { from_node_id: 'msg_confirmacao', from_handle: 'default', to_node_id: 'end_1' }
                ]
            }
        },
        {
            id: 'tpl_delivery_simples',
            name: 'Delivery Simples',
            description: 'Fluxo básico para delivery: cardápio → endereço → pagamento',
            category: 'delivery',
            is_featured: true,
            is_active: true,
            usage_count: 0,
            flow_data: {
                config: { name: 'Delivery Simples', welcome_message: 'Olá! Faça seu pedido!', fallback_message: 'Escolha uma opção:' },
                nodes: [
                    { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
                    { node_id: 'msg_intro', name: 'Introdução', node_type: 'message', content: { message: '🍔 Olá! Seja bem-vindo!\n\nVeja nosso cardápio e faça seu pedido!' }, position_x: 250, position_y: 150 },
                    { node_id: 'collect_pedido', name: 'Pedido', node_type: 'collect', content: { variable: 'pedido', message: '📝 O que você vai querer?', validation: 'text' }, position_x: 250, position_y: 280 },
                    { node_id: 'collect_endereco', name: 'Endereço', node_type: 'collect', content: { variable: 'endereco', message: '📍 Qual o endereço de entrega?', validation: 'text' }, position_x: 250, position_y: 410 },
                    { node_id: 'btn_pagamento', name: 'Pagamento', node_type: 'buttons', content: { message: '💳 Forma de pagamento?', buttons: [{ id: 'pix', text: 'PIX', value: 'PIX' }, { id: 'cartao', text: 'Cartão', value: 'Cartão' }, { id: 'dinheiro', text: 'Dinheiro', value: 'Dinheiro' }] }, position_x: 250, position_y: 540 },
                    { node_id: 'msg_confirm', name: 'Confirmação', node_type: 'message', content: { message: '✅ Pedido recebido!\n\n🛒 {{pedido}}\n📍 {{endereco}}\n💳 {{pagamento}}\n\nObrigado!' }, position_x: 250, position_y: 670 },
                    { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 800 }
                ],
                connections: [
                    { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_intro' },
                    { from_node_id: 'msg_intro', from_handle: 'default', to_node_id: 'collect_pedido' },
                    { from_node_id: 'collect_pedido', from_handle: 'default', to_node_id: 'collect_endereco' },
                    { from_node_id: 'collect_endereco', from_handle: 'default', to_node_id: 'btn_pagamento' },
                    { from_node_id: 'btn_pagamento', from_handle: 'pix', to_node_id: 'msg_confirm' },
                    { from_node_id: 'btn_pagamento', from_handle: 'cartao', to_node_id: 'msg_confirm' },
                    { from_node_id: 'btn_pagamento', from_handle: 'dinheiro', to_node_id: 'msg_confirm' },
                    { from_node_id: 'msg_confirm', from_handle: 'default', to_node_id: 'end_1' }
                ]
            }
        },
        {
            id: 'tpl_clinica',
            name: 'Clínica Médica',
            description: 'Agendamento de consultas médicas com seleção de especialidade e horários',
            category: 'saude',
            is_featured: true,
            is_active: true,
            usage_count: 0,
            flow_data: {
                config: { name: 'Clínica Médica', welcome_message: 'Olá! Bem-vindo à clínica.', fallback_message: 'Por favor, escolha uma opção.' },
                nodes: [
                    { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
                    { node_id: 'msg_intro', name: 'Boas-vindas', node_type: 'message', content: { message: '🏥 Olá! Bem-vindo(a) à nossa clínica.\n\nComo posso ajudar?' }, position_x: 250, position_y: 150 },
                    { node_id: 'btn_opcoes', name: 'Opções', node_type: 'buttons', content: { message: 'O que você precisa?', buttons: [{ id: 'agendar', text: '📅 Agendar Consulta', value: 'agendar' }, { id: 'horarios', text: '⏰ Ver Horários', value: 'horarios' }, { id: 'contato', text: '📞 Falar com Atendente', value: 'contato' }] }, position_x: 250, position_y: 280 },
                    { node_id: 'btn_especialidade', name: 'Especialidade', node_type: 'buttons', content: { message: '👨‍⚕️ Qual especialidade?', buttons: [{ id: 'clinico', text: 'Clínico Geral', value: 'Clínico Geral' }, { id: 'cardio', text: 'Cardiologista', value: 'Cardiologista' }, { id: 'dermato', text: 'Dermatologista', value: 'Dermatologista' }] }, position_x: 50, position_y: 420 },
                    { node_id: 'msg_horarios', name: 'Horários', node_type: 'message', content: { message: '⏰ Nossos horários:\n\n📅 Segunda a Sexta: 8h às 18h\n📅 Sábado: 8h às 12h' }, position_x: 250, position_y: 420 },
                    { node_id: 'msg_contato', name: 'Contato', node_type: 'message', content: { message: '📞 Um atendente entrará em contato em breve!\n\nOu ligue: (11) 1234-5678' }, position_x: 450, position_y: 420 },
                    { node_id: 'collect_nome', name: 'Nome', node_type: 'collect', content: { variable: 'nome', message: '📝 Qual é o seu nome completo?', validation: 'text' }, position_x: 50, position_y: 550 },
                    { node_id: 'collect_telefone', name: 'Telefone', node_type: 'collect', content: { variable: 'telefone', message: '📱 Qual é o seu telefone para contato?', validation: 'phone' }, position_x: 50, position_y: 680 },
                    { node_id: 'msg_confirmacao', name: 'Confirmação', node_type: 'message', content: { message: '✅ Solicitação de agendamento recebida!\n\n👤 {{nome}}\n📱 {{telefone}}\n👨‍⚕️ {{especialidade}}\n\nEntraremos em contato para confirmar o horário.' }, position_x: 50, position_y: 810 },
                    { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 940 }
                ],
                connections: [
                    { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_intro' },
                    { from_node_id: 'msg_intro', from_handle: 'default', to_node_id: 'btn_opcoes' },
                    { from_node_id: 'btn_opcoes', from_handle: 'agendar', to_node_id: 'btn_especialidade' },
                    { from_node_id: 'btn_opcoes', from_handle: 'horarios', to_node_id: 'msg_horarios' },
                    { from_node_id: 'btn_opcoes', from_handle: 'contato', to_node_id: 'msg_contato' },
                    { from_node_id: 'btn_especialidade', from_handle: 'clinico', to_node_id: 'collect_nome' },
                    { from_node_id: 'btn_especialidade', from_handle: 'cardio', to_node_id: 'collect_nome' },
                    { from_node_id: 'btn_especialidade', from_handle: 'dermato', to_node_id: 'collect_nome' },
                    { from_node_id: 'msg_horarios', from_handle: 'default', to_node_id: 'btn_opcoes' },
                    { from_node_id: 'msg_contato', from_handle: 'default', to_node_id: 'end_1' },
                    { from_node_id: 'collect_nome', from_handle: 'default', to_node_id: 'collect_telefone' },
                    { from_node_id: 'collect_telefone', from_handle: 'default', to_node_id: 'msg_confirmacao' },
                    { from_node_id: 'msg_confirmacao', from_handle: 'default', to_node_id: 'end_1' }
                ]
            }
        },
        {
            id: 'tpl_servicos_tecnicos',
            name: 'Serviços Técnicos',
            description: 'Orçamento e agendamento de serviços elétricos, hidráulicos e manutenção',
            category: 'servicos',
            is_featured: true,
            is_active: true,
            usage_count: 0,
            flow_data: {
                config: { name: 'Serviços Técnicos', welcome_message: 'Olá! Precisa de um serviço?', fallback_message: 'Escolha o tipo de serviço:' },
                nodes: [
                    { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
                    { node_id: 'msg_intro', name: 'Boas-vindas', node_type: 'message', content: { message: '🔧 Olá! Somos especialistas em serviços técnicos.\n\nComo posso ajudar?' }, position_x: 250, position_y: 150 },
                    { node_id: 'btn_servico', name: 'Tipo de Serviço', node_type: 'buttons', content: { message: 'Qual tipo de serviço você precisa?', buttons: [{ id: 'eletrica', text: '⚡ Elétrica', value: 'Elétrica' }, { id: 'hidraulica', text: '🔧 Hidráulica', value: 'Hidráulica' }, { id: 'manutencao', text: '🏠 Manutenção Geral', value: 'Manutenção' }, { id: 'orcamento', text: '💰 Solicitar Orçamento', value: 'Orçamento' }] }, position_x: 250, position_y: 280 },
                    { node_id: 'collect_problema', name: 'Problema', node_type: 'collect', content: { variable: 'problema', message: '📝 Descreva o problema ou serviço que precisa:', validation: 'text' }, position_x: 250, position_y: 420 },
                    { node_id: 'collect_endereco', name: 'Endereço', node_type: 'collect', content: { variable: 'endereco', message: '📍 Qual é o endereço do serviço?', validation: 'text' }, position_x: 250, position_y: 550 },
                    { node_id: 'collect_telefone', name: 'Telefone', node_type: 'collect', content: { variable: 'telefone', message: '📱 Seu telefone para contato:', validation: 'phone' }, position_x: 250, position_y: 680 },
                    { node_id: 'msg_confirmacao', name: 'Confirmação', node_type: 'message', content: { message: '✅ Solicitação registrada!\n\n🔧 Serviço: {{servico}}\n📝 {{problema}}\n📍 {{endereco}}\n📱 {{telefone}}\n\nEntraremos em contato em até 2 horas!' }, position_x: 250, position_y: 810 },
                    { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 940 }
                ],
                connections: [
                    { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_intro' },
                    { from_node_id: 'msg_intro', from_handle: 'default', to_node_id: 'btn_servico' },
                    { from_node_id: 'btn_servico', from_handle: 'eletrica', to_node_id: 'collect_problema' },
                    { from_node_id: 'btn_servico', from_handle: 'hidraulica', to_node_id: 'collect_problema' },
                    { from_node_id: 'btn_servico', from_handle: 'manutencao', to_node_id: 'collect_problema' },
                    { from_node_id: 'btn_servico', from_handle: 'orcamento', to_node_id: 'collect_problema' },
                    { from_node_id: 'collect_problema', from_handle: 'default', to_node_id: 'collect_endereco' },
                    { from_node_id: 'collect_endereco', from_handle: 'default', to_node_id: 'collect_telefone' },
                    { from_node_id: 'collect_telefone', from_handle: 'default', to_node_id: 'msg_confirmacao' },
                    { from_node_id: 'msg_confirmacao', from_handle: 'default', to_node_id: 'end_1' }
                ]
            }
        },
        {
            id: 'tpl_faq',
            name: 'FAQ Interativo',
            description: 'Perguntas frequentes com menu',
            category: 'faq',
            is_featured: false,
            is_active: true,
            usage_count: 0,
            flow_data: {
                config: { name: 'FAQ', welcome_message: 'Olá! Veja nossas perguntas frequentes.', fallback_message: 'Escolha uma pergunta:' },
                nodes: [
                    { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
                    { node_id: 'msg_intro', name: 'Introdução', node_type: 'message', content: { message: '❓ Olá! Veja as perguntas mais frequentes:' }, position_x: 250, position_y: 150 },
                    { node_id: 'btn_perguntas', name: 'Perguntas', node_type: 'buttons', content: { message: 'Sobre o que você quer saber?', buttons: [{ id: 'preco', text: '💰 Preços', value: 'precos' }, { id: 'entrega', text: '🚚 Entrega', value: 'entrega' }, { id: 'pagamento', text: '💳 Pagamento', value: 'pagamento' }, { id: 'outro', text: '❓ Outra dúvida', value: 'outro' }] }, position_x: 250, position_y: 280 },
                    { node_id: 'msg_precos', name: 'Preços', node_type: 'message', content: { message: '💰 *PREÇOS*\n\nNossos preços variam conforme o produto.\nAcesse nosso catálogo ou pergunte sobre um item específico!' }, position_x: 50, position_y: 420 },
                    { node_id: 'msg_entrega', name: 'Entrega', node_type: 'message', content: { message: '🚚 *ENTREGA*\n\nEntregamos em toda a cidade!\n⏱️ Prazo: 1-3 dias úteis\n💰 Frete grátis acima de R$100' }, position_x: 200, position_y: 420 },
                    { node_id: 'msg_pagamento', name: 'Pagamento', node_type: 'message', content: { message: '💳 *FORMAS DE PAGAMENTO*\n\n✅ PIX (5% desconto)\n✅ Cartão de crédito\n✅ Boleto bancário\n✅ Dinheiro na entrega' }, position_x: 350, position_y: 420 },
                    { node_id: 'msg_outro', name: 'Outro', node_type: 'message', content: { message: '📝 Digite sua dúvida que um atendente responderá em breve!' }, position_x: 500, position_y: 420 },
                    { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 550 }
                ],
                connections: [
                    { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_intro' },
                    { from_node_id: 'msg_intro', from_handle: 'default', to_node_id: 'btn_perguntas' },
                    { from_node_id: 'btn_perguntas', from_handle: 'preco', to_node_id: 'msg_precos' },
                    { from_node_id: 'btn_perguntas', from_handle: 'entrega', to_node_id: 'msg_entrega' },
                    { from_node_id: 'btn_perguntas', from_handle: 'pagamento', to_node_id: 'msg_pagamento' },
                    { from_node_id: 'btn_perguntas', from_handle: 'outro', to_node_id: 'msg_outro' },
                    { from_node_id: 'msg_precos', from_handle: 'default', to_node_id: 'btn_perguntas' },
                    { from_node_id: 'msg_entrega', from_handle: 'default', to_node_id: 'btn_perguntas' },
                    { from_node_id: 'msg_pagamento', from_handle: 'default', to_node_id: 'btn_perguntas' },
                    { from_node_id: 'msg_outro', from_handle: 'default', to_node_id: 'end_1' }
                ]
            }
        },
        {
            id: 'tpl_enquete',
            name: 'Enquete de Satisfação',
            description: 'Coletar feedback: sim/não → nota → comentário',
            category: 'pesquisa',
            is_featured: false,
            is_active: true,
            usage_count: 0,
            flow_data: {
                config: { name: 'Enquete de Satisfação', welcome_message: 'Olá! Queremos saber sua opinião.', fallback_message: 'Por favor, responda a pergunta.' },
                nodes: [
                    { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
                    { node_id: 'msg_intro', name: 'Introdução', node_type: 'message', content: { message: '📊 Olá! Gostaríamos de saber sua opinião sobre nosso atendimento.\n\nLeva menos de 1 minuto!' }, position_x: 250, position_y: 150 },
                    { node_id: 'btn_satisfeito', name: 'Satisfeito?', node_type: 'buttons', content: { message: 'Você está satisfeito com nosso serviço?', buttons: [{ id: 'sim', text: '✅ Sim', value: 'Sim' }, { id: 'nao', text: '❌ Não', value: 'Não' }] }, position_x: 250, position_y: 280 },
                    { node_id: 'btn_nota', name: 'Nota', node_type: 'buttons', content: { message: 'De 1 a 5, qual nota você daria?', buttons: [{ id: 'n1', text: '1 ⭐', value: '1' }, { id: 'n2', text: '2 ⭐⭐', value: '2' }, { id: 'n3', text: '3 ⭐⭐⭐', value: '3' }, { id: 'n4', text: '4 ⭐⭐⭐⭐', value: '4' }, { id: 'n5', text: '5 ⭐⭐⭐⭐⭐', value: '5' }] }, position_x: 250, position_y: 420 },
                    { node_id: 'collect_comentario', name: 'Comentário', node_type: 'collect', content: { variable: 'comentario', message: '💬 Deixe um comentário (opcional):\n\n(Digite "pular" para finalizar)', validation: 'text' }, position_x: 250, position_y: 560 },
                    { node_id: 'msg_agradecimento', name: 'Agradecimento', node_type: 'message', content: { message: '🙏 Muito obrigado pelo seu feedback!\n\n✅ Satisfeito: {{satisfeito}}\n⭐ Nota: {{nota}}\n💬 Comentário: {{comentario}}\n\nSua opinião é muito importante para nós!' }, position_x: 250, position_y: 700 },
                    { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 830 }
                ],
                connections: [
                    { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_intro' },
                    { from_node_id: 'msg_intro', from_handle: 'default', to_node_id: 'btn_satisfeito' },
                    { from_node_id: 'btn_satisfeito', from_handle: 'sim', to_node_id: 'btn_nota', label: 'Sim' },
                    { from_node_id: 'btn_satisfeito', from_handle: 'nao', to_node_id: 'btn_nota', label: 'Não' },
                    { from_node_id: 'btn_nota', from_handle: 'n1', to_node_id: 'collect_comentario' },
                    { from_node_id: 'btn_nota', from_handle: 'n2', to_node_id: 'collect_comentario' },
                    { from_node_id: 'btn_nota', from_handle: 'n3', to_node_id: 'collect_comentario' },
                    { from_node_id: 'btn_nota', from_handle: 'n4', to_node_id: 'collect_comentario' },
                    { from_node_id: 'btn_nota', from_handle: 'n5', to_node_id: 'collect_comentario' },
                    { from_node_id: 'collect_comentario', from_handle: 'default', to_node_id: 'msg_agradecimento' },
                    { from_node_id: 'msg_agradecimento', from_handle: 'default', to_node_id: 'end_1' }
                ]
            }
        }
    ];
    // Listar templates disponíveis (com fallback para hard-coded)
    app.get("/api/chatbot/templates", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var _a, category_1, featured, query_1, templates, result, dbError_1, filtered, error_14;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 5, , 6]);
                    _a = req.query, category_1 = _a.category, featured = _a.featured;
                    query_1 = (0, drizzle_orm_1.sql)(templateObject_39 || (templateObject_39 = __makeTemplateObject(["\n        SELECT * FROM chatbot_templates WHERE is_active = true\n      "], ["\n        SELECT * FROM chatbot_templates WHERE is_active = true\n      "])));
                    if (category_1) {
                        query_1 = (0, drizzle_orm_1.sql)(templateObject_40 || (templateObject_40 = __makeTemplateObject(["\n          SELECT * FROM chatbot_templates \n          WHERE is_active = true AND category = ", "\n        "], ["\n          SELECT * FROM chatbot_templates \n          WHERE is_active = true AND category = ", "\n        "])), category_1);
                    }
                    if (featured === 'true') {
                        query_1 = (0, drizzle_orm_1.sql)(templateObject_41 || (templateObject_41 = __makeTemplateObject(["\n          SELECT * FROM chatbot_templates \n          WHERE is_active = true AND is_featured = true\n        "], ["\n          SELECT * FROM chatbot_templates \n          WHERE is_active = true AND is_featured = true\n        "])));
                    }
                    templates = [];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_42 || (templateObject_42 = __makeTemplateObject(["", " ORDER BY is_featured DESC, usage_count DESC"], ["", " ORDER BY is_featured DESC, usage_count DESC"])), query_1))];
                            });
                        }); })];
                case 2:
                    result = _b.sent();
                    templates = result.rows;
                    return [3 /*break*/, 4];
                case 3:
                    dbError_1 = _b.sent();
                    console.log('[CHATBOT_FLOW] Tabela chatbot_templates não existe, usando hard-coded');
                    return [3 /*break*/, 4];
                case 4:
                    // Se não tem templates no banco, usar hard-coded
                    if (templates.length === 0) {
                        console.log('[CHATBOT_FLOW] Usando templates hard-coded');
                        filtered = HARDCODED_TEMPLATES;
                        if (category_1) {
                            filtered = filtered.filter(function (t) { return t.category === category_1; });
                        }
                        if (featured === 'true') {
                            filtered = filtered.filter(function (t) { return t.is_featured; });
                        }
                        return [2 /*return*/, res.json(filtered)];
                    }
                    res.json(templates);
                    return [3 /*break*/, 6];
                case 5:
                    error_14 = _b.sent();
                    console.error('[CHATBOT_FLOW] Erro ao listar templates:', error_14);
                    // Em caso de erro, retornar templates hard-coded
                    res.json(HARDCODED_TEMPLATES);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    }); });
    // Aplicar template ao fluxo
    app.post("/api/chatbot/templates/:templateId/apply", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_14, templateId_1, template_1, templateResult, dbError_2, flowData_1, e_1, fakeReq, fakeRes, configResult, chatbotId_7, newConfig, _loop_6, _i, _a, node, _loop_7, _b, _c, conn, error_15;
        var _this = this;
        var _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    _g.trys.push([0, 24, , 25]);
                    userId_14 = (_d = req.user) === null || _d === void 0 ? void 0 : _d.id;
                    if (!userId_14) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    templateId_1 = req.params.templateId;
                    console.log("[CHATBOT_FLOW] Aplicando template ".concat(templateId_1, " para usu\u00E1rio ").concat(userId_14));
                    template_1 = null;
                    _g.label = 1;
                case 1:
                    _g.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_43 || (templateObject_43 = __makeTemplateObject(["\n            SELECT * FROM chatbot_templates WHERE id = ", " AND is_active = true\n          "], ["\n            SELECT * FROM chatbot_templates WHERE id = ", " AND is_active = true\n          "])), templateId_1))];
                            });
                        }); })];
                case 2:
                    templateResult = _g.sent();
                    if (templateResult.rows.length > 0) {
                        template_1 = templateResult.rows[0];
                    }
                    return [3 /*break*/, 4];
                case 3:
                    dbError_2 = _g.sent();
                    console.log('[CHATBOT_FLOW] Erro ao buscar template no banco, tentando hard-coded');
                    return [3 /*break*/, 4];
                case 4:
                    // Se não encontrou no banco, buscar nos hard-coded
                    if (!template_1) {
                        template_1 = HARDCODED_TEMPLATES.find(function (t) { return t.id === templateId_1; });
                        console.log("[CHATBOT_FLOW] Usando template hard-coded: ".concat(template_1 === null || template_1 === void 0 ? void 0 : template_1.name));
                    }
                    if (!template_1) {
                        return [2 /*return*/, res.status(404).json({ error: "Template não encontrado" })];
                    }
                    flowData_1 = template_1.flow_data;
                    _g.label = 5;
                case 5:
                    _g.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_44 || (templateObject_44 = __makeTemplateObject(["\n            UPDATE chatbot_templates SET usage_count = usage_count + 1 WHERE id = ", "\n          "], ["\n            UPDATE chatbot_templates SET usage_count = usage_count + 1 WHERE id = ", "\n          "])), templateId_1))];
                            });
                        }); })];
                case 6:
                    _g.sent();
                    return [3 /*break*/, 8];
                case 7:
                    e_1 = _g.sent();
                    return [3 /*break*/, 8];
                case 8:
                    fakeReq = {
                        user: { id: userId_14 },
                        body: {
                            nodes: flowData_1.nodes,
                            connections: flowData_1.connections,
                            config: flowData_1.config
                        }
                    };
                    fakeRes = {
                        json: function (data) { return res.json(__assign(__assign({ success: true }, data), { templateName: template_1.name })); },
                        status: function (code) { return ({ json: function (data) { return res.status(code).json(data); } }); }
                    };
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_45 || (templateObject_45 = __makeTemplateObject(["\n          SELECT id FROM chatbot_configs WHERE user_id = ", "\n        "], ["\n          SELECT id FROM chatbot_configs WHERE user_id = ", "\n        "])), userId_14))];
                            });
                        }); })];
                case 9:
                    configResult = _g.sent();
                    if (!(configResult.rows.length === 0)) return [3 /*break*/, 11];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            var _a, _b, _c;
                            return __generator(this, function (_d) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_46 || (templateObject_46 = __makeTemplateObject(["\n            INSERT INTO chatbot_configs (user_id, name, welcome_message, fallback_message)\n            VALUES (\n              ", ", \n              ", ",\n              ", ",\n              ", "\n            )\n            RETURNING id\n          "], ["\n            INSERT INTO chatbot_configs (user_id, name, welcome_message, fallback_message)\n            VALUES (\n              ", ", \n              ", ",\n              ", ",\n              ", "\n            )\n            RETURNING id\n          "])), userId_14, ((_a = flowData_1.config) === null || _a === void 0 ? void 0 : _a.name) || template_1.name, ((_b = flowData_1.config) === null || _b === void 0 ? void 0 : _b.welcome_message) || 'Olá! 👋', ((_c = flowData_1.config) === null || _c === void 0 ? void 0 : _c.fallback_message) || 'Não entendi. Escolha uma opção:'))];
                            });
                        }); })];
                case 10:
                    newConfig = _g.sent();
                    chatbotId_7 = newConfig.rows[0].id;
                    return [3 /*break*/, 13];
                case 11:
                    chatbotId_7 = configResult.rows[0].id;
                    // Atualizar config
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            var _a, _b, _c;
                            return __generator(this, function (_d) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_47 || (templateObject_47 = __makeTemplateObject(["\n            UPDATE chatbot_configs SET\n              name = ", ",\n              welcome_message = ", ",\n              fallback_message = ", ",\n              updated_at = now()\n            WHERE id = ", "\n          "], ["\n            UPDATE chatbot_configs SET\n              name = ", ",\n              welcome_message = ", ",\n              fallback_message = ", ",\n              updated_at = now()\n            WHERE id = ", "\n          "])), ((_a = flowData_1.config) === null || _a === void 0 ? void 0 : _a.name) || template_1.name, ((_b = flowData_1.config) === null || _b === void 0 ? void 0 : _b.welcome_message) || 'Olá! 👋', ((_c = flowData_1.config) === null || _c === void 0 ? void 0 : _c.fallback_message) || 'Não entendi. Escolha uma opção:', chatbotId_7))];
                            });
                        }); })];
                case 12:
                    // Atualizar config
                    _g.sent();
                    _g.label = 13;
                case 13: 
                // Limpar nós e conexões existentes
                return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_48 || (templateObject_48 = __makeTemplateObject(["DELETE FROM chatbot_flow_connections WHERE chatbot_id = ", ""], ["DELETE FROM chatbot_flow_connections WHERE chatbot_id = ", ""])), chatbotId_7))];
                        });
                    }); })];
                case 14:
                    // Limpar nós e conexões existentes
                    _g.sent();
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_49 || (templateObject_49 = __makeTemplateObject(["DELETE FROM chatbot_flow_nodes WHERE chatbot_id = ", ""], ["DELETE FROM chatbot_flow_nodes WHERE chatbot_id = ", ""])), chatbotId_7))];
                            });
                        }); })];
                case 15:
                    _g.sent();
                    if (!Array.isArray(flowData_1.nodes)) return [3 /*break*/, 19];
                    _loop_6 = function (node) {
                        return __generator(this, function (_h) {
                            switch (_h.label) {
                                case 0: return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                                        return __generator(this, function (_a) {
                                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_50 || (templateObject_50 = __makeTemplateObject(["\n              INSERT INTO chatbot_flow_nodes (\n                chatbot_id, node_id, name, node_type, content,\n                position_x, position_y\n              ) VALUES (\n                ", ", ", ", ", ", ", ",\n                ", ",\n                ", ", ", "\n              )\n            "], ["\n              INSERT INTO chatbot_flow_nodes (\n                chatbot_id, node_id, name, node_type, content,\n                position_x, position_y\n              ) VALUES (\n                ", ", ", ", ", ", ", ",\n                ", ",\n                ", ", ", "\n              )\n            "])), chatbotId_7, node.node_id, node.name, node.node_type, JSON.stringify(node.content || {}), node.position_x || 0, node.position_y || 0))];
                                        });
                                    }); })];
                                case 1:
                                    _h.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, _a = flowData_1.nodes;
                    _g.label = 16;
                case 16:
                    if (!(_i < _a.length)) return [3 /*break*/, 19];
                    node = _a[_i];
                    return [5 /*yield**/, _loop_6(node)];
                case 17:
                    _g.sent();
                    _g.label = 18;
                case 18:
                    _i++;
                    return [3 /*break*/, 16];
                case 19:
                    if (!Array.isArray(flowData_1.connections)) return [3 /*break*/, 23];
                    _loop_7 = function (conn) {
                        return __generator(this, function (_j) {
                            switch (_j.label) {
                                case 0: return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                                        return __generator(this, function (_a) {
                                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_51 || (templateObject_51 = __makeTemplateObject(["\n              INSERT INTO chatbot_flow_connections (\n                chatbot_id, from_node_id, from_handle, to_node_id\n              ) VALUES (\n                ", ", ", ", ", ", ", "\n              )\n            "], ["\n              INSERT INTO chatbot_flow_connections (\n                chatbot_id, from_node_id, from_handle, to_node_id\n              ) VALUES (\n                ", ", ", ", ", ", ", "\n              )\n            "])), chatbotId_7, conn.from_node_id, conn.from_handle || 'default', conn.to_node_id))];
                                        });
                                    }); })];
                                case 1:
                                    _j.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _b = 0, _c = flowData_1.connections;
                    _g.label = 20;
                case 20:
                    if (!(_b < _c.length)) return [3 /*break*/, 23];
                    conn = _c[_b];
                    return [5 /*yield**/, _loop_7(conn)];
                case 21:
                    _g.sent();
                    _g.label = 22;
                case 22:
                    _b++;
                    return [3 /*break*/, 20];
                case 23:
                    res.json({
                        success: true,
                        templateName: template_1.name,
                        chatbotId: chatbotId_7,
                        nodesCount: ((_e = flowData_1.nodes) === null || _e === void 0 ? void 0 : _e.length) || 0,
                        connectionsCount: ((_f = flowData_1.connections) === null || _f === void 0 ? void 0 : _f.length) || 0
                    });
                    return [3 /*break*/, 25];
                case 24:
                    error_15 = _g.sent();
                    console.error('[CHATBOT_FLOW] Erro ao aplicar template:', error_15);
                    res.status(500).json({ error: "Erro ao aplicar template" });
                    return [3 /*break*/, 25];
                case 25: return [2 /*return*/];
            }
        });
    }); });
    // ============================================================
    // ATIVAR/DESATIVAR CHATBOT
    // ============================================================
    app.post("/api/chatbot/toggle", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_15, is_active_2, result, clearFlowCache, error_16;
        var _this = this;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 6, , 7]);
                    userId_15 = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    if (!userId_15) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    is_active_2 = req.body.is_active;
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_52 || (templateObject_52 = __makeTemplateObject(["\n          UPDATE chatbot_configs SET\n            is_active = ", ",\n            updated_at = now()\n          WHERE user_id = ", "\n          RETURNING *\n        "], ["\n          UPDATE chatbot_configs SET\n            is_active = ", ",\n            updated_at = now()\n          WHERE user_id = ", "\n          RETURNING *\n        "])), is_active_2 !== null && is_active_2 !== void 0 ? is_active_2 : true, userId_15))];
                            });
                        }); })];
                case 1:
                    result = _b.sent();
                    if (result.rows.length === 0) {
                        return [2 /*return*/, res.status(404).json({ error: "Chatbot não configurado" })];
                    }
                    if (!is_active_2) return [3 /*break*/, 4];
                    console.log("\uD83D\uDD04 [CHATBOT_FLOW] Desativando Meu Agente IA para usu\u00E1rio ".concat(userId_15, " (ativou Fluxo)"));
                    // Desativar ai_agent_config (tabela antiga, ainda usada em algumas partes)
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_53 || (templateObject_53 = __makeTemplateObject(["\n            UPDATE ai_agent_config SET\n              is_active = false,\n              updated_at = now()\n            WHERE user_id = ", "\n          "], ["\n            UPDATE ai_agent_config SET\n              is_active = false,\n              updated_at = now()\n            WHERE user_id = ", "\n          "])), userId_15))];
                            });
                        }); })];
                case 2:
                    // Desativar ai_agent_config (tabela antiga, ainda usada em algumas partes)
                    _b.sent();
                    // Desativar business_agent_configs (tabela principal usada pelo backend)
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_54 || (templateObject_54 = __makeTemplateObject(["\n            UPDATE business_agent_configs SET\n              is_active = false,\n              updated_at = now()\n            WHERE user_id = ", "\n          "], ["\n            UPDATE business_agent_configs SET\n              is_active = false,\n              updated_at = now()\n            WHERE user_id = ", "\n          "])), userId_15))];
                            });
                        }); })];
                case 3:
                    // Desativar business_agent_configs (tabela principal usada pelo backend)
                    _b.sent();
                    console.log("\u2705 [CHATBOT_FLOW] Meu Agente IA desativado em AMBAS as tabelas");
                    _b.label = 4;
                case 4: return [4 /*yield*/, Promise.resolve().then(function () { return require("./chatbotFlowEngine"); })];
                case 5:
                    clearFlowCache = (_b.sent()).clearFlowCache;
                    clearFlowCache(userId_15);
                    console.log("\uD83D\uDD04 [CHATBOT_FLOW] Cache limpo para usu\u00E1rio ".concat(userId_15, " ap\u00F3s toggle (is_active=").concat(is_active_2, ")"));
                    res.json(result.rows[0]);
                    return [3 /*break*/, 7];
                case 6:
                    error_16 = _b.sent();
                    console.error('[CHATBOT_FLOW] Erro ao toggle chatbot:', error_16);
                    res.status(500).json({ error: "Erro ao alterar status do chatbot" });
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/];
            }
        });
    }); });
    // ============================================================
    // ESTATÍSTICAS E DADOS DE CONVERSAS
    // ============================================================
    // Buscar dados de uma conversa específica do chatbot
    app.get("/api/chatbot/conversation/:conversationId", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_16, conversationId_1, result, error_17;
        var _this = this;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId_16 = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    if (!userId_16) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    conversationId_1 = req.params.conversationId;
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_55 || (templateObject_55 = __makeTemplateObject(["\n          SELECT cd.* FROM chatbot_conversation_data cd\n          JOIN chatbot_configs c ON cd.chatbot_id = c.id\n          WHERE c.user_id = ", " AND cd.conversation_id = ", "\n        "], ["\n          SELECT cd.* FROM chatbot_conversation_data cd\n          JOIN chatbot_configs c ON cd.chatbot_id = c.id\n          WHERE c.user_id = ", " AND cd.conversation_id = ", "\n        "])), userId_16, conversationId_1))];
                            });
                        }); })];
                case 1:
                    result = _b.sent();
                    if (result.rows.length === 0) {
                        return [2 /*return*/, res.json(null)];
                    }
                    res.json(result.rows[0]);
                    return [3 /*break*/, 3];
                case 2:
                    error_17 = _b.sent();
                    console.error('[CHATBOT_FLOW] Erro ao buscar dados da conversa:', error_17);
                    res.status(500).json({ error: "Erro ao buscar dados da conversa" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // Listar todas as conversas do chatbot
    app.get("/api/chatbot/conversations", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_17, _a, status_1, _b, limit_1, _c, offset_1, statusFilter_1, result, error_18;
        var _this = this;
        var _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _e.trys.push([0, 2, , 3]);
                    userId_17 = (_d = req.user) === null || _d === void 0 ? void 0 : _d.id;
                    if (!userId_17) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    _a = req.query, status_1 = _a.status, _b = _a.limit, limit_1 = _b === void 0 ? 50 : _b, _c = _a.offset, offset_1 = _c === void 0 ? 0 : _c;
                    statusFilter_1 = (0, drizzle_orm_1.sql)(templateObject_56 || (templateObject_56 = __makeTemplateObject([""], [""])));
                    if (status_1) {
                        statusFilter_1 = (0, drizzle_orm_1.sql)(templateObject_57 || (templateObject_57 = __makeTemplateObject([" AND cd.status = ", ""], [" AND cd.status = ", ""])), status_1);
                    }
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_58 || (templateObject_58 = __makeTemplateObject(["\n          SELECT cd.* FROM chatbot_conversation_data cd\n          JOIN chatbot_configs c ON cd.chatbot_id = c.id\n          WHERE c.user_id = ", "", "\n          ORDER BY cd.last_interaction_at DESC\n          LIMIT ", "\n          OFFSET ", "\n        "], ["\n          SELECT cd.* FROM chatbot_conversation_data cd\n          JOIN chatbot_configs c ON cd.chatbot_id = c.id\n          WHERE c.user_id = ", "", "\n          ORDER BY cd.last_interaction_at DESC\n          LIMIT ", "\n          OFFSET ", "\n        "])), userId_17, statusFilter_1, parseInt(limit_1), parseInt(offset_1)))];
                            });
                        }); })];
                case 1:
                    result = _e.sent();
                    res.json(result.rows);
                    return [3 /*break*/, 3];
                case 2:
                    error_18 = _e.sent();
                    console.error('[CHATBOT_FLOW] Erro ao listar conversas:', error_18);
                    res.status(500).json({ error: "Erro ao listar conversas do chatbot" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // Estatísticas do chatbot
    app.get("/api/chatbot/stats", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_18, result, error_19;
        var _this = this;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId_18 = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    if (!userId_18) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_59 || (templateObject_59 = __makeTemplateObject(["\n          SELECT \n            c.*,\n            (SELECT COUNT(*) FROM chatbot_flow_nodes n WHERE n.chatbot_id = c.id) as nodes_count,\n            (SELECT COUNT(*) FROM chatbot_flow_connections conn WHERE conn.chatbot_id = c.id) as connections_count,\n            (SELECT COUNT(*) FROM chatbot_conversation_data cd WHERE cd.chatbot_id = c.id AND cd.status = 'active') as active_conversations,\n            (SELECT COUNT(*) FROM chatbot_conversation_data cd WHERE cd.chatbot_id = c.id AND cd.status = 'completed') as completed_conversations\n          FROM chatbot_configs c\n          WHERE c.user_id = ", "\n        "], ["\n          SELECT \n            c.*,\n            (SELECT COUNT(*) FROM chatbot_flow_nodes n WHERE n.chatbot_id = c.id) as nodes_count,\n            (SELECT COUNT(*) FROM chatbot_flow_connections conn WHERE conn.chatbot_id = c.id) as connections_count,\n            (SELECT COUNT(*) FROM chatbot_conversation_data cd WHERE cd.chatbot_id = c.id AND cd.status = 'active') as active_conversations,\n            (SELECT COUNT(*) FROM chatbot_conversation_data cd WHERE cd.chatbot_id = c.id AND cd.status = 'completed') as completed_conversations\n          FROM chatbot_configs c\n          WHERE c.user_id = ", "\n        "])), userId_18))];
                            });
                        }); })];
                case 1:
                    result = _b.sent();
                    if (result.rows.length === 0) {
                        return [2 /*return*/, res.json({
                                config: null,
                                nodes_count: 0,
                                connections_count: 0,
                                active_conversations: 0,
                                completed_conversations: 0
                            })];
                    }
                    res.json(result.rows[0]);
                    return [3 /*break*/, 3];
                case 2:
                    error_19 = _b.sent();
                    console.error('[CHATBOT_FLOW] Erro ao buscar estatísticas:', error_19);
                    res.status(500).json({ error: "Erro ao buscar estatísticas" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ============================================================
    // UPLOAD DE MÍDIA PARA FLUXO DO CHATBOT
    // ============================================================
    // Upload de mídia (imagem, áudio, vídeo, documento/PDF)
    app.post("/api/chatbot/media/upload", supabaseAuth_1.isAuthenticated, uploadMedia.single('file'), function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, file, mediaType, timestamp, safeFileName, storagePath, _a, uploadData, uploadError, createError, retryError, urlData, publicUrl, error_20;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _e.trys.push([0, 6, , 7]);
                    userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
                    if (!userId) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    file = req.file;
                    if (!file) {
                        return [2 /*return*/, res.status(400).json({ error: "Nenhum arquivo enviado" })];
                    }
                    mediaType = 'document';
                    if (file.mimetype.startsWith('image/'))
                        mediaType = 'image';
                    else if (file.mimetype.startsWith('audio/'))
                        mediaType = 'audio';
                    else if (file.mimetype.startsWith('video/'))
                        mediaType = 'video';
                    timestamp = Date.now();
                    safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
                    storagePath = "chatbot-flow/".concat(userId, "/").concat(timestamp, "_").concat(safeFileName);
                    console.log("\uD83D\uDCE4 [CHATBOT_FLOW] Upload de ".concat(mediaType, ": ").concat(file.originalname, " (").concat((file.size / 1024).toFixed(1), "KB)"));
                    return [4 /*yield*/, supabaseAuth_1.supabase.storage
                            .from('agent-media')
                            .upload(storagePath, file.buffer, {
                            contentType: file.mimetype,
                            upsert: false
                        })];
                case 1:
                    _a = _e.sent(), uploadData = _a.data, uploadError = _a.error;
                    if (!uploadError) return [3 /*break*/, 5];
                    console.error('[CHATBOT_FLOW] Erro no upload:', uploadError);
                    if (!(((_c = uploadError.message) === null || _c === void 0 ? void 0 : _c.includes('Bucket not found')) && !chatbotMediaBucketChecked)) return [3 /*break*/, 4];
                    return [4 /*yield*/, supabaseAuth_1.supabase.storage.createBucket('agent-media', {
                            public: true,
                            fileSizeLimit: 52428800 // 50MB
                        })];
                case 2:
                    createError = (_e.sent()).error;
                    chatbotMediaBucketChecked = true;
                    if (createError && !((_d = createError.message) === null || _d === void 0 ? void 0 : _d.includes('already exists'))) {
                        return [2 /*return*/, res.status(500).json({ error: "Falha ao criar bucket de armazenamento", details: createError.message })];
                    }
                    return [4 /*yield*/, supabaseAuth_1.supabase.storage
                            .from('agent-media')
                            .upload(storagePath, file.buffer, {
                            contentType: file.mimetype,
                            upsert: false
                        })];
                case 3:
                    retryError = (_e.sent()).error;
                    if (retryError) {
                        return [2 /*return*/, res.status(500).json({ error: "Falha no upload do arquivo", details: retryError.message })];
                    }
                    return [3 /*break*/, 5];
                case 4: return [2 /*return*/, res.status(500).json({ error: "Falha no upload do arquivo", details: uploadError.message })];
                case 5:
                    urlData = supabaseAuth_1.supabase.storage
                        .from('agent-media')
                        .getPublicUrl(storagePath).data;
                    publicUrl = urlData.publicUrl;
                    console.log("\u2705 [CHATBOT_FLOW] Upload conclu\u00EDdo: ".concat(publicUrl));
                    res.json({
                        success: true,
                        url: publicUrl,
                        fileName: file.originalname,
                        fileSize: file.size,
                        mimeType: file.mimetype,
                        mediaType: mediaType
                    });
                    return [3 /*break*/, 7];
                case 6:
                    error_20 = _e.sent();
                    console.error('[CHATBOT_FLOW] Erro ao fazer upload:', error_20);
                    res.status(500).json({ error: "Erro ao fazer upload de mídia" });
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/];
            }
        });
    }); });
    // ============================================================
    // GERAÇÃO DE FLUXO COM IA CONVERSACIONAL
    // ============================================================
    // ====== TEMPLATES DE FLUXO POR TIPO DE NEGÓCIO ======
    function extractNameFromMessage(message) {
        // Tentar extrair nome entre aspas
        var quotedMatch = message.match(/["']([^"']+)["']/);
        if (quotedMatch)
            return quotedMatch[1];
        // Tentar extrair nome após "chamada" ou "chamado"
        var namedMatch = message.match(/chamad[ao]\s+([A-Za-zÀ-ú\s]+?)(?:\s+com|\s+que|\s+para|$)/i);
        if (namedMatch)
            return namedMatch[1].trim();
        return '';
    }
    function createPizzariaFlow(message) {
        var businessName = extractNameFromMessage(message) || 'Pizzaria Delícia';
        return {
            message: "Pronto! Criei um fluxo completo para a ".concat(businessName, " com card\u00E1pio, pedidos e promo\u00E7\u00F5es. Voc\u00EA pode personalizar os textos e pre\u00E7os!"),
            flow: {
                nodes: [
                    {
                        node_id: "node_start_1",
                        name: "Início",
                        node_type: "start",
                        content: {},
                        next_node_id: "node_welcome",
                        position_x: 100,
                        position_y: 50,
                        display_order: 0
                    },
                    {
                        node_id: "node_welcome",
                        name: "Boas-vindas",
                        node_type: "message",
                        content: { text: "\uD83C\uDF55 Ol\u00E1! Bem-vindo \u00E0 ".concat(businessName, "!\n\nTemos as melhores pizzas da regi\u00E3o!"), format_whatsapp: true },
                        next_node_id: "node_menu",
                        position_x: 100,
                        position_y: 150,
                        display_order: 1
                    },
                    {
                        node_id: "node_menu",
                        name: "Menu Principal",
                        node_type: "buttons",
                        content: {
                            body: "O que você gostaria de fazer?",
                            buttons: [
                                { id: "btn_cardapio", title: "📋 Ver Cardápio", next_node: "node_cardapio" },
                                { id: "btn_pedido", title: "🛒 Fazer Pedido", next_node: "node_pedido" },
                                { id: "btn_promo", title: "🎉 Promoções", next_node: "node_promocoes" }
                            ]
                        },
                        position_x: 100,
                        position_y: 250,
                        display_order: 2
                    },
                    {
                        node_id: "node_cardapio",
                        name: "Cardápio",
                        node_type: "list",
                        content: {
                            body: "🍕 Nosso Cardápio de Pizzas:",
                            button_text: "Ver Sabores",
                            sections: [
                                {
                                    title: "Pizzas Tradicionais",
                                    rows: [
                                        { id: "pizza_marg", title: "Margherita", description: "R$ 45,00 - Molho, mussarela, tomate, manjericão", next_node: "node_add_cart" },
                                        { id: "pizza_cala", title: "Calabresa", description: "R$ 48,00 - Molho, mussarela, calabresa, cebola", next_node: "node_add_cart" },
                                        { id: "pizza_4q", title: "Quatro Queijos", description: "R$ 52,00 - Mussarela, provolone, gorgonzola, parmesão", next_node: "node_add_cart" }
                                    ]
                                },
                                {
                                    title: "Pizzas Especiais",
                                    rows: [
                                        { id: "pizza_port", title: "Portuguesa", description: "R$ 55,00 - Presunto, ovo, cebola, azeitona, ervilha", next_node: "node_add_cart" },
                                        { id: "pizza_frang", title: "Frango Catupiry", description: "R$ 55,00 - Frango desfiado com catupiry", next_node: "node_add_cart" }
                                    ]
                                }
                            ]
                        },
                        position_x: 0,
                        position_y: 350,
                        display_order: 3
                    },
                    {
                        node_id: "node_pedido",
                        name: "Iniciar Pedido",
                        node_type: "input",
                        content: {
                            prompt: "Para iniciar seu pedido, me diz seu nome:",
                            variable_name: "nome_cliente",
                            input_type: "text",
                            required: true
                        },
                        next_node_id: "node_endereco",
                        position_x: 100,
                        position_y: 350,
                        display_order: 4
                    },
                    {
                        node_id: "node_endereco",
                        name: "Endereço",
                        node_type: "input",
                        content: {
                            prompt: "Ótimo, {{nome_cliente}}! Qual o endereço de entrega?",
                            variable_name: "endereco",
                            input_type: "text",
                            required: true
                        },
                        next_node_id: "node_cardapio",
                        position_x: 100,
                        position_y: 450,
                        display_order: 5
                    },
                    {
                        node_id: "node_promocoes",
                        name: "Promoções",
                        node_type: "message",
                        content: {
                            text: "🎉 *PROMOÇÕES DA SEMANA*\n\n🔥 *Terça-feira*: Pizza Grande + Refri 2L = R$ 59,90\n\n🔥 *Quinta-feira*: 2 Pizzas Médias por R$ 79,90\n\n🔥 *Domingo*: Pizza Família + Bordas Recheadas = R$ 69,90\n\n_Promoções válidas somente para delivery!_",
                            format_whatsapp: true
                        },
                        next_node_id: "node_menu",
                        position_x: 200,
                        position_y: 350,
                        display_order: 6
                    },
                    {
                        node_id: "node_add_cart",
                        name: "Adicionar ao Pedido",
                        node_type: "buttons",
                        content: {
                            body: "Ótima escolha! Deseja adicionar mais alguma coisa?",
                            buttons: [
                                { id: "btn_mais", title: "Sim, ver mais", next_node: "node_cardapio" },
                                { id: "btn_finalizar", title: "Finalizar Pedido", next_node: "node_pagamento" },
                                { id: "btn_atendente", title: "Falar com Atendente", next_node: "node_transfer" }
                            ]
                        },
                        position_x: 0,
                        position_y: 450,
                        display_order: 7
                    },
                    {
                        node_id: "node_pagamento",
                        name: "Forma de Pagamento",
                        node_type: "buttons",
                        content: {
                            body: "Como prefere pagar?",
                            buttons: [
                                { id: "btn_pix", title: "PIX", next_node: "node_confirma" },
                                { id: "btn_cartao", title: "Cartão na Entrega", next_node: "node_confirma" },
                                { id: "btn_dinheiro", title: "Dinheiro", next_node: "node_troco" }
                            ]
                        },
                        position_x: 100,
                        position_y: 550,
                        display_order: 8
                    },
                    {
                        node_id: "node_troco",
                        name: "Troco",
                        node_type: "input",
                        content: {
                            prompt: "Precisa de troco para quanto?",
                            variable_name: "troco",
                            input_type: "text",
                            required: false
                        },
                        next_node_id: "node_confirma",
                        position_x: 200,
                        position_y: 650,
                        display_order: 9
                    },
                    {
                        node_id: "node_confirma",
                        name: "Confirmação",
                        node_type: "message",
                        content: {
                            text: "✅ *Pedido Recebido!*\n\nSeu pedido está sendo preparado com muito carinho!\n\n⏱️ Tempo estimado: 40-50 minutos\n\n_Acompanhe o status pelo nosso WhatsApp!_",
                            format_whatsapp: true
                        },
                        next_node_id: "node_end",
                        position_x: 100,
                        position_y: 750,
                        display_order: 10
                    },
                    {
                        node_id: "node_transfer",
                        name: "Transferir para Atendente",
                        node_type: "transfer_human",
                        content: {
                            message: "Aguarde um momento, vou te transferir para um atendente...",
                            notify_admin: true
                        },
                        position_x: 0,
                        position_y: 550,
                        display_order: 11
                    },
                    {
                        node_id: "node_end",
                        name: "Fim",
                        node_type: "end",
                        content: {},
                        position_x: 100,
                        position_y: 850,
                        display_order: 12
                    }
                ]
            },
            config: {
                name: businessName,
                welcome_message: "\uD83C\uDF55 Ol\u00E1! Bem-vindo \u00E0 ".concat(businessName, "!"),
                fallback_message: "Desculpe, não entendi. Por favor, escolha uma das opções do menu.",
                goodbye_message: "Obrigado por escolher a " + businessName + "! Volte sempre! 🍕"
            }
        };
    }
    function createDeliveryFlow(message) {
        var businessName = extractNameFromMessage(message) || 'Delivery Express';
        return {
            message: "Criei um fluxo para o ".concat(businessName, " com card\u00E1pio, pedidos e acompanhamento de entrega!"),
            flow: {
                nodes: [
                    { node_id: "node_start_1", name: "Início", node_type: "start", content: {}, next_node_id: "node_menu", position_x: 100, position_y: 50, display_order: 0 },
                    { node_id: "node_menu", name: "Menu", node_type: "buttons", content: { body: "Ol\u00E1! Bem-vindo ao ".concat(businessName, "! Como posso ajudar?"), buttons: [{ id: "btn_1", title: "📋 Cardápio", next_node: "node_cardapio" }, { id: "btn_2", title: "🛒 Fazer Pedido", next_node: "node_pedido" }, { id: "btn_3", title: "📞 Atendente", next_node: "node_transfer" }] }, position_x: 100, position_y: 150, display_order: 1 },
                    { node_id: "node_cardapio", name: "Cardápio", node_type: "message", content: { text: "📋 *CARDÁPIO*\n\n🍔 Hambúrgueres\n🍟 Porções\n🥤 Bebidas\n\nEscolha uma categoria para ver os itens!", format_whatsapp: true }, next_node_id: "node_menu", position_x: 0, position_y: 250, display_order: 2 },
                    { node_id: "node_pedido", name: "Pedido", node_type: "input", content: { prompt: "Qual seu nome?", variable_name: "nome", input_type: "text", required: true }, next_node_id: "node_endereco", position_x: 100, position_y: 250, display_order: 3 },
                    { node_id: "node_endereco", name: "Endereço", node_type: "input", content: { prompt: "Qual o endereço de entrega?", variable_name: "endereco", input_type: "text", required: true }, next_node_id: "node_confirma", position_x: 100, position_y: 350, display_order: 4 },
                    { node_id: "node_confirma", name: "Confirmação", node_type: "message", content: { text: "✅ Pedido recebido! Em breve um atendente irá confirmar.", format_whatsapp: true }, next_node_id: "node_end", position_x: 100, position_y: 450, display_order: 5 },
                    { node_id: "node_transfer", name: "Atendente", node_type: "transfer_human", content: { message: "Aguarde, transferindo...", notify_admin: true }, position_x: 200, position_y: 250, display_order: 6 },
                    { node_id: "node_end", name: "Fim", node_type: "end", content: {}, position_x: 100, position_y: 550, display_order: 7 }
                ]
            },
            config: { name: businessName, welcome_message: "Bem-vindo ao ".concat(businessName, "!"), fallback_message: "Não entendi, escolha uma opção.", goodbye_message: "Obrigado!" }
        };
    }
    function createClinicaFlow(message) {
        var businessName = extractNameFromMessage(message) || 'Clínica Saúde';
        return {
            message: "Criei um fluxo para a ".concat(businessName, " com agendamento, informa\u00E7\u00F5es e contato!"),
            flow: {
                nodes: [
                    { node_id: "node_start_1", name: "Início", node_type: "start", content: {}, next_node_id: "node_menu", position_x: 100, position_y: 50, display_order: 0 },
                    { node_id: "node_menu", name: "Menu", node_type: "buttons", content: { body: "\uD83C\uDFE5 ".concat(businessName, "\n\nComo posso ajudar?"), buttons: [{ id: "btn_1", title: "📅 Agendar Consulta", next_node: "node_agendar" }, { id: "btn_2", title: "ℹ️ Informações", next_node: "node_info" }, { id: "btn_3", title: "📞 Falar com Atendente", next_node: "node_transfer" }] }, position_x: 100, position_y: 150, display_order: 1 },
                    { node_id: "node_agendar", name: "Agendar", node_type: "input", content: { prompt: "Qual seu nome completo?", variable_name: "nome", input_type: "text", required: true }, next_node_id: "node_especialidade", position_x: 0, position_y: 250, display_order: 2 },
                    { node_id: "node_especialidade", name: "Especialidade", node_type: "buttons", content: { body: "Qual especialidade você precisa?", buttons: [{ id: "btn_clinico", title: "Clínico Geral", next_node: "node_data" }, { id: "btn_cardio", title: "Cardiologia", next_node: "node_data" }, { id: "btn_outro", title: "Outra", next_node: "node_transfer" }] }, position_x: 0, position_y: 350, display_order: 3 },
                    { node_id: "node_data", name: "Data", node_type: "input", content: { prompt: "Qual data você prefere? (ex: 15/01)", variable_name: "data", input_type: "text", required: true }, next_node_id: "node_confirma", position_x: 0, position_y: 450, display_order: 4 },
                    { node_id: "node_info", name: "Informações", node_type: "message", content: { text: "🏥 *Informações*\n\n📍 Endereço: Rua Exemplo, 123\n⏰ Horário: Seg-Sex 8h às 18h\n📞 Telefone: (00) 0000-0000", format_whatsapp: true }, next_node_id: "node_menu", position_x: 100, position_y: 250, display_order: 5 },
                    { node_id: "node_confirma", name: "Confirmação", node_type: "message", content: { text: "✅ Solicitação de agendamento recebida!\n\nEntraremos em contato para confirmar.", format_whatsapp: true }, next_node_id: "node_end", position_x: 0, position_y: 550, display_order: 6 },
                    { node_id: "node_transfer", name: "Atendente", node_type: "transfer_human", content: { message: "Aguarde, transferindo para atendimento...", notify_admin: true }, position_x: 200, position_y: 250, display_order: 7 },
                    { node_id: "node_end", name: "Fim", node_type: "end", content: {}, position_x: 100, position_y: 650, display_order: 8 }
                ]
            },
            config: { name: businessName, welcome_message: "Bem-vindo \u00E0 ".concat(businessName, "!"), fallback_message: "Não entendi, escolha uma opção do menu.", goodbye_message: "Obrigado por entrar em contato!" }
        };
    }
    function createImobiliariaFlow(message) {
        var businessName = extractNameFromMessage(message) || 'Imobiliária Central';
        return {
            message: "Criei um fluxo para a ".concat(businessName, " com op\u00E7\u00F5es de compra, aluguel e atendimento!"),
            flow: {
                nodes: [
                    { node_id: "node_start_1", name: "Início", node_type: "start", content: {}, next_node_id: "node_menu", position_x: 100, position_y: 50, display_order: 0 },
                    { node_id: "node_menu", name: "Menu", node_type: "buttons", content: { body: "\uD83C\uDFE0 ".concat(businessName, "\n\nComo posso ajudar?"), buttons: [{ id: "btn_1", title: "🏠 Comprar Imóvel", next_node: "node_comprar" }, { id: "btn_2", title: "🔑 Alugar Imóvel", next_node: "node_alugar" }, { id: "btn_3", title: "📞 Falar com Corretor", next_node: "node_transfer" }] }, position_x: 100, position_y: 150, display_order: 1 },
                    { node_id: "node_comprar", name: "Comprar", node_type: "buttons", content: { body: "Que tipo de imóvel você procura para comprar?", buttons: [{ id: "btn_casa", title: "Casa", next_node: "node_valores" }, { id: "btn_apto", title: "Apartamento", next_node: "node_valores" }, { id: "btn_terreno", title: "Terreno", next_node: "node_valores" }] }, position_x: 0, position_y: 250, display_order: 2 },
                    { node_id: "node_alugar", name: "Alugar", node_type: "buttons", content: { body: "Que tipo de imóvel você procura para alugar?", buttons: [{ id: "btn_casa_a", title: "Casa", next_node: "node_valores_aluguel" }, { id: "btn_apto_a", title: "Apartamento", next_node: "node_valores_aluguel" }, { id: "btn_comercial", title: "Comercial", next_node: "node_valores_aluguel" }] }, position_x: 200, position_y: 250, display_order: 3 },
                    { node_id: "node_valores", name: "Faixa de Preço", node_type: "input", content: { prompt: "Qual a faixa de valor que você procura? (ex: até 500 mil)", variable_name: "faixa_preco", input_type: "text", required: true }, next_node_id: "node_contato", position_x: 0, position_y: 350, display_order: 4 },
                    { node_id: "node_valores_aluguel", name: "Valor Aluguel", node_type: "input", content: { prompt: "Qual valor de aluguel você procura? (ex: até 2 mil)", variable_name: "valor_aluguel", input_type: "text", required: true }, next_node_id: "node_contato", position_x: 200, position_y: 350, display_order: 5 },
                    { node_id: "node_contato", name: "Contato", node_type: "input", content: { prompt: "Qual seu nome e telefone para contato?", variable_name: "contato", input_type: "text", required: true }, next_node_id: "node_confirma", position_x: 100, position_y: 450, display_order: 6 },
                    { node_id: "node_confirma", name: "Confirmação", node_type: "message", content: { text: "✅ Perfeito! Um corretor entrará em contato em breve com opções de imóveis!", format_whatsapp: true }, next_node_id: "node_end", position_x: 100, position_y: 550, display_order: 7 },
                    { node_id: "node_transfer", name: "Corretor", node_type: "transfer_human", content: { message: "Aguarde, transferindo para um corretor...", notify_admin: true }, position_x: 300, position_y: 250, display_order: 8 },
                    { node_id: "node_end", name: "Fim", node_type: "end", content: {}, position_x: 100, position_y: 650, display_order: 9 }
                ]
            },
            config: { name: businessName, welcome_message: "Bem-vindo \u00E0 ".concat(businessName, "!"), fallback_message: "Não entendi, escolha uma opção.", goodbye_message: "Obrigado pelo interesse!" }
        };
    }
    function createLojaFlow(message) {
        var businessName = extractNameFromMessage(message) || 'Loja Virtual';
        return {
            message: "Criei um fluxo para a ".concat(businessName, " com produtos, pedidos e suporte!"),
            flow: {
                nodes: [
                    { node_id: "node_start_1", name: "Início", node_type: "start", content: {}, next_node_id: "node_menu", position_x: 100, position_y: 50, display_order: 0 },
                    { node_id: "node_menu", name: "Menu", node_type: "buttons", content: { body: "\uD83D\uDECD\uFE0F ".concat(businessName, "\n\nComo posso ajudar?"), buttons: [{ id: "btn_1", title: "🛒 Ver Produtos", next_node: "node_produtos" }, { id: "btn_2", title: "📦 Rastrear Pedido", next_node: "node_rastrear" }, { id: "btn_3", title: "💬 Atendimento", next_node: "node_transfer" }] }, position_x: 100, position_y: 150, display_order: 1 },
                    { node_id: "node_produtos", name: "Produtos", node_type: "message", content: { text: "🛍️ *Nossos Produtos*\n\nAcesse nosso catálogo completo:\n🔗 www.loja.com.br\n\nOu fale com um atendente para recomendações!", format_whatsapp: true }, next_node_id: "node_menu", position_x: 0, position_y: 250, display_order: 2 },
                    { node_id: "node_rastrear", name: "Rastrear", node_type: "input", content: { prompt: "Informe o número do seu pedido:", variable_name: "numero_pedido", input_type: "text", required: true }, next_node_id: "node_status", position_x: 100, position_y: 250, display_order: 3 },
                    { node_id: "node_status", name: "Status", node_type: "message", content: { text: "📦 Estamos verificando seu pedido...\n\nUm atendente irá informar o status em instantes!", format_whatsapp: true }, next_node_id: "node_transfer", position_x: 100, position_y: 350, display_order: 4 },
                    { node_id: "node_transfer", name: "Atendente", node_type: "transfer_human", content: { message: "Aguarde, conectando com atendente...", notify_admin: true }, position_x: 200, position_y: 250, display_order: 5 },
                    { node_id: "node_end", name: "Fim", node_type: "end", content: {}, position_x: 100, position_y: 450, display_order: 6 }
                ]
            },
            config: { name: businessName, welcome_message: "Bem-vindo \u00E0 ".concat(businessName, "!"), fallback_message: "Não entendi, escolha uma opção.", goodbye_message: "Obrigado pela preferência!" }
        };
    }
    function createGenericFlow(message) {
        var businessName = extractNameFromMessage(message) || 'Meu Negócio';
        return {
            message: "Criei um fluxo b\u00E1sico para ".concat(businessName, ". Me conte mais detalhes sobre seu neg\u00F3cio para personalizar melhor!"),
            flow: {
                nodes: [
                    { node_id: "node_start_1", name: "Início", node_type: "start", content: {}, next_node_id: "node_menu", position_x: 100, position_y: 50, display_order: 0 },
                    { node_id: "node_menu", name: "Menu", node_type: "buttons", content: { body: "Ol\u00E1! Bem-vindo ao ".concat(businessName, "!\n\nComo posso ajudar?"), buttons: [{ id: "btn_1", title: "ℹ️ Informações", next_node: "node_info" }, { id: "btn_2", title: "📞 Contato", next_node: "node_contato" }, { id: "btn_3", title: "💬 Atendente", next_node: "node_transfer" }] }, position_x: 100, position_y: 150, display_order: 1 },
                    { node_id: "node_info", name: "Informações", node_type: "message", content: { text: "ℹ️ *Sobre Nós*\n\nSomos uma empresa dedicada a oferecer o melhor atendimento!\n\nPara mais detalhes, fale com um atendente.", format_whatsapp: true }, next_node_id: "node_menu", position_x: 0, position_y: 250, display_order: 2 },
                    { node_id: "node_contato", name: "Contato", node_type: "message", content: { text: "📞 *Nossos Contatos*\n\n📧 Email: contato@empresa.com\n📱 WhatsApp: (00) 0000-0000\n🌐 Site: www.empresa.com", format_whatsapp: true }, next_node_id: "node_menu", position_x: 100, position_y: 250, display_order: 3 },
                    { node_id: "node_transfer", name: "Atendente", node_type: "transfer_human", content: { message: "Aguarde, conectando com um atendente...", notify_admin: true }, position_x: 200, position_y: 250, display_order: 4 },
                    { node_id: "node_end", name: "Fim", node_type: "end", content: {}, position_x: 100, position_y: 350, display_order: 5 }
                ]
            },
            config: { name: businessName, welcome_message: "Bem-vindo ao ".concat(businessName, "!"), fallback_message: "Não entendi. Escolha uma opção do menu.", goodbye_message: "Obrigado pelo contato!" }
        };
    }
    /**
     * POST /api/chatbot/generate-flow
     * Gera ou modifica o fluxo do chatbot usando IA conversacional
     * A IA deve SEMPRE entender e criar o fluxo dinamicamente baseado no pedido do cliente
     */
    app.post("/api/chatbot/generate-flow", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_19, _a, message_1, currentFlow, currentConfig, chatHistory, hasExistingFlow, isDefinitelyEdit, lowerMessage, isExplicitNewCreation, confirmationMessage, systemPrompt, historyContext, currentFlowContext, flowSummary, currentConfigContext, userPrompt, aiResponse, usedFallback, attemptNumber, chatComplete_1, tryLLMCall, simplifiedSystemPrompt, simplifiedUserPrompt, ultraSimplePrompt, parsedResponse_1, cleanResponse, jsonMatch, jsonStr, looksLikeJSON, nodes, corrections, declaredVariables, usedVariables, _i, nodes_4, node, content, _b, _c, btn, _d, _e, section, _f, _g, row, _h, nodes_5, node, content, matches, _j, matches_1, match, varName, bodyLower, shouldSave, varName, _k, _l, btn, bodyLower, shouldSave, varName, _m, _o, section, _p, _q, row, _r, usedVariables_1, usedVar, cleanMessage, maxAttempts, attempt, configPrompt, configResponse, configContent, jsonMatch, configJson, configError_1, configResult, chatbotId_8, newConfig, versionResult, nextVersion_1, versionName_1, saveError_1, error_21;
        var _this = this;
        var _s, _t, _u, _v, _w, _x, _y, _z, _0;
        return __generator(this, function (_1) {
            switch (_1.label) {
                case 0:
                    _1.trys.push([0, 24, , 25]);
                    userId_19 = (_s = req.user) === null || _s === void 0 ? void 0 : _s.id;
                    if (!userId_19) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    _a = req.body, message_1 = _a.message, currentFlow = _a.currentFlow, currentConfig = _a.currentConfig, chatHistory = _a.chatHistory, hasExistingFlow = _a.hasExistingFlow, isDefinitelyEdit = _a.isDefinitelyEdit;
                    if (!message_1) {
                        return [2 /*return*/, res.status(400).json({ error: "Mensagem é obrigatória" })];
                    }
                    console.log("\uD83E\uDD16 [FLOW_GENERATOR] Gerando fluxo para usu\u00E1rio ".concat(userId_19));
                    console.log("\uD83D\uDCDD Mensagem: ".concat(message_1.substring(0, 200), "..."));
                    console.log("\uD83D\uDCCA Tem fluxo existente: ".concat(hasExistingFlow));
                    console.log("\u270F\uFE0F \u00C9 definitivamente edi\u00E7\u00E3o: ".concat(isDefinitelyEdit));
                    lowerMessage = message_1.toLowerCase();
                    isExplicitNewCreation = (/cri(e|ar)|novo|nova|fazer um|quero um|preciso de um|começar do zero|substituir|apagar tudo/i.test(lowerMessage) &&
                        /(chatbot|fluxo|robô|atendimento|salão|loja|restaurante|pizzaria|clínica|imobili|cardápio|cardapio)/i.test(lowerMessage));
                    console.log("\uD83C\uDD95 Quer criar novo: ".concat(isExplicitNewCreation));
                    // ============================================================
                    // Se é DEFINITIVAMENTE uma edição (E NÃO quer criar algo novo)
                    // ============================================================
                    if (isDefinitelyEdit && hasExistingFlow && currentFlow && currentFlow.length > 0 && !isExplicitNewCreation) {
                        console.log("\u26A1 [FLOW_GENERATOR] Modo de edi\u00E7\u00E3o direta ativado");
                        confirmationMessage = "Entendi que voc\u00EA quer fazer uma altera\u00E7\u00E3o no fluxo atual. \n\nVoc\u00EA pode me dizer mais especificamente:\n- **O que exatamente** voc\u00EA quer adicionar/remover/modificar?\n- **Onde no fluxo** (qual categoria, qual menu)?\n- **Detalhes** como nome e pre\u00E7o (se for um item)?\n\nExemplo: \"Adicionar Escova Simples por R$45 na categoria Tratamentos\"";
                        return [2 /*return*/, res.json({
                                needsConfirmation: true,
                                confirmationMessage: confirmationMessage,
                                message: confirmationMessage
                            })];
                    }
                    systemPrompt = "Voc\u00EA \u00E9 um ESPECIALISTA em criar e gerenciar fluxos de chatbot para WhatsApp.\n\nVOC\u00CA \u00C9 INTELIGENTE E ENTENDE NATURALMENTE O QUE O CLIENTE QUER.\n\nSUA CAPACIDADE DE INTERPRETA\u00C7\u00C3O:\nVoc\u00EA entende diferentes formas de falar. Por exemplo:\n- \"bota mais uma pizza\" = adicionar item ao card\u00E1pio\n- \"tira aquele neg\u00F3cio do pre\u00E7o\" = remover item ou alterar pre\u00E7o\n- \"coloca delivery tamb\u00E9m\" = adicionar funcionalidade de delivery\n- \"muda o nome pra outro\" = alterar nome do chatbot\n- \"quero come\u00E7ar de novo\" = criar novo fluxo do zero\n- \"faz um rob\u00F4 pra minha loja\" = criar chatbot para loja\n\nREGRA DE OURO - SEMPRE PERGUNTE QUANDO HOUVER D\u00DAVIDA:\nSe a solicita\u00E7\u00E3o for AMB\u00CDGUA ou puder ter M\u00DALTIPLAS INTERPRETA\u00C7\u00D5ES:\n1. N\u00C3O execute a a\u00E7\u00E3o imediatamente\n2. Retorne um JSON com \"needsConfirmation\": true\n3. Fa\u00E7a uma pergunta clara para confirmar o que o usu\u00E1rio quer\n\nEXEMPLOS DE QUANDO PERGUNTAR:\n- \"muda o pre\u00E7o\" \u2192 Perguntar: \"Qual item voc\u00EA quer alterar o pre\u00E7o? E qual o novo valor?\"\n- \"adiciona mais coisa\" \u2192 Perguntar: \"O que voc\u00EA gostaria de adicionar? Um novo item, categoria, ou funcionalidade?\"\n- \"tira isso\" \u2192 Perguntar: \"O que exatamente voc\u00EA quer remover do fluxo?\"\n- \"melhora isso\" \u2192 Perguntar: \"O que especificamente voc\u00EA gostaria de melhorar?\"\n\nQUANDO J\u00C1 EXISTE UM FLUXO (hasExistingFlow = true):\n1. ANALISE se o usu\u00E1rio quer EDITAR o fluxo atual ou CRIAR um novo\n2. Se parecer edi\u00E7\u00E3o (adicionar/remover/alterar algo espec\u00EDfico):\n   - Modifique APENAS o que foi pedido\n   - Mantenha todo o resto intacto\n3. Se parecer cria\u00E7\u00E3o de novo fluxo (novo neg\u00F3cio, come\u00E7ar do zero):\n   - Crie um fluxo completamente novo\n4. Se n\u00E3o tiver certeza:\n   - Pergunte: \"Voc\u00EA quer modificar o fluxo atual ou criar um novo do zero?\"\n\nFORMATO DE RESPOSTA PARA CONFIRMA\u00C7\u00C3O (quando precisar perguntar):\n{\n  \"needsConfirmation\": true,\n  \"confirmationMessage\": \"Sua pergunta clara aqui\",\n  \"message\": \"Sua pergunta clara aqui\"\n}\n\nFORMATO DE RESPOSTA PARA A\u00C7\u00C3O (quando executar):\n{\n  \"needsConfirmation\": false,\n  \"message\": \"Descri\u00E7\u00E3o do que foi feito\",\n  \"flow\": { \"nodes\": [...] },\n  \"config\": { \"name\": \"...\", ... }\n}\n\n\uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8 REGRA CR\u00CDTICA OBRIGAT\u00D3RIA - CONFIG \u00C9 OBRIGAT\u00D3RIO \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nAo criar um NOVO fluxo (n\u00E3o edi\u00E7\u00E3o), voc\u00EA DEVE SEMPRE incluir o objeto \"config\" completo com TODOS os campos:\n- \"name\": Nome do neg\u00F3cio/chatbot (extra\u00EDdo da mensagem do usu\u00E1rio)\n- \"welcome_message\": Mensagem de boas-vindas personalizada para o tipo de neg\u00F3cio\n- \"fallback_message\": Mensagem quando o bot n\u00E3o entende (ex: \"Desculpe, n\u00E3o entendi. Por favor, escolha uma op\u00E7\u00E3o do menu.\")\n- \"goodbye_message\": Mensagem de despedida (ex: \"Obrigado por utilizar nosso atendimento! At\u00E9 logo! \uD83D\uDC4B\")\n\nEXEMPLO DE CONFIG OBRIGAT\u00D3RIO:\n\"config\": {\n  \"name\": \"Pizzaria Bella Napoli\",\n  \"welcome_message\": \"\uD83C\uDF55 Ol\u00E1! Bem-vindo \u00E0 Pizzaria Bella Napoli! Como posso ajudar?\",\n  \"fallback_message\": \"Desculpe, n\u00E3o entendi. Por favor, escolha uma op\u00E7\u00E3o do menu.\",\n  \"goodbye_message\": \"Obrigado por escolher a Pizzaria Bella Napoli! At\u00E9 a pr\u00F3xima! \uD83C\uDF55\"\n}\n\n\u26A0\uFE0F SE VOC\u00CA N\u00C3O INCLUIR O CONFIG, A CONFIGURA\u00C7\u00C3O DO CHATBOT N\u00C3O SER\u00C1 ATUALIZADA E O USU\u00C1RIO VER\u00C1 DADOS ANTIGOS!\n\uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8 FIM DA REGRA CR\u00CDTICA \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\n\nANALISE A SOLICITA\u00C7\u00C3O DO CLIENTE COM CUIDADO:\n- Se ele menciona \"pizzaria\", crie um fluxo COMPLETO para pizzaria com card\u00E1pio, pedidos, promo\u00E7\u00F5es\n- Se ele menciona \"cl\u00EDnica\", crie um fluxo para agendamento m\u00E9dico, especialidades, conv\u00EAnios\n- Se ele menciona \"imobili\u00E1ria\", crie fluxo para busca de im\u00F3veis, agendamento de visitas\n- Se ele menciona qualquer outro tipo de neg\u00F3cio, ENTENDA e crie fluxo adequado\n\nEXTRAIA INFORMA\u00C7\u00D5ES IMPORTANTES DA MENSAGEM:\n- Nome do neg\u00F3cio/chatbot (se mencionado)\n- Tipo de neg\u00F3cio\n- Funcionalidades desejadas (card\u00E1pio, pedidos, agendamento, promo\u00E7\u00F5es, etc.)\n- Tom de voz desejado\n\nCRIE FLUXOS RICOS E COMPLETOS:\n- Para pizzaria/restaurante: Menu de card\u00E1pio, categorias (pizzas, bebidas), op\u00E7\u00F5es de pedido, promo\u00E7\u00F5es\n- Para cl\u00EDnica: Especialidades, agendamento, informa\u00E7\u00F5es de contato\n- Para loja: Cat\u00E1logo, categorias de produtos, carrinho, promo\u00E7\u00F5es\n- Para qualquer neg\u00F3cio: Entenda e crie fluxo relevante e completo\n\nREGRAS DO WHATSAPP:\n- Bot\u00F5es: m\u00E1ximo 3 op\u00E7\u00F5es (use lista se precisar de mais)\n- Lista: m\u00E1ximo 10 op\u00E7\u00F5es por se\u00E7\u00E3o\n- Mantenha textos curtos e claros\n- Use emojis para deixar mais amig\u00E1vel\n\nREGRAS IMPORTANTES:\n1. Sempre retorne um JSON v\u00E1lido com a estrutura especificada\n2. Cada n\u00F3 deve ter um node_id \u00FAnico (use formato: node_tipo_numero, ex: node_start_1, node_msg_2)\n3. O fluxo SEMPRE deve come\u00E7ar com um n\u00F3 do tipo \"start\"\n4. Conecte os n\u00F3s usando next_node_id ou campos espec\u00EDficos (true_node, false_node para condi\u00E7\u00F5es, next_node para bot\u00F5es)\n5. Use nomes descritivos para os n\u00F3s\n6. Para bot\u00F5es, limite a 3 op\u00E7\u00F5es (limite do WhatsApp)\n7. Para listas, limite a 10 op\u00E7\u00F5es por se\u00E7\u00E3o\n8. Sempre termine o fluxo com um n\u00F3 \"end\" ou \"transfer_human\"\n\nTIPOS DE N\u00D3S DISPON\u00CDVEIS:\n- start: In\u00EDcio do fluxo (obrigat\u00F3rio, apenas 1)\n- message: Envia mensagem de texto simples\n- buttons: Mensagem com bot\u00F5es clic\u00E1veis (max 3)\n- list: Menu com lista de op\u00E7\u00F5es (max 10 por se\u00E7\u00E3o)\n- input: Coleta dados do usu\u00E1rio e salva em vari\u00E1vel\n- media: Envia imagem/\u00E1udio/v\u00EDdeo/documento\n- condition: Bifurca\u00E7\u00E3o baseada em vari\u00E1vel\n- delay: Pausa em segundos\n- set_variable: Define/altera vari\u00E1vel\n- transfer_human: Transfere para atendente\n- end: Finaliza o fluxo\n- goto: Pula para outro n\u00F3\n\nESTRUTURA DO JSON DE RESPOSTA:\n{\n  \"needsConfirmation\": false,\n  \"message\": \"Descri\u00E7\u00E3o do que foi feito\",\n  \"flow\": {\n    \"nodes\": [\n      {\n        \"node_id\": \"node_start_1\",\n        \"name\": \"In\u00EDcio\",\n        \"node_type\": \"start\",\n        \"content\": {},\n        \"next_node_id\": \"node_msg_1\",\n        \"position_x\": 100,\n        \"position_y\": 100,\n        \"display_order\": 0\n      },\n      ...\n    ]\n  },\n  \"config\": {\n    \"name\": \"Nome do Chatbot\",\n    \"welcome_message\": \"Mensagem de boas-vindas\",\n    \"fallback_message\": \"Mensagem quando n\u00E3o entende\",\n    \"goodbye_message\": \"Mensagem de despedida\"\n  }\n}\n\nEXEMPLOS DE CONTE\u00DADO POR TIPO DE N\u00D3:\n\nmessage (mensagem simples):\n{ \"text\": \"Ol\u00E1! Bem-vindo \u00E0 nossa loja!\", \"format_whatsapp\": true }\n\nmessage (usando vari\u00E1veis no resumo/confirma\u00E7\u00E3o):\n{ \"text\": \"\u2705 *Resumo do Pedido*\n\n\uD83D\uDC64 Nome: {{nome}}\n\uD83D\uDCCD Endere\u00E7o: {{endereco}}\n\uD83C\uDF55 Pedido: {{pedido}}\n\uD83D\uDCB0 Pagamento: {{pagamento}}\n\nConfirma?\", \"format_whatsapp\": true }\n\nIMPORTANTE SOBRE VARI\u00C1VEIS:\n- Use {{nome_variavel}} (duas chaves) para exibir o valor de vari\u00E1veis nas mensagens\n- Sempre use save_variable em bot\u00F5es e listas para salvar a escolha do usu\u00E1rio\n- O save_variable salva o TITLE do bot\u00E3o/item que o usu\u00E1rio clicou\n\nbuttons (COM save_variable para salvar escolha):\n{\n  \"body\": \"Escolha a forma de pagamento:\",\n  \"buttons\": [\n    { \"id\": \"btn_pix\", \"title\": \"\uD83D\uDCB0 PIX\", \"next_node\": \"node_confirmar\", \"save_variable\": \"pagamento\" },\n    { \"id\": \"btn_dinheiro\", \"title\": \"\uD83D\uDCB5 Dinheiro\", \"next_node\": \"node_confirmar\", \"save_variable\": \"pagamento\" },\n    { \"id\": \"btn_cartao\", \"title\": \"\uD83D\uDCB3 Cart\u00E3o\", \"next_node\": \"node_confirmar\", \"save_variable\": \"pagamento\" }\n  ]\n}\n\nbuttons (navega\u00E7\u00E3o simples sem salvar):\n{\n  \"body\": \"Menu Principal:\",\n  \"buttons\": [\n    { \"id\": \"btn_1\", \"title\": \"Ver Card\u00E1pio\", \"next_node\": \"node_cardapio\" },\n    { \"id\": \"btn_2\", \"title\": \"Fazer Pedido\", \"next_node\": \"node_pedido\" },\n    { \"id\": \"btn_3\", \"title\": \"Falar com Atendente\", \"next_node\": \"node_transfer\" }\n  ]\n}\n\nlist (COM save_variable para salvar item selecionado):\n{\n  \"body\": \"Selecione o produto:\",\n  \"button_text\": \"Ver produtos\",\n  \"sections\": [\n    {\n      \"title\": \"Pizzas\",\n      \"rows\": [\n        { \"id\": \"pizza_1\", \"title\": \"Margherita - R$35\", \"description\": \"Molho, mu\u00E7arela e manjeric\u00E3o\", \"next_node\": \"node_sabor_selecionado\", \"save_variable\": \"pedido\" },\n        { \"id\": \"pizza_2\", \"title\": \"Calabresa - R$38\", \"description\": \"Calabresa e cebola\", \"next_node\": \"node_sabor_selecionado\", \"save_variable\": \"pedido\" }\n      ]\n    }\n  ]\n}\n\ninput (coleta dados e salva em vari\u00E1vel):\n{\n  \"prompt\": \"Qual \u00E9 o seu nome?\",\n  \"variable_name\": \"nome\",\n  \"input_type\": \"text\",\n  \"required\": true\n}\n\ncondition:\n{\n  \"variable\": \"quer_mais\",\n  \"operator\": \"equals\",\n  \"value\": \"sim\",\n  \"true_node\": \"node_mais_produtos\",\n  \"false_node\": \"node_finalizar\"\n}\n\ndelay:\n{ \"seconds\": 3 }\n\ntransfer_human:\n{\n  \"message\": \"Aguarde, vou transferir para um atendente...\",\n  \"notify_admin\": true\n}\n\nREGRAS CR\u00CDTICAS PARA VARI\u00C1VEIS:\n1. Use save_variable em TODOS os bot\u00F5es/listas onde a escolha do usu\u00E1rio importa\n2. Use variable_name em TODOS os inputs para salvar dados digitados\n3. No n\u00F3 de confirma\u00E7\u00E3o/resumo, use {{nome_variavel}} para mostrar os valores\n4. Nomes de vari\u00E1veis devem ser simples: nome, endereco, pedido, pagamento, servico, horario\n\nTEMPLATES CONDICIONAIS SUPORTADOS (use quando necess\u00E1rio):\n- {{#if variavel}}conte\u00FAdo{{/if}} - Mostra conte\u00FAdo se vari\u00E1vel existe e n\u00E3o \u00E9 vazia\n- {{#if variavel}}se sim{{else}}se n\u00E3o{{/if}} - Com alternativa\n- {{#ifEqual variavel \"valor\"}}conte\u00FAdo{{/ifEqual}} - Mostra se vari\u00E1vel == valor\n- {{#ifNotEqual variavel \"valor\"}}conte\u00FAdo{{/ifNotEqual}} - Mostra se vari\u00E1vel != valor\n- {{#ifContains variavel \"texto\"}}conte\u00FAdo{{/ifContains}} - Mostra se vari\u00E1vel cont\u00E9m texto\n- {{#unless variavel}}conte\u00FAdo{{/unless}} - Mostra se vari\u00E1vel N\u00C3O existe ou \u00E9 vazia\n\nEXEMPLO DE RESUMO COM CONDICIONAL (para delivery):\n{\n  \"text\": \"\u2705 *Resumo do Pedido*\\n\\n\uD83D\uDC64 Nome: {{nome}}\\n{{#ifEqual tipo_entrega \"\uD83C\uDFE0 Entrega (R$5)\"}}\uD83D\uDCCD Endere\u00E7o: {{endereco}}\\n\uD83D\uDE9A Taxa: R$5{{/ifEqual}}{{#ifEqual tipo_entrega \"\uD83C\uDFEC Retirada\"}}\uD83C\uDFEC Retirar na loja{{/ifEqual}}\\n\uD83C\uDF55 Pedido: {{pedido}}\\n\uD83D\uDCB0 Pagamento: {{pagamento}}\\n\\nTudo certo?\"\n}\n\nEXEMPLO SIMPLES DE RESUMO (sem condicional):\n{\n  \"text\": \"\u2705 *Resumo do Pedido*\\n\\n\uD83D\uDC64 Nome: {{nome}}\\n\uD83D\uDCCD Endere\u00E7o: {{endereco}}\\n\uD83C\uDF55 Pedido: {{pedido}}\\n\uD83D\uDCB0 Pagamento: {{pagamento}}\\n\uD83D\uDE9A Entrega: {{tipo_entrega}}\\n\\nTudo certo?\"\n}\n\nFLUXO PARA DELIVERY/PIZZARIA/RESTAURANTE:\nDeve incluir n\u00F3s para:\n- Menu principal com op\u00E7\u00F5es (card\u00E1pio, pedido, promo\u00E7\u00F5es)\n- Lista de produtos COM save_variable para salvar escolha\n- Coleta de nome (input com variable_name: \"nome\")\n- Coleta de endere\u00E7o (input com variable_name: \"endereco\")\n- Forma de pagamento (bot\u00F5es COM save_variable: \"pagamento\")\n- N\u00F3 de confirma\u00E7\u00E3o MOSTRANDO todas as vari\u00E1veis: {{nome}}, {{endereco}}, {{pedido}}, {{pagamento}}\n\nFLUXO PARA CL\u00CDNICA/CONSULT\u00D3RIO:\nDeve incluir n\u00F3s para:\n- Menu com especialidades\n- Lista de servi\u00E7os COM save_variable: \"servico\"\n- Coleta de nome (input com variable_name: \"nome\")\n- Prefer\u00EAncia de hor\u00E1rio (bot\u00F5es COM save_variable: \"horario\")\n- N\u00F3 de confirma\u00E7\u00E3o: \"Agendamento para {{nome}}\nServi\u00E7o: {{servico}}\nHor\u00E1rio: {{horario}}\"\n\nFLUXO PARA SAL\u00C3O/BARBEARIA:\nDeve incluir n\u00F3s para:\n- Menu com tipos de servi\u00E7o (corte, barba, tratamentos)\n- Lista de servi\u00E7os COM save_variable: \"servico\"\n- Lista de profissionais COM save_variable: \"profissional\"\n- Prefer\u00EAncia de hor\u00E1rio COM save_variable: \"horario\"\n- Coleta de nome (input com variable_name: \"nome\")\n- N\u00F3 de confirma\u00E7\u00E3o: \"{{nome}}, seu agendamento:\n\u2702\uFE0F {{servico}}\n\uD83D\uDC64 {{profissional}}\n\uD83D\uDD50 {{horario}}\"\n\nEXEMPLO COMPLETO - PIZZARIA:\nSe o usu\u00E1rio pedir: \"Crie um chatbot para uma pizzaria chamada 'Pizza Express' com op\u00E7\u00F5es de card\u00E1pio, pedidos e promo\u00E7\u00F5es\"\n\nO fluxo deve ter MUITOS n\u00F3s completos como:\n- N\u00F3 start (in\u00EDcio)\n- N\u00F3 de boas-vindas com bot\u00F5es: \uD83D\uDCCB Ver Card\u00E1pio | \uD83D\uDED2 Fazer Pedido | \uD83C\uDF81 Promo\u00E7\u00F5es\n- N\u00F3 de card\u00E1pio com lista de pizzas (Margherita, Calabresa, 4 Queijos, Portuguesa, etc)\n- N\u00F3 para cada pizza mostrando descri\u00E7\u00E3o e pre\u00E7o\n- N\u00F3 de promo\u00E7\u00F5es mostrando ofertas do dia\n- N\u00F3 para coletar dados do pedido (nome, endere\u00E7o, forma de pagamento)\n- N\u00F3 de confirma\u00E7\u00E3o\n- N\u00F3 de transfer\u00EAncia para atendente\n- N\u00F3 de finaliza\u00E7\u00E3o\n\nCRIE FLUXOS COMPLETOS COM NO M\u00CDNIMO 8-15 N\u00D3S para ser \u00FAtil ao neg\u00F3cio!\n\nDICA IMPORTANTE: \n- Use o NOME DO NEG\u00D3CIO mencionado pelo cliente nas mensagens\n- Personalize as op\u00E7\u00F5es para o TIPO DE NEG\u00D3CIO espec\u00EDfico\n- Crie fluxos ricos e funcionais, n\u00E3o gen\u00E9ricos";
                    historyContext = chatHistory && chatHistory.length > 0
                        ? chatHistory.map(function (m) { return "".concat(m.role === 'user' ? 'Usuário' : 'Assistente', ": ").concat(m.content); }).join('\n')
                        : '';
                    currentFlowContext = void 0;
                    if (currentFlow && currentFlow.length > 0) {
                        flowSummary = currentFlow.map(function (node) {
                            var _a;
                            var nodeData = node.data || {};
                            var summary = "- ".concat(node.id, " (").concat(nodeData.type || 'message', "): ").concat(((_a = nodeData.content) === null || _a === void 0 ? void 0 : _a.substring(0, 50)) || nodeData.title || 'sem título');
                            if (nodeData.options && nodeData.options.length > 0) {
                                summary += " [op\u00E7\u00F5es: ".concat(nodeData.options.map(function (o) { return o.label; }).join(', '), "]");
                            }
                            return summary;
                        }).join('\n');
                        currentFlowContext = "\n\nFLUXO ATUAL DO CHATBOT (".concat(currentFlow.length, " n\u00F3s):\nO usu\u00E1rio J\u00C1 TEM um fluxo criado. Analise se ele quer EDITAR ou CRIAR NOVO.\n\nRESUMO DOS N\u00D3S EXISTENTES:\n").concat(flowSummary, "\n\nSe o usu\u00E1rio quer EDITAR (adicionar, remover, modificar), voc\u00EA deve retornar o fluxo COMPLETO atualizado.");
                    }
                    else {
                        currentFlowContext = '\n\nO usuário ainda NÃO TEM um fluxo criado. Crie um novo fluxo COMPLETO e PERSONALIZADO.';
                    }
                    currentConfigContext = currentConfig
                        ? "\n\nCONFIGURA\u00C7\u00C3O ATUAL:\nNome: ".concat(currentConfig.name, "\nBoas-vindas: ").concat(currentConfig.welcome_message)
                        : '';
                    userPrompt = "".concat(historyContext ? "HIST\u00D3RICO DA CONVERSA:\n".concat(historyContext, "\n\n") : '').concat(currentFlowContext, "\n").concat(currentConfigContext, "\n\nSOLICITA\u00C7\u00C3O DO USU\u00C1RIO:\n\"").concat(message_1, "\"\n\nINSTRU\u00C7\u00D5ES:\n1. INTERPRETE naturalmente o que o usu\u00E1rio quer (ele pode falar de v\u00E1rias formas)\n2. Se a solicita\u00E7\u00E3o for AMB\u00CDGUA, retorne needsConfirmation: true com uma pergunta clara\n3. Se j\u00E1 existe fluxo e n\u00E3o tem certeza se \u00E9 edi\u00E7\u00E3o ou cria\u00E7\u00E3o nova, PERGUNTE\n4. Se for claro o que fazer, execute e retorne o fluxo\n5. ENTENDA exatamente o que o cliente quer\n6. EXTRAIA o nome do neg\u00F3cio, tipo e funcionalidades desejadas\n7. CRIE um fluxo COMPLETO e PERSONALIZADO (m\u00EDnimo 8 n\u00F3s)\n8. USE o nome do neg\u00F3cio nas mensagens\n9. Responda APENAS com o JSON v\u00E1lido conforme especificado");
                    aiResponse = null;
                    usedFallback = false;
                    attemptNumber = 0;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./llm'); })];
                case 1:
                    chatComplete_1 = (_1.sent()).chatComplete;
                    tryLLMCall = function (sysPrompt_1, usrPrompt_1, attempt_1) {
                        var args_1 = [];
                        for (var _i = 3; _i < arguments.length; _i++) {
                            args_1[_i - 3] = arguments[_i];
                        }
                        return __awaiter(_this, __spreadArray([sysPrompt_1, usrPrompt_1, attempt_1], args_1, true), void 0, function (sysPrompt, usrPrompt, attempt, timeoutMs // 60 segundos por tentativa
                        ) {
                            var timeoutPromise, llmPromise, response, content, err_1;
                            var _a, _b, _c;
                            if (timeoutMs === void 0) { timeoutMs = 60000; }
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        _d.trys.push([0, 2, , 3]);
                                        console.log("\uD83E\uDD16 [FLOW_GENERATOR] Tentativa ".concat(attempt, " - Chamando LLM..."));
                                        timeoutPromise = new Promise(function (_, reject) {
                                            setTimeout(function () { return reject(new Error("TIMEOUT ap\u00F3s ".concat(timeoutMs / 1000, "s"))); }, timeoutMs);
                                        });
                                        llmPromise = chatComplete_1({
                                            messages: [
                                                { role: 'system', content: sysPrompt },
                                                { role: 'user', content: usrPrompt }
                                            ],
                                            temperature: attempt === 1 ? 0.3 : 0.5, // Aumentar temperatura nos retries
                                            maxTokens: 8000
                                        });
                                        return [4 /*yield*/, Promise.race([llmPromise, timeoutPromise])];
                                    case 1:
                                        response = _d.sent();
                                        if ((_c = (_b = (_a = response === null || response === void 0 ? void 0 : response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) {
                                            content = response.choices[0].message.content;
                                            console.log("\u2705 [FLOW_GENERATOR] Tentativa ".concat(attempt, " - Resposta recebida (").concat(content.length, " chars)"));
                                            return [2 /*return*/, content];
                                        }
                                        return [2 /*return*/, null];
                                    case 2:
                                        err_1 = _d.sent();
                                        console.warn("\u26A0\uFE0F [FLOW_GENERATOR] Tentativa ".concat(attempt, " falhou: ").concat((err_1 === null || err_1 === void 0 ? void 0 : err_1.message) || err_1));
                                        return [2 /*return*/, null];
                                    case 3: return [2 /*return*/];
                                }
                            });
                        });
                    };
                    simplifiedSystemPrompt = "Voc\u00EA \u00E9 um assistente que cria fluxos de chatbot para WhatsApp.\nResponda APENAS com JSON v\u00E1lido no formato:\n{\n  \"message\": \"Mensagem de sucesso\",\n  \"flow\": {\n    \"config\": { \"name\": \"Nome do Neg\u00F3cio\", \"welcome_message\": \"Bem-vindo!\", \"fallback_message\": \"N\u00E3o entendi\", \"goodbye_message\": \"Obrigado!\" },\n    \"nodes\": [array de n\u00F3s do fluxo]\n  }\n}\n\nTipos de n\u00F3s dispon\u00EDveis: start, message, buttons, input, transfer_human, end\n\nExemplo de n\u00F3 buttons:\n{\n  \"node_id\": \"node_menu\",\n  \"name\": \"Menu\",\n  \"node_type\": \"buttons\",\n  \"content\": {\n    \"body\": \"Escolha uma op\u00E7\u00E3o:\",\n    \"buttons\": [\n      {\"id\": \"btn_1\", \"title\": \"Op\u00E7\u00E3o 1\", \"next_node\": \"node_opcao1\"},\n      {\"id\": \"btn_2\", \"title\": \"Op\u00E7\u00E3o 2\", \"next_node\": \"node_opcao2\"}\n    ]\n  }\n}";
                    simplifiedUserPrompt = "Crie um fluxo de chatbot para: ".concat(message_1, "\n\nInclua no m\u00EDnimo:\n- N\u00F3 start (in\u00EDcio)\n- N\u00F3 menu com bot\u00F5es\n- 2-3 op\u00E7\u00F5es de servi\u00E7o\n- Op\u00E7\u00E3o de falar com atendente\n- N\u00F3 end (fim)\n\nResponda APENAS com o JSON do fluxo.");
                    ultraSimplePrompt = "Crie um JSON de fluxo de chatbot simples para \"".concat(message_1, "\".\nUse este formato EXATO:\n{\n  \"message\": \"Fluxo criado!\",\n  \"flow\": {\n    \"config\": { \"name\": \"Meu Neg\u00F3cio\", \"welcome_message\": \"Ol\u00E1!\", \"fallback_message\": \"N\u00E3o entendi\", \"goodbye_message\": \"At\u00E9 logo!\" },\n    \"nodes\": [\n      {\"node_id\": \"node_start\", \"name\": \"In\u00EDcio\", \"node_type\": \"start\", \"content\": {}, \"next_node_id\": \"node_menu\"},\n      {\"node_id\": \"node_menu\", \"name\": \"Menu\", \"node_type\": \"buttons\", \"content\": {\"body\": \"Como posso ajudar?\", \"buttons\": [{\"id\": \"btn_1\", \"title\": \"Informa\u00E7\u00F5es\", \"next_node\": \"node_info\"}, {\"id\": \"btn_2\", \"title\": \"Atendente\", \"next_node\": \"node_transfer\"}]}},\n      {\"node_id\": \"node_info\", \"name\": \"Info\", \"node_type\": \"message\", \"content\": {\"text\": \"Aqui est\u00E3o nossas informa\u00E7\u00F5es.\"}, \"next_node_id\": \"node_menu\"},\n      {\"node_id\": \"node_transfer\", \"name\": \"Atendente\", \"node_type\": \"transfer_human\", \"content\": {\"message\": \"Transferindo...\"}},\n      {\"node_id\": \"node_end\", \"name\": \"Fim\", \"node_type\": \"end\", \"content\": {}}\n    ]\n  }\n}\nPersonalize os textos para o neg\u00F3cio solicitado. Responda APENAS o JSON.");
                    // ============================================================
                    // TENTATIVA 1: Prompt completo (60 segundos)
                    // ============================================================
                    attemptNumber = 1;
                    console.log("\uD83D\uDE80 [FLOW_GENERATOR] === TENTATIVA 1/3: Prompt completo ===");
                    console.log("\uD83D\uDCDD [FLOW_GENERATOR] Prompt do usu\u00E1rio: ".concat(message_1));
                    return [4 /*yield*/, tryLLMCall(systemPrompt, userPrompt, 1, 60000)];
                case 2:
                    aiResponse = _1.sent();
                    if (!(!aiResponse || aiResponse.trim() === '' || aiResponse === '{}')) return [3 /*break*/, 4];
                    attemptNumber = 2;
                    console.log("\uD83D\uDD04 [FLOW_GENERATOR] === TENTATIVA 2/3: Prompt simplificado ===");
                    usedFallback = true;
                    return [4 /*yield*/, tryLLMCall(simplifiedSystemPrompt, simplifiedUserPrompt, 2, 45000)];
                case 3:
                    aiResponse = _1.sent();
                    _1.label = 4;
                case 4:
                    if (!(!aiResponse || aiResponse.trim() === '' || aiResponse === '{}')) return [3 /*break*/, 6];
                    attemptNumber = 3;
                    console.log("\uD83D\uDD04 [FLOW_GENERATOR] === TENTATIVA 3/3: Prompt ultra-simples ===");
                    usedFallback = true;
                    return [4 /*yield*/, tryLLMCall('Você é um gerador de JSON. Responda APENAS com JSON válido.', ultraSimplePrompt, 3, 45000)];
                case 5:
                    aiResponse = _1.sent();
                    _1.label = 6;
                case 6:
                    // ============================================================
                    // VALIDAÇÃO FINAL: Se todas as tentativas falharam
                    // ============================================================
                    if (!aiResponse || aiResponse.trim() === '' || aiResponse === '{}') {
                        console.error("\u274C [FLOW_GENERATOR] Todas as 3 tentativas falharam!");
                        // Retornar mensagem amigável pedindo para tentar novamente
                        return [2 /*return*/, res.json({
                                needsConfirmation: true,
                                confirmationMessage: "Estou processando seu pedido... Por favor, tente novamente em alguns segundos. Nosso sistema est\u00E1 trabalhando para criar o fluxo perfeito para voc\u00EA! \uD83D\uDE80",
                                message: "Por favor, repita sua solicita\u00E7\u00E3o: \"".concat(message_1, "\"")
                            })];
                    }
                    console.log("\u2705 [FLOW_GENERATOR] Resposta obtida na tentativa ".concat(attemptNumber));
                    console.log("\uD83D\uDCCB [FLOW_GENERATOR] Preview: ".concat(aiResponse === null || aiResponse === void 0 ? void 0 : aiResponse.substring(0, 300), "..."));
                    try {
                        cleanResponse = aiResponse || '{}';
                        cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                        jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            jsonStr = jsonMatch[0];
                            // SANITIZAÇÃO ROBUSTA: Limpar caracteres de controle dentro de strings JSON
                            // Processar string por string para não quebrar a estrutura JSON
                            jsonStr = jsonStr.replace(/"((?:[^"\\]|\\.)*)"/g, function (match, content) {
                                // Dentro de strings JSON:
                                // 1. Substituir quebras de linha reais por espaços
                                // 2. Substituir tabs por espaços
                                // 3. Remover carriage returns
                                // 4. Substituir outros caracteres de controle
                                var cleanContent = content
                                    .replace(/\n/g, ' ')
                                    .replace(/\r/g, '')
                                    .replace(/\t/g, ' ')
                                    .replace(/[\x00-\x1F\x7F]/g, ' ') // Remover outros chars de controle
                                    .replace(/  +/g, ' '); // Colapsar múltiplos espaços
                                return "\"".concat(cleanContent, "\"");
                            });
                            parsedResponse_1 = JSON.parse(jsonStr);
                        }
                        else {
                            // Se não encontrou JSON, verificar se a IA respondeu em texto natural (fazendo pergunta)
                            // Isso acontece quando a IA quer confirmar algo mas não seguiu o formato
                            if (cleanResponse.includes('?') || cleanResponse.toLowerCase().includes('poderia') || cleanResponse.toLowerCase().includes('qual')) {
                                console.log("\u2753 [FLOW_GENERATOR] IA respondeu em texto natural (poss\u00EDvel confirma\u00E7\u00E3o): ".concat(cleanResponse.substring(0, 200)));
                                return [2 /*return*/, res.json({
                                        needsConfirmation: true,
                                        confirmationMessage: cleanResponse,
                                        message: cleanResponse
                                    })];
                            }
                            throw new Error('JSON não encontrado na resposta');
                        }
                    }
                    catch (parseError) {
                        console.error('[FLOW_GENERATOR] Erro ao parsear resposta:', parseError);
                        console.log('[FLOW_GENERATOR] Resposta original:', aiResponse === null || aiResponse === void 0 ? void 0 : aiResponse.substring(0, 500));
                        looksLikeJSON = aiResponse && (aiResponse.includes('"flow"') ||
                            aiResponse.includes('"nodes"') ||
                            aiResponse.includes('"needsConfirmation"'));
                        // Se a resposta parece ser uma pergunta E NÃO parece ser JSON, tratar como confirmação
                        if (!looksLikeJSON && aiResponse && (aiResponse.includes('?') ||
                            aiResponse.toLowerCase().includes('você quer') ||
                            aiResponse.toLowerCase().includes('deseja'))) {
                            return [2 /*return*/, res.json({
                                    needsConfirmation: true,
                                    confirmationMessage: aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim(),
                                    message: aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
                                })];
                        }
                        // ============================================================
                        // FALLBACK: Se parse falhou, pedir para tentar novamente
                        // NUNCA retornar erro 500 para o usuário!
                        // ============================================================
                        console.log("\uD83D\uDD04 [FLOW_GENERATOR] Parse falhou, pedindo para tentar novamente...");
                        return [2 /*return*/, res.json({
                                needsConfirmation: true,
                                confirmationMessage: "Quase l\u00E1! Estou finalizando a cria\u00E7\u00E3o do seu fluxo. Por favor, envie sua solicita\u00E7\u00E3o novamente para que eu possa concluir: \"".concat(message_1, "\""),
                                message: "Por favor, repita: ".concat(message_1)
                            })];
                    }
                    // ============================================================
                    // VERIFICAR SE A IA PRECISA DE CONFIRMAÇÃO
                    // ============================================================
                    if (parsedResponse_1.needsConfirmation === true) {
                        console.log("\u2753 [FLOW_GENERATOR] IA pediu confirma\u00E7\u00E3o: ".concat(parsedResponse_1.confirmationMessage || parsedResponse_1.message));
                        return [2 /*return*/, res.json({
                                needsConfirmation: true,
                                confirmationMessage: parsedResponse_1.confirmationMessage || parsedResponse_1.message,
                                message: parsedResponse_1.message || parsedResponse_1.confirmationMessage
                            })];
                    }
                    console.log("\u2705 [FLOW_GENERATOR] Fluxo gerado com ".concat(((_u = (_t = parsedResponse_1.flow) === null || _t === void 0 ? void 0 : _t.nodes) === null || _u === void 0 ? void 0 : _u.length) || 0, " n\u00F3s"));
                    console.log("\uD83D\uDCCB [FLOW_GENERATOR] Config recebido: ".concat(JSON.stringify(parsedResponse_1.config || 'NENHUM')));
                    // ============================================================
                    // AUTO-REVISÃO: Verificar e corrigir o fluxo gerado
                    // ============================================================
                    if (((_w = (_v = parsedResponse_1.flow) === null || _v === void 0 ? void 0 : _v.nodes) === null || _w === void 0 ? void 0 : _w.length) > 0) {
                        console.log("\uD83D\uDD0D [FLOW_GENERATOR] Iniciando auto-revis\u00E3o do fluxo...");
                        nodes = parsedResponse_1.flow.nodes;
                        corrections = 0;
                        declaredVariables = new Set();
                        usedVariables = new Set();
                        // Primeira passagem: identificar todas as variáveis declaradas
                        for (_i = 0, nodes_4 = nodes; _i < nodes_4.length; _i++) {
                            node = nodes_4[_i];
                            content = node.content || {};
                            // Input nodes - variable_name
                            if (node.node_type === 'input' && content.variable_name) {
                                declaredVariables.add(content.variable_name);
                            }
                            // Buttons com save_variable
                            if (content.buttons && Array.isArray(content.buttons)) {
                                for (_b = 0, _c = content.buttons; _b < _c.length; _b++) {
                                    btn = _c[_b];
                                    if (btn.save_variable) {
                                        declaredVariables.add(btn.save_variable);
                                    }
                                }
                            }
                            // Lists com save_variable
                            if (content.sections && Array.isArray(content.sections)) {
                                for (_d = 0, _e = content.sections; _d < _e.length; _d++) {
                                    section = _e[_d];
                                    if (section.rows && Array.isArray(section.rows)) {
                                        for (_f = 0, _g = section.rows; _f < _g.length; _f++) {
                                            row = _g[_f];
                                            if (row.save_variable) {
                                                declaredVariables.add(row.save_variable);
                                            }
                                        }
                                    }
                                }
                            }
                            // set_variable nodes
                            if (node.node_type === 'set_variable' && content.variable) {
                                declaredVariables.add(content.variable);
                            }
                        }
                        console.log("\uD83D\uDCCB [AUTO-REVISAO] Vari\u00E1veis declaradas: ".concat(Array.from(declaredVariables).join(', ')));
                        // Segunda passagem: verificar uso de variáveis e corrigir problemas
                        for (_h = 0, nodes_5 = nodes; _h < nodes_5.length; _h++) {
                            node = nodes_5[_h];
                            content = node.content || {};
                            // Verificar mensagens que usam variáveis {{var}}
                            if (content.text && typeof content.text === 'string') {
                                matches = content.text.match(/\{\{(\w+)\}\}/g);
                                if (matches) {
                                    for (_j = 0, matches_1 = matches; _j < matches_1.length; _j++) {
                                        match = matches_1[_j];
                                        varName = match.replace(/\{\{|\}\}/g, '');
                                        usedVariables.add(varName);
                                    }
                                }
                            }
                            // AUTO-CORREÇÃO 1: Botões de escolha sem save_variable
                            // Se um botão leva a um nó de coleta de dados ou confirmação, provavelmente deveria salvar a escolha
                            if (content.buttons && Array.isArray(content.buttons)) {
                                bodyLower = (content.body || '').toLowerCase();
                                shouldSave = bodyLower.includes('forma de pagamento') ||
                                    bodyLower.includes('escolha') ||
                                    bodyLower.includes('selecione') ||
                                    bodyLower.includes('como prefere') ||
                                    bodyLower.includes('horário') ||
                                    bodyLower.includes('tipo de');
                                if (shouldSave) {
                                    varName = 'escolha';
                                    if (bodyLower.includes('pagamento'))
                                        varName = 'pagamento';
                                    else if (bodyLower.includes('horário') || bodyLower.includes('hora'))
                                        varName = 'horario';
                                    else if (bodyLower.includes('serviço'))
                                        varName = 'servico';
                                    else if (bodyLower.includes('tamanho'))
                                        varName = 'tamanho';
                                    for (_k = 0, _l = content.buttons; _k < _l.length; _k++) {
                                        btn = _l[_k];
                                        if (!btn.save_variable && btn.next_node) {
                                            btn.save_variable = varName;
                                            corrections++;
                                            console.log("\uD83D\uDD27 [AUTO-REVISAO] Adicionado save_variable=\"".concat(varName, "\" ao bot\u00E3o \"").concat(btn.title, "\""));
                                        }
                                    }
                                }
                            }
                            // AUTO-CORREÇÃO 2: Listas sem save_variable que deveriam ter
                            if (content.sections && Array.isArray(content.sections)) {
                                bodyLower = (content.body || '').toLowerCase();
                                shouldSave = bodyLower.includes('escolha') ||
                                    bodyLower.includes('selecione') ||
                                    bodyLower.includes('cardápio') ||
                                    bodyLower.includes('menu') ||
                                    bodyLower.includes('serviço') ||
                                    bodyLower.includes('produto');
                                if (shouldSave) {
                                    varName = 'pedido';
                                    if (bodyLower.includes('serviço'))
                                        varName = 'servico';
                                    else if (bodyLower.includes('profissional'))
                                        varName = 'profissional';
                                    for (_m = 0, _o = content.sections; _m < _o.length; _m++) {
                                        section = _o[_m];
                                        if (section.rows && Array.isArray(section.rows)) {
                                            for (_p = 0, _q = section.rows; _p < _q.length; _p++) {
                                                row = _q[_p];
                                                if (!row.save_variable && row.next_node) {
                                                    row.save_variable = varName;
                                                    corrections++;
                                                    console.log("\uD83D\uDD27 [AUTO-REVISAO] Adicionado save_variable=\"".concat(varName, "\" ao item \"").concat(row.title, "\""));
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        // Verificar variáveis usadas mas não declaradas
                        for (_r = 0, usedVariables_1 = usedVariables; _r < usedVariables_1.length; _r++) {
                            usedVar = usedVariables_1[_r];
                            if (!declaredVariables.has(usedVar)) {
                                console.log("\u26A0\uFE0F [AUTO-REVISAO] Vari\u00E1vel {{".concat(usedVar, "}} usada mas n\u00E3o declarada"));
                            }
                        }
                        console.log("\u2705 [AUTO-REVISAO] Revis\u00E3o completa. ".concat(corrections, " corre\u00E7\u00F5es aplicadas."));
                        // Atualizar os nós no parsedResponse
                        parsedResponse_1.flow.nodes = nodes;
                    }
                    if (!(!parsedResponse_1.config && !isDefinitelyEdit)) return [3 /*break*/, 13];
                    console.log("\u26A0\uFE0F [FLOW_GENERATOR] IA n\u00E3o retornou config. Fazendo chamadas adicionais at\u00E9 obter o config...");
                    cleanMessage = message_1
                        .replace(/^(Criar novo fluxo do zero:\s*)/i, '')
                        .replace(/^(Criar novo fluxo:\s*)/i, '')
                        .replace(/^(Novo fluxo:\s*)/i, '')
                        .trim();
                    maxAttempts = 3;
                    attempt = 1;
                    _1.label = 7;
                case 7:
                    if (!(attempt <= maxAttempts && !parsedResponse_1.config)) return [3 /*break*/, 12];
                    console.log("\uD83D\uDD04 [FLOW_GENERATOR] Tentativa ".concat(attempt, "/").concat(maxAttempts, " para obter config da IA..."));
                    configPrompt = "\nTAREFA CR\u00CDTICA: Extrair configura\u00E7\u00E3o do chatbot.\n\nSolicita\u00E7\u00E3o original do usu\u00E1rio:\n\"".concat(cleanMessage, "\"\n\nVoc\u00EA DEVE retornar um JSON v\u00E1lido com a configura\u00E7\u00E3o do chatbot.\n\nFORMATO OBRIGAT\u00D3RIO (copie e preencha):\n{\n  \"config\": {\n    \"name\": \"[NOME EXATO DO NEG\u00D3CIO DA MENSAGEM]\",\n    \"welcome_message\": \"[BOAS-VINDAS PERSONALIZADA COM NOME E EMOJIS]\",\n    \"fallback_message\": \"[MENSAGEM PARA QUANDO N\u00C3O ENTENDER]\",\n    \"goodbye_message\": \"[DESPEDIDA COM NOME DO NEG\u00D3CIO E EMOJIS]\"\n  }\n}\n\nEXEMPLOS:\n- Se a mensagem menciona \"Loja de Roupas Fashion Style\", o name deve ser exatamente \"Loja de Roupas Fashion Style\"\n- Se a mensagem menciona \"Cl\u00EDnica M\u00E9dica Sa\u00FAde Total\", o name deve ser exatamente \"Cl\u00EDnica M\u00E9dica Sa\u00FAde Total\"\n\nRESPONDA APENAS COM O JSON, NADA MAIS.");
                    _1.label = 8;
                case 8:
                    _1.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, chatComplete_1({
                            model: 'mistral-medium-latest',
                            messages: [{ role: 'user', content: configPrompt }],
                            temperature: 0.1,
                            maxTokens: 600,
                        })];
                case 9:
                    configResponse = _1.sent();
                    configContent = ((_z = (_y = (_x = configResponse === null || configResponse === void 0 ? void 0 : configResponse.choices) === null || _x === void 0 ? void 0 : _x[0]) === null || _y === void 0 ? void 0 : _y.message) === null || _z === void 0 ? void 0 : _z.content) || '';
                    console.log("\uD83D\uDCDD [FLOW_GENERATOR] Tentativa ".concat(attempt, " - Resposta: ").concat(configContent.substring(0, 300), "..."));
                    jsonMatch = configContent.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            configJson = JSON.parse(jsonMatch[0]);
                            if (configJson.config && configJson.config.name) {
                                parsedResponse_1.config = configJson.config;
                                console.log("\u2705 [FLOW_GENERATOR] Config obtido na tentativa ".concat(attempt, ": \"").concat(parsedResponse_1.config.name, "\""));
                                return [3 /*break*/, 12];
                            }
                        }
                        catch (parseErr) {
                            console.log("\u26A0\uFE0F [FLOW_GENERATOR] Tentativa ".concat(attempt, " - Erro ao parsear JSON: ").concat(parseErr));
                        }
                    }
                    return [3 /*break*/, 11];
                case 10:
                    configError_1 = _1.sent();
                    console.log("\u274C [FLOW_GENERATOR] Tentativa ".concat(attempt, " - Erro na chamada: ").concat(configError_1));
                    return [3 /*break*/, 11];
                case 11:
                    attempt++;
                    return [3 /*break*/, 7];
                case 12:
                    // Se após todas as tentativas ainda não tem config, lança erro
                    if (!parsedResponse_1.config) {
                        console.log("\u274C [FLOW_GENERATOR] FALHA CR\u00CDTICA: N\u00E3o foi poss\u00EDvel obter config ap\u00F3s ".concat(maxAttempts, " tentativas"));
                        throw new Error('Não foi possível gerar a configuração do chatbot. Por favor, tente novamente com uma descrição mais detalhada do seu negócio.');
                    }
                    _1.label = 13;
                case 13:
                    _1.trys.push([13, 22, , 23]);
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_60 || (templateObject_60 = __makeTemplateObject(["\n            SELECT id FROM chatbot_configs WHERE user_id = ", "\n          "], ["\n            SELECT id FROM chatbot_configs WHERE user_id = ", "\n          "])), userId_19))];
                            });
                        }); })];
                case 14:
                    configResult = _1.sent();
                    if (!(configResult.rows.length === 0)) return [3 /*break*/, 16];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            var _a, _b, _c, _d;
                            return __generator(this, function (_e) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_61 || (templateObject_61 = __makeTemplateObject(["\n              INSERT INTO chatbot_configs (user_id, name, welcome_message, fallback_message, goodbye_message)\n              VALUES (\n                ", ", \n                ", ",\n                ", ",\n                ", ",\n                ", "\n              )\n              RETURNING id\n            "], ["\n              INSERT INTO chatbot_configs (user_id, name, welcome_message, fallback_message, goodbye_message)\n              VALUES (\n                ", ", \n                ", ",\n                ", ",\n                ", ",\n                ", "\n              )\n              RETURNING id\n            "])), userId_19, ((_a = parsedResponse_1.config) === null || _a === void 0 ? void 0 : _a.name) || 'Meu Robô', ((_b = parsedResponse_1.config) === null || _b === void 0 ? void 0 : _b.welcome_message) || null, ((_c = parsedResponse_1.config) === null || _c === void 0 ? void 0 : _c.fallback_message) || null, ((_d = parsedResponse_1.config) === null || _d === void 0 ? void 0 : _d.goodbye_message) || null))];
                            });
                        }); })];
                case 15:
                    newConfig = _1.sent();
                    chatbotId_8 = newConfig.rows[0].id;
                    return [3 /*break*/, 18];
                case 16:
                    chatbotId_8 = configResult.rows[0].id;
                    if (!parsedResponse_1.config) return [3 /*break*/, 18];
                    console.log("\uD83D\uDD04 [FLOW_GENERATOR] Atualizando config existente com nome: ".concat(parsedResponse_1.config.name));
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_62 || (templateObject_62 = __makeTemplateObject(["\n                UPDATE chatbot_configs \n                SET \n                  name = COALESCE(", ", name),\n                  welcome_message = COALESCE(", ", welcome_message),\n                  fallback_message = COALESCE(", ", fallback_message),\n                  goodbye_message = COALESCE(", ", goodbye_message),\n                  updated_at = NOW()\n                WHERE id = ", "\n              "], ["\n                UPDATE chatbot_configs \n                SET \n                  name = COALESCE(", ", name),\n                  welcome_message = COALESCE(", ", welcome_message),\n                  fallback_message = COALESCE(", ", fallback_message),\n                  goodbye_message = COALESCE(", ", goodbye_message),\n                  updated_at = NOW()\n                WHERE id = ", "\n              "])), parsedResponse_1.config.name, parsedResponse_1.config.welcome_message, parsedResponse_1.config.fallback_message, parsedResponse_1.config.goodbye_message, chatbotId_8))];
                            });
                        }); })];
                case 17:
                    _1.sent();
                    _1.label = 18;
                case 18: return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_63 || (templateObject_63 = __makeTemplateObject(["\n            SELECT COALESCE(MAX(version_number), 0) + 1 as next_version\n            FROM chatbot_flow_versions\n            WHERE chatbot_id = ", "\n          "], ["\n            SELECT COALESCE(MAX(version_number), 0) + 1 as next_version\n            FROM chatbot_flow_versions\n            WHERE chatbot_id = ", "\n          "])), chatbotId_8))];
                        });
                    }); })];
                case 19:
                    versionResult = _1.sent();
                    nextVersion_1 = versionResult.rows[0].next_version || 1;
                    // Marcar versões anteriores como não-atuais
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_64 || (templateObject_64 = __makeTemplateObject(["\n            UPDATE chatbot_flow_versions\n            SET is_current = false\n            WHERE chatbot_id = ", " AND is_current = true\n          "], ["\n            UPDATE chatbot_flow_versions\n            SET is_current = false\n            WHERE chatbot_id = ", " AND is_current = true\n          "])), chatbotId_8))];
                            });
                        }); })];
                case 20:
                    // Marcar versões anteriores como não-atuais
                    _1.sent();
                    versionName_1 = ((_0 = parsedResponse_1.config) === null || _0 === void 0 ? void 0 : _0.name) || 'Fluxo Gerado por IA';
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            var _a, _b, _c, _d;
                            return __generator(this, function (_e) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_65 || (templateObject_65 = __makeTemplateObject(["\n            INSERT INTO chatbot_flow_versions (\n              chatbot_id, user_id, version_number, name,\n              config_snapshot, nodes_snapshot, connections_snapshot,\n              edit_type, edit_summary, edit_details, is_current\n            ) VALUES (\n              ", ", ", ", ", ", ", ",\n              ", "::jsonb,\n              ", "::jsonb,\n              ", "::jsonb,\n              'ai_generate',\n              ", ",\n              ", "::jsonb,\n              true\n            )\n          "], ["\n            INSERT INTO chatbot_flow_versions (\n              chatbot_id, user_id, version_number, name,\n              config_snapshot, nodes_snapshot, connections_snapshot,\n              edit_type, edit_summary, edit_details, is_current\n            ) VALUES (\n              ", ", ", ", ", ", ", ",\n              ", "::jsonb,\n              ", "::jsonb,\n              ", "::jsonb,\n              'ai_generate',\n              ", ",\n              ", "::jsonb,\n              true\n            )\n          "])), chatbotId_8, userId_19, nextVersion_1, versionName_1, JSON.stringify(parsedResponse_1.config || {}), JSON.stringify(((_a = parsedResponse_1.flow) === null || _a === void 0 ? void 0 : _a.nodes) || []), JSON.stringify([]), "Fluxo gerado via IA: ".concat(((_b = parsedResponse_1.message) === null || _b === void 0 ? void 0 : _b.substring(0, 100)) || 'Novo fluxo'), JSON.stringify({ original_message: message_1.substring(0, 500), nodes_count: ((_d = (_c = parsedResponse_1.flow) === null || _c === void 0 ? void 0 : _c.nodes) === null || _d === void 0 ? void 0 : _d.length) || 0 })))];
                            });
                        }); })];
                case 21:
                    _1.sent();
                    console.log("\uD83D\uDCC1 [FLOW_GENERATOR] Vers\u00E3o ".concat(nextVersion_1, " salva automaticamente"));
                    return [3 /*break*/, 23];
                case 22:
                    saveError_1 = _1.sent();
                    console.error('[FLOW_GENERATOR] Erro ao auto-salvar versão:', saveError_1);
                    return [3 /*break*/, 23];
                case 23:
                    res.json(parsedResponse_1);
                    return [3 /*break*/, 25];
                case 24:
                    error_21 = _1.sent();
                    console.error('[FLOW_GENERATOR] Erro ao gerar fluxo:', error_21);
                    res.status(500).json({ error: "Erro ao gerar fluxo", details: error_21.message });
                    return [3 /*break*/, 25];
                case 25: return [2 /*return*/];
            }
        });
    }); });
    // ============================================================
    // HISTÓRICO DE VERSÕES DO FLUXO
    // ============================================================
    // Listar todas as versões do fluxo
    app.get("/api/chatbot/flow-versions", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_20, result, error_22;
        var _this = this;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId_20 = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    if (!userId_20) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_66 || (templateObject_66 = __makeTemplateObject(["\n          SELECT \n            v.id, v.version_number, v.edit_type, v.edit_summary, \n            v.is_current, v.created_at,\n            jsonb_array_length(v.nodes_snapshot) as nodes_count\n          FROM chatbot_flow_versions v\n          JOIN chatbot_configs c ON v.chatbot_id = c.id\n          WHERE c.user_id = ", "\n          ORDER BY v.version_number DESC\n          LIMIT 50\n        "], ["\n          SELECT \n            v.id, v.version_number, v.edit_type, v.edit_summary, \n            v.is_current, v.created_at,\n            jsonb_array_length(v.nodes_snapshot) as nodes_count\n          FROM chatbot_flow_versions v\n          JOIN chatbot_configs c ON v.chatbot_id = c.id\n          WHERE c.user_id = ", "\n          ORDER BY v.version_number DESC\n          LIMIT 50\n        "])), userId_20))];
                            });
                        }); })];
                case 1:
                    result = _b.sent();
                    res.json(result.rows);
                    return [3 /*break*/, 3];
                case 2:
                    error_22 = _b.sent();
                    console.error('[CHATBOT_FLOW] Erro ao listar versões:', error_22);
                    res.status(500).json({ error: "Erro ao listar versões" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // Obter detalhes de uma versão específica
    app.get("/api/chatbot/flow-versions/:versionId", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_21, versionId_1, result, error_23;
        var _this = this;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId_21 = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    if (!userId_21) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    versionId_1 = req.params.versionId;
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_67 || (templateObject_67 = __makeTemplateObject(["\n          SELECT v.*\n          FROM chatbot_flow_versions v\n          JOIN chatbot_configs c ON v.chatbot_id = c.id\n          WHERE c.user_id = ", " AND v.id = ", "\n        "], ["\n          SELECT v.*\n          FROM chatbot_flow_versions v\n          JOIN chatbot_configs c ON v.chatbot_id = c.id\n          WHERE c.user_id = ", " AND v.id = ", "\n        "])), userId_21, versionId_1))];
                            });
                        }); })];
                case 1:
                    result = _b.sent();
                    if (result.rows.length === 0) {
                        return [2 /*return*/, res.status(404).json({ error: "Versão não encontrada" })];
                    }
                    res.json(result.rows[0]);
                    return [3 /*break*/, 3];
                case 2:
                    error_23 = _b.sent();
                    console.error('[CHATBOT_FLOW] Erro ao buscar versão:', error_23);
                    res.status(500).json({ error: "Erro ao buscar versão" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // Restaurar uma versão anterior
    app.post("/api/chatbot/flow-versions/:versionId/restore", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_22, versionId_2, versionResult, version_1, chatbotId_9, nodes_7, _loop_8, _i, nodes_6, node, connections_4, _loop_9, _a, connections_3, conn, config_3, nextVersionResult, nextVersion_2, restoreName_1, error_24;
        var _this = this;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 17, , 18]);
                    userId_22 = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
                    if (!userId_22) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    versionId_2 = req.params.versionId;
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_68 || (templateObject_68 = __makeTemplateObject(["\n          SELECT v.*, c.id as chatbot_id\n          FROM chatbot_flow_versions v\n          JOIN chatbot_configs c ON v.chatbot_id = c.id\n          WHERE c.user_id = ", " AND v.id = ", "\n        "], ["\n          SELECT v.*, c.id as chatbot_id\n          FROM chatbot_flow_versions v\n          JOIN chatbot_configs c ON v.chatbot_id = c.id\n          WHERE c.user_id = ", " AND v.id = ", "\n        "])), userId_22, versionId_2))];
                            });
                        }); })];
                case 1:
                    versionResult = _c.sent();
                    if (versionResult.rows.length === 0) {
                        return [2 /*return*/, res.status(404).json({ error: "Versão não encontrada" })];
                    }
                    version_1 = versionResult.rows[0];
                    chatbotId_9 = version_1.chatbot_id;
                    // Deletar nós e conexões atuais
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_69 || (templateObject_69 = __makeTemplateObject(["\n          DELETE FROM chatbot_flow_connections WHERE chatbot_id = ", "\n        "], ["\n          DELETE FROM chatbot_flow_connections WHERE chatbot_id = ", "\n        "])), chatbotId_9))];
                            });
                        }); })];
                case 2:
                    // Deletar nós e conexões atuais
                    _c.sent();
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_70 || (templateObject_70 = __makeTemplateObject(["\n          DELETE FROM chatbot_flow_nodes WHERE chatbot_id = ", "\n        "], ["\n          DELETE FROM chatbot_flow_nodes WHERE chatbot_id = ", "\n        "])), chatbotId_9))];
                            });
                        }); })];
                case 3:
                    _c.sent();
                    nodes_7 = version_1.nodes_snapshot || [];
                    _loop_8 = function (node) {
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0: return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                                        var _a, _b, _c;
                                        return __generator(this, function (_d) {
                                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_71 || (templateObject_71 = __makeTemplateObject(["\n            INSERT INTO chatbot_flow_nodes (\n              chatbot_id, node_id, name, node_type, content,\n              next_node_id, position_x, position_y, display_order\n            ) VALUES (\n              ", ", ", ", ", ", ", ",\n              ", "::jsonb, ", ",\n              ", ", ", ", ", "\n            )\n          "], ["\n            INSERT INTO chatbot_flow_nodes (\n              chatbot_id, node_id, name, node_type, content,\n              next_node_id, position_x, position_y, display_order\n            ) VALUES (\n              ", ", ", ", ", ", ", ",\n              ", "::jsonb, ", ",\n              ", ", ", ", ", "\n            )\n          "])), chatbotId_9, node.node_id, node.name, node.node_type, JSON.stringify(node.content || {}), node.next_node_id || null, (_a = node.position_x) !== null && _a !== void 0 ? _a : 0, (_b = node.position_y) !== null && _b !== void 0 ? _b : 0, (_c = node.display_order) !== null && _c !== void 0 ? _c : 0))];
                                        });
                                    }); })];
                                case 1:
                                    _d.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, nodes_6 = nodes_7;
                    _c.label = 4;
                case 4:
                    if (!(_i < nodes_6.length)) return [3 /*break*/, 7];
                    node = nodes_6[_i];
                    return [5 /*yield**/, _loop_8(node)];
                case 5:
                    _c.sent();
                    _c.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7:
                    connections_4 = version_1.connections_snapshot || [];
                    _loop_9 = function (conn) {
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0: return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                                        return __generator(this, function (_a) {
                                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_72 || (templateObject_72 = __makeTemplateObject(["\n            INSERT INTO chatbot_flow_connections (\n              chatbot_id, from_node_id, to_node_id, condition_type, condition_value\n            ) VALUES (\n              ", ", ", ", ", ",\n              ", ", ", "\n            )\n          "], ["\n            INSERT INTO chatbot_flow_connections (\n              chatbot_id, from_node_id, to_node_id, condition_type, condition_value\n            ) VALUES (\n              ", ", ", ", ", ",\n              ", ", ", "\n            )\n          "])), chatbotId_9, conn.from_node_id, conn.to_node_id, conn.condition_type || null, conn.condition_value || null))];
                                        });
                                    }); })];
                                case 1:
                                    _e.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _a = 0, connections_3 = connections_4;
                    _c.label = 8;
                case 8:
                    if (!(_a < connections_3.length)) return [3 /*break*/, 11];
                    conn = connections_3[_a];
                    return [5 /*yield**/, _loop_9(conn)];
                case 9:
                    _c.sent();
                    _c.label = 10;
                case 10:
                    _a++;
                    return [3 /*break*/, 8];
                case 11:
                    config_3 = version_1.config_snapshot || {};
                    if (!config_3.name) return [3 /*break*/, 13];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_73 || (templateObject_73 = __makeTemplateObject(["\n            UPDATE chatbot_configs SET\n              name = ", ",\n              welcome_message = ", ",\n              fallback_message = ", ",\n              goodbye_message = ", ",\n              updated_at = now()\n            WHERE id = ", "\n          "], ["\n            UPDATE chatbot_configs SET\n              name = ", ",\n              welcome_message = ", ",\n              fallback_message = ", ",\n              goodbye_message = ", ",\n              updated_at = now()\n            WHERE id = ", "\n          "])), config_3.name, config_3.welcome_message || null, config_3.fallback_message || null, config_3.goodbye_message || null, chatbotId_9))];
                            });
                        }); })];
                case 12:
                    _c.sent();
                    _c.label = 13;
                case 13: return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_74 || (templateObject_74 = __makeTemplateObject(["\n          SELECT COALESCE(MAX(version_number), 0) + 1 as next_version\n          FROM chatbot_flow_versions\n          WHERE chatbot_id = ", "\n        "], ["\n          SELECT COALESCE(MAX(version_number), 0) + 1 as next_version\n          FROM chatbot_flow_versions\n          WHERE chatbot_id = ", "\n        "])), chatbotId_9))];
                        });
                    }); })];
                case 14:
                    nextVersionResult = _c.sent();
                    nextVersion_2 = nextVersionResult.rows[0].next_version || 1;
                    // Marcar versões anteriores como não-atuais
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_75 || (templateObject_75 = __makeTemplateObject(["\n          UPDATE chatbot_flow_versions\n          SET is_current = false\n          WHERE chatbot_id = ", " AND is_current = true\n        "], ["\n          UPDATE chatbot_flow_versions\n          SET is_current = false\n          WHERE chatbot_id = ", " AND is_current = true\n        "])), chatbotId_9))];
                            });
                        }); })];
                case 15:
                    // Marcar versões anteriores como não-atuais
                    _c.sent();
                    restoreName_1 = (config_3 === null || config_3 === void 0 ? void 0 : config_3.name) || "Fluxo Restaurado v".concat(nextVersion_2);
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_76 || (templateObject_76 = __makeTemplateObject(["\n          INSERT INTO chatbot_flow_versions (\n            chatbot_id, user_id, version_number, name,\n            config_snapshot, nodes_snapshot, connections_snapshot,\n            edit_type, edit_summary, edit_details, is_current\n          ) VALUES (\n            ", ", ", ", ", ", ", ",\n            ", "::jsonb,\n            ", "::jsonb,\n            ", "::jsonb,\n            'restore',\n            ", ",\n            ", "::jsonb,\n            true\n          )\n        "], ["\n          INSERT INTO chatbot_flow_versions (\n            chatbot_id, user_id, version_number, name,\n            config_snapshot, nodes_snapshot, connections_snapshot,\n            edit_type, edit_summary, edit_details, is_current\n          ) VALUES (\n            ", ", ", ", ", ", ", ",\n            ", "::jsonb,\n            ", "::jsonb,\n            ", "::jsonb,\n            'restore',\n            ", ",\n            ", "::jsonb,\n            true\n          )\n        "])), chatbotId_9, userId_22, nextVersion_2, restoreName_1, JSON.stringify(config_3), JSON.stringify(nodes_7), JSON.stringify(connections_4), "Restaurado da vers\u00E3o ".concat(version_1.version_number), JSON.stringify({ restored_from_version: version_1.version_number, restored_from_id: versionId_2 })))];
                            });
                        }); })];
                case 16:
                    _c.sent();
                    console.log("\u2705 [CHATBOT_FLOW] Vers\u00E3o ".concat(version_1.version_number, " restaurada como vers\u00E3o ").concat(nextVersion_2));
                    res.json({
                        success: true,
                        message: "Vers\u00E3o ".concat(version_1.version_number, " restaurada com sucesso"),
                        new_version: nextVersion_2,
                        nodes_count: nodes_7.length
                    });
                    return [3 /*break*/, 18];
                case 17:
                    error_24 = _c.sent();
                    console.error('[CHATBOT_FLOW] Erro ao restaurar versão:', error_24);
                    res.status(500).json({ error: "Erro ao restaurar versão" });
                    return [3 /*break*/, 18];
                case 18: return [2 /*return*/];
            }
        });
    }); });
    // ============================================================
    // EDIÇÃO DO FLUXO VIA CHAT IA
    // ============================================================
    // Editar fluxo existente via chat (adicionar, remover, modificar)
    app.post("/api/chatbot/edit-flow-chat", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_23, _a, message_2, currentNodes_1, currentConfig_1, editSystemPrompt, editUserPrompt, chatComplete, llmResponse, aiResponse, cleanResponse, jsonMatch, parsedResponse_2, configResult, chatbotId_10, versionResult, nextVersion_3, editName_1, error_25;
        var _this = this;
        var _b, _c, _d, _e, _f, _g, _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0:
                    _j.trys.push([0, 8, , 9]);
                    userId_23 = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
                    if (!userId_23) {
                        return [2 /*return*/, res.status(401).json({ error: "Usuário não autenticado" })];
                    }
                    _a = req.body, message_2 = _a.message, currentNodes_1 = _a.currentNodes, currentConfig_1 = _a.currentConfig;
                    if (!message_2) {
                        return [2 /*return*/, res.status(400).json({ error: "Mensagem é obrigatória" })];
                    }
                    if (!currentNodes_1 || currentNodes_1.length === 0) {
                        return [2 /*return*/, res.status(400).json({ error: "Fluxo atual é necessário para edição" })];
                    }
                    console.log("\u270F\uFE0F [FLOW_EDITOR] Editando fluxo para usu\u00E1rio ".concat(userId_23));
                    console.log("\uD83D\uDCDD Comando: ".concat(message_2.substring(0, 200), "..."));
                    editSystemPrompt = "Voc\u00EA \u00E9 um especialista em EDITAR fluxos de chatbot para WhatsApp.\n\nVOC\u00CA RECEBE UM FLUXO EXISTENTE E DEVE MODIFIC\u00C1-LO conforme a solicita\u00E7\u00E3o do usu\u00E1rio.\n\nOPERA\u00C7\u00D5ES QUE VOC\u00CA PODE FAZER:\n1. ADICIONAR novos itens (produtos, servi\u00E7os, op\u00E7\u00F5es)\n2. REMOVER itens existentes\n3. MODIFICAR textos, pre\u00E7os, descri\u00E7\u00F5es\n4. REORGANIZAR ordem dos itens\n5. ADICIONAR novos n\u00F3s ao fluxo\n6. REMOVER n\u00F3s do fluxo\n7. MODIFICAR mensagens existentes\n\nREGRAS IMPORTANTES:\n- MANTENHA a estrutura geral do fluxo\n- N\u00C3O remova n\u00F3s importantes como start, end, transfer_human\n- PRESERVE os node_ids existentes quando poss\u00EDvel\n- Ao adicionar itens em lista, siga o padr\u00E3o dos itens existentes\n- Ao modificar pre\u00E7os, mantenha o formato (R$ XX,XX)\n- M\u00E1ximo 3 bot\u00F5es, m\u00E1ximo 10 itens por se\u00E7\u00E3o de lista\n\nFORMATO DA RESPOSTA:\n{\n  \"message\": \"Descri\u00E7\u00E3o clara do que foi alterado\",\n  \"changes_summary\": [\"Mudan\u00E7a 1\", \"Mudan\u00E7a 2\"],\n  \"flow\": {\n    \"nodes\": [... todos os n\u00F3s incluindo modifica\u00E7\u00F5es ...]\n  },\n  \"config\": {\n    \"name\": \"Nome do Chatbot\",\n    ...\n  }\n}\n\nEXEMPLOS DE SOLICITA\u00C7\u00D5ES:\n- \"Adicione uma pizza de pepperoni no card\u00E1pio por R$ 52,00\" \u2192 Adicionar na lista de pizzas\n- \"Remova a op\u00E7\u00E3o de promo\u00E7\u00F5es\" \u2192 Remover n\u00F3 de promo\u00E7\u00F5es e refer\u00EAncias\n- \"Mude o pre\u00E7o da Margherita para R$ 48,00\" \u2192 Modificar descri\u00E7\u00E3o do item\n- \"Adicione mais 5 sabores de pizza\" \u2192 Expandir lista de pizzas\n- \"Troque a mensagem de boas-vindas\" \u2192 Modificar texto do n\u00F3 de welcome";
                    editUserPrompt = "FLUXO ATUAL (modifique conforme solicitado):\n".concat(JSON.stringify(currentNodes_1, null, 2), "\n\nCONFIGURA\u00C7\u00C3O ATUAL:\n").concat(JSON.stringify(currentConfig_1 || {}, null, 2), "\n\nSOLICITA\u00C7\u00C3O DE EDI\u00C7\u00C3O:\n").concat(message_2, "\n\nIMPORTANTE:\n- Retorne o fluxo COMPLETO com as modifica\u00E7\u00F5es aplicadas\n- Preserve os node_ids existentes\n- Retorne APENAS JSON v\u00E1lido");
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./llm'); })];
                case 1:
                    chatComplete = (_j.sent()).chatComplete;
                    return [4 /*yield*/, chatComplete({
                            messages: [
                                { role: 'system', content: editSystemPrompt },
                                { role: 'user', content: editUserPrompt }
                            ],
                            temperature: 0.2, // Mais baixo para edições precisas
                            maxTokens: 8000
                        })];
                case 2:
                    llmResponse = _j.sent();
                    aiResponse = ((_e = (_d = (_c = llmResponse.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content) || null;
                    if (!aiResponse) {
                        throw new Error('Resposta vazia da IA');
                    }
                    cleanResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        throw new Error('JSON não encontrado na resposta');
                    }
                    parsedResponse_2 = JSON.parse(jsonMatch[0]);
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_77 || (templateObject_77 = __makeTemplateObject(["\n          SELECT id FROM chatbot_configs WHERE user_id = ", "\n        "], ["\n          SELECT id FROM chatbot_configs WHERE user_id = ", "\n        "])), userId_23))];
                            });
                        }); })];
                case 3:
                    configResult = _j.sent();
                    chatbotId_10 = (_f = configResult.rows[0]) === null || _f === void 0 ? void 0 : _f.id;
                    if (!chatbotId_10) return [3 /*break*/, 7];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_78 || (templateObject_78 = __makeTemplateObject(["\n            SELECT COALESCE(MAX(version_number), 0) + 1 as next_version\n            FROM chatbot_flow_versions\n            WHERE chatbot_id = ", "\n          "], ["\n            SELECT COALESCE(MAX(version_number), 0) + 1 as next_version\n            FROM chatbot_flow_versions\n            WHERE chatbot_id = ", "\n          "])), chatbotId_10))];
                            });
                        }); })];
                case 4:
                    versionResult = _j.sent();
                    nextVersion_3 = versionResult.rows[0].next_version || 1;
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_79 || (templateObject_79 = __makeTemplateObject(["\n            UPDATE chatbot_flow_versions\n            SET is_current = false\n            WHERE chatbot_id = ", " AND is_current = true\n          "], ["\n            UPDATE chatbot_flow_versions\n            SET is_current = false\n            WHERE chatbot_id = ", " AND is_current = true\n          "])), chatbotId_10))];
                            });
                        }); })];
                case 5:
                    _j.sent();
                    editName_1 = ((_g = parsedResponse_2.config) === null || _g === void 0 ? void 0 : _g.name) || (currentConfig_1 === null || currentConfig_1 === void 0 ? void 0 : currentConfig_1.name) || "Fluxo Editado v".concat(nextVersion_3);
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            var _a, _b, _c;
                            return __generator(this, function (_d) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_80 || (templateObject_80 = __makeTemplateObject(["\n            INSERT INTO chatbot_flow_versions (\n              chatbot_id, user_id, version_number, name,\n              config_snapshot, nodes_snapshot, connections_snapshot,\n              edit_type, edit_summary, edit_details, is_current\n            ) VALUES (\n              ", ", ", ", ", ", ", ",\n              ", "::jsonb,\n              ", "::jsonb,\n              ", "::jsonb,\n              'ai_chat',\n              ", ",\n              ", "::jsonb,\n              true\n            )\n          "], ["\n            INSERT INTO chatbot_flow_versions (\n              chatbot_id, user_id, version_number, name,\n              config_snapshot, nodes_snapshot, connections_snapshot,\n              edit_type, edit_summary, edit_details, is_current\n            ) VALUES (\n              ", ", ", ", ", ", ", ",\n              ", "::jsonb,\n              ", "::jsonb,\n              ", "::jsonb,\n              'ai_chat',\n              ", ",\n              ", "::jsonb,\n              true\n            )\n          "])), chatbotId_10, userId_23, nextVersion_3, editName_1, JSON.stringify(parsedResponse_2.config || currentConfig_1 || {}), JSON.stringify(((_a = parsedResponse_2.flow) === null || _a === void 0 ? void 0 : _a.nodes) || []), JSON.stringify([]), "Edi\u00E7\u00E3o via chat: ".concat(message_2.substring(0, 100)), JSON.stringify({
                                        edit_command: message_2.substring(0, 500),
                                        changes_summary: parsedResponse_2.changes_summary || [],
                                        nodes_before: currentNodes_1.length,
                                        nodes_after: ((_c = (_b = parsedResponse_2.flow) === null || _b === void 0 ? void 0 : _b.nodes) === null || _c === void 0 ? void 0 : _c.length) || 0
                                    })))];
                            });
                        }); })];
                case 6:
                    _j.sent();
                    console.log("\uD83D\uDCC1 [FLOW_EDITOR] Edi\u00E7\u00E3o salva como vers\u00E3o ".concat(nextVersion_3));
                    _j.label = 7;
                case 7:
                    console.log("\u2705 [FLOW_EDITOR] Fluxo editado: ".concat(((_h = parsedResponse_2.changes_summary) === null || _h === void 0 ? void 0 : _h.join(', ')) || 'Modificações aplicadas'));
                    res.json(parsedResponse_2);
                    return [3 /*break*/, 9];
                case 8:
                    error_25 = _j.sent();
                    console.error('[FLOW_EDITOR] Erro ao editar fluxo:', error_25);
                    res.status(500).json({ error: "Erro ao editar fluxo", details: error_25.message });
                    return [3 /*break*/, 9];
                case 9: return [2 /*return*/];
            }
        });
    }); });
    console.log('✅ [CHATBOT_FLOW] Rotas registradas com sucesso!');
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14, templateObject_15, templateObject_16, templateObject_17, templateObject_18, templateObject_19, templateObject_20, templateObject_21, templateObject_22, templateObject_23, templateObject_24, templateObject_25, templateObject_26, templateObject_27, templateObject_28, templateObject_29, templateObject_30, templateObject_31, templateObject_32, templateObject_33, templateObject_34, templateObject_35, templateObject_36, templateObject_37, templateObject_38, templateObject_39, templateObject_40, templateObject_41, templateObject_42, templateObject_43, templateObject_44, templateObject_45, templateObject_46, templateObject_47, templateObject_48, templateObject_49, templateObject_50, templateObject_51, templateObject_52, templateObject_53, templateObject_54, templateObject_55, templateObject_56, templateObject_57, templateObject_58, templateObject_59, templateObject_60, templateObject_61, templateObject_62, templateObject_63, templateObject_64, templateObject_65, templateObject_66, templateObject_67, templateObject_68, templateObject_69, templateObject_70, templateObject_71, templateObject_72, templateObject_73, templateObject_74, templateObject_75, templateObject_76, templateObject_77, templateObject_78, templateObject_79, templateObject_80;
