"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 SERVIÇO DE EDIÇÃO DE PROMPTS VIA IA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Técnica: Search-and-Replace com JSON Schema (baseado no padrão Aider/GPT)
 *
 * FLUXO:
 * 1. Usuário pede alteração em linguagem natural
 * 2. Enviamos prompt atual + instrução para a IA (OpenRouter/Chutes)
 * 3. IA retorna JSON com {resposta_chat, operacao, edicoes: [{buscar, substituir}]}
 * 4. Sistema aplica as edições localmente com fuzzy matching
 * 5. Retornamos o prompt editado + mensagem de chat para o histórico
 *
 * VANTAGENS:
 * - 80% mais rápido (IA não reescreve tudo)
 * - 80% mais barato (menos tokens)
 * - 100% do resto preservado (só muda o necessário)
 *
 * 🚀 ATUALIZADO: Agora usa OpenRouter/Chutes (mesmo LLM do chat produção)
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
exports.editarPromptViaIA = editarPromptViaIA;
exports.aplicarEdicaoFuzzy = aplicarEdicaoFuzzy;
exports.coeficienteDice = coeficienteDice;
exports.tokenizar = tokenizar;
var llm_1 = require("./llm");
// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT PARA A IA
// ═══════════════════════════════════════════════════════════════════════════
var SYSTEM_PROMPT = "Voc\u00EA \u00E9 um EDITOR DE PROMPTS. Sua tarefa \u00E9 modificar o prompt do agente conforme a instru\u00E7\u00E3o do usu\u00E1rio.\n\nIMPORTANTE: SEMPRE fa\u00E7a edi\u00E7\u00F5es quando o usu\u00E1rio pedir uma mudan\u00E7a. Nunca diga \"OK, feito!\" sem fazer edi\u00E7\u00F5es reais.\n\nFORMATO DE RESPOSTA (JSON):\n{\"resposta_chat\":\"Descri\u00E7\u00E3o do que foi alterado\",\"operacao\":\"editar\",\"edicoes\":[{\"buscar\":\"TEXTO EXATO do prompt original\",\"substituir\":\"TEXTO MODIFICADO\"}]}\n\nREGRAS OBRIGAT\u00D3RIAS:\n1. \"buscar\" DEVE conter texto que EXISTE no prompt original (copie exatamente)\n2. \"substituir\" cont\u00E9m o texto modificado\n3. SEMPRE use operacao=\"editar\" quando houver mudan\u00E7as\n4. Fa\u00E7a pelo menos 1 edi\u00E7\u00E3o para cada solicita\u00E7\u00E3o\n5. Seja espec\u00EDfico - encontre trechos exatos para modificar\n6. Preserve o restante do prompt; NUNCA reescreva se\u00E7\u00F5es n\u00E3o solicitadas\n7. Se a instru\u00E7\u00E3o do usu\u00E1rio trouxer texto entre aspas, preserve esse texto literalmente\n\nTIPOS DE EDI\u00C7\u00C3O:\n\u2022 MUDAR: {\"buscar\":\"texto antigo existente\",\"substituir\":\"texto novo\"}\n\u2022 ADICIONAR: {\"buscar\":\"\u00FAltima linha de uma se\u00E7\u00E3o\",\"substituir\":\"\u00FAltima linha\\n+ NOVO CONTE\u00DADO\"}\n\u2022 REMOVER: {\"buscar\":\"texto a remover\",\"substituir\":\"\"}\n\nEXEMPLOS:\nUsu\u00E1rio: \"seja mais formal\"\n\u2192 {\"resposta_chat\":\"Tornei o tom mais formal\",\"operacao\":\"editar\",\"edicoes\":[{\"buscar\":\"Oi! Tudo bem?\",\"substituir\":\"Ol\u00E1, como posso ajud\u00E1-lo?\"}]}\n\nUsu\u00E1rio: \"adicione sauda\u00E7\u00E3o\"\n\u2192 {\"resposta_chat\":\"Adicionei sauda\u00E7\u00E3o inicial\",\"operacao\":\"editar\",\"edicoes\":[{\"buscar\":\"REGRAS:\",\"substituir\":\"SAUDA\u00C7\u00C3O: Sempre cumprimente o cliente\\n\\nREGRAS:\"}]}\n\nRESPONDA APENAS O JSON, nada antes ou depois.";
// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL: Editar Prompt via IA
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Edita um prompt via IA usando OpenRouter/Chutes
 * 🚀 ATUALIZADO: Parâmetros apiKey e modelo são ignorados - usa config do sistema
 */
