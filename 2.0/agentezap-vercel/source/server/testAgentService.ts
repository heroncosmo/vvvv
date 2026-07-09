/**
 * Test Agent Service
 *
 * Centraliza a lgica do simulador (/api/test-agent/*) para garantir que,
 * quando houver token vlido, o atendimento use o agente do CLIENTE (aiAgentConfig)
 * e no o agente de vendas (Rodrigo).
 * 
 *  SIMULADOR UNIFICADO: usa o runtime Codex web-only, o mesmo contrato do teste
 * publico, simulador autenticado e WhatsApp.
 */

import {
  getAgentMediaLibrary,
} from "./mediaService";
import { runWebOnlyAgentTestForUser } from "../api/http";
import { repairMojibakeText } from "@shared/mojibake";
import { expandSimulatorMediaAction } from "./simulatorMediaActions";
import { getSimulatorChannelGuardResult } from "./simulatorChannelGuard";
import { pool } from "./db";
import { enforceTrustedPaymentCredentialReply } from "./paymentCredentialGuard";

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
  contactPhone?: string;
  contactNumber?: string;
  phone?: string;
  contactName?: string;
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

export type TestAgentDeps = {
  getTestToken: (token: string) => Promise<TestTokenInfo | undefined>;
  getAgentConfig: (userId: string) => Promise<AgentConfig | undefined>;
  processAdminMessage: (
    sessionId: string,
    message: string,
    mediaType?: string,
    mediaUrl?: string,
    skipTriggerCheck?: boolean
  ) => Promise<{ text: string; mediaActions?: unknown } | null>;
  getAgentMediaLibrary: (userId: string) => Promise<any[]>;
  generateMediaPromptBlock: (media: any[]) => string;
};

export type TestAgentResult = {
  response: string;
  mediaActions?: unknown;
  deliveryOrderCreated?: any;
  mode: "client_agent" | "sales_demo";
  resolvedUserId?: string;
  emptyResponse?: boolean;
  error?: string;
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

const AGENTEZAP_SUPPORT_TEST_AGENT_EMAILS = new Set(
  String(process.env.AGENTEZAP_SUPPORT_CONTEXT_EMAILS || "rodrigo4@gmail.com,agentezapsuporte@agentezap.online")
    .split(/[,\s;]+/g)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

function normalizeSupportTestAgentText(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSupportTestAgentPhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function isSupportTestAgentCustomerMediaTurn(params: TestAgentMessageParams): boolean {
  const text = normalizeSupportTestAgentText([
    params.message,
    ...(params.history || []).slice(-6).map((entry) => entry?.content || ""),
  ].join("\n"));
  if (!text) return false;

  const hasMediaSubject =
    text.includes("midia") ||
    text.includes("imagem") ||
    text.includes("foto") ||
    text.includes("cardapio") ||
    text.includes("catalogo") ||
    text.includes("arquivo") ||
    text.includes("pdf") ||
    text.includes("video") ||
    text.includes("audio");
  const hasCustomerAgentAction =
    text.includes("agente") ||
    text.includes("cliente") ||
    text.includes("whatsapp") ||
    text.includes("simulador") ||
    text.includes("biblioteca") ||
    text.includes("enviar") ||
    text.includes("mandar") ||
    text.includes("configurar") ||
    text.includes("cadastrar") ||
    text.includes("salvar");

  return hasMediaSubject && hasCustomerAgentAction;
}

function extractSupportTestAgentEmails(params: TestAgentMessageParams): string[] {
  const text = [
    params.message,
    ...(params.history || []).slice(-8).map((entry) => entry?.content || ""),
  ].join("\n");
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((email) => email.trim().toLowerCase()).filter(Boolean))).slice(0, 6);
}

async function isSupportTestAgentOwner(userId: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT lower(COALESCE(email, '')) AS email FROM users WHERE id = $1 LIMIT 1",
    [userId],
  );
  return AGENTEZAP_SUPPORT_TEST_AGENT_EMAILS.has(String(result.rows[0]?.email || "").trim().toLowerCase());
}

