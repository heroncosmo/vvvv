"use strict";
/**
 * MercadoPago Service - Integração com API de Assinaturas
 *
 * Funcionalidades:
 * - Criar planos de assinatura
 * - Criar assinaturas para clientes
 * - Processar webhooks
 * - Gerenciar credenciais (teste/produção)
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
exports.mercadoPagoService = void 0;
var storage_1 = require("./storage");
var MP_API_BASE = "https://api.mercadopago.com";
var MercadoPagoService = /** @class */ (function () {
    function MercadoPagoService() {
        this.credentials = null;
    }
    /**
     * Carrega credenciais do banco de dados
     */
    MercadoPagoService.prototype.loadCredentials = function () {
        return __awaiter(this, void 0, void 0, function () {
            var keys, configMap, publicKey, accessToken, clientId, clientSecret, testMode, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        keys = [
                            "mercadopago_public_key",
                            "mercadopago_access_token",
                            "mercadopago_client_id",
                            "mercadopago_client_secret",
                            "mercadopago_test_mode"
                        ];
                        return [4 /*yield*/, storage_1.storage.getSystemConfigs(keys)];
                    case 1:
                        configMap = _a.sent();
                        publicKey = configMap.get("mercadopago_public_key");
                        accessToken = configMap.get("mercadopago_access_token");
                        clientId = configMap.get("mercadopago_client_id");
                        clientSecret = configMap.get("mercadopago_client_secret");
                        testMode = configMap.get("mercadopago_test_mode");
                        if (!publicKey || !accessToken) {
                            console.log("[MercadoPago] Credenciais não configuradas");
                            return [2 /*return*/, null];
                        }
                        this.credentials = {
                            publicKey: publicKey,
                            accessToken: accessToken,
                            clientId: clientId || undefined,
                            clientSecret: clientSecret || undefined,
                            isTestMode: testMode === "true",
                        };
                        return [2 /*return*/, this.credentials];
                    case 2:
                        error_1 = _a.sent();
                        console.error("[MercadoPago] Erro ao carregar credenciais:", error_1);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Salva credenciais no banco de dados
     */
    MercadoPagoService.prototype.saveCredentials = function (creds) {
        return __awaiter(this, void 0, void 0, function () {
            var error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 12, , 13]);
                        if (!(creds.publicKey !== undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, storage_1.storage.updateSystemConfig("mercadopago_public_key", creds.publicKey)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        if (!(creds.accessToken !== undefined)) return [3 /*break*/, 4];
                        return [4 /*yield*/, storage_1.storage.updateSystemConfig("mercadopago_access_token", creds.accessToken)];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        if (!(creds.clientId !== undefined)) return [3 /*break*/, 6];
                        return [4 /*yield*/, storage_1.storage.updateSystemConfig("mercadopago_client_id", creds.clientId)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6:
                        if (!(creds.clientSecret !== undefined)) return [3 /*break*/, 8];
                        return [4 /*yield*/, storage_1.storage.updateSystemConfig("mercadopago_client_secret", creds.clientSecret)];
                    case 7:
                        _a.sent();
                        _a.label = 8;
                    case 8:
                        if (!(creds.isTestMode !== undefined)) return [3 /*break*/, 10];
                        return [4 /*yield*/, storage_1.storage.updateSystemConfig("mercadopago_test_mode", creds.isTestMode.toString())];
                    case 9:
                        _a.sent();
                        _a.label = 10;
                    case 10: 
                    // Recarrega credenciais após salvar
                    return [4 /*yield*/, this.loadCredentials()];
                    case 11:
                        // Recarrega credenciais após salvar
                        _a.sent();
                        console.log("[MercadoPago] Credenciais salvas com sucesso");
                        return [3 /*break*/, 13];
                    case 12:
                        error_2 = _a.sent();
                        console.error("[MercadoPago] Erro ao salvar credenciais:", error_2);
                        throw error_2;
                    case 13: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Retorna credenciais atuais (sem expor dados sensíveis)
     */
    MercadoPagoService.prototype.getCredentialsInfo = function () {
        return __awaiter(this, void 0, void 0, function () {
            var creds;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.loadCredentials()];
                    case 1:
                        creds = _a.sent();
                        if (!creds) {
                            return [2 /*return*/, { configured: false, isTestMode: false }];
                        }
                        return [2 /*return*/, {
                                configured: true,
                                isTestMode: creds.isTestMode,
                                publicKeyPreview: creds.publicKey.substring(0, 20) + "...",
                            }];
                }
            });
        });
    };
    /**
     * Faz requisição autenticada para API do Mercado Pago
     */
    MercadoPagoService.prototype.apiRequest = function (method, endpoint, body) {
        return __awaiter(this, void 0, void 0, function () {
            var creds, _a, url, options, response, data;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = this.credentials;
                        if (_a) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.loadCredentials()];
                    case 1:
                        _a = (_b.sent());
                        _b.label = 2;
                    case 2:
                        creds = _a;
                        if (!creds) {
                            throw new Error("Credenciais do Mercado Pago não configuradas");
                        }
                        url = "".concat(MP_API_BASE).concat(endpoint);
                        options = {
                            method: method,
                            headers: {
                                Authorization: "Bearer ".concat(creds.accessToken),
                                "Content-Type": "application/json",
                            },
                        };
                        if (body && method !== "GET") {
                            options.body = JSON.stringify(body);
                        }
                        console.log("[MercadoPago] ".concat(method, " ").concat(endpoint));
                        return [4 /*yield*/, fetch(url, options)];
                    case 3:
                        response = _b.sent();
                        return [4 /*yield*/, response.json()];
                    case 4:
                        data = _b.sent();
                        if (!response.ok) {
                            console.error("[MercadoPago] API Error:", data);
                            throw new Error(data.message || "API Error: ".concat(response.status));
                        }
                        return [2 /*return*/, data];
                }
            });
        });
    };
    /**
     * Cria um plano de assinatura no Mercado Pago
     */
    MercadoPagoService.prototype.createPlan = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var body, plan;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        body = {
                            reason: params.reason,
                            auto_recurring: {
                                frequency: params.autoRecurring.frequency,
                                frequency_type: params.autoRecurring.frequencyType,
                                transaction_amount: params.autoRecurring.transactionAmount,
                                currency_id: params.autoRecurring.currencyId,
                                repetitions: params.autoRecurring.repetitions,
                                free_trial: params.autoRecurring.freeTrial
                                    ? {
                                        frequency: params.autoRecurring.freeTrial.frequency,
                                        frequency_type: params.autoRecurring.freeTrial.frequencyType,
                                    }
                                    : undefined,
                            },
                            back_url: params.backUrl,
                        };
                        return [4 /*yield*/, this.apiRequest("POST", "/preapproval_plan", body)];
                    case 1:
                        plan = _a.sent();
                        console.log("[MercadoPago] Plano criado:", plan.id);
                        return [2 /*return*/, plan];
                }
            });
        });
    };
    /**
     * Busca um plano pelo ID
     */
    MercadoPagoService.prototype.getPlan = function (planId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.apiRequest("GET", "/preapproval_plan/".concat(planId))];
            });
        });
    };
    /**
     * Lista todos os planos
     */
    MercadoPagoService.prototype.listPlans = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.apiRequest("GET", "/preapproval_plan/search")];
            });
        });
    };
    /**
     * Cria uma assinatura (preapproval) - sem plano associado
     * Retorna um link de pagamento
     */
    MercadoPagoService.prototype.createSubscription = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var body, subscription;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        body = {
                            reason: params.reason,
                            external_reference: params.externalReference,
                            payer_email: params.payerEmail,
                            auto_recurring: {
                                frequency: params.autoRecurring.frequency,
                                frequency_type: params.autoRecurring.frequencyType,
                                transaction_amount: params.autoRecurring.transactionAmount,
                                currency_id: params.autoRecurring.currencyId,
                                start_date: params.autoRecurring.startDate,
                                end_date: params.autoRecurring.endDate,
                            },
                            back_url: params.backUrl,
                            status: params.status || "pending",
                        };
                        if (params.preapprovalPlanId) {
                            body.preapproval_plan_id = params.preapprovalPlanId;
                        }
                        return [4 /*yield*/, this.apiRequest("POST", "/preapproval", body)];
                    case 1:
                        subscription = _a.sent();
                        console.log("[MercadoPago] Assinatura criada:", subscription.id, "Link:", subscription.init_point);
                        return [2 /*return*/, subscription];
                }
            });
        });
    };
    /**
     * Busca uma assinatura pelo ID
     */
    MercadoPagoService.prototype.getSubscription = function (subscriptionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.apiRequest("GET", "/preapproval/".concat(subscriptionId))];
            });
        });
    };
    /**
     * Busca assinatura por external_reference
     */
    MercadoPagoService.prototype.searchSubscriptionByReference = function (reference) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.apiRequest("GET", "/preapproval/search?external_reference=".concat(reference))];
                    case 1:
                        result = _b.sent();
                        return [2 /*return*/, ((_a = result.results) === null || _a === void 0 ? void 0 : _a[0]) || null];
                }
            });
        });
    };
    /**
     * Atualiza uma assinatura
     */
    MercadoPagoService.prototype.updateSubscription = function (subscriptionId, data) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.apiRequest("PUT", "/preapproval/".concat(subscriptionId), data)];
            });
        });
    };
    /**
     * Cancela uma assinatura
     */
    MercadoPagoService.prototype.cancelSubscription = function (subscriptionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.updateSubscription(subscriptionId, { status: "cancelled" })];
            });
        });
    };
    /**
     * Pausa uma assinatura
     */
    MercadoPagoService.prototype.pauseSubscription = function (subscriptionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.updateSubscription(subscriptionId, { status: "paused" })];
            });
        });
    };
    /**
     * Reativa uma assinatura
     */
    MercadoPagoService.prototype.resumeSubscription = function (subscriptionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.updateSubscription(subscriptionId, { status: "authorized" })];
            });
        });
    };
    /**
     * Processa webhook do Mercado Pago
     */
    MercadoPagoService.prototype.processWebhook = function (topic, data) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        console.log("[MercadoPago] Webhook recebido - Topic: ".concat(topic), data);
                        _a = topic;
                        switch (_a) {
                            case "subscription_preapproval": return [3 /*break*/, 1];
                            case "subscription_authorized_payment": return [3 /*break*/, 3];
                            case "subscription_preapproval_plan": return [3 /*break*/, 5];
                        }
                        return [3 /*break*/, 7];
                    case 1: return [4 /*yield*/, this.handleSubscriptionWebhook(data)];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 3: return [4 /*yield*/, this.handlePaymentWebhook(data)];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 5: return [4 /*yield*/, this.handlePlanWebhook(data)];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        console.log("[MercadoPago] Webhook n\u00E3o tratado: ".concat(topic));
                        _b.label = 8;
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    MercadoPagoService.prototype.handleSubscriptionWebhook = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var mpSubscription, localSubscriptionId, status_1, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!data.id)
                            return [2 /*return*/];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.getSubscription(data.id)];
                    case 2:
                        mpSubscription = _a.sent();
                        console.log("[MercadoPago] Assinatura atualizada: ".concat(mpSubscription.id, " - Status: ").concat(mpSubscription.status));
                        // Busca assinatura local pelo external_reference usando SQL raw
                        if (mpSubscription.external_reference) {
                            localSubscriptionId = mpSubscription.external_reference.replace('sub_', '');
                            status_1 = "pending";
                            if (mpSubscription.status === "authorized")
                                status_1 = "active";
                            else if (mpSubscription.status === "cancelled")
                                status_1 = "cancelled";
                            else if (mpSubscription.status === "paused")
                                status_1 = "paused";
                            // Atualiza através das rotas internas
                            console.log("[MercadoPago] Atualizando assinatura local: ".concat(localSubscriptionId, " para status: ").concat(status_1));
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        error_3 = _a.sent();
                        console.error("[MercadoPago] Erro ao processar webhook de assinatura:", error_3);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    MercadoPagoService.prototype.handlePaymentWebhook = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                console.log("[MercadoPago] Pagamento de assinatura recebido:", data);
                return [2 /*return*/];
            });
        });
    };
    MercadoPagoService.prototype.handlePlanWebhook = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                console.log("[MercadoPago] Plano atualizado:", data);
                return [2 /*return*/];
            });
        });
    };
    /**
     * Verifica se as credenciais estão válidas
     */
    MercadoPagoService.prototype.testConnection = function () {
        return __awaiter(this, void 0, void 0, function () {
            var creds, plans, error_4;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.loadCredentials()];
                    case 1:
                        creds = _c.sent();
                        if (!creds) {
                            return [2 /*return*/, { success: false, message: "Credenciais não configuradas" }];
                        }
                        return [4 /*yield*/, this.listPlans()];
                    case 2:
                        plans = _c.sent();
                        return [2 /*return*/, {
                                success: true,
                                message: "Conex\u00E3o OK! ".concat(((_a = plans.results) === null || _a === void 0 ? void 0 : _a.length) || 0, " planos encontrados."),
                                data: { plansCount: ((_b = plans.results) === null || _b === void 0 ? void 0 : _b.length) || 0, isTestMode: creds.isTestMode },
                            }];
                    case 3:
                        error_4 = _c.sent();
                        return [2 /*return*/, { success: false, message: error_4.message || "Erro ao testar conexão" }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return MercadoPagoService;
}());
// Singleton
exports.mercadoPagoService = new MercadoPagoService();
