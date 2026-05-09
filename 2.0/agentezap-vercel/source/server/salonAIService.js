"use strict";
/**
 * SALON AI SERVICE v2 - SISTEMA INTELIGENTE DE AGENDAMENTO PARA SALÕES
 *
 * ARQUITETURA (IA + VALIDAÇÃO DETERMINÍSTICA):
 * 1. IA conversa livremente com o cliente (sem menus "digite 1, 2, 3")
 * 2. IA extrai campos estruturados (serviço, profissional, data, hora) via LLM
 * 3. Validação determinística: slots reais, conflitos, horário comercial
 * 4. Confirmação explícita antes de agendar
 * 5. Agendamento seguro com revalidação pré-insert
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
exports.getBookingState = getBookingState;
exports.resetBookingState = resetBookingState;
exports.isCurrentlyInBreak = isCurrentlyInBreak;
exports.isSalonOpen = isSalonOpen;
exports.getSalonConfig = getSalonConfig;
exports.getSalonData = getSalonData;
exports.getAvailableSlots = getAvailableSlots;
exports.createSalonAppointment = createSalonAppointment;
exports.generateSalonResponse = generateSalonResponse;
exports.isSalonActive = isSalonActive;
exports.detectSalonIntent = detectSalonIntent;
var supabaseAuth_1 = require("./supabaseAuth");
var llm_1 = require("./llm");
var salonAvailability_1 = require("./salonAvailability");
var bookingStates = new Map();
var STATE_EXPIRY_MS = 2 * 60 * 60 * 1000;
function cleanOldStates() {
    var now = Date.now();
    for (var _i = 0, _a = Array.from(bookingStates.entries()); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], state = _b[1];
        if (now - state.lastUpdated.getTime() > STATE_EXPIRY_MS) {
            bookingStates.delete(key);
        }
    }
}
setInterval(cleanOldStates, 30 * 60 * 1000);
function getBookingState(userId, customerPhone, conversationId) {
    var keyBase = customerPhone || conversationId || 'default';
    var key = "".concat(userId, ":").concat(keyBase);
    var state = bookingStates.get(key);
    if (!state) {
        state = {
            service: null,
            professional: null,
            date: null,
            time: null,
            customerName: null,
            customerPhone: customerPhone,
            awaitingConfirmation: false,
            createdAt: new Date(),
            lastUpdated: new Date(),
        };
        bookingStates.set(key, state);
    }
    return state;
}
function resetBookingState(userId, customerPhone, conversationId) {
    var keyBase = customerPhone || conversationId || 'default';
    var key = "".concat(userId, ":").concat(keyBase);
    bookingStates.delete(key);
    console.log("\uD83D\uDC87 [Salon] Estado resetado: ".concat(key));
}
// ═══════════════════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════
/**
 * Verifica se o horário atual está dentro do intervalo de almoço configurado.
 * Retorna { isDuringBreak: true, message } se estiver em pausa.
 */
function isCurrentlyInBreak(openingHours) {
    var breakConfig = openingHours === null || openingHours === void 0 ? void 0 : openingHours['__break'];
    if (!breakConfig || !breakConfig.enabled) {
        return { isDuringBreak: false, message: '', breakStart: '12:00', breakEnd: '13:00' };
    }
    var now = new Date();
    var brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    var currentHour = brazilTime.getHours();
    var currentMinute = brazilTime.getMinutes();
    var currentMinutes = currentHour * 60 + currentMinute;
    var _a = breakConfig.start.split(':').map(Number), bStartH = _a[0], bStartM = _a[1];
    var _b = breakConfig.end.split(':').map(Number), bEndH = _b[0], bEndM = _b[1];
    var breakStartMin = bStartH * 60 + bStartM;
    var breakEndMin = bEndH * 60 + bEndM;
    var isDuringBreak = currentMinutes >= breakStartMin && currentMinutes < breakEndMin;
    var message = isDuringBreak
        ? "Estamos no hor\u00E1rio de almo\u00E7o (".concat(breakConfig.start, " \u00E0s ").concat(breakConfig.end, "). Voltamos em breve! \uD83C\uDF7D\uFE0F")
        : '';
    return { isDuringBreak: isDuringBreak, message: message, breakStart: breakConfig.start, breakEnd: breakConfig.end };
}
function isSalonOpen(openingHours) {
    var now = new Date();
    var brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    var dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    var dayNamesPt = {
        sunday: 'domingo', monday: 'segunda-feira', tuesday: 'terça-feira',
        wednesday: 'quarta-feira', thursday: 'quinta-feira', friday: 'sexta-feira', saturday: 'sábado'
    };
    var currentDay = dayNames[brazilTime.getDay()];
    var currentHour = brazilTime.getHours().toString().padStart(2, '0');
    var currentMinute = brazilTime.getMinutes().toString().padStart(2, '0');
    var currentTime = "".concat(currentHour, ":").concat(currentMinute);
    if (!openingHours || Object.keys(openingHours).length === 0) {
        return { isOpen: true, isDuringBreak: false, currentDay: currentDay, currentTime: currentTime, message: '' };
    }
    var todayHours = openingHours[currentDay];
    if (!todayHours || !todayHours.enabled) {
        return { isOpen: false, isDuringBreak: false, currentDay: currentDay, currentTime: currentTime, message: "Estamos fechados hoje (".concat(dayNamesPt[currentDay], ").") };
    }
    var openTime = todayHours.open || '09:00';
    var closeTime = todayHours.close || '19:00';
    var currentMinutes = parseInt(currentHour) * 60 + parseInt(currentMinute);
    var openMinutes = parseInt(openTime.split(':')[0]) * 60 + parseInt(openTime.split(':')[1] || '0');
    var closeMinutes = parseInt(closeTime.split(':')[0]) * 60 + parseInt(closeTime.split(':')[1] || '0');
    var isOpenHours = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    if (!isOpenHours) {
        return { isOpen: false, isDuringBreak: false, currentDay: currentDay, currentTime: currentTime, message: "Nosso hor\u00E1rio hoje \u00E9 das ".concat(openTime, " \u00E0s ").concat(closeTime, ".") };
    }
    // Verificar horário de almoço
    var breakStatus = isCurrentlyInBreak(openingHours);
    if (breakStatus.isDuringBreak) {
        return { isOpen: false, isDuringBreak: true, currentDay: currentDay, currentTime: currentTime, message: breakStatus.message };
    }
    return { isOpen: true, isDuringBreak: false, currentDay: currentDay, currentTime: currentTime, message: '' };
}
function formatSalonHours(openingHours) {
    if (!openingHours || Object.keys(openingHours).length === 0)
        return 'Horários não informados.';
    var dayNamesPt = {
        monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta',
        thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo'
    };
    var dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    var text = '';
    for (var _i = 0, dayOrder_1 = dayOrder; _i < dayOrder_1.length; _i++) {
        var day = dayOrder_1[_i];
        var dc = openingHours[day];
        if (dc && dc.enabled)
            text += "".concat(dayNamesPt[day], ": ").concat(dc.open, " \u00E0s ").concat(dc.close, "\n");
    }
    return text.trim() || 'Horários não informados.';
}
function getBrazilNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}
function getBrazilToday() {
    var d = getBrazilNow();
    var y = d.getFullYear();
    var m = (d.getMonth() + 1).toString().padStart(2, '0');
    var dd = d.getDate().toString().padStart(2, '0');
    return "".concat(y, "-").concat(m, "-").concat(dd);
}
function formatDatePtBr(dateStr) {
    var _a = dateStr.split('-'), y = _a[0], m = _a[1], d = _a[2];
    return "".concat(d, "/").concat(m, "/").concat(y);
}
// ═══════════════════════════════════════════════════════════════════════
// BUSCAR DADOS DO SALÃO
// ═══════════════════════════════════════════════════════════════════════
function getSalonConfig(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error, err_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('salon_config').select('*').eq('user_id', userId).single()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error) {
                        if (error.code === 'PGRST116')
                            return [2 /*return*/, null];
                        console.error('❌ [Salon] Erro ao buscar config:', error);
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, data];
                case 2:
                    err_1 = _b.sent();
                    console.error('❌ [Salon] Erro ao buscar config:', err_1);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function getSalonData(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var config, services, professionals, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, getSalonConfig(userId)];
                case 1:
                    config = _a.sent();
                    if (!config)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('scheduling_services').select('*').eq('user_id', userId).eq('is_active', true).order('display_order')];
                case 2:
                    services = (_a.sent()).data;
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('scheduling_professionals').select('*').eq('user_id', userId).eq('is_active', true).order('display_order')];
                case 3:
                    professionals = (_a.sent()).data;
                    return [2 /*return*/, { config: config, services: services || [], professionals: professionals || [] }];
                case 4:
                    err_2 = _a.sent();
                    console.error('❌ [Salon] Erro ao buscar dados:', err_2);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// BUSCAR HORÁRIOS DISPONÍVEIS (usa novo módulo)
