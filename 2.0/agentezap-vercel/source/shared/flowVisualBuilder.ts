import type { MistralResponse } from "@shared/schema";

export const VISUAL_FLOW_META_START = "<<FLOW_VISUAL_META>>";
export const VISUAL_FLOW_META_END = "<<END_FLOW_VISUAL_META>>";

export type VisualFlowStepType = "message" | "question" | "media" | "handoff" | "end";
export type VisualFlowFinalAction = "continue_ai" | "end" | "handoff";
export type VisualFlowTriggerMode = "first_message" | "any_message" | "default";
export type VisualFlowMediaAction = NonNullable<MistralResponse["actions"]>[number];

export interface VisualFlowBranch {
  id: string;
  label: string;
  condition: string;
  nextStepId: string | null;
}

export interface VisualFlowStep {
  id: string;
  type: VisualFlowStepType;
  title: string;
  message: string;
  nextStepId?: string | null;
  branches?: VisualFlowBranch[];
  mediaActions?: VisualFlowMediaAction[];
  fallbackStepId?: string | null;
  fallbackMessage?: string;
  finalAction?: VisualFlowFinalAction | null;
}

export interface VisualFlowRoute {
  id: string;
  name: string;
  description: string;
  triggerMode: VisualFlowTriggerMode;
  triggerCondition: string;
  defaultFinalAction?: VisualFlowFinalAction;
  steps: VisualFlowStep[];
}

export interface VisualFlowDefinition {
  version: 1;
  mode: "visual";
  manualNotes?: string;
  flows: VisualFlowRoute[];
}

export interface ExtractedVisualFlowMetadata {
  cleanScript: string;
  definition: VisualFlowDefinition | null;
  hasMetadata: boolean;
}

function ensureString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeFinalAction(value: unknown): VisualFlowFinalAction | null {
  const normalized = ensureString(value).trim();
  if (normalized === "continue_ai" || normalized === "end" || normalized === "handoff") {
    return normalized;
  }
  return null;
}

function normalizeTriggerMode(value: unknown): VisualFlowTriggerMode {
  const normalized = ensureString(value).trim();
  if (normalized === "first_message" || normalized === "any_message" || normalized === "default") {
    return normalized;
  }
  return "any_message";
}

function defaultTriggerCondition(triggerMode: VisualFlowTriggerMode) {
  if (triggerMode === "first_message") {
    return "Use este fluxo apenas no inicio da conversa, quando a primeira mensagem do cliente combinar com a intencao descrita.";
  }

  if (triggerMode === "default") {
    return "Use este fluxo como fallback quando nenhum outro fluxo representar melhor a intencao real do cliente.";
  }

  return "Use este fluxo quando a intencao e o contexto da mensagem combinarem com este objetivo.";
}

function normalizeMediaAction(input: unknown): VisualFlowMediaAction | null {
  if (!input || typeof input !== "object") return null;

  const action = input as Record<string, unknown>;
  const type = ensureString(action.type).trim();

  if (type === "send_text") {
    const text = ensureString(action.text).trim();
    if (!text) return null;

    const normalizedAction: VisualFlowMediaAction = {
      type: "send_text",
      text,
    };

    const delaySeconds = Number(action.delay_seconds);
    if (Number.isFinite(delaySeconds)) {
      normalizedAction.delay_seconds = delaySeconds;
    }

    return normalizedAction;
  }

  if (type === "send_media_url") {
    const mediaUrl = ensureString(action.media_url).trim();
    const mediaType = ensureString(action.media_type).trim();
    if (!mediaUrl || !["audio", "image", "video", "document"].includes(mediaType)) {
      return null;
    }

    const normalizedAction: VisualFlowMediaAction = {
      type: "send_media_url",
      media_url: mediaUrl,
      media_type: mediaType as "audio" | "image" | "video" | "document",
    };

    const mediaName = ensureString(action.media_name).trim();
    const caption = ensureString(action.caption).trim();
    const fileName = ensureString(action.file_name).trim();

    if (mediaName) normalizedAction.media_name = mediaName;
    if (caption) normalizedAction.caption = caption;
    if (fileName) normalizedAction.file_name = fileName;

    const delaySeconds = Number(action.delay_seconds);
    if (Number.isFinite(delaySeconds)) {
      normalizedAction.delay_seconds = delaySeconds;
    }

    return normalizedAction;
  }

  if (type === "send_media") {
    const mediaName = ensureString(action.media_name).trim();
    if (!mediaName) return null;

    const normalizedAction: VisualFlowMediaAction = {
      type: "send_media",
      media_name: mediaName,
    };

    const delaySeconds = Number(action.delay_seconds);
    if (Number.isFinite(delaySeconds)) {
      normalizedAction.delay_seconds = delaySeconds;
    }

    return normalizedAction;
  }

  return null;
}

