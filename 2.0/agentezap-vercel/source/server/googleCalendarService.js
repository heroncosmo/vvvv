"use strict";
/**
 * Google Calendar Integration Service
 *
 * Serviço completo para integração com Google Calendar:
 * - OAuth2 authentication flow
 * - Criação/atualização/exclusão de eventos
 * - Sincronização de agendamentos
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
exports.isGoogleCalendarConfigured = isGoogleCalendarConfigured;
exports.getGoogleAuthUrl = getGoogleAuthUrl;
exports.handleGoogleCallback = handleGoogleCallback;
exports.isGoogleCalendarConnected = isGoogleCalendarConnected;
exports.getGoogleCalendarStatus = getGoogleCalendarStatus;
exports.disconnectGoogleCalendar = disconnectGoogleCalendar;
exports.createCalendarEvent = createCalendarEvent;
exports.updateCalendarEvent = updateCalendarEvent;
exports.deleteCalendarEvent = deleteCalendarEvent;
exports.listCalendarEvents = listCalendarEvents;
exports.checkCalendarAvailability = checkCalendarAvailability;
exports.syncAppointmentToCalendar = syncAppointmentToCalendar;
exports.removeAppointmentFromCalendar = removeAppointmentFromCalendar;
var googleapis_1 = require("googleapis");
var supabaseAuth_1 = require("./supabaseAuth");
// Configuração OAuth2
var GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
var GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
var GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/google-calendar/callback';
// Scopes necessários para Google Calendar
var SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
];
/**
 * Cria OAuth2 client do Google
 */
function createOAuth2Client() {
    return new googleapis_1.google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}
/**
 * Verifica se as credenciais do Google estão configuradas
 */
function isGoogleCalendarConfigured() {
    return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}
/**
 * Gera URL de autorização do Google
 * @param userId - ID do usuário (para state)
 */
function getGoogleAuthUrl(userId) {
    if (!isGoogleCalendarConfigured()) {
        throw new Error('Google Calendar não está configurado. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.');
    }
    var oauth2Client = createOAuth2Client();
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent', // Força consent para sempre receber refresh_token
        state: userId, // Passa userId no state para recuperar no callback
    });
    return authUrl;
}
/**
 * Processa callback do Google OAuth e salva tokens
 * @param code - Authorization code do Google
 * @param userId - ID do usuário
 */
function handleGoogleCallback(code, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var oauth2Client, tokens, error, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    if (!isGoogleCalendarConfigured()) {
                        return [2 /*return*/, { success: false, error: 'Google Calendar não configurado' }];
                    }
                    oauth2Client = createOAuth2Client();
                    return [4 /*yield*/, oauth2Client.getToken(code)];
                case 1:
                    tokens = (_a.sent()).tokens;
                    if (!tokens.refresh_token) {
                        console.warn('[GoogleCalendar] Nenhum refresh_token recebido. O usuário pode precisar revogar acesso e re-autorizar.');
                    }
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('google_calendar_tokens')
                            .upsert({
                            user_id: userId,
                            access_token: tokens.access_token,
                            refresh_token: tokens.refresh_token,
                            token_type: tokens.token_type,
                            expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                            scope: tokens.scope,
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'user_id'
                        })];
                case 2:
                    error = (_a.sent()).error;
                    if (error) {
                        console.error('[GoogleCalendar] Erro ao salvar tokens:', error);
                        return [2 /*return*/, { success: false, error: 'Erro ao salvar tokens' }];
                    }
                    console.log("[GoogleCalendar] Tokens salvos para usu\u00E1rio ".concat(userId));
                    return [2 /*return*/, { success: true }];
                case 3:
                    error_1 = _a.sent();
                    console.error('[GoogleCalendar] Erro no callback:', error_1);
                    return [2 /*return*/, { success: false, error: error_1.message }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Busca tokens do usuário no Supabase
 */
function getUserTokens(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, supabaseAuth_1.supabase
                        .from('google_calendar_tokens')
                        .select('*')
                        .eq('user_id', userId)
                        .single()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error || !data) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, {
                            access_token: data.access_token,
                            refresh_token: data.refresh_token,
                            token_type: data.token_type,
                            expiry_date: data.expiry_date ? new Date(data.expiry_date).getTime() : null,
                            scope: data.scope
                        }];
            }
        });
    });
}
/**
 * Atualiza tokens no Supabase
 */
