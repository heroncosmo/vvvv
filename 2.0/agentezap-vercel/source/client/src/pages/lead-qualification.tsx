import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ContextualHelpButton } from "@/components/contextual-help-button";
import PremiumBlocked from "@/components/premium-overlay";
import { AttentionPriorityBadge, AttentionSummary } from "@/components/attention-summary";
import { queryClient } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";
import { openAppRealtimeConnection } from "@/lib/app-realtime";
import type { Conversation, WhatsappConnection } from "@shared/schema";
import { AlertTriangle, Bot, BrainCircuit, ChevronRight, LifeBuoy, MessageSquareText, Siren, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type AttentionFilter = "critical" | "high" | "needsHumanAttention" | "all";

interface AttentionQueueResponse {
  data: Conversation[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

const FILTER_OPTIONS: Array<{
  value: AttentionFilter;
  label: string;
  description: string;
}> = [
  { value: "needsHumanAttention", label: "Precisa de humano", description: "Fila operacional principal" },
  { value: "critical", label: "Crítica", description: "Intervenções imediatas" },
  { value: "high", label: "Alta", description: "Crítica + alta" },
  { value: "all", label: "Todas", description: "Inclui conversas sem urgência" },
];

function formatConfidence(value: Conversation["attentionConfidence"]) {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return `${Math.round(parsed * 100)}%`;
}

export default function LeadQualificationPage() {
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<AttentionFilter>("all");
  const [connectionId, setConnectionId] = useState("all");
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(searchInput.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const { data: connections = [] } = useQuery<WhatsappConnection[]>({
    queryKey: ["/api/whatsapp/connections"],
  });

  const attentionQueueQueryKey = [
    "/api/attention-queue",
    filter,
    connectionId,
    query,
  ];

  const { data, isLoading } = useQuery<AttentionQueueResponse>({
    queryKey: attentionQueueQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        filter,
        limit: "100",
        offset: "0",
      });

      if (connectionId !== "all") {
        params.set("connectionId", connectionId);
      }

      if (query) {
        params.set("q", query);
      }

      const token = await getAuthToken();
      const response = await fetch(`/api/attention-queue?${params.toString()}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error("Falha ao carregar fila de atenção");
      }

      return response.json();
    },
  });

  useEffect(() => {
    let realtimeConnection: { close: () => Promise<void> } | null = null;
    let reconnectTimeout: number | undefined;
    let cancelled = false;

    const connectRealtime = async () => {
      try {
        realtimeConnection = await openAppRealtimeConnection({
          scope: "user",
          getToken: getAuthToken,
          onEvent: (payload) => {
            if (
              payload.type === "conversation_attention_updated" ||
              payload.type === "new_message" ||
              payload.type === "agent_response" ||
              payload.type === "message_sent"
            ) {
              queryClient.invalidateQueries({ queryKey: ["/api/attention-queue"] });
            }
          },
          onClose: () => {
            if (!cancelled) {
              reconnectTimeout = window.setTimeout(connectRealtime, 3000);
            }
          },
        });

        if (!realtimeConnection && !cancelled) {
          reconnectTimeout = window.setTimeout(connectRealtime, 3000);
        }
      } catch (_error) {
        if (!cancelled) {
          reconnectTimeout = window.setTimeout(connectRealtime, 3000);
        }
      }
    };

    void connectRealtime();

    return () => {
      cancelled = true;
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      void realtimeConnection?.close();
    };
  }, []);

  const conversations = data?.data || [];

  const summary = useMemo(() => {
    const critical = conversations.filter((conversation) => conversation.attentionPriority === "critica").length;
    const high = conversations.filter((conversation) =>
      conversation.attentionPriority === "critica" || conversation.attentionPriority === "alta"
    ).length;
    const needsHumanAttention = conversations.filter((conversation) => conversation.needsHumanAttention).length;

    return {
      critical,
      high,
      needsHumanAttention,
      total: data?.total || 0,
    };
  }, [conversations, data?.total]);

  return (
    <PremiumBlocked
      title="Fila de Atenção Prioritária"
      subtitle="Seu período de teste acabou"
      description="Assine um plano para manter a fila operacional de atenção humana atualizada em tempo real."
      ctaLabel="Ativar Plano Ilimitado"
    >
      <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.22),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.02),_rgba(15,23,42,0))] p-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Badge variant="outline" className="rounded-full border-orange-200 bg-orange-50 text-orange-700">
                Prioridade de Atendimento
              </Badge>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Fila de Atenção</h1>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  A IA ordena quais conversas merecem o próximo olhar humano com base no contexto real do atendimento.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <ContextualHelpButton
                articleId="funnel-overview"
                title="Como usar a Fila de Atenção"
                description="Entenda como a IA decide quais conversas sobem primeiro para atenção humana."
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Card className="border-rose-200 bg-rose-50/80">
              <CardHeader className="pb-2">
                <CardDescription>Críticas agora</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Siren className="h-5 w-5 text-rose-600" />
                  {summary.critical}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-orange-200 bg-orange-50/80">
              <CardHeader className="pb-2">
                <CardDescription>Alta prioridade</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  {summary.high}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-sky-200 bg-sky-50/80">
              <CardHeader className="pb-2">
                <CardDescription>Precisam de humano</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Users className="h-5 w-5 text-sky-600" />
                  {summary.needsHumanAttention}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-slate-200 bg-slate-50/80">
              <CardHeader className="pb-2">
                <CardDescription>Itens retornados</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <BrainCircuit className="h-5 w-5 text-slate-700" />
                  {summary.total}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card className="border-border/70 bg-background/85 backdrop-blur">
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Fila operacional</CardTitle>
                  <CardDescription>
                    Filtre por severidade, conexão e contexto do cliente.
                  </CardDescription>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Buscar por nome, número, motivo ou última mensagem"
                />

                <select
                  value={connectionId}
                  onChange={(event) => setConnectionId(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">Todas as conexões</option>
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.connectionName || connection.phoneNumber || connection.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                {FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFilter(option.value)}
                    className={`rounded-2xl border px-3 py-2 text-left transition ${
                      filter === option.value
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-border bg-background hover:border-slate-300 hover:bg-muted/60"
                    }`}
                  >
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className={`text-xs ${filter === option.value ? "text-slate-200" : "text-muted-foreground"}`}>
                      {option.description}
                    </div>
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent>
              {isLoading ? (
                <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                  Carregando fila de atenção...
                </div>
              ) : conversations.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-10 text-center">
                  <LifeBuoy className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Nenhuma conversa nesta fila</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ajuste os filtros ou aguarde novas avaliações da IA.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {conversations.map((conversation) => {
                    const displayName =
                      conversation.contactName ||
                      conversation.contactNumber ||
                      conversation.remoteJid?.split("@")[0] ||
                      "Contato";

                    return (
                      <article
                        key={conversation.id}
                        className="rounded-3xl border border-border/70 bg-background p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <AttentionPriorityBadge
                                priority={conversation.attentionPriority}
                                needsHumanAttention={conversation.needsHumanAttention}
                              />
                              {conversation.connectionId && connectionId === "all" && (
                                <Badge variant="secondary" className="rounded-full">
                                  <Bot className="mr-1 h-3 w-3" />
                                  {connections.find((item) => item.id === conversation.connectionId)?.connectionName || "Conexão"}
                                </Badge>
                              )}
                              {conversation.lastMessageTime && (
                                <Badge variant="outline" className="rounded-full">
                                  {formatDistanceToNow(new Date(conversation.lastMessageTime), {
                                    addSuffix: true,
                                    locale: ptBR,
                                  })}
                                </Badge>
                              )}
                            </div>

                            <div className="mt-3 flex items-start gap-3">
                              <div className="rounded-2xl bg-slate-900 p-3 text-white">
                                <MessageSquareText className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h2 className="truncate text-base font-semibold">{displayName}</h2>
                                <p className="text-sm text-muted-foreground">{conversation.contactNumber}</p>
                                <p className="mt-3 line-clamp-2 text-sm text-foreground/90">
                                  {conversation.lastMessageText || "Sem prévia da última mensagem."}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="w-full max-w-xl space-y-3 lg:w-[30rem]">
                            <AttentionSummary
                              priority={conversation.attentionPriority}
                              needsHumanAttention={conversation.needsHumanAttention}
                              reason={conversation.attentionReason}
                              confidence={conversation.attentionConfidence}
                            />

                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/50 px-4 py-3">
                              <div className="text-sm text-muted-foreground">
                                Confiança: <span className="font-medium text-foreground">{formatConfidence(conversation.attentionConfidence) || "N/A"}</span>
                              </div>
                              <Button
                                className="rounded-full"
                                onClick={() => setLocation(`/conversas/${conversation.id}`)}
                              >
                                Abrir conversa
                                <ChevronRight className="ml-1 h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PremiumBlocked>
  );
}
