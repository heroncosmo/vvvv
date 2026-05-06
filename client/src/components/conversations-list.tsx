import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, MessageCircle, Smartphone, X, Tags, Filter, CheckCheck, Circle, Mail, MailOpen, MessageSquarePlus, Archive, ArchiveRestore, Loader2, Bot, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Conversation } from "@shared/schema";
import { useState, useEffect, useRef, useCallback } from "react";
import type React from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { getAuthToken } from "@/lib/supabase";
import { useNotifications } from "@/hooks/useNotifications";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"; // mantido para compatibilidade futura
import { Label } from "@/components/ui/label";
import { TagBadges, ConversationTagsModal } from "./conversation-tags";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

// Tag interface
interface Tag {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  isDefault: boolean;
  position: number;
}

// Conversation with tags
interface ConversationWithTags extends Conversation {
  tags?: Tag[];
}

// Resultado de busca fulltext (inclui snippet de mensagem)
interface SearchResult extends ConversationWithTags {
  snippet?: string | null;
  snippetFromMe?: boolean;
}

interface ConversationsListProps {
  connectionId?: string;
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

const QUESTION_MARK_ACCENT_REPAIRS: Array<[RegExp, string]> = [
  [/voc\?\?/gi, "você?"],
  [/voc\?/gi, "você"],
  [/tr\?fego/gi, "tráfego"],
  [/d\?vidas/gi, "dúvidas"],
  [/d\?vida/gi, "dúvida"],
  [/v\?deo/gi, "vídeo"],
  [/m\?dias/gi, "mídias"],
  [/m\?dia/gi, "mídia"],
  [/configura\?\?o/gi, "configuração"],
  [/produ\?\?o/gi, "produção"],
  [/cat\?logo/gi, "catálogo"],
  [/n\?o/gi, "não"],
];

function normalizeConversationPreviewText(text?: string | null): string {
  let value = String(text || "");
  if (!value) return "";

  for (const [pattern, replacement] of QUESTION_MARK_ACCENT_REPAIRS) {
    value = value.replace(pattern, replacement);
  }

  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    normalized.includes("[audio enviado]") ||
    /\[(?:\u00ef\u00bf\u00bd|\ufffd)?udio enviado\]/i.test(value)
  ) {
    return "[Audio enviado]";
  }

  return value;
}

