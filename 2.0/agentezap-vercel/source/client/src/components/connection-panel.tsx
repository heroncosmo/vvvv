import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Smartphone, QrCode, CheckCircle2, XCircle, RefreshCw, Loader2, Hash, ArrowLeft, Bot, Link2, Users, Plus, Trash2, Power, RotateCcw, ShieldCheck, Copy, ExternalLink, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";
import { Switch } from "@/components/ui/switch";
import type { WhatsappConnection, Agent } from "@shared/schema";
import { openAppRealtimeConnection, type AppRealtimeConnection } from "@/lib/app-realtime";

// Tipo para o método de conexão
type ConnectionMethod = "qr" | "pairing" | "coexistence" | null;
const LAST_OPERATIONAL_CONNECTION_TTL_MS = 2 * 60 * 1000;
const LAST_OPERATIONAL_OMITTED_CONNECTION_TTL_MS = 10 * 60 * 1000;
const WHATSAPP_QR_REFRESH_MS = 60 * 1000;
const WHATSAPP_QR_AUTO_REFRESH_CHECK_MS = 5 * 1000;

function parseQrGeneratedAt(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function getQrGeneratedAtFromConnection(connection?: { qrCodeGeneratedAt?: unknown; sessionData?: unknown } | null): number | null {
  const explicit = parseQrGeneratedAt(connection?.qrCodeGeneratedAt);
  if (explicit !== null) return explicit;

  const sessionData = connection?.sessionData;
  if (sessionData && typeof sessionData === "object" && !Array.isArray(sessionData)) {
    const runtimeDiagnostics = (sessionData as Record<string, unknown>).runtimeDiagnostics;
    if (runtimeDiagnostics && typeof runtimeDiagnostics === "object" && !Array.isArray(runtimeDiagnostics)) {
      const lastQrCode = (runtimeDiagnostics as Record<string, unknown>).lastQrCode;
      if (lastQrCode && typeof lastQrCode === "object" && !Array.isArray(lastQrCode)) {
        const fromDiagnostics = parseQrGeneratedAt((lastQrCode as Record<string, unknown>).at);
        if (fromDiagnostics !== null) return fromDiagnostics;
      }
    }
  }

  return null;
}

function isFreshQrCode(qrCode?: string | null, generatedAtMs?: number | null): boolean {
  if (!qrCode || generatedAtMs === null || generatedAtMs === undefined) return false;
  return Date.now() - generatedAtMs < WHATSAPP_QR_REFRESH_MS;
}

function getServerProvidedQrCode(conn?: Partial<AppVisibleWhatsappConnection> | null): string | null {
  if (!conn?.qrCode || conn.isConnected === true) {
    return null;
  }

  // The API already decides whether a connection should expose a QR. Do not
  // hide it on the client because a local timer thinks it is old; that can make
  // the QR flash and disappear while the backend still has a usable code.
  return conn.qrCode;
}

interface CoexistenceLaunchConfig {
  appId?: string | null;
  configId?: string | null;
  setupUrl?: string | null;
  redirectUri?: string | null;
  docsUrl?: string | null;
  isConfigured?: boolean;
}

interface CoexistenceBetaStatus {
  enabled: boolean;
  userEmail?: string | null;
  launchConfig?: CoexistenceLaunchConfig | null;
}

interface EmbeddedSignupData {
  waba_id?: string;
  phone_number_id?: string;
  business_id?: string;
  display_phone_number?: string;
  phone_number?: string;
  raw?: Record<string, unknown>;
}

type AppVisibleWhatsappConnection = WhatsappConnection & {
  isRecovering?: boolean;
  hasLocalSocket?: boolean;
  owner?: "local" | "gateway";
  publicApiCanaryAvailable?: boolean;
  qrCodeGeneratedAt?: string | null;
};

// Tipo para conexão com agentes
interface ConnectionWithAgents extends AppVisibleWhatsappConnection {
  agent?: Agent | null;
  assignedAgents?: Array<{
    id: string;
    connectionId: string;
    agentId: string;
    isActive: boolean | null;
    agent?: Agent | null;
  }>;
}

interface ConnectionApiAccessDetails {
  success: boolean;
  instanceId: string;
  owner: "local" | "gateway";
  publicApiEnabled: boolean;
  tokenPreview: string | null;
  tokenValue?: string | null;
  baseUrl: string;
  status?: {
    instanceId: string;
    isConnected: boolean;
    phoneNumber: string | null;
    owner: "local" | "gateway";
  } | null;
  device?: {
    instanceId: string;
    phoneNumber: string | null;
    provider: string | null;
    connectionMethod: string | null;
    owner: "local" | "gateway";
    publicApiEnabled: boolean;
  } | null;
}

const OFFICIAL_PROVIDER = "meta_cloud_api";
const OFFICIAL_METHOD = "coexistence";
const INTERNAL_SIMULATOR_CONNECTION_NAME = "simulador estamparia";

function isOfficialProviderConnection(conn?: Partial<WhatsappConnection> | null) {
  return conn?.provider === OFFICIAL_PROVIDER || conn?.connectionMethod === OFFICIAL_METHOD;
}

function isInternalSimulatorConnection(conn?: Partial<WhatsappConnection> | null) {
  if (!conn) {
    return false;
  }

  const providerConfig =
    conn.providerConfig && typeof conn.providerConfig === "object" && !Array.isArray(conn.providerConfig)
      ? (conn.providerConfig as Record<string, unknown>)
      : null;
  const source = typeof providerConfig?.source === "string" ? providerConfig.source.trim().toLowerCase() : "";
  const phoneNumber = String(conn.phoneNumber || "").trim().toLowerCase();
  const connectionName = String(conn.connectionName || "").trim().toLowerCase();
  const provider = String(conn.provider || "").trim().toLowerCase();
  const connectionMethod = String(conn.connectionMethod || "").trim().toLowerCase();
  const connectionType = String((conn as any).connectionType || "").trim().toLowerCase();

  return (
    phoneNumber.startsWith("sim-") ||
    connectionName === INTERNAL_SIMULATOR_CONNECTION_NAME ||
    provider === "simulator" ||
    connectionMethod === "simulator" ||
    connectionType === "simulator" ||
    source === "estamparia-simulator"
  );
}

function isAppVisibleOperationalConnection(conn?: Partial<AppVisibleWhatsappConnection> | null) {
  if (!conn) {
    return false;
  }

  if (conn.isRecovering === true) {
    return false;
  }

  if (!isOfficialProviderConnection(conn)) {
    return conn.isConnected === true;
  }

  return conn.isConnected === true || conn.providerStatus === "connected";
}

function connectionHasStrongDisconnectSignal(conn?: Partial<AppVisibleWhatsappConnection> | null) {
  if (!conn) {
    return false;
  }

  const providerStatus = String(conn.providerStatus || "").trim().toLowerCase();
  if (Boolean(conn.qrCode)) {
    return true;
  }

  return [
    "auth_failed",
    "close",
    "closed",
    "disconnected",
    "invalid_session",
    "logged_out",
    "logout",
    "not_connected",
    "pairing_required",
    "qr_required",
    "removed",
  ].includes(providerStatus);
}

function getConnectionStatusMeta(conn?: Partial<AppVisibleWhatsappConnection> | null) {
  if (isAppVisibleOperationalConnection(conn)) {
    return { label: "Conectado", tone: "connected" as const };
  }

  if (conn?.isRecovering === true) {
    return { label: "Reconectando", tone: "recovering" as const };
  }

  return { label: "Desconectado", tone: "offline" as const };
}

function connectionRequiresNewQr(conn?: Partial<AppVisibleWhatsappConnection> | null): boolean {
  if (!conn || isOfficialProviderConnection(conn)) {
    return false;
  }

  const providerStatus = String(conn.providerStatus || "").trim().toLowerCase();
  if (connectionHasLoggedOutAuth(conn)) {
    return true;
  }

  const isEmptyInactiveQrSlot =
    providerStatus === "inactive" &&
    conn.isConnected !== true &&
    !String(conn.phoneNumber || "").trim();
  if (isEmptyInactiveQrSlot) {
    return true;
  }

  return [
    "auth_failed",
    "invalid_session",
    "logged_out",
    "logout",
    "pairing_required",
    "qr_required",
    "removed",
  ].includes(providerStatus);
}

function connectionHasLoggedOutAuth(conn?: Partial<AppVisibleWhatsappConnection> | null): boolean {
  const sessionData = conn?.sessionData;
  if (!sessionData || typeof sessionData !== "object" || Array.isArray(sessionData)) {
    return false;
  }

  const runtimeDiagnostics = (sessionData as Record<string, unknown>).runtimeDiagnostics;
  if (!runtimeDiagnostics || typeof runtimeDiagnostics !== "object" || Array.isArray(runtimeDiagnostics)) {
    return false;
  }

  const lastLogout = (runtimeDiagnostics as Record<string, unknown>).lastLogout;
  if (!lastLogout || typeof lastLogout !== "object" || Array.isArray(lastLogout)) {
    return false;
  }

  const details = (lastLogout as Record<string, unknown>).details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const statusCode = Number((details as Record<string, unknown>).statusCode);
    if (statusCode === 401) return true;
  }

  const source = String((lastLogout as Record<string, unknown>).source || "").toLowerCase();
  return source.includes("logged_out") || source.includes("logout");
}

function getProviderStatusLabel(status?: string | null) {
  switch (status) {
    case "pending_setup":
      return "Setup pendente";
    case "awaiting_webhook":
      return "Aguardando webhook";
    case "connected":
      return "Canal oficial ativo";
    case "disconnected":
      return "Canal oficial pausado";
    case "error":
      return "Erro na integração";
    default:
      return "Desconectado";
  }
}

function parseEmbeddedSignupMessage(payload: unknown): {
  type?: string;
  event?: string;
  data?: Record<string, unknown>;
  code?: string;
} | null {
  if (!payload) return null;
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (typeof payload === "object") {
    return payload as {
      type?: string;
      event?: string;
      data?: Record<string, unknown>;
      code?: string;
    };
  }
  return null;
}

function buildHostedEmbeddedSignupUrl(launchConfig?: CoexistenceLaunchConfig | null) {
  const appId = String(launchConfig?.appId || "").trim();
  const configId = String(launchConfig?.configId || "").trim();
  if (!appId || !configId) {
    return null;
  }

  const url = new URL("https://business.facebook.com/messaging/whatsapp/onboard/");
  url.searchParams.set("app_id", appId);
  url.searchParams.set("config_id", configId);
  url.searchParams.set(
    "extras",
    JSON.stringify({
      sessionInfoVersion: "3",
      version: "v3",
    }),
  );

  return url.toString();
}

