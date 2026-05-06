import { storage } from "./storage";
import { getLLMClient } from "./llm";
import { generateAutologinLink } from "./autologinService";
import type {
  AdminSetupRequest,
  AdminSetupRequestMessage,
} from "@shared/schema";

export type AdminConversationMode =
  | "auto_self_serve"
  | "assisted_setup"
  | "human_support"
  | "normal_sales";

export interface AdminConversationModeDecision {
  mode: AdminConversationMode;
  confidence: number;
  reason: string;
  requestedHelpLevel: "explicit" | "none";
}

export interface AdminSetupExecutionResult {
  success: boolean;
  userId?: string;
  email?: string;
  simulatorToken?: string;
  simulatorUrl?: string;
  panelUrl?: string;
  sentToCustomerAt?: string;
  steps: Array<{
    id:
      | "create_or_reuse_user"
      | "resolve_business_mode"
      | "save_prompt_and_config"
      | "seed_delivery_or_scheduling_if_needed"
      | "create_test_access"
      | "validate_result";
    status: "pending" | "success" | "skipped" | "failed";
    detail: string;
  }>;
  error?: string;
}

const DEFAULT_PLAN: AdminSetupPlan = {
  summary: "",
  pains: [],
  objectives: [],
  workflowKind: "normal",
  companyName: "",
  agentNameSuggestion: "Atendente",
  businessDescription: "",
  mainOffer: "",
  desiredBehavior: "",
  modules: [],
  mediaSuggestions: [],
  missingData: [],
  checklist: [],
  usesScheduling: null,
  restaurantOrderMode: null,
  workDays: [],
  workStartTime: null,
  workEndTime: null,
};

function extractJsonCandidate(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

export function normalizeAdminSetupPlan(planLike: any): AdminSetupPlan {
  const workflow =
    planLike?.workflowKind === "delivery" || planLike?.workflowKind === "agendamento"
      ? planLike.workflowKind
      : "normal";

  const modules = Array.isArray(planLike?.modules)
    ? planLike.modules.map((item: any) => String(item || "").trim()).filter(Boolean)
    : [];

  const mediaSuggestions = Array.isArray(planLike?.mediaSuggestions)
    ? planLike.mediaSuggestions
        .map((item: any) => ({
          name: String(item?.name || "").trim(),
          type:
            item?.type === "audio" ||
            item?.type === "image" ||
            item?.type === "video" ||
            item?.type === "document" ||
            item?.type === "flow"
              ? item.type
              : "text",
          description: String(item?.description || "").trim(),
          whenToUse: String(item?.whenToUse || "").trim(),
        }))
        .filter((item: any) => item.name && item.description)
        .map((item: any) => ({
          ...item,
          type: item.type === "text" ? "document" : item.type,
        }))
    : [];

  const workDays = Array.isArray(planLike?.workDays)
    ? planLike.workDays
        .map((value: any) => Number(value))
        .filter((value: number) => Number.isInteger(value) && value >= 0 && value <= 6)
    : [];

  return {
    ...DEFAULT_PLAN,
    summary: String(planLike?.summary || "").trim(),
    pains: Array.isArray(planLike?.pains) ? planLike.pains.map((item: any) => String(item || "").trim()).filter(Boolean) : [],
    objectives: Array.isArray(planLike?.objectives) ? planLike.objectives.map((item: any) => String(item || "").trim()).filter(Boolean) : [],
    workflowKind: workflow,
    companyName: String(planLike?.companyName || "").trim(),
    agentNameSuggestion: String(planLike?.agentNameSuggestion || "Atendente").trim() || "Atendente",
    businessDescription: String(planLike?.businessDescription || "").trim(),
    mainOffer: String(planLike?.mainOffer || "").trim(),
    desiredBehavior: String(planLike?.desiredBehavior || "").trim(),
    modules,
    mediaSuggestions,
    missingData: Array.isArray(planLike?.missingData) ? planLike.missingData.map((item: any) => String(item || "").trim()).filter(Boolean) : [],
    checklist: Array.isArray(planLike?.checklist) ? planLike.checklist.map((item: any) => String(item || "").trim()).filter(Boolean) : [],
    usesScheduling:
      typeof planLike?.usesScheduling === "boolean" ? planLike.usesScheduling : workflow === "agendamento" ? true : null,
    restaurantOrderMode:
      planLike?.restaurantOrderMode === "full_order" || planLike?.restaurantOrderMode === "first_contact"
        ? planLike.restaurantOrderMode
        : null,
    workDays,
    workStartTime: String(planLike?.workStartTime || "").trim() || null,
    workEndTime: String(planLike?.workEndTime || "").trim() || null,
  };
}

function buildRequestStatus(request?: AdminSetupRequest | null): string {
  if (!request) return "pending";
  return String(request.status || "open");
}

export function mapAdminSetupStatusToCustomerReply(request?: AdminSetupRequest | null): string {
  const status = buildRequestStatus(request);
  if (status === "created") {
    return "Perfeito. Sua configuração já ficou pronta e está em validação final. Assim que eu liberar o acesso, te aviso aqui.";
  }
  if (status === "approved" || status === "executing") {
    return "Estou finalizando a sua configuração por aqui. Assim que terminar, eu te atualizo nesta conversa.";
  }
  if (status === "failed") {
    return "Estou revisando um detalhe da sua configuração por aqui. Assim que eu corrigir, eu te atualizo nesta conversa.";
  }
  return "Seu pedido de configuração assistida já está aberto. Um humano vai montar isso com você por aqui e eu te atualizo nesta conversa.";
}

async function callJsonLlm<T>(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, maxTokens: number): Promise<T | null> {
  try {
    const client = await getLLMClient();
    const response = await client.chat.complete({
      model: "mistral-small-latest",
      messages,
      maxTokens,
      temperature: 0.1,
    });
    const raw = String(response.choices?.[0]?.message?.content || "");
    const json = extractJsonCandidate(raw);
    if (!json) return null;
    return JSON.parse(json) as T;
  } catch (error) {
    console.warn("[ADMIN-SETUP] Falha ao interpretar JSON da LLM:", error);
    return null;
  }
}

async function getConversationBundle(conversationId: string): Promise<{
  conversation: any;
  messages: any[];
}> {
  const conversation = await storage.getAdminConversation(conversationId);
  if (!conversation) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }
  const messages = await storage.getAdminMessages(conversationId);
  return { conversation, messages };
}

