"use strict";
/**
 * SALON AVAILABILITY MODULE
 *
 * Módulo unificado para cálculo de disponibilidade de salão com:
 * - Duração real de cada serviço
 * - Antecedência mínima em minutos (compatível com horas antigas)
 * - Bloqueio de horário de almoço (intervalo global)
 * - Exclusividade por profissional (sem overlap)
 * - Overlap real considerando duração + buffer
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
exports.timeToMinutes = timeToMinutes;
exports.minutesToTime = minutesToTime;
exports.getBrazilNow = getBrazilNow;
exports.getBrazilToday = getBrazilToday;
exports.getBrazilNowMinutes = getBrazilNowMinutes;
exports.computeMinNoticeMinutes = computeMinNoticeMinutes;
exports.computeDayWindow = computeDayWindow;
exports.computeBreakWindow = computeBreakWindow;
exports.listAppointmentsForDate = listAppointmentsForDate;
exports.isOverlapping = isOverlapping;
exports.hasConflictWithAppointments = hasConflictWithAppointments;
exports.intersectsBreak = intersectsBreak;
exports.getAvailableStartTimes = getAvailableStartTimes;
exports.validateSlot = validateSlot;
exports.findAvailableProfessional = findAvailableProfessional;
exports.checkOverlapBeforeInsert = checkOverlapBeforeInsert;
exports.findClosestSlot = findClosestSlot;
var supabaseAuth_1 = require("./supabaseAuth");
// ═══════════════════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════
/**
 * Converte "HH:mm" para minutos desde meia-noite
 */
function timeToMinutes(time) {
    var _a = time.split(':').map(Number), h = _a[0], m = _a[1];
    return h * 60 + m;
}
/**
 * Converte minutos desde meia-noite para "HH:mm"
 */
function minutesToTime(minutes) {
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return "".concat(h.toString().padStart(2, '0'), ":").concat(m.toString().padStart(2, '0'));
}
/**
 * Retorna a data/hora atual no fuso horário de Brasília
 */
function getBrazilNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}
/**
 * Retorna a data atual no formato YYYY-MM-DD (Brasília)
 */
function getBrazilToday() {
    var d = getBrazilNow();
    var y = d.getFullYear();
    var m = (d.getMonth() + 1).toString().padStart(2, '0');
    var dd = d.getDate().toString().padStart(2, '0');
    return "".concat(y, "-").concat(m, "-").concat(dd);
}
/**
 * Calcula minutos desde meia-noite da data/hora atual (Brasília)
 */
function getBrazilNowMinutes() {
    var now = getBrazilNow();
    return now.getHours() * 60 + now.getMinutes();
}
// ═══════════════════════════════════════════════════════════════════════
// CÁLCULO DE ANTECEDÊNCIA MÍNIMA
// ═══════════════════════════════════════════════════════════════════════
/**
 * Retorna a antecedência mínima em MINUTOS.
 * Compatível com config antiga (min_notice_hours) e nova (min_notice_minutes).
 */
function computeMinNoticeMinutes(config) {
    var _a;
    // Se tiver o novo campo, usa ele
    if (config.min_notice_minutes !== undefined && config.min_notice_minutes !== null) {
        return config.min_notice_minutes;
    }
    // Senão, converte de horas para minutos (legado)
    var hours = (_a = config.min_notice_hours) !== null && _a !== void 0 ? _a : 2;
    return hours * 60;
}
// ═══════════════════════════════════════════════════════════════════════
// CÁLCULO DE JANELA DE ATENDIMENTO (DIA)
// ═══════════════════════════════════════════════════════════════════════
/**
 * Calcula a janela de atendimento (abertura/fechamento) para uma data.
 * Retorna null se o dia estiver desabilitado.
 */
