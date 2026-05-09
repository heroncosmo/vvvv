import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  ConnectionMode,
  reconnectEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Bell,
  Bot,
  Boxes,
  Bold,
  Brain,
  ChevronLeft,
  Code2,
  Clock,
  Copy,
  CreditCard,
  Download,
  Edit3,
  FileText,
  GitBranch,
  GripVertical,
  ImageIcon,
  Italic,
  Link2,
  Loader2,
  Mic,
  MessageSquare,
  MousePointer2,
  Music2,
  Play,
  Plus,
  Save,
  Smile,
  Sticker,
  Strikethrough,
  Tags,
  Trash2,
  Upload,
  UserRound,
  Video,
  Workflow,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type Flow2BlockKind =
  | "message"
  | "tags"
  | "pix"
  | "menu"
  | "carousel"
  | "wait"
  | "chat-control"
  | "notification"
  | "condition"
  | "ai"
  | "delay"
  | "media";

type Flow2NodeData = {
  kind: Flow2BlockKind | "start";
  title: string;
  description?: string;
  config: Record<string, any>;
  onEdit?: (nodeId: string) => void;
  onDuplicate?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
};

type Flow2Definition = {
  nodes: Array<Node<Flow2NodeData>>;
  edges: Edge[];
  viewport?: { x: number; y: number; zoom: number };
};

type Flow2Record = {
  id: string | null;
  userId: string;
  name: string;
  isActive: boolean;
  isArchived: boolean;
  definition: Flow2Definition;
  selectedNodeId: string | null;
};

type Flow2MessageContentType = "text" | "image" | "video" | "audio" | "interval" | "contact" | "file" | "sticker";

type Flow2MessageContent = {
  id: string;
  type: Flow2MessageContentType;
  text?: string;
  delaySeconds?: number;
  sourceMode?: "file" | "url";
  url?: string;
  fileName?: string;
  mimeType?: string;
  aiGenerated?: boolean;
  oneView?: boolean;
  videoMode?: "normal" | "autoplay" | "message";
  contactName?: string;
  contactPhone?: string;
};

const FLOW2_INTERNAL_MEDIA_MARKERS = [
  "/storage/v1/object/public/agent-media/",
  "/storage/v1/object/agent-media/",
  "flow2-ai-audio/",
];

type Flow2ConditionRule = {
  id: string;
  field: "message";
  operator: "contains" | "not_contains" | "equals" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty";
  value: string;
};

const CONDITION_OPERATORS: Array<{ value: Flow2ConditionRule["operator"]; label: string; needsValue: boolean }> = [
  { value: "contains", label: "Contem", needsValue: true },
  { value: "not_contains", label: "Nao contem", needsValue: true },
  { value: "equals", label: "E exatamente", needsValue: true },
  { value: "starts_with", label: "Comeca com", needsValue: true },
  { value: "ends_with", label: "Termina com", needsValue: true },
  { value: "is_empty", label: "Esta vazio", needsValue: false },
  { value: "is_not_empty", label: "Nao esta vazio", needsValue: false },
];

const MESSAGE_CONTENT_OPTIONS: Array<{
  type: Flow2MessageContentType;
  label: string;
  icon: typeof MessageSquare;
  tone: string;
}> = [
  { type: "text", label: "Texto", icon: MessageSquare, tone: "blue" },
  { type: "image", label: "Imagem", icon: ImageIcon, tone: "emerald" },
  { type: "video", label: "Video", icon: Video, tone: "purple" },
  { type: "audio", label: "Audio", icon: Mic, tone: "orange" },
  { type: "interval", label: "Intervalo", icon: Clock, tone: "cyan" },
  { type: "contact", label: "Contato", icon: UserRound, tone: "pink" },
  { type: "file", label: "Arquivo", icon: FileText, tone: "indigo" },
  { type: "sticker", label: "Sticker", icon: Sticker, tone: "amber" },
];

const MESSAGE_CONTENT_TONE: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700",
  emerald: "bg-emerald-100 text-emerald-700",
  purple: "bg-purple-100 text-purple-700",
  orange: "bg-orange-100 text-orange-700",
  cyan: "bg-cyan-100 text-cyan-700",
  pink: "bg-pink-100 text-pink-700",
  indigo: "bg-indigo-100 text-indigo-700",
  amber: "bg-amber-100 text-amber-700",
};

const BLOCKS: Array<{
  kind: Flow2BlockKind;
  label: string;
  description: string;
  icon: typeof MessageSquare;
  color: string;
}> = [
  { kind: "message", label: "Mensagem", description: "Texto simples enviado ao cliente.", icon: MessageSquare, color: "blue" },
  { kind: "tags", label: "Etiquetas", description: "Marca o contato para organizacao.", icon: Tags, color: "indigo" },
  { kind: "pix", label: "Botao PIX", description: "Chave PIX, destinatario e instrucao de pagamento.", icon: CreditCard, color: "emerald" },
  { kind: "menu", label: "Menu", description: "Lista de opcoes para escolha do cliente.", icon: GripVertical, color: "purple" },
  { kind: "carousel", label: "Carrossel", description: "Sequencia de cards, produtos ou ofertas.", icon: Boxes, color: "sky" },
  { kind: "wait", label: "Aguarda Resposta", description: "Pausa o fluxo ate o cliente responder.", icon: Clock, color: "orange" },
  { kind: "chat-control", label: "Controlador de Chat", description: "Assumir, pausar, transferir ou encerrar.", icon: UserRound, color: "slate" },
  { kind: "notification", label: "Notificacao", description: "Alerta interno para equipe.", icon: Bell, color: "teal" },
  { kind: "condition", label: "Condicional", description: "Caminhos por regra ou texto.", icon: GitBranch, color: "cyan" },
  { kind: "ai", label: "Bloco de IA", description: "Interpreta resposta dentro do roteiro.", icon: Brain, color: "green" },
  { kind: "delay", label: "Delay", description: "Espera antes de seguir.", icon: Clock, color: "blue" },
  { kind: "media", label: "Midia", description: "Imagem, audio, video ou documento.", icon: ImageIcon, color: "amber" },
];

const COLOR_CLASS: Record<string, { node: string; header: string; icon: string; border: string }> = {
  blue: { node: "border-blue-300", header: "bg-blue-500", icon: "bg-blue-100 text-blue-700", border: "border-blue-200" },
  indigo: { node: "border-indigo-300", header: "bg-indigo-500", icon: "bg-indigo-100 text-indigo-700", border: "border-indigo-200" },
  emerald: { node: "border-emerald-300", header: "bg-emerald-500", icon: "bg-emerald-100 text-emerald-700", border: "border-emerald-200" },
  purple: { node: "border-purple-300", header: "bg-purple-500", icon: "bg-purple-100 text-purple-700", border: "border-purple-200" },
  sky: { node: "border-sky-300", header: "bg-sky-500", icon: "bg-sky-100 text-sky-700", border: "border-sky-200" },
  orange: { node: "border-orange-300", header: "bg-orange-500", icon: "bg-orange-100 text-orange-700", border: "border-orange-200" },
  slate: { node: "border-slate-300", header: "bg-slate-600", icon: "bg-slate-100 text-slate-700", border: "border-slate-200" },
  teal: { node: "border-teal-300", header: "bg-teal-500", icon: "bg-teal-100 text-teal-700", border: "border-teal-200" },
  cyan: { node: "border-cyan-300", header: "bg-cyan-500", icon: "bg-cyan-100 text-cyan-700", border: "border-cyan-200" },
  green: { node: "border-green-300", header: "bg-green-500", icon: "bg-green-100 text-green-700", border: "border-green-200" },
  amber: { node: "border-amber-300", header: "bg-amber-500", icon: "bg-amber-100 text-amber-700", border: "border-amber-200" },
};

function getBlockMeta(kind: Flow2BlockKind | "start") {
  if (kind === "start") {
    return {
      label: "Inicio",
      icon: MousePointer2,
      color: "purple",
      description: "Ponto de entrada do fluxo",
    };
  }
  return BLOCKS.find((block) => block.kind === kind) || BLOCKS[0];
}

