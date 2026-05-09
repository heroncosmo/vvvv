"use strict";
/**
 * Serviço de Lembretes de Agendamento via IA
 *
 * Este serviço NÃO envia mensagens automáticas engessadas.
 * Em vez disso, ele usa a IA do agente para gerar mensagens NATURAIS
 * que se adaptam ao estilo de cada negócio.
 *
 * Fluxo:
 * 1. Verifica agendamentos que precisam de lembrete (X horas antes)
 * 2. Busca histórico da conversa com o cliente
 * 3. Pede para a IA gerar uma mensagem natural de lembrete
 * 4. Envia via WhatsApp como se fosse a IA conversando normalmente
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
exports.appointmentReminderService = exports.AppointmentReminderService = void 0;
exports.sendCustomMessageToClient = sendCustomMessageToClient;
exports.sendConfirmationToClientViaAI = sendConfirmationToClientViaAI;
exports.sendCancellationToClientViaAI = sendCancellationToClientViaAI;
var supabaseAuth_1 = require("./supabaseAuth");
var db_1 = require("./db");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var llm_1 = require("./llm");
var whatsapp_1 = require("./whatsapp");
var storage_1 = require("./storage");
var messageQueueService_1 = require("./messageQueueService");
// ============================================================================
// CONFIGURAÇÕES
// ============================================================================
var CHECK_INTERVAL_MS = 10 * 60 * 1000; // Verificar a cada 10 minutos
// Cache de lembretes já enviados para evitar duplicatas
var sentRemindersCache = new Map(); // appointmentId -> timestamp
// Limpar cache a cada hora
setInterval(function () {
    var now = Date.now();
    var ONE_DAY = 24 * 60 * 60 * 1000;
    for (var _i = 0, _a = sentRemindersCache.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], timestamp = _b[1];
        if (now - timestamp > ONE_DAY) {
            sentRemindersCache.delete(key);
        }
    }
}, 60 * 60 * 1000);
// ============================================================================
// CLASSE PRINCIPAL
// ============================================================================
var AppointmentReminderService = /** @class */ (function () {
    function AppointmentReminderService() {
        this.checkInterval = null;
        this.isRunning = false;
    }
    AppointmentReminderService.prototype.start = function () {
        var _this = this;
        if (this.isRunning)
            return;
        this.isRunning = true;
        console.log("📅 [APPOINTMENT-REMINDER] Serviço de lembretes iniciado");
        // Verificar a cada 10 minutos
        this.checkInterval = setInterval(function () { return _this.processReminders(); }, CHECK_INTERVAL_MS);
        // Primeira verificação após 2 minutos
        setTimeout(function () { return _this.processReminders(); }, 2 * 60 * 1000);
    };
    AppointmentReminderService.prototype.stop = function () {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.isRunning = false;
        console.log("🛑 [APPOINTMENT-REMINDER] Serviço parado");
    };
    /**
     * Processa todos os agendamentos que precisam de lembrete
     */
    AppointmentReminderService.prototype.processReminders = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, configs, configError, _i, configs_1, config, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 6, , 7]);
                        console.log("🔍 [APPOINTMENT-REMINDER] Verificando agendamentos...");
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('scheduling_config')
                                .select('*')
                                .eq('is_enabled', true)
                                .eq('send_reminder', true)];
                    case 1:
                        _a = _b.sent(), configs = _a.data, configError = _a.error;
                        if (configError || !configs || configs.length === 0) {
                            console.log("📅 [APPOINTMENT-REMINDER] Nenhum usuário com lembretes ativos");
                            return [2 /*return*/];
                        }
                        _i = 0, configs_1 = configs;
                        _b.label = 2;
                    case 2:
                        if (!(_i < configs_1.length)) return [3 /*break*/, 5];
                        config = configs_1[_i];
                        return [4 /*yield*/, this.processUserReminders(config)];
                    case 3:
                        _b.sent();
                        _b.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        error_1 = _b.sent();
                        console.error("❌ [APPOINTMENT-REMINDER] Erro ao processar lembretes:", error_1);
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Processa lembretes para um usuário específico
     * Suporta múltiplos tempos de lembrete (ex: 24h, 2h, 30min antes)
     */
    AppointmentReminderService.prototype.processUserReminders = function (config) {
        return __awaiter(this, void 0, void 0, function () {
            var now, reminderTimes, maxReminder, today, dayAfterTomorrow, _a, appointments, error, _i, appointments_1, appointment, appointmentDateTime, hoursUntilAppointment, sentTimes, _b, reminderTimes_1, reminderHour, cacheKey, windowMinutes, updatedSentTimes, error_2;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 9, , 10]);
                        now = new Date();
                        reminderTimes = (config.reminder_times && Array.isArray(config.reminder_times) && config.reminder_times.length > 0)
                            ? config.reminder_times.sort(function (a, b) { return b - a; }) // Maior primeiro
                            : [config.reminder_hours_before || 24];
                        maxReminder = Math.max.apply(Math, reminderTimes);
                        today = now.toISOString().split('T')[0];
                        dayAfterTomorrow = new Date(now.getTime() + maxReminder * 60 * 60 * 1000 + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('appointments')
                                .select('*, reminder_times_sent')
                                .eq('user_id', config.user_id)
                                .in('status', ['confirmed', 'pending'])
                                .gte('appointment_date', today)
                                .lte('appointment_date', dayAfterTomorrow)
                                .order('appointment_date', { ascending: true })
                                .order('start_time', { ascending: true })];
                    case 1:
                        _a = _c.sent(), appointments = _a.data, error = _a.error;
                        if (error || !appointments || appointments.length === 0) {
                            return [2 /*return*/];
                        }
                        console.log("\uD83D\uDCC5 [APPOINTMENT-REMINDER] ".concat(appointments.length, " agendamentos encontrados para user ").concat(config.user_id));
                        _i = 0, appointments_1 = appointments;
                        _c.label = 2;
                    case 2:
                        if (!(_i < appointments_1.length)) return [3 /*break*/, 8];
                        appointment = appointments_1[_i];
                        appointmentDateTime = new Date("".concat(appointment.appointment_date, "T").concat(appointment.start_time));
                        hoursUntilAppointment = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
                        // Pular se já passou
                        if (hoursUntilAppointment <= 0)
                            return [3 /*break*/, 7];
                        sentTimes = appointment.reminder_times_sent || [];
                        _b = 0, reminderTimes_1 = reminderTimes;
                        _c.label = 3;
                    case 3:
                        if (!(_b < reminderTimes_1.length)) return [3 /*break*/, 7];
                        reminderHour = reminderTimes_1[_b];
                        // Pular se este lembrete já foi enviado
                        if (sentTimes.includes(reminderHour))
                            return [3 /*break*/, 6];
                        cacheKey = "".concat(appointment.id, "_").concat(reminderHour, "h");
                        if (sentRemindersCache.has(cacheKey))
                            return [3 /*break*/, 6];
                        windowMinutes = 15;
                        if (!(hoursUntilAppointment <= reminderHour && hoursUntilAppointment > (reminderHour - (windowMinutes / 60 + 0.5)))) return [3 /*break*/, 6];
                        console.log("\uD83D\uDCE4 [APPOINTMENT-REMINDER] Enviando lembrete ".concat(reminderHour, "h para ").concat(appointment.client_name, " (").concat(cacheKey, ")"));
                        return [4 /*yield*/, this.sendReminderViaAI(appointment, config, reminderHour)];
                    case 4:
                        _c.sent();
                        updatedSentTimes = __spreadArray(__spreadArray([], sentTimes, true), [reminderHour], false);
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('appointments')
                                .update({
                                reminder_times_sent: updatedSentTimes,
                                // Manter compatibilidade: marcar reminder_sent=true quando todos foram enviados
                                reminder_sent: updatedSentTimes.length >= reminderTimes.length
                            })
                                .eq('id', appointment.id)];
                    case 5:
                        _c.sent();
                        // Adicionar ao cache
                        sentRemindersCache.set(cacheKey, Date.now());
                        // Só enviar um lembrete por ciclo por agendamento
                        return [3 /*break*/, 7];
                    case 6:
                        _b++;
                        return [3 /*break*/, 3];
                    case 7:
                        _i++;
                        return [3 /*break*/, 2];
                    case 8: return [3 /*break*/, 10];
                    case 9:
                        error_2 = _c.sent();
                        console.error("\u274C [APPOINTMENT-REMINDER] Erro ao processar user ".concat(config.user_id, ":"), error_2);
                        return [3 /*break*/, 10];
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Envia lembrete usando a IA do agente (mensagem natural, não automática)
     */
    AppointmentReminderService.prototype.sendReminderViaAI = function (appointment, config, reminderHour) {
        return __awaiter(this, void 0, void 0, function () {
            var userId, clientPhone, sessions, session_1, connection, conversation, agentConfig, recentMessages, reminderMessage_1, jid_1, sentMessage, error_3;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        userId = config.user_id;
                        clientPhone = appointment.client_phone;
                        console.log("\uD83D\uDCE4 [APPOINTMENT-REMINDER] Preparando lembrete para ".concat(clientPhone, " - ").concat(appointment.client_name));
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 13, , 14]);
                        sessions = (0, whatsapp_1.getSessions)();
                        session_1 = sessions.get(userId);
                        if (!(session_1 === null || session_1 === void 0 ? void 0 : session_1.socket)) {
                            console.log("\u26A0\uFE0F [APPOINTMENT-REMINDER] WhatsApp n\u00E3o conectado para user ".concat(userId));
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, storage_1.storage.getConnectionByUserId(userId)];
                    case 2:
                        connection = _a.sent();
                        if (!connection) {
                            console.log("\u26A0\uFE0F [APPOINTMENT-REMINDER] Conex\u00E3o n\u00E3o encontrada para user ".concat(userId));
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                                where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connection.id), (0, drizzle_orm_1.eq)(schema_1.conversations.contactNumber, clientPhone))
                            })];
                    case 3:
                        conversation = _a.sent();
                        if (!conversation) {
                            console.log("\u26A0\uFE0F [APPOINTMENT-REMINDER] Conversa n\u00E3o encontrada com ".concat(clientPhone));
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, db_1.db.query.businessAgentConfigs.findFirst({
                                where: (0, drizzle_orm_1.eq)(schema_1.businessAgentConfigs.userId, userId)
                            })];
                    case 4:
                        agentConfig = _a.sent();
                        return [4 /*yield*/, db_1.db.query.messages.findMany({
                                where: (0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conversation.id),
                                orderBy: [(0, drizzle_orm_1.desc)(schema_1.messages.timestamp)],
                                limit: 10
                            })];
                    case 5:
                        recentMessages = _a.sent();
                        return [4 /*yield*/, this.generateReminderWithAI(appointment, config, agentConfig, recentMessages.reverse())];
                    case 6:
                        reminderMessage_1 = _a.sent();
                        if (!reminderMessage_1) {
                            console.log("\u26A0\uFE0F [APPOINTMENT-REMINDER] IA n\u00E3o gerou mensagem de lembrete");
                            return [2 /*return*/];
                        }
                        jid_1 = conversation.remoteJid || "".concat(clientPhone, "@s.whatsapp.net");
                        console.log("\uD83D\uDCE4 [APPOINTMENT-REMINDER] Enviando para ".concat(jid_1, ": ").concat(reminderMessage_1.substring(0, 50), "..."));
                        return [4 /*yield*/, messageQueueService_1.messageQueueService.executeWithDelay(userId, 'lembrete de agendamento', function () { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, session_1.socket.sendMessage(jid_1, { text: reminderMessage_1 })];
                                        case 1: return [2 /*return*/, _a.sent()];
                                    }
                                });
                            }); })];
                    case 7:
                        sentMessage = _a.sent();
                        if (!(sentMessage === null || sentMessage === void 0 ? void 0 : sentMessage.key.id)) return [3 /*break*/, 9];
                        return [4 /*yield*/, storage_1.storage.createMessage({
                                conversationId: conversation.id,
                                messageId: sentMessage.key.id,
                                fromMe: true,
                                text: reminderMessage_1,
                                timestamp: new Date(),
                                status: "sent",
                            })];
                    case 8:
                        _a.sent();
                        _a.label = 9;
                    case 9: 
                    // 8. Atualizar conversa
                    return [4 /*yield*/, storage_1.storage.updateConversation(conversation.id, {
                            lastMessageText: reminderMessage_1,
                            lastMessageTime: new Date(),
                        })];
                    case 10:
                        // 8. Atualizar conversa
                        _a.sent();
                        if (!!reminderHour) return [3 /*break*/, 12];
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('appointments')
                                .update({ reminder_sent: true })
                                .eq('id', appointment.id)];
                    case 11:
                        _a.sent();
                        sentRemindersCache.set(appointment.id, Date.now());
                        _a.label = 12;
                    case 12:
                        console.log("\u2705 [APPOINTMENT-REMINDER] Lembrete ".concat(reminderHour ? reminderHour + 'h' : '', " enviado com sucesso para ").concat(clientPhone));
                        return [3 /*break*/, 14];
                    case 13:
                        error_3 = _a.sent();
                        console.error("\u274C [APPOINTMENT-REMINDER] Erro ao enviar lembrete:", error_3);
                        return [3 /*break*/, 14];
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Gera mensagem de lembrete usando a IA do agente
     * A mensagem será NATURAL e adaptada ao estilo do negócio
     */
    AppointmentReminderService.prototype.generateReminderWithAI = function (appointment, config, agentConfig, conversationHistory) {
        return __awaiter(this, void 0, void 0, function () {
            var mistral, appointmentDate, dayNames, dayName, formattedDate, formattedTime, historyContext, systemPrompt, response, message, error_4;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, (0, llm_1.getLLMClient)()];
                    case 1:
                        mistral = _d.sent();
                        if (!mistral) {
                            console.error("❌ [APPOINTMENT-REMINDER] Mistral não disponível");
                            return [2 /*return*/, config.reminder_message || null]; // Fallback para mensagem padrão
                        }
                        appointmentDate = new Date("".concat(appointment.appointment_date, "T").concat(appointment.start_time));
                        dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
                        dayName = dayNames[appointmentDate.getDay()];
                        formattedDate = "".concat(appointmentDate.getDate().toString().padStart(2, '0'), "/").concat((appointmentDate.getMonth() + 1).toString().padStart(2, '0'));
                        formattedTime = appointment.start_time.substring(0, 5);
                        historyContext = conversationHistory
                            .map(function (m) { return "".concat(m.fromMe ? 'Atendente' : 'Cliente', ": ").concat(m.text || '[mídia]'); })
                            .join('\n');
                        systemPrompt = "Voc\u00EA \u00E9 o assistente de atendimento de um neg\u00F3cio.\n".concat((agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.prompt) ? "\nContexto do neg\u00F3cio:\n".concat(agentConfig.prompt.substring(0, 500), "...") : '', "\n\nVoc\u00EA precisa enviar uma mensagem de LEMBRETE para o cliente sobre um agendamento.\nA mensagem deve ser:\n- NATURAL e amig\u00E1vel (como se voc\u00EA estivesse conversando normalmente)\n- Adaptada ao estilo do neg\u00F3cio (formal/informal conforme configurado)\n- Curta e objetiva (1-3 frases)\n- N\u00C3O deve parecer autom\u00E1tica ou rob\u00F3tica\n- Pode usar emojis se for um neg\u00F3cio mais descontra\u00EDdo\n\nInforma\u00E7\u00F5es do agendamento:\n- Cliente: ").concat(appointment.client_name, "\n- Servi\u00E7o: ").concat(appointment.service_name, "\n- Data: ").concat(dayName, ", ").concat(formattedDate, "\n- Hor\u00E1rio: ").concat(formattedTime, "\n").concat(appointment.location ? "- Local: ".concat(appointment.location) : '', "\n\n").concat(historyContext ? "\n\u00DAltimas mensagens da conversa:\n".concat(historyContext) : '', "\n\n").concat(config.reminder_message ? "\nModelo de refer\u00EAncia (adapte naturalmente): ".concat(config.reminder_message) : '', "\n\nGere apenas a mensagem de lembrete, sem explica\u00E7\u00F5es adicionais.");
                        return [4 /*yield*/, mistral.chat.complete({
                                messages: [
                                    { role: "system", content: systemPrompt },
                                    { role: "user", content: "Gere a mensagem de lembrete de agendamento para o cliente." }
                                ],
                                temperature: 0.7,
                                maxTokens: 150
                            })];
                    case 2:
                        response = _d.sent();
                        message = (_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
                        if (typeof message === 'string' && message.trim()) {
                            return [2 /*return*/, message.trim()];
                        }
                        // Fallback para mensagem configurada
                        return [2 /*return*/, config.reminder_message || "Oi ".concat(appointment.client_name, "! \uD83D\uDE0A Passando para lembrar do seu ").concat(appointment.service_name, " ").concat(dayName, " \u00E0s ").concat(formattedTime, ". Te esperamos!")];
                    case 3:
                        error_4 = _d.sent();
                        console.error("❌ [APPOINTMENT-REMINDER] Erro ao gerar mensagem com IA:", error_4);
                        // Fallback para mensagem configurada
                        return [2 /*return*/, config.reminder_message || null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Força envio de lembrete para um agendamento específico (uso manual)
     */
    AppointmentReminderService.prototype.sendManualReminder = function (appointmentId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, appointment, error, config, error_5;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('appointments')
                                .select('*')
                                .eq('id', appointmentId)
                                .single()];
                    case 1:
                        _a = _b.sent(), appointment = _a.data, error = _a.error;
                        if (error || !appointment) {
                            return [2 /*return*/, { success: false, error: 'Agendamento não encontrado' }];
                        }
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('scheduling_config')
                                .select('*')
                                .eq('user_id', appointment.user_id)
                                .single()];
                    case 2:
                        config = (_b.sent()).data;
                        if (!config) {
                            return [2 /*return*/, { success: false, error: 'Configuração de agendamento não encontrada' }];
                        }
                        return [4 /*yield*/, this.sendReminderViaAI(appointment, __assign(__assign({}, config), { user_id: appointment.user_id }))];
                    case 3:
                        _b.sent();
                        return [2 /*return*/, { success: true, message: 'Lembrete enviado com sucesso' }];
                    case 4:
                        error_5 = _b.sent();
                        return [2 /*return*/, { success: false, error: error_5.message || 'Erro ao enviar lembrete' }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    return AppointmentReminderService;
}());
exports.AppointmentReminderService = AppointmentReminderService;
// Singleton
exports.appointmentReminderService = new AppointmentReminderService();
/**
 * Envia mensagem personalizada quando o negocio confirma agendamento manual
 */
function sendCustomMessageToClient(appointment, userId, customMessage) {
    return __awaiter(this, void 0, void 0, function () {
        var clientPhone, finalMessage, sessions, session_2, connection, conversation, jid_2, sentMessage, error_6;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    clientPhone = appointment.client_phone;
                    finalMessage = (customMessage || "").trim();
                    if (!finalMessage)
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 10, , 11]);
                    sessions = (0, whatsapp_1.getSessions)();
                    session_2 = sessions.get(userId);
                    if (!(session_2 === null || session_2 === void 0 ? void 0 : session_2.socket)) {
                        console.log("[CUSTOM CONFIRMATION] WhatsApp nao conectado para user ".concat(userId));
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, storage_1.storage.getConnectionByUserId(userId)];
                case 2:
                    connection = _a.sent();
                    if (!connection) {
                        console.log("[CUSTOM CONFIRMATION] Conexao nao encontrada para user ".concat(userId));
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, storage_1.storage.getConversationByContactNumber(connection.id, clientPhone)];
                case 3:
                    conversation = _a.sent();
                    if (!!conversation) return [3 /*break*/, 5];
                    return [4 /*yield*/, storage_1.storage.createConversation({
                            connectionId: connection.id,
                            contactNumber: clientPhone,
                            contactName: appointment.client_name,
                            lastMessageText: null,
                            lastMessageTime: null,
                            lastMessageFromMe: true,
                        })];
                case 4:
                    conversation = _a.sent();
                    _a.label = 5;
                case 5:
                    jid_2 = conversation.remoteJid || "".concat(clientPhone, "@s.whatsapp.net");
                    return [4 /*yield*/, messageQueueService_1.messageQueueService.executeWithDelay(userId, "custom confirmation", function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, session_2.socket.sendMessage(jid_2, { text: finalMessage })];
                                    case 1: return [2 /*return*/, _a.sent()];
                                }
                            });
                        }); })];
                case 6:
                    sentMessage = _a.sent();
                    if (!(sentMessage === null || sentMessage === void 0 ? void 0 : sentMessage.key.id)) return [3 /*break*/, 8];
                    return [4 /*yield*/, storage_1.storage.createMessage({
                            conversationId: conversation.id,
                            messageId: sentMessage.key.id,
                            fromMe: true,
                            text: finalMessage,
                            timestamp: new Date(),
                            status: "sent",
                        })];
                case 7:
                    _a.sent();
                    _a.label = 8;
                case 8: return [4 /*yield*/, storage_1.storage.updateConversation(conversation.id, {
                        lastMessageText: finalMessage,
                        lastMessageTime: new Date(),
                        lastMessageFromMe: true,
                        hasReplied: true,
                    })];
                case 9:
                    _a.sent();
                    return [3 /*break*/, 11];
                case 10:
                    error_6 = _a.sent();
                    console.error("[CUSTOM CONFIRMATION] Erro ao enviar mensagem personalizada:", error_6);
                    return [3 /*break*/, 11];
                case 11: return [2 /*return*/];
            }
        });
    });
}
/**
 * Envia confirmação ao cliente quando o negócio ACEITA o agendamento
 * Usa a IA para gerar mensagem natural adaptada ao estilo do negócio
 */
