import { useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Brain, BarChart3, Send, Calendar, CreditCard, Shield, Zap } from "lucide-react";
import { modulosData } from "../data/modulos";
import AccordionItem from "../shared/AccordionItem";

export default function ModulosDetalhe() {
  const [activeTab, setActiveTab] = useState(0);

  const tabs = [
    { id: 0, name: "IA no WhatsApp", icon: Brain },
    { id: 1, name: "CRM & Funil", icon: BarChart3 },
    { id: 2, name: "Marketing", icon: Send },
    { id: 3, name: "Agenda", icon: Calendar },
    { id: 4, name: "Pagamentos", icon: CreditCard },
    { id: 5, name: "Admin", icon: Shield },
    { id: 6, name: "API & Integrações", icon: Zap }
  ];

  return (
    <section id="detalhes" className="py-24 bg-gradient-to-b from-white to-neutral-50">
      <div className="container mx-auto px-6">
        {/* Título da Seção */}
        <div className="max-w-6xl mx-auto text-center mb-16">
          <Badge className="inline-flex items-center gap-2 bg-highlight/10 text-highlight px-6 py-3 rounded-full text-lg font-bold mb-8">
            <Brain className="w-6 h-6" />
            Conheça cada módulo em detalhe
          </Badge>
          
          <h2 className="text-4xl lg:text-5xl font-bold text-neutral-900 mb-6">
            Tudo o que você precisa para{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-info to-success">
              automatizar e escalar seu negócio
            </span>
          </h2>
          
          <p className="text-xl text-neutral-600 max-w-4xl mx-auto">
            Cada módulo foi pensado para resolver um problema específico do seu dia a dia
          </p>
        </div>

        {/* Tabs de Navegação - Desktop */}
        <div className="hidden lg:flex justify-center mb-12">
          <div className="inline-flex bg-neutral-100 rounded-2xl p-1 shadow-lg">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'bg-white text-neutral-900 shadow-md'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
                }`}
              >
                <tab.icon className="w-5 h-5 inline mr-2" />
                {tab.name}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs Mobile - Scroll Horizontal */}
        <div className="lg:hidden mb-8">
          <div className="flex gap-4 overflow-x-auto pb-2 px-6 -mx-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg font-semibold transition-all duration-300 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-info text-white shadow-md'
                    : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <tab.icon className="w-4 h-4 inline mr-1" />
                <span className="text-sm">{tab.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Conteúdo das Tabs */}
        <div className="max-w-6xl mx-auto">
          {modulosData.map((modulo, index) => (
            <div
              key={index}
              className={`${
                activeTab === index ? 'block opacity-100' : 'hidden opacity-0'
              } transition-opacity duration-500`}
            >
              <div className="bg-white rounded-3xl shadow-xl p-8 lg:p-12 mb-8">
                <div className="flex items-start gap-6 mb-8">
                  <div className={`w-16 h-16 bg-gradient-to-br ${modulo.cor} rounded-2xl flex items-center justify-center shadow-lg text-2xl`}>
                    {modulo.icone}
                  </div>
                  
                  <div>
                    <h3 className="text-2xl lg:text-3xl font-bold text-neutral-900 mb-3">
                      {modulo.titulo}
                    </h3>
                    <p className="text-lg text-neutral-600 mb-4 max-w-2xl">
                      {modulo.descricao}
                    </p>
                  </div>
                </div>

                {/* Lista de Funcionalidades */}
                <div className="grid lg:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
                      <div className={`w-2 h-2 bg-success rounded-full`}></div>
                      Funcionalidades Principais
                    </h4>
                    
                    <ul className="space-y-4">
                      {modulo.detalhes?.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-start gap-3">
                          <div className="w-6 h-6 bg-success/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                            <div className="w-2 h-2 bg-success rounded-full"></div>
                          </div>
                          <span className="text-neutral-700 leading-relaxed">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  {/* Benefícios Visuais */}
                  <div className="bg-gradient-to-br from-info/5 to-success/5 rounded-2xl p-8 lg:p-8">
                    <h4 className="text-xl font-bold text-neutral-900 mb-6">
                      Por que isso importa para seu negócio?
                    </h4>
                    
                    <div className="space-y-4 text-neutral-700">
                      {index === 0 && (
                        <>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-info/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Brain className="w-4 h-4 text-info" />
                            </div>
                            <div>
                              <h5 className="font-semibold text-neutral-900 mb-1">Atendimento 24/7</h5>
                              <p className="text-sm">Nunca mais perca uma venda por estar offline</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-success/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <div className="w-4 h-4 bg-success rounded-full"></div>
                            </div>
                            <div>
                              <h5 className="font-semibold text-neutral-900 mb-1">Economia de Tempo</h5>
                              <p className="text-sm">Reduza o tempo gasto com atendimento repetitivo</p>
                            </div>
                          </div>
                        </>
                      )}
                      
                      {index === 1 && (
                        <>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-purple/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <BarChart3 className="w-4 h-4 text-purple" />
                            </div>
                            <div>
                              <h5 className="font-semibold text-neutral-900 mb-1">Visão Completa</h5>
                              <p className="text-sm">Veja exatamente onde cada lead está no funil</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-highlight/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <div className="w-4 h-4 bg-highlight rounded-full"></div>
                            </div>
                            <div>
                              <h5 className="font-semibold text-neutral-900 mb-1">Métricas Reais</h5>
                              <p className="text-sm">Acompanhe taxas de conversão por etapa</p>
                            </div>
                          </div>
                        </>
                      )}
                      
                      {index === 2 && (
                        <>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-orange/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Send className="w-4 h-4 text-orange" />
                            </div>
                            <div>
                              <h5 className="font-semibold text-neutral-900 mb-1">Alto Engajamento</h5>
                              <p className="text-sm">Mensagens personalizadas geram mais respostas</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-warning/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <div className="w-4 h-4 bg-warning rounded-full"></div>
                            </div>
                            <div>
                              <h5 className="font-semibold text-neutral-900 mb-1">Automação</h5>
                              <p className="text-sm">Agende campanhas para rodar sozinhas</p>
                            </div>
                          </div>
                        </>
                      )}
                      
                      {index === 3 && (
                        <>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-green/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Calendar className="w-4 h-4 text-green" />
                            </div>
                            <div>
                              <h5 className="font-semibold text-neutral-900 mb-1">Sem Furos</h5>
                              <p className="text-sm">Evite conflitos e sobreposição de horários</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-teal/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <div className="w-4 h-4 bg-teal rounded-full"></div>
                            </div>
                            <div>
                              <h5 className="font-semibold text-neutral-900 mb-1">Lembretes Automáticos</h5>
                              <p className="text-sm">Reduza não comparecimento em até 80%</p>
                            </div>
                          </div>
                        </>
                      )}
                      
                      {index === 4 && (
                        <>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-blue/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <CreditCard className="w-4 h-4 text-blue" />
                            </div>
                            <div>
                              <h5 className="font-semibold text-neutral-900 mb-1">Pagamentos Recorrentes</h5>
                              <p className="text-sm">Receba mensalmente sem precisar cobrar</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-indigo/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <div className="w-4 h-4 bg-indigo rounded-full"></div>
                            </div>
                            <div>
                              <h5 className="font-semibold text-neutral-900 mb-1">PIX Integrado</h5>
                              <p className="text-sm">Cobranças instantâneas via QR Code</p>
                            </div>
                          </div>
                        </>
                      )}
                      
                      {index === 5 && (
                        <>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-slate/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Shield className="w-4 h-4 text-slate" />
                            </div>
                            <div>
                              <h5 className="font-semibold text-neutral-900 mb-1">Segurança Total</h5>
                              <p className="text-sm">Seus dados e clientes protegidos</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-gray/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <div className="w-4 h-4 bg-gray rounded-full"></div>
                            </div>
                            <div>
                              <h5 className="font-semibold text-neutral-900 mb-1">Controle Total</h5>
                              <p className="text-sm">Gerencie usuários e permissões</p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* CTA do Módulo */}
                <div className="mt-8 pt-8 border-t border-neutral-200">
                  <div className="text-center">
                    <h4 className="text-xl font-bold text-neutral-900 mb-4">
                      Pronto para usar {modulo.titulo} no seu negócio?
                    </h4>
                    <p className="text-neutral-600 mb-6 max-w-2xl mx-auto">
                      Comece a automatizar este módulo hoje mesmo e veja os resultados na prática
                    </p>
                    
                    <Link href="/signup" className="inline-block">
                      <button className="bg-gradient-to-r from-info to-success hover:from-info-600 hover:to-success-600 text-white px-8 py-4 rounded-2xl text-lg font-bold shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
                        Criar minha conta grátis
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Versão Mobile em Accordion */}
        <div className="lg:hidden space-y-6">
          {modulosData.map((modulo, index) => (
            <AccordionItem
              key={index}
              title={modulo.titulo}
              icon={<span className="text-2xl">{modulo.icone}</span>}
              defaultOpen={index === 0}
              className="mb-6"
            >
              <div className="space-y-4">
                <p className="text-neutral-700 leading-relaxed mb-4">
                  {modulo.descricao}
                </p>
                
                <ul className="space-y-3">
                  {modulo.detalhes?.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-success/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <div className="w-2 h-2 bg-success rounded-full"></div>
                      </div>
                      <span className="text-neutral-700 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </AccordionItem>
          ))}
        </div>
      </div>
    </section>
  );
}
