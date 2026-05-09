import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, MessageCircle, Bot, BotOff, Smartphone, X, Sparkles, Clock, CalendarPlus, Loader2, ArrowLeft, Mic, User, Forward, Share2, PhoneOff, MoreHorizontal, Trash2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Message, Conversation, AiAgentConfig, WhatsappConnection } from "@shared/schema";
import { MessageImage } from "@/components/message-image";
import MessageScheduler from "@/components/message-scheduler";
import { MessageAudio } from "@/components/message-audio";
import { MessageVideo } from "@/components/message-video";
import { MessageDocument } from "@/components/message-document";
import { UserAudioRecorder } from "@/components/user-audio-recorder";
import { UserMediaUploader } from "@/components/user-media-uploader";
import { UserQuickReplies } from "@/components/user-quick-replies";
import { UserAIMessageGenerator } from "@/components/user-ai-message-generator";
import ConversationTransfer from "@/components/conversation-transfer";
import {
  canCurrentSessionViewConversationNumber,
  findConversationInCache,
  getConversationDisplayName,
  getConversationDisplayNumber,
  mergeConversationIdentity,
} from "@/lib/conversation-identity";
import { cn } from "@/lib/utils";
import { getAuthToken, supabase } from "@/lib/supabase";
import { openAppRealtimeConnection } from "@/lib/app-realtime";
import { getRenderableContactAvatar, markContactAvatarFailed } from "@/lib/contact-avatar";
import { repairMojibakeText } from "@shared/mojibake";
import {
  buildBrazilDateTimeRequest,
  getBrazilDateInputValue,
  getBrazilNowDate,
} from "@/lib/brazil-time";

interface ChatAreaProps {
  conversationId: string | null;
  connectionId?: string;
  onBack?: () => void;
  onOpenContactPanel?: () => void;
  conversationIdentityFallback?: Conversation | null;
  isContactPanelOpen?: boolean;
}

interface AgentConversationStatus {
  isDisabled: boolean;
  isConnectionAiEnabled?: boolean;
  isGlobalAgentActive?: boolean;
  isBusinessAgentActive?: boolean;
  canRespond?: boolean;
  blockSource?: "conversation" | "connection" | "global_agent" | "business_agent" | "group" | null;
  blockReason?: string | null;
}

type ConversationWithConnection = Conversation & {
  connectionName?: string | null;
  connectionPhoneNumber?: string | null;
  providerStatus?: string | null;
  connectionIsConnected?: boolean | null;
};

const RECENT_OPTIMISTIC_MESSAGE_TTL_MS = 90_000;
const REFRESH_AFTER_SEND_DELAY_MS = 3_000;

function isTemporaryMessageId(value: unknown) {
  return String(value || "").startsWith("temp-");
}

function getMessageTimeMs(message: Partial<Message>) {
  const value = message.timestamp || message.createdAt || new Date();
  const time = new Date(value as any).getTime();
  return Number.isFinite(time) ? time : Date.now();
}

function messagesShareServerId(a: Partial<Message>, b: Partial<Message>) {
  const aMessageId = String(a.messageId || "").trim();
  const bMessageId = String(b.messageId || "").trim();
  return Boolean(aMessageId && bMessageId && !isTemporaryMessageId(aMessageId) && aMessageId === bMessageId);
}

function mergeRecentOptimisticMessages(fetchedMessages: Message[], cachedMessages: Message[] | undefined) {
  if (!Array.isArray(cachedMessages) || cachedMessages.length === 0) return fetchedMessages;
  const now = Date.now();
  const optimisticMessages = cachedMessages.filter((message) => {
    if (!isTemporaryMessageId(message.id)) return false;
    if (now - getMessageTimeMs(message) > RECENT_OPTIMISTIC_MESSAGE_TTL_MS) return false;
    return !fetchedMessages.some((serverMessage) => messagesShareServerId(message, serverMessage));
  });
  if (optimisticMessages.length === 0) return fetchedMessages;
  return [...fetchedMessages, ...optimisticMessages].sort(
    (a, b) => getMessageTimeMs(a) - getMessageTimeMs(b),
  );
}

function updateOptimisticMessage(conversationId: string | null, optimisticId: string | undefined, patch: Partial<Message>) {
  if (!conversationId || !optimisticId) return;
  queryClient.setQueryData<Message[]>(["/api/messages", conversationId], (old = []) =>
    old.map((message) => (
      message.id === optimisticId
        ? {
            ...message,
            ...patch,
            status: patch.status || "sent",
          }
        : message
    )),
  );
}

function replaceOptimisticMessage(conversationId: string | null, optimisticId: string | undefined, nextMessage?: Message | null) {
  if (!conversationId || !optimisticId || !nextMessage?.id) return false;
  queryClient.setQueryData<Message[]>(["/api/messages", conversationId], (old = []) =>
    old.map((message) => (message.id === optimisticId ? nextMessage : message)),
  );
  return true;
}

function scheduleMessagesRefresh(conversationId: string | null) {
  if (!conversationId || typeof window === "undefined") return;
  window.setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
  }, REFRESH_AFTER_SEND_DELAY_MS);
}

function optimisticMessageMatchesIncoming(optimistic: any, incoming: any) {
  if (!isTemporaryMessageId(optimistic?.id)) return false;
  if (optimistic?.fromMe !== true || incoming?.fromMe !== true) return false;
  if (optimistic?.mediaType !== incoming?.mediaType) return false;

  const optimisticText = String(optimistic?.text || optimistic?.mediaCaption || "").trim();
  const incomingText = String(incoming?.text || incoming?.mediaCaption || "").trim();
  if (optimisticText && incomingText && optimisticText === incomingText) return true;

  return Boolean(optimistic?.mediaType && !optimistic?.mediaUrl && incoming?.mediaUrl);
}

async function uploadConversationMediaToStorage(conversationId: string, file: File) {
  const initResponse = await apiRequest("POST", `/api/conversations/${conversationId}/media-upload-url`, {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
  });
  const uploadInfo = await initResponse.json();
  if (!uploadInfo?.bucket || !uploadInfo?.path || !uploadInfo?.token || !uploadInfo?.storageUrl) {
    throw new Error("Nao foi possivel preparar o upload da midia.");
  }

  const { error } = await supabase.storage
    .from(uploadInfo.bucket)
    .uploadToSignedUrl(uploadInfo.path, uploadInfo.token, file);

  if (error) {
    throw new Error(error.message || "Falha ao enviar arquivo para o storage.");
  }

  return uploadInfo as {
    bucket: string;
    path: string;
    storageUrl: string;
    fileName: string;
    mimeType: string;
    mediaType: string;
  };
}

function formatConnectionDisplayLabel(connection?: {
  id?: string | null;
  connectionName?: string | null;
  connectionPhoneNumber?: string | null;
  phoneNumber?: string | null;
} | null): string {
  const name = repairMojibakeText(connection?.connectionName || "").trim();
  const phone = String(connection?.connectionPhoneNumber || connection?.phoneNumber || "").trim();
  if (name && phone) return `${name} - ${phone}`;
  if (name) return name;
  if (phone) return `Linha ${phone}`;
  const id = String(connection?.id || "").trim();
  return id ? `Conexao ${id.slice(0, 8)}` : "Conexao nao identificada";
}

function connectionLooksConnected(connection?: {
  isConnected?: boolean | null;
  connectionIsConnected?: boolean | null;
  providerStatus?: string | null;
} | null): boolean {
  return (
    connection?.isConnected === true ||
    connection?.connectionIsConnected === true ||
    String(connection?.providerStatus || "").trim().toLowerCase() === "connected"
  );
}

function isAudioPlaceholderText(text?: string | null): boolean {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (
    normalized === "audio" ||
    normalized === "áudio" ||
    normalized === "[audio enviado]" ||
    normalized === "[áudio enviado]"
  ) {
    return true;
  }

  return (
    normalized.startsWith("[audio") ||
    normalized.startsWith("[áudio") ||
    normalized.startsWith("🎵") ||
    normalized.startsWith("🎤") ||
    normalized.startsWith("??")
  );
}

function getAgentStatusLabel(status?: AgentConversationStatus | null): string {
  if (status?.canRespond) {
    return "Agente Ativo";
  }

  switch (status?.blockSource) {
    case "conversation":
      return "Agente Desativado";
    case "connection":
      return "IA da conexão desligada";
    case "global_agent":
    case "business_agent":
      return "IA global desativada";
    case "group":
      return "Somente manual";
    default:
      return "Agente Indisponível";
  }
}

