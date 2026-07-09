import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import QRCode from "qrcode";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  LayoutTemplate,
  MessageCircle,
  PencilLine,
  Printer,
  QrCode,
  Sparkles,
  Wand2,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { AiAgentConfig, SmartQrcode, User, WhatsappConnection } from "@shared/schema";

import {
  pickInitialSavedQrcode,
  WHATSAPP_QR_LAST_SELECTED_STORAGE_KEY,
} from "./whatsapp-qr-generator-state";

type BusinessCategory = {
  id: string;
  slug: string;
  name: string;
  categoryGroup: string;
  groupLabel: string;
  icon: string;
  description: string | null;
  targetTool: string;
  welcomeMessage: string | null;
  color: string;
  userCount: number;
  sortOrder: number;
  isActive: boolean;
};

type CategoryGroup = {
  group: string;
  groupLabel: string;
  totalUsers: number;
  categories: BusinessCategory[];
};

type PreviewState = {
  pngDataUrl: string;
  svgMarkup: string;
  targetUrl: string;
};

type QrcodeDraft = {
  name: string;
  description: string;
  whatsappNumber: string;
  welcomeMessage: string;
  foregroundColor: string;
  backgroundColor: string;
  errorCorrection: "L" | "M" | "Q" | "H";
  qrSize: number;
  templateId: string | null;
  templateName: string | null;
};

const QR_SIZE_PRESETS = [
  { id: "mobile", label: "Mobile", size: 512, description: "Stories, bio e compartilhamento rapido", icon: MessageCircle },
  { id: "vitrine", label: "Vitrine", size: 1024, description: "Flyer, mesa, balcao e cardapio", icon: QrCode },
  { id: "placa", label: "Placa", size: 2048, description: "Fachada, placa externa e imobiliaria", icon: Printer },
  { id: "grafica", label: "Grafica", size: 3072, description: "Arquivo final em alta para impressao", icon: Download },
] as const;

function normalizePhoneDigits(value: string): string {
  let digits = "";

  for (const char of String(value || "")) {
    if (char >= "0" && char <= "9") digits += char;
  }

  return digits;
}

function buildWhatsAppTargetUrl(phoneNumber: string, message: string): string {
  const digits = normalizePhoneDigits(phoneNumber);
  if (!message.trim()) return `https://wa.me/${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message.trim())}`;
}

function formatRelativeDate(value?: string | Date | null): string {
  if (!value) return "Agora mesmo";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Agora mesmo";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function createDefaultMessage(category: BusinessCategory | null): string {
  if (!category) return "Ola! Quero falar com voces pelo WhatsApp.";
  return category.welcomeMessage || `Ola! Quero atendimento sobre ${category.name.toLowerCase()}.`;
}

function createMessageSuggestions(category: BusinessCategory | null): string[] {
  if (!category) {
    return [
      "Ola! Quero mais informacoes.",
      "Oi! Pode me atender por aqui?",
      "Ola! Vim pelo QR Code e quero falar com voces.",
    ];
  }

  const suggestions = new Set<string>();
  suggestions.add(createDefaultMessage(category));

  switch (category.targetTool) {
    case "delivery":
      suggestions.add("Ola! Quero ver o cardapio.");
      suggestions.add("Oi! Quero fazer um pedido agora.");
      break;
    case "agendamento":
      suggestions.add("Ola! Quero agendar um horario.");
      suggestions.add("Oi! Pode me passar os horarios disponiveis?");
      break;
    case "vendas":
      suggestions.add("Ola! Quero ver os produtos disponiveis.");
      suggestions.add("Oi! Quero um orcamento sem compromisso.");
      break;
    default:
      if (category.categoryGroup === "imobiliario") {
        suggestions.add("Ola! Tenho interesse neste imovel.");
        suggestions.add("Oi! Quero agendar uma visita.");
      } else {
        suggestions.add(`Ola! Quero atendimento sobre ${category.name.toLowerCase()}.`);
        suggestions.add("Oi! Pode me explicar como funciona?");
      }
      break;
  }

  return Array.from(suggestions).slice(0, 3);
}

