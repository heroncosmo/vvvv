import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileAudio,
  FileImage,
  FileText,
  Film,
  Loader2,
  Megaphone,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
  Wallet,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type SupportMaterial = {
  id: string;
  title: string;
  description: string;
  caption?: string | null;
  fileUrl: string;
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  mediaType: "audio" | "image" | "video" | "document";
  aiGenerated: boolean;
  createdAt: string;
};

type PaginatedSupportMaterials = {
  items: SupportMaterial[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

type ReferralEntry = {
  id: string;
  status: string;
  sourceChannel: string;
  sourceLabel?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  createdAt?: string | null;
  convertedAt?: string | null;
  subscriptionStatus?: string | null;
  currentPlan?: string | null;
  monthlyValue: number;
  isActive: boolean;
};

type ShareEntry = {
  id: string;
  channel: string;
  contactName?: string | null;
  contactPhone?: string | null;
  createdAt?: string | null;
};

type CampaignPreview = {
  id: string;
  name: string;
  status: string;
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  queuedCount: number;
  createdAt?: string | null;
  completedAt?: string | null;
  contactsPreview: Array<{ id: string; name: string; phone: string; status: string; sentAt?: string | null; error?: string | null }>;
};

type Partner = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  referralCode: string;
  latestActivityAt?: string | null;
  balances: { available: number; estimated: number };
  commissionAmount: number;
  subscription?: {
    id?: string | null;
    status?: string | null;
    planName?: string | null;
    value?: number;
    nextPaymentDate?: string | null;
    referralWalletAppliedAmount?: number;
    referralWalletAppliedAt?: string | null;
  } | null;
  metrics: {
    totalReferrals: number;
    convertedReferrals: number;
    activeReferrals: number;
    linkCopies: number;
    campaignsSent: number;
    contactsReached: number;
    monthlyRevenue: number;
  };
  recentShares: ShareEntry[];
  campaigns: CampaignPreview[];
  referrals: ReferralEntry[];
};

type AdminReferralOverview = {
  programSettings: { defaultCommissionAmount: number | string };
  totals: {
    activePartners: number;
    totalReferrals: number;
    activeReferrals: number;
    convertedReferrals: number;
    campaignsSent: number;
    contactsReached: number;
    monthlyRevenue: number;
    estimatedBalance: number;
    supportMaterials: number;
  };
  partners: Partner[];
  pendingWithdrawals: any[];
  pendingCommissionRequests: any[];
};

type MaterialFormState = { title: string; description: string; caption: string };

const currency = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const formatFileSize = (size: number) => (!size ? "0 KB" : size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`);
const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("pt-BR") : "Sem data");
const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "Sem atividade");

function getMaterialIcon(mediaType: SupportMaterial["mediaType"]) {
  if (mediaType === "image") return FileImage;
  if (mediaType === "video") return Film;
  if (mediaType === "audio") return FileAudio;
  return FileText;
}

function getMaterialLabel(mediaType: SupportMaterial["mediaType"]) {
  if (mediaType === "image") return "Imagem";
  if (mediaType === "video") return "Video";
  if (mediaType === "audio") return "Audio";
  return "Arquivo";
}

const referralStatus = (status: string) => (status === "converted" ? "Convertido" : status === "captured" ? "Capturado" : status || "Registrado");
const subscriptionStatus = (status?: string | null) => {
  if (status === "active") return "Assinatura ativa";
  if (status === "pending") return "Cadastro pendente";
  if (status === "paused") return "Pausado";
  if (status === "expired") return "Expirado";
  if (status === "cancelled") return "Cancelado";
  return "Sem assinatura";
};
const campaignStatus = (status: string) => (status === "completed" ? "Concluida" : status === "running" ? "Em envio" : status === "pending" ? "Na fila" : status === "failed" ? "Falhou" : status || "Registrada");
const sendStatus = (status: string) => (status === "sent" ? "Enviado" : status === "failed" ? "Falhou" : status === "queued" ? "Na fila" : "Selecionado");
const sourceLabel = (channel: string, label?: string | null) => label || (channel === "manual_phone" ? "Cadastrado manualmente" : channel === "copy" ? "Link copiado" : channel === "whatsapp" ? "Compartilhado no WhatsApp" : channel === "instagram" ? "Instagram" : channel === "facebook" ? "Facebook" : "Link de indicacao");

export default function AdminReferralsPanel() {
  const { toast } = useToast();
  const [approvedAmounts, setApprovedAmounts] = useState<Record<string, string>>({});
  const [defaultCommissionAmount, setDefaultCommissionAmount] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [materialsPage, setMaterialsPage] = useState(1);
  const [editingMaterial, setEditingMaterial] = useState<SupportMaterial | null>(null);
  const [materialForm, setMaterialForm] = useState<MaterialFormState>({ title: "", description: "", caption: "" });
  const [materialPendingDelete, setMaterialPendingDelete] = useState<SupportMaterial | null>(null);

  const { data, isLoading, refetch } = useQuery<AdminReferralOverview>({
    queryKey: ["/api/admin/referrals/overview"],
  });

  const { data: materialsData, isLoading: isLoadingMaterials } = useQuery<PaginatedSupportMaterials>({
    queryKey: ["/api/admin/referrals/support-materials", materialsPage],
    queryFn: async () => {
      const response = await fetch(`/api/admin/referrals/support-materials?page=${materialsPage}&limit=8`, { credentials: "include" });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
  });

  useEffect(() => {
    if (data?.programSettings?.defaultCommissionAmount != null && !defaultCommissionAmount) {
      setDefaultCommissionAmount(String(data.programSettings.defaultCommissionAmount));
    }
  }, [data?.programSettings?.defaultCommissionAmount, defaultCommissionAmount]);

  const saveProgramMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/referrals/program-settings", { defaultCommissionAmount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referrals/overview"] });
      toast({ title: "Comissao padrao atualizada", description: "O valor novo ja fica refletido no fluxo atual de indicacoes." });
    },
    onError: (error: Error) => toast({ title: "Erro ao salvar valor", description: error.message, variant: "destructive" }),
  });

  const approveWithdrawalMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/referrals/withdrawals/${id}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referrals/overview"] });
      toast({ title: "Saque aprovado" });
    },
  });

  const approveCommissionMutation = useMutation({
    mutationFn: async ({ id, approvedAmount }: { id: string; approvedAmount: string }) =>
      apiRequest("POST", `/api/admin/referrals/commission-requests/${id}/approve`, { approvedAmount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referrals/overview"] });
      toast({ title: "Comissao atualizada" });
    },
  });

  const bulkUploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append("files", file));
      return apiRequest("POST", "/api/admin/referrals/support-materials/bulk", formData);
    },
    onSuccess: async (response) => {
      const payload = await response.json();
      setSelectedFiles([]);
      setMaterialsPage(1);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referrals/support-materials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referrals/overview"] });
      toast({
        title: `${payload.totalCreated || 0} material(is) publicado(s)`,
        description: payload.failed?.length ? `${payload.failed.length} arquivo(s) falharam e ficaram fora do cadastro.` : "Imagens receberam titulo e descricao automaticamente.",
      });
    },
    onError: (error: Error) => toast({ title: "Erro ao publicar materiais", description: error.message, variant: "destructive" }),
  });

  const updateMaterialMutation = useMutation({
    mutationFn: async () => {
      if (!editingMaterial) throw new Error("Selecione um material");
      return apiRequest("PUT", `/api/admin/referrals/support-materials/${editingMaterial.id}`, {
        title: materialForm.title,
        description: materialForm.description,
        caption: materialForm.caption || null,
      });
    },
    onSuccess: () => {
      setEditingMaterial(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referrals/support-materials"] });
      toast({ title: "Material atualizado", description: "Titulo, descricao e legenda foram salvos." });
    },
    onError: (error: Error) => toast({ title: "Erro ao salvar material", description: error.message, variant: "destructive" }),
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: async (materialId: string) => apiRequest("DELETE", `/api/admin/referrals/support-materials/${materialId}`),
    onSuccess: () => {
      setMaterialPendingDelete(null);
      setEditingMaterial(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referrals/support-materials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referrals/overview"] });
      toast({ title: "Material excluido", description: "O item saiu da biblioteca de apoio." });
    },
    onError: (error: Error) => toast({ title: "Erro ao excluir material", description: error.message, variant: "destructive" }),
  });

  const partners = data?.partners || [];
  const pendingWithdrawals = data?.pendingWithdrawals || [];
  const pendingCommissionRequests = data?.pendingCommissionRequests || [];
  const totals = data?.totals;
  const materials = materialsData?.items || [];
  const materialsPagination = materialsData?.pagination;
  const selectedPartner = partners.find((partner) => partner.userId === selectedPartnerId) || null;

  const filteredPartners = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return partners.filter((partner) => {
      const matchesTerm = !term || partner.name.toLowerCase().includes(term) || partner.email.toLowerCase().includes(term) || partner.referralCode.toLowerCase().includes(term);
      if (!matchesTerm) return false;
      if (partnerFilter === "with-referrals") return partner.metrics.totalReferrals > 0;
      if (partnerFilter === "converted") return partner.metrics.convertedReferrals > 0;
      if (partnerFilter === "with-campaigns") return partner.metrics.campaignsSent > 0;
      if (partnerFilter === "with-balance") return Number(partner.balances?.available || 0) > 0;
      return true;
    });
  }, [partnerFilter, partners, searchTerm]);

  const selectedFileSummary = useMemo(
    () => selectedFiles.map((file) => ({ name: file.name, size: formatFileSize(file.size), type: file.type || "application/octet-stream" })),
    [selectedFiles],
  );

  const handleCopyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    toast({ title: "Codigo copiado", description: "O codigo do parceiro foi copiado para a area de transferencia." });
  };

  const openEditMaterial = (material: SupportMaterial) => {
    setEditingMaterial(material);
    setMaterialForm({ title: material.title, description: material.description, caption: material.caption || "" });
  };

  if (isLoading || !data || !totals) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando programa atual de indicacoes...</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="border-stone-200 bg-[linear-gradient(135deg,#faf7ef_0%,#ffffff_55%,#eef8f4_100%)]">
        <CardHeader className="gap-5 lg:flex lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary" className="w-fit bg-stone-950 text-white hover:bg-stone-950">Admin / Indicacoes reais</Badge>
            <div className="space-y-3">
              <CardTitle className="text-4xl tracking-tight text-stone-950">Programa de indicacoes alinhado ao fluxo novo</CardTitle>
              <CardDescription className="max-w-3xl text-base leading-7 text-stone-600">
                Aqui entram os parceiros do painel atual de <code>/indicacoes</code>, com clientes realmente atribuidos,
                compartilhamentos registrados, campanhas de outreach enviadas e a biblioteca de material de apoio em massa.
              </CardDescription>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[180px_150px]">
            <Input value={defaultCommissionAmount} onChange={(event) => setDefaultCommissionAmount(event.target.value)} placeholder="Valor por indicacao" />
            <Button onClick={() => saveProgramMutation.mutate()} disabled={saveProgramMutation.isPending}>
              {saveProgramMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar valor
            </Button>
            <Button variant="outline" onClick={() => refetch()} className="sm:col-span-2">
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar visao
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Parceiros ativos", value: totals.activePartners, helper: "Perfis reais com codigo de indicacao.", icon: Users },
              { label: "Indicacoes capturadas", value: totals.totalReferrals, helper: `${totals.convertedReferrals} convertidas e ${totals.activeReferrals} com assinatura ativa.`, icon: Sparkles },
              { label: "Outreach enviados", value: totals.campaignsSent, helper: `${totals.contactsReached} contatos selecionados nas campanhas.`, icon: Megaphone },
              { label: "Saldo estimado", value: currency(totals.estimatedBalance), helper: `${currency(totals.monthlyRevenue)} em carteira ativa mensal.`, icon: Wallet },
              { label: "Materiais ativos", value: totals.supportMaterials, helper: "Biblioteca publicada no painel do parceiro.", icon: FileImage },
            ].map((item) => (
              <Card key={item.label} className="border-stone-200 bg-white/90">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription>{item.label}</CardDescription>
                    <item.icon className="h-4 w-4 text-teal-700" />
                  </div>
                  <CardTitle className="text-3xl">{item.value}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-stone-600">{item.helper}</CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-stone-200">
        <CardHeader className="gap-4 lg:flex lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Mapa de parceiros do sistema novo</CardTitle>
            <CardDescription>Cada card mostra o codigo do parceiro, as indicacoes reais capturadas e as campanhas de outreach disparadas.</CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar parceiro, email ou codigo" className="pl-9" />
            </div>
            <Select value={partnerFilter} onValueChange={setPartnerFilter}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filtrar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="with-referrals">Com indicacoes</SelectItem>
                <SelectItem value="converted">Com convertidos</SelectItem>
                <SelectItem value="with-campaigns">Com outreach</SelectItem>
                <SelectItem value="with-balance">Com saldo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            {filteredPartners.map((partner) => (
              <article key={partner.userId} className="grid min-w-0 gap-4 overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white p-5 xl:grid-cols-[1.35fr_1fr_1fr_1fr_auto]">
                <div className="min-w-0 space-y-2">
                  <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-stone-950">{partner.name}</p>
                      <p className="truncate text-sm text-stone-500">{partner.email || partner.phone || "Sem contato"}</p>
                    </div>
                    <Button variant="ghost" size="sm" disabled={!partner.referralCode} onClick={() => handleCopyCode(partner.referralCode)} className="min-w-0 justify-start sm:max-w-[190px]">
                      <Copy className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">{partner.referralCode || "Sem código"}</span>
                    </Button>
                  </div>
                  <p className="truncate text-sm text-stone-500">Ultima atividade: {formatDateTime(partner.latestActivityAt)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Uso e faturamento</p>
                  <p className="text-sm font-semibold text-stone-950">{partner.subscription?.planName || "Sem plano"}</p>
                  <p className="text-sm text-stone-500">{subscriptionStatus(partner.subscription?.status)} | {currency(partner.subscription?.value || 0)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Indicações</p>
                  <p className="text-2xl font-semibold text-stone-950">{partner.metrics.totalReferrals}</p>
                  <p className="text-sm text-stone-500">{partner.metrics.convertedReferrals} assinaram</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Saldo</p>
                  <p className="text-2xl font-semibold text-teal-700">{currency(partner.balances.available || 0)}</p>
                  <p className="text-sm text-stone-500">{currency(partner.subscription?.referralWalletAppliedAmount || 0)} já abatido</p>
                </div>
                <div className="flex items-center justify-start xl:justify-end">
                  <Button variant="outline" onClick={() => setSelectedPartnerId(partner.userId)} className="w-full sm:w-auto">
                    Ver detalhes
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {filteredPartners.length === 0 && (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center text-sm text-stone-600">
              Nenhum parceiro encontrado com esse filtro.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedPartner)} onOpenChange={(open) => !open && setSelectedPartnerId(null)}>
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-hidden border-stone-200">
          {selectedPartner && (
            <>
              <DialogHeader className="space-y-3">
                <DialogTitle className="text-2xl tracking-tight">{selectedPartner.name}</DialogTitle>
                <DialogDescription className="text-sm leading-6 text-stone-600">
                  Esta visao usa o sistema novo de indicacoes. Os clientes abaixo sao atribuicoes reais e as campanhas vieram do outreach disparado dentro do painel atual.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-4">
                {[
                  { label: "Codigo", value: selectedPartner.referralCode },
                  { label: "Clientes ativos", value: selectedPartner.metrics.activeReferrals },
                  { label: "Comissao atual", value: currency(selectedPartner.commissionAmount) },
                  { label: "Saldo disponivel", value: currency(selectedPartner.balances.available) },
                  { label: "Plano atual", value: selectedPartner.subscription?.planName || "Sem plano" },
                  { label: "Assinatura", value: subscriptionStatus(selectedPartner.subscription?.status) },
                  { label: "Valor da assinatura", value: currency(selectedPartner.subscription?.value || 0) },
                  { label: "Crédito já abatido", value: currency(selectedPartner.subscription?.referralWalletAppliedAmount || 0) },
                ].map((item) => (
                  <Card key={item.label} className="border-stone-200">
                    <CardHeader className="pb-2"><CardDescription>{item.label}</CardDescription><CardTitle>{item.value}</CardTitle></CardHeader>
                  </Card>
                ))}
              </div>
              <ScrollArea className="max-h-[62vh] pr-4">
                <div className="space-y-6">
                  <section className="space-y-3">
                    <div>
                      <h3 className="text-lg font-semibold text-stone-950">Indicacoes reais</h3>
                      <p className="text-sm text-stone-500">Aqui aparecem os contatos capturados e os clientes realmente vinculados ao parceiro.</p>
                    </div>
                    <div className="grid gap-4">
                      {selectedPartner.referrals.map((referral) => (
                        <div key={referral.id} className="grid gap-4 rounded-[1.5rem] border border-stone-200 p-4 lg:grid-cols-[1.25fr_0.95fr_1fr]">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-stone-950">{referral.name}</p>
                              <Badge variant="secondary" className="bg-stone-100 text-stone-700">{referralStatus(referral.status)}</Badge>
                              {referral.isActive && <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Ativo</Badge>}
                            </div>
                            <p className="text-sm text-stone-500">{referral.email || referral.phone || "Sem contato vinculado"}</p>
                            <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Origem: {sourceLabel(referral.sourceChannel, referral.sourceLabel)}</p>
                          </div>
                          <div className="space-y-2 text-sm">
                            <p className="font-medium text-stone-900">{subscriptionStatus(referral.subscriptionStatus)}</p>
                            <p className="text-stone-500">{referral.currentPlan || "Ainda sem plano"}</p>
                            <p className="text-stone-500">{currency(referral.monthlyValue || 0)} / mes</p>
                          </div>
                          <div className="space-y-2 text-sm text-stone-500">
                            <p>Criado em {formatDate(referral.createdAt)}</p>
                            <p>{referral.convertedAt ? `Convertido em ${formatDate(referral.convertedAt)}` : "Sem conversao ainda"}</p>
                          </div>
                        </div>
                      ))}
                      {selectedPartner.referrals.length === 0 && <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-600">Esse parceiro ainda nao tem indicacoes registradas no fluxo novo.</div>}
                    </div>
                  </section>
                  <section className="space-y-3">
                    <div>
                      <h3 className="text-lg font-semibold text-stone-950">Campanhas de outreach</h3>
                      <p className="text-sm text-stone-500">Mostra exatamente o que foi selecionado para envio dentro do painel do parceiro.</p>
                    </div>
                    <div className="grid gap-4">
                      {selectedPartner.campaigns.map((campaign) => (
                        <div key={campaign.id} className="rounded-[1.5rem] border border-stone-200 p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-stone-950">{campaign.name}</p>
                                <Badge variant="secondary" className="bg-stone-100 text-stone-700">{campaignStatus(campaign.status)}</Badge>
                              </div>
                              <p className="text-sm text-stone-500">{campaign.totalContacts} contato(s) | {campaign.sentCount} enviado(s) | {campaign.failedCount} falha(s) | {campaign.queuedCount} na fila</p>
                              <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Criada em {formatDateTime(campaign.createdAt)}</p>
                            </div>
                            <div className="rounded-2xl bg-stone-50 px-3 py-2 text-right text-sm text-stone-500">Finalizada: {formatDateTime(campaign.completedAt)}</div>
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {campaign.contactsPreview.map((contact) => (
                              <div key={contact.id} className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="font-medium text-stone-900">{contact.name}</p>
                                  <Badge variant="outline">{sendStatus(contact.status)}</Badge>
                                </div>
                                <p className="mt-1 text-stone-500">{contact.phone || "Sem numero"}</p>
                                <p className="mt-2 text-xs text-stone-500">{contact.sentAt ? `Enviado em ${formatDateTime(contact.sentAt)}` : "Contato apenas selecionado"}</p>
                                {contact.error && <p className="mt-2 text-xs text-rose-600">{contact.error}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {selectedPartner.campaigns.length === 0 && <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-600">Nenhuma campanha de outreach foi disparada por esse parceiro ainda.</div>}
                    </div>
                  </section>
                  <section className="space-y-3">
                    <div>
                      <h3 className="text-lg font-semibold text-stone-950">Compartilhamentos recentes</h3>
                      <p className="text-sm text-stone-500">Registro de link copiado e compartilhamentos feitos pelo parceiro.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {selectedPartner.recentShares.map((share) => (
                        <div key={share.id} className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium text-stone-900">{sourceLabel(share.channel)}</p>
                            <Badge variant="outline">{share.channel}</Badge>
                          </div>
                          <p className="mt-2 text-stone-500">{share.contactName || share.contactPhone || "Acao registrada"}</p>
                          <p className="mt-2 text-xs text-stone-500">{formatDateTime(share.createdAt)}</p>
                        </div>
                      ))}
                      {selectedPartner.recentShares.length === 0 && <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-600">Ainda nao houve registro de compartilhamento para esse parceiro.</div>}
                    </div>
                  </section>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <Card className="overflow-hidden border-stone-200/80 shadow-sm">
          <CardHeader className="border-b border-stone-100 bg-[linear-gradient(135deg,#f8faf8_0%,#ffffff_45%,#f6f4ef_100%)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>Adicionar material de apoio</CardTitle>
                <CardDescription>Envie varios arquivos de uma vez. Imagens usam Vision para sugerir titulo, descricao e legenda; videos entram com nome rapido e tudo segue editavel.</CardDescription>
              </div>
              <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">Autocadastro em massa</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50/80 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-600 shadow-sm"><UploadCloud className="h-3.5 w-3.5" />Upload em massa</div>
                  <div>
                    <p className="text-sm font-medium text-stone-900">Voce so envia os arquivos.</p>
                    <p className="text-sm text-muted-foreground">O sistema sobe, analisa imagem quando fizer sentido e publica a biblioteca para o parceiro.</p>
                  </div>
                </div>
                <div className="min-w-[220px]">
                  <Label htmlFor="support-material-files">Arquivos</Label>
                  <Input id="support-material-files" type="file" multiple onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))} className="mt-2 bg-white" />
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Fluxo</p>
                <div className="mt-3 space-y-2 text-sm text-stone-700">
                  <p>1. Envio multiplo para o bucket.</p>
                  <p>2. Imagem recebe metadados via Vision; video entra com nome curto para ser rapido.</p>
                  <p>3. Voce pode revisar e editar qualquer texto depois.</p>
                </div>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Formato suportado</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["Imagem", "Video", "Audio", "PDF / arquivo"].map((item) => <Badge key={item} variant="outline" className="rounded-full bg-stone-50 px-3 py-1 text-stone-700">{item}</Badge>)}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="font-medium text-stone-900">Fila pronta para publicar</p>
                  <p className="text-sm text-muted-foreground">{selectedFiles.length ? `${selectedFiles.length} arquivo(s) selecionado(s)` : "Nenhum arquivo selecionado ainda."}</p>
                </div>
                <Button onClick={() => bulkUploadMutation.mutate()} disabled={!selectedFiles.length || bulkUploadMutation.isPending} className="w-full sm:w-auto">
                  {bulkUploadMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                  Publicar materiais
                </Button>
              </div>
              {selectedFileSummary.length > 0 && <div className="mt-4 grid gap-2">{selectedFileSummary.map((file) => <div key={`${file.name}-${file.size}`} className="flex items-center justify-between rounded-2xl bg-stone-50 px-3 py-2 text-sm"><span className="truncate pr-3 font-medium text-stone-800">{file.name}</span><span className="shrink-0 text-xs text-muted-foreground">{file.size}</span></div>)}</div>}
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200/80 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>Materiais publicados</CardTitle>
                <CardDescription>A biblioteca abaixo e a mesma que aparece para o parceiro. Agora cada item pode ser revisado ou excluido pelo admin.</CardDescription>
              </div>
              {materialsPagination && <Badge variant="outline" className="rounded-full px-3 py-1">{materialsPagination.total} no total</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingMaterials ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando materiais...</div>
            ) : materials.length ? (
              <div className="space-y-3">
                {materials.map((material) => {
                  const Icon = getMaterialIcon(material.mediaType);
                  return (
                    <div key={material.id} className="rounded-3xl border border-stone-200 bg-[linear-gradient(180deg,#ffffff,#fbfaf7)] p-4">
                      <div className="flex items-start gap-3">
                        <div className="overflow-hidden rounded-2xl bg-stone-100">
                          {material.mediaType === "image" ? <img src={material.fileUrl} alt={material.title} className="h-20 w-24 object-cover" /> : <div className="flex h-20 w-24 items-center justify-center text-stone-700"><Icon className="h-5 w-5" /></div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium text-stone-900">{material.title}</p>
                            <Badge variant="outline" className="rounded-full text-[11px]">{getMaterialLabel(material.mediaType)}</Badge>
                            {material.aiGenerated && <Badge variant="outline" className="rounded-full border-lime-300 bg-lime-50 text-[11px] text-lime-700">IA</Badge>}
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{material.description}</p>
                          {material.caption && <p className="mt-2 text-xs text-stone-500">Legenda: {material.caption}</p>}
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span>{material.originalFileName}</span>
                            <span>{formatFileSize(material.fileSize)}</span>
                            <span>{formatDate(material.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" asChild><a href={material.fileUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir</a></Button>
                        <Button variant="outline" size="sm" onClick={() => openEditMaterial(material)}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
                        <Button variant="outline" size="sm" className="text-rose-600" onClick={() => setMaterialPendingDelete(material)}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50/70 p-6 text-sm text-muted-foreground">Nenhum material de apoio cadastrado ainda.</div>
            )}
            {materialsPagination && materialsPagination.totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50/70 px-3 py-2">
                <p className="text-xs text-muted-foreground">Pagina {materialsPagination.page} de {materialsPagination.totalPages}</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-9 w-9" disabled={materialsPagination.page <= 1} onClick={() => setMaterialsPage((current) => Math.max(1, current - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" className="h-9 w-9" disabled={materialsPagination.page >= materialsPagination.totalPages} onClick={() => setMaterialsPage((current) => Math.min(materialsPagination.totalPages, current + 1))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <Card>
          <CardHeader><CardTitle>Pedidos de saque</CardTitle><CardDescription>Revise a chave Pix antes de marcar como pago.</CardDescription></CardHeader>
          <CardContent>
            <ScrollArea className="h-[420px]">
              <div className="space-y-3">
                {pendingWithdrawals.map((item: any) => (
                  <div key={item.id} className="rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">{currency(item.amount)}</p>
                        <p className="text-sm text-muted-foreground">{item.holderName} | {item.pixType}</p>
                        <p className="break-all text-xs text-muted-foreground">{item.pixKey}</p>
                      </div>
                      <Button size="sm" onClick={() => approveWithdrawalMutation.mutate(item.id)} disabled={approveWithdrawalMutation.isPending}><Check className="mr-1 h-4 w-4" />Marcar pago</Button>
                    </div>
                  </div>
                ))}
                {!pendingWithdrawals.length && <p className="text-sm text-muted-foreground">Nenhum saque pendente.</p>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Propostas de comissao</CardTitle><CardDescription>Ajuste a comissao so quando o contexto comercial estiver validado.</CardDescription></CardHeader>
          <CardContent>
            <ScrollArea className="h-[420px]">
              <div className="space-y-3">
                {pendingCommissionRequests.map((item: any) => {
                  const approvedAmount = approvedAmounts[item.id] ?? String(item.requestedAmount || "");
                  return (
                    <div key={item.id} className="rounded-xl border p-4">
                      <div className="space-y-3">
                        <div>
                          <p className="font-medium">Atual {currency(item.currentAmount)} para pedido {currency(item.requestedAmount)}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.justification}</p>
                        </div>
                        <div className="flex items-end gap-3">
                          <div className="flex-1">
                            <Label>Novo valor aprovado</Label>
                            <Input value={approvedAmount} onChange={(event) => setApprovedAmounts((current) => ({ ...current, [item.id]: event.target.value }))} />
                          </div>
                          <Button onClick={() => approveCommissionMutation.mutate({ id: item.id, approvedAmount })} disabled={approveCommissionMutation.isPending}>Aprovar</Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!pendingCommissionRequests.length && <p className="text-sm text-muted-foreground">Nenhuma proposta pendente.</p>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(editingMaterial)} onOpenChange={(open) => !open && setEditingMaterial(null)}>
        <DialogContent className="max-w-2xl border-stone-200">
          <DialogHeader>
            <DialogTitle>Editar material de apoio</DialogTitle>
            <DialogDescription>Ajuste o titulo, a descricao e a legenda gerados automaticamente antes de deixar o material na biblioteca.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="material-title">Titulo</Label><Input id="material-title" value={materialForm.title} onChange={(event) => setMaterialForm((current) => ({ ...current, title: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="material-description">Descricao</Label><Textarea id="material-description" value={materialForm.description} onChange={(event) => setMaterialForm((current) => ({ ...current, description: event.target.value }))} rows={5} /></div>
            <div className="space-y-2"><Label htmlFor="material-caption">Legenda</Label><Textarea id="material-caption" value={materialForm.caption} onChange={(event) => setMaterialForm((current) => ({ ...current, caption: event.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMaterial(null)}>Cancelar</Button>
            <Button onClick={() => updateMaterialMutation.mutate()} disabled={updateMaterialMutation.isPending}>
              {updateMaterialMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar ajustes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(materialPendingDelete)} onOpenChange={(open) => !open && setMaterialPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir material de apoio?</AlertDialogTitle>
            <AlertDialogDescription>{materialPendingDelete?.title ? `O item "${materialPendingDelete.title}" sera removido da biblioteca do parceiro.` : "Esse item sera removido da biblioteca do parceiro."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); if (materialPendingDelete) deleteMaterialMutation.mutate(materialPendingDelete.id); }} className="bg-rose-600 hover:bg-rose-700">
              {deleteMaterialMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
