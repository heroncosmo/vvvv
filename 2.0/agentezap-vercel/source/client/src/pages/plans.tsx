import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Check, Loader2, Shield, Zap, Crown, ChevronDown, ChevronUp, Tag, Copy, Clock, Sparkles, Star, Gift, Calendar, CreditCard } from "lucide-react";
import type { Plan, Subscription } from "@shared/schema";
import { useState, useEffect, useRef } from "react";
import { QrCode, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { repairReactNodeText } from "@/lib/repair-react-node";
import { SubscribeModal } from "@/components/subscribe-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";
import { getSubscriptionChargeSummary } from "@shared/subscriptionChargeSummary";

// ----------------------------------------------------------------
// COMPONENTE: Pagina de Plano de Revenda com QR Code PIX e Upload de Comprovante
// ----------------------------------------------------------------
interface ResellerPlanPageProps {
  resellerPlan: {
    isResellerClient: boolean;
    status?: string;
    reseller?: {
      companyName: string;
      supportEmail?: string;
      supportPhone?: string;
      pixKey?: string;
      pixKeyType?: string;
      pixHolderName?: string;
      pixBankName?: string;
    };
    plan?: {
      name: string;
      price: string;
      features: string[];
    };
  };
  createResellerSubscriptionMutation: any;
  setSelectedPlan: (plan: string) => void;
  setPendingSubscriptionId: (id: string | null) => void;
  setSubscribeModalOpen: (open: boolean) => void;
}

interface ReceiptApprovalState {
  title: string;
  description: string;
}

function ResellerPlanPage({ 
  resellerPlan, 
  createResellerSubscriptionMutation, 
  setSelectedPlan,
  setPendingSubscriptionId,
  setSubscribeModalOpen
}: ResellerPlanPageProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [loadingPix, setLoadingPix] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [receiptApprovalState, setReceiptApprovalState] = useState<ReceiptApprovalState | null>(null);
  const [pendingSubscription, setPendingSubscription] = useState<any>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // Criar assinatura e gerar PIX
  const handleActivatePlan = async () => {
    setSelectedPlan("reseller");
    
    try {
      // Criar assinatura via API
      const response = await apiClient.post('/api/reseller-client/subscription/create', {});
      const subscription = response.data;
      setPendingSubscription(subscription);
      setPendingSubscriptionId(subscription.id);
      
      // Gerar QR Code PIX
      await generatePixForSubscription(subscription.id);
    } catch (error: any) {
      toast({
        title: "Erro ao criar assinatura",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive"
      });
    }
  };

  // Gerar QR Code PIX via API
  const generatePixForSubscription = async (subscriptionId: string) => {
    setLoadingPix(true);
    try {
      const response = await apiClient.post('/api/payments/generate-pix', { subscriptionId });
      const data = response.data;
      
      setPixQrCode(data.pixQrCode);
      setPixCode(data.pixCode);
    } catch (error: any) {
      console.error("Erro ao gerar PIX:", error);
      toast({
        title: "Erro ao gerar QR Code",
        description: error.message || "Tente copiar a chave PIX manualmente",
        variant: "destructive"
      });
    } finally {
      setLoadingPix(false);
    }
  };

  // Upload de comprovante
  const handleReceiptUpload = async () => {
    if (!receiptFile || !pendingSubscription) {
      toast({ title: "Erro", description: "Selecione um arquivo", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("receipt", receiptFile);
      formData.append("subscriptionId", pendingSubscription.id);
      formData.append("paymentId", `manual_${pendingSubscription.id}`);
      formData.append("amount", resellerPlan.plan?.price || "0");

      const response = await fetch("/api/payment-receipts/upload", {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const data = await response.json();
      setReceiptApprovalState({
        title: data.message || "Pagamento aprovado",
        description: data.description || "Você pode usufruir da sua assinatura.",
      });
      toast({
        title: data.message || "Pagamento aprovado",
        description: data.description || "Você pode usufruir da sua assinatura."
      });
    } catch (error: any) {
      toast({
        title: "Erro ao enviar",
        description: error.message || "Tente novamente",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleApprovedContinue = () => {
    setReceiptApprovalState(null);
    setReceiptFile(null);
    setShowUploadModal(false);
    setLocation("/");
  };

  const copyPixCode = () => {
    if (pixCode) {
      navigator.clipboard.writeText(pixCode);
      toast({ title: "Código PIX copiado!" });
    }
  };

  return repairReactNodeText(
    <div className="flex-1 overflow-auto bg-transparent">
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-12">
        <div className="text-center mb-8">
          <Badge className="mb-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-0">
            Plano Exclusivo
          </Badge>
          <h1 className="text-xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">
            {resellerPlan.reseller?.companyName || "Seu Revendedor"}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Assine agora e tenha acesso completo à plataforma
          </p>
        </div>

        <Card className="border-2 border-purple-500/50 shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Crown className="h-6 w-6 text-purple-500" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {resellerPlan.plan?.name}
              </h2>
            </div>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-4xl font-bold text-purple-600">
                R$ {Number(resellerPlan.plan?.price || 0).toFixed(2).replace('.', ',')}
              </span>
              <span className="text-gray-500">/mês</span>
            </div>
          </CardHeader>
          
          <CardContent className="pt-0">
            <div className="space-y-3 py-4">
              {resellerPlan.plan?.features.map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className="text-gray-600 dark:text-gray-300">{feature}</span>
                </div>
              ))}
            </div>
            
            {/* Seção de Pagamento PIX */}
            {resellerPlan.reseller?.pixKey && (
              <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
                {!pixQrCode && !loadingPix && (
                  <div className="text-center">
                    <p className="text-lg font-bold text-yellow-800 dark:text-yellow-200 mb-2">
                      Pague via PIX
                    </p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-4">
                      Clique abaixo para gerar o QR Code
                    </p>
                    <Button 
                      onClick={handleActivatePlan}
                      className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                      disabled={createResellerSubscriptionMutation.isPending}
                    >
                      {createResellerSubscriptionMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <QrCode className="h-4 w-4 mr-2" />
                      )}
                      Gerar QR Code PIX
                    </Button>
                  </div>
                )}

                {loadingPix && (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-yellow-600" />
                    <p className="mt-2 text-sm text-yellow-700">Gerando QR Code...</p>
                  </div>
                )}

                {pixQrCode && !loadingPix && (
                  <div className="text-center space-y-4">
                    <p className="text-lg font-bold text-yellow-800 dark:text-yellow-200">
                      Escaneie para pagar
                    </p>
                    
                    {/* QR Code */}
                    <div className="flex justify-center">
                      <img 
                        src={pixQrCode} 
                        alt="QR Code PIX" 
                        className="w-48 h-48 rounded-lg border-2 border-yellow-300"
                      />
                    </div>

                    {/* Valor */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                      <p className="text-sm text-gray-500">Valor</p>
                      <p className="text-2xl font-bold text-purple-600">
                        R$ {Number(resellerPlan.plan?.price || 0).toFixed(2).replace('.', ',')}
                      </p>
                    </div>

                    {/* Copia e Cola */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-left">
                      <p className="text-xs font-medium text-gray-500 mb-1">Pix Copia e Cola</p>
                      <code className="block text-[10px] leading-relaxed font-mono text-gray-800 break-all bg-gray-100 dark:bg-gray-700 p-2 rounded">
                        {pixCode}
                      </code>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full mt-2"
                        onClick={copyPixCode}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copiar código
                      </Button>
                    </div>

                    {/* Dados bancários */}
                    <div className="space-y-2 text-left">
                      {resellerPlan.reseller.pixHolderName && (
                        <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded p-2 text-sm">
                          <span className="text-gray-500">Titular:</span>
                          <span className="font-medium">{resellerPlan.reseller.pixHolderName}</span>
                        </div>
                      )}
                      {resellerPlan.reseller.pixBankName && (
                        <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded p-2 text-sm">
                          <span className="text-gray-500">Banco:</span>
                          <span className="font-medium">{resellerPlan.reseller.pixBankName}</span>
                        </div>
                      )}
                    </div>

                    {/* Botão "Já paguei" */}
                    <Button 
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => setShowUploadModal(true)}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Já paguei? Enviar comprovante
                    </Button>

                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      Após o pagamento, clique em "Já paguei" para enviar o comprovante
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
          
          <CardFooter className="flex flex-col gap-4">
            {/* Informações de contato do revendedor */}
            {(resellerPlan.reseller?.supportEmail || resellerPlan.reseller?.supportPhone) && (
              <div className="text-center text-sm text-gray-500">
                <p>Dúvidas? Entre em contato:</p>
                {resellerPlan.reseller?.supportEmail && (
                  <p className="font-medium">{resellerPlan.reseller.supportEmail}</p>
                )}
                {resellerPlan.reseller?.supportPhone && (
                  <p className="font-medium">{resellerPlan.reseller.supportPhone}</p>
                )}
              </div>
            )}
          </CardFooter>
        </Card>
      </div>

      {/* Modal de Upload de Comprovante */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar Comprovante PIX</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {receiptApprovalState ? (
              <div className="space-y-4 text-center py-4">
    <div className={cn("flex items-center gap-1.5 text-gray-600", className)}>
      <Clock className="h-3 w-3 text-gray-400" />
      <span className="font-mono font-semibold">
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
    </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-600">
                    {receiptApprovalState.title}
                  </p>
                  <p className="text-2xl font-semibold text-neutral-950">
                    Você pode usufruir da sua assinatura.
                  </p>
                  {receiptApprovalState.description !== "Você pode usufruir da sua assinatura." ? (
                    <p className="text-sm text-gray-500">
                      {receiptApprovalState.description}
                    </p>
                  ) : null}
                </div>
                <Button
                  className="mx-auto h-11 min-w-[180px] rounded-full bg-neutral-950 px-6 text-sm font-medium hover:bg-neutral-800"
                  onClick={handleApprovedContinue}
                >
                  Começar
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  Envie o comprovante de pagamento para liberarmos seu acesso.
                </p>

                <div 
                  onClick={() => receiptInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 transition-colors"
                >
                  <input
                    ref={receiptInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  {receiptFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <Check className="h-8 w-8 text-green-500" />
                      <span className="text-sm font-medium">{receiptFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-gray-400" />
                      <span className="text-sm text-gray-500">Clique para selecionar</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowUploadModal(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleReceiptUpload}
                    disabled={!receiptFile || isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Enviar
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Componente de Cronometro de Escassez
function ScarcityTimer({ onExpire, className }: { onExpire?: () => void; className?: string }) {
  const [timeLeft, setTimeLeft] = useState(() => {
    // Recuperar tempo restante do localStorage ou iniciar com 10 minutos
    const saved = localStorage.getItem("scarcity_timer_end");
    if (saved) {
      const remaining = Math.max(0, parseInt(saved) - Date.now());
      return Math.floor(remaining / 1000);
    }
    // Novo timer de 10 minutos
    const endTime = Date.now() + 10 * 60 * 1000;
    localStorage.setItem("scarcity_timer_end", endTime.toString());
    return 10 * 60;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Reiniciar timer
          const endTime = Date.now() + 10 * 60 * 1000;
          localStorage.setItem("scarcity_timer_end", endTime.toString());
          onExpire?.();
          return 10 * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onExpire]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <span className={cn("font-mono font-semibold text-gray-600", className)}>
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

interface CouponValidation {
  valid: boolean;
  finalPrice?: string;
  discountType?: string;
  code?: string;
  applicablePlans?: string[] | null;
}

interface CustomPlanValidation {
  valid: boolean;
  plan?: Plan & { valorPrimeiraCobranca?: string };
  message?: string;
}

// Interface para plano de revenda
interface ResellerPlan {
  isResellerClient: boolean;
  reseller?: {
    companyName: string;
    supportEmail?: string;
    supportPhone?: string;
    pixKey?: string;
    pixKeyType?: string;
    pixHolderName?: string;
    pixBankName?: string;
  };
  plan?: {
    name: string;
    price: string;
    features: string[];
  };
}

type CatalogPlan = Plan & {
  valorPrimeiraCobranca?: string | null;
  valorOriginal?: string | null;
  caracteristicas?: string[] | null;
  ctaTexto?: string | null;
  exibirNaPaginaPlanos?: boolean | null;
  trialDias?: number | null;
};

type PublicPlanPresentation = {
  name?: string;
  badge?: string;
  ctaText?: string;
  description?: string;
  introOfferPrice?: number;
  forceDisplayPrice?: boolean;
  features?: string[];
  note?: string;
};

type CheckoutRenewalPricing = {
  monthlyPrice: number;
  originalMonthlyPrice: number;
  source: "default" | "last_paid_amount" | "highest_paid_amount" | "referral_first_subscription";
  lastPaidAmount: number | null;
  lastPaidAt: string | null;
  lastPaidSource: string | null;
  planId: string | null;
  planName: string | null;
  lockedRenewalPrice: boolean;
};

const PUBLIC_BASE_PLAN_ID = "f6c55498-7b22-4ac2-9703-bf2bdd0cc431";
const PUBLIC_CONFIGURED_PLAN_ID = "2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f";
const PUBLIC_PRO_PLAN_ID = "c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65";

const PUBLIC_VISIBLE_PLAN_IDS = new Set([
  PUBLIC_BASE_PLAN_ID,
  PUBLIC_CONFIGURED_PLAN_ID,
  PUBLIC_PRO_PLAN_ID,
]);

const PUBLIC_PLAN_PRESENTATION: Record<string, PublicPlanPresentation> = {
  [PUBLIC_BASE_PLAN_ID]: {
    name: "IA Ilimitada",
    badge: "Entrada completa",
    ctaText: "Começar agora",
    introOfferPrice: 49.99,
    description: "Conversas ilimitadas, mensagens ilimitadas, clientes ilimitados, tokens de IA inclusos e IA ilimitada 24h para atender, qualificar e vender.",
    note: "Pré-pago por 30 dias, sem contrato de fidelidade. Cancele quando quiser.",
    features: [
      "Conversas ilimitadas",
      "Mensagens ilimitadas",
      "Clientes ilimitados",
      "Tokens ilimitados da IA inclusos",
      "Respostas da IA no WhatsApp ilimitadas",
      "IA ilimitada atendendo 24/7",
      "Todas as ferramentas atuais inclusas",
      "1 conexão WhatsApp para começar",
    ],
  },
  [PUBLIC_CONFIGURED_PLAN_ID]: {
    name: "IA configurada e pronta",
    badge: "IA pronta",
    ctaText: "Quero minha IA pronta",
    introOfferPrice: 99.99,
    description: "Sua IA já entra configurada para o seu negócio, com todas as ferramentas atuais inclusas para começar vendendo mais rápido.",
    note: "Pré-pago por 30 dias, sem contrato de fidelidade. Cancele quando quiser.",
    features: [
      "IA configurada e pronta para usar",
      "Todas as ferramentas atuais inclusas no plano",
      "Conversas ilimitadas",
      "Mensagens ilimitadas",
      "Clientes ilimitados",
      "Tokens ilimitados da IA inclusos",
      "Respostas da IA no WhatsApp ilimitadas",
      "CRM, follow-up, funil, campanhas e automações inclusos",
    ],
  },
  [PUBLIC_PRO_PLAN_ID]: {
    name: "IA Ilimitada Pro",
    badge: "Atualizações inclusas",
    ctaText: "Quero o Pro completo",
    introOfferPrice: 349.99,
    description: "IA configurada com todas as ferramentas atuais, novas ferramentas, atualizações do sistema inclusas e mais estrutura para crescer sem travar.",
    note: "Pré-pago por 30 dias, sem contrato de fidelidade. Cancele quando quiser.",
    features: [
      "Todas as ferramentas e atualizações do sistema inclusas no plano",
      "Novas ferramentas liberadas no plano",
      "IA configurada e pronta para operar",
      "Conversas ilimitadas",
      "Mensagens ilimitadas",
      "Clientes ilimitados",
      "Tokens ilimitados da IA inclusos",
      "Conexões WhatsApp ilimitadas",
      "Suporte prioritário via WhatsApp",
      "Respostas da IA no WhatsApp ilimitadas",
    ],
  },
};

function getPublicPlanPresentation(plan: CatalogPlan): PublicPlanPresentation {
  return PUBLIC_PLAN_PRESENTATION[plan.id] ?? {};
}

function getPublicPlanBaseOfferAmount(planId: string): number {
  if (planId === PUBLIC_BASE_PLAN_ID) return 49.99;
  if (planId === PUBLIC_CONFIGURED_PLAN_ID) return 99.99;
  if (planId === PUBLIC_PRO_PLAN_ID) return 349.99;
  return 0;
}

function getReferralPlanOfferAmount(planId: string): number {
  if (planId === PUBLIC_BASE_PLAN_ID) return 99.99;
  if (planId === PUBLIC_CONFIGURED_PLAN_ID) return 199.99;
  if (planId === PUBLIC_PRO_PLAN_ID) return 349.99;
  return 0;
}

function getCheckoutOfferAmount(planId: string, pricing?: CheckoutRenewalPricing | null): number {
  const referralAmount = pricing?.source === "referral_first_subscription" ? getReferralPlanOfferAmount(planId) : 0;
  const publicAmount = referralAmount > 0 ? referralAmount : getPublicPlanBaseOfferAmount(planId);
  if (pricing?.lockedRenewalPrice && pricing.monthlyPrice > publicAmount) {
    return pricing.monthlyPrice;
  }
  return publicAmount;
}

function buildCheckoutPlanPresentation(plan: CatalogPlan, pricing?: CheckoutRenewalPricing | null): PublicPlanPresentation {
  const base = getPublicPlanPresentation(plan);
  const amount = getCheckoutOfferAmount(plan.id, pricing);
  if (amount <= 0) {
    return base;
  }

  if (pricing?.lockedRenewalPrice && pricing.monthlyPrice > getPublicPlanBaseOfferAmount(plan.id)) {
    const historicalName = pricing.planName?.trim() || base.name || plan.nome;
    return {
      ...base,
      name: historicalName,
      badge: "Seu valor mantido",
      ctaText: "Renovar meu plano",
      introOfferPrice: amount,
      forceDisplayPrice: true,
      description: `Mantemos o maior plano que você já assinou: ${historicalName}, com uso ilimitado e acesso completo conforme seu histórico.`,
      features: [
        `Valor preservado pelo seu histórico: R$ ${formatCurrencyValue(amount)}/mês`,
        "Conversas ilimitadas",
        "Mensagens ilimitadas",
        "Clientes ilimitados",
        "Tokens ilimitados da IA inclusos",
        "IA ilimitada 24h",
        "Ferramentas liberadas para assinatura ativa",
      ],
    };
  }

  return {
    ...base,
    introOfferPrice: amount,
  };
}

function formatCurrencyValue(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCurrencyParts(value: number) {
  const formatted = formatCurrencyValue(value);
  const [whole = "0", cents = "00"] = formatted.split(",");
  return { whole, cents };
}

function getDisplayOriginalAmount(plan: CatalogPlan, currentAmount: number): number | null {
  const originalAmount = Number(plan.valorOriginal || 0);
  if (!Number.isFinite(originalAmount) || originalAmount <= currentAmount) {
    return null;
  }

  return originalAmount;
}

function isImplementationCatalogPlan(plan: CatalogPlan) {
  return plan.tipo === "implementacao" || plan.tipo === "implementacao_mensal";
}

function getCatalogPlanFeatures(plan: CatalogPlan, hasSetupFee: boolean, isAnnual: boolean): string[] {
  if (Array.isArray(plan.caracteristicas) && plan.caracteristicas.length > 0) {
    return plan.caracteristicas.slice(0, 7);
  }

  if (hasSetupFee) {
    return [
      "Configuração completa da IA",
      "Personalização do agente",
      "Suporte prioritário",
    ];
  }

  if (isAnnual) {
    return [
      "Preço fixo por 12 meses",
      "Atendimento ilimitado",
      "Suporte prioritário",
    ];
  }

  return [
    "IA atendendo 24/7",
    "Conversas ilimitadas",
    "Cancele quando quiser",
  ];
}

function getCatalogButtonConfig(plan: CatalogPlan, options: { isActive: boolean; hasActiveSubscription: boolean }) {
  const summary = getSubscriptionChargeSummary(plan, null);
  const isImplementationPlan = isImplementationCatalogPlan(plan);

  if (options.isActive) {
    return {
      text: "Seu plano atual",
      disabled: true,
      className: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 cursor-default hover:bg-gray-100 dark:hover:bg-gray-800",
    };
  }

  if (options.hasActiveSubscription) {
    if (summary.isAnnual) {
      return {
        text: "Upgrade para este plano",
        disabled: false,
        className: "bg-primary text-primary-foreground hover:bg-primary/90",
      };
    }

    if (isImplementationPlan && summary.hasSetupFee) {
      return {
        text: "Migrar para este plano",
        disabled: false,
        className: "bg-purple-600 hover:bg-purple-700 text-white",
      };
    }

    return {
      text: "Migrar para este plano",
      disabled: false,
      className: "bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 text-white",
    };
  }

  if (isImplementationPlan && summary.hasSetupFee) {
    return {
      text: "Assinar com implementação",
      disabled: false,
      className: "bg-purple-600 hover:bg-purple-700 text-white",
    };
  }

  if (summary.isAnnual) {
    return {
      text: "Assinar plano anual",
      disabled: false,
      className: "bg-primary text-primary-foreground hover:bg-primary/90",
    };
  }

  return {
    text: "Assinar plano",
    disabled: false,
    className: "bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 text-white",
  };
}

function getPlanCardFeatures(plan: CatalogPlan, hasSetupFee: boolean, isAnnual: boolean): string[] {
  if (Array.isArray(plan.caracteristicas) && plan.caracteristicas.length > 0) {
    return plan.caracteristicas.slice(0, 7);
  }

  if (hasSetupFee) {
    return [
      "Configuracao completa da IA",
      "Personalizacao do agente",
      "Suporte prioritario",
    ];
  }

  if (isAnnual) {
    return [
      "Preco fixo por 12 meses",
      "Atendimento ilimitado",
      "Suporte prioritario",
    ];
  }

  return [
    "IA atendendo 24/7",
    "Conversas ilimitadas",
    "Cancele quando quiser",
  ];
}

function getPlanButtonConfig(plan: CatalogPlan, options: { isActive: boolean; hasActiveSubscription: boolean }) {
  const baseConfig = getCatalogButtonConfig(plan, options);
  const customText = typeof plan.ctaTexto === "string" && plan.ctaTexto.trim().length > 0
    ? plan.ctaTexto.trim()
    : null;

  if (!customText || options.isActive) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    text: customText,
  };
}

function PublicPlanCatalogCard({
  plan,
  isActive,
  hasActiveSubscription,
  isPending,
  onSelect,
}: {
  plan: CatalogPlan;
  isActive: boolean;
  hasActiveSubscription: boolean;
  isPending: boolean;
  onSelect: () => void;
}) {
  const summary = getSubscriptionChargeSummary(plan, null);
  const isImplementationPlan = isImplementationCatalogPlan(plan);
  const priceParts = formatCurrencyParts(summary.initialAmount);
  const recurringLabel = summary.isAnnual ? "/ano" : "/mês";
  const button = getCatalogButtonConfig(plan, { isActive, hasActiveSubscription });
  const features = getCatalogPlanFeatures(plan, isImplementationPlan && summary.hasSetupFee, summary.isAnnual);
  const originalAmount = getDisplayOriginalAmount(plan, summary.initialAmount);

  const accent = isImplementationPlan && summary.hasSetupFee
    ? {
        border: isActive
          ? "border-purple-400 dark:border-purple-500 bg-purple-50/40 dark:bg-purple-950/20"
          : "border-purple-200 dark:border-purple-800 hover:border-purple-400 dark:hover:border-purple-600",
        iconWrap: "bg-purple-100 dark:bg-purple-900/40",
        iconColor: "text-purple-600 dark:text-purple-300",
        badge: isActive
          ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border border-purple-300 dark:border-purple-700"
          : "bg-purple-600 text-white border border-purple-600",
        note: "bg-purple-50 dark:bg-purple-950/30 border-purple-100 dark:border-purple-800/50 text-purple-700 dark:text-purple-300",
        checkWrap: "bg-purple-100 dark:bg-purple-900/30",
        checkColor: "text-purple-600 dark:text-purple-300",
        priceColor: "text-purple-600 dark:text-purple-400",
        icon: Sparkles,
      }
    : summary.isAnnual || plan.destaque
      ? {
          border: isActive
            ? "border-primary bg-primary/5"
            : "border-primary/30 bg-white dark:bg-gray-900 hover:border-primary/50",
          iconWrap: "bg-primary/10",
          iconColor: "text-primary",
          badge: "bg-primary/10 text-primary border border-primary/20",
          note: "bg-primary/5 border-primary/20 text-primary",
          checkWrap: "bg-primary/10",
          checkColor: "text-primary",
          priceColor: "text-primary",
          icon: Gift,
        }
      : {
          border: isActive
            ? "border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/50"
            : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700",
          iconWrap: "bg-gray-100 dark:bg-gray-800",
          iconColor: "text-gray-700 dark:text-gray-300",
          badge: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700",
          note: "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300",
          checkWrap: "bg-gray-100 dark:bg-gray-800",
          checkColor: "text-gray-600 dark:text-gray-300",
          priceColor: "text-gray-900 dark:text-white",
          icon: Crown,
        };

  const AccentIcon = accent.icon;
  const badgeLabel = isActive
    ? "Seu plano atual"
    : plan.badge || (plan.destaque ? "Recomendado" : null);

  const description = plan.descricao?.trim()
    ? plan.descricao.trim()
    : isImplementationPlan && summary.hasSetupFee
      ? "Implementação inicial com continuidade automática do plano."
      : summary.isAnnual
        ? "Pagamento anual em cobrança única, com preço congelado."
        : "Plano recorrente para manter a operação ativa sem interrupções.";

  return (
    <Card
      className={cn(
        "relative flex h-full flex-col rounded-[26px] border transition-all duration-200 hover:shadow-md",
        accent.border,
      )}
    >
      {badgeLabel && (
        <div className="absolute -top-3 left-5">
          <Badge className={cn("rounded-full px-3 py-1 text-xs font-semibold shadow-sm", accent.badge)}>
            {badgeLabel}
          </Badge>
        </div>
      )}

      <CardHeader className="px-4 pb-4 pt-8 sm:px-5 md:px-6">
        <div className="mb-4 flex min-h-[104px] items-start gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className={cn("rounded-xl p-2", accent.iconWrap)}>
              <AccentIcon className={cn("h-5 w-5", accent.iconColor)} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold leading-tight text-gray-900 dark:text-white">{plan.nome}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
            </div>
          </div>
        </div>

        <div className="min-h-[116px]">
          <div className="flex items-end gap-1">
            <span className="text-sm font-medium text-gray-500">R$</span>
            <span className={cn("text-4xl font-bold tracking-tight md:text-5xl", accent.priceColor)}>{priceParts.whole}</span>
            <span className={cn("text-xl font-bold tracking-tight md:text-2xl", accent.priceColor)}>,{priceParts.cents}</span>
            <span className="pb-1 text-sm font-medium text-gray-500">
              {isImplementationPlan && summary.hasSetupFee ? "1ª cobrança" : recurringLabel}
            </span>
          </div>

          <div className={cn("mt-4 rounded-xl border p-3", accent.note)}>
            {isImplementationPlan && summary.hasSetupFee ? (
              <div className="space-y-1.5 text-sm">
                <p className="font-semibold">Hoje: R$ {formatCurrencyValue(summary.initialAmount)}</p>
                <p className="text-xs opacity-90 md:text-sm">
                  Depois: R$ {formatCurrencyValue(summary.recurringAmount)}{recurringLabel}
                </p>
              </div>
            ) : (
              <p className="text-sm font-medium">
                {summary.isAnnual
                  ? "Cobrança anual única, sem surpresa no ciclo."
                  : "Cobrança recorrente simples para manter sua operação ativa."}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col px-4 pb-5 sm:px-5 md:px-6">
        <Button
          className={cn(
            "mb-5 h-12 w-full rounded-xl text-base font-semibold shadow-sm transition-all hover:scale-[1.02]",
            button.className,
          )}
          onClick={onSelect}
          disabled={button.disabled || isPending}
        >
          {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : button.text}
        </Button>

        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={`${plan.id}-${index}`} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
              <div className={cn("mt-0.5 rounded-full p-0.5", accent.checkWrap)}>
                <Check className={cn("h-3 w-3 flex-shrink-0", accent.checkColor)} />
              </div>
              <span className="font-medium">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
function PublicCatalogPlanCardV2({
  plan,
  presentationOverride,
  isActive,
  hasActiveSubscription,
  isIntroOfferEligible,
  isPending,
  onSelect,
}: {
  plan: CatalogPlan;
  presentationOverride?: PublicPlanPresentation;
  isActive: boolean;
  hasActiveSubscription: boolean;
  isIntroOfferEligible: boolean;
  isPending: boolean;
  onSelect: () => void;
}) {
  const presentation = presentationOverride ?? getPublicPlanPresentation(plan);
  const presentationPlan = isIntroOfferEligible
    ? plan
    : { ...plan, valorPrimeiraCobranca: null };
  const summary = getSubscriptionChargeSummary(presentationPlan, null);
  const isImplementationPlan = isImplementationCatalogPlan(plan);
  const forcedDisplayAmount =
    presentation.forceDisplayPrice &&
    typeof presentation.introOfferPrice === "number" &&
    presentation.introOfferPrice > 0
      ? presentation.introOfferPrice
      : null;
  const hasPromotionalDisplay = Boolean(
    forcedDisplayAmount == null &&
    typeof presentation.introOfferPrice === "number" &&
    presentation.introOfferPrice > 0 &&
    presentation.introOfferPrice < summary.recurringAmount,
  );
  const displayedAmount = forcedDisplayAmount ?? (hasPromotionalDisplay ? presentation.introOfferPrice! : summary.initialAmount);
  const priceParts = formatCurrencyParts(displayedAmount);
  const recurringLabel = summary.isAnnual ? "/ano" : "/mês";
  const baseButton = getPlanButtonConfig(plan, { isActive, hasActiveSubscription });
  const button = presentation.ctaText && !isActive ? { ...baseButton, text: presentation.ctaText } : baseButton;
  const features = presentation.features ?? getPlanCardFeatures(plan, isImplementationPlan && summary.hasSetupFee, summary.isAnnual);
  const showSetupBreakdown = isImplementationPlan && summary.hasSetupFee;
  const crossedAmount = hasPromotionalDisplay ? summary.recurringAmount : null;
  const isPurplePromoPlan =
    plan.id === PUBLIC_BASE_PLAN_ID ||
    plan.id === PUBLIC_CONFIGURED_PLAN_ID ||
    plan.id === PUBLIC_PRO_PLAN_ID;

  const accent = showSetupBreakdown
    ? {
        border: isActive
          ? "border-purple-400 dark:border-purple-500 bg-purple-50/40 dark:bg-purple-950/20"
          : "border-purple-200 dark:border-purple-800 hover:border-purple-400 dark:hover:border-purple-600",
        iconWrap: "bg-purple-100 dark:bg-purple-900/40",
        iconColor: "text-purple-600 dark:text-purple-300",
        badge: isActive
          ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border border-purple-300 dark:border-purple-700"
          : "bg-purple-600 text-white border border-purple-600",
        note: "bg-purple-50 dark:bg-purple-950/30 border-purple-100 dark:border-purple-800/50 text-purple-700 dark:text-purple-300",
        scarcity: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300",
        checkWrap: "bg-purple-100 dark:bg-purple-900/30",
        checkColor: "text-purple-600 dark:text-purple-300",
        priceColor: "text-purple-600 dark:text-purple-400",
        icon: Sparkles,
      }
    : isPurplePromoPlan
      ? {
          border: isActive
            ? "border-purple-200 bg-purple-50/30 dark:border-purple-800 dark:bg-purple-950/20"
            : "border-gray-200 hover:border-purple-300 dark:border-gray-800 dark:hover:border-purple-700",
          iconWrap: "bg-purple-100 dark:bg-purple-900/40",
          iconColor: "text-purple-600 dark:text-purple-300",
          badge: isActive
            ? "bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900 dark:text-purple-300 dark:border-purple-700"
            : "bg-purple-600 text-white border border-purple-600",
          note: "bg-purple-50 border-purple-100 text-purple-700 dark:bg-purple-950/30 dark:border-purple-800/50 dark:text-purple-300",
          scarcity: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300",
          checkWrap: "bg-purple-50 dark:bg-purple-900/30",
          checkColor: "text-purple-600 dark:text-purple-300",
          priceColor: "text-purple-600 dark:text-purple-400",
          icon: Sparkles,
        }
    : summary.isAnnual || plan.destaque
      ? {
          border: isActive
            ? "border-primary bg-primary/5"
            : "border-primary/30 bg-white dark:bg-gray-900 hover:border-primary/50",
          iconWrap: "bg-primary/10",
          iconColor: "text-primary",
          badge: "bg-primary/10 text-primary border border-primary/20",
          note: "bg-primary/5 border-primary/20 text-primary",
          scarcity: "border-primary/20 bg-primary/5 text-primary",
          checkWrap: "bg-primary/10",
          checkColor: "text-primary",
          priceColor: "text-primary",
          icon: Gift,
        }
      : {
          border: isActive
            ? "border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/50"
            : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700",
          iconWrap: "bg-gray-100 dark:bg-gray-800",
          iconColor: "text-gray-700 dark:text-gray-300",
          badge: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700",
          note: "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300",
          scarcity: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
          checkWrap: "bg-gray-100 dark:bg-gray-800",
          checkColor: "text-gray-600 dark:text-gray-300",
          priceColor: "text-gray-900 dark:text-white",
          icon: Crown,
        };

  const AccentIcon = accent.icon;
  const badgeLabel = isActive
    ? "Seu plano atual"
    : presentation.badge || plan.badge || (plan.destaque ? "Recomendado" : null);
  const effectiveButton = isPurplePromoPlan && !isActive
    ? { ...button, className: "bg-purple-600 text-white hover:bg-purple-700" }
    : button;
  const description = presentation.description ?? (plan.descricao?.trim()
    ? plan.descricao.trim()
    : showSetupBreakdown
      ? "Implementação inicial com continuidade automática do plano."
      : summary.isAnnual
        ? "Pagamento anual em cobrança única, com preço congelado."
        : "Plano recorrente para manter a operação ativa sem interrupções.");
  const planTitle = presentation.name ?? plan.nome;
  const buttonNote = presentation.note || (summary.isAnnual
    ? "Pré-pago por 12 meses, sem surpresa no ciclo."
    : "Pré-pago por 30 dias, sem contrato de fidelidade. Cancele quando quiser.");

  return (
      <Card
        className={cn(
          "relative flex h-full w-full flex-col rounded-[28px] border bg-white/95 transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl dark:bg-gray-950/80",
          accent.border,
        )}
      >
      {badgeLabel && (
        <div className="absolute -top-3 left-5">
          <Badge className={cn("rounded-full px-3 py-1 text-xs font-semibold shadow-sm", accent.badge)}>
            {badgeLabel}
          </Badge>
        </div>
      )}

      <CardHeader className="px-4 pb-2 pt-7 sm:px-5">
        <div className="mb-1 flex min-h-[116px] items-start gap-3 overflow-hidden md:min-h-[128px]">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className={cn("rounded-xl p-2", accent.iconWrap)}>
              <AccentIcon className={cn("h-5 w-5", accent.iconColor)} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[1.7rem] font-semibold leading-[1.02] tracking-tight text-gray-900 dark:text-white">{planTitle}</h3>
              <p className="mt-2 overflow-hidden text-sm leading-6 text-gray-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] dark:text-gray-400">{description}</p>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          {crossedAmount != null && (
            <div className="flex justify-center">
              <p className="text-sm font-medium text-slate-400">
                de <span className="line-through">R$ {formatCurrencyValue(crossedAmount)}</span> por
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-end justify-center gap-x-3 gap-y-1">
            <div className="flex items-end gap-1">
              <span className="text-sm font-medium text-gray-500">R$</span>
              <span className={cn("text-[2.9rem] font-bold tracking-tight md:text-[3.35rem]", accent.priceColor)}>{priceParts.whole}</span>
              <span className={cn("text-2xl font-bold tracking-tight md:text-[1.75rem]", accent.priceColor)}>,{priceParts.cents}</span>
              <span className="pb-1 text-sm font-medium text-gray-500">{recurringLabel}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col px-4 pb-5 pt-1 sm:px-5">
        {hasPromotionalDisplay && (
          <div className="mb-2 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <span>Esta promoção é garantida até:</span>
            <ScarcityTimer className="text-[12px] font-bold text-slate-800" />
          </div>
        )}

        <Button
          className={cn(
            "mb-3 min-h-[56px] w-full rounded-xl px-4 py-3 text-sm font-semibold leading-tight whitespace-normal shadow-sm transition-all hover:scale-[1.01] md:text-base",
            effectiveButton.className,
          )}
          onClick={onSelect}
          disabled={effectiveButton.disabled || isPending}
        >
          {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : effectiveButton.text}
        </Button>

        <p className="mb-3 min-h-[34px] text-center text-[11px] leading-4 text-slate-400 sm:px-2">
          {buttonNote}
        </p>

        <ul className="flex-1 space-y-2.5">
          {features.map((feature, index) => (
            <li key={`${plan.id}-${index}`} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
              <div className={cn("mt-0.5 rounded-full p-0.5", accent.checkWrap)}>
                <Check className={cn("h-3 w-3 flex-shrink-0", accent.checkColor)} />
              </div>
              <span className="font-medium">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function PlansPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidation | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  
  // Estado para controlar quando o usuario quer ver outros planos alem do atribuido
  const [showAllPlans, setShowAllPlans] = useState(false);
  
  // Estado para plano personalizado
  const [customPlanCode, setCustomPlanCode] = useState("");
  const [customPlan, setCustomPlan] = useState<CustomPlanValidation | null>(null);
  const [isValidatingCustomPlan, setIsValidatingCustomPlan] = useState(false);

  // Estado para modal de subscribe
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [pendingSubscriptionId, setPendingSubscriptionId] = useState<string | null>(null);

  // Verificar se e cliente de revenda
  const { data: resellerPlan, isLoading: resellerPlanLoading } = useQuery<ResellerPlan>({
    queryKey: ["/api/user/reseller-plan"],
  });

  // Verificar se tem plano atribuido via link
  const { data: assignedPlanData, isLoading: assignedPlanLoading } = useQuery<{
    hasAssignedPlan: boolean;
    plan?: Plan & { valorPrimeiraCobranca?: string };
  }>({
    queryKey: ["/api/user/assigned-plan"],
  });

  const { data: plans, isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const { data: currentSubscription, isLoading: subscriptionLoading } = useQuery<(Subscription & { plan: Plan }) | null>({
    queryKey: ["/api/subscriptions/current"],
  });

  const { data: promoEligibility, isLoading: promoEligibilityLoading } = useQuery<{ introOfferEligible: boolean }>({
    queryKey: ["/api/plans/promo-eligibility"],
  });

  const { data: checkoutRenewalPricing, isLoading: checkoutRenewalPricingLoading } = useQuery<CheckoutRenewalPricing>({
    queryKey: ["/api/checkout/renewal-pricing"],
  });

  const hasActiveSubscription = currentSubscription?.status === "active";
  const activePlanId = currentSubscription?.plan?.id || currentSubscription?.planId || null;
  const assignedPlanAvailable = Boolean(assignedPlanData?.hasAssignedPlan && assignedPlanData?.plan);
  const canAutoUseAssignedPlan = assignedPlanAvailable && !hasActiveSubscription;

  const validateCoupon = async () => {
    if (!couponCode.trim()) {
      toast({ title: "Digite um código de cupom", variant: "destructive" });
      return;
    }
    
    setIsValidatingCoupon(true);
    try {
      const response = await apiRequest("POST", "/api/coupons/validate", { code: couponCode.trim() });
      const data = await response.json();
      
      if (data.valid) {
        setAppliedCoupon(data);
        toast({ 
          title: "Cupom aplicado com sucesso!", 
          description: `Preço especial: R$ ${Number(data.finalPrice).toFixed(2).replace('.', ',')}/mês` 
        });
      } else {
        toast({ title: data.message || "Cupom inválido", variant: "destructive" });
        setAppliedCoupon(null);
      }
    } catch (error: any) {
      const errorData = await error?.response?.json?.() || {};
      toast({ title: errorData.message || "Cupom inválido", variant: "destructive" });
      setAppliedCoupon(null);
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
  };

  // Validacao de codigo de plano personalizado
  const validateCustomPlanCode = async () => {
    if (!customPlanCode.trim()) {
      toast({ title: "Digite o código do seu plano personalizado", variant: "destructive" });
      return;
    }
    
    setIsValidatingCustomPlan(true);
    try {
      const response = await apiRequest("POST", "/api/plans/validate-code", { code: customPlanCode.trim() });
      const data = await response.json();
      
      if (data.valid) {
        setCustomPlan(data);
        toast({ 
          title: "Plano personalizado encontrado!", 
          description: `${data.plan.nome} - R$ ${Number(data.plan.valor).toFixed(2).replace('.', ',')}/mês` 
        });
      } else {
        toast({ title: data.message || "Código não encontrado", variant: "destructive" });
        setCustomPlan(null);
      }
    } catch (error: any) {
      const errorData = await error?.response?.json?.() || {};
      toast({ title: errorData.message || "Código inválido", variant: "destructive" });
      setCustomPlan(null);
    } finally {
      setIsValidatingCustomPlan(false);
    }
  };

  const removeCustomPlan = () => {
    setCustomPlan(null);
    setCustomPlanCode("");
    // Se tinha um plano atribuido via link, mostrar todos os planos agora
    if (assignedPlanData?.hasAssignedPlan) {
      setShowAllPlans(true);
    }
  };

  // Auto-preencher customPlan quando usuario tem plano atribuido via link
  // Mas NAO preencher se o usuario optou por ver outros planos
  useEffect(() => {
    if (
      hasActiveSubscription &&
      assignedPlanData?.plan &&
      customPlan?.plan?.id === assignedPlanData.plan.id &&
      !customPlanCode.trim()
    ) {
      setCustomPlan(null);
      setShowAllPlans(true);
      return;
    }

    if (canAutoUseAssignedPlan && assignedPlanData?.plan && !customPlan && !showAllPlans) {
      setCustomPlan({
        valid: true,
        plan: assignedPlanData.plan
      });
    }
  }, [assignedPlanData, canAutoUseAssignedPlan, customPlan, customPlanCode, hasActiveSubscription, showAllPlans]);

  const handleSelectCustomPlan = () => {
    if (customPlan?.plan) {
      setSelectedPlan(customPlan.plan.id);
      createSubscriptionMutation.mutate({
        planId: customPlan.plan.id,
        planCode: customPlanCode.trim() || undefined,
      });
    }
  };

  const createSubscriptionMutation = useMutation<Subscription, Error, { planId: string; couponCode?: string; planCode?: string }>({
    mutationFn: async ({ planId, couponCode, planCode }) => {
      const response = await apiRequest("POST", "/api/subscriptions/create", { planId, couponCode, planCode });
      const data = await response.json();
      return data as Subscription;
    },
    onSuccess: (data: Subscription) => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions/current"] });
      toast({ title: "Assinatura criada! Agora realize o pagamento." });
      // Abrir modal ao inves de redirecionar
      setPendingSubscriptionId(data.id);
      setSubscribeModalOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar assinatura",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation especifica para clientes de revenda
  const createResellerSubscriptionMutation = useMutation<Subscription, Error, void>({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/reseller-client/subscription/create", {});
      const data = await response.json();
      return data as Subscription;
    },
    onSuccess: (data: Subscription) => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions/current"] });
      toast({ title: "Assinatura criada! Agora realize o pagamento." });
      setPendingSubscriptionId(data.id);
      setSubscribeModalOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar assinatura",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (plansLoading || subscriptionLoading || resellerPlanLoading || assignedPlanLoading || promoEligibilityLoading || checkoutRenewalPricingLoading) {
    return repairReactNodeText(
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-green-500" />
      </div>
    );
  }

  const introOfferEligible = Boolean(promoEligibility?.introOfferEligible);
  const showAssignedPlan = canAutoUseAssignedPlan && assignedPlanData?.plan;
  const showCouponSection = false;
  const publicCatalogPlans = ((plans || []) as CatalogPlan[]).filter((plan) => PUBLIC_VISIBLE_PLAN_IDS.has(plan.id));
  const lockedRenewalPrice = checkoutRenewalPricing?.lockedRenewalPrice
    ? Number(checkoutRenewalPricing.monthlyPrice || 0)
    : 0;
  const visiblePublicCatalogPlans = lockedRenewalPrice > 0
    ? publicCatalogPlans.filter((plan) => getPublicPlanBaseOfferAmount(plan.id) >= lockedRenewalPrice)
    : publicCatalogPlans;
  const fallbackHistoricalBasePlan = lockedRenewalPrice > 0 && visiblePublicCatalogPlans.length === 0
    ? publicCatalogPlans.find((plan) => plan.id === PUBLIC_BASE_PLAN_ID) ?? publicCatalogPlans[0] ?? null
    : null;
  const publicPlansForOffer = fallbackHistoricalBasePlan ? [fallbackHistoricalBasePlan] : visiblePublicCatalogPlans;
  const catalogPlansToRender = (showAllPlans ? publicPlansForOffer : publicPlansForOffer.filter((plan) => {
    if (customPlan?.valid && customPlan.plan?.id === plan.id) {
      return false;
    }

    return true;
  }))
    .slice()
    .sort((leftPlan, rightPlan) => {
      return getPublicPlanBaseOfferAmount(leftPlan.id) - getPublicPlanBaseOfferAmount(rightPlan.id);
    }) as CatalogPlan[];
  const displayCouponPrice = appliedCoupon?.finalPrice
    ? Number(appliedCoupon.finalPrice).toFixed(2).replace(".", ",")
    : "99,99";

  const isPlanActive = (planId: string) => hasActiveSubscription && activePlanId === planId;

  const getCouponCodeForPlan = (plan: CatalogPlan) => {
    if (!appliedCoupon?.code) {
      return undefined;
    }

    const applicablePlans = appliedCoupon.applicablePlans;
    const planKey = plan.tipo || plan.periodicidade;

    if (!applicablePlans || applicablePlans.length === 0) {
      return appliedCoupon.code;
    }

    return applicablePlans.includes(planKey) ? appliedCoupon.code : undefined;
  };

  const handleSelectPlan = (plan: CatalogPlan) => {
    setSelectedPlan(plan.id);
    createSubscriptionMutation.mutate({
      planId: plan.id,
      couponCode: getCouponCodeForPlan(plan),
    });
  };
  const legacyFaqItems = [
    {
      question: "Como funciona o período de teste?",
      answer: "Você pode testar o sistema por 7 dias com garantia total. Se não ficar satisfeito, devolvemos 100% do valor sem perguntas."
    },
    {
      question: "Posso cancelar a qualquer momento?",
      answer: "Sim! Não há fidelidade. Você pode cancelar quando quiser diretamente pelo painel, sem burocracia."
    },
    {
      question: "O que está incluso em todos os planos?",
      answer: "Todos os planos incluem: IA atendendo 24/7, conversas ilimitadas, 1 agente personalizado, suporte via WhatsApp e atualizações gratuitas."
    },
    {
      question: "O que é a Implementação Completa?",
      answer: "É um serviço onde nossa equipe configura toda a IA para você: personaliza o agente, treina com suas informações e acompanha por 30 dias com reuniões semanais. Após o primeiro mês, continua apenas R$ 99,99/mês."
    },
    {
      question: "Preciso ter conhecimento técnico?",
      answer: "Não! O sistema é simples e intuitivo. E se tiver qualquer dúvida, nosso suporte está disponível via WhatsApp."
    },
    {
      question: "Como funciona o pagamento?",
      answer: "Pagamento via PIX, instantâneo e seguro. O acesso é liberado imediatamente após a confirmação."
    }
  ].filter(item => showCouponSection || item.question !== "Como funciona o cupom de desconto?");
  const faqItems = [
    {
      question: "Todos os planos têm as mesmas ferramentas?",
      answer: "O IA Ilimitada já entra com as ferramentas atuais da plataforma. O IA configurada e pronta inclui as ferramentas atuais com a IA preparada para o seu negócio. O IA Ilimitada Pro inclui as ferramentas atuais, novas ferramentas, atualizações do sistema, conexões WhatsApp ilimitadas e suporte prioritário."
    },
    {
      question: "Preciso pagar algo a mais por token, mensagem, conversa ou cliente?",
      answer: "Não. Nesta página pública não existe cobrança extra por token, mensagem, conversa ou cliente. Os planos já entram com uso ilimitado da IA dentro da operação apresentada aqui, justamente para o cliente não ficar travado por surpresa de consumo."
    },
    {
      question: "Qual é a diferença entre os planos?",
      answer: "O IA Ilimitada é a porta de entrada. O IA configurada e pronta é para quem quer começar com a IA já ajustada. O IA Ilimitada Pro é para quem quer a estrutura mais completa, com atualizações e novas ferramentas inclusas."
    },
    {
      question: "Como funciona a promoção do 1º mês?",
      answer: "Para cliente novo, o IA Ilimitada entra por R$ 49,99 na primeira cobrança, o IA configurada e pronta entra por R$ 99,99 e o IA Ilimitada Pro entra por R$ 349,99. Se você já tem histórico de plano maior, preservamos o maior plano aprovado no seu histórico para evitar rebaixamento indevido."
    },
    {
      question: "Tenho suporte pelo WhatsApp em qual plano?",
      answer: "Todos os planos têm suporte para uso da plataforma. O IA Ilimitada Pro tem suporte prioritário via WhatsApp e acompanha as novas ferramentas e atualizações do sistema."
    },
    {
      question: "Posso cancelar?",
      answer: "Sim. A cobrança é pré-paga e válida por 30 dias, sem contrato de fidelidade. Você paga o período escolhido, usa normalmente durante esse ciclo e pode cancelar antes da renovação se não quiser seguir no mês seguinte."
    },
    {
      question: "Como funciona a cobrança pré-paga?",
      answer: "Você faz o pagamento antecipado do período de 30 dias e a operação roda dentro desse ciclo. Não existe surpresa de cobrança por token, conversa, mensagem ou cliente nessa oferta pública. O valor do plano já cobre a estrutura anunciada."
    },
    {
      question: "Como funciona o PIX e o envio de comprovante?",
      answer: "Ao escolher um plano, o checkout abre em PIX e gera o QR Code para pagamento. Depois de pagar, use o botão \"Já paguei, enviar comprovante\" para anexar o comprovante e acelerar a conferência pelo time."
    },
    {
      question: "Posso começar em um plano e subir depois?",
      answer: "Sim. Você pode começar no IA Ilimitada ou no IA configurada e pronta e migrar depois para o Pro quando quiser mais estrutura, atualizações e prioridade."
    }
  ];

  // Se e cliente de revenda, sempre mostrar plano da revenda (com ou sem assinatura tradicional)
  if (resellerPlan?.isResellerClient && resellerPlan.plan) {
    return repairReactNodeText(
      <ResellerPlanPage 
        resellerPlan={resellerPlan}
        createResellerSubscriptionMutation={createResellerSubscriptionMutation}
        setSelectedPlan={setSelectedPlan}
        setPendingSubscriptionId={setPendingSubscriptionId}
        setSubscribeModalOpen={setSubscribeModalOpen}
      />
    );
  }

  return repairReactNodeText(
    <div className="min-h-full bg-white text-slate-950">
      <div className="mx-auto flex max-w-[1840px] flex-col px-4 py-5 sm:px-6 md:px-8 md:py-7">
        
        <div className="order-1 mb-3 text-center md:mb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
            {hasActiveSubscription ? "Faça upgrade do seu plano" : "Escolha a estrutura da sua operação"}
          </h1>
          {hasActiveSubscription && (
            <div className="mt-2 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs text-emerald-700 md:text-sm">
              Plano atual da sua conta: <span className="ml-1 font-semibold">{currentSubscription?.plan?.nome}</span>
            </div>
          )}
        </div>

        {showCouponSection && (
          <div className="order-6 max-w-sm mx-auto mb-8">
            {appliedCoupon ? (
              <div className="relative bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40 rounded-2xl p-4 border border-green-200/60 dark:border-green-700/40 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                      <Check className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">Cupom aplicado</p>
                      <p className="font-bold text-gray-900 dark:text-white text-lg tracking-wide">{appliedCoupon.code}</p>
                    </div>
                  </div>
                  <button 
                    onClick={removeCoupon}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors p-2"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-3 pt-3 border-t border-green-200/50 dark:border-green-700/30">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Novo valor mensal:</span>
                    <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                      R$ {displayCouponPrice}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <details className="group">
                <summary className="cursor-pointer flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors py-2 select-none">
                  <Tag className="w-4 h-4" />
                  <span>Tem um cupom de desconto?</span>
                  <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="mt-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="Digite o código"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      className="h-11 rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 focus:border-green-500 focus:ring-green-500/20 uppercase font-medium text-center tracking-widest transition-all"
                      onKeyDown={(e) => e.key === 'Enter' && validateCoupon()}
                    />
                    <Button 
                      onClick={validateCoupon}
                      disabled={isValidatingCoupon || !couponCode.trim()}
                      className="h-11 px-6 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                    >
                      {isValidatingCoupon ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Aplicar"
                      )}
                    </Button>
                  </div>
                </div>
              </details>
            )}
          </div>
        )}

        {/* Secao de Plano Personalizado ou Campo de Busca - SEMPRE VISIVEL */}
        <div className="order-3 mx-auto mb-8 mt-1 w-full max-w-xl rounded-2xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="text"
              aria-label="Código do plano exclusivo"
              placeholder="Código do plano exclusivo"
              value={customPlanCode}
              onChange={(e) => setCustomPlanCode(e.target.value.toUpperCase())}
              className="h-11 rounded-xl border-slate-200 bg-white text-center font-medium uppercase tracking-widest text-slate-950 placeholder:text-slate-400 transition-all focus:border-emerald-500 focus:ring-emerald-500/20"
              onKeyDown={(e) => e.key === 'Enter' && validateCustomPlanCode()}
            />
            <Button
              onClick={validateCustomPlanCode}
              disabled={isValidatingCustomPlan || !customPlanCode.trim()}
              className="h-11 rounded-xl bg-slate-950 px-6 font-medium text-white shadow-sm transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isValidatingCustomPlan ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Buscar"
              )}
            </Button>
          </div>
        </div>

        {/* Plano Personalizado - Layout lado a lado quando tem anual */}
        {customPlan?.valid && customPlan.plan && (
          (() => {
            const isAssignedPlan = showAssignedPlan && assignedPlanData?.plan?.id === customPlan.plan.id;
            const promoAnualPlan = publicCatalogPlans.find(
              (plan) => plan.tipo === "promo_anual" || plan.nome === "Plano Promo Ilimitado Anual",
            );
            const hasPromoAnual = isAssignedPlan && Number(customPlan.plan.valor) <= 50 && !!promoAnualPlan;
            const promoAnualPrice = promoAnualPlan ? formatCurrencyParts(Number(promoAnualPlan.valor || 0)) : null;
            const promoAnualFeatures = promoAnualPlan
              ? getCatalogPlanFeatures(promoAnualPlan, false, true)
              : [];
            const customSummary = getSubscriptionChargeSummary(customPlan.plan as CatalogPlan, null);
            const customRecurringLabel = customSummary.isAnnual ? "/ano" : "/mês";
            const customButtonLabel =
              typeof (customPlan.plan as any).ctaTexto === "string" && (customPlan.plan as any).ctaTexto.trim().length > 0
                ? (customPlan.plan as any).ctaTexto.trim()
                : customSummary.hasSetupFee
                  ? "Assinar com implementação"
                  : customSummary.isAnnual
                    ? "Assinar plano anual"
                    : "Assinar plano";
            const customFeatures = getPlanCardFeatures(
              customPlan.plan as CatalogPlan,
              customSummary.hasSetupFee,
              customSummary.isAnnual,
            );
            return (
          <div className={cn(
            "order-2 mb-10",
            hasPromoAnual 
              ? "grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto" 
              : "mx-auto w-full max-w-[30rem]"
          )}>
            <Card className={cn(
              "relative mx-auto flex h-full w-full max-w-[30rem] flex-col border rounded-[28px] transition-all duration-200 hover:shadow-md",
              "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
            )}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="px-3 py-1 text-xs font-semibold rounded-full shadow-sm bg-gray-900 text-white">
                  {isAssignedPlan ? "Oferta exclusiva" : "Plano personalizado"}
                </Badge>
              </div>
              
              <CardHeader className="pb-4 pt-8 px-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{customPlan.plan.nome}</h3>
                  <button 
                    onClick={removeCustomPlan}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors p-2"
                    title="Remover plano"
                  >
                    ×
                  </button>
                </div>
                
                {customPlan.plan.valorPrimeiraCobranca && (
                  <div className="mb-3 p-3 rounded-lg border bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-800">
                    <p className="text-xs mb-1 text-gray-600 dark:text-gray-400">Primeira cobrança / implementação</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm text-gray-500 font-medium">R$</span>
                      <span className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                        {Number(customPlan.plan.valorPrimeiraCobranca).toFixed(2).replace('.', ',').split(',')[0]}
                      </span>
                      <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
                        ,{Number(customPlan.plan.valorPrimeiraCobranca).toFixed(2).split('.')[1]}
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-1">
                  <span className="text-sm text-gray-500 font-medium">R$</span>
                  <span className="text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
                    {Number(customPlan.plan.valor).toFixed(2).replace('.', ',').split(',')[0]}
                  </span>
                  <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                    ,{Number(customPlan.plan.valor).toFixed(2).split('.')[1]}
                  </span>
                  <span className="text-gray-500 text-sm font-medium">{customRecurringLabel}</span>
                  </div>
                </div>
                
                <p className="text-sm font-medium mt-3 text-gray-500">
                  {customSummary.hasSetupFee
                    ? `Hoje R$ ${formatCurrencyValue(customSummary.initialAmount)} e depois R$ ${formatCurrencyValue(customSummary.recurringAmount)}${customRecurringLabel}`
                    : isAssignedPlan
                      ? "Oferta exclusiva do seu link"
                      : "Plano configurado para você"}
                </p>
              </CardHeader>

              <CardContent className="flex-1 px-6 pb-4">
                <Button
                  className="w-full h-12 rounded-xl font-semibold text-base shadow-sm transition-all hover:scale-[1.02] bg-gray-900 hover:bg-gray-800 text-white mb-5"
                  onClick={handleSelectCustomPlan}
                  disabled={createSubscriptionMutation.isPending}
                >
                  {createSubscriptionMutation.isPending && selectedPlan === customPlan.plan.id ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    customButtonLabel
                  )}
                </Button>
                <ul className="space-y-4">
                  {customFeatures.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <div className="mt-0.5 p-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                        <Check className="w-3 h-3 flex-shrink-0 text-gray-600 dark:text-gray-400" />
                      </div>
                      <span className="font-medium">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Card do Plano Anual Promo - Mostra quando e plano promo de R$ 49,99 */}
            {hasPromoAnual && promoAnualPlan && (
              <PublicCatalogPlanCardV2
                plan={promoAnualPlan}
                isActive={isPlanActive(promoAnualPlan.id)}
                hasActiveSubscription={hasActiveSubscription}
                isIntroOfferEligible={introOfferEligible}
                isPending={createSubscriptionMutation.isPending && selectedPlan === promoAnualPlan.id}
                onSelect={() => handleSelectPlan(promoAnualPlan)}
              />
            )}

            {false && hasPromoAnual && promoAnualPlan && promoAnualPrice && (
              <Card className="relative flex flex-col border rounded-2xl transition-all duration-200 hover:shadow-md border-primary/30 bg-white dark:bg-gray-900 hover:border-primary/50">
                <div className="absolute -top-3 left-6 flex items-center gap-2">
                  <Badge className="px-3 py-1 text-xs font-semibold rounded-full shadow-sm bg-primary/10 text-primary border border-primary/20">
                    Recomendado
                  </Badge>
                </div>
                
                <CardHeader className="pb-4 pt-8 px-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 rounded-xl bg-primary/10">
                      <Gift className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Anual + Setup</h3>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        12x no cartão de crédito
                      </Badge>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm text-gray-500 font-medium">R$</span>
                      <span className="text-5xl font-bold text-primary tracking-tight">{promoAnualPrice!.whole}</span>
                      <span className="text-xl font-bold text-primary">,{promoAnualPrice!.cents}</span>
                      <span className="text-gray-500 text-sm font-medium">/ano</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <p className="text-sm text-primary font-semibold flex items-center gap-2">
                      <Star className="w-4 h-4 text-primary" />
                      Setup Inicial incluído no plano
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                      Nossa equipe configura toda a IA para você
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 px-6 pb-4">
                  <Button
                    className="w-full h-12 rounded-xl font-semibold text-base shadow-sm transition-all hover:scale-[1.02] bg-primary text-primary-foreground hover:bg-primary/90 mb-5"
                    onClick={() => {
                      setSelectedPlan(promoAnualPlan!.id);
                      createSubscriptionMutation.mutate({ planId: promoAnualPlan!.id });
                    }}
                    disabled={createSubscriptionMutation.isPending}
                  >
                    {createSubscriptionMutation.isPending && selectedPlan === promoAnualPlan!.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : hasActiveSubscription ? (
                      "Upgrade para Anual"
                    ) : (
                      "Assinar Anual + Setup"
                    )}
                  </Button>
                  <ul className="space-y-3">
                    {promoAnualFeatures.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <div className="mt-0.5 p-0.5 rounded-full bg-primary/10">
                          <Check className="w-3 h-3 text-primary flex-shrink-0" />
                        </div>
                        <span className="font-medium">{feature}</span>
                      </li>
                    ))}                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
            );
          })()
        )}

        {/* Mostra os planos padrao quando nao tem plano personalizado OU quando showAllPlans esta ativo */}
        {(catalogPlansToRender.length > 0 || !customPlan?.valid) && (
          <>
            {catalogPlansToRender.length > 0 ? (
              <div
                className={cn(
                  "order-2 mb-8 grid grid-cols-1 gap-4 md:gap-5 xl:gap-6",
                  catalogPlansToRender.length === 1
                    ? "max-w-xl mx-auto"
                    : catalogPlansToRender.length === 2
                      ? "max-w-4xl mx-auto md:grid-cols-2"
                      : catalogPlansToRender.length >= 5
                        ? "max-w-[1840px] mx-auto md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5"
                        : catalogPlansToRender.length === 4
                          ? "max-w-[1700px] mx-auto md:grid-cols-2 xl:grid-cols-4"
                          : "max-w-[1500px] mx-auto md:grid-cols-2 xl:grid-cols-3",
                )}
              >
                {catalogPlansToRender.map((plan) => (
                  <PublicCatalogPlanCardV2
                    key={plan.id}
                    plan={plan}
                    presentationOverride={buildCheckoutPlanPresentation(plan, checkoutRenewalPricing)}
                    isActive={isPlanActive(plan.id)}
                    hasActiveSubscription={hasActiveSubscription}
                    isIntroOfferEligible={introOfferEligible}
                    isPending={createSubscriptionMutation.isPending && selectedPlan === plan.id}
                    onSelect={() => handleSelectPlan(plan)}
                  />
                ))}
              </div>
            ) : (
              <Card className="order-2 mx-auto mb-12 max-w-2xl rounded-2xl border border-dashed border-gray-300 bg-white/70 shadow-none dark:border-gray-700 dark:bg-gray-900/40">
                <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <div className="rounded-full bg-gray-100 p-3 dark:bg-gray-800">
                    <Tag className="h-5 w-5 text-gray-500" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Nenhum card público configurado</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Ative a exibição dos planos no admin para montar a vitrine desta página.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
        {/* Garantias */}
        <div className="order-4 mb-8 flex flex-col flex-wrap justify-center gap-3 border-y border-slate-200 py-4 md:mb-12 md:flex-row md:gap-12 md:py-6">
          <div className="flex items-center justify-center gap-2 text-xs text-slate-600 md:text-sm">
            <Shield className="w-4 h-4 text-green-600" />
            <span>7 dias de garantia</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-slate-600 md:text-sm">
            <Zap className="w-4 h-4 text-blue-600" />
            <span>Pagamento seguro via PIX</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-slate-600 md:text-sm">
            <Crown className="w-4 h-4 text-purple-600" />
            <span>Pré-pago sem fidelidade</span>
          </div>
        </div>

        <div className="order-5 mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-xl font-semibold text-slate-950">
            Perguntas frequentes
          </h2>
          
          <div className="space-y-2">
            {faqItems.map((item, index) => (
              <div 
                key={index}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <button
                  onClick={() => setFaqOpen(faqOpen === index ? null : index)}
                  className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-slate-50"
                >
                  <span className="text-sm font-medium text-slate-950">
                    {item.question}
                  </span>
                  {faqOpen === index ? (
                    <ChevronUp className="w-4 h-4 flex-shrink-0 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 flex-shrink-0 text-slate-500" />
                  )}
                </button>
                {faqOpen === index && (
                  <div className="px-4 pb-4">
                    <p className="text-sm leading-6 text-slate-600">
                      {item.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {(!plans || plans.length === 0) && (
          <div className="order-6 text-center py-12">
            <p className="text-gray-500">Nenhum plano disponível. Entre em contato com o suporte.</p>
          </div>
        )}
      </div>

      {/* Modal de Subscribe - Estilo Shopify */}
      <SubscribeModal
        open={subscribeModalOpen}
        onOpenChange={setSubscribeModalOpen}
        subscriptionId={pendingSubscriptionId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/subscriptions/current"] });
          setLocation("/");
        }}
      />
    </div>
  );
}



