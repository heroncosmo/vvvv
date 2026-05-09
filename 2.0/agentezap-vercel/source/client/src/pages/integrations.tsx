import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  Building2,
  CarFront,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  ImageOff,
  KeyRound,
  Link2,
  Mail,
  MapPin,
  RefreshCw,
  Settings2,
  Webhook,
} from "lucide-react";

import PremiumBlocked from "@/components/premium-overlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { normalizeGrupoOlxToggleState } from "@shared/grupoOlxIntegrationRules";

type Connection = {
  id: string;
  connectionName?: string | null;
  phoneNumber?: string | null;
  isConnected: boolean;
};

type FunnelStage = {
  id: string;
  name: string;
  position?: number;
};

type Funnel = {
  id: string;
  name: string;
  stages: FunnelStage[];
};

type AiVariation = "consultivo" | "acolhedor" | "objetivo" | "premium";

type Integration = {
  id: string;
  status: string;
  token: string;
  connectionId: string | null;
  xmlFeedUrl: string | null;
  catalogSyncEnabled: boolean;
  leadEmailSyncEnabled: boolean;
  matonConnectionId: string | null;
  matonInboxEmail: string | null;
  matonSenderFilter: string | null;
  syncToAi: boolean;
  createDealEnabled: boolean;
  funnelId: string | null;
  stageId: string | null;
  aiVariation: AiVariation;
  autoReplyTemplate: string | null;
  active: boolean;
  webhookUrl: string;
  hasMatonApiKey: boolean;
  maskedMatonApiKey: string | null;
  googleConfigured: boolean;
  googleConnected: boolean;
  googleScopeReady: boolean;
  googleMissingScopes: string[];
  googleConnectedEmail: string | null;
  googleChecked: boolean;
  googleError: string | null;
  listingCount: number;
  matonConnectionCount: number;
  lastCatalogSyncAt: string | null;
  lastCatalogSyncStatus: string;
  lastCatalogSyncMessage: string | null;
  lastLeadSyncAt: string | null;
  lastLeadSyncStatus: string;
  lastLeadSyncMessage: string | null;
};

type MatonConnectionOption = {
  connectionId: string;
  email: string | null;
  displayName: string | null;
  status: string;
  method: string | null;
};

type ListingPreview = {
  id: string;
  listingCode: string | null;
  title: string;
  transactionType: string | null;
  propertyType: string | null;
  price: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  address: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  garage: number | null;
  livingArea: string | null;
  detailUrl: string | null;
  imageUrl: string | null;
  description?: string | null;
};

type LeadEvent = {
  id: string;
  originLeadId: string;
  portalSource: string;
  leadType: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: string;
  errorMessage: string | null;
  retryCount?: number | null;
  nextRetryAt?: string | null;
  lastRetryAt?: string | null;
  createdAt: string;
};

type IntegrationResponse = {
  integration: Integration | null;
  listings: ListingPreview[];
  listingPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  events: LeadEvent[];
  matonConnections: MatonConnectionOption[];
};

const LISTINGS_PAGE_SIZE = 6;
const GRUPO_OLX_GOOGLE_POPUP_EVENT = "grupo-olx-google-oauth";

const AI_VARIATION_OPTIONS: Array<{
  value: AiVariation;
  label: string;
  description: string;
  template: string;
}> = [
  {
    value: "consultivo",
    label: "Consultivo",
    description: "Mais humano e explicativo, bom para corretor que quer conduzir a conversa.",
    template:
      "Olá {{nome}}, aqui é a equipe da imobiliária. Recebemos seu interesse no imóvel {{imovel_titulo}} pelo {{portal}}. Posso te passar detalhes, disponibilidade e os próximos passos.",
  },
  {
    value: "acolhedor",
    label: "Acolhedor",
    description: "Tom mais caloroso para atendimento próximo.",
    template:
      "Olá {{nome}}, tudo bem? Recebemos seu interesse no imóvel {{imovel_titulo}} pelo {{portal}}. Se quiser, eu já te passo os detalhes e vejo a melhor opção para você.",
  },
  {
    value: "objetivo",
    label: "Objetivo",
    description: "Direto ao ponto para operação com alto volume.",
    template:
      "Olá {{nome}}, recebemos seu contato sobre o imóvel {{imovel_titulo}} pelo {{portal}}. Posso te enviar agora os detalhes principais e o link do anúncio.",
  },
  {
    value: "premium",
    label: "Premium",
    description: "Mais sofisticado, para atendimento de alto padrão.",
    template:
      "Olá {{nome}}, seja bem-vindo. Recebemos seu interesse no imóvel {{imovel_titulo}} pelo {{portal}} e será um prazer te atender. Posso te apresentar os detalhes e a disponibilidade.",
  },
];

