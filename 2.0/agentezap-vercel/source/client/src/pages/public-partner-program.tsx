import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  Gift,
  Globe,
  LayoutDashboard,
  Palette,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useLocation } from "wouter";

import { PublicSiteLayout, usePublicPageSetup } from "@/components/public-site-chrome";

type ProgramKind = "affiliate" | "reseller" | "white-label";

type ProgramConfig = {
  canonicalPath: string;
  title: string;
  seoTitle: string;
  description: string;
  keywords: string;
  badge: string;
  eyebrow: string;
  heroTitle: string;
  heroDescription: string;
  primaryCta: string;
  secondaryCta: string;
  highlightTitle: string;
  highlightDescription: string;
  stats: Array<{ value: string; label: string }>;
  benefits: Array<{ title: string; description: string; icon: any }>;
  steps: Array<{ title: string; description: string }>;
  audiences: Array<{ title: string; description: string }>;
  faq: Array<{ question: string; answer: string }>;
};

const programConfig: Record<ProgramKind, ProgramConfig> = {
  affiliate: {
    canonicalPath: "/indicacoes",
    title: "Afiliados AgenteZap",
    seoTitle: "Afiliados AgenteZap | Indique clientes e receba comissao",
    description:
      "Pagina oficial de afiliados do AgenteZap. Indique negocios, acompanhe conversoes e monetize sua audiencia com uma plataforma de IA para WhatsApp.",
    keywords:
      "afiliados agentezap, programa de indicacao whatsapp, afiliado saas, comissao por indicacao, parceiro agentezap",
    badge: "Programa de Afiliados",
    eyebrow: "Indique. Converta. Receba.",
    heroTitle: "Monetize sua audiencia com um produto simples de indicar e facil de fechar.",
    heroDescription:
      "O AgenteZap ajuda empresas a vender, atender e agendar pelo WhatsApp. Voce compartilha seu link, o lead entra pronto para testar e sua operacao acompanha tudo com clareza.",
    primaryCta: "Quero comecar como afiliado",
    secondaryCta: "Ver Central de Ajuda",
    highlightTitle: "Afiliacao orientada para conversao real",
    highlightDescription:
      "Voce nao precisa empurrar uma promessa vaga. A oferta e clara, o teste e rapido e o cliente entende o valor em poucos minutos.",
    stats: [
      { value: "1 link", label: "para divulgar com rastreio" },
      { value: "1 painel", label: "para acompanhar indicacoes" },
      { value: "24/7", label: "produto que trabalha pela venda" },
    ],
    benefits: [
      {
        title: "Oferta facil de explicar",
        description: "Mostre o ganho: atendimento, vendas e agendamentos pelo WhatsApp em uma unica plataforma.",
        icon: Gift,
      },
      {
        title: "Conversao guiada",
        description: "O lead entra por uma pagina clara, pode testar rapido e entende o produto sem friccao.",
        icon: Sparkles,
      },
      {
        title: "Acompanhamento visivel",
        description: "Veja suas indicacoes, compartilhe o link certo e mantenha sua carteira organizada.",
        icon: LayoutDashboard,
      },
    ],
    steps: [
      { title: "Compartilhe seu link", description: "Use seu conteudo, lista ou rede de contatos para atrair empresas que ja usam WhatsApp no comercial." },
      { title: "O lead entra pronto para testar", description: "A proposta e objetiva, com beneficios claros e CTA direto para criar conta." },
      { title: "Receba pelas conversoes", description: "Quando o cliente entra no fluxo e assina, voce acompanha o resultado dentro do programa." },
    ],
    audiences: [
      { title: "Criadores e produtores", description: "Para quem ja influencia empresarios ou profissionais liberais e quer uma oferta recorrente." },
      { title: "Agencias e consultores", description: "Ideal para quem presta servicos de marketing, atendimento ou crescimento e quer monetizar a base." },
      { title: "Parceiros comerciais", description: "Bom para quem tem networking local e precisa de uma oferta enxuta, confiavel e facil de recomendar." },
    ],
    faq: [
      { question: "Preciso ser tecnico para indicar?", answer: "Nao. O foco e explicar a dor e levar o lead para o teste. O produto cuida da demonstracao pratica." },
      { question: "Quem e o cliente ideal?", answer: "Empresas que usam WhatsApp para vendas, suporte, agenda, captacao ou recuperacao de clientes." },
      { question: "Como a oferta fica mais facil de vender?", answer: "Porque o cliente entende o valor rapido: atendimento continuo, CRM, agendamentos e campanhas em um so sistema." },
      { question: "Posso divulgar em conteudo, lista ou consultoria?", answer: "Sim. O programa funciona bem para audiencia propria, base de clientes e parcerias comerciais." },
    ],
  },
  reseller: {
    canonicalPath: "/revenda",
    title: "Revenda AgenteZap",
    seoTitle: "Revenda AgenteZap | Venda a plataforma como servico recorrente",
    description:
      "Pagina oficial de revenda AgenteZap. Estruture uma operacao recorrente com clientes proprios, painel dedicado e entrega orientada para SaaS.",
    keywords:
      "revenda agentezap, revenda saas whatsapp, vender whatsapp para clientes, recorrencia saas, parceiro revenda",
    badge: "Programa de Revenda",
    eyebrow: "Sua operacao, sua carteira, sua recorrencia.",
    heroTitle: "Venda o AgenteZap como servico recorrente e transforme atendimento em receita mensal.",
    heroDescription:
      "A estrutura de revenda foi pensada para quem quer operar uma carteira propria, com onboarding, relacao comercial e crescimento previsivel sem construir um software do zero.",
    primaryCta: "Quero estruturar minha revenda",
    secondaryCta: "Falar com especialista",
    highlightTitle: "Operacao SaaS enxuta para quem quer escalar",
    highlightDescription:
      "Use a plataforma como base, foque na aquisicao e no sucesso do cliente e ganhe velocidade para montar sua propria maquina recorrente.",
    stats: [
      { value: "1 painel", label: "para gerir clientes" },
      { value: "1 base", label: "para crescer recorrencia" },
      { value: "B2B", label: "foco em operacao comercial" },
    ],
    benefits: [
      {
        title: "Carteira propria",
        description: "Centralize seus clientes em uma operacao comercial clara, com contexto de revenda e acompanhamento continuo.",
        icon: Users,
      },
      {
        title: "Modelo recorrente",
        description: "Monte uma receita mensal com onboarding, suporte e acompanhamento da sua base ativa.",
        icon: BadgeDollarSign,
      },
      {
        title: "Entrega com menos atrito",
        description: "Voce entra com oferta, atendimento e posicionamento. A plataforma encurta o caminho tecnico.",
        icon: Building2,
      },
    ],
    steps: [
      { title: "Capte e qualifique clientes", description: "Aborde nichos que ja dependem do WhatsApp e precisam profissionalizar atendimento e vendas." },
      { title: "Onboard com mais velocidade", description: "Leve o cliente para a plataforma e organize sua entrega com uma base unica." },
      { title: "Expanda a recorrencia", description: "Use a carteira ativa para upsell, retencao e indicacoes dentro da sua propria operacao." },
    ],
    audiences: [
      { title: "Agencias de marketing", description: "Para quem ja vende trafego, CRM, automacao ou atendimento e quer um produto recorrente para a carteira." },
      { title: "Consultores comerciais", description: "Ideal para quem estrutura processo, funil e atendimento e quer oferecer execucao em cima disso." },
      { title: "Operadores locais", description: "Bom para quem vende para clinicas, saloes, imoveis, delivery, cursos e negocios com atendimento intenso." },
    ],
    faq: [
      { question: "Revenda e diferente de afiliado?", answer: "Sim. Na revenda voce pensa em carteira propria, operacao recorrente e relacionamento continuo com os clientes." },
      { question: "Preciso ter equipe para comecar?", answer: "Nao necessariamente. Voce pode iniciar enxuto e ganhar tracao antes de ampliar operacao e suporte." },
      { question: "Para quem faz mais sentido?", answer: "Para quem quer receita mensal e tem proximidade com empresas que ja usam WhatsApp no comercial." },
      { question: "O que acelera a venda?", answer: "Clareza de oferta, nicho bem escolhido e uma demonstracao que mostra ganho pratico logo no primeiro contato." },
    ],
  },
  "white-label": {
    canonicalPath: "/white-label",
    title: "White Label AgenteZap",
    seoTitle: "White Label AgenteZap | Plataforma de WhatsApp com sua marca",
    description:
      "Pagina oficial white label AgenteZap. Ofereca uma plataforma com sua marca para clientes que precisam centralizar atendimento, vendas e agenda no WhatsApp.",
    keywords:
      "white label whatsapp, white label saas, plataforma com sua marca, software para revenda, agentezap white label",
    badge: "White Label",
    eyebrow: "Marca propria sem comecar do zero.",
    heroTitle: "Entregue uma plataforma com sua marca e posicione sua empresa como dona da experiencia.",
    heroDescription:
      "O programa white label reduz o caminho entre ideia e operacao. Voce entra com posicionamento, marca e relacionamento comercial, enquanto acelera a entrega em cima de uma base pronta.",
    primaryCta: "Quero operar no modelo white label",
    secondaryCta: "Ver possibilidades de marca",
    highlightTitle: "Presenca forte para quem quer parecer produto proprio",
    highlightDescription:
      "Mais controle visual, mais percepcao de valor e mais espaco para crescer com uma proposta premium na sua carteira.",
    stats: [
      { value: "Sua marca", label: "em primeiro plano" },
      { value: "SaaS", label: "pronto para operar" },
      { value: "Escala", label: "sem reconstruir stack" },
    ],
    benefits: [
      {
        title: "Percepcao premium",
        description: "Sua marca aparece na experiencia e reforca autoridade comercial na hora de fechar contratos.",
        icon: Palette,
      },
      {
        title: "Mais valor percebido",
        description: "Voce vende uma plataforma com narrativa propria, nao apenas um servico pontual.",
        icon: Globe,
      },
      {
        title: "Base segura para crescer",
        description: "Ganhe velocidade com uma estrutura pronta e foque energia no comercial e no suporte ao cliente.",
        icon: ShieldCheck,
      },
    ],
    steps: [
      { title: "Defina seu posicionamento", description: "Escolha nicho, proposta e linguagem comercial para entrar no mercado com mais precisao." },
      { title: "Apresente sua marca", description: "Use o modelo white label para fortalecer confianca e reforcar ownership na relacao com a carteira." },
      { title: "Escalone a base", description: "Com a plataforma rodando, foque em aquisicao, retencao e previsibilidade de receita." },
    ],
    audiences: [
      { title: "Operacoes SaaS em formacao", description: "Para quem quer entrar no mercado com imagem forte sem desenvolver um produto do zero." },
      { title: "Empresas de tecnologia comercial", description: "Bom para equipes que vendem canais de atendimento, CRM ou performance e querem ampliar ticket." },
      { title: "Consultorias premium", description: "Ideal para quem quer transformar servico em produto recorrente e com assinatura propria." },
    ],
    faq: [
      { question: "White label e o mesmo que revenda?", answer: "Nao. O white label enfatiza sua marca na experiencia e ajuda a construir percepcao de produto proprio." },
      { question: "Quando faz mais sentido usar esse modelo?", answer: "Quando sua empresa quer vender tecnologia com assinatura propria e reforcar valor percebido." },
      { question: "Isso ajuda no fechamento?", answer: "Sim. Marca propria aumenta autoridade, clareza comercial e memorabilidade na proposta." },
      { question: "Preciso desenvolver um software inteiro?", answer: "Nao. O objetivo e acelerar a entrada no mercado sem carregar o custo de construir tudo do zero." },
    ],
  },
};

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="font-medium text-gray-900">{question}</span>
        <span className="text-sm font-semibold text-teal-600">{open ? "Fechar" : "Abrir"}</span>
      </button>
      {open && <p className="pb-5 leading-relaxed text-gray-600">{answer}</p>}
    </div>
  );
}