export function ChatArea({
  conversationId,
  connectionId,
  onBack,
  onOpenContactPanel,
  conversationIdentityFallback,
  isContactPanelOpen = false,
}: ChatAreaProps) {
  const isMemberSession = typeof window !== "undefined" && !!window.localStorage.getItem("memberToken");
  const canViewPhoneNumbers = canCurrentSessionViewConversationNumber();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarModalImage, setAvatarModalImage] = useState("");
  const [avatarModalName, setAvatarModalName] = useState("");
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [mobileCloseDialogOpen, setMobileCloseDialogOpen] = useState(false);
  const [mobileClearDialogOpen, setMobileClearDialogOpen] = useState(false);
  
  // Estados para agendamento manual de follow-up
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  // Estados para agendamento de mensagens com IA
  const [messageScheduleDialogOpen, setMessageScheduleDialogOpen] = useState(false);
  const [scheduleNote, setScheduleNote] = useState("");

  // Estados para novas funcionalidades
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  
  // Estado para auto-transcrição
  const [isAutoTranscribing, setIsAutoTranscribing] = useState(false);
  
  // Estado para encaminhar mensagem
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardTargetNumber, setForwardTargetNumber] = useState("");
  const [forwarding, setForwarding] = useState(false);
  const [forwardContactSearch, setForwardContactSearch] = useState("");
  const [startNewConversationDialogOpen, setStartNewConversationDialogOpen] = useState(false);
  const [selectedNewConversationConnectionId, setSelectedNewConversationConnectionId] = useState("");
  
  // Detectar se é mobile
  const isMobile = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );

  const { data: conversationData } = useQuery<ConversationWithConnection>({
    queryKey: ["/api/conversation", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      if (!conversationId) {
        throw new Error("Conversa não selecionada");
      }

      const response = await apiRequest("GET", `/api/conversation/${conversationId}`);
      const conversation = await response.json();
      return mergeConversationIdentity(
        conversation,
        conversationIdentityFallback ||
          findConversationInCache(
            queryClient.getQueriesData({ queryKey: ["/api/conversations-with-tags"] }),
            conversationId,
          ),
      ) as ConversationWithConnection;
    },
  });
  const conversation = useMemo(
    () =>
      mergeConversationIdentity(
        conversationData,
        conversationIdentityFallback ||
          findConversationInCache(
            queryClient.getQueriesData({ queryKey: ["/api/conversations-with-tags"] }),
            conversationId,
          ),
      ) as ConversationWithConnection | null,
    [conversationData, conversationId, conversationIdentityFallback],
  );

  const { data: allConnections = [] } = useQuery<WhatsappConnection[]>({
    queryKey: ["/api/whatsapp/connections"],
    enabled: !!conversationId,
    staleTime: 15000,
    refetchOnWindowFocus: false,
  });
  const isGroupConversation = Boolean(
    conversation?.jidSuffix === "g.us" ||
      String(conversation?.remoteJid || "").trim().endsWith("@g.us"),
  );

  const activeConnectionId = conversation?.connectionId || connectionId;
  const currentConnectionFromList = activeConnectionId
    ? allConnections.find((connection) => connection.id === activeConnectionId)
    : null;
  const conversationConnectionLabel = formatConnectionDisplayLabel(
    currentConnectionFromList || {
      id: activeConnectionId,
      connectionName: conversation?.connectionName,
      connectionPhoneNumber: conversation?.connectionPhoneNumber,
    },
  );
  const isConversationConnectionConnected = currentConnectionFromList
    ? connectionLooksConnected(currentConnectionFromList)
    : connectionLooksConnected({
        connectionIsConnected: conversation?.connectionIsConnected,
        providerStatus: conversation?.providerStatus,
      });
  const isConversationConnectionDisconnected = Boolean(
    conversationId &&
      conversation &&
      !isGroupConversation &&
      activeConnectionId &&
      !isConversationConnectionConnected,
  );
  const connectedAlternativeConnections = useMemo(
    () => allConnections.filter(
      (connection) => connection.id !== activeConnectionId && connectionLooksConnected(connection),
    ),
    [activeConnectionId, allConnections],
  );

  // Query: Lista de conversas para encaminhar mensagem
  const { data: forwardContacts = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations-with-tags", "forward", activeConnectionId || "all"],
    enabled: forwardDialogOpen,
    queryFn: async () => {
      const qs = activeConnectionId
        ? `?connectionId=${encodeURIComponent(activeConnectionId)}`
        : "";
      const response = await apiRequest("GET", `/api/conversations-with-tags${qs}`);
      const result = await response.json();
      if (Array.isArray(result)) return result;
      return Array.isArray(result?.data) ? result.data : [];
    },
  });

  // Filtrar contatos para encaminhar (excluir conversa atual)
  const filteredForwardContacts = forwardContacts
    .filter(c => c.id !== conversationId)
    .filter(c => {
      if (!forwardContactSearch.trim()) return true;
      const search = forwardContactSearch.toLowerCase();
      const displayName = getConversationDisplayName(c).toLowerCase();
      const displayNumber = getConversationDisplayNumber(c).toLowerCase();
      return (
        displayName.includes(search) ||
        (canViewPhoneNumbers && displayNumber.includes(search))
      );
    });

  // Função de encaminhar mensagem
  const handleForwardMessage = async (target?: { targetNumber?: string; targetConversationId?: string }) => {
    const numberToUse = target?.targetNumber || forwardTargetNumber.trim();
    const targetConversationId = target?.targetConversationId;
    if (!forwardingMessage || (!numberToUse && !targetConversationId)) {
      toast({
        title: "Contato obrigatório",
        description: "Selecione um contato para encaminhar",
        variant: "destructive",
      });
      return;
    }

    setForwarding(true);
    try {
      const response = await apiRequest("POST", `/api/conversations/${conversationId}/forward-message`, {
        messageId: forwardingMessage.id,
        targetConversationId,
        targetNumber: numberToUse ? numberToUse.replace(/\D/g, "") : undefined,
      });
      
      const data = await response.json();
      
      toast({ title: "Mensagem encaminhada!" });
      setForwardDialogOpen(false);
      setForwardingMessage(null);
      setForwardTargetNumber("");
      setForwardContactSearch("");
    } catch (error: any) {
      toast({
        title: "Erro ao encaminhar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setForwarding(false);
    }
  };

  // Query para buscar dados do usuário logado (inclui assinatura)
  const { data: currentUser } = useQuery<{
    id: string;
    name?: string;
    signature?: string;
    signatureEnabled?: boolean;
  }>({
    queryKey: ["/api/auth/user"],
  });

  const refreshConversationSummaries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
  }, []);

  // 🔧 FIX: Quando conversa é carregada (marcada como lida no backend), atualizar APENAS o badge
  // OTIMIZAÇÃO: Em vez de invalidar toda a lista (causa refetch completo de 672 conversas),
  // fazemos update otimista só do unreadCount da conversa selecionada
  useEffect(() => {
    if (conversation && conversationId) {
      // Update otimista: zerar unreadCount da conversa no cache local
      queryClient.setQueryData(
        ["/api/conversations-with-tags", null, "page0"],
        (old: any) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((c: any) =>
              c.id === conversationId ? { ...c, unreadCount: 0 } : c
            ),
          };
        }
      );
      // Também atualiza quando há filtro de tag ativo
      queryClient.setQueriesData(
        { queryKey: ["/api/conversations-with-tags"] },
        (old: any) => {
          if (!old?.data && !Array.isArray(old)) return old;
          const arr = old?.data || old;
          if (!Array.isArray(arr)) return old;
          const updated = arr.map((c: any) =>
            c.id === conversationId ? { ...c, unreadCount: 0 } : c
          );
          return old?.data ? { ...old, data: updated } : updated;
        }
      );
    }
  }, [conversationId]);

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages", conversationId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/messages/${conversationId}?paginated=true&limit=50`);
      const data = await res.json();
      // Compatível: se backend retornar array legado, usar direto
      if (Array.isArray(data)) {
        setHasMoreMessages(false);
        return mergeRecentOptimisticMessages(
          data,
          queryClient.getQueryData<Message[]>(["/api/messages", conversationId]),
        );
      }
      // Paginado: { messages: Message[], hasMore: boolean }
      setHasMoreMessages(data.hasMore ?? false);
      return mergeRecentOptimisticMessages(
        data.messages ?? [],
        queryClient.getQueryData<Message[]>(["/api/messages", conversationId]),
      );
    },
    enabled: !!conversationId,
    refetchInterval: 15000, // Fallback polling 15s quando WebSocket oscila
    staleTime: 5000, // Considera dados frescos por 5s
  });

  // State para mensagens mais antigas (carregadas sob demanda)
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  // Resetar mensagens antigas quando trocar de conversa
  useEffect(() => {
    setOlderMessages([]);
    setHasMoreMessages(false);
  }, [conversationId]);

  // Combinar mensagens: antigas + recentes, deduplicando por ID e ordenando
  const allMessages = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of olderMessages) map.set(String(m.id), m);
    for (const m of messages) map.set(String(m.id), m);
    return Array.from(map.values()).sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [olderMessages, messages]);

  // Carregar mensagens mais antigas
  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || isLoadingOlder || !hasMoreMessages) return;
    setIsLoadingOlder(true);
    try {
      const oldest = allMessages[0]?.timestamp;
      if (!oldest) return;
      const beforeISO = typeof oldest === 'string' ? oldest : new Date(oldest).toISOString();
      const res = await apiRequest(
        "GET",
        `/api/messages/${conversationId}?paginated=true&limit=50&before=${encodeURIComponent(beforeISO)}`,
      );
      const data = await res.json();
      const older = Array.isArray(data) ? data : (data.messages ?? []);
      const moreAvailable = Array.isArray(data) ? false : (data.hasMore ?? false);
      // Preservar posição de scroll
      const container = messagesContainerRef.current;
      const prevScrollHeight = container?.scrollHeight ?? 0;
      setOlderMessages(prev => [...older, ...prev]);
      setHasMoreMessages(moreAvailable);
      // Restaurar posição de scroll após prepend
      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop += (newScrollHeight - prevScrollHeight);
        }
      });
    } catch (err) {
      console.error('[LAZY-LOAD] Erro ao carregar mensagens antigas:', err);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [conversationId, isLoadingOlder, hasMoreMessages, allMessages]);

  const { data: agentConfig } = useQuery<AiAgentConfig | null>({
    queryKey: ["/api/agent/config"],
  });

  const { data: agentStatus } = useQuery<AgentConversationStatus>({
    queryKey: ["/api/agent/status", conversationId],
    enabled: !!conversationId,
  });
  const isConversationAgentEnabled = !agentStatus?.isDisabled;
  const isAgentEnabled = agentStatus?.canRespond ?? isConversationAgentEnabled;
  const agentStatusLabel = getAgentStatusLabel(agentStatus);
  const agentBlockedReason = agentStatus?.blockReason || null;
  const isConversationClosed = conversation?.isClosed === true;
  const conversationLockedMessage =
    "Esta conversa foi encerrada. O histórico ficou preservado e o próximo atendimento seguirá em uma nova conversa.";
  const connectionUnavailableMessage =
    `Esta conversa pertence à conexão ${conversationConnectionLabel}, que está desconectada. Reconecte essa linha para responder neste histórico.`;
  const isComposerDisabled = isConversationClosed || isConversationConnectionDisconnected;

  // Follow-up status
  const { data: followupStatus } = useQuery<{ 
    active: boolean; 
    stage: number; 
    nextFollowupAt: string | null;
    disabledReason: string | null;
  }>({
    queryKey: ["/api/followup/conversation", conversationId, "status"],
    enabled: !!conversationId,
  });

  const toggleAgentMutation = useMutation({
    mutationFn: async (disable: boolean) => {
      return await apiRequest("POST", `/api/agent/toggle/${conversationId}`, {
        disable,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/status", conversationId] });
      toast({
        title: agentStatus?.isDisabled ? "Agente Ativado" : "Agente Desativado",
        description: agentStatus?.isDisabled 
          ? "O agente voltará a responder quando o cliente enviar nova mensagem" 
          : "O agente não responderá mais nesta conversa",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao alterar agente",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 🤖 Responder com IA - dispara resposta manualmente
  const respondWithAIMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/agent/respond/${conversationId}`);
      return response.json();
    },
    onSuccess: (data: { success: boolean; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
      if (data?.success) {
        toast({
          title: "✅ Solicitação Enviada",
          description: data.message || "A IA irá processar e responder em breve",
          variant: "default",
        });
        return;
      }

      toast({
        title: "Não foi possível responder com IA",
        description: data?.message || "A solicitação não pôde ser executada.",
        variant: "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao responder com IA",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Follow-up toggle mutation
  const toggleFollowupMutation = useMutation({
    mutationFn: async (active: boolean) => {
      return await apiRequest("POST", `/api/followup/conversation/${conversationId}/toggle`, {
        active,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/followup/conversation", conversationId, "status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/pending"] });
      toast({
        title: followupStatus?.active ? "Follow-up Desativado" : "Follow-up Ativado",
        description: followupStatus?.active 
          ? "Mensagens automáticas de follow-up foram pausadas para esta conversa" 
          : "Mensagens automáticas serão enviadas quando o cliente parar de responder",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao alterar follow-up",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const closeConversationMutation = useMutation({
    mutationFn: async () => {
      if (!conversationId) {
        throw new Error("Conversa inválida");
      }

      await apiRequest("POST", `/api/conversations/${conversationId}/close-ticket`, {
        reason: "Encerrado pelo atendente",
      });
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/status", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/conversation", conversationId, "status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      toast({
        title: "Chamado encerrado",
        description: "Encerrado internamente. A IA ficou pronta para o próximo atendimento.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao encerrar atendimento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearConversationMutation = useMutation({
    mutationFn: async () => {
      if (!conversationId) {
        throw new Error("Conversa inválida");
      }

      await apiRequest("POST", `/api/conversations/${conversationId}/clear-history`);
    },
    onSuccess: () => {
      setMessageText("");
      setOlderMessages([]);
      setHasMoreMessages(false);
      queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/status", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/conversation", conversationId, "status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      if (onBack) {
        onBack();
      } else {
        setLocation("/conversas");
      }
      toast({
        title: "Conversa limpa",
        description: "A conversa saiu da lista e não foi movida para Arquivadas.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao limpar conversa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Agendar follow-up manual
  const scheduleFollowupMutation = useMutation({
    mutationFn: async (data: { scheduledFor: string; note?: string }) => {
      return await apiRequest("POST", `/api/followup/conversation/${conversationId}/schedule`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/followup/conversation", conversationId, "status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/pending"] });
      setScheduleDialogOpen(false);
      setScheduleDate("");
      setScheduleTime("");
      setScheduleNote("");
      toast({
        title: "Follow-up Agendado!",
        description: "Você receberá um lembrete na data/hora escolhida.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao agendar follow-up",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Estado para tracking de re-download em progresso
  const [redownloadingMessageId, setRedownloadingMessageId] = useState<string | null>(null);

  // Mutation para re-download de mídia
  const redownloadMediaMutation = useMutation({
    mutationFn: async (messageId: string) => {
      setRedownloadingMessageId(messageId);
      const response = await apiRequest("POST", `/api/messages/${messageId}/redownload`);
      return response.json();
    },
    onSuccess: async (data: { success: boolean; message: string; mediaUrl?: string }) => {
      setRedownloadingMessageId(null);
      if (data.success) {
        // FORÇA RELOAD IMEDIATO DAS MENSAGENS PARA MOSTRAR O PLAYER
        await queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
        await queryClient.refetchQueries({ queryKey: ["/api/messages", conversationId] });
        toast({
          title: "✅ Mídia recuperada!",
          description: "A mídia foi baixada novamente com sucesso.",
        });
      } else {
        toast({
          title: "❌ Não foi possível recuperar",
          description: data.message,
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      setRedownloadingMessageId(null);
      toast({
        title: "Erro ao re-baixar mídia",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para auto-transcrição
  const autoTranscribeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/conversations/${conversationId}/auto-transcribe`);
      return response.json();
    },
    onSuccess: (data: { transcribed: number; total: number; remaining: number }) => {
      if (data.transcribed > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
        toast({
          title: "Áudios transcritos!",
          description: `${data.transcribed} de ${data.total} áudios foram transcritos.`,
        });
      }
      setIsAutoTranscribing(false);
    },
    onError: (error: Error) => {
      setIsAutoTranscribing(false);
      console.error("Auto-transcribe error:", error);
    },
  });

  useEffect(() => {
    if (!startNewConversationDialogOpen) return;
    if (
      selectedNewConversationConnectionId &&
      connectedAlternativeConnections.some((connection) => connection.id === selectedNewConversationConnectionId)
    ) {
      return;
    }
    setSelectedNewConversationConnectionId(connectedAlternativeConnections[0]?.id || "");
  }, [connectedAlternativeConnections, selectedNewConversationConnectionId, startNewConversationDialogOpen]);

  const startNewConversationMutation = useMutation({
    mutationFn: async (targetConnectionId: string) => {
      const phoneNumber = String(conversation?.contactNumber || displayNumber || "").replace(/\D/g, "");
      if (!phoneNumber || !targetConnectionId) {
        throw new Error("Telefone ou conexão de saída não encontrada.");
      }
      const response = await apiRequest("POST", "/api/conversations/new-contact", {
        phoneNumber,
        name: displayName && displayName !== phoneNumber ? displayName : undefined,
        connectionId: targetConnectionId,
      });
      return response.json();
    },
    onSuccess: (data: { conversationId?: string }) => {
      if (!data?.conversationId) {
        toast({
          title: "Conversa criada sem identificador",
          description: "Atualize a lista de conversas e tente abrir novamente.",
          variant: "destructive",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversation", data.conversationId] });
      setStartNewConversationDialogOpen(false);
      setLocation(`/conversas/${data.conversationId}`);
      toast({
        title: "Conversa aberta em linha ativa",
        description: "Agora você pode responder usando a conexão selecionada.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao iniciar conversa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await apiRequest("POST", "/api/messages/send", {
        conversationId,
        text,
      });
      return response.json();
    },
    // Optimistic update - mostrar mensagem imediatamente
    onMutate: async (text: string) => {
      // Cancelar queries em andamento
      await queryClient.cancelQueries({ queryKey: ["/api/messages", conversationId] });
      
      // Snapshot do estado anterior
      const previousMessages = queryClient.getQueryData<Message[]>(["/api/messages", conversationId]);
      
      // Criar mensagem otimista
      const optimisticId = `temp-${Date.now()}`;
      const optimisticMessage: Message = {
        id: optimisticId,
        conversationId: conversationId!,
        messageId: optimisticId,
        fromMe: true,
        text: text,
        timestamp: new Date(),
        status: "sending",
        isFromAgent: false,
        createdAt: new Date(),
        mediaType: null,
        mediaUrl: null,
        mediaMimeType: null,
        mediaCaption: null,
      };
      
      // Atualizar cache imediatamente
      queryClient.setQueryData<Message[]>(["/api/messages", conversationId], (old = []) => [...old, optimisticMessage]);
      
      // Limpar input imediatamente
      setMessageText("");
      
      return { previousMessages, optimisticId };
    },
    onSuccess: async (data: any, _text, context) => {
      const replaced = replaceOptimisticMessage(conversationId, context?.optimisticId, data?.message as Message | undefined);
      if (!replaced) {
        updateOptimisticMessage(conversationId, context?.optimisticId, {
          messageId: data?.messageId || context?.optimisticId,
          status: "sent",
        } as Partial<Message>);
      }
      scheduleMessagesRefresh(conversationId);
      refreshConversationSummaries();
      
      // 🛑 AUTO-PAUSE: Se o agente foi pausado automaticamente, atualizar status e avisar
      if (data?.agentPaused) {
        queryClient.invalidateQueries({ queryKey: ["/api/agent/status", conversationId] });
        toast({
          title: "IA Pausada Automaticamente",
          description: "A IA foi pausada para esta conversa pois você respondeu manualmente. Ative novamente quando desejar.",
          variant: "default",
        });
      }
    },
    onError: (error: Error, _text, context) => {
      updateOptimisticMessage(conversationId, context?.optimisticId, { status: "failed" } as Partial<Message>);
      scheduleMessagesRefresh(conversationId);
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para enviar áudio
  const sendAudioMutation = useMutation({
    mutationFn: async ({ audioData, duration, mimeType }: { audioData: string; duration: number; mimeType: string }) => {
      return await apiRequest("POST", `/api/conversations/${conversationId}/send-audio`, {
        audioData,
        duration,
        mimeType,
      });
    },
    // Optimistic update para áudio
    onMutate: async ({ audioData, duration }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/messages", conversationId] });
      const previousMessages = queryClient.getQueryData<Message[]>(["/api/messages", conversationId]);
      
      const optimisticMessage: Message = {
        id: `temp-audio-${Date.now()}`,
        conversationId: conversationId!,
        messageId: `temp-audio-${Date.now()}`,
        fromMe: true,
        text: `[Áudio ${duration}s]`,
        timestamp: new Date(),
        status: "sending",
        isFromAgent: false,
        createdAt: new Date(),
        mediaType: "audio",
        mediaUrl: audioData,
        mediaMimeType: "audio/ogg",
        mediaCaption: null,
      };
      
      queryClient.setQueryData<Message[]>(["/api/messages", conversationId], (old = []) => [...old, optimisticMessage]);
      
      return { previousMessages, optimisticId: optimisticMessage.id };
    },
    onSuccess: async (data: any, _vars, context) => {
      updateOptimisticMessage(conversationId, context?.optimisticId, {
        messageId: data?.messageId || context?.optimisticId,
      } as Partial<Message>);
      scheduleMessagesRefresh(conversationId);
      refreshConversationSummaries();
      queryClient.invalidateQueries({ queryKey: ["/api/agent/status", conversationId] });
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["/api/messages", conversationId], context.previousMessages);
      }
      toast({
        title: "Erro ao enviar áudio",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para enviar mídia
  const sendMediaMutation = useMutation({
    mutationFn: async ({ file, type, caption, duration }: { file: File; type: string; caption?: string; duration?: number }) => {
      const uploaded = await uploadConversationMediaToStorage(conversationId!, file);
      const response = await apiRequest("POST", `/api/conversations/${conversationId}/send-media-base64`, {
        mediaUrl: uploaded.storageUrl,
        fileName: uploaded.fileName || file.name,
        mimeType: uploaded.mimeType || file.type,
        mediaType: type,
        caption: caption || undefined,
        duration: duration || undefined,
      });
      
      const payload = await response.json();
      return { ...payload, mediaUrl: uploaded.storageUrl };
    },
    // Optimistic update para mídia
    onMutate: async ({ file, type, caption, duration }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/messages", conversationId] });
      const previousMessages = queryClient.getQueryData<Message[]>(["/api/messages", conversationId]);
      
      // Criar preview local enquanto o backend confirma o envio.
      let previewUrl: string | null = null;
      if (type === 'image' || type === 'video' || type === 'audio') {
        previewUrl = URL.createObjectURL(file);
      }
      
      const mediaLabel = type === 'image' ? 'Imagem' : type === 'video' ? 'Vídeo' : type === 'audio' ? 'Áudio' : 'Documento';
      
      const optimisticMessage: Message = {
        id: `temp-media-${Date.now()}`,
        conversationId: conversationId!,
        messageId: `temp-media-${Date.now()}`,
        fromMe: true,
        text: caption || `[${mediaLabel}]`,
        timestamp: new Date(),
        status: "sending",
        isFromAgent: false,
        createdAt: new Date(),
        mediaType: type,
        mediaUrl: previewUrl,
        mediaMimeType: file.type,
        mediaDuration: duration || null,
        mediaCaption: caption || null,
      };
      
      queryClient.setQueryData<Message[]>(["/api/messages", conversationId], (old = []) => [...old, optimisticMessage]);
      
      return { previousMessages, previewUrl, optimisticId: optimisticMessage.id };
    },
    onSuccess: async (data: any, _vars, context) => {
      // Limpar preview URL
      if (context?.previewUrl) {
        URL.revokeObjectURL(context.previewUrl);
      }
      const replaced = replaceOptimisticMessage(conversationId, context?.optimisticId, data?.message as Message | undefined);
      if (!replaced) {
        updateOptimisticMessage(conversationId, context?.optimisticId, {
          messageId: data?.messageId || context?.optimisticId,
          mediaUrl: data?.mediaUrl || null,
          status: "sent",
        } as Partial<Message>);
      }
      scheduleMessagesRefresh(conversationId);
      refreshConversationSummaries();
      queryClient.invalidateQueries({ queryKey: ["/api/agent/status", conversationId] });
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previewUrl) {
        URL.revokeObjectURL(context.previewUrl);
      }
      updateOptimisticMessage(conversationId, context?.optimisticId, { status: "failed" } as Partial<Message>);
      scheduleMessagesRefresh(conversationId);
      toast({
        title: "Erro ao enviar mídia",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handler para enviar audio gravado com upload direto antes do envio pelo gateway.
  const handleSendAudio = useCallback(async (audioBlob: Blob, duration: number, mimeType: string) => {
    if (isConversationClosed) {
      toast({
        title: "Conversa encerrada",
        description: conversationLockedMessage,
        variant: "destructive",
      });
      return;
    }
    if (isConversationConnectionDisconnected) {
      toast({
        title: "Conexão da conversa desconectada",
        description: connectionUnavailableMessage,
        variant: "destructive",
      });
      return;
    }

    const extension = mimeType.includes("mpeg") || mimeType.includes("mp3")
      ? "mp3"
      : mimeType.includes("mp4") || mimeType.includes("m4a")
        ? "m4a"
        : "ogg";
    const audioFile = new File([audioBlob], `audio-gravado-${Date.now()}.${extension}`, {
      type: mimeType || "audio/ogg",
    });
    sendMediaMutation.mutate({ file: audioFile, type: "audio", duration });
  }, [connectionUnavailableMessage, conversationLockedMessage, isConversationClosed, isConversationConnectionDisconnected, sendMediaMutation, toast]);

  // Handler para enviar mídia
  const handleSendMedia = useCallback((file: File, type: "image" | "video" | "document" | "audio", caption?: string) => {
    if (isConversationClosed) {
      toast({
        title: "Conversa encerrada",
        description: conversationLockedMessage,
        variant: "destructive",
      });
      return;
    }
    if (isConversationConnectionDisconnected) {
      toast({
        title: "Conexão da conversa desconectada",
        description: connectionUnavailableMessage,
        variant: "destructive",
      });
      return;
    }
    // Não bloquear UI - optimistic update já adiciona a mensagem
    sendMediaMutation.mutate({ file, type, caption });
  }, [connectionUnavailableMessage, conversationLockedMessage, isConversationClosed, isConversationConnectionDisconnected, sendMediaMutation, toast]);

  // Handler para selecionar resposta rápida
  const handleQuickReplySelect = useCallback((content: string) => {
    // Substituir variáveis como {nome}, {NOME}, {{nome}}
    let processedContent = content;
    const contactName = conversation?.contactName;
    
    if (contactName) {
      // Substituir {nome}, {NOME}, {{nome}}, {{NOME}}
      processedContent = processedContent
        .replace(/\{\{?nome\}?\}/gi, contactName)
        .replace(/\{\{?NOME\}?\}/gi, contactName)
        .replace(/\{\{?name\}?\}/gi, contactName)
        .replace(/\{\{?NAME\}?\}/gi, contactName);
    } else {
      // Se não tem nome, remover a variável ou substituir por "você"
      processedContent = processedContent
        .replace(/\{\{?nome\}?\}/gi, "")
        .replace(/\{\{?NOME\}?\}/gi, "")
        .replace(/\{\{?name\}?\}/gi, "")
        .replace(/\{\{?NAME\}?\}/gi, "")
        // Limpar espaços duplos que possam surgir
        .replace(/\s+/g, " ")
        .trim();
    }
    
    setMessageText(processedContent);
  }, [conversation?.contactName]);

  // Handler para gerar mensagem com IA
  const handleAIGenerate = useCallback((message: string) => {
    if (isConversationClosed) {
      toast({
        title: "Conversa encerrada",
        description: conversationLockedMessage,
        variant: "destructive",
      });
      return;
    }
    if (isConversationConnectionDisconnected) {
      toast({
        title: "Conexão da conversa desconectada",
        description: connectionUnavailableMessage,
        variant: "destructive",
      });
      return;
    }
    setMessageText(message);
  }, [connectionUnavailableMessage, conversationLockedMessage, isConversationClosed, isConversationConnectionDisconnected, toast]);

  // Função helper para adicionar assinatura à mensagem
  // Assinatura é aplicada no backend para evitar duplicidade
  const applySignature = useCallback((text: string): string => {
    return text;
  }, []);

  const handleSend = () => {
    if (!messageText.trim() || !conversationId) return;
    if (isConversationClosed) {
      toast({
        title: "Conversa encerrada",
        description: conversationLockedMessage,
        variant: "destructive",
      });
      return;
    }
    if (isConversationConnectionDisconnected) {
      toast({
        title: "Conexão da conversa desconectada",
        description: connectionUnavailableMessage,
        variant: "destructive",
      });
      return;
    }
    // Aplica assinatura se estiver habilitada
    const messageWithSignature = applySignature(messageText.trim());
    sendMutation.mutate(messageWithSignature);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-scroll para última mensagem quando messages mudar
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length]);

  // Auto-scroll quando abrir uma nova conversa
  useEffect(() => {
    if (conversationId) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 100);
    }
  }, [conversationId]);

  // Auto-transcrição ao abrir conversa
  useEffect(() => {
    if (conversationId && allMessages.length > 0 && !isAutoTranscribing) {
      // Debug: log todas as mensagens de áudio
      const audioMessages = allMessages.filter(msg => 
        msg.mediaType === "audio" || msg.text?.includes("Áudio") || msg.text?.includes("[Áudio")
      );
      console.log('[AUTO-TRANSCRIBE] Mensagens de áudio encontradas:', audioMessages.map(m => ({
        id: m.id,
        mediaType: m.mediaType,
        mediaUrl: m.mediaUrl ? 'SIM' : 'NÃO',
        text: m.text
      })));
      
      // Verifica se há áudios sem transcrição
      const hasUntranscribedAudios = allMessages.some(msg => 
        msg.mediaType === "audio" && 
        msg.mediaUrl && 
        isAudioPlaceholderText(msg.text)
      );
      
      console.log('[AUTO-TRANSCRIBE] hasUntranscribedAudios:', hasUntranscribedAudios);
      
      if (hasUntranscribedAudios) {
        console.log('[AUTO-TRANSCRIBE] Iniciando transcrição automática...');
        setIsAutoTranscribing(true);
        autoTranscribeMutation.mutate();
      }
    }
  }, [conversationId, allMessages.length]);

  // WebSocket para atualizações em tempo real
  useEffect(() => {
    if (!conversationId) return;

    let realtimeConnection: { close: () => Promise<void> } | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connectRealtime = async () => {
      try {
        realtimeConnection = await openAppRealtimeConnection({
          scope: "user",
          getToken: getAuthToken,
          onEvent: (data) => {
            console.log('[ChatArea WebSocket] Received:', data.type);
            
            // ⚡ REAL-TIME: Append mensagem inline (sem refetch da API)
            if (data.type === 'new_message' || data.type === 'agent_response' || data.type === 'message_sent') {
              const targetConvId = data.data?.conversationId || data.conversationId;
              if (targetConvId === conversationId) {
                if (data.messageData) {
                  // Append direto ao cache do React Query (instantâneo!)
                  queryClient.setQueryData(
                    ["/api/messages", conversationId],
                    (old: any) => {
                      if (!old) return old;
                      // Verificar duplicata por messageId
                      const messages = Array.isArray(old) ? old : (old.messages || []);
                      const exists = messages.some((m: any) => 
                        m.id === data.messageData.id || m.messageId === data.messageData.messageId
                      );
                      if (exists) return old;

                      const optimisticIndex = messages.findIndex((message: any) =>
                        optimisticMessageMatchesIncoming(message, data.messageData)
                      );
                      
                      const newMsg = {
                        ...data.messageData,
                        timestamp: data.messageData.timestamp || new Date().toISOString(),
                      };
                      
                      if (Array.isArray(old)) {
                        if (optimisticIndex >= 0) {
                          return old.map((message: any, index: number) =>
                            index === optimisticIndex
                              ? {
                                  ...newMsg,
                                  mediaUrl: newMsg.mediaUrl || message.mediaUrl,
                                }
                              : message
                          );
                        }
                        return [...old, newMsg];
                      }
                      if (optimisticIndex >= 0) {
                        return {
                          ...old,
                          messages: messages.map((message: any, index: number) =>
                            index === optimisticIndex
                              ? {
                                  ...newMsg,
                                  mediaUrl: newMsg.mediaUrl || message.mediaUrl,
                                }
                              : message
                          ),
                        };
                      }
                      return {
                        ...old,
                        messages: [...(old.messages || []), newMsg],
                      };
                    }
                  );
                } else {
                  // Fallback: se não tiver messageData, refetch
                  queryClient.invalidateQueries({ 
                    queryKey: ["/api/messages", conversationId] 
                  });
                }
              }
            }
            
            // Atualiza status do agente quando IA é pausada ou reativada automaticamente
            if (data.type === 'agent_auto_paused' || data.type === 'agent_auto_reactivated') {
              if (data.conversationId === conversationId) {
                queryClient.invalidateQueries({ 
                  queryKey: ["/api/agent/status", conversationId] 
                });
              }
            }
          },
          onClose: () => {
            console.log('[ChatArea WebSocket] Closed, reconnecting in 3s...');
            reconnectTimeout = setTimeout(connectRealtime, 3000);
          },
          onError: (error) => {
            console.error('[ChatArea WebSocket] Error:', error);
          },
        });

        if (!realtimeConnection) {
          reconnectTimeout = setTimeout(connectRealtime, 3000);
        }

      } catch (error) {
        console.error('[ChatArea WebSocket] Connection error:', error);
        reconnectTimeout = setTimeout(connectRealtime, 3000);
      }
    };

    void connectRealtime();

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      void realtimeConnection?.close();
    };
  }, [conversationId, queryClient]);

  // Número normalizado para exibição (usa remoteJid quando disponível)
  const displayNumber = getConversationDisplayNumber(conversation);
  const displayName = getConversationDisplayName(conversation);
  const contactAvatarUrl = getRenderableContactAvatar(conversation?.contactAvatar);
  const compactHeaderActions = !isMobile && isContactPanelOpen;
  const headerActionButtonClass = compactHeaderActions ? "h-8 px-2" : "h-8 px-2.5";
  const headerActionLabelClass = compactHeaderActions ? "hidden" : "hidden lg:inline text-[11px]";
  const headerBadgeLabelClass = compactHeaderActions ? "hidden" : "hidden md:inline";
  const showDetailsButton = Boolean(onOpenContactPanel) && !isContactPanelOpen;

  // Minimalist onboarding: Agent CTA should have priority on the right side
  if (!conversationId && (!agentConfig || !(agentConfig as any).isActive)) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/20">
        <div className="text-center space-y-4 max-w-sm p-8">
          <Bot className="w-16 h-16 mx-auto text-muted-foreground" />
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Configure seu Agente IA</h3>
            <p className="text-sm text-muted-foreground">Defina seu agente para automatizar respostas.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const el = document.querySelector('[data-testid=\"button-nav-agent\"]') as HTMLButtonElement;
                el?.click();
              }}
              data-testid="button-minimal-configure-agent"
            >
              <Bot className="w-4 h-4 mr-2" />
              Configurar Agente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Minimalist onboarding: WhatsApp connection CTA when nothing selected
  if (!conversationId && !activeConnectionId) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/20">
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <Smartphone className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="font-medium text-sm mb-2">WhatsApp nao conectado</h3>
          <p className="text-xs text-muted-foreground max-w-xs mb-3">
            Conecte seu WhatsApp para visualizar e responder mensagens.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/conexao")}
            data-testid="button-minimal-connect-whatsapp"
          >
            Conectar WhatsApp
          </Button>
        </div>
      </div>
    );
  }

  // Minimal onboarding when agent is not configured
  if (!conversationId && (!agentStatus || agentStatus === undefined)) {
    // Fallback: show standard message; agent status is per conversation, so we also check global config below
  }

  // If no conversation selected and agent not configured globally, show minimal CTA
  // Note: relies on `/api/agent/config` query above
  // @ts-ignore - `agentConfig` is added when available
  if (!conversationId && (typeof agentConfig === 'undefined' || !(agentConfig && (agentConfig as any).isActive))) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/20">
        <div className="text-center space-y-4 max-w-sm p-8">
          <Bot className="w-16 h-16 mx-auto text-muted-foreground" />
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Configure seu Agente IA</h3>
            <p className="text-sm text-muted-foreground">Defina seu agente para automatizar respostas.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const el = document.querySelector('[data-testid="button-nav-agent"]') as HTMLButtonElement;
                el?.click();
              }}
              data-testid="button-minimal-configure-agent"
            >
              <Bot className="w-4 h-4 mr-2" />
              Configurar Agente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!conversationId) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/20">
        <div className="text-center space-y-4 max-w-sm p-8">
          <MessageCircle className="w-16 h-16 mx-auto text-muted-foreground" />
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Selecione uma conversa</h3>
            <p className="text-sm text-muted-foreground">
              Escolha uma conversa da lista para comecar a visualizar e responder mensagens
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!activeConnectionId) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/20">
        <div className="text-center space-y-4 max-w-sm p-8">
          <MessageCircle className="w-16 h-16 mx-auto text-muted-foreground" />
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">WhatsApp nao conectado</h3>
            <p className="text-sm text-muted-foreground">
              Conecte seu WhatsApp primeiro para visualizar as conversas
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden bg-background",
        isMobile && "pb-[calc(4.5rem+env(safe-area-inset-bottom))]",
      )}
    >
      {/* Message Scheduler Dialog */}
      {conversation && (
        <MessageScheduler
          conversation={conversation}
          open={messageScheduleDialogOpen}
          onOpenChange={setMessageScheduleDialogOpen}
        />
      )}

      <Dialog open={startNewConversationDialogOpen} onOpenChange={setStartNewConversationDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Iniciar conversa por linha conectada</DialogTitle>
            <DialogDescription>
              Esta ação abre um novo atendimento para {displayNumber || "este contato"} usando outra conexão ativa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              O histórico atual continua vinculado à conexão {conversationConnectionLabel}. Para responder neste mesmo histórico, reconecte essa linha.
            </div>
            <div className="space-y-2">
              <Label htmlFor="newConversationConnection">Linha de saída</Label>
              <Select
                value={selectedNewConversationConnectionId}
                onValueChange={setSelectedNewConversationConnectionId}
              >
                <SelectTrigger id="newConversationConnection">
                  <SelectValue placeholder="Selecione uma linha conectada" />
                </SelectTrigger>
                <SelectContent>
                  {connectedAlternativeConnections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {formatConnectionDisplayLabel(connection)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStartNewConversationDialogOpen(false)}
              disabled={startNewConversationMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => startNewConversationMutation.mutate(selectedNewConversationConnectionId)}
              disabled={!selectedNewConversationConnectionId || startNewConversationMutation.isPending}
            >
              {startNewConversationMutation.isPending ? "Abrindo..." : "Abrir conversa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chat Header */}
      <div className="shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className={cn(
          "flex flex-wrap gap-3",
          isMobile ? "items-start px-3 py-3" : "items-start p-3 md:p-4"
        )}>
          {/* Botão voltar - apenas mobile */}
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9 flex-shrink-0"
              onClick={onBack}
              data-testid="button-back-conversations"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-3 md:min-w-[220px] md:flex-[0_1_240px]">
            <Avatar 
              className="w-8 h-8 md:w-10 md:h-10 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0" 
              onClick={(e) => {
                e.stopPropagation();
                if (contactAvatarUrl) {
                  setAvatarModalImage(contactAvatarUrl);
                  setAvatarModalName(displayName);
                  setAvatarModalOpen(true);
                }
              }}
            >
              {contactAvatarUrl ? (
                <img 
                  src={contactAvatarUrl}
                  alt={displayName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    markContactAvatarFailed(contactAvatarUrl);
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <AvatarFallback 
                className={`bg-primary/10 text-primary font-semibold ${contactAvatarUrl ? 'hidden' : ''}`}
              >
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-0.5">
              <h3 className="font-semibold truncate leading-tight" data-testid="text-contact-name">
                {displayName}
              </h3>
              {displayNumber ? (
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {displayNumber}
                </p>
              ) : null}
              {conversationConnectionLabel ? (
                <p className={cn(
                  "text-[11px] truncate",
                  isConversationConnectionDisconnected ? "text-red-600" : "text-muted-foreground",
                )}>
                  Pertence à conexão: {conversationConnectionLabel}
                </p>
              ) : null}
            </div>
          </div>
          <div
            className={cn(
              "min-w-0 flex-1 flex-wrap items-center gap-2 md:justify-end",
              isMobile && "hidden",
              compactHeaderActions && "basis-full justify-start border-t border-border/70 pt-2 md:pl-[3.25rem]"
            )}
          >
          {/* Encaminhar para outro Setor */}
          {conversationId && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <ConversationTransfer
                      conversationId={conversationId}
                      currentSectorId={(conversation as any)?.sector_id || null}
                      currentSectorName={(conversation as any)?.sector_name || null}
                      triggerClassName={cn(headerActionButtonClass, compactHeaderActions && "gap-0 px-2")}
                      showLabel={!compactHeaderActions}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Encaminhar conversa para outro setor</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Follow-up Toggle */}
          {!isGroupConversation && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={followupStatus?.active ? "default" : "outline"}
                  size="sm"
                  className={cn("gap-1", headerActionButtonClass)}
                  onClick={() => toggleFollowupMutation.mutate(!followupStatus?.active)}
                  disabled={toggleFollowupMutation.isPending || isConversationClosed}
                  data-testid="button-followup-toggle"
                >
                  {followupStatus?.active ? (
                    <>
                      <Sparkles className="w-3 h-3 text-yellow-500" />
                      <span className={headerActionLabelClass}>Follow-up</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 opacity-40" />
                      <span className={headerActionLabelClass}>Sem Follow-up</span>
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {followupStatus?.active 
                  ? `Follow-up ativo (Estágio ${(followupStatus.stage || 0) + 1})` 
                  : "Follow-up desativado para esta conversa"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          )}

          {/* Agendar Follow-up Manual */}
          {!isGroupConversation && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("gap-1", headerActionButtonClass)}
                  onClick={() => setScheduleDialogOpen(true)}
                  disabled={isConversationClosed}
                  data-testid="button-schedule-followup"
                >
                  <CalendarPlus className="w-3 h-3" />
                  <span className={headerActionLabelClass}>Agendar</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Agendar follow-up manual (ex: cliente pediu para ligar em outro dia)
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          )}

          {/* Agendar Mensagem com IA */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("gap-1", headerActionButtonClass)}
                  onClick={() => setMessageScheduleDialogOpen(true)}
                  disabled={isConversationClosed}
                  data-testid="button-schedule-message"
                >
                  <Clock className="w-3 h-3" />
                  <span className={headerActionLabelClass}>Agendar Mensagem</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isGroupConversation
                  ? "Agendar mensagem manual para o grupo usando a fila protegida"
                  : "Agendar mensagem específica com texto manual ou gerada com IA"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Badge
            variant={isGroupConversation ? "secondary" : isAgentEnabled ? "default" : "secondary"}
            className={cn("gap-1 px-2", compactHeaderActions ? "h-8" : "h-7 md:h-auto")}
            data-testid="badge-agent-status-chat"
          >
            {isGroupConversation ? (
              <>
                <Users className="w-3 h-3" />
                <span className={headerBadgeLabelClass}>Somente manual</span>
              </>
            ) : !isAgentEnabled ? (
              <>
                <BotOff className="w-3 h-3" />
                <span className={headerBadgeLabelClass}>{agentStatusLabel}</span>
              </>
            ) : (
              <>
                <Bot className="w-3 h-3" />
                <span className={headerBadgeLabelClass}>{agentStatusLabel}</span>
              </>
            )}
          </Badge>
          {!isGroupConversation && (
            <Switch
              checked={!agentStatus?.isDisabled}
              onCheckedChange={(checked) => toggleAgentMutation.mutate(!checked)}
              disabled={toggleAgentMutation.isPending || isConversationClosed}
              data-testid="switch-agent-chat"
            />
          )}
          
          {/* 🤖 Botão Responder com IA - dispara resposta manual */}
          {!isGroupConversation && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "gap-1 bg-gradient-to-r from-purple-500/10 to-blue-500/10 hover:from-purple-500/20 hover:to-blue-500/20 border-purple-500/30",
                    headerActionButtonClass,
                  )}
                  onClick={() => respondWithAIMutation.mutate()}
                  disabled={respondWithAIMutation.isPending || !isAgentEnabled || isConversationClosed}
                  data-testid="button-respond-with-ai"
                >
                  {respondWithAIMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3 text-purple-500" />
                  )}
                  <span className={headerActionLabelClass}>Responder com IA</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Faz a IA responder imediatamente a última mensagem do cliente.
                  {agentBlockedReason && (
                    <span className="block text-amber-500 mt-1">
                      ⚠️ {agentBlockedReason}
                    </span>
                  )}
                  {!agentBlockedReason && !agentConfig?.isActive && (
                    <span className="block text-amber-500 mt-1">
                      ⚠️ Ative o agente global em "Meu Agente IA" primeiro.
                    </span>
                  )}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn("gap-1", headerActionButtonClass)}
                disabled={closeConversationMutation.isPending || isConversationClosed}
                data-testid="button-close-call"
              >
                {closeConversationMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <PhoneOff className="w-3 h-3" />
                )}
                <span className={headerActionLabelClass}>Encerrar</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Encerrar conversa?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso encerra o chamado internamente, cancela o follow-up desta conversa e deixa a IA pronta para o próximo atendimento.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => closeConversationMutation.mutate()}
                  disabled={closeConversationMutation.isPending}
                >
                  {closeConversationMutation.isPending ? "Encerrando..." : "Encerrar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {!isConversationClosed && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("gap-1", headerActionButtonClass)}
                  disabled={clearConversationMutation.isPending}
                  data-testid="button-clear-conversation"
                >
                  {clearConversationMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                  <span className={headerActionLabelClass}>Limpar</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar conversa atual?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso apaga o histórico operacional desta conversa, zera o contexto que a IA analisa e cancela respostas pendentes. A IA não será reativada nem alterada neste processo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => clearConversationMutation.mutate()}
                    disabled={clearConversationMutation.isPending}
                  >
                    {clearConversationMutation.isPending ? "Limpando..." : "Limpar"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          
          {/* Botão para abrir painel de detalhes do contato */}
          {showDetailsButton && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("gap-1 hidden md:flex", headerActionButtonClass)}
                    onClick={onOpenContactPanel}
                    data-testid="button-open-contact-panel"
                  >
                    <User className="w-3 h-3" />
                    <span className={compactHeaderActions ? "hidden" : "hidden lg:inline text-xs"}>Detalhes</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Abrir painel de detalhes do contato (campos personalizados, mídias, etiquetas)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          </div>
        </div>

        {isMobile && (
          <div className="flex items-center gap-2 border-t border-border/60 px-3 pb-3 pt-2">
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/30 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {isGroupConversation ? "Modo do grupo" : "IA nesta conversa"}
                </p>
                <p className="text-sm font-medium">
                  {isGroupConversation ? "Somente manual" : isAgentEnabled ? "Ativada" : agentStatusLabel}
                </p>
              </div>
              {!isGroupConversation && (
                <Switch
                  checked={isConversationAgentEnabled}
                  onCheckedChange={(checked) => toggleAgentMutation.mutate(!checked)}
                  disabled={toggleAgentMutation.isPending}
                  data-testid="switch-agent-chat-mobile"
                />
              )}
            </div>
            <Button
              variant="outline"
              className="h-11 flex-shrink-0 rounded-2xl px-4"
              onClick={() => setMobileActionsOpen(true)}
              data-testid="button-mobile-conversation-actions"
            >
              <MoreHorizontal className="mr-1 h-4 w-4" />
              Ações
            </Button>
          </div>
        )}

        {isConversationConnectionDisconnected && (
          <div className="border-t border-red-200 bg-red-50 px-3 py-2 text-red-900 md:px-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-start gap-2">
                <PhoneOff className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p className="text-xs leading-5">
                  {connectionUnavailableMessage}
                  {connectedAlternativeConnections.length > 0
                    ? " Há outra linha conectada disponível para abrir um novo atendimento com este mesmo número."
                    : " Nenhuma outra linha está conectada no momento."}
                </p>
              </div>
              {connectedAlternativeConnections.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 flex-shrink-0 border-red-300 bg-white text-red-700 hover:bg-red-100"
                  onClick={() => setStartNewConversationDialogOpen(true)}
                  data-testid="button-start-new-conversation-active-line"
                >
                  Nova conversa em linha ativa
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className={cn(
          "min-h-0 flex-1 overflow-auto p-3 md:p-4 space-y-3 md:space-y-4"
        )}
        data-testid="container-messages"
      >
        {/* Botão para carregar mensagens mais antigas */}
        {hasMoreMessages && !isLoading && (
          <div className="flex justify-center py-2">
            <button
              onClick={loadOlderMessages}
              disabled={isLoadingOlder}
              className="text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-full border border-border hover:border-primary/50 flex items-center gap-1.5"
            >
              {isLoadingOlder ? (
                <>
                  <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Carregando...
                </>
              ) : (
                <>↑ Carregar mensagens anteriores</>
              )}
            </button>
          </div>
        )}
        {/* Filtrar mensagens de sistema/eco que vieram de integrações antigas,
            por exemplo textos \"[Mensagem n\u00e3o suportada]\" */}
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : allMessages.filter((m) => {
            if (m.mediaType) return true;
            const t = m.text?.toLowerCase() || "";
            // esconde mensagens de placeholder como \"[mensagem n\u00e3o suportada]\"
            return !(t.includes("mensagem") && t.includes("suportada"));
          }).length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
            </div>
          </div>
        ) : (
          allMessages
            .filter((m) => {
              if (m.mediaType) return true;
              const t = m.text?.toLowerCase() || "";
              return !(t.includes("mensagem") && t.includes("suportada"));
            })
            .map((message) => (
            <div
              key={message.id}
              className={`flex group ${message.fromMe ? "justify-end" : "justify-start"}`}
              data-testid={`message-${message.id}`}
            >
              <div
                className={`max-w-[85%] md:max-w-md rounded-md px-3 py-2 md:px-4 ${
                  message.fromMe
                    ? "bg-primary text-primary-foreground ml-auto"
                    : "bg-muted mr-auto"
                }`}
              >
                {message.isFromAgent && (
                  <div className="flex items-center gap-1 mb-1">
                    <Bot className="w-3 h-3 text-primary" />
                    <span className="text-xs font-semibold text-primary">Agente IA</span>
                  </div>
                )}
                
                {/* Render media content */}
                {message.mediaType === "image" && message.mediaUrl ? (
                  <MessageImage 
                    src={message.mediaUrl} 
                    caption={message.mediaCaption}
                    alt="Imagem do WhatsApp"
                  />
                ) : message.mediaType === "audio" && message.mediaUrl ? (
                  <div className="space-y-2">
                    <MessageAudio 
                      src={message.mediaUrl}
                      duration={message.mediaDuration}
                      fromMe={message.fromMe}
                    />
                    {message.text && !isAudioPlaceholderText(message.text) && (
                      <p className="text-sm whitespace-pre-wrap break-words italic opacity-80">
                        📝 {message.text.replace(/^\[ÁUDIO ENVIADO PELO AGENTE\]:\s*/i, '')}
                      </p>
                    )}
                  </div>
                ) : message.mediaType === "video" && message.mediaUrl ? (
                  <MessageVideo 
                    src={message.mediaUrl}
                    caption={message.mediaCaption}
                    duration={message.mediaDuration}
                    fromMe={message.fromMe}
                  />
                ) : message.mediaType === "document" && message.mediaUrl ? (
                  <MessageDocument 
                    src={message.mediaUrl}
                    fileName={message.text?.replace(/^📄\s*/, '') || "Documento"}
                    mimeType={message.mediaMimeType || undefined}
                    caption={message.mediaCaption}
                    fromMe={message.fromMe}
                  />
                ) : message.mediaType === "image" && !message.mediaUrl ? (
                  /* Imagem sem URL - mostrar placeholder COM descrição da IA se disponível */
                  <div className={`space-y-2 p-3 rounded-lg ${
                    message.fromMe 
                      ? "bg-white/10" 
                      : "bg-gray-100"
                  }`}>
                    <div className="flex items-center gap-3">
                      {/* Botão de Play/Visualizar - clica para baixar e ver */}
                      <button
                        onClick={() => redownloadMediaMutation.mutate(message.messageId)}
                        disabled={redownloadingMessageId === message.messageId}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                          message.fromMe 
                            ? "bg-white/20 hover:bg-white/30" 
                            : "bg-gray-200 hover:bg-gray-300"
                        } ${redownloadingMessageId === message.messageId ? "animate-pulse" : ""}`}
                      >
                        {redownloadingMessageId === message.messageId ? (
                          <Loader2 className={`h-5 w-5 animate-spin ${message.fromMe ? "text-white" : "text-gray-600"}`} />
                        ) : (
                          <span className="text-xl">🖼️</span>
                        )}
                      </button>
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${
                          message.fromMe ? "text-white" : "text-gray-900"
                        }`}>
                          Imagem {message.fromMe ? "enviada" : "recebida"}
                        </p>
                        <p className={`text-xs ${
                          message.fromMe ? "text-white/60" : "text-gray-500"
                        }`}>
                          Clique para baixar novamente
                        </p>
                      </div>
                    </div>
                    {/* Mostrar descrição da IA ou caption se disponível */}
                    {(message.text || message.mediaCaption) && (
                      <div className={`border-l-2 pl-3 ${
                        message.fromMe ? "border-white/30" : "border-gray-300"
                      }`}>
                        <p className={`text-xs font-medium mb-1 ${
                          message.fromMe ? "text-white/70" : "text-gray-500"
                        }`}>
                          {message.mediaCaption ? "📝 Legenda:" : "👁️ Descrição da IA:"}
                        </p>
                        <p className={`text-sm whitespace-pre-wrap break-words italic ${
                          message.fromMe ? "text-white/90" : "text-gray-700"
                        }`}>
                          "{message.mediaCaption || message.text}"
                        </p>
                      </div>
                    )}
                  </div>
                ) : message.mediaType === "document" && !message.mediaUrl ? (
                  /* Documento sem URL - mostrar placeholder COM nome e legenda se disponível */
                  <div className={`space-y-2 p-3 rounded-lg ${
                    message.fromMe 
                      ? "bg-white/10" 
                      : "bg-gray-100"
                  }`}>
                    <div className="flex items-center gap-3">
                      {/* Botão de Download - clica para baixar */}
                      <button
                        onClick={() => redownloadMediaMutation.mutate(message.messageId)}
                        disabled={redownloadingMessageId === message.messageId}
                        className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all ${
                          message.fromMe 
                            ? "bg-white/20 hover:bg-white/30" 
                            : "bg-gray-200 hover:bg-gray-300"
                        } ${redownloadingMessageId === message.messageId ? "animate-pulse" : ""}`}
                      >
                        {redownloadingMessageId === message.messageId ? (
                          <Loader2 className={`h-5 w-5 animate-spin ${message.fromMe ? "text-white" : "text-gray-600"}`} />
                        ) : (
                          <span className="text-xl">📄</span>
                        )}
                      </button>
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${
                          message.fromMe ? "text-white" : "text-gray-900"
                        }`}>
                          {message.text?.replace(/^📄\s*/, '').replace(/^\[Documento.*\]\s*/, '') || "Documento"}
                        </p>
                        <p className={`text-xs ${
                          message.fromMe ? "text-white/60" : "text-gray-500"
                        }`}>
                          {message.mediaMimeType?.split('/').pop()?.toUpperCase() || "DOC"} • Clique para baixar
                        </p>
                      </div>
                    </div>
                    {/* Mostrar caption se disponível */}
                    {message.mediaCaption && (
                      <div className={`border-l-2 pl-3 ${
                        message.fromMe ? "border-white/30" : "border-gray-300"
                      }`}>
                        <p className={`text-xs font-medium mb-1 ${
                          message.fromMe ? "text-white/70" : "text-gray-500"
                        }`}>
                          📝 Descrição:
                        </p>
                        <p className={`text-sm whitespace-pre-wrap break-words italic ${
                          message.fromMe ? "text-white/90" : "text-gray-700"
                        }`}>
                          "{message.mediaCaption}"
                        </p>
                      </div>
                    )}
                  </div>
                ) : message.mediaType === "video" && !message.mediaUrl ? (
                  /* Vídeo sem URL - mostrar placeholder COM legenda se disponível */
                  <div className={`space-y-2 p-3 rounded-lg ${
                    message.fromMe 
                      ? "bg-white/10" 
                      : "bg-gray-100"
                  }`}>
                    <div className="flex items-center gap-3">
                      {/* Botão de Play - clica para baixar e ver */}
                      <button
                        onClick={() => redownloadMediaMutation.mutate(message.messageId)}
                        disabled={redownloadingMessageId === message.messageId}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                          message.fromMe 
                            ? "bg-white/20 hover:bg-white/30" 
                            : "bg-gray-200 hover:bg-gray-300"
                        } ${redownloadingMessageId === message.messageId ? "animate-pulse" : ""}`}
                      >
                        {redownloadingMessageId === message.messageId ? (
                          <Loader2 className={`h-5 w-5 animate-spin ${message.fromMe ? "text-white" : "text-gray-600"}`} />
                        ) : (
                          <span className="text-xl">▶️</span>
                        )}
                      </button>
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${
                          message.fromMe ? "text-white" : "text-gray-900"
                        }`}>
                          Vídeo {message.fromMe ? "enviado" : "recebido"}
                        </p>
                        <p className={`text-xs ${
                          message.fromMe ? "text-white/60" : "text-gray-500"
                        }`}>
                          {message.mediaDuration 
                            ? `${Math.floor(message.mediaDuration / 60)}:${(message.mediaDuration % 60).toString().padStart(2, '0')} • ` 
                            : ""}Clique ▶️ para baixar
                        </p>
                      </div>
                    </div>
                    {/* Mostrar legenda ou texto se disponível */}
                    {(message.mediaCaption || message.text) && (
                      <div className={`border-l-2 pl-3 ${
                        message.fromMe ? "border-white/30" : "border-gray-300"
                      }`}>
                        <p className={`text-xs font-medium mb-1 ${
                          message.fromMe ? "text-white/70" : "text-gray-500"
                        }`}>
                          📝 Legenda:
                        </p>
                        <p className={`text-sm whitespace-pre-wrap break-words italic ${
                          message.fromMe ? "text-white/90" : "text-gray-700"
                        }`}>
                          "{message.mediaCaption || message.text}"
                        </p>
                      </div>
                    )}
                  </div>
                ) : message.mediaType === "audio" && !message.mediaUrl ? (
                  /* Áudio sem URL - mostrar placeholder COM transcrição e botão de play */
                  <div className={`space-y-2 p-3 rounded-lg ${
                    message.fromMe 
                      ? "bg-white/10" 
                      : "bg-gray-100"
                  }`}>
                    <div className="flex items-center gap-3">
                      {/* Botão de Play - clica para baixar e ouvir */}
                      <button
                        onClick={() => redownloadMediaMutation.mutate(message.messageId)}
                        disabled={redownloadingMessageId === message.messageId}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                          message.fromMe 
                            ? "bg-white/20 hover:bg-white/30" 
                            : "bg-gray-200 hover:bg-gray-300"
                        } ${redownloadingMessageId === message.messageId ? "animate-pulse" : ""}`}
                      >
                        {redownloadingMessageId === message.messageId ? (
                          <Loader2 className={`h-5 w-5 animate-spin ${message.fromMe ? "text-white" : "text-gray-600"}`} />
                        ) : (
                          <span className="text-xl">▶️</span>
                        )}
                      </button>
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${
                          message.fromMe ? "text-white" : "text-gray-900"
                        }`}>
                          Áudio {message.fromMe ? "enviado" : "recebido"}
                        </p>
                        <p className={`text-xs ${
                          message.fromMe ? "text-white/60" : "text-gray-500"
                        }`}>
                          {message.mediaDuration 
                            ? `${Math.floor(message.mediaDuration / 60)}:${(message.mediaDuration % 60).toString().padStart(2, '0')} • ` 
                            : ""}Clique ▶️ para baixar
                        </p>
                      </div>
                    </div>
                    {/* Mostrar transcrição do áudio se disponível */}
                    {message.text && !isAudioPlaceholderText(message.text) && (
                      <div className={`border-l-2 pl-3 ${
                        message.fromMe ? "border-white/30" : "border-gray-300"
                      }`}>
                        <p className={`text-xs font-medium mb-1 ${
                          message.fromMe ? "text-white/70" : "text-gray-500"
                        }`}>
                          📝 Transcrição:
                        </p>
                        <p className={`text-sm whitespace-pre-wrap break-words italic ${
                          message.fromMe ? "text-white/90" : "text-gray-700"
                        }`}>
                          "{message.text.replace(/^\[ÁUDIO ENVIADO PELO AGENTE\]:\s*/i, '')}"
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {String(message.text || "").match(/^\*([^*]+)\*:\s*([\s\S]*)/) ? (
                      <>
                        <span className="font-bold">{String(message.text || "").match(/^\*([^*]+)\*:/)?.[1]}:</span>
                        {" " + String(message.text || "").replace(/^\*([^*]+)\*:\s*/, "")}
                      </>
                    ) : (
                      message.text
                    )}
                  </p>
                )}
                
                {/* Footer da mensagem com horário e botão encaminhar */}
                <div className="flex items-center justify-between mt-1 gap-2">
                  <div className="flex items-center gap-1.5">
                    <p
                      className={`text-xs ${
                        message.fromMe ? "text-primary-foreground/70" : "text-muted-foreground"
                      }`}
                    >
                      {format(new Date(message.timestamp), "HH:mm", { locale: ptBR })}
                    </p>
                    {message.fromMe && String(message.status || "").toLowerCase() === "sending" && (
                      <span className="text-[10px] text-primary-foreground/65">Enviando...</span>
                    )}
                    {message.fromMe && String(message.status || "").toLowerCase() === "failed" && (
                      <span className="text-[10px] font-medium text-red-100">Falhou</span>
                    )}
                  </div>
                  {/* Botão encaminhar */}
                  <button
                    onClick={() => {
                      setForwardingMessage(message);
                      setForwardDialogOpen(true);
                    }}
                    className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-black/10 ${
                      message.fromMe ? "text-primary-foreground/70 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Encaminhar mensagem"
                  >
                    <Share2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input - Fixed acima do menu no mobile */}
      <div
        className={cn(
          "p-3 md:p-4 border-t bg-background z-20",
          isMobile && "border-border/80 bg-background/95 supports-[backdrop-filter]:bg-background/85"
        )}
      >
        {isConversationClosed && (
          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {conversationLockedMessage}
          </div>
        )}
        {isConversationConnectionDisconnected && !isConversationClosed && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            Sua conexão está instável. Aguarde ou verifique a linha {conversationConnectionLabel} para responder.
          </div>
        )}
        {/* Se está gravando áudio, mostra a barra de gravação */}
        {isRecordingAudio ? (
          <UserAudioRecorder
            onSend={handleSendAudio}
            onCancel={() => setIsRecordingAudio(false)}
            disabled={sendAudioMutation.isPending || isComposerDisabled}
          />
        ) : (
          <div className="flex items-center gap-2">
            {/* Botões de ação à esquerda - escondidos no mobile para dar mais espaço */}
            <div className="hidden md:flex items-center gap-1">
              <UserMediaUploader
                onUpload={handleSendMedia}
                disabled={sendMediaMutation.isPending || isComposerDisabled}
              />
              <UserQuickReplies
                onSelect={handleQuickReplySelect}
                disabled={isComposerDisabled}
              />
              {!isGroupConversation && (
                <UserAIMessageGenerator
                  onGenerate={handleAIGenerate}
                  contactName={conversation?.contactName || undefined}
                  lastMessages={allMessages?.slice(-5).map(m => m.text || "").filter(Boolean) || []}
                  disabled={isComposerDisabled}
                />
              )}
            </div>
            
            {/* Botão de anexo no mobile */}
            <div className="md:hidden">
              <UserMediaUploader
                onUpload={handleSendMedia}
                disabled={sendMediaMutation.isPending || isComposerDisabled}
              />
            </div>
            
            {/* Input de texto */}
            <Textarea
              placeholder={
                isConversationClosed
                  ? "Conversa encerrada. O próximo atendimento será em uma nova conversa."
                  : isConversationConnectionDisconnected
                    ? "Reconecte a conexão desta conversa ou abra uma nova conversa em linha ativa."
                    : "Digite sua mensagem..."
              }
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={isComposerDisabled}
              className="resize-none min-h-11 max-h-32 flex-1 text-base"
              style={{ fontSize: '16px' }} // Prevent iOS zoom
              data-testid="input-message"
            />
            
            {/* Botões de ação à direita */}
            <div className="flex items-center gap-1">
              {/* Botão de gravar áudio (aparece quando não tem texto) */}
              {!messageText.trim() && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsRecordingAudio(true)}
                  disabled={sendAudioMutation.isPending || isComposerDisabled}
                  className={cn(
                    "text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors",
                    isMobile && "h-11 w-11"
                  )}
                  title="Gravar áudio"
                  type="button"
                >
                  <Mic className={cn("w-5 h-5", isMobile && "w-6 h-6")} />
                </Button>
              )}
              
              {/* Botão de enviar (aparece quando tem texto) */}
              {messageText.trim() && (
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!messageText.trim() || sendMutation.isPending || isComposerDisabled}
                  data-testid="button-send"
                  className={isMobile ? "h-11 w-11" : ""}
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Avatar Modal */}
      <Drawer open={mobileActionsOpen} onOpenChange={setMobileActionsOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Ações da conversa</DrawerTitle>
            <DrawerDescription>
              Controles rápidos para atendimento, IA e follow-up.
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-3 overflow-y-auto px-4 pb-4">
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {isGroupConversation ? "Modo do grupo" : "IA nesta conversa"}
                  </p>
                  <p className="text-sm font-medium">
                    {isGroupConversation ? "Somente manual" : isAgentEnabled ? "Ativada" : agentStatusLabel}
                  </p>
                </div>
                {!isGroupConversation && (
                  <Switch
                    checked={isConversationAgentEnabled}
                    onCheckedChange={(checked) => toggleAgentMutation.mutate(!checked)}
                    disabled={toggleAgentMutation.isPending || isConversationClosed}
                    data-testid="switch-agent-chat-drawer"
                  />
                )}
              </div>
            </div>

            {conversationId && (
              <ConversationTransfer
                conversationId={conversationId}
                currentSectorId={(conversation as any)?.sector_id || null}
                currentSectorName={(conversation as any)?.sector_name || null}
                triggerClassName="w-full justify-start rounded-xl h-11"
              />
            )}

            {!isGroupConversation && (
              <>
                <Button
                  variant={followupStatus?.active ? "default" : "outline"}
                  className="h-11 w-full justify-start rounded-xl"
                  onClick={() => toggleFollowupMutation.mutate(!followupStatus?.active)}
                  disabled={toggleFollowupMutation.isPending || isConversationClosed}
                  data-testid="button-followup-toggle-mobile"
                >
                  <Sparkles className={cn("mr-2 h-4 w-4", followupStatus?.active ? "text-yellow-500" : "opacity-50")} />
                  {followupStatus?.active ? "Desativar follow-up" : "Ativar follow-up"}
                </Button>

                <Button
                  variant="outline"
                  className="h-11 w-full justify-start rounded-xl"
                  onClick={() => {
                    setMobileActionsOpen(false);
                    setScheduleDialogOpen(true);
                  }}
                  disabled={isConversationClosed}
                  data-testid="button-schedule-followup-mobile"
                >
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  Agendar follow-up
                </Button>
              </>
            )}

            <Button
              variant="outline"
              className="h-11 w-full justify-start rounded-xl"
              onClick={() => {
                setMobileActionsOpen(false);
                setMessageScheduleDialogOpen(true);
              }}
              disabled={isConversationClosed}
              data-testid="button-schedule-message-mobile"
            >
              <Clock className="mr-2 h-4 w-4" />
              Agendar mensagem
            </Button>

            {!isGroupConversation && (
              <Button
                variant="outline"
                className="h-11 w-full justify-start rounded-xl border-purple-500/30 bg-purple-500/5"
                onClick={() => respondWithAIMutation.mutate()}
                disabled={respondWithAIMutation.isPending || !isAgentEnabled || isConversationClosed}
                data-testid="button-respond-with-ai-mobile"
              >
                {respondWithAIMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4 text-purple-500" />
                )}
                Responder com IA
              </Button>
            )}

            {onOpenContactPanel && !isContactPanelOpen && (
              <Button
                variant="outline"
                className="h-11 w-full justify-start rounded-xl"
                onClick={() => {
                  setMobileActionsOpen(false);
                  onOpenContactPanel();
                }}
                data-testid="button-open-contact-panel-mobile"
              >
                <User className="mr-2 h-4 w-4" />
                Detalhes
              </Button>
            )}

            <Button
              variant="outline"
              className="h-11 w-full justify-start rounded-xl text-destructive hover:text-destructive"
              onClick={() => {
                setMobileActionsOpen(false);
                setMobileCloseDialogOpen(true);
              }}
              disabled={closeConversationMutation.isPending || isConversationClosed}
              data-testid="button-close-call-mobile"
            >
              {closeConversationMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PhoneOff className="mr-2 h-4 w-4" />
              )}
              Encerrar
            </Button>

            {!isConversationClosed && (
              <Button
                variant="outline"
                className="h-11 w-full justify-start rounded-xl"
                onClick={() => {
                  setMobileActionsOpen(false);
                  setMobileClearDialogOpen(true);
                }}
                disabled={clearConversationMutation.isPending}
                data-testid="button-clear-conversation-mobile"
              >
                {clearConversationMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Limpar conversa
              </Button>
            )}
          </div>

          <DrawerFooter>
            <Button variant="outline" onClick={() => setMobileActionsOpen(false)}>
              Fechar
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={mobileCloseDialogOpen} onOpenChange={setMobileCloseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso encerra o chamado internamente, cancela o follow-up desta conversa e deixa a IA pronta para o próximo atendimento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => closeConversationMutation.mutate()}
              disabled={closeConversationMutation.isPending}
            >
              {closeConversationMutation.isPending ? "Encerrando..." : "Encerrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={mobileClearDialogOpen} onOpenChange={setMobileClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar conversa atual?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga o histórico operacional desta conversa, zera o contexto que a IA analisa e cancela respostas pendentes. A IA não será reativada nem alterada neste processo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearConversationMutation.mutate()}
              disabled={clearConversationMutation.isPending}
            >
              {clearConversationMutation.isPending ? "Limpando..." : "Limpar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Avatar Modal */}
      <Dialog open={avatarModalOpen} onOpenChange={setAvatarModalOpen}>
        <DialogContent className="max-w-md bg-black border-none">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-gray-800 pb-4">
            <DialogTitle className="text-white font-medium">
              {avatarModalName}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-white hover:bg-transparent"
              onClick={() => setAvatarModalOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </DialogHeader>
          <div className="flex items-center justify-center py-6">
            <img
              src={avatarModalImage}
              alt={avatarModalName}
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Agendamento Manual */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="w-5 h-5" />
              Agendar Follow-up Manual
            </DialogTitle>
            <DialogDescription>
              Agende um lembrete para entrar em contato com este cliente em uma data específica.
              Ideal para quando o cliente pede para ligar em outro dia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="schedule-date">Data</Label>
                <Input
                  id="schedule-date"
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={getBrazilDateInputValue()}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="schedule-time">Horário</Label>
                <Input
                  id="schedule-time"
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-note">Observação (opcional)</Label>
              <Input
                id="schedule-note"
                placeholder="Ex: Cliente pediu para ligar às 14h"
                value={scheduleNote}
                onChange={(e) => setScheduleNote(e.target.value)}
              />
            </div>
            
            {/* Atalhos rápidos */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Atalhos rápidos</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const tomorrow = getBrazilNowDate();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setScheduleDate(getBrazilDateInputValue(tomorrow));
                    setScheduleTime("09:00");
                  }}
                >
                  Amanhã 9h
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const tomorrow = getBrazilNowDate();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setScheduleDate(getBrazilDateInputValue(tomorrow));
                    setScheduleTime("14:00");
                  }}
                >
                  Amanhã 14h
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const nextWeek = getBrazilNowDate();
                    nextWeek.setDate(nextWeek.getDate() + 7);
                    setScheduleDate(getBrazilDateInputValue(nextWeek));
                    setScheduleTime("10:00");
                  }}
                >
                  Próxima semana
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const in2Hours = getBrazilNowDate();
                    in2Hours.setHours(in2Hours.getHours() + 2);
                    setScheduleDate(getBrazilDateInputValue(in2Hours));
                    setScheduleTime(in2Hours.toTimeString().slice(0, 5));
                  }}
                >
                  Em 2 horas
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setScheduleDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!scheduleDate || !scheduleTime) {
                  toast({
                    title: "Campos obrigatórios",
                    description: "Preencha a data e horário do agendamento",
                    variant: "destructive",
                  });
                  return;
                }
                const scheduledFor = buildBrazilDateTimeRequest(scheduleDate, scheduleTime);
                scheduleFollowupMutation.mutate({ scheduledFor, note: scheduleNote || undefined });
              }}
              disabled={scheduleFollowupMutation.isPending}
            >
              {scheduleFollowupMutation.isPending ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  Agendando...
                </>
              ) : (
                <>
                  <CalendarPlus className="w-4 h-4 mr-2" />
                  Agendar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de encaminhar mensagem */}
      <Dialog open={forwardDialogOpen} onOpenChange={(open) => {
        setForwardDialogOpen(open);
        if (!open) {
          setForwardContactSearch("");
          setForwardTargetNumber("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              Encaminhar Mensagem
            </DialogTitle>
            <DialogDescription>
              Selecione um contato para encaminhar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Preview da mensagem */}
            {forwardingMessage && (
              <div className="bg-muted p-3 rounded-lg text-sm max-h-24 overflow-auto">
                {forwardingMessage.mediaType === "image" && "🖼️ Imagem"}
                {forwardingMessage.mediaType === "video" && "🎬 Vídeo"}
                {forwardingMessage.mediaType === "audio" && "🎵 Áudio"}
                {forwardingMessage.mediaType === "document" && "📄 Documento"}
                {forwardingMessage.text && (
                  <p className="text-muted-foreground mt-1 line-clamp-2">
                    {forwardingMessage.text}
                  </p>
                )}
              </div>
            )}
            
            {/* Busca de contatos */}
            <div className="space-y-2">
              <Label>Buscar contato</Label>
              <Input
                placeholder={canViewPhoneNumbers ? "Buscar por nome ou número..." : "Buscar por nome..."}
                value={forwardContactSearch}
                onChange={(e) => setForwardContactSearch(e.target.value)}
              />
            </div>

            {/* Lista de contatos */}
            <div className="max-h-60 overflow-auto border rounded-lg">
              {filteredForwardContacts.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {forwardContacts.length === 0 
                    ? "Nenhum contato disponível" 
                    : "Nenhum contato encontrado"}
                </div>
              ) : (
                filteredForwardContacts.map((contact) => (
                  <button
                    key={contact.id}
                    className="w-full p-3 flex items-center gap-3 hover:bg-muted transition-colors text-left border-b last:border-b-0"
                    onClick={() => handleForwardMessage({ targetConversationId: contact.id })}
                    disabled={forwarding}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {getConversationDisplayName(contact).substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {getConversationDisplayName(contact)}
                      </p>
                      {canViewPhoneNumbers && contact.contactName && (
                        <p className="text-xs text-muted-foreground truncate">
                          {getConversationDisplayNumber(contact)}
                        </p>
                      )}
                    </div>
                    {forwarding && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Campo manual para número */}
            {canViewPhoneNumbers && (
              <div className="space-y-2 border-t pt-2">
                <Label className="text-xs text-muted-foreground">Ou digite um número</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="5511999999999"
                    value={forwardTargetNumber}
                    onChange={(e) => setForwardTargetNumber(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleForwardMessage()}
                    disabled={forwarding || !forwardTargetNumber.trim()}
                  >
                    {forwarding ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Share2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setForwardDialogOpen(false)}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );}
