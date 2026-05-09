import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { useAuth } from "@/hooks/useAuth";
import { isStandaloneDisplayMode } from "@/lib/pwa";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_PATH_KEY = "pwa-install-dismissed-path";

export function PwaInstallPrompt() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(isStandaloneDisplayMode);
  const [dismissedPath, setDismissedPath] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem(DISMISSED_PATH_KEY) || "";
  });

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setPromptEvent(null);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(DISMISSED_PATH_KEY);
      }
      setDismissedPath("");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!dismissedPath) return;
    if (dismissedPath === location) return;

    window.sessionStorage.removeItem(DISMISSED_PATH_KEY);
    setDismissedPath("");
  }, [dismissedPath, location]);

  if (!isAuthenticated || isLoading || !promptEvent || isInstalled || dismissedPath === location) {
    return null;
  }

  const handleInstall = async () => {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") {
      setPromptEvent(null);
    }
  };

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(DISMISSED_PATH_KEY, location);
    }
    setDismissedPath(location);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-emerald-200 bg-white/96 px-4 py-3 shadow-2xl backdrop-blur dark:border-emerald-900 dark:bg-slate-950/92">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <BrandMark className="h-10 w-10 shrink-0 rounded-xl" iconClassName="h-5 w-5" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Instalar AgenteZap</p>
            <p className="truncate text-xs text-muted-foreground">
              Abra como aplicativo e receba as atualizacoes do servidor automaticamente.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="hidden text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Agora nao
          </button>
          <Button className="shrink-0 gap-2" onClick={handleInstall}>
            <Download className="h-4 w-4" />
            Instalar
          </Button>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-200 text-muted-foreground transition-colors hover:text-foreground dark:border-emerald-900"
            aria-label="Fechar aviso de instalacao"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
