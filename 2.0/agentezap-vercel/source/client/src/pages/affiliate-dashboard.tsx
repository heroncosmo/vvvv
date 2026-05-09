import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Gift, LineChart, Megaphone, Sparkles, Wallet } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { applyPageSeo } from "@/lib/site-seo";
import { buildPublicAppUrl } from "@/lib/native-runtime";
import { useToast } from "@/hooks/use-toast";

type AffiliateDashboardResponse = {
  settings: {
    rewardPerReferral: number;
  };
  profile: {
    code: string;
  };
  assets: {
    sharePath: string;
    shareMessage: string;
    campaignName: string;
    campaignMessage: string;
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
  }>;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

async function trackEvent(type: string, meta?: Record<string, unknown>) {
  await apiRequest("POST", "/api/affiliate/events", { type, meta });
}

export default function AffiliateDashboardPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<AffiliateDashboardResponse>({
    queryKey: ["/api/affiliate/me"],
  });

  const fullShareLink = useMemo(() => {
    if (!data?.assets.sharePath) {
      return "";
    }

    return buildPublicAppUrl(data.assets.sharePath);
  }, [data?.assets.sharePath]);

  useEffect(() => {
    return applyPageSeo({
      title: "Minhas indicações | AgenteZap",
      description: "Painel do cliente para compartilhar o link de indicação, montar campanha e acompanhar saldo estimado.",
      canonicalPath: "/indicacoes",
    });
  }, []);

  const handleCopy = async (type: "link_copied" | "message_copied", value: string) => {
    await navigator.clipboard.writeText(value);
    await trackEvent(type, { code: data?.profile.code });
    toast({
      title: "Copiado",
      description: type === "link_copied" ? "Seu link foi copiado." : "Sua mensagem foi copiada.",
    });
  };

  const handleOpenCampaign = async () => {
    if (!data) {
      return;
    }

    const draft = {
      source: "affiliate-program",
      campaignName: data.assets.campaignName,
      messageTemplate: data.assets.campaignMessage.replace(data.assets.sharePath, fullShareLink),
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem("affiliate_campaign_draft", JSON.stringify(draft));
    await trackEvent("campaign_draft_opened", { code: data.profile.code });
    setLocation("/campanhas");
  };

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando programa de indicacoes...</div>;
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f4ec_0%,#ffffff_42%,#f8fafc_100%)] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="overflow-hidden border-stone-200 bg-white/90">
            <CardHeader className="space-y-4">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
                <Sparkles className="h-3.5 w-3.5" />
                Indique e ganhe
              </div>
              <div className="space-y-3">
                <CardTitle className="text-3xl tracking-tight text-stone-950">
                  Seu link de afiliado já está pronto
                </CardTitle>
                <CardDescription className="max-w-2xl text-base leading-7 text-stone-600">
                  Compartilhe seu link, monte uma campanha e acompanhe quantos clientes ativos vieram pelas suas indicações.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Seu código</p>
                <p className="mt-2 text-2xl font-semibold text-stone-950">{data.profile.code}</p>
              </div>
              <div className="rounded-3xl border border-stone-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Link para compartilhar</p>
                <p className="mt-2 break-all text-sm leading-6 text-stone-700">{fullShareLink}</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={() => handleCopy("link_copied", fullShareLink)} className="sm:flex-1">
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar link
                </Button>
                <Button variant="outline" onClick={() => handleCopy("message_copied", data.assets.shareMessage.replace(data.assets.sharePath, fullShareLink))} className="sm:flex-1">
                  <Gift className="mr-2 h-4 w-4" />
                  Copiar mensagem
                </Button>
                <Button variant="secondary" onClick={handleOpenCampaign} className="sm:flex-1">
                  <Megaphone className="mr-2 h-4 w-4" />
                  Montar campanha
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Card className="border-stone-200">
              <CardHeader className="pb-2">
                <CardDescription>Saldo estimado</CardDescription>
                <CardTitle className="text-3xl text-teal-700">{formatCurrency(data.metrics.estimatedBalance)}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-stone-600">
                R$ {data.settings.rewardPerReferral.toFixed(2).replace(".", ",")} por cliente ativo vindo da sua indicação.
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardHeader className="pb-2">
                <CardDescription>Receita mensal indicada</CardDescription>
                <CardTitle className="text-3xl">{formatCurrency(data.metrics.monthlyRevenue)}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-stone-600">
                Volume mensal da carteira que entrou pelo seu link.
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Clientes indicados", value: data.metrics.totalReferrals, icon: LineChart },
            { label: "Clientes ativos", value: data.metrics.activeReferrals, icon: Wallet },
            { label: "Copias do link", value: data.metrics.linkCopies, icon: Copy },
            { label: "Campanhas enviadas", value: data.metrics.campaignsSent, icon: Megaphone },
          ].map((item) => (
            <Card key={item.label} className="border-stone-200">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>{item.label}</CardDescription>
                  <item.icon className="h-4 w-4 text-teal-700" />
                </div>
                <CardTitle className="text-2xl">{item.value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </section>

        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>Clientes que vieram pelo seu link</CardTitle>
            <CardDescription>
              Aqui você acompanha quem entrou, plano atual e valor mensal estimado da carteira indicada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.referredClients.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-600">
                Você ainda não tem clientes vinculados pelo seu link. Copie o link e ative uma campanha para começar.
              </div>
            ) : (
              <ScrollArea className="w-full">
                <div className="min-w-[760px] divide-y divide-stone-100">
                  {data.referredClients.map((client) => (
                    <div key={client.userId} className="grid grid-cols-[1.8fr_1.1fr_1fr_0.8fr] gap-4 py-4">
                      <div>
                        <p className="font-semibold text-stone-950">{client.name}</p>
                        <p className="text-sm text-stone-500">{client.email || client.phone}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-900">{client.currentPlan}</p>
                        <p className="text-sm text-stone-500">{client.subscriptionStatus}</p>
                      </div>
                      <div className="text-sm font-semibold text-stone-900">{formatCurrency(client.monthlyValue)}</div>
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLocation("/my-subscription")}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Ver assinatura
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
