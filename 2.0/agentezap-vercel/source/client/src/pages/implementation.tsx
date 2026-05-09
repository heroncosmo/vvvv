import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { repairReactNodeText } from "@/lib/repair-react-node";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  Loader2,
  QrCode,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ImplementationAddonRecord = {
  id: string;
  status: "pending_payment" | "pending_review" | "active" | "expired" | "rejected" | "cancelled";
  originalAmount?: string | number | null;
  promotionalAmount?: string | number | null;
  createdAt?: string | null;
  pixCode?: string | null;
  pixQrCode?: string | null;
  paymentReference?: string | null;
  receiptUrl?: string | null;
  receiptFilename?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  reviewedAt?: string | null;
  adminNotes?: string | null;
};

type ImplementationOffer = {
  id?: string | number | null;
  title: string;
  badge: string;
  description: string;
  originalAmount: number;
  promotionalAmount: number;
  amount?: number;
  deliveryDays?: number;
  accessCode?: string | null;
  directUrl?: string | null;
  summary: string;
  paymentSummary: string;
  highlights: string[];
};

type ImplementationCurrentResponse = {
  hasActivePlan: boolean;
  basePlanName?: string | null;
  requestedCode?: string | null;
  invalidCode?: boolean;
  message?: string | null;
  offer: ImplementationOffer;
  addon: ImplementationAddonRecord | null;
};