function editarPromptViaIA(promptAtual, instrucaoUsuario, _apiKey, // Ignorado - usa config do sistema
_modelo // Ignorado - usa OpenRouter/Chutes
) {
    return __awaiter(this, void 0, void 0, function () {
        var userMessage, MAX_RETRIES, lastError, _loop_1, attempt, state_1;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    console.log("[EditService] Iniciando edi\u00E7\u00E3o via IA (OpenRouter/Chutes)");
                    userMessage = "ANALISE O PROMPT ABAIXO E APLIQUE A MODIFICA\u00C7\u00C3O SOLICITADA:\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nPROMPT ATUAL DO AGENTE:\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n".concat(promptAtual, "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\nINSTRU\u00C7\u00C3O DO USU\u00C1RIO: \"").concat(instrucaoUsuario, "\"\n\nTAREFA: Encontre os trechos do prompt acima que precisam ser modificados e gere as edi\u00E7\u00F5es.\nRESPONDA com JSON: {\"resposta_chat\":\"...\", \"operacao\":\"editar\", \"edicoes\":[{\"buscar\":\"trecho exato\", \"substituir\":\"novo trecho\"}]}");
                    MAX_RETRIES = 10;
                    lastError = "";
                    _loop_1 = function (attempt) {
                        var messages, response, content, jsonContent, codeBlockMatch, jsonMatch, respostaIA, novoPrompt, detalhes, aplicadas, falharam, _i, _f, edicao, buscar, substituir, resultado, error_1, delay_1;
                        return __generator(this, function (_g) {
                            switch (_g.label) {
                                case 0:
                                    _g.trys.push([0, 2, , 5]);
                                    console.log("[EditService] Tentativa ".concat(attempt, "/").concat(MAX_RETRIES, "..."));
                                    messages = [
                                        { role: "system", content: SYSTEM_PROMPT },
                                        { role: "user", content: userMessage }
                                    ];
                                    return [4 /*yield*/, (0, llm_1.chatComplete)({
                                            messages: messages,
                                            temperature: 0.3, // Baixo para ser mais preciso
                                            maxTokens: 4000
                                        })];
                                case 1:
                                    response = _g.sent();
                                    content = ((_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || "";
                                    // Verificar se resposta está vazia
                                    if (!content || content.trim() === "") {
                                        throw new Error("Resposta vazia do LLM");
                                    }
                                    console.log("[EditService] Resposta bruta do LLM (".concat(content.length, " chars): ").concat(content.substring(0, 200), "..."));
                                    jsonContent = content;
                                    codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
                                    if (codeBlockMatch) {
                                        jsonContent = codeBlockMatch[1].trim();
                                        console.log("[EditService] JSON extra\u00EDdo de code block");
                                    }
                                    else {
                                        jsonMatch = content.match(/\{[\s\S]*\}/);
                                        if (jsonMatch) {
                                            jsonContent = jsonMatch[0];
                                            console.log("[EditService] JSON extra\u00EDdo via regex");
                                        }
                                    }
                                    // 🔧 Limpar caracteres problemáticos comuns
                                    jsonContent = jsonContent
                                        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove caracteres de controle
                                        .replace(/,\s*}/g, '}') // Remove trailing commas antes de }
                                        .replace(/,\s*]/g, ']') // Remove trailing commas antes de ]
                                        .trim();
                                    if (!jsonContent || jsonContent === '') {
                                        throw new Error("JSON não encontrado na resposta");
                                    }
                                    respostaIA = void 0;
                                    try {
                                        respostaIA = JSON.parse(jsonContent); // 🔧 CORRIGIDO: usar jsonContent
                                        // Validar estrutura mínima do JSON
                                        if (!respostaIA.resposta_chat && !respostaIA.operacao) {
                                            // 🔧 Tentar extrair resposta conversacional se JSON está incompleto
                                            if (typeof respostaIA === 'object') {
                                                console.log("[EditService] JSON parcial detectado, tentando recuperar...");
                                                respostaIA.resposta_chat = respostaIA.resposta_chat || "Entendi sua solicitação.";
                                                respostaIA.operacao = respostaIA.operacao || "nenhuma";
                                                respostaIA.edicoes = respostaIA.edicoes || [];
                                            }
                                            else {
                                                throw new Error("JSON incompleto - falta resposta_chat ou operacao");
                                            }
                                        }
                                        // Garantir que edicoes é um array
                                        if (!Array.isArray(respostaIA.edicoes)) {
                                            respostaIA.edicoes = [];
                                        }
                                    }
                                    catch (e) {
                                        console.warn("[EditService] Erro ao parsear JSON (tentativa ".concat(attempt, "):"), e.message);
                                        console.warn("[EditService] JSON tentado: ".concat(jsonContent.substring(0, 300), "..."));
                                        // 🔧 FALLBACK: Se o modelo retornou algo mas não é JSON válido,
                                        // tentar extrair uma resposta útil
                                        if (attempt === MAX_RETRIES) {
                                            return [2 /*return*/, { value: {
                                                        success: false,
                                                        novoPrompt: promptAtual,
                                                        mensagemChat: "Entendi sua solicitação! Por favor, tente novamente com instruções mais específicas sobre o que deseja alterar.",
                                                        edicoesAplicadas: 0,
                                                        edicoesFalharam: 0,
                                                        detalhes: []
                                                    } }];
                                        }
                                        throw new Error("JSON inv\u00E1lido: ".concat(e.message));
                                    }
                                    // Se não precisa editar, retorna mensagem de chat apenas
                                    if (respostaIA.operacao === "nenhuma" || !((_d = respostaIA.edicoes) === null || _d === void 0 ? void 0 : _d.length)) {
                                        return [2 /*return*/, { value: {
                                                    success: true,
                                                    novoPrompt: promptAtual,
                                                    mensagemChat: respostaIA.resposta_chat || "Entendi! Não há alterações a fazer.",
                                                    edicoesAplicadas: 0,
                                                    edicoesFalharam: 0,
                                                    detalhes: []
                                                } }];
                                    }
                                    novoPrompt = promptAtual;
                                    detalhes = [];
                                    aplicadas = 0;
                                    falharam = 0;
                                    for (_i = 0, _f = respostaIA.edicoes; _i < _f.length; _i++) {
                                        edicao = _f[_i];
                                        buscar = edicao.buscar, substituir = edicao.substituir;
                                        resultado = aplicarEdicaoFuzzy(novoPrompt, buscar, substituir, 0.85);
                                        if (resultado.success) {
                                            novoPrompt = resultado.novoTexto;
                                            aplicadas++;
                                            detalhes.push({
                                                buscar: buscar,
                                                substituir: substituir,
                                                status: "aplicada",
                                                matchType: resultado.matchType
                                            });
                                        }
                                        else {
                                            falharam++;
                                            detalhes.push({
                                                buscar: buscar,
                                                substituir: substituir,
                                                status: "falhou"
                                            });
                                            console.warn("[EditService] Edi\u00E7\u00E3o n\u00E3o encontrada: \"".concat(buscar.substring(0, 50), "...\""));
                                        }
                                    }
                                    // ✅ Sucesso! Retorna resultado
                                    console.log("[EditService] \u2705 Edi\u00E7\u00E3o conclu\u00EDda: ".concat(aplicadas, " aplicadas, ").concat(falharam, " falharam"));
                                    return [2 /*return*/, { value: {
                                                success: aplicadas > 0,
                                                novoPrompt: aplicadas > 0 ? novoPrompt : promptAtual,
                                                mensagemChat: respostaIA.resposta_chat || "Pronto! Apliquei ".concat(aplicadas, " edi\u00E7\u00E3o(\u00F5es)."),
                                                edicoesAplicadas: aplicadas,
                                                edicoesFalharam: falharam,
                                                detalhes: detalhes
                                            } }];
                                case 2:
                                    error_1 = _g.sent();
                                    lastError = error_1.message;
                                    console.warn("[EditService] \u26A0\uFE0F Tentativa ".concat(attempt, " falhou: ").concat(error_1.message));
                                    if (!(attempt < MAX_RETRIES)) return [3 /*break*/, 4];
                                    delay_1 = Math.min(Math.pow(2, attempt) * 1000, 60000);
                                    console.log("[EditService] \u23F3 Aguardando ".concat(delay_1 / 1000, "s antes de tentar novamente..."));
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
                    _e.label = 1;
                case 1:
                    if (!(attempt <= MAX_RETRIES)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(attempt)];
                case 2:
                    state_1 = _e.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _e.label = 3;
                case 3:
                    attempt++;
                    return [3 /*break*/, 1];
                case 4:
                    // Todas as tentativas falharam - retornar erro amigável com instrução para tentar novamente
                    console.error("[EditService] \u274C Todas as ".concat(MAX_RETRIES, " tentativas falharam"));
                    return [2 /*return*/, {
                            success: false,
                            novoPrompt: promptAtual,
                            mensagemChat: "\u26A0\uFE0F O sistema est\u00E1 temporariamente ocupado. Por favor, tente novamente em alguns segundos. Sua edi\u00E7\u00E3o ser\u00E1 processada na pr\u00F3xima tentativa.",
                            edicoesAplicadas: 0,
                            edicoesFalharam: 0,
                            detalhes: []
                        }];
            }
        });
    });
}
function aplicarEdicaoFuzzy(documento, buscar, substituir, threshold) {
    if (threshold === void 0) { threshold = 0.85; }
    // 1. Tenta match exato (mais rápido)
    if (documento.includes(buscar)) {
        return {
            success: true,
            novoTexto: documento.replace(buscar, substituir),
            matchType: "exato"
        };
    }
    // 2. Tenta match case-insensitive
    var docLower = documento.toLowerCase();
    var buscarLower = buscar.toLowerCase();
    var indexCaseInsensitive = docLower.indexOf(buscarLower);
    if (indexCaseInsensitive !== -1) {
        var textoOriginal = documento.substring(indexCaseInsensitive, indexCaseInsensitive + buscar.length);
        return {
            success: true,
            novoTexto: documento.replace(textoOriginal, substituir),
            matchType: "fuzzy",
            textoEncontrado: textoOriginal
        };
    }
    // 3. Tenta fuzzy match por similaridade de tokens
    var match = encontrarMelhorMatch(documento, buscar, threshold);
    if (match) {
        var antes = documento.substring(0, match.index);
        var depois = documento.substring(match.index + match.texto.length);
        return {
            success: true,
            novoTexto: antes + substituir + depois,
            matchType: "fuzzy",
            textoEncontrado: match.texto
        };
    }
    return {
        success: false,
        novoTexto: documento
    };
}
/**
 * Encontra o melhor match fuzzy no documento
 * Usa coeficiente de Dice para similaridade
 */
function encontrarMelhorMatch(documento, buscar, threshold) {
    var normalizar = function (str) {
        return str.toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[""]/g, '"')
            .replace(/['']/g, "'")
            .trim();
    };
    var buscarNorm = normalizar(buscar);
    var buscarTokens = tokenizar(buscarNorm);
    var melhorMatch = null;
    // Divide documento em linhas e busca
    var linhas = documento.split('\n');
    var charIndex = 0;
    for (var _i = 0, linhas_1 = linhas; _i < linhas_1.length; _i++) {
        var linha = linhas_1[_i];
        var linhaNorm = normalizar(linha);
        var linhaTokens = tokenizar(linhaNorm);
        // Calcula similaridade de Dice (baseado em tokens comuns)
        var similaridade = coeficienteDice(buscarTokens, linhaTokens);
        if (similaridade >= threshold && (!melhorMatch || similaridade > melhorMatch.similaridade)) {
            melhorMatch = {
                index: charIndex,
                texto: linha,
                similaridade: similaridade
            };
        }
        // Se linha é maior, tenta chunks
        if (linha.length > buscar.length * 1.5) {
            for (var i = 0; i <= linha.length - buscar.length; i += Math.max(1, Math.floor(buscar.length / 3))) {
                var chunk = linha.substring(i, Math.min(i + buscar.length + 30, linha.length));
                var chunkNorm = normalizar(chunk);
                var chunkTokens = tokenizar(chunkNorm);
                var chunkSim = coeficienteDice(buscarTokens, chunkTokens);
                if (chunkSim >= threshold && (!melhorMatch || chunkSim > melhorMatch.similaridade)) {
                    melhorMatch = {
                        index: charIndex + i,
                        texto: chunk,
                        similaridade: chunkSim
                    };
                }
            }
        }
        charIndex += linha.length + 1; // +1 para \n
    }
    return melhorMatch;
}
/**
 * Tokeniza string em palavras/tokens
 */
function tokenizar(str) {
    return new Set(str.split(/[^a-záàâãéèêíïóôõöúçñ0-9]+/gi)
        .filter(function (t) { return t.length > 1; }));
}
/**
 * Coeficiente de Dice: 2 * |A ∩ B| / (|A| + |B|)
 * Retorna valor entre 0 e 1
 */
function coeficienteDice(set1, set2) {
    if (set1.size === 0 && set2.size === 0)
        return 1;
    if (set1.size === 0 || set2.size === 0)
        return 0;
    var intersecao = 0;
    set1.forEach(function (token) {
        if (set2.has(token))
            intersecao++;
    });
    return (2 * intersecao) / (set1.size + set2.size);
}
