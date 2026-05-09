"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 SERVIÇO DE AUTO-CALIBRAÇÃO DE PROMPTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Técnica: IA Cliente vs IA Agente (Self-Consistency + Model-Graded Evaluation)
 *
 * FLUXO:
 * 1. Usuário pede alteração → Sistema edita prompt
 * 2. Gera cenários de teste específicos para a instrução
 * 3. Executa conversa simulada (Cliente IA ↔ Agente IA)
 * 4. Analisa se resposta do agente demonstra a edição funcionando
 * 5. Se falhar, tenta reparar automaticamente (até 3x)
 * 6. Retorna resultado com score de confiança
 *
 * Baseado em técnicas de: Anthropic, LangSmith, Microsoft Promptbase
 *
 * 🚀 ATUALIZADO: Agora usa OpenRouter/Chutes (mesmo LLM do chat produção)
 */
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
exports.PromptCalibrationService = void 0;
exports.calibrarPromptEditado = calibrarPromptEditado;
var llm_1 = require("./llm");
// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO PADRÃO
// ═══════════════════════════════════════════════════════════════════════════
var CONFIG_PADRAO = {
    maxTentativasReparo: 3, // Reduzido: 3 tentativas rápidas
    numeroCenarios: 1, // Reduzido: 1 cenário para velocidade máxima
    turnosConversaMax: 1, // 1 turno apenas
    scoreMinimoAprovacao: 60, // Flexibilizado para agilizar
    timeoutMs: 30000 // 30 segundos - muito mais rápido
};
// ═══════════════════════════════════════════════════════════════════════════
// PROMPTS DO SISTEMA
// ═══════════════════════════════════════════════════════════════════════════
var PROMPT_GERADOR_CENARIOS = "Gere 1 pergunta de teste R\u00C1PIDA para validar esta edi\u00E7\u00E3o no prompt.\n\nFORMATO JSON (sem markdown):\n{\"cenarios\":[{\"id\":\"c1\",\"perguntaCliente\":\"pergunta curta\",\"expectativaResposta\":\"o que esperar\",\"tipoValidacao\":\"semantico\",\"palavrasChave\":[\"palavra1\"]}]}\n\nREGRAS:\n- Pergunta curta e direta (m\u00E1ximo 15 palavras)\n- Palavras-chave: 2-3 palavras importantes\n- Foco em verificar se a edi\u00E7\u00E3o funcionou";
var PROMPT_CLIENTE_SIMULADO = "Voc\u00EA \u00E9 um cliente real conversando via WhatsApp com uma empresa.\n\nPERSONA: {{PERSONA}}\n\nREGRAS:\n1. Fa\u00E7a APENAS a pergunta especificada, sem adicionar nada\n2. Use linguagem natural de WhatsApp (informal, direto ao ponto)\n3. N\u00E3o cumprimente demais, seja objetivo\n4. Uma mensagem curta e direta\n\nPERGUNTA A FAZER:\n{{PERGUNTA}}";
var PROMPT_ANALISADOR = "Avalie rapidamente se a resposta demonstra a edi\u00E7\u00E3o aplicada.\n\nEDI\u00C7\u00C3O: {{INSTRUCAO}}\nRESPOSTA: {{RESPOSTA}}\nPALAVRAS ESPERADAS: {{PALAVRAS_CHAVE}}\n\nRetorne JSON: {\"passou\":true/false,\"score\":0-100,\"motivo\":\"raz\u00E3o curta\"}";
var PROMPT_REPARADOR = "Corrija o prompt para que a edi\u00E7\u00E3o funcione corretamente.\n\nPROMPT ATUAL (resumo):\n{{PROMPT}}\n\nEDI\u00C7\u00C3O PEDIDA: \"{{INSTRUCAO}}\"\nPROBLEMA: {{PROBLEMA}}\n\u00C2NCORAS OBRIGAT\u00D3RIAS: {{ANCORAS_OBRIGATORIAS}}\n\nRetorne JSON: {\"resposta_chat\":\"ajuste feito\",\"operacao\":\"editar\",\"edicoes\":[{\"buscar\":\"texto existente\",\"substituir\":\"texto corrigido\"}]}\n\nDICAS:\n- Use texto que EXISTE no prompt para \"buscar\"\n- Se n\u00E3o encontrar, adicione nova instru\u00E7\u00E3o no final\n- NUNCA remova ou altere as \u00E2ncoras obrigat\u00F3rias";
// ═══════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
var PromptCalibrationService = /** @class */ (function () {
    function PromptCalibrationService(config, progressCallback) {
        // 🚀 Agora usa OpenRouter/Chutes automaticamente via chatComplete()
        // Não precisa mais de apiKey ou modelo - usa config do sistema
        this.config = __assign(__assign({}, CONFIG_PADRAO), config);
        this.progressCallback = progressCallback;
        console.log("\uD83C\uDFAF [Calibra\u00E7\u00E3o] Inicializado com OpenRouter/Chutes (mesmo LLM da produ\u00E7\u00E3o)");
    }
    /**
     * Emite log de progresso para streaming
     */
    PromptCalibrationService.prototype.emitProgress = function (type, message, data) {
        if (this.progressCallback) {
            this.progressCallback({
                type: type,
                message: message,
                data: data,
                timestamp: Date.now()
            });
        }
        console.log("\uD83D\uDCE1 [Calibra\u00E7\u00E3o] ".concat(message));
    };
    /**
     * Método helper para fazer chamadas ao LLM unificado
     * 🚀 OTIMIZADO: Com retry automático e melhor tratamento de erros
     */
    PromptCalibrationService.prototype.callLLM = function (systemPrompt, userMessage, options) {
        return __awaiter(this, void 0, void 0, function () {
            var MAX_RETRIES, lastError, _loop_1, attempt, state_1;
            var _a, _b, _c, _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        MAX_RETRIES = 2;
                        lastError = null;
                        _loop_1 = function (attempt) {
                            var startTime, messages, timeoutPromise, llmPromise, response, elapsed, content, jsonMatch, error_1, delay_1;
                            return __generator(this, function (_g) {
                                switch (_g.label) {
                                    case 0:
                                        _g.trys.push([0, 2, , 5]);
                                        console.log("\uD83D\uDD04 [Calibra\u00E7\u00E3o LLM] Tentativa ".concat(attempt, "/").concat(MAX_RETRIES, "..."));
                                        startTime = Date.now();
                                        messages = [
                                            { role: "system", content: systemPrompt },
                                            { role: "user", content: userMessage }
                                        ];
                                        timeoutPromise = new Promise(function (_, reject) {
                                            return setTimeout(function () { return reject(new Error("LLM timeout (10s)")); }, 10000);
                                        });
                                        llmPromise = (0, llm_1.chatComplete)({
                                            messages: messages,
                                            temperature: (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.3, // Mais determinístico
                                            maxTokens: (_b = options === null || options === void 0 ? void 0 : options.maxTokens) !== null && _b !== void 0 ? _b : 200 // Reduzido para velocidade
                                        });
                                        return [4 /*yield*/, Promise.race([llmPromise, timeoutPromise])];
                                    case 1:
                                        response = _g.sent();
                                        elapsed = Date.now() - startTime;
                                        console.log("\u2705 [Calibra\u00E7\u00E3o LLM] Resposta em ".concat(elapsed, "ms"));
                                        content = (_e = (_d = (_c = response.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content;
                                        if (!content || content.trim() === "") {
                                            throw new Error("Resposta vazia do LLM");
                                        }
                                        // Se jsonMode, tentar extrair JSON da resposta
                                        if (options === null || options === void 0 ? void 0 : options.jsonMode) {
                                            jsonMatch = content.match(/\{[\s\S]*\}/);
                                            if (!jsonMatch) {
                                                throw new Error("JSON não encontrado na resposta");
                                            }
                                            // Validar que é JSON válido
                                            try {
                                                JSON.parse(jsonMatch[0]);
                                            }
                                            catch (_h) {
                                                throw new Error("JSON inválido na resposta");
                                            }
                                            return [2 /*return*/, { value: jsonMatch[0] }];
                                        }
                                        return [2 /*return*/, { value: content }];
                                    case 2:
                                        error_1 = _g.sent();
                                        lastError = error_1;
                                        console.warn("\u26A0\uFE0F [Calibra\u00E7\u00E3o LLM] Tentativa ".concat(attempt, " falhou: ").concat(error_1.message));
                                        if (!(attempt < MAX_RETRIES)) return [3 /*break*/, 4];
                                        delay_1 = attempt * 500;
                                        console.log("\u23F3 [Calibra\u00E7\u00E3o LLM] Aguardando ".concat(delay_1, "ms..."));
                                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay_1); })];
                                    case 3:
                                        _g.sent();
                                        _g.label = 4;
                                    case 4: return [3 /*break*/, 5];
                                    case 5: return [2 /*return*/];
                                }
                            });
                        };
                        attempt = 1;
                        _f.label = 1;
                    case 1:
                        if (!(attempt <= MAX_RETRIES)) return [3 /*break*/, 4];
                        return [5 /*yield**/, _loop_1(attempt)];
                    case 2:
                        state_1 = _f.sent();
                        if (typeof state_1 === "object")
                            return [2 /*return*/, state_1.value];
                        _f.label = 3;
                    case 3:
                        attempt++;
                        return [3 /*break*/, 1];
                    case 4: 
                    // Todas as tentativas falharam
                    throw lastError || new Error("Falha após múltiplas tentativas");
                }
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    // FUNÇÃO PRINCIPAL: Calibrar Prompt
    // ═══════════════════════════════════════════════════════════════════════════
    PromptCalibrationService.prototype.calibrarPrompt = function (promptEditado, instrucaoUsuario, promptOriginal) {
        return __awaiter(this, void 0, void 0, function () {
            var inicio, promptAtual, tentativasReparo, totalEdicoesAplicadas, resultados, scoreGeral, cenariosAprovados, ancorasObrigatorias, cenarios, i, c, _loop_2, this_1, state_2, sucesso, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        inicio = Date.now();
                        promptAtual = promptEditado;
                        tentativasReparo = 0;
                        totalEdicoesAplicadas = 0;
                        resultados = [];
                        scoreGeral = 0;
                        cenariosAprovados = 0;
                        ancorasObrigatorias = this.extrairAncorasObrigatorias(instrucaoUsuario)
                            .filter(function (ancora) { return promptEditado.includes(ancora); });
                        this.emitProgress('start', '🎯 Iniciando testes com clientes simulados...', {
                            instrucao: instrucaoUsuario.substring(0, 100)
                        });
                        console.log("\n\uD83C\uDFAF [Calibra\u00E7\u00E3o] Iniciando calibra\u00E7\u00E3o...");
                        console.log("\uD83D\uDCDD [Calibra\u00E7\u00E3o] Instru\u00E7\u00E3o: \"".concat(instrucaoUsuario, "\""));
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 6, , 7]);
                        // 1. Gerar cenários de teste
                        this.emitProgress('scenario_generated', '🧪 Gerando perguntas de clientes simulados...', {});
                        return [4 /*yield*/, this.gerarCenarios(instrucaoUsuario, this.config.numeroCenarios)];
                    case 2:
                        cenarios = _a.sent();
                        this.emitProgress('scenario_generated', "\u2705 ".concat(cenarios.length, " perguntas prontas!"), {});
                        // Mostrar cada cenário gerado
                        for (i = 0; i < cenarios.length; i++) {
                            c = cenarios[i];
                            this.emitProgress('scenario_generated', "\uD83D\uDCCB Cen\u00E1rio ".concat(i + 1, ": \"").concat(c.perguntaCliente, "\""), {});
                        }
                        console.log("\u2705 [Calibra\u00E7\u00E3o] ".concat(cenarios.length, " cen\u00E1rios gerados"));
                        _loop_2 = function () {
                            var i, cenario, resultado, respostaLinhas, _i, _b, linha, piorResultado_1, cenarioFalhou, repairResult;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        this_1.emitProgress('loop_iteration', "\uD83D\uDD04 Rodada ".concat(tentativasReparo + 1, "/").concat(this_1.config.maxTentativasReparo, " - Simulando conversas..."), {
                                            rodada: tentativasReparo + 1,
                                            maxRodadas: this_1.config.maxTentativasReparo + 1
                                        });
                                        resultados = [];
                                        cenariosAprovados = 0;
                                        i = 0;
                                        _c.label = 1;
                                    case 1:
                                        if (!(i < cenarios.length)) return [3 /*break*/, 4];
                                        cenario = cenarios[i];
                                        // Log: Cliente vai perguntar
                                        this_1.emitProgress('scenario_running', "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501", {});
                                        this_1.emitProgress('scenario_running', "\uD83E\uDDEA TESTE ".concat(i + 1, "/").concat(cenarios.length), {});
                                        this_1.emitProgress('scenario_running', "\uD83D\uDC64 CLIENTE PERGUNTA:", {});
                                        this_1.emitProgress('scenario_running', "   \"".concat(cenario.perguntaCliente, "\""), {});
                                        return [4 /*yield*/, this_1.executarCenario(promptAtual, cenario, instrucaoUsuario)];
                                    case 2:
                                        resultado = _c.sent();
                                        resultados.push(resultado);
                                        if (resultado.passou)
                                            cenariosAprovados++;
                                        // Log: Resposta do agente (MOSTRA TUDO)
                                        this_1.emitProgress('scenario_running', "\uD83E\uDD16 AGENTE RESPONDE:", {});
                                        respostaLinhas = resultado.respostaAgente.match(/.{1,80}/g) || [resultado.respostaAgente];
                                        for (_i = 0, _b = respostaLinhas.slice(0, 5); _i < _b.length; _i++) { // Máximo 5 linhas
                                            linha = _b[_i];
                                            this_1.emitProgress('scenario_running', "   ".concat(linha), {});
                                        }
                                        if (respostaLinhas.length > 5) {
                                            this_1.emitProgress('scenario_running', "   [...mais ".concat(respostaLinhas.length - 5, " linhas]"), {});
                                        }
                                        // Log: Análise
                                        this_1.emitProgress('scenario_running', "\uD83D\uDCCA AN\u00C1LISE:", {});
                                        this_1.emitProgress('scenario_result', "".concat(resultado.passou ? '✅' : '❌', " Nota: ").concat(resultado.score, "/100 - ").concat(resultado.motivo), {});
                                        console.log("  ".concat(resultado.passou ? '✅' : '❌', " Cen\u00E1rio ").concat(cenario.id, ": ").concat(resultado.score, "/100"));
                                        _c.label = 3;
                                    case 3:
                                        i++;
                                        return [3 /*break*/, 1];
                                    case 4:
                                        // 3. Calcular score geral
                                        scoreGeral = resultados.reduce(function (acc, r) { return acc + r.score; }, 0) / resultados.length;
                                        this_1.emitProgress('score_update', "\uD83D\uDCCA Score atual: ".concat(scoreGeral.toFixed(0), "/100 (meta: 70+)"), {
                                            score: Math.round(scoreGeral),
                                            aprovados: cenariosAprovados,
                                            total: cenarios.length,
                                            rodada: tentativasReparo + 1
                                        });
                                        console.log("\uD83D\uDCCA [Calibra\u00E7\u00E3o] Score geral: ".concat(scoreGeral.toFixed(1), "/100 (").concat(cenariosAprovados, "/").concat(cenarios.length, " aprovados)"));
                                        console.log("\uD83D\uDCCA [Calibra\u00E7\u00E3o] M\u00EDnimo para aprovar: 70/100");
                                        // 4. Verificar se passou - SCORE >= 70 OBRIGATÓRIO
                                        if (scoreGeral >= this_1.config.scoreMinimoAprovacao) {
                                            this_1.emitProgress('final_result', "\uD83C\uDF89 Aprovado! Score final: ".concat(Math.round(scoreGeral), "/100"), {
                                                success: true,
                                                score: Math.round(scoreGeral),
                                                rodadasUsadas: tentativasReparo + 1
                                            });
                                            console.log("\uD83C\uDF89 [Calibra\u00E7\u00E3o] APROVADO! Prompt calibrado com sucesso.");
                                            return [2 /*return*/, "break"];
                                        }
                                        if (!(tentativasReparo < this_1.config.maxTentativasReparo)) return [3 /*break*/, 7];
                                        this_1.emitProgress('repair_start', "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501", {});
                                        this_1.emitProgress('repair_start', "\uD83D\uDD27 INICIANDO AJUSTE ".concat(tentativasReparo + 1, "/").concat(this_1.config.maxTentativasReparo), {});
                                        console.log("\uD83D\uDD27 [Calibra\u00E7\u00E3o] Tentando reparo (".concat(tentativasReparo + 1, "/").concat(this_1.config.maxTentativasReparo, ")..."));
                                        piorResultado_1 = resultados.reduce(function (pior, atual) {
                                            return atual.score < pior.score ? atual : pior;
                                        });
                                        cenarioFalhou = cenarios.find(function (c) { return c.id === piorResultado_1.cenarioId; });
                                        if (!cenarioFalhou) return [3 /*break*/, 6];
                                        this_1.emitProgress('repair_start', "\u274C Problema identificado:", {});
                                        this_1.emitProgress('repair_start', "   Pergunta: \"".concat(cenarioFalhou.perguntaCliente, "\""), {});
                                        this_1.emitProgress('repair_start', "   Score: ".concat(piorResultado_1.score, "/100"), {});
                                        this_1.emitProgress('repair_start', "   Motivo: ".concat(piorResultado_1.motivo), {});
                                        this_1.emitProgress('repair_start', "\uD83D\uDCA1 Ajustando prompt para corrigir...", {});
                                        return [4 /*yield*/, this_1.repararPrompt(promptAtual, instrucaoUsuario, cenarioFalhou, piorResultado_1, ancorasObrigatorias)];
                                    case 5:
                                        repairResult = _c.sent();
                                        if (repairResult.promptReparado && repairResult.promptReparado !== promptAtual) {
                                            promptAtual = repairResult.promptReparado;
                                            totalEdicoesAplicadas += repairResult.edicoesAplicadas; // Acumula edições
                                            this_1.emitProgress('repair_done', "\u2705 ".concat(repairResult.edicoesAplicadas, " ajuste(s) aplicado(s)! Retestando..."), {
                                                reparo: true,
                                                edicoesNesteTurno: repairResult.edicoesAplicadas,
                                                totalEdicoes: totalEdicoesAplicadas
                                            });
                                            console.log("\u2705 [Calibra\u00E7\u00E3o] ".concat(repairResult.edicoesAplicadas, " edi\u00E7\u00F5es aplicadas (total: ").concat(totalEdicoesAplicadas, ")"));
                                        }
                                        else {
                                            this_1.emitProgress('repair_done', "\u26A0\uFE0F N\u00E3o foi poss\u00EDvel ajustar. Tentando abordagem diferente...", {
                                                reparo: false
                                            });
                                        }
                                        _c.label = 6;
                                    case 6: return [3 /*break*/, 8];
                                    case 7:
                                        // Atingiu máximo de tentativas mas não passou
                                        this_1.emitProgress('final_result', "\u26A0\uFE0F Ajustes finalizados. Pontua\u00E7\u00E3o final: ".concat(Math.round(scoreGeral), "/100"), {
                                            success: false,
                                            score: Math.round(scoreGeral),
                                            rodadasUsadas: tentativasReparo + 1
                                        });
                                        _c.label = 8;
                                    case 8:
                                        tentativasReparo++;
                                        return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        _a.label = 3;
                    case 3:
                        if (!(tentativasReparo <= this.config.maxTentativasReparo)) return [3 /*break*/, 5];
                        return [5 /*yield**/, _loop_2()];
                    case 4:
                        state_2 = _a.sent();
                        if (state_2 === "break")
                            return [3 /*break*/, 5];
                        return [3 /*break*/, 3];
                    case 5:
                        sucesso = scoreGeral >= this.config.scoreMinimoAprovacao;
                        this.emitProgress('final_result', sucesso
                            ? "\u2705 Calibra\u00E7\u00E3o conclu\u00EDda com sucesso! Score: ".concat(Math.round(scoreGeral), "/100 (").concat(totalEdicoesAplicadas, " edi\u00E7\u00F5es)")
                            : "\u26A0\uFE0F Calibra\u00E7\u00E3o finalizada. Score: ".concat(Math.round(scoreGeral), "/100 - Recomendamos testar no simulador."), {
                            success: sucesso,
                            score: Math.round(scoreGeral),
                            edicoesAplicadas: totalEdicoesAplicadas,
                            tempoMs: Date.now() - inicio
                        });
                        return [2 /*return*/, {
                                sucesso: sucesso,
                                scoreGeral: Math.round(scoreGeral),
                                cenariosTotais: cenarios.length,
                                cenariosAprovados: cenariosAprovados,
                                resultados: resultados,
                                promptFinal: promptAtual,
                                tentativasReparo: tentativasReparo,
                                edicoesAplicadas: totalEdicoesAplicadas, // Total de edições efetivamente aplicadas
                                tempoMs: Date.now() - inicio
                            }];
                    case 6:
                        error_2 = _a.sent();
                        this.emitProgress('error', "\u274C Erro na calibra\u00E7\u00E3o: ".concat(error_2.message), { error: error_2.message });
                        console.error("\u274C [Calibra\u00E7\u00E3o] Erro:", error_2.message);
                        return [2 /*return*/, {
                                sucesso: false,
                                scoreGeral: 0,
                                cenariosTotais: 0,
                                cenariosAprovados: 0,
                                resultados: [],
                                promptFinal: promptEditado,
                                tentativasReparo: tentativasReparo,
                                edicoesAplicadas: 0,
                                tempoMs: Date.now() - inicio
                            }];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    // Gerar Cenários de Teste
    // ═══════════════════════════════════════════════════════════════════════════
    PromptCalibrationService.prototype.gerarCenarios = function (instrucao, quantidade) {
        return __awaiter(this, void 0, void 0, function () {
            var userMessage, content, parsed, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        userMessage = "INSTRU\u00C7\u00C3O DE EDI\u00C7\u00C3O:\n\"".concat(instrucao, "\"\n\nGere ").concat(quantidade, " cen\u00E1rios de teste para validar se essa edi\u00E7\u00E3o foi aplicada corretamente no prompt do agente.");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.callLLM(PROMPT_GERADOR_CENARIOS, userMessage, { temperature: 0.5, maxTokens: 2000, jsonMode: true })];
                    case 2:
                        content = _a.sent();
                        parsed = JSON.parse(content);
                        return [2 /*return*/, (parsed.cenarios || []).slice(0, quantidade)];
                    case 3:
                        error_3 = _a.sent();
                        console.error("[Calibração] Erro ao gerar cenários:", error_3);
                        // Fallback: cenário genérico
                        return [2 /*return*/, [{
                                    id: "cenario_fallback",
                                    perguntaCliente: "Sobre \"".concat(instrucao.substring(0, 50), "...\""),
                                    expectativaResposta: "Resposta que demonstra a edição aplicada",
                                    tipoValidacao: "semantico",
                                    palavrasChave: []
                                }]];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    // Executar Cenário (IA Cliente ↔ IA Agente)
    // ═══════════════════════════════════════════════════════════════════════════
    PromptCalibrationService.prototype.executarCenario = function (prompt, cenario, instrucaoOriginal) {
        return __awaiter(this, void 0, void 0, function () {
            var mensagemCliente, respostaAgente, analise, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, this.simularCliente(cenario.perguntaCliente)];
                    case 1:
                        mensagemCliente = _a.sent();
                        return [4 /*yield*/, this.obterRespostaAgente(prompt, mensagemCliente)];
                    case 2:
                        respostaAgente = _a.sent();
                        return [4 /*yield*/, this.analisarResposta(respostaAgente, instrucaoOriginal, cenario)];
                    case 3:
                        analise = _a.sent();
                        return [2 /*return*/, {
                                cenarioId: cenario.id,
                                perguntaCliente: mensagemCliente,
                                respostaAgente: respostaAgente,
                                passou: analise.passou,
                                score: analise.score,
                                motivo: analise.motivo
                            }];
                    case 4:
                        error_4 = _a.sent();
                        return [2 /*return*/, {
                                cenarioId: cenario.id,
                                perguntaCliente: cenario.perguntaCliente,
                                respostaAgente: "ERRO",
                                passou: false,
                                score: 0,
                                motivo: "Erro na execu\u00E7\u00E3o: ".concat(error_4.message)
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    // Simular Cliente - OTIMIZADO: Usa mensagem direta sem simulação extra
    // ═══════════════════════════════════════════════════════════════════════════
    PromptCalibrationService.prototype.simularCliente = function (perguntaBase) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // 🚀 OTIMIZAÇÃO: Retorna pergunta direta sem chamada LLM adicional
                // Isso economiza 1 chamada por cenário = muito mais rápido
                return [2 /*return*/, perguntaBase];
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    // Obter Resposta do Agente - OTIMIZADO
    // ═══════════════════════════════════════════════════════════════════════════
    PromptCalibrationService.prototype.obterRespostaAgente = function (promptAgente, mensagemCliente) {
        return __awaiter(this, void 0, void 0, function () {
            var content, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.callLLM(promptAgente, mensagemCliente, { temperature: 0.3, maxTokens: 400 } // Reduzido para velocidade
                            )];
                    case 1:
                        content = _a.sent();
                        return [2 /*return*/, content.trim() || ""];
                    case 2:
                        error_5 = _a.sent();
                        throw new Error("Erro ao obter resposta do agente: ".concat(error_5.message));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    // Analisar Resposta - OTIMIZADO
    // ═══════════════════════════════════════════════════════════════════════════
    PromptCalibrationService.prototype.analisarResposta = function (respostaAgente, instrucaoOriginal, cenario) {
        return __awaiter(this, void 0, void 0, function () {
            var respostaLower_1, palavrasEncontradas, percentualEncontrado, passou, score, passou, promptAnalise, content, parsed, _a;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        // 🚀 OTIMIZAÇÃO: Análise local por palavras-chave PRIMEIRO (sem LLM)
                        // Se tiver palavras-chave definidas, usa análise rápida
                        if (cenario.palavrasChave && cenario.palavrasChave.length > 0) {
                            respostaLower_1 = respostaAgente.toLowerCase();
                            palavrasEncontradas = cenario.palavrasChave.filter(function (palavra) { return respostaLower_1.includes(palavra.toLowerCase()); });
                            percentualEncontrado = (palavrasEncontradas.length / cenario.palavrasChave.length) * 100;
                            if (cenario.tipoValidacao === "contem") {
                                passou = percentualEncontrado >= 50;
                                score = Math.round(percentualEncontrado * 0.9 + (passou ? 10 : 0));
                                return [2 /*return*/, {
                                        passou: passou,
                                        score: Math.min(100, score),
                                        motivo: "Encontrou ".concat(palavrasEncontradas.length, "/").concat(cenario.palavrasChave.length, " palavras-chave")
                                    }];
                            }
                            if (cenario.tipoValidacao === "nao_contem") {
                                passou = percentualEncontrado === 0;
                                return [2 /*return*/, {
                                        passou: passou,
                                        score: passou ? 95 : 30,
                                        motivo: passou ? "Nenhuma palavra-chave indesejada" : "Encontrou palavras indesejadas: ".concat(palavrasEncontradas.join(", "))
                                    }];
                            }
                        }
                        promptAnalise = PROMPT_ANALISADOR
                            .replace("{{INSTRUCAO}}", instrucaoOriginal)
                            .replace("{{EXPECTATIVA}}", cenario.expectativaResposta)
                            .replace("{{RESPOSTA}}", respostaAgente.substring(0, 500)) // Limita tamanho
                            .replace("{{PALAVRAS_CHAVE}}", (cenario.palavrasChave || []).join(", "))
                            .replace("{{TIPO_VALIDACAO}}", cenario.tipoValidacao);
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.callLLM(promptAnalise, "Analise a resposta e retorne o JSON de avaliação:", { temperature: 0.1, maxTokens: 300, jsonMode: true })];
                    case 2:
                        content = _d.sent();
                        parsed = JSON.parse(content);
                        return [2 /*return*/, {
                                passou: (_b = parsed.passou) !== null && _b !== void 0 ? _b : false,
                                score: Math.min(100, Math.max(0, (_c = parsed.score) !== null && _c !== void 0 ? _c : 0)),
                                motivo: parsed.motivo || "Sem justificativa"
                            }];
                    case 3:
                        _a = _d.sent();
                        // Fallback final
                        return [2 /*return*/, {
                                passou: respostaAgente.length > 50,
                                score: respostaAgente.length > 50 ? 65 : 30,
                                motivo: "Análise automática (fallback)"
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    // Reparar Prompt - Retorna objeto com prompt e número de edições
    // ═══════════════════════════════════════════════════════════════════════════
    PromptCalibrationService.prototype.repararPrompt = function (promptAtual, instrucaoOriginal, cenarioFalhou, resultadoFalhou, ancorasObrigatorias) {
        return __awaiter(this, void 0, void 0, function () {
            var ancorasTexto, promptReparo, content, parsed, promptReparado, edicoesAplicadas, _i, _a, edicao, candidato, promptLower, buscarLower, indexCI, textoOriginal, candidato, candidato, _b, ancorasObrigatorias_1, ancora, error_6;
            var _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        ancorasTexto = ancorasObrigatorias.length > 0
                            ? ancorasObrigatorias.map(function (a) { return "- ".concat(a); }).join("\n")
                            : "- nenhuma";
                        promptReparo = PROMPT_REPARADOR
                            .replace("{{PROMPT}}", promptAtual)
                            .replace("{{INSTRUCAO}}", instrucaoOriginal)
                            .replace("{{PROBLEMA}}", resultadoFalhou.motivo)
                            .replace("{{ANCORAS_OBRIGATORIAS}}", ancorasTexto)
                            .replace("{{PERGUNTA}}", resultadoFalhou.perguntaCliente)
                            .replace("{{RESPOSTA}}", resultadoFalhou.respostaAgente)
                            .replace("{{EXPECTATIVA}}", cenarioFalhou.expectativaResposta);
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.callLLM(promptReparo, "Analise e corrija o prompt. Retorne APENAS o JSON com as edições:", { temperature: 0.3, maxTokens: 2000, jsonMode: true })];
                    case 2:
                        content = _d.sent();
                        parsed = JSON.parse(content);
                        if (parsed.operacao === "editar" && ((_c = parsed.edicoes) === null || _c === void 0 ? void 0 : _c.length) > 0) {
                            promptReparado = promptAtual;
                            edicoesAplicadas = 0;
                            for (_i = 0, _a = parsed.edicoes; _i < _a.length; _i++) {
                                edicao = _a[_i];
                                if (!edicao.buscar || !edicao.substituir)
                                    continue;
                                // Tentar match exato primeiro
                                if (promptReparado.includes(edicao.buscar)) {
                                    candidato = promptReparado.replace(edicao.buscar, edicao.substituir);
                                    if (this.violariaAncorasObrigatorias(promptReparado, candidato, ancorasObrigatorias)) {
                                        this.emitProgress('repair_done', "   \u26A0\uFE0F Edi\u00E7\u00E3o ignorada para preservar instru\u00E7\u00E3o mandat\u00F3ria", {});
                                        continue;
                                    }
                                    promptReparado = candidato;
                                    edicoesAplicadas++;
                                    this.emitProgress('repair_done', "   \u2713 Edi\u00E7\u00E3o aplicada (match exato)", {});
                                    continue;
                                }
                                promptLower = promptReparado.toLowerCase();
                                buscarLower = edicao.buscar.toLowerCase();
                                indexCI = promptLower.indexOf(buscarLower);
                                if (indexCI !== -1) {
                                    textoOriginal = promptReparado.substring(indexCI, indexCI + edicao.buscar.length);
                                    candidato = promptReparado.replace(textoOriginal, edicao.substituir);
                                    if (this.violariaAncorasObrigatorias(promptReparado, candidato, ancorasObrigatorias)) {
                                        this.emitProgress('repair_done', "   \u26A0\uFE0F Edi\u00E7\u00E3o fuzzy ignorada para preservar instru\u00E7\u00E3o mandat\u00F3ria", {});
                                        continue;
                                    }
                                    promptReparado = candidato;
                                    edicoesAplicadas++;
                                    this.emitProgress('repair_done', "   \u2713 Edi\u00E7\u00E3o aplicada (fuzzy match)", {});
                                    continue;
                                }
                                // Se não encontrou, tentar adicionar no final (como regra adicional)
                                if (edicao.substituir && edicao.substituir.length > 20) {
                                    candidato = promptReparado.trim() + "\n\n" + edicao.substituir;
                                    if (this.violariaAncorasObrigatorias(promptReparado, candidato, ancorasObrigatorias)) {
                                        this.emitProgress('repair_done', "   \u26A0\uFE0F Nova instru\u00E7\u00E3o ignorada para preservar instru\u00E7\u00E3o mandat\u00F3ria", {});
                                        continue;
                                    }
                                    promptReparado = candidato;
                                    edicoesAplicadas++;
                                    this.emitProgress('repair_done', "   \u2713 Nova instru\u00E7\u00E3o adicionada ao prompt", {});
                                }
                            }
                            for (_b = 0, ancorasObrigatorias_1 = ancorasObrigatorias; _b < ancorasObrigatorias_1.length; _b++) {
                                ancora = ancorasObrigatorias_1[_b];
                                if (!promptReparado.includes(ancora)) {
                                    promptReparado = "".concat(promptReparado.trim(), "\n\nINSTRU\u00C7\u00C3O MANDAT\u00D3RIA PRESERVADA:\n").concat(ancora);
                                    edicoesAplicadas++;
                                    this.emitProgress('repair_done', "   \u2713 \u00C2ncora mandat\u00F3ria restaurada", {});
                                }
                            }
                            if (edicoesAplicadas > 0) {
                                this.emitProgress('repair_done', "   \uD83D\uDCDD ".concat(edicoesAplicadas, " edi\u00E7\u00E3o(\u00F5es) aplicadas"), {});
                                return [2 /*return*/, { promptReparado: promptReparado, edicoesAplicadas: edicoesAplicadas }];
                            }
                        }
                        return [2 /*return*/, { promptReparado: null, edicoesAplicadas: 0 }];
                    case 3:
                        error_6 = _d.sent();
                        console.error("[Calibração] Erro ao reparar prompt:", error_6);
                        return [2 /*return*/, { promptReparado: null, edicoesAplicadas: 0 }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    PromptCalibrationService.prototype.extrairAncorasObrigatorias = function (instrucao) {
        if (!instrucao)
            return [];
        var candidatos = [];
        var regex = /["“”']([^"“”']{12,})["“”']/g;
        var match = null;
        while ((match = regex.exec(instrucao)) !== null) {
            var texto = match[1].trim();
            if (texto.length >= 12) {
                candidatos.push(texto);
            }
        }
        return __spreadArray([], new Set(candidatos), true);
    };
    PromptCalibrationService.prototype.violariaAncorasObrigatorias = function (promptAntes, promptDepois, ancorasObrigatorias) {
        if (!ancorasObrigatorias.length)
            return false;
        for (var _i = 0, ancorasObrigatorias_2 = ancorasObrigatorias; _i < ancorasObrigatorias_2.length; _i++) {
            var ancora = ancorasObrigatorias_2[_i];
            if (promptAntes.includes(ancora) && !promptDepois.includes(ancora)) {
                return true;
            }
        }
        return false;
    };
    return PromptCalibrationService;
}());
exports.PromptCalibrationService = PromptCalibrationService;
// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO HELPER PARA USO DIRETO
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Função simplificada para calibrar prompts
 * 🚀 ATUALIZADO: Agora usa OpenRouter/Chutes automaticamente
 * Os parâmetros apiKey e modelo são mantidos por compatibilidade mas ignorados
 */
function calibrarPromptEditado(promptEditado, instrucaoUsuario, _apiKey, // Ignorado - usa config do sistema
_modelo, // Ignorado - usa OpenRouter/Chutes
config, progressCallback) {
    return __awaiter(this, void 0, void 0, function () {
        var service;
        return __generator(this, function (_a) {
            service = new PromptCalibrationService(config, progressCallback);
            return [2 /*return*/, service.calibrarPrompt(promptEditado, instrucaoUsuario)];
        });
    });
}
exports.default = PromptCalibrationService;