function updateUserTokens(userId, tokens) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, supabaseAuth_1.supabase
                        .from('google_calendar_tokens')
                        .update({
                        access_token: tokens.access_token,
                        refresh_token: tokens.refresh_token || undefined, // Não sobrescreve se não vier novo
                        expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                        updated_at: new Date().toISOString()
                    })
                        .eq('user_id', userId)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Retorna OAuth2 client autenticado para o usuário
 */
function getAuthenticatedClient(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var tokens, oauth2Client;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getUserTokens(userId)];
                case 1:
                    tokens = _a.sent();
                    if (!tokens || !tokens.access_token) {
                        return [2 /*return*/, null];
                    }
                    oauth2Client = createOAuth2Client();
                    oauth2Client.setCredentials({
                        access_token: tokens.access_token,
                        refresh_token: tokens.refresh_token,
                        token_type: tokens.token_type,
                        expiry_date: tokens.expiry_date,
                    });
                    // Listener para atualizar tokens quando forem refreshed
                    oauth2Client.on('tokens', function (newTokens) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    console.log("[GoogleCalendar] Tokens refreshed para usu\u00E1rio ".concat(userId));
                                    return [4 /*yield*/, updateUserTokens(userId, newTokens)];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                    return [2 /*return*/, oauth2Client];
            }
        });
    });
}
/**
 * Verifica se o usuário está conectado ao Google Calendar
 */
function isGoogleCalendarConnected(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var tokens;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getUserTokens(userId)];
                case 1:
                    tokens = _a.sent();
                    return [2 /*return*/, !!(tokens && tokens.access_token)];
            }
        });
    });
}
/**
 * Obtém informações da conexão do Google Calendar
 */
function getGoogleCalendarStatus(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var configured, connected, email, oauth2Client, oauth2, userInfo, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    configured = isGoogleCalendarConfigured();
                    return [4 /*yield*/, isGoogleCalendarConnected(userId)];
                case 1:
                    connected = _a.sent();
                    if (!connected) return [3 /*break*/, 7];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 6, , 7]);
                    return [4 /*yield*/, getAuthenticatedClient(userId)];
                case 3:
                    oauth2Client = _a.sent();
                    if (!oauth2Client) return [3 /*break*/, 5];
                    oauth2 = googleapis_1.google.oauth2({ version: 'v2', auth: oauth2Client });
                    return [4 /*yield*/, oauth2.userinfo.get()];
                case 4:
                    userInfo = _a.sent();
                    email = userInfo.data.email || undefined;
                    _a.label = 5;
                case 5: return [3 /*break*/, 7];
                case 6:
                    error_2 = _a.sent();
                    console.error('[GoogleCalendar] Erro ao obter email:', error_2);
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/, { connected: connected, configured: configured, email: email }];
            }
        });
    });
}
/**
 * Desconecta Google Calendar (revoga tokens)
 */
function disconnectGoogleCalendar(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var oauth2Client, error_3, error, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 7, , 8]);
                    return [4 /*yield*/, getAuthenticatedClient(userId)];
                case 1:
                    oauth2Client = _a.sent();
                    if (!oauth2Client) return [3 /*break*/, 5];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    // Tenta revogar o token
                    return [4 /*yield*/, oauth2Client.revokeCredentials()];
                case 3:
                    // Tenta revogar o token
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_3 = _a.sent();
                    console.warn('[GoogleCalendar] Erro ao revogar token (pode já estar revogado):', error_3);
                    return [3 /*break*/, 5];
                case 5: return [4 /*yield*/, supabaseAuth_1.supabase
                        .from('google_calendar_tokens')
                        .delete()
                        .eq('user_id', userId)];
                case 6:
                    error = (_a.sent()).error;
                    if (error) {
                        return [2 /*return*/, { success: false, error: 'Erro ao remover tokens' }];
                    }
                    console.log("[GoogleCalendar] Desconectado para usu\u00E1rio ".concat(userId));
                    return [2 /*return*/, { success: true }];
                case 7:
                    error_4 = _a.sent();
                    console.error('[GoogleCalendar] Erro ao desconectar:', error_4);
                    return [2 /*return*/, { success: false, error: error_4.message }];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * Cria evento no Google Calendar
 */
