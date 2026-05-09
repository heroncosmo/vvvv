"use strict";
/**
 * Módulo de Integração de Agendamento com IA
 *
 * Este módulo permite que o agente de IA:
 * 1. Detecte intenções de agendamento nas mensagens dos clientes
 * 2. Verifique horários disponíveis automaticamente
 * 3. Crie agendamentos pendentes para confirmação
 * 4. Responda sobre disponibilidade de forma inteligente
 *
 * OTIMIZAÇÕES:
 * - Cache em memória para configurações (reduz queries ao Supabase)
 * - Verificação de is_enabled ANTES de queries pesadas
 * - TTL de 5 minutos para cache de config
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateSchedulingCache = invalidateSchedulingCache;
exports.isSchedulingEnabled = isSchedulingEnabled;
exports.detectSchedulingIntent = detectSchedulingIntent;
exports.getSchedulingConfigCached = getSchedulingConfigCached;
exports.getSchedulingConfig = getSchedulingConfig;
exports.getExceptionForDate = getExceptionForDate;
exports.getAppointmentsForDate = getAppointmentsForDate;
exports.isDayAvailable = isDayAvailable;
exports.getAvailableSlots = getAvailableSlots;
exports.createPendingAppointment = createPendingAppointment;
exports.normalizeSchedulingTimeValue = normalizeSchedulingTimeValue;
exports.toDatabaseTimeString = toDatabaseTimeString;
exports.normalizeAppointmentDateValue = normalizeAppointmentDateValue;
exports.getNextAppointmentDateValue = getNextAppointmentDateValue;
exports.findExactAvailableSlot = findExactAvailableSlot;
exports.generateSchedulingPromptBlock = generateSchedulingPromptBlock;
exports.extractSchedulingTags = extractSchedulingTags;
exports.extractCancellationTags = extractCancellationTags;
exports.stripSchedulingTagArtifacts = stripSchedulingTagArtifacts;
exports.responseLooksLikeSuccessfulScheduling = responseLooksLikeSuccessfulScheduling;
exports.processSchedulingTags = processSchedulingTags;
exports.processSchedulingCancelTags = processSchedulingCancelTags;
exports.getNextAvailableSlots = getNextAvailableSlots;
exports.formatAvailableSlotsForAI = formatAvailableSlotsForAI;
var supabaseAuth_1 = require("./supabaseAuth");
var CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
var schedulingConfigCache = new Map();
/**
 * Limpa cache expirado periodicamente
 */
function cleanExpiredCache() {
    var now = Date.now();
    for (var _i = 0, _a = schedulingConfigCache.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], entry = _b[1];
        if (now - entry.timestamp > CACHE_TTL_MS) {
            schedulingConfigCache.delete(key);
        }
    }
}
// Limpar cache a cada 10 minutos
setInterval(cleanExpiredCache, 10 * 60 * 1000);
/**
 * Invalida o cache de um usuário específico
 * Chamar quando a configuração for alterada
 */
function invalidateSchedulingCache(userId) {
    schedulingConfigCache.delete(userId);
    console.log("\uD83D\uDDD1\uFE0F [Scheduling] Cache invalidado para user ".concat(userId));
}
/**
 * Verifica RAPIDAMENTE se o agendamento está habilitado (usa cache)
 * Esta função evita queries desnecessárias ao Supabase
 */
function isSchedulingEnabled(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var config;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getSchedulingConfigCached(userId)];
                case 1:
                    config = _a.sent();
                    return [2 /*return*/, (config === null || config === void 0 ? void 0 : config.is_enabled) === true];
            }
        });
    });
}
// Padrões de detecção de intenção de agendamento
var SCHEDULING_PATTERNS = {
    check_availability: [
        /tem hor[aá]rio/i,
        /hor[aá]rio dispon[ií]vel/i,
        /quando (pode|posso|consigo)/i,
        /qual hor[aá]rio/i,
        /tem vaga/i,
        /est[aá] dispon[ií]vel/i,
        /podemos marcar/i,
        /posso agendar/i,
        /agenda livre/i,
        /disponibilidade/i,
    ],
    // IMPORTANTE: reschedule deve vir ANTES de book_appointment para priorizar "reagendar"
    reschedule: [
        /remarcar/i,
        /reagendar/i,
        /trocar o hor[aá]rio/i,
        /mudar o hor[aá]rio/i,
        /alterar (o )?(meu )?agendamento/i,
        /outro hor[aá]rio/i,
    ],
    cancel_appointment: [
        /cancelar/i,
        /desmarcar/i,
        /n[aã]o vou (poder )?(ir|comparecer)/i,
        /n[aã]o posso (ir|comparecer)/i,
        /preciso cancelar/i,
    ],
    book_appointment: [
        /quero agendar/i,
        /quero marcar/i,
        /vou agendar/i,
        /pode agendar/i,
        /pode marcar/i,
        /reservar hor[aá]rio/i,
        /marcar um hor[aá]rio/i,
        /agendar para/i,
        /confirma o hor[aá]rio/i,
        /esse hor[aá]rio/i,
        /pode ser [àa]s/i,
    ],
    info: [
        /onde (fica|é|[eé] o endereço)/i,
        /qual o endereço/i,
        /como funciona/i,
        /quanto tempo (dura|demora)/i,
        /quanto custa/i,
        /pre[çc]o/i,
        /valor/i,
    ],
};
// Padrões para extrair data/hora
var DATE_PATTERNS = {
    today: /hoje/i,
    tomorrow: /amanh[ãa]/i,
    dayAfterTomorrow: /depois de amanh[ãa]/i,
    weekday: /(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)/i,
    specificDate: /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/,
    nextWeek: /semana que vem|pr[óo]xima semana/i,
};
var TIME_PATTERNS = {
    // Captura: 14:00, 14h, 14h30, 14:30, 14 horas
    specific: /(\d{1,2})(?:(?:h|:)(\d{2})|(:(\d{2}))|h)?\s*(hrs?|horas?)?/i,
    // Formato alternativo: 14h30 (sem : )
    withH: /(\d{1,2})h(\d{2})/i,
    morning: /manh[ãa]|de manh[ãa]/i,
    afternoon: /tarde|de tarde/i,
    evening: /noite|de noite/i,
};
/**
 * Detecta se uma mensagem contém intenção de agendamento
 */
function detectSchedulingIntent(message) {
    var result = {
        detected: false,
        type: null,
        confidence: 0,
    };
    var normalizedMsg = message.toLowerCase().trim();
    // Ordem específica para priorizar reschedule sobre book_appointment
    var orderedIntents = [
        'check_availability',
        'reschedule',
        'cancel_appointment',
        'book_appointment',
        'info'
    ];
    for (var _i = 0, orderedIntents_1 = orderedIntents; _i < orderedIntents_1.length; _i++) {
        var intentType = orderedIntents_1[_i];
        var patterns = SCHEDULING_PATTERNS[intentType];
        for (var _a = 0, patterns_1 = patterns; _a < patterns_1.length; _a++) {
            var pattern = patterns_1[_a];
            if (pattern.test(normalizedMsg)) {
                result.detected = true;
                result.type = intentType;
                result.confidence = 0.8; // Base confidence
                break;
            }
        }
        if (result.detected)
            break;
    }
    // Se não detectou intenção específica, verificar menção genérica
    if (!result.detected) {
        var genericPatterns = [
            /agend/i, /marc/i, /hor[áa]rio/i, /consulta/i, /atendimento/i
        ];
        for (var _b = 0, genericPatterns_1 = genericPatterns; _b < genericPatterns_1.length; _b++) {
            var pattern = genericPatterns_1[_b];
            if (pattern.test(normalizedMsg)) {
                result.detected = true;
                result.type = 'info';
                result.confidence = 0.5;
                break;
            }
        }
    }
    // Extrair data se possível
    if (result.detected) {
        result.requestedDate = extractDate(normalizedMsg);
        result.requestedTime = extractTime(normalizedMsg);
        // Aumentar confiança se tiver data/hora específica
        if (result.requestedDate)
            result.confidence += 0.1;
        if (result.requestedTime)
            result.confidence += 0.1;
    }
    return result;
}
/**
 * Extrai uma data da mensagem
 * IMPORTANTE: Verificar "depois de amanhã" ANTES de "amanhã" para evitar match parcial
 */
