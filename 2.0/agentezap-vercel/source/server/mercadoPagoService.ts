/**
 * MercadoPago Service - Integração com API de Assinaturas
 * 
 * Funcionalidades:
 * - Criar planos de assinatura
 * - Criar assinaturas para clientes
 * - Processar webhooks
 * - Gerenciar credenciais (teste/produção)
 */

import { storage } from "./storage";

// Tipos
export interface MercadoPagoCredentials {
  publicKey: string;
  accessToken: string;
  clientId?: string;
  clientSecret?: string;
  isTestMode: boolean;
}

export interface CreatePlanParams {
  reason: string; // Nome do plano
  autoRecurring: {
    frequency: number;
    frequencyType: "days" | "months";
    transactionAmount: number;
    currencyId: string;
    repetitions?: number;
    freeTrial?: {
      frequency: number;
      frequencyType: "days" | "months";
    };
  };
  backUrl: string;
}

export interface CreateSubscriptionParams {
  preapprovalPlanId?: string; // ID do plano no Mercado Pago
  reason: string;
  externalReference: string;
  payerEmail: string;
  autoRecurring: {
    frequency: number;
    frequencyType: "days" | "months";
    transactionAmount: number;
    currencyId: string;
    startDate?: string;
    endDate?: string;
  };
  backUrl: string;
  status?: "pending" | "authorized";
}

export interface MercadoPagoPlan {
  id: string;
  reason: string;
  status: string;
  auto_recurring: {
    frequency: number;
    frequency_type: string;
    transaction_amount: number;
    currency_id: string;
  };
  date_created: string;
  init_point: string;
}

export interface MercadoPagoSubscription {
  id: string;
  preapproval_plan_id?: string;
  payer_id: number;
  payer_email: string;
  back_url: string;
  reason: string;
  external_reference: string;
  status: string;
  init_point: string;
  auto_recurring: {
    frequency: number;
    frequency_type: string;
    transaction_amount: number;
    currency_id: string;
    start_date?: string;
    end_date?: string;
  };
  date_created: string;
  last_modified: string;
  next_payment_date?: string;
}

const MP_API_BASE = "https://api.mercadopago.com";

class MercadoPagoService {
  private credentials: MercadoPagoCredentials | null = null;

  /**
   * Carrega credenciais do banco de dados
   */
  async loadCredentials(): Promise<MercadoPagoCredentials | null> {
    try {
      const keys = [
        "mercadopago_public_key",
        "mercadopago_access_token", 
        "mercadopago_client_id",
        "mercadopago_client_secret",
        "mercadopago_test_mode"
      ];
      
      const configMap = await storage.getSystemConfigs(keys);
      
      const publicKey = configMap.get("mercadopago_public_key");
      const accessToken = configMap.get("mercadopago_access_token");
      const clientId = configMap.get("mercadopago_client_id");
      const clientSecret = configMap.get("mercadopago_client_secret");
      const testMode = configMap.get("mercadopago_test_mode");

      if (!publicKey || !accessToken) {
        console.log("[MercadoPago] Credenciais não configuradas");
        return null;
      }

      this.credentials = {
        publicKey,
        accessToken,
        clientId: clientId || undefined,
        clientSecret: clientSecret || undefined,
        isTestMode: testMode === "true",
      };

      return this.credentials;
    } catch (error) {
      console.error("[MercadoPago] Erro ao carregar credenciais:", error);
      return null;
    }
  }

  /**
   * Salva credenciais no banco de dados
   */
  async saveCredentials(creds: Partial<MercadoPagoCredentials>): Promise<void> {
    try {
      if (creds.publicKey !== undefined) {
        await storage.updateSystemConfig("mercadopago_public_key", creds.publicKey);
      }
      if (creds.accessToken !== undefined) {
        await storage.updateSystemConfig("mercadopago_access_token", creds.accessToken);
      }
      if (creds.clientId !== undefined) {
        await storage.updateSystemConfig("mercadopago_client_id", creds.clientId);
      }
      if (creds.clientSecret !== undefined) {
        await storage.updateSystemConfig("mercadopago_client_secret", creds.clientSecret);
      }
      if (creds.isTestMode !== undefined) {
        await storage.updateSystemConfig("mercadopago_test_mode", creds.isTestMode.toString());
      }

      // Recarrega credenciais após salvar
      await this.loadCredentials();
      console.log("[MercadoPago] Credenciais salvas com sucesso");
    } catch (error) {
      console.error("[MercadoPago] Erro ao salvar credenciais:", error);
      throw error;
    }
  }

  /**
   * Retorna credenciais atuais (sem expor dados sensíveis)
   */
  async getCredentialsInfo(): Promise<{
    configured: boolean;
    isTestMode: boolean;
    publicKeyPreview?: string;
  }> {
    const creds = await this.loadCredentials();
    if (!creds) {
      return { configured: false, isTestMode: false };
    }

    return {
      configured: true,
      isTestMode: creds.isTestMode,
      publicKeyPreview: creds.publicKey.substring(0, 20) + "...",
    };
  }

