import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Bot, ArrowRight, CheckCircle2, Star, Users, Zap, TrendingUp, Clock } from "lucide-react";
import LazyImage from "../shared/LazyImage";

export default function HeroFindeas() {
  const [isVisible, setIsVisible] = useState(false);
  const [currentMessage, setCurrentMessage] = useState(0);
  const [isTyping, setIsTyping] = useState(false);

  // Mensagens simuladas para o WhatsApp
  const messages = [
    { user: false, text: "Olá! 😊 Como posso ajudar você hoje?" },
    { user: true, text: "Quero saber sobre os planos" },
    { user: false, text: "Temos planos perfeitos para seu negócio! Posso te apresentar as opções?" },
    { user: true, text: "Sim, por favor!" },
    { user: false, text: "Perfeito! Temos o Plano Starter R$97/mês e o Professional R$197/mês. Qual quer conhecer?" },
  ];

  useEffect(() => {
    setIsVisible(true);
    
    // Simular mensagens no celular
    const messageInterval = setInterval(() => {
      setIsTyping(true);
      setTimeout(() => {
        setCurrentMessage((prev) => (prev + 1) % messages.length);
        setIsTyping(false);
      }, 1500);
    }, 4000);

    return () => clearInterval(messageInterval);
  }, []);

  const handleStartFree = () => {
    // Track conversion
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'conversion', {
        'send_to': 'AW-CONVERSION_ID/CONVERSION_LABEL'
      });
    }
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-findeas-light via-white to-neutral-50">
      {/* Background Pattern */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-findeas-primary/5 via-transparent to-findeas-accent/5"></div>
      </div>
      
      <div className="relative container mx-auto px-6 py-16 lg:py-24">
        <div className={`max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          
          {/* Left Content - Hero Text */}
          <div className="space-y-8 order-2 lg:order-1">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-highlight/10 text-highlight px-4 py-2 rounded-full text-sm font-semibold mb-6" data-aos="fade-down" data-aos-delay="200">
              <div className="w-2 h-2 bg-highlight rounded-full animate-pulse"></div>
              IA que vende 24/7 enquanto você dorme
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl lg:text-6xl xl:text-7xl font-bold leading-tight text-neutral-900" data-aos="fade-up" data-aos-delay="400">
              Transforme seu{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">WhatsApp</span>{" "}
              em{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">máquina de vendas</span>{" "}
              automática
            </h1>
            
            {/* Sub-headline */}
            <p className="text-xl text-neutral-600 leading-relaxed max-w-lg">
              Conecte em 2 minutos e tenha um agente IA vendendo, atendendo e qualificando 
              clientes 24/7. <span className="font-semibold text-neutral-900">Sem esforço, sem limites.</span>
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-4">
              <Link href="/signup">
                <Button 
                  size="lg" 
                  className="w-full sm:w-auto bg-primary hover:bg-primary-600 text-white px-8 py-4 rounded-2xl text-lg font-bold shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 group"
                  onClick={handleStartFree}
                >
                  <span>Começar Agora - Setup 2 Minutos</span>
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              
              {/* Secondary CTA */}
              <Link href="#demo">
                <Button 
                  variant="outline"
                  className="w-full sm:w-auto border-neutral-300 text-neutral-700 hover:bg-neutral-50 px-8 py-4 rounded-2xl text-lg font-semibold transition-all duration-300"
                >
                  Solicitar demonstração
                </Button>
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="flex items-center gap-6 text-sm text-neutral-600">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <span className="font-medium">Setup em 2 minutos</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <span className="font-medium">Sem cartão necessário</span>
              </div>
            </div>

            {/* Enhanced Social Proof */}
            <div className="flex items-center gap-8 pt-6 border-t border-neutral-200">
              <div className="flex -space-x-3">
                {["https://images.unsplash.com/photo-1494790108755-2616b612b786?w=40&h=40&fit=crop&crop=face",
                 "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=40&h=40&fit=crop&crop=face",
                 "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=40&h=40&fit=crop&crop=face",
                 "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=40&h=40&fit=crop&crop=face",
                 "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face"].map((img, i) => (
                  <img key={i} src={img} alt={`Cliente ${i+1}`} className="w-12 h-12 rounded-full border-3 border-white shadow-md hover:scale-110 transition-transform duration-300" />
                ))}
              </div>
              <div>
                <div className="flex items-center gap-1 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-warning text-warning" />
                  ))}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-neutral-900">
                    <span className="text-2xl text-primary">+2,847</span> empresas vendendo mais
                  </p>
                  <p className="text-xs text-neutral-600">Junte-se aos que estão transformando vendas</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Right Content - WhatsApp Simulator */}
          <div className="relative order-1 lg:order-2">
            <div className="relative mx-auto w-80 h-[600px] bg-neutral-900 rounded-[3rem] p-3 shadow-2xl">
              <div className="bg-white rounded-[2.5rem] h-full overflow-hidden relative">
                {/* Status Bar */}
                <div className="bg-neutral-900 text-white px-6 py-2 rounded-t-[2.5rem] flex items-center justify-between text-xs">
                  <span>9:41</span>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-3 border border-white rounded-sm">
                      <div className="w-3 h-2 bg-white rounded-sm m-px"></div>
                    </div>
                  </div>
                </div>
                
                {/* WhatsApp Header */}
                <div className="bg-success text-white px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 bg-success/90 rounded-full flex items-center justify-center">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">AgenteZap IA</p>
                    <p className="text-xs opacity-90">Online • Respondendo agora</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    <span className="text-xs">Online</span>
                  </div>
                </div>
                
                {/* Chat Messages */}
                <div className="flex-1 p-4 space-y-3 overflow-y-auto h-[400px] bg-neutral-50">
                  {messages.slice(0, currentMessage + 1).map((msg, i) => (
                    <div key={i} className={`flex ${msg.user ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                      <div className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                        msg.user 
                          ? 'bg-primary text-primary-foreground rounded-br-sm' 
                          : 'bg-white text-neutral-800 rounded-bl-sm shadow-sm border border-neutral-200'
                      }`}>
                        <p className="text-sm">{msg.text}</p>
                        <p className={`text-xs mt-1 ${msg.user ? 'text-primary-200' : 'text-neutral-500'}`}>
                          {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-white text-neutral-800 rounded-2xl rounded-bl-sm shadow-sm border border-neutral-200 px-4 py-2">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                          <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                          <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Input Area */}
                <div className="bg-white border-t border-neutral-200 px-4 py-3 flex items-center gap-2">
                  <input 
                    type="text" 
                    placeholder="Digite uma mensagem..." 
                    className="flex-1 bg-neutral-100 rounded-full px-4 py-2 text-sm outline-none"
                    readOnly
                  />
                  <button className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <ArrowRight className="w-4 h-4 text-primary-foreground" />
                  </button>
                </div>
              </div>
            </div>
            
            {/* Floating Badges */}
            <div className="absolute -top-4 -right-4 bg-success text-white px-3 py-1 rounded-full text-sm font-semibold shadow-lg animate-bounce">
              <Users className="w-4 h-4 inline mr-1" />
              1.234 online agora
            </div>
            
            <div className="absolute -bottom-4 -left-4 bg-info text-white px-3 py-1 rounded-full text-sm font-semibold shadow-lg">
              <Zap className="w-4 h-4 inline mr-1" />
              98% satisfação
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Gradient Fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-transparent via-neutral-50/50 to-neutral-50"></div>
    </section>
  );
}
