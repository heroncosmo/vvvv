import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { CheckCircle2, ChevronRight, Clock3, Loader2, MessageSquare, RotateCcw, ShieldCheck, Square, Users, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type CampaignListItem = {
  id: string;
  name: string;
  status: string;
  campaignType?: string;
  totalContacts?: number;
  sentCount?: number;
  failedCount?: number;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
};

type CampaignDetail = CampaignListItem & {
  messageTemplate?: string;
  delayMinMs?: number;
  delayMaxMs?: number;
  batchSize?: number;
  batchPauseMs?: number;
  useAi?: boolean;
  contactsJson?: Array<{ id?: string; phone: string; name?: string; sequenceIndex?: number; connectionId?: string | null }>;
  resultsJson?: Array<{ contactId?: string; phone: string; name?: string; status: string; error?: string; sentAt?: string; message?: string; retryAt?: string | null; retryAttempt?: number; inboundGate?: Record<string, any> }>;
  metadataJson?: Record<string, any>;
};

function formatPhone(phone?: string) {
  const clean = String(phone || "").replace(/\D/g, "");
  if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  if (clean.length === 13) return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  return clean || "Sem numero";
}

function formatDate(value?: string) {
  if (!value) return "Sem horario";
  return new Date(value).toLocaleString("pt-BR");
}

function contactKey(item: { id?: string; contactId?: string; phone?: string }) {
  return String(item.contactId || item.id || item.phone || "").replace(/\D/g, "") || String(item.contactId || item.id || item.phone || "");
}

function isFinalResult(status?: string) {
  const value = String(status || "").toLowerCase();
  return value === "sent" || value === "failed" || value === "queued";
}

function getLatestRetryByContact(results: NonNullable<CampaignDetail["resultsJson"]>) {
  const map = new Map<string, NonNullable<CampaignDetail["resultsJson"]>[number]>();
  for (const result of results) {
    if (String(result.status || "").toLowerCase() !== "retrying") continue;
    const key = contactKey(result);
    const previous = map.get(key);
    if (!previous || new Date(result.sentAt || 0).getTime() >= new Date(previous.sentAt || 0).getTime()) {
      map.set(key, result);
    }
  }
  return map;
}

function resolvePendingGateInfo(metadata: Record<string, any> | undefined, contact: any, index: number) {
  const inboundGate = metadata?.inboundGate && typeof metadata.inboundGate === "object" ? metadata.inboundGate : null;
  const rotationIds = Array.isArray(metadata?.rotationConnectionIds) ? metadata.rotationConnectionIds : [];
  const sequenceIndex = typeof contact?.sequenceIndex === "number" ? contact.sequenceIndex : index;
  const connectionId = contact?.connectionId || (rotationIds.length ? rotationIds[Math.abs(sequenceIndex) % rotationIds.length] : null);
  const state = connectionId && inboundGate?.connections && typeof inboundGate.connections === "object"
    ? inboundGate.connections[connectionId]
    : null;
  const lastDecision = metadata?.inboundGateLastDecision && typeof metadata.inboundGateLastDecision === "object"
    ? metadata.inboundGateLastDecision
    : null;
  const requiredMessages = Number(inboundGate?.requiredMessages || lastDecision?.requiredMessages || 10);
  const inboundCount = Number(state?.lastInboundCount ?? lastDecision?.bestConnection?.inboundCount ?? 0);
  const waitUntil = state?.waitUntil || lastDecision?.bestConnection?.waitUntil || lastDecision?.nextDueAt || null;

  if (!state && lastDecision?.reason !== "waiting_inbound_messages") return null;

  return {
    inboundCount,
    requiredMessages,
    waitUntil,
  };
}

function resolveBusinessHoursInfo(metadata: Record<string, any> | undefined) {
  const safety = metadata?.broadcastSafety && typeof metadata.broadcastSafety === "object" ? metadata.broadcastSafety : {};
  const decision = metadata?.businessHoursLastDecision && typeof metadata.businessHoursLastDecision === "object"
    ? metadata.businessHoursLastDecision
    : null;
  const enabled = safety.businessHoursEnabled !== false;
  if (!enabled) return { enabled: false, waiting: false };
  return {
    enabled: true,
    waiting: decision?.reason === "outside_business_hours",
    startHour: Number(safety.businessHoursStartHour || decision?.startHour || 8),
    endHour: Number(safety.businessHoursEndHour || decision?.endHour || 20),
    nextDueAt: decision?.nextDueAt || metadata?.nextDueAt || null,
  };
}

function normalizeDetails(campaign: CampaignListItem, detail?: Partial<CampaignDetail> | null) {
  const contacts = Array.isArray(detail?.contactsJson) ? detail.contactsJson : [];
  const results = Array.isArray(detail?.resultsJson) ? detail.resultsJson : [];
  const sent = results.filter((item) => item.status === "sent");
  const failed = results.filter((item) => item.status === "failed");
  const retryingByContact = getLatestRetryByContact(results);
  const finalKeys = new Set(results.filter((item) => isFinalResult(item.status)).map((item) => contactKey(item)));
  const pending = contacts
    .filter((item) => !finalKeys.has(contactKey(item)))
    .map((item, index) => ({
      ...item,
      retrying: retryingByContact.get(contactKey(item)) || null,
      gateInfo: resolvePendingGateInfo(detail?.metadataJson, item, index),
    }));

  return {
    ...campaign,
    ...detail,
    messageTemplate: detail?.messageTemplate || "",
    contacts,
    sent,
    failed,
    pending,
    totalContacts: Number(detail?.totalContacts ?? campaign.totalContacts ?? contacts.length ?? 0),
    sentCount: Number(detail?.sentCount ?? campaign.sentCount ?? sent.length),
    failedCount: Number(detail?.failedCount ?? campaign.failedCount ?? failed.length),
    retryingCount: Array.from(retryingByContact.keys()).filter((key) => !finalKeys.has(key)).length,
    businessHoursInfo: resolveBusinessHoursInfo(detail?.metadataJson),
  };
}

function statusBadge(status: string) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "running") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "pending") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "scheduled") return "bg-violet-50 text-violet-700 border-violet-200";
  if (status === "cancelled") return "bg-orange-50 text-orange-700 border-orange-200";
  if (status === "error") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-stone-100 text-stone-700 border-stone-200";
}