function buildPresetDraft(category: BusinessCategory | null, currentNumber = ""): QrcodeDraft {
  return {
    name: category ? `QR WhatsApp ${category.name}` : "QR WhatsApp",
    description: category ? `QR para abrir conversa no WhatsApp do segmento ${category.name}.` : "QR para abrir conversa no WhatsApp.",
    whatsappNumber: currentNumber,
    welcomeMessage: createDefaultMessage(category),
    foregroundColor: category?.color || "#111827",
    backgroundColor: "#ffffff",
    errorCorrection: "H",
    qrSize: 1024,
    templateId: category?.slug || null,
    templateName: category?.name || null,
  };
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(filename: string, dataUrl: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export default function WhatsAppQrGeneratorPage() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [selectedCategorySlug, setSelectedCategorySlug] = useState("");
  const [selectedQrcodeId, setSelectedQrcodeId] = useState<string | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(true);
  const [draft, setDraft] = useState<QrcodeDraft>(() => buildPresetDraft(null));
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const initialStateAppliedRef = useRef(false);

  const pickerRef = useRef<HTMLDivElement | null>(null);
  const personalizationRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const { data: groupsData, isLoading: categoriesLoading } = useQuery<{ groups: CategoryGroup[] }>({
    queryKey: ["/api/business-categories/groups"],
    queryFn: async () => {
      const response = await fetch("/api/business-categories/groups");
      if (!response.ok) throw new Error("Falha ao carregar categorias");
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: businessTypeData } = useQuery<{ businessType: string | null }>({
    queryKey: ["/api/user/business-type"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: agentConfig } = useQuery<AiAgentConfig | null>({
    queryKey: ["/api/agent/config"],
    staleTime: 60_000,
  });

  const { data: primaryConnection } = useQuery<WhatsappConnection | null>({
    queryKey: ["/api/whatsapp/connection"],
    staleTime: 60_000,
  });

  const { data: qrcodesData, isLoading: qrcodesLoading } = useQuery<{ qrcodes: SmartQrcode[] }>({
    queryKey: ["/api/qrcodes"],
  });

  const groups = groupsData?.groups || [];
  const categories = groups.flatMap((group) => group.categories);
  const qrcodes = qrcodesData?.qrcodes || [];
  const selectedCategory = categories.find((category) => category.slug === selectedCategorySlug) || null;
  const hasCategorySelected = Boolean(selectedCategory || draft.templateId || draft.templateName);
  const selectedCategoryName = selectedCategory?.name || draft.templateName || "Tipo de negocio";
  const selectedCategoryDescription =
    selectedCategory?.description || `Fluxo pensado para ${selectedCategoryName.toLowerCase()}.`;
  const selectedCategoryGroupLabel = selectedCategory?.groupLabel || "Segmento";
  const selectedCategoryIcon = selectedCategory?.icon || "💬";
  const messageSuggestions = createMessageSuggestions(selectedCategory);

  function rememberSelectedQrcode(id: string | null) {
    if (typeof window === "undefined") return;

    if (id) {
      window.localStorage.setItem(WHATSAPP_QR_LAST_SELECTED_STORAGE_KEY, id);
      return;
    }

    window.localStorage.removeItem(WHATSAPP_QR_LAST_SELECTED_STORAGE_KEY);
  }

  function loadSavedQrcode(qrcode: SmartQrcode) {
    const nextCategory =
      categories.find((category) => category.slug === qrcode.templateId) ||
      categories.find((category) => category.slug === selectedCategorySlug) ||
      null;

    setSelectedCategorySlug(nextCategory?.slug || "");

    setShowCategoryPicker(false);
    setSelectedQrcodeId(qrcode.id);
    rememberSelectedQrcode(qrcode.id);
    setDraft({
      name: qrcode.name,
      description: qrcode.description || "",
      whatsappNumber: qrcode.whatsappNumber,
      welcomeMessage: qrcode.welcomeMessage || "",
      foregroundColor: qrcode.foregroundColor || "#111827",
      backgroundColor: qrcode.backgroundColor || "#ffffff",
      errorCorrection: (qrcode.errorCorrection as "L" | "M" | "Q" | "H") || "H",
      qrSize: qrcode.qrSize || 1024,
      templateId: qrcode.templateId || nextCategory?.slug || null,
      templateName: qrcode.templateName || nextCategory?.name || null,
    });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        whatsappNumber: draft.whatsappNumber,
        welcomeMessage: draft.welcomeMessage.trim() || null,
        foregroundColor: draft.foregroundColor,
        backgroundColor: draft.backgroundColor,
        errorCorrection: draft.errorCorrection,
        qrSize: draft.qrSize,
        templateId: draft.templateId,
        templateName: draft.templateName,
        targetUrl: buildWhatsAppTargetUrl(draft.whatsappNumber, draft.welcomeMessage),
        isActive: true,
      };

      const response = await apiRequest(
        selectedQrcodeId ? "PATCH" : "POST",
        selectedQrcodeId ? `/api/qrcodes/${selectedQrcodeId}` : "/api/qrcodes",
        payload
      );

      return response.json() as Promise<{ qrcode: SmartQrcode }>;
    },
    onSuccess: ({ qrcode }) => {
      loadSavedQrcode(qrcode);
      queryClient.invalidateQueries({ queryKey: ["/api/qrcodes"] });
      toast({
        title: selectedQrcodeId ? "QR Code atualizado" : "QR Code salvo",
        description: "O QR ficou salvo na sua conta e pode ser reutilizado.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar QR Code",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (initialStateAppliedRef.current) return;
    if (categoriesLoading || qrcodesLoading) return;

    const preferredQrcode =
      typeof window === "undefined"
        ? null
        : pickInitialSavedQrcode(
            qrcodes,
            window.localStorage.getItem(WHATSAPP_QR_LAST_SELECTED_STORAGE_KEY)
          );

    if (preferredQrcode) {
      initialStateAppliedRef.current = true;
      loadSavedQrcode(preferredQrcode);
      return;
    }

    if (!categories.length) return;

    initialStateAppliedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const segmentFromUrl = params.get("segment");
    const preferredSlug = segmentFromUrl || businessTypeData?.businessType || "";
    const preferredCategory = preferredSlug
      ? categories.find((item) => item.slug === preferredSlug) || null
      : null;
    const fallbackNumber =
      primaryConnection?.phoneNumber ||
      (user as User | undefined)?.whatsappNumber ||
      (user as User | undefined)?.phone ||
      "";

    if (preferredCategory) {
      setSelectedCategorySlug(preferredCategory.slug);
      setDraft(buildPresetDraft(preferredCategory, fallbackNumber));
      setShowCategoryPicker(false);
      return;
    }

    if (fallbackNumber) {
      setDraft((current) => ({
        ...current,
        whatsappNumber: current.whatsappNumber || fallbackNumber,
      }));
    }

    setShowCategoryPicker(true);
  }, [
    categories,
    categoriesLoading,
    businessTypeData?.businessType,
    primaryConnection?.phoneNumber,
    qrcodes,
    qrcodesLoading,
    user,
  ]);

  useEffect(() => {
    if (draft.whatsappNumber || selectedQrcodeId) return;

    const fallbackNumber =
      primaryConnection?.phoneNumber ||
      (user as User | undefined)?.whatsappNumber ||
      (user as User | undefined)?.phone ||
      "";

    if (fallbackNumber) {
      setDraft((current) => ({ ...current, whatsappNumber: fallbackNumber }));
    }
  }, [draft.whatsappNumber, primaryConnection?.phoneNumber, selectedQrcodeId, user]);

  useEffect(() => {
    let cancelled = false;

    async function generatePreview() {
      if (normalizePhoneDigits(draft.whatsappNumber).length < 8) {
        setPreview(null);
        return;
      }

      setIsGeneratingPreview(true);

      try {
        const targetUrl = buildWhatsAppTargetUrl(draft.whatsappNumber, draft.welcomeMessage);
        const [pngDataUrl, svgMarkup] = await Promise.all([
          QRCode.toDataURL(targetUrl, {
            errorCorrectionLevel: draft.errorCorrection,
            margin: 1,
            width: draft.qrSize,
            color: {
              dark: draft.foregroundColor,
              light: draft.backgroundColor,
            },
          }),
          QRCode.toString(targetUrl, {
            type: "svg",
            errorCorrectionLevel: draft.errorCorrection,
            margin: 1,
            width: draft.qrSize,
            color: {
              dark: draft.foregroundColor,
              light: draft.backgroundColor,
            },
          }),
        ]);

        if (!cancelled) {
          setPreview({ pngDataUrl, svgMarkup, targetUrl });
        }
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setIsGeneratingPreview(false);
      }
    }

    const timer = window.setTimeout(generatePreview, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    draft.backgroundColor,
    draft.errorCorrection,
    draft.foregroundColor,
    draft.qrSize,
    draft.welcomeMessage,
    draft.whatsappNumber,
  ]);

  function applyCategory(category: BusinessCategory) {
    setSelectedCategorySlug(category.slug);
    setSelectedQrcodeId(null);
    setShowCategoryPicker(false);
    setDraft((current) => buildPresetDraft(category, current.whatsappNumber));

    if (!isMobile) return;

    window.setTimeout(() => {
      personalizationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function startNewDraft() {
    setSelectedCategorySlug("");
    setSelectedQrcodeId(null);
    setDraft((current) => buildPresetDraft(null, current.whatsappNumber));
    setShowCategoryPicker(true);
    window.requestAnimationFrame(() => {
      pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function reopenCategoryPicker() {
    setShowCategoryPicker(true);
    window.requestAnimationFrame(() => {
      pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function jumpToSection(target: "message" | "size" | "preview") {
    const section =
      target === "message"
        ? personalizationRef.current
        : target === "size"
          ? sizeRef.current
          : previewRef.current;

    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copiado`, description: "Voce pode colar onde quiser." });
    } catch {
      toast({
        title: `Nao foi possivel copiar ${label.toLowerCase()}`,
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  function downloadCurrentPng() {
    if (preview) downloadDataUrl(`${draft.name || "qrcode-whatsapp"}.png`, preview.pngDataUrl);
  }

  function downloadCurrentSvg() {
    if (preview) {
      downloadTextFile(`${draft.name || "qrcode-whatsapp"}.svg`, preview.svgMarkup, "image/svg+xml");
    }
  }

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Badge variant="secondary" className="w-fit gap-2 px-3 py-1">
              <Sparkles className="h-3.5 w-3.5" />
              Ferramenta guiada para QR Code WhatsApp
            </Badge>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">QR que abre o WhatsApp com a mensagem certa</h1>
              <p className="text-sm text-muted-foreground">
                Escolha o segmento, ajuste a mensagem inicial e baixe em tamanhos prontos para mobile, vitrine,
                placa e grafica.
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Button variant="outline" onClick={() => setLocation("/ferramentas")} className="w-full sm:w-auto">
              Voltar para ferramentas
            </Button>
            <Button variant="outline" onClick={startNewDraft} className="w-full sm:w-auto">
              Novo QR
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !preview}
              className="w-full sm:w-auto"
            >
              {selectedQrcodeId ? "Salvar alteracoes" : "Salvar QR"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="space-y-6">
            <div ref={pickerRef} className="scroll-mt-24">
              <Card className="border-border/70">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-lg">1. Escolha o tipo de negocio</CardTitle>
                  <CardDescription>
                    Depois que voce escolhe um nicho, a lista recolhe e as configuracoes ficam na primeira dobra.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {!showCategoryPicker && selectedQrcodeId && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      Este QR salvo abriu direto para edicao. Se quiser criar outro, use "Novo QR" ou troque o tipo de
                      negocio abaixo.
                    </div>
                  )}

                  {categoriesLoading && showCategoryPicker && (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <Skeleton key={index} className="h-24 rounded-xl" />
                      ))}
                    </div>
                  )}

                  {!categoriesLoading && showCategoryPicker && (
                    <>
                      {groups.map((group) => (
                        <div key={group.group} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {group.groupLabel}
                            </p>
                            <Separator className="flex-1" />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {group.categories.map((category) => (
                              <button
                                key={category.slug}
                                type="button"
                                onClick={() => applyCategory(category)}
                                className={cn(
                                  "rounded-2xl border px-4 py-4 text-left transition-all",
                                  selectedCategorySlug === category.slug
                                    ? "border-primary bg-primary/5 shadow-sm"
                                    : "border-border/70 hover:border-primary/40 hover:bg-accent"
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-2xl leading-none">{category.icon}</p>
                                    <p className="mt-3 font-semibold">{category.name}</p>
                                  </div>
                                  {selectedCategorySlug === category.slug && (
                                    <span className="rounded-full bg-primary/10 p-1 text-primary">
                                      <Check className="h-4 w-4" />
                                    </span>
                                  )}
                                </div>
                                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                                  {category.description || `Fluxo pensado para ${category.name.toLowerCase()}.`}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {!showCategoryPicker && hasCategorySelected && (
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
                                {selectedCategoryIcon}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-primary">Negocio selecionado</p>
                                <h2 className="text-xl font-semibold">{selectedCategoryName}</h2>
                              </div>
                            </div>
                            <p className="max-w-2xl text-sm text-muted-foreground">{selectedCategoryDescription}</p>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="secondary" className="rounded-full px-3 py-1">
                                {selectedCategoryGroupLabel}
                              </Badge>
                              <Badge variant="outline" className="rounded-full px-3 py-1">
                                Mensagem inicial sugerida
                              </Badge>
                              <Badge variant="outline" className="rounded-full px-3 py-1">
                                Layout pronto para mobile e grafica
                              </Badge>
                            </div>
                          </div>

                          <Button variant="outline" onClick={reopenCategoryPicker} className="w-full md:w-auto">
                            Escolher outro tipo de negocio
                            <ChevronDown className="ml-2 h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-3">
                        <Button variant="outline" className="justify-start" onClick={() => jumpToSection("message")}>
                          <Wand2 className="mr-2 h-4 w-4" />
                          Mensagem inicial
                        </Button>
                        <Button variant="outline" className="justify-start" onClick={() => jumpToSection("size")}>
                          <LayoutTemplate className="mr-2 h-4 w-4" />
                          Tamanho e cores
                        </Button>
                        <Button variant="outline" className="justify-start" onClick={() => jumpToSection("preview")}>
                          <QrCode className="mr-2 h-4 w-4" />
                          Ver previa
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {!hasCategorySelected && (
              <Card className="border-dashed border-border/70">
                <CardContent className="flex flex-col gap-3 px-6 py-8 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Selecione primeiro um tipo de negocio.</p>
                  <p>
                    Depois da escolha, esta tela troca da lista de nichos para as etapas de mensagem e tamanho sem te
                    empurrar para baixo.
                  </p>
                </CardContent>
              </Card>
            )}

            {hasCategorySelected && (
              <div ref={personalizationRef} className="scroll-mt-24">
                <Card className="border-border/70">
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-lg">2. Personalize a abertura</CardTitle>
                    <CardDescription>
                      A IA continua usando o prompt do seu agente. Aqui voce so define a primeira frase que chega
                      pronta no WhatsApp.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="qr-name">Nome interno</Label>
                        <Input
                          id="qr-name"
                          value={draft.name}
                          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Ex: QR Placa da Imobiliaria"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="qr-phone">WhatsApp do negocio</Label>
                        <Input
                          id="qr-phone"
                          value={draft.whatsappNumber}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, whatsappNumber: event.target.value }))
                          }
                          placeholder="5511999999999"
                        />
                        <p className="text-xs text-muted-foreground">
                          Dica: use DDI + DDD. O QR remove espacos, parenteses e tracos sozinho.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="qr-description">Contexto do material</Label>
                      <Input
                        id="qr-description"
                        value={draft.description}
                        onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                        placeholder="Ex: placa de fachada, cardapio da mesa, flyer de lancamento"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Wand2 className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Mensagens sugeridas</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {messageSuggestions.map((message) => (
                          <Button
                            key={message}
                            type="button"
                            variant="outline"
                            className="h-auto whitespace-normal text-left"
                            onClick={() => setDraft((current) => ({ ...current, welcomeMessage: message }))}
                          >
                            {message}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="qr-message">Mensagem padrao editavel</Label>
                      <Textarea
                        id="qr-message"
                        value={draft.welcomeMessage}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, welcomeMessage: event.target.value }))
                        }
                        placeholder="Ola! Quero falar com voces pelo WhatsApp."
                        rows={5}
                      />
                      <p className="text-xs text-muted-foreground">
                        O cliente escaneia, cai direto no WhatsApp e pode enviar essa mensagem como base ou editar
                        antes de mandar.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      {agentConfig?.prompt
                        ? "Seu agente ja tem prompt configurado. O QR usa essa mensagem so como abertura e o resto do atendimento continua com a IA do negocio."
                        : "Mesmo sem prompt salvo, voce ja pode usar o QR agora e depois complementar o atendimento com o seu agente."}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {hasCategorySelected && (
              <div ref={sizeRef} className="scroll-mt-24">
                <Card className="border-border/70">
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-lg">3. Escolha o tamanho final</CardTitle>
                    <CardDescription>
                      Cada preset muda a resolucao do arquivo exportado para o material certo.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-3 md:grid-cols-2">
                      {QR_SIZE_PRESETS.map((preset) => {
                        const Icon = preset.icon;
                        const isActive = draft.qrSize === preset.size;

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => setDraft((current) => ({ ...current, qrSize: preset.size }))}
                            className={cn(
                              "rounded-2xl border px-4 py-4 text-left transition-all",
                              isActive
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-border/70 hover:border-primary/40 hover:bg-accent"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  "rounded-xl p-2",
                                  isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                )}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <div>
                                <p className="font-semibold">{preset.label}</p>
                                <p className="text-xs text-muted-foreground">{preset.size}px</p>
                              </div>
                            </div>
                            <p className="mt-3 text-sm text-muted-foreground">{preset.description}</p>
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="qr-foreground">Cor do QR</Label>
                        <div className="flex items-center gap-3">
                          <Input
                            id="qr-foreground"
                            type="color"
                            value={draft.foregroundColor}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, foregroundColor: event.target.value }))
                            }
                            className="h-11 w-16 p-1"
                          />
                          <Input
                            value={draft.foregroundColor}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, foregroundColor: event.target.value }))
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="qr-background">Fundo</Label>
                        <div className="flex items-center gap-3">
                          <Input
                            id="qr-background"
                            type="color"
                            value={draft.backgroundColor}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, backgroundColor: event.target.value }))
                            }
                            className="h-11 w-16 p-1"
                          />
                          <Input
                            value={draft.backgroundColor}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, backgroundColor: event.target.value }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {selectedCategory && (
              <Card className="border-border/70">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-lg">Quer usar isso no fluxo do segmento?</CardTitle>
                  <CardDescription>
                    Continue no setup de {selectedCategory.name.toLowerCase()} ou volte para editar o agente principal.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setLocation(`/ferramentas/${selectedCategory.slug}`)}>
                    Abrir segmento
                  </Button>
                  <Button variant="outline" onClick={() => setLocation("/meu-agente-ia")}>
                    Editar prompt da IA
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="self-start space-y-6 xl:sticky xl:top-6">
            <div ref={previewRef} className="scroll-mt-24">
              <Card className="border-border/70">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-lg">Previa ao vivo</CardTitle>
                  <CardDescription>
                    No desktop ela fica do lado direito. No celular, continua em blocos grandes e faceis de tocar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-[28px] border bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4 sm:p-5">
                    <div className="rounded-[24px] border bg-white p-4 shadow-sm sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{draft.name || "QR WhatsApp"}</p>
                          <p className="text-xs text-muted-foreground">
                            {hasCategorySelected ? selectedCategoryName : "Mensagem direta para o WhatsApp"}
                          </p>
                        </div>
                        <Badge variant="secondary">{draft.qrSize}px</Badge>
                      </div>

                      <div className="mt-5 rounded-3xl border bg-white p-4">
                        <div className="mx-auto flex min-h-[240px] items-center justify-center rounded-2xl bg-slate-50 p-4">
                          {preview ? (
                            <img
                              src={preview.pngDataUrl}
                              alt="Previa do QR Code"
                              className="aspect-square w-full max-w-[280px] rounded-2xl object-contain"
                            />
                          ) : (
                            <div className="space-y-2 text-center text-muted-foreground">
                              <QrCode className="mx-auto h-10 w-10" />
                              <p className="text-sm">Preencha um numero de WhatsApp valido para gerar a previa.</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-5 space-y-3">
                        <div className="rounded-2xl border bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Mensagem que chega pronta
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-foreground">
                            {draft.welcomeMessage || "Sem mensagem padrao. O QR abrira so a conversa."}
                          </p>
                        </div>

                        <div className="rounded-2xl border bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Link final
                          </p>
                          <p className="mt-2 break-all text-xs text-muted-foreground">
                            {preview?.targetUrl || "https://wa.me/..."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isGeneratingPreview && (
                    <div className="rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
                      Gerando previa do QR Code...
                    </div>
                  )}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      variant="outline"
                      onClick={() => preview && copyToClipboard(preview.targetUrl, "Link")}
                      disabled={!preview}
                      className="min-h-11"
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copiar link
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => copyToClipboard(draft.welcomeMessage, "Mensagem")}
                      disabled={!draft.welcomeMessage.trim()}
                      className="min-h-11"
                    >
                      <PencilLine className="mr-2 h-4 w-4" />
                      Copiar mensagem
                    </Button>
                    <Button onClick={downloadCurrentPng} disabled={!preview} className="min-h-11">
                      <Download className="mr-2 h-4 w-4" />
                      Baixar PNG
                    </Button>
                    <Button variant="outline" onClick={downloadCurrentSvg} disabled={!preview} className="min-h-11">
                      <Download className="mr-2 h-4 w-4" />
                      Baixar SVG
                    </Button>
                  </div>

                  {isMobile && hasCategorySelected && (
                    <div className="grid gap-2 rounded-2xl border border-dashed p-3">
                      <Button variant="outline" className="justify-start" onClick={() => jumpToSection("message")}>
                        <Wand2 className="mr-2 h-4 w-4" />
                        Voltar para mensagem
                      </Button>
                      <Button variant="outline" className="justify-start" onClick={() => jumpToSection("size")}>
                        <LayoutTemplate className="mr-2 h-4 w-4" />
                        Ajustar tamanho e cores
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/70">
              <CardHeader className="space-y-1">
                <CardTitle className="text-lg">QR Codes salvos</CardTitle>
                <CardDescription>Edite versoes antigas ou use como base para um novo material.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {qrcodesLoading && (
                  <>
                    <Skeleton className="h-24 rounded-xl" />
                    <Skeleton className="h-24 rounded-xl" />
                  </>
                )}

                {!qrcodesLoading && !qrcodes.length && (
                  <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    Ainda nao ha QR salvo nesta conta.
                  </div>
                )}

                {qrcodes
                  .slice()
                  .sort((left, right) => {
                    const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();
                    const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();
                    return rightTime - leftTime;
                  })
                  .map((qrcode) => (
                  <button
                    key={qrcode.id}
                    type="button"
                    onClick={() => loadSavedQrcode(qrcode)}
                    className={cn(
                      "w-full rounded-2xl border px-4 py-4 text-left transition-all",
                      selectedQrcodeId === qrcode.id
                        ? "border-primary bg-primary/5"
                        : "border-border/70 hover:border-primary/40 hover:bg-accent"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{qrcode.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Atualizado em {formatRelativeDate(qrcode.updatedAt)}
                        </p>
                      </div>
                      <Badge variant="secondary">{qrcode.scanCount || 0} scans</Badge>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                      {qrcode.welcomeMessage || "Sem mensagem padrao."}
                    </p>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
