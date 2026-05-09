import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type BlogCadence = {
  canPublish: boolean;
  waitHours: number;
  reason: string | null;
  publishedToday: number;
  clusterPublishedThisWeek: number;
  maxPostsPerDay: number;
  minHoursBetweenPosts: number;
  maxClusterPostsPerWeek: number;
};

type BlogAutomationSettings = {
  publishEnabled: boolean;
  discoveryEnabled: boolean;
  refreshEnabled: boolean;
  autoApproveEnabled: boolean;
  autoPublishEnabled: boolean;
  publishMaxPerDay: number;
  publishMinHoursBetween: number;
  publishMaxClusterPerWeek: number;
  autoRewriteAttempts: number;
};

type BlogDashboard = {
  metrics: {
    topics: number;
    posts: {
      total: number;
      published: number;
      ready: number;
      archived: number;
      rejected: number;
    };
    automation: BlogAutomationSettings;
    latestChecks: Array<Record<string, unknown>>;
    latestContextPacks: Array<Record<string, unknown>>;
    cadence: BlogCadence;
  };
  pendingTopics: Array<Record<string, unknown>>;
  contextPacks: Array<Record<string, unknown>>;
  recentPosts: Array<Record<string, unknown>>;
  generationQueue: Array<Record<string, unknown>>;
  publishQueue: Array<Record<string, unknown>>;
};

function formatDate(value: unknown): string {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("pt-BR");
}

