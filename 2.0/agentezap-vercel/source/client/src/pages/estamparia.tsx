import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowRight, Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

import {
  artSourceLabel,
  formatRelative,
  formatShortDate,
  prettifyStatus,
  requestTimestamp,
  STATUS_FILTERS,
  statusVariant,
  type EstampariaProfileResponse,
  type EstampariaRequestsResponse,
} from "./estamparia-shared";

export default function EstampariaPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["value"]>("all");
  const [day, setDay] = useState("");

  const profileQuery = useQuery<EstampariaProfileResponse>({
    queryKey: ["/api/estamparia/profile"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/estamparia/profile");
      return response.json();
    },
  });

  const requestsQuery = useQuery<EstampariaRequestsResponse>({
    queryKey: ["/api/estamparia/requests", deferredSearch, status, day],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (deferredSearch) params.set("q", deferredSearch);
      if (status) params.set("status", status);
      if (day) params.set("day", day);
      const response = await apiRequest("GET", `/api/estamparia/requests?${params.toString()}`);
      return response.json();
    },
  });

  const requests = requestsQuery.data?.data || [];
  const profile = profileQuery.data?.profile || null;
  const moduleIsActive = profile?.isActive === true;

  const requestStats = useMemo(() => {
    const counts = {
      total: requestsQuery.data?.total || 0,
      pendingReview: 0,
      awaitingCustomer: 0,
      approved: 0,
    };

    for (const request of requests) {
      if (request.status === "pending_review") counts.pendingReview += 1;
      if (request.status === "awaiting_customer") counts.awaitingCustomer += 1;
      if (request.status === "approved") counts.approved += 1;
    }

    return counts;
  }, [requests, requestsQuery.data?.total]);

  const profileMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      const response = await apiRequest("PATCH", "/api/estamparia/profile", { isActive });
      return response.json();
    },
    onSuccess: async (data: EstampariaProfileResponse) => {
      queryClient.setQueryData(["/api/estamparia/profile"], data);
      await queryClient.invalidateQueries({ queryKey: ["/api/estamparia/profile"] });
      toast({
        title: data.profile?.isActive ? "Estamparia ativada" : "Estamparia pausada",
        description: data.profile?.isActive
          ? "O módulo de pedidos de arte está ativo para este cliente."
          : "O módulo de pedidos de arte foi pausado para este cliente.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Falha ao atualizar Estamparia", description: error?.message || "Tente novamente.", variant: "destructive" });
    },
  });

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pedidos</h1>
                <Badge variant={moduleIsActive ? "default" : "secondary"}>
                  {moduleIsActive ? "Estamparia ativa" : "Estamparia pausada"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Artes mais recentes primeiro. Busque por cliente, código, produto ou data e abra o pedido para revisar.
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-4 py-3 lg:min-w-[280px]">
              <div>
                <p className="text-sm font-medium text-foreground">{profile?.businessName || "Perfil não configurado"}</p>
                <p className="text-xs text-muted-foreground">{profile ? "Controle por cliente" : "Cadastre o perfil antes de ativar"}</p>
              </div>
              <Switch
                checked={moduleIsActive}
                disabled={!profile || profileMutation.isPending}
                onCheckedChange={(checked) => profileMutation.mutate(checked)}
                aria-label="Ativar módulo Estamparia"
              />
            </div>
          </div>
        </section>

        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="gap-4 border-b border-border/70">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Pedidos de arte
                  <span className="text-sm font-normal text-muted-foreground">{requestStats.total} pedidos</span>
                </CardTitle>
                <CardDescription>Fila do arte-finalista com abertura individual por pedido.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="border border-border/70 bg-background">
                  {requestStats.pendingReview} em revisão
                </Badge>
                <Badge variant="secondary" className="border border-border/70 bg-background">
                  {requestStats.awaitingCustomer} com cliente
                </Badge>
                <Badge variant="secondary" className="border border-border/70 bg-background">
                  {requestStats.approved} aprovados
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr),180px]">
              <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar pedido, cliente ou produto"
                  className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </div>
              <Input type="date" value={day} onChange={(event) => setDay(event.target.value)} className="h-11 border-border/70" />
            </div>

            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={status === option.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatus(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <ScrollArea className="h-[72vh]">
              {requestsQuery.isLoading ? (
                <div className="flex min-h-[280px] items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando pedidos da Estamparia...
                </div>
              ) : requests.length === 0 ? (
                <div className="m-5 rounded-2xl border border-dashed border-border/70 bg-background/60">
                  <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">Nenhum pedido encontrado</p>
                      <p className="text-sm text-muted-foreground">
                        Assim que a IA identificar um briefing real na conversa, o pedido aparece aqui.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="hidden grid-cols-[120px,minmax(190px,1.1fr),minmax(200px,1.2fr),140px,150px,120px] gap-4 border-b border-border/70 bg-muted/30 px-5 py-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground lg:grid">
                    <span>Pedido</span>
                    <span>Cliente</span>
                    <span>Produto</span>
                    <span>Atualizado</span>
                    <span>Status</span>
                    <span className="text-right">Abrir</span>
                  </div>
                  <div className="divide-y divide-border/70">
                    {requests.map((request) => (
                      <button
                        key={request.id}
                        type="button"
                        onClick={() => setLocation(`/estamparia/${request.id}`)}
                        className="grid w-full gap-4 px-5 py-4 text-left transition hover:bg-muted/30 lg:grid-cols-[120px,minmax(190px,1.1fr),minmax(200px,1.2fr),140px,150px,120px] lg:items-center"
                      >
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">{request.requestCode}</p>
                          <p className="text-xs text-muted-foreground">{artSourceLabel(request)}</p>
                        </div>

                        <div className="space-y-1">
                          <p className="truncate font-medium text-foreground">{request.contactName || request.contactNumber}</p>
                          <p className="truncate text-sm text-muted-foreground">{request.contactNumber}</p>
                        </div>

                        <div className="min-w-0 space-y-1">
                          <p className="truncate font-medium text-foreground">{request.requestTitle || request.productType || "Pedido sem título"}</p>
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {request.briefingSummary || "Aguardando mais detalhes da conversa."}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">{formatShortDate(request)}</p>
                          <p className="text-xs text-muted-foreground">{formatRelative(requestTimestamp(request))}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={statusVariant(request.status)}>{prettifyStatus(request.status)}</Badge>
                          {request.briefingConfirmed ? <Badge variant="outline">Pronto</Badge> : null}
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:justify-end">
                          <span className="text-sm text-muted-foreground">{request.currentArtUrl ? "Com arte" : "Sem arte"}</span>
                          <span className="inline-flex items-center rounded-lg border border-border/70 px-3 py-1.5 text-xs font-medium text-foreground">
                            Abrir
                            <ArrowRight className="ml-2 h-3.5 w-3.5" />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