function createMessageContent(type: Flow2MessageContentType): Flow2MessageContent {
  const id = `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  if (type === "text") return { id, type, text: "", delaySeconds: 3 };
  if (type === "interval") return { id, type, delaySeconds: 3 };
  if (type === "contact") return { id, type, contactName: "", contactPhone: "" };
  return { id, type, sourceMode: "file", url: "", fileName: "", delaySeconds: 0, videoMode: "normal", oneView: false };
}

function normalizeMessageItems(config: Record<string, any>): Flow2MessageContent[] {
  if (Array.isArray(config.items)) {
    return config.items
      .filter((item: any) => item && typeof item === "object")
      .map((item: any) => ({
        ...createMessageContent(item.type || "text"),
        ...item,
        id: item.id || `${item.type || "text"}-${Math.random().toString(36).slice(2, 8)}`,
        type: item.type || "text",
      }));
  }

  if (typeof config.text === "string" && config.text.trim()) {
    return [{ ...createMessageContent("text"), text: config.text, delaySeconds: config.typingDelaySeconds || 3 }];
  }

  return [];
}

function createConditionRule(): Flow2ConditionRule {
  return {
    id: `condition-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    field: "message",
    operator: "contains",
    value: "",
  };
}

function normalizeConditionRules(config: Record<string, any>): Flow2ConditionRule[] {
  if (Array.isArray(config.conditions)) {
    return config.conditions
      .filter((condition: any) => condition && typeof condition === "object")
      .map((condition: any) => ({
        ...createConditionRule(),
        ...condition,
        id: condition.id || `condition-${Math.random().toString(36).slice(2, 8)}`,
        field: "message",
        operator: CONDITION_OPERATORS.some((item) => item.value === condition.operator) ? condition.operator : "contains",
        value: String(condition.value || ""),
      }));
  }

  if (typeof config.matchText === "string" && config.matchText.trim()) {
    return [{
      ...createConditionRule(),
      value: config.matchText,
    }];
  }

  return [];
}

function summarizeMessageItems(config: Record<string, any>) {
  const items = normalizeMessageItems(config);
  if (items.length === 0) return "Nenhuma acao configurada. Adicione texto ou midia.";
  return items
    .slice(0, 3)
    .map((item) => {
      if (item.type === "text") return item.text?.trim() || "Texto sem conteudo";
      if (item.type === "interval") return `Intervalo: ${item.delaySeconds || 0}s`;
      if (item.type === "contact") return item.contactName || item.contactPhone || "Contato";
      return getSafeFlow2MediaLabel(item);
    })
    .join(" / ");
}

function isFlow2InternalMediaUrl(value?: string | null) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  return text.includes("supabase.co/storage/v1/object") || FLOW2_INTERNAL_MEDIA_MARKERS.some((marker) => text.includes(marker));
}

function getSafeFlow2MediaLabel(item: Flow2MessageContent) {
  if (item.type === "text") return item.text?.trim() || "Texto sem conteudo";
  if (item.type === "interval") return `Intervalo: ${item.delaySeconds || 0}s`;
  if (item.type === "contact") return item.contactName || item.contactPhone || "Contato";
  const label = MESSAGE_CONTENT_OPTIONS.find((option) => option.type === item.type)?.label || item.type;
  if (item.aiGenerated) return `${label} por IA pronto`;
  if (item.fileName) return item.fileName;
  if (item.url && !isFlow2InternalMediaUrl(item.url)) return "Link externo configurado";
  if (item.url) return `${label} anexado`;
  return label;
}

function getFlow2MediaAccept(type: Flow2MessageContentType) {
  if (type === "image") return "image/*";
  if (type === "video") return "video/*";
  if (type === "audio") return "audio/*";
  if (type === "sticker") return "image/webp,image/png,image/jpeg";
  return "*/*";
}

function getFlow2MediaLimitMb(type: Flow2MessageContentType) {
  if (type === "video") return 20;
  if (type === "audio") return 15;
  if (type === "file") return 20;
  return 2;
}