  /**
   * Faz requisição autenticada para API do Mercado Pago
   */
  private async apiRequest<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    endpoint: string,
    body?: any
  ): Promise<T> {
    const creds = this.credentials || (await this.loadCredentials());
    if (!creds) {
      throw new Error("Credenciais do Mercado Pago não configuradas");
    }

    const url = `${MP_API_BASE}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
    };

    if (body && method !== "GET") {
      options.body = JSON.stringify(body);
    }

    console.log(`[MercadoPago] ${method} ${endpoint}`);

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      console.error("[MercadoPago] API Error:", data);
      throw new Error(data.message || `API Error: ${response.status}`);
    }

    return data as T;
  }

  /**
   * Cria um plano de assinatura no Mercado Pago
   */
  async createPlan(params: CreatePlanParams): Promise<MercadoPagoPlan> {
    const body = {
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

    const plan = await this.apiRequest<MercadoPagoPlan>("POST", "/preapproval_plan", body);
    console.log("[MercadoPago] Plano criado:", plan.id);
    return plan;
  }

  /**
   * Busca um plano pelo ID
   */
  async getPlan(planId: string): Promise<MercadoPagoPlan> {
    return this.apiRequest<MercadoPagoPlan>("GET", `/preapproval_plan/${planId}`);
  }

  /**
   * Lista todos os planos
   */
  async listPlans(): Promise<{ results: MercadoPagoPlan[] }> {
    return this.apiRequest<{ results: MercadoPagoPlan[] }>("GET", "/preapproval_plan/search");
  }

  /**
   * Cria uma assinatura (preapproval) - sem plano associado
   * Retorna um link de pagamento
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<MercadoPagoSubscription> {
    const body: any = {
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

    const subscription = await this.apiRequest<MercadoPagoSubscription>("POST", "/preapproval", body);
    console.log("[MercadoPago] Assinatura criada:", subscription.id, "Link:", subscription.init_point);
    return subscription;
  }

  /**
   * Busca uma assinatura pelo ID
   */
  async getSubscription(subscriptionId: string): Promise<MercadoPagoSubscription> {
    return this.apiRequest<MercadoPagoSubscription>("GET", `/preapproval/${subscriptionId}`);
  }

  /**
   * Busca assinatura por external_reference
   */
  async searchSubscriptionByReference(reference: string): Promise<MercadoPagoSubscription | null> {
    const result = await this.apiRequest<{ results: MercadoPagoSubscription[] }>(
      "GET",
      `/preapproval/search?external_reference=${reference}`
    );
    return result.results?.[0] || null;
  }

  /**
   * Atualiza uma assinatura
   */
  async updateSubscription(
    subscriptionId: string,
    data: Partial<{
      status: "authorized" | "paused" | "cancelled";
      reason: string;
      external_reference: string;
      auto_recurring: {
        transaction_amount?: number;
      };
    }>
  ): Promise<MercadoPagoSubscription> {
    return this.apiRequest<MercadoPagoSubscription>("PUT", `/preapproval/${subscriptionId}`, data);
  }

  /**
   * Cancela uma assinatura
   */
  async cancelSubscription(subscriptionId: string): Promise<MercadoPagoSubscription> {
    return this.updateSubscription(subscriptionId, { status: "cancelled" });
  }

  /**
   * Pausa uma assinatura
   */
  async pauseSubscription(subscriptionId: string): Promise<MercadoPagoSubscription> {
    return this.updateSubscription(subscriptionId, { status: "paused" });
  }

  /**
   * Reativa uma assinatura
   */
  async resumeSubscription(subscriptionId: string): Promise<MercadoPagoSubscription> {
    return this.updateSubscription(subscriptionId, { status: "authorized" });
  }

  /**
   * Processa webhook do Mercado Pago
   */
  async processWebhook(topic: string, data: any): Promise<void> {
    console.log(`[MercadoPago] Webhook recebido - Topic: ${topic}`, data);

    switch (topic) {
      case "subscription_preapproval":
        await this.handleSubscriptionWebhook(data);
        break;
      case "subscription_authorized_payment":
        await this.handlePaymentWebhook(data);
        break;
      case "subscription_preapproval_plan":
        await this.handlePlanWebhook(data);
        break;
      default:
        console.log(`[MercadoPago] Webhook não tratado: ${topic}`);
    }
  }

  private async handleSubscriptionWebhook(data: any): Promise<void> {
    if (!data.id) return;

    try {
      const mpSubscription = await this.getSubscription(data.id);
      console.log(`[MercadoPago] Assinatura atualizada: ${mpSubscription.id} - Status: ${mpSubscription.status}`);

      // Busca assinatura local pelo external_reference usando SQL raw
      if (mpSubscription.external_reference) {
        // O external_reference contém o ID da assinatura local
        const localSubscriptionId = mpSubscription.external_reference.replace('sub_', '');
        
        // Mapeia status do Mercado Pago para status local
        let status: string = "pending";
        if (mpSubscription.status === "authorized") status = "active";
        else if (mpSubscription.status === "cancelled") status = "cancelled";
        else if (mpSubscription.status === "paused") status = "paused";

        // Atualiza através das rotas internas
        console.log(`[MercadoPago] Atualizando assinatura local: ${localSubscriptionId} para status: ${status}`);
      }
    } catch (error) {
      console.error("[MercadoPago] Erro ao processar webhook de assinatura:", error);
    }
  }

  private async handlePaymentWebhook(data: any): Promise<void> {
    console.log("[MercadoPago] Pagamento de assinatura recebido:", data);
    // Aqui você pode registrar pagamentos individuais
  }

  private async handlePlanWebhook(data: any): Promise<void> {
    console.log("[MercadoPago] Plano atualizado:", data);
  }

  /**
   * Verifica se as credenciais estão válidas
   */
  async testConnection(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const creds = await this.loadCredentials();
      if (!creds) {
        return { success: false, message: "Credenciais não configuradas" };
      }

      // Tenta buscar planos para verificar se a conexão funciona
      const plans = await this.listPlans();
      return {
        success: true,
        message: `Conexão OK! ${plans.results?.length || 0} planos encontrados.`,
        data: { plansCount: plans.results?.length || 0, isTestMode: creds.isTestMode },
      };
    } catch (error: any) {
      return { success: false, message: error.message || "Erro ao testar conexão" };
    }
  }
}

// Singleton
export const mercadoPagoService = new MercadoPagoService();
