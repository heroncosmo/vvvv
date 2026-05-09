"use strict";
/**
 * DELIVERY AI SERVICE - SIMPLIFIED AND DETERMINISTIC
 *
 * ARCHITECTURE (2025):
 * 1. Detects intent before calling the LLM
 * 2. Menu data is injected by the system
 * 3. LLM receives only necessary context
 * 4. Prices/products validated against database
 * 5. Structured JSON responses with message bubbles
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
exports.CATEGORY_KEYWORDS = void 0;
exports.isBusinessOpen = isBusinessOpen;
exports.getCart = getCart;
exports.addToCart = addToCart;
exports.addCustomItemToCart = addCustomItemToCart;
exports.removeFromCart = removeFromCart;
exports.clearCart = clearCart;
exports.getCartSubtotal = getCartSubtotal;
exports.getCartTotal = getCartTotal;
exports.formatCartSummary = formatCartSummary;
exports.detectCategoryFromMessage = detectCategoryFromMessage;
exports.detectSizeFromMessage = detectSizeFromMessage;
exports.detectCustomerIntent = detectCustomerIntent;
exports.detectIntentWithAI = detectIntentWithAI;
exports.isDeliveryEnabled = isDeliveryEnabled;
exports.getDeliveryData = getDeliveryData;
exports.formatMenuAsBubbles = formatMenuAsBubbles;
exports.formatCategoryAsBubbles = formatCategoryAsBubbles;
exports.findItemInMenu = findItemInMenu;
exports.validatePriceInResponse = validatePriceInResponse;
exports.generateDeliveryResponse = generateDeliveryResponse;
exports.parseHalfHalfOrder = parseHalfHalfOrder;
exports.parseOrderItems = parseOrderItems;
exports.findItemByNameFuzzy = findItemByNameFuzzy;
exports.detectCategoryContext = detectCategoryContext;
exports.processOrderFromMessage = processOrderFromMessage;
exports.confirmAndCreateOrder = confirmAndCreateOrder;
exports.processDeliveryMessage = processDeliveryMessage;
var supabaseAuth_1 = require("./supabaseAuth");
var llm_1 = require("./llm");
// Verifica se o estabelecimento estÃƒÂ¡ aberto agora (horÃƒÂ¡rio do Brasil)
function isBusinessOpen(openingHours) {
    // HorÃƒÂ¡rio do Brasil (UTC-3)
    var now = new Date();
    var brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    var dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    var dayNamesPt = {
        sunday: 'domingo',
        monday: 'segunda-feira',
        tuesday: 'terÃƒÂ§a-feira',
        wednesday: 'quarta-feira',
        thursday: 'quinta-feira',
        friday: 'sexta-feira',
        saturday: 'sÃƒÂ¡bado'
    };
    var currentDay = dayNames[brazilTime.getDay()];
    var currentHour = brazilTime.getHours().toString().padStart(2, '0');
    var currentMinute = brazilTime.getMinutes().toString().padStart(2, '0');
    var currentTime = "".concat(currentHour, ":").concat(currentMinute);
    // Ã°Å¸â€ â€¢ FIX: Converter array para Record se necessÃƒÂ¡rio
    // DB armazena como array [{day:"monday",...}], mas funÃƒÂ§ÃƒÂ£o espera Record {monday:{...}}
    var normalizedHours;
    if (Array.isArray(openingHours)) {
        normalizedHours = {};
        for (var _i = 0, openingHours_1 = openingHours; _i < openingHours_1.length; _i++) {
            var entry = openingHours_1[_i];
            if (entry && entry.day) {
                normalizedHours[entry.day] = {
                    open: entry.open || '00:00',
                    close: entry.close || '23:59',
                    enabled: entry.enabled !== false,
                };
            }
        }
    }
    else {
        normalizedHours = openingHours;
    }
    // Se nÃƒÂ£o tem horÃƒÂ¡rios configurados, assume aberto
    if (!normalizedHours || Object.keys(normalizedHours).length === 0) {
        return {
            isOpen: true,
            currentDay: currentDay,
            currentTime: currentTime,
            message: ''
        };
    }
    var todayHours = normalizedHours[currentDay];
    // Se nÃƒÂ£o tem configuraÃƒÂ§ÃƒÂ£o para hoje ou estÃƒÂ¡ desabilitado
    if (!todayHours || !todayHours.enabled) {
        // Encontrar prÃƒÂ³ximo dia aberto
        var nextOpenDay = findNextOpenDay(normalizedHours, currentDay);
        return {
            isOpen: false,
            currentDay: currentDay,
            currentTime: currentTime,
            todayHours: todayHours,
            message: "Estamos fechados hoje (".concat(dayNamesPt[currentDay], "). ").concat(nextOpenDay ? "Abrimos ".concat(nextOpenDay, ".") : 'Confira nossos horÃƒÂ¡rios!')
        };
    }
    // Verificar se estÃƒÂ¡ no horÃƒÂ¡rio
    var openTime = todayHours.open || '00:00';
    var closeTime = todayHours.close || '23:59';
    // Converter para minutos para comparaÃƒÂ§ÃƒÂ£o
    var currentMinutes = parseInt(currentHour) * 60 + parseInt(currentMinute);
    var openMinutes = parseInt(openTime.split(':')[0]) * 60 + parseInt(openTime.split(':')[1] || '0');
    var closeMinutes = parseInt(closeTime.split(':')[0]) * 60 + parseInt(closeTime.split(':')[1] || '0');
    // Caso especial: fechamento apÃƒÂ³s meia-noite (ex: 18:00 - 02:00)
    var isOpen = false;
    if (closeMinutes < openMinutes) {
        // HorÃƒÂ¡rio atravessa meia-noite
        isOpen = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
    }
    else {
        isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    }
    if (isOpen) {
        return {
            isOpen: true,
            currentDay: currentDay,
            currentTime: currentTime,
            todayHours: todayHours,
            message: ''
        };
    }
    else {
        // EstÃƒÂ¡ fechado - antes de abrir ou depois de fechar
        if (currentMinutes < openMinutes) {
            return {
                isOpen: false,
                currentDay: currentDay,
                currentTime: currentTime,
                todayHours: todayHours,
                message: "Ainda n\u00C3\u00A3o abrimos hoje! Nosso hor\u00C3\u00A1rio \u00C3\u00A9 das ".concat(openTime, " \u00C3\u00A0s ").concat(closeTime, ".")
            };
        }
        else {
            return {
                isOpen: false,
                currentDay: currentDay,
                currentTime: currentTime,
                todayHours: todayHours,
                message: "J\u00C3\u00A1 encerramos o atendimento hoje. Nosso hor\u00C3\u00A1rio \u00C3\u00A9 das ".concat(openTime, " \u00C3\u00A0s ").concat(closeTime, ". Volte amanh\u00C3\u00A3! \u00F0\u0178\u02DC\u0160")
            };
        }
    }
}
function formatBusinessHours(openingHours) {
    // Ã°Å¸â€ â€¢ FIX: Converter array para Record se necessÃƒÂ¡rio
    var normalizedHours;
    if (Array.isArray(openingHours)) {
        normalizedHours = {};
        for (var _i = 0, openingHours_2 = openingHours; _i < openingHours_2.length; _i++) {
            var entry = openingHours_2[_i];
            if (entry && entry.day) {
                normalizedHours[entry.day] = {
                    open: entry.open || '00:00',
                    close: entry.close || '23:59',
                    enabled: entry.enabled !== false,
                };
            }
        }
    }
    else {
        normalizedHours = openingHours;
    }
    if (!normalizedHours || Object.keys(normalizedHours).length === 0) {
        return 'HorÃƒÂ¡rios nÃƒÂ£o informados.';
    }
    var dayNamesPt = {
        monday: 'Segunda',
        tuesday: 'TerÃƒÂ§a',
        wednesday: 'Quarta',
        thursday: 'Quinta',
        friday: 'Sexta',
        saturday: 'SÃƒÂ¡bado',
        sunday: 'Domingo'
    };
    var dayOrder = [
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
    ];
    var text = 'Ã°Å¸â€œâ€¦ *Nossos horÃƒÂ¡rios:*\n';
    for (var _a = 0, dayOrder_1 = dayOrder; _a < dayOrder_1.length; _a++) {
        var day = dayOrder_1[_a];
        var dayConfig = normalizedHours[day];
        if (dayConfig && dayConfig.enabled) {
            text += "\u00E2\u20AC\u00A2 ".concat(dayNamesPt[day], ": ").concat(dayConfig.open, " \u00C3\u00A0s ").concat(dayConfig.close, "\n");
        }
    }
    return text.trim();
}
function interpolateDeliveryMessage(template, variables) {
    var result = template || '';
    var replacements = {
        cliente_nome: variables.cliente_nome || variables.nome || variables.name || 'Cliente',
        nome: variables.nome || variables.cliente_nome || variables.name || 'Cliente',
        name: variables.name || variables.cliente_nome || variables.nome || 'Cliente',
        horarios: variables.horarios || '',
        status: variables.status || '',
        pedido_numero: variables.pedido_numero || '',
        total: variables.total || '',
        tempo_estimado: variables.tempo_estimado || '',
    };
    Object.entries(replacements).forEach(function (_a) {
        var key = _a[0], value = _a[1];
        var safeValue = value || '';
        result = result.replace(new RegExp("\\{".concat(key, "\\}"), 'g'), safeValue);
    });
    result = result.replace(/\{\{name\}\}/g, replacements.name || 'Cliente');
    return result;
}
function getCustomerNameFromHistory(conversationHistory) {
    var _a, _b;
    if (!conversationHistory || conversationHistory.length === 0)
        return null;
    var namePatterns = [
        /\bmeu nome (?:e|ÃƒÂ©)\s+([a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§ÃƒÂ±\s]{2,50})/i,
        /\bme chamo\s+([a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§ÃƒÂ±\s]{2,50})/i,
        /\beu sou\s+([a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§ÃƒÂ±\s]{2,50})/i,
        /\bsou\s+(?:o|a)?\s*([a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§ÃƒÂ±\s]{2,50})/i,
        /\bpode me chamar de\s+([a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§ÃƒÂ±\s]{2,50})/i,
    ];
    // 1Ã‚Âª passada: buscar padrÃƒÂµes EXPLÃƒÂCITOS de nome (meu nome ÃƒÂ©, me chamo, etc.)
    for (var i = conversationHistory.length - 1; i >= 0; i--) {
        var entry = conversationHistory[i];
        if (entry.fromMe)
            continue;
        var text = (_a = entry.text) === null || _a === void 0 ? void 0 : _a.trim();
        if (!text)
            continue;
        for (var _i = 0, namePatterns_1 = namePatterns; _i < namePatterns_1.length; _i++) {
            var pattern = namePatterns_1[_i];
            var match = text.match(pattern);
            if (match === null || match === void 0 ? void 0 : match[1]) {
                // Nome extraÃƒÂ­do: capitalizar primeira letra
                var rawName = match[1].trim().split(/\s+/)[0]; // Pegar apenas o primeiro nome
                return rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
            }
        }
    }
    // 2Ã‚Âª passada (fallback): mensagem que parece ser APENAS um nome (max 20 chars, sem palavras comuns)
    var commonWords = /\b(quero|ver|cardapio|cardÃƒÂ¡pio|primeiro|pizza|borda|bebida|adicional|oi|ola|olÃƒÂ¡|boa|noite|tarde|dia|obrigado|obrigada|sim|nao|nÃƒÂ£o|ok|entrega|delivery|retirada|pagar|pagamento|pix|cartao|cartÃƒÂ£o|dinheiro|favor|por|uma|querer|pedido|meu|minha)\b/i;
    for (var i = conversationHistory.length - 1; i >= 0; i--) {
        var entry = conversationHistory[i];
        if (entry.fromMe)
            continue;
        var text = (_b = entry.text) === null || _b === void 0 ? void 0 : _b.trim();
        if (!text || text.length > 20)
            continue; // Nomes reais sÃƒÂ£o curtos (max 20 chars)
        // Verificar se parece nome: sÃƒÂ³ letras, sem palavras comuns, sem dÃƒÂ­gitos
        var looksLikeName = /^[a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§ÃƒÂ±\s]{2,20}$/i.test(text);
        if (looksLikeName && !/\d/.test(text) && !commonWords.test(text)) {
            var rawName = text.split(/\s+/)[0];
            return rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
        }
    }
    return null;
}
function applyHumanization(text, config, allowVariation) {
    if (allowVariation === void 0) { allowVariation = true; }
    if (!(config === null || config === void 0 ? void 0 : config.humanize_responses))
        return text;
    var trimmed = text.trim();
    if (!trimmed)
        return text;
    if (config.response_variation && allowVariation && trimmed.length < 900) {
        var suffixes = [
            'Se precisar de algo, estou por aqui! Ã°Å¸ËœÅ ',
            'Qualquer coisa, ÃƒÂ© sÃƒÂ³ me chamar! Ã°Å¸Ëœâ€°',
            'Fico ÃƒÂ  disposiÃƒÂ§ÃƒÂ£o! Ã°Å¸ËœÅ '
        ];
        var suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        if (!trimmed.endsWith('Ã°Å¸ËœÅ ') && !trimmed.endsWith('Ã°Å¸Ëœâ€°')) {
            return "".concat(trimmed, "\n\n").concat(suffix);
        }
    }
    return trimmed;
}
// Encontra o prÃƒÂ³ximo dia aberto
function findNextOpenDay(openingHours, currentDay) {
    var dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    var dayNamesPt = {
        sunday: 'domingo',
        monday: 'segunda-feira',
        tuesday: 'terÃƒÂ§a-feira',
        wednesday: 'quarta-feira',
        thursday: 'quinta-feira',
        friday: 'sexta-feira',
        saturday: 'sÃƒÂ¡bado'
    };
    var currentIndex = dayNames.indexOf(currentDay);
    for (var i = 1; i <= 7; i++) {
        var nextIndex = (currentIndex + i) % 7;
        var nextDay = dayNames[nextIndex];
        var nextDayHours = openingHours[nextDay];
        if (nextDayHours && nextDayHours.enabled) {
            if (i === 1) {
                return "amanh\u00C3\u00A3 (".concat(dayNamesPt[nextDay], ") \u00C3\u00A0s ").concat(nextDayHours.open);
            }
            return "".concat(dayNamesPt[nextDay], " \u00C3\u00A0s ").concat(nextDayHours.open);
        }
    }
    return null;
}
// Mapeamento de palavras para categorias
exports.CATEGORY_KEYWORDS = {
    'pizza': ['pizza', 'pizzas'],
    'esfirra': ['esfirra', 'esfiha', 'esfirras', 'esfihas', 'sfiha'],
    'bebida': ['bebida', 'bebidas', 'refrigerante', 'refri', 'suco', 'ÃƒÂ¡gua', 'agua'],
    'aÃƒÂ§aÃƒÂ­': ['aÃƒÂ§aÃƒÂ­', 'acai', 'aÃƒÂ§ai'],
    'borda': ['borda', 'bordas', 'borda recheada', 'bordas recheadas'],
    'hamburguer': ['hamburguer', 'hamburger', 'burger', 'lanche', 'lanches'],
    'doce': ['doce', 'doces', 'sobremesa', 'sobremesas'],
    'salgado': ['salgado', 'salgados'],
    'tradicional': ['tradicional', 'tradicionais'],
    'especial': ['especial', 'especiais'],
    'adicional': ['adicional', 'adicionais'],
    'combos': ['combo', 'combos'],
    'porcao': ['porÃƒÂ§ÃƒÂ£o', 'porcao', 'porÃƒÂ§ÃƒÂµes', 'porcoes'],
    'entrada': ['entrada', 'entradas'],
    'massa': ['massa', 'massas', 'macarrÃƒÂ£o', 'macarrao'],
    'sushi': ['sushi', 'sushis', 'temaki', 'sashimi'],
    'promo': ['promoÃƒÂ§ÃƒÂ£o', 'promocao', 'promo', 'promoÃƒÂ§ÃƒÂµes', 'promocoes'],
};
function normalizeCategoryText(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[Ã°Å¸Ââ€¢Ã°Å¸Ââ€Ã°Å¸Â¥ÂªÃ°Å¸ÂÂ½Ã¯Â¸ÂÃ°Å¸ÂÂ¨Ã°Å¸ÂÂ£Ã°Å¸ÂÂ´Ã°Å¸Â¥Å¸Ã°Å¸ÂÂ«]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Ã°Å¸â€ â€¢ Smart category text matching com awareness de word-boundary.
 * Previne falsos positivos como "tradicionais" matchando "adicionais"
 * (substring na posiÃƒÂ§ÃƒÂ£o 2, sem ser fronteira de palavra).
 */
function smartCategoryMatch(text1, text2) {
    if (!text1 || !text2)
        return false;
    // Exact match
    if (text1 === text2)
        return true;
    // Shorter text is a substring of longer text
    var _a = text1.length <= text2.length ? [text1, text2] : [text2, text1], shorter = _a[0], longer = _a[1];
    if (shorter.length >= 3 && longer.includes(shorter)) {
        var idx = longer.indexOf(shorter);
        // Match must start at beginning or after a word boundary (space)
        if (idx === 0 || longer[idx - 1] === ' ') {
            return true;
        }
    }
    return false;
}
function normalizeMenuSendMode(value) {
    return String(value || 'text').trim().toLowerCase();
}
function parseOptionalNumber(value) {
    if (value === null || value === undefined || value === '')
        return null;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    var raw = String(value).trim();
    var normalized = raw.includes(',') && raw.includes('.')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(',', '.');
    var parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}