const VARIABLE_DESCRIPTIONS = [
  { key: "{{nome}}", meaning: "Nome do lead" },
  { key: "{{portal}}", meaning: "ZAP Imóveis, Viva Real, OLX ou Grupo OLX" },
  { key: "{{lead_type}}", meaning: "Origem do lead: WhatsApp, Formulário, Chat, etc." },
  { key: "{{imovel_codigo}}", meaning: "Código do imóvel" },
  { key: "{{imovel_titulo}}", meaning: "Título do imóvel" },
  { key: "{{cidade}}", meaning: "Cidade" },
  { key: "{{bairro}}", meaning: "Bairro" },
  { key: "{{preco}}", meaning: "Preço capturado" },
  { key: "{{tipo_transacao}}", meaning: "Venda, aluguel ou outro tipo" },
  { key: "{{url_anuncio}}", meaning: "Link do anúncio" },
  { key: "{{telefone}}", meaning: "Telefone do lead" },
  { key: "{{email}}", meaning: "Email do lead" },
  { key: "{{mensagem}}", meaning: "Resumo do interesse vindo do e-mail" },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "Ainda não executado";
  return new Date(value).toLocaleString("pt-BR");
}

function syncStatusLabel(status: string) {
  switch (status) {
    case "success":
      return "Sincronizado";
    case "running":
      return "Em execução";
    case "error":
      return "Com erro";
    default:
      return "Pendente";
  }
}