function normalizeBranch(input: unknown): VisualFlowBranch | null {
  if (!input || typeof input !== "object") return null;

  const branch = input as Record<string, unknown>;
  const id = ensureString(branch.id).trim();
  if (!id) return null;

  const nextStepIdRaw = ensureString(branch.nextStepId).trim();
  return {
    id,
    label: ensureString(branch.label).trim(),
    condition: ensureString(branch.condition).trim(),
    nextStepId: nextStepIdRaw || null,
  };
}

function normalizeStep(input: unknown): VisualFlowStep | null {
  if (!input || typeof input !== "object") return null;

  const step = input as Record<string, unknown>;
  const id = ensureString(step.id).trim();
  const type = ensureString(step.type).trim() as VisualFlowStepType;

  if (!id || !["message", "question", "media", "handoff", "end"].includes(type)) {
    return null;
  }

  const nextStepIdRaw = ensureString(step.nextStepId).trim();
  const fallbackStepIdRaw = ensureString(step.fallbackStepId).trim();
  const branches = Array.isArray(step.branches)
    ? (step.branches.map(normalizeBranch).filter(Boolean) as VisualFlowBranch[])
    : [];
  const mediaActions = Array.isArray(step.mediaActions)
    ? (step.mediaActions.map(normalizeMediaAction).filter(Boolean) as VisualFlowMediaAction[])
    : [];

  return {
    id,
    type,
    title: ensureString(step.title).trim() || "Etapa",
    message: ensureString(step.message).trim(),
    nextStepId: nextStepIdRaw || null,
    branches,
    mediaActions,
    fallbackStepId: fallbackStepIdRaw || null,
    fallbackMessage: ensureString(step.fallbackMessage).trim(),
    finalAction: normalizeFinalAction(step.finalAction),
  };
}

export function createEmptyVisualFlowRoute(
  overrides: Partial<VisualFlowRoute> = {},
): VisualFlowRoute {
  const triggerMode = normalizeTriggerMode(overrides.triggerMode);
  const steps = Array.isArray(overrides.steps)
    ? (overrides.steps.map(normalizeStep).filter(Boolean) as VisualFlowStep[])
    : [];

  return {
    id: ensureString(overrides.id).trim() || makeId("flow"),
    name: ensureString(overrides.name).trim() || "Fluxo principal",
    description: ensureString(overrides.description).trim(),
    triggerMode,
    triggerCondition:
      ensureString(overrides.triggerCondition).trim() || defaultTriggerCondition(triggerMode),
    defaultFinalAction: normalizeFinalAction(overrides.defaultFinalAction) || "continue_ai",
    steps,
  };
}

function createLegacyDefaultRoute(params: {
  steps?: unknown;
  defaultFinalAction?: unknown;
}): VisualFlowRoute {
  const steps = Array.isArray(params.steps)
    ? (params.steps.map(normalizeStep).filter(Boolean) as VisualFlowStep[])
    : [];

  return createEmptyVisualFlowRoute({
    id: "flow-default",
    name: "Fluxo principal",
    description: "Fluxo importado do formato anterior.",
    triggerMode: "default",
    triggerCondition: defaultTriggerCondition("default"),
    defaultFinalAction: normalizeFinalAction(params.defaultFinalAction) || "continue_ai",
    steps,
  });
}

function normalizeRoute(input: unknown, index: number): VisualFlowRoute | null {
  if (!input || typeof input !== "object") return null;

  const route = input as Record<string, unknown>;
  const triggerMode = normalizeTriggerMode(route.triggerMode);
  const steps = Array.isArray(route.steps)
    ? (route.steps.map(normalizeStep).filter(Boolean) as VisualFlowStep[])
    : [];

  return createEmptyVisualFlowRoute({
    id: ensureString(route.id).trim() || `flow-${index + 1}`,
    name: ensureString(route.name).trim() || `Fluxo ${index + 1}`,
    description: ensureString(route.description).trim(),
    triggerMode,
    triggerCondition:
      ensureString(route.triggerCondition).trim() || defaultTriggerCondition(triggerMode),
    defaultFinalAction: normalizeFinalAction(route.defaultFinalAction) || "continue_ai",
    steps,
  });
}

export function createEmptyVisualFlowDefinition(): VisualFlowDefinition {
  return {
    version: 1,
    mode: "visual",
    manualNotes: "",
    flows: [
      createEmptyVisualFlowRoute({
        id: "flow-default",
        name: "Fluxo principal",
        triggerMode: "default",
      }),
    ],
  };
}