function computeDayWindow(openingHours, date) {
    var dateObj = new Date(date + 'T12:00:00');
    var dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    var dayName = dayNames[dateObj.getDay()];
    var dayHours = openingHours === null || openingHours === void 0 ? void 0 : openingHours[dayName];
    if (!dayHours || !dayHours.enabled) {
        return null;
    }
    return {
        openMin: timeToMinutes(dayHours.open || '09:00'),
        closeMin: timeToMinutes(dayHours.close || '19:00'),
    };
}
// ═══════════════════════════════════════════════════════════════════════
// CÁLCULO DE INTERVALO DE ALMOÇO
// ═══════════════════════════════════════════════════════════════════════
/**
 * Extrai a configuração de almoço do opening_hours.
 * Formato esperado: opening_hours.__break = { enabled: true, start: "12:00", end: "13:00" }
 */
function computeBreakWindow(openingHours) {
    var breakConfig = openingHours === null || openingHours === void 0 ? void 0 : openingHours['__break'];
    if (!breakConfig || !breakConfig.enabled) {
        return null;
    }
    var startMin = timeToMinutes(breakConfig.start || '12:00');
    var endMin = timeToMinutes(breakConfig.end || '13:00');
    return { breakStartMin: startMin, breakEndMin: endMin };
}
// ═══════════════════════════════════════════════════════════════════════
// BUSCAR AGENDAMENTOS EXISTENTES
// ═══════════════════════════════════════════════════════════════════════
/**
 * Busca agendamentos não cancelados para uma data e usuário.
 * Opcionalmente filtra por profissional.
 */