function formatCurrency(value) {
    return "R$ ".concat(value.toFixed(2).replace('.', ','));
}
function formatDistance(distanceKm) {
    if (distanceKm === null || distanceKm === undefined || !Number.isFinite(distanceKm)) {
        return 'distÃ¢ncia nÃ£o calculada';
    }
    if (distanceKm < 1) {
        return "".concat(Math.round(distanceKm * 1000), " m");
    }
    return "".concat(distanceKm.toFixed(1).replace('.', ','), " km");
}
function normalizePixSettings(raw) {
    return {
        key: typeof (raw === null || raw === void 0 ? void 0 : raw.key) === 'string' ? raw.key.trim() : '',
        keyType: typeof (raw === null || raw === void 0 ? void 0 : raw.keyType) === 'string' ? raw.keyType.trim() : '',
        holderName: typeof (raw === null || raw === void 0 ? void 0 : raw.holderName) === 'string' ? raw.holderName.trim() : '',
        bankName: typeof (raw === null || raw === void 0 ? void 0 : raw.bankName) === 'string' ? raw.bankName.trim() : '',
        instructions: typeof (raw === null || raw === void 0 ? void 0 : raw.instructions) === 'string' ? raw.instructions.trim() : '',
        requireProof: (raw === null || raw === void 0 ? void 0 : raw.requireProof) === true,
    };
}
function normalizeCashSettings(raw) {
    return {
        askForChange: (raw === null || raw === void 0 ? void 0 : raw.askForChange) !== false,
    };
}
function normalizeDeliveryFeeSettings(config) {
    var _a, _b, _c, _d, _e;
    var raw = config.delivery_fee_settings || {};
    var baseFee = (_b = (_a = parseOptionalNumber(raw.baseFee)) !== null && _a !== void 0 ? _a : config.delivery_fee) !== null && _b !== void 0 ? _b : 0;
    return {
        mode: (raw === null || raw === void 0 ? void 0 : raw.mode) === 'distance' ? 'distance' : 'fixed',
        originAddress: typeof (raw === null || raw === void 0 ? void 0 : raw.originAddress) === 'string' ? raw.originAddress.trim() : '',
        baseFee: baseFee,
        baseDistanceKm: (_c = parseOptionalNumber(raw === null || raw === void 0 ? void 0 : raw.baseDistanceKm)) !== null && _c !== void 0 ? _c : 2,
        additionalFeePerKm: (_d = parseOptionalNumber(raw === null || raw === void 0 ? void 0 : raw.additionalFeePerKm)) !== null && _d !== void 0 ? _d : 1,
        maxDistanceKm: parseOptionalNumber(raw === null || raw === void 0 ? void 0 : raw.maxDistanceKm),
        fallbackFee: (_e = parseOptionalNumber(raw === null || raw === void 0 ? void 0 : raw.fallbackFee)) !== null && _e !== void 0 ? _e : baseFee,
    };
}
function normalizePaymentMethods(methods) {
    var items = (methods || ['dinheiro', 'cartao', 'pix'])
        .map(function (method) { return normalizeTextForMatch(String(method || '')); })
        .filter(Boolean);
    return Array.from(new Set(items));
}
function getPaymentMethodLabel(method) {
    var normalized = normalizeTextForMatch(method || '');
    if (normalized.includes('pix'))
        return 'Pix';
    if (normalized.includes('dinheiro'))
        return 'Dinheiro';
    if (normalized.includes('cartao') || normalized.includes('credito') || normalized.includes('debito'))
        return 'CartÃ£o';
    return method || 'NÃ£o informado';
}
function isCashPayment(method) {
    return normalizeTextForMatch(method || '').includes('dinheiro');
}
function isPixPayment(method) {
    return normalizeTextForMatch(method || '').includes('pix');
}
function getPixConfig(config) {
    return normalizePixSettings(config.pix_settings);
}
function getCashConfig(config) {
    return normalizeCashSettings(config.cash_settings);
}
function buildPaymentMethodsText(config) {
    return normalizePaymentMethods(config.payment_methods)
        .map(function (method) { return getPaymentMethodLabel(method); })
        .join(', ');
}
function buildPixSummaryLines(config) {
    var pixSettings = getPixConfig(config);
    if (!pixSettings.key)
        return [];
    var lines = ["Chave Pix: ".concat(pixSettings.key)];
    if (pixSettings.keyType)
        lines.push("Tipo da chave: ".concat(pixSettings.keyType));
    if (pixSettings.holderName)
        lines.push("Titular: ".concat(pixSettings.holderName));
    if (pixSettings.bankName)
        lines.push("Banco: ".concat(pixSettings.bankName));
    if (pixSettings.instructions)
        lines.push(pixSettings.instructions);
    if (pixSettings.requireProof)
        lines.push('Envie o comprovante de pagamento no chat apÃ³s concluir o Pix.');
    return lines;
}
function haversineDistanceKm(fromLat, fromLon, toLat, toLon) {
    var earthRadiusKm = 6371;
    var dLat = (toLat - fromLat) * Math.PI / 180;
    var dLon = (toLon - fromLon) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(fromLat * Math.PI / 180) *
            Math.cos(toLat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
}
function geocodeAddress(address) {
    return __awaiter(this, void 0, void 0, function () {
        var query, response, data, match, lat, lon, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    query = address.trim();
                    if (!query)
                        return [2 /*return*/, null];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=".concat(encodeURIComponent(query)), {
                            headers: {
                                'User-Agent': 'AgenteZap/Delivery',
                                'Accept-Language': 'pt-BR',
                            },
                        })];
                case 2:
                    response = _a.sent();
                    if (!response.ok)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, response.json()];
                case 3:
                    data = _a.sent();
                    match = data === null || data === void 0 ? void 0 : data[0];
                    if (!match)
                        return [2 /*return*/, null];
                    lat = Number.parseFloat(match.lat);
                    lon = Number.parseFloat(match.lon);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon))
                        return [2 /*return*/, null];
                    return [2 /*return*/, { lat: lat, lon: lon }];
                case 4:
                    error_1 = _a.sent();
                    console.warn('[DeliveryAI] Falha ao geocodificar endereÃ§o:', error_1);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function getDrivingDistanceKm(origin, destination) {
    return __awaiter(this, void 0, void 0, function () {
        var response, data, meters, error_2;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fetch("https://router.project-osrm.org/route/v1/driving/".concat(origin.lon, ",").concat(origin.lat, ";").concat(destination.lon, ",").concat(destination.lat, "?overview=false"), {
                            headers: { 'User-Agent': 'AgenteZap/Delivery' },
                        })];
                case 1:
                    response = _c.sent();
                    if (!response.ok)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, response.json()];
                case 2:
                    data = _c.sent();
                    meters = (_b = (_a = data.routes) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.distance;
                    if (!Number.isFinite(meters))
                        return [2 /*return*/, null];
                    return [2 /*return*/, meters / 1000];
                case 3:
                    error_2 = _c.sent();
                    console.warn('[DeliveryAI] Falha ao consultar rota OSRM:', error_2);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function calculateDeliveryFee(config, deliveryAddress) {
    return __awaiter(this, void 0, void 0, function () {
        var feeSettings, fallbackFee, _a, origin, destination, routeDistanceKm, distanceKm, extraDistanceKm, fee;
        var _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    feeSettings = normalizeDeliveryFeeSettings(config);
                    fallbackFee = (_c = (_b = feeSettings.fallbackFee) !== null && _b !== void 0 ? _b : config.delivery_fee) !== null && _c !== void 0 ? _c : 0;
                    if (feeSettings.mode !== 'distance') {
                        return [2 /*return*/, {
                                fee: (_e = (_d = config.delivery_fee) !== null && _d !== void 0 ? _d : feeSettings.baseFee) !== null && _e !== void 0 ? _e : fallbackFee,
                                distanceKm: null,
                                mode: 'fixed',
                                label: 'Taxa fixa',
                            }];
                    }
                    if (!feeSettings.originAddress || !deliveryAddress) {
                        return [2 /*return*/, {
                                fee: fallbackFee,
                                distanceKm: null,
                                mode: 'fallback',
                                label: 'Taxa estimada',
                                details: 'A taxa definitiva serÃ¡ calculada quando o endereÃ§o estiver completo.',
                            }];
                    }
                    return [4 /*yield*/, Promise.all([
                            geocodeAddress(feeSettings.originAddress),
                            geocodeAddress(deliveryAddress),
                        ])];
                case 1:
                    _a = _g.sent(), origin = _a[0], destination = _a[1];
                    if (!origin || !destination) {
                        return [2 /*return*/, {
                                fee: fallbackFee,
                                distanceKm: null,
                                mode: 'fallback',
                                label: 'Taxa de fallback',
                                details: 'NÃ£o foi possÃ­vel calcular a distÃ¢ncia automaticamente.',
                            }];
                    }
                    return [4 /*yield*/, getDrivingDistanceKm(origin, destination)];
                case 2:
                    routeDistanceKm = (_f = _g.sent()) !== null && _f !== void 0 ? _f : haversineDistanceKm(origin.lat, origin.lon, destination.lat, destination.lon);
                    distanceKm = Math.round(routeDistanceKm * 10) / 10;
                    if (feeSettings.maxDistanceKm && distanceKm > feeSettings.maxDistanceKm) {
                        return [2 /*return*/, {
                                fee: fallbackFee,
                                distanceKm: distanceKm,
                                mode: 'fallback',
                                label: 'Taxa fora do raio',
                                details: "Endere\u00E7o estimado em ".concat(formatDistance(distanceKm), ", acima do raio configurado."),
                            }];
                    }
                    extraDistanceKm = Math.max(0, distanceKm - feeSettings.baseDistanceKm);
                    fee = Math.round((feeSettings.baseFee + (extraDistanceKm * feeSettings.additionalFeePerKm)) * 100) / 100;
                    return [2 /*return*/, {
                            fee: fee,
                            distanceKm: distanceKm,
                            mode: 'distance',
                            label: 'Taxa por distÃ¢ncia',
                            details: "".concat(formatDistance(distanceKm), " desde a origem configurada."),
                        }];
            }
        });
    });
}
function buildDeliveryOrderNotes(customerInfo, deliveryFeeInfo) {
    var notes = [];
    if (customerInfo.changeNeeded === false) {
        notes.push('Pagamento em dinheiro sem necessidade de troco.');
    }
    else if (customerInfo.changeNeeded === true && customerInfo.changeForAmount) {
        notes.push("Troco para ".concat(formatCurrency(customerInfo.changeForAmount), "."));
    }
    else if (customerInfo.changeNeeded === true) {
        notes.push('Cliente informou que precisa de troco, mas nÃ£o informou o valor.');
    }
    if ((deliveryFeeInfo === null || deliveryFeeInfo === void 0 ? void 0 : deliveryFeeInfo.distanceKm) !== null && (deliveryFeeInfo === null || deliveryFeeInfo === void 0 ? void 0 : deliveryFeeInfo.distanceKm) !== undefined) {
        notes.push("Dist\u00E2ncia estimada: ".concat(formatDistance(deliveryFeeInfo.distanceKm), "."));
    }
    if (deliveryFeeInfo === null || deliveryFeeInfo === void 0 ? void 0 : deliveryFeeInfo.mode) {
        notes.push("C\u00E1lculo da taxa: ".concat(deliveryFeeInfo.label, "."));
    }
    return notes.length > 0 ? notes.join(' ') : null;
}
// Armazena carrinhos por chave: "userId:customerPhone"
var cartsCache = new Map();
var conversationCartBindings = new Map();
function buildCartKey(userId, customerPhone) {
    return "".concat(userId, ":").concat(customerPhone);
}
function buildConversationCartBindingKey(userId, conversationId) {
    return "".concat(userId, ":conversation:").concat(conversationId);
}
function bindConversationToCart(userId, conversationId, cartKey) {
    if (!conversationId)
        return;
    conversationCartBindings.set(buildConversationCartBindingKey(userId, conversationId), cartKey);
}
function resolveCartReference(userId, customerPhone, conversationId) {
    if (customerPhone) {
        var phoneKey = buildCartKey(userId, customerPhone);
        var phoneCart = cartsCache.get(phoneKey);
        if (phoneCart) {
            bindConversationToCart(userId, conversationId, phoneKey);
            return { key: phoneKey, cart: phoneCart };
        }
    }
    if (conversationId) {
        var boundKey = conversationCartBindings.get(buildConversationCartBindingKey(userId, conversationId));
        if (boundKey) {
            var boundCart = cartsCache.get(boundKey);
            if (boundCart) {
                if (customerPhone) {
                    var phoneKey = buildCartKey(userId, customerPhone);
                    if (phoneKey !== boundKey) {
                        cartsCache.set(phoneKey, boundCart);
                        bindConversationToCart(userId, conversationId, phoneKey);
                        boundCart.customerPhone = customerPhone;
                        return { key: phoneKey, cart: boundCart };
                    }
                }
                return { key: boundKey, cart: boundCart };
            }
            conversationCartBindings.delete(buildConversationCartBindingKey(userId, conversationId));
        }
    }
    return null;
}
function getExistingCart(userId, customerPhone, conversationId) {
    var _a;
    return ((_a = resolveCartReference(userId, customerPhone, conversationId)) === null || _a === void 0 ? void 0 : _a.cart) || null;
}
function isSyntheticConversationId(conversationId) {
    if (!conversationId)
        return false;
    return (conversationId.startsWith('sim-') ||
        conversationId.startsWith('simulator-') ||
        conversationId.startsWith('simulator-chatbot-'));
}
// Limpar carrinhos antigos (mais de 2 horas)
var CART_EXPIRY_MS = 2 * 60 * 60 * 1000;
function cleanOldCarts() {
    var now = Date.now();
    for (var _i = 0, _a = cartsCache.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], cart = _b[1];
        if (now - cart.lastUpdated.getTime() > CART_EXPIRY_MS) {
            cartsCache.delete(key);
            console.log("\u00F0\u0178\u203A\u2019 [Cart] Carrinho expirado removido: ".concat(key));
        }
    }
}
// Limpar a cada 30 minutos
setInterval(cleanOldCarts, 30 * 60 * 1000);
function getCart(userId, customerPhone, conversationId) {
    var existingReference = resolveCartReference(userId, customerPhone, conversationId);
    if (existingReference) {
        bindConversationToCart(userId, conversationId, buildCartKey(userId, customerPhone));
        existingReference.cart.customerPhone = customerPhone;
        return existingReference.cart;
    }
    var key = buildCartKey(userId, customerPhone);
    var cart = cartsCache.get(key);
    if (!cart) {
        cart = {
            items: new Map(),
            customerPhone: customerPhone,
            deliveryType: null,
            paymentMethod: null,
            address: null,
            customerName: null,
            awaitingConfirmation: false,
            checkoutState: null,
            createdAt: new Date(),
            lastUpdated: new Date(),
        };
        cartsCache.set(key, cart);
        bindConversationToCart(userId, conversationId, key);
        console.log("\u00F0\u0178\u203A\u2019 [Cart] Novo carrinho criado: ".concat(key));
    }
    return cart;
}
function addToCart(userId, customerPhone, item, quantity, options) {
    var _a;
    if (quantity === void 0) { quantity = 1; }
    var cart = getCart(userId, customerPhone);
    var itemKey = (options === null || options === void 0 ? void 0 : options.itemKeySuffix) ? "".concat(item.id, ":").concat(options.itemKeySuffix) : item.id;
    var displayName = (options === null || options === void 0 ? void 0 : options.displayName) || item.name;
    var unitPrice = (_a = options === null || options === void 0 ? void 0 : options.priceOverride) !== null && _a !== void 0 ? _a : item.price;
    var notes = options === null || options === void 0 ? void 0 : options.notes;
    var optionsSelected = options === null || options === void 0 ? void 0 : options.optionsSelected;
    var existing = cart.items.get(itemKey);
    if (existing) {
        existing.quantity += quantity;
        if (notes)
            existing.notes = notes;
        if (optionsSelected)
            existing.optionsSelected = optionsSelected;
        console.log("\u00F0\u0178\u203A\u2019 [Cart] Item atualizado: ".concat(displayName, " x").concat(existing.quantity));
    }
    else {
        cart.items.set(itemKey, {
            itemId: itemKey,
            menuItemId: item.id,
            name: displayName,
            price: unitPrice,
            quantity: quantity,
            notes: notes,
            optionsSelected: optionsSelected,
        });
        console.log("\u00F0\u0178\u203A\u2019 [Cart] Item adicionado: ".concat(displayName, " x").concat(quantity));
    }
    cart.awaitingConfirmation = false;
    cart.checkoutState = null;
    cart.lastUpdated = new Date();
    return cart;
}
function addCustomItemToCart(userId, customerPhone, customItem) {
    var _a, _b;
    var cart = getCart(userId, customerPhone);
    var quantity = (_a = customItem.quantity) !== null && _a !== void 0 ? _a : 1;
    var existing = cart.items.get(customItem.itemId);
    if (existing) {
        existing.quantity += quantity;
        if (customItem.notes)
            existing.notes = customItem.notes;
        if (customItem.optionsSelected)
            existing.optionsSelected = customItem.optionsSelected;
        console.log("\u00F0\u0178\u203A\u2019 [Cart] Item custom atualizado: ".concat(customItem.name, " x").concat(existing.quantity));
    }
    else {
        cart.items.set(customItem.itemId, {
            itemId: customItem.itemId,
            menuItemId: (_b = customItem.menuItemId) !== null && _b !== void 0 ? _b : null,
            name: customItem.name,
            price: customItem.price,
            quantity: quantity,
            notes: customItem.notes,
            optionsSelected: customItem.optionsSelected,
        });
        console.log("\u00F0\u0178\u203A\u2019 [Cart] Item custom adicionado: ".concat(customItem.name, " x").concat(quantity));
    }
    cart.awaitingConfirmation = false;
    cart.checkoutState = null;
    cart.lastUpdated = new Date();
    return cart;
}
function removeFromCart(userId, customerPhone, itemId) {
    var cart = getCart(userId, customerPhone);
    var removed = cart.items.delete(itemId);
    cart.awaitingConfirmation = false;
    cart.checkoutState = null;
    cart.lastUpdated = new Date();
    return removed;
}
function clearCart(userId, customerPhone, conversationId) {
    var _a;
    var key = ((_a = resolveCartReference(userId, customerPhone, conversationId)) === null || _a === void 0 ? void 0 : _a.key) || buildCartKey(userId, customerPhone);
    cartsCache.delete(key);
    if (conversationId) {
        conversationCartBindings.delete(buildConversationCartBindingKey(userId, conversationId));
    }
    for (var _i = 0, _b = conversationCartBindings.entries(); _i < _b.length; _i++) {
        var _c = _b[_i], bindingKey = _c[0], boundCartKey = _c[1];
        if (boundCartKey === key && bindingKey.startsWith("".concat(userId, ":conversation:"))) {
            conversationCartBindings.delete(bindingKey);
        }
    }
    console.log("\u00F0\u0178\u203A\u2019 [Cart] Carrinho limpo: ".concat(key));
}
function getCartSubtotal(cart) {
    var total = 0;
    for (var _i = 0, _a = cart.items.values(); _i < _a.length; _i++) {
        var item = _a[_i];
        total += item.price * item.quantity;
    }
    return Math.round(total * 100) / 100;
}
function getCartTotal(cart, deliveryFee) {
    var subtotal = getCartSubtotal(cart);
    var fee = cart.deliveryType === 'delivery' ? deliveryFee : 0;
    return Math.round((subtotal + fee) * 100) / 100;
}
function formatCartSummary(cart, deliveryFee) {
    var _a;
    if (cart.items.size === 0) {
        return 'Seu carrinho estÃƒÂ¡ vazio. Ã°Å¸â€ºâ€™\n\nMe diga o que deseja pedir!';
    }
    var text = "\u00F0\u0178\u203A\u2019 *SEU PEDIDO*\n";
    text += "\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\n";
    for (var _i = 0, _b = cart.items.values(); _i < _b.length; _i++) {
        var item = _b[_i];
        var itemTotal = item.price * item.quantity;
        text += "".concat(item.quantity, "x ").concat(item.name, " - R$ ").concat(itemTotal.toFixed(2).replace('.', ','), "\n");
        var addOns = ((_a = item.optionsSelected) === null || _a === void 0 ? void 0 : _a.filter(function (opt) { return !/tamanho|size/i.test(opt.group); })) || [];
        if (addOns.length > 0) {
            text += "   _Adicionais: ".concat(addOns.map(function (opt) { return opt.option; }).join(', '), "_\n");
        }
        if (item.notes) {
            text += "   _Obs: ".concat(item.notes, "_\n");
        }
    }
    var subtotal = getCartSubtotal(cart);
    text += "\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\n";
    text += "\u00F0\u0178\u201C\u00A6 Subtotal: R$ ".concat(subtotal.toFixed(2).replace('.', ','), "\n");
    if (cart.deliveryType === 'delivery') {
        text += "\u00F0\u0178\u203A\u00B5 Taxa entrega: R$ ".concat(deliveryFee.toFixed(2).replace('.', ','), "\n");
        text += "\u00F0\u0178\u2019\u00B0 *Total: R$ ".concat((subtotal + deliveryFee).toFixed(2).replace('.', ','), "*\n");
    }
    else if (cart.deliveryType === 'pickup') {
        text += "\u00F0\u0178\u008F\u00AA Retirada: GR\u00C3\u0081TIS\n";
        text += "\u00F0\u0178\u2019\u00B0 *Total: R$ ".concat(subtotal.toFixed(2).replace('.', ','), "*\n");
    }
    return text;
}
function isSizeOptionGroup(groupName) {
    var normalized = normalizeTextForMatch(groupName);
    return normalized.includes('tamanho') || normalized.includes('size');
}
function findMenuItemById(deliveryData, menuItemId) {
    if (!menuItemId)
        return null;
    for (var _i = 0, _a = deliveryData.categories; _i < _a.length; _i++) {
        var category = _a[_i];
        for (var _b = 0, _c = category.items; _b < _c.length; _b++) {
            var item = _c[_b];
            if (item.id === menuItemId) {
                return item;
            }
        }
    }
    return null;
}
function detectOptionGroupHint(message) {
    var normalized = normalizeTextForMatch(message);
    if (normalized.includes('borda') || normalized.includes('reche')) {
        return 'borda';
    }
    if (normalized.includes('adicional') || normalized.includes('extra') || normalized.includes('complemento')) {
        return 'adicional';
    }
    if (normalized.includes('tamanho') || normalized.includes('size')) {
        return 'tamanho';
    }
    return null;
}
function optionGroupMatchesHint(group, hint) {
    var normalizedGroup = normalizeTextForMatch(group.name);
    if (hint === 'borda') {
        return normalizedGroup.includes('borda') || normalizedGroup.includes('reche');
    }
    if (hint === 'adicional') {
        return normalizedGroup.includes('adicional') || normalizedGroup.includes('extra') || normalizedGroup.includes('complement');
    }
    return isSizeOptionGroup(group.name);
}
function buildCartNotesFromOptions(optionsSelected) {
    if (!optionsSelected.length)
        return undefined;
    var noteParts = [];
    var sizeOption = optionsSelected.find(function (opt) { return isSizeOptionGroup(opt.group); });
    var addOns = optionsSelected.filter(function (opt) { return !isSizeOptionGroup(opt.group); });
    if (sizeOption) {
        noteParts.push("Tamanho: ".concat(sizeOption.option));
    }
    if (addOns.length > 0) {
        noteParts.push("Adicionais: ".concat(addOns.map(function (opt) { return opt.option; }).join(', ')));
    }
    return noteParts.length > 0 ? noteParts.join(' | ') : undefined;
}
function findRelevantOptionGroup(deliveryData, hint, cart) {
    var _a;
    var preferredMenuItemIds = new Set(Array.from((cart === null || cart === void 0 ? void 0 : cart.items.values()) || [])
        .map(function (item) { return item.menuItemId; })
        .filter(function (value) { return !!value; }));
    var bestMatch = null;
    for (var _i = 0, _b = deliveryData.categories; _i < _b.length; _i++) {
        var category = _b[_i];
        var categoryNormalized = normalizeTextForMatch(category.name);
        for (var _c = 0, _d = category.items; _c < _d.length; _c++) {
            var item = _d[_c];
            for (var _e = 0, _f = item.options || []; _e < _f.length; _e++) {
                var group = _f[_e];
                if (!((_a = group.options) === null || _a === void 0 ? void 0 : _a.length))
                    continue;
                if (!optionGroupMatchesHint(group, hint))
                    continue;
                var score = 0;
                if (preferredMenuItemIds.has(item.id))
                    score += 100;
                if (categoryNormalized.includes('pizza'))
                    score += 25;
                if (!isSizeOptionGroup(group.name))
                    score += 10;
                if (!bestMatch || score > bestMatch.score) {
                    bestMatch = {
                        score: score,
                        value: {
                            item: item,
                            categoryName: category.name,
                            group: group,
                        },
                    };
                }
            }
        }
    }
    return (bestMatch === null || bestMatch === void 0 ? void 0 : bestMatch.value) || null;
}
function formatOptionGroupPrompt(match) {
    var optionsText = match.group.options
        .map(function (opt) { return "\u2022 ".concat(opt.name).concat(opt.price > 0 ? " - R$ ".concat(opt.price.toFixed(2).replace('.', ',')) : ''); })
        .join('\n');
    return "\uD83C\uDF55 Para *".concat(match.item.name, "*, estas s\u00E3o as op\u00E7\u00F5es de *").concat(match.group.name, "*:\n\n").concat(optionsText, "\n\nSe quiser, me diga qual op\u00E7\u00E3o voc\u00EA prefere que eu adiciono ao pedido.");
}
function buildRealMenuSuggestions(deliveryData, cart) {
    var cartCategories = new Set(Array.from((cart === null || cart === void 0 ? void 0 : cart.items.values()) || [])
        .map(function (item) { var _a; return (_a = findMenuItemById(deliveryData, item.menuItemId)) === null || _a === void 0 ? void 0 : _a.category_name; })
        .filter(function (value) { return !!value; })
        .map(function (value) { return normalizeTextForMatch(value); }));
    var ranked = deliveryData.categories
        .filter(function (category) { return category.items.length > 0; })
        .map(function (category) {
        var normalized = normalizeTextForMatch(category.name);
        var score = 0;
        if (normalized.includes('refriger') || normalized.includes('bebida'))
            score += 100;
        if (!cartCategories.has(normalized))
            score += 30;
        if (normalized.includes('pizza'))
            score -= 10;
        return { name: category.name, score: score };
    })
        .sort(function (a, b) { return b.score - a.score; });
    return ranked.slice(0, 2).map(function (item) { return item.name; });
}
function buildPostAddFollowUp(deliveryData, cart) {
    var suggestions = buildRealMenuSuggestions(deliveryData, cart);
    var message = '\n\nDeseja mais alguma coisa?';
    if (suggestions.length === 1) {
        message += " Posso te mostrar *".concat(suggestions[0], "*.");
    }
    else if (suggestions.length >= 2) {
        message += " Posso te mostrar *".concat(suggestions[0], "* ou *").concat(suggestions[1], "*.");
    }
    message += "\n\nPara finalizar, me diga:\n\uD83D\uDCDD Nome\n\uD83D\uDE9A Tipo de entrega: ".concat(deliveryData.config.accepts_delivery && deliveryData.config.accepts_pickup
        ? 'ðŸ›µ Delivery ou ðŸª Retirada'
        : deliveryData.config.accepts_delivery
            ? 'ðŸ›µ Delivery'
            : 'ðŸª Retirada', "\n\uD83D\uDCCD Endere\u00E7o (se for entrega)\n\uD83D\uDCB3 Forma de pagamento");
    return message;
}
function formatUnavailableOptionGroupMessage(hint, deliveryData, cart) {
    var suggestions = buildRealMenuSuggestions(deliveryData, cart);
    if (hint === 'borda') {
        if (suggestions.length >= 2) {
            return "No card\u00E1pio configurado agora n\u00E3o h\u00E1 op\u00E7\u00F5es de *borda recheada* cadastradas.\n\nPosso seguir com a pizza como est\u00E1 ou te mostrar *".concat(suggestions[0], "* e *").concat(suggestions[1], "*.");
        }
        if (suggestions.length === 1) {
            return "No card\u00E1pio configurado agora n\u00E3o h\u00E1 op\u00E7\u00F5es de *borda recheada* cadastradas.\n\nPosso seguir com a pizza como est\u00E1 ou te mostrar *".concat(suggestions[0], "*.");
        }
        return "No card\u00E1pio configurado agora n\u00E3o h\u00E1 op\u00E7\u00F5es de *borda recheada* cadastradas.\n\nPosso seguir com a pizza como est\u00E1 ou continuar para finalizar o pedido.";
    }
    return "No card\u00E1pio configurado agora n\u00E3o encontrei op\u00E7\u00F5es de *".concat(hint, "* cadastradas.\n\nPosso seguir com o pedido atual ou te mostrar outras categorias dispon\u00EDveis.");
}
function shouldTreatMessageAsOptionGroupQuery(message, cart) {
    if (!cart || cart.items.size === 0)
        return false;
    var normalized = normalizeTextForMatch(message);
    if (!normalized)
        return false;
    if (cart.awaitingConfirmation) {
        return true;
    }
    var acceptanceSignals = [
        'sem borda',
        'segue como esta',
        'segue como ta',
        'pode seguir',
        'pode ser assim',
    ];
    var customerInfoSignals = [
        'entrega',
        'delivery',
        'retirada',
        'retirar',
        'pix',
        'dinheiro',
        'cartao',
        'credito',
        'debito',
        'rua',
        'avenida',
        'travessa',
        'alameda',
        'bairro',
    ];
    if (acceptanceSignals.some(function (signal) { return normalized.includes(signal); })) {
        return false;
    }
    if (customerInfoSignals.some(function (signal) { return normalized.includes(signal); })) {
        return false;
    }
    var questionSignals = [
        'qual',
        'quais',
        'tem',
        'opcao',
        'opcoes',
        'mostra',
        'mostrar',
        'ver',
    ];
    if (normalized.startsWith('sim')) {
        return true;
    }
    return questionSignals.some(function (signal) { return normalized.includes(signal); });
}
function findCartOptionSelection(deliveryData, cart, message, conversationHistory) {
    var _a, _b;
    var normalizedMessage = normalizeTextForMatch(message);
    var groupHint = detectOptionGroupHint(message);
    var recentBotText = normalizeTextForMatch(((_a = conversationHistory === null || conversationHistory === void 0 ? void 0 : conversationHistory.filter(function (entry) { return entry.fromMe; }).slice(-1)[0]) === null || _a === void 0 ? void 0 : _a.text) || '');
    var bestMatch = null;
    for (var _i = 0, _c = cart.items.entries(); _i < _c.length; _i++) {
        var _d = _c[_i], cartItemId = _d[0], cartItem = _d[1];
        var menuItem = findMenuItemById(deliveryData, cartItem.menuItemId);
        if (!menuItem)
            continue;
        for (var _e = 0, _f = menuItem.options || []; _e < _f.length; _e++) {
            var group = _f[_e];
            if (!((_b = group.options) === null || _b === void 0 ? void 0 : _b.length) || isSizeOptionGroup(group.name))
                continue;
            var groupIsHinted = groupHint ? optionGroupMatchesHint(group, groupHint) : false;
            var normalizedGroup = normalizeTextForMatch(group.name);
            for (var _g = 0, _h = group.options; _g < _h.length; _g++) {
                var option = _h[_g];
                var normalizedOption = normalizeTextForMatch(option.name);
                if (!normalizedOption)
                    continue;
                var mentionsOption = normalizedMessage.includes(normalizedOption) || normalizedOption.includes(normalizedMessage);
                if (!mentionsOption)
                    continue;
                var score = 100;
                if (groupIsHinted)
                    score += 40;
                if (recentBotText.includes(normalizedGroup) || recentBotText.includes(normalizedOption))
                    score += 20;
                if (normalizeTextForMatch(menuItem.category_name).includes('pizza'))
                    score += 10;
                if (!bestMatch || score > bestMatch.score) {
                    bestMatch = {
                        score: score,
                        value: {
                            cartItemId: cartItemId,
                            cartItem: cartItem,
                            menuItem: menuItem,
                            group: group,
                            option: option,
                        },
                    };
                }
            }
        }
    }
    return (bestMatch === null || bestMatch === void 0 ? void 0 : bestMatch.value) || null;
}
function applyOptionSelectionToCart(userId, customerPhone, selection) {
    var cart = getCart(userId, customerPhone);
    var targetItem = cart.items.get(selection.cartItemId);
    if (!targetItem) {
        return cart;
    }
    var existingOptions = __spreadArray([], (targetItem.optionsSelected || []), true);
    var normalizedGroup = normalizeTextForMatch(selection.group.name);
    var normalizedOption = normalizeTextForMatch(selection.option.name);
    var retainedOptions = existingOptions.filter(function (opt) {
        var sameGroup = normalizeTextForMatch(opt.group) === normalizedGroup;
        var sameOption = normalizeTextForMatch(opt.option) === normalizedOption;
        if (selection.group.type === 'single') {
            return !sameGroup;
        }
        return !(sameGroup && sameOption);
    });
    var removedPrice = existingOptions
        .filter(function (opt) { return !retainedOptions.includes(opt); })
        .reduce(function (sum, opt) { return sum + opt.price; }, 0);
    var alreadySelected = existingOptions.some(function (opt) {
        return normalizeTextForMatch(opt.group) === normalizedGroup &&
            normalizeTextForMatch(opt.option) === normalizedOption;
    });
    var updatedOptions = alreadySelected
        ? existingOptions
        : __spreadArray(__spreadArray([], retainedOptions, true), [
            {
                group: selection.group.name,
                option: selection.option.name,
                price: selection.option.price,
            },
        ], false);
    if (!alreadySelected) {
        targetItem.price = Math.max(0, targetItem.price - removedPrice + selection.option.price);
    }
    targetItem.optionsSelected = updatedOptions;
    targetItem.notes = buildCartNotesFromOptions(updatedOptions);
    cart.awaitingConfirmation = false;
    cart.lastUpdated = new Date();
    return cart;
}
function extractJsonObject(content) {
    if (!content)
        return null;
    var trimmed = content.trim();
    var candidates = [trimmed];
    var start = trimmed.indexOf('{');
    var end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
        candidates.push(trimmed.slice(start, end + 1));
    }
    for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
        var candidate = candidates_1[_i];
        try {
            return JSON.parse(candidate);
        }
        catch (_a) {
            // tenta o prÃƒÂ³ximo candidato
        }
    }
    return null;
}
function buildDeliveryPlannerMenuSummary(deliveryData) {
    return deliveryData.categories
        .map(function (category) { return "- ".concat(category.name, ": ").concat(category.items.map(function (item) { return item.name; }).join(', ')); })
        .join('\n');
}
function interpretDeliveryTurnWithLLM(userId, message, deliveryData, conversationHistory, customerPhone) {
    return __awaiter(this, void 0, void 0, function () {
        var mistral, cart, cartSummary, lastCategory, recentHistory, systemPrompt, response, parsed, error_3;
        var _a, _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0: return [4 /*yield*/, (0, llm_1.getLLMClient)()];
                case 1:
                    mistral = _f.sent();
                    if (!mistral) {
                        return [2 /*return*/, null];
                    }
                    cart = customerPhone ? getCart(userId, customerPhone) : null;
                    cartSummary = cart
                        ? formatCartSummary(cart, deliveryData.config.delivery_fee)
                        : 'Carrinho vazio.';
                    lastCategory = conversationHistory && conversationHistory.length > 0
                        ? detectCategoryContext(conversationHistory, deliveryData)
                        : undefined;
                    recentHistory = (conversationHistory || [])
                        .slice(-8)
                        .map(function (entry) { return "".concat(entry.fromMe ? 'Atendente' : 'Cliente', ": ").concat(entry.text); })
                        .join('\n');
                    systemPrompt = "Voc\u00C3\u00AA \u00C3\u00A9 o planejador de um agente de delivery orientado por LLM.\nSua fun\u00C3\u00A7\u00C3\u00A3o \u00C3\u00A9 interpretar a inten\u00C3\u00A7\u00C3\u00A3o real do cliente usando contexto, mem\u00C3\u00B3ria curta e card\u00C3\u00A1pio.\nVoc\u00C3\u00AA N\u00C3\u0192O responde ao cliente. Voc\u00C3\u00AA retorna APENAS um JSON v\u00C3\u00A1lido.\n\nJSON obrigat\u00C3\u00B3rio:\n{\n  \"intent\": \"GREETING|WANT_MENU|WANT_CATEGORY|ASK_ABOUT_ITEM|WANT_TO_ORDER|ADD_ITEM|REMOVE_ITEM|CONFIRM_ORDER|PROVIDE_CUSTOMER_INFO|FINALIZE_ORDER|CANCEL_ORDER|ASK_DELIVERY_INFO|ASK_BUSINESS_HOURS|COMPLAINT|HALF_HALF|OTHER\",\n  \"normalizedMessage\": \"mensagem reescrita de forma expl\u00C3\u00ADcita para o executor\",\n  \"categoryHint\": \"categoria ou null\",\n  \"referencesCart\": true,\n  \"confidence\": \"high|medium|low\",\n  \"reasoning\": \"curta\"\n}\n\nRegras:\n1. Use o hist\u00C3\u00B3rico. O cliente pode se referir ao item anterior sem repetir a categoria.\n2. Reescreva a normalizedMessage deixando impl\u00C3\u00ADcitos expl\u00C3\u00ADcitos.\n3. Se o cliente disser \"quero uma de calabresa\" depois de ver pizzas, normalize para \"quero 1 pizza calabresa\".\n4. Se o atendente sugeriu borda e o cliente disser algo como \"sim com borda recheada quais bordas tem\", N\u00C3\u0192O trate isso como nome literal de produto. Interprete como pedido para ver as op\u00C3\u00A7\u00C3\u00B5es de borda. Use intent WANT_CATEGORY, categoryHint \"borda\" e normalizedMessage \"quero ver as bordas recheadas dispon\u00C3\u00ADveis\".\n5. Se o cliente fornecer nome, endere\u00C3\u00A7o, tipo de entrega, pagamento e/ou troco, use PROVIDE_CUSTOMER_INFO e normalize os dados SOMENTE no formato de campos, por exemplo: \"nome: Antonio | entrega: delivery | endereco: Rua Teste 123 | pagamento: dinheiro | troco: 50\". Nunca use frases narrativas como \"o cliente confirmou...\".\n6. Se o cliente estiver confirmando um resumo j\u00C3\u00A1 montado, use CONFIRM_ORDER.\n7. Se o cliente estiver perguntando por hor\u00C3\u00A1rio, taxa, entrega ou retirada, use ASK_DELIVERY_INFO ou ASK_BUSINESS_HOURS.\n8. Nunca invente item. Use apenas categorias e itens do card\u00C3\u00A1pio informado.\n9. normalizedMessage deve estar em portugu\u00C3\u00AAs do Brasil e ser \u00C3\u00BAtil para um executor determin\u00C3\u00ADstico.\n10. Quando estiver em d\u00C3\u00BAvida entre categoria e item espec\u00C3\u00ADfico, use o hist\u00C3\u00B3rico e o card\u00C3\u00A1pio para desambiguar.";
                    _f.label = 2;
                case 2:
                    _f.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, mistral.chat.complete({
                            messages: [
                                { role: 'system', content: systemPrompt },
                                {
                                    role: 'user',
                                    content: [
                                        "NEG\u00C3\u201CCIO: ".concat(deliveryData.config.business_name),
                                        "CATEGORIA MAIS RECENTE: ".concat(lastCategory || 'nenhuma'),
                                        "CARRINHO ATUAL:\n".concat(cartSummary),
                                        "CARD\u00C3\u0081PIO:\n".concat(buildDeliveryPlannerMenuSummary(deliveryData)),
                                        "HIST\u00C3\u201CRICO RECENTE:\n".concat(recentHistory || 'sem histÃƒÂ³rico recente'),
                                        "\u00C3\u0161LTIMA MENSAGEM DO CLIENTE: ".concat(message),
                                    ].join('\n\n'),
                                },
                            ],
                            temperature: 0.1,
                            maxTokens: 300,
                        })];
                case 3:
                    response = _f.sent();
                    parsed = extractJsonObject((_d = (_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.toString());
                    if (!(parsed === null || parsed === void 0 ? void 0 : parsed.intent) || !parsed.normalizedMessage) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, {
                            intent: parsed.intent,
                            normalizedMessage: parsed.normalizedMessage.trim(),
                            categoryHint: parsed.categoryHint || null,
                            referencesCart: (_e = parsed.referencesCart) !== null && _e !== void 0 ? _e : false,
                            confidence: parsed.confidence || 'medium',
                            reasoning: parsed.reasoning,
                        }];
                case 4:
                    error_3 = _f.sent();
                    console.error("\u00F0\u0178\u00A4\u2013 [DeliveryAI] Erro no planner estruturado:", error_3);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
var suspiciousEncodingPattern = /(?:Ãƒ.|Ã‚.|Ã¢.|Ã°Å¸|Ã¯Â¸|Ã¢â‚¬|Ã¢â€|Ã¢â‚¬Â¢)/;
var deliveryNameStopWords = new Set([
    'a', 'ai', 'aÃ­', 'como', 'com', 'delivery', 'dinheiro', 'entrega', 'esta', 'estÃ¡',
    'favor', 'forma', 'meu', 'minha', 'nao', 'nÃ£o', 'no', 'nome', 'ok', 'pagamento',
    'para', 'pedido', 'pix', 'por', 'quero', 'retirada', 'retirar', 'segue', 'sim'
]);
function mergeCustomerInfo(base, incoming) {
    if (base === void 0) { base = {}; }
    if (incoming === void 0) { incoming = {}; }
    return {
        customerName: incoming.customerName || base.customerName,
        customerAddress: incoming.customerAddress || base.customerAddress,
        deliveryType: incoming.deliveryType || base.deliveryType,
        paymentMethod: incoming.paymentMethod || base.paymentMethod,
        changeNeeded: incoming.changeNeeded !== undefined ? incoming.changeNeeded : base.changeNeeded,
        changeForAmount: incoming.changeForAmount !== undefined ? incoming.changeForAmount : base.changeForAmount,
        deliveryFee: incoming.deliveryFee !== undefined ? incoming.deliveryFee : base.deliveryFee,
        deliveryDistanceKm: incoming.deliveryDistanceKm !== undefined ? incoming.deliveryDistanceKm : base.deliveryDistanceKm,
        deliveryFeeMode: incoming.deliveryFeeMode || base.deliveryFeeMode,
    };
}
function getCartStoredCustomerInfo(cart) {
    var _a;
    if (!cart)
        return {};
    return mergeCustomerInfo(((_a = cart.checkoutState) === null || _a === void 0 ? void 0 : _a.info) || {}, {
        customerName: cart.customerName || undefined,
        customerAddress: cart.address || undefined,
        deliveryType: cart.deliveryType || undefined,
        paymentMethod: cart.paymentMethod || undefined,
    });
}
function updateCartCheckoutState(cart, phase, info, lastMissingFields) {
    cart.customerName = info.customerName || cart.customerName;
    cart.address = info.customerAddress || cart.address;
    cart.deliveryType = info.deliveryType || cart.deliveryType;
    cart.paymentMethod = info.paymentMethod || cart.paymentMethod;
    cart.awaitingConfirmation = phase === 'awaiting_confirmation';
    cart.checkoutState = {
        phase: phase,
        info: mergeCustomerInfo(getCartStoredCustomerInfo(cart), info),
        lastMissingFields: lastMissingFields,
        updatedAt: new Date(),
    };
    cart.lastUpdated = new Date();
}
function resetCartCheckoutState(cart) {
    if (!cart)
        return;
    cart.awaitingConfirmation = false;
    cart.checkoutState = null;
    cart.lastUpdated = new Date();
}
function normalizeCustomerName(name) {
    return name
        .trim()
        .replace(/^[^\p{L}]+|[^\p{L}\s'-]+$/gu, '')
        .split(/\s+/)
        .filter(Boolean)
        .map(function (word) { return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(); })
        .join(' ');
}
function parsePaymentMethod(value) {
    var normalized = normalizeTextForMatch(value);
    if (!normalized)
        return undefined;
    if (normalized.includes('pix'))
        return 'Pix';
    if (normalized.includes('dinheiro'))
        return 'Dinheiro';
    if (normalized.includes('cartao') || normalized.includes('debito') || normalized.includes('credito'))
        return 'Cartao';
    return undefined;
}
function parseChangeInfo(value) {
    var normalized = normalizeTextForMatch(value);
    if (!normalized || !normalized.includes('troco')) {
        return {};
    }
    if (normalized.includes('sem troco') ||
        normalized.includes('nao precisa de troco') ||
        normalized.includes('nao precisa troco') ||
        normalized.includes('nÃ£o precisa de troco') ||
        normalized.includes('nÃ£o precisa troco')) {
        return {
            changeNeeded: false,
            changeForAmount: null,
        };
    }
    var amountPatterns = [
        /troco(?:\s+para|\s+de)?\s*(?:r\$\s*)?(\d+[.,]?\d{0,2})/i,
        /(?:para|em)\s*(?:r\$\s*)?(\d+[.,]?\d{0,2})\s*(?:reais)?\s*(?:de troco)?/i,
    ];
    for (var _i = 0, amountPatterns_1 = amountPatterns; _i < amountPatterns_1.length; _i++) {
        var pattern = amountPatterns_1[_i];
        var match = value.match(pattern);
        var parsed = parseOptionalNumber(match === null || match === void 0 ? void 0 : match[1]);
        if (parsed !== null) {
            return {
                changeNeeded: true,
                changeForAmount: parsed,
            };
        }
    }
    return {
        changeNeeded: true,
    };
}
function parseDeliveryType(value) {
    var normalized = normalizeTextForMatch(value);
    if (!normalized)
        return undefined;
    if (/(delivery|entrega|entregar|mandar|enviar|levar)/i.test(normalized))
        return 'delivery';
    if (/(retirada|retirar|retiro|buscar|pegar|balcao|no local)/i.test(normalized))
        return 'pickup';
    return undefined;
}
function extractStructuredCustomerInfoFields(text) {
    var info = {};
    var normalizedText = sanitizeDeliveryText(text || '');
    var rawSegments = normalizedText
        .split(/\r?\n|\|/g)
        .map(function (segment) { return segment.trim(); })
        .filter(Boolean);
    for (var _i = 0, rawSegments_1 = rawSegments; _i < rawSegments_1.length; _i++) {
        var segment = rawSegments_1[_i];
        var separatorIndex = segment.indexOf(':');
        if (separatorIndex <= 0)
            continue;
        var rawLabel = normalizeTextForMatch(segment.slice(0, separatorIndex));
        var rawValue = segment.slice(separatorIndex + 1).trim();
        if (!rawLabel || !rawValue)
            continue;
        if (rawLabel.includes('nome')) {
            var name_1 = normalizeCustomerName(rawValue);
            if (name_1)
                info.customerName = name_1;
            continue;
        }
        if (rawLabel.includes('pagamento')) {
            var paymentMethod = parsePaymentMethod(rawValue);
            if (paymentMethod)
                info.paymentMethod = paymentMethod;
            continue;
        }
        if (rawLabel.includes('troco')) {
            Object.assign(info, parseChangeInfo(rawValue));
            continue;
        }
        if (rawLabel.includes('entrega') || rawLabel.includes('retirada') || rawLabel.includes('tipo')) {
            var deliveryType = parseDeliveryType(rawValue);
            if (deliveryType)
                info.deliveryType = deliveryType;
            continue;
        }
        if (rawLabel.includes('endereco') || rawLabel.includes('endereÃ§o')) {
            info.customerAddress = rawValue;
        }
    }
    return info;
}
function extractExplicitCustomerName(message) {
    var namePatterns = [
        /(?:meu nome (?:Ã©|e)|nome\s*[:=]|me chamo|sou o|sou a)\s+([a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±' -]{2,60})/i,
        /^([a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±' -]{2,40})$/i,
    ];
    for (var _i = 0, namePatterns_2 = namePatterns; _i < namePatterns_2.length; _i++) {
        var pattern = namePatterns_2[_i];
        var match = message.match(pattern);
        if (!(match === null || match === void 0 ? void 0 : match[1]))
            continue;
        var candidate = normalizeCustomerName(match[1]);
        if (!candidate)
            continue;
        if (deliveryNameStopWords.has(candidate.toLowerCase()))
            continue;
        if (identifyDataType(candidate) === 'address')
            continue;
        return candidate;
    }
    return null;
}
function repairMojibake(text) {
    if (!text || !suspiciousEncodingPattern.test(text))
        return text;
    try {
        var repaired = Buffer.from(text, 'latin1').toString('utf8');
        if (repaired && repaired !== text && !repaired.includes('ï¿½')) {
            return repaired;
        }
    }
    catch (error) {
        console.warn('[DeliveryAI] Falha ao reparar texto com encoding invÃ¡lido:', error);
    }
    return text;
}
function sanitizeDeliveryText(text) {
    var repaired = repairMojibake(text);
    return repaired
        .replace(/ÃƒÂ¡/g, 'Ã¡')
        .replace(/ÃƒÂ /g, 'Ã ')
        .replace(/Ãƒ /g, 'Ã ')
        .replace(/ÃƒÂ¢/g, 'Ã¢')
        .replace(/ÃƒÂ£/g, 'Ã£')
        .replace(/ÃƒÂ©/g, 'Ã©')
        .replace(/ÃƒÂª/g, 'Ãª')
        .replace(/ÃƒÂ­/g, 'Ã­')
        .replace(/ÃƒÂ³/g, 'Ã³')
        .replace(/ÃƒÂ´/g, 'Ã´')
        .replace(/ÃƒÂµ/g, 'Ãµ')
        .replace(/ÃƒÂº/g, 'Ãº')
        .replace(/ÃƒÂ§/g, 'Ã§')
        .replace(/Ãƒâ€°/g, 'Ã‰')
        .replace(/Ãƒâ€œ/g, 'Ã“')
        .replace(/ÃƒÅ¡/g, 'Ãš')
        .replace(/Ãƒâ€¡/g, 'Ã‡')
        .replace(/Ã‚Âº/g, 'Âº')
        .replace(/Ã‚Âª/g, 'Âª')
        .replace(/Ã¢â€Â/g, 'â”')
        .replace(/Ã¢â€â‚¬/g, 'â”€')
        .replace(/Ã¢â‚¬Â¢/g, 'â€¢')
        .replace(/Ã¢â€¢Â/g, 'â•')
        .replace(/Ã°Å¸â€œÂ/g, 'ðŸ“')
        .replace(/Ã°Å¸â€˜â€ /g, 'ðŸ‘‡')
        .replace(/Ã°Å¸â€ºÂµ/g, 'ðŸ›µ')
        .replace(/Ã°Å¸â€™Âµ/g, 'ðŸ’µ')
        .replace(/Ã°Å¸â€œÂ\s*/g, '')
        .replace(/Ã°Å¸Å¡Å¡\s*/g, '')
        .replace(/Ã°Å¸â€œÂ\s*/g, '')
        .replace(/Ã°Å¸â€™Â³\s*/g, '')
        .replace(/Ã°Å¸â€œâ€¹\s*/g, '')
        .replace(/Ã°Å¸â€˜Â¤\s*/g, '')
        .replace(/Ã°Å¸â€™Â°\s*/g, '')
        .replace(/Ã°Å¸â€ºâ€™\s*/g, '')
        .replace(/Ã°Å¸Å½Â«\s*/g, '')
        .replace(/Ã°Å¸â€œÂ¦\s*/g, '')
        .replace(/Ã¢Å“â€¦\s*/g, '')
        .replace(/Ã¢ÂÂ±Ã¯Â¸Â\s*/g, '')
        .replace(/Ã°Å¸Ââ€¢\s*/g, '')
        .replace(/Ã°Å¸â€œÂ·\s*/g, '')
        .replace(/Ã°Å¸ËœÅ /g, '')
        .replace(/Ã°Å¸Ëœâ€°/g, '')
        .replace(/Ã¢â‚¬\u009d/g, '"')
        .replace(/Ã¢â‚¬Å“/g, '"')
        .replace(/Ã¢â‚¬â„¢/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
function extractLikelyPersonName(text) {
    var candidates = text
        .split(/[.!?;:\n]/)
        .map(function (part) { return part.trim().replace(/^[,\-\s]+|[,\-\s]+$/g, ''); })
        .filter(Boolean)
        .reverse();
    for (var _i = 0, candidates_2 = candidates; _i < candidates_2.length; _i++) {
        var candidate = candidates_2[_i];
        if (/\d/.test(candidate))
            continue;
        var words = candidate.split(/\s+/).filter(Boolean);
        if (words.length < 1 || words.length > 4)
            continue;
        var validWords = words.filter(function (word) {
            return /^[a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±]+$/i.test(word) &&
                !deliveryNameStopWords.has(word.toLowerCase());
        });
        if (validWords.length === 0 || validWords.length !== words.length)
            continue;
        return validWords
            .map(function (word) { return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(); })
            .join(' ');
    }
    return null;
}
function shouldForceCustomerInfoIntent(cart, message, conversationHistory, plannedIntent) {
    var _a, _b;
    if (!cart || cart.items.size === 0)
        return false;
    if (cart.awaitingConfirmation)
        return false;
    var dataType = identifyDataType(message);
    if (dataType !== 'unknown')
        return true;
    if (plannedIntent && ['ADD_ITEM', 'REMOVE_ITEM', 'WANT_MENU', 'WANT_CATEGORY', 'WANT_TO_ORDER', 'HALF_HALF'].includes(plannedIntent)) {
        return false;
    }
    var lastAssistantText = ((_b = (_a = __spreadArray([], (conversationHistory || []), true).reverse()
        .find(function (entry) { return entry.fromMe; })) === null || _a === void 0 ? void 0 : _a.text) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || '';
    return ['nome', 'entrega', 'retirada', 'endereco', 'pagamento', 'troco'].some(function (token) { return lastAssistantText.includes(token); });
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã°Å¸â€Â IDENTIFICADOR DE TIPO DE DADO
// Analisa uma string e determina se ÃƒÂ© nome, endereÃƒÂ§o, ou outro dado
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function identifyDataType(text) {
    var lowerText = text.toLowerCase().trim();
    // Palavras que indicam ENDEREÃƒâ€¡O (rua, avenida, nÃƒÂºmero, bairro, etc)
    var addressIndicators = [
        /\b(rua|av|avenida|alameda|travessa|estrada|rodovia|praÃƒÂ§a|praca)\b/i,
        /\b(bairro|centro|vila|jardim|parque)\b/i,
        /\d{2,}/, // NÃƒÂºmeros de 2+ dÃƒÂ­gitos (nÃƒÂºmero da casa)
        /,\s*\d+/, // VÃƒÂ­rgula seguida de nÃƒÂºmero
        /n[Ã‚Â°Ã‚Âº]?\s*\d+/i, // nÃ‚Âº 123, n 123
    ];
    // Palavras que indicam FORMA DE PAGAMENTO
    var paymentIndicators = [
        /^(pix|dinheiro|cart[aÃƒÂ£]o|d[eÃƒÂ©]bito|cr[eÃƒÂ©]dito|cartÃƒÂ£o|cartao)$/i,
        /\b(pix|dinheiro|cart[aÃƒÂ£]o|d[eÃƒÂ©]bito|cr[eÃƒÂ©]dito|cartÃƒÂ£o|cartao)\b/i,
    ];
    // Palavras que indicam TIPO DE ENTREGA
    var deliveryTypeIndicators = [
        /^(entrega|delivery|entregar)$/i,
        /^(retirada|retirar|buscar|pegar)$/i,
        /vou (retirar|buscar|pegar)/i,
        /para entrega/i,
    ];
    var changeIndicators = [
        /\btroco\b/i,
        /\bsem troco\b/i,
        /\bprecis[oa] de troco\b/i,
    ];
    // Verifica se ÃƒÂ© tipo de entrega (prioridade alta)
    if (deliveryTypeIndicators.some(function (p) { return p.test(lowerText); })) {
        return 'delivery_type';
    }
    // Verifica se ÃƒÂ© pagamento (prioridade alta)
    if (paymentIndicators.some(function (p) { return p.test(lowerText); })) {
        return 'payment';
    }
    if (changeIndicators.some(function (p) { return p.test(lowerText); })) {
        return 'change';
    }
    // Verifica se ÃƒÂ© endereÃƒÂ§o
    var hasAddressIndicator = addressIndicators.some(function (p) { return p.test(lowerText); });
    if (hasAddressIndicator) {
        return 'address';
    }
    // Se tem NÃƒÅ¡MEROS e texto, provavelmente ÃƒÂ© endereÃƒÂ§o
    if (/\d+/.test(text) && /[a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§ÃƒÂ±]/i.test(text)) {
        return 'address';
    }
    // Se ÃƒÂ© sÃƒÂ³ texto sem nÃƒÂºmeros e parece nome de pessoa (2+ palavras, sem termos estranhos)
    var words = text.trim().split(/\s+/);
    if (words.length >= 1 && words.length <= 4) {
        var looksLikeName = words.every(function (w) {
            return /^[a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§ÃƒÂ±]{2,}$/i.test(w) &&
                !/^(rua|av|avenida|bairro|centro|pix|cartao|cartÃƒÂ£o|dinheiro|entrega|delivery|retirada)$/i.test(w);
        });
        if (looksLikeName && !/\d/.test(text)) {
            return 'name';
        }
    }
    return 'unknown';
}
function extractCustomerInfo(message, context, existingInfo) {
    if (context === void 0) { context = ''; }
    if (existingInfo === void 0) { existingInfo = {}; }
    var info = __assign({}, existingInfo);
    var fullText = "".concat(context, " ").concat(message).toLowerCase();
    var messageLower = message.toLowerCase();
    console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Analisando: \"".concat(message, "\""));
    console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Contexto: \"".concat(context.substring(0, 100), "...\""));
    console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Info existente:", existingInfo);
    var structuredInfo = extractStructuredCustomerInfoFields(message);
    if (Object.keys(structuredInfo).length > 0) {
        Object.assign(info, mergeCustomerInfo(info, structuredInfo));
        console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Campos estruturados:", structuredInfo);
    }
    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    // NOVO: Detectar formato "Nome, EndereÃƒÂ§o, Pagamento" (tudo junto)
    // Exemplo: "JoÃƒÂ£o Silva, Rua das Flores 123, pago no PIX"
    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    var hasComma = message.includes(',');
    var hasAddress = /\b(rua|av|avenida|alameda|travessa|estrada|praÃƒÂ§a|praca)\b/i.test(message) || /[,\s]\d+[,\s]/i.test(message);
    var hasPayment = /\b(pix|dinheiro|cart[aÃƒÂ£]o|cartao)\b/i.test(message);
    var hasNumber = /\d/.test(message);
    if (hasComma && hasAddress && (hasPayment || hasNumber)) {
        console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] \u00F0\u0178\u017D\u00AF Detectou formato multi-dados (Nome, Endere\u00C3\u00A7o, Pagamento)");
        // Dividir por vÃƒÂ­rgula e analisar cada parte
        var parts = message.split(',').map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 0; });
        for (var _i = 0, parts_1 = parts; _i < parts_1.length; _i++) {
            var part = parts_1[_i];
            var partLower = part.toLowerCase();
            // Verificar se ÃƒÂ© pagamento
            var parsedPaymentMethod = parsePaymentMethod(part);
            if (parsedPaymentMethod && !info.paymentMethod) {
                info.paymentMethod = parsedPaymentMethod;
                console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Multi-dados - Pagamento: ".concat(info.paymentMethod));
                continue;
            }
            // Verificar se ÃƒÂ© endereÃƒÂ§o (tem palavra de logradouro OU nÃƒÂºmero)
            var isAddressPart = /\b(rua|av|avenida|alameda|travessa|estrada|praÃƒÂ§a|praca)\b/i.test(partLower) ||
                (/\d+/.test(part) && /[a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§]/i.test(part));
            if (isAddressPart && !info.customerAddress) {
                info.customerAddress = part;
                console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Multi-dados - Endere\u00C3\u00A7o: ".concat(part));
                // Assume delivery se tem endereÃƒÂ§o
                if (!info.deliveryType)
                    info.deliveryType = 'delivery';
                continue;
            }
            // Se nÃƒÂ£o ÃƒÂ© pagamento nem endereÃƒÂ§o, provavelmente ÃƒÂ© nome (sÃƒÂ³ texto, sem nÃƒÂºmeros significativos)
            // Usa regex que aceita caracteres acentuados e espaÃƒÂ§os, exclui se tem nÃƒÂºmeros
            var extractedName = extractLikelyPersonName(part);
            if (extractedName && !info.customerName && !parsedPaymentMethod) {
                info.customerName = extractedName;
                console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Multi-dados - Nome: ".concat(info.customerName));
                continue;
            }
        }
        // Se encontrou dados, retorna (priorizar multi-dados)
        if (info.customerName || info.customerAddress || info.paymentMethod) {
            console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] \u00E2\u0153\u2026 Multi-dados extra\u00C3\u00ADdos:", info);
            return info;
        }
    }
    // PRIMEIRO: Priorizar tipo de entrega explÃƒÂ­cito na mensagem atual
    var messageHasPickup = /\b(retirar|retiro|buscar|busco|pegar|pego|retira|retirada|no local|vou ai|vou aÃƒÂ­|vou la|vou lÃƒÂ¡|passo ai|passo aÃƒÂ­|passo la|passo lÃƒÂ¡|balc[aÃƒÂ£]o)\b/i.test(messageLower);
    var messageHasDelivery = /\b(delivery|entreg|mandar|enviar|levar)\b/i.test(messageLower);
    if (messageHasPickup) {
        info.deliveryType = 'pickup';
        console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Detectou pickup (mensagem)");
    }
    else if (messageHasDelivery) {
        info.deliveryType = 'delivery';
        console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Detectou delivery (mensagem)");
    }
    // SEGUNDO: Detectar tipo de entrega no fullText (contexto + mensagem)
    if (!info.deliveryType) {
        if (fullText.match(/\b(delivery|entreg|mandar|enviar|levar)\b/i)) {
            info.deliveryType = 'delivery';
            console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Detectou delivery");
        }
        else if (fullText.match(/\b(retirar|retiro|buscar|busco|pegar|pego|retira|retirada|no local|vou ai|vou aÃƒÂ­|vou la|vou lÃƒÂ¡|passo ai|passo aÃƒÂ­|passo la|passo lÃƒÂ¡|balc[aÃƒÂ£]o)\b/i)) {
            info.deliveryType = 'pickup';
            console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Detectou pickup");
        }
    }
    // TERCEIRO: Extrair forma de pagamento da mensagem atual (prioridade)
    var directPaymentMethod = parsePaymentMethod(message);
    if (directPaymentMethod) {
        info.paymentMethod = directPaymentMethod;
        console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Detectou pagamento (mensagem): ".concat(info.paymentMethod));
    }
    // QUARTO: Extrair forma de pagamento do contexto se ainda nÃƒÂ£o tiver
    if (!info.paymentMethod) {
        var fallbackPaymentMethod = parsePaymentMethod(message);
        if (fallbackPaymentMethod) {
            info.paymentMethod = fallbackPaymentMethod;
            console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Detectou pagamento: ".concat(info.paymentMethod));
        }
    }
    var changeInfo = parseChangeInfo(message);
    if (changeInfo.changeNeeded !== undefined || changeInfo.changeForAmount !== undefined) {
        Object.assign(info, changeInfo);
        console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Detectou troco:", changeInfo);
    }
    else {
        var normalizedMessage = normalizeTextForMatch(message);
        var awaitingChangeContext = normalizeTextForMatch(context).includes('troco');
        if (awaitingChangeContext) {
            if (['nao', 'nÃ£o', 'sem', 'nao precisa', 'nÃ£o precisa'].includes(normalizedMessage)) {
                info.changeNeeded = false;
                info.changeForAmount = null;
            }
            else {
                var isolatedAmount = parseOptionalNumber(message);
                if (isolatedAmount !== null) {
                    info.changeNeeded = true;
                    info.changeForAmount = isolatedAmount;
                }
                else if (['sim', 'preciso', 'quero', 'com troco'].includes(normalizedMessage)) {
                    info.changeNeeded = true;
                }
            }
        }
    }
    // TERCEIRO: Identificar o que a mensagem atual representa
    var messageType = identifyDataType(message);
    console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Tipo da mensagem: ".concat(messageType));
    // CORREÃƒâ€¡ÃƒÆ’O: Extrair endereÃƒÂ§o MESMO se messageType for payment/delivery_type
    // (quando a mensagem contÃƒÂ©m mÃƒÂºltiplos dados como "entrega pix avenida x, 123")
    if (!info.customerAddress) {
        var hasAddressIndicator = /\b(rua|av|avenida|alameda|travessa|estrada|praÃƒÂ§a|praca)\b/i.test(message) ||
            /[a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§\s]+,\s*\d+/i.test(message);
        var hasNumber_1 = /\d/.test(message);
        if (hasAddressIndicator && hasNumber_1) {
            // Remove palavras de pagamento/tipo de entrega da mensagem
            var address = message
                .replace(/\b(pix|dinheiro|cart[aÃƒÂ£]o|d[eÃƒÂ©]bito|cr[eÃƒÂ©]dito|delivery|entrega|retirada|retirar)\b/gi, '')
                .trim()
                .replace(/^[\s,]+|[\s,]+$/g, ''); // Remove espaÃƒÂ§os e vÃƒÂ­rgulas nas pontas
            if (address.length >= 5) {
                info.customerAddress = address;
                console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Endere\u00C3\u00A7o extra\u00C3\u00ADdo (multi-dados): ".concat(info.customerAddress));
            }
        }
    }
    // Se a mensagem parece ser endereÃƒÂ§o puro e nÃƒÂ£o temos endereÃƒÂ§o ainda
    if (messageType === 'address' && !info.customerAddress) {
        // Remove palavras de pagamento/tipo de entrega da mensagem
        var address = message
            .replace(/\b(pix|dinheiro|cart[aÃƒÂ£]o|d[eÃƒÂ©]bito|cr[eÃƒÂ©]dito|delivery|entrega|retirada)\b/gi, '')
            .trim();
        // Se comeÃƒÂ§a com prefixo de rua, usa direto
        if (/^(rua|av|avenida|alameda|travessa)/i.test(address)) {
            info.customerAddress = address;
        }
        else {
            // Adiciona "Rua" se parece endereÃƒÂ§o mas nÃƒÂ£o tem prefixo
            info.customerAddress = address;
        }
        console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Endere\u00C3\u00A7o extra\u00C3\u00ADdo: ".concat(info.customerAddress));
    }
    // Se a mensagem parece ser nome e nÃƒÂ£o temos nome ainda
    if (messageType === 'name' && !info.customerName) {
        var name_2 = message.trim();
        // Capitalizar cada palavra
        info.customerName = normalizeCustomerName(name_2);
        console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Nome extra\u00C3\u00ADdo: ".concat(info.customerName));
    }
    if (!info.customerName) {
        var explicitName = extractExplicitCustomerName(message);
        if (explicitName) {
            info.customerName = explicitName;
            console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Nome expl\u00C3\u00ADcito: ".concat(info.customerName));
        }
    }
    if (!info.customerName) {
        var inferredName = extractLikelyPersonName(message);
        if (inferredName) {
            info.customerName = inferredName;
            console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Nome inferido: ".concat(info.customerName));
        }
    }
    // QUARTO: Tentar extrair nome de padrÃƒÂµes explÃƒÂ­citos
    if (!info.customerName) {
        var namePatterns = [
            /(?:meu nome (?:ÃƒÂ©|e)|nome:|sou o?|me chamo)\s+([a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§ÃƒÂ±\s]{3,50})/i,
            /(?:^|\s)nome\s*[:=]\s*([a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§ÃƒÂ±\s]{3,50})/i,
        ];
        for (var _a = 0, namePatterns_3 = namePatterns; _a < namePatterns_3.length; _a++) {
            var pattern = namePatterns_3[_a];
            var match = fullText.match(pattern);
            if (match && match[1]) {
                var name_3 = match[1].trim();
                // Filtrar se for endereÃƒÂ§o ou pagamento
                if (identifyDataType(name_3) === 'name' || identifyDataType(name_3) === 'unknown') {
                    info.customerName = normalizeCustomerName(name_3);
                    console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Nome por padr\u00C3\u00A3o: ".concat(info.customerName));
                    break;
                }
            }
        }
    }
    // QUINTO: Tentar extrair endereÃƒÂ§o de padrÃƒÂµes explÃƒÂ­citos
    if (!info.customerAddress && info.deliveryType === 'delivery') {
        var addressPatterns = [
            /(?:rua|av|avenida|alameda|travessa|estrada)\s+([a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§ÃƒÂ±\s\d,.-]+?)(?:\s*$|\s+(?:pix|dinheiro|cart[aÃƒÂ£]o))/i,
            /endere[ÃƒÂ§c]o\s*[:=]\s*([a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§ÃƒÂ±\s\d,.-]+?)(?:\s*$|\s+(?:pix|dinheiro))/i,
        ];
        for (var _b = 0, addressPatterns_1 = addressPatterns; _b < addressPatterns_1.length; _b++) {
            var pattern = addressPatterns_1[_b];
            var match = fullText.match(pattern);
            if (match && match[1]) {
                info.customerAddress = match[1].trim();
                console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Endere\u00C3\u00A7o por padr\u00C3\u00A3o: ".concat(info.customerAddress));
                break;
            }
        }
    }
    console.log("\u00F0\u0178\u201C\u009D [extractCustomerInfo] Resultado final:", info);
    return info;
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã°Å¸â€™Â¾ CRIAR PEDIDO NO BANCO DE DADOS
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function createDeliveryOrder(userId, conversationId, customerInfo, deliveryData) {
    return __awaiter(this, void 0, void 0, function () {
        var subtotal, deliveryFee, total, validConversationId, _a, order, error;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    subtotal = 30;
                    deliveryFee = customerInfo.deliveryType === 'delivery' ? deliveryData.config.delivery_fee : 0;
                    total = subtotal + deliveryFee;
                    validConversationId = conversationId && !isSyntheticConversationId(conversationId)
                        ? conversationId
                        : null;
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('delivery_orders')
                            .insert({
                            user_id: userId,
                            conversation_id: validConversationId,
                            customer_name: customerInfo.customerName,
                            customer_address: customerInfo.customerAddress,
                            delivery_type: customerInfo.deliveryType,
                            payment_method: customerInfo.paymentMethod,
                            subtotal: subtotal,
                            delivery_fee: deliveryFee,
                            total: total,
                            status: 'pending',
                            payment_status: 'pending',
                            created_by_ai: true,
                            estimated_time: deliveryData.config.estimated_delivery_time,
                            confirmed_at: new Date().toISOString(),
                        })
                            .select('id, order_number')
                            .single()];
                case 1:
                    _a = _c.sent(), order = _a.data, error = _a.error;
                    if (error) {
                        console.error("\u00E2\u009D\u0152 [DeliveryAI] Erro ao inserir pedido no Supabase:", error);
                        throw new Error("Erro ao criar pedido: ".concat(error.message));
                    }
                    console.log("\u00E2\u0153\u2026 [DeliveryAI] Pedido criado: ID=".concat(order.id, ", Number=").concat(order.order_number));
                    // TODO: Adicionar itens do carrinho na tabela order_items
                    return [2 /*return*/, ((_b = order.order_number) === null || _b === void 0 ? void 0 : _b.toString()) || order.id.substring(0, 8).toUpperCase()];
            }
        });
    });
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã¯Â¿Â½Ã°Å¸â€Â DETECÃƒâ€¡ÃƒÆ’O DE INTENÃƒâ€¡ÃƒÆ’O (PRÃƒâ€°-IA)
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
var INTENT_PATTERNS = {
    GREETING: [
        /^(oi+e?|olÃƒÂ¡|ola|eai|e ai|hey|opa|bom dia|boa tarde|boa noite|tudo bem|td bem|blz|oie+)$/i,
        /^(oi+e?|olÃƒÂ¡|ola|eai|e ai|hey|opa|bom dia|boa tarde|boa noite|tudo bem|td bem|blz|oie+)\s*[!?.,]*$/i,
    ],
    // WANT_CATEGORY: quando cliente menciona apenas o nome de uma categoria
    WANT_CATEGORY: [
        /^(pizza|pizzas)$/i,
        /^(esfirra|esfiha|esfirras|esfihas|sfiha)s?$/i,
        /^(bebida|bebidas|refrigerante|refri)s?$/i,
        /^(a[ÃƒÂ§c]a[iÃƒÂ­])$/i,
        /^(hamburguer|hamburger|burger|lanche)s?$/i,
        /^(doce|sobremesa)s?$/i,
        /^(salgado)s?$/i,
        /^(borda)s?$/i,
        /^(tradicion)ais?$/i,
        /^(especia)is?l?$/i,
        /^(adicion)ais?$/i,
        /^(combo)s?$/i,
        /^(por[ÃƒÂ§c][aÃƒÂ£]o|por[ÃƒÂ§c][oÃƒÂµ]es)$/i,
        /^(entrada)s?$/i,
        /^(massa|macarr[aÃƒÂ£]o)s?$/i,
        /^(sushi|temaki|sashimi)s?$/i,
        /^(promo[ÃƒÂ§c][aÃƒÂ£]o|promo)s?$/i,
        /quero ver (as? |os? )?(pizza|esfirra|bebida|a[ÃƒÂ§c]a[iÃƒÂ­]|lanche|doce|salgado|borda|tradicion|especia|adicion|combo|entrada|massa|promo)\w*/i,
        /mostra (as? |os? )?(pizza|esfirra|bebida|a[ÃƒÂ§c]a[iÃƒÂ­]|lanche|doce|salgado|borda|tradicion|especia|adicion|combo|entrada|massa|promo)\w*/i,
        /ver (as? |os? )?(pizza|esfirra|bebida|a[ÃƒÂ§c]a[iÃƒÂ­]|lanche|doce|salgado|borda|tradicion|especia|adicion|combo|entrada|massa|promo)\w*/i,
    ],
    WANT_MENU: [
        /card[aÃƒÂ¡]pio/i,
        /menu/i,
        /o que (tem|voc[eÃƒÂª]s tem|vende)/i,
        /oque (tem|vende)/i,
        /quais (produto|item|op[ÃƒÂ§c][oÃƒÂµ]es)/i,
        /me (manda|mostra|envia) o (card[aÃƒÂ¡]pio|menu)/i,
        /ver (o )?(card[aÃƒÂ¡]pio|menu|op[ÃƒÂ§c][oÃƒÂµ]es)/i,
        /pode mandar o menu/i,
    ],
    HALF_HALF: [
        /meio a meio/i,
        /meia.*meia/i,
        /metade.*metade/i,
        /duas metades/i,
        /dividid[ao]/i,
        /\d\/\d/i, // 1/2, etc
    ],
    ASK_ABOUT_ITEM: [
        /quanto (custa|[eÃƒÂ©]) (a|o)/i,
        /qual (o )?(pre[ÃƒÂ§c]o|valor) d/i,
        /tem (.+)\?/i,
        /como [eÃƒÂ©] (a|o) (.+)\?/i,
        /o que vem n(a|o) (.+)/i,
    ],
    WANT_TO_ORDER: [
        /quero (pedir|fazer.*pedido|encomendar)/i,
        /quero (um|uma|o|a|uns|umas|\d+)/i, // Ã°Å¸â€ â€¢ "quero uma pizza", "quero 2 esfihas"
        /vou (querer|pedir)/i,
        /pode (anotar|fazer|preparar)/i,
        /faz (a[iÃƒÂ­]|para mim)/i,
        /manda (pra|para) mim/i,
        /me (vÃƒÂª|ve|da|dÃƒÂ¡) (um|uma|[0-9]+)/i,
    ],
    ADD_ITEM: [
        /adiciona|coloca|p[oÃƒÂµ]e|bota/i,
        /mais (um|uma|[0-9]+)/i,
        /tamb[eÃƒÂ©]m quero/i,
    ],
    REMOVE_ITEM: [
        /tira|remove|retira/i,
        /n[aÃƒÂ£]o quero mais/i,
        /cancela (o|a) (.+)/i,
    ],
    CONFIRM_ORDER: [
        /^(isso|fechado|pode fechar|confirma|confirmado|[eÃƒÂ©] isso|t[aÃƒÂ¡] certo|perfeito|ok|sim)/i,
        /pode (mandar|enviar|preparar)/i,
        /fecha o pedido/i,
    ],
    PROVIDE_CUSTOMER_INFO: [
        /(?:meu nome (?:ÃƒÂ©|e)|nome:|sou|me chamo)\s+/i,
        /(?:rua|av|avenida|travessa)\s+/i,
        /endere[ÃƒÂ§c]o:\s+/i,
        /(?:dinheiro|cart[aÃƒÂ£]o|pix|d[eÃƒÂ©]bito|cr[eÃƒÂ©]dito)\s*$/i,
        /(?:delivery|retirar|retiro|buscar|pegar|no local)/i,
    ],
    FINALIZE_ORDER: [], // Intent automÃƒÂ¡tico apÃƒÂ³s coletar todos os dados
    CANCEL_ORDER: [
        /cancela (tudo|o pedido)/i,
        /desisto/i,
        /n[aÃƒÂ£]o quero mais/i,
        /esquece/i,
    ],
    ASK_DELIVERY_INFO: [
        /entrega/i,
        /taxa/i,
        /frete/i,
        /tempo.*demora/i,
        /demora quanto/i,
        /aceita (pix|cart[aÃƒÂ£]o|dinheiro)/i,
        /forma.*pagamento/i,
        /paga como/i,
    ],
    ASK_BUSINESS_HOURS: [
        /hor[aÃƒÂ¡]rio/i,
        /abre.*fecha/i,
        /funciona (at[eÃƒÂ©]|que horas)/i,
        /aberto/i,
        /fechado/i,
    ],
    COMPLAINT: [
        /reclama/i,
        /problema/i,
        /errado/i,
        /demor/i,
        /p[eÃƒÂ©]ssimo/i,
        /ruim/i,
    ],
    OTHER: [], // Fallback
};
// Detectar qual categoria o cliente quer
function detectCategoryFromMessage(message) {
    var normalizedMsg = normalizeCategoryText(message);
    if (!normalizedMsg)
        return null;
    for (var _i = 0, _a = Object.entries(exports.CATEGORY_KEYWORDS); _i < _a.length; _i++) {
        var _b = _a[_i], category = _b[0], keywords = _b[1];
        for (var _c = 0, keywords_1 = keywords; _c < keywords_1.length; _c++) {
            var keyword = keywords_1[_c];
            var normalizedKeyword = normalizeCategoryText(keyword);
            if (!normalizedKeyword)
                continue;
            if (smartCategoryMatch(normalizedMsg, normalizedKeyword)) {
                console.log("\u00F0\u0178\u017D\u00AF [DeliveryAI] Categoria detectada: ".concat(category, " (keyword: ").concat(keyword, ")"));
                return category;
            }
        }
    }
    return null;
}
// Detectar se o cliente mencionou um tamanho na mensagem
function detectSizeFromMessage(message) {
    var normalizedMsg = message.toLowerCase().trim();
    // PadrÃƒÂµes de tamanho
    var sizePatterns = [
        { pattern: /\b(grande|g)\b/i, size: 'G' },
        { pattern: /\b(m[eÃƒÂ©]dia?|m)\b/i, size: 'M' },
        { pattern: /\b(pequena?|p)\b/i, size: 'P' },
        { pattern: /\b(300\s*ml)\b/i, size: '300ml' },
        { pattern: /\b(500\s*ml)\b/i, size: '500ml' },
        { pattern: /\b(700\s*ml)\b/i, size: '700ml' },
        { pattern: /\b(1\s*l(?:itro)?|litro)\b/i, size: '1L' },
        { pattern: /\b(1[,.]5\s*l)\b/i, size: '1.5L' },
        { pattern: /\b(2\s*l(?:itros)?)\b/i, size: '2L' },
        { pattern: /\b(simples)\b/i, size: 'simples' },
        { pattern: /\b(duplo)\b/i, size: 'duplo' },
        { pattern: /\b(triplo)\b/i, size: 'triplo' },
    ];
    for (var _i = 0, sizePatterns_1 = sizePatterns; _i < sizePatterns_1.length; _i++) {
        var _a = sizePatterns_1[_i], pattern = _a.pattern, size = _a.size;
        if (pattern.test(normalizedMsg)) {
            console.log("\u00F0\u0178\u201C\u0090 [DeliveryAI] Tamanho detectado na mensagem: ".concat(size));
            return size;
        }
    }
    return null;
}
function parseOptionalPriceValue(value) {
    if (value === null || value === undefined || value === '')
        return null;
    var parsed = typeof value === 'number'
        ? value
        : (function () {
            var raw = String(value).trim();
            var normalized = raw.includes(',') && raw.includes('.')
                ? raw.replace(/\./g, '').replace(',', '.')
                : raw.replace(',', '.');
            return Number.parseFloat(normalized);
        })();
    return Number.isFinite(parsed) ? parsed : null;
}
function normalizeHalfHalfPricing(raw) {
    var _a, _b, _c;
    return {
        enabled: (raw === null || raw === void 0 ? void 0 : raw.enabled) === true,
        mode: (raw === null || raw === void 0 ? void 0 : raw.mode) === 'fixed' || (raw === null || raw === void 0 ? void 0 : raw.mode) === 'size_map' ? raw.mode : 'highest_item',
        fixedPrice: parseOptionalPriceValue(raw === null || raw === void 0 ? void 0 : raw.fixedPrice),
        sizePrices: {
            P: parseOptionalPriceValue((_a = raw === null || raw === void 0 ? void 0 : raw.sizePrices) === null || _a === void 0 ? void 0 : _a.P),
            M: parseOptionalPriceValue((_b = raw === null || raw === void 0 ? void 0 : raw.sizePrices) === null || _b === void 0 ? void 0 : _b.M),
            G: parseOptionalPriceValue((_c = raw === null || raw === void 0 ? void 0 : raw.sizePrices) === null || _c === void 0 ? void 0 : _c.G),
        },
    };
}
function normalizeHalfHalfSizeKey(sizeCode) {
    var normalized = (sizeCode || '').toUpperCase().trim();
    if (normalized === 'P')
        return 'P';
    if (normalized === 'M')
        return 'M';
    if (normalized === 'G')
        return 'G';
    return null;
}
function getHalfHalfCategory(deliveryData, categoryContext) {
    var items = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        items[_i - 2] = arguments[_i];
    }
    if (categoryContext) {
        var category = findMatchingCategory(deliveryData, categoryContext);
        if (category)
            return category;
    }
    var _loop_1 = function (item) {
        var category = deliveryData.categories.find(function (cat) { return normalizeCategoryText(cat.name) === normalizeCategoryText(item.category_name); });
        if (category)
            return { value: category };
    };
    for (var _a = 0, items_1 = items; _a < items_1.length; _a++) {
        var item = items_1[_a];
        var state_1 = _loop_1(item);
        if (typeof state_1 === "object")
            return state_1.value;
    }
    return null;
}
function resolveHalfHalfPrice(params) {
    var _a;
    var deliveryData = params.deliveryData, categoryContext = params.categoryContext, item1 = params.item1, item2 = params.item2, sizeCode = params.sizeCode, sizeSpecificPrice = params.sizeSpecificPrice;
    var category = getHalfHalfCategory(deliveryData, categoryContext, item1, item2);
    var pricing = normalizeHalfHalfPricing(category === null || category === void 0 ? void 0 : category.half_half_pricing);
    var sizeKey = normalizeHalfHalfSizeKey(sizeCode);
    if (pricing.enabled) {
        if (pricing.mode === 'size_map' && sizeKey) {
            var configuredSizePrice = parseOptionalPriceValue((_a = pricing.sizePrices) === null || _a === void 0 ? void 0 : _a[sizeKey]);
            if (configuredSizePrice !== null) {
                return { finalPrice: configuredSizePrice, source: 'category_size_map' };
            }
        }
        if (pricing.mode === 'fixed') {
            var configuredFixedPrice = parseOptionalPriceValue(pricing.fixedPrice);
            if (configuredFixedPrice !== null) {
                return { finalPrice: configuredFixedPrice, source: 'category_fixed' };
            }
        }
    }
    if (sizeSpecificPrice !== null && sizeSpecificPrice !== undefined) {
        return { finalPrice: sizeSpecificPrice, source: 'item_size' };
    }
    return {
        finalPrice: Math.max(item1.price, item2.price),
        source: 'highest_item',
    };
}
function describeHalfHalfPricing(source, hasVariations) {
    if (source === 'category_fixed') {
        return ' (preco meio a meio configurado para a categoria)';
    }
    if (source === 'category_size_map') {
        return ' (preco meio a meio configurado para esse tamanho)';
    }
    if (source === 'item_size' && hasVariations) {
        return ' (preco do tamanho escolhido)';
    }
    if (source === 'highest_item' && hasVariations) {
        return ' (cobrado o valor da mais cara no tamanho escolhido)';
    }
    return '';
}
function normalizeTextForMatch(text) {
    return (text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[ -]/g, '')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function resolveMenuItemOptions(menuItem, message) {
    var _a, _b;
    var optionsSelected = [];
    var unitPrice = menuItem.price;
    var sizeLabel = null;
    var normalizedMsg = normalizeTextForMatch(message);
    var sizeGroup = (_a = menuItem.options) === null || _a === void 0 ? void 0 : _a.find(function (opt) {
        return opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size');
    });
    var sizeFromMessage = detectSizeFromMessage(message);
    if (sizeGroup && ((_b = sizeGroup.options) === null || _b === void 0 ? void 0 : _b.length)) {
        if (!sizeFromMessage) {
            return {
                unitPrice: menuItem.price,
                displayName: menuItem.name,
                optionsSelected: [],
                needsSize: true,
                sizeOptions: sizeGroup.options.map(function (opt) { return ({ name: opt.name, price: opt.price }); }),
            };
        }
        var selectedSize = sizeGroup.options.find(function (opt) {
            var optNormalized = normalizeTextForMatch(opt.name);
            return optNormalized.includes(normalizeTextForMatch(sizeFromMessage)) ||
                (sizeFromMessage.toLowerCase() === 'p' && optNormalized.includes('pequen')) ||
                (sizeFromMessage.toLowerCase() === 'm' && optNormalized.includes('med')) ||
                (sizeFromMessage.toLowerCase() === 'g' && optNormalized.includes('grand'));
        });
        if (selectedSize) {
            unitPrice = selectedSize.price;
            sizeLabel = selectedSize.name;
            optionsSelected.push({ group: sizeGroup.name, option: selectedSize.name, price: selectedSize.price });
        }
    }
    var hasNoAddons = /\bsem\s+(borda|adicional|extra|recheio)\b/i.test(message);
    if (menuItem.options && !hasNoAddons) {
        for (var _i = 0, _c = menuItem.options; _i < _c.length; _i++) {
            var group = _c[_i];
            var isSizeGroup = sizeGroup && group.name === sizeGroup.name;
            if (isSizeGroup)
                continue;
            for (var _d = 0, _e = group.options || []; _d < _e.length; _d++) {
                var opt = _e[_d];
                var optNormalized = normalizeTextForMatch(opt.name);
                if (optNormalized && normalizedMsg.includes(optNormalized)) {
                    optionsSelected.push({ group: group.name, option: opt.name, price: opt.price });
                    unitPrice += opt.price;
                }
            }
        }
    }
    var notesParts = [];
    if (sizeLabel)
        notesParts.push("Tamanho: ".concat(sizeLabel));
    var addOns = optionsSelected.filter(function (opt) { return !/tamanho|size/i.test(opt.group); });
    if (addOns.length > 0) {
        notesParts.push("Adicionais: ".concat(addOns.map(function (opt) { return opt.option; }).join(', ')));
    }
    return {
        unitPrice: unitPrice,
        displayName: sizeLabel ? "".concat(menuItem.name, " (").concat(sizeLabel, ")") : menuItem.name,
        notes: notesParts.length > 0 ? notesParts.join(' | ') : undefined,
        optionsSelected: optionsSelected,
        needsSize: false,
    };
}
function detectCustomerIntent(message) {
    var normalizedMsg = message.toLowerCase().trim();
    // PRIORIDADE 1: Verificar se ÃƒÂ© pedido meio a meio
    for (var _i = 0, _a = INTENT_PATTERNS.HALF_HALF; _i < _a.length; _i++) {
        var pattern = _a[_i];
        if (pattern.test(normalizedMsg)) {
            console.log("\u00F0\u0178\u017D\u00AF [DeliveryAI] Intent detected: HALF_HALF");
            return 'HALF_HALF';
        }
    }
    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    // Ã°Å¸â€ â€¢ PRIORIDADE 2: Verificar se contÃƒÂ©m pedido ANTES de verificar saudaÃƒÂ§ÃƒÂ£o
    // "Oi, quero uma pizza calabresa" = WANT_TO_ORDER (nÃƒÂ£o GREETING)
    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    for (var _b = 0, _c = INTENT_PATTERNS.WANT_TO_ORDER; _b < _c.length; _b++) {
        var pattern = _c[_b];
        if (pattern.test(normalizedMsg)) {
            console.log("\u00F0\u0178\u017D\u00AF [DeliveryAI] Intent detected: WANT_TO_ORDER (pattern: ".concat(pattern, ")"));
            return 'WANT_TO_ORDER';
        }
    }
    // PRIORIDADE 3: Verificar se ÃƒÂ© seleÃƒÂ§ÃƒÂ£o de categoria especÃƒÂ­fica
    // Ex: "pizza", "bebidas", "aÃƒÂ§aÃƒÂ­" - sem mais nada
    for (var _d = 0, _e = INTENT_PATTERNS.WANT_CATEGORY; _d < _e.length; _d++) {
        var pattern = _e[_d];
        if (pattern.test(normalizedMsg)) {
            console.log("\u00F0\u0178\u017D\u00AF [DeliveryAI] Intent detected: WANT_CATEGORY (pattern: ".concat(pattern, ")"));
            return 'WANT_CATEGORY';
        }
    }
    // Verificar cada padrÃƒÂ£o em ordem de prioridade
    for (var _f = 0, _g = Object.entries(INTENT_PATTERNS); _f < _g.length; _f++) {
        var _h = _g[_f], intent = _h[0], patterns = _h[1];
        if (intent === 'WANT_CATEGORY' || intent === 'HALF_HALF' || intent === 'WANT_TO_ORDER')
            continue; // JÃƒÂ¡ verificamos
        for (var _j = 0, patterns_1 = patterns; _j < patterns_1.length; _j++) {
            var pattern = patterns_1[_j];
            if (pattern.test(normalizedMsg)) {
                console.log("\u00F0\u0178\u017D\u00AF [DeliveryAI] Intent detected: ".concat(intent, " (pattern: ").concat(pattern, ")"));
                return intent;
            }
        }
    }
    return 'OTHER';
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã°Å¸Â¤â€“ DETECÃƒâ€¡ÃƒÆ’O DE INTENÃƒâ€¡ÃƒÆ’O COM IA (CONSIDERA CONTEXTO)
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function detectIntentWithAI(message, conversationHistory, deliveryData) {
    return __awaiter(this, void 0, void 0, function () {
        var lastBotMessage, botMsgLower, isAwaitingSize, sizeDetected, isAwaitingHalfHalfFlavors, hasTwoFlavors, mistral, hasOrderInProgress, isSimpleGreeting, recentHistory, systemPrompt, response, intentStr_1, validIntents, detectedIntent, error_4;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    // Se nÃƒÂ£o tem histÃƒÂ³rico, usa detecÃƒÂ§ÃƒÂ£o simples por regex
                    if (!conversationHistory || conversationHistory.length < 2) {
                        return [2 /*return*/, detectCustomerIntent(message)];
                    }
                    lastBotMessage = conversationHistory.filter(function (m) { return m.fromMe; }).slice(-1)[0];
                    if (lastBotMessage) {
                        botMsgLower = lastBotMessage.text.toLowerCase();
                        isAwaitingSize = botMsgLower.includes('qual tamanho') ||
                            botMsgLower.includes('qual o tamanho') ||
                            botMsgLower.includes('me diz o tamanho') ||
                            (botMsgLower.includes('tamanho') &&
                                (botMsgLower.includes('pequena (p)') ||
                                    botMsgLower.includes('mÃƒÂ©dia (m)') ||
                                    botMsgLower.includes('grande (g)')));
                        if (isAwaitingSize) {
                            sizeDetected = detectSizeFromMessage(message);
                            if (sizeDetected) {
                                console.log("\u00F0\u0178\u00A4\u2013 [DeliveryAI] Contexto AWAITING_SIZE detectado! Cliente escolheu: ".concat(sizeDetected));
                                return [2 /*return*/, 'ADD_ITEM']; // Usar ADD_ITEM para continuar o pedido com o tamanho
                            }
                        }
                        isAwaitingHalfHalfFlavors = botMsgLower.includes('meio a meio') &&
                            (botMsgLower.includes('quais dois sabores') || botMsgLower.includes('exemplo: "calabresa e mussarela"'));
                        if (isAwaitingHalfHalfFlavors) {
                            hasTwoFlavors = /\b(.+?)\s+(e|com|\/)\s+(.+?)\b/i.test(message) ||
                                /(meia\s+.+?\s+meia\s+.+)/i.test(message);
                            if (hasTwoFlavors) {
                                console.log("\u00F0\u0178\u00A4\u2013 [DeliveryAI] Contexto AWAITING_HALF_HALF detectado! Cliente informou sabores.");
                                return [2 /*return*/, 'HALF_HALF'];
                            }
                        }
                    }
                    return [4 /*yield*/, (0, llm_1.getLLMClient)()];
                case 1:
                    mistral = _d.sent();
                    if (!mistral) {
                        console.log("\u00F0\u0178\u00A4\u2013 [DeliveryAI] Mistral indispon\u00C3\u00ADvel, usando regex");
                        return [2 /*return*/, detectCustomerIntent(message)];
                    }
                    hasOrderInProgress = conversationHistory.some(function (m) {
                        return m.fromMe && (m.text.toLowerCase().includes('seu pedido:') ||
                            m.text.toLowerCase().includes('resumo do pedido') ||
                            m.text.toLowerCase().includes('para finalizar'));
                    });
                    isSimpleGreeting = /^(oi+e?|olÃƒÂ¡|ola|eai|hey|opa)\s*[!?.,]*$/i.test(message.trim());
                    if (isSimpleGreeting && hasOrderInProgress) {
                        console.log("\u00F0\u0178\u00A4\u2013 [DeliveryAI] Sauda\u00C3\u00A7\u00C3\u00A3o com pedido em andamento -> tratando como CONTINUE_ORDER");
                        return [2 /*return*/, 'OTHER']; // Vai cair no fluxo de IA contextual
                    }
                    recentHistory = conversationHistory.slice(-6).map(function (m) {
                        return "".concat(m.fromMe ? 'Atendente' : 'Cliente', ": ").concat(m.text.substring(0, 100));
                    }).join('\n');
                    systemPrompt = "Voc\u00C3\u00AA analisa inten\u00C3\u00A7\u00C3\u00B5es de clientes em delivery.\nBaseado no CONTEXTO da conversa, classifique a inten\u00C3\u00A7\u00C3\u00A3o da \u00C3\u00BAltima mensagem.\n\nINTEN\u00C3\u2021\u00C3\u2022ES POSS\u00C3\u008DVEIS:\n- GREETING: Primeira sauda\u00C3\u00A7\u00C3\u00A3o (oi, ol\u00C3\u00A1) SEM pedido em andamento\n- WANT_MENU: Quer ver card\u00C3\u00A1pio completo\n- WANT_CATEGORY: Quer ver apenas uma categoria (pizza, esfirra, bebida)\n- HALF_HALF: Pedido meio a meio (meia X e meia Y)\n- WANT_TO_ORDER: Quer fazer pedido ou adicionar item\n- ADD_ITEM: Quer adicionar mais itens ao pedido existente\n- REMOVE_ITEM: Quer remover item\n- CONFIRM_ORDER: Confirma pedido (sim, confirmo, pode mandar, ok, fechado)\n- PROVIDE_CUSTOMER_INFO: Fornece dados pessoais (nome, endere\u00C3\u00A7o, telefone, pagamento)\n- CANCEL_ORDER: Cancela pedido\n- ASK_DELIVERY_INFO: Pergunta sobre entrega, taxa, tempo\n- OTHER: Outras perguntas ou continua\u00C3\u00A7\u00C3\u00A3o de conversa\n\nREGRAS IMPORTANTES:\n1. \"sim\", \"confirmo\", \"ok\", \"pode mandar\", \"fechado\" = CONFIRM_ORDER\n2. \"meia X e meia Y\" = HALF_HALF (sempre, mesmo sem dizer \"meio a meio\")\n3. Se j\u00C3\u00A1 tem pedido em andamento e cliente manda sauda\u00C3\u00A7\u00C3\u00A3o simples, \u00C3\u00A9 OTHER ou CONFIRM_ORDER\n4. Se menciona apenas UMA categoria GEN\u00C3\u2030RICA sem especificar item (ex: \"pizza\", \"bordas\", \"bebidas\") = WANT_CATEGORY\n5. Se menciona um ITEM ESPEC\u00C3\u008DFICO de uma categoria (ex: \"borda de cheddar\", \"coca-cola 2l\", \"calabresa grande\", \"borda cheddar\") = WANT_TO_ORDER ou ADD_ITEM, NUNCA WANT_CATEGORY\n6. Se fornece nome, endere\u00C3\u00A7o, forma de pagamento = PROVIDE_CUSTOMER_INFO\n7. Palavras como \"adiciona\", \"coloca\", \"quero\", \"bota\" seguidas de nome de item = ADD_ITEM ou WANT_TO_ORDER\n\nResponda APENAS com o nome da inten\u00C3\u00A7\u00C3\u00A3o, nada mais.";
                    _d.label = 2;
                case 2:
                    _d.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, mistral.chat.complete({
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: "CONTEXTO DA CONVERSA:\n".concat(recentHistory, "\n\n\u00C3\u0161LTIMA MENSAGEM DO CLIENTE: \"").concat(message, "\"\n\nQual a inten\u00C3\u00A7\u00C3\u00A3o?") }
                            ],
                            temperature: 0.1,
                            maxTokens: 20,
                        })];
                case 3:
                    response = _d.sent();
                    intentStr_1 = (((_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || 'OTHER').toString().trim().toUpperCase();
                    validIntents = ['GREETING', 'WANT_MENU', 'WANT_CATEGORY', 'HALF_HALF', 'ASK_ABOUT_ITEM', 'WANT_TO_ORDER', 'ADD_ITEM', 'REMOVE_ITEM', 'CONFIRM_ORDER', 'PROVIDE_CUSTOMER_INFO', 'FINALIZE_ORDER', 'CANCEL_ORDER', 'ASK_DELIVERY_INFO', 'ASK_BUSINESS_HOURS', 'COMPLAINT', 'OTHER'];
                    detectedIntent = validIntents.find(function (i) { return intentStr_1.includes(i); }) || 'OTHER';
                    console.log("\u00F0\u0178\u00A4\u2013 [DeliveryAI] IA detectou intent: ".concat(detectedIntent, " (resposta: ").concat(intentStr_1, ")"));
                    return [2 /*return*/, detectedIntent];
                case 4:
                    error_4 = _d.sent();
                    console.error("\u00F0\u0178\u00A4\u2013 [DeliveryAI] Erro na detec\u00C3\u00A7\u00C3\u00A3o IA:", error_4);
                    return [2 /*return*/, detectCustomerIntent(message)];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã°Å¸â€œÅ  BUSCAR DADOS DO DELIVERY (BANCO DE DADOS)
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function isDeliveryEnabled(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('delivery_config')
                            .select('is_active')
                            .eq('user_id', userId)
                            .maybeSingle()];
                case 1:
                    _a = _c.sent(), data = _a.data, error = _a.error;
                    if (error || !data) {
                        return [2 /*return*/, false];
                    }
                    return [2 /*return*/, data.is_active === true];
                case 2:
                    _b = _c.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function getDeliveryData(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, config, configError, categories, items, categoryMap_1, categoryIdToMeta_1, result, error_5;
        var _b, _c, _d, _e, _f, _g, _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0:
                    _k.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('delivery_config')
                            .select('*')
                            .eq('user_id', userId)
                            .maybeSingle()];
                case 1:
                    _a = _k.sent(), config = _a.data, configError = _a.error;
                    console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] DEBUG getDeliveryData: userId=".concat(userId));
                    console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] DEBUG config: ".concat(JSON.stringify(config)));
                    console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] DEBUG configError: ".concat(configError ? JSON.stringify(configError) : 'null'));
                    console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] DEBUG is_active value: ".concat(config === null || config === void 0 ? void 0 : config.is_active, " (type: ").concat(typeof (config === null || config === void 0 ? void 0 : config.is_active), ")"));
                    if (configError || !config || !config.is_active) {
                        console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Delivery n\u00C3\u00A3o ativo para user ".concat(userId));
                        console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Motivo: configError=".concat(!!configError, ", config=").concat(!!config, ", is_active=").concat(config === null || config === void 0 ? void 0 : config.is_active));
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('menu_categories')
                            .select('*')
                            .eq('user_id', userId)
                            .order('display_order', { ascending: true })];
                case 2:
                    categories = (_k.sent()).data;
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('menu_items')
                            .select('id, name, description, price, category_id, is_featured, is_available, options')
                            .eq('user_id', userId)
                            .eq('is_available', true)
                            .order('display_order', { ascending: true })];
                case 3:
                    items = (_k.sent()).data;
                    if (!items || items.length === 0) {
                        console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Nenhum item encontrado para user ".concat(userId));
                        return [2 /*return*/, null];
                    }
                    categoryMap_1 = new Map();
                    categoryIdToMeta_1 = new Map();
                    categories === null || categories === void 0 ? void 0 : categories.forEach(function (cat) { return categoryIdToMeta_1.set(cat.id, {
                        id: cat.id,
                        name: cat.name,
                        image_url: cat.image_url,
                        half_half_pricing: normalizeHalfHalfPricing(cat.half_half_pricing),
                    }); });
                    // Agrupar itens por categoria
                    items.forEach(function (item) {
                        var categoryMeta = categoryIdToMeta_1.get(item.category_id);
                        var categoryName = (categoryMeta === null || categoryMeta === void 0 ? void 0 : categoryMeta.name) || 'Outros';
                        if (!categoryMap_1.has(categoryName)) {
                            categoryMap_1.set(categoryName, {
                                id: categoryMeta === null || categoryMeta === void 0 ? void 0 : categoryMeta.id,
                                name: categoryName,
                                image_url: (categoryMeta === null || categoryMeta === void 0 ? void 0 : categoryMeta.image_url) || null,
                                half_half_pricing: (categoryMeta === null || categoryMeta === void 0 ? void 0 : categoryMeta.half_half_pricing) || null,
                                items: [],
                            });
                        }
                        // Parsear options (variaÃƒÂ§ÃƒÂµes) se existir
                        var parsedOptions;
                        if (item.options && Array.isArray(item.options) && item.options.length > 0) {
                            parsedOptions = item.options;
                        }
                        categoryMap_1.get(categoryName).items.push({
                            id: item.id,
                            name: item.name,
                            description: item.description,
                            price: parseFloat(item.price) || 0,
                            category_name: categoryName,
                            is_highlight: item.is_featured || false,
                            is_available: item.is_available,
                            options: parsedOptions,
                        });
                    });
                    result = {
                        config: {
                            id: config.id,
                            user_id: config.user_id,
                            business_name: config.business_name,
                            business_type: config.business_type || 'restaurante',
                            menu_send_mode: config.menu_send_mode || 'text',
                            delivery_fee: parseFloat(config.delivery_fee) || 0,
                            min_order_value: parseFloat(config.min_order_value) || 0,
                            estimated_delivery_time: config.estimated_delivery_time || 45,
                            accepts_delivery: (_b = config.accepts_delivery) !== null && _b !== void 0 ? _b : true,
                            accepts_pickup: (_c = config.accepts_pickup) !== null && _c !== void 0 ? _c : true,
                            accepts_cancellation: (_d = config.accepts_cancellation) !== null && _d !== void 0 ? _d : false, // Default: nÃƒÂ£o permite cancelamento
                            payment_methods: config.payment_methods || ['Dinheiro', 'CartÃƒÂ£o', 'Pix'],
                            is_active: config.is_active,
                            opening_hours: config.opening_hours || {}, // HorÃƒÂ¡rios de funcionamento
                            welcome_message: config.welcome_message || null,
                            order_confirmation_message: config.order_confirmation_message || null,
                            order_ready_message: config.order_ready_message || null,
                            out_for_delivery_message: config.out_for_delivery_message || null,
                            closed_message: config.closed_message || null,
                            humanize_responses: (_e = config.humanize_responses) !== null && _e !== void 0 ? _e : true,
                            use_customer_name: (_f = config.use_customer_name) !== null && _f !== void 0 ? _f : true,
                            response_variation: (_g = config.response_variation) !== null && _g !== void 0 ? _g : true,
                            response_delay_min: (_h = config.response_delay_min) !== null && _h !== void 0 ? _h : 2,
                            response_delay_max: (_j = config.response_delay_max) !== null && _j !== void 0 ? _j : 5,
                            pix_settings: normalizePixSettings(config.pix_settings),
                            cash_settings: normalizeCashSettings(config.cash_settings),
                            delivery_fee_settings: normalizeDeliveryFeeSettings(__assign(__assign({}, config), { delivery_fee: parseFloat(config.delivery_fee) || 0 })),
                        },
                        categories: Array.from(categoryMap_1.values()),
                        totalItems: items.length,
                    };
                    console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Dados carregados: ".concat(result.totalItems, " itens em ").concat(result.categories.length, " categorias"));
                    result.categories.forEach(function (cat) {
                        console.log("   \u00F0\u0178\u201C\u0081 ".concat(cat.name, ": ").concat(cat.items.length, " itens"));
                    });
                    return [2 /*return*/, result];
                case 4:
                    error_5 = _k.sent();
                    console.error("\u00F0\u0178\u008D\u2022 [DeliveryAI] Erro ao buscar dados:", error_5);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã°Å¸Å½Â¨ FORMATAR CARDÃƒÂPIO EM BOLHAS
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
var EMOJI_BY_TYPE = {
    pizzaria: 'Ã°Å¸Ââ€¢',
    hamburgueria: 'Ã°Å¸Ââ€',
    lanchonete: 'Ã°Å¸Â¥Âª',
    restaurante: 'Ã°Å¸ÂÂ½Ã¯Â¸Â',
    acai: 'Ã°Å¸ÂÂ¨',
    japonesa: 'Ã°Å¸ÂÂ£',
    outros: 'Ã°Å¸ÂÂ´',
};
var MAX_CHARS_PER_BUBBLE = 1500; // WhatsApp suporta ~4096, mas melhor dividir
function formatMenuAsBubbles(data) {
    var _a;
    var bubbles = [];
    var emoji = EMOJI_BY_TYPE[data.config.business_type] || 'Ã°Å¸ÂÂ´';
    // Header (primeira bolha)
    var header = "".concat(emoji, " *").concat(data.config.business_name.toUpperCase(), "*\n");
    header += "\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\n";
    header += "\u00F0\u0178\u201C\u2039 Card\u00C3\u00A1pio completo (".concat(data.totalItems, " itens)\n\n");
    // Adicionar informaÃƒÂ§ÃƒÂµes de entrega no header
    if (data.config.accepts_delivery) {
        header += "\u00F0\u0178\u203A\u00B5 Entrega: R$ ".concat(data.config.delivery_fee.toFixed(2).replace('.', ','), "\n");
        header += "\u00E2\u008F\u00B1\u00EF\u00B8\u008F Tempo: ~".concat(data.config.estimated_delivery_time, " min\n");
    }
    if (data.config.accepts_pickup) {
        header += "\u00F0\u0178\u008F\u00AA Retirada: GR\u00C3\u0081TIS\n";
    }
    if (data.config.min_order_value > 0) {
        header += "\u00F0\u0178\u201C\u00A6 Pedido m\u00C3\u00ADnimo: R$ ".concat(data.config.min_order_value.toFixed(2).replace('.', ','), "\n");
    }
    header += "\u00F0\u0178\u2019\u00B3 Pagamento: ".concat(data.config.payment_methods.join(', '), "\n");
    bubbles.push(header);
    // Cada categoria pode virar uma ou mais bolhas
    for (var _i = 0, _b = data.categories; _i < _b.length; _i++) {
        var category = _b[_i];
        var categoryBubble = "\n\u00F0\u0178\u201C\u0081 *".concat(category.name.toUpperCase(), "*\n");
        categoryBubble += "\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\n";
        for (var _c = 0, _d = category.items; _c < _d.length; _c++) {
            var item = _d[_c];
            var highlight = item.is_highlight ? ' Ã¢Â­Â' : '';
            // Verificar se tem variaÃƒÂ§ÃƒÂµes de tamanho
            var sizeOption = (_a = item.options) === null || _a === void 0 ? void 0 : _a.find(function (opt) {
                return opt.name.toLowerCase().includes('tamanho') ||
                    opt.name.toLowerCase().includes('size');
            });
            var itemLine = '';
            if (sizeOption && sizeOption.options.length > 0) {
                // Mostrar item com variaÃƒÂ§ÃƒÂµes de tamanho
                var prices = sizeOption.options.map(function (opt) {
                    return "".concat(opt.name, ": R$ ").concat(opt.price.toFixed(2).replace('.', ','));
                }).join(' | ');
                itemLine = "\u00E2\u20AC\u00A2 ".concat(item.name).concat(highlight, "\n  ").concat(prices, "\n");
            }
            else {
                // Item sem variaÃƒÂ§ÃƒÂµes - preÃƒÂ§o ÃƒÂºnico
                var priceStr = "R$ ".concat(item.price.toFixed(2).replace('.', ','));
                itemLine = "\u00E2\u20AC\u00A2 ".concat(item.name).concat(highlight, " - ").concat(priceStr, "\n");
            }
            if (item.description) {
                itemLine += "  _".concat(item.description, "_\n");
            }
            // Se adicionar este item ultrapassar o limite, criar nova bolha
            if ((categoryBubble + itemLine).length > MAX_CHARS_PER_BUBBLE) {
                bubbles.push(categoryBubble.trim());
                categoryBubble = "\u00F0\u0178\u201C\u0081 *".concat(category.name.toUpperCase(), " (cont.)*\n");
                categoryBubble += "\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\n";
            }
            categoryBubble += itemLine;
        }
        bubbles.push(categoryBubble.trim());
    }
    // Footer (ÃƒÂºltima bolha)
    var footer = "\n\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\n\u00E2\u0153\u2026 Pronto para pedir? Me avise! \u00F0\u0178\u02DC\u0160";
    // Adicionar footer ÃƒÂ  ÃƒÂºltima bolha ou criar nova
    var lastBubble = bubbles[bubbles.length - 1];
    if ((lastBubble + footer).length <= MAX_CHARS_PER_BUBBLE) {
        bubbles[bubbles.length - 1] = lastBubble + footer;
    }
    else {
        bubbles.push(footer.trim());
    }
    console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Card\u00C3\u00A1pio formatado em ".concat(bubbles.length, " bolhas"));
    return bubbles;
}
function buildMenuMediaActions(data, intent, metadata) {
    if (intent !== 'WANT_MENU' && intent !== 'WANT_CATEGORY' && intent !== 'GREETING') {
        return [];
    }
    if (metadata === null || metadata === void 0 ? void 0 : metadata.categoryImageUrl) {
        return [
            {
                type: 'send_media_url',
                media_url: metadata.categoryImageUrl,
                media_type: 'image',
                caption: metadata.categoryName || metadata.categoryRequested,
            }
        ];
    }
    var categoriesWithImages = data.categories.filter(function (cat) { return !!cat.image_url; });
    if (categoriesWithImages.length === 0)
        return [];
    var requested = String((metadata === null || metadata === void 0 ? void 0 : metadata.categoryRequested) || '').toLowerCase().trim();
    if (requested) {
        var normalizedRequested_1 = normalizeCategoryText(requested);
        var keywordCandidates_1 = new Set([requested]);
        if (exports.CATEGORY_KEYWORDS[requested]) {
            exports.CATEGORY_KEYWORDS[requested].forEach(function (k) { return keywordCandidates_1.add(k); });
        }
        var matchingKey = Object.keys(exports.CATEGORY_KEYWORDS).find(function (key) {
            return exports.CATEGORY_KEYWORDS[key].some(function (k) { return normalizeCategoryText(k) === normalizedRequested_1; });
        });
        if (matchingKey) {
            keywordCandidates_1.add(matchingKey);
            exports.CATEGORY_KEYWORDS[matchingKey].forEach(function (k) { return keywordCandidates_1.add(k); });
        }
        var match = categoriesWithImages.find(function (cat) {
            var normalizedName = normalizeCategoryText(cat.name);
            for (var _i = 0, keywordCandidates_2 = keywordCandidates_1; _i < keywordCandidates_2.length; _i++) {
                var candidate = keywordCandidates_2[_i];
                var normalizedCandidate = normalizeCategoryText(candidate);
                if (!normalizedCandidate)
                    continue;
                if (normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName)) {
                    return true;
                }
            }
            return false;
        });
        if (!(match === null || match === void 0 ? void 0 : match.image_url))
            return [];
        return [
            {
                type: 'send_media_url',
                media_url: match.image_url,
                media_type: 'image',
                caption: match.name,
            }
        ];
    }
    if (intent === 'WANT_CATEGORY') {
        return [];
    }
    // Ã°Å¸â€ â€¢ Para GREETING e WANT_MENU sem categoria especÃƒÂ­fica: enviar TODAS as imagens ÃƒÂºnicas do cardÃƒÂ¡pio
    if (intent === 'GREETING' || intent === 'WANT_MENU') {
        var uniqueImages = new Map(); // url -> caption
        for (var _i = 0, categoriesWithImages_1 = categoriesWithImages; _i < categoriesWithImages_1.length; _i++) {
            var cat = categoriesWithImages_1[_i];
            if (cat.image_url && !uniqueImages.has(cat.image_url)) {
                uniqueImages.set(cat.image_url, cat.name);
            }
        }
        if (uniqueImages.size > 0) {
            var actions = [];
            for (var _a = 0, uniqueImages_1 = uniqueImages; _a < uniqueImages_1.length; _a++) {
                var _b = uniqueImages_1[_a], url = _b[0], caption = _b[1];
                actions.push({
                    type: 'send_media_url',
                    media_url: url,
                    media_type: 'image',
                    caption: caption,
                });
            }
            return actions;
        }
    }
    return [];
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã°Å¸Å½Â¨ FORMATAR CATEGORIA ESPECÃƒÂFICA (QUANDO CLIENTE ESCOLHE UMA CATEGORIA)
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function findMatchingCategory(data, categoryKeyword) {
    var normalizedKeyword = normalizeCategoryText(categoryKeyword);
    var keywordCandidates = new Set([categoryKeyword]);
    if (exports.CATEGORY_KEYWORDS[categoryKeyword]) {
        exports.CATEGORY_KEYWORDS[categoryKeyword].forEach(function (k) { return keywordCandidates.add(k); });
    }
    var matchingKey = Object.keys(exports.CATEGORY_KEYWORDS).find(function (key) {
        return exports.CATEGORY_KEYWORDS[key].some(function (k) { return normalizeCategoryText(k) === normalizedKeyword; });
    });
    if (matchingKey) {
        keywordCandidates.add(matchingKey);
        exports.CATEGORY_KEYWORDS[matchingKey].forEach(function (k) { return keywordCandidates.add(k); });
    }
    var match = data.categories.find(function (cat) {
        var catNameNormalized = normalizeCategoryText(cat.name);
        if (!catNameNormalized)
            return false;
        for (var _i = 0, keywordCandidates_3 = keywordCandidates; _i < keywordCandidates_3.length; _i++) {
            var candidate = keywordCandidates_3[_i];
            var normalizedCandidate = normalizeCategoryText(candidate);
            if (!normalizedCandidate)
                continue;
            if (smartCategoryMatch(catNameNormalized, normalizedCandidate)) {
                return true;
            }
        }
        return false;
    });
    return match || null;
}
function formatCategoryAsBubbles(data, categoryKeyword) {
    var _a;
    var bubbles = [];
    var emoji = EMOJI_BY_TYPE[data.config.business_type] || 'Ã°Å¸ÂÂ´';
    var normalizedKeyword = normalizeCategoryText(categoryKeyword);
    var keywordCandidates = new Set([categoryKeyword]);
    if (exports.CATEGORY_KEYWORDS[categoryKeyword]) {
        exports.CATEGORY_KEYWORDS[categoryKeyword].forEach(function (k) { return keywordCandidates.add(k); });
    }
    var matchingKey = Object.keys(exports.CATEGORY_KEYWORDS).find(function (key) {
        return exports.CATEGORY_KEYWORDS[key].some(function (k) { return normalizeCategoryText(k) === normalizedKeyword; });
    });
    if (matchingKey) {
        keywordCandidates.add(matchingKey);
        exports.CATEGORY_KEYWORDS[matchingKey].forEach(function (k) { return keywordCandidates.add(k); });
    }
    // Encontrar categorias que correspondem ao keyword
    var matchingCategories = data.categories.filter(function (cat) {
        var catNameNormalized = normalizeCategoryText(cat.name);
        if (!catNameNormalized)
            return false;
        if (smartCategoryMatch(catNameNormalized, normalizedKeyword)) {
            return true;
        }
        for (var _i = 0, keywordCandidates_4 = keywordCandidates; _i < keywordCandidates_4.length; _i++) {
            var candidate = keywordCandidates_4[_i];
            var normalizedCandidate = normalizeCategoryText(candidate);
            if (!normalizedCandidate)
                continue;
            if (smartCategoryMatch(catNameNormalized, normalizedCandidate)) {
                return true;
            }
        }
        return false;
    });
    if (matchingCategories.length === 0) {
        // NÃƒÂ£o encontrou a categoria, retorna mensagem amigÃƒÂ¡vel
        return ["N\u00C3\u00A3o encontrei essa categoria no card\u00C3\u00A1pio. \u00F0\u0178\u00A4\u201D\n\nTemos:\n".concat(data.categories.map(function (c) { return "\u00E2\u20AC\u00A2 ".concat(c.name); }).join('\n'), "\n\nQual voc\u00C3\u00AA gostaria de ver?")];
    }
    // Conta total de itens nas categorias encontradas
    var totalItems = matchingCategories.reduce(function (sum, cat) { return sum + cat.items.length; }, 0);
    // Header
    var header = "".concat(emoji, " *").concat(data.config.business_name.toUpperCase(), "*\n");
    header += "\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\n";
    header += "\u00F0\u0178\u201C\u2039 ".concat(matchingCategories.map(function (c) { return c.name; }).join(', '), " (").concat(totalItems, " op\u00C3\u00A7\u00C3\u00B5es)\n");
    bubbles.push(header);
    // Formatar cada categoria encontrada
    for (var _i = 0, matchingCategories_1 = matchingCategories; _i < matchingCategories_1.length; _i++) {
        var category = matchingCategories_1[_i];
        var categoryBubble = "\n\u00F0\u0178\u201C\u0081 *".concat(category.name.toUpperCase(), "*\n");
        categoryBubble += "\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\n";
        for (var _b = 0, _c = category.items; _b < _c.length; _b++) {
            var item = _c[_b];
            var highlight = item.is_highlight ? ' Ã¢Â­Â' : '';
            // Verificar se tem variaÃƒÂ§ÃƒÂµes de tamanho
            var sizeOption = (_a = item.options) === null || _a === void 0 ? void 0 : _a.find(function (opt) {
                return opt.name.toLowerCase().includes('tamanho') ||
                    opt.name.toLowerCase().includes('size');
            });
            var itemLine = '';
            if (sizeOption && sizeOption.options.length > 0) {
                // Mostrar item com variaÃƒÂ§ÃƒÂµes de tamanho
                var prices = sizeOption.options.map(function (opt) {
                    return "".concat(opt.name, ": R$ ").concat(opt.price.toFixed(2).replace('.', ','));
                }).join(' | ');
                itemLine = "\u00E2\u20AC\u00A2 ".concat(item.name).concat(highlight, "\n  ").concat(prices, "\n");
            }
            else {
                // Item sem variaÃƒÂ§ÃƒÂµes - preÃƒÂ§o ÃƒÂºnico
                var priceStr = "R$ ".concat(item.price.toFixed(2).replace('.', ','));
                itemLine = "\u00E2\u20AC\u00A2 ".concat(item.name).concat(highlight, " - ").concat(priceStr, "\n");
            }
            if (item.description) {
                itemLine += "  _".concat(item.description, "_\n");
            }
            // Se adicionar este item ultrapassar o limite, criar nova bolha
            if ((categoryBubble + itemLine).length > MAX_CHARS_PER_BUBBLE) {
                bubbles.push(categoryBubble.trim());
                categoryBubble = "\u00F0\u0178\u201C\u0081 *".concat(category.name.toUpperCase(), " (cont.)*\n");
                categoryBubble += "\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\u00E2\u201D\u20AC\n";
            }
            categoryBubble += itemLine;
        }
        bubbles.push(categoryBubble.trim());
    }
    // Footer
    var footer = "\n\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\u00E2\u201D\u0081\n\u00E2\u0153\u2026 Qual voc\u00C3\u00AA quer? \u00C3\u2030 s\u00C3\u00B3 me dizer! \u00F0\u0178\u02DC\u0160";
    // Adicionar footer ÃƒÂ  ÃƒÂºltima bolha ou criar nova
    var lastBubble = bubbles[bubbles.length - 1];
    if ((lastBubble + footer).length <= MAX_CHARS_PER_BUBBLE) {
        bubbles[bubbles.length - 1] = lastBubble + footer;
    }
    else {
        bubbles.push(footer.trim());
    }
    console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Categoria \"".concat(categoryKeyword, "\" formatada em ").concat(bubbles.length, " bolhas (").concat(totalItems, " itens)"));
    return bubbles;
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã°Å¸â€Â VALIDAR PREÃƒâ€¡O DE ITEM (CONTRA BANCO DE DADOS)
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function findItemInMenu(data, itemName) {
    var normalizedName = itemName.toLowerCase().trim();
    for (var _i = 0, _a = data.categories; _i < _a.length; _i++) {
        var category = _a[_i];
        for (var _b = 0, _c = category.items; _b < _c.length; _b++) {
            var item = _c[_b];
            // Match exato
            if (item.name.toLowerCase() === normalizedName) {
                return item;
            }
            // Match parcial (contÃƒÂ©m)
            if (item.name.toLowerCase().includes(normalizedName) ||
                normalizedName.includes(item.name.toLowerCase())) {
                return item;
            }
        }
    }
    return null;
}
function validatePriceInResponse(response, data) {
    var errors = [];
    var corrected = response;
    // Regex para encontrar preÃƒÂ§os no formato R$ XX,XX ou R$XX
    var pricePattern = /R\$\s*(\d+)[,.](\d{2})/g;
    var matches = __spreadArray([], response.matchAll(pricePattern), true);
    var _loop_2 = function (match) {
        var foundPrice = parseFloat("".concat(match[1], ".").concat(match[2]));
        // Tentar encontrar qual item estÃƒÂ¡ sendo mencionado
        // (buscar nome de item prÃƒÂ³ximo ao preÃƒÂ§o no texto)
        var nearbyText = response.substring(Math.max(0, match.index - 100), Math.min(response.length, match.index + 100));
        var nearbyTextLower = nearbyText.toLowerCase();
        // Verificar se algum item do menu estÃƒÂ¡ mencionado
        var itemFound = false;
        for (var _a = 0, _b = data.categories; _a < _b.length; _a++) {
            var category = _b[_a];
            for (var _c = 0, _d = category.items; _c < _d.length; _c++) {
                var item = _d[_c];
                if (nearbyTextLower.includes(item.name.toLowerCase())) {
                    // Coletar todos os preÃƒÂ§os vÃƒÂ¡lidos: preÃƒÂ§o base + variaÃƒÂ§ÃƒÂµes
                    var validPrices = [item.price];
                    // Adicionar preÃƒÂ§os das variaÃƒÂ§ÃƒÂµes (tamanhos como P, M, G)
                    if (item.options && Array.isArray(item.options)) {
                        for (var _e = 0, _f = item.options; _e < _f.length; _e++) {
                            var optionGroup = _f[_e];
                            if (optionGroup.options && Array.isArray(optionGroup.options)) {
                                for (var _g = 0, _h = optionGroup.options; _g < _h.length; _g++) {
                                    var opt = _h[_g];
                                    if (typeof opt.price === 'number' && opt.price > 0) {
                                        validPrices.push(opt.price);
                                    }
                                }
                            }
                        }
                    }
                    // Verificar se o preÃƒÂ§o encontrado estÃƒÂ¡ na lista de preÃƒÂ§os vÃƒÂ¡lidos
                    var isValidPrice = validPrices.some(function (vp) { return Math.abs(vp - foundPrice) < 0.01; });
                    if (!isValidPrice) {
                        // SÃƒÂ³ reporta erro se o preÃƒÂ§o NÃƒÆ’O estÃƒÂ¡ em nenhuma variaÃƒÂ§ÃƒÂ£o
                        errors.push("Pre\u00C3\u00A7o incorreto para ".concat(item.name, ": R$ ").concat(foundPrice.toFixed(2), " (pre\u00C3\u00A7os v\u00C3\u00A1lidos: R$ ").concat(validPrices.map(function (p) { return p.toFixed(2); }).join(', R$ '), ")"));
                        // NÃƒÆ’O corrigir automaticamente - pode ser um tamanho diferente
                        // O preÃƒÂ§o base sÃƒÂ³ ÃƒÂ© usado se nÃƒÂ£o hÃƒÂ¡ variaÃƒÂ§ÃƒÂµes detectadas
                        if (validPrices.length === 1) {
                            corrected = corrected.replace(match[0], "R$ ".concat(item.price.toFixed(2).replace('.', ',')));
                        }
                    }
                    else {
                        console.log("\u00E2\u0153\u2026 [PriceValidation] Pre\u00C3\u00A7o R$ ".concat(foundPrice.toFixed(2), " v\u00C3\u00A1lido para ").concat(item.name, " (varia\u00C3\u00A7\u00C3\u00A3o encontrada)"));
                    }
                    itemFound = true;
                    break;
                }
            }
            if (itemFound)
                break;
        }
    };
    for (var _i = 0, matches_1 = matches; _i < matches_1.length; _i++) {
        var match = matches_1[_i];
        _loop_2(match);
    }
    return {
        valid: errors.length === 0,
        errors: errors,
        corrected: corrected,
    };
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã°Å¸Â¤â€“ GERAR RESPOSTA COM IA (CONTEXTO MÃƒÂNIMO)
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function generateDeliveryResponse(userId, message, intent, deliveryData, conversationContext, customerPhone, conversationId, conversationHistory) {
    return __awaiter(this, void 0, void 0, function () {
        var persistedCart, effectiveConversationId, currentCart, optionHint, optionGroup, optionSelection, updatedCart, subtotal, total, response, category, normalizedMsg, _i, _a, cat, catNameNormalized, matchedCategory, optionHint, optionGroup, shouldImageOnly, categoryBubbles, menuBubbles, categoryContext_1, halfHalfResult, _b, item1, item2, fullItem1, fullItem2, hasVariations, sizeFromMessage_1, sizeOptions, sizesText, sizeSpecificPrice, sizeLabel, sizeOption, selectedSize, _c, finalPrice, halfHalfPriceSource, cartSummary, halfHalfName, customItemId, cart, pizzaCat, optionsList, categoryFromMessage, normalizedMsg, _d, _e, cat, catNameNormalized, matchedCategory, shouldImageOnly, categoryBubbles, categoriesList, categoryPrompt, greeting, categoriesList, historyName, effectiveName, defaultWelcomeTemplate, welcomeTemplate, welcomeTextRaw, welcomeText, welcomeMessage, config, response_1, feeSettings, pixLines, lastBotMessage_1, botMsgLower, isAwaitingSize, isHalfHalfPending, halfHalfMatch, flavor1Name, flavor2Name, item1, item2, sizeFromMsg_1, resolved1, resolved2, fallbackSizePrice, price1, price2, sizeOpt1, sizeOpt2, sizeName, extractPrice_1, sizePriceFromPrompt, sizePriceFromMenu, fallbackSizePriceByLetter, finalPrice, displayName, halfHalfItem, cart_1, subtotal_1, deliveryFee_1, hhName, hhDisplayName, hhPrefix, response_2, itemMatch, pendingQuantity, pendingItemName, menuItem, resolved, optionsKey, itemTotal, cart_2, subtotal_2, deliveryFee_2, pendName, pendDisplayName, pendPrefix, response_3, deliveryOptions_1, deliveryTypeLine_1, categoryContext, categoryMap, messageCategoryKey, msgLower, parsedItems, addedItems, notFoundItems, itemsNeedingSize, _f, parsedItems_1, parsed, itemCategoryKey, itemCategoryContext, menuItem, resolved, optionsKey, item, sizesText, cart, subtotal, deliveryFee, total, customerNameFromHistory, customerDisplayName, namePrefix, response, _g, addedItems_1, item, deliveryOptions, deliveryTypeLine, confirmationCart, hasPendingFinalConfirmation, isSimpleOrderConfirmation, plannerRequestedFinalConfirmation, isConfirmingFinalOrder, ctx, info, nameMatch, addressMatch, paymentMatch, changeForMatch, deliveryType, orderResult, historyName, effectiveName, confirmationTemplate, confirmationIntroRaw, confirmationIntro, pixConfirmationLines, changeConfirmationLine, pixConfirmationBlock, summaryMessage, finalMessage, error_6, isDenyingFinalOrder, deliveryOptions, acceptsCash, paymentPrompt, extraCashPrompt, existingCart, existingInfo, lines, _h, lines_1, line, lower, content, contentLower, paymentMatch, paymentMap, _j, lines_2, line, lower, content, contentLower, isAddress, hasNumber, notName, notGreeting, minLength, addressPart, foundNameQuestion, _k, lines_3, line, lower, content, contentLower, notAddress, notPayment, noNumber, isName, info, mergedInfo_1, paymentMethods, hasName, hasPayment, hasDeliveryType, cashConfig, needsAddress, hasAddress, requiresChangeDecision, hasChangeDecision, hasChangeAmount, missing, missingFields, options, responseMsg, options, cart, subtotal, deliveryFeeInfo, _l, deliveryFee, total, infoForConfirmation, resumo_1, pixLines, mistral, itemList, allItemNames, systemPrompt, response, aiResponse, inventedItems, validation, error_7;
        var _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
        return __generator(this, function (_x) {
            switch (_x.label) {
                case 0:
                    console.log("\u00F0\u0178\u201D\u00A5\u00F0\u0178\u201D\u00A5\u00F0\u0178\u201D\u00A5 [DEPLOY V2] generateDeliveryResponse iniciada - Intent: ".concat(intent));
                    persistedCart = customerPhone ? getExistingCart(userId, customerPhone, conversationId) : null;
                    // Ã°Å¸â€ â€¢ LIMPAR CARRINHO SE FOR PRIMEIRA MENSAGEM DO CLIENTE (SEM HISTÃƒâ€œRICO)
                    if (customerPhone &&
                        !isSyntheticConversationId(conversationId) &&
                        (!conversationHistory || conversationHistory.length === 0) &&
                        !(persistedCart &&
                            (persistedCart.items.size > 0 ||
                                persistedCart.awaitingConfirmation ||
                                !!persistedCart.customerName ||
                                !!persistedCart.paymentMethod ||
                                !!persistedCart.address ||
                                !!persistedCart.deliveryType))) {
                        console.log("\u00F0\u0178\u203A\u2019 [DeliveryAI] Primeira mensagem detectada - limpando carrinho antigo");
                        clearCart(userId, customerPhone, conversationId);
                    }
                    effectiveConversationId = conversationId || "sim-".concat(Date.now(), "-").concat(Math.random().toString(36).substr(2, 9));
                    currentCart = customerPhone ? getCart(userId, customerPhone, effectiveConversationId) : null;
                    if (customerPhone && currentCart && currentCart.items.size > 0) {
                        optionHint = detectOptionGroupHint(message);
                        if (optionHint && shouldTreatMessageAsOptionGroupQuery(message, currentCart)) {
                            optionGroup = findRelevantOptionGroup(deliveryData, optionHint, currentCart);
                            if (optionGroup) {
                                return [2 /*return*/, {
                                        intent: 'ASK_ABOUT_ITEM',
                                        bubbles: [formatOptionGroupPrompt(optionGroup)],
                                        metadata: {
                                            itemMentioned: optionGroup.item.name,
                                            categoryRequested: optionGroup.categoryName,
                                            reason: 'cart_option_group_requested',
                                        },
                                    }];
                            }
                            return [2 /*return*/, {
                                    intent: 'ASK_ABOUT_ITEM',
                                    bubbles: [formatUnavailableOptionGroupMessage(optionHint, deliveryData, currentCart)],
                                    metadata: {
                                        reason: 'cart_option_group_unavailable',
                                    },
                                }];
                        }
                        optionSelection = findCartOptionSelection(deliveryData, currentCart, message, conversationHistory);
                        if (optionSelection) {
                            updatedCart = applyOptionSelectionToCart(userId, customerPhone, optionSelection);
                            subtotal = getCartSubtotal(updatedCart);
                            total = getCartTotal(updatedCart, deliveryData.config.delivery_fee);
                            response = "\u2705 Adicionei *".concat(optionSelection.option.name, "* em *").concat(optionSelection.cartItem.name, "*.\n\n");
                            response += "".concat(formatCartSummary(updatedCart, deliveryData.config.delivery_fee));
                            response += "\n\nSe quiser, posso finalizar o pedido ou adicionar mais alguma coisa.";
                            return [2 /*return*/, {
                                    intent: 'ADD_ITEM',
                                    bubbles: [response],
                                    metadata: {
                                        itemMentioned: optionSelection.option.name,
                                        orderItems: Array.from(updatedCart.items.values()).map(function (item) { return ({
                                            name: item.name,
                                            quantity: item.quantity,
                                            price: item.price,
                                        }); }),
                                        subtotal: subtotal,
                                        deliveryFee: deliveryData.config.delivery_fee,
                                        total: total,
                                        reason: 'cart_option_selected',
                                    },
                                }];
                        }
                    }
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    // CASO ESPECIAL: CATEGORIA ESPECÃƒÂFICA (pizza, bebidas, etc)
                    // Quando cliente diz apenas "pizza", mostra sÃƒÂ³ as pizzas!
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    if (intent === 'WANT_CATEGORY') {
                        category = detectCategoryFromMessage(message);
                        // Ã°Å¸â€ â€¢ FALLBACK DINÃƒâ€šMICO: Se keywords hardcoded nÃƒÂ£o acharam, busca por nome real da categoria no DB
                        if (!category) {
                            normalizedMsg = normalizeCategoryText(message);
                            if (normalizedMsg) {
                                for (_i = 0, _a = deliveryData.categories; _i < _a.length; _i++) {
                                    cat = _a[_i];
                                    catNameNormalized = normalizeCategoryText(cat.name);
                                    if (catNameNormalized && smartCategoryMatch(catNameNormalized, normalizedMsg)) {
                                        category = normalizedMsg;
                                        console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] \u00E2\u0153\u2026 Categoria encontrada por nome do DB: \"".concat(cat.name, "\" \u00E2\u2020\u2019 \"").concat(category, "\""));
                                        break;
                                    }
                                }
                            }
                        }
                        console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Intent WANT_CATEGORY - mostrando apenas: ".concat(category));
                        if (category) {
                            matchedCategory = findMatchingCategory(deliveryData, category);
                            if (!matchedCategory) {
                                optionHint = detectOptionGroupHint(message);
                                if (optionHint) {
                                    optionGroup = findRelevantOptionGroup(deliveryData, optionHint, currentCart);
                                    if (optionGroup) {
                                        return [2 /*return*/, {
                                                intent: 'ASK_ABOUT_ITEM',
                                                bubbles: [formatOptionGroupPrompt(optionGroup)],
                                                metadata: {
                                                    itemMentioned: optionGroup.item.name,
                                                    categoryRequested: optionGroup.categoryName,
                                                    reason: 'option_group_requested',
                                                },
                                            }];
                                    }
                                    return [2 /*return*/, {
                                            intent: 'ASK_ABOUT_ITEM',
                                            bubbles: [formatUnavailableOptionGroupMessage(optionHint, deliveryData, currentCart)],
                                            metadata: {
                                                reason: 'option_group_unavailable',
                                            },
                                        }];
                                }
                            }
                            shouldImageOnly = normalizeMenuSendMode(deliveryData.config.menu_send_mode) === 'image' && !!(matchedCategory === null || matchedCategory === void 0 ? void 0 : matchedCategory.image_url);
                            categoryBubbles = shouldImageOnly
                                ? []
                                : formatCategoryAsBubbles(deliveryData, category);
                            return [2 /*return*/, {
                                    intent: 'WANT_CATEGORY',
                                    bubbles: categoryBubbles,
                                    metadata: {
                                        categoryRequested: category,
                                        categoryImageUrl: (matchedCategory === null || matchedCategory === void 0 ? void 0 : matchedCategory.image_url) || null,
                                        categoryName: (matchedCategory === null || matchedCategory === void 0 ? void 0 : matchedCategory.name) || null,
                                    },
                                }];
                        }
                        else {
                            menuBubbles = formatMenuAsBubbles(deliveryData);
                            return [2 /*return*/, {
                                    intent: 'WANT_MENU',
                                    bubbles: menuBubbles,
                                }];
                        }
                    }
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    // CASO ESPECIAL: MEIO A MEIO - Pizza dividida
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    if (intent === 'HALF_HALF') {
                        console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Intent HALF_HALF - pedido meio a meio");
                        categoryContext_1 = detectCategoryFromMessage(conversationContext || message);
                        if (!categoryContext_1) {
                            // Se nÃƒÂ£o detectou, assume pizza (mais comum)
                            categoryContext_1 = 'pizza';
                            console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Categoria n\u00C3\u00A3o detectada, assumindo: ".concat(categoryContext_1));
                        }
                        halfHalfResult = parseHalfHalfOrder(message, deliveryData, categoryContext_1);
                        if (halfHalfResult.success && halfHalfResult.items.length === 2) {
                            _b = halfHalfResult.items, item1 = _b[0], item2 = _b[1];
                            fullItem1 = findItemByNameFuzzy(deliveryData, item1.name, categoryContext_1);
                            fullItem2 = findItemByNameFuzzy(deliveryData, item2.name, categoryContext_1);
                            hasVariations = ((fullItem1 === null || fullItem1 === void 0 ? void 0 : fullItem1.options) && fullItem1.options.length > 0) ||
                                ((fullItem2 === null || fullItem2 === void 0 ? void 0 : fullItem2.options) && fullItem2.options.length > 0);
                            sizeFromMessage_1 = detectSizeFromMessage(message);
                            console.log("\u00F0\u0178\u201D\u008D [DeliveryAI] Meio a meio - hasVariations: ".concat(hasVariations, ", sizeFromMessage: ").concat(sizeFromMessage_1));
                            // Se tem variaÃƒÂ§ÃƒÂµes e o tamanho NÃƒÆ’O foi especificado, perguntar
                            if (hasVariations && !sizeFromMessage_1) {
                                sizeOptions = (_m = fullItem1 === null || fullItem1 === void 0 ? void 0 : fullItem1.options) === null || _m === void 0 ? void 0 : _m.find(function (opt) {
                                    return opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size');
                                });
                                sizesText = '';
                                if (sizeOptions && sizeOptions.options) {
                                    sizesText = sizeOptions.options.map(function (opt) {
                                        return "\u00E2\u20AC\u00A2 *".concat(opt.name, "* - R$ ").concat(opt.price.toFixed(2).replace('.', ','));
                                    }).join('\n');
                                }
                                else {
                                    // Fallback se nÃƒÂ£o achar as opÃƒÂ§ÃƒÂµes
                                    sizesText = 'Ã¢â‚¬Â¢ *Pequena (P)*\nÃ¢â‚¬Â¢ *MÃƒÂ©dia (M)*\nÃ¢â‚¬Â¢ *Grande (G)*';
                                }
                                return [2 /*return*/, {
                                        intent: 'HALF_HALF',
                                        bubbles: [
                                            "\u00F0\u0178\u008D\u2022 \u00C3\u201Ctima escolha! *".concat(item1.name, "* e *").concat(item2.name, "* meio a meio!\n\n\u00F0\u0178\u201C\u0090 *Qual tamanho voc\u00C3\u00AA prefere?*\n\n").concat(sizesText, "\n\nMe diz o tamanho que eu j\u00C3\u00A1 monto seu pedido! \u00F0\u0178\u02DC\u0160")
                                        ],
                                        metadata: {
                                            awaitingSize: true,
                                            halfHalfPending: {
                                                item1: item1.name,
                                                item2: item2.name,
                                                category: categoryContext_1
                                            }
                                        },
                                    }];
                            }
                            sizeSpecificPrice = null;
                            sizeLabel = '';
                            // Se tem tamanho especificado, buscar o preÃƒÂ§o correto
                            if (sizeFromMessage_1 && (fullItem1 === null || fullItem1 === void 0 ? void 0 : fullItem1.options)) {
                                sizeOption = fullItem1.options.find(function (opt) {
                                    return opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size');
                                });
                                if (sizeOption && sizeOption.options) {
                                    selectedSize = sizeOption.options.find(function (opt) {
                                        return opt.name.toLowerCase().includes(sizeFromMessage_1.toLowerCase()) ||
                                            (sizeFromMessage_1.toLowerCase() === 'p' && opt.name.toLowerCase().includes('pequen')) ||
                                            (sizeFromMessage_1.toLowerCase() === 'm' && opt.name.toLowerCase().includes('mÃƒÂ©d')) ||
                                            (sizeFromMessage_1.toLowerCase() === 'g' && opt.name.toLowerCase().includes('grand'));
                                    });
                                    if (selectedSize) {
                                        sizeSpecificPrice = selectedSize.price;
                                        sizeLabel = " (".concat(selectedSize.name, ")");
                                    }
                                }
                            }
                            _c = resolveHalfHalfPrice({
                                deliveryData: deliveryData,
                                categoryContext: categoryContext_1,
                                item1: item1,
                                item2: item2,
                                sizeCode: sizeFromMessage_1,
                                sizeSpecificPrice: sizeSpecificPrice,
                            }), finalPrice = _c.finalPrice, halfHalfPriceSource = _c.source;
                            console.log("\u00F0\u0178\u2019\u00B0 [DeliveryAI] Meio a meio: ".concat(item1.name, " + ").concat(item2.name, " = R$ ").concat(finalPrice, " ").concat(sizeLabel));
                            cartSummary = '';
                            if (customerPhone) {
                                halfHalfName = "".concat(categoryContext_1.charAt(0).toUpperCase() + categoryContext_1.slice(1), " meio a meio: ").concat(item1.name, " + ").concat(item2.name).concat(sizeLabel);
                                customItemId = "halfhalf:".concat(normalizeTextForMatch(item1.name), ":").concat(normalizeTextForMatch(item2.name), ":").concat(normalizeTextForMatch(sizeLabel || 'base'));
                                addCustomItemToCart(userId, customerPhone, {
                                    itemId: customItemId,
                                    name: halfHalfName,
                                    price: finalPrice,
                                    quantity: 1,
                                    notes: "Metade ".concat(item1.name, " + Metade ").concat(item2.name),
                                    menuItemId: null,
                                });
                                cart = getCart(userId, customerPhone);
                                cartSummary = "\n\n".concat(formatCartSummary(cart, deliveryData.config.delivery_fee));
                            }
                            return [2 /*return*/, {
                                    intent: 'HALF_HALF',
                                    bubbles: [
                                        "\u00E2\u0153\u2026 Perfeito! ".concat(categoryContext_1.charAt(0).toUpperCase() + categoryContext_1.slice(1)).concat(sizeLabel, " meio a meio:\n\n\u00F0\u0178\u008D\u2022 *Metade ").concat(item1.name, "*\n\u00F0\u0178\u008D\u2022 *Metade ").concat(item2.name, "*\n\n\u00F0\u0178\u2019\u00B0 *Total: R$ ").concat(finalPrice.toFixed(2).replace('.', ','), "*").concat(describeHalfHalfPricing(halfHalfPriceSource, hasVariations)).concat(cartSummary, "\n\nQuer mais alguma coisa ou posso confirmar o pedido?")
                                    ],
                                    metadata: {
                                        halfHalfItems: halfHalfResult.items,
                                        halfHalfPrice: finalPrice,
                                        halfHalfSize: sizeFromMessage_1 || null,
                                        categoryContext: categoryContext_1,
                                    },
                                }];
                        }
                        else {
                            pizzaCat = deliveryData.categories.find(function (c) { return c.name.toLowerCase().includes(categoryContext_1 || 'pizza'); });
                            optionsList = pizzaCat ? pizzaCat.items.slice(0, 10).map(function (i) { return "\u00E2\u20AC\u00A2 ".concat(i.name); }).join('\n') : '';
                            return [2 /*return*/, {
                                    intent: 'HALF_HALF',
                                    bubbles: [
                                        "\u00F0\u0178\u008D\u2022 \u00C3\u201Ctimo, ".concat(categoryContext_1, " meio a meio! Quais dois sabores voc\u00C3\u00AA quer?\n\nExemplo: \"Calabresa e Mussarela\"\n\n").concat(pizzaCat ? "Alguns sabores de ".concat(pizzaCat.name, ":\n").concat(optionsList, "\n\n_...e mais op\u00C3\u00A7\u00C3\u00B5es no card\u00C3\u00A1pio!_") : 'Veja o cardÃƒÂ¡pio para escolher!')
                                    ],
                                }];
                        }
                    }
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    // CASO ESPECIAL: CARDÃƒÂPIO COMPLETO - NÃƒÆ’O CHAMA IA
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    if (intent === 'WANT_MENU') {
                        console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Intent WANT_MENU - solicitando categoria antes do card\u00C3\u00A1pio completo");
                        categoryFromMessage = detectCategoryFromMessage(message);
                        // Ã°Å¸â€ â€¢ FALLBACK DINÃƒâ€šMICO: tentar match direto pelo nome da categoria no DB
                        if (!categoryFromMessage) {
                            normalizedMsg = normalizeCategoryText(message);
                            if (normalizedMsg) {
                                for (_d = 0, _e = deliveryData.categories; _d < _e.length; _d++) {
                                    cat = _e[_d];
                                    catNameNormalized = normalizeCategoryText(cat.name);
                                    if (catNameNormalized && smartCategoryMatch(catNameNormalized, normalizedMsg)) {
                                        categoryFromMessage = normalizedMsg;
                                        console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] \u00E2\u0153\u2026 WANT_MENU: Categoria encontrada por nome DB: \"".concat(cat.name, "\" \u00E2\u2020\u2019 \"").concat(categoryFromMessage, "\""));
                                        break;
                                    }
                                }
                            }
                        }
                        if (categoryFromMessage) {
                            matchedCategory = findMatchingCategory(deliveryData, categoryFromMessage);
                            shouldImageOnly = normalizeMenuSendMode(deliveryData.config.menu_send_mode) === 'image' && !!(matchedCategory === null || matchedCategory === void 0 ? void 0 : matchedCategory.image_url);
                            categoryBubbles = shouldImageOnly
                                ? []
                                : formatCategoryAsBubbles(deliveryData, categoryFromMessage);
                            return [2 /*return*/, {
                                    intent: 'WANT_MENU',
                                    bubbles: categoryBubbles,
                                    metadata: {
                                        categoryRequested: categoryFromMessage,
                                        categoryImageUrl: (matchedCategory === null || matchedCategory === void 0 ? void 0 : matchedCategory.image_url) || null,
                                        categoryName: (matchedCategory === null || matchedCategory === void 0 ? void 0 : matchedCategory.name) || null,
                                    },
                                }];
                        }
                        categoriesList = deliveryData.categories
                            .map(function (cat) { return "\u00E2\u20AC\u00A2 ".concat(cat.name); })
                            .join('\n');
                        categoryPrompt = "Claro! Qual categoria voc\u00C3\u00AA quer ver primeiro?\n\n".concat(categoriesList, "\n\nEx.: Pizza, Esfihas, A\u00C3\u00A7a\u00C3\u00AD, Bebidas.");
                        return [2 /*return*/, {
                                intent: 'WANT_MENU',
                                bubbles: [categoryPrompt],
                                metadata: {
                                    itemMentioned: undefined,
                                },
                            }];
                    }
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    // CASO ESPECIAL: SAUDAÃƒâ€¡ÃƒÆ’O - Envia boas-vindas e cardÃƒÂ¡pio completo
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    if (intent === 'GREETING') {
                        greeting = getTimeBasedGreeting();
                        console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] GREETING detectado - solicitando categoria antes do card\u00C3\u00A1pio");
                        categoriesList = deliveryData.categories
                            .map(function (cat) { return "\u00E2\u20AC\u00A2 ".concat(cat.name); })
                            .join('\n');
                        historyName = getCustomerNameFromHistory(conversationHistory);
                        effectiveName = deliveryData.config.use_customer_name
                            ? (historyName || 'Cliente')
                            : 'Cliente';
                        defaultWelcomeTemplate = "".concat(greeting, "! \u00F0\u0178\u02DC\u0160 Bem-vindo(a) ao *").concat(deliveryData.config.business_name, "*!");
                        welcomeTemplate = deliveryData.config.welcome_message || defaultWelcomeTemplate;
                        welcomeTextRaw = interpolateDeliveryMessage(welcomeTemplate, {
                            cliente_nome: effectiveName,
                            nome: effectiveName,
                            name: effectiveName,
                        });
                        welcomeText = applyHumanization(welcomeTextRaw, deliveryData.config, true);
                        welcomeMessage = "".concat(welcomeText, "\n\nO que voc\u00C3\u00AA deseja ver primeiro? Escolha uma categoria:\n").concat(categoriesList, "\n\nEx.: Pizza, Esfihas, A\u00C3\u00A7a\u00C3\u00AD, Bebidas.");
                        return [2 /*return*/, {
                                intent: 'GREETING',
                                bubbles: [welcomeMessage],
                            }];
                    }
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    // CASO ESPECIAL: INFO DELIVERY - Resposta do banco
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    if (intent === 'ASK_DELIVERY_INFO') {
                        config = deliveryData.config;
                        response_1 = "\u00F0\u0178\u201C\u2039 *Informa\u00C3\u00A7\u00C3\u00B5es de Entrega*\n\n";
                        feeSettings = normalizeDeliveryFeeSettings(config);
                        if (config.accepts_delivery) {
                            if (feeSettings.mode === 'distance') {
                                response_1 += "\u00F0\u0178\u203A\u00B5 *Entrega:* ".concat(formatCurrency(feeSettings.baseFee), " at\u00C3\u00A9 ").concat(feeSettings.baseDistanceKm.toFixed(1).replace('.', ','), " km");
                                response_1 += " e + ".concat(formatCurrency(feeSettings.additionalFeePerKm), " por km excedente\n");
                                if (feeSettings.originAddress) {
                                    response_1 += "\u00F0\u0178\u201C\u008D *Origem do c\u00C3\u00A1lculo:* ".concat(feeSettings.originAddress, "\n");
                                }
                            }
                            else {
                                response_1 += "\u00F0\u0178\u203A\u00B5 *Entrega:* ".concat(formatCurrency(config.delivery_fee), "\n");
                            }
                            response_1 += "\u00E2\u008F\u00B1\u00EF\u00B8\u008F *Tempo estimado:* ~".concat(config.estimated_delivery_time, " minutos\n");
                        }
                        if (config.accepts_pickup) {
                            response_1 += "\u00F0\u0178\u008F\u00AA *Retirada no local:* GR\u00C3\u0081TIS\n";
                        }
                        if (config.min_order_value > 0) {
                            response_1 += "\u00F0\u0178\u201C\u00A6 *Pedido m\u00C3\u00ADnimo:* R$ ".concat(config.min_order_value.toFixed(2).replace('.', ','), "\n");
                        }
                        response_1 += "\n\u00F0\u0178\u2019\u00B3 *Formas de pagamento:*\n";
                        normalizePaymentMethods(config.payment_methods).forEach(function (method) {
                            response_1 += "\u00E2\u20AC\u00A2 ".concat(getPaymentMethodLabel(method), "\n");
                        });
                        if (normalizePaymentMethods(config.payment_methods).includes('pix')) {
                            pixLines = buildPixSummaryLines(config);
                            if (pixLines.length > 0) {
                                response_1 += "\n\u00F0\u0178\u00A7\u00BE *Pix:*\n";
                                pixLines.forEach(function (line) {
                                    response_1 += "\u00E2\u20AC\u00A2 ".concat(line, "\n");
                                });
                            }
                        }
                        if (normalizePaymentMethods(config.payment_methods).includes('dinheiro') && getCashConfig(config).askForChange) {
                            response_1 += "\n\u00F0\u0178\u2019\u00B5 *Dinheiro:* perguntamos se precisa de troco e para quanto.\n";
                        }
                        return [2 /*return*/, {
                                intent: 'ASK_DELIVERY_INFO',
                                bubbles: [response_1],
                            }];
                    }
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    // CASO ESPECIAL: PEDIDO - Processa com preÃƒÂ§os REAIS do banco
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    if (intent === 'WANT_TO_ORDER' || intent === 'ADD_ITEM') {
                        console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Intent ".concat(intent, " - processando pedido com pre\u00C3\u00A7os do banco"));
                        lastBotMessage_1 = conversationHistory === null || conversationHistory === void 0 ? void 0 : conversationHistory.filter(function (m) { return m.fromMe; }).slice(-1)[0];
                        if (lastBotMessage_1) {
                            botMsgLower = lastBotMessage_1.text.toLowerCase();
                            isAwaitingSize = botMsgLower.includes('qual tamanho') ||
                                botMsgLower.includes('me diz o tamanho');
                            if (isAwaitingSize) {
                                isHalfHalfPending = botMsgLower.includes('meio a meio');
                                if (isHalfHalfPending) {
                                    halfHalfMatch = lastBotMessage_1.text.match(/\*([^*]+)\*\s+e\s+\*([^*]+)\*/);
                                    if (halfHalfMatch) {
                                        flavor1Name = halfHalfMatch[1].trim();
                                        flavor2Name = halfHalfMatch[2].trim();
                                        console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Continuando MEIO A MEIO pendente: ".concat(flavor1Name, " + ").concat(flavor2Name));
                                        item1 = findItemByNameFuzzy(deliveryData, flavor1Name);
                                        item2 = findItemByNameFuzzy(deliveryData, flavor2Name);
                                        if (item1 && item2) {
                                            sizeFromMsg_1 = detectSizeFromMessage(message);
                                            if (sizeFromMsg_1) {
                                                resolved1 = resolveMenuItemOptions(item1, message);
                                                resolved2 = resolveMenuItemOptions(item2, message);
                                                fallbackSizePrice = function (menuItem) {
                                                    var _a, _b;
                                                    var sizeGroup = (_a = menuItem.options) === null || _a === void 0 ? void 0 : _a.find(function (opt) {
                                                        return opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size');
                                                    });
                                                    if (!sizeGroup || !((_b = sizeGroup.options) === null || _b === void 0 ? void 0 : _b.length))
                                                        return null;
                                                    var prices = sizeGroup.options.map(function (opt) { return opt.price; }).filter(function (p) { return typeof p === 'number'; });
                                                    if (prices.length === 0)
                                                        return null;
                                                    var sorted = __spreadArray([], prices, true).sort(function (a, b) { return a - b; });
                                                    if (sizeFromMsg_1 === 'P')
                                                        return sorted[0];
                                                    if (sizeFromMsg_1 === 'G')
                                                        return sorted[sorted.length - 1];
                                                    if (sizeFromMsg_1 === 'M')
                                                        return sorted[Math.floor(sorted.length / 2)];
                                                    return null;
                                                };
                                                price1 = resolved1.unitPrice;
                                                price2 = resolved2.unitPrice;
                                                if (sizeFromMsg_1 && price1 === item1.price) {
                                                    price1 = (_o = fallbackSizePrice(item1)) !== null && _o !== void 0 ? _o : price1;
                                                }
                                                if (sizeFromMsg_1 && price2 === item2.price) {
                                                    price2 = (_p = fallbackSizePrice(item2)) !== null && _p !== void 0 ? _p : price2;
                                                }
                                                sizeOpt1 = resolved1.optionsSelected.find(function (opt) { return /tamanho|size/i.test(opt.group); });
                                                sizeOpt2 = resolved2.optionsSelected.find(function (opt) { return /tamanho|size/i.test(opt.group); });
                                                sizeName = (sizeOpt1 === null || sizeOpt1 === void 0 ? void 0 : sizeOpt1.option) || (sizeOpt2 === null || sizeOpt2 === void 0 ? void 0 : sizeOpt2.option) || '';
                                                extractPrice_1 = function (text) {
                                                    var normalized = text.replace(/\./g, '').replace(',', '.');
                                                    var value = parseFloat(normalized);
                                                    return Number.isFinite(value) ? value : null;
                                                };
                                                sizePriceFromPrompt = (function () {
                                                    var prompt = lastBotMessage_1.text;
                                                    var matchP = prompt.match(/Pequena\s*\(P\).*?R\$\s*([\d.,]+)/i);
                                                    var matchM = prompt.match(/M[eÃƒÂ©]dia\s*\(M\).*?R\$\s*([\d.,]+)/i);
                                                    var matchG = prompt.match(/Grande\s*\(G\).*?R\$\s*([\d.,]+)/i);
                                                    if (sizeFromMsg_1 === 'P' && matchP)
                                                        return extractPrice_1(matchP[1]);
                                                    if (sizeFromMsg_1 === 'M' && matchM)
                                                        return extractPrice_1(matchM[1]);
                                                    if (sizeFromMsg_1 === 'G' && matchG)
                                                        return extractPrice_1(matchG[1]);
                                                    return null;
                                                })();
                                                sizePriceFromMenu = (function () {
                                                    var _a, _b;
                                                    for (var _i = 0, _c = deliveryData.categories; _i < _c.length; _i++) {
                                                        var category = _c[_i];
                                                        for (var _d = 0, _e = category.items; _d < _e.length; _d++) {
                                                            var menuItem = _e[_d];
                                                            var sizeGroup = (_a = menuItem.options) === null || _a === void 0 ? void 0 : _a.find(function (opt) {
                                                                return opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size');
                                                            });
                                                            if (!sizeGroup || !((_b = sizeGroup.options) === null || _b === void 0 ? void 0 : _b.length))
                                                                continue;
                                                            for (var _f = 0, _g = sizeGroup.options; _f < _g.length; _f++) {
                                                                var opt = _g[_f];
                                                                var optNameLower = opt.name.toLowerCase();
                                                                if ((sizeFromMsg_1 === 'P' && (optNameLower.includes('pequen') || optNameLower === 'p')) ||
                                                                    (sizeFromMsg_1 === 'M' && (optNameLower.includes('mÃƒÂ©di') || optNameLower.includes('medi') || optNameLower === 'm')) ||
                                                                    (sizeFromMsg_1 === 'G' && (optNameLower.includes('grand') || optNameLower === 'g'))) {
                                                                    var rawPrice = opt.price;
                                                                    var parsedPrice = typeof rawPrice === 'number'
                                                                        ? rawPrice
                                                                        : parseFloat(String(rawPrice).replace(/\./g, '').replace(',', '.'));
                                                                    return Number.isFinite(parsedPrice) ? parsedPrice : null;
                                                                }
                                                            }
                                                        }
                                                    }
                                                    return null;
                                                })();
                                                fallbackSizePriceByLetter = sizeFromMsg_1 === 'G'
                                                    ? 55
                                                    : sizeFromMsg_1 === 'M'
                                                        ? 40
                                                        : sizeFromMsg_1 === 'P'
                                                            ? 30
                                                            : null;
                                                finalPrice = resolveHalfHalfPrice({
                                                    deliveryData: deliveryData,
                                                    categoryContext: item1.category_name,
                                                    item1: item1,
                                                    item2: item2,
                                                    sizeCode: sizeFromMsg_1,
                                                    sizeSpecificPrice: (_q = sizePriceFromPrompt !== null && sizePriceFromPrompt !== void 0 ? sizePriceFromPrompt : sizePriceFromMenu) !== null && _q !== void 0 ? _q : fallbackSizePriceByLetter,
                                                }).finalPrice;
                                                displayName = "".concat(item1.name, " + ").concat(item2.name, " (").concat(sizeName || sizeFromMsg_1, ")");
                                                // Adicionar ao carrinho como item ÃƒÂºnico (meio a meio)
                                                if (customerPhone) {
                                                    halfHalfItem = __assign(__assign({}, item1), { name: displayName, price: finalPrice, id: "half-half-".concat(item1.id, "-").concat(item2.id) });
                                                    addToCart(userId, customerPhone, halfHalfItem, 1, {
                                                        displayName: displayName,
                                                        priceOverride: finalPrice,
                                                        notes: "Meio a meio: ".concat(item1.name, " + ").concat(item2.name),
                                                        optionsSelected: [{ group: 'Tamanho', option: sizeName || sizeFromMsg_1, price: finalPrice }],
                                                        itemKeySuffix: "halfhalf-".concat(sizeFromMsg_1),
                                                    });
                                                }
                                                cart_1 = customerPhone ? getCart(userId, customerPhone) : null;
                                                subtotal_1 = cart_1 ? getCartSubtotal(cart_1) : finalPrice;
                                                deliveryFee_1 = deliveryData.config.delivery_fee;
                                                hhName = getCustomerNameFromHistory(conversationHistory);
                                                hhDisplayName = deliveryData.config.use_customer_name ? (hhName || '') : '';
                                                hhPrefix = hhDisplayName ? ", ".concat(hhDisplayName) : '';
                                                response_2 = "\u00E2\u0153\u2026 Perfeito! Adicionado ao pedido".concat(hhPrefix, ":\n\n");
                                                response_2 += "\u00E2\u20AC\u00A2 1x ".concat(displayName, " - R$ ").concat(finalPrice.toFixed(2).replace('.', ','), "\n");
                                                if (cart_1) {
                                                    response_2 += "\n".concat(formatCartSummary(cart_1, deliveryData.config.delivery_fee));
                                                }
                                                else {
                                                    response_2 += "\n\u00F0\u0178\u2019\u00B0 Subtotal: R$ ".concat(subtotal_1.toFixed(2).replace('.', ','));
                                                    response_2 += "\n\u00F0\u0178\u203A\u00B5 Taxa de entrega: R$ ".concat(deliveryFee_1.toFixed(2).replace('.', ','));
                                                    response_2 += "\n\n\u00F0\u0178\u2019\u00B5 *Total: R$ ".concat((subtotal_1 + deliveryFee_1).toFixed(2).replace('.', ','), "*");
                                                }
                                                response_2 += "\n\nDeseja mais alguma coisa? Para finalizar, me diga:\n\u00F0\u0178\u201C\u009D Nome\n\u00F0\u0178\u201C\u008D Endere\u00C3\u00A7o\n\u00F0\u0178\u2019\u00B3 Forma de pagamento";
                                                return [2 /*return*/, {
                                                        intent: 'ADD_ITEM',
                                                        bubbles: [response_2],
                                                        metadata: {
                                                            orderItems: [{ name: displayName, quantity: 1, price: finalPrice }],
                                                            subtotal: subtotal_1,
                                                            deliveryFee: deliveryFee_1,
                                                            total: subtotal_1 + deliveryFee_1,
                                                            isHalfHalf: true,
                                                        },
                                                    }];
                                            }
                                        }
                                    }
                                }
                                itemMatch = lastBotMessage_1.text.match(/\*(\d+)x\s+([^*]+)\*/);
                                if (itemMatch) {
                                    pendingQuantity = parseInt(itemMatch[1]) || 1;
                                    pendingItemName = itemMatch[2].trim();
                                    console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Continuando pedido pendente: ".concat(pendingQuantity, "x ").concat(pendingItemName));
                                    menuItem = findItemByNameFuzzy(deliveryData, pendingItemName);
                                    if (menuItem) {
                                        resolved = resolveMenuItemOptions(menuItem, message);
                                        if (!resolved.needsSize) {
                                            // Tamanho foi detectado! Adicionar ao carrinho
                                            if (customerPhone) {
                                                optionsKey = resolved.optionsSelected
                                                    .map(function (opt) { return "".concat(normalizeTextForMatch(opt.group), ":").concat(normalizeTextForMatch(opt.option)); })
                                                    .join('|');
                                                addToCart(userId, customerPhone, menuItem, pendingQuantity, {
                                                    displayName: resolved.displayName,
                                                    priceOverride: resolved.unitPrice,
                                                    notes: resolved.notes,
                                                    optionsSelected: resolved.optionsSelected,
                                                    itemKeySuffix: optionsKey || undefined,
                                                });
                                            }
                                            itemTotal = resolved.unitPrice * pendingQuantity;
                                            cart_2 = customerPhone ? getCart(userId, customerPhone) : null;
                                            subtotal_2 = cart_2 ? getCartSubtotal(cart_2) : itemTotal;
                                            deliveryFee_2 = deliveryData.config.delivery_fee;
                                            pendName = getCustomerNameFromHistory(conversationHistory);
                                            pendDisplayName = deliveryData.config.use_customer_name ? (pendName || '') : '';
                                            pendPrefix = pendDisplayName ? ", ".concat(pendDisplayName) : '';
                                            response_3 = "\u00E2\u0153\u2026 Perfeito! Adicionado ao pedido".concat(pendPrefix, ":\n\n");
                                            response_3 += "\u00E2\u20AC\u00A2 ".concat(pendingQuantity, "x ").concat(resolved.displayName, " - R$ ").concat(itemTotal.toFixed(2).replace('.', ','), "\n");
                                            if (cart_2) {
                                                response_3 += "\n".concat(formatCartSummary(cart_2, deliveryData.config.delivery_fee));
                                            }
                                            else {
                                                response_3 += "\n\u00F0\u0178\u2019\u00B0 Subtotal: R$ ".concat(subtotal_2.toFixed(2).replace('.', ','));
                                                response_3 += "\n\u00F0\u0178\u203A\u00B5 Taxa de entrega: R$ ".concat(deliveryFee_2.toFixed(2).replace('.', ','));
                                                response_3 += "\n\n\u00F0\u0178\u2019\u00B5 *Total: R$ ".concat((subtotal_2 + deliveryFee_2).toFixed(2).replace('.', ','), "*");
                                            }
                                            deliveryOptions_1 = [];
                                            if (deliveryData.config.accepts_delivery)
                                                deliveryOptions_1.push('Ã°Å¸â€ºÂµ Delivery');
                                            if (deliveryData.config.accepts_pickup)
                                                deliveryOptions_1.push('Ã°Å¸ÂÂª Retirada');
                                            deliveryTypeLine_1 = deliveryOptions_1.length > 0
                                                ? "\u00F0\u0178\u0161\u0161 Tipo de entrega: ".concat(deliveryOptions_1.join(' ou '))
                                                : 'Ã°Å¸Å¡Å¡ Tipo de entrega';
                                            response_3 += buildPostAddFollowUp(deliveryData, customerPhone ? getCart(userId, customerPhone) : null);
                                            return [2 /*return*/, {
                                                    intent: 'ADD_ITEM',
                                                    bubbles: [response_3],
                                                    metadata: {
                                                        orderItems: [{ name: resolved.displayName, quantity: pendingQuantity, price: resolved.unitPrice }],
                                                        subtotal: subtotal_2,
                                                        deliveryFee: deliveryFee_2,
                                                        total: subtotal_2 + deliveryFee_2,
                                                    },
                                                }];
                                        }
                                    }
                                }
                            }
                        }
                        categoryContext = detectCategoryContext(conversationHistory, deliveryData);
                        categoryMap = {
                            pizza: 'Pizza',
                            esfirra: 'Esfiha',
                            bebida: 'Bebida',
                            'aÃƒÂ§aÃƒÂ­': 'AÃƒÂ§aÃƒÂ­',
                            borda: 'Borda',
                        };
                        messageCategoryKey = detectCategoryFromMessage(message);
                        if (messageCategoryKey) {
                            categoryContext = categoryMap[messageCategoryKey] || categoryContext;
                        }
                        if (!categoryContext) {
                            msgLower = message.toLowerCase();
                            if (msgLower.includes('pizza')) {
                                categoryContext = 'Pizza';
                            }
                            else if (msgLower.includes('esfiha') || msgLower.includes('esfirra')) {
                                categoryContext = 'Esfiha';
                            }
                            else if (msgLower.includes('bebida') || msgLower.includes('refrigerante') || msgLower.includes('refri')) {
                                categoryContext = 'Bebida';
                            }
                            else if (msgLower.includes('borda')) {
                                categoryContext = 'Borda';
                            }
                        }
                        parsedItems = parseOrderItems(message);
                        if (parsedItems.length === 0) {
                            return [2 /*return*/, {
                                    intent: intent,
                                    bubbles: ['O que vocÃƒÂª gostaria de pedir? Pode me dizer o nome do item e a quantidade! Ã°Å¸ËœÅ '],
                                }];
                        }
                        addedItems = [];
                        notFoundItems = [];
                        itemsNeedingSize = [];
                        for (_f = 0, parsedItems_1 = parsedItems; _f < parsedItems_1.length; _f++) {
                            parsed = parsedItems_1[_f];
                            itemCategoryKey = detectCategoryFromMessage(parsed.name);
                            itemCategoryContext = itemCategoryKey
                                ? (categoryMap[itemCategoryKey] || categoryContext)
                                : categoryContext;
                            menuItem = findItemByNameFuzzy(deliveryData, parsed.name, itemCategoryContext);
                            if (menuItem) {
                                resolved = resolveMenuItemOptions(menuItem, message);
                                if (resolved.needsSize) {
                                    itemsNeedingSize.push({
                                        name: menuItem.name,
                                        quantity: parsed.quantity,
                                        options: resolved.sizeOptions || [],
                                    });
                                    continue;
                                }
                                if (customerPhone) {
                                    optionsKey = resolved.optionsSelected
                                        .map(function (opt) { return "".concat(normalizeTextForMatch(opt.group), ":").concat(normalizeTextForMatch(opt.option)); })
                                        .join('|');
                                    addToCart(userId, customerPhone, menuItem, parsed.quantity, {
                                        displayName: resolved.displayName,
                                        priceOverride: resolved.unitPrice,
                                        notes: resolved.notes,
                                        optionsSelected: resolved.optionsSelected,
                                        itemKeySuffix: optionsKey || undefined,
                                    });
                                }
                                addedItems.push({
                                    name: resolved.displayName,
                                    quantity: parsed.quantity,
                                    price: resolved.unitPrice,
                                    total: resolved.unitPrice * parsed.quantity,
                                });
                            }
                            else {
                                notFoundItems.push(parsed.name);
                            }
                        }
                        if (itemsNeedingSize.length > 0) {
                            item = itemsNeedingSize[0];
                            sizesText = item.options.map(function (opt) {
                                return "\u00E2\u20AC\u00A2 *".concat(opt.name, "* - R$ ").concat(opt.price.toFixed(2).replace('.', ','));
                            }).join('\n');
                            return [2 /*return*/, {
                                    intent: 'WANT_TO_ORDER',
                                    bubbles: [
                                        "\u00F0\u0178\u008D\u2022 Boa escolha! *".concat(item.quantity, "x ").concat(item.name, "*!\n\n\u00F0\u0178\u201C\u0090 *Qual tamanho voc\u00C3\u00AA quer?*\n\n").concat(sizesText, "\n\nMe diz o tamanho! \u00F0\u0178\u02DC\u0160")
                                    ],
                                    metadata: {
                                        awaitingSize: true,
                                        pendingItem: {
                                            name: item.name,
                                            quantity: item.quantity
                                        }
                                    },
                                }];
                        }
                        if (addedItems.length === 0) {
                            return [2 /*return*/, {
                                    intent: intent,
                                    bubbles: ["Hmm, n\u00C3\u00A3o encontrei \"".concat(((_r = parsedItems[0]) === null || _r === void 0 ? void 0 : _r.name) || '', "\" no card\u00C3\u00A1pio \u00F0\u0178\u00A4\u201D Quer ver as op\u00C3\u00A7\u00C3\u00B5es?")],
                                }];
                        }
                        cart = customerPhone ? getCart(userId, customerPhone) : null;
                        subtotal = cart ? getCartSubtotal(cart) : addedItems.reduce(function (sum, item) { return sum + item.total; }, 0);
                        deliveryFee = deliveryData.config.delivery_fee;
                        total = subtotal + deliveryFee;
                        customerNameFromHistory = getCustomerNameFromHistory(conversationHistory);
                        customerDisplayName = deliveryData.config.use_customer_name
                            ? (customerNameFromHistory || '')
                            : '';
                        namePrefix = customerDisplayName ? ", ".concat(customerDisplayName) : '';
                        response = "\u00E2\u0153\u2026 Adicionado ao pedido".concat(namePrefix, ":\n\n");
                        for (_g = 0, addedItems_1 = addedItems; _g < addedItems_1.length; _g++) {
                            item = addedItems_1[_g];
                            response += "\u00E2\u20AC\u00A2 ".concat(item.quantity, "x ").concat(item.name, " - R$ ").concat(item.total.toFixed(2).replace('.', ','), "\n");
                        }
                        if (notFoundItems.length > 0) {
                            response += "\n\u00E2\u0161\u00A0\u00EF\u00B8\u008F N\u00C3\u00A3o encontrei: ".concat(notFoundItems.join(', '), "\n");
                        }
                        if (cart) {
                            response += "\n".concat(formatCartSummary(cart, deliveryData.config.delivery_fee));
                        }
                        else {
                            response += "\n\u00F0\u0178\u2019\u00B0 Subtotal: R$ ".concat(subtotal.toFixed(2).replace('.', ','));
                            response += "\n\u00F0\u0178\u203A\u00B5 Taxa de entrega: R$ ".concat(deliveryFee.toFixed(2).replace('.', ','));
                            response += "\n\n\u00F0\u0178\u2019\u00B5 *Total: R$ ".concat(total.toFixed(2).replace('.', ','), "*");
                        }
                        deliveryOptions = [];
                        if (deliveryData.config.accepts_delivery)
                            deliveryOptions.push('Ã°Å¸â€ºÂµ Delivery');
                        if (deliveryData.config.accepts_pickup)
                            deliveryOptions.push('Ã°Å¸ÂÂª Retirada');
                        deliveryTypeLine = deliveryOptions.length > 0
                            ? "\u00F0\u0178\u0161\u0161 Tipo de entrega: ".concat(deliveryOptions.join(' ou '))
                            : 'Ã°Å¸Å¡Å¡ Tipo de entrega';
                        response += buildPostAddFollowUp(deliveryData, customerPhone ? getCart(userId, customerPhone) : null);
                        return [2 /*return*/, {
                                intent: intent,
                                bubbles: [response],
                                metadata: {
                                    orderItems: addedItems,
                                    subtotal: subtotal,
                                    deliveryFee: deliveryFee,
                                    total: total
                                }
                            }];
                    }
                    confirmationCart = customerPhone ? getExistingCart(userId, customerPhone, effectiveConversationId) : null;
                    hasPendingFinalConfirmation = ((_s = confirmationCart === null || confirmationCart === void 0 ? void 0 : confirmationCart.checkoutState) === null || _s === void 0 ? void 0 : _s.phase) === 'awaiting_confirmation' ||
                        !!(confirmationCart === null || confirmationCart === void 0 ? void 0 : confirmationCart.awaitingConfirmation);
                    isSimpleOrderConfirmation = /^(sim|confirmo|confirma|ok|pode|manda|vai|isso|certo|certeza|confirmar|ss|sss|siiim|siim)$/i.test(message.toLowerCase().trim());
                    plannerRequestedFinalConfirmation = intent === 'CONFIRM_ORDER' &&
                        hasPendingFinalConfirmation &&
                        /\b(confirm|confirma|confirmar|pedido)\b/i.test(message);
                    isConfirmingFinalOrder = (isSimpleOrderConfirmation || plannerRequestedFinalConfirmation) && (!!(conversationContext && conversationContext.toLowerCase().includes('confirma o pedido')) ||
                        hasPendingFinalConfirmation);
                    if (!isConfirmingFinalOrder) return [3 /*break*/, 4];
                    console.log("\u00E2\u0153\u2026 [DeliveryAI] Cliente CONFIRMOU o pedido FINAL - criando no banco");
                    ctx = conversationContext || '';
                    info = getCartStoredCustomerInfo(confirmationCart);
                    nameMatch = ctx.match(/\*Nome:\*\s*([^\n]+)/i);
                    if (nameMatch) {
                        info.customerName = nameMatch[1].trim();
                        console.log("\u00F0\u0178\u201C\u009D [DeliveryAI] Nome extra\u00C3\u00ADdo do resumo: \"".concat(info.customerName, "\""));
                    }
                    addressMatch = ctx.match(/\*EndereÃƒÂ§o:\*\s*([^\n]+)/i);
                    if (addressMatch) {
                        info.customerAddress = addressMatch[1].trim();
                        console.log("\u00F0\u0178\u201C\u009D [DeliveryAI] Endere\u00C3\u00A7o extra\u00C3\u00ADdo do resumo: \"".concat(info.customerAddress, "\""));
                    }
                    paymentMatch = ctx.match(/\*Pagamento:\*\s*([^\n]+)/i);
                    if (paymentMatch) {
                        info.paymentMethod = paymentMatch[1].trim();
                        console.log("\u00F0\u0178\u201C\u009D [DeliveryAI] Pagamento extra\u00C3\u00ADdo do resumo: \"".concat(info.paymentMethod, "\""));
                    }
                    changeForMatch = ctx.match(/\*Troco para:\*\s*R\$\s*([0-9.,]+)/i);
                    if (changeForMatch) {
                        info.changeNeeded = true;
                        info.changeForAmount = parseOptionalNumber(changeForMatch[1]);
                    }
                    else if (ctx.match(/\*Troco:\*\s*N[ÃƒA]o precisa/i)) {
                        info.changeNeeded = false;
                        info.changeForAmount = null;
                    }
                    // Extrair Tipo de entrega do resumo
                    if (ctx.toLowerCase().includes('*tipo:* delivery')) {
                        info.deliveryType = 'delivery';
                    }
                    else if (ctx.toLowerCase().includes('*tipo:* retirada') || ctx.toLowerCase().includes('retirada no local')) {
                        info.deliveryType = 'pickup';
                    }
                    console.log("\u00F0\u0178\u201C\u009D [DeliveryAI] Info extra\u00C3\u00ADda do resumo:", info);
                    _x.label = 1;
                case 1:
                    _x.trys.push([1, 3, , 4]);
                    if (!customerPhone) {
                        return [2 /*return*/, {
                                intent: 'PROVIDE_CUSTOMER_INFO',
                                bubbles: [
                                    "\u00E2\u009D\u0152 N\u00C3\u00A3o consegui identificar seu telefone para finalizar o pedido. Pode me informar novamente?"
                                ],
                                metadata: { error: true, errorMessage: 'missing_customer_phone' },
                            }];
                    }
                    deliveryType = info.deliveryType || (deliveryData.config.accepts_delivery ? 'delivery' : 'pickup');
                    return [4 /*yield*/, confirmAndCreateOrder(userId, customerPhone, info.customerName || 'Cliente', deliveryType, info.paymentMethod || 'Dinheiro', info.customerAddress || null, deliveryData, effectiveConversationId, {
                            deliveryFeeOverride: info.deliveryFee,
                            notes: buildDeliveryOrderNotes(info, info.deliveryFee !== undefined ? {
                                fee: info.deliveryFee,
                                distanceKm: (_t = info.deliveryDistanceKm) !== null && _t !== void 0 ? _t : null,
                                mode: info.deliveryFeeMode || 'fixed',
                                label: info.deliveryFeeMode === 'distance'
                                    ? 'Taxa por distÃ¢ncia'
                                    : info.deliveryFeeMode === 'fallback'
                                        ? 'Taxa de fallback'
                                        : 'Taxa fixa',
                            } : null),
                        })];
                case 2:
                    orderResult = _x.sent();
                    if (!orderResult.success || !orderResult.orderId) {
                        return [2 /*return*/, {
                                intent: 'PROVIDE_CUSTOMER_INFO',
                                bubbles: [
                                    "\u00E2\u009D\u0152 Ops! N\u00C3\u00A3o consegui confirmar seu pedido. ".concat(orderResult.error || 'Tente novamente.')
                                ],
                                metadata: {
                                    error: true,
                                    errorMessage: orderResult.error,
                                },
                            }];
                    }
                    historyName = getCustomerNameFromHistory(conversationHistory);
                    effectiveName = deliveryData.config.use_customer_name
                        ? (info.customerName || historyName || 'Cliente')
                        : 'Cliente';
                    confirmationTemplate = deliveryData.config.order_confirmation_message || '';
                    confirmationIntroRaw = confirmationTemplate
                        ? interpolateDeliveryMessage(confirmationTemplate, {
                            cliente_nome: effectiveName,
                            nome: effectiveName,
                            name: effectiveName,
                            pedido_numero: String(orderResult.orderId),
                            total: orderResult.total ? "R$ ".concat(orderResult.total.toFixed(2).replace('.', ',')) : '',
                            tempo_estimado: "".concat(deliveryData.config.estimated_delivery_time, " minutos"),
                        })
                        : '';
                    confirmationIntro = confirmationIntroRaw
                        ? applyHumanization(confirmationIntroRaw, deliveryData.config, true)
                        : '';
                    pixConfirmationLines = isPixPayment(info.paymentMethod) ? buildPixSummaryLines(deliveryData.config) : [];
                    changeConfirmationLine = isCashPayment(info.paymentMethod)
                        ? (info.changeNeeded === false
                            ? "\u00F0\u0178\u2019\u00B5 *Troco:* N\u00C3\u00A3o precisa\n"
                            : info.changeNeeded === true && info.changeForAmount
                                ? "\u00F0\u0178\u2019\u00B5 *Troco para:* ".concat(formatCurrency(info.changeForAmount), "\n")
                                : '')
                        : '';
                    pixConfirmationBlock = pixConfirmationLines.length > 0
                        ? "\n\u00F0\u0178\u00A7\u00BE *Pix:*\n".concat(pixConfirmationLines.map(function (line) { return "\u00E2\u20AC\u00A2 ".concat(line); }).join('\n'), "\n")
                        : '';
                    summaryMessage = "\u00E2\u0153\u2026 *Pedido confirmado com sucesso!*\n\n\u00F0\u0178\u017D\u00AB *N\u00C3\u00BAmero do pedido:* #".concat(orderResult.orderId, "\n\n\u00F0\u0178\u201C\u009D *Nome:* ").concat(info.customerName || effectiveName, "\n").concat(deliveryType === 'delivery' ? "\u00F0\u0178\u201C\u008D *Endere\u00C3\u00A7o:* ".concat(info.customerAddress, "\n") : 'Ã°Å¸ÂÆ’ *Retirada no local*\n', "\u00F0\u0178\u2019\u00B3 *Pagamento:* ").concat(getPaymentMethodLabel(info.paymentMethod), "\n").concat(changeConfirmationLine).concat(pixConfirmationBlock, "\n\u00E2\u008F\u00B1\u00EF\u00B8\u008F *Previs\u00C3\u00A3o:* ").concat(deliveryData.config.estimated_delivery_time, " minutos\n\n\u00F0\u0178\u008D\u2022 Seu pedido j\u00C3\u00A1 foi enviado para a cozinha! Obrigado pela prefer\u00C3\u00AAncia! \u00F0\u0178\u02DC\u0160");
                    finalMessage = confirmationIntro
                        ? "".concat(confirmationIntro, "\n\n").concat(summaryMessage)
                        : summaryMessage;
                    return [2 /*return*/, {
                            intent: 'FINALIZE_ORDER',
                            bubbles: [
                                finalMessage
                            ],
                            metadata: {
                                orderCreated: true,
                                orderId: orderResult.orderId,
                                customerInfo: info,
                            },
                        }];
                case 3:
                    error_6 = _x.sent();
                    console.error("\u00E2\u009D\u0152 [DeliveryAI] Erro ao criar pedido:", error_6);
                    return [2 /*return*/, {
                            intent: 'PROVIDE_CUSTOMER_INFO',
                            bubbles: [
                                "\u00E2\u009D\u0152 Ops! Tive um problema ao criar seu pedido. Por favor, tente novamente ou entre em contato com o atendente."
                            ],
                            metadata: {
                                error: true,
                                errorMessage: String(error_6),
                            },
                        }];
                case 4:
                    isDenyingFinalOrder = (!!(conversationContext && conversationContext.toLowerCase().includes('confirma o pedido')) ||
                        hasPendingFinalConfirmation) &&
                        (message.toLowerCase().match(/^(n[aÃƒÂ£]o|nope|cancela|cancelar|desisto|mudei de ideia)$/i) ||
                            (intent === 'CANCEL_ORDER' && /\b(cancel|cancelar|nao|nÃ£o)\b/i.test(message)));
                    if (isDenyingFinalOrder) {
                        resetCartCheckoutState(confirmationCart);
                        return [2 /*return*/, {
                                intent: 'CANCEL_ORDER',
                                bubbles: [
                                    "\u00E2\u009D\u0152 Pedido cancelado!\n\nSe quiser alterar alguma informa\u00C3\u00A7\u00C3\u00A3o ou fazer um novo pedido, \u00C3\u00A9 s\u00C3\u00B3 me avisar! \u00F0\u0178\u02DC\u0160"
                                ],
                                metadata: {
                                    cancelled: true,
                                    reason: 'user_declined',
                                },
                            }];
                    }
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    // CASO ESPECIAL: CONFIRMAÃƒâ€¡ÃƒÆ’O DE PEDIDO (inÃƒÂ­cio - sem resumo ainda)
                    // Cliente confirmou o pedido (sim, ok, confirmo, pode mandar, etc)
                    // Agora precisa coletar: NOME, TIPO (delivery/retirada), ENDEREÃƒâ€¡O, PAGAMENTO
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    if (intent === 'CONFIRM_ORDER') {
                        console.log("\u00E2\u0153\u2026 [DeliveryAI] Intent CONFIRM_ORDER - pedindo dados do cliente");
                        if (currentCart) {
                            updateCartCheckoutState(currentCart, 'collecting_info', getCartStoredCustomerInfo(currentCart));
                        }
                        deliveryOptions = [];
                        if (deliveryData.config.accepts_delivery)
                            deliveryOptions.push('Ã°Å¸â€ºÂµ Delivery');
                        if (deliveryData.config.accepts_pickup)
                            deliveryOptions.push('Ã°Å¸ÂÆ’ Retirada no local');
                        acceptsCash = normalizePaymentMethods(deliveryData.config.payment_methods).includes('dinheiro');
                        paymentPrompt = buildPaymentMethodsText(deliveryData.config);
                        extraCashPrompt = acceptsCash && getCashConfig(deliveryData.config).askForChange
                            ? "\n\n\u00F0\u0178\u2019\u00B5 *Troco:* se for dinheiro, diga se precisa de troco e para quanto"
                            : '';
                        return [2 /*return*/, {
                                intent: 'CONFIRM_ORDER',
                                bubbles: [
                                    "\u00E2\u0153\u2026 \u00C3\u201Ctimo! Para finalizar seu pedido, preciso de algumas informa\u00C3\u00A7\u00C3\u00B5es:\n\n\u00F0\u0178\u201C\u009D *Seu nome*\n\n\u00F0\u0178\u0161\u0161 *Tipo de entrega:* ".concat(deliveryOptions.join(' ou '), "\n\n").concat(deliveryData.config.accepts_delivery ? 'Ã°Å¸â€œÂ *EndereÃƒÂ§o* (se for delivery): rua, nÃƒÂºmero, bairro\n\n' : '', "\u00F0\u0178\u2019\u00B3 *Forma de pagamento:* ").concat(paymentPrompt).concat(extraCashPrompt, "\n\nPode me enviar tudo junto ou separado! \u00F0\u0178\u02DC\u0160")
                                ],
                                metadata: {
                                    awaitingCustomerInfo: true,
                                },
                            }];
                    }
                    if (!(intent === 'PROVIDE_CUSTOMER_INFO' || (conversationContext && conversationContext.toLowerCase().includes('seu nome') && conversationContext.toLowerCase().includes('forma de pagamento')))) return [3 /*break*/, 8];
                    console.log("\u00F0\u0178\u201C\u009D [DeliveryAI] Cliente fornecendo dados - extraindo informa\u00C3\u00A7\u00C3\u00B5es");
                    existingCart = customerPhone ? getExistingCart(userId, customerPhone, effectiveConversationId) : null;
                    existingInfo = getCartStoredCustomerInfo(existingCart);
                    // Tentar extrair info existente do contexto da conversa anterior
                    // Procurar por padrÃƒÂµes no contexto que indicam dados jÃƒÂ¡ coletados
                    if (conversationContext) {
                        lines = conversationContext.split('\n');
                        // Capturar delivery type e pagamento APENAS a partir de mensagens do cliente
                        for (_h = 0, lines_1 = lines; _h < lines_1.length; _h++) {
                            line = lines_1[_h];
                            lower = line.toLowerCase().trim();
                            if (lower.startsWith('cliente:') || lower.startsWith('client:') || lower.startsWith('customer:')) {
                                content = line.substring(line.indexOf(':') + 1).trim();
                                contentLower = content.toLowerCase();
                                if (!existingInfo.deliveryType) {
                                    if (/\b(retirada|retirar|retiro|buscar|busco|pegar|pego|no local|balc[aÃƒÂ£]o)\b/i.test(contentLower)) {
                                        existingInfo.deliveryType = 'pickup';
                                    }
                                    else if (/\b(delivery|entrega|mandar|enviar|levar)\b/i.test(contentLower)) {
                                        existingInfo.deliveryType = 'delivery';
                                    }
                                }
                                if (!existingInfo.paymentMethod) {
                                    paymentMatch = content.match(/\b(pix|dinheiro|cart[aÃƒÂ£]o|d[eÃƒÂ©]bito|cr[eÃƒÂ©]dito|cartÃƒÂ£o|cartao)\b/i);
                                    if (paymentMatch) {
                                        paymentMap = {
                                            'pix': 'Pix',
                                            'dinheiro': 'Dinheiro',
                                            'cartao': 'Cartao',
                                            'cartÃƒÂ£o': 'Cartao',
                                            'debito': 'Cartao',
                                            'dÃƒÂ©bito': 'Cartao',
                                            'credito': 'Cartao',
                                            'crÃƒÂ©dito': 'Cartao',
                                        };
                                        existingInfo.paymentMethod = paymentMap[paymentMatch[1].toLowerCase()] || 'Dinheiro';
                                    }
                                }
                            }
                        }
                        // IMPORTANTE: Buscar endereÃƒÂ§o no contexto (mensagens anteriores do cliente)
                        // Dividir contexto em linhas e procurar mensagens do cliente que parecem endereÃƒÂ§o
                        console.log("\u00F0\u0178\u201C\u009D [DeliveryAI] Buscando endere\u00C3\u00A7o no contexto...");
                        for (_j = 0, lines_2 = lines; _j < lines_2.length; _j++) {
                            line = lines_2[_j];
                            lower = line.toLowerCase().trim();
                            // SÃƒÂ³ considerar mensagens do cliente
                            if (lower.startsWith('cliente:')) {
                                content = line.substring(line.indexOf(':') + 1).trim();
                                contentLower = content.toLowerCase();
                                isAddress = (/\b(rua|av|avenida|alameda|travessa|estrada|praÃƒÂ§a|praca)\b/i.test(contentLower) ||
                                    /[a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§\s]+,\s*\d+/i.test(contentLower));
                                hasNumber = /\d/.test(content);
                                notName = !/\b(meu nome|me chamo|sou o|sou a)\b/i.test(contentLower);
                                notGreeting = !/\b(oi|olÃƒÂ¡|bom dia|boa tarde|boa noite|quero|gostaria)\b/i.test(contentLower);
                                minLength = content.length >= 8;
                                if (isAddress && hasNumber && notName && notGreeting && minLength) {
                                    addressPart = content
                                        .replace(/\b(pix|dinheiro|cart[aÃƒÂ£]o|credito|d[eÃƒÂ©]bito)\b/gi, '')
                                        .replace(/\b(entrega|delivery|retirada|retirar)\b/gi, '')
                                        .trim()
                                        .replace(/^[\s,]+|[\s,]+$/g, '');
                                    if (addressPart.length >= 5) {
                                        existingInfo.customerAddress = addressPart;
                                        console.log("\u00F0\u0178\u201C\u009D [DeliveryAI] \u00E2\u0153\u2026 Endere\u00C3\u00A7o recuperado do contexto: \"".concat(addressPart, "\""));
                                        break;
                                    }
                                }
                            }
                        }
                        foundNameQuestion = false;
                        for (_k = 0, lines_3 = lines; _k < lines_3.length; _k++) {
                            line = lines_3[_k];
                            lower = line.toLowerCase().trim();
                            // Marcar quando encontramos pergunta de nome
                            if (lower.startsWith('vocÃƒÂª:') && (lower.includes('nome') || lower.includes('qual seu'))) {
                                foundNameQuestion = true;
                                continue;
                            }
                            // Se jÃƒÂ¡ encontrou a pergunta do nome, procurar resposta do cliente
                            if (foundNameQuestion && lower.startsWith('cliente:')) {
                                content = line.substring(line.indexOf(':') + 1).trim();
                                contentLower = content.toLowerCase();
                                notAddress = !/\b(rua|av|avenida|alameda|travessa|estrada|praÃƒÂ§a|bairro)\b/i.test(contentLower);
                                notPayment = !/\b(pix|dinheiro|cartao|cartÃƒÂ£o)\b/i.test(contentLower);
                                noNumber = !/\d/.test(content);
                                isName = /^[a-zÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ­ÃƒÂ¯ÃƒÂ³ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÂºÃƒÂ§ÃƒÂ±\s]{2,50}$/i.test(content);
                                if (notAddress && notPayment && noNumber && isName) {
                                    existingInfo.customerName = content;
                                    console.log("\u00F0\u0178\u201C\u009D [DeliveryAI] \u00E2\u0153\u2026 Nome recuperado do contexto: \"".concat(content, "\""));
                                    break;
                                }
                                // Resetar apÃƒÂ³s encontrar resposta do cliente (pode ter outra pergunta de nome depois)
                                foundNameQuestion = false;
                            }
                        }
                    }
                    info = extractCustomerInfo(message, conversationContext || '', existingInfo);
                    mergedInfo_1 = mergeCustomerInfo(existingInfo, info);
                    if (existingCart) {
                        updateCartCheckoutState(existingCart, 'collecting_info', mergedInfo_1);
                    }
                    paymentMethods = normalizePaymentMethods(deliveryData.config.payment_methods);
                    hasName = mergedInfo_1.customerName && mergedInfo_1.customerName.length > 2;
                    hasPayment = mergedInfo_1.paymentMethod && paymentMethods.some(function (pm) {
                        return pm.includes(normalizeTextForMatch(mergedInfo_1.paymentMethod)) ||
                            normalizeTextForMatch(mergedInfo_1.paymentMethod).includes(pm);
                    });
                    hasDeliveryType = mergedInfo_1.deliveryType !== undefined;
                    cashConfig = getCashConfig(deliveryData.config);
                    needsAddress = false;
                    if (mergedInfo_1.deliveryType === 'delivery') {
                        needsAddress = true;
                    }
                    else if (mergedInfo_1.deliveryType === 'pickup') {
                        needsAddress = false;
                    }
                    else if (!hasDeliveryType) {
                        // Se o tipo nÃƒÂ£o foi definido, sÃƒÂ³ precisa de endereÃƒÂ§o se aceitar delivery
                        // e NÃƒÆ’O aceitar pickup (ou seja, delivery ÃƒÂ© a ÃƒÂºnica opÃƒÂ§ÃƒÂ£o)
                        needsAddress = deliveryData.config.accepts_delivery && !deliveryData.config.accepts_pickup;
                    }
                    hasAddress = mergedInfo_1.customerAddress && mergedInfo_1.customerAddress.length > 5;
                    requiresChangeDecision = hasPayment && isCashPayment(mergedInfo_1.paymentMethod) && cashConfig.askForChange;
                    hasChangeDecision = !requiresChangeDecision || mergedInfo_1.changeNeeded !== undefined;
                    hasChangeAmount = !requiresChangeDecision || mergedInfo_1.changeNeeded === false || (mergedInfo_1.changeNeeded === true &&
                        mergedInfo_1.changeForAmount !== null &&
                        mergedInfo_1.changeForAmount !== undefined &&
                        mergedInfo_1.changeForAmount > 0);
                    console.log("\u00F0\u0178\u201C\u009D [DeliveryAI] Dados extra\u00C3\u00ADdos:", {
                        hasName: hasName,
                        hasPayment: hasPayment,
                        hasDeliveryType: hasDeliveryType,
                        needsAddress: needsAddress,
                        hasAddress: hasAddress,
                        requiresChangeDecision: requiresChangeDecision,
                        hasChangeDecision: hasChangeDecision,
                        hasChangeAmount: hasChangeAmount,
                        info: mergedInfo_1
                    });
                    missing = [];
                    missingFields = [];
                    if (!hasName) {
                        missing.push('Ã°Å¸â€œÂ *Seu nome*');
                        missingFields.push('name');
                    }
                    if (!hasDeliveryType) {
                        options = [];
                        if (deliveryData.config.accepts_delivery)
                            options.push('Ã°Å¸â€ºÂµ Delivery');
                        if (deliveryData.config.accepts_pickup)
                            options.push('Ã°Å¸ÂÆ’ Retirada');
                        missing.push("\u00F0\u0178\u0161\u0161 *Tipo de entrega:* ".concat(options.join(' ou ')));
                        missingFields.push('deliveryType');
                    }
                    if (needsAddress && !hasAddress) {
                        missing.push('Ã°Å¸â€œÂ *EndereÃƒÂ§o completo* (rua, nÃƒÂºmero, bairro)');
                        missingFields.push('address');
                    }
                    if (!hasPayment) {
                        missing.push("\u00F0\u0178\u2019\u00B3 *Forma de pagamento:* ".concat(buildPaymentMethodsText(deliveryData.config)));
                        missingFields.push('payment');
                    }
                    if (!hasChangeDecision) {
                        missing.push('Ã°Å¸â€™Âµ *Precisa de troco?* (responda "sim", "nÃƒÂ£o" ou "troco para 50")');
                        missingFields.push('change');
                    }
                    else if (!hasChangeAmount) {
                        missing.push('Ã°Å¸â€™Âµ *Troco para quanto?* Ex.: troco para 50');
                        missingFields.push('change_amount');
                    }
                    if (missing.length > 0) {
                        responseMsg = '';
                        if (missing.length === 1) {
                            // SÃƒÂ³ falta 1 campo - perguntar diretamente
                            if (missingFields[0] === 'name') {
                                responseMsg = "\u00F0\u0178\u201C\u009D Qual seu *nome*?";
                            }
                            else if (missingFields[0] === 'deliveryType') {
                                options = [];
                                if (deliveryData.config.accepts_delivery)
                                    options.push('Ã°Å¸â€ºÂµ Delivery');
                                if (deliveryData.config.accepts_pickup)
                                    options.push('Ã°Å¸ÂÆ’ Retirada no local');
                                responseMsg = "\u00F0\u0178\u0161\u0161 Voc\u00C3\u00AA prefere *".concat(options.join(' ou '), "*?");
                            }
                            else if (missingFields[0] === 'address') {
                                responseMsg = "\u00F0\u0178\u201C\u008D Qual seu *endere\u00C3\u00A7o completo*? (rua, n\u00C3\u00BAmero, bairro)";
                            }
                            else if (missingFields[0] === 'payment') {
                                responseMsg = "\u00F0\u0178\u2019\u00B3 Qual a *forma de pagamento*? (".concat(buildPaymentMethodsText(deliveryData.config), ")");
                            }
                            else if (missingFields[0] === 'change') {
                                responseMsg = "\u00F0\u0178\u2019\u00B5 Voc\u00C3\u00AA precisa de *troco*? Pode responder \"sim\", \"n\u00C3\u00A3o\" ou \"troco para 50\".";
                            }
                            else if (missingFields[0] === 'change_amount') {
                                responseMsg = "\u00F0\u0178\u2019\u00B5 Perfeito! *Troco para quanto* eu devo anotar? Ex.: troco para 50";
                            }
                        }
                        else {
                            // Faltam mÃƒÂºltiplos campos
                            responseMsg = "Quase l\u00C3\u00A1! S\u00C3\u00B3 preciso de mais algumas informa\u00C3\u00A7\u00C3\u00B5es:\n\n".concat(missing.join('\n\n'), "\n\nPode me enviar! \u00F0\u0178\u02DC\u0160");
                        }
                        return [2 /*return*/, {
                                intent: 'PROVIDE_CUSTOMER_INFO',
                                bubbles: [responseMsg],
                                metadata: {
                                    partialInfo: mergedInfo_1,
                                    missingFields: missingFields,
                                    awaitingInfo: true,
                                },
                            }];
                    }
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    // TODAS AS INFORMAÃƒâ€¡Ãƒâ€¢ES COLETADAS - MOSTRAR RESUMO E PEDIR CONFIRMAÃƒâ€¡ÃƒÆ’O
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    console.log("\u00E2\u0153\u2026 [DeliveryAI] Todas informa\u00C3\u00A7\u00C3\u00B5es coletadas - mostrando resumo para confirma\u00C3\u00A7\u00C3\u00A3o");
                    cart = customerPhone ? getExistingCart(userId, customerPhone, effectiveConversationId) : null;
                    if (!cart || cart.items.size === 0) {
                        return [2 /*return*/, {
                                intent: 'WANT_TO_ORDER',
                                bubbles: [
                                    "\u00F0\u0178\u203A\u2019 Seu pedido est\u00C3\u00A1 vazio. Me diga o que voc\u00C3\u00AA gostaria de pedir!"
                                ],
                            }];
                    }
                    subtotal = getCartSubtotal(cart);
                    if (!(mergedInfo_1.deliveryType === 'delivery')) return [3 /*break*/, 6];
                    return [4 /*yield*/, calculateDeliveryFee(deliveryData.config, mergedInfo_1.customerAddress)];
                case 5:
                    _l = _x.sent();
                    return [3 /*break*/, 7];
                case 6:
                    _l = {
                        fee: 0,
                        distanceKm: null,
                        mode: 'fixed',
                        label: 'Retirada no local',
                    };
                    _x.label = 7;
                case 7:
                    deliveryFeeInfo = _l;
                    deliveryFee = mergedInfo_1.deliveryType === 'delivery' ? deliveryFeeInfo.fee : 0;
                    total = subtotal + deliveryFee;
                    infoForConfirmation = mergeCustomerInfo(mergedInfo_1, {
                        deliveryFee: deliveryFee,
                        deliveryDistanceKm: deliveryFeeInfo.distanceKm,
                        deliveryFeeMode: deliveryFeeInfo.mode,
                    });
                    updateCartCheckoutState(cart, 'awaiting_confirmation', infoForConfirmation);
                    resumo_1 = "\u00F0\u0178\u201C\u2039 *RESUMO DO SEU PEDIDO:*\n\n";
                    resumo_1 += "\u00F0\u0178\u2018\u00A4 *Nome:* ".concat(mergedInfo_1.customerName, "\n");
                    if (mergedInfo_1.deliveryType === 'delivery') {
                        resumo_1 += "\u00F0\u0178\u201C\u008D *Endere\u00C3\u00A7o:* ".concat(mergedInfo_1.customerAddress, "\n");
                        resumo_1 += "\u00F0\u0178\u203A\u00B5 *Tipo:* Delivery\n";
                    }
                    else {
                        resumo_1 += "\u00F0\u0178\u008F\u0192 *Tipo:* Retirada no local\n";
                    }
                    resumo_1 += "\u00F0\u0178\u2019\u00B3 *Pagamento:* ".concat(getPaymentMethodLabel(mergedInfo_1.paymentMethod), "\n");
                    if (isCashPayment(mergedInfo_1.paymentMethod)) {
                        if (mergedInfo_1.changeNeeded === false) {
                            resumo_1 += "\u00F0\u0178\u2019\u00B5 *Troco:* N\u00C3\u00A3o precisa\n";
                        }
                        else if (mergedInfo_1.changeNeeded === true && mergedInfo_1.changeForAmount) {
                            resumo_1 += "\u00F0\u0178\u2019\u00B5 *Troco para:* ".concat(formatCurrency(mergedInfo_1.changeForAmount), "\n");
                        }
                    }
                    if (isPixPayment(mergedInfo_1.paymentMethod)) {
                        pixLines = buildPixSummaryLines(deliveryData.config);
                        if (pixLines.length > 0) {
                            resumo_1 += "\n\u00F0\u0178\u00A7\u00BE *Dados do Pix:*\n";
                            pixLines.forEach(function (line) {
                                resumo_1 += "\u00E2\u20AC\u00A2 ".concat(line, "\n");
                            });
                        }
                    }
                    resumo_1 += "\n\u00F0\u0178\u2019\u00B0 *Subtotal:* ".concat(formatCurrency(subtotal), "\n");
                    if (mergedInfo_1.deliveryType === 'delivery') {
                        resumo_1 += "\u00F0\u0178\u203A\u00B5 *".concat(deliveryFeeInfo.label, ":* ").concat(formatCurrency(deliveryFee), "\n");
                        if (deliveryFeeInfo.details) {
                            resumo_1 += "\u00F0\u0178\u201C\u008F *Dist\u00C3\u00A2ncia:* ".concat(deliveryFeeInfo.details, "\n");
                        }
                    }
                    else {
                        resumo_1 += "\u00F0\u0178\u008F\u00AA *Retirada:* Gr\u00C3\u00A1tis\n";
                    }
                    resumo_1 += "\n\u00F0\u0178\u2019\u00B5 *TOTAL: ".concat(formatCurrency(total), "*\n\n");
                    resumo_1 += "\u00E2\u008F\u00B1\u00EF\u00B8\u008F *Previs\u00C3\u00A3o:* ".concat(deliveryData.config.estimated_delivery_time, " minutos\n\n");
                    resumo_1 += "\u00E2\u0153\u2026 *Confirma o pedido?* (responda \"sim\" para confirmar ou \"n\u00C3\u00A3o\" para cancelar)";
                    return [2 /*return*/, {
                            intent: 'PROVIDE_CUSTOMER_INFO',
                            bubbles: [resumo_1],
                            metadata: {
                                awaitingConfirmation: true,
                                customerInfo: infoForConfirmation,
                                subtotal: subtotal,
                                deliveryFee: deliveryFee,
                                total: total,
                            },
                        }];
                case 8:
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    // CASO ESPECIAL: CANCELAMENTO DE PEDIDO
                    // Respeita a configuraÃƒÂ§ÃƒÂ£o accepts_cancellation
                    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                    if (intent === 'CANCEL_ORDER') {
                        console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Intent CANCEL_ORDER - verificando config accepts_cancellation: ".concat(deliveryData.config.accepts_cancellation));
                        resetCartCheckoutState(currentCart);
                        if (deliveryData.config.accepts_cancellation) {
                            // Cancelamento permitido
                            return [2 /*return*/, {
                                    intent: 'CANCEL_ORDER',
                                    bubbles: [
                                        "\u00E2\u009D\u0152 Pedido cancelado com sucesso!\n\nSe mudar de ideia, \u00C3\u00A9 s\u00C3\u00B3 me chamar novamente. \u00F0\u0178\u02DC\u0160"
                                    ],
                                    metadata: {
                                        cancelled: true,
                                    },
                                }];
                        }
                        else {
                            // Cancelamento NÃƒÆ’O permitido pela configuraÃƒÂ§ÃƒÂ£o
                            return [2 /*return*/, {
                                    intent: 'CANCEL_ORDER',
                                    bubbles: [
                                        "\u00E2\u0161\u00A0\u00EF\u00B8\u008F Infelizmente n\u00C3\u00A3o \u00C3\u00A9 poss\u00C3\u00ADvel cancelar o pedido por aqui.\n\nPara cancelamentos, entre em contato diretamente com o estabelecimento ou aguarde uma resposta do atendente. \u00F0\u0178\u201C\u017E"
                                    ],
                                    metadata: {
                                        cancelled: false,
                                        reason: 'cancellation_not_allowed',
                                    },
                                }];
                        }
                    }
                    return [4 /*yield*/, (0, llm_1.getLLMClient)()];
                case 9:
                    mistral = _x.sent();
                    if (!mistral) {
                        console.error("\u00F0\u0178\u008D\u2022 [DeliveryAI] Mistral client not available");
                        return [2 /*return*/, {
                                intent: intent,
                                bubbles: ['Desculpe, estou com um problema tÃƒÂ©cnico. Tente novamente em alguns instantes.'],
                            }];
                    }
                    itemList = deliveryData.categories
                        .flatMap(function (cat) { return cat.items.map(function (item) { return "".concat(item.name, ": R$ ").concat(item.price.toFixed(2)); }); })
                        .join('\n');
                    allItemNames = deliveryData.categories
                        .flatMap(function (cat) { return cat.items.map(function (item) { return item.name.toLowerCase(); }); });
                    systemPrompt = "Voc\u00C3\u00AA \u00C3\u00A9 um atendente simp\u00C3\u00A1tico da ".concat(deliveryData.config.business_name, ".\n\n\u00E2\u0161\u00A0\u00EF\u00B8\u008F REGRAS CR\u00C3\u008DTICAS - SIGA \u00C3\u20AC RISCA:\n\n1. CARD\u00C3\u0081PIO COMPLETO (APENAS ESTES ITENS EXISTEM):\n").concat(itemList, "\n\n2. ITENS QUE N\u00C3\u0192O EXISTEM (NUNCA MENCIONE):\n   - Batata frita, batata, fritas\n   - Onion rings, nuggets\n   - Milk shake, sorvete\n   - Qualquer item N\u00C3\u0192O listado acima\n\n3. SE O CLIENTE PEDIR ALGO QUE N\u00C3\u0192O TEM:\n   Responda: \"Infelizmente n\u00C3\u00A3o temos [item]. Nosso card\u00C3\u00A1pio tem: [listar itens]\"\n\n4. AO CONFIRMAR PEDIDO:\n   - Use APENAS pre\u00C3\u00A7os do card\u00C3\u00A1pio acima\n   - Calcule: Subtotal + Taxa entrega (R$ ").concat(deliveryData.config.delivery_fee.toFixed(2), ") = Total\n   - NUNCA invente valores\n\n5. INFORMA\u00C3\u2021\u00C3\u2022ES DE ENTREGA:\n   - Taxa: R$ ").concat(deliveryData.config.delivery_fee.toFixed(2), "\n   - Tempo: ~").concat(deliveryData.config.estimated_delivery_time, " min\n   - Pedido m\u00C3\u00ADnimo: R$ ").concat(deliveryData.config.min_order_value.toFixed(2), "\n   - Pagamento: ").concat(deliveryData.config.payment_methods.join(', '), "\n\n6. SEJA BREVE: m\u00C3\u00A1ximo 2-3 frases. Use emojis com modera\u00C3\u00A7\u00C3\u00A3o.\n\n7. SE N\u00C3\u0192O SOUBER: pergunte ao cliente ou diga que vai verificar.");
                    _x.label = 10;
                case 10:
                    _x.trys.push([10, 12, , 13]);
                    return [4 /*yield*/, mistral.chat.complete({
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: message },
                            ],
                            temperature: 0.2, // Muito baixa para ser mais determinÃƒÂ­stico
                            maxTokens: 300, // Respostas curtas
                        })];
                case 11:
                    response = _x.sent();
                    aiResponse = ((_w = (_v = (_u = response.choices) === null || _u === void 0 ? void 0 : _u[0]) === null || _v === void 0 ? void 0 : _v.message) === null || _w === void 0 ? void 0 : _w.content) || '';
                    if (typeof aiResponse !== 'string') {
                        aiResponse = String(aiResponse);
                    }
                    inventedItems = detectInventedItems(aiResponse, allItemNames);
                    if (inventedItems.length > 0) {
                        console.log("\u00F0\u0178\u0161\u00A8 [DeliveryAI] IA INVENTOU ITENS: ".concat(inventedItems.join(', ')));
                        // Corrigir a resposta
                        aiResponse = "Nosso card\u00C3\u00A1pio tem:\n".concat(itemList, "\n\nO que voc\u00C3\u00AA gostaria de pedir? \u00F0\u0178\u02DC\u0160");
                    }
                    validation = validatePriceInResponse(aiResponse, deliveryData);
                    if (!validation.valid) {
                        console.log("\u00E2\u0161\u00A0\u00EF\u00B8\u008F [DeliveryAI] Pre\u00C3\u00A7os incorretos detectados e corrigidos:", validation.errors);
                        aiResponse = validation.corrected;
                    }
                    return [2 /*return*/, {
                            intent: intent,
                            bubbles: [aiResponse],
                            metadata: {
                                validatedPrice: validation.valid ? undefined : 0,
                            },
                        }];
                case 12:
                    error_7 = _x.sent();
                    console.error("\u00F0\u0178\u008D\u2022 [DeliveryAI] Erro na IA:", error_7);
                    return [2 /*return*/, {
                            intent: intent,
                            bubbles: ['Desculpe, tive um problema. Pode repetir sua mensagem?'],
                        }];
                case 13: return [2 /*return*/];
            }
        });
    });
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã°Å¸Å¡Â¨ DETECTAR ITENS INVENTADOS PELA IA
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function detectInventedItems(response, validItems) {
    var inventedItems = [];
    var responseLower = response.toLowerCase();
    // Lista de itens comuns que IA pode inventar
    var commonInventions = [
        'batata frita', 'batata', 'fritas', 'french fries',
        'onion rings', 'anÃƒÂ©is de cebola',
        'nuggets', 'chicken nuggets',
        'milk shake', 'milkshake', 'shake',
        'sorvete', 'sundae',
        'combo', 'promoÃƒÂ§ÃƒÂ£o',
        'pizza', 'hot dog', 'cachorro quente',
        'cheddar', 'bacon extra', // a menos que exista
    ];
    var _loop_3 = function (invention) {
        // Verifica se a IA mencionou o item inventado
        if (responseLower.includes(invention)) {
            // Verifica se NÃƒÆ’O ÃƒÂ© um item vÃƒÂ¡lido do cardÃƒÂ¡pio
            var isValid = validItems.some(function (valid) {
                return valid.includes(invention) || invention.includes(valid);
            });
            if (!isValid) {
                inventedItems.push(invention);
            }
        }
    };
    for (var _i = 0, commonInventions_1 = commonInventions; _i < commonInventions_1.length; _i++) {
        var invention = commonInventions_1[_i];
        _loop_3(invention);
    }
    return inventedItems;
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã°Å¸Å’â€¦ HELPER: SAUDAÃƒâ€¡ÃƒÆ’O BASEADA NO HORÃƒÂRIO
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function getTimeBasedGreeting() {
    var hour = new Date().getHours();
    if (hour >= 5 && hour < 12)
        return 'Bom dia';
    if (hour >= 12 && hour < 18)
        return 'Boa tarde';
    return 'Boa noite';
}
function parseHalfHalfOrder(message, deliveryData, categoryContext) {
    var lowerMsg = message.toLowerCase();
    // Detectar categoria do contexto (pizza, esfirra, etc)
    var categoryFilter = categoryContext;
    if (!categoryFilter) {
        // Tentar detectar da mensagem
        if (lowerMsg.includes('pizza'))
            categoryFilter = 'pizza';
        else if (lowerMsg.includes('esfirra') || lowerMsg.includes('esfiha'))
            categoryFilter = 'esfirra';
        else if (lowerMsg.includes('hamburguer') || lowerMsg.includes('lanche'))
            categoryFilter = 'hamburguer';
    }
    console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] parseHalfHalfOrder - categoria: ".concat(categoryFilter || 'TODAS'));
    // PadrÃƒÂµes para extrair dois sabores:
    // "meio a meio calabresa e mussarela"
    // "meia calabresa e meia mussarela"
    // "calabresa com mussarela"
    // "metade calabresa metade mussarela"
    // "pizza calabresa/mussarela"
    var patterns = [
        /meia\s+(.+?)\s+meia\s+(.+?)(?:\s|$)/i,
        /(?:meio\s*(?:a\s*)?meio|meia)\s+(.+?)\s+(?:e|com|\/)\s+(?:meia|meio\s*(?:a\s*)?meio)?\s*(.+?)(?:\s|$)/i,
        /(?:metade)\s+(.+?)\s+(?:e|com|\/)\s+(?:metade)?\s*(.+?)(?:\s|$)/i,
        /(.+?)\s+(?:e|com|\/)\s+(.+?)\s+(?:meio\s*(?:a\s*)?meio|metade|meia)/i,
        /(.+?)\s*\/\s*(.+)/i,
        /(.+?)\s+(?:e|com)\s+(.+)/i,
    ];
    var flavor1 = '';
    var flavor2 = '';
    // Fallback rÃƒÂ¡pido: "meia X meia Y" sem conjunÃƒÂ§ÃƒÂ£o
    if (!flavor1 && !flavor2 && lowerMsg.includes('meia')) {
        var meiaParts = lowerMsg.split('meia').map(function (p) { return p.trim(); }).filter(Boolean);
        if (meiaParts.length >= 3) {
            var possibleFlavors = meiaParts.slice(-2);
            flavor1 = possibleFlavors[0]
                .replace(/^(?:pizza\s*(?:de\s*)?|esfirra\s*(?:de\s*)?|esfiha\s*(?:de\s*)?|de\s*)/i, '')
                .replace(/sabor\s*/i, '')
                .replace(/^a\s+/i, '')
                .trim();
            flavor2 = possibleFlavors[1]
                .replace(/^(?:pizza\s*(?:de\s*)?|esfirra\s*(?:de\s*)?|esfiha\s*(?:de\s*)?|de\s*)/i, '')
                .replace(/sabor\s*/i, '')
                .replace(/^a\s+/i, '')
                .trim();
            console.log("\u00F0\u0178\u201D\u008D [DeliveryAI] Sabores extra\u00C3\u00ADdos (fallback meia): \"".concat(flavor1, "\" e \"").concat(flavor2, "\""));
        }
    }
    for (var _i = 0, patterns_2 = patterns; _i < patterns_2.length; _i++) {
        var pattern = patterns_2[_i];
        if (flavor1 && flavor2)
            break;
        var match = lowerMsg.match(pattern);
        if (match) {
            flavor1 = match[1].trim()
                .replace(/^(?:pizza\s*(?:de\s*)?|esfirra\s*(?:de\s*)?|esfiha\s*(?:de\s*)?|de\s*)/i, '')
                .replace(/sabor\s*/i, '')
                .replace(/^a\s+/i, ''); // Remove "a" inicial
            flavor2 = match[2].trim()
                .replace(/^(?:pizza\s*(?:de\s*)?|esfirra\s*(?:de\s*)?|esfiha\s*(?:de\s*)?|de\s*)/i, '')
                .replace(/sabor\s*/i, '')
                .replace(/^a\s+/i, ''); // Remove "a" inicial
            console.log("\u00F0\u0178\u201D\u008D [DeliveryAI] Sabores extra\u00C3\u00ADdos: \"".concat(flavor1, "\" e \"").concat(flavor2, "\""));
            break;
        }
    }
    if (!flavor1 || !flavor2) {
        return {
            success: false,
            items: [],
            errorMessage: 'NÃƒÂ£o consegui identificar os dois sabores. Por favor, diga algo como "pizza meio a meio calabresa e mussarela".'
        };
    }
    // Buscar itens no menu COM FILTRO DE CATEGORIA
    var item1 = findItemByNameFuzzy(deliveryData, flavor1, categoryFilter);
    var item2 = findItemByNameFuzzy(deliveryData, flavor2, categoryFilter);
    var items = [];
    var notFound = [];
    if (item1) {
        items.push({ name: item1.name, price: item1.price, category: item1.category_name });
    }
    else {
        notFound.push(flavor1);
    }
    if (item2) {
        items.push({ name: item2.name, price: item2.price, category: item2.category_name });
    }
    else {
        notFound.push(flavor2);
    }
    // Verificar se os dois itens sÃƒÂ£o da mesma categoria
    if (items.length === 2 && items[0].category !== items[1].category) {
        console.log("\u00E2\u0161\u00A0\u00EF\u00B8\u008F [DeliveryAI] Categorias diferentes: ".concat(items[0].category, " vs ").concat(items[1].category));
    }
    if (notFound.length > 0) {
        var categoryName = categoryFilter || 'categoria';
        return {
            success: false,
            items: items,
            errorMessage: "N\u00C3\u00A3o encontrei ".concat(notFound.join(', '), " em ").concat(categoryName, ". Verifique os sabores dispon\u00C3\u00ADveis no card\u00C3\u00A1pio.")
        };
    }
    return {
        success: true,
        items: items,
    };
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã¯Â¿Â½Ã°Å¸Å½Â¯ FUNÃƒâ€¡ÃƒÆ’O PRINCIPAL - PROCESSADOR DE DELIVERY
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã°Å¸â€™Â¬ PARSE DE ITENS DO PEDIDO (DA MENSAGEM DO CLIENTE)
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
var NUMBER_WORDS = {
    'um': 1, 'uma': 1,
    'dois': 2, 'duas': 2,
    'tres': 3, 'trÃƒÂªs': 3,
    'quatro': 4,
    'cinco': 5,
    'seis': 6,
    'sete': 7,
    'oito': 8,
    'nove': 9,
    'dez': 10,
};
function parseOrderItems(message) {
    var results = [];
    var normalizedMsg = message.toLowerCase()
        .replace(/quero|vou querer|me (vÃƒÂª|ve|da|dÃƒÂ¡)|pode|manda|adiciona|coloca|bota|p[oÃƒÂµ]e|por favor|pfv|pf/gi, '')
        .trim();
    // PadrÃƒÂµes: "2 pizza calabresa", "uma esfiha de carne", "3x refrigerante"
    var patterns = [
        /(\d+)\s*x?\s+(.+?)(?:,|e\s+\d|$)/gi,
        /(uma?|dois|duas|tres|trÃƒÂªs|quatro|cinco|seis|sete|oito|nove|dez)\s+(.+?)(?:,|e\s+(?:um|uma|\d)|$)/gi,
    ];
    for (var _i = 0, patterns_3 = patterns; _i < patterns_3.length; _i++) {
        var pattern = patterns_3[_i];
        var match = void 0;
        pattern.lastIndex = 0; // Reset regex state
        while ((match = pattern.exec(normalizedMsg)) !== null) {
            var qtyPart = match[1].toLowerCase();
            var itemPart = match[2].trim()
                .replace(/^\s*(de|da|do)\s+/i, '') // Remove "de", "da", "do" no inÃƒÂ­cio
                .replace(/,\s*$/, ''); // Remove vÃƒÂ­rgula no final
            var qty = NUMBER_WORDS[qtyPart] || parseInt(qtyPart) || 1;
            if (itemPart.length > 2) {
                results.push({ name: itemPart, quantity: qty });
            }
        }
    }
    // Se nÃƒÂ£o encontrou padrÃƒÂ£o especÃƒÂ­fico, tenta extrair item ÃƒÂºnico
    if (results.length === 0 && normalizedMsg.length > 2) {
        results.push({ name: normalizedMsg, quantity: 1 });
    }
    console.log("\u00F0\u0178\u201D\u008D [DeliveryAI] Itens parseados da mensagem: ".concat(JSON.stringify(results)));
    return results;
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã°Å¸â€Â BUSCAR ITEM NO MENU (COM MATCHING FUZZY)
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function findItemByNameFuzzy(data, searchName, categoryFilter // NOVO: Filtrar por categoria especÃƒÂ­fica
) {
    // Ã°Å¸â€ â€¢ NormalizaÃƒÂ§ÃƒÂ£o unificada: aplicar mesmas regras para busca E nomes de itens
    var normalizeForItemMatch = function (text) {
        return text.toLowerCase().trim()
            .replace(/coca[\s-]*cola/gi, 'coca') // coca-cola Ã¢â€ â€™ coca
            .replace(/guarana/gi, 'guaranÃƒÂ¡')
            .replace(/-/g, ' ') // hifens Ã¢â€ â€™ espaÃƒÂ§o
            .replace(/\s+/g, ' ');
    };
    var normalized = normalizeForItemMatch(searchName);
    var matchedCategory = categoryFilter
        ? findMatchingCategory(data, categoryFilter)
        : null;
    var categoriesToSearch = matchedCategory ? [matchedCategory] : data.categories;
    console.log("\u00F0\u0178\u201D\u008D [DeliveryAI] Buscando \"".concat(searchName, "\" em ").concat(categoriesToSearch.length, " categorias ").concat(categoryFilter ? "(filtro: ".concat(categoryFilter, ")") : ''));
    // 1. NormalizaÃƒÂ§ÃƒÂ£o de sabor (remover prefixos como "pizza de", "esfiha de", "borda de")
    var cleanedName = normalized
        .replace(/^(?:pizza\s*(?:de\s*)?|esfirra?\s*(?:de\s*)?|esfiha\s*(?:de\s*)?|borda\s*(?:de\s*)?)/i, '')
        .replace(/^(?:uma?\s*|um\s*)/i, '')
        .trim();
    var searchWords = normalized
        .split(/\s+/)
        .filter(function (w) { return w.length > 1 && !['de', 'da', 'do', 'uma', 'um'].includes(w); });
    var flavorWords = normalized
        .split(/\s+/)
        .filter(function (w) { return w.length > 3 && !['pizza', 'esfiha', 'esfirra', 'quero', 'grande', 'media', 'pequena'].includes(w); });
    var candidates = [];
    var collectCandidates = function (categories) {
        var matches = [];
        for (var _i = 0, categories_1 = categories; _i < categories_1.length; _i++) {
            var category = categories_1[_i];
            var _loop_4 = function (item) {
                var itemNameLower = normalizeForItemMatch(item.name);
                var score = 0;
                var reason = '';
                if (itemNameLower === normalized) {
                    score = 100;
                    reason = 'exato';
                }
                else if (cleanedName.length > 2 && itemNameLower.includes(cleanedName)) {
                    score = 90;
                    reason = "sabor:".concat(cleanedName);
                }
                else if (searchWords.length > 0 && searchWords.every(function (word) { return itemNameLower.includes(word); })) {
                    score = 80;
                    reason = 'todas-palavras';
                }
                else if (flavorWords.length > 0 && flavorWords.some(function (word) { return itemNameLower.includes(word); })) {
                    score = 60;
                    reason = 'fuzzy-sabor';
                }
                if (score > 0) {
                    matches.push({ item: item, categoryName: category.name, score: score, reason: reason });
                }
            };
            for (var _a = 0, _b = category.items; _a < _b.length; _a++) {
                var item = _b[_a];
                _loop_4(item);
            }
        }
        return matches;
    };
    candidates.push.apply(candidates, collectCandidates(categoriesToSearch));
    if (candidates.length === 0 && matchedCategory) {
        console.log("\u00F0\u0178\u201D\u0081 [DeliveryAI] Nenhum match em \"".concat(matchedCategory.name, "\", tentando card\u00C3\u00A1pio completo"));
        candidates.push.apply(candidates, collectCandidates(data.categories));
    }
    if (candidates.length > 0) {
        candidates.sort(function (a, b) { return b.score - a.score || a.item.name.length - b.item.name.length; });
        var best = candidates[0];
        console.log("\u00E2\u0153\u2026 [DeliveryAI] Match ".concat(best.reason, ": ").concat(best.item.name, " (categoria: ").concat(best.categoryName, ")"));
        return best.item;
    }
    console.log("\u00E2\u009D\u0152 [DeliveryAI] Nenhum item encontrado para \"".concat(searchName, "\""));
    return null;
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã°Å¸Â§Â  DETECTAR CONTEXTO DE CATEGORIA BASEADO NO HISTÃƒâ€œRICO
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function detectCategoryContext(conversationHistory, deliveryData) {
    var recentBotMessages = conversationHistory
        .filter(function (m) { return m.fromMe; })
        .slice(-5);
    if (recentBotMessages.length === 0) {
        console.log("\u00F0\u0178\u00A7\u00A0 [DeliveryAI] Nenhum contexto de categoria detectado no hist\u00C3\u00B3rico");
        return undefined;
    }
    var categorySignals = deliveryData.categories.map(function (category) {
        var aliases = new Set([
            normalizeTextForMatch(category.name),
            normalizeCategoryText(category.name),
        ]);
        var categoryKey = detectCategoryFromMessage(category.name);
        if (categoryKey) {
            aliases.add(normalizeTextForMatch(categoryKey));
            aliases.add(normalizeCategoryText(categoryKey));
            for (var _i = 0, _a = exports.CATEGORY_KEYWORDS[categoryKey] || []; _i < _a.length; _i++) {
                var keyword = _a[_i];
                aliases.add(normalizeTextForMatch(keyword));
                aliases.add(normalizeCategoryText(keyword));
            }
        }
        for (var _b = 0, _c = category.items.slice(0, 5); _b < _c.length; _b++) {
            var item = _c[_b];
            aliases.add(normalizeTextForMatch(item.name));
        }
        return {
            name: category.name,
            aliases: Array.from(aliases).filter(Boolean),
        };
    });
    var _loop_5 = function (message) {
        var normalizedMessage = normalizeTextForMatch(message.text);
        for (var _b = 0, categorySignals_1 = categorySignals; _b < categorySignals_1.length; _b++) {
            var category = categorySignals_1[_b];
            if (category.aliases.some(function (alias) { return alias && normalizedMessage.includes(alias); })) {
                console.log("\u00F0\u0178\u00A7\u00A0 [DeliveryAI] Contexto detectado: \u00C3\u00BAltima categoria vista foi \"".concat(category.name, "\""));
                return { value: category.name };
            }
        }
    };
    for (var _i = 0, _a = __spreadArray([], recentBotMessages, true).reverse(); _i < _a.length; _i++) {
        var message = _a[_i];
        var state_2 = _loop_5(message);
        if (typeof state_2 === "object")
            return state_2.value;
    }
    console.log("\u00F0\u0178\u00A7\u00A0 [DeliveryAI] Nenhum contexto de categoria detectado no hist\u00C3\u00B3rico");
    return undefined;
}
function processOrderFromMessage(userId, customerPhone, message, deliveryData, categoryContext) {
    var categoryMap = {
        pizza: 'Pizza',
        esfirra: 'Esfiha',
        bebida: 'Bebida',
        'aÃƒÂ§aÃƒÂ­': 'AÃƒÂ§aÃƒÂ­',
        borda: 'Borda',
    };
    var parsedItems = parseOrderItems(message);
    var addedItems = [];
    var notFoundItems = [];
    var itemsNeedingSize = [];
    for (var _i = 0, parsedItems_2 = parsedItems; _i < parsedItems_2.length; _i++) {
        var parsed = parsedItems_2[_i];
        var itemCategoryKey = detectCategoryFromMessage(parsed.name);
        var itemCategoryContext = itemCategoryKey
            ? (categoryMap[itemCategoryKey] || categoryContext)
            : categoryContext;
        var menuItem = findItemByNameFuzzy(deliveryData, parsed.name, itemCategoryContext);
        if (menuItem) {
            var resolved = resolveMenuItemOptions(menuItem, message);
            if (resolved.needsSize) {
                itemsNeedingSize.push({
                    name: menuItem.name,
                    quantity: parsed.quantity,
                    options: resolved.sizeOptions || [],
                });
                continue;
            }
            var optionsKey = resolved.optionsSelected
                .map(function (opt) { return "".concat(normalizeTextForMatch(opt.group), ":").concat(normalizeTextForMatch(opt.option)); })
                .join('|');
            addToCart(userId, customerPhone, menuItem, parsed.quantity, {
                displayName: resolved.displayName,
                priceOverride: resolved.unitPrice,
                notes: resolved.notes,
                optionsSelected: resolved.optionsSelected,
                itemKeySuffix: optionsKey || undefined,
            });
            addedItems.push({
                name: resolved.displayName,
                quantity: parsed.quantity,
                price: resolved.unitPrice,
            });
        }
        else {
            notFoundItems.push(parsed.name);
        }
    }
    if (itemsNeedingSize.length > 0) {
        var item = itemsNeedingSize[0];
        var sizesText = item.options.map(function (opt) {
            return "\u00E2\u20AC\u00A2 *".concat(opt.name, "* - R$ ").concat(opt.price.toFixed(2).replace('.', ','));
        }).join('\n');
        return {
            success: false,
            addedItems: [],
            notFoundItems: notFoundItems,
            cart: getCart(userId, customerPhone),
            message: "\u00F0\u0178\u008D\u2022 Boa escolha! *".concat(item.quantity, "x ").concat(item.name, "*\n\n\u00F0\u0178\u201C\u0090 *Qual tamanho voc\u00C3\u00AA quer?*\n\n").concat(sizesText, "\n\nMe diz o tamanho! \u00F0\u0178\u02DC\u0160"),
        };
    }
    var cart = getCart(userId, customerPhone);
    var message_response = '';
    if (addedItems.length > 0) {
        message_response = "\u00E2\u0153\u2026 Adicionado ao pedido:\n";
        for (var _a = 0, addedItems_2 = addedItems; _a < addedItems_2.length; _a++) {
            var item = addedItems_2[_a];
            var total = item.price * item.quantity;
            message_response += "\u00E2\u20AC\u00A2 ".concat(item.quantity, "x ").concat(item.name, " - R$ ").concat(total.toFixed(2).replace('.', ','), "\n");
        }
    }
    if (notFoundItems.length > 0) {
        message_response += "\n\u00E2\u0161\u00A0\u00EF\u00B8\u008F N\u00C3\u00A3o encontrei: ".concat(notFoundItems.join(', '), "\n");
        message_response += "Por favor, verifique o card\u00C3\u00A1pio ou escreva o nome do item.";
    }
    if (addedItems.length > 0) {
        message_response += "\n\n".concat(formatCartSummary(cart, deliveryData.config.delivery_fee));
        message_response += "\n\nDeseja mais alguma coisa ou posso fechar o pedido?";
    }
    return {
        success: addedItems.length > 0,
        addedItems: addedItems,
        notFoundItems: notFoundItems,
        cart: cart,
        message: message_response,
    };
}
function confirmAndCreateOrder(userId, customerPhone, customerName, deliveryType, paymentMethod, address, deliveryData, conversationId, options) {
    return __awaiter(this, void 0, void 0, function () {
        var cart, subtotal, minOrder, deliveryFee, total, items, validConversationId, _a, order_1, orderError, orderItems, itemsError, error_8;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    cart = getExistingCart(userId, customerPhone, conversationId);
                    if (!cart || cart.items.size === 0) {
                        return [2 /*return*/, { success: false, error: 'Carrinho vazio' }];
                    }
                    subtotal = getCartSubtotal(cart);
                    minOrder = deliveryData.config.min_order_value;
                    if (subtotal < minOrder) {
                        return [2 /*return*/, {
                                success: false,
                                error: "Pedido m\u00C3\u00ADnimo \u00C3\u00A9 R$ ".concat(minOrder.toFixed(2).replace('.', ','), ". Seu pedido: R$ ").concat(subtotal.toFixed(2).replace('.', ','))
                            }];
                    }
                    if (deliveryType === 'delivery' && !address) {
                        return [2 /*return*/, { success: false, error: 'EndereÃƒÂ§o obrigatÃƒÂ³rio para entrega' }];
                    }
                    deliveryFee = deliveryType === 'delivery'
                        ? ((_b = options === null || options === void 0 ? void 0 : options.deliveryFeeOverride) !== null && _b !== void 0 ? _b : deliveryData.config.delivery_fee)
                        : 0;
                    total = subtotal + deliveryFee;
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 4, , 5]);
                    items = Array.from(cart.items.values()).map(function (item) { return ({
                        name: item.name,
                        quantity: item.quantity,
                        notes: item.notes,
                    }); });
                    validConversationId = conversationId && !isSyntheticConversationId(conversationId)
                        ? conversationId
                        : null;
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('delivery_orders')
                            .insert({
                            user_id: userId,
                            conversation_id: validConversationId,
                            customer_name: customerName,
                            customer_phone: customerPhone,
                            customer_address: address,
                            delivery_type: deliveryType,
                            payment_method: paymentMethod,
                            status: 'pending',
                            subtotal: subtotal,
                            delivery_fee: deliveryFee,
                            total: total,
                            estimated_time: deliveryData.config.estimated_delivery_time,
                            notes: (options === null || options === void 0 ? void 0 : options.notes) || null,
                        })
                            .select()
                            .single()];
                case 2:
                    _a = _c.sent(), order_1 = _a.data, orderError = _a.error;
                    if (orderError || !order_1) {
                        console.error("\u00F0\u0178\u008D\u2022 [DeliveryAI] Erro ao criar pedido:", orderError);
                        return [2 /*return*/, { success: false, error: 'Erro ao criar pedido' }];
                    }
                    console.log("\u00E2\u0153\u2026 [DeliveryAI] Pedido #".concat(order_1.id, " criado com sucesso!"));
                    orderItems = Array.from(cart.items.values()).map(function (item) {
                        var _a;
                        return ({
                            order_id: order_1.id,
                            menu_item_id: (_a = item.menuItemId) !== null && _a !== void 0 ? _a : null,
                            item_name: item.name,
                            quantity: item.quantity,
                            unit_price: item.price,
                            total_price: item.price * item.quantity,
                            options_selected: item.optionsSelected || [],
                            notes: item.notes,
                        });
                    });
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('order_items')
                            .insert(orderItems)];
                case 3:
                    itemsError = (_c.sent()).error;
                    if (itemsError) {
                        console.error("\u00F0\u0178\u008D\u2022 [DeliveryAI] Erro ao inserir itens:", itemsError);
                        // NÃƒÂ£o falha o pedido
                    }
                    // Limpar carrinho apÃƒÂ³s sucesso
                    clearCart(userId, customerPhone, conversationId);
                    return [2 /*return*/, {
                            success: true,
                            orderId: order_1.id,
                            total: total,
                        }];
                case 4:
                    error_8 = _c.sent();
                    console.error("\u00F0\u0178\u008D\u2022 [DeliveryAI] Erro interno:", error_8);
                    return [2 /*return*/, { success: false, error: 'Erro interno ao criar pedido' }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function processDeliveryMessage(userId, message, conversationHistory, customerPhone, conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var deliveryData, businessStatus, hoursText, historyName, effectiveName, defaultClosedTemplate, closedTemplate, closedMessageRaw, closedMessage, interpretation, intent, executionMessage, normalizedMsg, currentCart, categoryKeywords, parsedCheck, parsedName_1, isJustCategoryKeyword, foundItem, response, menuSendMode, isMenuDisplayIntent, requestedCategory, matchedCategory, mediaActions, catName;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0:
                    console.log("\n".concat('Ã¢â€¢Â'.repeat(60)));
                    console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Processando mensagem: \"".concat(message.substring(0, 50), "...\""));
                    return [4 /*yield*/, getDeliveryData(userId)];
                case 1:
                    deliveryData = _k.sent();
                    if (!deliveryData) {
                        console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Delivery n\u00C3\u00A3o ativo para este usu\u00C3\u00A1rio");
                        return [2 /*return*/, null]; // Retorna null para indicar que deve usar fluxo normal
                    }
                    businessStatus = isBusinessOpen(deliveryData.config.opening_hours);
                    console.log("\u00F0\u0178\u2022\u0090 [DeliveryAI] Hor\u00C3\u00A1rio: ".concat(businessStatus.currentTime, " | Aberto: ").concat(businessStatus.isOpen));
                    if (!businessStatus.isOpen) {
                        console.log("\u00F0\u0178\u0161\u00AB [DeliveryAI] Estabelecimento fechado - informando cliente");
                        hoursText = formatBusinessHours(deliveryData.config.opening_hours);
                        historyName = getCustomerNameFromHistory(conversationHistory);
                        effectiveName = deliveryData.config.use_customer_name
                            ? (historyName || 'Cliente')
                            : 'Cliente';
                        defaultClosedTemplate = "\u00F0\u0178\u02DC\u201D *Ops! Estamos fechados no momento.*\n\n\u00F0\u0178\u2022\u0090 {status}\n\n{horarios}\n\n\u00E2\u0153\u00A8 Volte no hor\u00C3\u00A1rio de funcionamento! Teremos prazer em atend\u00C3\u00AA-lo.";
                        closedTemplate = deliveryData.config.closed_message || defaultClosedTemplate;
                        closedMessageRaw = interpolateDeliveryMessage(closedTemplate, {
                            cliente_nome: effectiveName,
                            nome: effectiveName,
                            name: effectiveName,
                            horarios: hoursText,
                            status: businessStatus.message,
                        });
                        closedMessage = applyHumanization(closedMessageRaw, deliveryData.config, true);
                        return [2 /*return*/, {
                                intent: 'OTHER',
                                bubbles: [closedMessage],
                                metadata: { businessClosed: true, businessStatus: businessStatus }
                            }];
                    }
                    return [4 /*yield*/, interpretDeliveryTurnWithLLM(userId, message, deliveryData, conversationHistory, customerPhone)];
                case 2:
                    interpretation = _k.sent();
                    intent = (interpretation === null || interpretation === void 0 ? void 0 : interpretation.intent) || null;
                    executionMessage = ((_a = interpretation === null || interpretation === void 0 ? void 0 : interpretation.normalizedMessage) === null || _a === void 0 ? void 0 : _a.trim()) || message;
                    if (intent === 'PROVIDE_CUSTOMER_INFO') {
                        executionMessage = ((_b = interpretation === null || interpretation === void 0 ? void 0 : interpretation.normalizedMessage) === null || _b === void 0 ? void 0 : _b.trim())
                            ? "".concat(interpretation.normalizedMessage.trim(), " | mensagem_original: ").concat(message)
                            : message;
                    }
                    normalizedMsg = normalizeTextForMatch(executionMessage);
                    if (!intent) {
                        if (/^(oi|ola|olÃƒÂ¡|bom dia|boa tarde|boa noite|e ai|eae|opa|oii+|hi|hey)\\b/.test(normalizedMsg)) {
                            intent = 'GREETING';
                        }
                        else if (/(cardapio|cardÃƒÂ¡pio|menu|o que tem|oque tem|quais produtos|quais os produtos|me manda o menu|mostra o menu|ver o cardapio|ver cardÃƒÂ¡pio)/i.test(normalizedMsg)) {
                            intent = 'WANT_MENU';
                        }
                    }
                    if (customerPhone) {
                        currentCart = getCart(userId, customerPhone, conversationId);
                        if (shouldForceCustomerInfoIntent(currentCart, message, conversationHistory, intent)) {
                            intent = 'PROVIDE_CUSTOMER_INFO';
                            executionMessage = ((_c = interpretation === null || interpretation === void 0 ? void 0 : interpretation.normalizedMessage) === null || _c === void 0 ? void 0 : _c.trim())
                                ? "".concat(interpretation.normalizedMessage.trim(), " | mensagem_original: ").concat(message)
                                : message;
                        }
                    }
                    if (!!intent) return [3 /*break*/, 4];
                    return [4 /*yield*/, detectIntentWithAI(executionMessage, conversationHistory, deliveryData)];
                case 3:
                    intent = _k.sent();
                    _k.label = 4;
                case 4:
                    // Ã°Å¸â€ â€¢ FIX: OVERRIDE WANT_CATEGORY quando mensagem contÃƒÂ©m nome de item especÃƒÂ­fico
                    // Evita que "borda de cheddar", "coca-cola 2l" sejam tratados como WANT_CATEGORY
                    if (intent === 'WANT_CATEGORY') {
                        categoryKeywords = ['pizza', 'pizzas', 'borda', 'bordas', 'bebida', 'bebidas',
                            'adicional', 'adicionais', 'doce', 'doces', 'especial', 'especiais',
                            'tradicional', 'tradicionais', 'esfiha', 'esfihas', 'esfirra', 'esfirras',
                            'acai', 'aÃƒÂ§aÃƒÂ­', 'sobremesa', 'sobremesas', 'lanche', 'lanches',
                            'hamburguer', 'hamburgueres', 'combo', 'combos'];
                        parsedCheck = parseOrderItems(executionMessage);
                        if (parsedCheck.length > 0) {
                            parsedName_1 = parsedCheck[0].name.toLowerCase().trim();
                            isJustCategoryKeyword = categoryKeywords.some(function (kw) { return parsedName_1 === kw; });
                            if (!isJustCategoryKeyword && parsedName_1.length > 3) {
                                foundItem = findItemByNameFuzzy(deliveryData, parsedCheck[0].name);
                                if (foundItem) {
                                    console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] WANT_CATEGORY override \u00E2\u2020\u2019 WANT_TO_ORDER (item encontrado: ".concat(foundItem.name, ")"));
                                    intent = 'WANT_TO_ORDER';
                                }
                            }
                        }
                    }
                    console.log("\uD83C\uDF55 [DeliveryAI] Inten\u00E7\u00E3o detectada (com contexto): ".concat(intent));
                    if (interpretation) {
                        console.log("\uD83C\uDF55 [DeliveryAI] Planner normalizou mensagem para: \"".concat(executionMessage, "\""));
                        if (interpretation.categoryHint) {
                            console.log("\uD83C\uDF55 [DeliveryAI] Planner categoryHint: ".concat(interpretation.categoryHint));
                        }
                    }
                    return [4 /*yield*/, generateDeliveryResponse(userId, executionMessage, intent, deliveryData, conversationHistory === null || conversationHistory === void 0 ? void 0 : conversationHistory.map(function (m) { return "".concat(m.fromMe ? 'VocÃƒÂª' : 'Cliente', ": ").concat(m.text); }).join('\n'), customerPhone, conversationId, conversationHistory)];
                case 5:
                    response = _k.sent();
                    if ((interpretation === null || interpretation === void 0 ? void 0 : interpretation.categoryHint) && ['WANT_MENU', 'WANT_CATEGORY'].includes(response.intent)) {
                        response.metadata = __assign(__assign({}, response.metadata), { categoryRequested: interpretation.categoryHint });
                    }
                    menuSendMode = normalizeMenuSendMode(deliveryData.config.menu_send_mode);
                    isMenuDisplayIntent = ['WANT_MENU', 'WANT_CATEGORY', 'GREETING'].includes(response.intent);
                    if (menuSendMode !== 'text' && isMenuDisplayIntent) {
                        if (menuSendMode === 'image' && !((_d = response.metadata) === null || _d === void 0 ? void 0 : _d.categoryImageUrl)) {
                            requestedCategory = ((_e = response.metadata) === null || _e === void 0 ? void 0 : _e.categoryRequested) || detectCategoryFromMessage(executionMessage);
                            if (requestedCategory) {
                                matchedCategory = findMatchingCategory(deliveryData, requestedCategory);
                                if (matchedCategory === null || matchedCategory === void 0 ? void 0 : matchedCategory.image_url) {
                                    response.metadata = __assign(__assign({}, response.metadata), { categoryRequested: requestedCategory, categoryImageUrl: matchedCategory.image_url, categoryName: matchedCategory.name });
                                }
                            }
                        }
                        mediaActions = buildMenuMediaActions(deliveryData, response.intent, response.metadata);
                        if (menuSendMode === 'image' && ((_f = response.metadata) === null || _f === void 0 ? void 0 : _f.categoryImageUrl) && mediaActions.length === 0) {
                            mediaActions.push({
                                type: 'send_media_url',
                                media_url: response.metadata.categoryImageUrl,
                                media_type: 'image',
                                caption: response.metadata.categoryName || response.metadata.categoryRequested,
                            });
                        }
                        if (mediaActions.length > 0) {
                            response.mediaActions = mediaActions;
                            if (menuSendMode === 'image') {
                                // Ã°Å¸â€ â€¢ Para GREETING: manter a mensagem de boas-vindas + adicionar referÃƒÂªncia ÃƒÂ s imagens
                                // Para WANT_CATEGORY/WANT_MENU: substituir por texto de referÃƒÂªncia ÃƒÂ  imagem
                                if (response.intent === 'GREETING') {
                                    // MantÃƒÂ©m o texto de boas-vindas original e adiciona nota sobre as imagens
                                    response.bubbles = __spreadArray(__spreadArray([], response.bubbles, true), [
                                        "\u00F0\u0178\u201C\u00B7 Confira as imagens do card\u00C3\u00A1pio acima! \u00F0\u0178\u2018\u2020\n\nEscolha uma categoria para ver os itens! \u00F0\u0178\u02DC\u0160"
                                    ], false);
                                }
                                else {
                                    catName = ((_g = response.metadata) === null || _g === void 0 ? void 0 : _g.categoryName) || ((_h = response.metadata) === null || _h === void 0 ? void 0 : _h.categoryRequested) || 'CardÃƒÂ¡pio';
                                    response.bubbles = ["\u00F0\u0178\u201C\u00B7 *".concat(catName, "*\nConfira a imagem do card\u00C3\u00A1pio acima! \u00F0\u0178\u2018\u2020\n\nO que voc\u00C3\u00AA gostaria de pedir? \u00F0\u0178\u02DC\u0160")];
                                }
                            }
                        }
                    }
                    console.log("\u00F0\u0178\u008D\u2022 [DeliveryAI] Resposta gerada: ".concat(response.bubbles.length, " bolha(s)"));
                    response.bubbles.forEach(function (b, i) {
                        console.log("   Bolha ".concat(i + 1, ": ").concat(b.substring(0, 80), "..."));
                    });
                    response.bubbles = response.bubbles.map(function (bubble) { return sanitizeDeliveryText(bubble); });
                    if ((_j = response.mediaActions) === null || _j === void 0 ? void 0 : _j.length) {
                        response.mediaActions = response.mediaActions.map(function (action) { return (__assign(__assign({}, action), { caption: action.caption ? sanitizeDeliveryText(action.caption) : action.caption })); });
                    }
                    console.log("".concat('Ã¢â€¢Â'.repeat(60), "\n"));
                    return [2 /*return*/, response];
            }
        });
    });
}
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã°Å¸â€œÂ¤ EXPORT
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
exports.default = {
    processDeliveryMessage: processDeliveryMessage,
    detectCustomerIntent: detectCustomerIntent,
    detectIntentWithAI: detectIntentWithAI,
    isDeliveryEnabled: isDeliveryEnabled,
    getDeliveryData: getDeliveryData,
    formatMenuAsBubbles: formatMenuAsBubbles,
    findItemInMenu: findItemInMenu,
    findItemByNameFuzzy: findItemByNameFuzzy,
    detectCategoryContext: detectCategoryContext,
    validatePriceInResponse: validatePriceInResponse,
    isBusinessOpen: isBusinessOpen, // Verificar horÃƒÂ¡rio de funcionamento
    // Carrinho
    getCart: getCart,
    addToCart: addToCart,
    addCustomItemToCart: addCustomItemToCart,
    removeFromCart: removeFromCart,
    clearCart: clearCart,
    getCartSubtotal: getCartSubtotal,
    getCartTotal: getCartTotal,
    formatCartSummary: formatCartSummary,
    // Parse e pedidos
    parseOrderItems: parseOrderItems,
    processOrderFromMessage: processOrderFromMessage,
    confirmAndCreateOrder: confirmAndCreateOrder,
};

