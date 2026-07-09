import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock3, Lock, ShieldCheck, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  extractSubscriptionActionLabel,
  getSubscriptionGateModule,
  isSubscriptionGatedActionTarget,
  type AccessStatusGateData,
  type AssignedPlanResponse,
  type SubscriptionGateModule,
  type UsageGateData,
} from "@/lib/subscription-gate";

export interface SubscriptionUpgradeDialogOverride {
  title?: string;
  description?: string;
  benefit?: string;
}

interface SubscriptionActionGateContextValue {
  isActionGateEnabled: boolean;
  hasActiveSubscription: boolean;
  currentModule: SubscriptionGateModule | null;
  requestUpgrade: (override?: SubscriptionUpgradeDialogOverride) => void;
}

const SubscriptionActionGateContext = createContext<SubscriptionActionGateContextValue>({
  isActionGateEnabled: false,
  hasActiveSubscription: true,
  currentModule: null,
  requestUpgrade: () => undefined,
});

function resolvePlanName(plan?: AssignedPlanResponse["plan"]) {
  return plan?.nome || "Plus";
}

function resolveActionLabel(target: HTMLElement | null): string | null {
  const actionLabel = extractSubscriptionActionLabel(target);
  return actionLabel.startsWith("continuar com esta") ? null : actionLabel;
}

function getModuleBannerDismissKey(moduleId: string) {
  return `subscription_action_gate_banner_closed:${moduleId}`;
}

interface SubscriptionUpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  moduleConfig: SubscriptionGateModule | null;
  planName: string;
  actionLabel?: string | null;
  override?: SubscriptionUpgradeDialogOverride | null;
}

export function SubscriptionUpgradeDialog({
  open,
  onClose,
  moduleConfig,
  planName,
  actionLabel,
  override,
}: SubscriptionUpgradeDialogProps) {
  const [, setLocation] = useLocation();
  if (!open || !moduleConfig) {
    return null;
  }

  const title = override?.title || `${moduleConfig.title} faz parte do ${planName || "Plus"}`;
  const description =
    override?.description ||
    "O agente continua respondendo normalmente no Modo Econômico, com respostas lentas no plano grátis. Ative o Plus para liberar todas as ferramentas e respostas prioritárias rápidas.";

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[1px]"
      data-subscription-gate-ignore="true"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          onClick={onClose}
          data-subscription-gate-ignore="true"
          aria-label="Fechar aviso de assinatura"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-8">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            <Lock className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <Badge className="mb-2 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Plano Plus
            </Badge>
            <h3 className="text-lg font-semibold leading-tight text-slate-950 dark:text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-2">
          <Button
            className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => setLocation("/plans")}
            data-subscription-gate-ignore="true"
          >
            Assinar Plus
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={onClose}
            data-subscription-gate-ignore="true"
          >
            Continuar no plano grátis
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SubscriptionActionGateProps {
  children: ReactNode;
}

