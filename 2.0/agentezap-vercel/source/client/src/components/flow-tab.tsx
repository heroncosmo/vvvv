import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlignLeft,
  Bot,
  Bell,
  Brain,
  Clock,
  CreditCard,
  FileText,
  GitBranch,
  GripVertical,
  ImageIcon,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  Save,
  Sparkles,
  Square,
  Tags,
  Trash2,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { FlowActionNode, FlowMessageNode, FlowTriggerNode } from "@/components/flow-reference-nodes";
import {
  appendVisualFlowMetadata,
  buildFlowScriptFromVisualDefinition,
  createEmptyVisualFlowDefinition,
  createEmptyVisualFlowRoute,
  extractVisualFlowMetadata,
  hasVisualFlowContent,
  sanitizeVisualFlowDefinition,
  type VisualFlowBranch,
  type VisualFlowDefinition,
  type VisualFlowFinalAction,
  type VisualFlowMediaAction,
  type VisualFlowRoute,
  type VisualFlowStep,
  type VisualFlowStepType,
  type VisualFlowTriggerMode,
} from "@shared/flowVisualBuilder";

interface FlowConfig {
  flowScript: string | null;
  flowModeActive: boolean;
}

interface OpeningItem {
  id: string;
  type: string;
  isGreeting?: boolean;
}

interface FlowTabProps {
  className?: string;
  greetingEnabled?: boolean;
  greetingVariation?: boolean;
  openingFlowItems?: OpeningItem[];
  draggingGreetingFlowItemId?: string | null;
  uploadingGreetingFlowItemId?: string | null;
  onGreetingEnabledChange?: (value: boolean) => void;
  onGreetingVariationChange?: (value: boolean) => void;
  onDraggingGreetingFlowItemChange?: (value: string | null) => void;
  onAddGreetingMainTextItem?: () => void;
  onAddGreetingTextItem?: () => void;
  onAddGreetingMediaItem?: (mediaType: FlowMediaType) => void;
  onUpdateGreetingFlowItem?: (itemId: string, nextItem: unknown) => void;
  onRemoveGreetingFlowItem?: (itemId: string) => void;
  onMoveGreetingFlowItem?: (itemId: string, direction: "up" | "down") => void;
  onReorderGreetingFlowItems?: (sourceId: string, targetId: string) => void;
  onSetGreetingPrimaryItem?: (itemId: string) => void;
  onUploadGreetingMedia?: (itemId: string, file?: File | null) => Promise<void> | void;
  onRemoveGreetingMedia?: (itemId: string) => void;
  onOpenInfo?: () => void;
}

type FlowEditorDefinition = VisualFlowDefinition;
type FlowEditorStep = VisualFlowStep;
type FlowMediaType = "audio" | "image" | "video" | "document";
type FlowBlockType = "trigger" | "message" | "question" | "media" | "handoff" | "end" | "action";
type InspectorTarget = { kind: "trigger" } | { kind: "step"; stepId: string } | null;
type SimulatorMediaType = "audio" | "image" | "video" | "document";

type SimulatorMessage = {
  id: string;
  role: "user" | "agent";
  message: string;
  time: string;
  mediaUrl?: string;
  mediaType?: SimulatorMediaType;
};

type NodePositionMap = Record<string, Record<string, { x: number; y: number }>>;

const nodeTypes = {
  trigger: FlowTriggerNode,
  message: FlowMessageNode,
  action: FlowActionNode,
};

const FINAL_ACTIONS: Array<{ value: VisualFlowFinalAction; label: string }> = [
  { value: "continue_ai", label: "Encerrar fluxo" },
  { value: "handoff", label: "Transferir para humano" },
  { value: "end", label: "Encerrar" },
];

const STEP_TYPES: Array<{ value: VisualFlowStepType; label: string }> = [
  { value: "message", label: "Mensagem" },
  { value: "question", label: "Condição" },
  { value: "media", label: "Mídia" },
  { value: "handoff", label: "Ação humana" },
  { value: "end", label: "Fim do fluxo" },
];

const TRIGGER_OPTIONS: Array<{
  value: VisualFlowTriggerMode;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  { value: "first_message", label: "Primeira mensagem", shortLabel: "Início", description: "Só entra no começo da conversa." },
  { value: "any_message", label: "Qualquer mensagem", shortLabel: "A qualquer momento", description: "Pode assumir a conversa mesmo no meio do atendimento." },
  { value: "default", label: "Fluxo padrão", shortLabel: "Padrão", description: "Fallback quando nenhum fluxo mais específico combinar." },
];

const PRESET_OPTIONS = [
  { id: "blank", title: "Gatilho de Entrada", description: "Cria um novo fluxo em branco com trigger configurável.", group: "Eventos", icon: Zap, blockType: "trigger" as const },
  { id: "message", title: "Enviar Mensagem", description: "Texto, imagem, vídeo, áudio ou arquivo.", group: "Mensagens", icon: MessageSquare, blockType: "message" as const },
  { id: "action", title: "Executar Ação", description: "Encaminhamento humano ou finalização guiada.", group: "Automação", icon: Workflow, blockType: "action" as const },
] satisfies ReadonlyArray<{
  id: string;
  title: string;
  description: string;
  group: "Eventos" | "Mensagens" | "Automação";
  icon: typeof Zap;
  blockType: FlowBlockType;
}>;

const LEONA_STYLE_PRESET_OPTIONS = [
  { id: "blank", title: "Gatilho de Entrada", description: "Define quando este fluxo assume a conversa.", group: "Eventos", icon: Zap, blockType: "trigger" as const },
  { id: "message", title: "Mensagem", description: "Texto enviado ao cliente, com suporte a bolhas.", group: "Mensagens", icon: MessageSquare, blockType: "message" as const },
  { id: "media", title: "Midia", description: "Imagem, audio, video ou documento do atendimento.", group: "Mensagens", icon: ImageIcon, blockType: "media" as const },
  { id: "menu", title: "Menu", description: "Lista de opcoes para o cliente escolher.", group: "Mensagens", icon: AlignLeft, blockType: "question" as const },
  { id: "carousel", title: "Carrossel", description: "Sequencia de opcoes, produtos ou midias.", group: "Mensagens", icon: Square, blockType: "media" as const },
  { id: "wait", title: "Aguardar Resposta", description: "Faz uma pergunta e ramifica pela resposta.", group: "Logica", icon: GitBranch, blockType: "question" as const },
  { id: "condition", title: "Condicional", description: "Separa caminhos por intencao, texto ou contexto.", group: "Logica", icon: Workflow, blockType: "question" as const },
  { id: "ai-block", title: "Bloco de IA", description: "Interpreta uma resposta dentro do roteiro.", group: "Logica", icon: Brain, blockType: "question" as const },
  { id: "delay", title: "Delay / Pausa", description: "Programa uma pausa antes da proxima acao.", group: "Automacao", icon: Clock, blockType: "media" as const },
  { id: "notification", title: "Notificacao", description: "Orienta quando avisar o time ou assumir humano.", group: "Automacao", icon: Bell, blockType: "message" as const },
  { id: "tags", title: "Etiquetas", description: "Registra marcadores operacionais do fluxo.", group: "Automacao", icon: Tags, blockType: "message" as const },
  { id: "chat-control", title: "Controlador de Chat", description: "Pausa, transfere ou encerra a conversa.", group: "Automacao", icon: MessageSquare, blockType: "handoff" as const },
  { id: "handoff", title: "Atendente", description: "Transfere para humano e para o fluxo.", group: "Automacao", icon: Workflow, blockType: "handoff" as const },
  { id: "pix", title: "Botao PIX", description: "Mensagem de cobranca, chave PIX e comprovante.", group: "Pagamentos", icon: CreditCard, blockType: "message" as const },
] satisfies ReadonlyArray<{
  id: string;
  title: string;
  description: string;
  group: "Eventos" | "Mensagens" | "Logica" | "Automacao" | "Pagamentos";
  icon: typeof Zap;
  blockType: FlowBlockType;
}>;

