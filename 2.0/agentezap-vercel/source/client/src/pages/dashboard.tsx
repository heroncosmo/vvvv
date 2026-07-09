import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/hooks/useBranding";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageCircle, Settings, Smartphone, Bot, CreditCard, LayoutDashboard, AlertCircle, Send, Kanban, Users, Tags, Filter, Plug, CalendarClock, BedDouble, Wrench, Megaphone, Upload, BookUser, BookOpen, Bell, Rocket, Sparkles, Zap, Receipt, Ban, Building2, FormInput, Package, ShoppingBag, UtensilsCrossed, ClipboardList, Mic, Workflow, Ticket, HelpCircle, Gift, QrCode, X, Palette, Shield, Copy, Mail, Wallet, Plus, Search, Download, Star, Globe, Database, BarChart3, Menu } from "lucide-react";
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
import { SubscribeModal } from "@/components/subscribe-modal";
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
  isEconomyMode?: boolean;
  freeQueueActive?: boolean;
  freeQueue?: { active?: boolean } | null;
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

type SidebarAudioConfig = {
  config?: {
    isEnabled?: boolean;
  };
};

type SidebarAgendaStatus = {
  config?: {
    is_active?: boolean;
  };
};

type SidebarDelivery2Config = {
  is_active?: boolean;
  send_to_ai?: boolean;
};

type SidebarFollowupConfig = {
  isEnabled?: boolean;
};

type SidebarNotificationConfig = {
  notificationEnabled?: boolean;
};

type SidebarProductsConfig = {
  is_active?: boolean;
  has_products?: boolean;
};

type SidebarEstampariaProfile = {
  profile?: {
    isActive?: boolean;
  } | null;
};

type SidebarStatusPostItem = {
  isActive?: boolean;
  status?: string;
};

type SidebarTeamMember = {
  isActive?: boolean;
  is_active?: boolean;
};

type SidebarSector = {
  isActive?: boolean;
  is_active?: boolean;
  active?: boolean;
};

type SidebarSectorsResponse = {
  items?: SidebarSector[];
};

function normalizeToolSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

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
  const isMobile = useIsMobile();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateAppViewportHeight = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      if (!height) return;
      document.documentElement.style.setProperty("--az-app-height", `${Math.round(height)}px`);
    };

    updateAppViewportHeight();

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", updateAppViewportHeight);
    viewport?.addEventListener("scroll", updateAppViewportHeight);
    window.addEventListener("resize", updateAppViewportHeight);
    window.addEventListener("orientationchange", updateAppViewportHeight);

    return () => {
      viewport?.removeEventListener("resize", updateAppViewportHeight);
      viewport?.removeEventListener("scroll", updateAppViewportHeight);
      window.removeEventListener("resize", updateAppViewportHeight);
      window.removeEventListener("orientationchange", updateAppViewportHeight);
    };
  }, []);

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
  const shouldShowEconomyUpgradePill = Boolean(
    usageData &&
      !isEffectivelyPaid &&
      (usageData.isEconomyMode || usageData.isLimitReached || usageData.freeQueueActive || usageData.freeQueue?.active),
  );
  const handleClosePlansOverlay = () => {
    setLocation("/", { replace: true });
  };

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
  
  const [selectedView, setSelectedView] = useState<"conversations" | "connection" | "stats" | "agent">("conversations");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [autologinLoading, setAutologinLoading] = useState<boolean>(false);
  const [autologinError, setAutologinError] = useState<string | null>(null);
  const [referralInviteOpen, setReferralInviteOpen] = useState(false);
  const [billingDialogOpen, setBillingDialogOpen] = useState(false);
  const [billingPaymentModalOpen, setBillingPaymentModalOpen] = useState(false);
  const [billingPaymentSubscriptionId, setBillingPaymentSubscriptionId] = useState<string | null>(null);
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
  const [appStoreOpen, setAppStoreOpen] = useState(false);
  const [teamToolsOpen, setTeamToolsOpen] = useState(false);
  const [appStoreSearch, setAppStoreSearch] = useState("");
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
    if (location === "/" || location === "/dashboard") {
      setSelectedView("agent");
      setLocation("/meu-agente-ia");
      return;
    }

    if (isConversasRoute) {
      setSelectedView("conversations");
    } else if (isConexaoRoute) {
      setSelectedView("connection");
    } else if (isMeuAgenteRoute) {
      setSelectedView("agent");
    } else if (isDashboardMode) {
      setSelectedView(location === "/" ? "agent" : "stats");
    }
  }, [isConversasRoute, isConexaoRoute, isMeuAgenteRoute, isDashboardMode, location, setLocation]);

  useEffect(() => {
    if (!isLegacySchedulingModuleRoute && !isAgendamento2Route) {
      return;
    }

    const destination = "/agendamento-3";
    if (location !== destination) {
      setLocation(destination);
    }
  }, [isAgendamento2Route, isLegacySchedulingModuleRoute, location, setLocation]);

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

  const { data: followupConfig } = useQuery<SidebarFollowupConfig | null>({
    queryKey: ["/api/followup/config"],
    enabled: !!isAuthenticated && !isMember,
    staleTime: 60000,
  });

  const { data: audioConfig } = useQuery<SidebarAudioConfig | null>({
    queryKey: ["/api/audio-config"],
    enabled: !!isAuthenticated && !isMember,
    staleTime: 60000,
  });

  const { data: delivery2Config } = useQuery<SidebarDelivery2Config | null>({
    queryKey: ["/api/delivery-2-config"],
    enabled: !!isAuthenticated && !isMember,
    staleTime: 60000,
  });

  const { data: agendaStatus } = useQuery<SidebarAgendaStatus | null>({
    queryKey: ["/api/agendamento-3/status"],
    enabled: !!isAuthenticated && !isMember,
    staleTime: 60000,
  });

  const { data: productsConfig } = useQuery<SidebarProductsConfig | null>({
    queryKey: ["/api/products-config"],
    enabled: !!isAuthenticated && !isMember,
    staleTime: 60000,
  });

  const { data: notificationConfig } = useQuery<SidebarNotificationConfig | null>({
    queryKey: ["/api/agent/notification-config"],
    enabled: !!isAuthenticated && !isMember,
    staleTime: 60000,
  });

  const { data: estampariaProfile } = useQuery<SidebarEstampariaProfile | null>({
    queryKey: ["/api/estamparia/profile"],
    enabled: !!isAuthenticated && !isMember,
    staleTime: 60000,
  });

  const { data: statusPostItems } = useQuery<SidebarStatusPostItem[]>({
    queryKey: ["/api/status/posts"],
    enabled: !!isAuthenticated && !isMember,
    staleTime: 60000,
  });

  const { data: sidebarTeamMembers = [] } = useQuery<SidebarTeamMember[]>({
    queryKey: ["/api/team-members"],
    enabled: !!isAuthenticated && !isMember,
    staleTime: 60000,
  });

  const { data: sidebarSectorsData } = useQuery<SidebarSectorsResponse>({
    queryKey: ["/api/user/sectors"],
    enabled: !!isAuthenticated && !isMember,
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

type AppStoreTool = {
  name: string;
  icon: LucideIcon;
  rating: string;
  category: string;
  href: string;
  searchText?: string;
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
    tooltip: "Construtor visual de fluxo",
    isActive: isMeuAgenteRoute && new URLSearchParams(search).get("tab") === "flow2",
    testId: "button-nav-flow2-leona",
  },
  { 
    label: "Ferramentas por Segmento", 
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
        label: "Delivery 2.0",
        href: "/delivery-2",
        icon: ShoppingBag,
        tooltip: "PDV online com pedidos extraidos direto do prompt",
        isActive: isDelivery2Route,
        testId: "button-nav-delivery2",
      } as ToolNavItem]
    : []),
  ...(shouldRenderLegacyDeliveryMenu
    ? [
        { label: "Delivery", href: "/delivery-cardapio", icon: UtensilsCrossed, tooltip: "Cardápio e pedidos do delivery", isActive: isDeliveryMenuRoute, testId: "button-nav-delivery-menu" },
        { label: "Delivery · Pedidos", href: "/delivery-pedidos", icon: ClipboardList, tooltip: "Painel de pedidos delivery", isActive: isDeliveryOrdersRoute, testId: "button-nav-delivery-orders" },
        { label: "Delivery · Relatórios", href: "/delivery-relatorios", icon: ClipboardList, tooltip: "Relatórios de vendas e faturamento", isActive: isDeliveryReportsRoute, testId: "button-nav-delivery-reports" },
      ]
    : []),
  { label: "Agenda Inteligente", href: "/agendamento-3", icon: CalendarClock, tooltip: "Confirma horarios pela agenda real e ajuda a evitar conflitos", isActive: isAgendamento3Route || isLegacySchedulingModuleRoute || isAgendamento2Route, testId: "button-nav-agendamento3" },
  { label: "Follow-up Inteligente", href: "/followup", icon: Sparkles, tooltip: "Mensagens automáticas para recuperar conversas", isActive: isFollowupRoute, testId: "button-nav-followup" },
  { label: "Lista de Exclusão", href: "/lista-exclusao", icon: Ban, tooltip: "Números que a IA não deve responder", isActive: isExclusionListRoute, testId: "button-nav-exclusion-list" },
  // Tickets removido de Ferramentas - agora está no menu principal como "Suporte"
  { label: "Falar por Áudio", href: "/falar-por-audio", icon: Mic, tooltip: "Respostas em áudio por voz", isActive: isAudioConfigRoute, testId: "button-nav-audio-config" },
  { label: "Postagens no Status", href: "/postagens-status", icon: Rocket, tooltip: "Status automático com agendamento e rotação", isActive: isStatusPostsRoute, testId: "button-nav-status-posts" },
  { label: "Notificador Inteligente", href: "/notificador", icon: Bell, tooltip: "Notificações automáticas", isActive: isNotifierRoute, testId: "button-nav-notifier" },
  { label: "Biblioteca de Mídias", href: "/biblioteca-midias", icon: Upload, tooltip: "Áudios, imagens e vídeos do agente", isActive: isMediaLibraryRoute, testId: "button-nav-media-library" },
  { label: "Fila de Atenção", href: "/qualificacao", icon: AlertCircle, tooltip: "Prioridade de atendimento por IA", isActive: isLeadQualificationRoute, testId: "button-nav-lead-qualification" },
  { label: "Cursos", href: "/cursos", icon: BookUser, tooltip: "Módulo de agendamento de cursos com a IA", isActive: isCoursesRoute, testId: "button-nav-courses" },
  { label: "Estamparia", href: "/estamparia", icon: Palette, tooltip: "Briefing, arte com IA e aprovação do cliente", isActive: isEstampariaRoute, testId: "button-nav-estamparia" },
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
          tooltip: "Gerenciar logins e permissões da equipe",
          isActive: isMembersRoute,
          testId: "button-nav-team-members",
        },
        {
          label: "Setores",
          href: "/setores",
          icon: Workflow,
          tooltip: "Organizar setores, handoff e relatórios",
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

  const hasActiveStatusPosts = Array.isArray(statusPostItems)
    && statusPostItems.some((post) => post?.isActive !== false);
  const hasActiveTeamTools =
    (Array.isArray(sidebarTeamMembers) &&
      sidebarTeamMembers.some((member) => member?.isActive === true || member?.is_active === true)) ||
    (Array.isArray(sidebarSectorsData?.items) &&
      sidebarSectorsData.items.some((sector) => sector?.isActive === true || sector?.is_active === true || sector?.active === true));
  const activeSidebarToolsNavigation = filteredToolsNavigation.filter((item) => {
    if (
      item.testId === "button-nav-ai" ||
      item.testId === "button-nav-tools-menu" ||
      item.testId === "button-nav-referrals"
    ) {
      return false;
    }

    switch (item.testId) {
      case "button-nav-flow2-leona":
        return agentConfig?.flowModeActive === true;
      case "button-nav-whatsapp-qr":
        return false;
      case "button-nav-delivery2":
        return delivery2Config?.is_active === true;
      case "button-nav-delivery-menu":
      case "button-nav-delivery-orders":
      case "button-nav-delivery-reports":
        return shouldRenderLegacyDeliveryMenu && delivery2Config?.is_active === true;
      case "button-nav-agendamento3":
        return agendaStatus?.config?.is_active === true;
      case "button-nav-followup":
        return followupConfig?.isEnabled === true;
      case "button-nav-exclusion-list":
        return false;
      case "button-nav-audio-config":
        return audioConfig?.config?.isEnabled === true;
      case "button-nav-status-posts":
        return hasActiveStatusPosts;
      case "button-nav-notifier":
        return notificationConfig?.notificationEnabled === true;
      case "button-nav-lead-qualification":
        return false;
      case "button-nav-courses":
      case "button-nav-reservations":
        return false;
      case "button-nav-estamparia":
        return estampariaProfile?.profile?.isActive === true;
      case "button-nav-masssend":
      case "button-nav-campaigns":
      case "button-nav-contact-lists":
        return false;
      case "button-nav-kanban":
        return isMember && permissions.canMoveKanban;
      case "button-nav-contacts":
      case "button-nav-synced-contacts":
      case "button-nav-tags":
      case "button-nav-custom-fields":
      case "button-nav-funnel":
      case "button-nav-grupo-zap":
        return false;
      case "button-nav-products":
        return productsConfig?.is_active === true;
      case "button-nav-media-library":
        return false;
      case "button-nav-meta-form":
        return false;
      default:
        return false;
    }
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
  const canAccessToolsMenu = !isMember || activeSidebarToolsNavigation.length > 0;
  const contextualCourseVideo =
    canAccessTrainingCourse && !isTrainingCourseRoute ? getCourseVideoForPath(location) : null;
  const contextualCourseHref = contextualCourseVideo ? getCourseArticleHref(contextualCourseVideo) : null;

  useEffect(() => {
    const handleOpenMobileMenu = () => {
      if (canAccessToolsMenu) {
        setToolsPickerOpen(true);
      }
    };

    window.addEventListener("agentezap:open-mobile-menu", handleOpenMobileMenu);
    return () => window.removeEventListener("agentezap:open-mobile-menu", handleOpenMobileMenu);
  }, [canAccessToolsMenu]);

  const syncSidebarScrollState = () => {
    const scrollContainer = sidebarScrollRef.current;
    if (!scrollContainer) {
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
    activeSidebarToolsNavigation.length,
    filteredConfigNavigation.length,
    managementNavigation.length,
  ]);

  const handleMoreTools = () => {
    setAppStoreOpen(true);
  };

  const memberDefaultPath = getMemberDefaultPath(permissions);
  const mobileNavItemsCount = [
    canAccessToolsMenu,
    canAccessDashboardView,
    canAccessConnectionView,
    canAccessConversationsView,
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
          label: "Início",
          icon: LayoutDashboard,
          tooltip: "Meu Agente IA",
          isActive: isMeuAgenteRoute || (isDashboardMode && selectedView === "agent"),
          testId: "button-mobile-menu-dashboard",
          action: () => goToSection("agent"),
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
  const currentBillingSubscriptionId = typeof currentBillingSubscription?.id === "string"
    ? currentBillingSubscription.id
    : null;
  const currentBillingDueDate = currentBillingSubscription?.nextPaymentDate || currentBillingSubscription?.dataFim || null;
  const currentBillingDueAt = currentBillingDueDate ? new Date(currentBillingDueDate) : null;
  const currentBillingIsOverdue = Boolean(
    currentBillingDueAt && !Number.isNaN(currentBillingDueAt.getTime()) && currentBillingDueAt.getTime() < Date.now(),
  );
  const currentBillingNeedsPayment = Boolean(
    currentBillingSubscription?.needsPayment ||
      currentBillingSubscription?.status === "pending_pix" ||
      currentBillingSubscription?.status === "expired" ||
      currentBillingIsOverdue,
  );
  const canOpenBillingPayment = Boolean(
    currentBillingSubscriptionId && !currentBillingSubscriptionId.startsWith("reseller_"),
  );
  const billingPaymentButtonLabel = currentBillingNeedsPayment
    ? "Pagar fatura"
    : "Pagar próxima fatura";
  const referralShareUrl = referralDashboard?.link?.shareUrl || "";
  const referralStats = (referralDashboard?.stats || {}) as NonNullable<ReferralDashboardSummary["stats"]>;
  const sidebarPlanName = isEffectivelyPaid
    ? currentBillingPlan?.nome || currentBillingPlan?.name || "Plano ativo"
    : "Grátis";
  const sidebarPlanPrice = isEffectivelyPaid
    ? formatBRL(currentBillingSubscription?.couponPrice || currentBillingPlan?.valor || currentBillingPlan?.price || 0)
    : "R$ 0/mês";
  const appStoreFeatured = [
    {
      title: "Inteligência Artificial Premium",
      description: "Modelos avançados para respostas mais humanas.",
      icon: Sparkles,
      iconClassName: "bg-purple-100 text-purple-600",
      rating: "4.9",
      tag: "Built for AgenteZap",
      href: "/meu-agente-ia",
    },
    {
      title: "Delivery 2.0 Integrado",
      description: "Gerencie pedidos diretamente pelo WhatsApp.",
      icon: Zap,
      iconClassName: "bg-emerald-100 text-emerald-600",
      rating: "4.8",
      tag: "Popular",
      href: "/delivery-2",
    },
    {
      title: "Agendamento Automático",
      description: "Sincronize calendários e agende reuniões.",
      icon: CalendarClock,
      iconClassName: "bg-blue-100 text-blue-600",
      rating: "4.7",
      tag: "Top choice",
      href: "/agendamento-3",
    },
  ];
  const appStoreTools: AppStoreTool[] = [
    { name: "Follow-up Inteligente", icon: MessageCircle, rating: "4.5", category: "Vendas", href: "/followup" },
    { name: "Lista de Exclusão", icon: Globe, rating: "4.2", category: "Filtros", href: "/lista-exclusao" },
    ...(!isMember ? [{ name: "Membros e Setores", icon: Users, rating: "4.7", category: "Equipe", href: "__team_tools__" }] : []),
    { name: "Envio em Massa", icon: Send, rating: "4.7", category: "Marketing", href: "/envio-em-massa" },
    { name: "Campanhas", icon: Megaphone, rating: "4.5", category: "Marketing", href: "/campanhas" },
    { name: "Listas de Contatos", icon: BookUser, rating: "4.4", category: "Contatos", href: "/listas-contatos" },
    { name: "QR Code WhatsApp", icon: QrCode, rating: "4.5", category: "Canais", href: "/qrcode-whatsapp" },
    { name: "Falar por Áudio", icon: Mic, rating: "4.6", category: "Atendimento", href: "/falar-por-audio" },
    { name: "Postagens no Status", icon: Rocket, rating: "4.5", category: "Marketing", href: "/postagens-status" },
    { name: "Catálogo de Produtos", icon: Package, rating: "4.6", category: "Vendas", href: "/produtos" },
    { name: "Funil", icon: Filter, rating: "4.3", category: "Vendas", href: "/funil" },
    { name: "Formulário Meta", icon: FormInput, rating: "4.4", category: "Leads", href: "/meta-formulario" },
    { name: "Reservas", icon: BedDouble, rating: "4.3", category: "Agenda", href: "/reservas" },
    { name: "Estamparia", icon: Palette, rating: "4.3", category: "Atendimento", href: "/estamparia" },
    { name: "Notificador em Massa", icon: Users, rating: "4.8", category: "Marketing", href: "/notificador" },
    { name: "Biblioteca de Mídias", icon: Database, rating: "4.6", category: "Arquivos", href: "/biblioteca-midias" },
    { name: "Análise de Sentimento", icon: BarChart3, rating: "4.7", category: "Relatórios", href: "/dashboard" },
    { name: "Chatbot de Pesquisas", icon: Bot, rating: "4.4", category: "Atendimento", href: "/ferramentas" },
  ];
  const appStoreCategoryByTestId: Record<string, string> = {
    "button-nav-ai": "Atendimento",
    "button-nav-flow2-leona": "Fluxos",
    "button-nav-tools-menu": "Central",
    "button-nav-whatsapp-qr": "Canais",
    "button-nav-delivery2": "Vendas",
    "button-nav-delivery-menu": "Vendas",
    "button-nav-delivery-orders": "Vendas",
    "button-nav-delivery-reports": "Relatórios",
    "button-nav-agendamento3": "Agenda",
    "button-nav-followup": "Vendas",
    "button-nav-exclusion-list": "Filtros",
    "button-nav-audio-config": "Atendimento",
    "button-nav-status-posts": "Marketing",
    "button-nav-notifier": "Marketing",
    "button-nav-media-library": "Arquivos",
    "button-nav-lead-qualification": "Atendimento",
    "button-nav-courses": "Agenda",
    "button-nav-estamparia": "Segmentos",
    "button-nav-masssend": "Marketing",
    "button-nav-referrals": "Revenda",
    "button-nav-contact-lists": "Contatos",
    "button-nav-campaigns": "Marketing",
    "button-nav-kanban": "CRM",
    "button-nav-contacts": "Contatos",
    "button-nav-synced-contacts": "Contatos",
    "button-nav-tags": "Contatos",
    "button-nav-custom-fields": "Contatos",
    "button-nav-products": "Vendas",
    "button-nav-funnel": "CRM",
    "button-nav-grupo-zap": "Imobiliária",
    "button-nav-meta-form": "Leads",
    "button-nav-reservations": "Agenda",
  };
  const navigationAppStoreTools: AppStoreTool[] = filteredToolsNavigation.map((item) => ({
    name: item.label,
    icon: item.icon,
    rating: "4.5",
    category: appStoreCategoryByTestId[item.testId] || "Ferramentas",
    href: item.href || "/meu-agente-ia",
    searchText: `${item.label} ${item.tooltip} ${item.href || ""} ${item.testId}`,
  }));
  const allAppStoreToolsByKey = new Map<string, AppStoreTool>();
  [...appStoreTools, ...navigationAppStoreTools].forEach((tool) => {
    const key = normalizeToolSearchText(`${tool.href}|${tool.name}`);
    if (!allAppStoreToolsByKey.has(key)) {
      allAppStoreToolsByKey.set(key, tool);
    }
  });
  const allAppStoreTools = Array.from(allAppStoreToolsByKey.values());
  const appStoreQueryTokens = normalizeToolSearchText(appStoreSearch).split(/\s+/).filter(Boolean);
  const appStoreMatches = (...fields: string[]) => {
    if (appStoreQueryTokens.length === 0) return true;
    const haystack = normalizeToolSearchText(fields.join(" "));
    return appStoreQueryTokens.every((token) => haystack.includes(token));
  };
  const filteredAppStoreFeatured = appStoreFeatured.filter((app) =>
    appStoreMatches(app.title, app.description, app.tag)
  );
  const filteredAppStoreTools = allAppStoreTools.filter((app) =>
    appStoreMatches(app.name, app.category, app.href, app.searchText || "")
  );
  const openTeamTools = () => {
    setAppStoreOpen(false);
    setToolsPickerOpen(false);
    setTeamToolsOpen(true);
  };
  const openAppStoreDestination = (href: string) => {
    if (href === "__team_tools__") {
      openTeamTools();
      return;
    }
    setAppStoreOpen(false);
    setToolsPickerOpen(false);
    setLocation(href);
  };

  const isDashboardBootstrapping = shouldUseDashboardBootstrap && !dashboardBootstrap;

  if (isLoading) {
    return (
      <div
        className="flex w-full items-center justify-center"
        style={{ height: "var(--az-app-height, 100svh)" }}
      >
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
      
      <SidebarProvider
        defaultOpen={true}
        className="min-h-0 overflow-hidden bg-[#f6f6f7]"
        style={{ height: "var(--az-app-height, 100svh)", maxHeight: "var(--az-app-height, 100svh)" }}
      >
      <Sidebar
        collapsible="none"
        className="bg-[#f1f1f1] [&_[data-sidebar=group-label]]:h-6 [&_[data-sidebar=group-label]]:tracking-wider [&_[data-sidebar=group]]:py-1 [&_[data-sidebar=menu-button]]:h-8 [&_[data-sidebar=menu-button]]:py-1.5 [&_[data-sidebar=menu-button]]:text-[13px]"
        style={{ height: "var(--az-app-height, 100svh)" }}
      >
        <SidebarHeader className="bg-[#f1f1f1] p-2 pb-1">
          <div className="mb-3 mt-3 flex items-center px-3 py-0">
            <div className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt={branding.companyName} className="h-7 w-7 rounded object-contain" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded bg-black text-white shadow-sm">
                  <Bot className="h-4 w-4" />
                </span>
              )}
              <span className="truncate" style={branding.isWhiteLabel ? { color: branding.primaryColor } : undefined}>
                {branding.companyName}
              </span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent
          ref={sidebarScrollRef}
          onScroll={syncSidebarScrollState}
          className="relative min-h-0 gap-0 bg-[#f1f1f1]"
        >
          <SidebarGroup className="px-2 pt-1">
            <SidebarMenu>
              {canAccessAgentView && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => goToSection("agent")}
                    isActive={isMeuAgenteRoute || (isDashboardMode && selectedView === "agent")}
                    tooltip="Início"
                    data-testid="button-nav-agent-home"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Início</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {canAccessConversationsView && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => goToSection("conversations")}
                    isActive={isConversasRoute || (isDashboardMode && selectedView === "conversations")}
                    tooltip="Conversas"
                    data-testid="button-nav-conversations"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Conversas</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup className="px-2 pt-3">
            <SidebarGroupLabel className="flex items-center justify-between">
              <span>Canais de vendas</span>
              <button
                type="button"
                onClick={() => setAppStoreOpen(true)}
                className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition hover:bg-white hover:text-slate-900"
                aria-label="Adicionar canal"
              >
                <Plus className="h-3 w-3" />
              </button>
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => goToSection("connection")}
                  isActive={isConexaoRoute || (isDashboardMode && selectedView === "connection")}
                  tooltip="WhatsApp"
                  data-testid="button-nav-sales-whatsapp"
                >
                  <Globe className="w-4 h-4" />
                  <span>WhatsApp</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {canAccessToolsMenu && (
            <SidebarGroup className="px-2 pt-3">
              <SidebarGroupLabel className="flex items-center justify-between">
                <span>Ferramentas</span>
                <button
                  type="button"
                  onClick={() => setAppStoreOpen(true)}
                  className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition hover:bg-white hover:text-slate-900"
                  aria-label="Adicionar apps"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </SidebarGroupLabel>
              <SidebarMenu>
                {!isMember && hasActiveTeamTools && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={openTeamTools}
                      isActive={isMembersRoute || isSectorsRoute}
                      tooltip="Membros e Setores"
                      data-testid="button-nav-team-tools"
                    >
                      <Users className="w-4 h-4" />
                      <span>Membros e Setores</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canAccessOwnerAdminPanel && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setLocation("/administrador#agenda")}
                      isActive={isAdministradorRoute}
                      tooltip="Agenda, historico, boas-vindas, pagamentos e broadcast"
                      data-testid="button-nav-owner-admin-sidebar"
                    >
                      <Bell className="w-4 h-4" />
                      <span>Administrador</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {activeSidebarToolsNavigation.map((item) => (
                  <SidebarMenuItem key={`sidebar-${item.testId}`}>
                    <SidebarMenuButton
                      onClick={() => {
                        if (item.href) {
                          setLocation(item.href);
                        } else if (item.action) {
                          item.action();
                        }
                      }}
                      isActive={item.isActive}
                      tooltip={item.tooltip}
                      data-testid={`${item.testId}-sidebar`}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setAppStoreOpen(true)}
                    tooltip="Adicionar apps"
                    data-testid="button-nav-add-apps"
                    className="text-slate-400"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Adicionar apps</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {canAccessTrainingCourse && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setLocation("/curso-agentezap")}
                      isActive={isTrainingCourseRoute}
                      tooltip="Curso AgenteZap"
                      data-testid="button-nav-training-course"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Curso em video</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canAccessHelpCenter && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setLocation("/ajuda")}
                      isActive={isHelpCenterRoute}
                      tooltip="Central de Ajuda"
                      data-testid="button-nav-help-center"
                    >
                      <HelpCircle className="w-4 h-4" />
                      <span>Central de Ajuda</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {isReseller && !isMember && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Painel de Revenda" data-testid="button-nav-reseller">
                      <Link href="/revenda">
                        <Building2 className="w-4 h-4" />
                        <span>Minha Revenda</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter className="shrink-0 bg-[#f1f1f1] p-2">
          <SidebarMenu className="gap-2">
            <SidebarMenuItem>
              <div className="rounded-xl bg-black p-3.5 text-white">
                <p className="text-[12px] font-bold leading-tight">
                  {isEffectivelyPaid ? "Upgrade de plano" : sidebarPlanName}
                </p>
                <p className="mt-1 text-[11px] font-medium leading-tight text-slate-300">
                  {isEffectivelyPaid ? `${sidebarPlanName} no plano atual. Veja o próximo plano disponível.` : "Agente e conversas no Grátis. Plus libera ferramentas e prioridade rápida."}
                </p>
                <button
                  type="button"
                  onClick={() => setLocation("/plans")}
                  className="mt-3 w-full rounded-lg bg-white py-1.5 text-[11px] font-bold text-black transition hover:bg-slate-100"
                  data-testid="button-sidebar-plan-card"
                >
                  {isEffectivelyPaid ? "Ver planos" : "Ver Plus"}
                </button>
              </div>
            </SidebarMenuItem>

            {canAccessToolsMenu && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Abrir central de ferramentas"
                  data-testid="button-nav-more-tools"
                  onClick={handleMoreTools}
                  className="rounded-xl border border-[#e3e3e3] bg-white text-[#008060] shadow-sm hover:bg-slate-50"
                >
                  <Wrench className="w-4 h-4" />
                  <span>Mais Ferramentas</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Configurações"
                isActive={isSettingsRoute}
                data-testid="button-settings"
                className="rounded-lg text-slate-500 hover:bg-[#ebebeb] hover:text-slate-900"
              >
                <Link href="/settings">
                  <Settings className="w-4 h-4" />
                  <span>Configurações</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset
        className="flex min-h-0 flex-col overflow-hidden"
        style={{ height: "var(--az-app-height, 100svh)" }}
      >
        {/* Mobile Header com logo */}
        {!isMeuAgenteRoute && !isConversasRoute && !(isDashboardMode && selectedView === "conversations") && (
          <div className="md:hidden sticky top-0 z-50 bg-background border-b border-border/60">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
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
              {shouldShowEconomyUpgradePill && !isMeuAgenteRoute && selectedView !== "agent" && (
                <UpgradeBanner />
              )}
            </div>
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
                onClick={handleClosePlansOverlay}
                className="absolute right-3 top-3 z-[95] inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-950 sm:right-5 sm:top-5"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Fechar planos</span>
              </button>

              <div className="h-full overflow-y-auto">
                <PlansPage
                  onViewBilling={() => {
                    setLocation("/");
                    setBillingDialogOpen(true);
                  }}
                />
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
              <SettingsPage onOpenBilling={() => setBillingDialogOpen(true)} />
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
            <div className="az-page-scrollbar scroll-container flex-1 min-h-0 overflow-auto">
              <HelpCenterPage />
            </div>
          )}

          {canAccessTrainingCourse && isTrainingCourseRoute && (
            <div className="az-page-scrollbar scroll-container flex-1 min-h-0 overflow-auto">
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
            <div className="flex h-full flex-1 min-h-0 min-w-0 overflow-hidden">
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

                  <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950">
                          {currentBillingNeedsPayment ? "Fatura em aberto" : "Pagamento antecipado"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {currentBillingNeedsPayment
                            ? "Regularize a assinatura por Pix ou cartão sem sair desta área."
                            : "Antecipe a próxima cobrança para manter o acesso sem interrupção."}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          disabled={!canOpenBillingPayment}
                          onClick={() => {
                            if (!currentBillingSubscriptionId) {
                              setLocation("/plans");
                              return;
                            }

                            setBillingPaymentSubscriptionId(currentBillingSubscriptionId);
                            setBillingDialogOpen(false);
                            setBillingPaymentModalOpen(true);
                          }}
                          className={cn(
                            "bg-slate-950 text-white hover:bg-slate-800",
                            currentBillingNeedsPayment && "bg-emerald-700 hover:bg-emerald-800",
                          )}
                        >
                          <Wallet className="mr-2 h-4 w-4" />
                          {billingPaymentButtonLabel}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setBillingDialogOpen(false);
                            setLocation("/minha-assinatura");
                          }}
                        >
                          Ver detalhes
                        </Button>
                      </div>
                    </div>
                    {!canOpenBillingPayment && currentBillingSubscriptionId && (
                      <p className="mt-3 text-xs text-slate-500">
                        Esta conta usa faturamento de revenda. Use os detalhes da assinatura para ver os dados Pix do revendedor.
                      </p>
                    )}
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

        <SubscribeModal
          open={billingPaymentModalOpen}
          onOpenChange={(open) => {
            setBillingPaymentModalOpen(open);
            if (!open) {
              setBillingPaymentSubscriptionId(null);
            }
          }}
          subscriptionId={billingPaymentSubscriptionId}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/subscriptions/current"] });
            queryClient.invalidateQueries({ queryKey: ["/api/my-subscription"] });
            queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
            setBillingPaymentModalOpen(false);
            setBillingPaymentSubscriptionId(null);
            setBillingDialogOpen(true);
          }}
        />

        <Dialog open={teamToolsOpen} onOpenChange={setTeamToolsOpen}>
          <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-2xl border-[#e3e3e3] bg-white p-0 shadow-2xl">
            <DialogHeader className="border-b border-[#e3e3e3] px-6 py-5 text-left">
              <DialogTitle className="text-[16px] font-bold text-slate-900">Membros e Setores</DialogTitle>
              <DialogDescription className="text-[12px] text-slate-500">
                Escolha a área que deseja organizar.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 bg-white p-6 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setTeamToolsOpen(false);
                  setLocation("/membros");
                }}
                className="rounded-xl border border-[#e3e3e3] bg-white p-4 text-left transition hover:border-[#8c9196] hover:bg-[#f6f6f7]"
                data-testid="button-team-tools-members"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f1f1f1] text-slate-700">
                  <Users className="h-5 w-5" />
                </span>
                <span className="mt-4 block text-[13px] font-bold text-slate-900">Membros</span>
                <span className="mt-1 block text-[11px] leading-normal text-slate-500">Gerencie acessos da equipe.</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTeamToolsOpen(false);
                  setLocation("/setores");
                }}
                className="rounded-xl border border-[#e3e3e3] bg-white p-4 text-left transition hover:border-[#8c9196] hover:bg-[#f6f6f7]"
                data-testid="button-team-tools-sectors"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f1f1f1] text-slate-700">
                  <Workflow className="h-5 w-5" />
                </span>
                <span className="mt-4 block text-[13px] font-bold text-slate-900">Setores</span>
                <span className="mt-1 block text-[11px] leading-normal text-slate-500">Organize atendimento e transferências.</span>
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={appStoreOpen} onOpenChange={setAppStoreOpen}>
          <DialogContent className="max-w-4xl gap-0 overflow-hidden rounded-2xl border-[#e3e3e3] bg-white p-0 shadow-2xl">
            <DialogHeader className="border-b border-[#e3e3e3] px-6 py-5 text-left">
              <DialogTitle className="text-[16px] font-bold text-slate-900">Selecionados para você</DialogTitle>
              <DialogDescription className="sr-only">
                Pesquise e abra ferramentas do AgenteZap.
              </DialogDescription>
            </DialogHeader>

            <div className="border-b border-[#e3e3e3] bg-[#f6f6f7] px-6 py-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  aria-label="Pesquisar ferramentas e apps"
                  placeholder="Pesquisar ferramentas e apps..."
                  value={appStoreSearch}
                  onChange={(event) => setAppStoreSearch(event.target.value)}
                  className="h-10 rounded-lg border-[#8c9196] bg-white pl-10 text-[13px] shadow-none focus-visible:ring-[#005bd3]/20"
                />
              </div>
            </div>

            <div className="max-h-[calc(90vh-12rem)] overflow-y-auto bg-white p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {filteredAppStoreFeatured.map((app) => (
                  <button
                    key={app.title}
                    type="button"
                    onClick={() => openAppStoreDestination(app.href)}
                    className="group flex min-h-[176px] flex-col rounded-xl border border-[#e3e3e3] p-4 text-left transition hover:border-[#8c9196] hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-[12px] font-bold leading-tight text-slate-900">{app.title}</p>
                      <p className="mt-2 text-[11px] leading-normal text-slate-500">{app.description}</p>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-4">
                      <div className="flex items-center gap-3">
                        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", app.iconClassName)}>
                          <app.icon className="h-4 w-4" />
                        </span>
                        <span>
                          <span className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                            {app.rating}
                            <Star className="h-2.5 w-2.5 fill-current text-slate-400" />
                          </span>
                          <span className="block text-[9px] font-bold uppercase text-slate-400">{app.tag}</span>
                        </span>
                      </div>
                      <span className="rounded-lg p-1.5 text-slate-400 transition group-hover:bg-white group-hover:text-slate-700">
                        <Download className="h-4 w-4" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-8">
                <h3 className="mb-4 text-[13px] font-bold text-slate-900">Mais ferramentas que você pode precisar</h3>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
                  {filteredAppStoreTools.map((app) => (
                    <button
                      key={`${app.href}-${app.name}`}
                      type="button"
                      onClick={() => openAppStoreDestination(app.href)}
                      className="group -mx-2 flex items-center gap-4 rounded-lg p-2 text-left transition hover:bg-[#f6f6f7]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#e3e3e3] bg-[#f1f1f1]">
                        <app.icon className="h-5 w-5 text-slate-700" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[13px] font-bold text-slate-900">{app.name}</span>
                          <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-slate-500">
                            {app.rating}
                            <Star className="h-2.5 w-2.5 fill-current text-slate-400" />
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[11px] text-slate-500">Categoria: {app.category}</span>
                      </span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-400 opacity-0 transition group-hover:border-[#8c9196] group-hover:bg-white group-hover:opacity-100">
                        <Download className="h-4 w-4" />
                      </span>
                    </button>
                  ))}
                </div>
                {filteredAppStoreFeatured.length === 0 && filteredAppStoreTools.length === 0 && (
                  <div className="mt-8 rounded-xl border border-[#e3e3e3] bg-[#f6f6f7] px-4 py-6 text-center text-[13px] font-medium text-slate-500">
                    Nenhuma ferramenta encontrada.
                  </div>
                )}
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-6 border-t border-[#e3e3e3] pt-6">
                <button type="button" onClick={() => openAppStoreDestination("/ferramentas")} className="text-[12px] font-bold text-slate-500 hover:text-[#005bd3]">
                  Ver todas as ferramentas
                </button>
                <button type="button" onClick={() => openAppStoreDestination("/ajuda")} className="text-[12px] font-bold text-slate-500 hover:text-[#005bd3]">
                  Suporte do AgenteZap
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Mobile bottom navigation */}
        {!isMeuAgenteRoute && (
        <div className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-50 h-[70px] border-t border-[#e3e3e3] bg-white px-2 pb-2 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] md:hidden">
          <div className={`grid h-full ${mobileNavColumns} items-center text-[10px]`}>
            {canAccessToolsMenu && (
            <button
              className={`flex flex-col items-center justify-center gap-1 py-0 ${isToolsRoute ? "font-medium text-[#008060]" : "text-slate-400"}`}
              onClick={() => setToolsPickerOpen(true)}
            >
              <Menu className="h-5 w-5" />
              <span className="text-[9px] font-bold uppercase tracking-tight">Menu</span>
            </button>
            )}
            {canAccessDashboardView && (
            <button
              className={`flex flex-col items-center justify-center gap-1 py-0 ${isMeuAgenteRoute || (isDashboardMode && selectedView === "agent") ? "font-medium text-[#008060]" : "text-slate-400"}`}
              onClick={() => {
                setSelectedView("agent");
                setLocation("/meu-agente-ia?mobile=editor");
              }}
            >
              <LayoutDashboard className="h-5 w-5" />
              <span className="text-[9px] font-bold uppercase tracking-tight">Configurar</span>
            </button>
            )}
            {canAccessConnectionView && (
            <button
              className={`flex flex-col items-center justify-center gap-1 py-0 ${isConexaoRoute || (isDashboardMode && selectedView === "connection") ? "font-medium text-[#008060]" : "text-slate-400"}`}
              onClick={() => goToSection("connection")}
              data-testid="button-mobile-bottom-whatsapp"
            >
              <Globe className="h-5 w-5" />
              <span className="text-[9px] font-bold uppercase tracking-tight">WhatsApp</span>
            </button>
            )}
            {canAccessConversationsView && (
            <button
              className={`flex flex-col items-center justify-center gap-1 py-0 ${isDashboardMode && selectedView === "conversations" || isConversasRoute ? "font-medium text-[#008060]" : "text-slate-400"}`}
              onClick={() => goToSection("conversations")}
            >
              <MessageCircle className="h-5 w-5" />
              <span className="text-[9px] font-bold uppercase tracking-tight">Conversas</span>
            </button>
            )}
          </div>
        </div>
        )}

        {/* Menu lateral completo (mobile) */}
        <Sheet open={toolsPickerOpen} onOpenChange={setToolsPickerOpen}>
          <SheetContent side="left" className="flex h-full w-72 max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden border-r border-[#dcdfe4] bg-[#f1f1f1] p-0 shadow-2xl [&>button.absolute]:hidden">
            <SheetHeader className="px-5 py-5 text-left">
              <SheetTitle className="flex items-center gap-2.5 text-left text-[15px] font-bold tracking-tight">
                <span className="flex h-7 w-7 items-center justify-center rounded bg-black text-white">
                  <Bot className="h-4 w-4" />
                </span>
                AgenteZap
              </SheetTitle>
              <SheetDescription className="sr-only">Menu principal do AgenteZap</SheetDescription>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="sidebar-scrollbar flex-1 overflow-y-auto px-2 py-2">
                <div className="space-y-4">
                  {mobileMainNavigation.length > 0 && (
                    <div className="space-y-2">
                      {mobileMainNavigation.map((item) => (
                        <button
                          key={item.testId}
                          type="button"
                          data-testid={`${item.testId}-mobile`}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left text-[13px] font-medium transition-colors",
                            item.isActive
                              ? "border-[#e3e3e3] bg-white text-slate-900 shadow-sm"
                              : "border-transparent text-slate-600 hover:bg-[#ebebeb]"
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
                          <item.icon className="h-4 w-4 opacity-80" />
                          <span className="flex-1">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {canAccessConnectionView && (
                    <div className="space-y-2">
                      <div className="px-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Canais de vendas
                        </p>
                      </div>
                      <button
                        type="button"
                        data-testid="button-mobile-sales-whatsapp"
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left text-[13px] font-medium transition-colors",
                          isConexaoRoute || (isDashboardMode && selectedView === "connection")
                            ? "border-[#e3e3e3] bg-white text-slate-900 shadow-sm"
                            : "border-transparent text-slate-600 hover:bg-[#ebebeb]"
                        )}
                        onClick={() => {
                          goToSection("connection");
                          setToolsPickerOpen(false);
                        }}
                      >
                        <Globe className="h-4 w-4 opacity-80" />
                        <span className="flex-1">WhatsApp</span>
                      </button>
                    </div>
                  )}

                  {canAccessToolsMenu && (
                    <div className="space-y-2">
                      <div className="px-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Ferramentas
                        </p>
                      </div>
                      {!isMember && hasActiveTeamTools && (
                        <div>
                          <button
                            type="button"
                            data-testid="button-nav-team-tools-mobile"
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left text-[13px] font-medium transition-colors",
                              isMembersRoute || isSectorsRoute
                                ? "border-[#e3e3e3] bg-white text-slate-900 shadow-sm"
                                : "border-transparent text-slate-600 hover:bg-[#ebebeb]"
                            )}
                            onClick={openTeamTools}
                          >
                            <Users className="h-4 w-4 opacity-80" />
                            <span className="flex-1">Membros e Setores</span>
                          </button>
                        </div>
                      )}
                      {activeSidebarToolsNavigation.map((item) => (
                        <div key={item.testId}>
                          <button
                            type="button"
                            data-testid={item.testId}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left text-[13px] font-medium transition-colors",
                              item.isActive
                                ? "border-[#e3e3e3] bg-white text-slate-900 shadow-sm"
                                : "border-transparent text-slate-600 hover:bg-[#ebebeb]"
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
                            <item.icon className="h-4 w-4 opacity-80" />
                            <span className="flex-1">{item.label}</span>
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        data-testid="button-nav-add-apps-mobile"
                        className="flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-1.5 text-left text-[13px] font-medium text-slate-400 transition-colors hover:bg-[#ebebeb]"
                        onClick={() => {
                          setToolsPickerOpen(false);
                          setAppStoreOpen(true);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 opacity-80" />
                        <span className="flex-1">Adicionar apps</span>
                      </button>
                      {canAccessTrainingCourse && (
                        <button
                          type="button"
                          data-testid="button-nav-training-course-mobile"
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left text-[13px] font-medium transition-colors",
                            isTrainingCourseRoute
                              ? "border-[#e3e3e3] bg-white text-slate-900 shadow-sm"
                              : "border-transparent text-slate-600 hover:bg-[#ebebeb]"
                          )}
                          onClick={() => {
                            setToolsPickerOpen(false);
                            setLocation("/curso-agentezap");
                          }}
                        >
                          <BookOpen className="h-4 w-4 opacity-80" />
                          <span className="flex-1">Curso em video</span>
                        </button>
                      )}
                      {canAccessHelpCenter && (
                        <button
                          type="button"
                          data-testid="button-nav-help-center-mobile"
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left text-[13px] font-medium transition-colors",
                            isHelpCenterRoute
                              ? "border-[#e3e3e3] bg-white text-slate-900 shadow-sm"
                              : "border-transparent text-slate-600 hover:bg-[#ebebeb]"
                          )}
                          onClick={() => {
                            setToolsPickerOpen(false);
                            setLocation("/ajuda");
                          }}
                        >
                          <HelpCircle className="h-4 w-4 opacity-80" />
                          <span className="flex-1">Central de Ajuda</span>
                        </button>
                      )}
                    </div>
                  )}

                </div>
              </div>

              <div className="border-t border-[#e3e3e3] bg-[#f1f1f1] px-4 py-4">
                <div className="space-y-3">
                  <div className="rounded-xl bg-black p-3.5 text-white">
                    <p className="text-[12px] font-bold leading-tight">
                      {isEffectivelyPaid ? "Upgrade de plano" : sidebarPlanName}
                    </p>
                    <p className="mt-1 text-[11px] font-medium leading-tight text-slate-300">
                      {isEffectivelyPaid ? `${sidebarPlanName} no plano atual. Veja o próximo plano disponível.` : "Agente e conversas no Grátis. Plus libera ferramentas e prioridade rápida."}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setToolsPickerOpen(false);
                        setLocation("/plans");
                      }}
                      className="mt-3 w-full rounded-lg bg-white py-1.5 text-[11px] font-bold text-black transition hover:bg-slate-100"
                      data-testid="button-mobile-sidebar-plan-card"
                    >
                      {isEffectivelyPaid ? "Ver planos" : "Ver Plus"}
                    </button>
                  </div>

                  {canAccessToolsMenu && (
                    <button
                      type="button"
                      data-testid="button-mobile-more-tools"
                      className="flex w-full items-center gap-2.5 rounded-xl border border-[#e3e3e3] bg-white px-3 py-2 text-left text-[13px] font-semibold text-[#008060] shadow-sm transition hover:bg-slate-50"
                      onClick={() => {
                        setToolsPickerOpen(false);
                        handleMoreTools();
                      }}
                    >
                      <Wrench className="h-4 w-4" />
                      <span className="flex-1">Mais Ferramentas</span>
                    </button>
                  )}

                  <button
                    type="button"
                    data-testid="button-mobile-settings-footer"
                    className="flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-[13px] font-medium text-slate-500 transition hover:bg-[#ebebeb] hover:text-slate-900"
                    onClick={() => {
                      setToolsPickerOpen(false);
                      setLocation("/settings");
                    }}
                  >
                    <Settings className="h-4 w-4 opacity-80" />
                    <span className="flex-1">Configurações</span>
                  </button>
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





