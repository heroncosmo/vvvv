import { storage } from "./storage";
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

export function mapAdminSetupStatusToCustomerReply(request?: AdminSetupRequest | null): string {
  void request;
  return "";
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
  void params;
  return {
    mode: "normal_sales",
    confidence: 0,
    reason: "disabled_until_codex_structured_contract",
    requestedHelpLevel: "none",
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
    content: `Pedido assistido aberto automaticamente. Motivo: ${params.openingReason || "pedido explÃ­cito do cliente"}.`,
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
  void params;
  throw new Error("SETUP_REQUEST_ANALYSIS_REQUIRES_CODEX_STRUCTURED_CONTRACT");
}

export async function chatSetupRequest(params: {
  conversationId: string;
  adminId: string;
  message: string;
}): Promise<{ request: AdminSetupRequest; reply: string }> {
  void params;
  throw new Error("SETUP_REQUEST_CHAT_REQUIRES_CODEX_STRUCTURED_CONTRACT");
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
    content: "Plano aprovado para execuÃ§Ã£o automÃ¡tica.",
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

    steps[0] = { id: "create_or_reuse_user", status: "success", detail: "SessÃ£o preparada para criaÃ§Ã£o idempotente." };
    steps[1] = {
      id: "resolve_business_mode",
      status: "success",
      detail: `Modo operacional definido como ${plan.workflowKind}.`,
    };

    const { executeCodexCreateAgentContract } = await import("./actionExecutorV2");
    const { getClientSession, getTestToken } = await import("./adminAgentService");
    const createResult = await executeCodexCreateAgentContract({
      phoneNumber: conversation.contactNumber,
      payload: {
        nomeEmpresa: plan.companyName,
        ramoAtuacao: plan.businessDescription || plan.mainOffer || plan.workflowKind,
        descricaoAtendimento: [
          plan.summary,
          plan.businessDescription,
          plan.mainOffer,
          plan.desiredBehavior,
          plan.checklist.length ? `Checklist: ${plan.checklist.join("; ")}` : "",
        ].filter(Boolean).join("\n"),
        sourceCustomerBrief: JSON.stringify(plan),
      },
    });
    if (!createResult.success) {
      throw new Error("CODEX_CREATE_AGENT_CONTRACT_FAILED");
    }

    const simulatorToken =
      createResult.artifacts?.simulatorToken ||
      String(createResult.artifacts?.simulatorUrl || "").match(/\/test\/([A-Za-z0-9_-]+)/)?.[1] ||
      String(createResult.responseText || "").match(/\/test\/([A-Za-z0-9_-]+)/)?.[1];
    if (!simulatorToken) {
      throw new Error("SIMULATOR_TOKEN_NOT_RESOLVED");
    }

    steps[2] = { id: "save_prompt_and_config", status: "success", detail: "Prompt e configuraÃ§Ã£o do agente salvos." };
    steps[3] = {
      id: "seed_delivery_or_scheduling_if_needed",
      status: "success",
      detail:
        plan.workflowKind === "normal"
          ? "Sem seed estrutural extra para modo normal."
          : `MÃ³dulos estruturais aplicados para ${plan.workflowKind}.`,
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
      getTestToken(simulatorToken),
      generateAutologinLink(userId, "/meu-agente-ia"),
    ]);

    if (!user || !agentConfig?.prompt || !tokenInfo?.token) {
      throw new Error("VALIDATION_FAILED");
    }

    steps[5] = { id: "validate_result", status: "success", detail: "Conta, prompt, token e auto-login validados." };

    const executionResult: AdminSetupExecutionResult = {
      success: true,
      userId,
      email: user.email,
      simulatorToken,
      simulatorUrl: `https://www.agentezap.online/test/${simulatorToken}`,
      panelUrl,
      steps,
    };

    const updated = await storage.updateAdminSetupRequest(request.id, {
      status: "created",
      approvalStatus: "approved",
      executionStatus: "done",
      linkedUserId: userId,
      createdTestToken: simulatorToken,
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
  throw new Error('SETUP_RESULT_PUBLIC_DELIVERY_REQUIRES_CODEX_RUNTIME');
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
    reply: null,
  };
}

