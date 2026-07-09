import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  UtensilsCrossed, 
  Search, 
  Clock, 
  User, 
  MapPin, 
  Phone, 
  DollarSign,
  CheckCircle2,
  ChefHat,
  Truck,
  Package,
  XCircle,
  RefreshCw,
  Bell,
  BellOff,
  MoreVertical,
  Eye,
  MessageSquare,
  Printer,
  Timer,
  ArrowRight,
  FileText,
  Volume2,
  VolumeX
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { deliveryOrdersSoundStorageKey } from "@/lib/delivery-notification-audio";
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OrderItem {
  id: string;
  menu_item_id: string | null;
  item_name: string; // Nome do item salvo diretamente
  quantity: number;
  unit_price: string;
  total_price: string;
  notes: string | null;
  options_selected: any[];
}

interface DeliveryOrder {
  id: string;
  user_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string | null;
  customer_complement: string | null; // Complemento do endereço
  customer_reference: string | null;
  delivery_type: 'delivery' | 'pickup';
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
  subtotal: string;
  delivery_fee: string;
  discount: string;
  total: string;
  payment_method: string | null;
  payment_status: 'pending' | 'paid';
  notes: string | null;
  estimated_time: number | null; // Tempo estimado em minutos
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  delivered_at: string | null;
  conversation_id: string | null; // ID da conversa do WhatsApp
  order_items?: OrderItem[];
}

interface OrdersResponse {
  orders: DeliveryOrder[];
  total: number;
  page: number;
  totalPages: number;
}

interface DeliveryStats {
  today: {
    total: number;
    revenue: number;
    pending: number;
    confirmed: number;
    preparing: number;
    ready: number;
    out_for_delivery: number;
    delivered: number;
    cancelled: number;
  };
  week: {
    total: number;
    revenue: number;
  };
}

const statusConfig: Record<string, { 
  label: string; 
  icon: React.ElementType; 
  color: string;
  bgColor: string;
  nextStatus?: string;
  nextLabel?: string;
}> = {
  pending: { 
    label: 'Pendente', 
    icon: Clock, 
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50 border-yellow-200',
    nextStatus: 'confirmed',
    nextLabel: 'Confirmar'
  },
  confirmed: { 
    label: 'Confirmado', 
    icon: CheckCircle2, 
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
    nextStatus: 'preparing',
    nextLabel: 'Preparar'
  },
  preparing: { 
    label: 'Preparando', 
    icon: ChefHat, 
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 border-orange-200',
    nextStatus: 'ready',
    nextLabel: 'Pronto'
  },
  ready: { 
    label: 'Pronto', 
    icon: Package, 
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 border-purple-200',
    nextStatus: 'out_for_delivery',
    nextLabel: 'Saiu para Entrega'
  },
  out_for_delivery: { 
    label: 'Saiu para Entrega', 
    icon: Truck, 
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 border-indigo-200',
    nextStatus: 'delivered',
    nextLabel: 'Entregue'
  },
  delivered: { 
    label: 'Entregue', 
    icon: CheckCircle2, 
    color: 'text-green-600',
    bgColor: 'bg-green-50 border-green-200'
  },
  cancelled: { 
    label: 'Cancelado', 
    icon: XCircle, 
    color: 'text-red-600',
    bgColor: 'bg-red-50 border-red-200'
  },
};

const kanbanColumns = [
  { status: 'pending', title: '⏳ Pendentes' },
  { status: 'confirmed', title: '✅ Confirmados' },
  { status: 'preparing', title: '👨‍🍳 Preparando' },
  { status: 'ready', title: '📦 Prontos' },
  { status: 'out_for_delivery', title: '🚚 Em Entrega' },
  { status: 'cancelled', title: '❌ Cancelados' },
];

