import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, MessageCircle, Smartphone, X, Tags, Filter, CheckCheck, Circle, Mail, MailOpen, MessageSquarePlus, Archive, ArchiveRestore, Loader2, Bot, Clock, Bell, Volume2, Users } from "lucide-react";
import { differenceInCalendarDays, format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Conversation, WhatsappConnection } from "@shared/schema";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type React from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { getAuthToken } from "@/lib/supabase";
import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagBadges, ConversationTagsModal } from "./conversation-tags";
import type { Tag as ConversationTag } from "./conversation-tags";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AttentionPriorityBadge } from "@/components/attention-summary";
import {
  getConversationDisplayName,
  getConversationDisplayNumber,
} from "@/lib/conversation-identity";
import { resolveMemberPermissions } from "@/lib/member-permissions";
import {
  buildConversationsListPageState,
  type ConversationsQueryResult,
} from "./conversations-list-state";
import { openAppRealtimeConnection, type AppRealtimeConnection } from "@/lib/app-realtime";
import { getRenderableContactAvatar, markContactAvatarFailed } from "@/lib/contact-avatar";

// Conversation with tags
interface ConversationWithTags extends Conversation {
  tags?: ConversationTag[];
  groupId?: string;
  participantsCount?: number;
  groupDescription?: string | null;
  groupAnnounce?: boolean;
  groupIsCommunity?: boolean;
  groupIsCommunityAnnounce?: boolean;
  groupLinkedParent?: string | null;
  groupIsAdmin?: boolean;
  isGroupEntry?: boolean;
  isGroupPlaceholder?: boolean;
}

// Resultado de busca fulltext (inclui snippet de mensagem)
interface SearchResult extends ConversationWithTags {
  snippet?: string | null;
  snippetFromMe?: boolean;
  groupId?: string;
  participantsCount?: number;
  groupDescription?: string | null;
  groupAnnounce?: boolean;
  groupIsCommunity?: boolean;
  groupIsCommunityAnnounce?: boolean;
  groupLinkedParent?: string | null;
  groupIsAdmin?: boolean;
  isGroupEntry?: boolean;
  isGroupPlaceholder?: boolean;
}

interface WhatsAppGroup {
  id: string;
  name: string;
  participantsCount: number;
  description?: string;
  owner?: string;
  createdAt?: number;
  isAdmin?: boolean;
  announce?: boolean;
  isCommunity?: boolean;
  isCommunityAnnounce?: boolean;
  linkedParent?: string;
  connectionId?: string;
}

const TECHNICAL_STUB_MARKERS = [
  "mensagem incompleta",
  "[mensagem de protocolo]",
  "[mensagem nao suportada]",
];

function normalizeTechnicalStubText(text?: string | null): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isTechnicalStubText(text?: string | null): boolean {
  const normalized = normalizeTechnicalStubText(text);
  if (!normalized) return false;

  return TECHNICAL_STUB_MARKERS.some((marker) => normalized.includes(marker));
}

function normalizeGroupJid(value?: string | null): string {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";
  if (rawValue.endsWith("@g.us")) return rawValue;
  if (rawValue.includes("@")) return rawValue;
  return `${rawValue}@g.us`;
}

function isGroupConversationLike(
  conversation: Pick<Conversation, "remoteJid" | "jidSuffix"> | null | undefined,
): boolean {
  return Boolean(
    conversation?.jidSuffix === "g.us" ||
      String(conversation?.remoteJid || "").trim().endsWith("@g.us"),
  );
}

interface ConversationsListProps {
  connectionId?: string;
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

export function ConversationsList({
  connectionId,
  selectedConversationId,
  onSelectConversation,
}: ConversationsListProps) {
  const { user } = useAuth();
  const isMemberSession = typeof window !== "undefined" && !!window.localStorage.getItem("memberToken");
  const memberPermissions = resolveMemberPermissions((user as any)?.memberData?.permissions);
  const canViewPhoneNumbers = !isMemberSession || memberPermissions.canViewPhoneNumbers;
  const canEditConversationMetadata = !isMemberSession || memberPermissions.canEditContacts;
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);

  // ===== Sistema de Notificações (Parte 9) =====
  const {
    notify,
    soundEnabled,
    pushEnabled,
    pushPermission,
    enableSound,
    setPushEnabled,
    requestPushPermission,
  } = useNotifications();
  // Anti-spam: registrar IDs de mensagens já notificadas
  const notifiedMessageIds = useRef<Set<string>>(new Set());
  // Referência ao selectedConversationId atual (evita closure stale)
  const selectedConvRef = useRef<string | null>(null);
  useEffect(() => { selectedConvRef.current = selectedConversationId; }, [selectedConversationId]);
  // =============================================

  // ===== Busca fulltext (Parte 9) =====
  // debouncedQuery é o termo enviado à API após 350ms de pausa
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [conversationScope, setConversationScope] = useState<"conversations" | "groups">("conversations");

  // Dispara busca fulltext quando searchQuery tem ≥ 2 chars
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (conversationScope !== "conversations") {
      setDebouncedQuery("");
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    if (searchQuery.trim().length < 2) {
      setDebouncedQuery("");
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      setDebouncedQuery(searchQuery.trim());
      try {
        const memberToken = localStorage.getItem("memberToken");
        const supabaseToken = await getAuthToken();
        const token = memberToken || supabaseToken;
        const res = await fetch(
          `/api/conversations/search?q=${encodeURIComponent(searchQuery.trim())}&limit=30`,
          {
            credentials: "include",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("[Search] Erro na busca:", err);
      } finally {
        setIsSearching(false);
      }
    }, 350);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [conversationScope, searchQuery]);

  const isSearchMode = conversationScope === "conversations" && searchQuery.trim().length >= 2;
  // =====================================
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarModalImage, setAvatarModalImage] = useState<string | null>(null);
  const [avatarModalName, setAvatarModalName] = useState<string>("");
  
