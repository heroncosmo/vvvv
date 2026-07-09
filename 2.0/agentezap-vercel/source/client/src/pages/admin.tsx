import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { buildPublicAppUrl } from "@/lib/native-runtime";
import { repairReactNodeText } from "@/lib/repair-react-node";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch, useRoute } from "wouter";
import { Loader2, Plus, Trash2, Check, DollarSign, Users, CreditCard, MessageCircle, Bot, LayoutDashboard, Settings, UserCog, Edit, Send, Play, RefreshCw, Search, CheckCircle, Copy, Key, Eye, EyeOff, TestTube, LogIn, LogOut, CheckSquare, Square, ArrowUpDown, ArrowUp, ArrowDown, ArrowLeft, Lock, Tag, Crown, Building2, ShieldAlert, ShieldCheck, ShieldOff, AlertTriangle, UserMinus, Receipt, XCircle, FileImage, TicketCheck, BarChart3, Layers, Link2, Repeat, MoreHorizontal, ShoppingCart, LifeBuoy, Wrench, Sparkles, ListChecks } from "lucide-react";
import type { Plan, Subscription, Payment, User } from "@shared/schema";
import AdminNotificationsPanel from "@/components/admin-notifications-panel";
import AdminWhatsappPanel from "@/components/admin-whatsapp-panel";
import AdminStatusPanel from "@/components/admin-status-panel";
import AdminAgentConfig from "@/components/admin-agent-config";
import AdminLeadCatalog from "@/components/admin-lead-catalog";
import AdminLeadIntelligence from "@/components/admin-lead-intelligence";
import AdminConversations from "@/components/admin-conversations";
import AdminConversationMonitor from "@/components/admin-conversation-monitor";
import AdminReferralsPanel from "@/components/admin-referrals-panel";
import AdminAiQueuePanel from "@/components/admin-ai-queue-panel";
import { UserAgentConfigDialog } from "@/components/user-agent-config-dialog";
import SuspendedUsersManager from "@/components/suspended-users-manager";
import AdminTicketsPanel from "@/components/admin-tickets-panel";
import AdminTicketReports from "@/components/admin-ticket-reports";
import AdminOrdersPanel from "@/components/admin-orders-panel";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  SidebarSeparator,
} from "@/components/ui/sidebar";

function normalizeAdminTab(tab?: string | null) {
  if (!tab) return "dashboard";
  if (tab === "followup" || tab === "calendar") return "whatsapp";
  return tab;
}

export default function AdminPanel() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  
  // Extrair tab da URL
  const getTabFromUrl = () => {
    const hash = window.location.hash.replace('#', '');
    if (hash) return normalizeAdminTab(hash.split('/')[0] || 'dashboard');
    const urlParams = new URLSearchParams(window.location.search);
    return normalizeAdminTab(urlParams.get('tab') || 'dashboard');
  };
  
  // Extrair sub-tab da URL (e.g., #whatsapp/broadcast → "broadcast")
  const getSubTabFromUrl = () => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const parts = hash.split('/');
      return parts[1] || undefined;
    }
    return undefined;
  };

  const [activeTab, setActiveTab] = useState(getTabFromUrl);
  const [activeSubTab, setActiveSubTab] = useState<string | undefined>(getSubTabFromUrl);
  const [adminSession, setAdminSession] = useState<{ authenticated: boolean; isAdmin: boolean; email?: string | null; isOwner?: boolean } | null>(null);

  // Sincronizar aba com mudanças de hash (back/forward ou deep link)
  useEffect(() => {
    const onHashChange = () => {
      setActiveTab(getTabFromUrl());
      setActiveSubTab(getSubTabFromUrl());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  
  // Sincronizar aba com URL
  const handleTabChange = (tab: string) => {
    const normalizedTab = normalizeAdminTab(tab);
    setActiveTab(normalizedTab);
    setActiveSubTab(undefined); // Reset sub-tab when changing main tab

    if (normalizedTab === 'agent') {
      const hash = window.location.hash.replace('#', '');
      const parts = hash.split('/');
      const subTab = parts[0] === 'agent' ? (parts[1] || 'atendimento') : 'atendimento';
      window.history.replaceState(null, '', `/admin#agent/${subTab}`);
      return;
    }

    window.history.replaceState(null, '', `/admin#${normalizedTab}`);
  };
  
  // Callback para sub-tabs mudarem a URL 
  const handleSubTabChange = (subTab: string) => {
    setActiveSubTab(subTab);
    window.history.replaceState(null, '', `/admin#${activeTab}/${subTab}`);
  };

  // Listener para evento custom de mudança de tab (usado por subcomponentes como Conversas)
  useEffect(() => {
    const onTabChange = (e: any) => handleTabChange(e.detail);
    window.addEventListener('admin-tab-change', onTabChange);
    return () => window.removeEventListener('admin-tab-change', onTabChange);
  }, []);

  // Logout do admin
  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    } catch (e) {
      console.warn("Falha ao chamar /api/admin/logout:", e);
    }
    setLocation("/admin-login");
  };

  // Guard: exige sessão de admin
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/session", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAdminSession(data);
        if (!cancelled && (!data?.authenticated || !data?.isAdmin)) {
          setLocation("/admin-login");
        }
      })
      .catch(() => {
        if (!cancelled) setLocation("/admin-login");
      });
    return () => { cancelled = true; };
  }, [setLocation]);

  const isOwnerAdmin = adminSession?.isOwner === true;

  const { data: stats } = useQuery<{ totalUsers: number; totalRevenue: number; activeSubscriptions: number }>({
    queryKey: ["/api/admin/stats"],
    enabled: activeTab === "dashboard",
  });

  const { data: users } = useQuery<UserWithConnectionStatus[]>({
    queryKey: ["/api/admin/users"],
    enabled: activeTab === "manage",
    refetchInterval: activeTab === "manage" ? 60000 : false,
    refetchIntervalInBackground: false,
    staleTime: 45000,
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ["/api/admin/plans"],
    enabled: activeTab === "manage" || activeTab === "plans",
  });

  const { data: subscriptions } = useQuery<AdminSubscriptionWithDetails[]>({
    queryKey: ["/api/admin/subscriptions"],
    enabled: activeTab === "manage" || activeTab === "former-subscribers",
  });

  const { data: pendingPayments } = useQuery<(Payment & { subscription: Subscription & { user: User; plan: Plan } })[]>({
    queryKey: ["/api/admin/payments/pending"],
    enabled: activeTab === "payments",
  });

  // Query para comprovantes PIX pendentes (exibir badge e cards em vários menus)
  const { data: pendingReceiptsData } = useQuery<{ receipts: any[]; total: number }>({
    queryKey: ["/api/admin/payment-receipts", "pending"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/payment-receipts?status=pending&limit=100");
      return await res.json();
    },
    refetchInterval: 30000, // Atualizar a cada 30 segundos
  });
  const pendingReceiptsCount = pendingReceiptsData?.total || 0;
  const pendingReceipts = pendingReceiptsData?.receipts || [];

  const { data: config } = useQuery<{ mistral_api_key: string; mistral_api_keys?: string[] }>({
    queryKey: ["/api/admin/config"],
    enabled: activeTab === "config",
  });

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card data-testid="card-stat-users">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Usuários</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-users">
                  {stats?.totalUsers || 0}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-stat-revenue">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-revenue">
                  R$ {stats?.totalRevenue?.toFixed(2) || "0.00"}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-stat-subscriptions">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-active-subscriptions">
                  {stats?.activeSubscriptions || 0}
                </div>
              </CardContent>
            </Card>

            {/* Card de Comprovantes PIX Pendentes */}
            <Card 
              className={cn("cursor-pointer transition-colors hover:bg-muted/50", pendingReceiptsCount > 0 && "border-orange-400 bg-orange-50/50 dark:bg-orange-900/10")}
              onClick={() => handleTabChange("receipts")}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Comprovantes PIX Pendentes</CardTitle>
                <Receipt className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className={cn("text-2xl font-bold", pendingReceiptsCount > 0 && "text-orange-600")}>
                  {pendingReceiptsCount}
                </div>
                {pendingReceiptsCount > 0 && (
                  <p className="text-xs text-orange-600 mt-1">Clique para revisar</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Lista de Comprovantes PIX Pendentes no Dashboard */}
          {pendingReceiptsCount > 0 && (
            <Card className="border-orange-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="w-5 h-5 text-orange-500" />
                  Comprovantes PIX Aguardando Aprovação ({pendingReceiptsCount})
                </CardTitle>
                <CardDescription>Comprovantes enviados por clientes que precisam de revisão</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingReceipts.slice(0, 5).map((receipt: any) => (
                    <div key={receipt.id} className="flex items-center justify-between p-3 rounded-lg border bg-background">
                      <div className="flex items-center gap-3">
                        {receipt.receipt_url && (
                          <img
                            src={receipt.receipt_url}
                            alt="Comprovante"
                            className="w-10 h-10 rounded object-cover border cursor-pointer"
                            onClick={() => window.open(receipt.receipt_url, '_blank')}
                          />
                        )}
                        <div>
                          <p className="font-medium text-sm">{receipt.users?.name || receipt.users?.email || "Cliente"}</p>
                          <p className="text-xs text-muted-foreground">
                            R$ {parseFloat(receipt.amount || 0).toFixed(2)} • {receipt.plans?.name || receipt.plans?.nome || "Plano"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(receipt.created_at).toLocaleDateString('pt-BR')}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTabChange("receipts")}
                        >
                          Revisar
                        </Button>
                      </div>
                    </div>
                  ))}
                  {pendingReceiptsCount > 5 && (
                    <Button variant="link" className="w-full" onClick={() => handleTabChange("receipts")}>
                      Ver todos os {pendingReceiptsCount} comprovantes pendentes →
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          </div>
        );
      case "users":
        return <UsersManager />;
      case "manage":
        return <ClientManager users={users} plans={plans} subscriptions={subscriptions} pendingReceipts={pendingReceipts} onGoToReceipts={() => handleTabChange("receipts")} />;
      case "plans":
        return <PlansManager plans={plans} />;
      case "payments":
        return <PaymentsManager pendingPayments={pendingPayments} pendingReceipts={pendingReceipts} onGoToReceipts={() => handleTabChange("receipts")} />;
      case "orders":
        return isOwnerAdmin ? <AdminOrdersPanel /> : (
          <Card>
            <CardHeader>
              <CardTitle>Acesso restrito</CardTitle>
              <CardDescription>Esta área de pedidos aparece somente para o owner.</CardDescription>
            </CardHeader>
          </Card>
        );
      case "receipts":
        return <PaymentReceiptsManager />;
      case "implementation":
        return (
          <SpecialistAddonsManager
            offerTypeFilter="implementation"
            showImplementationGenerator
            title="Implementação Agente"
            description="Crie ofertas avulsas de desenvolvimento e valide os comprovantes enviados pelos clientes."
            icon={Wrench}
          />
        );
      case "specialist":
        return (
          <SpecialistAddonsManager
            offerTypeFilter="specialist"
            title="Especialista Dedicado"
            description="Acompanhe comprovantes, aprovações e vigência do serviço com especialista dedicado."
            icon={Crown}
          />
        );
      case "subscriptions-history":
        return <SubscriptionsHistoryManager />;
      case "former-subscribers":
        return <FormerSubscribersManager subscriptions={subscriptions} />;
      case "whatsapp":
        return (
          <div className="space-y-6">
            <AdminWhatsappPanel />
            <AdminNotificationsPanel 
              defaultSubTab={activeSubTab} 
              onSubTabChange={handleSubTabChange}
            />
          </div>
        );
      case "status":
        return <AdminStatusPanel defaultSubTab={activeSubTab} onSubTabChange={handleSubTabChange} />;
      case "agent":
        return <AdminAgentConfig />;
      case "fila":
        return <AdminAiQueuePanel />;
      case "conversations":
        return null; // Renderizado fora do container
      case "conversation-monitor":
        return <AdminConversationMonitor />;
      case "lead-intelligence":
        return <AdminLeadIntelligence />;
      case "lead-catalog":
        return <AdminLeadCatalog />;
      case "cupons":
        return <CouponsManager />;
      case "resellers":
        return <ResellersManager />;
      case "referrals":
        return <AdminReferralsPanel />;
      case "suspended":
        return <SuspendedUsersManager />;
      case "support":
        return <AdminTicketsPanel />;
      case "tickets":
        return <AdminTicketsPanel />;
      case "reports":
        return <AdminTicketReports />;
      case "config":
        return <ConfigManager config={config} />;
      default:
        return null;
    }
  };

  // Para conversas, usar layout full-screen sem o inset
  if (activeTab === "conversations") {
    return (
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <div className="px-2 py-1.5 text-sm font-semibold flex items-center gap-2">
              <Bot className="w-4 h-4 text-muted-foreground" />
              <span>Admin Panel</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("dashboard")}
                    isActive={activeTab === "dashboard"}
                    tooltip="Dashboard"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("users")}
                    isActive={activeTab === "users"}
                    tooltip="Usuários"
                  >
                    <Users className="w-4 h-4" />
                    <span>Usuários</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("manage")}
                    isActive={activeTab === "manage"}
                    tooltip="Gerenciar Clientes"
                  >
                    <UserCog className="w-4 h-4" />
                    <span>Gerenciar Clientes</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("plans")}
                    isActive={activeTab === "plans"}
                    tooltip="Planos"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Planos</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("payments")}
                    isActive={activeTab === "payments"}
                    tooltip="Pagamentos"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>Pagamentos</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("receipts")}
                    isActive={activeTab === "receipts"}
                    tooltip="Comprovantes PIX"
                  >
                    <Receipt className="w-4 h-4" />
                    <span>Comprovantes PIX</span>
                    {pendingReceiptsCount > 0 && (
                      <Badge variant="destructive" className="ml-auto text-[10px] h-5 min-w-[20px] px-1 animate-pulse">
                        {pendingReceiptsCount}
                      </Badge>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("implementation")}
                    isActive={activeTab === "implementation"}
                    tooltip="Implementação Agente"
                  >
                    <Wrench className="w-4 h-4" />
                    <span>Implementação</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("specialist")}
                    isActive={activeTab === "specialist"}
                    tooltip="Contratações do Especialista"
                  >
                    <Crown className="w-4 h-4" />
                    <span>Especialista</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("subscriptions-history")}
                    isActive={activeTab === "subscriptions-history"}
                    tooltip="Assinaturas e Histórico de Cobranças"
                  >
                    <Crown className="w-4 h-4" />
                    <span>Assinaturas</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("former-subscribers")}
                    isActive={activeTab === "former-subscribers"}
                    tooltip="Ex-assinantes"
                  >
                    <UserMinus className="w-4 h-4" />
                    <span>Ex-assinantes</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("whatsapp")}
                    isActive={activeTab === "whatsapp"}
                    tooltip="WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("status")}
                    isActive={activeTab === "status"}
                    tooltip="Status WhatsApp"
                  >
                    <Repeat className="w-4 h-4" />
                    <span>Status WhatsApp</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("agent")}
                    isActive={activeTab === "agent"}
                    tooltip="Agente IA"
                  >
                    <Bot className="w-4 h-4" />
                    <span>Agente IA</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("fila")}
                    isActive={activeTab === "fila"}
                    tooltip="Fila"
                  >
                    <ListChecks className="w-4 h-4" />
                    <span>Fila</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("conversations")}
                    isActive={activeTab === "conversations"}
                    tooltip="Conversas"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Conversas</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("conversation-monitor")}
                    isActive={activeTab === "conversation-monitor"}
                    tooltip="Monitor SaaS"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Monitor SaaS</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("lead-intelligence")}
                    isActive={activeTab === "lead-intelligence"}
                    tooltip="Leads AgenteZap"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Leads AgenteZap</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("lead-catalog")}
                    isActive={activeTab === "lead-catalog"}
                    tooltip="Banco de Leads"
                  >
                    <Layers className="w-4 h-4" />
                    <span>Banco de Leads</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("cupons")}
                    isActive={activeTab === "cupons"}
                    tooltip="Cupons de Desconto"
                  >
                    <Tag className="w-4 h-4" />
                    <span>Cupons de desconto</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("resellers")}
                    isActive={activeTab === "resellers"}
                    tooltip="Revendas"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Revendas</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("referrals")}
                    isActive={activeTab === "referrals"}
                    tooltip="Indicações"
                  >
                    <Repeat className="w-4 h-4" />
                    <span>Indicações</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("support")}
                    isActive={activeTab === "support"}
                    tooltip="Suporte SaaS"
                  >
                    <LifeBuoy className="w-4 h-4" />
                    <span>Suporte</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("tickets")}
                    isActive={activeTab === "tickets"}
                    tooltip="Tickets de Suporte"
                  >
                    <TicketCheck className="w-4 h-4" />
                    <span>Tickets</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("reports")}
                    isActive={activeTab === "reports"}
                    tooltip="Relatorios de Tickets"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Relatorios</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/admin/sectors")}
                    isActive={location === "/admin/sectors"}
                    tooltip="Setores"
                  >
                    <Layers className="w-4 h-4" />
                    <span>Setores</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/admin/connections")}
                    isActive={location === "/admin/connections"}
                    tooltip="Conexões e Agentes"
                  >
                    <Link2 className="w-4 h-4" />
                    <span>Conexões</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/admin/media-flows")}
                    isActive={location === "/admin/media-flows"}
                    tooltip="Media Flows"
                  >
                    <FileImage className="w-4 h-4" />
                    <span>Media Flows</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/admin/status")}
                    isActive={location === "/admin/status"}
                    tooltip="Status WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Status WhatsApp</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("suspended")}
                    isActive={activeTab === "suspended"}
                    tooltip="Usuários Suspensos"
                    className={activeTab === "suspended" ? "" : "text-red-600 hover:text-red-700 hover:bg-red-50"}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>Suspensos</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("config")}
                    isActive={activeTab === "config"}
                    tooltip="Configurações"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Configurações</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Sair" onClick={handleLogout} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                  <LogOut className="w-4 h-4" />
                  <span>Sair</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <div className="p-2 text-xs text-muted-foreground text-center">
              Admin Panel v1.0
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="h-screen overflow-hidden">
          <div className="flex h-full overflow-hidden">
            <AdminConversations />
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  // Layout principal para todas as outras tabs
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="px-2 py-1.5 text-sm font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4 text-muted-foreground" />
            <span>Admin Panel</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("dashboard")}
                  isActive={activeTab === "dashboard"}
                  tooltip="Dashboard"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("users")}
                  isActive={activeTab === "users"}
                  tooltip="Usuários"
                >
                  <Users className="w-4 h-4" />
                  <span>Usuários</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("manage")}
                  isActive={activeTab === "manage"}
                  tooltip="Gerenciar Clientes"
                >
                  <UserCog className="w-4 h-4" />
                  <span>Gerenciar Clientes</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("plans")}
                  isActive={activeTab === "plans"}
                  tooltip="Planos"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Planos</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("payments")}
                  isActive={activeTab === "payments"}
                  tooltip="Pagamentos"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Pagamentos</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isOwnerAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("orders")}
                    isActive={activeTab === "orders"}
                    tooltip="Pedidos"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span>Pedidos</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("receipts")}
                  isActive={activeTab === "receipts"}
                  tooltip="Comprovantes PIX"
                >
                  <Receipt className="w-4 h-4" />
                  <span>Comprovantes PIX</span>
                  {pendingReceiptsCount > 0 && (
                    <Badge variant="destructive" className="ml-auto text-[10px] h-5 min-w-[20px] px-1 animate-pulse">
                      {pendingReceiptsCount}
                    </Badge>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("implementation")}
                  isActive={activeTab === "implementation"}
                  tooltip="Implementação Agente"
                >
                  <Wrench className="w-4 h-4" />
                  <span>Implementação</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("specialist")}
                  isActive={activeTab === "specialist"}
                  tooltip="Contratações do Especialista"
                >
                  <Crown className="w-4 h-4" />
                  <span>Especialista</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("subscriptions-history")}
                  isActive={activeTab === "subscriptions-history"}
                  tooltip="Assinaturas e Histórico de Cobranças"
                >
                  <Crown className="w-4 h-4" />
                  <span>Assinaturas</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("former-subscribers")}
                  isActive={activeTab === "former-subscribers"}
                  tooltip="Ex-assinantes"
                >
                  <UserMinus className="w-4 h-4" />
                  <span>Ex-assinantes</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("whatsapp")}
                  isActive={activeTab === "whatsapp"}
                  tooltip="WhatsApp"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>WhatsApp</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("status")}
                  isActive={activeTab === "status"}
                  tooltip="Status WhatsApp"
                >
                  <Repeat className="w-4 h-4" />
                  <span>Status WhatsApp</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("agent")}
                  isActive={activeTab === "agent"}
                  tooltip="Agente IA"
                >
                  <Bot className="w-4 h-4" />
                  <span>Agente IA</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("fila")}
                  isActive={activeTab === "fila"}
                  tooltip="Fila"
                >
                  <ListChecks className="w-4 h-4" />
                  <span>Fila</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("conversations")}
                  isActive={activeTab === "conversations"}
                  tooltip="Conversas"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Conversas</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("conversation-monitor")}
                  isActive={activeTab === "conversation-monitor"}
                  tooltip="Monitor SaaS"
                >
                  <Eye className="w-4 h-4" />
                  <span>Monitor SaaS</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("cupons")}
                  isActive={activeTab === "cupons"}
                  tooltip="Cupons de Desconto"
                >
                  <Tag className="w-4 h-4" />
                  <span>Cupons de desconto</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("resellers")}
                  isActive={activeTab === "resellers"}
                  tooltip="Revendas"
                >
                  <Building2 className="w-4 h-4" />
                  <span>Revendas</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("referrals")}
                  isActive={activeTab === "referrals"}
                  tooltip="Indicações"
                >
                  <Repeat className="w-4 h-4" />
                  <span>Indicações</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("support")}
                  isActive={activeTab === "support"}
                  tooltip="Suporte SaaS"
                >
                  <LifeBuoy className="w-4 h-4" />
                  <span>Suporte</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("tickets")}
                  isActive={activeTab === "tickets"}
                  tooltip="Tickets de Suporte"
                >
                  <TicketCheck className="w-4 h-4" />
                  <span>Tickets</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("lead-intelligence")}
                  isActive={activeTab === "lead-intelligence"}
                  tooltip="Leads AgenteZap"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Leads AgenteZap</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("lead-catalog")}
                  isActive={activeTab === "lead-catalog"}
                  tooltip="Banco de Leads"
                >
                  <Layers className="w-4 h-4" />
                  <span>Banco de Leads</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("reports")}
                  isActive={activeTab === "reports"}
                  tooltip="Relatorios de Tickets"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Relatorios</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setLocation("/admin/sectors")}
                  isActive={location === "/admin/sectors"}
                  tooltip="Setores"
                >
                  <Layers className="w-4 h-4" />
                  <span>Setores</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("suspended")}
                  isActive={activeTab === "suspended"}
                  tooltip="Usuários Suspensos"
                  className={activeTab === "suspended" ? "" : "text-red-600 hover:text-red-700 hover:bg-red-50"}
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Suspensos</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("config")}
                  isActive={activeTab === "config"}
                  tooltip="Configurações"
                >
                  <Settings className="w-4 h-4" />
                  <span>Configurações</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Sair" onClick={handleLogout} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                <LogOut className="w-4 h-4" />
                <span>Sair</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="p-2 text-xs text-muted-foreground text-center">
            Admin Panel v1.0
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 min-w-0">
          <div className="w-full min-w-0 space-y-6">
            {renderContent()}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

// Users Manager Component with delete functionality
interface UserWithStatus extends User {
  isConnected?: boolean;
  connectedCount?: number;
  totalConnections?: number;
  agentMessagesCount?: number;
  messageLimit?: number;
  messagesRemaining?: number;
  isLimitReached?: boolean;
  hasActiveSubscription?: boolean;
  registeredPhones?: string[];
  connectionPhones?: string[];
  connectedPhones?: string[];
  phoneNumbers?: string[];
  activePlanName?: string;
}

interface PaginatedUsersResponse {
  items: UserWithStatus[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

function UsersManager() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const USERS_PAGE_SIZE = 10;
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editingAgentUser, setEditingAgentUser] = useState<User | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [reconnectingUserId, setReconnectingUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [viewPasswordUser, setViewPasswordUser] = useState<User | null>(null);
  
  // Bulk selection state
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const normalizedSearchTerm = appliedSearchTerm.trim();
  const typedSearchTerm = searchTerm.trim();
  const hasPendingSearch = typedSearchTerm !== normalizedSearchTerm;

  const {
    data: paginatedUsers,
    isLoading: isUsersLoading,
    isFetching: isUsersFetching,
  } = useQuery<PaginatedUsersResponse>({
    queryKey: ["admin-users-paginated", currentPage, USERS_PAGE_SIZE, normalizedSearchTerm, sortColumn || "", sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(USERS_PAGE_SIZE),
        sortDirection,
      });

      if (normalizedSearchTerm) {
        params.set("search", normalizedSearchTerm);
      }

      if (sortColumn) {
        params.set("sortColumn", sortColumn);
      }

      const res = await apiRequest("GET", `/api/admin/users?${params.toString()}`);
      return res.json();
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    staleTime: 45000,
  });

  const sortedUsers = paginatedUsers?.items || [];
  const totalUsers = paginatedUsers?.pagination.totalItems || 0;
  const totalPages = paginatedUsers?.pagination.totalPages || 1;
  const pageStart = totalUsers === 0 ? 0 : (currentPage - 1) * USERS_PAGE_SIZE + 1;
  const pageEnd = totalUsers === 0 ? 0 : Math.min(currentPage * USERS_PAGE_SIZE, totalUsers);

  useEffect(() => {
    setCurrentPage(1);
  }, [normalizedSearchTerm, sortColumn, sortDirection]);

  useEffect(() => {
    if (paginatedUsers && currentPage > paginatedUsers.pagination.totalPages) {
      setCurrentPage(paginatedUsers.pagination.totalPages);
    }
  }, [currentPage, paginatedUsers?.pagination.totalPages]);

  const visiblePageNumbers = useMemo(() => {
    if (totalUsers === 0) return [];
    const windowSize = 5;
    let start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [currentPage, totalPages, totalUsers]);

  const applySearch = () => {
    setAppliedSearchTerm(typedSearchTerm);
    setCurrentPage(1);
    setSelectedUserIds(new Set());
  };

  const clearSearch = () => {
    setSearchTerm("");
    setAppliedSearchTerm("");
    setCurrentPage(1);
    setSelectedUserIds(new Set());
  };

  const PaginationControls = () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCurrentPage(1)}
        disabled={currentPage <= 1 || isUsersLoading}
      >
        Primeira
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
        disabled={currentPage <= 1 || isUsersLoading}
      >
        Anterior
      </Button>
      <div className="hidden items-center gap-1 sm:flex">
        {visiblePageNumbers.map((pageNumber) => (
          <Button
            key={pageNumber}
            variant={pageNumber === currentPage ? "default" : "outline"}
            size="sm"
            className="h-9 min-w-9 px-3"
            onClick={() => setCurrentPage(pageNumber)}
            disabled={pageNumber === currentPage || isUsersLoading}
          >
            {pageNumber}
          </Button>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
        disabled={currentPage >= totalPages || isUsersLoading || totalUsers === 0}
      >
        Próxima
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCurrentPage(totalPages)}
        disabled={currentPage >= totalPages || isUsersLoading || totalUsers === 0}
      >
        Última
      </Button>
    </div>
  );

  const invalidateUserQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    queryClient.invalidateQueries({ queryKey: ["admin-users-paginated"] });
  };

