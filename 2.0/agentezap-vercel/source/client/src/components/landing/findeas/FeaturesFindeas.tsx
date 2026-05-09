import { 
  Palette, 
  Code, 
  FolderDown, 
  MessageCircle, 
  Zap, 
  Shield, 
  Bot, 
  BarChart3, 
  Sparkles,
  Target,
  Clock,
  Users,
  CheckCircle2,
  TrendingUp
} from "lucide-react";

export default function FeaturesFindeas() {
  const features = [
    {
      icon: Palette,
      title: "Design Moderno",
      description: "Interface profissional e intuitiva que encanta seus clientes desde o primeiro contato.",
      benefit: "+45% engajamento"
    },
    {
      icon: Code,
      title: "Código Limpo",
      description: "Tecnologia robusta e escalável que cresce junto com seu negócio.",
      benefit: "+200% performance"
    },
    {
      icon: FolderDown,
      title: "Atualizações Regulares",
      description: "Melhorias constantes com novas funcionalidades e correções automáticas.",
      benefit: "Sempre atualizado"
    },
    {
      icon: MessageCircle,
      title: "Suporte 24/7",
      description: "Equipe especializada sempre pronta para ajudar você em qualquer situação.",
      benefit: "Resposta rápida"
    },
    {
      icon: Zap,
      title: "Velocidade Ultra-Rápida",
      description: "Processamento instantâneo de mensagens com entrega em milissegundos.",
      benefit: "99.9% uptime"
    },
    {
      icon: Shield,
      title: "Segurança Enterprise",
      description: "Criptografia ponta a ponta e conformidade total com LGPD.",
      benefit: "100% seguro"
    }
  ];

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-neutral-900 mb-6">
              Quebre a barreira do código, economize seu{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">tempo de desenvolvimento</span>{" "}
              com as funcionalidades do AgenteZap
            </h2>
            <p className="text-xl text-neutral-600 max-w-4xl mx-auto">
              Economize horas de trabalho e implemente soluções profissionais em minutos
            </p>
          </div>
          
          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 justify-items-center">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="bg-neutral-50 rounded-xl p-8 h-full hover:bg-primary hover:text-white hover:shadow-xl hover:-translate-y-2 transition-all duration-300 cursor-pointer group"
                style={{
                  animationDelay: `${index * 100}ms`
                }}
              >
                <div className="flex flex-col items-center text-center space-y-4">
                  {/* Icon */}
                  <div className="w-16 h-16 bg-primary/10 group-hover:bg-white/20 rounded-2xl flex items-center justify-center mb-6 transition-colors">
                    <feature.icon className={`w-8 h-8 text-primary group-hover:text-white transition-colors`} />
                  </div>
                  
                  {/* Content */}
                  <div className="space-y-3">
                    <h3 className="text-xl font-bold text-neutral-900 group-hover:text-white transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-neutral-600 group-hover:text-white/90 leading-relaxed transition-colors">
                      {feature.description}
                    </p>
                    
                    {/* Benefit Badge */}
                    <div className="inline-flex items-center gap-2 bg-success/10 text-success px-3 py-1 rounded-full text-sm font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      {feature.benefit}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="text-center mt-16">
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-primary to-accent p-1 rounded-2xl">
              <div className="bg-white px-8 py-6 rounded-2xl">
                <h3 className="text-2xl font-bold text-neutral-900 mb-3">
                  🚀 Pronto para transformar seu WhatsApp?
                </h3>
                <p className="text-neutral-600 mb-4">
                  Comece hoje e veja os resultados nas primeiras 24 horas
                </p>
                <a 
                  href="#signup" 
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-8 py-4 rounded-xl text-lg font-bold shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
                >
                  Começar Transformação Agora
                  <Zap className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
