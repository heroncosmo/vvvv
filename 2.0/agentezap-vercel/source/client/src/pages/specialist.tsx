import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Crown,
  Loader2,
  QrCode,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRoundCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type SpecialistOfferType = "implementation" | "specialist";

type SpecialistAddonRecord = {
  id: string;
  offerType?: SpecialistOfferType | null;
  status: "pending_payment" | "pending_review" | "active" | "expired" | "rejected" | "cancelled";
  originalAmount?: string | number | null;
  promotionalAmount?: string | number | null;
  pixCode?: string | null;
  pixQrCode?: string | null;
  receiptUrl?: string | null;
  receiptFilename?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  reviewedAt?: string | null;
  adminNotes?: string | null;
};

type SpecialistCurrentResponse = {
  hasActivePlan: boolean;
  eligibilityReason?: "legacy_specialist_plan" | null;
  basePlanName?: string | null;
  addonsByOffer?: Partial<Record<SpecialistOfferType, SpecialistAddonRecord | null>>;
  canPurchaseByOffer?: Partial<Record<SpecialistOfferType, boolean>>;
};

type OfferDefinition = {
  offerType: SpecialistOfferType;
  name: string;
  badge: string;
  description: string;
  originalAmount: number;
  promotionalAmount: number;
  summary: string;
  paymentSummary: string;
  icon: LucideIcon;
  accent: {
    border: string;
    iconWrap: string;
    iconColor: string;
    badge: string;
    note: string;
    checkWrap: string;
    checkColor: string;
    priceColor: string;
  };
  highlights: string[];
};

