import { ArrowRight, Building2, Globe2, Palette, ShieldCheck, Sparkles, Bot, MessageCircle } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

import { MarketingSiteFooter, MarketingSiteHeader, SITE_WHATSAPP_URL } from "@/components/marketing/site-chrome";
import { applyPageSeo } from "@/lib/site-seo";

export default function ResellerWhiteLabelPage() {
  const [location] = useLocation();

  useEffect(() => {
    return applyPageSeo({
      title: "Revenda White Label de IA para WhatsApp | Plataforma AgenteZap",
      description:
        "Revenda white label da plataforma de inteligencia artificial para WhatsApp com logo, dominio, precificacao e operacao no nome da sua marca.",
      keywords:
        "revenda white label whatsapp, white label ia whatsapp, revenda plataforma whatsapp, revenda inteligencia artificial whatsapp, saas white label whatsapp",
      canonicalPath: "/revenda-white-label",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "Service",
        name: "Revenda White Label AgenteZap",
        description:
          "Plano de revenda white label para operar a plataforma AgenteZap com marca propria.",
        provider: {
          "@type": "Organization",
          name: "AgenteZap",
        },
      },
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-stone-900">
      <MarketingSiteHeader currentPath={location} />

      <main>
        <section className="px-4 pb-14 pt-10 sm:px-6 sm:pt-16">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/85 px-4 py-2 text-sm font-medium text-stone-700">
                <Sparkles className="h-4 w-4 text-teal-700" />
                Revenda white label para operar com marca propria
              </div>

              <div className="space-y-5">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
                  Revenda White Label de IA para WhatsApp com sua marca, seu site e sua operação
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-stone-600">
                  Tenha uma plataforma de inteligencia artificial para WhatsApp no nome do seu cliente
                  ou da sua empresa, com dominio, identidade visual, precificacao e atendimento comercial proprio.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href={SITE_WHATSAPP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-stone-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-teal-700"
                >
                  Falar sobre revenda
                  <MessageCircle className="h-4 w-4" />
                </a>
                <a
                  href="/cadastro"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-700 transition hover:border-teal-300 hover:text-teal-700"
                >
                  Quero conhecer o produto
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-[0_30px_80px_-45px_rgba(0,0,0,0.35)]">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: Building2,
                    title: "Marca propria",
                    description: "Logo, naming comercial e operacao com identidade do seu negocio.",
                  },
                  {
                    icon: Globe2,
                    title: "Dominio e ambiente",
                    description: "Subdominio ou dominio customizado para apresentar o produto com sua marca.",
                  },
                  {
                    icon: Palette,
                    title: "Visual sob medida",
                    description: "Cores, suporte e comunicacao comercial alinhados com o seu posicionamento.",
                  },
                  {
                    icon: ShieldCheck,
                    title: "Base pronta",
                    description: "Plataforma robusta de IA para WhatsApp sem precisar construir do zero.",
                  },
                ].map((item) => (
                  <article key={item.title} className="rounded-3xl border border-stone-200 p-5">
                    <item.icon className="h-5 w-5 text-teal-700" />
                    <h2 className="mt-4 text-lg font-semibold text-stone-950">{item.title}</h2>
                    <p className="mt-2 text-sm leading-7 text-stone-600">{item.description}</p>
                  </article>
                ))}
              </div>

              <div className="mt-6 rounded-3xl bg-stone-950 p-6 text-white">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                    <Bot className="h-6 w-6 text-teal-300" />
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Uso ideal</p>
                    <p className="mt-1 text-xl font-semibold">Agencias, consultorias e operadores SaaS</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-stone-300">
                  Ideal para quem quer revender uma plataforma de IA no WhatsApp com margem propria,
                  onboarding guiado e apresentacao premium para seus clientes.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingSiteFooter />
    </div>
  );
}
