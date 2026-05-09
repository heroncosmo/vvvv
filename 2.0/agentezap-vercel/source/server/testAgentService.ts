/**
 * Test Agent Service
 *
 * Centraliza a lgica do simulador (/api/test-agent/*) para garantir que,
 * quando houver token vlido, o atendimento use o agente do CLIENTE (aiAgentConfig)
 * e no o agente de vendas (Rodrigo).
 * 
 *  SIMULADOR UNIFICADO: Agora usa EXATAMENTE o mesmo fluxo do WhatsApp
 * atravs da funo testAgentResponse que internamente chama generateAIResponse.
 */

import { testAgentResponse } from "./aiAgent";
import {
  getAgentMediaLibrary,
} from "./mediaService";
import { repairMojibakeText } from "@shared/mojibake";
import { expandSimulatorMediaAction } from "./simulatorMediaActions";
import { getSimulatorChannelGuardResult } from "./simulatorChannelGuard";

export type ChatRole = "system" | "user" | "assistant";

export type TestAgentHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type TestAgentMessageParams = {
  message: string;
  token?: string;
  history?: TestAgentHistoryItem[];
  userId?: string;
  sentMedias?: string[]; //  Mdias j enviadas nesta sesso
  sessionId?: string;
};

export type TestTokenInfo = {
  userId: string;
  agentName?: string;
  company?: string;
};

export type AgentConfig = {
  prompt?: string | null;
  model?: string | null;
};

export type MistralClient = {
  chat: {
    complete: (args: {
      model: string;
      messages: Array<{ role: ChatRole; content: string }>;
      maxTokens?: number;
      temperature?: number;
    }) => Promise<{ choices?: Array<{ message?: { content?: unknown } }> }>;
  };
};

export type TestAgentDeps = {
  getTestToken: (token: string) => Promise<TestTokenInfo | undefined>;
  getAgentConfig: (userId: string) => Promise<AgentConfig | undefined>;
  getMistralClient: () => Promise<MistralClient>;
  processAdminMessage: (
    sessionId: string,
    message: string,
    mediaType?: string,
    mediaUrl?: string,
    skipTriggerCheck?: boolean
  ) => Promise<{ text: string; mediaActions?: unknown } | null>;
  getAgentMediaLibrary: (userId: string) => Promise<any[]>;
  generateMediaPromptBlock: (media: any[]) => string;
  parseMistralResponse: (text: string) => { messages: any[], actions: any[] } | null;
};

export type TestAgentResult = {
  response: string;
  mediaActions?: unknown;
  deliveryOrderCreated?: any;
  mode: "client_agent" | "sales_demo";
  resolvedUserId?: string;
};

function normalizeAiContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

function looksLikeTransientFailure(text: string): boolean {
  const normalized = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return true;
  return (
    normalized.includes("nao consegui processar") ||
    normalized.includes("ocorreu um erro ao processar") ||
    normalized.includes("houve um erro tecnico")
  );
}

function repairCommonMojibake(text: string): string {
  return repairMojibakeText(text);
}

