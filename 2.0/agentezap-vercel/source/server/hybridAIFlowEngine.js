"use strict";
/**
 * Sistema Híbrido IA + Fluxo
 *
 * Este módulo adiciona inteligência ao chatbot de fluxo:
 * 1. Parsing de datas naturais ("hoje", "amanhã", "segunda", "dia 15")
 * 2. Interpretação de intenções do usuário via IA
 * 3. Acionamento correto de nós do fluxo baseado na intenção
 *
 * A IA NÃO gera respostas - apenas interpreta a intenção e aciona o fluxo correto.
 * As respostas sempre vêm do fluxo predefinido.
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTENT_TO_NODE_TYPES = exports.INTENT_KEYWORDS = exports.MESES = exports.DIAS_SEMANA = void 0;
exports.parseNaturalDate = parseNaturalDate;
exports.extractDateFromText = extractDateFromText;
exports.parseNaturalTime = parseNaturalTime;
exports.extractTimeFromText = extractTimeFromText;
exports.detectIntent = detectIntent;
exports.getHybridConfig = getHybridConfig;
exports.processUserInputWithNaturalLanguage = processUserInputWithNaturalLanguage;
exports.findNodeByIntent = findNodeByIntent;
exports.applyExtractedDataToVariables = applyExtractedDataToVariables;
exports.processTranscribedAudio = processTranscribedAudio;
exports.logHybridDecision = logHybridDecision;
var db_1 = require("./db");
var drizzle_orm_1 = require("drizzle-orm");
var DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
exports.DIAS_SEMANA = DIAS_SEMANA;
var DIAS_SEMANA_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
var DIAS_SEMANA_ALT = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
exports.MESES = MESES;
var MESES_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/**
 * Parseia datas em linguagem natural para formato estruturado
 */
