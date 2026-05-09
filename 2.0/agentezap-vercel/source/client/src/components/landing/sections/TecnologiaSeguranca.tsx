import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Shield, 
  Lock, 
  Server, 
  Database, 
  Zap, 
  CheckCircle,
  Cpu,
  Globe,
  RefreshCw
} from "lucide-react";

export default function TecnologiaSeguranca() {
  const tecnologias = [
    {
      icon: Server,
      title: "Supabase Auth",
      description: "Autenticação híbrida com JWT para usuários finais e sessões admin"
    },
    {
      icon: Database,
      title: "PostgreSQL",
      description: "Banco de dados robusto com backups automáticos e criptografia"
    },
    {
      icon: Zap,
      title: "WebSockets",
      description: "Atualizações em tempo real das conversas e notificações instantâneas"
    },
    {
      icon: Cpu,
      title: "Rate Limiting",
      description: "Proteção contra sobrecarga e abusos com monitoramento ativo"
    },
    {
      icon: RefreshCw,
      title: "Logs & Monitoramento",
      description: "Registro completo de atividades e alertas automáticas de erros"
    },
    {
      icon: Globe,
      title: "API REST",
      description: "Integrações simplificadas com documentação completa"
    }
  ];

  const beneficios = [
    {
      title: "Segurança de Dados",
      description: "Criptografia ponta a ponta com bcrypt e validação rigorosa de inputs",
      icon: Lock
    },
    {
      title: "Conformidade LGPD",
      description: "Tratamento de dados em conformidade com regulamentações de privacidade",
      icon: Shield
    },
    {
      title: "Backup Automático",
      description: "Backups diários com retenção de 30 dias e restauração fácil",
      icon: Database
    },
    {
      title: "Alta Disponibilidade",
      description: "99.9% uptime com monitoramento 24/7 e resposta rápida a incidentes",
      icon: Server
    }
  ];

  return (
    <section id="tecnologia" className="py-24 bg-gradient-to-b from-neutral-50 to-white">
      <div className="container mx-auto px-6">
        {/* Título da Seção */}
        <div className="max-w-6xl mx-auto text-center mb-16">
          <Badge className="inline-flex items-center gap-2 bg-info/10 text-info px-6 py-3 rounded-full text-lg font-bold mb-8">
            <Shield className="w-6 h-6" />
            Tecnologia e segurança enterprise level
          </Badge>
          
          <h2 className="text-4xl lg:text-5xl font-bold text-neutral-900 mb-6">
            Base sólida e{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-info to-success">
              pronta para escalar
            </span>
          </h2>
          
          <p className="text-xl text-neutral-600 max-w-4xl mx-auto">
            Infraestrutura robusta com as melhores práticas de segurança e performance
          </p>
        </div>

        <div className="max-w-6xl mx-auto lg:grid lg:grid-cols-2 gap-16">
          {/* Coluna Esquerda - Para Empresendedores */}
          <div>
            <div className="bg-white rounded-3xl shadow-xl p-8 lg:p-12 mb-8">
              <h3 className="text-2xl font-bold text-neutral-900 mb-6 flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-success" />
                O que isso significa para você
              </h3>
              
              <div className="space-y-6">
                {beneficios.map((beneficio, index) => (
                  <Card key={index} className="border-0 shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center flex-shrink-0`}>
                          <beneficio.icon className="w-6 h-6 text-neutral-600" />
                        </div>
                        
                        <div>
                          <h4 className="text-lg font-bold text-neutral-900 mb-2">
                            {beneficio.title}
                          </h4>
                          <p className="text-neutral-600 leading-relaxed">
                            {beneficio.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              <div className="mt-8 p-6 bg-gradient-to-r from-info/5 to-success/5 rounded-2xl">
                <h4 className="text-xl font-bold text-white mb-4">
                  Seus dados estão seguros e protegidos
                </h4>
                <p className="text-neutral-100 leading-relaxed">
                  Trabalhamos com especialistas em segurança para garantir que suas conversas, 
                  dados de clientes e informações de negócio estejam sempre protegidos 
                  com criptografia de ponta a ponta.
                </p>
              </div>
            </div>
          </div>

          {/* Coluna Direita - Para Desenvolvedores */}
          <div>
            <div className="bg-gradient-to-br from-neutral-900 to-slate-800 rounded-3xl shadow-xl p-8 lg:p-12 text-white">
              <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                <Cpu className="w-6 h-6 text-info" />
                Especificações Técnicas
              </h3>
              
              <div className="grid md:grid-cols-2 gap-8 mb-8">
                {tecnologias.map((tech, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/20">
                      <tech.icon className="w-6 h-6 text-info" />
                    </div>
                    
                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-white mb-1">
                        {tech.title}
                      </h4>
                      <p className="text-neutral-300 text-sm leading-relaxed">
                        {tech.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/20 pt-8">
                <h4 className="text-xl font-bold text-white mb-4">
                  Stack Tecnologico
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm text-neutral-400">
                  <div>
                    <span className="text-neutral-300">Frontend:</span>
                    <div>React + TypeScript + Tailwind CSS</div>
                  </div>
                  <div>
                    <span className="text-neutral-300">Backend:</span>
                    <div>Node.js + Express + Supabase</div>
                  </div>
                  <div>
                    <span className="text-neutral-300">Database:</span>
                    <div>PostgreSQL + Redis</div>
                  </div>
                  <div>
                    <span className="text-neutral-300">Deploy:</span>
                    <div>Docker + AWS</div>
                  </div>
                  <div>
                    <span className="text-neutral-300">CDN:</span>
                    <div>Cloudflare + Vercel</div>
                  </div>
                </div>
              </div>

              {/* Badges de Conformidade */}
              <div className="mt-8 pt-8 border-t border-white/20">
                <h4 className="text-lg font-bold text-white mb-4">
                  Certificações e Conformidade
                </h4>
                <div className="flex flex-wrap gap-3">
                  <Badge className="bg-success/20 text-success px-3 py-1 rounded-full text-xs font-semibold">
                    ISO 27001
                  </Badge>
                  <Badge className="bg-info/20 text-info px-3 py-1 rounded-full text-xs font-semibold">
                    LGPD Compliant
                  </Badge>
                  <Badge className="bg-warning/20 text-warning px-3 py-1 rounded-full text-xs font-semibold">
                    SOC 2 Type II
                  </Badge>
                  <Badge className="bg-highlight/20 text-highlight px-3 py-1 rounded-full text-xs font-semibold">
                    PCI DSS
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="mt-16 text-center">
          <div className="bg-gradient-to-r from-neutral-100 to-white rounded-3xl p-8 border border-neutral-200">
            <h3 className="text-2xl font-bold text-neutral-900 mb-4">
              Precisa de mais detalhes técnicos?
            </h3>
            <p className="text-neutral-600 mb-6 max-w-2xl mx-auto">
              Nossa equipe técnica está disponível para discutir integrações e requisitos específicos
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="bg-info hover:bg-info-600 text-white px-8 py-3 rounded-2xl text-lg font-bold shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
                Ver Documentação da API
              </button>
              <button className="bg-white border-2 border-neutral-300 hover:border-neutral-400 text-neutral-900 px-8 py-3 rounded-2xl text-lg font-semibold transition-all duration-300">
                Falar com Time Técnico
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