function sendConfirmationToClientViaAI(appointment, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var clientPhone, config, sessions, session_3, connection, conversation, agentConfig, recentMessages, confirmationMessage_1, jid_3, sentMessage, error_7;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    clientPhone = appointment.client_phone;
                    console.log("\uD83D\uDCE4 [CONFIRMATION] Enviando confirma\u00E7\u00E3o para ".concat(clientPhone, " - ").concat(appointment.client_name));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 12, , 13]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('scheduling_config')
                            .select('*')
                            .eq('user_id', userId)
                            .single()];
                case 2:
                    config = (_a.sent()).data;
                    if (!(config === null || config === void 0 ? void 0 : config.is_enabled)) {
                        console.log("\u26A0\uFE0F [CONFIRMATION] Agendamento desativado para user ".concat(userId));
                        return [2 /*return*/];
                    }
                    sessions = (0, whatsapp_1.getSessions)();
                    session_3 = sessions.get(userId);
                    if (!(session_3 === null || session_3 === void 0 ? void 0 : session_3.socket)) {
                        console.log("\u26A0\uFE0F [CONFIRMATION] WhatsApp n\u00E3o conectado para user ".concat(userId));
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, storage_1.storage.getConnectionByUserId(userId)];
                case 3:
                    connection = _a.sent();
                    if (!connection) {
                        console.log("\u26A0\uFE0F [CONFIRMATION] Conex\u00E3o n\u00E3o encontrada para user ".concat(userId));
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connection.id), (0, drizzle_orm_1.eq)(schema_1.conversations.contactNumber, clientPhone))
                        })];
                case 4:
                    conversation = _a.sent();
                    if (!conversation) {
                        console.log("\u26A0\uFE0F [CONFIRMATION] Conversa n\u00E3o encontrada com ".concat(clientPhone));
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, db_1.db.query.businessAgentConfigs.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.businessAgentConfigs.userId, userId)
                        })];
                case 5:
                    agentConfig = _a.sent();
                    return [4 /*yield*/, db_1.db.query.messages.findMany({
                            where: (0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conversation.id),
                            orderBy: [(0, drizzle_orm_1.desc)(schema_1.messages.timestamp)],
                            limit: 10
                        })];
                case 6:
                    recentMessages = _a.sent();
                    return [4 /*yield*/, generateConfirmationWithAI(appointment, config, agentConfig, recentMessages.reverse())];
                case 7:
                    confirmationMessage_1 = _a.sent();
                    if (!confirmationMessage_1) {
                        console.log("\u26A0\uFE0F [CONFIRMATION] IA n\u00E3o gerou mensagem de confirma\u00E7\u00E3o");
                        return [2 /*return*/];
                    }
                    jid_3 = conversation.remoteJid || "".concat(clientPhone, "@s.whatsapp.net");
                    console.log("\uD83D\uDCE4 [CONFIRMATION] Enviando para ".concat(jid_3, ": ").concat(confirmationMessage_1.substring(0, 50), "..."));
                    return [4 /*yield*/, messageQueueService_1.messageQueueService.executeWithDelay(appointment.user_id, 'confirmação de agendamento', function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, session_3.socket.sendMessage(jid_3, { text: confirmationMessage_1 })];
                                    case 1: return [2 /*return*/, _a.sent()];
                                }
                            });
                        }); })];
                case 8:
                    sentMessage = _a.sent();
                    if (!(sentMessage === null || sentMessage === void 0 ? void 0 : sentMessage.key.id)) return [3 /*break*/, 10];
                    return [4 /*yield*/, storage_1.storage.createMessage({
                            conversationId: conversation.id,
                            messageId: sentMessage.key.id,
                            fromMe: true,
                            text: confirmationMessage_1,
                            timestamp: new Date(),
                            status: "sent",
                        })];
                case 9:
                    _a.sent();
                    _a.label = 10;
                case 10: 
                // 9. Atualizar conversa
                return [4 /*yield*/, storage_1.storage.updateConversation(conversation.id, {
                        lastMessageText: confirmationMessage_1,
                        lastMessageTime: new Date(),
                    })];
                case 11:
                    // 9. Atualizar conversa
                    _a.sent();
                    console.log("\u2705 [CONFIRMATION] Confirma\u00E7\u00E3o enviada para ".concat(clientPhone));
                    return [3 /*break*/, 13];
                case 12:
                    error_7 = _a.sent();
                    console.error("\u274C [CONFIRMATION] Erro ao enviar confirma\u00E7\u00E3o:", error_7);
                    return [3 /*break*/, 13];
                case 13: return [2 /*return*/];
            }
        });
    });
}
/**
 * Gera mensagem de confirmação usando a IA do agente
 * A mensagem será NATURAL e adaptada ao estilo do negócio
 */
