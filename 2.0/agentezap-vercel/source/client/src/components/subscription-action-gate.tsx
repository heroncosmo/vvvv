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

interface SubscriptionUpgradeDialogOverride {
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

function useOfferCountdown(storageKey: string, durationSeconds: number) {
  const [endTime, setEndTime] = useState<number>(() => {
    if (typeof window === "undefined") {
      return Date.now() + durationSeconds * 1000;
    }

    const savedValue = window.localStorage.getItem(storageKey);
    const parsedValue = Number(savedValue);
    if (Number.isFinite(parsedValue) && parsedValue > Date.now()) {
      return parsedValue;
    }

    const nextEndTime = Date.now() + durationSeconds * 1000;
    window.localStorage.setItem(storageKey, String(nextEndTime));
    return nextEndTime;
  });

  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.floor((endTime - Date.now()) / 1000)),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const interval = window.setInterval(() => {
      const secondsLeft = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      if (secondsLeft <= 0) {
        const nextEndTime = Date.now() + durationSeconds * 1000;
        window.localStorage.setItem(storageKey, String(nextEndTime));
        setEndTime(nextEndTime);
        setRemainingSeconds(durationSeconds);
        return;
      }

      setRemainingSeconds(secondsLeft);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [durationSeconds, endTime, storageKey]);

  return remainingSeconds;
}

function formatCountdownLabel(remainingSeconds: number): string {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resolvePlanName(plan?: AssignedPlanResponse["plan"]) {
  return plan?.nome || "Plano Ilimitado Promocional";
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
  const countdown = useOfferCountdown("subscription_action_gate_offer_end", 20 * 60);

  if (!open || !moduleConfig) {
    return null;
  }

  const title = override?.title || `${moduleConfig.title} no ${planName}`;
  const description =
    override?.description ||
    `Você já pode explorar ${moduleConfig.title.toLowerCase()}. Para salvar, ativar ou adicionar aqui, ative o ${planName}.`;
  const actionText = actionLabel ? `Tentativa: ${actionLabel}` : null;
  const benefitText = override?.benefit || moduleConfig.benefit;
  const compactBenefits = moduleConfig.benefits.slice(0, 2);

  return (
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/55 p-2 backdrop-blur-sm sm:items-center sm:p-3 sm:px-4"
      data-subscription-gate-ignore="true"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:max-h-[86vh] sm:rounded-[28px]"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative border-b border-slate-100 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_46%),linear-gradient(180deg,_rgba(15,23,42,0.02),_rgba(15,23,42,0))] px-4 pb-3 pt-4 dark:border-slate-800 sm:px-6 sm:pb-4 sm:pt-5">
          <button
            type="button"
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-100"
            onClick={onClose}
            data-subscription-gate-ignore="true"
            aria-label="Fechar aviso de assinatura"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex flex-wrap items-center gap-2 pr-10">
            <Badge className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Plano Ilimitado Promocional
            </Badge>
            <div className="hidden items-center gap-1.5 rounded-full border border-emerald-100 bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-slate-900 dark:text-emerald-300 md:inline-flex">
              <Clock3 className="h-3.5 w-3.5" />
              {formatCountdownLabel(countdown)}
            </div>
          </div>

          <div className="mt-3 flex items-start gap-3 sm:mt-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <Lock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold leading-tight text-slate-900 dark:text-slate-50 sm:text-xl">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 sm:px-6 sm:pb-5 sm:pt-4">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:flex sm:gap-3">
              <Button
                className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => setLocation("/plans")}
                data-subscription-gate-ignore="true"
              >
                Assinar agora
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full"
                onClick={onClose}
                data-subscription-gate-ignore="true"
              >
                Continuar explorando
              </Button>
            </div>

            <div className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              Condição desta sessão
            </div>

            {actionText ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{actionText}</p>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-800 dark:text-slate-100">
                  Libere agora para {benefitText}.
                </p>
              </div>
            ) : null}

            <div className="hidden rounded-2xl border border-slate-200/80 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 md:block">
              <div className="space-y-2">
                {compactBenefits.map((benefit) => (
                  <div key={benefit} className="flex items-start gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    <span className="mt-2 h-2 w-2 rounded-full bg-emerald-500" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
  const countdown = useOfferCountdown("subscription_action_gate_banner_end", 20 * 60);

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

  const isActionGateEnabled =
    Boolean(currentModule) &&
    usage?.hasActiveSubscription === false &&
    accessStatus?.accessStatus === "trial";

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
      if (!isSubscriptionGatedActionTarget(target)) {
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

      if (submitter && !isSubscriptionGatedActionTarget(submitter)) {
        return;
      }

      const form = event.target instanceof HTMLFormElement ? event.target : null;
      const fallbackSubmitter =
        !submitter && form
          ? Array.from(form.querySelectorAll("button, input[type='submit'], [data-gated-action]")).find(
              (candidate): candidate is HTMLElement =>
                candidate instanceof HTMLElement && isSubscriptionGatedActionTarget(candidate),
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
  const shouldShowBanner = false && isActionGateEnabled && currentModule && !bannerDismissed;
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
                    {currentModule.title} fica liberado para clientes com plano ativo.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 border-amber-300 bg-white/80 px-2.5 text-[12px] text-amber-900 hover:bg-white dark:border-amber-800 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-950/40 sm:h-8 sm:px-3"
                    onClick={() => setLocation("/plans")}
                    data-subscription-gate-ignore="true"
                  >
                    Ver planos
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
                        {formatCountdownLabel(countdown)}
                      </span>
                    </div>

                    <p className="mt-2 text-[13px] font-medium leading-5 text-slate-900 dark:text-slate-50 sm:text-sm sm:leading-6">
                      Explore o módulo à vontade. Quando quiser salvar ou ativar algo aqui, o {planName} libera a operação sem bloqueio.
                    </p>

                    <p className="mt-1 hidden text-sm leading-6 text-slate-600 dark:text-slate-300 sm:block">
                      {currentModule.description} Você pode navegar pelo módulo agora e assinar só quando quiser colocar esta parte para rodar.
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4">
                      <span className="hidden w-fit rounded-full border border-emerald-100 bg-white px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-slate-900 dark:text-emerald-300 sm:inline-flex">
                        Condição desta sessão
                      </span>
                      <Button
                        className="h-9 bg-emerald-600 px-4 text-white hover:bg-emerald-700 sm:h-10"
                        onClick={() => setLocation("/plans")}
                        data-subscription-gate-ignore="true"
                      >
                        Assinar agora
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