export default function DeliveryOrdersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const soundStorageKey = deliveryOrdersSoundStorageKey;
  const autoPrintStorageKey = "delivery-orders:auto-print";

  // Estados
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Estados para notificação sonora
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
  const [printedOrderIds, setPrintedOrderIds] = useState<Set<string>>(new Set());
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const lastKnownOrderIdsRef = useRef<Set<string>>(new Set());
  

  useEffect(() => {
    return () => {
      if (printFrameRef.current) {
        printFrameRef.current.remove();
        printFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedSound = window.localStorage.getItem(soundStorageKey);
    if (storedSound === "false") {
      setSoundEnabled(false);
    }

    const storedAutoPrint = window.localStorage.getItem(autoPrintStorageKey);
    if (storedAutoPrint === "true") {
      setAutoPrintEnabled(true);
    }

    const storedPrintedIds = window.localStorage.getItem(`${autoPrintStorageKey}:printed`);
    if (!storedPrintedIds) return;

    try {
      const parsed = JSON.parse(storedPrintedIds);
      if (Array.isArray(parsed)) {
        setPrintedOrderIds(new Set(parsed.filter((value): value is string => typeof value === "string")));
      }
    } catch (error) {
      console.warn("[DeliveryOrders] Falha ao carregar histórico de impressão automática", error);
    }
  }, [autoPrintStorageKey, soundStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(soundStorageKey, String(soundEnabled));
  }, [soundEnabled, soundStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(autoPrintStorageKey, String(autoPrintEnabled));
  }, [autoPrintEnabled, autoPrintStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      `${autoPrintStorageKey}:printed`,
      JSON.stringify(Array.from(printedOrderIds))
    );
  }, [autoPrintStorageKey, printedOrderIds]);
  
  const buildPrintContent = useCallback((order: DeliveryOrder) => {
    const orderItemsHtml = order.order_items?.map(item => `
      <div class="item">
        <span>${item.quantity}x ${item.item_name || 'Item'}</span>
        <span>R$ ${(Number(item.total_price) || 0).toFixed(2)}</span>
      </div>
      ${item.notes ? `<div class="note">Obs: ${item.notes}</div>` : ''}
    `).join('') || '';

    return `
      <html>
      <head>
        <title>Pedido #${order.order_number}</title>
        <style>
          body { font-family: monospace; font-size: 12px; padding: 10px; max-width: 80mm; margin: 0 auto; color: #111; }
          h1 { text-align: center; font-size: 16px; margin-bottom: 10px; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .item { display: flex; justify-content: space-between; gap: 8px; margin: 4px 0; }
          .note { font-size: 10px; color: #555; margin: 2px 0 6px; }
          .total { font-weight: bold; font-size: 14px; }
          .info { margin: 4px 0; }
        </style>
      </head>
      <body>
        <h1>PEDIDO #${order.order_number}</h1>
        <div class="divider"></div>
        <div class="info"><strong>Cliente:</strong> ${order.customer_name}</div>
        <div class="info"><strong>Tel:</strong> ${order.customer_phone}</div>
        ${order.delivery_type === 'delivery'
          ? `<div class="info"><strong>End:</strong> ${order.customer_address || ''}</div>`
          : '<div class="info"><strong>RETIRADA NO LOCAL</strong></div>'}
        <div class="divider"></div>
        <strong>ITENS:</strong>
        ${orderItemsHtml}
        <div class="divider"></div>
        <div class="item"><span>Subtotal:</span><span>R$ ${(Number(order.subtotal) || 0).toFixed(2)}</span></div>
        ${Number(order.delivery_fee) > 0
          ? `<div class="item"><span>Taxa Entrega:</span><span>R$ ${Number(order.delivery_fee).toFixed(2)}</span></div>`
          : ''}
        <div class="item total"><span>TOTAL:</span><span>R$ ${(Number(order.total) || 0).toFixed(2)}</span></div>
        <div class="divider"></div>
        <div class="info"><strong>Pagamento:</strong> ${order.payment_method || 'Não informado'}</div>
        <div class="info" style="text-align:center;margin-top:10px;">Obrigado pela preferência!</div>
      </body>
      </html>
    `;
  }, []);

  const printOrder = useCallback((order: DeliveryOrder, options?: { auto?: boolean }) => {
    if (typeof window === "undefined") return false;

    if (!document.body) {
      toast({
        title: options?.auto ? "Impressão automática bloqueada" : "Não foi possível abrir a impressão",
        description: "Libere pop-ups do navegador para este painel.",
        variant: "destructive",
      });
      return false;
    }

    let printFrame = printFrameRef.current;
    if (!printFrame || !document.body.contains(printFrame)) {
      printFrame = document.createElement("iframe");
      printFrame.setAttribute("aria-hidden", "true");
      printFrame.style.position = "fixed";
      printFrame.style.right = "0";
      printFrame.style.bottom = "0";
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
        console.error("[DeliveryOrders] Falha ao imprimir pedido", error);
        toast({
          title: options?.auto ? "Impressao automatica falhou" : "Nao foi possivel imprimir",
          description: "Verifique a impressora e as permissoes do navegador.",
          variant: "destructive",
        });
      }
    };

    printFrame.srcdoc = buildPrintContent(order);

    return true;
  }, [buildPrintContent, toast]);

  // Build query URL
  const buildOrdersUrl = () => {
    const params = new URLSearchParams({
      page: String(currentPage),
      limit: '50',
    });
    if (searchTerm) params.set('search', searchTerm);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    return `/api/delivery/orders?${params.toString()}`;
  };

  // Queries
  const { data: ordersData, isLoading: isLoadingOrders, refetch } = useQuery<OrdersResponse>({
    queryKey: [buildOrdersUrl()],
    refetchInterval: autoRefresh ? 10000 : false, // Auto-refresh every 10s
  });

  // Efeito para detectar novos pedidos e tocar notificação
  useEffect(() => {
    if (!ordersData?.orders) return;
    
    const currentOrderIds = new Set(ordersData.orders.map(o => o.id));
    
    // Na primeira carga, apenas salva os IDs
    if (lastKnownOrderIdsRef.current.size === 0) {
      lastKnownOrderIdsRef.current = currentOrderIds;
      return;
    }
    
    // Verificar se há novos pedidos pendentes
    const newPendingOrders = ordersData.orders.filter(
      order => order.status === 'pending' && !lastKnownOrderIdsRef.current.has(order.id)
    );
    
    if (newPendingOrders.length > 0) {
      if (autoPrintEnabled) {
        const pendingToPrint = newPendingOrders.filter(order => !printedOrderIds.has(order.id));
        let printedCount = 0;

        pendingToPrint.forEach((order) => {
          if (printOrder(order, { auto: true })) {
            printedCount += 1;
          }
        });

        if (pendingToPrint.length > 0) {
          setPrintedOrderIds((prev) => {
            const next = new Set(prev);
            pendingToPrint.forEach((order) => next.add(order.id));
            return next;
          });
        }

        if (printedCount > 0) {
          toast({
            title: "Impressão automática disparada",
            description: `${printedCount} pedido(s) enviado(s) para impressão.`,
          });
        }
      }
    }
    
    // Atualizar lista de IDs conhecidos
    lastKnownOrderIdsRef.current = currentOrderIds;
  }, [autoPrintEnabled, ordersData?.orders, printOrder, printedOrderIds, toast]);

  const { data: stats, isLoading: isLoadingStats } = useQuery<DeliveryStats>({
    queryKey: ["/api/delivery/stats"],
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Invalidar queries
  const invalidateOrderQueries = () => {
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && key.includes('/api/delivery/');
    }});
  };

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest('PUT', `/api/delivery/orders/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (_, variables) => {
      invalidateOrderQueries();
      const statusInfo = statusConfig[variables.status];
      toast({ title: `Pedido atualizado para: ${statusInfo?.label}` });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar pedido", variant: "destructive" });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('PUT', `/api/delivery/orders/${id}/status`, { status: 'cancelled' });
      return res.json();
    },
    onSuccess: () => {
      invalidateOrderQueries();
      toast({ title: "Pedido cancelado" });
    },
    onError: () => {
      toast({ title: "Erro ao cancelar pedido", variant: "destructive" });
    },
  });

  // Agrupar pedidos por status para o Kanban
  const ordersByStatus = kanbanColumns.reduce((acc, col) => {
    acc[col.status] = ordersData?.orders.filter(o => o.status === col.status) || [];
    return acc;
  }, {} as Record<string, DeliveryOrder[]>);

  // Formatar preço
  const formatPrice = (price: string | null) => {
    if (!price) return 'R$ 0,00';
    const num = parseFloat(price);
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Formatar tempo
  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch {
      return '-';
    }
  };

  // Componente de Card de Pedido
  const OrderCard = ({ order }: { order: DeliveryOrder }) => {
    const config = statusConfig[order.status];
    const StatusIcon = config.icon;
    const canCancelOrder = order.status !== 'cancelled' && order.status !== 'delivered';

    const openOrderDetails = () => {
      setSelectedOrder(order);
      setIsDetailsOpen(true);
    };

    const handleAdvanceOrder = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!config.nextStatus) return;
      updateStatusMutation.mutate({ id: order.id, status: config.nextStatus });
    };

    const handleCancelOrder = (e: React.MouseEvent) => {
      e.stopPropagation();
      cancelOrderMutation.mutate(order.id);
    };
    
    const handlePrint = (e: React.MouseEvent) => {
      e.stopPropagation();
      printOrder(order);
    };
    
    return (
      <Card 
        className={`mb-3 cursor-pointer hover:shadow-md transition-shadow border-l-4 ${config.bgColor}`}
        onClick={openOrderDetails}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                #{order.order_number}
              </Badge>
              {order.delivery_type === 'pickup' && (
                <Badge variant="secondary" className="text-xs">
                  Retirada
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handlePrint}
                title="Imprimir pedido"
              >
                <Printer className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {formatTime(order.created_at)}
              </span>
            </div>
          </div>
          
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium truncate">{order.customer_name}</span>
            </div>
            
            {order.delivery_type === 'delivery' && order.customer_address && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{order.customer_address}</span>
              </div>
            )}

            {/* Mostrar itens diretamente no card */}
            {order.order_items && order.order_items.length > 0 && (
              <div className="mt-2 pt-2 border-t border-dashed space-y-1">
                {order.order_items.slice(0, 4).map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span className="truncate flex-1 text-muted-foreground">
                      {item.quantity}x {item.item_name || 'Item'}
                    </span>
                    <span className="font-medium ml-2">
                      {formatPrice(item.total_price)}
                    </span>
                  </div>
                ))}
                {order.order_items.length > 4 && (
                  <div className="text-xs text-muted-foreground italic">
                    +{order.order_items.length - 4} mais itens...
                  </div>
                )}
              </div>
            )}
            
            <div className="flex items-center justify-between mt-2 pt-2 border-t">
              <div className="flex items-center gap-1">
                <UtensilsCrossed className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs">{order.order_items?.length || 0} itens</span>
              </div>
              <span className="font-semibold text-sm">
                {formatPrice(order.total)}
              </span>
            </div>
          </div>

          {/* Botões de ação */}
          <div className="mt-3 border-t pt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center text-xs font-semibold"
                onClick={(e) => {
                  e.stopPropagation();
                  openOrderDetails();
                }}
              >
                <Eye className="h-3.5 w-3.5" />
                Detalhes
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center text-xs font-semibold"
                onClick={handlePrint}
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimir
              </Button>
            </div>

            <div className={`grid gap-2 ${config.nextStatus && canCancelOrder ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {config.nextStatus && (
                <Button
                  type="button"
                  size="sm"
                  className="w-full justify-center border border-emerald-700 bg-emerald-600 font-semibold text-white shadow-sm hover:bg-emerald-700"
                  onClick={handleAdvanceOrder}
                  disabled={updateStatusMutation.isPending}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  {config.nextLabel}
                </Button>
              )}
              {canCancelOrder && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-center border-red-200 text-red-700 font-semibold hover:bg-red-50 hover:text-red-800"
                  onClick={handleCancelOrder}
                  disabled={cancelOrderMutation.isPending}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto py-4 px-4 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Pedidos - PDV
          </h1>
          <p className="text-muted-foreground text-sm">
            Gerencie os pedidos do delivery em tempo real
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button
            variant={soundEnabled ? "default" : "outline"}
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Som ativado - clique para desativar" : "Som desativado - clique para ativar"}
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4 mr-2" />
            ) : (
              <VolumeX className="h-4 w-4 mr-2" />
            )}
            Som
          </Button>
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto-refresh
          </Button>
          <Button
            variant={autoPrintEnabled ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoPrintEnabled(!autoPrintEnabled)}
            title={autoPrintEnabled ? "Auto-impressão ativada para novos pedidos" : "Ativar auto-impressão para novos pedidos"}
          >
            <Printer className="h-4 w-4 mr-2" />
            Auto-impressão
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
            <CardContent className="p-3">
              <div className="text-xs text-blue-600 font-medium">Hoje</div>
              <div className="text-2xl font-bold text-blue-700">{stats.today.total}</div>
              <div className="text-xs text-muted-foreground">pedidos</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100">
            <CardContent className="p-3">
              <div className="text-xs text-green-600 font-medium">Faturamento</div>
              <div className="text-xl font-bold text-green-700">{formatPrice(String(stats.today.revenue))}</div>
              <div className="text-xs text-muted-foreground">hoje</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100">
            <CardContent className="p-3">
              <div className="text-xs text-yellow-600 font-medium">Pendentes</div>
              <div className="text-2xl font-bold text-yellow-700">{stats.today.pending}</div>
              <div className="text-xs text-muted-foreground">aguardando</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100">
            <CardContent className="p-3">
              <div className="text-xs text-orange-600 font-medium">Em Preparo</div>
              <div className="text-2xl font-bold text-orange-700">{stats.today.preparing}</div>
              <div className="text-xs text-muted-foreground">na cozinha</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100">
            <CardContent className="p-3">
              <div className="text-xs text-purple-600 font-medium">Semana</div>
              <div className="text-xl font-bold text-purple-700">{formatPrice(String(stats.week.revenue))}</div>
              <div className="text-xs text-muted-foreground">{stats.week.total} pedidos</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar pedido, cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={viewMode} onValueChange={(v: 'kanban' | 'list') => setViewMode(v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kanban">Kanban</SelectItem>
            <SelectItem value="list">Lista</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {kanbanColumns.map((col) => {
            const orders = ordersByStatus[col.status];
            const config = statusConfig[col.status];
            
            return (
              <div key={col.status} className="w-[320px] min-w-[320px] flex-shrink-0">
                <div className={`rounded-t-lg p-3 ${config.bgColor}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">{col.title}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {orders.length}
                    </Badge>
                  </div>
                </div>
                <ScrollArea className="h-[calc(100vh-340px)] bg-muted/30 rounded-b-lg p-2">
                  {isLoadingOrders ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Nenhum pedido
                    </div>
                  ) : (
                    orders.map((order) => (
                      <OrderCard key={order.id} order={order} />
                    ))
                  )}
                </ScrollArea>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium">Pedido</th>
                    <th className="text-left p-3 text-sm font-medium">Cliente</th>
                    <th className="text-left p-3 text-sm font-medium">Itens</th>
                    <th className="text-left p-3 text-sm font-medium">Total</th>
                    <th className="text-left p-3 text-sm font-medium">Status</th>
                    <th className="text-left p-3 text-sm font-medium">Horário</th>
                    <th className="text-center p-3 text-sm font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersData?.orders.map((order) => {
                    const config = statusConfig[order.status];
                    const StatusIcon = config.icon;
                    
                    return (
                      <tr key={order.id} className="border-b hover:bg-muted/30">
                        <td className="p-3">
                          <Badge variant="outline" className="font-mono">
                            #{order.order_number}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{order.customer_name}</div>
                          <div className="text-xs text-muted-foreground">{order.customer_phone}</div>
                        </td>
                        <td className="p-3">
                          <div className="space-y-1 text-sm">
                            {(order.order_items?.slice(0, 3) || []).map((item, index) => (
                              <div key={`${order.id}-item-${index}`} className="leading-tight">
                                <span className="font-medium">{item.quantity}x</span>{" "}
                                <span className="text-muted-foreground">{item.item_name || "Item"}</span>
                              </div>
                            ))}
                            {(order.order_items?.length || 0) > 3 && (
                              <div className="text-xs text-muted-foreground">
                                +{(order.order_items?.length || 0) - 3} itens
                              </div>
                            )}
                            {(order.order_items?.length || 0) === 0 && (
                              <div className="text-xs text-muted-foreground">Sem itens</div>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-medium">{formatPrice(order.total)}</td>
                        <td className="p-3">
                          <Badge className={config.bgColor}>
                            <StatusIcon className={`h-3 w-3 mr-1 ${config.color}`} />
                            {config.label}
                          </Badge>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {formatTime(order.created_at)}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex justify-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => {
                                setSelectedOrder(order);
                                setIsDetailsOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => printOrder(order)}
                              title="Imprimir pedido"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            {config.nextStatus && (
                              <Button
                                size="sm"
                                onClick={() => updateStatusMutation.mutate({ 
                                  id: order.id, 
                                  status: config.nextStatus! 
                                })}
                              >
                                {config.nextLabel}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal: Detalhes do Pedido */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Pedido #{selectedOrder.order_number}
                  <Badge className={statusConfig[selectedOrder.status].bgColor}>
                    {statusConfig[selectedOrder.status].label}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Criado {formatTime(selectedOrder.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Cliente */}
                <div className="p-3 rounded-lg border bg-muted/30">
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Cliente
                  </h4>
                  <div className="space-y-1 text-sm">
                    <div className="font-medium">{selectedOrder.customer_name}</div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {selectedOrder.customer_phone}
                    </div>
                  </div>
                </div>

                {/* Endereço */}
                {selectedOrder.delivery_type === 'delivery' && (
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Endereço de Entrega
                    </h4>
                    <div className="text-sm space-y-1">
                      <div>{selectedOrder.customer_address}</div>
                      {selectedOrder.customer_complement && (
                        <div className="text-muted-foreground">{selectedOrder.customer_complement}</div>
                      )}
                      {selectedOrder.customer_reference && (
                        <div className="text-xs text-muted-foreground italic">
                          Ref: {selectedOrder.customer_reference}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Itens */}
                <div className="p-3 rounded-lg border">
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                    <UtensilsCrossed className="h-4 w-4" />
                    Itens do Pedido
                  </h4>
                  <div className="space-y-2">
                    {selectedOrder.order_items?.map((item) => (
                      <div key={item.id} className="flex justify-between items-start text-sm py-1 border-b last:border-0">
                        <div className="flex-1">
                          <div className="font-medium">
                            {item.quantity}x {item.item_name || 'Item'}
                          </div>
                          {item.notes && (
                            <div className="text-xs text-muted-foreground italic">
                              Obs: {item.notes}
                            </div>
                          )}
                        </div>
                        <div className="font-medium">
                          {formatPrice(item.total_price)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totais */}
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>{formatPrice(selectedOrder.subtotal)}</span>
                    </div>
                    {parseFloat(selectedOrder.delivery_fee) > 0 && (
                      <div className="flex justify-between">
                        <span>Taxa de entrega</span>
                        <span>{formatPrice(selectedOrder.delivery_fee)}</span>
                      </div>
                    )}
                    {parseFloat(selectedOrder.discount) > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Desconto</span>
                        <span>-{formatPrice(selectedOrder.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg border-t pt-2 mt-2">
                      <span>Total</span>
                      <span>{formatPrice(selectedOrder.total)}</span>
                    </div>
                    {selectedOrder.payment_method && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <DollarSign className="h-3 w-3" />
                        Pagamento: {selectedOrder.payment_method}
                        {selectedOrder.payment_status === 'paid' && (
                          <Badge variant="outline" className="text-green-600 ml-2">Pago</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Observações */}
                {selectedOrder.notes && (
                  <div className="p-3 rounded-lg border border-yellow-200 bg-yellow-50">
                    <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Observações
                    </h4>
                    <div className="text-sm">{selectedOrder.notes}</div>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 flex-wrap">
                {/* Botão Imprimir */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const order = selectedOrder;
                    const printContent = `
                      <html>
                      <head>
                        <title>Pedido #${order.order_number}</title>
                        <style>
                          body { font-family: monospace; font-size: 12px; padding: 10px; max-width: 80mm; margin: 0 auto; }
                          h1 { text-align: center; font-size: 16px; margin-bottom: 10px; }
                          .divider { border-top: 1px dashed #000; margin: 8px 0; }
                          .item { display: flex; justify-content: space-between; margin: 4px 0; }
                          .total { font-weight: bold; font-size: 14px; }
                          .info { margin: 4px 0; }
                        </style>
                      </head>
                      <body>
                        <h1>PEDIDO #${order.order_number}</h1>
                        <div class="divider"></div>
                        <div class="info"><strong>Cliente:</strong> ${order.customer_name}</div>
                        <div class="info"><strong>Tel:</strong> ${order.customer_phone}</div>
                        ${order.delivery_type === 'delivery' ? `<div class="info"><strong>End:</strong> ${order.customer_address || ''}</div>` : '<div class="info"><strong>RETIRADA NO LOCAL</strong></div>'}
                        <div class="divider"></div>
                        <strong>ITENS:</strong>
                        ${order.order_items?.map(item => `
                          <div class="item">
                            <span>${item.quantity}x ${item.item_name || 'Item'}</span>
                            <span>R$ ${(Number(item.total_price) || 0).toFixed(2)}</span>
                          </div>
                          ${item.notes ? `<div style="font-size:10px;color:#666;">  → ${item.notes}</div>` : ''}
                        `).join('') || ''}
                        <div class="divider"></div>
                        <div class="item"><span>Subtotal:</span><span>R$ ${(Number(order.subtotal) || 0).toFixed(2)}</span></div>
                        ${Number(order.delivery_fee) > 0 ? `<div class="item"><span>Taxa Entrega:</span><span>R$ ${Number(order.delivery_fee).toFixed(2)}</span></div>` : ''}
                        <div class="item total"><span>TOTAL:</span><span>R$ ${(Number(order.total) || 0).toFixed(2)}</span></div>
                        <div class="divider"></div>
                        <div class="info"><strong>Pagamento:</strong> ${order.payment_method || 'Não informado'}</div>
                        <div class="info" style="text-align:center;margin-top:10px;">Obrigado pela preferência!</div>
                      </body>
                      </html>
                    `;
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      printWindow.document.write(printContent);
                      printWindow.document.close();
                      printWindow.focus();
                      setTimeout(() => {
                        printWindow.print();
                        printWindow.close();
                      }, 250);
                    }
                  }}
                >
                  <Printer className="h-4 w-4 mr-1" />
                  Imprimir
                </Button>

                {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'delivered' && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      cancelOrderMutation.mutate(selectedOrder.id);
                      setIsDetailsOpen(false);
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Cancelar
                  </Button>
                )}
                
                {statusConfig[selectedOrder.status].nextStatus && (
                  <Button
                    onClick={() => {
                      updateStatusMutation.mutate({ 
                        id: selectedOrder.id, 
                        status: statusConfig[selectedOrder.status].nextStatus! 
                      });
                      setIsDetailsOpen(false);
                    }}
                  >
                    <ArrowRight className="h-4 w-4 mr-1" />
                    {statusConfig[selectedOrder.status].nextLabel}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