export function sanitizeVisualFlowDefinition(input: unknown): VisualFlowDefinition {
  if (!input || typeof input !== "object") {
    return createEmptyVisualFlowDefinition();
  }

  const raw = input as Record<string, unknown>;
  const version = 1;
  const mode = "visual" as const;
  const manualNotes = ensureString(raw.manualNotes);

  const flows = Array.isArray(raw.flows)
    ? (raw.flows.map(normalizeRoute).filter(Boolean) as VisualFlowRoute[])
    : [];

  if (flows.length > 0) {
    const ensuredDefault = flows.some((flow) => flow.triggerMode === "default")
      ? flows
      : flows.map((flow, index) =>
          index === 0 ? { ...flow, triggerMode: "default" as const } : flow,
        );

    return {
      version,
      mode,
      manualNotes,
      flows: ensuredDefault,
    };
  }

  const legacyRoute = createLegacyDefaultRoute({
    steps: raw.steps,
    defaultFinalAction: raw.defaultFinalAction,
  });

  return {
    version,
    mode,
    manualNotes,
    flows: [legacyRoute],
  };
}

export function extractVisualFlowMetadata(
  rawScript: string | null | undefined,
): ExtractedVisualFlowMetadata {
  const script = ensureString(rawScript);
  const startIndex = script.indexOf(VISUAL_FLOW_META_START);
  const endIndex = script.indexOf(VISUAL_FLOW_META_END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return {
      cleanScript: script.trim(),
      definition: null,
      hasMetadata: false,
    };
  }

  const jsonStart = startIndex + VISUAL_FLOW_META_START.length;
  const jsonText = script.slice(jsonStart, endIndex).trim();
  const before = script.slice(0, startIndex).trim();
  const after = script.slice(endIndex + VISUAL_FLOW_META_END.length).trim();
  const cleanScript = [before, after].filter(Boolean).join("\n\n").trim();

  try {
    const parsed = JSON.parse(jsonText);
    return {
      cleanScript,
      definition: sanitizeVisualFlowDefinition(parsed),
      hasMetadata: true,
    };
  } catch {
    return {
      cleanScript,
      definition: null,
      hasMetadata: true,
    };
  }
}

export function appendVisualFlowMetadata(
  cleanScript: string,
  definition: VisualFlowDefinition,
): string {
  const sanitizedDefinition = sanitizeVisualFlowDefinition(definition);
  const serialized = JSON.stringify(sanitizedDefinition, null, 2);
  const base = ensureString(cleanScript).trim();

  if (!base) {
    return `${VISUAL_FLOW_META_START}\n${serialized}\n${VISUAL_FLOW_META_END}`;
  }

  return `${base}\n\n${VISUAL_FLOW_META_START}\n${serialized}\n${VISUAL_FLOW_META_END}`;
}

export function hasVisualFlowContent(definition: VisualFlowDefinition | null | undefined): boolean {
  if (!definition) return false;
  const sanitized = sanitizeVisualFlowDefinition(definition);
  return sanitized.flows.some((flow) => flow.steps.length > 0);
}

export function getDefaultVisualFlowRoute(
  definition: VisualFlowDefinition | null | undefined,
): VisualFlowRoute | null {
  if (!definition) return null;
  const sanitized = sanitizeVisualFlowDefinition(definition);
  return sanitized.flows.find((flow) => flow.triggerMode === "default") || sanitized.flows[0] || null;
}

export function getVisualFlowRouteByStepId(
  definition: VisualFlowDefinition | null | undefined,
  stepId: string | null | undefined,
): VisualFlowRoute | null {
  if (!definition || !stepId) return null;
  const sanitized = sanitizeVisualFlowDefinition(definition);
  return sanitized.flows.find((flow) => flow.steps.some((step) => step.id === stepId)) || null;
}

export function buildVisualFlowFingerprint(rawScript: string | null | undefined): string {
  const extracted = extractVisualFlowMetadata(rawScript);
  const canonical = JSON.stringify({
    cleanScript: extracted.cleanScript,
    definition: extracted.definition ? sanitizeVisualFlowDefinition(extracted.definition) : null,
  });

  let hash = 5381;
  for (let index = 0; index < canonical.length; index += 1) {
    hash = ((hash << 5) + hash) ^ canonical.charCodeAt(index);
  }

  return `vf-${(hash >>> 0).toString(36)}`;
}

function describeMediaAction(action: VisualFlowMediaAction, index: number): string {
  if (action.type === "send_text") {
    return `Acao ${index + 1}: texto "${action.text}"`;
  }

  if (action.type === "send_media_url") {
    const parts = [`Acao ${index + 1}: ${action.media_type}`];
    if (action.media_name) parts.push(`nome ${action.media_name}`);
    if (action.caption) parts.push(`legenda "${action.caption}"`);
    return parts.join(", ");
  }

  if (action.type === "send_media") {
    return `Acao ${index + 1}: midia da biblioteca "${action.media_name}"`;
  }

  return `Acao ${index + 1}`;
}