function syncStatusClass(status: string) {
  switch (status) {
    case "success":
      return "bg-emerald-100 text-emerald-700";
    case "running":
      return "bg-blue-100 text-blue-700";
    case "error":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function eventStatusLabel(status: string) {
  switch (status) {
    case "processed":
      return "Processado";
    case "pending_retry":
      return "Tentando novamente";
    case "processed_with_send_error":
      return "Processado com erro no envio";
    case "missing_phone":
      return "Sem telefone";
    case "duplicate":
      return "Duplicado";
    case "config_error":
      return "Erro de configuração";
    default:
      return status;
  }
}

function eventStatusClass(status: string) {
  switch (status) {
    case "processed":
      return "bg-emerald-100 text-emerald-700";
    case "pending_retry":
      return "bg-amber-100 text-amber-800";
    case "processed_with_send_error":
      return "bg-rose-100 text-rose-700";
    case "missing_phone":
      return "bg-slate-200 text-slate-700";
    case "duplicate":
      return "bg-blue-100 text-blue-700";
    case "config_error":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function hasConfiguredIntegration(integration: Integration | null | undefined) {
  if (!integration) return false;
  return Boolean(
    integration.xmlFeedUrl ||
      integration.connectionId ||
      integration.googleConnected ||
      integration.googleConnectedEmail,
  );
}

function formatCurrency(value: string | null | undefined) {
  if (!value) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return value;
  return numericValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatArea(value: string | null | undefined) {
  if (!value) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return value;
  return `${numericValue.toLocaleString("pt-BR")} m2`;
}

function formatListingLocation(listing: Pick<ListingPreview, "neighborhood" | "city" | "state">) {
  return [listing.neighborhood, listing.city, listing.state].filter(Boolean).join(" | ");
}

function isRecoverableLeadSendError(message: string | null | undefined) {
  const normalized = String(message || "").toLowerCase();
  return [
    "not connected",
    "connection closed",
    "connection errored",
    "connection lost",
    "socket",
    "disconnected",
    "timed out",
  ].some((token) => normalized.includes(token));
}

function openGrupoOlxGooglePopup(url: string) {
  const width = 560;
  const height = 760;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const popup = window.open(
    url,
    "grupo-olx-google-connect",
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
  );

  if (!popup) {
    window.location.href = url;
    return Promise.resolve<null>(null);
  }

  popup.focus();

  return new Promise<{ success: boolean; message?: string | null; googleEmail?: string | null }>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      window.clearInterval(checkClosedInterval);
    };

    const finish = (result: { success: boolean; message?: string | null; googleEmail?: string | null }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const payload = event.data;
      if (!payload || payload.source !== GRUPO_OLX_GOOGLE_POPUP_EVENT) return;
      finish({
        success: Boolean(payload.success),
        message: typeof payload.message === "string" ? payload.message : null,
        googleEmail: typeof payload.googleEmail === "string" ? payload.googleEmail : null,
      });
    };

    const checkClosedInterval = window.setInterval(() => {
      if (!popup.closed || settled) return;
      cleanup();
      reject(new Error("A janela de conexão Google foi fechada antes de concluir."));
    }, 500);

    window.addEventListener("message", handleMessage);
  });
}

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [listingPage, setListingPage] = useState(1);
  const [connectionId, setConnectionId] = useState("");
  const [xmlFeedUrl, setXmlFeedUrl] = useState("");
  const [catalogSyncEnabled, setCatalogSyncEnabled] = useState(true);
  const [leadEmailSyncEnabled, setLeadEmailSyncEnabled] = useState(true);
  const [syncToAi, setSyncToAi] = useState(true);
  const [matonSenderFilter, setMatonSenderFilter] = useState("comunica.zapimoveis.com.br");
  const [createDealEnabled, setCreateDealEnabled] = useState(false);
  const [funnelId, setFunnelId] = useState("");
  const [stageId, setStageId] = useState("");
  const [aiVariation, setAiVariation] = useState<AiVariation>("consultivo");
  const [autoReplyTemplate, setAutoReplyTemplate] = useState(AI_VARIATION_OPTIONS[0].template);
  const [active, setActive] = useState(false);
  const [showConfiguration, setShowConfiguration] = useState(false);

  const integrationQuery = useQuery<IntegrationResponse>({
    queryKey: ["/api/integrations/grupo-olx", listingPage, LISTINGS_PAGE_SIZE],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/integrations/grupo-olx?page=${listingPage}&pageSize=${LISTINGS_PAGE_SIZE}`,
      );
      return response.json() as Promise<IntegrationResponse>;
    },
  });

  const connectionsQuery = useQuery<Connection[]>({
    queryKey: ["/api/whatsapp/connections"],
  });

  const funnelsQuery = useQuery<Funnel[]>({
    queryKey: ["/api/funnels"],
  });

  const selectedFunnel = useMemo(
    () => funnelsQuery.data?.find((item) => item.id === funnelId) ?? null,
    [funnelsQuery.data, funnelId],
  );

  const selectedVariation = useMemo(
    () => AI_VARIATION_OPTIONS.find((option) => option.value === aiVariation) ?? AI_VARIATION_OPTIONS[0],
    [aiVariation],
  );

  useEffect(() => {
    const integration = integrationQuery.data?.integration;
    if (!integration) {
      setShowConfiguration(true);
      return;
    }
    const normalizedToggles = normalizeGrupoOlxToggleState({
      active: integration.active,
      catalogSyncEnabled: integration.catalogSyncEnabled ?? true,
      leadEmailSyncEnabled: integration.leadEmailSyncEnabled ?? true,
      syncToAi: integration.syncToAi ?? true,
      createDealEnabled: integration.createDealEnabled ?? false,
    });
    setConnectionId(integration.connectionId ?? "");
    setXmlFeedUrl(integration.xmlFeedUrl ?? "");
    setCatalogSyncEnabled(normalizedToggles.catalogSyncEnabled);
    setLeadEmailSyncEnabled(normalizedToggles.leadEmailSyncEnabled);
    setSyncToAi(normalizedToggles.syncToAi);
    setMatonSenderFilter(integration.matonSenderFilter ?? "comunica.zapimoveis.com.br");
    setCreateDealEnabled(normalizedToggles.createDealEnabled);
    setFunnelId(integration.funnelId ?? "");
    setStageId(integration.stageId ?? "");
    setAiVariation(integration.aiVariation || "consultivo");
    setAutoReplyTemplate(integration.autoReplyTemplate || AI_VARIATION_OPTIONS[0].template);
    setActive(normalizedToggles.active);
    setShowConfiguration(!hasConfiguredIntegration(integration));
  }, [integrationQuery.data?.integration]);

  useEffect(() => {
    const resolvedPage = integrationQuery.data?.listingPagination?.page;
    if (resolvedPage && resolvedPage !== listingPage) {
      setListingPage(resolvedPage);
    }
  }, [integrationQuery.data?.listingPagination?.page, listingPage]);

  useEffect(() => {
    if (active) return;
    setCatalogSyncEnabled(false);
    setLeadEmailSyncEnabled(false);
    setSyncToAi(false);
    setCreateDealEnabled(false);
  }, [active]);

  useEffect(() => {
    if (leadEmailSyncEnabled) return;
    setCreateDealEnabled(false);
  }, [leadEmailSyncEnabled]);

  useEffect(() => {
    if (!createDealEnabled) return;
    if (!selectedFunnel) return;
    const hasStage = selectedFunnel.stages.some((stage) => stage.id === stageId);
    if (!hasStage) {
      setStageId(selectedFunnel.stages[0]?.id ?? "");
    }
  }, [createDealEnabled, selectedFunnel, stageId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailConnected = params.get("gmailConnected");
    const gmailError = params.get("gmailError");
    if (!gmailConnected && !gmailError) return;

    if (gmailConnected) {
      toast({
        title: "Gmail conectado",
        description: "A leitura direta de leads por e-mail foi liberada para a Imobiliária.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/integrations/grupo-olx"] });
    }

    if (gmailError) {
      toast({
        title: "Falha ao conectar Gmail",
        description: gmailError,
        variant: "destructive",
      });
    }

    params.delete("gmailConnected");
    params.delete("gmailError");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, [toast]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const normalizedToggles = normalizeGrupoOlxToggleState({
        active,
        catalogSyncEnabled,
        leadEmailSyncEnabled,
        syncToAi,
        createDealEnabled,
      });
      const response = await apiRequest("PUT", "/api/integrations/grupo-olx", {
        connectionId: connectionId || null,
        xmlFeedUrl: xmlFeedUrl || null,
        catalogSyncEnabled: normalizedToggles.catalogSyncEnabled,
        leadEmailSyncEnabled: normalizedToggles.leadEmailSyncEnabled,
        syncToAi: normalizedToggles.syncToAi,
        matonSenderFilter,
        createDealEnabled: normalizedToggles.createDealEnabled,
        funnelId: normalizedToggles.createDealEnabled ? funnelId || null : null,
        stageId: normalizedToggles.createDealEnabled ? stageId || null : null,
        aiVariation,
        autoReplyTemplate,
        active: normalizedToggles.active,
      });
      return response.json() as Promise<IntegrationResponse>;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/integrations/grupo-olx"] });
      toast({
        title: "Configuracao salva",
        description: "A ferramenta Imobiliaria foi atualizada para este cliente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const connectGoogleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/integrations/grupo-olx/google/connect", { mode: "popup" });
      return response.json() as Promise<{ url: string }>;
    },
    onSuccess: async ({ url }) => {
      if (!url) return;
      try {
        const result = await openGrupoOlxGooglePopup(url);
        if (!result) return;
        if (!result.success) throw new Error(result.message || "Não foi possível concluir a conexão com o Gmail.");
        await queryClient.invalidateQueries({ queryKey: ["/api/integrations/grupo-olx"] });
        toast({
          title: "Gmail conectado",
          description: result.googleEmail
            ? `Leitura de leads liberada para ${result.googleEmail}.`
            : "A leitura direta do Gmail foi liberada para esta Imobiliária.",
        });
      } catch (error) {
        toast({
          title: "Falha ao conectar Gmail",
          description: error instanceof Error ? error.message : "Não foi possível concluir a conexão com o Gmail.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Falha ao conectar Gmail",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disconnectGoogleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/integrations/grupo-olx/google/disconnect", {});
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/integrations/grupo-olx"] });
      toast({
        title: "Gmail desconectado",
        description: "A conta Google foi desconectada somente deste módulo de Imobiliária.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Falha ao desconectar Gmail",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const syncCatalogMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/integrations/grupo-olx/sync-catalog");
      return response.json();
    },
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/integrations/grupo-olx"] });
      toast({
        title: "Catálogo sincronizado",
        description: data?.result?.totalActive
          ? `${data.result.totalActive} imóveis ativos ficaram disponíveis para a IA.`
          : "O catálogo foi sincronizado.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao sincronizar catálogo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const syncLeadMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/integrations/grupo-olx/sync-email-leads");
      return response.json();
    },
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/integrations/grupo-olx"] });
      toast({
        title: "Leads sincronizados",
        description:
          data?.retried?.attempted > 0
            ? `${data?.processed || 0} e-mails processados e ${data?.retried?.succeeded || 0} leads com erro reenviados.`
            : `${data?.processed || 0} e-mails do ZAP foram processados.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao buscar leads",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const retryFailedLeadsMutation = useMutation({
    mutationFn: async (eventId?: string) => {
      const response = await apiRequest("POST", "/api/integrations/grupo-olx/retry-failed-leads", eventId ? { eventId } : {});
      return response.json();
    },
    onSuccess: async (data: any, eventId) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/integrations/grupo-olx"] });
      toast({
        title: eventId ? "Lead reenviado" : "Retentativa concluída",
        description: data?.retried?.attempted > 0
          ? `${data?.retried?.succeeded || 0} enviados, ${data?.retried?.failed || 0} ainda com erro.`
          : "Nenhum lead com erro recuperável foi encontrado para reenviar agora.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao reenviar leads",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const integration = integrationQuery.data?.integration;
  const listings = integrationQuery.data?.listings ?? [];
  const listingPagination = integrationQuery.data?.listingPagination ?? {
    page: 1,
    pageSize: LISTINGS_PAGE_SIZE,
    total: 0,
    totalPages: 1,
  };
  const events = integrationQuery.data?.events ?? [];
  const retryableEvents = events.filter(
    (event) =>
      (event.status === "processed_with_send_error" || event.status === "pending_retry") &&
      isRecoverableLeadSendError(event.errorMessage),
  );
  const webhookUrl = integration?.webhookUrl ?? "";
  const isLoading = integrationQuery.isLoading || connectionsQuery.isLoading || funnelsQuery.isLoading;
  const canUseCatalogSync = active && catalogSyncEnabled;
  const canUseLeadEmailSync = active && leadEmailSyncEnabled;
  const gmailUnavailable = Boolean(canUseLeadEmailSync && (!integration?.googleConnected || !integration?.googleScopeReady));
  const canFetchLeadEmails = Boolean(
    canUseLeadEmailSync &&
      integration?.googleConnected &&
      integration?.googleScopeReady &&
      !gmailUnavailable,
  );
  const isCreateDealAvailable = canUseLeadEmailSync;
  const configured = hasConfiguredIntegration(integration);

  const handleCopy = async (value: string, successMessage: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast({
      title: "Copiado",
      description: successMessage,
    });
  };

  const applySuggestedTemplate = () => {
    setAutoReplyTemplate(selectedVariation.template);
  };

  return (
    <PremiumBlocked
      title="Continue usando integrações"
      subtitle="Seu período de teste acabou"
      description="Assine um plano para continuar usando a ferramenta Imobiliária com feed XML, leads por e-mail e IA."
      ctaLabel="Ativar Plano Ilimitado"
    >
      <div className="min-w-0 max-w-full flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto min-w-0 max-w-full space-y-6 md:max-w-7xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold">Imobiliária</h1>
              <p className="text-muted-foreground break-words">
                Use o feed XML do Grupo OLX como catálogo da IA e capture os leads do ZAP/Viva Real/OLX pelo Gmail direto do Google.
              </p>
            </div>
            <Badge className={active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}>
              {active ? "Ferramenta ativa" : "Ferramenta inativa"}
            </Badge>
          </div>

          <Card className="border-none bg-gradient-to-br from-background via-background to-muted/40 shadow-sm">
            <CardContent className="flex min-w-0 flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Building2 className="h-4 w-4 text-teal-600" />
                  Painel operacional da imobiliária
                </div>
                <p className="max-w-2xl text-sm text-muted-foreground break-words">
                  Deixe a operação no topo: sincronize catálogo, confira os leads recentes e abra a configuração só quando precisar ajustar a integração.
                </p>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                <Button
                  type="button"
                  variant={showConfiguration ? "secondary" : "outline"}
                  className="w-full justify-center gap-2 whitespace-normal text-center sm:w-auto"
                  onClick={() => setShowConfiguration((value) => !value)}
                >
                  <Settings2 className="h-4 w-4" />
                  {showConfiguration ? "Ocultar configuração" : configured ? "Configurar" : "Começar configuração"}
                  <ChevronDown className={`h-4 w-4 transition-transform ${showConfiguration ? "rotate-180" : ""}`} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => syncCatalogMutation.mutate()}
                  disabled={syncCatalogMutation.isPending || !canUseCatalogSync}
                  className="w-full justify-center gap-2 whitespace-normal text-center sm:w-auto"
                >
                  <RefreshCw className={`h-4 w-4 ${syncCatalogMutation.isPending ? "animate-spin" : ""}`} />
                  Sincronizar catálogo
                </Button>
                <Button
                  type="button"
                  onClick={() => syncLeadMutation.mutate()}
                  disabled={syncLeadMutation.isPending || !canFetchLeadEmails}
                  className="w-full justify-center gap-2 whitespace-normal text-center sm:w-auto"
                >
                  <Mail className="h-4 w-4" />
                  Buscar leads
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => retryFailedLeadsMutation.mutate(undefined)}
                  disabled={retryFailedLeadsMutation.isPending || retryableEvents.length === 0}
                  className="w-full justify-center gap-2 whitespace-normal text-center sm:w-auto"
                >
                  <RefreshCw className={`h-4 w-4 ${retryFailedLeadsMutation.isPending ? "animate-spin" : ""}`} />
                  Reenviar com erro
                </Button>
              </div>
            </CardContent>
          </Card>

          {showConfiguration ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
                <Building2 className="h-5 w-5" />
                Configuração da Imobiliária
              </CardTitle>
              <CardDescription>
                O XML alimenta o catálogo de imóveis da IA. O Google conecta o Gmail do cliente para puxar os e-mails do ZAP e criar o atendimento no WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label>Ativar ferramenta</Label>
                  <div className="flex h-10 items-center rounded-md border px-3">
                    <Switch checked={active} onCheckedChange={setActive} />
                  </div>
                  <p className="text-xs text-muted-foreground">Liga o modo imobiliária para esse cliente.</p>
                </div>

                <div className="space-y-2">
                  <Label>Sincronizar catálogo XML</Label>
                  <div className={`flex h-10 items-center rounded-md border px-3 ${!active ? "opacity-60" : ""}`}>
                    <Switch checked={catalogSyncEnabled} onCheckedChange={setCatalogSyncEnabled} disabled={!active} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {active
                      ? "Quando ligado, o feed XML alimenta o estoque de imóveis."
                      : "Ative a ferramenta principal para liberar este módulo."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Buscar leads por e-mail</Label>
                  <div className={`flex h-10 items-center rounded-md border px-3 ${!active ? "opacity-60" : ""}`}>
                    <Switch checked={leadEmailSyncEnabled} onCheckedChange={setLeadEmailSyncEnabled} disabled={!active} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {active
                      ? "Usa OAuth direto do Google para ler o Gmail do cliente e captar os leads do ZAP."
                      : "Ative a ferramenta principal para liberar este módulo."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Mandar catálogo para a IA</Label>
                  <div className={`flex h-10 items-center rounded-md border px-3 ${!active ? "opacity-60" : ""}`}>
                    <Switch checked={syncToAi} onCheckedChange={setSyncToAi} disabled={!active} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {active
                      ? "Deixa a IA consultar os imóveis no Meu Agente IA e no simulador."
                      : "Ative a ferramenta principal para liberar este módulo."}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="imob-xml-feed">URL do feed XML</Label>
                  <Input
                    id="imob-xml-feed"
                    value={xmlFeedUrl}
                    onChange={(event) => setXmlFeedUrl(event.target.value)}
                    placeholder="https://seusite.com/feeds/canalpro.xml?token=..."
                  />
                  <p className="text-xs text-muted-foreground">Cole aqui o XML/Canal Pro que contém os imóveis do cliente.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="imob-maton-filter">Filtro do remetente</Label>
                  <Input
                    id="imob-maton-filter"
                    value={matonSenderFilter}
                    onChange={(event) => setMatonSenderFilter(event.target.value)}
                    placeholder="comunica.zapimoveis.com.br"
                  />
                  <p className="text-xs text-muted-foreground">Normalmente deixe `comunica.zapimoveis.com.br`.</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Gmail direto do Google</Label>
                    {integration?.googleConnected ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => disconnectGoogleMutation.mutate()}
                        disabled={disconnectGoogleMutation.isPending}
                      >
                        Desconectar
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => connectGoogleMutation.mutate()}
                        disabled={connectGoogleMutation.isPending || !active || !leadEmailSyncEnabled}
                        className="gap-2"
                      >
                        <KeyRound className="h-4 w-4" />
                        Conectar Gmail
                      </Button>
                    )}
                  </div>
                  <div className={`rounded-md border p-3 text-sm ${integration?.googleConnected && integration?.googleScopeReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                    {integration?.googleConnected ? (
                      <p>
                        Conta conectada: <span className="font-medium">{integration.googleConnectedEmail || "Gmail autorizado"}</span>
                      </p>
                    ) : (
                      <p>Conecte a conta Gmail que recebe os leads do ZAP/Viva Real/OLX.</p>
                    )}
                    {integration?.googleError ? <p className="mt-1">{integration.googleError}</p> : null}
                    {integration?.googleMissingScopes?.length ? (
                      <p className="mt-1">Reconecte autorizando a leitura de e-mails.</p>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Este login e separado do Google usado no Formulario Meta e serve apenas para a Imobiliaria.
                  </p>
                </div>
              </div>

              {leadEmailSyncEnabled ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2 xl:col-span-2">
                      <Label htmlFor="imob-connection">Número do WhatsApp</Label>
                      <select
                        id="imob-connection"
                        className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={connectionId}
                        onChange={(event) => setConnectionId(event.target.value)}
                      >
                        <option value="">Selecione uma conexão</option>
                        {(connectionsQuery.data ?? []).map((connection) => (
                          <option key={connection.id} value={connection.id}>
                            {(connection.connectionName || "Conexão") +
                              " - " +
                              (connection.phoneNumber || "Sem número") +
                              (connection.isConnected ? " - conectado" : " - desconectado")}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        O lead do e-mail cai nessa conversa e a primeira mensagem sai como mensagem da IA.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="imob-ai-variation">Variação da IA</Label>
                      <select
                        id="imob-ai-variation"
                        className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={aiVariation}
                        onChange={(event) => setAiVariation(event.target.value as AiVariation)}
                      >
                        {AI_VARIATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">{selectedVariation.description}</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Criar negócio no funil</Label>
                      <div className={`flex h-10 items-center rounded-md border px-3 ${!isCreateDealAvailable ? "opacity-60" : ""}`}>
                        <Switch checked={createDealEnabled} onCheckedChange={setCreateDealEnabled} disabled={!isCreateDealAvailable} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {isCreateDealAvailable
                          ? "Opcional. Use apenas se quiser jogar o lead no Kanban."
                          : "Ative os leads por e-mail para liberar o Kanban automático."}
                      </p>
                    </div>
                  </div>

                  {createDealEnabled ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="imob-funnel">Funil</Label>
                        <select
                          id="imob-funnel"
                          className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={funnelId}
                          onChange={(event) => setFunnelId(event.target.value)}
                        >
                          <option value="">Selecione um funil</option>
                          {(funnelsQuery.data ?? []).map((funnel) => (
                            <option key={funnel.id} value={funnel.id}>
                              {funnel.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="imob-stage">Etapa</Label>
                        <select
                          id="imob-stage"
                          className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={stageId}
                          onChange={(event) => setStageId(event.target.value)}
                          disabled={!selectedFunnel}
                        >
                          <option value="">Selecione uma etapa</option>
                          {(selectedFunnel?.stages ?? []).map((stage) => (
                            <option key={stage.id} value={stage.id}>
                              {stage.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                      Com o Kanban desligado, o lead entra no WhatsApp e a IA continua atendendo normalmente sem criar negócio no funil.
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <Label htmlFor="imob-template">Mensagem automática inicial</Label>
                        <p className="text-xs text-muted-foreground">
                          Essa mensagem continua sendo mensagem da IA. Não pausa a IA nem o follow-up.
                        </p>
                      </div>
                      <Button type="button" variant="outline" onClick={applySuggestedTemplate}>
                        Usar modelo {selectedVariation.label}
                      </Button>
                    </div>
                    <Textarea
                      id="imob-template"
                      rows={6}
                      value={autoReplyTemplate}
                      onChange={(event) => setAutoReplyTemplate(event.target.value)}
                      placeholder={selectedVariation.template}
                    />
                  </div>
                </>
              ) : (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Se a captura por e-mail ficar desligada, essa ferramenta serve apenas para manter o catálogo de imóveis disponível para a IA.
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle className="text-base">1. Feed XML</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>Cole a URL do XML/Canal Pro do cliente.</p>
                    <p>Salve e clique em "Sincronizar catálogo".</p>
                    <p>Os imóveis ativos passam a entrar no contexto da IA.</p>
                  </CardContent>
                </Card>

                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle className="text-base">2. Google Gmail</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>Conecte a conta Gmail que recebe os leads do cliente.</p>
                    <p>Este login fica separado do Formulário Meta.</p>
                    <p>O AgenteZap usa a API oficial do Gmail para buscar os e-mails do ZAP automaticamente.</p>
                  </CardContent>
                </Card>

                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle className="text-base">3. Atendimento</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>O lead do e-mail cria ou reaproveita a conversa no WhatsApp.</p>
                    <p>A primeira mensagem sai como mensagem da IA.</p>
                    <p>No Meu Agente IA, o simulador já consegue consultar esse estoque de imóveis.</p>
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading}>
                  Salvar configuração
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => syncCatalogMutation.mutate()}
                  disabled={syncCatalogMutation.isPending || !integration || !canUseCatalogSync}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${syncCatalogMutation.isPending ? "animate-spin" : ""}`} />
                  Sincronizar catálogo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => syncLeadMutation.mutate()}
                  disabled={syncLeadMutation.isPending || !integration || !canUseLeadEmailSync}
                  className="gap-2"
                >
                  <Mail className="h-4 w-4" />
                  Buscar leads do e-mail
                </Button>
                {active ? (
                  <Badge className="gap-2 bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Em operação
                  </Badge>
                ) : (
                  <Badge className="gap-2 bg-amber-100 text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Salve e ative para usar
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4" />
                  Catálogo XML
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Badge className={syncStatusClass(integration?.lastCatalogSyncStatus || "idle")}>
                  {syncStatusLabel(integration?.lastCatalogSyncStatus || "idle")}
                </Badge>
                <p className="text-muted-foreground">Última execução: {formatDate(integration?.lastCatalogSyncAt)}</p>
                <p className="text-muted-foreground">{integration?.lastCatalogSyncMessage || "Ainda não sincronizado."}</p>
                <p className="font-medium">{integration?.listingCount || 0} imóveis ativos disponíveis para a IA.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-4 w-4" />
                  Leads por e-mail
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Badge className={syncStatusClass(integration?.lastLeadSyncStatus || "idle")}>
                  {syncStatusLabel(integration?.lastLeadSyncStatus || "idle")}
                </Badge>
                <p className="text-muted-foreground">Última execução: {formatDate(integration?.lastLeadSyncAt)}</p>
                <p className="text-muted-foreground">{integration?.lastLeadSyncMessage || "Ainda não sincronizado."}</p>
                {gmailUnavailable ? (
                  <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      Conecte ou reconecte o Gmail direto do Google antes de buscar novos leads por e-mail.
                    </p>
                  </div>
                ) : null}
                <p className="font-medium">{events.length} eventos recentes de lead.</p>
                {retryableEvents.length > 0 ? (
                  <p className="text-amber-700">{retryableEvents.length} lead(s) com erro recuperável aguardando novo envio.</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4" />
                  Google Gmail
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">OAuth configurado: {integration?.googleConfigured ? "sim" : "não"}</p>
                <p className="text-muted-foreground">Gmail conectado: {integration?.googleConnected ? "sim" : "não"}</p>
                <p className="text-muted-foreground">
                  Conta: {integration?.googleConnectedEmail || "nenhuma"}
                </p>
                <p className="text-muted-foreground">
                  Verificação: {integration?.googleChecked ? "OK" : integration?.googleError || "aguardando conexão"}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-base">Imóveis sincronizados</CardTitle>
                    <CardDescription>Endereço, bairro, cidade e dados principais usados pela IA quando a ferramenta está ativa.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      Página {listingPagination.page} de {listingPagination.totalPages}
                    </Badge>
                    <Badge className="bg-slate-100 text-slate-700">
                      {listingPagination.total} imóveis ativos
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {listings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum imóvel sincronizado ainda. Salve a URL do XML e clique em "Sincronizar catálogo".
                  </p>
                ) : (
                  <>
                    <div className="grid gap-3">
                      {listings.map((listing) => (
                        <div
                          key={listing.id}
                          className="group overflow-hidden rounded-lg border bg-background shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
                        >
                          <div className="relative aspect-[16/10] overflow-hidden border-b bg-slate-100">
                            {listing.imageUrl ? (
                              <img
                                src={listing.imageUrl}
                                alt={listing.title}
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-white text-slate-400">
                                <div className="flex flex-col items-center gap-2 text-sm">
                                  <ImageOff className="h-6 w-6" />
                                  Sem imagem no XML
                                </div>
                              </div>
                            )}
                            <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                              <Badge className="bg-white/90 text-slate-800 shadow-sm">
                                {listing.listingCode || "Sem código"}
                              </Badge>
                              {listing.transactionType ? <Badge variant="outline" className="bg-white/85">{listing.transactionType}</Badge> : null}
                            </div>
                          </div>

                          <div className="space-y-3 p-4">
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-3">
                                <p className="min-w-0 text-sm font-semibold leading-snug sm:text-base">{listing.title}</p>
                                {listing.price ? (
                                  <span className="shrink-0 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 sm:text-sm">
                                    {formatCurrency(listing.price)}
                                  </span>
                                ) : null}
                              </div>
                              <div className="grid gap-2 rounded-md border bg-muted/25 p-3 text-sm">
                                <div className="flex items-start gap-2">
                                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Endereço do imóvel</p>
                                    <p className="break-words font-medium text-foreground">
                                      {listing.address || "Endereço não informado no XML"}
                                    </p>
                                    {formatListingLocation(listing) ? (
                                      <p className="mt-0.5 break-words text-muted-foreground">
                                        {formatListingLocation(listing)}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              {listing.propertyType ? (
                                <span className="rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                                  {listing.propertyType}
                                </span>
                              ) : null}
                              {listing.bedrooms ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2.5 py-1">
                                  <BedDouble className="h-3.5 w-3.5" />
                                  {listing.bedrooms} dorm.
                                </span>
                              ) : null}
                              {listing.bathrooms ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2.5 py-1">
                                  <Bath className="h-3.5 w-3.5" />
                                  {listing.bathrooms} banh.
                                </span>
                              ) : null}
                              {listing.garage ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2.5 py-1">
                                  <CarFront className="h-3.5 w-3.5" />
                                  {listing.garage} vaga(s)
                                </span>
                              ) : null}
                              {listing.livingArea ? (
                                <span className="rounded-md bg-muted/60 px-2.5 py-1">
                                  {formatArea(listing.livingArea)}
                                </span>
                              ) : null}
                            </div>

                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs text-muted-foreground">
                                {[listing.transactionType, listing.listingCode].filter(Boolean).join(" | ") || "Imóvel ativo no XML"}
                              </p>
                              {listing.detailUrl ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 transition-colors hover:text-teal-800"
                                  onClick={() => window.open(listing.detailUrl || "", "_blank", "noopener,noreferrer")}
                                >
                                  Abrir anúncio
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {listingPagination.totalPages > 1 ? (
                      <div className="flex flex-col gap-3 rounded-2xl border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-muted-foreground">
                          Mostrando {(listingPagination.page - 1) * listingPagination.pageSize + 1} a{" "}
                          {Math.min(listingPagination.page * listingPagination.pageSize, listingPagination.total)} de{" "}
                          {listingPagination.total} imóveis sincronizados.
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setListingPage((current) => Math.max(1, current - 1))}
                            disabled={listingPagination.page <= 1}
                          >
                            <ArrowLeft className="h-4 w-4" />
                            Anterior
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setListingPage((current) => Math.min(listingPagination.totalPages, current + 1))}
                            disabled={listingPagination.page >= listingPagination.totalPages}
                          >
                            Próxima
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-base">Leads recentes</CardTitle>
                    <CardDescription>Os leads vindos do e-mail usam a mesma esteira de conversa, tags e Kanban opcional.</CardDescription>
                  </div>
                  {retryableEvents.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => retryFailedLeadsMutation.mutate(undefined)}
                      disabled={retryFailedLeadsMutation.isPending}
                      className="gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${retryFailedLeadsMutation.isPending ? "animate-spin" : ""}`} />
                      Reenviar {retryableEvents.length} com erro
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum lead processado ainda. Depois de conectar o Gmail, clique em "Buscar leads do e-mail".
                  </p>
                ) : (
                  events.map((event) => (
                    <div key={event.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{event.contactName || event.contactEmail || event.contactPhone || "Lead sem nome"}</p>
                        <Badge className={eventStatusClass(event.status)}>{eventStatusLabel(event.status)}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[event.portalSource, event.leadType, event.contactPhone, event.contactEmail]
                          .filter(Boolean)
                          .join(" | ")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString("pt-BR")}</p>
                      {event.status === "pending_retry" ? (
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-amber-700">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" />
                            Aguardando novo processamento automático
                          </span>
                        </div>
                      ) : null}
                      {event.errorMessage ? <p className="mt-2 text-xs text-rose-600">{event.errorMessage}</p> : null}
                      {isRecoverableLeadSendError(event.errorMessage) &&
                      (event.status === "processed_with_send_error" || event.status === "pending_retry") ? (
                        <div className="mt-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => retryFailedLeadsMutation.mutate(event.id)}
                            disabled={retryFailedLeadsMutation.isPending}
                          >
                            <RefreshCw className={`h-4 w-4 ${retryFailedLeadsMutation.isPending ? "animate-spin" : ""}`} />
                            Reenviar agora
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Variáveis da mensagem inicial</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {VARIABLE_DESCRIPTIONS.map((item) => (
                  <div key={item.key} className="rounded-md border bg-muted/20 p-3">
                    <p className="font-mono text-xs">{item.key}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.meaning}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Webhook className="h-4 w-4" />
                Webhook legado do Grupo OLX
              </CardTitle>
              <CardDescription>
                Opcional. O foco agora é XML + e-mail. Mesmo assim a URL continua disponível caso você use o webhook direto.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                <Webhook className="h-4 w-4 text-muted-foreground" />
                <Input readOnly value={webhookUrl || "Salve a configuração para gerar a URL do webhook"} />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleCopy(webhookUrl, "A URL do webhook foi copiada.")}
                  disabled={!webhookUrl}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar URL
                </Button>
                {integration?.token ? (
                  <Badge variant="outline" className="gap-2">
                    <Link2 className="h-3.5 w-3.5" />
                    Token gerado
                  </Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PremiumBlocked>
  );
}
