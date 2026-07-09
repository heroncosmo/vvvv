import { useEffect, useRef, useState, type ElementType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  BarChart3,
  Bell,
  BellOff,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Loader2,
  Maximize2,
  Minimize2,
  Package,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  ShoppingBag,
  Store,
  Truck,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";

import { ContextualHelpButton } from "@/components/contextual-help-button";
import { Delivery2MenuMediaManager } from "@/components/delivery2-menu-media-manager";
import { Delivery2ReportsPanel } from "@/components/delivery2-reports-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { createDelivery2NotificationAudio, delivery2OrdersSoundStorageKey } from "@/lib/delivery2-notification-audio";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type Delivery2TabValue = "orders" | "settings" | "reports";

type Delivery2OrderItem = {
  id: string;
  lineNumber: number;
  itemName: string;
  quantity: number;
  sizeLabel: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
  notes: string | null;
  selectedOptions: string[];
  halfAndHalf: string[];
};

type Delivery2Order = {
  id: string;
  customerName: string | null;
  contactName: string | null;
  contactNumber: string;
  status: "pending" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";
  deliveryType: "delivery" | "pickup" | null;
  paymentMethod: string | null;
  customerAddress: string | null;
  customerComplement: string | null;
  customerReference: string | null;
  notes: string | null;
  summary: string | null;
  subtotal: number | null;
  deliveryFee: number | null;
  total: number | null;
  finalizedAt: string | null;
  createdAt: string | null;
  sourceConnectionName: string | null;
  items: Delivery2OrderItem[];
};

type Delivery2OrdersResponse = {
  data: Delivery2Order[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
};

type Delivery2Config = {
  id: string | null;
  user_id: string;
  is_active: boolean;
  send_to_ai: boolean;
  display_name: string;
  menu_auto_send_on_greeting: boolean;
  menu_auto_send_on_request: boolean;
};

const statusMeta: Record<
  Delivery2Order["status"],
  {
    label: string;
    icon: ElementType;
    laneClassName: string;
    badgeClassName: string;
    nextStatus?: Delivery2Order["status"];
    nextLabel?: string;
  }
> = {
  pending: {
    label: "Novo pedido",
    icon: Clock3,
    laneClassName: "border-amber-200 bg-amber-50/70",
    badgeClassName: "bg-amber-100 text-amber-900",
    nextStatus: "confirmed",
    nextLabel: "Confirmar",
  },
  confirmed: {
    label: "Confirmado",
    icon: CheckCircle2,
    laneClassName: "border-sky-200 bg-sky-50/70",
    badgeClassName: "bg-sky-100 text-sky-900",
    nextStatus: "preparing",
    nextLabel: "Iniciar preparo",
  },
  preparing: {
    label: "Em preparo",
    icon: ChefHat,
    laneClassName: "border-orange-200 bg-orange-50/70",
    badgeClassName: "bg-orange-100 text-orange-900",
    nextStatus: "ready",
    nextLabel: "Marcar pronto",
  },
  ready: {
    label: "Pronto",
    icon: Package,
    laneClassName: "border-violet-200 bg-violet-50/70",
    badgeClassName: "bg-violet-100 text-violet-900",
    nextStatus: "out_for_delivery",
    nextLabel: "Saiu para entrega",
  },
  out_for_delivery: {
    label: "Em rota",
    icon: Truck,
    laneClassName: "border-indigo-200 bg-indigo-50/70",
    badgeClassName: "bg-indigo-100 text-indigo-900",
    nextStatus: "delivered",
    nextLabel: "Entregue",
  },
  delivered: {
    label: "Entregue",
    icon: CheckCircle2,
    laneClassName: "border-emerald-200 bg-emerald-50/70",
    badgeClassName: "bg-emerald-100 text-emerald-900",
  },
  cancelled: {
    label: "Cancelado",
    icon: XCircle,
    laneClassName: "border-rose-200 bg-rose-50/70",
    badgeClassName: "bg-rose-100 text-rose-900",
  },
};

const laneOrder: Delivery2Order["status"][] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

function getTabFromSearch(search: string): Delivery2TabValue {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  if (tab === "settings" || tab === "reports") return tab;
  return "orders";
}

function formatCurrency(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "Agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Agora";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapePrintHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBrazilDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftBrazilDateString(date: string, days: number) {
  const base = new Date(`${date}T12:00:00`);
  base.setDate(base.getDate() + days);
  return getBrazilDateString(base);
}

function formatOrdersStartDate(date: string) {
  return `${date}T00:00:00`;
}

function formatOrdersEndDate(date: string) {
  return `${date}T23:59:59.999`;
}

function formatBrazilDayLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
  });
}

