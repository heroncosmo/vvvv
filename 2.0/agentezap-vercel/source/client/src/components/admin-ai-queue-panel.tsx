import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Clock, Eye, ListChecks, MessageSquare, RefreshCw, Wifi } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type QueueStatusRow = {
  status: string;
  total: number;
  oldestAt?: string | null;
  newestAt?: string | null;
  maxRetry?: number | null;
};

type RecentSource = "principal" | "timer" | "all";

type RuntimeRun = {
  id: string;
  clientLabel: string;
  contactSuffix?: string | null;
  currentStage: string;
  queuedAt?: string | null;
  startedAt?: string | null;
  waitMs?: number;
  elapsedMs?: number;
};

type RuntimeEvent = {
  id: string;
  kind: string;
  at: string;
  ageMs?: number;
  clientLabel?: string | null;
  contactSuffix?: string | null;
  stage?: string | null;
  durationMs?: number | null;
  waitMs?: number | null;
  totalMs?: number | null;
  error?: string | null;
};

type RecentJob = {
  source: string;
  id: string;
  status: string;
  retryCount?: number | null;
  failureReason?: string | null;
  createdAt?: string | null;
  executeAt?: string | null;
  updatedAt?: string | null;
  ageSeconds?: number | null;
  elapsedSeconds?: number | null;
  jobTotalSeconds?: number | null;
  scheduledWaitSeconds?: number | null;
  queueLagSeconds?: number | null;
  processingSeconds?: number | null;
  whatsappToAppSeconds?: number | null;
  responseTimeSeconds?: number | null;
  deliveryStatus?: string | null;
  lastCustomerAt?: string | null;
  lastCustomerPersistedAt?: string | null;
  firstAgentAt?: string | null;
  firstAgentPersistedAt?: string | null;
  contactLabel?: string | null;
  contactSuffix?: string | null;
  accountLabel?: string | null;
  conversationLabel?: string | null;
};

type AdminAiQueueStatus = {
  generatedAt: string;
  runtime?: {
    enabled: boolean;
    activeSlots: number;
    maxConcurrent: number;
    queueLength: number;
    maxQueue: number;
    queueTimeoutMs: number;
    activeRuns: RuntimeRun[];
    queuedRuns: RuntimeRun[];
    recentCompleted: number;
    averageRunMs: number | null;
    recentEvents: RuntimeEvent[];
  };
  outbound?: {
    totalQueues: number;
    queues: Record<string, {
      queueLength: number;
      isProcessing: boolean;
      directExecutionPending?: number;
      totalSent: number;
      totalErrors: number;
      oldestQueuedAgeMs?: number;
      isPaused?: boolean;
      pauseRemainingMs?: number;
      priorityBreakdown?: Record<string, number>;
    }>;
  };
  persistent?: {
    jobSummary: QueueStatusRow[];
    legacySummary: QueueStatusRow[];
    recentJobs: RecentJob[];
    recentJobsPage?: {
      page: number;
      pageSize: number;
      source?: RecentSource;
      hasMore: boolean;
      totalLoaded: number;
    };
  };
  incoming?: Array<Record<string, any>>;
  directLatency2h?: {
    directInbound?: number;
    p50PersistSeconds?: number | null;
    p90PersistSeconds?: number | null;
    p95PersistSeconds?: number | null;
    maxPersistSeconds?: number | null;
    over120Seconds?: number | null;
    matchedIncomingLogs?: number | null;
    p90AppPersistSeconds?: number | null;
    maxAppPersistSeconds?: number | null;
    appOver5Seconds?: number | null;
  } | null;
  connectionEvents?: Array<{ eventType: string; total: number; lastAt?: string | null }>;
};