function canStopCampaign(status?: string) {
  return status === "running" || status === "pending" || status === "scheduled";
}

export default function CampaignsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [matchDetail, params] = useRoute("/campanhas/:id");
  const [, setLocation] = useLocation();

  const { data: campaigns = [], isLoading } = useQuery<CampaignListItem[]>({
    queryKey: ["/api/campaigns"],
    refetchInterval: 5000,
  });

  const selectedId = matchDetail ? params?.id : campaigns[0]?.id;

  useEffect(() => {
    if (!matchDetail && campaigns[0]?.id) {
      setLocation(`/campanhas/${campaigns[0].id}`, { replace: true });
    }
  }, [campaigns, matchDetail, setLocation]);

  const selectedCampaign = useMemo(
    () => campaigns.find((item) => item.id === selectedId) || campaigns[0] || null,
    [campaigns, selectedId],
  );

  const { data: detailData, isFetching } = useQuery<CampaignDetail>({
    queryKey: ["/api/campaigns", selectedCampaign?.id],
    queryFn: async () => (await apiRequest("GET", `/api/campaigns/${selectedCampaign?.id}`)).json(),
    enabled: !!selectedCampaign?.id,
    refetchInterval: canStopCampaign(selectedCampaign?.status) ? 5000 : false,
  });

  const detail = selectedCampaign ? normalizeDetails(selectedCampaign, detailData) : null;

  const stopCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      await apiRequest("PUT", `/api/campaigns/${campaignId}/cancel`);
      return campaignId;
    },
    onSuccess: async (campaignId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] }),
      ]);
      toast({
        title: "Campanha parada",
        description: "O servidor recebeu o comando para interromper a campanha.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao parar campanha",
        description: error.message || "Nao foi possivel parar a campanha agora.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando campanhas...</div>;
  }

  if (!campaigns.length) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma campanha enviada ainda.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Campanhas</p>
          <h1 className="text-3xl font-semibold tracking-tight">Detalhes organizados de cada envio</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Veja em tempo real quais numeros ja receberam, quais ainda vao receber, o horario de cada envio e o texto usado na campanha.
          </p>
        </div>
        <a href="/envio-em-massa">
          <Button>Nova campanha</Button>
        </a>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px,minmax(0,1fr)]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-lg">Lista de campanhas</CardTitle>
            <CardDescription>Selecione uma campanha para abrir o painel completo.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[70vh] pr-3">
              <div className="space-y-3">
                {campaigns.map((campaign) => (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => setLocation(`/campanhas/${campaign.id}`)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      campaign.id === detail?.id ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{campaign.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDate(campaign.completedAt || campaign.startedAt || campaign.createdAt)}</p>
                      </div>
                      <Badge variant="outline" className={statusBadge(campaign.status)}>
                        {campaign.status}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-xl bg-muted/60 p-2 text-center">
                        <p className="font-semibold">{campaign.totalContacts || 0}</p>
                        <p className="text-muted-foreground">Total</p>
                      </div>
                      <div className="rounded-xl bg-emerald-50 p-2 text-center text-emerald-700">
                        <p className="font-semibold">{campaign.sentCount || 0}</p>
                        <p>Enviados</p>
                      </div>
                      <div className="rounded-xl bg-rose-50 p-2 text-center text-rose-700">
                        <p className="font-semibold">{campaign.failedCount || 0}</p>
                        <p>Falhas</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {detail && (
          <div className="space-y-5">
            <Card className="border-border/70">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="text-2xl">{detail.name}</CardTitle>
                    <CardDescription className="mt-2">
                      Criada em {formatDate(detail.createdAt)}. {isFetching ? "Atualizando status..." : "Painel completo da campanha."}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canStopCampaign(detail.status) && (
                      <Button
                        variant="outline"
                        className="border-red-200 text-red-700 hover:bg-red-50"
                        disabled={stopCampaignMutation.isPending}
                        onClick={() => stopCampaignMutation.mutate(detail.id)}
                      >
                        {stopCampaignMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Square className="mr-2 h-4 w-4" />
                        )}
                        Parar campanha
                      </Button>
                    )}
                    <Badge variant="outline" className={statusBadge(detail.status)}>{detail.status}</Badge>
                    <Badge variant="outline">{detail.campaignType === "referral_outreach" ? "Referral outreach" : "Envio em massa"}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 md:grid-cols-4">
                  <Card><CardContent className="p-4 text-center"><Users className="mx-auto mb-2 h-5 w-5 text-blue-600" /><p className="text-2xl font-semibold">{detail.totalContacts || 0}</p><p className="text-xs text-muted-foreground">Destinatarios</p></CardContent></Card>
                  <Card><CardContent className="p-4 text-center"><CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-600" /><p className="text-2xl font-semibold text-emerald-600">{detail.sentCount || 0}</p><p className="text-xs text-muted-foreground">Ja enviados</p></CardContent></Card>
                  <Card><CardContent className="p-4 text-center"><Clock3 className="mx-auto mb-2 h-5 w-5 text-amber-600" /><p className="text-2xl font-semibold text-amber-600">{detail.pending.length}</p><p className="text-xs text-muted-foreground">Ainda vao enviar</p></CardContent></Card>
                  <Card><CardContent className="p-4 text-center"><XCircle className="mx-auto mb-2 h-5 w-5 text-rose-600" /><p className="text-2xl font-semibold text-rose-600">{detail.failedCount || 0}</p><p className="text-xs text-muted-foreground">Falhas</p></CardContent></Card>
                </div>

                {detail.status === "running" && detail.businessHoursInfo?.waiting && (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-900">
                    <div className="flex items-start gap-3">
                      <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                      <div>
                        <p className="font-semibold">Horario de envio ativo</p>
                        <p className="mt-1 text-blue-800">
                          A campanha esta pausada fora do horario 08:00-20:00 de Brasilia e continua automaticamente no proximo periodo permitido.
                          {detail.businessHoursInfo.nextDueAt ? ` Proxima tentativa: ${formatDate(detail.businessHoursInfo.nextDueAt)}.` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {detail.status === "running" && detail.pending.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                      <div>
                        <p className="font-semibold">Anti-banimento ativo</p>
                        <p className="mt-1 text-amber-800">
                          A campanha pode aguardar mensagens recebidas antes do proximo disparo. Quando a conexao recebe o limite configurado, o envio continua; se a janela vencer, o sistema libera um envio controlado.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border p-4"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Inicio</p><p className="mt-2 text-sm">{formatDate(detail.startedAt || detail.createdAt)}</p></div>
                  <div className="rounded-2xl border p-4"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Fim</p><p className="mt-2 text-sm">{formatDate(detail.completedAt)}</p></div>
                  <div className="rounded-2xl border p-4"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Delay</p><p className="mt-2 text-sm">{Math.round((detail.delayMinMs || 0) / 1000)}s a {Math.round((detail.delayMaxMs || 0) / 1000)}s</p></div>
                  <div className="rounded-2xl border p-4"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Lote</p><p className="mt-2 text-sm">{detail.batchSize || 10} contatos e pausa de {Math.round((detail.batchPauseMs || 0) / 60000)} min</p></div>
                </div>

                {!!detail.messageTemplate && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />Mensagem usada</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-wrap rounded-2xl bg-muted/60 p-4 text-sm leading-6">{detail.messageTemplate}</p>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-5 xl:grid-cols-3">
              <Card className="border-emerald-200">
                <CardHeader><CardTitle className="text-base text-emerald-700">Ja enviados</CardTitle><CardDescription>Horario, nome e numero de quem ja recebeu.</CardDescription></CardHeader>
                <CardContent>
                  <ScrollArea className="h-[360px] pr-3">
                    <div className="space-y-3">
                      {detail.sent.length ? detail.sent.map((item, index) => (
                        <div key={`${item.contactId || item.phone}-${index}`} className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3">
                          <p className="font-medium">{item.name || "Sem nome"}</p>
                          <p className="text-sm text-muted-foreground">{formatPhone(item.phone)}</p>
                          <p className="mt-2 text-xs text-emerald-700">{formatDate(item.sentAt)}</p>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">Nenhum envio concluido ainda.</p>}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="border-amber-200">
                <CardHeader><CardTitle className="text-base text-amber-700">Ainda vao enviar</CardTitle><CardDescription>Fila restante, retentativas e espera do anti-banimento.</CardDescription></CardHeader>
                <CardContent>
                  <ScrollArea className="h-[360px] pr-3">
                    <div className="space-y-3">
                      {detail.pending.length ? detail.pending.map((item, index) => (
                        <div key={`${item.id || item.phone}-${index}`} className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{item.name || "Sem nome"}</p>
                              <p className="text-sm text-muted-foreground">{formatPhone(item.phone)}</p>
                            </div>
                            {item.retrying ? (
                              <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                                <RotateCcw className="mr-1 h-3 w-3" />
                                Retentativa
                              </Badge>
                            ) : null}
                          </div>
                          {item.retrying ? (
                            <p className="mt-2 text-xs leading-5 text-orange-700">
                              {item.retrying.error || "Falha temporaria. Nova tentativa automatica agendada."}
                              {item.retrying.retryAttempt ? ` Tentativa ${item.retrying.retryAttempt}.` : ""}
                              {item.retrying.retryAt ? ` Proxima tentativa: ${formatDate(item.retrying.retryAt)}.` : ""}
                            </p>
                          ) : item.gateInfo ? (
                            <p className="mt-2 text-xs leading-5 text-amber-700">
                              Anti-banimento: recebeu {item.gateInfo.inboundCount}/{item.gateInfo.requiredMessages} mensagens nesta janela.
                              {item.gateInfo.waitUntil ? ` Nova checagem/liberacao: ${formatDate(item.gateInfo.waitUntil)}.` : ""}
                            </p>
                          ) : null}
                        </div>
                      )) : <p className="text-sm text-muted-foreground">Nenhum numero pendente.</p>}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="border-rose-200">
                <CardHeader><CardTitle className="text-base text-rose-700">Falhas</CardTitle><CardDescription>Nomes, numeros, horario e motivo seguro do erro.</CardDescription></CardHeader>
                <CardContent>
                  <ScrollArea className="h-[360px] pr-3">
                    <div className="space-y-3">
                      {detail.failed.length ? detail.failed.map((item, index) => (
                        <div key={`${item.contactId || item.phone}-${index}`} className="rounded-2xl border border-rose-200 bg-rose-50/50 p-3">
                          <p className="font-medium">{item.name || "Sem nome"}</p>
                          <p className="text-sm text-muted-foreground">{formatPhone(item.phone)}</p>
                          <p className="mt-2 text-xs text-rose-700">{formatDate(item.sentAt)}</p>
                          <p className="mt-1 text-xs text-rose-700">{item.error || "Falha sem detalhe"}</p>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">Nenhuma falha registrada.</p>}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end">
              <a href="/envio-em-massa">
                <Button variant="outline">Voltar para envio em massa <ChevronRight className="ml-2 h-4 w-4" /></Button>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
