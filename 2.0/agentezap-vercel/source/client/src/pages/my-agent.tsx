// Force HMR rebuild v2
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Bot, Sparkles, TestTube, Save, AlertCircle, CheckCircle2,
  Plus, X, Zap, Settings2, Image as ImageIcon, Music, Video,
  FileText, Upload, Trash2, Edit2, Loader2, RefreshCw, Check,
  Clock, MessageSquare, Filter, Info, ArrowRight, History, Maximize2, Wand2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";
import { formatWhatsAppTextForHtml } from "@/lib/whatsapp-format";
import type { AiAgentConfig } from "@shared/schema";
import { PromptGenerator } from "@/components/prompt-generator";
import { ExpandedEditor, ExpandButton } from "@/components/expanded-editor";
import { PromptImprover } from "@/components/prompt-improver";
import { AgentStudioUnified } from "@/components/agent-studio-unified";
import { WebsiteImporter } from "@/components/website-importer";
import { repairMojibakeText } from "@shared/mojibake";

function normalizePromptText(value?: string | null): string {
  return repairMojibakeText(value || "");
}

const AUTH_AGENT_SIMULATOR_CHAT_STORAGE_PREFIX = "agentezap:auth-agent-simulator-chat:v1:";
const AUTH_AGENT_SIMULATOR_CHAT_MAX_STORED_MESSAGES = 180;

type StoredAuthAgentSimulatorChat = {
  version: 1;
  sessionId: string;
  chatHistory: Array<{
    role: "user" | "agent";
    message: string;
    time: string;
    mediaUrl?: string;
    mediaType?: "image" | "video" | "audio" | "document";
  }>;
  sentMedias: string[];
};

