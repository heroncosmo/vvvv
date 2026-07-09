import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Layers3,
  Link2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sheet,
  Trash2,
  Unplug,
} from "lucide-react";

import ContextualHelpButton from "@/components/contextual-help-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type MetaFormConnection = {
  id: string;
  connectionName: string;
  phoneNumberMasked: string | null;
  isConnected?: boolean;
};

type GoogleSpreadsheetFile = {
  spreadsheetId: string;
  name: string;
  modifiedTime: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
};

type SpreadsheetSearchResponse = {
  connected: boolean;
  requiresReconnect?: boolean;
  spreadsheets: GoogleSpreadsheetFile[];
  message?: string;
};

type ResolvedSpreadsheet = {
  spreadsheetId: string;
  spreadsheetTitle: string;
  defaultSheetName: string;
  defaultSheetGid: string | null;
};

type MetaFormSummary = {
  total: number;
  sent: number;
  skipped: number;
  attention: number;
  recentConversationSkips: number;
};

type MetaFormEvent = {
  id: string;
  leadName: string | null;
  leadPhone: string | null;
  leadCompany: string | null;
  formId: string | null;
  submittedAt: string | null;
  processedAt: string | null;
  status: string;
  errorMessage: string | null;
  messageText: string | null;
  metaCapiStatus: string | null;
  metaCapiError: string | null;
  existingConversationId?: string | null;
  createdAt: string;
};

type MetaFormIntegration = {
  id: string;
  sheetId: string;
  spreadsheetTitle?: string | null;
  sheetName: string;
  sheetGid: string | null;
  connectionId: string | null;
  pollIntervalMinutes: number;
  sendRetryAttempts: number;
  antiBanDelayEnabled: boolean;
  antiBanDelayMinMinutes: number;
  antiBanDelayMaxMinutes: number;
  messageTemplate: string | null;
  active: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string;
  lastSyncMessage: string | null;
  summary: MetaFormSummary;
};

type MetaFormResponse = {
  beta: { enabled: boolean; userEmail: string | null };
  selectedIntegrationId: string | null;
  integration: MetaFormIntegration | null;
  integrations: MetaFormIntegration[];
  events: MetaFormEvent[];
  eventPagination: { page: number; pageSize: number; total: number; totalPages: number };
  eventSummary: MetaFormSummary;
  overallSummary: MetaFormSummary;
  automationRules: {
    recentConversationWindowHours: number;
    defaultPollIntervalMinutes: number;
    defaultSendRetryAttempts: number;
    defaultAntiBanDelayEnabled: boolean;
    defaultAntiBanDelayMinMinutes: number;
    defaultAntiBanDelayMaxMinutes: number;
    minAntiBanDelayMinutes: number;
    maxAntiBanDelayMinutes: number;
  };
  connections: MetaFormConnection[];
  google: {
    configured: boolean;
    connected: boolean;
    scopeReady: boolean;
    missingScopes: string[];
    connectedEmail: string | null;
  };
  user: { id: string; email: string | null };
  syncResult?: { processedCount: number; sentCount: number; integrationsProcessed?: number };
};

const EVENTS_PAGE_SIZE = 10;
const HELP_ARTICLE_ID = "integrations-meta-formulario-google-drive";
const META_FORM_GOOGLE_POPUP_EVENT = "meta-form-google-oauth";
const DEFAULT_MESSAGE_TEMPLATE = [
  "Olá! Vi aqui que você pediu contato pelo formulário do AgenteZap.",
  "Vou continuar seu atendimento por aqui no WhatsApp.",
  "Se preferir, já me diga qual é a sua principal dúvida ou objetivo com a automação.",
].join("\n");

function normalizeTemplateForEditor(value: string | null | undefined) {
  return String(value || "").split("\\r\\n").join("\n").split("\\n").join("\n");
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Ainda não executado";
}

function syncBadgeVariant(status: string | null | undefined) {
  if (status === "success" || status === "sent") return "default";
  if (status === "running" || status === "waiting_connection") return "secondary";
  if (status === "failed" || status === "error") return "destructive";
  return "outline";
}

function eventStatusLabel(status: string) {
  if (status === "sent") return "Mensagem enviada";
  if (status === "skipped_recent_conversation") return "Ja em contato";
  if (status === "skipped_existing_conversation") return "Ja em contato";
  if (status === "waiting_connection") return "Aguardando conexao";
  if (status === "skipped_missing_connection") return "Sem conexão";
  if (status === "skipped_no_phone") return "Sem telefone";
  if (status === "failed") return "Falha no envio";
  return status;
}

function buildEmptySummary(): MetaFormSummary {
  return {
    total: 0,
    sent: 0,
    skipped: 0,
    attention: 0,
    recentConversationSkips: 0,
  };
}

function formatAntiBanDelaySummary(integration: Pick<
  MetaFormIntegration,
  "antiBanDelayEnabled" | "antiBanDelayMinMinutes" | "antiBanDelayMaxMinutes"
>) {
  return `Delay extra obrigatorio de ${integration.antiBanDelayMinMinutes} a ${integration.antiBanDelayMaxMinutes} min`;
}

function getIntegrationDisplayName(integration: Pick<MetaFormIntegration, "spreadsheetTitle" | "sheetName"> | null | undefined) {
  return integration?.spreadsheetTitle || integration?.sheetName || "Planilha sem nome";
}

function getFriendlyRequestErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const raw = String(error.message || "").trim();
  const payloadStart = raw.indexOf("{");
  if (payloadStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(payloadStart));
      if (parsed && typeof parsed === "object" && typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message.trim();
      }
    } catch {
      // Mantem a mensagem original quando nao houver JSON valido.
    }
  }

  return raw || fallback;
}