export function ConversationsList({
  connectionId,
  selectedConversationId,
  onSelectConversation,
}: ConversationsListProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);

  // ===== Sistema de Notificações (Parte 9) =====
  const { notify } = useNotifications();
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

  // Dispara busca fulltext quando searchQuery tem ≥ 2 chars
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
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
  }, [searchQuery]);

  const isSearchMode = searchQuery.trim().length >= 2;
  // =====================================
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarModalImage, setAvatarModalImage] = useState<string | null>(null);
  const [avatarModalName, setAvatarModalName] = useState<string>("");
  
  // Status filter: "all" | "unread" | "replied" | "unreplied"
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "replied" | "unreplied" | "archived">("all");
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());
  const [bulkTagDialogOpen, setBulkTagDialogOpen] = useState(false);
  const [bulkSelectedTagIds, setBulkSelectedTagIds] = useState<Set<string>>(new Set());
  
  // New contact dialog
  const [newContactDialogOpen, setNewContactDialogOpen] = useState(false);
  const [newContactNumber, setNewContactNumber] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  
  // Tag filter states
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagModalConversationId, setTagModalConversationId] = useState<string>("");
  const [tagModalCurrentTags, setTagModalCurrentTags] = useState<Tag[]>([]);

  // Paginação
  const PAGE_SIZE = 50;
  const [allConversations, setAllConversations] = useState<ConversationWithTags[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);

  // Buscar conversas com tags (paginado - primeira página)
  const { isLoading } = useQuery<any>({
    queryKey: ["/api/conversations-with-tags", selectedTagFilter, "page0"],
    queryFn: async () => {
      const memberToken = localStorage.getItem("memberToken");
      const supabaseToken = await getAuthToken();
      const token = memberToken || supabaseToken;
      
      // Se tem filtro de tag, buscar tudo (sem paginação)
      const url = selectedTagFilter 
        ? `/api/conversations-with-tags?tagId=${selectedTagFilter}`
        : `/api/conversations-with-tags?limit=${PAGE_SIZE}&offset=0`;
      const response = await fetch(url, {
        credentials: "include",
        headers: {
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch conversations");
      const result = await response.json();
      
      // Se veio paginado (com propriedade data), extrair
      if (result.data) {
        setAllConversations(result.data);
        setHasMore(result.hasMore);
        setTotalCount(result.total);
        setCurrentOffset(result.data.length);
      } else {
        // Sem paginação (filtro de tag retorna array direto)
        setAllConversations(Array.isArray(result) ? result : []);
        setHasMore(false);
        setTotalCount(Array.isArray(result) ? result.length : 0);
        setCurrentOffset(Array.isArray(result) ? result.length : 0);
      }
      return result;
    },
    enabled: true, // ⚡ OTIMIZADO: Carregar imediatamente - API resolve connectionId server-side
    refetchInterval: 15000, // Fallback polling 15s quando WebSocket oscila
    staleTime: 10000, // ⚡ OTIMIZAÇÃO: Dados frescos por 10s - evita refetches redundantes
  });

  // Função para carregar mais conversas
  const loadMoreConversations = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const memberToken = localStorage.getItem("memberToken");
      const supabaseToken = await getAuthToken();
      const token = memberToken || supabaseToken;
      
      const url = `/api/conversations-with-tags?limit=${PAGE_SIZE}&offset=${currentOffset}`;
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
  
  // Alias para compatibilidade com o restante do código
  const conversationsWithTags = allConversations;
  
  // Buscar tags disponíveis para filtro
  const { data: availableTags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    enabled: true, // ⚡ OTIMIZADO: Carregar imediatamente
  });

  // WebSocket para atualização em tempo real
  useEffect(() => {
    let websocket: WebSocket | null = null;
    let cancelled = false;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connectWebSocket = async () => {
      try {
        const token = await getAuthToken();

        if (!token) {
          console.error("Sem token de autenticação para WebSocket de conversas");
          return;
        }

        if (cancelled) return;

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(
          token,
        )}`;

        websocket = new WebSocket(wsUrl);

        websocket.onopen = () => {
          console.log("WebSocket conectado para conversas");
        };

        websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // ⚡ KEEP-ALIVE: Responder pings do servidor para manter conexão viva
            if (data.type === 'ping') {
              websocket?.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp }));
              return;
            }
            if (data.type === 'pong') return;
            
            console.log("WebSocket message:", data);

            // 🔥 Real-time update: atualizar conversa inline sem refetch completo
            if ((data.type === "new_message" || data.type === "message_sent") && data.conversationUpdate) {
              const update = data.conversationUpdate;

              // 🔔 Notificação de nova mensagem (Parte 9)
              // Apenas para mensagens recebidas (não enviadas por mim), quando conversa não está aberta
              const msgId = data.messageId || data.id || `${update.id}-${update.lastMessageTime}`;
              const isFromMe = update.lastMessageFromMe === true || data.type === "message_sent";
              const isCurrentConv = selectedConvRef.current === update.id;
              if (!isFromMe && !isCurrentConv && !notifiedMessageIds.current.has(msgId)) {
                notifiedMessageIds.current.add(msgId);
                // Limpar cache anti-spam após 30s para não crescer indefinidamente
                setTimeout(() => notifiedMessageIds.current.delete(msgId), 30000);
                const contactName = update.contactName || update.contactNumber || "Contato";
                const msgText = update.lastMessageText || "Nova mensagem";
                notify({
                  title: `💬 ${contactName}`,
                  body: msgText.length > 80 ? msgText.slice(0, 77) + "…" : msgText,
                  tag: `msg-${update.id}`,
                });
              }

              setAllConversations(prev => {
                const existingIdx = prev.findIndex(c => c.id === update.id);
                if (existingIdx >= 0) {
                  // Atualizar conversa existente e mover pro topo
                  const updated = {
                    ...prev[existingIdx],
                    lastMessageText: update.lastMessageText,
                    lastMessageTime: update.lastMessageTime,
                    lastMessageFromMe: update.lastMessageFromMe,
                    unreadCount: update.unreadCount,
                    contactName: update.contactName || prev[existingIdx].contactName,
                    contactAvatar: update.contactAvatar || prev[existingIdx].contactAvatar,
                  };
                  const newList = [...prev];
                  newList.splice(existingIdx, 1);
                  return [updated, ...newList];
                } else if (update.isNew) {
                  // Nova conversa: adicionar no topo
                  const newConv: ConversationWithTags = {
                    id: update.id,
                    connectionId: update.connectionId || connectionId || "",
                    contactNumber: update.contactNumber,
                    contactName: update.contactName,
                    contactAvatar: update.contactAvatar,
                    lastMessageText: update.lastMessageText,
                    lastMessageTime: update.lastMessageTime,
                    lastMessageFromMe: update.lastMessageFromMe,
                    unreadCount: update.unreadCount || 1,
                    remoteJid: null,
                    jidSuffix: null,
                    hasReplied: false,
                    isArchived: false,
                    tags: [],
                  } as ConversationWithTags;
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
          } catch (error) {
            console.error("Erro ao processar mensagem WebSocket:", error);
          }
        };

        websocket.onerror = (error) => {
          console.error("Erro no WebSocket:", error);
        };

        websocket.onclose = () => {
          console.log("WebSocket desconectado, reconectando em 3s...");
          // Reconexão automática em 3 segundos
          if (!cancelled) {
            reconnectTimeout = setTimeout(connectWebSocket, 3000);
          }
        };

        setWs(websocket);
      } catch (error) {
        console.error("Erro ao conectar WebSocket de conversas:", error);
        // Tentar reconectar em caso de erro
        if (!cancelled) {
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        }
      }
    };

    connectWebSocket();

    return () => {
      cancelled = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (websocket) {
        websocket.close();
      }
    };
  }, [connectionId]);

  // Filtrar conversas de grupos e status no frontend (camada extra de segurança)
  const individualConversations = conversationsWithTags.filter((conv) => {
    const number = conv.contactNumber;
    if (number.length < 10 || number.length > 15) return false;
    if (number.startsWith("120") || number.startsWith("status")) return false;
    return true;
  });

  const filteredConversations = individualConversations.filter((conv) => {
    const searchLower = searchQuery.toLowerCase();
    const normalizedNumber =
      conv.contactNumber ||
      (conv.remoteJid || `${conv.contactNumber}@s.whatsapp.net`)
        .split("@")[0]
        .split(":")[0];
    return (
      conv.contactName?.toLowerCase().includes(searchLower) ||
      normalizedNumber.includes(searchLower) ||
      conv.lastMessageText?.toLowerCase().includes(searchLower)
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
        return conv.hasReplied === true;
      case "unreplied":
        // Pendentes: conversa NUNCA foi respondida (hasReplied = false)
        return !conv.hasReplied;
      case "archived":
        return conv.isArchived === true;
      default:
        return true;
    }
  });

  const visibleConversationIds = statusFilteredConversations.map(conv => conv.id);
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

    setCreatingContact(true);
    try {
      const response = await apiRequest("POST", "/api/conversations/new-contact", {
        phoneNumber: newContactNumber.replace(/\D/g, ""),
        contactName: newContactName.trim() || undefined,
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

  const openTagModal = (conv: ConversationWithTags, e: React.MouseEvent) => {
    e.stopPropagation();
    setTagModalConversationId(conv.id);
    setTagModalCurrentTags(conv.tags || []);
    setTagModalOpen(true);
  };

  const handleTagsUpdated = (updatedTags: Tag[]) => {
    queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
  };

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
    const displayNumber =
      conversation.contactNumber ||
      (conversation.remoteJid || "").split("@")[0].split(":")[0] ||
      "?";

    // Snippet: em modo busca, preferir o snippet de mensagem; fora de busca, usar lastMessageText
    const snippetText = normalizeConversationPreviewText(
      isSearch && conversation.snippet
        ? conversation.snippet
        : conversation.lastMessageText
    );

    // Badge de pendência — só mostrar fora de busca (na lista normal já há o chip de filtro)
    const showPendingBadge = !conversation.hasReplied && !conversation.isArchived;

    return (
      <button
        key={conversation.id}
        onClick={() => onSelectConversation(conversation.id)}
        className={`w-full p-3 md:p-4 text-left hover-elevate active-elevate-2 transition-colors touch-manipulation ${
          selectedConversationId === conversation.id ? "bg-sidebar-accent" : ""
        }`}
        data-testid={`conversation-item-${conversation.id}`}
      >
        <div className="flex items-start gap-3">
          {!isSearch && (
            <div className="pt-1" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selectedConversationIds.has(conversation.id)}
                onCheckedChange={(checked) => toggleConversationSelection(conversation.id, checked === true)}
                aria-label={`Selecionar ${conversation.contactName || displayNumber}`}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          )}
          <Avatar className="w-11 h-11 md:w-12 md:h-12 flex-shrink-0">
            {conversation.contactAvatar ? (
              <img
                src={conversation.contactAvatar}
                alt={conversation.contactName || displayNumber}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  e.currentTarget.nextElementSibling?.classList.remove("hidden");
                }}
              />
            ) : null}
            <AvatarFallback
              className={`bg-primary/10 text-primary font-semibold ${conversation.contactAvatar ? "hidden" : ""}`}
            >
              {conversation.contactName
                ? conversation.contactName.charAt(0).toUpperCase()
                : displayNumber.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-semibold text-sm truncate">
                {isSearch
                  ? highlightTerm(conversation.contactName || displayNumber, debouncedQuery)
                  : (conversation.contactName || displayNumber)}
              </h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                {conversation.lastMessageTime && (
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(conversation.lastMessageTime), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </span>
                )}
                {!isSearch && (
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

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground truncate">
                {isSearch && conversation.snippet
                  ? <>{conversation.snippetFromMe ? "Você: " : ""}{highlightTerm(snippetText, debouncedQuery)}</>
                  : (snippetText || "Sem mensagens")}
              </p>
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Badge pendente (não respondida) — não mostrar no filtro "unreplied" pois já está implícito */}
                {showPendingBadge && statusFilter !== "unreplied" && !isSearch && (
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
            {statusFilteredConversations.length > 0 && (
              <Checkbox
                checked={isAllVisibleSelected ? true : isSomeVisibleSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                aria-label="Selecionar todas as conversas visíveis"
                className="data-[state=checked]:bg-primary"
              />
            )}
            <h2 className="font-semibold text-lg">Conversas</h2>
          </div>
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
        </div>
        
        {/* ===== Filtros de status — chips scroll horizontal (sem sobreposição mobile) ===== */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
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
                  const cnt = allConversations.filter(c => (c.unreadCount || 0) > 0 && !c.isArchived).length;
                  return cnt > 0 ? (
                    <span className={`ml-0.5 px-1 rounded-full text-[10px] font-bold leading-4 ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-green-500 text-white"}`}>
                      {cnt > 99 ? "99+" : cnt}
                    </span>
                  ) : null;
                })()}
                {value === "unreplied" && (() => {
                  const cnt = allConversations.filter(c => !c.hasReplied && !c.isArchived).length;
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
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            style={{ fontSize: '16px' }}
            data-testid="input-search-conversations"
          />
        </div>
        
        {/* Indicador de filtro ativo */}
        {selectedTagFilter && activeFilterTag && (
          <div className="flex items-center gap-2">
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
            <span className="text-xs text-muted-foreground">
              Filtro ativo
            </span>
          </div>
        )}

        {selectedConversationIds.size > 0 && (
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
          ) : searchResults.length === 0 ? (
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
                {searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""} para "<strong>{debouncedQuery}</strong>"
              </div>
              <div className="divide-y" data-testid="list-search-results">
                {searchResults.map(conv => renderConversationItem(conv, true))}
              </div>
            </div>
          )
        ) : (
          /* ===== MODO NORMAL (lista filtrada) ===== */
          isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !connectionId && statusFilteredConversations.length === 0 ? (
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
                {selectedTagFilter || statusFilter !== "all"
                  ? "Nenhuma conversa encontrada"
                  : "Nenhuma conversa"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                {selectedTagFilter
                  ? "Nenhuma conversa com esta etiqueta"
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
              {(selectedTagFilter || statusFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setSelectedTagFilter(null);
                    setStatusFilter("all");
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
              {hasMore && !selectedTagFilter && (
                <div className="p-3 text-center border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={loadMoreConversations}
                    disabled={loadingMore}
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
              disabled={creatingContact || !newContactNumber.trim()}
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