function describeTarget(stepId: string | null | undefined, steps: VisualFlowStep[]): string {
  if (!stepId) return "encerre o fluxo";

  const target = steps.find((step) => step.id === stepId);
  if (!target) return `siga para a etapa ${stepId}`;

  return `siga para a etapa "${target.title}" (${target.id})`;
}

export function buildFlowScriptFromVisualDefinition(definition: VisualFlowDefinition): string {
  const sanitizedDefinition = sanitizeVisualFlowDefinition(definition);
  const lines: string[] = [
    "FLUXO VISUAL DO ATENDIMENTO",
    "",
    "Siga os fluxos abaixo como um orquestrador inteligente.",
    "Interprete a resposta do cliente de forma semantica, considerando contexto, intencao, memoria recente e objetivo da conversa.",
    "Nao use regex, palavra exata ou menu numerico como unica forma de decidir. Entenda o sentido da resposta antes de escolher o fluxo e a proxima etapa.",
    "Se houver uma primeira saudacao configurada na aba Info, ela acontece antes destes fluxos.",
    "",
    "REGRAS DE EXECUCAO:",
    "- Escolha primeiro o fluxo mais aderente ao contexto real da mensagem.",
    "- Dentro do fluxo escolhido, siga a etapa atual sem pular condicoes.",
    "- Quando uma etapa tiver condicoes, escolha somente a rota que melhor representar a intencao real do cliente.",
    "- Se nenhuma condicao combinar, use o fallback configurado para a etapa atual.",
  ];

  sanitizedDefinition.flows.forEach((flow, flowIndex) => {
    lines.push("");
    lines.push(`FLUXO ${flowIndex + 1}: ${flow.name} (${flow.id})`);
    lines.push(`Modo de entrada: ${flow.triggerMode}`);
    lines.push(`Descricao interna: ${flow.description || "sem descricao"}`);
    lines.push(`Quando usar: ${flow.triggerCondition}`);
    lines.push(`Acao final padrao: ${flow.defaultFinalAction || "continue_ai"}`);

    if (flow.steps.length === 0) {
      lines.push("Sem etapas configuradas.");
      return;
    }

    flow.steps.forEach((step, index) => {
      lines.push("");
      lines.push(`ETAPA ${flowIndex + 1}.${index + 1}: ${step.title} (${step.id})`);
      lines.push(`Tipo: ${step.type}`);
      lines.push(`Acao final da etapa: ${step.finalAction || "nenhuma"}`);

      if (step.type === "question") {
        lines.push(`Pergunta ao cliente: "${step.message}"`);
        lines.push("Depois de receber a resposta, interprete semanticamente e siga uma unica rota:");

        if (step.branches && step.branches.length > 0) {
          step.branches.forEach((branch, branchIndex) => {
            const prefix = branch.label ? branch.label : `Condicao ${branchIndex + 1}`;
            const condition = branch.condition || "condicao nao descrita";
            lines.push(
              `- ${prefix}: se a intencao, contexto ou sentido da resposta corresponder a "${condition}", ${describeTarget(branch.nextStepId, flow.steps)}.`
            );
          });
        } else {
          lines.push("- Nenhuma condicao foi configurada. Permaneca nesta etapa ate que o operador ajuste o fluxo.");
        }

        if (step.fallbackStepId || step.fallbackMessage) {
          const fallbackParts: string[] = ["Fallback:"];
          if (step.fallbackMessage) {
            fallbackParts.push(`responda "${step.fallbackMessage}"`);
          }
          if (step.fallbackStepId) {
            fallbackParts.push(describeTarget(step.fallbackStepId, flow.steps));
          } else {
            fallbackParts.push("permanece nesta etapa");
          }
          lines.push(`- ${fallbackParts.join(", ")}.`);
        } else {
          lines.push("- Fallback: se nada combinar, faca uma repescagem curta e permaneça nesta etapa.");
        }

        return;
      }

      if (step.mediaActions && step.mediaActions.length > 0) {
        lines.push("Midias ou mensagens associadas a esta etapa:");
        step.mediaActions.forEach((action, actionIndex) => {
          lines.push(`- ${describeMediaAction(action, actionIndex)}`);
        });
      }

      if (step.message) {
        lines.push(`Mensagem obrigatoria: "${step.message}"`);
      }

      if (step.type === "handoff") {
        lines.push("Depois disso, transfira o atendimento para um humano e encerre este fluxo.");
        return;
      }

      if (step.type === "end") {
        lines.push("Depois disso, finalize o fluxo.");
        return;
      }

      lines.push(`Depois disso, ${describeTarget(step.nextStepId, flow.steps)}.`);
    });
  });

  const manualNotes = ensureString(sanitizedDefinition.manualNotes).trim();
  if (manualNotes) {
    lines.push("");
    lines.push("NOTAS ADICIONAIS DO OPERADOR:");
    lines.push(manualNotes);
  }

  return lines.join("\n").trim();
}