async function hasSupportTestAgentCustomerSignal(params: TestAgentMessageParams): Promise<boolean> {
  const contactDigits = normalizeSupportTestAgentPhone(params.contactPhone || params.contactNumber || params.phone);
  const emails = extractSupportTestAgentEmails(params);
  if (!contactDigits && emails.length === 0) return false;

  const result = await pool.query(
    `
      SELECT 1
      FROM users u
      WHERE
        lower(COALESCE(u.email, '')) = ANY($2::text[])
        OR (
          $1 <> ''
          AND (
            regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g') = $1
            OR regexp_replace(COALESCE(u.telefone, ''), '\\D', '', 'g') = $1
            OR regexp_replace(COALESCE(u.whatsapp_number, ''), '\\D', '', 'g') = $1
            OR (
              length($1) >= 10
              AND (
                right(regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g'), 10) = right($1, 10)
                OR right(regexp_replace(COALESCE(u.telefone, ''), '\\D', '', 'g'), 10) = right($1, 10)
                OR right(regexp_replace(COALESCE(u.whatsapp_number, ''), '\\D', '', 'g'), 10) = right($1, 10)
              )
            )
          )
        )
      LIMIT 1
    `,
    [contactDigits, emails],
  );
  return result.rows.length > 0;
}

async function buildSupportTestAgentCustomerContextBlock(params: TestAgentMessageParams): Promise<string> {
  const contactDigits = normalizeSupportTestAgentPhone(params.contactPhone || params.contactNumber || params.phone);
  const emails = extractSupportTestAgentEmails(params);
  if (!contactDigits && emails.length === 0) return "";

  const result = await pool.query(
    `
      WITH candidate_users AS (
        SELECT
          u.id,
          u.email,
          u.name,
          u.phone,
          u.telefone,
          u.whatsapp_number,
          u.created_at,
          u.updated_at,
          CASE
            WHEN lower(COALESCE(u.email, '')) = ANY($2::text[]) THEN 0
            WHEN $1 <> '' AND regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g') = $1 THEN 1
            WHEN $1 <> '' AND regexp_replace(COALESCE(u.telefone, ''), '\\D', '', 'g') = $1 THEN 1
            WHEN $1 <> '' AND regexp_replace(COALESCE(u.whatsapp_number, ''), '\\D', '', 'g') = $1 THEN 1
            WHEN length($1) >= 10 AND right(regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g'), 10) = right($1, 10) THEN 2
            WHEN length($1) >= 10 AND right(regexp_replace(COALESCE(u.telefone, ''), '\\D', '', 'g'), 10) = right($1, 10) THEN 2
            WHEN length($1) >= 10 AND right(regexp_replace(COALESCE(u.whatsapp_number, ''), '\\D', '', 'g'), 10) = right($1, 10) THEN 2
            ELSE 9
          END AS match_rank
        FROM users u
        WHERE
          lower(COALESCE(u.email, '')) = ANY($2::text[])
          OR (
            $1 <> ''
            AND (
              regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g') = $1
              OR regexp_replace(COALESCE(u.telefone, ''), '\\D', '', 'g') = $1
              OR regexp_replace(COALESCE(u.whatsapp_number, ''), '\\D', '', 'g') = $1
              OR (
                length($1) >= 10
                AND (
                  right(regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g'), 10) = right($1, 10)
                  OR right(regexp_replace(COALESCE(u.telefone, ''), '\\D', '', 'g'), 10) = right($1, 10)
                  OR right(regexp_replace(COALESCE(u.whatsapp_number, ''), '\\D', '', 'g'), 10) = right($1, 10)
                )
              )
            )
          )
        ORDER BY match_rank ASC, u.updated_at DESC NULLS LAST, u.created_at DESC NULLS LAST
        LIMIT 4
      )
      SELECT
        cu.*,
        (
          SELECT COUNT(*)::int
          FROM agent_media_library m
          WHERE m.user_id = cu.id
            AND m.is_active = true
        ) AS active_media_count,
        (
          SELECT COALESCE(jsonb_agg(to_jsonb(media_rows) ORDER BY media_rows.display_order ASC NULLS LAST, media_rows.created_at ASC NULLS LAST), '[]'::jsonb)
          FROM (
            SELECT name, media_type, description, when_to_use, created_at, display_order
            FROM agent_media_library
            WHERE user_id = cu.id
              AND is_active = true
            ORDER BY display_order ASC NULLS LAST, created_at ASC NULLS LAST
            LIMIT 6
          ) media_rows
        ) AS media_items,
        (
          SELECT COUNT(*)::int
          FROM whatsapp_connections wc
          WHERE wc.user_id = cu.id
            AND (wc.is_connected = true OR wc.provider_status = 'connected')
        ) AS connected_connection_count
      FROM candidate_users cu
      ORDER BY cu.match_rank ASC, cu.updated_at DESC NULLS LAST, cu.created_at DESC NULLS LAST
    `,
    [contactDigits, emails],
  );
  if (result.rows.length === 0) return "";

  const accountLines = result.rows.map((row: any, index: number) => {
    const mediaItems = Array.isArray(row.media_items) ? row.media_items : [];
    const mediaSummary = mediaItems
      .map((media: any) => `${media.name || "midia"} (${media.media_type || "arquivo"}) - quando usar: ${media.when_to_use || media.description || "nao informado"}`)
      .join("; ");
    return [
      `${index + 1}. Conta ${repairCommonMojibake(row.email || "sem email")} (${repairCommonMojibake(row.name || "sem nome")})`,
      `   WhatsApp conectado: ${Number(row.connected_connection_count || 0) > 0 ? "sim" : "nao"}.`,
      `   Midias ativas na biblioteca: ${Number(row.active_media_count || 0)}${mediaSummary ? ` (${repairCommonMojibake(mediaSummary)})` : ""}.`,
    ].join("\n");
  });

  return [
    "=== CONTEXTO OPERACIONAL DO CLIENTE AGENTEZAP ===",
    "Este bloco e interno para atendimento AgenteZap. Use em linguagem simples de produto e nunca exponha IDs, nomes de tabelas, rotas ou detalhes tecnicos.",
    "Ele existe para evitar promessa falsa de configuracao quando ainda nao houve acao real na conta do cliente.",
    `Contato consultado: telefone=${contactDigits || "nao informado"}${emails.length ? `; emails citados=${emails.join(", ")}` : ""}.`,
    "Contas encontradas:",
    ...accountLines,
    "Regra de acao real:",
    "- Imagens, audios, videos ou PDFs enviados nesta conversa de suporte nao entram automaticamente na Biblioteca de Midias da conta do cliente.",
    "- Midias da biblioteca da conta de suporte nao sao midias da conta do cliente e nao devem ser usadas para simular cardapio/catalogo/arquivo do cliente.",
    "- So diga que uma midia foi configurada, salva ou enviada se este contexto mostrar a midia ativa na conta correta ou se uma ferramenta/acao real deste turno confirmar sucesso.",
    "- Se a conta correta nao tiver midias ativas, oriente o cliente a cadastrar em Meu Agente IA > Midias e testar no simulador, ou peca o email da conta correta para o suporte conferir.",
    "- Se houver mais de uma conta para o mesmo telefone, confirme qual conta deve ser usada antes de prometer configuracao.",
    "- Se a conta nao tiver WhatsApp conectado, deixe claro que o envio real pelo WhatsApp depende de conectar o numero no painel.",
    "=== FIM DO CONTEXTO OPERACIONAL DO CLIENTE AGENTEZAP ===",
  ].join("\n");
}