function createCalendarEvent(userId, eventData) {
    return __awaiter(this, void 0, void 0, function () {
        var oauth2Client, calendar, event_1, response, error_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, getAuthenticatedClient(userId)];
                case 1:
                    oauth2Client = _a.sent();
                    if (!oauth2Client) {
                        return [2 /*return*/, { success: false, error: 'Google Calendar não conectado' }];
                    }
                    calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauth2Client });
                    event_1 = {
                        summary: eventData.summary,
                        description: eventData.description,
                        location: eventData.location,
                        start: {
                            dateTime: eventData.startDateTime,
                            timeZone: 'America/Sao_Paulo',
                        },
                        end: {
                            dateTime: eventData.endDateTime,
                            timeZone: 'America/Sao_Paulo',
                        },
                        reminders: {
                            useDefault: false,
                            overrides: [
                                { method: 'popup', minutes: 30 },
                                { method: 'email', minutes: 60 },
                            ],
                        },
                    };
                    // Adiciona convidado se tiver email
                    if (eventData.attendeeEmail) {
                        event_1.attendees = [{ email: eventData.attendeeEmail }];
                    }
                    // Define cor se especificada
                    if (eventData.colorId) {
                        event_1.colorId = eventData.colorId;
                    }
                    return [4 /*yield*/, calendar.events.insert({
                            calendarId: 'primary',
                            requestBody: event_1,
                            sendUpdates: eventData.attendeeEmail ? 'all' : 'none',
                        })];
                case 2:
                    response = _a.sent();
                    console.log("[GoogleCalendar] Evento criado: ".concat(response.data.id));
                    return [2 /*return*/, {
                            success: true,
                            eventId: response.data.id || undefined,
                            htmlLink: response.data.htmlLink || undefined,
                        }];
                case 3:
                    error_5 = _a.sent();
                    console.error('[GoogleCalendar] Erro ao criar evento:', error_5);
                    return [2 /*return*/, { success: false, error: error_5.message }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Atualiza evento no Google Calendar
 */
function updateCalendarEvent(userId, eventId, eventData) {
    return __awaiter(this, void 0, void 0, function () {
        var oauth2Client, calendar, currentEvent, event_2, error_6;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, getAuthenticatedClient(userId)];
                case 1:
                    oauth2Client = _c.sent();
                    if (!oauth2Client) {
                        return [2 /*return*/, { success: false, error: 'Google Calendar não conectado' }];
                    }
                    calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauth2Client });
                    return [4 /*yield*/, calendar.events.get({
                            calendarId: 'primary',
                            eventId: eventId,
                        })];
                case 2:
                    currentEvent = _c.sent();
                    event_2 = __assign(__assign({}, currentEvent.data), { summary: eventData.summary || currentEvent.data.summary, description: (_a = eventData.description) !== null && _a !== void 0 ? _a : currentEvent.data.description, location: (_b = eventData.location) !== null && _b !== void 0 ? _b : currentEvent.data.location });
                    if (eventData.startDateTime) {
                        event_2.start = {
                            dateTime: eventData.startDateTime,
                            timeZone: 'America/Sao_Paulo',
                        };
                    }
                    if (eventData.endDateTime) {
                        event_2.end = {
                            dateTime: eventData.endDateTime,
                            timeZone: 'America/Sao_Paulo',
                        };
                    }
                    // Atualiza o evento
                    return [4 /*yield*/, calendar.events.update({
                            calendarId: 'primary',
                            eventId: eventId,
                            requestBody: event_2,
                        })];
                case 3:
                    // Atualiza o evento
                    _c.sent();
                    console.log("[GoogleCalendar] Evento atualizado: ".concat(eventId));
                    return [2 /*return*/, { success: true }];
                case 4:
                    error_6 = _c.sent();
                    console.error('[GoogleCalendar] Erro ao atualizar evento:', error_6);
                    return [2 /*return*/, { success: false, error: error_6.message }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Deleta evento do Google Calendar
 */
function deleteCalendarEvent(userId, eventId) {
    return __awaiter(this, void 0, void 0, function () {
        var oauth2Client, calendar, error_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, getAuthenticatedClient(userId)];
                case 1:
                    oauth2Client = _a.sent();
                    if (!oauth2Client) {
                        return [2 /*return*/, { success: false, error: 'Google Calendar não conectado' }];
                    }
                    calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauth2Client });
                    return [4 /*yield*/, calendar.events.delete({
                            calendarId: 'primary',
                            eventId: eventId,
                        })];
                case 2:
                    _a.sent();
                    console.log("[GoogleCalendar] Evento deletado: ".concat(eventId));
                    return [2 /*return*/, { success: true }];
                case 3:
                    error_7 = _a.sent();
                    console.error('[GoogleCalendar] Erro ao deletar evento:', error_7);
                    return [2 /*return*/, { success: false, error: error_7.message }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Lista eventos do Google Calendar em um período
 */
function listCalendarEvents(userId, startDate, endDate) {
    return __awaiter(this, void 0, void 0, function () {
        var oauth2Client, calendar, response, error_8;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, getAuthenticatedClient(userId)];
                case 1:
                    oauth2Client = _a.sent();
                    if (!oauth2Client) {
                        return [2 /*return*/, { success: false, error: 'Google Calendar não conectado' }];
                    }
                    calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauth2Client });
                    return [4 /*yield*/, calendar.events.list({
                            calendarId: 'primary',
                            timeMin: startDate.toISOString(),
                            timeMax: endDate.toISOString(),
                            singleEvents: true,
                            orderBy: 'startTime',
                            maxResults: 100,
                        })];
                case 2:
                    response = _a.sent();
                    return [2 /*return*/, {
                            success: true,
                            events: response.data.items || [],
                        }];
                case 3:
                    error_8 = _a.sent();
                    console.error('[GoogleCalendar] Erro ao listar eventos:', error_8);
                    return [2 /*return*/, { success: false, error: error_8.message }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Verifica disponibilidade no Google Calendar
 * @returns true se o horário está livre, false se ocupado
 */
function checkCalendarAvailability(userId, startDateTime, endDateTime) {
    return __awaiter(this, void 0, void 0, function () {
        var start, end, _a, success, events, error, conflict, error_9;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    start = new Date(startDateTime);
                    end = new Date(endDateTime);
                    return [4 /*yield*/, listCalendarEvents(userId, start, end)];
                case 1:
                    _a = _b.sent(), success = _a.success, events = _a.events, error = _a.error;
                    if (!success || error) {
                        // Se não conseguir verificar, assume disponível
                        return [2 /*return*/, { available: true }];
                    }
                    // Verifica se há conflito
                    if (events && events.length > 0) {
                        conflict = events[0];
                        return [2 /*return*/, {
                                available: false,
                                conflictEvent: conflict.summary || 'Evento sem título',
                            }];
                    }
                    return [2 /*return*/, { available: true }];
                case 2:
                    error_9 = _b.sent();
                    console.error('[GoogleCalendar] Erro ao verificar disponibilidade:', error_9);
                    return [2 /*return*/, { available: true }]; // Na dúvida, assume disponível
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Sincroniza um agendamento com o Google Calendar
 * Cria ou atualiza o evento correspondente
 */
function syncAppointmentToCalendar(userId_1, appointment_1) {
    return __awaiter(this, arguments, void 0, function (userId, appointment, serviceDurationMinutes) {
        var startDateTime, startDate, endDate, endDateTime, eventData, result, error_10;
        if (serviceDurationMinutes === void 0) { serviceDurationMinutes = 60; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    startDateTime = "".concat(appointment.appointmentDate, "T").concat(appointment.appointmentTime, ":00");
                    startDate = new Date(startDateTime);
                    endDate = new Date(startDate.getTime() + serviceDurationMinutes * 60 * 1000);
                    endDateTime = endDate.toISOString().slice(0, 19);
                    eventData = {
                        summary: "\uD83D\uDCC5 ".concat(appointment.serviceName || 'Agendamento', " - ").concat(appointment.clientName),
                        description: [
                            "Cliente: ".concat(appointment.clientName),
                            "Telefone: ".concat(appointment.clientPhone),
                            appointment.notes ? "\nNotas: ".concat(appointment.notes) : '',
                            "\n--- Agendado via AgentZap ---",
                            "ID: ".concat(appointment.id)
                        ].join('\n'),
                        startDateTime: startDateTime,
                        endDateTime: endDateTime,
                        colorId: '2', // Verde sage
                    };
                    if (!appointment.googleEventId) return [3 /*break*/, 2];
                    return [4 /*yield*/, updateCalendarEvent(userId, appointment.googleEventId, eventData)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, { success: result.success, eventId: appointment.googleEventId, error: result.error }];
                case 2: return [4 /*yield*/, createCalendarEvent(userId, eventData)];
                case 3: return [2 /*return*/, _a.sent()];
                case 4: return [3 /*break*/, 6];
                case 5:
                    error_10 = _a.sent();
                    console.error('[GoogleCalendar] Erro ao sincronizar agendamento:', error_10);
                    return [2 /*return*/, { success: false, error: error_10.message }];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * Remove evento do Calendar quando agendamento é cancelado
 */
function removeAppointmentFromCalendar(userId, googleEventId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, deleteCalendarEvent(userId, googleEventId)];
        });
    });
}