export default function Delivery2Page() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Delivery2TabValue>(() => getTabFromSearch(window.location.search));
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Delivery2Order | null>(null);
  const [brazilToday, setBrazilToday] = useState(() => getBrazilDateString());
  const [selectedDate, setSelectedDate] = useState(() => getBrazilDateString());
  const [dateMode, setDateMode] = useState<"today" | "custom">("today");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
  const [isPdvFullscreen, setIsPdvFullscreen] = useState(false);
  const [printedOrderIds, setPrintedOrderIds] = useState<Set<string>>(new Set());
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const lastKnownOrderIdsRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const forceRefreshOrdersRef = useRef(false);
  const autoPrintStorageKey = "delivery2-orders:auto-print";

  useEffect(() => {
    audioRef.current = createDelivery2NotificationAudio();
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (printFrameRef.current) {
        printFrameRef.current.remove();
        printFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const storedSound = window.localStorage.getItem(delivery2OrdersSoundStorageKey);
    if (storedSound === "false") setSoundEnabled(false);

    const storedAutoPrint = window.localStorage.getItem(autoPrintStorageKey);
    if (storedAutoPrint === "true") setAutoPrintEnabled(true);

    const storedPrintedIds = window.localStorage.getItem(`${autoPrintStorageKey}:printed`);
    if (!storedPrintedIds) return;

    try {
      const parsed = JSON.parse(storedPrintedIds);
      if (Array.isArray(parsed)) {
        setPrintedOrderIds(new Set(parsed.filter((value): value is string => typeof value === "string")));
      }
    } catch (error) {
      console.warn("[Delivery2Page] Falha ao carregar historico de impressao", error);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(delivery2OrdersSoundStorageKey, String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    window.localStorage.setItem(autoPrintStorageKey, String(autoPrintEnabled));
  }, [autoPrintEnabled]);

  useEffect(() => {
    window.localStorage.setItem(`${autoPrintStorageKey}:printed`, JSON.stringify(Array.from(printedOrderIds)));
  }, [autoPrintStorageKey, printedOrderIds]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextToday = getBrazilDateString();
      setBrazilToday((previous) => (previous === nextToday ? previous : nextToday));
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (dateMode === "today") {
      setSelectedDate(brazilToday);
    }
  }, [brazilToday, dateMode]);

  useEffect(() => {
    if (activeTab !== "orders" && isPdvFullscreen) {
      setIsPdvFullscreen(false);
    }
  }, [activeTab, isPdvFullscreen]);

  useEffect(() => {
    if (!isPdvFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPdvFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPdvFullscreen]);

  const activeOrderDate = dateMode === "today" ? brazilToday : selectedDate;
  const orderDateLabel = formatBrazilDayLabel(activeOrderDate);
  const canAdvanceDate = activeOrderDate < brazilToday;

  const { data: config } = useQuery<Delivery2Config>({
    queryKey: ["/api/delivery-2-config"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/delivery-2-config");
      return response.json();
    },
  });

  const { data: ordersData, isLoading, refetch, isFetching } = useQuery<Delivery2OrdersResponse>({
    queryKey: ["/api/delivery-2/orders", searchTerm, activeOrderDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: "120",
        offset: "0",
        status: "all",
        startDate: formatOrdersStartDate(activeOrderDate),
        endDate: formatOrdersEndDate(activeOrderDate),
      });
      if (searchTerm.trim()) params.set("q", searchTerm.trim());
      if (forceRefreshOrdersRef.current) {
        params.set("refresh", "true");
        params.set("refreshLimit", "2");
        forceRefreshOrdersRef.current = false;
      }
      const response = await apiRequest("GET", `/api/delivery-2/orders?${params.toString()}`);
      return response.json();
    },
    refetchInterval: config?.is_active ? 10000 : false,
    staleTime: 0,
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest("PUT", "/api/delivery-2-config", {
        is_active: enabled,
        send_to_ai: enabled,
      });
      return response.json();
    },
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-2-config"] });
      toast({
        title: enabled ? "Delivery 2.0 ativado" : "Delivery 2.0 desativado",
        description: enabled
          ? "O painel voltou a identificar pedidos finalizados em paralelo."
          : "O painel deixou de identificar novos pedidos.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Nao foi possivel atualizar o Delivery 2.0",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (patch: Partial<Delivery2Config>) => {
      const response = await apiRequest("PUT", "/api/delivery-2-config", patch);
      return response.json();
    },
    onSuccess: (_data, patch) => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-2-config"] });
      if ("is_active" in patch) {
        return;
      }
      toast({
        title: "Configuracao atualizada",
        description: "As regras do cardapio em midia foram salvas para o Delivery 2.0.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Falha ao salvar configuracao",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: Delivery2Order["status"] }) => {
      const response = await apiRequest("PUT", `/api/delivery-2/orders/${orderId}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-2/orders"] });
      toast({ title: "Pedido atualizado" });
    },
    onError: (error: Error) => {
      toast({
        title: "Falha ao atualizar pedido",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  async function updateConfigPatch(patch: Partial<Delivery2Config>) {
    await updateConfigMutation.mutateAsync(patch);
  }

  function buildPrintHtml(order: Delivery2Order) {
    const customerLabel = order.customerName || order.contactName || "Cliente sem nome";
    const phoneLabel = order.contactNumber || "Numero nao informado";
    const itemsHtml = order.items
      .map((item) => {
        const details = [
          item.sizeLabel,
          item.halfAndHalf.length ? `Meio a meio: ${item.halfAndHalf.join(" + ")}` : null,
          item.selectedOptions.length ? `Opcoes: ${item.selectedOptions.join(", ")}` : null,
          item.notes ? `Obs: ${item.notes}` : null,
        ]
          .filter(Boolean)
          .join(" | ");

        return `
          <div class="item-row">
            <div>${escapePrintHtml(item.quantity)}x ${escapePrintHtml(item.itemName)}</div>
            <div>${formatCurrency(item.totalPrice)}</div>
          </div>
          ${details ? `<div class="details">${escapePrintHtml(details)}</div>` : ""}
        `;
      })
      .join("");

    return `
      <html>
      <head>
        <title>Delivery 2.0</title>
        <style>
          body { font-family: monospace; color: #111827; padding: 12px; max-width: 80mm; margin: 0 auto; }
          h1 { font-size: 16px; text-align: center; margin: 0 0 8px; }
          .divider { border-top: 1px dashed #9ca3af; margin: 8px 0; }
          .meta { margin: 4px 0; }
          .item-row { display: flex; justify-content: space-between; gap: 8px; margin: 4px 0; }
          .details { font-size: 10px; color: #4b5563; margin: 0 0 6px; }
          .total { font-weight: 700; font-size: 14px; }
        </style>
      </head>
      <body>
        <h1>${escapePrintHtml(config?.display_name || "Delivery 2.0")}</h1>
        <div class="meta"><strong>Cliente:</strong> ${escapePrintHtml(customerLabel)}</div>
        <div class="meta"><strong>Telefone:</strong> ${escapePrintHtml(phoneLabel)}</div>
        <div class="meta"><strong>Canal:</strong> ${escapePrintHtml(order.sourceConnectionName || "WhatsApp")}</div>
        <div class="meta"><strong>Horario:</strong> ${formatDateTime(order.finalizedAt)}</div>
        <div class="meta"><strong>Tipo:</strong> ${order.deliveryType === "pickup" ? "Retirada" : "Entrega"}</div>
        ${order.customerAddress ? `<div class="meta"><strong>Endereco:</strong> ${escapePrintHtml(order.customerAddress)}</div>` : ""}
        ${order.customerComplement ? `<div class="meta"><strong>Complemento:</strong> ${escapePrintHtml(order.customerComplement)}</div>` : ""}
        ${order.customerReference ? `<div class="meta"><strong>Referencia:</strong> ${escapePrintHtml(order.customerReference)}</div>` : ""}
        <div class="divider"></div>
        ${itemsHtml}
        <div class="divider"></div>
        <div class="item-row"><span>Subtotal</span><span>${formatCurrency(order.subtotal)}</span></div>
        ${(order.deliveryFee || 0) > 0 ? `<div class="item-row"><span>Entrega</span><span>${formatCurrency(order.deliveryFee)}</span></div>` : ""}
        <div class="item-row total"><span>Total</span><span>${formatCurrency(order.total)}</span></div>
        <div class="divider"></div>
        <div class="meta"><strong>Pagamento:</strong> ${escapePrintHtml(order.paymentMethod || "Nao informado")}</div>
        ${order.notes ? `<div class="meta"><strong>Obs:</strong> ${escapePrintHtml(order.notes)}</div>` : ""}
      </body>
      </html>
    `;
  }

  function printOrder(order: Delivery2Order) {
    if (!document.body) return false;

    let printFrame = printFrameRef.current;
    if (!printFrame || !document.body.contains(printFrame)) {
      printFrame = document.createElement("iframe");
      printFrame.style.position = "fixed";
      printFrame.style.width = "0";
      printFrame.style.height = "0";
      printFrame.style.border = "0";
      document.body.appendChild(printFrame);
      printFrameRef.current = printFrame;
    }

    printFrame.onload = () => {
      try {
        printFrame?.contentWindow?.focus();
        printFrame?.contentWindow?.print();
      } catch (error) {
        console.error("[Delivery2Page] Falha ao imprimir pedido", error);
      }
    };

    printFrame.srcdoc = buildPrintHtml(order);
    return true;
  }

  useEffect(() => {
    lastKnownOrderIdsRef.current = new Set();
  }, [activeOrderDate, searchTerm]);

  useEffect(() => {
    if (!ordersData?.data?.length) return;

    const currentOrderIds = new Set(ordersData.data.map((order) => order.id));
    if (lastKnownOrderIdsRef.current.size === 0) {
      lastKnownOrderIdsRef.current = currentOrderIds;
      return;
    }

    const newPendingOrders = ordersData.data.filter(
      (order) => order.status === "pending" && !lastKnownOrderIdsRef.current.has(order.id),
    );

    if (newPendingOrders.length > 0 && soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((error) => {
        console.warn("[Delivery2Page] Audio bloqueado pelo navegador", error);
      });
    }

    if (newPendingOrders.length > 0 && autoPrintEnabled) {
      const ordersToPrint = newPendingOrders.filter((order) => !printedOrderIds.has(order.id));
      if (ordersToPrint.length > 0) {
        ordersToPrint.forEach((order) => printOrder(order));
        setPrintedOrderIds((previous) => {
          const next = new Set(previous);
          ordersToPrint.forEach((order) => next.add(order.id));
          return next;
        });
      }
    }

    lastKnownOrderIdsRef.current = currentOrderIds;
  }, [autoPrintEnabled, ordersData?.data, printedOrderIds, soundEnabled]);

  const orders = ordersData?.data || [];
  const totals = laneOrder.reduce((acc, lane) => {
    acc[lane] = orders.filter((order) => order.status === lane);
    return acc;
  }, {} as Record<Delivery2Order["status"], Delivery2Order[]>);

  function handleOrderDateChange(nextDate: string) {
    if (!nextDate) return;
    setSelectedDate(nextDate);
    setDateMode(nextDate === brazilToday ? "today" : "custom");
  }

  function jumpOrderDate(days: number) {
    handleOrderDateChange(shiftBrazilDateString(activeOrderDate, days));
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/30 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <Card className="overflow-hidden border-border/60 bg-background/95 shadow-sm">
          <CardHeader className="gap-4 border-b border-border/60 pb-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  <ShoppingBag className="h-4 w-4" />
                  Delivery 2.0
                </div>
                <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
                  Pedidos identificados no atendimento
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-relaxed">
                  O atendimento continua no <strong>Meu Agente IA</strong>. Este modulo apenas observa a conversa,
                  reconhece quando o pedido foi fechado e joga o resultado no PDV online.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ContextualHelpButton
                  articleId="delivery2-overview"
                  label="Ajuda"
                  title="Como configurar o Delivery 2.0"
                  description="Prompt, ativacao, som, impressao e operacao do PDV online."
                />
                <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2 shadow-sm">
                  <span className="text-sm text-muted-foreground">Modulo ativo</span>
                  <Switch
                    checked={config?.is_active === true}
                    onCheckedChange={(checked) => toggleMutation.mutate(checked)}
                    disabled={toggleMutation.isPending}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                  {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Atualizar
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="border-border/70 bg-muted/30">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Novos</p>
                    <p className="mt-2 text-2xl font-semibold">{totals.pending.length}</p>
                  </div>
                  <Clock3 className="h-5 w-5 text-amber-600" />
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-muted/30">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Em operacao</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {totals.confirmed.length + totals.preparing.length + totals.ready.length + totals.out_for_delivery.length}
                    </p>
                  </div>
                  <Store className="h-5 w-5 text-sky-600" />
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-muted/30">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Dia em foco</p>
                    <p className="mt-2 text-2xl font-semibold">{orders.length}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{orderDateLabel}</p>
                  </div>
                  <ShoppingBag className="h-5 w-5 text-foreground" />
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-muted/30">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Receita identificada</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {formatCurrency(orders.reduce((sum, order) => sum + Number(order.total || 0), 0))}
                    </p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </CardContent>
              </Card>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <Tabs
              value={activeTab}
              onValueChange={(nextValue) => {
                const nextTab = nextValue as Delivery2TabValue;
                setActiveTab(nextTab);
                const params = new URLSearchParams(window.location.search);
                if (nextTab === "orders") params.delete("tab");
                else params.set("tab", nextTab);
                const search = params.toString();
                window.history.replaceState({}, "", search ? `/delivery-2?${search}` : "/delivery-2");
              }}
              className="space-y-5"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <TabsList className="grid w-full max-w-lg grid-cols-3">
                  <TabsTrigger value="orders">Pedidos</TabsTrigger>
                  <TabsTrigger value="settings">Configuracoes</TabsTrigger>
                  <TabsTrigger value="reports">Relatorios</TabsTrigger>
                </TabsList>
                {activeTab === "orders" ? (
                  <div className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-2 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    PDV do dia com filtro diario e modo foco
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-2 text-sm text-muted-foreground">
                    {activeTab === "reports" ? <BarChart3 className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
                    {activeTab === "reports"
                      ? "Relatorios por periodo direto no modulo"
                      : "Configuracoes do cardapio, prompt e comportamento automatico"}
                  </div>
                )}
              </div>
              <TabsContent
                value="orders"
                className={cn(
                  "space-y-4",
                  isPdvFullscreen && "fixed inset-0 z-[70] m-0 flex flex-col bg-background px-4 py-4 sm:px-6",
                )}
              >
                <div className="rounded-[1.5rem] border border-border/70 bg-background/95 p-3 shadow-sm">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                      <div className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/20 px-2 py-1.5 shadow-sm">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => jumpOrderDate(-1)}>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-2 rounded-full bg-background px-3 py-2 shadow-sm">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          <Input
                            type="date"
                            value={activeOrderDate}
                            max={brazilToday}
                            onChange={(event) => handleOrderDateChange(event.target.value)}
                            className="h-auto w-[132px] border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                          />
                        </div>
                        <Button
                          variant={dateMode === "today" ? "default" : "ghost"}
                          size="sm"
                          className="rounded-full"
                          onClick={() => {
                            setDateMode("today");
                            setSelectedDate(brazilToday);
                          }}
                        >
                          Hoje
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                          onClick={() => jumpOrderDate(1)}
                          disabled={!canAdvanceDate}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                      <Badge variant="secondary" className="w-fit rounded-full border border-border/70 bg-muted/30 px-3 py-1">
                        {activeOrderDate === brazilToday ? "PDV de hoje" : `PDV de ${orderDateLabel}`}
                      </Badge>
                    </div>

                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                      <div className="relative min-w-[220px] flex-1 lg:min-w-[280px]">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                          placeholder="Buscar cliente, numero ou resumo"
                          className="rounded-full pl-9"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSoundEnabled((prev) => !prev)}>
                            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                          </Button>
                          <span className="text-sm text-muted-foreground">Som</span>
                          <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
                        </div>
                        <div className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAutoPrintEnabled((prev) => !prev)}>
                            {autoPrintEnabled ? <Printer className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                          </Button>
                          <span className="text-sm text-muted-foreground">Auto impressao</span>
                          <Switch checked={autoPrintEnabled} onCheckedChange={setAutoPrintEnabled} />
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 rounded-full"
                          onClick={() => {
                            forceRefreshOrdersRef.current = true;
                            refetch();
                          }}
                          disabled={isFetching}
                        >
                          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 rounded-full"
                          onClick={() => setIsPdvFullscreen((previous) => !previous)}
                        >
                          {isPdvFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className={cn(isPdvFullscreen && "flex-1 overflow-hidden")}>
                  {isLoading ? (
                    <div className="flex items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-20 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Carregando pedidos do Delivery 2.0...
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-16 text-center">
                      <p className="text-base font-medium text-foreground">Nenhum pedido encontrado nesse dia.</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Troque a data no topo ou aguarde um novo pedido fechado cair no PDV.
                      </p>
                    </div>
                  ) : (
                    <ScrollArea className={cn("w-full whitespace-nowrap pb-3", isPdvFullscreen && "h-[calc(100vh-11rem)]")}>
                    <div className="flex min-w-full gap-4 pb-4">
                      {laneOrder.map((lane) => {
                        const laneInfo = statusMeta[lane];
                        const LaneIcon = laneInfo.icon;
                        return (
                          <Card key={lane} className={`w-[320px] shrink-0 border ${laneInfo.laneClassName}`}>
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <div className="rounded-full bg-background/80 p-2 shadow-sm">
                                    <LaneIcon className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <CardTitle className="text-sm font-semibold">{laneInfo.label}</CardTitle>
                                    <CardDescription>{totals[lane].length} pedido(s)</CardDescription>
                                  </div>
                                </div>
                                <Badge className={laneInfo.badgeClassName}>{totals[lane].length}</Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {totals[lane].length === 0 ? (
                                <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-3 py-5 text-center text-sm text-muted-foreground">
                                  Nada por aqui.
                                </div>
                              ) : (
                                totals[lane].map((order) => {
                                  const currentMeta = statusMeta[order.status];
                                  const ActionIcon = currentMeta.icon;
                                  return (
                                    <Card key={order.id} className="border-border/70 bg-background/90 shadow-sm">
                                      <CardContent className="space-y-3 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="space-y-1">
                                            <p className="text-sm font-semibold text-foreground">
                                              {order.customerName || order.contactName || "Cliente"}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{order.contactNumber}</p>
                                          </div>
                                          <Badge className={currentMeta.badgeClassName}>
                                            <ActionIcon className="mr-1 h-3 w-3" />
                                            {currentMeta.label}
                                          </Badge>
                                        </div>
                                        <div className="space-y-1 text-sm">
                                          <p className="line-clamp-2 text-foreground">{order.summary || "Pedido identificado no atendimento"}</p>
                                          <p className="text-xs text-muted-foreground">{formatDateTime(order.finalizedAt)}</p>
                                        </div>
                                        <div className="rounded-xl bg-muted/50 p-3 text-sm">
                                          <div className="flex items-center justify-between">
                                            <span>{order.deliveryType === "pickup" ? "Retirada" : "Entrega"}</span>
                                            <strong>{formatCurrency(order.total)}</strong>
                                          </div>
                                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                            {order.items
                                              .slice(0, 2)
                                              .map((item) => `${item.quantity}x ${item.itemName}`)
                                              .join(" • ")}
                                          </p>
                                        </div>
                                        <div className="flex gap-2">
                                          <Button variant="outline" size="sm" className="flex-1" onClick={() => setSelectedOrder(order)}>
                                            <Eye className="mr-2 h-4 w-4" />
                                            Ver
                                          </Button>
                                          <Button variant="outline" size="sm" onClick={() => printOrder(order)}>
                                            <Printer className="h-4 w-4" />
                                          </Button>
                                        </div>
                                        <div className="flex gap-2">
                                          {currentMeta.nextStatus ? (
                                            <Button
                                              size="sm"
                                              className="flex-1"
                                              onClick={() =>
                                                updateStatusMutation.mutate({
                                                  orderId: order.id,
                                                  status: currentMeta.nextStatus!,
                                                })
                                              }
                                            >
                                              {currentMeta.nextLabel}
                                            </Button>
                                          ) : (
                                            <div className="flex-1" />
                                          )}
                                          {order.status !== "cancelled" && order.status !== "delivered" ? (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="text-rose-600 hover:text-rose-700"
                                              onClick={() =>
                                                updateStatusMutation.mutate({
                                                  orderId: order.id,
                                                  status: "cancelled",
                                                })
                                              }
                                            >
                                              <XCircle className="h-4 w-4" />
                                            </Button>
                                          ) : null}
                                        </div>
                                      </CardContent>
                                    </Card>
                                  );
                                })
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </ScrollArea>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="settings" className="space-y-4">
                <Card className="border-border/70 bg-background/95">
                  <CardHeader>
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        Configuracao do modulo
                      </CardTitle>
                      <CardDescription>
                        O atendimento continua no prompt principal. Aqui voce regula ativacao, cardapio em midia e o comportamento automatico do Delivery 2.0.
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Como funciona</p>
                      <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                        <p>1. O cliente conversa normalmente no WhatsApp com o prompt principal do seu agente.</p>
                        <p>2. Quando a conversa fecha um pedido de verdade, o Delivery 2.0 entende os itens, totais, entrega e pagamento para criar o pedido.</p>
                        <p>3. O pedido entra neste painel para operar, imprimir, tocar som e seguir status.</p>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                      <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Prompt principal
                      </Label>
                      <p className="mt-3 text-sm text-muted-foreground">
                        Cardapio, tom de atendimento, upsell e regras da pizzaria devem ser calibrados no{" "}
                        <strong>Meu Agente IA</strong>.
                      </p>
                      <Button asChild className="mt-4 w-full">
                        <Link href="/meu-agente-ia">Abrir Meu Agente IA</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Delivery2MenuMediaManager config={config} onUpdateConfig={updateConfigPatch} />

                <Card className="border-border/70 bg-background/95">
                  <CardHeader>
                    <CardTitle className="text-base">Operacao do PDV online</CardTitle>
                    <CardDescription>
                      O som e a auto impressao sao ligados diretamente neste navegador para nao atrapalhar outras maquinas.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-border/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">Som de novo pedido</p>
                          <p className="text-sm text-muted-foreground">Toca alerta sempre que entrar pedido novo em aberto.</p>
                        </div>
                        <Button variant="outline" size="icon" onClick={() => setSoundEnabled((prev) => !prev)}>
                          {soundEnabled ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">Impressao automatica</p>
                          <p className="text-sm text-muted-foreground">Imprime automaticamente novos pedidos pendentes nesta maquina.</p>
                        </div>
                        <Switch checked={autoPrintEnabled} onCheckedChange={setAutoPrintEnabled} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="reports" className="space-y-4">
                <Delivery2ReportsPanel />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedOrder?.customerName || selectedOrder?.contactName || "Cliente"}</DialogTitle>
            <DialogDescription>
              {selectedOrder?.summary || "Pedido identificado no atendimento"} • {formatDateTime(selectedOrder?.finalizedAt || null)}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder ? (
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Card className="border-border/70 bg-muted/20">
                    <CardContent className="space-y-2 p-4 text-sm">
                      <p><strong>Telefone:</strong> {selectedOrder.contactNumber}</p>
                      <p><strong>Tipo:</strong> {selectedOrder.deliveryType === "pickup" ? "Retirada" : "Entrega"}</p>
                      <p><strong>Pagamento:</strong> {selectedOrder.paymentMethod || "Nao informado"}</p>
                      <p><strong>Canal:</strong> {selectedOrder.sourceConnectionName || "WhatsApp"}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/70 bg-muted/20">
                    <CardContent className="space-y-2 p-4 text-sm">
                      <p><strong>Endereco:</strong> {selectedOrder.customerAddress || "Nao informado"}</p>
                      {selectedOrder.customerComplement ? <p><strong>Complemento:</strong> {selectedOrder.customerComplement}</p> : null}
                      {selectedOrder.customerReference ? <p><strong>Referencia:</strong> {selectedOrder.customerReference}</p> : null}
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-border/70 bg-background/95">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Itens</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedOrder.items.map((item) => (
                      <div key={item.id} className="rounded-xl border border-border/70 bg-muted/20 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{item.quantity}x {item.itemName}</p>
                            <p className="text-sm text-muted-foreground">
                              {[item.sizeLabel, item.halfAndHalf.length ? `Meio a meio: ${item.halfAndHalf.join(" + ")}` : null]
                                .filter(Boolean)
                                .join(" • ") || "Sem variacao"}
                            </p>
                          </div>
                          <strong>{formatCurrency(item.totalPrice)}</strong>
                        </div>
                        {item.selectedOptions.length ? (
                          <p className="mt-2 text-sm text-muted-foreground">Opcoes: {item.selectedOptions.join(", ")}</p>
                        ) : null}
                        {item.notes ? <p className="mt-1 text-sm text-muted-foreground">Obs: {item.notes}</p> : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-background/95">
                  <CardContent className="space-y-2 p-4 text-sm">
                    <div className="flex items-center justify-between"><span>Subtotal</span><strong>{formatCurrency(selectedOrder.subtotal)}</strong></div>
                    <div className="flex items-center justify-between"><span>Entrega</span><strong>{formatCurrency(selectedOrder.deliveryFee)}</strong></div>
                    <div className="flex items-center justify-between text-base"><span>Total</span><strong>{formatCurrency(selectedOrder.total)}</strong></div>
                  </CardContent>
                </Card>

                {selectedOrder.notes ? (
                  <Card className="border-border/70 bg-background/95">
                    <CardContent className="p-4 text-sm text-muted-foreground">
                      <strong className="text-foreground">Observacoes gerais:</strong> {selectedOrder.notes}
                    </CardContent>
                  </Card>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => printOrder(selectedOrder)}>
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimir
                  </Button>
                  {statusMeta[selectedOrder.status].nextStatus ? (
                    <Button
                      onClick={() =>
                        updateStatusMutation.mutate({
                          orderId: selectedOrder.id,
                          status: statusMeta[selectedOrder.status].nextStatus!,
                        })
                      }
                    >
                      {statusMeta[selectedOrder.status].nextLabel}
                    </Button>
                  ) : null}
                </div>
              </div>
            </ScrollArea>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