function getStatusVariant(status: unknown): "default" | "secondary" | "destructive" | "outline" {
  switch (String(status || "")) {
    case "published":
      return "default";
    case "ready":
    case "deferred":
    case "completed":
    case "auto-approved":
      return "secondary";
    case "blocked":
    case "rejected":
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

function getStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function getReviewObject(review: unknown): Record<string, unknown> {
  return review && typeof review === "object" ? review as Record<string, unknown> : {};
}

function getReviewDecision(review: unknown): string {
  return String(getReviewObject(review).approvalDecision || "needs-review");
}

function getReviewScore(review: unknown): string {
  const value = getReviewObject(review).qualityScore;
  return typeof value === "number" ? String(Math.round(value)) : "-";
}

function getReviewReasons(review: unknown): string[] {
  return getStringList(getReviewObject(review).blockingReasons);
}

function getReviewActions(review: unknown): string[] {
  const reviewObject = getReviewObject(review);
  return getStringList(reviewObject.improvementActions).slice(0, 4);
}

function getReviewNotes(review: unknown): string {
  const reviewObject = getReviewObject(review);
  const notes = getStringList(reviewObject.notes);
  const refreshReason = typeof reviewObject.refreshReason === "string" ? reviewObject.refreshReason : "";
  return [...notes, refreshReason].filter(Boolean).join(" | ") || "-";
}

function getDecisionVariant(review: unknown): "default" | "secondary" | "destructive" | "outline" {
  switch (getReviewDecision(review)) {
    case "auto-approved":
      return "secondary";
    case "blocked":
      return "destructive";
    default:
      return "outline";
  }
}

function parseNumberInput(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = await response.json();
  return payload.data as T;
}

export default function AdminBlogPanel() {
  const { toast } = useToast();
  const [selectedContextPackId, setSelectedContextPackId] = useState<string>("");
  const [manualTopicId, setManualTopicId] = useState("");
  const [manualPostId, setManualPostId] = useState("");
  const [manualInstruction, setManualInstruction] = useState("Reescreva o post para ficar mais humano, mais claro e mais forte em SEO, sem inventar nada.");
  const [archiveReason, setArchiveReason] = useState("Arquivar com seguranca para revisar depois.");

  const dashboardQuery = useQuery<BlogDashboard>({
    queryKey: ["/api/admin/blog/dashboard"],
    queryFn: () => fetchJson<BlogDashboard>("/api/admin/blog/dashboard"),
    refetchInterval: 30000,
  });

  const contextPackQuery = useQuery<Record<string, unknown> | null>({
    queryKey: ["/api/admin/blog/context-packs", selectedContextPackId],
    queryFn: () => fetchJson<Record<string, unknown> | null>(`/api/admin/blog/context-packs/${selectedContextPackId}`),
    enabled: Boolean(selectedContextPackId),
  });

  const actionMutation = useMutation({
    mutationFn: async (input: { label: string; url: string; body?: Record<string, unknown> }) => {
      const response = await apiRequest("POST", input.url, input.body);
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog/context-packs", selectedContextPackId] });
      toast({
        title: "Blog atualizado",
        description: `${variables.label} executado com sucesso.`,
      });
    },
    onError: (error: Error, variables) => {
      toast({
        title: `Falha em ${variables.label.toLowerCase()}`,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const dashboard = dashboardQuery.data;
  const recentPosts = dashboard?.recentPosts || [];
  const pendingTopics = dashboard?.pendingTopics || [];
  const contextPacks = dashboard?.contextPacks || [];
  const automation = dashboard?.metrics.automation;

  const selectedContextPack = useMemo(() => {
    if (!selectedContextPackId) return null;
    return contextPackQuery.data || contextPacks.find((item) => String(item.id) === selectedContextPackId) || null;
  }, [contextPackQuery.data, contextPacks, selectedContextPackId]);

  const runAction = (label: string, url: string, body?: Record<string, unknown>) => {
    actionMutation.mutate({ label, url, body });
  };

  const updateAutomation = (patch: Partial<BlogAutomationSettings>) => {
    if (!automation) return;
    runAction("Configuracoes", "/api/admin/blog/settings", {
      ...automation,
      ...patch,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pautas rastreadas</CardDescription>
            <CardTitle>{dashboard?.metrics.topics || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Posts publicados</CardDescription>
            <CardTitle>{dashboard?.metrics.posts.published || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Prontos para fila</CardDescription>
            <CardTitle>{dashboard?.metrics.posts.ready || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Arquivados</CardDescription>
            <CardTitle>{dashboard?.metrics.posts.archived || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bloqueados</CardDescription>
            <CardTitle>{dashboard?.metrics.posts.rejected || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cadencia</CardDescription>
            <CardTitle className="text-base">
              {dashboard?.metrics.cadence.canPublish ? "Publicacao liberada" : "Governanca ativa"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">
            <div>Hoje: {dashboard?.metrics.cadence.publishedToday || 0}</div>
            <div>Cluster/semana: {dashboard?.metrics.cadence.clusterPublishedThisWeek || 0}</div>
            <div>Teto diario: {dashboard?.metrics.cadence.maxPostsPerDay || 0}</div>
            <div>Intervalo: {dashboard?.metrics.cadence.minHoursBetweenPosts || 0}h</div>
            <div>{dashboard?.metrics.cadence.reason || "Sem bloqueio no momento"}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Piloto automatico</CardTitle>
            <CardDescription>Automacao ligada por padrao, com reescrita automatica para insistir ate o artigo ficar forte o bastante para publicar.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">Discovery</div>
                <div className="text-sm text-muted-foreground">Encontrar pautas novas automaticamente.</div>
              </div>
              <Switch checked={Boolean(automation?.discoveryEnabled)} onCheckedChange={(value) => updateAutomation({ discoveryEnabled: value })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">Publicacao</div>
                <div className="text-sm text-muted-foreground">Permitir que o sistema publique sozinho quando passar na governanca.</div>
              </div>
              <Switch checked={Boolean(automation?.publishEnabled)} onCheckedChange={(value) => updateAutomation({ publishEnabled: value })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">Refresh</div>
                <div className="text-sm text-muted-foreground">Atualizar posts antigos com base em sinais do Search Console.</div>
              </div>
              <Switch checked={Boolean(automation?.refreshEnabled)} onCheckedChange={(value) => updateAutomation({ refreshEnabled: value })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">Auto-aprovacao</div>
                <div className="text-sm text-muted-foreground">Aprovar sem humano quando o score e os guardrails passarem.</div>
              </div>
              <Switch checked={Boolean(automation?.autoApproveEnabled)} onCheckedChange={(value) => updateAutomation({ autoApproveEnabled: value })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
              <div>
                <div className="font-medium">Auto-publicacao</div>
                <div className="text-sm text-muted-foreground">Depois de auto-aprovar, publicar sem clique manual se a cadencia permitir.</div>
              </div>
              <Switch checked={Boolean(automation?.autoPublishEnabled)} onCheckedChange={(value) => updateAutomation({ autoPublishEnabled: value })} />
            </div>
            <div className="rounded-lg border p-3">
              <div className="font-medium">Posts por dia</div>
              <div className="text-sm text-muted-foreground">Teto diario do dominio para o blog automatico.</div>
              <Input
                className="mt-3"
                type="number"
                min={1}
                max={24}
                value={String(automation?.publishMaxPerDay ?? 10)}
                onChange={(event) => updateAutomation({ publishMaxPerDay: parseNumberInput(event.target.value, 10) })}
              />
            </div>
            <div className="rounded-lg border p-3">
              <div className="font-medium">Intervalo minimo</div>
              <div className="text-sm text-muted-foreground">Horas minimas entre posts publicados.</div>
              <Input
                className="mt-3"
                type="number"
                min={1}
                max={24}
                value={String(automation?.publishMinHoursBetween ?? 1)}
                onChange={(event) => updateAutomation({ publishMinHoursBetween: parseNumberInput(event.target.value, 1) })}
              />
            </div>
            <div className="rounded-lg border p-3">
              <div className="font-medium">Cluster por semana</div>
              <div className="text-sm text-muted-foreground">Limite semanal para o mesmo cluster, mesmo com autores diferentes.</div>
              <Input
                className="mt-3"
                type="number"
                min={1}
                max={14}
                value={String(automation?.publishMaxClusterPerWeek ?? 4)}
                onChange={(event) => updateAutomation({ publishMaxClusterPerWeek: parseNumberInput(event.target.value, 4) })}
              />
            </div>
            <div className="rounded-lg border p-3">
              <div className="font-medium">Tentativas de reescrita</div>
              <div className="text-sm text-muted-foreground">Quantas vezes a IA tenta melhorar o post antes de segurar.</div>
              <Input
                className="mt-3"
                type="number"
                min={1}
                max={10}
                value={String(automation?.autoRewriteAttempts ?? 10)}
                onChange={(event) => updateAutomation({ autoRewriteAttempts: parseNumberInput(event.target.value, 10) })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operacao manual</CardTitle>
            <CardDescription>Use isso para forcar discovery, geracao, refresh, revisao, edicao e arquivamento seguro.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => runAction("Discovery", "/api/admin/blog/discovery/run", { limit: 8 })} disabled={actionMutation.isPending}>
                Descobrir pautas
              </Button>
              <Button onClick={() => runAction("Geracao", "/api/admin/blog/generate/run", manualTopicId ? { topicId: manualTopicId } : {})} disabled={actionMutation.isPending}>
                Gerar rascunho
              </Button>
              <Button onClick={() => runAction("Piloto automatico", "/api/admin/blog/generate/run", manualTopicId ? { topicId: manualTopicId, autoPublish: true } : { autoPublish: true })} disabled={actionMutation.isPending}>
                Rodar piloto
              </Button>
              <Button variant="outline" onClick={() => runAction("Sitemap", "/api/admin/blog/search-console/submit-sitemap")} disabled={actionMutation.isPending}>
                Enviar sitemap
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">Topic ID opcional</div>
                <Input value={manualTopicId} onChange={(event) => setManualTopicId(event.target.value)} placeholder="Usado na geracao manual" />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Post ID alvo</div>
                <Input value={manualPostId} onChange={(event) => setManualPostId(event.target.value)} placeholder="Usado em publicar, revisar, editar, arquivar e restore" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Instrucao para editar com IA</div>
              <Textarea value={manualInstruction} onChange={(event) => setManualInstruction(event.target.value)} className="min-h-[110px]" />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Motivo do arquivamento</div>
              <Input value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} placeholder="Arquivar com seguranca para revisar depois" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => runAction("Publicacao", "/api/admin/blog/publish/run", { postId: manualPostId })} disabled={actionMutation.isPending || !manualPostId}>
                Publicar por ID
              </Button>
              <Button variant="outline" onClick={() => runAction("Revisao IA", "/api/admin/blog/review/run", { postId: manualPostId })} disabled={actionMutation.isPending || !manualPostId}>
                Revisar com IA
              </Button>
              <Button variant="outline" onClick={() => runAction("Edicao IA", "/api/admin/blog/edit/run", { postId: manualPostId, instruction: manualInstruction })} disabled={actionMutation.isPending || !manualPostId}>
                Editar com IA
              </Button>
              <Button variant="outline" onClick={() => runAction("Refresh", "/api/admin/blog/refresh/run", manualPostId ? { postId: manualPostId } : {})} disabled={actionMutation.isPending}>
                Rodar refresh
              </Button>
              <Button variant="outline" onClick={() => runAction("Arquivamento", "/api/admin/blog/archive/run", { postId: manualPostId, reason: archiveReason })} disabled={actionMutation.isPending || !manualPostId}>
                Arquivar
              </Button>
              <Button variant="outline" onClick={() => runAction("Restore", "/api/admin/blog/restore/run", { postId: manualPostId })} disabled={actionMutation.isPending || !manualPostId}>
                Restaurar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Fila editorial</CardTitle>
            <CardDescription>Pautas, posts recentes, motivos de bloqueio e proximos passos recomendados pela revisao.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <div className="text-sm font-semibold">Topicos pendentes</div>
              <div className="space-y-3">
                {pendingTopics.length === 0 && <div className="text-sm text-muted-foreground">Nenhuma pauta pendente.</div>}
                {pendingTopics.map((topic) => (
                  <div key={String(topic.id)} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-medium">{String(topic.titleHint || topic.keywordPrimary || "Pauta")}</div>
                        <div className="text-sm text-muted-foreground">
                          {String(topic.keywordPrimary || "-")} • {String(topic.cluster || "-")} • score {String(topic.score || 0)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setManualTopicId(String(topic.id))}>
                          Usar no formulario
                        </Button>
                        <Button size="sm" onClick={() => runAction("Geracao", "/api/admin/blog/generate/run", { topicId: String(topic.id) })} disabled={actionMutation.isPending}>
                          Gerar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold">Posts recentes</div>
              <div className="space-y-3">
                {recentPosts.length === 0 && <div className="text-sm text-muted-foreground">Nenhum post na fila.</div>}
                {recentPosts.map((post) => (
                  <div key={String(post.id)} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">{String(post.title || post.slug || "Post")}</div>
                          <Badge variant={getStatusVariant(post.status)}>{String(post.status || "unknown")}</Badge>
                          <Badge variant={getDecisionVariant(post.semanticReview)}>{getReviewDecision(post.semanticReview)}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {String(post.keywordPrimary || "-")} • qualidade {getReviewScore(post.semanticReview)} • elegivel {formatDate(post.publishEligibleAt)}
                        </div>
                        <div className="text-sm text-muted-foreground">{getReviewNotes(post.semanticReview)}</div>

                        {getReviewReasons(post.semanticReview).length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-destructive">Bloqueios</div>
                            <ul className="list-disc pl-5 text-sm text-destructive">
                              {getReviewReasons(post.semanticReview).map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {getReviewActions(post.semanticReview).length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sugestoes da IA</div>
                            <ul className="list-disc pl-5 text-sm text-muted-foreground">
                              {getReviewActions(post.semanticReview).map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setManualPostId(String(post.id))}>
                          Usar no formulario
                        </Button>
                        {Boolean(post.contextPackId) && (
                          <Button size="sm" variant="outline" onClick={() => setSelectedContextPackId(String(post.contextPackId))}>
                            Ver contexto
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => runAction("Revisao IA", "/api/admin/blog/review/run", { postId: String(post.id) })} disabled={actionMutation.isPending}>
                          Revisar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => runAction("Edicao IA", "/api/admin/blog/edit/run", { postId: String(post.id), instruction: manualInstruction })} disabled={actionMutation.isPending}>
                          Editar com IA
                        </Button>
                        {String(post.status) !== "published" && String(post.status) !== "archived" && (
                          <Button size="sm" onClick={() => runAction("Publicacao", "/api/admin/blog/publish/run", { postId: String(post.id) })} disabled={actionMutation.isPending}>
                            Publicar
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => runAction("Refresh", "/api/admin/blog/refresh/run", { postId: String(post.id) })} disabled={actionMutation.isPending}>
                          Refresh
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => runAction("Inspecao", "/api/admin/blog/indexing/inspect", { postId: String(post.id) })} disabled={actionMutation.isPending}>
                          Inspecionar
                        </Button>
                        {String(post.status) === "archived" ? (
                          <Button size="sm" variant="outline" onClick={() => runAction("Restore", "/api/admin/blog/restore/run", { postId: String(post.id) })} disabled={actionMutation.isPending}>
                            Restaurar
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => runAction("Arquivamento", "/api/admin/blog/archive/run", { postId: String(post.id), reason: archiveReason })} disabled={actionMutation.isPending}>
                            Arquivar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Context pack</CardTitle>
              <CardDescription>Resumo, fontes e outline usados pelo orquestrador.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {contextPacks.slice(0, 8).map((pack) => (
                  <button
                    key={String(pack.id)}
                    type="button"
                    className="w-full rounded-lg border px-3 py-2 text-left hover:bg-muted"
                    onClick={() => setSelectedContextPackId(String(pack.id))}
                  >
                    <div className="font-medium">{String(pack.keywordPrimary || pack.id)}</div>
                    <div className="text-sm text-muted-foreground">{String(pack.cluster || "-")} • {formatDate(pack.createdAt)}</div>
                  </button>
                ))}
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                {!selectedContextPack && <div className="text-sm text-muted-foreground">Selecione um context pack para visualizar.</div>}
                {selectedContextPack && (
                  <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words text-xs">
                    {JSON.stringify(selectedContextPack, null, 2)}
                  </pre>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Jobs recentes</CardTitle>
              <CardDescription>Execucoes mais recentes de geracao, publicacao e indexacao.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-semibold">Geracao</div>
                <div className="space-y-2">
                  {(dashboard?.generationQueue || []).slice(0, 5).map((job) => (
                    <div key={String(job.id)} className="rounded-lg border p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span>{String(job.topicId || job.id)}</span>
                        <Badge variant={getStatusVariant(job.status)}>{String(job.status || "queued")}</Badge>
                      </div>
                      <div className="text-muted-foreground">{formatDate(job.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold">Publicacao</div>
                <div className="space-y-2">
                  {(dashboard?.publishQueue || []).slice(0, 5).map((job) => (
                    <div key={String(job.id)} className="rounded-lg border p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span>{String(job.postId || job.id)}</span>
                        <Badge variant={getStatusVariant(job.status)}>{String(job.status || "queued")}</Badge>
                      </div>
                      <div className="text-muted-foreground">{formatDate(job.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold">Indexacao</div>
                <div className="space-y-2">
                  {(dashboard?.metrics.latestChecks || []).slice(0, 5).map((check) => (
                    <div key={String(check.id)} className="rounded-lg border p-2 text-sm">
                      <div className="font-medium">{String(check.inspectedUrl || check.postId || check.id)}</div>
                      <div className="text-muted-foreground">
                        {String(check.indexingState || "sem estado")} • {formatDate(check.checkedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
