import { useEffect, useState } from "react";
import { RefreshCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PWA_UPDATE_AVAILABLE_EVENT } from "@/lib/pwa";

type PwaUpdateEventDetail = {
  version?: string;
  source?: string;
};

export function PwaUpdateBanner() {
  const [publishedVersion, setPublishedVersion] = useState("");
  const [dismissedVersion, setDismissedVersion] = useState("");

  useEffect(() => {
    const handleUpdateAvailable = (event: Event) => {
      const detail = (event as CustomEvent<PwaUpdateEventDetail>).detail || {};
      const nextVersion = typeof detail.version === "string" ? detail.version : "";
      if (!nextVersion) {
        return;
      }

      setPublishedVersion(nextVersion);
      setDismissedVersion("");
    };

    window.addEventListener(PWA_UPDATE_AVAILABLE_EVENT, handleUpdateAvailable as EventListener);
    return () => {
      window.removeEventListener(PWA_UPDATE_AVAILABLE_EVENT, handleUpdateAvailable as EventListener);
    };
  }, []);

  if (!publishedVersion || dismissedVersion === publishedVersion) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-4 z-[81] flex justify-center px-4">
      <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-emerald-200 bg-white/96 px-4 py-3 shadow-2xl backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <RefreshCcw className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Nova versao pronta</p>
            <p className="truncate text-xs text-muted-foreground">
              Atualize o app para aplicar a nova build e reforcar o push no celular.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            className="h-9 rounded-xl px-4"
            onClick={() => window.location.reload()}
          >
            Atualizar agora
          </Button>
          <button
            type="button"
            onClick={() => setDismissedVersion(publishedVersion)}
            className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Fechar aviso de atualização"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