function listAppointmentsForDate(userId, date, professionalId) {
    return __awaiter(this, void 0, void 0, function () {
        var query, _a, data, error, err_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    query = supabaseAuth_1.supabase
                        .from('appointments')
                        .select('id, user_id, appointment_date, start_time, end_time, duration_minutes, professional_id, status')
                        .eq('user_id', userId)
                        .eq('appointment_date', date)
                        .neq('status', 'cancelled');
                    if (professionalId) {
                        query = query.eq('professional_id', professionalId);
                    }
                    return [4 /*yield*/, query];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, (data || [])];
                case 2:
                    err_1 = _b.sent();
                    console.error('❌ [SalonAvailability] Erro ao buscar agendamentos:', err_1);
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// VERIFICAÇÃO DE OVERLAP
// ═══════════════════════════════════════════════════════════════════════
/**
 * Verifica se dois intervalos de tempo se sobrepõem.
 * Overlap ocorre quando: startA < endB E endA > startB
 */
function isOverlapping(startA, endA, startB, endB) {
    return startA < endB && endA > startB;
}
/**
 * Verifica se um agendamento específico conflita com agendamentos existentes.
 * Considera o buffer_before e buffer_after como "folga" ao redor do agendamento.
 */
function hasConflictWithAppointments(startMin, endMin, appointments, bufferMinutes) {
    for (var _i = 0, appointments_1 = appointments; _i < appointments_1.length; _i++) {
        var appt = appointments_1[_i];
        var apptStart = timeToMinutes(appt.start_time);
        var apptEnd = timeToMinutes(appt.end_time);
        // Verifica overlap considerando o buffer
        // O buffer é tratado como extensão do agendamento existente
        if (isOverlapping(startMin, endMin, apptStart - bufferMinutes, apptEnd + bufferMinutes)) {
            return true;
        }
    }
    return false;
}
// ═══════════════════════════════════════════════════════════════════════
// VERIFICAÇÃO DE ALMOÇO
// ═══════════════════════════════════════════════════════════════════════
/**
 * Verifica se um intervalo intersecta o horário de almoço.
 */
function intersectsBreak(startMin, endMin, breakWindow) {
    if (!breakWindow)
        return false;
    return isOverlapping(startMin, endMin, breakWindow.breakStartMin, breakWindow.breakEndMin);
}
// ═══════════════════════════════════════════════════════════════════════
// CÁLCULO DE SLOTS DISPONÍVEIS
// ═══════════════════════════════════════════════════════════════════════
/**
 * Calcula horários disponíveis para agendamento.
 *
 * Algoritmo:
 * 1. Calcula janela de atendimento (open/close)
 * 2. Gera candidatos a cada stepMinutes (padrão 5)
 * 3. Filtra candidatos que:
 *    - Ultrapassam o horário de fechamento (considerando duração)
 *    - Violam antecedência mínima
 *    - Intersectam almoço
 *    - Conflitam com agendamentos do profissional
 */
function getAvailableStartTimes(options) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, date, professionalId, serviceDurationMinutes, _a, stepMinutes, config, dayWindow, breakWindow, buffer, minNoticeMinutes, maxAdvanceDays, today, todayDate, targetDate, diffDays, minAllowedMinutes, nowMinutes, existingAppointments, availableSlots, openMin, closeMin, start, end;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    userId = options.userId, date = options.date, professionalId = options.professionalId, serviceDurationMinutes = options.serviceDurationMinutes, _a = options.stepMinutes, stepMinutes = _a === void 0 ? 5 : _a;
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('salon_config')
                            .select('*')
                            .eq('user_id', userId)
                            .single()];
                case 1:
                    config = (_b.sent()).data;
                    if (!config) {
                        console.warn('⚠️ [SalonAvailability] Config não encontrada para userId:', userId);
                        return [2 /*return*/, []];
                    }
                    dayWindow = computeDayWindow(config.opening_hours, date);
                    if (!dayWindow) {
                        // Dia desabilitado
                        return [2 /*return*/, []];
                    }
                    breakWindow = computeBreakWindow(config.opening_hours);
                    buffer = config.buffer_between || 0;
                    minNoticeMinutes = computeMinNoticeMinutes(config);
                    maxAdvanceDays = config.max_advance_days || 30;
                    today = getBrazilToday();
                    todayDate = new Date(today);
                    targetDate = new Date(date);
                    diffDays = Math.floor((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays > maxAdvanceDays) {
                        return [2 /*return*/, []]; // Data muito futura
                    }
                    minAllowedMinutes = 0;
                    if (diffDays === 0) {
                        nowMinutes = getBrazilNowMinutes();
                        minAllowedMinutes = nowMinutes + minNoticeMinutes;
                    }
                    return [4 /*yield*/, listAppointmentsForDate(userId, date, professionalId)];
                case 2:
                    existingAppointments = _b.sent();
                    availableSlots = [];
                    openMin = dayWindow.openMin;
                    closeMin = dayWindow.closeMin;
                    // Itera de stepMinutes em stepMinutes
                    for (start = openMin; start + serviceDurationMinutes <= closeMin; start += stepMinutes) {
                        end = start + serviceDurationMinutes;
                        // Verifica antecedência mínima
                        if (start < minAllowedMinutes) {
                            continue;
                        }
                        // Verifica almoço
                        if (intersectsBreak(start, end, breakWindow)) {
                            continue;
                        }
                        // Verifica conflito com agendamentos existentes
                        if (hasConflictWithAppointments(start, end, existingAppointments, buffer)) {
                            continue;
                        }
                        // Slot disponível!
                        availableSlots.push(minutesToTime(start));
                    }
                    return [2 /*return*/, availableSlots];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// VALIDAÇÃO DE SLOT
// ═══════════════════════════════════════════════════════════════════════
/**
 * Valida se um horário específico está disponível.
 * Retorna o slot validado e os slots alternativos.
 */
function validateSlot(userId, date, time, professionalId, serviceDurationMinutes) {
    return __awaiter(this, void 0, void 0, function () {
        var slots, valid;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getAvailableStartTimes({
                        userId: userId,
                        date: date,
                        professionalId: professionalId,
                        serviceDurationMinutes: serviceDurationMinutes,
                    })];
                case 1:
                    slots = _a.sent();
                    valid = slots.includes(time);
                    return [2 /*return*/, { valid: valid, availableSlots: slots }];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// ENCONTRAR PROFISSIONAL DISPONÍVEL
// ═══════════════════════════════════════════════════════════════════════
/**
 * Encontra um profissional disponível para um horário.
 * Útil quando o cliente não escolheu profissional específico.
 */
function findAvailableProfessional(userId, date, time, serviceDurationMinutes) {
    return __awaiter(this, void 0, void 0, function () {
        var professionals, _i, professionals_1, prof, valid;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, supabaseAuth_1.supabase
                        .from('scheduling_professionals')
                        .select('id')
                        .eq('user_id', userId)
                        .eq('is_active', true)];
                case 1:
                    professionals = (_a.sent()).data;
                    if (!professionals || professionals.length === 0) {
                        return [2 /*return*/, null];
                    }
                    _i = 0, professionals_1 = professionals;
                    _a.label = 2;
                case 2:
                    if (!(_i < professionals_1.length)) return [3 /*break*/, 5];
                    prof = professionals_1[_i];
                    return [4 /*yield*/, validateSlot(userId, date, time, prof.id, serviceDurationMinutes)];
                case 3:
                    valid = (_a.sent()).valid;
                    if (valid) {
                        return [2 /*return*/, prof.id];
                    }
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, null]; // Nenhum profissional disponível
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// SEGUNDA CHECAGEM ANTI-RACE (para usar antes do insert)
// ═══════════════════════════════════════════════════════════════════════
/**
 * Verificação final de overlap antes de inserir no banco.
 * Deve ser usada dentro da transação de criação de agendamento.
 */
function checkOverlapBeforeInsert(userId, date, startTime, endTime, professionalId, excludeAppointmentId) {
    return __awaiter(this, void 0, void 0, function () {
        var query, existing, newStart, newEnd, _i, existing_1, appt, apptStart, apptEnd, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    query = supabaseAuth_1.supabase
                        .from('appointments')
                        .select('id, start_time, end_time')
                        .eq('user_id', userId)
                        .eq('appointment_date', date)
                        .neq('status', 'cancelled');
                    if (professionalId) {
                        query = query.eq('professional_id', professionalId);
                    }
                    if (excludeAppointmentId) {
                        query = query.neq('id', excludeAppointmentId);
                    }
                    return [4 /*yield*/, query];
                case 1:
                    existing = (_a.sent()).data;
                    if (!existing || existing.length === 0) {
                        return [2 /*return*/, false]; // Sem conflito
                    }
                    newStart = timeToMinutes(startTime);
                    newEnd = timeToMinutes(endTime);
                    for (_i = 0, existing_1 = existing; _i < existing_1.length; _i++) {
                        appt = existing_1[_i];
                        apptStart = timeToMinutes(appt.start_time);
                        apptEnd = timeToMinutes(appt.end_time);
                        if (isOverlapping(newStart, newEnd, apptStart, apptEnd)) {
                            return [2 /*return*/, true]; // Conflito detectado!
                        }
                    }
                    return [2 /*return*/, false]; // Sem conflito
                case 2:
                    err_2 = _a.sent();
                    console.error('❌ [SalonAvailability] Erro na checagem de overlap:', err_2);
                    return [2 /*return*/, false]; // Em caso de erro, assume sem conflito (não bloqueia)
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// HELPER: encontrar slot mais próximo
// ═══════════════════════════════════════════════════════════════════════
function findClosestSlot(targetTime, availableSlots) {
    if (availableSlots.length === 0)
        return null;
    var targetMin = timeToMinutes(targetTime);
    var closest = availableSlots[0];
    var minDiff = Math.abs(timeToMinutes(availableSlots[0]) - targetMin);
    for (var _i = 0, availableSlots_1 = availableSlots; _i < availableSlots_1.length; _i++) {
        var slot = availableSlots_1[_i];
        var diff = Math.abs(timeToMinutes(slot) - targetMin);
        if (diff < minDiff) {
            minDiff = diff;
            closest = slot;
        }
    }
    return closest;
}
