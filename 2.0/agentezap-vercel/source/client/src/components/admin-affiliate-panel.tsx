import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Copy, Gift, Link2, Megaphone, RefreshCw, Save, Search, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AdminAffiliateOverview = {
  settings: {
    rewardPerReferral: number;
    supportWhatsapp: string;
  };
  totals: {
    activePartners: number;
    totalReferrals: number;
    activeReferrals: number;
    monthlyRevenue: number;
    estimatedBalance: number;
    linkCopies: number;
    campaignsSent: number;
    contactsReached: number;
  };
  partners: Array<{
    userId: string;
    name: string;
    email: string;
    phone: string;
    createdAt: string | null;
    latestActivityAt: string | null;
    profile: {
      code: string;
    };
    metrics: {
      totalReferrals: number;
      activeReferrals: number;
      linkCopies: number;
      messageCopies: number;
      campaignDrafts: number;
      campaignsSent: number;
      contactsReached: number;
      monthlyRevenue: number;
      estimatedBalance: number;
    };
    referredClients: Array<{
      userId: string;
      name: string;
      email: string;
      phone: string;
      subscriptionStatus: string;
      currentPlan: string;
      monthlyValue: number;
      createdAt: string | null;
      conversation: {
        id: string;
        contactName: string | null;
        lastMessageText: string | null;
        lastMessageTime: string | null;
      } | null;
    }>;
  }>;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sem atividade";
  }

  return new Date(value).toLocaleString("pt-BR");
}

