import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { 
  Bot, 
  MessageSquare, 
  Zap, 
  Shield, 
  Clock, 
  ChevronDown,
  Menu,
  X,
  Sparkles,
  Users,
  BarChart3,
  Calendar,
  Play,
  ArrowRight,
  Building2,
  Stethoscope,
  Scissors,
  ShoppingBag,
  Utensils,
  Car,
  GraduationCap,
  Briefcase,
  Send,
  FileText,
  Target,
  TrendingUp,
  Lock,
  Globe,
  Smartphone,
  Database,
  RefreshCw,
  Star
} from 'lucide-react';

// Componente do Simulador de Chat
function ChatSimulator() {
  const [messages, setMessages] = useState<{text: string, isBot: boolean, time: string}[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentConversation, setCurrentConversation] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);

  const conversations = [
    [
      { text: "Oi! Vi vocês nas redes, queria saber sobre limpeza de escritório", isBot: false },
      { text: "Olá! 👋 Que bom falar com você! Sou da equipe de atendimento.", isBot: true },
      { text: "Me conta: quantas salas e banheiros tem seu escritório? Assim consigo montar um orçamento personalizado 😊", isBot: true },
      { text: "São 5 salas e 2 banheiros", isBot: false },
      { text: "Perfeito! Para esse tamanho, temos um plano semanal ideal. Posso te enviar os detalhes agora?", isBot: true },
    ],
    [
      { text: "Boa tarde! Quero agendar uma avaliação para limpeza de pele", isBot: false },
      { text: "Boa tarde! 💆‍♀️ Claro, vou te ajudar a encontrar o melhor horário!", isBot: true },
      { text: "Temos vagas quinta às 15:00 e sexta às 10:30. Qual prefere?", isBot: true },
      { text: "Quinta às 15:00 seria ótimo!", isBot: false },
      { text: "Agendado! ✅ Você receberá um lembrete com as orientações de preparo.", isBot: true },
    ],
    [
      { text: "Oi, quero fazer reserva pra 4 pessoas hoje à noite, tem mesa na varanda?", isBot: false },
      { text: "Olá! 🍽️ Vou verificar a disponibilidade na varanda para você!", isBot: true },
      { text: "Tenho às 19:30 e às 20:15. Qual horário prefere?", isBot: true },
      { text: "Pode ser 19:30", isBot: false },
      { text: "Reserva confirmada! 🎉 Mesa na varanda às 19:30 para 4 pessoas. Quer que eu envie o cardápio?", isBot: true },
    ]
  ];

  useEffect(() => {
    let isMounted = true;
    const playConversation = async () => {
      if (!isMounted) return;
      setMessages([]);
      const conversation = conversations[currentConversation];
      
      for (let i = 0; i < conversation.length; i++) {
        if (!isMounted) return;
        const msg = conversation[i];
        
        if (msg.isBot) {
          setIsTyping(true);
          await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
          if (!isMounted) return;
          setIsTyping(false);
        } else {
          await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
        }
        
        if (!isMounted) return;
        const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        setMessages(prev => [...prev, { ...msg, time }]);
        
        if (chatRef.current) {
          chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }
        
        await new Promise(r => setTimeout(r, 600));
      }
      
      await new Promise(r => setTimeout(r, 4000));
      if (!isMounted) return;
      setCurrentConversation(prev => (prev + 1) % conversations.length);
    };
    
    playConversation();
    return () => { isMounted = false; };
  }, [currentConversation]);

  return (
    <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 max-w-sm mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-500 to-teal-600 p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
          <Bot className="w-7 h-7 text-white" />
        </div>
        <div>
          <p className="font-semibold text-white">AgenteZap IA</p>
          <p className="text-sm text-teal-100">online • atendimento automático</p>
        </div>
      </div>
      
      {/* Messages */}
      <div ref={chatRef} className="h-80 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[80%] p-3 rounded-2xl ${
              msg.isBot 
                ? 'bg-white shadow-sm border border-gray-100 rounded-tl-sm' 
                : 'bg-teal-500 text-white rounded-tr-sm'
            }`}>
              <p className="text-sm">{msg.text}</p>
              <p className={`text-[10px] mt-1 ${msg.isBot ? 'text-gray-400' : 'text-teal-100'}`}>
                {msg.time} {msg.isBot && '✓✓'}
              </p>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white shadow-sm border border-gray-100 rounded-2xl rounded-tl-sm p-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="p-3 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 border border-gray-200">
          <input 
            type="text" 
            placeholder="A IA responde automaticamente..." 
            className="flex-1 text-sm text-gray-400 outline-none cursor-default"
            readOnly
          />
          <Send className="w-5 h-5 text-teal-500" />
        </div>
      </div>
    </div>
  );
}

// Componente FAQ
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-5 flex items-center justify-between text-left"
      >
        <span className="font-medium text-gray-900 pr-4">{question}</span>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="pb-5 text-gray-600 leading-relaxed animate-in slide-in-from-top-2 duration-200">
          {answer}
        </div>
      )}
    </div>
  );
}

export default function LandingMinimal() {
  const [, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    document.title = 'AgenteZap — IA para WhatsApp | Plataforma Tudo-em-Um de Atendimento e Vendas';

    const prevBodyOverflowY = document.body.style.overflowY;
    const prevHtmlOverflowY = document.documentElement.style.overflowY;
    const prevBodyPosition = document.body.style.position;
    const prevBodyTouchAction = document.body.style.touchAction;
    const prevHtmlTouchAction = document.documentElement.style.touchAction;
    const prevBodyOverscroll = document.body.style.overscrollBehaviorY as string;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehaviorY as string;
    const prevBodyHeight = document.body.style.height;
    const prevHtmlHeight = document.documentElement.style.height;

    document.body.style.overflowY = 'auto';
    document.documentElement.style.overflowY = 'auto';
    document.body.style.position = 'static';
    document.body.style.touchAction = 'pan-y';
    document.documentElement.style.touchAction = 'pan-y';
    document.body.style.overscrollBehaviorY = 'auto';
    document.documentElement.style.overscrollBehaviorY = 'auto';
    document.body.style.height = 'auto';
    document.documentElement.style.height = 'auto';
    
    // SEO Meta Tags
    const metaDescription = document.querySelector('meta[name="description"]');
    const descContent = 'Plataforma completa de IA para WhatsApp. Automatize vendas, atendimento, agendamentos, CRM e campanhas. AgenteZap: seu negócio funcionando 24/7. Crie sua conta grátis!';
    if (metaDescription) {
        metaDescription.setAttribute('content', descContent);
    } else {
        const meta = document.createElement('meta');
        meta.name = 'description';
        meta.content = descContent;
        document.head.appendChild(meta);
    }

    // Keywords
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    const keywords = 'agentezap, whatsapp ia, chatbot whatsapp, automação whatsapp, crm whatsapp, atendimento automatico, funil vendas, campanhas whatsapp, agendamento automatico, ia atendimento, bot whatsapp brasil';
    if (!metaKeywords) {
        const meta = document.createElement('meta');
        meta.name = 'keywords';
        meta.content = keywords;
        document.head.appendChild(meta);
    }

    const ensureNamedMeta = (name: string, content: string) => {
      let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = name;
        document.head.appendChild(meta);
      }
      meta.content = content;
      return meta;
    };

    const ensurePropertyMeta = (property: string, content: string) => {
      let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('property', property);
        document.head.appendChild(meta);
      }
      meta.content = content;
      return meta;
    };

    const ensureCanonical = (href: string) => {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
      }
      link.href = href;
      return link;
    };

    const pageTitle = 'AgenteZap - IA para WhatsApp | Plataforma Tudo-em-Um de Atendimento e Vendas';
    const canonicalUrl = 'https://agentezap.online/';
    const imageUrl = 'https://agentezap.online/tutorial-screenshots/01-dashboard.png';

    ensureNamedMeta('robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    ensureNamedMeta('theme-color', '#0f766e');
    ensureNamedMeta('twitter:card', 'summary_large_image');
    ensureNamedMeta('twitter:title', pageTitle);
    ensureNamedMeta('twitter:description', descContent);
    ensureNamedMeta('twitter:image', imageUrl);
    ensurePropertyMeta('og:locale', 'pt_BR');
    ensurePropertyMeta('og:site_name', 'AgenteZap');
    ensurePropertyMeta('og:type', 'website');
    ensurePropertyMeta('og:title', pageTitle);
    ensurePropertyMeta('og:description', descContent);
    ensurePropertyMeta('og:url', canonicalUrl);
    ensurePropertyMeta('og:image', imageUrl);
    ensurePropertyMeta('og:image:width', '1200');
    ensurePropertyMeta('og:image:height', '630');
    ensureCanonical(canonicalUrl);

    // Structured Data (JSON-LD)
    const deprecatedStructuredData = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "AgenteZap",
      "description": "Plataforma de IA para WhatsApp que automatiza vendas, atendimento, agendamentos e CRM",
      "url": "https://agentezap.online",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Any",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "BRL",
        "description": "Teste grátis disponível - Crie sua conta sem cartão"
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "ratingCount": "500"
      }
    };
    
    void deprecatedStructuredData;

    const structuredData = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "name": "AgenteZap",
          "url": canonicalUrl,
          "logo": "https://agentezap.online/assets/img/logo-findeas.svg"
        },
        {
          "@type": "SoftwareApplication",
          "name": "AgenteZap",
          "description": "Plataforma de IA para WhatsApp que automatiza vendas, atendimento, agendamentos e CRM.",
          "url": canonicalUrl,
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "BRL",
            "description": "Teste gratis disponivel sem cartao."
          }
        }
      ]
    };

    const previousStructuredData = document.querySelector('script[data-seo-schema="landing"]');
    previousStructuredData?.parentNode?.removeChild(previousStructuredData);

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.seoSchema = 'landing';
    script.textContent = JSON.stringify(structuredData);
    document.head.appendChild(script);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      document.body.style.overflowY = prevBodyOverflowY;
      document.documentElement.style.overflowY = prevHtmlOverflowY;
      document.body.style.position = prevBodyPosition;
      document.body.style.touchAction = prevBodyTouchAction;
      document.documentElement.style.touchAction = prevHtmlTouchAction;
      document.body.style.overscrollBehaviorY = prevBodyOverscroll;
      document.documentElement.style.overscrollBehaviorY = prevHtmlOverscroll;
      document.body.style.height = prevBodyHeight;
      document.documentElement.style.height = prevHtmlHeight;
    };
  }, []);

  const nichos = [
    { icon: Stethoscope, name: 'Clínicas', desc: 'Agendamentos e lembretes' },
    { icon: Scissors, name: 'Salões', desc: 'Reservas e confirmações' },
    { icon: ShoppingBag, name: 'E-commerce', desc: 'Vendas e suporte' },
    { icon: Utensils, name: 'Restaurantes', desc: 'Pedidos e reservas' },
    { icon: Building2, name: 'Imobiliárias', desc: 'Qualificação de leads' },
    { icon: Car, name: 'Oficinas', desc: 'Orçamentos automáticos' },
    { icon: GraduationCap, name: 'Cursos', desc: 'Matrículas e dúvidas' },
    { icon: Briefcase, name: 'Consultoria', desc: 'Prospecção B2B' },
  ];

  const faqItems = [
    {
      question: "Preciso usar um número novo de WhatsApp?",
      answer: "Não! Você pode usar seu número atual do WhatsApp. Basta escanear o QR Code no painel e pronto. Nenhuma troca de número necessária."
    },
    {
      question: "Preciso de conhecimentos técnicos para usar?",
      answer: "Não precisa! O AgenteZap foi feito para ser simples. O onboarding é 100% guiado, com templates prontos que você personaliza em minutos sem precisar programar nada."
    },
    {
      question: "A IA pode errar? Posso revisar as respostas?",
      answer: "Você tem controle total! Pode ajustar todas as regras, editar respostas a qualquer momento e assumir a conversa manualmente quando precisar. É o melhor dos dois mundos."
    },
    {
      question: "Posso cancelar quando quiser?",
      answer: "Sim, sem burocracia! Teste gratuitamente sem cartão de crédito. Se não gerar valor para seu negócio, cancele com um clique. Sem taxas escondidas."
    },
    {
      question: "Meus dados e conversas ficam seguros?",
      answer: "Segurança é prioridade! Utilizamos criptografia de ponta, autenticação forte, backups automáticos diários e infraestrutura em nuvem de alta disponibilidade."
    },
    {
      question: "Para qual tipo de negócio o AgenteZap funciona?",
      answer: "Para qualquer negócio que use WhatsApp! Clínicas, salões, academias, e-commerce, consultoria, infoprodutores, restaurantes, imobiliárias, oficinas e muito mais."
    },
    {
      question: "O que está incluído na plataforma?",
      answer: "Tudo que você precisa: IA inteligente 24/7, CRM com funil visual, campanhas de marketing em massa, agendamento automático, etiquetas, integrações via API e muito mais."
    },
    {
      question: "Como funciona o suporte?",
      answer: "Você não fica sozinho! Temos onboarding guiado, templates prontos para seu nicho, documentação completa e suporte humanizado por WhatsApp e email."
    }
  ];

  return (
    <div className="min-h-screen bg-white overflow-x-hidden touch-pan-y">
      {/* Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-sm shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-500/25">
                <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <span className="text-xl sm:text-2xl font-bold text-gray-900">AgenteZap</span>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              <a href="#recursos" className="text-gray-600 hover:text-teal-600 transition-colors font-medium">Recursos</a>
              <a href="#como-funciona" className="text-gray-600 hover:text-teal-600 transition-colors font-medium">Como Funciona</a>
              <a href="#para-quem" className="text-gray-600 hover:text-teal-600 transition-colors font-medium">Para Quem</a>
              <a href="#faq" className="text-gray-600 hover:text-teal-600 transition-colors font-medium">Dúvidas</a>
            </nav>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-3">
              <button 
                onClick={() => setLocation('/login')}
                className="px-5 py-2.5 text-gray-700 font-semibold hover:text-teal-600 transition-colors border border-gray-200 rounded-xl hover:border-teal-300 hover:bg-teal-50"
              >
                Entrar
              </button>
              <button 
                onClick={() => setLocation('/cadastro')}
                className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-teal-700 transition-all shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40"
              >
                Criar Conta Grátis
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button 
              onClick={() => setMenuOpen(!menuOpen)} 
              className="md:hidden p-2 text-gray-700"
              aria-label="Menu"
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 shadow-lg animate-in slide-in-from-top duration-200">
            <div className="px-4 py-4 space-y-3">
              <a href="#recursos" onClick={() => setMenuOpen(false)} className="block py-2 text-gray-700 font-medium">Recursos</a>
              <a href="#como-funciona" onClick={() => setMenuOpen(false)} className="block py-2 text-gray-700 font-medium">Como Funciona</a>
              <a href="#para-quem" onClick={() => setMenuOpen(false)} className="block py-2 text-gray-700 font-medium">Para Quem</a>
              <a href="#faq" onClick={() => setMenuOpen(false)} className="block py-2 text-gray-700 font-medium">Dúvidas</a>
              <div className="pt-3 flex flex-col gap-2">
                <button 
                  onClick={() => { setMenuOpen(false); setLocation('/login'); }}
                  className="w-full py-3 text-gray-700 font-semibold border border-gray-200 rounded-xl hover:bg-gray-50"
                >
                  Entrar
                </button>
                <button 
                  onClick={() => { setMenuOpen(false); setLocation('/cadastro'); }}
                  className="w-full py-3 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-semibold rounded-xl"
                >
                  Criar Conta Grátis
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="pt-28 sm:pt-36 pb-16 sm:pb-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            {/* Hero Text */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full text-sm font-medium mb-6">
                <Sparkles className="w-4 h-4" />
                IA que vende e atende 24/7
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                Atenda e venda pelo WhatsApp{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-teal-600">
                  24h por dia com IA
                </span>
              </h1>
              
              <p className="mt-6 text-lg sm:text-xl text-gray-600 leading-relaxed max-w-xl mx-auto lg:mx-0">
                O AgenteZap responde clientes, qualifica leads e agenda horários sozinho — 
                em um único painel simples. Sem precisar programar, nem ficar online o tempo todo.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                <button 
                  onClick={() => setLocation('/cadastro')}
                  className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-semibold rounded-2xl hover:from-teal-600 hover:to-teal-700 transition-all shadow-xl shadow-teal-500/25 hover:shadow-teal-500/40 flex items-center justify-center gap-2 text-lg"
                >
                  Comece gratuitamente agora
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setLocation('/login')}
                  className="w-full sm:w-auto px-8 py-4 text-gray-700 font-semibold rounded-2xl border-2 border-gray-200 hover:border-teal-200 hover:bg-teal-50 transition-all flex items-center justify-center gap-2 text-lg"
                >
                  Já tenho conta → Entrar
                </button>
              </div>

              <p className="mt-4 text-sm text-gray-500">
                ✓ Sem cartão de crédito &nbsp; ✓ Comece a usar em 2 minutos &nbsp; ✓ Cancele quando quiser
              </p>

              <div className="mt-8 flex items-center justify-center lg:justify-start gap-6 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-teal-500" />
                  <span>Seguro</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-500" />
                  <span>Setup em 2 min</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-teal-500" />
                  <span>Teste grátis</span>
                </div>
              </div>
            </div>

            {/* Hero Visual - Chat Simulator */}
            <div className="flex-1 w-full max-w-md lg:max-w-lg">
              <ChatSimulator />
            </div>
          </div>
        </div>
      </section>

      {/* Video Section */}
      <section className="py-12 sm:py-16 bg-gray-50 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
            Veja o AgenteZap em ação
          </h2>
          <p className="text-gray-600 mb-8">
            Assista como empresas estão transformando seu atendimento e vendas
          </p>
          
          <div className="relative group cursor-pointer rounded-2xl overflow-hidden shadow-2xl" onClick={() => window.open('https://www.youtube.com/watch?v=L1nKUi5HBNI', '_blank')}>
            <img 
              src="https://i.ytimg.com/vi/L1nKUi5HBNI/maxresdefault.jpg" 
              alt="Vídeo Demonstração AgenteZap" 
              className="w-full aspect-video object-cover opacity-90 group-hover:opacity-100 transition-opacity"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors">
              <div className="w-20 h-20 bg-white/95 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm group-hover:scale-110 transition-transform">
                <Play className="w-8 h-8 text-teal-600 ml-1" fill="currentColor" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Por que escolher o AgenteZap?
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Muito mais que um chatbot — um agente de IA completo representando você
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {[
              { 
                icon: Bot, 
                title: 'Agente IA no WhatsApp', 
                desc: 'Não é um chatbot genérico. É um agente de IA conversacional que representa sua empresa com respostas naturais e inteligentes.' 
              },
              { 
                icon: MessageSquare, 
                title: 'Surpreendentemente Humano', 
                desc: 'Tom de voz natural e contextual, adaptado ao seu negócio. Seus clientes nem percebem que é automático.' 
              },
              { 
                icon: FileText, 
                title: 'Aprende com Seu Conhecimento', 
                desc: 'Alimente a IA com suas conversas, PDFs e documentos. Ela aprende e evolui constantemente com seu negócio.' 
              },
              { 
                icon: RefreshCw, 
                title: 'Piloto Automático + Copiloto', 
                desc: 'Funciona 100% automático para novos contatos, mas você assume o controle quando precisar. O melhor dos dois mundos.' 
              },
            ].map((benefit, idx) => (
              <div key={idx} className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-6 sm:p-8 border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center mb-5 shadow-lg shadow-teal-500/25">
                  <benefit.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{benefit.title}</h3>
                <p className="text-gray-600 leading-relaxed">{benefit.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="recursos" className="py-16 sm:py-24 bg-gray-50 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Tudo que você precisa em{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-teal-600">um só lugar</span>
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              IA, CRM, Marketing, Agenda e mais — integrados nativamente para você vender mais
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Bot, title: 'IA 24/7', desc: 'Atendimento automático inteligente que nunca dorme', color: 'from-teal-500 to-teal-600' },
              { icon: Users, title: 'CRM Completo', desc: 'Funil visual, etiquetas e gestão de contatos', color: 'from-blue-500 to-blue-600' },
              { icon: BarChart3, title: 'Campanhas', desc: 'Envio em massa com variáveis personalizadas', color: 'from-purple-500 to-purple-600' },
              { icon: Calendar, title: 'Agendamentos', desc: 'Reservas e lembretes automáticos', color: 'from-orange-500 to-orange-600' },
              { icon: Target, title: 'Funil de Vendas', desc: 'Kanban visual para acompanhar conversões', color: 'from-pink-500 to-pink-600' },
              { icon: Send, title: 'Envio em Massa', desc: 'Disparo para listas com personalização', color: 'from-green-500 to-green-600' },
              { icon: TrendingUp, title: 'Qualificação', desc: 'IA que identifica leads quentes automaticamente', color: 'from-indigo-500 to-indigo-600' },
              { icon: Globe, title: 'Integrações', desc: 'API, Webhooks e conexão com suas ferramentas', color: 'from-cyan-500 to-cyan-600' },
            ].map((feature, idx) => (
              <div key={idx} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all border border-gray-100 group">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="como-funciona" className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Do zero à operação em <span className="text-teal-600">4 passos</span>
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Começar é simples, rápido e sem exigências técnicas. Sem cartão de crédito.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { step: '1', title: 'Conecte', desc: 'Escaneie o QR Code do seu WhatsApp. Só isso!' },
              { step: '2', title: 'Configure', desc: 'Personalize a IA com informações do seu negócio' },
              { step: '3', title: 'Ative', desc: 'Ligue o piloto automático e deixe a IA trabalhar' },
              { step: '4', title: 'Venda', desc: 'Acompanhe pelo painel enquanto as vendas acontecem' },
            ].map((item, idx) => (
              <div key={idx} className="relative text-center group">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 text-white text-3xl font-bold flex items-center justify-center mx-auto mb-5 shadow-xl shadow-teal-500/25 group-hover:scale-110 transition-transform">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600">{item.desc}</p>
                {idx < 3 && (
                  <div className="hidden lg:block absolute top-10 left-[70%] w-[60%]">
                    <ArrowRight className="w-8 h-8 text-teal-200" />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <button 
              onClick={() => setLocation('/cadastro')}
              className="px-8 py-4 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-semibold rounded-2xl hover:from-teal-600 hover:to-teal-700 transition-all shadow-xl shadow-teal-500/25 text-lg inline-flex items-center gap-2"
            >
              Testar gratuitamente
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Niches Section */}
      <section id="para-quem" className="py-16 sm:py-24 bg-gradient-to-br from-teal-600 to-teal-700 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Funciona para qualquer negócio
            </h2>
            <p className="mt-4 text-lg text-teal-100 max-w-2xl mx-auto">
              Se você usa WhatsApp para vender ou atender, o AgenteZap foi feito para você
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
            {nichos.map((nicho, idx) => (
              <div key={idx} className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 text-center hover:bg-white/20 transition-colors group cursor-default">
                <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <nicho.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-semibold text-white mb-1">{nicho.name}</h3>
                <p className="text-sm text-teal-100">{nicho.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                Tecnologia e segurança que você pode confiar
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Seus dados e conversas protegidos com a mesma tecnologia usada por grandes empresas
              </p>
              
              <div className="space-y-4">
                {[
                  { icon: Lock, text: 'Criptografia de ponta a ponta em todas as mensagens' },
                  { icon: Database, text: 'Backups automáticos diários na nuvem' },
                  { icon: Shield, text: 'Autenticação forte e controle de acesso' },
                  { icon: Globe, text: 'Infraestrutura em nuvem de alta disponibilidade' },
                  { icon: Smartphone, text: 'Funciona no navegador, sem instalar nada' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-5 h-5 text-teal-600" />
                    </div>
                    <span className="text-gray-700">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex-1 w-full max-w-md">
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-8 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-500 flex items-center justify-center mx-auto mb-6 shadow-xl">
                  <Shield className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">100% Seguro</h3>
                <p className="text-gray-400 mb-6">Seus dados protegidos 24/7 com as melhores práticas de segurança</p>
                <div className="flex justify-center gap-3">
                  <div className="px-3 py-1.5 bg-white/10 rounded-lg text-sm text-gray-300">SSL/TLS</div>
                  <div className="px-3 py-1.5 bg-white/10 rounded-lg text-sm text-gray-300">LGPD</div>
                  <div className="px-3 py-1.5 bg-white/10 rounded-lg text-sm text-gray-300">Cloud</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-16 sm:py-24 bg-gray-50 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Perguntas frequentes
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Tire suas dúvidas sobre o AgenteZap
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100 px-6">
            {faqItems.map((item, idx) => (
              <FAQItem key={idx} question={item.question} answer={item.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial/Social Proof */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-1 mb-4">
              {[1,2,3,4,5].map(i => (
                <Star key={i} className="w-6 h-6 text-yellow-400 fill-yellow-400" />
              ))}
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              +500 empresas já usam
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Negócios de todos os tamanhos confiam no AgenteZap para automatizar vendas e atendimento
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { metric: '24/7', label: 'Atendimento automático funcionando' },
              { metric: '10x', label: 'Mais leads qualificados em média' },
              { metric: '2min', label: 'Para começar a usar' },
            ].map((item, idx) => (
              <div key={idx} className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-8 text-center border border-gray-100">
                <div className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-teal-600 mb-2">
                  {item.metric}
                </div>
                <p className="text-gray-600">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-teal-600 to-teal-700 rounded-3xl p-8 sm:p-12 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Pronto para transformar seu WhatsApp em máquina de vendas?
            </h2>
            <p className="text-lg text-teal-100 mb-8 max-w-2xl mx-auto">
              Conecte seu WhatsApp, ative a IA inteligente e veja seu funil, conversas e agenda funcionando em minutos.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={() => setLocation('/cadastro')}
                className="w-full sm:w-auto px-8 py-4 bg-white text-teal-600 font-bold rounded-2xl hover:bg-gray-50 transition-all shadow-xl text-lg"
              >
                Começar grátis agora
              </button>
              <button 
                onClick={() => setLocation('/login')}
                className="w-full sm:w-auto px-8 py-4 text-white font-semibold rounded-2xl border-2 border-white/30 hover:bg-white/10 transition-all text-lg"
              >
                Já tenho conta → Entrar
              </button>
            </div>
            <p className="mt-6 text-sm text-teal-200">
              Sem cartão de crédito • Cancele quando quiser • Suporte humanizado
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-teal-500 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold text-white">AgenteZap</span>
              </div>
              <p className="text-gray-400 max-w-sm">
                Plataforma de IA para WhatsApp que automatiza vendas, atendimento, agendamentos e CRM para seu negócio.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold text-white mb-4">Produto</h4>
              <div className="space-y-2">
                <a href="#recursos" className="block text-gray-400 hover:text-white transition-colors">Recursos</a>
                <a href="#como-funciona" className="block text-gray-400 hover:text-white transition-colors">Como Funciona</a>
                <a href="#faq" className="block text-gray-400 hover:text-white transition-colors">Dúvidas</a>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold text-white mb-4">Suporte</h4>
              <div className="space-y-2">
                <a href="/blog" className="block text-gray-400 hover:text-white transition-colors">Blog</a>
                <a href="/ajuda" className="block text-gray-400 hover:text-white transition-colors">Central de Ajuda</a>
                <a href="https://wa.me/5517991140696" target="_blank" rel="noopener noreferrer" className="block text-gray-400 hover:text-white transition-colors">WhatsApp</a>
                <a href="/termos-de-uso" className="block text-gray-400 hover:text-white transition-colors">Termos de Uso</a>
                <a href="https://wa.me/5517991140696" target="_blank" rel="noopener noreferrer" className="block text-gray-400 hover:text-white transition-colors">Contato</a>
              </div>
            </div>
          </div>
          
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-sm">
              © {new Date().getFullYear()} AgenteZap. Todos os direitos reservados. Feito com ❤️ no Brasil.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://wa.me/5517991140696" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                <MessageSquare className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp Button */}
      <a 
        href="https://wa.me/5517991140696?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20o%20AgenteZap"
        target="_blank" 
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-3 group md:bottom-6 md:right-6 bottom-24 right-4"
      >
        <div className="hidden sm:block bg-white rounded-xl px-4 py-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-sm font-medium text-gray-900">Fale com a gente!</p>
        </div>
        <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30 hover:scale-110 transition-transform">
          <MessageSquare className="w-7 h-7 text-white" />
        </div>
      </a>

      {/* Mobile Fixed CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-sm border-t border-gray-100 md:hidden z-30">
        <div className="flex gap-3">
          <button 
            onClick={() => setLocation('/login')}
            className="flex-1 py-3 text-gray-700 font-semibold border border-gray-200 rounded-xl"
          >
            Entrar
          </button>
          <button 
            onClick={() => setLocation('/cadastro')}
            className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-semibold rounded-xl"
          >
            Criar Conta Grátis
          </button>
        </div>
      </div>

      {/* Spacer for mobile fixed CTA */}
      <div className="h-20 md:hidden"></div>
    </div>
  );
}
