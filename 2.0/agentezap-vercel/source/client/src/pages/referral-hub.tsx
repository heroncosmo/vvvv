import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BadgeDollarSign,
  Brain,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  Facebook,
  FileText,
  Filter,
  Gift,
  ImageIcon,
  Instagram,
  Link2,
  Mail,
  MessageCircle,
  Mic,
  Phone,
  Search,
  Share2,
  Sparkles,
  Video,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type OutreachStatus = {
  status: "sent" | "failed" | "queued";
  campaignId: string;
  campaignName: string;
  sentAt?: string;
  error?: string;
};

type SupportMaterial = {
  id: string;
  name: string;
  mediaType: "image" | "video" | "audio" | "document";
  storageUrl: string;
  fileName?: string | null;
  description: string;
  caption?: string | null;
  updatedAt?: string | null;
};

type ManualReferral = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  createdAt?: string | null;
  convertedAt?: string | null;
  referredUserId?: string | null;
};

type ReferralDashboard = {
  profile: {
    shareMessageTemplate?: string | null;
    payoutPixType?: string | null;
    payoutPixKey?: string | null;
    payoutHolderName?: string | null;
  };
  program: { defaultCommissionAmount: number; heroTitle: string; heroBody: string };
  link: { shareUrl: string; shareMessageTemplate?: string | null; renderedShareMessage?: string | null };
  walletEntries: Array<{ id: string; description: string; amount: string; createdAt?: string }>;
  faq: Array<{ question: string; answer: string }>;
  recentOutreach: Array<{
    id: string;
    phone: string;
    name: string;
    status: "sent" | "failed" | "queued";
    campaignId: string;
    campaignName: string;
    timestamp?: string;
    error?: string;
  }>;
  manualReferrals: ManualReferral[];
  outreachStatusByConversation?: Record<string, OutreachStatus>;
  supportMaterialsPreview: SupportMaterial[];
  stats: {
    availableBalance: number;
    approvedCommission: number;
    standardCommission: number;
    conversionRate: number;
    totalReferrals: number;
    convertedReferrals: number;
  };
};

type Conversation = {
  id: string;
  contactName: string;
  contactNumber: string;
  memorySummary?: string | null;
  lastMessageText?: string | null;
  lastMessageTime?: string | null;
};

type SupportMaterialsResponse = {
  items: SupportMaterial[];
  pagination: { page: number; totalPages: number };
};

type ConversationFilter = "available" | "sent" | "queued" | "failed";
type HeroTab = "share" | "manual";

const PAGE_SIZE = 10;
const DEFAULT_BASE_MESSAGE =
  "Estou usando o AgenteZap no meu WhatsApp para responder clientes mais rapido, organizar o CRM e fazer follow-up sem deixar contato esfriar. Funcionou bem para mim e achei que pode ajudar voce tambem.";
const DEFAULT_SHARE_TEMPLATE =
  "Eu uso o AgenteZap no meu WhatsApp para responder clientes com IA, organizar o CRM e fazer follow-up. Se fizer sentido para voce, entra pelo meu link: {{link}}\nWhatsApp oficial: 5517981679818";

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function normalizeDate(value?: string | null) {
  if (!value) return "Sem horario";
  return new Date(value).toLocaleString("pt-BR");
}

function formatPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "Sem numero";
  if (digits.length === 13) return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return digits;
}

function renderShareTemplate(template: string, url: string) {
  const safeTemplate = String(template || DEFAULT_SHARE_TEMPLATE).trim() || DEFAULT_SHARE_TEMPLATE;
  const withLink = safeTemplate.includes("{{link}}") ? safeTemplate.split("{{link}}").join(url) : `${safeTemplate}\n${url}`;
  return withLink.includes("5517981679818") ? withLink : `${withLink}\nWhatsApp oficial: 5517981679818`;
}

function summarizeContext(conversation: Conversation) {
  const raw = String(conversation.memorySummary || conversation.lastMessageText || "").trim();
  if (!raw) return "Sem resumo salvo para esta conversa.";
  if (raw.length <= 150) return raw;
  return `${raw.slice(0, 147)}...`;
}

function getStatusPriority(status?: OutreachStatus | null) {
  if (!status) return 0;
  if (status.status === "failed") return 1;
  if (status.status === "queued") return 2;
  return 3;
}

