import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { PWA_UPDATE_AVAILABLE_EVENT } from "@/lib/pwa";

type PwaUpdateEventDetail = {
  version?: string;
  source?: string;
  phase?: "detected" | "updating" | "failed";
};

export function PwaUpdateBanner() {
  const [state, setState] = useState<{
    version: string;
    phase: "updating" | "failed";
  } | null>(null);

  useEffect(() => {
    const handleUpdateAvailable = (event: Event) => {
      const detail = (event as CustomEvent<PwaUpdateEventDetail>).detail || {};
      const nextVersion = typeof detail.version === "string" ? detail.version : "";
      if (!nextVersion) {
        return;
      }

      setState({
        version: nextVersion,
        phase: detail.phase === "failed" ? "failed" : "updating",
      });
    };

    window.addEventListener(PWA_UPDATE_AVAILABLE_EVENT, handleUpdateAvailable as EventListener);
    return () => {
      window.removeEventListener(PWA_UPDATE_AVAILABLE_EVENT, handleUpdateAvailable as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!state || state.phase !== "failed") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setState(null);
    }, 9000);
    return () => window.clearTimeout(timeoutId);
  }, [state]);

  if (!state) {
    return null;
  }

  const isFailed = state.phase === "failed";
  const Icon = isFailed ? AlertCircle : Loader2;

  return (
    <div className="fixed inset-x-0 top-4 z-[81] flex justify-center px-4">
      <div className="flex w-full max-w-xl items-center gap-3 rounded-lg border border-emerald-200 bg-white/96 px-4 py-3 shadow-xl backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Icon className={`h-5 w-5 ${isFailed ? "" : "animate-spin"}`} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {isFailed ? "Atualizacao sera retomada" : "Atualizando sistema"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {isFailed
                ? "O app tenta novamente quando voce voltar ou reabrir a pagina."
                : "A nova versao esta sendo aplicada automaticamente."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
