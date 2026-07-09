import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  CreditCard,
  Loader2,
  RefreshCw,
  Send,
  ShoppingCart,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type RecoveryConfig = {
  enabled: boolean;
  firstDelayMinutes: number;
  secondDelayMinutes: number;
  includePixCodeFirstMessage: boolean;
  sendSecondReminder: boolean;
  firstMessageTemplate: string;
  secondMessageTemplate: string;
  activatedAt: string;
};

type OrdersReport = {
  summary?: {
    uniqueClientsGenerated?: number;
    uniqueClientsPaid?: number;
    uniqueClientsNotPaid?: number;
    conversionPercent?: number;
    abandonmentPercent?: number;
    rawSubscriptionRecords?: number;
    rawActiveRecords?: number;
    rawPendingPixRecords?: number;
  };
  byDay?: Array<{
    day: string;
    generated: number;
    paid: number;
    not_paid: number;
    conversion_percent: number;
  }>;
  byPlan?: Array<{
    plan_name: string;
    generated: number;
    paid: number;
    not_paid: number;
    conversion_percent: number;
  }>;
  orders?: Array<{
    subscription_id: string;
    name: string;
    email: string;
    phone: string;
    period_status: string;
    latest_status: string;
    outcome: "paid_active" | "generated_not_paid" | string;
    plan_name: string;
    plan_value: string;
    data_inicio: string;
    account_created_at: string;
    attempts_in_period: number;
    hours_account_to_generate: number;
    recovery_sent_count: number;
    last_sent_at?: string | null;
    last_error?: string | null;
    has_pix_code?: boolean;
  }>;
  recentMessages?: Array<{
    id: string;
    subscription_id: string;
    step: number;
    status: string;
    phone: string;
    error?: string | null;
    created_at: string;
    name?: string | null;
    email?: string | null;
  }>;
  config?: RecoveryConfig;
};

function formatNumber(value: unknown): string {
  const numeric = Number(value || 0);
  return numeric.toLocaleString("pt-BR");
}