function extractDate(message) {
    var brazil = getBrazilDateTime();
    var today = brazil.date;
    // PRIMEIRO verificar "depois de amanhã" (mais específico)
    if (DATE_PATTERNS.dayAfterTomorrow.test(message)) {
        var dayAfter = new Date(today);
        dayAfter.setDate(dayAfter.getDate() + 2);
        return formatDate(dayAfter);
    }
    // DEPOIS verificar "amanhã"
    if (DATE_PATTERNS.tomorrow.test(message)) {
        var tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return formatDate(tomorrow);
    }
    if (DATE_PATTERNS.today.test(message)) {
        return formatDate(today);
    }
    var weekdayMatch = message.match(DATE_PATTERNS.weekday);
    if (weekdayMatch) {
        var weekdays = {
            'domingo': 0, 'segunda': 1, 'terca': 2, 'terça': 2,
            'quarta': 3, 'quinta': 4, 'sexta': 5, 'sabado': 6, 'sábado': 6
        };
        var targetDay = weekdays[weekdayMatch[1].toLowerCase()];
        if (targetDay !== undefined) {
            var brazil_1 = getBrazilDateTime();
            var date = new Date(brazil_1.date);
            var currentDay = date.getDay();
            var daysToAdd = targetDay - currentDay;
            if (daysToAdd <= 0)
                daysToAdd += 7;
            date.setDate(date.getDate() + daysToAdd);
            return formatDate(date);
        }
    }
    var specificMatch = message.match(DATE_PATTERNS.specificDate);
    if (specificMatch) {
        var brazil_2 = getBrazilDateTime();
        var day = parseInt(specificMatch[1]);
        var month = parseInt(specificMatch[2]) - 1;
        var year = specificMatch[3] ? parseInt(specificMatch[3]) : brazil_2.date.getFullYear();
        var fullYear = year < 100 ? 2000 + year : year;
        return formatDate(new Date(fullYear, month, day));
    }
    if (DATE_PATTERNS.nextWeek.test(message)) {
        var brazil_3 = getBrazilDateTime();
        var nextWeek = new Date(brazil_3.date);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return formatDate(nextWeek);
    }
    return undefined;
}
/**
 * Extrai uma hora da mensagem
 * Suporta: 14:00, 14h, 14h30, 14:30, 14 horas, manhã, tarde, noite
 */
function extractTime(message) {
    // Primeiro tentar formato XhYY (ex: 14h30, 10h45)
    var withHMatch = message.match(TIME_PATTERNS.withH);
    if (withHMatch) {
        var hour = parseInt(withHMatch[1]);
        var minutes = parseInt(withHMatch[2]);
        if (hour >= 0 && hour <= 23 && minutes >= 0 && minutes <= 59) {
            return "".concat(hour.toString().padStart(2, '0'), ":").concat(minutes.toString().padStart(2, '0'));
        }
    }
    // Depois tentar formato geral (14:00, 14h, 14 horas)
    var timeMatch = message.match(TIME_PATTERNS.specific);
    if (timeMatch) {
        var hour = parseInt(timeMatch[1]);
        // Capturar minutos de diferentes grupos
        var minutes = timeMatch[2] ? parseInt(timeMatch[2]) : (timeMatch[4] ? parseInt(timeMatch[4]) : 0);
        if (hour >= 0 && hour <= 23 && minutes >= 0 && minutes <= 59) {
            return "".concat(hour.toString().padStart(2, '0'), ":").concat(minutes.toString().padStart(2, '0'));
        }
    }
    // Horários aproximados
    if (TIME_PATTERNS.morning.test(message)) {
        return '09:00'; // Padrão para manhã
    }
    if (TIME_PATTERNS.afternoon.test(message)) {
        return '14:00'; // Padrão para tarde
    }
    if (TIME_PATTERNS.evening.test(message)) {
        return '19:00'; // Padrão para noite
    }
    return undefined;
}
function formatDate(date) {
    return "".concat(date.getFullYear(), "-").concat((date.getMonth() + 1).toString().padStart(2, '0'), "-").concat(date.getDate().toString().padStart(2, '0'));
}
/**
 * Busca a configuração de agendamento do usuário COM CACHE
 * Reduz Disk IO e Egress do Supabase
 */
function getSchedulingConfigCached(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var cached, _a, data, error, config, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    cached = schedulingConfigCache.get(userId);
                    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
                        return [2 /*return*/, cached.data];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('scheduling_config')
                            .select('*')
                            .eq('user_id', userId)
                            .single()];
                case 2:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    config = (error || !data) ? null : data;
                    // Salvar no cache
                    schedulingConfigCache.set(userId, {
                        data: config,
                        timestamp: Date.now()
                    });
                    return [2 /*return*/, config];
                case 3:
                    error_1 = _b.sent();
                    console.error('[Scheduling] Error fetching config:', error_1);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Busca a configuração de agendamento do usuário (sem cache - para compatibilidade)
 * @deprecated Use getSchedulingConfigCached para melhor performance
 */
function getSchedulingConfig(userId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, getSchedulingConfigCached(userId)];
        });
    });
}
/**
 * Busca exceções de agendamento para uma data
 */
function getExceptionForDate(userId, date) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error, error_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('scheduling_exceptions')
                            .select('*')
                            .eq('user_id', userId)
                            .eq('exception_date', date)
                            .single()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error || !data)
                        return [2 /*return*/, null];
                    return [2 /*return*/, data];
                case 2:
                    error_2 = _b.sent();
                    console.error('[Scheduling] Error fetching exception:', error_2);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Busca agendamentos existentes para uma data
 */
