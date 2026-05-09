import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Copy, Gift, Megaphone, Wallet, Sparkles, Share2, LineChart } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";

import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/marketing/site-chrome";
import { buildPublicAppUrl } from "@/lib/native-runtime";
import { applyPageSeo } from "@/lib/site-seo";

type PublicAffiliateConfig = {
  rewardPerReferral: number;
  supportWhatsapp: string;
};

export default function AffiliateLanding() {
  const [location] = useLocation();

  const { data } = useQuery<PublicAffiliateConfig>({
    queryKey: ["/api/affiliate/public"],
  });

  const reward = typeof data?.rewardPerReferral === "number" ? data.rewardPerReferral : 50;
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const referralCode = searchParams.get("ref");
  const signupHref = "/cadastro";

  useEffect(() => {
    if (referralCode) {
      sessionStorage.setItem("affiliate_referral_code", referralCode);
    }

    return applyPageSeo({
      title: `Programa de Afiliados AgenteZap | Ganhe R$ ${reward.toFixed(2).replace(".", ",")} por indicacao`,
      description:
        "Programa de afiliados da AgenteZap para indicar a plataforma de IA no WhatsApp e ganhar por cada cliente aprovado.",
      keywords:
        "afiliado whatsapp, programa de afiliados, indique e ganhe, afiliado agentezap, afiliado ia whatsapp, ganhar com indicacao",
      canonicalPath: "/indicacoes",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Programa de Afiliados AgenteZap",
        description:
          "Indique a plataforma AgenteZap e ganhe por cada cliente aprovado no programa de afiliados.",
        url: buildPublicAppUrl("/indicacoes"),
      },
    });
  }, [referralCode, reward]);

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-stone-900">
      <MarketingSiteHeader currentPath={location} />

      <main>
        <section className="overflow-hidden px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white/80 px-4 py-2 text-sm font-medium text-teal-700">
                <Sparkles className="h-4 w-4" />
                Programa de afiliados com recompensa recorrente por cliente ativo
              </div>

              <div className="space-y-5">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
                  Afiliado AgenteZap: indique e ganhe <span className="text-teal-700">R$ {reward.toFixed(2).replace(".", ",")}</span> por indicação aprovada
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-stone-600">
                  Compartilhe seu link, convide sua base e acompanhe cada indicação dentro da plataforma.
                  O valor do programa é controlado no admin e aparece aqui automaticamente.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href={signupHref}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-stone-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-teal-700"
                >
                  Quero meu link de afiliado
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-700 transition hover:border-teal-300 hover:text-teal-700"
                >
                  Já sou cliente
                </a>
              </div>

            </div>

            <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-[0_30px_80px_-45px_rgba(0,0,0,0.35)]">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl bg-stone-950 p-5 text-white">
                  <Gift className="h-5 w-5 text-teal-300" />
                  <p className="mt-4 text-sm text-stone-300">Recompensa por indicação</p>
                  <p className="mt-2 text-3xl font-semibold">R$ {reward.toFixed(2).replace(".", ",")}</p>
                </div>
                <div className="rounded-3xl bg-stone-100 p-5">
                  <Wallet className="h-5 w-5 text-teal-700" />
                  <p className="mt-4 text-sm text-stone-500">Pago com base no valor ativo no programa</p>
                  <p className="mt-2 text-xl font-semibold text-stone-900">Sem valor fixo no código</p>
                </div>
                <div className="rounded-3xl border border-stone-200 p-5">
                  <Copy className="h-5 w-5 text-teal-700" />
                  <p className="mt-4 text-sm text-stone-500">Link e mensagem prontos</p>
                  <p className="mt-2 text-lg font-semibold text-stone-900">Copie e compartilhe em segundos</p>
                </div>
                <div className="rounded-3xl border border-stone-200 p-5">
                  <Megaphone className="h-5 w-5 text-teal-700" />
                  <p className="mt-4 text-sm text-stone-500">Campanha pronta para sua base</p>
                  <p className="mt-2 text-lg font-semibold text-stone-900">Envie pelo modulo de campanhas</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
            {[
              {
                icon: Share2,
                title: "1. Gere seu link",
                description: "Cada cliente recebe um link unico dentro da area de indicacoes para rastrear copias, campanhas e novos cadastros.",
              },
              {
                icon: Megaphone,
                title: "2. Dispare sua campanha",
                description: "Use a mensagem pronta, personalize o texto e envie para sua base usando o fluxo de campanhas da plataforma.",
              },
              {
                icon: LineChart,
                title: "3. Acompanhe resultado e saldo",
                description: "Voce acompanha clientes indicados, status das assinaturas e saldo estimado em um painel centralizado.",
              },
            ].map((item) => (
              <article key={item.title} className="rounded-[2rem] border border-stone-200 bg-white p-6">
                <item.icon className="h-6 w-6 text-teal-700" />
                <h2 className="mt-5 text-xl font-semibold text-stone-950">{item.title}</h2>
                <p className="mt-3 text-sm leading-7 text-stone-600">{item.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <MarketingSiteFooter />
    </div>
  );
}