function formatPercent(value: unknown): string {
  const numeric = Number(value || 0);
  return `${numeric.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: unknown): string {
  const numeric = Number(value || 0);
  return numeric.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function outcomeBadge(outcome: string) {
  if (outcome === "paid_active") {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Pago</Badge>;
  }
  if (outcome === "generated_not_paid") {
    return <Badge variant="destructive">Sem pagamento</Badge>;
  }
  return <Badge variant="outline">{outcome}</Badge>;
}

function StatCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

type AdminOrdersPanelProps = {
  apiBasePath?: "/api/admin" | "/api/owner-workspace";
};

export default function AdminOrdersPanel({ apiBasePath = "/api/admin" }: AdminOrdersPanelProps) {
  const { toast } = useToast();
  const [days, setDays] = useState(7);
  const [configDraft, setConfigDraft] = useState<RecoveryConfig | null>(null);

  const reportQuery = useQuery<OrdersReport>({
    queryKey: [apiBasePath, "orders", "report", days],
    queryFn: async () => {
      const res = await apiRequest("GET", `${apiBasePath}/orders/report?days=${days}`);
      return await res.json();
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (reportQuery.data?.config && !configDraft) {
      setConfigDraft(reportQuery.data.config);
    }
  }, [reportQuery.data?.config, configDraft]);

  const saveConfigMutation = useMutation({
    mutationFn: async (config: RecoveryConfig) => {
      const res = await apiRequest("PUT", `${apiBasePath}/orders/recovery-config`, config);
      return await res.json();
    },
    onSuccess: (config: RecoveryConfig) => {
      setConfigDraft(config);
      queryClient.invalidateQueries({ queryKey: [apiBasePath, "orders", "report"] });
      toast({ title: "Configuração de pedidos salva" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar configuração",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendNowMutation = useMutation({
    mutationFn: async ({ subscriptionId, step }: { subscriptionId: string; step: number }) => {
      const res = await apiRequest("POST", `${apiBasePath}/orders/${subscriptionId}/send-recovery`, { step });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiBasePath, "orders", "report"] });
      toast({ title: "Lembrete enviado" });
    },
    onError: (error: Error) => {
      toast({
        title: "Não foi possível enviar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const summary = reportQuery.data?.summary || {};
  const orders = reportQuery.data?.orders || [];
  const pendingOrders = orders.filter((order) => order.outcome === "generated_not_paid");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Funil de Pix gerado, pagamento confirmado e abandono de checkout.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={days === 7 ? "default" : "outline"}
            size="sm"
            onClick={() => setDays(7)}
          >
            7 dias
          </Button>
          <Button
            variant={days === 30 ? "default" : "outline"}
            size="sm"
            onClick={() => setDays(30)}
          >
            30 dias
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => reportQuery.refetch()}
            disabled={reportQuery.isFetching}
          >
            {reportQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Pedidos gerados"
          value={formatNumber(summary.uniqueClientsGenerated)}
          description={`${formatNumber(summary.rawSubscriptionRecords)} registros brutos no período`}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <StatCard
          title="Pagos"
          value={formatNumber(summary.uniqueClientsPaid)}
          description={`Conversão de ${formatPercent(summary.conversionPercent)}`}
          icon={<CheckCircle className="h-4 w-4" />}
        />
        <StatCard
          title="Sem pagamento"
          value={formatNumber(summary.uniqueClientsNotPaid)}
          description={`Abandono de ${formatPercent(summary.abandonmentPercent)}`}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          title="Automação"
          value={configDraft?.enabled ? "Ativa" : "Pausada"}
          description={`1º envio em ${configDraft?.firstDelayMinutes || 10} min`}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      <Tabs defaultValue="pedidos">
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 md:grid-cols-3">
          <TabsTrigger value="pedidos" className="w-full justify-start rounded-lg border bg-background px-3 py-2 text-left md:justify-center">
            Pedidos ({orders.length})
          </TabsTrigger>
          <TabsTrigger value="abandono" className="w-full justify-start rounded-lg border bg-background px-3 py-2 text-left md:justify-center">
            Abandono ({pendingOrders.length})
          </TabsTrigger>
          <TabsTrigger value="configuracao" className="w-full justify-start rounded-lg border bg-background px-3 py-2 text-left md:justify-center">
            Automação
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pedidos" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Conversão por dia</CardTitle>
                <CardDescription>Clientes únicos por dia de geração do pedido.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dia</TableHead>
                      <TableHead>Gerados</TableHead>
                      <TableHead>Pagos</TableHead>
                      <TableHead>Conversão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reportQuery.data?.byDay || []).map((row) => (
                      <TableRow key={row.day}>
                        <TableCell>{new Date(`${row.day}T12:00:00`).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell>{row.generated}</TableCell>
                        <TableCell>{row.paid}</TableCell>
                        <TableCell>{formatPercent(row.conversion_percent)}</TableCell>
                      </TableRow>
                    ))}
                    {(reportQuery.data?.byDay || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          Nenhum pedido no período selecionado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversão por plano</CardTitle>
                <CardDescription>Ajuda a enxergar preço e oferta que mais abandonam.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plano</TableHead>
                      <TableHead>Gerados</TableHead>
                      <TableHead>Sem pagar</TableHead>
                      <TableHead>Conv.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reportQuery.data?.byPlan || []).map((row) => (
                      <TableRow key={row.plan_name}>
                        <TableCell className="font-medium">{row.plan_name}</TableCell>
                        <TableCell>{row.generated}</TableCell>
                        <TableCell>{row.not_paid}</TableCell>
                        <TableCell>{formatPercent(row.conversion_percent)}</TableCell>
                      </TableRow>
                    ))}
                    {(reportQuery.data?.byPlan || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          Nenhum plano com pedido no período.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Últimos pedidos</CardTitle>
              <CardDescription>Status atual e histórico de lembretes por cliente.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Gerado em</TableHead>
                    <TableHead>Lembretes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.subscription_id}>
                      <TableCell>
                        <div className="font-medium">{order.name || "Sem nome"}</div>
                        <div className="text-xs text-muted-foreground">{order.email}</div>
                      </TableCell>
                      <TableCell>
                        <div>{order.plan_name}</div>
                        <div className="text-xs text-muted-foreground">{formatMoney(order.plan_value)}</div>
                      </TableCell>
                      <TableCell>{outcomeBadge(order.outcome)}</TableCell>
                      <TableCell>{formatDateTime(order.data_inicio)}</TableCell>
                      <TableCell>
                        <div className="text-sm">{order.recovery_sent_count || 0} enviados</div>
                        {order.last_error && <div className="text-xs text-red-600">{order.last_error}</div>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {orders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Nenhum pedido encontrado para este filtro.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="abandono" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pedidos sem pagamento</CardTitle>
              <CardDescription>Clientes com Pix pendente ou checkout abandonado.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Gerado em</TableHead>
                    <TableHead>Tentativas</TableHead>
                    <TableHead>Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingOrders.map((order) => (
                    <TableRow key={order.subscription_id}>
                      <TableCell>
                        <div className="font-medium">{order.name || "Sem nome"}</div>
                        <div className="text-xs text-muted-foreground">{order.phone || order.email}</div>
                      </TableCell>
                      <TableCell>{order.plan_name}</TableCell>
                      <TableCell>{formatDateTime(order.data_inicio)}</TableCell>
                      <TableCell>{order.attempts_in_period || 1}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sendNowMutation.isPending || (order.recovery_sent_count || 0) >= 1}
                          onClick={() => sendNowMutation.mutate({ subscriptionId: order.subscription_id, step: 1 })}
                        >
                          {sendNowMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                          Enviar 1º lembrete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pendingOrders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Nenhum abandono no período.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuracao" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Mensagens automáticas</CardTitle>
              <CardDescription>
                Envio pelo WhatsApp do admin para pedidos Pix pendentes. Use variáveis como {"{{nome}}"}, {"{{plano}}"}, {"{{valor}}"}, {"{{pix_copia_cola}}"} e {"{{link_pagamento}}"}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {configDraft ? (
                <form
                  className="space-y-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveConfigMutation.mutate(configDraft);
                  }}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <Label>Automação ativa</Label>
                        <p className="text-xs text-muted-foreground">Novos pedidos pendentes entram no fluxo.</p>
                      </div>
                      <Switch
                        checked={configDraft.enabled}
                        onCheckedChange={(enabled) => setConfigDraft({ ...configDraft, enabled })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <Label>Segundo lembrete</Label>
                        <p className="text-xs text-muted-foreground">Envia uma pergunta curta depois.</p>
                      </div>
                      <Switch
                        checked={configDraft.sendSecondReminder}
                        onCheckedChange={(sendSecondReminder) => setConfigDraft({ ...configDraft, sendSecondReminder })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Primeiro envio após</Label>
                      <Input
                        type="number"
                        min={1}
                        max={240}
                        value={configDraft.firstDelayMinutes}
                        onChange={(event) => setConfigDraft({ ...configDraft, firstDelayMinutes: Number(event.target.value) })}
                      />
                      <p className="text-xs text-muted-foreground">Recomendado: 10 minutos.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Segundo envio após</Label>
                      <Input
                        type="number"
                        min={15}
                        max={1440}
                        value={configDraft.secondDelayMinutes}
                        onChange={(event) => setConfigDraft({ ...configDraft, secondDelayMinutes: Number(event.target.value) })}
                      />
                      <p className="text-xs text-muted-foreground">Recomendado: 120 minutos.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Mensagem 1</Label>
                    <Textarea
                      className="min-h-40 resize-y"
                      value={configDraft.firstMessageTemplate}
                      onChange={(event) => setConfigDraft({ ...configDraft, firstMessageTemplate: event.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Mensagem 2</Label>
                    <Textarea
                      className="min-h-32 resize-y"
                      value={configDraft.secondMessageTemplate}
                      onChange={(event) => setConfigDraft({ ...configDraft, secondMessageTemplate: event.target.value })}
                    />
                  </div>

                  <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Mensagens com Pix copia e cola geram ou reutilizam o codigo antes de mandar.
                    </div>
                    <Button type="submit" disabled={saveConfigMutation.isPending}>
                      {saveConfigMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Salvar mensagens
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="py-8 text-center text-muted-foreground">Carregando configuração...</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