function parseNaturalDate(text) {
    var normalized = text.toLowerCase().trim()
        .replace(/[áàâã]/g, 'a')
        .replace(/[éèê]/g, 'e')
        .replace(/[íìî]/g, 'i')
        .replace(/[óòôõ]/g, 'o')
        .replace(/[úùû]/g, 'u')
        .replace(/[ç]/g, 'c');
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var targetDate = null;
    var confidence = 0.8;
    // ========== HOJE ==========
    if (/^hoje$/i.test(normalized) || /\bhoje\b/i.test(normalized)) {
        targetDate = today;
        confidence = 1.0;
    }
    // ========== AMANHÃ ==========
    else if (/^amanha$/i.test(normalized) || /\bamanha\b/i.test(normalized)) {
        targetDate = new Date(today);
        targetDate.setDate(today.getDate() + 1);
        confidence = 1.0;
    }
    // ========== DEPOIS DE AMANHÃ ==========
    else if (/depois de amanha/i.test(normalized) || /depois d'amanha/i.test(normalized)) {
        targetDate = new Date(today);
        targetDate.setDate(today.getDate() + 2);
        confidence = 1.0;
    }
    // ========== PRÓXIMA SEMANA ==========
    else if (/proxima semana/i.test(normalized) || /semana que vem/i.test(normalized)) {
        targetDate = new Date(today);
        targetDate.setDate(today.getDate() + 7);
        confidence = 0.7;
    }
    // ========== DAQUI X DIAS ==========
    else if (/daqui (\d+) dias?/i.test(normalized) || /em (\d+) dias?/i.test(normalized)) {
        var match = normalized.match(/(?:daqui|em) (\d+) dias?/i);
        if (match) {
            var days = parseInt(match[1]);
            targetDate = new Date(today);
            targetDate.setDate(today.getDate() + days);
            confidence = 0.9;
        }
    }
    // ========== DIA DA SEMANA (segunda, terça, etc.) ==========
    else {
        // Procurar por dia da semana
        var diasCompletos = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        var diasComFeira = ['segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira'];
        var foundDayIndex = -1;
        // Verificar dias completos
        for (var i = 0; i < diasCompletos.length; i++) {
            if (normalized.includes(diasCompletos[i])) {
                foundDayIndex = i;
                break;
            }
        }
        // Se encontrou dia da semana
        if (foundDayIndex >= 0) {
            var currentDay = today.getDay();
            var daysToAdd = foundDayIndex - currentDay;
            // Se o dia já passou ou é hoje, vai para a próxima semana
            if (daysToAdd <= 0) {
                daysToAdd += 7;
            }
            // "próxima segunda" sempre pula para próxima semana
            if (normalized.includes('proxim')) {
                if (daysToAdd <= 0) {
                    daysToAdd += 7;
                }
            }
            targetDate = new Date(today);
            targetDate.setDate(today.getDate() + daysToAdd);
            confidence = 0.9;
        }
        // ========== DIA NUMÉRICO (dia 15, 20/03, 15 de março) ==========
        else {
            // Formato: dia 15, dia 20
            var diaMatch = normalized.match(/dia (\d{1,2})/i);
            if (diaMatch) {
                var day_1 = parseInt(diaMatch[1]);
                if (day_1 >= 1 && day_1 <= 31) {
                    targetDate = new Date(today);
                    targetDate.setDate(day_1);
                    // Se o dia já passou neste mês, vai para o próximo mês
                    if (targetDate <= today) {
                        targetDate.setMonth(targetDate.getMonth() + 1);
                    }
                    confidence = 0.85;
                }
            }
            // Formato: DD/MM ou DD/MM/YYYY
            var slashMatch = normalized.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
            if (slashMatch && !targetDate) {
                var day_2 = parseInt(slashMatch[1]);
                var month_1 = parseInt(slashMatch[2]) - 1; // JS months are 0-indexed
                var year_1 = slashMatch[3] ? parseInt(slashMatch[3]) : today.getFullYear();
                // Converter ano de 2 dígitos
                if (year_1 < 100) {
                    year_1 += 2000;
                }
                if (day_2 >= 1 && day_2 <= 31 && month_1 >= 0 && month_1 <= 11) {
                    targetDate = new Date(year_1, month_1, day_2);
                    // Se passou e não especificou ano, vai para o próximo ano
                    if (targetDate <= today && !slashMatch[3]) {
                        targetDate.setFullYear(targetDate.getFullYear() + 1);
                    }
                    confidence = 0.95;
                }
            }
            // Formato: 15 de março, 20 de janeiro
            var mesMatch = normalized.match(/(\d{1,2}) de (\w+)/i);
            if (mesMatch && !targetDate) {
                var day_3 = parseInt(mesMatch[1]);
                var mesText_1 = mesMatch[2].toLowerCase()
                    .replace(/[áàâã]/g, 'a')
                    .replace(/[éèê]/g, 'e')
                    .replace(/[íìî]/g, 'i')
                    .replace(/[óòôõ]/g, 'o')
                    .replace(/[úùû]/g, 'u')
                    .replace(/[ç]/g, 'c');
                var mesesNorm = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
                    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
                var monthIndex = mesesNorm.findIndex(function (m) { return mesText_1.startsWith(m.substring(0, 3)); });
                if (monthIndex >= 0 && day_3 >= 1 && day_3 <= 31) {
                    targetDate = new Date(today.getFullYear(), monthIndex, day_3);
                    // Se passou, vai para o próximo ano
                    if (targetDate <= today) {
                        targetDate.setFullYear(targetDate.getFullYear() + 1);
                    }
                    confidence = 0.9;
                }
            }
        }
    }
    if (!targetDate) {
        return null;
    }
    // Formatar resultado
    var year = targetDate.getFullYear();
    var month = String(targetDate.getMonth() + 1).padStart(2, '0');
    var day = String(targetDate.getDate()).padStart(2, '0');
    return {
        date: "".concat(year, "-").concat(month, "-").concat(day),
        formatted: "".concat(day, "/").concat(month, "/").concat(year),
        dayOfWeek: DIAS_SEMANA[targetDate.getDay()],
        confidence: confidence,
        original: text
    };
}
/**
 * Extrai data de um texto mais longo
 */
