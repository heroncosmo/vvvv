import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  CreditCard, 
  CalendarDays, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle,
  Eye,
  QrCode,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Receipt,
  TrendingUp,
  Ban,
  ArrowRight,
  Percent,
  CalendarClock,
  AlertTriangle,
  Shield,
  Lock,
  MessageSquare,
  Mail,
  Wallet
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { repairReactNodeText } from "@/lib/repair-react-node";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { format, isPast, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { SubscribeModal } from "@/components/subscribe-modal";
import { repairMojibakeText } from "@shared/mojibake";

// Declaração global para MercadoPago SDK
declare global {
  interface Window {
    MercadoPago: any;
  }
}

// Traduções de erros do Mercado Pago
const MP_ERROR_TRANSLATIONS: Record<string, string> = {
  "cc_rejected_bad_filled_card_number": "Número do cartão incorreto. Verifique e tente novamente.",
  "cc_rejected_bad_filled_date": "Data de validade incorreta.",
  "cc_rejected_bad_filled_other": "Dados do cartão incorretos. Verifique todas as informações.",
  "cc_rejected_bad_filled_security_code": "Código de segurança (CVV) incorreto.",
  "cc_rejected_blacklist": "Este cartão não pode ser utilizado. Tente outro cartão.",
  "cc_rejected_call_for_authorize": "Autorize a compra ligando para seu banco.",
  "cc_rejected_card_disabled": "Cartão desativado. Entre em contato com seu banco.",
  "cc_rejected_card_error": "Erro no cartão. Tente outro cartão.",
  "cc_rejected_duplicated_payment": "Este pagamento já foi realizado anteriormente.",
  "cc_rejected_high_risk": "Pagamento recusado por motivos de segurança.",
  "cc_rejected_insufficient_amount": "Saldo insuficiente no cartão.",
  "cc_rejected_invalid_installments": "Número de parcelas inválido.",
  "cc_rejected_max_attempts": "Limite de tentativas excedido. Tente mais tarde.",
  "cc_rejected_other_reason": "Pagamento não autorizado pelo banco.",
  "invalid_card_number": "Número do cartão inválido.",
  "invalid_expiration_date": "Data de validade inválida.",
  "invalid_security_code": "Código de segurança (CVV) inválido.",
  "invalid_holder_name": "Nome do titular deve conter apenas letras.",
  "invalid_identification": "CPF/CNPJ inválido. Verifique o número.",
  "card_token_creation_failed": "Erro ao processar o cartão. Tente novamente.",
  "pending_contingency": "Pagamento em análise. Aguarde a confirmação.",
  "pending_review_manual": "Pagamento em revisão manual.",
  "rejected": "Pagamento rejeitado. Tente outro cartão.",
  "cancelled": "Pagamento cancelado.",
  "refunded": "Pagamento estornado.",
  "charged_back": "Pagamento contestado.",
  "Card token service not found": "Conexão segura necessária (HTTPS).",
  "secure context": "Use conexão segura (HTTPS) para pagamentos.",
};

function translateMPError(error: string): string {
  if (MP_ERROR_TRANSLATIONS[error]) return repairMojibakeText(MP_ERROR_TRANSLATIONS[error]);
  for (const [key, translation] of Object.entries(MP_ERROR_TRANSLATIONS)) {
    if (error.toLowerCase().includes(key.toLowerCase())) return repairMojibakeText(translation);
  }
  return repairMojibakeText(error);
}

// Formatação de moeda BR
function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "R$ 0,00";
  const numericValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numericValue)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numericValue);
}

interface PaymentRecord {
  id: number;
  mpPaymentId?: string | null;
  amount: string;
  status: string;
  statusDetail?: string | null;
  paymentType?: string | null;
  paymentMethod?: string | null;
  processedAt?: string | null;
  createdAt: string;
  dueDate?: string | null;
  paymentDate?: string | null;
  payerEmail?: string | null;
  cardLastFourDigits?: string | null;
  cardBrand?: string | null;
  mpSubscriptionId?: string | null;
  netAmount?: string | null;
  feeAmount?: string | null;
}

// Informações do revendedor (se for cliente de revenda)
interface ResellerInfo {
  isResellerClient: boolean;
  clientId: string;
  status: string;
  clientPrice: string;
  nextPaymentDate: string | null;
  billingDay: number;
  activatedAt: string;
  isFreeClient: boolean;
  reseller: {
    companyName: string;
    logoUrl?: string;
    primaryColor?: string;
    accentColor?: string;
    supportEmail?: string;
    supportPhone?: string;
    welcomeMessage?: string;
    pixKey?: string;
    pixKeyType?: string;
    pixHolderName?: string;
    pixBankName?: string;
  };
}

interface SubscriptionData {
  subscription: {
    id: string;
    status: string;
    pendingReceipt?: boolean;
    dataInicio: string;
    dataFim: string;
    nextPaymentDate: string;
    couponCode: string | null;
    couponPrice: string | null;
    daysRemaining: number;
    needsPayment: boolean;
    payerEmail: string;
    paymentMethod: string | null; // mercadopago, pix_manual, card
    mpSubscriptionId: string | null; // Se tem assinatura de cartão
    cardLastFourDigits?: string | null;
    cardBrand?: string | null;
  } | null;
  plan: {
    id: string;
    nome: string;
    valor: string;
    tipo: string;
    creditos: number;
    descricao: string;
  } | null;
  payments: PaymentRecord[];
  stats: {
    totalPaid: number;
    totalPayments: number;
    approvedPayments: number;
    failedPayments: number;
  };
  resellerInfo?: ResellerInfo | null;
}
interface PixData {
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  paymentId: number;
  amount: number;
  expirationDate: string;
}