function getStatusBadge(status?: OutreachStatus | null) {
  if (!status) return { label: "Disponivel", className: "border-stone-200 bg-stone-100 text-stone-700" };
  if (status.status === "queued") return { label: "Em campanha", className: "border-amber-200 bg-amber-50 text-amber-700" };
  if (status.status === "failed") return { label: "Falhou, pode voltar", className: "border-rose-200 bg-rose-50 text-rose-700" };
  return { label: "Ja indicado", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}

function isConversationSelectable(status?: OutreachStatus | null) {
  return !status || status.status === "failed";
}

function filterConversationByStatus(filter: ConversationFilter, status?: OutreachStatus | null) {
  if (filter === "available") return !status;
  if (filter === "sent") return status?.status === "sent";
  if (filter === "queued") return status?.status === "queued";
  return status?.status === "failed";
}

function getMaterialIcon(mediaType: SupportMaterial["mediaType"]) {
  if (mediaType === "image") return ImageIcon;
  if (mediaType === "video") return Video;
  if (mediaType === "audio") return Mic;
  return FileText;
}

function getManualBadge(item: ManualReferral) {
  if (item.status === "converted") return { label: "Virou cliente pago", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (item.referredUserId) return { label: "Conta criada, aguardando pagamento", className: "border-blue-200 bg-blue-50 text-blue-700" };
  return { label: "Aguardando cadastro", className: "border-stone-200 bg-stone-100 text-stone-700" };
}

function HelpTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-stone-200 text-stone-500 transition hover:border-stone-300 hover:text-stone-950"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-sm">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function ReferralHubPage() {
  const { toast } = useToast();
  const [activePanel, setActivePanel] = useState<"withdraw" | "commission" | null>(null);
  const [heroTab, setHeroTab] = useState<HeroTab>("share");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [pixType, setPixType] = useState("CPF");
  const [pixKey, setPixKey] = useState("");
  const [holderName, setHolderName] = useState("");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [justification, setJustification] = useState("");
  const [baseMessage, setBaseMessage] = useState(DEFAULT_BASE_MESSAGE);
  const [shareTemplate, setShareTemplate] = useState(DEFAULT_SHARE_TEMPLATE);
  const [shareTemplateDirty, setShareTemplateDirty] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [selectedConversations, setSelectedConversations] = useState<Record<string, boolean>>({});
  const [selectAllAcrossPages, setSelectAllAcrossPages] = useState(false);
  const [showBulkSelector, setShowBulkSelector] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState<ConversationFilter>("available");
  const [searchTerm, setSearchTerm] = useState("");
  const [materialsPage, setMaterialsPage] = useState(1);

  const { data: dashboard, isLoading } = useQuery<ReferralDashboard>({ queryKey: ["/api/referrals/dashboard"] });
  const { data: connection } = useQuery<{ isConnected?: boolean }>({ queryKey: ["/api/whatsapp/connection"] });
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    enabled: connection?.isConnected === true,
  });
  const { data: supportMaterials } = useQuery<SupportMaterialsResponse>({
    queryKey: ["/api/referrals/support-materials", materialsPage],
    queryFn: async () => (await apiRequest("GET", `/api/referrals/support-materials?page=${materialsPage}&limit=10`)).json(),
    enabled: !!dashboard,
  });

  useEffect(() => {
    if (!dashboard || shareTemplateDirty) return;
    setShareTemplate(dashboard.link.shareMessageTemplate || dashboard.profile.shareMessageTemplate || DEFAULT_SHARE_TEMPLATE);
    setPixType(dashboard.profile.payoutPixType || "CPF");
    setPixKey(dashboard.profile.payoutPixKey || "");
    setHolderName(dashboard.profile.payoutHolderName || "");
  }, [dashboard, shareTemplateDirty]);

  const outreachStatusByConversation = dashboard?.outreachStatusByConversation || {};
  const sortedConversations = useMemo(
    () =>
      [...conversations].sort((left, right) => {
        const statusDiff =
          getStatusPriority(outreachStatusByConversation[left.id]) - getStatusPriority(outreachStatusByConversation[right.id]);
        if (statusDiff !== 0) return statusDiff;
        return (right.lastMessageTime ? new Date(right.lastMessageTime).getTime() : 0) - (left.lastMessageTime ? new Date(left.lastMessageTime).getTime() : 0);
      }),
    [conversations, outreachStatusByConversation],
  );

  const filteredConversations = useMemo(() => {
    const text = searchTerm.trim().toLowerCase();
    const digits = text.replace(/\D/g, "");
    return sortedConversations.filter((conversation) => {
      const status = outreachStatusByConversation[conversation.id];
      if (!filterConversationByStatus(activeFilter, status)) return false;
      if (!text) return true;
      return (
        String(conversation.contactName || "").toLowerCase().includes(text) ||
        String(conversation.contactNumber || "").replace(/\D/g, "").includes(digits)
      );
    });
  }, [activeFilter, outreachStatusByConversation, searchTerm, sortedConversations]);

  const totalPages = Math.max(1, Math.ceil(filteredConversations.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const items = filteredConversations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filteredSelectableIds = filteredConversations.filter((item) => isConversationSelectable(outreachStatusByConversation[item.id])).map((item) => item.id);
  const pageSelectableIds = items.filter((item) => isConversationSelectable(outreachStatusByConversation[item.id])).map((item) => item.id);
  const idsToSend = selectAllAcrossPages
    ? filteredSelectableIds
    : Object.entries(selectedConversations).filter(([id, checked]) => checked && isConversationSelectable(outreachStatusByConversation[id])).map(([id]) => id);

  const commissionAmount = dashboard?.stats.approvedCommission || dashboard?.program.defaultCommissionAmount || 50;
  const selectedCount = idsToSend.length;
  const materials = supportMaterials?.items || dashboard?.supportMaterialsPreview || [];
  const readyShareText = dashboard?.link.shareUrl ? renderShareTemplate(shareTemplate, dashboard.link.shareUrl) : "";

  const counts = {
    available: sortedConversations.filter((item) => !outreachStatusByConversation[item.id]).length,
    sent: sortedConversations.filter((item) => outreachStatusByConversation[item.id]?.status === "sent").length,
    queued: sortedConversations.filter((item) => outreachStatusByConversation[item.id]?.status === "queued").length,
    failed: sortedConversations.filter((item) => outreachStatusByConversation[item.id]?.status === "failed").length,
  };

  const shareMutation = useMutation({
    mutationFn: async ({ channel, messagePreview }: { channel: string; messagePreview: string }) =>
      apiRequest("POST", "/api/referrals/share-link", { channel, messagePreview }),
  });
  const saveProfileMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/referrals/profile", {
        payoutPixType: pixType,
        payoutPixKey: pixKey,
        payoutHolderName: holderName,
        shareMessageTemplate: shareTemplate,
      }),
    onSuccess: async () => {
      setShareTemplateDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["/api/referrals/dashboard"] });
      toast({ title: "Texto salvo", description: "Sua mensagem de link ficou salva para os proximos compartilhamentos." });
    },
  });
  const withdrawalMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/referrals/withdrawals", { amount: withdrawAmount, pixType, pixKey, holderName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/dashboard"] });
      setActivePanel(null);
      setWithdrawAmount("");
      setPixKey("");
      setHolderName("");
      toast({ title: "Saque enviado", description: "Seu pedido foi para analise." });
    },
  });
  const commissionMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/referrals/commission-request", { requestedAmount, justification }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/dashboard"] });
      setActivePanel(null);
      setRequestedAmount("");
      setJustification("");
      toast({ title: "Negociacao enviada", description: "Sua proposta foi para analise." });
    },
  });
  const manualAttributionMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/referrals/manual-attribution", { contactName: manualName, contactEmail: manualEmail, contactPhone: manualPhone }),
    onSuccess: async () => {
      setManualName("");
      setManualEmail("");
      setManualPhone("");
      await queryClient.invalidateQueries({ queryKey: ["/api/referrals/dashboard"] });
      toast({ title: "Indicação registrada", description: "Agora esse contato fica vinculado ao seu código antes do cadastro." });
    },
  });
  const outreachMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/referrals/outreach", { conversationIds: idsToSend, baseMessage }),
    onSuccess: async (response) => {
      const data = await response.json();
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campanha criada", description: `Foram preparados ${data.preparedContacts?.length || 0} contatos para a sua indicacao.` });
    },
  });

  function clearSelection() {
    setSelectedConversations({});
    setSelectAllAcrossPages(false);
    setShowBulkSelector(false);
  }

  function selectPageOnly() {
    const next: Record<string, boolean> = {};
    for (const id of pageSelectableIds) next[id] = true;
    setSelectedConversations(next);
    setSelectAllAcrossPages(false);
    setShowBulkSelector(false);
  }

  function selectAllFiltered() {
    setSelectedConversations({});
    setSelectAllAcrossPages(true);
    setShowBulkSelector(false);
  }

  function toggleConversation(id: string, checked: boolean) {
    if (!isConversationSelectable(outreachStatusByConversation[id])) return;
    if (selectAllAcrossPages && !checked) {
      const next: Record<string, boolean> = {};
      for (const value of filteredSelectableIds) if (value !== id) next[value] = true;
      setSelectAllAcrossPages(false);
      setSelectedConversations(next);
      return;
    }
    setSelectedConversations((current) => ({ ...current, [id]: checked }));
  }

  async function copyReadyText() {
    if (!readyShareText) return;
    await navigator.clipboard.writeText(readyShareText);
    await shareMutation.mutateAsync({ channel: "copy", messagePreview: readyShareText });
    toast({ title: "Texto copiado", description: "Agora e so colar e compartilhar." });
  }

  async function copyAffiliateLink() {
    if (!dashboard?.link.shareUrl) return;
    await navigator.clipboard.writeText(dashboard.link.shareUrl);
    await shareMutation.mutateAsync({ channel: "copy_link", messagePreview: dashboard.link.shareUrl });
    toast({ title: "Link copiado", description: "Seu link de afiliado esta pronto para colar." });
  }

  async function share(channel: "whatsapp" | "facebook" | "instagram" | "share") {
    if (!dashboard?.link.shareUrl || !readyShareText) return;
    await shareMutation.mutateAsync({ channel, messagePreview: readyShareText });
    if (channel === "whatsapp") return void window.open(`https://wa.me/?text=${encodeURIComponent(readyShareText)}`, "_blank");
    if (channel === "facebook") {
      return void window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(dashboard.link.shareUrl)}&quote=${encodeURIComponent(readyShareText)}`,
        "_blank",
      );
    }
    if (navigator.share) return navigator.share({ title: "AgenteZap", text: readyShareText, url: dashboard.link.shareUrl });
    await navigator.clipboard.writeText(readyShareText);
    toast({ title: "Texto copiado", description: "Cole no Instagram ou onde preferir." });
  }

  async function shareSupportMaterial(material: SupportMaterial) {
    const payload = `${material.description}\n${material.storageUrl}`;
    if (navigator.share) return navigator.share({ title: material.name, text: payload, url: material.storageUrl });
    await navigator.clipboard.writeText(payload);
    toast({ title: "Material copiado", description: "Link e descricao copiados para compartilhar." });
  }

  if (isLoading || !dashboard) {
    return <div className="p-6 text-sm text-stone-500">Carregando sua central de indicacoes...</div>;
  }

  const filterCards: Array<{ key: ConversationFilter; label: string; value: number; tone: string }> = [
    { key: "available", label: "Disponiveis agora", value: counts.available, tone: "border-stone-200 bg-stone-100 text-stone-800" },
    { key: "sent", label: "Ja indicados", value: counts.sent, tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    { key: "queued", label: "Em campanha", value: counts.queued, tone: "border-amber-200 bg-amber-50 text-amber-700" },
    { key: "failed", label: "Falharam e podem voltar", value: counts.failed, tone: "border-rose-200 bg-rose-50 text-rose-700" },
  ];

  return (
    <div className="min-h-full bg-[#f6f3ee]">
      <div className="mx-auto flex max-w-[1720px] flex-col gap-5 px-4 py-5 sm:px-6 xl:px-8 2xl:px-10">
        <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.52fr),380px]">
          <Card className="overflow-hidden border-stone-200 bg-white shadow-[0_18px_60px_rgba(20,18,14,0.06)]">
            <CardHeader className="gap-6 border-b border-stone-200 bg-[linear-gradient(180deg,#ffffff,#faf8f3)] px-5 py-5 sm:px-6">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-lime-200 bg-lime-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-lime-700">
                  <Gift className="h-3.5 w-3.5" />
                  Indique e ganhe
                </div>
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.12fr),minmax(360px,0.88fr)] xl:items-start">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <CardTitle className="max-w-5xl text-3xl leading-[1.02] text-stone-950 md:text-[3.35rem]">
                        Receba {currency(commissionAmount)} por cliente na primeira assinatura paga
                      </CardTitle>
                      <CardDescription className="max-w-4xl text-base leading-8 text-stone-600">
                        Indique o AgenteZap como a ferramenta que voce ja usa de verdade, transforme conversas em credito para a sua conta, saque quando quiser e foque em quem realmente pode virar lucro.
                      </CardDescription>
                    </div>
                    <div className="rounded-[28px] border border-stone-200 bg-stone-50/80 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Label className="text-sm font-medium text-stone-950">Seu link de afiliado</Label>
                            <HelpTip text="Esse e o link que registra sua indicacao quando a pessoa entra para criar a conta." />
                          </div>
                          <Input readOnly value={dashboard.link.shareUrl} className="mt-3 h-11 rounded-2xl border-stone-200 bg-white font-medium text-stone-700" />
                        </div>
                        <Button className="h-11 shrink-0" variant="outline" onClick={copyAffiliateLink}>
                          <Link2 className="mr-2 h-4 w-4" />
                          Copiar link
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-3xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm leading-6 text-stone-700">
                        O credito cai somente quando o indicado conclui a primeira assinatura paga. Criar conta, testar o cadastro ou deixar a assinatura pendente nao gera saldo.
                      </div>
                      <div className="rounded-3xl border border-stone-200 bg-[#fdf9ef] px-4 py-4 text-sm leading-6 text-stone-700">
                        Se o indicado pagar por comprovante manual, o acesso dele pode ficar provisoriamente liberado. O seu credito so entra depois que o admin aprova esse comprovante.
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href="#lista-indicacoes">
                        <Button className="bg-stone-950 text-white hover:bg-stone-800">Selecionar contatos agora</Button>
                      </a>
                      <a href="/campanhas">
                        <Button variant="secondary">Ver campanhas</Button>
                      </a>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[28px] border border-stone-900 bg-stone-950 p-5 text-white">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-stone-300">Saldo disponivel</p>
                          <p className="mt-2 text-3xl font-semibold">{currency(dashboard.stats.availableBalance)}</p>
                          <p className="mt-2 text-sm leading-6 text-stone-300">Use para abater sua assinatura ou sacar por Pix.</p>
                        </div>
                        <Wallet className="h-5 w-5 text-lime-300" />
                      </div>
                    </div>
                    <div className="rounded-[28px] border border-stone-200 bg-white p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Comissao ativa</p>
                          <p className="mt-2 text-3xl font-semibold text-stone-950">{currency(commissionAmount)}</p>
                          <p className="mt-2 text-sm leading-6 text-stone-600">So vale na primeira assinatura paga e aprovada.</p>
                        </div>
                        <BadgeDollarSign className="h-5 w-5 text-lime-600" />
                      </div>
                    </div>
                    <div className="rounded-[28px] border border-stone-200 bg-white p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Indicacoes capturadas</p>
                          <p className="mt-2 text-3xl font-semibold text-stone-950">{dashboard.stats.totalReferrals || 0}</p>
                          <p className="mt-2 text-sm leading-6 text-stone-600">Link ou numero manual antes do cadastro.</p>
                        </div>
                        <Gift className="h-5 w-5 text-lime-600" />
                      </div>
                    </div>
                    <div className="rounded-[28px] border border-stone-200 bg-white p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Clientes pagos</p>
                          <p className="mt-2 text-3xl font-semibold text-stone-950">{dashboard.stats.convertedReferrals || 0}</p>
                          <p className="mt-2 text-sm leading-6 text-stone-600">So conta depois do pagamento aprovado.</p>
                        </div>
                        <Sparkles className="h-5 w-5 text-lime-600" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-[30px] border border-stone-200 bg-stone-50/80 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-stone-950">Link afiliado e mensagem que voce vai espalhar</p>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                      Deixe seu link facil de copiar, ajuste o texto do compartilhamento e, se precisar, registre um numero manualmente antes da pessoa criar a conta.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setHeroTab("share")}
                      className={`rounded-full border px-4 py-2 text-sm transition ${heroTab === "share" ? "border-stone-900 bg-stone-950 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"}`}
                    >
                      Compartilhar link
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeroTab("manual")}
                      className={`rounded-full border px-4 py-2 text-sm transition ${heroTab === "manual" ? "border-stone-900 bg-stone-950 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"}`}
                    >
                      Indicar por numero
                    </button>
                  </div>
                </div>
                {heroTab === "share" ? (
                  <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.95fr),minmax(0,1.05fr)]">
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-stone-200 bg-white p-4">
                        <div className="flex items-center gap-2">
                          <Label className="text-base font-medium text-stone-950">Mensagem de compartilhamento</Label>
                          <HelpTip text="Essa e a copia que vai para copiar, WhatsApp, Facebook, Instagram e compartilhamento nativo." />
                        </div>
                        <p className="mt-2 text-xs leading-5 text-stone-500">
                          Use o marcador <span className="font-semibold text-stone-900">{"{{link}}"}</span> se quiser escolher exatamente onde o link entra.
                        </p>
                        <Textarea
                          className="mt-3 min-h-[190px] rounded-3xl border-stone-200 bg-white text-sm leading-6"
                          value={shareTemplate}
                          onChange={(event) => {
                            setShareTemplate(event.target.value);
                            setShareTemplateDirty(true);
                          }}
                        />
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button onClick={() => saveProfileMutation.mutate()} disabled={saveProfileMutation.isPending || !shareTemplate.trim()}>
                            Salvar texto do link
                          </Button>
                          <Button variant="outline" onClick={copyReadyText}><Copy className="mr-2 h-4 w-4" />Copiar texto pronto</Button>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-3xl border border-stone-200 bg-white p-4">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-medium text-stone-950">Previa do que o cliente recebe</p>
                        <HelpTip text="Aqui voce enxerga o texto final com o seu link real, pronto para postar ou mandar." />
                      </div>
                      <div className="mt-3 rounded-3xl border border-stone-200 bg-stone-50 p-4 text-sm leading-7 text-stone-700">{readyShareText}</div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Button variant="outline" onClick={() => share("whatsapp")}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button>
                        <Button variant="outline" onClick={() => share("facebook")}><Facebook className="mr-2 h-4 w-4" />Facebook</Button>
                        <Button variant="outline" onClick={() => share("instagram")}><Instagram className="mr-2 h-4 w-4" />Instagram</Button>
                        <Button variant="secondary" onClick={() => share("share")}><Share2 className="mr-2 h-4 w-4" />Compartilhar em tudo</Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.88fr),minmax(0,1.12fr)]">
                    <div className="rounded-3xl border border-stone-200 bg-white p-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-base font-medium text-stone-950">Registrar indicado antes do cadastro</Label>
                        <HelpTip text="Use so quando a pessoa ainda nao criou conta. Se ela ja tiver conta, a indicacao manual nao vale." />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        Se a pessoa nao entrou pelo link, voce pode reservar a indicacao pelo e-mail ou numero dela antes do cadastro. Quando essa mesma pessoa criar a conta e pagar a primeira assinatura, o credito continua vinculado a voce.
                      </p>
                      <div className="mt-4 grid gap-3">
                        <div className="space-y-2">
                          <Label>Nome da pessoa</Label>
                          <Input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Ex.: Maria da clinica" />
                        </div>
                        <div className="space-y-2">
                          <Label>E-mail indicado</Label>
                          <Input value={manualEmail} onChange={(event) => setManualEmail(event.target.value)} placeholder="maria@email.com" type="email" />
                        </div>
                        <div className="space-y-2">
                          <Label>Numero indicado</Label>
                          <Input value={manualPhone} onChange={(event) => setManualPhone(event.target.value)} placeholder="5517999999999" />
                        </div>
                        <Button onClick={() => manualAttributionMutation.mutate()} disabled={manualAttributionMutation.isPending || (!manualEmail.trim() && !manualPhone.trim())}>
                          {manualEmail.trim() ? <Mail className="mr-2 h-4 w-4" /> : <Phone className="mr-2 h-4 w-4" />}
                          Registrar indicado
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-3xl border border-stone-200 bg-white p-4">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-medium text-stone-950">Indicados ja registrados</p>
                        <HelpTip text="Essa lista mostra quem ja ficou vinculado a voce antes do cadastro oficial." />
                      </div>
                      <div className="mt-4 space-y-3">
                        {dashboard.manualReferrals.length ? dashboard.manualReferrals.map((item) => {
                          const badge = getManualBadge(item);
                          return (
                            <div key={item.id} className="rounded-3xl border border-stone-200 p-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <p className="font-semibold text-stone-950">{item.name}</p>
                                  <p className="text-sm text-stone-500">{item.email || formatPhone(item.phone || "")}</p>
                                  <p className="mt-2 text-xs text-stone-500">Registrado em {normalizeDate(item.createdAt)}</p>
                                  {item.convertedAt && <p className="text-xs text-emerald-700">Pagamento aprovado em {normalizeDate(item.convertedAt)}</p>}
                                </div>
                                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                              </div>
                            </div>
                          );
                        }) : <p className="text-sm text-stone-500">Nenhum indicado manual registrado ainda.</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {filterCards.map((item) => {
                  const selected = activeFilter === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setActiveFilter(item.key);
                        setCurrentPage(1);
                        setSelectAllAcrossPages(false);
                      }}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${item.tone} ${selected ? "ring-2 ring-stone-900/10 shadow-sm" : "hover:-translate-y-0.5"}`}
                    >
                      <p className="text-xs uppercase tracking-[0.18em]">{item.label}</p>
                      <p className="mt-2 text-3xl font-semibold">{item.value}</p>
                      <p className="mt-1 text-xs">Clique para filtrar a lista</p>
                    </button>
                  );
                })}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div id="lista-indicacoes" className="border-b border-stone-200 px-5 py-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-3xl space-y-1">
                    <p className="text-xl font-semibold text-stone-950">Selecione os contatos para ganhar {currency(commissionAmount)} agora</p>
                    <p className="text-sm leading-6 text-stone-600">
                      Escolha quem faz sentido, deixe a IA adaptar a sua recomendacao no meio da conversa e acompanhe a lista por nome, numero, status ou campanha.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-700">
                      {selectedCount > 0 ? `${selectedCount} contato(s) prontos para enviar` : "Nenhum contato selecionado"}
                    </div>
                    <Button className="bg-stone-950 text-white hover:bg-stone-800" disabled={!idsToSend.length || outreachMutation.isPending || !baseMessage.trim()} onClick={() => outreachMutation.mutate()}>
                      <Brain className="mr-2 h-4 w-4" />
                      Enviar indicacao com IA
                    </Button>
                    <Button variant="outline" onClick={clearSelection}>Limpar selecao</Button>
                    <a href="/campanhas">
                      <Button variant="secondary">Ver campanhas</Button>
                    </a>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr),360px]">
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {filterCards.map((item) => (
                        <button
                          key={`${item.key}-tab`}
                          type="button"
                          onClick={() => {
                            setActiveFilter(item.key);
                            setCurrentPage(1);
                            setSelectAllAcrossPages(false);
                          }}
                          className={`rounded-full border px-4 py-2 text-sm transition ${
                            activeFilter === item.key ? "border-stone-900 bg-stone-950 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                          }`}
                        >
                          {item.label} <span className="ml-1 opacity-75">{item.value}</span>
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto,auto]">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                        <Input
                          value={searchTerm}
                          onChange={(event) => {
                            setSearchTerm(event.target.value);
                            setCurrentPage(1);
                            setSelectAllAcrossPages(false);
                          }}
                          className="h-11 rounded-2xl border-stone-200 pl-10"
                          placeholder="Buscar por nome ou celular"
                        />
                      </div>
                      <Button variant="outline" className="h-11" onClick={() => setShowBulkSelector((current) => !current)}>Selecionar em lote</Button>
                      <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm text-stone-600">
                        <Filter className="h-4 w-4" />
                        <span>{filteredConversations.length} contato(s) neste filtro</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
                    <div className="flex items-center gap-2">
                      <Label className="text-base font-medium">Mensagem-base do outreach</Label>
                      <HelpTip text="A IA continua a conversa como se fosse voce, preserva a ideia central e nao transforma a mensagem em anuncio frio." />
                    </div>
                    <Textarea className="mt-3 min-h-[160px] rounded-3xl border-stone-200 bg-white text-sm leading-6" value={baseMessage} onChange={(event) => setBaseMessage(event.target.value)} />
                    <p className="mt-3 text-xs leading-5 text-stone-500">
                      O credito so entra se esse contato virar a primeira assinatura paga. Se o pagamento vier por comprovante manual, o seu credito espera a aprovacao do admin.
                    </p>
                  </div>
                </div>

                {showBulkSelector && (
                  <div className="mt-4 rounded-3xl border border-stone-200 bg-stone-50 p-5">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-stone-950">Selecao em lote</p>
                        <p className="mt-1 text-sm text-stone-600">
                          Selecione os {pageSelectableIds.length} disponiveis desta pagina ou todos os {filteredSelectableIds.length} disponiveis do filtro atual.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={selectPageOnly} disabled={pageSelectableIds.length === 0}>Selecionar esta pagina</Button>
                        <Button variant="secondary" onClick={selectAllFiltered} disabled={filteredSelectableIds.length === 0}>Selecionar todos do filtro</Button>
                        <Button variant="outline" onClick={clearSelection}>Limpar</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="hidden border-b border-stone-200 px-5 py-4 md:block">
                <div className="grid grid-cols-[88px,1.15fr,1.8fr,1fr,200px] gap-4 text-xs uppercase tracking-[0.18em] text-stone-500">
                  <button type="button" className="text-left transition hover:text-stone-900" onClick={() => setActiveFilter("available")}>Enviar</button>
                  <button type="button" className="text-left transition hover:text-stone-900" onClick={() => setCurrentPage(1)}>Cliente</button>
                  <span>Contexto</span>
                  <span>Ultimo contato</span>
                  <button type="button" className="text-left transition hover:text-stone-900" onClick={() => setActiveFilter("sent")}>Status</button>
                </div>
              </div>

              <div className="space-y-0 md:hidden">
                {items.map((item) => {
                  const status = outreachStatusByConversation[item.id];
                  const badge = getStatusBadge(status);
                  const checked = selectAllAcrossPages ? isConversationSelectable(status) : Boolean(selectedConversations[item.id]);
                  const selectable = isConversationSelectable(status);
                  return (
                    <div key={item.id} className="border-b border-stone-200 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-semibold text-stone-950">{item.contactName || item.contactNumber}</p>
                          <p className="text-sm text-stone-500">{formatPhone(item.contactNumber)}</p>
                        </div>
                        <Checkbox checked={checked} disabled={!selectable} onCheckedChange={(value) => toggleConversation(item.id, Boolean(value))} />
                      </div>
                      <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                      <p className="mt-3 text-sm leading-6 text-stone-600">{summarizeContext(item)}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                        <span>{normalizeDate(item.lastMessageTime)}</span>
                        {status?.campaignId && <a className="font-medium text-stone-800 underline underline-offset-2" href={`/campanhas/${status.campaignId}`}>Ver campanha</a>}
                      </div>
                    </div>
                  );
                })}
                {!items.length && <div className="px-4 py-8 text-center text-sm text-stone-500">Nenhum contato encontrado neste filtro.</div>}
              </div>

              <div className="hidden md:block">
                {items.map((item) => {
                  const status = outreachStatusByConversation[item.id];
                  const badge = getStatusBadge(status);
                  const checked = selectAllAcrossPages ? isConversationSelectable(status) : Boolean(selectedConversations[item.id]);
                  const selectable = isConversationSelectable(status);
                  return (
                    <div key={item.id} className="grid grid-cols-[88px,1.15fr,1.8fr,1fr,200px] gap-4 border-b border-stone-200 px-5 py-4 transition hover:bg-stone-50">
                      <div className="pt-1">
                        <Checkbox checked={checked} disabled={!selectable} onCheckedChange={(value) => toggleConversation(item.id, Boolean(value))} />
                      </div>
                      <div>
                        <p className="font-medium text-stone-950">{item.contactName || item.contactNumber}</p>
                        <p className="mt-1 text-sm text-stone-500">{formatPhone(item.contactNumber)}</p>
                      </div>
                      <div className="text-sm leading-6 text-stone-600">{summarizeContext(item)}</div>
                      <div className="text-sm text-stone-500">{normalizeDate(item.lastMessageTime)}</div>
                      <div className="space-y-2">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                        {status?.campaignId && <a className="block text-xs font-medium text-stone-800 underline underline-offset-2" href={`/campanhas/${status.campaignId}`}>Ver campanha</a>}
                        {status?.error && <p className="text-xs text-rose-600">{status.error}</p>}
                      </div>
                    </div>
                  );
                })}
                {!items.length && <div className="px-5 py-10 text-center text-sm text-stone-500">Nenhum contato encontrado neste filtro.</div>}
              </div>

              <div className="flex flex-col gap-3 border-t border-stone-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-stone-600">
                  {selectedCount > 0 ? `${selectedCount} contato(s) prontos para entrar na proxima campanha.` : "Selecione quem faz sentido para comecar a espalhar o AgenteZap."}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-20 text-center text-sm font-medium text-stone-700">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5 2xl:sticky 2xl:top-4 2xl:self-start">
            <Card className="border-stone-200 bg-white shadow-[0_18px_60px_rgba(20,18,14,0.06)]">
              <CardHeader className="space-y-3">
                <CardTitle className="text-xl text-stone-950">Saldo e comissao</CardTitle>
                <CardDescription className="text-sm leading-6 text-stone-600">
                  Mantenha seu Pix pronto, acompanhe a regra do pagamento aprovado e ajuste a comissao quando tiver argumento comercial forte.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-3xl border border-stone-900 bg-stone-950 p-5 text-white">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-stone-300">Saldo disponivel</p>
                      <p className="mt-2 text-3xl font-semibold">{currency(dashboard.stats.availableBalance)}</p>
                      <p className="mt-2 text-sm leading-6 text-stone-300">
                        Creditos liberados depois da primeira assinatura paga e aprovada.
                      </p>
                    </div>
                    <Wallet className="h-5 w-5 text-lime-300" />
                  </div>
                  <Button className="mt-4 w-full bg-white text-stone-950 hover:bg-stone-100" onClick={() => setActivePanel(activePanel === "withdraw" ? null : "withdraw")}>
                    Sacar saldo
                  </Button>
                </div>
                <div className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Comissao ativa</p>
                      <p className="mt-2 text-3xl font-semibold text-stone-950">{currency(commissionAmount)}</p>
                      <p className="mt-2 text-sm leading-6 text-stone-600">So vale na primeira assinatura paga de cada cliente indicado.</p>
                    </div>
                    <BadgeDollarSign className="h-5 w-5 text-lime-600" />
                  </div>
                  <Button className="mt-4 w-full" variant="outline" onClick={() => setActivePanel(activePanel === "commission" ? null : "commission")}>
                    Negociar comissao
                  </Button>
                </div>
              </CardContent>
            </Card>

            {activePanel && (
              <Card className="border-stone-200 bg-white shadow-[0_18px_60px_rgba(20,18,14,0.06)]">
                <CardHeader>
                  <CardTitle className="text-xl text-stone-950">{activePanel === "withdraw" ? "Solicitar saque" : "Negociar comissao"}</CardTitle>
                  <CardDescription className="text-sm leading-6 text-stone-600">
                    {activePanel === "withdraw"
                      ? "Informe o valor e a sua chave Pix. O time revisa e marca como pago quando concluir."
                      : `Mostre seu argumento comercial e proponha um valor acima de ${currency(commissionAmount)}.`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activePanel === "withdraw" ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2"><Label>Valor para sacar</Label><Input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} placeholder="50,00" /></div>
                        <div className="space-y-2"><Label>Tipo de chave Pix</Label><Input value={pixType} onChange={(event) => setPixType(event.target.value)} placeholder="CPF" /></div>
                      </div>
                      <div className="space-y-2"><Label>Chave Pix</Label><Input value={pixKey} onChange={(event) => setPixKey(event.target.value)} placeholder="Digite a chave Pix" /></div>
                      <div className="space-y-2"><Label>Nome do titular</Label><Input value={holderName} onChange={(event) => setHolderName(event.target.value)} placeholder="Nome completo" /></div>
                      <div className="flex gap-3">
                        <Button className="flex-1" onClick={() => withdrawalMutation.mutate()} disabled={withdrawalMutation.isPending}>Enviar saque</Button>
                        <Button variant="outline" onClick={() => setActivePanel(null)}>Fechar</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2"><Label>Novo valor sugerido</Label><Input value={requestedAmount} onChange={(event) => setRequestedAmount(event.target.value)} placeholder="50,00" /></div>
                      <div className="space-y-2">
                        <Label>Por que voce merece uma comissao maior?</Label>
                        <Textarea className="min-h-[150px] rounded-2xl border-stone-200" value={justification} onChange={(event) => setJustification(event.target.value)} placeholder="Explique volume, publico, parcerias ou historico de indicacoes." />
                      </div>
                      <div className="flex gap-3">
                        <Button className="flex-1" onClick={() => commissionMutation.mutate()} disabled={commissionMutation.isPending}>Enviar negociacao</Button>
                        <Button variant="outline" onClick={() => setActivePanel(null)}>Fechar</Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="border-stone-200 bg-white shadow-[0_18px_60px_rgba(20,18,14,0.06)]">
              <CardHeader>
                <CardTitle className="text-xl text-stone-950">Historico recente</CardTitle>
                <CardDescription className="text-sm leading-6 text-stone-600">Veja os ultimos numeros indicados, com horario, campanha e situacao.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {dashboard.recentOutreach.length > 0 ? dashboard.recentOutreach.slice(0, 8).map((item) => {
                    const badge = getStatusBadge(item.status === "queued"
                      ? { status: "queued", campaignId: item.campaignId, campaignName: item.campaignName }
                      : item.status === "failed"
                        ? { status: "failed", campaignId: item.campaignId, campaignName: item.campaignName }
                        : { status: "sent", campaignId: item.campaignId, campaignName: item.campaignName });
                    return (
                      <div key={item.id} className="rounded-2xl border border-stone-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-stone-950">{item.name || "Sem nome"}</p>
                            <p className="text-sm text-stone-500">{formatPhone(item.phone)}</p>
                          </div>
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                        </div>
                        <div className="mt-3 space-y-1 text-sm text-stone-600">
                          <p>Campanha: <a className="font-medium text-stone-900 underline underline-offset-2" href={`/campanhas/${item.campaignId}`}>{item.campaignName}</a></p>
                          <p>Horario: {normalizeDate(item.timestamp)}</p>
                          {item.error && <p className="text-rose-600">{item.error}</p>}
                        </div>
                      </div>
                    );
                  }) : <p className="text-sm text-stone-500">Nenhuma indicacao enviada ainda.</p>}
                </div>

                {!!dashboard.walletEntries.length && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-stone-950">Wallet</p>
                      {dashboard.walletEntries.slice(0, 4).map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between text-sm text-stone-600">
                          <div className="min-w-0">
                            <p className="truncate">{entry.description}</p>
                            <p className="text-xs text-stone-400">{normalizeDate(entry.createdAt)}</p>
                          </div>
                          <span className="font-medium text-stone-950">{currency(Number(entry.amount || 0))}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-stone-200 bg-white shadow-[0_18px_60px_rgba(20,18,14,0.06)]">
              <CardHeader>
                <CardTitle className="text-xl text-stone-950">Central de ajuda</CardTitle>
                <CardDescription className="text-sm leading-6 text-stone-600">
                  Regra curta para nao gerar duvida: saldo so entra quando a primeira assinatura foi paga e aprovada.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-stone-600">
                <p>Use a mensagem como recomendacao real, nao como anuncio frio.</p>
                <p>Se o cliente pagar com comprovante, o seu credito espera a confirmacao do admin.</p>
                <a href="/ajuda" className="inline-flex">
                  <Button variant="outline">Ir para a central de ajuda</Button>
                </a>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr),minmax(0,0.8fr)]">
          <Card className="border-stone-200 bg-white shadow-[0_18px_60px_rgba(20,18,14,0.06)]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl text-stone-950">Material de apoio</CardTitle>
                <HelpTip text="Use imagens, videos e arquivos que o admin subir para te ajudar a divulgar melhor o AgenteZap no status, em grupos ou em mensagens." />
              </div>
              <CardDescription className="text-sm leading-6 text-stone-600">Baixe, compartilhe ou poste seus materiais de apoio. Eles aparecem em blocos de 10 por pagina.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {materials.map((material) => {
                  const MaterialIcon = getMaterialIcon(material.mediaType);
                  return (
                    <div key={material.id} className="rounded-3xl border border-stone-200 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100 text-stone-700"><MaterialIcon className="h-5 w-5" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-stone-950">{material.name}</p>
                          <p className="mt-1 text-sm leading-6 text-stone-600">{material.description}</p>
                          {material.caption && <p className="mt-2 text-sm text-stone-500">{material.caption}</p>}
                          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-stone-400">{normalizeDate(material.updatedAt)}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <a href={material.storageUrl} target="_blank" rel="noreferrer"><Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4" />Baixar</Button></a>
                        <Button variant="outline" size="sm" onClick={() => shareSupportMaterial(material)}><Share2 className="mr-2 h-4 w-4" />Compartilhar</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {!materials.length && <p className="text-sm text-stone-500">Nenhum material de apoio disponivel no momento.</p>}
              {supportMaterials?.pagination && supportMaterials.pagination.totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" disabled={supportMaterials.pagination.page <= 1} onClick={() => setMaterialsPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="text-sm text-stone-600">{supportMaterials.pagination.page} / {supportMaterials.pagination.totalPages}</span>
                  <Button variant="outline" size="sm" disabled={supportMaterials.pagination.page >= supportMaterials.pagination.totalPages} onClick={() => setMaterialsPage((value) => Math.min(supportMaterials.pagination.totalPages, value + 1))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-stone-200 bg-white shadow-[0_18px_60px_rgba(20,18,14,0.06)]">
            <CardHeader>
              <CardTitle className="text-xl text-stone-950">Perguntas frequentes</CardTitle>
              <CardDescription className="text-sm leading-6 text-stone-600">Regras claras para voce divulgar com seguranca e vender melhor a indicacao.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {dashboard.faq.map((item, index) => (
                <div key={`${item.question}-${index}`} className="rounded-3xl border border-stone-200 p-4">
                  <p className="font-semibold text-stone-950">{item.question}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{item.answer}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>

      {selectedCount > 0 && (
        <div className="fixed inset-x-4 bottom-20 z-40 md:hidden">
          <div className="rounded-3xl border border-stone-200 bg-white p-3 shadow-[0_18px_40px_rgba(20,18,14,0.18)]">
            <div className="mb-3 text-sm text-stone-600">{selectedCount} contato(s) selecionados para a proxima campanha.</div>
            <Button className="w-full bg-stone-950 text-white hover:bg-stone-800" disabled={outreachMutation.isPending || !baseMessage.trim()} onClick={() => outreachMutation.mutate()}>
              <Brain className="mr-2 h-4 w-4" />
              Enviar indicacao com IA
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