type StatusContent = {
  tone: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

const fallbackOffer: ImplementationOffer = {
  title: "Implementacao Agente",
  badge: "Implementacao avulsa",
  description:
    "Criamos implementacoes sob medida para funcionalidades, integracoes e automacoes especificas dentro do seu AgenteZap.",
  originalAmount: 1000,
  promotionalAmount: 1000,
  amount: 1000,
  deliveryDays: 7,
  accessCode: null,
  directUrl: null,
  summary:
    "Pagamento unico para um escopo fechado de desenvolvimento aprovado no AgenteZap.",
  paymentSummary:
    "Depois do PIX validado, a equipe inicia a implementacao aprovada para o seu ambiente.",
  highlights: [
    "Programacao de automacoes, funcoes e ajustes especificos no AgenteZap",
    "Integracoes com ferramentas, APIs ou processos do seu negocio",
    "Pagamento unico para o escopo aprovado, sem mensalidade adicional",
    "Prazo definido na proposta da implementacao gerada no admin",
  ],
};

const faqItems = [
  {
    question: "O que e a Implementacao Agente?",
    answer: "E um servico do nosso time de dev para programar automacoes, integracoes e novas funcoes dentro do seu AgenteZap.",
  },
  {
    question: "Quando o QR Code PIX aparece?",
    answer:
      "O QR Code so e gerado quando voce clica no botao do card. Antes disso, a pagina apenas mostra a proposta da implementacao carregada pelo link ou pelo codigo.",
  },
  {
    question: "Preciso inserir o codigo novamente se voltar depois?",
    answer:
      "Sim, se voce voltar sem o link direto ou sem digitar o codigo novamente. A pagina nao deve puxar um pedido pendente so por abrir a rota.",
  },
  {
    question: "Qual e o prazo de entrega?",
    answer:
      "O prazo fica na proposta gerada no admin e passa a contar apos a confirmacao do pagamento e o alinhamento final do escopo combinado.",
  },
];

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function formatCurrency(value?: string | number | null) {
  const numeric = Number(value || 0);
  return numeric.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shouldShowOriginalAmount(original?: string | number | null, promotional?: string | number | null) {
  return Number(original || 0) > Number(promotional || 0);
}

function ScarcityTimer({ className }: { className?: string }) {
  const storageKey = "implementation_scarcity_timer_end";
  const [timeLeft, setTimeLeft] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const remaining = Math.max(0, parseInt(saved, 10) - Date.now());
      return Math.floor(remaining / 1000);
    }

    const endTime = Date.now() + 10 * 60 * 1000;
    localStorage.setItem(storageKey, endTime.toString());
    return 10 * 60;
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          const endTime = Date.now() + 10 * 60 * 1000;
          localStorage.setItem(storageKey, endTime.toString());
          return 10 * 60;
        }

        return previous - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <span className={cn("font-mono font-semibold text-slate-600", className)}>
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

function getStatusBadge(status?: ImplementationAddonRecord["status"]) {
  switch (status) {
    case "active":
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Em execucao</Badge>;
    case "pending_review":
      return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Em analise</Badge>;
    case "pending_payment":
      return <Badge variant="outline">Aguardando pagamento</Badge>;
    case "expired":
      return <Badge variant="secondary">Expirado</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejeitado</Badge>;
    case "cancelled":
      return <Badge variant="secondary">Cancelado</Badge>;
    default:
      return <Badge variant="outline">Disponivel</Badge>;
  }
}

function ImplementationOfferCard({
  offer,
  addon,
  hasActivePlan,
  hasExplicitCode,
  invalidCode,
  isPending,
  onAction,
}: {
  offer: ImplementationOffer;
  addon: ImplementationAddonRecord | null;
  hasActivePlan: boolean;
  hasExplicitCode: boolean;
  invalidCode: boolean;
  isPending: boolean;
  onAction: () => void;
}) {
  const currentStatus = addon?.status;
  const hasLiveAddon = Boolean(addon && ["pending_payment", "pending_review", "active"].includes(addon.status));
  const buttonDisabled =
    !hasActivePlan ||
    invalidCode ||
    currentStatus === "pending_review" ||
    currentStatus === "active" ||
    (isPending && !hasLiveAddon);

  let buttonLabel = "Contratar";
  if (!hasActivePlan) {
    buttonLabel = "Plano ativo necessario";
  } else if (invalidCode) {
    buttonLabel = "Codigo invalido";
  } else if (currentStatus === "pending_payment") {
    buttonLabel = "Continuar contratacao";
  } else if (currentStatus === "pending_review") {
    buttonLabel = "Comprovante em analise";
  } else if (currentStatus === "active") {
    buttonLabel = "Implementacao em execucao";
  }

  return (
    <Card
      className={cn(
        "relative mx-auto flex h-full w-full max-w-[30rem] flex-col rounded-[28px] border bg-white/95 transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl",
        "border-slate-200",
        hasLiveAddon && "border-emerald-400",
      )}
    >
      <div className="absolute -top-3 left-5">
        <Badge className={cn(
          "rounded-full px-3 py-1 text-xs font-semibold shadow-sm",
          hasExplicitCode ? "border border-emerald-200 bg-emerald-100 text-emerald-700" : "border border-slate-200 bg-slate-100 text-slate-700",
        )}>
          {hasExplicitCode
            ? addon?.status === "active"
              ? "Em execucao"
              : addon?.status === "pending_review"
                ? "Comprovante enviado"
                : addon?.status === "pending_payment"
                  ? "Pagamento pendente"
                  : "Codigo carregado"
            : offer.badge || "Implementacao avulsa"}
        </Badge>
      </div>

      <CardHeader className="px-5 pb-4 pt-8 sm:px-6">
        <div className="mb-1 flex min-h-[116px] items-start gap-3 overflow-hidden md:min-h-[128px]">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="rounded-xl bg-slate-100 p-2">
              <Sparkles className="h-5 w-5 text-slate-700" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[1.7rem] font-semibold leading-[1.02] tracking-tight text-slate-950">{offer.title}</h3>
              <p className="mt-2 overflow-hidden text-sm leading-6 text-slate-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4]">
                {offer.description}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          {shouldShowOriginalAmount(offer.originalAmount, offer.promotionalAmount) ? (
            <p className="pb-2 text-[11px] font-medium text-slate-400 line-through decoration-1 decoration-slate-400/80">
              {formatCurrency(offer.originalAmount)}
            </p>
          ) : null}

          <div className="flex flex-wrap items-end justify-center gap-x-3 gap-y-1">
            <span className="text-sm font-medium text-slate-500">R$</span>
            <span className="text-[2.9rem] font-bold tracking-tight text-slate-950 md:text-[3.35rem]">
              {Number(offer.promotionalAmount).toFixed(2).replace(".", ",").split(",")[0]}
            </span>
            <span className="text-2xl font-bold tracking-tight text-slate-950 md:text-[1.75rem]">
              ,{Number(offer.promotionalAmount).toFixed(2).split(".")[1]}
            </span>
            <span className="pb-1 text-sm font-medium text-slate-500">pagamento unico</span>
          </div>

          <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
            <p className="text-sm font-semibold">{offer.summary}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col px-5 pb-6 sm:px-6">
        {hasExplicitCode ? (
          <div className="mb-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <span>Esta promocao e garantida ate:</span>
            <ScarcityTimer className="text-[12px] font-bold text-slate-800" />
          </div>
        ) : null}

        <Button
          className="mb-3 min-h-[56px] w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold leading-tight text-white shadow-sm transition-all hover:scale-[1.01] hover:bg-slate-800 md:text-base"
          disabled={buttonDisabled}
          onClick={() => {
            if (!buttonDisabled) {
              onAction();
            }
          }}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : buttonLabel}
        </Button>

        <p className="mb-3 min-h-[34px] text-center text-[11px] leading-4 text-slate-400 sm:px-2">
          Pagamento unico. O QR Code PIX aparece no proximo passo para concluir a contratacao.
        </p>

        <ul className="flex-1 space-y-2.5">
          {offer.highlights.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-sm text-slate-600">
              <div className="mt-0.5 rounded-full bg-slate-100 p-0.5">
                <Check className="h-3 w-3 flex-shrink-0 text-slate-700" />
              </div>
              <span className="font-medium">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function CheckoutPanel({
  offer,
  addon,
  displayOriginal,
  displayPromotional,
  receiptFile,
  canUploadReceipt,
  receiptInputRef,
  uploadPending,
  onReceiptChange,
  onUpload,
  onCopyPix,
}: {
  offer: ImplementationOffer;
  addon: ImplementationAddonRecord | null;
  displayOriginal: string;
  displayPromotional: string;
  receiptFile: File | null;
  canUploadReceipt: boolean;
  receiptInputRef: RefObject<HTMLInputElement | null>;
  uploadPending: boolean;
  onReceiptChange: (file: File | null) => void;
  onUpload: () => void;
  onCopyPix: () => Promise<void>;
}) {
  const handleReceiptCtaClick = () => {
    if (receiptFile) {
      onUpload();
      return;
    }

    receiptInputRef.current?.click();
  };

  const pixCodePreview = addon?.pixCode ? addon.pixCode.slice(0, 92) : "";

  return repairReactNodeText(
    <Card className="overflow-hidden rounded-[22px] border border-slate-100 bg-white text-center shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-950">
      <CardContent className="px-4 py-4 sm:px-6 sm:py-5">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-amber-700">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-[10px] font-black uppercase tracking-[0.16em]">
              {addon?.status === "pending_review" ? "Comprovante enviado" : addon ? "Aguardando pagamento" : "PIX pendente"}
            </span>
          </div>

          <div className="mx-auto max-w-[500px]">
            <h2 className="text-xl font-black leading-tight tracking-tight text-slate-950 sm:text-2xl dark:text-white">
              Finalize sua implementacao
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm dark:text-slate-300">
              Pague via PIX e envie o comprovante para iniciar a configuracao combinada com o time AgenteZap.
            </p>
          </div>

          <div className="mx-auto max-w-[400px] rounded-xl border border-slate-100 bg-slate-50 p-3 text-left dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-500">Servico selecionado</span>
              <span className="font-bold text-slate-950 dark:text-white">Pagamento unico</span>
            </div>
            <div className="mt-1.5 flex items-end justify-between gap-3">
              <span className="text-base font-black text-slate-950 dark:text-white">{offer.title}</span>
              <div className="text-right">
                <div className="text-xl font-black leading-none text-emerald-700 sm:text-2xl">
                  {displayPromotional}
                </div>
                {shouldShowOriginalAmount(
                  addon?.originalAmount ?? offer.originalAmount,
                  addon?.promotionalAmount ?? offer.promotionalAmount,
                ) ? (
                  <div className="mt-1 text-[11px] font-bold text-slate-400 line-through">
                    De {displayOriginal}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {addon?.pixQrCode ? (
            <div className="flex flex-col items-center">
              <div className="relative mb-3 rounded-[20px] border-2 border-dashed border-slate-200 bg-white p-2 transition-colors hover:border-emerald-300 sm:p-3">
                <div className="flex h-36 w-36 items-center justify-center rounded-xl bg-white p-1.5 sm:h-44 sm:w-44">
                  <img
                    src={addon.pixQrCode}
                    alt="QR Code PIX da Implementacao Agente"
                    className="h-full w-full rounded-xl"
                  />
                </div>
                <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 shadow-sm">
                  <Clock3 className="h-3 w-3 text-amber-500" />
                  Expira em <ScarcityTimer />
                </div>
              </div>

              <div className="mx-auto w-full max-w-md space-y-2">
                <p className="text-xs text-slate-500">Escaneie ou copie o codigo PIX.</p>
                <div className="flex w-full items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 p-1">
                  <span className="min-w-0 flex-1 truncate px-2 text-left font-mono text-[10px] text-slate-500">
                    {pixCodePreview || "Codigo PIX gerado para esta implementacao."}
                  </span>
                  <button
                    type="button"
                    onClick={onCopyPix}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-slate-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-950">
              <QrCode className="mx-auto mb-3 h-8 w-8 text-slate-400" />
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Clique no botao do card para gerar o QR Code PIX desta implementacao.
              </p>
            </div>
          )}

          <div className={cn("mx-auto w-full max-w-md space-y-2", !canUploadReceipt && "opacity-70")}>
            <Input
              ref={receiptInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={(event) => onReceiptChange(event.target.files?.[0] || null)}
              disabled={!canUploadReceipt || uploadPending}
              className="hidden"
            />

            {receiptFile ? (
              <p className="truncate rounded-xl bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700 dark:bg-slate-900">
                {receiptFile.name}
              </p>
            ) : null}

            <Button
              className="h-11 w-full rounded-xl bg-emerald-600 text-xs font-black text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 hover:shadow-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white disabled:shadow-none"
              onClick={handleReceiptCtaClick}
              disabled={!canUploadReceipt || uploadPending}
            >
              {uploadPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {receiptFile ? "Enviar comprovante" : "Ja paguei, enviar comprovante"}
            </Button>
          </div>

          {addon?.receiptUrl ? (
            <a
              href={addon.receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-xs font-black text-emerald-700 underline underline-offset-4"
            >
              Abrir comprovante enviado
            </a>
          ) : null}
        </div>
      </CardContent>
    </Card>,
  );
}

export default function ImplementationPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const initialCode = useMemo(() => {
    const params = new URLSearchParams(search);
    return normalizeCode(params.get("codigo") || params.get("code") || "");
  }, [search]);

  const [inputCode, setInputCode] = useState(initialCode);
  const [activeCode, setActiveCode] = useState(initialCode);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutAddon, setCheckoutAddon] = useState<ImplementationAddonRecord | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  useEffect(() => {
    setInputCode(initialCode);
    setActiveCode(initialCode);
  }, [initialCode]);

  const implementationQuery = useQuery<ImplementationCurrentResponse>({
    queryKey: ["/api/implementation/current", activeCode],
    queryFn: async () => {
      const suffix = activeCode ? `?code=${encodeURIComponent(activeCode)}` : "";
      const response = await apiRequest("GET", `/api/implementation/current${suffix}`);
      return response.json();
    },
  });

  const data = implementationQuery.data;
  const offer = data?.offer ?? fallbackOffer;
  const addon = data?.addon ?? null;
  const hasExplicitCode = Boolean(activeCode || data?.requestedCode || initialCode);
  const shouldShowOffer = hasExplicitCode && !data?.invalidCode;

  useEffect(() => {
    if (data?.invalidCode && data.message) {
      toast({
        title: "Codigo nao encontrado",
        description: data.message,
        variant: "destructive",
      });
    }
  }, [data?.invalidCode, data?.message, toast]);

  const resetReceiptInput = () => {
    setReceiptFile(null);
    if (receiptInputRef.current) {
      receiptInputRef.current.value = "";
    }
  };

  const syncImplementationState = (
    payload: Partial<ImplementationCurrentResponse>,
    options: { updateLocation?: boolean } = {},
  ) => {
    const nextCode = normalizeCode(payload.requestedCode || activeCode || "");
    const queryKey = ["/api/implementation/current", nextCode];

    queryClient.setQueryData<ImplementationCurrentResponse>(queryKey, (previous) => ({
      hasActivePlan: payload.hasActivePlan ?? previous?.hasActivePlan ?? true,
      basePlanName: payload.basePlanName ?? previous?.basePlanName ?? data?.basePlanName ?? null,
      requestedCode: payload.requestedCode ?? previous?.requestedCode ?? nextCode,
      invalidCode: payload.invalidCode ?? previous?.invalidCode ?? false,
      message: payload.message ?? previous?.message ?? null,
      offer: payload.offer ?? previous?.offer ?? offer,
      addon: payload.addon ?? previous?.addon ?? null,
    }));

    if (options.updateLocation && nextCode && nextCode !== activeCode) {
      const params = new URLSearchParams(window.location.search);
      params.set("codigo", nextCode);
      params.delete("code");
      window.history.replaceState({}, "", `/implementacao?${params.toString()}`);
      setInputCode(nextCode);
      setActiveCode(nextCode);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const code = activeCode || data?.requestedCode || "";
      const response = await apiRequest("POST", "/api/implementation/create", { code });
      return response.json();
    },
    onSuccess: (payload) => {
      syncImplementationState(payload, { updateLocation: hasExplicitCode });
      queryClient.invalidateQueries({ queryKey: ["/api/implementation/current"] });
      setCheckoutAddon(payload?.addon || null);
      setCheckoutModalOpen(true);
      toast({
        title: "Contratacao iniciada",
        description: "Agora e so concluir o pagamento via PIX e enviar o comprovante.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao contratar",
        description: error?.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const currentAddon = checkoutAddon || addon;

      if (!currentAddon?.id || !receiptFile) {
        throw new Error("Selecione um comprovante antes de enviar.");
      }

      const formData = new FormData();
      formData.append("addonId", currentAddon.id);
      formData.append("receipt", receiptFile);

      const response = await apiRequest("POST", "/api/specialist-addon/upload-receipt", formData);
      return response.json();
    },
    onSuccess: (payload) => {
      resetReceiptInput();
      syncImplementationState({ addon: payload?.addon || checkoutAddon || addon });
      queryClient.invalidateQueries({ queryKey: ["/api/implementation/current", activeCode] });
      toast({
        title: "Comprovante enviado",
        description: payload?.message || "Nossa equipe vai validar a sua implementacao.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao enviar comprovante",
        description: error?.message || "Tente novamente com outro arquivo.",
        variant: "destructive",
      });
    },
  });

  const submitCode = () => {
    const normalized = normalizeCode(inputCode);
    const params = new URLSearchParams(window.location.search);

    if (normalized) {
      params.set("codigo", normalized);
    } else {
      params.delete("codigo");
      params.delete("code");
    }

    window.history.replaceState({}, "", `/implementacao${params.toString() ? `?${params.toString()}` : ""}`);
    setActiveCode(normalized);
    setInputCode(normalized);
    resetReceiptInput();
    queryClient.invalidateQueries({ queryKey: ["/api/implementation/current", normalized] });
  };

  const openCheckout = () => {
    if (addon?.pixQrCode && addon.status === "pending_payment") {
      setCheckoutAddon(addon);
      setCheckoutModalOpen(true);
      return;
    }

    createMutation.mutate();
  };

  const statusContent: StatusContent = useMemo(() => {
    if (data?.invalidCode) {
      return {
        tone: "bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-100",
        icon: ShieldCheck,
        title: "Codigo nao localizado",
        description: data.message || "Confira o codigo recebido pela nossa equipe e tente novamente.",
      };
    }

    if (!addon) {
      return {
        tone: "bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:text-blue-100",
        icon: QrCode,
        title: "Clique para gerar o PIX",
        description: offer.paymentSummary,
      };
    }

    if (addon.status === "active") {
      return {
        tone: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
        icon: Sparkles,
        title: "Implementacao Agente em execucao",
        description:
          "Nossa equipe esta executando a implementacao aprovada para o seu ambiente e alinhando os detalhes do escopo com base no pedido validado.",
      };
    }

    if (addon.status === "pending_review") {
      return {
        tone: "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
        icon: Clock3,
        title: "Comprovante recebido e aguardando validacao",
        description:
          "Assim que o comprovante for validado, a Implementacao Agente entra em execucao conforme o escopo aprovado.",
      };
    }

    if (addon.status === "pending_payment") {
      return {
        tone: "bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:text-blue-100",
        icon: QrCode,
        title: "Pagamento aguardando comprovante",
        description: "O QR Code da Implementacao Agente ja esta liberado. Faca o PIX e envie o comprovante para analise.",
      };
    }

    if (addon.status === "rejected") {
      return {
        tone: "bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-100",
        icon: ShieldCheck,
        title: "Comprovante rejeitado",
        description: addon.adminNotes || "Voce pode gerar um novo PIX e enviar um comprovante mais legivel.",
      };
    }

    return {
      tone: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
      icon: ShieldCheck,
      title: "Implementacao aguardando proximo passo",
      description: offer.paymentSummary,
    };
  }, [addon, data?.invalidCode, data?.message, offer.paymentSummary]);

  const modalAddon = checkoutAddon || addon;
  const modalDisplayOriginal = useMemo(
    () => formatCurrency(modalAddon?.originalAmount ?? offer.originalAmount),
    [modalAddon?.originalAmount, offer.originalAmount],
  );
  const modalDisplayPromotional = useMemo(
    () => formatCurrency(modalAddon?.promotionalAmount ?? offer.promotionalAmount),
    [modalAddon?.promotionalAmount, offer.promotionalAmount],
  );
  const modalCanUploadReceipt = Boolean(modalAddon && ["pending_payment", "pending_review"].includes(modalAddon.status));

  const closeCheckoutModal = () => {
    setCheckoutModalOpen(false);
    resetReceiptInput();
    setCheckoutAddon(null);
  };

  useEffect(() => {
    if (!checkoutModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCheckoutModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [checkoutModalOpen]);

  const codeEntry = (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          value={inputCode}
          onChange={(event) => setInputCode(normalizeCode(event.target.value))}
          placeholder="Codigo da implementacao"
          className="h-11 rounded-xl border-slate-200 bg-white text-center font-medium uppercase tracking-widest text-slate-950 placeholder:text-slate-400"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              submitCode();
            }
          }}
        />
        <Button
          className="h-11 rounded-xl bg-slate-950 px-5 font-medium text-white shadow-sm transition-all hover:bg-slate-800"
          onClick={submitCode}
          disabled={implementationQuery.isFetching}
        >
          {implementationQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}
        </Button>
      </div>

      {hasExplicitCode ? (
        <p className="mt-3 text-center text-xs text-slate-500">
          Codigo carregado: <span className="font-mono text-slate-700">{activeCode || data?.requestedCode || initialCode}</span>
        </p>
      ) : (
        <p className="mt-3 text-center text-xs text-slate-500">
          Sem codigo a proposta nao aparece.
        </p>
      )}

      {data?.invalidCode ? (
        <p className="mt-3 text-center text-sm font-medium text-rose-600">{data.message || "Codigo nao encontrado."}</p>
      ) : null}
    </div>
  );

  if (implementationQuery.isLoading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return repairReactNodeText(
    <div className="min-h-full bg-white text-slate-950">
      <div className="mx-auto flex max-w-[1840px] flex-col px-4 py-8 sm:px-6 md:px-8 md:py-12">
        <div className="mx-auto w-full max-w-5xl space-y-5">
          <div className="mb-1 text-center">
            <div className="space-y-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
                Crie funcionalidades e integracoes no AgenteZap
              </h1>
              <p className="mx-auto max-w-xl text-sm leading-6 text-slate-500 md:text-base">
                Use o codigo enviado pelo admin para liberar a proposta.
              </p>
            </div>

            {data?.basePlanName ? (
              <div className="mt-2 inline-flex max-w-full items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs text-slate-600 shadow-sm md:text-sm">
                <span className="font-medium text-slate-900">Plano ativo:</span>
                <span className="ml-2 break-words">{data.basePlanName}</span>
              </div>
            ) : null}
          </div>

          {!data?.hasActivePlan ? (
            <div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div className="space-y-3">
                  <p>A Implementacao Agente fica disponivel apenas para clientes com plano ativo.</p>
                  <Button size="sm" variant="outline" onClick={() => setLocation("/plans")}>
                    Ver planos
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {!shouldShowOffer ? codeEntry : null}

          {shouldShowOffer ? (
            <div className="mx-auto grid w-full max-w-xl grid-cols-1 gap-4">
              <ImplementationOfferCard
                offer={offer}
                addon={addon}
                hasActivePlan={Boolean(data?.hasActivePlan)}
                hasExplicitCode={hasExplicitCode}
                invalidCode={Boolean(data?.invalidCode)}
                isPending={createMutation.isPending}
                onAction={openCheckout}
              />
            </div>
          ) : null}

          {shouldShowOffer ? codeEntry : null}

          {checkoutModalOpen ? (
            <div
              className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 py-6 backdrop-blur-sm sm:items-center"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeCheckoutModal();
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="implementation-checkout-title"
                aria-describedby="implementation-checkout-description"
                className="relative w-full max-w-xl outline-none"
              >
                <button
                  type="button"
                  onClick={closeCheckoutModal}
                  className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition hover:bg-slate-50 hover:text-slate-950"
                  aria-label="Fechar checkout"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="sr-only">
                  <h2 id="implementation-checkout-title">Checkout de Implementacao Agente</h2>
                  <p id="implementation-checkout-description">
                    Escaneie o QR Code PIX, copie o codigo se preferir e envie o comprovante para validar a implementacao.
                  </p>
                </div>
              <CheckoutPanel
                offer={offer}
                addon={modalAddon}
                displayOriginal={modalDisplayOriginal}
                displayPromotional={modalDisplayPromotional}
                receiptFile={receiptFile}
                canUploadReceipt={modalCanUploadReceipt}
                receiptInputRef={receiptInputRef}
                uploadPending={uploadMutation.isPending}
                onReceiptChange={setReceiptFile}
                onUpload={() => uploadMutation.mutate()}
                onCopyPix={async () => {
                  if (!modalAddon?.pixCode) return;
                  await navigator.clipboard.writeText(modalAddon.pixCode);
                  toast({ title: "Codigo PIX copiado" });
                }}
              />
              </div>
            </div>
          ) : null}

          <div className="mx-auto w-full max-w-4xl">
            <h2 className="mb-5 text-center text-2xl font-semibold text-slate-950">Perguntas frequentes</h2>

            <div className="space-y-2">
              {faqItems.map((item, index) => (
                <div key={item.question} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <button
                    onClick={() => setFaqOpen(faqOpen === index ? null : index)}
                    className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-slate-50"
                  >
                    <span className="pr-4 text-sm font-medium text-slate-900">{item.question}</span>
                    {faqOpen === index ? (
                      <ChevronUp className="h-4 w-4 flex-shrink-0 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-500" />
                    )}
                  </button>
                  {faqOpen === index ? (
                    <div className="px-4 pb-4">
                      <p className="text-sm leading-6 text-slate-600">{item.answer}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
  );
}
