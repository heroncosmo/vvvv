"use strict";
/**
 * Reseller Service - Serviço de Revenda White-Label
 *
 * Funcionalidades:
 * - Criar e gerenciar revendedores
 * - Criar clientes para revendedores (com pagamento obrigatório)
 * - 1 cliente gratuito por revendedor (para demonstração)
 * - Checkout transparente PIX e Cartão
 * - White-label com branding customizado
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
exports.resellerService = void 0;
var storage_1 = require("./storage");
var mercadoPagoService_1 = require("./mercadoPagoService");
var supabaseAuth_1 = require("./supabaseAuth");
var pixService_1 = require("./pixService");
var uuid_1 = require("uuid");
var ResellerService = /** @class */ (function () {
    function ResellerService() {
    }
    /**
     * Obtém o ID do plano a ser usado para clientes de revenda
     * Usa o plano mensal padrão ou cria um plano especial se necessário
     */
    ResellerService.prototype.getResellerClientPlanId = function () {
        return __awaiter(this, void 0, void 0, function () {
            var plans, monthlyPlan;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, storage_1.storage.getActivePlans()];
                    case 1:
                        plans = _a.sent();
                        monthlyPlan = plans.find(function (p) {
                            var _a;
                            return (p.tipo === "padrao" || p.tipo === "mensal") &&
                                ((_a = p.nome) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes("mensal"));
                        });
                        if (monthlyPlan) {
                            return [2 /*return*/, monthlyPlan.id.toString()];
                        }
                        // Se não encontrar, usar o primeiro plano ativo
                        if (plans.length > 0) {
                            return [2 /*return*/, plans[0].id.toString()];
                        }
                        throw new Error("Nenhum plano disponível no sistema");
                }
            });
        });
    };
    /**
     * Verifica se um usuário tem plano de revenda ativo
     */
    ResellerService.prototype.hasResellerPlan = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var subscription, plan;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, storage_1.storage.getUserSubscription(userId)];
                    case 1:
                        subscription = _a.sent();
                        if (!subscription || subscription.status !== "active") {
                            return [2 /*return*/, false];
                        }
                        return [4 /*yield*/, storage_1.storage.getPlan(subscription.planId)];
                    case 2:
                        plan = _a.sent();
                        return [2 /*return*/, (plan === null || plan === void 0 ? void 0 : plan.tipo) === "revenda"];
                }
            });
        });
    };
    /**
     * Configura um usuário como revendedor (cria registro na tabela resellers)
     */
    ResellerService.prototype.setupReseller = function (userId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var existingReseller, updated, isAvailable, reseller, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 7, , 8]);
                        return [4 /*yield*/, storage_1.storage.getResellerByUserId(userId)];
                    case 1:
                        existingReseller = _a.sent();
                        if (!existingReseller) return [3 /*break*/, 3];
                        return [4 /*yield*/, storage_1.storage.updateReseller(existingReseller.id, __assign(__assign({}, data), { costPerClient: "49.99" }))];
                    case 2:
                        updated = _a.sent();
                        return [2 /*return*/, { success: true, reseller: updated }];
                    case 3:
                        if (!data.subdomain) return [3 /*break*/, 5];
                        return [4 /*yield*/, storage_1.storage.isSubdomainAvailable(data.subdomain)];
                    case 4:
                        isAvailable = _a.sent();
                        if (!isAvailable) {
                            return [2 /*return*/, { success: false, error: "Subdomínio já está em uso" }];
                        }
                        _a.label = 5;
                    case 5: return [4 /*yield*/, storage_1.storage.createReseller({
                            userId: userId,
                            companyName: data.companyName,
                            companyDescription: data.companyDescription,
                            subdomain: data.subdomain,
                            primaryColor: data.primaryColor || "#000000",
                            secondaryColor: data.secondaryColor || "#ffffff",
                            accentColor: data.accentColor || "#22c55e",
                            clientMonthlyPrice: data.clientMonthlyPrice || "99.99",
                            clientSetupFee: data.clientSetupFee || "0",
                            costPerClient: "49.99",
                            supportEmail: data.supportEmail,
                            supportPhone: data.supportPhone,
                            welcomeMessage: data.welcomeMessage,
                            isActive: true,
                            domainVerified: false,
                        })];
                    case 6:
                        reseller = _a.sent();
                        return [2 /*return*/, { success: true, reseller: reseller }];
                    case 7:
                        error_1 = _a.sent();
                        console.error("[ResellerService] Erro ao configurar revendedor:", error_1);
                        return [2 /*return*/, { success: false, error: error_1.message }];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Verifica se o revendedor já usou seu cliente gratuito
     */
    ResellerService.prototype.hasFreeClientSlot = function (resellerId) {
        return __awaiter(this, void 0, void 0, function () {
            var freeClients;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, storage_1.storage.countFreeResellerClients(resellerId)];
                    case 1:
                        freeClients = _a.sent();
                        return [2 /*return*/, freeClients === 0]; // Só pode ter 1 cliente gratuito
                }
            });
        });
    };
    /**
     * Cria um cliente GRATUITO para demonstração (1 por revendedor)
     */
    ResellerService.prototype.createFreeClient = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var resellerId, name, email, phone, password, clientPrice, reseller, hasFreeSlot, existingUser, _a, authData, authError, user, resellerClient, planId, plan, now, dataFim, error_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        resellerId = params.resellerId, name = params.name, email = params.email, phone = params.phone, password = params.password, clientPrice = params.clientPrice;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 11, , 12]);
                        return [4 /*yield*/, storage_1.storage.getReseller(resellerId)];
                    case 2:
                        reseller = _b.sent();
                        if (!reseller || !reseller.isActive) {
                            return [2 /*return*/, { success: false, error: "Revendedor não encontrado ou inativo" }];
                        }
                        return [4 /*yield*/, this.hasFreeClientSlot(resellerId)];
                    case 3:
                        hasFreeSlot = _b.sent();
                        if (!hasFreeSlot) {
                            return [2 /*return*/, { success: false, error: "Você já possui um cliente de demonstração gratuito" }];
                        }
                        return [4 /*yield*/, storage_1.storage.getUserByEmail(email)];
                    case 4:
                        existingUser = _b.sent();
                        if (existingUser) {
                            return [2 /*return*/, { success: false, error: "Este email já está cadastrado" }];
                        }
                        return [4 /*yield*/, supabaseAuth_1.supabase.auth.admin.createUser({
                                email: email,
                                password: password,
                                email_confirm: true,
                                user_metadata: { name: name, phone: phone }
                            })];
                    case 5:
                        _a = _b.sent(), authData = _a.data, authError = _a.error;
                        if (authError || !authData.user) {
                            console.error("[ResellerService] Erro ao criar usuário:", authError);
                            return [2 /*return*/, { success: false, error: (authError === null || authError === void 0 ? void 0 : authError.message) || "Erro ao criar usuário" }];
                        }
                        return [4 /*yield*/, storage_1.storage.upsertUser({
                                id: authData.user.id,
                                email: email,
                                name: name,
                                phone: phone,
                                role: "user",
                                resellerId: reseller.id,
                                onboardingCompleted: false,
                            })];
                    case 6:
                        user = _b.sent();
                        return [4 /*yield*/, storage_1.storage.createResellerClient({
                                resellerId: resellerId,
                                userId: user.id,
                                status: "active",
                                monthlyCost: "0", // Gratuito para o revendedor também
                                clientPrice: clientPrice || reseller.clientMonthlyPrice || "99.99",
                                isFreeClient: true,
                                activatedAt: new Date(),
                            })];
                    case 7:
                        resellerClient = _b.sent();
                        return [4 /*yield*/, this.getResellerClientPlanId()];
                    case 8:
                        planId = _b.sent();
                        return [4 /*yield*/, storage_1.storage.getPlan(planId)];
                    case 9:
                        plan = _b.sent();
                        now = new Date();
                        dataFim = new Date(now);
                        // Calcular data fim baseado na periodicidade do plano
                        if (plan && plan.periodicidade === "anual") {
                            dataFim.setFullYear(dataFim.getFullYear() + 1); // 1 ano
                        }
                        else {
                            dataFim.setMonth(dataFim.getMonth() + 1); // 30 dias (1 mês)
                        }
                        return [4 /*yield*/, storage_1.storage.createSubscription({
                                userId: user.id,
                                planId: planId,
                                status: "active",
                                dataInicio: now,
                                dataFim: dataFim,
                                paymentMethod: "reseller_free",
                            })];
                    case 10:
                        _b.sent();
                        console.log("[ResellerService] Cliente gratuito ".concat(email, " criado para revendedor ").concat(resellerId));
                        return [2 /*return*/, {
                                success: true,
                                clientId: resellerClient.id,
                                userId: user.id,
                                requiresPayment: false,
                            }];
                    case 11:
                        error_2 = _b.sent();
                        console.error("[ResellerService] Erro ao criar cliente gratuito:", error_2);
                        return [2 /*return*/, { success: false, error: error_2.message }];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Cria checkout para novo cliente (PIX ou Cartão)
     * O revendedor paga R$ 49,99 por mês por cada cliente
     */
    ResellerService.prototype.createClientCheckout = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var resellerId, clientData, paymentMethod, cardData, reseller, activeClients, existingUser, costPerClient, externalReference, resellerUser, payerEmail, pixManualConfig, pixManualEnabled, payment, _a, pixCode, pixQrCode, error_3, creds, pixPaymentData, pixResponse, pixResult, transactionData, errorMessage, creds, paymentBody, response, mpPayment, payment, error_4;
            var _b, _c, _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        resellerId = params.resellerId, clientData = params.clientData, paymentMethod = params.paymentMethod, cardData = params.cardData;
                        _f.label = 1;
                    case 1:
                        _f.trys.push([1, 33, , 34]);
                        return [4 /*yield*/, storage_1.storage.getReseller(resellerId)];
                    case 2:
                        reseller = _f.sent();
                        if (!reseller || !reseller.isActive) {
                            return [2 /*return*/, { success: false, error: "Revendedor não encontrado ou inativo" }];
                        }
                        return [4 /*yield*/, storage_1.storage.countActiveResellerClients(resellerId)];
                    case 3:
                        activeClients = _f.sent();
                        if (activeClients >= (reseller.maxClients || 100)) {
                            return [2 /*return*/, { success: false, error: "Limite de clientes atingido" }];
                        }
                        return [4 /*yield*/, storage_1.storage.getUserByEmail(clientData.email)];
                    case 4:
                        existingUser = _f.sent();
                        if (existingUser) {
                            return [2 /*return*/, { success: false, error: "Este email já está cadastrado" }];
                        }
                        costPerClient = Number(reseller.costPerClient || 49.99);
                        externalReference = "reseller_client_".concat((0, uuid_1.v4)());
                        return [4 /*yield*/, storage_1.storage.getUser(reseller.userId)];
                    case 5:
                        resellerUser = _f.sent();
                        payerEmail = (resellerUser === null || resellerUser === void 0 ? void 0 : resellerUser.email) || clientData.email;
                        if (!(paymentMethod === 'pix')) return [3 /*break*/, 24];
                        return [4 /*yield*/, storage_1.storage.getSystemConfig('pix_manual_enabled')];
                    case 6:
                        pixManualConfig = _f.sent();
                        pixManualEnabled = (pixManualConfig === null || pixManualConfig === void 0 ? void 0 : pixManualConfig.valor) === 'true';
                        return [4 /*yield*/, storage_1.storage.createResellerPayment({
                                resellerId: resellerId,
                                amount: String(costPerClient),
                                paymentType: "client_creation",
                                status: "pending",
                                payerEmail: payerEmail,
                                paymentMethod: "pix",
                                description: "Cria\u00E7\u00E3o de cliente: ".concat(clientData.name, " (").concat(clientData.email, ")"),
                            })];
                    case 7:
                        payment = _f.sent();
                        if (!pixManualEnabled) return [3 /*break*/, 14];
                        // 🔥 PIX MANUAL: Usar chave PIX do SISTEMA (plataforma recebe o pagamento do revendedor)
                        // NÃO usar reseller.pixKey aqui — o revendedor está PAGANDO para a plataforma
                        console.log("[ResellerService] Usando PIX Manual (chave PIX do sistema/plataforma)");
                        _f.label = 8;
                    case 8:
                        _f.trys.push([8, 11, , 13]);
                        return [4 /*yield*/, (0, pixService_1.generatePixQRCode)({
                                planNome: "Novo Cliente: ".concat(clientData.name),
                                valor: costPerClient,
                                subscriptionId: payment.id,
                                // pixKeyOverride: undefined → usa a chave PIX do sistema (system_config.pix_key)
                            })];
                    case 9:
                        _a = _f.sent(), pixCode = _a.pixCode, pixQrCode = _a.pixQrCode;
                        // Atualizar pagamento com dados do PIX manual
                        return [4 /*yield*/, storage_1.storage.updateResellerPayment(payment.id, {
                                statusDetail: JSON.stringify({
                                    clientData: clientData,
                                    externalReference: externalReference,
                                    pixManual: true,
                                }),
                            })];
                    case 10:
                        // Atualizar pagamento com dados do PIX manual
                        _f.sent();
                        return [2 /*return*/, {
                                success: true,
                                paymentId: payment.id,
                                pixCode: pixCode,
                                pixQrCode: pixQrCode,
                                requiresPayment: true,
                            }];
                    case 11:
                        error_3 = _f.sent();
                        console.error("[ResellerService] Erro ao gerar PIX manual:", error_3);
                        return [4 /*yield*/, storage_1.storage.updateResellerPayment(payment.id, {
                                status: "cancelled",
                                statusDetail: JSON.stringify({ error: error_3.message }),
                            })];
                    case 12:
                        _f.sent();
                        return [2 /*return*/, { success: false, error: "Erro ao gerar PIX. Tente novamente." }];
                    case 13: return [3 /*break*/, 23];
                    case 14: return [4 /*yield*/, mercadoPagoService_1.mercadoPagoService.loadCredentials()];
                    case 15:
                        creds = _f.sent();
                        if (!!creds) return [3 /*break*/, 17];
                        return [4 /*yield*/, storage_1.storage.updateResellerPayment(payment.id, {
                                status: "cancelled",
                                statusDetail: JSON.stringify({ error: "MercadoPago não configurado" }),
                            })];
                    case 16:
                        _f.sent();
                        return [2 /*return*/, { success: false, error: "MercadoPago não configurado" }];
                    case 17:
                        pixPaymentData = {
                            transaction_amount: costPerClient,
                            payment_method_id: "pix",
                            description: "AgentZap - Cria\u00E7\u00E3o de cliente: ".concat(clientData.name),
                            payer: {
                                email: payerEmail,
                            },
                            external_reference: "reseller_client_".concat(payment.id),
                            notification_url: "".concat(process.env.BASE_URL || 'https://agentezap.online', "/api/webhooks/mercadopago"),
                            date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                        };
                        return [4 /*yield*/, fetch("https://api.mercadopago.com/v1/payments", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "Authorization": "Bearer ".concat(creds.accessToken),
                                    "X-Idempotency-Key": "pix_reseller_".concat(payment.id, "_").concat(Date.now()),
                                },
                                body: JSON.stringify(pixPaymentData),
                            })];
                    case 18:
                        pixResponse = _f.sent();
                        return [4 /*yield*/, pixResponse.json()];
                    case 19:
                        pixResult = _f.sent();
                        console.log("[ResellerService] PIX Payment result:", {
                            status: pixResult.status,
                            statusDetail: pixResult.status_detail,
                            id: pixResult.id,
                            hasQrCode: !!((_c = (_b = pixResult.point_of_interaction) === null || _b === void 0 ? void 0 : _b.transaction_data) === null || _c === void 0 ? void 0 : _c.qr_code),
                        });
                        if (!(pixResult.status === "pending" && ((_d = pixResult.point_of_interaction) === null || _d === void 0 ? void 0 : _d.transaction_data))) return [3 /*break*/, 21];
                        transactionData = pixResult.point_of_interaction.transaction_data;
                        // Atualizar pagamento com dados do MercadoPago
                        return [4 /*yield*/, storage_1.storage.updateResellerPayment(payment.id, {
                                mpPaymentId: (_e = pixResult.id) === null || _e === void 0 ? void 0 : _e.toString(),
                                statusDetail: JSON.stringify({
                                    clientData: clientData,
                                    externalReference: externalReference,
                                    mpPaymentId: pixResult.id,
                                }),
                            })];
                    case 20:
                        // Atualizar pagamento com dados do MercadoPago
                        _f.sent();
                        return [2 /*return*/, {
                                success: true,
                                paymentId: payment.id,
                                pixCode: transactionData.qr_code, // Código Pix Copia e Cola
                                pixQrCode: transactionData.qr_code_base64, // Imagem QR Code já em base64
                                requiresPayment: true,
                            }];
                    case 21:
                        errorMessage = pixResult.message || "Erro ao gerar PIX. Tente novamente.";
                        console.error("[ResellerService] PIX Error:", pixResult);
                        // Remover pagamento com erro
                        return [4 /*yield*/, storage_1.storage.updateResellerPayment(payment.id, {
                                status: "cancelled",
                                statusDetail: JSON.stringify({ error: errorMessage }),
                            })];
                    case 22:
                        // Remover pagamento com erro
                        _f.sent();
                        return [2 /*return*/, { success: false, error: errorMessage }];
                    case 23: return [3 /*break*/, 32];
                    case 24:
                        if (!(paymentMethod === 'credit_card' && cardData)) return [3 /*break*/, 32];
                        return [4 /*yield*/, mercadoPagoService_1.mercadoPagoService.loadCredentials()];
                    case 25:
                        creds = _f.sent();
                        if (!creds) {
                            return [2 /*return*/, { success: false, error: "MercadoPago não configurado" }];
                        }
                        paymentBody = {
                            transaction_amount: costPerClient,
                            token: cardData.token,
                            description: "AgentZap - Cliente ".concat(clientData.name),
                            installments: cardData.installments || 1,
                            payment_method_id: 'master', // Será detectado pelo token
                            payer: {
                                email: cardData.payerEmail || payerEmail,
                            },
                            external_reference: externalReference,
                        };
                        return [4 /*yield*/, fetch('https://api.mercadopago.com/v1/payments', {
                                method: 'POST',
                                headers: {
                                    'Authorization': "Bearer ".concat(creds.accessToken),
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify(paymentBody),
                            })];
                    case 26:
                        response = _f.sent();
                        return [4 /*yield*/, response.json()];
                    case 27:
                        mpPayment = _f.sent();
                        if (!(mpPayment.status === 'approved')) return [3 /*break*/, 29];
                        return [4 /*yield*/, this.createPaidClient(__assign(__assign({ resellerId: resellerId }, clientData), { paymentId: mpPayment.id, paymentMethod: 'credit_card' }))];
                    case 28: 
                    // Pagamento aprovado - criar cliente imediatamente
                    return [2 /*return*/, _f.sent()];
                    case 29:
                        if (!(mpPayment.status === 'in_process' || mpPayment.status === 'pending')) return [3 /*break*/, 31];
                        return [4 /*yield*/, storage_1.storage.createResellerPayment({
                                resellerId: resellerId,
                                amount: String(costPerClient),
                                paymentType: "client_creation",
                                status: "pending",
                                mpPaymentId: mpPayment.id,
                                payerEmail: cardData.payerEmail || payerEmail,
                                paymentMethod: "credit_card",
                                description: "Cria\u00E7\u00E3o de cliente: ".concat(clientData.name),
                                statusDetail: JSON.stringify({ clientData: clientData, externalReference: externalReference }),
                            })];
                    case 30:
                        payment = _f.sent();
                        return [2 /*return*/, {
                                success: true,
                                paymentId: payment.id,
                                requiresPayment: true,
                                error: "Pagamento em processamento",
                            }];
                    case 31: 
                    // Pagamento rejeitado
                    return [2 /*return*/, {
                            success: false,
                            error: "Pagamento rejeitado: ".concat(mpPayment.status_detail || mpPayment.status),
                        }];
                    case 32: return [2 /*return*/, { success: false, error: "Método de pagamento inválido" }];
                    case 33:
                        error_4 = _f.sent();
                        console.error("[ResellerService] Erro no checkout:", error_4);
                        return [2 /*return*/, { success: false, error: error_4.message }];
                    case 34: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Cria cliente após pagamento confirmado
     */
    ResellerService.prototype.createPaidClient = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var resellerId, name, email, phone, password, clientPrice, paymentId, paymentMethod, reseller, _a, authData, authError, user, resellerClient, planId, plan, now, dataFim, error_5;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        resellerId = params.resellerId, name = params.name, email = params.email, phone = params.phone, password = params.password, clientPrice = params.clientPrice, paymentId = params.paymentId, paymentMethod = params.paymentMethod;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 10, , 11]);
                        return [4 /*yield*/, storage_1.storage.getReseller(resellerId)];
                    case 2:
                        reseller = _b.sent();
                        if (!reseller) {
                            return [2 /*return*/, { success: false, error: "Revendedor não encontrado" }];
                        }
                        return [4 /*yield*/, supabaseAuth_1.supabase.auth.admin.createUser({
                                email: email,
                                password: password,
                                email_confirm: true,
                                user_metadata: { name: name, phone: phone }
                            })];
                    case 3:
                        _a = _b.sent(), authData = _a.data, authError = _a.error;
                        if (authError || !authData.user) {
                            console.error("[ResellerService] Erro ao criar usuário:", authError);
                            return [2 /*return*/, { success: false, error: (authError === null || authError === void 0 ? void 0 : authError.message) || "Erro ao criar usuário" }];
                        }
                        return [4 /*yield*/, storage_1.storage.upsertUser({
                                id: authData.user.id,
                                email: email,
                                name: name,
                                phone: phone,
                                role: "user",
                                resellerId: reseller.id,
                                onboardingCompleted: false,
                            })];
                    case 4:
                        user = _b.sent();
                        return [4 /*yield*/, storage_1.storage.createResellerClient({
                                resellerId: resellerId,
                                userId: user.id,
                                status: "active",
                                monthlyCost: reseller.costPerClient || "49.99",
                                clientPrice: clientPrice || reseller.clientMonthlyPrice || "99.99",
                                isFreeClient: false,
                                mpPaymentId: paymentId,
                                mpStatus: "approved",
                                activatedAt: new Date(),
                            })];
                    case 5:
                        resellerClient = _b.sent();
                        // Registrar pagamento
                        return [4 /*yield*/, storage_1.storage.createResellerPayment({
                                resellerId: resellerId,
                                resellerClientId: resellerClient.id,
                                amount: reseller.costPerClient || "49.99",
                                paymentType: "client_creation",
                                status: "approved",
                                mpPaymentId: paymentId,
                                paymentMethod: paymentMethod,
                                paidAt: new Date(),
                                description: "Cliente ".concat(name, " criado"),
                            })];
                    case 6:
                        // Registrar pagamento
                        _b.sent();
                        return [4 /*yield*/, this.getResellerClientPlanId()];
                    case 7:
                        planId = _b.sent();
                        return [4 /*yield*/, storage_1.storage.getPlan(planId)];
                    case 8:
                        plan = _b.sent();
                        now = new Date();
                        dataFim = new Date(now);
                        // Calcular data fim baseado na periodicidade do plano
                        if (plan && plan.periodicidade === "anual") {
                            dataFim.setFullYear(dataFim.getFullYear() + 1); // 1 ano
                        }
                        else {
                            dataFim.setMonth(dataFim.getMonth() + 1); // 30 dias (1 mês)
                        }
                        return [4 /*yield*/, storage_1.storage.createSubscription({
                                userId: user.id,
                                planId: planId,
                                status: "active",
                                dataInicio: now,
                                dataFim: dataFim,
                                paymentMethod: "reseller",
                            })];
                    case 9:
                        _b.sent();
                        console.log("[ResellerService] Cliente pago ".concat(email, " criado para revendedor ").concat(resellerId));
                        return [2 /*return*/, {
                                success: true,
                                clientId: resellerClient.id,
                                userId: user.id,
                                requiresPayment: false,
                            }];
                    case 10:
                        error_5 = _b.sent();
                        console.error("[ResellerService] Erro ao criar cliente pago:", error_5);
                        return [2 /*return*/, { success: false, error: error_5.message }];
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Cria fatura granular para lista de clientes selecionados
     */
    ResellerService.prototype.createGranularInvoice = function (resellerId, clientIds) {
        return __awaiter(this, void 0, void 0, function () {
            var reseller, unitPrice, totalAmount, invoiceItems, _i, clientIds_1, clientId, client, creds, externalReference, pixPaymentData, pixResponse, pixResult, invoice, error_6;
            var _a, _b;
            var _c, _d, _e, _f, _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        _h.trys.push([0, 11, , 12]);
                        return [4 /*yield*/, storage_1.storage.getReseller(resellerId)];
                    case 1:
                        reseller = _h.sent();
                        if (!reseller)
                            throw new Error("Revendedor não encontrado");
                        unitPrice = Number(reseller.costPerClient || 49.99);
                        totalAmount = 0;
                        invoiceItems = [];
                        _i = 0, clientIds_1 = clientIds;
                        _h.label = 2;
                    case 2:
                        if (!(_i < clientIds_1.length)) return [3 /*break*/, 5];
                        clientId = clientIds_1[_i];
                        return [4 /*yield*/, storage_1.storage.getResellerClient(clientId)];
                    case 3:
                        client = _h.sent();
                        if (!client || client.resellerId !== resellerId) {
                            console.warn("Cliente ".concat(clientId, " inv\u00E1lido para revendedor ").concat(resellerId));
                            return [3 /*break*/, 4];
                        }
                        totalAmount += unitPrice;
                        invoiceItems.push({
                            resellerClientId: clientId,
                            amount: String(unitPrice),
                            description: "Renova\u00E7\u00E3o SaaS - Cliente ".concat(clientId)
                        });
                        _h.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5:
                        if (invoiceItems.length === 0) {
                            return [2 /*return*/, { success: false, error: "Nenhum cliente válido selecionado" }];
                        }
                        return [4 /*yield*/, mercadoPagoService_1.mercadoPagoService.loadCredentials()];
                    case 6:
                        creds = _h.sent();
                        if (!creds)
                            throw new Error("MercadoPago não configurado na admin");
                        externalReference = "reseller_granular_".concat(Date.now(), "_").concat(resellerId);
                        _a = {
                            transaction_amount: totalAmount,
                            description: "Renova\u00E7\u00E3o de ".concat(invoiceItems.length, " clientes - Revenda"),
                            payment_method_id: "pix"
                        };
                        _b = {};
                        return [4 /*yield*/, storage_1.storage.getUser(reseller.userId)];
                    case 7:
                        pixPaymentData = (_a.payer = (_b.email = ((_c = (_h.sent())) === null || _c === void 0 ? void 0 : _c.email) || "reseller@agentezap.online",
                            _b.first_name = reseller.companyName,
                            _b),
                            _a.external_reference = externalReference,
                            _a.notification_url = "".concat(process.env.BASE_URL || 'https://agentezap.online', "/api/webhooks/mercadopago"),
                            _a);
                        return [4 /*yield*/, fetch("https://api.mercadopago.com/v1/payments", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "Authorization": "Bearer ".concat(creds.accessToken),
                                    "X-Idempotency-Key": externalReference
                                },
                                body: JSON.stringify(pixPaymentData),
                            })];
                    case 8:
                        pixResponse = _h.sent();
                        return [4 /*yield*/, pixResponse.json()];
                    case 9:
                        pixResult = _h.sent();
                        if (pixResult.status === "rejected") {
                            return [2 /*return*/, { success: false, error: "Pagamento rejeitado pelo Mercado Pago" }];
                        }
                        return [4 /*yield*/, storage_1.storage.createResellerInvoiceWithItems({
                                resellerId: resellerId,
                                referenceMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
                                dueDate: new Date().toISOString(), // Hoje
                                activeClients: invoiceItems.length,
                                unitPrice: String(unitPrice),
                                totalAmount: String(totalAmount),
                                status: "pending",
                                paymentMethod: "pix",
                                mpPaymentId: String(pixResult.id)
                            }, invoiceItems)];
                    case 10:
                        invoice = _h.sent();
                        return [2 /*return*/, {
                                success: true,
                                invoiceId: invoice.id,
                                paymentUrl: (_e = (_d = pixResult.point_of_interaction) === null || _d === void 0 ? void 0 : _d.transaction_data) === null || _e === void 0 ? void 0 : _e.ticket_url,
                                qrCode: (_g = (_f = pixResult.point_of_interaction) === null || _f === void 0 ? void 0 : _f.transaction_data) === null || _g === void 0 ? void 0 : _g.qr_code,
                                totalAmount: totalAmount
                            }];
                    case 11:
                        error_6 = _h.sent();
                        console.error("Erro ao criar fatura granular:", error_6);
                        return [2 /*return*/, { success: false, error: error_6.message }];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Processa Webhook de pagamento granular (Pix Aprovado)
     */
    ResellerService.prototype.processGranularPaymentWebhook = function (payment) {
        return __awaiter(this, void 0, void 0, function () {
            var invoice, items, _i, items_1, item, client, currentSaaSDate, newExpirtyDate;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (payment.status !== "approved") {
                            console.log("[ResellerService] Pagamento granular ".concat(payment.id, " n\u00E3o aprovado (").concat(payment.status, ")"));
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, storage_1.storage.getResellerInvoiceByMpPaymentId(String(payment.id))];
                    case 1:
                        invoice = _a.sent();
                        if (!invoice) {
                            console.error("[ResellerService] Fatura granular n\u00E3o encontrada para pagamento ".concat(payment.id));
                            return [2 /*return*/];
                        }
                        if (invoice.status === "paid") {
                            console.log("[ResellerService] Fatura ".concat(invoice.id, " j\u00E1 est\u00E1 paga."));
                            return [2 /*return*/];
                        }
                        // Atualizar fatura para PAGO
                        return [4 /*yield*/, storage_1.storage.updateResellerInvoice(invoice.id, {
                                status: "paid",
                                paidAt: new Date(),
                                paymentMethod: payment.payment_method_id
                            })];
                    case 2:
                        // Atualizar fatura para PAGO
                        _a.sent();
                        return [4 /*yield*/, storage_1.storage.getResellerInvoiceItems(invoice.id)];
                    case 3:
                        items = _a.sent();
                        _i = 0, items_1 = items;
                        _a.label = 4;
                    case 4:
                        if (!(_i < items_1.length)) return [3 /*break*/, 8];
                        item = items_1[_i];
                        if (!item.resellerClientId)
                            return [3 /*break*/, 7];
                        return [4 /*yield*/, storage_1.storage.getResellerClient(item.resellerClientId)];
                    case 5:
                        client = _a.sent();
                        if (!client)
                            return [3 /*break*/, 7];
                        currentSaaSDate = client.saasPaidUntil ? new Date(client.saasPaidUntil) : new Date();
                        if (currentSaaSDate < new Date()) {
                            currentSaaSDate = new Date(); // Se já venceu, começa de hoje
                        }
                        newExpirtyDate = new Date(currentSaaSDate);
                        newExpirtyDate.setDate(newExpirtyDate.getDate() + 30);
                        // Atualizar cliente
                        return [4 /*yield*/, storage_1.storage.updateResellerClient(client.id, {
                                saasPaidUntil: newExpirtyDate,
                                saasStatus: "active"
                            })];
                    case 6:
                        // Atualizar cliente
                        _a.sent();
                        console.log("[ResellerService] SaaS renovado para cliente ".concat(client.id, " at\u00E9 ").concat(newExpirtyDate.toISOString()));
                        _a.label = 7;
                    case 7:
                        _i++;
                        return [3 /*break*/, 4];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Confirma pagamento PIX e cria o cliente
     */
    ResellerService.prototype.confirmPixPayment = function (paymentId) {
        return __awaiter(this, void 0, void 0, function () {
            var payment, paymentData, clientData, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, storage_1.storage.getResellerPayment(paymentId)];
                    case 1:
                        payment = _a.sent();
                        if (!payment) {
                            return [2 /*return*/, { success: false, error: "Pagamento não encontrado" }];
                        }
                        if (payment.status !== "pending") {
                            return [2 /*return*/, { success: false, error: "Pagamento já foi processado" }];
                        }
                        paymentData = JSON.parse(payment.statusDetail || '{}');
                        clientData = paymentData.clientData;
                        if (!clientData) {
                            return [2 /*return*/, { success: false, error: "Dados do cliente não encontrados" }];
                        }
                        // Atualizar pagamento como aprovado
                        return [4 /*yield*/, storage_1.storage.updateResellerPayment(paymentId, {
                                status: "approved",
                                paidAt: new Date(),
                            })];
                    case 2:
                        // Atualizar pagamento como aprovado
                        _a.sent();
                        return [4 /*yield*/, this.createPaidClient(__assign(__assign({ resellerId: payment.resellerId }, clientData), { paymentId: paymentId, paymentMethod: "pix" }))];
                    case 3: 
                    // Criar o cliente
                    return [2 /*return*/, _a.sent()];
                    case 4:
                        error_7 = _a.sent();
                        console.error("[ResellerService] Erro ao confirmar PIX:", error_7);
                        return [2 /*return*/, { success: false, error: error_7.message }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Cria um cliente para o revendedor
     * - Cria o usuário no sistema
     * - Vincula ao revendedor
     * - Gera link de pagamento (R$ 49,99)
     */
    ResellerService.prototype.createClient = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var resellerId, name, email, phone, password, reseller, activeClients, existingUser, _a, authData, authError, user, resellerClient, costPerClient, externalReference, resellerUser, payerEmail, mpSubscription, mpError_1, error_8;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        resellerId = params.resellerId, name = params.name, email = params.email, phone = params.phone, password = params.password;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 16, , 17]);
                        return [4 /*yield*/, storage_1.storage.getReseller(resellerId)];
                    case 2:
                        reseller = _b.sent();
                        if (!reseller || !reseller.isActive) {
                            return [2 /*return*/, { success: false, error: "Revendedor não encontrado ou inativo" }];
                        }
                        return [4 /*yield*/, storage_1.storage.countActiveResellerClients(resellerId)];
                    case 3:
                        activeClients = _b.sent();
                        if (activeClients >= (reseller.maxClients || 100)) {
                            return [2 /*return*/, { success: false, error: "Limite de clientes atingido" }];
                        }
                        return [4 /*yield*/, storage_1.storage.getUserByEmail(email)];
                    case 4:
                        existingUser = _b.sent();
                        if (existingUser) {
                            return [2 /*return*/, { success: false, error: "Este email já está cadastrado" }];
                        }
                        return [4 /*yield*/, supabaseAuth_1.supabase.auth.admin.createUser({
                                email: email,
                                password: password,
                                email_confirm: true,
                                user_metadata: {
                                    name: name,
                                    phone: phone,
                                }
                            })];
                    case 5:
                        _a = _b.sent(), authData = _a.data, authError = _a.error;
                        if (authError || !authData.user) {
                            console.error("[ResellerService] Erro ao criar usuário no Supabase Auth:", authError);
                            return [2 /*return*/, { success: false, error: (authError === null || authError === void 0 ? void 0 : authError.message) || "Erro ao criar usuário" }];
                        }
                        return [4 /*yield*/, storage_1.storage.upsertUser({
                                id: authData.user.id,
                                email: email,
                                name: name,
                                phone: phone,
                                role: "user",
                                resellerId: reseller.id,
                                onboardingCompleted: false,
                            })];
                    case 6:
                        user = _b.sent();
                        return [4 /*yield*/, storage_1.storage.createResellerClient({
                                resellerId: resellerId,
                                userId: user.id,
                                status: "pending",
                                monthlyCost: reseller.costPerClient || "49.99",
                            })];
                    case 7:
                        resellerClient = _b.sent();
                        costPerClient = Number(reseller.costPerClient || 49.99);
                        externalReference = "reseller_client_".concat(resellerClient.id);
                        return [4 /*yield*/, storage_1.storage.getUser(reseller.userId)];
                    case 8:
                        resellerUser = _b.sent();
                        payerEmail = (resellerUser === null || resellerUser === void 0 ? void 0 : resellerUser.email) || email;
                        _b.label = 9;
                    case 9:
                        _b.trys.push([9, 13, , 15]);
                        return [4 /*yield*/, mercadoPagoService_1.mercadoPagoService.createSubscription({
                                reason: "AgentZap - Cliente ".concat(name),
                                externalReference: externalReference,
                                payerEmail: payerEmail,
                                autoRecurring: {
                                    frequency: 1,
                                    frequencyType: "months",
                                    transactionAmount: costPerClient,
                                    currencyId: "BRL",
                                },
                                backUrl: "".concat(process.env.BASE_URL || 'https://agentezap.com', "/reseller/clients?payment=success"),
                            })];
                    case 10:
                        mpSubscription = _b.sent();
                        // Atualizar cliente com dados do MercadoPago
                        return [4 /*yield*/, storage_1.storage.updateResellerClient(resellerClient.id, {
                                mpSubscriptionId: mpSubscription.id,
                                mpStatus: mpSubscription.status,
                            })];
                    case 11:
                        // Atualizar cliente com dados do MercadoPago
                        _b.sent();
                        // Criar registro de pagamento pendente
                        return [4 /*yield*/, storage_1.storage.createResellerPayment({
                                resellerId: resellerId,
                                resellerClientId: resellerClient.id,
                                amount: String(costPerClient),
                                paymentType: "client_creation",
                                status: "pending",
                                payerEmail: payerEmail,
                                description: "Cria\u00E7\u00E3o de conta para ".concat(name),
                            })];
                    case 12:
                        // Criar registro de pagamento pendente
                        _b.sent();
                        return [2 /*return*/, {
                                success: true,
                                clientId: resellerClient.id,
                                userId: user.id,
                                paymentUrl: mpSubscription.init_point,
                            }];
                    case 13:
                        mpError_1 = _b.sent();
                        console.error("[ResellerService] Erro MercadoPago:", mpError_1);
                        // Reverter criação do cliente
                        return [4 /*yield*/, storage_1.storage.cancelResellerClient(resellerClient.id)];
                    case 14:
                        // Reverter criação do cliente
                        _b.sent();
                        return [2 /*return*/, {
                                success: false,
                                error: "Erro ao criar pagamento: ".concat(mpError_1.message),
                            }];
                    case 15: return [3 /*break*/, 17];
                    case 16:
                        error_8 = _b.sent();
                        console.error("[ResellerService] Erro ao criar cliente:", error_8);
                        return [2 /*return*/, { success: false, error: error_8.message }];
                    case 17: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Processa webhook de pagamento do MercadoPago para cliente de revendedor
     */
    ResellerService.prototype.processPaymentWebhook = function (externalReference, status, paymentId) {
        return __awaiter(this, void 0, void 0, function () {
            var clientId, client, payments, pendingPayment, payments, pendingPayment;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!externalReference.startsWith("reseller_client_")) {
                            return [2 /*return*/];
                        }
                        clientId = externalReference.replace("reseller_client_", "");
                        return [4 /*yield*/, storage_1.storage.getResellerClient(clientId)];
                    case 1:
                        client = _a.sent();
                        if (!client) {
                            console.error("[ResellerService] Cliente não encontrado:", clientId);
                            return [2 /*return*/];
                        }
                        if (!(status === "authorized" || status === "approved")) return [3 /*break*/, 6];
                        // Ativar cliente
                        return [4 /*yield*/, storage_1.storage.updateResellerClient(clientId, {
                                status: "active",
                                activatedAt: new Date(),
                                mpStatus: status,
                            })];
                    case 2:
                        // Ativar cliente
                        _a.sent();
                        return [4 /*yield*/, storage_1.storage.getResellerPayments(client.resellerId, 10)];
                    case 3:
                        payments = _a.sent();
                        pendingPayment = payments.find(function (p) { return p.resellerClientId === clientId && p.status === "pending"; });
                        if (!pendingPayment) return [3 /*break*/, 5];
                        return [4 /*yield*/, storage_1.storage.updateResellerPayment(pendingPayment.id, {
                                status: "approved",
                                mpPaymentId: paymentId,
                                paidAt: new Date(),
                            })];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5:
                        console.log("[ResellerService] Cliente ".concat(clientId, " ativado com sucesso"));
                        return [3 /*break*/, 11];
                    case 6:
                        if (!(status === "cancelled" || status === "rejected")) return [3 /*break*/, 11];
                        // Cancelar cliente
                        return [4 /*yield*/, storage_1.storage.updateResellerClient(clientId, {
                                status: "cancelled",
                                cancelledAt: new Date(),
                                mpStatus: status,
                            })];
                    case 7:
                        // Cancelar cliente
                        _a.sent();
                        return [4 /*yield*/, storage_1.storage.getResellerPayments(client.resellerId, 10)];
                    case 8:
                        payments = _a.sent();
                        pendingPayment = payments.find(function (p) { return p.resellerClientId === clientId && p.status === "pending"; });
                        if (!pendingPayment) return [3 /*break*/, 10];
                        return [4 /*yield*/, storage_1.storage.updateResellerPayment(pendingPayment.id, {
                                status: "rejected",
                                statusDetail: status,
                            })];
                    case 9:
                        _a.sent();
                        _a.label = 10;
                    case 10:
                        console.log("[ResellerService] Cliente ".concat(clientId, " cancelado - pagamento: ").concat(status));
                        _a.label = 11;
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Obtém estatísticas do dashboard do revendedor
     */
    ResellerService.prototype.getDashboardStats = function (resellerId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, storage_1.storage.getResellerDashboardMetrics(resellerId)];
            });
        });
    };
    /**
     * Detecta revendedor pelo host/domínio
     */
    ResellerService.prototype.detectResellerByHost = function (host) {
        return __awaiter(this, void 0, void 0, function () {
            var hostname, subdomain, reseller_1, reseller;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        hostname = host.split(":")[0];
                        if (!(hostname.includes(".agentezap.com") || hostname.includes(".agentezap.com.br"))) return [3 /*break*/, 2];
                        subdomain = hostname.split(".")[0];
                        if (!(subdomain && subdomain !== "www" && subdomain !== "app" && subdomain !== "api")) return [3 /*break*/, 2];
                        return [4 /*yield*/, storage_1.storage.getResellerBySubdomain(subdomain)];
                    case 1:
                        reseller_1 = _a.sent();
                        if (reseller_1 && reseller_1.isActive) {
                            return [2 /*return*/, { reseller: reseller_1, isWhiteLabel: true }];
                        }
                        _a.label = 2;
                    case 2: return [4 /*yield*/, storage_1.storage.getResellerByDomain(hostname)];
                    case 3:
                        reseller = _a.sent();
                        if (reseller && reseller.isActive && reseller.domainVerified) {
                            return [2 /*return*/, { reseller: reseller, isWhiteLabel: true }];
                        }
                        return [2 /*return*/, null];
                }
            });
        });
    };
    /**
     * Atualiza logo do revendedor
     */
    ResellerService.prototype.updateLogo = function (resellerId, logoUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, storage_1.storage.updateReseller(resellerId, { logoUrl: logoUrl })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, true];
                    case 2:
                        error_9 = _a.sent();
                        console.error("[ResellerService] Erro ao atualizar logo:", error_9);
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Configura domínio customizado
     */
    ResellerService.prototype.setupCustomDomain = function (resellerId, domain) {
        return __awaiter(this, void 0, void 0, function () {
            var isAvailable;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, storage_1.storage.isDomainAvailable(domain)];
                    case 1:
                        isAvailable = _a.sent();
                        if (!isAvailable) {
                            return [2 /*return*/, { success: false, error: "Domínio já está em uso" }];
                        }
                        // Atualizar revendedor (domínio não verificado ainda)
                        return [4 /*yield*/, storage_1.storage.updateReseller(resellerId, {
                                customDomain: domain,
                                domainVerified: false,
                            })];
                    case 2:
                        // Atualizar revendedor (domínio não verificado ainda)
                        _a.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        });
    };
    /**
     * Verifica domínio customizado (deve ser chamado após configurar DNS)
     */
    ResellerService.prototype.verifyCustomDomain = function (resellerId) {
        return __awaiter(this, void 0, void 0, function () {
            var reseller;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, storage_1.storage.getReseller(resellerId)];
                    case 1:
                        reseller = _a.sent();
                        if (!(reseller === null || reseller === void 0 ? void 0 : reseller.customDomain)) {
                            return [2 /*return*/, { success: false, error: "Domínio não configurado" }];
                        }
                        // TODO: Implementar verificação real de DNS
                        // Por agora, apenas marca como verificado
                        return [4 /*yield*/, storage_1.storage.updateReseller(resellerId, { domainVerified: true })];
                    case 2:
                        // TODO: Implementar verificação real de DNS
                        // Por agora, apenas marca como verificado
                        _a.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        });
    };
    return ResellerService;
}());
exports.resellerService = new ResellerService();
exports.default = exports.resellerService;
