import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Rocket, Timer, ShieldCheck, type LucideIcon } from "lucide-react";

const motivos: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Timer,
    title: "Comece em minutos",
    description: "Conecte seu WhatsApp com QR code e veja a IA respondendo em menos de 5 minutos",
  },
  {
    icon: Rocket,
    title: "Teste com seu negócio real",
    description: "Importe contatos, ative fluxos e acompanhe campanha, agenda e CRM rodando ao vivo",
  },
  {
    icon: ShieldCheck,
    title: "Sem cartão, sem compromisso",
    description: "Use todos os módulos completos no período grátis e cancele com um clique se não fizer sentido",
  },
];

export default function FreeSignup() {
  return (
    <section className="py-24 bg-white" id="por-que-agora">
      <div className="container mx-auto px-6">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <Badge className="inline-flex items-center gap-2 bg-green-100 text-green-900 px-6 py-3 rounded-full text-lg font-bold">
            Teste grátis liberado
          </Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mt-6 leading-tight">
            Por que criar sua conta grátis agora
          </h2>
          <p className="text-lg md:text-xl text-gray-600 mt-4">
            Ative a IA, conecte o WhatsApp e valide todos os módulos com dados reais do seu negócio
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {motivos.map((motivo, index) => (
            <div key={motivo.title} className="bg-gray-50 border border-gray-200 rounded-3xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-200 to-teal-200 flex items-center justify-center text-green-700 mb-6 text-2xl font-bold">
                <motivo.icon className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                {motivo.title}
              </h3>
              <p className="text-gray-600 text-base">
                {motivo.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link href="/signup">
            <Button size="lg" className="bg-[#22C55E] hover:bg-[#1ea851] text-white font-bold text-lg px-10 py-6 rounded-xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]">
              Criar minha conta grátis
            </Button>
          </Link>
          <p className="text-sm text-gray-500 mt-4">
            Se não fizer sentido, cancele direto do painel e mantenha seus dados exportados
          </p>
        </div>
      </div>
    </section>
  );
}
