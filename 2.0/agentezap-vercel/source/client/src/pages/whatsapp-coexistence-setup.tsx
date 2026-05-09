import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type CoexistenceStatusResponse = {
  success: boolean;
  provider?: string | null;
  providerStatus?: string | null;
  isConnected?: boolean;
  providerConfig?: Record<string, any> | null;
};

type CoexistenceBetaResponse = {
  enabled: boolean;
  userEmail?: string | null;
  launchConfig?: {
    appId?: string | null;
    configId?: string | null;
    redirectUri?: string | null;
    docsUrl?: string | null;
    isConfigured?: boolean;
  } | null;
};

type EmbeddedSignupData = {
  waba_id?: string;
  phone_number_id?: string;
  business_id?: string;
  display_phone_number?: string;
  phone_number?: string;
  raw?: Record<string, unknown>;
};

function getConnectionIdFromUrl() {
  return new URLSearchParams(window.location.search).get("connectionId");
}

function shouldAutoLaunchFromUrl() {
  return new URLSearchParams(window.location.search).get("autoLaunch") === "1";
}

function getAuthCodeFromUrl() {
  return new URLSearchParams(window.location.search).get("code");
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

function buildHostedEmbeddedSignupUrl(launchConfig: Record<string, any>) {
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

export default function WhatsappCoexistenceSetupPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const submittedRef = useRef(false);
  const autoLaunchAttemptedRef = useRef(false);
  const popupRef = useRef<Window | null>(null);
  const popupWatchRef = useRef<number | null>(null);
  const connectionId = useMemo(() => getConnectionIdFromUrl(), []);
  const autoLaunchRequested = useMemo(() => shouldAutoLaunchFromUrl(), []);
  const [authCode, setAuthCode] = useState<string | null>(() => getAuthCodeFromUrl());
  const [signupData, setSignupData] = useState<EmbeddedSignupData | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [sdkLoading, setSdkLoading] = useState(false);

  const betaQuery = useQuery<CoexistenceBetaResponse>({
    queryKey: ["/api/whatsapp/coexistence/beta"],
    staleTime: 60000,
  });

  const statusQuery = useQuery<CoexistenceStatusResponse>({
    queryKey: connectionId
      ? [`/api/whatsapp/connections/${connectionId}/coexistence/status`]
      : ["coexistence-status-missing"],
    enabled: !!connectionId,
    staleTime: 5000,
  });

  const launchConfig =
    (statusQuery.data?.providerConfig?.launchConfig as Record<string, any> | undefined) ||
    (betaQuery.data?.launchConfig as Record<string, any> | undefined) ||
    {};

  const completeMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!connectionId) {
        throw new Error("connectionId ausente para concluir onboarding.");
      }
      const response = await apiRequest(
        "POST",
        `/api/whatsapp/connections/${connectionId}/coexistence/complete`,
        payload,
      );
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      if (connectionId) {
        await queryClient.invalidateQueries({
          queryKey: [`/api/whatsapp/connections/${connectionId}/coexistence/status`],
        });
      }
      toast({
        title: "Canal oficial configurado",
        description: "A conexao oficial foi concluida e agora usa o fluxo da Meta.",
      });
      setTimeout(() => setLocation("/conexao"), 1200);
    },
    onError: (error: Error) => {
      submittedRef.current = false;
      setLocalError(error.message);
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
        setAuthCode((current) => current || maybeCode);
      }
      if (!parsed || parsed.type !== "WA_EMBEDDED_SIGNUP") {
        return;
      }

      const eventName = String(parsed.event || "").toUpperCase();
      if (eventName.includes("CANCEL")) {
        if (popupWatchRef.current) {
          window.clearInterval(popupWatchRef.current);
          popupWatchRef.current = null;
        }
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
        popupRef.current = null;
        setSdkLoading(false);
        setLocalError("O fluxo do Embedded Signup foi cancelado antes da conclusao.");
        return;
      }
      if (eventName.includes("ERROR")) {
        if (popupWatchRef.current) {
          window.clearInterval(popupWatchRef.current);
          popupWatchRef.current = null;
        }
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
        popupRef.current = null;
        setSdkLoading(false);
        setLocalError("A Meta retornou um erro durante o Embedded Signup.");
        return;
      }
      if (!eventName.includes("FINISH")) {
        return;
      }

      const data = parsed.data || {};
      if (popupWatchRef.current) {
        window.clearInterval(popupWatchRef.current);
        popupWatchRef.current = null;
      }
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      popupRef.current = null;
      setSdkLoading(false);
      setSignupData({
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
  }, []);

  useEffect(() => {
    if (!signupData && !localError) {
      return;
    }
    setSdkLoading(false);
  }, [localError, signupData]);

  useEffect(() => {
    return () => {
      if (popupWatchRef.current) {
        window.clearInterval(popupWatchRef.current);
        popupWatchRef.current = null;
      }
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      popupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!authCode || !signupData || submittedRef.current || completeMutation.isPending) {
      return;
    }

    submittedRef.current = true;
    completeMutation.mutate({
      authorizationCode: authCode,
      redirectUri: launchConfig?.redirectUri || undefined,
      wabaId: signupData.waba_id,
      businessAccountId: signupData.business_id,
      phoneNumberId: signupData.phone_number_id,
      displayPhoneNumber: signupData.display_phone_number,
      phoneNumber: signupData.phone_number || signupData.display_phone_number,
      metadata: signupData.raw || {},
    });
  }, [authCode, signupData, completeMutation, launchConfig]);

  const startEmbeddedSignup = useCallback(() => {
    if (!launchConfig?.appId || !launchConfig?.configId) {
      setLocalError(
        "Faltam as configuracoes do Embedded Signup da Meta. Configure APP_ID, CONFIG_ID, APP_SECRET, REDIRECT_URI e BASE_URL.",
      );
      return;
    }

    try {
      setLocalError(null);
      setSdkLoading(true);
      submittedRef.current = false;
      setAuthCode(getAuthCodeFromUrl());
      setSignupData(null);

      const hostedUrl = buildHostedEmbeddedSignupUrl(launchConfig);
      if (!hostedUrl) {
        throw new Error("Nao foi possivel montar a URL hospedada do Embedded Signup.");
      }

      if (popupWatchRef.current) {
        window.clearInterval(popupWatchRef.current);
        popupWatchRef.current = null;
      }
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }

      const popup = window.open(
        hostedUrl,
        "agentezap-meta-embedded-signup",
        "width=1200,height=820,menubar=no,toolbar=no,status=no,scrollbars=yes,resizable=yes",
      );
      if (!popup) {
        throw new Error(
          "O navegador bloqueou a abertura da janela da Meta. Libere pop-ups e tente novamente.",
        );
      }

      popupRef.current = popup;
      popup.focus();

      popupWatchRef.current = window.setInterval(() => {
        if (!popupRef.current || popupRef.current.closed) {
          if (popupWatchRef.current) {
            window.clearInterval(popupWatchRef.current);
            popupWatchRef.current = null;
          }
          popupRef.current = null;
          setSdkLoading(false);
        }
      }, 500);
    } catch (error: any) {
      setSdkLoading(false);
      setLocalError(error?.message || "Falha ao abrir o onboarding da Meta.");
    }
  }, [completeMutation.isPending, launchConfig]);

  const providerStatus = statusQuery.data?.providerStatus || "pending_setup";
  const isConfigured = !!launchConfig?.isConfigured;
  const loading = betaQuery.isLoading || statusQuery.isLoading;
  const docsUrl = typeof launchConfig?.docsUrl === "string" ? launchConfig.docsUrl : null;

  useEffect(() => {
    if (!autoLaunchRequested || autoLaunchAttemptedRef.current) {
      return;
    }
    if (
      loading ||
      betaQuery.data?.enabled !== true ||
      !connectionId ||
      !isConfigured ||
      sdkLoading ||
      completeMutation.isPending
    ) {
      return;
    }

    autoLaunchAttemptedRef.current = true;
    startEmbeddedSignup();
  }, [
    autoLaunchRequested,
    betaQuery.data?.enabled,
    completeMutation.isPending,
    connectionId,
    isConfigured,
    loading,
    sdkLoading,
    startEmbeddedSignup,
  ]);

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Button variant="ghost" className="gap-2" onClick={() => setLocation("/conexao")}>
          <ArrowLeft className="h-4 w-4" />
          Voltar para conexoes
        </Button>

        <Card className="border-violet-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <Badge variant="secondary" className="w-fit bg-violet-100 text-violet-700">
                Beta oficial
              </Badge>
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-foreground">Canal Oficial Meta</h1>
                <p className="text-sm text-muted-foreground">
                  Este fluxo usa o Embedded Signup da Meta para manter o numero no WhatsApp
                  Business App e responder por Cloud API.
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm">
              <div className="font-medium text-violet-900">
                {betaQuery.data?.userEmail || "Beta privado"}
              </div>
              <div className="text-violet-700">Status: {providerStatus}</div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          {loading ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando configuracao do Embedded Signup...
            </div>
          ) : !connectionId ? (
            <p className="text-sm text-destructive">
              Nenhum `connectionId` foi informado para o setup oficial.
            </p>
          ) : betaQuery.data?.enabled !== true ? (
            <p className="text-sm text-destructive">
              Esta conta nao esta na beta allowlist da coexistencia oficial.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/60 p-5 text-sm text-violet-900">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-violet-600" />
                  <div className="space-y-2">
                    <p className="font-medium">Fluxo esperado</p>
                    <p>1. A Meta abre o Embedded Signup.</p>
                    <p>2. O cliente autoriza o numero ja usado no WhatsApp Business App.</p>
                    <p>3. Esta pagina recebe `authorization code`, `waba_id` e `phone_number_id`.</p>
                    <p>4. O backend troca o code por token e mantem a conexao oficial nesse canal.</p>
                  </div>
                </div>
              </div>

              {!isConfigured && (
                <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-medium">
                    A integracao Meta existe no sistema, mas o ambiente ainda nao esta parametrizado.
                  </p>
                  <p>
                    Para abrir o Login com Facebook direto daqui, este ambiente precisa das envs
                    {" "}
                    `WHATSAPP_COEXISTENCE_APP_ID`, `WHATSAPP_COEXISTENCE_CONFIG_ID`,
                    {" "}
                    `WHATSAPP_COEXISTENCE_APP_SECRET`, `WHATSAPP_COEXISTENCE_REDIRECT_URI` e
                    {" "}
                    `BASE_URL`.
                  </p>
                  {docsUrl && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                        onClick={() => window.open(docsUrl, "_blank", "noopener,noreferrer")}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Ver documentacao oficial da Meta
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {localError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                  {localError}
                </div>
              )}

              {signupData && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Dados recebidos da Meta
                  </div>
                  <div className="mt-2 space-y-1">
                    <p>WABA ID: {signupData.waba_id || "nao informado"}</p>
                    <p>Phone Number ID: {signupData.phone_number_id || "nao informado"}</p>
                    <p>Business ID: {signupData.business_id || "nao informado"}</p>
                    <p>
                      Numero:{" "}
                      {signupData.display_phone_number ||
                        signupData.phone_number ||
                        "nao informado"}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={startEmbeddedSignup}
                  disabled={!isConfigured || sdkLoading || completeMutation.isPending}
                  className="gap-2"
                >
                  {sdkLoading || completeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {completeMutation.isPending ? "Finalizando..." : "Abrindo Meta..."}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      Continuar com Facebook
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => setLocation("/conexao")}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
