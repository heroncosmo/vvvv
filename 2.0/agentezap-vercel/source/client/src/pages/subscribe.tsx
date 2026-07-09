import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Loader2, 
  Check, 
  Shield, 
  Lock, 
  CreditCard, 
  ArrowLeft,
  AlertCircle,
  QrCode,
  Copy,
  CheckCircle2,
  Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { repairReactNodeText } from "@/lib/repair-react-node";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { repairMojibakeText } from "@shared/mojibake";

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKOUT PREMIUM - DESIGN SHOPIFY STYLE - v2.1
// Layout Split: Esquerda (Dark/Info) | Direita (Light/Form)
// Foco total em conversão e confiança
// ═══════════════════════════════════════════════════════════════════════════════

declare global {
  interface Window {
    MercadoPago: any;
  }
}

// Traduções PT-BR para erros do Mercado Pago
const MP_ERROR_TRANSLATIONS: Record<string, string> = {
  // Erros de cartão rejeitado
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
  
  // Erros de validação de campos
  "invalid_card_number": "Número do cartão inválido.",
  "invalid_expiration_date": "Data de validade inválida.",
  "invalid_security_code": "Código de segurança (CVV) inválido.",
  "invalid_holder_name": "Nome do titular deve conter apenas letras.",
  "invalid_identification": "CPF/CNPJ inválido. Verifique o número.",
  "card_token_creation_failed": "Erro ao processar o cartão. Tente novamente.",
  
  // Erros adicionais do MP
  "pending_contingency": "Pagamento em análise. Aguarde a confirmação.",
  "pending_review_manual": "Pagamento em revisão manual.",
  "rejected": "Pagamento rejeitado. Tente outro cartão.",
  "cancelled": "Pagamento cancelado.",
  "refunded": "Pagamento estornado.",
  "charged_back": "Pagamento contestado.",
  
  // Erros de SDK
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

export default function Subscribe() {
  const [location, setLocation] = useLocation();
  const [, params] = useRoute("/subscribe/:id");
  const subscriptionId = params?.id || null;
  const { toast } = useToast();
  const { user } = useAuth(); // Pegar usuário logado para auto-preencher email

  // Estados do formulário
  const [paymentMethod, setPaymentMethod] = useState<"card" | "pix">("card"); // Método de pagamento
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [docType, setDocType] = useState("CPF");
  const [docNumber, setDocNumber] = useState("");
  const [email, setEmail] = useState(""); // Email para o MP
  const [isProcessing, setIsProcessing] = useState(false);
  const [mpReady, setMpReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardBrand, setCardBrand] = useState<string | null>(null);
  
  // Estados para PIX
  const [pixData, setPixData] = useState<{
    qrCode: string;
    qrCodeBase64: string;
    paymentId: string;
    expirationDate: string;
    amount: number;
  } | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [checkingPixStatus, setCheckingPixStatus] = useState(false);
  
  const mpInstanceRef = useRef<any>(null);
  const pixPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-preencher email do usuário logado
  useEffect(() => {
    if (user?.email && !email) {
      setEmail(user.email);
    }
  }, [user, email]);

  // Buscar assinatura e plano
  const { data: subscription, isLoading: subscriptionLoading } = useQuery({
    queryKey: ["subscription", subscriptionId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/subscriptions/${subscriptionId}`);
      return res.json();
    },
    enabled: !!subscriptionId,
  });

  const plan = subscription?.plan;

  // Buscar config MP
  const { data: mpConfig } = useQuery({
    queryKey: ["mp-public-key"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/mercadopago/public-key");
      return res.json();
    },
  });

  // Verificar se PIX manual está ativado no admin
  const { data: checkoutConfig } = useQuery({
    queryKey: ["checkout-config"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/checkout/config");
      return res.json();
    },
  });

  const pixManualEnabled = checkoutConfig?.pix_manual_enabled === true;

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

  // Forçar PIX quando pix_manual_enabled está ativo
  useEffect(() => {
    if (pixManualEnabled && paymentMethod !== "pix") {
      setPaymentMethod("pix");
    }
  }, [pixManualEnabled, paymentMethod]);

  // Inicializar MP
  useEffect(() => {
    if (!mpConfig?.publicKey) return;
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
  }, [mpConfig]);

  // Detectar bandeira
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

  // Formatters
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

  // Mutation
  const createSubscription = useMutation({
    mutationFn: async (cardToken: string) => {
      const paymentMethodMap: Record<string, string> = {
        visa: "visa", mastercard: "master", amex: "amex", elo: "elo", hipercard: "hipercard"
      };
      const paymentMethodId = cardBrand ? paymentMethodMap[cardBrand] || "visa" : "visa";
      
      const res = await apiRequest("POST", "/api/subscriptions/create-mp-subscription", {
        subscriptionId,
        token: cardToken,
        payerEmail: email,
        paymentMethodId,
        cardholderName: cardHolder,
        identificationNumber: docNumber.replace(/\D/g, ""),
        identificationType: docType,
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erro ao criar assinatura");
      }
      return res.json();
    },
    onSuccess: (data) => {
      // Pagamento em análise (pendente de revisão manual)
      if (data.status === "in_process") {
        toast({ 
          title: "⏳ Pagamento em análise", 
          description: data.message || "Você receberá uma confirmação em até 2 dias úteis por e-mail." 
        });
        setIsProcessing(false);
        setTimeout(() => setLocation("/dashboard"), 3000);
        return;
      }
      
      if (data.status === "approved") {
        toast({ 
          title: "🎉 Assinatura ativada com sucesso!", 
          description: "Cobranças automáticas configuradas. Bem-vindo ao AgenteZap!" 
        });
        setTimeout(() => setLocation("/dashboard"), 2000);
      } else if (data.initPoint) {
        // Fallback mode: user needs to complete payment via init_point
        toast({ 
          title: "Finalize seu pagamento", 
          description: "Clique no botão para completar a assinatura." 
        });
        // Open init_point to complete payment
        setTimeout(() => {
          window.location.href = data.initPoint;
        }, 1500);
      } else {
        setError(data.message || "Pagamento não aprovado");
        setIsProcessing(false);
      }
    },
    onError: (err: Error) => {
      setError(translateMPError(err.message));
      setIsProcessing(false);
    }
  });

  // Mutation para criar pagamento PIX
  const createPixSubscription = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscriptions/create-pix-subscription", {
        subscriptionId,
        payerEmail: email,
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erro ao gerar PIX");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.status === "pending" && data.qrCode) {
        // PIX gerado com sucesso - mostrar QR Code
        setPixData({
          qrCode: data.qrCode,
          qrCodeBase64: data.qrCodeBase64,
          paymentId: data.paymentId,
          expirationDate: data.expirationDate,
          amount: data.amount,
        });
        setIsProcessing(false);
        
        // Iniciar polling para verificar pagamento
        startPixPolling(data.paymentId);
        
        toast({ 
          title: "PIX gerado!", 
          description: "Escaneie o QR Code ou copie o código para pagar." 
        });
      } else {
        setError(data.message || "Erro ao gerar PIX");
        setIsProcessing(false);
      }
    },
    onError: (err: Error) => {
      setError(err.message);
      setIsProcessing(false);
    }
  });

  // Função para verificar status do PIX
  const checkPixStatus = async (paymentId: string) => {
    try {
      const res = await apiRequest("GET", `/api/subscriptions/check-pix-status/${paymentId}`);
      const data = await res.json();
      
      if (data.status === "approved") {
        // Parar polling
        if (pixPollingRef.current) {
          clearInterval(pixPollingRef.current);
          pixPollingRef.current = null;
        }
        
        toast({ 
          title: "🎉 Pagamento PIX confirmado!", 
          description: "Sua assinatura foi ativada com sucesso!" 
        });
        
        setTimeout(() => setLocation("/dashboard"), 2000);
      } else if (data.status === "rejected" || data.status === "cancelled") {
        // Parar polling
        if (pixPollingRef.current) {
          clearInterval(pixPollingRef.current);
          pixPollingRef.current = null;
        }
        
        setError("Pagamento PIX não aprovado. Tente novamente.");
        setPixData(null);
      }
      // Se ainda pendente, continua polling
    } catch (error) {
      console.error("Erro ao verificar PIX:", error);
    }
  };

  // Iniciar polling do status do PIX
  const startPixPolling = (paymentId: string) => {
    // Verificar a cada 3 segundos
    pixPollingRef.current = setInterval(() => {
      checkPixStatus(paymentId);
    }, 3000);
    
    // Parar após 30 minutos (expiração do PIX)
    setTimeout(() => {
      if (pixPollingRef.current) {
        clearInterval(pixPollingRef.current);
        pixPollingRef.current = null;
      }
    }, 30 * 60 * 1000);
  };

  // Limpar polling ao desmontar
  useEffect(() => {
    return () => {
      if (pixPollingRef.current) {
        clearInterval(pixPollingRef.current);
      }
    };
  }, []);

  // Copiar código PIX
  const copyPixCode = () => {
    if (pixData?.qrCode) {
      navigator.clipboard.writeText(pixData.qrCode);
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 3000);
      toast({ title: "Código PIX copiado!", description: "Cole no app do seu banco." });
    }
  };

  // Handler para submit (cartão)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mpInstanceRef.current) {
      setError("Sistema de pagamento não inicializado. Recarregue a página.");
      return;
    }
    setIsProcessing(true);
    setError(null);

    try {
      const [expirationMonth, expirationYear] = expiryDate.split("/");
      console.log("Iniciando createCardToken...");
      const cardToken = await mpInstanceRef.current.createCardToken({
        cardNumber: cardNumber.replace(/\s/g, ""),
        cardholderName: cardHolder,
        cardExpirationMonth: expirationMonth,
        cardExpirationYear: "20" + expirationYear,
        securityCode: cvv,
        identificationType: docType,
        identificationNumber: docNumber.replace(/\D/g, ""),
      });
      console.log("cardToken result:", cardToken);
      
      // Verificar se o resultado contém erro (MP pode retornar erro no objeto)
      if (cardToken?.error || cardToken?.message) {
        const errorText = cardToken.error || cardToken.message || "Erro ao processar cartão";
        console.log("Erro no cardToken:", errorText);
        throw new Error(errorText);
      }
      
      if (!cardToken || !cardToken.id) {
        throw new Error("Não foi possível processar os dados do cartão. Verifique as informações.");
      }
      
      createSubscription.mutate(cardToken.id);
    } catch (err: any) {
      console.error("Erro token:", err);
      console.error("Erro message:", err?.message);
      console.error("Erro tipo:", typeof err);
      // Mensagens de erro detalhadas
      let errorMessage = "Verifique os dados do cartão.";
      
      // Captura qualquer forma do erro
      const errMsg = String(err?.message || err?.error || err?.errorMessage || String(err) || "").toLowerCase();
      console.error("errMsg:", errMsg);
      
      // Detectar erros de HTTPS/SSL (comum em localhost)
      if (errMsg.includes("card token") || 
          errMsg.includes("service not found") ||
          errMsg.includes("token service") ||
          errMsg.includes("secure") ||
          errMsg.includes("https") ||
          errMsg.includes("ssl") ||
          errMsg.includes("insecure")) {
        errorMessage = "⚠️ Pagamento seguro requer HTTPS. Em produção (Railway), o pagamento funcionará normalmente.";
      } else if (err?.cause?.[0]?.code) {
        const code = err.cause[0].code;
        if (code === "205" || code === "E205") errorMessage = "Número do cartão inválido.";
        else if (code === "208" || code === "E208") errorMessage = "Mês de validade inválido.";
        else if (code === "209" || code === "E209") errorMessage = "Ano de validade inválido.";
        else if (code === "212" || code === "E212") errorMessage = "Documento inválido.";
        else if (code === "214" || code === "E214") errorMessage = "Documento inválido.";
        else if (code === "220" || code === "E220") errorMessage = "Banco emissor não permitido.";
        else if (code === "221" || code === "E221") errorMessage = "Nome do titular inválido.";
        else if (code === "224" || code === "E224") errorMessage = "Código de segurança (CVV) inválido.";
        else if (code === "325") errorMessage = "Mês de validade inválido.";
        else if (code === "326") errorMessage = "Ano de validade inválido.";
      } else if (errMsg) {
        errorMessage = translateMPError(errMsg);
      }
      
      setError(errorMessage);
      setIsProcessing(false);
    }
  };

  if (subscriptionLoading) {
    return repairReactNodeText(
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!plan) return null;

  // Extrair valores do plano (campos do banco: nome, valor, valorPrimeiraCobranca)
  const planName = plan.nome || plan.name || "Plano";
  const planPrice = plan.valor || plan.price || "0";
  const setupFee = plan.valorPrimeiraCobranca ? parseFloat(plan.valorPrimeiraCobranca) : 0;
  const monthlyPrice = subscription?.couponPrice ? parseFloat(subscription.couponPrice) : parseFloat(planPrice);
  const hasDifferentFirstCharge = setupFee > 0 && setupFee !== monthlyPrice;
  const frequencyDays = plan.frequenciaDias || 30;
  const isAnnual = frequencyDays >= 360 || plan.tipo === "anual";
  const periodLabel = isAnnual ? "ano" : "mês";
  const isImplementationPlan = plan.tipo === "implementacao" || plan.tipo === "implementacao_mensal";
  const showSetupBreakdown = hasDifferentFirstCharge && isImplementationPlan;
  const showIntroductoryFirstCharge = hasDifferentFirstCharge && !isImplementationPlan;

  // Calcular valor total inicial (setup + primeiro mês ou apenas mensal)
  const totalInitial = hasDifferentFirstCharge ? setupFee : monthlyPrice;

  return repairReactNodeText(
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      
      {/* LADO ESQUERDO - DARK (Informações e Valor) */}
      <div className="w-full lg:w-[45%] bg-[#1a1a1a] text-white p-6 lg:p-12 flex flex-col justify-between relative overflow-hidden">
        {/* Background Pattern sutil */}
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute right-0 top-0 w-64 h-64 bg-primary/20 blur-[100px] rounded-full" />
          <div className="absolute left-0 bottom-0 w-64 h-64 bg-blue-500/20 blur-[100px] rounded-full" />
        </div>

        <div className="relative z-10">
          <div className="mb-8">
            <Button 
              variant="ghost" 
              className="text-gray-400 hover:text-white pl-0 -ml-2 mb-6"
              onClick={() => setLocation("/plans")}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para planos
            </Button>
            
            <h1 className="text-2xl lg:text-3xl font-bold mb-2">
              {showSetupBreakdown ? (
                <>
                  Implementação + Plano por{" "}
                  <span className="text-primary">R$ {totalInitial.toFixed(2).replace(".", ",")}</span>
                </>
              ) : (
                <>
                  Volte aos negócios por{" "}
                  <span className="text-primary">R$ {monthlyPrice.toFixed(2).replace(".", ",")}</span>
                </>
              )}
            </h1>
            <p className="text-gray-400 text-sm lg:text-base">
              Desbloqueie todo o potencial da sua operação com o plano {planName}.
            </p>
          </div>

          <div className="space-y-6">
            {showSetupBreakdown && (
              <div className="flex items-start gap-3">
                <div className="mt-1 bg-yellow-500/20 p-1 rounded-full">
                  <Check className="w-4 h-4 text-yellow-400" />
                </div>
                <div>
                  <p className="font-medium">Hoje: R$ {setupFee.toFixed(2).replace(".", ",")} (Implementação)</p>
                  <p className="text-sm text-gray-400">Configuração completa do seu agente + suporte VIP.</p>
                </div>
              </div>
            )}

            {showIntroductoryFirstCharge && (
              <div className="flex items-start gap-3">
                <div className="mt-1 bg-yellow-500/20 p-1 rounded-full">
                  <Check className="w-4 h-4 text-yellow-400" />
                </div>
                <div>
                  <p className="font-medium">Hoje: R$ {setupFee.toFixed(2).replace(".", ",")} (1ª cobrança promocional)</p>
                  <p className="text-sm text-gray-400">Na próxima cobrança o plano volta para o valor cheio.</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <div className="mt-1 bg-primary/20 p-1 rounded-full">
                <Check className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Ativação Imediata</p>
                <p className="text-sm text-gray-400">Comece a usar todas as ferramentas agora mesmo.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 bg-primary/20 p-1 rounded-full">
                <Check className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">
                  {hasDifferentFirstCharge 
                    ? `Depois: R$ ${monthlyPrice.toFixed(2).replace(".", ",")}/${periodLabel}` 
                    : `Hoje: R$ ${monthlyPrice.toFixed(2).replace(".", ",")}/${periodLabel}`}
                </p>
                <p className="text-sm text-gray-400">Preço fixo, sem surpresas na fatura.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 bg-primary/20 p-1 rounded-full">
                <Check className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Sempre: Sem fidelidade</p>
                <p className="text-sm text-gray-400">Cancele quando quiser, sem multas ou taxas.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-8 lg:mt-0 pt-8 border-t border-white/10">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Shield className="w-4 h-4" />
            <span>{pixManualEnabled ? "Pagamento 100% seguro via PIX" : "Pagamento 100% seguro via Mercado Pago"}</span>
          </div>
        </div>
      </div>

      {/* LADO DIREITO - LIGHT (Formulário) */}
      <div className="w-full lg:w-[55%] bg-white p-6 lg:p-12 flex flex-col justify-center">
        <div className="max-w-md mx-auto w-full">
          
          {/* Seleção de método de pagamento */}
          <div className="mb-6 space-y-3">
            {/* Opção Cartão */}
            {!pixManualEnabled && (
              <div 
                className={cn(
                  "border rounded-lg p-4 flex items-center justify-between cursor-pointer transition-all",
                  paymentMethod === "card" 
                    ? "border-primary ring-1 ring-primary/20 bg-gray-50" 
                    : "border-gray-200 hover:border-gray-300"
                )}
                onClick={() => { setPaymentMethod("card"); setPixData(null); setError(null); }}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2",
                    paymentMethod === "card" ? "border-[5px] border-primary" : "border-gray-300"
                  )} />
                  <CreditCard className="w-5 h-5 text-gray-600" />
                  <span className="font-medium text-gray-900">Cartão de crédito</span>
                </div>
                <div className="flex gap-1">
                  <img src="https://img.icons8.com/color/48/visa.png" alt="Visa" className="h-5" />
                  <img src="https://img.icons8.com/color/48/mastercard.png" alt="Master" className="h-5" />
                  <img src="https://img.icons8.com/color/48/amex.png" alt="Amex" className="h-5" />
                </div>
              </div>
            )}

            {/* Opção PIX */}
            <div 
              className={cn(
                "border rounded-lg p-4 flex items-center justify-between cursor-pointer transition-all",
                paymentMethod === "pix" 
                  ? "border-green-500 ring-1 ring-green-500/20 bg-green-50" 
                  : "border-gray-200 hover:border-gray-300"
              )}
              onClick={() => { setPaymentMethod("pix"); setError(null); }}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-5 h-5 rounded-full border-2",
                  paymentMethod === "pix" ? "border-[5px] border-green-500" : "border-gray-300"
                )} />
                <QrCode className="w-5 h-5 text-green-600" />
                <span className="font-medium text-gray-900">PIX</span>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  {pixManualEnabled ? "Manual" : "Aprovação imediata"}
                </span>
              </div>
              <img 
                src="https://upload.wikimedia.org/wikipedia/commons/a/a2/Logo%E2%80%94pix_powered_by_Banco_Central_%28Brazil%2C_2020%29.svg" 
                alt="PIX" 
                className="h-6" 
              />
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* FORMULÁRIO DE PAGAMENTO - CARTÃO */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {paymentMethod === "card" && (
            <form onSubmit={handleSubmit} className="space-y-5">
              
              <div className="relative">
                <Input
                  placeholder="Número do cartão"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  maxLength={19}
                  className="h-12 pl-10 bg-white border-gray-300 focus:border-primary focus:ring-primary"
                  required
                />
                <CreditCard className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
                <div className="absolute right-3 top-3.5">
                  {cardBrand && <span className="text-xs font-bold uppercase text-gray-500">{cardBrand}</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  placeholder="Validade (MM/AA)"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(formatExpiryDate(e.target.value))}
                  maxLength={5}
                  className="h-12 bg-white border-gray-300 focus:border-primary focus:ring-primary"
                  required
                />
                <div className="relative">
                  <Input
                    placeholder="CVV"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    maxLength={4}
                    className="h-12 bg-white border-gray-300 focus:border-primary focus:ring-primary"
                    required
                  />
                  <Lock className="absolute right-3 top-3.5 h-4 w-4 text-gray-400" />
                </div>
              </div>

              <Input
                placeholder="Nome impresso no cartão"
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                className="h-12 bg-white border-gray-300 focus:border-primary focus:ring-primary"
                required
              />

              <div className="grid grid-cols-3 gap-4">
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="col-span-1 h-12 rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-primary focus:ring-primary"
                >
                  <option value="CPF">CPF</option>
                  <option value="CNPJ">CNPJ</option>
                </select>
                <Input
                  placeholder="Número do documento"
                  value={docNumber}
                  onChange={(e) => setDocNumber(formatDoc(e.target.value))}
                  className="col-span-2 h-12 bg-white border-gray-300 focus:border-primary focus:ring-primary"
                  required
                />
              </div>

              <Input
                type="email"
                placeholder="Seu melhor e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 bg-white border-gray-300 focus:border-primary focus:ring-primary"
                required
              />

              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full h-14 text-lg font-bold bg-black hover:bg-gray-800 text-white shadow-lg transition-all mt-4"
                disabled={isProcessing || !mpReady}
              >
                {isProcessing ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : hasDifferentFirstCharge ? (
                  `Pagar R$ ${totalInitial.toFixed(2).replace(".", ",")}`
                ) : (
                  `Assinar por R$ ${monthlyPrice.toFixed(2).replace(".", ",")}/${periodLabel}`
                )}
              </Button>

              <p className="text-xs text-center text-gray-500 mt-4">
                {showSetupBreakdown ? (
                  <>
                    Hoje você paga R$ {setupFee.toFixed(2).replace(".", ",")} (implementação). 
                    A partir de {new Date(new Date().setDate(new Date().getDate() + frequencyDays)).toLocaleDateString('pt-BR')}, 
                    será cobrado R$ {monthlyPrice.toFixed(2).replace(".", ",")}/{periodLabel} automaticamente. Cancele a qualquer momento.
                  </>
                ) : showIntroductoryFirstCharge ? (
                  <>
                    Hoje você paga R$ {setupFee.toFixed(2).replace(".", ",")} na 1ª cobrança promocional.
                    {" "}A partir de {new Date(new Date().setDate(new Date().getDate() + frequencyDays)).toLocaleDateString('pt-BR')},
                    {" "}o plano renova por R$ {monthlyPrice.toFixed(2).replace(".", ",")}/{periodLabel}. Cancele a qualquer momento.
                  </>
                ) : (
                  <>
                    Renova automaticamente em {new Date(new Date().setDate(new Date().getDate() + frequencyDays)).toLocaleDateString('pt-BR')} 
                    {" "}no plano {planName} por R$ {monthlyPrice.toFixed(2).replace(".", ",")}/{periodLabel}. Cancele a qualquer momento.
                  </>
                )}
              </p>

            </form>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* FORMULÁRIO DE PAGAMENTO - PIX */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {paymentMethod === "pix" && !pixData && (
            <div className="space-y-5">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <QrCode className="w-6 h-6 text-green-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-green-800">Pagamento via PIX</h3>
                    <p className="text-sm text-green-700 mt-1">
                      {pixManualEnabled
                        ? "Depois do pagamento, envie o comprovante. A assinatura so e liberada apos a aprovacao."
                        : "Pague instantaneamente com PIX e a assinatura sera ativada assim que o pagamento for confirmado."}
                    </p>
                  </div>
                </div>
              </div>

              <Input
                type="email"
                placeholder="Seu e-mail para confirmação"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 bg-white border-gray-300 focus:border-green-500 focus:ring-green-500"
                required
              />

              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <Button 
                type="button"
                onClick={() => {
                  if (!email) {
                    setError("Por favor, informe seu e-mail");
                    return;
                  }
                  setIsProcessing(true);
                  setError(null);
                  createPixSubscription.mutate();
                }}
                className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700 text-white shadow-lg transition-all"
                disabled={isProcessing || !email}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Gerando PIX...
                  </>
                ) : (
                  <>
                    <QrCode className="mr-2 h-5 w-5" />
                    Gerar PIX de R$ {totalInitial.toFixed(2).replace(".", ",")}
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-gray-500 mt-4">
                O PIX será gerado e você terá 30 minutos para efetuar o pagamento. 
                Após a confirmação, sua assinatura será ativada automaticamente.
              </p>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* QR CODE PIX GERADO */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {paymentMethod === "pix" && pixData && (
            <div className="space-y-5">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <h3 className="font-semibold text-green-800">PIX gerado com sucesso!</h3>
                </div>
                <p className="text-sm text-green-700">
                  Escaneie o QR Code ou copie o código Pix Copia e Cola.
                </p>
              </div>

              {/* QR Code */}
              <div className="flex flex-col items-center py-4">
                <div className="bg-white p-4 rounded-lg shadow-md border">
                  {pixData.qrCodeBase64 ? (
                    <img 
                      src={pixData.qrCodeBase64.startsWith('data:') ? pixData.qrCodeBase64 : `data:image/png;base64,${pixData.qrCodeBase64}`} 
                      alt="QR Code PIX" 
                      className="w-48 h-48"
                    />
                  ) : (
                    <div className="w-48 h-48 bg-gray-100 flex items-center justify-center">
                      <QrCode className="w-16 h-16 text-gray-400" />
                    </div>
                  )}
                </div>
                
                <div className="mt-4 text-center">
                  <p className="text-2xl font-bold text-green-600">
                    R$ {pixData.amount.toFixed(2).replace(".", ",")}
                  </p>
                </div>
              </div>

              {/* Código Pix Copia e Cola */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Pix Copia e Cola:</label>
                <div className="relative">
                  <textarea
                    readOnly
                    value={pixData.qrCode}
                    className="w-full h-20 p-3 pr-12 text-xs bg-gray-50 border border-gray-300 rounded-lg resize-none font-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-2"
                    onClick={copyPixCode}
                  >
                    {pixCopied ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5 text-gray-500" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Status de verificação */}
              <div className="flex items-center justify-center gap-2 py-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <Clock className="w-4 h-4 text-yellow-600 animate-pulse" />
                <span className="text-sm text-yellow-700">Aguardando pagamento...</span>
              </div>

              {/* Expiração */}
              <p className="text-xs text-center text-gray-500">
                Este PIX expira em 30 minutos. Após o pagamento, sua assinatura será ativada automaticamente.
              </p>

              {/* Botão para gerar novo PIX */}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setPixData(null);
                  if (pixPollingRef.current) {
                    clearInterval(pixPollingRef.current);
                    pixPollingRef.current = null;
                  }
                }}
              >
                Gerar novo PIX
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