function summarizeConversationForLlm(messages: any[]): string {
  return messages
    .slice(-80)
    .map((message) => `${message.fromMe ? "ASSISTENTE" : "CLIENTE"}: ${String(message.text || message.mediaCaption || "").trim()}`)
    .filter(Boolean)
    .join("\n");
}

async function persistConversationSetupState(conversationId: string, requestId: string, status: string) {
  const conversation = await storage.getAdminConversation(conversationId);
  if (!conversation) return;
  const nextContextState = {
    ...(conversation.contextState || {}),
    assistedSetupRequestId: requestId,
    assistedSetupStatus: status,
    assistedSetupLocked: true,
  };
  await storage.updateAdminConversation(conversationId, {
    contextState: nextContextState,
  });
}

export async function classifyAdminConversationMode(params: {
  messageText: string;
  session: {
    flowState?: string;
    pendingAction?: { type?: string } | undefined;
    conversationHistory?: Array<{ role: string; content: string }>;
    setupProfile?: Record<string, any>;
  };
  linkedContext: { user?: any; hasConfiguredAgent: boolean };
}): Promise<AdminConversationModeDecision> {
  const cleanMessage = String(params.messageText || "").trim();
  if (!cleanMessage) {
    return {
      mode: "normal_sales",
      confidence: 0,
      reason: "Mensagem vazia",
      requestedHelpLevel: "none",
    };
  }

  const recentHistory = (params.session.conversationHistory || [])
    .slice(-8)
    .map((item) => `${item.role === "assistant" ? "ASSISTENTE" : "CLIENTE"}: ${item.content}`)
    .join("\n");

  const parsed = await callJsonLlm<AdminConversationModeDecision>(
    [
      {
        role: "system",
        content: `Você classifica o modo de uma conversa comercial da AgenteZap.

Retorne SOMENTE JSON válido:
{"mode":"auto_self_serve|assisted_setup|human_support|normal_sales","confidence":0.0,"reason":"...","requestedHelpLevel":"explicit|none"}

Regras:
- "assisted_setup" somente quando o cliente pedir explicitamente para vocês configurarem por ele, disser que não consegue sozinho, ou pedir ajuda humana para montar.
- "auto_self_serve" quando o cliente quiser testar, ver funcionando, criar a conta, receber link, simulador ou acessar o sistema por conta própria.
- "human_support" quando ele pedir falar com humano, ligação, call ou suporte humano.
- "normal_sales" nos demais casos.

Nunca use "assisted_setup" só porque o cliente está com dúvida. Tem que haver pedido explícito de ajuda para configurar por ele.`,
      },
      {
        role: "user",
        content: `Mensagem atual: ${cleanMessage}

Contexto:
- flowState: ${params.session.flowState || "onboarding"}
- pendingAction: ${params.session.pendingAction?.type || "nenhuma"}
- temContaVinculada: ${params.linkedContext.user ? "sim" : "nao"}
- temAgenteConfigurado: ${params.linkedContext.hasConfiguredAgent ? "sim" : "nao"}

Conversa recente:
${recentHistory || "sem histórico"}`,
      },
    ],
    180,
  );

  if (!parsed) {
    return {
      mode: "normal_sales",
      confidence: 0,
      reason: "Fallback seguro",
      requestedHelpLevel: "none",
    };
  }

  return {
    mode:
      parsed.mode === "assisted_setup" ||
      parsed.mode === "auto_self_serve" ||
      parsed.mode === "human_support"
        ? parsed.mode
        : "normal_sales",
    confidence: Number(parsed.confidence || 0),
    reason: String(parsed.reason || "").trim(),
    requestedHelpLevel: parsed.requestedHelpLevel === "explicit" ? "explicit" : "none",
  };
}