function getAppointmentsForDate(userId, date) {
    return __awaiter(this, void 0, void 0, function () {
        var normalizedDate, nextDate, _a, data, error, error_3;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    normalizedDate = normalizeAppointmentDateValue(date);
                    nextDate = getNextAppointmentDateValue(normalizedDate);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('appointments')
                            .select('*')
                            .eq('user_id', userId)
                            .gte('appointment_date', normalizedDate)
                            .lt('appointment_date', nextDate)
                            .in('status', ['pending', 'confirmed'])
                            .order('start_time', { ascending: true })];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error) {
                        console.error('[Scheduling] Error fetching appointments:', error);
                        return [2 /*return*/, []];
                    }
                    return [2 /*return*/, (data || []).map(function (appointment) { return (__assign(__assign({}, appointment), { appointment_date: normalizeAppointmentDateValue(appointment.appointment_date) })); })];
                case 2:
                    error_3 = _b.sent();
                    console.error('[Scheduling] Error fetching appointments:', error_3);
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Verifica se um dia específico está disponível para agendamento
 */
function isDayAvailable(date, config, exception) {
    var dateObj = new Date(date + 'T12:00:00');
    var dayOfWeek = dateObj.getDay();
    // Verificar se é um dia de exceção bloqueado
    if (exception && (exception.exception_type === 'blocked' || exception.exception_type === 'holiday')) {
        return false;
    }
    // Verificar se o dia da semana está nos dias disponíveis
    if (!config.available_days.includes(dayOfWeek)) {
        return false;
    }
    // Verificar se é futuro (não permitir agendamentos no passado) - usando timezone de São Paulo
    var brazil = getBrazilDateTime();
    var todayBrazil = new Date(brazil.dateStr + 'T00:00:00');
    var targetDate = new Date(date + 'T00:00:00');
    if (targetDate < todayBrazil) {
        return false;
    }
    // Verificar limite de antecedência
    var maxDate = new Date(todayBrazil);
    maxDate.setDate(maxDate.getDate() + config.advance_booking_days);
    if (targetDate > maxDate) {
        return false;
    }
    return true;
}
/**
 * Gera os slots de horário disponíveis para uma data
 * @param userId - ID do usuário
 * @param date - Data no formato YYYY-MM-DD
 * @param providedConfig - Config já buscada (opcional, evita query duplicada)
 */
function getAvailableSlots(userId, date, providedConfig) {
    return __awaiter(this, void 0, void 0, function () {
        var config, _a, exception, existingAppointments, startTime, endTime, slots, slotDuration, buffer, _b, startH, startM, _c, endH, endM, startMinutes, endMinutes, breakStartMinutes, breakEndMinutes, _d, bsH, bsM, _e, beH, beM, brazil, today, minSlotMinutes, currentMinutes_1, currentMinutes, appointmentCount, _loop_1, availableSlots;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    if (!(providedConfig !== null && providedConfig !== void 0)) return [3 /*break*/, 1];
                    _a = providedConfig;
                    return [3 /*break*/, 3];
                case 1: return [4 /*yield*/, getSchedulingConfigCached(userId)];
                case 2:
                    _a = _f.sent();
                    _f.label = 3;
                case 3:
                    config = _a;
                    console.log("\uD83D\uDCC5 [getAvailableSlots] Config para ".concat(userId, ":"), {
                        is_enabled: config === null || config === void 0 ? void 0 : config.is_enabled,
                        work_start_time: config === null || config === void 0 ? void 0 : config.work_start_time,
                        work_end_time: config === null || config === void 0 ? void 0 : config.work_end_time,
                        available_days: config === null || config === void 0 ? void 0 : config.available_days,
                        slot_duration: config === null || config === void 0 ? void 0 : config.slot_duration,
                        has_break: config === null || config === void 0 ? void 0 : config.has_break,
                        break_start: config === null || config === void 0 ? void 0 : config.break_start_time,
                        break_end: config === null || config === void 0 ? void 0 : config.break_end_time
                    });
                    if (!config || !config.is_enabled) {
                        console.log("\uD83D\uDCC5 [getAvailableSlots] \u274C Config n\u00E3o habilitada ou n\u00E3o encontrada");
                        return [2 /*return*/, []];
                    }
                    return [4 /*yield*/, getExceptionForDate(userId, date)];
                case 4:
                    exception = _f.sent();
                    if (!isDayAvailable(date, config, exception)) {
                        return [2 /*return*/, []];
                    }
                    return [4 /*yield*/, getAppointmentsForDate(userId, date)];
                case 5:
                    existingAppointments = _f.sent();
                    startTime = config.work_start_time;
                    endTime = config.work_end_time;
                    if ((exception === null || exception === void 0 ? void 0 : exception.exception_type) === 'modified_hours') {
                        startTime = exception.custom_start_time || startTime;
                        endTime = exception.custom_end_time || endTime;
                    }
                    slots = [];
                    slotDuration = config.slot_duration;
                    buffer = config.buffer_between_appointments;
                    _b = startTime.split(':').map(Number), startH = _b[0], startM = _b[1];
                    _c = endTime.split(':').map(Number), endH = _c[0], endM = _c[1];
                    startMinutes = startH * 60 + startM;
                    endMinutes = endH * 60 + endM;
                    if (endMinutes === 0 || (endMinutes > 0 && endMinutes <= startMinutes)) {
                        // Se end_time é 00:00 ou menor/igual ao start (ex: trabalhar até meia-noite)
                        endMinutes = 24 * 60; // 1440 = meia-noite
                    }
                    breakStartMinutes = 0;
                    breakEndMinutes = 0;
                    if (config.has_break && config.break_start_time && config.break_end_time) {
                        _d = config.break_start_time.split(':').map(Number), bsH = _d[0], bsM = _d[1];
                        _e = config.break_end_time.split(':').map(Number), beH = _e[0], beM = _e[1];
                        breakStartMinutes = bsH * 60 + bsM;
                        breakEndMinutes = beH * 60 + beM;
                    }
                    brazil = getBrazilDateTime();
                    today = brazil.dateStr;
                    minSlotMinutes = 0;
                    if (date === today) {
                        currentMinutes_1 = brazil.date.getHours() * 60 + brazil.date.getMinutes();
                        minSlotMinutes = currentMinutes_1 + (config.min_booking_notice_hours * 60);
                    }
                    currentMinutes = startMinutes;
                    appointmentCount = existingAppointments.length;
                    _loop_1 = function () {
                        var slotEndMinutes = currentMinutes + slotDuration;
                        // Verificar se está dentro do horário de pausa
                        var isInBreak = config.has_break &&
                            currentMinutes < breakEndMinutes &&
                            slotEndMinutes > breakStartMinutes;
                        // Verificar se respeita antecedência mínima
                        var respectsMinNotice = currentMinutes >= minSlotMinutes;
                        // Verificar se já atingiu limite diário
                        var underDailyLimit = appointmentCount < config.max_appointments_per_day;
                        // Verificar conflito com agendamentos existentes
                        var slotStartStr = minutesToTime(currentMinutes);
                        var slotEndStr = minutesToTime(slotEndMinutes);
                        var hasConflict = existingAppointments.some(function (apt) {
                            var aptStart = timeToMinutes(apt.start_time);
                            var aptEnd = timeToMinutes(apt.end_time);
                            return currentMinutes < aptEnd && slotEndMinutes > aptStart;
                        });
                        var available = !isInBreak && !hasConflict && respectsMinNotice && underDailyLimit;
                        slots.push({
                            start: slotStartStr,
                            end: slotEndStr,
                            available: available
                        });
                        currentMinutes += slotDuration + buffer;
                    };
                    while (currentMinutes + slotDuration <= endMinutes) {
                        _loop_1();
                    }
                    availableSlots = slots.filter(function (s) { return s.available; });
                    console.log("\uD83D\uDCC5 [getAvailableSlots] ".concat(date, ": Gerados ").concat(slots.length, " slots, ").concat(availableSlots.length, " dispon\u00EDveis"));
                    console.log("\uD83D\uDCC5 [getAvailableSlots] Slots dispon\u00EDveis:", availableSlots.map(function (s) { return s.start; }).slice(0, 10), availableSlots.length > 10 ? '...' : '');
                    return [2 /*return*/, slots];
            }
        });
    });
}
/**
 * Cria um agendamento pendente (para confirmação)
 * @param providedConfig - Config já buscada (opcional, evita query duplicada)
 */