function extractDateFromText(text) {
    // Primeiro tenta o texto todo
    var direct = parseNaturalDate(text);
    if (direct)
        return direct;
    // Procura padrões específicos no texto
    var patterns = [
        /(?:para|no|na|em|dia|data|agendar para|marcar para)\s+([^\d]*?\d{1,2}[^\d]*)/i,
        /(?:para|no|na|em)\s+(hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)/i,
        /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/,
        /dia (\d{1,2})/i,
        /(proxim[ao]\s+\w+)/i,
    ];
    for (var _i = 0, patterns_1 = patterns; _i < patterns_1.length; _i++) {
        var pattern = patterns_1[_i];
        var match = text.match(pattern);
        if (match) {
            var result = parseNaturalDate(match[1] || match[0]);
            if (result)
                return result;
        }
    }
    return null;
}
/**
 * Parseia horários em linguagem natural
 */
function parseNaturalTime(text) {
    var normalized = text.toLowerCase().trim()
        .replace(/[áàâã]/g, 'a')
        .replace(/[éèê]/g, 'e')
        .replace(/[íìî]/g, 'i')
        .replace(/[óòôõ]/g, 'o')
        .replace(/[úùû]/g, 'u');
    var hours = null;
    var minutes = 0;
    var confidence = 0.8;
    // ========== FORMATO HH:MM ou HHhMM ==========
    var timeMatch = normalized.match(/(\d{1,2})[:h](\d{2})?/);
    if (timeMatch) {
        hours = parseInt(timeMatch[1]);
        minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        confidence = 0.95;
    }
    // ========== FORMATO "X horas" ou "Xh" ==========
    else if (/(\d{1,2})\s*(?:h(?:oras?)?|hrs?)/.test(normalized)) {
        var match = normalized.match(/(\d{1,2})\s*(?:h(?:oras?)?|hrs?)/);
        if (match) {
            hours = parseInt(match[1]);
            confidence = 0.9;
        }
    }
    // ========== PERÍODOS GENÉRICOS ==========
    else if (/\b(manha|manhã)\b/i.test(text)) {
        hours = 9;
        confidence = 0.5;
    }
    else if (/\b(tarde)\b/i.test(text)) {
        hours = 14;
        confidence = 0.5;
    }
    else if (/\b(noite)\b/i.test(text)) {
        hours = 19;
        confidence = 0.5;
    }
    // ========== MEIO-DIA / MEIA-NOITE ==========
    else if (/meio[- ]?dia/i.test(normalized)) {
        hours = 12;
        confidence = 0.95;
    }
    else if (/meia[- ]?noite/i.test(normalized)) {
        hours = 0;
        confidence = 0.95;
    }
    if (hours === null || hours < 0 || hours > 23) {
        return null;
    }
    // Ajustar para PM se "da tarde" ou "da noite"
    if (hours <= 12) {
        if (/da tarde|pm/i.test(normalized) && hours < 12) {
            hours += 12;
        }
        else if (/da noite/i.test(normalized) && hours < 12 && hours !== 0) {
            hours += 12;
        }
        else if (/da manha|am/i.test(normalized) && hours === 12) {
            hours = 0;
        }
    }
    // Determinar período
    var period;
    if (hours >= 5 && hours < 12) {
        period = 'manha';
    }
    else if (hours >= 12 && hours < 18) {
        period = 'tarde';
    }
    else {
        period = 'noite';
    }
    var timeStr = "".concat(String(hours).padStart(2, '0'), ":").concat(String(minutes).padStart(2, '0'));
    return {
        time: timeStr,
        formatted: "".concat(hours, ":").concat(String(minutes).padStart(2, '0')),
        period: period,
        confidence: confidence,
        original: text
    };
}
/**
 * Extrai horário de um texto mais longo
 */