function extractAuthCodeFromPayload(
  parsed: ReturnType<typeof parseEmbeddedSignupMessage>,
  event: MessageEvent,
) {
  const eventPayload =
    typeof event.data === "object" && event.data !== null
      ? (event.data as Record<string, unknown>)
      : null;

  const candidates: unknown[] = [
    parsed?.code,
    parsed?.data?.code,
    parsed?.data?.authorization_code,
    parsed?.data?.authorizationCode,
    eventPayload?.code,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

export function ConnectionPanel() {
  const { toast } = useToast();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isWaitingQrCode, setIsWaitingQrCode] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const qrCodeRef = useRef<string | null>(null);
  const qrCodeGeneratedAtRef = useRef<number | null>(null);
  const [qrCodeGeneratedAt, setQrCodeGeneratedAt] = useState<number | null>(null);
  const qrCodePollingRef = useRef<NodeJS.Timeout | null>(null);
  const waitingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isWaitingQrCodeRef = useRef<boolean>(false);
  
  // Estados para Pairing Code
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>(null);
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isRequestingPairingCode, setIsRequestingPairingCode] = useState<boolean>(false);

  // Estado para form de nova conexão
  const [showNewConnForm, setShowNewConnForm] = useState(false);
  
  // Estado para fluxo de nova conexão (QR/pairing selection)
  const [newConnStep, setNewConnStep] = useState<"creating" | "method" | "qr-waiting" | "qr-display" | "pairing-form" | "pairing-waiting" | "pairing-display">("creating");
  const [newConnId, setNewConnId] = useState<string | null>(null);
  const [newConnPhoneNumber, setNewConnPhoneNumber] = useState("");
  const [newConnPairingCode, setNewConnPairingCode] = useState<string | null>(null);
  const officialSubmittedRef = useRef(false);
  const officialPopupRef = useRef<Window | null>(null);
  const officialPopupWatchRef = useRef<number | null>(null);
  const [officialSignupTarget, setOfficialSignupTarget] = useState<{
    connectionId: string;
    launchConfig: CoexistenceLaunchConfig | null;
    nonce: number;
  } | null>(null);
  const [officialAuthCode, setOfficialAuthCode] = useState<string | null>(null);
  const [officialSignupData, setOfficialSignupData] = useState<EmbeddedSignupData | null>(null);
  const [officialSdkLoading, setOfficialSdkLoading] = useState(false);
  const [expandedApiConnectionId, setExpandedApiConnectionId] = useState<string | null>(null);
  const [apiDetailsByConnection, setApiDetailsByConnection] = useState<Record<string, ConnectionApiAccessDetails>>({});
  const [loadingApiConnectionId, setLoadingApiConnectionId] = useState<string | null>(null);

  const { data: connection, isLoading, refetch: refetchConnection } = useQuery<AppVisibleWhatsappConnection>({
    queryKey: ["/api/whatsapp/connection"],
    staleTime: 10000, // 10s: evita múltiplas chamadas desnecessárias
  });

  // Query for all connections with agents (multi-connection)
  const { data: allConnections = [], isLoading: connectionsLoading, refetch: refetchConnections } = useQuery<ConnectionWithAgents[]>({
    queryKey: ["/api/whatsapp/connections"],
    enabled: !isLoading, // Always fetch after auth loads (not gated by connection existence)
    retry: 2,
    retryDelay: 1000,
    staleTime: 15000, // 15s: evita refetch desnecessário ao navegar entre páginas
    refetchOnWindowFocus: false,
  });
  const lastOperationalConnectionsRef = useRef<
    Map<string, {
      connection: ConnectionWithAgents;
      statusExpiresAt: number;
      omittedExpiresAt: number;
    }>
  >(new Map());
  const autoStartedEmptyConnectionFlowRef = useRef(false);
  const visibleConnections = useMemo(() => {
    const now = Date.now();
    const lastOperational = lastOperationalConnectionsRef.current;

    for (const [connectionId, snapshot] of Array.from(lastOperational.entries())) {
      if (snapshot.omittedExpiresAt <= now) {
        lastOperational.delete(connectionId);
      }
    }

    const currentRows: ConnectionWithAgents[] = [];
    const seenIds = new Set<string>();

    for (const conn of allConnections.filter((item) => !isInternalSimulatorConnection(item))) {
      seenIds.add(conn.id);
      const hasStrongDisconnectSignal = connectionHasStrongDisconnectSignal(conn);
      if (hasStrongDisconnectSignal) {
        lastOperational.delete(conn.id);
      }

      if (isAppVisibleOperationalConnection(conn)) {
        lastOperational.set(conn.id, {
          connection: conn,
          statusExpiresAt: now + LAST_OPERATIONAL_CONNECTION_TTL_MS,
          omittedExpiresAt: now + LAST_OPERATIONAL_OMITTED_CONNECTION_TTL_MS,
        });
        currentRows.push(conn);
        continue;
      }

      const previous = lastOperational.get(conn.id);
      const providerStatus = String(conn.providerStatus || "").trim().toLowerCase();

      if (
        previous &&
        previous.statusExpiresAt > now &&
        !hasStrongDisconnectSignal &&
        !isOfficialProviderConnection(conn)
      ) {
        currentRows.push({
          ...conn,
          isConnected: true,
          isRecovering: true,
          hasLocalSocket: false,
          providerStatus: conn.providerStatus || previous.connection.providerStatus || "connected",
          phoneNumber: conn.phoneNumber || previous.connection.phoneNumber,
        });
        continue;
      }

      if (providerStatus === "removed") {
        lastOperational.delete(conn.id);
      }
      currentRows.push(conn);
    }

    if (currentRows.length === 0 && allConnections.length === 0) {
      for (const [connectionId, snapshot] of Array.from(lastOperational.entries())) {
        if (seenIds.has(connectionId) || snapshot.omittedExpiresAt <= now) {
          continue;
        }
        currentRows.push(snapshot.connection);
      }
    }

    return currentRows;
  }, [allConnections]);

  const { data: coexistenceBeta } = useQuery<CoexistenceBetaStatus>({
    queryKey: ["/api/whatsapp/coexistence/beta"],
    enabled: !isLoading,
    staleTime: 60000,
    retry: 1,
  });

  const hasConnectionsInList = visibleConnections.length > 0;
  const coexistenceEnabled = coexistenceBeta?.enabled === true;
  const primaryIsOfficial = isOfficialProviderConnection(connection);
  const primaryIsOperational = isAppVisibleOperationalConnection(connection);
  const primaryIsRecovering = connection?.isRecovering === true && !primaryIsOperational;
  const primaryStatusMeta = getConnectionStatusMeta(connection);

  const getConnectionLaunchConfig = useCallback(
    (conn?: Partial<WhatsappConnection> | null): CoexistenceLaunchConfig | null => {
      const providerConfig = conn?.providerConfig as Record<string, any> | null | undefined;
      return (providerConfig?.launchConfig as CoexistenceLaunchConfig | undefined) || coexistenceBeta?.launchConfig || null;
    },
    [coexistenceBeta?.launchConfig],
  );

  const closeOfficialSignupPopup = useCallback(() => {
    if (officialPopupWatchRef.current) {
      window.clearInterval(officialPopupWatchRef.current);
      officialPopupWatchRef.current = null;
    }
    if (officialPopupRef.current && !officialPopupRef.current.closed) {
      officialPopupRef.current.close();
    }
    officialPopupRef.current = null;
  }, []);

  const completeOfficialSignupMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!officialSignupTarget?.connectionId) {
        throw new Error("Conexão oficial ausente para concluir onboarding.");
      }
      const response = await apiRequest(
        "POST",
        `/api/whatsapp/connections/${officialSignupTarget.connectionId}/coexistence/complete`,
        payload,
      );
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      if (officialSignupTarget?.connectionId) {
        await queryClient.invalidateQueries({
          queryKey: [`/api/whatsapp/connections/${officialSignupTarget.connectionId}/coexistence/status`],
        });
      }
      toast({
        title: "Canal oficial configurado",
        description: "A conexão oficial foi concluída e agora usa o fluxo da Meta.",
      });
      setOfficialSdkLoading(false);
      setOfficialSignupTarget(null);
      setOfficialAuthCode(null);
      setOfficialSignupData(null);
    },
    onError: (error: Error) => {
      officialSubmittedRef.current = false;
      setOfficialSdkLoading(false);
      toast({
        title: "Falha ao concluir onboarding",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (
        event.origin !== "https://www.facebook.com" &&
        event.origin !== "https://web.facebook.com" &&
        event.origin !== "https://business.facebook.com"
      ) {
        return;
      }

      const parsed = parseEmbeddedSignupMessage(event.data);
      const maybeCode = extractAuthCodeFromPayload(parsed, event);
      if (maybeCode) {
        setOfficialAuthCode((current) => current || maybeCode);
      }
      if (!parsed || parsed.type !== "WA_EMBEDDED_SIGNUP") {
        return;
      }

      const eventName = String(parsed.event || "").toUpperCase();
      if (eventName.includes("CANCEL")) {
        closeOfficialSignupPopup();
        setOfficialSdkLoading(false);
        toast({
          title: "Onboarding cancelado",
          description: "O fluxo oficial da Meta foi cancelado antes da conclusão.",
          variant: "destructive",
        });
        return;
      }
      if (eventName.includes("ERROR")) {
        closeOfficialSignupPopup();
        setOfficialSdkLoading(false);
        toast({
          title: "Erro no onboarding oficial",
          description: "A Meta retornou um erro durante o Embedded Signup.",
          variant: "destructive",
        });
        return;
      }
      if (!eventName.includes("FINISH")) {
        return;
      }

      const data = parsed.data || {};
      closeOfficialSignupPopup();
      setOfficialSdkLoading(false);
      setOfficialSignupData({
        waba_id: typeof data.waba_id === "string" ? data.waba_id : undefined,
        phone_number_id:
          typeof data.phone_number_id === "string" ? data.phone_number_id : undefined,
        business_id: typeof data.business_id === "string" ? data.business_id : undefined,
        display_phone_number:
          typeof data.display_phone_number === "string" ? data.display_phone_number : undefined,
        phone_number: typeof data.phone_number === "string" ? data.phone_number : undefined,
        raw: data,
      });
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [closeOfficialSignupPopup, toast]);

  useEffect(() => {
    return () => closeOfficialSignupPopup();
  }, [closeOfficialSignupPopup]);

  useEffect(() => {
    if (
      !officialAuthCode ||
      !officialSignupData ||
      !officialSignupTarget?.launchConfig ||
      officialSubmittedRef.current ||
      completeOfficialSignupMutation.isPending
    ) {
      return;
    }

    officialSubmittedRef.current = true;
    completeOfficialSignupMutation.mutate({
      authorizationCode: officialAuthCode,
      redirectUri: officialSignupTarget.launchConfig?.redirectUri || undefined,
      wabaId: officialSignupData.waba_id,
      businessAccountId: officialSignupData.business_id,
      phoneNumberId: officialSignupData.phone_number_id,
      displayPhoneNumber: officialSignupData.display_phone_number,
      phoneNumber: officialSignupData.phone_number || officialSignupData.display_phone_number,
      metadata: officialSignupData.raw || {},
    });
  }, [
    completeOfficialSignupMutation,
    officialAuthCode,
    officialSignupData,
    officialSignupTarget,
  ]);

  const startOfficialEmbeddedSignup = useCallback(
    (connectionId: string, launchConfig?: CoexistenceLaunchConfig | null) => {
      if (!connectionId) {
        toast({
          title: "Conexão oficial ausente",
          description: "Não foi possível identificar a conexão para concluir o onboarding.",
          variant: "destructive",
        });
        return;
      }

      if (!launchConfig?.appId || !launchConfig?.configId) {
        const targetUrl = launchConfig?.setupUrl || launchConfig?.docsUrl;
        if (targetUrl) {
          window.open(targetUrl, "_blank", "noopener,noreferrer");
        }
        toast({
          title: "Configuração da Meta incompleta",
          description: "Faltam APP_ID e CONFIG_ID para abrir o onboarding oficial direto no popup.",
          variant: "destructive",
        });
        return;
      }

      const hostedUrl = buildHostedEmbeddedSignupUrl(launchConfig);
      if (!hostedUrl) {
        toast({
          title: "Falha ao montar onboarding",
          description: "Não foi possível gerar a URL oficial do Embedded Signup da Meta.",
          variant: "destructive",
        });
        return;
      }

      closeOfficialSignupPopup();
      officialSubmittedRef.current = false;
      setOfficialSignupTarget({
        connectionId,
        launchConfig,
        nonce: Date.now(),
      });
      setOfficialAuthCode(null);
      setOfficialSignupData(null);
      setOfficialSdkLoading(true);

      const popup = window.open(
        hostedUrl,
        "agentezap-meta-embedded-signup",
        "width=1200,height=820,menubar=no,toolbar=no,status=no,scrollbars=yes,resizable=yes",
      );

      if (!popup) {
        setOfficialSdkLoading(false);
        toast({
          title: "Popup bloqueado",
          description: "Libere pop-ups do navegador para continuar o setup oficial da Meta.",
          variant: "destructive",
        });
        return;
      }

      officialPopupRef.current = popup;
      popup.focus();
      officialPopupWatchRef.current = window.setInterval(() => {
        if (!officialPopupRef.current || officialPopupRef.current.closed) {
          closeOfficialSignupPopup();
          setOfficialSdkLoading(false);
        }
      }, 500);
    },
    [closeOfficialSignupPopup, toast],
  );

  const launchOfficialSignup = useCallback(
    (connectionId?: string | null, launchConfig?: CoexistenceLaunchConfig | null) => {
      if (connectionId) {
        startOfficialEmbeddedSignup(connectionId, launchConfig);
        return;
      }

      const targetUrl = launchConfig?.setupUrl || launchConfig?.docsUrl;
      if (targetUrl) {
        window.open(targetUrl, "_blank", "noopener,noreferrer");
      }

      toast({
        title: launchConfig?.isConfigured ? "Onboarding oficial liberado" : "Canal oficial preparado",
        description: launchConfig?.isConfigured
          ? "Conclua o Embedded Signup da Meta e finalize o canal oficial."
          : "Abra o setup interno para concluir a configuração do Embedded Signup da Meta.",
      });
    },
    [startOfficialEmbeddedSignup, toast],
  );

  // Mutation para criar nova conexão
  const createConnectionMutation = useMutation({
    mutationFn: async (payload?: { connectionName?: string; connectionType?: string }) => {
      const response = await apiRequest("POST", "/api/whatsapp/connections", {
        connectionName: payload?.connectionName,
        connectionType: payload?.connectionType || "secondary",
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      // Save the new connection ID and move to method selection
      setNewConnId(data.id);
      setNewConnStep("method");
      toast({ title: "Conexão criada! Escolha como conectar." });
    },
    onError: (error: Error) => {
      setShowNewConnForm(false);
      setNewConnStep("creating");
      toast({ title: "Erro ao criar conexão", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para deletar conexão
  const deleteConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await apiRequest("DELETE", `/api/whatsapp/connections/${connectionId}`);
      return response.json().catch(() => ({}));
    },
    onSuccess: (data: any, connectionId) => {
      lastOperationalConnectionsRef.current.delete(connectionId);
      setConnectionQrCodes((current) => {
        const next = { ...current };
        delete next[connectionId];
        return next;
      });
      setConnectionQrCodeGeneratedAt((current) => {
        const next = { ...current };
        delete next[connectionId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      toast(
        data?.preservedHistory
          ? {
              title: "Conexao removida",
              description: "O historico das conversas foi preservado.",
            }
          : { title: "Conexao removida com sucesso!" },
      );
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao remover conexão", description: error.message, variant: "destructive" });
    },
  });

  const startPrimaryCoexistenceMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/whatsapp/coexistence/primary/start", {});
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      setConnectionMethod(null);
      launchOfficialSignup(data?.connection?.id, data?.launchConfig || getConnectionLaunchConfig(data?.connection));
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao iniciar canal oficial", description: error.message, variant: "destructive" });
    },
  });

  const startConnectionCoexistenceMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await apiRequest("POST", `/api/whatsapp/connections/${connectionId}/coexistence/start`, {});
      const data = await response.json();
      return { connectionId, ...data };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      if (newConnId && data.connectionId === newConnId) {
        closeNewConnFlow();
      }
      launchOfficialSignup(data?.connection?.id || data?.connectionId, data?.launchConfig || getConnectionLaunchConfig(data?.connection));
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao iniciar canal oficial", description: error.message, variant: "destructive" });
    },
  });

  // Per-connection mutations
  const [connectingConnectionId, setConnectingConnectionId] = useState<string | null>(null);
  const [connectionQrCodes, setConnectionQrCodes] = useState<Record<string, string>>({});
  const [connectionQrCodeGeneratedAt, setConnectionQrCodeGeneratedAt] = useState<Record<string, number>>({});

  useEffect(() => {
    const qrEntries: Record<string, { qrCode: string; generatedAt: number }> = {};

    const primaryGeneratedAt = getQrGeneratedAtFromConnection(connection);
    if (connection?.id && connection.qrCode && !connection.isConnected && isFreshQrCode(connection.qrCode, primaryGeneratedAt)) {
      qrEntries[connection.id] = { qrCode: connection.qrCode, generatedAt: primaryGeneratedAt! };
    }

    for (const conn of allConnections) {
      const generatedAt = getQrGeneratedAtFromConnection(conn);
      if (conn?.id && conn.qrCode && !conn.isConnected && isFreshQrCode(conn.qrCode, generatedAt)) {
        qrEntries[conn.id] = { qrCode: conn.qrCode, generatedAt: generatedAt! };
      }
    }

    const entryIds = Object.keys(qrEntries);
    if (entryIds.length === 0) {
      return;
    }

    setConnectionQrCodes((current) => {
      let changed = false;
      const next = { ...current };

      for (const connectionId of entryIds) {
        const qr = qrEntries[connectionId]?.qrCode;
        if (!qr) {
          continue;
        }
        if (next[connectionId] !== qr) {
          next[connectionId] = qr;
          changed = true;
        }
      }

      return changed ? next : current;
    });

    setConnectionQrCodeGeneratedAt((current) => {
      let changed = false;
      const next = { ...current };

      for (const connectionId of entryIds) {
        const generatedAt = qrEntries[connectionId]?.generatedAt;
        if (generatedAt && next[connectionId] !== generatedAt) {
          next[connectionId] = generatedAt;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [allConnections, connection?.id, connection?.isConnected, connection?.qrCode]);

  // Helper to close the new connection flow
  const closeNewConnFlow = useCallback(() => {
    setShowNewConnForm(false);
    setNewConnStep("creating");
    setNewConnId(null);
    setNewConnPhoneNumber("");
    setNewConnPairingCode(null);
  }, []);

  const startNewConnectionFlow = useCallback(() => {
    if (createConnectionMutation.isPending) return;
    setShowNewConnForm(true);
    setNewConnStep("creating");
    setNewConnId(null);
    setNewConnPhoneNumber("");
    setNewConnPairingCode(null);
    createConnectionMutation.mutate({
      connectionType: "secondary",
    });
  }, [createConnectionMutation]);

  useEffect(() => {
    if (
      autoStartedEmptyConnectionFlowRef.current ||
      isLoading ||
      connectionsLoading ||
      showNewConnForm ||
      createConnectionMutation.isPending ||
      allConnections.length > 0 ||
      visibleConnections.length > 0
    ) {
      return;
    }

    autoStartedEmptyConnectionFlowRef.current = true;
    startNewConnectionFlow();
  }, [
    allConnections.length,
    connectionsLoading,
    createConnectionMutation.isPending,
    isLoading,
    showNewConnForm,
    startNewConnectionFlow,
    visibleConnections.length,
  ]);

  const copyApiValue = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copiado.` });
    } catch (error) {
      toast({
        title: `Erro ao copiar ${label.toLowerCase()}`,
        description: error instanceof Error ? error.message : "Falha ao acessar a área de transferência.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const connectConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      setConnectingConnectionId(connectionId);
      const response = await apiRequest("POST", `/api/whatsapp/connections/${connectionId}/connect`);
      return response.json();
    },
    onSuccess: (data: any, connectionId) => {
      const returnedQrCode = data?.qrCode || data?.connection?.qrCode || null;
      const returnedQrGeneratedAt =
        parseQrGeneratedAt(data?.qrCodeGeneratedAt) ??
        getQrGeneratedAtFromConnection(data?.connection) ??
        Date.now();
      if (returnedQrCode && isFreshQrCode(returnedQrCode, returnedQrGeneratedAt)) {
        setConnectionQrCodes(prev => ({ ...prev, [connectionId]: returnedQrCode }));
        setConnectionQrCodeGeneratedAt(prev => ({ ...prev, [connectionId]: returnedQrGeneratedAt }));
        setConnectingConnectionId(null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      // If this is the new connection flow, move to QR waiting
      if (newConnId && connectionId === newConnId) {
        setNewConnStep(returnedQrCode && isFreshQrCode(returnedQrCode, returnedQrGeneratedAt) ? "qr-display" : "qr-waiting");
      }
      toast({
        title: "Tentando reconectar",
        description: "Se a sessão ainda for válida, a conexão volta sem QR. Se precisar, o QR aparece aqui.",
      });
    },
    onError: (error: Error) => {
      setConnectingConnectionId(null);
      toast({ title: "Erro ao conectar", description: error.message, variant: "destructive" });
    },
  });

  const disconnectConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      return await apiRequest("POST", `/api/whatsapp/connections/${connectionId}/disconnect`);
    },
    onSuccess: (_data, connectionId) => {
      lastOperationalConnectionsRef.current.delete(connectionId);
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      toast({ title: "Desconectado com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao desconectar", description: error.message, variant: "destructive" });
    },
  });

  const resetConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      setConnectingConnectionId(connectionId);
      const response = await apiRequest("POST", `/api/whatsapp/connections/${connectionId}/reset`);
      return response.json();
    },
    onSuccess: (data: any, connectionId) => {
      lastOperationalConnectionsRef.current.delete(connectionId);
      const qr = data?.connection?.qrCode || data?.qrCode;
      const generatedAt =
        getQrGeneratedAtFromConnection(data?.connection) ??
        parseQrGeneratedAt(data?.qrCodeGeneratedAt) ??
        Date.now();
      if (qr && isFreshQrCode(qr, generatedAt)) {
        setConnectionQrCodes(prev => ({ ...prev, [connectionId]: qr }));
        setConnectionQrCodeGeneratedAt(prev => ({ ...prev, [connectionId]: generatedAt }));
        setConnectingConnectionId(null);
        if (newConnId === connectionId) {
          setNewConnStep("qr-display");
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      toast({ title: "Conexão resetada. Escaneie o novo QR Code." });
    },
    onError: (error: Error) => {
      setConnectingConnectionId(null);
      toast({ title: "Erro ao resetar", description: error.message, variant: "destructive" });
    },
  });

  const apiAccessMutation = useMutation({
    mutationFn: async (connectionId: string): Promise<ConnectionApiAccessDetails> => {
      const response = await apiRequest("POST", `/api/whatsapp/connections/${connectionId}/api-access`);
      return response.json();
    },
    onSuccess: (data, connectionId) => {
      setApiDetailsByConnection((current) => ({ ...current, [connectionId]: data }));
      setExpandedApiConnectionId(connectionId);
      setLoadingApiConnectionId(null);
      toast({
        title: data.tokenValue ? "Token da instância gerado" : "API da instância pronta",
        description: data.tokenValue
          ? "Copie o token agora. Depois disso o sistema mostra apenas o preview."
          : "Os dados da API externa desta conexão foram carregados.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
    },
    onError: (error: Error) => {
      setLoadingApiConnectionId(null);
      toast({ title: "Erro ao carregar API da instância", description: error.message, variant: "destructive" });
    },
  });

  const rotateApiTokenMutation = useMutation({
    mutationFn: async (connectionId: string): Promise<ConnectionApiAccessDetails> => {
      const response = await apiRequest("POST", `/api/whatsapp/connections/${connectionId}/api-access/rotate`);
      return response.json();
    },
    onSuccess: (data, connectionId) => {
      setApiDetailsByConnection((current) => ({ ...current, [connectionId]: data }));
      setExpandedApiConnectionId(connectionId);
      setLoadingApiConnectionId(null);
      toast({
        title: "Token rotacionado",
        description: "Copie o novo token agora. Depois disso o sistema volta a mostrar apenas o preview.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
    },
    onError: (error: Error) => {
      setLoadingApiConnectionId(null);
      toast({ title: "Erro ao rotacionar token", description: error.message, variant: "destructive" });
    },
  });

  const openApiDetails = useCallback((connectionId: string) => {
    if (expandedApiConnectionId === connectionId) {
      setExpandedApiConnectionId(null);
      return;
    }

    const cached = apiDetailsByConnection[connectionId];
    setExpandedApiConnectionId(connectionId);
    if (cached) {
      return;
    }

    setLoadingApiConnectionId(connectionId);
    apiAccessMutation.mutate(connectionId);
  }, [apiAccessMutation, apiDetailsByConnection, expandedApiConnectionId]);

  const toggleAiMutation = useMutation({
    mutationFn: async ({ connectionId, aiEnabled }: { connectionId: string; aiEnabled: boolean }) => {
      return await apiRequest("PATCH", `/api/whatsapp/connections/${connectionId}/ai-toggle`, { aiEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      toast({ title: "Configuração de IA atualizada!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar IA", description: error.message, variant: "destructive" });
    },
  });

  // Função para verificar status da conexão durante polling
  // Also loads QR code from database as fallback when WebSocket broadcast fails
  const fetchQrCodeFromDb = useCallback(async () => {
    try {
      const response = await apiRequest("GET", "/api/whatsapp/connection");
      const data = await response.json();
      // Se conectou, parar polling e limpar estados
      if (isAppVisibleOperationalConnection(data)) {
        setIsWaitingQrCode(false);
        isWaitingQrCodeRef.current = false;
        setQrCode(null);
        qrCodeRef.current = null;
        setIsConnecting(false);
        setConnectionMethod(null);
        if (qrCodePollingRef.current) {
          clearInterval(qrCodePollingRef.current);
          qrCodePollingRef.current = null;
        }
        if (waitingTimeoutRef.current) {
          clearTimeout(waitingTimeoutRef.current);
          waitingTimeoutRef.current = null;
        }
        queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
        queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      } else if (data && data.qrCode && !qrCodeRef.current && isWaitingQrCodeRef.current) {
        // Fallback: load QR code from database if we don't have one yet via WebSocket
        const generatedAt = getQrGeneratedAtFromConnection(data);
        if (isFreshQrCode(data.qrCode, generatedAt)) {
          console.log("[QR POLLING] QR Code loaded from database (fallback)");
          setQrCode(data.qrCode);
          qrCodeRef.current = data.qrCode;
          setQrCodeGeneratedAt(generatedAt);
          qrCodeGeneratedAtRef.current = generatedAt;
          setIsConnecting(false);
          setIsWaitingQrCode(false);
          isWaitingQrCodeRef.current = false;
        } else {
          console.log("[QR POLLING] Ignoring stale QR Code from database");
        }
      }
    } catch (error) {
      console.error("[QR POLLING] Erro ao verificar conexão:", error);
    }
  }, [queryClient]);

  // Iniciar polling de QR Code quando estiver aguardando
  const startQrCodePolling = useCallback(() => {
    // Limpar polling anterior se existir
    if (qrCodePollingRef.current) {
      clearInterval(qrCodePollingRef.current);
    }
    // Polling a cada 2 segundos
    qrCodePollingRef.current = setInterval(() => {
      fetchQrCodeFromDb();
    }, 2000);
    console.log("[QR POLLING] Iniciado polling de QR Code");
  }, [fetchQrCodeFromDb]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/whatsapp/connect", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      setIsWaitingQrCode(true);
      isWaitingQrCodeRef.current = true;
      // Iniciar polling imediatamente
      startQrCodePolling();
      // Definir timeout de 60 segundos para parar de aguardar
      if (waitingTimeoutRef.current) {
        clearTimeout(waitingTimeoutRef.current);
      }
      waitingTimeoutRef.current = setTimeout(() => {
        if (isWaitingQrCodeRef.current && !qrCodeRef.current) {
          setIsWaitingQrCode(false);
          isWaitingQrCodeRef.current = false;
          toast({
            title: "Tempo esgotado",
            description: "Não foi possível gerar o QR Code. Tente novamente.",
            variant: "destructive",
          });
          // Parar polling
          if (qrCodePollingRef.current) {
            clearInterval(qrCodePollingRef.current);
            qrCodePollingRef.current = null;
          }
        }
      }, 60000);
      toast({
        title: "Conectando",
        description: "Aguarde o QR Code aparecer...",
      });
    },
    onError: (error: Error) => {
      setIsWaitingQrCode(false);
      isWaitingQrCodeRef.current = false;
      setIsConnecting(false);
      setConnectionMethod(null);
      // Stop polling started in onClick
      if (qrCodePollingRef.current) {
        clearInterval(qrCodePollingRef.current);
        qrCodePollingRef.current = null;
      }
      toast({
        title: "Erro ao conectar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/whatsapp/disconnect", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      setQrCode(null);
      qrCodeRef.current = null;
      setIsWaitingQrCode(false);
      isWaitingQrCodeRef.current = false;
      setIsConnecting(false);
      // Parar polling
      if (qrCodePollingRef.current) {
        clearInterval(qrCodePollingRef.current);
        qrCodePollingRef.current = null;
      }
      toast({
        title: "Desconectado",
        description: "WhatsApp desconectado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao desconectar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para resetar conexão (self-service)
  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/whatsapp/reset", {});
      return response.json();
    },
    onSuccess: (data: any) => {
      const returnedQrCode = data?.connection?.qrCode || data?.qrCode || null;
      const returnedConnection = data?.connection || null;
      const returnedQrGeneratedAt =
        getQrGeneratedAtFromConnection(returnedConnection) ??
        parseQrGeneratedAt(data?.qrCodeGeneratedAt) ??
        Date.now();
      if (returnedQrCode && isFreshQrCode(returnedQrCode, returnedQrGeneratedAt)) {
        setQrCode(returnedQrCode);
        qrCodeRef.current = returnedQrCode;
        setQrCodeGeneratedAt(returnedQrGeneratedAt);
        qrCodeGeneratedAtRef.current = returnedQrGeneratedAt;
        setIsConnecting(false);
        setIsWaitingQrCode(false);
        isWaitingQrCodeRef.current = false;
      }
      if (isAppVisibleOperationalConnection(returnedConnection)) {
        setQrCode(null);
        qrCodeRef.current = null;
        setQrCodeGeneratedAt(null);
        qrCodeGeneratedAtRef.current = null;
        setIsConnecting(false);
        setIsWaitingQrCode(false);
        isWaitingQrCodeRef.current = false;
        setConnectionMethod(null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      toast({
        title: "Conexão resetada",
        description: "Escaneie o QR Code novamente para conectar",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao resetar",
        description: error.message || "Tente novamente em alguns segundos",
        variant: "destructive",
      });
    },
  });

  // Mutation para solicitar Pairing Code (código de 8 caracteres)
  const requestFreshPrimaryQr = useCallback(() => {
    setConnectionMethod("qr");
    setPairingCode(null);
    setIsRequestingPairingCode(false);
    setQrCode(null);
    qrCodeRef.current = null;
    setQrCodeGeneratedAt(null);
    qrCodeGeneratedAtRef.current = null;
    setIsWaitingQrCode(true);
    isWaitingQrCodeRef.current = true;
    startQrCodePolling();

    resetMutation.mutate();
  }, [resetMutation, startQrCodePolling]);

  useEffect(() => {
    const hasPrimaryQr = Boolean(qrCode && !connection?.isConnected);
    const hasConnectionQr = Object.keys(connectionQrCodes).length > 0;
    if (!hasPrimaryQr && !hasConnectionQr) {
      return;
    }

    const refreshExpiredQrCodes = () => {
      const now = Date.now();

      if (
        qrCode &&
        connection?.id &&
        !connection.isConnected &&
        qrCodeGeneratedAt &&
        now - qrCodeGeneratedAt >= WHATSAPP_QR_REFRESH_MS &&
        !connectMutation.isPending &&
        !resetMutation.isPending
      ) {
        console.log("[QR AUTO-REFRESH] Primary QR expired, generating a fresh one");
        setQrCode(null);
        qrCodeRef.current = null;
        setQrCodeGeneratedAt(null);
        qrCodeGeneratedAtRef.current = null;
        setIsWaitingQrCode(true);
        isWaitingQrCodeRef.current = true;
        resetMutation.mutate();
        return;
      }

      if (connectConnectionMutation.isPending || resetConnectionMutation.isPending) {
        return;
      }

      for (const [connectionId, qr] of Object.entries(connectionQrCodes)) {
        const generatedAt = connectionQrCodeGeneratedAt[connectionId];
        const visibleConnection = visibleConnections.find((item) => item.id === connectionId);
        if (!qr || visibleConnection?.isConnected || !generatedAt || now - generatedAt < WHATSAPP_QR_REFRESH_MS) {
          continue;
        }
        if (getServerProvidedQrCode(visibleConnection)) {
          continue;
        }

        console.log("[QR AUTO-REFRESH] Connection QR expired, generating a fresh one", connectionId);
        setConnectionQrCodes((current) => {
          const next = { ...current };
          delete next[connectionId];
          return next;
        });
        setConnectionQrCodeGeneratedAt((current) => {
          const next = { ...current };
          delete next[connectionId];
          return next;
        });
        setConnectingConnectionId(connectionId);
        if (newConnId === connectionId) {
          setNewConnStep("qr-waiting");
        }
        resetConnectionMutation.mutate(connectionId);
        break;
      }
    };

    refreshExpiredQrCodes();
    const interval = setInterval(refreshExpiredQrCodes, WHATSAPP_QR_AUTO_REFRESH_CHECK_MS);
    return () => clearInterval(interval);
  }, [
    connection?.id,
    connection?.isConnected,
    connectionQrCodeGeneratedAt,
    connectionQrCodes,
    newConnId,
    qrCode,
    qrCodeGeneratedAt,
    connectConnectionMutation,
    resetConnectionMutation,
    resetMutation,
    visibleConnections,
  ]);

  const pairingCodeMutation = useMutation({
    mutationFn: async (phone: string) => {
      const response = await apiRequest("POST", "/api/whatsapp/pairing-code", { phoneNumber: phone });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.code) {
        setPairingCode(data.code);
        setIsRequestingPairingCode(false);
        toast({
          title: "Código gerado!",
          description: `Use o código ${data.code} no seu WhatsApp`,
        });
        // Iniciar polling para verificar conexão
        startQrCodePolling();
      } else {
        throw new Error("Código não retornado pelo servidor");
      }
    },
    onError: (error: Error) => {
      setIsRequestingPairingCode(false);
      setPairingCode(null);
      toast({
        title: "Erro ao gerar código",
        description: error.message || "Tente novamente em alguns segundos",
        variant: "destructive",
      });
    },
  });

  // Função para solicitar pairing code
  const handleRequestPairingCode = () => {
    const cleanPhone = phoneNumber.replace(/\D/g, "");

    // Validação básica de comprimento
    if (cleanPhone.length < 10) {
      toast({
        title: "Número muito curto",
        description: "Digite um número válido com DDI (código do país), DDD e número. Exemplo: 5511999999999",
        variant: "destructive",
      });
      return;
    }

    // Validação para Brasil (começa com 55)
    if (cleanPhone.startsWith("55") && cleanPhone.length < 12) {
      toast({
        title: "Número brasileiro incompleto",
        description: "Para o Brasil, use: 55 + DDD + número. Exemplo: 55 (código país) + 11 (DDD) + 999999999",
        variant: "destructive",
      });
      return;
    }

    // Validação de comprimento máximo
    if (cleanPhone.length > 15) {
      toast({
        title: "Número muito longo",
        description: "O número parece estar incorreto. Verifique e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    setIsRequestingPairingCode(true);
    setPairingCode(null);
    pairingCodeMutation.mutate(cleanPhone);
  };

  // Função para resetar e voltar à seleção de método
  const handleBackToMethodSelection = () => {
    setConnectionMethod(null);
    setQrCode(null);
    qrCodeRef.current = null;
    setPairingCode(null);
    setPhoneNumber("");
    setIsWaitingQrCode(false);
    isWaitingQrCodeRef.current = false;
    setIsConnecting(false);
    if (qrCodePollingRef.current) {
      clearInterval(qrCodePollingRef.current);
      qrCodePollingRef.current = null;
    }
  };

  // NÃO carregamos o QR code do banco de dados porque pode ser um QR code antigo/expirado
  // O QR code deve vir apenas via WebSocket quando é gerado em tempo real
  // ou via polling quando o usuário clica em "Conectar"
  // Quando o connection é atualizado, verificamos se está conectado para limpar estados
  useEffect(() => {
    if (connection?.isConnected) {
      // Se já está conectado, limpa qualquer QR code ou estado de espera
      setQrCode(null);
      qrCodeRef.current = null;
      setIsWaitingQrCode(false);
      isWaitingQrCodeRef.current = false;
      setIsConnecting(false);
      // Limpar estados de pairing code
      setPairingCode(null);
      setPhoneNumber("");
      setConnectionMethod(null);
      setIsRequestingPairingCode(false);
      if (qrCodePollingRef.current) {
        clearInterval(qrCodePollingRef.current);
        qrCodePollingRef.current = null;
      }
    }
  }, [connection?.isConnected]);

  // Per-connection QR polling fallback for "Nova Conexão" flow
  // If WebSocket misses the QR event, this polls the connections endpoint
  useEffect(() => {
    if (newConnStep !== "qr-waiting" || !newConnId) return;

    let pollInterval: NodeJS.Timeout | null = null;
    let pollTimeout: NodeJS.Timeout | null = null;

    const pollNewConnQr = async () => {
      try {
        const response = await apiRequest("GET", "/api/whatsapp/connections");
        const connections = await response.json();
        const target = connections.find((c: any) => c.id === newConnId);
        const generatedAt = getQrGeneratedAtFromConnection(target);
        if (target?.qrCode && isFreshQrCode(target.qrCode, generatedAt) && !connectionQrCodes[newConnId]) {
          console.log("[NEW CONN QR POLL] QR Code loaded from DB fallback for", newConnId);
          setConnectionQrCodes(prev => ({ ...prev, [newConnId!]: target.qrCode }));
          setConnectionQrCodeGeneratedAt(prev => ({ ...prev, [newConnId!]: generatedAt! }));
          setNewConnStep("qr-display");
          if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        } else if (target?.isConnected) {
          // Already connected, close flow
          closeNewConnFlow();
          queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
          queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
          if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        }
      } catch (err) {
        console.error("[NEW CONN QR POLL] Error:", err);
      }
    };

    // Poll every 3 seconds
    pollInterval = setInterval(pollNewConnQr, 3000);
    // Stop after 90 seconds
    pollTimeout = setTimeout(() => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    }, 90000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, [newConnStep, newConnId, connectionQrCodes, closeNewConnFlow, queryClient]);

  // Poll for QR code when connecting an EXISTING connection card (not "Nova Conexão")
  // This mirrors the "Nova Conexão" polling but for the existing card "Conectar" flow
  useEffect(() => {
    // Only activate when we're connecting an existing card AND don't have a QR yet
    if (!connectingConnectionId || connectionQrCodes[connectingConnectionId]) return;
    // Don't activate if this is part of the "Nova Conexão" flow (handled by the effect above)
    if (newConnId && connectingConnectionId === newConnId) return;

    let pollInterval: NodeJS.Timeout | null = null;
    let pollTimeout: NodeJS.Timeout | null = null;

    const pollExistingConnQr = async () => {
      try {
        const response = await apiRequest("GET", "/api/whatsapp/connections");
        const connections = await response.json();
        const target = connections.find((c: any) => c.id === connectingConnectionId);
        const generatedAt = getQrGeneratedAtFromConnection(target);
        if (target?.qrCode && isFreshQrCode(target.qrCode, generatedAt) && !connectionQrCodes[connectingConnectionId]) {
          console.log("[EXISTING CONN QR POLL] QR Code loaded from DB fallback for", connectingConnectionId);
          setConnectionQrCodes(prev => ({ ...prev, [connectingConnectionId!]: target.qrCode }));
          setConnectionQrCodeGeneratedAt(prev => ({ ...prev, [connectingConnectionId!]: generatedAt! }));
          if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        } else if (target?.isConnected) {
          // Already connected, stop polling
          console.log("[EXISTING CONN QR POLL] Connection already connected:", connectingConnectionId);
          setConnectingConnectionId(null);
          setConnectionQrCodes(prev => {
            const next = { ...prev };
            delete next[connectingConnectionId];
            return next;
          });
          queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
          queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
          if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        }
      } catch (err) {
        console.error("[EXISTING CONN QR POLL] Error:", err);
      }
    };

    // Poll every 3 seconds
    pollInterval = setInterval(pollExistingConnQr, 3000);
    // Also do an immediate check
    pollExistingConnQr();
    // Stop after 90 seconds
    pollTimeout = setTimeout(() => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      setConnectingConnectionId(null);
    }, 90000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, [connectingConnectionId, connectionQrCodes, newConnId, queryClient]);

  useEffect(() => {
    let realtimeConnection: AppRealtimeConnection | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let isMounted = true;
    let authRetryCount = 0;
    const MAX_AUTH_RETRIES = 15; // Retry up to 15 times (~30s total)

    const connectWebSocket = async () => {
      if (!isMounted) return;
      try {
        let token = await getAuthToken();

        // Retry mechanism for when Supabase session hasn't hydrated from localStorage yet
        if (!token && authRetryCount < MAX_AUTH_RETRIES) {
          authRetryCount++;
          const delay = Math.min(1000 + authRetryCount * 500, 3000); // 1.5s, 2s, 2.5s, 3s...
          console.log(`[WS] Auth token not available yet, retry ${authRetryCount}/${MAX_AUTH_RETRIES} in ${delay}ms...`);
          reconnectTimer = setTimeout(() => {
            if (isMounted) connectWebSocket();
          }, delay);
          return;
        }

        if (!token) {
          console.error("No auth token available for WebSocket connection after all retries");
          return;
        }

        // Reset auth retry count on successful token acquisition
        authRetryCount = 0;

        console.log("[WS] Conectando ao realtime do app");
        realtimeConnection = await openAppRealtimeConnection({
          scope: "user",
          getToken: async () => getAuthToken(),
          onOpen: () => {
            console.log("[WS] Realtime conectado com sucesso!");
            setWsConnected(true);
          },
          onEvent: (data) => {
            console.log("[WS] Mensagem recebida:", data.type);

            if (data.type === "qr") {
              console.log("[WS] QR Code recebido via WebSocket!", data.connectionId ? `connectionId: ${data.connectionId}` : "");
              const wsQrGeneratedAt = parseQrGeneratedAt(data.qrCodeGeneratedAt) ?? Date.now();
              // Track per-connection QR codes
              if (data.connectionId) {
                setConnectionQrCodes(prev => ({ ...prev, [data.connectionId]: data.qr }));
                setConnectionQrCodeGeneratedAt(prev => ({ ...prev, [data.connectionId]: wsQrGeneratedAt }));
                // If this QR is for the new connection being created, update flow state
                setNewConnId(prevId => {
                  if (prevId && data.connectionId === prevId) {
                    setNewConnStep("qr-display");
                  }
                  return prevId;
                });
              }
              // Only update global (primary card) QR state for primary connection or legacy events
              // 🆕 Se connection é null (conta nova), tratar QUALQUER QR como primário
              const isPrimaryQr = !data.connectionId || data.connectionId === connection?.id || !connection;
              if (isPrimaryQr) {
                setQrCode(data.qr);
                qrCodeRef.current = data.qr;
                setQrCodeGeneratedAt(wsQrGeneratedAt);
                qrCodeGeneratedAtRef.current = wsQrGeneratedAt;
                setIsConnecting(false);
                setIsWaitingQrCode(false);
                isWaitingQrCodeRef.current = false;
                // Parar polling quando receber QR code via WebSocket
                if (qrCodePollingRef.current) {
                  clearInterval(qrCodePollingRef.current);
                  qrCodePollingRef.current = null;
                }
              }
            } else if (data.type === "pairing_restarting") {
              // Backend está reconectando após 515 restartRequired
              console.log("[WS] Pairing restart:", data.retryCount, "/", data.maxRetries);
              // Não limpar o código - manter na tela
              // Mostrar indicador de reconexão se quiser (opcional)
            } else if (data.type === "connecting") {
              // Only update global state for primary connection or legacy events (no connectionId)
              const isPrimaryConnecting = !data.connectionId || data.connectionId === connection?.id;
              if (isPrimaryConnecting && !qrCodeRef.current) {
                setQrCode(null);
                setIsConnecting(true);
                setIsWaitingQrCode(false);
                isWaitingQrCodeRef.current = false;
              }
            } else if (data.type === "connected") {
              console.log("[WS] WhatsApp conectado!", data.connectionId || "");
              // Clear per-connection QR
              if (data.connectionId) {
                setConnectionQrCodes(prev => {
                  const next = { ...prev };
                  delete next[data.connectionId];
                  return next;
                });
                setConnectingConnectionId(null);
                // If this is the new connection flow, close it and show success
                setNewConnId(prevId => {
                  if (prevId && data.connectionId === prevId) {
                    setShowNewConnForm(false);
                    setNewConnStep("creating");
                    setNewConnId(null);
                    setNewConnPhoneNumber("");
                    setNewConnPairingCode(null);
                  }
                  return prevId && data.connectionId === prevId ? null : prevId;
                });
              }
              // Only update global (primary card) state for primary connection or legacy events
              const isPrimaryConnected = !data.connectionId || data.connectionId === connection?.id;
              if (isPrimaryConnected) {
                setQrCode(null);
                qrCodeRef.current = null;
                setIsConnecting(false);
                setIsWaitingQrCode(false);
                isWaitingQrCodeRef.current = false;
                // Parar polling
                if (qrCodePollingRef.current) {
                  clearInterval(qrCodePollingRef.current);
                  qrCodePollingRef.current = null;
                }
              }
              queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
              queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
              toast({
                title: "Conectado!",
                description: data.connectionId && data.connectionId !== connection?.id
                  ? "Nova conexão WhatsApp conectada com sucesso"
                  : "WhatsApp conectado com sucesso",
              });
            } else if (data.type === "disconnected") {
              console.log("[WS] WhatsApp desconectado!", data.connectionId || "", data.reason || "");
              // Clear per-connection QR
              if (data.connectionId) {
                lastOperationalConnectionsRef.current.delete(data.connectionId);
                setConnectionQrCodes(prev => {
                  const next = { ...prev };
                  delete next[data.connectionId];
                  return next;
                });
                setConnectingConnectionId(null);
              }
              
              // Only update global (primary card) state for primary connection or legacy events
              const isPrimaryDisconnected = !data.connectionId || data.connectionId === connection?.id;
              if (isPrimaryDisconnected) {
                // Only reset connection method if user has an explicit reason (not stale events)
                if (data.reason) {
                  setConnectionMethod(null);
                  setPairingCode(null);
                  setPhoneNumber("");
                  setIsRequestingPairingCode(false);
                }
                
                setQrCode(null);
                qrCodeRef.current = null;
                setIsConnecting(false);
                setIsWaitingQrCode(false);
                isWaitingQrCodeRef.current = false;
                // Parar polling
                if (qrCodePollingRef.current) {
                  clearInterval(qrCodePollingRef.current);
                  qrCodePollingRef.current = null;
                }
                // Parar timeout
                if (waitingTimeoutRef.current) {
                  clearTimeout(waitingTimeoutRef.current);
                  waitingTimeoutRef.current = null;
                }
              }
              queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
              queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
              
              // Mostrar mensagem apropriada baseada no motivo
              if (data.reason === "max_attempts") {
                toast({
                  title: "Conexão falhou",
                  description: "Não foi possível conectar após várias tentativas. Clique em Conectar para tentar novamente.",
                  variant: "destructive",
                });
              } else if (data.reason === "pairing_failed") {
                toast({
                  title: "Não foi possível conectar ao dispositivo",
                  description: "O pareamento falhou. Verifique o número e tente novamente, ou use QR Code.",
                  variant: "destructive",
                });
              } else if (data.reason === "pairing_rate_limited") {
                toast({
                  title: "WhatsApp limitou as tentativas",
                  description: "O WhatsApp bloqueou temporariamente as tentativas de conexão. Aguarde 20-40 minutos e tente novamente. Use QR Code para conectar agora.",
                  variant: "destructive",
                });
              } else if (data.reason === "pairing_expired") {
                toast({
                  title: "Código expirado",
                  description: "O tempo para digitar o código acabou. Gere um novo código e tente novamente.",
                  variant: "destructive",
                });
              } else if (data.reason === "logout") {
                toast({
                  title: "WhatsApp desconectado",
                  description: "Você foi desconectado do WhatsApp. Tente reconectar a sessão salva ou gere um novo QR Code.",
                });
              }
            }
          },
          onError: (error) => {
            const message = error instanceof Error ? error.message : String(error || "");
            if (message.includes("TIMED_OUT")) {
              console.warn("[WS] Realtime timeout; polling/reconnect will continue:", error);
            } else {
              console.error("[WS] Realtime error:", error);
            }
            setWsConnected(false);
          },
          onClose: () => {
            console.log("[WS] Realtime connection closed");
            setWsConnected(false);
            if (isMounted) {
              reconnectTimer = setTimeout(() => {
                console.log("[WS] Auto-reconnecting realtime...");
                void connectWebSocket();
              }, 3000);
            }
          },
        });
      } catch (error) {
        console.error("Error connecting to WebSocket:", error);
        setWsConnected(false);
      }
    };

    void connectWebSocket();

    return () => {
      isMounted = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (realtimeConnection) {
        void realtimeConnection.close();
      }
      // Limpar polling e timeout ao desmontar
      if (qrCodePollingRef.current) {
        clearInterval(qrCodePollingRef.current);
        qrCodePollingRef.current = null;
      }
      if (waitingTimeoutRef.current) {
        clearTimeout(waitingTimeoutRef.current);
        waitingTimeoutRef.current = null;
      }
    };
  }, [toast, connection?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-2xl mx-auto p-4 md:p-8 space-y-6 md:space-y-8 pb-24 md:pb-8">
        {!hasConnectionsInList && (
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold">Conecte seu WhatsApp</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Escolha um método e conecte em menos de 2 minutos para começar a atender.
          </p>
        </div>
        )}

        {/* Card principal de status - só mostra quando já tem conexão */}
        {!hasConnectionsInList && connection && (
        <Card className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Status da Conexão</h3>
                <p className="text-sm text-muted-foreground">
                  {connection?.phoneNumber || "Nenhum número conectado"}
                </p>
              </div>
            </div>
            <Badge
              variant={primaryStatusMeta.tone === "connected" ? "default" : "secondary"}
              className={`gap-1 ${
                primaryStatusMeta.tone === "connected"
                  ? "bg-emerald-600"
                  : primaryStatusMeta.tone === "recovering"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : ""
              }`}
              data-testid="badge-connection-status"
            >
              {primaryStatusMeta.tone === "connected" ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  {primaryStatusMeta.label}
                </>
              ) : primaryStatusMeta.tone === "recovering" ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {primaryStatusMeta.label}
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3" />
                  {primaryStatusMeta.label}
                </>
              )}
            </Badge>
          </div>

          {/* Seleção de método de conexão - NOVA VERSÃO MINIMALISTA COM CTA FORTE */}
          {primaryIsRecovering && !connectionMethod && !qrCode && !isWaitingQrCode && !isConnecting && !pairingCode && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Reconectando automaticamente
              </div>
              <p className="mt-2 text-amber-800">
                Esta conexão ainda tem sessão salva. Enquanto ela tenta voltar sozinha, o painel não finge que já está conectado.
              </p>
            </div>
          )}

          {!primaryIsOperational && !primaryIsRecovering && !primaryIsOfficial && !connectionMethod && !qrCode && !isWaitingQrCode && !isConnecting && !pairingCode && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
               {/* Header Instruction */}
               <div className="text-center space-y-2 mb-2">
                  <h3 className="text-lg font-medium text-foreground">Como você prefere conectar?</h3>
                  <p className="text-sm text-muted-foreground mx-auto max-w-sm">
                    Escolha a opção mais fácil para você abaixo.
                  </p>
               </div>

               <div className={`grid gap-4 ${coexistenceEnabled ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                  {/* QR Code Option */}
                  <button
                    onClick={() => {
                        void requestFreshPrimaryQr();
                    }}
                    disabled={connectMutation.isPending || resetMutation.isPending}
                    className="group relative flex flex-col items-center p-6 gap-4 rounded-xl border-2 border-muted bg-card hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-all duration-300 shadow-sm hover:shadow-md text-center cursor-pointer"
                    data-testid="button-connect-qr"
                  >
                    <div className="absolute top-3 right-3">
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 font-normal text-[10px] uppercase tracking-wider">
                            Recomendado
                        </Badge>
                    </div>
                    <div className="h-16 w-16 rounded-full bg-emerald-100/50 dark:bg-emerald-900/30 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                        <QrCode className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="space-y-1">
                        <h4 className="font-semibold text-lg group-hover:text-emerald-700 dark:group-hover:text-emerald-400">Escanear QR Code</h4>
                        <p className="text-xs text-muted-foreground max-w-[140px] mx-auto">
                            Abra a câmera do WhatsApp e aponte para a tela.
                        </p>
                    </div>
                    <div className="mt-2 w-full py-2 bg-muted/50 rounded-lg text-xs font-medium text-foreground group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        Escolher QR Code
                    </div>
                  </button>

                  {/* Pairing Code Option */}
                  <button
                    onClick={() => setConnectionMethod("pairing")}
                    className="group relative flex flex-col items-center p-6 gap-4 rounded-xl border-2 border-muted bg-card hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all duration-300 shadow-sm hover:shadow-md text-center cursor-pointer"
                    data-testid="button-connect-pairing"
                  >
                     <div className="h-16 w-16 rounded-full bg-blue-100/50 dark:bg-blue-900/30 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                        <Hash className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="space-y-1">
                        <h4 className="font-semibold text-lg group-hover:text-blue-700 dark:group-hover:text-blue-400">Código de 8 Dígitos</h4>
                        <p className="text-xs text-muted-foreground max-w-[140px] mx-auto">
                            Digite seu número e receba um código no celular.
                        </p>
                    </div>
                     <div className="mt-2 w-full py-2 bg-muted/50 rounded-lg text-xs font-medium text-foreground group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        Escolher Código
                    </div>
                  </button>

                  {coexistenceEnabled && (
                    <button
                      onClick={() => startPrimaryCoexistenceMutation.mutate()}
                      disabled={
                        startPrimaryCoexistenceMutation.isPending ||
                        officialSdkLoading ||
                        completeOfficialSignupMutation.isPending
                      }
                      className="group relative flex flex-col items-center p-6 gap-4 rounded-xl border-2 border-muted bg-card hover:border-violet-500 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-all duration-300 shadow-sm hover:shadow-md text-center cursor-pointer"
                    >
                      <div className="absolute top-3 right-3">
                        <Badge variant="secondary" className="bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300 font-normal text-[10px] uppercase tracking-wider">
                          Beta
                        </Badge>
                      </div>
                      <div className="h-16 w-16 rounded-full bg-violet-100/50 dark:bg-violet-900/30 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                        <ShieldCheck className="h-8 w-8 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-semibold text-lg group-hover:text-violet-700 dark:group-hover:text-violet-400">Canal Oficial</h4>
                        <p className="text-xs text-muted-foreground max-w-[160px] mx-auto">
                          Usa o Embedded Signup da Meta e responde via Cloud API.
                        </p>
                      </div>
                      <div className="mt-2 w-full py-2 bg-muted/50 rounded-lg text-xs font-medium text-foreground group-hover:bg-violet-600 group-hover:text-white transition-colors">
                        Conectar com Facebook
                      </div>
                    </button>
                  )}
               </div>

                {/* Steps Footer */}
               <div className="pt-6 border-t mt-4">
                 <div className="flex justify-between text-xs text-muted-foreground px-2">
                    <span className="flex items-center gap-1.5"><div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">1</div> Escolha</span>
                    <span className="flex items-center gap-1.5"><div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">2</div> Conecte</span>
                    <span className="flex items-center gap-1.5"><div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">3</div> Atenda</span>
                 </div>
               </div>
            </div>
          )}

          {!connection?.isConnected && primaryIsOfficial && (
            <div className="space-y-4">
              <div className="p-6 bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-md space-y-4">
                <div className="text-center space-y-2">
                  <ShieldCheck className="w-10 h-10 mx-auto text-violet-600" />
                  <h4 className="font-medium text-violet-900 dark:text-violet-100">Canal Oficial Meta</h4>
                  <p className="text-sm text-violet-700 dark:text-violet-300">
                    Este número está em beta para usar o onboarding oficial da Meta, sem sessão Baileys.
                  </p>
                </div>
                <div className="rounded-lg bg-background/80 border px-4 py-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium">{getProviderStatusLabel(connection?.providerStatus)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Conta beta</span>
                    <span className="font-medium">{coexistenceBeta?.userEmail || "Beta privado"}</span>
                  </div>
                </div>
              </div>
              <Button
                onClick={() => startPrimaryCoexistenceMutation.mutate()}
                disabled={
                  startPrimaryCoexistenceMutation.isPending ||
                  officialSdkLoading ||
                  completeOfficialSignupMutation.isPending
                }
                className="w-full"
              >
                {startPrimaryCoexistenceMutation.isPending ||
                officialSdkLoading ||
                completeOfficialSignupMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {completeOfficialSignupMutation.isPending
                      ? "Finalizando canal oficial..."
                      : "Abrindo Facebook..."}
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    Continuar com Facebook
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Formulário de Pairing Code */}
          {!connection?.isConnected && connectionMethod === "pairing" && !pairingCode && !isRequestingPairingCode && (
            <div className="space-y-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToMethodSelection}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
              
              <div className="p-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md space-y-4">
                <div className="text-center space-y-2">
                  <Hash className="w-10 h-10 mx-auto text-blue-600" />
                  <h4 className="font-medium text-blue-900 dark:text-blue-100">Conectar com Código</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Digite seu número de WhatsApp para receber um código de 8 caracteres
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-blue-900 dark:text-blue-100">
                    Número do WhatsApp
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="5511999999999"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="text-center text-lg tracking-wider"
                  />
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    Digite o número com código do país (55 para Brasil) e DDD
                  </p>
                </div>
              </div>
              
              <Button
                onClick={handleRequestPairingCode}
                disabled={phoneNumber.replace(/\D/g, "").length < 10}
                className="w-full"
              >
                <Hash className="w-4 h-4 mr-2" />
                Gerar Código de Conexão
              </Button>
            </div>
          )}

          {/* Solicitando Pairing Code */}
          {!connection?.isConnected && isRequestingPairingCode && (
            <div className="space-y-4">
              <div className="p-6 bg-amber-50 border border-amber-200 rounded-md text-center space-y-4">
                <Loader2 className="w-12 h-12 mx-auto text-amber-600 animate-spin" />
                <div className="space-y-2">
                  <h4 className="font-medium text-amber-900">Gerando Código...</h4>
                  <p className="text-sm text-amber-700">
                    Aguarde enquanto geramos seu código de 8 caracteres
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleBackToMethodSelection}
                className="w-full"
              >
                Cancelar
              </Button>
            </div>
          )}

          {/* Exibindo Pairing Code gerado */}
          {!connection?.isConnected && pairingCode && (
            <div className="space-y-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToMethodSelection}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
              
              <div className="p-6 bg-primary/5 border-2 border-primary/20 rounded-md text-center space-y-4">
                <div className="space-y-2">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-primary" />
                  <h4 className="font-medium text-lg">Código Gerado!</h4>
                </div>
                
                <div className="p-4 bg-white dark:bg-gray-900 rounded-lg shadow-inner">
                  <p className="text-3xl md:text-4xl font-mono font-bold tracking-[0.3em] text-primary">
                    {pairingCode}
                  </p>
                </div>
                
                <div className="text-left space-y-3 pt-2">
                  <p className="text-sm font-medium">Como usar este código:</p>
                  <ol className="text-sm text-muted-foreground space-y-2">
                    <li className="flex gap-2">
                      <span className="font-semibold text-primary">1.</span>
                      <span>Abra o WhatsApp no seu celular</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-primary">2.</span>
                      <span>Vá em <strong>Configurações → Aparelhos conectados</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-primary">3.</span>
                      <span>Toque em <strong>Conectar um aparelho</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-primary">4.</span>
                      <span>Toque em <strong>"Conectar com número de telefone"</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-primary">5.</span>
                      <span><strong>IMPORTANTE:</strong> Quando receber a notificação "Enter code", toque nela e <strong>confirme</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-primary">6.</span>
                      <span>Digite o código <strong>{pairingCode}</strong></span>
                    </li>
                  </ol>
                </div>
                
                <div className="flex items-center justify-center gap-2 text-xs text-amber-600 pt-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Aguardando você digitar o código no WhatsApp...</span>
                </div>
              </div>
              
              <Button
                variant="outline"
                onClick={handleRequestPairingCode}
                disabled={pairingCodeMutation.isPending}
                className="w-full"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Gerar Novo Código
              </Button>
            </div>
          )}

          {/* QR Code flow - método selecionado */}
          {!connection?.isConnected && connectionMethod === "qr" && isWaitingQrCode && !qrCode && !isConnecting && (
            <div className="space-y-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToMethodSelection}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
              <div className="p-6 bg-amber-50 border border-amber-200 rounded-md text-center space-y-4">
                <Loader2 className="w-12 h-12 mx-auto text-amber-600 animate-spin" />
                <div className="space-y-2">
                  <h4 className="font-medium text-amber-900">Gerando QR Code...</h4>
                  <p className="text-sm text-amber-700">
                    Aguarde enquanto geramos o QR Code. Isso pode levar alguns segundos.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-amber-600">
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                  <span>Conectando ao WhatsApp...</span>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleBackToMethodSelection}
                className="w-full"
              >
                Cancelar
              </Button>
            </div>
          )}

          {isConnecting && (
            <div className="space-y-4">
              <div className="p-6 bg-blue-50 border border-blue-200 rounded-md text-center space-y-4">
                <RefreshCw className="w-12 h-12 mx-auto text-blue-600 animate-spin" />
                <div className="space-y-2">
                  <h4 className="font-medium text-blue-900">Conectando...</h4>
                  <p className="text-sm text-blue-700">
                    Aguarde enquanto estabelecemos a conexão com o WhatsApp
                  </p>
                </div>
              </div>
            </div>
          )}

          {qrCode && !isConnecting && (
            <div className="space-y-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToMethodSelection}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
              <div className="p-6 bg-white dark:bg-gray-950 rounded-md flex flex-col items-center gap-6">
                <img
                  src={qrCode}
                  alt="QR Code"
                  className="w-full max-w-[256px] h-auto border-4 border-gray-100 dark:border-gray-800 rounded-lg"
                  data-testid="image-qr-code"
                />
                <div className="text-center space-y-4 max-w-md">
                  <h4 className="font-semibold text-lg">Para usar o WhatsApp no seu computador:</h4>
                  <ol className="text-left space-y-3 text-sm">
                    <li className="flex gap-3">
                      <span className="font-semibold text-primary min-w-[20px]">1.</span>
                      <span>Abra o WhatsApp no seu celular</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-semibold text-primary min-w-[20px]">2.</span>
                      <span>
                        Toque em <strong>Menu</strong> (⋮) ou <strong>Configurações</strong> (⚙️) e selecione <strong>Aparelhos conectados</strong>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-semibold text-primary min-w-[20px]">3.</span>
                      <span>Toque em <strong>Conectar um aparelho</strong></span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-semibold text-primary min-w-[20px]">4.</span>
                      <span>Aponte seu celular para esta tela para escanear o código</span>
                    </li>
                  </ol>
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      Mantenha seu celular conectado à internet
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Botão para gerar novo QR code caso o atual esteja expirado */}
              <Button
                variant="outline"
                onClick={() => {
                  void requestFreshPrimaryQr();
                }}
                disabled={connectMutation.isPending || resetMutation.isPending}
                className="w-full"
              >
                {connectMutation.isPending || resetMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Gerando novo QR Code...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Gerar Novo QR Code
                  </>
                )}
              </Button>
            </div>
          )}

          {primaryIsOperational && (
            <div className="space-y-4">
              <div className="p-6 bg-primary/5 border border-primary/20 rounded-md text-center space-y-2">
                <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
                <div className="space-y-1">
                  <h4 className="font-medium">{primaryIsOfficial ? "Canal Oficial Ativo" : "WhatsApp Conectado"}</h4>
                  <p className="text-sm text-muted-foreground">
                    Número: {connection.phoneNumber}
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="w-full"
                data-testid="button-disconnect"
              >
                {disconnectMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Desconectando...
                  </>
                ) : (
                  primaryIsOfficial ? "Desvincular Canal Oficial" : "Desconectar WhatsApp"
                )}
              </Button>
            </div>
          )}

          {/* Botão de reset para quando desconectado com erro */}
          {!primaryIsOperational && !connectionMethod && !qrCode && !isWaitingQrCode && !isConnecting && !pairingCode && (
            <div className="pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="w-full text-muted-foreground"
                data-testid="button-reset"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {resetMutation.isPending ? "Resetando..." : primaryIsOfficial ? "Reiniciar setup oficial" : "Gerar novo QR Code"}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                {primaryIsOfficial ? "Use se quiser reiniciar o onboarding oficial da Meta" : "Use quando quiser forçar uma nova autenticação por QR Code"}
              </p>
            </div>
          )}
        </Card>
        )}

        {/* ============ SEÇÃO MULTI-CONEXÕES E AGENTES ============ */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold">Minhas Conexões e Agentes</h2>
            </div>
            {!showNewConnForm && (
              <Button
                size="sm"
                variant="outline"
                onClick={startNewConnectionFlow}
                disabled={createConnectionMutation.isPending}
                className="gap-1"
              >
                {createConnectionMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Nova Conexão
                  </>
                )}
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Gerencie suas conexões WhatsApp e veja os agentes de IA atribuídos a cada uma.
          </p>

          {/* ============ FLUXO NOVA CONEXÃO ============ */}
          {showNewConnForm && (
            <Card className="p-5 space-y-5 border-2 border-primary/20 bg-primary/5">
              {/* Step 1: Auto-create connection */}
              {newConnStep === "creating" && (
                <>
                  <div className="flex items-center gap-2">
                    <Plus className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">Criando nova conexão</h3>
                  </div>
                  <div className="p-4 rounded-md border bg-background/60">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gerando nome automático e preparando opções de conexão...
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={closeNewConnFlow}>
                    Cancelar
                  </Button>
                </>
              )}

              {/* Step 2: Method selection (QR or Pairing) */}
              {newConnStep === "method" && newConnId && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={closeNewConnFlow}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Cancelar
                  </Button>
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-medium text-foreground">Como você quer conectar o novo número?</h3>
                    <p className="text-sm text-muted-foreground">
                      Escolha a opção mais fácil para você.
                    </p>
                  </div>
                  <div className={`grid gap-4 ${coexistenceEnabled ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                    {/* QR Code Option */}
                    <button
                      onClick={() => {
                        connectConnectionMutation.mutate(newConnId);
                      }}
                      disabled={connectConnectionMutation.isPending}
                      className="group relative flex flex-col items-center p-5 gap-3 rounded-xl border-2 border-muted bg-card hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-all duration-300 shadow-sm hover:shadow-md text-center cursor-pointer"
                    >
                      <Badge variant="secondary" className="absolute top-2 right-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 font-normal text-[10px] uppercase tracking-wider">
                        Recomendado
                      </Badge>
                      <div className="h-14 w-14 rounded-full bg-emerald-100/50 dark:bg-emerald-900/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <QrCode className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-semibold group-hover:text-emerald-700 dark:group-hover:text-emerald-400">Escanear QR Code</h4>
                        <p className="text-xs text-muted-foreground">
                          Abra a câmera do WhatsApp e aponte.
                        </p>
                      </div>
                      <div className="w-full py-2 bg-muted/50 rounded-lg text-xs font-medium text-foreground group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        Escolher QR Code
                      </div>
                    </button>

                    {/* Pairing Code Option */}
                    <button
                      onClick={() => setNewConnStep("pairing-form")}
                      className="group relative flex flex-col items-center p-5 gap-3 rounded-xl border-2 border-muted bg-card hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all duration-300 shadow-sm hover:shadow-md text-center cursor-pointer"
                    >
                      <div className="h-14 w-14 rounded-full bg-blue-100/50 dark:bg-blue-900/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <Hash className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-semibold group-hover:text-blue-700 dark:group-hover:text-blue-400">Código de 8 Dígitos</h4>
                        <p className="text-xs text-muted-foreground">
                          Digite seu número e receba um código.
                        </p>
                      </div>
                      <div className="w-full py-2 bg-muted/50 rounded-lg text-xs font-medium text-foreground group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        Escolher Código
                      </div>
                    </button>

                    {coexistenceEnabled && (
                      <button
                        onClick={() => startConnectionCoexistenceMutation.mutate(newConnId)}
                        disabled={startConnectionCoexistenceMutation.isPending}
                        className="group relative flex flex-col items-center p-5 gap-3 rounded-xl border-2 border-muted bg-card hover:border-violet-500 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-all duration-300 shadow-sm hover:shadow-md text-center cursor-pointer"
                      >
                        <Badge variant="secondary" className="absolute top-2 right-2 bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300 font-normal text-[10px] uppercase tracking-wider">
                          Beta
                        </Badge>
                        <div className="h-14 w-14 rounded-full bg-violet-100/50 dark:bg-violet-900/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                          <ShieldCheck className="h-7 w-7 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-semibold group-hover:text-violet-700 dark:group-hover:text-violet-400">Canal Oficial</h4>
                          <p className="text-xs text-muted-foreground">
                            Embedded Signup da Meta para responder via API oficial.
                          </p>
                        </div>
                        <div className="w-full py-2 bg-muted/50 rounded-lg text-xs font-medium text-foreground group-hover:bg-violet-600 group-hover:text-white transition-colors">
                          Configurar Oficial
                        </div>
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Step 3a: QR Waiting */}
              {newConnStep === "qr-waiting" && newConnId && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={closeNewConnFlow}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Cancelar
                  </Button>
                  <div className="p-6 bg-amber-50 border border-amber-200 rounded-md text-center space-y-4">
                    <Loader2 className="w-12 h-12 mx-auto text-amber-600 animate-spin" />
                    <div className="space-y-2">
                      <h4 className="font-medium text-amber-900">Gerando QR Code...</h4>
                      <p className="text-sm text-amber-700">
                        Aguarde enquanto geramos o QR Code para a nova conexão.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* Step 3b: QR Display */}
              {newConnStep === "qr-display" && newConnId && connectionQrCodes[newConnId] && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={closeNewConnFlow}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Cancelar
                  </Button>
                  <div className="p-6 bg-white dark:bg-gray-950 rounded-md flex flex-col items-center gap-6">
                    <img
                      src={connectionQrCodes[newConnId]}
                      alt="QR Code Nova Conexão"
                      className="w-full max-w-[256px] h-auto border-4 border-gray-100 dark:border-gray-800 rounded-lg"
                    />
                    <div className="text-center space-y-3 max-w-md">
                      <h4 className="font-semibold text-lg">Escaneie com o novo número:</h4>
                      <ol className="text-left space-y-2 text-sm">
                        <li className="flex gap-2">
                          <span className="font-semibold text-primary">1.</span>
                          <span>Abra o WhatsApp <strong>no celular do novo número</strong></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-semibold text-primary">2.</span>
                          <span>Vá em <strong>Configurações → Aparelhos conectados</strong></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-semibold text-primary">3.</span>
                          <span>Toque em <strong>Conectar um aparelho</strong></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-semibold text-primary">4.</span>
                          <span>Aponte a câmera para este QR Code</span>
                        </li>
                      </ol>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Re-trigger connect to get a new QR
                      setConnectionQrCodes(prev => {
                        const next = { ...prev };
                        if (newConnId) delete next[newConnId];
                        return next;
                      });
                      setConnectionQrCodeGeneratedAt(prev => {
                        const next = { ...prev };
                        if (newConnId) delete next[newConnId];
                        return next;
                      });
                      setNewConnStep("qr-waiting");
                      resetConnectionMutation.mutate(newConnId);
                    }}
                    disabled={resetConnectionMutation.isPending}
                    className="w-full"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Gerar Novo QR Code
                  </Button>
                </>
              )}

              {/* Step 3c: Pairing - Phone number form */}
              {newConnStep === "pairing-form" && newConnId && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewConnStep("method")}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar
                  </Button>
                  <div className="p-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md space-y-4">
                    <div className="text-center space-y-2">
                      <Hash className="w-10 h-10 mx-auto text-blue-600" />
                      <h4 className="font-medium text-blue-900 dark:text-blue-100">Conectar com Código</h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Digite o número do WhatsApp que deseja conectar
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-conn-phone" className="text-blue-900 dark:text-blue-100">
                        Número do WhatsApp
                      </Label>
                      <Input
                        id="new-conn-phone"
                        type="tel"
                        placeholder="5511999999999"
                        value={newConnPhoneNumber}
                        onChange={(e) => setNewConnPhoneNumber(e.target.value)}
                        className="text-center text-lg tracking-wider"
                      />
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Digite com código do país (55 para Brasil) e DDD
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={async () => {
                      const cleanPhone = newConnPhoneNumber.replace(/\D/g, "");
                      if (cleanPhone.length < 10) {
                        toast({ title: "Número muito curto", description: "Digite um número válido com DDI, DDD e número.", variant: "destructive" });
                        return;
                      }
                      setNewConnStep("pairing-waiting");
                      try {
                        const response = await apiRequest("POST", "/api/whatsapp/pairing-code", {
                          phoneNumber: cleanPhone,
                          connectionId: newConnId,
                        });
                        const data = await response.json();
                        if (data.code) {
                          setNewConnPairingCode(data.code);
                          setNewConnStep("pairing-display");
                        } else {
                          throw new Error("Código não retornado");
                        }
                      } catch (err: any) {
                        toast({ title: "Erro ao gerar código", description: err.message, variant: "destructive" });
                        setNewConnStep("pairing-form");
                      }
                    }}
                    disabled={newConnPhoneNumber.replace(/\D/g, "").length < 10}
                    className="w-full"
                  >
                    <Hash className="w-4 h-4 mr-2" />
                    Gerar Código de Conexão
                  </Button>
                </>
              )}

              {/* Step 3d: Pairing - Waiting */}
              {newConnStep === "pairing-waiting" && (
                <div className="p-6 bg-amber-50 border border-amber-200 rounded-md text-center space-y-4">
                  <Loader2 className="w-12 h-12 mx-auto text-amber-600 animate-spin" />
                  <div className="space-y-2">
                    <h4 className="font-medium text-amber-900">Gerando Código...</h4>
                    <p className="text-sm text-amber-700">Aguarde enquanto geramos seu código de 8 caracteres</p>
                  </div>
                </div>
              )}

              {/* Step 3e: Pairing - Code display */}
              {newConnStep === "pairing-display" && newConnPairingCode && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewConnStep("method")}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar
                  </Button>
                  <div className="p-6 bg-primary/5 border-2 border-primary/20 rounded-md text-center space-y-4">
                    <div className="space-y-2">
                      <CheckCircle2 className="w-10 h-10 mx-auto text-primary" />
                      <h4 className="font-medium text-lg">Código Gerado!</h4>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-lg shadow-inner">
                      <p className="text-3xl md:text-4xl font-mono font-bold tracking-[0.3em] text-primary">
                        {newConnPairingCode}
                      </p>
                    </div>
                    <div className="text-left space-y-2 pt-2">
                      <p className="text-sm font-medium">No celular do novo número:</p>
                      <ol className="text-sm text-muted-foreground space-y-1.5">
                        <li>1. Abra o WhatsApp</li>
                        <li>2. Vá em <strong>Aparelhos conectados</strong></li>
                        <li>3. Toque em <strong>Conectar um aparelho</strong></li>
                        <li>4. Toque em <strong>"Conectar com número de telefone"</strong></li>
                        <li>5. Digite o código <strong>{newConnPairingCode}</strong></li>
                      </ol>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-xs text-amber-600 pt-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Aguardando conexão...</span>
                    </div>
                  </div>
                </>
              )}
            </Card>
          )}

          {/* Lista de conexões */}
          <div className="space-y-4">
            {visibleConnections.length === 0 && !showNewConnForm && (
              <Card className="p-6 text-center text-muted-foreground">
                <p>Nenhuma conexão encontrada. Clique em "Nova Conexão" para adicionar.</p>
              </Card>
            )}
            {visibleConnections.map((conn) => {
                const connectionIsOperational = isAppVisibleOperationalConnection(conn);
                const connectionIsRecovering = conn.isRecovering === true && !connectionIsOperational;
                const connectionStatusMeta = getConnectionStatusMeta(conn);
                const connectionNeedsNewQr = connectionRequiresNewQr(conn);
                const renderedConnectionQrGeneratedAt =
                  connectionQrCodeGeneratedAt[conn.id] ?? getQrGeneratedAtFromConnection(conn);
                const serverProvidedQr = getServerProvidedQrCode(conn);
                const renderedConnectionQr =
                  connectionQrCodes[conn.id] ||
                  serverProvidedQr ||
                  (conn.qrCode && isFreshQrCode(conn.qrCode, renderedConnectionQrGeneratedAt)
                    ? conn.qrCode
                    : null);
                const hasActiveConnectionQr = Boolean(renderedConnectionQr && !connectionIsOperational);
                const connectionActionPending =
                  connectingConnectionId === conn.id &&
                  (connectConnectionMutation.isPending || resetConnectionMutation.isPending);
                return (
                <Card key={conn.id} className="p-5 space-y-4">
                  {/* Header da conexão */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        connectionStatusMeta.tone === "connected"
                          ? 'bg-emerald-100 dark:bg-emerald-900/30'
                          : connectionStatusMeta.tone === "recovering"
                            ? 'bg-amber-100 dark:bg-amber-900/30'
                            : 'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        <Link2 className={`w-5 h-5 ${
                          connectionStatusMeta.tone === "connected"
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : connectionStatusMeta.tone === "recovering"
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-gray-400'
                        }`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm">
                            {(conn as any).connectionName || `Conexão ${conn.phoneNumber || '#' + conn.id.slice(0, 6)}`}
                          </h3>
                          {(conn as any).isPrimary && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">
                              Principal
                            </Badge>
                          )}
                          {isOfficialProviderConnection(conn) && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-200 text-violet-700 dark:border-violet-800 dark:text-violet-300">
                              Oficial Meta
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {conn.phoneNumber || "Sem número"}
                          {(conn as any).connectionType && (conn as any).connectionType !== 'primary' && (
                            <span className="ml-2 text-muted-foreground">
                              • Tipo: {(conn as any).connectionType}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={connectionStatusMeta.tone === "connected" ? "default" : "secondary"}
                      className={`gap-1 ${
                        connectionStatusMeta.tone === "connected"
                          ? 'bg-emerald-600'
                          : connectionStatusMeta.tone === "recovering"
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : ''
                      }`}
                    >
                      {connectionStatusMeta.tone === "connected" ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          {connectionStatusMeta.label}
                        </>
                      ) : connectionStatusMeta.tone === "recovering" ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          {connectionStatusMeta.label}
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" />
                          {connectionStatusMeta.label}
                        </>
                      )}
                    </Badge>
                  </div>

                  {connectionIsRecovering && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Esta conexão está tentando se recuperar com a sessão existente. O painel só volta para conectado quando o socket abrir de verdade.
                    </div>
                  )}

                  {/* Per-connection QR Code */}
                  {hasActiveConnectionQr && (
                    <div className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-lg border">
                      <p className="text-sm font-medium">Escaneie o QR Code</p>
                      <img 
                        src={renderedConnectionQr || undefined} 
                        alt="QR Code" 
                        className="w-48 h-48"
                      />
                      <p className="text-xs text-muted-foreground">Abra o WhatsApp no celular &gt; Menu &gt; Aparelhos conectados</p>
                    </div>
                  )}

                  {/* Per-connection action buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {isOfficialProviderConnection(conn) ? (
                      !connectionIsOperational ? (
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-1"
                          onClick={() => startConnectionCoexistenceMutation.mutate(conn.id)}
                          disabled={
                            startConnectionCoexistenceMutation.isPending ||
                            officialSdkLoading ||
                            completeOfficialSignupMutation.isPending
                          }
                        >
                          {startConnectionCoexistenceMutation.isPending ||
                          officialSdkLoading ||
                          completeOfficialSignupMutation.isPending ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              {completeOfficialSignupMutation.isPending
                                ? "Finalizando..."
                                : "Abrindo Facebook..."}
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-3 h-3" />
                              Conectar com Facebook
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1"
                          onClick={() => {
                            if (confirm("Deseja desconectar este canal oficial?")) {
                              disconnectConnectionMutation.mutate(conn.id);
                            }
                          }}
                          disabled={disconnectConnectionMutation.isPending}
                        >
                          <XCircle className="w-3 h-3" />
                          Desvincular
                        </Button>
                      )
                    ) : connectionIsRecovering ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1"
                        disabled
                      >
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Reconectando...
                      </Button>
                    ) : !connectionIsOperational ? (
                      <Button
                        size="sm"
                        variant="default"
                        className="gap-1"
                        onClick={() => {
                          if (connectionNeedsNewQr) {
                            resetConnectionMutation.mutate(conn.id);
                            return;
                          }
                          connectConnectionMutation.mutate(conn.id);
                        }}
                        disabled={connectionActionPending}
                      >
                        {connectionActionPending ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {connectionNeedsNewQr ? "Gerando QR..." : "Conectando..."}
                          </>
                        ) : (
                          <>
                            {connectionNeedsNewQr ? (
                              <QrCode className="w-3 h-3" />
                            ) : (
                              <Power className="w-3 h-3" />
                            )}
                            {connectionNeedsNewQr ? "Gerar QR" : "Reconectar"}
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1"
                        onClick={() => {
                          if (confirm("Deseja desconectar este número?")) {
                            disconnectConnectionMutation.mutate(conn.id);
                          }
                        }}
                        disabled={disconnectConnectionMutation.isPending}
                      >
                        <XCircle className="w-3 h-3" />
                        Desconectar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => {
                        if (confirm(isOfficialProviderConnection(conn) ? "Reiniciar o setup oficial desta conexão?" : "Resetar esta conexão? Você precisará escanear um novo QR Code.")) {
                          resetConnectionMutation.mutate(conn.id);
                        }
                      }}
                      disabled={resetConnectionMutation.isPending || connectionActionPending}
                    >
                      <RotateCcw className="w-3 h-3" />
                      {isOfficialProviderConnection(conn) ? "Reiniciar Setup" : "Novo QR"}
                    </Button>

                    {/* AI Toggle */}
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-xs text-muted-foreground">IA</span>
                      <Switch
                        checked={(conn as any).aiEnabled !== false}
                        onCheckedChange={(checked) => 
                          toggleAiMutation.mutate({ connectionId: conn.id, aiEnabled: checked })
                        }
                      />
                    </div>
                  </div>

                  {conn.publicApiCanaryAvailable && (
                    <div className="rounded-lg border border-primary/15 bg-primary/5 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <KeyRound className="w-4 h-4 text-primary" />
                            <p className="text-sm font-medium">API da instância</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            O uso normal do AgenteZap continua igual. Esta área libera a integração externa desta conexão.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => openApiDetails(conn.id)}
                          disabled={loadingApiConnectionId === conn.id || apiAccessMutation.isPending}
                        >
                          {loadingApiConnectionId === conn.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Carregando...
                            </>
                          ) : (
                            <>
                              <ExternalLink className="w-3 h-3" />
                              {expandedApiConnectionId === conn.id ? "Ocultar API" : "Detalhes da API"}
                            </>
                          )}
                        </Button>
                      </div>

                      {expandedApiConnectionId === conn.id && (
                        <div className="space-y-3 rounded-md border bg-background p-3">
                          {apiDetailsByConnection[conn.id] ? (
                            <>
                              <div className="grid gap-2 md:grid-cols-2">
                                <div className="rounded-md border p-3">
                                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Instance ID</p>
                                  <div className="mt-1 flex items-center gap-2">
                                    <code className="text-xs break-all">{apiDetailsByConnection[conn.id].instanceId}</code>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => void copyApiValue(apiDetailsByConnection[conn.id].instanceId, "Instance ID")}
                                    >
                                      <Copy className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="rounded-md border p-3">
                                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Owner</p>
                                  <p className="mt-1 text-sm font-medium">
                                    {apiDetailsByConnection[conn.id].owner === "gateway" ? "Gateway canário" : "Monólito local"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Status: {apiDetailsByConnection[conn.id].status?.isConnected ? "conectado" : "desconectado"}
                                  </p>
                                </div>
                              </div>

                              <div className="rounded-md border p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div>
                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Token</p>
                                    <p className="text-xs text-muted-foreground">
                                      O token completo aparece apenas quando é criado ou rotacionado.
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    onClick={() => {
                                      setLoadingApiConnectionId(conn.id);
                                      rotateApiTokenMutation.mutate(conn.id);
                                    }}
                                    disabled={loadingApiConnectionId === conn.id || rotateApiTokenMutation.isPending}
                                  >
                                    <RefreshCw className={`w-3 h-3 ${loadingApiConnectionId === conn.id ? "animate-spin" : ""}`} />
                                    Rotacionar token
                                  </Button>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                  <code className="text-xs break-all">
                                    {apiDetailsByConnection[conn.id].tokenValue || apiDetailsByConnection[conn.id].tokenPreview || "Token indisponível"}
                                  </code>
                                  {!!apiDetailsByConnection[conn.id].tokenValue && (
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => void copyApiValue(apiDetailsByConnection[conn.id].tokenValue || "", "Token")}
                                    >
                                      <Copy className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>

                              <div className="rounded-md border p-3 space-y-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Base URL</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <code className="text-xs break-all">{apiDetailsByConnection[conn.id].baseUrl}</code>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => void copyApiValue(apiDetailsByConnection[conn.id].baseUrl, "Base URL")}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                                <div className="text-xs text-muted-foreground space-y-1">
                                  <p>`GET /status` consulta o estado da instância.</p>
                                  <p>`GET /device` retorna dados do canal e do device.</p>
                                  <p>`POST /messages/send` envia texto usando o mesmo canal do AgenteZap.</p>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Carregando detalhes da API desta conexão...
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Agente principal (1:1) */}
                  {conn.agent && (
                    <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
                      <Bot className="w-4 h-4 text-primary" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{conn.agent.name}</p>
                        <p className="text-xs text-muted-foreground">Agente Principal</p>
                      </div>
                      <Badge variant="default" className="text-[10px]">Ativo</Badge>
                    </div>
                  )}

                  {/* Agentes atribuídos (many-to-many) */}
                  {conn.assignedAgents && conn.assignedAgents.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Agentes Atribuídos ({conn.assignedAgents.length})
                      </p>
                      <div className="grid gap-2">
                        {conn.assignedAgents.map((ca) => (
                          <div 
                            key={ca.id} 
                            className={`flex items-center gap-2 p-2.5 rounded-lg border ${
                              ca.isActive 
                                ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800' 
                                : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 opacity-60'
                            }`}
                          >
                            <Bot className={`w-4 h-4 ${ca.isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                {ca.agent?.name || `Agente #${ca.agentId.slice(0, 6)}`}
                              </p>
                            </div>
                            <Badge 
                              variant={ca.isActive ? "default" : "secondary"}
                              className={`text-[10px] ${ca.isActive ? 'bg-emerald-600' : ''}`}
                            >
                              {ca.isActive ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sem agentes - não mostrar aviso pois o toggle IA já indica o status */}

                  {/* Botão deletar (somente conexões não-primárias) */}
                  {!(conn as any).isPrimary && (
                    <div className="flex justify-end pt-2 border-t">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 gap-1"
                        onClick={() => {
                          if (confirm("Remover esta conexao da lista? O historico das conversas sera preservado.")) {
                            deleteConnectionMutation.mutate(conn.id);
                          }
                        }}
                        disabled={deleteConnectionMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3" />
                        Remover
                      </Button>
                    </div>
                  )}
                </Card>
            )})}
            </div>
          </div>
      </div>
    </div>
  );
}
