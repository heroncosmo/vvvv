import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Sparkles, ArrowRight, CheckCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface UsageData {
  agentMessagesCount: number;
  limit: number;
  remaining: number;
  isLimitReached: boolean;
  hasActiveSubscription: boolean;
  planName: string | null;
}

export function UsageLimitBanner() {
  const { data: usage } = useQuery<UsageData>({
    queryKey: ["/api/usage"],
    staleTime: 30_000,
    refetchInterval: 60_000, // Check every 60s (server caches for 30s)
  });

  // Don't show if user has active paid subscription (unlimited)
  if (!usage || usage.hasActiveSubscription) {
    return null;
  }

  const percentUsed = Math.min(100, (usage.agentMessagesCount / usage.limit) * 100);
  const isWarning = percentUsed >= 60 && percentUsed < 100;
  const isCritical = usage.isLimitReached;

  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded-xl border p-5 transition-all duration-300",
        isCritical 
          ? "bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50 border-slate-200 dark:border-slate-700" 
          : isWarning 
            ? "bg-gradient-to-br from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-100 dark:border-amber-900/30"
            : "bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-100 dark:border-blue-900/30"
      )}
    >
      <div className="relative z-10 space-y-4">
        {/* Header - Clean & Professional */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "p-2 rounded-lg",
              isCritical 
                ? "bg-slate-200 dark:bg-slate-700" 
                : isWarning 
                  ? "bg-amber-100 dark:bg-amber-900/30"
                  : "bg-blue-100 dark:bg-blue-900/30"
            )}>
              <MessageSquare className={cn(
                "w-4 h-4",
                isCritical 
                  ? "text-slate-600 dark:text-slate-300" 
                  : isWarning 
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-blue-600 dark:text-blue-400"
              )} />
            </div>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {isCritical 
                ? "Prepare-se para vender" 
                : isWarning 
                  ? "Quase pronto para crescer" 
                  : "Período de avaliação"
              }
            </span>
          </div>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 px-3 py-1 rounded-full border">
            {usage.agentMessagesCount}/{usage.limit}
          </span>
        </div>

        {/* Progress bar - Softer colors */}
        <div className="space-y-1.5">
          <Progress 
            value={percentUsed} 
            className={cn(
              "h-2 rounded-full",
              isCritical 
                ? "[&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-green-500" 
                : isWarning 
                  ? "[&>div]:bg-gradient-to-r [&>div]:from-amber-400 [&>div]:to-orange-400"
                  : "[&>div]:bg-gradient-to-r [&>div]:from-blue-400 [&>div]:to-indigo-400"
            )}
          />
          <p className="text-xs text-muted-foreground text-right">
            Mensagens usadas
          </p>
        </div>

        {/* Description - Positive framing */}
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {isCritical ? (
            <>
              Você testou seu agente e viu o potencial. Desbloqueie mensagens ilimitadas para 
              <strong className="text-gray-900 dark:text-gray-100"> nunca perder uma venda</strong>.
            </>
          ) : isWarning ? (
            <>
              Restam apenas <strong>{usage.remaining}</strong> mensagens. 
              Garanta seu plano antes de ficar sem atendimento automático.
            </>
          ) : (
            <>
              Você tem <strong>{usage.remaining}</strong> mensagens para testar. 
              Aproveite para conhecer o poder do seu agente IA.
            </>
          )}
        </p>

        {/* Benefits Mini List - Only when critical */}
        {isCritical && (
          <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              Mensagens ilimitadas
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              Suporte prioritário
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              Cancele quando quiser
            </span>
          </div>
        )}

        {/* CTA Button - Professional green gradient */}
        <a
          href="/plans"
          className={cn(
            "inline-flex items-center justify-center gap-2 w-full py-3.5 px-4 rounded-lg font-semibold text-white transition-all duration-200 hover:shadow-lg",
            isCritical
              ? "bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700"
              : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
          )}
        >
          <Sparkles className="w-4 h-4" />
          {isCritical 
            ? "Ativar Plano Ilimitado" 
            : "Ver Planos"
          }
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

// Banner fixo no topo da tela quando limite esgotado - Design Profissional
export function LimitReachedTopBanner() {
  const { data: usage } = useQuery<UsageData>({
    queryKey: ["/api/usage"],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Only show if limit is reached and no active subscription
  if (!usage || usage.hasActiveSubscription || !usage.isLimitReached) {
    return null;
  }

  return (
    <div className="sticky top-0 z-[90] bg-gradient-to-r from-slate-800 to-slate-900 text-white py-2.5 px-4 shadow-lg border-b border-slate-700/50">
      <div className="container max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-amber-500/20 text-amber-200 px-2.5 py-1 rounded-full text-xs font-medium">
            <MessageSquare className="w-3.5 h-3.5" />
            {usage.agentMessagesCount}/{usage.limit}
          </div>
          <span className="text-sm text-slate-200">
            Período de teste finalizado · <span className="text-white font-medium">Ative seu plano para continuar vendendo</span>
          </span>
        </div>
        <a
          href="/plans"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white px-4 py-1.5 rounded-lg font-medium text-sm transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Ativar Plano
        </a>
      </div>
    </div>
  );
}
