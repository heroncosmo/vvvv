import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign,
  ShoppingBag,
  Users,
  Clock,
  Calendar as CalendarIcon,
  Download,
  RefreshCw,
  ChevronDown,
  Filter,
  Package,
  CheckCircle2,
  XCircle,
  Truck
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface DeliveryOrder {
  id: number;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  status: string;
  total: number;
  delivery_fee: number;
  payment_method: string;
  created_at: string;
  confirmed_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
}

interface ReportStats {
  totalOrders: number;
  totalRevenue: number;
  totalDeliveryFees: number;
  averageTicket: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  inProgressOrders: number;
  conversionRate: number;
  topPaymentMethods: { method: string; count: number; total: number }[];
  ordersByDay: { date: string; count: number; revenue: number }[];
  ordersByHour: { hour: number; count: number }[];
}

type DateRangePreset = "today" | "yesterday" | "week" | "month" | "custom";

export default function DeliveryReports() {
  const { toast } = useToast();
  const [datePreset, setDatePreset] = useState<DateRangePreset>("today");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Calculate date range based on preset
  const dateRange = useMemo(() => {
    const now = new Date();
    const normalizeRange = (start: Date, end: Date) =>
      start > end ? { start: end, end: start } : { start, end };
    
    switch (datePreset) {
      case "today":
        return normalizeRange(startOfDay(now), endOfDay(now));
      case "yesterday": {
        const yesterday = subDays(now, 1);
        return normalizeRange(startOfDay(yesterday), endOfDay(yesterday));
      }
      case "week":
        return normalizeRange(startOfWeek(now, { weekStartsOn: 0 }), endOfWeek(now, { weekStartsOn: 0 }));
      case "month":
        return normalizeRange(startOfMonth(now), endOfMonth(now));
      case "custom": {
        const start = customStartDate ? startOfDay(customStartDate) : startOfDay(now);
        const end = customEndDate ? endOfDay(customEndDate) : endOfDay(now);
        return normalizeRange(start, end);
      }
      default:
        return normalizeRange(startOfDay(now), endOfDay(now));
    }
  }, [datePreset, customStartDate, customEndDate]);

  // Fetch all orders
  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ["/api/delivery/orders", dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: "5000",
        startDate: dateRange.start.toISOString(),
        endDate: dateRange.end.toISOString(),
      });
      const response = await apiRequest("GET", `/api/delivery/orders?${params.toString()}`);
      return response.json();
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    toast({
      title: "Dados atualizados",
      description: "Os relatórios foram atualizados com sucesso.",
    });
  };

  // Calculate stats from orders
  const stats: ReportStats = useMemo(() => {
    if (!ordersData?.orders) {
      return {
        totalOrders: 0,
        totalRevenue: 0,
        totalDeliveryFees: 0,
        averageTicket: 0,
        completedOrders: 0,
        cancelledOrders: 0,
        pendingOrders: 0,
        inProgressOrders: 0,
        conversionRate: 0,
        topPaymentMethods: [],
        ordersByDay: [],
        ordersByHour: [],
      };
    }

    // Filter orders by date range
    const filteredOrders = ordersData.orders.filter((order: DeliveryOrder) => {
      const orderDate = new Date(order.created_at);
      if (Number.isNaN(orderDate.getTime())) return false;
      return isWithinInterval(orderDate, { start: dateRange.start, end: dateRange.end });
    });

    const completedOrders = filteredOrders.filter((o: DeliveryOrder) => o.status === "delivered");
    const cancelledOrders = filteredOrders.filter((o: DeliveryOrder) => o.status === "cancelled");
    const pendingOrders = filteredOrders.filter((o: DeliveryOrder) => o.status === "pending");
    const inProgressOrders = filteredOrders.filter((o: DeliveryOrder) => 
      ["confirmed", "preparing", "ready", "out_for_delivery"].includes(o.status)
    );

    const totalRevenue = completedOrders.reduce((sum: number, o: DeliveryOrder) => sum + (Number(o.total) || 0), 0);
    const totalDeliveryFees = completedOrders.reduce((sum: number, o: DeliveryOrder) => sum + (Number(o.delivery_fee) || 0), 0);

    // Payment methods breakdown
    const paymentMethodsMap = new Map<string, { count: number; total: number }>();
    completedOrders.forEach((o: DeliveryOrder) => {
      const method = o.payment_method || "Não informado";
      const current = paymentMethodsMap.get(method) || { count: 0, total: 0 };
      paymentMethodsMap.set(method, { 
        count: current.count + 1, 
        total: current.total + (Number(o.total) || 0) 
      });
    });
    const topPaymentMethods = Array.from(paymentMethodsMap.entries())
      .map(([method, data]) => ({ method, ...data }))
      .sort((a, b) => b.total - a.total);

    // Orders by day
    const ordersByDayMap = new Map<string, { count: number; revenue: number }>();
    filteredOrders.forEach((o: DeliveryOrder) => {
      const date = format(parseISO(o.created_at), "yyyy-MM-dd");
      const current = ordersByDayMap.get(date) || { count: 0, revenue: 0 };
      const revenue = o.status === "delivered" ? (Number(o.total) || 0) : 0;
      ordersByDayMap.set(date, { count: current.count + 1, revenue: current.revenue + revenue });
    });
    const ordersByDay = Array.from(ordersByDayMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Orders by hour
    const ordersByHourMap = new Map<number, number>();
    filteredOrders.forEach((o: DeliveryOrder) => {
      const hour = parseISO(o.created_at).getHours();
      ordersByHourMap.set(hour, (ordersByHourMap.get(hour) || 0) + 1);
    });
    const ordersByHour = Array.from(ordersByHourMap.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour - b.hour);

    const conversionRate = filteredOrders.length > 0 
      ? (completedOrders.length / filteredOrders.length) * 100 
      : 0;

    return {
      totalOrders: filteredOrders.length,
      totalRevenue,
      totalDeliveryFees,
      averageTicket: completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0,
      completedOrders: completedOrders.length,
      cancelledOrders: cancelledOrders.length,
      pendingOrders: pendingOrders.length,
      inProgressOrders: inProgressOrders.length,
      conversionRate,
      topPaymentMethods,
      ordersByDay,
      ordersByHour,
    };
  }, [ordersData, dateRange]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getPresetLabel = (preset: DateRangePreset) => {
    switch (preset) {
      case "today": return "Hoje";
      case "yesterday": return "Ontem";
      case "week": return "Esta Semana";
      case "month": return "Este Mês";
      case "custom": return "Personalizado";
    }
  };

  // Calculate max for bar chart scaling
  const maxRevenueByDay = Math.max(...stats.ordersByDay.map(d => d.revenue), 1);
  const maxOrdersByHour = Math.max(...stats.ordersByHour.map(d => d.count), 1);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-white dark:bg-gray-800 p-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Relatórios de Delivery
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Acompanhe o desempenho das suas vendas
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Date Range Selector */}
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DateRangePreset)}>
              <SelectTrigger className="w-[160px]">
                <CalendarIcon className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="week">Esta Semana</SelectItem>
                <SelectItem value="month">Este Mês</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            {/* Custom Date Range Pickers */}
            {datePreset === "custom" && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[140px] justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customStartDate ? format(customStartDate, "dd/MM/yyyy") : "Início"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customStartDate}
                      onSelect={setCustomStartDate}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground">até</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[140px] justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customEndDate ? format(customEndDate, "dd/MM/yyyy") : "Fim"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customEndDate}
                      onSelect={setCustomEndDate}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </>
            )}

            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Period Display */}
        <div className="mt-4 flex items-center gap-2">
          <Badge variant="secondary" className="text-sm">
            <CalendarIcon className="h-3 w-3 mr-1" />
            {format(dateRange.start, "dd/MM/yyyy", { locale: ptBR })} - {format(dateRange.end, "dd/MM/yyyy", { locale: ptBR })}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Total Revenue */}
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Faturamento</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</p>
                  <p className="text-xs opacity-75 mt-1">
                    + {formatCurrency(stats.totalDeliveryFees)} em taxas
                  </p>
                </div>
                <DollarSign className="h-10 w-10 opacity-80" />
              </div>
            </CardContent>
          </Card>

          {/* Total Orders */}
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Total de Pedidos</p>
                  <p className="text-2xl font-bold">{stats.totalOrders}</p>
                  <p className="text-xs opacity-75 mt-1">
                    {stats.completedOrders} entregues
                  </p>
                </div>
                <ShoppingBag className="h-10 w-10 opacity-80" />
              </div>
            </CardContent>
          </Card>

          {/* Average Ticket */}
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Ticket Médio</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.averageTicket)}</p>
                  <p className="text-xs opacity-75 mt-1">
                    por pedido entregue
                  </p>
                </div>
                <TrendingUp className="h-10 w-10 opacity-80" />
              </div>
            </CardContent>
          </Card>

          {/* Conversion Rate */}
          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Taxa de Conversão</p>
                  <p className="text-2xl font-bold">{stats.conversionRate.toFixed(1)}%</p>
                  <p className="text-xs opacity-75 mt-1">
                    pedidos entregues
                  </p>
                </div>
                <CheckCircle2 className="h-10 w-10 opacity-80" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Status Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Order Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" />
                Status dos Pedidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <span>Pendentes</span>
                  </div>
                  <Badge variant="secondary">{stats.pendingOrders}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-blue-600" />
                    <span>Em Andamento</span>
                  </div>
                  <Badge variant="secondary">{stats.inProgressOrders}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Entregues</span>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {stats.completedOrders}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span>Cancelados</span>
                  </div>
                  <Badge variant="destructive">{stats.cancelledOrders}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Methods */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Formas de Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.topPaymentMethods.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Nenhum pagamento no período
                </p>
              ) : (
                <div className="space-y-3">
                  {stats.topPaymentMethods.map((pm) => (
                    <div key={pm.method} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div>
                        <span className="font-medium capitalize">{pm.method}</span>
                        <p className="text-xs text-muted-foreground">{pm.count} pedidos</p>
                      </div>
                      <span className="font-semibold text-green-600">{formatCurrency(pm.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue by Day */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Faturamento por Dia
              </CardTitle>
              <CardDescription>
                Receita de pedidos entregues
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.ordersByDay.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum pedido no período
                </p>
              ) : (
                <div className="space-y-2">
                  {stats.ordersByDay.map((day) => (
                    <div key={day.date} className="flex items-center gap-3">
                      <div className="w-20 text-xs text-muted-foreground">
                        {format(parseISO(day.date), "dd/MM", { locale: ptBR })}
                      </div>
                      <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500"
                          style={{ width: `${(day.revenue / maxRevenueByDay) * 100}%` }}
                        />
                      </div>
                      <div className="w-24 text-right text-sm font-medium">
                        {formatCurrency(day.revenue)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Orders by Hour */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Pedidos por Hora
              </CardTitle>
              <CardDescription>
                Distribuição dos pedidos ao longo do dia
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.ordersByHour.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum pedido no período
                </p>
              ) : (
                <div className="flex items-end justify-between h-40 gap-1">
                  {Array.from({ length: 24 }, (_, hour) => {
                    const data = stats.ordersByHour.find(h => h.hour === hour);
                    const count = data?.count || 0;
                    const height = maxOrdersByHour > 0 ? (count / maxOrdersByHour) * 100 : 0;
                    return (
                      <div key={hour} className="flex-1 flex flex-col items-center">
                        <div 
                          className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t transition-all duration-500"
                          style={{ height: `${Math.max(height, count > 0 ? 5 : 0)}%` }}
                          title={`${hour}h: ${count} pedidos`}
                        />
                        {hour % 4 === 0 && (
                          <span className="text-[10px] text-muted-foreground mt-1">
                            {hour}h
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary Footer */}
        <Card className="mt-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-muted-foreground">Período: </span>
                  <span className="font-medium">{getPresetLabel(datePreset)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Bruto: </span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(stats.totalRevenue + stats.totalDeliveryFees)}
                  </span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Última atualização: {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
