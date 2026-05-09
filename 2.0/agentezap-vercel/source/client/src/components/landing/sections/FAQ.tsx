import { Badge } from "@/components/ui/badge";
import {
  HelpCircle,
  MessageCircle,
  Mail,
  CalendarCheck,
  Shield,
  Sparkles,
  CreditCard,
  Brain,
  LifeBuoy
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { faqData } from "../data/faq";
import AccordionItem from "../shared/AccordionItem";

const categoryConfig: Record<string, { label: string; icon: LucideIcon; iconBg: string; iconColor: string; badgeClass: string }> = {
  setup: {
    label: "Primeiros passos",
    icon: Sparkles,
    iconBg: "border border-info/20 bg-info/10",
    iconColor: "text-info",
    badgeClass: "border border-info/20 bg-info/10 text-info"
  },
  ia: {
    label: "IA inteligente",
    icon: Brain,
    iconBg: "border border-highlight/20 bg-highlight/10",
    iconColor: "text-highlight",
    badgeClass: "border border-highlight/20 bg-highlight/10 text-highlight"
  },
  cobranca: {
    label: "Planos e cobranças",
    icon: CreditCard,
    iconBg: "border border-success/20 bg-success/10",
    iconColor: "text-success",
    badgeClass: "border border-success/20 bg-success/10 text-success"
  },
  seguranca: {
    label: "Segurança",
    icon: Shield,
    iconBg: "border border-white/20 bg-white/10",
    iconColor: "text-white",
    badgeClass: "border border-white/20 bg-white/10 text-white"
  },
  suporte: {
    label: "Suporte",
    icon: LifeBuoy,
    iconBg: "border border-white/15 bg-white/10",
    iconColor: "text-white",
    badgeClass: "border border-white/15 bg-white/10 text-white"
  }
};

const defaultCategory: { label: string; icon: LucideIcon; iconBg: string; iconColor: string; badgeClass: string } = {
  label: "FAQ",
  icon: HelpCircle,
  iconBg: "border border-white/20 bg-white/10",
  iconColor: "text-white",
  badgeClass: "border border-white/20 bg-white/10 text-white"
};

const supportChannels: { title: string; description: string; meta: string; icon: LucideIcon; accent: string }[] = [
  {
    title: "Chat ao vivo",
    description: "Especialistas respondendo em minutos direto no painel",
    meta: "Seg-Sex, 9h-18h",
    icon: MessageCircle,
    accent: "from-info/20 via-info/10 to-transparent"
  },
  {
    title: "Email dedicado",
    description: "Detalhes completos com histórico do seu atendimento",
    meta: "Retorno em até 2h úteis",
    icon: Mail,
    accent: "from-success/20 via-success/10 to-transparent"
  },
  {
    title: "Demonstração guiada",
    description: "Tour completo e ativação assistida pela nossa equipe",
    meta: "Agende no melhor horário",
    icon: CalendarCheck,
    accent: "from-highlight/20 via-highlight/10 to-transparent"
  }
];

const resourceLinks = [
  { label: "Central de Ajuda", href: "#" },
  { label: "Tutoriais em Vídeo", href: "#" },
  { label: "Base de Conhecimento", href: "#" },
  { label: "Status da API", href: "#" }
];

export default function FAQSection() {
  return (
    <section id="faq" className="relative overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 py-24">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-24 left-16 h-56 w-56 rounded-full bg-info/20 blur-3xl" />
        <div className="absolute bottom-0 right-20 h-72 w-72 rounded-full bg-success/20 blur-3xl" />
        <div className="absolute top-1/2 right-1/3 h-48 w-48 rounded-full bg-highlight/15 blur-2xl" />
      </div>
      <div className="container relative z-10 mx-auto px-6">
        <div className="grid items-start gap-12 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-10">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl backdrop-blur-xl">
              <Badge className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-base font-semibold uppercase tracking-wide text-white">
                <HelpCircle className="h-5 w-5" />
                FAQ
              </Badge>
              <h2 className="mt-6 text-4xl font-bold leading-tight text-white">
                Tudo o que você precisa saber antes de iniciar o seu teste gratuito
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-white/70">
                Reunimos as respostas mais pedidas por quem já automatiza vendas, atendimento e agenda com o AgenteZap.
              </p>
              <div className="mt-10 grid gap-4">
                {supportChannels.map((channel) => {
                  const ChannelIcon = channel.icon;
                  return (
                    <div
                      key={channel.title}
                      className={`flex items-start gap-4 rounded-2xl border border-white/10 bg-gradient-to-br ${channel.accent} px-6 py-5 backdrop-blur-md`}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                        <ChannelIcon className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">{channel.title}</h3>
                        <p className="text-sm text-white/70">{channel.description}</p>
                        <span className="mt-2 inline-block text-xs font-semibold uppercase tracking-wide text-white/60">
                          {channel.meta}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-10 grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-3xl font-bold text-white">98%</p>
                  <p className="mt-1 text-sm text-white/60">das dúvidas resolvidas no primeiro contato</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-3xl font-bold text-white">+35 mil</p>
                  <p className="mt-1 text-sm text-white/60">atendimentos automatizados todos os dias</p>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-10">
            <div className="space-y-4">
              {faqData.map((faq) => {
                const category = categoryConfig[faq.categoria] ?? defaultCategory;
                const CategoryIcon = category.icon;
                return (
                  <AccordionItem
                    key={faq.id}
                    title={faq.pergunta}
                    className="border-0 bg-white/[0.04] shadow-xl transition-all duration-300 hover:shadow-2xl backdrop-blur-lg"
                    icon={
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${category.iconBg}`}>
                        <CategoryIcon className={`h-6 w-6 ${category.iconColor}`} />
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      <p className="leading-relaxed text-white/80">{faq.resposta}</p>
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${category.badgeClass}`}>
                        <CategoryIcon className="h-4 w-4" />
                        {category.label}
                      </span>
                    </div>
                  </AccordionItem>
                );
              })}
            </div>
            <div className="space-y-6 rounded-3xl border border-white/10 bg-white/5 px-8 py-8 text-center shadow-xl backdrop-blur-xl">
              <h3 className="text-2xl font-bold text-white">Ainda tem dúvidas?</h3>
              <p className="text-lg text-white/70">
                Nossa equipe está pronta para guiar você em todo o processo.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <button className="rounded-2xl bg-gradient-to-r from-info to-success px-8 py-4 text-lg font-semibold text-white shadow-2xl transition-transform duration-300 hover:scale-105">
                  Falar com especialista
                </button>
                <button className="rounded-2xl border-2 border-white/20 px-8 py-4 text-lg font-semibold text-white transition-all duration-300 hover:border-white/40">
                  Agendar demonstração
                </button>
              </div>
              <div className="flex flex-wrap justify-center gap-4 text-sm text-white/60">
                {resourceLinks.map((link) => (
                  <a key={link.label} href={link.href} className="transition-colors hover:text-white">
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
