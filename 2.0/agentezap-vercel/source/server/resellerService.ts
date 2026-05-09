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

import { storage } from "./storage";
import { mercadoPagoService } from "./mercadoPagoService";
import { supabase } from "./supabaseAuth";
import { generatePixQRCode } from "./pixService";
import { parseResellerPaymentStatusDetail } from "./resellerReceiptMetadata";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

export interface CreateClientParams {
  resellerId: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  isFreeClient?: boolean; // Se é o cliente gratuito de demonstração
  clientPrice?: string; // Preço que o revendedor cobra deste cliente
}

export interface CreateClientResult {
  success: boolean;
  clientId?: string;
  userId?: string;
  paymentUrl?: string;
  pixCode?: string;
  pixQrCode?: string;
  paymentId?: string;
  requiresPayment?: boolean;
  error?: string;
}

export interface CheckoutParams {
  resellerId: string;
  clientData: {
    name: string;
    email: string;
    phone: string;
    password: string;
    clientPrice?: string;
  };
  paymentMethod: 'pix' | 'credit_card';
  cardData?: {
    token: string;
    installments?: number;
    payerEmail: string;
  };
}

export interface ResellerDashboardStats {
  totalClients: number;
  activeClients: number;
  suspendedClients: number;
  cancelledClients: number;
  totalRevenue: number;
  monthlyRevenue: number;
  monthlyCost: number;
  monthlyProfit: number;
}

class ResellerService {
  
  /**
   * Obtém o ID do plano a ser usado para clientes de revenda
   * Usa o plano mensal padrão ou cria um plano especial se necessário
   */
  private async getResellerClientPlanId(): Promise<string> {
    // Buscar plano mensal padrão
    const plans = await storage.getActivePlans();
    const monthlyPlan = plans.find(p => 
      (p.tipo === "padrao" || p.tipo === "mensal") && 
      p.nome?.toLowerCase().includes("mensal")
    );
    
    if (monthlyPlan) {
      return monthlyPlan.id.toString();
    }
    
    // Se não encontrar, usar o primeiro plano ativo
    if (plans.length > 0) {
      return plans[0].id.toString();
    }
    
    throw new Error("Nenhum plano disponível no sistema");
  }

  /**
   * Verifica se um usuário tem plano de revenda ativo
   */
  async hasResellerPlan(userId: string): Promise<boolean> {
    const subscription = await storage.getUserSubscription(userId);
    if (!subscription || subscription.status !== "active") {
      return false;
    }
    
    const plan = await storage.getPlan(subscription.planId);
    return plan?.tipo === "revenda";
  }