  // Status filter: "all" | "unread" | "replied" | "unreplied"
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "replied" | "unreplied" | "archived">("all");
  const [groupCategoryFilter, setGroupCategoryFilter] = useState<"all" | "announcements" | "communities">("all");
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());
  const [bulkTagDialogOpen, setBulkTagDialogOpen] = useState(false);
  const [bulkSelectedTagIds, setBulkSelectedTagIds] = useState<Set<string>>(new Set());
  
  // New contact dialog
  const [newContactDialogOpen, setNewContactDialogOpen] = useState(false);
  const [newContactNumber, setNewContactNumber] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [selectedNewContactConnectionId, setSelectedNewContactConnectionId] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  
  // Tag filter states
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagModalConversationId, setTagModalConversationId] = useState<string>("");
  const [tagModalCurrentTags, setTagModalCurrentTags] = useState<ConversationTag[]>([]);

  // Paginação
  const PAGE_SIZE = 50;
  const [allConversations, setAllConversations] = useState<ConversationWithTags[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAllConversations, setLoadingAllConversations] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [selectedConnectionFilter, setSelectedConnectionFilter] = useState("all");

  const buildConversationsRequestUrl = useCallback(
    ({
      offset = 0,
      limit,
      tagId,
    }: {
      offset?: number;
      limit?: number;
      tagId?: string | null;
    } = {}) => {
      const params = new URLSearchParams();

      if (tagId) {
        params.set("tagId", tagId);
      }

      if (typeof limit === "number") {
        params.set("limit", String(limit));
        params.set("offset", String(offset));
      }

      if (selectedConnectionFilter !== "all") {
        params.set("connectionId", selectedConnectionFilter);
      }

      params.set("archived", statusFilter === "archived" ? "true" : "false");

      const query = params.toString();
      return query ? `/api/conversations-with-tags?${query}` : "/api/conversations-with-tags";
    },
    [selectedConnectionFilter, statusFilter],
  );

  const fetchConversationPage = useCallback(
    async (offset: number, tagId?: string | null) => {
      const memberToken = localStorage.getItem("memberToken");
      const supabaseToken = await getAuthToken();
      const token = memberToken || supabaseToken;
      const url = buildConversationsRequestUrl({
        offset,
        limit: PAGE_SIZE,
        tagId,
      });
      const response = await fetch(url, {
        credentials: "include",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch conversations");
      return response.json();
    },
    [PAGE_SIZE, buildConversationsRequestUrl],
  );

  // Buscar conversas com tags (paginado - primeira página)
  const { data: conversationsResult, isLoading } = useQuery<ConversationsQueryResult>({
    queryKey: ["/api/conversations-with-tags", selectedTagFilter, selectedConnectionFilter, statusFilter, "page0"],
    queryFn: async () => {
      const memberToken = localStorage.getItem("memberToken");
      const supabaseToken = await getAuthToken();
      const token = memberToken || supabaseToken;

      const url = buildConversationsRequestUrl({
        offset: 0,
        limit: PAGE_SIZE,
        tagId: selectedTagFilter,
      });
      const response = await fetch(url, {
        credentials: "include",
        headers: {
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch conversations");
      return response.json();
    },
    enabled: true, // ⚡ OTIMIZADO: Carregar imediatamente - API resolve connectionId server-side
    refetchInterval: isWebSocketConnected ? 60000 : 15000,
    staleTime: isWebSocketConnected ? 45000 : 10000,
  });

  useEffect(() => {
    const nextState = buildConversationsListPageState(conversationsResult as any);
    setAllConversations(nextState.conversations as ConversationWithTags[]);
    setHasMore(nextState.hasMore);
    setTotalCount(nextState.totalCount);
    setCurrentOffset(nextState.currentOffset);
  }, [conversationsResult]);

  // Função para carregar mais conversas
  const loadMoreConversations = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const memberToken = localStorage.getItem("memberToken");
      const supabaseToken = await getAuthToken();
      const token = memberToken || supabaseToken;

      const url = buildConversationsRequestUrl({
        offset: currentOffset,
        limit: PAGE_SIZE,
        tagId: selectedTagFilter,
      });
      const response = await fetch(url, {
        credentials: "include",
        headers: {
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) throw new Error("Failed to load more");
      const result = await response.json();
      
      if (result.data) {
        setAllConversations(prev => [...prev, ...result.data]);
        setHasMore(result.hasMore);
        setCurrentOffset(prev => prev + result.data.length);
      }
    } catch (error) {
      console.error("Erro ao carregar mais conversas:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const loadAllConversations = async () => {
    if (loadingAllConversations || loadingMore || !hasMore || selectedTagFilter) return;

    setLoadingAllConversations(true);
    try {
      let nextOffset = currentOffset;
      let nextHasMore: boolean = hasMore;
      let nextTotal = totalCount;
      let merged = [...allConversations];

      while (nextHasMore) {
        const result = await fetchConversationPage(nextOffset);
        const pageItems = Array.isArray(result?.data) ? result.data : [];

        if (pageItems.length === 0) {
          nextHasMore = false;
          break;
        }

        merged = [...merged, ...pageItems];
        nextOffset += pageItems.length;
        nextHasMore = Boolean(result.hasMore);
        nextTotal = typeof result.total === "number" ? result.total : nextTotal;
      }

      setAllConversations(merged);
      setCurrentOffset(nextOffset);
      setHasMore(nextHasMore);
      setTotalCount(nextTotal);
      toast({ title: "Todas as conversas foram carregadas" });
    } catch (error) {
      console.error("Erro ao carregar todas as conversas:", error);
      toast({
        title: "Erro ao carregar todas",
        description: "Não foi possível carregar todas as conversas.",
        variant: "destructive",
      });
    } finally {
      setLoadingAllConversations(false);
    }
  };
  
  // Alias para compatibilidade com o restante do código
  const conversationsWithTags = allConversations;
  
  // Buscar tags disponíveis para filtro
  const { data: availableTags = [] } = useQuery<ConversationTag[]>({
    queryKey: ["/api/tags"],
    enabled: true, // ⚡ OTIMIZADO: Carregar imediatamente
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });
  const { data: allConnections = [] } = useQuery<WhatsappConnection[]>({
    queryKey: ["/api/whatsapp/connections"],
    enabled: true,
    staleTime: 15000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (allConnections.length <= 1) {
      setSelectedConnectionFilter("all");
      return;
    }

    if (
      selectedConnectionFilter !== "all" &&
      !allConnections.some((connection) => connection.id === selectedConnectionFilter)
    ) {
      setSelectedConnectionFilter("all");
    }
  }, [allConnections, selectedConnectionFilter]);

  const connectionMetaById = useMemo(
    () => new Map(allConnections.map((conn) => [conn.id, conn])),
    [allConnections],
  );
  const connectedConnections = useMemo(
    () => allConnections.filter((conn) => conn.isConnected),
    [allConnections],
  );
  const orderedConnections = useMemo(
    () =>
      [...allConnections].sort((left, right) => {
        const connectedDelta = Number(right.isConnected) - Number(left.isConnected);
        if (connectedDelta !== 0) return connectedDelta;

        const primaryDelta = Number(right.isPrimary) - Number(left.isPrimary);
        if (primaryDelta !== 0) return primaryDelta;

        return (left.connectionName || "").localeCompare(right.connectionName || "");
      }),
    [allConnections],
  );
  const hasMultipleConnections = orderedConnections.length > 1;
  const preferredNewConversationConnectionId = useMemo(() => {
    const currentConnected = connectedConnections.find((conn) => conn.id === connectionId);
    if (currentConnected) return currentConnected.id;

    const primaryConnected = connectedConnections.find((conn) => conn.isPrimary);
    if (primaryConnected) return primaryConnected.id;

    return connectedConnections[0]?.id ?? "";
  }, [connectedConnections, connectionId]);
  const groupScopeRequiresConnectionSelection = false;
  const effectiveGroupConnectionId = useMemo(() => {
    if (selectedConnectionFilter !== "all") {
      return selectedConnectionFilter;
    }

    return "";
  }, [selectedConnectionFilter]);

  const {
    data: whatsappGroups = [],
    isLoading: isLoadingGroups,
  } = useQuery<WhatsAppGroup[]>({
    queryKey: ["/api/whatsapp/groups", effectiveGroupConnectionId || "auto"],
    enabled:
      conversationScope === "groups" &&
      connectedConnections.length > 0,
    retry: false,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (effectiveGroupConnectionId) {
        params.set("connectionId", effectiveGroupConnectionId);
      }
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const response = await apiRequest("GET", `/api/whatsapp/groups${suffix}`);
      return response.json();
    },
  });

  // WebSocket para atualização em tempo real
  useEffect(() => {
    let realtimeConnection: AppRealtimeConnection | null = null;
    let cancelled = false;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connectWebSocket = async () => {
      try {
        const memberToken = localStorage.getItem("memberToken");
        const getRealtimeToken = async () => memberToken || await getAuthToken();
        const token = await getRealtimeToken();

        if (!token) {
          console.error("Sem token de autenticação para WebSocket de conversas");
          return;
        }

        if (cancelled) return;

        realtimeConnection = await openAppRealtimeConnection({
          scope: "user",
          getToken: getRealtimeToken,
          onOpen: () => {
            console.log("WebSocket conectado para conversas");
            setIsWebSocketConnected(true);
          },

          onEvent: (data) => {
            console.log("WebSocket message:", data);
            
            // ⚡ KEEP-ALIVE: Responder pings do servidor para manter conexão viva
            
            console.log("WebSocket message:", data);

            // 🔥 Real-time update: atualizar conversa inline sem refetch completo
            if (
              (data.type === "new_message" ||
                data.type === "message_sent" ||
                data.type === "conversation_attention_updated") &&
              data.conversationUpdate
            ) {
              const update = data.conversationUpdate;
              const matchesSelectedConnection =
                selectedConnectionFilter === "all" ||
                !update.connectionId ||
                update.connectionId === selectedConnectionFilter;

              // 🔔 Notificação de nova mensagem (Parte 9)
              // Apenas para mensagens recebidas (não enviadas por mim), quando conversa não está aberta
              const msgId = data.messageId || data.id || `${update.id}-${update.lastMessageTime}`;
              const isFromMe = update.lastMessageFromMe === true || data.type === "message_sent";
              const isCurrentConv = selectedConvRef.current === update.id;
              if (!isFromMe && !isCurrentConv && !notifiedMessageIds.current.has(msgId)) {
                notifiedMessageIds.current.add(msgId);
                // Limpar cache anti-spam após 30s para não crescer indefinidamente
                setTimeout(() => notifiedMessageIds.current.delete(msgId), 30000);
                const contactName = getConversationDisplayName({
                  id: update.id,
                  contactName: update.contactName,
                  contactNumber: canViewPhoneNumbers ? update.contactNumber : "",
                  remoteJid: canViewPhoneNumbers ? update.remoteJid : null,
                } as Conversation);
                const msgText = update.lastMessageText || "Nova mensagem";
                notify({
                  title: `💬 ${contactName}`,
                  body: msgText.length > 80 ? msgText.slice(0, 77) + "…" : msgText,
                  tag: `msg-${update.id}`,
                  url: `/conversas/${update.id}`,
                });
              }

              if (!matchesSelectedConnection) {
                return;
              }

              setAllConversations(prev => {
                const existingIdx = prev.findIndex(c => c.id === update.id);
                if (existingIdx >= 0) {
                  // Atualizar conversa existente e mover pro topo
                  const updated = {
                    ...prev[existingIdx],
                    remoteJid: canViewPhoneNumbers ? update.remoteJid || prev[existingIdx].remoteJid : prev[existingIdx].remoteJid,
                    jidSuffix: update.jidSuffix || prev[existingIdx].jidSuffix,
                    lastMessageText: update.lastMessageText,
                    lastMessageTime: update.lastMessageTime,
                    lastMessageFromMe: update.lastMessageFromMe,
                    unreadCount: update.unreadCount,
                    contactName: update.contactName || prev[existingIdx].contactName,
                    contactAvatar: update.contactAvatar || prev[existingIdx].contactAvatar,
                    attentionPriority: update.attentionPriority,
                    attentionReason: update.attentionReason,
                    attentionConfidence: update.attentionConfidence,
                    needsHumanAttention: update.needsHumanAttention,
                    attentionQualifiedAt: update.attentionQualifiedAt,
                  };
                  const newList = [...prev];
                  newList.splice(existingIdx, 1);
                  return [updated, ...newList];
                } else if (update.isNew) {
                  // Nova conversa: adicionar no topo
                  const newConv: ConversationWithTags = {
                    id: update.id,
                    connectionId: update.connectionId || connectionId || "",
                    contactNumber: canViewPhoneNumbers ? update.contactNumber : "",
                    contactName: update.contactName,
                    contactAvatar: update.contactAvatar,
                    lastMessageText: update.lastMessageText,
                    lastMessageTime: update.lastMessageTime,
                    lastMessageFromMe: update.lastMessageFromMe,
                    unreadCount: update.unreadCount || 1,
                    remoteJid: canViewPhoneNumbers ? update.remoteJid : null,
                    jidSuffix: update.jidSuffix || null,
                    hasReplied: false,
                    isArchived: false,
                    attentionPriority: update.attentionPriority || null,
                    attentionReason: update.attentionReason || null,
                    attentionConfidence: update.attentionConfidence || null,
                    needsHumanAttention: update.needsHumanAttention || false,
                    attentionQualifiedAt: update.attentionQualifiedAt || null,
                    tags: [],
                  } as unknown as ConversationWithTags;
                  return [newConv, ...prev];
                }
                return prev;
              });
              setTotalCount(prev => {
                if (update.isNew) return prev + 1;
                return prev;
              });
            } else if (
              data.type === "agent_response" ||
              data.type === "agent_auto_paused" ||
              data.type === "agent_auto_reactivated"
            ) {
              // Para eventos do agente, fazer refetch da primeira página
              queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
            }
          },

          onError: (error) => {
            console.error("Erro no WebSocket:", error);
            setIsWebSocketConnected(false);
          },

          onClose: () => {
            console.log("WebSocket desconectado, reconectando em 3s...");
            setIsWebSocketConnected(false);
          // Reconexão automática em 3 segundos
            if (!cancelled) {
              reconnectTimeout = setTimeout(() => {
                void connectWebSocket();
              }, 3000);
            }
          },

        });
      } catch (error) {
        console.error("Erro ao conectar WebSocket de conversas:", error);
        // Tentar reconectar em caso de erro
        if (!cancelled) {
          reconnectTimeout = setTimeout(() => {
            void connectWebSocket();
          }, 3000);
        }
      }
    };

    void connectWebSocket();

    return () => {
      cancelled = true;
      setIsWebSocketConnected(false);
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (realtimeConnection) {
        void realtimeConnection.close();
      }
    };
  }, [canViewPhoneNumbers, connectionId, notify, selectedConnectionFilter]);

  // Filtrar conversas de grupos e status no frontend (camada extra de segurança)
  const connectionScopedConversations = useMemo(() => {
    if (selectedConnectionFilter === "all") return conversationsWithTags;
    return conversationsWithTags.filter((conversation) => conversation.connectionId === selectedConnectionFilter);
  }, [conversationsWithTags, selectedConnectionFilter]);

  const individualConversations = connectionScopedConversations.filter((conv) => {
    if (isGroupConversationLike(conv)) return false;

    if (isMemberSession) return true;

    const number = conv.contactNumber;
    if (number.length < 10 || number.length > 15) return false;
    if (number.startsWith("120") || number.startsWith("status")) return false;
    return true;
  });
  const persistedGroupConversations = connectionScopedConversations.filter((conv) => isGroupConversationLike(conv));
  const persistedGroupConversationMap = useMemo(() => {
    return new Map(
      persistedGroupConversations
        .map((conversation) => {
          const groupJid = normalizeGroupJid(conversation.remoteJid);
          return [`${conversation.connectionId || ""}:${groupJid}`, conversation] as const;
        })
        .filter(([groupKey]) => groupKey.endsWith("@g.us")),
    );
  }, [persistedGroupConversations]);
  const groupConversations = useMemo<SearchResult[]>(() => {
    return whatsappGroups.map((group) => {
      const normalizedGroupId = normalizeGroupJid(group.id);
      const groupConnectionId = String(group.connectionId || "").trim();
      const existingConversation = persistedGroupConversationMap.get(`${groupConnectionId}:${normalizedGroupId}`);
      const groupNumber =
        normalizedGroupId.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") || "";
      return {
        ...(existingConversation || {}),
        id: existingConversation?.id || `group:${groupConnectionId || "auto"}:${normalizedGroupId}`,
        connectionId: existingConversation?.connectionId || groupConnectionId,
        contactNumber: existingConversation?.contactNumber || groupNumber,
        remoteJid: normalizedGroupId,
        jidSuffix: "g.us",
        contactName: existingConversation?.contactName || group.name,
        lastMessageText:
          existingConversation?.lastMessageText ||
          group.description ||
          `${group.isCommunityAnnounce ? "Avisos da comunidade" : group.isCommunity ? "Comunidade" : "Grupo do WhatsApp"} • ${group.participantsCount} participante(s)`,
        lastMessageTime: existingConversation?.lastMessageTime || null,
        lastMessageFromMe: existingConversation?.lastMessageFromMe || false,
        unreadCount: existingConversation?.unreadCount || 0,
        isArchived: existingConversation?.isArchived || false,
        hasReplied: existingConversation?.hasReplied || false,
        tags: existingConversation?.tags || [],
        participantsCount: group.participantsCount,
        groupId: normalizedGroupId,
        groupDescription: group.description || null,
        groupAnnounce: group.announce === true,
        groupIsCommunity: group.isCommunity === true,
        groupIsCommunityAnnounce: group.isCommunityAnnounce === true,
        groupLinkedParent: group.linkedParent || null,
        groupIsAdmin: group.isAdmin === true,
        isGroupEntry: true,
        isGroupPlaceholder: !existingConversation,
      } as SearchResult;
    });
  }, [persistedGroupConversationMap, whatsappGroups]);
  const scopeConversations =
    conversationScope === "groups"
      ? groupConversations
      : individualConversations;

  const filteredConversations = scopeConversations.filter((conv) => {
    const searchLower = searchQuery.toLowerCase();
    const displayName = getConversationDisplayName(conv).toLowerCase();
    const displayNumber = getConversationDisplayNumber(conv).toLowerCase();
    if (conversationScope === "groups") {
      if (
        groupCategoryFilter === "announcements" &&
        !conv.groupIsCommunityAnnounce &&
        !conv.groupAnnounce
      ) {
        return false;
      }
      if (
        groupCategoryFilter === "communities" &&
        !conv.groupIsCommunity &&
        !conv.groupLinkedParent &&
        !conv.groupIsCommunityAnnounce
      ) {
        return false;
      }
    }
    return (
      displayName.includes(searchLower) ||
      (canViewPhoneNumbers && displayNumber.includes(searchLower)) ||
      conv.lastMessageText?.toLowerCase().includes(searchLower) ||
      (conversationScope === "groups" && String(conv.groupDescription || "").toLowerCase().includes(searchLower))
    );
  });

  // Apply status filter
  const statusFilteredConversations = filteredConversations.filter((conv) => {
    if (statusFilter !== "archived" && conv.isArchived === true) {
      return false;
    }
    switch (statusFilter) {
      case "unread":
        // Não lidas: unreadCount > 0
        return (conv.unreadCount || 0) > 0;
      case "replied":
        // Respondidas: conversa já foi respondida alguma vez (hasReplied = true)
        if (conversationScope === "groups") return true;
        return conv.hasReplied === true;
      case "unreplied":
        // Pendentes: conversa NUNCA foi respondida (hasReplied = false)
        if (conversationScope === "groups") return true;
        return !conv.hasReplied;
      case "archived":
        return conv.isArchived === true;
      default:
        return true;
    }
  });

  const connectionScopedSearchResults = useMemo(() => {
    const scopedResults = selectedConnectionFilter === "all"
      ? searchResults
      : searchResults.filter((conversation) => conversation.connectionId === selectedConnectionFilter);

    if (conversationScope === "groups") {
      return scopedResults.filter((conversation) => isGroupConversationLike(conversation));
    }

    return scopedResults.filter((conversation) => !isGroupConversationLike(conversation));
  }, [conversationScope, searchResults, selectedConnectionFilter]);

  const visibleConversationIds = conversationScope === "conversations"
    ? statusFilteredConversations.map(conv => conv.id)
    : [];
  const isAllVisibleSelected = visibleConversationIds.length > 0
    && visibleConversationIds.every(id => selectedConversationIds.has(id));
  const isSomeVisibleSelected = visibleConversationIds.some(id => selectedConversationIds.has(id));
  const selectedIds = Array.from(selectedConversationIds);

  const toggleConversationSelection = (conversationId: string, checked: boolean) => {
    setSelectedConversationIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(conversationId);
      } else {
        next.delete(conversationId);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedConversationIds(prev => {
      const next = new Set(prev);
      if (checked) {
        visibleConversationIds.forEach(id => next.add(id));
      } else {
        visibleConversationIds.forEach(id => next.delete(id));
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedConversationIds(new Set());
  };

  useEffect(() => {
    setSelectedConversationIds(new Set());
  }, [conversationScope, selectedConnectionFilter]);

  useEffect(() => {
    if (conversationScope === "groups" && selectedTagFilter) {
      setSelectedTagFilter(null);
    }
    if (conversationScope === "groups" && (statusFilter === "replied" || statusFilter === "unreplied")) {
      setStatusFilter("all");
    }
    if (conversationScope !== "groups" && groupCategoryFilter !== "all") {
      setGroupCategoryFilter("all");
    }
  }, [conversationScope, groupCategoryFilter, selectedTagFilter, statusFilter]);

  const openGroupConversationMutation = useMutation({
    mutationFn: async (group: SearchResult) => {
      const response = await apiRequest("POST", "/api/whatsapp/groups/open-conversation", {
        groupId: group.groupId || group.remoteJid,
        groupName: group.contactName,
        connectionId: group.connectionId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/status"] });
      if (data?.conversationId) {
        onSelectConversation(data.conversationId);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao abrir grupo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkReadMutation = useMutation({
    mutationFn: async (conversationIds: string[]) => {
      const response = await apiRequest("POST", "/api/conversations/bulk/read", { conversationIds });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Conversas marcadas como lidas" });
      clearSelection();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao marcar como lidas",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkUnreadMutation = useMutation({
    mutationFn: async (conversationIds: string[]) => {
      const response = await apiRequest("POST", "/api/conversations/bulk/unread", { conversationIds });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Conversas marcadas como não lidas" });
      clearSelection();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao marcar como não lidas",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: async ({ conversationIds, archived }: { conversationIds: string[]; archived: boolean }) => {
      const response = await apiRequest("POST", "/api/conversations/bulk/archive", {
        conversationIds,
        archived,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      toast({ title: statusFilter === "archived" ? "Conversas desarquivadas" : "Conversas arquivadas" });
      clearSelection();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao arquivar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkTagMutation = useMutation({
    mutationFn: async ({ conversationIds, tagIds }: { conversationIds: string[]; tagIds: string[] }) => {
      const response = await apiRequest("POST", "/api/conversations/bulk/tags", {
        conversationIds,
        tagIds,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      toast({ title: "Etiquetas aplicadas" });
      setBulkTagDialogOpen(false);
      setBulkSelectedTagIds(new Set());
      clearSelection();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao etiquetar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkEnableAIMutation = useMutation({
    mutationFn: async (conversationIds: string[]) => {
      const response = await apiRequest("POST", "/api/conversations/bulk/ai-enable", { conversationIds });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      toast({ title: "IA ativada nas conversas selecionadas" });
      clearSelection();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao ativar IA",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkDisableAIMutation = useMutation({
    mutationFn: async (conversationIds: string[]) => {
      const response = await apiRequest("POST", "/api/conversations/bulk/ai-disable", { conversationIds });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      toast({ title: "IA desativada nas conversas selecionadas" });
      clearSelection();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao desativar IA",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle creating new contact
  const handleCreateNewContact = async () => {
    if (!newContactNumber.trim()) {
      toast({
        title: "Número obrigatório",
        description: "Digite o número do contato",
        variant: "destructive",
      });
      return;
    }

    const targetConnectionId =
      selectedNewContactConnectionId || preferredNewConversationConnectionId || connectionId || "";
    if (!targetConnectionId) {
      toast({
        title: "WhatsApp não conectado",
        description: "Selecione ou conecte uma linha do WhatsApp antes de iniciar a conversa.",
        variant: "destructive",
      });
      return;
    }

    setCreatingContact(true);
    try {
      const response = await apiRequest("POST", "/api/conversations/new-contact", {
        phoneNumber: newContactNumber.replace(/\D/g, ""),
        name: newContactName.trim() || undefined,
        connectionId: targetConnectionId,
      });
      
      const data = await response.json();
      
      if (data.conversationId) {
        toast({ title: "Conversa criada!" });
        queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
        onSelectConversation(data.conversationId);
        setNewContactDialogOpen(false);
        setNewContactNumber("");
        setNewContactName("");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao criar conversa",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreatingContact(false);
    }
  };

  const openTagModal = (conv: ConversationWithTags, e: React.SyntheticEvent) => {
    e.stopPropagation();
    setTagModalConversationId(conv.id);
    setTagModalCurrentTags(conv.tags || []);
    setTagModalOpen(true);
  };

  const handleTagsUpdated = (updatedTags: ConversationTag[]) => {
    queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
  };

  useEffect(() => {
    if (!newContactDialogOpen) return;

    if (
      selectedNewContactConnectionId &&
      connectedConnections.some((conn) => conn.id === selectedNewContactConnectionId)
    ) {
      return;
    }

    setSelectedNewContactConnectionId(preferredNewConversationConnectionId);
  }, [
    connectedConnections,
    newContactDialogOpen,
    preferredNewConversationConnectionId,
    selectedNewContactConnectionId,
  ]);

  useEffect(() => {
    if (bulkTagDialogOpen) {
      setBulkSelectedTagIds(new Set());
    }
  }, [bulkTagDialogOpen]);

  const toggleBulkTag = (tagId: string) => {
    setBulkSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  const handleBulkTagSave = () => {
    const tagIds = Array.from(bulkSelectedTagIds);
    if (selectedIds.length === 0) {
      toast({
        title: "Nenhuma conversa selecionada",
        variant: "destructive",
      });
      return;
    }
    if (tagIds.length === 0) {
      toast({
        title: "Selecione pelo menos uma etiqueta",
        variant: "destructive",
      });
      return;
    }

    bulkTagMutation.mutate({ conversationIds: selectedIds, tagIds });
  };

  const activeFilterTag = availableTags.find(t => t.id === selectedTagFilter);
  const archiveActionLabel = statusFilter === "archived" ? "Desarquivar" : "Arquivar";
  const ArchiveActionIcon = statusFilter === "archived" ? ArchiveRestore : Archive;

  const formatConnectionLabel = (connection: WhatsappConnection): string => {
    if (connection.connectionName?.trim()) return connection.connectionName.trim();
    if (connection.phoneNumber?.trim()) return `Linha ${connection.phoneNumber.trim()}`;
    return `Conexão ${connection.id.slice(0, 4)}`;
  };
  const activeConnectionFilter =
    selectedConnectionFilter === "all"
      ? null
      : orderedConnections.find((connection) => connection.id === selectedConnectionFilter) || null;
  const activeConnectionFilterLabel = activeConnectionFilter
    ? formatConnectionLabel(activeConnectionFilter)
    : "Todas as linhas";

  const shouldShowNotificationHint =
    !soundEnabled ||
    !pushEnabled ||
    pushPermission === "denied";
  const [isNotificationHintDismissed, setIsNotificationHintDismissed] = useState(false);
  const notificationHintTitle = pushPermission === "denied"
    ? "Notificações bloqueadas"
    : "Notificações de mensagens desativadas";
  const notificationHintText = (() => {
    if (pushPermission === "denied") {
      return "Libere o navegador para voltar a receber alerta fora da aba.";
    }

    if (!pushEnabled && !soundEnabled) {
      return "Ative o som e o alerta do navegador.";
    }

    if (!pushEnabled) {
      return "Ative o alerta do navegador.";
    }

    return "Ative o som para ouvir novas mensagens.";
  })();
  const notificationHintActionLabel = pushPermission === "denied"
    ? "Onde ativar"
    : !pushEnabled
      ? "Ativar"
      : "Ativar som";

  useEffect(() => {
    if (shouldShowNotificationHint) return;

    setIsNotificationHintDismissed(false);
  }, [shouldShowNotificationHint]);

  const handleOpenNotificationSettings = () => {
    setLocation("/settings#notificacoes");
  };

  const handleDismissNotificationHint = () => {
    setIsNotificationHintDismissed(true);
  };

  const handleEnablePushNotifications = async () => {
    if (pushPermission === "unsupported") {
      toast({
        title: "Push indisponível",
        description: "Este navegador não suporta notificações do site.",
        variant: "destructive",
      });
      return;
    }

    if (pushPermission === "denied") {
      handleOpenNotificationSettings();
      return;
    }

    const result = await requestPushPermission();
    if (result !== "granted") {
      toast({
        title: "Permissão não concedida",
        description: "Libere as notificações do site no navegador para ativar o alerta.",
        variant: "destructive",
      });
      return;
    }

    await setPushEnabled(true);
    toast({
      title: "Push ativado",
      description: "Novas mensagens agora podem aparecer como alerta do navegador.",
    });
  };

  const handleQuickEnableNotifications = async () => {
    if (!soundEnabled) {
      await enableSound();
    }

    if (!pushEnabled) {
      if (pushPermission === "unsupported") {
        toast({
          title: "Som ativado",
          description: "Seu navegador não suporta alerta do site. Use Configurações para ver os detalhes.",
        });
        return;
      }

      await handleEnablePushNotifications();
      return;
    }

    toast({
      title: "Som ativado",
      description: "Agora novas mensagens tocam um aviso nesta tela.",
    });
  };

  const formatConversationTimestamp = (value?: string | Date | null): string | null => {
    if (!value) return null;
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) return null;

    if (isToday(timestamp)) {
      return format(timestamp, "HH:mm", { locale: ptBR });
    }
    if (isYesterday(timestamp)) {
      return "Ontem";
    }

    const daysAgo = differenceInCalendarDays(new Date(), timestamp);
    if (daysAgo < 7) {
      return format(timestamp, "EEE", { locale: ptBR }).replace(".", "");
    }

    return format(timestamp, "dd/MM/yyyy", { locale: ptBR });
  };

  const formatConnectionBadge = (conversation: ConversationWithTags): string | null => {
    if (allConnections.length <= 1 || !conversation.connectionId) return null;
    const connectionMeta = connectionMetaById.get(conversation.connectionId);
    if (!connectionMeta) return `Conexão ${conversation.connectionId.slice(0, 4)}`;
    if (connectionMeta.connectionName?.trim()) return connectionMeta.connectionName.trim();
    if (connectionMeta.phoneNumber) return `Linha ${connectionMeta.phoneNumber}`;
    return `Conexão ${connectionMeta.id.slice(0, 4)}`;
  };

  /** Destaca o termo de busca no texto com <mark> */
  const highlightTerm = (text: string | null | undefined, term: string): React.ReactNode => {
    if (!text || !term) return text || "";
    const idx = text.toLowerCase().indexOf(term.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 dark:bg-yellow-700/60 text-inherit rounded-sm px-0.5">
          {text.slice(idx, idx + term.length)}
        </mark>
        {text.slice(idx + term.length)}
      </>
    );
  };

  /** Render de um item de conversa — reutilizado pela lista normal e pelos resultados de busca */
  const renderConversationItem = (conversation: SearchResult, isSearch = false) => {
    const isGroupItem = conversationScope === "groups" || conversation.isGroupEntry === true;
    const displayName = getConversationDisplayName(conversation);
    const contactAvatarUrl = getRenderableContactAvatar(conversation.contactAvatar);
    const displayNumber = getConversationDisplayNumber(conversation) || "?";

    // Snippet: em modo busca, preferir o snippet de mensagem; fora de busca, usar lastMessageText
    const snippetText = isSearch && conversation.snippet
      ? conversation.snippet
      : conversation.lastMessageText;
    const snippetLabel = isTechnicalStubText(snippetText)
      ? "Início da conversa pelo WhatsApp"
      : (snippetText || (isGroupItem ? "Grupo do WhatsApp" : "Sem mensagens"));
    const timestampLabel = formatConversationTimestamp(conversation.lastMessageTime);
    const conversationTimestamp = conversation.lastMessageTime
      ? new Date(conversation.lastMessageTime)
      : null;

    // Badge de pendência — só mostrar fora de busca (na lista normal já há o chip de filtro)
    const showPendingBadge = !conversation.hasReplied && !conversation.isArchived;
    const connectionBadgeLabel = formatConnectionBadge(conversation);

    return (
      <button
        key={conversation.id}
        onClick={() => {
          if (conversation.isGroupPlaceholder) {
            openGroupConversationMutation.mutate(conversation);
            return;
          }
          onSelectConversation(conversation.id);
        }}
        className={`w-full p-3 md:p-4 text-left hover-elevate active-elevate-2 transition-colors touch-manipulation ${
          selectedConversationId === conversation.id ? "bg-sidebar-accent" : ""
        }`}
        data-testid={`conversation-item-${conversation.id}`}
      >
        <div className="flex items-start gap-3">
          {conversationScope === "conversations" && !isSearch && (
            <div className="pt-1" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selectedConversationIds.has(conversation.id)}
                onCheckedChange={(checked) => toggleConversationSelection(conversation.id, checked === true)}
                aria-label={`Selecionar ${displayName}`}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          )}
          <Avatar className="w-11 h-11 md:w-12 md:h-12 flex-shrink-0">
            {contactAvatarUrl ? (
              <img
                src={contactAvatarUrl}
                alt={displayName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  markContactAvatarFailed(contactAvatarUrl);
                  e.currentTarget.style.display = "none";
                  e.currentTarget.nextElementSibling?.classList.remove("hidden");
                }}
              />
            ) : null}
            <AvatarFallback
              className={`bg-primary/10 text-primary font-semibold ${contactAvatarUrl ? "hidden" : ""}`}
            >
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-semibold text-sm truncate">
                {isSearch
                  ? highlightTerm(displayName, debouncedQuery)
                  : displayName}
              </h3>
              {connectionBadgeLabel && (
                <Badge
                  variant="outline"
                  className="h-5 px-1.5 text-[10px] border-sky-200 text-sky-700 bg-sky-50"
                  title="Número de origem desta conversa"
                >
                  {connectionBadgeLabel}
                </Badge>
              )}
              <div className="flex items-center gap-1 flex-shrink-0">
                {timestampLabel && (
                  <span
                    className="text-xs text-muted-foreground"
                    title={conversationTimestamp ? format(conversationTimestamp, "dd/MM/yyyy HH:mm", { locale: ptBR }) : undefined}
                  >
                    {timestampLabel}
                  </span>
                )}
                {conversationScope === "conversations" && !isSearch && canEditConversationMetadata && (
                  <div
                    role="button"
                    tabIndex={0}
                    className="h-6 w-6 opacity-60 hover:opacity-100 flex items-center justify-center rounded-md hover:bg-accent cursor-pointer"
                    onClick={(e) => openTagModal(conversation, e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openTagModal(conversation, e);
                      }
                    }}
                  >
                    <Tags className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            </div>

            {/* Tags da conversa */}
            {conversation.tags && conversation.tags.length > 0 && (
              <div className="mb-1">
                <TagBadges tags={conversation.tags} maxVisible={3} size="sm" />
              </div>
            )}

            {(conversation.needsHumanAttention ||
              !!conversation.attentionQualifiedAt ||
              !!conversation.attentionPriority ||
              !!conversation.attentionReason ||
              conversation.attentionConfidence != null) && (
              <div className="mb-1 flex items-center gap-2">
                <AttentionPriorityBadge
                  priority={conversation.attentionPriority}
                  needsHumanAttention={conversation.needsHumanAttention}
                  className="h-5 px-2 text-[10px]"
                />
                <p className="truncate text-[11px] text-muted-foreground">
                  {conversation.attentionReason?.trim() ||
                    (conversation.needsHumanAttention
                      ? "A IA pediu intervenção humana."
                      : "Sem urgência humana neste momento.")}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground truncate">
                {isSearch && conversation.snippet
                  ? <>{conversation.snippetFromMe ? "Você: " : ""}{highlightTerm(snippetLabel, debouncedQuery)}</>
                  : snippetLabel}
              </p>
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Badge pendente (não respondida) — não mostrar no filtro "unreplied" pois já está implícito */}
                {isGroupItem && conversation.groupIsCommunityAnnounce && !isSearch && (
                  <Badge
                    variant="outline"
                    className="h-5 px-1.5 text-[10px] border-emerald-200 text-emerald-700 bg-emerald-50"
                    title="Grupo de avisos da comunidade. Somente admins podem enviar."
                  >
                    Avisos
                  </Badge>
                )}
                {isGroupItem && conversation.groupIsCommunity && !conversation.groupIsCommunityAnnounce && !isSearch && (
                  <Badge
                    variant="outline"
                    className="h-5 px-1.5 text-[10px] border-violet-200 text-violet-700 bg-violet-50"
                    title="Comunidade do WhatsApp"
                  >
                    Comunidade
                  </Badge>
                )}
                {isGroupItem && conversation.groupAnnounce && !conversation.groupIsCommunityAnnounce && !isSearch && (
                  <Badge
                    variant="outline"
                    className="h-5 px-1.5 text-[10px] border-amber-200 text-amber-700 bg-amber-50"
                    title="Grupo configurado para somente admins enviarem mensagens"
                  >
                    Admins
                  </Badge>
                )}
                {isGroupItem && (conversation.participantsCount || 0) > 0 && !isSearch && (
                  <Badge
                    variant="outline"
                    className="h-5 px-1.5 text-[10px] border-sky-200 text-sky-700 bg-sky-50"
                    title="Participantes do grupo"
                  >
                    <Users className="mr-1 h-3 w-3" />
                    {conversation.participantsCount}
                  </Badge>
                )}
                {showPendingBadge && statusFilter !== "unreplied" && !isSearch && !isGroupItem && (
                  <Badge
                    variant="outline"
                    className="h-5 px-1.5 text-[10px] border-amber-400 text-amber-600 bg-amber-50"
                    data-testid={`badge-pending-${conversation.id}`}
                    title="Aguardando resposta humana"
                  >
                    Pendente
                  </Badge>
                )}
                {(conversation.unreadCount || 0) > 0 && (
                  <Badge
                    variant="default"
                    className="flex-shrink-0 h-5 min-w-5 px-1.5 text-xs"
                    data-testid={`badge-unread-${conversation.id}`}
                  >
                    {conversation.unreadCount}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 md:p-4 border-b space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {conversationScope === "conversations" && statusFilteredConversations.length > 0 && (
              <Checkbox
                checked={isAllVisibleSelected ? true : isSomeVisibleSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                aria-label="Selecionar todas as conversas visíveis"
                className="data-[state=checked]:bg-primary"
              />
            )}
            <h2 className="font-semibold text-lg">
              {conversationScope === "groups" ? "Grupos" : "Conversas"}
            </h2>
          </div>
          {conversationScope === "conversations" ? (
            <div className="flex items-center gap-2">
            {/* Botão novo contato */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setNewContactDialogOpen(true)}
              title="Nova conversa"
            >
              <MessageSquarePlus className="w-4 h-4" />
            </Button>
            {/* Dropdown de filtro por tag */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant={selectedTagFilter ? "default" : "ghost"} 
                  size="icon" 
                  className="h-8 w-8"
                  style={activeFilterTag ? {
                    backgroundColor: activeFilterTag.color,
                    borderColor: activeFilterTag.color,
                  } : undefined}
                >
                  <Filter className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Filtrar por Etiqueta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={selectedTagFilter === null}
                  onCheckedChange={() => setSelectedTagFilter(null)}
                >
                  <span className="font-medium">Todas as conversas</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {availableTags.map(tag => (
                  <DropdownMenuCheckboxItem
                    key={tag.id}
                    checked={selectedTagFilter === tag.id}
                    onCheckedChange={() => setSelectedTagFilter(
                      selectedTagFilter === tag.id ? null : tag.id
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span>{tag.name}</span>
                    </div>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Somente visualização e resposta manual
            </div>
          )}
        </div>

        <Tabs value={conversationScope} onValueChange={(value) => setConversationScope(value as "conversations" | "groups")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="conversations">Conversas</TabsTrigger>
            <TabsTrigger value="groups">Grupos</TabsTrigger>
          </TabsList>
        </Tabs>
        
        {/* ===== Filtros de status — chips scroll horizontal (sem sobreposição mobile) ===== */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 pr-6 scrollbar-thin sm:flex-wrap sm:overflow-visible sm:pb-0 sm:pr-1">
          {[
            { value: "all",      label: "Todas",        icon: null },
            { value: "unread",   label: "Não lidas",    icon: <Circle className="w-3 h-3 fill-green-500 text-green-500 flex-shrink-0" /> },
            { value: "unreplied",label: "Pendentes",    icon: <Clock  className="w-3 h-3 flex-shrink-0" /> },
            { value: "replied",  label: "Respondidas",  icon: <CheckCheck className="w-3 h-3 text-blue-500 flex-shrink-0" /> },
            { value: "archived", label: "Arquivadas",   icon: <Archive className="w-3 h-3 flex-shrink-0" /> },
          ].map(({ value, label, icon }) => {
            const active = statusFilter === value;
            return (
              <button
                key={value}
                onClick={() => setStatusFilter(value as any)}
                className={`
                  flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium
                  whitespace-nowrap flex-shrink-0 transition-colors select-none
                  ${active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }
                `}
                data-testid={`filter-chip-${value}`}
              >
                {icon}
                {label}
                {/* Contador de não lidas/pendentes no chip */}
                {value === "unread" && (() => {
                  const cnt = scopeConversations.filter(c => (c.unreadCount || 0) > 0 && !c.isArchived).length;
                  return cnt > 0 ? (
                    <span className={`ml-0.5 px-1 rounded-full text-[10px] font-bold leading-4 ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-green-500 text-white"}`}>
                      {cnt > 99 ? "99+" : cnt}
                    </span>
                  ) : null;
                })()}
                {value === "unreplied" && (() => {
                  const cnt = scopeConversations.filter(c => !c.hasReplied && !c.isArchived).length;
                  return cnt > 0 ? (
                    <span className={`ml-0.5 px-1 rounded-full text-[10px] font-bold leading-4 ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-amber-500 text-white"}`}>
                      {cnt > 99 ? "99+" : cnt}
                    </span>
                  ) : null;
                })()}
              </button>
            );
          })}
        </div>
        {/* ================================================================================ */}

        {conversationScope === "groups" && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 pr-6 scrollbar-thin sm:flex-wrap sm:overflow-visible sm:pb-0 sm:pr-1">
            {[
              { value: "all", label: "Todos os grupos" },
              { value: "announcements", label: "Avisos" },
              { value: "communities", label: "Comunidades" },
            ].map(({ value, label }) => {
              const active = groupCategoryFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGroupCategoryFilter(value as typeof groupCategoryFilter)}
                  className={`
                    flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium
                    whitespace-nowrap flex-shrink-0 transition-colors select-none
                    ${active
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }
                  `}
                  data-testid={`filter-group-category-${value}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {hasMultipleConnections && (
          <div className="rounded-2xl border border-border/70 bg-background/80 p-2.5">
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Smartphone className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Linha
                  </p>
                  <p className="truncate text-sm font-medium text-foreground">
                    {activeConnectionFilterLabel}
                  </p>
                </div>
              </div>

              <Select value={selectedConnectionFilter} onValueChange={setSelectedConnectionFilter}>
                <SelectTrigger
                  className="h-10 w-[13rem] max-w-[55vw] rounded-xl border-border/70 bg-background/90 text-sm"
                  data-testid="select-conversation-connection-filter"
                >
                  <SelectValue placeholder="Todas as linhas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as linhas</SelectItem>
                  {orderedConnections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {formatConnectionLabel(connection)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={conversationScope === "groups" ? "Buscar grupos..." : "Buscar conversas..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            style={{ fontSize: '16px' }}
            data-testid="input-search-conversations"
          />
        </div>

        {shouldShowNotificationHint && !isNotificationHintDismissed && (
          <div
            className="rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2.5"
            data-testid="conversation-notification-hint"
          >
            <div className="flex items-start gap-2.5">
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-5 text-foreground">
                      {notificationHintTitle}
                    </p>
                    <p className="text-xs leading-4 text-muted-foreground">
                      {notificationHintText}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleDismissNotificationHint}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-emerald-100 hover:text-foreground"
                    aria-label="Fechar aviso de notificacoes"
                    data-testid="button-dismiss-notification-hint"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <button
                    type="button"
                    onClick={handleQuickEnableNotifications}
                    className="text-sm font-medium text-emerald-700 transition-colors hover:text-emerald-800"
                    data-testid="button-quick-enable-notifications"
                  >
                    {notificationHintActionLabel}
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenNotificationSettings}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    data-testid="button-open-notification-settings"
                  >
                    Configurações
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Indicador de filtro ativo */}
        {(conversationScope === "conversations" && selectedTagFilter && activeFilterTag) || selectedConnectionFilter !== "all" ? (
          <div className="flex flex-wrap items-center gap-2">
            {selectedTagFilter && activeFilterTag && (
              <Badge
                style={{
                  backgroundColor: `${activeFilterTag.color}20`,
                  color: activeFilterTag.color,
                  borderColor: activeFilterTag.color
                }}
                variant="outline"
                className="cursor-pointer"
                onClick={() => setSelectedTagFilter(null)}
              >
                <Tags className="w-3 h-3 mr-1" />
                {activeFilterTag.name}
                <X className="w-3 h-3 ml-1" />
              </Badge>
            )}
            {selectedConnectionFilter !== "all" && activeConnectionFilter && (
              <Badge
                variant="outline"
                className="cursor-pointer border-sky-200 bg-sky-50 text-sky-700"
                onClick={() => setSelectedConnectionFilter("all")}
              >
                <Smartphone className="mr-1 h-3 w-3" />
                {activeConnectionFilterLabel}
                <X className="ml-1 h-3 w-3" />
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Filtro ativo
            </span>
          </div>
        ) : null}

        {conversationScope === "conversations" && selectedConversationIds.size > 0 && (
          <div className="rounded-md border bg-muted/40 px-2 py-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {selectedConversationIds.size} selecionada(s)
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={clearSelection}
                title="Limpar seleção"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-shrink-0"
                onClick={() => bulkArchiveMutation.mutate({
                  conversationIds: selectedIds,
                  archived: statusFilter !== "archived",
                })}
                disabled={bulkArchiveMutation.isPending}
                title={archiveActionLabel}
              >
                {bulkArchiveMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ArchiveActionIcon className="w-3 h-3" />
                )}
                <span className="text-xs ml-1 hidden sm:inline">{archiveActionLabel}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-shrink-0"
                onClick={() => bulkReadMutation.mutate(selectedIds)}
                disabled={bulkReadMutation.isPending}
                title="Marcar como lidas"
              >
                {bulkReadMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <MailOpen className="w-3 h-3" />
                )}
                <span className="text-xs ml-1 hidden sm:inline">Lidas</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-shrink-0"
                onClick={() => bulkUnreadMutation.mutate(selectedIds)}
                disabled={bulkUnreadMutation.isPending}
                title="Marcar como não lidas"
              >
                {bulkUnreadMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Mail className="w-3 h-3" />
                )}
                <span className="text-xs ml-1 hidden sm:inline">Não lidas</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-shrink-0"
                onClick={() => setBulkTagDialogOpen(true)}
                title="Etiquetar conversas"
              >
                <Tags className="w-3 h-3" />
                <span className="text-xs ml-1 hidden sm:inline">Etiquetar</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-shrink-0 bg-green-50 hover:bg-green-100 border-green-200"
                onClick={() => bulkEnableAIMutation.mutate(selectedIds)}
                disabled={bulkEnableAIMutation.isPending}
                title="Ativar IA para todas selecionadas"
              >
                {bulkEnableAIMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin text-green-600" />
                ) : (
                  <Bot className="w-3 h-3 text-green-600" />
                )}
                <span className="text-xs ml-1 text-green-700 hidden sm:inline">Ativar IA</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-shrink-0 bg-amber-50 hover:bg-amber-100 border-amber-200"
                onClick={() => bulkDisableAIMutation.mutate(selectedIds)}
                disabled={bulkDisableAIMutation.isPending}
                title="Desativar IA para todas selecionadas"
              >
                {bulkDisableAIMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
                ) : (
                  <Bot className="w-3 h-3 text-amber-600" />
                )}
                <span className="text-xs ml-1 text-amber-700 hidden sm:inline">Desativar IA</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* ===== MODO BUSCA (≥ 2 chars) ===== */}
        {isSearchMode ? (
          isSearching ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Buscando...
            </div>
          ) : connectionScopedSearchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <Search className="w-12 h-12 text-muted-foreground mb-4 opacity-40" />
              <h3 className="font-medium text-sm mb-1">Nenhum resultado</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                Nenhuma conversa ou mensagem encontrada para "<strong>{debouncedQuery}</strong>"
              </p>
            </div>
          ) : (
            <div>
              <div className="px-3 py-1.5 text-xs text-muted-foreground border-b bg-muted/30">
                {connectionScopedSearchResults.length} resultado{connectionScopedSearchResults.length !== 1 ? "s" : ""} para "<strong>{debouncedQuery}</strong>"
              </div>
              <div className="divide-y" data-testid="list-search-results">
                {connectionScopedSearchResults.map(conv => renderConversationItem(conv, true))}
              </div>
            </div>
          )
        ) : (
          /* ===== MODO NORMAL (lista filtrada) ===== */
          (conversationScope === "groups" ? isLoadingGroups : isLoading) ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : groupScopeRequiresConnectionSelection ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <Smartphone className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-medium text-sm mb-2">Selecione uma linha</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                Para listar grupos, escolha primeiro qual conexão do WhatsApp deseja visualizar.
              </p>
            </div>
          ) : connectedConnections.length === 0 &&
            statusFilteredConversations.length === 0 &&
            (!selectedTagFilter || conversationScope === "groups") &&
            statusFilter === "all" &&
            selectedConnectionFilter === "all" ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <Smartphone className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-medium text-sm mb-2">WhatsApp não conectado</h3>
              <p className="text-xs text-muted-foreground max-w-xs mb-3">
                Conecte seu WhatsApp para começar a receber conversas.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/conexao")}
                data-testid="button-minimal-connect-whatsapp-list"
              >
                Conectar WhatsApp
              </Button>
            </div>
          ) : statusFilteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <MessageCircle className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-medium text-sm mb-2">
                {selectedTagFilter || statusFilter !== "all" || selectedConnectionFilter !== "all" || groupCategoryFilter !== "all"
                  ? conversationScope === "groups" ? "Nenhum grupo encontrado" : "Nenhuma conversa encontrada"
                  : conversationScope === "groups" ? "Nenhum grupo" : "Nenhuma conversa"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                {conversationScope === "groups"
                  ? selectedConnectionFilter !== "all"
                    ? `Nenhum grupo em ${activeConnectionFilterLabel}`
                    : groupCategoryFilter === "announcements"
                    ? "Nenhum grupo de avisos encontrado"
                    : groupCategoryFilter === "communities"
                    ? "Nenhuma comunidade encontrada"
                    : statusFilter === "archived"
                    ? "Nenhum grupo arquivado"
                    : statusFilter === "unread"
                    ? "Nenhum grupo com mensagens não lidas"
                    : "Os grupos aparecerão aqui quando forem listados nesta conexão"
                  : selectedTagFilter
                  ? "Nenhuma conversa com esta etiqueta"
                  : selectedConnectionFilter !== "all"
                  ? `Nenhuma conversa em ${activeConnectionFilterLabel}`
                  : statusFilter !== "all"
                  ? `Nenhuma conversa ${
                      statusFilter === "unread"
                        ? "não lida"
                        : statusFilter === "replied"
                        ? "respondida"
                        : statusFilter === "unreplied"
                        ? "pendente (aguardando resposta humana)"
                        : "arquivada"
                    }`
                  : "As conversas aparecerão aqui quando você receber mensagens"}
              </p>
              {((conversationScope === "conversations" && selectedTagFilter) || statusFilter !== "all" || selectedConnectionFilter !== "all" || groupCategoryFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    if (conversationScope === "conversations") {
                      setSelectedTagFilter(null);
                    }
                    setStatusFilter("all");
                    setSelectedConnectionFilter("all");
                    setGroupCategoryFilter("all");
                  }}
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="divide-y" data-testid="list-conversations">
                {statusFilteredConversations.map((conversation) =>
                  renderConversationItem(conversation as SearchResult, false)
                )}
              </div>

              {/* Botão Carregar Mais */}
              {conversationScope === "conversations" && hasMore && !selectedTagFilter && (
                <div className="grid grid-cols-1 gap-2 border-t p-3 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={loadMoreConversations}
                    disabled={loadingMore || loadingAllConversations}
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Carregando...
                      </>
                    ) : (
                      `Carregar mais (${totalCount - allConversations.length} restantes)`
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={loadAllConversations}
                    disabled={loadingMore || loadingAllConversations}
                  >
                    {loadingAllConversations ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Carregando tudo...
                      </>
                    ) : (
                      "Carregar todas"
                    )}
                  </Button>
                </div>
              )}

              {/* Contagem */}
              {totalCount > 0 && !selectedTagFilter && (
                <div className="px-3 py-1 text-xs text-center text-muted-foreground">
                  Mostrando {allConversations.length} de {totalCount} conversas
                </div>
              )}
            </>
          )
        )}
      </div>
      
      {/* Modal de etiquetas em massa */}
      <Dialog open={bulkTagDialogOpen} onOpenChange={setBulkTagDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tags className="w-5 h-5" />
              Etiquetar Conversas
            </DialogTitle>
            <DialogDescription>
              Aplique etiquetas às conversas selecionadas
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[300px] pr-3">
            {availableTags.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Tags className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma etiqueta criada</p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableTags.map(tag => (
                  <label
                    key={tag.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      bulkSelectedTagIds.has(tag.id)
                        ? "bg-accent border-primary"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <Checkbox
                      checked={bulkSelectedTagIds.has(tag.id)}
                      onCheckedChange={() => toggleBulkTag(tag.id)}
                      className="data-[state=checked]:bg-primary"
                    />
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="font-medium flex-1">{tag.name}</span>
                    <Badge
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                        borderColor: tag.color,
                      }}
                      variant="outline"
                      className="text-xs"
                    >
                      {tag.name}
                    </Badge>
                  </label>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkTagDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleBulkTagSave} disabled={bulkTagMutation.isPending}>
              {bulkTagMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de foto ampliada */}
      <Dialog open={avatarModalOpen} onOpenChange={setAvatarModalOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black/90">
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground z-10">
            <X className="h-6 w-6 text-white" />
            <span className="sr-only">Fechar</span>
          </DialogClose>
          {avatarModalImage && (
            <div className="flex flex-col items-center justify-center p-4">
              <h3 className="text-white font-semibold mb-4 text-lg">{avatarModalName}</h3>
              <img 
                src={avatarModalImage} 
                alt={avatarModalName}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Modal de tags da conversa */}
      <ConversationTagsModal
        open={tagModalOpen}
        onOpenChange={setTagModalOpen}
        conversationId={tagModalConversationId}
        currentTags={tagModalCurrentTags}
        onTagsUpdated={handleTagsUpdated}
      />
      
      {/* Dialog de novo contato */}
      <Dialog open={newContactDialogOpen} onOpenChange={setNewContactDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5" />
              Nova Conversa
            </DialogTitle>
            <DialogDescription>
              Inicie uma conversa com um novo contato
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {connectedConnections.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="newContactConnection">Número de saída</Label>
                {connectedConnections.length === 1 ? (
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    {formatConnectionLabel(connectedConnections[0])}
                  </div>
                ) : (
                  <Select
                    value={selectedNewContactConnectionId}
                    onValueChange={setSelectedNewContactConnectionId}
                  >
                    <SelectTrigger id="newContactConnection">
                      <SelectValue placeholder="Selecione a linha conectada" />
                    </SelectTrigger>
                    <SelectContent>
                      {connectedConnections.map((connection) => (
                        <SelectItem key={connection.id} value={connection.id}>
                          {formatConnectionLabel(connection)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  A nova conversa será iniciada usando uma linha conectada.
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Nenhuma linha conectada no momento.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="newContactNumber">Número do WhatsApp *</Label>
              <Input
                id="newContactNumber"
                placeholder="5511999999999"
                value={newContactNumber}
                onChange={(e) => setNewContactNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Digite com código do país (ex: 55 para Brasil)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newContactName">Nome (opcional)</Label>
              <Input
                id="newContactName"
                placeholder="Nome do contato"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNewContactDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateNewContact}
              disabled={creatingContact || !newContactNumber.trim() || connectedConnections.length === 0}
            >
              {creatingContact ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Criando...
                </>
              ) : (
                "Iniciar Conversa"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