export function SubscriptionActionGate({ children }: SubscriptionActionGateProps) {
  const [location, setLocation] = useLocation();
  const [dialogState, setDialogState] = useState<{
    actionLabel: string | null;
    override: SubscriptionUpgradeDialogOverride | null;
  }>({
    actionLabel: null,
    override: null,
  });
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const currentModule = useMemo(() => getSubscriptionGateModule(location), [location]);
  const { data: usage } = useQuery<UsageGateData>({
    queryKey: ["/api/usage"],
  });
  const { data: accessStatus } = useQuery<AccessStatusGateData>({
    queryKey: ["/api/access-status"],
    enabled: Boolean(currentModule),
  });
  const { data: assignedPlanData } = useQuery<AssignedPlanResponse>({
    queryKey: ["/api/user/assigned-plan"],
    enabled: Boolean(currentModule),
  });

  const accessStatusLoaded = accessStatus !== undefined;
  const subscriptionGateDataReady = accessStatusLoaded;
  const hasKnownActiveSubscription =
    usage?.hasActiveSubscription === true ||
    accessStatus?.hasActiveSubscription === true ||
    accessStatus?.accessStatus === "active" ||
    accessStatus?.planTier === "plus" ||
    accessStatus?.priorityMode === "plus";

  const isActionGateEnabled =
    Boolean(currentModule) &&
    subscriptionGateDataReady &&
    !hasKnownActiveSubscription &&
    accessStatus?.shouldBlock !== true;

  useEffect(() => {
    if (isActionGateEnabled || (!dialogState.actionLabel && !dialogState.override)) {
      return;
    }

    setDialogState({
      actionLabel: null,
      override: null,
    });
  }, [dialogState.actionLabel, dialogState.override, isActionGateEnabled]);

  useEffect(() => {
    if (typeof window === "undefined" || !currentModule) {
      setBannerDismissed(false);
      return;
    }

    const dismissed = window.localStorage.getItem(getModuleBannerDismissKey(currentModule.id)) === "1";
    setBannerDismissed(dismissed);
  }, [currentModule]);

  const requestUpgrade = useCallback(
    (override?: SubscriptionUpgradeDialogOverride) => {
      if (!currentModule || !isActionGateEnabled) {
        return;
      }

      setDialogState({
        actionLabel: null,
        override: override || null,
      });
    },
    [currentModule, isActionGateEnabled],
  );

  const dismissModuleBanner = useCallback(() => {
    if (typeof window !== "undefined" && currentModule) {
      window.localStorage.setItem(getModuleBannerDismissKey(currentModule.id), "1");
    }
    setBannerDismissed(true);
  }, [currentModule]);

  const handleClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!isActionGateEnabled || !currentModule) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!isSubscriptionGatedActionTarget(target, { gatePremiumModuleControls: true })) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      setDialogState({
        actionLabel: resolveActionLabel(target),
        override: null,
      });
    },
    [currentModule, isActionGateEnabled],
  );

  const handleSubmitCapture = useCallback(
    (event: FormEvent<HTMLDivElement>) => {
      if (!isActionGateEnabled || !currentModule) {
        return;
      }

      const submitEvent = event.nativeEvent;
      const submitter =
        submitEvent instanceof SubmitEvent && submitEvent.submitter instanceof HTMLElement
          ? submitEvent.submitter
          : null;

      if (submitter && !isSubscriptionGatedActionTarget(submitter, { gatePremiumModuleControls: true })) {
        return;
      }

      const form = event.target instanceof HTMLFormElement ? event.target : null;
      const fallbackSubmitter =
        !submitter && form
          ? Array.from(form.querySelectorAll("button, input[type='submit'], [data-gated-action]")).find(
              (candidate): candidate is HTMLElement =>
                candidate instanceof HTMLElement &&
                isSubscriptionGatedActionTarget(candidate, { gatePremiumModuleControls: true }),
            ) || null
          : null;

      const gatedTrigger = submitter || fallbackSubmitter;
      if (!gatedTrigger) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      setDialogState({
        actionLabel: resolveActionLabel(gatedTrigger),
        override: null,
      });
    },
    [currentModule, isActionGateEnabled],
  );

  const closeDialog = useCallback(() => {
    setDialogState({
      actionLabel: null,
      override: null,
    });
  }, []);

  const contextValue = useMemo<SubscriptionActionGateContextValue>(
    () => ({
      isActionGateEnabled,
      hasActiveSubscription: usage?.hasActiveSubscription ?? true,
      currentModule,
      requestUpgrade,
    }),
    [currentModule, isActionGateEnabled, requestUpgrade, usage?.hasActiveSubscription],
  );

  const planName = resolvePlanName(assignedPlanData?.plan);
  const shouldShowBanner = false;
  const isCompactBanner = currentModule?.bannerVariant === "compact";

  return (
    <SubscriptionActionGateContext.Provider value={contextValue}>
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        onClickCapture={handleClickCapture}
        onSubmitCapture={handleSubmitCapture}
      >
        {shouldShowBanner && currentModule ? (
          <div className="px-3 pt-2 sm:px-4 sm:pt-3">
            {isCompactBanner ? (
              <div className="mx-auto w-full max-w-7xl rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-sm dark:bg-amber-950/30 dark:text-amber-100 sm:px-4">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 flex-shrink-0" />
                  <p className="min-w-0 flex-1 truncate text-[12px] font-medium leading-5 sm:text-sm">
                    {currentModule.title} é uma ferramenta Plus. O Grátis continua com agente, conversas, conexão, curso e ajuda.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 border-amber-300 bg-white/80 px-2.5 text-[12px] text-amber-900 hover:bg-white dark:border-amber-800 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-950/40 sm:h-8 sm:px-3"
                    onClick={() => setLocation("/plans")}
                    data-subscription-gate-ignore="true"
                  >
                    Assinar Plus
                  </Button>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-white/80 text-amber-700 transition-colors hover:border-amber-300 hover:text-amber-900 dark:border-amber-800 dark:bg-transparent dark:text-amber-200 dark:hover:border-amber-700 dark:hover:text-amber-50 sm:h-8 sm:w-8"
                    onClick={dismissModuleBanner}
                    data-subscription-gate-ignore="true"
                    aria-label="Fechar aviso do módulo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-7xl rounded-xl border border-emerald-100 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_38%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(255,255,255,0.96))] px-3 py-2.5 shadow-sm dark:border-emerald-900/30 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_35%),linear-gradient(180deg,_rgba(2,6,23,0.92),_rgba(2,6,23,0.92))] sm:rounded-2xl sm:px-5 sm:py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        {currentModule.title}
                      </Badge>
                      <span className="hidden items-center gap-1 rounded-full border border-emerald-100 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-slate-900 dark:text-emerald-300 sm:inline-flex">
                        <Clock3 className="h-3.5 w-3.5" />
                        Plano Plus
                      </span>
                    </div>

                    <p className="mt-2 text-[13px] font-medium leading-5 text-slate-900 dark:text-slate-50 sm:text-sm sm:leading-6">
                      Você pode navegar pelo módulo. Para salvar, ativar ou usar {currentModule.title.toLowerCase()}, assine o Plus.
                    </p>

                    <p className="mt-1 hidden text-sm leading-6 text-slate-600 dark:text-slate-300 sm:block">
                      {currentModule.description} O Grátis continua disponível para o básico: agente, conversas, conexão, curso e ajuda.
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4">
                      <span className="hidden w-fit rounded-full border border-emerald-100 bg-white px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-slate-900 dark:text-emerald-300 sm:inline-flex">
                        Ferramenta Plus
                      </span>
                      <Button
                        className="h-9 bg-emerald-600 px-4 text-white hover:bg-emerald-700 sm:h-10"
                        onClick={() => setLocation("/plans")}
                        data-subscription-gate-ignore="true"
                      >
                        Assinar Plus
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        className="hidden h-10 px-3 text-slate-500 hover:bg-transparent hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 sm:inline-flex"
                        onClick={dismissModuleBanner}
                        data-subscription-gate-ignore="true"
                      >
                        Fechar aviso
                      </Button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-100"
                    onClick={dismissModuleBanner}
                    data-subscription-gate-ignore="true"
                    aria-label="Fechar aviso do módulo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {children}

        <SubscriptionUpgradeDialog
          open={Boolean(dialogState.actionLabel || dialogState.override)}
          onClose={closeDialog}
          moduleConfig={currentModule}
          planName={planName}
          actionLabel={dialogState.actionLabel}
          override={dialogState.override}
        />
      </div>
    </SubscriptionActionGateContext.Provider>
  );
}

export function useSubscriptionActionGate() {
  return useContext(SubscriptionActionGateContext);
}