function generateConfirmationWithAI(appointment, config, agentConfig, conversationHistory) {
    return __awaiter(this, void 0, void 0, function () {
        var mistral, appointmentDate, dayNames, dayName, formattedDate, formattedTime, historyContext, systemPrompt, response, message, error_8;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, llm_1.getLLMClient)()];
                case 1:
                    mistral = _d.sent();
                    if (!mistral) {
                        console.error("❌ [CONFIRMATION] Mistral não disponível");
                        return [2 /*return*/, (config === null || config === void 0 ? void 0 : config.confirmation_message) || null];
                    }
                    appointmentDate = new Date("".concat(appointment.appointment_date, "T").concat(appointment.start_time));
                    dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
                    dayName = dayNames[appointmentDate.getDay()];
                    formattedDate = "".concat(appointmentDate.getDate().toString().padStart(2, '0'), "/").concat((appointmentDate.getMonth() + 1).toString().padStart(2, '0'));
                    formattedTime = appointment.start_time.substring(0, 5);
                    historyContext = conversationHistory
                        .map(function (m) { return "".concat(m.fromMe ? 'Atendente' : 'Cliente', ": ").concat(m.text || '[mídia]'); })
                        .join('\n');
                    systemPrompt = "Voc\u00EA \u00E9 o assistente de atendimento de um neg\u00F3cio.\n".concat((agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.prompt) ? "\nContexto do neg\u00F3cio:\n".concat(agentConfig.prompt.substring(0, 500), "...") : '', "\n\nO neg\u00F3cio acabou de CONFIRMAR um agendamento do cliente.\nVoc\u00EA precisa enviar uma mensagem informando que o agendamento foi CONFIRMADO.\n\nA mensagem deve ser:\n- NATURAL e amig\u00E1vel (como se voc\u00EA estivesse conversando normalmente)\n- Adaptada ao estilo do neg\u00F3cio (formal/informal conforme configurado)\n- Curta e objetiva (1-3 frases)\n- N\u00C3O deve parecer autom\u00E1tica ou rob\u00F3tica\n- Pode usar emojis se for um neg\u00F3cio mais descontra\u00EDdo\n- Reafirmar os detalhes do agendamento\n\nInforma\u00E7\u00F5es do agendamento CONFIRMADO:\n- Cliente: ").concat(appointment.client_name, "\n- Servi\u00E7o: ").concat(appointment.service_name, "\n- Data: ").concat(dayName, ", ").concat(formattedDate, "\n- Hor\u00E1rio: ").concat(formattedTime, "\n").concat(appointment.location ? "- Local: ".concat(appointment.location) : '', "\n\n").concat(historyContext ? "\n\u00DAltimas mensagens da conversa:\n".concat(historyContext) : '', "\n\n").concat((config === null || config === void 0 ? void 0 : config.confirmation_message) ? "\nModelo de refer\u00EAncia (adapte naturalmente): ".concat(config.confirmation_message) : '', "\n\nGere apenas a mensagem de confirma\u00E7\u00E3o, sem explica\u00E7\u00F5es adicionais.");
                    return [4 /*yield*/, mistral.chat.complete({
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: "Gere a mensagem informando que o agendamento foi confirmado." }
                            ],
                            temperature: 0.7,
                            maxTokens: 150
                        })];
                case 2:
                    response = _d.sent();
                    message = (_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
                    if (typeof message === 'string' && message.trim()) {
                        return [2 /*return*/, message.trim()];
                    }
                    // Fallback para mensagem configurada
                    return [2 /*return*/, (config === null || config === void 0 ? void 0 : config.confirmation_message) || "Oi ".concat(appointment.client_name, "! \uD83D\uDE0A Seu ").concat(appointment.service_name, " para ").concat(dayName, " (").concat(formattedDate, ") \u00E0s ").concat(formattedTime, " est\u00E1 confirmado! Te esperamos!")];
                case 3:
                    error_8 = _d.sent();
                    console.error("❌ [CONFIRMATION] Erro ao gerar mensagem com IA:", error_8);
                    return [2 /*return*/, (config === null || config === void 0 ? void 0 : config.confirmation_message) || null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Envia notificação ao cliente quando o negócio CANCELA o agendamento
 * Usa a IA para gerar mensagem natural adaptada ao estilo do negócio
 */
function sendCancellationToClientViaAI(appointment, userId, reason) {
    return __awaiter(this, void 0, void 0, function () {
        var clientPhone, config, sessions, session_4, connection, conversation, agentConfig, cancellationMessage_1, jid_4, sentMessage, error_9;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    clientPhone = appointment.client_phone;
                    console.log("\uD83D\uDCE4 [CANCELLATION] Enviando notifica\u00E7\u00E3o de cancelamento para ".concat(clientPhone));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 11, , 12]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('scheduling_config')
                            .select('*')
                            .eq('user_id', userId)
                            .single()];
                case 2:
                    config = (_a.sent()).data;
                    if (!(config === null || config === void 0 ? void 0 : config.is_enabled)) {
                        return [2 /*return*/];
                    }
                    sessions = (0, whatsapp_1.getSessions)();
                    session_4 = sessions.get(userId);
                    if (!(session_4 === null || session_4 === void 0 ? void 0 : session_4.socket)) {
                        console.log("\u26A0\uFE0F [CANCELLATION] WhatsApp n\u00E3o conectado para user ".concat(userId));
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, storage_1.storage.getConnectionByUserId(userId)];
                case 3:
                    connection = _a.sent();
                    if (!connection) {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connection.id), (0, drizzle_orm_1.eq)(schema_1.conversations.contactNumber, clientPhone))
                        })];
                case 4:
                    conversation = _a.sent();
                    if (!conversation) {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, db_1.db.query.businessAgentConfigs.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.businessAgentConfigs.userId, userId)
                        })];
                case 5:
                    agentConfig = _a.sent();
                    return [4 /*yield*/, generateCancellationWithAI(appointment, config, agentConfig, reason)];
                case 6:
                    cancellationMessage_1 = _a.sent();
                    if (!cancellationMessage_1) {
                        return [2 /*return*/];
                    }
                    jid_4 = conversation.remoteJid || "".concat(clientPhone, "@s.whatsapp.net");
                    return [4 /*yield*/, messageQueueService_1.messageQueueService.executeWithDelay(userId, 'cancelamento de agendamento', function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, session_4.socket.sendMessage(jid_4, { text: cancellationMessage_1 })];
                                    case 1: return [2 /*return*/, _a.sent()];
                                }
                            });
                        }); })];
                case 7:
                    sentMessage = _a.sent();
                    if (!(sentMessage === null || sentMessage === void 0 ? void 0 : sentMessage.key.id)) return [3 /*break*/, 9];
                    return [4 /*yield*/, storage_1.storage.createMessage({
                            conversationId: conversation.id,
                            messageId: sentMessage.key.id,
                            fromMe: true,
                            text: cancellationMessage_1,
                            timestamp: new Date(),
                            status: "sent",
                        })];
                case 8:
                    _a.sent();
                    _a.label = 9;
                case 9: 
                // 8. Atualizar conversa
                return [4 /*yield*/, storage_1.storage.updateConversation(conversation.id, {
                        lastMessageText: cancellationMessage_1,
                        lastMessageTime: new Date(),
                    })];
                case 10:
                    // 8. Atualizar conversa
                    _a.sent();
                    console.log("\u2705 [CANCELLATION] Notifica\u00E7\u00E3o enviada para ".concat(clientPhone));
                    return [3 /*break*/, 12];
                case 11:
                    error_9 = _a.sent();
                    console.error("\u274C [CANCELLATION] Erro:", error_9);
                    return [3 /*break*/, 12];
                case 12: return [2 /*return*/];
            }
        });
    });
}
/**
 * Gera mensagem de cancelamento usando a IA
 */
