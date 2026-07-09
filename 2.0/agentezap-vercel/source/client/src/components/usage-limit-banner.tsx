import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface FreeQueueData {
  active?: boolean;
  mode?: string;
  simulated?: boolean;
  hasRealCountdown?: boolean;
  executeAt?: string | null;
  remainingSeconds?: number | null;
  status?: string | null;
  message?: string | null;
  priorityBoostsUsed?: number;
  priorityBoostsLimit?: number;
  priorityBoostsRemaining?: number;
}

interface UsageData {
  agentMessagesCount: number;
  limit: number;
  remaining: number;
  isLimitReached: boolean;
  hasActiveSubscription: boolean;
  planName: string | null;
  shouldShowFreeNotice?: boolean;
  isEconomyMode?: boolean;
  economyModeMessage?: string | null;
  plusPriceLabel?: string | null;
  priorityMode?: string;
  priorityBoostsUsed?: number;
  priorityBoostsLimit?: number;
  priorityBoostsRemaining?: number;
  priorityClientsUsed?: number;
  priorityClientsLimit?: number;
  priorityClientsRemaining?: number;
  freeQueue?: FreeQueueData | null;
  freeQueueActive?: boolean;
  freeQueueExecuteAt?: string | null;
  freeQueueRemainingSeconds?: number | null;
  freeQueueHasRealCountdown?: boolean;
  freeQueueMessage?: string | null;
}

const DEFAULT_ECONOMY_MESSAGE =
  "Acabaram suas respostas prioritárias. Seu agente agora está em Modo Econômico: ele ainda responde, mas sem prioridade e com respostas mais lentas. Assine para voltar ao modo rápido.";

function getQueueExecuteAt(usage?: UsageData | null) {
  return usage?.freeQueue?.executeAt || usage?.freeQueueExecuteAt || null;
}

function useLiveQueueCountdown(executeAt?: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!executeAt) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [executeAt]);

  if (!executeAt) {
    return null;
  }

  const targetTime = new Date(executeAt).getTime();
  if (!Number.isFinite(targetTime)) {
    return null;
  }

  return Math.max(0, Math.ceil((targetTime - now) / 1000));
}

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function getFreeNoticeMessage(usage: UsageData) {
  if (usage.isEconomyMode || usage.isLimitReached || usage.freeQueue?.active || usage.freeQueueActive) {
    return usage.freeQueue?.message || usage.freeQueueMessage || usage.economyModeMessage || DEFAULT_ECONOMY_MESSAGE;
  }

  return DEFAULT_ECONOMY_MESSAGE;
}

function shouldRenderFreeNotice(usage?: UsageData | null) {
  const isEconomyQueueActive = Boolean(usage?.freeQueue?.active || usage?.freeQueueActive);
  return Boolean(
    usage &&
      !usage.hasActiveSubscription &&
      (usage.isEconomyMode || usage.isLimitReached || isEconomyQueueActive),
  );
}

function getBoostStats(usage: UsageData) {
  const used = usage.priorityBoostsUsed ?? usage.priorityClientsUsed ?? Math.max(0, usage.limit - usage.remaining);
  const limit = usage.priorityBoostsLimit ?? usage.priorityClientsLimit ?? usage.limit;
  const remaining = usage.priorityBoostsRemaining ?? usage.priorityClientsRemaining ?? usage.remaining;
  return {
    used: Math.max(0, Number(used || 0)),
    limit: Number(limit || 0),
    remaining: Math.max(0, Number(remaining || 0)),
  };
}

function QueueCountdown({
  usage,
  seconds,
  compact = false,
}: {
  usage: UsageData;
  seconds: number | null;
  compact?: boolean;
}) {
  const isEconomyMode = Boolean(usage.isEconomyMode || usage.isLimitReached || usage.freeQueue?.active || usage.freeQueueActive);
  if (!isEconomyMode) {
    return null;
  }

  const hasRealCountdown = Boolean(usage.freeQueue?.hasRealCountdown || usage.freeQueueHasRealCountdown || getQueueExecuteAt(usage));

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium",
        compact ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        "border-amber-300/70 bg-amber-100/70 text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-100",
      )}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {hasRealCountdown && seconds !== null
        ? `Próxima resposta em ${formatCountdown(seconds)}`
        : "Modo Econômico ativo"}
    </span>
  );
}

export function UsageLimitBanner() {
  const { data: usage } = useQuery<UsageData>({
    queryKey: ["/api/usage"],
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  const liveQueueSeconds = useLiveQueueCountdown(getQueueExecuteAt(usage));

  if (!shouldRenderFreeNotice(usage)) {
    return null;
  }

  const boostStats = getBoostStats(usage);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-4 transition-all duration-300",
        "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-50",
      )}
    >
      <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
            )}
          >
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">Modo Econômico ativo</p>
              <QueueCountdown usage={usage} seconds={liveQueueSeconds} />
            </div>
            <p className="mt-1 text-sm leading-5 opacity-80">{getFreeNoticeMessage(usage)}</p>
            {boostStats.limit > 0 ? (
              <p className="mt-1 text-xs opacity-70">
                Respostas rápidas hoje: {Math.min(boostStats.used, boostStats.limit)}/{boostStats.limit}.{" "}
                {boostStats.remaining > 0 ? `${boostStats.remaining} ainda com prioridade.` : "As próximas entram no Modo Econômico."}
              </p>
            ) : null}
          </div>
        </div>

        <a
          href="/plans"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          <Sparkles className="h-4 w-4" />
          Assinar Plus
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

export function LimitReachedTopBanner() {
  const { data: usage } = useQuery<UsageData>({
    queryKey: ["/api/usage"],
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  const liveQueueSeconds = useLiveQueueCountdown(getQueueExecuteAt(usage));

  if (!shouldRenderFreeNotice(usage)) {
    return null;
  }

  return (
    <div className="sticky top-0 z-[90] border-b border-slate-200 bg-white/95 px-4 py-2.5 text-slate-900 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 dark:text-white">
      <div className="container mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium",
              "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
            )}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Modo Econômico
          </div>
          <QueueCountdown usage={usage} seconds={liveQueueSeconds} compact />
          <span className="truncate text-sm text-slate-700 dark:text-slate-200">
            {getFreeNoticeMessage(usage)}
          </span>
        </div>
        <a
          href="/plans"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-950 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Assinar Plus
        </a>
      </div>
    </div>
  );
}