// ═══════════════════════════════════════════════════════════════════════
function getAvailableSlots(userId, date, professionalId, serviceDuration) {
    return __awaiter(this, void 0, void 0, function () {
        var salonData, slotDuration, err_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, getSalonData(userId)];
                case 1:
                    salonData = _a.sent();
                    if (!salonData)
                        return [2 /*return*/, []];
                    slotDuration = serviceDuration || salonData.config.slot_duration || 30;
                    return [4 /*yield*/, (0, salonAvailability_1.getAvailableStartTimes)({
                            userId: userId,
                            date: date,
                            professionalId: professionalId,
                            serviceDurationMinutes: slotDuration,
                            stepMinutes: 5,
                        })];
                case 2: return [2 /*return*/, _a.sent()];
                case 3:
                    err_3 = _a.sent();
                    console.error('❌ [Salon] Erro ao buscar slots:', err_3);
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// CRIAR AGENDAMENTO SEGURO (revalida antes de inserir)
// ═══════════════════════════════════════════════════════════════════════
function createSalonAppointment(userId, conversationId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var professionalId, professionalName, availableProfId, availableSlots_1, profData, _a, valid, availableSlots, _b, startH, startM, endMinutes, endH, endM, endTime, hasOverlap, _c, appointment, error, err_4;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 9, , 10]);
                    professionalId = data.professionalId;
                    professionalName = data.professionalName;
                    if (!!professionalId) return [3 /*break*/, 5];
                    return [4 /*yield*/, (0, salonAvailability_1.findAvailableProfessional)(userId, data.appointmentDate, data.startTime, data.durationMinutes)];
                case 1:
                    availableProfId = _d.sent();
                    if (!!availableProfId) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, salonAvailability_1.validateSlot)(userId, data.appointmentDate, data.startTime, undefined, data.durationMinutes)];
                case 2:
                    availableSlots_1 = (_d.sent()).availableSlots;
                    return [2 /*return*/, {
                            success: false,
                            error: 'Nenhum profissional disponível para este horário',
                            suggestedSlots: availableSlots_1.slice(0, 5)
                        }];
                case 3: return [4 /*yield*/, supabaseAuth_1.supabase
                        .from('scheduling_professionals')
                        .select('name')
                        .eq('id', availableProfId)
                        .single()];
                case 4:
                    profData = (_d.sent()).data;
                    professionalId = availableProfId;
                    professionalName = (profData === null || profData === void 0 ? void 0 : profData.name) || null;
                    _d.label = 5;
                case 5: return [4 /*yield*/, (0, salonAvailability_1.validateSlot)(userId, data.appointmentDate, data.startTime, professionalId, data.durationMinutes)];
                case 6:
                    _a = _d.sent(), valid = _a.valid, availableSlots = _a.availableSlots;
                    if (!valid) {
                        console.log("\u274C [Salon] Slot ".concat(data.startTime, " em ").concat(data.appointmentDate, " j\u00E1 ocupado! Sugerindo alternativas."));
                        return [2 /*return*/, { success: false, error: 'Horário já ocupado', suggestedSlots: availableSlots.slice(0, 5) }];
                    }
                    _b = data.startTime.split(':').map(Number), startH = _b[0], startM = _b[1];
                    endMinutes = startH * 60 + startM + data.durationMinutes;
                    endH = Math.floor(endMinutes / 60);
                    endM = endMinutes % 60;
                    endTime = "".concat(endH.toString().padStart(2, '0'), ":").concat(endM.toString().padStart(2, '0'));
                    return [4 /*yield*/, (0, salonAvailability_1.checkOverlapBeforeInsert)(userId, data.appointmentDate, data.startTime, endTime, professionalId || null)];
                case 7:
                    hasOverlap = _d.sent();
                    if (hasOverlap) {
                        console.log("\u274C [Salon] Overlap detectado na checagem final! Abortando insert.");
                        return [2 /*return*/, { success: false, error: 'Conflito de horário detectado', suggestedSlots: availableSlots.slice(0, 5) }];
                    }
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('appointments')
                            .insert({
                            user_id: userId,
                            conversation_id: conversationId || null,
                            client_name: data.clientName,
                            client_phone: data.clientPhone,
                            service_id: data.serviceId || null,
                            service_name: data.serviceName,
                            professional_id: professionalId || null,
                            professional_name: professionalName || null,
                            appointment_date: data.appointmentDate,
                            start_time: data.startTime,
                            end_time: endTime,
                            duration_minutes: data.durationMinutes,
                            status: 'pending',
                            confirmed_by_client: true,
                            confirmed_by_business: false,
                            created_by_ai: true,
                        })
                            .select().single()];
                case 8:
                    _c = _d.sent(), appointment = _c.data, error = _c.error;
                    if (error) {
                        console.error('❌ [Salon] Erro ao criar agendamento:', error);
                        return [2 /*return*/, { success: false, error: error.message }];
                    }
                    console.log("\u2705 [Salon] Agendamento criado: ".concat(appointment.id));
                    return [2 /*return*/, { success: true, appointmentId: appointment.id }];
                case 9:
                    err_4 = _d.sent();
                    console.error('❌ [Salon] Erro ao criar agendamento:', err_4);
                    return [2 /*return*/, { success: false, error: 'Erro interno' }];
                case 10: return [2 /*return*/];
            }
        });
    });
}
function extractSalonFieldsLLM(message, conversationHistory, salonData, bookingState) {
    return __awaiter(this, void 0, void 0, function () {
        var now, dayNames, todayStr, todayDate, servicesList, profList, stateInfo, recentHistory, extractPrompt, result, raw, jsonMatch, parsed, err_5;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    now = getBrazilNow();
                    dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
                    todayStr = dayNames[now.getDay()];
                    todayDate = getBrazilToday();
                    servicesList = salonData.services.map(function (s) { return s.name; }).join(', ');
                    profList = salonData.professionals.map(function (p) { return p.name; }).join(', ');
                    stateInfo = [
                        bookingState.service ? "Servi\u00E7o j\u00E1 escolhido: ".concat(bookingState.service.name) : '',
                        bookingState.professional ? "Profissional j\u00E1 escolhido: ".concat(bookingState.professional.name) : '',
                        bookingState.date ? "Data j\u00E1 escolhida: ".concat(bookingState.date) : '',
                        bookingState.time ? "Hor\u00E1rio j\u00E1 escolhido: ".concat(bookingState.time) : '',
                        bookingState.awaitingConfirmation ? 'AGUARDANDO CONFIRMAÇÃO DO CLIENTE' : '',
                    ].filter(Boolean).join('\n');
                    recentHistory = conversationHistory.slice(-6)
                        .map(function (m) { return "".concat(m.fromMe ? 'Atendente' : 'Cliente', ": ").concat(m.text); })
                        .join('\n');
                    extractPrompt = "Extraia campos estruturados da mensagem do cliente de um sal\u00E3o de beleza.\n\nHoje: ".concat(todayStr, ", ").concat(todayDate, "\nServi\u00E7os dispon\u00EDveis: ").concat(servicesList || 'Nenhum cadastrado', "\nProfissionais: ").concat(profList || 'Nenhum cadastrado', "\n\nEstado atual do agendamento:\n").concat(stateInfo || 'Nenhum dado coletado ainda', "\n\nHist\u00F3rico recente:\n").concat(recentHistory, "\n\nMensagem atual do cliente: \"").concat(message, "\"\n\nResponda APENAS em JSON (sem markdown):\n{\n  \"intent\": \"greeting|booking|check_availability|info_services|info_hours|info_prices|confirm|cancel|check_booking|general\",\n  \"service\": \"nome exato do servi\u00E7o ou null\",\n  \"professional\": \"nome exato do profissional ou null\",\n  \"date\": \"YYYY-MM-DD ou null (hoje=").concat(todayDate, ", amanh\u00E3=calcule, pr\u00F3xima segunda=calcule, etc)\",\n  \"time\": \"HH:mm ou null (fim da tarde=16:00, manh\u00E3=09:00, depois do almo\u00E7o=14:00, etc)\",\n  \"customerName\": \"nome do cliente ou null\"\n}\n\nRegras:\n- Se o cliente diz \"sim\", \"confirmo\", \"pode marcar\" e estamos AGUARDANDO CONFIRMA\u00C7\u00C3O, intent=\"confirm\"\n- Se menciona servi\u00E7o (mesmo parcial), extraia o nome EXATO do servi\u00E7o dispon\u00EDvel mais pr\u00F3ximo\n- Se menciona profissional, extraia o nome EXATO\n- Datas relativas: \"amanh\u00E3\" \u2192 calcule a data, \"segunda\" \u2192 pr\u00F3xima segunda, \"s\u00E1bado\" \u2192 pr\u00F3ximo s\u00E1bado\n- Hor\u00E1rios vagos: \"fim da tarde\" \u2192 16:00, \"depois do almo\u00E7o\" \u2192 14:00, \"manh\u00E3\" \u2192 09:00, \"meio dia\" \u2192 12:00\n- \"n\u00E3o\", \"cancelar\", \"desistir\" \u2192 intent=\"cancel\"\n- Se o cliente quer agendar algo (cortar, pintar, fazer unha, etc) \u2192 intent=\"booking\"\n- Se o cliente pergunta sobre DISPONIBILIDADE de hor\u00E1rios sem mencionar servi\u00E7o espec\u00EDfico (\"quais hor\u00E1rios tem\", \"tem hor\u00E1rio\", \"hor\u00E1rio dispon\u00EDvel\", \"tem vaga\", \"o que tem dispon\u00EDvel\") \u2192 intent=\"check_availability\" (com a data se mencionada)");
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, llm_1.chatComplete)({
                            messages: [
                                { role: 'system', content: 'Você é um extrator de campos para sistema de agendamento. Responda SOMENTE JSON válido, sem markdown.' },
                                { role: 'user', content: extractPrompt }
                            ],
                            maxTokens: 200,
                            temperature: 0.1,
                        })];
                case 2:
                    result = _d.sent();
                    raw = ((_c = (_b = (_a = result.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '{}';
                    jsonMatch = raw.match(/\{[\s\S]*\}/);
                    if (!jsonMatch)
                        return [2 /*return*/, { intent: 'general' }];
                    parsed = JSON.parse(jsonMatch[0]);
                    return [2 /*return*/, {
                            intent: parsed.intent || 'general',
                            service: parsed.service || undefined,
                            professional: parsed.professional || undefined,
                            date: parsed.date || undefined,
                            time: parsed.time || undefined,
                            customerName: parsed.customerName || undefined,
                        }];
                case 3:
                    err_5 = _d.sent();
                    console.error('❌ [Salon] Erro na extração LLM:', err_5);
                    return [2 /*return*/, { intent: 'general' }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// RESOLVER SERVIÇO E PROFISSIONAL POR NOME (fuzzy match)
// ═══════════════════════════════════════════════════════════════════════
function matchService(name, services) {
    if (!name || services.length === 0)
        return null;
    var lower = name.toLowerCase().trim();
    // Exact match
    var exact = services.find(function (s) { return s.name.toLowerCase() === lower; });
    if (exact)
        return exact;
    // Partial match
    var partial = services.find(function (s) {
        return s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase());
    });
    return partial || null;
}
function matchProfessional(name, professionals) {
    if (!name || professionals.length === 0)
        return null;
    var lower = name.toLowerCase().trim();
    if (/qualquer|tanto faz|sem prefer/.test(lower))
        return professionals[0];
    var exact = professionals.find(function (p) { return p.name.toLowerCase() === lower; });
    if (exact)
        return exact;
    var partial = professionals.find(function (p) {
        return p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase());
    });
    return partial || null;
}
/**
 * Gera sugestão de horários via LLM com validação estruturada.
 * A IA retorna JSON com messageText e suggestedSlots, e validamos que
 * suggestedSlots é subconjunto de allowedSlots.
 */
function generateSlotSuggestionMessageLLM(options) {
    return __awaiter(this, void 0, void 0, function () {
        var message, conversationHistory, salonData, bookingState, date, allowedSlots, breakConfig, serviceName, config, professionals, dateFormatted, breakNotice, recentHistory, profName, slotsListStr, systemPrompt, maxRetries, attempt, result, raw, jsonMatch, parsed, suggested, allValid, err_6, fallbackSlots;
        var _a, _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    message = options.message, conversationHistory = options.conversationHistory, salonData = options.salonData, bookingState = options.bookingState, date = options.date, allowedSlots = options.allowedSlots, breakConfig = options.breakConfig, serviceName = options.serviceName;
                    config = salonData.config, professionals = salonData.professionals;
                    dateFormatted = formatDatePtBr(date);
                    breakNotice = (breakConfig === null || breakConfig === void 0 ? void 0 : breakConfig.enabled)
                        ? "\u26A0\uFE0F N\u00C3O atendemos no hor\u00E1rio do almo\u00E7o (".concat(breakConfig.start, " \u00E0s ").concat(breakConfig.end, ").")
                        : '';
                    recentHistory = conversationHistory.slice(-6)
                        .map(function (m) { return "".concat(m.fromMe ? 'Atendente' : 'Cliente', ": ").concat(m.text); })
                        .join('\n');
                    profName = ((_a = bookingState.professional) === null || _a === void 0 ? void 0 : _a.name) || ((_b = professionals[0]) === null || _b === void 0 ? void 0 : _b.name) || 'nossa equipe';
                    slotsListStr = allowedSlots.slice(0, 8).join(', ');
                    systemPrompt = "Voc\u00EA \u00E9 uma atendente virtual de um sal\u00E3o de beleza.\nSua tarefa: sugerir hor\u00E1rios dispon\u00EDveis para agendamento.\n\nDATA: ".concat(dateFormatted, "\nSERVI\u00C7O: ").concat(serviceName || 'o serviço escolhido', "\nPROFISSIONAL: ").concat(profName, "\nHOR\u00C1RIOS DISPON\u00CDVEIS (confirmados pelo sistema): ").concat(slotsListStr, "\n").concat(breakNotice, "\n\nREGRAS IMPORTANTES:\n1. Voc\u00EA S\u00D3 pode sugerir hor\u00E1rios da lista acima.\n2. suggestedSlots DEVE ser um subconjunto de: [").concat(allowedSlots.map(function (s) { return "\"".concat(s, "\""); }).join(', '), "]\n3. N\u00E3o invente hor\u00E1rios que n\u00E3o est\u00E3o na lista.\n4. Seja breve e amig\u00E1vel (m\u00E1ximo 3 linhas).\n\nResponda APENAS em JSON (sem markdown):\n{\n  \"messageText\": \"sua mensagem curta e simp\u00E1tica\",\n  \"suggestedSlots\": [\"HH:mm\", \"HH:mm\", ...]\n}");
                    maxRetries = 2;
                    attempt = 0;
                    _f.label = 1;
                case 1:
                    if (!(attempt <= maxRetries)) return [3 /*break*/, 6];
                    _f.label = 2;
                case 2:
                    _f.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, (0, llm_1.chatComplete)({
                            messages: __spreadArray(__spreadArray([
                                { role: 'system', content: systemPrompt }
                            ], recentHistory.split('\n').map(function (line, i) { return ({
                                role: (i % 2 === 0) ? 'user' : 'assistant',
                                content: line
                            }); }), true), [
                                { role: 'user', content: message }
                            ], false),
                            maxTokens: 200,
                            temperature: 0.3,
                        })];
                case 3:
                    result = _f.sent();
                    raw = ((_e = (_d = (_c = result.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content) || '{}';
                    jsonMatch = raw.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        console.warn('⚠️ [Salon] LLM não retornou JSON válido, usando fallback');
                        return [3 /*break*/, 6];
                    }
                    parsed = JSON.parse(jsonMatch[0]);
                    suggested = parsed.suggestedSlots || [];
                    allValid = suggested.every(function (s) { return allowedSlots.includes(s); });
                    if (allValid && suggested.length > 0) {
                        console.log("\u2705 [Salon] Slots validados: ".concat(suggested.join(', ')));
                        return [2 /*return*/, {
                                messageText: parsed.messageText || "Para ".concat(dateFormatted, ", temos: ").concat(suggested.join(', '), ". Qual prefere?"),
                                suggestedSlots: suggested
                            }];
                    }
                    if (attempt < maxRetries) {
                        console.warn("\u26A0\uFE0F [Salon] LLM sugeriu slots inv\u00E1lidos (tentativa ".concat(attempt + 1, "), reenviando..."));
                        // Continuar para próxima tentativa com correção
                        return [3 /*break*/, 5];
                    }
                    console.warn('⚠️ [Salon] LLM persistiu com slots inválidos, usando fallback');
                    return [3 /*break*/, 6];
                case 4:
                    err_6 = _f.sent();
                    console.error('❌ [Salon] Erro no generateSlotSuggestionMessageLLM:', err_6);
                    return [3 /*break*/, 6];
                case 5:
                    attempt++;
                    return [3 /*break*/, 1];
                case 6:
                    fallbackSlots = allowedSlots.slice(0, 6);
                    console.log("\uD83D\uDD04 [Salon] Usando fallback com slots: ".concat(fallbackSlots.join(', ')));
                    return [2 /*return*/, {
                            messageText: "Para ".concat(serviceName || 'o serviço', " em ").concat(dateFormatted, ", temos estes hor\u00E1rios:\n\n").concat(fallbackSlots.join(', '), "\n\n").concat(breakNotice, "\n\nQual funciona melhor para voc\u00EA?"),
                            suggestedSlots: fallbackSlots
                        }];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// GERAR RESPOSTA VIA IA (conversacional)
// ═══════════════════════════════════════════════════════════════════════
function generateAIResponse(message, conversationHistory, salonData, bookingState, contextMessage) {
    return __awaiter(this, void 0, void 0, function () {
        var config, services, professionals, agentPrompt, servicesInfo, profsInfo, hoursInfo, stateInfo, recentHistory, systemPrompt, messages, _i, _a, h, result, err_7;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    config = salonData.config, services = salonData.services, professionals = salonData.professionals;
                    agentPrompt = config.ai_instructions || '';
                    servicesInfo = services.length > 0
                        ? services.map(function (s) {
                            var price = s.price ? "R$ ".concat(s.price.toFixed(2).replace('.', ',')) : 'Consulte';
                            return "- ".concat(s.name, ": ").concat(price, " (").concat(s.duration_minutes || 30, "min)").concat(s.description ? ' - ' + s.description : '');
                        }).join('\n')
                        : 'Nenhum serviço cadastrado.';
                    profsInfo = professionals.length > 0
                        ? professionals.map(function (p) { return "- ".concat(p.name).concat(p.bio ? ': ' + p.bio : ''); }).join('\n')
                        : 'Nenhum profissional cadastrado.';
                    hoursInfo = formatSalonHours(config.opening_hours);
                    stateInfo = [
                        bookingState.service ? "Servi\u00E7o escolhido: ".concat(bookingState.service.name) : '',
                        bookingState.professional ? "Profissional: ".concat(bookingState.professional.name) : '',
                        bookingState.date ? "Data: ".concat(formatDatePtBr(bookingState.date)) : '',
                        bookingState.time ? "Hor\u00E1rio: ".concat(bookingState.time) : '',
                        bookingState.customerName ? "Cliente: ".concat(bookingState.customerName) : '',
                    ].filter(Boolean).join(' | ');
                    recentHistory = conversationHistory.slice(-8)
                        .map(function (m) { return "".concat(m.fromMe ? 'Você' : 'Cliente', ": ").concat(m.text); })
                        .join('\n');
                    systemPrompt = "Voc\u00EA \u00E9 a atendente virtual do \"".concat(config.salon_name || 'Salão', "\". Converse naturalmente com o cliente pelo WhatsApp, como uma recepcionista simp\u00E1tica e profissional.\n\n").concat(agentPrompt ? "INSTRU\u00C7\u00D5ES DO DONO:\n".concat(agentPrompt, "\n") : '', "\nSERVI\u00C7OS DISPON\u00CDVEIS:\n").concat(servicesInfo, "\n\nPROFISSIONAIS:\n").concat(profsInfo, "\n\nHOR\u00C1RIOS DE FUNCIONAMENTO:\n").concat(hoursInfo, "\n\n").concat(config.address ? "ENDERE\u00C7O: ".concat(config.address) : '', "\n").concat(config.phone ? "TELEFONE: ".concat(config.phone) : '', "\n\nESTADO DO AGENDAMENTO EM ANDAMENTO: ").concat(stateInfo || 'Nenhum', "\n\n").concat(contextMessage ? "CONTEXTO IMPORTANTE: ".concat(contextMessage) : '', "\n\nREGRAS:\n- Converse naturalmente, SEM menus \"digite 1, 2, 3\"\n- Se o cliente quer agendar, ajude coletando: servi\u00E7o, profissional (se tiver), data e hor\u00E1rio\n- N\u00E3o invente hor\u00E1rios, servi\u00E7os ou profissionais que n\u00E3o existem\n- IMPORTANTE: NUNCA sugira hor\u00E1rios espec\u00EDficos (como \"12:30\", \"14:10\") a menos que uma lista de hor\u00E1rios dispon\u00EDveis seja fornecida no contexto. Sem lista, pergunte apenas a prefer\u00EAncia do cliente.\n- Seja breve (m\u00E1ximo 3-4 linhas por mensagem)\n- Use o nome do cliente quando souber\n- Se todos os dados estiverem coletados, fa\u00E7a um RESUMO e pe\u00E7a confirma\u00E7\u00E3o\n- N\u00E3o confirme agendamento por conta pr\u00F3pria, SEMPRE pergunte \"Posso confirmar?\"");
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 3, , 4]);
                    messages = [
                        { role: 'system', content: systemPrompt },
                    ];
                    // Add recent history as conversation context
                    for (_i = 0, _a = conversationHistory.slice(-6); _i < _a.length; _i++) {
                        h = _a[_i];
                        messages.push({
                            role: h.fromMe ? 'assistant' : 'user',
                            content: h.text,
                        });
                    }
                    messages.push({ role: 'user', content: message });
                    return [4 /*yield*/, (0, llm_1.chatComplete)({
                            messages: messages,
                            maxTokens: 300,
                            temperature: 0.7,
                        })];
                case 2:
                    result = _e.sent();
                    return [2 /*return*/, ((_d = (_c = (_b = result.choices) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content) || 'Como posso ajudar você?'];
                case 3:
                    err_7 = _e.sent();
                    console.error('❌ [Salon] Erro ao gerar resposta IA:', err_7);
                    return [2 /*return*/, 'Desculpe, tive um problema. Pode repetir?'];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// GERAR RESPOSTA PRINCIPAL DO SALÃO
// ═══════════════════════════════════════════════════════════════════════
function generateSalonResponse(userId, conversationId, customerPhone, message, conversationHistory) {
    return __awaiter(this, void 0, void 0, function () {
        var salonData, config, services, professionals, history_1, state, breakStatus, extracted, matched, matched, hasAllBookingData, shouldConfirm, _a, valid, availableSlots, requestedTime, breakConfig, slotResult, result, dateFormatted, svcName, profName, timeStr, breakConfig, slotResult, availabilityRegex, isAvailabilityQuery, targetDate, defaultDuration, slots, dateFormatted, nextDate, nextSlots, nextDateStr, i, y, m, d, nextFormatted, sampleSlots, displaySlots, step, i, slotsFormatted, totalMsg, servicesHint, needsService, needsProfessional, needsDate, needsTime, isBookingIntent, _b, valid, availableSlots, closest, breakConfig, slotResult, dateFormatted, price, confirmContext, contextMsg, svcList, profNames, slots, requestedDate, breakConfig, slotResult, svcInfo, hours, err_8;
        var _c, _d, _e, _f, _g, _h, _j, _k, _l;
        var _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4;
        return __generator(this, function (_5) {
            switch (_5.label) {
                case 0:
                    _5.trys.push([0, 43, , 44]);
                    return [4 /*yield*/, getSalonData(userId)];
                case 1:
                    salonData = _5.sent();
                    if (!salonData || !salonData.config.is_active)
                        return [2 /*return*/, null];
                    config = salonData.config, services = salonData.services, professionals = salonData.professionals;
                    history_1 = conversationHistory || [];
                    state = getBookingState(userId, customerPhone, conversationId);
                    console.log("\uD83D\uDC87 [Salon v2] msg=\"".concat(message.substring(0, 80), "\" phone=").concat(customerPhone));
                    console.log("\uD83D\uDC87 [Salon v2] state: svc=".concat(((_m = state.service) === null || _m === void 0 ? void 0 : _m.name) || '-', " prof=").concat(((_o = state.professional) === null || _o === void 0 ? void 0 : _o.name) || '-', " date=").concat(state.date || '-', " time=").concat(state.time || '-', " confirm=").concat(state.awaitingConfirmation));
                    breakStatus = isCurrentlyInBreak(config.opening_hours);
                    if (breakStatus.isDuringBreak) {
                        console.log("\uD83D\uDC87 [Salon v2] \u23F8\uFE0F HOR\u00C1RIO DE ALMO\u00C7O (".concat(breakStatus.breakStart, "\u2013").concat(breakStatus.breakEnd, ") \u2014 bloqueando resposta"));
                        return [2 /*return*/, {
                                text: breakStatus.message,
                            }];
                    }
                    return [4 /*yield*/, extractSalonFieldsLLM(message, history_1, salonData, state)];
                case 2:
                    extracted = _5.sent();
                    console.log("\uD83D\uDC87 [Salon v2] extracted:", JSON.stringify(extracted));
                    // 2. ATUALIZAR ESTADO COM CAMPOS EXTRAÍDOS
                    if (extracted.customerName && !state.customerName) {
                        state.customerName = extracted.customerName;
                    }
                    if (extracted.service) {
                        matched = matchService(extracted.service, services);
                        if (matched) {
                            state.service = matched;
                            console.log("\uD83D\uDC87 [Salon v2] Servi\u00E7o matched: ".concat(matched.name));
                        }
                    }
                    if (extracted.professional) {
                        matched = matchProfessional(extracted.professional, professionals);
                        if (matched) {
                            state.professional = matched;
                            console.log("\uD83D\uDC87 [Salon v2] Profissional matched: ".concat(matched.name));
                        }
                    }
                    if (extracted.date && /^\d{4}-\d{2}-\d{2}$/.test(extracted.date)) {
                        state.date = extracted.date;
                        console.log("\uD83D\uDC87 [Salon v2] Data: ".concat(extracted.date));
                    }
                    if (extracted.time && /^\d{2}:\d{2}$/.test(extracted.time)) {
                        state.time = extracted.time;
                        console.log("\uD83D\uDC87 [Salon v2] Hora: ".concat(extracted.time));
                    }
                    state.lastUpdated = new Date();
                    if (!(extracted.intent === 'cancel')) return [3 /*break*/, 4];
                    resetBookingState(userId, customerPhone, conversationId);
                    _c = {};
                    return [4 /*yield*/, generateAIResponse(message, history_1, salonData, state, 'O cliente cancelou o agendamento. Confirme o cancelamento de forma amigável.')];
                case 3: return [2 /*return*/, (_c.text = _5.sent(), _c)];
                case 4:
                    hasAllBookingData = state.service && state.date && state.time;
                    shouldConfirm = extracted.intent === 'confirm' && (state.awaitingConfirmation || hasAllBookingData);
                    console.log("\uD83D\uDC87 [Salon v2] CONFIRM CHECK: intent=".concat(extracted.intent, " awaiting=").concat(state.awaitingConfirmation, " hasAllData=").concat(!!hasAllBookingData, " shouldConfirm=").concat(shouldConfirm));
                    if (!shouldConfirm) return [3 /*break*/, 16];
                    console.log("\uD83D\uDC87 [Salon v2] CONFIRM PATH: svc=".concat((_p = state.service) === null || _p === void 0 ? void 0 : _p.name, " date=").concat(state.date, " time=").concat(state.time));
                    if (!(!state.service || !state.date || !state.time)) return [3 /*break*/, 6];
                    state.awaitingConfirmation = false;
                    console.log("\uD83D\uDC87 [Salon v2] CONFIRM FAIL: missing data");
                    _d = {};
                    return [4 /*yield*/, generateAIResponse(message, history_1, salonData, state, 'Faltam dados para confirmar. Pergunte o que falta.')];
                case 5: return [2 /*return*/, (_d.text = _5.sent(), _d)];
                case 6:
                    // REVALIDATE SLOT
                    console.log("\uD83D\uDC87 [Salon v2] REVALIDATING slot: ".concat(state.date, " ").concat(state.time));
                    return [4 /*yield*/, (0, salonAvailability_1.validateSlot)(userId, state.date, state.time, (_q = state.professional) === null || _q === void 0 ? void 0 : _q.id, state.service.duration_minutes)];
                case 7:
                    _a = _5.sent(), valid = _a.valid, availableSlots = _a.availableSlots;
                    console.log("\uD83D\uDC87 [Salon v2] VALIDATE result: valid=".concat(valid, " availableSlots=").concat(availableSlots.length));
                    if (!!valid) return [3 /*break*/, 9];
                    requestedTime = state.time;
                    state.awaitingConfirmation = false;
                    state.time = null;
                    breakConfig = (_r = config.opening_hours) === null || _r === void 0 ? void 0 : _r['__break'];
                    return [4 /*yield*/, generateSlotSuggestionMessageLLM({
                            message: message,
                            conversationHistory: history_1,
                            salonData: salonData,
                            bookingState: state,
                            date: state.date,
                            allowedSlots: availableSlots,
                            breakConfig: breakConfig,
                            serviceName: (_s = state.service) === null || _s === void 0 ? void 0 : _s.name,
                        })];
                case 8:
                    slotResult = _5.sent();
                    return [2 /*return*/, { text: slotResult.messageText }];
                case 9:
                    // CREATE APPOINTMENT
                    console.log("\uD83D\uDC87 [Salon v2] CREATING appointment...");
                    return [4 /*yield*/, createSalonAppointment(userId, conversationId, {
                            clientName: state.customerName || 'Cliente',
                            clientPhone: customerPhone,
                            serviceId: state.service.id,
                            serviceName: state.service.name,
                            professionalId: (_t = state.professional) === null || _t === void 0 ? void 0 : _t.id,
                            professionalName: (_u = state.professional) === null || _u === void 0 ? void 0 : _u.name,
                            appointmentDate: state.date,
                            startTime: state.time,
                            durationMinutes: state.service.duration_minutes || 30,
                        })];
                case 10:
                    result = _5.sent();
                    console.log("\uD83D\uDC87 [Salon v2] CREATE result: success=".concat(result.success, " id=").concat(result.appointmentId, " error=").concat(result.error));
                    if (!result.success) return [3 /*break*/, 12];
                    dateFormatted = formatDatePtBr(state.date);
                    svcName = state.service.name;
                    profName = (_v = state.professional) === null || _v === void 0 ? void 0 : _v.name;
                    timeStr = state.time;
                    resetBookingState(userId, customerPhone, conversationId);
                    _e = {};
                    return [4 /*yield*/, generateAIResponse(message, history_1, salonData, __assign(__assign({}, state), { service: null, professional: null, date: null, time: null, awaitingConfirmation: false, customerName: state.customerName, customerPhone: customerPhone, createdAt: new Date(), lastUpdated: new Date() }), "AGENDAMENTO CRIADO COM SUCESSO! Dados: ".concat(svcName).concat(profName ? ' com ' + profName : '', " em ").concat(dateFormatted, " \u00E0s ").concat(timeStr, ". Confirme ao cliente de forma entusiasmada e amig\u00E1vel."))];
                case 11: return [2 /*return*/, (_e.text = _5.sent(),
                        _e.shouldSave = true,
                        _e)];
                case 12:
                    if (!(result.suggestedSlots && result.suggestedSlots.length > 0)) return [3 /*break*/, 14];
                    state.awaitingConfirmation = false;
                    state.time = null;
                    breakConfig = (_w = config.opening_hours) === null || _w === void 0 ? void 0 : _w['__break'];
                    return [4 /*yield*/, generateSlotSuggestionMessageLLM({
                            message: message,
                            conversationHistory: history_1,
                            salonData: salonData,
                            bookingState: state,
                            date: state.date,
                            allowedSlots: result.suggestedSlots,
                            breakConfig: breakConfig,
                            serviceName: (_x = state.service) === null || _x === void 0 ? void 0 : _x.name,
                        })];
                case 13:
                    slotResult = _5.sent();
                    return [2 /*return*/, { text: slotResult.messageText }];
                case 14:
                    _f = {};
                    return [4 /*yield*/, generateAIResponse(message, history_1, salonData, state, 'Erro ao criar agendamento. Peça desculpas e peça para tentar novamente.')];
                case 15: return [2 /*return*/, (_f.text = _5.sent(), _f)];
                case 16:
                    availabilityRegex = /quais\s+hor[áa]rios|tem\s+hor[áa]rio|hor[áa]rio\s+dispon[íi]vel|tem\s+vaga|disponibilidade|que\s+horas?\s+tem|horarios\s+livres|agenda\s+livre/i;
                    isAvailabilityQuery = extracted.intent === 'check_availability' ||
                        (availabilityRegex.test(message) && !state.service && (extracted.date || state.date));
                    if (!isAvailabilityQuery) return [3 /*break*/, 23];
                    targetDate = extracted.date || state.date || (function () {
                        // Fallback: detectar "amanhã" via regex
                        if (/amanh[ãa]/i.test(message)) {
                            var tomorrow = new Date(getBrazilNow());
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            var y = tomorrow.getFullYear();
                            var m = (tomorrow.getMonth() + 1).toString().padStart(2, '0');
                            var d = tomorrow.getDate().toString().padStart(2, '0');
                            return "".concat(y, "-").concat(m, "-").concat(d);
                        }
                        if (/hoje/i.test(message))
                            return getBrazilToday();
                        return null;
                    })();
                    if (!(targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate))) return [3 /*break*/, 23];
                    // Salvar data no estado
                    state.date = targetDate;
                    state.lastUpdated = new Date();
                    defaultDuration = config.slot_duration || 30;
                    return [4 /*yield*/, getAvailableSlots(userId, targetDate, (_y = state.professional) === null || _y === void 0 ? void 0 : _y.id, defaultDuration)];
                case 17:
                    slots = _5.sent();
                    dateFormatted = formatDatePtBr(targetDate);
                    console.log("\uD83D\uDC87 [Salon v2] AVAILABILITY CHECK: date=".concat(targetDate, " slots=").concat(slots.length));
                    if (!(slots.length === 0)) return [3 /*break*/, 22];
                    nextDate = new Date(targetDate + 'T12:00:00');
                    nextSlots = [];
                    nextDateStr = '';
                    i = 1;
                    _5.label = 18;
                case 18:
                    if (!(i <= 7)) return [3 /*break*/, 21];
                    nextDate.setDate(nextDate.getDate() + 1);
                    y = nextDate.getFullYear();
                    m = (nextDate.getMonth() + 1).toString().padStart(2, '0');
                    d = nextDate.getDate().toString().padStart(2, '0');
                    nextDateStr = "".concat(y, "-").concat(m, "-").concat(d);
                    return [4 /*yield*/, getAvailableSlots(userId, nextDateStr, undefined, defaultDuration)];
                case 19:
                    nextSlots = _5.sent();
                    if (nextSlots.length > 0)
                        return [3 /*break*/, 21];
                    _5.label = 20;
                case 20:
                    i++;
                    return [3 /*break*/, 18];
                case 21:
                    if (nextSlots.length > 0) {
                        nextFormatted = formatDatePtBr(nextDateStr);
                        sampleSlots = nextSlots.slice(0, 6).join(', ');
                        return [2 /*return*/, { text: "Infelizmente n\u00E3o temos hor\u00E1rios dispon\u00EDveis para ".concat(dateFormatted, " \uD83D\uDE14\n\nO pr\u00F3ximo dia com vagas \u00E9 ").concat(nextFormatted, ". Alguns hor\u00E1rios: ").concat(sampleSlots, "\n\nGostaria de agendar nesse dia? Qual servi\u00E7o deseja?") }];
                    }
                    else {
                        return [2 /*return*/, { text: "Infelizmente n\u00E3o temos hor\u00E1rios dispon\u00EDveis para ".concat(dateFormatted, " e nem nos pr\u00F3ximos dias. Por favor, entre em contato novamente em breve! \uD83D\uDE14") }];
                    }
                    _5.label = 22;
                case 22:
                    displaySlots = void 0;
                    if (slots.length <= 8) {
                        displaySlots = slots;
                    }
                    else {
                        step = Math.floor(slots.length / 7);
                        displaySlots = [];
                        for (i = 0; i < slots.length && displaySlots.length < 8; i += step) {
                            displaySlots.push(slots[i]);
                        }
                        // Garantir o último slot
                        if (!displaySlots.includes(slots[slots.length - 1])) {
                            displaySlots[displaySlots.length - 1] = slots[slots.length - 1];
                        }
                    }
                    slotsFormatted = displaySlots.join(', ');
                    totalMsg = slots.length > 8 ? " (".concat(slots.length, " hor\u00E1rios no total)") : '';
                    servicesHint = services.length > 0
                        ? "\n\nQual servi\u00E7o voc\u00EA gostaria? Temos: ".concat(services.slice(0, 5).map(function (s) { return s.name; }).join(', '))
                        : '';
                    return [2 /*return*/, { text: "Para ".concat(dateFormatted, ", temos os seguintes hor\u00E1rios dispon\u00EDveis").concat(totalMsg, ":\n\n\uD83D\uDD50 ").concat(slotsFormatted, "\n").concat(servicesHint) }];
                case 23:
                    needsService = !state.service && services.length > 0;
                    needsProfessional = !state.professional && config.use_professionals && professionals.length > 0;
                    needsDate = !state.date;
                    needsTime = !state.time;
                    isBookingIntent = extracted.intent === 'booking' || state.service !== null || state.date !== null;
                    if (!(isBookingIntent && state.service && state.date && state.time && !state.awaitingConfirmation)) return [3 /*break*/, 28];
                    return [4 /*yield*/, (0, salonAvailability_1.validateSlot)(userId, state.date, state.time, (_z = state.professional) === null || _z === void 0 ? void 0 : _z.id, state.service.duration_minutes)];
                case 24:
                    _b = _5.sent(), valid = _b.valid, availableSlots = _b.availableSlots;
                    if (!!valid) return [3 /*break*/, 26];
                    closest = (0, salonAvailability_1.findClosestSlot)(state.time, availableSlots);
                    state.time = null;
                    breakConfig = (_0 = config.opening_hours) === null || _0 === void 0 ? void 0 : _0['__break'];
                    return [4 /*yield*/, generateSlotSuggestionMessageLLM({
                            message: message,
                            conversationHistory: history_1,
                            salonData: salonData,
                            bookingState: state,
                            date: state.date,
                            allowedSlots: availableSlots,
                            breakConfig: breakConfig,
                            serviceName: (_1 = state.service) === null || _1 === void 0 ? void 0 : _1.name,
                        })];
                case 25:
                    slotResult = _5.sent();
                    return [2 /*return*/, { text: slotResult.messageText }];
                case 26:
                    // SLOT VALID - ask confirmation
                    state.awaitingConfirmation = true;
                    state.lastUpdated = new Date();
                    dateFormatted = formatDatePtBr(state.date);
                    price = state.service.price ? "R$ ".concat(state.service.price.toFixed(2).replace('.', ',')) : null;
                    confirmContext = "Todos os dados est\u00E3o completos e o hor\u00E1rio est\u00E1 DISPON\u00CDVEL. Fa\u00E7a um resumo e pergunte \"Posso confirmar?\":\n- Servi\u00E7o: ".concat(state.service.name).concat(price ? ' (' + price + ')' : '', "\n- ").concat(state.professional ? 'Profissional: ' + state.professional.name : 'Sem profissional específico', "\n- Data: ").concat(dateFormatted, "\n- Hor\u00E1rio: ").concat(state.time, "\nPe\u00E7a confirma\u00E7\u00E3o do cliente.");
                    _g = {};
                    return [4 /*yield*/, generateAIResponse(message, history_1, salonData, state, confirmContext)];
                case 27: return [2 /*return*/, (_g.text = _5.sent(), _g)];
                case 28:
                    if (!isBookingIntent) return [3 /*break*/, 37];
                    contextMsg = '';
                    if (!needsService) return [3 /*break*/, 29];
                    svcList = services.map(function (s) {
                        var p = s.price ? " (R$ ".concat(s.price.toFixed(2).replace('.', ','), ")") : '';
                        return "".concat(s.name).concat(p);
                    }).join(', ');
                    contextMsg = "O cliente quer agendar mas n\u00E3o escolheu o servi\u00E7o ainda. Servi\u00E7os: ".concat(svcList, ". Pergunte qual servi\u00E7o deseja.");
                    return [3 /*break*/, 35];
                case 29:
                    if (!needsProfessional) return [3 /*break*/, 30];
                    profNames = professionals.map(function (p) { return p.name; }).join(', ');
                    contextMsg = "Servi\u00E7o escolhido: ".concat(state.service.name, ". Profissionais dispon\u00EDveis: ").concat(profNames, ". Pergunte com qual profissional prefere ou se tanto faz.");
                    return [3 /*break*/, 35];
                case 30:
                    if (!needsDate) return [3 /*break*/, 31];
                    contextMsg = "Servi\u00E7o: ".concat(state.service.name).concat(state.professional ? ', Profissional: ' + state.professional.name : '', ". Pergunte qual dia/data o cliente prefere.");
                    return [3 /*break*/, 35];
                case 31:
                    if (!needsTime) return [3 /*break*/, 35];
                    return [4 /*yield*/, getAvailableSlots(userId, state.date, (_2 = state.professional) === null || _2 === void 0 ? void 0 : _2.id, state.service.duration_minutes)];
                case 32:
                    slots = _5.sent();
                    if (!(slots.length === 0)) return [3 /*break*/, 33];
                    requestedDate = state.date || '';
                    state.date = null;
                    contextMsg = "N\u00E3o h\u00E1 hor\u00E1rios dispon\u00EDveis para ".concat(formatDatePtBr(requestedDate), ". Pe\u00E7a outra data ao cliente.");
                    return [3 /*break*/, 35];
                case 33:
                    breakConfig = (_3 = config.opening_hours) === null || _3 === void 0 ? void 0 : _3['__break'];
                    return [4 /*yield*/, generateSlotSuggestionMessageLLM({
                            message: message,
                            conversationHistory: history_1,
                            salonData: salonData,
                            bookingState: state,
                            date: state.date,
                            allowedSlots: slots,
                            breakConfig: breakConfig,
                            serviceName: (_4 = state.service) === null || _4 === void 0 ? void 0 : _4.name,
                        })];
                case 34:
                    slotResult = _5.sent();
                    // Retornar diretamente a mensagem validada (sem passar por generateAIResponse)
                    return [2 /*return*/, { text: slotResult.messageText }];
                case 35:
                    _h = {};
                    return [4 /*yield*/, generateAIResponse(message, history_1, salonData, state, contextMsg)];
                case 36: return [2 /*return*/, (_h.text = _5.sent(), _h)];
                case 37:
                    if (!(extracted.intent === 'info_services' || extracted.intent === 'info_prices')) return [3 /*break*/, 39];
                    svcInfo = services.map(function (s) {
                        var p = s.price ? "R$ ".concat(s.price.toFixed(2).replace('.', ',')) : 'Consulte';
                        return "".concat(s.name, ": ").concat(p, " (").concat(s.duration_minutes, "min)");
                    }).join(', ');
                    _j = {};
                    return [4 /*yield*/, generateAIResponse(message, history_1, salonData, state, "Informe os servi\u00E7os e pre\u00E7os: ".concat(svcInfo))];
                case 38: return [2 /*return*/, (_j.text = _5.sent(), _j)];
                case 39:
                    if (!(extracted.intent === 'info_hours')) return [3 /*break*/, 41];
                    hours = formatSalonHours(config.opening_hours);
                    _k = {};
                    return [4 /*yield*/, generateAIResponse(message, history_1, salonData, state, "Informe os hor\u00E1rios de funcionamento:\n".concat(hours))];
                case 40: return [2 /*return*/, (_k.text = _5.sent(), _k)];
                case 41:
                    _l = {};
                    return [4 /*yield*/, generateAIResponse(message, history_1, salonData, state, '')];
                case 42: 
                // 8. GENERAL CONVERSATION - AI handles naturally
                return [2 /*return*/, (_l.text = _5.sent(), _l)];
                case 43:
                    err_8 = _5.sent();
                    console.error('❌ [Salon] Erro ao gerar resposta:', err_8);
                    return [2 /*return*/, null];
                case 44: return [2 /*return*/];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// EXPORTS PARA COMPATIBILIDADE
// ═══════════════════════════════════════════════════════════════════════
function isSalonActive(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var config;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getSalonConfig(userId)];
                case 1:
                    config = _a.sent();
                    return [2 /*return*/, (config === null || config === void 0 ? void 0 : config.is_active) === true];
            }
        });
    });
}
// Legacy exports (unused but kept for import compatibility)
function detectSalonIntent() { return 'OTHER'; }