export async function openAssistedSetupRequest(params: {
  conversationId: string;
  adminId: string;
  linkedUserId?: string;
  openingReason: string;
  customerMessage: string;
}): Promise<AdminSetupRequest> {
  const existing = await storage.getAdminSetupRequestByConversationId(params.conversationId);
  if (existing) {
    const updated = await storage.updateAdminSetupRequest(existing.id, {
      status: "open",
      requestMode: "assisted_setup",
      analysisStatus: existing.analysisStatus || "pending",
      approvalStatus: existing.approvalStatus || "pending",
      executionStatus: existing.executionStatus || "pending",
      lockedCustomerHandoff: true,
      linkedUserId: params.linkedUserId || existing.linkedUserId || undefined,
      conversationFacts: {
        ...(existing.conversationFacts || {}),
        openingReason: params.openingReason,
        openingCustomerMessage: params.customerMessage,
      },
    });
    await persistConversationSetupState(params.conversationId, updated!.id, updated!.status);
    return updated!;
  }

  const created = await storage.createAdminSetupRequest({
    conversationId: params.conversationId,
    adminId: params.adminId,
    status: "open",
    requestMode: "assisted_setup",
    analysisStatus: "pending",
    approvalStatus: "pending",
    executionStatus: "pending",
    lockedCustomerHandoff: true,
    linkedUserId: params.linkedUserId,
    createdByAi: true,
    conversationFacts: {
      openingReason: params.openingReason,
      openingCustomerMessage: params.customerMessage,
    },
    suggestedPlan: {},
    refinedPlan: {},
    executionResult: {},
  });

  await storage.createAdminSetupRequestMessage({
    requestId: created.id,
    role: "assistant",
    messageType: "system",
    content: `Pedido assistido aberto automaticamente. Motivo: ${params.openingReason || "pedido explícito do cliente"}.`,
    planSnapshot: {},
    metadata: {
      source: "customer_handoff",
      customerMessage: params.customerMessage,
    },
    createdBy: "ai",
  });

  await persistConversationSetupState(params.conversationId, created.id, created.status);
  return created;
}

export async function getSetupRequestBundle(conversationId: string): Promise<{
  request: AdminSetupRequest | null;
  messages: AdminSetupRequestMessage[];
}> {
  const request = await storage.getAdminSetupRequestByConversationId(conversationId);
  if (!request) {
    return { request: null, messages: [] };
  }
  const messages = await storage.getAdminSetupRequestMessages(request.id);
  return { request, messages };
}

