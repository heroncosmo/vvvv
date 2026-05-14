import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/hooks/useBranding";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageCircle, Settings, LogOut, Smartphone, Bot, CreditCard, LayoutDashboard, AlertCircle, Send, Kanban, Users, Tags, Filter, Plug, CalendarClock, BedDouble, Wrench, Megaphone, Upload, BookUser, BookOpen, Bell, Rocket, Sparkles, Receipt, Ban, Building2, FormInput, Package, ShoppingBag, UtensilsCrossed, ClipboardList, Mic, Workflow, Ticket, HelpCircle, Gift, QrCode, X, Palette, Shield, Copy, Mail, Wallet, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ConversationsList } from "@/components/conversations-list";
import { ChatArea } from "@/components/chat-area";
import { ContactDetailsPanel } from "@/components/contact-details-panel";
import { ConnectionPanel } from "@/components/connection-panel";
import { DashboardStats } from "@/components/dashboard-stats";
import { LimitReachedTopBanner } from "@/components/usage-limit-banner";
import { SuspensionBanner } from "@/components/suspension-banner";
import { SubscriptionActionGate } from "../components/subscription-action-gate";
import MyAgent from "@/pages/my-agent";
import ImplementationPage from "@/pages/implementation";
import PlansPage from "@/pages/plans";
import SpecialistPage from "@/pages/specialist";
import SubscribePage from "@/pages/subscribe";
import SettingsPage from "@/pages/settings";
import TeamMembersPage from "@/pages/team-members";
import SectorsPage from "@/pages/sectors";
import MassSendPage from "@/pages/mass-send";
import CampaignsPage from "@/pages/campaigns";
import KanbanPage from "@/pages/kanban";
import ContactsPage from "@/pages/contacts";
import SyncedContactsPage from "@/pages/synced-contacts";
import TagsPage from "@/pages/tags";
import FunnelPage from "@/pages/funnel";
import IntegrationsPage from "@/pages/integrations";
import StatusPostsPage from "@/pages/status-posts";
import ReservationsPage from "@/pages/reservations";
import LeadQualificationPage from "@/pages/lead-qualification";
import CourseSchedulingInsightsPage from "@/pages/course-scheduling-insights";
import Agendamento3AgenticPage from "@/pages/agendamento3-agentic";
import EstampariaPage from "@/pages/estamparia";
import EstampariaDetailPage from "@/pages/estamparia-detail";
import MediaLibraryPage from "@/pages/media-library";
import ContactListsPage from "@/pages/contact-lists";
import SmartNotifierPage from "@/pages/smart-notifier";
import OwnerAdminPanel from "@/pages/owner-admin-panel";
import FollowupConfigPage from "@/pages/followup-config";
import PaymentHistoryPage from "@/pages/payment-history";
import MySubscriptionPage from "@/pages/my-subscription";
import ExclusionListPage from "@/pages/exclusion-list";
import CustomFieldsPage from "@/pages/custom-fields";
import ProductsPage from "@/pages/products";
import Delivery2Page from "@/pages/delivery2";
import DeliveryMenuPage from "@/pages/delivery-menu";
import DeliveryOrdersPage from "@/pages/delivery-orders";
import DeliveryReportsPage from "@/pages/delivery-reports";
import AudioConfigPage from "@/pages/audio-config";
import FlowBuilderPage from "@/pages/flow-builder";
import ToolsMenuPage from "@/pages/tools-menu";
import ToolsSegmentPage from "@/pages/tools-segment";
import WhatsAppQrGeneratorPage from "@/pages/whatsapp-qr-generator";
import MetaFormularioPage from "@/pages/meta-formulario";
import TicketsPage from "@/pages/TicketsPage";
import TicketDetailPage from "@/pages/TicketDetailPage";
import TicketCreatePage from "@/pages/TicketCreatePage";
import HelpCenterPage from "@/pages/help-center";
import TrainingCoursePage from "@/pages/training-course";
import ReferralHubPage from "@/pages/referral-hub";
import { UpgradeBanner } from "@/components/upgrade-cta";
import { Delivery2OrderNotifier } from "@/components/delivery2-order-notifier";
import { DeliveryOrderNotifier } from "@/components/delivery-order-notifier";
import { useLocation, useRoute, useSearch } from "wouter";
import type { WhatsappConnection, AiAgentConfig, Subscription, Plan, Conversation } from "@shared/schema";
import { supabase, refreshSession, getAuthToken } from "@/lib/supabase";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  canMemberAccessPath,
  getMemberDefaultPath,
  resolveMemberPermissions,
} from "@/lib/member-permissions";
import {
  canActiveSubscriptionAccessPath,
  getRequiredAddonForPath,
} from "@/lib/subscription-gate";
import { getCourseArticleHref, getCourseVideoForPath } from "@/lib/youtube-course";
import { cn } from "@/lib/utils";

// Interface para status de suspensão
interface SuspensionStatus {
  suspended: boolean;
  reason?: string;
  type?: string;
  suspendedAt?: string;
  refundedAt?: string;
  refundAmount?: number;
}

// Interface for /api/usage response (canonical entitlement source)
interface UsageData {
  agentMessagesCount: number;
  limit: number;
  remaining: number;
  isLimitReached: boolean;
  hasActiveSubscription: boolean;
  planName: string | null;
}

interface DashboardBootstrapData {
  user?: unknown;
  subscription?: (Subscription & { plan: Plan }) | null;
  usage?: UsageData;
  accessStatus?: unknown;
  suspensionStatus?: SuspensionStatus;
  resellerStatus?: { hasResellerPlan: boolean; reseller?: unknown | null };
  assignedPlanResponse?: { hasAssignedPlan: boolean; plan?: Plan & { valor?: number } };
  connections?: WhatsappConnection[];
  primaryConnection?: WhatsappConnection | null;
  stats?: unknown;
  tags?: unknown[];
  conversations?: unknown;
  errors?: Record<string, string>;
  restoreInProgress?: boolean;
  degraded?: boolean;
  generatedAt?: string;
}

type ReferralDashboardSummary = {
  link?: {
    referralCode?: string;
    shareUrl?: string;
  };
  program?: {
    defaultCommissionAmount?: number;
  };
  stats?: {
    availableBalance?: number;
    pendingBalance?: number;
    lifetimeBalance?: number;
    totalReferrals?: number;
    convertedReferrals?: number;
  };
  manualReferrals?: Array<{
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    status?: string | null;
    convertedAt?: string | null;
  }>;
};

type BillingDetails = {
  subscription?: (Subscription & { plan?: Plan | null }) | null;
  stats?: {
    totalPaid?: number;
    approvedPayments?: number;
  };
};

function formatBRL(value: unknown) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(amount) ? amount : 0);
}

function formatShortDate(value: unknown) {
  if (!value) return "Sem data";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Sem data";
  return date.toLocaleDateString("pt-BR");
}