function createAuthAgentSimulatorSessionId() {
  return `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildAuthAgentSimulatorChatStorageKey(userId?: string | null) {
  const ownerId = String(userId || "current").trim() || "current";
  return `${AUTH_AGENT_SIMULATOR_CHAT_STORAGE_PREFIX}${ownerId}`;
}

function readAuthAgentSimulatorChatStorage(storageKey: string): StoredAuthAgentSimulatorChat | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuthAgentSimulatorChat;
    if (!parsed || typeof parsed.sessionId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeAuthAgentSimulatorChatStorage(storageKey: string, value: StoredAuthAgentSimulatorChat) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private/locked-down browsers. The simulator still works.
  }
}

function removeAuthAgentSimulatorChatStorage(storageKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Best effort cleanup.
  }
}

// ============== TIPOS ==============
interface AgentMedia {
  id: string;
  userId: string;
  name: string;
  mediaType: "audio" | "image" | "video" | "document" | "flow";
  storageUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationSeconds?: number;
  description: string;
  whenToUse?: string;
  caption?: string;
  transcription?: string;
  isActive: boolean;
  sendAlone: boolean;
  suppressTextResponse: boolean;
  displayOrder: number;
  flowItems?: Array<{
    id: string;
    order: number;
    type: "text" | "media";
    text?: string;
    storageUrl?: string;
    mediaType?: "audio" | "image" | "video" | "document";
    caption?: string;
    fileName?: string | null;
    mimeType?: string | null;
  }> | null;
  createdAt: string;
}

type GreetingExtraFlowItem =
  | {
      id: string;
      type: "text";
      text: string;
    }
  | {
      id: string;
      type: "image";
      storageUrl: string;
      caption: string;
      fileName?: string;
      mimeType?: string;
    };

interface MediaFormData {
  name: string;
  mediaType: "audio" | "image" | "video" | "document";
  storageUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  description: string;
  whenToUse?: string;
  caption?: string;
  transcription?: string;
  isActive: boolean;
  sendAlone: boolean;
  suppressTextResponse: boolean;
}

const initialMediaForm: MediaFormData = {
  name: "",
  mediaType: "audio",
  storageUrl: "",
  fileName: "",
  description: "",
  whenToUse: "",
  caption: "",
  transcription: "",
  isActive: true,
  sendAlone: false,
  suppressTextResponse: false,
};

const mediaTypeIcons = {
  audio: Music,
  image: ImageIcon,
  video: Video,
  document: FileText,
  flow: ArrowRight,
};

const GREETING_EXTRA_FLOW_NAME = "SAUDACAO_INFO_EXTRA";

function createGreetingExtraItemId() {
  return `greeting-extra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============== HELPER: FORMATAÇÃO WHATSAPP ==============
function formatWhatsAppText(text: string): string {
  if (!text) return text;
  
  let formatted = text;
  
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

// ============== COMPONENTE PRINCIPAL ==============
export default function MyAgent() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("prompt");
  const requestedTab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
  const requestedFlowEditorTab = requestedTab === "flow" || requestedTab === "flow2";
  
  // Estado do formulário principal
  const [prompt, setPrompt] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [triggerPhrases, setTriggerPhrases] = useState<string[]>([]);
  const [newTriggerPhrase, setNewTriggerPhrase] = useState("");
  const [messageSplitChars, setMessageSplitChars] = useState(400);
  const [responseDelaySeconds, setResponseDelaySeconds] = useState(30);
  const [fetchHistoryOnFirstResponse, setFetchHistoryOnFirstResponse] = useState(false);
  const [pauseOnManualReply, setPauseOnManualReply] = useState(true);
  const [autoReactivateMinutes, setAutoReactivateMinutes] = useState<number | null>(null);
  
  // Estado da saudação personalizada e endereço
  const [customGreeting, setCustomGreeting] = useState<string>("");
  const [customAddress, setCustomAddress] = useState<string>("");
  const [greetingVariation, setGreetingVariation] = useState(false);
  const [greetingEnabled, setGreetingEnabled] = useState(false);
  const [addressEnabled, setAddressEnabled] = useState(false);
  const [greetingExtraFlowItems, setGreetingExtraFlowItems] = useState<GreetingExtraFlowItem[]>([]);
  const [greetingExtraFlowDirty, setGreetingExtraFlowDirty] = useState(false);
  const [uploadingGreetingImageId, setUploadingGreetingImageId] = useState<string | null>(null);
  
  // Estado do teste - Playground com histórico de mensagens
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  
  // 🆕 Tipo de mensagem com suporte a mídia
  type ChatMessage = {
    role: 'user' | 'agent';
    message: string;
    time: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document';
  };
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [sentMedias, setSentMedias] = useState<string[]>([]); // 🆕 Mídias já enviadas
  const [simulatorChatHydrated, setSimulatorChatHydrated] = useState(false);
  const simulatorSessionIdRef = useRef(createAuthAgentSimulatorSessionId());
  
  // Estado do gerador de prompt e editor expandido
  const [showPromptGenerator, setShowPromptGenerator] = useState(false);
  const [showAgentStudio, setShowAgentStudio] = useState(false);
  const [isNewAgent, setIsNewAgent] = useState(false);
  const [isExpandedEditorOpen, setIsExpandedEditorOpen] = useState(false);
  const [isPromptImproverOpen, setIsPromptImproverOpen] = useState(false);
  
  // Estado da biblioteca de mídias
  const [mediaList, setMediaList] = useState<AgentMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<AgentMedia | null>(null);
  const [mediaForm, setMediaForm] = useState<MediaFormData>(initialMediaForm);
  const [savingMedia, setSavingMedia] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const greetingExtraFlowMedia = mediaList.find((media) => media.name === GREETING_EXTRA_FLOW_NAME && media.mediaType === "flow");
  const visibleMediaList = mediaList.filter((media) => media.name !== GREETING_EXTRA_FLOW_NAME);

  // Query de configuração
  const { data: config, isLoading } = useQuery<AiAgentConfig | null>({
    queryKey: ["/api/agent/config"],
    staleTime: 30000,
  });

  const simulatorChatStorageKey = useMemo(
    () => config?.userId ? buildAuthAgentSimulatorChatStorageKey(config.userId) : null,
    [config?.userId],
  );

  useEffect(() => {
    if (!simulatorChatStorageKey) return;
    setSimulatorChatHydrated(false);
    const stored = readAuthAgentSimulatorChatStorage(simulatorChatStorageKey);
    simulatorSessionIdRef.current = stored?.sessionId || createAuthAgentSimulatorSessionId();
    setChatHistory(
      Array.isArray(stored?.chatHistory)
        ? stored.chatHistory
            .filter((message) => message && typeof message.message === "string")
            .slice(-AUTH_AGENT_SIMULATOR_CHAT_MAX_STORED_MESSAGES)
        : [],
    );
    setSentMedias(Array.isArray(stored?.sentMedias) ? stored.sentMedias.filter(Boolean) : []);
    setSimulatorChatHydrated(true);
  }, [simulatorChatStorageKey]);

  useEffect(() => {
    if (!simulatorChatStorageKey || !simulatorChatHydrated) return;
    writeAuthAgentSimulatorChatStorage(simulatorChatStorageKey, {
      version: 1,
      sessionId: simulatorSessionIdRef.current,
      chatHistory: chatHistory.slice(-AUTH_AGENT_SIMULATOR_CHAT_MAX_STORED_MESSAGES),
      sentMedias: sentMedias.filter(Boolean),
    });
  }, [chatHistory, sentMedias, simulatorChatHydrated, simulatorChatStorageKey]);

  // Carregar configuração
  useEffect(() => {
    if (config) {
      const normalizedPrompt = normalizePromptText(config.prompt);
      setPrompt(normalizedPrompt);
      setIsActive(config.isActive || false);
      setTriggerPhrases(config.triggerPhrases || []);
      setMessageSplitChars(config.messageSplitChars ?? 400);
      setResponseDelaySeconds(config.responseDelaySeconds ?? 30);
      setFetchHistoryOnFirstResponse(config.fetchHistoryOnFirstResponse ?? false);
      setPauseOnManualReply((config as any).pauseOnManualReply ?? true);
      setAutoReactivateMinutes((config as any).autoReactivateMinutes ?? null);
      setCustomGreeting((config as any).customGreeting ?? "");
      setCustomAddress((config as any).customAddress ?? "");
      setGreetingVariation((config as any).greetingVariation ?? false);
      setGreetingEnabled((config as any).greetingEnabled ?? false);
      setAddressEnabled((config as any).addressEnabled ?? false);
      
      // Se não tem prompt configurado, mostra o gerador
      if (!normalizedPrompt.trim() || normalizedPrompt.length < 50) {
        setShowPromptGenerator(true);
      }
    } else if (config === null) {
      // Config carregou mas está vazia - mostrar gerador
      setShowPromptGenerator(true);
    }
  }, [config]);

  // Carregar mídias
  const fetchMediaList = useCallback(async () => {
    try {
      setLoadingMedia(true);
      const token = await getAuthToken();
      const response = await fetch("/api/agent/media", {
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });
      
      if (response.ok) {
        const data = await response.json();
        setMediaList(data);
      }
    } catch (error) {
      console.error("Error fetching media:", error);
    } finally {
      setLoadingMedia(false);
    }
  }, []);

  useEffect(() => {
    fetchMediaList();
  }, [fetchMediaList]);

  useEffect(() => {
    if (greetingExtraFlowDirty) return;

    const loadedItems = (greetingExtraFlowMedia?.flowItems || [])
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .flatMap((item) => {
        if (item.type === "text") {
          const text = String(item.text || "").trim();
          if (!text) return [];
          return [{
            id: item.id || createGreetingExtraItemId(),
            type: "text" as const,
            text,
          }];
        }

        if (item.type === "media" && item.mediaType === "image" && item.storageUrl) {
          return [{
            id: item.id || createGreetingExtraItemId(),
            type: "image" as const,
            storageUrl: item.storageUrl,
            caption: item.caption || "",
            fileName: item.fileName || undefined,
            mimeType: item.mimeType || undefined,
          }];
        }

        return [];
      });

    setGreetingExtraFlowItems(loadedItems);
  }, [greetingExtraFlowDirty, greetingExtraFlowMedia]);

  // 🔄 HELPER: Retry com backoff exponencial para chamadas de API
  const retryWithBackoff = async <T,>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries - 1) {
          const delay = initialDelay * Math.pow(2, attempt);
          console.log(`🔄 [RETRY] Tentativa ${attempt + 1}/${maxRetries} falhou. Aguardando ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  };

  const addGreetingExtraTextItem = () => {
    setGreetingExtraFlowItems((current) => [
      ...current,
      {
        id: createGreetingExtraItemId(),
        type: "text",
        text: "",
      },
    ]);
    setGreetingExtraFlowDirty(true);
  };

  const addGreetingExtraImageItem = () => {
    setGreetingExtraFlowItems((current) => [
      ...current,
      {
        id: createGreetingExtraItemId(),
        type: "image",
        storageUrl: "",
        caption: "",
      },
    ]);
    setGreetingExtraFlowDirty(true);
  };

  const updateGreetingExtraItem = (
    itemId: string,
    updater: (item: GreetingExtraFlowItem) => GreetingExtraFlowItem
  ) => {
    setGreetingExtraFlowItems((current) =>
      current.map((item) => (item.id === itemId ? updater(item) : item))
    );
    setGreetingExtraFlowDirty(true);
  };

  const removeGreetingExtraItem = (itemId: string) => {
    setGreetingExtraFlowItems((current) => current.filter((item) => item.id !== itemId));
    setGreetingExtraFlowDirty(true);
  };

  const removeGreetingExtraImage = (itemId: string) => {
    updateGreetingExtraItem(itemId, (item) => (
      item.type !== "image"
        ? item
        : {
            ...item,
            storageUrl: "",
            fileName: "",
            mimeType: "",
          }
    ));
  };

  const handleGreetingExtraImageUpload = async (itemId: string, file?: File | null) => {
    if (!file) return;

    setUploadingGreetingImageId(itemId);

    try {
      const token = await getAuthToken();
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/agent/media/upload", {
        method: "POST",
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
        body: formData,
      });

      const data = await response.json();
      if (!response.ok || !data?.storageUrl) {
        throw new Error(data?.message || "Falha ao enviar imagem");
      }

      updateGreetingExtraItem(itemId, (item) => (
        item.type !== "image"
          ? item
          : {
              ...item,
              storageUrl: data.storageUrl,
              fileName: data.fileName || file.name,
              mimeType: data.mimeType || file.type || "image/*",
              caption: item.caption || file.name.replace(/\.[^.]+$/, ""),
            }
      ));

      toast({ title: "Imagem adicionada", description: "A imagem foi vinculada ao fluxo da saudação." });
    } catch (error: any) {
      toast({
        title: "Erro ao enviar imagem",
        description: error?.message || "Falha no upload da imagem",
        variant: "destructive",
      });
    } finally {
      setUploadingGreetingImageId(null);
    }
  };

  const syncGreetingExtraFlow = async () => {
    const normalizedItems = greetingExtraFlowItems
      .map((item, index) => {
        if (item.type === "text") {
          const text = item.text.trim();
          if (!text) return null;
          return {
            id: item.id,
            order: index,
            type: "text" as const,
            text,
          };
        }

        if (!item.storageUrl.trim()) {
          return null;
        }

        return {
          id: item.id,
          order: index,
          type: "media" as const,
          storageUrl: item.storageUrl,
          mediaType: "image" as const,
          caption: item.caption.trim() || undefined,
          fileName: item.fileName || undefined,
          mimeType: item.mimeType || "image/*",
        };
      })
      .filter(Boolean);

    const token = await getAuthToken();

    if (normalizedItems.length === 0) {
      if (!greetingExtraFlowMedia?.id) return;

      const deleteResponse = await fetch(`/api/agent/media/${greetingExtraFlowMedia.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });

      if (!deleteResponse.ok) {
        throw new Error("Falha ao remover o fluxo extra da saudação");
      }

      return;
    }

    const payload = {
      name: GREETING_EXTRA_FLOW_NAME,
      mediaType: "flow",
      storageUrl: "",
      description: "Fluxo complementar da saudação inicial",
      whenToUse: "Gerenciado automaticamente pela aba Info para executar após a primeira saudação",
      caption: "Fluxo complementar da saudação inicial",
      isActive: true,
      sendAlone: false,
      flowItems: normalizedItems,
    };

    const url = greetingExtraFlowMedia?.id
      ? `/api/agent/media/${greetingExtraFlowMedia.id}`
      : "/api/agent/media";
    const method = greetingExtraFlowMedia?.id ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Falha ao salvar o fluxo extra da saudação");
    }
  };

  // Mutations
  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      // 🔄 RETRY AUTOMÁTICO: até 3 tentativas com backoff exponencial
      return await retryWithBackoff(async () => {
        const response = await apiRequest("POST", "/api/agent/config", {
          prompt: normalizePromptText(prompt),
          isActive,
          triggerPhrases,
          messageSplitChars,
          responseDelaySeconds,
          fetchHistoryOnFirstResponse,
          pauseOnManualReply,
          autoReactivateMinutes,
          customGreeting: customGreeting.trim() || null,
          customAddress: customAddress.trim() || null,
          greetingVariation,
          greetingEnabled,
          addressEnabled,
        });
        await syncGreetingExtraFlow();
        return response;
      }, 3, 1000);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/config"] });
      await fetchMediaList();
      setGreetingExtraFlowDirty(false);
      toast({
        title: "✅ Configuração Salva",
        description: "Seu agente IA foi atualizado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: `${error.message}. Tente novamente em alguns segundos.`,
        variant: "destructive",
      });
    },
  });

  const testAgentMutation = useMutation({
    mutationFn: async (userMsg: string) => {
      // 🆕 CONVERTER HISTÓRICO PARA FORMATO DO BACKEND
      const historyForBackend = chatHistory.map(msg => ({
        role: msg.role === "agent" ? "assistant" : "user" as "user" | "assistant",
        content: msg.message
      }));
      
      // 🔄 RETRY AUTOMÁTICO: até 5 tentativas com backoff exponencial (Mistral pode dar rate limit)
      const response = await retryWithBackoff(async () => {
        return await apiRequest("POST", "/api/agent/test", {
          message: userMsg,
          // 🆕 ENVIAR HISTÓRICO E MÍDIAS PARA SIMULADOR UNIFICADO
          history: historyForBackend,
          sentMedias: sentMedias,
          sessionId: simulatorSessionIdRef.current,
        });
      }, 5, 2000);
      const data = await response.json();
      return data;
    },
    onMutate: (userMsg: string) => {
      // Adiciona mensagem do usuário ao histórico imediatamente
      const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setChatHistory(prev => [...prev, { role: 'user', message: userMsg, time }]);
      setTestMessage(""); // Limpa o input
    },
    onSuccess: (data: any) => {
      const agentResponse = typeof data?.response === "string" ? data.response : "";
      setTestResponse(agentResponse);
      const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      
      const newMessages: ChatMessage[] = [];
      const wouldSendAudio = Boolean(data?.wouldSendAudio);
      const wouldSendText = data?.wouldSendText !== false;

      if (wouldSendAudio && !wouldSendText) {
        newMessages.push({
          role: 'agent',
          message: '[Simulador] No WhatsApp real esta resposta sera enviada somente por audio. O texto abaixo aparece aqui apenas como transcricao para teste.',
          time,
        });
      }

      // 🔄 USAR splitResponses PARA CONSISTÊNCIA COM WHATSAPP
      // Se o backend retornou mensagens divididas, adiciona cada uma como uma bolha separada
      // Isso garante que o simulador mostre EXATAMENTE como será no WhatsApp
      const splitResponses = data?.splitResponses || [];
      
      if (splitResponses.length > 0) {
        // Usa as mensagens divididas pelo backend (mesma lógica do WhatsApp)
        for (const splitMsg of splitResponses) {
          if (splitMsg && splitMsg.trim()) {
            newMessages.push({ role: 'agent', message: splitMsg, time });
          }
        }
        console.log(`📱 [SIMULADOR] Exibindo ${splitResponses.length} bolhas de mensagem`);
      } else if (agentResponse && agentResponse.trim()) {
        // Fallback: usa resposta completa se splitResponses não existir
        newMessages.push({ role: 'agent', message: agentResponse, time });
      }

      // 🆕 ADICIONAR AÇÕES DO FLUXO EXTRA NA MESMA ORDEM DO WHATSAPP
      if (data?.mediaActions && data.mediaActions.length > 0) {
        console.log(`📁 Frontend recebeu ${data.mediaActions.length} ação(ões) de mídia`, data.mediaActions);

        for (const action of data.mediaActions) {
          if (action.type === 'send_text' && action.text) {
            newMessages.push({
              role: 'agent',
              message: action.text,
              time,
            });
          }

          if ((action.type === 'send_media' || action.type === 'send_media_url') && action.media_url) {
            newMessages.push({
              role: 'agent',
              message: action.caption || '',
              time,
              mediaUrl: action.media_url,
              mediaType: action.media_type || 'image'
            });
          }
        }

        // Rastrear mídias enviadas
        const newMediaNames = data.mediaActions
          .filter((a: any) => (a.type === 'send_media' || a.type === 'send_media_url') && a.media_name)
          .map((a: any) => a.media_name.toUpperCase());
        setSentMedias(prev => [...new Set([...prev, ...newMediaNames])]);
      }
      
      setChatHistory(prev => [...prev, ...newMessages]);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao testar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ============== FUNÇÕES DE MÍDIA ==============
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setMediaForm(prev => ({
        ...prev,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        storageUrl: "",
      }));
    }
    // Limpa o valor do input para permitir selecionar o mesmo arquivo novamente
    e.target.value = "";
  };

  // Função dedicada para remover mídia do preview
  const handleRemoveMediaPreview = useCallback((includeTranscription: boolean = false) => {
    console.log('[DEBUG] handleRemoveMediaPreview called', { includeTranscription });
    setMediaForm(prev => ({
      ...prev,
      storageUrl: "",
      fileName: "",
      ...(includeTranscription ? { transcription: "" } : {}),
    }));
    setSelectedFile(null);
  }, []);

  const uploadSelectedFile = async () => {
    if (!selectedFile) return null;
    setUploadingFile(true);
    try {
      const token = await getAuthToken();
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/agent/media/upload", {
        method: "POST",
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      
      if (data.transcription && !mediaForm.transcription) {
        setMediaForm(prev => ({ ...prev, transcription: data.transcription }));
      }
      
      setSelectedFile(null);
      return data;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleNewMedia = () => {
    setEditingMedia(null);
    setMediaForm({ ...initialMediaForm });
    setSelectedFile(null);
    setIsMediaDialogOpen(true);
  };

  const handleEditMedia = (media: AgentMedia) => {
    setEditingMedia(media);
    setMediaForm({
      name: media.name,
      mediaType: media.mediaType,
      storageUrl: media.storageUrl,
      fileName: media.fileName || "",
      fileSize: media.fileSize,
      mimeType: media.mimeType || "",
      description: media.description,
      whenToUse: media.whenToUse || "",
      caption: media.caption || "",
      transcription: media.transcription || "",
      isActive: media.isActive,
      sendAlone: media.sendAlone || false,
      suppressTextResponse: media.suppressTextResponse || false,
    });
    setSelectedFile(null);
    setIsMediaDialogOpen(true);
  };

  const handleSaveMedia = async () => {
    try {
      setSavingMedia(true);
      
      if (!mediaForm.name.trim() || !mediaForm.description.trim()) {
        toast({ title: "Erro", description: "Nome e descrição são obrigatórios", variant: "destructive" });
        return;
      }

      if (!mediaForm.storageUrl.trim() && !selectedFile) {
        toast({ title: "Erro", description: "Selecione um arquivo", variant: "destructive" });
        return;
      }

      let uploadData = null;
      if (selectedFile) {
        uploadData = await uploadSelectedFile();
        if (!uploadData) throw new Error("Upload failed");
      }

      const dataToSave = {
        ...mediaForm,
        storageUrl: uploadData?.storageUrl || mediaForm.storageUrl,
        fileName: uploadData?.fileName || mediaForm.fileName,
        fileSize: uploadData?.fileSize ?? mediaForm.fileSize,
        mimeType: uploadData?.mimeType || mediaForm.mimeType,
        mediaType: uploadData?.mediaType || mediaForm.mediaType,
        name: mediaForm.name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, ''),
      };

      // Remove campos vazios para evitar problemas de validação
      const cleanedData = Object.fromEntries(
        Object.entries(dataToSave).filter(([_, v]) => v !== undefined && v !== null && v !== "")
      );

      const url = editingMedia ? `/api/agent/media/${editingMedia.id}` : "/api/agent/media";
      const method = editingMedia ? "PUT" : "POST";
      const token = await getAuthToken();

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(cleanedData),
      });

      if (response.ok) {
        toast({ title: "Sucesso", description: editingMedia ? "Mídia atualizada!" : "Mídia adicionada!" });
        setIsMediaDialogOpen(false);
        fetchMediaList();
      } else {
        throw new Error("Failed to save");
      }
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setSavingMedia(false);
    }
  };

  const handleDeleteMedia = async (media: AgentMedia) => {
    if (!confirm(`Excluir "${media.name}"?`)) return;
    
    try {
      const token = await getAuthToken();
      await fetch(`/api/agent/media/${media.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });
      toast({ title: "Sucesso", description: "Mídia excluída!" });
      fetchMediaList();
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao excluir", variant: "destructive" });
    }
  };

  const handleTranscribe = async () => {
    if (!mediaForm.storageUrl || mediaForm.mediaType !== "audio") return;
    
    try {
      setTranscribing(true);
      const token = await getAuthToken();
      const response = await fetch("/api/agent/media/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          audioUrl: mediaForm.storageUrl,
          mimeType: mediaForm.mimeType || "audio/ogg",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMediaForm(prev => ({
          ...prev,
          transcription: data.transcription,
          description: prev.description || data.transcription.substring(0, 200),
        }));
        toast({ title: "Sucesso", description: "Áudio transcrito!" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Falha na transcrição", variant: "destructive" });
    } finally {
      setTranscribing(false);
    }
  };

  // Calcular progresso de configuração
  const configProgress = [
    prompt.length > 50,
    isActive,
    visibleMediaList.length > 0,
  ].filter(Boolean).length;
  const progressPercent = (configProgress / 3) * 100;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Handler quando o prompt é gerado pelo assistente
  const handlePromptGenerated = (generatedPrompt: string) => {
    const normalizedPrompt = normalizePromptText(generatedPrompt);
    setPrompt(normalizedPrompt);
    setIsActive(true); // Auto-ativa o agente
    setShowPromptGenerator(false);
    setIsNewAgent(true);
    setShowAgentStudio(true); // Mostra o AgentStudio para testar/editar
    
    // Salvar automaticamente com agente ativo
    apiRequest("POST", "/api/agent/config", {
      prompt: normalizedPrompt,
      isActive: true,
      triggerPhrases,
      messageSplitChars,
      responseDelaySeconds,
      fetchHistoryOnFirstResponse,
      pauseOnManualReply,
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/config"] });
      toast({
        title: "✅ Agente Criado!",
        description: "Teste no simulador e ajuste como quiser.",
      });
    });
  };
  
  // Handler para salvar do AgentStudio
  const handleAgentStudioSave = (newPrompt: string) => {
    const normalizedPrompt = normalizePromptText(newPrompt);
    setPrompt(normalizedPrompt);
    apiRequest("POST", "/api/agent/config", {
      prompt: normalizedPrompt,
      isActive: true,
      triggerPhrases,
      messageSplitChars,
      responseDelaySeconds,
      fetchHistoryOnFirstResponse,
      pauseOnManualReply,
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/config"] });
    });
  };

  // Mostrar o gerador de prompt se necessário (usuário novo sem prompt)
  const shouldShowPromptGenerator =
    showPromptGenerator && !prompt.trim() && !requestedFlowEditorTab;

  if (shouldShowPromptGenerator) {
    return (
      <div className="h-full overflow-auto bg-gradient-to-b from-background to-muted/20">
        <div className="container max-w-2xl mx-auto p-4 md:p-8">
          <PromptGenerator 
            onPromptGenerated={handlePromptGenerated}
            onSkip={() => setShowPromptGenerator(false)}
          />
        </div>
      </div>
    );
  }

  // SEMPRE ir direto para o Studio quando tem prompt configurado
  // Sem telas intermediárias - experiência unificada
  return <AgentStudioUnified />;

  return (
    <div
      data-subscription-gate-ignore="true"
      className="h-full overflow-auto bg-gradient-to-b from-background to-muted/20"
    >
      {/* Editor Expandido (Canvas/Lousa) */}
      <ExpandedEditor
        isOpen={isExpandedEditorOpen}
        onClose={() => setIsExpandedEditorOpen(false)}
        value={prompt}
        onChange={(value) => setPrompt(normalizePromptText(value))}
        onSave={() => saveConfigMutation.mutate()}
        isSaving={saveConfigMutation.isPending}
        title="Instruções do Agente"
        placeholder="Digite as instruções de atendimento do seu agente..."
        onImproveClick={() => {
          setIsExpandedEditorOpen(false);
          setIsPromptImproverOpen(true);
        }}
      />
      
      {/* Melhorador de Prompt com técnica de patch */}
      <PromptImprover
        currentPrompt={prompt}
        onImproved={(newPrompt) => setPrompt(normalizePromptText(newPrompt))}
        isOpen={isPromptImproverOpen}
        onClose={() => setIsPromptImproverOpen(false)}
      />
      
      <div className="container max-w-5xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
        
        {/* ============== HEADER COM PROGRESSO ============== */}
        <div className="space-y-3 md:space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg flex-shrink-0">
                <Bot className="w-5 h-5 md:w-7 md:h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-3xl font-bold">
                  Meu Agente IA
                </h1>
                <p className="text-xs md:text-base text-muted-foreground">
                  Configure seu assistente inteligente
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Badge
                variant={isActive ? "default" : "secondary"}
                className={`gap-1.5 px-2.5 md:px-4 py-1 md:py-2 text-xs md:text-sm ${isActive ? 'bg-green-500 hover:bg-green-600' : ''}`}
              >
                {isActive ? (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Ativo</>
                ) : (
                  <><AlertCircle className="w-3.5 h-3.5" /> Inativo</>
                )}
              </Badge>
              <Switch
                checked={isActive}
                onCheckedChange={(checked) => {
                  setIsActive(checked);
                  // Salvar automaticamente ao alternar
                  apiRequest("POST", "/api/agent/config", {
                    prompt,
                    isActive: checked,
                    triggerPhrases,
                    messageSplitChars,
                    responseDelaySeconds,
                    fetchHistoryOnFirstResponse,
                    pauseOnManualReply,
                  }).then(() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/agent/config"] });
                    toast({
                      title: checked ? "✅ Agente Ativado" : "⏸️ Agente Pausado",
                      description: checked ? "Seu agente está atendendo" : "O agente foi desativado",
                    });
                  });
                }}
                className="scale-100 md:scale-125"
              />
            </div>
          </div>

        </div>

        {/* ============== TABS PRINCIPAIS ============== */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 md:space-y-6">
          <TabsList className="w-full grid grid-cols-5 h-10 md:h-14 p-1">
            <TabsTrigger value="prompt" className="gap-1 md:gap-2 text-[10px] md:text-sm px-1 md:px-3">
              <MessageSquare className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden xs:inline">Instruções</span>
            </TabsTrigger>
            <TabsTrigger value="info" className="gap-1 md:gap-2 text-[10px] md:text-sm px-1 md:px-3">
              <Info className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden xs:inline">Info</span>
            </TabsTrigger>
            <TabsTrigger value="media" className="gap-1 md:gap-2 text-[10px] md:text-sm px-1 md:px-3">
              <ImageIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden xs:inline">Mídias</span>
                {visibleMediaList.length > 0 && (
                  <Badge variant="secondary" className="ml-0.5 text-[9px] md:text-xs h-4 md:h-5 px-1">{visibleMediaList.length}</Badge>
                )}
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1 md:gap-2 text-[10px] md:text-sm px-1 md:px-3">
              <Settings2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden xs:inline">Config</span>
            </TabsTrigger>
            <TabsTrigger value="test" className="gap-1 md:gap-2 text-[10px] md:text-sm px-1 md:px-3">
              <TestTube className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden xs:inline">Testar</span>
            </TabsTrigger>
          </TabsList>

          {/* ============== ABA: INSTRUÇÕES ============== */}
          <TabsContent value="prompt" className="space-y-4">
            <Card className="p-4 md:p-6">
              <div className="space-y-3 md:space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 md:gap-3">
                    <div className="p-1.5 md:p-2 rounded-lg bg-primary/10">
                      <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                    </div>
                    <div className="flex-1 space-y-0.5 md:space-y-1">
                      <Label className="text-base md:text-lg font-semibold">Instruções do Agente</Label>
                      <p className="text-xs md:text-sm text-muted-foreground">
                        Defina como seu agente deve atender os clientes
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Se NÃO tem prompt, mostra botão de Gerar */}
                    {!prompt.trim() && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPromptGenerator(true)}
                        className="gap-1.5 text-xs"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">Gerar com IA</span>
                      </Button>
                    )}
                    {/* Se JÁ tem prompt, mostra botão de Melhorar */}
                    {prompt.trim() && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAgentStudio(true)}
                          className="gap-1.5 text-xs"
                        >
                          <Bot className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">Studio</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsPromptImproverOpen(true)}
                          className="gap-1.5 text-xs"
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">Melhorar</span>
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsExpandedEditorOpen(true)}
                      className="gap-1.5 text-xs"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Expandir</span>
                    </Button>
                  </div>
                </div>

                <Textarea
                  placeholder={`Exemplo:
Você é um assistente de atendimento da [Nome da Empresa].

PERSONALIDADE:
- Seja simpático, profissional e direto
- Use emojis com moderação
- Sempre cumprimente o cliente pelo nome quando possível

INFORMAÇÕES:
- Horário: Segunda a Sexta, 8h às 18h
- Endereço: Rua Principal, 123
- WhatsApp: (11) 99999-9999

O QUE FAZER:
- Responda dúvidas sobre produtos e preços
- Agende visitas e reuniões
- Envie cardápios e catálogos quando solicitado

O QUE NÃO FAZER:
- Não invente informações que não sabe
- Se não souber, diga que vai verificar e retorna`}
                  value={prompt}
                  onChange={(e) => setPrompt(normalizePromptText(e.target.value))}
                  rows={12}
                  className="resize-none text-sm md:text-base leading-relaxed min-h-[250px] md:min-h-[400px]"
                />

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 md:pt-4 border-t">
                  <div className="text-xs md:text-sm text-muted-foreground">
                    {prompt.length} caracteres
                    {prompt.length < 50 && (
                      <span className="text-amber-500 ml-2">
                        (mínimo recomendado: 50)
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={() => saveConfigMutation.mutate()}
                    disabled={saveConfigMutation.isPending || !prompt.trim()}
                    className="w-full md:w-auto h-11"
                    size="lg"
                  >
                    {saveConfigMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Salvar
                  </Button>
                </div>
              </div>
            </Card>

            {/* Dica guiada */}
            <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Próximo passo: Adicione mídias
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Configure áudios, imagens e vídeos que o agente pode enviar automaticamente.
                  </p>
                  <Button
                    variant="link"
                    className="p-0 h-auto text-blue-600"
                    onClick={() => setActiveTab("media")}
                  >
                    Ir para Mídias <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* ============== ABA: INFO - SAUDAÇÃO E ENDEREÇO ============== */}
          <TabsContent value="info" className="space-y-4">
            
            {/* Header da aba */}
            <Card className="p-4 md:p-6">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Informações do Negócio</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure a saudação inicial e o endereço fixo do seu negócio. 
                    Essas informações são injetadas automaticamente no prompt da IA.
                  </p>
                </div>
              </div>
            </Card>

            {/* Saudação Personalizada */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                      <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <Label className="text-base font-semibold">Saudação Personalizada</Label>
                      <p className="text-sm text-muted-foreground">
                        Primeira mensagem que a IA envia ao cliente. Use <code className="bg-muted px-1 rounded text-xs">{"{nome}"}</code> para o nome do cliente.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="greeting-enabled" className="text-sm font-medium">
                      {greetingEnabled ? "Ativo" : "Desativado"}
                    </Label>
                    <Switch
                      id="greeting-enabled"
                      checked={greetingEnabled}
                      onCheckedChange={setGreetingEnabled}
                    />
                  </div>
                </div>

                {greetingEnabled && (
                  <>
                    <Textarea
                      placeholder="Ex: Olá {nome}! Bem-vindo à nossa loja! Como posso te ajudar hoje?"
                      value={customGreeting}
                      onChange={(e) => setCustomGreeting(e.target.value)}
                      rows={3}
                      className="resize-none"
                    />

                    <div className="flex items-center gap-3">
                      <Switch
                        id="greeting-variation"
                        checked={greetingVariation}
                        onCheckedChange={setGreetingVariation}
                      />
                      <Label htmlFor="greeting-variation" className="cursor-pointer">
                        <span className="font-medium">Variação com IA</span>
                        <span className="block text-xs text-muted-foreground">
                          A IA cria variações naturais da saudação mantendo a essência (cada cliente recebe uma versão diferente)
                        </span>
                      </Label>
                    </div>

                    <div className="bg-green-50 dark:bg-green-950/30 p-3 rounded-md">
                      <p className="text-xs text-green-700 dark:text-green-300">
                        {customGreeting 
                          ? greetingVariation 
                            ? "🎯 A IA vai usar a saudação como base e criar variações naturais para cada cliente. Apenas na PRIMEIRA mensagem."
                            : "📌 A IA vai usar esta saudação EXATAMENTE como está na PRIMEIRA mensagem (substituindo {nome} pelo nome do cliente)."
                          : "💡 Preencha a saudação acima para a IA usar na primeira mensagem com cada cliente."
                        }
                      </p>
                    </div>

                    <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1">
                          <Label className="text-sm font-semibold">Fluxo extra após a saudação</Label>
                          <p className="text-sm text-muted-foreground">
                            Monte uma sequência opcional para disparar logo depois da saudação inicial. Exemplo:
                            texto de boas-vindas, imagem de oferta e outra mensagem para converter o cliente.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={addGreetingExtraTextItem}>
                            <Plus className="w-4 h-4 mr-2" />
                            Texto
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={addGreetingExtraImageItem}>
                            <ImageIcon className="w-4 h-4 mr-2" />
                            Imagem
                          </Button>
                        </div>
                      </div>

                      {greetingExtraFlowItems.length === 0 ? (
                        <div className="rounded-lg border border-dashed bg-background/70 p-4 text-sm text-muted-foreground">
                          Nenhum passo extra configurado. Use os botões acima para adicionar texto e imagem na ordem desejada.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {greetingExtraFlowItems.map((item, index) => (
                            <div key={item.id} className="rounded-lg border bg-background p-4 space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary">Etapa {index + 1}</Badge>
                                  <span className="text-sm font-medium">
                                    {item.type === "text" ? "Mensagem de texto" : "Imagem"}
                                  </span>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeGreetingExtraItem(item.id)}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>

                              {item.type === "text" ? (
                                <Textarea
                                  placeholder="Ex: Hoje temos uma condição especial para você..."
                                  value={item.text}
                                  onChange={(e) =>
                                    updateGreetingExtraItem(item.id, (current) => ({
                                      ...current,
                                      type: "text",
                                      text: e.target.value,
                                    }))
                                  }
                                  rows={3}
                                  className="resize-none"
                                />
                              ) : (
                                <div className="space-y-3">
                                  {item.storageUrl ? (
                                    <div className="space-y-3">
                                      <img
                                        src={item.storageUrl}
                                        alt={item.fileName || `Imagem da etapa ${index + 1}`}
                                        className="h-40 w-full rounded-lg object-cover border"
                                      />
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => removeGreetingExtraImage(item.id)}
                                        >
                                          Remover imagem
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                      Envie uma imagem para esta etapa.
                                    </div>
                                  )}

                                  <div className="space-y-2">
                                    <Label className="text-sm">Arquivo da imagem</Label>
                                    <Input
                                      type="file"
                                      accept="image/*"
                                      disabled={uploadingGreetingImageId === item.id}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        handleGreetingExtraImageUpload(item.id, file);
                                        e.currentTarget.value = "";
                                      }}
                                    />
                                    {uploadingGreetingImageId === item.id && (
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Enviando imagem...
                                      </div>
                                    )}
                                  </div>

                                  <div className="space-y-2">
                                    <Label className="text-sm">Legenda opcional após a imagem</Label>
                                    <Textarea
                                      placeholder="Ex: Veja esse material e me diga qual opção faz mais sentido para você."
                                      value={item.caption}
                                      onChange={(e) =>
                                        updateGreetingExtraItem(item.id, (current) => ({
                                          ...current,
                                          type: "image",
                                          caption: e.target.value,
                                        }))
                                      }
                                      rows={2}
                                      className="resize-none"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-3">
                        <p className="text-xs text-green-700 dark:text-green-300">
                          Ordem de envio no WhatsApp: saudação inicial primeiro, depois cada etapa acima na sequência exibida.
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {!greetingEnabled && (
                  <div className="bg-gray-50 dark:bg-zinc-800/50 p-3 rounded-md">
                    <p className="text-xs text-muted-foreground">
                      🔕 Saudação personalizada desativada. A IA vai cumprimentar conforme definido no prompt.
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Endereço do Negócio */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                      <Info className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <Label className="text-base font-semibold">Endereço do Negócio</Label>
                      <p className="text-sm text-muted-foreground">
                        Endereço fixo que a IA SEMPRE vai informar. Nunca vai inventar outro endereço.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="address-enabled" className="text-sm font-medium">
                      {addressEnabled ? "Ativo" : "Desativado"}
                    </Label>
                    <Switch
                      id="address-enabled"
                      checked={addressEnabled}
                      onCheckedChange={setAddressEnabled}
                    />
                  </div>
                </div>

                {addressEnabled && (
                  <>
                    <Textarea
                      placeholder="Ex: Rua das Flores, 123 - Centro, São Paulo/SP - CEP 01010-010"
                      value={customAddress}
                      onChange={(e) => setCustomAddress(e.target.value)}
                      rows={3}
                      className="resize-none"
                    />

                    <div className="bg-purple-50 dark:bg-purple-950/30 p-3 rounded-md">
                      <p className="text-xs text-purple-700 dark:text-purple-300">
                        {customAddress 
                          ? "📍 Quando o cliente perguntar sobre endereço, localização ou como chegar, a IA vai responder com este endereço exato."
                          : "💡 Preencha o endereço acima para a IA informar corretamente quando perguntarem."
                        }
                      </p>
                    </div>
                  </>
                )}

                {!addressEnabled && (
                  <div className="bg-gray-50 dark:bg-zinc-800/50 p-3 rounded-md">
                    <p className="text-xs text-muted-foreground">
                      🔕 Endereço fixo desativado. A IA só vai informar o que estiver no prompt.
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Botão Salvar */}
            <div className="flex justify-end">
              <Button
                onClick={() => saveConfigMutation.mutate()}
                disabled={saveConfigMutation.isPending}
                size="lg"
              >
                {saveConfigMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar Informações
              </Button>
            </div>
          </TabsContent>

          {/* ============== ABA: MÍDIAS ============== */}
          <TabsContent value="media" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Biblioteca de Mídias</h3>
                <p className="text-sm text-muted-foreground">
                  Adicione áudios, imagens e vídeos para o agente enviar
                </p>
              </div>
              <Button onClick={handleNewMedia}>
                <Plus className="w-4 h-4 mr-2" />
                Nova Mídia
              </Button>
            </div>

            {loadingMedia ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : visibleMediaList.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="p-4 rounded-full bg-primary/10 mb-4">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">Nenhuma mídia cadastrada</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                    Adicione áudios, imagens ou vídeos que o agente pode enviar automaticamente.
                  </p>
                  <Button onClick={handleNewMedia}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar primeira mídia
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {visibleMediaList.map((media) => {
                  const Icon = mediaTypeIcons[media.mediaType];
                  return (
                    <Card key={media.id} className={`relative ${!media.isActive ? 'opacity-50' : ''}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <CardTitle className="text-sm font-mono">{media.name}</CardTitle>
                              <Badge variant="secondary" className="text-xs mt-1">
                                {media.mediaType}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEditMedia(media)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteMedia(media)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {media.description}
                        </p>
                        {media.whenToUse && (
                          <p className="text-xs text-muted-foreground italic">
                            📌 {media.whenToUse}
                          </p>
                        )}
                        {media.mediaType === "audio" && media.storageUrl && (
                          <audio controls className="w-full h-8 mt-2" src={media.storageUrl} />
                        )}
                        {media.mediaType === "image" && media.storageUrl && (
                          <img src={media.storageUrl} alt={media.name} className="w-full h-20 object-cover rounded mt-2" />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ============== ABA: CONFIGURAÇÕES ============== */}
          <TabsContent value="settings" className="space-y-4">
            {/* 🌐 IMPORTAR WEBSITE - NOVA FUNCIONALIDADE */}
            <WebsiteImporter />

            {/* Tempo de Resposta */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-base font-semibold">Tempo de Resposta</Label>
                    <p className="text-sm text-muted-foreground">
                      Aguarda antes de responder para acumular mensagens do cliente
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <Input
                    type="number"
                    min={5}
                    max={120}
                    step={5}
                    value={responseDelaySeconds}
                    onChange={(e) => setResponseDelaySeconds(Number(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">segundos</span>
                  <div className="flex gap-2">
                    {[
                      { value: 10, label: "Rápido" },
                      { value: 30, label: "Normal" },
                      { value: 60, label: "Lento" },
                    ].map((opt) => (
                      <Button
                        key={opt.value}
                        variant={responseDelaySeconds === opt.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setResponseDelaySeconds(opt.value)}
                      >
                        {opt.label} ({opt.value}s)
                      </Button>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md">
                  💡 Um tempo maior permite que o cliente envie várias mensagens antes do agente responder, evitando respostas incompletas.
                </p>
              </div>
            </Card>

            {/* Tamanho das Bolhas */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-base font-semibold">Tamanho das Mensagens</Label>
                    <p className="text-sm text-muted-foreground">
                      Quantos caracteres cada bolha de mensagem pode ter
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <Input
                    type="number"
                    min={0}
                    max={1000}
                    step={50}
                    value={messageSplitChars}
                    onChange={(e) => setMessageSplitChars(Number(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">caracteres</span>
                  <div className="flex gap-2">
                    {[
                      { value: 200, label: "Pequeno" },
                      { value: 400, label: "Médio" },
                      { value: 600, label: "Grande" },
                      { value: 0, label: "Sem divisão" },
                    ].map((opt) => (
                      <Button
                        key={opt.value}
                        variant={messageSplitChars === opt.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setMessageSplitChars(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Frases Gatilho */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Filter className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-base font-semibold">Frases Gatilho</Label>
                    <p className="text-sm text-muted-foreground">
                      O agente só responde se a conversa contiver estas frases. Deixe vazio para responder todas.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {triggerPhrases.map((phrase, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={phrase}
                        onChange={(e) => {
                          const updated = [...triggerPhrases];
                          updated[index] = e.target.value;
                          setTriggerPhrases(updated);
                        }}
                        placeholder="Ex: vim do instagram"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTriggerPhrases(triggerPhrases.filter((_, i) => i !== index))}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <Input
                      value={newTriggerPhrase}
                      onChange={(e) => setNewTriggerPhrase(e.target.value)}
                      placeholder="Adicionar frase gatilho..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newTriggerPhrase.trim()) {
                          setTriggerPhrases([...triggerPhrases, newTriggerPhrase.trim()]);
                          setNewTriggerPhrase("");
                        }
                      }}
                    />
                    <Button
                      onClick={() => {
                        if (newTriggerPhrase.trim()) {
                          setTriggerPhrases([...triggerPhrases, newTriggerPhrase.trim()]);
                          setNewTriggerPhrase("");
                        }
                      }}
                      disabled={!newTriggerPhrase.trim()}
                      variant="outline"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* Histórico de Conversas */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <History className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-base font-semibold">Memória de Conversas Inteligente</Label>
                    <p className="text-sm text-muted-foreground">
                      Quando ativado, a IA analisa SEMPRE todo o histórico de conversas do cliente para entender o contexto completo
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${fetchHistoryOnFirstResponse ? 'bg-green-500/20' : 'bg-muted'}`}>
                      <History className={`w-5 h-5 ${fetchHistoryOnFirstResponse ? 'text-green-500' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="font-medium">
                        {fetchHistoryOnFirstResponse ? 'Memória Ativa' : 'Memória Desativada'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fetchHistoryOnFirstResponse 
                          ? 'A IA analisa todo o histórico em cada resposta (otimizado para economia de tokens)' 
                          : 'A IA usa apenas o contexto recente da conversa'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={fetchHistoryOnFirstResponse}
                    onCheckedChange={setFetchHistoryOnFirstResponse}
                    className="scale-125"
                  />
                </div>

                <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md">
                  💡 Ideal para advocacias, clínicas, e empresas que já têm histórico de conversas com clientes. A IA usa um sistema inteligente: últimas 30 mensagens na íntegra + resumo das anteriores. Isso economiza tokens mas mantém o contexto completo.
                </p>
              </div>
            </Card>

            {/* Pausar IA ao Responder Manualmente */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <AlertCircle className="w-5 h-5 text-orange-500" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-base font-semibold">Pausar IA ao Responder Manualmente</Label>
                    <p className="text-sm text-muted-foreground">
                      Quando você responde manualmente a um cliente, a IA pode ser pausada automaticamente para aquela conversa
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${pauseOnManualReply ? 'bg-orange-500/20' : 'bg-green-500/20'}`}>
                      <Bot className={`w-5 h-5 ${pauseOnManualReply ? 'text-orange-500' : 'text-green-500'}`} />
                    </div>
                    <div>
                      <p className="font-medium">
                        {pauseOnManualReply ? 'Pausar IA ao Responder' : 'Manter IA Sempre Ativa'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pauseOnManualReply 
                          ? 'Quando você responder, a IA será pausada para aquela conversa' 
                          : 'A IA continua ativa mesmo após você responder manualmente'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={pauseOnManualReply}
                    onCheckedChange={setPauseOnManualReply}
                    className="scale-125"
                  />
                </div>

                {/* Timer de Auto-Reativação - só aparece quando pauseOnManualReply está ativo */}
                {pauseOnManualReply && (
                  <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-dashed">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-500" />
                      <Label className="text-sm font-medium">Reativar IA Automaticamente</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Se você não continuar conversando após sua resposta, a IA volta automaticamente após o tempo configurado
                    </p>
                    
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      <Button
                        variant={autoReactivateMinutes === null ? "default" : "outline"}
                        size="sm"
                        className="text-xs"
                        onClick={() => setAutoReactivateMinutes(null)}
                      >
                        Nunca
                      </Button>
                      <Button
                        variant={autoReactivateMinutes === 10 ? "default" : "outline"}
                        size="sm"
                        className="text-xs"
                        onClick={() => setAutoReactivateMinutes(10)}
                      >
                        10 min
                      </Button>
                      <Button
                        variant={autoReactivateMinutes === 30 ? "default" : "outline"}
                        size="sm"
                        className="text-xs"
                        onClick={() => setAutoReactivateMinutes(30)}
                      >
                        30 min
                      </Button>
                      <Button
                        variant={autoReactivateMinutes === 60 ? "default" : "outline"}
                        size="sm"
                        className="text-xs"
                        onClick={() => setAutoReactivateMinutes(60)}
                      >
                        1 hora
                      </Button>
                      <Button
                        variant={autoReactivateMinutes === 120 ? "default" : "outline"}
                        size="sm"
                        className="text-xs"
                        onClick={() => setAutoReactivateMinutes(120)}
                      >
                        2 horas
                      </Button>
                      <Button
                        variant={autoReactivateMinutes !== null && ![10, 30, 60, 120].includes(autoReactivateMinutes) ? "default" : "outline"}
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          const custom = prompt("Digite o tempo em minutos:");
                          if (custom && !isNaN(Number(custom))) {
                            setAutoReactivateMinutes(Number(custom));
                          }
                        }}
                      >
                        {autoReactivateMinutes !== null && ![null, 10, 30, 60, 120].includes(autoReactivateMinutes) 
                          ? `${autoReactivateMinutes} min` 
                          : "Custom"}
                      </Button>
                    </div>
                    
                    <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {autoReactivateMinutes === null 
                          ? "💡 A IA só volta quando você reativar manualmente na conversa."
                          : `⏰ Se o cliente enviar mensagem e você não responder em ${autoReactivateMinutes} min, a IA lê o contexto e responde automaticamente.`
                        }
                      </p>
                    </div>
                  </div>
                )}

                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md">
                  ⚠️ <strong>Recomendado: Ativado.</strong> Quando você responde manualmente, geralmente deseja assumir a conversa. 
                  Se desativar, a IA pode enviar respostas duplicadas ou conflitantes.
                  Para reativar a IA em uma conversa pausada, use o toggle na tela de conversas.
                </p>
              </div>
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={() => saveConfigMutation.mutate()}
                disabled={saveConfigMutation.isPending}
                size="lg"
              >
                {saveConfigMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar Configurações
              </Button>
            </div>
          </TabsContent>

          {/* ============== ABA: TESTAR - WHATSAPP PLAYGROUND ============== */}
          <TabsContent value="test" className="space-y-0">
            {/* WhatsApp-style Chat Container */}
            <div className="flex flex-col h-[60vh] md:h-[70vh] bg-[#e5ddd5] dark:bg-zinc-900 rounded-xl overflow-hidden border shadow-lg">
              
              {/* Chat Header - WhatsApp Style */}
              <div className="bg-[#075E54] dark:bg-zinc-800 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">Seu Agente IA</p>
                  <p className="text-xs text-white/70">
                    {isActive ? "🟢 Online - Respondendo" : "⚪ Offline - Inativo"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (simulatorChatStorageKey) {
                      removeAuthAgentSimulatorChatStorage(simulatorChatStorageKey);
                    }
                    setChatHistory([]);
                    setSentMedias([]);
                    simulatorSessionIdRef.current = createAuthAgentSimulatorSessionId();
                    setTestResponse("");
                  }}
                  className="text-white/70 hover:text-white hover:bg-white/10 text-xs"
                  title="Limpar conversa"
                  aria-label="Limpar conversa do simulador"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Chat Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
                
                {/* Mensagem inicial do sistema */}
                {chatHistory.length === 0 && (
                  <div className="flex justify-center">
                    <div className="bg-[#FCF4CB] dark:bg-yellow-900/30 text-[#54656F] dark:text-yellow-200 text-xs px-3 py-1.5 rounded-lg shadow-sm">
                      🧪 Playground de Teste - Converse com seu agente
                    </div>
                  </div>
                )}

                {/* Histórico de mensagens */}
                {chatHistory.map((msg, index) => (
                  <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`px-3 py-2 rounded-lg max-w-[80%] shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-[#DCF8C6] dark:bg-green-800 text-[#303030] dark:text-white rounded-tr-none' 
                        : 'bg-white dark:bg-zinc-700 text-[#303030] dark:text-white rounded-tl-none'
                    }`}>
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
                                style={{ accentColor: '#00A884' }}
                              />
                            </div>
                          )}
                          {msg.mediaType === 'document' && (
                            <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                              📄 Abrir documento
                            </a>
                          )}
                        </div>
                      )}
                      
                      {/* TEXTO DA MENSAGEM (se houver) */}
                      {msg.message && (
                        <p 
                          className="text-sm whitespace-pre-wrap"
                              dangerouslySetInnerHTML={{ __html: formatWhatsAppTextForHtml(msg.message) }}
                        />
                      )}
                      
                      <p className={`text-[10px] text-right mt-1 ${
                        msg.role === 'user' ? 'text-[#667781] dark:text-green-300' : 'text-[#667781] dark:text-zinc-400'
                      }`}>
                        {msg.time} {msg.role === 'user' && "\u2713\u2713"}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Loading do agente */}
                {testAgentMutation.isPending && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-zinc-700 text-[#303030] dark:text-white px-4 py-3 rounded-lg rounded-tl-none shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                        <span className="text-xs text-muted-foreground">digitando...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input - WhatsApp Style */}
              <div className="bg-[#F0F0F0] dark:bg-zinc-800 px-3 py-2 flex items-end gap-2 flex-shrink-0">
                <Textarea
                  placeholder="Digite sua mensagem..."
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && testMessage.trim()) {
                      e.preventDefault();
                      testAgentMutation.mutate(testMessage);
                    }
                  }}
                  className="flex-1 resize-none rounded-2xl border-0 bg-white dark:bg-zinc-700 min-h-[44px] max-h-[120px] py-3 px-4 text-sm"
                  rows={1}
                />
                <Button
                  onClick={() => testAgentMutation.mutate(testMessage)}
                  disabled={testAgentMutation.isPending || !testMessage.trim()}
                  size="icon"
                  className="h-11 w-11 rounded-full bg-[#00A884] hover:bg-[#008f6f] flex-shrink-0"
                >
                  {testAgentMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ArrowRight className="w-5 h-5" />
                  )}
                </Button>
              </div>
            </div>

            {/* Dica abaixo do chat */}
            <div className="mt-4 text-center">
              <p className="text-xs text-muted-foreground">
                💡 Pressione <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> para enviar ou <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Shift+Enter</kbd> para nova linha
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ============== DIALOG DE MÍDIA ============== */}
      <Dialog open={isMediaDialogOpen} onOpenChange={setIsMediaDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMedia ? "Editar Mídia" : "Nova Mídia"}</DialogTitle>
            <DialogDescription>
              Configure a mídia e sua descrição para que o agente saiba quando usá-la.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Nome */}
            <div className="space-y-2">
              <Label>Nome da Mídia (ID)</Label>
              <Input
                placeholder="Ex: AUDIO_PRECO, IMG_CARDAPIO"
                value={mediaForm.name}
                onChange={(e) => setMediaForm(prev => ({ ...prev, name: e.target.value }))}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">
                Use letras maiúsculas e underscores. A IA usará este nome para identificar a mídia.
              </p>
            </div>

            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo de Mídia</Label>
              <Select
                value={mediaForm.mediaType}
                onValueChange={(value) => setMediaForm(prev => ({ ...prev, mediaType: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audio">🎵 Áudio</SelectItem>
                  <SelectItem value="image">🖼️ Imagem</SelectItem>
                  <SelectItem value="video">🎬 Vídeo</SelectItem>
                  <SelectItem value="document">📄 Documento</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Upload */}
            <div className="space-y-2">
              <Label>Arquivo</Label>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept={
                  mediaForm.mediaType === "audio" ? "audio/*" :
                  mediaForm.mediaType === "image" ? "image/*" :
                  mediaForm.mediaType === "video" ? "video/*" : "*/*"
                }
                onChange={handleFileSelect}
              />

              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors`}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm">Enviando...</p>
                  </div>
                ) : selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <Check className="w-8 h-8 text-green-500" />
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <Button variant="outline" size="sm">Trocar arquivo</Button>
                  </div>
                ) : mediaForm.storageUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <Check className="w-8 h-8 text-green-500" />
                    <p className="text-sm text-green-600">Arquivo pronto</p>
                    <Button variant="outline" size="sm">Trocar arquivo</Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm">Clique para selecionar</p>
                  </div>
                )}
              </div>
            </div>

            {/* Preview de Imagem */}
            {mediaForm.mediaType === "image" && mediaForm.storageUrl && (
              <div className="space-y-2">
                <span className="text-sm font-medium leading-none">Preview</span>
                <div className="border rounded-lg overflow-hidden">
                  <img src={mediaForm.storageUrl} alt="Preview" className="w-full max-h-48 object-contain" />
                  <div className="flex gap-2 p-2 bg-muted/30 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
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
                        console.log('[DEBUG] Remover Imagem clicked inline!');
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview de Áudio */}
            {mediaForm.mediaType === "audio" && mediaForm.storageUrl && (
              <div className="space-y-2">
                <span className="text-sm font-medium leading-none">Preview</span>
                <div className="p-3 border rounded-lg bg-muted/30">
                  <audio controls className="w-full mb-2" src={mediaForm.storageUrl} />
                  <div className="flex gap-2 flex-wrap">
                    <Button 
                      type="button"
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleTranscribe()} 
                      disabled={transcribing}
                    >
                      {transcribing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                      Transcrever
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Trocar Áudio
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('[DEBUG] Remover Áudio clicked inline!');
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "", transcription: "" }));
                        setSelectedFile(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Transcrição */}
            {mediaForm.mediaType === "audio" && (
              <div className="space-y-2">
                <Label>Transcrição</Label>
                <Textarea
                  placeholder="Transcrição do áudio..."
                  value={mediaForm.transcription}
                  onChange={(e) => setMediaForm(prev => ({ ...prev, transcription: e.target.value }))}
                  rows={2}
                />
              </div>
            )}

            {/* Preview de Vídeo */}
            {mediaForm.mediaType === "video" && mediaForm.storageUrl && (
              <div className="space-y-2">
                <span className="text-sm font-medium leading-none">Preview</span>
                <div className="border rounded-lg overflow-hidden">
                  <video 
                    controls 
                    className="w-full max-h-48 object-contain"
                    src={mediaForm.storageUrl}
                  />
                  <div className="flex gap-2 p-2 bg-muted/30 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
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
                        console.log('[DEBUG] Remover Vídeo clicked inline!');
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview de Documento */}
            {mediaForm.mediaType === "document" && mediaForm.storageUrl && (
              <div className="space-y-2">
                <span className="text-sm font-medium leading-none">Arquivo</span>
                <div className="p-3 border rounded-lg bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm truncate max-w-[200px]">{mediaForm.fileName || "Documento"}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Trocar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('[DEBUG] Remover Documento clicked inline!');
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Descrição */}
            <div className="space-y-2">
              <Label>Descrição para a IA *</Label>
              <Textarea
                placeholder="Ex: Áudio explicando os preços dos produtos principais"
                value={mediaForm.description}
                onChange={(e) => setMediaForm(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                A IA usa esta descrição para decidir quando enviar. NÃO é enviada ao cliente.
              </p>
            </div>

            {/* Quando usar */}
            <div className="space-y-2">
              <Label>Quando usar</Label>
              <Textarea
                placeholder="Ex: Quando o cliente perguntar sobre preços"
                value={mediaForm.whenToUse}
                onChange={(e) => setMediaForm(prev => ({ ...prev, whenToUse: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Legenda (só para imagem/vídeo) */}
            {(mediaForm.mediaType === "image" || mediaForm.mediaType === "video") && (
              <div className="space-y-2">
                <Label>Legenda da Mídia</Label>
                <Textarea
                  placeholder="Ex: 📍 Nossa localização! Estamos na Av. Principal, 123"
                  value={mediaForm.caption}
                  onChange={(e) => setMediaForm(prev => ({ ...prev, caption: e.target.value }))}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Esta legenda será enviada junto com a imagem/vídeo no WhatsApp.
                </p>
              </div>
            )}

            {/* Switches */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Mídia ativa</Label>
                  <p className="text-xs text-muted-foreground">Mídias inativas não são usadas pela IA</p>
                </div>
                <Switch
                  checked={mediaForm.isActive}
                  onCheckedChange={(checked) => setMediaForm(prev => ({ ...prev, isActive: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Enviar sozinha</Label>
                  <p className="text-xs text-muted-foreground">Se ativado, não será combinada com outras mídias</p>
                </div>
                <Switch
                  checked={mediaForm.sendAlone}
                  onCheckedChange={(checked) => setMediaForm(prev => ({ ...prev, sendAlone: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Sem texto extra fora da mídia</Label>
                  <p className="text-xs text-muted-foreground">Se ativado, a IA não envia texto principal fora desta mídia ou fluxo.</p>
                </div>
                <Switch
                  checked={mediaForm.suppressTextResponse}
                  onCheckedChange={(checked) => setMediaForm(prev => ({ ...prev, suppressTextResponse: checked }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMediaDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveMedia} disabled={savingMedia || uploadingFile}>
              {(savingMedia || uploadingFile) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingMedia ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