export async function analyzeSetupRequest(params: {
  conversationId: string;
  adminId: string;
}): Promise<AdminSetupRequest> {
  const { conversation, messages } = await getConversationBundle(params.conversationId);
  const request =
    (await storage.getAdminSetupRequestByConversationId(params.conversationId)) ||
    (await openAssistedSetupRequest({
      conversationId: params.conversationId,
      adminId: params.adminId,
      linkedUserId: conversation.linkedUserId || undefined,
      openingReason: "Análise manual iniciada no admin",
      customerMessage: conversation.lastMessageText || "",
    }));

  await storage.updateAdminSetupRequest(request.id, {
    status: "analyzing",
    analysisStatus: "running",
    lockedCustomerHandoff: true,
  });

  const conversationText = summarizeConversationForLlm(messages);
  const parsed = await callJsonLlm<{ facts?: Record<string, any>; plan?: Record<string, any> }>(
    [
      {
        role: "system",
        content: `Você analisa uma conversa de venda da AgenteZap e monta um plano inicial de configuração assistida.

Retorne SOMENTE JSON válido:
{
  "facts": {
    "summary": "string",
    "customerGoal": "string",
    "objections": ["..."],
    "customerAskedForHumanSetup": true
  },
  "plan": {
    "summary": "string",
    "pains": ["..."],
    "objectives": ["..."],
    "workflowKind": "delivery|agendamento|normal",
    "companyName": "string",
    "agentNameSuggestion": "string",
    "businessDescription": "string",
    "mainOffer": "string",
    "desiredBehavior": "string",
    "modules": ["crm","kanban","notificador","delivery","agendamento","fluxos","midias"],
    "mediaSuggestions": [{"name":"string","type":"audio|image|video|document|flow","description":"string","whenToUse":"string"}],
    "missingData": ["..."],
    "checklist": ["..."],
    "usesScheduling": true,
    "restaurantOrderMode": "full_order|first_contact|null",
    "workDays": [1,2,3,4,5],
    "workStartTime": "09:00",
    "workEndTime": "18:00"
  }
}

Use apenas os dados que realmente aparecem na conversa. Se algo estiver faltando, deixe em missingData.`,
      },
      {
        role: "user",
        content: `Conversa completa:
${conversationText || "sem mensagens"}

Última mensagem do cliente: ${conversation.lastMessageText || "sem mensagem"}
Nome do contato: ${conversation.contactName || "não informado"}`,
      },
    ],
    1800,
  );

  const facts = parsed?.facts && typeof parsed.facts === "object" ? parsed.facts : {};
  const plan = normalizeAdminSetupPlan(parsed?.plan || {});

  const updated = await storage.updateAdminSetupRequest(request.id, {
    status: "draft_ready",
    analysisStatus: "done",
    conversationFacts: facts,
    suggestedPlan: plan,
    refinedPlan: plan,
  });

  await storage.createAdminSetupRequestMessage({
    requestId: request.id,
    role: "assistant",
    messageType: "analysis",
    content: "Análise inicial concluída e plano sugerido atualizado.",
    planSnapshot: plan,
    metadata: {
      facts,
    },
    createdBy: "ai",
  });

  await persistConversationSetupState(params.conversationId, request.id, updated!.status);
  return updated!;
}

