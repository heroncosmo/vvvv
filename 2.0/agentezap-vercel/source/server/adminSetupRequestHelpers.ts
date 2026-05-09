import type { AdminSetupRequest } from "@shared/schema";

export interface AdminSetupPlan {
  summary: string;
  pains: string[];
  objectives: string[];
  workflowKind: "delivery" | "agendamento" | "normal";
  companyName: string;
  agentNameSuggestion: string;
  businessDescription: string;
  mainOffer: string;
  desiredBehavior: string;
  modules: string[];
  mediaSuggestions: Array<{
    name: string;
    type: "audio" | "image" | "video" | "document" | "flow";
    description: string;
    whenToUse: string;
  }>;
  missingData: string[];
  checklist: string[];
  usesScheduling: boolean | null;
  restaurantOrderMode: "full_order" | "first_contact" | null;
  workDays: number[];
  workStartTime: string | null;
  workEndTime: string | null;
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