function formatDurationFromMs(value?: number | null): string {
  const ms = Number(value || 0);
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function formatSeconds(value?: number | null): string {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  return formatDurationFromMs(seconds * 1000);
}

function formatSecondsMetric(value?: number | null, empty = "-"): string {
  if (value == null) return empty;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return empty;
  return formatDurationFromMs(seconds * 1000);
}

function formatTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function countStatus(rows: QueueStatusRow[] | undefined, status: string): number {
  return (rows || []).filter((row) => row.status === status).reduce((sum, row) => sum + Number(row.total || 0), 0);
}

function statusBadgeClass(status: string): string {
  if (status === "processing") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function readableStatus(status: string): string {
  if (status === "processing") return "processando";
  if (status === "pending") return "aguardando";
  if (status === "completed") return "concluido";
  if (status === "failed") return "falhou";
  return status || "-";
}

function readableJobSource(source: string): string {
  if (source === "timer") return "retorno programado";
  if (source === "principal") return "atendimento real";
  return "atendimento real";
}

function readableDeliveryStatus(status?: string | null): string {
  if (!status) return "-";
  if (status === "pending" || status === "queued") return "aguardando envio";
  if (status === "sending") return "enviando";
  if (status === "sent") return "enviada";
  if (status === "delivered") return "entregue";
  if (status === "read") return "lida";
  if (status === "failed") return "falhou";
  return status;
}

function readableEventKind(kind: string): string {
  if (kind === "queued") return "aguardando";
  if (kind === "started") return "iniciado";
  if (kind === "target_started" || kind === "processing") return "processando";
  if (kind === "target_failed" || kind === "retrying") return "nova tentativa";
  if (kind === "completed") return "concluido";
  if (kind === "failed") return "falhou";
  if (kind === "released") return "liberado";
  return "atendimento";
}

function readableConnectionEvent(eventType: string): string {
  if (eventType === "connected") return "conectou";
  if (eventType === "disconnected") return "desconectou";
  if (eventType === "messages_recovered") return "mensagens recuperadas";
  return "evento de conexao";
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  accent = "default",
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  accent?: "default" | "green" | "amber" | "red";
}) {
  return (
    <Card className={cn(accent === "red" && "border-red-200 bg-red-50/40", accent === "amber" && "border-amber-200 bg-amber-50/40", accent === "green" && "border-emerald-200 bg-emerald-50/40")}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminAiQueuePanel() {
  const [recentPage, setRecentPage] = useState(1);
  const [recentSource, setRecentSource] = useState<RecentSource>("principal");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const recentPageSize = 30;
  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<AdminAiQueueStatus>({
    queryKey: ["/api/admin/ai-queue/status", recentPage, recentPageSize, recentSource],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/ai-queue/status?page=${recentPage}&pageSize=${recentPageSize}&source=${recentSource}`);
      return response.json();
    },
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
  });

  const jobSummary = data?.persistent?.jobSummary || [];
  const legacySummary = data?.persistent?.legacySummary || [];
  const activeCount = countStatus(jobSummary, "processing") + countStatus(legacySummary, "processing");
  const pendingCount = countStatus(jobSummary, "pending") + countStatus(legacySummary, "pending");
  const failedCount = countStatus(jobSummary, "failed") + countStatus(legacySummary, "failed");
  const recentCompleted = countStatus(jobSummary, "completed") + countStatus(legacySummary, "completed");

  const outboundRows = useMemo(() => {
    const queues = data?.outbound?.queues || {};
    return Object.entries(queues)
      .map(([key, queue]) => ({ key, ...queue }))
      .sort((a, b) => Number(b.oldestQueuedAgeMs || 0) - Number(a.oldestQueuedAgeMs || 0));
  }, [data?.outbound?.queues]);

  const recentJobs = data?.persistent?.recentJobs || [];
  const recentJobsPage = data?.persistent?.recentJobsPage;
  const runtime = data?.runtime;
  const updatedAt = data?.generatedAt ? formatTime(data.generatedAt) : "-";
  const changeRecentSource = (source: RecentSource) => {
    setRecentSource(source);
    setRecentPage(1);
    setExpandedJobId(null);
  };
  const recentSourceOptions: Array<{ value: RecentSource; label: string }> = [
    { value: "principal", label: "Atendimento real" },
    { value: "timer", label: "Retornos programados" },
    { value: "all", label: "Todos" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fila</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhamento global de todos os agentes: recebimento, resposta, envio e entrega.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <StatCard title="Processando" value={activeCount + (runtime?.activeRuns.length || 0)} description={`${runtime?.activeSlots || 0}/${runtime?.maxConcurrent || 0} atendimentos ativos`} icon={Activity} accent={activeCount ? "amber" : "default"} />
        <StatCard title="Aguardando" value={pendingCount + (runtime?.queuedRuns.length || 0)} description={`Fila interna: ${runtime?.queueLength || 0}/${runtime?.maxQueue || 0}`} icon={ListChecks} accent={pendingCount ? "amber" : "default"} />
        <StatCard title="Concluidos recentes" value={recentCompleted || runtime?.recentCompleted || 0} description={`Media do atendimento: ${runtime?.averageRunMs ? formatDurationFromMs(runtime.averageRunMs) : "-"}`} icon={CheckCircle2} accent="green" />
        <StatCard title="Envio WhatsApp" value={data?.outbound?.totalQueues || 0} description={`${outboundRows.filter((row) => row.isProcessing).length} canais enviando agora`} icon={MessageSquare} />
        <StatCard title="Falhas recentes" value={failedCount} description={`Atualizado as ${updatedAt}`} icon={AlertTriangle} accent={failedCount ? "red" : "default"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Atendimentos em andamento</CardTitle>
            <CardDescription>Mostra quem esta aguardando vaga ou sendo processado agora.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando fila...</p>}
            {!isLoading && [...(runtime?.activeRuns || []), ...(runtime?.queuedRuns || [])].length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum atendimento em processamento neste instante.</p>
            )}
            {[...(runtime?.activeRuns || []), ...(runtime?.queuedRuns || [])].slice(0, 12).map((run) => (
              <div key={run.id} className="flex items-center justify-between rounded-lg border bg-background p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                      {run.currentStage}
                    </Badge>
                    <span className="text-xs text-muted-foreground">cliente {run.clientLabel || "em atendimento"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Espera {formatDurationFromMs(run.waitMs)} - tempo ativo {formatDurationFromMs(run.elapsedMs)}
                  </p>
                </div>
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recebimento e conexoes</CardTitle>
            <CardDescription>Separa atraso ate chegar no app do tempo interno para aparecer na tela.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Mensagens diretas analisadas</p>
                <p className="mt-1 text-xl font-semibold">{data?.directLatency2h?.directInbound || 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">WhatsApp -&gt; app P90</p>
                <p className="mt-1 text-xl font-semibold">{formatSeconds(data?.directLatency2h?.p90PersistSeconds)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Servidor -&gt; app P90</p>
                <p className="mt-1 text-xl font-semibold">{formatSeconds(data?.directLatency2h?.p90AppPersistSeconds)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Maior WhatsApp -&gt; app</p>
                <p className="mt-1 text-xl font-semibold">{formatSeconds(data?.directLatency2h?.maxPersistSeconds)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">WhatsApp -&gt; app acima de 2 min</p>
                <p className="mt-1 text-xl font-semibold">{data?.directLatency2h?.over120Seconds || 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Servidor -&gt; app acima de 5s</p>
                <p className="mt-1 text-xl font-semibold">{data?.directLatency2h?.appOver5Seconds || 0}</p>
              </div>
            </div>

            <div className="space-y-2">
              {(data?.connectionEvents || []).slice(0, 6).map((event) => (
                <div key={event.eventType} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-muted-foreground" />
                    {readableConnectionEvent(event.eventType)}
                  </span>
                  <span className="text-muted-foreground">{event.total} - {formatTime(event.lastAt)}</span>
                </div>
              ))}
              {(data?.connectionEvents || []).length === 0 && (
                <p className="text-sm text-muted-foreground">Sem eventos de conexao nas ultimas duas horas.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fila de envio</CardTitle>
          <CardDescription>Canais WhatsApp com mensagens aguardando ou em envio. Sem envio agora significa fila zerada no canal.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Canal</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fila</TableHead>
                <TableHead>Mais antiga</TableHead>
                <TableHead>Pausa</TableHead>
                <TableHead>Enviadas</TableHead>
                <TableHead>Falhas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outboundRows.slice(0, 20).map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-mono text-xs">{row.key}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={row.isProcessing ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-700"}>
                      {row.isProcessing ? "enviando" : "sem envio agora"}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.queueLength}</TableCell>
                  <TableCell>{formatDurationFromMs(row.oldestQueuedAgeMs)}</TableCell>
                  <TableCell>{row.isPaused ? formatDurationFromMs(row.pauseRemainingMs) : "-"}</TableCell>
                  <TableCell>{row.totalSent}</TableCell>
                  <TableCell>{row.totalErrors}</TableCell>
                </TableRow>
              ))}
              {outboundRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    Nenhuma fila de envio ativa agora.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Historico recente</CardTitle>
              <CardDescription>Mostra todos os agentes da plataforma, incluindo atendimentos em tempo real e registros salvos. Use os filtros para separar atendimento real dos retornos programados.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border bg-background p-1">
                {recentSourceOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={recentSource === option.value ? "default" : "ghost"}
                    size="sm"
                    className="h-8"
                    onClick={() => changeRecentSource(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={recentPage <= 1 || isFetching}
                onClick={() => {
                  setExpandedJobId(null);
                  setRecentPage((page) => Math.max(1, page - 1));
                }}
              >
                Anterior
              </Button>
              <span className="min-w-16 text-center text-xs text-muted-foreground">Pag. {recentJobsPage?.page || recentPage}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!recentJobsPage?.hasMore || isFetching}
                onClick={() => {
                  setExpandedJobId(null);
                  setRecentPage((page) => page + 1);
                }}
              >
                Proxima
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead>Cliente -&gt; resposta criada</TableHead>
                <TableHead>WhatsApp -&gt; app</TableHead>
                <TableHead>Gerando resposta</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead>Acao</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentJobs.map((job) => {
                const rowKey = `${job.source}-${job.id}`;
                const isExpanded = expandedJobId === rowKey;
                const responseLabel = job.source === "timer"
                  ? "retorno programado"
                  : formatSecondsMetric(job.responseTimeSeconds);
                return (
                  <Fragment key={rowKey}>
                    <TableRow>
                      <TableCell>{readableJobSource(job.source)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadgeClass(job.status)}>
                          {readableStatus(job.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[180px] truncate">
                          {job.contactLabel || "-"}
                        </div>
                        {job.contactSuffix && <div className="text-xs text-muted-foreground">{job.contactSuffix}</div>}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">{job.accountLabel || "-"}</TableCell>
                      <TableCell>{formatTime(job.createdAt)}</TableCell>
                      <TableCell className="font-medium">{responseLabel}</TableCell>
                      <TableCell>{formatSecondsMetric(job.whatsappToAppSeconds)}</TableCell>
                      <TableCell>{formatSecondsMetric(job.processingSeconds)}</TableCell>
                      <TableCell>{job.retryCount || 0}</TableCell>
                      <TableCell>{readableDeliveryStatus(job.deliveryStatus)}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => setExpandedJobId(isExpanded ? null : rowKey)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={11} className="bg-slate-50/70">
                          <div className="grid gap-3 py-2 text-sm md:grid-cols-4">
                            <div>
                              <p className="text-xs text-muted-foreground">Mensagem cliente</p>
                              <p className="font-medium">{formatTime(job.lastCustomerAt)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Apareceu no app</p>
                              <p className="font-medium">{formatTime(job.lastCustomerPersistedAt)} ({formatSecondsMetric(job.whatsappToAppSeconds)})</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">{job.source === "timer" ? "Retorno enviado" : "Primeira resposta"}</p>
                              <p className="font-medium">{formatTime(job.firstAgentAt)} ({responseLabel})</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Tempo total do job</p>
                              <p className="font-medium">{formatSecondsMetric(job.jobTotalSeconds ?? job.elapsedSeconds)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Espera programada</p>
                              <p className="font-medium">{formatSecondsMetric(job.scheduledWaitSeconds)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Fila apos horario</p>
                              <p className="font-medium">{formatSecondsMetric(job.queueLagSeconds)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Processamento</p>
                              <p className="font-medium">{formatSecondsMetric(job.processingSeconds)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Entrega</p>
                              <p className="font-medium">{readableDeliveryStatus(job.deliveryStatus)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Observacao</p>
                              <p className="font-medium">{job.failureReason || "-"}</p>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              {recentJobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="py-6 text-center text-sm text-muted-foreground">
                    Nenhum atendimento recente encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos do atendimento</CardTitle>
          <CardDescription>Eventos recentes do processamento em memoria, sem conteudo de mensagens.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(runtime?.recentEvents || []).slice(0, 30).map((event) => (
            <div key={event.id} className="flex flex-col gap-1 rounded-md border px-3 py-2 text-sm md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={statusBadgeClass(event.kind === "failed" ? "failed" : event.kind === "completed" ? "completed" : event.kind === "queued" ? "pending" : "processing")}>
                  {readableEventKind(event.kind)}
                </Badge>
                <span>{event.stage || "atendimento"}</span>
                <span className="text-xs text-muted-foreground">cliente {event.clientLabel || "em atendimento"}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {formatTime(event.at)} - total {formatDurationFromMs(event.totalMs)} - etapa {formatDurationFromMs(event.durationMs)}
              </div>
            </div>
          ))}
          {(runtime?.recentEvents || []).length === 0 && (
            <p className="text-sm text-muted-foreground">Sem eventos do atendimento desde o ultimo restart.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