function generateCancellationWithAI(appointment, config, agentConfig, reason) {
    return __awaiter(this, void 0, void 0, function () {
        var mistral, appointmentDate, dayNames, dayName, formattedDate, formattedTime, systemPrompt, response, message, error_10;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, llm_1.getLLMClient)()];
                case 1:
                    mistral = _d.sent();
                    if (!mistral) {
                        return [2 /*return*/, (config === null || config === void 0 ? void 0 : config.cancellation_message) || null];
                    }
                    appointmentDate = new Date("".concat(appointment.appointment_date, "T").concat(appointment.start_time));
                    dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
                    dayName = dayNames[appointmentDate.getDay()];
                    formattedDate = "".concat(appointmentDate.getDate().toString().padStart(2, '0'), "/").concat((appointmentDate.getMonth() + 1).toString().padStart(2, '0'));
                    formattedTime = appointment.start_time.substring(0, 5);
                    systemPrompt = "Voc\u00EA \u00E9 o assistente de atendimento de um neg\u00F3cio.\n".concat((agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.prompt) ? "\nContexto do neg\u00F3cio:\n".concat(agentConfig.prompt.substring(0, 500), "...") : '', "\n\nO neg\u00F3cio precisou CANCELAR um agendamento do cliente.\nVoc\u00EA precisa enviar uma mensagem informando o cancelamento de forma gentil.\n\nA mensagem deve ser:\n- NATURAL e emp\u00E1tica (pedindo desculpas pelo inconveniente)\n- Adaptada ao estilo do neg\u00F3cio\n- Curta e objetiva (1-3 frases)\n- Oferecer remarcar para outro hor\u00E1rio\n- N\u00C3O deve parecer autom\u00E1tica ou rob\u00F3tica\n\nAgendamento CANCELADO:\n- Cliente: ").concat(appointment.client_name, "\n- Servi\u00E7o: ").concat(appointment.service_name, "\n- Data: ").concat(dayName, ", ").concat(formattedDate, "\n- Hor\u00E1rio: ").concat(formattedTime, "\n").concat(reason ? "- Motivo: ".concat(reason) : '', "\n\n").concat((config === null || config === void 0 ? void 0 : config.cancellation_message) ? "\nModelo de refer\u00EAncia: ".concat(config.cancellation_message) : '', "\n\nGere apenas a mensagem de cancelamento, sem explica\u00E7\u00F5es.");
                    return [4 /*yield*/, mistral.chat.complete({
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: "Gere a mensagem informando o cancelamento do agendamento." }
                            ],
                            temperature: 0.7,
                            maxTokens: 150
                        })];
                case 2:
                    response = _d.sent();
                    message = (_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
                    if (typeof message === 'string' && message.trim()) {
                        return [2 /*return*/, message.trim()];
                    }
                    return [2 /*return*/, (config === null || config === void 0 ? void 0 : config.cancellation_message) || "Oi ".concat(appointment.client_name, ", precisamos cancelar seu ").concat(appointment.service_name, " de ").concat(dayName, " \u00E0s ").concat(formattedTime, ". Desculpe o inconveniente! Podemos remarcar para outro hor\u00E1rio?")];
                case 3:
                    error_10 = _d.sent();
                    console.error("❌ [CANCELLATION] Erro ao gerar mensagem:", error_10);
                    return [2 /*return*/, (config === null || config === void 0 ? void 0 : config.cancellation_message) || null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