export async function chatSetupRequest(params: {
  conversationId: string;
  adminId: string;
  message: string;
}): Promise<{ request: AdminSetupRequest; reply: string }> {
  const bundle = await getSetupRequestBundle(params.conversationId);
  if (!bundle.request) {
    throw new Error("SETUP_REQUEST_NOT_FOUND");
  }
  const request = bundle.request;
  const { messages: conversationMessages } = await getConversationBundle(params.conversationId);
  const conversationText = summarizeConversationForLlm(conversationMessages);
  const priorMessages = bundle.messages
    .slice(-10)
    .map((item) => `${item.role === "assistant" ? "IA" : "DONO"}: ${item.content}`)
    .join("\n");
  const currentPlan = normalizeAdminSetupPlan(request.refinedPlan || request.suggestedPlan || {});

  const parsed = await callJsonLlm<{ replyText?: string; updatedPlan?: Record<string, any> }>(
    [
      {
        role: "system",
        content: `Você ajuda o dono da AgenteZap a refinar um plano de configuração assistida.

Retorne SOMENTE JSON válido:
{
  "replyText": "resposta curta para o dono",
  "updatedPlan": {
    "summary": "string",
    "pains": ["..."],
    "objectives": ["..."],
    "workflowKind": "delivery|agendamento|normal",
    "companyName": "string",
    "agentNameSuggestion": "string",
    "businessDescription": "string",
    "mainOffer": "string",
    "desiredBehavior": "string",
    "modules": ["..."],
    "mediaSuggestions": [{"name":"string","type":"audio|image|video|document|flow","description":"string","whenToUse":"string"}],
    "missingData": ["..."],
    "checklist": ["..."],
    "usesScheduling": true,
    "restaurantOrderMode": "full_order|first_contact|null",
    "workDays": [1,2,3,4,5],
    "workStartTime": "09:00",
    "workEndTime": "18:00"
  }
}

Atualize o plano apenas com base no pedido do dono e no histórico real.`,
      },
      {
        role: "user",
        content: `Conversa com o cliente:
${conversationText || "sem mensagens"}

Plano atual:
${JSON.stringify(currentPlan, null, 2)}

Histórico dono x IA:
${priorMessages || "sem histórico"}

Pedido novo do dono:
${params.message}`,
      },
    ],
    2200,
  );

  const updatedPlan = normalizeAdminSetupPlan(parsed?.updatedPlan || currentPlan);
  const replyText = String(parsed?.replyText || "Ajustei o plano com base no que você pediu.").trim();

  await storage.createAdminSetupRequestMessage({
    requestId: request.id,
    role: "user",
    messageType: "chat",
    content: params.message,
    planSnapshot: currentPlan,
    metadata: {},
    createdBy: params.adminId,
  });

  const updated = await storage.updateAdminSetupRequest(request.id, {
    status: "needs_admin_input",
    refinedPlan: updatedPlan,
  });

  await storage.createAdminSetupRequestMessage({
    requestId: request.id,
    role: "assistant",
    messageType: "chat",
    content: replyText,
    planSnapshot: updatedPlan,
    metadata: {},
    createdBy: "ai",
  });

  return { request: updated!, reply: replyText };
}

export async function approveSetupRequest(params: {
  conversationId: string;
  adminId: string;
}): Promise<AdminSetupRequest> {
  const request = await storage.getAdminSetupRequestByConversationId(params.conversationId);
  if (!request) {
    throw new Error("SETUP_REQUEST_NOT_FOUND");
  }

  const updated = await storage.updateAdminSetupRequest(request.id, {
    status: "approved",
    approvalStatus: "approved",
    approvedByAdmin: params.adminId,
    approvedAt: new Date(),
  });

  await storage.createAdminSetupRequestMessage({
    requestId: request.id,
    role: "assistant",
    messageType: "approval",
    content: "Plano aprovado para execução automática.",
    planSnapshot: normalizeAdminSetupPlan(updated!.refinedPlan || updated!.suggestedPlan || {}),
    metadata: {},
    createdBy: params.adminId,
  });

  return updated!;
}

function mapWorkflowKindToSessionPlan(workflowKind: AdminSetupPlan["workflowKind"]) {
  if (workflowKind === "delivery") {
    return { workflowKind: "delivery" as const, usesScheduling: false };
  }
  if (workflowKind === "agendamento") {
    return { workflowKind: "scheduling" as const, usesScheduling: true };
  }
  return { workflowKind: "generic" as const, usesScheduling: false };
}