function extractTimeFromText(text) {
    // Primeiro tenta o texto todo
    var direct = parseNaturalTime(text);
    if (direct)
        return direct;
    // Procura padrões específicos
    var patterns = [
        /(?:as|às|para as|horario|hora)\s*(\d{1,2}[:h]\d{2}|\d{1,2}\s*(?:h(?:oras?)?)?)/i,
        /(\d{1,2}[:h]\d{2})/,
        /(\d{1,2}\s*(?:da manha|da tarde|da noite))/i,
    ];
    for (var _i = 0, patterns_2 = patterns; _i < patterns_2.length; _i++) {
        var pattern = patterns_2[_i];
        var match = text.match(pattern);
        if (match) {
            var result = parseNaturalTime(match[1] || match[0]);
            if (result)
                return result;
        }
    }
    return null;
}
// Dicionário de palavras-chave para cada intenção
var INTENT_KEYWORDS = {
    greeting: ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'eae', 'eai', 'fala', 'salve', 'opa'],
    menu: ['cardapio', 'cardápio', 'menu', 'opcoes', 'opções', 'catalogo', 'catálogo', 'ver', 'mostrar', 'lista', 'servicos', 'serviços'],
    order: ['pedir', 'pedido', 'quero', 'gostaria', 'fazer pedido', 'encomendar', 'delivery', 'entrega', 'comprar'],
    schedule: ['agendar', 'marcar', 'horario', 'horário', 'agenda', 'reservar', 'reserva', 'consulta', 'atendimento', 'disponibilidade', 'data', 'dia'],
    price: ['preco', 'preço', 'valor', 'quanto', 'custo', 'custa', 'valores', 'tabela'],
    service: ['corte', 'escova', 'manicure', 'pedicure', 'massagem', 'limpeza', 'instalacao', 'instalação', 'reparo', 'conserto', 'manutenção', 'manutencao'],
    status: ['status', 'situacao', 'situação', 'andamento', 'onde', 'chegou', 'previsao', 'previsão'],
    cancel: ['cancelar', 'cancela', 'desistir', 'desisto', 'nao quero mais', 'não quero mais'],
    edit: ['alterar', 'mudar', 'trocar', 'editar', 'modificar', 'adicionar', 'remover', 'tirar'],
    address: ['endereco', 'endereço', 'rua', 'avenida', 'numero', 'número', 'bairro', 'cep', 'complemento'],
    payment: ['pagamento', 'pagar', 'pix', 'cartao', 'cartão', 'dinheiro', 'credito', 'crédito', 'debito', 'débito', 'troco'],
    hours: ['horario funcionamento', 'horário funcionamento', 'abre', 'fecha', 'aberto', 'fechado', 'funciona'],
    location: ['onde fica', 'localizacao', 'localização', 'como chego', 'como chegar', 'mapa'],
    human: ['atendente', 'humano', 'pessoa', 'falar com alguem', 'falar com alguém', 'suporte', 'ajuda humana'],
    help: ['ajuda', 'help', 'duvida', 'dúvida', 'como funciona', 'nao entendi', 'não entendi', 'explica'],
    thanks: ['obrigado', 'obrigada', 'valeu', 'vlw', 'brigado', 'agradeco', 'agradeço', 'thanks'],
    bye: ['tchau', 'ate mais', 'até mais', 'adeus', 'bye', 'flw', 'falou', 'fui'],
    confirm: ['sim', 'ok', 'pode', 'certo', 'correto', 'isso', 'confirmo', 'confirma', 'pode ser', 'fechado', 'combinado', 'bora', 's'],
    deny: ['nao', 'não', 'n', 'nope', 'negativo', 'errado', 'incorreto', 'cancela'],
    select_option: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto'],
    provide_info: [], // Detectado por padrões específicos
    unknown: []
};
exports.INTENT_KEYWORDS = INTENT_KEYWORDS;
// Mapeamento de intenções para tipos de nós sugeridos
var INTENT_TO_NODE_TYPES = {
    greeting: ['start', 'message'],
    menu: ['list', 'buttons', 'message'],
    order: ['list', 'buttons', 'delivery_order', 'input'],
    schedule: ['create_appointment', 'input', 'buttons'],
    price: ['message', 'list'],
    service: ['list', 'buttons', 'message'],
    status: ['message', 'condition'],
    cancel: ['message', 'condition'],
    edit: ['input', 'buttons', 'list'],
    address: ['input'],
    payment: ['buttons', 'list'],
    hours: ['check_business_hours', 'message'],
    location: ['message', 'media'],
    human: ['transfer_human'],
    help: ['message', 'buttons'],
    thanks: ['message', 'end'],
    bye: ['end', 'message'],
    confirm: ['condition', 'message'],
    deny: ['condition', 'message'],
    select_option: ['condition', 'goto'],
    provide_info: ['input'],
    unknown: ['message']
};
exports.INTENT_TO_NODE_TYPES = INTENT_TO_NODE_TYPES;
/**
 * Detecta a intenção do usuário a partir da mensagem
 */
