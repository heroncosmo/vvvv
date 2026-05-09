import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap } from "lucide-react";
import LazyImage from "../shared/LazyImage";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background: Pessoa sorrindo com overlay das cores atuais */}
      <div className="absolute inset-0">
        <LazyImage 
          src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1920&h=1080&fit=crop&auto=format"
          alt="Pessoa sorrindo com celular"
          className="w-full h-full object-cover"
          style={{
            filter: 'brightness(0.8) saturate(1.1)',
            transform: 'scale(1.05)'
          }}
        />
        
        {/* Overlay com as cores atuais para legibilidade */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-900/90"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
      </div>
      
      {/* Conteúdo centralizado: Frase + CTA */}
      <div className="relative z-20 text-center px-6 max-w-4xl mx-auto">
        {/* Headline Principal */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-8">
          Sua central de <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-teal-400">vendas, atendimento e agenda</span> no WhatsApp, com IA cuidando de tudo em um só painel
        </h1>
        
        {/* Sub-headline breve */}
        <p className="text-lg md:text-xl lg:text-2xl text-gray-300 leading-relaxed mb-12 max-w-3xl mx-auto">
          Conecte seu número, ative a IA e gerencie conversas, funil, campanhas, agendamentos e assinaturas direto do WhatsApp
        </p>
        
        {/* CTA Único */}
        <div className="flex justify-center">
          <Link href="/signup" className="w-full sm:w-auto">
            <Button
              size="lg"
              className="bg-[#22C55E] hover:bg-[#1ea851] text-white font-bold text-lg md:text-xl px-8 py-6 rounded-xl shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 w-full sm:w-auto"
            >
              <Zap className="w-6 h-6" />
              Criar conta grátis e conectar meu WhatsApp
              <ArrowRight className="w-6 h-6" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