function createPendingAppointment(userId, clientName, clientPhone, appointmentDate, startTime, clientNotes, providedConfig, serviceName, conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var config, _a, normalizedAppointmentDate, nextAppointmentDate, slots, selectedSlot_1, availableSlots, finalStartTime_1, normalizedClientPhone, startMinutes_1, endMinutes_1, endTime_1, dbStartTime, dbEndTime, _b, existingExactAppointments, existingExactAppointmentsError, existingExactAppointment, status_1, _c, data, error, error_4, selectedSlot, adjustedTime, requestedMinutes, availableSlots, TOLERANCE_MINUTES, closestSlot, minDiff, _i, availableSlots_1, slot, slotMinutes, diff, availableSlots, finalStartTime, startMinutes, endMinutes, endTime, status, _d, data, error, error_5;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    if (!(providedConfig !== null && providedConfig !== void 0)) return [3 /*break*/, 1];
                    _a = providedConfig;
                    return [3 /*break*/, 3];
                case 1: return [4 /*yield*/, getSchedulingConfigCached(userId)];
                case 2:
                    _a = _e.sent();
                    _e.label = 3;
                case 3:
                    config = _a;
                    if (!config || !config.is_enabled) {
                        return [2 /*return*/, { success: false, error: 'Sistema de agendamento desativado' }];
                    }
                    normalizedAppointmentDate = normalizeAppointmentDateValue(appointmentDate);
                    nextAppointmentDate = getNextAppointmentDateValue(normalizedAppointmentDate);
                    return [4 /*yield*/, getAvailableSlots(userId, normalizedAppointmentDate, config)];
                case 4:
                    slots = _e.sent();
                    selectedSlot_1 = findExactAvailableSlot(slots, startTime);
                    if (!selectedSlot_1) {
                        availableSlots = slots.filter(function (s) { return s.available; }).map(function (s) { return s.start; }).join(', ');
                        console.log("\u00F0\u0178\u201C\u2026 [Scheduling] Slot ".concat(startTime, " n\u00C3\u00A3o encontrado. Slots dispon\u00C3\u00ADveis: ").concat(availableSlots || 'nenhum'));
                        return [2 /*return*/, { success: false, error: 'HorÃ¡rio nÃ£o disponÃ­vel' }];
                    }
                    finalStartTime_1 = selectedSlot_1.start;
                    normalizedClientPhone = normalizePhoneForScheduling(clientPhone);
                    startMinutes_1 = timeToMinutes(finalStartTime_1);
                    endMinutes_1 = startMinutes_1 + config.slot_duration;
                    endTime_1 = minutesToTime(endMinutes_1);
                    dbStartTime = toDatabaseTimeString(finalStartTime_1);
                    dbEndTime = toDatabaseTimeString(endTime_1);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('appointments')
                            .select('*')
                            .eq('user_id', userId)
                            .gte('appointment_date', normalizedAppointmentDate)
                            .lt('appointment_date', nextAppointmentDate)
                            .eq('start_time', dbStartTime)
                            .eq('client_phone', normalizedClientPhone)
                            .in('status', ['pending', 'confirmed'])
                            .order('created_at', { ascending: false })
                            .limit(1)];
                case 5:
                    _b = _e.sent(), existingExactAppointments = _b.data, existingExactAppointmentsError = _b.error;
                    if (existingExactAppointmentsError) {
                        console.error('[Scheduling] Error checking existing appointment:', existingExactAppointmentsError);
                        return [2 /*return*/, { success: false, error: 'Erro ao criar agendamento' }];
                    }
                    existingExactAppointment = existingExactAppointments === null || existingExactAppointments === void 0 ? void 0 : existingExactAppointments[0];
                    if (existingExactAppointment) {
                        console.log("\u00F0\u0178\u201C\u2026 [Scheduling] Reaproveitando agendamento existente ".concat(existingExactAppointment.id, " para ").concat(normalizedClientPhone));
                        return [2 /*return*/, {
                                success: true,
                                appointment: __assign(__assign({}, existingExactAppointment), { appointment_date: normalizeAppointmentDateValue(existingExactAppointment.appointment_date) }),
                            }];
                    }
                    status_1 = config.auto_confirm ? 'confirmed' : 'pending';
                    _e.label = 6;
                case 6:
                    _e.trys.push([6, 10, , 11]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('appointments')
                            .insert({
                            user_id: userId,
                            conversation_id: conversationId || null,
                            client_name: clientName,
                            client_phone: normalizedClientPhone,
                            service_name: serviceName || config.service_name,
                            appointment_date: normalizedAppointmentDate,
                            start_time: dbStartTime,
                            end_time: dbEndTime,
                            duration_minutes: config.slot_duration,
                            location: config.location,
                            location_type: config.location_type,
                            status: status_1,
                            confirmed_by_client: false,
                            confirmed_by_business: config.auto_confirm,
                            created_by_ai: true,
                            client_notes: clientNotes,
                            reminder_sent: false,
                        })
                            .select()
                            .single()];
                case 7:
                    _c = _e.sent(), data = _c.data, error = _c.error;
                    if (error) {
                        console.error('[Scheduling] Error creating appointment:', error);
                        return [2 /*return*/, { success: false, error: 'Erro ao criar agendamento' }];
                    }
                    if (!conversationId) return [3 /*break*/, 9];
                    return [4 /*yield*/, cancelSupersededConversationAppointments({
                            userId: userId,
                            conversationId: conversationId,
                            clientPhone: normalizedClientPhone,
                            appointmentDate: normalizedAppointmentDate,
                            keepAppointmentId: data.id,
                        })];
                case 8:
                    _e.sent();
                    _e.label = 9;
                case 9: return [2 /*return*/, {
                        success: true,
                        appointment: __assign(__assign({}, data), { appointment_date: normalizeAppointmentDateValue(data.appointment_date) }),
                    }];
                case 10:
                    error_4 = _e.sent();
                    console.error('[Scheduling] Error creating appointment:', error_4);
                    return [2 /*return*/, { success: false, error: 'Erro ao criar agendamento' }];
                case 11:
                    selectedSlot = slots.find(function (s) { return s.start === startTime && s.available; });
                    // Se não encontrou slot exato, procurar o mais próximo disponível
                    if (!selectedSlot) {
                        requestedMinutes = timeToMinutes(startTime);
                        availableSlots = slots.filter(function (s) { return s.available; });
                        if (availableSlots.length > 0) {
                            TOLERANCE_MINUTES = 30;
                            closestSlot = null;
                            minDiff = Infinity;
                            for (_i = 0, availableSlots_1 = availableSlots; _i < availableSlots_1.length; _i++) {
                                slot = availableSlots_1[_i];
                                slotMinutes = timeToMinutes(slot.start);
                                diff = Math.abs(slotMinutes - requestedMinutes);
                                if (diff <= TOLERANCE_MINUTES && diff < minDiff) {
                                    minDiff = diff;
                                    closestSlot = slot;
                                }
                            }
                            if (closestSlot) {
                                selectedSlot = closestSlot;
                                adjustedTime = closestSlot.start;
                                console.log("\uD83D\uDCC5 [Scheduling] Hor\u00E1rio ".concat(startTime, " n\u00E3o dispon\u00EDvel, ajustado para ").concat(adjustedTime, " (diferen\u00E7a: ").concat(minDiff, "min)"));
                            }
                        }
                    }
                    if (!selectedSlot) {
                        availableSlots = slots.filter(function (s) { return s.available; }).map(function (s) { return s.start; }).join(', ');
                        console.log("\uD83D\uDCC5 [Scheduling] Slot ".concat(startTime, " n\u00E3o encontrado. Slots dispon\u00EDveis: ").concat(availableSlots || 'nenhum'));
                        return [2 /*return*/, { success: false, error: 'Horário não disponível' }];
                    }
                    finalStartTime = selectedSlot.start;
                    startMinutes = timeToMinutes(finalStartTime);
                    endMinutes = startMinutes + config.slot_duration;
                    endTime = minutesToTime(endMinutes);
                    status = config.auto_confirm ? 'confirmed' : 'pending';
                    _e.label = 12;
                case 12:
                    _e.trys.push([12, 14, , 15]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('appointments')
                            .insert({
                            user_id: userId,
                            client_name: clientName,
                            client_phone: clientPhone,
                            service_name: serviceName || config.service_name,
                            appointment_date: normalizedAppointmentDate,
                            start_time: finalStartTime,
                            end_time: endTime,
                            duration_minutes: config.slot_duration,
                            location: config.location,
                            location_type: config.location_type,
                            status: status,
                            confirmed_by_client: false,
                            confirmed_by_business: config.auto_confirm,
                            created_by_ai: true,
                            client_notes: clientNotes,
                            reminder_sent: false,
                        })
                            .select()
                            .single()];
                case 13:
                    _d = _e.sent(), data = _d.data, error = _d.error;
                    if (error) {
                        console.error('[Scheduling] Error creating appointment:', error);
                        return [2 /*return*/, { success: false, error: 'Erro ao criar agendamento' }];
                    }
                    return [2 /*return*/, {
                            success: true,
                            appointment: __assign(__assign({}, data), { appointment_date: normalizeAppointmentDateValue(data.appointment_date) }),
                            adjustedTime: adjustedTime,
                        }];
                case 14:
                    error_5 = _e.sent();
                    console.error('[Scheduling] Error creating appointment:', error_5);
                    return [2 /*return*/, { success: false, error: 'Erro ao criar agendamento' }];
                case 15: return [2 /*return*/];
            }
        });
    });
}
function normalizeSchedulingTimeValue(time) {
    var _a = String(time || '').trim().split(':'), _b = _a[0], rawHours = _b === void 0 ? '0' : _b, _c = _a[1], rawMinutes = _c === void 0 ? '0' : _c;
    var hours = Number(rawHours);
    var minutes = Number(rawMinutes);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return String(time || '').trim();
    }
    return "".concat(hours.toString().padStart(2, '0'), ":").concat(minutes.toString().padStart(2, '0'));
}
function toDatabaseTimeString(time) {
    return "".concat(normalizeSchedulingTimeValue(time), ":00");
}
function normalizeAppointmentDateValue(value) {
    var trimmedValue = String(value || '').trim();
    if (!trimmedValue) {
        return '';
    }
    var datePrefixMatch = trimmedValue.match(/^(\d{4}-\d{2}-\d{2})/);
    if (datePrefixMatch === null || datePrefixMatch === void 0 ? void 0 : datePrefixMatch[1]) {
        return datePrefixMatch[1];
    }
    var parsedDate = new Date(trimmedValue);
    if (Number.isNaN(parsedDate.getTime())) {
        return trimmedValue;
    }
    var year = parsedDate.getUTCFullYear();
    var month = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
    var day = String(parsedDate.getUTCDate()).padStart(2, '0');
    return "".concat(year, "-").concat(month, "-").concat(day);
}
function getNextAppointmentDateValue(value) {
    var normalizedDate = normalizeAppointmentDateValue(value);
    var _a = normalizedDate.split('-').map(Number), rawYear = _a[0], rawMonth = _a[1], rawDay = _a[2];
    if (!Number.isFinite(rawYear) ||
        !Number.isFinite(rawMonth) ||
        !Number.isFinite(rawDay)) {
        return normalizedDate;
    }
    var nextDate = new Date(Date.UTC(rawYear, rawMonth - 1, rawDay));
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    var year = nextDate.getUTCFullYear();
    var month = String(nextDate.getUTCMonth() + 1).padStart(2, '0');
    var day = String(nextDate.getUTCDate()).padStart(2, '0');
    return "".concat(year, "-").concat(month, "-").concat(day);
}
function findExactAvailableSlot(slots, requestedStartTime) {
    var normalizedRequestedTime = normalizeSchedulingTimeValue(requestedStartTime);
    return slots.find(function (slot) { return slot.available && normalizeSchedulingTimeValue(slot.start) === normalizedRequestedTime; });
}
function normalizePhoneForScheduling(phone) {
    return String(phone || '').trim();
}
function cancelSupersededConversationAppointments(params) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, conversationId, clientPhone, appointmentDate, keepAppointmentId, error;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    userId = params.userId, conversationId = params.conversationId, clientPhone = params.clientPhone, appointmentDate = params.appointmentDate, keepAppointmentId = params.keepAppointmentId;
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('appointments')
                            .update({
                            status: 'cancelled',
                            cancelled_at: new Date().toISOString(),
                            cancelled_by: 'ai',
                            cancellation_reason: 'Substituído por novo horário confirmado na mesma conversa',
                            updated_at: new Date().toISOString(),
                        })
                            .eq('user_id', userId)
                            .eq('conversation_id', conversationId)
                            .gte('appointment_date', normalizeAppointmentDateValue(appointmentDate))
                            .lt('appointment_date', getNextAppointmentDateValue(appointmentDate))
                            .eq('client_phone', clientPhone)
                            .eq('created_by_ai', true)
                            .eq('status', 'pending')
                            .neq('id', keepAppointmentId)];
                case 1:
                    error = (_a.sent()).error;
                    if (error) {
                        console.error('[Scheduling] Error cancelling superseded appointments:', error);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function timeToMinutes(time) {
    var _a = time.split(':').map(Number), h = _a[0], m = _a[1];
    return h * 60 + m;
}
function minutesToTime(minutes) {
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return "".concat(h.toString().padStart(2, '0'), ":").concat(m.toString().padStart(2, '0'));
}
/**
 * Gera o bloco de prompt para o agente de IA sobre agendamentos
 */
// Helper para obter data/hora no timezone de São Paulo
function getBrazilDateTime() {
    var now = new Date();
    // Converte para São Paulo (UTC-3)
    var brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    var dateStr = "".concat(brazilTime.getFullYear(), "-").concat((brazilTime.getMonth() + 1).toString().padStart(2, '0'), "-").concat(brazilTime.getDate().toString().padStart(2, '0'));
    var timeStr = "".concat(String(brazilTime.getHours()).padStart(2, '0'), ":").concat(String(brazilTime.getMinutes()).padStart(2, '0'));
    return { date: brazilTime, dateStr: dateStr, timeStr: timeStr };
}
function generateSchedulingPromptBlock(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var config, daysMap, availableDaysText, breakText, brazil, todayStr, todayDayName, currentTime, tomorrow, tomorrowStr, tomorrowDayName, todaySlots, tomorrowSlots, todaySlotsAvailable, tomorrowSlotsAvailable, todayAvailable, tomorrowAvailable, todayException, tomorrowException, todayInfo, reason, tomorrowInfo, reason, cancellationInfo, servicesText, services, e_1, currentMinutes, minBookingMinutes, minBookingTime, noticeText;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getSchedulingConfigCached(userId)];
                case 1:
                    config = _a.sent();
                    if (!config || !config.is_enabled) {
                        return [2 /*return*/, ''];
                    }
                    daysMap = {
                        0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta',
                        4: 'Quinta', 5: 'Sexta', 6: 'Sábado'
                    };
                    availableDaysText = config.available_days.map(function (d) { return daysMap[d]; }).join(', ');
                    breakText = '';
                    if (config.has_break) {
                        breakText = " (pausa ".concat(config.break_start_time, "-").concat(config.break_end_time, ")");
                    }
                    brazil = getBrazilDateTime();
                    todayStr = brazil.dateStr;
                    todayDayName = daysMap[brazil.date.getDay()];
                    currentTime = brazil.timeStr;
                    tomorrow = new Date(brazil.date);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrowStr = "".concat(tomorrow.getFullYear(), "-").concat((tomorrow.getMonth() + 1).toString().padStart(2, '0'), "-").concat(tomorrow.getDate().toString().padStart(2, '0'));
                    tomorrowDayName = daysMap[tomorrow.getDay()];
                    return [4 /*yield*/, getAvailableSlots(userId, todayStr, config)];
                case 2:
                    todaySlots = _a.sent();
                    return [4 /*yield*/, getAvailableSlots(userId, tomorrowStr, config)];
                case 3:
                    tomorrowSlots = _a.sent();
                    todaySlotsAvailable = todaySlots.filter(function (s) { return s.available; }).map(function (s) { return s.start; });
                    tomorrowSlotsAvailable = tomorrowSlots.filter(function (s) { return s.available; }).map(function (s) { return s.start; });
                    todayAvailable = config.available_days.includes(brazil.date.getDay());
                    tomorrowAvailable = config.available_days.includes(tomorrow.getDay());
                    return [4 /*yield*/, getExceptionForDate(userId, todayStr)];
                case 4:
                    todayException = _a.sent();
                    return [4 /*yield*/, getExceptionForDate(userId, tomorrowStr)];
                case 5:
                    tomorrowException = _a.sent();
                    todayInfo = '';
                    if (todayException && (todayException.exception_type === 'blocked' || todayException.exception_type === 'holiday')) {
                        reason = todayException.reason || (todayException.exception_type === 'holiday' ? 'feriado' : 'dia de folga');
                        todayInfo = "Hoje (".concat(todayDayName, "): N\u00C3O ATENDEMOS (").concat(reason, ")");
                    }
                    else if (!todayAvailable) {
                        todayInfo = "Hoje (".concat(todayDayName, "): n\u00E3o atendemos neste dia da semana");
                    }
                    else if (todaySlotsAvailable.length === 0) {
                        todayInfo = "Hoje: hor\u00E1rios esgotados ou j\u00E1 passaram";
                    }
                    else {
                        todayInfo = "Hoje: ".concat(todaySlotsAvailable.join(', '));
                    }
                    tomorrowInfo = '';
                    if (tomorrowException && (tomorrowException.exception_type === 'blocked' || tomorrowException.exception_type === 'holiday')) {
                        reason = tomorrowException.reason || (tomorrowException.exception_type === 'holiday' ? 'feriado' : 'dia de folga');
                        tomorrowInfo = "Amanh\u00E3 (".concat(tomorrowDayName, "): N\u00C3O ATENDEMOS (").concat(reason, ")");
                    }
                    else if (!tomorrowAvailable) {
                        tomorrowInfo = "Amanh\u00E3 (".concat(tomorrowDayName, "): n\u00E3o atendemos neste dia da semana");
                    }
                    else if (tomorrowSlotsAvailable.length === 0) {
                        tomorrowInfo = "Amanh\u00E3: lotado";
                    }
                    else {
                        tomorrowInfo = "Amanh\u00E3: ".concat(tomorrowSlotsAvailable.join(', '));
                    }
                    cancellationInfo = config.allow_cancellation
                        ? 'O cliente pode cancelar seu agendamento a qualquer momento.'
                        : 'O cliente NÃO pode cancelar pelo chat. Para cancelamentos, deve entrar em contato por outro meio.';
                    servicesText = '';
                    _a.label = 6;
                case 6:
                    _a.trys.push([6, 8, , 9]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('scheduling_services')
                            .select('name, description, duration_minutes, price, is_active')
                            .eq('user_id', userId)
                            .eq('is_active', true)
                            .order('display_order', { ascending: true })];
                case 7:
                    services = (_a.sent()).data;
                    if (services && services.length > 0) {
                        servicesText = "\n\nSERVI\u00C7OS DISPON\u00CDVEIS:\n".concat(services.map(function (s) {
                            var line = "\u2022 ".concat(s.name);
                            if (s.duration_minutes)
                                line += " (".concat(s.duration_minutes, " min)");
                            if (s.price)
                                line += " - R$ ".concat(Number(s.price).toFixed(2).replace('.', ','));
                            if (s.description)
                                line += " - ".concat(s.description);
                            return line;
                        }).join('\n'), "\nSempre pergunte qual servi\u00E7o o cliente deseja ao agendar!");
                    }
                    return [3 /*break*/, 9];
                case 8:
                    e_1 = _a.sent();
                    return [3 /*break*/, 9];
                case 9:
                    currentMinutes = brazil.date.getHours() * 60 + brazil.date.getMinutes();
                    minBookingMinutes = currentMinutes + (config.min_booking_notice_hours * 60);
                    minBookingTime = minutesToTime(minBookingMinutes > 24 * 60 ? 24 * 60 : minBookingMinutes);
                    noticeText = config.min_booking_notice_hours > 0
                        ? "\n\u23F0 ANTECED\u00CANCIA M\u00CDNIMA: ".concat(config.min_booking_notice_hours, "h (para hoje, s\u00F3 hor\u00E1rios a partir de ").concat(minBookingTime, ")")
                        : '';
                    return [2 /*return*/, "\n---\n\uD83D\uDCC5 RECURSO DE AGENDAMENTO ATIVO\nAgora: ".concat(todayStr, " ").concat(currentTime, " | Atendimento: ").concat(availableDaysText, ", ").concat(config.work_start_time, "-").concat(config.work_end_time).concat(breakText).concat(noticeText, "\n").concat(servicesText, "\n\nHOR\u00C1RIOS DISPON\u00CDVEIS (ATUALIZADOS EM TEMPO REAL):\n\u2022 ").concat(todayInfo, "\n\u2022 ").concat(tomorrowInfo, "\n\nCOMO RESPONDER QUANDO O HOR\u00C1RIO PEDIDO N\u00C3O EST\u00C1 DISPON\u00CDVEL:\n- Por anteced\u00EAncia: \"Para hoje precisamos de ").concat(config.min_booking_notice_hours, "h de anteced\u00EAncia. O pr\u00F3ximo hor\u00E1rio dispon\u00EDvel \u00E9 [hor\u00E1rio da lista].\"\n- Se ocupado/lotado: \"Esse hor\u00E1rio j\u00E1 est\u00E1 reservado. Temos dispon\u00EDvel: [hor\u00E1rios da lista].\"\n- Fora do expediente: \"Nosso hor\u00E1rio \u00E9 das ").concat(config.work_start_time, " \u00E0s ").concat(config.work_end_time, ". Temos dispon\u00EDvel: [hor\u00E1rios da lista].\"\n- Dia de folga/feriado: Se o dia estiver marcado como \"N\u00C3O ATENDEMOS\", explique o motivo entre par\u00EAnteses e sugira o pr\u00F3ximo dia com disponibilidade.\n- Sempre ofere\u00E7a o PR\u00D3XIMO hor\u00E1rio/dia dispon\u00EDvel!\n\nPOL\u00CDTICA DE CANCELAMENTO:\n").concat(cancellationInfo, "\n\n\u26A0\uFE0F REGRA CR\u00CDTICA DE AGENDAMENTO:\nPARA CADA CLIENTE diferente que quiser agendar, voc\u00EA DEVE usar a tag [AGENDAR:].\nA tag \u00E9 o que REALMENTE cria o agendamento no sistema.\nSem a tag = sem agendamento = cliente n\u00E3o vai receber confirma\u00E7\u00E3o/lembrete!\n\nCOMO USAR:\n[AGENDAR: DATA=YYYY-MM-DD, HORA=HH:MM, NOME=Nome do Cliente, SERVICO=Nome do Servi\u00E7o]\n\nExemplos:\n- Hoje: DATA=").concat(todayStr, "\n- Amanh\u00E3: DATA=").concat(tomorrowStr, "\n\nFLUXO DE AGENDAMENTO:\n1. Cliente pergunta hor\u00E1rios \u2192 Diga as op\u00E7\u00F5es dispon\u00EDveis acima\n2. Cliente escolhe hor\u00E1rio \u2192 Pe\u00E7a o nome e o servi\u00E7o desejado\n3. Tem hor\u00E1rio, nome E servi\u00E7o \u2192 USE A TAG! Ex: [AGENDAR: DATA=").concat(tomorrowStr, ", HORA=10:15, NOME=Jo\u00E3o, SERVICO=Consulta]\n\nDepois da tag, converse naturalmente sobre o agendamento.\n\n\u26A0\uFE0F REGRA CR\u00CDTICA DE CANCELAMENTO:\nQuando o cliente pedir para CANCELAR um agendamento, voc\u00EA DEVE usar a tag [CANCELAR:].\nSem a tag = o agendamento N\u00C3O ser\u00E1 realmente cancelado no sistema!\n\nCOMO USAR:\n[CANCELAR: DATA=YYYY-MM-DD, HORA=HH:MM, NOME=Nome do Cliente]\n\nFLUXO DE CANCELAMENTO:\n1. Cliente pede para cancelar \u2192 Confirme os dados do agendamento\n2. Ap\u00F3s confirma\u00E7\u00E3o \u2192 USE A TAG! Ex: [CANCELAR: DATA=").concat(tomorrowStr, ", HORA=10:15, NOME=Jo\u00E3o]\n3. Ap\u00F3s a tag, ofere\u00E7a remarcar para outro hor\u00E1rio dispon\u00EDvel.\n---\n")];
            }
        });
    });
}
function extractSchedulingTags(responseText) {
    var tagRegex = /\[AGENDAR:\s*([^\]]+)\]/gi;
    var tags = [];
    var match = tagRegex.exec(responseText);
    while (match) {
        var raw = match[0];
        var body = match[1];
        var date = extractSchedulingTagField(body, 'DATA');
        var time = extractSchedulingTagField(body, 'HORA');
        var clientName = extractSchedulingTagField(body, 'NOME');
        var serviceName = extractSchedulingTagField(body, 'SERVICO', true);
        if (date && time && clientName) {
            tags.push({
                raw: raw,
                date: date,
                time: normalizeSchedulingTimeValue(time),
                clientName: clientName,
                serviceName: serviceName || undefined,
            });
        }
        match = tagRegex.exec(responseText);
    }
    return tags;
}
function extractCancellationTags(responseText) {
    var tagRegex = /\[CANCELAR:\s*([^\]]+)\]/gi;
    var tags = [];
    var match = tagRegex.exec(responseText);
    while (match) {
        var raw = match[0];
        var body = match[1];
        var date = extractSchedulingTagField(body, 'DATA');
        var time = extractSchedulingTagField(body, 'HORA');
        var clientName = extractSchedulingTagField(body, 'NOME');
        if (date && time && clientName) {
            tags.push({
                raw: raw,
                date: date,
                time: normalizeSchedulingTimeValue(time),
                clientName: clientName,
            });
        }
        match = tagRegex.exec(responseText);
    }
    return tags;
}
function stripSchedulingTagArtifacts(text) {
    return text
        .replace(/\[(?:AGENDAR|CANCELAR):[^\]]*\]/gi, '')
        .replace(/\[(?:AGENDAR|CANCELAR):[^\n]*(?:\n|$)/gi, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
function extractSchedulingTagField(body, key, allowEmpty) {
    var _a, _b;
    if (allowEmpty === void 0) { allowEmpty = false; }
    var regex = new RegExp("".concat(key, "=((?:\"[^\"]*\")|(?:[^,\\]]*))"), 'i');
    var match = body.match(regex);
    if (!match) {
        return undefined;
    }
    var rawValue = (_b = (_a = match[1]) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : '';
    var normalizedValue = rawValue.replace(/^"(.*)"$/, '$1').trim();
    if (!allowEmpty && !normalizedValue) {
        return undefined;
    }
    return normalizedValue;
}
function responseLooksLikeSuccessfulScheduling(text) {
    var normalizedText = stripSchedulingTagArtifacts(String(text || ''))
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalizedText) {
        return false;
    }
    var confirmationPatterns = [
        /seu\s+agendamento\s+est[aá].{0,40}(confirmado|garantido|registrado)/i,
        /agendamento\s+est[aá].{0,40}(confirmado|garantido|registrado)/i,
        /hor[aá]rio\s+est[aá].{0,30}(confirmado|garantido|reservado|agendado)/i,
        /hor[aá]rio\s+foi\s+(confirmado|reservado|marcado|agendado)/i,
        /agendamento\s+(realizado|confirmado|feito|registrado)/i,
        /ficou\s+(agendado|marcado|reservado)/i,
        /registrad[oa]\s+na\s+agenda/i,
        /(já|ja)\s+registr(?:ei|ado)/i,
        /(vou|vamo?s)\s+registrar(\s+na\s+agenda)?/i,
        /(vou|vamo?s)\s+reservar\s+seu\s+hor[aá]rio/i,
        /reservei\s+seu\s+hor[aá]rio/i,
        /agendei\s+(para|seu)/i,
        /confirmei\s+seu\s+hor[aá]rio/i,
        /acabei\s+de\s+registrar/i,
        /acabei\s+de\s+verificar\s+e\s+o\s+hor[aá]rio.{0,40}est[aá]\s+dispon[ií]vel/i,
        /100%\s+confirmado/i,
        /pronto!\s*seu\s+hor[aá]rio/i,
        /vou\s+registrar\s+na\s+agenda\s+agora\s+mesmo/i,
    ];
    return confirmationPatterns.some(function (pattern) { return pattern.test(normalizedText); });
}
/**
 * Processa tags de agendamento na resposta da IA
 */
function processSchedulingTags(responseText, userId, clientPhone, conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var schedulingTagRegex, match, modifiedText, appointmentCreated, schedulingTags, parsedText, parsedAppointmentCreated, parsedSchedulingConfig, e_2, _i, schedulingTags_1, schedulingTag, raw, date, time, clientName, serviceName, result, requestedDate, savedDate, requestedTime, savedTime, normalizedServiceName, trimmed, trimmedMsg, confirmacaoPatterns, mensagemParecioConfirmacao, errorMessage, schedulingConfig, e_3, fullMatch, date, time, clientName, serviceName, result, trimmed, trimmedMsg, confirmacaoPatterns, mensagemParecioConfirmacao, errorMessage;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    schedulingTagRegex = /\[AGENDAR:\s*DATA=(\d{4}-\d{2}-\d{2}),\s*HORA=(\d{2}:\d{2}),\s*NOME=([^,\]]+)(?:,\s*SERVICO=([^\]]+))?\]/gi;
                    match = schedulingTagRegex.exec(responseText);
                    modifiedText = responseText;
                    schedulingTags = extractSchedulingTags(responseText);
                    parsedText = responseText;
                    parsedAppointmentCreated = void 0;
                    parsedSchedulingConfig = null;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, getSchedulingConfigCached(userId)];
                case 2:
                    parsedSchedulingConfig = _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    e_2 = _a.sent();
                    console.error('ðŸ“… [Scheduling] Error fetching config:', e_2);
                    return [3 /*break*/, 4];
                case 4:
                    _i = 0, schedulingTags_1 = schedulingTags;
                    _a.label = 5;
                case 5:
                    if (!(_i < schedulingTags_1.length)) return [3 /*break*/, 8];
                    schedulingTag = schedulingTags_1[_i];
                    raw = schedulingTag.raw, date = schedulingTag.date, time = schedulingTag.time, clientName = schedulingTag.clientName, serviceName = schedulingTag.serviceName;
                    console.log("\u00F0\u0178\u201C\u2026 [Scheduling] Detected scheduling tag: ".concat(raw));
                    return [4 /*yield*/, createPendingAppointment(userId, clientName.trim(), clientPhone, date, time, undefined, parsedSchedulingConfig, serviceName === null || serviceName === void 0 ? void 0 : serviceName.trim(), conversationId)];
                case 6:
                    result = _a.sent();
                    if (result.success && result.appointment) {
                        console.log("\u00E2\u0153\u2026 [Scheduling] Appointment created: ".concat(result.appointment.id));
                        parsedAppointmentCreated = result.appointment;
                        parsedText = parsedText.replace(raw, '');
                        requestedDate = normalizeAppointmentDateValue(date);
                        savedDate = normalizeAppointmentDateValue(result.appointment.appointment_date);
                        requestedTime = normalizeSchedulingTimeValue(time);
                        savedTime = normalizeSchedulingTimeValue(result.appointment.start_time);
                        normalizedServiceName = String(result.appointment.service_name || serviceName || (parsedSchedulingConfig === null || parsedSchedulingConfig === void 0 ? void 0 : parsedSchedulingConfig.service_name) || '').trim();
                        if (savedDate !== requestedDate || savedTime !== requestedTime) {
                            parsedText = "Perfeito! Seu horario foi registrado na agenda para ".concat(savedDate, " as ").concat(savedTime, ".");
                            if (normalizedServiceName) {
                                parsedText += " Servico: ".concat(normalizedServiceName, ".");
                            }
                            parsedText += ' ✅';
                            return [3 /*break*/, 7];
                        }
                        trimmed = parsedText.trim();
                        if (!trimmed.endsWith('âœ…') && !trimmed.endsWith('ðŸ“…') && !trimmed.endsWith('ðŸ‘') && !trimmed.endsWith('ðŸ˜Š')) {
                            parsedText = trimmed + ' âœ…';
                        }
                        return [3 /*break*/, 7];
                    }
                    console.log("\u00E2\u009D\u0152 [Scheduling] Failed to create appointment: ".concat(result.error));
                    parsedText = parsedText.replace(raw, '');
                    trimmedMsg = parsedText.trim();
                    confirmacaoPatterns = [
                        /reservei\s+seu\s+hor[aÃ¡]rio/i,
                        /agendei\s+(para|seu)/i,
                        /hor[aÃ¡]rio\s+(confirmado|reservado|agendado)/i,
                        /agendamento\s+(realizado|confirmado|feito)/i,
                        /ficou\s+(agendado|marcado|reservado)/i,
                        /confirmei\s+seu\s+hor[aÃ¡]rio/i,
                        /vou\s+reservar\s+seu\s+hor[aÃ¡]rio/i,
                        /reservando\s+seu\s+hor[aÃ¡]rio/i,
                        /seu\s+hor[aÃ¡]rio\s+(estÃ¡|foi)\s+(reservado|marcado|agendado)/i,
                    ];
                    mensagemParecioConfirmacao = responseLooksLikeSuccessfulScheduling(trimmedMsg);
                    errorMessage = void 0;
                    if (result.error === 'HorÃ¡rio nÃ£o disponÃ­vel') {
                        errorMessage = "Opa! Infelizmente esse hor\u00C3\u00A1rio (".concat(time, " de ").concat(date, ") n\u00C3\u00A3o est\u00C3\u00A1 dispon\u00C3\u00ADvel para agendamento. \u00F0\u0178\u02DC\u2022 Pode me informar outro hor\u00C3\u00A1rio ou data de prefer\u00C3\u00AAncia? Vou verificar a disponibilidade! \u00F0\u0178\u02DC\u0160");
                    }
                    else if (result.error === 'Sistema de agendamento desativado') {
                        errorMessage = "O sistema de agendamento est\u00C3\u00A1 desativado no momento. Por favor, entre em contato diretamente para marcar seu hor\u00C3\u00A1rio! \u00F0\u0178\u02DC\u0160";
                    }
                    else {
                        errorMessage = "Puxa, tive um problema t\u00C3\u00A9cnico ao registrar o hor\u00C3\u00A1rio ".concat(time, " de ").concat(date, ". \u00F0\u0178\u02DC\u2026 Por favor, confirme a data e hor\u00C3\u00A1rio novamente para eu tentar salvar!");
                    }
                    if (trimmedMsg === '' || mensagemParecioConfirmacao) {
                        parsedText = errorMessage;
                        console.log("\u00F0\u0178\u201C\u2026 [Scheduling] \u00E2\u0161\u00A0\u00EF\u00B8\u008F Mensagem de confirma\u00C3\u00A7\u00C3\u00A3o falsa detectada e substitu\u00C3\u00ADda por erro");
                    }
                    else {
                        parsedText = trimmedMsg + "\n\n\u00E2\u0161\u00A0\u00EF\u00B8\u008F ".concat(errorMessage);
                    }
                    _a.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8: return [2 /*return*/, { text: stripSchedulingTagArtifacts(parsedText), appointmentCreated: parsedAppointmentCreated }];
                case 9:
                    _a.trys.push([9, 11, , 12]);
                    return [4 /*yield*/, getSchedulingConfigCached(userId)];
                case 10:
                    schedulingConfig = _a.sent();
                    return [3 /*break*/, 12];
                case 11:
                    e_3 = _a.sent();
                    console.error('📅 [Scheduling] Error fetching config:', e_3);
                    return [3 /*break*/, 12];
                case 12:
                    if (!match) return [3 /*break*/, 14];
                    fullMatch = match[0], date = match[1], time = match[2], clientName = match[3], serviceName = match[4];
                    console.log("\uD83D\uDCC5 [Scheduling] Detected scheduling tag: ".concat(fullMatch));
                    return [4 /*yield*/, createPendingAppointment(userId, clientName.trim(), clientPhone, date, time, undefined, schedulingConfig, serviceName === null || serviceName === void 0 ? void 0 : serviceName.trim())];
                case 13:
                    result = _a.sent();
                    if (result.success && result.appointment) {
                        console.log("\u2705 [Scheduling] Appointment created: ".concat(result.appointment.id));
                        appointmentCreated = result.appointment;
                        // ABORDAGEM: Agendamento Invisível
                        // A IA já escreveu a confirmação naturalmente, apenas removemos a tag
                        // e adicionamos um ✅ discreto no final (se a IA não tiver colocado)
                        // Remover a tag da resposta
                        modifiedText = modifiedText.replace(fullMatch, '');
                        trimmed = modifiedText.trim();
                        if (!trimmed.endsWith('✅') && !trimmed.endsWith('📅') && !trimmed.endsWith('👍') && !trimmed.endsWith('😊')) {
                            modifiedText = trimmed + ' ✅';
                        }
                    }
                    else {
                        console.log("\u274C [Scheduling] Failed to create appointment: ".concat(result.error));
                        // Remove a tag da resposta
                        modifiedText = modifiedText.replace(fullMatch, '');
                        trimmedMsg = modifiedText.trim();
                        confirmacaoPatterns = [
                            /reservei\s+seu\s+hor[aá]rio/i,
                            /agendei\s+(para|seu)/i,
                            /hor[aá]rio\s+(confirmado|reservado|agendado)/i,
                            /agendamento\s+(realizado|confirmado|feito)/i,
                            /ficou\s+(agendado|marcado|reservado)/i,
                            /confirmei\s+seu\s+hor[aá]rio/i,
                            /vou\s+reservar\s+seu\s+hor[aá]rio/i,
                            /reservando\s+seu\s+hor[aá]rio/i,
                            /seu\s+hor[aá]rio\s+(está|foi)\s+(reservado|marcado|agendado)/i,
                        ];
                        mensagemParecioConfirmacao = responseLooksLikeSuccessfulScheduling(trimmedMsg);
                        errorMessage = void 0;
                        if (result.error === 'Horário não disponível') {
                            errorMessage = "Opa! Infelizmente esse hor\u00E1rio (".concat(time, " de ").concat(date, ") n\u00E3o est\u00E1 dispon\u00EDvel para agendamento. \uD83D\uDE15 Pode me informar outro hor\u00E1rio ou data de prefer\u00EAncia? Vou verificar a disponibilidade! \uD83D\uDE0A");
                        }
                        else if (result.error === 'Sistema de agendamento desativado') {
                            errorMessage = "O sistema de agendamento est\u00E1 desativado no momento. Por favor, entre em contato diretamente para marcar seu hor\u00E1rio! \uD83D\uDE0A";
                        }
                        else {
                            errorMessage = "Puxa, tive um problema t\u00E9cnico ao registrar o hor\u00E1rio ".concat(time, " de ").concat(date, ". \uD83D\uDE05 Por favor, confirme a data e hor\u00E1rio novamente para eu tentar salvar!");
                        }
                        if (trimmedMsg === '' || mensagemParecioConfirmacao) {
                            // Mensagem era uma confirmação falsa — substituir completamente para não enganar o cliente
                            modifiedText = errorMessage;
                            console.log("\uD83D\uDCC5 [Scheduling] \u26A0\uFE0F Mensagem de confirma\u00E7\u00E3o falsa detectada e substitu\u00EDda por erro");
                        }
                        else {
                            // Mensagem tinha outro conteúdo — só anexar aviso de erro
                            modifiedText = trimmedMsg + "\n\n\u26A0\uFE0F ".concat(errorMessage);
                        }
                    }
                    match = schedulingTagRegex.exec(responseText);
                    return [3 /*break*/, 12];
                case 14: return [2 /*return*/, { text: modifiedText.trim(), appointmentCreated: appointmentCreated }];
            }
        });
    });
}
/**
 * Processa tags de cancelamento na resposta da IA
 */