const LEONA_STYLE_PRESET_GROUPS: Array<(typeof LEONA_STYLE_PRESET_OPTIONS)[number]["group"]> = [
  "Eventos",
  "Mensagens",
  "Logica",
  "Automacao",
  "Pagamentos",
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeBranch(overrides: Partial<VisualFlowBranch> = {}): VisualFlowBranch {
  return {
    id: overrides.id || makeId("branch"),
    label: overrides.label || "",
    condition: overrides.condition || "",
    nextStepId: overrides.nextStepId || null,
  };
}

function makeStep(type: VisualFlowStepType, overrides: Partial<VisualFlowStep> = {}): FlowEditorStep {
  if (type === "question") {
    return {
      id: overrides.id || makeId("step"),
      type,
      title: overrides.title || "Condição",
      message: overrides.message || "",
      branches: overrides.branches || [makeBranch(), makeBranch()],
      fallbackStepId: overrides.fallbackStepId || null,
      fallbackMessage: overrides.fallbackMessage || "",
      finalAction: overrides.finalAction || null,
    };
  }

  if (type === "media") {
    return {
      id: overrides.id || makeId("step"),
      type,
      title: overrides.title || "Enviar mídia",
      message: overrides.message || "",
      mediaActions: overrides.mediaActions || [],
      nextStepId: overrides.nextStepId || null,
      finalAction: overrides.finalAction || null,
    };
  }

  return {
    id: overrides.id || makeId("step"),
    type,
    title: overrides.title || (type === "handoff" ? "Executar ação" : type === "end" ? "Finalizar fluxo" : "Enviar mensagem"),
    message:
      overrides.message ||
      (type === "handoff"
        ? "Vou encaminhar você para uma pessoa do time agora."
        : type === "end"
          ? "Perfeito. Se precisar de mais alguma coisa, estou por aqui."
          : ""),
    nextStepId: overrides.nextStepId || null,
    finalAction: overrides.finalAction || (type === "handoff" ? "handoff" : type === "end" ? "end" : null),
  };
}

function makePresetStep(presetId: string, fallbackType: VisualFlowStepType): FlowEditorStep {
  if (presetId === "wait") {
    return makeStep("question", {
      title: "Aguardar Resposta",
      message: "Qual opcao ou resposta voce quer registrar aqui?",
      branches: [
        makeBranch({ label: "Resposta positiva", condition: "cliente confirmou, aceitou ou respondeu sim" }),
        makeBranch({ label: "Outra resposta", condition: "cliente respondeu diferente, ficou em duvida ou recusou" }),
      ],
      fallbackMessage: "Me confirme para eu seguir pelo caminho certo.",
    });
  }

  if (presetId === "condition") {
    return makeStep("question", {
      title: "Condicional",
      message: "Vou avaliar a resposta e seguir pelo caminho adequado.",
      branches: [
        makeBranch({ label: "Condicao atendida", condition: "a resposta do cliente contem a intencao esperada" }),
        makeBranch({ label: "Condicao nao atendida", condition: "a resposta do cliente nao contem a intencao esperada" }),
      ],
    });
  }

  if (presetId === "ai-block") {
    return makeStep("question", {
      title: "Bloco de IA",
      message: "Analise a resposta do cliente dentro deste roteiro e escolha o proximo caminho.",
      branches: [
        makeBranch({ label: "Aprovado", condition: "a IA entendeu que pode seguir" }),
        makeBranch({ label: "Revisar", condition: "a IA entendeu que precisa pedir mais informacao" }),
      ],
    });
  }

  if (presetId === "menu") {
    return makeStep("question", {
      title: "Menu",
      message: "Escolha uma opcao:\n1. Comprar\n2. Tirar duvida\n3. Falar com atendente",
      branches: [
        makeBranch({ label: "Comprar", condition: "cliente escolheu comprar, opcao 1 ou quer pagamento" }),
        makeBranch({ label: "Duvida", condition: "cliente escolheu duvida, opcao 2 ou fez pergunta" }),
        makeBranch({ label: "Atendente", condition: "cliente escolheu atendente, opcao 3 ou pediu humano" }),
      ],
    });
  }

  if (presetId === "carousel") {
    return makeStep("media", {
      title: "Carrossel",
      message: "Mostre as principais opcoes ao cliente e conecte o proximo bloco pela resposta.",
      mediaActions: [
        { type: "send_text", text: "Veja as opcoes disponiveis e me diga qual voce prefere." } as VisualFlowMediaAction,
      ],
    });
  }

  if (presetId === "chat-control") {
    return makeStep("handoff", {
      title: "Controlador de Chat",
      message: "Conversa transferida para atendimento humano.",
      finalAction: "handoff",
    });
  }

  if (presetId === "delay") {
    return makeStep("media", {
      title: "Delay / Pausa",
      message: "",
      mediaActions: [{ type: "send_text", text: "Continuando o atendimento...", delay_seconds: 30 } as VisualFlowMediaAction],
    });
  }

  if (presetId === "notification") {
    return makeStep("message", {
      title: "Notificacao",
      message: "[Notificacao interna] Avise o time quando o cliente chegar nesta etapa.",
    });
  }

  if (presetId === "tags") {
    return makeStep("message", {
      title: "Etiquetas",
      message: "[Etiqueta] Defina aqui o marcador operacional deste contato.",
    });
  }

  if (presetId === "pix") {
    return makeStep("message", {
      title: "Botao PIX",
      message: "Para seguir, faca o pagamento via PIX e envie o comprovante aqui. Chave PIX: informe sua chave.",
    });
  }

  if (presetId === "media") {
    return makeStep("media", { title: "Enviar midia" });
  }

  if (presetId === "handoff") {
    return makeStep("handoff", { title: "Transferir para atendente" });
  }

  return makeStep(fallbackType);
}

function createPresetRoute(presetId: string, isDefault: boolean, index: number): VisualFlowRoute {
  if (presetId === "sales") {
    return createEmptyVisualFlowRoute({
      name: isDefault ? "Fluxo de vendas" : `Fluxo de vendas ${index}`,
      description: "Preço, catálogo, objeção e encaminhamento comercial.",
      triggerMode: isDefault ? "default" : "any_message",
      triggerCondition: "Use este fluxo quando o cliente quiser preço, orçamento, catálogo, plano, produto ou comparação.",
      steps: [
        makeStep("message", { title: "Abrir conversa", message: "Perfeito. Posso te ajudar com preços, opções e próximos passos.", nextStepId: "ask-sales-intent" }),
        {
          id: "ask-sales-intent",
          type: "question",
          title: "Descobrir intenção",
          message: "Você quer saber preço, ver opções ou falar com uma pessoa do time?",
          branches: [
            makeBranch({ label: "Preço", condition: "cliente quer preço, valor, orçamento ou custo", nextStepId: "send-price" }),
            makeBranch({ label: "Opções", condition: "cliente quer catálogo, produto, cardápio ou plano", nextStepId: "show-options" }),
            makeBranch({ label: "Humano", condition: "cliente quer vendedor, atendente ou especialista", nextStepId: "handoff-sales" }),
          ],
          fallbackStepId: null,
          fallbackMessage: "Me diga se você quer preço, opções ou atendimento humano.",
          finalAction: null,
        },
        makeStep("message", { id: "send-price", title: "Responder preço", message: "Posso te passar os valores e também te orientar sobre a melhor opção." }),
        makeStep("message", { id: "show-options", title: "Mostrar opções", message: "Vou te mostrar as opções mais aderentes ao que você procura." }),
        makeStep("handoff", { id: "handoff-sales", title: "Transferir para vendas", message: "Vou chamar uma pessoa da equipe para continuar com você agora.", finalAction: "handoff" }),
      ],
    });
  }

  if (presetId === "schedule") {
    return createEmptyVisualFlowRoute({
      name: isDefault ? "Fluxo de agendamento" : `Fluxo de agendamento ${index}`,
      description: "Organiza marcação, remarcação e recepção humana.",
      triggerMode: isDefault ? "default" : "any_message",
      triggerCondition: "Use este fluxo quando o cliente quiser agendar, remarcar, reservar horário ou consulta.",
      steps: [
        makeStep("message", { title: "Receber pedido", message: "Claro. Vou te ajudar a organizar o agendamento.", nextStepId: "ask-schedule-intent" }),
        {
          id: "ask-schedule-intent",
          type: "question",
          title: "Entender pedido",
          message: "Você quer agendar, remarcar ou falar com uma pessoa do time?",
          branches: [
            makeBranch({ label: "Agendar", condition: "cliente quer marcar, reservar ou iniciar atendimento", nextStepId: "collect-preferences" }),
            makeBranch({ label: "Remarcar", condition: "cliente quer remarcar, trocar dia ou mudar horário", nextStepId: "collect-preferences" }),
            makeBranch({ label: "Humano", condition: "cliente quer recepção, agenda ou atendimento humano", nextStepId: "handoff-schedule" }),
          ],
          fallbackStepId: null,
          fallbackMessage: "Me diga se quer agendar, remarcar ou falar com uma pessoa do time.",
          finalAction: null,
        },
        makeStep("message", { id: "collect-preferences", title: "Coletar preferência", message: "Me diga qual serviço, dia ou período você prefere." }),
        makeStep("handoff", { id: "handoff-schedule", title: "Transferir agenda", message: "Vou encaminhar seu atendimento para confirmar a agenda com você.", finalAction: "handoff" }),
      ],
    });
  }

  if (presetId === "support") {
    return createEmptyVisualFlowRoute({
      name: isDefault ? "Fluxo de suporte" : `Fluxo de suporte ${index}`,
      description: "Triagem semântica de dúvida, urgência e atendimento humano.",
      triggerMode: isDefault ? "default" : "any_message",
      triggerCondition: "Use este fluxo quando o cliente trouxer erro, dúvida operacional, suporte ou pedido de ajuda.",
      steps: [
        makeStep("message", { title: "Acolher problema", message: "Entendi. Vou organizar seu atendimento para resolver isso sem perder contexto.", nextStepId: "ask-support-kind" }),
        {
          id: "ask-support-kind",
          type: "question",
          title: "Classificar suporte",
          message: "É uma dúvida simples, um problema urgente ou você prefere falar com alguém agora?",
          branches: [
            makeBranch({ label: "Dúvida", condition: "cliente quer orientação, passo a passo ou tirar uma dúvida", nextStepId: "faq-step" }),
            makeBranch({ label: "Urgente", condition: "cliente relata erro, falha, bloqueio, urgência ou indisponibilidade", nextStepId: "handoff-support" }),
            makeBranch({ label: "Humano", condition: "cliente quer atendimento humano imediato", nextStepId: "handoff-support" }),
          ],
          fallbackStepId: null,
          fallbackMessage: "Me diga se é uma dúvida simples ou se você precisa de atendimento humano agora.",
          finalAction: null,
        },
        makeStep("message", { id: "faq-step", title: "Responder suporte leve", message: "Posso te orientar aqui mesmo. Me diga com mais contexto o que você quer resolver." }),
        makeStep("handoff", { id: "handoff-support", title: "Transferir suporte", message: "Vou encaminhar seu caso para atendimento humano com a prioridade adequada.", finalAction: "handoff" }),
      ],
    });
  }

  return createEmptyVisualFlowRoute({
    name: isDefault ? "Fluxo principal" : `Fluxo ${index}`,
    description: "Fluxo criado manualmente.",
    triggerMode: isDefault ? "default" : "any_message",
  });
}

function loadFlowState(flowScript: string | null) {
  const extracted = extractVisualFlowMetadata(flowScript || "");
  if (extracted.definition) {
    const flow = sanitizeVisualFlowDefinition(extracted.definition);
    return { flow, notes: flow.manualNotes || "", importedLegacy: false };
  }
  return { flow: createEmptyVisualFlowDefinition(), notes: extracted.cleanScript, importedLegacy: extracted.cleanScript.trim().length > 0 };
}

function getTriggerMeta(triggerMode: VisualFlowTriggerMode) {
  return TRIGGER_OPTIONS.find((item) => item.value === triggerMode) || TRIGGER_OPTIONS[2];
}

function getTriggerPreview(route: VisualFlowRoute) {
  if (route.triggerMode === "first_message") return route.triggerCondition || "Olá";
  if (route.triggerMode === "default") return "Nenhum fluxo mais específico";
  return route.triggerCondition || "Qualquer mensagem aderente";
}

function summarizeStep(step: FlowEditorStep) {
  if (step.type === "question") return `${step.branches?.length || 0} rota(s) semânticas`;
  if (step.type === "media") {
    const mediaAction = step.mediaActions?.find((action) => action.type === "send_media_url");
    return mediaAction?.file_name || mediaAction?.media_name || "Mídia ainda não enviada";
  }
  return step.message.trim() || FINAL_ACTIONS.find((item) => item.value === step.finalAction)?.label || "Sem resumo";
}

function getMediaAccept(mediaType?: string) {
  if (mediaType === "audio") return "audio/*,.ogg,.opus,.mp3,.m4a,.wav";
  if (mediaType === "video") return "video/*,.mp4,.webm,.mov";
  if (mediaType === "document") return ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";
  return "image/*,.jpg,.jpeg,.png,.gif,.webp";
}

function getTriggerNodeId(routeId: string) {
  return `trigger-${routeId}`;
}

function normalizeSimulatorMediaType(mediaType?: string, mediaUrl?: string): SimulatorMediaType {
  const normalized = String(mediaType || "").toLowerCase().trim();
  if (normalized === "audio" || normalized === "video" || normalized === "document") return normalized;
  if (normalized === "image") return "image";
  const url = String(mediaUrl || "").toLowerCase();
  if (url.endsWith(".mp3") || url.endsWith(".wav") || url.endsWith(".ogg") || url.endsWith(".m4a")) return "audio";
  if (url.endsWith(".mp4") || url.endsWith(".mov") || url.endsWith(".webm")) return "video";
  if (url.endsWith(".pdf") || url.endsWith(".doc") || url.endsWith(".docx")) return "document";
  return "image";
}

function createBlankDefinitionWithNotes(notes: string) {
  return sanitizeVisualFlowDefinition({ ...createEmptyVisualFlowDefinition(), manualNotes: notes });
}

function morphStepType(step: FlowEditorStep, nextType: VisualFlowStepType): FlowEditorStep {
  if (nextType === step.type) return step;
  if (nextType === "question") {
    return {
      ...makeStep("question"),
      id: step.id,
      title: step.title,
      message: step.message,
      branches: step.branches && step.branches.length > 0 ? step.branches : [makeBranch(), makeBranch()],
      fallbackStepId: step.fallbackStepId || null,
      fallbackMessage: step.fallbackMessage || "",
    };
  }
  if (nextType === "media") {
    return { ...makeStep("media"), id: step.id, title: step.title, message: step.message, nextStepId: step.nextStepId || null, mediaActions: step.mediaActions || [], finalAction: step.finalAction || null };
  }
  return { ...makeStep(nextType), id: step.id, title: step.title, message: step.message, nextStepId: step.nextStepId || null, finalAction: step.finalAction || (nextType === "handoff" ? "handoff" : nextType === "end" ? "end" : null) };
}

function buildCanvasNodes(route: VisualFlowRoute | null, positions: Record<string, { x: number; y: number }>): Node[] {
  if (!route) return [];
  const triggerNodeId = getTriggerNodeId(route.id);
  const triggerMeta = getTriggerMeta(route.triggerMode);
  const nodes: Node[] = [
    {
      id: triggerNodeId,
      type: "trigger",
      position: positions[triggerNodeId] || { x: 320, y: 90 },
      data: { title: "Gatilho de Entrada", subtitle: triggerMeta.shortLabel, triggerLabel: getTriggerPreview(route), modeLabel: triggerMeta.label },
    },
  ];

  route.steps.forEach((step, index) => {
    const basePosition = positions[step.id] || { x: 320, y: 320 + index * 250 };
    if (step.type === "handoff" || step.type === "end") {
      nodes.push({
        id: step.id,
        type: "action",
        position: basePosition,
        data: {
          title: step.type === "handoff" ? "Executar Ação" : "Finalizar Fluxo",
          subtitle: step.title || (step.type === "handoff" ? "Transferência" : "Encerramento"),
          body: summarizeStep(step),
          variant: step.type,
          terminal: !step.nextStepId,
        },
      });
      return;
    }

    nodes.push({
      id: step.id,
      type: "message",
      position: basePosition,
      data: {
        title: step.type === "question" ? "Condição" : step.type === "media" ? "Enviar Mídia" : "Enviar Mensagem",
        subtitle: step.title || "Bloco",
        body: step.message || summarizeStep(step),
        variant: step.type === "question" ? "question" : step.type === "media" ? "media" : "message",
        footerLabel: step.type === "question" ? "Rotas semânticas" : step.type === "media" ? "WhatsApp" : "Mensagem do agente",
        handles: step.type === "question"
          ? [
              ...(step.branches || []).map((branch, indexHandle) => ({ id: `branch:${branch.id}`, label: branch.label || `Saída ${indexHandle + 1}` })),
              { id: "fallback", label: "Fallback" },
            ]
          : undefined,
      },
    });
  });

  return nodes;
}

function buildCanvasEdges(route: VisualFlowRoute | null): Edge[] {
  if (!route) return [];
  const edges: Edge[] = [];
  const triggerNodeId = getTriggerNodeId(route.id);
  const firstStep = route.steps[0];

  if (firstStep) {
    edges.push({
      id: `${triggerNodeId}-${firstStep.id}`,
      source: triggerNodeId,
      sourceHandle: "route-entry",
      target: firstStep.id,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed" },
      style: { stroke: "#7c3aed", strokeWidth: 2.5, strokeDasharray: "6 6" },
    });
  }

  route.steps.forEach((step) => {
    if (step.type === "question") {
      (step.branches || []).forEach((branch, index) => {
        if (!branch.nextStepId) return;
        edges.push({
          id: `${step.id}-branch-${branch.id}`,
          source: step.id,
          sourceHandle: `branch:${branch.id}`,
          target: branch.nextStepId,
          label: branch.label || `Rota ${index + 1}`,
          markerEnd: { type: MarkerType.ArrowClosed, color: "#8b5cf6" },
          style: { stroke: "#8b5cf6", strokeWidth: 2.5 },
          labelStyle: { fill: "#64748b", fontWeight: 700, fontSize: 11 },
          labelBgStyle: { fill: "#ffffff", fillOpacity: 0.98 },
          labelBgBorderRadius: 12,
          labelBgPadding: [8, 4],
        });
      });

      if (step.fallbackStepId) {
        edges.push({
          id: `${step.id}-fallback`,
          source: step.id,
          sourceHandle: "fallback",
          target: step.fallbackStepId,
          label: "Fallback",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
          style: { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "4 4" },
          labelStyle: { fill: "#b45309", fontWeight: 700, fontSize: 11 },
          labelBgStyle: { fill: "#fff7ed", fillOpacity: 1 },
          labelBgBorderRadius: 12,
          labelBgPadding: [8, 4],
        });
      }
      return;
    }

    if (!step.nextStepId) return;
    edges.push({
      id: `${step.id}-${step.nextStepId}`,
      source: step.id,
      sourceHandle: "next",
      target: step.nextStepId,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed" },
      style: { stroke: "#7c3aed", strokeWidth: 2.5 },
    });
  });

  return edges;
}

function FlowTabInner({
  className,
  greetingEnabled = false,
  greetingVariation = false,
  openingFlowItems = [],
  onGreetingEnabledChange,
  onGreetingVariationChange,
  onAddGreetingMainTextItem,
  onAddGreetingTextItem,
  onAddGreetingMediaItem,
  onOpenInfo,
}: FlowTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reactFlow = useReactFlow();

  const [flowModeActive, setFlowModeActive] = useState(false);
  const [flow, setFlow] = useState<FlowEditorDefinition>(createEmptyVisualFlowDefinition());
  const [notes, setNotes] = useState("");
  const [importedLegacy, setImportedLegacy] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget>(null);
  const [uploadingStepMediaId, setUploadingStepMediaId] = useState<string | null>(null);
  const [positionsByFlow, setPositionsByFlow] = useState<NodePositionMap>({});
  const [showRuntimePrompt, setShowRuntimePrompt] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [simulatorMessages, setSimulatorMessages] = useState<SimulatorMessage[]>([]);
  const [simulatorInput, setSimulatorInput] = useState("");
  const [simulatorSentMedias, setSimulatorSentMedias] = useState<string[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  const simulatorEpochRef = useRef(0);
  const simulatorSessionIdRef = useRef(makeId("flow-sim"));

  const { data: flowConfig, isLoading } = useQuery<FlowConfig>({
    queryKey: ["/api/agent/flow"],
    queryFn: async () => (await apiRequest("GET", "/api/agent/flow")).json(),
  });

  useEffect(() => {
    if (!flowConfig) return;
    const loaded = loadFlowState(flowConfig.flowScript);
    setFlowModeActive(flowConfig.flowModeActive || false);
    setFlow(loaded.flow);
    setNotes(loaded.notes);
    setImportedLegacy(loaded.importedLegacy);
    setSelectedFlowId(loaded.flow.flows[0]?.id || null);
    setInspectorTarget(null);
    setHasChanges(false);
  }, [flowConfig]);

  useEffect(() => {
    if (!selectedFlowId && flow.flows[0]?.id) {
      setSelectedFlowId(flow.flows[0].id);
    }
  }, [flow.flows, selectedFlowId]);

  const selectedFlow = useMemo(
    () => flow.flows.find((route) => route.id === selectedFlowId) || flow.flows[0] || null,
    [flow, selectedFlowId],
  );

  const selectedStep = useMemo(() => {
    if (!selectedFlow || !inspectorTarget || inspectorTarget.kind !== "step") return null;
    return selectedFlow.steps.find((step) => step.id === inspectorTarget.stepId) || null;
  }, [selectedFlow, inspectorTarget]);

  useEffect(() => {
    if (!selectedFlow) {
      setInspectorTarget(null);
      return;
    }
    if (inspectorTarget?.kind === "step" && !selectedFlow.steps.some((step) => step.id === inspectorTarget.stepId)) {
      setInspectorTarget(null);
    }
  }, [inspectorTarget, selectedFlow]);

  const persistedFlow = useMemo(
    () => ({ ...flow, manualNotes: notes }) satisfies FlowEditorDefinition,
    [flow, notes],
  );
  const hasConfiguredFlow = hasVisualFlowContent(flow);
  const cleanFlowScript = hasConfiguredFlow ? buildFlowScriptFromVisualDefinition(persistedFlow) : notes.trim();
  const persistedFlowScript = hasConfiguredFlow ? appendVisualFlowMetadata(cleanFlowScript, persistedFlow) : cleanFlowScript;
  const currentPositions = selectedFlow ? positionsByFlow[selectedFlow.id] || {} : {};

  const saveMutation = useMutation({
    mutationFn: async (payload: { flowScript: string; flowModeActive: boolean }) =>
      (await apiRequest("POST", "/api/agent/flow", payload)).json(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/agent/flow"] });
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Falha ao salvar o fluxo.",
        variant: "destructive",
      });
    },
  });

  const markDirty = useCallback(() => setHasChanges(true), []);

  const updateDefinition = useCallback((updater: (current: FlowEditorDefinition) => FlowEditorDefinition) => {
    setFlow((current) => sanitizeVisualFlowDefinition(updater(current)));
    markDirty();
  }, [markDirty]);

  const updateSelectedRoute = useCallback((updater: (route: VisualFlowRoute) => VisualFlowRoute) => {
    if (!selectedFlow) return;
    updateDefinition((current) => ({
      ...current,
      flows: current.flows.map((route) => (route.id === selectedFlow.id ? updater(route) : route)),
    }));
  }, [selectedFlow, updateDefinition]);

  const updateSelectedStep = useCallback((stepId: string, updater: (step: FlowEditorStep) => FlowEditorStep) => {
    updateSelectedRoute((route) => ({
      ...route,
      steps: route.steps.map((step) => (step.id === stepId ? updater(step) : step)),
    }));
  }, [updateSelectedRoute]);

  const persistFlow = useCallback(async (nextActive: boolean, successDescription: string) => {
    if (!cleanFlowScript.trim()) {
      toast({ title: "Fluxo vazio", description: "Monte ao menos um roteiro antes de salvar.", variant: "destructive" });
      return false;
    }
    await saveMutation.mutateAsync({ flowScript: persistedFlowScript, flowModeActive: nextActive });
    setFlowModeActive(nextActive);
    toast({ title: "Fluxo salvo", description: successDescription });
    return true;
  }, [cleanFlowScript, persistedFlowScript, saveMutation, toast]);

  const addRoute = useCallback((presetId: string = "blank") => {
    const route = createPresetRoute(presetId, !flow.flows.some((item) => item.triggerMode === "default"), flow.flows.length + 1);
    updateDefinition((current) => ({ ...current, flows: [...current.flows, route] }));
    setSelectedFlowId(route.id);
    setInspectorTarget({ kind: "trigger" });
  }, [flow.flows, updateDefinition]);

  const clearSelectedFlow = useCallback(() => {
    if (!selectedFlow) return;
    updateSelectedRoute((route) => ({ ...route, steps: [] }));
    setPositionsByFlow((current) => {
      const nextRoutePositions = { ...(current[selectedFlow.id] || {}) };
      Object.keys(nextRoutePositions).forEach((key) => {
        if (!key.startsWith("trigger-")) delete nextRoutePositions[key];
      });
      return { ...current, [selectedFlow.id]: nextRoutePositions };
    });
    setInspectorTarget({ kind: "trigger" });
  }, [selectedFlow, updateSelectedRoute]);

  const removeRoute = useCallback((routeId: string) => {
    if (flow.flows.length <= 1) {
      const nextFlow = createBlankDefinitionWithNotes(notes);
      setFlow(nextFlow);
      setSelectedFlowId(nextFlow.flows[0]?.id || null);
      setInspectorTarget({ kind: "trigger" });
      setHasChanges(true);
      return;
    }
    const nextRoute = flow.flows.find((route) => route.id !== routeId) || null;
    updateDefinition((current) => ({ ...current, flows: current.flows.filter((route) => route.id !== routeId) }));
    setSelectedFlowId(nextRoute?.id || null);
    setInspectorTarget(null);
  }, [flow.flows, notes, updateDefinition]);

  const setTriggerMode = useCallback((routeId: string, triggerMode: VisualFlowTriggerMode) => {
    updateDefinition((current) => ({
      ...current,
      flows: current.flows.map((route) => {
        if (route.id === routeId) {
          const template = createEmptyVisualFlowRoute({ triggerMode });
          return { ...route, triggerMode, triggerCondition: route.triggerCondition.trim() || template.triggerCondition };
        }
        if (triggerMode === "default" && route.triggerMode === "default") {
          return { ...route, triggerMode: "any_message" };
        }
        return route;
      }),
    }));
  }, [updateDefinition]);

  const addStep = useCallback((type: VisualFlowStepType, position?: { x: number; y: number }, presetId?: string) => {
    if (!selectedFlow) return;
    const step = presetId ? makePresetStep(presetId, type) : makeStep(type);
    updateSelectedRoute((route) => {
      const nextSteps = [...route.steps, step];
      const selectedStepId = inspectorTarget?.kind === "step" ? inspectorTarget.stepId : null;
      if (!selectedStepId) return { ...route, steps: nextSteps };
      return {
        ...route,
        steps: nextSteps.map((item) => {
          if (item.id !== selectedStepId) return item;
          if (item.type === "question" || item.type === "handoff" || item.type === "end") return item;
          if (item.nextStepId) return item;
          return { ...item, nextStepId: step.id };
        }),
      };
    });
    if (position && selectedFlow) {
      setPositionsByFlow((current) => ({
        ...current,
        [selectedFlow.id]: { ...(current[selectedFlow.id] || {}), [step.id]: position },
      }));
    }
    setInspectorTarget({ kind: "step", stepId: step.id });
  }, [inspectorTarget, selectedFlow, updateSelectedRoute]);

  const removeStep = useCallback((stepId: string) => {
    if (!selectedFlow) return;
    updateSelectedRoute((route) => ({
      ...route,
      steps: route.steps
        .filter((step) => step.id !== stepId)
        .map((step) => ({
          ...step,
          nextStepId: step.nextStepId === stepId ? null : step.nextStepId,
          branches: (step.branches || []).map((branch) => ({ ...branch, nextStepId: branch.nextStepId === stepId ? null : branch.nextStepId })),
          fallbackStepId: step.fallbackStepId === stepId ? null : step.fallbackStepId,
        })),
    }));
    setPositionsByFlow((current) => {
      const nextRoutePositions = { ...(current[selectedFlow.id] || {}) };
      delete nextRoutePositions[stepId];
      return { ...current, [selectedFlow.id]: nextRoutePositions };
    });
    if (inspectorTarget?.kind === "step" && inspectorTarget.stepId === stepId) {
      setInspectorTarget(null);
    }
  }, [inspectorTarget, selectedFlow, updateSelectedRoute]);

  const handleStepMediaUpload = useCallback(async (stepId: string, file?: File | null) => {
    if (!file) return;
    setUploadingStepMediaId(stepId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const uploadRes = await fetch("/api/agent/media/upload", { method: "POST", body: formData, headers, credentials: "include" });
      if (!uploadRes.ok) throw new Error("Falha ao enviar a mídia do fluxo.");
      const uploadData = await uploadRes.json();
      const inferredMediaType = String(uploadData.mediaType || file.type || "").startsWith("audio")
        ? "audio"
        : String(uploadData.mediaType || file.type || "").startsWith("video")
          ? "video"
          : file.type === "application/pdf"
            ? "document"
            : "image";
      updateSelectedStep(stepId, (current) => ({
        ...current,
        mediaActions: [{
          type: "send_media_url",
          media_url: uploadData.storageUrl,
          media_type: inferredMediaType as "audio" | "image" | "video" | "document",
          file_name: uploadData.fileName || file.name,
        } as VisualFlowMediaAction],
      }));
    } catch (error: any) {
      toast({ title: "Erro no upload", description: error.message || "Não foi possível enviar a mídia.", variant: "destructive" });
    } finally {
      setUploadingStepMediaId(null);
    }
  }, [toast, updateSelectedStep]);

  const handleClearSimulator = useCallback(() => {
    simulatorEpochRef.current += 1;
    simulatorSessionIdRef.current = makeId("flow-sim");
    setSimulatorMessages([]);
    setSimulatorSentMedias([]);
    setSimulatorInput("");
    setIsSimulating(false);
  }, []);

  const toggleFlowMode = useCallback(async (active: boolean) => {
    if (active && cleanFlowScript.trim().length < 10) {
      toast({ title: "Fluxo incompleto", description: "Monte o fluxo antes de ativar.", variant: "destructive" });
      return;
    }
    await persistFlow(active, active ? "Fluxo Chat Bot ativado. A IA automatica deste cliente foi substituida pelo roteiro visual." : "Fluxo Chat Bot desativado. A IA automatica volta a responder normalmente.");
  }, [cleanFlowScript, persistFlow, toast]);

  const sendSimulatorMessage = useCallback(async () => {
    const trimmedText = simulatorInput.trim();
    if (!trimmedText || isSimulating) return;

    const epochAtSend = simulatorEpochRef.current;
    const userTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const userMessage: SimulatorMessage = { id: makeId("sim-user"), role: "user", message: trimmedText, time: userTime };

    setSimulatorMessages((current) => [...current, userMessage]);
    setSimulatorInput("");
    setIsSimulating(true);

    try {
      const historyForBackend = simulatorMessages
        .filter((message) => message.message.trim())
        .map((message) => ({
          role: (message.role === "agent" ? "assistant" : "user") as "assistant" | "user",
          content: message.message,
        }));

      const response = await apiRequest("POST", "/api/agent/test", {
        message: trimmedText,
        history: historyForBackend,
        sentMedias: simulatorSentMedias,
        sessionId: simulatorSessionIdRef.current,
        clearCart: historyForBackend.length === 0,
      });

      const data = await response.json();
      const agentTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

      if (simulatorEpochRef.current !== epochAtSend) return;

      const nextMessages: SimulatorMessage[] = [];
      const splitResponses = Array.isArray(data?.splitResponses) ? data.splitResponses : [];

      if (splitResponses.length > 0) {
        splitResponses.forEach((item: string) => {
          if (!String(item || "").trim()) return;
          nextMessages.push({ id: makeId("sim-agent"), role: "agent", message: String(item), time: agentTime });
        });
      } else if (typeof data?.response === "string" && data.response.trim()) {
        nextMessages.push({ id: makeId("sim-agent"), role: "agent", message: data.response, time: agentTime });
      }

      if (Array.isArray(data?.mediaActions)) {
        data.mediaActions.forEach((action: any) => {
          if (action.type === "send_text" && action.text) {
            nextMessages.push({ id: makeId("sim-agent"), role: "agent", message: action.text, time: agentTime });
          }

          if ((action.type === "send_media" || action.type === "send_media_url") && action.media_url) {
            nextMessages.push({
              id: makeId("sim-media"),
              role: "agent",
              message: action.caption || "",
              time: agentTime,
              mediaUrl: action.media_url,
              mediaType: normalizeSimulatorMediaType(action.media_type, action.media_url),
            });
          }
        });

        const newMediaNames = data.mediaActions
          .filter((action: any) => (action.type === "send_media" || action.type === "send_media_url") && action.media_name)
          .map((action: any) => String(action.media_name).toUpperCase());

        setSimulatorSentMedias((current) => Array.from(new Set([...current, ...newMediaNames])));
      }

      setSimulatorMessages((current) => [...current, ...nextMessages]);
    } catch (error: any) {
      toast({
        title: "Erro no simulador",
        description: error.message || "Não foi possível testar o fluxo agora.",
        variant: "destructive",
      });
    } finally {
      setIsSimulating(false);
    }
  }, [isSimulating, simulatorInput, simulatorMessages, simulatorSentMedias, toast]);

  const handleOpenSimulator = useCallback(async () => {
    const saved = await persistFlow(true, "Fluxo salvo localmente e ativado para teste.");
    if (!saved) return;
    handleClearSimulator();
    setShowSimulator(true);
  }, [handleClearSimulator, persistFlow]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    if (!selectedFlow) return;
    setPositionsByFlow((current) => {
      const routePositions = { ...(current[selectedFlow.id] || {}) };
      let changed = false;

      changes.forEach((change) => {
        if (change.type !== "position" || !change.position) return;
        routePositions[change.id] = change.position;
        changed = true;
      });

      if (!changed) return current;
      return { ...current, [selectedFlow.id]: routePositions };
    });
  }, [selectedFlow]);

  const onConnect = useCallback((connection: Connection) => {
    if (!selectedFlow || !connection.source || !connection.target) return;

    const triggerNodeId = getTriggerNodeId(selectedFlow.id);
    if (connection.source === triggerNodeId) {
      updateSelectedRoute((route) => {
        const targetIndex = route.steps.findIndex((step) => step.id === connection.target);
        if (targetIndex <= 0) return route;
        const nextSteps = [...route.steps];
        const [targetStep] = nextSteps.splice(targetIndex, 1);
        nextSteps.unshift(targetStep);
        return { ...route, steps: nextSteps };
      });
      return;
    }

    updateSelectedRoute((route) => ({
      ...route,
      steps: route.steps.map((step) => {
        if (step.id !== connection.source) return step;

        if (step.type === "question") {
          if (connection.sourceHandle === "fallback") {
            return { ...step, fallbackStepId: connection.target };
          }

          if (connection.sourceHandle?.startsWith("branch:")) {
            const branchId = connection.sourceHandle.split(":")[1];
            return {
              ...step,
              branches: (step.branches || []).map((branch) =>
                branch.id === branchId ? { ...branch, nextStepId: connection.target || null } : branch,
              ),
            };
          }

          return step;
        }

        return { ...step, nextStepId: connection.target };
      }),
    }));
  }, [selectedFlow, updateSelectedRoute]);

  const handleBlockDragStart = useCallback((event: React.DragEvent, blockType: FlowBlockType, presetId?: string) => {
    event.dataTransfer.setData("application/agentezap-flow-block", blockType);
    if (presetId) {
      event.dataTransfer.setData("application/agentezap-flow-preset", presetId);
    }
    event.dataTransfer.effectAllowed = "move";
  }, []);

  const handleCanvasDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const resolveStepTypeFromBlock = useCallback((blockType: FlowBlockType): VisualFlowStepType => {
    if (blockType === "action") return "handoff";
    if (blockType === "trigger") return "message";
    return blockType;
  }, []);

  const handleCanvasDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const blockType = event.dataTransfer.getData("application/agentezap-flow-block") as FlowBlockType;
    const presetId = event.dataTransfer.getData("application/agentezap-flow-preset");
    if (!blockType) return;
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    if (blockType === "trigger") {
      addRoute("blank");
      return;
    }
    addStep(resolveStepTypeFromBlock(blockType), position, presetId);
  }, [addRoute, addStep, reactFlow, resolveStepTypeFromBlock]);

  const canvasNodes = useMemo(() => buildCanvasNodes(selectedFlow, currentPositions), [currentPositions, selectedFlow]);
  const canvasEdges = useMemo(() => buildCanvasEdges(selectedFlow), [selectedFlow]);

  useEffect(() => {
    if (!selectedFlow) return;
    const frame = window.requestAnimationFrame(() => {
      reactFlow.fitView({ padding: 0.22, duration: 300 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reactFlow, selectedFlow?.id]);

  const renderFlowInspector = () => {
    if (!selectedFlow) return null;

    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Label>Nome do fluxo</Label>
          <Input value={selectedFlow.name} onChange={(event) => updateSelectedRoute((route) => ({ ...route, name: event.target.value }))} placeholder="Ex: Boas-vindas principal" />
        </div>

        <div className="space-y-2">
          <Label>Descrição interna</Label>
          <Textarea value={selectedFlow.description || ""} onChange={(event) => updateSelectedRoute((route) => ({ ...route, description: event.target.value }))} rows={3} placeholder="Ex: fluxo para entrada comercial e triagem." />
        </div>

        <div className="space-y-3">
          <Label>Modo de entrada</Label>
          <div className="grid gap-3">
            {TRIGGER_OPTIONS.map((option) => {
              const active = selectedFlow.triggerMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTriggerMode(selectedFlow.id, option.value)}
                  className={cn("rounded-[22px] border px-4 py-3 text-left transition-all", active ? "border-violet-300 bg-violet-50 shadow-sm" : "border-slate-200 bg-white hover:border-violet-200 hover:bg-slate-50")}
                >
                  <p className="text-sm font-bold text-slate-900">{option.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{option.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Quando a IA deve usar este fluxo</Label>
          <Textarea value={selectedFlow.triggerCondition} onChange={(event) => updateSelectedRoute((route) => ({ ...route, triggerCondition: event.target.value }))} rows={5} placeholder="Descreva intenção, contexto e sinais semânticos que fazem esse fluxo assumir." />
          <p className="text-xs text-slate-500">O runtime interpreta contexto, intenção, memória e continuidade sem usar regex fixa.</p>
        </div>

        <div className="space-y-2">
          <Label>Ação final padrão</Label>
          <Select value={selectedFlow.defaultFinalAction || "continue_ai"} onValueChange={(value) => updateSelectedRoute((route) => ({ ...route, defaultFinalAction: value as VisualFlowFinalAction }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FINAL_ACTIONS.map((action) => <SelectItem key={action.value} value={action.value}>{action.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Notas adicionais do orquestrador</Label>
          <Textarea value={notes} onChange={(event) => { setNotes(event.target.value); markDirty(); }} rows={4} placeholder="Contexto extra, regras do negócio ou memória que a IA deve preservar." />
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Saudação inicial</p>
              <p className="mt-1 text-xs text-slate-500">{openingFlowItems.length} item(ns) configurado(s) na aba Info.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenInfo?.()}>Abrir Info</Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">Saudação ativa</span>
                <Switch checked={greetingEnabled} onCheckedChange={(value) => onGreetingEnabledChange?.(value)} />
              </div>
            </label>
            <label className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">Variação da saudação</span>
                <Switch checked={greetingVariation} onCheckedChange={(value) => onGreetingVariationChange?.(value)} />
              </div>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onAddGreetingMainTextItem?.()}>Texto principal</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onAddGreetingTextItem?.()}>Texto extra</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onAddGreetingMediaItem?.("image")}>Mídia</Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[22px] border border-rose-100 bg-rose-50 px-4 py-4">
          <div>
            <p className="text-sm font-bold text-rose-700">Excluir fluxo</p>
            <p className="mt-1 text-xs text-rose-600">Remove este fluxo sem tocar nos demais.</p>
          </div>
          <Button type="button" variant="destructive" size="sm" disabled={flow.flows.length <= 1} onClick={() => removeRoute(selectedFlow.id)}>
            Excluir
          </Button>
        </div>
      </div>
    );
  };

  const renderStepInspector = () => {
    if (!selectedFlow || !selectedStep) return null;
    const currentMediaAction = selectedStep.mediaActions?.find((action) => action.type === "send_media_url");

    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Label>Nome interno do bloco</Label>
          <Input value={selectedStep.title} onChange={(event) => updateSelectedStep(selectedStep.id, (current) => ({ ...current, title: event.target.value }))} placeholder="Ex: Descobrir intenção do cliente" />
        </div>

        <div className="space-y-2">
          <Label>Tipo do bloco</Label>
          <Select value={selectedStep.type} onValueChange={(value) => updateSelectedStep(selectedStep.id, (current) => morphStepType(current, value as VisualFlowStepType))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STEP_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{selectedStep.type === "question" ? "Pergunta ou condição" : "Conteúdo do bloco"}</Label>
          <Textarea value={selectedStep.message} onChange={(event) => updateSelectedStep(selectedStep.id, (current) => ({ ...current, message: event.target.value }))} rows={4} placeholder={selectedStep.type === "question" ? "Ex: Você quer saber preço, ver opções ou falar com uma pessoa?" : "Ex: Olá. Como posso ajudar você hoje?"} />
        </div>

        {selectedStep.type === "media" ? (
          <div className="space-y-4 rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
            <div className="space-y-2">
              <Label>Arquivo da mídia</Label>
              <Input type="file" accept={getMediaAccept(currentMediaAction?.media_type)} disabled={uploadingStepMediaId === selectedStep.id} onChange={(event) => { const file = event.target.files?.[0]; void handleStepMediaUpload(selectedStep.id, file); event.currentTarget.value = ""; }} />
              {uploadingStepMediaId === selectedStep.id ? <p className="text-xs text-slate-500">Enviando mídia...</p> : null}
            </div>

            <div className="space-y-2">
              <Label>Legenda da mídia</Label>
              <Textarea
                value={currentMediaAction?.caption || ""}
                onChange={(event) => updateSelectedStep(selectedStep.id, (current) => ({
                  ...current,
                  mediaActions: current.mediaActions?.map((action) => action.type === "send_media_url" ? { ...action, caption: event.target.value } : action) || [],
                }))}
                rows={2}
                placeholder="Ex: Veja este material e me diga o que faz mais sentido."
              />
            </div>
          </div>
        ) : null}

        {selectedStep.type === "question" ? (
          <div className="space-y-4">
            {(selectedStep.branches || []).map((branch, branchIndex) => (
              <div key={branch.id} className="space-y-3 rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="secondary">Rota {branchIndex + 1}</Badge>
                  <Button type="button" variant="ghost" size="icon" onClick={() => updateSelectedStep(selectedStep.id, (current) => ({ ...current, branches: (current.branches || []).filter((item) => item.id !== branch.id) }))}>
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Nome curto</Label>
                  <Input value={branch.label} onChange={(event) => updateSelectedStep(selectedStep.id, (current) => ({ ...current, branches: (current.branches || []).map((item) => item.id === branch.id ? { ...item, label: event.target.value } : item) }))} placeholder="Ex: Preço" />
                </div>

                <div className="space-y-2">
                  <Label>Intenção semântica</Label>
                  <Textarea value={branch.condition} onChange={(event) => updateSelectedStep(selectedStep.id, (current) => ({ ...current, branches: (current.branches || []).map((item) => item.id === branch.id ? { ...item, condition: event.target.value } : item) }))} rows={3} placeholder="Descreva o sentido da resposta que deve seguir por este caminho." />
                </div>

                <div className="space-y-2">
                  <Label>Destino</Label>
                  <Select value={branch.nextStepId || "__none__"} onValueChange={(value) => updateSelectedStep(selectedStep.id, (current) => ({ ...current, branches: (current.branches || []).map((item) => item.id === branch.id ? { ...item, nextStepId: value === "__none__" ? null : value } : item) }))}>
                    <SelectTrigger><SelectValue placeholder="Escolha o destino" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Encerrar caminho</SelectItem>
                      {selectedFlow.steps.filter((candidate) => candidate.id !== selectedStep.id).map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}

            <Button type="button" variant="outline" onClick={() => updateSelectedStep(selectedStep.id, (current) => ({ ...current, branches: [...(current.branches || []), makeBranch()] }))}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar rota
            </Button>

            <div className="space-y-3 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4">
              <div className="space-y-2">
                <Label>Fallback</Label>
                <Select value={selectedStep.fallbackStepId || "__stay__"} onValueChange={(value) => updateSelectedStep(selectedStep.id, (current) => ({ ...current, fallbackStepId: value === "__stay__" ? null : value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__stay__">Ficar neste bloco</SelectItem>
                    {selectedFlow.steps.filter((candidate) => candidate.id !== selectedStep.id).map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Mensagem de repescagem</Label>
                <Textarea value={selectedStep.fallbackMessage || ""} onChange={(event) => updateSelectedStep(selectedStep.id, (current) => ({ ...current, fallbackMessage: event.target.value }))} rows={3} placeholder="Ex: Me diga com mais clareza se você quer preço, opções ou atendimento." />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Próximo bloco</Label>
              <Select value={selectedStep.nextStepId || "__none__"} onValueChange={(value) => updateSelectedStep(selectedStep.id, (current) => ({ ...current, nextStepId: value === "__none__" ? null : value }))}>
                <SelectTrigger><SelectValue placeholder="Escolha o destino" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Encerrar fluxo</SelectItem>
                  {selectedFlow.steps.filter((candidate) => candidate.id !== selectedStep.id).map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ação final deste bloco</Label>
              <Select value={selectedStep.finalAction || "continue_ai"} onValueChange={(value) => updateSelectedStep(selectedStep.id, (current) => ({ ...current, finalAction: value as VisualFlowFinalAction }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FINAL_ACTIONS.map((action) => <SelectItem key={action.value} value={action.value}>{action.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-[22px] border border-rose-100 bg-rose-50 px-4 py-4">
          <div>
            <p className="text-sm font-bold text-rose-700">Excluir bloco</p>
            <p className="mt-1 text-xs text-rose-600">Remove apenas este bloco e limpa referências quebradas.</p>
          </div>
          <Button type="button" variant="destructive" size="sm" onClick={() => removeStep(selectedStep.id)}>Excluir</Button>
        </div>
      </div>
    );
  };

  const inspectorContent = inspectorTarget?.kind === "step" ? renderStepInspector() : renderFlowInspector();
  const inspectorTitle = inspectorTarget?.kind === "step" ? "Configurações do bloco" : "Configurações do fluxo";
  const inspectorDescription = inspectorTarget?.kind === "step" ? "Ajuste texto, destino, mídia e regras deste bloco." : "Defina trigger, contexto, ação final e notas do orquestrador.";

  if (isLoading) {
    return <div className="flex h-40 items-center justify-center"><GitBranch className="h-5 w-5 animate-pulse text-primary" /></div>;
  }

  return (
    <>
      <div className={cn("flex h-full min-h-[820px] flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-slate-50 shadow-sm", className)}>
        <div className="border-b border-slate-200 bg-white px-4 py-4 md:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-[24px] bg-violet-100 p-3 text-violet-700"><Bot className="h-7 w-7" /></div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-black tracking-tight text-slate-900">Fluxo Chat Bot</h2>
                  <Badge className="border-violet-200 bg-violet-100 text-violet-800">Substitui a IA quando ativo</Badge>
                  {flowModeActive ? <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">Fluxo ativo</Badge> : <Badge variant="outline">Fluxo inativo</Badge>}
                  {importedLegacy ? <Badge className="border-amber-200 bg-amber-100 text-amber-700">Roteiro legado importado</Badge> : null}
                </div>
                <p className="text-sm text-slate-500">Construa o roteiro visual com gatilhos, mensagens, respostas, delays, etiquetas, notificacoes, PIX e transferencia humana.</p>
                <div className="flex max-w-3xl flex-wrap gap-1.5 pt-1">
                  {["Aguardar Resposta", "Condicional", "Bloco de IA", "Notificacao", "Etiquetas", "Botao PIX"].map((label) => (
                    <Badge key={label} variant="outline" className="border-violet-200 bg-white text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700">
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex max-w-full items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 shadow-sm">
                <div className="min-w-0">
                  <span className="block text-sm font-bold text-violet-900">Ativar Fluxo Chat Bot</span>
                  <span className="block text-[11px] leading-snug text-violet-700">Ativo = fluxo responde; IA automatica nao improvisa.</span>
                </div>
                <Switch checked={flowModeActive} onCheckedChange={(value) => void toggleFlowMode(value)} />
              </div>
              <Button type="button" variant="outline" onClick={() => addRoute("sales")}><Sparkles className="mr-2 h-4 w-4" />Fluxo de vendas</Button>
              <Button type="button" variant="outline" onClick={() => addRoute("schedule")}><Workflow className="mr-2 h-4 w-4" />Agendamento</Button>
              <Button type="button" onClick={() => addRoute("blank")}><Plus className="mr-2 h-4 w-4" />Novo fluxo</Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 overflow-x-auto pb-1">
            {flow.flows.map((route, index) => {
              const active = selectedFlow?.id === route.id;
              const triggerMeta = getTriggerMeta(route.triggerMode);
              return (
                <button key={route.id} type="button" onClick={() => { setSelectedFlowId(route.id); setInspectorTarget({ kind: "trigger" }); }} className={cn("flex min-w-[210px] items-center justify-between gap-3 rounded-[22px] border px-4 py-3 text-left transition-all", active ? "border-violet-300 bg-violet-50 shadow-sm" : "border-slate-200 bg-white hover:border-violet-200 hover:bg-slate-50")}>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900">{route.name || `Fluxo ${index + 1}`}</p>
                    <p className="text-xs text-slate-500">{route.steps.length} bloco(s)</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">{triggerMeta.shortLabel}</p>
                    <p className="text-[11px] text-slate-400">{route.description || "Sem descrição"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="order-2 w-full border-b border-slate-200 bg-white lg:order-none lg:w-[320px] lg:border-b-0 lg:border-r">
            <div className="border-b border-slate-100 px-5 py-5">
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-900">Biblioteca de Blocos</h3>
              <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Arraste para o canvas para construir seu fluxo</p>
            </div>

            <div className="max-h-[360px] space-y-6 overflow-y-auto p-4 lg:max-h-none lg:flex-1">
              {LEONA_STYLE_PRESET_GROUPS.map((group) => (
                <div key={group} className="space-y-3">
                  <h4 className="px-2 text-[10px] font-black uppercase tracking-[0.22em] text-violet-500">{group}</h4>
                  {LEONA_STYLE_PRESET_OPTIONS.filter((item) => item.group === group).map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        draggable
                        onDragStart={(event) => handleBlockDragStart(event, item.blockType, item.id)}
                        onClick={() => {
                          if (item.blockType === "trigger") {
                            addRoute("blank");
                            return;
                          }
                          addStep(resolveStepTypeFromBlock(item.blockType), undefined, item.id);
                        }}
                        className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"
                      >
                        <div className="flex items-start gap-3">
                          <div className="rounded-xl bg-violet-50 p-2 text-violet-600"><Icon className="h-4 w-4" /></div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <GripVertical className="h-4 w-4 text-slate-300" />
                              <p className="text-sm font-bold text-slate-900">{item.title}</p>
                            </div>
                            <p className="text-xs text-slate-500">{item.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="border-t border-slate-100 bg-slate-50/80 p-4">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-700">Dica de especialista</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  Conecte o <strong>gatilho</strong> à primeira <strong>mensagem</strong> e depois abra cada bloco para configurar a interpretação semântica da IA.
                </p>
              </div>
            </div>
          </aside>

          <div className="order-1 relative min-h-[540px] flex-1 lg:order-none lg:min-h-0" onDrop={handleCanvasDrop} onDragOver={handleCanvasDragOver}>
            <ReactFlow
              nodes={canvasNodes}
              edges={canvasEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => {
                if (!selectedFlow) return;
                if (node.id === getTriggerNodeId(selectedFlow.id)) {
                  setInspectorTarget({ kind: "trigger" });
                  return;
                }
                setInspectorTarget({ kind: "step", stepId: node.id });
              }}
              onPaneClick={() => setInspectorTarget(null)}
              fitView
              snapToGrid
              snapGrid={[20, 20]}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              className="bg-[#f8fafc]"
              deleteKeyCode={null}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#dbe4f0" />
              <Controls className="!m-6 !overflow-hidden !rounded-2xl !border !border-slate-200 !bg-white !shadow-xl" />

              <Panel position="top-right" className="mr-4 mt-4 flex flex-wrap items-center gap-3 md:mr-6 md:mt-6">
                <Button type="button" variant="outline" className="rounded-2xl bg-white shadow-lg" onClick={clearSelectedFlow}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Limpar
                </Button>
                <Button type="button" variant="outline" className="rounded-2xl bg-white shadow-lg" onClick={() => void handleOpenSimulator()}>
                  <Play className="mr-2 h-4 w-4 text-emerald-600" />
                  Testar Fluxo
                </Button>
                <Button type="button" className="rounded-2xl bg-violet-600 shadow-[0_18px_30px_rgba(124,58,237,0.24)] hover:bg-violet-500" onClick={() => void persistFlow(flowModeActive, "Fluxo salvo localmente.")} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar Fluxo
                </Button>
              </Panel>

              <Panel position="bottom-left" className="mb-4 ml-4 md:mb-6 md:ml-6">
                <div className="flex items-center gap-2 rounded-[20px] border border-white/70 bg-white/85 px-3 py-2 shadow-xl backdrop-blur">
                  <div className="rounded-xl bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">v1.0.4</div>
                  <div className="flex items-center gap-2 px-2">
                    <div className={cn("h-2 w-2 rounded-full", hasChanges ? "bg-amber-400" : "bg-emerald-400")} />
                    <span className="text-[10px] font-bold text-slate-600">{hasChanges ? "Alterações locais" : "Sincronizado"}</span>
                  </div>
                </div>
              </Panel>
            </ReactFlow>

            <AnimatePresence>
              {inspectorTarget ? (
                <motion.aside
                  initial={{ x: 420, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 420, opacity: 0 }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                  className="absolute right-4 top-4 bottom-4 z-30 hidden w-[390px] overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)] lg:flex lg:flex-col"
                >
                  <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/80 px-6 py-5">
                    <div className="space-y-1">
                      <p className="text-lg font-black tracking-tight text-slate-900">{inspectorTitle}</p>
                      <p className="text-sm text-slate-500">{inspectorDescription}</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setInspectorTarget(null)}><X className="h-4 w-4" /></Button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-6 py-6">{inspectorContent}</div>
                </motion.aside>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-700">{hasChanges ? "Você tem alterações locais não salvas." : "Tudo salvo por enquanto."}</p>
              <p className="text-xs text-slate-500">Com o Fluxo Chat Bot ativo, a conversa segue este roteiro visual e nao cai na IA automatica. Com ele desativado, o agente volta ao comportamento atual.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setShowRuntimePrompt(true)}>
                <FileText className="mr-2 h-4 w-4" />
                Ver prompt técnico
              </Button>
              <Button type="button" className="bg-violet-600 hover:bg-violet-500" onClick={() => void persistFlow(flowModeActive, "Fluxo salvo localmente.")} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar fluxo
              </Button>
            </div>
          </div>
        </div>
      </div>

      {inspectorTarget ? (
        <div className="border-t border-slate-200 bg-white lg:hidden">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-lg font-black tracking-tight text-slate-900">{inspectorTitle}</p>
              <p className="text-sm text-slate-500">{inspectorDescription}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => setInspectorTarget(null)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="max-h-[72vh] overflow-y-auto px-5 py-5">{inspectorContent}</div>
        </div>
      ) : null}

      <Dialog open={showRuntimePrompt} onOpenChange={setShowRuntimePrompt}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
          <DialogHeader className="border-b border-slate-100 px-6 py-5">
            <DialogTitle>Prompt técnico do runtime</DialogTitle>
            <DialogDescription>Este e o roteiro tecnico salvo para o Fluxo Chat Bot. Com o toggle ativo, ele tem prioridade sobre a IA automatica.</DialogDescription>
          </DialogHeader>
          <div className="p-6">
            <Textarea value={cleanFlowScript} readOnly rows={20} className="resize-none bg-zinc-950 font-mono text-green-400" />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSimulator} onOpenChange={setShowSimulator}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden p-0">
          <div className="flex h-[78vh] flex-col md:flex-row">
            <div className="flex min-h-0 flex-1 flex-col bg-[#e5ddd5]">
              <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20"><Bot className="h-5 w-5" /></div>
                <div className="flex-1">
                  <p className="font-semibold">Simulador do Fluxo</p>
                  <p className="text-xs text-white/70">Teste local antes de publicar.</p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" onClick={handleClearSimulator}>Limpar</Button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
                {simulatorMessages.length === 0 ? <div className="flex justify-center"><div className="max-w-[280px] rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-center text-xs text-violet-700 shadow-sm">O simulador local já está usando o fluxo salvo desta tela.</div></div> : null}
                {simulatorMessages.map((message) => (
                  <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[82%] rounded-2xl px-3 py-2 shadow-sm", message.role === "user" ? "rounded-tr-none bg-[#DCF8C6] text-[#303030]" : "rounded-tl-none bg-white text-[#303030]")}>
                      {message.mediaUrl ? (
                        <div className="mb-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                          {message.mediaType === "image" ? <img src={message.mediaUrl} alt="Mídia do fluxo" className="max-h-64 w-full object-cover" /> : <div className="flex items-center gap-3 px-4 py-3 text-sm text-slate-600"><ImageIcon className="h-4 w-4" />Arquivo de mídia enviado pelo fluxo</div>}
                        </div>
                      ) : null}
                      {message.message ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.message}</p> : null}
                      <p className="mt-1 text-right text-[10px] text-slate-400">{message.time}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/50 bg-white px-3 py-3">
                <div className="flex items-center gap-2">
                  <Input value={simulatorInput} onChange={(event) => setSimulatorInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void sendSimulatorMessage(); } }} placeholder="Digite a mensagem do cliente..." className="h-11 rounded-full border-slate-200" />
                  <Button type="button" className="h-11 rounded-full bg-[#075E54] hover:bg-[#0b7669]" onClick={() => void sendSimulatorMessage()} disabled={isSimulating}>
                    {isSimulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="hidden w-[300px] border-l border-slate-200 bg-slate-50 p-5 md:block">
              <div className="space-y-4">
                <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-bold text-slate-900">Como este teste funciona</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">Antes de abrir o simulador, o fluxo desta tela foi salvo localmente e ativado só no ambiente de desenvolvimento.</p>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-bold text-slate-900">Fluxo atual</p>
                  <p className="mt-2 text-sm text-slate-500">{selectedFlow?.name || "Sem fluxo selecionado"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">{selectedFlow?.steps.length || 0} bloco(s)</Badge>
                    <Badge variant="outline">{getTriggerMeta(selectedFlow?.triggerMode || "default").label}</Badge>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-bold text-slate-900">Validação local</p>
                  <p className="mt-2 text-sm text-slate-500">Faça os testes aqui em localhost. Eu não vou publicar sem sua aprovação nesta rodada.</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function FlowTab(props: FlowTabProps) {
  return (
    <ReactFlowProvider>
      <FlowTabInner {...props} />
    </ReactFlowProvider>
  );
}