  // Helper to check if user can be deleted
  const canDeleteUser = (user: UserWithStatus) => {
    // Admins/owners remain protected from destructive deletion in the panel.
    return user.role !== "admin" && user.role !== "owner";
  };

  // Handle column sorting
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Sort icon component
  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="h-4 w-4 ml-1" /> 
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const normalizePhoneList = (values: Array<string | null | undefined>) => {
    return Array.from(
      new Set(
        values
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );
  };

  const getRegisteredPhones = (user: UserWithStatus) => {
    return normalizePhoneList(
      user.registeredPhones?.length ? user.registeredPhones : [user.whatsappNumber, user.phone]
    );
  };

  const getConnectionPhones = (user: UserWithStatus) => {
    return normalizePhoneList(user.connectionPhones || []);
  };

  const getConnectedPhones = (user: UserWithStatus) => {
    return normalizePhoneList(user.connectedPhones || []);
  };

  const renderPhoneSummary = (user: UserWithStatus) => {
    const registeredPhones = getRegisteredPhones(user);
    const connectedPhones = getConnectedPhones(user);
    const connectionPhones = getConnectionPhones(user);

    // Show distinct phones that aren't already in connectedPhones
    const offlinePhones = connectionPhones.filter(p => !connectedPhones.includes(p));

    return (
      <div className="space-y-1 text-xs leading-relaxed">
        {registeredPhones.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            <span className="text-muted-foreground shrink-0">Cad:</span>
            <span className="font-medium">{registeredPhones.join(" · ")}</span>
          </div>
        )}
        {connectedPhones.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            <span className="text-emerald-600 dark:text-emerald-400 shrink-0">●</span>
            <span className="font-medium text-emerald-700 dark:text-emerald-400">{connectedPhones.join(" · ")}</span>
          </div>
        )}
        {offlinePhones.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            <span className="text-muted-foreground shrink-0">○</span>
            <span className="text-muted-foreground">{offlinePhones.join(" · ")}</span>
          </div>
        )}
        {registeredPhones.length === 0 && connectedPhones.length === 0 && connectionPhones.length === 0 && (
          <span className="text-muted-foreground">-</span>
        )}
      </div>
    );
  };

  const renderConnectionSummary = (user: UserWithStatus) => {
    const totalConnections = user.totalConnections || 0;
    const connectedCount = user.connectedCount || 0;

    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={user.isConnected ? "default" : "destructive"} className={cn("text-xs", user.isConnected ? "bg-green-500 hover:bg-green-600" : "")}>
            {user.isConnected ? "Online" : totalConnections > 0 ? "Offline" : "Sem conexão"}
          </Badge>
          {!user.isConnected && totalConnections > 0 && (
            <>
              <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-5 w-5" 
                  title="Tentar Reconectar"
                  onClick={() => reconnectUserMutation.mutate(user.id)}
                  disabled={reconnectingUserId === user.id}
              >
                  <RefreshCw className={`h-3 w-3 ${reconnectingUserId === user.id ? 'animate-spin' : ''}`} />
              </Button>
              <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-5 w-5 text-orange-500 hover:text-orange-600" 
                  title="Resetar Sessão (força novo QR Code)"
                  onClick={() => {
                    if (confirm("Isso vai apagar a sessão do usuário e ele precisará escanear um novo QR Code. Continuar?")) {
                      resetUserMutation.mutate(user.id);
                    }
                  }}
              >
                  <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {totalConnections > 0
            ? `${connectedCount}/${totalConnections} online`
            : "Nenhuma conexão"}
        </p>
      </div>
    );
  };

  const renderUsageSummary = (user: UserWithStatus) => {
    if (user.agentMessagesCount === undefined) {
      return <span className="text-muted-foreground text-xs">-</span>;
    }

    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {user.hasActiveSubscription ? (
            <Badge variant="default" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
              <MessageCircle className="w-3 h-3 mr-1" />
              Ilimitado
            </Badge>
          ) : (
            <div className="flex items-center gap-1.5">
              <Badge 
                variant="outline"
                className={cn(
                  "font-medium",
                  user.isLimitReached 
                    ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800" 
                    : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300"
                )}
              >
                {user.agentMessagesCount}/{user.messageLimit}
              </Badge>
              <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all",
                    user.isLimitReached ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${Math.min(100, ((user.agentMessagesCount || 0) / (user.messageLimit || 25)) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
        {!user.hasActiveSubscription && user.isLimitReached && (
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Limite atingido</span>
        )}
        {!user.hasActiveSubscription && !user.isLimitReached && user.messagesRemaining !== undefined && user.messagesRemaining <= 5 && (
          <span className="text-xs text-slate-500">{user.messagesRemaining} restantes</span>
        )}
      </div>
    );
  };

  const renderUserActions = (user: UserWithStatus, isDeletable: boolean, compact = false) => {
    const isAdmin = user.role === "admin" || user.role === "owner";

    return (
      <div className="flex items-center justify-end gap-1">
        <Button 
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          onClick={() => {
            if (confirm(`Você será logado como "${user.name || user.email}". Deseja continuar?`)) {
              impersonateMutation.mutate(user.id);
            }
          }}
          disabled={impersonateMutation.isPending}
          title="Acessar conta do cliente"
        >
          <LogIn className="h-3.5 w-3.5" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => handleChat(user.phone)}
          title="Conversar"
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setEditingAgentUser(user)}
          title="Configurar Agente"
        >
          <Bot className="h-3.5 w-3.5" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
          onClick={() => handleResetAgentCreatorState(user)}
          disabled={resetAgentCreatorStateMutation.isPending}
          title="Reiniciar funil do lead"
        >
          <Repeat className="h-3.5 w-3.5" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => handleEditEmail(user)}
          title="Editar Email"
        >
          <Edit className="h-3.5 w-3.5" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setViewPasswordUser(user)}
          title="Ver Acesso"
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => handleSendCredentials(user.id)}
          title="Gerar Nova Senha"
        >
          <Key className="h-3.5 w-3.5" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
          onClick={() => handleActivate(user.id)}
          title="Ativar Agente"
        >
          <Play className="h-3.5 w-3.5" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
          onClick={() => handleOpenSafeModeDialog(user)}
          title="Modo Seguro"
        >
          <ShieldAlert className="h-3.5 w-3.5" />
        </Button>

        {isDeletable && (
          <Dialog open={confirmDeleteUser?.id === user.id} onOpenChange={(open) => !open && setConfirmDeleteUser(null)}>
            <DialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => setConfirmDeleteUser(user)}
                title="Excluir usuário"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <Trash2 className="h-5 w-5" />
                  Confirmar Exclusão
                </DialogTitle>
                <DialogDescription className="space-y-3">
                  <p>
                    Você está prestes a excluir permanentemente o usuário:
                  </p>
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="font-semibold">{confirmDeleteUser?.email}</p>
                    {confirmDeleteUser?.name && <p className="text-sm">{confirmDeleteUser.name}</p>}
                  </div>
                  <p className="text-red-600 font-medium">
                    ⚠️ Esta ação irá remover:
                  </p>
                  <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                    <li>Conexão WhatsApp do usuário</li>
                    <li>Todas as conversas e mensagens</li>
                    <li>Configurações do agente IA</li>
                    <li>Assinatura e pagamentos</li>
                    <li>Todos os dados relacionados</li>
                  </ul>
                  <p className="text-red-600 text-sm font-medium">
                    Esta ação não pode ser desfeita!
                  </p>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setConfirmDeleteUser(null)}
                >
                  Cancelar
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => confirmDeleteUser && deleteUserMutation.mutate(confirmDeleteUser.id)}
                  disabled={deleteUserMutation.isPending}
                >
                  {deleteUserMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Excluir Permanentemente
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  };

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete user");
      return res.json();
    },
    onSuccess: () => {
      invalidateUserQueries();
      setConfirmDeleteUser(null);
      toast({ 
        title: "✅ Usuário excluído",
        description: "O usuário e todos os dados relacionados foram removidos."
      });
    },
    onError: () => {
      toast({ 
        title: "Erro ao excluir usuário", 
        description: "Não foi possível excluir o usuário. Tente novamente.",
        variant: "destructive" 
      });
    },
  });

  // Mutation: Bulk Delete Users
  const bulkDeleteMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      const res = await apiRequest("POST", "/api/admin/users/bulk-delete", { userIds });
      if (!res.ok) throw new Error("Failed to delete users");
      return res.json();
    },
    onSuccess: (data) => {
      invalidateUserQueries();
      setSelectedUserIds(new Set());
      setShowBulkDeleteConfirm(false);
      setBulkDeleteConfirmText("");
      const message = data.skippedCount > 0
        ? `${data.deletedCount} excluído(s), ${data.skippedCount} ignorado(s) (admins/owners protegidos)`
        : `${data.deletedCount} usuário(s) removido(s) com sucesso`;

      toast({ 
        title: data.skippedCount > 0 ? "⚠️ Exclusão parcial" : "✅ Usuários excluídos",
        description: message
      });
    },
    onError: () => {
      toast({ 
        title: "Erro ao excluir usuários", 
        description: "Não foi possível excluir os usuários selecionados.",
        variant: "destructive" 
      });
    },
  });

  // Mutation: Admin Impersonate User
  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/impersonate`);
      if (!res.ok) throw new Error("Failed to impersonate user");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "🔓 Acesso concedido",
        description: "Você será redirecionado para o painel do cliente."
      });
      // Redirecionar para o dashboard do cliente
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    },
    onError: (error) => {
      toast({ 
        title: "Erro ao acessar conta", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Bulk selection helpers
  const handleSelectAll = () => {
    if (sortedUsers) {
      // Filtrar apenas usuários que podem ser deletados
      const deletableUsers = sortedUsers.filter(canDeleteUser);
      if (selectedUserIds.size === deletableUsers.length && deletableUsers.length > 0) {
        setSelectedUserIds(new Set());
      } else {
        setSelectedUserIds(new Set(deletableUsers.map(u => u.id)));
      }
    }
  };

  const handleSelectUser = (userId: string) => {
    const user = sortedUsers?.find(u => u.id === userId);
    if (!user || !canDeleteUser(user)) {
      toast({
        title: "Não é possível selecionar",
        description: user?.role === "admin" || user?.role === "owner" 
          ? "Administradores não podem ser excluídos"
          : "Usuários com plano ativo não podem ser excluídos",
        variant: "destructive"
      });
      return;
    }
    
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  const handleBulkDelete = () => {
    if (bulkDeleteConfirmText === "DELETAR") {
      bulkDeleteMutation.mutate(Array.from(selectedUserIds));
    }
  };

  // Mutation: Update Email
  const updateEmailMutation = useMutation({
    mutationFn: async ({ userId, email }: { userId: string; email: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}`, { email });
      return res.json();
    },
    onSuccess: () => {
      invalidateUserQueries();
      toast({ title: "Email atualizado com sucesso!" });
      setIsEmailDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: "Erro ao atualizar email", description: error.message, variant: "destructive" });
    },
  });

  // Mutation: Send Credentials
  const sendCredentialsMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/send-credentials`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Senha Gerada!", description: "A senha foi gerada e atualizada com sucesso." });
      if (data.password) {
        setGeneratedPassword(data.password);
      }
    },
    onError: (error) => {
      toast({ title: "Erro ao gerar senha", description: error.message, variant: "destructive" });
    },
  });

  // Mutation: reset only the Rodrigo lead-creator state for retesting.
  const resetAgentCreatorStateMutation = useMutation({
    mutationFn: async ({ userId, phoneNumber }: { userId: string; phoneNumber?: string }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/reset-agent-creator-state`, {
        phoneNumber,
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.message || "Nao foi possivel reiniciar o funil do lead.");
      }
      return data;
    },
    onSuccess: (data) => {
      invalidateUserQueries();
      const phones = Array.isArray(data?.phones) && data.phones.length ? ` (${data.phones.join(", ")})` : "";
      toast({
        title: "Funil reiniciado",
        description: `Estado do lead limpo${phones}. Conta, assinatura, conversas e conexoes foram preservadas.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao reiniciar funil",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Activate Agent
  const activateAgentMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/activate`);
      return res.json();
    },
    onSuccess: () => {
      invalidateUserQueries();
      toast({ title: "Agente ativado!", description: "O status foi atualizado para ativo." });
    },
  });

  // Mutation: Reconnect All
  const reconnectAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/connections/reconnect-all");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Reconexão Iniciada", 
        description: data.message || "Processo de reconexão em massa iniciado." 
      });
    },
    onError: (error) => {
      toast({ 
        title: "Erro na reconexão", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Mutation: Reconnect Single User
  const reconnectUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      setReconnectingUserId(userId);
      const res = await apiRequest("POST", `/api/admin/connections/reconnect/${userId}`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ 
          title: "✅ Reconexão Iniciada", 
          description: data.message 
        });
      } else {
        toast({ 
          title: "⚠️ Problema na Reconexão", 
          description: data.message || "A reconexão pode precisar de um novo QR Code.",
          variant: "destructive" 
        });
      }
      // Aguardar um pouco e atualizar a lista para ver se mudou o status
      setTimeout(() => {
        invalidateUserQueries();
        setReconnectingUserId(null);
      }, 3000);
    },
    onError: (error) => {
      setReconnectingUserId(null);
      toast({ 
        title: "❌ Erro", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Mutation: Reset User Session (force new QR code)
  const resetUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/connections/reset/${userId}`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ 
          title: "🔄 Sessão Resetada", 
          description: data.message 
        });
      } else {
        toast({ 
          title: "⚠️ Erro ao Resetar", 
          description: data.message,
          variant: "destructive" 
        });
      }
      invalidateUserQueries();
    },
    onError: (error) => {
      toast({ 
        title: "❌ Erro", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // 🛡️ SAFE MODE: Estado e Mutation para modo seguro anti-bloqueio
  const [safeModeDialogUser, setSafeModeDialogUser] = useState<User | null>(null);
  const [safeModeStatus, setSafeModeStatus] = useState<{
    enabled: boolean;
    activatedAt: string | null;
    lastCleanupAt: string | null;
    loading: boolean;
  }>({ enabled: false, activatedAt: null, lastCleanupAt: null, loading: false });

  // Query: Buscar status do Safe Mode
  const fetchSafeModeStatus = async (userId: string) => {
    setSafeModeStatus(prev => ({ ...prev, loading: true }));
    try {
      const res = await apiRequest("GET", `/api/admin/users/${userId}/safe-mode`);
      const data = await res.json();
      if (data.success) {
        setSafeModeStatus({
          enabled: data.safeModeEnabled,
          activatedAt: data.safeModeActivatedAt,
          lastCleanupAt: data.safeModeLastCleanupAt,
          loading: false,
        });
      }
    } catch (error) {
      setSafeModeStatus(prev => ({ ...prev, loading: false }));
    }
  };

  // Mutation: Toggle Safe Mode
  const safeModeToggleMutation = useMutation({
    mutationFn: async ({ userId, enabled }: { userId: string; enabled: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/safe-mode`, { enabled });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ 
          title: data.safeModeEnabled ? "🛡️ Modo Seguro Ativado" : "⚠️ Modo Seguro Desativado",
          description: data.message 
        });
        setSafeModeStatus({
          enabled: data.safeModeEnabled,
          activatedAt: data.safeModeActivatedAt,
          lastCleanupAt: data.safeModeLastCleanupAt,
          loading: false,
        });
      } else {
        toast({ 
          title: "❌ Erro", 
          description: data.message,
          variant: "destructive" 
        });
      }
    },
    onError: (error) => {
      toast({ 
        title: "❌ Erro", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Abrir diálogo de Safe Mode
  const handleOpenSafeModeDialog = (user: User) => {
    setSafeModeDialogUser(user);
    fetchSafeModeStatus(user.id);
  };

  const handleEditEmail = (user: User) => {
    setSelectedUser(user);
    setNewEmail(user.email || "");
    setIsEmailDialogOpen(true);
  };

  const handleSendCredentials = (userId: string) => {
    if (confirm("Tem certeza que deseja gerar uma nova senha para este usuário? A senha antiga deixará de funcionar.")) {
      sendCredentialsMutation.mutate(userId);
    }
  };

  const handleActivate = (userId: string) => {
    activateAgentMutation.mutate(userId);
  };

  const handleResetAgentCreatorState = (user: UserWithStatus) => {
    const phoneNumber =
      getRegisteredPhones(user)[0] ||
      getConnectionPhones(user)[0] ||
      user.phone ||
      user.whatsappNumber ||
      "";
    const label = user.name || user.email || phoneNumber || "este usuario";
    if (
      confirm(
        `Reiniciar o funil de criacao do agente para "${label}"? Isso limpa so o estado do atendimento/teste do Rodrigo. Nao apaga conta, assinatura, conversas nem conexoes.`,
      )
    ) {
      resetAgentCreatorStateMutation.mutate({
        userId: user.id,
        phoneNumber,
      });
    }
  };

  const handleChat = (phone: string) => {
    window.location.hash = '#conversations';
  };

  return (
    <Card data-testid="card-users-list" className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Usuários Cadastrados
            </CardTitle>
            <CardDescription>
              Gerencie os agentes, pagamentos e acessos.
            </CardDescription>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Exibindo {pageStart}-{pageEnd} de {totalUsers}
              </span>
              <span>•</span>
              <span>10 por página</span>
              <span>•</span>
              <span>Mais recentes primeiro</span>
              <span>•</span>
              <span>Role para o lado para acessar todas as ferramentas</span>
              {isUsersFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedUserIds.size > 0 && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={() => setShowBulkDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir Selecionados ({selectedUserIds.size})
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                if (confirm("Isso tentará reconectar TODOS os usuários que possuem conexão configurada. Continuar?")) {
                  reconnectAllMutation.mutate();
                }
              }}
              disabled={reconnectAllMutation.isPending}
            >
              {reconnectAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Reconectar Todos
            </Button>
          </div>
        </div>
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            applySearch();
          }}
        >
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-4"
            />
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {normalizedSearchTerm
                ? `Busca aplicada: "${normalizedSearchTerm}"`
                : "Sem busca aplicada. Exibindo os 10 usuários mais novos."}
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {normalizedSearchTerm && (
                <Button type="button" variant="ghost" size="sm" onClick={clearSearch}>
                  Limpar
                </Button>
              )}
              <Button type="submit" size="sm" disabled={!hasPendingSearch && !!normalizedSearchTerm}>
                <Search className="mr-2 h-4 w-4" />
                Buscar
              </Button>
            </div>
          </div>
        </form>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Página {totalUsers === 0 ? 0 : currentPage} de {totalUsers === 0 ? 0 : totalPages}
          </div>
          <PaginationControls />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="min-w-[1180px]" containerClassName="max-h-[calc(100vh-280px)] overflow-x-auto overflow-y-auto">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-[36px] px-2">
                <Checkbox
                  checked={sortedUsers.length > 0 && sortedUsers.filter(canDeleteUser).length > 0 && sortedUsers.filter(canDeleteUser).every((user) => selectedUserIds.has(user.id))}
                  onCheckedChange={handleSelectAll}
                  aria-label="Selecionar todos os deletáveis"
                />
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none min-w-[130px]"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center">
                  Nome
                  <SortIcon column="name" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none min-w-[170px]"
                onClick={() => handleSort("email")}
              >
                <div className="flex items-center">
                  Email
                  <SortIcon column="email" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none min-w-[180px]"
                onClick={() => handleSort("phone")}
              >
                <div className="flex items-center">
                  Telefones
                  <SortIcon column="phone" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none min-w-[140px]"
                onClick={() => handleSort("connection")}
              >
                <div className="flex items-center">
                  Conexão
                  <SortIcon column="connection" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none min-w-[80px]"
                onClick={() => handleSort("type")}
              >
                <div className="flex items-center">
                  Tipo
                  <SortIcon column="type" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none min-w-[120px]"
                onClick={() => handleSort("plan")}
              >
                <div className="flex items-center">
                  Plano
                  <SortIcon column="plan" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none min-w-[100px]"
                onClick={() => handleSort("messages")}
              >
                <div className="flex items-center">
                  Msgs
                  <SortIcon column="messages" />
                </div>
              </TableHead>
              <TableHead className="min-w-[280px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isUsersLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando usuários...
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!isUsersLoading && sortedUsers.map((user: UserWithStatus) => {
              const isDeletable = canDeleteUser(user);
              const isAdmin = user.role === "admin" || user.role === "owner";
              
              return (
              <TableRow key={user.id} data-testid={`row-user-${user.id}`} className={selectedUserIds.has(user.id) ? "bg-muted/50" : ""}>
                <TableCell className="px-2">
                  <Checkbox
                    checked={selectedUserIds.has(user.id)}
                    onCheckedChange={() => handleSelectUser(user.id)}
                    disabled={!isDeletable}
                    aria-label={`Selecionar ${user.name || user.email}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{user.name || "-"}</TableCell>
                <TableCell data-testid={`text-email-${user.id}`} className="text-sm">{user.email}</TableCell>
                <TableCell className="align-top">{renderPhoneSummary(user)}</TableCell>
                <TableCell>
                  {renderConnectionSummary(user)}
                </TableCell>
                <TableCell>
                  {isAdmin ? (
                    <Badge variant="default" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 text-xs">
                      {user.role === "owner" ? "Dono" : "Admin"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Cliente
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {user.hasActiveSubscription && user.activePlanName ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 whitespace-nowrap text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {user.activePlanName}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground text-xs">
                      Sem plano
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {renderUsageSummary(user)}
                </TableCell>
                <TableCell className="text-right">
                  {renderUserActions(user, isDeletable)}
                </TableCell>
              </TableRow>
            );
            })}
            {!isUsersLoading && sortedUsers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-12 w-12 opacity-50" />
                    <p>Nenhum usuário encontrado</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Página {totalUsers === 0 ? 0 : currentPage} de {totalUsers === 0 ? 0 : totalPages}
          </div>
          <div className="flex flex-col gap-2 self-end sm:self-auto sm:flex-row sm:items-center">
            <div className="min-w-[130px] text-right text-sm font-medium sm:text-center">
              {pageStart}-{pageEnd}
            </div>
            <PaginationControls />
          </div>
        </div>
      </CardContent>

      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Email do Cliente</DialogTitle>
            <DialogDescription>
              Altere o email para que o cliente possa receber as credenciais corretamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email
              </Label>
              <Input
                id="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEmailDialogOpen(false)}>Cancelar</Button>
            <Button 
              onClick={() => selectedUser && updateEmailMutation.mutate({ userId: selectedUser.id, email: newEmail })}
              disabled={updateEmailMutation.isPending}
            >
              {updateEmailMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewPasswordUser !== null} onOpenChange={(open) => !open && setViewPasswordUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-purple-600" />
              Acesso à Conta do Cliente
            </DialogTitle>
            <DialogDescription>
              Use as credenciais abaixo para acessar a conta
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Email de Login</Label>
                  <div className="flex items-center gap-2">
                    <p className="font-medium font-mono text-sm">{viewPasswordUser?.email}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => {
                        navigator.clipboard.writeText(viewPasswordUser?.email || "");
                        toast({ title: "Copiado!", description: "Email copiado." });
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {viewPasswordUser?.name && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Nome</Label>
                    <p className="font-medium">{viewPasswordUser.name}</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-green-600" />
                  <p className="font-semibold text-green-900">Senha Mestra do Admin</p>
                </div>
                <div className="flex items-center gap-2 bg-white p-2 rounded border">
                  <code className="font-mono text-sm flex-1 select-all">AgentZap@Master2025!</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      navigator.clipboard.writeText("AgentZap@Master2025!");
                      toast({ title: "Copiado!", description: "Senha mestra copiada." });
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copiar
                  </Button>
                </div>
                <p className="text-xs text-green-800">
                  Esta senha permite logar em <strong>qualquer conta</strong> da plataforma.
                  Use o email do cliente acima + esta senha mestra.
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <LogIn className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-900">
                  Ou use o botão <strong>"Acessar Conta"</strong> na tabela para login direto
                </span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setViewPasswordUser(null)}>
              Fechar
            </Button>
            <Button 
              onClick={() => {
                // Copiar email e senha juntos
                const credentials = `Email: ${viewPasswordUser?.email}\nSenha: AgentZap@Master2025!`;
                navigator.clipboard.writeText(credentials);
                toast({ title: "Copiado!", description: "Credenciais copiadas para a área de transferência." });
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copiar Tudo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserAgentConfigDialog 
        userId={editingAgentUser?.id || null}
        open={!!editingAgentUser}
        onOpenChange={(open) => !open && setEditingAgentUser(null)}
        userName={editingAgentUser?.name || editingAgentUser?.email || ""}
      />

      <Dialog open={!!generatedPassword} onOpenChange={(open) => !open && setGeneratedPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Senha Gerada</DialogTitle>
            <DialogDescription>
              Copie a senha abaixo. Ela não será mostrada novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 py-4">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="generated-password" className="sr-only">
                Senha
              </Label>
              <Input
                id="generated-password"
                value={generatedPassword || ""}
                readOnly
              />
            </div>
            <Button type="submit" size="sm" className="px-3" onClick={() => {
              navigator.clipboard.writeText(generatedPassword || "");
              toast({ title: "Copiado!", description: "Senha copiada para a área de transferência." });
            }}>
              <span className="sr-only">Copiar</span>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setGeneratedPassword(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Excluir {selectedUserIds.size} Usuários
            </DialogTitle>
            <DialogDescription className="space-y-3">
              <p>
                Você está prestes a excluir permanentemente <strong>{selectedUserIds.size} usuários</strong>.
              </p>
              <p className="text-red-600 font-medium">
                ⚠️ Esta ação irá remover para CADA usuário:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                <li>Conexão WhatsApp do usuário</li>
                <li>Todas as conversas e mensagens</li>
                <li>Configurações do agente IA</li>
                <li>Assinatura e pagamentos</li>
                <li>Todos os dados relacionados</li>
              </ul>
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">
                  Para confirmar, digite: <span className="font-mono font-bold text-red-600">DELETAR</span>
                </p>
                <Input
                  value={bulkDeleteConfirmText}
                  onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
                  placeholder="Digite DELETAR para confirmar"
                  className="font-mono"
                />
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowBulkDeleteConfirm(false);
                setBulkDeleteConfirmText("");
              }}
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleteConfirmText !== "DELETAR" || bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Excluir {selectedUserIds.size} Usuários
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 🛡️ SAFE MODE: Dialog para modo seguro anti-bloqueio */}
      <Dialog open={safeModeDialogUser !== null} onOpenChange={(open) => !open && setSafeModeDialogUser(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Modo Seguro Anti-Bloqueio
            </DialogTitle>
            <DialogDescription>
              Configure o modo seguro para <strong>{safeModeDialogUser?.name || safeModeDialogUser?.email}</strong>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Explicação do recurso */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    O que este modo faz?
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-amber-700 dark:text-amber-300">
                    <li>Quando o cliente reconectar via QR Code, o sistema automaticamente:</li>
                    <li className="ml-4">✓ Zera a fila de mensagens pendentes</li>
                    <li className="ml-4">✓ Desativa todos os follow-ups programados</li>
                    <li className="ml-4">✓ Começa do zero para evitar novo bloqueio</li>
                  </ul>
                  <p className="text-amber-600 dark:text-amber-400 italic">
                    Use quando o cliente tomou bloqueio e precisa reconectar com segurança.
                  </p>
                </div>
              </div>
            </div>

            {/* Status atual */}
            {safeModeStatus.loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    {safeModeStatus.enabled ? (
                      <ShieldCheck className="h-5 w-5 text-green-500" />
                    ) : (
                      <ShieldOff className="h-5 w-5 text-slate-400" />
                    )}
                    <span className="font-medium">
                      Modo Seguro: {safeModeStatus.enabled ? "ATIVADO" : "Desativado"}
                    </span>
                  </div>
                  <Switch
                    checked={safeModeStatus.enabled}
                    onCheckedChange={(checked) => {
                      if (safeModeDialogUser) {
                        safeModeToggleMutation.mutate({
                          userId: safeModeDialogUser.id,
                          enabled: checked,
                        });
                      }
                    }}
                    disabled={safeModeToggleMutation.isPending}
                  />
                </div>

                {/* Informações de ativação */}
                {safeModeStatus.enabled && safeModeStatus.activatedAt && (
                  <div className="text-sm text-muted-foreground pl-2">
                    <p>
                      ⏰ Ativado em: {new Date(safeModeStatus.activatedAt).toLocaleString('pt-BR')}
                    </p>
                    {safeModeStatus.lastCleanupAt && (
                      <p>
                        🧹 Última limpeza: {new Date(safeModeStatus.lastCleanupAt).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                )}

                {/* Aviso quando ativado */}
                {safeModeStatus.enabled && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <p className="text-sm text-green-700 dark:text-green-300">
                      ✅ Na próxima vez que este cliente escanear o QR Code para reconectar, 
                      todas as filas e follow-ups serão automaticamente zerados.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSafeModeDialogUser(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PlansManager({ plans }: { plans: Plan[] | undefined }) {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  const createPlanMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/plans", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      setIsCreateOpen(false);
      toast({ title: "Plano criado com sucesso!" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar plano",
        description: error?.message || "Confira os dados e tente novamente.",
        variant: "destructive",
      });
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/admin/plans/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      setEditingPlan(null);
      toast({ title: "Plano atualizado com sucesso!" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar plano",
        description: error?.message || "Confira os dados e tente novamente.",
        variant: "destructive",
      });
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/plans/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      toast({ title: "Plano deletado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao deletar plano", variant: "destructive" });
    },
  });

  return (
    <Card data-testid="card-plans-manager">
      <CardHeader className="flex flex-row items-center justify-between gap-1">
        <div>
          <CardTitle>Gerenciar Planos</CardTitle>
          <CardDescription>Criar, editar e remover planos de assinatura</CardDescription>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-plan">
              <Plus className="mr-2 h-4 w-4" />
              Novo Plano
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-create-plan">
            <PlanForm
              onSubmit={(data) => createPlanMutation.mutate(data)}
              isPending={createPlanMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Periodicidade</TableHead>
              <TableHead>Código do Plano</TableHead>
              <TableHead>Link do Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans?.map((plan) => (
              <TableRow key={plan.id} data-testid={`row-plan-${plan.id}`}>
                <TableCell data-testid={`text-plan-name-${plan.id}`}>
                  <div className="flex flex-col">
                    <span className="font-medium">{plan.nome}</span>
                    {(plan as any).isPersonalizado && (
                      <Badge variant="outline" className="mt-1 w-fit text-xs">
                        <Crown className="h-3 w-3 mr-1" />
                        Exclusivo
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>R$ {plan.valor}</span>
                    {(plan as any).valorPrimeiraCobranca && (
                      <span className="text-xs text-muted-foreground">
                        1ª: R$ {(plan as any).valorPrimeiraCobranca}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>{plan.periodicidade}</TableCell>
                <TableCell>
                  {(plan as any).codigoPersonalizado ? (
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                        {(plan as any).codigoPersonalizado}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          navigator.clipboard.writeText((plan as any).codigoPersonalizado);
                          toast({ title: "Código copiado!" });
                        }}
                        data-testid={`button-copy-code-${plan.id}`}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {(plan as any).linkSlug ? (
                    <div className="flex items-center gap-2">
                      <code className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded text-xs font-mono max-w-[150px] truncate">
                        /p/{(plan as any).linkSlug}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          const fullUrl = buildPublicAppUrl(`/p/${(plan as any).linkSlug}`);
                          navigator.clipboard.writeText(fullUrl);
                          toast({ title: "Link copiado!", description: fullUrl });
                        }}
                        data-testid={`button-copy-link-${plan.id}`}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={plan.ativo ? "default" : "secondary"}>
                    {plan.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`button-edit-plan-${plan.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <PlanForm
                          onSubmit={(data) => updatePlanMutation.mutate({ id: plan.id, data })}
                          isPending={updatePlanMutation.isPending}
                          initialData={plan}
                        />
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deletePlanMutation.mutate(plan.id)}
                      data-testid={`button-delete-plan-${plan.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

type TrialMode = "0" | "3" | "7" | "custom";

function getInitialTrialMode(value: unknown): TrialMode {
  const days = Number(value || 0);
  if (days === 0 || days === 3 || days === 7) {
    return String(days) as TrialMode;
  }

  return "custom";
}

function normalizePlanCodePrefix(value: string): string {
  const prefix = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 10);

  return prefix || "PLANO";
}

function createPreviewPlanCode(planName: string): string {
  const suffix = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .toUpperCase()
    .padStart(6, "0");

  return `${normalizePlanCodePrefix(planName)}-${suffix}`;
}

function PlanForm({ 
  onSubmit, 
  isPending, 
  initialData 
}: { 
  onSubmit: (data: any) => void; 
  isPending: boolean;
  initialData?: Plan;
}) {
  const [formData, setFormData] = useState({
    nome: initialData?.nome || "",
    valor: initialData?.valor || "",
    periodicidade: initialData?.periodicidade || "mensal",
    limiteConversas: initialData?.limiteConversas || 100,
    limiteAgentes: initialData?.limiteAgentes || 1,
    ativo: initialData?.ativo ?? true,
    // Campos do Mercado Pago
    isPersonalizado: (initialData as any)?.isPersonalizado ?? false,
    codigoPersonalizado: (initialData as any)?.codigoPersonalizado || "",
    linkSlug: (initialData as any)?.linkSlug || "",
    valorPrimeiraCobranca: (initialData as any)?.valorPrimeiraCobranca || "",
    frequenciaDias: (initialData as any)?.frequenciaDias || 30,
    trialDias: (initialData as any)?.trialDias || 0,
  });
  
  const [conversasIlimitadas, setConversasIlimitadas] = useState(initialData?.limiteConversas === -1);
  const [agentesIlimitados, setAgentesIlimitados] = useState(initialData?.limiteAgentes === -1);
  const [trialMode, setTrialMode] = useState<TrialMode>(getInitialTrialMode((initialData as any)?.trialDias));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedTrialDias = trialMode === "custom"
      ? Math.max(0, parseInt(String(formData.trialDias || 0), 10) || 0)
      : parseInt(trialMode, 10) || 0;
    const submitData = {
      ...formData,
      // Garantir que valor seja string (decimal no banco)
      valor: String(formData.valor),
      limiteConversas: conversasIlimitadas ? -1 : formData.limiteConversas,
      limiteAgentes: agentesIlimitados ? -1 : formData.limiteAgentes,
      // valorPrimeiraCobranca deve ser string ou null (decimal no banco)
      valorPrimeiraCobranca: formData.valorPrimeiraCobranca ? String(formData.valorPrimeiraCobranca) : null,
      frequenciaDias: parseInt(formData.frequenciaDias as any) || 30,
      trialDias: resolvedTrialDias,
    };
    onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{initialData ? "Editar Plano" : "Criar Novo Plano"}</DialogTitle>
        <DialogDescription>Preencha as informações do plano</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="nome">Nome do Plano</Label>
          <Input
            id="nome"
            value={formData.nome}
            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            placeholder="Ex: Básico, Profissional"
            required
            data-testid="input-plan-name"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="valor">Valor (R$)</Label>
          <Input
            id="valor"
            type="number"
            step="0.01"
            value={formData.valor}
            onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
            placeholder="99.99"
            required
            data-testid="input-plan-value"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="periodicidade">Periodicidade</Label>
          <Select 
            value={formData.periodicidade} 
            onValueChange={(value) => setFormData({ ...formData, periodicidade: value as "mensal" | "anual" })}
          >
            <SelectTrigger data-testid="select-plan-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mensal">Mensal</SelectItem>
              <SelectItem value="anual">Anual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="trialPreset">Teste gratuito</Label>
          <Select
            value={trialMode}
            onValueChange={(value) => {
              const nextMode = value as TrialMode;
              setTrialMode(nextMode);
              if (nextMode !== "custom") {
                setFormData({ ...formData, trialDias: parseInt(nextMode, 10) || 0 });
              }
            }}
          >
            <SelectTrigger id="trialPreset" data-testid="select-plan-trial">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Sem teste</SelectItem>
              <SelectItem value="3">3 dias</SelectItem>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {trialMode === "custom" && (
            <Input
              id="trialDias"
              type="number"
              min="0"
              value={formData.trialDias}
              onChange={(e) => setFormData({ ...formData, trialDias: e.target.value })}
              placeholder="Quantidade de dias"
              data-testid="input-trial-dias"
            />
          )}
          <p className="text-xs text-muted-foreground">
            Libera o acesso sem pagamento ate o fim do teste. O ciclo pago abaixo continua valendo para renovacao depois do pagamento.
          </p>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="limiteConversas">Limite de Conversas</Label>
            <div className="flex items-center space-x-2">
              <Switch
                checked={conversasIlimitadas}
                onCheckedChange={(checked) => {
                  setConversasIlimitadas(checked);
                  if (checked) setFormData({ ...formData, limiteConversas: -1 });
                }}
                data-testid="switch-conversations-unlimited"
              />
              <Label className="text-sm text-muted-foreground">Ilimitado</Label>
            </div>
          </div>
          <Input
            id="limiteConversas"
            type="number"
            value={conversasIlimitadas ? "" : formData.limiteConversas}
            onChange={(e) => setFormData({ ...formData, limiteConversas: parseInt(e.target.value) || 0 })}
            placeholder={conversasIlimitadas ? "Ilimitado" : "100"}
            disabled={conversasIlimitadas}
            data-testid="input-plan-conversations-limit"
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="limiteAgentes">Limite de Agentes</Label>
            <div className="flex items-center space-x-2">
              <Switch
                checked={agentesIlimitados}
                onCheckedChange={(checked) => {
                  setAgentesIlimitados(checked);
                  if (checked) setFormData({ ...formData, limiteAgentes: -1 });
                }}
                data-testid="switch-agents-unlimited"
              />
              <Label className="text-sm text-muted-foreground">Ilimitado</Label>
            </div>
          </div>
          <Input
            id="limiteAgentes"
            type="number"
            value={agentesIlimitados ? "" : formData.limiteAgentes}
            onChange={(e) => setFormData({ ...formData, limiteAgentes: parseInt(e.target.value) || 0 })}
            placeholder={agentesIlimitados ? "Ilimitado" : "1"}
            disabled={agentesIlimitados}
            data-testid="input-plan-agents-limit"
          />
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="ativo"
            checked={formData.ativo}
            onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
            data-testid="switch-plan-active"
          />
          <Label htmlFor="ativo">Plano Ativo</Label>
        </div>
        
        {/* Configuracoes de cobranca */}
        <div className="border-t pt-4 mt-4">
          <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Configuracoes Mercado Pago
          </h4>
          
          <div className="grid gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="isPersonalizado"
                checked={formData.isPersonalizado}
                onCheckedChange={(checked) => setFormData({ ...formData, isPersonalizado: checked })}
                data-testid="switch-plan-personalizado"
              />
              <Label htmlFor="isPersonalizado">Plano exclusivo</Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="codigoPersonalizado">Codigo do plano</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="codigoPersonalizado"
                  value={formData.codigoPersonalizado}
                  onChange={(e) => setFormData({ ...formData, codigoPersonalizado: e.target.value.toUpperCase() })}
                  placeholder="Gerado automaticamente"
                  className="font-mono uppercase"
                  data-testid="input-codigo-personalizado"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 gap-2"
                  onClick={() => setFormData({ ...formData, codigoPersonalizado: createPreviewPlanCode(formData.nome) })}
                  data-testid="button-generate-plan-code"
                >
                  <Key className="h-4 w-4" />
                  Gerar codigo
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Se deixar vazio, o sistema cria um codigo unico e o link do plano automaticamente.
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="valorPrimeiraCobranca">Valor da 1a cobranca - Implementacao (R$)</Label>
              <Input
                id="valorPrimeiraCobranca"
                type="number"
                step="0.01"
                value={formData.valorPrimeiraCobranca}
                onChange={(e) => setFormData({ ...formData, valorPrimeiraCobranca: e.target.value })}
                placeholder="Ex: 499.90 (deixe vazio se igual ao valor mensal)"
                data-testid="input-valor-primeira-cobranca"
              />
              <p className="text-xs text-muted-foreground">
                Taxa de implementacao na primeira cobranca. Deixe vazio para usar o valor padrao do plano.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="frequenciaDias">Ciclo pago (dias)</Label>
                <Input
                  id="frequenciaDias"
                  type="number"
                  value={formData.frequenciaDias}
                  onChange={(e) => setFormData({ ...formData, frequenciaDias: e.target.value })}
                  placeholder="30"
                  data-testid="input-frequencia-dias"
                />
                <p className="text-xs text-muted-foreground">
                  Depois do teste, este e o periodo liberado por cada pagamento. Mensal normalmente fica 30.
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Link do plano</Label>
                <div className="flex min-h-10 items-center gap-2 rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                  <Link2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {formData.linkSlug ? `/p/${formData.linkSlug}` : "Gerado ao salvar"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending} data-testid="button-submit-plan">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData ? "Atualizar" : "Criar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PaymentsManager({ 
  pendingPayments,
  pendingReceipts = [],
  onGoToReceipts,
}: { 
  pendingPayments: (Payment & { subscription: Subscription & { user: User; plan: Plan } })[] | undefined;
  pendingReceipts?: any[];
  onGoToReceipts?: () => void;
}) {
  const { toast } = useToast();

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("POST", `/api/admin/payments/approve/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Pagamento aprovado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao aprovar pagamento", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      {/* Banner de Comprovantes PIX Pendentes */}
      {pendingReceipts.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-orange-500" />
                <CardTitle className="text-base">Comprovantes PIX Pendentes ({pendingReceipts.length})</CardTitle>
              </div>
              {onGoToReceipts && (
                <Button variant="outline" size="sm" onClick={onGoToReceipts} className="text-orange-600 border-orange-300">
                  Ver todos →
                </Button>
              )}
            </div>
            <CardDescription>Comprovantes enviados por clientes aguardando aprovação</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingReceipts.slice(0, 3).map((receipt: any) => (
                <div key={receipt.id} className="flex items-center justify-between p-2 bg-white rounded-lg border">
                  <div className="flex items-center gap-3">
                    {receipt.receipt_url && (
                      <img src={receipt.receipt_url} alt="" className="w-8 h-8 rounded object-cover cursor-pointer" onClick={() => window.open(receipt.receipt_url, '_blank')} />
                    )}
                    <div>
                      <p className="text-sm font-medium">{receipt.users?.name || receipt.users?.email || "Cliente"}</p>
                      <p className="text-xs text-muted-foreground">R$ {parseFloat(receipt.amount || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

    <Card data-testid="card-pending-payments">
      <CardHeader>
        <CardTitle>Pagamentos Pendentes</CardTitle>
        <CardDescription>Aprovar pagamentos PIX manualmente</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingPayments?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum pagamento pendente
                </TableCell>
              </TableRow>
            )}
            {pendingPayments?.map((payment) => (
              <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                <TableCell data-testid={`text-payment-user-${payment.id}`}>
                  {payment.subscription.user.email}
                </TableCell>
                <TableCell>{payment.subscription.plan.nome}</TableCell>
                <TableCell>R$ {payment.valor}</TableCell>
                <TableCell>{payment.createdAt ? new Date(payment.createdAt).toLocaleDateString("pt-BR") : "-"}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    onClick={() => approveMutation.mutate(payment.id)}
                    disabled={approveMutation.isPending}
                    data-testid={`button-approve-payment-${payment.id}`}
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Aprovar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    </div>
  );
}

// PaymentReceiptsManager Component - Gerenciador de Comprovantes PIX
function PaymentReceiptsManager() {
  const { toast } = useToast();
  const RECEIPTS_PAGE_SIZE = 20;
  const [statusFilter, setStatusFilter] = useState("pending");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);

  const { data: receiptsData, isLoading, refetch } = useQuery<{
    receipts: any[];
    total: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: ["/api/admin/payment-receipts", statusFilter, currentPage, RECEIPTS_PAGE_SIZE],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/payment-receipts?status=${statusFilter}&page=${currentPage}&limit=${RECEIPTS_PAGE_SIZE}`,
      );
      return res.json();
    },
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  useEffect(() => {
    if (receiptsData && receiptsData.totalPages > 0 && currentPage > receiptsData.totalPages) {
      setCurrentPage(receiptsData.totalPages);
    }
  }, [currentPage, receiptsData]);

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("POST", `/api/admin/payment-receipts/${id}/approve`);
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-receipts"] });
      toast({ title: "Comprovante aprovado! Plano ativado com sucesso." });
    },
    onError: () => {
      toast({ title: "Erro ao aprovar comprovante", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      return await apiRequest("POST", `/api/admin/payment-receipts/${id}/reject`, { notes });
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-receipts"] });
      setShowRejectDialog(false);
      setRejectNotes("");
      setSelectedReceipt(null);
      toast({ title: "Comprovante rejeitado e plano cancelado" });
    },
    onError: () => {
      toast({ title: "Erro ao rejeitar comprovante", variant: "destructive" });
    },
  });

  const handleReject = () => {
    if (selectedReceipt) {
      rejectMutation.mutate({ id: selectedReceipt.id, notes: rejectNotes });
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Pendente</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Aprovado</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Rejeitado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const totalReceipts = receiptsData?.total || 0;
  const totalPages = receiptsData?.totalPages || 0;
  const pageStart = totalReceipts === 0 ? 0 : (currentPage - 1) * RECEIPTS_PAGE_SIZE + 1;
  const pageEnd = totalReceipts === 0 ? 0 : Math.min(currentPage * RECEIPTS_PAGE_SIZE, totalReceipts);
  const visiblePages = (() => {
    if (totalPages <= 0) {
      return [];
    }

    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, 4, totalPages];
    }

    if (currentPage >= totalPages - 2) {
      return [1, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, currentPage - 1, currentPage, currentPage + 1, totalPages];
  })();

  return repairReactNodeText(
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="w-5 h-5" />
                Comprovantes de Pagamento PIX
              </CardTitle>
              <CardDescription>
                Gerencie comprovantes de pagamento enviados pelos clientes
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="approved">Aprovados</SelectItem>
                  <SelectItem value="rejected">Rejeitados</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => refetch()} className="shrink-0">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Mostrando {pageStart} a {pageEnd} de {totalReceipts} comprovantes
            </span>
            <span>
              Página {totalReceipts === 0 ? 0 : currentPage} de {totalReceipts === 0 ? 0 : totalPages}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Comprovante</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!receiptsData?.receipts || receiptsData.receipts.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhum comprovante encontrado
                    </TableCell>
                  </TableRow>
                )}
                {receiptsData?.receipts?.map((receipt: any) => {
                  const isResellerReceipt = receipt.admin_notes && receipt.admin_notes.includes("Comprovante de revendedor");
                  return (
                  <TableRow key={receipt.id} className={isResellerReceipt ? "bg-purple-50/30 dark:bg-purple-950/20" : ""}>
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{receipt.users?.name || "—"}</p>
                          {isResellerReceipt && (
                            <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-xs">Revenda</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{receipt.users?.email || "—"}</p>
                        {isResellerReceipt && receipt.admin_notes && (
                          <p className="text-xs text-purple-600 mt-1">{receipt.admin_notes}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{receipt.plans?.nome || receipt.plans?.name || (isResellerReceipt ? "Criação de Cliente" : "—")}</TableCell>
                    <TableCell className="font-medium">R$ {parseFloat(receipt.amount || 0).toFixed(2)}</TableCell>
                    <TableCell>{formatDate(receipt.created_at)}</TableCell>
                    <TableCell>{getStatusBadge(receipt.status)}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedReceipt(receipt);
                          setShowImageDialog(true);
                        }}
                      >
                        <FileImage className="w-4 h-4 mr-1" />
                        Ver
                      </Button>
                    </TableCell>
                    <TableCell>
                      {receipt.status === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => approveMutation.mutate(receipt.id)}
                            disabled={approveMutation.isPending}
                          >
                            {approveMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4 mr-1" />
                            )}
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setSelectedReceipt(receipt);
                              setShowRejectDialog(true);
                            }}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Rejeitar
                          </Button>
                        </div>
                      )}
                      {receipt.status !== "pending" && (
                        <span className="text-sm text-muted-foreground">
                          {receipt.reviewed_at && `Revisado em ${formatDate(receipt.reviewed_at)}`}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Página {totalReceipts === 0 ? 0 : currentPage} de {totalReceipts === 0 ? 0 : totalPages}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage <= 1 || isLoading || totalReceipts === 0}
              >
                Anterior
              </Button>
              {visiblePages.map((page, index) => {
                const previousPage = index > 0 ? visiblePages[index - 1] : null;
                const shouldShowGap = previousPage !== null && page - previousPage > 1;

                return (
                  <div key={`receipts-page-${page}`} className="flex items-center gap-2">
                    {shouldShowGap ? (
                      <span className="text-sm text-muted-foreground">...</span>
                    ) : null}
                    <Button
                      variant={page === currentPage ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      disabled={isLoading}
                    >
                      {page}
                    </Button>
                  </div>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((page) => Math.min(totalPages || 1, page + 1))}
                disabled={currentPage >= totalPages || isLoading || totalReceipts === 0}
              >
                Próximos 20
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog para ver comprovante */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Comprovante de Pagamento</DialogTitle>
            <DialogDescription>
              {selectedReceipt?.users?.email} - R$ {parseFloat(selectedReceipt?.amount || 0).toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            {selectedReceipt?.receipt_url && (
              selectedReceipt.receipt_mime_type?.includes("pdf") ? (
                <a 
                  href={selectedReceipt.receipt_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Abrir PDF em nova aba
                </a>
              ) : (
                <img 
                  src={selectedReceipt.receipt_url} 
                  alt="Comprovante" 
                  className="max-w-full max-h-[500px] rounded-lg border"
                />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para rejeitar */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Comprovante</DialogTitle>
            <DialogDescription>
              O plano do cliente será cancelado. Adicione uma nota explicando o motivo.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reject-notes">Motivo da rejeição</Label>
            <Input
              id="reject-notes"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Ex: Comprovante ilegível, valor incorreto..."
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface AdminSpecialistAddonItem {
  id: string;
  offerType?: "implementation" | "specialist" | null;
  status: string;
  originalAmount?: string | null;
  promotionalAmount?: string | null;
  paymentReference?: string | null;
  pixCode?: string | null;
  pixQrCode?: string | null;
  receiptUrl?: string | null;
  receiptMimeType?: string | null;
  createdAt?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  reviewedAt?: string | null;
  adminNotes?: string | null;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
  plan?: {
    nome?: string | null;
  } | null;
  subscription?: {
    status?: string | null;
  } | null;
}

interface AdminImplementationOfferResponse {
  accessCode: string;
  directUrl: string;
  offer: {
    id: string;
    title: string;
    badge?: string;
    description: string;
    amount: number;
    promotionalAmount: number;
    deliveryDays: number;
    accessCode: string;
    directUrl: string;
    summary?: string;
    highlights?: string[];
  };
}

function parseImplementationItemsText(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.replace(/^[\s-•]+/, "").trim())
    .filter(Boolean);
}

function extractJsonObjectFromText(value: string) {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function SpecialistAddonsManager({
  offerTypeFilter = "all",
  title = "Contratações do Especialista",
  description = "Controle quem contratou o adicional, o comprovante vinculado e a validade do serviço.",
  icon: HeaderIcon = Crown,
  showImplementationGenerator = false,
}: {
  offerTypeFilter?: "all" | "implementation" | "specialist";
  title?: string;
  description?: string;
  icon?: any;
  showImplementationGenerator?: boolean;
}) {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [implementationForm, setImplementationForm] = useState({
    badge: "Implementacao avulsa",
    title: "Implementação Agente",
    description: "Desenvolvimento de automação, integração ou funcionalidade sob medida no AgenteZap.",
    amount: "1000",
    deliveryDays: "7",
    highlightsText:
      "Programacao de automacoes, funcoes e ajustes especificos no AgenteZap\nIntegracoes com ferramentas, APIs ou processos do seu negocio\nPagamento unico, sem mensalidade adicional para esta implementacao\nPrazo estimado de 7 dias uteis apos confirmacao e escopo alinhado",
  });
  const [generatedImplementation, setGeneratedImplementation] = useState<AdminImplementationOfferResponse | null>(null);

  const copyText = async (value: string, successMessage: string) => {
    await navigator.clipboard.writeText(value);
    toast({ title: successMessage });
  };

  const { data, isLoading, refetch } = useQuery<{ items: AdminSpecialistAddonItem[] }>({
    queryKey: ["/api/admin/specialist-addons", statusFilter, offerTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ status: statusFilter });
      if (offerTypeFilter !== "all") {
        params.set("offerType", offerTypeFilter);
      }
      const response = await apiRequest("GET", `/api/admin/specialist-addons?${params.toString()}`);
      return response.json();
    },
  });

  const { data: implementationOffers, refetch: refetchImplementationOffers } = useQuery<{ items: AdminImplementationOfferResponse["offer"][] }>({
    queryKey: ["/api/admin/implementation/offers"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/implementation/offers");
      return response.json();
    },
    enabled: showImplementationGenerator,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/specialist-addons/${id}/approve`, {}),
    onSuccess: async () => {
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specialist-addons"] });
      toast({ title: "Contratação aprovada com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao aprovar contratação", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/specialist-addons/${id}/reject`, {}),
    onSuccess: async () => {
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specialist-addons"] });
      toast({ title: "Contratação rejeitada" });
    },
    onError: () => {
      toast({ title: "Erro ao rejeitar contratação", variant: "destructive" });
    },
  });

  const generateImplementationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/implementation/generate", {
        title: implementationForm.title,
        badge: implementationForm.badge,
        description: implementationForm.description,
        amount: Number(implementationForm.amount || 1000),
        deliveryDays: Number(implementationForm.deliveryDays || 7),
        highlights: parseImplementationItemsText(implementationForm.highlightsText),
      });
      return response.json();
    },
    onSuccess: async (payload) => {
      setGeneratedImplementation(payload);
      await refetchImplementationOffers();
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specialist-addons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/implementation/offers"] });
      toast({
        title: "Implementação criada",
        description: "O código e o link foram gerados automaticamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao gerar a Implementação",
        description: error?.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
    },
  });

  const generateImplementationCopyMutation = useMutation({
    mutationFn: async () => {
      const prompt = [
        "Gere uma oferta comercial de implementacao avulsa para o AgenteZap.",
        "Responda somente em JSON valido.",
        'Campos obrigatorios: {"title":"", "badge":"", "description":"", "highlights":["", "", "", ""]}.',
        "Deixe o texto simples, direto e orientado para cliente final.",
        `Titulo atual: ${implementationForm.title || "Implementacao Agente"}`,
        `Selo atual: ${implementationForm.badge || "Implementacao avulsa"}`,
        `Descricao atual: ${implementationForm.description || "Desenvolvimento sob medida no AgenteZap."}`,
        `Valor unico: R$ ${implementationForm.amount || "1000"}`,
        `Prazo: ${implementationForm.deliveryDays || "7"} dias uteis`,
      ].join("\n");

      const response = await apiRequest("POST", "/api/admin/ai/generate-message", { prompt });
      return response.json();
    },
    onSuccess: (payload: any) => {
      const rawText = String(payload?.generatedMessage || payload?.message || "").trim();
      const parsed = extractJsonObjectFromText(rawText);

      if (!parsed) {
        toast({
          title: "IA sem formato valido",
          description: "A IA nao retornou o JSON esperado para preencher a implementacao.",
          variant: "destructive",
        });
        return;
      }

      setImplementationForm((previous) => ({
        ...previous,
        title: String(parsed.title || previous.title || "").trim() || previous.title,
        badge: String(parsed.badge || previous.badge || "").trim() || previous.badge,
        description: String(parsed.description || previous.description || "").trim() || previous.description,
        highlightsText: Array.isArray(parsed.highlights)
          ? parsed.highlights.map((item) => String(item || "").trim()).filter(Boolean).join("\n") || previous.highlightsText
          : previous.highlightsText,
      }));

      toast({
        title: "Textos preenchidos com IA",
        description: "Titulo, selo, descricao e itens foram atualizados.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao preencher com IA",
        description: error?.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
    },
  });

  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Ativo</Badge>;
      case "pending_review":
        return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Em análise</Badge>;
      case "pending_payment":
        return <Badge variant="outline">Aguardando comprovante</Badge>;
      case "expired":
        return <Badge variant="secondary">Expirado</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejeitado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getOfferLabel = (offerType?: string | null) => {
    return offerType === "implementation" ? "Implementação Agente" : "Especialista dedicado";
  };

  return (
    <div className="space-y-4">
      {showImplementationGenerator ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-emerald-600" />
              Criar Implementação Agente
            </CardTitle>
            <CardDescription>
              Cadastre uma oferta avulsa de desenvolvimento. O código e o link são gerados automaticamente, como nos planos personalizados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div className="space-y-4 rounded-2xl border border-gray-200 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input
                      value={implementationForm.title}
                      onChange={(event) => setImplementationForm({ ...implementationForm, title: event.target.value })}
                      placeholder="Título da implementação"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Selo</Label>
                    <Input
                      value={implementationForm.badge}
                      onChange={(event) => setImplementationForm({ ...implementationForm, badge: event.target.value })}
                      placeholder="Implementação avulsa"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Valor único</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={implementationForm.amount}
                      onChange={(event) => setImplementationForm({ ...implementationForm, amount: event.target.value })}
                      placeholder="1000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Prazo em dias úteis</Label>
                    <Input
                      type="number"
                      value={implementationForm.deliveryDays}
                      onChange={(event) => setImplementationForm({ ...implementationForm, deliveryDays: event.target.value })}
                      placeholder="7"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Descrição</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => generateImplementationCopyMutation.mutate()}
                      disabled={generateImplementationCopyMutation.isPending}
                    >
                      {generateImplementationCopyMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      Preencher com IA
                    </Button>
                  </div>
                  <Textarea
                    value={implementationForm.description}
                    onChange={(event) => setImplementationForm({ ...implementationForm, description: event.target.value })}
                    placeholder="Descrição do escopo"
                    className="min-h-[110px] resize-y"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Itens da oferta</Label>
                  <Textarea
                    value={implementationForm.highlightsText}
                    onChange={(event) => setImplementationForm({ ...implementationForm, highlightsText: event.target.value })}
                    placeholder="Um item por linha"
                    className="min-h-[160px] resize-y"
                  />
                  <p className="text-xs text-muted-foreground">
                    O código e o link são gerados automaticamente. Cada linha vira um item do card da Implementação.
                  </p>
                </div>

                <Button
                  onClick={() => generateImplementationMutation.mutate()}
                  disabled={!implementationForm.title.trim() || !implementationForm.amount || generateImplementationMutation.isPending}
                  className="w-full md:w-auto"
                >
                  {generateImplementationMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
                  Criar implementação
                </Button>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{implementationForm.badge || "Implementação avulsa"}</Badge>
                  <span className="text-xs text-muted-foreground">Preview rápido</span>
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-lg font-semibold text-gray-950">{implementationForm.title || "Implementação Agente"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{implementationForm.description}</p>
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    R$ {Number(implementationForm.amount || 0).toFixed(2)} pagamento único
                  </p>
                  <ul className="space-y-2">
                    {parseImplementationItemsText(implementationForm.highlightsText).slice(0, 5).map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Prazo estimado: {implementationForm.deliveryDays || "7"} dias úteis
                  </p>
                </div>
              </div>
            </div>

            {generatedImplementation ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-emerald-900">
                      {generatedImplementation.offer?.title || "Implementação criada"}
                    </p>
                    <div className="inline-flex items-center rounded-full bg-white px-3 py-1 font-mono text-sm text-emerald-900 shadow-sm">
                      {generatedImplementation.accessCode}
                    </div>
                    <p className="text-sm text-emerald-800">
                      Valor único: R$ {Number(generatedImplementation.offer?.amount || 0).toFixed(2)} • prazo: {generatedImplementation.offer?.deliveryDays || 7} dias úteis
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => copyText(generatedImplementation.accessCode, "Código copiado")}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copiar código
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => copyText(generatedImplementation.directUrl, "Link direto copiado")}>
                      <Link2 className="mr-2 h-4 w-4" />
                      Copiar link
                    </Button>
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-emerald-100 bg-white px-3 py-3 text-xs text-gray-700">
                  <p className="font-semibold text-gray-900">Link da implementação</p>
                  <p className="mt-1 break-all">{generatedImplementation.directUrl}</p>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-gray-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Implementação</TableHead>
                    <TableHead>Valor único</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!implementationOffers?.items || implementationOffers.items.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                        Nenhuma implementação criada ainda
                      </TableCell>
                    </TableRow>
                  ) : (
                    implementationOffers.items.map((offer) => (
                      <TableRow key={offer.id}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{offer.title}</p>
                            {offer.badge ? <Badge variant="outline">{offer.badge}</Badge> : null}
                          </div>
                          <p className="max-w-xl text-xs text-muted-foreground">{offer.description}</p>
                          {offer.highlights?.length ? (
                            <p className="mt-2 max-w-xl text-xs text-muted-foreground">
                              {offer.highlights.slice(0, 3).join(" • ")}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>R$ {Number(offer.amount || 0).toFixed(2)}</TableCell>
                        <TableCell>{offer.deliveryDays} dias úteis</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-muted px-2 py-1 text-xs font-mono">{offer.accessCode}</code>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => copyText(offer.accessCode, "Código copiado")}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => copyText(offer.directUrl, "Link copiado")}>
                            <Link2 className="mr-1 h-3 w-3" />
                            Copiar link
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HeaderIcon className="w-5 h-5" />
                {title}
              </CardTitle>
              <CardDescription>
                {description}
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_review">Em análise</SelectItem>
                  <SelectItem value="pending_payment">Sem comprovante</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="expired">Expirados</SelectItem>
                  <SelectItem value="rejected">Rejeitados</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Plano base</TableHead>
                  <TableHead>Oferta</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Solicitado em</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Comprovante</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!data?.items || data.items.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      Nenhuma contratação encontrada
                    </TableCell>
                  </TableRow>
                )}

                {data?.items?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.user?.name || "—"}</p>
                        <p className="text-sm text-muted-foreground">{item.user?.email || "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.plan?.nome || "—"}</p>
                        <p className="text-xs text-muted-foreground">Assinatura: {item.subscription?.status || "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{getOfferLabel(item.offerType)}</p>
                        <p className="text-sm text-muted-foreground">
                          R$ {Number(item.promotionalAmount || 0).toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground line-through">
                          R$ {Number(item.originalAmount || 0).toFixed(2)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.paymentReference ? (
                        <div className="space-y-2">
                          <code className="inline-flex rounded bg-muted px-2 py-1 text-xs font-mono">
                            {item.paymentReference}
                          </code>
                          {item.offerType === "implementation" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() =>
                                copyText(
                                  buildPublicAppUrl(`/implementacao?codigo=${encodeURIComponent(String(item.paymentReference || ""))}`),
                                  "Link da Implementação copiado",
                                )
                              }
                            >
                              <Link2 className="mr-1 h-3 w-3" />
                              Link
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(item.createdAt)}</TableCell>
                    <TableCell>
                      <div>
                        <p>{formatDate(item.startsAt)}</p>
                        <p className="text-xs text-muted-foreground">até {formatDate(item.endsAt)}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        {getStatusBadge(item.status)}
                        {item.reviewedAt ? (
                          <p className="text-xs text-muted-foreground">Revisado em {formatDate(item.reviewedAt)}</p>
                        ) : null}
                        {item.adminNotes ? (
                          <p className="max-w-[220px] text-xs text-muted-foreground">{item.adminNotes}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.receiptUrl ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(item.receiptUrl || "", "_blank", "noopener,noreferrer")}
                        >
                          <FileImage className="mr-1 h-4 w-4" />
                          Abrir
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">Sem envio</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.status === "pending_review" ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => approveMutation.mutate(item.id)}
                            disabled={approveMutation.isPending}
                          >
                            {approveMutation.isPending ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="mr-1 h-4 w-4" />
                            )}
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => rejectMutation.mutate(item.id)}
                            disabled={rejectMutation.isPending}
                          >
                            Rejeitar
                          </Button>
                        </div>
                      ) : item.status === "pending_payment" ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => rejectMutation.mutate(item.id)}
                          disabled={rejectMutation.isPending}
                        >
                          Cancelar
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">Sem ação pendente</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

// Coupon interface
interface Coupon {
  id: string;
  code: string;
  discountType: string;
  discountValue: string;
  finalPrice: string;
  isActive: boolean;
  maxUses: number | null;
  currentUses: number;
  validFrom: string | null;
  validUntil: string | null;
  applicablePlans: string[] | null;
  createdAt: string;
}

// CouponsManager Component
function CouponsManager() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newFinalPrice, setNewFinalPrice] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newValidUntil, setNewValidUntil] = useState("");
  const [newIsActive, setNewIsActive] = useState(true);
  const [newApplicablePlans, setNewApplicablePlans] = useState<string[]>([]);

  const { data: coupons, isLoading } = useQuery<Coupon[]>({
    queryKey: ["/api/admin/coupons"],
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const couponPlanOptions = useMemo(() => {
    const seen = new Set<string>();
    return (plans || [])
      .map((plan) => {
        const tipo = String(plan.tipo || plan.periodicidade || plan.id || "").trim();
        const label = String(plan.nome || tipo).trim();
        return { tipo, label };
      })
      .filter((plan) => {
        if (!plan.tipo || seen.has(plan.tipo)) return false;
        seen.add(plan.tipo);
        return true;
      });
  }, [plans]);

  const createCouponMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/coupons", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      toast({ title: "Cupom criado com sucesso!" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar cupom", description: error.message, variant: "destructive" });
    },
  });

  const updateCouponMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/admin/coupons/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      toast({ title: "Cupom atualizado com sucesso!" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar cupom", description: error.message, variant: "destructive" });
    },
  });

  const deleteCouponMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/coupons/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      toast({ title: "Cupom excluído com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao excluir cupom", description: error.message, variant: "destructive" });
    },
  });

  const toggleCouponMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await apiRequest("PUT", `/api/admin/coupons/${id}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar cupom", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setNewCode("");
    setNewFinalPrice("");
    setNewMaxUses("");
    setNewValidUntil("");
    setNewIsActive(true);
    setNewApplicablePlans([]);
    setEditingCoupon(null);
  };

  const openEditDialog = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setNewCode(coupon.code);
    setNewFinalPrice(coupon.finalPrice);
    setNewMaxUses(coupon.maxUses?.toString() || "");
    setNewValidUntil(coupon.validUntil ? coupon.validUntil.split('T')[0] : "");
    setNewIsActive(coupon.isActive);
    setNewApplicablePlans(coupon.applicablePlans || []);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!newCode.trim()) {
      toast({ title: "Código é obrigatório", variant: "destructive" });
      return;
    }
    if (!newFinalPrice || Number(newFinalPrice) <= 0) {
      toast({ title: "Preço final inválido", variant: "destructive" });
      return;
    }

    const data = {
      code: newCode.toUpperCase(),
      finalPrice: newFinalPrice,
      maxUses: newMaxUses ? parseInt(newMaxUses) : null,
      validUntil: newValidUntil ? new Date(newValidUntil).toISOString() : null,
      isActive: newIsActive,
      applicablePlans: newApplicablePlans.length > 0 ? newApplicablePlans : null,
    };

    if (editingCoupon) {
      updateCouponMutation.mutate({ id: editingCoupon.id, data });
    } else {
      createCouponMutation.mutate(data);
    }
  };

  const togglePlanSelection = (planTipo: string) => {
    setNewApplicablePlans(prev => 
      prev.includes(planTipo) 
        ? prev.filter(p => p !== planTipo)
        : [...prev, planTipo]
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Cupons de Desconto</h2>
          <p className="text-muted-foreground">Gerencie cupons promocionais para seus planos</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Cupom
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingCoupon ? "Editar Cupom" : "Criar Novo Cupom"}</DialogTitle>
              <DialogDescription>
                {editingCoupon ? "Edite os detalhes do cupom" : "Configure um novo cupom de desconto"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="code">Código do Cupom</Label>
                <Input
                  id="code"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="Ex: BLACKFRIDAY, WELCOME2025"
                  className="uppercase"
                />
                <p className="text-xs text-muted-foreground">
                  Use nomes únicos e difíceis de adivinhar
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="finalPrice">Preço Final (R$)</Label>
                <Input
                  id="finalPrice"
                  type="number"
                  step="0.01"
                  value={newFinalPrice}
                  onChange={(e) => setNewFinalPrice(e.target.value)}
                  placeholder="Ex: 29.00"
                />
                <p className="text-xs text-muted-foreground">
                  Preço mensal que o cliente pagará com este cupom
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxUses">Limite de Usos (opcional)</Label>
                <Input
                  id="maxUses"
                  type="number"
                  value={newMaxUses}
                  onChange={(e) => setNewMaxUses(e.target.value)}
                  placeholder="Deixe vazio para ilimitado"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="validUntil">Válido Até (opcional)</Label>
                <Input
                  id="validUntil"
                  type="date"
                  value={newValidUntil}
                  onChange={(e) => setNewValidUntil(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Aplicável aos Planos</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {couponPlanOptions.map((plan) => (
                    <Badge 
                      key={plan.tipo}
                      variant={newApplicablePlans.includes(plan.tipo) ? "default" : "outline"}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => togglePlanSelection(plan.tipo)}
                    >
                      {newApplicablePlans.includes(plan.tipo) && <Check className="h-3 w-3 mr-1" />}
                      {plan.label}
                    </Badge>
                  ))}
                  {couponPlanOptions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Planos carregando...</span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Deixe vazio para aplicar a todos os planos
                </p>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="isActive">Cupom Ativo</Label>
                <Switch
                  id="isActive"
                  checked={newIsActive}
                  onCheckedChange={setNewIsActive}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={createCouponMutation.isPending || updateCouponMutation.isPending}
              >
                {(createCouponMutation.isPending || updateCouponMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingCoupon ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Preço Final</TableHead>
                <TableHead>Usos</TableHead>
                <TableHead>Planos</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum cupom cadastrado
                  </TableCell>
                </TableRow>
              )}
              {coupons?.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell className="font-mono font-bold">{coupon.code}</TableCell>
                  <TableCell className="font-semibold text-green-600">
                    R$ {Number(coupon.finalPrice).toFixed(2).replace('.', ',')}
                  </TableCell>
                  <TableCell>
                    {coupon.currentUses}/{coupon.maxUses || "∞"}
                  </TableCell>
                  <TableCell>
                    {coupon.applicablePlans?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {coupon.applicablePlans.map((p: string) => (
                          <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Todos</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {coupon.validUntil 
                      ? new Date(coupon.validUntil).toLocaleDateString('pt-BR')
                      : <span className="text-muted-foreground">Sem limite</span>
                    }
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={coupon.isActive}
                      onCheckedChange={(checked) => toggleCouponMutation.mutate({ id: coupon.id, isActive: checked })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => openEditDialog(coupon)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Excluir cupom ${coupon.code}?`)) {
                            deleteCouponMutation.mutate(coupon.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dicas de uso */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">💡 Dicas para Cupons</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Use nomes únicos e difíceis de adivinhar (ex: BLACKFRIDAY2025, PARCEIRO10)</p>
          <p>• Evite padrões óbvios como PROMO1, PROMO2, DESCONTO10</p>
          <p>• Configure limite de usos para promoções limitadas</p>
          <p>• Defina data de validade para campanhas temporárias</p>
        </CardContent>
      </Card>

    </div>
  );
}

// ============================================================================
// RESELLERS MANAGER - Gerenciamento de Revendedores White-Label
// ============================================================================

interface Reseller {
  id: string;
  userId: string;
  companyName: string;
  companyDescription?: string;
  logoUrl?: string;
  subdomain?: string;
  customDomain?: string;
  domainVerified?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  clientMonthlyPrice?: string;
  clientSetupFee?: string;
  costPerClient?: string;
  maxClients?: number;
  supportEmail?: string;
  supportPhone?: string;
  welcomeMessage?: string;
  isActive?: boolean;
  resellerStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  user?: { name: string; email: string };
  clientCount?: number;
}

interface ResellerManagedClient {
  id: string;
  userId: string;
  status: string;
  saasStatus?: string | null;
  saasPaidUntil?: string | null;
  nextPaymentDate?: string | null;
  effectiveCoverageEnd?: string | null;
  subscriptionStatus?: string | null;
  needsManualRelease?: boolean;
  activatedAt?: string | null;
  clientPrice?: string | null;
  monthlyCost?: string | null;
  salePrice?: string | null;
  saasUnitPrice?: string | null;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

interface ResellerMetrics {
  totalClients: number;
  activeClients: number;
  suspendedClients: number;
  cancelledClients: number;
  totalRevenue: number;
  monthlyRevenue: number;
  monthlyCost: number;
  monthlyProfit: number;
}

interface ResellerDetailsResponse {
  reseller: Reseller;
  clients: ResellerManagedClient[];
  metrics: ResellerMetrics;
  billing: {
    planName?: string | null;
    planStatus?: string | null;
    costPerClient?: string | null;
    defaultSalePrice?: string | null;
    currentInvoice?: ResellerInvoiceAdmin | null;
    invoices?: ResellerInvoiceAdmin[];
  };
}

interface ResellerInvoiceAdmin {
  id: number;
  resellerId: string;
  referenceMonth: string;
  dueDate: string;
  activeClients: number;
  unitPrice: string;
  totalAmount: string;
  status: string;
  paymentMethod?: string;
  mpPaymentId?: string;
  paidAt?: string;
  createdAt: string;
  reseller?: {
    id: string;
    companyName: string;
    user?: {
      id: string;
      name?: string;
      email?: string;
    } | null;
  } | null;
}

interface AdminResellerClientDetailsResponse {
  client: {
    id: string;
    status: string;
    activatedAt: string;
    saasPaidUntil: string;
    isFreeClient: boolean;
    createdAt: string;
  };
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  connection: {
    id: string;
    isConnected: boolean;
    phoneNumber?: string | null;
  } | null;
  subscriptionView: {
    status: string;
    daysRemaining: number;
    nextPaymentDate: string;
    dataInicio: string;
    dataFim: string;
    needsPayment: boolean;
    isOverdue: boolean;
  };
  plan: {
    nome: string;
    valor: string;
    descricao: string;
  };
  paymentHistory: Array<{
    id: string;
    amount: string;
    paidAt: string;
    createdAt: string;
    referenceMonth: string;
    paymentMethod: string;
    status: string;
    description: string;
  }>;
  stats: {
    totalPaid: number;
    totalPayments: number;
    approvedPayments: number;
    monthsInSystem: number;
    totalConversations: number;
  };
  reseller: {
    companyName: string;
    pixKey?: string | null;
    pixKeyType?: string | null;
    pixHolderName?: string | null;
    pixBankName?: string | null;
    supportPhone?: string | null;
    supportEmail?: string | null;
  };
  saasBilling?: {
    unitPrice?: string | null;
    salePrice?: string | null;
    paidInvoices?: number;
    lastPaidMonth?: string | null;
  };
}

function ResellersManager() {
  const { toast } = useToast();
  const [selectedResellerDetails, setSelectedResellerDetails] = useState<ResellerDetailsResponse | null>(null);
  const [selectedClientDetails, setSelectedClientDetails] = useState<AdminResellerClientDetailsResponse | null>(null);
  const [isLoadingClientDetails, setIsLoadingClientDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("pending");
  const [makeResellerDialogOpen, setMakeResellerDialogOpen] = useState(false);
  const [selectedUserForReseller, setSelectedUserForReseller] = useState<string>("");
  const readRouteState = () => {
    const hash = window.location.hash.replace("#", "");
    const parts = hash.split("/").filter(Boolean);
    if (parts[0] !== "resellers") {
      return { resellerId: null as string | null, clientId: null as string | null };
    }

    return {
      resellerId: parts[1] || null,
      clientId: parts[2] === "clients" ? parts[3] || null : null,
    };
  };
  const [routeState, setRouteState] = useState(readRouteState);

  useEffect(() => {
    const onHashChange = () => setRouteState(readRouteState());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Buscar revendedores
  const { data: resellers, isLoading, refetch } = useQuery<Reseller[]>({
    queryKey: ["/api/admin/resellers"],
  });

  // Buscar usuários para atribuir plano de revenda
  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: resellerInvoicesData, isLoading: isLoadingResellerInvoices, refetch: refetchResellerInvoices } = useQuery<{ invoices: ResellerInvoiceAdmin[]; total: number }>({
    queryKey: ["/api/admin/reseller-invoices", invoiceStatusFilter],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/reseller-invoices?status=${invoiceStatusFilter}`);
      return response.json();
    },
  });

  const markResellerInvoicePaidMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const response = await apiRequest("POST", `/api/admin/reseller-invoices/${invoiceId}/mark-paid`, {
        paymentMethod: "manual_admin",
      });
      return response.json();
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reseller-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resellers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-receipts"] });
      if (routeState.resellerId) {
        await loadResellerDetails(routeState.resellerId);
      }
      if (routeState.resellerId && routeState.clientId) {
        await loadClientDetails(routeState.resellerId, routeState.clientId);
      }
      toast({
        title: "Fatura marcada como paga",
        description: typeof data?.clientsActivated === "number"
          ? `${data.clientsActivated} cliente(s) reativado(s).`
          : "Revendedor e clientes reativados.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao marcar fatura como paga", description: error.message, variant: "destructive" });
    },
  });

  const grantResellerClientAccessMutation = useMutation({
    mutationFn: async ({
      resellerId,
      clientId,
      activateReseller,
    }: {
      resellerId: string;
      clientId: string;
      activateReseller: boolean;
    }) => {
      const response = await apiRequest("POST", `/api/admin/resellers/${resellerId}/clients/${clientId}/grant-access`, {
        days: 30,
        activateReseller,
      });
      return response.json();
    },
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resellers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reseller-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-receipts"] });
      if (routeState.resellerId === variables.resellerId) {
        await loadResellerDetails(variables.resellerId);
      }
      if (routeState.resellerId === variables.resellerId && routeState.clientId === variables.clientId) {
        await loadClientDetails(variables.resellerId, variables.clientId);
      }
      toast({ title: "Cliente liberado", description: "Somente este cliente da revenda recebeu 30 dias." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao liberar cliente", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para ativar/desativar revendedor
  const toggleResellerMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const response = await apiRequest("PUT", `/api/admin/resellers/${id}/status`, { active });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resellers"] });
      toast({ title: "Status atualizado com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para tornar usuário revendedor
  const makeResellerMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("POST", `/api/admin/users/${userId}/make-reseller`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resellers"] });
      toast({ title: "Usuário agora é revendedor!" });
      setMakeResellerDialogOpen(false);
      setSelectedUserForReseller("");
    },
    onError: (error: any) => {
      toast({ title: "Erro ao tornar revendedor", description: error.message, variant: "destructive" });
    },
  });

  // Ver detalhes do revendedor
  const loadResellerDetails = async (resellerId: string) => {
    const response = await apiRequest("GET", `/api/admin/resellers/${resellerId}`);
    const data: ResellerDetailsResponse = await response.json();
    setSelectedResellerDetails(data);
    setInvoiceStatusFilter("all");
    return data;
  };

  const loadClientDetails = async (resellerId: string, clientId: string) => {
    setIsLoadingClientDetails(true);
    try {
      const response = await apiRequest("GET", `/api/admin/resellers/${resellerId}/clients/${clientId}/details`);
      const data: AdminResellerClientDetailsResponse = await response.json();
      setSelectedClientDetails(data);
      return data;
    } finally {
      setIsLoadingClientDetails(false);
    }
  };

  const navigateToRoute = (resellerId?: string | null, clientId?: string | null) => {
    const nextHash = resellerId
      ? clientId
        ? `/admin#resellers/${resellerId}/clients/${clientId}`
        : `/admin#resellers/${resellerId}`
      : "/admin#resellers";
    window.history.replaceState(null, "", nextHash);
    setRouteState({
      resellerId: resellerId || null,
      clientId: clientId || null,
    });
  };

  const handleViewDetails = async (reseller: Reseller) => {
    try {
      navigateToRoute(reseller.id, null);
      setSelectedClientDetails(null);
      await loadResellerDetails(reseller.id);
    } catch (error: any) {
      toast({ title: "Erro ao carregar detalhes", description: error.message, variant: "destructive" });
    }
  };

  const handleViewClientDetails = async (resellerId: string, clientId: string) => {
    try {
      navigateToRoute(resellerId, clientId);
      await loadClientDetails(resellerId, clientId);
    } catch (error: any) {
      toast({ title: "Erro ao carregar cliente", description: error.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!routeState.resellerId) {
      setSelectedResellerDetails(null);
      setSelectedClientDetails(null);
      return;
    }

    if (selectedResellerDetails?.reseller.id !== routeState.resellerId) {
      loadResellerDetails(routeState.resellerId).catch((error: any) => {
        toast({ title: "Erro ao carregar revenda", description: error.message, variant: "destructive" });
      });
    }
  }, [routeState.resellerId]);

  useEffect(() => {
    if (!routeState.resellerId || !routeState.clientId) {
      setSelectedClientDetails(null);
      return;
    }

    loadClientDetails(routeState.resellerId, routeState.clientId).catch((error: any) => {
      toast({ title: "Erro ao carregar cliente", description: error.message, variant: "destructive" });
    });
  }, [routeState.resellerId, routeState.clientId]);

  // Filtrar revendedores
  const filteredResellers = resellers?.filter(r => 
    r.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.user?.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Usuários que ainda não são revendedores
  const selectedReseller = selectedResellerDetails?.reseller || null;
  const selectedResellerClients = selectedResellerDetails?.clients || [];
  const selectedResellerMetrics = selectedResellerDetails?.metrics || null;
  const selectedResellerInvoices = selectedResellerDetails?.billing?.invoices || [];
  const selectedCurrentInvoice = selectedResellerDetails?.billing?.currentInvoice
    || selectedResellerInvoices.find((invoice) => invoice.status !== "paid")
    || selectedResellerInvoices[0]
    || null;

  const nonResellerUsers = users?.filter(u => 
    !resellers?.some(r => r.userId === u.id)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (routeState.resellerId && routeState.clientId && isLoadingClientDetails && !selectedClientDetails) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (selectedReseller && routeState.clientId && selectedClientDetails) {
    const subscriptionView = selectedClientDetails.subscriptionView;
    const saasBilling = selectedClientDetails.saasBilling;
    const needsManualRelease =
      selectedClientDetails.client.status !== "cancelled" &&
      (
        subscriptionView.isOverdue ||
        selectedClientDetails.client.status === "suspended" ||
        selectedReseller.resellerStatus === "blocked"
      );

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <Button
              variant="ghost"
              className="w-fit px-0 text-muted-foreground hover:text-foreground"
              onClick={() => navigateToRoute(selectedReseller.id, null)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para {selectedReseller.companyName}
            </Button>
            <h2 className="text-2xl font-bold tracking-tight">{selectedClientDetails.user?.name || "Cliente da revenda"}</h2>
            <p className="text-muted-foreground">
              Link direto deste cliente: <span className="font-medium">/admin#resellers/{selectedReseller.id}/clients/{selectedClientDetails.client.id}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={subscriptionView.isOverdue ? "destructive" : "default"}>
              {subscriptionView.status}
            </Badge>
            <Badge variant="outline">{selectedClientDetails.stats.approvedPayments} fatura(s) paga(s)</Badge>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Cobertura até</p>
              <p className="mt-2 text-2xl font-bold">{new Date(subscriptionView.dataFim).toLocaleDateString("pt-BR")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Dias restantes</p>
              <p className="mt-2 text-2xl font-bold">{subscriptionView.daysRemaining}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total pago</p>
              <p className="mt-2 text-2xl font-bold">R$ {Number(selectedClientDetails.stats.totalPaid || 0).toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Desde quando está</p>
              <p className="mt-2 text-2xl font-bold">{new Date(selectedClientDetails.client.activatedAt).toLocaleDateString("pt-BR")}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Dados do Cliente</CardTitle>
              <CardDescription>Histórico operacional do cliente dentro da revenda.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="font-medium">{selectedClientDetails.user?.email || "-"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Telefone</Label>
                <p className="font-medium">{selectedClientDetails.user?.phone || "-"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Conversas</Label>
                <p>{selectedClientDetails.stats.totalConversations}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Meses no sistema</Label>
                <p>{selectedClientDetails.stats.monthsInSystem}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status da conexão</Label>
                <p>{selectedClientDetails.connection?.isConnected ? "WhatsApp conectado" : "WhatsApp desconectado"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Próxima revisão</Label>
                <p>{new Date(subscriptionView.nextPaymentDate).toLocaleDateString("pt-BR")}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cobrança SaaS x Revenda</CardTitle>
              <CardDescription>Aqui fica separado o que o SaaS cobra da revenda e o que a revenda cobra do cliente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-muted-foreground">Plano visível do cliente</Label>
                  <p className="font-medium">{selectedClientDetails.plan.nome}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Preço da revenda para o cliente</Label>
                  <p className="font-medium">R$ {Number(saasBilling?.salePrice || selectedClientDetails.plan.valor || 0).toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Custo SaaS por cliente</Label>
                  <p className="font-medium">R$ {Number(saasBilling?.unitPrice || 0).toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Último mês pago</Label>
                  <p className="font-medium">{saasBilling?.lastPaidMonth || "-"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {needsManualRelease ? (
                  <Button
                    onClick={() => grantResellerClientAccessMutation.mutate({
                      resellerId: selectedReseller.id,
                      clientId: selectedClientDetails.client.id,
                      activateReseller: selectedReseller.resellerStatus === "blocked",
                    })}
                    disabled={grantResellerClientAccessMutation.isPending}
                  >
                    {grantResellerClientAccessMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    {selectedReseller.resellerStatus === "blocked" ? "Ativar revenda + 30 dias" : "Liberar 30 dias manualmente"}
                  </Button>
                ) : (
                  <Badge variant="outline">Cobertura OK, sem ação manual</Badge>
                )}
                <Badge variant="secondary">Quitar a fatura da revenda continua sendo a ação mensal principal</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Histórico de Faturas Pagas</CardTitle>
            <CardDescription>Mostra desde quando o cliente está e quantas mensalidades da revenda já foram pagas para ele.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referência</TableHead>
                    <TableHead>Pago em</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedClientDetails.paymentHistory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Nenhuma fatura paga encontrada para este cliente.
                      </TableCell>
                    </TableRow>
                  )}
                  {selectedClientDetails.paymentHistory.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{payment.referenceMonth || "-"}</TableCell>
                      <TableCell>{payment.paidAt ? new Date(payment.paidAt).toLocaleDateString("pt-BR") : "-"}</TableCell>
                      <TableCell>{payment.paymentMethod || "-"}</TableCell>
                      <TableCell>{payment.description || "-"}</TableCell>
                      <TableCell className="text-right font-medium">R$ {Number(payment.amount || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (selectedReseller) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <Button
              variant="ghost"
              className="w-fit px-0 text-muted-foreground hover:text-foreground"
              onClick={() => navigateToRoute(null, null)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para revendedores
            </Button>
            <h2 className="text-2xl font-bold tracking-tight">{selectedReseller.companyName}</h2>
            <p className="text-muted-foreground">
              Aqui a lógica fica separada: a fatura da revenda quita o SaaS com você; a liberação manual libera só o cliente da linha.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={selectedReseller.resellerStatus === "blocked" ? "destructive" : (selectedReseller.isActive ? "default" : "secondary")}>
              Revenda {selectedReseller.resellerStatus || (selectedReseller.isActive ? "active" : "inactive")}
            </Badge>
            <Badge variant="outline">{selectedReseller.clientCount || 0} clientes</Badge>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Clientes ativos</p>
              <p className="mt-2 text-2xl font-bold">{selectedResellerMetrics?.activeClients || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Receita da revenda</p>
              <p className="mt-2 text-2xl font-bold">R$ {Number(selectedResellerMetrics?.monthlyRevenue || 0).toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Custo SaaS</p>
              <p className="mt-2 text-2xl font-bold">R$ {Number(selectedResellerMetrics?.monthlyCost || 0).toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Lucro estimado</p>
              <p className="mt-2 text-2xl font-bold">R$ {Number(selectedResellerMetrics?.monthlyProfit || 0).toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Fatura da Revenda com o SaaS
              </CardTitle>
              <CardDescription>
                Este botão quita a cobrança da revenda com você e reativa os clientes não cancelados dessa revenda.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedCurrentInvoice ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <Label className="text-muted-foreground">Mês</Label>
                      <p className="font-medium">{selectedCurrentInvoice.referenceMonth}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Vencimento</Label>
                      <p className="font-medium">{selectedCurrentInvoice.dueDate ? new Date(selectedCurrentInvoice.dueDate).toLocaleDateString("pt-BR") : "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Valor</Label>
                      <p className="font-medium">R$ {Number(selectedCurrentInvoice.totalAmount || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <div className="mt-1">
                        <Badge variant={selectedCurrentInvoice.status === "paid" ? "default" : (selectedCurrentInvoice.status === "overdue" ? "destructive" : "secondary")}>
                          {selectedCurrentInvoice.status === "paid" ? "Paga" : selectedCurrentInvoice.status === "overdue" ? "Vencida" : "Pendente"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedCurrentInvoice.status !== "paid" ? (
                      <Button
                        onClick={() => markResellerInvoicePaidMutation.mutate(selectedCurrentInvoice.id)}
                        disabled={markResellerInvoicePaidMutation.isPending}
                      >
                        {markResellerInvoicePaidMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-2 h-4 w-4" />
                        )}
                        Quitar fatura da revenda
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {selectedCurrentInvoice.paidAt ? `Paga em ${new Date(selectedCurrentInvoice.paidAt).toLocaleDateString("pt-BR")}` : "Fatura já quitada"}
                      </span>
                    )}
                    <Badge variant="outline">Esta e a cobranca mensal principal da revenda com o SaaS</Badge>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma fatura encontrada para esta revenda.</p>
              )}
              {selectedResellerInvoices.length > 0 && (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Referencia</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Clientes</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Pago em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedResellerInvoices.slice(0, 6).map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium">{invoice.referenceMonth || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={invoice.status === "paid" ? "default" : (invoice.status === "overdue" ? "destructive" : "secondary")}>
                              {invoice.status === "paid" ? "Paga" : invoice.status === "overdue" ? "Vencida" : "Pendente"}
                            </Badge>
                          </TableCell>
                          <TableCell>{invoice.activeClients || 0}</TableCell>
                          <TableCell>R$ {Number(invoice.totalAmount || 0).toFixed(2)}</TableCell>
                          <TableCell>{invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString("pt-BR") : "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plano SaaS da Revenda</CardTitle>
              <CardDescription>Mostra o plano da revenda com você, separado do preço final cobrado ao cliente.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-muted-foreground">Plano</Label>
                <p className="font-medium">{selectedResellerDetails?.billing?.planName || "Plano Revenda White-Label"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status do plano</Label>
                <p className="font-medium">{selectedResellerDetails?.billing?.planStatus || "-"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Custo SaaS por cliente</Label>
                <p>R$ {selectedResellerDetails?.billing?.costPerClient || selectedReseller.costPerClient || "49.99"}/mês</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Preço padrão da revenda</Label>
                <p>R$ {selectedResellerDetails?.billing?.defaultSalePrice || selectedReseller.clientMonthlyPrice || "99.99"}/mês</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Responsável</Label>
                <p className="font-medium">{selectedReseller.user?.name || "-"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="font-medium">{selectedReseller.user?.email || "-"}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Clientes da Revenda
            </CardTitle>
            <CardDescription>
              O detalhe do cliente agora tem URL própria. A liberação manual só aparece quando o cliente realmente precisa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cobertura até</TableHead>
                    <TableHead>Custo SaaS</TableHead>
                    <TableHead>Preço revenda</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedResellerClients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Nenhum cliente encontrado para esta revenda.
                      </TableCell>
                    </TableRow>
                  )}
                  {selectedResellerClients.map((client) => {
                    const coverageEnd = client.effectiveCoverageEnd
                      ? new Date(client.effectiveCoverageEnd)
                      : client.saasPaidUntil
                        ? new Date(client.saasPaidUntil)
                        : client.nextPaymentDate
                          ? new Date(client.nextPaymentDate)
                          : null;
                    const daysRemaining = coverageEnd
                      ? Math.max(0, Math.ceil((coverageEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                      : null;

                    return (
                      <TableRow key={client.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{client.user?.name || "Cliente da revenda"}</p>
                            <p className="text-xs text-muted-foreground">{client.user?.email || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant={client.status === "active" ? "default" : (client.status === "cancelled" ? "destructive" : "secondary")}>
                              {client.status}
                            </Badge>
                            {client.saasStatus && (
                              <span className="text-xs text-muted-foreground">Espelho SaaS: {client.saasStatus}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{coverageEnd ? coverageEnd.toLocaleDateString("pt-BR") : "-"}</p>
                            {daysRemaining !== null && (
                              <p className="text-xs text-muted-foreground">{daysRemaining} dia(s) restantes</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>R$ {Number(client.saasUnitPrice || selectedResellerDetails?.billing?.costPerClient || 0).toFixed(2)}</TableCell>
                        <TableCell>R$ {Number(client.salePrice || client.clientPrice || client.monthlyCost || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewClientDetails(selectedReseller.id, client.id)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Detalhes
                            </Button>
                            {client.needsManualRelease ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => grantResellerClientAccessMutation.mutate({
                                  resellerId: selectedReseller.id,
                                  clientId: client.id,
                                  activateReseller: selectedReseller.resellerStatus === "blocked",
                                })}
                                disabled={grantResellerClientAccessMutation.isPending}
                              >
                                {grantResellerClientAccessMutation.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="mr-2 h-4 w-4" />
                                )}
                                {selectedReseller.resellerStatus === "blocked" ? "Ativar + 30 dias" : "Liberar 30 dias"}
                              </Button>
                            ) : (
                              <Badge variant="outline">Cobertura OK</Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Revendedores White-Label</h2>
          <p className="text-muted-foreground">
            Gerencie revendedores que possuem marca própria no sistema
          </p>
        </div>
        <Dialog open={makeResellerDialogOpen} onOpenChange={setMakeResellerDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Tornar Revendedor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tornar Usuário em Revendedor</DialogTitle>
              <DialogDescription>
                Selecione um usuário para atribuir o plano de revenda (R$700/mês).
                O usuário poderá criar clientes white-label.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Selecione o Usuário</Label>
                <Select value={selectedUserForReseller} onValueChange={setSelectedUserForReseller}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um usuário..." />
                  </SelectTrigger>
                  <SelectContent>
                    {nonResellerUsers?.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-muted p-4 rounded-lg text-sm space-y-2">
                <p className="font-medium">O que acontece:</p>
                <ul className="list-disc list-inside text-muted-foreground">
                  <li>Usuário recebe assinatura do Plano Revenda</li>
                  <li>Pode personalizar logo, cores e domínio</li>
                  <li>Pode criar clientes por R$49,99/cada</li>
                  <li>Clientes veem apenas a marca do revendedor</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMakeResellerDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => selectedUserForReseller && makeResellerMutation.mutate(selectedUserForReseller)}
                disabled={!selectedUserForReseller || makeResellerMutation.isPending}
              >
                {makeResellerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Barra de busca */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por empresa, nome ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revendedores</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resellers?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ativos</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {resellers?.filter(r => r.isActive).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {resellers?.reduce((acc, r) => acc + (r.clientCount || 0), 0) || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Mensal Est.</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {((resellers?.length || 0) * 700 + (resellers?.reduce((acc, r) => acc + (r.clientCount || 0), 0) || 0) * 49.99).toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de revendedores */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Revendedores</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredResellers?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum revendedor encontrado</p>
              <p className="text-sm">Clique em "Tornar Revendedor" para adicionar</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Subdomínio</TableHead>
                  <TableHead>Clientes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResellers?.map((reseller) => (
                  <TableRow key={reseller.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {reseller.logoUrl ? (
                          <img src={reseller.logoUrl} alt="" className="h-8 w-8 rounded object-contain bg-muted" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{reseller.companyName}</p>
                          {reseller.customDomain && (
                            <p className="text-xs text-muted-foreground">{reseller.customDomain}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{reseller.user?.name || '-'}</p>
                        <p className="text-xs text-muted-foreground">{reseller.user?.email || '-'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {reseller.subdomain ? (
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {reseller.subdomain}.agentezap.com
                        </code>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{reseller.clientCount || 0} clientes</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={reseller.isActive ? "default" : "destructive"}>
                        {reseller.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetails(reseller)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Detalhes
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleResellerMutation.mutate({ 
                            id: reseller.id, 
                            active: !reseller.isActive 
                          })}
                        >
                          {reseller.isActive ? (
                            <Lock className="h-4 w-4 text-red-500" />
                          ) : (
                            <Check className="h-4 w-4 text-green-500" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Faturas dos Revendedores */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Faturas de Revendedores
              </CardTitle>
              <CardDescription>
                Marque faturas como pagas e reative clientes do revendedor automaticamente.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={invoiceStatusFilter} onValueChange={setInvoiceStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="overdue">Vencidas</SelectItem>
                  <SelectItem value="paid">Pagas</SelectItem>
                  <SelectItem value="all">Todas</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => refetchResellerInvoices()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingResellerInvoices ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Revendedor</TableHead>
                  <TableHead>Mês</TableHead>
                  <TableHead>Clientes</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!resellerInvoicesData?.invoices || resellerInvoicesData.invoices.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhuma fatura encontrada
                    </TableCell>
                  </TableRow>
                )}
                {resellerInvoicesData?.invoices?.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{invoice.reseller?.companyName || "Revendedor"}</p>
                        <p className="text-xs text-muted-foreground">{invoice.reseller?.user?.email || "-"}</p>
                      </div>
                    </TableCell>
                    <TableCell>{invoice.referenceMonth}</TableCell>
                    <TableCell>{invoice.activeClients || 0}</TableCell>
                    <TableCell>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('pt-BR') : '-'}</TableCell>
                    <TableCell className="font-medium">R$ {Number(invoice.totalAmount || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === 'paid' ? 'default' : (invoice.status === 'overdue' ? 'destructive' : 'secondary')}>
                        {invoice.status === 'paid' ? 'Pago' : invoice.status === 'overdue' ? 'Vencida' : 'Pendente'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {invoice.status !== 'paid' ? (
                        <Button
                          size="sm"
                          onClick={() => markResellerInvoicePaidMutation.mutate(invoice.id)}
                          disabled={markResellerInvoicePaidMutation.isPending}
                        >
                          {markResellerInvoicePaidMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3 mr-1" />
                          )}
                          Quitar Revenda
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {invoice.paidAt ? `Pago em ${new Date(invoice.paidAt).toLocaleDateString('pt-BR')}` : 'Pago'}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>


      {/* Informações sobre o sistema de revenda */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">💼 Sistema de Revenda White-Label</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Revendedores pagam R$700/mês pelo plano de revenda</p>
          <p>• Cada cliente criado custa R$49,99/mês para o revendedor</p>
          <p>• Revendedores podem definir preço de venda para seus clientes</p>
          <p>• Clientes do revendedor veem apenas a marca personalizada</p>
          <p>• Subdomínio ou domínio próprio para cada revendedor</p>
        </CardContent>
      </Card>
    </div>
  );
}

type AdminSystemConfig = {
  mistral_api_key: string;
  mistral_api_keys?: string[];
  mistral_model?: string;
  mistral_chat_enabled?: boolean;
  pix_key?: string;
  pix_manual_enabled?: boolean;
  zai_api_key?: string;
  llm_provider?: string;
  llm_provider_order?: string[];
  groq_api_key?: string;
  groq_model?: string;
  nvidia_configured?: boolean;
  nvidia_model?: string;
  nvidia_models?: string[];
  openrouter_api_key?: string;
  openrouter_model?: string;
  openrouter_models?: string[];
  openrouter_provider?: string;
};

type AdminLLMProvider = "mistral" | "nvidia" | "openrouter" | "groq";

const DEFAULT_ADMIN_PROVIDER_ORDER: AdminLLMProvider[] = ["mistral", "nvidia", "openrouter", "groq"];

const DEFAULT_ADMIN_NVIDIA_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1";

const DEFAULT_ADMIN_NVIDIA_MODELS = [
  { value: "nvidia/llama-3.3-nemotron-super-49b-v1", label: "NVIDIA Nemotron Super 49B" },
  { value: "nvidia/nemotron-3-super-120b-a12b", label: "NVIDIA Nemotron 3 Super 120B" },
  { value: "nvidia/nemotron-3-ultra-550b-a55b", label: "NVIDIA Nemotron 3 Ultra 550B" },
];

const KNOWN_ZERO_PRICE_OPENROUTER_MODELS = [] as const;

const DEFAULT_ADMIN_OPENROUTER_MODELS = [
  "openai/gpt-oss-20b:free",
  "google/gemma-4-31b-it:free",
  "openai/gpt-oss-120b:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "openrouter/free",
];

function isFreeOpenrouterModel(model: string): boolean {
  const id = String(model || "").trim().toLowerCase();
  return (
    id === "openrouter/free" ||
    (KNOWN_ZERO_PRICE_OPENROUTER_MODELS as readonly string[]).includes(id) ||
    (id.includes("/") && id.endsWith(":free"))
  );
}

function hasZeroOpenrouterTextPricing(model: { pricing?: Record<string, unknown> | null }): boolean {
  const pricing = model.pricing || {};
  return String(pricing.prompt ?? "") === "0" && String(pricing.completion ?? "") === "0";
}

function normalizeAdminProviderOrder(config?: Partial<AdminSystemConfig>): AdminLLMProvider[] {
  const values = [
    ...(Array.isArray(config?.llm_provider_order) ? config!.llm_provider_order : []),
    config?.llm_provider || "",
    ...DEFAULT_ADMIN_PROVIDER_ORDER,
  ];
  const providers: AdminLLMProvider[] = [];
  for (const value of values) {
    const provider = String(value || "").trim().toLowerCase() as AdminLLMProvider;
    if (
      (provider === "mistral" || provider === "nvidia" || provider === "openrouter" || provider === "groq") &&
      !providers.includes(provider)
    ) {
      providers.push(provider);
    }
  }
  return providers;
}

function resolveAdminChatProviderOrder(
  providerOrder: AdminLLMProvider[],
  mistralChatEnabled: boolean,
): AdminLLMProvider[] {
  const filteredOrder = mistralChatEnabled
    ? providerOrder
    : providerOrder.filter((provider) => provider !== "mistral");

  if (filteredOrder.length > 0) {
    return filteredOrder;
  }

  return DEFAULT_ADMIN_PROVIDER_ORDER.filter((provider) =>
    mistralChatEnabled || provider !== "mistral",
  );
}

function normalizeAdminOpenrouterModels(config?: Partial<AdminSystemConfig>): string[] {
  const values = [
    ...(Array.isArray(config?.openrouter_models) ? config!.openrouter_models : []),
    config?.openrouter_model || "",
    ...DEFAULT_ADMIN_OPENROUTER_MODELS,
  ];
  return values
    .map((model) => String(model || "").trim())
    .filter((model, index, array) => model && isFreeOpenrouterModel(model) && array.indexOf(model) === index);
}

function normalizeAdminNvidiaModels(config?: Partial<AdminSystemConfig>): string[] {
  const values = [
    ...(Array.isArray(config?.nvidia_models) ? config!.nvidia_models : []),
    config?.nvidia_model || "",
    ...DEFAULT_ADMIN_NVIDIA_MODELS.map((model) => model.value),
  ];
  return values
    .map((model) => String(model || "").trim())
    .filter((model, index, array) => model.startsWith("nvidia/") && array.indexOf(model) === index);
}

type MistralKeyValidationStatus = "valid" | "invalid" | "rate_limited" | "error" | "empty";

type MistralKeyValidationResult = {
  index: number;
  status: MistralKeyValidationStatus;
  statusCode?: number;
  message?: string;
  keyLength?: number;
  retryAfterMs?: number;
};

function normalizeMistralKeyInputs(config?: AdminSystemConfig): string[] {
  const keys = [
    ...(Array.isArray(config?.mistral_api_keys) ? config!.mistral_api_keys : []),
    config?.mistral_api_key || "",
  ]
    .map((key) => String(key || "").trim())
    .filter((key, index, array) => key && array.indexOf(key) === index);
  return keys.length > 0 ? keys : [""];
}

function getMistralKeyStatusMeta(status?: MistralKeyValidationStatus) {
  switch (status) {
    case "valid":
      return {
        label: "Valida",
        icon: CheckCircle,
        badgeClassName: "border-emerald-500 bg-emerald-50 text-emerald-700",
        inputClassName: "border-emerald-500 focus-visible:ring-emerald-500",
        textClassName: "text-emerald-700",
      };
    case "invalid":
      return {
        label: "Invalida",
        icon: XCircle,
        badgeClassName: "border-red-500 bg-red-50 text-red-700",
        inputClassName: "border-red-500 focus-visible:ring-red-500",
        textClassName: "text-red-700",
      };
    case "rate_limited":
      return {
        label: "Limite temporario",
        icon: AlertTriangle,
        badgeClassName: "border-amber-500 bg-amber-50 text-amber-700",
        inputClassName: "border-amber-500 focus-visible:ring-amber-500",
        textClassName: "text-amber-700",
      };
    case "error":
      return {
        label: "Erro ao testar",
        icon: AlertTriangle,
        badgeClassName: "border-slate-400 bg-slate-50 text-slate-700",
        inputClassName: "border-slate-400 focus-visible:ring-slate-400",
        textClassName: "text-slate-700",
      };
    case "empty":
      return {
        label: "Sem chave",
        icon: AlertTriangle,
        badgeClassName: "border-slate-300 bg-slate-50 text-slate-600",
        inputClassName: "",
        textClassName: "text-muted-foreground",
      };
    default:
      return {
        label: "Nao testada",
        icon: AlertTriangle,
        badgeClassName: "border-slate-300 bg-slate-50 text-slate-600",
        inputClassName: "",
        textClassName: "text-muted-foreground",
      };
  }
}

function ConfigManager({ config }: { config: AdminSystemConfig | undefined }) {
  const { toast } = useToast();
  const [mistralKeys, setMistralKeys] = useState<string[]>(() => normalizeMistralKeyInputs(config));
  const [mistralKeyStatuses, setMistralKeyStatuses] = useState<Record<number, MistralKeyValidationResult>>({});
  const [mistralModel, setMistralModel] = useState(config?.mistral_model || "mistral-medium-latest");
  const [mistralChatEnabled, setMistralChatEnabled] = useState(config?.mistral_chat_enabled ?? true);
  const [pixKey, setPixKey] = useState(config?.pix_key || "");
  const [pixManualEnabled, setPixManualEnabled] = useState(config?.pix_manual_enabled ?? true);
  const [zaiKey, setZaiKey] = useState(config?.zai_api_key || "");
  const [providerOrder, setProviderOrder] = useState<AdminLLMProvider[]>(() => normalizeAdminProviderOrder(config));
  const [groqKey, setGroqKey] = useState(config?.groq_api_key || "");
  const [groqModel, setGroqModel] = useState(config?.groq_model || "openai/gpt-oss-20b");
  const [nvidiaFallbackModels, setNvidiaFallbackModels] = useState<string[]>(() => normalizeAdminNvidiaModels(config));
  const [nvidiaModel, setNvidiaModel] = useState(() => normalizeAdminNvidiaModels(config)[0] || DEFAULT_ADMIN_NVIDIA_MODEL);
  const [openrouterKey, setOpenrouterKey] = useState(config?.openrouter_api_key || "");
  const [openrouterFallbackModels, setOpenrouterFallbackModels] = useState<string[]>(() => normalizeAdminOpenrouterModels(config));
  const [openrouterModel, setOpenrouterModel] = useState(() => normalizeAdminOpenrouterModels(config)[0] || DEFAULT_ADMIN_OPENROUTER_MODELS[0]);
  const [openrouterProvider, setOpenrouterProvider] = useState(config?.openrouter_provider || "auto");
  const [showMistralKey, setShowMistralKey] = useState(false);
  const [showZaiKey, setShowZaiKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false);
  const [testingMistral, setTestingMistral] = useState(false);
  const [testingMistralIndex, setTestingMistralIndex] = useState<number | null>(null);
  const [testingGroq, setTestingGroq] = useState(false);
  const [testingOpenrouter, setTestingOpenrouter] = useState(false);
  
  // 🆕 Estado para modelos dinâmicos do OpenRouter
  const [openrouterModels, setOpenrouterModels] = useState<Array<{id: string; name: string; description?: string; pricing?: any; context_length?: number; supported_parameters?: string[]}>>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);
  
  const chatProviderOrder = resolveAdminChatProviderOrder(providerOrder, mistralChatEnabled);
  const llmProvider = chatProviderOrder[0] || "nvidia";

  // Sincronizar estado com config quando carregar
  useEffect(() => {
    if (config) {
      setMistralKeys(normalizeMistralKeyInputs(config));
      setMistralKeyStatuses({});
      setMistralModel(config.mistral_model || "mistral-medium-latest");
      setMistralChatEnabled(config.mistral_chat_enabled ?? true);
      setPixKey(config.pix_key || "");
      setPixManualEnabled(config.pix_manual_enabled ?? true);
      setZaiKey(config.zai_api_key || "");
      setProviderOrder(normalizeAdminProviderOrder(config));
      setGroqKey(config.groq_api_key || "");
      setGroqModel(config.groq_model || "openai/gpt-oss-20b");
      const nvidiaModels = normalizeAdminNvidiaModels(config);
      setNvidiaFallbackModels(nvidiaModels);
      setNvidiaModel(nvidiaModels[0] || DEFAULT_ADMIN_NVIDIA_MODEL);
      setOpenrouterKey(config.openrouter_api_key || "");
      const models = normalizeAdminOpenrouterModels(config);
      setOpenrouterFallbackModels(models);
      setOpenrouterModel(models[0] || DEFAULT_ADMIN_OPENROUTER_MODELS[0]);
      setOpenrouterProvider(config.openrouter_provider || "auto");
    }
  }, [config]);
  
  // Carregar modelos OpenRouter gratuitos recomendados ao abrir o Admin.
  useEffect(() => {
    fetchOpenRouterModels();
  }, []);
  
  const fetchOpenRouterModels = async () => {
    setLoadingModels(true);
    try {
      const response = await apiRequest("GET", "/api/admin/openrouter/models");
      const data = await response.json();
      if (data.models) {
        setOpenrouterModels(data.models);
      }
    } catch (error: any) {
      console.error("Error fetching OpenRouter models:", error);
      toast({ title: "Erro ao carregar modelos", description: error.message, variant: "destructive" });
    } finally {
      setLoadingModels(false);
    }
  };

  const normalizedMistralKeys = mistralKeys
    .map((key) => key.trim())
    .filter((key, index, array) => key && array.indexOf(key) === index);

  const updateMistralKey = (index: number, value: string) => {
    setMistralKeys((current) => current.map((key, keyIndex) => keyIndex === index ? value : key));
    setMistralKeyStatuses((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
  };

  const addMistralKey = () => {
    setMistralKeys((current) => [...current, ""]);
    setMistralKeyStatuses({});
  };

  const removeMistralKey = (index: number) => {
    setMistralKeys((current) => {
      const next = current.filter((_, keyIndex) => keyIndex !== index);
      return next.length > 0 ? next : [""];
    });
    setMistralKeyStatuses({});
  };

  const moveProvider = (provider: AdminLLMProvider, direction: -1 | 1) => {
    setProviderOrder((current) => {
      const index = current.indexOf(provider);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const moveOpenrouterFallbackModel = (index: number, direction: -1 | 1) => {
    setOpenrouterFallbackModels((current) => {
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      setOpenrouterModel(next[0] || openrouterModel);
      return next;
    });
  };

  const moveNvidiaFallbackModel = (index: number, direction: -1 | 1) => {
    setNvidiaFallbackModels((current) => {
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      setNvidiaModel(next[0] || nvidiaModel);
      return next;
    });
  };

  const addNvidiaFallbackModel = (model: string) => {
    const value = String(model || "").trim();
    if (!value.startsWith("nvidia/")) return;
    setNvidiaFallbackModels((current) => current.includes(value) ? current : [...current, value]);
  };

  const removeNvidiaFallbackModel = (index: number) => {
    setNvidiaFallbackModels((current) => {
      const next = current.filter((_, modelIndex) => modelIndex !== index);
      const normalized = next.length > 0 ? next : [DEFAULT_ADMIN_NVIDIA_MODEL];
      setNvidiaModel(normalized[0]);
      return normalized;
    });
  };

  const addOpenrouterFallbackModel = (model: string) => {
    const value = String(model || "").trim();
    if (!value || !isFreeOpenrouterModel(value)) return;
    setOpenrouterFallbackModels((current) => current.includes(value) ? current : [...current, value]);
  };

  const removeOpenrouterFallbackModel = (index: number) => {
    setOpenrouterFallbackModels((current) => {
      const next = current.filter((_, modelIndex) => modelIndex !== index);
      const normalized = next.length > 0 ? next : [DEFAULT_ADMIN_OPENROUTER_MODELS[0]];
      setOpenrouterModel(normalized[0]);
      return normalized;
    });
  };

  const testMistralKey = async () => {
    setTestingMistral(true);
    try {
      const response = await apiRequest("POST", "/api/admin/test-mistral", {
        mistral_api_keys: mistralKeys.map((key) => key.trim()),
      });
      const data = await response.json();
      if (Array.isArray(data.results)) {
        const nextStatuses: Record<number, MistralKeyValidationResult> = {};
        for (const result of data.results) {
          if (typeof result?.index === "number" && result.status) {
            nextStatuses[result.index] = result;
          }
        }
        setMistralKeyStatuses(nextStatuses);
      }

      const validCount = Number(data.validCount || 0);
      const invalidCount = Number(data.invalidCount || 0);
      const rateLimitedCount = Number(data.rateLimitedCount || 0);
      const errorCount = Number(data.errorCount || 0);
      const summary = [
        `${validCount} valida(s)`,
        invalidCount ? `${invalidCount} invalida(s)` : "",
        rateLimitedCount ? `${rateLimitedCount} com limite temporario` : "",
        errorCount ? `${errorCount} com erro` : "",
      ].filter(Boolean).join(" | ");
      if (data.success) {
        toast({ title: "Teste Mistral concluido", description: summary || "Pelo menos uma chave esta valida." });
      } else if (rateLimitedCount > 0) {
        toast({ title: "Limite temporario nas chaves", description: summary || data.message });
      } else {
        toast({ title: "Nenhuma chave Mistral valida", description: summary || data.error, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Erro ao testar chaves Mistral", description: error.message, variant: "destructive" });
    } finally {
      setTestingMistral(false);
    }
  };

  const testMistralKeyAt = async (index: number) => {
    const rawKey = String(mistralKeys[index] || "").trim();
    if (!rawKey) {
      setMistralKeyStatuses((current) => ({
        ...current,
        [index]: { index, status: "empty", message: "Informe a chave antes de testar." },
      }));
      return;
    }

    setTestingMistralIndex(index);
    try {
      const response = await apiRequest("POST", "/api/admin/test-mistral", {
        mistral_api_key: rawKey,
        index,
      });
      const data = await response.json();
      const result = Array.isArray(data.results)
        ? data.results.find((item: MistralKeyValidationResult) => item.index === index)
        : null;
      if (result?.status) {
        setMistralKeyStatuses((current) => ({ ...current, [index]: result }));
      }

      if (data.success) {
        toast({ title: `Chave ${index + 1} valida`, description: result?.message || "A chave respondeu corretamente." });
      } else {
        toast({
          title: `Chave ${index + 1} nao esta valida`,
          description: result?.message || data.error || data.message,
          variant: result?.status === "rate_limited" ? "default" : "destructive",
        });
      }
    } catch (error: any) {
      toast({ title: `Erro ao testar chave ${index + 1}`, description: error.message, variant: "destructive" });
    } finally {
      setTestingMistralIndex(null);
    }
  };

  const testGroqKey = async () => {
    setTestingGroq(true);
    try {
      const response = await apiRequest("POST", "/api/admin/test-groq");
      const data = await response.json();
      if (data.success) {
        toast({ title: "✅ Chave Groq válida!", description: `Modelo: ${data.model}` });
      } else {
        toast({ title: "❌ Chave Groq inválida", description: data.error, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "❌ Erro ao testar chave", description: error.message, variant: "destructive" });
    } finally {
      setTestingGroq(false);
    }
  };

  const testOpenrouterKey = async () => {
    setTestingOpenrouter(true);
    const sanitizedOpenrouterModels = normalizeAdminOpenrouterModels({
      openrouter_models: openrouterFallbackModels,
      openrouter_model: openrouterModel,
    });
    try {
      const response = await apiRequest("POST", "/api/admin/test-openrouter", {
        openrouter_api_key: openrouterKey,
        openrouter_model: sanitizedOpenrouterModels[0],
        openrouter_models: sanitizedOpenrouterModels,
        openrouter_provider: openrouterProvider,
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: "Chave OpenRouter valida", description: `Modelo: ${data.model}` });
      } else {
        toast({ title: "Chave OpenRouter nao esta valida", description: data.error, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Erro ao testar chave", description: error.message, variant: "destructive" });
    } finally {
      setTestingOpenrouter(false);
    }
  };

  const updateConfigMutation = useMutation({
    mutationFn: async (data: { mistral_api_key: string; mistral_api_keys: string[]; mistral_model: string; mistral_chat_enabled: boolean; pix_key: string; pix_manual_enabled: boolean; zai_api_key: string; llm_provider: string; llm_provider_order: string[]; groq_api_key: string; groq_model: string; nvidia_model: string; nvidia_models: string[]; openrouter_api_key: string; openrouter_model: string; openrouter_models: string[]; openrouter_provider: string }) => {
      return await apiRequest("PUT", "/api/admin/config", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config"] });
      toast({ title: "Configuração atualizada com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar configuração", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 🔐 VALIDAÇÃO: Alertar se API key não está configurada para o provider selecionado
    if (llmProvider === "nvidia" && !config?.nvidia_configured) {
      toast({
        title: "Atenção: NVIDIA sem chave",
        description: "A primeira opção da ordem não está configurada. O sistema vai tentar a próxima etapa.",
        variant: "destructive"
      });
    } else if (llmProvider === "openrouter" && (!openrouterKey || openrouterKey.length < 20)) {
      toast({ 
        title: "⚠️ Atenção: API Key não configurada", 
        description: "O simulador e agentes não funcionarão sem uma chave de API do OpenRouter válida.",
        variant: "destructive" 
      });
    } else if (llmProvider === "groq" && (!groqKey || groqKey.length < 20)) {
      toast({ 
        title: "⚠️ Atenção: API Key não configurada", 
        description: "O simulador e agentes não funcionarão sem uma chave de API do Groq válida.",
        variant: "destructive" 
      });
    } else if (llmProvider === "mistral" && normalizedMistralKeys.length === 0) {
      toast({ 
        title: "⚠️ Atenção: API Key não configurada", 
        description: "O simulador e agentes não funcionarão sem uma chave de API do Mistral válida.",
        variant: "destructive" 
      });
    }
    
    const sanitizedOpenrouterModels = normalizeAdminOpenrouterModels({
      openrouter_models: openrouterFallbackModels,
      openrouter_model: openrouterModel,
    });
    const sanitizedNvidiaModels = normalizeAdminNvidiaModels({
      nvidia_models: nvidiaFallbackModels,
      nvidia_model: nvidiaModel,
    });

    const effectiveProviderOrder = resolveAdminChatProviderOrder(providerOrder, mistralChatEnabled);

    updateConfigMutation.mutate({ 
      mistral_api_key: normalizedMistralKeys[0] || "",
      mistral_api_keys: normalizedMistralKeys,
      mistral_model: mistralModel,
      mistral_chat_enabled: mistralChatEnabled,
      pix_key: pixKey, 
      pix_manual_enabled: pixManualEnabled,
      zai_api_key: zaiKey,
      llm_provider: effectiveProviderOrder[0] || "nvidia",
      llm_provider_order: effectiveProviderOrder,
      groq_api_key: groqKey,
      groq_model: groqModel,
      nvidia_model: sanitizedNvidiaModels[0],
      nvidia_models: sanitizedNvidiaModels,
      openrouter_api_key: openrouterKey,
      openrouter_model: sanitizedOpenrouterModels[0],
      openrouter_models: sanitizedOpenrouterModels,
      openrouter_provider: openrouterProvider
    });
  };

  // Lista de modelos Groq disponíveis
  const groqModels = [
    { value: "openai/gpt-oss-20b", label: "GPT-OSS 20B (Recomendado ~$6/mês)" },
    { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B (Maior)" },
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
    { value: "gemma2-9b-it", label: "Gemma 2 9B IT" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  ];
  
  // 🆕 Lista de modelos Mistral VALIDADOS POR STRESS TEST (2 minutos, 4128 requisições)
  // ⚠️ IMPORTANTE: Apenas estes 4 modelos funcionam com rate limit aceitável!
  // Outros modelos (mistral-small-*, ministral-*, open-*, etc) tem 100% rate limit
  const mistralModels = [
    // ✅ MODELOS VALIDADOS (Stress Test - 2 min, 4128 req)
    // 🥇 Tier 1 - RECOMENDADOS (Fila inteligente usa estes em rotação)
    { 
      value: "mistral-medium-latest", 
      label: "🥇 Mistral Medium Latest (10.5 req/min) ✅ RECOMENDADO",
      rateLimit: "10.5 req/min",
      delay: 6,
      successRate: "22.6%"
    },
    { 
      value: "mistral-medium-2312", 
      label: "🥈 Mistral Medium 2312 (6 req/min) ✅ Fallback #1",
      rateLimit: "6 req/min",
      delay: 10,
      successRate: "13.0%"
    },
    { 
      value: "mistral-medium", 
      label: "🥉 Mistral Medium (6 req/min) ✅ Fallback #2",
      rateLimit: "6 req/min",
      delay: 10,
      successRate: "12.8%"
    },
    { 
      value: "mistral-large-2411", 
      label: "⚡ Mistral Large 2411 (3 req/min) ✅ Fallback #3",
      rateLimit: "3 req/min",
      delay: 20,
      successRate: "6.3%"
    },
    // 🔶 Tier 2 - Outros Large (menos testados, podem funcionar)
    { 
      value: "mistral-large-latest", 
      label: "🔶 Mistral Large Latest (pode ter limite baixo)",
      rateLimit: "~3 req/min",
      delay: 20,
      successRate: "N/A"
    },
    { 
      value: "mistral-large-2407", 
      label: "🔶 Mistral Large 2407 (pode ter limite baixo)",
      rateLimit: "~3 req/min",
      delay: 20,
      successRate: "N/A"
    },
    // ⛔ BLOQUEADOS - NÃO USAR (100% rate limit nos testes)
    // Estes modelos foram testados e tem rate limit muito agressivo
    // mistral-small-*, ministral-*, open-mistral-*, pixtral-*, codestral-*
  ];
  
  // Lista de providers do OpenRouter
  const openrouterProviders = [
    { value: "auto", label: "Automatico" },
    { value: "chutes", label: "Chutes ($0.02-0.10/M)" },
    { value: "hyperbolic", label: "Hyperbolic ($0.04-0.12/M)" },
    { value: "deepinfra", label: "DeepInfra ($0.05-0.15/M)" },
    { value: "together", label: "Together AI ($0.10-0.30/M)" },
    { value: "fireworks", label: "Fireworks - Alta performance" },
    { value: "lepton", label: "Lepton - Baixa latencia" },
    { value: "novita", label: "Novita AI - Alternativa economica" },
  ];

  // Lista de modelos OpenRouter gratuitos recomendados, usada se a API nao carregar.
  const defaultOpenrouterModels = [
    { value: "openai/gpt-oss-20b:free", label: "GPT-OSS 20B (gratis)" },
    { value: "google/gemma-4-31b-it:free", label: "Google Gemma 4 31B (gratis)" },
    { value: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B (gratis)" },
    { value: "nvidia/nemotron-nano-9b-v2:free", label: "NVIDIA Nemotron Nano 9B V2 (gratis)" },
    { value: "nvidia/nemotron-3-nano-30b-a3b:free", label: "NVIDIA Nemotron 3 Nano 30B (gratis)" },
    { value: "openrouter/free", label: "OpenRouter Free Router (gratis)" },
  ];

  const openrouterModelOptions = openrouterModels.length > 0
    ? openrouterModels
        .filter((model) => isFreeOpenrouterModel(model.id) || hasZeroOpenrouterTextPricing(model))
        .map((model) => ({
          value: model.id,
          label: `${model.name}${model.name.toLowerCase().includes("free") || hasZeroOpenrouterTextPricing(model) ? "" : " (gratis)"}`,
        }))
    : defaultOpenrouterModels;

  const selectedNvidiaModelLabel =
    DEFAULT_ADMIN_NVIDIA_MODELS.find((model) => model.value === nvidiaFallbackModels[0])?.label ||
    nvidiaFallbackModels[0] ||
    nvidiaModel;

  const displayProviderOrder = mistralChatEnabled
    ? providerOrder
    : [...chatProviderOrder, ...providerOrder.filter((provider) => provider === "mistral")];

  const providerRows: Array<{ id: AdminLLMProvider; label: string; detail: string; configured: boolean }> = displayProviderOrder.map((provider) => {
    if (provider === "mistral") {
      return {
        id: provider,
        label: "Mistral",
        detail: mistralChatEnabled
          ? `${normalizedMistralKeys.length} chave(s) configurada(s)`
          : `${normalizedMistralKeys.length} chave(s) para transcricao de audio`,
        configured: normalizedMistralKeys.length > 0,
      };
    }
    if (provider === "nvidia") {
      return {
        id: provider,
        label: "NVIDIA",
        detail: config?.nvidia_configured ? `${nvidiaFallbackModels.length} modelo(s) na lista` : "Sem chave configurada",
        configured: Boolean(config?.nvidia_configured),
      };
    }
    if (provider === "openrouter") {
      return {
        id: provider,
        label: "OpenRouter",
        detail: `${openrouterFallbackModels.length} modelo(s) na lista`,
        configured: openrouterKey.trim().length > 20,
      };
    }
    return {
      id: provider,
      label: "Groq",
      detail: groqModel,
      configured: groqKey.trim().length > 20,
    };
  });

  return (
    <>
    <Card data-testid="card-system-config">
      <CardHeader>
        <CardTitle>Configurações do Sistema</CardTitle>
        <CardDescription>Chave API Mistral, Groq, chave PIX e outras configurações</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
            <div>
              <Label className="text-base font-semibold">Ordem de fallback da IA</Label>
              <p className="text-sm text-muted-foreground">
                O sistema tenta de cima para baixo e passa para a próxima etapa quando a anterior falhar.
              </p>
            </div>
            <div className="space-y-2" data-testid="llm-provider-order">
              {providerRows.map((row, index) => {
                const providerMoveDisabled = !mistralChatEnabled && row.id === "mistral";
                return (
                <div key={row.id} className="flex flex-col gap-2 rounded-md border bg-background p-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="min-w-8 justify-center">{index + 1}</Badge>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{row.label}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "whitespace-nowrap",
                            row.configured ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-amber-500 bg-amber-50 text-amber-700",
                          )}
                        >
                          {row.configured ? "Configurado" : "Pendente"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{row.detail}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => moveProvider(row.id, -1)}
                      disabled={providerMoveDisabled || index === 0}
                      aria-label={`Subir ${row.label}`}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => moveProvider(row.id, 1)}
                      disabled={providerMoveDisabled || index === providerRows.length - 1}
                      aria-label={`Descer ${row.label}`}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          <div className="p-4 border rounded-lg border-blue-200 bg-blue-50/50 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-blue-700" />
                <span className="text-sm font-semibold text-blue-700">NVIDIA - Modelos Nemotron</span>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="nvidiaModel">Adicionar modelo NVIDIA</Label>
                <div className="flex flex-col gap-2 md:flex-row">
                  <select
                    id="nvidiaModel"
                    value={nvidiaModel}
                    onChange={(e) => setNvidiaModel(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="select-nvidia-model"
                  >
                    {DEFAULT_ADMIN_NVIDIA_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => addNvidiaFallbackModel(nvidiaModel)}
                    className="shrink-0"
                    data-testid="button-add-nvidia-model"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {config?.nvidia_configured
                    ? `Primeiro da lista: ${selectedNvidiaModelLabel}.`
                    : "Configure a chave NVIDIA no servidor para ativar esta etapa da fila."}
                </p>
              </div>

              <div className="space-y-2" data-testid="nvidia-model-order">
                {nvidiaFallbackModels.map((model, index) => (
                  <div key={model} className="flex flex-col gap-2 rounded-md border bg-background p-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="min-w-8 justify-center">{index + 1}</Badge>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {DEFAULT_ADMIN_NVIDIA_MODELS.find((option) => option.value === model)?.label || model}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{model}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => moveNvidiaFallbackModel(index, -1)}
                        disabled={index === 0}
                        aria-label="Subir modelo NVIDIA"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => moveNvidiaFallbackModel(index, 1)}
                        disabled={index === nvidiaFallbackModels.length - 1}
                        aria-label="Descer modelo NVIDIA"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeNvidiaFallbackModel(index)}
                        disabled={nvidiaFallbackModels.length <= 1}
                        aria-label="Remover modelo NVIDIA"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          <div className="p-4 border rounded-lg border-green-200 bg-green-50/50 space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="groqKey">Groq API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="groqKey"
                      type={showGroqKey ? "text" : "password"}
                      value={groqKey}
                      onChange={(e) => setGroqKey(e.target.value)}
                      placeholder="gsk_..."
                      data-testid="input-groq-key"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowGroqKey(!showGroqKey)}
                    >
                      {showGroqKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={testGroqKey}
                    disabled={testingGroq || !groqKey}
                  >
                    {testingGroq ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Testar
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="groqModel">Modelo Groq</Label>
                <select
                  id="groqModel"
                  value={groqModel}
                  onChange={(e) => setGroqModel(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="select-groq-model"
                >
                  {groqModels.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-muted-foreground">
                  Modelo usado pelos agentes IA. GPT-OSS 20B é o mais econômico.
                </p>
              </div>
            </div>
          

          <div className="p-4 border rounded-lg border-purple-200 bg-purple-50/50 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-purple-700" />
                <span className="text-sm font-semibold text-purple-700">OpenRouter - Múltiplos Modelos e Providers</span>
              </div>
              
              {/* API Key */}
              <div className="grid gap-2">
                <Label htmlFor="openrouterKey">OpenRouter API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="openrouterKey"
                      type={showOpenrouterKey ? "text" : "password"}
                      value={openrouterKey}
                      onChange={(e) => setOpenrouterKey(e.target.value)}
                      placeholder="sk-or-v1-..."
                      data-testid="input-openrouter-key"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowOpenrouterKey(!showOpenrouterKey)}
                    >
                      {showOpenrouterKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={testOpenrouterKey}
                    disabled={testingOpenrouter || !openrouterKey}
                  >
                    {testingOpenrouter ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Testar
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Crie sua chave em <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline">openrouter.ai/keys</a>
                </p>
              </div>

              {/* Provider Selection */}
              <div className="grid gap-2">
                <Label htmlFor="openrouterProvider">Provider OpenRouter</Label>
                <select
                  id="openrouterProvider"
                  value={openrouterProvider}
                  onChange={(e) => setOpenrouterProvider(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="select-openrouter-provider"
                >
                  {openrouterProviders.map((provider) => (
                    <option key={provider.value} value={provider.value}>
                      {provider.label}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-muted-foreground">
                  Use automatico para deixar o OpenRouter escolher ou fixe um provider especifico.
                </p>
              </div>

              <div className="grid gap-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-end">
                  <div className="grid flex-1 gap-2">
                    <Label htmlFor="openrouterModel">Adicionar modelo OpenRouter</Label>
                    <select
                      id="openrouterModel"
                      value={openrouterModel}
                      onChange={(e) => setOpenrouterModel(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="select-openrouter-model"
                    >
                      {(showAllModels ? openrouterModelOptions : openrouterModelOptions.slice(0, 30)).map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => addOpenrouterFallbackModel(openrouterModel)}>
                      <Plus className="h-4 w-4" />
                      Adicionar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={fetchOpenRouterModels}
                      disabled={loadingModels}
                    >
                      {loadingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Atualizar
                    </Button>
                  </div>
                </div>

                {openrouterModelOptions.length > 30 && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setShowAllModels(!showAllModels)}
                    className="h-6 w-fit p-0 text-xs"
                  >
                    {showAllModels ? "Mostrar menos modelos" : `Ver todos os ${openrouterModelOptions.length} modelos`}
                  </Button>
                )}

                <div className="space-y-2" data-testid="openrouter-fallback-models">
                  {openrouterFallbackModels.map((model, index) => {
                    const details = openrouterModels.find((item) => item.id === model);
                    return (
                      <div key={model} className="flex flex-col gap-2 rounded-md border bg-background p-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="min-w-8 justify-center">{index + 1}</Badge>
                            <span className="font-medium">{details?.name || model}</span>
                            {isFreeOpenrouterModel(model) && (
                              <Badge variant="outline" className="border-emerald-500 bg-emerald-50 text-emerald-700">Gratis</Badge>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{model}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button type="button" variant="outline" size="icon" onClick={() => moveOpenrouterFallbackModel(index, -1)} disabled={index === 0} aria-label={`Subir modelo ${index + 1}`}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="outline" size="icon" onClick={() => moveOpenrouterFallbackModel(index, 1)} disabled={index === openrouterFallbackModels.length - 1} aria-label={`Descer modelo ${index + 1}`}>
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="outline" size="icon" onClick={() => removeOpenrouterFallbackModel(index)} disabled={openrouterFallbackModels.length === 1} aria-label={`Remover modelo ${index + 1}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-sm text-muted-foreground">
                  Somente modelos gratuitos entram nesta lista. Eles podem ter limite diario baixo; a ordem acima e usada quando o fallback chega ao OpenRouter.
                </p>
              </div>
            </div>
          

          <div className="p-4 border rounded-lg border-orange-200 bg-orange-50/50 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🔥</span>
                <span className="text-sm font-semibold text-orange-700">Mistral AI - Modelos 2026</span>
              </div>

              <div className="flex flex-col gap-3 rounded-md border bg-background p-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <Label htmlFor="mistral-chat-enabled" className="font-medium">
                    Usar Mistral nas respostas do agente
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {mistralChatEnabled
                      ? "Ligado: Mistral tambem entra na fila de respostas."
                      : "Desligado: as chaves ficam reservadas para transcrever audios."}
                  </p>
                </div>
                <Switch
                  id="mistral-chat-enabled"
                  checked={mistralChatEnabled}
                  onCheckedChange={setMistralChatEnabled}
                  data-testid="switch-mistral-chat-enabled"
                />
              </div>
              
              {/* API Keys */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Chaves Mistral</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addMistralKey}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={testMistralKey}
                      disabled={testingMistral || normalizedMistralKeys.length === 0}
                    >
                      {testingMistral ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      Testar
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {mistralKeys.map((key, index) => {
                    const status = mistralKeyStatuses[index];
                    const statusMeta = getMistralKeyStatusMeta(status?.status);
                    const StatusIcon = statusMeta?.icon;

                    return (
                      <div key={index} className="space-y-1">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                          <div className="relative flex-1">
                            <Input
                              id={index === 0 ? "mistralKey" : `mistralKey-${index + 1}`}
                              type={showMistralKey ? "text" : "password"}
                              value={key}
                              onChange={(e) => updateMistralKey(index, e.target.value)}
                              placeholder={`Chave ${index + 1}`}
                              data-testid={`input-mistral-key-${index + 1}`}
                              className={cn("pr-10", statusMeta?.inputClassName)}
                            />
                            {index === 0 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                onClick={() => setShowMistralKey(!showMistralKey)}
                              >
                                {showMistralKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            )}
                          </div>
                          {statusMeta && (
                            <Badge
                              variant="outline"
                              className={cn("min-w-[132px] justify-center gap-1 whitespace-nowrap py-1", statusMeta.badgeClassName)}
                              data-testid={`badge-mistral-key-status-${index + 1}`}
                            >
                              {StatusIcon && <StatusIcon className="h-3.5 w-3.5" />}
                              {statusMeta.label}
                            </Badge>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => testMistralKeyAt(index)}
                            disabled={testingMistral || testingMistralIndex === index || !key.trim()}
                            data-testid={`button-test-mistral-key-${index + 1}`}
                          >
                            {testingMistralIndex === index ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            Testar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0"
                            onClick={() => removeMistralKey(index)}
                            disabled={mistralKeys.length === 1 && !key.trim()}
                            aria-label={`Remover chave ${index + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {status?.message && statusMeta && (
                          <p className={cn("text-xs", statusMeta.textClassName)}>
                            Chave {index + 1}: {status.message}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-sm text-muted-foreground">
                  Crie sua chave em <a href="https://console.mistral.ai/api-keys" target="_blank" rel="noopener noreferrer" className="text-orange-600 underline">console.mistral.ai</a>
                </p>
              </div>

              {/* Model Selection */}
              <div className="grid gap-2">
                <Label htmlFor="mistralModel">🤖 Modelo Mistral para respostas</Label>
                <select
                  id="mistralModel"
                  value={mistralModel}
                  onChange={(e) => setMistralModel(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="select-mistral-model"
                >
                  {mistralModels.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-muted-foreground">
                  {mistralChatEnabled
                    ? "Usado quando Mistral entra na fila de respostas."
                    : "Guardado para quando as respostas por Mistral forem ativadas. A transcricao de audio usa Voxtral."}
                </p>
              </div>
            </div>

          <div className="grid gap-2">
            <Label htmlFor="pixKey">Chave PIX</Label>
            <Input
              id="pixKey"
              type="text"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="email@example.com ou CPF/CNPJ ou telefone"
              data-testid="input-pix-key"
            />
            <p className="text-sm text-muted-foreground">
              Chave PIX usada para receber pagamentos de assinaturas
            </p>
          </div>

          {/* Toggle PIX Manual vs Mercado Pago Checkout */}
          <div className="p-4 border rounded-lg border-green-200 bg-green-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold text-green-800">💳 Modo de Pagamento</Label>
                <p className="text-sm text-green-600">
                  {pixManualEnabled 
                    ? "PIX Manual: Cliente paga direto e você aprova manualmente" 
                    : "Checkout Mercado Pago: Cobrança automática recorrente"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm ${!pixManualEnabled ? 'font-semibold text-blue-600' : 'text-muted-foreground'}`}>
                  Mercado Pago
                </span>
                <Switch
                  checked={pixManualEnabled}
                  onCheckedChange={setPixManualEnabled}
                  data-testid="switch-pix-manual"
                />
                <span className={`text-sm ${pixManualEnabled ? 'font-semibold text-green-600' : 'text-muted-foreground'}`}>
                  PIX Manual
                </span>
              </div>
            </div>
            {pixManualEnabled && (
              <div className="p-2 bg-green-100 rounded text-xs text-green-800">
                ⚠️ <strong>PIX Manual ativado:</strong> Clientes receberão sua chave PIX e você precisará aprovar pagamentos manualmente na seção "Pagamentos".
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="zaiKey">Z.AI API Key</Label>
            <div className="relative">
              <Input
                id="zaiKey"
                type={showZaiKey ? "text" : "password"}
                value={zaiKey}
                onChange={(e) => setZaiKey(e.target.value)}
                placeholder="0a..."
                data-testid="input-zai-key"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowZaiKey(!showZaiKey)}
              >
                {showZaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Chave API usada para os modelos GLM (Z.AI)
            </p>
          </div>

          <Button type="submit" disabled={updateConfigMutation.isPending} data-testid="button-save-config">
            {updateConfigMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Configurações
          </Button>
        </form>
      </CardContent>
    </Card>

    {/* Mercado Pago Configuration */}
    <MercadoPagoConfig />
    
    {/* Annual Discount Configuration */}
    <AnnualDiscountConfig />
    </>
  );
}

// Mercado Pago Configuration Component
function MercadoPagoConfig() {
  const { toast } = useToast();
  const [publicKey, setPublicKey] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [isTestMode, setIsTestMode] = useState(true);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [testing, setTesting] = useState(false);

  // Fetch current credentials
  const { data: mpCredentials, isLoading, refetch } = useQuery<{
    configured: boolean;
    isTestMode: boolean;
    publicKey: string;
    accessToken: string;
    clientId: string;
    clientSecret: string;
  }>({
    queryKey: ["/api/admin/mercadopago/credentials"],
  });

  // Update state when credentials are loaded
  useEffect(() => {
    if (mpCredentials) {
      setPublicKey(mpCredentials.publicKey || "");
      setAccessToken(mpCredentials.accessToken || "");
      setClientId(mpCredentials.clientId || "");
      setClientSecret(mpCredentials.clientSecret || "");
      setIsTestMode(mpCredentials.isTestMode ?? true);
    }
  }, [mpCredentials]);

  const saveCredentialsMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PUT", "/api/admin/mercadopago/credentials", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mercadopago/credentials"] });
      toast({ title: "Credenciais do Mercado Pago salvas com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar credenciais", description: error.message, variant: "destructive" });
    },
  });

  const testConnection = async () => {
    setTesting(true);
    try {
      const response = await apiRequest("POST", "/api/admin/mercadopago/test");
      const data = await response.json();
      if (data.success) {
        toast({ 
          title: "✅ Conexão com Mercado Pago OK!", 
          description: data.message 
        });
      } else {
        toast({ 
          title: "❌ Erro na conexão", 
          description: data.message,
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      toast({ 
        title: "❌ Erro ao testar conexão", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    saveCredentialsMutation.mutate({
      publicKey,
      accessToken,
      clientId,
      clientSecret,
      isTestMode,
    });
  };

  // Fill with test credentials
  const fillTestCredentials = () => {
    setPublicKey("TEST-224d6148-83a6-43fc-bded-659e7be60eb6");
    setAccessToken("TEST-7853790746726235-122922-014a7c91c63452a78e2732d7f5bf24a0-1105684259");
    setIsTestMode(true);
    toast({ title: "Credenciais de teste preenchidas" });
  };

  // Fill with production credentials
  const fillProdCredentials = () => {
    setPublicKey("APP_USR-c6880571-f1e5-4c5b-adba-d78ec125d570");
    setAccessToken("APP_USR-7853790746726235-122922-c063f3f0183988a1216419552a24f097-1105684259");
    setClientId("7853790746726235");
    setClientSecret("NDT5vcvhWXvFj8eBcJkjbwmddeDNOhNh");
    setIsTestMode(false);
    toast({ title: "Credenciais de produção preenchidas" });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-mercadopago-config">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Mercado Pago - Assinaturas
        </CardTitle>
        <CardDescription>
          Configure suas credenciais do Mercado Pago para cobranças recorrentes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick fill buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button 
            type="button" 
            variant="outline" 
            size="sm"
            onClick={fillTestCredentials}
          >
            <TestTube className="h-4 w-4 mr-2" />
            Usar Credenciais de Teste
          </Button>
          <Button 
            type="button" 
            variant="outline" 
            size="sm"
            onClick={fillProdCredentials}
          >
            <Key className="h-4 w-4 mr-2" />
            Usar Credenciais de Produção
          </Button>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center justify-between border rounded-lg p-3">
          <div className="space-y-0.5">
            <Label className="font-medium">Modo de Operação</Label>
            <p className="text-sm text-muted-foreground">
              {isTestMode ? "Modo de Teste (sandbox)" : "Modo de Produção (real)"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={isTestMode ? "text-muted-foreground" : "text-green-600 font-medium"}>Produção</span>
            <Switch
              checked={isTestMode}
              onCheckedChange={setIsTestMode}
            />
            <span className={isTestMode ? "text-yellow-600 font-medium" : "text-muted-foreground"}>Teste</span>
          </div>
        </div>

        {/* Public Key */}
        <div className="space-y-2">
          <Label htmlFor="mpPublicKey">Public Key</Label>
          <Input
            id="mpPublicKey"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder={isTestMode ? "TEST-..." : "APP_USR-..."}
          />
        </div>

        {/* Access Token */}
        <div className="space-y-2">
          <Label htmlFor="mpAccessToken">Access Token</Label>
          <div className="relative">
            <Input
              id="mpAccessToken"
              type={showAccessToken ? "text" : "password"}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={isTestMode ? "TEST-..." : "APP_USR-..."}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowAccessToken(!showAccessToken)}
            >
              {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Client ID and Secret (only for production) */}
        {!isTestMode && (
          <>
            <div className="space-y-2">
              <Label htmlFor="mpClientId">Client ID</Label>
              <Input
                id="mpClientId"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Seu Client ID"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mpClientSecret">Client Secret</Label>
              <div className="relative">
                <Input
                  id="mpClientSecret"
                  type={showClientSecret ? "text" : "password"}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Seu Client Secret"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowClientSecret(!showClientSecret)}
                >
                  {showClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-2">
          <Button 
            onClick={handleSave}
            disabled={saveCredentialsMutation.isPending || !publicKey || !accessToken}
          >
            {saveCredentialsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Credenciais
          </Button>
          <Button 
            variant="outline"
            onClick={testConnection}
            disabled={testing || !accessToken}
          >
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Testar Conexão
          </Button>
        </div>

        {/* Status indicator */}
        {mpCredentials?.configured && (
          <div className="flex items-center gap-2 text-sm text-green-600 mt-2">
            <CheckCircle className="h-4 w-4" />
            Mercado Pago configurado ({mpCredentials.isTestMode ? "teste" : "produção"})
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Annual Discount Configuration Component
function AnnualDiscountConfig() {
  const { toast } = useToast();
  const [discountPercent, setDiscountPercent] = useState<number>(5);
  const [isEnabled, setIsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch current config
  const { data: config, isLoading, refetch } = useQuery<{ percent: number; enabled: boolean }>({
    queryKey: ["/api/system-config/annual-discount"],
  });

  // Update state when config loads
  useEffect(() => {
    if (config) {
      setDiscountPercent(config.percent || 5);
      setIsEnabled(config.enabled !== false);
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest("POST", "/api/admin/annual-discount", {
        percent: discountPercent,
        enabled: isEnabled,
      });
      toast({ title: "✅ Desconto anual atualizado!" });
      refetch();
    } catch (error: any) {
      toast({ title: "❌ Erro ao salvar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-annual-discount-config">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Desconto Plano Anual
        </CardTitle>
        <CardDescription>
          Configure o desconto oferecido para clientes que pagam o plano anual (12 meses)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable toggle */}
        <div className="flex items-center justify-between border rounded-lg p-3">
          <div className="space-y-0.5">
            <Label className="font-medium">Desconto Anual</Label>
            <p className="text-sm text-muted-foreground">
              {isEnabled ? "Desconto ativo para pagamentos anuais" : "Desconto desativado"}
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={setIsEnabled}
          />
        </div>

        {/* Discount percentage */}
        <div className="space-y-2">
          <Label htmlFor="discountPercent">Porcentagem de Desconto (%)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="discountPercent"
              type="number"
              min="0"
              max="50"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Math.min(50, Math.max(0, Number(e.target.value))))}
              className="w-24"
              disabled={!isEnabled}
            />
            <span className="text-lg font-bold text-green-600">%</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Ex: Com {discountPercent}% de desconto, um plano de R$ 99,99/mês custará{" "}
            <span className="font-bold text-green-600">
              R$ {(99.99 * 12 * (1 - discountPercent / 100)).toFixed(2).replace(".", ",")}
            </span>{" "}
            por ano (economia de R$ {(99.99 * 12 * (discountPercent / 100)).toFixed(2).replace(".", ",")})
          </p>
        </div>

        {/* Save button */}
        <Button 
          onClick={handleSave}
          disabled={saving}
        >
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar Configuração
        </Button>
      </CardContent>
    </Card>
  );
}

interface UserWithConnectionStatus extends User {
  isConnected?: boolean;
  connectedCount?: number | string | null;
  totalConnections?: number | string | null;
  connectionPhones?: string[];
  connectedPhones?: string[];
  hasActiveSubscription?: boolean;
  activePlanName?: string | null;
}

type AdminSubscriptionWithDetails = Subscription & { plan: Plan; user: UserWithConnectionStatus };

type ManageClientFilterMode = "all" | "without-plan" | "with-plan" | "connected-plan" | "disconnected-plan";

type AdminPaymentHistoryItem = {
  id: string;
  subscriptionId?: string | null;
  userId?: string | null;
  amount?: string | number | null;
  netAmount?: string | number | null;
  feeAmount?: string | number | null;
  status?: string | null;
  statusDetail?: string | null;
  paymentType?: string | null;
  paymentMethod?: string | null;
  paymentDate?: string | Date | null;
  dueDate?: string | Date | null;
  payerEmail?: string | null;
  cardLastFourDigits?: string | null;
  cardBrand?: string | null;
  mpPaymentId?: string | null;
  createdAt?: string | Date | null;
  user?: Pick<User, "id" | "name" | "email"> | null;
};

function parseAdminDate(value: string | Date | number | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAdminDate(value: string | Date | number | null | undefined) {
  const date = parseAdminDate(value);
  return date ? date.toLocaleDateString("pt-BR") : "-";
}

function formatAdminDateTime(value: string | Date | number | null | undefined) {
  const date = parseAdminDate(value);
  return date ? date.toLocaleString("pt-BR") : "-";
}

function toAdminNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAdminCurrency(value: string | number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(toAdminNumber(value));
}

function isAdminUserConnected(user: UserWithConnectionStatus | null | undefined) {
  return Boolean(user?.isConnected) || toAdminNumber(user?.connectedCount) > 0;
}

function getBillingRelativeText(date: Date | null) {
  if (!date) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) return `Vencido ha ${Math.abs(diffDays)} dia(s)`;
  if (diffDays === 0) return "Vence hoje";
  return `Vence em ${diffDays} dia(s)`;
}

function getAdminBillingInfo(subscription: Partial<Subscription>) {
  const nextPaymentDate = parseAdminDate(subscription.nextPaymentDate);
  const endDate = parseAdminDate(subscription.dataFim);

  if (nextPaymentDate && endDate) {
    const useNextPayment = nextPaymentDate.getTime() >= endDate.getTime();
    const date = useNextPayment ? nextPaymentDate : endDate;
    return {
      date,
      label: useNextPayment ? "Proxima cobranca" : "Cobertura ate",
      tone: "normal" as const,
    };
  }

  if (nextPaymentDate) {
    return { date: nextPaymentDate, label: "Proxima cobranca", tone: "normal" as const };
  }

  if (endDate) {
    return { date: endDate, label: "Cobertura ate", tone: "normal" as const };
  }

  if (subscription.pendingReceipt) {
    return { date: null, label: "Aguardando comprovante", tone: "warning" as const };
  }

  return { date: null, label: "Vencimento nao registrado", tone: "danger" as const };
}

function getAdminPaymentTypeLabel(type?: string | null) {
  switch (type) {
    case "first_payment":
      return "Primeira parcela";
    case "setup_fee":
      return "Taxa de implantacao";
    case "recurring":
      return "Recorrente";
    case "refund":
      return "Reembolso";
    default:
      return type || "-";
  }
}

function renderAdminPaymentStatusBadge(status?: string | null) {
  switch (status) {
    case "approved":
    case "paid":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Aprovado</Badge>;
    case "pending":
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Pendente</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejeitado</Badge>;
    case "refunded":
      return <Badge variant="secondary">Reembolsado</Badge>;
    default:
      return <Badge variant="outline">{status || "-"}</Badge>;
  }
}

function renderAdminSubscriptionStatusBadge(status?: string | null) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Ativo</Badge>;
    case "pending":
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Pendente</Badge>;
    case "cancelled":
    case "canceled":
      return <Badge variant="destructive">Cancelado</Badge>;
    case "expired":
      return <Badge variant="secondary">Expirado</Badge>;
    default:
      return <Badge variant="outline">{status || "-"}</Badge>;
  }
}

function ClientManager({ 
  users, 
  plans,
  subscriptions,
  pendingReceipts = [],
  onGoToReceipts,
}: { 
  users: UserWithConnectionStatus[] | undefined;
  plans: Plan[] | undefined;
  subscriptions: AdminSubscriptionWithDetails[] | undefined;
  pendingReceipts?: any[];
  onGoToReceipts?: () => void;
}) {
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<ManageClientFilterMode>("without-plan");
  const [selectedClientSubscription, setSelectedClientSubscription] = useState<AdminSubscriptionWithDetails | null>(null);

  const activeSubscriptions = useMemo(
    () => subscriptions?.filter((subscription) => subscription.status === "active") || [],
    [subscriptions],
  );

  const selectedClientSubscriptions = useMemo(() => {
    if (!selectedClientSubscription) return [];
    return [...(subscriptions || [])]
      .filter((subscription) => subscription.userId === selectedClientSubscription.userId)
      .sort((a, b) => {
        const dateA = parseAdminDate(a.dataInicio || a.createdAt)?.getTime() || 0;
        const dateB = parseAdminDate(b.dataInicio || b.createdAt)?.getTime() || 0;
        return dateB - dateA;
      });
  }, [selectedClientSubscription, subscriptions]);

  const selectedClientSubscriptionIds = useMemo(
    () => new Set(selectedClientSubscriptions.map((subscription) => subscription.id)),
    [selectedClientSubscriptions],
  );

  const { data: clientPaymentHistory, isLoading: isLoadingClientPaymentHistory } = useQuery<AdminPaymentHistoryItem[]>({
    queryKey: ["/api/admin/payment-history", "client-details", selectedClientSubscription?.userId],
    enabled: Boolean(selectedClientSubscription),
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/payment-history");
      return response.json();
    },
  });

  const selectedClientPayments = useMemo(() => {
    if (!selectedClientSubscription) return [];
    return [...(clientPaymentHistory || [])]
      .filter((payment) =>
        payment.userId === selectedClientSubscription.userId ||
        payment.user?.id === selectedClientSubscription.userId ||
        selectedClientSubscriptionIds.has(payment.subscriptionId || ""),
      )
      .sort((a, b) => {
        const dateA = parseAdminDate(a.paymentDate || a.createdAt)?.getTime() || 0;
        const dateB = parseAdminDate(b.paymentDate || b.createdAt)?.getTime() || 0;
        return dateB - dateA;
      });
  }, [clientPaymentHistory, selectedClientSubscription, selectedClientSubscriptionIds]);

  const selectedClientApprovedPayments = useMemo(
    () => selectedClientPayments.filter((payment) => payment.status === "approved" || payment.status === "paid"),
    [selectedClientPayments],
  );

  const selectedClientTotalPaid = useMemo(
    () => selectedClientApprovedPayments.reduce((total, payment) => total + toAdminNumber(payment.amount), 0),
    [selectedClientApprovedPayments],
  );

  const selectedClientSinceDate = useMemo(() => {
    const dates = [
      ...selectedClientSubscriptions.map((subscription) => parseAdminDate(subscription.dataInicio || subscription.createdAt)),
      ...selectedClientApprovedPayments.map((payment) => parseAdminDate(payment.paymentDate || payment.createdAt)),
      parseAdminDate((selectedClientSubscription?.user as any)?.createdAt),
    ].filter(Boolean) as Date[];

    if (!dates.length) return null;
    return new Date(Math.min(...dates.map((date) => date.getTime())));
  }, [selectedClientApprovedPayments, selectedClientSubscription, selectedClientSubscriptions]);

  const selectedClientCurrentSubscription =
    selectedClientSubscriptions.find((subscription) => subscription.status === "active") || selectedClientSubscription;
  const selectedClientBillingInfo = selectedClientCurrentSubscription
    ? getAdminBillingInfo(selectedClientCurrentSubscription)
    : getAdminBillingInfo({});
  const selectedClientLastPayment = selectedClientPayments[0] || null;

  const usersById = useMemo(
    () => new Map((users || []).map((user) => [user.id, user])),
    [users],
  );

  // Get set of client IDs that have active subscriptions.
  const usersWithActiveSubscriptions = useMemo(
    () => {
      const activeClientIds = new Set<string>();

      for (const subscription of activeSubscriptions) {
        const user = usersById.get(subscription.userId) || subscription.user;
        if (user?.role === "owner" || user?.role === "admin") continue;
        activeClientIds.add(subscription.userId);
      }

      return activeClientIds;
    },
    [activeSubscriptions, usersById],
  );

  const connectionStatusByUserId = useMemo(() => {
    const statusMap = new Map<string, boolean>();

    for (const subscription of activeSubscriptions) {
      const currentStatus = statusMap.get(subscription.userId) === true;
      statusMap.set(subscription.userId, currentStatus || isAdminUserConnected(subscription.user));
    }

    for (const user of users || []) {
      statusMap.set(user.id, isAdminUserConnected(user));
    }

    return statusMap;
  }, [activeSubscriptions, users]);

  // Filter users based on search and filter mode
  const filteredUsers = users?.filter(user => {
    // Exclude admins and owners
    if (user.role === "owner" || user.role === "admin") return false;
    
    // Apply filter mode
    const hasActivePlan = usersWithActiveSubscriptions.has(user.id);
    const hasConnectedWhatsapp = connectionStatusByUserId.get(user.id) === true;
    if (filterMode === "without-plan" && hasActivePlan) return false;
    if (filterMode === "with-plan" && !hasActivePlan) return false;
    if (filterMode === "connected-plan" && (!hasActivePlan || !hasConnectedWhatsapp)) return false;
    if (filterMode === "disconnected-plan" && (!hasActivePlan || hasConnectedWhatsapp)) return false;
    
    // Apply search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        user.name?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower) ||
        user.phone?.includes(searchLower)
      );
    }
    
    return true;
  });

  // Count users in each category
  const usersWithoutPlanCount = users?.filter(u => 
    u.role !== "owner" && u.role !== "admin" && !usersWithActiveSubscriptions.has(u.id)
  ).length || 0;
  
  const usersWithPlanCount = usersWithActiveSubscriptions.size;

  const connectedActiveCount = Array.from(usersWithActiveSubscriptions).filter((userId) =>
    connectionStatusByUserId.get(userId)
  ).length;

  const disconnectedActiveCount = Math.max(0, usersWithPlanCount - connectedActiveCount);

  const displayedActiveSubscriptions = useMemo(
    () =>
      activeSubscriptions.filter((subscription) => {
        const user = usersById.get(subscription.userId) || subscription.user;
        if (user?.role === "owner" || user?.role === "admin") return false;

        const hasConnectedWhatsapp = connectionStatusByUserId.get(subscription.userId) === true;
        if (filterMode === "connected-plan") return hasConnectedWhatsapp;
        if (filterMode === "disconnected-plan") return !hasConnectedWhatsapp;

        return true;
      }),
    [activeSubscriptions, connectionStatusByUserId, filterMode, usersById],
  );

  const activeSubscriptionsEmptyMessage =
    filterMode === "connected-plan"
      ? "Nenhum cliente ativo com WhatsApp conectado"
      : filterMode === "disconnected-plan"
        ? "Nenhum cliente ativo sem WhatsApp conectado"
        : "Nenhuma assinatura ativa";

  const assignPlanMutation = useMutation({
    mutationFn: async (data: { userId: string; planId: string }) => {
      const response = await apiRequest("POST", "/api/admin/subscriptions/assign", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setSelectedUser("");
      setSelectedPlan("");
      toast({ title: "Plano atribuído com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atribuir plano", description: error.message, variant: "destructive" });
    },
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/subscriptions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Assinatura cancelada com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao cancelar assinatura", description: error.message, variant: "destructive" });
    },
  });

  const markSubscriptionPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/admin/subscriptions/${id}/mark-paid`, {});
      return response.json();
    },
    onSuccess: (data: { nextPaymentDate?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-history"] });
      const nextChargeDate = data?.nextPaymentDate
        ? new Date(data.nextPaymentDate).toLocaleDateString("pt-BR")
        : null;
      toast({
        title: "Mensalidade aprovada com sucesso!",
        description: nextChargeDate ? `Próxima cobrança em ${nextChargeDate}.` : undefined,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao marcar mensalidade como paga",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAssignPlan = () => {
    if (!selectedUser || !selectedPlan) {
      toast({ title: "Selecione um usuário e um plano", variant: "destructive" });
      return;
    }
    assignPlanMutation.mutate({ userId: selectedUser, planId: selectedPlan });
  };

  // Get subscription for a user
  const getUserSubscription = (userId: string) => {
    return subscriptions?.find(s => s.userId === userId && s.status === "active");
  };

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{usersWithoutPlanCount}</p>
              <p className="text-xs text-muted-foreground">Sem plano ativo</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{usersWithPlanCount}</p>
              <p className="text-xs text-muted-foreground">Com plano ativo</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{connectedActiveCount}</p>
              <p className="text-xs text-muted-foreground">Conectados (plano ativo)</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{disconnectedActiveCount}</p>
              <p className="text-xs text-muted-foreground">Desconectados (plano ativo)</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{plans?.filter(p => p.ativo).length || 0}</p>
              <p className="text-xs text-muted-foreground">Planos disponíveis</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Comprovantes PIX Pendentes no Gerenciar Clientes */}
      {pendingReceipts.length > 0 && (
        <Card className="border-orange-300 bg-orange-50/30 dark:bg-orange-900/10">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="w-5 h-5 text-orange-500" />
              Comprovantes PIX Pendentes ({pendingReceipts.length})
            </CardTitle>
            <CardDescription>Clientes que enviaram comprovante aguardando aprovação</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {pendingReceipts.slice(0, 8).map((receipt: any) => (
                <div
                  key={receipt.id}
                  className="flex items-center gap-2 p-2 rounded-md border bg-background cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={onGoToReceipts}
                >
                  {receipt.receipt_url && (
                    <img src={receipt.receipt_url} alt="" className="w-8 h-8 rounded object-cover" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{receipt.users?.name || receipt.users?.email || "Cliente"}</p>
                    <p className="text-xs text-muted-foreground">R$ {parseFloat(receipt.amount || 0).toFixed(2)}</p>
                  </div>
                </div>
              ))}
              {pendingReceipts.length > 8 && (
                <Button variant="ghost" size="sm" onClick={onGoToReceipts} className="text-orange-600">
                  +{pendingReceipts.length - 8} mais
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assign Plan Section */}
      <Card data-testid="card-assign-plan">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5" />
            Gerenciar Planos de Clientes
          </CardTitle>
          <CardDescription>
            Busque clientes e atribua ou gerencie seus planos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search and Filter Bar */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={filterMode === "without-plan" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterMode("without-plan")}
                className="whitespace-nowrap"
              >
                Sem Plano ({usersWithoutPlanCount})
              </Button>
              <Button
                variant={filterMode === "with-plan" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterMode("with-plan")}
                className="whitespace-nowrap"
              >
                Com Plano ({usersWithPlanCount})
              </Button>
              <Button
                variant={filterMode === "connected-plan" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterMode("connected-plan")}
                className="whitespace-nowrap"
              >
                Conectados ({connectedActiveCount})
              </Button>
              <Button
                variant={filterMode === "disconnected-plan" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterMode("disconnected-plan")}
                className="whitespace-nowrap"
              >
                Sem WhatsApp ({disconnectedActiveCount})
              </Button>
              <Button
                variant={filterMode === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterMode("all")}
              >
                Todos
              </Button>
            </div>
          </div>

          {/* Plan Selection */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Selecionar Cliente</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger data-testid="select-user" className="h-11">
                  <SelectValue placeholder="Escolha um cliente para atribuir plano" />
                </SelectTrigger>
                <SelectContent>
                  {filteredUsers?.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground text-center">
                      {searchTerm 
                        ? "Nenhum cliente encontrado para esta busca" 
                        : filterMode === "without-plan"
                          ? "Todos os clientes já têm plano ativo!"
                          : filterMode === "connected-plan"
                            ? "Nenhum cliente ativo com WhatsApp conectado"
                            : filterMode === "disconnected-plan"
                              ? "Nenhum cliente ativo sem WhatsApp conectado"
                              : "Nenhum cliente encontrado"
                      }
                    </div>
                  )}
                  {filteredUsers?.map((user) => {
                    const userSub = getUserSubscription(user.id);
                    const userHasPendingReceipt = pendingReceipts.some((r: any) => r.user_id === user.id);
                    const userIsConnected = connectionStatusByUserId.get(user.id) === true;
                    return (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${userIsConnected ? 'bg-green-500' : 'bg-red-500'}`} title={userIsConnected ? 'Conectado' : 'Offline'} />
                          <span className="font-medium">{user.name || "Sem nome"}</span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-sm text-muted-foreground">{user.email || user.phone}</span>
                          {userHasPendingReceipt && (
                            <Badge variant="destructive" className="text-[10px] h-4 px-1">
                              PIX
                            </Badge>
                          )}
                          {userSub && (
                            <Badge variant="secondary" className="ml-auto text-xs">
                              {userSub.plan.nome}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Selecionar Plano</Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger data-testid="select-plan" className="h-11">
                  <SelectValue placeholder="Escolha um plano" />
                </SelectTrigger>
                <SelectContent>
                  {plans?.filter(p => p.ativo).map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      <div className="flex items-center justify-between w-full gap-4">
                        <span className="font-medium">{plan.nome}</span>
                        <span className="text-sm text-muted-foreground">
                          R$ {plan.valor}/{plan.periodicidade === "mensal" ? "mês" : "ano"}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Selected user info */}
          {selectedUser && (
            <div className="p-4 rounded-lg bg-muted/50 border">
              {(() => {
                const user = users?.find(u => u.id === selectedUser);
                const userSub = getUserSubscription(selectedUser);
                if (!user) return null;
                return (
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{user.name || "Sem nome"}</p>
                      <p className="text-sm text-muted-foreground">{user.email} • {user.phone}</p>
                    </div>
                    {userSub ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Plano atual: {userSub.plan.nome}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-orange-600 border-orange-300">
                        Sem plano ativo
                      </Badge>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          <Button 
            onClick={handleAssignPlan} 
            disabled={assignPlanMutation.isPending || !selectedUser || !selectedPlan}
            className="w-full md:w-auto"
            size="lg"
            data-testid="button-assign-plan"
          >
            {assignPlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Atribuir Plano e Ativar Imediatamente
          </Button>
        </CardContent>
      </Card>

      {/* Active Subscriptions Table */}
      <Card data-testid="card-active-subscriptions">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Assinaturas Ativas
          </CardTitle>
          <CardDescription>Visualize, renove mensalidades manuais e gerencie todas as assinaturas ativas</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Conexão</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedActiveSubscriptions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <CreditCard className="w-8 h-8 opacity-50" />
                      <p>{activeSubscriptionsEmptyMessage}</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {displayedActiveSubscriptions.map((subscription) => {
                const isConnected = Boolean(connectionStatusByUserId.get(subscription.userId));
                const billingInfo = getAdminBillingInfo(subscription);
                
                return (
                <TableRow key={subscription.id} data-testid={`row-subscription-${subscription.id}`}>
                  <TableCell>
                    <div className="space-y-0.5">
                      <p className="font-medium">{subscription.user.name || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">{subscription.user.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={isConnected ? "default" : "destructive"} className={isConnected ? "bg-green-500 hover:bg-green-600" : ""}>
                      {isConnected ? "Conectado" : "Offline"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                      {subscription.plan.nome}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      Ativo
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatAdminDate(subscription.dataInicio)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {billingInfo.date ? (
                      <div className="space-y-0.5">
                        <p className="font-medium">{formatAdminDate(billingInfo.date)}</p>
                        <p className="text-xs text-muted-foreground">
                          {billingInfo.label} - {getBillingRelativeText(billingInfo.date)}
                        </p>
                      </div>
                    ) : (
                      <Badge
                        variant={billingInfo.tone === "danger" ? "destructive" : "outline"}
                        className={billingInfo.tone === "warning" ? "border-orange-300 text-orange-700" : ""}
                      >
                        {billingInfo.label}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedClientSubscription(subscription)}
                        data-testid={`button-client-details-${subscription.id}`}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Detalhes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markSubscriptionPaidMutation.mutate(subscription.id)}
                        disabled={markSubscriptionPaidMutation.isPending}
                        data-testid={`button-mark-paid-subscription-${subscription.id}`}
                      >
                        {markSubscriptionPaidMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckSquare className="mr-2 h-4 w-4" />
                        )}
                        Marcar pago
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => cancelSubscriptionMutation.mutate(subscription.id)}
                        disabled={cancelSubscriptionMutation.isPending}
                        data-testid={`button-cancel-subscription-${subscription.id}`}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ClientBillingDetailsDialog
        selectedClientSubscription={selectedClientSubscription}
        selectedClientSubscriptions={selectedClientSubscriptions}
        selectedClientApprovedPayments={selectedClientApprovedPayments}
        selectedClientPayments={selectedClientPayments}
        selectedClientTotalPaid={selectedClientTotalPaid}
        selectedClientSinceDate={selectedClientSinceDate}
        selectedClientCurrentSubscription={selectedClientCurrentSubscription}
        selectedClientBillingInfo={selectedClientBillingInfo}
        selectedClientLastPayment={selectedClientLastPayment}
        pendingReceipts={pendingReceipts}
        connectionStatusByUserId={connectionStatusByUserId}
        markSubscriptionPaidMutation={markSubscriptionPaidMutation}
        isLoadingClientPaymentHistory={isLoadingClientPaymentHistory}
        onClose={() => setSelectedClientSubscription(null)}
      />
    </div>
  );
}

function ClientBillingDetailsDialog({
  selectedClientSubscription,
  selectedClientSubscriptions,
  selectedClientApprovedPayments,
  selectedClientPayments,
  selectedClientTotalPaid,
  selectedClientSinceDate,
  selectedClientCurrentSubscription,
  selectedClientBillingInfo,
  selectedClientLastPayment,
  pendingReceipts,
  connectionStatusByUserId,
  markSubscriptionPaidMutation,
  isLoadingClientPaymentHistory,
  onClose,
}: {
  selectedClientSubscription: AdminSubscriptionWithDetails | null;
  selectedClientSubscriptions: AdminSubscriptionWithDetails[];
  selectedClientApprovedPayments: AdminPaymentHistoryItem[];
  selectedClientPayments: AdminPaymentHistoryItem[];
  selectedClientTotalPaid: number;
  selectedClientSinceDate: Date | null;
  selectedClientCurrentSubscription: AdminSubscriptionWithDetails | null;
  selectedClientBillingInfo: ReturnType<typeof getAdminBillingInfo>;
  selectedClientLastPayment: AdminPaymentHistoryItem | null;
  pendingReceipts: any[];
  connectionStatusByUserId: Map<string, boolean>;
  markSubscriptionPaidMutation: { mutate: (id: string) => void; isPending: boolean };
  isLoadingClientPaymentHistory: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={Boolean(selectedClientSubscription)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[95vw] max-w-6xl max-h-[90vh] overflow-y-auto">
        {selectedClientSubscription && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-blue-600" />
                Historico financeiro do cliente
              </DialogTitle>
              <DialogDescription>
                {selectedClientSubscription.user?.name || "Sem nome"} - {selectedClientSubscription.user?.email || selectedClientSubscription.user?.phone || "sem contato"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Cliente desde</p>
                  <p className="mt-2 text-xl font-bold">{formatAdminDate(selectedClientSinceDate)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Vencimento atual</p>
                  <p className="mt-2 text-xl font-bold">{formatAdminDate(selectedClientBillingInfo.date)}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedClientBillingInfo.date
                      ? `${selectedClientBillingInfo.label} - ${getBillingRelativeText(selectedClientBillingInfo.date)}`
                      : selectedClientBillingInfo.label}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Total aprovado</p>
                  <p className="mt-2 text-xl font-bold">{formatAdminCurrency(selectedClientTotalPaid)}</p>
                  <p className="text-xs text-muted-foreground">{selectedClientApprovedPayments.length} pagamento(s)</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Ultimo pagamento</p>
                  <p className="mt-2 text-xl font-bold">{formatAdminDate(selectedClientLastPayment?.paymentDate || selectedClientLastPayment?.createdAt)}</p>
                  <p className="text-xs text-muted-foreground">{selectedClientLastPayment ? formatAdminCurrency(selectedClientLastPayment.amount) : "Sem registro"}</p>
                </CardContent>
              </Card>
            </div>

            {!selectedClientBillingInfo.date && (
              <div className="rounded-lg border border-orange-300 bg-orange-50 p-4 text-sm text-orange-800 dark:bg-orange-950/20 dark:text-orange-200">
                Esta assinatura esta ativa, mas nao tem vencimento real registrado em nextPaymentDate nem dataFim.
                Por seguranca, a tela nao inventa uma data; ela sinaliza a inconsistencia para o admin conferir o comprovante ou marcar a mensalidade como paga.
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resumo do cliente</CardTitle>
                  <CardDescription>Dados principais para decidir antes de aprovar ou renovar.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-muted-foreground">Nome</Label>
                    <p className="font-medium">{selectedClientSubscription.user?.name || "Sem nome"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Email</Label>
                    <p className="font-medium">{selectedClientSubscription.user?.email || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Telefone</Label>
                    <p className="font-medium">{selectedClientSubscription.user?.phone || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">WhatsApp</Label>
                    <p className="font-medium">
                      {connectionStatusByUserId.get(selectedClientSubscription.userId) ? "Conectado" : "Offline"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Plano atual</Label>
                    <p className="font-medium">{selectedClientCurrentSubscription?.plan?.nome || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Valor do plano</Label>
                    <p className="font-medium">
                      {formatAdminCurrency((selectedClientCurrentSubscription?.plan as any)?.valor ?? (selectedClientCurrentSubscription?.plan as any)?.preco)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Metodo de pagamento</Label>
                    <p className="font-medium">{selectedClientCurrentSubscription?.paymentMethod || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Comprovante pendente</Label>
                    <p className="font-medium">
                      {pendingReceipts.some((receipt: any) =>
                        receipt.user_id === selectedClientSubscription.userId ||
                        receipt.userId === selectedClientSubscription.userId ||
                        receipt.subscription_id === selectedClientSubscription.id ||
                        receipt.subscriptionId === selectedClientSubscription.id,
                      )
                        ? "Sim"
                        : "Nao"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Aprovar mensalidade vencida</CardTitle>
                  <CardDescription>
                    Use isto quando o cliente pagou por fora/PIX e voce precisa registrar a renovacao manual.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg bg-muted/50 p-3 text-sm">
                    Ao marcar como pago, o backend usa o vencimento/cobertura atual quando existir, ou hoje quando estiver vencido,
                    e grava a nova janela de cobranca no historico.
                  </div>
                  <Button
                    onClick={() => selectedClientCurrentSubscription && markSubscriptionPaidMutation.mutate(selectedClientCurrentSubscription.id)}
                    disabled={!selectedClientCurrentSubscription || markSubscriptionPaidMutation.isPending}
                    className="w-full"
                  >
                    {markSubscriptionPaidMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckSquare className="mr-2 h-4 w-4" />
                    )}
                    Marcar mensalidade como paga
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Se houver comprovante PIX anexado, confira tambem a aba Comprovantes PIX antes de aprovar.
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Todas as assinaturas deste cliente</CardTitle>
                <CardDescription>Mostra planos atuais e anteriores, inicio, vencimento e origem da data exibida.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plano</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Inicio</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Metodo</TableHead>
                        <TableHead>ID MP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedClientSubscriptions.map((subscription) => {
                        const billingInfo = getAdminBillingInfo(subscription);
                        return (
                          <TableRow key={subscription.id}>
                            <TableCell>
                              <Badge variant="outline">{subscription.plan?.nome || "N/A"}</Badge>
                            </TableCell>
                            <TableCell>{renderAdminSubscriptionStatusBadge(subscription.status)}</TableCell>
                            <TableCell>{formatAdminDate(subscription.dataInicio)}</TableCell>
                            <TableCell>
                              {billingInfo.date ? (
                                <div className="space-y-0.5">
                                  <p className="font-medium">{formatAdminDate(billingInfo.date)}</p>
                                  <p className="text-xs text-muted-foreground">{billingInfo.label}</p>
                                </div>
                              ) : (
                                <Badge variant={billingInfo.tone === "danger" ? "destructive" : "outline"}>
                                  {billingInfo.label}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>{subscription.paymentMethod || "-"}</TableCell>
                            <TableCell className="max-w-[180px] truncate font-mono text-xs text-muted-foreground">
                              {subscription.mpSubscriptionId || "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Historico de pagamentos e faturas</CardTitle>
                <CardDescription>Pagamentos encontrados por usuario e pelas assinaturas vinculadas a este cliente.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingClientPaymentHistory ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Metodo</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Detalhe</TableHead>
                          <TableHead>ID MP/manual</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedClientPayments.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                              Nenhum pagamento registrado para este cliente.
                            </TableCell>
                          </TableRow>
                        )}
                        {selectedClientPayments.slice(0, 80).map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell>{formatAdminDateTime(payment.paymentDate || payment.createdAt)}</TableCell>
                            <TableCell>{formatAdminDate(payment.dueDate)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{getAdminPaymentTypeLabel(payment.paymentType)}</Badge>
                            </TableCell>
                            <TableCell className="font-medium">{formatAdminCurrency(payment.amount)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <CreditCard className="h-3 w-3" />
                                <span>{payment.cardBrand || payment.paymentMethod || "-"}</span>
                                {payment.cardLastFourDigits && (
                                  <span className="text-muted-foreground">**** {payment.cardLastFourDigits}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{renderAdminPaymentStatusBadge(payment.status)}</TableCell>
                            <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                              {payment.statusDetail || "-"}
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate font-mono text-xs text-muted-foreground">
                              {payment.mpPaymentId || payment.id}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormerSubscribersManager({
  subscriptions,
}: {
  subscriptions: (Subscription & { plan: Plan; user: User })[] | undefined;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "cancelled" | "expired">("all");

  const inactiveStatuses = new Set(["cancelled", "canceled", "expired"]);
  const activeUserIds = new Set(
    subscriptions
      ?.filter((sub) => sub.status === "active")
      .map((sub) => sub.userId) || []
  );

  const latestInactiveByUser = new Map<string, Subscription & { plan: Plan; user: User }>();

  subscriptions
    ?.filter((sub) => inactiveStatuses.has(sub.status))
    .forEach((sub) => {
      if (activeUserIds.has(sub.userId)) return;
      const previous = latestInactiveByUser.get(sub.userId);
      const currentDate = new Date(sub.dataFim || sub.dataInicio || (sub as any).createdAt || 0).getTime();
      const previousDate = previous
        ? new Date(previous.dataFim || previous.dataInicio || (previous as any).createdAt || 0).getTime()
        : 0;
      if (!previous || currentDate >= previousDate) {
        latestInactiveByUser.set(sub.userId, sub);
      }
    });

  const formerSubscribers = Array.from(latestInactiveByUser.values()).sort((a, b) => {
    const dateA = new Date(a.dataFim || a.dataInicio || (a as any).createdAt || 0).getTime();
    const dateB = new Date(b.dataFim || b.dataInicio || (b as any).createdAt || 0).getTime();
    return dateB - dateA;
  });

  const normalizedStatus = (status: string) => (status === "canceled" ? "cancelled" : status);

  const filtered = formerSubscribers.filter((sub) => {
    const matchesSearch =
      !searchTerm ||
      sub.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.user?.phone?.includes(searchTerm) ||
      sub.plan?.nome?.toLowerCase().includes(searchTerm.toLowerCase());

    const status = normalizedStatus(sub.status);
    const matchesStatus = statusFilter === "all" || status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const cancelledCount = formerSubscribers.filter((sub) => normalizedStatus(sub.status) === "cancelled").length;
  const expiredCount = formerSubscribers.filter((sub) => normalizedStatus(sub.status) === "expired").length;

  const getStatusBadge = (status: string) => {
    const normalized = normalizedStatus(status);
    if (normalized === "cancelled") {
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Cancelado</Badge>;
    }
    if (normalized === "expired") {
      return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Expirado</Badge>;
    }
    return <Badge variant="secondary">{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-900/30 flex items-center justify-center">
              <UserMinus className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formerSubscribers.length}</p>
              <p className="text-xs text-muted-foreground">Ex-assinantes</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <ShieldOff className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{cancelledCount}</p>
              <p className="text-xs text-muted-foreground">Cancelados</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-900/30 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{expiredCount}</p>
              <p className="text-xs text-muted-foreground">Expirados</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserMinus className="w-5 h-5" />
            Ex-assinantes
          </CardTitle>
          <CardDescription>
            Pessoas que já tiveram plano e não estão ativas agora
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, email, telefone ou plano..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
                <SelectItem value="expired">Expirados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Contato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum ex-assinante encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="font-medium">{sub.user?.name || "Sem nome"}</p>
                        <p className="text-xs text-muted-foreground">{sub.user?.email || "Sem email"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{sub.plan?.nome || "N/A"}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(sub.status)}</TableCell>
                    <TableCell className="text-sm">
                      {sub.dataFim ? new Date(sub.dataFim).toLocaleDateString("pt-BR") : "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {sub.user?.phone || sub.user?.email || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Subscriptions History Manager - Complete view of all subscriptions and payment history
function SubscriptionsHistoryManager() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSubscription, setSelectedSubscription] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch all subscriptions with payment info
  const { data: subscriptions, isLoading: loadingSubscriptions } = useQuery({
    queryKey: ["/api/admin/subscriptions"],
  });

  // Fetch payment history for selected subscription
  const { data: paymentHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ["/api/admin/payment-history", selectedSubscription],
    queryFn: async () => {
      const url = selectedSubscription 
        ? `/api/admin/payment-history?subscriptionId=${selectedSubscription}`
        : "/api/admin/payment-history";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
  });

  // Fetch subscription statistics
  const { data: stats } = useQuery({
    queryKey: ["/api/admin/subscription-stats"],
  });

  const formatCurrency = (value: string | number | null | undefined) => {
    if (!value) return "R$ 0,00";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(num);
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateString));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Aprovado</Badge>;
      case "rejected":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Recusado</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pendente</Badge>;
      case "active":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Ativo</Badge>;
      case "cancelled":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Cancelado</Badge>;
      case "expired":
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Expirado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredSubscriptions = (subscriptions as any[])?.filter((sub: any) => {
    const matchesSearch = !searchTerm || 
      sub.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.mpSubscriptionId?.includes(searchTerm);
    
    const matchesStatus = statusFilter === "all" || sub.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }) || [];

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Assinaturas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(stats as any)?.totalSubscriptions || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Assinaturas Ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{(stats as any)?.activeSubscriptions || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Recebido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {formatCurrency((stats as any)?.totalRevenue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pagamentos Rejeitados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{(stats as any)?.rejectedPayments || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5" />
            Assinaturas e Histórico de Cobranças
          </CardTitle>
          <CardDescription>
            Visualize todas as assinaturas e histórico completo de pagamentos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por email, nome ou ID da assinatura..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
                <SelectItem value="expired">Expirados</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Subscriptions Table */}
          {loadingSubscriptions ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>ID MercadoPago</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhuma assinatura encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubscriptions.map((sub: any) => {
                    const billingInfo = getAdminBillingInfo(sub);
                    return (
                    <TableRow 
                      key={sub.id}
                      className={selectedSubscription === sub.id ? "bg-muted/50" : ""}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{sub.user?.name || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground">{sub.user?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{sub.plan?.nome || "N/A"}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(sub.status)}</TableCell>
                      <TableCell className="text-sm">
                        {sub.dataInicio ? new Date(sub.dataInicio).toLocaleDateString("pt-BR") : "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {billingInfo.date ? (
                          <div className="space-y-0.5">
                            <p>{formatAdminDate(billingInfo.date)}</p>
                            <p className="text-xs text-muted-foreground">{billingInfo.label}</p>
                          </div>
                        ) : (
                          <Badge variant={billingInfo.tone === "danger" ? "destructive" : "outline"}>
                            {billingInfo.label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency((sub.plan as any)?.valor ?? (sub.plan as any)?.preco)}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {sub.mpSubscriptionId ? sub.mpSubscriptionId.substring(0, 12) + "..." : "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={selectedSubscription === sub.id ? "default" : "outline"}
                          onClick={() => setSelectedSubscription(
                            selectedSubscription === sub.id ? null : sub.id
                          )}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Histórico
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Payment History for Selected Subscription */}
      {selectedSubscription && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Histórico de Pagamentos
            </CardTitle>
            <CardDescription>
              Cobranças da assinatura selecionada
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (paymentHistory as any[])?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum pagamento registrado para esta assinatura
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Líquido</TableHead>
                    <TableHead>Taxa MP</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detalhe</TableHead>
                    <TableHead>ID MP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(paymentHistory as any[])?.map((payment: any) => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-sm">
                        {formatDate(payment.paymentDate || payment.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {payment.paymentType === "first_payment" ? "1ª Parcela" : 
                           payment.paymentType === "setup_fee" ? "Taxa Impl." :
                           payment.paymentType === "recurring" ? "Recorrente" : payment.paymentType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell className="text-green-600">
                        {formatCurrency(payment.netAmount)}
                      </TableCell>
                      <TableCell className="text-red-500 text-sm">
                        {formatCurrency(payment.feeAmount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          <span className="capitalize text-sm">
                            {payment.cardBrand || payment.paymentMethod || "-"}
                          </span>
                          {payment.cardLastFourDigits && (
                            <span className="text-muted-foreground">
                              •••• {payment.cardLastFourDigits}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                        {payment.statusDetail || "-"}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {payment.mpPaymentId || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Full Payment History */}
      {!selectedSubscription && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Últimos Pagamentos (Todos os Clientes)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (paymentHistory as any[])?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum pagamento registrado
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>ID MP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(paymentHistory as any[])?.slice(0, 50).map((payment: any) => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-sm">
                        {formatDate(payment.paymentDate || payment.createdAt)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{payment.payerEmail || "-"}</span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      <TableCell>
                        <span className="capitalize text-sm">
                          {payment.cardBrand || payment.paymentMethod || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {payment.mpPaymentId || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