function processSchedulingCancelTags(responseText, userId, clientPhone) {
    return __awaiter(this, void 0, void 0, function () {
        var cancelTagRegex, match, modifiedText, appointmentCancelled, cancellationTags, parsedText, parsedAppointmentCancelled, _loop_2, _i, cancellationTags_1, cancellationTag, _loop_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cancelTagRegex = /\[CANCELAR:\s*DATA=(\d{4}-\d{2}-\d{2}),\s*HORA=(\d{2}:\d{2}),\s*NOME=([^\]]+)\]/gi;
                    match = cancelTagRegex.exec(responseText);
                    modifiedText = responseText;
                    appointmentCancelled = false;
                    cancellationTags = extractCancellationTags(responseText);
                    parsedText = responseText;
                    parsedAppointmentCancelled = false;
                    _loop_2 = function (cancellationTag) {
                        var raw, date, time, clientName, normalizedDate, _b, appointments, error, normalizedClientPhone_1, appointmentToCancel, updateError, err_1;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    raw = cancellationTag.raw, date = cancellationTag.date, time = cancellationTag.time, clientName = cancellationTag.clientName;
                                    console.log("\u00F0\u0178\u201C\u2026 [Scheduling] Detected cancellation tag: ".concat(raw));
                                    _c.label = 1;
                                case 1:
                                    _c.trys.push([1, 6, , 7]);
                                    normalizedDate = normalizeAppointmentDateValue(date);
                                    return [4 /*yield*/, supabaseAuth_1.supabase
                                            .from('appointments')
                                            .select('*')
                                            .eq('user_id', userId)
                                            .gte('appointment_date', normalizedDate)
                                            .lt('appointment_date', getNextAppointmentDateValue(normalizedDate))
                                            .eq('start_time', toDatabaseTimeString(time))
                                            .in('status', ['pending', 'confirmed'])
                                            .limit(5)];
                                case 2:
                                    _b = _c.sent(), appointments = _b.data, error = _b.error;
                                    if (error) {
                                        console.error("\u00E2\u009D\u0152 [Scheduling] Error finding appointment to cancel:", error);
                                        parsedText = parsedText.replace(raw, '');
                                        return [2 /*return*/, "continue"];
                                    }
                                    normalizedClientPhone_1 = normalizePhoneForScheduling(clientPhone);
                                    appointmentToCancel = appointments === null || appointments === void 0 ? void 0 : appointments.find(function (a) {
                                        var _a;
                                        return ((_a = a.client_name) === null || _a === void 0 ? void 0 : _a.toLowerCase().trim()) === clientName.trim().toLowerCase() ||
                                            normalizePhoneForScheduling(a.client_phone) === normalizedClientPhone_1;
                                    });
                                    if (!appointmentToCancel && appointments && appointments.length > 0) {
                                        appointmentToCancel = appointments[0];
                                    }
                                    if (!appointmentToCancel) return [3 /*break*/, 4];
                                    return [4 /*yield*/, supabaseAuth_1.supabase
                                            .from('appointments')
                                            .update({
                                            status: 'cancelled',
                                            cancelled_at: new Date().toISOString(),
                                            cancelled_by: 'client',
                                            cancellation_reason: 'Cancelado pelo cliente via IA',
                                            updated_at: new Date().toISOString(),
                                        })
                                            .eq('id', appointmentToCancel.id)];
                                case 3:
                                    updateError = (_c.sent()).error;
                                    if (!updateError) {
                                        console.log("\u00E2\u0153\u2026 [Scheduling] Appointment cancelled: ".concat(appointmentToCancel.id));
                                        parsedAppointmentCancelled = true;
                                        parsedText = parsedText.replace(raw, '');
                                    }
                                    else {
                                        console.error("\u00E2\u009D\u0152 [Scheduling] Error cancelling appointment:", updateError);
                                        parsedText = parsedText.replace(raw, '');
                                    }
                                    return [3 /*break*/, 5];
                                case 4:
                                    console.log("\u00E2\u0161\u00A0\u00EF\u00B8\u008F [Scheduling] No matching appointment found to cancel for ".concat(date, " ").concat(time, " ").concat(clientName));
                                    parsedText = parsedText.replace(raw, '');
                                    _c.label = 5;
                                case 5: return [3 /*break*/, 7];
                                case 6:
                                    err_1 = _c.sent();
                                    console.error("\u00E2\u009D\u0152 [Scheduling] Exception cancelling appointment:", err_1);
                                    parsedText = parsedText.replace(raw, '');
                                    return [3 /*break*/, 7];
                                case 7: return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, cancellationTags_1 = cancellationTags;
                    _a.label = 1;
                case 1:
                    if (!(_i < cancellationTags_1.length)) return [3 /*break*/, 4];
                    cancellationTag = cancellationTags_1[_i];
                    return [5 /*yield**/, _loop_2(cancellationTag)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, { text: stripSchedulingTagArtifacts(parsedText), appointmentCancelled: parsedAppointmentCancelled }];
                case 5:
                    if (!match) return [3 /*break*/, 7];
                    return [5 /*yield**/, _loop_3()];
                case 6:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 7: return [2 /*return*/, { text: modifiedText.trim(), appointmentCancelled: appointmentCancelled }];
            }
        });
    });
}
/**
 * Busca próximos horários disponíveis para sugerir ao cliente
 */