function normalizeSupportTestAgentMediaName(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function isSupportTestAgentTutorialMediaAction(action: any, mediaLibrary: any[]): boolean {
  const actionName = normalizeSupportTestAgentMediaName(action?.media_name || action?.mediaName || action?.name);
  const media = (Array.isArray(mediaLibrary) ? mediaLibrary : []).find((item) => {
    const itemName = normalizeSupportTestAgentMediaName(item?.name || item?.media_name || item?.mediaName);
    return itemName && itemName === actionName;
  });
  const text = normalizeSupportTestAgentText([
    action?.media_name,
    action?.mediaName,
    action?.caption,
    action?.text,
    media?.name,
    media?.description,
    media?.whenToUse,
    media?.when_to_use,
    media?.caption,
  ].filter(Boolean).join("\n"));

  return (
    text.includes("tutorial") ||
    text.includes("passo a passo") ||
    text.includes("como cadastrar") ||
    text.includes("como adicionar") ||
    text.includes("biblioteca de midias") ||
    text.includes("meu agente ia") ||
    text.includes("painel de midias")
  );
}

async function filterSupportTestAgentCustomerMediaActions(params: {
  userId: string;
  request: TestAgentMessageParams;
  mediaActions: any[];
  mediaLibrary: any[];
}): Promise<{ mediaActions: any[]; dropped: any[] }> {
  if (!isSupportTestAgentCustomerMediaTurn(params.request)) {
    return { mediaActions: params.mediaActions, dropped: [] };
  }

  const [supportOwner, customerSignal] = await Promise.all([
    isSupportTestAgentOwner(params.userId).catch(() => false),
    hasSupportTestAgentCustomerSignal(params.request).catch(() => false),
  ]);
  if (!supportOwner || !customerSignal) {
    return { mediaActions: params.mediaActions, dropped: [] };
  }

  const kept: any[] = [];
  const dropped: any[] = [];
  for (const action of Array.isArray(params.mediaActions) ? params.mediaActions : []) {
    if (isSupportTestAgentTutorialMediaAction(action, params.mediaLibrary)) {
      kept.push(action);
    } else {
      dropped.push(action);
    }
  }

  return { mediaActions: kept, dropped };
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

    const conversationHistory = history?.map((msg) => ({
      role: msg.role === "assistant" ? "assistant" as const : "user" as const,
      content: msg.content,
    })) || [];

    console.log(` [TestAgentService] Histrico: ${conversationHistory.length} msgs, Mdias enviadas: ${sentMedias?.length || 0}`);

    // USAR RUNTIME CODEX WEB-ONLY - MESMO CONTRATO DO TESTE/WHATSAPP!
    try {
      const supportOwner = await isSupportTestAgentOwner(resolvedUserId).catch(() => false);
      const supportCustomerContextBlock =
        supportOwner && isSupportTestAgentCustomerMediaTurn(params)
          ? await buildSupportTestAgentCustomerContextBlock(params).catch((error) => {
              console.warn(" [TestAgentService] Falha ao montar contexto de suporte do cliente", error?.message || error);
              return "";
            })
          : "";
      const effectiveCustomPrompt = supportCustomerContextBlock
        ? [supportCustomerContextBlock, agentConfig.prompt].filter(Boolean).join("\n\n")
        : undefined;

      const runCodexPublicTest = async () => {
        const runtimeResult = await runWebOnlyAgentTestForUser(resolvedUserId!, {
          message,
          customPrompt: effectiveCustomPrompt,
          history: conversationHistory,
          sentMedias: sentMedias || [],
          contactName: params.contactName || "Visitante",
          contactPhone: params.contactPhone || params.contactNumber || params.phone || null,
          sessionId: sessionId || token || resolvedUserId,
          testConversationKey: sessionId || token || resolvedUserId,
          webOnlyTestSessionChannel: "public_test_agent_service",
        });
        if (runtimeResult.status >= 400) {
          throw new Error(String(runtimeResult.payload?.message || "codex_public_test_failed"));
        }
        return {
          text: String(runtimeResult.payload?.response || ""),
          mediaActions: Array.isArray(runtimeResult.payload?.mediaActions) ? runtimeResult.payload.mediaActions : [],
          deliveryOrderCreated: runtimeResult.payload?.deliveryOrderCreated,
        };
      };

      let result = await runCodexPublicTest();

      //  RESOLVER URLs DAS MDIAS PARA O FRONTEND
      let mediaActions: any[] = [];
      let mediaLibrary: any[] = [];
      if (result.mediaActions && result.mediaActions.length > 0) {
        mediaLibrary = await getAgentMediaLibrary(resolvedUserId);
        
        for (const rawAction of result.mediaActions) {
          const action: any = rawAction;
          const expandedActions = expandSimulatorMediaAction(action, mediaLibrary);
          if (expandedActions.length > 0 && action?.media_name) {
            console.log(` [TestAgentService] Mdia encontrada: ${action.media_name}`);
          }
          mediaActions.push(...expandedActions);
        }
      }
      const supportMediaGuard = await filterSupportTestAgentCustomerMediaActions({
        userId: resolvedUserId,
        request: params,
        mediaActions,
        mediaLibrary,
      });
      if (supportMediaGuard.dropped.length > 0) {
        console.warn(" [TestAgentService] Midia de suporte removida de turno de midia do cliente", {
          userId: resolvedUserId,
          dropped: supportMediaGuard.dropped.map((action: any) => action?.media_name || action?.mediaName || action?.name).filter(Boolean),
        });
      }
      mediaActions = supportMediaGuard.mediaActions;

      console.log(' \n');

      let responseText = typeof result.text === "string" ? result.text : "";
      const shouldRetry = mediaActions.length === 0 && looksLikeTransientFailure(responseText);
      if (shouldRetry) {
        console.warn(" [TestAgentService] Resposta fraca/transiente detectada, tentando 1 retry");
        result = await runCodexPublicTest();
        responseText = typeof result.text === "string" ? result.text : "";
      }
      let safeResponse = repairCommonMojibake(responseText);
      const paymentCredentialGuard = enforceTrustedPaymentCredentialReply({
        text: safeResponse,
        prompt: agentConfig.prompt,
        trustedReferenceText: [agentConfig.prompt, effectiveCustomPrompt].filter(Boolean).join("\n\n"),
        conversationHistory,
      });
      if (paymentCredentialGuard.applied) {
        console.warn(" [TestAgentService] Guarda financeiro aplicado no simulador", {
          userId: resolvedUserId,
          reason: paymentCredentialGuard.reason,
        });
      }
      safeResponse = paymentCredentialGuard.text;
      if (mediaActions.length === 0 && looksLikeTransientFailure(safeResponse)) {
        return {
          response: "",
          mediaActions,
          deliveryOrderCreated: (result as any).deliveryOrderCreated,
          mode: "client_agent",
          resolvedUserId,
          emptyResponse: true,
          error: "empty_real_response",
        };
      }

      return {
        response: safeResponse,
        mediaActions,
        deliveryOrderCreated: (result as any).deliveryOrderCreated,
        mode: "client_agent",
        resolvedUserId,
      };
    } catch (error) {
      console.error(' [TestAgentService] Erro:', error);
      return {
        response: "",
        mode: "client_agent",
        resolvedUserId,
        emptyResponse: true,
        error: "processing_error",
      };
    }
  }

  // Fallback demo: Rodrigo (somente quando NO h token/userId de cliente).
  const fallbackSessionId = token || `test_${Date.now()}`;
  const response = await deps.processAdminMessage(fallbackSessionId, message, undefined, undefined, true);

  if (!response) {
    return {
      response: "",
      mode: "sales_demo",
      emptyResponse: true,
      error: "demo_empty_response",
    };
  }

  return {
    response: repairCommonMojibake(response.text),
    mediaActions: response.mediaActions,
    mode: "sales_demo",
  };
}
