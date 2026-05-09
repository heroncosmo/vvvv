import { 
  Search, 
  MessageSquare, 
  Calendar, 
  Users, 
  Zap, 
  CheckCircle2,
  ArrowRight,
  Bot
} from "lucide-react";

export default function ProcessFindeas() {
  const steps = [
    {
      number: 1,
      title: "Descubra a IA que vai transformar suas vendas",
      description: "Conheça o poder da inteligência artificial trabalhando 24/7 para sua empresa",
      icon: Search,
      color: "bg-blue-500"
    },
    {
      number: 2,
      title: "Converse com nossa IA e veja a magia",
      description: "Teste em tempo real como nossa IA conversa e converte clientes automaticamente",
      icon: MessageSquare,
      color: "bg-green-500"
    },
    {
      number: 3,
      title: "Agende sua demonstração personalizada",
      description: "Receba uma apresentação exclusiva montada para o seu nicho de negócio",
      icon: Calendar,
      color: "bg-purple-500"
    },
    {
      number: 4,
      title: "Junte-se a +2.847 empresas já transformadas",
      description: "Faça parte do seleto grupo que vende mais enquanto dorme",
      icon: Users,
      color: "bg-orange-500"
    }
  ];

  return (
    <section className="py-20 bg-neutral-50">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-neutral-900 mb-6">
              Seu caminho para{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">automatização completa</span>
            </h2>
            <p className="text-xl text-neutral-600 max-w-3xl mx-auto">
              4 passos simples para transformar completamente seu atendimento e vendas
            </p>
          </div>

          {/* Steps Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
            {steps.map((step, index) => (
              <div 
                key={index}
                className="relative group"
                style={{
                  animationDelay: `${index * 200}ms`
                }}
              >
                {/* Step Number Badge */}
                <div className="absolute -top-4 left-6 z-10 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold text-sm shadow-lg">
                  {step.number}
                </div>
                
                {/* Step Card */}
                <div className="bg-white rounded-2xl p-8 h-full border border-neutral-200 hover:border-primary hover:shadow-xl transition-all duration-300 group-hover:-translate-y-2">
                  {/* Icon */}
                  <div className={`w-16 h-16 ${step.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <step.icon className="w-8 h-8 text-white" />
                  </div>
                  
                  {/* Content */}
                  <div className="space-y-3">
                    <h3 className="text-xl font-bold text-neutral-900">
                      {step.title}
                    </h3>
                    <p className="text-neutral-600 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>

                {/* Connection Arrow - Desktop */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-20">
                    <ArrowRight className="w-8 h-8 text-primary animate-pulse" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Interactive Demo Section */}
          <div className="bg-gradient-to-br from-primary via-accent to-primary rounded-3xl p-12 text-center text-white">
            <div className="max-w-4xl mx-auto">
              <div className="flex justify-center mb-8">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <Bot className="w-10 h-10 text-white" />
                </div>
              </div>
              
              <h3 className="text-3xl lg:text-4xl font-bold mb-6">
                Experimente a IA que revoluciona vendas
              </h3>
              <p className="text-xl mb-8 text-white/90">
                Converse agora com nossa IA e sinta o poder de ter um vendedor que nunca dorme
              </p>
              
              {/* WhatsApp Demo Button */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <a 
                  href="https://wa.me/5511999999999?text=Ol%C3%A1%21%20Quero%20testar%20a%20IA%20de%20vendas%20do%20AgenteZap"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 bg-success hover:bg-success/90 text-white px-8 py-4 rounded-2xl text-lg font-bold shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
                >
                  <MessageSquare className="w-6 h-6" />
                  Testar IA no WhatsApp Agora
                  <CheckCircle2 className="w-5 h-5" />
                </a>
                
                <div className="flex items-center gap-2 text-white/80">
                  <Zap className="w-5 h-5" />
                  <span className="text-sm">Resposta em segundos</span>
                </div>
              </div>
              
              {/* Trust Indicators */}
              <div className="flex flex-wrap justify-center gap-6 mt-8 text-white/80">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm">Sem compromisso</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm">Configuração grátis</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm">Suporte especializado</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
