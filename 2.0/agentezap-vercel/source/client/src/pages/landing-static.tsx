import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function LandingStatic() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Initialize AOS (Animate On Scroll)
    if (window.AOS) {
      window.AOS.init({ duration: 1000, once: false });
    }

    // Handle navigation
    const handleNavigation = (e: Event) => {
      const target = e.target as HTMLAnchorElement;
      if (target.href?.includes('/cadastro')) {
        e.preventDefault();
        setLocation('/cadastro');
      } else if (target.href?.includes('/login')) {
        e.preventDefault();
        setLocation('/login');
      }
    };

    document.addEventListener('click', handleNavigation);
    return () => document.removeEventListener('click', handleNavigation);
  }, [setLocation]);

  return (
    <>
      {/* Preloader */}
      <div className="preloader" id="preloader">
        <div className="spinner-border text-primary" role="status"></div>
      </div>

      {/* Header */}
      <header>
        <nav className="navbar fixed-top navbar-border navbar-expand-lg navbar-light bg-white py-3">
          <div className="container">
            <a className="navbar-brand order-lg-1 flex-grow-1" href="#" aria-label="Logo">
              <div className="d-flex align-items-center" style={{ fontWeight: 700, fontSize: '1.5rem', color: '#000' }}>
                <i className="ri-robot-2-fill" style={{ color: '#0b8c8c', fontSize: '1.8rem', marginRight: '0.5rem' }}></i>
                <span>AgenteZap</span>
              </div>
            </a>

            <div className="d-none d-md-flex align-items-center order-2 order-lg-2 justify-content-end mr-3 mr-lg-0">
              <button 
                onClick={() => setLocation('/cadastro')}
                className="btn btn-primary d-inline-flex align-items-center" 
                aria-label="Começar grátis — criar conta" 
                title="Começar grátis"
              >
                <i className="ri-user-add-line ri-lg mr-2" aria-hidden="true" focusable="false"></i>
                <span>Começar grátis</span>
              </button>
            </div>

            <button className="navbar-toggler d-lg-none d-flex align-items-center order-3 order-lg-3" type="button" data-toggle="collapse" data-target="#navbar" aria-controls="navbar" aria-expanded="false" aria-label="Toggle navigation">
              <i className="ri-menu-3-fill ri-xl"></i>
            </button>

            <div className="collapse navbar-collapse order-3 order-lg-1 mr-lg-3" id="navbar">
              <ul className="navbar-nav ml-auto">
                <li className="nav-item">
                  <a className="nav-link" href="#inicio">Início</a>
                </li>
                <li className="nav-item dropdown position-relative">
                  <a className="nav-link dropdown-toggle" href="#" id="navbarDemosDropdown" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                    Recursos
                  </a>
                  <div className="dropdown-menu" aria-labelledby="navbarDemosDropdown">
                    <a className="dropdown-item d-flex align-items-center" href="#recursos">
                      <i className="ri-layout-line ri-lg mr-2"></i>
                      Todos Recursos
                    </a>
                    <a className="dropdown-item d-flex align-items-center" href="#como-funciona">
                      <i className="ri-layout-2-line ri-lg mr-2"></i>
                      Como Funciona
                    </a>
                    <a className="dropdown-item d-flex align-items-center" href="#beneficios">
                      <i className="ri-layout-3-line ri-lg mr-2"></i>
                      Benefícios
                    </a>
                    <a className="dropdown-item d-flex align-items-center" href="#faq">
                      <i className="ri-layout-4-line ri-lg mr-2"></i>
                      FAQ
                    </a>
                  </div>
                </li>
                <li className="nav-item dropdown">
                  <a className="nav-link dropdown-toggle" href="#" id="navbarDocsDropdown" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                    Suporte
                  </a>
                  <div className="dropdown-menu" aria-labelledby="navbarDocsDropdown">
                    <a className="dropdown-item d-flex align-items-center" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">
                      <i className="ri-book-open-line ri-lg mr-2"></i>
                      Contato
                    </a>
                    <a className="dropdown-item d-flex align-items-center" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">
                      <i className="ri-customer-service-2-line ri-lg mr-2"></i>
                      Central de Ajuda
                    </a>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </nav>
      </header>

      {/* Section 1 */}
      <section className="space-3 mt-5" id="inicio">
        <div className="container">
          <div className="row align-items-center justify-content-around">
            <div className="col-lg-6 pr-lg-5">
              <h1 className="display-4 font-weight-bold line-height-1" data-aos="fade-up">Transforme WhatsApp com IA</h1>
              <p className="h5 font-weight-normal mt-4" data-aos="fade-up" data-aos-delay="100">Inteligência artificial 24/7 gerenciando atendimento, conversas, funil, campanhas e agendamentos em um único painel inteligente.</p>
              <div className="mt-4" data-aos="fade-up" data-aos-delay="200">
                <button onClick={() => setLocation('/cadastro')} className="d-inline-flex align-items-center btn btn-primary mb-2 mb-md-0">
                  Iniciar gratuitamente agora
                  <i className="ri-arrow-right-line ri-lg ml-2"></i>
                </button>
                <button className="btn btn-outline-dark">Agendar demo</button>
                <p className="text-muted mt-1"><small>Grandes empresas já automatizam vendas e atendimento com AgenteZap</small></p>
              </div>
              <div className="mt-4 mb-5" data-aos="fade-up" data-aos-delay="300">
                <p className="mb-2">Confiado por:</p>
                <img className="mr-3 mb-3 mb-md-0" src="assets/img/logo-treva.png" alt="Brand" height="28" />
                <img className="mr-3 mb-3 mb-md-0" src="assets/img/logo-muzica.png" alt="Brand" height="28" />
                <img className="mr-3 mb-3 mb-md-0" src="assets/img/logo-goldline.png" alt="Brand" height="28" />
              </div>
            </div>
            <div className="col-lg-6" data-aos="fade-left">
              <img className="img-fluid rounded-lg" src="assets/img/image1.png" alt="Image" data-zoomable />
            </div>
          </div>
        </div>
      </section>

      {/* Section 2 - Benefits */}
      <section className="space-1" id="beneficios">
        <div className="container">
          <div className="w-100 w-lg-75 text-center mx-auto mb-3">
            <h2 className="font-weight-bold">Por que escolher AgenteZap para seu negócio</h2>
          </div>
          <div className="row d-flex justify-content-center flex-wrap">
            <div className="col-md-6 mb-4 col-lg-5" data-aos="zoom-in" data-aos-delay="100">
              <div className="bg-light rounded-lg h-100 px-5 py-5 hover-bg-primary hover-translate-y">
                <i className="ri-robot-fill ri-3x text-primary"></i>
                <h5>IA Inteligente 24/7</h5>
                <p className="lead">Atenda seus clientes a qualquer hora com IA treinada no seu nicho.</p>
              </div>
            </div>
            <div className="col-md-6 mb-4 col-lg-5" data-aos="zoom-in" data-aos-delay="200">
              <div className="bg-light rounded-lg h-100 px-5 py-5 hover-bg-primary hover-translate-y">
                <i className="ri-line-chart-fill ri-3x text-primary"></i>
                <h5>Mais Conversões</h5>
                <p className="lead">Respostas instantâneas, qualificação automática e acompanhamento sem parar.</p>
              </div>
            </div>
            <div className="col-md-6 mb-4 col-lg-5" data-aos="zoom-in" data-aos-delay="200">
              <div className="bg-light rounded-lg h-100 px-5 py-5 hover-bg-primary hover-translate-y">
                <i className="ri-time-fill ri-3x text-primary"></i>
                <h5>Economize Tempo</h5>
                <p className="lead">Automação completa de fluxos elimina tarefas repetitivas do seu dia.</p>
              </div>
            </div>
            <div className="col-md-6 mb-4 col-lg-5" data-aos="zoom-in" data-aos-delay="200">
              <div className="bg-light rounded-lg h-100 px-5 py-5 hover-bg-primary hover-translate-y">
                <i className="ri-dashboard-fill ri-3x text-primary"></i>
                <h5>Organização Total</h5>
                <p className="lead">Funil visual com toda sua operação em um único painel.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3 - Features */}
      <section className="space-5" id="recursos">
        <div className="container">
          <div className="row align-items-center justify-content-around">
            <div className="col-lg-7" data-aos="fade-in">
              <div className="row">
                <div className="col-md-6 mb-4 mb-md-0" data-aos="fade-down" data-aos-delay="200">
                  <div style={{ width: '100%', maxWidth: '100%' }}>
                    <div id="recursos-mockup-frame" className="wa-frame">
                      <div className="wa-inner">
                        <div className="wa-header">
                          <div className="wa-avatar">AZ</div>
                          <div>
                            <div style={{ fontWeight: '600' }}>AgenteZap</div>
                            <small className="text-muted">online • Atendimento automático</small>
                          </div>
                        </div>

                        <div className="wa-screen">
                          <div style={{ alignSelf: 'flex-start' }}>
                            <div className="bubble-in">Oi! Quero orçamento de limpeza amanhã às 10h.</div>
                          </div>

                          <div style={{ alignSelf: 'flex-end', textAlign: 'right' }}>
                            <div className="bubble-out">Claro — posso ajudar. Qual o endereço e o nome para o agendamento?</div>
                          </div>

                          <div style={{ alignSelf: 'flex-end', textAlign: 'right' }}>
                            <div className="bubble-out" id="action-bubble">
                              <div id="action-placeholder">Verificando...</div>
                            </div>
                          </div>
                        </div>

                        <div className="wa-footer">
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: '#f1f3f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6c757d' }}>
                              <i className="ri-chat-1-line"></i>
                            </div>
                            <div style={{ fontSize: '13px', color: '#6c757d', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div className="typing"><span className="dot"></span><span className="dot"></span><span className="dot"></span></div>
                              <div>Escrevendo</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6" data-aos="fade-up" data-aos-delay="300">
                  <img id="recursos-right-img" className="img-fluid rounded-lg" src="assets/img/111.jpg" alt="Image" data-zoomable />
                </div>
              </div>
            </div>
            <div className="col-lg-5 mt-4 mt-lg-0 pl-lg-4" data-aos="fade-left">
              <i className="ri-slideshow-fill ri-3x text-primary"></i>
              <h2 className="font-weight-bold">Tudo que você precisa em um só lugar</h2>
              <p className="lead mt-2 mb-4">IA, CRM, Marketing, Agenda e Pagamentos integrados nativamente.</p>
              <div className="row mt-5">
                <div className="col" data-aos="fade-left" data-aos-delay="200">
                  <img src="assets/img/logo-atica.png" height="48" alt="Brand" />
                </div>
                <div className="col" data-aos="fade-left" data-aos-delay="300">
                  <img src="assets/img/logo-earth.png" height="48" alt="Brand" />
                </div>
                <div className="col" data-aos="fade-left" data-aos-delay="400">
                  <img src="assets/img/logo-tvit.png" height="48" alt="Brand" />
                </div>
                <div className="col" data-aos="fade-left" data-aos-delay="500">
                  <img src="assets/img/logo-9.png" height="48" alt="Brand" />
                </div>
              </div>
            </div>
          </div>

          <div className="row align-items-center justify-content-around space-5 pb-0 mb-4 mb-lg-0" id="como-funciona">
            <div className="col-lg-5 mb-5 mb-lg-0" data-aos="fade-right">
              <i className="ri-rocket-fill ri-3x text-primary"></i>
              <h2 className="font-weight-bold">Veja como o AgenteZap organiza e acelera o seu funil</h2>
              <p className="lead mt-2 mb-3">IA entende, segmenta e automatiza. Você só acompanha.</p>
              <div id="accordion">
                <div className="card mb-2 mb-md-3">
                  <a href="#accordion1" data-toggle="collapse" role="button" aria-expanded="false" className="p-3 p-md-4 collapsed">
                    <div className="d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">1. Etiquetas inteligentes & Qualificação</h6>
                      <i className="ri-arrow-down-s-line ri-lg"></i>
                    </div>
                  </a>
                  <div className="collapse" id="accordion1" data-parent="#accordion">
                    <div className="px-3 px-md-4 pb-3 pb-md-4">
                      <p className="mb-2">Detecta intenção e aplica tags (VIP, Suporte, Lead Frio/Quente).</p>
                      <p className="mb-2">Atualiza contato e origem automaticamente.</p>
                      <p className="mb-0">Segmente por etiqueta para relatórios e listas.</p>
                    </div>
                  </div>
                </div>

                <div className="card mb-2 mb-md-3">
                  <a href="#accordion2" data-toggle="collapse" role="button" aria-expanded="false" className="p-3 p-md-4 collapsed">
                    <div className="d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">2. Campanhas, Agendamentos & Pipeline</h6>
                      <i className="ri-arrow-down-s-line ri-lg"></i>
                    </div>
                  </a>
                  <div className="collapse" id="accordion2" data-parent="#accordion">
                    <div className="px-3 px-md-4 pb-3 pb-md-4">
                      <p className="mb-2">Envio em massa para listas com variáveis (<code>{'{'} nome{'}'}</code>, <code>{'{'} cidade{'}'}</code>).</p>
                      <p className="mb-2">Agendamentos e Reservas com lembretes automáticos.</p>
                      <p className="mb-2">Pipeline (Kanban/Funil): arraste etapas e acompanhe conversões.</p>
                      <p className="mb-0">Integrações: CRM, Calendar e Webhooks/Zapier.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 d-flex flex-wrap align-items-center">
                <span className="badge badge-light mr-2 mb-2 px-3 py-2">Sem código</span>
                <span className="badge badge-light mr-2 mb-2 px-3 py-2">Setup em minutos</span>
                <span className="badge badge-light mr-2 mb-2 px-3 py-2">Handoff humano</span>
                <span className="badge badge-light mr-2 mb-2 px-3 py-2">Integra com o que você já usa</span>
              </div>
            </div>
            <div className="col-lg-6" data-aos="fade-left">
              <img className="img-fluid rounded-lg" src="assets/img/222.png" alt="Image" data-zoomable />
            </div>
          </div>
        </div>
      </section>

      {/* Section 4 - Steps */}
      <section className="space-3 bg-primary-3">
        <div className="container">
          <div className="w-100 w-lg-75 text-center mx-auto mb-5 text-white">
            <i className="ri-drag-drop-fill ri-3x text-white"></i>
            <h2 className="font-weight-bold text-center">Do Zero à Operação em 4 Etapas</h2>
            <p className="lead">Começar é simples, rápido e sem exigências técnicas. Sem cartão de crédito.</p>
          </div>
          <div className="row text-center">
            <div className="col-sm-6 col-md-3 my-3 my-md-0 text-white">
              <div className="card card-body bg-white hover-translate-y hover-shadow">
                <h2 className="h1 font-weight-bold">1</h2>
                <p className="font-weight-medium">Conecte</p>
              </div>
            </div>
            <div className="col-sm-6 col-md-3 my-3 my-md-0 text-white">
              <div className="card card-body bg-white hover-translate-y hover-shadow">
                <h2 className="h1 font-weight-bold">2</h2>
                <p className="font-weight-medium">Ative</p>
              </div>
            </div>
            <div className="col-sm-6 col-md-3 my-3 my-md-0 text-white">
              <div className="card card-body bg-white hover-translate-y hover-shadow">
                <h2 className="h1 font-weight-bold">3</h2>
                <p className="font-weight-medium">Configure</p>
              </div>
            </div>
            <div className="col-sm-6 col-md-3 my-3 my-md-0 text-white">
              <div className="card card-body bg-white hover-translate-y hover-shadow">
                <h2 className="h1 font-weight-bold">4</h2>
                <p className="font-weight-medium">Venda</p>
              </div>
            </div>
          </div>
          <div className="text-center mt-5">
            <button onClick={() => setLocation('/cadastro')} className="d-inline-flex align-items-center btn btn-primary">
              Testar gratuitamente
              <i className="ri-arrow-right-line ri-lg ml-2"></i>
            </button>
          </div>
        </div>
      </section>

      {/* Section 5 - Video */}
      <section className="space-5 bg-light">
        <div className="container">
          <div className="w-100 w-lg-75 text-center mx-auto mb-5">
            <i className="ri-chat-quote-fill ri-3x text-primary"></i>
            <h2 className="font-weight-bold text-center">Veja os resultados que seus clientes já conquistaram</h2>
          </div>

          <div className="row justify-content-center">
            <div className="col-12 col-md-10">
              <div className="rounded-lg shadow-sm" style={{ overflow: 'hidden' }}>
                <video id="local-video" className="w-100" controls preload="metadata" playsInline style={{ maxHeight: '640px', width: '100%', height: 'auto', display: 'block', borderRadius: '8px' }}>
                  <source src="assets/img/iadeatendimento.mp4" type="video/mp4" />
                  Your browser does not support the video tag. <a href="assets/img/iadeatendimento.mp4">Download / Abrir vídeo</a>
                </video>
              </div>
              <p className="text-center text-muted mt-3">Assista: como clientes aceleraram vendas e atendimento com AgenteZap</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 6 - FAQ */}
      <section className="space-3" id="faq">
        <div className="container">
          <div className="w-100 w-lg-75 text-center mx-auto mb-5">
            <i className="ri-question-answer-fill ri-3x text-primary"></i>
            <h2 className="font-weight-bold">Perguntas Mais Comuns</h2>
            <p className="lead">Esclarecemos suas dúvidas sobre AgenteZap para você começar com segurança.</p>
          </div>
          <div className="row justify-content-around">
            <div className="col-lg-5">
              <div id="faqOne">
                <div className="card border-top-0 border-left-0 border-right-0">
                  <a href="#faqOne1" data-toggle="collapse" role="button" aria-expanded="false" className="p-3 p-md-4 collapsed">
                    <div className="d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">Preciso usar um número novo?</h6>
                      <i className="ri-arrow-down-s-line ri-lg"></i>
                    </div>
                  </a>
                  <div className="collapse" id="faqOne1" data-parent="#faqOne">
                    <p className="mb-0 px-3 px-md-4 pb-3 pb-md-4">
                      Não. Use seu número atual do WhatsApp. Nenhuma troca necessária.
                    </p>
                  </div>
                </div>
                <div className="card border-top-0 border-left-0 border-right-0">
                  <a href="#faqOne2" data-toggle="collapse" role="button" aria-expanded="false" className="p-3 p-md-4 collapsed">
                    <div className="d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">Preciso de conhecimentos técnicos?</h6>
                      <i className="ri-arrow-down-s-line ri-lg"></i>
                    </div>
                  </a>
                  <div className="collapse" id="faqOne2" data-parent="#faqOne">
                    <p className="mb-0 px-3 px-md-4 pb-3 pb-md-4">
                      Não. Onboarding 100% guiado com templates prontos que você customiza em minutos.
                    </p>
                  </div>
                </div>
                <div className="card border-top-0 border-left-0 border-right-0">
                  <a href="#faqOne3" data-toggle="collapse" role="button" aria-expanded="false" className="p-3 p-md-4 collapsed">
                    <div className="d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">A IA erra? Posso revisar?</h6>
                      <i className="ri-arrow-down-s-line ri-lg"></i>
                    </div>
                  </a>
                  <div className="collapse" id="faqOne3" data-parent="#faqOne">
                    <p className="mb-0 px-3 px-md-4 pb-3 pb-md-4">
                      Sim. Você controla todas as regras, ajusta respostas a qualquer momento e assume conversa quando precisar.
                    </p>
                  </div>
                </div>
                <div className="card border-0">
                  <a href="#faqOne4" data-toggle="collapse" role="button" aria-expanded="false" className="p-3 p-md-4 collapsed">
                    <div className="d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">Posso cancelar?</h6>
                      <i className="ri-arrow-down-s-line ri-lg"></i>
                    </div>
                  </a>
                  <div className="collapse" id="faqOne4" data-parent="#faqOne">
                    <p className="mb-0 px-3 px-md-4 pb-3 pb-md-4">
                      Sim. Teste grátis 7 dias sem cartão — continue apenas se gerar valor real para seu negócio.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-lg-5 mt-5 mt-lg-0">
              <div id="faqTwo">
                <div className="card border-top-0 border-left-0 border-right-0">
                  <a href="#faqTwo1" data-toggle="collapse" role="button" aria-expanded="false" className="p-3 p-md-4 collapsed">
                    <div className="d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">Meus dados ficam seguros?</h6>
                      <i className="ri-arrow-down-s-line ri-lg"></i>
                    </div>
                  </a>
                  <div className="collapse" id="faqTwo1" data-parent="#faqTwo">
                    <p className="mb-0 px-3 px-md-4 pb-3 pb-md-4">
                      Sim. Segurança em primeiro lugar: autenticação forte, criptografia de dados e backups automáticos diários.
                    </p>
                  </div>
                </div>
                <div className="card border-top-0 border-left-0 border-right-0">
                  <a href="#faqTwo2" data-toggle="collapse" role="button" aria-expanded="false" className="p-3 p-md-4 collapsed">
                    <div className="d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">Para qual tipo de negócio funciona?</h6>
                      <i className="ri-arrow-down-s-line ri-lg"></i>
                    </div>
                  </a>
                  <div className="collapse" id="faqTwo2" data-parent="#faqTwo">
                    <p className="mb-0 px-3 px-md-4 pb-3 pb-md-4">
                      Clínicas, salões, academias, e-commerce, consultoria B2B, infoprodutores e times de vendas. Qualquer negócio que usa WhatsApp.
                    </p>
                  </div>
                </div>
                <div className="card border-top-0 border-left-0 border-right-0">
                  <a href="#faqTwo3" data-toggle="collapse" role="button" aria-expanded="false" className="p-3 p-md-4 collapsed">
                    <div className="d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">O que está incluído no plano?</h6>
                      <i className="ri-arrow-down-s-line ri-lg"></i>
                    </div>
                  </a>
                  <div className="collapse" id="faqTwo3" data-parent="#faqTwo">
                    <p className="mb-0 px-3 px-md-4 pb-3 pb-md-4">
                      IA inteligente, CRM com funil visual, campanhas de marketing, agendamento automático, pagamentos com PIX, API e integrações.
                    </p>
                  </div>
                </div>
                <div className="card border-0">
                  <a href="#faqTwo4" data-toggle="collapse" role="button" aria-expanded="false" className="p-3 p-md-4 collapsed">
                    <div className="d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">Como funciona o suporte?</h6>
                      <i className="ri-arrow-down-s-line ri-lg"></i>
                    </div>
                  </a>
                  <div className="collapse" id="faqTwo4" data-parent="#faqTwo">
                    <p className="mb-0 px-3 px-md-4 pb-3 pb-md-4">
                      Onboarding guiado, templates prontos para seu nicho, documentação completa e time de suporte por WhatsApp e email.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7 - CTA */}
      <section className="space-1 mb-5">
        <div className="container bg-primary-3 text-white px-5 py-5 rounded-lg">
          <div className="text-center w-lg-75 mx-auto py-5">
            <h2>Pronto para transformar seu WhatsApp em máquina de vendas?</h2>
            <p className="lead mt-4">Conecte seu WhatsApp, ative a IA inteligente e veja seu funil, conversas e agenda funcionando em minutos.</p>
            <button onClick={() => setLocation('/cadastro')} className="d-inline-flex align-items-center btn btn-primary mt-4">
              Começar teste grátis agora
              <i className="ri-arrow-right-line ri-lg ml-2"></i>
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="space-3 pb-4 bg-primary-3 text-white link-white">
        <div className="container">
          <div className="row">
            <div className="col-12 col-lg-4">
              <p className="lead">Receba atualizações do AgenteZap. Sem spam e nunca compartilharemos seu e-mail.</p>
              <form id="newsletter">
                <div className="input-group mb-3">
                  <input type="email" className="form-control" placeholder="Seu e-mail" required />
                  <div className="input-group-append align-items-center">
                    <button className="btn btn-primary rounded-right" type="submit">
                      Enviar
                    </button>
                  </div>
                </div>
              </form>
            </div>
            <div className="col-4 col-lg-2 offset-lg-2 mt-5 mt-lg-0">
              <h5>Empresa</h5>
              <div className="row">
                <div className="col">
                  <a className="nav-link pl-0" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">Sobre</a>
                  <a className="nav-link pl-0" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">Blog</a>
                  <a className="nav-link pl-0" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">Carreiras</a>
                  <a className="nav-link pl-0" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">Contato</a>
                  <a className="nav-link pl-0" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">FAQ</a>
                  <a className="nav-link pl-0" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">Time</a>
                </div>
              </div>
            </div>
            <div className="col-4 col-lg-2 mt-5 mt-lg-0">
              <h5>Suporte</h5>
              <a className="nav-link pl-0" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">Comunidade</a>
              <a className="nav-link pl-0" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">Central de Ajuda</a>
              <a className="nav-link pl-0" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">Webinars</a>
            </div>
            <div className="col-4 col-lg-2 mt-5 mt-lg-0">
              <h5>Legal</h5>
              <a className="nav-link pl-0" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>
              <a className="nav-link pl-0" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">LGPD</a>
              <a className="nav-link pl-0" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">Segurança</a>
              <a className="nav-link pl-0" href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">Termos de Uso</a>
            </div>
          </div>
          <div className="row pt-5 pb-0">
            <div className="col">
              <hr />
            </div>
          </div>
          <div className="row flex-column flex-lg-row align-items-center justify-content-center justify-content-lg-between text-center text-lg-left">
            <div className="col-auto">
              <div className="d-flex flex-column flex-sm-row align-items-center text-small">
                <div>
                  <small>Copyright &copy; 2025 AgenteZap, Todos direitos reservados. Feito com ❤️ no Brasil.</small>
                </div>
              </div>
            </div>
            <div className="col-auto mt-3 mt-lg-0">
              <ul className="list-unstyled d-flex mb-0 mt-2 link-white">
                <li className="mx-3">
                  <a href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer" className="text-decoration-none" aria-label="GitHub">
                    <i className="ri-github-fill ri-lg"></i>
                  </a>
                </li>
                <li className="mx-3">
                  <a href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer" className="text-decoration-none" aria-label="Instagram">
                    <i className="ri-instagram-fill ri-lg"></i>
                  </a>
                </li>
                <li className="mx-3">
                  <a href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer" className="text-decoration-none" aria-label="Facebook">
                    <i className="ri-facebook-fill ri-lg"></i>
                  </a>
                </li>
                <li className="mx-3">
                  <a href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer" className="text-decoration-none" aria-label="WhatsApp">
                    <i className="ri-whatsapp-fill ri-lg"></i>
                  </a>
                </li>
                <li className="mx-3">
                  <a href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer" className="text-decoration-none" aria-label="LinkedIn">
                    <i className="ri-linkedin-fill ri-lg"></i>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp Button */}
      <div className="whatsapp-fab" aria-hidden="false">
        <a href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer" aria-label="Abrir conversa no WhatsApp" title="Fale conosco no WhatsApp">
          <i className="ri-whatsapp-fill" aria-hidden="true"></i>
        </a>
      </div>

      <style>{`
        .wa-frame {
          height: 920px;
          width: 100%;
          border: none;
          border-radius: 34px;
          padding: 12px;
          background: linear-gradient(180deg, #dfe7ea, #bfc9cd);
          box-shadow: 0 10px 30px rgba(15, 20, 22, 0.12);
          overflow: visible;
          position: relative;
          display: flex;
          align-items: stretch;
        }
        .wa-frame:before {
          content: '';
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          width: 56px;
          height: 6px;
          background: #c7cfd3;
          border-radius: 6px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
          opacity: 0.9;
        }
        .wa-inner {
          flex: 1;
          height: 100%;
          background: linear-gradient(#fbfdfb, #f6fbf6);
          border-radius: 22px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .wa-header {
          padding: 12px 14px;
          background: transparent;
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid #eef1f3;
        }
        .wa-avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: #25d36633;
          color: #25d366;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
        }
        .wa-screen {
          flex: 1;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: auto;
        }
        .bubble-in {
          background: #ffffff;
          color: #111;
          padding: 10px 12px;
          border-radius: 18px;
          max-width: 78%;
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
        }
        .bubble-out {
          background: #dcf8c6;
          color: #111;
          padding: 10px 12px;
          border-radius: 18px;
          max-width: 78%;
          align-self: flex-end;
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
        }
        .wa-footer {
          padding: 12px 14px;
          background: transparent;
          border-top: 1px solid #eef1f3;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .typing .dot {
          width: 6px;
          height: 6px;
          background: #6c757d;
          border-radius: 50%;
          display: inline-block;
          margin-right: 4px;
          opacity: 0.2;
          animation: typing 1s infinite;
        }
        .typing .dot:nth-child(2) {
          animation-delay: 0.15s;
        }
        .typing .dot:nth-child(3) {
          animation-delay: 0.3s;
        }
        @keyframes typing {
          0% { opacity: 0.2; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-3px); }
          100% { opacity: 0.2; transform: translateY(0); }
        }
        .whatsapp-fab {
          position: fixed;
          right: 18px;
          bottom: 22px;
          z-index: 9999;
        }
        .whatsapp-fab a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #0b8c8c;
          color: #fff;
          box-shadow: 0 8px 24px rgba(11, 140, 140, 0.18);
          text-decoration: none;
        }
        .whatsapp-fab a:hover {
          transform: translateY(-4px);
          transition: transform .16s ease;
        }
      `}</style>
    </>
  );
}
