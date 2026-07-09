import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bot, Sparkles, MessageSquare, Edit3, 
  Loader2, Send, Code, Smartphone, Mic, Smile, Paperclip, Phone,
  CheckCircle2, Wand2, RefreshCw, Settings, Zap,
  Undo2, Redo2, History, ChevronUp, ChevronDown,
  Image as ImageIcon, Music, Video, FileText, Plus, Trash2, Upload, Check,
  Clock, Brain, Pause, X, Save, Pencil, File, Rocket, GitBranch, Workflow, Square,
  AlignLeft, MoveUp, MoveDown, Info, MoreVertical, GripVertical, Menu
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { repairReactNodeText } from "@/lib/repair-react-node";
import { getAuthToken, getAuthTokenFromStorage, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { formatWhatsAppTextForHtml } from "@/lib/whatsapp-format";
import { useLocation } from "wouter";
import { FlowTab } from "@/components/flow-tab";
import { LeonaFlow2Tab } from "@/components/leona-flow2-tab";
import { UserAudioRecorder } from "@/components/user-audio-recorder";
import {
  SubscriptionUpgradeDialog,
  type SubscriptionUpgradeDialogOverride,
} from "@/components/subscription-action-gate";
import { type SubscriptionGateModule, type UsageGateData } from "@/lib/subscription-gate";
import { repairMojibakeText } from "@shared/mojibake";
import {
  detectAgentSignatureNameFromPrompt,
  normalizeAgentSignatureName,
  resolveAgentSignatureName,
} from "@shared/agentSignature";
import {
  PROMPT_EDIT_REQUEST_MAX_ATTEMPTS,
  getPromptEditRetryDelayMs,
  isRetryablePromptEditMessage,
  isRetryablePromptEditStatus,
} from "@shared/promptEditRetry";
import { extractSseDataEvents } from "@shared/sseStream";

const FALLBACK_EDIT_PROMPT_ERROR =
  "Não foi possível processar a edição agora. Tente novamente em alguns segundos.";
const EDIT_AUDIO_TRANSCRIPTION_MAX_ATTEMPTS = 8;
const EDIT_AUDIO_TRANSCRIPTION_RETRY_BASE_DELAY_MS = 6000;
const EDIT_AUDIO_TRANSCRIPTION_RETRY_MAX_DELAY_MS = 15000;
const QUICK_EDIT_AUTH_MAX_ATTEMPTS = 3;
const QUICK_EDIT_AUTH_RETRY_DELAY_MS = 800;
const PERSONALIZE_CONFIRMATION_FLOW_MARKER = "PERSONALIZE_CONFIRMATION_FLOW_V827";

const MY_AGENT_ACTION_GATE_MODULE: SubscriptionGateModule = {
  id: "my-agent-actions",
  title: "Meu Agente IA",
  description: "Explore as abas, revise o contexto e teste seu agente no plano grátis.",
  benefit: "salvar, ativar e publicar ajustes do agente",
  benefits: [
    "Salvar mudanças direto no agente",
    "Ativar a IA no WhatsApp com segurança",
    "Usar mídias, regras e configurações avançadas",
  ],
  paths: ["/meu-agente-ia"],
};

type AgentMediaUploadResult = {
  success?: boolean;
  bucket: string;
  path: string;
  token?: string;
  storageUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  mediaType: string;
  transcription?: string;
};

async function uploadAgentMediaFileToStorage(file: File): Promise<AgentMediaUploadResult> {
  const initResponse = await apiRequest("POST", "/api/agent/media/upload-url", {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
  });
  const uploadInfo = await initResponse.json() as AgentMediaUploadResult;

  if (!uploadInfo?.bucket || !uploadInfo?.path || !uploadInfo?.token || !uploadInfo?.storageUrl) {
    throw new Error("Não foi possível preparar o upload da mídia.");
  }

  const { error } = await supabase.storage
    .from(uploadInfo.bucket)
    .uploadToSignedUrl(uploadInfo.path, uploadInfo.token, file);

  if (error) {
    throw new Error(error.message || "Falha ao enviar arquivo para o storage.");
  }

  return uploadInfo;
}

async function uploadAgentMediaFileForLibrary(file: File, options: { transcribeAudio?: boolean } = {}) {
  const uploadData = await uploadAgentMediaFileToStorage(file);

  if (options.transcribeAudio && uploadData.mediaType === "audio") {
    try {
      const response = await apiRequest("POST", "/api/agent/media/transcribe", {
        audioUrl: uploadData.storageUrl,
        mimeType: uploadData.mimeType || file.type || "audio/ogg",
      });
      const data = await response.json() as { transcription?: string };
      uploadData.transcription = repairMojibakeText(data.transcription || "").trim();
    } catch (error) {
      console.warn("[AgentMedia] Audio uploaded but transcription failed:", error);
    }
  }

  return uploadData;
}

function repairMojibake(value?: string | null): string {
  return repairMojibakeText(value ?? "");
}

function sanitizeEditPromptClientMessage(message?: string | null): string {
  const cleaned = repairMojibake(message).trim();
  if (!cleaned) {
    return FALLBACK_EDIT_PROMPT_ERROR;
  }
  return cleaned;
}

function sanitizeAgentStudioPublicMessage(message: unknown, fallback: string): string {
  const safe = sanitizeEditPromptClientMessage(String(message || ""));
  if (!safe || safe === FALLBACK_EDIT_PROMPT_ERROR) {
    return fallback;
  }
  return safe;
}

function sanitizeAgentStudioChatMessageForDisplay(role: string | undefined, content: unknown): string {
  const repaired = repairMojibake(String(content || ""));
  if (role === "user") {
    return repaired;
  }
  return repaired.trim();
}

function normalizeSimulatorMediaType(
  mediaType?: string | null,
  mediaUrl?: string | null,
): "image" | "video" | "audio" | "document" {
  const normalizedType = String(mediaType || "").trim().toLowerCase();
  const normalizedUrl = String(mediaUrl || "").trim().toLowerCase();

  if (
    normalizedType === "image" ||
    normalizedType.startsWith("image/") ||
    normalizedUrl.endsWith(".jpg") ||
    normalizedUrl.endsWith(".jpeg") ||
    normalizedUrl.endsWith(".png") ||
    normalizedUrl.endsWith(".gif") ||
    normalizedUrl.endsWith(".webp")
  ) {
    return "image";
  }

  if (
    normalizedType === "video" ||
    normalizedType.startsWith("video/") ||
    normalizedUrl.endsWith(".mp4") ||
    normalizedUrl.endsWith(".webm") ||
    normalizedUrl.endsWith(".mov")
  ) {
    return "video";
  }

  if (
    normalizedType === "audio" ||
    normalizedType.startsWith("audio/") ||
    normalizedUrl.endsWith(".mp3") ||
    normalizedUrl.endsWith(".ogg") ||
    normalizedUrl.endsWith(".opus") ||
    normalizedUrl.endsWith(".wav") ||
    normalizedUrl.endsWith(".m4a")
  ) {
    return "audio";
  }

  return "document";
}

function normalizeGreetingComparisonText(value?: string | null): string {
  const normalizedValue = repairMojibake(value).toLowerCase();
  let collapsed = "";
  let shouldInsertSpace = false;

  for (const character of normalizedValue) {
    const isWhitespace =
      character === " " ||
      character === "\n" ||
      character === "\r" ||
      character === "\t";

    if (isWhitespace) {
      shouldInsertSpace = collapsed.length > 0;
      continue;
    }

    if (shouldInsertSpace) {
      collapsed += " ";
      shouldInsertSpace = false;
    }

    collapsed += character;
  }

  return collapsed.trim();
}

function extractEditPromptErrorMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return sanitizeEditPromptClientMessage(parsed.message);
      }
      if (typeof parsed.error === "string" && parsed.error.trim()) {
        return sanitizeEditPromptClientMessage(parsed.error);
      }
    } catch {
      // Falls back to SSE/text parsing below.
    }
  }

  for (const line of trimmed.split("\n")) {
    if (!line.startsWith("data: ")) {
      continue;
    }

    try {
      const parsed = JSON.parse(line.slice(6));
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return sanitizeEditPromptClientMessage(parsed.message);
      }
      if (typeof parsed.feedbackMessage === "string" && parsed.feedbackMessage.trim()) {
        return sanitizeEditPromptClientMessage(parsed.feedbackMessage);
      }
    } catch {
      // Ignore malformed SSE frames and keep scanning.
    }
  }

  return sanitizeEditPromptClientMessage(trimmed);
}

function normalizeEditPromptFeedbackMessage(message?: string | null): string {
  const normalized = sanitizeEditPromptClientMessage(message);
  if (!normalized) {
    return FALLBACK_EDIT_PROMPT_ERROR;
  }

  if (isRetryablePromptEditMessage(normalized)) {
    return "⏳ O sistema está ocupado no momento. Você pode reenviar o ajuste em instantes para continuar sem perder o contexto.";
  }

  return normalized;
}

function normalizePromptEditBackendFeedbackMessage(message?: string | null): string {
  const cleaned = repairMojibake(message).trim();
  if (!cleaned) {
    return "";
  }

  if (isRetryablePromptEditMessage(cleaned)) {
    return "";
  }

  return cleaned;
}

function getEditAudioTranscriptionRetryDelayMs(attempt: number): number {
  return Math.min(EDIT_AUDIO_TRANSCRIPTION_RETRY_BASE_DELAY_MS * attempt, EDIT_AUDIO_TRANSCRIPTION_RETRY_MAX_DELAY_MS);
}

function buildEditPromptRetryStatusMessage(nextAttempt: number, maxAttempts: number, delayMs: number): string {
  const seconds = Math.max(1, Math.ceil(delayMs / 1000));
  return `O atendimento esta ocupado. Continuando automaticamente (${nextAttempt}/${maxAttempts}) em ${seconds}s...`;
}

function waitForEditPromptRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

const AGENT_EDIT_PROCESS_STEPS = [
  "Entendendo o pedido",
  "Conferindo as regras atuais",
  "Organizando o contexto do agente",
  "Testando uma conversa de exemplo",
  "Preparando o ajuste",
];

const SIMULATOR_PROCESS_STEPS = [
  "Lendo a conversa",
  "Conferindo o contexto do agente",
  "Montando a resposta",
  "Verificando midias e proximos passos",
];

function useRotatingProcessIndex(active: boolean, total: number, intervalMs = 2400): number {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active || total <= 1) {
      setIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % total);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [active, total, intervalMs]);

  return index;
}

function toCustomerProcessMessage(message?: string | null): string {
  const cleaned = repairMojibake(message).trim();
  if (!cleaned) {
    return "Organizando o contexto do agente";
  }

  return sanitizeEditPromptClientMessage(cleaned);
}

function CustomerProcessTimeline({
  steps,
  activeIndex,
  compact = false,
}: {
  steps: string[];
  activeIndex: number;
  compact?: boolean;
}) {
  const currentStep = steps[Math.min(activeIndex, steps.length - 1)] || steps[0] || "Preparando";

  if (compact) {
    return (
      <div className="flex items-center gap-2" role="status" aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#00A884]" />
        <span className="text-xs text-muted-foreground">{currentStep}</span>
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1" role="status" aria-live="polite">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span>{currentStep}</span>
      </div>
      <div className="grid gap-1 sm:grid-cols-5">
        {steps.map((step, index) => (
          <div
            key={step}
            className={cn(
              "h-1.5 rounded-full bg-slate-200",
              index <= activeIndex && "bg-primary",
            )}
            title={step}
          />
        ))}
      </div>
    </div>
  );
}

async function resolveQuickEditAuthToken(): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= QUICK_EDIT_AUTH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const memberToken =
        typeof window !== "undefined" ? window.localStorage.getItem("memberToken") : null;
      const supabaseToken = await getAuthToken();
      const fallbackToken =
        typeof window !== "undefined" ? getAuthTokenFromStorage() : null;
      const resolvedToken = memberToken || supabaseToken || fallbackToken;

      if (resolvedToken?.trim()) {
        return resolvedToken;
      }

      lastError = new Error("Não consegui validar sua sessão para editar o agente.");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(FALLBACK_EDIT_PROMPT_ERROR);
    }

    if (attempt < QUICK_EDIT_AUTH_MAX_ATTEMPTS) {
      await waitForEditPromptRetry(QUICK_EDIT_AUTH_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError || new Error("Não consegui validar sua sessão para editar o agente.");
}

function buildEditPromptErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return FALLBACK_EDIT_PROMPT_ERROR;
  }

  const message = normalizeEditPromptFeedbackMessage(error.message);
  if (!message || message.startsWith("HTTP ")) {
    return FALLBACK_EDIT_PROMPT_ERROR;
  }

  return message;
}

// Modal de upgrade estilo Lovable
interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  used: number;
  limit: number;
  type: "agent-edit" | "simulator";
}

