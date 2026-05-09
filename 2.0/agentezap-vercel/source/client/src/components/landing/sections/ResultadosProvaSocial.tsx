import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Users, Target, Star, Quote } from "lucide-react";
import LazyImage from "../shared/LazyImage";

export default function ResultadosProvaSocial() {
  const metricas = [
    {
      icon: TrendingUp,
      value: "−60%",
      label: "tempo gasto em atendimento manual",
      color: "text-success"
    },
    {
      icon: Target,
      value: "+35%",
      label: "conversões em campanhas de WhatsApp",
      color: "text-info"
    },
    {
      icon: Users,
      value: "+450",
      label: "agendamentos confirmados por mês",
      color: "text-highlight"
    }
  ];

  const depoimentos = [
    {
      name: "Maria Silva",
      business: "Clínica de Estética",
      avatar: "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=60&h=60&fit=crop&crop=face",
      content: "Reduzi o tempo de atendimento em 60% e consegui focar no que importa: cuidar dos meus clientes. A IA do AgenteZap faz todo o trabalho pesado.",
      rating: 5
    },
    {
      name: "João Santos",
      business: "Consultoria de TI",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=60&h=60&fit=crop&crop=face",
      content: "Finalmente consigo qualificar leads automaticamente enquanto durmo. O retorno sobre o investimento veio no primeiro mês.",
      rating: 5
    },
    {
      name: "Ana Costa",
      business: "Salão de Beleza",
      avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=60&h=60&fit=crop&crop=face",
      content: "As campanhas em massa transformaram meu negócio. Consigo reativar clientes antigos com poucos cliques.",
      rating: 5
    }
  ];

  const logos = [
    { name: "Clínica Saúde", color: "bg-blue-500" },
    { name: "Beleza Pura", color: "bg-pink-500" },
    { name: "Tech Solutions", color: "bg-purple-500" },
    { name: "Academia Fit", color: "bg-green-500" },
    { name: "Consultoria Pro", color: "bg-orange-500" },
    { name: "Restaurante Sabor", color: "bg-red-500" }
  ];

  return (
    <section id="resultados" className="py-24 relative overflow-hidden">
      {/* Background suave com pessoas */}
      <div className="absolute inset-0 opacity-15">
        <LazyImage 
          src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1920&h=1080&fit=crop&auto=format"
          alt="Equipe de atendimento sorrindo"
          className="w-full h-full object-cover"
          style={{
            filter: 'blur(2px) saturate(0.8)',
            transform: 'scale(1.1)'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-50/95 via-white/90 to-white/95"></div>
      </div>
      
      <div className="relative z-10 container mx-auto px-6">
        {/* Título da Seção */}
        <div className="max-w-6xl mx-auto text-center mb-16">
          <Badge className="inline-flex items-center gap-2 bg-highlight/10 text-highlight px-6 py-3 rounded-full text-lg font-bold mb-8">
            <Target className="w-6 h-6" />
            O que muda na prática para quem usa a plataforma
          </Badge>
          
          <h2 className="text-4xl lg:text-5xl font-bold text-neutral-900 mb-6">
            Resultados reais que transformam negócios
          </h2>
          
          <p className="text-xl text-neutral-600 max-w-4xl mx-auto">
            Veja como empreendedores como você estão vendendo mais e trabalhando menos
          </p>
        </div>

        {/* Bloco de Métricas */}
        <div className="grid md:grid-cols-3 gap-8 mb-20">
          {metricas.map((metrica, index) => (
            <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
              <CardContent className="p-8 text-center">
                <div className={`w-16 h-16 ${metrica.color}/10 rounded-2xl flex items-center justify-center mx-auto mb-6`}>
                  <metrica.icon className={`w-8 h-8 ${metrica.color}`} />
                </div>
                
                <div className="text-5xl font-bold text-neutral-900 mb-2">
                  {metrica.value}
                </div>
                
                <p className="text-lg text-neutral-600 font-medium">
                  {metrica.label}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Depoimentos */}
        <div className="mb-20">
          <div className="max-w-4xl mx-auto text-center mb-12">
            <h3 className="text-3xl font-bold text-neutral-900 mb-4">
              Histórias de sucesso reais
            </h3>
            <p className="text-lg text-neutral-600">
              Empreendedores que transformaram o atendimento com IA
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {depoimentos.map((depoimento, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
                <CardContent className="p-8">
                  <div className="flex items-start gap-4 mb-6">
                    <LazyImage 
                      src={depoimento.avatar} 
                      alt={depoimento.name}
                      className="w-14 h-14 rounded-full object-cover"
                    />
                    <div>
                      <h4 className="font-bold text-neutral-900">{depoimento.name}</h4>
                      <p className="text-sm text-neutral-600">{depoimento.business}</p>
                    </div>
                  </div>
                  
                  <Quote className="w-8 h-8 text-info/20 mb-4" />
                  
                  <p className="text-neutral-700 mb-6 leading-relaxed">
                    "{depoimento.content}"
                  </p>
                  
                  <div className="flex items-center gap-1">
                    {[...Array(depoimento.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-warning text-warning" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Faixa de Clientes Reais */}
        <div className="mb-16">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-neutral-900 mb-4">
              +120 empreendedores transformaram seus negócios
            </h3>
            <div className="inline-flex items-center gap-2 bg-success/10 text-success px-4 py-2 rounded-full text-sm font-bold">
              <Star className="w-4 h-4 fill-current" />
              Média de satisfação: 4.9/5
            </div>
          </div>
          
          <div className="flex justify-center items-center gap-4 overflow-x-auto pb-4">
            {[
              "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=80&h=80&fit=crop&crop=face",
              "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face",
              "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face",
              "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face",
              "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&h=80&fit=crop&crop=face",
              "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face",
              "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face",
              "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=80&h=80&fit=crop&crop=face"
            ].map((foto, index) => (
              <div key={index} className="relative group">
                <LazyImage 
                  src={foto} 
                  alt={`Cliente ${index + 1}`}
                  className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-lg group-hover:scale-110 transition-transform duration-300"
                  style={{
                    filter: 'brightness(1.05) saturate(1.1)'
                  }}
                />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
              </div>
            ))}
            <div className="w-16 h-16 rounded-full bg-neutral-200 border-2 border-white shadow-lg flex items-center justify-center">
              <span className="text-xs font-bold text-neutral-600">+100</span>
            </div>
          </div>
        </div>

        {/* Logos de Clientes */}
        <div className="text-center">
          <h3 className="text-2xl font-bold text-neutral-900 mb-8">
            Marcas que confiam na nossa plataforma
          </h3>
          
          <div className="flex flex-wrap justify-center items-center gap-8 opacity-60">
            {logos.map((logo, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className={`w-3 h-3 ${logo.color} rounded-full`}></div>
                <span className="text-sm font-medium text-neutral-600">{logo.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