function openMetaFormGooglePopup(url: string) {
  const width = 560;
  const height = 760;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const popup = window.open(
    url,
    "meta-form-google-connect",
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
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const payload = event.data;
      if (!payload || payload.source !== META_FORM_GOOGLE_POPUP_EVENT) {
        return;
      }

      finish({
        success: Boolean(payload.success),
        message: typeof payload.message === "string" ? payload.message : null,
        googleEmail: typeof payload.googleEmail === "string" ? payload.googleEmail : null,
      });
    };

    const checkClosedInterval = window.setInterval(() => {
      if (!popup.closed || settled) {
        return;
      }

      cleanup();
      reject(new Error("A janela de conexão Google foi fechada antes de concluir."));
    }, 500);

    window.addEventListener("message", handleMessage);
  });
}

export default function MetaFormularioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [eventPage, setEventPage] = useState(1);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [editingIntegrationId, setEditingIntegrationId] = useState<string | null>(null);
  const [isCreatingNewIntegration, setIsCreatingNewIntegration] = useState(false);
  const [integrationDialogOpen, setIntegrationDialogOpen] = useState(false);
  const [sheetId, setSheetId] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [sheetGid, setSheetGid] = useState("");
  const [sheetDisplayName, setSheetDisplayName] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [pollIntervalMinutes, setPollIntervalMinutes] = useState("5");
  const [sendRetryAttempts, setSendRetryAttempts] = useState("3");
  const [antiBanDelayEnabled, setAntiBanDelayEnabled] = useState(true);
  const [antiBanDelayMinMinutes, setAntiBanDelayMinMinutes] = useState("3");
  const [antiBanDelayMaxMinutes, setAntiBanDelayMaxMinutes] = useState("7");
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_MESSAGE_TEMPLATE);
  const [active, setActive] = useState(true);
  const [planilhaSearchTerm, setPlanilhaSearchTerm] = useState("");
  const [spreadsheetSearchTerm, setSpreadsheetSearchTerm] = useState("");
  const [spreadsheetSearchRequestTerm, setSpreadsheetSearchRequestTerm] = useState<string | null>(null);
  const [lastGoogleSessionKey, setLastGoogleSessionKey] = useState("");

  const formQuery = useQuery<MetaFormResponse>({
    queryKey: ["/api/meta-formulario", eventPage, selectedIntegrationId || "default"],
    retry: false,
    queryFn: async () => {
      const integrationQuery = selectedIntegrationId
        ? `&integrationId=${encodeURIComponent(selectedIntegrationId)}`
        : "";
      const response = await apiRequest(
        "GET",
        `/api/meta-formulario?page=${eventPage}&pageSize=${EVENTS_PAGE_SIZE}${integrationQuery}`,
      );
      return response.json();
    },
  });

  const data = formQuery.data;
  const integrations = data?.integrations ?? [];
  const selectedIntegration = data?.google.connected
    ? integrations.find((item) => item.id === selectedIntegrationId) ||
      integrations.find((item) => item.id === data?.selectedIntegrationId) ||
      null
    : null;
  const editingIntegration = isCreatingNewIntegration
    ? null
    : integrations.find((item) => item.id === editingIntegrationId) || selectedIntegration;
  const selectedConnection = data?.connections.find((item) => item.id === connectionId) || null;
  const userEmail = String(data?.user?.email || user?.email || "").trim().toLowerCase();
  const connectedGoogleEmail = String(data?.google.connectedEmail || "").trim().toLowerCase();
  const automationRules = data?.automationRules;
  const selectedIntegrationAutomationPreview = selectedIntegration ?? {
    sendRetryAttempts: automationRules?.defaultSendRetryAttempts || 3,
    antiBanDelayEnabled: true,
    antiBanDelayMinMinutes: automationRules?.defaultAntiBanDelayMinMinutes || 3,
    antiBanDelayMaxMinutes: automationRules?.defaultAntiBanDelayMaxMinutes || 7,
  };

  function resetForm(integration?: MetaFormIntegration | null) {
    setSheetId(integration?.sheetId || "");
    setSheetName(integration?.sheetName || "");
    setSheetGid(integration?.sheetGid || "");
    setSheetDisplayName(integration?.spreadsheetTitle || integration?.sheetName || "");
    setConnectionId(integration?.connectionId || "");
    setPollIntervalMinutes(String(integration?.pollIntervalMinutes || automationRules?.defaultPollIntervalMinutes || 5));
    setSendRetryAttempts(
      String(integration?.sendRetryAttempts || automationRules?.defaultSendRetryAttempts || 3),
    );
    setAntiBanDelayEnabled(true);
    setAntiBanDelayMinMinutes(
      String(integration?.antiBanDelayMinMinutes || automationRules?.defaultAntiBanDelayMinMinutes || 3),
    );
    setAntiBanDelayMaxMinutes(
      String(integration?.antiBanDelayMaxMinutes || automationRules?.defaultAntiBanDelayMaxMinutes || 7),
    );
    setMessageTemplate(normalizeTemplateForEditor(integration?.messageTemplate || DEFAULT_MESSAGE_TEMPLATE));
    setActive(Boolean(integration?.active ?? true));
  }

  function closeIntegrationDialog() {
    setIntegrationDialogOpen(false);
    setIsCreatingNewIntegration(false);
    setEditingIntegrationId(selectedIntegration?.id || null);
    setSpreadsheetSearchTerm("");
    setSpreadsheetSearchRequestTerm(null);
    resetForm(selectedIntegration);
  }

  function openCreateIntegrationDialog() {
    setIsCreatingNewIntegration(true);
    setEditingIntegrationId(null);
    setSelectedIntegrationId(selectedIntegration?.id || null);
    setSpreadsheetSearchTerm("");
    setSpreadsheetSearchRequestTerm(null);
    resetForm(null);
    setIntegrationDialogOpen(true);
  }

  function openEditIntegrationDialog(integration: MetaFormIntegration) {
    setIsCreatingNewIntegration(false);
    setSelectedIntegrationId(integration.id);
    setEditingIntegrationId(integration.id);
    setSpreadsheetSearchTerm("");
    setSpreadsheetSearchRequestTerm(null);
    resetForm(integration);
    setIntegrationDialogOpen(true);
  }

  useEffect(() => {
    if (!data) return;
    const serverSelectedId = data.google.connected ? data.selectedIntegrationId : null;
    const selectedStillVisible = selectedIntegrationId
      ? integrations.some((integration) => integration.id === selectedIntegrationId)
      : false;

    if (!data.google.connected || !serverSelectedId) {
      if (selectedIntegrationId) {
        setSelectedIntegrationId(null);
      }
      if (!integrationDialogOpen && editingIntegrationId) {
        setEditingIntegrationId(null);
      }
      return;
    }
    if (!selectedIntegrationId || !selectedStillVisible) {
      setSelectedIntegrationId(serverSelectedId);
    }
    if ((!editingIntegrationId || !selectedStillVisible) && !isCreatingNewIntegration) {
      setEditingIntegrationId(serverSelectedId);
    }
  }, [data, editingIntegrationId, integrationDialogOpen, integrations, isCreatingNewIntegration, selectedIntegrationId]);

  useEffect(() => {
    if (!data) return;

    const nextGoogleSessionKey = data.google.connected ? connectedGoogleEmail : "";
    if (lastGoogleSessionKey && nextGoogleSessionKey !== lastGoogleSessionKey) {
      setIntegrationDialogOpen(false);
      setIsCreatingNewIntegration(false);
      setSelectedIntegrationId(null);
      setEditingIntegrationId(null);
      setPlanilhaSearchTerm("");
      setSpreadsheetSearchTerm("");
      setSpreadsheetSearchRequestTerm(null);
      resetForm(null);
    }
    setLastGoogleSessionKey(nextGoogleSessionKey);
  }, [connectedGoogleEmail, data, lastGoogleSessionKey]);

  useEffect(() => {
    if (!isCreatingNewIntegration) {
      resetForm(editingIntegration);
    }
  }, [editingIntegration, isCreatingNewIntegration]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleConnected = params.get("googleConnected");
    const googleError = params.get("googleError");

    if (!googleConnected && !googleError) {
      return;
    }

    if (googleConnected) {
      toast({
        title: "Google Drive conectado",
        description: "Agora você já pode buscar suas planilhas pelo nome e escolher a que deseja monitorar.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/meta-formulario"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/meta-formulario/spreadsheets/search"] });
    }

    if (googleError) {
      toast({
        title: "Falha ao conectar Google",
        description: googleError,
        variant: "destructive",
      });
    }

    params.delete("googleConnected");
    params.delete("googleError");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, [toast]);

  const spreadsheetSearchQuery = useQuery<SpreadsheetSearchResponse>({
    queryKey: ["/api/meta-formulario/spreadsheets/search", spreadsheetSearchRequestTerm, isCreatingNewIntegration],
    enabled: isCreatingNewIntegration && Boolean(data?.google.connected) && spreadsheetSearchRequestTerm !== null,
    retry: false,
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/meta-formulario/spreadsheets/search?q=${encodeURIComponent((spreadsheetSearchRequestTerm || "").trim())}`,
      );
      return response.json();
    },
  });

  const connectGoogleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/meta-formulario/google/connect", { mode: "popup" });
      return response.json() as Promise<{ url: string }>;
    },
    onSuccess: async ({ url }) => {
      if (!url) {
        return;
      }

      try {
        const result = await openMetaFormGooglePopup(url);
        if (!result) {
          return;
        }

        if (!result.success) {
          throw new Error(result.message || "Não foi possível concluir a conexão com o Google.");
        }

        setSelectedIntegrationId(null);
        setEditingIntegrationId(null);
        setSpreadsheetSearchRequestTerm(null);
        await queryClient.invalidateQueries({ queryKey: ["/api/meta-formulario"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/meta-formulario/spreadsheets/search"] });
        toast({
          title: "Google Drive conectado",
          description: result.googleEmail
            ? `Conexão liberada com ${result.googleEmail}. Agora você já pode buscar suas planilhas.`
            : "Agora você já pode buscar suas planilhas pelo nome e escolher a que deseja monitorar.",
        });
      } catch (error) {
        toast({
          title: "Falha ao conectar Google",
          description: getFriendlyRequestErrorMessage(
            error,
            "Não foi possível concluir a conexão com o Google Drive.",
          ),
          variant: "destructive",
        });
      }
    },
    onError: (error: any) =>
      toast({
        title: "Falha ao conectar Google",
        description: error?.message || "Não foi possível iniciar a conexão com o Google Drive.",
        variant: "destructive",
      }),
  });

  const disconnectGoogleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/meta-formulario/google/disconnect", {});
      return response.json();
    },
    onSuccess: async () => {
      setIntegrationDialogOpen(false);
      setIsCreatingNewIntegration(false);
      setSelectedIntegrationId(null);
      setEditingIntegrationId(null);
      setSheetId("");
      setSheetName("");
      setSheetGid("");
      setSheetDisplayName("");
      setConnectionId("");
      setPollIntervalMinutes("5");
      setSendRetryAttempts(String(automationRules?.defaultSendRetryAttempts || 3));
      setAntiBanDelayEnabled(true);
      setAntiBanDelayMinMinutes(String(automationRules?.defaultAntiBanDelayMinMinutes || 3));
      setAntiBanDelayMaxMinutes(String(automationRules?.defaultAntiBanDelayMaxMinutes || 7));
      setMessageTemplate(DEFAULT_MESSAGE_TEMPLATE);
      setActive(true);
      setPlanilhaSearchTerm("");
      setSpreadsheetSearchTerm("");
      setSpreadsheetSearchRequestTerm(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/meta-formulario"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/meta-formulario/spreadsheets/search"] });
      toast({
        title: "Google desconectado",
        description: "A conta Google foi desconectada deste módulo.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Falha ao desconectar Google",
        description: error?.message || "Não foi possível desconectar a conta Google.",
        variant: "destructive",
      }),
  });

  const resolveSpreadsheetMutation = useMutation({
    mutationFn: async (spreadsheet: GoogleSpreadsheetFile) => {
      const response = await apiRequest(
        "GET",
        `/api/meta-formulario/spreadsheets/resolve?spreadsheetId=${encodeURIComponent(spreadsheet.spreadsheetId)}`,
      );
      const resolved = (await response.json()) as ResolvedSpreadsheet;
      return { spreadsheet, resolved };
    },
    onSuccess: ({ spreadsheet, resolved }) => {
      setSheetId(spreadsheet.spreadsheetId);
      setSheetName(resolved.defaultSheetName);
      setSheetGid(resolved.defaultSheetGid || "");
      setSheetDisplayName(spreadsheet.name || resolved.spreadsheetTitle);
      toast({
        title: "Planilha selecionada",
        description: `${spreadsheet.name} foi vinculada. A leitura vai considerar todas as abas visíveis.`,
      });
    },
    onError: (error: any) =>
      toast({
        title: "Falha ao selecionar planilha",
        description: error?.message || "Não foi possível carregar a estrutura da planilha escolhida.",
        variant: "destructive",
      }),
  });

  const saveIntegrationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/meta-formulario?page=${eventPage}&pageSize=${EVENTS_PAGE_SIZE}`,
        {
          integrationId: isCreatingNewIntegration ? null : editingIntegrationId,
          sheetId,
          sheetName,
          sheetGid: sheetGid || null,
          connectionId,
          pollIntervalMinutes: Number(pollIntervalMinutes || 5),
          sendRetryAttempts: Number(sendRetryAttempts || automationRules?.defaultSendRetryAttempts || 3),
          antiBanDelayEnabled: true,
          antiBanDelayMinMinutes: Number(
            antiBanDelayMinMinutes || automationRules?.defaultAntiBanDelayMinMinutes || 3,
          ),
          antiBanDelayMaxMinutes: Number(
            antiBanDelayMaxMinutes || automationRules?.defaultAntiBanDelayMaxMinutes || 7,
          ),
          messageTemplate: normalizeTemplateForEditor(messageTemplate),
          active,
        },
      );
      return response.json() as Promise<MetaFormResponse>;
    },
    onSuccess: async (response) => {
      setIsCreatingNewIntegration(false);
      setIntegrationDialogOpen(false);
      setEventPage(1);
      setSpreadsheetSearchTerm("");
      setSpreadsheetSearchRequestTerm(null);
      if (response.selectedIntegrationId) {
        setSelectedIntegrationId(response.selectedIntegrationId);
        setEditingIntegrationId(response.selectedIntegrationId);
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/meta-formulario"] });
      toast({
        title: "Planilha salva",
        description: "A configuração do Formulário Meta foi atualizada com sucesso.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Falha ao salvar",
        description: error?.message || "Não foi possível salvar a configuração.",
        variant: "destructive",
      }),
  });

  const removeIntegrationMutation = useMutation({
    mutationFn: async (integration: MetaFormIntegration) => {
      const response = await apiRequest(
        "DELETE",
        `/api/meta-formulario/${encodeURIComponent(integration.id)}?page=${eventPage}&pageSize=${EVENTS_PAGE_SIZE}`,
      );
      return response.json() as Promise<MetaFormResponse>;
    },
    onSuccess: async (response) => {
      setIntegrationDialogOpen(false);
      setIsCreatingNewIntegration(false);
      setEventPage(1);
      setSpreadsheetSearchTerm("");
      setSpreadsheetSearchRequestTerm(null);
      setSheetId("");
      setSheetName("");
      setSheetGid("");
      setSheetDisplayName("");
      setConnectionId("");
      setPollIntervalMinutes("5");
      setSendRetryAttempts(String(automationRules?.defaultSendRetryAttempts || 3));
      setAntiBanDelayEnabled(true);
      setAntiBanDelayMinMinutes(String(automationRules?.defaultAntiBanDelayMinMinutes || 3));
      setAntiBanDelayMaxMinutes(String(automationRules?.defaultAntiBanDelayMaxMinutes || 7));
      setMessageTemplate(DEFAULT_MESSAGE_TEMPLATE);
      setActive(true);
      setSelectedIntegrationId(response.selectedIntegrationId || null);
      setEditingIntegrationId(response.selectedIntegrationId || null);
      await queryClient.invalidateQueries({ queryKey: ["/api/meta-formulario"] });
      toast({
        title: "Planilha removida",
        description: "A conexão desta planilha foi removida do Formulário Meta.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Falha ao remover planilha",
        description: error?.message || "Não foi possível remover esta planilha.",
        variant: "destructive",
      }),
  });

  const syncMutation = useMutation({
    mutationFn: async (scope: "selected" | "all") => {
      const integrationQuery =
        scope === "selected" && selectedIntegrationId
          ? `&integrationId=${encodeURIComponent(selectedIntegrationId)}`
          : "";
      const response = await apiRequest(
        "POST",
        `/api/meta-formulario/sync?page=${eventPage}&pageSize=${EVENTS_PAGE_SIZE}${integrationQuery}`,
        scope === "selected" && selectedIntegrationId ? { integrationId: selectedIntegrationId } : {},
      );
      return response.json() as Promise<MetaFormResponse>;
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/meta-formulario"] });
      const processed = response.syncResult?.processedCount ?? 0;
      const sent = response.syncResult?.sentCount ?? 0;
      const integrationsProcessed = response.syncResult?.integrationsProcessed ?? 0;
      toast({
        title: "Sincronização concluída",
        description: `${processed} leads processados, ${sent} mensagens enviadas em ${integrationsProcessed} planilha(s).`,
      });
    },
    onError: (error: any) =>
      toast({
        title: "Falha ao sincronizar",
        description: error?.message || "Não foi possível executar a sincronização manual.",
        variant: "destructive",
      }),
  });

  const overallSummary = data?.overallSummary ?? buildEmptySummary();
  const selectedIntegrationSummary = selectedIntegration?.summary ?? buildEmptySummary();
  const eventSummary = data?.eventSummary ?? buildEmptySummary();
  const spreadsheetSearchErrorMessage = getFriendlyRequestErrorMessage(
    spreadsheetSearchQuery.error,
    "Não foi possível listar as planilhas do Google Drive agora.",
  );
  const hasRequestedSpreadsheetSearch = spreadsheetSearchRequestTerm !== null;
  const eventPagination = data?.eventPagination ?? {
    page: 1,
    pageSize: EVENTS_PAGE_SIZE,
    total: 0,
    totalPages: 1,
  };
  const activeIntegrationsCount = data?.google.connected ? integrations.filter((item) => item.active).length : 0;
  const normalizedPlanilhaSearch = planilhaSearchTerm.trim().toLowerCase();
  const visibleIntegrations = useMemo(() => {
    if (!data?.google.connected) {
      return [];
    }
    if (!normalizedPlanilhaSearch) {
      return integrations;
    }
    return integrations.filter((item) =>
      [item.spreadsheetTitle, item.sheetName, item.sheetId, item.lastSyncStatus].some((value) =>
        String(value || "").toLowerCase().includes(normalizedPlanilhaSearch),
      ),
    );
  }, [data?.google.connected, integrations, normalizedPlanilhaSearch]);

  function requestRemoveIntegration(integration: MetaFormIntegration) {
    if (removeIntegrationMutation.isPending) {
      return;
    }

    const confirmed = window.confirm(
      `Remover a planilha ${getIntegrationDisplayName(integration)} deste módulo? Essa ação apaga apenas esta conexão salva.`,
    );
    if (!confirmed) {
      return;
    }

    removeIntegrationMutation.mutate(integration);
  }

  if (formQuery.isLoading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Carregando módulo de Formulário Meta...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data?.beta.enabled) {
    return (
      <div className="p-6">
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-900">Acesso restrito</CardTitle>
            <CardDescription className="text-amber-800">
              Este módulo está disponível apenas para o dono da conta principal.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-amber-900">
            Conta atual: {userEmail || "não identificada"}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <Card className="border-slate-200">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sheet className="h-4 w-4 text-primary" />
                  <CardTitle>Formulário Meta</CardTitle>
                </div>
                <CardDescription>
                  Conecte o Google do cliente, escolha a planilha certa e deixe o sistema enviar só a
                  primeira mensagem necessária.
                </CardDescription>
                <p className="text-xs text-muted-foreground">
                  Retry ate {selectedIntegrationAutomationPreview.sendRetryAttempts} tentativa(s) · {formatAntiBanDelaySummary(selectedIntegrationAutomationPreview)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <ContextualHelpButton articleId={HELP_ARTICLE_ID} label="Ajuda" align="end" />
                {data.google.connected ? (
                  <Badge variant="outline">{data.google.connectedEmail || "Google conectado"}</Badge>
                ) : (
                  <Badge variant="secondary">Google desconectado</Badge>
                )}
                {selectedIntegration ? (
                  <Badge variant={syncBadgeVariant(selectedIntegration.lastSyncStatus)}>
                    {selectedIntegration.lastSyncStatus}
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {data.google.connected
                      ? selectedIntegration
                        ? `Monitorando ${getIntegrationDisplayName(selectedIntegration)}`
                        : "Escolha a planilha desta conta."
                      : "Conecte o Google para escolher a planilha."}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {data.google.connected
                      ? selectedIntegration
                        ? `${selectedIntegrationSummary.total} leads monitorados · ${selectedIntegrationSummary.sent} enviados`
                        : "Nenhuma planilha vinculada a esta conta Google."
                      : "A autorização abre em popup, sem sair do AgenteZap."}
                  </p>
                  {selectedIntegration ? (
                    <p className="text-xs text-muted-foreground">
                      Última sync: {formatDate(selectedIntegration.lastSyncAt)}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => connectGoogleMutation.mutate()}
                    disabled={connectGoogleMutation.isPending || !data.google.configured}
                    className="gap-2"
                  >
                    <Link2 className="h-4 w-4" />
                    {connectGoogleMutation.isPending
                      ? "Conectando..."
                      : data.google.connected
                        ? "Trocar conta Google"
                        : "Conectar com Google"}
                  </Button>
                  {data.google.connected ? (
                    <>
                      <Button type="button" size="sm" className="gap-2" onClick={openCreateIntegrationDialog}>
                        <Plus className="h-4 w-4" />
                        Nova planilha
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => syncMutation.mutate("selected")}
                        disabled={!selectedIntegration || syncMutation.isPending}
                      >
                        <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                        Sincronizar selecionada
                      </Button>
                      {integrations.length > 1 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => syncMutation.mutate("all")}
                          disabled={syncMutation.isPending}
                        >
                          <Layers3 className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                          Sincronizar todas
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        onClick={() => disconnectGoogleMutation.mutate()}
                        disabled={disconnectGoogleMutation.isPending}
                        className="gap-2"
                      >
                        <Unplug className="h-4 w-4" />
                        {disconnectGoogleMutation.isPending ? "Desconectando..." : "Desconectar"}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              {data.google.connected && !data.google.scopeReady ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Reconecte o Google liberando Google Drive e Google Sheets.
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <CardTitle>Planilhas</CardTitle>
                <CardDescription>
                  {data.google.connected ? "Selecione uma planilha ou crie uma nova." : "Conecte o Google para listar as planilhas desta conta."}
                </CardDescription>
              </div>
              {data.google.connected ? <Badge variant="outline">{activeIntegrationsCount} ativa(s)</Badge> : null}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {!data.google.connected ? (
              <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                Nenhuma planilha visível sem conexão Google.
              </div>
            ) : integrations.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                Nenhuma planilha desta conta ainda.
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="relative min-w-0 flex-1 md:max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={planilhaSearchTerm}
                      onChange={(event) => setPlanilhaSearchTerm(event.target.value)}
                      placeholder="Buscar planilha"
                      className="pl-9"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {visibleIntegrations.length} de {integrations.length}
                  </p>
                </div>

                {visibleIntegrations.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    Nenhuma planilha encontrada.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {visibleIntegrations.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setEventPage(1);
                          setSelectedIntegrationId(item.id);
                          setEditingIntegrationId(item.id);
                          setIsCreatingNewIntegration(false);
                        }}
                        className={`rounded-2xl border p-4 text-left transition-colors ${
                          item.id === selectedIntegration?.id
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={item.active ? "default" : "secondary"}>
                            {item.active ? "ativa" : "pausada"}
                          </Badge>
                          {item.id === selectedIntegration?.id ? <Badge variant="outline">selecionada</Badge> : null}
                        </div>

                        <p className="mt-3 text-sm font-medium">{getIntegrationDisplayName(item)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          ID {item.sheetId.slice(0, 10)}...{item.sheetId.slice(-6)}
                        </p>

                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                          <div>
                            <p className="uppercase tracking-wide">Leads</p>
                            <p className="mt-1 text-base font-semibold text-foreground">{item.summary.total}</p>
                          </div>
                          <div>
                            <p className="uppercase tracking-wide">Enviados</p>
                            <p className="mt-1 text-base font-semibold text-emerald-600">{item.summary.sent}</p>
                          </div>
                        </div>

                        <p className="mt-4 text-xs text-muted-foreground">
                          Última sync: {formatDate(item.lastSyncAt)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {selectedIntegration && data.google.connected ? (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Selecionada: {getIntegrationDisplayName(selectedIntegration)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedIntegration.active ? "Ativa" : "Pausada"} · leitura a cada{" "}
                  {selectedIntegration.pollIntervalMinutes} min
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 sm:self-center"
                  onClick={() => openEditIntegrationDialog(selectedIntegration)}
                >
                  <Settings2 className="h-4 w-4" />
                  Configurar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 text-rose-700 hover:text-rose-800"
                  onClick={() => requestRemoveIntegration(selectedIntegration)}
                  disabled={removeIntegrationMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                  {removeIntegrationMutation.isPending ? "Removendo..." : "Remover"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Dialog
          open={integrationDialogOpen}
          onOpenChange={(open) => (open ? setIntegrationDialogOpen(true) : closeIntegrationDialog())}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{isCreatingNewIntegration ? "Nova planilha" : "Configurar planilha"}</DialogTitle>
              <DialogDescription>
                {isCreatingNewIntegration
                  ? "Busque a planilha, escolha a conexão e salve."
                  : "Ajuste a leitura e a mensagem inicial."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-5">
              {isCreatingNewIntegration ? (
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Buscar planilha no Google Drive</p>
                      <p className="text-xs text-muted-foreground">Busque pelo nome ou liste as mais recentes.</p>
                    </div>
                    {spreadsheetSearchQuery.isFetching ? <Badge variant="secondary">Buscando...</Badge> : null}
                  </div>

                  {!data.google.connected ? (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Conecte o Google para listar as planilhas.
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={spreadsheetSearchTerm}
                        onChange={(event) => setSpreadsheetSearchTerm(event.target.value)}
                        placeholder="Nome da planilha"
                        className="pl-9"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const nextTerm = spreadsheetSearchTerm.trim();
                          if (spreadsheetSearchRequestTerm === nextTerm) {
                            void spreadsheetSearchQuery.refetch();
                            return;
                          }
                          setSpreadsheetSearchRequestTerm(nextTerm);
                        }}
                        disabled={!data.google.connected || spreadsheetSearchQuery.isFetching || !spreadsheetSearchTerm.trim()}
                      >
                        Buscar por nome
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          if (spreadsheetSearchRequestTerm === "") {
                            void spreadsheetSearchQuery.refetch();
                            return;
                          }
                          setSpreadsheetSearchRequestTerm("");
                        }}
                        disabled={!data.google.connected || spreadsheetSearchQuery.isFetching}
                      >
                        Listar recentes
                      </Button>
                    </div>
                  </div>

                  {!data.google.connected ? null : !hasRequestedSpreadsheetSearch ? (
                    <p className="mt-3 text-sm text-muted-foreground">Busque pelo nome ou liste as mais recentes.</p>
                  ) : spreadsheetSearchQuery.isError ? (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                      {spreadsheetSearchErrorMessage}
                    </div>
                  ) : spreadsheetSearchQuery.data?.message ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      {spreadsheetSearchQuery.data.message}
                    </div>
                  ) : spreadsheetSearchQuery.data && spreadsheetSearchQuery.data.spreadsheets.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {spreadsheetSearchRequestTerm
                        ? "Nenhuma planilha encontrada para esse nome."
                        : "Nenhuma planilha recente encontrada."}
                    </p>
                  ) : spreadsheetSearchQuery.data?.spreadsheets.length ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {spreadsheetSearchQuery.data.spreadsheets.map((spreadsheet) => {
                        const isLoadingSpreadsheet =
                          resolveSpreadsheetMutation.isPending &&
                          resolveSpreadsheetMutation.variables?.spreadsheetId === spreadsheet.spreadsheetId;
                        const isCurrent = sheetId === spreadsheet.spreadsheetId;

                        return (
                          <button
                            key={spreadsheet.spreadsheetId}
                            type="button"
                            onClick={() => resolveSpreadsheetMutation.mutate(spreadsheet)}
                            className={`rounded-xl border p-3 text-left transition-colors ${
                              isCurrent
                                ? "border-primary bg-primary/5"
                                : "border-border bg-background hover:bg-muted/40"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium">{spreadsheet.name}</p>
                              {isCurrent ? <Badge variant="outline">selecionada</Badge> : null}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              ID {spreadsheet.spreadsheetId.slice(0, 10)}...{spreadsheet.spreadsheetId.slice(-6)}
                            </p>
                            {spreadsheet.ownerEmail || spreadsheet.modifiedTime ? (
                              <p className="mt-2 text-xs text-muted-foreground">
                                {spreadsheet.ownerEmail || spreadsheet.ownerName || "Google Drive"}
                                {spreadsheet.modifiedTime ? ` · atualizado em ${formatDate(spreadsheet.modifiedTime)}` : ""}
                              </p>
                            ) : null}
                            {isLoadingSpreadsheet ? (
                              <p className="mt-2 text-xs text-primary">Carregando...</p>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <p className="text-sm font-medium">Planilha</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {sheetDisplayName || sheetName || "Nenhuma planilha escolhida"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {sheetId ? "Leitura: todas as abas visíveis." : "Selecione a planilha para continuar."}
                  </p>
                </div>

                <div className="rounded-xl border p-4">
                  <p className="text-sm font-medium">Conexão do WhatsApp</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedConnection
                      ? `${selectedConnection.connectionName}${selectedConnection.phoneNumberMasked ? ` · ${selectedConnection.phoneNumberMasked}` : ""}`
                      : "Escolha a conexão que vai responder."}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="meta-connection">Conexão do WhatsApp</Label>
                  <select
                    id="meta-connection"
                    className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={connectionId}
                    onChange={(event) => setConnectionId(event.target.value)}
                  >
                    <option value="">Selecionar conexão</option>
                    {data.connections.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.connectionName}
                        {item.phoneNumberMasked ? ` · ${item.phoneNumberMasked}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meta-poll">Verificar a cada</Label>
                  <select
                    id="meta-poll"
                    className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={pollIntervalMinutes}
                    onChange={(event) => setPollIntervalMinutes(event.target.value)}
                  >
                    <option value="5">5 minutos</option>
                    <option value="10">10 minutos</option>
                    <option value="15">15 minutos</option>
                    <option value="30">30 minutos</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Automacao de envio</p>
                  <p className="text-xs text-muted-foreground">
                    Se o cliente ja tiver conversa nesta conexao, o lead fica marcado como ja em contato e nao recebe nova mensagem automatica.
                  </p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="meta-retry">Retentar envio ate</Label>
                    <select
                      id="meta-retry"
                      className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={sendRetryAttempts}
                      onChange={(event) => setSendRetryAttempts(event.target.value)}
                    >
                      <option value="1">1 tentativa</option>
                      <option value="2">2 tentativas</option>
                      <option value="3">3 tentativas</option>
                      <option value="4">4 tentativas</option>
                      <option value="5">5 tentativas</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Quando o WhatsApp falhar, o sistema tenta novamente antes de marcar falha.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Delay extra antiban</p>
                      <p className="text-xs text-muted-foreground">
                        Soma um intervalo aleatorio entre um lead enviado e o proximo, alem do antiban central do WhatsApp.
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Ativado obrigatorio</span>
                      <Switch checked={true} disabled onCheckedChange={() => setAntiBanDelayEnabled(true)} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="meta-antiban-min">Delay minimo</Label>
                    <select
                      id="meta-antiban-min"
                      className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={antiBanDelayMinMinutes}
                      onChange={(event) => setAntiBanDelayMinMinutes(event.target.value)}
                      disabled={false}
                    >
                      {Array.from(
                        {
                          length:
                            (automationRules?.maxAntiBanDelayMinutes || 15) -
                            (automationRules?.minAntiBanDelayMinutes || 1) +
                            1,
                        },
                        (_, index) => (automationRules?.minAntiBanDelayMinutes || 1) + index,
                      ).map((minutes) => (
                        <option key={`anti-ban-min-${minutes}`} value={String(minutes)}>
                          {minutes} minuto{minutes > 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="meta-antiban-max">Delay maximo</Label>
                    <select
                      id="meta-antiban-max"
                      className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={antiBanDelayMaxMinutes}
                      onChange={(event) => setAntiBanDelayMaxMinutes(event.target.value)}
                      disabled={false}
                    >
                      {Array.from(
                        {
                          length:
                            (automationRules?.maxAntiBanDelayMinutes || 15) -
                            (automationRules?.minAntiBanDelayMinutes || 1) +
                            1,
                        },
                        (_, index) => (automationRules?.minAntiBanDelayMinutes || 1) + index,
                      ).map((minutes) => (
                        <option key={`anti-ban-max-${minutes}`} value={String(minutes)}>
                          {minutes} minuto{minutes > 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="meta-template">Mensagem inicial</Label>
                <Textarea
                  id="meta-template"
                  value={messageTemplate}
                  onChange={(event) => setMessageTemplate(event.target.value)}
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  Variáveis: {"{{first_name_suffix}}"}, {"{{company_suffix}}"}, {"{{name}}"}, {"{{phone}}"} e {"{{company}}"}.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Integração ativa</p>
                  <p className="text-xs text-muted-foreground">Quando ativa, a leitura automática continua rodando.</p>
                </div>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {!isCreatingNewIntegration && editingIntegration ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 text-rose-700 hover:text-rose-800"
                    onClick={() => requestRemoveIntegration(editingIntegration)}
                    disabled={removeIntegrationMutation.isPending || saveIntegrationMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                    {removeIntegrationMutation.isPending ? "Removendo..." : "Remover planilha"}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={closeIntegrationDialog}>
                  Cancelar
                </Button>
              </div>
              <Button
                type="button"
                onClick={() => saveIntegrationMutation.mutate()}
                disabled={
                  saveIntegrationMutation.isPending ||
                  removeIntegrationMutation.isPending ||
                  formQuery.isFetching ||
                  !sheetId ||
                  !connectionId
                }
              >
                {saveIntegrationMutation.isPending
                  ? "Salvando..."
                  : isCreatingNewIntegration
                    ? "Salvar planilha"
                    : "Salvar configuração"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {selectedIntegration && data.google.connected ? (
          <Card>
              <CardHeader>
                <CardTitle>Relatório de leads</CardTitle>
                <CardDescription>
                  Leads processados da planilha {getIntegrationDisplayName(selectedIntegration)}.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                    <p className="mt-2 text-2xl font-semibold">{eventSummary.total}</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Enviados</p>
                    <p className="mt-2 text-2xl font-semibold text-emerald-600">{eventSummary.sent}</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Pulados</p>
                    <p className="mt-2 text-2xl font-semibold text-amber-600">{eventSummary.skipped}</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Atenção</p>
                    <p className="mt-2 text-2xl font-semibold text-rose-600">{eventSummary.attention}</p>
                  </div>
                </div>

                {data.events.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    Nenhum lead processado ainda.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.events.map((event) => (
                      <div key={event.id} className="rounded-xl border p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium">
                                {event.leadName || event.leadPhone || "Lead sem nome"}
                              </p>
                              <Badge variant={syncBadgeVariant(event.status)}>
                                {eventStatusLabel(event.status)}
                              </Badge>
                              {event.metaCapiStatus ? (
                                <Badge variant={syncBadgeVariant(event.metaCapiStatus)}>
                                  Meta CAPI: {event.metaCapiStatus}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {event.leadPhone || "Sem telefone"}
                              {event.leadCompany ? ` · ${event.leadCompany}` : ""}
                              {event.formId ? ` · Formulário ${event.formId}` : ""}
                            </p>
                          </div>

                          <div className="text-right text-xs text-muted-foreground">
                            <p>Recebido: {formatDate(event.submittedAt || event.createdAt)}</p>
                            <p>Processado: {formatDate(event.processedAt)}</p>
                          </div>
                        </div>

                        {event.errorMessage ? (
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-amber-700">{event.errorMessage}</p>
                            {event.existingConversationId ? (
                              <Button type="button" variant="outline" size="sm" className="gap-2" asChild>
                                <a href={`/conversas/${event.existingConversationId}`}>
                                  <MessageCircle className="h-4 w-4" />
                                  Abrir conversa
                                </a>
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                        {event.metaCapiError ? (
                          <p className="mt-2 text-xs text-rose-700">{event.metaCapiError}</p>
                        ) : null}
                        {event.status === "sent" ? (
                          <div className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{event.messageText || "Mensagem enviada com sucesso."}</span>
                          </div>
                        ) : null}
                      </div>
                    ))}

                    <div className="flex flex-col gap-3 rounded-2xl border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">
                        Mostrando {(eventPagination.page - 1) * eventPagination.pageSize + 1} a{" "}
                        {Math.min(eventPagination.page * eventPagination.pageSize, eventPagination.total)} de{" "}
                        {eventPagination.total} leads.
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEventPage((current) => Math.max(1, current - 1))}
                          disabled={eventPagination.page <= 1}
                        >
                          <ArrowLeft className="mr-1 h-4 w-4" />
                          Anterior
                        </Button>
                        <Badge variant="outline">
                          Página {eventPagination.page} de {eventPagination.totalPages}
                        </Badge>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEventPage((current) => Math.min(eventPagination.totalPages, current + 1))}
                          disabled={eventPagination.page >= eventPagination.totalPages}
                        >
                          Próxima
                          <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