export async function handleTestAgentMessage(
  params: TestAgentMessageParams,
  deps: TestAgentDeps
): Promise<TestAgentResult> {
  const { message, token, history, userId, sentMedias, sessionId } = params;

  if (!message || !message.trim()) {
    throw new Error("Mensagem obrigatoria");
  }

  // Resolver userId do lado do servidor para evitar race do frontend.
  let resolvedUserId: string | undefined = userId;

  if (!resolvedUserId && token && token !== "demo") {
    const tokenInfo = await deps.getTestToken(token);
    if (tokenInfo?.userId) {
      resolvedUserId = tokenInfo.userId;
    }
  }

  if (!resolvedUserId && token && token !== "demo") {
    return {
      response:
        "Esse link de teste e invalido ou expirou. Peca um novo link para o administrador e tente novamente.",
      mode: "client_agent",
    };
  }

  if (resolvedUserId) {
    const channelGuard = await getSimulatorChannelGuardResult(resolvedUserId);
    if (!channelGuard.channelReady) {
      return {
        response: channelGuard.blockReason || "O canal real do WhatsApp não está pronto para responder.",
        mode: "client_agent",
        resolvedUserId,
      };
    }

    const agentConfig = await deps.getAgentConfig(resolvedUserId);

    // Se o token aponta para um usuario, NUNCA cair no Rodrigo.
    // Se nao houver prompt configurado, devolver erro amigavel.
    if (!agentConfig?.prompt) {
      return {
        response:
          "Seu agente ainda nao esta configurado para teste. Peca ao administrador para finalizar a configuracao do agente antes de usar este link.",
        mode: "client_agent",
        resolvedUserId,
      };
    }

    console.log('\n ');
    console.log(' [TestAgentService] SIMULADOR UNIFICADO - Usando mesmo fluxo do WhatsApp');
    console.log(' ');

    //  CONVERTER HISTRICO DO FRONTEND PARA FORMATO Message[]
    const conversationHistory = history?.map((msg, idx) => ({
      id: `sim-${idx}`,
      chatId: "simulator",
      text: msg.content,
      fromMe: msg.role === "assistant",
      timestamp: new Date(Date.now() - (history!.length - idx) * 60000),
      isFromAgent: msg.role === "assistant",
    })) || [];

    console.log(` [TestAgentService] Histrico: ${conversationHistory.length} msgs, Mdias enviadas: ${sentMedias?.length || 0}`);

    // USAR FUNCAO UNIFICADA - MESMO CODIGO DO WHATSAPP!
    try {
      let result = await testAgentResponse(
        resolvedUserId,
        message,
        undefined, // Nao passar customPrompt aqui - usar o do banco
        conversationHistory,
        sentMedias || [],
        "Visitante",
        sessionId || token || resolvedUserId
      );

      //  RESOLVER URLs DAS MDIAS PARA O FRONTEND
      let mediaActions: any[] = [];
      if (result.mediaActions && result.mediaActions.length > 0) {
        const mediaLibrary = await getAgentMediaLibrary(resolvedUserId);
        
        for (const rawAction of result.mediaActions) {
          const action: any = rawAction;
          const expandedActions = expandSimulatorMediaAction(action, mediaLibrary);
          if (expandedActions.length > 0 && action?.media_name) {
            console.log(` [TestAgentService] Mdia encontrada: ${action.media_name}`);
          }
          mediaActions.push(...expandedActions);
        }
      }

      console.log(' \n');

      let responseText = typeof result.text === "string" ? result.text : "";
      const shouldRetry = mediaActions.length === 0 && looksLikeTransientFailure(responseText);
      if (shouldRetry) {
        console.warn(" [TestAgentService] Resposta fraca/transiente detectada, tentando 1 retry");
        result = await testAgentResponse(
          resolvedUserId,
          message,
          undefined,
          conversationHistory,
          sentMedias || [],
          "Visitante",
          sessionId || token || resolvedUserId
        );
        responseText = typeof result.text === "string" ? result.text : "";
      }
      const shouldFallback = mediaActions.length === 0 && looksLikeTransientFailure(responseText);
      const safeResponse = repairCommonMojibake(responseText);

      return {
        response: shouldFallback ? "Desculpe, nao consegui processar." : safeResponse,
        mediaActions,
        deliveryOrderCreated: (result as any).deliveryOrderCreated,
        mode: "client_agent",
        resolvedUserId,
      };
    } catch (error) {
      console.error(' [TestAgentService] Erro:', error);
      return {
        response: "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.",
        mode: "client_agent",
        resolvedUserId,
      };
    }
  }

  // Fallback demo: Rodrigo (somente quando NO h token/userId de cliente).
  const fallbackSessionId = token || `test_${Date.now()}`;
  const response = await deps.processAdminMessage(fallbackSessionId, message, undefined, undefined, true);

  if (!response) {
    return {
      response: "Desculpa, nao consegui processar sua mensagem. Tenta novamente?",
      mode: "sales_demo",
    };
  }

  return {
    response: repairCommonMojibake(response.text),
    mediaActions: response.mediaActions,
    mode: "sales_demo",
  };
}