type StatusContent = {
  tone: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

const offerDefinitions: Record<SpecialistOfferType, OfferDefinition> = {
  implementation: {
    offerType: "implementation",
    name: "Implementação Agente",
    badge: "Funcionalidades e integrações",
    description:
      "Criamos implementações sob medida para funcionalidades, integrações e automações específicas dentro do seu AgenteZap.",
    originalAmount: 1000,
    promotionalAmount: 1000,
    summary: "Projeto fechado para quem precisa tirar uma ideia do papel com execução técnica e validação manual do admin.",
    paymentSummary:
      "Depois do PIX validado, a equipe inicia a implementação aprovada para o seu ambiente.",
    icon: Sparkles,
    accent: {
      border: "border-purple-200 dark:border-purple-800 hover:border-purple-400 dark:hover:border-purple-600",
      iconWrap: "bg-purple-100 dark:bg-purple-900/40",
      iconColor: "text-purple-600 dark:text-purple-300",
      badge: "bg-purple-600 text-white border border-purple-600",
      note: "bg-purple-50 dark:bg-purple-950/30 border-purple-100 dark:border-purple-800/50 text-purple-700 dark:text-purple-300",
      checkWrap: "bg-purple-100 dark:bg-purple-900/30",
      checkColor: "text-purple-600 dark:text-purple-300",
      priceColor: "text-purple-600 dark:text-purple-400",
    },
    highlights: [
      "Configuração completa da IA com base no briefing inicial aprovado",
      "Implementação personalizada de funcionalidades e integrações",
      "Fluxos, APIs e automações ajustados para o cenário do cliente",
      "Cobrança validada por comprovante no admin",
      "Ideal para quem já tem uma demanda específica e quer colocar isso em produção",
    ],
  },
  specialist: {
    offerType: "specialist",
    name: "Especialista dedicado",
    badge: "Acompanhamento premium",
    description:
      "Nosso especialista assume a implementação, acompanha a operação e fica disponível para ajustes contínuos por 30 dias.",
    originalAmount: 2000,
    promotionalAmount: 2000,
    summary: "Implementação completa com acompanhamento dedicado, urgências e ajustes ao longo do período ativo.",
    paymentSummary:
      "Depois do PIX validado, seu especialista assume a implementação e fica disponível para refinar a operação por 30 dias.",
    icon: Crown,
    accent: {
      border: "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700",
      iconWrap: "bg-gray-100 dark:bg-gray-800",
      iconColor: "text-gray-700 dark:text-gray-300",
      badge: "bg-gray-900 text-white border border-gray-900",
      note: "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300",
      checkWrap: "bg-emerald-100 dark:bg-emerald-950/40",
      checkColor: "text-emerald-700 dark:text-emerald-300",
      priceColor: "text-gray-900 dark:text-white",
    },
    highlights: [
      "Gerente de conta dedicado das 11h às 21h, de segunda a sexta",
      "Atendimento para urgências e emergências da operação",
      "Implementação e configuração completa da IA pelo especialista",
      "Você conecta o WhatsApp e o restante da entrega fica com nossa equipe",
      "Suporte VIP direto com o especialista por 30 dias",
      "IA pronta para operar em até 8 horas após a contratação",
    ],
  },
};

const faqItems = [
  {
    question: "O que está incluso no Especialista dedicado?",
    answer:
      "A entrega cobre implementação completa da IA, acompanhamento próximo por 30 dias, atendimento para urgências operacionais e espaço para pedir ajustes e refinamentos ao longo do período ativo.",
  },
  {
    question: "Como funciona a entrega?",
    answer:
      "Depois do pagamento validado, você envia o briefing do negócio, conecta o WhatsApp e nossa equipe assume a configuração da operação. O especialista acompanha a implantação e segue disponível durante a janela ativa.",
  },
  {
    question: "Preciso ter plano ativo antes de contratar?",
    answer:
      "Sim. O Especialista dedicado fica disponível apenas para contas com plano ativo da ferramenta, porque a entrega trabalha em cima de uma assinatura mensal já habilitada para operar.",
  },
];

const emptyAddonsByOffer: Record<SpecialistOfferType, SpecialistAddonRecord | null> = {
  implementation: null,
  specialist: null,
};

const defaultPurchaseAvailability: Record<SpecialistOfferType, boolean> = {
  implementation: true,
  specialist: true,
};

const visibleOfferTypes: SpecialistOfferType[] = ["specialist"];

function getOfferDefinition(offerType?: SpecialistOfferType | null) {
  return offerType === "implementation" ? offerDefinitions.implementation : offerDefinitions.specialist;
}

function formatCurrency(value?: string | number | null) {
  const numeric = Number(value || 0);
  return numeric.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
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

function getStatusBadge(status?: SpecialistAddonRecord["status"]) {
  switch (status) {
    case "active":
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Ativo</Badge>;
    case "pending_review":
      return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Em análise</Badge>;
    case "pending_payment":
      return <Badge variant="outline">Aguardando pagamento</Badge>;
    case "expired":
      return <Badge variant="secondary">Expirado</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejeitado</Badge>;
    case "cancelled":
      return <Badge variant="secondary">Cancelado</Badge>;
    default:
      return <Badge variant="outline">Disponível</Badge>;
  }
}

function OfferCard({
  offer,
  isSelected,
  hasActivePlan,
  canPurchase,
  addon,
  isPending,
  onSelect,
  onAction,
}: {
  offer: OfferDefinition;
  isSelected: boolean;
  hasActivePlan: boolean;
  canPurchase: boolean;
  addon: SpecialistAddonRecord | null;
  isPending: boolean;
  onSelect: () => void;
  onAction: () => void;
}) {
  const AccentIcon = offer.icon;
  const currentStatus = addon?.status;
  const hasLiveAddon = Boolean(addon && ["pending_payment", "pending_review", "active"].includes(addon.status));
  const buttonDisabled =
    !hasActivePlan ||
    (!canPurchase && currentStatus !== "pending_payment") ||
    currentStatus === "pending_review" ||
    currentStatus === "active" ||
    (isPending && !hasLiveAddon);

  let buttonLabel =
    offer.offerType === "implementation" ? "Contratar Implementação Agente" : "Contratar especialista dedicado";
  if (!hasActivePlan) {
    buttonLabel = "Plano ativo necessário";
  } else if (currentStatus === "pending_payment") {
    buttonLabel = "Continuar pagamento";
  } else if (currentStatus === "pending_review") {
    buttonLabel = "Comprovante em análise";
  } else if (currentStatus === "active") {
    buttonLabel =
      offer.offerType === "implementation" ? "Implementação Agente em execução" : "Especialista dedicado ativo";
  } else if (currentStatus === "rejected" || currentStatus === "expired" || currentStatus === "cancelled") {
    buttonLabel = "Gerar novo PIX";
  }

  return (
    <Card
      className={cn(
        "relative mx-auto flex h-full w-full max-w-[30rem] cursor-pointer flex-col rounded-[28px] border bg-white/95 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-950/80",
        offer.accent.border,
        isSelected && "ring-2 ring-offset-0 ring-gray-900/10 dark:ring-white/10",
        hasLiveAddon && "border-emerald-400 dark:border-emerald-500",
      )}
      onClick={onSelect}
    >
      <div className="absolute -top-3 left-5">
        <Badge className={cn("rounded-full px-3 py-1 text-xs font-semibold shadow-sm", offer.accent.badge)}>
          {hasLiveAddon ? "Seu pedido atual" : offer.badge}
        </Badge>
      </div>

      <CardHeader className="px-5 pb-4 pt-8 sm:px-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className={cn("rounded-xl p-2", offer.accent.iconWrap)}>
              <AccentIcon className={cn("h-5 w-5", offer.accent.iconColor)} />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-semibold leading-tight text-gray-900 dark:text-white">{offer.name}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{offer.description}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {shouldShowOriginalAmount(offer.originalAmount, offer.promotionalAmount) ? (
            <p className="mb-2 text-sm font-medium text-gray-400 line-through">{formatCurrency(offer.originalAmount)}</p>
          ) : null}

          <div className="flex flex-wrap items-end gap-x-1 gap-y-2">
            <span className="text-sm font-medium text-gray-500">R$</span>
            <span className={cn("text-[2.7rem] font-bold tracking-tight md:text-5xl", offer.accent.priceColor)}>
              {Number(offer.promotionalAmount).toFixed(2).replace(".", ",").split(",")[0]}
            </span>
            <span className={cn("text-xl font-bold tracking-tight md:text-2xl", offer.accent.priceColor)}>
              ,{Number(offer.promotionalAmount).toFixed(2).split(".")[1]}
            </span>
            <span className="pb-1 text-sm font-medium text-gray-500">pagamento único</span>
          </div>

          <div className={cn("mt-4 rounded-xl border p-3", offer.accent.note)}>
            <p className="text-sm font-medium">{offer.summary}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col px-5 pb-6 sm:px-6">
        <Button
          className={cn(
            "mb-5 h-12 w-full rounded-xl text-base font-semibold shadow-sm transition-all hover:scale-[1.01]",
            offer.offerType === "implementation"
              ? "bg-purple-600 text-white hover:bg-purple-700"
              : "bg-gray-900 text-white hover:bg-gray-800",
          )}
          disabled={buttonDisabled}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
            if (!buttonDisabled) {
              onAction();
            }
          }}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : buttonLabel}
        </Button>

        <ul className="space-y-3">
          {offer.highlights.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
              <div className={cn("mt-0.5 rounded-full p-0.5", offer.accent.checkWrap)}>
                <Check className={cn("h-3 w-3 flex-shrink-0", offer.accent.checkColor)} />
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
  statusContent,
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
  offer: OfferDefinition;
  addon: SpecialistAddonRecord | null;
  statusContent: StatusContent;
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
  const StatusIcon = statusContent.icon;

  return repairReactNodeText(
    <Card className="overflow-hidden rounded-[32px] border border-gray-200/80 bg-gradient-to-br from-white via-white to-emerald-50/50 shadow-sm dark:border-gray-800 dark:from-gray-950 dark:via-gray-950 dark:to-emerald-950/10">
      <CardContent className="px-5 py-6 sm:px-7 sm:py-8">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-gray-900 text-white hover:bg-gray-900">{offer.name}</Badge>
            {addon ? getStatusBadge(addon.status) : <Badge variant="outline">Aguardando seleção</Badge>}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
              Pagamento via PIX
            </p>
            <h2 className="text-xl font-semibold text-gray-950 dark:text-white">Finalize a contratação de {offer.name}</h2>
            <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{offer.paymentSummary}</p>
          </div>

          <div className={cn("rounded-2xl px-4 py-4 text-sm", statusContent.tone)}>
            <div className="flex items-start gap-3">
              <StatusIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="space-y-2">
                <p className="font-medium">{statusContent.title}</p>
                <p>{statusContent.description}</p>
                {addon?.receiptUrl ? (
                  <a
                    href={addon.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex text-sm font-medium underline underline-offset-4"
                  >
                    Abrir comprovante enviado
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          {addon?.pixQrCode ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <img
                  src={addon.pixQrCode}
                  alt={`QR Code PIX de ${offer.name}`}
                  className="h-52 w-52 rounded-3xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700"
                />
              </div>

              <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-950">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Valor</p>
                    {shouldShowOriginalAmount(
                      addon?.originalAmount ?? offer.originalAmount,
                      addon?.promotionalAmount ?? offer.promotionalAmount,
                    ) ? (
                      <p className="mt-1 text-sm text-gray-400 line-through">{displayOriginal}</p>
                    ) : null}
                    <p className="text-2xl font-semibold text-gray-950 dark:text-white">{displayPromotional}</p>
                  </div>
                  <QrCode className="h-6 w-6 text-emerald-600" />
                </div>

                <div className="mt-4 rounded-2xl bg-gray-50 p-3 dark:bg-gray-900">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                    PIX copia e cola
                  </p>
                  <p className="break-all text-xs leading-6 text-gray-700 dark:text-gray-300">
                    {addon.pixCode || "QR Code já gerado para esta contratação."}
                  </p>
                </div>

                <Button variant="outline" className="mt-4 w-full rounded-2xl" onClick={onCopyPix}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar código PIX
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center dark:border-gray-700 dark:bg-gray-950">
              <QrCode className="mx-auto mb-3 h-8 w-8 text-gray-400" />
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Escolha um dos cards desta dobra e clique em contratar para gerar o PIX sem procurar um checkout mais abaixo.
              </p>
            </div>
          )}

          <div className={cn("space-y-3", !canUploadReceipt && "opacity-70")}>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-gray-950 dark:text-white">Já paguei, enviar comprovante</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Aceita imagem ou PDF. O comprovante fica vinculado à contratação e aparece no admin de especialista.
              </p>
            </div>

            <Input
              ref={receiptInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={(event) => onReceiptChange(event.target.files?.[0] || null)}
              disabled={!canUploadReceipt || uploadPending}
            />

            {receiptFile ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Arquivo selecionado: {receiptFile.name}</p>
            ) : null}

            <Button className="w-full rounded-2xl" onClick={onUpload} disabled={!canUploadReceipt || !receiptFile || uploadPending}>
              {uploadPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Enviar comprovante
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SpecialistPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedOfferType, setSelectedOfferType] = useState<SpecialistOfferType>("specialist");
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<SpecialistCurrentResponse>({
    queryKey: ["/api/specialist-addon/current"],
  });

  const addonsByOffer = {
    ...emptyAddonsByOffer,
    ...(data?.addonsByOffer ?? {}),
  };
  const canPurchaseByOffer = {
    ...defaultPurchaseAvailability,
    ...(data?.canPurchaseByOffer ?? {}),
  };
  const selectedOffer = getOfferDefinition(selectedOfferType);
  const selectedAddon = addonsByOffer[selectedOfferType] ?? null;

  useEffect(() => {
    if (!visibleOfferTypes.includes(selectedOfferType)) {
      setSelectedOfferType("specialist");
    }
  }, [selectedOfferType]);

  const syncAddonState = (addon: SpecialistAddonRecord | null | undefined) => {
    if (!addon?.id || !addon.offerType) return;

    queryClient.setQueryData<SpecialistCurrentResponse>(["/api/specialist-addon/current"], (previous) => ({
      hasActivePlan: previous?.hasActivePlan ?? true,
      eligibilityReason: previous?.eligibilityReason ?? null,
      basePlanName: previous?.basePlanName ?? null,
      addonsByOffer: {
        ...emptyAddonsByOffer,
        ...(previous?.addonsByOffer ?? {}),
        [addon.offerType]: addon,
      },
      canPurchaseByOffer: {
        ...defaultPurchaseAvailability,
        ...(previous?.canPurchaseByOffer ?? {}),
        [addon.offerType]: false,
      },
    }));
  };

  const displayOriginal = useMemo(
    () => formatCurrency(selectedAddon?.originalAmount ?? selectedOffer.originalAmount),
    [selectedAddon?.originalAmount, selectedOffer.originalAmount],
  );
  const displayPromotional = useMemo(
    () => formatCurrency(selectedAddon?.promotionalAmount ?? selectedOffer.promotionalAmount),
    [selectedAddon?.promotionalAmount, selectedOffer.promotionalAmount],
  );
  const resetReceiptInput = () => {
    setReceiptFile(null);
    if (receiptInputRef.current) {
      receiptInputRef.current.value = "";
    }
  };

  const openCheckoutModal = (offerType: SpecialistOfferType) => {
    setSelectedOfferType(offerType);
    setCheckoutModalOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async (offerType: SpecialistOfferType) => {
      const response = await apiRequest("POST", "/api/specialist-addon/create", { offerType });
      return response.json();
    },
    onSuccess: (payload) => {
      syncAddonState(payload);
      queryClient.invalidateQueries({ queryKey: ["/api/specialist-addon/current"] });
      const createdOffer = getOfferDefinition(payload?.offerType);
      if (payload?.offerType) {
        setSelectedOfferType(payload.offerType);
      }
      setCheckoutModalOpen(true);
      toast({
        title: "QR Code gerado",
        description: `Faça o pagamento em PIX e envie o comprovante para liberar sua contratação de ${createdOffer.name}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao iniciar a contratação",
        description: error?.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAddon?.id || !receiptFile) {
        throw new Error("Selecione um comprovante antes de enviar.");
      }

      const formData = new FormData();
      formData.append("addonId", selectedAddon.id);
      formData.append("receipt", receiptFile);

      const response = await apiRequest("POST", "/api/specialist-addon/upload-receipt", formData);
      return response.json();
    },
    onSuccess: (payload) => {
      resetReceiptInput();
      syncAddonState(payload?.addon);
      queryClient.invalidateQueries({ queryKey: ["/api/specialist-addon/current"] });
      toast({
        title: "Comprovante enviado",
        description: payload?.message || "O admin vai validar sua contratação.",
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

  const canUploadReceipt = Boolean(selectedAddon && ["pending_payment", "pending_review"].includes(selectedAddon.status));

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statusContent: StatusContent = (() => {
    if (!selectedAddon) {
      return {
        tone: "bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:text-blue-100",
        icon: QrCode,
        title: `Selecione ${
          selectedOffer.offerType === "implementation" ? "a Implementação Agente" : "o Especialista dedicado"
        } para gerar o PIX`,
        description: selectedOffer.paymentSummary,
      };
    }

    if (selectedAddon.status === "active") {
      if (selectedOffer.offerType === "implementation") {
        return {
          tone: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
          icon: Sparkles,
          title: "Implementação Agente em execução",
          description:
            "Nossa equipe está executando a implementação aprovada para o seu ambiente e alinhando os detalhes do escopo com base no pedido validado.",
        };
      }

      return {
        tone: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
        icon: Crown,
        title: "Especialista dedicado ativo",
        description: `Seu especialista segue disponível para ajustes e acompanhamento até ${formatDate(selectedAddon.endsAt)}.`,
      };
    }

    if (selectedAddon.status === "pending_review") {
      return {
        tone: "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
        icon: Clock3,
        title: "Comprovante recebido e aguardando validação",
        description:
          selectedOffer.offerType === "implementation"
            ? "Assim que o comprovante for validado, a Implementação Agente entra em execução conforme o escopo aprovado."
            : "Assim que o comprovante for validado, o Especialista dedicado assume a configuração e o acompanhamento da sua operação.",
      };
    }

    if (selectedAddon.status === "pending_payment") {
      return {
        tone: "bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:text-blue-100",
        icon: QrCode,
        title: "Pagamento aguardando comprovante",
        description: `O QR Code da contratação de ${selectedOffer.name} já está liberado. Faça o PIX e envie o comprovante para análise.`,
      };
    }

    if (selectedAddon.status === "rejected") {
      return {
        tone: "bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-100",
        icon: ShieldCheck,
        title: "Comprovante rejeitado",
        description: "Você pode iniciar uma nova solicitação assim que quiser. Se necessário, envie um comprovante mais legível.",
      };
    }

    return {
      tone: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
      icon: ShieldCheck,
      title: "Nenhuma contratação em andamento",
      description: selectedOffer.paymentSummary,
    };
  })();

  return repairReactNodeText(
    <div className="flex-1 overflow-auto bg-white dark:bg-gray-950">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
        <div className="mx-auto max-w-4xl space-y-4 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <UserRoundCog className="h-7 w-7" />
          </div>

          <div className="space-y-3">
            <Badge className="bg-gray-900 text-white hover:bg-gray-900">Adicionais premium</Badge>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-950 dark:text-white md:text-5xl">
              Especialista dedicado para colocar sua IA em operação
            </h1>
            <p className="mx-auto max-w-3xl text-sm leading-7 text-gray-600 dark:text-gray-300 md:text-base">
              Um formato premium para quem quer a equipe assumindo a implementação, refinando a operação e
              acompanhando a operação com apoio direto do especialista.
            </p>
          </div>

          {data?.basePlanName ? (
            <div className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white/90 px-4 py-3 text-sm leading-6 text-gray-600 shadow-sm dark:border-gray-800 dark:bg-gray-950/70 dark:text-gray-300">
              <span className="font-medium text-gray-900 dark:text-white">Plano ativo da ferramenta:</span>{" "}
              <span className="break-words">{data.basePlanName}</span>
            </div>
          ) : null}
        </div>

        {!data?.hasActivePlan ? (
          <div className="mx-auto mt-6 max-w-4xl rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="space-y-3">
                {data?.eligibilityReason === "legacy_specialist_plan" ? (
                  <p>
                    Seu plano atual pertence a uma modalidade legada desses serviços. Agora estes
                    serviços são contratados separadamente do plano mensal da ferramenta.
                  </p>
                ) : (
                  <>
                    <p>A contratação do Especialista dedicado fica disponível somente para clientes com plano ativo.</p>
                    <Button size="sm" variant="outline" onClick={() => setLocation("/plans")}>
                      Ver planos e ativar conta
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mx-auto mt-6 max-w-5xl">
          <div className="grid grid-cols-1 gap-4 md:gap-6">
            {visibleOfferTypes.map((offerType) => {
              const offer = offerDefinitions[offerType];
              const offerAddon = addonsByOffer[offer.offerType];
              const hasCheckoutFlow = Boolean(
                offerAddon && ["pending_payment", "pending_review", "active"].includes(offerAddon.status),
              );

              return (
                <OfferCard
                  key={offer.offerType}
                  offer={offer}
                  isSelected={selectedOfferType === offer.offerType}
                  hasActivePlan={Boolean(data?.hasActivePlan)}
                  canPurchase={Boolean(canPurchaseByOffer[offer.offerType])}
                  addon={offerAddon}
                  isPending={createMutation.isPending && selectedOfferType === offer.offerType}
                  onSelect={() => setSelectedOfferType(offer.offerType)}
                  onAction={() => {
                    if (hasCheckoutFlow) {
                      openCheckoutModal(offer.offerType);
                      return;
                    }

                    setSelectedOfferType(offer.offerType);
                    createMutation.mutate(offer.offerType);
                  }}
                />
              );
            })}
          </div>
        </div>

        <Dialog
          open={checkoutModalOpen}
          onOpenChange={(open) => {
            setCheckoutModalOpen(open);
            if (!open) {
              resetReceiptInput();
            }
          }}
        >
          <DialogContent className="max-h-[92vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-xl">
            <DialogHeader className="sr-only">
              <DialogTitle>Checkout de {selectedOffer.name}</DialogTitle>
            </DialogHeader>
            <CheckoutPanel
              offer={selectedOffer}
              addon={selectedAddon}
              statusContent={statusContent}
              displayOriginal={displayOriginal}
              displayPromotional={displayPromotional}
              receiptFile={receiptFile}
              canUploadReceipt={canUploadReceipt}
              receiptInputRef={receiptInputRef}
              uploadPending={uploadMutation.isPending}
              onReceiptChange={setReceiptFile}
              onUpload={() => uploadMutation.mutate()}
              onCopyPix={async () => {
                if (!selectedAddon?.pixCode) return;
                await navigator.clipboard.writeText(selectedAddon.pixCode);
                toast({ title: "Código PIX copiado" });
              }}
            />
          </DialogContent>
        </Dialog>

        <div className="mx-auto mt-10 max-w-4xl">
          <h2 className="mb-6 text-center text-2xl font-semibold text-gray-900 dark:text-white">Perguntas frequentes</h2>

          <div className="space-y-2">
            {faqItems.map((item, index) => (
              <div
                key={item.question}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950"
              >
                <button
                  onClick={() => setFaqOpen(faqOpen === index ? null : index)}
                  className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50"
                >
                  <span className="pr-4 text-sm font-medium text-gray-900 dark:text-white">{item.question}</span>
                  {faqOpen === index ? (
                    <ChevronUp className="h-4 w-4 flex-shrink-0 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-500" />
                  )}
                </button>
                {faqOpen === index ? (
                  <div className="px-4 pb-4">
                    <p className="text-sm leading-6 text-gray-600 dark:text-gray-400">{item.answer}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
