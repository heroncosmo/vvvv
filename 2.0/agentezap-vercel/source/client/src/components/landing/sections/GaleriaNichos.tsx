import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Eye, Users } from "lucide-react";
import MockupCelular from "../shared/MockupCelular";
import LazyImage from "../shared/LazyImage";

export default function GaleriaNichos() {
  const nichos = [
    {
      niche: "Clínica",
      badge: "Agenda cheia",
      ambienteFoto: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=300&h=200&fit=crop&auto=format",
      pessoaFoto: "https://images.unsplash.com/photo-1594824475065-1c2a9e8dcf9e?w=100&h=100&fit=crop&crop=face&auto=format",
      messages: [
        { sender: "user" as const, text: "Oi, vocês têm horário para limpeza de pele essa semana?" },
        { sender: "bot" as const, text: "Oi! Que bom falar com você 😊 Posso te mandar algumas opções de dia e horário?" },
        { sender: "user" as const, text: "Pode sim." },
        { sender: "bot" as const, text: "Perfeito! Tenho vagas na *terça às 15h* e na *quinta às 19h*. Qual é melhor pra você?" },
        { sender: "user" as const, text: "Quinta às 19h." },
        { sender: "bot" as const, text: "Prontinho! ✔️ Seu horário está reservado para *quinta às 19h*. Vou te enviar um lembrete no dia." }
      ]
    },
    {
      niche: "Salão",
      badge: "IA 24/7",
      ambienteFoto: "https://images.unsplash.com/photo-1560066984-1389adb5c0d1?w=300&h=200&fit=crop&auto=format",
      pessoaFoto: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face&auto=format",
      messages: [
        { sender: "user" as const, text: "Oi, queria fazer corte e escova amanhã, ainda tem vaga?" },
        { sender: "bot" as const, text: "Oi! Tenho sim, posso pedir só seu nome e horário preferido?" },
        { sender: "user" as const, text: "Camila, depois das 18h." },
        { sender: "bot" as const, text: "Camila, tenho *18h30* e *19h*. Qual você prefere?" },
        { sender: "user" as const, text: "18h30." },
        { sender: "bot" as const, text: "Agendado! 💇‍♀️ Corte + escova amanhã às *18h30*. Qualquer coisa é só responder aqui." }
      ]
    },
    {
      niche: "Loja Online",
      badge: "Venda automática",
      ambienteFoto: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=300&h=200&fit=crop&auto=format",
      pessoaFoto: "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=100&h=100&fit=crop&crop=face&auto=format",
      messages: [
        { sender: "user" as const, text: "Oi, esse vestido azul ainda está disponível no tamanho M?" },
        { sender: "bot" as const, text: "Oi! Está sim 😊 Quer receber o link direto pra finalizar o pedido?" },
        { sender: "user" as const, text: "Quero." },
        { sender: "bot" as const, text: "Aqui está o link seguro para compra: [link]. Frete grátis acima de R$ 199." },
        { sender: "user" as const, text: "Feito, acabei de pagar." },
        { sender: "bot" as const, text: "Perfeito! 🎉 Pagamento aprovado, vamos postar seu pedido ainda hoje e te aviso com o código de rastreio." }
      ]
    },
    {
      niche: "Academia",
      badge: "Faturamento +30%",
      ambienteFoto: "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=300&h=200&fit=crop&auto=format",
      pessoaFoto: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=100&h=100&fit=crop&crop=face&auto=format",
      messages: [
        { sender: "user" as const, text: "Oi, como funciona o plano mensal de vocês?" },
        { sender: "bot" as const, text: "Oi! Posso te mandar um resumo rápido dos planos?" },
        { sender: "user" as const, text: "Pode." },
        { sender: "bot" as const, text: "Temos o *Plano Mensal* (R$ 149) e o *Plano 3 meses* (R$ 399) com acesso livre à academia e aulas em grupo. Quer que eu já te envie o link para matrícula?" },
        { sender: "user" as const, text: "Quero o de 3 meses." },
        { sender: "bot" as const, text: "Ótimo! 💪 Aqui está o link para matrícula no plano 3 meses: [link]. Qualquer dúvida, é só responder aqui." }
      ]
    },
    {
      niche: "Consultoria B2B",
      badge: "Lead qualificado",
      ambienteFoto: "https://images.unsplash.com/photo-1497366216548-375f70e3fcbb?w=300&h=200&fit=crop&auto=format",
      pessoaFoto: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face&auto=format",
      messages: [
        { sender: "user" as const, text: "Oi, vi que vocês ajudam empresas com WhatsApp. Como funciona?" },
        { sender: "bot" as const, text: "Oi! 👋 Pra te indicar a melhor solução, posso te fazer 2 perguntas rápidas sobre o seu volume de atendimento?" },
        { sender: "user" as const, text: "Pode." },
        { sender: "bot" as const, text: "1/2 – Em média, quantas mensagens vocês recebem por dia no WhatsApp?" },
        { sender: "user" as const, text: "Entre 100 e 150." },
        { sender: "bot" as const, text: "2/2 – Hoje vocês já usam alguma ferramenta ou fazem tudo manual?" },
        { sender: "user" as const, text: "Tudo manual." },
        { sender: "bot" as const, text: "Entendi, obrigado! Vou te indicar um plano e posso agendar uma call de 20 min com um especialista. Qual o melhor horário pra falar com você amanhã?" }
      ]
    },
    {
      niche: "Infoprodutor",
      badge: "Lançamento ativo",
      ambienteFoto: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=300&h=200&fit=crop&auto=format",
      pessoaFoto: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face&auto=format",
      messages: [
        { sender: "user" as const, text: "Oi, vi seu curso de marketing no anúncio, ainda dá pra entrar?" },
        { sender: "bot" as const, text: "Oi! Dá sim 😊 Estamos na última semana de inscrições. Posso te mandar o resumo do curso e o valor?" },
        { sender: "user" as const, text: "Manda." },
        { sender: "bot" as const, text: "O curso tem 8 módulos práticos, suporte por WhatsApp e acesso por 1 ano. O investimento hoje está em *R$ 997* à vista ou em até 12x. Quer garantir sua vaga agora?" },
        { sender: "user" as const, text: "Quero parcelar." },
        { sender: "bot" as const, text: "Perfeito! 💳 Vou te enviar o link de pagamento em até 12x: [link]. Assim que pagar, seu acesso é liberado automaticamente." }
      ]
    }
  ];

  return (
    <section id="nichos" className="py-24 bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <div className="lg:grid lg:grid-cols-[1fr_2fr] lg:items-start gap-16">
            <div className="text-center lg:text-left">
              <Badge className="inline-flex items-center gap-2 bg-white/10 text-white px-6 py-3 rounded-full text-lg font-bold mb-8 backdrop-blur-md border border-white/20">
                <Sparkles className="w-6 h-6" />
                Veja como funciona em diferentes nichos
              </Badge>
              
              <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
                Plataforma adaptada para{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-info to-success">qualquer tipo de negócio</span>
              </h2>
              
              <p className="text-xl text-neutral-300 lg:pr-8">
                Da clínica ao infoprodutor, do salão à consultoria – veja exemplos reais de conversas e fluxos prontos para o seu segmento.
              </p>

              <div className="flex items-center justify-center lg:justify-start gap-2 text-neutral-400 mt-6">
                <Eye className="w-4 h-4" />
                <span className="text-sm">Conversas reais com IA treinada</span>
              </div>
            </div>

            {/* Grid de Mockups */}
            <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-8 lg:gap-10 mt-12 lg:mt-0">
              {nichos.map((nicho, index) => (
                <div key={index} className="group">
                  <div className="relative">
                    {/* Foto de ambiente ao fundo */}
                    <div className="absolute inset-0 -z-10">
                      <LazyImage 
                        src={nicho.ambienteFoto}
                        alt={`Ambiente ${nicho.niche}`}
                        className="w-full h-full object-cover rounded-2xl opacity-30 blur-sm"
                        style={{
                          filter: 'brightness(0.8) saturate(0.7)'
                        }}
                      />
                    </div>
                    
                    {/* Mockup principal */}
                    <MockupCelular 
                      niche={nicho.niche}
                      messages={nicho.messages}
                      badge={nicho.badge}
                      className="mx-auto group-hover:scale-105 transition-transform duration-300 relative z-10"
                    />
                    
                    {/* Pessoa do nicho */}
                    {nicho.pessoaFoto && (
                      <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 z-20">
                        <div className="relative">
                          <LazyImage 
                            src={nicho.pessoaFoto}
                            alt={`Profissional ${nicho.niche}`}
                            className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-lg group-hover:scale-110 transition-transform duration-300"
                            style={{
                              filter: 'brightness(1.1) saturate(1.2)'
                            }}
                          />
                          {/* Badge de status */}
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-white"></div>
                        </div>
                      </div>
                    )}
                    
                    {/* Informações do nicho */}
                    <div className="mt-8 text-center">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <h3 className="text-xl font-bold text-white">
                          {nicho.niche}
                        </h3>
                        <Users className="w-4 h-4 text-neutral-400" />
                      </div>
                      <p className="text-neutral-400 text-sm">
                        {index === 0 && "Agendamentos automáticos e confirmações por WhatsApp"}
                        {index === 1 && "Gestão de horários e reagendamentos inteligentes"}
                        {index === 2 && "Vendas automatizadas com qualificação de clientes"}
                        {index === 3 && "Venda de planos e gestão de matrículas online"}
                        {index === 4 && "Qualificação de leads e agendamento de reuniões"}
                        {index === 5 && "Funil de vendas automatizado para lançamentos"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="mt-16">
          <div className="bg-gradient-to-r from-info/20 to-success/20 rounded-3xl p-8 lg:p-12 backdrop-blur-sm border border-white/10 text-center lg:text-left lg:flex lg:items-center lg:justify-between lg:gap-10">
            <div>
              <h3 className="text-2xl font-bold text-white mb-4">
                Pronto para transformar seu WhatsApp?
              </h3>
              <p className="text-neutral-300 mb-6 lg:mb-0 max-w-2xl">
                Veja como a IA pode trabalhar para o seu tipo de negócio específico em poucos minutos.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-end">
              <Link href="/signup" className="w-full sm:w-auto">
                <button className="bg-gradient-to-r from-info to-success hover:from-info-600 hover:to-success-600 text-white px-8 py-3 rounded-2xl text-lg font-bold shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 w-full">
                  Criar minha conta grátis
                </button>
              </Link>
              <button className="bg-white/10 hover:bg-white/20 text-white px-8 py-3 rounded-2xl text-lg font-semibold border border-white/20 backdrop-blur-sm transition-all duration-300">
                Ver todos os exemplos
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