function PlanFeatureLockedScreen({
  addonTitle,
  onOpenPlans,
  onClose,
}: {
  addonTitle: string;
  onOpenPlans: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex pointer-events-none items-center justify-center p-4">
      <Card className="pointer-events-auto relative w-full max-w-xl border-slate-200 bg-white p-6 text-center shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-950 hover:text-slate-950"
          aria-label="Fechar aviso"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950 text-white">
          <Shield className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-950">Adicional bloqueado neste plano</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Seu plano atual libera o atendimento principal do Meu Agente IA e os adicionais gratuitos. Para usar
          <strong className="font-semibold text-slate-950"> {addonTitle}</strong>, adicione esta ferramenta ou escolha o Pacote Pro com todos os adicionais.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={onOpenPlans}>
            Ver adicionais e Pro
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const isMember = (user as any)?.isMember;
  const permissions = resolveMemberPermissions((user as any)?.memberData?.permissions);
  const shouldUseDashboardBootstrap = !!isAuthenticated && !isMember;
  
  const { branding } = useBranding(); // Get white-label branding
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const { data: dashboardBootstrap } = useQuery<DashboardBootstrapData>({
    queryKey: ["/api/dashboard/bootstrap", "conversations"],
    enabled: shouldUseDashboardBootstrap,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => query.state.data?.restoreInProgress ? 15000 : false,
    queryFn: async () => {
      const token = await getAuthToken();
      const response = await fetch("/api/dashboard/bootstrap?includeConversations=1", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Failed to fetch dashboard bootstrap");
      const data = await response.json();

      if (data?.user) queryClient.setQueryData(["/api/auth/user"], data.user);
      queryClient.setQueryData(["/api/subscriptions/current"], data?.subscription ?? null);
      if (data?.usage) queryClient.setQueryData(["/api/usage"], data.usage);
      if (data?.accessStatus) queryClient.setQueryData(["/api/access-status"], data.accessStatus);
      if (data?.suspensionStatus) queryClient.setQueryData(["/api/user/suspension-status"], data.suspensionStatus);
      if (data?.resellerStatus) queryClient.setQueryData(["/api/reseller/status"], data.resellerStatus);
      if (data?.assignedPlanResponse) queryClient.setQueryData(["/api/user/assigned-plan"], data.assignedPlanResponse);
      if (data?.primaryConnection !== undefined) queryClient.setQueryData(["/api/whatsapp/connection"], data.primaryConnection);
      if (data?.connections) queryClient.setQueryData(["/api/whatsapp/connections"], data.connections);
      if (data?.stats) queryClient.setQueryData(["/api/stats"], data.stats);
      if (data?.tags) queryClient.setQueryData(["/api/tags"], data.tags);
      if (data?.conversations) {
        queryClient.setQueryData(["/api/conversations-with-tags", null, "all", "page0"], data.conversations);
      }

      return data;
    },
  });

  useEffect(() => {
    if (!dashboardBootstrap) return;

    if (dashboardBootstrap.user) {
      queryClient.setQueryData(["/api/auth/user"], dashboardBootstrap.user);
    }
    queryClient.setQueryData(["/api/subscriptions/current"], dashboardBootstrap.subscription ?? null);
    if (dashboardBootstrap.usage) queryClient.setQueryData(["/api/usage"], dashboardBootstrap.usage);
    if (dashboardBootstrap.accessStatus) queryClient.setQueryData(["/api/access-status"], dashboardBootstrap.accessStatus);
    if (dashboardBootstrap.suspensionStatus) queryClient.setQueryData(["/api/user/suspension-status"], dashboardBootstrap.suspensionStatus);
    if (dashboardBootstrap.resellerStatus) queryClient.setQueryData(["/api/reseller/status"], dashboardBootstrap.resellerStatus);
    if (dashboardBootstrap.assignedPlanResponse) queryClient.setQueryData(["/api/user/assigned-plan"], dashboardBootstrap.assignedPlanResponse);
    if (dashboardBootstrap.primaryConnection !== undefined) queryClient.setQueryData(["/api/whatsapp/connection"], dashboardBootstrap.primaryConnection);
    if (dashboardBootstrap.connections) queryClient.setQueryData(["/api/whatsapp/connections"], dashboardBootstrap.connections);
    if (dashboardBootstrap.stats) queryClient.setQueryData(["/api/stats"], dashboardBootstrap.stats);
    if (dashboardBootstrap.tags) queryClient.setQueryData(["/api/tags"], dashboardBootstrap.tags);
    if (dashboardBootstrap.conversations) {
      queryClient.setQueryData(["/api/conversations-with-tags", null, "all", "page0"], dashboardBootstrap.conversations);
    }
  }, [dashboardBootstrap]);

  const { data: subscriptionQueryData } = useQuery<Subscription & { plan: Plan } | null>({
    queryKey: ["/api/subscriptions/current"],
    enabled: !!isAuthenticated && !shouldUseDashboardBootstrap,
    staleTime: 30000,
  });
  const subscription = subscriptionQueryData ?? dashboardBootstrap?.subscription ?? null;
  // Canonical entitlement check from /api/usage (considers reseller + SaaS + expiration)
  const { data: usageQueryData } = useQuery<UsageData>({
    queryKey: ["/api/usage"],
    enabled: !!isAuthenticated && !shouldUseDashboardBootstrap,
    refetchInterval: 60000, // 60s ao invés de 30s
    staleTime: 30000,
  });
  const usageData = usageQueryData ?? dashboardBootstrap?.usage;
  // True subscription active status (from canonical helper, not just subscription.status)
  const isEffectivelyPaid = usageData?.hasActiveSubscription ?? false;
  // Verificar status de suspensão do usuário
  const { data: suspensionStatusQueryData } = useQuery<SuspensionStatus>({
    queryKey: ["/api/user/suspension-status"],
    enabled: !!isAuthenticated && !shouldUseDashboardBootstrap,
    refetchInterval: 60000, // Verificar a cada minuto
    staleTime: 30000,
  });
  const suspensionStatus = suspensionStatusQueryData ?? dashboardBootstrap?.suspensionStatus;
  const isSuspended = suspensionStatus?.suspended || false;
  // Verificar se usuário é revendedor
  const { data: resellerStatusQueryData } = useQuery<{ hasResellerPlan: boolean }>({
    queryKey: ["/api/reseller/status"],
    enabled: !!isAuthenticated && !shouldUseDashboardBootstrap,
    staleTime: 30000,
  });
  const resellerStatus = resellerStatusQueryData ?? dashboardBootstrap?.resellerStatus;
  const isReseller = resellerStatus?.hasResellerPlan || false;
  const shouldApplyPlanFeatureGate = Boolean(isEffectivelyPaid && subscription && !isMember && !isReseller);
  const canAccessCurrentPlanFeature = !shouldApplyPlanFeatureGate || canActiveSubscriptionAccessPath(location, subscription as any);
  const currentRequiredAddon = getRequiredAddonForPath(location);
  const shouldShowPlanFeatureBlock = shouldApplyPlanFeatureGate && !canAccessCurrentPlanFeature;
  const [dismissedPlanFeatureBlockPath, setDismissedPlanFeatureBlockPath] = useState<string | null>(null);
  const shouldShowPlanFeatureBlockDialog = shouldShowPlanFeatureBlock && dismissedPlanFeatureBlockPath !== location;

  useEffect(() => {
    setDismissedPlanFeatureBlockPath(null);
  }, [location]);
  
  // Buscar plano atribuído (se houver)
  const { data: assignedPlanQueryData } = useQuery<{ hasAssignedPlan: boolean; plan?: Plan & { valor?: number } }>({
    queryKey: ["/api/user/assigned-plan"],
    enabled: !!isAuthenticated && !shouldUseDashboardBootstrap,
    staleTime: 30000,
  });
  const assignedPlanResponse = assignedPlanQueryData ?? dashboardBootstrap?.assignedPlanResponse;
  
  // Extrair o plano da resposta
  const assignedPlanData = assignedPlanResponse?.plan;

  const [selectedView, setSelectedView] = useState<"conversations" | "connection" | "stats" | "agent">("conversations");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [autologinLoading, setAutologinLoading] = useState<boolean>(false);
  const [autologinError, setAutologinError] = useState<string | null>(null);
  const [referralInviteOpen, setReferralInviteOpen] = useState(false);
  const [billingDialogOpen, setBillingDialogOpen] = useState(false);
  const [referralInviteName, setReferralInviteName] = useState("");
  const [referralInviteEmail, setReferralInviteEmail] = useState("");
  const [referralCreditPanelOpen, setReferralCreditPanelOpen] = useState(false);
  const [referralWithdrawPix, setReferralWithdrawPix] = useState("");
  const [referralWithdrawAmount, setReferralWithdrawAmount] = useState("");

  const { data: referralDashboard } = useQuery<ReferralDashboardSummary>({
    queryKey: ["/api/referrals/dashboard"],
    enabled: !!isAuthenticated && !isMember && (referralInviteOpen || billingDialogOpen),
    staleTime: 30000,
  });

  const { data: billingDetails } = useQuery<BillingDetails>({
    queryKey: ["/api/my-subscription"],
    enabled: !!isAuthenticated && !isMember && billingDialogOpen,
    staleTime: 30000,
  });

  const manualReferralMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/referrals/manual-attribution", {
        contactName: referralInviteName,
        contactEmail: referralInviteEmail,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/dashboard"] });
      setReferralInviteName("");
      setReferralInviteEmail("");
      toast({
        title: "Indicação reservada",
        description: "Quando esse e-mail criar conta e assinar, o crédito de R$50 fica vinculado a você.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Não foi possível reservar",
        description: error?.message || "Confira o e-mail e tente novamente.",
        variant: "destructive",
      });
    },
  });

  const withdrawalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/referrals/withdrawals", {
        amount: referralWithdrawAmount,
        pixType: "pix",
        pixKey: referralWithdrawPix,
        holderName: (user as any)?.name || (user as any)?.email || "Cliente AgenteZap",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/dashboard"] });
      setReferralWithdrawPix("");
      setReferralWithdrawAmount("");
      toast({ title: "Saque solicitado", description: "O pedido ficou pendente para revisão do admin." });
    },
    onError: (error: any) => {
      toast({
        title: "Não foi possível solicitar saque",
        description: error?.message || "Confira o saldo, Pix e valor informado.",
        variant: "destructive",
      });
    },
  });

  const applyCreditMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/referrals/apply-credit", {
        amount: referralWithdrawAmount || referralStats.availableBalance || 0,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-subscription"] });
      setReferralWithdrawAmount("");
      toast({ title: "Crédito aplicado", description: "O saldo foi reservado para abater ou antecipar sua fatura." });
    },
    onError: (error: any) => {
      toast({
        title: "Não foi possível aplicar crédito",
        description: error?.message || "Confira se existe saldo disponível e assinatura ativa.",
        variant: "destructive",
      });
    },
  });

  const copyReferralLink = async () => {
    const shareUrl = referralDashboard?.link?.shareUrl;
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    apiRequest("POST", "/api/referrals/share-link", { channel: "copy" }).catch(() => undefined);
    toast({ title: "Link copiado", description: "Envie para o cliente antes dele criar conta." });
  };
  
  // 🔗 Extrair conversationId da URL, aceitando rota canônica e links legados com ?id=
  const [, conversationParams] = useRoute("/conversas/:conversationId");
  const queryConversationId = new URLSearchParams(search).get("id");
  const urlConversationId = conversationParams?.conversationId ?? queryConversationId ?? null;
  
  // 📌 Sincronizar selectedConversationId com a URL
  useEffect(() => {
    if (urlConversationId !== selectedConversationId) {
      setSelectedConversationId(urlConversationId);
    }
  }, [selectedConversationId, urlConversationId]);
  
  const isConversasRoute = location.startsWith("/conversas");
  const isConexaoRoute = location.startsWith("/conexao");
  const isMeuAgenteRoute = location.startsWith("/meu-agente-ia");
  const isMediaLibraryRoute = location.startsWith("/biblioteca-midias");
  const isPlansRoute = location.startsWith("/plans");
  const isSettingsRoute = location.startsWith("/settings");
  const isMembersRoute = location.startsWith("/membros");
  const isImplementationRoute = location.startsWith("/implementacao");
  const isSpecialistRoute = location.startsWith("/especialista");
  const isSectorsRoute = location.startsWith("/setores");
  const isSubscribeRoute = location.startsWith("/subscribe/");
  const isMassSendRoute = location.startsWith("/envio-em-massa");
  const isReferralHubRoute = location.startsWith("/indicacoes");
  const isCampaignsRoute = location.startsWith("/campanhas");
  const isKanbanRoute = location.startsWith("/kanban");
  const isContactsRoute = location.startsWith("/contatos") && !location.startsWith("/contatos-sincronizados");
  const isSyncedContactsRoute = location.startsWith("/contatos-sincronizados");
  const isTagsRoute = location.startsWith("/etiquetas");
  const isFunnelRoute = location.startsWith("/funil");
  const isIntegrationsRoute = location.startsWith("/integracoes");
  const isSchedulingRoute = location.startsWith("/agendamentos");
  const isStatusPostsRoute = location.startsWith("/postagens-status");
  const isReservationsRoute = location.startsWith("/reservas");
  const isLeadQualificationRoute = location.startsWith("/qualificacao");
  const isCoursesRoute = location.startsWith("/cursos");
  const isAgendamento2Route = location.startsWith("/agendamento-2");
  const isAgendamento3Route = location.startsWith("/agendamento-3");
  const isEstampariaRoute = location.startsWith("/estamparia");
  const isContactListsRoute = location.startsWith("/listas-contatos");
  const isNotifierRoute = location.startsWith("/notificador");
  const isAdministradorRoute = location.startsWith("/administrador");
  const isFollowupRoute = location.startsWith("/followup");
  const isPaymentHistoryRoute = location.startsWith("/payment-history") || location.startsWith("/historico-pagamentos");
  const isMySubscriptionRoute = location.startsWith("/minha-assinatura");
  const isExclusionListRoute = location.startsWith("/lista-exclusao");
  const isCustomFieldsRoute = location.startsWith("/campos-personalizados");
  const isProductsRoute = location.startsWith("/produtos");
  const isDelivery2Route = location.startsWith("/delivery-2");
  const isDeliveryMenuRoute = location.startsWith("/delivery-cardapio");
  const isDeliveryOrdersRoute = location.startsWith("/delivery-pedidos");
  const isDeliveryReportsRoute = location.startsWith("/delivery-relatorios");
  const isSalonMenuRoute = location.startsWith("/salon-menu");
  const isSalonAppointmentsRoute = location.startsWith("/salon-agendamentos");
  const isProviderMenuRoute = location.startsWith("/prestador-menu");
  const isClinicMenuRoute = location.startsWith("/clinica-menu");
  const isAudioConfigRoute = location.startsWith("/falar-por-audio");
  const isFlowBuilderRoute = location.startsWith("/construtor-fluxo");
  const isToolsMenuRoute = location === "/ferramentas";
  const isToolsSegmentRoute = location.startsWith("/ferramentas/");
  const isWhatsappQrRoute = location.startsWith("/qrcode-whatsapp");
  const isMetaFormularioRoute = location.startsWith("/meta-formulario");
  const isTicketsRoute = location.startsWith("/tickets");
  const isHelpCenterRoute = location.startsWith("/ajuda");
  const isTrainingCourseRoute =
    location.startsWith("/curso-agentezap") ||
    location === "/curso" ||
    location.startsWith("/curso/") ||
    location.startsWith("/treinamento");
  const isTicketsNewRoute = location === "/tickets/new";
  const [matchTicketsDetail] = useRoute("/tickets/:id");
  const [matchEstampariaDetail] = useRoute("/estamparia/:id");
  const isTicketsDetailRoute = matchTicketsDetail && location !== "/tickets/new" && location !== "/tickets";
  const isEstampariaDetailRoute = Boolean(matchEstampariaDetail);
  const isLegacySchedulingModuleRoute =
    isSchedulingRoute ||
    isSalonMenuRoute ||
    isSalonAppointmentsRoute ||
    isProviderMenuRoute ||
    isClinicMenuRoute;
  const isDashboardMode =
    !isConversasRoute &&
    !isConexaoRoute &&
    !isMeuAgenteRoute &&
    !isMediaLibraryRoute &&
    !isPlansRoute &&
    !isSettingsRoute &&
    !isMembersRoute &&
    !isImplementationRoute &&
    !isSpecialistRoute &&
    !isSectorsRoute &&
    !isSubscribeRoute &&
    !isMassSendRoute &&
    !isReferralHubRoute &&
    !isCampaignsRoute &&
    !isKanbanRoute &&
    !isContactsRoute &&
    !isSyncedContactsRoute &&
    !isTagsRoute &&
    !isFunnelRoute &&
      !isIntegrationsRoute &&
      !isSchedulingRoute &&
      !isStatusPostsRoute &&
    !isReservationsRoute &&
    !isLeadQualificationRoute &&
    !isCoursesRoute &&
    !isAgendamento2Route &&
    !isAgendamento3Route &&
    !isEstampariaRoute &&
    !isContactListsRoute &&
    !isNotifierRoute &&
    !isAdministradorRoute &&
    !isFollowupRoute &&
    !isPaymentHistoryRoute &&
    !isMySubscriptionRoute &&
    !isExclusionListRoute &&
    !isCustomFieldsRoute &&
    !isProductsRoute &&
    !isDelivery2Route &&
    !isDeliveryMenuRoute &&
    !isDeliveryOrdersRoute &&
    !isDeliveryReportsRoute &&
    !isSalonMenuRoute &&
    !isSalonAppointmentsRoute &&
    !isProviderMenuRoute &&
    !isClinicMenuRoute &&
    !isAudioConfigRoute &&
    !isFlowBuilderRoute &&
    !isStatusPostsRoute &&
    !isTicketsRoute &&
    !isHelpCenterRoute &&
    !isTrainingCourseRoute &&
    !isToolsMenuRoute &&
    !isToolsSegmentRoute &&
    !isWhatsappQrRoute &&
    !isMetaFormularioRoute;
  const canAccessOwnerAdminPanel =
    !isMember && String((user as any)?.email || "").trim().toLowerCase() === "rodrigo4@gmail.com";
  const canAccessMetaFormulario = !isMember;
  const canAccessDelivery2 = !isMember;
  const shouldHideLegacyDelivery = !isMember;
  const shouldTemporarilyHideLegacyDelivery = false;
  const shouldRenderLegacyDeliveryMenu = false;
  const shouldBlockLegacyDeliveryRoute =
    !isMember && (isDeliveryMenuRoute || isDeliveryOrdersRoute || isDeliveryReportsRoute);
  const isToolsRoute =
    isMassSendRoute ||
    isReferralHubRoute ||
    isCampaignsRoute ||
    isKanbanRoute ||
    isContactsRoute ||
    isSyncedContactsRoute ||
    isTagsRoute ||
    isFunnelRoute ||
      isIntegrationsRoute ||
      isSchedulingRoute ||
      isStatusPostsRoute ||
      isReservationsRoute ||
    isLeadQualificationRoute ||
    isCoursesRoute ||
    isAgendamento2Route ||
    isAgendamento3Route ||
    isEstampariaRoute ||
    isContactListsRoute ||
    isNotifierRoute ||
    isFollowupRoute ||
    isExclusionListRoute ||
    isCustomFieldsRoute ||
    isProductsRoute ||
    isDelivery2Route ||
    isDeliveryMenuRoute ||
    isDeliveryOrdersRoute ||
    isDeliveryReportsRoute ||
    isSalonMenuRoute ||
    isSalonAppointmentsRoute ||
    isProviderMenuRoute ||
    isClinicMenuRoute ||
    isAudioConfigRoute ||
    isFlowBuilderRoute ||
    isStatusPostsRoute ||
    isTicketsRoute ||
    isToolsMenuRoute ||
    isToolsSegmentRoute ||
    isWhatsappQrRoute ||
    isMetaFormularioRoute;

  useEffect(() => {
    if (shouldHideLegacyDelivery && (isDeliveryMenuRoute || isDeliveryOrdersRoute || isDeliveryReportsRoute)) {
      setLocation("/delivery-2");
    }
  }, [isDeliveryMenuRoute, isDeliveryOrdersRoute, isDeliveryReportsRoute, setLocation, shouldHideLegacyDelivery]);
  
  // Rotas do menu Configurações
  const isConfigRoute =
    isPlansRoute ||
    isSettingsRoute ||
    isSubscribeRoute ||
    isPaymentHistoryRoute ||
    isMySubscriptionRoute;
  
  const [toolsPickerOpen, setToolsPickerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const [sidebarHasHiddenItems, setSidebarHasHiddenItems] = useState(false);

  // 🔗 Handler para selecionar conversa e atualizar URL
  const handleSelectConversation = (conversationId: string | null) => {
    setSelectedConversationId(conversationId);
    if (conversationId) {
      setLocation(`/conversas/${conversationId}`);
    } else {
      setLocation("/conversas");
    }
  };

  const goToSection = (view: "conversations" | "connection" | "stats" | "agent") => {
    setSelectedView(view);
    // Atualizar URL conforme a view
    if (view === "conversations") {
      setLocation("/conversas");
      setSelectedConversationId(null); // Limpar conversa selecionada ao voltar para lista
    } else if (view === "connection") {
      setLocation("/conexao");
    } else if (view === "agent") {
      setLocation("/meu-agente-ia");
    } else if (view === "stats") {
      setLocation("/dashboard");
    }
  };

  // Sincronizar view com a rota atual
  useEffect(() => {
    if (isConversasRoute) {
      setSelectedView("conversations");
    } else if (isConexaoRoute) {
      setSelectedView("connection");
    } else if (isMeuAgenteRoute) {
      setSelectedView("agent");
    } else if (isDashboardMode) {
      setSelectedView("stats");
    }
  }, [isConversasRoute, isConexaoRoute, isMeuAgenteRoute, isDashboardMode]);

  useEffect(() => {
    if (isToolsRoute) {
      setSidebarOpen(isReferralHubRoute);
    }
  }, [isReferralHubRoute, isToolsRoute]);


  useEffect(() => {
    if (!isLegacySchedulingModuleRoute && !isAgendamento2Route) {
      return;
    }

    const destination = "/agendamento-3";
    if (location !== destination) {
      setLocation(destination);
    }
  }, [isAgendamento2Route, isLegacySchedulingModuleRoute, location, setLocation]);

  const handleLogout = async () => {
    try {
      // Verificar se é membro da equipe
      const memberToken = localStorage.getItem("memberToken");
      
      if (memberToken) {
        // Logout de membro
        try {
          await fetch("/api/team-members/logout", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${memberToken}`,
            },
            credentials: "include",
          });
        } catch (err) {
          console.warn("Falha ao chamar /api/team-members/logout:", err);
        }
        
        // Limpar localStorage de membro
        localStorage.removeItem("memberToken");
        localStorage.removeItem("memberData");
      } else {
        // Logout de usuário normal
        try {
          // Limpa a sessão local do Supabase (token)
          await supabase.auth.signOut();
        } catch (err) {
          console.error("Erro ao sair (supabase):", err);
        }

        try {
          // Limpa a sessão de servidor (se existir)
          await fetch("/api/logout", { credentials: "include" });
        } catch (err) {
          console.warn("Falha ao chamar /api/logout:", err);
        }
      }

      try {
        // Limpa cache de consultas relacionadas a auth
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        await queryClient.clear();
      } catch {}

      // Redireciona para tela de login apropriada
      setLocation(memberToken ? "/membro-login" : "/login");
    } catch (error) {
      console.error("Erro durante logout:", error);
      // Forçar redirecionamento mesmo se houver erro
      setLocation("/login");
    }
  };

  // V23i: Auto-login é tratado pelo useAutoLogin() em App.tsx.
  // Dashboard apenas verifica se havia token na URL para mostrar erro caso App.tsx não consiga.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) return;
    // Se o token ainda está na URL, significa que App.tsx ainda não processou.
    // Esperar um pouco antes de tentar — dar prioridade ao App.tsx.
    const timer = setTimeout(() => {
      // Verificar se token foi removido da URL (App.tsx já processou)
      const currentParams = new URLSearchParams(window.location.search);
      if (!currentParams.get("token")) return; // App.tsx já tratou
      // Se ainda está aqui, mostrar erro
      setAutologinError("⚠️ Este link expirou ou já foi usado. Solicite um novo link pelo WhatsApp.");
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // V23i: Aguardar antes de redirecionar para login
    // Verifica sessão Supabase em localStorage antes de redirecionar
    if (!isLoading && !isAuthenticated && !autologinLoading && !autologinError) {
      const timer = setTimeout(async () => {
        // V23i: Verificar se existe sessão Supabase persistida (localStorage)
        // Pode ser que o react-query ainda não buscou, mas a sessão existe
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            console.log("[DASHBOARD] Sessão Supabase encontrada em localStorage, invalidando query...");
            await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
            return; // NÃO redirecionar - sessão existe
          }
        } catch (e) {
          console.warn("[DASHBOARD] Erro ao verificar sessão Supabase:", e);
        }

        // 🔄 ANTES de redirecionar, tenta refresh da sessão
        try {
          console.log("[DASHBOARD] Não autenticado, tentando refresh antes de redirecionar...");
          const refreshed = await refreshSession();
          if (refreshed) {
            console.log("[DASHBOARD] ✅ Refresh bem sucedido, cancelando redirect");
            queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
            return;
          }
        } catch (e) {
          console.warn("[DASHBOARD] Erro ao tentar refresh:", e);
        }

        // Verificar novamente se virou autenticado
        const currentUser = queryClient.getQueryData(["/api/auth/user"]);
        if (currentUser) {
          console.log("[DASHBOARD] Usuário encontrado no cache após refresh, cancelando redirect");
          return;
        }
        
        // Realmente não autenticado - redirecionar
        toast({
          title: "Não autorizado",
          description: "Você precisa fazer login. Redirecionando...",
          variant: "destructive",
        });
        setTimeout(() => {
          setLocation("/login");
        }, 500);
      }, 3000); // V23i: 3 segundos (antes 2s) - mais tempo para sessão propagar
      
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isLoading, toast, setLocation, autologinLoading, autologinError]);

  const { data: connectionQueryData } = useQuery<WhatsappConnection>({
    queryKey: ["/api/whatsapp/connection"],
    enabled: !!isAuthenticated && !shouldUseDashboardBootstrap,
    staleTime: 15000,
  });
  const connection = connectionQueryData ?? dashboardBootstrap?.primaryConnection ?? undefined;

  const { data: agentConfig } = useQuery<AiAgentConfig | null>({
    queryKey: ["/api/agent/config"],
    enabled: !!isAuthenticated,
    staleTime: 60000,
  });

  // Query para buscar os dados da conversa selecionada (para o painel de detalhes)
  const { data: selectedConversation } = useQuery<Conversation>({
    queryKey: ["/api/conversation", selectedConversationId],
    enabled: !!selectedConversationId,
  });

type ToolNavItem = {
  label: string;
  icon: LucideIcon;
  tooltip: string;
  isActive: boolean;
  testId: string;
  href?: string;
  action?: () => void;
  subItems?: ToolNavItem[];
};

const toolsNavigation: ToolNavItem[] = [
  { label: "Inteligência Artificial",
    icon: Bot,
    tooltip: "Meu Agente IA",
    isActive:
      (isDashboardMode && selectedView === "agent") ||
      (isMeuAgenteRoute && !["flow", "flow2"].includes(new URLSearchParams(search).get("tab") || "")),
    testId: "button-nav-ai",
    action: () => {
      goToSection("agent");
    },
  },
  {
    label: "Fluxo 2.0",
    href: "/meu-agente-ia?tab=flow2",
    icon: Workflow,
    tooltip: "Editor visual isolado estilo Leona",
    isActive: isMeuAgenteRoute && new URLSearchParams(search).get("tab") === "flow2",
    testId: "button-nav-flow2-leona",
  },
  { 
    label: "🏪 Ferramentas por Segmento", 
    href: "/ferramentas",
    icon: Wrench, 
    tooltip: "Ferramentas personalizadas por tipo de negócio", 
    isActive: isToolsMenuRoute || isToolsSegmentRoute, 
    testId: "button-nav-tools-menu",
  },
  {
    label: "QR Code WhatsApp",
    href: "/qrcode-whatsapp",
    icon: QrCode,
    tooltip: "Gerar QR para abrir o WhatsApp com mensagem pronta",
    isActive: isWhatsappQrRoute,
    testId: "button-nav-whatsapp-qr",
  },
  ...(canAccessDelivery2
    ? [{
        label: "🍕 Delivery 2.0",
        href: "/delivery-2",
        icon: ShoppingBag,
        tooltip: "PDV online com pedidos extraidos direto do prompt",
        isActive: isDelivery2Route,
        testId: "button-nav-delivery2",
      } as ToolNavItem]
    : []),
  ...(shouldRenderLegacyDeliveryMenu
    ? [
        { label: "🍕 Delivery", href: "/delivery-cardapio", icon: UtensilsCrossed, tooltip: "Cardápio e pedidos do delivery", isActive: isDeliveryMenuRoute, testId: "button-nav-delivery-menu" },
        { label: "🍕 Delivery · Pedidos", href: "/delivery-pedidos", icon: ClipboardList, tooltip: "Painel de pedidos delivery", isActive: isDeliveryOrdersRoute, testId: "button-nav-delivery-orders" },
        { label: "🍕 Delivery · Relatórios", href: "/delivery-relatorios", icon: ClipboardList, tooltip: "Relatórios de vendas e faturamento", isActive: isDeliveryReportsRoute, testId: "button-nav-delivery-reports" },
      ]
    : []),
  { label: "Agenda Inteligente", href: "/agendamento-3", icon: CalendarClock, tooltip: "Confirma horarios pela agenda real e ajuda a evitar conflitos", isActive: isAgendamento3Route || isLegacySchedulingModuleRoute || isAgendamento2Route, testId: "button-nav-agendamento3" },
  { label: "Follow-up Inteligente", href: "/followup", icon: Sparkles, tooltip: "Mensagens automáticas para recuperar conversas", isActive: isFollowupRoute, testId: "button-nav-followup" },
  { label: "Lista de Exclusão", href: "/lista-exclusao", icon: Ban, tooltip: "Números que a IA não deve responder", isActive: isExclusionListRoute, testId: "button-nav-exclusion-list" },
  // Tickets removido de Ferramentas - agora está no menu principal como "Suporte"
  { label: "Falar por Áudio", href: "/falar-por-audio", icon: Mic, tooltip: "Respostas em audio por voz", isActive: isAudioConfigRoute, testId: "button-nav-audio-config" },
  { label: "Postagens no Status", href: "/postagens-status", icon: Rocket, tooltip: "Status automático com agendamento e rotação", isActive: isStatusPostsRoute, testId: "button-nav-status-posts" },
  { label: "Notificador Inteligente", href: "/notificador", icon: Bell, tooltip: "Notificações automáticas", isActive: isNotifierRoute, testId: "button-nav-notifier" },
  { label: "Biblioteca de Mídias", href: "/biblioteca-midias", icon: Upload, tooltip: "Áudios, imagens e vídeos do agente", isActive: isMediaLibraryRoute, testId: "button-nav-media-library" },
  { label: "Fila de Atenção", href: "/qualificacao", icon: AlertCircle, tooltip: "Prioridade de atendimento por IA", isActive: isLeadQualificationRoute, testId: "button-nav-lead-qualification" },
  { label: "Cursos", href: "/cursos", icon: BookUser, tooltip: "Módulo de agendamento de cursos com a IA", isActive: isCoursesRoute, testId: "button-nav-courses" },
  { label: "🎨 Estamparia", href: "/estamparia", icon: Palette, tooltip: "Briefing, arte com IA e aprovação do cliente", isActive: isEstampariaRoute, testId: "button-nav-estamparia" },
  { label: "Envio em Massa", href: "/envio-em-massa", icon: Send, tooltip: "Envio em massa", isActive: isMassSendRoute, testId: "button-nav-masssend" },
  { label: "Indique e Ganhe", href: "/indicacoes", icon: Gift, tooltip: "Programa de indicação e carteira", isActive: isReferralHubRoute, testId: "button-nav-referrals" },
  { label: "Listas de Contatos", href: "/listas-contatos", icon: BookUser, tooltip: "Gerenciar listas de contatos", isActive: isContactListsRoute, testId: "button-nav-contact-lists" },
  { label: "Campanhas", href: "/campanhas", icon: Megaphone, tooltip: "Campanhas", isActive: isCampaignsRoute, testId: "button-nav-campaigns" },
  { label: "Kanban", href: "/kanban", icon: Kanban, tooltip: "Kanban", isActive: isKanbanRoute, testId: "button-nav-kanban" },
    { label: "Contatos", href: "/contatos", icon: Users, tooltip: "Contatos", isActive: isContactsRoute, testId: "button-nav-contacts" },
    { label: "Contatos Sincronizados", href: "/contatos-sincronizados", icon: Smartphone, tooltip: "Contatos do WhatsApp", isActive: isSyncedContactsRoute, testId: "button-nav-synced-contacts" },
    { label: "Etiquetas", href: "/etiquetas", icon: Tags, tooltip: "Etiquetas", isActive: isTagsRoute, testId: "button-nav-tags" },
    { label: "Campos Personalizados", href: "/campos-personalizados", icon: FormInput, tooltip: "Campos personalizados de contatos", isActive: isCustomFieldsRoute, testId: "button-nav-custom-fields" },
    { label: "Catálogo de Produtos", href: "/produtos", icon: Package, tooltip: "Lista de produtos e preços", isActive: isProductsRoute, testId: "button-nav-products" },
    { label: "Funil", href: "/funil", icon: Filter, tooltip: "Funil de vendas", isActive: isFunnelRoute, testId: "button-nav-funnel" },
  { label: "Imobiliária", href: "/integracoes", icon: Plug, tooltip: "XML de imóveis e leads do ZAP/Viva Real/OLX", isActive: isIntegrationsRoute, testId: "button-nav-grupo-zap" },
    ...(canAccessMetaFormulario
      ? [{
          label: "Formulário Meta",
          href: "/meta-formulario",
          icon: FormInput,
          tooltip: "Leads da Meta via Google Sheets e WhatsApp",
          isActive: isMetaFormularioRoute,
          testId: "button-nav-meta-form",
        } as ToolNavItem]
      : []),
    { label: "Reservas", href: "/reservas", icon: BedDouble, tooltip: "Reservas", isActive: isReservationsRoute, testId: "button-nav-reservations" },
  ];

  const managementNavigation: ToolNavItem[] = !isMember
    ? [
        {
          label: "Membros",
          href: "/membros",
          icon: Users,
          tooltip: "Gerenciar logins e permissoes da equipe",
          isActive: isMembersRoute,
          testId: "button-nav-team-members",
        },
        {
          label: "Setores",
          href: "/setores",
          icon: Workflow,
          tooltip: "Organizar setores, handoff e relatorios",
          isActive: isSectorsRoute,
          testId: "button-nav-sectors",
        },
        ...(canAccessOwnerAdminPanel
          ? [{
              label: "Administrador",
              href: "/administrador",
              icon: Bell,
              tooltip: "Agenda, histórico, boas-vindas e broadcast da conta principal",
              isActive: isAdministradorRoute,
              testId: "button-nav-owner-admin",
            }]
          : []),
      ]
    : [];

  // Menu de Configurações separado do Ferramentas
  const configNavigation: ToolNavItem[] = [
    { label: "Configurações", href: "/settings", icon: Settings, tooltip: "Configurações da conta", isActive: isSettingsRoute, testId: "button-settings" },
    { label: "Minha Assinatura", href: "/minha-assinatura", icon: Receipt, tooltip: "Ver minha assinatura e pagamentos", isActive: isMySubscriptionRoute, testId: "button-nav-my-subscription" },
    { label: "Uso e Faturamento", icon: Wallet, tooltip: "Ver pagamento, assinatura e créditos", isActive: billingDialogOpen, testId: "button-nav-billing-details", action: () => setBillingDialogOpen(true) },
    { label: "Planos", href: "/plans", icon: CreditCard, tooltip: "Ver planos disponíveis", isActive: isPlansRoute || isSubscribeRoute, testId: "button-nav-plans" },
    { label: "Implementação", href: "/implementacao", icon: Wrench, tooltip: "Pagar implementação com código do time AgenteZap", isActive: isImplementationRoute, testId: "button-nav-implementation" },
  ];

  const filteredToolsNavigation = toolsNavigation.filter(item => {
    if (!isMember) return true;

    return !!item.href && canMemberAccessPath(item.href, permissions);
  });

  const filteredConfigNavigation = configNavigation.filter(item => {
    if (!isMember) return true;
    return item.href === "/settings";
  });
  const canAccessDashboardView = !isMember || permissions.canViewDashboard;
  const canAccessConversationsView = !isMember || permissions.canViewConversations;
  const canAccessConnectionView = !isMember;
  const canAccessAgentView = !isMember;
  const canAccessHelpCenter = !isMember;
  const canAccessTrainingCourse = !isMember;
  const canAccessReferrals = !isMember;
  const canAccessToolsMenu = !isMember || filteredToolsNavigation.length > 0;
  const contextualCourseVideo =
    canAccessTrainingCourse && !isTrainingCourseRoute ? getCourseVideoForPath(location) : null;
  const contextualCourseHref = contextualCourseVideo ? getCourseArticleHref(contextualCourseVideo) : null;

  const syncSidebarScrollState = () => {
    const scrollContainer = sidebarScrollRef.current;
    if (!scrollContainer || !sidebarOpen) {
      setSidebarHasHiddenItems(false);
      return;
    }

    const maxScrollTop = Math.max(scrollContainer.scrollHeight - scrollContainer.clientHeight, 0);
    setSidebarHasHiddenItems(maxScrollTop > 12 && scrollContainer.scrollTop < maxScrollTop - 12);
  };

  useEffect(() => {
    const scrollContainer = sidebarScrollRef.current;
    if (!scrollContainer) {
      setSidebarHasHiddenItems(false);
      return;
    }

    let frame = 0;
    const scheduleSync = () => {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        syncSidebarScrollState();
      });
    };

    scheduleSync();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleSync) : null;

    resizeObserver?.observe(scrollContainer);
    window.addEventListener("resize", scheduleSync);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleSync);
    };
  }, [
    filteredToolsNavigation.length,
    filteredConfigNavigation.length,
    managementNavigation.length,
    sidebarOpen,
  ]);

  const handleMoreTools = () => {
    const scrollContainer = sidebarScrollRef.current;
    if (!scrollContainer || !sidebarOpen) {
      setLocation("/ferramentas");
      return;
    }

    const maxScrollTop = Math.max(scrollContainer.scrollHeight - scrollContainer.clientHeight, 0);
    const canRevealMore = maxScrollTop > 12 && scrollContainer.scrollTop < maxScrollTop - 12;

    if (canRevealMore) {
      scrollContainer.scrollTo({ top: maxScrollTop, behavior: "smooth" });
      return;
    }

    setLocation("/ferramentas");
  };

  const memberDefaultPath = getMemberDefaultPath(permissions);
  const mobileNavItemsCount = [
    canAccessDashboardView,
    canAccessConversationsView,
    canAccessConnectionView,
    canAccessAgentView,
    canAccessToolsMenu,
  ].filter(Boolean).length;
  const mobileNavColumns =
    mobileNavItemsCount >= 6 ? "grid-cols-6" :
    mobileNavItemsCount === 5 ? "grid-cols-5" :
    mobileNavItemsCount === 4 ? "grid-cols-4" :
    mobileNavItemsCount === 3 ? "grid-cols-3" :
    mobileNavItemsCount === 2 ? "grid-cols-2" :
    "grid-cols-1";
  const canStayOnCurrentRouteForMember =
    (isDashboardMode && canAccessDashboardView) ||
    canMemberAccessPath(location, permissions) ||
    (isToolsMenuRoute && canAccessToolsMenu);
  const mobilePrimaryNavigation: ToolNavItem[] = [
    ...(canAccessDashboardView
      ? [{
          label: "Dashboard",
          icon: LayoutDashboard,
          tooltip: "Visão geral",
          isActive: isDashboardMode && selectedView === "stats",
          testId: "button-mobile-menu-dashboard",
          action: () => goToSection("stats"),
        }]
      : []),
    ...(canAccessConversationsView
      ? [{
          label: "Conversas",
          icon: MessageCircle,
          tooltip: "Conversas",
          isActive: isDashboardMode && selectedView === "conversations",
          testId: "button-mobile-menu-conversations",
          action: () => goToSection("conversations"),
        }]
      : []),
    ...(canAccessConnectionView
      ? [{
          label: "Conexão",
          icon: Smartphone,
          tooltip: "Conexão WhatsApp",
          isActive: isDashboardMode && selectedView === "connection",
          testId: "button-mobile-menu-connection",
          action: () => goToSection("connection"),
        }]
      : []),
    ...(canAccessAgentView
      ? [{
          label: "Meu Agente IA",
          icon: Bot,
          tooltip: "Meu Agente IA",
          isActive: isDashboardMode && selectedView === "agent",
          testId: "button-mobile-menu-agent",
          action: () => goToSection("agent"),
        }]
      : []),
    ...(canAccessHelpCenter
      ? [{
          label: "Central de Ajuda",
          icon: BookUser,
          tooltip: "Central de Ajuda",
          isActive: isHelpCenterRoute,
          testId: "button-mobile-menu-help-center",
          href: "/ajuda",
        }]
      : []),
    ...(canAccessTrainingCourse
      ? [{
          label: "Curso AgenteZap",
          icon: BookOpen,
          tooltip: "Curso em video dentro do painel",
          isActive: isTrainingCourseRoute,
          testId: "button-mobile-menu-training-course",
          href: "/curso-agentezap",
        }]
      : []),
    ...(contextualCourseVideo && contextualCourseHref
      ? [{
          label: "Aula desta pagina",
          icon: BookOpen,
          tooltip: contextualCourseVideo.title,
          isActive: false,
          testId: "button-mobile-menu-contextual-course",
          href: contextualCourseHref,
        }]
      : []),
  ];
  const mobileResellerNavigation: ToolNavItem[] =
    isReseller && !isMember
      ? [{
          label: "Minha Revenda",
          icon: Building2,
          tooltip: "Painel de Revenda",
          isActive: location === "/revenda",
          testId: "button-mobile-menu-reseller",
          href: "/revenda",
        }]
      : [];
  const mobileMainNavigation: ToolNavItem[] = [
    ...mobilePrimaryNavigation,
    ...managementNavigation,
    ...mobileResellerNavigation,
  ];

  useEffect(() => {
    if (!isMember) {
      return;
    }

    if (!canStayOnCurrentRouteForMember && location !== memberDefaultPath) {
      setLocation(memberDefaultPath);
    }
  }, [
    canAccessDashboardView,
    canStayOnCurrentRouteForMember,
    canAccessToolsMenu,
    isDashboardMode,
    isMember,
    isToolsMenuRoute,
    location,
    memberDefaultPath,
    setLocation,
  ]);

  const currentBillingSubscription = (billingDetails?.subscription || subscription || null) as any;
  const currentBillingPlan = (currentBillingSubscription?.plan || (billingDetails as any)?.plan || null) as any;
  const referralShareUrl = referralDashboard?.link?.shareUrl || "";
  const referralStats = (referralDashboard?.stats || {}) as NonNullable<ReferralDashboardSummary["stats"]>;

  const isDashboardBootstrapping = shouldUseDashboardBootstrap && !dashboardBootstrap;

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Banner de Suspensão - Prioridade máxima */}
      {isSuspended && (
        <SuspensionBanner 
          suspensionReason={suspensionStatus?.reason}
          suspensionType={suspensionStatus?.type}
          refundedAt={suspensionStatus?.refundedAt}
          refundAmount={suspensionStatus?.refundAmount}
        />
      )}
      
      {/* Banner fixo no topo quando limite atingido (só mostra se não estiver suspenso) */}
      {!isSuspended && !isDashboardBootstrapping && <LimitReachedTopBanner />}
      <Delivery2OrderNotifier />
      <DeliveryOrderNotifier />
      
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center justify-between px-1 py-1">
            {sidebarOpen && (
              <div className="flex items-center gap-2 text-[15px] font-semibold animate-in fade-in zoom-in-95 duration-200">
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt={branding.companyName} className="h-7 w-7 rounded-lg object-contain" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm">
                    <Bot className="h-4 w-4" />
                  </span>
                )}
                <span className="truncate" style={branding.isWhiteLabel ? { color: branding.primaryColor } : undefined}>
                  {branding.companyName}
                </span>
              </div>
            )}
            <SidebarTrigger className={cn("h-8 w-8 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent", !sidebarOpen && "mx-auto")} />
          </div>
        </SidebarHeader>
        <SidebarContent
          ref={sidebarScrollRef}
          onScroll={syncSidebarScrollState}
          className="relative"
        >
          <SidebarGroup>
            <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
            <SidebarMenu>
              {canAccessDashboardView && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => goToSection("stats")}
                  isActive={isDashboardMode && selectedView === "stats"}
                  tooltip="Visão geral"
                  data-testid="button-nav-stats"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              )}
              {canAccessConversationsView && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => goToSection("conversations")}
                  isActive={isDashboardMode && selectedView === "conversations"}
                  tooltip="Conversas"
                  data-testid="button-nav-conversations"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Conversas</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              )}
              {canAccessConnectionView && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => goToSection("connection")}
                  isActive={isDashboardMode && selectedView === "connection"}
                  tooltip="Conexão WhatsApp"
                  data-testid="button-nav-connection"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Conexão</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              )}
               
              {/* Meu Agente IA: Apenas dono pode configurar */}
              {canAccessAgentView && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => goToSection("agent")}
                  isActive={isDashboardMode && selectedView === "agent"}
                  tooltip="Meu Agente IA"
                  data-testid="button-nav-agent"
                >
                  <Bot className="w-4 h-4" />
                  <span>Meu Agente IA</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              )}

              {canAccessHelpCenter && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isHelpCenterRoute}
                  tooltip="Central de Ajuda"
                  data-testid="button-nav-help-center"
                >
                  <Link href="/ajuda">
                    <BookUser className="w-4 h-4" />
                    <span>Central de Ajuda</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              )}

              {canAccessTrainingCourse && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isTrainingCourseRoute}
                  tooltip="Curso em video dentro do painel"
                  data-testid="button-nav-training-course"
                >
                  <Link href="/curso-agentezap">
                    <BookOpen className="w-4 h-4" />
                    <span>Curso AgenteZap</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              )}

              {contextualCourseVideo && contextualCourseHref && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip={contextualCourseVideo.title}
                  data-testid="button-nav-contextual-course"
                >
                  <Link href={contextualCourseHref}>
                    <BookOpen className="w-4 h-4" />
                    <span>Aula desta pagina</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              )}

              {managementNavigation.map((item) => (
                <SidebarMenuItem key={item.testId}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.tooltip}
                    isActive={item.isActive}
                    data-testid={item.testId}
                  >
                    <Link href={item.href!}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {/* Menu de Revenda - visível apenas para revendedores (nunca para membros) */}
              {isReseller && !isMember && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="Painel de Revenda"
                    data-testid="button-nav-reseller"
                  >
                    <Link href="/revenda">
                      <Building2 className="w-4 h-4" />
                      <span>Minha Revenda</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroup>
          {canAccessToolsMenu && (
            <>
              <SidebarSeparator />
              <SidebarGroup className="pt-0">
                <SidebarGroupLabel>Ferramentas</SidebarGroupLabel>
                <SidebarMenu>
                  {filteredToolsNavigation.map((item) => (
                    <SidebarMenuItem key={item.testId}>
                      {item.href ? (
                        <SidebarMenuButton
                          asChild
                          tooltip={item.tooltip}
                          isActive={item.isActive}
                          data-testid={item.testId}
                          className="rounded-xl"
                        >
                          <Link href={item.href}>
                            <item.icon className="w-4 h-4" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton
                          tooltip={item.tooltip}
                          isActive={item.isActive}
                          data-testid={item.testId}
                          onClick={item.action}
                          className="rounded-xl"
                        >
                          <item.icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            </>
          )}

          {filteredConfigNavigation.length > 0 && (
            <>
              <SidebarSeparator />
              <SidebarGroup className="pt-0">
                <SidebarGroupLabel>Conta</SidebarGroupLabel>
                <SidebarMenu>
                  {filteredConfigNavigation.map((item) => (
                    <SidebarMenuItem key={item.testId}>
                      {item.href ? (
                        <SidebarMenuButton
                          asChild
                          tooltip={item.tooltip}
                          isActive={item.isActive}
                          data-testid={item.testId}
                          className="rounded-xl"
                        >
                          <Link href={item.href}>
                            <item.icon className="w-4 h-4" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton
                          tooltip={item.tooltip}
                          isActive={item.isActive}
                          data-testid={item.testId}
                          className="rounded-xl"
                          onClick={item.action}
                        >
                          <item.icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            </>
          )}
          {sidebarHasHiddenItems && (
            <div className="pointer-events-none sticky bottom-0 z-10 -mt-8 h-8 bg-gradient-to-t from-sidebar via-sidebar/95 to-transparent" />
          )}
        </SidebarContent>
        <SidebarSeparator />
        <SidebarFooter>
          <SidebarMenu>
            {canAccessReferrals && (
              <SidebarMenuItem>
                <button
                  type="button"
                  onClick={() => setReferralInviteOpen(true)}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-xl border border-sidebar-border/70 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50",
                    !sidebarOpen && "h-11 justify-center p-0"
                  )}
                  data-testid="button-sidebar-referral-popup"
                  aria-label="Compartilhe AgenteZap com amigos"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 group-hover:bg-white">
                    <Gift className="h-4 w-4" />
                  </span>
                  {sidebarOpen && (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold leading-tight text-slate-950">
                          Compartilhe AgenteZap com ...
                        </span>
                        <span className="block truncate text-xs text-slate-500">Receba R$50 cada</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </>
                  )}
                </button>
              </SidebarMenuItem>
            )}
            {canAccessToolsMenu && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={
                    sidebarHasHiddenItems
                      ? "Rolar para revelar mais ferramentas"
                      : "Abrir central completa de ferramentas"
                  }
                  data-testid="button-nav-more-tools"
                  onClick={handleMoreTools}
                  className={cn(
                    "rounded-xl border border-sidebar-border/70 bg-background/85",
                    sidebarHasHiddenItems && "text-primary shadow-sm"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Wrench className="w-4 h-4" />
                    <span>Mais Ferramentas</span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Sair" data-testid="button-logout" onClick={handleLogout}>
                <span className="flex items-center gap-2">
                  <LogOut className="w-4 h-4" />
                  <span>Sair</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {/* Lógica dinâmica de botões baseada no plano ativo */}
            {(() => {
              // Use canonical entitlement (considers reseller + SaaS + expiration)
              const hasActiveSub = isEffectivelyPaid;
              const planTipo = subscription?.plan?.tipo;
              const planPeriodicidade = subscription?.plan?.periodicidade;
              const isMensal = hasActiveSub && (planTipo === 'padrao' || planTipo === 'mensal' || (!planTipo && planPeriodicidade === 'mensal'));
              const isAnual = hasActiveSub && planTipo === 'anual';
              const isImplementacao = hasActiveSub && planTipo === 'implementacao';

              // Se não tem plano ativo, mostra o botão principal
              if (!hasActiveSub) {
                const planName = assignedPlanData?.nome || 'Plano Ilimitado';
                
                return (
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      tooltip={`Assinar ${planName}`}
                      className="mt-2 bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-700 hover:to-violet-700 hover:text-white transition-all duration-300 shadow-md"
                    >
                      <a href="https://agentezap.online/plans" rel="noopener noreferrer" className="flex items-center gap-2 font-bold justify-center">
                        <Rocket className="w-4 h-4 animate-pulse" />
                        <span>{planName}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }
              
              // Tem plano mensal: mostrar acesso rápido ao catálogo e à implementação
              if (isMensal) {
                return (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton 
                        asChild 
                        tooltip="Ver outros planos" 
                        className="mt-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 hover:text-white transition-all duration-300 shadow-md"
                      >
                        <a href="https://agentezap.online/implementacao" rel="noopener noreferrer" className="flex items-center gap-2 font-bold justify-center">
                          <Rocket className="w-4 h-4" />
                          <span>Ver planos</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton 
                        asChild 
                        tooltip="Configuração VIP completa" 
                        className="mt-1 bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 hover:text-white transition-all duration-300 shadow-md"
                      >
                        <a href="https://agentezap.online/implementacao" rel="noopener noreferrer" className="flex items-center gap-2 font-bold justify-center">
                          <Wrench className="w-4 h-4" />
                          <span>Implementação VIP</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                );
              }
              
              // Tem plano anual: mostrar só implementação
              if (isAnual) {
                return (
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      tooltip="Configuração VIP completa" 
                      className="mt-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 hover:text-white transition-all duration-300 shadow-md"
                    >
                      <a href="https://agentezap.online/plans" rel="noopener noreferrer" className="flex items-center gap-2 font-bold justify-center">
                        <Wrench className="w-4 h-4" />
                        <span>Implementação VIP</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }
              
              // Tem implementação: mostrar acesso rápido ao catálogo
              if (isImplementacao) {
                return (
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      tooltip="Ver outros planos" 
                      className="mt-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 hover:text-white transition-all duration-300 shadow-md"
                    >
                      <a href="https://agentezap.online/plans" rel="noopener noreferrer" className="flex items-center gap-2 font-bold justify-center">
                        <Rocket className="w-4 h-4" />
                        <span>Ver planos</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }
              
              return null;
            })()}
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="flex h-screen flex-col overflow-hidden">
        {/* Mobile Header com logo e botão sair */}
        {!isConversasRoute && !(isDashboardMode && selectedView === "conversations") && (
          <div className="md:hidden sticky top-0 z-50 bg-background border-b border-border/60">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt={branding.companyName} className="w-6 h-6 object-contain" />
                ) : (
                  <Bot className="w-6 h-6 text-primary" />
                )}
                <span className="font-bold text-lg" style={branding.isWhiteLabel ? { color: branding.primaryColor } : undefined}>
                  {branding.companyName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleLogout}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="w-4 h-4 mr-1" />
                  Sair
                </Button>
              </div>
            </div>
            {/* Sticky CTA de upgrade - Ocultar na tela de criação de agente para priorizar o input */}
            {/* Use canonical entitlement: hide if user is effectively paid (SaaS or reseller) */}
            {!isEffectivelyPaid && !isMeuAgenteRoute && selectedView !== "agent" && (
              <UpgradeBanner />
            )}
          </div>
        )}
        <div
          className={cn(
            "flex min-h-0 w-full flex-1 overflow-hidden md:pb-0",
            // No /conversas o próprio chat controla o espaço do input mobile.
            (isConversasRoute || (isDashboardMode && selectedView === "conversations"))
              ? "pb-0"
              : "pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
          )}
        >
          {isDashboardBootstrapping ? (
            <div className="h-full w-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Carregando painel...</p>
              </div>
            </div>
          ) : (
          <SubscriptionActionGate>
          {isPlansRoute && (
            <div className="fixed inset-0 z-[90] overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined" && window.history.length > 1) {
                    window.history.back();
                    return;
                  }

                  setLocation("/");
                }}
                className="absolute right-3 top-3 z-[95] inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-950 sm:right-5 sm:top-5"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Fechar planos</span>
              </button>

              <div className="h-full overflow-y-auto">
                <PlansPage />
              </div>
            </div>
          )}
          {isImplementationRoute && (
            <div className="fixed inset-0 z-[90] overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined" && window.history.length > 1) {
                    window.history.back();
                    return;
                  }

                  setLocation("/");
                }}
                className="absolute right-3 top-3 z-[95] inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-950 sm:right-5 sm:top-5"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Fechar implementação</span>
              </button>

              <div className="h-full overflow-y-auto">
                <ImplementationPage />
              </div>
            </div>
          )}
          {isMassSendRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <MassSendPage />
            </div>
          )}
          {isReferralHubRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <ReferralHubPage />
            </div>
          )}
          {isContactListsRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <ContactListsPage />
            </div>
          )}
          {isCampaignsRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <CampaignsPage />
            </div>
          )}
          {isKanbanRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <KanbanPage />
            </div>
          )}
          {isContactsRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <ContactsPage />
            </div>
          )}
          {isSyncedContactsRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <SyncedContactsPage />
            </div>
          )}
          {isTagsRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <TagsPage />
            </div>
          )}
          {isFunnelRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <FunnelPage />
            </div>
          )}
          {isIntegrationsRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <IntegrationsPage />
            </div>
          )}
          {isMetaFormularioRoute && canAccessMetaFormulario && (
            <div className="flex-1 min-h-0 overflow-auto">
              <MetaFormularioPage />
            </div>
          )}
          {isLeadQualificationRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <LeadQualificationPage />
            </div>
          )}
          {isCoursesRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <CourseSchedulingInsightsPage />
            </div>
          )}
          {isAgendamento3Route && (
            <div className="flex-1 min-h-0 overflow-auto">
              <Agendamento3AgenticPage />
            </div>
          )}
          {(isAgendamento2Route || isLegacySchedulingModuleRoute) && (
            <div className="flex-1 min-h-0 overflow-auto">
              <Agendamento3AgenticPage />
            </div>
          )}
          {isEstampariaRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              {isEstampariaDetailRoute ? <EstampariaDetailPage /> : <EstampariaPage />}
            </div>
          )}
          {isMediaLibraryRoute && (
            <div className="flex-1 min-h-0 overflow-auto p-6">
              <MediaLibraryPage />
            </div>
          )}
          {isStatusPostsRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <StatusPostsPage />
            </div>
          )}
          {isReservationsRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <ReservationsPage />
            </div>
          )}
          {isSettingsRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <SettingsPage />
            </div>
          )}
          {isMembersRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <TeamMembersPage />
            </div>
          )}
          {isSpecialistRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <SpecialistPage />
            </div>
          )}
          {isSectorsRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <SectorsPage />
            </div>
          )}
          {isSubscribeRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <SubscribePage />
            </div>
          )}
          {isNotifierRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <SmartNotifierPage />
            </div>
          )}
          {isAdministradorRoute && canAccessOwnerAdminPanel && (
            <OwnerAdminPanel />
          )}
          {isFollowupRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <FollowupConfigPage />
            </div>
          )}
          {isPaymentHistoryRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <PaymentHistoryPage />
            </div>
          )}
          {isMySubscriptionRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <MySubscriptionPage />
            </div>
          )}
          {isExclusionListRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <ExclusionListPage />
            </div>
          )}
          {isCustomFieldsRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <CustomFieldsPage />
            </div>
          )}
          {isProductsRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <ProductsPage />
            </div>
          )}
          {isDelivery2Route && (
            <div className="flex-1 min-h-0 overflow-auto">
              <Delivery2Page />
            </div>
          )}
          {shouldBlockLegacyDeliveryRoute && (
            <div className="flex flex-1 items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Redirecionando para o Delivery 2.0...</p>
              </div>
            </div>
          )}
          {!shouldBlockLegacyDeliveryRoute && isDeliveryMenuRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              {shouldHideLegacyDelivery ? <Delivery2Page /> : <DeliveryMenuPage />}
            </div>
          )}
          {!shouldBlockLegacyDeliveryRoute && isDeliveryOrdersRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              {shouldHideLegacyDelivery ? <Delivery2Page /> : <DeliveryOrdersPage />}
            </div>
          )}
          {!shouldBlockLegacyDeliveryRoute && isDeliveryReportsRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              {shouldHideLegacyDelivery ? <Delivery2Page /> : <DeliveryReportsPage />}
            </div>
          )}
          {isAudioConfigRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <AudioConfigPage />
            </div>
          )}
          {isFlowBuilderRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <FlowBuilderPage />
            </div>
          )}
          {isToolsMenuRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <ToolsMenuPage />
            </div>
          )}
          {isToolsSegmentRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <ToolsSegmentPage />
            </div>
          )}
          {isWhatsappQrRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <WhatsAppQrGeneratorPage />
            </div>
          )}
          
          {isTicketsNewRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <TicketCreatePage />
            </div>
          )}
          
          {isTicketsDetailRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <TicketDetailPage />
            </div>
          )}
          
          {isTicketsRoute && !isTicketsNewRoute && !isTicketsDetailRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <TicketsPage />
            </div>
          )}

          {canAccessHelpCenter && isHelpCenterRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <HelpCenterPage />
            </div>
          )}

          {canAccessTrainingCourse && isTrainingCourseRoute && (
            <div className="flex-1 min-h-0 overflow-auto">
              <TrainingCoursePage />
            </div>
          )}

          {/* Dashboard Stats */}
          {canAccessDashboardView && isDashboardMode && selectedView === "stats" && (
            <div className="flex-1 min-h-0 overflow-auto">
              {isDashboardBootstrapping ? (
                <div className="h-full w-full flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground">Carregando painel...</p>
                  </div>
                </div>
              ) : (
                <DashboardStats connection={connection} />
              )}
            </div>
          )}

          {/* Connection Panel */}
          {canAccessConnectionView && (isConexaoRoute || (isDashboardMode && selectedView === "connection")) && (
            <div className="flex-1 min-h-0 overflow-auto">
              {autologinLoading && !isAuthenticated ? (
                <div className="h-full w-full flex items-center justify-center">
                  <div className="text-sm text-muted-foreground">Autenticando... Aguarde.</div>
                </div>
              ) : autologinError && !isAuthenticated ? (
                <div className="p-4">
                  <Card className="border-amber-200 bg-amber-50 text-amber-800">{autologinError}</Card>
                </div>
              ) : (
                isAuthenticated && <ConnectionPanel />
              )}
            </div>
          )}

          {/* My Agent */}
          {canAccessAgentView && (isMeuAgenteRoute || (isDashboardMode && selectedView === "agent")) && (
            <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
              <MyAgent />
            </div>
          )}

          {/* Conversations */}
          {canAccessConversationsView && (isConversasRoute || (isDashboardMode && selectedView === "conversations")) && (
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {isDashboardBootstrapping ? (
                <div className="h-full w-full flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground">Carregando conversas...</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Lista de conversas - esconde no mobile quando uma conversa está selecionada */}
                  <div className={`w-full md:w-[22rem] lg:w-[24rem] xl:w-[25.5rem] border-r bg-card flex flex-col h-full min-h-0 overflow-hidden ${selectedConversationId ? 'hidden md:flex' : 'flex'}`}>
                    <ConversationsList
                      connectionId={connection?.id}
                      selectedConversationId={selectedConversationId}
                      onSelectConversation={handleSelectConversation}
                    />
                  </div>
                  {/* Área do chat - esconde no mobile quando nenhuma conversa está selecionada */}
                  <div className={`flex-1 flex h-full min-h-0 overflow-hidden ${!selectedConversationId ? 'hidden md:flex' : 'flex'}`}>
                    <div className="flex-1 flex min-h-0 flex-col overflow-hidden">
                {false && (
                  <div className="p-4 space-y-3">
                    {!agentConfig && (
                      <Card className="p-4 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
                          <div className="space-y-2">
                            <h3 className="font-semibold text-orange-900 dark:text-orange-100">Configure seu Agente IA</h3>
                            <p className="text-sm text-orange-800 dark:text-orange-200">Defina seu agente para automatizar respostas.</p>
                            <Button variant="outline" size="sm" onClick={() => goToSection("agent")} data-testid="onboarding-configure-agent">
                              <Bot className="w-4 h-4 mr-2" />
                              Configurar Agente
                            </Button>
                          </div>
                        </div>
                      </Card>
                    )}
                    {!connection?.isConnected && (
                      <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                        <div className="flex items-start gap-3">
                          <Smartphone className="w-5 h-5 text-blue-600 mt-0.5" />
                          <div className="space-y-2">
                            <h3 className="font-semibold text-blue-900 dark:text-blue-100">Conecte seu WhatsApp</h3>
                            <p className="text-sm text-blue-800 dark:text-blue-200">Escaneie o QR Code para começar a conversar.</p>
                            <Button variant="outline" size="sm" onClick={() => goToSection("connection")} data-testid="onboarding-connect-whatsapp">
                              Conectar WhatsApp
                            </Button>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>
                )}
                <ChatArea 
                  conversationId={selectedConversationId} 
                  connectionId={connection?.id}
                  onBack={() => handleSelectConversation(null)}
                  onOpenContactPanel={() => setShowContactPanel(true)}
                />
                </div>
                {/* Painel de Detalhes do Contato - apenas desktop */}
                {showContactPanel && selectedConversation && (
                  <div className="hidden md:flex">
                    <ContactDetailsPanel
                      conversation={selectedConversation}
                      connectionId={connection?.id}
                      onClose={() => setShowContactPanel(false)}
                    />
                  </div>
                )}
                  </div>
                </>
              )}
            </div>
          )}
          {shouldShowPlanFeatureBlockDialog && (
            <PlanFeatureLockedScreen
              addonTitle={currentRequiredAddon?.title || "este adicional"}
              onOpenPlans={() => setLocation("/plans")}
              onClose={() => setDismissedPlanFeatureBlockPath(location)}
            />
          )}
          </SubscriptionActionGate>
          )}
        </div>
        <Dialog open={referralInviteOpen} onOpenChange={setReferralInviteOpen}>
          <DialogContent className="max-w-[550px] rounded-3xl border-0 p-0 shadow-2xl">
            <div className="px-6 pb-6 pt-10 sm:px-8">
              <DialogHeader className="items-center text-center">
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-amber-100 bg-amber-50 text-amber-700 shadow-sm">
                  <Mail className="h-10 w-10" />
                </div>
                <DialogTitle className="text-[30px] font-bold leading-tight tracking-tight text-slate-950">
                  Convide para ganhar R$50
                </DialogTitle>
                <DialogDescription className="max-w-[390px] text-center text-base leading-6 text-slate-500">
                  Compartilhe seu link de convite com amigos, ganhe R$50 cada.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-medium text-slate-500">
                <button type="button" className="rounded-lg bg-white px-3 py-2.5 text-slate-950 shadow-sm">
                  Compartilhar na web
                </button>
                <button type="button" className="rounded-lg px-3 py-2.5" disabled>
                  Compartilhar no celular
                </button>
              </div>

              <div className="mt-6 space-y-3">
                <Button
                  type="button"
                  className="h-12 w-full bg-slate-950 text-white hover:bg-slate-800"
                  onClick={copyReferralLink}
                  disabled={!referralShareUrl}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar link de convite
                </Button>
                <Button
                  type="button"
                  className="h-11 w-full bg-blue-600 text-white hover:bg-blue-700"
                  disabled={!referralShareUrl}
                  onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralShareUrl)}`, "_blank")}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Convide amigos do Facebook
                </Button>
                <div className="grid grid-cols-4 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 text-emerald-600"
                    disabled={!referralShareUrl}
                    onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Conheça o AgenteZap: ${referralShareUrl}`)}`, "_blank")}
                    aria-label="Compartilhar no WhatsApp"
                  >
                    <MessageCircle className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    disabled={!referralShareUrl}
                    onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(referralShareUrl)}&text=${encodeURIComponent("Conheça o AgenteZap")}`, "_blank")}
                    aria-label="Compartilhar no X"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 text-blue-700"
                    disabled={!referralShareUrl}
                    onClick={() => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralShareUrl)}`, "_blank")}
                    aria-label="Compartilhar no LinkedIn"
                  >
                    <span className="text-sm font-bold">in</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 text-orange-600"
                    disabled={!referralShareUrl}
                    onClick={() => window.open(`mailto:?subject=Convite AgenteZap&body=${encodeURIComponent(`Use meu link para criar sua conta no AgenteZap: ${referralShareUrl}`)}`, "_blank")}
                    aria-label="Enviar por e-mail"
                  >
                    <Mail className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-slate-950">Enviar e-mail de convite</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_1.35fr_auto]">
                  <Input
                    value={referralInviteName}
                    onChange={(event) => setReferralInviteName(event.target.value)}
                    placeholder="Nome"
                    className="h-11 bg-slate-100"
                  />
                  <Input
                    value={referralInviteEmail}
                    onChange={(event) => setReferralInviteEmail(event.target.value)}
                    placeholder="Digite o endereço de e-mail"
                    type="email"
                    className="h-11 bg-slate-100"
                  />
                  <Button
                    type="button"
                    className="h-11 bg-slate-500 text-white hover:bg-slate-600"
                    disabled={manualReferralMutation.isPending || !referralInviteEmail.trim()}
                    onClick={() => manualReferralMutation.mutate()}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Salvar
                  </Button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 p-3 text-center">
                <div>
                  <p className="text-lg font-bold text-slate-950">{referralStats.totalReferrals || 0}</p>
                  <p className="text-xs text-slate-500">Convites</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-950">{referralStats.convertedReferrals || 0}</p>
                  <p className="text-xs text-slate-500">Assinaram</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-950">{formatBRL(referralStats.availableBalance || 0)}</p>
                  <button
                    type="button"
                    data-testid="button-referral-credit-panel"
                    className="mt-0.5 text-xs font-medium text-teal-700 underline-offset-2 hover:underline"
                    onClick={() => setReferralCreditPanelOpen((open) => !open)}
                  >
                    Crédito
                  </button>
                </div>
              </div>

              {referralCreditPanelOpen && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Saldo disponível</p>
                      <p className="text-xs leading-5 text-slate-500">
                        Use para sacar via Pix ou para abater/antecipar sua próxima fatura.
                      </p>
                    </div>
                    <p className="text-sm font-bold text-teal-700">{formatBRL(referralStats.availableBalance || 0)}</p>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_120px]">
                    <Input
                      value={referralWithdrawPix}
                      onChange={(event) => setReferralWithdrawPix(event.target.value)}
                      placeholder="Número ou chave Pix"
                    />
                    <Input
                      value={referralWithdrawAmount}
                      onChange={(event) => setReferralWithdrawAmount(event.target.value)}
                      placeholder="Valor"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!Number(referralStats.availableBalance || 0) || !referralWithdrawPix.trim() || !referralWithdrawAmount.trim() || withdrawalMutation.isPending}
                      onClick={() => withdrawalMutation.mutate()}
                    >
                      Sacar
                    </Button>
                    <Button
                      type="button"
                      className="bg-teal-700 text-white hover:bg-teal-800"
                      disabled={!Number(referralStats.availableBalance || 0) || applyCreditMutation.isPending}
                      onClick={() => applyCreditMutation.mutate()}
                    >
                      Pagar fatura
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={billingDialogOpen} onOpenChange={setBillingDialogOpen}>
          <DialogContent className="max-w-[980px] overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
            <div className="grid min-h-[560px] grid-cols-1 md:grid-cols-[250px_1fr]">
              <aside className="border-b border-slate-200 bg-slate-50 p-5 md:border-b-0 md:border-r">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{(user as any)?.name || "Conta AgenteZap"}</p>
                    <p className="truncate text-xs text-slate-500">{(user as any)?.email || "Assinatura"}</p>
                  </div>
                </div>
                <div className="mt-6 space-y-1">
                  <button type="button" className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-950 shadow-sm">
                    <Wallet className="h-4 w-4" />
                    Uso e Faturamento
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBillingDialogOpen(false);
                      setReferralInviteOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-white"
                  >
                    <Gift className="h-4 w-4" />
                    Indique e Ganhe
                  </button>
                  <button type="button" onClick={() => setLocation("/minha-assinatura")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-white">
                    <Receipt className="h-4 w-4" />
                    Minha Assinatura
                  </button>
                </div>
              </aside>

              <section className="p-6 sm:p-8">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold text-slate-950">Uso e Faturamento</DialogTitle>
                  <DialogDescription>
                    Resumo do plano, pagamentos aprovados e créditos de indicação disponíveis.
                  </DialogDescription>
                </DialogHeader>

                <div className="mt-6 rounded-xl border border-slate-200 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-serif text-2xl font-bold text-slate-950">
                        {currentBillingPlan?.nome || currentBillingPlan?.name || "Sem assinatura ativa"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Status: <span className="font-semibold text-slate-700">{currentBillingSubscription?.status || "sem plano"}</span>
                      </p>
                    </div>
                    <Button type="button" onClick={() => setLocation("/plans")} className="bg-slate-950 text-white hover:bg-slate-800">
                      Atualizar
                    </Button>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase text-slate-500">Assinatura</p>
                      <p className="mt-2 text-xl font-bold text-slate-950">
                        {formatBRL(currentBillingSubscription?.couponPrice || currentBillingPlan?.valor || currentBillingPlan?.price || 0)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase text-slate-500">Próxima cobrança</p>
                      <p className="mt-2 text-xl font-bold text-slate-950">
                        {formatShortDate(currentBillingSubscription?.nextPaymentDate || currentBillingSubscription?.dataFim)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 p-4">
                      <p className="text-xs font-medium uppercase text-emerald-700">Crédito de indicação</p>
                      <p className="mt-2 text-xl font-bold text-emerald-900">
                        {formatBRL(referralStats.availableBalance || 0)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="mb-3 text-sm font-semibold text-slate-950">Registro de uso</p>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="grid grid-cols-3 bg-slate-50 px-4 py-3 text-xs font-medium uppercase text-slate-500">
                      <span>Detalhes</span>
                      <span>Data</span>
                      <span className="text-right">Valor</span>
                    </div>
                    <div className="grid grid-cols-3 px-4 py-4 text-sm">
                      <span>Pagamentos aprovados</span>
                      <span>{formatShortDate(currentBillingSubscription?.dataInicio || currentBillingSubscription?.createdAt)}</span>
                      <span className="text-right font-semibold">{formatBRL((billingDetails as any)?.stats?.totalPaid || 0)}</span>
                    </div>
                    <div className="grid grid-cols-3 border-t border-slate-100 px-4 py-4 text-sm">
                      <span>Convites convertidos</span>
                      <span>Atual</span>
                      <span className="text-right font-semibold">{referralStats.convertedReferrals || 0}</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </DialogContent>
        </Dialog>

        {/* Mobile bottom navigation */}
        <div className="mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
          <div className={`grid ${mobileNavColumns} text-[10px]`}>
            {canAccessDashboardView && (
            <button
              className={`flex flex-col items-center py-2.5 gap-0.5 ${isDashboardMode && selectedView === "stats" ? "text-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => goToSection("stats")}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>Início</span>
            </button>
            )}
            {canAccessConversationsView && (
            <button
              className={`flex flex-col items-center py-2.5 gap-0.5 ${isDashboardMode && selectedView === "conversations" || isConversasRoute ? "text-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => goToSection("conversations")}
            >
              <MessageCircle className="w-5 h-5" />
              <span>Conversas</span>
            </button>
            )}
            {canAccessConnectionView && (
            <button
              className={`flex flex-col items-center py-2.5 gap-0.5 ${isDashboardMode && selectedView === "connection" || isConexaoRoute ? "text-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => goToSection("connection")}
            >
              <Smartphone className="w-5 h-5" />
              <span>Conexão</span>
            </button>
            )}
             
            {canAccessAgentView && (
            <button
              className={`flex flex-col items-center py-2.5 gap-0.5 ${isDashboardMode && selectedView === "agent" || isMeuAgenteRoute ? "text-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => goToSection("agent")}
            >
              <Bot className="w-5 h-5" />
              <span>Agente</span>
            </button>
            )}

            {canAccessToolsMenu && (
            <button
              className={`flex flex-col items-center py-2.5 gap-0.5 ${isToolsRoute ? "text-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => setToolsPickerOpen(true)}
            >
              <Wrench className="w-5 h-5" />
              <span>Menu</span>
            </button>
            )}
          </div>
        </div>

        {/* Menu lateral completo (mobile) */}
        <Sheet open={toolsPickerOpen} onOpenChange={setToolsPickerOpen}>
          <SheetContent side="left" className="flex h-full w-full max-w-none flex-col gap-0 border-r bg-background p-0 sm:max-w-sm">
            <SheetHeader className="border-b border-border/60 px-4 pb-4 pt-6 text-left">
              <SheetTitle className="text-left">Menu</SheetTitle>
              <SheetDescription className="text-left">
                Navegação completa do painel, com ferramentas, estrutura e conta no mesmo lugar.
              </SheetDescription>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="sidebar-scrollbar flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-6">
                  {canAccessReferrals && (
                    <button
                      type="button"
                      data-testid="button-mobile-referral-popup"
                      className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-3 text-left shadow-sm transition-colors hover:bg-accent"
                      onClick={() => {
                        setToolsPickerOpen(false);
                        setReferralInviteOpen(true);
                      }}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                        <Gift className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-tight text-foreground">
                          Compartilhe AgenteZap com ...
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">Receba R$50 cada</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  )}

                  {mobileMainNavigation.length > 0 && (
                    <div className="space-y-2">
                      <div className="px-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Menu principal
                        </p>
                      </div>
                      {mobileMainNavigation.map((item) => (
                        <button
                          key={item.testId}
                          type="button"
                          data-testid={`${item.testId}-mobile`}
                          className={cn(
                            "w-full rounded-xl border border-border/60 bg-card px-3 py-3 flex items-center gap-3 text-left text-sm font-medium transition-colors",
                            item.isActive ? "text-primary" : "text-foreground hover:bg-accent"
                          )}
                          onClick={() => {
                            if (item.href) {
                              setLocation(item.href);
                            } else if (item.action) {
                              item.action();
                            }
                            setToolsPickerOpen(false);
                          }}
                        >
                          <span
                            className={cn(
                              "w-9 h-9 rounded-lg flex items-center justify-center",
                              item.isActive ? "bg-primary/10" : "bg-muted"
                            )}
                          >
                            <item.icon className="w-4 h-4" />
                          </span>
                          <span className="flex-1">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="px-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Ferramentas
                      </p>
                    </div>
                    {filteredToolsNavigation.map((item) => (
                      <div key={item.testId} className="rounded-xl border border-border/60 bg-card">
                        <button
                          type="button"
                          data-testid={item.testId}
                          className={cn(
                            "w-full px-3 py-3 flex items-center gap-3 text-left text-sm font-medium transition-colors",
                            item.isActive
                              ? "text-primary"
                              : "text-foreground hover:bg-accent"
                          )}
                          onClick={() => {
                            if (item.href) {
                              setLocation(item.href);
                            } else if (item.action) {
                              item.action();
                            }
                            setToolsPickerOpen(false);
                          }}
                        >
                          <span
                            className={cn(
                              "w-9 h-9 rounded-lg flex items-center justify-center",
                              item.isActive ? "bg-primary/10" : "bg-muted"
                            )}
                          >
                            <item.icon className="w-4 h-4" />
                          </span>
                          <span className="flex-1">{item.label}</span>
                        </button>
                      </div>
                    ))}
                  </div>

                  {filteredConfigNavigation.length > 0 && (
                    <div className="space-y-2">
                      <div className="px-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Conta
                        </p>
                      </div>
                      {filteredConfigNavigation.map((item) => (
                        <button
                          key={item.testId}
                          type="button"
                          data-testid={`${item.testId}-mobile`}
                          className={cn(
                            "w-full rounded-xl border border-border/60 bg-card px-3 py-3 flex items-center gap-3 text-left text-sm font-medium transition-colors",
                            item.isActive
                              ? "text-primary"
                              : "text-foreground hover:bg-accent"
                          )}
                          onClick={() => {
                            if (item.href) {
                              setLocation(item.href);
                            } else if (item.action) {
                              item.action();
                            }
                            setToolsPickerOpen(false);
                          }}
                        >
                          <span
                            className={cn(
                              "w-9 h-9 rounded-lg flex items-center justify-center",
                              item.isActive ? "bg-primary/10" : "bg-muted"
                            )}
                          >
                            <item.icon className="w-4 h-4" />
                          </span>
                          <span className="flex-1">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-border/60 bg-background px-4 py-4">
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    data-testid="button-mobile-menu-logout"
                    onClick={handleLogout}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sair
                  </Button>
                  {!isEffectivelyPaid && <UpgradeBanner />}
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </SidebarInset>
    </SidebarProvider>
    </>
  );
}