export default function PublicPartnerProgram({ kind = "affiliate" }: { kind?: ProgramKind }) {
  const [, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const config = programConfig[kind];
  const structuredData = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: config.title,
      description: config.description,
      url: `https://agentezap.online${config.canonicalPath}`,
      about: config.badge,
    }),
    [config.badge, config.canonicalPath, config.description, config.title],
  );

  usePublicPageSetup({
    title: config.seoTitle,
    description: config.description,
    canonicalPath: config.canonicalPath,
    keywords: config.keywords,
    structuredData,
  });

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <PublicSiteLayout scrolled={scrolled} menuOpen={menuOpen} setMenuOpen={setMenuOpen}>
      <section className="bg-[radial-gradient(circle_at_top,#ccfbf1,transparent_42%),linear-gradient(180deg,#ffffff,#f8fafc)] px-4 pb-16 pt-28 sm:px-6 sm:pb-24 sm:pt-36">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.2fr,0.8fr] lg:items-center">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700">
              <Sparkles className="h-4 w-4" />
              {config.badge}
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">{config.eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight text-gray-900 sm:text-5xl lg:text-6xl">
              {config.heroTitle}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">{config.heroDescription}</p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <button
                type="button"
                onClick={() => setLocation("/cadastro")}
                className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-teal-600 px-8 py-4 text-lg font-semibold text-white shadow-xl shadow-teal-500/20 transition-all hover:from-teal-600 hover:to-teal-700"
              >
                {config.primaryCta}
                <ArrowRight className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setLocation(kind === "reseller" ? "/ajuda" : "/login")}
                className="rounded-2xl border-2 border-gray-200 px-8 py-4 text-lg font-semibold text-gray-700 transition-all hover:border-teal-200 hover:bg-teal-50"
              >
                {config.secondaryCta}
              </button>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {config.stats.map((item) => (
                <div key={item.label} className="rounded-2xl border border-gray-100 bg-white/90 p-5 shadow-sm">
                  <p className="text-3xl font-bold text-gray-900">{item.value}</p>
                  <p className="mt-2 text-sm text-gray-600">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-gray-100 bg-white p-6 shadow-2xl shadow-teal-100/50 sm:p-8">
            <div className="rounded-3xl bg-gradient-to-br from-gray-900 via-gray-900 to-teal-700 p-6 text-white">
              <p className="text-xs uppercase tracking-[0.24em] text-teal-100">Visao comercial</p>
              <h2 className="mt-3 text-2xl font-semibold">{config.highlightTitle}</h2>
              <p className="mt-3 leading-relaxed text-teal-50">{config.highlightDescription}</p>
            </div>

            <div className="mt-6 space-y-4">
              {config.steps.map((step, index) => (
                <div key={step.title} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-500 text-sm font-semibold text-white">
                      {index + 1}
                    </div>
                    <p className="font-semibold text-gray-900">{step.title}</p>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="recursos" className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-600">Beneficios</p>
            <h2 className="mt-4 text-3xl font-bold text-gray-900 sm:text-4xl">
              Uma pagina feita para explicar valor com rapidez e sem ruido.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              O programa precisa parecer facil de entender no primeiro olhar. Por isso a proposta aqui e direta, enxuta e comercial.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {config.benefits.map((benefit) => (
              <div key={benefit.title} className="rounded-3xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-8 shadow-sm">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/20">
                  <benefit.icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">{benefit.title}</h3>
                <p className="mt-3 leading-relaxed text-gray-600">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="bg-gray-50 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-600">Como Funciona</p>
              <h2 className="mt-4 text-3xl font-bold text-gray-900 sm:text-4xl">
                Estruture a oferta em poucos passos e leve o cliente para uma decisao mais clara.
              </h2>
            </div>
            <p className="max-w-xl text-lg text-gray-600">
              O desenho comercial muda conforme o modelo, mas a logica e a mesma: captar o lead certo, provar valor rapido e manter recorrencia.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {config.steps.map((step, index) => (
              <div key={step.title} className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-base font-semibold text-teal-700">
                  0{index + 1}
                </div>
                <h3 className="mt-5 text-xl font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-3 leading-relaxed text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="para-quem" className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-600">Para Quem</p>
            <h2 className="mt-4 text-3xl font-bold text-gray-900 sm:text-4xl">
              O modelo faz mais sentido quando voce ja esta perto do cliente certo.
            </h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {config.audiences.map((item) => (
              <div key={item.title} className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-900 text-white">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-xl font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-3 leading-relaxed text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gray-900 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr,1.1fr]">
          <div className="rounded-3xl bg-white/5 p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-200">Beneficios reais</p>
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
              Mais clareza na oferta, mais controle no posicionamento e menos atrito para crescer.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-gray-300">
              O objetivo desta pagina e responder rapido o que o parceiro ganha, para quem serve e por que o AgenteZap ajuda a vender melhor.
            </p>
          </div>

          <div className="grid gap-4">
            {[
              "Proposta visual alinhada com a landing principal, sem parecer uma area separada ou improvisada.",
              "Conteudo mais persuasivo e mais semantico para ajudar SEO, leitura e conversao.",
              "Estrutura pensada para caber melhor na primeira dobra, principalmente em desktop e em telas medias.",
              "Scroll publico destravado no mobile com restauracao explicita do overflow da pagina.",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-gray-200">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-teal-300" />
                <p className="leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="bg-gray-50 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-600">Perguntas Frequentes</p>
            <h2 className="mt-4 text-3xl font-bold text-gray-900 sm:text-4xl">
              Duvidas comuns antes de entrar no programa.
            </h2>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-white px-6 shadow-sm">
            {config.faq.map((item) => (
              <FaqItem key={item.question} question={item.question} answer={item.answer} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-4xl rounded-[32px] bg-gradient-to-br from-teal-600 to-teal-700 p-8 text-center sm:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-100">{config.badge}</p>
          <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
            Se faz sentido para sua operacao, o melhor proximo passo e entrar com uma proposta objetiva.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-teal-50">
            Cadastre-se, fale com o time e veja qual modelo encaixa melhor no seu contexto comercial.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => setLocation("/cadastro")}
              className="rounded-2xl bg-white px-8 py-4 text-lg font-bold text-teal-700 shadow-xl transition-all hover:bg-gray-50"
            >
              Criar conta e avancar
            </button>
            <button
              type="button"
              onClick={() => setLocation("/ajuda")}
              className="rounded-2xl border-2 border-white/30 px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-white/10"
            >
              Ver mais detalhes
            </button>
          </div>
        </div>
      </section>
    </PublicSiteLayout>
  );
}
