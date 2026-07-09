/**
 * Reseller Dashboard - Painel do Revendedor White-Label
 * 
 * Esta página é acessada por usuários que possuem o plano de revenda.
 * Funcionalidades:
 * - Dashboard com métricas
 * - Criação e gerenciamento de clientes
 * - Detalhes completos do cliente (pagamentos, status, conexão)
 * - Reset de senha de clientes
 * - Marcar pagamentos como pagos manualmente
 * - Histórico de pagamentos
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute, Link } from "wouter";
import QRCode from "qrcode";
import { 
  Loader2, 
  Plus, 
  Users, 
  DollarSign, 
  Building2, 
  Settings, 
  Palette, 
  Globe, 
  RefreshCw, 
  Check, 
  X, 
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  Pause,
  Play,
  Trash2,
  CreditCard,
  TrendingUp,
  AlertCircle,
  Wifi,
  WifiOff,
  Key,
  FileText,
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  ArrowLeft,
  Receipt,
  AlertTriangle,
  QrCode,
  Upload,
  FileImage,
  Gift
} from "lucide-react";

interface ResellerProfile {
  id: string;
  userId: string;
  companyName: string;
  companyDescription?: string;
  logoUrl?: string;
  subdomain?: string;
  customDomain?: string;
  domainVerified?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  clientMonthlyPrice?: string;
  clientSetupFee?: string;
  costPerClient?: string;
  maxClients?: number;
  supportEmail?: string;
  supportPhone?: string;
  welcomeMessage?: string;
  isActive?: boolean;
  createdAt?: string;
  // Campos PIX
  pixKey?: string;
  pixKeyType?: string; // cpf, cnpj, email, phone, random
  // Ciclo de cobrança
  billingDay?: number;
  nextPaymentDate?: string;
  resellerStatus?: string;
}

interface ResellerClient {
  id: string;
  userId: string;
  status: string;
  monthlyCost?: string;
  clientPrice?: string;
  isFreeClient?: boolean;
  activatedAt?: string;
  suspendedAt?: string;
  cancelledAt?: string;
  createdAt?: string;
  nextPaymentDate?: string;
  billingDay?: number;
  user?: {
    name: string;
    email: string;
    phone?: string;
  };
}

interface ClientDetails {
  client: {
    id: string;
    status: string;
    activatedAt: string;
    saasPaidUntil: string;
    isFreeClient: boolean;
    createdAt: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  } | null;
  connection: {
    id: string;
    isConnected: boolean;
    phoneNumber?: string;
  } | null;
  subscriptionView: {
    status: string;
    daysRemaining: number;
    nextPaymentDate: string;
    dataInicio: string;
    dataFim: string;
    needsPayment: boolean;
    isOverdue: boolean;
  };
  plan: {
    nome: string;
    valor: string;
    descricao: string;
  };
  paymentHistory: {
    id: string;
    amount: string;
    paidAt: string;
    createdAt: string;
    referenceMonth: string;
    paymentMethod: string;
    status: string;
    description: string;
  }[];
  stats: {
    totalPaid: number;
    totalPayments: number;
    approvedPayments: number;
    monthsInSystem: number;
    totalConversations: number;
  };
  reseller: {
    companyName: string;
    pixKey?: string;
    pixKeyType?: string;
    pixHolderName?: string;
    pixBankName?: string;
    supportPhone?: string;
    supportEmail?: string;
  };
}

interface DashboardMetrics {
  totalClients: number;
  activeClients: number;
  suspendedClients: number;
  cancelledClients: number;
  totalRevenue: number;
  monthlyRevenue: number;
  monthlyCost: number;
  monthlyProfit: number;
}

interface Payment {
  id: string;
  amount: string;
  status: string;
  paymentType: string;
  paymentMethod?: string;
  description?: string;
  referenceMonth?: string;
  dueDate?: string;
  createdAt: string;
  paidAt?: string;
}

// Interface para fatura pendente
interface PendingInvoice {
  referenceMonth: string;
  dueDate: Date;
  amount: number;
  status: 'pending' | 'overdue' | 'upcoming';
  daysUntilDue: number;
}

// Interface para assinatura do revendedor (o que ele paga ao sistema)
interface ResellerSubscription {
  activeClients: number;
  costPerClient: number;
  totalMonthly: number;
  billingDay: number;
  currentInvoice: {
    id: number;
    referenceMonth: string;
    dueDate: string;
    activeClients: number;
    unitPrice: string;
    totalAmount: string;
    status: string;
  } | null;
  pendingInvoices: {
    id: number;
    referenceMonth: string;
    dueDate: string;
    activeClients: number;
    totalAmount: string;
    status: string;
  }[];
  resellerStatus: string;
  daysPastDue: number;
}

// Interface para fatura do revendedor
interface ResellerInvoice {
  id: number;
  resellerId: string;
  referenceMonth: string;
  dueDate: string;
  activeClients: number;
  unitPrice: string;
  totalAmount: string;
  status: string;
  paymentMethod?: string;
  mpPaymentId?: string;
  paidAt?: string;
  createdAt: string;
}

export default function ResellerDashboard() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  
  // Rotas para navegação via URL
  const [, clientParams] = useRoute("/revenda/clientes/:clientId");
  const clientIdFromUrl = clientParams?.clientId;
  
  // Mapear URL para aba ativa
  const getTabFromUrl = () => {
    if (location === "/revenda/clientes" || location.startsWith("/revenda/clientes/")) return "clients";
    if (location === "/revenda/cobrancas") return "payments"; // Cobranças = pagamentos dos clientes para mim
    if (location === "/revenda/faturas") return "my-subscription"; // Minhas Faturas = o que eu pago ao sistema
    if (location === "/revenda/configuracoes") return "settings";
    return "dashboard";
  };
  
  const [activeTab, setActiveTab] = useState(getTabFromUrl());
  
  // Sincronizar aba com URL quando mudar
  useEffect(() => {
    const tab = getTabFromUrl();
    if (tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [location]);
  
  // Navegar para URL correspondente quando mudar aba
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    switch (tab) {
      case "clients":
        setLocation("/revenda/clientes");
        break;
      case "payments":
        setLocation("/revenda/cobrancas"); // Cobranças dos clientes
        break;
      case "my-subscription":
        setLocation("/revenda/faturas"); // Minhas faturas ao sistema
        break;
      case "settings":
        setLocation("/revenda/configuracoes");
        break;
      default:
        setLocation("/revenda");
    }
  };
  
  // Estados para o formulário de perfil
  const [companyName, setCompanyName] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#000000");
  const [secondaryColor, setSecondaryColor] = useState("#ffffff");
  const [accentColor, setAccentColor] = useState("#22c55e");
  const [clientMonthlyPrice, setClientMonthlyPrice] = useState("99.99");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  
  // Estados para criar cliente
  const [isCreateClientOpen, setIsCreateClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientPassword, setNewClientPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newClientPrice, setNewClientPrice] = useState("99.99");
  const [createAsFree, setCreateAsFree] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credit_card">("pix");
  
  // Estados para checkout
  const [checkoutStep, setCheckoutStep] = useState<"form" | "payment" | "success">("form");
  const [pixCode, setPixCode] = useState("");
  const [pixQrCode, setPixQrCode] = useState("");
  const [pendingPaymentId, setPendingPaymentId] = useState("");
  const [checkingPayment, setCheckingPayment] = useState(false);
  
  // Estados para pagamento com cartão
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [docType, setDocType] = useState("CPF");
  const [docNumber, setDocNumber] = useState("");
  const [cardBrand, setCardBrand] = useState<string | null>(null);
  const [mpReady, setMpReady] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [isProcessingCard, setIsProcessingCard] = useState(false);
  const mpInstanceRef = useRef<any>(null);

  // Estados para detalhes do cliente - sincronizado com URL
  const selectedClientId = clientIdFromUrl || null;
  // Dialog só abre quando tem clientId MAS não está na rota de detalhes
  const isClientDetailsOpen = !!clientIdFromUrl && !location.startsWith("/revenda/clientes/");
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [newPasswordForReset, setNewPasswordForReset] = useState("");
  const [selectedClientForReset, setSelectedClientForReset] = useState<string | null>(null);
  
  // Estados para pagamento baseado em fatura mensal
  const [selectedInvoice, setSelectedInvoice] = useState<PendingInvoice | null>(null);
  const [isMarkPaidOpen, setIsMarkPaidOpen] = useState(false);
  const [markPaidAmount, setMarkPaidAmount] = useState("");
  const [markPaidDescription, setMarkPaidDescription] = useState("");

  // Estados para checkout granular (pagamento de múltiplos clientes)
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [isGranularCheckoutOpen, setIsGranularCheckoutOpen] = useState(false);
  const [granularPixCode, setGranularPixCode] = useState("");
  const [granularPixQrCode, setGranularPixQrCode] = useState("");
  const [granularTotalAmount, setGranularTotalAmount] = useState(0);
  const [isCreatingGranularInvoice, setIsCreatingGranularInvoice] = useState(false);

  // Estados para upload de comprovante PIX ("Já paguei") — checkout de novo cliente
  const [showReceiptUploadModal, setShowReceiptUploadModal] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [receiptUploadSuccess, setReceiptUploadSuccess] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // ========== Estados para "Minhas Faturas" (pagamento do revendedor ao SaaS) ==========
  const [myInvoicePixData, setMyInvoicePixData] = useState<{
    paymentId: string | number;
    qrCode: string;
    qrCodeBase64: string;
    amount: number;
    referenceMonth: string;
    expirationDate?: string;
  } | null>(null);
  const [selectedMyInvoiceId, setSelectedMyInvoiceId] = useState<number | null>(null);
  const [isMyInvoicePixOpen, setIsMyInvoicePixOpen] = useState(false);
  const [isGeneratingMyInvoicePix, setIsGeneratingMyInvoicePix] = useState(false);
  const [isCheckingMyInvoicePayment, setIsCheckingMyInvoicePayment] = useState(false);
  const [showMyInvoiceReceiptModal, setShowMyInvoiceReceiptModal] = useState(false);
  const [myInvoiceReceiptFile, setMyInvoiceReceiptFile] = useState<File | null>(null);
  const [isUploadingMyInvoiceReceipt, setIsUploadingMyInvoiceReceipt] = useState(false);
  const [myInvoiceReceiptSuccess, setMyInvoiceReceiptSuccess] = useState(false);
  const myInvoiceReceiptInputRef = useRef<HTMLInputElement>(null);

  // Gerar QR Code quando o código PIX mudar
  useEffect(() => {
    if (granularPixCode) {
      QRCode.toDataURL(granularPixCode, { errorCorrectionLevel: 'M', width: 256 })
        .then(url => setGranularPixQrCode(url))
        .catch(err => console.error('Erro ao gerar QR Code:', err));
    }
  }, [granularPixCode]);

  // Verificar status de revendedor
  const { data: resellerStatus, isLoading: isLoadingStatus } = useQuery<{
    hasResellerPlan: boolean;
    reseller: ResellerProfile | null;
  }>({
    queryKey: ["/api/reseller/status"],
  });

  // Buscar perfil do revendedor
  const { data: profile, isLoading: isLoadingProfile, refetch: refetchProfile } = useQuery<ResellerProfile>({
    queryKey: ["/api/reseller/profile"],
    enabled: !!resellerStatus?.hasResellerPlan,
  });

  // Verificar se tem slot de cliente gratuito disponível
  const { data: freeClientData, refetch: refetchFreeClient } = useQuery<{
    available: boolean;
    used: number;
    limit: number;
  }>({
    queryKey: ["/api/reseller/free-client-available"],
    enabled: !!resellerStatus?.hasResellerPlan,
  });

  // Buscar clientes
  const { data: clients, isLoading: isLoadingClients, refetch: refetchClients } = useQuery<ResellerClient[]>({
    queryKey: ["/api/reseller/clients"],
    enabled: !!resellerStatus?.hasResellerPlan,
  });

  // Buscar métricas
  const { data: metrics, isLoading: isLoadingMetrics } = useQuery<DashboardMetrics>({
    queryKey: ["/api/reseller/dashboard"],
    enabled: !!resellerStatus?.hasResellerPlan,
  });

  // Buscar histórico de pagamentos
  const { data: payments, isLoading: isLoadingPayments } = useQuery<Payment[]>({
    queryKey: ["/api/reseller/payments"],
    enabled: !!resellerStatus?.hasResellerPlan,
  });

  // ====== MINHAS FATURAS: Assinatura do revendedor ao SaaS ======
  // Buscar dados da assinatura do revendedor (fatura mensal que ele paga ao sistema)
  const { data: mySubscription, isLoading: isLoadingMySubscription, refetch: refetchMySubscription } = useQuery<{
    activeClients: number;
    costPerClient: number;
    totalMonthly: number;
    billingDay: number;
    currentInvoice: { id: number; referenceMonth: string; dueDate: string; activeClients: number; totalAmount: string; status: string } | null;
    pendingInvoices: { id: number; referenceMonth: string; dueDate: string; activeClients: number; totalAmount: string; status: string }[];
    resellerStatus: string;
    daysPastDue: number;
  }>({
    queryKey: ["/api/reseller/my-subscription"],
    enabled: !!resellerStatus?.hasResellerPlan,
  });

  // Buscar histórico de faturas do revendedor
  const { data: myInvoices, isLoading: isLoadingMyInvoices, refetch: refetchMyInvoices } = useQuery<Array<{
    id: number;
    referenceMonth: string;
    dueDate: string;
    paidAt?: string;
    status: string;
    totalAmount: string;
    activeClients?: number;
    paymentMethod?: string;
  }>>({
    queryKey: ["/api/reseller/my-invoices"],
    enabled: !!resellerStatus?.hasResellerPlan,
  });

  // Gerar PIX para pagar a fatura mensal do revendedor ao SaaS
  const generateMyInvoicePix = async (invoiceId: number) => {
    setIsGeneratingMyInvoicePix(true);
    try {
      const response = await apiRequest("POST", `/api/reseller/my-invoices/${invoiceId}/pay-pix`);
      const data = await response.json();
      if (data.qrCode) {
        setMyInvoicePixData({
          paymentId: data.paymentId,
          qrCode: data.qrCode,
          qrCodeBase64: data.qrCodeBase64,
          amount: data.amount,
          referenceMonth: data.referenceMonth,
          expirationDate: data.expirationDate,
        });
        setSelectedMyInvoiceId(invoiceId);
        setIsMyInvoicePixOpen(true);
      } else {
        toast({ title: "Erro ao gerar PIX", description: data.message || "Tente novamente", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Erro ao gerar PIX", description: error.message || "Tente novamente mais tarde", variant: "destructive" });
    } finally {
      setIsGeneratingMyInvoicePix(false);
    }
  };

  // Verificar status do pagamento da fatura do revendedor
  const checkMyInvoicePayment = async (invoiceId: number) => {
    setIsCheckingMyInvoicePayment(true);
    try {
      const response = await apiRequest("GET", `/api/reseller/my-invoices/${invoiceId}/check-payment`);
      const data = await response.json();
      if (data.status === 'paid') {
        toast({ title: "✅ Pagamento confirmado!", description: "Sua fatura foi paga com sucesso." });
        setIsMyInvoicePixOpen(false);
        setMyInvoicePixData(null);
        setSelectedMyInvoiceId(null);
        refetchMySubscription();
        refetchMyInvoices();
      } else {
        toast({ title: "Pagamento ainda não confirmado", description: "Continue aguardando ou tente novamente em alguns segundos." });
      }
    } catch (error: any) {
      toast({ title: "Erro ao verificar pagamento", description: error.message, variant: "destructive" });
    } finally {
      setIsCheckingMyInvoicePayment(false);
    }
  };

  // Upload de comprovante para fatura do próprio revendedor ao SaaS
  const uploadMyInvoiceReceiptMutation = useMutation({
    mutationFn: async ({ file, paymentId, amount }: { file: File; paymentId: string; amount: number }) => {
      const formData = new FormData();
      formData.append("receipt", file);
      formData.append("paymentId", paymentId);
      formData.append("amount", amount.toString());
      formData.append("contextKind", "reseller_invoice");
      if (selectedMyInvoiceId !== null) {
        formData.append("invoiceId", String(selectedMyInvoiceId));
      }
      const response = await fetch("/api/reseller/payment-receipts/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao enviar comprovante");
      }
      return response.json();
    },
    onSuccess: () => {
      setMyInvoiceReceiptSuccess(true);
      toast({ title: "✅ Comprovante enviado!", description: "Aguarde a confirmação do admin." });
      setTimeout(() => {
        setShowMyInvoiceReceiptModal(false);
        setMyInvoiceReceiptFile(null);
        setMyInvoiceReceiptSuccess(false);
        setIsMyInvoicePixOpen(false);
        setMyInvoicePixData(null);
      }, 2000);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao enviar comprovante", description: error.message || "Tente novamente", variant: "destructive" });
    },
  });

  const handleMyInvoiceReceiptUpload = async () => {
    if (!myInvoiceReceiptFile) return;
    const paymentId = myInvoicePixData?.paymentId ? String(myInvoicePixData.paymentId) : `invoice_${selectedMyInvoiceId}_${Date.now()}`;
    const amount = myInvoicePixData?.amount || mySubscription?.totalMonthly || 0;
    setIsUploadingMyInvoiceReceipt(true);
    try {
      await uploadMyInvoiceReceiptMutation.mutateAsync({ file: myInvoiceReceiptFile, paymentId, amount });
    } finally {
      setIsUploadingMyInvoiceReceipt(false);
    }
  };

  // Buscar detalhes do cliente selecionado
  const { data: clientDetails, isLoading: isLoadingClientDetails, refetch: refetchClientDetails } = useQuery<ClientDetails>({
    queryKey: ["/api/reseller/clients", selectedClientId, "details"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reseller/clients/${selectedClientId}/details`);
      return res.json();
    },
    enabled: !!selectedClientId && isClientDetailsOpen,
  });

  // Buscar chave pública MercadoPago para pagamento com cartão
  const { data: mpConfig } = useQuery({
    queryKey: ["mp-public-key"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/mercadopago/public-key");
      return res.json();
    },
    enabled: !!resellerStatus?.hasResellerPlan,
  });

  // Inicializar MercadoPago SDK
  useEffect(() => {
    if (!mpConfig?.publicKey) return;
    
    const initMP = () => {
      if ((window as any).MercadoPago && mpConfig.publicKey) {
        try {
          mpInstanceRef.current = new (window as any).MercadoPago(mpConfig.publicKey, { locale: 'pt-BR' });
          setMpReady(true);
        } catch (err) {
          console.error("Erro ao inicializar MercadoPago:", err);
        }
      }
    };
    
    if ((window as any).MercadoPago) {
      initMP();
    } else {
      const script = document.createElement("script");
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.async = true;
      script.onload = initMP;
      document.body.appendChild(script);
    }
  }, [mpConfig]);

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

  // Atualizar formulário quando perfil carrega
  useEffect(() => {
    if (profile) {
      setCompanyName(profile.companyName || "");
      setCompanyDescription(profile.companyDescription || "");
      setSubdomain(profile.subdomain || "");
      setPrimaryColor(profile.primaryColor || "#000000");
      setSecondaryColor(profile.secondaryColor || "#ffffff");
      setAccentColor(profile.accentColor || "#22c55e");
      setClientMonthlyPrice(profile.clientMonthlyPrice || "99.99");
      setSupportEmail(profile.supportEmail || "");
      setSupportPhone(profile.supportPhone || "");
      setWelcomeMessage(profile.welcomeMessage || "");
    }
  }, [profile]);

  // Mutation para salvar/criar perfil
  const saveProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      const method = profile ? "PUT" : "POST";
      const response = await apiRequest(method, "/api/reseller/profile", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/profile"] });
      toast({ title: "Perfil salvo com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar perfil", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para atualizar campos específicos do revendedor (inline updates)
  const updateResellerMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PUT", "/api/reseller/profile", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/profile"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para criar cliente gratuito
  const createFreeClientMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/reseller/clients/free", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/free-client-available"] });
      setCheckoutStep("success");
      toast({ title: "Cliente gratuito criado com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar cliente", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para checkout (PIX ou Cartão)
  const checkoutMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/reseller/clients/checkout", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.pixCode && data.pixQrCode) {
        // Pagamento PIX
        setPixCode(data.pixCode);
        setPixQrCode(data.pixQrCode);
        setPendingPaymentId(data.paymentId);
        setCheckoutStep("payment");
      } else if (data.paymentUrl) {
        // Pagamento Cartão - redireciona para checkout
        window.open(data.paymentUrl, '_blank');
        setCheckoutStep("payment");
        setPendingPaymentId(data.paymentId);
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro no checkout", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para confirmar pagamento PIX
  const confirmPixMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const response = await apiRequest("POST", `/api/reseller/payments/${paymentId}/confirm`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
        setCheckoutStep("success");
        toast({ title: "Pagamento confirmado! Cliente criado com sucesso." });
      } else {
        toast({ title: "Pagamento pendente", description: "Aguardando confirmação do pagamento." });
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao verificar pagamento", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para criar fatura granular (múltiplos clientes)
  const createGranularInvoiceMutation = useMutation({
    mutationFn: async (clientIds: string[]) => {
      const response = await apiRequest("POST", "/api/reseller/invoices/custom", { clientIds });
      return response.json();
    },
    onSuccess: (data) => {
      setGranularPixCode(data.qrCode || ""); // O qrCode do MP é o código PIX string
      setGranularTotalAmount(data.totalAmount);
      setIsGranularCheckoutOpen(true);
      setIsCreatingGranularInvoice(false);
      toast({ 
        title: "Fatura criada!", 
        description: `Total: R$ ${data.totalAmount.toFixed(2)} - ${data.clientCount || selectedClientIds.length} cliente(s)` 
      });
    },
    onError: (error: any) => {
      setIsCreatingGranularInvoice(false);
      toast({ title: "Erro ao criar fatura", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para criar cliente (legado - para compatibilidade)
  const createClientMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/reseller/clients", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
      setIsCreateClientOpen(false);
      resetCreateClientForm();
      
      if (data.paymentUrl) {
        toast({ 
          title: "Cliente criado!", 
          description: "Você será redirecionado para o pagamento." 
        });
        setTimeout(() => {
          window.open(data.paymentUrl, '_blank');
        }, 1000);
      } else {
        toast({ title: "Cliente criado com sucesso!" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar cliente", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para suspender cliente
  const suspendClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/suspend`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
      toast({ title: "Cliente suspenso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao suspender", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para reativar cliente
  const reactivateClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/reactivate`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
      toast({ title: "Cliente reativado" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao reativar", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para cancelar cliente
  const cancelClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
      toast({ title: "Cliente cancelado" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para resetar senha do cliente
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ clientId, newPassword }: { clientId: string; newPassword?: string }) => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/reset-password`, {
        newPassword,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "✅ Senha resetada!",
        description: `Nova senha: ${data.newPassword}`,
      });
      setIsResetPasswordOpen(false);
      setNewPasswordForReset("");
      setSelectedClientForReset(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao resetar senha", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para confirmar pagamento de fatura mensal
  const markAsPaidMutation = useMutation({
    mutationFn: async ({ clientId, amount, description, referenceMonth, dueDate }: { 
      clientId: string; 
      amount?: string; 
      description?: string;
      referenceMonth?: string;
      dueDate?: string;
    }) => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/mark-paid`, {
        amount,
        description,
        paymentMethod: 'manual',
        referenceMonth,
        dueDate,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients", selectedClientId, "details"] });
      toast({ 
        title: "✅ Pagamento confirmado!",
        description: `Fatura de R$ ${data.payment.amount} confirmada com sucesso.`,
      });
      setIsMarkPaidOpen(false);
      setMarkPaidAmount("");
      setMarkPaidDescription("");
      setSelectedInvoice(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao confirmar pagamento", description: error.message, variant: "destructive" });
    },
  });

  // Upload de comprovante PIX ("Já paguei")
  const uploadReceiptMutation = useMutation({
    mutationFn: async ({ file, paymentId, amount }: { file: File; paymentId: string; amount: number }) => {
      const formData = new FormData();
      formData.append("receipt", file);
      formData.append("paymentId", paymentId);
      formData.append("amount", amount.toString());
      formData.append("contextKind", "client_creation");

      const response = await fetch("/api/reseller/payment-receipts/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao enviar comprovante");
      }
      return response.json();
    },
    onSuccess: () => {
      setReceiptUploadSuccess(true);
      toast({ 
        title: "✅ Comprovante enviado!", 
        description: "Seu pagamento será confirmado em breve." 
      });
      setTimeout(() => {
        setShowReceiptUploadModal(false);
        setReceiptFile(null);
        setReceiptUploadSuccess(false);
      }, 2000);
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao enviar comprovante", 
        description: error.message || "Tente novamente mais tarde.", 
        variant: "destructive" 
      });
    },
  });

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validar tipo de arquivo (imagens e PDF)
      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
      if (!validTypes.includes(file.type)) {
        toast({ 
          title: "Formato inválido", 
          description: "Envie uma imagem (JPG, PNG, GIF, WebP) ou PDF.", 
          variant: "destructive" 
        });
        return;
      }
      // Validar tamanho (máximo 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({ 
          title: "Arquivo muito grande", 
          description: "O arquivo deve ter no máximo 5MB.", 
          variant: "destructive" 
        });
        return;
      }
      setReceiptFile(file);
    }
  };

  const handleReceiptUpload = async () => {
    if (!receiptFile || !pendingPaymentId) return;
    
    setIsUploadingReceipt(true);
    try {
      await uploadReceiptMutation.mutateAsync({
        file: receiptFile,
        paymentId: pendingPaymentId,
        amount: Number(profile?.costPerClient || 49.99), // Usar custo real do revendedor
      });
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const resetCreateClientForm = () => {
    setNewClientName("");
    setNewClientEmail("");
    setNewClientPhone("");
    setNewClientPassword("");
    setNewClientPrice("99.99");
    setCreateAsFree(false);
    setPaymentMethod("pix");
    setCheckoutStep("form");
    setPixCode("");
    setPixQrCode("");
    setPendingPaymentId("");
    // Limpar campos do cartão
    setCardNumber("");
    setExpiryDate("");
    setCvv("");
    setCardHolder("");
    setDocNumber("");
    setCardError(null);
  };

  const handleSaveProfile = () => {
    if (!companyName.trim()) {
      toast({ title: "Nome da empresa é obrigatório", variant: "destructive" });
      return;
    }

    saveProfileMutation.mutate({
      companyName,
      companyDescription,
      subdomain: subdomain || undefined,
      primaryColor,
      secondaryColor,
      accentColor,
      clientMonthlyPrice,
      supportEmail: supportEmail || undefined,
      supportPhone: supportPhone || undefined,
      welcomeMessage: welcomeMessage || undefined,
    });
  };

  const handleCreateClient = () => {
    if (!newClientName.trim() || !newClientEmail.trim() || !newClientPassword.trim()) {
      toast({ title: "Nome, email e senha são obrigatórios", variant: "destructive" });
      return;
    }

    if (!newClientPrice || parseFloat(newClientPrice) <= 0) {
      toast({ title: "Informe o valor mensal que você cobrará do cliente", variant: "destructive" });
      return;
    }

    if (createAsFree && freeClientData?.available) {
      // Criar cliente gratuito
      createFreeClientMutation.mutate({
        name: newClientName,
        email: newClientEmail,
        phone: newClientPhone,
        password: newClientPassword,
        clientPrice: newClientPrice,
      });
    } else if (paymentMethod === "credit_card") {
      // Para cartão, ir direto para o formulário de cartão (sem chamar API primeiro)
      setCheckoutStep("payment");
    } else {
      // Iniciar checkout com PIX
      checkoutMutation.mutate({
        name: newClientName,
        email: newClientEmail,
        phone: newClientPhone,
        password: newClientPassword,
        clientPrice: newClientPrice,
        paymentMethod,
      });
    }
  };

  const handleCheckPayment = async () => {
    if (!pendingPaymentId) return;
    setCheckingPayment(true);
    try {
      await confirmPixMutation.mutateAsync(pendingPaymentId);
    } finally {
      setCheckingPayment(false);
    }
  };

  // Abrir detalhes do cliente - navega para URL dedicada
  const openClientDetails = (clientId: string) => {
    setLocation(`/revenda/clientes/${clientId}`);
  };

  // Fechar detalhes do cliente - volta para lista de clientes
  const closeClientDetails = () => {
    setLocation("/revenda/clientes");
  };

  // Abrir modal de reset de senha
  const openResetPassword = () => {
    setNewPasswordForReset("");
    setIsResetPasswordOpen(true);
  };

  // Calcular faturas pendentes/vencidas do cliente
  const getClientInvoices = (): PendingInvoice[] => {
    if (!clientDetails?.client) return [];
    
    const invoices: PendingInvoice[] = [];
    const now = new Date();
    const clientPrice = parseFloat(clientDetails.client.clientPrice || '0');
    
    if (clientPrice <= 0 || clientDetails.client.isFreeClient) return [];
    
    // Pegar a data de ativação ou criação como base
    const activatedAt = clientDetails.client.activatedAt 
      ? new Date(clientDetails.client.activatedAt) 
      : new Date(clientDetails.client.createdAt);
    
    // Encontrar meses que já foram pagos
    const paidMonths = new Set(
      (clientDetails.paymentHistory || [])
        .map(p => p.referenceMonth || '')
        .filter(m => m)
    );
    
    // Calcular meses desde a ativação até agora + 1 mês futuro (para antecipar)
    const monthsToShow = [];
    const startDate = new Date(activatedAt.getFullYear(), activatedAt.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0); // Próximo mês
    
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      monthsToShow.push(new Date(currentDate));
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    // Gerar faturas para cada mês
    for (const month of monthsToShow) {
      const referenceMonth = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      
      // Pular se já foi pago
      if (paidMonths.has(referenceMonth)) continue;
      
      // Calcular data de vencimento (dia 10 do mês seguinte por padrão)
      const billingDay = profile?.billingDay || 10;
      const dueDate = new Date(month.getFullYear(), month.getMonth() + 1, billingDay);
      
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      let status: 'pending' | 'overdue' | 'upcoming' = 'upcoming';
      if (daysUntilDue < 0) {
        status = 'overdue';
      } else if (daysUntilDue <= 30) {
        status = 'pending';
      }
      
      // Só mostrar faturas vencidas, pendentes (próximas 30 dias) ou próximo mês para antecipar
      if (status === 'upcoming' && daysUntilDue > 60) continue;
      
      invoices.push({
        referenceMonth,
        dueDate,
        amount: clientPrice,
        status,
        daysUntilDue
      });
    }
    
    // Ordenar por data de vencimento
    return invoices.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  };

  // Abrir modal de confirmar pagamento de fatura específica
  const openPayInvoice = (invoice: PendingInvoice) => {
    setSelectedInvoice(invoice);
    setMarkPaidAmount(invoice.amount.toString());
    setMarkPaidDescription(`Mensalidade ${new Date(invoice.referenceMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`);
    setIsMarkPaidOpen(true);
  };

  // Handler para resetar senha
  const handleResetPassword = () => {
    const clientIdToReset = selectedClientForReset || selectedClientId;
    if (!clientIdToReset) return;
    resetPasswordMutation.mutate({
      clientId: clientIdToReset,
      newPassword: newPasswordForReset || undefined,
    });
  };

  // Handler para confirmar pagamento de fatura
  const handleMarkAsPaid = () => {
    if (!selectedClientId || !selectedInvoice) return;
    markAsPaidMutation.mutate({
      clientId: selectedClientId,
      amount: markPaidAmount || undefined,
      description: markPaidDescription || undefined,
      referenceMonth: selectedInvoice.referenceMonth,
      dueDate: selectedInvoice.dueDate.toISOString(),
    });
  };

  // Formatadores de cartão
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

  // Handler para pagamento com cartão de crédito
  const handleCardPayment = async () => {
    if (!mpInstanceRef.current) {
      setCardError("Sistema de pagamento não inicializado. Recarregue a página.");
      return;
    }
    
    if (!cardNumber || !expiryDate || !cvv || !cardHolder || !docNumber) {
      setCardError("Preencha todos os campos do cartão.");
      return;
    }
    
    setIsProcessingCard(true);
    setCardError(null);

    try {
      const [expirationMonth, expirationYear] = expiryDate.split("/");
      
      // Dados do cartão para tokenização
      const cardData = {
        cardNumber: cardNumber.replace(/\s/g, ""),
        cardholderName: cardHolder,
        cardExpirationMonth: expirationMonth,
        cardExpirationYear: "20" + expirationYear,
        securityCode: cvv,
        identificationType: docType,
        identificationNumber: docNumber.replace(/\D/g, ""),
      };
      
      // Criar token do cartão
      const cardToken = await mpInstanceRef.current.createCardToken(cardData);
      if (cardToken?.error || cardToken?.message) {
        throw new Error(cardToken.error || cardToken.message || "Erro ao processar cartão");
      }
      if (!cardToken || !cardToken.id) {
        throw new Error("Não foi possível processar os dados do cartão.");
      }

      // Determinar o método de pagamento
      const paymentMethodMap: Record<string, string> = {
        visa: "visa", mastercard: "master", amex: "amex", elo: "elo", hipercard: "hipercard"
      };
      const paymentMethodId = cardBrand ? paymentMethodMap[cardBrand] || "visa" : "visa";

      // Enviar checkout com token do cartão
      const response = await apiRequest("POST", "/api/reseller/clients/checkout", {
        name: newClientName,
        email: newClientEmail,
        phone: newClientPhone,
        password: newClientPassword,
        clientPrice: parseFloat(newClientPrice),
        paymentMethod: "credit_card",
        cardData: {
          token: cardToken.id,
          paymentMethodId,
          payerEmail: newClientEmail,
          installments: 1,
        },
      });

      const result = await response.json();

      if (result.success) {
        if (result.requiresPayment && result.error) {
          // Pagamento em processamento
          toast({ title: "Pagamento em processamento", description: result.error });
          setPendingPaymentId(result.paymentId);
          setCheckoutStep("payment");
        } else {
          // Pagamento aprovado - cliente criado
          queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
          toast({ title: "✅ Pagamento aprovado!", description: "Cliente criado com sucesso!" });
          setCheckoutStep("success");
        }
      } else {
        setCardError(result.message || "Erro ao processar pagamento");
      }
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
        errorMessage = errMsg;
      }
      
      setCardError(errorMessage);
    } finally {
      setIsProcessingCard(false);
    }
  };

  // Limpar campos de cartão ao resetar formulário
  const resetCardForm = () => {
    setCardNumber("");
    setExpiryDate("");
    setCvv("");
    setCardHolder("");
    setDocNumber("");
    setCardError(null);
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewClientPassword(password);
    setShowPassword(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!" });
  };

  // Se está carregando status
  if (isLoadingStatus) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Se não tem plano de revenda
  if (!resellerStatus?.hasResellerPlan) {
    return (
      <div className="container max-w-2xl py-16 text-center">
        <AlertCircle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-4">Acesso Restrito</h1>
        <p className="text-muted-foreground mb-8">
          Você não possui um plano de revenda ativo. 
          Para se tornar um revendedor white-label, entre em contato com o suporte.
        </p>
        <div className="space-y-4">
          <Button onClick={() => setLocation("/dashboard")}>
            Voltar ao Dashboard
          </Button>
          <p className="text-sm text-muted-foreground">
            O plano de revenda custa R$700/mês e permite criar clientes com sua própria marca.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      {/* Detectar se estamos na rota de detalhes do cliente */}
      {location.startsWith("/revenda/clientes/") && clientIdFromUrl ? (
        /* Renderizar página de detalhes do cliente */
        <ClientDetailsPage clientId={clientIdFromUrl} setLocation={setLocation} />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                <Building2 className="h-8 w-8" />
                Painel do Revendedor
              </h1>
              <p className="text-muted-foreground">
                Gerencie sua marca e clientes white-label
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/dashboard">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar ao Dashboard
                </Link>
              </Button>
              {profile?.subdomain && (
                <Button variant="outline" onClick={() => window.open(`https://${profile.subdomain}.agentezap.com`, '_blank')}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver Meu Site
                </Button>
              )}
            </div>
          </div>

      {/* Tabs - 5 abas com nomenclatura clara */}
      {/* 
        HIERARQUIA DO SISTEMA:
        - TOPO: Dono do SaaS (AgenteZap) → Recebe do Revendedor
        - MEIO: Revendedor → Paga ao SaaS, Recebe dos Clientes  
        - BASE: Cliente → Paga ao Revendedor
        
        ABAS:
        - Dashboard: Visão geral
        - Clientes: Gerenciar clientes do revendedor
        - Cobranças: Pagamentos que RECEBO dos meus clientes
        - Minhas Faturas: Pagamentos que EU PAGO ao sistema (SaaS)
        - Config: Configurações
      */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Clientes</span>
          </TabsTrigger>
          <TabsTrigger value="my-subscription" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Minhas Faturas</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Config</span>
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* Métricas */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics?.totalClients || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Clientes Ativos</CardTitle>
                <Check className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{metrics?.activeClients || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Receita Mensal</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R$ {metrics?.monthlyRevenue?.toFixed(2) || '0.00'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lucro Mensal</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  R$ {metrics?.monthlyProfit?.toFixed(2) || '0.00'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resumo Rápido */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sua Marca</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  {profile?.logoUrl ? (
                    <img src={profile.logoUrl} alt="Logo" className="h-16 w-16 rounded object-contain bg-muted" />
                  ) : (
                    <div className="h-16 w-16 rounded bg-muted flex items-center justify-center">
                      <Building2 className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-lg">{profile?.companyName || 'Não configurado'}</p>
                    {profile?.subdomain && (
                      <p className="text-sm text-muted-foreground">
                        {profile.subdomain}.agentezap.com
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div 
                    className="w-8 h-8 rounded border" 
                    style={{ backgroundColor: profile?.primaryColor || '#000000' }}
                    title="Cor Primária"
                  />
                  <div 
                    className="w-8 h-8 rounded border" 
                    style={{ backgroundColor: profile?.secondaryColor || '#ffffff' }}
                    title="Cor Secundária"
                  />
                  <div 
                    className="w-8 h-8 rounded border" 
                    style={{ backgroundColor: profile?.accentColor || '#22c55e' }}
                    title="Cor de Destaque"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Preços</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Seu custo por cliente:</span>
                  <span className="font-medium">R$ {profile?.costPerClient || '49.99'}/mês</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Seu preço de venda:</span>
                  <span className="font-medium">R$ {profile?.clientMonthlyPrice || '99.99'}/mês</span>
                </div>
                <div className="flex justify-between items-center border-t pt-2">
                  <span className="text-muted-foreground">Lucro por cliente:</span>
                  <span className="font-medium text-green-600">
                    R$ {(Number(profile?.clientMonthlyPrice || 99.99) - Number(profile?.costPerClient || 49.99)).toFixed(2)}/mês
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Clients Tab */}
        <TabsContent value="clients" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Seus Clientes</h2>
              <p className="text-sm text-muted-foreground">
                Gerencie os clientes que usam sua marca
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetchClients()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
              <Dialog open={isCreateClientOpen} onOpenChange={(open) => {
                setIsCreateClientOpen(open);
                if (!open) resetCreateClientForm();
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Cliente
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                  {checkoutStep === "form" && (
                    <>
                      <DialogHeader>
                        <DialogTitle>Criar Novo Cliente</DialogTitle>
                        <DialogDescription>
                          {freeClientData?.available ? (
                            <span className="text-green-600 font-medium">
                              🎁 Você tem 1 cliente gratuito disponível para demonstração!
                            </span>
                          ) : (
                            <>Taxa de R$ 49,99 para criar cliente</>
                          )}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        {/* Dados do cliente */}
                        <div className="space-y-2">
                          <Label>Nome Completo *</Label>
                          <Input
                            value={newClientName}
                            onChange={(e) => setNewClientName(e.target.value)}
                            placeholder="Nome do cliente"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Email *</Label>
                          <Input
                            type="email"
                            value={newClientEmail}
                            onChange={(e) => setNewClientEmail(e.target.value)}
                            placeholder="email@exemplo.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Telefone</Label>
                          <Input
                            value={newClientPhone}
                            onChange={(e) => setNewClientPhone(e.target.value)}
                            placeholder="(11) 99999-9999"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Senha Inicial *</Label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Input
                                type={showPassword ? "text" : "password"}
                                value={newClientPassword}
                                onChange={(e) => setNewClientPassword(e.target.value)}
                                placeholder="Senha do cliente"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                            <Button variant="outline" onClick={generatePassword}>
                              Gerar
                            </Button>
                          </div>
                          {newClientPassword && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={() => copyToClipboard(newClientPassword)}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copiar senha
                            </Button>
                          )}
                        </div>

                        {/* Preço mensal que o revendedor vai cobrar */}
                        <div className="space-y-2 border-t pt-4">
                          <Label>Valor Mensal que Você Cobrará do Cliente *</Label>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">R$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={newClientPrice}
                              onChange={(e) => setNewClientPrice(e.target.value)}
                              placeholder="99.99"
                              className="w-32"
                            />
                            <span className="text-sm text-muted-foreground">/mês</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Este valor será mostrado para o cliente na página de planos.
                          </p>
                        </div>

                        {/* Opção de cliente gratuito */}
                        {freeClientData?.available && (
                          <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-green-700 dark:text-green-300">Criar como Cliente Gratuito</Label>
                                <p className="text-xs text-green-600 dark:text-green-400">
                                  Use seu cliente demo gratuito ({freeClientData.used}/{freeClientData.limit} usado)
                                </p>
                              </div>
                              <Switch
                                checked={createAsFree}
                                onCheckedChange={setCreateAsFree}
                              />
                            </div>
                          </div>
                        )}

                        {/* Método de pagamento (se não for gratuito) */}
                        {!createAsFree && (
                          <div className="space-y-2 border-t pt-4">
                            <Label>Forma de Pagamento</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                type="button"
                                variant={paymentMethod === "pix" ? "default" : "outline"}
                                className="w-full"
                                onClick={() => setPaymentMethod("pix")}
                              >
                                <DollarSign className="h-4 w-4 mr-2" />
                                PIX
                              </Button>
                              <Button
                                type="button"
                                variant={paymentMethod === "credit_card" ? "default" : "outline"}
                                className="w-full"
                                onClick={() => setPaymentMethod("credit_card")}
                              >
                                <CreditCard className="h-4 w-4 mr-2" />
                                Cartão
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateClientOpen(false)}>
                          Cancelar
                        </Button>
                        <Button 
                          onClick={handleCreateClient}
                          disabled={createFreeClientMutation.isPending || checkoutMutation.isPending}
                        >
                          {(createFreeClientMutation.isPending || checkoutMutation.isPending) && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          )}
                          {createAsFree ? "Criar Cliente Gratuito" : `Pagar R$ 49,99 via ${paymentMethod === "pix" ? "PIX" : "Cartão"}`}
                        </Button>
                      </DialogFooter>
                    </>
                  )}

                  {checkoutStep === "payment" && (
                    <>
                      <DialogHeader>
                        <DialogTitle>
                          {paymentMethod === "pix" ? "Pagamento PIX" : "Pagamento com Cartão"}
                        </DialogTitle>
                        <DialogDescription>
                          {paymentMethod === "pix" 
                            ? "Escaneie o QR Code ou copie o código PIX para pagar"
                            : "Preencha os dados do seu cartão de crédito"
                          }
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        {/* PAGAMENTO PIX */}
                        {paymentMethod === "pix" && (
                          <>
                            {pixQrCode && (
                              <div className="flex justify-center">
                                <img 
                                  src={pixQrCode.startsWith('data:') ? pixQrCode : `data:image/png;base64,${pixQrCode}`} 
                                  alt="QR Code PIX" 
                                  className="w-48 h-48 border rounded-lg"
                                />
                              </div>
                            )}
                            {pixCode && (
                              <div className="space-y-2">
                                <Label>Código PIX Copia e Cola</Label>
                                <div className="flex gap-2">
                                  <Input 
                                    value={pixCode} 
                                    readOnly 
                                    className="font-mono text-xs"
                                  />
                                  <Button variant="outline" onClick={() => copyToClipboard(pixCode)}>
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                            <div className="text-center text-sm text-muted-foreground">
                              <p>Após o pagamento, clique em "Verificar Pagamento"</p>
                              <p className="text-xs">O pagamento é confirmado automaticamente em até 1 minuto</p>
                            </div>
                            
                            {/* Botão "Já paguei" - Enviar comprovante */}
                            <div className="border-t pt-4 mt-4">
                              <p className="text-xs text-center text-muted-foreground mb-2">
                                Já fez o pagamento por outra via?
                              </p>
                              <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => setShowReceiptUploadModal(true)}
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                Já paguei - Enviar comprovante
                              </Button>
                            </div>
                          </>
                        )}

                        {/* PAGAMENTO COM CARTÃO */}
                        {paymentMethod === "credit_card" && (
                          <div className="space-y-4">
                            <div>
                              <Label className="text-sm font-medium mb-1.5 block">Número do cartão</Label>
                              <div className="relative">
                                <Input
                                  placeholder="0000 0000 0000 0000"
                                  value={cardNumber}
                                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                                  maxLength={19}
                                  className="h-10"
                                />
                                {cardBrand && (
                                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold uppercase text-primary">
                                    {cardBrand}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-sm font-medium mb-1.5 block">Validade</Label>
                                <Input
                                  placeholder="MM/AA"
                                  value={expiryDate}
                                  onChange={(e) => setExpiryDate(formatExpiryDate(e.target.value))}
                                  maxLength={5}
                                  className="h-10"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-medium mb-1.5 block">CVV</Label>
                                <Input
                                  placeholder="000"
                                  value={cvv}
                                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                  maxLength={4}
                                  className="h-10"
                                />
                              </div>
                            </div>

                            <div>
                              <Label className="text-sm font-medium mb-1.5 block">Nome no cartão</Label>
                              <Input
                                placeholder="NOME COMPLETO"
                                value={cardHolder}
                                onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                                className="h-10"
                              />
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <select
                                value={docType}
                                onChange={(e) => setDocType(e.target.value)}
                                className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                              >
                                <option value="CPF">CPF</option>
                                <option value="CNPJ">CNPJ</option>
                              </select>
                              <Input
                                placeholder="Documento"
                                value={docNumber}
                                onChange={(e) => setDocNumber(formatDoc(e.target.value))}
                                className="col-span-2 h-10"
                              />
                            </div>

                            {cardError && (
                              <div className="p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-xs">
                                {cardError}
                              </div>
                            )}

                            {!mpReady && (
                              <div className="p-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded text-amber-600 dark:text-amber-400 text-xs">
                                ⚠️ Sistema de pagamento carregando...
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setCheckoutStep("form");
                            setPixCode("");
                            setPixQrCode("");
                            resetCardForm();
                          }}
                        >
                          Voltar
                        </Button>
                        {paymentMethod === "pix" ? (
                          <Button 
                            onClick={handleCheckPayment}
                            disabled={checkingPayment || confirmPixMutation.isPending}
                          >
                            {(checkingPayment || confirmPixMutation.isPending) && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Verificar Pagamento
                          </Button>
                        ) : (
                          <Button 
                            onClick={handleCardPayment}
                            disabled={isProcessingCard || !mpReady}
                          >
                            {isProcessingCard && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            <CreditCard className="h-4 w-4 mr-2" />
                            {isProcessingCard ? "Processando..." : `Pagar R$ ${parseFloat(newClientPrice).toFixed(2).replace('.', ',')}`}
                          </Button>
                        )}
                      </DialogFooter>
                    </>
                  )}

                  {checkoutStep === "success" && (
                    <>
                      <DialogHeader>
                        <DialogTitle className="text-green-600">✅ Cliente Criado com Sucesso!</DialogTitle>
                        <DialogDescription>
                          O cliente foi criado e já pode acessar o sistema.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                          <p className="font-medium">{newClientName}</p>
                          <p className="text-sm text-muted-foreground">{newClientEmail}</p>
                          {newClientPassword && (
                            <div className="mt-2 pt-2 border-t">
                              <p className="text-sm">Senha: <code className="bg-muted px-2 py-1 rounded">{newClientPassword}</code></p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs mt-1"
                                onClick={() => copyToClipboard(`Email: ${newClientEmail}\nSenha: ${newClientPassword}`)}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Copiar credenciais
                              </Button>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground text-center">
                          Envie as credenciais acima para seu cliente
                        </p>
                      </div>
                      <DialogFooter>
                        <Button onClick={() => {
                          setIsCreateClientOpen(false);
                          resetCreateClientForm();
                          refetchClients();
                        }}>
                          Fechar
                        </Button>
                      </DialogFooter>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {isLoadingClients ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : clients?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Nenhum cliente ainda</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Clique em "Novo Cliente" para criar seu primeiro cliente
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor Mensal</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients?.map((client) => {
                    // Calcular status de vencimento
                    const nextPaymentDate = (client as any).nextPaymentDate;
                    const isOverdue = (client as any).isOverdue;
                    const daysUntilDue = nextPaymentDate 
                      ? Math.ceil((new Date(nextPaymentDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                      : null;
                    
                    return (
                    <TableRow key={client.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openClientDetails(client.id)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Users className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <span className="block">{client.user?.name || '-'}</span>
                            <span className="text-xs text-muted-foreground">{client.user?.email || '-'}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-green-600">
                          R$ {client.clientPrice || profile?.clientMonthlyPrice || '99.99'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {client.isFreeClient ? (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            🎁 Gratuito
                          </Badge>
                        ) : nextPaymentDate ? (
                          <div className="flex flex-col">
                            <span className={`text-sm font-medium ${isOverdue ? 'text-red-600' : daysUntilDue && daysUntilDue <= 5 ? 'text-yellow-600' : ''}`}>
                              {new Date(nextPaymentDate).toLocaleDateString('pt-BR')}
                            </span>
                            {isOverdue ? (
                              <Badge variant="destructive" className="text-xs w-fit mt-1">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Vencido
                              </Badge>
                            ) : daysUntilDue !== null && daysUntilDue <= 5 ? (
                              <span className="text-xs text-yellow-600">
                                {daysUntilDue === 0 ? 'Vence hoje' : `${daysUntilDue} dia(s)`}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {daysUntilDue} dias restantes
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          client.status === 'active' ? 'default' :
                          client.status === 'suspended' ? 'secondary' :
                          client.status === 'pending' ? 'outline' :
                          'destructive'
                        } className="gap-1">
                          {client.status === 'active' && <CheckCircle2 className="h-3 w-3" />}
                          {client.status === 'suspended' && <Pause className="h-3 w-3" />}
                          {client.status === 'pending' && <Clock className="h-3 w-3" />}
                          {client.status === 'cancelled' && <XCircle className="h-3 w-3" />}
                          {client.status === 'active' ? 'Ativo' :
                           client.status === 'suspended' ? 'Suspenso' :
                           client.status === 'pending' ? 'Pendente' :
                           'Cancelado'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {/* Botão Ver Detalhes - igual minha-assinatura */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openClientDetails(client.id)}
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Detalhes
                          </Button>
                          {/* Botão Pagar Anual */}
                          {!client.isFreeClient && client.status !== 'cancelled' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => openClientDetails(client.id)}
                              title="Pagar anual com desconto"
                            >
                              <Calendar className="h-4 w-4 mr-1" />
                              Anual
                            </Button>
                          )}
                          {/* Botão Gerar Nova Senha */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedClientForReset(client.id);
                              setNewPasswordForReset("");
                              setIsResetPasswordOpen(true);
                            }}
                            title="Gerar nova senha"
                          >
                            <Key className="h-4 w-4 text-blue-500" />
                          </Button>
                          {client.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => suspendClientMutation.mutate(client.id)}
                              disabled={suspendClientMutation.isPending}
                              title="Suspender"
                            >
                              <Pause className="h-4 w-4 text-orange-500" />
                            </Button>
                          )}
                          {client.status === 'suspended' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => reactivateClientMutation.mutate(client.id)}
                              disabled={reactivateClientMutation.isPending}
                              title="Reativar"
                            >
                              <Play className="h-4 w-4 text-green-500" />
                            </Button>
                          )}
                          {client.status !== 'cancelled' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm('Tem certeza que deseja cancelar este cliente?')) {
                                  cancelClientMutation.mutate(client.id);
                                }
                              }}
                              disabled={cancelClientMutation.isPending}
                              title="Cancelar"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Settings Tab - Configurações e PIX */}
        <TabsContent value="settings" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Configuração do PIX */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Chave PIX para Recebimento
                </CardTitle>
                <CardDescription>
                  Configure sua chave PIX para receber pagamentos dos seus clientes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Chave PIX</Label>
                  <select
                    className="w-full p-2 border rounded-lg bg-background"
                    value={profile?.pixKeyType || ''}
                    onChange={(e) => {
                      updateResellerMutation.mutate({
                        pixKeyType: e.target.value,
                      });
                    }}
                  >
                    <option value="">Selecione o tipo</option>
                    <option value="cpf">CPF</option>
                    <option value="cnpj">CNPJ</option>
                    <option value="email">Email</option>
                    <option value="phone">Telefone</option>
                    <option value="random">Chave Aleatória</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Chave PIX</Label>
                  <Input
                    key={`pixKey-${profile?.pixKey || 'empty'}`}
                    placeholder={
                      profile?.pixKeyType === 'cpf' ? '000.000.000-00' :
                      profile?.pixKeyType === 'cnpj' ? '00.000.000/0000-00' :
                      profile?.pixKeyType === 'email' ? 'seu@email.com' :
                      profile?.pixKeyType === 'phone' ? '+55 11 99999-9999' :
                      'Cole sua chave aleatória'
                    }
                    defaultValue={profile?.pixKey || ''}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== profile?.pixKey) {
                        updateResellerMutation.mutate({
                          pixKey: e.target.value,
                        });
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome do Titular</Label>
                  <Input
                    key={`pixHolderName-${(profile as any)?.pixHolderName || 'empty'}`}
                    placeholder="Nome completo do titular da conta"
                    defaultValue={(profile as any)?.pixHolderName || ''}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== (profile as any)?.pixHolderName) {
                        updateResellerMutation.mutate({
                          pixHolderName: e.target.value,
                        });
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome do Banco</Label>
                  <Input
                    key={`pixBankName-${(profile as any)?.pixBankName || 'empty'}`}
                    placeholder="Ex: Nubank, Inter, Itaú, Bradesco"
                    defaultValue={(profile as any)?.pixBankName || ''}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== (profile as any)?.pixBankName) {
                        updateResellerMutation.mutate({
                          pixBankName: e.target.value,
                        });
                      }
                    }}
                  />
                </div>
                {profile?.pixKey && profile?.pixKeyType && (
                  <div className="p-3 border rounded-lg bg-green-50 dark:bg-green-950">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm font-medium">PIX configurado!</span>
                    </div>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      Seus clientes verão essa chave para fazer os pagamentos
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Preços para Clientes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Preços para Seus Clientes
                </CardTitle>
                <CardDescription>
                  Configure os valores que você cobra dos seus clientes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Mensalidade Padrão (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={profile?.clientMonthlyPrice || '99.99'}
                    onChange={(e) => {
                      updateResellerMutation.mutate({
                        clientMonthlyPrice: e.target.value,
                      });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor padrão cobrado mensalmente de cada cliente
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Taxa de Setup (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={profile?.clientSetupFee || '0'}
                    onChange={(e) => {
                      updateResellerMutation.mutate({
                        clientSetupFee: e.target.value,
                      });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Taxa única de ativação (opcional)
                  </p>
                </div>
                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Seu custo por cliente:</span>
                    <span className="font-medium">R$ {profile?.costPerClient || '49.99'}/mês</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-muted-foreground">Seu lucro por cliente:</span>
                    <span className="font-medium text-green-600">
                      R$ {(Number(profile?.clientMonthlyPrice || 99.99) - Number(profile?.costPerClient || 49.99)).toFixed(2)}/mês
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Branding */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Sua Marca
                </CardTitle>
                <CardDescription>
                  Personalize a aparência do seu sistema
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome da Empresa</Label>
                  <Input
                    value={profile?.companyName || ''}
                    onChange={(e) => {
                      updateResellerMutation.mutate({
                        companyName: e.target.value,
                      });
                    }}
                    placeholder="Nome da sua empresa"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2">
                    <Label className="text-xs">Cor Primária</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={profile?.primaryColor || '#000000'}
                        onChange={(e) => {
                          updateResellerMutation.mutate({
                            primaryColor: e.target.value,
                          });
                        }}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Cor Secundária</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={profile?.secondaryColor || '#ffffff'}
                        onChange={(e) => {
                          updateResellerMutation.mutate({
                            secondaryColor: e.target.value,
                          });
                        }}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Destaque</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={profile?.accentColor || '#22c55e'}
                        onChange={(e) => {
                          updateResellerMutation.mutate({
                            accentColor: e.target.value,
                          });
                        }}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contato */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Informações de Contato
                </CardTitle>
                <CardDescription>
                  Esses dados serão exibidos para seus clientes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Email de Suporte</Label>
                  <Input
                    type="email"
                    value={profile?.supportEmail || ''}
                    onChange={(e) => {
                      updateResellerMutation.mutate({
                        supportEmail: e.target.value,
                      });
                    }}
                    placeholder="suporte@suaempresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone/WhatsApp</Label>
                  <Input
                    value={profile?.supportPhone || ''}
                    onChange={(e) => {
                      updateResellerMutation.mutate({
                        supportPhone: e.target.value,
                      });
                    }}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem de Boas-vindas</Label>
                  <Textarea
                    value={profile?.welcomeMessage || ''}
                    onChange={(e) => {
                      updateResellerMutation.mutate({
                        welcomeMessage: e.target.value,
                      });
                    }}
                    placeholder="Mensagem personalizada para seus clientes..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===================== MINHAS FATURAS TAB ===================== */}
        {/* Revendedor paga ao SaaS (AgenteZap) */}
        <TabsContent value="my-subscription" className="space-y-6">
          <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Receipt className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-100">Minhas Faturas — Pagamentos ao Sistema</p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Aqui você gerencia o que <strong>você paga ao AgenteZap</strong> pela plataforma de revenda. 
                    Valor mensal baseado no número de clientes ativos.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoadingMySubscription ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Resumo financeiro */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Clientes Ativos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{mySubscription?.activeClients ?? 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Custo por Cliente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">R$ {(mySubscription?.costPerClient ?? 49.99).toFixed(2)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Mensal</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">R$ {(mySubscription?.totalMonthly ?? 0).toFixed(2)}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Fatura Atual */}
              {mySubscription?.currentInvoice && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Fatura do Mês Atual
                      </CardTitle>
                      {mySubscription.currentInvoice.status === 'paid' ? (
                        <Badge className="bg-green-500">✅ Pago</Badge>
                      ) : mySubscription.currentInvoice.status === 'overdue' ? (
                        <Badge variant="destructive">⚠️ Vencido</Badge>
                      ) : (
                        <Badge variant="outline" className="border-yellow-500 text-yellow-600">⏳ Pendente</Badge>
                      )}
                    </div>
                    <CardDescription>
                      Mês de referência: <strong>{(() => {
                        const m = mySubscription.currentInvoice.referenceMonth;
                        if (!m) return '—';
                        const [y, mo] = m.split('-');
                        const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                        return `${months[parseInt(mo)-1]}/${y}`;
                      })()}</strong> — Vencimento: {new Date(mySubscription.currentInvoice.dueDate).toLocaleDateString('pt-BR')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg mb-4">
                      <div>
                        <p className="text-sm text-muted-foreground">{mySubscription.currentInvoice.activeClients} cliente(s) × R$ {(mySubscription?.costPerClient ?? 49.99).toFixed(2)}</p>
                        <p className="text-2xl font-bold">R$ {parseFloat(mySubscription.currentInvoice.totalAmount).toFixed(2)}</p>
                      </div>
                      {mySubscription.currentInvoice.status !== 'paid' && (
                        <div className="flex flex-col gap-2">
                          <Button
                            onClick={() => generateMyInvoicePix(mySubscription!.currentInvoice!.id)}
                            disabled={isGeneratingMyInvoicePix}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {isGeneratingMyInvoicePix ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando...</>
                            ) : (
                              <><QrCode className="h-4 w-4 mr-2" />Pagar com PIX</>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSelectedMyInvoiceId(mySubscription!.currentInvoice!.id);
                              setShowMyInvoiceReceiptModal(true);
                            }}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Já paguei
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Faturas Pendentes / Vencidas */}
              {mySubscription?.pendingInvoices && mySubscription.pendingInvoices.filter(i => i.id !== mySubscription?.currentInvoice?.id).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-orange-600">
                      <AlertTriangle className="h-5 w-5" />
                      Faturas Pendentes / Vencidas
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {mySubscription.pendingInvoices
                        .filter(i => i.id !== mySubscription?.currentInvoice?.id)
                        .map(invoice => (
                          <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-lg bg-orange-50 dark:bg-orange-950/30">
                            <div>
                              <p className="font-medium">{(() => {
                                const m = invoice.referenceMonth;
                                if (!m) return '—';
                                const [y, mo] = m.split('-');
                                const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                                return `${months[parseInt(mo)-1]}/${y}`;
                              })()}</p>
                              <p className="text-sm text-muted-foreground">Vencimento: {new Date(invoice.dueDate).toLocaleDateString('pt-BR')}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <p className="font-bold">R$ {parseFloat(invoice.totalAmount).toFixed(2)}</p>
                              <div className="flex flex-col gap-1">
                                <Button size="sm" variant="destructive" onClick={() => generateMyInvoicePix(invoice.id)} disabled={isGeneratingMyInvoicePix}>
                                  <QrCode className="h-3 w-3 mr-1" />Pagar PIX
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setSelectedMyInvoiceId(invoice.id); setShowMyInvoiceReceiptModal(true); }}>
                                  <Upload className="h-3 w-3 mr-1" />Já paguei
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Histórico de Faturas */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Histórico de Faturas
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={() => { refetchMySubscription(); refetchMyInvoices(); }}>
                      <RefreshCw className="h-4 w-4 mr-1" />Atualizar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingMyInvoices ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
                  ) : (!myInvoices || myInvoices.length === 0) ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>Nenhuma fatura encontrada</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mês</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Pagamento</TableHead>
                          <TableHead>Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {myInvoices.map(invoice => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">{(() => {
                              const m = invoice.referenceMonth;
                              if (!m) return '—';
                              const [y, mo] = m.split('-');
                              const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                              return `${months[parseInt(mo)-1]}/${y}`;
                            })()}</TableCell>
                            <TableCell>{new Date(invoice.dueDate).toLocaleDateString('pt-BR')}</TableCell>
                            <TableCell>R$ {parseFloat(invoice.totalAmount).toFixed(2)}</TableCell>
                            <TableCell>
                              {invoice.status === 'paid' ? (
                                <Badge className="bg-green-500">Pago</Badge>
                              ) : invoice.status === 'overdue' ? (
                                <Badge variant="destructive">Vencido</Badge>
                              ) : (
                                <Badge variant="outline" className="border-yellow-500 text-yellow-600">Pendente</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString('pt-BR') : '—'}
                            </TableCell>
                            <TableCell>
                              {invoice.status !== 'paid' && (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" onClick={() => generateMyInvoicePix(invoice.id)} disabled={isGeneratingMyInvoicePix}>
                                    <QrCode className="h-3 w-3 mr-1" />PIX
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => { setSelectedMyInvoiceId(invoice.id); setShowMyInvoiceReceiptModal(true); }}>
                                    <Upload className="h-3 w-3 mr-1" />Comprovante
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ====== MODAL PIX — Fatura do revendedor ao SaaS ====== */}
      <Dialog open={isMyInvoicePixOpen} onOpenChange={setIsMyInvoicePixOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Pagar Fatura com PIX
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code ou copie o código PIX para pagar sua fatura ao AgenteZap
            </DialogDescription>
          </DialogHeader>
          {myInvoicePixData && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Fatura de {(() => {
                  const m = myInvoicePixData.referenceMonth;
                  if (!m) return '—';
                  const [y, mo] = m.split('-');
                  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                  return `${months[parseInt(mo)-1]}/${y}`;
                })()}</p>
                <p className="text-2xl font-bold text-green-600">R$ {myInvoicePixData.amount.toFixed(2)}</p>
              </div>
              {myInvoicePixData.qrCodeBase64 && (
                <div className="flex justify-center">
                  <img
                    src={`data:image/png;base64,${myInvoicePixData.qrCodeBase64}`}
                    alt="QR Code PIX"
                    className="w-48 h-48 border rounded-lg"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Código PIX (Copia e Cola)</Label>
                <div className="flex gap-2">
                  <Input value={myInvoicePixData.qrCode} readOnly className="text-xs font-mono" />
                  <Button variant="outline" size="icon" onClick={() => {
                    navigator.clipboard.writeText(myInvoicePixData.qrCode);
                    toast({ title: "Copiado!", description: "Código PIX copiado para a área de transferência" });
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => selectedMyInvoiceId && checkMyInvoicePayment(selectedMyInvoiceId)}
                disabled={isCheckingMyInvoicePayment}
              >
                {isCheckingMyInvoicePayment ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Verificando...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" />Verificar Pagamento Automático</>
                )}
              </Button>
              <div className="border-t pt-4">
                <p className="text-xs text-center text-muted-foreground mb-2">Já fez o pagamento e quer enviar comprovante?</p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowMyInvoiceReceiptModal(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Já paguei — Enviar Comprovante
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ====== MODAL UPLOAD COMPROVANTE — Fatura do revendedor ao SaaS ====== */}
      <Dialog open={showMyInvoiceReceiptModal} onOpenChange={(open) => { setShowMyInvoiceReceiptModal(open); if (!open) { setMyInvoiceReceiptFile(null); setMyInvoiceReceiptSuccess(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Enviar Comprovante de Pagamento
            </DialogTitle>
            <DialogDescription>
              Envie o comprovante do PIX pago. O admin irá confirmar e liberar seus clientes.
            </DialogDescription>
          </DialogHeader>
          {myInvoiceReceiptSuccess ? (
            <div className="text-center py-6">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-semibold text-green-600">Comprovante enviado!</p>
              <p className="text-sm text-muted-foreground">Aguarde a confirmação do administrador.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => myInvoiceReceiptInputRef.current?.click()}
              >
                {myInvoiceReceiptFile ? (
                  <div className="space-y-2">
                    <FileImage className="h-10 w-10 text-green-500 mx-auto" />
                    <p className="font-medium text-sm">{myInvoiceReceiptFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(myInvoiceReceiptFile.size / 1024).toFixed(0)} KB</p>
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setMyInvoiceReceiptFile(null); }}>
                      Remover
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium">Clique para selecionar o comprovante</p>
                    <p className="text-xs text-muted-foreground">JPG, PNG, PDF (máx. 5MB)</p>
                  </>
                )}
                <input
                  ref={myInvoiceReceiptInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const validTypes = ["image/jpeg","image/png","image/gif","image/webp","application/pdf"];
                    if (!validTypes.includes(file.type)) {
                      toast({ title: "Formato inválido", description: "Envie JPG, PNG, GIF, WebP ou PDF.", variant: "destructive" });
                      return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                      toast({ title: "Arquivo muito grande", description: "Máximo 5MB.", variant: "destructive" });
                      return;
                    }
                    setMyInvoiceReceiptFile(file);
                  }}
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setShowMyInvoiceReceiptModal(false); setMyInvoiceReceiptFile(null); }}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleMyInvoiceReceiptUpload}
                  disabled={!myInvoiceReceiptFile || isUploadingMyInvoiceReceipt}
                >
                  {isUploadingMyInvoiceReceipt ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" />Enviar Comprovante</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Dialog Global de Reset de Senha (usado na tabela de clientes) */}
      <Dialog open={isResetPasswordOpen && !!selectedClientForReset} onOpenChange={(open) => {
        setIsResetPasswordOpen(open);
        if (!open) setSelectedClientForReset(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Gerar Nova Senha
            </DialogTitle>
            <DialogDescription>
              Gere uma nova senha para o cliente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nova Senha (deixe em branco para gerar automaticamente)</Label>
              <Input
                type="text"
                value={newPasswordForReset}
                onChange={(e) => setNewPasswordForReset(e.target.value)}
                placeholder="Deixe vazio para gerar automaticamente"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsResetPasswordOpen(false);
              setSelectedClientForReset(null);
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleResetPassword}
              disabled={resetPasswordMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {resetPasswordMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gerar Nova Senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
      )}

      {/* Dialog Centralizado de Detalhes do Cliente */}
      <Dialog open={isClientDetailsOpen} onOpenChange={(open) => !open && closeClientDetails()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {isLoadingClientDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : clientDetails ? (
            <>
              <DialogHeader className="space-y-4 pb-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-8 w-8 text-primary" />
                  </div>
                  <div className="flex-1">
                    <DialogTitle className="text-2xl">{clientDetails.user?.name || 'Cliente'}</DialogTitle>
                    <DialogDescription className="flex items-center gap-2 mt-1">
                      <Mail className="h-4 w-4" />
                      {clientDetails.user?.email}
                    </DialogDescription>
                  </div>
                  <Badge variant={
                    clientDetails.client.status === 'active' ? 'default' :
                    clientDetails.client.status === 'suspended' ? 'secondary' :
                    'destructive'
                  } className="text-sm py-1 px-3">
                    {clientDetails.client.status === 'active' ? '✅ Ativo' :
                     clientDetails.client.status === 'suspended' ? '⏸️ Suspenso' :
                     clientDetails.client.status === 'pending' ? '⏳ Pendente' :
                     '❌ Cancelado'}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-6">
                {/* Status de Conexão WhatsApp */}
                <Card className={cn(
                  "border-2",
                  clientDetails.connection?.isConnected 
                    ? "border-green-500 bg-green-50 dark:bg-green-950" 
                    : "border-orange-500 bg-orange-50 dark:bg-orange-950"
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {clientDetails.connection?.isConnected ? (
                          <Wifi className="h-6 w-6 text-green-600" />
                        ) : (
                          <WifiOff className="h-6 w-6 text-orange-600" />
                        )}
                        <div>
                          <p className="font-medium">
                            {clientDetails.connection?.isConnected ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
                          </p>
                          {clientDetails.connection?.phoneNumber && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {clientDetails.connection.phoneNumber}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Conversas</p>
                        <p className="text-lg font-bold">{clientDetails.stats.totalConversations}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Informações Financeiras */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Informações Financeiras
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Valor Mensal</p>
                        <p className="text-2xl font-bold text-green-600">
                          R$ {clientDetails.client.clientPrice || '99.99'}
                        </p>
                        {clientDetails.client.isFreeClient && (
                          <Badge variant="outline" className="mt-2 text-green-600">🎁 Cliente Demo</Badge>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Seu Custo</p>
                        <p className="text-2xl font-bold">
                          R$ {clientDetails.client.monthlyCost || '49.99'}
                        </p>
                        <Badge variant="outline" className="mt-2">
                          Lucro: R$ {(
                            parseFloat(clientDetails.client.clientPrice || '99.99') - 
                            parseFloat(clientDetails.client.monthlyCost || '49.99')
                          ).toFixed(2)}
                        </Badge>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Datas Importantes */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Datas
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between p-2 bg-muted/50 rounded">
                      <span className="text-muted-foreground">Cadastro</span>
                      <span>{clientDetails.user?.createdAt ? new Date(clientDetails.user.createdAt).toLocaleDateString('pt-BR') : '-'}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-muted/50 rounded">
                      <span className="text-muted-foreground">Ativação</span>
                      <span>{clientDetails.client.activatedAt ? new Date(clientDetails.client.activatedAt).toLocaleDateString('pt-BR') : '-'}</span>
                    </div>
                    {clientDetails.client.nextPaymentDate && (
                      <div className="flex justify-between p-2 bg-muted/50 rounded">
                        <span className="text-muted-foreground">Próximo Pagamento</span>
                        <span className="font-medium">{new Date(clientDetails.client.nextPaymentDate).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                    {clientDetails.client.suspendedAt && (
                      <div className="flex justify-between p-2 bg-orange-50 dark:bg-orange-950 rounded">
                        <span className="text-orange-600">Suspenso em</span>
                        <span className="text-orange-600">{new Date(clientDetails.client.suspendedAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Faturas Pendentes/Vencidas */}
                {!clientDetails.client.isFreeClient && parseFloat(clientDetails.client.clientPrice || '0') > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Faturas
                    </h3>
                    {(() => {
                      const invoices = getClientInvoices();
                      if (invoices.length === 0) {
                        return (
                          <Card className="border-green-200 bg-green-50 dark:bg-green-950">
                            <CardContent className="p-4 text-center">
                              <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
                              <p className="text-green-700 dark:text-green-300">Todas as faturas pagas!</p>
                            </CardContent>
                          </Card>
                        );
                      }
                      return (
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {invoices.map((invoice) => (
                            <div 
                              key={invoice.referenceMonth}
                              className={cn(
                                "flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors",
                                invoice.status === 'overdue' && "border-red-300 bg-red-50 dark:bg-red-950",
                                invoice.status === 'pending' && "border-yellow-300 bg-yellow-50 dark:bg-yellow-950",
                                invoice.status === 'upcoming' && "border-blue-300 bg-blue-50 dark:bg-blue-950"
                              )}
                              onClick={() => openPayInvoice(invoice)}
                            >
                              <div>
                                <p className="font-medium">
                                  {new Date(invoice.referenceMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Vence: {invoice.dueDate.toLocaleDateString('pt-BR')}
                                </p>
                              </div>
                              <div className="text-right flex items-center gap-2">
                                <div>
                                  <p className="font-bold">R$ {invoice.amount.toFixed(2)}</p>
                                  <Badge variant={
                                    invoice.status === 'overdue' ? 'destructive' :
                                    invoice.status === 'pending' ? 'outline' :
                                    'secondary'
                                  } className="text-xs">
                                    {invoice.status === 'overdue' ? `⚠️ Vencida há ${Math.abs(invoice.daysUntilDue)} dias` :
                                     invoice.status === 'pending' ? `⏳ Vence em ${invoice.daysUntilDue} dias` :
                                     '🔜 Antecipar'}
                                  </Badge>
                                </div>
                                <Button size="sm" variant={invoice.status === 'overdue' ? 'destructive' : 'outline'}>
                                  {invoice.status === 'overdue' ? 'Pagar' : 
                                   invoice.status === 'pending' ? 'Confirmar' : 
                                   'Antecipar'}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Histórico de Pagamentos */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Histórico de Pagamentos
                  </h3>
                  {clientDetails.paymentHistory && clientDetails.paymentHistory.length === 0 ? (
                    <Card>
                      <CardContent className="p-4 text-center text-muted-foreground">
                        Nenhum pagamento registrado
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {clientDetails.paymentHistory && clientDetails.paymentHistory.map((payment, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-center justify-between p-3 border rounded-lg bg-green-50/50 dark:bg-green-950/20"
                        >
                          <div>
                            <p className="font-medium">R$ {payment.amount}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(payment.paidAt || payment.createdAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <Badge className="bg-green-500">Pago</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ações */}
                <Separator />
                <div className="space-y-3">
                  <h3 className="font-semibold">Ações</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Reset de Senha */}
                    <Dialog open={isResetPasswordOpen} onOpenChange={setIsResetPasswordOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full gap-2">
                          <Key className="h-4 w-4" />
                          Resetar Senha
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Resetar Senha do Cliente</DialogTitle>
                          <DialogDescription>
                            Gere uma nova senha para {clientDetails.user?.name}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Nova Senha (deixe em branco para gerar automaticamente)</Label>
                            <Input
                              type="text"
                              value={newPasswordForReset}
                              onChange={(e) => setNewPasswordForReset(e.target.value)}
                              placeholder="Deixe vazio para gerar automaticamente"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsResetPasswordOpen(false)}>
                            Cancelar
                          </Button>
                          <Button 
                            onClick={handleResetPassword}
                            disabled={resetPasswordMutation.isPending}
                          >
                            {resetPasswordMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Resetar Senha
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* Dialog de Confirmar Pagamento */}
                    <Dialog open={isMarkPaidOpen} onOpenChange={(open) => {
                      setIsMarkPaidOpen(open);
                      if (!open) setSelectedInvoice(null);
                    }}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Confirmar Pagamento</DialogTitle>
                          <DialogDescription>
                            {selectedInvoice && (
                              <>
                                Confirme o recebimento da fatura de{' '}
                                <strong>{new Date(selectedInvoice.referenceMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong>
                              </>
                            )}
                          </DialogDescription>
                        </DialogHeader>
                        {selectedInvoice && (
                          <div className="space-y-4 py-4">
                            <div className={cn(
                              "p-4 rounded-lg border-2",
                              selectedInvoice.status === 'overdue' && "border-red-300 bg-red-50 dark:bg-red-950",
                              selectedInvoice.status === 'pending' && "border-yellow-300 bg-yellow-50 dark:bg-yellow-950",
                              selectedInvoice.status === 'upcoming' && "border-blue-300 bg-blue-50 dark:bg-blue-950"
                            )}>
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className="text-sm text-muted-foreground">Valor da Fatura</p>
                                  <p className="text-2xl font-bold">R$ {selectedInvoice.amount.toFixed(2)}</p>
                                </div>
                                <Badge variant={selectedInvoice.status === 'overdue' ? 'destructive' : 'outline'}>
                                  {selectedInvoice.status === 'overdue' ? '⚠️ Vencida' :
                                   selectedInvoice.status === 'pending' ? '⏳ A vencer' :
                                   '🔜 Antecipação'}
                                </Badge>
                              </div>
                              <div className="mt-2 text-sm text-muted-foreground">
                                <p>Vencimento: {selectedInvoice.dueDate.toLocaleDateString('pt-BR')}</p>
                                <p>Referência: {new Date(selectedInvoice.referenceMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Observação (opcional)</Label>
                              <Input
                                value={markPaidDescription}
                                onChange={(e) => setMarkPaidDescription(e.target.value)}
                                placeholder="Ex: PIX recebido, Dinheiro..."
                              />
                            </div>
                          </div>
                        )}
                        <DialogFooter>
                          <Button variant="outline" onClick={() => {
                            setIsMarkPaidOpen(false);
                            setSelectedInvoice(null);
                          }}>
                            Cancelar
                          </Button>
                          <Button 
                            onClick={handleMarkAsPaid}
                            disabled={markAsPaidMutation.isPending}
                            variant={selectedInvoice?.status === 'overdue' ? 'destructive' : 'default'}
                          >
                            {markAsPaidMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            ✅ Confirmar Pagamento
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* Suspender/Reativar */}
                    {clientDetails.client.status === 'active' && (
                      <Button 
                        variant="outline" 
                        className="w-full gap-2 text-orange-600 hover:text-orange-700"
                        onClick={() => {
                          suspendClientMutation.mutate(selectedClientId!);
                          closeClientDetails();
                        }}
                      >
                        <Pause className="h-4 w-4" />
                        Suspender
                      </Button>
                    )}
                    {clientDetails.client.status === 'suspended' && (
                      <Button 
                        variant="outline" 
                        className="w-full gap-2 text-green-600 hover:text-green-700"
                        onClick={() => {
                          reactivateClientMutation.mutate(selectedClientId!);
                          closeClientDetails();
                        }}
                      >
                        <Play className="h-4 w-4" />
                        Reativar
                      </Button>
                    )}

                    {/* Cancelar */}
                    {clientDetails.client.status !== 'cancelled' && (
                      <Button 
                        variant="outline" 
                        className="w-full gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          if (confirm('Tem certeza que deseja cancelar este cliente? Esta ação não pode ser desfeita.')) {
                            cancelClientMutation.mutate(selectedClientId!);
                            closeClientDetails();
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Cancelar Cliente
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Cliente não encontrado
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ✅ Modal de Upload de Comprovante PIX - "Já paguei" (Checkout de Novo Cliente) */}
      <Dialog open={showReceiptUploadModal} onOpenChange={setShowReceiptUploadModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Enviar Comprovante de Pagamento
            </DialogTitle>
            <DialogDescription>
              Envie o comprovante do PIX para liberarmos o acesso do cliente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {receiptUploadSuccess ? (
              <div className="text-center py-6">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
                <p className="font-medium text-green-600">Comprovante enviado com sucesso!</p>
                <p className="text-sm text-muted-foreground mt-1">O pagamento será confirmado em breve pelo administrador.</p>
              </div>
            ) : (
              <>
                <div
                  onClick={() => receiptInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                >
                  <input
                    ref={receiptInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleReceiptFileChange}
                    className="hidden"
                  />
                  {receiptFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileImage className="h-10 w-10 text-green-500" />
                      <span className="text-sm font-medium">{receiptFile.name}</span>
                      <span className="text-xs text-gray-500">{(receiptFile.size / 1024).toFixed(1)} KB</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-10 w-10 text-gray-400" />
                      <span className="text-sm text-gray-500">Clique para selecionar o comprovante</span>
                      <span className="text-xs text-gray-400">Imagem ou PDF (máx. 5MB)</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => { setShowReceiptUploadModal(false); setReceiptFile(null); }}>Cancelar</Button>
                  <Button className="flex-1" onClick={handleReceiptUpload} disabled={!receiptFile || isUploadingReceipt}>
                    {isUploadingReceipt ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : <><Upload className="h-4 w-4 mr-2" />Enviar</>}
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

// Componente de Página de Detalhes do Cliente
function ClientDetailsPage({ clientId, setLocation }: { clientId: string; setLocation: (loc: string) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Estado para modal de pagamento PIX (QR Code Mercado Pago)
  const [showPixDialog, setShowPixDialog] = useState(false);
  const [showAnnualDialog, setShowAnnualDialog] = useState(false);
  const [pixData, setPixData] = useState<{
    qrCode: string;
    qrCodeBase64: string;
    ticketUrl?: string;
    paymentId: number;
    amount: number;
    expirationDate: string;
    clientName?: string;
  } | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [annualDiscountPercent] = useState(5);

  // Estado para upload de comprovante ("Já paguei") no ClientDetailsPage
  const [showClientReceiptModal, setShowClientReceiptModal] = useState(false);
  const [clientReceiptFile, setClientReceiptFile] = useState<File | null>(null);
  const [isUploadingClientReceipt, setIsUploadingClientReceipt] = useState(false);
  const [clientReceiptSuccess, setClientReceiptSuccess] = useState(false);

  // Buscar detalhes completos do cliente
  const { data: clientDetails, isLoading, refetch, error: queryError, isError } = useQuery<ClientDetails>({
    queryKey: ["/api/reseller/clients", clientId, "details"],
    queryFn: async () => {
      console.log("[ClientDetailsPage] Fetching client details for:", clientId);
      const res = await apiRequest("GET", `/api/reseller/clients/${clientId}/details`);
      const data = await res.json();
      console.log("[ClientDetailsPage] Got data keys:", Object.keys(data));
      console.log("[ClientDetailsPage] Has subscriptionView:", !!data.subscriptionView);
      console.log("[ClientDetailsPage] subscriptionView:", JSON.stringify(data.subscriptionView));
      return data;
    },
    enabled: !!clientId,
    retry: 3,
    staleTime: 0,
  });

  // Log para debug
  console.log("[ClientDetailsPage] State - clientId:", clientId, "isLoading:", isLoading, "isError:", isError, "hasClientDetails:", !!clientDetails);
  if (clientDetails) {
    console.log("[ClientDetailsPage] clientDetails keys:", Object.keys(clientDetails));
  }

  // Mutation para ações no cliente
  const suspendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/suspend`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients", clientId, "details"] });
      toast({ title: "Cliente suspenso com sucesso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao suspender cliente", description: error.message, variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/reactivate`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients", clientId, "details"] });
      toast({ title: "Cliente reativado com sucesso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao reativar cliente", description: error.message, variant: "destructive" });
    },
  });

  // Estado e mutation para reset de senha
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState("");

  const resetPasswordMutationDetails = useMutation({
    mutationFn: async (newPassword?: string) => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/reset-password`, {
        newPassword: newPassword || undefined,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "✅ Senha gerada com sucesso!",
        description: `Nova senha: ${data.newPassword}`,
      });
      setShowResetPasswordDialog(false);
      setResetPasswordValue("");
    },
    onError: (error: any) => {
      toast({ title: "Erro ao gerar senha", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para pagamento antecipado (adiciona 30 dias)
  const payAheadMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/pay-ahead`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients", clientId, "details"] });
      toast({ 
        title: "Pagamento processado", 
        description: `SaaS estendido até ${new Date(data.saasPaidUntil).toLocaleDateString('pt-BR')}` 
      });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao processar pagamento", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para pagamento anual (adiciona 365 dias)
  const payAnnualMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/pay-annual`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients", clientId, "details"] });
      toast({ 
        title: "Pagamento anual processado", 
        description: `SaaS estendido até ${new Date(data.saasPaidUntil).toLocaleDateString('pt-BR')}` 
      });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao processar pagamento anual", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para gerar PIX mensal (QR Code Mercado Pago - revendedor paga ao dono do sistema)
  const generatePixMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/generate-pix`);
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
          clientName: data.clientName,
        });
        setShowPixDialog(true);
        toast({
          title: "PIX Gerado!",
          description: "Escaneie o QR Code para pagar",
        });
      } else {
        toast({
          title: "Erro",
          description: data.message || "Erro ao gerar PIX",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao gerar PIX", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para gerar PIX anual (QR Code Mercado Pago - 12 meses com desconto)
  const generateAnnualPixMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/generate-annual-pix`, {
        discountPercent: annualDiscountPercent,
      });
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
          clientName: data.clientName,
        });
        setShowAnnualDialog(false);
        setShowPixDialog(true);
        toast({
          title: "PIX Anual Gerado!",
          description: `Valor com ${data.discountPercent}% desconto: R$ ${data.amount.toFixed(2)}`,
        });
      } else {
        toast({
          title: "Erro",
          description: data.message || "Erro ao gerar PIX anual",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao gerar PIX anual", description: error.message, variant: "destructive" });
    },
  });

  // Countdown timer for PIX expiration
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

  // Copiar código PIX
  const copyPixCode = async () => {
    if (pixData?.qrCode) {
      try {
        await navigator.clipboard.writeText(pixData.qrCode);
        toast({ title: "Copiado!", description: "Código PIX copiado para a área de transferência" });
      } catch (err) {
        toast({ title: "Erro", description: "Não foi possível copiar", variant: "destructive" });
      }
    }
  };

  // Upload de comprovante para renovação de cliente
  const uploadClientReceiptMutation = useMutation({
    mutationFn: async ({ file, paymentId, amount }: { file: File; paymentId: string | number; amount: number }) => {
      const formData = new FormData();
      formData.append("receipt", file);
      formData.append("paymentId", String(paymentId));
      formData.append("amount", amount.toString());
      formData.append("contextKind", "client_renewal");
      formData.append("clientId", clientId); // Para o admin saber qual cliente renovar
      const response = await fetch("/api/reseller/payment-receipts/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao enviar comprovante");
      }
      return response.json();
    },
    onSuccess: () => {
      setClientReceiptSuccess(true);
      toast({ title: "✅ Comprovante enviado!", description: "Aguarde a confirmação pelo administrador." });
      setTimeout(() => {
        setShowClientReceiptModal(false);
        setClientReceiptFile(null);
        setClientReceiptSuccess(false);
        setShowPixDialog(false);
      }, 2500);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao enviar comprovante", description: error.message, variant: "destructive" });
    },
  });

  const handleClientReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
      if (!validTypes.includes(file.type)) {
        toast({ title: "Formato inválido", description: "Envie uma imagem (JPG, PNG, GIF, WebP) ou PDF.", variant: "destructive" });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Arquivo muito grande", description: "Máximo 5MB.", variant: "destructive" });
        return;
      }
      setClientReceiptFile(file);
    }
  };

  const handleClientReceiptUpload = async () => {
    if (!clientReceiptFile || !pixData) return;
    setIsUploadingClientReceipt(true);
    try {
      await uploadClientReceiptMutation.mutateAsync({
        file: clientReceiptFile,
        paymentId: pixData.paymentId,
        amount: pixData.amount,
      });
    } finally {
      setIsUploadingClientReceipt(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!clientDetails || !clientDetails.client || !clientDetails.subscriptionView) {
    console.log("[ClientDetailsPage] Missing data:", {
      hasClientDetails: !!clientDetails,
      hasClient: !!clientDetails?.client,
      hasSubscriptionView: !!clientDetails?.subscriptionView,
      keys: clientDetails ? Object.keys(clientDetails) : []
    });
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Cliente não encontrado</p>
          <Button className="mt-4" onClick={() => setLocation("/revenda/clientes")}>
            Voltar para Lista
          </Button>
        </CardContent>
      </Card>
    );
  }

  const client = clientDetails.client;
  const user = clientDetails.user;
  const subscriptionView = clientDetails.subscriptionView;
  const plan = clientDetails.plan || { nome: 'Padrão', valor: '0', descricao: '' };
  const stats = clientDetails.stats || { totalPaid: 0, totalPayments: 0, approvedPayments: 0, monthsInSystem: 0, totalConversations: 0 };
  const reseller = clientDetails.reseller || { companyName: '' };
  const paymentHistory = clientDetails.paymentHistory || [];

  // Helper para formatar moeda
  const formatCurrency = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return "R$ 0,00";
    const numericValue = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(numericValue)) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(numericValue);
  };

  // Helper para formatar data
  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "Não definido";
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  // Status Badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500 text-white text-lg py-1 px-3">✅ Ativo</Badge>;
      case 'overdue':
        return <Badge className="bg-red-500 text-white text-lg py-1 px-3">⚠️ Vencido</Badge>;
      case 'suspended':
        return <Badge className="bg-orange-500 text-white text-lg py-1 px-3">⏸️ Suspenso</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-500 text-white text-lg py-1 px-3">❌ Cancelado</Badge>;
      default:
        return <Badge variant="secondary" className="text-lg py-1 px-3">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com navegação */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => setLocation("/revenda/clientes")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                {user?.name?.charAt(0).toUpperCase() || 'C'}
              </div>
              {user?.name || 'Cliente'}
            </h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Status Cards - Igual ao Minha Assinatura */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                {getStatusBadge(subscriptionView.status)}
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
                <p className={`text-2xl font-bold ${subscriptionView.daysRemaining <= 5 ? 'text-red-500' : ''}`}>
                  {subscriptionView.daysRemaining}
                </p>
              </div>
              <Calendar className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Pago</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalPaid)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Meses no Sistema</p>
                <p className="text-2xl font-bold">{stats.monthsInSystem}</p>
              </div>
              <Clock className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Próxima Fatura - Card Destacado igual Minha Assinatura */}
      <Card className="md:col-span-2 border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="w-5 h-5 text-primary" />
            Próxima Fatura
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const nextPayment = subscriptionView.nextPaymentDate ? new Date(subscriptionView.nextPaymentDate) : null;
            const isOverdue = subscriptionView.isOverdue;
            const monthlyValue = parseFloat(plan.valor || "0");
            
            return (
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-full ${isOverdue ? 'bg-red-100' : 'bg-primary/10'}`}>
                    <Calendar className={`w-6 h-6 ${isOverdue ? 'text-red-600' : 'text-primary'}`} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Vencimento</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-bold">
                        {nextPayment ? formatDate(subscriptionView.nextPaymentDate) : "Não definido"}
                      </p>
                      {isOverdue && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          VENCIDA
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Gerenciado por {reseller.companyName}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Valor Mensal</p>
                    <p className="text-2xl font-bold text-primary">
                      {formatCurrency(monthlyValue)}
                    </p>
                    <p className="text-xs text-muted-foreground">Seu custo por este cliente</p>
                  </div>
                  
                  {/* Botões de Ação */}
                  <div className="flex flex-col gap-2">
                    <Button 
                      onClick={() => payAheadMutation.mutate()}
                      disabled={payAheadMutation.isPending}
                      className={isOverdue ? "bg-red-600 hover:bg-red-700" : ""}
                    >
                      {payAheadMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 mr-2" />
                          {isOverdue ? "Pagar Agora" : "Pagar Antecipado"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Grid de Detalhes e Ações */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Detalhes do Plano */}
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
              <span className="font-medium">{plan.nome}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Valor</span>
              <span className="font-medium">
                {formatCurrency(parseFloat(plan.valor))}
                <span className="text-sm text-muted-foreground">/mês</span>
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Data de Início</span>
              <span className="font-medium">
                {formatDate(subscriptionView.dataInicio)}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Válido até</span>
              <span className={`font-medium ${subscriptionView.isOverdue ? 'text-red-500' : ''}`}>
                {formatDate(subscriptionView.dataFim)}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Conversas</span>
              <span className="font-medium">{stats.totalConversations}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">Cliente Gratuito</span>
              <Badge variant={client.isFreeClient ? 'default' : 'secondary'}>
                {client.isFreeClient ? 'Sim' : 'Não'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Ações do Cliente - PIX QR Code Mercado Pago (revendedor paga ao dono do sistema) */}
        <Card>
          <CardHeader>
            <CardTitle>💳 Pagar Mensalidade</CardTitle>
            <CardDescription>Pague a mensalidade deste cliente via PIX instantâneo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Seção PIX QR Code - apenas para clientes pagos */}
            {!client.isFreeClient && (
              <>
                {/* Card de Pagamento Mensal - Destaque Principal */}
                <div className="p-5 border-2 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-300 dark:border-green-700 shadow-sm">
                  <div className="text-center mb-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/50 mb-3">
                      <QrCode className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="text-xl font-bold text-green-800 dark:text-green-200">
                      Pagar Mensalidade
                    </h3>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Gere o QR Code PIX e pague instantaneamente
                    </p>
                  </div>
                  
                  {/* Valor em destaque */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 text-center shadow-inner">
                    <p className="text-sm text-muted-foreground mb-1">Valor mensal:</p>
                    <p className="text-4xl font-bold text-green-600">
                      {formatCurrency(parseFloat(plan.valor || '0'))}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Cliente: {user?.name || user?.email}
                    </p>
                  </div>
                  
                  {/* Botão Gerar PIX */}
                  <Button 
                    className="w-full h-14 text-lg bg-green-600 hover:bg-green-700 shadow-lg"
                    onClick={() => generatePixMutation.mutate()}
                    disabled={generatePixMutation.isPending}
                  >
                    {generatePixMutation.isPending ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Gerando PIX...
                      </>
                    ) : (
                      <>
                        <QrCode className="h-5 w-5 mr-2" />
                        Gerar QR Code PIX
                      </>
                    )}
                  </Button>
                  
                  <p className="text-xs text-center text-green-700 dark:text-green-300 mt-3">
                    ⚡ Pagamento confirmado automaticamente em segundos
                  </p>
                </div>
                
                {/* Card de Pagamento Anual */}
                <div className="p-4 border-2 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-300 dark:border-blue-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/50">
                        <Gift className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-blue-800 dark:text-blue-200">
                          Pagar 12 Meses
                        </p>
                        <p className="text-sm text-blue-600 dark:text-blue-400">
                          {annualDiscountPercent}% de desconto!
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground line-through">
                        {formatCurrency(parseFloat(plan.valor || '0') * 12)}
                      </p>
                      <p className="text-lg font-bold text-blue-600">
                        {formatCurrency(parseFloat(plan.valor || '0') * 12 * (1 - annualDiscountPercent / 100))}
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    className="w-full mt-3 border-blue-400 text-blue-700 hover:bg-blue-50"
                    onClick={() => setShowAnnualDialog(true)}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Pagar Anual com PIX
                  </Button>
                </div>
              </>
            )}
            
            {/* Cliente Gratuito - sem opção de pagamento */}
            {client.isFreeClient && (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg text-center">
                <Gift className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-medium text-emerald-700 dark:text-emerald-300">
                  🎁 Cliente Gratuito
                </p>
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  Este cliente não precisa pagar mensalidade
                </p>
              </div>
            )}

            <Separator />

            {/* Ações de Gerenciamento */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Gerenciamento</p>
              
              {/* Suspender/Reativar */}
              {client.status === 'active' || client.status === 'overdue' ? (
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                  onClick={() => suspendMutation.mutate()}
                  disabled={suspendMutation.isPending}
                >
                  {suspendMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Pause className="h-4 w-4 mr-2" />
                  )}
                  Suspender Cliente
                </Button>
              ) : client.status === 'suspended' ? (
                <Button 
                  variant="outline"
                  className="w-full justify-start text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={() => reactivateMutation.mutate()}
                  disabled={reactivateMutation.isPending}
                >
                  {reactivateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Reativar Cliente
                </Button>
              ) : null}
              
              {/* Confirmar pagamento manual recebido */}
              <Button 
                variant="outline"
                className="w-full justify-start"
                onClick={() => payAheadMutation.mutate()}
                disabled={payAheadMutation.isPending}
              >
                {payAheadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Confirmar Pagamento Manual (+30 dias)
              </Button>
              
              {/* Gerar Nova Senha */}
              <Button 
                variant="outline"
                className="w-full justify-start text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                onClick={() => setShowResetPasswordDialog(true)}
              >
                <Key className="h-4 w-4 mr-2" />
                Gerar Nova Senha
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Reset de Senha */}
      <Dialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Gerar Nova Senha
            </DialogTitle>
            <DialogDescription>
              Gere uma nova senha para {user?.name || user?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nova Senha (deixe em branco para gerar automaticamente)</Label>
              <Input
                type="text"
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                placeholder="Deixe vazio para gerar automaticamente"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPasswordDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => resetPasswordMutationDetails.mutate(resetPasswordValue || undefined)}
              disabled={resetPasswordMutationDetails.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {resetPasswordMutationDetails.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gerar Nova Senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de PIX QR Code - Igual ao /minha-assinatura */}
      <Dialog open={showPixDialog} onOpenChange={setShowPixDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center flex items-center justify-center gap-2">
              <QrCode className="h-5 w-5 text-green-600" />
              Pagamento via PIX
            </DialogTitle>
            <DialogDescription className="text-center">
              Escaneie o QR Code ou copie o código para pagar
            </DialogDescription>
          </DialogHeader>
          
          {pixData && (
            <div className="space-y-4">
              {/* QR Code */}
              <div className="flex justify-center">
                {pixData.qrCodeBase64 && (
                  <img 
                    src={pixData.qrCodeBase64.startsWith('data:') ? pixData.qrCodeBase64 : `data:image/png;base64,${pixData.qrCodeBase64}`}
                    alt="QR Code PIX"
                    className="w-52 h-52 border-4 border-green-200 rounded-xl shadow-lg"
                  />
                )}
              </div>
              
              {/* Valor e Timer */}
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="text-xl font-bold text-green-600">
                    R$ {pixData.amount.toFixed(2)}
                  </p>
                </div>
                <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Expira em</p>
                  <p className={`text-xl font-mono font-bold ${timeLeft === "Expirado" ? "text-red-500" : "text-yellow-600"}`}>
                    {timeLeft}
                  </p>
                </div>
              </div>
              
              {/* Cliente */}
              {pixData.clientName && (
                <div className="text-center p-2 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Pagamento para cliente: <span className="font-medium">{pixData.clientName}</span>
                  </p>
                </div>
              )}
              
              {/* Botão Copiar */}
              <Button 
                variant="outline" 
                className="w-full h-12" 
                onClick={copyPixCode}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copiar Código PIX
              </Button>
              
              {/* Abrir no App */}
              {pixData.ticketUrl && (
                <Button 
                  variant="secondary"
                  className="w-full"
                  onClick={() => window.open(pixData.ticketUrl, '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir no App do Banco
                </Button>
              )}
              
              {/* Status */}
              <div className="flex items-center justify-center gap-2 py-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200">
                <Clock className="w-4 h-4 text-yellow-600 animate-pulse" />
                <span className="text-sm text-yellow-700 dark:text-yellow-300">
                  Aguardando pagamento...
                </span>
              </div>

              {/* Botão "Já paguei" - Enviar comprovante */}
              <div className="border-t pt-4">
                <p className="text-xs text-center text-muted-foreground mb-2">
                  Já fez o pagamento por outra via?
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowClientReceiptModal(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Já paguei — Enviar comprovante
                </Button>
              </div>
              
              <p className="text-xs text-center text-muted-foreground">
                O PIX expira em 30 minutos. Após o pagamento, o sistema atualizará automaticamente.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Upload de Comprovante para Renovação de Cliente */}
      <Dialog open={showClientReceiptModal} onOpenChange={setShowClientReceiptModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Enviar Comprovante de Pagamento
            </DialogTitle>
            <DialogDescription>
              Envie o comprovante do seu pagamento PIX. O administrador irá confirmar e ativar o cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {clientReceiptSuccess ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <p className="text-lg font-semibold text-green-700">Comprovante enviado!</p>
                <p className="text-sm text-muted-foreground text-center">
                  Aguarde a confirmação do administrador para ativar o cliente.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="client-receipt-file">Comprovante (JPG, PNG, PDF)</Label>
                  <Input
                    id="client-receipt-file"
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                    onChange={handleClientReceiptFileChange}
                    className="cursor-pointer"
                  />
                  {clientReceiptFile && (
                    <p className="text-xs text-muted-foreground">
                      Arquivo: {clientReceiptFile.name} ({(clientReceiptFile.size / 1024).toFixed(0)} KB)
                    </p>
                  )}
                </div>
                {pixData && (
                  <div className="p-3 bg-muted/50 rounded-lg text-sm">
                    <p>Valor: <strong>R$ {pixData.amount.toFixed(2)}</strong></p>
                    {pixData.clientName && <p>Cliente: <strong>{pixData.clientName}</strong></p>}
                  </div>
                )}
              </>
            )}
          </div>
          {!clientReceiptSuccess && (
            <DialogFooter className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowClientReceiptModal(false); setClientReceiptFile(null); }}>
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={handleClientReceiptUpload}
                disabled={!clientReceiptFile || isUploadingClientReceipt}
              >
                {isUploadingClientReceipt ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : <><Upload className="h-4 w-4 mr-2" />Enviar</>}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação Pagamento Anual */}
      <Dialog open={showAnnualDialog} onOpenChange={setShowAnnualDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">🎁 Pagamento Anual</DialogTitle>
            <DialogDescription className="text-center">
              Pague 12 meses antecipados e ganhe {annualDiscountPercent}% de desconto!
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Comparativo de valores */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted/30 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Valor Normal (12x)</p>
                <p className="text-lg font-medium line-through text-muted-foreground">
                  {formatCurrency(parseFloat(plan.valor || '0') * 12)}
                </p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg text-center border-2 border-green-300">
                <p className="text-xs text-green-600">Com Desconto</p>
                <p className="text-xl font-bold text-green-600">
                  {formatCurrency(parseFloat(plan.valor || '0') * 12 * (1 - annualDiscountPercent / 100))}
                </p>
              </div>
            </div>
            
            {/* Economia */}
            <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                💰 Você economiza: {formatCurrency(parseFloat(plan.valor || '0') * 12 * (annualDiscountPercent / 100))}
              </p>
            </div>
            
            {/* Botões */}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setShowAnnualDialog(false)}
              >
                Cancelar
              </Button>
              <Button 
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={() => generateAnnualPixMutation.mutate()}
                disabled={generateAnnualPixMutation.isPending}
              >
                {generateAnnualPixMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <QrCode className="h-4 w-4 mr-2" />
                )}
                Gerar PIX Anual
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Histórico de Pagamentos - Tabela Igual Minha Assinatura */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Histórico de Pagamentos
          </CardTitle>
          <CardDescription>
            Pagamentos realizados por este cliente
          </CardDescription>
        </CardHeader>
        <CardContent>
          {paymentHistory.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentHistory.map((payment, idx) => (
                  <TableRow key={payment.id || idx}>
                    <TableCell>
                      {new Date(payment.paidAt || payment.createdAt).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {payment.description || `Mensalidade ${payment.referenceMonth}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {payment.paymentMethod === 'activation' ? '🎉 Ativação' :
                         payment.paymentMethod === 'pix' ? '💠 PIX' :
                         payment.paymentMethod === 'manual' ? '✋ Manual' :
                         payment.paymentMethod}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-green-500">
                        ✅ {payment.status === 'approved' ? 'Pago' : payment.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum pagamento registrado</p>
              <p className="text-xs mt-1">Os pagamentos aparecerão aqui quando processados</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informações do Cliente e WhatsApp */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Info do Cliente */}
        <Card>
          <CardHeader>
            <CardTitle>Informações do Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Nome</span>
              <span className="font-medium">{user?.name || '-'}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user?.email || '-'}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Telefone</span>
              <span className="font-medium">{user?.phone || '-'}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">ID do Cliente</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">{client.id}</code>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">Criado em</span>
              <span className="font-medium">{formatDate(client.createdAt)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Status WhatsApp */}
        <Card>
          <CardHeader>
            <CardTitle>Conexão WhatsApp</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                clientDetails.connection?.isConnected ? 'bg-green-100' : 'bg-gray-100'
              }`}>
                <Phone className={`w-6 h-6 ${
                  clientDetails.connection?.isConnected ? 'text-green-600' : 'text-gray-400'
                }`} />
              </div>
              <div>
                <p className="font-medium">
                  {clientDetails.connection?.isConnected ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
                </p>
                {clientDetails.connection?.phoneNumber && (
                  <p className="text-sm text-muted-foreground">
                    {clientDetails.connection.phoneNumber}
                  </p>
                )}
              </div>
              <Badge 
                variant={clientDetails.connection?.isConnected ? 'default' : 'secondary'}
                className="ml-auto"
              >
                {clientDetails.connection?.isConnected ? '🟢 Online' : '⚫ Offline'}
              </Badge>
            </div>
            
            {/* Estatísticas de uso */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-2xl font-bold text-primary">{stats.totalConversations}</p>
                <p className="text-xs text-muted-foreground">Conversas</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-2xl font-bold text-primary">{stats.totalPayments}</p>
                <p className="text-xs text-muted-foreground">Pagamentos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Componente separado para a aba "Minha Assinatura"
function MySubscriptionTab({ 
  profile,
  selectedClientIds,
  setSelectedClientIds,
  createGranularInvoiceMutation,
  isCreatingGranularInvoice,
  setIsCreatingGranularInvoice,
  isGranularCheckoutOpen,
  setIsGranularCheckoutOpen,
  granularPixCode,
  setGranularPixCode,
  granularPixQrCode,
  setGranularPixQrCode,
  granularTotalAmount,
  setGranularTotalAmount,
  setLocation
}: { 
  profile: ResellerProfile | undefined;
  selectedClientIds: string[];
  setSelectedClientIds: (ids: string[]) => void;
  createGranularInvoiceMutation: any;
  isCreatingGranularInvoice: boolean;
  setIsCreatingGranularInvoice: (val: boolean) => void;
  isGranularCheckoutOpen: boolean;
  setIsGranularCheckoutOpen: (val: boolean) => void;
  granularPixCode: string;
  setGranularPixCode: (val: string) => void;
  granularPixQrCode: string;
  setGranularPixQrCode: (val: string) => void;
  granularTotalAmount: number;
  setGranularTotalAmount: (val: number) => void;
  setLocation: (loc: string) => void;
}) {
  const { toast } = useToast();
  const [isPayPixOpen, setIsPayPixOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [pixData, setPixData] = useState<{
    qrCode: string;
    qrCodeBase64: string;
    amount: number;
    referenceMonth: string;
  } | null>(null);
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);

  // Buscar dados da assinatura do revendedor
  const { data: subscription, isLoading, refetch } = useQuery<ResellerSubscription>({
    queryKey: ["/api/reseller/my-subscription"],
    refetchInterval: 30000, // Atualizar a cada 30 segundos
  });

  // Buscar histórico de faturas
  const { data: invoices, isLoading: isLoadingInvoices } = useQuery<ResellerInvoice[]>({
    queryKey: ["/api/reseller/my-invoices"],
  });

  // Buscar lista de clientes para mostrar faturas individuais
  const { data: clients } = useQuery<ResellerClient[]>({
    queryKey: ["/api/reseller/clients"],
  });

  // Gerar PIX para pagamento
  const generatePix = async (invoiceId: number) => {
    setIsGeneratingPix(true);
    try {
      const response = await apiRequest("POST", `/api/reseller/my-invoices/${invoiceId}/pay-pix`);
      const data = await response.json();
      setPixData(data);
      setSelectedInvoiceId(invoiceId);
      setIsPayPixOpen(true);
    } catch (error: any) {
      toast({
        title: "Erro ao gerar PIX",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPix(false);
    }
  };

  // Verificar status do pagamento
  const checkPayment = async (invoiceId: number) => {
    setIsCheckingPayment(true);
    try {
      const response = await apiRequest("GET", `/api/reseller/my-invoices/${invoiceId}/check-payment`);
      const data = await response.json();
      if (data.status === 'paid') {
        toast({
          title: "Pagamento confirmado!",
          description: "Sua fatura foi paga com sucesso.",
        });
        setIsPayPixOpen(false);
        setPixData(null);
        refetch();
      } else {
        toast({
          title: "Pagamento ainda não confirmado",
          description: "Continue aguardando ou tente novamente em alguns segundos.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro ao verificar pagamento",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCheckingPayment(false);
    }
  };

  // Copiar código PIX
  const copyPixCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "Copiado!",
      description: "Código PIX copiado para a área de transferência",
    });
  };

  // Formatar mês de referência
  const formatMonth = (monthStr: string | undefined | null) => {
    if (!monthStr) return 'Mês indisponível';
    const parts = monthStr.split('-');
    if (parts.length !== 2) return monthStr;
    const [year, month] = parts;
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const monthIndex = parseInt(month) - 1;
    if (monthIndex < 0 || monthIndex > 11) return monthStr;
    return `${months[monthIndex]}/${year}`;
  };

  // Status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500">Pago</Badge>;
      case 'pending':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Pendente</Badge>;
      case 'overdue':
        return <Badge variant="destructive">Vencido</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Explicação clara da hierarquia */}
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Users className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-100">Gestão de Clientes - Cobranças Individuais</p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Selecione clientes para gerar cobranças personalizadas. Cada cliente: <strong>R$ 49,99/mês</strong>. 
                Acompanhe pagamentos, vencimentos e status em um só lugar.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">� Gestão de Clientes</h2>
          <p className="text-sm text-muted-foreground">
            Selecione clientes e gere cobranças personalizadas (R$ 49,99/cliente)
          </p>
        </div>
        <div className="flex gap-2">
          {selectedClientIds.length > 0 && (
            <Button 
              onClick={() => {
                setIsCreatingGranularInvoice(true);
                createGranularInvoiceMutation.mutate(selectedClientIds);
              }}
              disabled={isCreatingGranularInvoice}
              className="bg-green-600 hover:bg-green-700"
            >
              {isCreatingGranularInvoice ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CreditCard className="h-4 w-4 mr-2" />
              )}
              Pagar Selecionados ({selectedClientIds.length})
            </Button>
          )}
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Tabela de Clientes com Seleção */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Seus Clientes
          </CardTitle>
          <CardDescription>
            Selecione clientes para gerar cobranças ou acesse detalhes individuais
          </CardDescription>
        </CardHeader>
        <CardContent>
          {clients && clients.length > 0 ? (
            <div className="space-y-4">
              {/* Checkbox de selecionar todos e botão Pagar Todos */}
              <div className="flex items-center justify-between pb-2 border-b">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 cursor-pointer"
                    checked={selectedClientIds.length === clients.length && clients.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedClientIds(clients.map(c => c.id));
                      } else {
                        setSelectedClientIds([]);
                      }
                    }}
                  />
                  <span className="text-sm font-medium">
                    Selecionar Todos ({clients.length})
                  </span>
                </div>
                
                {/* Botão Pagar Todos - aparece quando há seleção */}
                {selectedClientIds.length > 0 && (
                  <Button
                    onClick={() => {
                      setIsCreatingGranularInvoice(true);
                      createGranularInvoiceMutation.mutate(selectedClientIds);
                    }}
                    disabled={isCreatingGranularInvoice}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isCreatingGranularInvoice ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4 mr-2" />
                    )}
                    Pagar Todos ({selectedClientIds.length}) - R$ {(selectedClientIds.length * 49.99).toFixed(2)}
                  </Button>
                )}
              </div>

              {/* Tabela */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Sel.</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Primeiro Pag.</TableHead>
                    <TableHead>Último Pag.</TableHead>
                    <TableHead>Próximo Pag.</TableHead>
                    <TableHead>Meses</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => {
                    const isSelected = selectedClientIds.includes(client.id);
                    const firstPayment = client.firstPaymentDate
                      ? new Date(client.firstPaymentDate).toLocaleDateString('pt-BR')
                      : 'Nunca';
                    const lastPayment = client.lastPaymentDate 
                      ? new Date(client.lastPaymentDate).toLocaleDateString('pt-BR')
                      : 'Nunca';
                    const nextPayment = client.saasPaidUntil
                      ? new Date(client.saasPaidUntil).toLocaleDateString('pt-BR')
                      : '-';
                    const monthsInSystem = client.monthsInSystem || 0;
                    const isOverdue = client.saasPaidUntil 
                      ? new Date(client.saasPaidUntil) < new Date()
                      : false;

                    return (
                      <TableRow 
                        key={client.id}
                        className={cn(
                          "cursor-pointer hover:bg-muted/50",
                          isSelected && "bg-blue-50 dark:bg-blue-950",
                          isOverdue && "bg-red-50 dark:bg-red-950"
                        )}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 cursor-pointer"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedClientIds([...selectedClientIds, client.id]);
                              } else {
                                setSelectedClientIds(selectedClientIds.filter(id => id !== client.id));
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold",
                              client.saasStatus === 'active' && "bg-green-500",
                              client.saasStatus === 'suspended' && "bg-yellow-500",
                              "bg-gray-400"
                            )}>
                              {client.name?.charAt(0).toUpperCase() || 'C'}
                            </div>
                            <div>
                              <p className="font-medium">{client.name}</p>
                              <p className="text-xs text-muted-foreground">{client.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {client.saasStatus === 'active' && (
                            <Badge className="bg-green-500">Ativo</Badge>
                          )}
                          {client.saasStatus === 'suspended' && (
                            <Badge className="bg-yellow-500">Suspenso</Badge>
                          )}
                          {isOverdue && (
                            <Badge variant="destructive" className="ml-1">Atrasado</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{firstPayment}</TableCell>
                        <TableCell className="text-sm">{lastPayment}</TableCell>
                        <TableCell className={cn(
                          "text-sm font-medium",
                          isOverdue && "text-red-600"
                        )}>
                          {nextPayment}
                        </TableCell>
                        <TableCell className="text-sm">{monthsInSystem}</TableCell>
                        <TableCell className="text-sm font-semibold text-green-600">
                          R$ 49,99
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setSelectedClientIds([client.id]);
                                setIsCreatingGranularInvoice(true);
                                createGranularInvoiceMutation.mutate([client.id]);
                              }}
                            >
                              <CreditCard className="h-3 w-3 mr-1" />
                              Pagar
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setSelectedClientIds([client.id]);
                                setIsCreatingGranularInvoice(true);
                                createGranularInvoiceMutation.mutate([client.id]);
                              }}
                            >
                              <Clock className="h-3 w-3 mr-1" />
                              Antecipar
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setSelectedClientIds([client.id]);
                                setIsCreatingGranularInvoice(true);
                                // Criar invoice anual (12x49.99 = 599.88)
                                createGranularInvoiceMutation.mutate([client.id]);
                              }}
                            >
                              <Calendar className="h-3 w-3 mr-1" />
                              Anual
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => setLocation(`/revenda/clientes/${client.id}`)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Detalhes
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Resumo de Seleção */}
              {selectedClientIds.length > 0 && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        {selectedClientIds.length} cliente(s) selecionado(s) × R$ 49,99
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                        = R$ {(selectedClientIds.length * 49.99).toFixed(2)}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">Total a pagar</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Você ainda não tem clientes cadastrados</p>
              <p className="text-sm">Vá para a aba "Clientes" para adicionar seu primeiro cliente</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Pagamento PIX */}
      <Dialog open={isPayPixOpen} onOpenChange={setIsPayPixOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Pagar com PIX
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code ou copie o código PIX
            </DialogDescription>
          </DialogHeader>

          {pixData && (
            <div className="space-y-4">
              {/* Info da fatura */}
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Fatura de</p>
                <p className="text-lg font-semibold">{formatMonth(pixData.referenceMonth)}</p>
                <p className="text-2xl font-bold text-green-600">
                  R$ {pixData.amount.toFixed(2)}
                </p>
              </div>

              {/* QR Code */}
              {pixData.qrCodeBase64 && (
                <div className="flex justify-center">
                  <img 
                    src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                    alt="QR Code PIX"
                    className="w-48 h-48 border rounded-lg"
                  />
                </div>
              )}

              {/* Código PIX para copiar */}
              <div className="space-y-2">
                <Label>Código PIX (Copia e Cola)</Label>
                <div className="flex gap-2">
                  <Input 
                    value={pixData.qrCode} 
                    readOnly 
                    className="text-xs"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => copyPixCode(pixData.qrCode)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Botão de verificar pagamento */}
              <Button 
                className="w-full" 
                onClick={() => selectedInvoiceId && checkPayment(selectedInvoiceId)}
                disabled={isCheckingPayment}
              >
                {isCheckingPayment ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Já paguei! Verificar pagamento
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                O pagamento é processado automaticamente. Se já pagou, clique em verificar.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Checkout Granular PIX */}
      <Dialog open={isGranularCheckoutOpen} onOpenChange={setIsGranularCheckoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Pagamento de Clientes Selecionados
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code ou copie o código PIX para pagar
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Info da cobrança */}
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Total a Pagar</p>
              <p className="text-lg font-semibold">{selectedClientIds.length} cliente(s)</p>
              <p className="text-2xl font-bold text-green-600">
                R$ {granularTotalAmount.toFixed(2)}
              </p>
            </div>

            {/* QR Code */}
            {granularPixQrCode && (
              <div className="flex justify-center">
                <img 
                  src={granularPixQrCode}
                  alt="QR Code PIX"
                  className="w-48 h-48 border rounded-lg"
                />
              </div>
            )}

            {/* Código PIX para copiar */}
            <div className="space-y-2">
              <Label>Código PIX (Copia e Cola)</Label>
              <div className="flex gap-2">
                <Input 
                  value={granularPixCode} 
                  readOnly 
                  className="text-xs"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyPixCode(granularPixCode)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Informação sobre processamento */}
            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                ✓ Após o pagamento, os clientes selecionados terão sua vigência estendida automaticamente
              </p>
            </div>

            <Button 
              className="w-full" 
              variant="outline"
              onClick={() => {
                setIsGranularCheckoutOpen(false);
                setSelectedClientIds([]);
                refetch();
              }}
            >
              Fechar
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              O pagamento é processado automaticamente via webhook do Mercado Pago
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Upload de Comprovante PIX - "Já paguei" */}
      {/* NOTA: O modal de upload para checkout de novos clientes está em ResellerDashboard.
          Este componente (MySubscriptionTab) usa o modal de PIX granular para a assinatura do revendedor. */}
    </div>
  );
}