async function createExecutionSession(params: {
  phoneNumber: string;
  plan: AdminSetupPlan;
  contactName?: string | null;
}) {
  const { createClientSession, getClientSession, updateClientSession } = await import("./adminAgentService");
  let session = getClientSession(params.phoneNumber);
  if (!session) {
    session = createClientSession(params.phoneNumber);
  }

  const mappedWorkflow = mapWorkflowKindToSessionPlan(params.plan.workflowKind);
  session = updateClientSession(params.phoneNumber, {
    contactName: params.contactName || session.contactName,
    flowState: "onboarding",
    agentConfig: {
      ...session.agentConfig,
      company: params.plan.companyName,
      name: params.plan.agentNameSuggestion || "Atendente",
      role: params.plan.mainOffer || params.plan.businessDescription || "atendente virtual",
      prompt: params.plan.desiredBehavior || params.plan.summary || "Atenda com clareza e objetividade.",
    },
    setupProfile: {
      ...(session.setupProfile || {}),
      questionStage: "ready",
      answeredBusiness: true,
      answeredBehavior: true,
      answeredWorkflow: true,
      businessSummary: params.plan.businessDescription || params.plan.summary,
      desiredAgentBehavior: params.plan.desiredBehavior || params.plan.summary,
      mainOffer: params.plan.mainOffer || undefined,
      workflowKind: mappedWorkflow.workflowKind,
      usesScheduling: mappedWorkflow.usesScheduling,
      restaurantOrderMode:
        params.plan.workflowKind === "delivery" ? params.plan.restaurantOrderMode || "first_contact" : undefined,
      workDays: params.plan.workDays.length > 0 ? params.plan.workDays : undefined,
      workStartTime: params.plan.workStartTime || undefined,
      workEndTime: params.plan.workEndTime || undefined,
      rawAnswers: {
        q1: params.plan.businessDescription || params.plan.summary,
        q2: params.plan.desiredBehavior || params.plan.summary,
        q3:
          params.plan.workflowKind === "delivery"
            ? params.plan.restaurantOrderMode || "first_contact"
            : params.plan.workflowKind === "agendamento"
              ? `${params.plan.workStartTime || "09:00"}-${params.plan.workEndTime || "18:00"}`
              : "atendimento normal",
      },
    },
  });

  return session;
}

export async function executeSetupRequestCreation(params: {
  conversationId: string;
  adminId: string;
}): Promise<AdminSetupRequest> {
  const request = await storage.getAdminSetupRequestByConversationId(params.conversationId);
  if (!request) {
    throw new Error("SETUP_REQUEST_NOT_FOUND");
  }
  const { conversation } = await getConversationBundle(params.conversationId);
  const plan = normalizeAdminSetupPlan(request.refinedPlan || request.suggestedPlan || {});

  const steps: AdminSetupExecutionResult["steps"] = [
    { id: "create_or_reuse_user", status: "pending", detail: "Aguardando" },
    { id: "resolve_business_mode", status: "pending", detail: "Aguardando" },
    { id: "save_prompt_and_config", status: "pending", detail: "Aguardando" },
    { id: "seed_delivery_or_scheduling_if_needed", status: "pending", detail: "Aguardando" },
    { id: "create_test_access", status: "pending", detail: "Aguardando" },
    { id: "validate_result", status: "pending", detail: "Aguardando" },
  ];

  await storage.updateAdminSetupRequest(request.id, {
    status: "executing",
    executionStatus: "running",
    lastError: null as any,
  });

  try {
    const session = await createExecutionSession({
      phoneNumber: conversation.contactNumber,
      plan,
      contactName: conversation.contactName,
    });

    steps[0] = { id: "create_or_reuse_user", status: "success", detail: "Sessão preparada para criação idempotente." };
    steps[1] = {
      id: "resolve_business_mode",
      status: "success",
      detail: `Modo operacional definido como ${plan.workflowKind}.`,
    };

    const { createTestAccountWithCredentials, getClientSession, getTestToken } = await import("./adminAgentService");
    const createResult = await createTestAccountWithCredentials(session);
    if (!createResult.success || !createResult.email || !createResult.simulatorToken) {
      throw new Error(createResult.error || "CREATE_TEST_ACCOUNT_FAILED");
    }

    steps[2] = { id: "save_prompt_and_config", status: "success", detail: "Prompt e configuração do agente salvos." };
    steps[3] = {
      id: "seed_delivery_or_scheduling_if_needed",
      status: "success",
      detail:
        plan.workflowKind === "normal"
          ? "Sem seed estrutural extra para modo normal."
          : `Módulos estruturais aplicados para ${plan.workflowKind}.`,
    };
    steps[4] = { id: "create_test_access", status: "success", detail: "Teste e credenciais gerados." };

    const refreshedSession = getClientSession(conversation.contactNumber);
    const userId = refreshedSession?.userId;
    if (!userId) {
      throw new Error("USER_ID_NOT_RESOLVED");
    }

    const [user, agentConfig, tokenInfo, panelUrl] = await Promise.all([
      storage.getUser(userId),
      storage.getAgentConfig(userId),
      getTestToken(createResult.simulatorToken),
      generateAutologinLink(userId, "/meu-agente-ia"),
    ]);

    if (!user || !agentConfig?.prompt || !tokenInfo?.token) {
      throw new Error("VALIDATION_FAILED");
    }

    steps[5] = { id: "validate_result", status: "success", detail: "Conta, prompt, token e auto-login validados." };

    const executionResult: AdminSetupExecutionResult = {
      success: true,
      userId,
      email: createResult.email,
      simulatorToken: createResult.simulatorToken,
      simulatorUrl: `https://agentezap.online/test/${createResult.simulatorToken}`,
      panelUrl,
      steps,
    };

    const updated = await storage.updateAdminSetupRequest(request.id, {
      status: "created",
      approvalStatus: "approved",
      executionStatus: "done",
      linkedUserId: userId,
      createdTestToken: createResult.simulatorToken,
      createdAutologinToken: panelUrl,
      executionResult,
      completedAt: new Date(),
    });

    await persistConversationSetupState(params.conversationId, request.id, updated!.status);
    return updated!;
  } catch (error: any) {
    const failedStep = steps.find((step) => step.status === "pending");
    if (failedStep) {
      failedStep.status = "failed";
      failedStep.detail = error?.message || "Falha sem detalhe";
    }

    const executionResult: AdminSetupExecutionResult = {
      success: false,
      error: String(error?.message || error),
      steps,
    };

    const updated = await storage.updateAdminSetupRequest(request.id, {
      status: "failed",
      executionStatus: "failed",
      lastError: String(error?.message || error),
      executionResult,
    });

    await persistConversationSetupState(params.conversationId, request.id, updated!.status);
    return updated!;
  }
}

