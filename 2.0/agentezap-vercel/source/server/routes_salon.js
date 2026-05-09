"use strict";
/**
 * SALON ROUTES - ROTAS PARA O SISTEMA DE AGENDAMENTOS DE SALÃO
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
exports.registerSalonRoutes = registerSalonRoutes;
var supabaseAuth_1 = require("./supabaseAuth");
var salonAvailability_1 = require("./salonAvailability");
function getUserId(req) {
    var _a, _b, _c;
    return ((_b = (_a = req.session) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.id) || ((_c = req.user) === null || _c === void 0 ? void 0 : _c.id) || "";
}
function registerSalonRoutes(app) {
    var _this = this;
    console.log("💇 [Salon] Registrando rotas de salão...");
    // ═══════════════════════════════════════════════════════════════════════
    // CONFIGURAÇÃO DO SALÃO
    // ═══════════════════════════════════════════════════════════════════════
    // GET - Obter configuração do salão
    app.get("/api/salon/config", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, _a, data, error, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("salon_config")
                            .select("*")
                            .eq("user_id", userId)
                            .single()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error && error.code !== "PGRST116")
                        throw error;
                    // Retorna config padrão se não existir
                    if (!data) {
                        return [2 /*return*/, res.json({
                                id: null,
                                user_id: userId,
                                is_active: false,
                                send_to_ai: true,
                                salon_name: null,
                                salon_type: "salon",
                                phone: null,
                                address: null,
                                opening_hours: {
                                    monday: { enabled: true, open: "09:00", close: "19:00" },
                                    tuesday: { enabled: true, open: "09:00", close: "19:00" },
                                    wednesday: { enabled: true, open: "09:00", close: "19:00" },
                                    thursday: { enabled: true, open: "09:00", close: "19:00" },
                                    friday: { enabled: true, open: "09:00", close: "19:00" },
                                    saturday: { enabled: true, open: "09:00", close: "17:00" },
                                    sunday: { enabled: false, open: "09:00", close: "17:00" },
                                },
                                slot_duration: 30,
                                buffer_between: 10,
                                max_advance_days: 30,
                                min_notice_hours: 2,
                                min_notice_minutes: 0, // NOVO: antecedência em minutos
                                allow_cancellation: true,
                                cancellation_notice_hours: 4,
                                use_services: true,
                                use_professionals: true,
                                allow_multiple_services: false,
                                welcome_message: "Olá {cliente_nome}! 💇 Bem-vindo(a) ao nosso salão! Como posso ajudar você hoje?",
                                booking_confirmation_message: "Perfeito! ✅ Seu agendamento foi confirmado:\n📅 {data}\n⏰ {horario}\n💇 {servico}\n👤 {profissional}\n\nAguardamos você!",
                                reminder_message: "Lembrete: Você tem um agendamento amanhã às {horario}. Até lá! 💇",
                                cancellation_message: "Agendamento cancelado. Se precisar remarcar, é só me chamar! 💬",
                                closed_message: "Desculpe, estamos fechados no momento. Nossos horários: {horarios}",
                                humanize_responses: true,
                                use_customer_name: true,
                                response_variation: true,
                                response_delay_min: 1000,
                                response_delay_max: 3000,
                                ai_instructions: "",
                                display_instructions: null,
                            })];
                    }
                    res.json(data);
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _b.sent();
                    console.error("❌ [Salon] Error fetching salon config:", error_1);
                    res.status(500).json({ message: "Failed to fetch salon config" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // PUT - Atualizar configuração do salão
    app.put("/api/salon/config", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, body, updateData, allowedFields, _i, allowedFields_1, field, existing, incomingOpeningHours, incomingBreak, existingBreak, result, _a, data, error, _b, data, error, error_2;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 6, , 7]);
                    userId = getUserId(req);
                    body = req.body;
                    updateData = {
                        updated_at: new Date().toISOString(),
                    };
                    allowedFields = [
                        "is_active", "send_to_ai", "salon_name", "salon_type", "phone", "address",
                        "opening_hours", "slot_duration", "buffer_between", "max_advance_days",
                        "min_notice_hours", "min_notice_minutes", "allow_cancellation", "cancellation_notice_hours",
                        "use_services", "use_professionals", "allow_multiple_services",
                        "welcome_message", "booking_confirmation_message", "reminder_message",
                        "cancellation_message", "closed_message", "humanize_responses",
                        "use_customer_name", "response_variation", "response_delay_min",
                        "response_delay_max", "ai_instructions", "display_instructions",
                    ];
                    for (_i = 0, allowedFields_1 = allowedFields; _i < allowedFields_1.length; _i++) {
                        field = allowedFields_1[_i];
                        if (body[field] !== undefined) {
                            updateData[field] = body[field];
                        }
                    }
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("salon_config")
                            .select("id, opening_hours")
                            .eq("user_id", userId)
                            .single()];
                case 1:
                    existing = (_d.sent()).data;
                    // 🔒 Garantir persistência do horário de almoço (__break)
                    // Se frontend/cliente enviar opening_hours sem __break, preserva o valor existente no banco.
                    if (updateData.opening_hours && typeof updateData.opening_hours === "object") {
                        incomingOpeningHours = updateData.opening_hours;
                        incomingBreak = incomingOpeningHours.__break;
                        existingBreak = (_c = existing === null || existing === void 0 ? void 0 : existing.opening_hours) === null || _c === void 0 ? void 0 : _c.__break;
                        if (incomingBreak === undefined && existingBreak) {
                            updateData.opening_hours = __assign(__assign({}, incomingOpeningHours), { __break: existingBreak });
                        }
                    }
                    result = void 0;
                    if (!existing) return [3 /*break*/, 3];
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("salon_config")
                            .update(updateData)
                            .eq("user_id", userId)
                            .select()
                            .single()];
                case 2:
                    _a = _d.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    result = data;
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, supabaseAuth_1.supabase
                        .from("salon_config")
                        .insert(__assign(__assign({}, updateData), { user_id: userId }))
                        .select()
                        .single()];
                case 4:
                    _b = _d.sent(), data = _b.data, error = _b.error;
                    if (error)
                        throw error;
                    result = data;
                    _d.label = 5;
                case 5:
                    console.log("\u2705 [Salon] Config atualizada para user: ".concat(userId));
                    res.json(result);
                    return [3 /*break*/, 7];
                case 6:
                    error_2 = _d.sent();
                    console.error("❌ [Salon] Error updating salon config:", error_2);
                    res.status(500).json({ message: "Failed to update salon config" });
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/];
            }
        });
    }); });
    // ═══════════════════════════════════════════════════════════════════════
    // SERVIÇOS
    // ═══════════════════════════════════════════════════════════════════════
    // GET - Listar serviços
    app.get("/api/salon/services", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, _a, data, error, error_3;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("scheduling_services")
                            .select("*")
                            .eq("user_id", userId)
                            .order("display_order", { ascending: true })];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    res.json(data || []);
                    return [3 /*break*/, 3];
                case 2:
                    error_3 = _b.sent();
                    console.error("❌ [Salon] Error fetching services:", error_3);
                    res.status(500).json({ message: "Failed to fetch services" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // POST - Criar serviço
    app.post("/api/salon/services", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, _a, name_1, description, duration_minutes, price, is_active, color, parsedDuration, existing, nextOrder, _b, data, error, error_4;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 3, , 4]);
                    userId = getUserId(req);
                    _a = req.body, name_1 = _a.name, description = _a.description, duration_minutes = _a.duration_minutes, price = _a.price, is_active = _a.is_active, color = _a.color;
                    if (!name_1) {
                        return [2 /*return*/, res.status(400).json({ message: "Nome é obrigatório" })];
                    }
                    parsedDuration = Number(duration_minutes !== null && duration_minutes !== void 0 ? duration_minutes : 30);
                    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
                        return [2 /*return*/, res.status(400).json({ message: "Duração do serviço inválida" })];
                    }
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("scheduling_services")
                            .select("display_order")
                            .eq("user_id", userId)
                            .order("display_order", { ascending: false })
                            .limit(1)];
                case 1:
                    existing = (_d.sent()).data;
                    nextOrder = (((_c = existing === null || existing === void 0 ? void 0 : existing[0]) === null || _c === void 0 ? void 0 : _c.display_order) || 0) + 1;
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("scheduling_services")
                            .insert({
                            user_id: userId,
                            name: name_1,
                            description: description || null,
                            duration_minutes: parsedDuration,
                            price: price ? parseFloat(price) : null,
                            is_active: is_active !== false,
                            color: color || "#6366f1",
                            display_order: nextOrder,
                        })
                            .select()
                            .single()];
                case 2:
                    _b = _d.sent(), data = _b.data, error = _b.error;
                    if (error)
                        throw error;
                    console.log("\u2705 [Salon] Servi\u00E7o criado: ".concat(name_1));
                    res.json(data);
                    return [3 /*break*/, 4];
                case 3:
                    error_4 = _d.sent();
                    console.error("❌ [Salon] Error creating service:", error_4);
                    res.status(500).json({ message: "Failed to create service" });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    // PUT - Atualizar serviço
    app.put("/api/salon/services/:id", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, id, _a, name_2, description, duration_minutes, price, is_active, color, parsedDuration, _b, data, error, error_5;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    id = req.params.id;
                    _a = req.body, name_2 = _a.name, description = _a.description, duration_minutes = _a.duration_minutes, price = _a.price, is_active = _a.is_active, color = _a.color;
                    parsedDuration = Number(duration_minutes !== null && duration_minutes !== void 0 ? duration_minutes : 30);
                    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
                        return [2 /*return*/, res.status(400).json({ message: "Duração do serviço inválida" })];
                    }
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("scheduling_services")
                            .update({
                            name: name_2,
                            description: description || null,
                            duration_minutes: parsedDuration,
                            price: price ? parseFloat(price) : null,
                            is_active: is_active,
                            color: color || "#6366f1",
                            updated_at: new Date().toISOString(),
                        })
                            .eq("id", id)
                            .eq("user_id", userId)
                            .select()
                            .single()];
                case 1:
                    _b = _c.sent(), data = _b.data, error = _b.error;
                    if (error)
                        throw error;
                    res.json(data);
                    return [3 /*break*/, 3];
                case 2:
                    error_5 = _c.sent();
                    console.error("❌ [Salon] Error updating service:", error_5);
                    res.status(500).json({ message: "Failed to update service" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // DELETE - Remover serviço
    app.delete("/api/salon/services/:id", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, id, error, error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    id = req.params.id;
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("scheduling_services")
                            .delete()
                            .eq("id", id)
                            .eq("user_id", userId)];
                case 1:
                    error = (_a.sent()).error;
                    if (error)
                        throw error;
                    res.json({ success: true });
                    return [3 /*break*/, 3];
                case 2:
                    error_6 = _a.sent();
                    console.error("❌ [Salon] Error deleting service:", error_6);
                    res.status(500).json({ message: "Failed to delete service" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ═══════════════════════════════════════════════════════════════════════
    // PROFISSIONAIS
    // ═══════════════════════════════════════════════════════════════════════
    // GET - Listar profissionais
    app.get("/api/salon/professionals", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, _a, data, error, error_7;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("scheduling_professionals")
                            .select("*")
                            .eq("user_id", userId)
                            .order("display_order", { ascending: true })];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    res.json(data || []);
                    return [3 /*break*/, 3];
                case 2:
                    error_7 = _b.sent();
                    console.error("❌ [Salon] Error fetching professionals:", error_7);
                    res.status(500).json({ message: "Failed to fetch professionals" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // POST - Criar profissional
    app.post("/api/salon/professionals", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, _a, name_3, bio, avatar_url, is_active, existing, nextOrder, _b, data, error, error_8;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 3, , 4]);
                    userId = getUserId(req);
                    _a = req.body, name_3 = _a.name, bio = _a.bio, avatar_url = _a.avatar_url, is_active = _a.is_active;
                    if (!name_3) {
                        return [2 /*return*/, res.status(400).json({ message: "Nome é obrigatório" })];
                    }
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("scheduling_professionals")
                            .select("display_order")
                            .eq("user_id", userId)
                            .order("display_order", { ascending: false })
                            .limit(1)];
                case 1:
                    existing = (_d.sent()).data;
                    nextOrder = (((_c = existing === null || existing === void 0 ? void 0 : existing[0]) === null || _c === void 0 ? void 0 : _c.display_order) || 0) + 1;
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("scheduling_professionals")
                            .insert({
                            user_id: userId,
                            name: name_3,
                            bio: bio || null,
                            avatar_url: avatar_url || null,
                            is_active: is_active !== false,
                            display_order: nextOrder,
                            work_schedule: {},
                        })
                            .select()
                            .single()];
                case 2:
                    _b = _d.sent(), data = _b.data, error = _b.error;
                    if (error)
                        throw error;
                    console.log("\u2705 [Salon] Profissional criado: ".concat(name_3));
                    res.json(data);
                    return [3 /*break*/, 4];
                case 3:
                    error_8 = _d.sent();
                    console.error("❌ [Salon] Error creating professional:", error_8);
                    res.status(500).json({ message: "Failed to create professional" });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    // PUT - Atualizar profissional
    app.put("/api/salon/professionals/:id", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, id, _a, name_4, bio, avatar_url, is_active, _b, data, error, error_9;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    id = req.params.id;
                    _a = req.body, name_4 = _a.name, bio = _a.bio, avatar_url = _a.avatar_url, is_active = _a.is_active;
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("scheduling_professionals")
                            .update({
                            name: name_4,
                            bio: bio || null,
                            avatar_url: avatar_url || null,
                            is_active: is_active,
                            updated_at: new Date().toISOString(),
                        })
                            .eq("id", id)
                            .eq("user_id", userId)
                            .select()
                            .single()];
                case 1:
                    _b = _c.sent(), data = _b.data, error = _b.error;
                    if (error)
                        throw error;
                    res.json(data);
                    return [3 /*break*/, 3];
                case 2:
                    error_9 = _c.sent();
                    console.error("❌ [Salon] Error updating professional:", error_9);
                    res.status(500).json({ message: "Failed to update professional" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // DELETE - Remover profissional
    app.delete("/api/salon/professionals/:id", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, id, error, error_10;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    id = req.params.id;
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("scheduling_professionals")
                            .delete()
                            .eq("id", id)
                            .eq("user_id", userId)];
                case 1:
                    error = (_a.sent()).error;
                    if (error)
                        throw error;
                    res.json({ success: true });
                    return [3 /*break*/, 3];
                case 2:
                    error_10 = _a.sent();
                    console.error("❌ [Salon] Error deleting professional:", error_10);
                    res.status(500).json({ message: "Failed to delete professional" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ═══════════════════════════════════════════════════════════════════════
    // AGENDAMENTOS
    // ═══════════════════════════════════════════════════════════════════════
    // GET - Listar agendamentos
    app.get("/api/salon/appointments", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, _a, date, status_1, limit, query, _b, data, error, error_11;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    _a = req.query, date = _a.date, status_1 = _a.status, limit = _a.limit;
                    query = supabaseAuth_1.supabase
                        .from("appointments")
                        .select("*")
                        .eq("user_id", userId)
                        .order("appointment_date", { ascending: false })
                        .order("start_time", { ascending: true });
                    if (date) {
                        query = query.eq("appointment_date", date);
                    }
                    if (status_1 && status_1 !== "all") {
                        query = query.eq("status", status_1);
                    }
                    if (limit) {
                        query = query.limit(parseInt(limit));
                    }
                    return [4 /*yield*/, query];
                case 1:
                    _b = _c.sent(), data = _b.data, error = _b.error;
                    if (error)
                        throw error;
                    res.json(data || []);
                    return [3 /*break*/, 3];
                case 2:
                    error_11 = _c.sent();
                    console.error("❌ [Salon] Error fetching appointments:", error_11);
                    res.status(500).json({ message: "Failed to fetch appointments" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // GET - Buscar agendamento por ID
    app.get("/api/salon/appointments/:id", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, id, _a, data, error, error_12;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    id = req.params.id;
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("appointments")
                            .select("*")
                            .eq("id", id)
                            .eq("user_id", userId)
                            .single()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    res.json(data);
                    return [3 /*break*/, 3];
                case 2:
                    error_12 = _b.sent();
                    console.error("❌ [Salon] Error fetching appointment:", error_12);
                    res.status(500).json({ message: "Failed to fetch appointment" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // PUT - Atualizar status do agendamento
    app.put("/api/salon/appointments/:id/status", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, id, status_2, validStatuses, _a, data, error, error_13;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    id = req.params.id;
                    status_2 = req.body.status;
                    validStatuses = ["pending", "confirmed", "completed", "cancelled", "no_show"];
                    if (!validStatuses.includes(status_2)) {
                        return [2 /*return*/, res.status(400).json({ message: "Status inválido" })];
                    }
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("appointments")
                            .update({
                            status: status_2,
                            updated_at: new Date().toISOString(),
                        })
                            .eq("id", id)
                            .eq("user_id", userId)
                            .select()
                            .single()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    console.log("\u2705 [Salon] Agendamento ".concat(id, " atualizado para: ").concat(status_2));
                    res.json(data);
                    return [3 /*break*/, 3];
                case 2:
                    error_13 = _b.sent();
                    console.error("❌ [Salon] Error updating appointment:", error_13);
                    res.status(500).json({ message: "Failed to update appointment" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // DELETE - Cancelar agendamento
    app.delete("/api/salon/appointments/:id", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, id, _a, data, error, error_14;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    id = req.params.id;
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("appointments")
                            .update({
                            status: "cancelled",
                            updated_at: new Date().toISOString(),
                        })
                            .eq("id", id)
                            .eq("user_id", userId)
                            .select()
                            .single()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    res.json({ success: true, data: data });
                    return [3 /*break*/, 3];
                case 2:
                    error_14 = _b.sent();
                    console.error("❌ [Salon] Error cancelling appointment:", error_14);
                    res.status(500).json({ message: "Failed to cancel appointment" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // GET - Horários disponíveis para uma data
    app.get("/api/salon/available-slots", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, _a, date, professionalId, serviceDuration, slotDuration, availableSlots, error_15;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId = getUserId(req);
                    _a = req.query, date = _a.date, professionalId = _a.professionalId, serviceDuration = _a.serviceDuration;
                    if (!date) {
                        return [2 /*return*/, res.status(400).json({ message: "Data é obrigatória" })];
                    }
                    slotDuration = serviceDuration ? parseInt(serviceDuration) : 30;
                    return [4 /*yield*/, (0, salonAvailability_1.getAvailableStartTimes)({
                            userId: userId,
                            date: date,
                            professionalId: professionalId,
                            serviceDurationMinutes: slotDuration,
                            stepMinutes: 5,
                        })];
                case 1:
                    availableSlots = _b.sent();
                    res.json(availableSlots);
                    return [3 /*break*/, 3];
                case 2:
                    error_15 = _b.sent();
                    console.error("❌ [Salon] Error fetching available slots:", error_15);
                    res.status(500).json({ message: "Failed to fetch available slots" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // GET - Estatísticas do salão
    app.get("/api/salon/stats", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, today, todayAppointments, weekStart, weekStartStr, weekAppointments, error_16;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    userId = getUserId(req);
                    today = new Date().toISOString().split("T")[0];
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("appointments")
                            .select("*")
                            .eq("user_id", userId)
                            .eq("appointment_date", today)
                            .neq("status", "cancelled")];
                case 1:
                    todayAppointments = (_a.sent()).data;
                    weekStart = new Date();
                    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                    weekStartStr = weekStart.toISOString().split("T")[0];
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from("appointments")
                            .select("*")
                            .eq("user_id", userId)
                            .gte("appointment_date", weekStartStr)
                            .neq("status", "cancelled")];
                case 2:
                    weekAppointments = (_a.sent()).data;
                    res.json({
                        today: {
                            total: (todayAppointments === null || todayAppointments === void 0 ? void 0 : todayAppointments.length) || 0,
                            pending: (todayAppointments === null || todayAppointments === void 0 ? void 0 : todayAppointments.filter(function (a) { return a.status === "pending"; }).length) || 0,
                            confirmed: (todayAppointments === null || todayAppointments === void 0 ? void 0 : todayAppointments.filter(function (a) { return a.status === "confirmed"; }).length) || 0,
                            completed: (todayAppointments === null || todayAppointments === void 0 ? void 0 : todayAppointments.filter(function (a) { return a.status === "completed"; }).length) || 0,
                        },
                        week: {
                            total: (weekAppointments === null || weekAppointments === void 0 ? void 0 : weekAppointments.length) || 0,
                        },
                    });
                    return [3 /*break*/, 4];
                case 3:
                    error_16 = _a.sent();
                    console.error("❌ [Salon] Error fetching stats:", error_16);
                    res.status(500).json({ message: "Failed to fetch stats" });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    console.log("✅ [Salon] Rotas de salão registradas com sucesso!");
}
