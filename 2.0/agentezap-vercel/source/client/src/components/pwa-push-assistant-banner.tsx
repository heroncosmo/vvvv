import { useEffect, useMemo, useState } from "react";
import { BellRing, ChevronRight, ShieldAlert, X } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { buildPublicAppUrl } from "@/lib/native-runtime";
import { isStandaloneDisplayMode, supportsWebPush } from "@/lib/pwa";

const DISMISSED_KEY = "pwa-push-assistant-dismissed";
const LS_PUSH_KEY = "notif_push_enabled";

function readStoredPushEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(LS_PUSH_KEY) === "true";
  } catch {
    return false;
  }
}

export function PwaPushAssistantBanner() {
  const [location, setLocation] = useLocation();
  const [pushEnabled, setPushEnabled] = useState(readStoredPushEnabled);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return window.sessionStorage.getItem(DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const sync = () => setPushEnabled(readStoredPushEnabled());
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const permission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  const isStandalone = isStandaloneDisplayMode();
  const canShow = supportsWebPush() && isStandalone && !dismissed && (permission !== "granted" || !pushEnabled);

  const content = useMemo(() => {
    if (permission === "denied") {
      return {
        title: "Permita as notificacoes do app",
        icon: ShieldAlert,
      };
    }

    if (!pushEnabled) {
      return {
        title: "Permita as notificacoes do app",
        icon: BellRing,
      };
    }

    return {
      title: "Permita as notificacoes do app",
      icon: BellRing,
    };
  }, [permission, pushEnabled]);

  if (!canShow || location.startsWith("/settings")) {
    return null;
  }

  const Icon = content.icon;

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(DISMISSED_KEY, "true");
      } catch {
        // ignorar
      }
    }
    setDismissed(true);
  };

  const handleOpenSettings = () => {
    if (typeof window !== "undefined") {
      const externalUrl = buildPublicAppUrl("/settings#notificacoes");
      const openedWindow = window.open(externalUrl, "_blank", "noopener,noreferrer");
      if (openedWindow) {
        return;
      }
    }

    setLocation("/settings#notificacoes");
  };

  return (
    <div className="fixed inset-x-0 top-20 z-[81] flex justify-center px-4">
      <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-amber-200 bg-white/96 px-4 py-3 shadow-xl backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{content.title}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" className="gap-2" onClick={handleOpenSettings}>
            Abrir no navegador
            <ChevronRight className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Fechar aviso de ativacao de notificacoes"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
