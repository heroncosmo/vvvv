import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import LazyImage from "../shared/LazyImage";

export default function CTAFinal() {
  return (
    <section id="cta-final" className="py-32 relative overflow-hidden">
      {/* Background emocional com pessoa sorrindo à noite */}
      <div className="absolute inset-0">
        <LazyImage 
          src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1920&h=1080&fit=crop&auto=format"
          alt="Dono de negócio sorrindo à noite com luz de tela no rosto"
          className="w-full h-full object-cover"
          style={{
            filter: 'brightness(0.7) saturate(1.2)',
            transform: 'scale(1.1)'
          }}
        />
        {/* Overlay escuro com gradiente */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-800/80 to-slate-900/90"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/40"></div>
      </div>

      {/* Elementos decorativos de fundo */}
      <div className="absolute inset-0 overflow-hidden z-10">
        <div className="absolute top-20 left-10 w-64 h-64 bg-green-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-teal-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      <div className="container mx-auto px-6 relative z-20">
        {/* Título Principal - Layout limpo conforme documento */}
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-8 leading-tight">
            Teste hoje a sua IA no WhatsApp com CRM, campanhas e agenda integrados – e veja em poucos dias se é o que faltava no seu negócio
          </h2>
          
          <p className="text-lg md:text-xl text-gray-300 mb-12 leading-relaxed">
            Teste grátis, sem cartão e sem compromisso.
          </p>

          {/* CTA Principal - Único botão conforme documento */}
          <div className="flex justify-center mb-8">
            <Link href="/signup">
              <Button 
                size="lg" 
                className="bg-[#22C55E] hover:bg-[#1ea851] text-white font-bold text-lg md:text-xl px-12 py-7 rounded-xl shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
              >
                Começar meu teste agora
                <ArrowRight className="ml-3 w-6 h-6" />
              </Button>
            </Link>
          </div>

          {/* Texto de confiança - Texto exato conforme documento */}
          <p className="text-gray-300 text-base md:text-lg leading-relaxed">
            Se não fizer sentido, você cancela com 1 clique – e continua com seus contatos, funil e aprendizados.
          </p>
        </div>
      </div>
    </section>
  );
}