function detectIntent(message) {
    var _a;
    var normalized = message.toLowerCase().trim()
        .replace(/[áàâã]/g, 'a')
        .replace(/[éèê]/g, 'e')
        .replace(/[íìî]/g, 'i')
        .replace(/[óòôõ]/g, 'o')
        .replace(/[úùû]/g, 'u')
        .replace(/[ç]/g, 'c');
    var bestMatch = 'unknown';
    var bestConfidence = 0;
    var matchedKeywords = [];
    // Verificar cada categoria de intenção
    for (var _i = 0, _b = Object.entries(INTENT_KEYWORDS); _i < _b.length; _i++) {
        var _c = _b[_i], category = _c[0], keywords = _c[1];
        var cat = category;
        if (keywords.length === 0)
            continue;
        var matches = 0;
        var found = [];
        for (var _d = 0, keywords_1 = keywords; _d < keywords_1.length; _d++) {
            var keyword = keywords_1[_d];
            var regex = new RegExp("\\b".concat(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "\\b"), 'i');
            if (regex.test(normalized) || normalized.includes(keyword)) {
                matches++;
                found.push(keyword);
            }
        }
        if (matches > 0) {
            // Calcular confiança baseada em quantas palavras-chave foram encontradas
            // Para saudações simples (1 palavra), dar confiança alta
            var confidence = Math.min(matches / 2, 1) * 0.9;
            // Se for uma palavra exata (mensagem == keyword), aumentar confiança
            if (keywords.some(function (kw) { return normalized === kw || normalized === kw.replace(/[áàâã]/g, 'a').replace(/[éèê]/g, 'e').replace(/[óòôõ]/g, 'o'); })) {
                confidence = 0.95; // Match exato = 95% confiança
            }
            if (confidence > bestConfidence) {
                bestConfidence = confidence;
                bestMatch = cat;
                matchedKeywords = found;
            }
        }
    }
    // Detectar seleção numérica
    if (/^[1-9]$/.test(normalized) || /^opcao\s*\d$/i.test(normalized)) {
        if (bestConfidence < 0.8) {
            bestMatch = 'select_option';
            bestConfidence = 0.9;
            matchedKeywords = [((_a = normalized.match(/\d/)) === null || _a === void 0 ? void 0 : _a[0]) || ''];
        }
    }
    // Detectar fornecimento de informação (padrões específicos)
    var infoPatterns = [
        { pattern: /\b[a-zA-Z]+@[a-zA-Z]+\.[a-zA-Z]+\b/, type: 'email' },
        { pattern: /\b\d{10,11}\b/, type: 'phone' },
        { pattern: /\b\d{5}-?\d{3}\b/, type: 'cep' },
        { pattern: /\brua\s+.+\d+/i, type: 'address' },
    ];
    for (var _e = 0, infoPatterns_1 = infoPatterns; _e < infoPatterns_1.length; _e++) {
        var _f = infoPatterns_1[_e], pattern = _f.pattern, type = _f.type;
        if (pattern.test(message)) {
            if (bestConfidence < 0.7) {
                bestMatch = 'provide_info';
                bestConfidence = 0.75;
                matchedKeywords = [type];
            }
        }
    }
    // Extrair dados adicionais
    var extractedData = {};
    // Extrair data se relevante
    if (['schedule', 'order'].includes(bestMatch)) {
        var date = extractDateFromText(message);
        if (date)
            extractedData.date = date;
        var time = extractTimeFromText(message);
        if (time)
            extractedData.time = time;
    }
    // Extrair número se é seleção
    if (bestMatch === 'select_option') {
        var numMatch = normalized.match(/\d+/);
        if (numMatch) {
            extractedData.number = parseInt(numMatch[0]);
        }
    }
    return {
        category: bestMatch,
        confidence: bestConfidence,
        keywords: matchedKeywords,
        extractedData: Object.keys(extractedData).length > 0 ? extractedData : undefined,
        suggestedNodeTypes: INTENT_TO_NODE_TYPES[bestMatch]
    };
}
/**
 * Obtém configuração híbrida do chatbot
 */