export function AdminAffiliatePanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [rewardValue, setRewardValue] = useState("");

  const { data, isLoading, refetch } = useQuery<AdminAffiliateOverview>({
    queryKey: ["/api/admin/affiliate-program"],
  });

  useEffect(() => {
    if (data && !rewardValue) {
      setRewardValue(String(data.settings.rewardPerReferral));
    }
  }, [data, rewardValue]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const normalized = Number(String(rewardValue || "0").replace(",", "."));
      const response = await apiRequest("PUT", "/api/admin/affiliate-program/settings", {
        rewardPerReferral: normalized,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/affiliate-program"] });
      toast({
        title: "Programa atualizado",
        description: "O valor exibido na página pública e no painel foi sincronizado.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar programa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const selectedPartner = useMemo(
    () => data?.partners.find((partner) => partner.userId === selectedPartnerId) || null,
    [data?.partners, selectedPartnerId],
  );

  const filteredPartners = useMemo(() => {
    const source = data?.partners || [];
    const term = searchTerm.trim().toLowerCase();

    return source.filter((partner) => {
      const matchesTerm =
        !term ||
        partner.name.toLowerCase().includes(term) ||
        partner.email.toLowerCase().includes(term) ||
        partner.profile.code.toLowerCase().includes(term);

      if (!matchesTerm) {
        return false;
      }

      if (statusFilter === "all") {
        return true;
      }

      if (statusFilter === "with-referrals") {
        return partner.metrics.totalReferrals > 0;
      }

      if (statusFilter === "with-campaigns") {
        return partner.metrics.campaignsSent > 0;
      }

      return partner.metrics.activeReferrals > 0;
    });
  }, [data?.partners, searchTerm, statusFilter]);

  const handleCopyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    toast({
      title: "Codigo copiado",
      description: "O codigo do parceiro foi copiado para a area de transferencia.",
    });
  };

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando programa de afiliados...</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="border-stone-200 bg-[linear-gradient(135deg,#faf7ef_0%,#ffffff_58%,#eef9f6_100%)]">
        <CardHeader className="gap-5 lg:flex lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary" className="w-fit bg-stone-950 text-white hover:bg-stone-950">
              Admin / Indicações
            </Badge>
            <div className="space-y-3">
              <CardTitle className="text-4xl tracking-tight text-stone-950">
                Programa de afiliados, carteira e saldo por parceiro
              </CardTitle>
              <CardDescription className="max-w-3xl text-base leading-7 text-stone-600">
                Aqui entram apenas os clientes do sistema de indicações afiliadas. Você vê link copiado,
                campanha usada, clientes indicados, faturamento mensal estimado e o saldo previsto por parceiro.
              </CardDescription>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[180px_140px]">
            <Input
              value={rewardValue}
              onChange={(event) => setRewardValue(event.target.value)}
              placeholder="Valor por indicacao"
            />
            <Button onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              Salvar valor
            </Button>
            <Button variant="outline" onClick={() => refetch()} className="sm:col-span-2">
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar visão
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: "Parceiros ativos", value: data.totals.activePartners, helper: "Clientes com perfil de afiliado gerado.", icon: Gift },
              { label: "Clientes indicados", value: data.totals.totalReferrals, helper: "Cadastros vinculados ao programa.", icon: Wallet },
              { label: "Mensal estimado", value: formatCurrency(data.totals.monthlyRevenue), helper: "Receita mensal da carteira indicada.", icon: Wallet },
              { label: "Saldo estimado", value: formatCurrency(data.totals.estimatedBalance), helper: "Baseado no valor configurado por indicação ativa.", icon: Wallet },
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
            <CardTitle>Mapa de afiliados</CardTitle>
            <CardDescription>
              Cada parceiro mostra clientes indicados, copias do link, campanhas disparadas e saldo estimado.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar afiliado, email ou código"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[210px]">
                <SelectValue placeholder="Filtrar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="with-referrals">Com clientes indicados</SelectItem>
                <SelectItem value="active">Com clientes ativos</SelectItem>
                <SelectItem value="with-campaigns">Com campanhas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            {filteredPartners.map((partner) => (
              <article key={partner.userId} className="grid gap-4 rounded-[1.75rem] border border-stone-200 bg-white p-5 xl:grid-cols-[1.45fr_1fr_1fr_1fr_auto]">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-stone-950">{partner.name}</p>
                      <p className="text-sm text-stone-500">{partner.email || partner.phone}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleCopyCode(partner.profile.code)}>
                      <Copy className="mr-2 h-4 w-4" />
                      {partner.profile.code}
                    </Button>
                  </div>
                  <p className="text-sm text-stone-500">Ultima atividade: {formatDate(partner.latestActivityAt)}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Carteira</p>
                  <p className="text-2xl font-semibold text-stone-950">{partner.metrics.totalReferrals}</p>
                  <p className="text-sm text-stone-500">{partner.metrics.activeReferrals} clientes ativos</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Link e campanha</p>
                  <p className="text-sm text-stone-900">{partner.metrics.linkCopies} copias do link</p>
                  <p className="text-sm text-stone-900">{partner.metrics.campaignsSent} campanhas enviadas</p>
                  <p className="text-sm text-stone-500">{partner.metrics.contactsReached} contatos alcançados</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Saldo</p>
                  <p className="text-2xl font-semibold text-teal-700">{formatCurrency(partner.metrics.estimatedBalance)}</p>
                  <p className="text-sm text-stone-500">{formatCurrency(partner.metrics.monthlyRevenue)} em mensal estimado</p>
                </div>

                <div className="flex items-center justify-end">
                  <Button variant="outline" onClick={() => setSelectedPartnerId(partner.userId)}>
                    Ver detalhes
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </article>
            ))}
          </div>

          {filteredPartners.length === 0 && (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center text-sm text-stone-600">
              Nenhum afiliado encontrado com esse filtro.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedPartner)} onOpenChange={(open) => !open && setSelectedPartnerId(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden border-stone-200">
          {selectedPartner && (
            <>
              <DialogHeader className="space-y-3">
                <DialogTitle className="text-2xl tracking-tight">{selectedPartner.name}</DialogTitle>
                <DialogDescription className="text-sm leading-6 text-stone-600">
                  Afiliado focado em indicação de clientes do SaaS. Aqui você vê clientes, campanhas, saldo e conversa quando existir.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-stone-200">
                  <CardHeader className="pb-2">
                    <CardDescription>Código</CardDescription>
                    <CardTitle>{selectedPartner.profile.code}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-stone-200">
                  <CardHeader className="pb-2">
                    <CardDescription>Clientes ativos</CardDescription>
                    <CardTitle>{selectedPartner.metrics.activeReferrals}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-stone-200">
                  <CardHeader className="pb-2">
                    <CardDescription>Mensal estimado</CardDescription>
                    <CardTitle>{formatCurrency(selectedPartner.metrics.monthlyRevenue)}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-stone-200">
                  <CardHeader className="pb-2">
                    <CardDescription>Saldo estimado</CardDescription>
                    <CardTitle className="text-teal-700">{formatCurrency(selectedPartner.metrics.estimatedBalance)}</CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <ScrollArea className="max-h-[54vh] pr-4">
                <div className="space-y-4">
                  {selectedPartner.referredClients.map((client) => (
                    <div key={client.userId} className="grid gap-4 rounded-[1.5rem] border border-stone-200 p-4 lg:grid-cols-[1.25fr_1fr_0.8fr_1.1fr_auto]">
                      <div>
                        <p className="font-semibold text-stone-950">{client.name}</p>
                        <p className="text-sm text-stone-500">{client.email || client.phone}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.22em] text-stone-400">
                          Criado em {client.createdAt ? new Date(client.createdAt).toLocaleDateString("pt-BR") : "sem data"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-900">{client.currentPlan}</p>
                        <p className="text-sm text-stone-500">{client.subscriptionStatus}</p>
                      </div>
                      <div className="text-sm font-semibold text-stone-900">{formatCurrency(client.monthlyValue)}</div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="bg-stone-100 text-stone-700">
                            <Link2 className="mr-1 h-3.5 w-3.5" />
                            {selectedPartner.metrics.linkCopies} copias
                          </Badge>
                          <Badge variant="secondary" className="bg-stone-100 text-stone-700">
                            <Megaphone className="mr-1 h-3.5 w-3.5" />
                            {selectedPartner.metrics.campaignsSent} campanhas
                          </Badge>
                        </div>
                        {client.conversation ? (
                          <div className="rounded-2xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
                            <p className="font-medium">{client.conversation.contactName || "Conversa vinculada"}</p>
                            <p className="mt-1 line-clamp-2 text-teal-800">
                              {client.conversation.lastMessageText || "Sem preview da ultima mensagem"}
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-3 text-sm text-stone-500">
                            Nenhuma conversa vinculada para este cliente.
                          </div>
                        )}
                      </div>
                      <div className="flex items-start justify-end">
                        {client.conversation ? (
                          <Button
                            variant="outline"
                            onClick={() => {
                              window.location.hash = `#conversations/${client.conversation?.id}`;
                              setSelectedPartnerId(null);
                            }}
                          >
                            Ver conversa
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" disabled>
                            Sem conversa
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                  {selectedPartner.referredClients.length === 0 && (
                    <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-600">
                      Esse afiliado ainda não trouxe clientes vinculados.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
