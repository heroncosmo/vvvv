import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogOut,
  PenLine,
  RefreshCcw,
  User,
  Volume2,
  Wallet,
} from "lucide-react";
import { useLocation } from "wouter";
import type { User as UserType } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { buildPublicAppUrl, isAndroidDevice, isNativeApp } from "@/lib/native-runtime";

function formatPushCheckedAt(value: number | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPushDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function isAndroidLikeDevice() {
  return isAndroidDevice();
}

function getCurrentNotificationPermission(): NotificationPermission | "unsupported" {
  if (isNativeApp()) {
    return "default";
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

function buildAndroidBrowserIntentUrl(targetUrl: string) {
  const parsed = new URL(targetUrl);
  const scheme = parsed.protocol.replace(":", "") || "https";
  const pathAndQuery = `${parsed.host}${parsed.pathname}${parsed.search}`;
  const fallbackUrl = encodeURIComponent(targetUrl);
  return `intent://${pathAndQuery}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${fallbackUrl};end`;
}

type SettingsPageProps = {
  onOpenBilling?: () => void;
};

export default function SettingsPage({ onOpenBilling }: SettingsPageProps = {}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useQuery<UserType>({
    queryKey: ["/api/auth/user"],
  });

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [signature, setSignature] = useState("");
  const [signatureEnabled, setSignatureEnabled] = useState(false);
  const notificationCardRef = useRef<HTMLDivElement | null>(null);

  const {
    soundEnabled,
    pushEnabled,
    pushHealth,
    pushHealthBusy,
    pushPermission,
    refreshPushHealth,
    repairPushSubscription,
    enableSound,
    setSoundEnabled,
    setPushEnabled,
    requestPushPermission,
  } = useNotifications();

  useEffect(() => {
    if (!user) {
      return;
    }

    setEmail(user.email || "");
    setName(user.name || "");
    setPhone((user as any).phone || (user as any).whatsappNumber || "");
    setSignature((user as any).signature || "");
    setSignatureEnabled((user as any).signatureEnabled || false);
  }, [user]);

  useEffect(() => {
    const scrollToTarget = () => {
      const shouldScrollToNotifications =
        window.location.hash === "#notificacoes" ||
        new URLSearchParams(window.location.search).get("openNotifications") === "1";

      if (shouldScrollToNotifications) {
        window.requestAnimationFrame(() => {
          notificationCardRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
        return;
      }

    };

    scrollToTarget();
    window.addEventListener("hashchange", scrollToTarget);

    return () => window.removeEventListener("hashchange", scrollToTarget);
  }, []);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { email?: string; name?: string; phone?: string }) => {
      const response = await apiRequest("PUT", "/api/user/profile", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Perfil atualizado com sucesso." });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar perfil",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateSignatureMutation = useMutation({
    mutationFn: async (data: { signature: string; signatureEnabled: boolean }) => {
      const response = await apiRequest("PUT", "/api/user/signature", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Assinatura atualizada com sucesso." });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar assinatura",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await apiRequest("PUT", "/api/user/password", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Senha alterada com sucesso." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao alterar senha",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendPushTestMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/pwa/test");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Push de teste enviado.",
        description: "Se o celular estiver configurado corretamente, o aviso deve aparecer tambem com a tela bloqueada.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Falha ao enviar push de teste",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const refreshPushHealthMutation = useMutation({
    mutationFn: async () => {
      const currentPermission =
        pushPermission === "unsupported" ? getCurrentNotificationPermission() : pushPermission;

      if (currentPermission === "granted" && !pushEnabled) {
        await setPushEnabled(true);
        return repairPushSubscription();
      }

      return refreshPushHealth({
        assumePushEnabled: pushEnabled || currentPermission === "granted",
      });
    },
    onSuccess: (status) => {
      if (status.status === "healthy" || status.status === "repaired") {
        toast({
          title: "Diagnostico atualizado",
          description: status.summary,
        });
        return;
      }

      toast({
        title: "Push precisa de atencao",
        description: status.summary,
        variant: "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Falha ao verificar push",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const repairPushMutation = useMutation({
    mutationFn: async () => repairPushSubscription(),
    onSuccess: (status) => {
      if (status.status === "healthy" || status.status === "repaired") {
        toast({
          title: "Push reparado",
          description: status.summary,
        });
        return;
      }

      toast({
        title: "Push ainda precisa de atencao",
        description: status.summary,
        variant: "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Falha ao reparar push",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const quickEnablePushMutation = useMutation({
    mutationFn: async () => {
      if (pushPermission === "unsupported") {
        throw new Error("Este navegador nao consegue mostrar esse aviso neste aparelho.");
      }

      let effectivePermission = pushPermission;
      if (effectivePermission === "default") {
        effectivePermission = await requestPushPermission();
      }

      if (effectivePermission === "denied") {
        throw new Error("Abra o site no navegador e libere as notificacoes.");
      }

      if (effectivePermission !== "granted") {
        throw new Error("Ative as notificacoes para continuar.");
      }

      if (!pushEnabled) {
        await setPushEnabled(true);
      }

      return repairPushSubscription();
    },
    onSuccess: (status) => {
      toast({
        title: status.status === "healthy" || status.status === "repaired" ? "Notificacoes ativadas" : "Verificacao concluida",
        description: status.summary,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Nao foi possivel ativar automaticamente",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const quickEnableSoundMutation = useMutation({
    mutationFn: async () => {
      const activated = await enableSound();
      if (!activated) {
        throw new Error("Este navegador nao conseguiu liberar o som agora.");
      }

      return true;
    },
    onSuccess: () => {
      toast({
        title: "Som ativado",
        description: "O aviso sonoro foi liberado neste aparelho.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Nao foi possivel ativar o som",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleProfileSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateProfileMutation.mutate({ email, name, phone });
  };

  const handleSignatureSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateSignatureMutation.mutate({ signature, signatureEnabled });
  };

  const handlePasswordSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: "Senhas nao conferem",
        description: "A nova senha e a confirmacao devem ser iguais.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Senha muito curta",
        description: "A senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const handleOpenNotificationsInBrowser = () => {
    if (isNativeApp() && isAndroidDevice()) {
      window.location.href = buildAndroidBrowserIntentUrl(notificationsBrowserUrl);
      toast({
        title: "Abrindo no navegador",
        description: "Depois de liberar a permissao, volte aqui e toque em Verificar agora.",
      });
      return;
    }

    const openedWindow = window.open(notificationsBrowserUrl, "_blank", "noopener,noreferrer");

    if (openedWindow) {
      openedWindow.opener = null;
      toast({
        title: "Abrindo no navegador",
        description: "Depois de liberar a permissao, volte aqui e toque em Verificar agora.",
      });
      return;
    }

    window.location.assign(notificationsBrowserUrl);
    toast({
      title: "Abrindo o link",
      description: "Se continuar dentro do app, use o menu do navegador para liberar as notificacoes.",
    });
  };

  const handleLogout = async () => {
    const memberToken = localStorage.getItem("memberToken");

    try {
      if (memberToken) {
        try {
          await fetch("/api/team-members/logout", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${memberToken}`,
            },
            credentials: "include",
          });
        } catch (err) {
          console.warn("Falha ao encerrar acesso de membro:", err);
        }

        localStorage.removeItem("memberToken");
        localStorage.removeItem("memberData");
      } else {
        try {
          await supabase.auth.signOut();
        } catch (err) {
          console.warn("Falha ao encerrar sessao local:", err);
        }

        try {
          await fetch("/api/logout", { credentials: "include" });
        } catch (err) {
          console.warn("Falha ao encerrar sessao do servidor:", err);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.clear();
      setLocation(memberToken ? "/membro-login" : "/login");
    } catch (error) {
      console.error("Erro durante logout:", error);
      setLocation(memberToken ? "/membro-login" : "/login");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const isMember = Boolean((user as any)?.isMember);
  const openBillingArea = () => {
    if (onOpenBilling) {
      onOpenBilling();
      return;
    }

    setLocation("/minha-assinatura");
  };
  const pushStatusCheckedAt = formatPushCheckedAt(pushHealth.checkedAt);
  const pushStatusLastSeenAt = formatPushDate(pushHealth.remoteLastSeenAt);
  const pushStatusPending =
    pushHealthBusy ||
    refreshPushHealthMutation.isPending ||
    repairPushMutation.isPending ||
    quickEnablePushMutation.isPending;
  const pushStatusTone = pushHealth.needsAttention
    ? "border-amber-200/80 bg-amber-50/90 text-amber-950"
    : pushHealth.status === "repaired"
      ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-950"
      : "border-slate-200/80 bg-slate-50/90 text-slate-900";
  const PushStatusIcon = pushHealth.needsAttention ? AlertTriangle : CheckCircle2;
  const androidLikeDevice = isAndroidLikeDevice();
  const notificationsBrowserUrl = buildPublicAppUrl("/settings?openNotifications=1#notificacoes");
  const shouldShowPushActivationGuide =
    pushPermission !== "granted" || !pushEnabled || pushHealth.needsAttention;
  const notificationSettingsCard = (
    <Card
      id="notificacoes"
      ref={notificationCardRef}
      data-testid="card-notification-settings"
      className="scroll-mt-24"
    >
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5" />
          Notificacoes
        </CardTitle>
        <CardDescription>
          Receba avisos de novas mensagens no computador e no celular.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Volume2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Som de notificacao</Label>
              <p className="text-xs text-muted-foreground">
                Toca um aviso quando chegar nova mensagem em Conversas.
                {!soundEnabled && (
                  <span className="mt-1 block text-amber-600">
                    Toque em ativar som para liberar o aviso neste navegador.
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Switch
              checked={soundEnabled}
              onCheckedChange={setSoundEnabled}
              data-testid="switch-sound-notifications"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={quickEnableSoundMutation.isPending}
              onClick={() => quickEnableSoundMutation.mutate()}
            >
              {quickEnableSoundMutation.isPending && (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              )}
              {soundEnabled ? "Testar som" : "Ativar som"}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Alertas do app</Label>
              <p className="text-xs text-muted-foreground">
                Mostra avisos de novas mensagens mesmo quando voce sai da tela.
                {pushPermission === "denied" && (
                  <span className="mt-1 block text-destructive">
                    Abra o site no navegador e libere as notificacoes.
                  </span>
                )}
                {pushPermission === "unsupported" && (
                  <span className="mt-1 block text-amber-500">
                    Este navegador nao consegue mostrar esse aviso neste aparelho.
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <Switch
              checked={pushEnabled}
              disabled={pushPermission === "denied" || pushPermission === "unsupported"}
              onCheckedChange={async (value) => {
                if (value && pushPermission === "default") {
                  const result = await requestPushPermission();
                  if (result !== "granted") {
                    toast({
                      title: "Permissao negada",
                      description: "Abra o site no navegador e libere as notificacoes.",
                      variant: "destructive",
                    });
                    return;
                  }
                }

                try {
                  await setPushEnabled(value);
                } catch (error: any) {
                  toast({
                    title: "Falha ao atualizar notificacoes",
                    description: error?.message || "Nao foi possivel atualizar as notificacoes do app.",
                    variant: "destructive",
                  });
                }
              }}
              data-testid="switch-push-notifications"
            />

            {pushPermission === "default" && !pushEnabled && (
              <button
                className="text-xs text-primary underline"
                onClick={async () => {
                  const result = await requestPushPermission();
                  if (result === "granted") {
                    try {
                      await setPushEnabled(true);
                      toast({ title: "Push ativado." });
                    } catch (error: any) {
                      toast({
                        title: "Falha ao ativar notificacoes",
                        description: error?.message || "Nao foi possivel concluir a ativacao do app.",
                        variant: "destructive",
                      });
                    }
                    return;
                  }

                  if (result === "denied") {
                    toast({
                      title: "Permissao negada",
                      description: "Abra o site no navegador e libere as notificacoes.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Solicitar permissao
              </button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={
                !pushEnabled ||
                pushPermission !== "granted" ||
                sendPushTestMutation.isPending
              }
              onClick={() => sendPushTestMutation.mutate()}
            >
              {sendPushTestMutation.isPending && (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              )}
              Enviar teste
            </Button>
          </div>
        </div>

        {shouldShowPushActivationGuide && (
          <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/80 p-4 text-sm text-emerald-950">
            <p className="font-medium">Se os avisos nao estiverem chegando</p>
            <p className="mt-1 text-sm text-emerald-900/85">
              Abra o site no navegador, toque no icone ao lado do endereco e permita as notificacoes.
            </p>
            <p className="mt-2 text-xs text-emerald-900/75">
              Depois volte aqui e toque em <strong>Verificar agora</strong> para confirmar.
            </p>
            {androidLikeDevice && (
              <p className="mt-2 text-xs text-emerald-900/75">
                Se o Android continuar bloqueando, permita as notificacoes nas permissoes do app.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" className="gap-2" onClick={handleOpenNotificationsInBrowser}>
                Abrir no navegador
              </Button>

              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={pushStatusPending}
                onClick={() => quickEnablePushMutation.mutate()}
              >
                {quickEnablePushMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
                Pedir aqui
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={pushStatusPending}
                onClick={() => refreshPushHealthMutation.mutate()}
              >
                Verificar agora
              </Button>
            </div>
          </div>
        )}

        {(pushEnabled || pushPermission === "granted" || pushHealth.needsAttention) && (
          <div className={`rounded-2xl border p-4 text-sm ${pushStatusTone}`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <PushStatusIcon className="h-4 w-4 shrink-0" />
                  <p className="font-medium">Estado deste aparelho</p>
                </div>

                <p>{pushHealth.summary}</p>

                {pushHealth.detail && (
                  <p className="text-xs opacity-80">{pushHealth.detail}</p>
                )}

                <div className="grid gap-1 text-xs opacity-80">
                  <p className="flex items-center gap-2">
                    <Bell className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Inscricao local: {pushHealth.localSubscription ? "ok" : "ausente"} | registro remoto:{" "}
                      {pushHealth.remoteSubscription ? "ok" : "ausente"}
                    </span>
                  </p>

                  {pushHealth.remoteDeviceLabel && (
                    <p>Dispositivo salvo no servidor: {pushHealth.remoteDeviceLabel}</p>
                  )}

                  {typeof pushHealth.totalActiveSubscriptions === "number" && (
                    <p>Dispositivos ativos deste usuario: {pushHealth.totalActiveSubscriptions}</p>
                  )}

                  {pushStatusLastSeenAt && (
                    <p>Ultima confirmacao no servidor: {pushStatusLastSeenAt}</p>
                  )}

                  {pushStatusCheckedAt && (
                    <p>Ultima verificacao neste aparelho: {pushStatusCheckedAt}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 md:w-44">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  disabled={pushStatusPending}
                  onClick={() => refreshPushHealthMutation.mutate()}
                >
                  {pushStatusPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  Verificar agora
                </Button>

                {pushHealth.canRepair && (
                  <Button
                    type="button"
                    className="h-9"
                    disabled={pushStatusPending || pushPermission !== "granted"}
                    onClick={() => repairPushMutation.mutate()}
                  >
                    {repairPushMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Bell className="mr-2 h-4 w-4" />
                    )}
                    Reparar push
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (isMember) {
    return (
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-3xl space-y-4 md:space-y-6">
          <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-slate-50 via-background to-emerald-50 p-6">
            <h1 className="text-2xl font-bold" data-testid="text-settings-title">
              Configuracoes
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ajuste os avisos e as permissoes deste aparelho para receber novas mensagens com mais confianca.
            </p>
          </div>

          {notificationSettingsCard}

          <Card data-testid="card-logout-settings">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <LogOut className="h-5 w-5" />
                Sair da conta
              </CardTitle>
              <CardDescription>Encerre o acesso deste aparelho com seguranca.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant="outline"
                onClick={handleLogout}
                className="h-11 w-full justify-start md:w-auto"
                data-testid="button-settings-logout-member"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="h-max rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:sticky lg:top-6">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl bg-slate-950 px-3 py-2.5 text-left text-sm font-semibold text-white"
          >
            <User className="h-4 w-4" />
            Conta
          </button>
          <button
            type="button"
            onClick={openBillingArea}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
            data-testid="button-settings-open-billing"
          >
            <Wallet className="h-4 w-4" />
            Uso e Faturamento
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </aside>

        <div className="space-y-4 md:space-y-6">
        <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-slate-50 via-background to-emerald-50 p-6">
          <h1 className="text-2xl font-bold" data-testid="text-settings-title">
            Configuracoes da conta
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ajuste seus dados pessoais, seguranca, assinatura e notificacoes.
            O gerenciamento operacional da equipe agora fica separado em Membros e Setores.
          </p>
        </div>

        <Card data-testid="card-profile-settings">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5" />
              Informacoes pessoais
            </CardTitle>
            <CardDescription>Atualize email, nome e telefone vinculado.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seu@email.com"
                  className="h-11"
                  data-testid="input-email"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nome do responsavel"
                  className="h-11"
                  data-testid="input-name"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="phone">Telefone vinculado</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="5511999999999"
                  className="h-11"
                  data-testid="input-phone"
                />
                <p className="text-xs text-muted-foreground">
                  Esse numero ajuda a identificar sua conta nos fluxos internos do sistema.
                </p>
              </div>

              <Button
                type="submit"
                disabled={updateProfileMutation.isPending}
                className="h-11 w-full md:w-auto"
                data-testid="button-save-profile"
              >
                {updateProfileMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar alteracoes
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card data-testid="card-password-settings">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="h-5 w-5" />
              Alterar senha
            </CardTitle>
            <CardDescription>Troque sua senha de acesso com seguranca.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="currentPassword">Senha atual</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder="Digite sua senha atual"
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="newPassword">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Digite a nova senha"
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirme a nova senha"
                  className="h-11"
                />
              </div>

              <Button
                type="submit"
                disabled={
                  changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword
                }
                className="h-11 w-full md:w-auto"
              >
                {changePasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Alterar senha
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card data-testid="card-signature-settings">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <PenLine className="h-5 w-5" />
              Assinatura de mensagens
            </CardTitle>
            <CardDescription>
              Adicione seu nome ou apelido em negrito no inicio das mensagens enviadas manualmente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignatureSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Ativar assinatura</Label>
                  <p className="text-xs text-muted-foreground">
                    Quando ativado, sua assinatura aparece antes de cada mensagem.
                  </p>
                </div>
                <Switch checked={signatureEnabled} onCheckedChange={setSignatureEnabled} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="signature">Sua assinatura</Label>
                <Input
                  id="signature"
                  value={signature}
                  onChange={(event) => setSignature(event.target.value)}
                  placeholder="Ex: Rodrigo, Atendimento, Suporte"
                  maxLength={50}
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  Aparecera como:
                  <span className="block">
                    <strong>*{signature || "Nome"}:*</strong>
                  </span>
                  <span className="block">sua mensagem</span>
                </p>
              </div>

              {signatureEnabled && signature && (
                <div className="rounded-lg bg-muted p-3">
                  <p className="mb-1 text-xs text-muted-foreground">Previa</p>
                  <p className="text-sm">
                    <strong>*{signature}:*</strong>
                    <span className="block">Ola, como posso ajudar?</span>
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={updateSignatureMutation.isPending}
                className="h-11 w-full md:w-auto"
              >
                {updateSignatureMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar assinatura
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card data-testid="card-logout-settings">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <LogOut className="h-5 w-5" />
              Sair da conta
            </CardTitle>
            <CardDescription>Encerre o acesso deste aparelho com seguranca.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              className="h-11 w-full justify-start md:w-auto"
              data-testid="button-settings-logout"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </CardContent>
        </Card>

        {notificationSettingsCard}
        </div>
      </div>
    </div>
  );
}
