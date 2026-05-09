import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarRange, Clock3, HandCoins, ReceiptText, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";

type Delivery2ReportsResponse = {
  summary: {
    grossRevenue: number;
    ordersCount: number;
    averageTicket: number;
    cancelledCount: number;
  };
  paymentMethods: Array<{
    method: string;
    count: number;
    total: number;
  }>;
  dailySales: Array<{
    date: string;
    orders: number;
    total: number;
  }>;
  deliveryTypes: Array<{
    type: string;
    count: number;
    total: number;
  }>;
};

type ReportPreset = "today" | "yesterday" | "week" | "month" | "custom";

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getBrazilDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function shiftDate(date: string, days: number) {
  const base = new Date(`${date}T12:00:00`);
  base.setDate(base.getDate() + days);
  return getBrazilDateString(base);
}

function formatStartDate(date: string) {
  return `${date}T00:00:00`;
}

function formatEndDate(date: string) {
  return `${date}T23:59:59.999`;
}

export function Delivery2ReportsPanel() {
  const today = useMemo(() => getBrazilDateString(), []);
  const [preset, setPreset] = useState<ReportPreset>("today");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const activeRange = useMemo(() => {
    switch (preset) {
      case "yesterday": {
        const yesterday = shiftDate(today, -1);
        return { startDate: yesterday, endDate: yesterday };
      }
      case "week":
        return { startDate: shiftDate(today, -6), endDate: today };
      case "month":
        return { startDate: shiftDate(today, -29), endDate: today };
      case "custom":
        return { startDate, endDate };
      case "today":
      default:
        return { startDate: today, endDate: today };
    }
  }, [endDate, preset, startDate, today]);

  const { data, isLoading } = useQuery<Delivery2ReportsResponse>({
    queryKey: ["/api/delivery-2/reports", activeRange.startDate, activeRange.endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: formatStartDate(activeRange.startDate),
        endDate: formatEndDate(activeRange.endDate),
      });
      const response = await apiRequest("GET", `/api/delivery-2/reports?${params.toString()}`);
      return response.json();
    },
    staleTime: 10000,
  });

  const summary = data?.summary || {
    grossRevenue: 0,
    ordersCount: 0,
    averageTicket: 0,
    cancelledCount: 0,
  };

  const presets: Array<{ id: ReportPreset; label: string }> = [
    { id: "today", label: "Hoje" },
    { id: "yesterday", label: "Ontem" },
    { id: "week", label: "7 dias" },
    { id: "month", label: "30 dias" },
    { id: "custom", label: "Personalizado" },
  ];

  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-background/95">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4" />
            Relatorios por periodo
          </CardTitle>
          <CardDescription>
            Consulte faturamento, ticket medio, formas de pagamento e vendas por dia direto do Delivery 2.0.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {presets.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant={preset === item.id ? "default" : "outline"}
                onClick={() => setPreset(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>

          {preset === "custom" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Data inicial</Label>
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data final</Label>
                <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Periodo consultado: <strong className="text-foreground">{activeRange.startDate}</strong> ate{" "}
              <strong className="text-foreground">{activeRange.endDate}</strong>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70 bg-background/95">
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <HandCoins className="h-4 w-4" />
              Faturamento
            </p>
            <p className="mt-3 text-2xl font-semibold">{formatCurrency(summary.grossRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-background/95">
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <ReceiptText className="h-4 w-4" />
              Pedidos validos
            </p>
            <p className="mt-3 text-2xl font-semibold">{summary.ordersCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-background/95">
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              Ticket medio
            </p>
            <p className="mt-3 text-2xl font-semibold">{formatCurrency(summary.averageTicket)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-background/95">
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <Clock3 className="h-4 w-4" />
              Cancelados
            </p>
            <p className="mt-3 text-2xl font-semibold">{summary.cancelledCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-border/70 bg-background/95 xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Formas de pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando relatorio...</p>
            ) : data?.paymentMethods?.length ? (
              data.paymentMethods.map((entry) => (
                <div key={entry.method} className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{entry.method}</span>
                    <Badge variant="secondary">{entry.count} pedido(s)</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{formatCurrency(entry.total)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum pagamento consolidado nesse periodo.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-background/95 xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Entrega x retirada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando relatorio...</p>
            ) : data?.deliveryTypes?.length ? (
              data.deliveryTypes.map((entry) => (
                <div key={entry.type} className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-medium">
                      <Truck className="h-4 w-4" />
                      {entry.type}
                    </span>
                    <Badge variant="secondary">{entry.count} pedido(s)</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{formatCurrency(entry.total)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sem operacao consolidada nesse periodo.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-background/95 xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Vendas por dia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando relatorio...</p>
            ) : data?.dailySales?.length ? (
              data.dailySales.map((entry) => (
                <div key={entry.date} className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{entry.date}</span>
                    <Badge variant="secondary">{entry.orders} pedido(s)</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{formatCurrency(entry.total)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma venda encontrada nesse periodo.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