  /**
   * Configura um usuário como revendedor (cria registro na tabela resellers)
   */
  async setupReseller(userId: string, data: {
    companyName: string;
    companyDescription?: string;
    subdomain?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    clientMonthlyPrice?: string;
    clientSetupFee?: string;
    supportEmail?: string;
    supportPhone?: string;
    welcomeMessage?: string;
  }): Promise<{ success: boolean; reseller?: any; error?: string }> {
    try {
      // Verificar se já é revendedor
      const existingReseller = await storage.getResellerByUserId(userId);
      if (existingReseller) {
        // Atualizar existente
        const updated = await storage.updateReseller(existingReseller.id, {
          ...data,
          costPerClient: "49.99", // Custo fixo por cliente
        });
        return { success: true, reseller: updated };
      }

      // Verificar se subdomínio está disponível
      if (data.subdomain) {
        const isAvailable = await storage.isSubdomainAvailable(data.subdomain);
        if (!isAvailable) {
          return { success: false, error: "Subdomínio já está em uso" };
        }
      }

      // Criar novo revendedor
      const reseller = await storage.createReseller({
        userId,
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
      });

      return { success: true, reseller };
    } catch (error: any) {
      console.error("[ResellerService] Erro ao configurar revendedor:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verifica se o revendedor já usou seu cliente gratuito
   */
  async hasFreeClientSlot(resellerId: string): Promise<boolean> {
    const freeClients = await storage.countFreeResellerClients(resellerId);
    return freeClients === 0; // Só pode ter 1 cliente gratuito
  }

  /**
   * Cria um cliente GRATUITO para demonstração (1 por revendedor)
   */
  async createFreeClient(params: CreateClientParams): Promise<CreateClientResult> {
    const { resellerId, name, email, phone, password, clientPrice } = params;

    try {
      // Verificar se revendedor existe e está ativo
      const reseller = await storage.getReseller(resellerId);
      if (!reseller || !reseller.isActive) {
        return { success: false, error: "Revendedor não encontrado ou inativo" };
      }

      // Verificar se já tem cliente gratuito
      const hasFreeSlot = await this.hasFreeClientSlot(resellerId);
      if (!hasFreeSlot) {
        return { success: false, error: "Você já possui um cliente de demonstração gratuito" };
      }

      // Verificar se email já está em uso
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return { success: false, error: "Este email já está cadastrado" };
      }

      // Criar usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, phone }
      });

      if (authError || !authData.user) {
        console.error("[ResellerService] Erro ao criar usuário:", authError);
        return { success: false, error: authError?.message || "Erro ao criar usuário" };
      }

      // Criar usuário na tabela users
      const user = await storage.upsertUser({
        id: authData.user.id,
        email,
        name,
        phone,
        role: "user",
        resellerId: reseller.id,
        onboardingCompleted: false,
      });

      // Criar registro de cliente do revendedor (GRATUITO e ATIVO)
      const resellerClient = await storage.createResellerClient({
        resellerId,
        userId: user.id,
        status: "active",
        monthlyCost: "0", // Gratuito para o revendedor também
        clientPrice: clientPrice || reseller.clientMonthlyPrice || "99.99",
        isFreeClient: true,
        activatedAt: new Date(),
      });

      // Criar assinatura ativa para o cliente (usando plano padrão)
      const planId = await this.getResellerClientPlanId();
      const plan = await storage.getPlan(planId);
      
      const now = new Date();
      const dataFim = new Date(now);
      
      // Calcular data fim baseado na periodicidade do plano
      if (plan && plan.periodicidade === "anual") {
        dataFim.setFullYear(dataFim.getFullYear() + 1); // 1 ano
      } else {
        dataFim.setMonth(dataFim.getMonth() + 1); // 30 dias (1 mês)
      }
      
      await storage.createSubscription({
        userId: user.id,
        planId,
        status: "active",
        dataInicio: now,
        dataFim,
        paymentMethod: "reseller_free",
      });

      console.log(`[ResellerService] Cliente gratuito ${email} criado para revendedor ${resellerId}`);

      return {
        success: true,
        clientId: resellerClient.id,
        userId: user.id,
        requiresPayment: false,
      };
    } catch (error: any) {
      console.error("[ResellerService] Erro ao criar cliente gratuito:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cria checkout para novo cliente (PIX ou Cartão)
   * O revendedor paga R$ 49,99 por mês por cada cliente
   */
  async createClientCheckout(params: CheckoutParams): Promise<CreateClientResult> {
    const { resellerId, clientData, paymentMethod, cardData } = params;

    try {
      // Verificar se revendedor existe e está ativo
      const reseller = await storage.getReseller(resellerId);
      if (!reseller || !reseller.isActive) {
        return { success: false, error: "Revendedor não encontrado ou inativo" };
      }

      // Verificar limite de clientes
      const activeClients = await storage.countActiveResellerClients(resellerId);
      if (activeClients >= (reseller.maxClients || 100)) {
        return { success: false, error: "Limite de clientes atingido" };
      }

      // Verificar se email já está em uso
      const existingUser = await storage.getUserByEmail(clientData.email);
      if (existingUser) {
        return { success: false, error: "Este email já está cadastrado" };
      }

      const costPerClient = Number(reseller.costPerClient || 49.99);
      const externalReference = `reseller_client_${uuidv4()}`;

      // Obter email do revendedor para pagamento
      const resellerUser = await storage.getUser(reseller.userId);
      const payerEmail = resellerUser?.email || clientData.email;

      if (paymentMethod === 'pix') {
        // Verificar se PIX manual está ativado (usa chave PIX do revendedor quando disponível)
        const pixManualConfig = await storage.getSystemConfig('pix_manual_enabled');
        const pixManualEnabled = pixManualConfig?.valor === 'true';

        // Criar registro de pagamento pendente primeiro
        const payment = await storage.createResellerPayment({
          resellerId,
          amount: String(costPerClient),
          paymentType: "client_creation",
          status: "pending",
          payerEmail,
          paymentMethod: "pix",
          description: `Criação de cliente: ${clientData.name} (${clientData.email})`,
        });

        if (pixManualEnabled) {
          // 🔥 PIX MANUAL: Usar chave PIX do SISTEMA (plataforma recebe o pagamento do revendedor)
          // NÃO usar reseller.pixKey aqui — o revendedor está PAGANDO para a plataforma
          console.log("[ResellerService] Usando PIX Manual (chave PIX do sistema/plataforma)");
          
          try {
            const { pixCode, pixQrCode } = await generatePixQRCode({
              planNome: `Novo Cliente: ${clientData.name}`,
              valor: costPerClient,
              subscriptionId: payment.id,
              // pixKeyOverride: undefined → usa a chave PIX do sistema (system_config.pix_key)
            });

            // Atualizar pagamento com dados do PIX manual
            await storage.updateResellerPayment(payment.id, {
              statusDetail: JSON.stringify({
                clientData,
                externalReference,
                pixManual: true,
              }),
            });

            return {
              success: true,
              paymentId: payment.id,
              pixCode: pixCode,
              pixQrCode: pixQrCode,
              requiresPayment: true,
            };
          } catch (error: any) {
            console.error("[ResellerService] Erro ao gerar PIX manual:", error);
            await storage.updateResellerPayment(payment.id, {
              status: "cancelled",
              statusDetail: JSON.stringify({ error: error.message }),
            });
            return { success: false, error: "Erro ao gerar PIX. Tente novamente." };
          }
        } else {
          // PIX via MercadoPago (dinâmico com verificação automática)
          const creds = await mercadoPagoService.loadCredentials();
          if (!creds) {
            await storage.updateResellerPayment(payment.id, {
              status: "cancelled",
              statusDetail: JSON.stringify({ error: "MercadoPago não configurado" }),
            });
            return { success: false, error: "MercadoPago não configurado" };
          }

          // Criar pagamento PIX via API MercadoPago
          const pixPaymentData = {
            transaction_amount: costPerClient,
            payment_method_id: "pix",
            description: `AgentZap - Criação de cliente: ${clientData.name}`,
            payer: {
              email: payerEmail,
            },
            external_reference: `reseller_client_${payment.id}`,
            notification_url: `${process.env.BASE_URL || 'https://agentezap.online'}/api/webhooks/mercadopago`,
            date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          };

          const pixResponse = await fetch("https://api.mercadopago.com/v1/payments", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${creds.accessToken}`,
              "X-Idempotency-Key": `pix_reseller_${payment.id}_${Date.now()}`,
            },
            body: JSON.stringify(pixPaymentData),
          });

          const pixResult = await pixResponse.json();

          console.log("[ResellerService] PIX Payment result:", {
            status: pixResult.status,
            statusDetail: pixResult.status_detail,
            id: pixResult.id,
            hasQrCode: !!pixResult.point_of_interaction?.transaction_data?.qr_code,
          });

          if (pixResult.status === "pending" && pixResult.point_of_interaction?.transaction_data) {
            const transactionData = pixResult.point_of_interaction.transaction_data;
            
            // Atualizar pagamento com dados do MercadoPago
            await storage.updateResellerPayment(payment.id, {
              mpPaymentId: pixResult.id?.toString(),
              statusDetail: JSON.stringify({
                clientData,
                externalReference,
                mpPaymentId: pixResult.id,
              }),
            });

            return {
              success: true,
              paymentId: payment.id,
              pixCode: transactionData.qr_code, // Código Pix Copia e Cola
              pixQrCode: transactionData.qr_code_base64, // Imagem QR Code já em base64
              requiresPayment: true,
            };
          } else {
            // Erro ao criar PIX
            const errorMessage = pixResult.message || "Erro ao gerar PIX. Tente novamente.";
            console.error("[ResellerService] PIX Error:", pixResult);
            
            // Remover pagamento com erro
            await storage.updateResellerPayment(payment.id, {
              status: "cancelled",
              statusDetail: JSON.stringify({ error: errorMessage }),
            });
            
            return { success: false, error: errorMessage };
          }
        }
      } else if (paymentMethod === 'credit_card' && cardData) {
        // Processar pagamento com cartão via MercadoPago
        const creds = await mercadoPagoService.loadCredentials();
        if (!creds) {
          return { success: false, error: "MercadoPago não configurado" };
        }

        // Criar pagamento direto via API do MercadoPago
        const paymentBody = {
          transaction_amount: costPerClient,
          token: cardData.token,
          description: `AgentZap - Cliente ${clientData.name}`,
          installments: cardData.installments || 1,
          payment_method_id: 'master', // Será detectado pelo token
          payer: {
            email: cardData.payerEmail || payerEmail,
          },
          external_reference: externalReference,
        };

        const response = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${creds.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(paymentBody),
        });

        const mpPayment = await response.json();

        if (mpPayment.status === 'approved') {
          // Pagamento aprovado - criar cliente imediatamente
          return await this.createPaidClient({
            resellerId,
            ...clientData,
            paymentId: mpPayment.id,
            paymentMethod: 'credit_card',
          });
        } else if (mpPayment.status === 'in_process' || mpPayment.status === 'pending') {
          // Pagamento pendente
          const payment = await storage.createResellerPayment({
            resellerId,
            amount: String(costPerClient),
            paymentType: "client_creation",
            status: "pending",
            mpPaymentId: mpPayment.id,
            payerEmail: cardData.payerEmail || payerEmail,
            paymentMethod: "credit_card",
            description: `Criação de cliente: ${clientData.name}`,
            statusDetail: JSON.stringify({ clientData, externalReference }),
          });

          return {
            success: true,
            paymentId: payment.id,
            requiresPayment: true,
            error: "Pagamento em processamento",
          };
        } else {
          // Pagamento rejeitado
          return {
            success: false,
            error: `Pagamento rejeitado: ${mpPayment.status_detail || mpPayment.status}`,
          };
        }
      }

      return { success: false, error: "Método de pagamento inválido" };
    } catch (error: any) {
      console.error("[ResellerService] Erro no checkout:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cria cliente após pagamento confirmado
   */
  async createPaidClient(params: {
    resellerId: string;
    name: string;
    email: string;
    phone: string;
    password: string;
    clientPrice?: string;
    paymentId: string;
    paymentMethod: string;
  }): Promise<CreateClientResult> {
    const { resellerId, name, email, phone, password, clientPrice, paymentId, paymentMethod } = params;

    try {
      const reseller = await storage.getReseller(resellerId);
      if (!reseller) {
        return { success: false, error: "Revendedor não encontrado" };
      }

      // Criar usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, phone }
      });

      if (authError || !authData.user) {
        console.error("[ResellerService] Erro ao criar usuário:", authError);
        return { success: false, error: authError?.message || "Erro ao criar usuário" };
      }

      // Criar usuário na tabela users
      const user = await storage.upsertUser({
        id: authData.user.id,
        email,
        name,
        phone,
        role: "user",
        resellerId: reseller.id,
        onboardingCompleted: false,
      });

      // Criar registro de cliente do revendedor (ATIVO)
      const resellerClient = await storage.createResellerClient({
        resellerId,
        userId: user.id,
        status: "active",
        monthlyCost: reseller.costPerClient || "49.99",
        clientPrice: clientPrice || reseller.clientMonthlyPrice || "99.99",
        isFreeClient: false,
        mpPaymentId: paymentId,
        mpStatus: "approved",
        activatedAt: new Date(),
      });

      // Registrar pagamento
      await storage.createResellerPayment({
        resellerId,
        resellerClientId: resellerClient.id,
        amount: reseller.costPerClient || "49.99",
        paymentType: "client_creation",
        status: "approved",
        mpPaymentId: paymentId,
        paymentMethod,
        paidAt: new Date(),
        description: `Cliente ${name} criado`,
      });
      // Criar assinatura ativa para o cliente (usando plano padrão)
      const planId = await this.getResellerClientPlanId();
      const plan = await storage.getPlan(planId);
      
      const now = new Date();
      const dataFim = new Date(now);
      
      // Calcular data fim baseado na periodicidade do plano
      if (plan && plan.periodicidade === "anual") {
        dataFim.setFullYear(dataFim.getFullYear() + 1); // 1 ano
      } else {
        dataFim.setMonth(dataFim.getMonth() + 1); // 30 dias (1 mês)
      }
      
      await storage.createSubscription({
        userId: user.id,
        planId,
        status: "active",
        dataInicio: now,
        dataFim,
        paymentMethod: "reseller",
      });

      console.log(`[ResellerService] Cliente pago ${email} criado para revendedor ${resellerId}`);

      return {
        success: true,
        clientId: resellerClient.id,
        userId: user.id,
        requiresPayment: false,
      };
    } catch (error: any) {
      console.error("[ResellerService] Erro ao criar cliente pago:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cria fatura granular para lista de clientes selecionados
   */
  async createGranularInvoice(resellerId: string, clientIds: string[]): Promise<{
    success: boolean;
    invoiceId?: number;
    paymentUrl?: string; // Point of Interaction do PIX
    qrCode?: string;
    totalAmount?: number;
    error?: string;
  }> {
    try {
      const reseller = await storage.getReseller(resellerId);
      if (!reseller) throw new Error("Revendedor não encontrado");

      // Validar clientes e calcular total
      const unitPrice = Number(reseller.costPerClient || 49.99);
      let totalAmount = 0;
      const invoiceItems = [];

      for (const clientId of clientIds) {
        // Verificar se cliente pertence ao revendedor
        const client = await storage.getResellerClient(clientId);
        if (!client || client.resellerId !== resellerId) {
            console.warn(`Cliente ${clientId} inválido para revendedor ${resellerId}`);
            continue;
        }

        totalAmount += unitPrice;
        invoiceItems.push({
            resellerClientId: clientId,
            amount: String(unitPrice),
            description: `Renovação SaaS - Cliente ${clientId}`
        });
      }

      if (invoiceItems.length === 0) {
        return { success: false, error: "Nenhum cliente válido selecionado" };
      }

      // Criar Preferência de Pagamento no Mercado Pago (PIX)
       const creds = await mercadoPagoService.loadCredentials();
       if (!creds) throw new Error("MercadoPago não configurado na admin");

       const externalReference = `reseller_granular_${Date.now()}_${resellerId}`;
       
       // Criação do pagamento PIX Imediato
       const pixPaymentData = {
          transaction_amount: totalAmount,
          description: `Renovação de ${invoiceItems.length} clientes - Revenda`,
          payment_method_id: "pix",
          payer: {
            email: (await storage.getUser(reseller.userId))?.email || "reseller@agentezap.online",
             first_name: reseller.companyName
          },
          external_reference: externalReference,
           notification_url: `${process.env.BASE_URL || 'https://agentezap.online'}/api/webhooks/mercadopago`
       };

        const pixResponse = await fetch("https://api.mercadopago.com/v1/payments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${creds.accessToken}`,
             "X-Idempotency-Key": externalReference
          },
          body: JSON.stringify(pixPaymentData),
        });

        const pixResult = await pixResponse.json();
        
        if (pixResult.status === "rejected") {
            return { success: false, error: "Pagamento rejeitado pelo Mercado Pago" };
        }

        // Criar Invoice no Banco
        const invoice = await storage.createResellerInvoiceWithItems(
            {
                resellerId,
                referenceMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
                dueDate: new Date().toISOString(), // Hoje
                activeClients: invoiceItems.length,
                unitPrice: String(unitPrice),
                totalAmount: String(totalAmount),
                status: "pending",
                paymentMethod: "pix",
                mpPaymentId: String(pixResult.id)
            },
            invoiceItems as any
        );

        return {
            success: true,
            invoiceId: invoice.id,
            paymentUrl: pixResult.point_of_interaction?.transaction_data?.ticket_url,
            qrCode: pixResult.point_of_interaction?.transaction_data?.qr_code,
            totalAmount
        };

    } catch (error: any) {
        console.error("Erro ao criar fatura granular:", error);
        return { success: false, error: error.message };
    }
  }

  /**
   * Processa Webhook de pagamento granular (Pix Aprovado)
   */
  async processGranularPaymentWebhook(payment: any): Promise<void> {
    if (payment.status !== "approved") {
        console.log(`[ResellerService] Pagamento granular ${payment.id} não aprovado (${payment.status})`);
        return;
    }

    const invoice = await storage.getResellerInvoiceByMpPaymentId(String(payment.id));
    if (!invoice) {
        console.error(`[ResellerService] Fatura granular não encontrada para pagamento ${payment.id}`);
        return;
    }

    if (invoice.status === "paid") {
        console.log(`[ResellerService] Fatura ${invoice.id} já está paga.`);
        return;
    }

    // Atualizar fatura para PAGO
    await storage.updateResellerInvoice(invoice.id, {
        status: "paid",
        paidAt: new Date(),
        paymentMethod: payment.payment_method_id
    });

    // Processar itens (Clientes)
    const items = await storage.getResellerInvoiceItems(invoice.id);
    
    for (const item of items) {
        if (!item.resellerClientId) continue;

        const client = await storage.getResellerClient(item.resellerClientId);
        if (!client) continue;

        // Calcular nova data de vencimento
        let currentSaaSDate = client.saasPaidUntil ? new Date(client.saasPaidUntil) : new Date();
        if (currentSaaSDate < new Date()) {
            currentSaaSDate = new Date(); // Se já venceu, começa de hoje
        }
        
        // Adicionar 30 dias
        const newExpirtyDate = new Date(currentSaaSDate);
        newExpirtyDate.setDate(newExpirtyDate.getDate() + 30);

        // Atualizar cliente
        await storage.updateResellerClient(client.id, {
            saasPaidUntil: newExpirtyDate,
            saasStatus: "active"
        });
        
        console.log(`[ResellerService] SaaS renovado para cliente ${client.id} até ${newExpirtyDate.toISOString()}`);
    }
  }

  /**
   * Confirma pagamento PIX e cria o cliente
   */
  async confirmPixPayment(paymentId: string): Promise<CreateClientResult> {
    try {
      const payment = await storage.getResellerPayment(paymentId);
      if (!payment) {
        return { success: false, error: "Pagamento não encontrado" };
      }

      if (payment.status !== "pending") {
        return { success: false, error: "Pagamento já foi processado" };
      }

      // Extrair dados do cliente do statusDetail
      const paymentData = parseResellerPaymentStatusDetail(payment.statusDetail) || {};
      const clientData = paymentData.clientData;

      if (!clientData) {
        return { success: false, error: "Dados do cliente não encontrados" };
      }

      // Atualizar pagamento como aprovado
      await storage.updateResellerPayment(paymentId, {
        status: "approved",
        paidAt: new Date(),
      });

      // Criar o cliente
      return await this.createPaidClient({
        resellerId: payment.resellerId,
        ...clientData,
        paymentId,
        paymentMethod: "pix",
      });
    } catch (error: any) {
      console.error("[ResellerService] Erro ao confirmar PIX:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cria um cliente para o revendedor
   * - Cria o usuário no sistema
   * - Vincula ao revendedor
   * - Gera link de pagamento (R$ 49,99)
   */
  async createClient(params: CreateClientParams): Promise<CreateClientResult> {
    const { resellerId, name, email, phone, password } = params;

    try {
      // Verificar se revendedor existe e está ativo
      const reseller = await storage.getReseller(resellerId);
      if (!reseller || !reseller.isActive) {
        return { success: false, error: "Revendedor não encontrado ou inativo" };
      }

      // Verificar se atingiu limite de clientes
      const activeClients = await storage.countActiveResellerClients(resellerId);
      if (activeClients >= (reseller.maxClients || 100)) {
        return { success: false, error: "Limite de clientes atingido" };
      }

      // Verificar se email já está em uso
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return { success: false, error: "Este email já está cadastrado" };
      }

      // Criar usuário no Supabase Auth primeiro
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          phone,
        }
      });

      if (authError || !authData.user) {
        console.error("[ResellerService] Erro ao criar usuário no Supabase Auth:", authError);
        return { success: false, error: authError?.message || "Erro ao criar usuário" };
      }

      // Criar usuário na tabela users usando o mesmo ID do auth
      const user = await storage.upsertUser({
        id: authData.user.id,
        email,
        name,
        phone,
        role: "user",
        resellerId: reseller.id,
        onboardingCompleted: false,
      });

      // Criar registro de cliente do revendedor (status pendente até pagamento)
      const resellerClient = await storage.createResellerClient({
        resellerId,
        userId: user.id,
        status: "pending",
        monthlyCost: reseller.costPerClient || "49.99",
      });

      // Criar link de pagamento no MercadoPago
      const costPerClient = Number(reseller.costPerClient || 49.99);
      const externalReference = `reseller_client_${resellerClient.id}`;

      // Obter usuário do revendedor para email
      const resellerUser = await storage.getUser(reseller.userId);
      const payerEmail = resellerUser?.email || email;

      try {
        const mpSubscription = await mercadoPagoService.createSubscription({
          reason: `AgentZap - Cliente ${name}`,
          externalReference,
          payerEmail,
          autoRecurring: {
            frequency: 1,
            frequencyType: "months",
            transactionAmount: costPerClient,
            currencyId: "BRL",
          },
          backUrl: `${process.env.BASE_URL || 'https://agentezap.com'}/reseller/clients?payment=success`,
        });

        // Atualizar cliente com dados do MercadoPago
        await storage.updateResellerClient(resellerClient.id, {
          mpSubscriptionId: mpSubscription.id,
          mpStatus: mpSubscription.status,
        });

        // Criar registro de pagamento pendente
        await storage.createResellerPayment({
          resellerId,
          resellerClientId: resellerClient.id,
          amount: String(costPerClient),
          paymentType: "client_creation",
          status: "pending",
          payerEmail,
          description: `Criação de conta para ${name}`,
        });

        return {
          success: true,
          clientId: resellerClient.id,
          userId: user.id,
          paymentUrl: mpSubscription.init_point,
        };
      } catch (mpError: any) {
        console.error("[ResellerService] Erro MercadoPago:", mpError);
        
        // Reverter criação do cliente
        await storage.cancelResellerClient(resellerClient.id);
        
        return {
          success: false,
          error: `Erro ao criar pagamento: ${mpError.message}`,
        };
      }
    } catch (error: any) {
      console.error("[ResellerService] Erro ao criar cliente:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Processa webhook de pagamento do MercadoPago para cliente de revendedor
   */
  async processPaymentWebhook(externalReference: string, status: string, paymentId?: string): Promise<void> {
    if (!externalReference.startsWith("reseller_client_")) {
      return;
    }

    const clientId = externalReference.replace("reseller_client_", "");
    const client = await storage.getResellerClient(clientId);
    
    if (!client) {
      console.error("[ResellerService] Cliente não encontrado:", clientId);
      return;
    }

    if (status === "authorized" || status === "approved") {
      // Ativar cliente
      await storage.updateResellerClient(clientId, {
        status: "active",
        activatedAt: new Date(),
        mpStatus: status,
      });

      // Atualizar pagamento
      const payments = await storage.getResellerPayments(client.resellerId, 10);
      const pendingPayment = payments.find(p => p.resellerClientId === clientId && p.status === "pending");
      
      if (pendingPayment) {
        await storage.updateResellerPayment(pendingPayment.id, {
          status: "approved",
          mpPaymentId: paymentId,
          paidAt: new Date(),
        });
      }

      console.log(`[ResellerService] Cliente ${clientId} ativado com sucesso`);
    } else if (status === "cancelled" || status === "rejected") {
      // Cancelar cliente
      await storage.updateResellerClient(clientId, {
        status: "cancelled",
        cancelledAt: new Date(),
        mpStatus: status,
      });

      // Atualizar pagamento
      const payments = await storage.getResellerPayments(client.resellerId, 10);
      const pendingPayment = payments.find(p => p.resellerClientId === clientId && p.status === "pending");
      
      if (pendingPayment) {
        await storage.updateResellerPayment(pendingPayment.id, {
          status: "rejected",
          statusDetail: status,
        });
      }

      console.log(`[ResellerService] Cliente ${clientId} cancelado - pagamento: ${status}`);
    }
  }

  /**
   * Obtém estatísticas do dashboard do revendedor
   */
  async getDashboardStats(resellerId: string): Promise<ResellerDashboardStats> {
    return storage.getResellerDashboardMetrics(resellerId);
  }

  /**
   * Detecta revendedor pelo host/domínio
   */
  async detectResellerByHost(host: string): Promise<{
    reseller: any;
    isWhiteLabel: boolean;
  } | null> {
    // Remove porta se existir
    const hostname = host.split(":")[0];

    // Verifica subdomínio (ex: empresa.agentezap.com)
    if (hostname.includes(".agentezap.com") || hostname.includes(".agentezap.com.br")) {
      const subdomain = hostname.split(".")[0];
      if (subdomain && subdomain !== "www" && subdomain !== "app" && subdomain !== "api") {
        const reseller = await storage.getResellerBySubdomain(subdomain);
        if (reseller && reseller.isActive) {
          return { reseller, isWhiteLabel: true };
        }
      }
    }

    // Verifica domínio customizado
    const reseller = await storage.getResellerByDomain(hostname);
    if (reseller && reseller.isActive && reseller.domainVerified) {
      return { reseller, isWhiteLabel: true };
    }

    return null;
  }

  /**
   * Atualiza logo do revendedor
   */
  async updateLogo(resellerId: string, logoUrl: string): Promise<boolean> {
    try {
      await storage.updateReseller(resellerId, { logoUrl });
      return true;
    } catch (error) {
      console.error("[ResellerService] Erro ao atualizar logo:", error);
      return false;
    }
  }

  /**
   * Configura domínio customizado
   */
  async setupCustomDomain(resellerId: string, domain: string): Promise<{ success: boolean; error?: string }> {
    // Verificar disponibilidade
    const isAvailable = await storage.isDomainAvailable(domain);
    if (!isAvailable) {
      return { success: false, error: "Domínio já está em uso" };
    }

    // Atualizar revendedor (domínio não verificado ainda)
    await storage.updateReseller(resellerId, {
      customDomain: domain,
      domainVerified: false,
    });

    return { success: true };
  }

  /**
   * Verifica domínio customizado (deve ser chamado após configurar DNS)
   */
  async verifyCustomDomain(resellerId: string): Promise<{ success: boolean; error?: string }> {
    const reseller = await storage.getReseller(resellerId);
    if (!reseller?.customDomain) {
      return { success: false, error: "Domínio não configurado" };
    }

    // TODO: Implementar verificação real de DNS
    // Por agora, apenas marca como verificado
    await storage.updateReseller(resellerId, { domainVerified: true });

    return { success: true };
  }
}

export const resellerService = new ResellerService();
export default resellerService;
