import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, ArrowRight, CheckCircle2, Smartphone, Brain, BarChart3 } from "lucide-react";
import LazyImage from "../shared/LazyImage";

interface Step {
  step: string;
  icon: any;
  title: string;
  description: string;
  benefit: string;
}

const passosData: Step[] = [
  {
    step: "01",
    icon: Smartphone,
    title: "Conecte seu WhatsApp",
    description: "Escaneie o QR code e ative sua sessão segura.",
    benefit: "Setup instantâneo",
    personagemFoto: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=250&fit=crop&auto=format"
  },
  { 
    step: "02", 
    icon: Brain,
    title: "Ative a IA e seus fluxos",
    description: "Escolha um modelo pronto ou personalize as respostas e fluxos de atendimento.",
    benefit: "Personalização total",
    personagemFoto: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=250&fit=crop&auto=format"
  },
  {
    step: "03",
    icon: BarChart3,
    title: "Ligue CRM, campanhas e agenda",
    description: "Organize seu funil, importe contatos e deixe agendamentos e campanhas rodando.",
    benefit: "Resultados imediatos",
    personagemFoto: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=250&fit=crop&auto=format"
  }
];

interface Step {
  step: string;
  icon: any;
  title: string;
  description: string;
  benefit: string;
  personagemFoto?: string;
}

export default function ComoFunciona() {
  return (
    <section className="py-24 bg-gradient-to-b from-white to-[#F9FAFB]" id="como-funciona">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-8 leading-tight">
            Comece em 3 passos, sem precisar de time de tecnologia
          </h2>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
          {passosData.map((step, i) => (
            <div key={i} className="relative group">
              <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-2 h-full">
                <CardContent className="p-8 text-center">
                  {/* Foto do personagem realizando a ação */}
                  {step.personagemFoto && (
                    <div className="relative mb-6">
                      <LazyImage 
                        src={step.personagemFoto}
                        alt={`Passo ${step.step}: ${step.title}`}
                        className="w-32 h-40 object-cover rounded-xl mx-auto shadow-lg group-hover:scale-105 transition-transform duration-300"
                        style={{
                          filter: 'brightness(1.05) saturate(1.1)'
                        }}
                      />
                      
                      {/* Badge de ação específica */}
                      <div className="absolute top-2 right-2 bg-gradient-to-r from-info to-success text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                        {step.step}
                      </div>
                      
                      {/* Overlay com ícone da ação */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent rounded-xl"></div>
                      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-lg">
                        <step.icon className="w-6 h-6 text-info" />
                      </div>
                    </div>
                  )}
                  
                  <h3 className="text-xl font-bold text-neutral-900 mb-3">{step.title}</h3>
                  <p className="text-neutral-600 mb-4">{step.description}</p>
                  
                  <div className="inline-flex items-center gap-2 bg-success/10 text-success px-3 py-1 rounded-full text-sm font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    {step.benefit}
                  </div>
                </CardContent>
              </Card>
              
              {/* Setas conectando os passos */}
              {i < 2 && (
                <div className="hidden lg:block absolute top-1/2 -right-6 transform -translate-y-1/2">
                  <ArrowRight className="w-6 h-6 text-info" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
