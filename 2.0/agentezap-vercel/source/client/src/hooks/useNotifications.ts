/**
 * useNotifications - notificacoes locais + push em PWA
 *
 * - Toca som em novas mensagens
 * - Sincroniza assinatura de web push com o backend
 * - Evita notificacao local duplicada quando o push remoto ja cobre a aba em background
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getAuthToken } from "@/lib/supabase";
import {
  ensurePushSubscription,
  getPushSubscription,
  isStandaloneDisplayMode,
  removePushSubscription,
  showRuntimeNotification,
  supportsWebPush,
} from "@/lib/pwa";
import { isNativeApp } from "@/lib/native-runtime";

const LS_SOUND_KEY = "notif_sound_enabled";
const LS_PUSH_KEY = "notif_push_enabled";
const SOUND_DEBOUNCE_MS = 3000;
const PUSH_THROTTLE_MS = 5000;
const PUSH_RESYNC_INTERVAL_MS = 5 * 60 * 1000;
let sharedAudioContext: AudioContext | null = null;
let nativePushListenersBound = false;

function resolveAudioContext() {
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContextCtor();
  }

  return sharedAudioContext;
}

async function playBeepSound(volume = 0.4) {
  try {
    const ctx = resolveAudioContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.35);
    oscillator.onended = () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };
    return true;
  } catch (err) {
    console.warn("[Notif] Erro ao tocar som:", err);
    return false;
  }
}

export interface NotificationPrefs {
  soundEnabled: boolean;
  pushEnabled: boolean;
  pushPermission: NotificationPermission | "unsupported";
}

export type PushHealthStatus =
  | "disabled"
  | "unsupported"
  | "permission-default"
  | "permission-denied"
  | "checking"
  | "healthy"
  | "repaired"
  | "missing-local"
  | "missing-remote"
  | "error";

export interface PushHealthState {
  status: PushHealthStatus;
  summary: string;
  detail: string | null;
  needsAttention: boolean;
  canRepair: boolean;
  localSubscription: boolean;
  remoteSubscription: boolean;
  remoteDeviceLabel: string | null;
  remoteLastSeenAt: string | null;
  totalActiveSubscriptions: number;
  checkedAt: number | null;
}

export interface UseNotificationsReturn extends NotificationPrefs {
  setSoundEnabled: (v: boolean) => void;
  enableSound: () => Promise<boolean>;
  setPushEnabled: (v: boolean) => Promise<void>;
  requestPushPermission: () => Promise<NotificationPermission | "unsupported">;
  pushHealth: PushHealthState;
  pushHealthBusy: boolean;
  refreshPushHealth: (options?: RefreshPushHealthOptions) => Promise<PushHealthState>;
  repairPushSubscription: () => Promise<PushHealthState>;
  notify: (opts: NotifyOptions) => void;
}

export interface NotifyOptions {
  title: string;
  body?: string;
  tag?: string;
  icon?: string;
  url?: string;
  playSound?: boolean;
}

export type RefreshPushHealthOptions = {
  assumePushEnabled?: boolean;
};

function readBool(key: string, defaultVal: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultVal;
    return raw === "true";
  } catch {
    return defaultVal;
  }
}

function writeBool(key: string, val: boolean) {
  try {
    localStorage.setItem(key, val ? "true" : "false");
  } catch {
    // ignorar
  }
}

function mapNativePushPermission(permission: string | undefined): NotificationPermission {
  if (permission === "granted" || permission === "denied") {
    return permission;
  }

  return "default";
}

async function getNativePushNotifications() {
  if (!isNativeApp()) {
    return null;
  }

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    return PushNotifications;
  } catch (error) {
    console.warn("[Notif] Plugin nativo de push indisponivel:", error);
    return null;
  }
}

async function getCurrentPushPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined") {
    return "unsupported";
  }

  if (isNativeApp()) {
    const PushNotifications = await getNativePushNotifications();
    if (!PushNotifications) {
      return "unsupported";
    }

    try {
      const status = await PushNotifications.checkPermissions();
      return mapNativePushPermission(status.receive);
    } catch (error) {
      console.warn("[Notif] Falha ao consultar permissao nativa:", error);
      return "unsupported";
    }
  }

  if (!supportsWebPush()) {
    return "unsupported";
  }

  return Notification.permission;
}

function buildDeviceLabel() {
  const platform = (navigator as any)?.userAgentData?.platform || navigator.platform || "Dispositivo";
  const mode = isNativeApp() ? "App" : isStandaloneDisplayMode() ? "PWA" : "Web";
  return `${mode} - ${platform}`;
}

function createNativePushHealthState(status: "healthy" | "repaired"): PushHealthState {
  return createPushHealthState(status, {
    summary:
      status === "repaired"
        ? "As notificacoes do app foram liberadas neste celular."
        : "As notificacoes do app estao liberadas neste celular.",
    detail: "A permissao nativa do Android/iOS esta ativa para o AgenteZap.",
    checkedAt: Date.now(),
    localSubscription: true,
    remoteSubscription: true,
    remoteDeviceLabel: buildDeviceLabel(),
    remoteLastSeenAt: null,
    totalActiveSubscriptions: 1,
  });
}

async function ensureNativePushRegistered() {
  const PushNotifications = await getNativePushNotifications();
  if (!PushNotifications) {
    throw new Error("Plugin nativo de notificacoes indisponivel neste app.");
  }

  if (!nativePushListenersBound) {
    nativePushListenersBound = true;
    try {
      await PushNotifications.addListener("registration", (token) => {
        console.info("[Notif] Push nativo registrado:", token.value ? "token recebido" : "sem token");
      });
      await PushNotifications.addListener("registrationError", (error) => {
        console.warn("[Notif] Falha no registro nativo de push:", error.error);
      });
    } catch (error) {
      console.warn("[Notif] Falha ao preparar listeners nativos de push:", error);
    }
  }

  try {
    await PushNotifications.createChannel({
      id: "agentezap-messages",
      name: "AgenteZap",
      description: "Alertas de novas mensagens do AgenteZap",
      importance: 4,
      visibility: 1,
      lights: true,
      vibration: true,
    });
  } catch {
    // createChannel existe apenas no Android e pode falhar em builds antigos.
  }

  await PushNotifications.register();
}

function createPushHealthState(
  status: PushHealthStatus,
  overrides: Partial<Omit<PushHealthState, "status">> = {},
): PushHealthState {
  const defaultsByStatus: Record<PushHealthStatus, Omit<PushHealthState, "status">> = {
    disabled: {
      summary: "Push desligado neste aparelho.",
      detail: "Ative o push do navegador para registrar este dispositivo.",
      needsAttention: false,
      canRepair: false,
      localSubscription: false,
      remoteSubscription: false,
      remoteDeviceLabel: null,
      remoteLastSeenAt: null,
      totalActiveSubscriptions: 0,
      checkedAt: null,
    },
    unsupported: {
      summary: "Este navegador nao suporta notificacoes push.",
      detail: "Use um navegador compativel com service worker e Push API.",
      needsAttention: true,
      canRepair: false,
      localSubscription: false,
      remoteSubscription: false,
      remoteDeviceLabel: null,
      remoteLastSeenAt: null,
      totalActiveSubscriptions: 0,
      checkedAt: null,
    },
    "permission-default": {
      summary: "Permissao de notificacao ainda nao concedida.",
      detail: "Libere a permissao do navegador para registrar este aparelho.",
      needsAttention: true,
      canRepair: false,
      localSubscription: false,
      remoteSubscription: false,
      remoteDeviceLabel: null,
      remoteLastSeenAt: null,
      totalActiveSubscriptions: 0,
      checkedAt: null,
    },
    "permission-denied": {
      summary: "Permissao de notificacao negada neste aparelho.",
      detail: "Reative a permissao nas configuracoes do navegador e do sistema.",
      needsAttention: true,
      canRepair: false,
      localSubscription: false,
      remoteSubscription: false,
      remoteDeviceLabel: null,
      remoteLastSeenAt: null,
      totalActiveSubscriptions: 0,
      checkedAt: null,
    },
    checking: {
      summary: "Verificando a inscricao push deste aparelho...",
      detail: "Confirmando a assinatura local e o registro remoto no servidor.",
      needsAttention: false,
      canRepair: false,
      localSubscription: false,
      remoteSubscription: false,
      remoteDeviceLabel: null,
      remoteLastSeenAt: null,
      totalActiveSubscriptions: 0,
      checkedAt: null,
    },
    healthy: {
      summary: "Este aparelho esta inscrito corretamente para push.",
      detail: "A assinatura local existe e o servidor reconhece este dispositivo.",
      needsAttention: false,
      canRepair: true,
      localSubscription: true,
      remoteSubscription: true,
      remoteDeviceLabel: null,
      remoteLastSeenAt: null,
      totalActiveSubscriptions: 0,
      checkedAt: null,
    },
    repaired: {
      summary: "A inscricao push deste aparelho foi reparada agora.",
      detail: "Faca um teste para confirmar o alerta com a tela bloqueada.",
      needsAttention: false,
      canRepair: true,
      localSubscription: true,
      remoteSubscription: true,
      remoteDeviceLabel: null,
      remoteLastSeenAt: null,
      totalActiveSubscriptions: 0,
      checkedAt: null,
    },
    "missing-local": {
      summary: "Este aparelho esta sem inscricao push local.",
      detail: "O navegador nao retornou uma assinatura ativa para este dispositivo.",
      needsAttention: true,
      canRepair: true,
      localSubscription: false,
      remoteSubscription: false,
      remoteDeviceLabel: null,
      remoteLastSeenAt: null,
      totalActiveSubscriptions: 0,
      checkedAt: null,
    },
    "missing-remote": {
      summary: "Este aparelho nao esta registrado no servidor para push.",
      detail: "A assinatura local existe, mas o backend nao encontrou o endpoint atual no banco.",
      needsAttention: true,
      canRepair: true,
      localSubscription: true,
      remoteSubscription: false,
      remoteDeviceLabel: null,
      remoteLastSeenAt: null,
      totalActiveSubscriptions: 0,
      checkedAt: null,
    },
    error: {
      summary: "Nao foi possivel validar a inscricao push deste aparelho.",
      detail: "Confira a conexao e tente verificar novamente.",
      needsAttention: true,
      canRepair: true,
      localSubscription: false,
      remoteSubscription: false,
      remoteDeviceLabel: null,
      remoteLastSeenAt: null,
      totalActiveSubscriptions: 0,
      checkedAt: null,
    },
  };

  return {
    status,
    ...defaultsByStatus[status],
    ...overrides,
  };
}

type RemotePushStatusResponse = {
  totalSubscriptions: number;
  totalActiveSubscriptions: number;
  currentEndpointRegistered: boolean;
  currentEndpointActive: boolean;
  currentDeviceLabel: string | null;
  currentUserAgent: string | null;
  currentLastSeenAt: string | null;
};

async function fetchWithPushAuth(url: string, options: RequestInit = {}) {
  const memberToken =
    typeof window !== "undefined" ? window.localStorage.getItem("memberToken") : null;
  const token = memberToken || await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    credentials: "include",
    headers,
  });
}

export function useNotifications(): UseNotificationsReturn {
  const [soundEnabled, setSoundEnabledState] = useState(() => readBool(LS_SOUND_KEY, true));
  const [pushEnabled, setPushEnabledState] = useState(() => readBool(LS_PUSH_KEY, false));
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(
    () => (isNativeApp() ? "default" : typeof window !== "undefined" && supportsWebPush() ? Notification.permission : "unsupported"),
  );
  const [remotePushReady, setRemotePushReady] = useState(false);
  const [pushHealth, setPushHealth] = useState<PushHealthState>(() => createPushHealthState("disabled"));
  const [pushHealthBusy, setPushHealthBusy] = useState(false);
  const lastSoundAt = useRef<number>(0);
  const lastPushAt = useRef<number>(0);

  const syncCurrentPushPermission = useCallback(async (): Promise<NotificationPermission | "unsupported"> => {
    const currentPermission = await getCurrentPushPermission();
    setPushPermission(currentPermission);
    return currentPermission;
  }, []);

  useEffect(() => {
    const sync = () => {
      void syncCurrentPushPermission();
    };

    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [syncCurrentPushPermission]);

  const requestPushPermission = useCallback(async (): Promise<NotificationPermission | "unsupported"> => {
    const currentPermission = await syncCurrentPushPermission();
    if (currentPermission === "unsupported") return "unsupported";
    if (currentPermission === "granted") {
      setPushPermission("granted");
      return "granted";
    }

    try {
      if (isNativeApp()) {
        const PushNotifications = await getNativePushNotifications();
        if (!PushNotifications) {
          setPushPermission("unsupported");
          return "unsupported";
        }

        const result = await PushNotifications.requestPermissions();
        const mappedResult = mapNativePushPermission(result.receive);
        setPushPermission(mappedResult);
        if (mappedResult === "granted") {
          await ensureNativePushRegistered();
        }
        return mappedResult;
      }

      const result = await Notification.requestPermission();
      setPushPermission(result);
      return result;
    } catch (err) {
      console.warn("[Notif] requestPermission error:", err);
      setPushPermission("denied");
      return "denied";
    }
  }, [syncCurrentPushPermission]);

  const syncRemotePushSubscription = useCallback(async () => {
    if (isNativeApp()) {
      await ensureNativePushRegistered();
      setRemotePushReady(true);
      return null;
    }

    if (!supportsWebPush()) {
      setRemotePushReady(false);
      return null;
    }

    const keyResponse = await fetch("/api/pwa/vapid-public-key", { credentials: "include" });
    if (!keyResponse.ok) {
      throw new Error("Falha ao obter chave publica do PWA");
    }

    const { publicKey } = await keyResponse.json();
    if (!publicKey) {
      throw new Error("Chave publica do PWA ausente");
    }

    const subscription = await ensurePushSubscription(publicKey);
    const subscriptionJson = subscription.toJSON();
    const response = await fetchWithPushAuth("/api/pwa/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        subscription: subscriptionJson,
        deviceLabel: buildDeviceLabel(),
      }),
    });
    if (!response.ok) {
      throw new Error("Falha ao registrar dispositivo para push");
    }

    setRemotePushReady(true);
    return subscription;
  }, []);

  const fetchRemotePushStatus = useCallback(async (endpoint: string | null) => {
    const response = await fetchWithPushAuth("/api/pwa/subscriptions/status", {
      method: "POST",
      body: JSON.stringify({
        endpoint,
      }),
    });

    if (!response.ok) {
      throw new Error("Falha ao validar o endpoint atual no servidor");
    }

    return (await response.json()) as RemotePushStatusResponse;
  }, []);

  const disableRemotePushSubscription = useCallback(async () => {
    try {
      if (isNativeApp()) {
        const PushNotifications = await getNativePushNotifications();
        await PushNotifications?.unregister();
        return;
      }

      const endpoint = await removePushSubscription();
      const response = await fetchWithPushAuth("/api/pwa/subscriptions", {
        method: "DELETE",
        body: JSON.stringify({ endpoint }),
      });
      if (!response.ok) {
        throw new Error("Falha ao remover registro remoto do push");
      }
    } catch (error) {
      console.warn("[Notif] Falha ao remover push remoto:", error);
    } finally {
      setRemotePushReady(false);
    }
  }, []);

  const refreshPushHealth = useCallback(async (options: RefreshPushHealthOptions = {}): Promise<PushHealthState> => {
    const currentPermission = await syncCurrentPushPermission();
    const effectivePushEnabled = options.assumePushEnabled ?? readBool(LS_PUSH_KEY, pushEnabled);

    if (isNativeApp()) {
      if (!effectivePushEnabled) {
        setRemotePushReady(false);
        const nextState = createPushHealthState("disabled", { checkedAt: Date.now() });
        setPushHealth(nextState);
        return nextState;
      }

      if (currentPermission === "denied") {
        setRemotePushReady(false);
        const nextState = createPushHealthState("permission-denied", {
          checkedAt: Date.now(),
          detail: "Reative as notificacoes nas permissoes do app AgenteZap no Android/iOS.",
        });
        setPushHealth(nextState);
        return nextState;
      }

      if (currentPermission !== "granted") {
        setRemotePushReady(false);
        const nextState = createPushHealthState("permission-default", {
          checkedAt: Date.now(),
          detail: "Toque em Pedir aqui para abrir a permissao nativa deste celular.",
        });
        setPushHealth(nextState);
        return nextState;
      }

      setPushHealthBusy(true);
      try {
        await ensureNativePushRegistered();
        setRemotePushReady(true);
        const nextState = createNativePushHealthState("healthy");
        setPushHealth(nextState);
        return nextState;
      } catch (error: any) {
        setRemotePushReady(false);
        const nextState = createPushHealthState("error", {
          checkedAt: Date.now(),
          detail: error?.message || "Nao foi possivel ativar o push nativo deste aparelho.",
        });
        setPushHealth(nextState);
        return nextState;
      } finally {
        setPushHealthBusy(false);
      }
    }

    if (!supportsWebPush()) {
      setRemotePushReady(false);
      const nextState = createPushHealthState("unsupported", { checkedAt: Date.now() });
      setPushHealth(nextState);
      return nextState;
    }

    if (!effectivePushEnabled) {
      setRemotePushReady(false);
      const nextState = createPushHealthState("disabled", { checkedAt: Date.now() });
      setPushHealth(nextState);
      return nextState;
    }

    if (currentPermission === "denied") {
      setRemotePushReady(false);
      const nextState = createPushHealthState("permission-denied", { checkedAt: Date.now() });
      setPushHealth(nextState);
      return nextState;
    }

    if (currentPermission !== "granted") {
      setRemotePushReady(false);
      const nextState = createPushHealthState("permission-default", { checkedAt: Date.now() });
      setPushHealth(nextState);
      return nextState;
    }

    setPushHealthBusy(true);
    setPushHealth((current) =>
      createPushHealthState("checking", {
        totalActiveSubscriptions: current.totalActiveSubscriptions,
      }),
    );

    try {
      const localSubscription = await getPushSubscription();
      if (!localSubscription) {
        setRemotePushReady(false);
        const nextState = createPushHealthState("missing-local", {
          checkedAt: Date.now(),
        });
        setPushHealth(nextState);
        return nextState;
      }

      const remoteStatus = await fetchRemotePushStatus(localSubscription.endpoint);
      const commonState = {
        checkedAt: Date.now(),
        localSubscription: true,
        remoteSubscription:
          remoteStatus.currentEndpointRegistered && remoteStatus.currentEndpointActive,
        remoteDeviceLabel: remoteStatus.currentDeviceLabel,
        remoteLastSeenAt: remoteStatus.currentLastSeenAt,
        totalActiveSubscriptions: remoteStatus.totalActiveSubscriptions,
      };

      if (remoteStatus.currentEndpointRegistered && remoteStatus.currentEndpointActive) {
        setRemotePushReady(true);
        const nextState = createPushHealthState("healthy", commonState);
        setPushHealth(nextState);
        return nextState;
      }

      setRemotePushReady(false);
      const nextState = createPushHealthState("missing-remote", {
        ...commonState,
        detail:
          remoteStatus.totalActiveSubscriptions > 0
            ? "O servidor tem outros dispositivos ativos, mas nao encontrou o endpoint atual deste aparelho."
            : "Nenhum endpoint ativo deste usuario foi encontrado no servidor.",
      });
      setPushHealth(nextState);
      return nextState;
    } catch (error: any) {
      setRemotePushReady(false);
      const nextState = createPushHealthState("error", {
        checkedAt: Date.now(),
        detail: error?.message || "Nao foi possivel consultar o estado do push.",
      });
      setPushHealth(nextState);
      return nextState;
    } finally {
      setPushHealthBusy(false);
    }
  }, [fetchRemotePushStatus, pushEnabled, syncCurrentPushPermission]);

  const repairPushSubscription = useCallback(async (): Promise<PushHealthState> => {
    const currentPermission = await syncCurrentPushPermission();
    const effectivePushEnabled = readBool(LS_PUSH_KEY, pushEnabled);

    if (!effectivePushEnabled || currentPermission !== "granted") {
      return refreshPushHealth({ assumePushEnabled: effectivePushEnabled });
    }

    setPushHealthBusy(true);
    try {
      if (isNativeApp()) {
        await ensureNativePushRegistered();
        setRemotePushReady(true);
        const nextState = createNativePushHealthState("repaired");
        setPushHealth(nextState);
        return nextState;
      }

      const subscription = await syncRemotePushSubscription();
      const remoteStatus = await fetchRemotePushStatus(subscription?.endpoint || null);
      const repaired =
        remoteStatus.currentEndpointRegistered && remoteStatus.currentEndpointActive;
      setRemotePushReady(repaired);
      const nextState = createPushHealthState(repaired ? "repaired" : "missing-remote", {
        checkedAt: Date.now(),
        localSubscription: Boolean(subscription),
        remoteSubscription: repaired,
        remoteDeviceLabel: remoteStatus.currentDeviceLabel,
        remoteLastSeenAt: remoteStatus.currentLastSeenAt,
        totalActiveSubscriptions: remoteStatus.totalActiveSubscriptions,
      });
      setPushHealth(nextState);
      return nextState;
    } catch (error: any) {
      setRemotePushReady(false);
      const nextState = createPushHealthState("error", {
        checkedAt: Date.now(),
        detail: error?.message || "Nao foi possivel reparar o push deste aparelho.",
      });
      setPushHealth(nextState);
      return nextState;
    } finally {
      setPushHealthBusy(false);
    }
  }, [fetchRemotePushStatus, pushEnabled, refreshPushHealth, syncCurrentPushPermission, syncRemotePushSubscription]);

  useEffect(() => {
    if (!pushEnabled || pushPermission !== "granted") {
      setRemotePushReady(false);
      if (!pushEnabled) {
        setPushHealth(createPushHealthState("disabled", { checkedAt: Date.now() }));
      } else if (pushPermission === "denied") {
        setPushHealth(createPushHealthState("permission-denied", { checkedAt: Date.now() }));
      } else if (pushPermission === "unsupported") {
        setPushHealth(createPushHealthState("unsupported", { checkedAt: Date.now() }));
      } else {
        setPushHealth(createPushHealthState("permission-default", { checkedAt: Date.now() }));
      }
      return;
    }

    let cancelled = false;
    void refreshPushHealth().catch((error) => {
      if (!cancelled) {
        console.warn("[Notif] Falha ao validar saude do push:", error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pushEnabled, pushPermission, refreshPushHealth]);

  useEffect(() => {
    if (!pushEnabled || pushPermission !== "granted") {
      return;
    }

    let cancelled = false;
    const resync = () => {
      if (cancelled) {
        return;
      }

      void refreshPushHealth().catch((error) => {
        if (!cancelled) {
          console.warn("[Notif] Falha ao revalidar saude do push:", error);
        }
      });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        resync();
      }
    };

    window.addEventListener("focus", resync);
    window.addEventListener("online", resync);
    document.addEventListener("visibilitychange", handleVisibility);
    const intervalId = window.setInterval(resync, PUSH_RESYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", resync);
      window.removeEventListener("online", resync);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(intervalId);
    };
  }, [pushEnabled, pushPermission, refreshPushHealth]);

  const setSoundEnabled = useCallback((v: boolean) => {
    setSoundEnabledState(v);
    writeBool(LS_SOUND_KEY, v);
  }, []);

  const enableSound = useCallback(async () => {
    setSoundEnabledState(true);
    writeBool(LS_SOUND_KEY, true);
    return playBeepSound();
  }, []);

  const setPushEnabled = useCallback(
    async (v: boolean) => {
      if (!v) {
        setPushEnabledState(false);
        writeBool(LS_PUSH_KEY, false);
        await disableRemotePushSubscription();
        return;
      }

      const currentPermission = await syncCurrentPushPermission();
      if (currentPermission === "unsupported") {
        return;
      }

      let effectivePermission = currentPermission;
      if (effectivePermission === "default") {
        effectivePermission = await requestPushPermission();
      }

      if (effectivePermission !== "granted") {
        setPushEnabledState(false);
        writeBool(LS_PUSH_KEY, false);
        return;
      }

      await syncRemotePushSubscription();
      setPushEnabledState(true);
      writeBool(LS_PUSH_KEY, true);
      await refreshPushHealth({ assumePushEnabled: true });
    },
    [
      disableRemotePushSubscription,
      refreshPushHealth,
      requestPushPermission,
      syncCurrentPushPermission,
      syncRemotePushSubscription,
    ],
  );

  const notify = useCallback(
    (opts: NotifyOptions) => {
      const now = Date.now();
      const { title, body, tag, icon, url, playSound = true } = opts;

      if (soundEnabled && playSound && now - lastSoundAt.current >= SOUND_DEBOUNCE_MS) {
        lastSoundAt.current = now;
        void playBeepSound();
      }

      const shouldShowLocalPush =
        pushEnabled &&
        pushPermission === "granted" &&
        typeof Notification !== "undefined" &&
        now - lastPushAt.current >= PUSH_THROTTLE_MS &&
        (!remotePushReady || document.visibilityState === "visible");

      if (!shouldShowLocalPush) {
        return;
      }

      lastPushAt.current = now;
      void showRuntimeNotification({
        title,
        body,
        tag,
        icon,
        url,
        silent: true,
        renotify: true,
        vibrate: [140, 70, 140],
        timestamp: now,
      }).catch((err) => {
        console.warn("[Notif] Erro ao criar Notification:", err);
      });
    },
    [pushEnabled, pushPermission, remotePushReady, soundEnabled],
  );

  return {
    soundEnabled,
    pushEnabled,
    pushPermission,
    pushHealth,
    pushHealthBusy,
    setSoundEnabled,
    enableSound,
    setPushEnabled,
    requestPushPermission,
    refreshPushHealth,
    repairPushSubscription,
    notify,
  };
}