export async function sendSetupRequestResult(params: {
  conversationId: string;
  adminId: string;
}): Promise<AdminSetupRequest> {
  const request = await storage.getAdminSetupRequestByConversationId(params.conversationId);
  if (!request) {
    throw new Error("SETUP_REQUEST_NOT_FOUND");
  }
  const executionResult = (request.executionResult || {}) as AdminSetupExecutionResult;
  if (!executionResult.success || !executionResult.simulatorUrl || !executionResult.panelUrl) {
    throw new Error("SETUP_REQUEST_NOT_READY");
  }

  const { sendAdminConversationMessage } = await import("./whatsapp");
  const text =
    `Perfeito. Sua configuração ficou pronta.\n\n` +
    `Teste: ${executionResult.simulatorUrl}\n\n` +
    `Painel: ${executionResult.panelUrl}\n\n` +
    `Você também pode ajustar direto no sistema e conhecer CRM, Kanban, conversas, notificador inteligente, fluxos e a conexão do WhatsApp.`;

  await sendAdminConversationMessage(params.adminId, params.conversationId, text);

  const updated = await storage.updateAdminSetupRequest(request.id, {
    status: "delivered",
    executionResult: {
      ...executionResult,
      sentToCustomerAt: new Date().toISOString(),
    },
  });

  await persistConversationSetupState(params.conversationId, request.id, updated!.status);
  return updated!;
}

export async function getCustomerAssistedSetupStatusByPhone(phoneNumber: string): Promise<{
  request: AdminSetupRequest | null;
  reply: string | null;
}> {
  const conversation = await storage.getAdminConversationByPhone(String(phoneNumber || "").replace(/\D/g, ""));
  if (!conversation) {
    return { request: null, reply: null };
  }
  const request = await storage.getAdminSetupRequestByConversationId(conversation.id);
  if (!request || request.lockedCustomerHandoff !== true) {
    return { request: null, reply: null };
  }

  return {
    request,
    reply: mapAdminSetupStatusToCustomerReply(request),
  };
}