function getNextAvailableSlots(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, maxSlots) {
        var result, today, i, date, dateStr, slots, availableSlots;
        if (maxSlots === void 0) { maxSlots = 5; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    result = [];
                    today = new Date();
                    i = 0;
                    _a.label = 1;
                case 1:
                    if (!(i < 14 && result.length < maxSlots)) return [3 /*break*/, 4];
                    date = new Date(today);
                    date.setDate(date.getDate() + i);
                    dateStr = formatDate(date);
                    return [4 /*yield*/, getAvailableSlots(userId, dateStr)];
                case 2:
                    slots = _a.sent();
                    availableSlots = slots.filter(function (s) { return s.available; });
                    if (availableSlots.length > 0) {
                        result.push({
                            date: dateStr,
                            slots: availableSlots.slice(0, 3) // Max 3 slots por dia
                        });
                    }
                    _a.label = 3;
                case 3:
                    i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, result];
            }
        });
    });
}
/**
 * Formata sugestões de horários disponíveis para resposta da IA
 */
function formatAvailableSlotsForAI(slotsData) {
    if (slotsData.length === 0) {
        return 'Não há horários disponíveis nos próximos dias.';
    }
    var lines = ['📅 *Horários disponíveis:*'];
    for (var _i = 0, slotsData_1 = slotsData; _i < slotsData_1.length; _i++) {
        var dayData = slotsData_1[_i];
        var dateObj = new Date(dayData.date + 'T12:00:00');
        var dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        var dayName = dayNames[dateObj.getDay()];
        var formattedDate = "".concat(dateObj.getDate().toString().padStart(2, '0'), "/").concat((dateObj.getMonth() + 1).toString().padStart(2, '0'));
        var times = dayData.slots.map(function (s) { return s.start; }).join(', ');
        lines.push("\u2022 *".concat(dayName, " (").concat(formattedDate, "):* ").concat(times));
    }
    lines.push('\nQual horário fica melhor para você?');
    return lines.join('\n');
}