export default function MySubscription() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [showPixDialog, setShowPixDialog] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  
  // Novos estados para funcionalidades adicionais
  const [showChangePlanDialog, setShowChangePlanDialog] = useState(false);
  const [showPaymentMethodDialog, setShowPaymentMethodDialog] = useState(false);
  const [showAnnualDialog, setShowAnnualDialog] = useState(false);
  const [showAdvancePaymentDialog, setShowAdvancePaymentDialog] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false); // Modal de pagamento com cartão/PIX
  
  // Estados para formulário de cartão (Cadastrar Cartão)
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [docType, setDocType] = useState("CPF");
  const [docNumber, setDocNumber] = useState("");
  const [isCardProcessing, setIsCardProcessing] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardBrand, setCardBrand] = useState<string | null>(null);
  const [showPaymentDetailsDialog, setShowPaymentDetailsDialog] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [mpReady, setMpReady] = useState(false);
  const mpInstanceRef = useRef<any>(null);

  const { data, isLoading, refetch } = useQuery<SubscriptionData>({
    queryKey: ["/api/my-subscription"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Buscar desconto anual do sistema
  const { data: annualConfig } = useQuery({
    queryKey: ["annual-discount-config"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/system-config/annual-discount");
      return res.json();
    },
  });

  const annualDiscountPercent = annualConfig?.percent || 5;
  const annualDiscountEnabled = annualConfig?.enabled !== false;

  // Buscar chave pública do MP
  const { data: mpConfig } = useQuery({
    queryKey: ["mp-public-key"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/mercadopago/public-key");
      return res.json();
    },
    enabled: showPaymentMethodDialog,
  });

  // ═══════════════════════════════════════════════════════════════════
  // BUSCAR DOCUMENTO SALVO DO USUÁRIO PARA PRÉ-PREENCHER
  // ═══════════════════════════════════════════════════════════════════
  const { data: savedDocument } = useQuery({
    queryKey: ["user-document"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user/document");
      return res.json();
    },
  });
  
  // Pré-preencher documento salvo quando carregar
  useEffect(() => {
    if (savedDocument) {
      if (savedDocument.document_type) {
        setDocType(savedDocument.document_type);
      }
      if (savedDocument.document_number) {
        setDocNumber(savedDocument.document_number);
      }
    }
  }, [savedDocument]);

  // Inicializar MercadoPago SDK quando abrir dialog de cartão
  useEffect(() => {
    if (!mpConfig?.publicKey || !showPaymentMethodDialog) return;
    const initMP = () => {
      if (window.MercadoPago && mpConfig.publicKey) {
        try {
          mpInstanceRef.current = new window.MercadoPago(mpConfig.publicKey, { locale: 'pt-BR' });
          setMpReady(true);
        } catch (err) {
          console.error("Erro MP:", err);
        }
      }
    };
    if (window.MercadoPago) initMP();
    else {
      const script = document.createElement("script");
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.async = true;
      script.onload = initMP;
      document.body.appendChild(script);
    }
  }, [mpConfig, showPaymentMethodDialog]);

  // Detectar bandeira do cartão
  useEffect(() => {
    const clean = cardNumber.replace(/\s/g, "");
    if (clean.length >= 4) {
      if (/^4/.test(clean)) setCardBrand("visa");
      else if (/^5[1-5]/.test(clean) || /^2/.test(clean)) setCardBrand("mastercard");
      else if (/^3[47]/.test(clean)) setCardBrand("amex");
      else if (/^(636368|438935|504175|451416|636297|506|4576|4011)/.test(clean)) setCardBrand("elo");
      else if (/^(606282|3841)/.test(clean)) setCardBrand("hipercard");
      else setCardBrand(null);
    } else setCardBrand(null);
  }, [cardNumber]);

  // Resetar formulário de cartão ao fechar dialog
  useEffect(() => {
    if (!showPaymentMethodDialog) {
      setCardNumber("");
      setCardHolder("");
      setExpiryDate("");
      setCvv("");
      setDocNumber("");
      setCardError(null);
      setIsCardProcessing(false);
      setCardBrand(null);
    }
  }, [showPaymentMethodDialog]);

  // Formatadores do cartão
  const formatCardNumber = (v: string) => v.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  const formatExpiryDate = (v: string) => {
    const clean = v.replace(/\D/g, "").slice(0, 4);
    return clean.length >= 2 ? `${clean.slice(0, 2)}/${clean.slice(2)}` : clean;
  };
  const formatDoc = (v: string) => {
    const clean = v.replace(/\D/g, "");
    if (docType === "CPF") {
      return clean.slice(0, 11)
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})/, "$1-$2");
    }
    return clean.slice(0, 14)
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{1,2})/, "$1-$2");
  };

  // Mutation para cadastrar cartão e criar assinatura recorrente
  const createCardSubscription = useMutation({
    mutationFn: async (cardToken: string) => {
      const paymentMethodMap: Record<string, string> = {
        visa: "visa", mastercard: "master", amex: "amex", elo: "elo", hipercard: "hipercard"
      };
      const paymentMethodId = cardBrand ? paymentMethodMap[cardBrand] || "visa" : "visa";
      
      const res = await apiRequest("POST", "/api/subscriptions/create-mp-subscription", {
        subscriptionId: data?.subscription?.id,
        token: cardToken,
        payerEmail: user?.email || data?.subscription?.payerEmail,
        paymentMethodId,
        cardholderName: cardHolder,
        identificationNumber: docNumber.replace(/\D/g, ""),
        identificationType: docType,
      });
      
      if (!res.ok) {
        const responseData = await res.json();
        throw new Error(responseData.message || "Erro ao criar assinatura");
      }
      return res.json();
    },
    onSuccess: (responseData) => {
      if (responseData.status === "approved" || responseData.mpSubscriptionId) {
        toast({ 
          title: "🎉 Cartão cadastrado com sucesso!", 
          description: "Cobranças automáticas configuradas." 
        });
        setShowPaymentMethodDialog(false);
        queryClient.invalidateQueries({ queryKey: ["/api/my-subscription"] });
      } else if (responseData.initPoint) {
        toast({ 
          title: "Finalize seu cadastro", 
          description: "Redirecionando para completar a configuração..." 
        });
        setTimeout(() => {
          window.location.href = responseData.initPoint;
        }, 1500);
      } else {
        setCardError(responseData.message || "Erro ao processar cartão");
        setIsCardProcessing(false);
      }
    },
    onError: (err: Error) => {
      setCardError(translateMPError(err.message));
      setIsCardProcessing(false);
    }
  });

  // Handler para submeter o cartão
  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mpInstanceRef.current) {
      setCardError("Sistema de pagamento não inicializado. Recarregue a página.");
      return;
    }
    setIsCardProcessing(true);
    setCardError(null);

    try {
      const [expirationMonth, expirationYear] = expiryDate.split("/");
      const cardToken = await mpInstanceRef.current.createCardToken({
        cardNumber: cardNumber.replace(/\s/g, ""),
        cardholderName: cardHolder,
        cardExpirationMonth: expirationMonth,
        cardExpirationYear: "20" + expirationYear,
        securityCode: cvv,
        identificationType: docType,
        identificationNumber: docNumber.replace(/\D/g, ""),
      });
      
      if (cardToken?.error || cardToken?.message) {
        throw new Error(cardToken.error || cardToken.message || "Erro ao processar cartão");
      }
      
      if (!cardToken || !cardToken.id) {
        throw new Error("Não foi possível processar os dados do cartão.");
      }
      
      createCardSubscription.mutate(cardToken.id);
    } catch (err: any) {
      let errorMessage = "Verifique os dados do cartão.";
      const errMsg = String(err?.message || err?.error || String(err) || "").toLowerCase();
      
      if (errMsg.includes("card token") || errMsg.includes("service not found") || errMsg.includes("secure") || errMsg.includes("https")) {
        errorMessage = "⚠️ Pagamento seguro requer HTTPS.";
      } else if (err?.cause?.[0]?.code) {
        const code = err.cause[0].code;
        if (code === "205" || code === "E205") errorMessage = "Número do cartão inválido.";
        else if (code === "208" || code === "E208") errorMessage = "Mês de validade inválido.";
        else if (code === "209" || code === "E209") errorMessage = "Ano de validade inválido.";
        else if (code === "224" || code === "E224") errorMessage = "Código CVV inválido.";
      } else if (errMsg) {
        errorMessage = translateMPError(errMsg);
      }
      
      setCardError(errorMessage);
      setIsCardProcessing(false);
    }
  };

  const generatePixMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      // Se for cliente de revendedor, não gera PIX do sistema (usar dados do revendedor manualmente)
      if (resellerInfo?.isResellerClient && resellerInfo.reseller?.pixKey) {
        // Retornar dados fictícios para abrir o dialog com dados do revendedor
        return {
          status: "reseller_manual",
          isResellerPix: true,
          resellerData: resellerInfo.reseller,
          amount: resellerInfo.clientPrice || "0",
        };
      }
      const response = await apiRequest("POST", "/api/my-subscription/generate-pix", { subscriptionId });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.status === "reseller_manual") {
        // Mostrar dialog especial com dados do revendedor
        setShowPixDialog(true);
        toast({
          title: "Dados de Pagamento",
          description: `Realize o pagamento via PIX para ${data.resellerData.companyName}`,
        });
      } else if (data.status === "pending") {
        setPixData({
          qrCode: data.qrCode,
          qrCodeBase64: data.qrCodeBase64,
          ticketUrl: data.ticketUrl,
          paymentId: data.paymentId,
          amount: data.amount,
          expirationDate: data.expirationDate,
        });
        setShowPixDialog(true);
      } else {
        toast({
          title: "Erro",
          description: data.message || "Erro ao gerar PIX",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para gerar PIX de pagamento anual
  const generateAnnualPixMutation = useMutation({
    mutationFn: async ({ subscriptionId, discountPercent }: { subscriptionId: string, discountPercent: number }) => {
      const response = await apiRequest("POST", "/api/my-subscription/generate-annual-pix", { subscriptionId, discountPercent });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.status === "pending") {
        setPixData({
          qrCode: data.qrCode,
          qrCodeBase64: data.qrCodeBase64,
          ticketUrl: data.ticketUrl,
          paymentId: data.paymentId,
          amount: data.amount,
          expirationDate: data.expirationDate,
        });
        setShowAnnualDialog(false);
        setShowPixDialog(true);
        toast({
          title: "PIX Anual Gerado!",
          description: `Valor total com ${data.discountPercent}% de desconto: ${formatCurrency(data.amount)}`,
        });
      } else {
        toast({
          title: "Erro",
          description: data.message || "Erro ao gerar PIX anual",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para cobrar no cartão (pagamento anual)
  const chargeAnnualCardMutation = useMutation({
    mutationFn: async ({ subscriptionId, discountPercent }: { subscriptionId: string, discountPercent: number }) => {
      const response = await apiRequest("POST", "/api/my-subscription/charge-annual-card", { subscriptionId, discountPercent });
      return response.json();
    },
    onSuccess: (data) => {
      setShowAnnualDialog(false);
      toast({
        title: "Pagamento Processado!",
        description: data.message || "Pagamento anual cobrado com sucesso no cartão.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/my-subscription"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Countdown timer for PIX
  useEffect(() => {
    if (!pixData?.expirationDate) return;
    
    const interval = setInterval(() => {
      const now = new Date();
      const expiration = new Date(pixData.expirationDate);
      const diff = expiration.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeLeft("Expirado");
        clearInterval(interval);
        return;
      }
      
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, "0")}`);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [pixData?.expirationDate]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copiado!",
        description: "Código PIX copiado para a área de transferência",
      });
    } catch (err) {
      toast({
        title: "Erro",
        description: "Não foi possível copiar",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">Ativa</Badge>;
      case "provisional_receipt":
        return <Badge className="bg-amber-500">Comprovante em análise</Badge>;
      case "pending_pix":
        return <Badge className="bg-yellow-500">Aguardando PIX</Badge>;
      case "canceled":
        return <Badge className="bg-red-500">Cancelada</Badge>;
      case "expired":
        return <Badge className="bg-gray-500">Expirada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "rejected":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getPaymentStatusText = (status: string) => {
    switch (status) {
      case "approved":
        return "Aprovado";
      case "rejected":
        return "Recusado";
      case "pending":
        return "Pendente";
      case "in_process":
        return "Em processamento";
      case "refunded":
        return "Reembolsado";
      default:
        return status;
    }
  };

  const formatDateTime = (dateString?: string | null) => {
    if (!dateString) return "-";
    const parsedDate = new Date(dateString);
    if (Number.isNaN(parsedDate.getTime())) return "-";
    return format(parsedDate, "dd/MM/yyyy HH:mm", { locale: ptBR });
  };

  const humanizePaymentValue = (value?: string | null) => {
    if (!value) return "-";

    return repairMojibakeText(
      value
        .split(/[_-]/)
        .filter(Boolean)
        .map((part) => {
          if (part.length <= 3) return part.toUpperCase();
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join(" "),
    );
  };

  const getPaymentTypeLabel = (type?: string | null) => {
    switch (type) {
      case "first_payment":
        return "Primeira mensalidade";
      case "setup_fee":
        return "Taxa de implementacao";
      case "recurring":
        return "Mensalidade";
      case "refund":
        return "Reembolso";
      case "initial_activation":
        return "Ativacao inicial";
      case "annual_payment":
        return "Plano anual";
      case "pix_manual_receipt":
        return "Comprovante PIX";
      case "legacy_payment":
        return "Pagamento registrado";
      default:
        return humanizePaymentValue(type);
    }
  };

  const getPaymentMethodLabel = (paymentMethod?: string | null, cardBrand?: string | null) => {
    if (cardBrand) return humanizePaymentValue(cardBrand);

    switch (paymentMethod?.toLowerCase()) {
      case "pix":
        return "PIX";
      case "pix_manual":
        return "PIX manual";
      case "credit_card":
      case "card":
        return "Cartao de credito";
      case "reseller_manual":
        return "Cobranca manual";
      case "mercadopago":
        return "Mercado Pago";
      default:
        return humanizePaymentValue(paymentMethod);
    }
  };

  const getPaymentStatusDetailText = (statusDetail?: string | null) => {
    switch (statusDetail) {
      case "manual_activation":
        return "Pagamento registrado manualmente para manter o historico da assinatura.";
      case "pending_contingency":
        return "Pagamento em analise temporaria pela operadora.";
      case "pending_review_manual":
        return "Pagamento aguardando revisao manual.";
      case "manual_receipt_approved":
        return "Comprovante PIX aprovado pelo administrativo.";
      case "manual_receipt_rejected":
        return "Comprovante PIX recusado pelo administrativo.";
      case "manual_receipt_pending":
        return "Comprovante PIX aguardando analise.";
      default:
        return humanizePaymentValue(statusDetail);
    }
  };

  const getPaymentDisplayDate = (payment?: PaymentRecord | null) =>
    payment?.processedAt || payment?.paymentDate || payment?.createdAt || null;

  const openPaymentDetails = (payment: PaymentRecord) => {
    setSelectedPayment(payment);
    setShowPaymentDetailsDialog(true);
  };

  if (isLoading) {
    return repairReactNodeText(
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const { subscription, plan, payments, stats, resellerInfo } = data || {};
  const isResellerManaged = !!resellerInfo?.isResellerClient;
  const hasPendingReceipt = Boolean(subscription?.pendingReceipt);
  const effectiveStatus = hasPendingReceipt && subscription?.status === "active"
    ? "provisional_receipt"
    : subscription?.status;
  const latestApprovedPayment = payments?.find((payment) => payment.status === "approved") || null;

  // Tela padrão de "nenhuma assinatura" (mesma para todos)
  if (!subscription) {
    return repairReactNodeText(
      <div className="container mx-auto py-8 px-4">
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <CardTitle>Nenhuma Assinatura</CardTitle>
            <CardDescription>
              Você ainda não possui uma assinatura ativa
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Ban className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-muted-foreground mb-6">
              Escolha um plano para começar a usar todos os recursos do AgenteZap
            </p>
            <Button onClick={() => window.location.href = "/plans"}>
              Ver Planos Disponíveis
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return repairReactNodeText(
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* Banner do Revendedor - Aparece quando é cliente de revenda */}
      {resellerInfo?.isResellerClient && resellerInfo.reseller && (
        <Card className="mb-6 overflow-hidden border-2" style={{ borderColor: resellerInfo.reseller.accentColor || '#22c55e' }}>
          <div className="flex items-center justify-between p-4" style={{ backgroundColor: `${resellerInfo.reseller.primaryColor || '#000000'}10` }}>
            <div className="flex items-center gap-4">
              {resellerInfo.reseller.logoUrl ? (
                <img 
                  src={resellerInfo.reseller.logoUrl} 
                  alt={resellerInfo.reseller.companyName}
                  className="h-12 w-12 rounded-lg object-contain bg-white p-1"
                />
              ) : (
                <div className="h-12 w-12 rounded-lg flex items-center justify-center text-white text-lg font-bold"
                     style={{ backgroundColor: resellerInfo.reseller.accentColor || '#22c55e' }}>
                  {resellerInfo.reseller.companyName?.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h2 className="font-semibold text-lg">{resellerInfo.reseller.companyName}</h2>
                {resellerInfo.reseller.welcomeMessage && (
                  <p className="text-sm text-muted-foreground">{resellerInfo.reseller.welcomeMessage}</p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Contato</p>
              {resellerInfo.reseller.supportPhone && (
                <a 
                  href={`https://wa.me/${resellerInfo.reseller.supportPhone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline"
                  style={{ color: resellerInfo.reseller.accentColor || '#22c55e' }}
                >
                  📱 {resellerInfo.reseller.supportPhone}
                </a>
              )}
              {resellerInfo.reseller.supportEmail && (
                <p className="text-sm text-muted-foreground">{resellerInfo.reseller.supportEmail}</p>
              )}
            </div>
          </div>
          
          {/* Seção de Pagamento PIX */}
          {resellerInfo.reseller.pixKey && !resellerInfo.isFreeClient && (
            <div className="p-4 border-t bg-yellow-50 dark:bg-yellow-950/30">
              <div className="text-center mb-4">
                <p className="text-lg font-bold text-yellow-800 dark:text-yellow-200">
                  💰 Pagamento via PIX
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Faça o pagamento direto para {resellerInfo.reseller.companyName}
                </p>
              </div>
              
              {/* Valor a Pagar */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-muted-foreground text-center">Valor da mensalidade:</p>
                <p className="text-3xl font-bold text-center" style={{ color: resellerInfo.reseller.accentColor || '#22c55e' }}>
                  R$ {parseFloat(resellerInfo.clientPrice || '0').toFixed(2)}
                </p>
              </div>
              
              {/* Dados bancários */}
              <div className="space-y-3">
                {/* Titular */}
                {resellerInfo.reseller.pixHolderName && (
                  <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">👤</span>
                      <span className="text-sm text-muted-foreground">Titular:</span>
                    </div>
                    <span className="font-medium">{resellerInfo.reseller.pixHolderName}</span>
                  </div>
                )}
                
                {/* Banco */}
                {resellerInfo.reseller.pixBankName && (
                  <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">🏦</span>
                      <span className="text-sm text-muted-foreground">Banco:</span>
                    </div>
                    <span className="font-medium">{resellerInfo.reseller.pixBankName}</span>
                  </div>
                )}
                
                {/* Chave PIX */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">🔑</span>
                      <span className="text-sm text-muted-foreground">
                        Chave PIX ({resellerInfo.reseller.pixKeyType?.toUpperCase()}):
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(resellerInfo.reseller.pixKey!);
                        toast({ title: "✅ Chave PIX copiada!", description: "Cole no seu app de banco" });
                      }}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copiar
                    </Button>
                  </div>
                  <code className="block mt-2 text-center font-mono bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded text-sm break-all">
                    {resellerInfo.reseller.pixKey}
                  </code>
                </div>
              </div>
              
              {/* Botão WhatsApp */}
              {resellerInfo.reseller.supportPhone && (
                <div className="mt-4">
                  <Button
                    className="w-full"
                    style={{ 
                      backgroundColor: '#25D366',
                      color: 'white'
                    }}
                    onClick={() => {
                      const phone = resellerInfo.reseller.supportPhone?.replace(/\D/g, '');
                      const message = encodeURIComponent(
                        `Olá! Acabei de fazer o pagamento de R$ ${parseFloat(resellerInfo.clientPrice || '0').toFixed(2)} via PIX. Segue o comprovante:`
                      );
                      window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
                    }}
                  >
                    📲 Enviar Comprovante via WhatsApp
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Minha Assinatura</h1>
          <p className="text-muted-foreground">
            {resellerInfo?.isResellerClient 
              ? `Gerenciada por ${resellerInfo.reseller.companyName}` 
              : 'Gerencie sua assinatura e pagamentos'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {subscription.pendingReceipt && (
        <Card className="mb-6 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <Shield className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">
                  Comprovante recebido
                </h3>
                <p className="text-emerald-700 dark:text-emerald-300 text-sm mt-1">
                  Seu acesso foi liberado provisoriamente enquanto o comprovante PIX é analisado no painel administrativo. Qualquer crédito de indicação ligado a esse pagamento só entra depois da aprovação.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                {getStatusBadge(effectiveStatus || "unknown")}
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Dias Restantes</p>
                <p className="text-2xl font-bold">{subscription.daysRemaining}</p>
              </div>
              <CalendarDays className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Pago</p>
                <p className="text-2xl font-bold">{formatCurrency(stats?.totalPaid || 0)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pagamentos</p>
                <p className="text-2xl font-bold">{stats?.approvedPayments || 0}/{stats?.totalPayments || 0}</p>
              </div>
              <Receipt className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Próxima Fatura - Novo Card Destacado */}
        <Card className="md:col-span-2 border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="w-5 h-5 text-primary" />
              Próxima Fatura
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              // Usar nextPaymentDate se existir, senão usar dataFim (data de vencimento da assinatura)
              const nextPaymentDateStr = subscription.nextPaymentDate || subscription.dataFim;
              const nextPayment = nextPaymentDateStr ? new Date(nextPaymentDateStr) : null;
              const isOverdue = nextPayment && isPast(nextPayment);
              const monthlyValue = subscription.couponPrice 
                ? parseFloat(subscription.couponPrice) 
                : parseFloat(resellerInfo?.clientPrice || plan?.valor || "0");
              
              // Verificar se é assinatura com cartão (tem mpSubscriptionId)
              // Para clientes de revendedor, o backend já retorna mpSubscriptionId=null
              const hasCardSubscription = !!subscription.mpSubscriptionId;
              
              return (
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full ${isOverdue ? 'bg-red-100' : 'bg-primary/10'}`}>
                      <CalendarDays className={`w-6 h-6 ${isOverdue ? 'text-red-600' : 'text-primary'}`} />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Vencimento</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xl font-bold">
                          {nextPayment 
                            ? format(nextPayment, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                            : "Não definido"}
                        </p>
                        {isOverdue && (
                          <Badge variant="destructive" className="flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            VENCIDA
                          </Badge>
                        )}
                      </div>
                      {/* Mostrar forma de pagamento se tiver cartão */}
                      {hasCardSubscription && subscription.cardLastFourDigits && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          Cartão •••• {subscription.cardLastFourDigits}
                          {subscription.cardBrand && ` (${subscription.cardBrand})`}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Valor</p>
                      <p className="text-2xl font-bold text-primary">
                        {formatCurrency(monthlyValue)}
                      </p>
                    </div>
                    
                    {/* Se tem assinatura com cartão (e NÃO é cliente revendedor), cobrança é automática */}
                    {hasCardSubscription && !isResellerManaged ? (
                      <div className="text-center">
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Cobrança Automática
                        </Badge>
                      </div>
                    ) : (
                      /* Botão para abrir modal de pagamento (Cartão ou PIX) - igual para todos os clientes */
                      <Button
                        onClick={() => {
                          if (isResellerManaged) {
                            generatePixMutation.mutate(subscription.id);
                          } else {
                            setShowPaymentModal(true);
                          }
                        }}
                        className={isOverdue ? "bg-red-600 hover:bg-red-700" : ""}
                      >
                        <Wallet className="w-4 h-4 mr-2" />
                        {isResellerManaged ? "Ver Dados PIX" : (isOverdue ? "Pagar Agora" : "Pagar Antecipado")}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Subscription Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Detalhes do Plano
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Plano</span>
              <span className="font-medium">{plan?.nome || "N/A"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Valor</span>
              <span className="font-medium">
                {subscription.couponPrice 
                  ? (
                    <span>
                      <span className="line-through text-sm text-gray-400 mr-2">
                        {formatCurrency(parseFloat(resellerInfo?.clientPrice || plan?.valor || "0"))}
                      </span>
                      {formatCurrency(parseFloat(subscription.couponPrice))}
                    </span>
                  )
                  : formatCurrency(parseFloat(resellerInfo?.clientPrice || plan?.valor || "0"))
                }
                <span className="text-sm text-muted-foreground">/mês</span>
              </span>
            </div>
            {subscription.couponCode && (
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Cupom Aplicado</span>
                <Badge variant="secondary">{subscription.couponCode}</Badge>
              </div>
            )}
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Créditos/Mês</span>
              <span className="font-medium">{plan?.creditos?.toLocaleString() || "0"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Início</span>
              <span className="font-medium">
                {subscription.dataInicio 
                  ? format(new Date(subscription.dataInicio), "dd/MM/yyyy", { locale: ptBR })
                  : "N/A"}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Vencimento</span>
              <span className="font-medium">
                {subscription.dataFim 
                  ? format(new Date(subscription.dataFim), "dd/MM/yyyy", { locale: ptBR })
                  : "N/A"}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">Próximo Pagamento</span>
              <span className="font-medium">
                {subscription.nextPaymentDate 
                  ? format(new Date(subscription.nextPaymentDate), "dd/MM/yyyy", { locale: ptBR })
                  : "N/A"}
              </span>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            {(subscription.status === "pending_pix" || subscription.needsPayment) && (
              <Button 
                className="w-full" 
                onClick={() => generatePixMutation.mutate(subscription.id)}
                disabled={generatePixMutation.isPending}
              >
                {generatePixMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Gerando PIX...
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4 mr-2" />
                    {subscription.status === "pending_pix" ? "Pagar com PIX" : "Renovar Assinatura"}
                  </>
                )}
              </Button>
            )}
            
            {/* Botões de Ação */}
            <div className="w-full grid grid-cols-1 gap-2 mt-2 pt-2 border-t">
              {!isResellerManaged && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setLocation("/plans")}
                  className="w-full"
                >
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Alterar Plano
                </Button>
              )}
              
              {!isResellerManaged && annualDiscountEnabled && subscription.status === "active" && plan?.tipo !== "anual" && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowAnnualDialog(true)}
                  className="w-full border-green-200 text-green-700 hover:bg-green-50"
                >
                  <Percent className="w-4 h-4 mr-2" />
                  Pagar Anual ({annualDiscountPercent}% desconto)
                </Button>
              )}
              
              {/* Antecipar Pagamento - SÓ PARA PIX (sem assinatura de cartão) */}
              {subscription.status === "active" &&
               subscription.daysRemaining <= 30 &&
               !subscription.mpSubscriptionId &&
               !isResellerManaged && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPaymentModal(true)}
                  className="w-full border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  <CalendarClock className="w-4 h-4 mr-2" />
                  Antecipar Pagamento
                </Button>
              )}

              {/* Para clientes sem cartão cadastrado - opção de cadastrar - NÃO mostrar para plano revenda */}
              {subscription.status === "active" && !subscription.mpSubscriptionId && !resellerInfo?.isResellerClient && plan?.tipo !== 'revenda' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPaymentMethodDialog(true)}
                  className="w-full border-purple-200 text-purple-700 hover:bg-purple-50"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Cadastrar Cartão (cobrança automática)
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>

        {/* Payment History */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="w-5 h-5" />
                  Historico de Pagamentos
                </CardTitle>
                <CardDescription>
                  <span>{stats?.approvedPayments} fatura(s) paga(s), {stats?.failedPayments} recusada(s)</span>
                  {latestApprovedPayment && (
                    <span> - Ultima confirmacao em {formatDateTime(getPaymentDisplayDate(latestApprovedPayment))}</span>
                  )}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="sm:self-start"
                onClick={() => setLocation("/historico-pagamentos")}
              >
                <Receipt className="w-4 h-4 mr-2" />
                Ver historico completo
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {payments && payments.length > 0 ? (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="rounded-lg border bg-muted/50 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        {getPaymentStatusIcon(payment.status)}
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-sm">
                              {formatCurrency(parseFloat(payment.amount))}
                            </p>
                            <span className="text-xs text-muted-foreground">
                              {getPaymentTypeLabel(payment.paymentType)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Cobrado em {formatDateTime(getPaymentDisplayDate(payment))}
                            {payment.dueDate ? ` - Vencimento ${formatDateTime(payment.dueDate)}` : ""}
                          </p>
                          {payment.mpPaymentId && (
                            <p className="text-xs text-muted-foreground">
                              ID da transacao: {payment.mpPaymentId}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:items-end">
                        <Badge variant={payment.status === "approved" ? "default" : "secondary"}>
                          {getPaymentStatusText(payment.status)}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {getPaymentMethodLabel(payment.paymentMethod, payment.cardBrand)}
                          {payment.cardLastFourDigits ? ` - Cartao final ${payment.cardLastFourDigits}` : ""}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPaymentDetails(payment)}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Detalhes
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum pagamento registrado</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {hasPendingReceipt && (
        <Card className="mt-6 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <Receipt className="w-6 h-6 text-amber-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                  Comprovante em análise
                </h3>
                <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">
                  Seu acesso está liberado provisoriamente enquanto o comprovante PIX é revisado pelo admin.
                  Se o comprovante for recusado, a conta volta para não assinante e nenhum crédito de indicação é liberado.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alert for PIX pending */}
      {!hasPendingReceipt && subscription.status === "pending_pix" && (
        <Card className="mt-6 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">
                  Pagamento Pendente
                </h3>
                <p className="text-yellow-700 dark:text-yellow-300 text-sm mt-1">
                  Sua assinatura está aguardando o pagamento via PIX. Clique no botão "Pagar com PIX" 
                  para gerar um novo código QR e completar o pagamento.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alert for renewal */}
      {subscription.status === "active" && subscription.daysRemaining <= 5 && subscription.daysRemaining > 0 && (
        <Card className="mt-6 border-blue-500 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <CalendarDays className="w-6 h-6 text-blue-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-blue-800 dark:text-blue-200">
                  Renovação em Breve
                </h3>
                <p className="text-blue-700 dark:text-blue-300 text-sm mt-1">
                  Sua assinatura vence em {subscription.daysRemaining} dias. Renove agora para continuar 
                  utilizando todos os recursos do AgenteZap sem interrupções.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PIX Dialog */}
      <Dialog open={showPixDialog} onOpenChange={setShowPixDialog}>
        <DialogContent className="w-[95vw] sm:w-[85vw] md:w-[70vw] lg:w-[55vw] max-w-2xl max-h-[95vh] overflow-y-auto border-0 shadow-2xl p-8">
          <DialogHeader>
            <DialogTitle className="text-center">Pagamento via PIX</DialogTitle>
            <DialogDescription className="text-center">
              {resellerInfo?.isResellerClient && resellerInfo.reseller?.pixKey
                ? `Realize o pagamento para ${resellerInfo.reseller.companyName}`
                : "Escaneie o QR Code ou copie o código para pagar"}
            </DialogDescription>
          </DialogHeader>
          
          {/* Se for cliente de revendedor, mostrar dados do revendedor */}
          {resellerInfo?.isResellerClient && resellerInfo.reseller?.pixKey ? (
            <div className="space-y-4">
              {/* Valor a Pagar */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-lg p-4 border-2 border-green-200">
                <p className="text-sm text-center text-muted-foreground mb-1">Valor da mensalidade:</p>
                <p className="text-3xl font-bold text-center text-green-600">
                  R$ {parseFloat(resellerInfo.clientPrice || '0').toFixed(2)}
                </p>
              </div>
              
              {/* Dados bancários do Revendedor */}
              <div className="space-y-3">
                {/* Titular */}
                {resellerInfo.reseller.pixHolderName && (
                  <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">👤</span>
                      <span className="text-sm text-muted-foreground">Titular:</span>
                    </div>
                    <span className="font-medium">{resellerInfo.reseller.pixHolderName}</span>
                  </div>
                )}
                
                {/* Banco */}
                {resellerInfo.reseller.pixBankName && (
                  <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">🏦</span>
                      <span className="text-sm text-muted-foreground">Banco:</span>
                    </div>
                    <span className="font-medium">{resellerInfo.reseller.pixBankName}</span>
                  </div>
                )}
                
                {/* Chave PIX */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">🔑</span>
                      <span className="text-sm text-muted-foreground">
                        Chave PIX ({resellerInfo.reseller.pixKeyType?.toUpperCase() || 'CHAVE'}):
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(resellerInfo.reseller.pixKey!);
                        toast({ title: "✅ Chave PIX copiada!", description: "Cole no seu app de banco" });
                      }}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copiar
                    </Button>
                  </div>
                  <code className="block text-center font-mono bg-white dark:bg-gray-700 px-3 py-2 rounded text-sm break-all border">
                    {resellerInfo.reseller.pixKey}
                  </code>
                </div>
              </div>
              
              {/* Botão WhatsApp para enviar comprovante */}
              {resellerInfo.reseller.supportPhone && (
                <Button
                  className="w-full py-6 text-base"
                  style={{ backgroundColor: '#25D366' }}
                  onClick={() => {
                    const phone = resellerInfo.reseller.supportPhone?.replace(/\D/g, '');
                    const message = encodeURIComponent(
                      `Olá! Acabei de realizar o pagamento de R$ ${parseFloat(resellerInfo.clientPrice || '0').toFixed(2)} via PIX. Segue o comprovante:`
                    );
                    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
                  }}
                >
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Enviar Comprovante via WhatsApp
                </Button>
              )}
              
              <p className="text-xs text-center text-muted-foreground">
                Após o pagamento, envie o comprovante via WhatsApp para confirmação.
              </p>
            </div>
          ) : pixData && (
            <div className="space-y-4">
              {/* QR Code */}
              <div className="flex justify-center">
                {pixData.qrCodeBase64 && (
                  <img 
                    src={pixData.qrCodeBase64.startsWith('data:') ? pixData.qrCodeBase64 : `data:image/png;base64,${pixData.qrCodeBase64}`}
                    alt="QR Code PIX"
                    className="w-48 h-48 border rounded-lg"
                  />
                )}
              </div>
              
              {/* Amount */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Valor</p>
                <p className="text-2xl font-bold text-primary">
                  {formatCurrency(pixData.amount)}
                </p>
              </div>
              
              {/* Timer */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Expira em</p>
                <p className={`text-lg font-mono ${timeLeft === "Expirado" ? "text-red-500" : "text-yellow-600"}`}>
                  {timeLeft}
                </p>
              </div>
              
              {/* Copy Code Button */}
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => copyToClipboard(pixData.qrCode)}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copiar Código PIX
              </Button>
              
              {/* Open in App */}
              {pixData.ticketUrl && (
                <Button 
                  variant="ghost" 
                  className="w-full" 
                  onClick={() => window.open(pixData.ticketUrl, "_blank")}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir no App do Banco
                </Button>
              )}
              
              <p className="text-xs text-center text-muted-foreground">
                O pagamento será confirmado automaticamente em alguns segundos após a conclusão.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showPaymentDetailsDialog}
        onOpenChange={(open) => {
          setShowPaymentDetailsDialog(open);
          if (!open) {
            setSelectedPayment(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {selectedPayment?.status === "approved" ? "Detalhes da fatura paga" : "Detalhes da cobranca"}
            </DialogTitle>
            <DialogDescription>
              Veja o valor, status e os dados completos desta cobranca no historico do cliente.
            </DialogDescription>
          </DialogHeader>

          {selectedPayment && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                  <p className="mt-1 font-medium">{getPaymentStatusText(selectedPayment.status)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Valor</p>
                  <p className="mt-1 font-medium">{formatCurrency(selectedPayment.amount)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Tipo</p>
                  <p className="mt-1 font-medium">{getPaymentTypeLabel(selectedPayment.paymentType)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Metodo</p>
                  <p className="mt-1 font-medium">
                    {getPaymentMethodLabel(selectedPayment.paymentMethod, selectedPayment.cardBrand)}
                    {selectedPayment.cardLastFourDigits ? ` •••• ${selectedPayment.cardLastFourDigits}` : ""}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Cobrado em</p>
                  <p className="mt-1 font-medium">{formatDateTime(getPaymentDisplayDate(selectedPayment))}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Vencimento</p>
                  <p className="mt-1 font-medium">{formatDateTime(selectedPayment.dueDate)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">ID transacao MP</p>
                  <p className="mt-1 break-all font-mono text-sm">{selectedPayment.mpPaymentId || "-"}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">ID assinatura MP</p>
                  <p className="mt-1 break-all font-mono text-sm">{selectedPayment.mpSubscriptionId || "-"}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Pagador</p>
                  <p className="mt-1 break-all font-medium">{selectedPayment.payerEmail || subscription?.payerEmail || "-"}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Detalhe do status</p>
                  <p className="mt-1 font-medium">{getPaymentStatusDetailText(selectedPayment.statusDetail)}</p>
                </div>
              </div>

              {(selectedPayment.netAmount || selectedPayment.feeAmount) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Valor liquido</p>
                    <p className="mt-1 font-medium">{formatCurrency(selectedPayment.netAmount)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Taxa</p>
                    <p className="mt-1 font-medium">{formatCurrency(selectedPayment.feeAmount)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPaymentDetailsDialog(false);
                setLocation("/historico-pagamentos");
              }}
            >
              Ver historico completo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Plano Anual */}
      <Dialog open={showAnnualDialog} onOpenChange={setShowAnnualDialog}>
        <DialogContent className="w-[95vw] sm:w-[85vw] md:w-[70vw] lg:w-[60vw] max-w-3xl max-h-[95vh] overflow-y-auto border-0 shadow-2xl p-8">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="w-5 h-5 text-green-600" />
              Pagar Plano Anual
            </DialogTitle>
            <DialogDescription>
              Economize {annualDiscountPercent}% pagando 12 meses de uma vez!
            </DialogDescription>
          </DialogHeader>
          
          {plan && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Plano Atual</span>
                  <span className="font-medium">{plan.nome}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Valor Mensal</span>
                  <span className="font-medium">
                    {subscription?.couponPrice 
                      ? formatCurrency(parseFloat(subscription.couponPrice))
                      : formatCurrency(parseFloat(plan.valor))}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">12 meses (sem desconto)</span>
                  <span className="font-medium line-through text-gray-400">
                    {formatCurrency(
                      (subscription?.couponPrice 
                        ? parseFloat(subscription.couponPrice) 
                        : parseFloat(plan.valor)) * 12
                    )}
                  </span>
                </div>
                <div className="border-t border-green-200 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-green-700">Total com {annualDiscountPercent}% OFF</span>
                    <span className="text-xl font-bold text-green-600">
                      {formatCurrency(
                        (subscription?.couponPrice 
                          ? parseFloat(subscription.couponPrice) 
                          : parseFloat(plan.valor)) * 12 * (1 - annualDiscountPercent / 100)
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-green-600 mt-1">
                    Você economiza {formatCurrency(
                      (subscription?.couponPrice 
                        ? parseFloat(subscription.couponPrice) 
                        : parseFloat(plan.valor)) * 12 * (annualDiscountPercent / 100)
                    )}!
                  </p>
                </div>
              </div>
              
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                {/* Se tem cartão cadastrado, mostrar opção de cobrar no cartão */}
                {subscription?.mpSubscriptionId && subscription?.cardLastFourDigits && (
                  <Button 
                    className="w-full bg-purple-600 hover:bg-purple-700"
                    onClick={() => chargeAnnualCardMutation.mutate({ 
                      subscriptionId: subscription.id, 
                      discountPercent: annualDiscountPercent 
                    })}
                    disabled={chargeAnnualCardMutation.isPending}
                  >
                    {chargeAnnualCardMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="w-4 h-4 mr-2" />
                    )}
                    Cobrar no Cartão •••• {subscription.cardLastFourDigits}
                  </Button>
                )}
                
                {/* Botão de PIX Anual - Sem campo de documento */}
                <Button 
                  className={`w-full ${subscription?.mpSubscriptionId ? 'bg-green-500 hover:bg-green-600' : 'bg-green-600 hover:bg-green-700'}`}
                  onClick={() => generateAnnualPixMutation.mutate({ 
                    subscriptionId: subscription!.id, 
                    discountPercent: annualDiscountPercent,
                  })}
                  disabled={generateAnnualPixMutation.isPending}
                >
                  {generateAnnualPixMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <QrCode className="w-4 h-4 mr-2" />
                  )}
                  Pagar Anual com PIX
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setShowAnnualDialog(false)}
                >
                  Cancelar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Dialog para cadastrar cartão (clientes PIX manual) - FORMULÁRIO COMPLETO */}
      <Dialog open={showPaymentMethodDialog} onOpenChange={setShowPaymentMethodDialog}>
        <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[80vw] lg:w-[70vw] max-w-4xl max-h-[95vh] overflow-y-auto border-0 shadow-2xl p-8">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-purple-600" />
              Cadastrar Cartão para Cobrança Automática
            </DialogTitle>
            <DialogDescription>
              Com o cartão cadastrado, suas mensalidades serão cobradas automaticamente no dia do vencimento.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleCardSubmit} className="space-y-4">
            {/* Info do plano atual */}
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Plano:</span>
                <span className="font-medium">{plan?.nome || "Plano Ativo"}</span>
              </div>
              <div className="flex justify-between items-center text-sm mt-1">
                <span className="text-muted-foreground">Valor mensal:</span>
                <span className="font-bold text-purple-600">
                  {subscription?.couponPrice 
                    ? formatCurrency(parseFloat(subscription.couponPrice))
                    : formatCurrency(parseFloat(plan?.valor || "0"))}
                </span>
              </div>
            </div>

            {/* Erro */}
            {cardError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{cardError}</p>
              </div>
            )}

            {/* Número do Cartão */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Número do Cartão</label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="0000 0000 0000 0000"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  className="h-12 text-base bg-white border-gray-200 focus:border-gray-400 focus:ring-0"
                  disabled={isCardProcessing}
                />
                {cardBrand && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold uppercase text-purple-600">
                    {cardBrand}
                  </span>
                )}
              </div>
            </div>

            {/* Nome e Validade */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Nome no Cartão</label>
                <Input
                  type="text"
                  placeholder="NOME COMPLETO"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                  disabled={isCardProcessing}
                  className="h-12 text-base bg-white border-gray-200 focus:border-gray-400 focus:ring-0"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Validade</label>
                <Input
                  type="text"
                  placeholder="MM/AA"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(formatExpiryDate(e.target.value))}
                  disabled={isCardProcessing}
                  className="h-12 text-base bg-white border-gray-200 focus:border-gray-400 focus:ring-0"
                />
              </div>
            </div>

            {/* CVV e CPF */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">CVV</label>
                <Input
                  type="text"
                  placeholder="000"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  disabled={isCardProcessing}
                  className="h-12 text-base bg-white border-gray-200 focus:border-gray-400 focus:ring-0"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">CPF do Titular</label>
                <Input
                  type="text"
                  placeholder="000.000.000-00"
                  value={docNumber}
                  onChange={(e) => setDocNumber(formatDoc(e.target.value))}
                  disabled={isCardProcessing}
                  className="h-12 text-base bg-white border-gray-200 focus:border-gray-400 focus:ring-0"
                />
              </div>
            </div>

            {/* Segurança */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Shield className="w-4 h-4" />
              <span>Pagamento seguro via Mercado Pago. Seus dados são protegidos.</span>
            </div>

            {/* Botões */}
            <div className="flex flex-col gap-3 pt-4">
              <Button 
                type="submit"
                className="w-full h-12 text-base bg-purple-600 hover:bg-purple-700 shadow-lg"
                disabled={isCardProcessing || !mpReady || !cardNumber || !cardHolder || !expiryDate || !cvv || !docNumber}
              >
                {isCardProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Cadastrar Cartão e Ativar Cobrança Automática
                  </>
                )}
              </Button>
              <Button 
                type="button"
                variant="outline" 
                className="w-full"
                onClick={() => setShowPaymentMethodDialog(false)}
                disabled={isCardProcessing}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Pagamento com opções de Cartão e PIX */}
      {!isResellerManaged && (
        <SubscribeModal
          open={showPaymentModal}
          onOpenChange={setShowPaymentModal}
          subscriptionId={subscription?.id || null}
          onSuccess={() => {
            refetch();
            setShowPaymentModal(false);
          }}
        />
      )}
    </div>
  );
}