function getMenuOptions(config: Record<string, any>): string[] {
  return String(config?.options || "")
    .split(/\r?\n/)
    .map((option) => option.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function getDefaultSourceHandle(kind?: Flow2BlockKind | "start", config?: Record<string, any>) {
  if (kind === "condition") return "yes";
  if (kind === "menu") return getMenuOptions(config || {}).length > 0 ? "option-0" : "next";
  if (kind === "ai") return config?.handoff === false ? "next" : null;
  return "next";
}

function getRouteHandles(node: Node<Flow2NodeData>) {
  const config = node.data.config || {};
  if (node.data.kind === "condition") {
    return [
      { id: "yes", label: config.positiveLabel || "Sim" },
      { id: "no", label: config.negativeLabel || "Nao" },
    ];
  }
  if (node.data.kind === "menu") {
    const options = getMenuOptions(config);
    return options.length > 0
      ? options.map((option, index) => ({ id: `option-${index}`, label: `${index + 1}. ${option}` }))
      : [{ id: "next", label: "Proximo bloco" }];
  }
  if (node.data.kind === "ai" && config.handoff !== false) return [];
  return [{ id: "next", label: "Proximo bloco" }];
}

function createFlow2Edge(source: string, target: string, handle?: Pick<Connection, "sourceHandle" | "targetHandle">): Edge {
  return {
    id: `edge-${source}-${target}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    source,
    target,
    sourceHandle: handle?.sourceHandle || "next",
    targetHandle: handle?.targetHandle || "in",
    type: "smoothstep",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
    style: { stroke: "#94a3b8", strokeWidth: 3, strokeDasharray: "7 6" },
  };
}

function createNode(kind: Flow2BlockKind, index: number, position?: { x: number; y: number }): Node<Flow2NodeData> {
  const meta = getBlockMeta(kind);
  const baseConfig: Record<string, any> =
    kind === "pix"
      ? { pixKeyType: "Telefone", pixKey: "", recipient: "", warning: true }
      : kind === "wait"
        ? { waitFor: "resposta do cliente", timeout: "1 hora", fallback: "caso nao responda" }
        : kind === "condition"
          ? { logic: "all", conditions: [], positiveLabel: "Sim", negativeLabel: "Nao" }
          : kind === "ai"
            ? { handoff: true, model: "gpt-5.4-nano", instruction: "A IA assume o atendimento a partir daqui", fallback: "fallback padrao" }
            : kind === "delay"
              ? { seconds: 60 }
              : kind === "tags"
                ? { tags: "" }
                : kind === "notification"
                  ? { message: "Avisar equipe" }
                  : kind === "chat-control"
                    ? { action: "transferir_humano" }
                    : kind === "menu"
                      ? { options: "Comprar\nTirar duvida\nFalar com atendente" }
                      : kind === "carousel"
                        ? { cards: "Card 1\nCard 2\nCard 3" }
                        : kind === "media"
                          ? { mediaType: "image", url: "", caption: "" }
                          : { items: [createMessageContent("text")] };

  return {
    id: `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    type: "flow2",
    position: position || { x: 180 + (index % 3) * 260, y: 160 + Math.floor(index / 3) * 180 },
    data: {
      kind,
      title: meta.label,
      description: meta.description,
      config: baseConfig,
    },
  };
}

function createDefaultDefinition(): Flow2Definition {
  return {
    nodes: [
      {
        id: "start",
        type: "flow2",
        position: { x: 80, y: 120 },
        data: {
          kind: "start",
          title: "Inicio do fluxo",
          description: "Quando o cliente entrar neste fluxo",
          config: { trigger: "manual" },
        },
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function Flow2Node({ id, data, selected }: NodeProps<Node<Flow2NodeData>>) {
  const meta = getBlockMeta(data.kind);
  const palette = COLOR_CLASS[meta.color] || COLOR_CLASS.blue;
  const Icon = meta.icon;
  const menuOptions = data.kind === "menu" ? getMenuOptions(data.config || {}) : [];
  const conditionRules = data.kind === "condition" ? normalizeConditionRules(data.config || {}) : [];
  const conditionYesLabel = String(data.config?.positiveLabel || "Sim").slice(0, 18);
  const conditionNoLabel = String(data.config?.negativeLabel || "Nao").slice(0, 18);
  const summary =
    data.kind === "pix"
      ? data.config.pixKey || "Chave PIX nao configurada"
      : data.kind === "wait"
        ? data.config.timeout || "Aguardar resposta"
        : data.kind === "ai"
          ? data.config.instruction || "Bloco de IA"
          : data.kind === "delay"
            ? `Delay: ${data.config.seconds || 0}s`
            : data.kind === "tags"
              ? data.config.tags || "Sem etiquetas"
              : data.kind === "condition"
                ? conditionRules.length
                  ? `${conditionRules.length} condicao${conditionRules.length === 1 ? "" : "es"} (${data.config.logic === "any" ? "qualquer" : "todas"})`
                  : "Nenhuma condicao adicionada"
              : data.kind === "message"
                ? summarizeMessageItems(data.config || {})
                : data.description || meta.description;
  const messageItems = data.kind === "message" ? normalizeMessageItems(data.config || {}) : [];

  return (
    <div className={cn("relative w-[260px] overflow-visible rounded-lg border bg-white shadow-md", palette.node, selected && "ring-2 ring-violet-500")}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!left-[-10px] !h-5 !w-5 !cursor-crosshair !border-[3px] !border-white !bg-slate-500 !shadow-md transition hover:!scale-125 hover:!bg-purple-700"
      />
      <div className={cn("flex items-center justify-between px-2 py-1.5 text-white", palette.header)}>
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate text-[11px] font-bold">{data.title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={(event) => { event.stopPropagation(); data.onEdit?.(id); }} className="rounded p-0.5 hover:bg-white/20" title="Editar" aria-label={`Editar ${data.title}`}>
            <Edit3 className="h-3 w-3" />
          </button>
          <button type="button" onClick={(event) => { event.stopPropagation(); data.onDuplicate?.(id); }} className="rounded p-0.5 hover:bg-white/20" title="Duplicar" aria-label={`Duplicar ${data.title}`}>
            <Copy className="h-3 w-3" />
          </button>
          {id !== "start" ? (
            <button type="button" onClick={(event) => { event.stopPropagation(); data.onDelete?.(id); }} className="rounded p-0.5 hover:bg-white/20" title="Excluir" aria-label={`Excluir ${data.title}`}>
              <Trash2 className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="space-y-2 p-2">
        {data.kind === "message" && messageItems.length > 0 ? (
          <div className="space-y-1.5">
            {messageItems.slice(0, 4).map((item) => {
              const option = MESSAGE_CONTENT_OPTIONS.find((entry) => entry.type === item.type) || MESSAGE_CONTENT_OPTIONS[0];
              const ItemIcon = option.icon;
              return (
                <div key={item.id} className={cn("flex items-start gap-2 rounded-md border px-2 py-1.5 text-[10px] leading-snug text-slate-700", palette.border)}>
                  <ItemIcon className="mt-0.5 h-3 w-3 shrink-0 text-blue-600" />
                  <span className="line-clamp-2">
                    {item.type === "text"
                      ? item.text || "Texto vazio"
                      : item.type === "interval"
                        ? `Intervalo: ${item.delaySeconds || 0}s`
                        : getSafeFlow2MediaLabel(item)}
                  </span>
                </div>
              );
            })}
            {messageItems.length > 4 ? <div className="text-[9px] font-semibold text-slate-500">+{messageItems.length - 4} itens</div> : null}
          </div>
        ) : (
          <div className={cn("rounded-md border px-2 py-1.5 text-[10px] leading-snug text-slate-700", palette.border)}>
            {summary}
          </div>
        )}
        {data.kind === "wait" || data.kind === "condition" ? (
          <div className="space-y-1 text-[9px] text-slate-600">
            {data.kind === "condition" ? (
              <div className="grid grid-cols-2 gap-1 text-[10px] font-semibold">
                <div className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">{conditionYesLabel}</div>
                <div className="rounded bg-rose-50 px-2 py-1 text-rose-700">{conditionNoLabel}</div>
              </div>
            ) : (
              <>
                <div className="rounded bg-orange-50 px-2 py-1">Ou</div>
                <div className="rounded bg-orange-50 px-2 py-1">{data.config.fallback || "caso nao responda"}</div>
              </>
            )}
          </div>
        ) : null}
        {data.kind === "menu" && menuOptions.length > 0 ? (
          <div className="space-y-1">
            {menuOptions.slice(0, 4).map((option, index) => (
              <div key={`${option}-${index}`} className="truncate rounded-md border border-purple-100 bg-purple-50 px-2 py-1 text-[10px] font-semibold text-purple-700">
                {index + 1}. {option}
              </div>
            ))}
            {menuOptions.length > 4 ? <div className="text-[9px] font-semibold text-slate-500">+{menuOptions.length - 4} opcoes</div> : null}
          </div>
        ) : null}
        {data.kind === "ai" ? (
          <div className="space-y-1 text-[9px] text-slate-600">
            <div className="rounded bg-green-50 px-2 py-1">{data.config.model || "gpt-5.4-nano"}</div>
            <div className="rounded bg-orange-50 px-2 py-1">{data.config.fallback || "fallback padrao"}</div>
          </div>
        ) : null}
      </div>
      {data.kind === "condition" ? (
        <>
          <span className="pointer-events-none absolute -right-12 top-[47%] rounded bg-white px-1 text-[9px] font-bold text-emerald-700 shadow-sm">{conditionYesLabel}</span>
          <Handle
            type="source"
            position={Position.Right}
            id="yes"
            className="!right-[-10px] !h-5 !w-5 !cursor-crosshair !border-[3px] !border-white !bg-emerald-500 !shadow-md transition hover:!scale-125 hover:!bg-emerald-700"
            style={{ top: "52%" }}
          />
          <span className="pointer-events-none absolute -right-12 top-[72%] rounded bg-white px-1 text-[9px] font-bold text-rose-700 shadow-sm">{conditionNoLabel}</span>
          <Handle
            type="source"
            position={Position.Right}
            id="no"
            className="!right-[-10px] !h-5 !w-5 !cursor-crosshair !border-[3px] !border-white !bg-rose-500 !shadow-md transition hover:!scale-125 hover:!bg-rose-700"
            style={{ top: "78%" }}
          />
        </>
      ) : data.kind === "menu" && menuOptions.length > 0 ? (
        <>
          {menuOptions.map((option, index) => (
            <Handle
              key={`option-${index}`}
              type="source"
              position={Position.Right}
              id={`option-${index}`}
              title={option}
              className="!right-[-10px] !h-5 !w-5 !cursor-crosshair !border-[3px] !border-white !bg-purple-500 !shadow-md transition hover:!scale-125 hover:!bg-purple-700"
              style={{ top: `${Math.min(86, 38 + index * 10)}%` }}
            />
          ))}
        </>
      ) : data.kind !== "ai" || data.config?.handoff === false ? (
        <Handle
          type="source"
          position={Position.Right}
          id="next"
          className="!right-[-10px] !h-5 !w-5 !cursor-crosshair !border-[3px] !border-white !bg-slate-500 !shadow-md transition hover:!scale-125 hover:!bg-purple-700"
        />
      ) : null}
    </div>
  );
}

const nodeTypes = { flow2: Flow2Node };
const FLOW2_AUDIO_VOICE_LABELS = {
  female: "Voz feminina",
  male: "Voz masculina",
} as const;

function MessageContentEditor({
  node,
  onAdd,
  onPatch,
  onAddGeneratedAudio,
  onRemove,
  onMove,
}: {
  node: Node<Flow2NodeData>;
  onAdd: (nodeId: string, type: Flow2MessageContentType) => void;
  onPatch: (nodeId: string, itemId: string, patch: Partial<Flow2MessageContent>) => void;
  onAddGeneratedAudio: (nodeId: string, afterItemId: string, audioItem: Flow2MessageContent) => void;
  onRemove: (nodeId: string, itemId: string) => void;
  onMove: (nodeId: string, itemId: string, direction: -1 | 1) => void;
}) {
  const items = normalizeMessageItems(node.data.config || {});
  const { toast } = useToast();
  const [audioVoice, setAudioVoice] = useState<"female" | "male">("female");
  const [audioSpeed, setAudioSpeed] = useState(1);
  const [generatingAudioFor, setGeneratingAudioFor] = useState<string | null>(null);
  const [uploadingMediaFor, setUploadingMediaFor] = useState<string | null>(null);

  const generateAiAudio = async (item: Flow2MessageContent) => {
    const text = String(item.text || "").trim();
    if (!text) {
      toast({ title: "Texto vazio", description: "Digite a mensagem antes de gerar o audio.", variant: "destructive" });
      return;
    }

    setGeneratingAudioFor(item.id);
    try {
      const response = await apiRequest("POST", "/api/agent/flow2/generate-audio", {
        text,
        voiceType: audioVoice,
        speed: audioSpeed,
      });
      const data = await response.json();
      onAddGeneratedAudio(node.id, item.id, {
        id: `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: "audio",
        sourceMode: "file",
        url: data.storageUrl,
        fileName: data.fileName || "audio-flow2.mp3",
        mimeType: data.mimeType || "audio/mpeg",
        aiGenerated: true,
        delaySeconds: item.delaySeconds ?? 0,
      });
      toast({
        title: "Audio gerado",
        description: `${FLOW2_AUDIO_VOICE_LABELS[audioVoice]}. Restam ${data.usage?.remaining ?? 0} de ${data.usage?.limit ?? 30} hoje.`,
      });
    } catch (error: any) {
      toast({
        title: "Erro ao gerar audio",
        description: error?.message || "Nao foi possivel gerar o audio por IA.",
        variant: "destructive",
      });
    } finally {
      setGeneratingAudioFor(null);
    }
  };

  const uploadMediaFile = async (item: Flow2MessageContent, file?: File | null) => {
    if (!file) return;
    const limitMb = getFlow2MediaLimitMb(item.type);
    if (file.size > limitMb * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: `Use um arquivo de ate ${limitMb}MB para este bloco.`,
        variant: "destructive",
      });
      return;
    }

    setUploadingMediaFor(item.id);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiRequest("POST", "/api/agent/media/upload", formData);
      const data = await response.json();
      if (!data?.storageUrl) throw new Error("Upload sem URL de armazenamento.");
      onPatch(node.id, item.id, {
        sourceMode: "file",
        url: data.storageUrl,
        fileName: data.fileName || file.name,
        mimeType: data.mimeType || file.type,
        aiGenerated: false,
      });
      toast({ title: "Midia anexada", description: `${file.name} pronto para este bloco.` });
    } catch (error: any) {
      toast({
        title: "Erro no upload",
        description: error?.message || "Nao foi possivel anexar a midia.",
        variant: "destructive",
      });
    } finally {
      setUploadingMediaFor(null);
    }
  };

  return (
    <div className="space-y-5">
      {items.length === 0 ? (
        <div className="rounded-xl bg-slate-50 px-4 py-6 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-slate-500" />
          <p className="mt-3 text-sm text-slate-500">Nenhuma acao configurada. Adicione mensagens de texto ou midia.</p>
        </div>
      ) : null}

      <div className="space-y-3">
        <p className="text-sm font-bold text-slate-900">Adicionar Conteudo</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MESSAGE_CONTENT_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => onAdd(node.id, option.type)}
                className="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm font-semibold text-slate-700 transition hover:border-purple-400 hover:bg-purple-50"
              >
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-full", MESSAGE_CONTENT_TONE[option.tone])}>
                  <Icon className="h-5 w-5" />
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        {items.map((item, index) => {
          const option = MESSAGE_CONTENT_OPTIONS.find((entry) => entry.type === item.type) || MESSAGE_CONTENT_OPTIONS[0];
          const Icon = option.icon;
          const mediaLabel = getSafeFlow2MediaLabel(item);
          const mediaLimitMb = getFlow2MediaLimitMb(item.type);
          const isUploadingThisMedia = uploadingMediaFor === item.id;
          const isInternalMedia = isFlow2InternalMediaUrl(item.url);

          return (
            <section key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-purple-600" />
                  <p className="truncate text-sm font-bold text-slate-900">{option.label}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMove(node.id, item.id, -1)} disabled={index === 0} aria-label="Mover para cima">
                    <GripVertical className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMove(node.id, item.id, 1)} disabled={index === items.length - 1} aria-label="Mover para baixo">
                    <GripVertical className="h-4 w-4 rotate-180" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => onRemove(node.id, item.id)} aria-label="Remover conteudo">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {item.type === "text" ? (
                <div className="space-y-3">
                  <Textarea
                    rows={5}
                    placeholder="Digite o conteudo da mensagem..."
                    value={item.text || ""}
                    onChange={(event) => onPatch(node.id, item.id, { text: event.target.value })}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-slate-500">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Negrito"><Bold className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Italico"><Italic className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Riscado"><Strikethrough className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Emoji"><Smile className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Codigo"><Code2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-700">
                      <span>Delay do "digitando"</span>
                      <strong>{item.delaySeconds || 0} segundos</strong>
                      <span>60 segundos</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={60}
                      value={item.delaySeconds ?? 3}
                      onChange={(event) => onPatch(node.id, item.id, { delaySeconds: Number(event.target.value) })}
                      className="w-full accent-cyan-500"
                    />
                    <p className="text-xs text-slate-500">Tempo que o WhatsApp ficara "digitando" antes de enviar esta mensagem.</p>
                  </div>

                  <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
                      <Select value={audioVoice} onValueChange={(value) => setAudioVoice(value as "female" | "male")}>
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="female">Voz feminina</SelectItem>
                          <SelectItem value="male">Voz masculina</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0.75}
                        max={1.4}
                        step={0.05}
                        value={audioSpeed}
                        onChange={(event) => setAudioSpeed(Number(event.target.value || 1))}
                      />
                      <Button type="button" className="bg-orange-600 hover:bg-orange-500" onClick={() => generateAiAudio(item)} disabled={generatingAudioFor === item.id}>
                        {generatingAudioFor === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
                        Audio por IA
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {item.type === "image" || item.type === "video" || item.type === "audio" || item.type === "file" || item.type === "sticker" ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200">
                    <button type="button" className={cn("flex items-center justify-center gap-2 px-3 py-2 text-sm font-bold", (item.sourceMode || "file") === "file" || isInternalMedia ? "bg-purple-600 text-white" : "bg-white text-slate-600")} onClick={() => onPatch(node.id, item.id, { sourceMode: "file" })}>
                      <Upload className="h-4 w-4" />
                      Anexar arquivo
                    </button>
                    <button type="button" className={cn("flex items-center justify-center gap-2 px-3 py-2 text-sm font-bold", item.sourceMode === "url" ? "bg-purple-600 text-white" : "bg-white text-slate-600")} onClick={() => onPatch(node.id, item.id, { sourceMode: "url" })}>
                      <Link2 className="h-4 w-4" />
                      Link externo
                    </button>
                  </div>

                  {item.sourceMode === "url" && !isInternalMedia ? (
                    <div className="space-y-2">
                      <Label>Link externo da midia</Label>
                      <Input value={item.url || ""} placeholder="https://..." onChange={(event) => onPatch(node.id, item.id, { url: event.target.value })} />
                      {item.url ? <p className="text-xs font-semibold text-slate-500">Link externo configurado.</p> : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-purple-300 bg-purple-50/60 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-purple-700 shadow-sm">
                            <Icon className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">{mediaLabel}</p>
                            <p className="text-xs text-slate-600">Ate {mediaLimitMb}MB. Arquivo pronto para enviar no fluxo.</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Input
                            id={`flow2-media-file-${node.id}-${item.id}`}
                            type="file"
                            accept={getFlow2MediaAccept(item.type)}
                            className="hidden"
                            disabled={isUploadingThisMedia}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              void uploadMediaFile(item, file);
                              event.currentTarget.value = "";
                            }}
                          />
                          <Button type="button" className="bg-purple-600 hover:bg-purple-500" disabled={isUploadingThisMedia} asChild>
                            <label htmlFor={`flow2-media-file-${node.id}-${item.id}`} className="cursor-pointer">
                              {isUploadingThisMedia ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                              {item.url ? "Substituir" : `Anexar ${option.label.toLowerCase()}`}
                            </label>
                          </Button>
                          {item.url ? (
                            <Button type="button" variant="outline" onClick={() => onPatch(node.id, item.id, { url: "", fileName: "", mimeType: "", aiGenerated: false })}>
                              Remover
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {item.url ? (
                        <div className="mt-3 rounded-lg border border-white/80 bg-white p-3">
                          {item.type === "audio" ? <audio controls src={item.url} className="h-9 w-full max-w-full" /> : null}
                          {item.type === "image" || item.type === "sticker" ? <img src={item.url} alt={mediaLabel} className="max-h-44 rounded-md object-contain" /> : null}
                          {item.type === "video" ? <video controls src={item.url} className="max-h-52 w-full rounded-md bg-slate-900" /> : null}
                          {item.type === "file" ? (
                            <div className="flex items-center justify-between gap-3 text-sm text-slate-700">
                              <span className="truncate">{mediaLabel}</span>
                              <Button type="button" variant="outline" size="sm" asChild>
                                <a href={item.url} download={item.fileName || "arquivo"}>
                                  <Download className="mr-2 h-4 w-4" />
                                  Baixar
                                </a>
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {item.type === "image" ? (
                    <label className="flex items-center gap-2 rounded-lg border border-purple-100 bg-purple-50 px-3 py-2 text-sm text-slate-700">
                      <input type="checkbox" checked={item.oneView === true} onChange={(event) => onPatch(node.id, item.id, { oneView: event.target.checked })} />
                      Enviar em visualizacao unica
                    </label>
                  ) : null}

                  {item.type === "video" ? (
                    <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200 text-xs font-bold">
                      {[
                        ["normal", "Normal"],
                        ["autoplay", "Autoplay"],
                        ["message", "Video msg."],
                      ].map(([value, label]) => (
                        <button key={value} type="button" className={cn("px-2 py-2", item.videoMode === value ? "bg-purple-600 text-white" : "bg-white text-slate-600")} onClick={() => onPatch(node.id, item.id, { videoMode: value as Flow2MessageContent["videoMode"] })}>
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {item.type === "interval" ? (
                <div className="space-y-2">
                  <Label>Intervalo antes do proximo conteudo</Label>
                  <Input type="number" min={0} value={item.delaySeconds || 0} onChange={(event) => onPatch(node.id, item.id, { delaySeconds: Number(event.target.value || 0) })} />
                </div>
              ) : null}

              {item.type === "contact" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome do contato</Label>
                    <Input value={item.contactName || ""} onChange={(event) => onPatch(node.id, item.id, { contactName: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input value={item.contactPhone || ""} onChange={(event) => onPatch(node.id, item.id, { contactPhone: event.target.value })} />
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function normalizeDefinition(raw: any): Flow2Definition {
  if (!raw || !Array.isArray(raw.nodes)) return createDefaultDefinition();
  return {
    nodes: raw.nodes.map((node: any) => ({
      ...node,
      type: "flow2",
      position: node.position || { x: 80, y: 120 },
      data: {
        kind: node.id === "start" ? "start" : node.data?.kind || "message",
        title: node.data?.title || "Mensagem",
        description: node.data?.description || "",
        config: node.data?.config || {},
      },
    })),
    edges: Array.isArray(raw.edges) ? raw.edges : [],
    viewport: raw.viewport || { x: 0, y: 0, zoom: 1 },
  };
}

function LeonaFlow2Inner() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const reactFlow = useReactFlow();
  const [definition, setDefinition] = useState<Flow2Definition>(createDefaultDefinition());
  const [flowName, setFlowName] = useState("Fluxo 2.0");
  const [isActive, setIsActive] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("start");
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<{ sourceId: string; sourceHandle: string; label: string } | null>(null);
  const [testMessage, setTestMessage] = useState("quero");
  const [testResult, setTestResult] = useState<any>(null);

  const flowQuery = useQuery<Flow2Record>({
    queryKey: ["/api/agent/flow2"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/agent/flow2");
      return response.json();
    },
  });

  useEffect(() => {
    if (!flowQuery.data) return;
    setFlowName(flowQuery.data.name || "Fluxo 2.0");
    setIsActive(flowQuery.data.isActive === true);
    setIsArchived(flowQuery.data.isArchived === true);
    setSelectedNodeId(flowQuery.data.selectedNodeId || "start");
    setDefinition(normalizeDefinition(flowQuery.data.definition));
    setHasChanges(false);
  }, [flowQuery.data]);

  const selectedNode = useMemo(
    () => definition.nodes.find((node) => node.id === selectedNodeId) || null,
    [definition.nodes, selectedNodeId],
  );
  const editingNode = useMemo(
    () => definition.nodes.find((node) => node.id === editingNodeId) || null,
    [definition.nodes, editingNodeId],
  );

  const decoratedNodes = useMemo(
    () =>
      definition.nodes.map((node) => ({
        ...node,
        type: "flow2",
        data: {
          ...node.data,
          onEdit: setEditingNodeId,
          onDuplicate: (nodeId: string) => {
            const source = definition.nodes.find((item) => item.id === nodeId);
            if (!source || source.id === "start") return;
            const copy: Node<Flow2NodeData> = {
              ...source,
              id: `${source.data.kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
              position: { x: source.position.x + 40, y: source.position.y + 40 },
              data: { ...source.data, title: `${source.data.title} copia`, config: { ...source.data.config } },
            };
            setDefinition((current) => ({ ...current, nodes: [...current.nodes, copy] }));
            setSelectedNodeId(copy.id);
            setHasChanges(true);
          },
          onDelete: (nodeId: string) => {
            if (nodeId === "start") return;
            setDefinition((current) => ({
              ...current,
              nodes: current.nodes.filter((item) => item.id !== nodeId),
              edges: current.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
            }));
            setSelectedNodeId("start");
            setHasChanges(true);
          },
        },
      })),
    [definition.nodes],
  );

  const decoratedEdges = useMemo(
    () =>
      definition.edges.map((edge) => ({
        ...edge,
        type: edge.type || "smoothstep",
        animated: edge.animated ?? true,
        markerEnd: edge.markerEnd || { type: MarkerType.ArrowClosed, color: "#94a3b8" },
        style: {
          stroke: "#94a3b8",
          strokeWidth: 3,
          strokeDasharray: "7 6",
          ...(edge.style || {}),
        },
      })),
    [definition.edges],
  );

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<Flow2Record>) => {
      const response = await apiRequest("POST", "/api/agent/flow2", {
        name: payload.name ?? flowName,
        isActive: payload.isActive ?? isActive,
        isArchived: payload.isArchived ?? isArchived,
        selectedNodeId,
        definition,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/flow2"] });
      setHasChanges(false);
      toast({ title: "Fluxo 2.0 salvo", description: "Quando ativo, ele substitui a IA automatica deste cliente." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar", description: error?.message || "Nao foi possivel salvar o Fluxo 2.0.", variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/agent/flow2/test", {
        message: testMessage,
        conversationId: `flow2-ui-test-${Date.now()}`,
        reset: true,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setTestResult(data);
      toast({ title: "Teste executado", description: data?.handoffToAi ? "O fluxo chegou no bloco de IA." : "Resposta do Flow 2.0 gerada." });
    },
    onError: (error: any) => {
      toast({ title: "Erro no teste", description: error?.message || "Nao foi possivel testar o Fluxo 2.0.", variant: "destructive" });
    },
  });

  const addBlock = useCallback((kind: Flow2BlockKind, position?: { x: number; y: number }) => {
    setDefinition((current) => {
      const node = createNode(kind, current.nodes.length, position);
      const shouldAutoConnect =
        selectedNodeId &&
        current.nodes.some((item) => item.id === selectedNodeId) &&
        !current.edges.some((edge) => edge.source === selectedNodeId && edge.target === node.id);
      const selectedNode = current.nodes.find((item) => item.id === selectedNodeId);
      const sourceHandle = getDefaultSourceHandle(selectedNode?.data.kind, selectedNode?.data.config);
      setSelectedNodeId(node.id);
      setEditingNodeId(node.id);
      return {
        ...current,
        nodes: [...current.nodes, node],
        edges: shouldAutoConnect && sourceHandle
          ? [...current.edges, createFlow2Edge(selectedNodeId, node.id, { sourceHandle, targetHandle: "in" })]
          : current.edges,
      };
    });
    setLibraryOpen(false);
    setHasChanges(true);
  }, [selectedNodeId]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/agentezap-flow2-kind") as Flow2BlockKind;
    if (!kind) return;
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addBlock(kind, position);
  }, [addBlock, reactFlow]);

  const updateNodeData = useCallback((nodeId: string, nextData: Partial<Flow2NodeData>) => {
    setDefinition((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...nextData, config: nextData.config || node.data.config } }
          : node,
      ),
    }));
    setHasChanges(true);
  }, []);

  const updateNodeConfig = useCallback((nodeId: string, key: string, value: any) => {
    setDefinition((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, config: { ...node.data.config, [key]: value } } }
          : node,
      ),
    }));
    setHasChanges(true);
  }, []);

  const updateMessageItems = useCallback((nodeId: string, nextItems: Flow2MessageContent[]) => {
    setDefinition((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, config: { ...node.data.config, items: nextItems, text: nextItems.find((item) => item.type === "text")?.text || "" } } }
          : node,
      ),
    }));
    setHasChanges(true);
  }, []);

  const addMessageContent = useCallback((nodeId: string, type: Flow2MessageContentType) => {
    const node = definition.nodes.find((item) => item.id === nodeId);
    const items = normalizeMessageItems(node?.data.config || {});
    updateMessageItems(nodeId, [...items, createMessageContent(type)]);
  }, [definition.nodes, updateMessageItems]);

  const patchMessageContent = useCallback((nodeId: string, itemId: string, patch: Partial<Flow2MessageContent>) => {
    const node = definition.nodes.find((item) => item.id === nodeId);
    const items = normalizeMessageItems(node?.data.config || {});
    updateMessageItems(nodeId, items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }, [definition.nodes, updateMessageItems]);

  const addGeneratedAudioContent = useCallback((nodeId: string, afterItemId: string, audioItem: Flow2MessageContent) => {
    const node = definition.nodes.find((item) => item.id === nodeId);
    const items = normalizeMessageItems(node?.data.config || {});
    const index = items.findIndex((item) => item.id === afterItemId);
    const nextItems = [...items];
    nextItems.splice(index >= 0 ? index + 1 : nextItems.length, 0, audioItem);
    updateMessageItems(nodeId, nextItems);
  }, [definition.nodes, updateMessageItems]);

  const removeMessageContent = useCallback((nodeId: string, itemId: string) => {
    const node = definition.nodes.find((item) => item.id === nodeId);
    const items = normalizeMessageItems(node?.data.config || {});
    updateMessageItems(nodeId, items.filter((item) => item.id !== itemId));
  }, [definition.nodes, updateMessageItems]);

  const moveMessageContent = useCallback((nodeId: string, itemId: string, direction: -1 | 1) => {
    const node = definition.nodes.find((item) => item.id === nodeId);
    const items = normalizeMessageItems(node?.data.config || {});
    const index = items.findIndex((item) => item.id === itemId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    const nextItems = [...items];
    [nextItems[index], nextItems[nextIndex]] = [nextItems[nextIndex], nextItems[index]];
    updateMessageItems(nodeId, nextItems);
  }, [definition.nodes, updateMessageItems]);

  const updateConditionRules = useCallback((nodeId: string, nextRules: Flow2ConditionRule[]) => {
    setDefinition((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, config: { ...node.data.config, conditions: nextRules, matchText: "" } } }
          : node,
      ),
    }));
    setHasChanges(true);
  }, []);

  const addConditionRule = useCallback((nodeId: string) => {
    const node = definition.nodes.find((item) => item.id === nodeId);
    const rules = normalizeConditionRules(node?.data.config || {});
    updateConditionRules(nodeId, [...rules, createConditionRule()]);
  }, [definition.nodes, updateConditionRules]);

  const patchConditionRule = useCallback((nodeId: string, ruleId: string, patch: Partial<Flow2ConditionRule>) => {
    const node = definition.nodes.find((item) => item.id === nodeId);
    const rules = normalizeConditionRules(node?.data.config || {});
    updateConditionRules(nodeId, rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));
  }, [definition.nodes, updateConditionRules]);

  const removeConditionRule = useCallback((nodeId: string, ruleId: string) => {
    const node = definition.nodes.find((item) => item.id === nodeId);
    const rules = normalizeConditionRules(node?.data.config || {});
    updateConditionRules(nodeId, rules.filter((rule) => rule.id !== ruleId));
  }, [definition.nodes, updateConditionRules]);

  const onConnect = useCallback((connection: Connection) => {
    const source = connection.source || "";
    const target = connection.target || "";
    if (!source || !target || source === target) return;
    const sourceHandle = connection.sourceHandle || "next";
    setDefinition((current) => ({
      ...current,
      edges: addEdge(
        createFlow2Edge(source, target, { ...connection, sourceHandle, targetHandle: connection.targetHandle || "in" }),
        current.edges.filter((edge) => !(edge.source === source && String(edge.sourceHandle || "next") === sourceHandle)),
      ),
    }));
    setHasChanges(true);
  }, []);

  const connectRoute = useCallback((sourceId: string, sourceHandle: string, targetId: string) => {
    setDefinition((current) => {
      const nextEdges = current.edges.filter((edge) => !(edge.source === sourceId && String(edge.sourceHandle || "next") === sourceHandle));
      if (targetId === "__none__" || targetId === sourceId) {
        return { ...current, edges: nextEdges };
      }
      return {
        ...current,
        edges: [...nextEdges, createFlow2Edge(sourceId, targetId, { sourceHandle, targetHandle: "in" })],
      };
    });
    setHasChanges(true);
  }, []);

  const handleNodeClick = useCallback((_: unknown, node: Node<Flow2NodeData>) => {
    if (pendingRoute && node.id !== pendingRoute.sourceId) {
      connectRoute(pendingRoute.sourceId, pendingRoute.sourceHandle, node.id);
      setPendingRoute(null);
      setSelectedNodeId(node.id);
      return;
    }
    setSelectedNodeId(node.id);
  }, [connectRoute, pendingRoute]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setDefinition((current) => ({ ...current, edges: applyEdgeChanges(changes, current.edges) }));
    if (changes.length > 0) setHasChanges(true);
  }, []);

  const onReconnect = useCallback((oldEdge: Edge, connection: Connection) => {
    setDefinition((current) => ({
      ...current,
      edges: reconnectEdge(oldEdge, connection, current.edges).map((edge) =>
        edge.id === oldEdge.id
          ? {
              ...edge,
              sourceHandle: connection.sourceHandle || edge.sourceHandle || "next",
              targetHandle: connection.targetHandle || edge.targetHandle || "in",
              type: "smoothstep",
              animated: true,
              markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
              style: { stroke: "#94a3b8", strokeWidth: 3, strokeDasharray: "7 6" },
            }
          : edge,
      ),
    }));
    setHasChanges(true);
  }, []);

  const onNodesChange = useCallback((changes: any[]) => {
    setDefinition((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        const positionChange = changes.find((change) => change.id === node.id && change.type === "position" && change.position);
        return positionChange ? { ...node, position: positionChange.position } : node;
      }),
    }));
    if (changes.some((change) => change.type === "position")) setHasChanges(true);
  }, []);

  const clearFlow = () => {
    const shouldConfirm = definition.nodes.length > 1 || definition.edges.length > 0;
    if (
      shouldConfirm &&
      typeof window !== "undefined" &&
      !window.confirm("Limpar o Fluxo 2.0 em tela? A mudanca so sera aplicada quando voce salvar.")
    ) {
      return;
    }

    setDefinition(createDefaultDefinition());
    setSelectedNodeId("start");
    setEditingNodeId(null);
    setHasChanges(true);
  };

  const editingKind = editingNode?.data.kind || "message";

  return (
    <div className="flex h-full min-h-[820px] flex-col overflow-hidden bg-[#f7f8fb]" data-subscription-gate-ignore="true">
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label="Voltar">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <Workflow className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <Input value={flowName} onChange={(event) => { setFlowName(event.target.value); setHasChanges(true); }} className="h-10 w-full min-w-0 border-0 bg-transparent px-0 text-2xl font-bold shadow-none focus-visible:ring-0 sm:w-[260px]" />
            </div>
          </div>
          <div className="min-w-0 sm:pl-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700">Fluxo 2.0 separado</Badge>
              {hasChanges ? <Badge className="bg-amber-100 text-amber-800">Rascunho</Badge> : <Badge className="bg-emerald-100 text-emerald-800">Salvo</Badge>}
            </div>
            <p className="text-sm text-slate-500">Fluxo proprio. Quando ativo, substitui a IA automatica deste cliente.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center lg:gap-3">
          <Button type="button" variant="outline" className="w-full lg:w-auto" onClick={() => { setIsActive(true); setIsArchived(false); saveMutation.mutate({ isActive: true, isArchived: false }); }}>
            <Play className="mr-2 h-4 w-4" />
            Ativar
          </Button>
          <Button type="button" variant="outline" className="w-full lg:w-auto" onClick={() => { setIsArchived(true); setIsActive(false); saveMutation.mutate({ isArchived: true, isActive: false }); }}>
            <Boxes className="mr-2 h-4 w-4" />
            Arquivar
          </Button>
          <Button type="button" onClick={() => saveMutation.mutate({})} disabled={saveMutation.isPending} className="w-full bg-purple-700 hover:bg-purple-600 lg:w-auto">
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto bg-white">
        {libraryOpen ? (
        <aside className="absolute bottom-4 left-4 top-4 z-30 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Ferramentas</p>
              <p className="text-xs text-slate-500">Clique ou arraste para o canvas</p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => setLibraryOpen((value) => !value)} aria-label={libraryOpen ? "Fechar ferramentas" : "Abrir ferramentas"}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
            {BLOCKS.map((block) => {
              const Icon = block.icon;
              const palette = COLOR_CLASS[block.color] || COLOR_CLASS.blue;
              return (
                <button
                  key={block.kind}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/agentezap-flow2-kind", block.kind);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => addBlock(block.kind)}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-purple-200 hover:bg-purple-50/30"
                >
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-md", palette.icon)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800">{block.label}</span>
                    <span className="block truncate text-xs text-slate-500">{block.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
        ) : null}

        <div className="flex h-full min-h-[680px] min-w-[980px]">
        <main className="relative min-h-[680px] flex-1 bg-white">
          <ReactFlow
            nodes={decoratedNodes}
            edges={decoratedEdges}
            nodeTypes={nodeTypes}
            onConnect={onConnect}
            onEdgesChange={onEdgesChange}
            onReconnect={onReconnect}
            edgesReconnectable
            connectionMode={ConnectionMode.Loose}
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
            onNodesChange={onNodesChange}
            onNodeClick={handleNodeClick}
            connectionLineStyle={{ stroke: "#7c3aed", strokeWidth: 3, strokeDasharray: "7 6" }}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: true,
              markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
              style: { stroke: "#94a3b8", strokeWidth: 3, strokeDasharray: "7 6" },
            }}
            fitView
            fitViewOptions={{ padding: 0.65, maxZoom: 0.85 }}
            minZoom={0.35}
            maxZoom={1.4}
            className="bg-[#fbfcff]"
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#cbd5e1" />
            <Controls className="!left-4 !bottom-6 !rounded-lg !border !border-slate-200 !bg-white !shadow-lg" />
            <MiniMap pannable zoomable className="!right-6 !bottom-6 !h-40 !w-64 !rounded-xl !border !border-slate-200 !bg-white !shadow-xl" />
            <Panel position="top-left" className="ml-2 mt-3 flex max-w-[calc(100vw-2rem)] gap-2 overflow-x-auto rounded-lg pr-3 sm:ml-4 sm:mt-4">
              <Button type="button" className="shrink-0 bg-purple-700 shadow-sm hover:bg-purple-600" onClick={() => setLibraryOpen(true)} aria-label="Abrir blocos">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Blocos</span>
              </Button>
              <Button type="button" variant="outline" className="shrink-0 bg-white shadow-sm" onClick={clearFlow} aria-label="Limpar fluxo">
                <Trash2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Limpar</span>
              </Button>
              <Button type="button" variant="outline" className="shrink-0 bg-white shadow-sm" onClick={() => reactFlow.fitView({ padding: 0.65, duration: 300, maxZoom: 0.85 })} aria-label="Ver fluxo inteiro">
                <MousePointer2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Ver fluxo</span>
              </Button>
            </Panel>
            {pendingRoute ? (
              <Panel position="top-center" className="mt-4 rounded-lg border border-purple-200 bg-white px-4 py-3 shadow-lg">
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-semibold text-purple-900">Conectando: {pendingRoute.label}</span>
                  <span className="text-slate-500">Clique no bloco destino.</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setPendingRoute(null)}>Cancelar</Button>
                </div>
              </Panel>
            ) : null}
          </ReactFlow>
        </main>

        <aside className="min-h-0 w-[340px] shrink-0 overflow-y-auto border-l border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-sm font-bold text-slate-900">Montar fluxo</p>
            <p className="text-xs text-slate-500">Edite o bloco, conecte as saidas e ative quando estiver pronto.</p>
          </div>
          {selectedNode ? (
            <div className="space-y-4 p-5">
              <div className={cn("rounded-lg border bg-slate-50 p-4", pendingRoute?.sourceId === selectedNode.id ? "border-purple-300 ring-2 ring-purple-100" : "border-slate-200")}>
                <p className="text-sm font-bold text-slate-900">{selectedNode.data.title}</p>
                <p className="mt-1 text-xs text-slate-500">{selectedNode.data.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button type="button" className="bg-purple-700 hover:bg-purple-600" onClick={() => setEditingNodeId(selectedNode.id)}>
                  <Edit3 className="mr-2 h-4 w-4" />
                  Editar
                </Button>
                <Button type="button" variant="outline" className="bg-white" onClick={() => addBlock("ai")}>
                  <Bot className="mr-2 h-4 w-4" />
                  IA
                </Button>
              </div>

              {(() => {
                const routes = getRouteHandles(selectedNode);
                if (routes.length === 0) {
                  return (
                    <div className="rounded-lg border border-green-100 bg-green-50 p-4 text-xs text-green-700">
                      Este bloco entrega o atendimento para a IA do cliente.
                    </div>
                  );
                }
                return (
                  <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Conexoes</p>
                      <p className="mt-1 text-xs text-slate-500">Clique em Conectar e depois no bloco destino. Tambem pode arrastar pelas bolinhas.</p>
                    </div>
                    <div className="space-y-2">
                      {routes.map((route) => {
                        const edge = definition.edges.find((item) => item.source === selectedNode.id && String(item.sourceHandle || "next") === route.id);
                        const target = definition.nodes.find((node) => node.id === edge?.target);
                        const targets = definition.nodes.filter((node) => node.id !== selectedNode.id);
                        const isPending = pendingRoute?.sourceId === selectedNode.id && pendingRoute.sourceHandle === route.id;
                        return (
                          <div key={route.id} className={cn("space-y-2 rounded-md border px-3 py-2", isPending ? "border-purple-300 bg-purple-50" : "border-slate-200 bg-white")}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-slate-900">{route.label}</p>
                                <p className="truncate text-[11px] text-slate-500">{target ? `Destino: ${target.data.title}` : "Sem destino"}</p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant={isPending ? "default" : "outline"}
                                className={isPending ? "bg-purple-700 hover:bg-purple-600" : "bg-white"}
                                onClick={() => setPendingRoute(isPending ? null : { sourceId: selectedNode.id, sourceHandle: route.id, label: `${selectedNode.data.title} / ${route.label}` })}
                              >
                                {isPending ? "Aguardando" : "Conectar"}
                              </Button>
                            </div>
                            <Select value={edge?.target || "__none__"} onValueChange={(targetId) => connectRoute(selectedNode.id, route.id, targetId)}>
                              <SelectTrigger className="h-8 bg-white text-xs">
                                <SelectValue placeholder="Escolher destino" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Sem destino</SelectItem>
                                {targets.map((targetNode) => (
                                  <SelectItem key={`${route.id}-${targetNode.id}`} value={targetNode.id}>
                                    {targetNode.data.title || targetNode.data.kind}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {edge ? (
                              <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 px-0 text-xs text-slate-500 hover:text-red-600" onClick={() => connectRoute(selectedNode.id, route.id, "__none__")}>
                                Remover rota
                              </Button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="rounded-lg border border-purple-100 bg-purple-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-purple-900">Ativar fluxo</p>
                    <p className="text-xs text-purple-700">Ligado: Flow 2.0 responde antes da IA. Desligado: volta para a IA normal.</p>
                  </div>
                  <Switch checked={isActive} onCheckedChange={(checked) => { setIsActive(checked); setHasChanges(true); }} />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                <div>
                  <p className="text-sm font-bold text-slate-900">Testar fluxo</p>
                  <p className="mt-1 text-xs text-slate-500">Envia uma mensagem de teste pelo runtime do Flow 2.0.</p>
                </div>
                <div className="flex gap-2">
                  <Input value={testMessage} onChange={(event) => setTestMessage(event.target.value)} placeholder="Mensagem do cliente" />
                  <Button type="button" className="bg-slate-900 hover:bg-slate-800" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
                    <Play className="mr-2 h-4 w-4" />
                    Testar
                  </Button>
                </div>
                {testResult ? (
                  <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-700">
                    <p className="font-semibold text-slate-900">{testResult.handoffToAi ? "IA assumiu" : testResult.mode || "Flow 2.0"}</p>
                    <p className="mt-1 whitespace-pre-wrap">{testResult.response || testResult.message || "Sem texto direto. Verifique midias/acoes no retorno."}</p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="p-5 text-sm text-slate-500">Selecione um bloco no canvas.</div>
          )}
        </aside>
        </div>
      </div>

      {editingNode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-3 backdrop-blur-[1px]" onMouseDown={() => setEditingNodeId(null)}>
          <section
            className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button type="button" className="absolute right-4 top-4 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => setEditingNodeId(null)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
            <header className="border-b border-slate-100 px-6 py-5 text-center">
              <h2 className="text-lg font-semibold text-slate-900">Editar {editingNode.data.title}</h2>
              <p className="mt-2 text-sm text-slate-500">Campos do bloco no estilo Leona, salvos no Fluxo 2.0 separado.</p>
            </header>
            <div className="max-h-[64vh] space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome do bloco</Label>
                  <Input value={editingNode.data.title} onChange={(event) => updateNodeData(editingNode.id, { title: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={editingKind} onValueChange={(value) => updateNodeData(editingNode.id, { kind: value as Flow2BlockKind })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BLOCKS.map((block) => <SelectItem key={block.kind} value={block.kind}>{block.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {editingKind === "pix" ? (
                <div className="space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                  <div className="space-y-2">
                    <Label>Tipo da Chave PIX *</Label>
                    <Select value={editingNode.data.config.pixKeyType || "Telefone"} onValueChange={(value) => updateNodeConfig(editingNode.id, "pixKeyType", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Telefone">Telefone</SelectItem>
                        <SelectItem value="CPF">CPF</SelectItem>
                        <SelectItem value="CNPJ">CNPJ</SelectItem>
                        <SelectItem value="Email">Email</SelectItem>
                        <SelectItem value="Aleatoria">Aleatoria</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Chave PIX *</Label>
                    <Input value={editingNode.data.config.pixKey || ""} onChange={(event) => updateNodeConfig(editingNode.id, "pixKey", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Destinatario do pagamento</Label>
                    <Input value={editingNode.data.config.recipient || ""} onChange={(event) => updateNodeConfig(editingNode.id, "recipient", event.target.value)} />
                  </div>
                </div>
              ) : null}

              {editingKind === "message" ? (
                <MessageContentEditor
                  node={editingNode}
                  onAdd={addMessageContent}
                  onPatch={patchMessageContent}
                  onAddGeneratedAudio={addGeneratedAudioContent}
                  onRemove={removeMessageContent}
                  onMove={moveMessageContent}
                />
              ) : null}

              {editingKind === "menu" || editingKind === "carousel" ? (
                <div className="space-y-2">
                  <Label>{editingKind === "menu" ? "Opcoes do menu" : "Cards do carrossel"}</Label>
                  <Textarea rows={6} value={editingNode.data.config.options || editingNode.data.config.cards || ""} onChange={(event) => updateNodeConfig(editingNode.id, editingKind === "menu" ? "options" : "cards", event.target.value)} />
                </div>
              ) : null}

              {editingKind === "wait" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Aguardar pela resposta do cliente</Label>
                    <Input value={editingNode.data.config.waitFor || ""} onChange={(event) => updateNodeConfig(editingNode.id, "waitFor", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Tempo limite</Label>
                    <Input value={editingNode.data.config.timeout || ""} onChange={(event) => updateNodeConfig(editingNode.id, "timeout", event.target.value)} />
                  </div>
                </div>
              ) : null}

              {editingKind === "condition" ? (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <Label>Regra Logica</Label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name={`flow2-condition-logic-${editingNode.id}`}
                        checked={(editingNode.data.config.logic || "all") !== "any"}
                        onChange={() => updateNodeConfig(editingNode.id, "logic", "all")}
                      />
                      Regra corresponde a <strong>todas</strong> as condicoes (e)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name={`flow2-condition-logic-${editingNode.id}`}
                        checked={editingNode.data.config.logic === "any"}
                        onChange={() => updateNodeConfig(editingNode.id, "logic", "any")}
                      />
                      Regra corresponde a <strong>qualquer</strong> condicao (ou)
                    </label>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label>Condicoes</Label>
                      <Button type="button" className="bg-sky-700 hover:bg-sky-600" onClick={() => addConditionRule(editingNode.id)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar Condicao
                      </Button>
                    </div>

                    {normalizeConditionRules(editingNode.data.config || {}).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
                        <GitBranch className="mx-auto h-8 w-8 text-slate-500" />
                        <p className="mt-3 text-sm text-slate-500">Nenhuma condicao adicionada. Clique em Adicionar Condicao para comecar.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {normalizeConditionRules(editingNode.data.config || {}).map((condition, index) => {
                          const selectedOperator = CONDITION_OPERATORS.find((item) => item.value === condition.operator) || CONDITION_OPERATORS[0];
                          return (
                            <section key={condition.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="text-sm font-bold text-slate-900">Condicao {index + 1}</p>
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => removeConditionRule(editingNode.id, condition.id)} aria-label="Remover condicao">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr]">
                                <div className="space-y-2">
                                  <Label>Campo</Label>
                                  <Select value={condition.field} onValueChange={() => patchConditionRule(editingNode.id, condition.id, { field: "message" })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="message">Resposta do cliente</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Operador</Label>
                                  <Select value={condition.operator} onValueChange={(value) => patchConditionRule(editingNode.id, condition.id, { operator: value as Flow2ConditionRule["operator"] })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {CONDITION_OPERATORS.map((operator) => (
                                        <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Valor</Label>
                                  <Input
                                    value={condition.value}
                                    disabled={!selectedOperator.needsValue}
                                    placeholder="ex: quero comprar"
                                    onChange={(event) => patchConditionRule(editingNode.id, condition.id, { value: event.target.value })}
                                  />
                                </div>
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Saida positiva</Label>
                      <Input value={editingNode.data.config.positiveLabel || "Sim"} onChange={(event) => updateNodeConfig(editingNode.id, "positiveLabel", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Saida negativa</Label>
                      <Input value={editingNode.data.config.negativeLabel || "Nao"} onChange={(event) => updateNodeConfig(editingNode.id, "negativeLabel", event.target.value)} />
                    </div>
                  </div>
                </div>
              ) : null}

              {editingKind === "ai" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Instrucao para IA</Label>
                    <Textarea rows={4} value={editingNode.data.config.instruction || ""} onChange={(event) => updateNodeConfig(editingNode.id, "instruction", event.target.value)} />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-green-100 bg-green-50 p-4">
                    <div>
                      <p className="text-sm font-semibold text-green-900">IA assume a partir daqui</p>
                      <p className="text-xs text-green-700">Quando o fluxo chegar neste bloco, a resposta volta para a IA normal do cliente.</p>
                    </div>
                    <Switch checked={editingNode.data.config.handoff !== false} onCheckedChange={(checked) => updateNodeConfig(editingNode.id, "handoff", checked)} />
                  </div>
                </div>
              ) : null}

              {editingKind === "delay" ? (
                <div className="space-y-2">
                  <Label>Delay em segundos</Label>
                  <Input type="number" value={editingNode.data.config.seconds || 0} onChange={(event) => updateNodeConfig(editingNode.id, "seconds", Number(event.target.value || 0))} />
                </div>
              ) : null}

              {editingKind === "tags" || editingKind === "notification" || editingKind === "chat-control" || editingKind === "media" ? (
                <div className="space-y-2">
                  <Label>Configuracao</Label>
                  <Textarea rows={5} value={JSON.stringify(editingNode.data.config || {}, null, 2)} onChange={(event) => {
                    try {
                      updateNodeData(editingNode.id, { config: JSON.parse(event.target.value) });
                    } catch {
                      updateNodeConfig(editingNode.id, "raw", event.target.value);
                    }
                  }} />
                </div>
              ) : null}

              {(() => {
                const routes = getRouteHandles(editingNode);
                const targets = definition.nodes.filter((node) => node.id !== editingNode.id);
                if (routes.length === 0) return null;
                return (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <Label>Rotas deste bloco</Label>
                      <p className="mt-1 text-xs text-slate-500">Escolha para onde cada saida aponta. Duas saidas podem ir para o mesmo bloco.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {routes.map((route) => {
                        const currentTarget = definition.edges.find((edge) => edge.source === editingNode.id && String(edge.sourceHandle || "next") === route.id)?.target || "__none__";
                        return (
                          <div key={route.id} className="space-y-2">
                            <Label>{route.label}</Label>
                            <Select value={currentTarget} onValueChange={(targetId) => connectRoute(editingNode.id, route.id, targetId)}>
                              <SelectTrigger>
                                <SelectValue placeholder="Sem destino" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Sem destino</SelectItem>
                                {targets.map((target) => (
                                  <SelectItem key={`${route.id}-${target.id}`} value={target.id}>
                                    {target.data.title || target.data.kind}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
            <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setEditingNodeId(null)}>Cancelar</Button>
            <Button type="button" className="bg-purple-700 hover:bg-purple-600" onClick={() => setEditingNodeId(null)}>Concluir</Button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function LeonaFlow2Tab() {
  return (
    <ReactFlowProvider>
      <LeonaFlow2Inner />
    </ReactFlowProvider>
  );
}