function UpgradeModal({ isOpen, onClose, title, description, used, limit, type }: UpgradeModalProps) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-8 animate-in fade-in-50 zoom-in-95">
        {/* Badge decorativo */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 px-4 py-1 text-sm font-medium">
            Limite atingido
          </Badge>
        </div>
        
        {/* Ícone */}
        <div className="flex justify-center mb-6 pt-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center">
            <Rocket className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        
        {/* Título */}
        <h3 className="text-xl font-semibold text-white text-center mb-2">{repairMojibake(title)}</h3>
        
        {/* Barra de progresso */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-slate-400 mb-2">
            <span>{type === "agent-edit" ? "Uso" : "Mensagens hoje"}</span>
            <span className="text-emerald-400 font-medium">{used}/{limit}</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full" style={{width: "100%"}} />
          </div>
        </div>
        
        {/* Descrição */}
        <p className="text-slate-300 text-center text-sm mb-6">{repairMojibake(description)}</p>
        
        {/* Benefícios */}
        <div className="bg-slate-800/50 rounded-xl p-4 mb-6 border border-slate-700">
          <p className="text-emerald-400 text-sm font-medium mb-3">Com o Plus você libera:</p>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Mais edições e ajustes com IA</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Configuração e testes sem interromper o básico</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Mensagens rápidas e prioritárias no WhatsApp</span>
            </li>
          </ul>
        </div>
        
        {/* Botões */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            Agora não
          </Button>
          <Button
            onClick={() => window.location.href = "/plans"}
            className="flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:from-emerald-600 hover:to-cyan-600"
          >
            <Zap className="w-4 h-4 mr-2" />
            Ver planos
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============ INTERFACES ============
interface AgentConfig {
  id: string;
  prompt: string;
  isActive: boolean;
  model: string;
  triggerPhrases: string[];
  messageSplitChars: number;
  responseDelaySeconds: number;
  fetchHistoryOnFirstResponse: boolean;
  pauseOnManualReply: boolean;
  autoReactivateMinutes: number | null;
  customGreeting?: string | null;
  customAddress?: string | null;
  greetingVariation?: boolean;
  greetingEnabled?: boolean;
  aiSignatureEnabled?: boolean;
  aiSignature?: string | null;
  addressEnabled?: boolean;
  businessHoursEnabled?: boolean;
  businessHours?: Partial<Record<BusinessHoursKey, Partial<BusinessHoursDay>>> | null;
  offHoursMessageEnabled?: boolean;
  offHoursVariation?: boolean;
  offHoursMessage?: string | null;
}

interface FlowItem {
  id: string;
  order: number;
  type: 'media' | 'text';
  isGreeting?: boolean;
  storageUrl?: string;
  mediaType?: 'audio' | 'image' | 'video' | 'document';
  caption?: string;
  transcription?: string;
  fileName?: string;
  mimeType?: string;
  text?: string;
}

const GREETING_EXTRA_FLOW_NAME = "SAUDACAO_INFO_EXTRA";
type GreetingFlowMediaType = "image" | "audio" | "video" | "document";

interface MediaItem {
  id: string;
  name: string;
  mediaType: 'image' | 'audio' | 'video' | 'document' | 'flow';
  storageUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  durationSeconds?: number;
  description?: string;
  whenToUse?: string;
  caption?: string;
  transcription?: string;
  isPtt?: boolean;
  sendAlone?: boolean;
  suppressTextResponse?: boolean;
  isActive: boolean;
  displayOrder: number;
  flowItems?: FlowItem[];
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mediaTranscript?: string;
}

interface SimulatorMessage {
  id: string;
  role: "user" | "agent";
  message: string;
  time: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mediaTranscript?: string;
}

interface SimulatorSendPayload {
  text: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  customerMessageWasAudio?: boolean;
}

type AgentStudioSimulatorChatStorage = {
  version: 1;
  sessionId: string;
  messages: SimulatorMessage[];
  sentMedias: string[];
  savedAt: number;
};

type AgentStudioSimulatorServerMessage = {
  id?: string;
  role?: "user" | "assistant";
  content?: string;
  createdAt?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaName?: string | null;
};

const AGENT_STUDIO_SIMULATOR_CHAT_STORAGE_PREFIX = "agentezap:agent-studio-simulator-chat:v1:";
const AGENT_STUDIO_SIMULATOR_CHAT_MAX_STORED_MESSAGES = 180;

function createAgentStudioSimulatorSessionId(): string {
  const browserCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (browserCrypto?.randomUUID) {
    return `sim-${browserCrypto.randomUUID()}`;
  }

  if (browserCrypto?.getRandomValues) {
    const bytes = browserCrypto.getRandomValues(new Uint8Array(16));
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `sim-${token}`;
  }

  return `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function readAgentStudioSimulatorChatStorage(key: string): AgentStudioSimulatorChatStorage | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AgentStudioSimulatorChatStorage>;
    if (parsed.version !== 1 || !Array.isArray(parsed.messages)) return null;

    return {
      version: 1,
      sessionId: typeof parsed.sessionId === "string" && parsed.sessionId.trim()
        ? parsed.sessionId
        : createAgentStudioSimulatorSessionId(),
      messages: parsed.messages
        .filter((message): message is SimulatorMessage =>
          Boolean(message) &&
          (message.role === "user" || message.role === "agent") &&
          typeof message.message === "string" &&
          typeof message.time === "string",
        )
        .slice(-AGENT_STUDIO_SIMULATOR_CHAT_MAX_STORED_MESSAGES),
      sentMedias: Array.isArray(parsed.sentMedias)
        ? parsed.sentMedias.filter((item): item is string => typeof item === "string")
        : [],
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function writeAgentStudioSimulatorChatStorage(
  key: string,
  payload: Omit<AgentStudioSimulatorChatStorage, "version" | "savedAt">,
): void {
  if (typeof window === "undefined") return;

  try {
    const serializable: AgentStudioSimulatorChatStorage = {
      version: 1,
      sessionId: payload.sessionId || createAgentStudioSimulatorSessionId(),
      messages: payload.messages.slice(-AGENT_STUDIO_SIMULATOR_CHAT_MAX_STORED_MESSAGES),
      sentMedias: Array.from(new Set(payload.sentMedias)),
      savedAt: Date.now(),
    };
    window.localStorage.setItem(key, JSON.stringify(serializable));
  } catch {
    // Storage is best-effort; the simulator can still work without persistence.
  }
}

function removeAgentStudioSimulatorChatStorage(key: string): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function restoreAgentStudioSimulatorMessagesFromServer(messages: AgentStudioSimulatorServerMessage[] | undefined): SimulatorMessage[] {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message) => message && typeof message.content === "string")
    .slice(-AGENT_STUDIO_SIMULATOR_CHAT_MAX_STORED_MESSAGES)
    .map((message, index) => ({
      id: message.id || `sim-server-${index}`,
      role: message.role === "assistant" ? "agent" : "user",
      message: String(message.content || ""),
      time: message.createdAt
        ? new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      mediaUrl: message.mediaUrl || undefined,
      mediaType: normalizeSimulatorMediaType(message.mediaType, message.mediaUrl || undefined),
      mediaTranscript: message.mediaName || undefined,
    }));
}

async function fetchAgentStudioSimulatorSession(sessionId: string) {
  const response = await apiRequest("GET", `/api/agent/test-session?sessionId=${encodeURIComponent(sessionId)}`);
  if (!response.ok) return null;
  return response.json();
}

async function clearAgentStudioSimulatorSession(sessionId: string) {
  await apiRequest("DELETE", `/api/agent/test-session?sessionId=${encodeURIComponent(sessionId)}`).catch(() => null);
}

interface PromptHistoryEntry {
  id: string;
  prompt: string;
  instruction: string;
  timestamp: Date;
  summary: string;
  versionNumber?: number;
}

type Section = 'chat' | 'code' | 'media' | 'info' | 'config' | 'flow' | 'flow2';
type BusinessHoursKey = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom';

interface BusinessHoursDay {
  enabled: boolean;
  open: string;
  close: string;
}

type BusinessHoursMap = Record<BusinessHoursKey, BusinessHoursDay>;
type MobileView = "editor" | "simulator";

function normalizePromptText(value?: string | null): string {
  return repairMojibakeText(value || "");
}

const brazilPromptHistoryDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatPromptHistoryTimestamp(value?: Date | string | null): string {
  if (!value) return "Horário do Brasil indisponível";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Horário do Brasil indisponível";

  return `${brazilPromptHistoryDateFormatter.format(date)} (Brasil)`;
}

function reconcileGreetingFlowItems(rawItems: FlowItem[] | undefined, legacyGreetingText: string): FlowItem[] {
  const legacyGreetingKey = normalizeGreetingComparisonText(legacyGreetingText);
  let greetingAlreadyAssigned = false;

  const loadedItems = (rawItems || [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((item) =>
      item.type === "text" ||
      (item.type === "media" &&
        ["image", "audio", "video", "document"].includes(String(item.mediaType || "")) &&
        item.storageUrl)
    )
    .map((item, index) => {
      if (item.type !== "text") {
        return {
          ...item,
          order: index,
        };
      }

      const shouldPromoteLegacyGreeting =
        !greetingAlreadyAssigned &&
        !!legacyGreetingKey &&
        normalizeGreetingComparisonText(item.text) === legacyGreetingKey;
      const isGreeting = (item.isGreeting === true || shouldPromoteLegacyGreeting) && !greetingAlreadyAssigned;

      if (isGreeting) {
        greetingAlreadyAssigned = true;
      }

      return {
        ...item,
        order: index,
        isGreeting,
      };
    });

  if (!greetingAlreadyAssigned && legacyGreetingText.trim()) {
    loadedItems.unshift({
      id: `greeting-main-${Date.now().toString(36)}`,
      order: 0,
      type: "text",
      isGreeting: true,
      text: legacyGreetingText.trim(),
    });
  }

  return loadedItems.map((item, index) => ({
    ...item,
    order: index,
  }));
}

const BUSINESS_HOURS_LABELS: Record<BusinessHoursKey, string> = {
  seg: "Segunda",
  ter: "Terca",
  qua: "Quarta",
  qui: "Quinta",
  sex: "Sexta",
  sab: "Sabado",
  dom: "Domingo",
};

const VALID_SECTIONS: Section[] = ['chat', 'code', 'media', 'info', 'config', 'flow', 'flow2'];

function getSectionFromUrl(): Section {
  if (typeof window === "undefined") return "chat";

  const tab = new URLSearchParams(window.location.search).get("tab");
  return VALID_SECTIONS.includes(tab as Section) ? (tab as Section) : "chat";
}

function getInitialMobileView(): MobileView {
  if (typeof window === "undefined") return "simulator";

  return getMobileViewFromUrl() || "simulator";
}

function getMobileViewFromUrl(): MobileView | null {
  if (typeof window === "undefined") return null;

  const view = new URLSearchParams(window.location.search).get("mobile");
  return view === "editor" || view === "simulator" ? view : null;
}

function createDefaultBusinessHours(): BusinessHoursMap {
  return {
    seg: { enabled: true, open: "09:00", close: "18:00" },
    ter: { enabled: true, open: "09:00", close: "18:00" },
    qua: { enabled: true, open: "09:00", close: "18:00" },
    qui: { enabled: true, open: "09:00", close: "18:00" },
    sex: { enabled: true, open: "09:00", close: "18:00" },
    sab: { enabled: false, open: "", close: "" },
    dom: { enabled: false, open: "", close: "" },
  };
}

function normalizeBusinessHours(
  value?: Partial<Record<BusinessHoursKey, Partial<BusinessHoursDay>>> | null
): BusinessHoursMap {
  const defaults = createDefaultBusinessHours();

  if (!value) return defaults;

  const normalized = { ...defaults } as BusinessHoursMap;
  const dayKeys = Object.keys(defaults) as BusinessHoursKey[];

  for (const dayKey of dayKeys) {
    const source = value[dayKey];
    if (!source) continue;

    normalized[dayKey] = {
      enabled: source.enabled ?? defaults[dayKey].enabled,
      open: source.open ?? defaults[dayKey].open,
      close: source.close ?? defaults[dayKey].close,
    };
  }

  return normalized;
}

// ============ HELPER: FORMATAÇÃO WHATSAPP ============
function formatWhatsAppText(text: string): string {
  if (!text) return text;

  let formatted = text;
  
  // Preservar quebras de linha convertendo \n para <br>
  formatted = formatted.replace(/\n/g, '<br>');

  // *texto* = negrito
  formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
  
  // _texto_ = itálico
  formatted = formatted.replace(/\b_([^_]+)_\b/g, '<em>$1</em>');
  
  // ~texto~ = tachado
  formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
  
  // `texto` = monoespaçado
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-zinc-700 px-1 rounded text-sm">$1</code>');
  
  return formatted;
}

// ============ COMPONENTE PRINCIPAL ============
export function AgentStudioUnified() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [agentStudioLocation, setAgentStudioLocation] = useLocation();
  const { data: myAgentUsage } = useQuery<UsageGateData>({
    queryKey: ["/api/usage"],
    staleTime: 10_000,
  });
  const hasPaidMyAgentAccess = myAgentUsage?.hasActiveSubscription === true;
  const chatEndRef = useRef<HTMLDivElement>(null);
  const simulatorEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptEditorRef = useRef<HTMLTextAreaElement>(null);
  const mobileEditorMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileEditorMenuPanelRef = useRef<HTMLDivElement>(null);
  const previousAgentStudioPathRef = useRef<string | null>(null);
  
  // ============ ESTADO PRINCIPAL ============
  const [activeSection, setActiveSection] = useState<Section>(() => getSectionFromUrl());
  const [mobileView, setMobileView] = useState<MobileView>(() => getInitialMobileView());
  const [mobileEditorMenuOpen, setMobileEditorMenuOpen] = useState(false);
  const [myAgentUpgradeDialog, setMyAgentUpgradeDialog] = useState<{
    actionLabel: string | null;
    override: SubscriptionUpgradeDialogOverride | null;
  }>({ actionLabel: null, override: null });

  const requestMyAgentUpgrade = useCallback(
    (actionLabel: string, override?: SubscriptionUpgradeDialogOverride) => {
      setMyAgentUpgradeDialog({
        actionLabel,
        override: override || {
          title: "Assine Plus para aplicar esta ação",
          description:
            "No plano grátis você pode navegar, personalizar por IA e testar o agente. Para salvar, ativar ou usar recursos avançados, assine o Plus.",
          benefit: "aplicar esta mudança no agente",
        },
      });
    },
    [],
  );

  const closeMyAgentUpgradeDialog = useCallback(() => {
    setMyAgentUpgradeDialog({ actionLabel: null, override: null });
  }, []);

  const guardMyAgentAction = useCallback(
    (actionLabel: string, override?: SubscriptionUpgradeDialogOverride) => {
      if (hasPaidMyAgentAccess) {
        return true;
      }

      requestMyAgentUpgrade(actionLabel, override);
      return false;
    },
    [hasPaidMyAgentAccess, requestMyAgentUpgrade],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const currentPathname = url.pathname;
    const previousPathname = previousAgentStudioPathRef.current;
    previousAgentStudioPathRef.current = currentPathname;

    const requestedView = getMobileViewFromUrl();
    if (requestedView) {
      setMobileView(requestedView);
      return;
    }

    const isMyAgentPath = currentPathname.startsWith("/meu-agente-ia");
    const enteredMyAgentPath =
      isMyAgentPath && (!previousPathname || !previousPathname.startsWith("/meu-agente-ia"));

    if (enteredMyAgentPath) {
      setMobileView("simulator");
    }
  }, [agentStudioLocation]);
  
  // Estado do prompt
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  
  // Estado do chat de edição
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [editInput, setEditInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecordingEditAudio, setIsRecordingEditAudio] = useState(false);
  const [isUploadingEditAudio, setIsUploadingEditAudio] = useState(false);
  const [editProcessingStatus, setEditProcessingStatus] = useState("");
  const [awaitingPromptEditConfirmation, setAwaitingPromptEditConfirmation] = useState(false);
  const editRequestAbortRef = useRef<AbortController | null>(null);
  const editAudioUploadAbortRef = useRef<AbortController | null>(null);
  const editAudioTranscriptionAbortRef = useRef<AbortController | null>(null);
  
  // Sistema de Undo/Redo
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showHistory, setShowHistory] = useState(false);
  
  // Estado do simulador
  const [simulatorMessages, setSimulatorMessages] = useState<SimulatorMessage[]>([]);
  const [simulatorInput, setSimulatorInput] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatorSentMedias, setSimulatorSentMedias] = useState<string[]>([]); // 🆕 Mídias já enviadas
  const [simulatorChatHydrated, setSimulatorChatHydrated] = useState(false);
  const simulatorEpochRef = useRef(0);
  const simulatorSessionIdRef = useRef(createAgentStudioSimulatorSessionId());
  const editProcessIndex = useRotatingProcessIndex(isProcessing || isUploadingEditAudio, AGENT_EDIT_PROCESS_STEPS.length);
  const simulatorProcessIndex = useRotatingProcessIndex(isSimulating, SIMULATOR_PROCESS_STEPS.length);
  
  // Estado de configurações
  const [isActive, setIsActive] = useState(true);
  const [responseDelaySeconds, setResponseDelaySeconds] = useState(30);
  const [messageSplitChars, setMessageSplitChars] = useState(400);
  const [triggerPhrases, setTriggerPhrases] = useState<string[]>([]);
  const [newTriggerPhrase, setNewTriggerPhrase] = useState("");
  const [fetchHistoryOnFirstResponse, setFetchHistoryOnFirstResponse] = useState(true);
  const [pauseOnManualReply, setPauseOnManualReply] = useState(true);
  const [autoReactivateMinutes, setAutoReactivateMinutes] = useState<number | null>(null);
  const [customMinutesInput, setCustomMinutesInput] = useState<string>("");
  const [customGreeting, setCustomGreeting] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [greetingVariation, setGreetingVariation] = useState(false);
  const [greetingEnabled, setGreetingEnabled] = useState(false);
  const [greetingExtraFlowItems, setGreetingExtraFlowItems] = useState<FlowItem[]>([]);
  const [greetingExtraFlowDirty, setGreetingExtraFlowDirty] = useState(false);
  const [uploadingGreetingFlowItemId, setUploadingGreetingFlowItemId] = useState<string | null>(null);
  const [draggingGreetingFlowItemId, setDraggingGreetingFlowItemId] = useState<string | null>(null);
  const [aiSignatureEnabled, setAiSignatureEnabled] = useState(false);
  const [aiSignature, setAiSignature] = useState("");
  const [addressEnabled, setAddressEnabled] = useState(false);
  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(false);
  const [businessHours, setBusinessHours] = useState<BusinessHoursMap>(createDefaultBusinessHours);
  const [offHoursMessageEnabled, setOffHoursMessageEnabled] = useState(false);
  const [offHoursVariation, setOffHoursVariation] = useState(false);
  const [offHoursMessage, setOffHoursMessage] = useState(
    "Ola! No momento estamos fora do horario de atendimento. Retornaremos em breve!"
  );
  const manualAiSignature = normalizeAgentSignatureName(aiSignature);
  const detectedAiSignature = detectAgentSignatureNameFromPrompt(currentPrompt);
  const resolvedAiSignaturePreview =
    resolveAgentSignatureName({
      configuredSignature: aiSignature,
      prompt: currentPrompt,
    }) || "Agente";
  
  // Estado de mídias
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<MediaItem | null>(null);
  const [mediaForm, setMediaForm] = useState({
    name: "",
    mediaType: "audio" as "audio" | "image" | "video" | "document" | "flow",
    description: "",
    whenToUse: "",
    caption: "",
    transcription: "",
    isPtt: false,
    sendAlone: false,
    suppressTextResponse: false,
    isActive: true,
    flowItems: [] as FlowItem[],
  });
  const [uploadingFlowItemId, setUploadingFlowItemId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  
  // 🔒 Estado do modal de upgrade (estilo Lovable)
  const [upgradeModal, setUpgradeModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    used: number;
    limit: number;
    type: "agent-edit" | "simulator";
  }>({ isOpen: false, title: "", description: "", used: 0, limit: 0, type: "agent-edit" });

  // ============ QUERIES ============
  const { data: config, isLoading: configLoading } = useQuery<AgentConfig>({
    queryKey: ["/api/agent/config"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/config");
      return res.json();
    },
    staleTime: 30000,
  });
  const agentStudioSimulatorChatStorageKey = config?.id
    ? `${AGENT_STUDIO_SIMULATOR_CHAT_STORAGE_PREFIX}${config.id}`
    : null;

  const { data: mediaItems = [], isLoading: mediaLoading } = useQuery<MediaItem[]>({
    queryKey: ["/api/agent/media"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/media");
      return res.json();
    }
  });
  const greetingExtraFlowMedia = mediaItems.find(
    (media) => media.name === GREETING_EXTRA_FLOW_NAME && media.mediaType === "flow"
  );
  const visibleMediaItems = mediaItems.filter((media) => media.name !== GREETING_EXTRA_FLOW_NAME);

  // 🔀 PARTE 5: Query para saber se Modo Fluxo está ativo (afeta exibição do simulador)
  const { data: flowConfig } = useQuery<{ flowScript: string | null; flowModeActive: boolean }>({
    queryKey: ["/api/agent/flow"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/flow");
      return res.json();
    },
    staleTime: 10000,
  });
  const flowModeActive = flowConfig?.flowModeActive === true;

  const refreshPersonalizeUsageState = useCallback(() => undefined, []);

  useEffect(() => {
    setSimulatorChatHydrated(false);

    if (!agentStudioSimulatorChatStorageKey) {
      return;
    }

    const stored = readAgentStudioSimulatorChatStorage(agentStudioSimulatorChatStorageKey);
    if (stored) {
      simulatorSessionIdRef.current = stored.sessionId;
      setSimulatorMessages(stored.messages);
      setSimulatorSentMedias(stored.sentMedias);
    } else {
      simulatorSessionIdRef.current = createAgentStudioSimulatorSessionId();
      setSimulatorMessages([]);
      setSimulatorSentMedias([]);
    }

    setSimulatorChatHydrated(true);
  }, [agentStudioSimulatorChatStorageKey]);

  useEffect(() => {
    if (!agentStudioSimulatorChatStorageKey || !simulatorChatHydrated) {
      return;
    }

    let cancelled = false;
    const sessionId = simulatorSessionIdRef.current;

    fetchAgentStudioSimulatorSession(sessionId)
      .then((data) => {
        if (cancelled || simulatorSessionIdRef.current !== sessionId) return;
        const serverMessages = restoreAgentStudioSimulatorMessagesFromServer(data?.messages);
        if (serverMessages.length === 0) return;

        const serverSentMedias = (Array.isArray(data?.messages) ? data.messages : [])
          .map((message: AgentStudioSimulatorServerMessage) => message.mediaName)
          .filter((mediaName: unknown): mediaName is string => typeof mediaName === "string" && mediaName.trim().length > 0)
          .map((mediaName: string) => mediaName.toUpperCase());

        setSimulatorMessages(serverMessages);
        setSimulatorSentMedias(Array.from(new Set(serverSentMedias)));
        writeAgentStudioSimulatorChatStorage(agentStudioSimulatorChatStorageKey, {
          sessionId,
          messages: serverMessages,
          sentMedias: serverSentMedias,
        });
      })
      .catch(() => {
        // The local cache remains available if the server session cannot be loaded.
      });

    return () => {
      cancelled = true;
    };
  }, [agentStudioSimulatorChatStorageKey, simulatorChatHydrated]);

  useEffect(() => {
    if (!agentStudioSimulatorChatStorageKey || !simulatorChatHydrated) {
      return;
    }

    writeAgentStudioSimulatorChatStorage(agentStudioSimulatorChatStorageKey, {
      sessionId: simulatorSessionIdRef.current,
      messages: simulatorMessages,
      sentMedias: simulatorSentMedias,
    });
  }, [
    agentStudioSimulatorChatStorageKey,
    simulatorChatHydrated,
    simulatorMessages,
    simulatorSentMedias,
  ]);

  // Estado para controlar se o histórico já foi carregado
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const lastConfigPromptRef = useRef("");
  
  // Estado de restauração (loading)
  const [isRestoring, setIsRestoring] = useState(false);
  
  // Reset versionsLoaded quando config muda (navegação)
  useEffect(() => {
    return () => {
      editRequestAbortRef.current?.abort();
      editAudioUploadAbortRef.current?.abort();
      editAudioTranscriptionAbortRef.current?.abort();
      setVersionsLoaded(false);
      setHistoryLoaded(false);
    };
  }, []);

  // Query para carregar histórico do chat de edição
  const { data: savedChatHistory } = useQuery<{ success: boolean; messages: { id: string; role: string; content: string; createdAt: string }[] }>({
    queryKey: ["/api/agent/prompt-chat"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/prompt-chat");
      return res.json();
    },
    refetchOnMount: 'always' // Sempre refazer quando componente é montado
  });

  // Query para carregar versões do prompt do banco
  const { data: promptVersionsData } = useQuery<{ success: boolean; versions: { id: string; versionNumber: number; promptContent: string; editSummary: string; isCurrent: boolean; createdAt: string }[] }>({
    queryKey: ["/api/agent/prompt-versions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/prompt-versions");
      return res.json();
    },
    refetchOnMount: 'always' // Sempre refazer quando componente é montado
  });

  // Carregar versões do prompt para o histórico
  useEffect(() => {
    if (promptVersionsData?.versions && promptVersionsData.versions.length > 0) {
      console.log("[VERSIONS] 📚 Carregando", promptVersionsData.versions.length, "versões do banco");
      
      const versions: PromptHistoryEntry[] = promptVersionsData.versions
        .slice()
        .sort((a, b) => a.versionNumber - b.versionNumber)
        .map(v => {
          console.log(`[VERSIONS] v${v.versionNumber}: ID=${v.id}, isCurrent=${v.isCurrent}, summary="${v.editSummary}"`);
          return {
            id: v.id, // 🔥 ID ÚNICO de cada versão
            prompt: normalizePromptText(v.promptContent),
            instruction: repairMojibakeText(v.editSummary || `Versão ${v.versionNumber}`),
            timestamp: new Date(v.createdAt),
            summary: repairMojibakeText(v.editSummary || `Versão ${v.versionNumber}`),
            versionNumber: v.versionNumber
          };
        });
      
      setPromptHistory(versions);
      
      // Set index to current version
      const currentIndex = versions.findIndex(v => v.id === promptVersionsData.versions.find(pv => pv.isCurrent)?.id);
      const finalIndex = currentIndex >= 0 ? currentIndex : versions.length - 1;
      
      console.log(`[VERSIONS] ✅ ${versions.length} versões carregadas, índice atual: ${finalIndex}`);
      setHistoryIndex(finalIndex);
      setVersionsLoaded(true);
    }
  }, [promptVersionsData]);

  // Carregar histórico do chat de edição quando disponível (apenas uma vez)
  useEffect(() => {
    if (savedChatHistory?.messages && savedChatHistory.messages.length > 0 && !historyLoaded) {
      setHistoryLoaded(true);
      const messages: ChatMessage[] = savedChatHistory.messages.map(m => ({
        id: m.id,
        role: m.role as "user" | "assistant" | "system",
        content: repairMojibakeText(m.content),
        timestamp: new Date(m.createdAt)
      }));
      setChatMessages(messages);
    }
  }, [savedChatHistory, historyLoaded]);

  // ============ MUTATIONS ============
  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<AgentConfig>) => {
      console.log("[MUTATION] 💾 Enviando para /api/agent/config:", JSON.stringify(data).substring(0, 200));
      const res = await apiRequest("POST", "/api/agent/config", data);
      const result = await res.json();
      console.log("[MUTATION] ✅ Resposta:", JSON.stringify(result).substring(0, 200));
      return result;
    },
    onSuccess: async (data, variables) => {
      if (data && typeof data === "object") {
        queryClient.setQueryData(["/api/agent/config"], data);
      }

      // 🔄 Invalidar todas as queries relacionadas para forçar refetch
      console.log("[MUTATION] 🔄 Invalidando queries...");
      await queryClient.invalidateQueries({ queryKey: ["/api/agent/config"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/agent/prompt-versions"] });
      
      console.log("[MUTATION] 🔄 Queries invalidadas - UI será atualizada");
      
      // Feedback diferente se foi salvamento de prompt
      if (variables.prompt) {
        toast({ 
          title: "✅ Instruções salvas!", 
          description: "Nova versão criada no histórico automaticamente." 
        });
      } else {
        toast({ 
          title: "✅ Salvo!", 
          description: "Configurações atualizadas." 
        });
      }
    },
    onError: (error) => {
      console.error("[MUTATION] ❌ Erro:", error);
      toast({ title: "Erro", variant: "destructive" });
    }
  });

  const uploadMediaMutation = useMutation({
    mutationFn: async (data: { 
      file: File; 
      name: string; 
      mediaType: string;
      description: string; 
      whenToUse: string; 
      caption: string; 
      transcription: string;
      isPtt: boolean; 
      sendAlone: boolean;
      suppressTextResponse: boolean;
      isActive: boolean;
    }) => {
      const uploadData = await uploadAgentMediaFileForLibrary(data.file, { transcribeAudio: true });
      
      // 2. Salvar registro no banco de dados
      const mediaData = {
        name: data.name || data.file.name.replace(/\.[^/.]+$/, "").toUpperCase().replace(/[^A-Z0-9]/g, "_"),
        mediaType: data.mediaType || uploadData.mediaType,
        storageUrl: uploadData.storageUrl,
        fileName: uploadData.fileName,
        fileSize: uploadData.fileSize,
        mimeType: uploadData.mimeType,
        description: data.description || `Mídia: ${data.name}`,
        whenToUse: data.whenToUse,
        caption: data.caption,
        transcription: data.transcription || uploadData.transcription,
        isPtt: data.isPtt,
        sendAlone: data.sendAlone,
        suppressTextResponse: data.suppressTextResponse,
        isActive: data.isActive
      };
      
      const saveRes = await apiRequest("POST", "/api/agent/media", mediaData);
      return saveRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/media"] });
      toast({ title: "Mídia salva!", description: "Arquivo adicionado." });
      closeMediaDialog();
    },
    onError: () => {
      toast({ title: "Erro", variant: "destructive" });
    }
  });

  const updateMediaMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<MediaItem> & { flowItems?: FlowItem[] } }) => {
      const res = await apiRequest("PUT", `/api/agent/media/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/media"] });
      toast({ title: "Atualizado!", description: "Mídia atualizada." });
      closeMediaDialog();
    }
  });

  const deleteMediaMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/agent/media/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/media"] });
      toast({ title: "Removido!", description: "Mídia removida." });
    }
  });

  // Mutation para criar fluxo (sem upload de arquivo)
  const createFlowMediaMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/agent/media", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/media"] });
      toast({ title: "Fluxo criado!", description: "Fluxo adicionado à biblioteca." });
      closeMediaDialog();
    },
    onError: () => {
      toast({ title: "Erro", variant: "destructive" });
    }
  });

  // ============ EFFECTS ============
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      setActiveSection(getSectionFromUrl());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === activeSection) return;

    url.searchParams.set("tab", activeSection);
    window.history.pushState({ tab: activeSection }, "", `${url.pathname}${url.search}${url.hash}`);
  }, [activeSection]);

  useEffect(() => {
    if (config) {
      const normalizedPrompt = normalizePromptText(config.prompt);
      const canSyncPrompt =
        !hasChanges ||
        currentPrompt === lastConfigPromptRef.current ||
        normalizedPrompt === currentPrompt;

      if (canSyncPrompt) {
        setCurrentPrompt(normalizedPrompt);
      }
      lastConfigPromptRef.current = normalizedPrompt;
      setIsActive(config.isActive ?? true);
      setResponseDelaySeconds(config.responseDelaySeconds || 30);
      setMessageSplitChars(config.messageSplitChars || 400);
      setTriggerPhrases(config.triggerPhrases || []);
      setFetchHistoryOnFirstResponse(config.fetchHistoryOnFirstResponse ?? true);
      setPauseOnManualReply(config.pauseOnManualReply ?? true);
      const configMinutes = (config as any).autoReactivateMinutes ?? null;
      setAutoReactivateMinutes(configMinutes);
      setCustomGreeting(config.customGreeting ?? "");
      setCustomAddress(config.customAddress ?? "");
      setGreetingVariation(config.greetingVariation ?? false);
      setGreetingEnabled(config.greetingEnabled ?? false);
      setAiSignatureEnabled(config.aiSignatureEnabled ?? false);
      setAiSignature(config.aiSignature ?? "");
      setAddressEnabled(config.addressEnabled ?? false);
      setBusinessHoursEnabled(config.businessHoursEnabled ?? false);
      setBusinessHours(normalizeBusinessHours(config.businessHours));
      setOffHoursMessageEnabled(config.offHoursMessageEnabled ?? false);
      setOffHoursVariation(config.offHoursVariation ?? false);
      setOffHoursMessage(
        config.offHoursMessage || "Ola! No momento estamos fora do horario de atendimento. Retornaremos em breve!"
      );
      // Inicializa campo custom se for valor personalizado
      if (configMinutes !== null && ![10, 30, 60, 120].includes(configMinutes)) {
        setCustomMinutesInput(String(configMinutes));
      }
      
      // Inicializa histórico
      if (promptHistory.length === 0 && normalizedPrompt) {
        setPromptHistory([{
          id: "initial",
          prompt: normalizedPrompt,
          instruction: "Configuração inicial",
          timestamp: new Date(),
          summary: "Versão original"
        }]);
        setHistoryIndex(0);
      }
      
      // Mensagem de boas-vindas (apenas se não tiver histórico carregado)
      if (chatMessages.length === 0 && !historyLoaded) {
        setChatMessages([
          {
            id: "welcome-1",
            role: "assistant",
            content: "Oi! Sou seu assistente de Inteligência Artificial. Comigo você não precisa mexer em códigos complicados.",
            timestamp: new Date(),
          },
          {
            id: "welcome-2",
            role: "assistant",
            content: "Diga o que você quer mudar no comportamento do seu robô e eu ajustarei tudo agora mesmo.",
            timestamp: new Date(),
          },
        ]);
      }
    }
  }, [config, currentPrompt, hasChanges, historyLoaded]);

  const syncPromptState = useCallback((nextPrompt: string) => {
    const normalizedPrompt = normalizePromptText(nextPrompt);
    lastConfigPromptRef.current = normalizedPrompt;
    setCurrentPrompt(normalizedPrompt);
    setHasChanges(false);
    queryClient.setQueryData<AgentConfig | null>(["/api/agent/config"], (previousConfig) => {
      if (!previousConfig) {
        return previousConfig;
      }

      return {
        ...previousConfig,
        prompt: normalizedPrompt,
      };
    });

    return normalizedPrompt;
  }, [queryClient]);

  const logQuickEditStatus = useCallback((message: string, metadata?: Record<string, unknown>) => {
    const normalizedMessage = sanitizeEditPromptClientMessage(message);
    setEditProcessingStatus(normalizedMessage);

    if (metadata && Object.keys(metadata).length > 0) {
      console.log("[QuickEdit]", normalizedMessage, metadata);
      return;
    }

    console.log("[QuickEdit]", normalizedMessage);
  }, []);

  const resetQuickEditControllers = useCallback(() => {
    editRequestAbortRef.current = null;
    editAudioUploadAbortRef.current = null;
    editAudioTranscriptionAbortRef.current = null;
  }, []);

  const stopActiveQuickEdit = useCallback(() => {
    console.warn("[QuickEdit] Cancelamento solicitado pelo usuário.");
    editRequestAbortRef.current?.abort();
    editAudioUploadAbortRef.current?.abort();
    editAudioTranscriptionAbortRef.current?.abort();
    setIsRecordingEditAudio(false);
    setEditProcessingStatus("Edição interrompida por você.");
  }, []);

  useEffect(() => {
    if (greetingExtraFlowDirty) return;
    const legacyGreetingText = repairMojibake(customGreeting).trim();
    setGreetingExtraFlowItems(reconcileGreetingFlowItems(greetingExtraFlowMedia?.flowItems, legacyGreetingText));
  }, [customGreeting, greetingExtraFlowDirty, greetingExtraFlowMedia]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    simulatorEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [simulatorMessages]);

  // ============ FUNÇÕES DE HISTÓRICO ============
  const addToHistory = useCallback((newPrompt: string, instruction: string, summary: string) => {
    const newEntry: PromptHistoryEntry = {
      id: `history-${Date.now()}`,
      prompt: newPrompt,
      instruction,
      timestamp: new Date(),
      summary
    };
    const newHistory = [...promptHistory.slice(0, historyIndex + 1), newEntry];
    setPromptHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [promptHistory, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < promptHistory.length - 1;
  const isMyAgentFreeTrialSection =
    activeSection === "chat" ||
    activeSection === "code" ||
    activeSection === "info" ||
    activeSection === "config";

  const previewPromptHistoryIndex = useCallback((index: number) => {
    const entry = promptHistory[index];
    if (!entry) return;

    const normalizedPrompt = normalizePromptText(entry.prompt);
    setCurrentPrompt(normalizedPrompt);
    setHistoryIndex(index);
    setHasChanges(normalizedPrompt !== normalizePromptText(config?.prompt));
    setMobileView("editor");
  }, [config?.prompt, promptHistory]);

  const handlePreviousPromptVersion = useCallback(() => {
    if (historyIndex <= 0) return;
    previewPromptHistoryIndex(historyIndex - 1);
  }, [historyIndex, previewPromptHistoryIndex]);

  const handleNextPromptVersion = useCallback(() => {
    if (historyIndex >= promptHistory.length - 1) return;
    previewPromptHistoryIndex(historyIndex + 1);
  }, [historyIndex, previewPromptHistoryIndex, promptHistory.length]);

  const handleUndo = useCallback(() => {
    if (canUndo) {
      const newIndex = historyIndex - 1;
      const previousEntry = promptHistory[newIndex];
      setCurrentPrompt(normalizePromptText(previousEntry.prompt));
      setHistoryIndex(newIndex);
      setHasChanges(true);
      setChatMessages(prev => [...prev, {
        id: `system-undo-${Date.now()}`,
        role: "system",
        content: `⏪ Desfez: "${previousEntry.instruction}"`,
        timestamp: new Date()
      }]);
    }
  }, [canUndo, historyIndex, promptHistory]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      const newIndex = historyIndex + 1;
      const nextEntry = promptHistory[newIndex];
      setCurrentPrompt(normalizePromptText(nextEntry.prompt));
      setHistoryIndex(newIndex);
      setHasChanges(true);
      setChatMessages(prev => [...prev, {
        id: `system-redo-${Date.now()}`,
        role: "system",
        content: `⏩ Refez: "${nextEntry.instruction}"`,
        timestamp: new Date()
      }]);
    }
  }, [canRedo, historyIndex, promptHistory]);

  const openPromptHistory = useCallback(() => {
    setActiveSection("code");
    setMobileView("editor");
    setShowHistory(true);
  }, []);

  const focusPromptEditor = useCallback(() => {
    if (typeof window === "undefined") return;

    window.setTimeout(() => {
      const editor = promptEditorRef.current;
      if (!editor) return;

      editor.focus();
      const cursorPosition = editor.value.length;
      editor.setSelectionRange(cursorPosition, cursorPosition);
    }, 0);
  }, []);

  const handleResetPrompt = useCallback(() => {
    const resetPrompt = normalizePromptText(".");

    setActiveSection("code");
    setMobileView("editor");
    setShowHistory(false);
    setEditInput("");

    if (normalizePromptText(currentPrompt) === resetPrompt) {
      focusPromptEditor();
      toast({
        title: "Instruções prontas para editar",
        description: "As instruções já estão em \".\" para você reescrever.",
      });
      return;
    }

    addToHistory(resetPrompt, "Resetou as instruções", "Instruções limpas para recomeçar");
    setCurrentPrompt(resetPrompt);
    setHasChanges(true);
    setChatMessages((prev) => [
      ...prev,
      {
        id: `system-reset-${Date.now()}`,
        role: "system",
        content: '🧹 Instruções limpas para ".". Agora você pode reescrever o agente.',
        timestamp: new Date(),
      },
    ]);
    focusPromptEditor();
    toast({
      title: "Instruções limpas",
      description: "Revise o novo conteúdo e salve quando terminar.",
    });
  }, [addToHistory, currentPrompt, focusPromptEditor, toast]);

  const restoreFromHistory = useCallback(async (index: number) => {
    const entry = promptHistory[index];
    console.log("\n[RESTORE] ═══════════════════════════════════════════════════════");
    console.log("[RESTORE] 🔄 Restaurando versão");
    console.log("[RESTORE] Index no array:", index);
    console.log("[RESTORE] Instruction:", entry?.instruction);
    console.log("[RESTORE] Version ID (ÚNICO):", entry?.id);
    console.log("[RESTORE] Prompt length:", entry?.prompt?.length);
    
    if (!entry || !entry.id) {
      console.error("[RESTORE] ❌ Entrada inválida ou sem ID");
      console.log("[RESTORE] ═══════════════════════════════════════════════════════\n");
      toast({
        title: "Erro ao restaurar",
        description: "Versão inválida",
        variant: "destructive"
      });
      return;
    }
    
    // Prevenir cliques múltiplos
    if (isRestoring) {
      console.log("[RESTORE] ⏳ Já está restaurando, ignorando clique duplicado");
      return;
    }
    
    try {
      setIsRestoring(true);
      setShowHistory(false);
      
      toast({
        title: "⏳ Restaurando versão...",
        description: "Aguarde, processando restauração"
      });
      
      // 🔥 CRÍTICO: Usar rota de restore que cria NOVA versão com ID ÚNICO
      console.log("[RESTORE] 📡 POST /api/agent/prompt-versions/" + entry.id + "/restore");
      const response = await apiRequest("POST", `/api/agent/prompt-versions/${entry.id}/restore`, {});
      const data = await response.json();
      
      if (data.success && data.newPrompt) {
        console.log("[RESTORE] ✅ SUCESSO!");
        console.log("[RESTORE] 🆕 Nova versão criada: v" + data.versionNumber + " (ID: " + data.versionId + ")");
        console.log("[RESTORE] 📋 Restaurada da versão: v" + data.restoredFrom);
        console.log("[RESTORE] 📏 Novo prompt length:", data.newPrompt.length);
        
        // Atualizar UI local
        syncPromptState(data.newPrompt);
        
        // 🔄 CRÍTICO: Forçar refetch para carregar NOVA versão criada
        console.log("[RESTORE] 🔄 Invalidando queries para recarregar histórico...");
        await queryClient.invalidateQueries({ queryKey: ["/api/agent/prompt-versions"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/agent/config"] });
        console.log("[RESTORE] ✅ Queries invalidadas - UI será atualizada");
        
        setChatMessages(prev => [...prev, {
          id: `system-restore-${Date.now()}`,
          role: "system",
          content: `🔄 Restaurado da v${data.restoredFrom} → Nova v${data.versionNumber} criada (ID: ${data.versionId})`,
          timestamp: new Date()
        }]);
        
        toast({
          title: "✅ Versão restaurada",
          description: `Restaurado da v${data.restoredFrom}. Nova versão v${data.versionNumber} criada.`
        });
        
        console.log("[RESTORE] ═══════════════════════════════════════════════════════\n");
      } else {
        throw new Error(data.message || "Falha ao restaurar");
      }
    } catch (error: any) {
      console.error("[RESTORE] ❌ ERRO:", error);
      console.log("[RESTORE] ═══════════════════════════════════════════════════════\n");
      toast({
        title: "Erro ao restaurar versão",
        variant: "destructive"
      });
    } finally {
      setIsRestoring(false);
    }
  }, [isRestoring, promptHistory, queryClient, syncPromptState, toast]);

  // ============ EDIÇÃO VIA CHAT COM STREAMING ============
  const handleEditPrompt = async (
    instructionOverride?: string,
    messageOptions?: Pick<ChatMessage, "mediaUrl" | "mediaType">,
  ) => {
    const normalizedInstruction = repairMojibake(instructionOverride ?? editInput).trim();
    if (!normalizedInstruction || isProcessing) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: normalizedInstruction,
      timestamp: new Date(),
      ...messageOptions,
    };
    
    const currentInstruction = normalizedInstruction;
    const currentPromptSnapshot = currentPrompt;
    setChatMessages(prev => [...prev, userMessage]);
    setEditInput("");
    setIsProcessing(true);
    setIsRecordingEditAudio(false);
    logQuickEditStatus("Preparando ajuste do agente...", {
      promptLength: currentPromptSnapshot.length,
      instructionLength: currentInstruction.length,
      hasMedia: Boolean(messageOptions?.mediaUrl),
    });

    // Criar mensagem placeholder que vai receber os logs
    const processingMessageId = `processing-${Date.now()}`;
    const processingMessage: ChatMessage = {
      id: processingMessageId,
      role: "assistant",
      content: "Aplicando ajuste no seu agente...",
      timestamp: new Date()
    };
    setChatMessages(prev => [...prev, processingMessage]);

    const updateProcessingMessage = (content: string, consoleMessage?: string) => {
      setChatMessages(prev => prev.map(msg =>
        msg.id === processingMessageId
          ? { ...msg, content }
          : msg
      ));

      logQuickEditStatus(consoleMessage || content);
    };

    const clearProcessingMessage = (consoleMessage: string) => {
      setChatMessages(prev => prev.filter(msg => msg.id !== processingMessageId));
      setEditProcessingStatus("");
      console.log("[QuickEdit]", consoleMessage);
    };

    const updateProcessingMessageFromBackendFeedback = (
      feedbackMessage: unknown,
      consoleMessage: string,
    ) => {
      const publicFeedbackMessage = normalizePromptEditBackendFeedbackMessage(
        typeof feedbackMessage === "string" ? feedbackMessage : "",
      );
      if (publicFeedbackMessage) {
        updateProcessingMessage(publicFeedbackMessage, consoleMessage);
        return;
      }

      clearProcessingMessage(consoleMessage);
    };

    try {
      const token = await resolveQuickEditAuthToken();
      const requestController = new AbortController();
      editRequestAbortRef.current = requestController;
      const simulatorHistoryForCalibration = simulatorMessages
        .filter(msg => (msg.message && msg.message.trim()) || (msg.mediaTranscript && msg.mediaTranscript.trim()))
        .map(msg => ({
          role: (msg.role === "agent" ? "assistant" : "user") as "user" | "assistant",
          content: msg.message && msg.message.trim()
            ? msg.message
            : `[${msg.mediaType || "midia"} enviada/transcrita] ${msg.mediaTranscript || ""}`.trim()
        }));
      const simulatorSentMediasForCalibration = Array.from(new Set(simulatorSentMedias));

      for (let requestAttempt = 1; requestAttempt <= PROMPT_EDIT_REQUEST_MAX_ATTEMPTS; requestAttempt++) {
        try {
          if (requestController.signal.aborted) {
            throw new DOMException("Edição interrompida por você.", "AbortError");
          }

          console.log("[QuickEdit] Iniciando tentativa de edição.", {
            attempt: requestAttempt,
            maxAttempts: PROMPT_EDIT_REQUEST_MAX_ATTEMPTS,
          });

          const response = await fetch("/api/agent/edit-prompt-stream", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            signal: requestController.signal,
            body: JSON.stringify({
              currentPrompt: currentPromptSnapshot,
              instruction: currentInstruction,
              skipCalibration: false,
              simulatorHistory: simulatorHistoryForCalibration,
              simulatorSentMedias: simulatorSentMediasForCalibration
            })
          });

          if (!response.ok) {
            const rawError = await response.text().catch(() => "");
            const extractedMessage =
              extractEditPromptErrorMessage(rawError) ||
              "Não foi possível iniciar a edição agora.";

            if (
              requestAttempt < PROMPT_EDIT_REQUEST_MAX_ATTEMPTS &&
              (isRetryablePromptEditStatus(response.status) || isRetryablePromptEditMessage(extractedMessage))
            ) {
              const delayMs = getPromptEditRetryDelayMs(requestAttempt);
              console.warn("[QuickEdit] Tentativa falhou, novo retry será feito.", {
                attempt: requestAttempt,
                status: response.status,
                delayMs,
                message: sanitizeEditPromptClientMessage(extractedMessage),
              });
              updateProcessingMessage(
                buildEditPromptRetryStatusMessage(
                  requestAttempt + 1,
                  PROMPT_EDIT_REQUEST_MAX_ATTEMPTS,
                  delayMs,
                ),
                `Tentativa ${requestAttempt} falhou. Novo retry em ${Math.max(1, Math.ceil(delayMs / 1000))}s.`,
              );
              await waitForEditPromptRetry(delayMs);
              continue;
            }

            throw new Error(extractedMessage);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            if (requestAttempt < PROMPT_EDIT_REQUEST_MAX_ATTEMPTS) {
              const delayMs = getPromptEditRetryDelayMs(requestAttempt);
              console.warn("[QuickEdit] Streaming não iniciou, tentando novamente.", {
                attempt: requestAttempt,
                delayMs,
              });
              updateProcessingMessage(
                buildEditPromptRetryStatusMessage(
                  requestAttempt + 1,
                  PROMPT_EDIT_REQUEST_MAX_ATTEMPTS,
                  delayMs,
                ),
                `Streaming indisponível. Novo retry em ${Math.max(1, Math.ceil(delayMs / 1000))}s.`,
              );
              await waitForEditPromptRetry(delayMs);
              continue;
            }

            throw new Error("Não foi possível iniciar o streaming da edição.");
          }

          const decoder = new TextDecoder();
          let currentLogs: string[] = [];
          let hasTerminalResponse = false;
          let shouldRetryRequest = false;
          let sseBuffer = "";

          while (reader) {
            let chunk;
            try {
              chunk = await reader.read();
            } catch (error) {
              if (requestController.signal.aborted) {
                throw new DOMException("Edição interrompida por você.", "AbortError");
              }

              const rawErrorMessage =
                error instanceof Error ? sanitizeEditPromptClientMessage(error.message) : "";

              if (
                requestAttempt < PROMPT_EDIT_REQUEST_MAX_ATTEMPTS &&
                isRetryablePromptEditMessage(rawErrorMessage)
              ) {
                console.warn("[QuickEdit] Falha ao ler stream, marcando retry.", {
                  attempt: requestAttempt,
                  message: sanitizeEditPromptClientMessage(rawErrorMessage),
                });
                shouldRetryRequest = true;
                break;
              }

              throw error;
            }

            const { done, value } = chunk;
            sseBuffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            const parsedBatch = extractSseDataEvents(sseBuffer, { flush: done });
            sseBuffer = parsedBatch.remainder;

            for (const eventPayload of parsedBatch.events) {
              try {
                const data = JSON.parse(eventPayload);
                
                if (data.type === 'log' || data.type === 'calibration_log') {
                  const newMessage = data.message;
                  const visibleMessage = toCustomerProcessMessage(newMessage);
                  if (!currentLogs.includes(visibleMessage)) {
                    currentLogs = [...currentLogs, visibleMessage];
                  }
                  console.log("[QuickEdit][SSE]", repairMojibake(newMessage), {
                    attempt: requestAttempt,
                    eventType: data.type,
                  });
                  
                  const logText = currentLogs.slice(-3).map(log => `- ${repairMojibake(log)}`).join('\n');
                  updateProcessingMessage(
                    `**Ajuste em andamento**\n${logText}`,
                    repairMojibake(newMessage),
                  );
                }
                
                if (data.type === 'limit_reached') {
                  setAwaitingPromptEditConfirmation(false);
                  console.warn("[QuickEdit] Evento de limite legado recebido.", {
                    used: data.used,
                    limit: data.limit,
                  });
                  clearProcessingMessage("Limite legado recebido sem feedback publico do backend.");
                  hasTerminalResponse = true;
                  break;
                }
                
                if (data.type === 'complete') {
                  hasTerminalResponse = true;

                  const calibrationPassed = data.calibration?.success === true;
                  if (data.success && data.newPrompt && calibrationPassed) {
                    setAwaitingPromptEditConfirmation(false);
                    console.info("[QuickEdit] Edição concluída com sucesso.", {
                      attempt: requestAttempt,
                      promptLength: String(data.newPrompt).length,
                      calibrationScore: data.calibration?.score ?? null,
                    });
                    addToHistory(data.newPrompt, currentInstruction, "Edição aplicada");
                    syncPromptState(data.newPrompt);
                    
                    updateProcessingMessageFromBackendFeedback(
                      data.feedbackMessage,
                      "Edição aplicada com sucesso e instruções sincronizadas.",
                    );
                    queryClient.invalidateQueries({ queryKey: ["/api/agent/config"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/agent/prompt-versions"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/agent/prompt-chat"] });
                    refreshPersonalizeUsageState();
                  } else {
                    const rawFeedbackMessage = sanitizeEditPromptClientMessage(data.feedbackMessage);
                    if (data.requiresConfirmation) {
                      setAwaitingPromptEditConfirmation(true);
                      console.info("[QuickEdit] Proposta pronta aguardando confirmacao.", {
                        attempt: requestAttempt,
                      });
                      updateProcessingMessageFromBackendFeedback(
                        data.feedbackMessage,
                        "Proposta pronta aguardando confirmacao do usuario.",
                      );
                      break;
                    }
                    setAwaitingPromptEditConfirmation(false);
                    console.warn("[QuickEdit] Stream completou sem mudança aplicada.", {
                      attempt: requestAttempt,
                      feedback: rawFeedbackMessage,
                    });

                    if (
                      requestAttempt < PROMPT_EDIT_REQUEST_MAX_ATTEMPTS &&
                      isRetryablePromptEditMessage(rawFeedbackMessage)
                    ) {
                      shouldRetryRequest = true;
                      hasTerminalResponse = false;
                      break;
                    }

                    updateProcessingMessageFromBackendFeedback(
                      data.feedbackMessage,
                      "Stream completou sem mudança aplicada e sem feedback publico do backend.",
                    );
                  }

                  break;
                }
                
                if (data.type === 'error') {
                  setAwaitingPromptEditConfirmation(false);
                  const rawErrorMessage = sanitizeEditPromptClientMessage(data.message);
                  console.error("[QuickEdit] Stream retornou erro.", {
                    attempt: requestAttempt,
                    message: rawErrorMessage,
                  });

                  if (
                    requestAttempt < PROMPT_EDIT_REQUEST_MAX_ATTEMPTS &&
                    isRetryablePromptEditMessage(rawErrorMessage)
                  ) {
                    shouldRetryRequest = true;
                    break;
                  }

                  updateProcessingMessageFromBackendFeedback(
                    data.message,
                    "Stream retornou erro sem feedback publico do backend.",
                  );
                  hasTerminalResponse = true;
                  break;
                }
              } catch (e) {
                console.warn('Erro ao parsear SSE:', e);
              }
            }

            if (hasTerminalResponse || shouldRetryRequest || done) {
              break;
            }
          }

          if (hasTerminalResponse) {
            break;
          }

          if (shouldRetryRequest && requestAttempt < PROMPT_EDIT_REQUEST_MAX_ATTEMPTS) {
            const delayMs = getPromptEditRetryDelayMs(requestAttempt);
            console.warn("[QuickEdit] Retry programado após resposta intermediária.", {
              attempt: requestAttempt,
              delayMs,
            });
            updateProcessingMessage(
              buildEditPromptRetryStatusMessage(
                requestAttempt + 1,
                PROMPT_EDIT_REQUEST_MAX_ATTEMPTS,
                delayMs,
              ),
              `Nova tentativa programada em ${Math.max(1, Math.ceil(delayMs / 1000))}s.`,
            );
            await waitForEditPromptRetry(delayMs);
            continue;
          }

          clearProcessingMessage("Stream terminou sem resposta terminal publica do backend.");
          break;
        } catch (error: any) {
          console.error("[QuickEdit] Erro no streaming.", {
            retryable: isRetryablePromptEditMessage(error instanceof Error ? error.message : ""),
          });

          const rawErrorMessage =
            error instanceof Error ? sanitizeEditPromptClientMessage(error.message) : "";

          if (error instanceof DOMException && error.name === "AbortError") {
            console.warn("[QuickEdit] Fluxo interrompido pelo usuário.");
            clearProcessingMessage("Fluxo interrompido pelo usuario.");
            break;
          }

          if (
            requestAttempt < PROMPT_EDIT_REQUEST_MAX_ATTEMPTS &&
            isRetryablePromptEditMessage(rawErrorMessage)
          ) {
            const delayMs = getPromptEditRetryDelayMs(requestAttempt);
            console.warn("[QuickEdit] Exceção transitória detectada, tentando novamente.", {
              attempt: requestAttempt,
              delayMs,
              message: sanitizeEditPromptClientMessage(rawErrorMessage),
            });
            updateProcessingMessage(
              buildEditPromptRetryStatusMessage(
                requestAttempt + 1,
                PROMPT_EDIT_REQUEST_MAX_ATTEMPTS,
                delayMs,
              ),
              `Erro transitório detectado. Retry em ${Math.max(1, Math.ceil(delayMs / 1000))}s.`,
            );
            await waitForEditPromptRetry(delayMs);
            continue;
          }

          clearProcessingMessage("Erro no streaming sem feedback publico do backend.");
          break;
        }
      }
    } catch (error) {
      console.error("[QuickEdit] Falha ao preparar a edição rápida.");
      clearProcessingMessage("Falha ao preparar a edicao rapida sem feedback publico do backend.");
    } finally {
      resetQuickEditControllers();
      setIsProcessing(false);
      setEditProcessingStatus("");
    }
  };

  // ============ SIMULADOR ============
  const buildAudioUpload = (audioBlob: Blob, filePrefix: string, mimeType?: string) => {
    const resolvedMimeType = mimeType || audioBlob.type || "audio/webm";
    let extension = ".webm";

    if (resolvedMimeType.includes("ogg")) {
      extension = ".ogg";
    } else if (resolvedMimeType.includes("mp4") || resolvedMimeType.includes("m4a")) {
      extension = ".m4a";
    } else if (resolvedMimeType.includes("mpeg") || resolvedMimeType.includes("mp3")) {
      extension = ".mp3";
    } else if (resolvedMimeType.includes("wav")) {
      extension = ".wav";
    }

    return {
      blob: audioBlob,
      fileName: `${filePrefix}-${Date.now()}${extension}`,
      mimeType: resolvedMimeType,
    };
  };

  const handleSendEditAudio = async (audioBlob: Blob, duration: number, mimeType: string) => {
    setIsUploadingEditAudio(true);
    setIsRecordingEditAudio(false);
    logQuickEditStatus("Enviando áudio para edição rápida...", {
      duration,
      mimeType,
      size: audioBlob.size,
    });

    try {
      const audioUpload = buildAudioUpload(audioBlob, "editor-audio", mimeType);
      const authToken = await resolveQuickEditAuthToken();
      const uploadController = new AbortController();
      editAudioUploadAbortRef.current = uploadController;
      const audioFile = new File([audioUpload.blob], audioUpload.fileName, { type: audioUpload.mimeType });
      const uploadData = await uploadAgentMediaFileToStorage(audioFile);

      if (!uploadData.storageUrl) {
        throw new Error("Falha ao enviar o áudio da edição.");
      }

      const resolveAudioTranscription = async (): Promise<string> => {
        let lastError: Error | null = null;
        const transcriptionController = new AbortController();
        editAudioTranscriptionAbortRef.current = transcriptionController;

        for (let attempt = 1; attempt <= EDIT_AUDIO_TRANSCRIPTION_MAX_ATTEMPTS; attempt++) {
          console.log("[QuickEdit][Audio] Iniciando tentativa de transcrição.", {
            attempt,
            maxAttempts: EDIT_AUDIO_TRANSCRIPTION_MAX_ATTEMPTS,
          });

          const response = await fetch("/api/agent/media/transcribe", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            credentials: "include",
            signal: transcriptionController.signal,
            body: JSON.stringify({
              audioUrl: uploadData.storageUrl,
              mimeType: uploadData.mimeType || audioUpload.mimeType,
            }),
          });

          if (response.ok) {
            const data = await response.json() as { transcription?: string };
            const resolved = repairMojibake(data.transcription || "").trim();
            if (resolved) {
              return resolved;
            }

            throw new Error("Não consegui interpretar o áudio enviado.");
          }

          const rawError = await response.text().catch(() => "");
          const errorMessage =
            extractEditPromptErrorMessage(rawError) ||
            `Não foi possível transcrever o áudio agora (HTTP ${response.status}).`;
          lastError = new Error(errorMessage);

          if (
            attempt < EDIT_AUDIO_TRANSCRIPTION_MAX_ATTEMPTS &&
            (isRetryablePromptEditStatus(response.status) || isRetryablePromptEditMessage(errorMessage))
          ) {
            const delayMs = getEditAudioTranscriptionRetryDelayMs(attempt);
            logQuickEditStatus(`Retry da transcrição do áudio em ${Math.max(1, Math.ceil(delayMs / 1000))}s...`, {
              attempt,
              delayMs,
              message: errorMessage,
            });
            await waitForEditPromptRetry(delayMs);
            continue;
          }

          throw lastError;
        }

        throw lastError || new Error("Não consegui interpretar o áudio enviado.");
      };

      let transcription = repairMojibake(uploadData.transcription || "").trim();
      if (!transcription) {
        logQuickEditStatus("Transcrevendo áudio para aplicar a edição...");
        transcription = await resolveAudioTranscription();
      }

      console.log(`[Editor] Áudio recebido (${duration}s). Transcrição: ${transcription.substring(0, 80)}...`);

      await handleEditPrompt(transcription, {
        mediaUrl: uploadData.storageUrl,
        mediaType: "audio",
      });
    } catch (error: any) {
      if (error instanceof DOMException && error.name === "AbortError") {
        console.warn("[QuickEdit][Audio] Fluxo de áudio interrompido pelo usuário.");
        setEditProcessingStatus("");
        return;
      }

      toast({
        title: "Erro no áudio",
        variant: "destructive"
      });
    } finally {
      editAudioUploadAbortRef.current = null;
      editAudioTranscriptionAbortRef.current = null;
      setIsUploadingEditAudio(false);
    }
  };

  const addGreetingExtraTextItem = () => {
    setGreetingExtraFlowItems((current) => [
      ...current,
      {
        id: `greeting-extra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        order: current.length,
        type: "text",
        text: "",
      },
    ]);
    setGreetingExtraFlowDirty(true);
  };

  const addGreetingExtraMediaItem = (mediaType: GreetingFlowMediaType) => {
    setGreetingExtraFlowItems((current) => [
      ...current,
      {
        id: `greeting-extra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        order: current.length,
        type: "media",
        mediaType,
        storageUrl: "",
        caption: "",
      },
    ]);
    setGreetingExtraFlowDirty(true);
  };

  const updateGreetingExtraFlowItem = (itemId: string, updater: (item: FlowItem) => FlowItem) => {
    setGreetingExtraFlowItems((current) =>
      current.map((item, index) => (item.id === itemId ? { ...updater(item), order: index } : { ...item, order: index }))
    );
    setGreetingExtraFlowDirty(true);
  };

  const removeGreetingExtraFlowItem = (itemId: string) => {
    setGreetingExtraFlowItems((current) =>
      current
        .filter((item) => item.id !== itemId)
        .map((item, index) => ({ ...item, order: index }))
    );
    setGreetingExtraFlowDirty(true);
  };

  const removeGreetingExtraMedia = (itemId: string) => {
    updateGreetingExtraFlowItem(itemId, (item) => ({
      ...item,
      storageUrl: "",
      fileName: "",
      mimeType: "",
    }));
  };

  const getGreetingFlowMediaLabel = (mediaType?: string) => {
    switch (mediaType) {
      case "audio":
        return "Audio";
      case "video":
        return "Video";
      case "document":
        return "Arquivo";
      default:
        return "Imagem";
    }
  };

  const getGreetingFlowAccept = (mediaType?: string) => {
    switch (mediaType) {
      case "audio":
        return "audio/*,.ogg,.opus,.mp3,.m4a,.wav";
      case "video":
        return "video/*,.mp4,.webm,.mov";
      case "document":
        return "*/*";
      default:
        return "image/*,.jpg,.jpeg,.png,.gif,.webp";
    }
  };

  const reorderGreetingExtraFlowItems = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;

    setGreetingExtraFlowItems((current) => {
      const sourceIndex = current.findIndex((item) => item.id === sourceId);
      const targetIndex = current.findIndex((item) => item.id === targetId);

      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }

      const reordered = [...current];
      const [movedItem] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, movedItem);
      setGreetingExtraFlowDirty(true);
      return reordered.map((item, index) => ({ ...item, order: index }));
    });
  };

  const moveGreetingExtraFlowItem = (itemId: string, direction: "up" | "down") => {
    setGreetingExtraFlowItems((current) => {
      const currentIndex = current.findIndex((item) => item.id === itemId);
      if (currentIndex === -1) return current;

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;

      const reordered = [...current];
      [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
      setGreetingExtraFlowDirty(true);
      return reordered.map((item, index) => ({ ...item, order: index }));
    });
  };

  const setGreetingFlowPrimaryItem = (itemId: string) => {
    setGreetingExtraFlowItems((current) =>
      current.map((item, index) => ({
        ...item,
        order: index,
        isGreeting: item.type === "text" ? item.id === itemId : false,
      }))
    );
    setGreetingExtraFlowDirty(true);
  };

  const addGreetingMainTextItem = () => {
    const greetingItemId = `greeting-main-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    setGreetingExtraFlowItems((current) => {
      const cleared = current.map((item, index) => ({
        ...item,
        order: index,
        isGreeting: item.type === "text" ? false : item.isGreeting,
      }));

      return [
        ...cleared,
        {
          id: greetingItemId,
          order: cleared.length,
          type: "text",
          isGreeting: true,
          text: repairMojibake(customGreeting).trim() || "",
        },
      ];
    });

    setGreetingExtraFlowDirty(true);
  };

  const handleGreetingExtraMediaUpload = async (itemId: string, file?: File | null) => {
    if (!file) return;

    setUploadingGreetingFlowItemId(itemId);

    try {
      const uploadData = await uploadAgentMediaFileForLibrary(file, { transcribeAudio: true });
      if (!uploadData?.storageUrl) {
        throw new Error("Falha ao obter a URL da midia");
      }

      updateGreetingExtraFlowItem(itemId, (item) => ({
        ...item,
        type: "media",
        mediaType: (item.mediaType as GreetingFlowMediaType) || "image",
        storageUrl: uploadData.storageUrl,
        fileName: uploadData.fileName || file.name,
        mimeType: uploadData.mimeType || file.type || uploadData.mediaType || "application/octet-stream",
        caption: item.caption || file.name.replace(/\.[^.]+$/, ""),
        transcription: uploadData.transcription || item.transcription || "",
      }));

      toast({
        title: "Midia adicionada",
        description: "A midia foi vinculada ao fluxo de abertura.",
      });
    } catch {
      toast({
        title: "Erro no upload",
        variant: "destructive",
      });
    } finally {
      setUploadingGreetingFlowItemId(null);
    }
  };

  const syncGreetingExtraFlow = async () => {
    const normalizedItems = greetingExtraFlowItems
      .map((item, index) => {
        if (item.type === "text") {
          const text = repairMojibake(item.text || "").trim();
          if (!text) return null;
          return {
            id: item.id,
            order: index,
            type: "text",
            text,
            isGreeting: item.isGreeting === true,
          };
        }

        const storageUrl = String(item.storageUrl || "").trim();
        if (!storageUrl) return null;

        return {
          id: item.id,
          order: index,
          type: "media",
          mediaType: item.mediaType || "image",
          storageUrl,
          caption: repairMojibake(item.caption || "").trim() || undefined,
          transcription: repairMojibake(item.transcription || "").trim() || undefined,
          fileName: item.fileName || undefined,
          mimeType: item.mimeType || "application/octet-stream",
        };
      })
      .filter(Boolean);

    if (normalizedItems.length === 0) {
      if (!greetingExtraFlowMedia?.id) return;
      await apiRequest("DELETE", `/api/agent/media/${greetingExtraFlowMedia.id}`);
      return;
    }

    const payload = {
      name: GREETING_EXTRA_FLOW_NAME,
      mediaType: "flow",
      storageUrl: "",
      description: "Fluxo de abertura configurado pela aba Info",
      whenToUse: "Gerenciado automaticamente pela aba Info para enviar a sequência inicial do atendimento",
      caption: "Fluxo de abertura",
      isActive: true,
      isPtt: normalizedItems.some((item: any) => item?.type === "media" && item?.mediaType === "audio"),
      sendAlone: false,
      suppressTextResponse: false,
      flowItems: normalizedItems,
    };

    if (greetingExtraFlowMedia?.id) {
      await apiRequest("PUT", `/api/agent/media/${greetingExtraFlowMedia.id}`, payload);
      return;
    }

    await apiRequest("POST", "/api/agent/media", payload);
  };

  const sendSimulatorMessage = async (payload: SimulatorSendPayload) => {
    const trimmedText = payload.text.trim();
    if (!trimmedText || isSimulating) return;
    const customerMediaItems = payload.mediaUrl
      ? [{
          mediaType: payload.mediaType || "image",
          mediaUrl: payload.mediaUrl,
          caption: trimmedText,
          text: trimmedText,
        }]
      : [];

    const epochAtSend = simulatorEpochRef.current;
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const userMsg: SimulatorMessage = {
      id: `sim-user-${Date.now()}`,
      role: "user",
      message: trimmedText,
      time,
      mediaUrl: payload.mediaUrl,
      mediaType: payload.mediaType,
    };

    setSimulatorMessages(prev => [...prev, userMsg]);
    setSimulatorInput("");
    setIsSimulating(true);

    try {
      const historyForBackend = simulatorMessages
        .filter(msg => (msg.message && msg.message.trim()) || (msg.mediaTranscript && msg.mediaTranscript.trim()))
        .map(msg => ({
          role: msg.role === "agent" ? "assistant" : "user" as "user" | "assistant",
          content: msg.message && msg.message.trim()
            ? msg.message
            : `[${msg.mediaType || "midia"} enviada/transcrita] ${msg.mediaTranscript || ""}`.trim()
        }));

      const response = await apiRequest("POST", "/api/agent/test", {
        message: trimmedText,
        customPrompt: hasChanges ? currentPrompt : undefined,
        history: historyForBackend,
        sentMedias: simulatorSentMedias,
        mediaItems: customerMediaItems,
        mediaUrl: payload.mediaUrl,
        mediaType: payload.mediaType,
        sessionId: simulatorSessionIdRef.current,
        clearCart: historyForBackend.length === 0,
        customerMessageWasAudio: payload.customerMessageWasAudio === true,
      });

      const data = await response.json();
      const agentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      if (simulatorEpochRef.current !== epochAtSend) {
        return;
      }

      if (data.limitReached) {
        setUpgradeModal({
          isOpen: true,
          title: "Limite de testes atingido",
          description: data.message || "Assine um plano para testar seu agente sem limites.",
          used: data.used || 25,
          limit: data.limit || 25,
          type: "simulator"
        });
        
        // Adiciona mensagem de limite no simulador
        const limitMsg: SimulatorMessage = {
          id: `sim-limit-${Date.now()}`,
          role: "agent",
          message: `Você usou todas as ${data.limit} mensagens gratuitas de teste de hoje. Assine o Plus para testar sem limite diário.`,
          time: agentTime
        };
        setSimulatorMessages(prev => [...prev, limitMsg]);
        return;
      }

      const newMessages: SimulatorMessage[] = [];

      const splitResponses = data?.splitResponses || [];
      const mediaActions = Array.isArray(data?.mediaActions) ? data.mediaActions : [];
      const hasTextActions = mediaActions.some((action: any) => action?.type === "send_text" && String(action.text || "").trim());

      if (splitResponses.length > 0) {
        for (const splitMsg of splitResponses) {
          if (splitMsg && splitMsg.trim()) {
            newMessages.push({
              id: `sim-agent-${Date.now()}-${Math.random()}`,
              role: "agent",
              message: splitMsg,
              time: agentTime
            });
          }
        }
        console.log(`📱 [Simulador] Exibindo ${splitResponses.length} bolhas de mensagem`);
      } else if (!hasTextActions && typeof data?.response === 'string' && data.response.trim()) {
        newMessages.push({
          id: `sim-agent-${Date.now()}`,
          role: "agent",
          message: data.response,
          time: agentTime
        });
      }

      if (mediaActions.length > 0) {
        console.log(`📁 [Simulador] Recebeu ${mediaActions.length} ação(ões)`, mediaActions);

        for (const action of mediaActions) {
          if (action.type === "send_text" && action.text) {
            newMessages.push({
              id: `sim-agent-${Date.now()}-${Math.random()}`,
              role: "agent",
              message: action.text,
              time: agentTime,
            });
          }

          if ((action.type === "send_media" || action.type === "send_media_url") && action.media_url) {
            newMessages.push({
              id: `sim-media-${Date.now()}-${Math.random()}`,
              role: "agent",
              message: action.caption || "",
              time: agentTime,
              mediaUrl: action.media_url,
              mediaType: normalizeSimulatorMediaType(action.media_type, action.media_url),
              mediaTranscript: action.transcription || action.caption || "",
            });
          }
        }

        const newMediaNames = mediaActions
          .filter((a: any) => (a.type === "send_media" || a.type === "send_media_url") && a.media_name)
          .map((a: any) => a.media_name.toUpperCase());
        setSimulatorSentMedias((prev) => Array.from(new Set([...prev, ...newMediaNames])));
      }

      setSimulatorMessages(prev => [...prev, ...newMessages]);
      refreshPersonalizeUsageState();
    } catch (error: any) {
      console.error("[AgentStudio] Simulator failed:", error);
      toast({
        title: "Erro no simulador",
        variant: "destructive"
      });
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSimulate = async () => {
    await sendSimulatorMessage({ text: simulatorInput });
  };

  // 🆕 LIMPAR SIMULADOR (resetar histórico e mídias)
  const handleClearSimulator = () => {
    // Invalida respostas de requests em voo (evita repopular após limpar)
    simulatorEpochRef.current++;
    const previousSessionId = simulatorSessionIdRef.current;
    clearAgentStudioSimulatorSession(previousSessionId);
    if (agentStudioSimulatorChatStorageKey) {
      removeAgentStudioSimulatorChatStorage(agentStudioSimulatorChatStorageKey);
    }
    setSimulatorMessages([]);
    setSimulatorSentMedias([]);
    setSimulatorInput("");
    setIsSimulating(false);
    simulatorSessionIdRef.current = createAgentStudioSimulatorSessionId();
  };

  // ============ SALVAR PROMPT ============
  const handleSavePrompt = () => {
    if (!guardMyAgentAction("salvar instruções do agente", {
      title: "Assine Plus para salvar instruções",
      description:
        "No plano grátis você pode escrever, revisar e testar. Para aplicar as instruções no agente real, assine o Plus.",
      benefit: "salvar as instruções no agente",
    })) {
      return;
    }

    console.log("\n[SAVE] ═══════════════════════════════════════════════════════");
    console.log("[SAVE] 💾 Salvando prompt manualmente");
    console.log("[SAVE] Prompt length:", currentPrompt.length, "chars");
    console.log("[SAVE] Backend vai criar versão automaticamente");
    console.log("[SAVE] ═══════════════════════════════════════════════════════\n");
    
    updateConfigMutation.mutate({ prompt: normalizePromptText(currentPrompt) });
    setHasChanges(false);
  };

  // ============ SALVAR CONFIGURAÇÕES ============
  const handleSaveConfig = async () => {
    if (!guardMyAgentAction("salvar configurações do agente", {
      title: "Assine Plus para salvar configurações",
      description:
        "No plano grátis você pode revisar as configurações. Para aplicar regras, horários e automações no agente real, assine o Plus.",
      benefit: "salvar configurações avançadas do agente",
    })) {
      return;
    }

    try {
      const greetingMainText = repairMojibake(
        greetingExtraFlowItems.find((item) => item.type === "text" && item.isGreeting)?.text || ""
      ).trim();

      await updateConfigMutation.mutateAsync({
        isActive,
        responseDelaySeconds,
        messageSplitChars,
        triggerPhrases,
        fetchHistoryOnFirstResponse,
        pauseOnManualReply,
        autoReactivateMinutes,
        customGreeting: greetingMainText || null,
        customAddress: customAddress.trim() || null,
        greetingVariation,
        greetingEnabled,
        aiSignatureEnabled,
        aiSignature: aiSignature.trim() || null,
        addressEnabled,
        businessHoursEnabled,
        businessHours,
        offHoursMessageEnabled,
        offHoursVariation,
        offHoursMessage: offHoursMessage.trim() || "Ola! No momento estamos fora do horario de atendimento. Retornaremos em breve!"
      });
      await syncGreetingExtraFlow();
      await queryClient.invalidateQueries({ queryKey: ["/api/agent/media"] });
      setGreetingExtraFlowDirty(false);
    } catch {
      toast({
        title: "Erro",
        variant: "destructive",
      });
    }
  };

  // ============ FUNÇÕES DE MÍDIA ============
  const closeMediaDialog = () => {
    setMediaDialogOpen(false);
    setEditingMedia(null);
    setSelectedFile(null);
    setMediaForm({ name: "", mediaType: "audio", description: "", whenToUse: "", caption: "", transcription: "", isPtt: false, sendAlone: false, suppressTextResponse: false, isActive: true, flowItems: [] });
  };

  const openNewMediaDialog = () => {
    setEditingMedia(null);
    setMediaForm({ name: "", mediaType: "audio", description: "", whenToUse: "", caption: "", transcription: "", isPtt: false, sendAlone: false, suppressTextResponse: false, isActive: true, flowItems: [] });
    setSelectedFile(null);
    setMediaDialogOpen(true);
  };

  const openEditMediaDialog = (media: MediaItem) => {
    setEditingMedia(media);
    setMediaForm({
      name: media.name,
      mediaType: media.mediaType,
      description: media.description || "",
      whenToUse: media.whenToUse || "",
      caption: media.caption || "",
      transcription: media.transcription || "",
      isPtt: media.isPtt || false,
      sendAlone: media.sendAlone || false,
      suppressTextResponse: media.suppressTextResponse || false,
      isActive: media.isActive ?? true,
      flowItems: (media.flowItems || []) as FlowItem[],
    });
    setMediaDialogOpen(true);
  };

  // ============ FUNÇÕES DE ITEM DE FLUXO ============
  const generateFlowItemId = () => `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  const addFlowItem = (type: 'media' | 'text') => {
    const items = mediaForm.flowItems || [];
    const newItem: FlowItem = {
      id: generateFlowItemId(),
      order: items.length,
      type,
      mediaType: type === 'media' ? 'image' : undefined,
    };
    setMediaForm(prev => ({ ...prev, flowItems: [...(prev.flowItems || []), newItem] }));
  };
  
  const updateFlowItem = (index: number, updated: FlowItem) => {
    const items = [...(mediaForm.flowItems || [])];
    items[index] = updated;
    setMediaForm(prev => ({ ...prev, flowItems: items }));
  };
  
  const deleteFlowItem = (index: number) => {
    const items = (mediaForm.flowItems || []).filter((_, i) => i !== index);
    setMediaForm(prev => ({ ...prev, flowItems: items.map((it, i) => ({ ...it, order: i })) }));
  };
  
  const moveFlowItem = (index: number, direction: 'up' | 'down') => {
    const items = [...(mediaForm.flowItems || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    [items[index], items[targetIndex]] = [items[targetIndex], items[index]];
    setMediaForm(prev => ({ ...prev, flowItems: items.map((it, i) => ({ ...it, order: i })) }));
  };
  
  const uploadFlowItemFile = async (itemId: string, file: File): Promise<any | null> => {
    if (!guardMyAgentAction("subir mídia para fluxo", {
      title: "Assine Plus para usar mídias",
      description:
        "No plano grátis você pode explorar a biblioteca. Para subir, salvar e ativar mídias no agente real, assine o Plus.",
      benefit: "subir mídias para o agente",
    })) {
      return null;
    }

    setUploadingFlowItemId(itemId);
    try {
      const data = await uploadAgentMediaFileForLibrary(file, { transcribeAudio: true });
      return data?.storageUrl ? data : null;
    } catch {
      toast({ title: "Erro ao enviar arquivo", variant: "destructive" });
      return null;
    } finally {
      setUploadingFlowItemId(null);
    }
  };

  const handleMediaSubmit = async () => {
    if (!guardMyAgentAction(editingMedia ? "atualizar mídia do agente" : "adicionar mídia ao agente", {
      title: "Assine Plus para salvar mídias",
      description:
        "No plano grátis você pode abrir e revisar a aba de mídias. Para adicionar, atualizar ou ativar mídias no WhatsApp, assine o Plus.",
      benefit: "salvar mídias no agente",
    })) {
      return;
    }

    // Validação básica
    if (!mediaForm.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    if (!mediaForm.description.trim()) {
      toast({ title: "Descrição obrigatória", variant: "destructive" });
      return;
    }
    
    // ====== FLUXO ======
    if (mediaForm.mediaType === 'flow') {
      const items = mediaForm.flowItems || [];
      if (items.length < 2) {
        toast({ title: "Erro", description: "Um fluxo precisa ter pelo menos 2 itens.", variant: "destructive" });
        return;
      }
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type === 'text' && !item.text?.trim()) {
          toast({ title: "Erro", description: `Item ${i + 1} é texto mas está vazio.`, variant: "destructive" });
          return;
        }
        if (item.type === 'media' && !item.storageUrl) {
          toast({ title: "Erro", description: `Item ${i + 1} é mídia mas não tem arquivo.`, variant: "destructive" });
          return;
        }
      }
      
      const rawName = mediaForm.name || 'FLUXO';
      const formattedName = rawName.toUpperCase().replace(/[^A-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
      
      if (editingMedia) {
        updateMediaMutation.mutate({
          id: editingMedia.id,
          data: {
            name: formattedName,
            mediaType: 'flow',
            storageUrl: '',
            description: mediaForm.description,
            whenToUse: mediaForm.whenToUse,
            isActive: mediaForm.isActive,
            flowItems: items.map((it, i) => ({ ...it, order: i })),
          }
        });
      } else {
        createFlowMediaMutation.mutate({
          name: formattedName,
          mediaType: 'flow',
          storageUrl: '',
          description: mediaForm.description,
          whenToUse: mediaForm.whenToUse,
          isActive: mediaForm.isActive,
          flowItems: items.map((it, i) => ({ ...it, order: i })),
        });
      }
      return;
    }
    // ====== FIM FLUXO ======
    
    if (editingMedia) {
      // Se há um novo arquivo selecionado, fazer upload primeiro
      if (selectedFile) {
        try {
          const uploadData = await uploadAgentMediaFileForLibrary(selectedFile, { transcribeAudio: true });

          if (!uploadData.storageUrl) {
            throw new Error("Falha ao obter URL do arquivo");
          }
          
          // Atualizar mídia com novo arquivo
          updateMediaMutation.mutate({
            id: editingMedia.id,
            data: {
              name: mediaForm.name,
              mediaType: mediaForm.mediaType,
              description: mediaForm.description,
              whenToUse: mediaForm.whenToUse,
              caption: mediaForm.caption,
              transcription: uploadData.transcription || mediaForm.transcription,
              isPtt: mediaForm.isPtt,
              sendAlone: mediaForm.sendAlone,
              suppressTextResponse: mediaForm.suppressTextResponse,
              isActive: mediaForm.isActive,
              storageUrl: uploadData.storageUrl,
              fileName: uploadData.fileName,
              fileSize: uploadData.fileSize,
              mimeType: uploadData.mimeType
            }
          });
        } catch {
          toast({ title: "Erro", variant: "destructive" });
          return;
        }
      } else {
        // Apenas atualizar metadados sem novo arquivo
        updateMediaMutation.mutate({
          id: editingMedia.id,
          data: {
            name: mediaForm.name,
            mediaType: mediaForm.mediaType,
            description: mediaForm.description,
            whenToUse: mediaForm.whenToUse,
            caption: mediaForm.caption,
            transcription: mediaForm.transcription,
            isPtt: mediaForm.isPtt,
            sendAlone: mediaForm.sendAlone,
            suppressTextResponse: mediaForm.suppressTextResponse,
            isActive: mediaForm.isActive
          }
        });
      }
    } else {
      if (!selectedFile) {
        toast({ title: "Selecione um arquivo", variant: "destructive" });
        return;
      }
      // Converter nome para MAIÚSCULAS_COM_UNDERSCORES (requisito do backend)
      const rawName = mediaForm.name || selectedFile.name.replace(/\.[^/.]+$/, "");
      const formattedName = rawName.toUpperCase().replace(/[^A-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
      
      uploadMediaMutation.mutate({
        file: selectedFile,
        name: formattedName,
        mediaType: mediaForm.mediaType,
        description: mediaForm.description,
        whenToUse: mediaForm.whenToUse,
        caption: mediaForm.caption,
        transcription: mediaForm.transcription,
        isPtt: mediaForm.isPtt,
        sendAlone: mediaForm.sendAlone,
        suppressTextResponse: mediaForm.suppressTextResponse,
        isActive: mediaForm.isActive
      });
    }
  };

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="h-5 w-5" />;
      case 'audio': return <Music className="h-5 w-5" />;
      case 'video': return <Video className="h-5 w-5" />;
      case 'flow': return <GitBranch className="h-5 w-5 text-violet-500" />;
      default: return <File className="h-5 w-5" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleAddTriggerPhrase = () => {
    if (!newTriggerPhrase.trim()) return;
    if (!triggerPhrases.includes(newTriggerPhrase.trim())) {
      setTriggerPhrases([...triggerPhrases, newTriggerPhrase.trim()]);
    }
    setNewTriggerPhrase("");
  };

  const handleRemoveTriggerPhrase = (phrase: string) => {
    setTriggerPhrases(triggerPhrases.filter(p => p !== phrase));
  };

  const updateBusinessHoursDay = (day: BusinessHoursKey, updates: Partial<BusinessHoursDay>) => {
    setBusinessHours((current) => ({
      ...current,
      [day]: {
        ...current[day],
        ...updates,
      },
    }));
  };

  const quickActions = [
    { label: "Mais formal", instruction: "Torne o tom mais formal e profissional" },
    { label: "Mais vendedor", instruction: "Adicione técnicas de vendas e persuasão" },
    { label: "Mais curto", instruction: "Faça as respostas serem mais curtas e diretas" },
  ];

  const editorSectionDescription =
    activeSection === "chat" ? "Edição rápida com IA" :
    activeSection === "code" ? "Edite as instruções diretamente" :
    activeSection === "media" ? "Biblioteca de mídias" :
    activeSection === "info" ? "Informações do agente" :
    activeSection === "flow" ? "Fluxo visual e roteiro" :
    activeSection === "flow2" ? "Construtor visual de fluxo" : "Configurações";

  const mobileSectionLabel =
    activeSection === "chat" ? "Chat" :
    activeSection === "code" ? "Editar" :
    activeSection === "media" ? "Mídias" :
    activeSection === "info" ? "Info" :
    activeSection === "flow" ? "Fluxo" :
    activeSection === "flow2" ? "Fluxo 2.0" : "Config";

  const mobileSectionActions: Array<{
    section: Section;
    label: string;
    description: string;
    icon: typeof MessageSquare;
  }> = [
    { section: "chat", label: "Ajuda da IA", description: "Edição rápida com IA", icon: MessageSquare },
    { section: "code", label: "Regras do Agente", description: "Instruções completas", icon: Code },
    { section: "media", label: "Mídias", description: "Biblioteca do agente", icon: ImageIcon },
    { section: "config", label: "IA Config", description: "Respostas e reativação", icon: Settings },
    { section: "flow2", label: "Fluxo 2.0", description: "Construtor visual do agente", icon: Workflow },
  ];
  const visibleSectionActions = mobileSectionActions.filter(({ section }) => section !== "info");
  const isSectionNavActive = (section: Section) =>
    activeSection === section || (activeSection === "info" && section === "config");
  const hasPromptHistory = promptHistory.length > 0;
  const selectedHistoryEntry =
    historyIndex >= 0 && historyIndex < promptHistory.length ? promptHistory[historyIndex] : null;
  const selectedHistoryVersion = selectedHistoryEntry
    ? promptVersionsData?.versions?.find((version) => version.id === selectedHistoryEntry.id)
    : null;
  const selectedHistoryVersionNumber =
    selectedHistoryEntry?.versionNumber ?? selectedHistoryVersion?.versionNumber ?? null;
  const selectedHistoryPosition = selectedHistoryEntry ? historyIndex + 1 : 0;
  const canRestoreSelectedHistoryVersion =
    Boolean(selectedHistoryEntry && selectedHistoryVersion) && !isRestoring;
  const selectedHistoryMatchesCurrentPrompt =
    selectedHistoryEntry
      ? normalizePromptText(selectedHistoryEntry.prompt) === normalizePromptText(config?.prompt)
      : false;

  const changeSection = useCallback((section: Section) => {
    setActiveSection(section);
  }, []);

  const setMobileStudioView = useCallback((view: MobileView) => {
    setMobileView(view);

    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("mobile", view);
    setAgentStudioLocation(`${url.pathname}${url.search}${url.hash}`);
  }, [setAgentStudioLocation]);

  const openDashboardMobileMenu = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(new CustomEvent("agentezap:open-mobile-menu"));
  }, []);

  const openMobileSection = useCallback((section: Section) => {
    changeSection(section);
    setMobileStudioView("editor");
  }, [changeSection, setMobileStudioView]);

  const runMobileEditorAction = useCallback((action: () => void) => {
    setMobileEditorMenuOpen(false);
    action();
  }, []);

  useEffect(() => {
    if (!mobileEditorMenuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (mobileEditorMenuPanelRef.current?.contains(target)) return;
      if (mobileEditorMenuButtonRef.current?.contains(target)) return;
      setMobileEditorMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileEditorMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileEditorMenuOpen]);

  const mobileEditorMenuPanel = mobileEditorMenuOpen ? (
    <div
      ref={mobileEditorMenuPanelRef}
      data-testid="menu-mobile-editor-sections"
      className="absolute right-0 top-[calc(100%+0.5rem)] z-[80] w-[min(17rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-[#e3e3e3] bg-white shadow-2xl"
    >
      <div className="max-h-[64vh] overflow-y-auto py-1.5">
        <div className="px-3 pb-1 pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Seções
          </p>
        </div>
        {visibleSectionActions.map(({ section, label, icon: Icon }) => (
          <button
            key={section}
            type="button"
            onClick={() => runMobileEditorAction(() => openMobileSection(section))}
            className={cn(
              "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#f5f5f5]",
              isSectionNavActive(section) && "bg-[#e9f8f3] text-[#008060]"
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f1f1f1] text-slate-800">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{label}</span>
            {isSectionNavActive(section) ? <Check className="h-4 w-4 shrink-0" /> : null}
          </button>
        ))}

        {activeSection !== "flow" && (
          <>
            <div className="mx-3 my-1 border-t border-[#e3e3e3]" />
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0 text-[13px] font-semibold text-slate-800">
                IA no WhatsApp
              </span>
              <Switch
                checked={isActive}
                onCheckedChange={(checked) => {
                  if (!guardMyAgentAction(checked ? "ativar IA no WhatsApp" : "desativar IA no WhatsApp", {
                    title: checked ? "Assine Plus para ativar a IA" : "Assine Plus para alterar a ativação",
                    description:
                      "No plano grátis você pode configurar e testar. Para ligar ou alterar a IA no atendimento real do WhatsApp, assine o Plus.",
                    benefit: "alterar a ativação da IA no WhatsApp",
                  })) {
                    return;
                  }
                  setIsActive(checked);
                  updateConfigMutation.mutate({ isActive: checked });
                }}
                className={cn("h-6 w-11", isActive ? "data-[state=checked]:bg-[#008060]" : "")}
              />
            </div>
          </>
        )}

        <div className="mx-3 my-1 border-t border-[#e3e3e3]" />

        <button
          type="button"
          onClick={() => runMobileEditorAction(handleSavePrompt)}
          disabled={!hasChanges || updateConfigMutation.isPending}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#f5f5f5] disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f1f1f1] text-slate-800">
            <Save className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">Salvar alterações</span>
        </button>
        <button
          type="button"
          onClick={() => runMobileEditorAction(handleResetPrompt)}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#f5f5f5]"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f1f1f1] text-slate-800">
            <RefreshCw className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">Resetar instruções</span>
        </button>
      </div>
    </div>
  ) : null;

  // ============ LOADING STATE ============
  if (configLoading) {
    return repairReactNodeText(
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (activeSection === "flow2") {
    return repairReactNodeText(
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <LeonaFlow2Tab />
      </div>
    );
  }

  const showMobileViewSwitcher = activeSection !== "flow" && activeSection !== "flow2";

  // ============ RENDER PRINCIPAL ============
  return repairReactNodeText(
    <div className="flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden">
      
      {/* Mobile Tab Switcher */}
      {showMobileViewSwitcher && (
      <div
        data-subscription-gate-ignore="true"
        data-testid="mobile-studio-top-switcher"
        className="relative z-40 h-14 shrink-0 border-b border-[#e3e3e3] bg-white px-3 py-0 md:hidden"
      >
        <div className="flex h-full items-center gap-2">
          <button
            type="button"
            data-testid="button-mobile-dashboard-menu"
            onClick={openDashboardMobileMenu}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-[#f1f1f1]"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex shrink-0 items-center">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-black text-white shadow-sm">
              <Bot className="h-4 w-4" />
            </span>
          </div>
          <div className="mx-auto flex min-w-0 flex-1 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setMobileStudioView("editor")}
            className={cn(
              "min-w-0 flex-1 rounded-lg px-2 py-1.5 text-[10px] font-bold leading-tight transition",
              mobileView === "editor"
                ? "bg-white text-[#008060] shadow-sm"
                : "text-slate-500 hover:bg-white/70"
            )}
          >
            Configurar
          </button>

          <button
            onClick={() => setMobileStudioView("simulator")}
            className={cn(
              "min-w-0 flex-1 rounded-lg px-2 py-1.5 text-[10px] font-bold leading-tight transition",
              mobileView === "simulator"
                ? "bg-white text-[#008060] shadow-sm"
                : "text-slate-500 hover:bg-white/70"
            )}
          >
            Testar Agente
          </button>
          </div>
          <div className="relative shrink-0">
            <button
              ref={mobileEditorMenuButtonRef}
              type="button"
              data-testid="button-mobile-editor-more"
              onClick={() => {
                if (mobileView !== "editor") {
                  setMobileStudioView("editor");
                }
                setMobileEditorMenuOpen((current) => !current);
              }}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg border border-[#e3e3e3] bg-white text-slate-700 shadow-sm transition-colors hover:bg-[#f1f1f1]",
                mobileEditorMenuOpen && "bg-[#ebebeb] text-slate-950"
              )}
              aria-label={mobileEditorMenuOpen ? "Fechar opções do editor" : "Abrir opções do editor"}
              aria-expanded={mobileEditorMenuOpen}
            >
              {mobileEditorMenuOpen ? <X className="h-4 w-4" /> : <MoreVertical className="h-4 w-4" />}
            </button>
            {mobileEditorMenuPanel}
          </div>
        </div>
      </div>
      )}

      {/* Main Split View */}
      <div className={cn(
        "flex min-h-0 flex-1 min-w-0 flex-col overflow-hidden bg-[#f6f6f7] md:flex-row md:gap-4 md:p-4 lg:gap-6 lg:p-6"
      )}
        data-personalize-confirmation-flow={PERSONALIZE_CONFIRMATION_FLOW_MARKER}
        data-personalize-awaiting-confirmation={awaitingPromptEditConfirmation ? "true" : "false"}
      >
        
        {/* ============ LEFT PANEL: EDITOR ============ */}
        <div className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-[#e3e3e3] bg-white shadow-sm md:rounded-xl",
          mobileView !== "editor" && "hidden md:flex"
        )}>
          
          {/* Editor Header */}
          <div className="border-b bg-white p-0" data-subscription-gate-ignore="true">
            <div className="hidden">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">Personalize com IA</h3>
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                          {mobileSectionLabel}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          hasChanges
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                        )}>
                          {hasChanges ? "Rascunho" : "Salvo"}
                        </span>
                        <p className="truncate text-[11px] text-muted-foreground">Instrua em linguagem natural para configurar seu robô.</p>
                      </div>
                    </div>

                    <div className="relative flex shrink-0 items-center gap-2 self-start">
                      {activeSection === "flow" || activeSection === "flow2" ? (
                        <div
                          className={cn(
                            "flex h-8 items-center gap-2 rounded-full border px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                            flowModeActive
                              ? "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/40 dark:bg-purple-900/20 dark:text-purple-300"
                              : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300"
                          )}
                        >
                          {activeSection === "flow2" ? "Fluxo 2.0" : flowModeActive ? "Fluxo ON" : "Fluxo OFF"}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "flex h-8 items-center gap-2 rounded-full border px-2.5",
                            isActive
                              ? "border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/20"
                              : "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20"
                          )}
                        >
                          <span
                            className={cn(
                              "text-[10px] font-semibold uppercase tracking-[0.14em]",
                              isActive ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                            )}
                          >
                            IA
                          </span>
                          <Switch
                            checked={isActive}
                            onCheckedChange={(checked) => {
                              if (!guardMyAgentAction(checked ? "ativar IA no WhatsApp" : "desativar IA no WhatsApp", {
                                title: checked ? "Assine Plus para ativar a IA" : "Assine Plus para alterar a ativação",
                                description:
                                  "No plano grátis você pode configurar e testar. Para ligar ou alterar a IA no atendimento real do WhatsApp, assine o Plus.",
                                benefit: "alterar a ativação da IA no WhatsApp",
                              })) {
                                return;
                              }
                              setIsActive(checked);
                              updateConfigMutation.mutate({ isActive: checked });
                            }}
                            className={cn("h-4 w-8", isActive ? "data-[state=checked]:bg-green-600" : "")}
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setMobileEditorMenuOpen((current) => !current)}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background shadow-sm transition-colors hover:bg-muted",
                          mobileEditorMenuOpen && "bg-muted"
                        )}
                        aria-label={mobileEditorMenuOpen ? "Fechar menu do editor" : "Abrir menu do editor"}
                        aria-expanded={mobileEditorMenuOpen}
                      >
                        {mobileEditorMenuOpen ? <X className="h-4 w-4" /> : <MoreVertical className="h-4 w-4" />}
                      </button>
                      {false && mobileEditorMenuOpen && (
                        <div
                          className="absolute right-[-0.125rem] top-[calc(100%+0.375rem)] z-50 w-56 max-w-[calc(100vw-1rem)] origin-top-right overflow-hidden rounded-2xl border border-border/80 bg-background/98 shadow-2xl backdrop-blur md:hidden"
                        >
                          <div className="max-h-[62vh] overflow-y-auto py-1.5">
                            <div className="px-3 pb-1 pt-1">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Seções
                              </p>
                            </div>
                            {visibleSectionActions.map(({ section, label, icon: Icon }) => (
                              <button
                                key={section}
                                type="button"
                                onClick={() => runMobileEditorAction(() => openMobileSection(section))}
                                className={cn(
                                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/70",
                                  isSectionNavActive(section) && "bg-primary/5 text-primary",
                                  (section === "flow" || section === "flow2") &&
                                    !isSectionNavActive(section) &&
                                    "text-purple-700 dark:text-purple-300"
                                )}
                              >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                                  <Icon className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{label}</span>
                                {isSectionNavActive(section) && <Check className="h-4 w-4 shrink-0" />}
                              </button>
                            ))}

                            <div className="mx-3 my-1 border-t border-border/60" />

                            <div className="px-3 pb-1 pt-1">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Ações
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => runMobileEditorAction(handleSavePrompt)}
                              disabled={!hasChanges || updateConfigMutation.isPending}
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-50"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                                <Save className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">Salvar alterações</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => runMobileEditorAction(handleUndo)}
                              disabled={!canUndo}
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-50"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                                <Undo2 className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">Desfazer</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => runMobileEditorAction(handleRedo)}
                              disabled={!canRedo}
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-50"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                                <Redo2 className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">Refazer</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => runMobileEditorAction(openPromptHistory)}
                              disabled={!hasPromptHistory}
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-50"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                                <History className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">Restaurar versão</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => runMobileEditorAction(handleResetPrompt)}
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/70"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                                <RefreshCw className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">Resetar instruções</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

            <div className="hidden md:flex md:flex-col" data-subscription-gate-ignore="true">
              <div className="hidden">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold lg:text-lg">Personalize com IA</h3>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                        {mobileSectionLabel}
                      </span>
                      <span className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10px] font-medium",
                        hasChanges
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                      )}>
                        {hasChanges ? "Rascunho" : "Salvo"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground lg:text-sm">Instrua em linguagem natural para configurar seu robô.</p>
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                  {(activeSection === "chat" || activeSection === "code") && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleUndo}
                        disabled={!canUndo}
                        className="h-8 w-8 p-0"
                        title="Desfazer"
                      >
                        <Undo2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRedo}
                        disabled={!canRedo}
                        className="h-8 w-8 p-0"
                        title="Refazer"
                      >
                        <Redo2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowHistory(!showHistory)}
                        className={cn("h-8 w-8 p-0", showHistory && "bg-muted")}
                        title="Histórico"
                      >
                        <History className="w-4 h-4" />
                      </Button>
                    </>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetPrompt}
                    className="h-8 rounded-full px-3 text-xs"
                    title="Resetar instruções para recomeçar"
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Resetar
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleSavePrompt}
                    disabled={!hasChanges || updateConfigMutation.isPending}
                    className="h-8 shrink-0 rounded-full px-3 text-xs"
                  >
                    {updateConfigMutation.isPending ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="w-3 h-3 mr-1" />
                    )}
                    Salvar
                  </Button>
                </div>
              </div>

              <div className="flex min-h-[54px] items-center gap-2 border-b border-[#e3e3e3] bg-white px-3 py-2">
                {activeSection === "flow" || activeSection === "flow2" ? (
                  <div className={cn(
                    "order-2 ml-auto flex h-9 shrink-0 items-center gap-2 rounded-full border px-3",
                    activeSection === "flow2"
                      ? "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/40 dark:bg-purple-900/20 dark:text-purple-300"
                      : flowModeActive
                      ? "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/40 dark:bg-purple-900/20 dark:text-purple-300"
                      : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300"
                  )}>
                    <Workflow className="h-3.5 w-3.5" />
                    <span className="text-xs font-semibold">
                      {activeSection === "flow2" ? "Fluxo 2.0 isolado" : flowModeActive ? "Fluxo ON - IA substituida" : "Fluxo OFF - IA normal"}
                    </span>
                  </div>
                ) : (
                  <div className={cn(
                    "order-2 ml-auto flex h-9 shrink-0 items-center gap-2 rounded-full border-l border-[#e3e3e3] px-3 pl-5",
                    isActive
                      ? "border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/20"
                      : "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20"
                  )}>
                    <Switch
                      checked={isActive}
                      onCheckedChange={(checked) => {
                        if (!guardMyAgentAction(checked ? "ativar IA no WhatsApp" : "desativar IA no WhatsApp", {
                          title: checked ? "Assine Plus para ativar a IA" : "Assine Plus para alterar a ativação",
                          description:
                            "No plano grátis você pode configurar e testar. Para ligar ou alterar a IA no atendimento real do WhatsApp, assine o Plus.",
                          benefit: "alterar a ativação da IA no WhatsApp",
                        })) {
                          return;
                        }
                        setIsActive(checked);
                        updateConfigMutation.mutate({ isActive: checked });
                      }}
                      className={cn("h-4 w-8", isActive ? "data-[state=checked]:bg-green-600" : "")}
                    />
                    <span className={cn(
                      "text-xs font-semibold",
                      isActive ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                    )}>
                      {isActive ? "IA ON" : "IA OFF"}
                    </span>
                  </div>
                )}

                <div className="no-scrollbar order-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                  {visibleSectionActions.filter(({ section }) => section !== "flow2").map(({ section, label, icon: Icon }) => (
                    <Button
                      key={section}
                      variant={isSectionNavActive(section) ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => changeSection(section)}
                      className={cn(
                        "h-9 shrink-0 rounded-lg px-3 text-xs font-semibold lg:px-3.5 lg:text-sm",
                        isSectionNavActive(section) && "bg-[#ebebeb] text-slate-950 shadow-none hover:bg-[#ebebeb]",
                        (section === "flow" || section === "flow2") &&
                          isSectionNavActive(section) &&
                          "bg-[#ebebeb] text-slate-950 hover:bg-[#ebebeb]"
                      )}
                    >
                      <Icon className="mr-1.5 h-3.5 w-3.5" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              {activeSection === "chat" && (
                <div className="flex items-center gap-4 border-b border-[#e3e3e3] bg-white px-6 py-6">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f1f1f1] text-slate-800">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-950">Personalize com IA</h3>
                    <p className="text-sm text-slate-500">Instrua em linguagem natural para configurar seu robô.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* History Panel */}
          {showHistory && promptHistory.length > 0 && (
            <div className="absolute left-0 right-0 top-12 z-50 mx-4 max-h-[24rem] overflow-y-auto rounded-lg border border-[#dfe3e8] bg-white px-4 py-3 shadow-lg">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-700">
                  <History className="h-4 w-4 shrink-0" />
                  <span className="truncate">Histórico de instruções ({promptHistory.length} versões)</span>
                </p>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Fechar histórico"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                {[...promptHistory].reverse().slice(0, 15).map((entry, idx) => {
                  const actualIndex = promptHistory.length - 1 - idx;
                  const isSelected = actualIndex === historyIndex;
                  const versionRecord = promptVersionsData?.versions?.find(v => v.id === entry.id);
                  const versionNumber = entry.versionNumber ?? versionRecord?.versionNumber ?? null;
                  const isCurrentInDB = versionRecord?.isCurrent === true;
                  const isReallyInUse = normalizePromptText(config?.prompt) === normalizePromptText(entry.prompt);
                  const canRestoreEntry = Boolean(versionRecord) && !isRestoring;
                  
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "relative flex items-center gap-3 rounded-lg border px-3 py-2 text-xs transition-colors",
                        isSelected
                          ? "border-[#008060]/30 bg-[#e9f8f3]"
                          : "border-[#e3e3e3] bg-white hover:bg-slate-50",
                        isRestoring && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {isRestoring && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/80">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => previewPromptHistoryIndex(actualIndex)}
                        disabled={isRestoring}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={cn("truncate", isSelected && "font-semibold text-[#008060]")}>
                            {versionNumber ? `v${versionNumber}` : `Versão ${actualIndex + 1}`} · {entry.instruction}
                          </span>
                          {isReallyInUse && (
                            <Badge variant="default" className="h-4 bg-green-600 px-1.5 py-0 text-[9px]">
                              EM USO
                            </Badge>
                          )}
                          {isCurrentInDB && !isReallyInUse && (
                            <Badge variant="outline" className="h-4 px-1.5 py-0 text-[9px]">
                              Atual
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                          <span>{formatPromptHistoryTimestamp(entry.timestamp)}</span>
                          <span>•</span>
                          <span>{entry.prompt.length} caracteres</span>
                        </div>
                      </button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => restoreFromHistory(actualIndex)}
                        disabled={!canRestoreEntry}
                        className="h-8 shrink-0 rounded-md px-2 text-[11px]"
                      >
                        Restaurar
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============ SECTION: CHAT ============ */}
          {activeSection === "chat" && (
            <div data-subscription-gate-ignore="true" className="flex min-h-0 flex-1 flex-col bg-[#f6f6f7]">
              <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-36 space-y-3 md:pb-4">
                {chatMessages.length === 0 && (
                  <div className="mx-auto max-w-4xl space-y-8 py-4 md:py-8">
                    {[
                      "Oi! Sou seu assistente de Inteligência Artificial. Comigo você não precisa mexer em códigos complicados.",
                      "Diga o que você quer mudar no comportamento do seu robô e eu ajustarei tudo agora mesmo.",
                    ].map((content) => (
                      <div key={content} className="flex justify-start">
                        <div className="flex max-w-[85%] gap-3 md:max-w-[70%]">
                          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black text-white">
                            <Bot className="h-4 w-4" />
                          </div>
                          <div className="rounded-xl rounded-tl-none border border-[#e3e3e3] bg-white px-4 py-3 text-[13.5px] leading-relaxed text-slate-700 shadow-sm">
                            {content}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}>
                    <div className={cn(
                      "flex max-w-[85%] gap-3 md:max-w-[70%]",
                      msg.role === "user" && "flex-row-reverse"
                    )}>
                      {msg.role === "assistant" && (
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black text-white">
                          <Bot className="h-4 w-4" />
                        </div>
                      )}
                      <div className={cn(
                        "space-y-3 rounded-xl border px-4 py-3 text-[13.5px] leading-relaxed shadow-sm",
                        msg.role === "user"
                          ? "rounded-tr-none border-[#d2d5d8] bg-white text-slate-900"
                          : msg.role === "system"
                            ? "mx-auto border-[#e3e3e3] bg-white text-center text-slate-600"
                            : "rounded-tl-none border-[#e3e3e3] bg-white text-slate-700"
                      )}>
                        {msg.mediaUrl && msg.mediaType === "audio" && (
                          <audio
                            src={msg.mediaUrl}
                            controls
                            className="w-full max-w-sm"
                          />
                        )}
                        <div
                          className="whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{
                            __html: formatWhatsAppTextForHtml(sanitizeAgentStudioChatMessageForDisplay(msg.role, msg.content)),
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                
                <div ref={chatEndRef} />
              </div>
              
              {/* Chat Input */}
              <div className="sticky bottom-0 z-30 shrink-0 bg-[#f6f6f7]">
                <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 md:p-6 lg:p-8">
                  {isRecordingEditAudio ? (
                    <UserAudioRecorder
                      onSend={handleSendEditAudio}
                      onCancel={() => setIsRecordingEditAudio(false)}
                      disabled={isUploadingEditAudio || isProcessing}
                      className="w-full"
                    />
                  ) : (
                    <div className="relative mx-auto max-w-3xl overflow-hidden rounded-[32px] border border-[#dfe3e8] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.14)] md:rounded-xl md:border-[#8c9196] md:shadow-[0_2px_12px_rgba(31,33,36,0.08)]">
                      <Textarea
                        placeholder={
                          isProcessing
                            ? "A IA está aplicando sua alteração..."
                            : isUploadingEditAudio
                              ? "Processando o áudio para aplicar a alteração..."
                              : "Diga à IA o que o seu robô deve fazer..."
                        }
                        value={editInput}
                        onChange={(e) => setEditInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleEditPrompt();
                          }
                        }}
                        disabled={isProcessing || isUploadingEditAudio}
                        className="min-h-[64px] max-h-[132px] resize-none rounded-[32px] border-0 bg-white py-5 pl-6 pr-[7.25rem] text-[16px] font-normal leading-6 shadow-none focus-visible:ring-0 md:min-h-[64px] md:max-h-56 md:rounded-none md:px-5 md:py-4 md:pr-5 md:text-[14px] md:leading-6"
                        rows={1}
                      />
                      <div className="absolute bottom-2 right-2 flex items-center gap-2 md:hidden">
                        {isProcessing || isUploadingEditAudio ? (
                          <Button
                            onClick={stopActiveQuickEdit}
                            size="icon"
                            type="button"
                            variant="outline"
                            className="h-11 w-11 shrink-0 rounded-full border-[#dfe3e8] bg-white text-slate-900 shadow-sm"
                            title="Parar processamento"
                          >
                            <Square className="w-4 h-4" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              onClick={() => setIsRecordingEditAudio(true)}
                              disabled={isProcessing || isUploadingEditAudio}
                              size="icon"
                              type="button"
                              variant="ghost"
                              className="h-11 w-11 shrink-0 rounded-full bg-white text-slate-900 hover:bg-slate-50"
                              title="Enviar áudio para ajustar o agente"
                            >
                              {isUploadingEditAudio ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Mic className="w-5 h-5" />
                              )}
                            </Button>
                            <Button
                              onClick={() => handleEditPrompt()}
                              disabled={isProcessing || !editInput.trim()}
                              size="icon"
                              className="h-11 w-11 shrink-0 rounded-full bg-black text-white shadow-sm hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
                              title="Enviar instrução"
                            >
                              {isProcessing ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Send className="w-5 h-5" />
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                      <div className="hidden items-center justify-between border-t border-[#f1f1f1] bg-[#fafafb] px-4 py-3 md:flex md:py-2">
                        <div className="hidden gap-1.5 md:flex">
                          {quickActions.map((action) => (
                            <button
                              key={action.label}
                              type="button"
                              onClick={() => setEditInput(action.instruction)}
                              className="rounded px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-200"
                            >
                              {action.label.replace("Mais ", "")}
                            </button>
                          ))}
                        </div>
                        {isProcessing || isUploadingEditAudio ? (
                          <Button
                            onClick={stopActiveQuickEdit}
                            size="icon"
                            type="button"
                            variant="outline"
                            className="h-9 w-9 shrink-0 rounded-lg border-primary/30 bg-background"
                            title="Parar processamento"
                          >
                            <Square className="w-4 h-4" />
                          </Button>
                        ) : (
                          <div className="ml-auto flex items-center gap-2">
                            <Button
                              onClick={() => setIsRecordingEditAudio(true)}
                              disabled={isProcessing || isUploadingEditAudio}
                              size="icon"
                              type="button"
                              variant="outline"
                              className="h-10 w-10 shrink-0 rounded-xl border-[#dfe3e8] bg-white text-slate-800 hover:bg-slate-50 md:h-9 md:w-9 md:rounded-lg"
                              title="Enviar áudio para ajustar o agente"
                            >
                              {isUploadingEditAudio ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Mic className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              onClick={() => handleEditPrompt()}
                              disabled={isProcessing || !editInput.trim()}
                              size="icon"
                              className="h-10 w-10 shrink-0 rounded-xl bg-black text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:text-white md:h-9 md:w-9 md:rounded-lg"
                              title="Enviar instrução"
                            >
                              {isProcessing ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Send className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(isProcessing || isUploadingEditAudio) && (
                    <div className="mt-3 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2">
                      <CustomerProcessTimeline
                        steps={AGENT_EDIT_PROCESS_STEPS}
                        activeIndex={editProcessIndex}
                      />
                      {editProcessingStatus && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {toCustomerProcessMessage(editProcessingStatus)}
                        </p>
                      )}
                    </div>
                  )}
                  
                </div>
              </div>
            </div>
          )}

          {/* ============ SECTION: CODE ============ */}
          {activeSection === "code" && (
            <div className="flex flex-1 flex-col gap-3 p-4" data-subscription-gate-ignore="true">
              <div
                data-testid="prompt-history-version-controls"
                className="rounded-lg border border-[#dfe3e8] bg-white p-3 shadow-sm"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#e9f8f3] text-[#008060]">
                        <Clock className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">Histórico de instruções</p>
                        <p className="truncate text-xs text-slate-500">
                          {selectedHistoryEntry ? (
                            <>
                              {selectedHistoryVersionNumber ? `v${selectedHistoryVersionNumber}` : `Versão ${selectedHistoryPosition}`} de {promptHistory.length}
                              {" · "}
                              {formatPromptHistoryTimestamp(selectedHistoryEntry.timestamp)}
                            </>
                          ) : (
                            "Nenhuma versão carregada ainda"
                          )}
                        </p>
                      </div>
                    </div>
                    {selectedHistoryEntry && (
                      <p className="mt-2 line-clamp-1 text-xs text-slate-600">
                        {selectedHistoryEntry.summary || selectedHistoryEntry.instruction}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedHistoryMatchesCurrentPrompt && (
                      <Badge variant="outline" className="h-8 rounded-md border-green-200 bg-green-50 px-2 text-[11px] font-semibold text-green-700">
                        Em uso
                      </Badge>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePreviousPromptVersion}
                      disabled={historyIndex <= 0}
                      className="h-9 rounded-md px-2 text-xs"
                      title="Versão anterior"
                    >
                      <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                      Anterior
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleNextPromptVersion}
                      disabled={historyIndex < 0 || historyIndex >= promptHistory.length - 1}
                      className="h-9 rounded-md px-2 text-xs"
                      title="Próxima versão"
                    >
                      Próxima
                      <Redo2 className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowHistory((current) => !current)}
                      disabled={!hasPromptHistory}
                      className={cn("h-9 rounded-md px-2 text-xs", showHistory && "bg-[#e9f8f3] text-[#008060]")}
                      title="Abrir histórico"
                    >
                      <History className="mr-1.5 h-3.5 w-3.5" />
                      Ver versões
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (historyIndex >= 0) {
                          restoreFromHistory(historyIndex);
                        }
                      }}
                      disabled={!canRestoreSelectedHistoryVersion}
                      className="h-9 rounded-md bg-[#008060] px-3 text-xs font-bold text-white hover:bg-[#006e52]"
                      title="Restaurar versão selecionada"
                    >
                      {isRestoring ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                      Restaurar esta versão
                    </Button>
                  </div>
                </div>
              </div>
              <Textarea
                ref={promptEditorRef}
                value={currentPrompt}
                onChange={(e) => {
                setCurrentPrompt(normalizePromptText(e.target.value));
                setHasChanges(true);
                }}
                className="flex-1 font-mono text-sm resize-none bg-zinc-950 text-green-400 rounded-xl p-4 border-zinc-800"
                spellCheck={false}
              />
              <Button onClick={handleSavePrompt} disabled={updateConfigMutation.isPending}>
                {updateConfigMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar instruções
              </Button>
            </div>
          )}

          {/* ============ SECTION: MEDIA ============ */}
          {activeSection === "media" && (
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Biblioteca de Mídias</h2>
                  <Button onClick={openNewMediaDialog} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar
                  </Button>
                </div>

                {mediaLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : visibleMediaItems.length === 0 ? (
                  <Card className="py-12">
                    <CardContent className="flex flex-col items-center text-center">
                      <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground mb-4">
                        Nenhuma mídia cadastrada ainda
                      </p>
                      <Button onClick={openNewMediaDialog}>
                        <Plus className="h-4 w-4 mr-2" />
                        Adicionar primeira mídia
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {visibleMediaItems.map((media) => (
                      <Card key={media.id} className="overflow-hidden">
                        <div className="aspect-video bg-muted flex items-center justify-center relative">
                          {media.mediaType === 'image' && media.storageUrl ? (
                            <img 
                              src={media.storageUrl} 
                              alt={media.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              {getMediaIcon(media.mediaType)}
                              <span className="text-xs">{media.mediaType}</span>
                            </div>
                          )}
                          <Badge className="absolute top-2 right-2 text-xs">
                            {media.mediaType}
                          </Badge>
                        </div>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{media.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {media.mediaType === 'flow' 
                                  ? `🔀 ${(media.flowItems || []).length} itens`
                                  : formatFileSize(media.fileSize)
                                }
                              </p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8"
                                onClick={() => openEditMediaDialog(media)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-destructive"
                                onClick={() => {
                                  if (!guardMyAgentAction("remover mídia do agente", {
                                    title: "Assine Plus para remover mídias",
                                    description:
                                      "No plano grátis você pode revisar a biblioteca. Para alterar a biblioteca do agente real, assine o Plus.",
                                    benefit: "alterar mídias do agente",
                                  })) {
                                    return;
                                  }
                                  deleteMediaMutation.mutate(media.id);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          {media.whenToUse && (
                            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                              {media.whenToUse}
                            </p>
                          )}
                          {/* Mostrar sequência do fluxo na card */}
                          {media.mediaType === 'flow' && media.flowItems && (media.flowItems as FlowItem[]).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {[...(media.flowItems as FlowItem[])].sort((a, b) => a.order - b.order).map((item, idx) => (
                                <span key={item.id} className="text-xs px-1 py-0.5 rounded bg-muted border text-muted-foreground">
                                  {idx + 1}. {item.type === 'text' ? '💬' : item.mediaType === 'audio' ? '🎵' : item.mediaType === 'image' ? '🖼️' : item.mediaType === 'video' ? '🎬' : '📄'} {item.type}
                                </span>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {/* ============ SECTION: INFO ============ */}
          {activeSection === "info" && (
            <ScrollArea className="flex-1" data-subscription-gate-ignore="true">
              <div className="p-4 space-y-4">
                <div className="rounded-2xl border bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-sky-100 p-2 text-sky-700">
                      <Info className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-lg font-semibold">Info do atendimento</h2>
                      <p className="text-sm text-muted-foreground">
                        Configure a saudação inicial, endereço fixo, horário de funcionamento e a mensagem opcional para contatos fora do horário.
                      </p>
                    </div>
                  </div>
                </div>

                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          Primeira saudação
                        </CardTitle>
                        <CardDescription>
                          Monte a sequência inicial do atendimento. Você pode mandar texto, imagem, áudio, vídeo ou arquivo na ordem que quiser.
                        </CardDescription>
                      </div>
                      <Switch checked={greetingEnabled} onCheckedChange={setGreetingEnabled} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {greetingEnabled && (
                      <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1">
                            <Label className="text-sm font-semibold">Fluxo de abertura</Label>
                            <p className="text-sm text-muted-foreground">
                              Arraste as etapas ou use as setas para definir a ordem. Se quiser, a imagem pode vir antes do texto.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={addGreetingMainTextItem}>
                              <MessageSquare className="h-4 w-4 mr-2" />
                              Saudacao
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={addGreetingExtraTextItem}>
                              <Plus className="h-4 w-4 mr-2" />
                              Texto
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => addGreetingExtraMediaItem("image")}>
                              <ImageIcon className="h-4 w-4 mr-2" />
                              Imagem
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => addGreetingExtraMediaItem("audio")}>
                              <Music className="h-4 w-4 mr-2" />
                              Audio
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => addGreetingExtraMediaItem("video")}>
                              <Video className="h-4 w-4 mr-2" />
                              Video
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => addGreetingExtraMediaItem("document")}>
                              <FileText className="h-4 w-4 mr-2" />
                              Arquivo
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-start justify-between gap-4 rounded-xl border bg-background/80 p-3">
                          <div>
                            <Label className="text-sm font-medium">Variacao com IA</Label>
                            <p className="text-xs text-muted-foreground">
                              Reescreve apenas a etapa marcada como saudação principal, mantendo o mesmo sentido para cada cliente.
                            </p>
                          </div>
                          <Switch
                            checked={greetingVariation}
                            onCheckedChange={setGreetingVariation}
                            disabled={!greetingEnabled || !greetingExtraFlowItems.some((item) => item.type === "text" && item.isGreeting)}
                          />
                        </div>

                        {greetingExtraFlowItems.length === 0 ? (
                          <div className="rounded-xl border border-dashed bg-background/80 p-4 text-sm text-muted-foreground">
                            Nenhuma etapa configurada. Comece adicionando uma saudação, uma imagem, um áudio, um vídeo ou um arquivo.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {greetingExtraFlowItems.map((item, index) => (
                              <div
                                key={item.id}
                                draggable
                                onDragStart={() => setDraggingGreetingFlowItemId(item.id)}
                                onDragEnd={() => setDraggingGreetingFlowItemId(null)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={() => {
                                  if (draggingGreetingFlowItemId) {
                                    reorderGreetingExtraFlowItems(draggingGreetingFlowItemId, item.id);
                                  }
                                  setDraggingGreetingFlowItemId(null);
                                }}
                                className={cn(
                                  "rounded-xl border bg-background p-4 space-y-3 transition-colors",
                                  draggingGreetingFlowItemId === item.id && "border-primary/50 bg-primary/5"
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <button
                                      type="button"
                                      className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                                      aria-label={`Arrastar etapa ${index + 1}`}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                    </button>
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="secondary">Etapa {index + 1}</Badge>
                                        {item.type === "text" && item.isGreeting && (
                                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                                            Saudacao principal
                                          </Badge>
                                        )}
                                        <span className="text-sm font-medium">
                                          {item.type === "text"
                                            ? item.isGreeting
                                              ? "Texto da saudação"
                                              : "Mensagem de texto"
                                            : getGreetingFlowMediaLabel(item.mediaType)}
                                        </span>
                                      </div>
                                      <p className="text-xs text-muted-foreground">
                                        {item.type === "text" && item.isGreeting
                                          ? 'Use {"{nome}"} para personalizar com o nome do cliente.'
                                          : item.type === "text"
                                            ? "Mensagem complementar dentro da abertura."
                                            : "Midia enviada nessa etapa da abertura."}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => moveGreetingExtraFlowItem(item.id, "up")}
                                      disabled={index === 0}
                                    >
                                      <MoveUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => moveGreetingExtraFlowItem(item.id, "down")}
                                      disabled={index === greetingExtraFlowItems.length - 1}
                                    >
                                      <MoveDown className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => removeGreetingExtraFlowItem(item.id)}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                </div>

                                {item.type === "text" ? (
                                  <div className="space-y-3">
                                    {!item.isGreeting && (
                                      <div className="flex justify-start">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => setGreetingFlowPrimaryItem(item.id)}
                                        >
                                          Tornar saudação principal
                                        </Button>
                                      </div>
                                    )}
                                    <Textarea
                                      value={item.text || ""}
                                      onChange={(e) =>
                                        updateGreetingExtraFlowItem(item.id, (current) => ({
                                          ...current,
                                          type: "text",
                                          text: e.target.value,
                                        }))
                                      }
                                      placeholder={
                                        item.isGreeting
                                          ? "Ex: Ola {nome}! Seja bem-vindo. Como posso ajudar?"
                                          : "Ex: Se quiser, eu ja posso te mostrar as opcoes mais vendidas."
                                      }
                                      rows={item.isGreeting ? 4 : 3}
                                    />
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {item.storageUrl ? (
                                      <div className="space-y-3">
                                        {item.mediaType === "image" && (
                                          <img
                                            src={item.storageUrl}
                                            alt={item.fileName || `Etapa ${index + 1}`}
                                            className="h-40 w-full rounded-xl border object-cover"
                                          />
                                        )}
                                        {item.mediaType === "audio" && (
                                          <audio controls className="w-full" src={item.storageUrl} />
                                        )}
                                        {item.mediaType === "video" && (
                                          <video controls className="h-48 w-full rounded-xl border bg-black" src={item.storageUrl} />
                                        )}
                                        {item.mediaType === "document" && (
                                          <a
                                            href={item.storageUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-2 rounded-xl border p-3 text-sm text-primary underline-offset-4 hover:underline"
                                          >
                                            <FileText className="h-4 w-4" />
                                            {item.fileName || "Abrir arquivo"}
                                          </a>
                                        )}
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => removeGreetingExtraMedia(item.id)}
                                        >
                                          Remover midia
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                        Envie um {getGreetingFlowMediaLabel(item.mediaType).toLowerCase()} para esta etapa.
                                      </div>
                                    )}

                                    <div className="space-y-2">
                                      <Label className="text-sm">Arquivo da etapa</Label>
                                      <Input
                                        type="file"
                                        accept={getGreetingFlowAccept(item.mediaType)}
                                        disabled={uploadingGreetingFlowItemId === item.id}
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          handleGreetingExtraMediaUpload(item.id, file);
                                          e.currentTarget.value = "";
                                        }}
                                      />
                                      {uploadingGreetingFlowItemId === item.id && (
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          Enviando {getGreetingFlowMediaLabel(item.mediaType).toLowerCase()}...
                                        </div>
                                      )}
                                    </div>

                                    <div className="space-y-2">
                                      <Label className="text-sm">Legenda ou mensagem opcional</Label>
                                      <Textarea
                                        value={item.caption || ""}
                                        onChange={(e) =>
                                          updateGreetingExtraFlowItem(item.id, (current) => ({
                                            ...current,
                                            type: "media",
                                            mediaType: current.mediaType || "image",
                                            caption: e.target.value,
                                          }))
                                        }
                                        placeholder="Ex: Veja este material e me diga qual opção faz mais sentido para você."
                                        rows={2}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
                          Ordem de envio: o WhatsApp segue exatamente a ordem exibida acima. Se a imagem estiver na etapa 1, ela vai antes do texto.
                        </div>
                      </div>
                    )}
                    <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                      {greetingEnabled
                        ? greetingExtraFlowItems.length === 0
                          ? "Com a saudação ligada, o ideal é montar pelo menos uma etapa para a abertura do atendimento."
                          : greetingVariation
                            ? "A variação com IA será aplicada apenas na etapa marcada como saudação principal."
                            : "A abertura sera enviada exatamente na ordem configurada neste fluxo."
                        : "Com a saudação desligada, o agente continua abrindo a conversa apenas com as regras principais."}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Edit3 className="h-4 w-4" />
                          Assinatura da IA
                        </CardTitle>
                        <CardDescription>
                          Quando ativada, cada resposta de texto da IA sai com o nome do agente na linha de cima. No áudio o nome não entra.
                        </CardDescription>
                      </div>
                      <Switch checked={aiSignatureEnabled} onCheckedChange={setAiSignatureEnabled} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="ai-signature-name">Nome exibido</Label>
                      <Input
                        id="ai-signature-name"
                        value={aiSignature}
                        onChange={(e) => setAiSignature(e.target.value)}
                        placeholder={detectedAiSignature || "Ex: Rodrigo, Lara, Atendimento IA"}
                        maxLength={50}
                        disabled={!aiSignatureEnabled}
                      />
                      <p className="text-xs text-muted-foreground">
                        Se deixar em branco, o sistema tenta usar o nome detectado nas instruções.
                        {detectedAiSignature ? ` Nome atual detectado: ${detectedAiSignature}.` : " Ajuste as instruções ou preencha manualmente para evitar nome generico."}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-muted/30 p-3">
                      <p className="text-xs font-medium text-muted-foreground">Previa do WhatsApp</p>
                      <div className="mt-2 text-sm">
                        <strong>*{resolvedAiSignaturePreview}:*</strong>
                        <span className="block">Ola! Como posso ajudar?</span>
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                      {aiSignatureEnabled
                        ? manualAiSignature
                          ? "A assinatura manual da IA sera usada em todas as mensagens de texto enviadas pelo agente."
                          : detectedAiSignature
                            ? "A IA vai usar o nome detectado nas instruções em cada mensagem de texto."
                            : "Sem nome detectado nas instruções, o sistema vai cair no nome padrão até você preencher manualmente."
                        : "Com a assinatura desligada, a IA continua respondendo sem nome no topo da mensagem."}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          Endereco fixo
                        </CardTitle>
                        <CardDescription>
                          Endereco oficial do negocio para a IA nunca inventar outro local.
                        </CardDescription>
                      </div>
                      <Switch checked={addressEnabled} onCheckedChange={setAddressEnabled} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      value={customAddress}
                      onChange={(e) => setCustomAddress(e.target.value)}
                      placeholder="Ex: Rua Principal, 456 - Centro, Sao Paulo/SP - CEP 01000-000"
                      rows={3}
                      disabled={!addressEnabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      Quando o cliente perguntar onde fica, como chegar ou localizacao, a IA deve responder com este endereco.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Horario de funcionamento
                        </CardTitle>
                        <CardDescription>
                          Dias e horarios que o agente deve considerar como atendimento aberto.
                        </CardDescription>
                      </div>
                      <Switch checked={businessHoursEnabled} onCheckedChange={setBusinessHoursEnabled} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(Object.entries(BUSINESS_HOURS_LABELS) as Array<[BusinessHoursKey, string]>).map(([dayKey, dayLabel]) => (
                      <div key={dayKey} className="rounded-xl border p-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">{dayLabel}</p>
                              <p className="text-xs text-muted-foreground">
                                {businessHours[dayKey].enabled ? "Dia ativo" : "Fechado"}
                              </p>
                            </div>
                            <Switch
                              checked={businessHours[dayKey].enabled}
                              onCheckedChange={(checked) =>
                                updateBusinessHoursDay(dayKey, {
                                  enabled: checked,
                                  open: checked ? businessHours[dayKey].open || "09:00" : "",
                                  close: checked ? businessHours[dayKey].close || "18:00" : "",
                                })
                              }
                              disabled={!businessHoursEnabled}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2 md:w-[220px]">
                            <Input
                              type="time"
                              value={businessHours[dayKey].open}
                              onChange={(e) => updateBusinessHoursDay(dayKey, { open: e.target.value })}
                              disabled={!businessHoursEnabled || !businessHours[dayKey].enabled}
                            />
                            <Input
                              type="time"
                              value={businessHours[dayKey].close}
                              onChange={(e) => updateBusinessHoursDay(dayKey, { close: e.target.value })}
                              disabled={!businessHoursEnabled || !businessHours[dayKey].enabled}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Mensagem fora do horario
                        </CardTitle>
                        <CardDescription>
                          Opcional. Se ativada, a primeira resposta fora do horario usa esta mensagem como abertura.
                        </CardDescription>
                      </div>
                      <Switch
                        checked={offHoursMessageEnabled}
                        onCheckedChange={setOffHoursMessageEnabled}
                        disabled={!businessHoursEnabled}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      value={offHoursMessage}
                      onChange={(e) => setOffHoursMessage(e.target.value)}
                      placeholder="Ex: Ola! Agora estamos fora do horario de atendimento, mas assim que abrirmos eu continuo por aqui."
                      rows={3}
                      disabled={!businessHoursEnabled || !offHoursMessageEnabled}
                    />
                    <div className="flex items-start justify-between gap-4 rounded-xl border p-3">
                      <div>
                        <Label className="text-sm font-medium">Variacao com IA</Label>
                        <p className="text-xs text-muted-foreground">
                          Quando ativo, a IA reescreve a mensagem fora do horario mantendo o mesmo sentido.
                        </p>
                      </div>
                      <Switch
                        checked={offHoursVariation}
                        onCheckedChange={setOffHoursVariation}
                        disabled={!businessHoursEnabled || !offHoursMessageEnabled}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {offHoursMessageEnabled
                        ? offHoursVariation
                          ? "Fora do horario, a primeira resposta sera somente uma variacao desta mensagem, sem complemento adicional."
                          : "Fora do horario, a primeira resposta sera somente esta mensagem, sem complemento das regras principais."
                        : "Com a mensagem fora do horario desligada, o agente segue apenas as regras gerais."}
                    </p>
                  </CardContent>
                </Card>

                <Button
                  onClick={handleSaveConfig}
                  disabled={updateConfigMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  {updateConfigMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar Informacoes
                </Button>
              </div>
            </ScrollArea>
          )}

          {/* ============ SECTION: CONFIG ============ */}
          {activeSection === "config" && (
            <ScrollArea className="flex-1" data-subscription-gate-ignore="true">
              <div className="p-4 space-y-4">
                <h2 className="text-lg font-semibold">Configurações do Agente</h2>

                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          Informações do atendimento
                        </CardTitle>
                        <CardDescription>
                          Saudação inicial, endereço, horário e mensagens fora do horário.
                        </CardDescription>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => changeSection("info")}>
                        Abrir
                      </Button>
                    </div>
                  </CardHeader>
                </Card>

                {/* Tempo de Resposta */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Tempo de Resposta
                    </CardTitle>
                    <CardDescription>
                      Delay antes de enviar resposta
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant={responseDelaySeconds === 10 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setResponseDelaySeconds(10)}
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        Rápido (10s)
                      </Button>
                      <Button
                        variant={responseDelaySeconds === 30 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setResponseDelaySeconds(30)}
                      >
                        Normal (30s)
                      </Button>
                      <Button
                        variant={responseDelaySeconds === 60 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setResponseDelaySeconds(60)}
                      >
                        Lento (60s)
                      </Button>
                    </div>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[responseDelaySeconds]}
                        onValueChange={([v]) => setResponseDelaySeconds(v)}
                        min={5}
                        max={120}
                        step={5}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12 text-right">{responseDelaySeconds}s</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Tamanho das Mensagens */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Tamanho das Mensagens
                    </CardTitle>
                    <CardDescription>
                      Dividir mensagens longas
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant={messageSplitChars === 200 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMessageSplitChars(200)}
                      >
                        Pequeno (200)
                      </Button>
                      <Button
                        variant={messageSplitChars === 400 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMessageSplitChars(400)}
                      >
                        Médio (400)
                      </Button>
                      <Button
                        variant={messageSplitChars === 0 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMessageSplitChars(0)}
                      >
                        Sem divisão
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Frases Gatilho */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Frases Gatilho
                    </CardTitle>
                    <CardDescription>
                      A IA só responde se a mensagem contiver uma dessas frases
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        value={newTriggerPhrase}
                        onChange={(e) => setNewTriggerPhrase(e.target.value)}
                        placeholder="Ex: olá, quero saber"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTriggerPhrase()}
                      />
                      <Button onClick={handleAddTriggerPhrase} disabled={!newTriggerPhrase.trim()}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {triggerPhrases.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {triggerPhrases.map((phrase, i) => (
                          <Badge key={i} variant="secondary" className="pl-2 pr-1 py-1">
                            {phrase}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 ml-1"
                              onClick={() => handleRemoveTriggerPhrase(phrase)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Sem frases gatilho = IA responde a todas mensagens
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Memória de Conversas */}
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Brain className="h-4 w-4" />
                          Memória de Conversas
                        </CardTitle>
                        <CardDescription>
                          Buscar histórico na primeira resposta
                        </CardDescription>
                      </div>
                      <Switch
                        checked={fetchHistoryOnFirstResponse}
                        onCheckedChange={setFetchHistoryOnFirstResponse}
                      />
                    </div>
                  </CardHeader>
                </Card>

                {/* Pausar ao Responder Manualmente */}
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Pause className="h-4 w-4" />
                          Pausar IA ao Responder
                        </CardTitle>
                        <CardDescription>
                          Desativa IA quando você responde
                        </CardDescription>
                      </div>
                      <Switch
                        checked={pauseOnManualReply}
                        onCheckedChange={setPauseOnManualReply}
                      />
                    </div>
                  </CardHeader>
                  
                  {/* Timer de Auto-Reativação - só aparece quando pauseOnManualReply está ativo */}
                  {pauseOnManualReply && (
                    <CardContent className="pt-0 pb-4">
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <Label className="text-sm font-medium">Reativar IA Automaticamente</Label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Se você não continuar conversando, a IA volta após o tempo selecionado
                        </p>
                        
                        <div className="grid grid-cols-3 gap-2">
                          <Button
                            variant={autoReactivateMinutes === null ? "default" : "outline"}
                            size="sm"
                            className="text-xs"
                            onClick={() => { setAutoReactivateMinutes(null); setCustomMinutesInput(""); }}
                          >
                            Nunca
                          </Button>
                          <Button
                            variant={autoReactivateMinutes === 10 ? "default" : "outline"}
                            size="sm"
                            className="text-xs"
                            onClick={() => { setAutoReactivateMinutes(10); setCustomMinutesInput(""); }}
                          >
                            10 min
                          </Button>
                          <Button
                            variant={autoReactivateMinutes === 30 ? "default" : "outline"}
                            size="sm"
                            className="text-xs"
                            onClick={() => { setAutoReactivateMinutes(30); setCustomMinutesInput(""); }}
                          >
                            30 min
                          </Button>
                          <Button
                            variant={autoReactivateMinutes === 60 ? "default" : "outline"}
                            size="sm"
                            className="text-xs"
                            onClick={() => { setAutoReactivateMinutes(60); setCustomMinutesInput(""); }}
                          >
                            1 hora
                          </Button>
                          <Button
                            variant={autoReactivateMinutes === 120 ? "default" : "outline"}
                            size="sm"
                            className="text-xs"
                            onClick={() => { setAutoReactivateMinutes(120); setCustomMinutesInput(""); }}
                          >
                            2 horas
                          </Button>
                          
                          {/* Campo Custom - Input direto de minutos */}
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              max="10080"
                              placeholder="min"
                              className={`w-16 h-8 text-xs text-center rounded-md border ${
                                autoReactivateMinutes !== null && ![null, 10, 30, 60, 120].includes(autoReactivateMinutes)
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-input bg-background"
                              }`}
                              value={
                                autoReactivateMinutes !== null && ![10, 30, 60, 120].includes(autoReactivateMinutes)
                                  ? autoReactivateMinutes
                                  : customMinutesInput
                              }
                              onChange={(e) => {
                                const value = e.target.value;
                                setCustomMinutesInput(value);
                                if (value && !isNaN(Number(value)) && Number(value) > 0) {
                                  setAutoReactivateMinutes(Number(value));
                                }
                              }}
                            />
                            <span className="text-xs text-muted-foreground">min</span>
                          </div>
                        </div>
                        
                        <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md">
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            {autoReactivateMinutes === null 
                              ? "💡 A IA só volta quando você reativar manualmente na conversa."
                              : `⏰ Se o cliente enviar mensagem e você não responder em ${autoReactivateMinutes} min, a IA lê o contexto e responde.`
                            }
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* Botão Salvar */}
                <Button 
                  onClick={handleSaveConfig} 
                  disabled={updateConfigMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  {updateConfigMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar Configurações
                </Button>
              </div>
            </ScrollArea>
          )}

          {/* ============ SECTION: FLOW (MODO FLUXO - PARTE 5) ============ */}
          {activeSection === 'flow' && (
            <div className="flex-1 overflow-y-auto">
              <FlowTab
                greetingEnabled={greetingEnabled}
                greetingVariation={greetingVariation}
                openingFlowItems={greetingExtraFlowItems}
                draggingGreetingFlowItemId={draggingGreetingFlowItemId}
                uploadingGreetingFlowItemId={uploadingGreetingFlowItemId}
                onGreetingEnabledChange={setGreetingEnabled}
                onGreetingVariationChange={setGreetingVariation}
                onDraggingGreetingFlowItemChange={setDraggingGreetingFlowItemId}
                onAddGreetingMainTextItem={addGreetingMainTextItem}
                onAddGreetingTextItem={addGreetingExtraTextItem}
                onAddGreetingMediaItem={addGreetingExtraMediaItem}
                onUpdateGreetingFlowItem={(itemId, nextItem) =>
                  updateGreetingExtraFlowItem(itemId, () => nextItem as FlowItem)
                }
                onRemoveGreetingFlowItem={removeGreetingExtraFlowItem}
                onMoveGreetingFlowItem={moveGreetingExtraFlowItem}
                onReorderGreetingFlowItems={reorderGreetingExtraFlowItems}
                onSetGreetingPrimaryItem={setGreetingFlowPrimaryItem}
                onUploadGreetingMedia={handleGreetingExtraMediaUpload}
                onRemoveGreetingMedia={removeGreetingExtraMedia}
                onOpenInfo={() => changeSection("info")}
              />
            </div>
          )}
        </div>

        {/* ============ RIGHT PANEL: SIMULATOR ============ */}
        {activeSection !== "flow" && activeSection !== "flow2" && (
        <div className={cn(
          "mx-auto flex min-h-0 w-full max-w-md min-w-0 flex-1 flex-col overflow-hidden border border-[#e3e3e3] bg-white shadow-sm dark:bg-zinc-900 md:mx-0 md:w-[400px] md:max-w-none md:flex-none md:rounded-xl",
          mobileView !== "simulator" && "hidden md:flex"
        )} data-subscription-gate-ignore={isMyAgentFreeTrialSection ? "true" : undefined}>
          <div className="hidden h-10 shrink-0 items-center justify-between border-b border-[#e3e3e3] bg-white px-4 md:flex">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
              <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
              <span className="h-2 w-2 rounded-full bg-[#28c840]" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Testar Agente
            </span>
          </div>
          
          {/* Simulator Header */}
          <div className="flex shrink-0 items-center gap-3 bg-[#075E54] px-3 py-3 text-white dark:bg-zinc-800 md:px-4">
            <img
              src="https://i.pravatar.cc/100?u=6"
              alt="Testar Agente"
              className="h-10 w-10 rounded-full border-2 border-white/20 object-cover md:h-11 md:w-11"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[15px] font-bold leading-tight md:text-lg">Testar Agente</p>
                {flowModeActive && (
                  <span className="rounded-full border border-white/30 bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    FLUXO ON
                  </span>
                )}
              </div>
              <p className="truncate text-[11px] font-medium leading-tight text-white/80 md:text-xs">
                {flowModeActive
                  ? "Simulando com roteiro do fluxo"
                  : "Teste seu agente em tempo real"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white/85 hover:bg-white/10 hover:text-white md:h-9 md:w-9" title="Video">
                <Video className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white/85 hover:bg-white/10 hover:text-white md:h-9 md:w-9" title="Ligar">
                <Phone className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearSimulator}
                className="h-8 w-8 text-white/85 hover:bg-white/10 hover:text-white md:h-9 md:w-9"
                title="Limpar simulador"
                aria-label="Limpar conversa do simulador"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Simulator Messages */}
          <div 
            className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3"
            style={{ 
              backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')",
              backgroundSize: "400px",
              backgroundRepeat: "repeat",
            }}
          >
            <div className="flex justify-center">
              <span className="rounded-lg bg-[#E9EEF6] px-4 py-1.5 text-[11px] font-bold text-[#4A5568] shadow-sm">
                HOJE
              </span>
            </div>
            {simulatorMessages.length === 0 && (
              <div className="space-y-5">
                <div className="flex justify-center">
                  <div className={cn(
                    "max-w-[300px] rounded-lg px-4 py-3 text-center text-xs shadow-sm",
                    flowModeActive
                      ? "border border-purple-300/40 bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200"
                      : "bg-[#FCF4CB] text-[#54656F] dark:bg-yellow-900/30 dark:text-yellow-200"
                  )}>
                    <Smartphone className="mx-auto mb-1 h-4 w-4" />
                    {flowModeActive
                      ? "Modo Fluxo ativo. O agente seguira o roteiro configurado."
                      : "Digite uma mensagem ou envie um áudio para testar como seu agente responde em tempo real."}
                  </div>
                </div>
                {!flowModeActive && (
                  <div className="flex justify-end">
                    <div className="max-w-[78%] rounded-lg rounded-tr-none bg-[#DCF8C6] px-3 py-2 text-[#303030] shadow-sm">
                      <p className="text-sm">Olá, como você funciona?</p>
                      <p className="mt-1 text-right text-[10px] text-[#667781]">12:35 ✓✓</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {simulatorMessages.map((msg) => (
              <div key={msg.id} className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}>
                <div className={cn(
                  "px-3 py-2 rounded-lg max-w-[80%] shadow-sm",
                  msg.role === "user" 
                    ? "bg-[#DCF8C6] dark:bg-green-800 text-[#303030] dark:text-white rounded-tr-none" 
                    : "bg-white dark:bg-zinc-700 text-[#303030] dark:text-white rounded-tl-none"
                )}>
                  {/* 🆕 RENDERIZAR MÍDIA SE HOUVER */}
                  {msg.mediaUrl && (
                    <div className="mb-2">
                      {msg.mediaType === 'image' && (
                        <img src={msg.mediaUrl} alt="Mídia" className="rounded max-w-full max-h-60 object-cover" />
                      )}
                      {msg.mediaType === 'video' && (
                        <video src={msg.mediaUrl} controls className="rounded max-w-full max-h-60" />
                      )}
                      {msg.mediaType === 'audio' && (
                        <div className="flex items-center gap-2 bg-[#F0F2F5] dark:bg-zinc-800 rounded-lg p-2 min-w-[200px]">
                          <audio 
                            src={msg.mediaUrl} 
                            controls 
                            controlsList="nodownload"
                            className="w-full"
                            style={{
                              height: '32px',
                              accentColor: '#00A884'
                            }}
                          />
                        </div>
                      )}
                      {msg.mediaType === 'document' && (
                        <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline flex items-center gap-1">
                          📄 Abrir documento
                        </a>
                      )}
                    </div>
                  )}
                  
                  {/* TEXTO DA MENSAGEM (se houver) */}
                  {msg.message && (
                    msg.mediaType === "audio" ? (
                      <div className={cn(
                        "mt-2 rounded-md border-l-2 px-3 py-2",
                        msg.role === "user"
                          ? "border-[#00A884]/40 bg-white/35 dark:bg-black/10"
                          : "border-slate-300 bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800/70"
                      )}>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#667781] dark:text-zinc-400">
                          Transcrição
                        </p>
                        <p
                          className="text-sm whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{ __html: formatWhatsAppTextForHtml(msg.message) }}
                        />
                      </div>
                    ) : (
                      <p 
                        className="text-sm whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: formatWhatsAppTextForHtml(msg.message) }}
                      />
                    )
                  )}
                  
                  <p className={cn(
                    "text-[10px] text-right mt-1",
                    msg.role === "user" ? "text-[#667781] dark:text-green-300" : "text-[#667781] dark:text-zinc-400"
                  )}>
                    {msg.time} {msg.role === "user" && "\u2713\u2713"}
                  </p>
                </div>
              </div>
            ))}

            {isSimulating && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-zinc-700 px-4 py-3 rounded-lg rounded-tl-none shadow-sm">
                  <CustomerProcessTimeline
                    steps={SIMULATOR_PROCESS_STEPS}
                    activeIndex={simulatorProcessIndex}
                    compact
                  />
                </div>
              </div>
            )}
            
            <div ref={simulatorEndRef} />
          </div>

          {/* Simulator Input */}
          <div className="flex shrink-0 items-center gap-2 bg-[#F0F2F5] px-2 py-2 dark:bg-zinc-800 md:px-3 md:py-3">
            <div className="flex min-h-[48px] flex-1 items-center gap-2 rounded-full bg-white px-4 shadow-sm dark:bg-zinc-700 md:min-h-[52px]">
              <Smile className="h-5 w-5 shrink-0 text-[#54656F]" />
              <Textarea
                placeholder="Digite sua mensagem..."
                value={simulatorInput}
                onChange={(e) => setSimulatorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && simulatorInput.trim()) {
                    e.preventDefault();
                    handleSimulate();
                  }
                }}
                className="min-h-[38px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm shadow-none focus-visible:ring-0"
                rows={1}
              />
              <Paperclip className="h-5 w-5 shrink-0 text-[#54656F]" />
            </div>
            <Button
              onClick={handleSimulate}
              disabled={isSimulating || !simulatorInput.trim()}
              size="icon"
              className="h-12 w-12 shrink-0 rounded-full bg-[#00A884] text-white hover:bg-[#008f6f] disabled:opacity-80 md:h-[52px] md:w-[52px]"
            >
              {isSimulating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : simulatorInput.trim() ? (
                <Send className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
        )}
      </div>

      {/* Media Dialog */}
      <Dialog open={mediaDialogOpen} onOpenChange={setMediaDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingMedia ? 'Editar Mídia' : 'Nova Mídia'}
            </DialogTitle>
            <DialogDescription>
              {editingMedia 
                ? 'Atualize as informações da mídia'
                : 'Adicione uma nova mídia à biblioteca do agente'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Nome */}
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={mediaForm.name}
                onChange={(e) => setMediaForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Áudio de boas vindas"
              />
            </div>

            {/* Tipo de Mídia */}
            <div className="space-y-2">
              <Label>Tipo de Mídia</Label>
              <Select
                value={mediaForm.mediaType}
                onValueChange={(value: "audio" | "image" | "video" | "document" | "flow") => {
                  setMediaForm(prev => ({ 
                    ...prev, 
                    mediaType: value,
                    flowItems: value === 'flow' ? (prev.flowItems || []) : prev.flowItems,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audio">🎵 Áudio</SelectItem>
                  <SelectItem value="image">🖼️ Imagem</SelectItem>
                  <SelectItem value="video">🎬 Vídeo</SelectItem>
                  <SelectItem value="document">📄 Documento</SelectItem>
                  <SelectItem value="flow">🔀 Fluxo (sequência de mídias + textos)</SelectItem>
                </SelectContent>
              </Select>
              {mediaForm.mediaType === 'flow' && (
                <p className="text-xs text-violet-600 font-medium">
                  🔀 Fluxo: monte uma sequência de múltiplos itens enviados em ordem exata.
                </p>
              )}
            </div>

            {/* ======= EDITOR DE FLUXO ======= */}
            {mediaForm.mediaType === 'flow' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Sequência do Fluxo ({mediaForm.flowItems?.length || 0} itens)</Label>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => addFlowItem('text')}>
                      <AlignLeft className="h-3 w-3 mr-1" />
                      + Texto
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => addFlowItem('media')}>
                      <ImageIcon className="h-3 w-3 mr-1" />
                      + Mídia
                    </Button>
                  </div>
                </div>

                {(!mediaForm.flowItems || mediaForm.flowItems.length === 0) && (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground">
                    <p className="text-sm font-medium">Fluxo vazio</p>
                    <p className="text-xs">Adicione itens de texto ou mídia acima.</p>
                    <p className="text-xs mt-1">Ex: imagem → texto → áudio</p>
                  </div>
                )}

                {(mediaForm.flowItems || []).map((item, idx) => (
                  <div key={item.id} className="border rounded-lg p-3 bg-muted/20 space-y-2">
                    {/* Header do item */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-mono">#{idx + 1}</Badge>
                        <Select
                          value={item.type}
                          onValueChange={(v) => updateFlowItem(idx, { ...item, type: v as 'media' | 'text', storageUrl: undefined, text: undefined })}
                        >
                          <SelectTrigger className="h-7 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">💬 Texto</SelectItem>
                            <SelectItem value="media">📎 Mídia</SelectItem>
                          </SelectContent>
                        </Select>
                        {item.type === 'media' && (
                          <Select
                            value={item.mediaType || 'image'}
                            onValueChange={(v) => updateFlowItem(idx, { ...item, mediaType: v as any })}
                          >
                            <SelectTrigger className="h-7 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="audio">🎵 Áudio</SelectItem>
                              <SelectItem value="image">🖼️ Imagem</SelectItem>
                              <SelectItem value="video">🎬 Vídeo</SelectItem>
                              <SelectItem value="document">📄 Documento</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} onClick={() => moveFlowItem(idx, 'up')}>
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === (mediaForm.flowItems?.length || 0) - 1} onClick={() => moveFlowItem(idx, 'down')}>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteFlowItem(idx)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {/* Conteúdo */}
                    {item.type === 'text' ? (
                      <Textarea
                        placeholder="Digite o texto desta etapa..."
                        value={item.text || ''}
                        onChange={(e) => updateFlowItem(idx, { ...item, text: e.target.value })}
                        rows={2}
                        className="text-xs"
                      />
                    ) : (
                      <div className="space-y-2">
                        <input
                          type="file"
                          className="hidden"
                          id={`flow-file-${item.id}`}
                          accept={item.mediaType === 'audio' ? 'audio/*' : item.mediaType === 'image' ? 'image/*' : item.mediaType === 'video' ? 'video/*' : '*/*'}
                          onChange={async (e) => {
                            if (e.target.files?.[0]) {
                              const uploadData = await uploadFlowItemFile(item.id, e.target.files[0]);
                              if (uploadData?.storageUrl) {
                                updateFlowItem(idx, {
                                  ...item,
                                  storageUrl: uploadData.storageUrl,
                                  fileName: uploadData.fileName || e.target.files[0].name,
                                  mimeType: uploadData.mimeType || e.target.files[0].type,
                                  transcription: uploadData.transcription || item.transcription || "",
                                });
                              }
                            }
                            e.target.value = '';
                          }}
                        />
                        <div
                          className={cn("border border-dashed rounded p-2 text-center cursor-pointer hover:border-primary/50 text-xs", uploadingFlowItemId === item.id && "opacity-60 pointer-events-none")}
                          onClick={() => document.getElementById(`flow-file-${item.id}`)?.click()}
                        >
                          {uploadingFlowItemId === item.id ? (
                            <span className="flex items-center justify-center gap-2 text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" /> Enviando...
                            </span>
                          ) : item.storageUrl ? (
                            <span className="text-green-600">✅ {item.fileName || 'Arquivo pronto'} (clique para trocar)</span>
                          ) : (
                            <span className="text-muted-foreground">📎 Clique para selecionar {item.mediaType || 'mídia'}</span>
                          )}
                        </div>
                        {item.mediaType === 'image' && item.storageUrl && (
                          <img src={item.storageUrl} alt="preview" className="h-16 rounded object-cover" />
                        )}
                        {item.mediaType !== 'audio' && (
                          <div className="space-y-1">
                            <Textarea
                              placeholder="Legenda (opcional). As quebras de linha serao preservadas no envio."
                              value={item.caption || ''}
                              onChange={(e) => updateFlowItem(idx, { ...item, caption: e.target.value })}
                              rows={10}
                              className="text-xs min-h-[220px] resize-y whitespace-pre-wrap"
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Use Enter para manter o formato exato da legenda no WhatsApp.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Upload de Arquivo */}
            {!editingMedia && mediaForm.mediaType !== 'flow' && (
              <div className="space-y-2">
                <Label>Upload de Arquivo</Label>
                <div 
                  className={cn(
                    "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                    dragActive ? "border-primary/70 bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragActive(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      setSelectedFile(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  {selectedFile ? (
                    <div className="flex flex-col items-center gap-2">
                      {mediaForm.mediaType === "audio" && <Music className="h-8 w-8 text-primary" />}
                      {mediaForm.mediaType === "image" && <ImageIcon className="h-8 w-8 text-primary" />}
                      {mediaForm.mediaType === "video" && <Video className="h-8 w-8 text-primary" />}
                      {mediaForm.mediaType === "document" && <FileText className="h-8 w-8 text-primary" />}
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      >
                        Trocar arquivo
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-medium">Clique ou arraste para selecionar</p>
                      <p className="text-xs text-muted-foreground">
                        {mediaForm.mediaType === "audio" && "Formatos: OGG, OPUS, MP3, M4A, WAV (max 16MB)"}
                        {mediaForm.mediaType === "image" && "Formatos: JPG, PNG, GIF, WEBP (max 5MB)"}
                        {mediaForm.mediaType === "video" && "Formatos: MP4, WEBM, MOV (max 64MB)"}
                        {mediaForm.mediaType === "document" && "Qualquer formato (max 100MB)"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Input de arquivo oculto - sempre presente para permitir trocar arquivo na edição */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={
                mediaForm.mediaType === "audio" ? "audio/*,.ogg,.opus,.mp3,.m4a,.wav" :
                mediaForm.mediaType === "image" ? "image/*,.jpg,.jpeg,.png,.gif,.webp" :
                mediaForm.mediaType === "video" ? "video/*,.mp4,.webm,.mov" :
                "*/*"
              }
              onChange={(e) => {
                setSelectedFile(e.target.files?.[0] || null);
                // Limpa o valor do input para permitir selecionar o mesmo arquivo novamente
                e.target.value = "";
              }}
            />

            {/* Preview de Áudio */}
            {mediaForm.mediaType === "audio" && editingMedia?.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="p-3 border rounded-lg bg-muted/30">
                  <audio controls className="w-full mb-2" src={editingMedia.storageUrl}>
                    Seu navegador não suporta áudio.
                  </audio>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Trocar Áudio
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('[DEBUG] Remover Áudio clicked in agent-studio-unified!');
                        // Limpa a mídia do editingMedia diretamente
                        if (editingMedia) {
                          setEditingMedia({ ...editingMedia, storageUrl: "", fileName: "" });
                        }
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "", transcription: "" }));
                        setSelectedFile(null);
                        toast({
                          title: "Removido!",
                          description: "Mídia removida.",
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview de Imagem */}
            {mediaForm.mediaType === "image" && editingMedia?.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="border rounded-lg overflow-hidden">
                  <img 
                    src={editingMedia.storageUrl} 
                    alt="Preview"
                    className="w-full max-h-48 object-contain"
                  />
                  <div className="flex gap-2 p-2 bg-muted/30 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Trocar Imagem
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('[DEBUG] Remover Imagem clicked in agent-studio-unified!');
                        if (editingMedia) {
                          setEditingMedia({ ...editingMedia, storageUrl: "", fileName: "" });
                        }
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                        toast({
                          title: "Removido!",
                          description: "Mídia removida.",
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview de Vídeo */}
            {mediaForm.mediaType === "video" && editingMedia?.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="border rounded-lg overflow-hidden">
                  <video 
                    controls 
                    className="w-full max-h-48 object-contain"
                    src={editingMedia.storageUrl}
                  />
                  <div className="flex gap-2 p-2 bg-muted/30 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Trocar Vídeo
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('[DEBUG] Remover Vídeo clicked in agent-studio-unified!');
                        if (editingMedia) {
                          setEditingMedia({ ...editingMedia, storageUrl: "", fileName: "" });
                        }
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                        toast({
                          title: "Removido!",
                          description: "Mídia removida.",
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview de Documento */}
            {mediaForm.mediaType === "document" && editingMedia?.storageUrl && (
              <div className="space-y-2">
                <Label>Arquivo</Label>
                <div className="p-3 border rounded-lg bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm truncate max-w-[200px]">{editingMedia.fileName || "Documento"}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Trocar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('[DEBUG] Remover Documento clicked in agent-studio-unified!');
                        if (editingMedia) {
                          setEditingMedia({ ...editingMedia, storageUrl: "", fileName: "" });
                        }
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                        toast({
                          title: "Removido!",
                          description: "Mídia removida.",
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Transcrição (apenas para áudio) */}
            {mediaForm.mediaType === "audio" && (
              <div className="space-y-2">
                <Label>Transcrição (opcional)</Label>
                <Textarea
                  placeholder="Transcrição do áudio..."
                  value={mediaForm.transcription}
                  onChange={(e) => setMediaForm(prev => ({ ...prev, transcription: e.target.value }))}
                  rows={3}
                />
              </div>
            )}

            {/* Descrição para a IA */}
            <div className="space-y-2">
              <Label>Descrição para a IA *</Label>
              <Textarea
                value={mediaForm.description}
                onChange={(e) => setMediaForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Ex: Áudio explicando os preços dos produtos principais"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Esta descrição ajuda o agente a entender quando enviar esta mídia.
              </p>
            </div>

            {/* Quando usar */}
            <div className="space-y-2">
              <Label>Quando usar (opcional)</Label>
              <Textarea
                value={mediaForm.whenToUse}
                onChange={(e) => setMediaForm(prev => ({ ...prev, whenToUse: e.target.value }))}
                placeholder="Ex: Quando o cliente perguntar sobre preços ou valores"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Instrução adicional para o agente saber quando enviar esta mídia.
              </p>
            </div>

            {/* Legenda (apenas para imagem/vídeo) */}
            {(mediaForm.mediaType === "image" || mediaForm.mediaType === "video") && (
              <div className="space-y-2">
                <Label>Legenda da Mídia (opcional)</Label>
                <Textarea
                  value={mediaForm.caption}
                  onChange={(e) => setMediaForm(prev => ({ ...prev, caption: e.target.value }))}
                  placeholder="Ex: 📍 Nossa localização! Estamos na Av. Principal, 123"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Esta legenda será enviada junto com a imagem/vídeo no WhatsApp.
                </p>
              </div>
            )}

            {/* Mídia ativa */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Mídia ativa</Label>
                <p className="text-xs text-muted-foreground">
                  Mídias inativas não entram nas instruções do agente.
                </p>
              </div>
              <Switch
                checked={mediaForm.isActive}
                onCheckedChange={(v) => setMediaForm(prev => ({ ...prev, isActive: v }))}
              />
            </div>

            {/* Enviar sozinha */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Enviar sozinha</Label>
                <p className="text-xs text-muted-foreground">
                  Se ativado, esta mídia NÃO será enviada junto com outras.
                </p>
              </div>
              <Switch
                checked={mediaForm.sendAlone}
                onCheckedChange={(v) => setMediaForm(prev => ({ ...prev, sendAlone: v }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Sem texto extra fora da mídia</Label>
                <p className="text-xs text-muted-foreground">
                  Se ativado, a IA não envia texto principal fora desta mídia ou fluxo.
                </p>
              </div>
              <Switch
                checked={mediaForm.suppressTextResponse}
                onCheckedChange={(v) => setMediaForm(prev => ({ ...prev, suppressTextResponse: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeMediaDialog}>
              Cancelar
            </Button>
            <Button 
              onClick={handleMediaSubmit}
              disabled={uploadMediaMutation.isPending || updateMediaMutation.isPending || createFlowMediaMutation.isPending || !!uploadingFlowItemId}
            >
              {(uploadMediaMutation.isPending || updateMediaMutation.isPending || createFlowMediaMutation.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {editingMedia ? 'Atualizar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubscriptionUpgradeDialog
        open={Boolean(myAgentUpgradeDialog.actionLabel || myAgentUpgradeDialog.override)}
        onClose={closeMyAgentUpgradeDialog}
        moduleConfig={MY_AGENT_ACTION_GATE_MODULE}
        planName="Plus"
        actionLabel={myAgentUpgradeDialog.actionLabel}
        override={myAgentUpgradeDialog.override}
      />
      
      {/* 🔒 Modal de Upgrade (estilo Lovable) */}
      <UpgradeModal
        isOpen={upgradeModal.isOpen}
        onClose={() => setUpgradeModal(prev => ({ ...prev, isOpen: false }))}
        title={upgradeModal.title}
        description={upgradeModal.description}
        used={upgradeModal.used}
        limit={upgradeModal.limit}
        type={upgradeModal.type}
      />
    </div>
  );
}
