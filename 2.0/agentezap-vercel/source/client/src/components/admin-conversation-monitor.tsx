import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Building2, Loader2, MessageCircle, Search, ShieldCheck, User, Users, Wifi, WifiOff } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageAudio } from "@/components/message-audio";
import { MessageImage } from "@/components/message-image";
import { cn } from "@/lib/utils";
import { formatWhatsAppTextForHtml } from "@/lib/whatsapp-format";

type MonitorConversation = {
  id: string;
  contactNumber: string;
  remoteJid?: string | null;
  jidSuffix?: string | null;
  isGroup?: boolean | null;
  contactName?: string | null;
  contactAvatar?: string | null;
  lastMessageText?: string | null;
  lastMessageTime?: string | null;
  lastMessageFromMe?: boolean | null;
  unreadCount?: number | null;
  userId?: string | null;
  ownerEmail?: string | null;
  ownerName?: string | null;
  connectionName?: string | null;
  connectionPhone?: string | null;
  connectionConnected?: boolean | null;
  connectionAiEnabled?: boolean | null;
  providerStatus?: string | null;
  agentActive?: boolean | null;
  agentName?: string | null;
  agentDisabledForConversation?: boolean | null;
  conversationAiActive?: boolean | null;
  needsHumanAttention?: boolean | null;
  attentionPriority?: string | null;
};

type MonitorMessage = {
  id: string;
  fromMe: boolean;
  text?: string | null;
  timestamp: string;
  status?: string | null;
  isFromAgent?: boolean | null;
  mediaType?: string | null;
  mediaUrl?: string | null;
  mediaDuration?: number | null;
  mediaCaption?: string | null;
};

type MonitorListResponse = {
  items: MonitorConversation[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number;
  };
  readOnly: true;
};

type MonitorMessagesResponse = {
  conversation: MonitorConversation;
  messages: MonitorMessage[];
  readOnly: true;
};

type MonitorScope = "direct" | "groups";
type MonitorAiFilter = "all" | "active";
const MONITOR_PAGE_SIZE = 50;

function formatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name?: string | null) {
  const clean = String(name || "").trim();
  if (!clean) return "?";
  return clean.slice(0, 2).toUpperCase();
}

function normalizePhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "") || String(value || "");
}

function isGroupConversation(conversation?: Pick<MonitorConversation, "isGroup" | "jidSuffix" | "remoteJid" | "contactNumber"> | null) {
  return Boolean(
    conversation?.isGroup ||
      conversation?.jidSuffix === "g.us" ||
      String(conversation?.remoteJid || "").trim().endsWith("@g.us") ||
      String(conversation?.contactNumber || "").trim().endsWith("@g.us"),
  );
}

function readSelectionFromHash(): { scope: MonitorScope; selectedId: string | null } {
  if (typeof window === "undefined") return { scope: "direct", selectedId: null };
  const parts = window.location.hash.replace("#", "").split("/");
  if (parts[0] !== "conversation-monitor") return { scope: "direct", selectedId: null };
  const kind = parts[1];
  const selectedId = parts[2] || null;
  if (kind === "grupo") return { scope: "groups", selectedId };
  if (kind === "conversa") return { scope: "direct", selectedId };
  return { scope: "direct", selectedId: null };
}

function buildMonitorHash(conversation: MonitorConversation) {
  const kind = isGroupConversation(conversation) ? "grupo" : "conversa";
  return `/admin#conversation-monitor/${kind}/${conversation.id}`;
}

function speakerLabel(message: MonitorMessage) {
  if (!message.fromMe) return "Cliente";
  return message.isFromAgent ? "Agente IA" : "Empresa";
}

function messageTone(message: MonitorMessage) {
  if (!message.fromMe) return "bg-white border-slate-200 text-slate-950";
  if (message.isFromAgent) return "bg-emerald-50 border-emerald-200 text-emerald-950";
  return "bg-sky-50 border-sky-200 text-sky-950";
}