function getHybridConfig(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var result, row, error_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n        SELECT \n          cc.id,\n          cc.user_id,\n          COALESCE((cc.advanced_settings->>'enable_hybrid_ai')::boolean, false) as enable_hybrid_ai,\n          COALESCE((cc.advanced_settings->>'ai_confidence_threshold')::numeric, 0.7) as ai_confidence_threshold,\n          COALESCE((cc.advanced_settings->>'fallback_to_flow')::boolean, true) as fallback_to_flow,\n          COALESCE((cc.advanced_settings->>'interpret_dates')::boolean, true) as interpret_dates,\n          COALESCE((cc.advanced_settings->>'interpret_times')::boolean, true) as interpret_times,\n          COALESCE(cc.advanced_settings->'intent_keywords', '{}') as intent_keywords\n        FROM chatbot_configs cc\n        WHERE cc.user_id = ", " AND cc.is_active = true\n      "], ["\n        SELECT \n          cc.id,\n          cc.user_id,\n          COALESCE((cc.advanced_settings->>'enable_hybrid_ai')::boolean, false) as enable_hybrid_ai,\n          COALESCE((cc.advanced_settings->>'ai_confidence_threshold')::numeric, 0.7) as ai_confidence_threshold,\n          COALESCE((cc.advanced_settings->>'fallback_to_flow')::boolean, true) as fallback_to_flow,\n          COALESCE((cc.advanced_settings->>'interpret_dates')::boolean, true) as interpret_dates,\n          COALESCE((cc.advanced_settings->>'interpret_times')::boolean, true) as interpret_times,\n          COALESCE(cc.advanced_settings->'intent_keywords', '{}') as intent_keywords\n        FROM chatbot_configs cc\n        WHERE cc.user_id = ", " AND cc.is_active = true\n      "])), userId))];
                            });
                        }); })];
                case 1:
                    result = _a.sent();
                    if (result.rows.length === 0)
                        return [2 /*return*/, null];
                    row = result.rows[0];
                    return [2 /*return*/, {
                            id: row.id,
                            user_id: row.user_id,
                            enable_hybrid_ai: row.enable_hybrid_ai === true,
                            ai_confidence_threshold: parseFloat(row.ai_confidence_threshold) || 0.7,
                            fallback_to_flow: row.fallback_to_flow !== false,
                            interpret_dates: row.interpret_dates !== false,
                            interpret_times: row.interpret_times !== false,
                            intent_keywords: row.intent_keywords || {}
                        }];
                case 2:
                    error_1 = _a.sent();
                    console.error('[HYBRID_AI] Erro ao obter configuração:', error_1);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Processa entrada do usuário com interpretação de data/hora
 * Retorna a mensagem processada com dados extraídos
 */
function processUserInputWithNaturalLanguage(message, config) {
    var intent = detectIntent(message);
    var processedMessage = message;
    // Extrair data se habilitado
    var extractedDate;
    if (config.interpret_dates) {
        var date = extractDateFromText(message);
        if (date) {
            extractedDate = date;
            // Não substituímos o texto original, apenas extraímos
        }
    }
    // Extrair horário se habilitado
    var extractedTime;
    if (config.interpret_times) {
        var time = extractTimeFromText(message);
        if (time) {
            extractedTime = time;
        }
    }
    return {
        originalMessage: message,
        processedMessage: processedMessage,
        extractedDate: extractedDate,
        extractedTime: extractedTime,
        intent: intent
    };
}
/**
 * Encontra o nó mais adequado baseado na intenção detectada
 */
function findNodeByIntent(intent, nodes, currentContext) {
    if (intent.confidence < 0.5)
        return null;
    var suggestedTypes = intent.suggestedNodeTypes || [];
    var _loop_1 = function (nodeType) {
        var matchingNode = nodes.find(function (n) { return n.node_type === nodeType; });
        if (matchingNode) {
            console.log("[HYBRID_AI] Encontrado n\u00F3 ".concat(matchingNode.name, " (").concat(matchingNode.node_type, ") para inten\u00E7\u00E3o ").concat(intent.category));
            return { value: matchingNode.node_id };
        }
    };
    // Priorizar nós pelo tipo sugerido
    for (var _i = 0, suggestedTypes_1 = suggestedTypes; _i < suggestedTypes_1.length; _i++) {
        var nodeType = suggestedTypes_1[_i];
        var state_1 = _loop_1(nodeType);
        if (typeof state_1 === "object")
            return state_1.value;
    }
    var _loop_2 = function (keyword) {
        var matchingNode = nodes.find(function (n) {
            return n.name.toLowerCase().includes(keyword) ||
                JSON.stringify(n.content).toLowerCase().includes(keyword);
        });
        if (matchingNode) {
            console.log("[HYBRID_AI] Encontrado n\u00F3 por keyword: ".concat(matchingNode.name));
            return { value: matchingNode.node_id };
        }
    };
    // Buscar por palavras-chave no nome/conteúdo dos nós
    for (var _a = 0, _b = intent.keywords; _a < _b.length; _a++) {
        var keyword = _b[_a];
        var state_2 = _loop_2(keyword);
        if (typeof state_2 === "object")
            return state_2.value;
    }
    return null;
}
/**
 * Aplica dados extraídos às variáveis do fluxo
 */
function applyExtractedDataToVariables(variables, extractedDate, extractedTime, intent) {
    var _a;
    var updated = __assign({}, variables);
    if (extractedDate) {
        updated['data'] = extractedDate.formatted;
        updated['data_iso'] = extractedDate.date;
        updated['dia_semana'] = extractedDate.dayOfWeek;
        updated['data_agendamento'] = extractedDate.formatted;
        console.log("[HYBRID_AI] Data extra\u00EDda: ".concat(extractedDate.formatted, " (").concat(extractedDate.dayOfWeek, ")"));
    }
    if (extractedTime) {
        updated['horario'] = extractedTime.time;
        updated['hora'] = extractedTime.time;
        updated['periodo'] = extractedTime.period;
        updated['horario_agendamento'] = extractedTime.time;
        console.log("[HYBRID_AI] Hor\u00E1rio extra\u00EDdo: ".concat(extractedTime.time, " (").concat(extractedTime.period, ")"));
    }
    if (((_a = intent === null || intent === void 0 ? void 0 : intent.extractedData) === null || _a === void 0 ? void 0 : _a.number) !== undefined) {
        updated['opcao_selecionada'] = String(intent.extractedData.number);
    }
    return updated;
}
// =============================================================
// 📱 INTEGRAÇÃO COM TRANSCRIÇÃO DE ÁUDIO
// =============================================================
/**
 * Processa texto transcrito de áudio
 * Aplica mesma lógica de interpretação que texto normal
 */
function processTranscribedAudio(transcribedText, config) {
    // Normalizar texto transcrito (pode ter erros de transcrição)
    var normalized = transcribedText
        .replace(/\s+/g, ' ')
        .trim();
    // Aplicar mesma lógica de processamento
    var result = processUserInputWithNaturalLanguage(normalized, config);
    return {
        text: normalized,
        intent: result.intent,
        extractedDate: result.extractedDate,
        extractedTime: result.extractedTime
    };
}
/**
 * Log helper para debug do sistema híbrido
 */
function logHybridDecision(message, intent, decision, nodeId) {
    console.log("\uD83E\uDD16 [HYBRID_AI] ----------------------------------------");
    console.log("\uD83E\uDD16 [HYBRID_AI] Mensagem: \"".concat(message, "\""));
    console.log("\uD83E\uDD16 [HYBRID_AI] Inten\u00E7\u00E3o: ".concat(intent.category, " (").concat((intent.confidence * 100).toFixed(0), "%)"));
    console.log("\uD83E\uDD16 [HYBRID_AI] Keywords: ".concat(intent.keywords.join(', ')));
    console.log("\uD83E\uDD16 [HYBRID_AI] Decis\u00E3o: ".concat(decision).concat(nodeId ? " -> n\u00F3 ".concat(nodeId) : ''));
    if (intent.extractedData) {
        console.log("\uD83E\uDD16 [HYBRID_AI] Dados extra\u00EDdos:", JSON.stringify(intent.extractedData));
    }
    console.log("\uD83E\uDD16 [HYBRID_AI] ----------------------------------------");
}
var templateObject_1;