export default function AdminConversationMonitor() {
  const initialSelection = useMemo(readSelectionFromHash, []);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<MonitorScope>(initialSelection.scope);
  const [aiFilter, setAiFilter] = useState<MonitorAiFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialSelection.selectedId);
  const [extraConversations, setExtraConversations] = useState<MonitorConversation[]>([]);
  const [extraPagination, setExtraPagination] = useState<MonitorListResponse["pagination"] | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversationPage = async (offset: number): Promise<MonitorListResponse> => {
    const params = new URLSearchParams({
      limit: String(MONITOR_PAGE_SIZE),
      offset: String(offset),
      scope,
    });
    if (search.trim()) params.set("search", search.trim());
    if (aiFilter === "active") params.set("ai", "active");
    const res = await fetch(`/api/admin/conversation-monitor?${params.toString()}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Falha ao carregar conversas");
    return res.json();
  };

  const listQuery = useQuery<MonitorListResponse>({
    queryKey: ["/api/admin/conversation-monitor", search, scope, aiFilter],
    queryFn: () => fetchConversationPage(0),
    refetchInterval: 5000,
  });

  useEffect(() => {
    setExtraConversations([]);
    setExtraPagination(null);
    setLoadMoreError(null);
  }, [search, scope, aiFilter]);

  const conversations = useMemo(() => {
    const seen = new Set<string>();
    const merged: MonitorConversation[] = [];
    for (const conversation of [...(listQuery.data?.items || []), ...extraConversations]) {
      if (seen.has(conversation.id)) continue;
      seen.add(conversation.id);
      merged.push(conversation);
    }
    return merged;
  }, [extraConversations, listQuery.data?.items]);
  const pagination = extraPagination || listQuery.data?.pagination || null;

  const loadMoreConversations = async () => {
    if (!pagination?.hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const data = await fetchConversationPage(pagination.nextOffset);
      setExtraConversations((current) => {
        const seen = new Set(current.map((conversation) => conversation.id));
        const next = [...current];
        for (const conversation of data.items || []) {
          if (seen.has(conversation.id)) continue;
          seen.add(conversation.id);
          next.push(conversation);
        }
        return next;
      });
      setExtraPagination(data.pagination);
    } catch (error) {
      setLoadMoreError(error instanceof Error ? error.message : "Falha ao carregar mais conversas");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const selectedConversationFromList = useMemo(
    () => conversations.find((item) => item.id === selectedId) || null,
    [conversations, selectedId],
  );
  const selectedConversationId = selectedId || conversations[0]?.id || null;

  useEffect(() => {
    const onHashChange = () => {
      const next = readSelectionFromHash();
      setScope(next.scope);
      setSelectedId(next.selectedId);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (scope === "groups" && aiFilter === "active") {
      setAiFilter("all");
    }
  }, [aiFilter, scope]);

  const selectConversation = (conversation: MonitorConversation) => {
    setSelectedId(conversation.id);
    setScope(isGroupConversation(conversation) ? "groups" : "direct");
    window.history.replaceState(null, "", buildMonitorHash(conversation));
  };

  useEffect(() => {
    if (!selectedId && conversations[0]) {
      selectConversation(conversations[0]);
    }
  }, [conversations, selectedId]);

  const messagesQuery = useQuery<MonitorMessagesResponse>({
    queryKey: ["/api/admin/conversation-monitor/messages", selectedConversationId],
    enabled: Boolean(selectedConversationId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/conversation-monitor/${selectedConversationId}/messages?limit=160`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Falha ao carregar mensagens");
      return res.json();
    },
    refetchInterval: 5000,
  });
  const selectedConversation = messagesQuery.data?.conversation || selectedConversationFromList || (!selectedId ? conversations[0] : null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messagesQuery.data?.messages?.length, selectedConversationId]);

  const changeScope = (nextScope: MonitorScope) => {
    setScope(nextScope);
    setSelectedId(null);
    if (nextScope === "groups") setAiFilter("all");
    window.history.replaceState(null, "", `/admin#conversation-monitor/${nextScope === "groups" ? "grupo" : "conversa"}`);
  };

  const applySearch = () => {
    setSearch(draftSearch.trim());
    setSelectedId(null);
    window.history.replaceState(null, "", `/admin#conversation-monitor/${scope === "groups" ? "grupo" : "conversa"}`);
  };

  const clearSearch = () => {
    setDraftSearch("");
    setSearch("");
    setSelectedId(null);
    window.history.replaceState(null, "", `/admin#conversation-monitor/${scope === "groups" ? "grupo" : "conversa"}`);
  };

  return (
    <div className="h-[calc(100vh-2rem)] min-h-[720px] overflow-hidden rounded-md border bg-slate-50" data-testid="admin-conversation-monitor">
      <div className="flex h-full min-w-0">
        <aside className="flex w-[420px] shrink-0 flex-col border-r bg-white">
          <div className="border-b p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Monitor SaaS</h2>
                <p className="text-sm text-muted-foreground">Somente leitura de todas as conversas</p>
              </div>
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                read-only
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Tipo de conversa">
              <Button
                type="button"
                variant={scope === "direct" ? "default" : "outline"}
                className="h-9 justify-center gap-2"
                onClick={() => changeScope("direct")}
                data-testid="monitor-scope-direct"
              >
                <MessageCircle className="h-4 w-4" />
                Conversas
              </Button>
              <Button
                type="button"
                variant={scope === "groups" ? "default" : "outline"}
                className="h-9 justify-center gap-2"
                onClick={() => changeScope("groups")}
                data-testid="monitor-scope-groups"
              >
                <Users className="h-4 w-4" />
                Grupos
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={aiFilter === "active" ? "default" : "outline"}
                className="h-8 gap-2"
                disabled={scope === "groups"}
                onClick={() => setAiFilter((value) => (value === "active" ? "all" : "active"))}
                title="Mostrar conversas em que a IA esta ativa nesta conversa"
                data-testid="monitor-filter-ai-active"
              >
                <Bot className="h-3.5 w-3.5" />
                IA ativa
              </Button>
              {scope === "groups" && (
                <span className="text-xs text-muted-foreground">Grupos ficam em leitura separada.</span>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <Input
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applySearch();
                }}
                placeholder="Buscar cliente, telefone, tenant ou mensagem"
                className="h-10"
              />
              <Button size="icon" variant="outline" onClick={applySearch} title="Buscar">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {search && (
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Filtro: {search}</span>
                <button type="button" className="font-medium text-slate-700 hover:underline" onClick={clearSearch}>
                  limpar
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando conversas
              </div>
            ) : listQuery.isError ? (
              <div className="space-y-3 p-6 text-sm text-muted-foreground" role="alert">
                <p>Nao foi possivel carregar as conversas.</p>
                <Button size="sm" variant="outline" onClick={() => listQuery.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Nenhuma conversa encontrada.</div>
            ) : (
              <div className="divide-y">
                {conversations.map((conversation) => {
                  const selected = selectedConversation?.id === conversation.id;
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => selectConversation(conversation)}
                      className={cn(
                        "flex w-full gap-3 p-3 text-left transition-colors hover:bg-slate-50",
                        selected && "bg-emerald-50 hover:bg-emerald-50",
                      )}
                      data-testid={`monitor-conversation-${conversation.id}`}
                    >
                      <Avatar className="h-11 w-11 shrink-0">
                        {conversation.contactAvatar ? (
                          <img src={conversation.contactAvatar} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <AvatarFallback>{initials(conversation.contactName || conversation.contactNumber)}</AvatarFallback>
                        )}
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{conversation.contactName || normalizePhone(conversation.contactNumber)}</p>
                            <p className="truncate text-xs text-muted-foreground">{conversation.ownerEmail || conversation.ownerName || "tenant sem email"}</p>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatTime(conversation.lastMessageTime)}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                          {conversation.lastMessageFromMe ? "Empresa: " : "Cliente: "}
                          {conversation.lastMessageText || "Sem texto"}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant={conversation.connectionConnected ? "default" : "secondary"} className="h-5 gap-1 px-1.5 text-[11px]">
                            {conversation.connectionConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                            {conversation.connectionConnected ? "online" : "offline"}
                          </Badge>
                          <Badge variant={isGroupConversation(conversation) ? "secondary" : "outline"} className="h-5 gap-1 px-1.5 text-[11px]">
                            {isGroupConversation(conversation) ? <Users className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
                            {isGroupConversation(conversation) ? "grupo" : "normal"}
                          </Badge>
                          <Badge variant={conversation.conversationAiActive ? "outline" : "secondary"} className="h-5 gap-1 px-1.5 text-[11px]">
                            <Bot className="h-3 w-3" />
                            {conversation.conversationAiActive ? "IA ativa" : "IA off"}
                          </Badge>
                          {Number(conversation.unreadCount || 0) > 0 && (
                            <Badge variant="destructive" className="h-5 px-1.5 text-[11px]">
                              {conversation.unreadCount} nova(s)
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t p-3">
            {loadMoreError && <p className="mb-2 text-xs text-red-600">{loadMoreError}</p>}
            <Button
              variant="outline"
              className="w-full"
              disabled={isLoadingMore || listQuery.isLoading || !pagination?.hasMore}
              onClick={loadMoreConversations}
            >
              {isLoadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {pagination?.hasMore ? "Carregar mais 50" : "Sem mais conversas"}
            </Button>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-[84px] items-center justify-between gap-4 border-b bg-white px-5">
            {selectedConversation ? (
              <>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-semibold">
                      {selectedConversation.contactName || normalizePhone(selectedConversation.contactNumber)}
                    </h3>
                    <Badge variant={isGroupConversation(selectedConversation) ? "secondary" : "outline"} className="gap-1">
                      {isGroupConversation(selectedConversation) ? <Users className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
                      {isGroupConversation(selectedConversation) ? "grupo" : "conversa normal"}
                    </Badge>
                    <Badge variant="outline">{normalizePhone(selectedConversation.contactNumber)}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {selectedConversation.ownerEmail || "tenant sem email"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {selectedConversation.connectionName || selectedConversation.connectionPhone || "conexao"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Bot className="h-3.5 w-3.5" />
                      {selectedConversation.agentName || "agente"}
                    </span>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0">assistindo</Badge>
              </>
            ) : (
              <div className="text-muted-foreground">Selecione uma conversa para assistir.</div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto bg-[#efeae2] p-5">
            {messagesQuery.isLoading && selectedConversationId ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando mensagens
              </div>
            ) : messagesQuery.isError ? (
              <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm text-muted-foreground" role="alert">
                <p>Nao foi possivel carregar as mensagens.</p>
                <Button size="sm" variant="outline" onClick={() => messagesQuery.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <div className="mx-auto flex max-w-5xl flex-col gap-3">
                {(messagesQuery.data?.messages || []).map((message) => {
                  const fromCompany = message.fromMe;
                  return (
                    <div key={message.id} className={cn("flex", fromCompany ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[74%] rounded-md border px-3 py-2 shadow-sm", messageTone(message))}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            {message.isFromAgent ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                            {speakerLabel(message)}
                          </span>
                          <span>{formatTime(message.timestamp)}</span>
                        </div>
                        {message.mediaUrl && message.mediaType?.startsWith("image") && (
                          <MessageImage src={message.mediaUrl} caption={message.mediaCaption || undefined} />
                        )}
                        {message.mediaUrl && message.mediaType === "audio" && (
                          <MessageAudio src={message.mediaUrl} duration={message.mediaDuration} fromMe={fromCompany} />
                        )}
                        {message.mediaUrl && message.mediaType && !message.mediaType.startsWith("image") && message.mediaType !== "audio" && (
                          <a className="text-sm font-medium underline" href={message.mediaUrl} target="_blank" rel="noreferrer">
                            Abrir midia
                          </a>
                        )}
                        {message.text && (
                          <div
                            className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: formatWhatsAppTextForHtml(message.text) }}
                          />
                        )}
                        {!message.text && !message.mediaUrl && (
                          <p className="text-sm italic text-muted-foreground">Mensagem sem conteudo visivel</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
