import { useLocation } from "wouter";
import { useEffect } from "react";

export default function LandingFindeas() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Carregar scripts da landing page
    const loadScripts = async () => {
      // AOS
      const aosScript = document.createElement("script");
      aosScript.src = "/findeas-theme/assets/js/aos.min.js";
      document.body.appendChild(aosScript);

      // Swiper
      const swiperScript = document.createElement("script");
      swiperScript.src = "/findeas-theme/assets/js/swiper.min.js";
      document.body.appendChild(swiperScript);

      // Plyr
      const plyrScript = document.createElement("script");
      plyrScript.src = "/findeas-theme/assets/js/plyr.min.js";
      document.body.appendChild(plyrScript);
    };

    loadScripts();
  }, []);

  return (
    <div>
      {/* Preloader */}
      <div className="preloader" id="preloader">
        <div className="spinner-border text-primary" role="status"></div>
      </div>

      {/* Header */}
      <header>
        <nav className="navbar fixed-top navbar-border navbar-expand-lg navbar-light bg-white py-3">
          <div className="container">
            {/* Logo */}
            <a className="navbar-brand order-lg-1 flex-grow-1" href="#" aria-label="Logo">
              <div className="d-flex align-items-center" style={{ fontWeight: 700, fontSize: "1.5rem", color: "#000" }}>
                <i className="ri-robot-2-fill" style={{ color: "#0b8c8c", fontSize: "1.8rem", marginRight: "0.5rem" }}></i>
                <span>AgenteZap</span>
              </div>
            </a>

            {/* Navbar Action Button */}
            <div className="d-none d-md-flex align-items-center order-2 order-lg-2 justify-content-end mr-3 mr-lg-0">
              <button
                onClick={() => setLocation("/cadastro")}
                className="btn btn-primary d-inline-flex align-items-center"
                aria-label="Começar grátis — criar conta"
                title="Começar grátis"
              >
                <i className="ri-user-add-line ri-lg mr-2" aria-hidden="true" focusable={false}></i>
                <span>Começar grátis</span>
              </button>
            </div>

            {/* Navbar Toggler */}
            <button
              className="navbar-toggler d-lg-none d-flex align-items-center order-3 order-lg-3"
              type="button"
              data-toggle="collapse"
              data-target="#navbar"
              aria-controls="navbar"
              aria-expanded="false"
              aria-label="Toggle navigation"
            >
              <i className="ri-menu-3-fill ri-xl"></i>
            </button>

            {/* Navbar Menu */}
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
                    <a className="dropdown-item d-flex align-items-center" href="https://wa.me/5517981679818?text=Olá%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">
                      <i className="ri-book-open-line ri-lg mr-2"></i>
                      Contato
                    </a>
                    <a className="dropdown-item d-flex align-items-center" href="https://wa.me/5517981679818?text=Olá%2C%20preciso%20de%20suporte" target="_blank" rel="noopener noreferrer">
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

      {/* Hero Section */}
      <section className="space-3 mt-5" id="inicio">
        <div className="container">
          <div className="row align-items-center justify-content-around">
            <div className="col-lg-6 pr-lg-5">
              <h1 className="display-4 font-weight-bold line-height-1" data-aos="fade-up">
                Transforme WhatsApp com IA
              </h1>
              <p className="h5 font-weight-normal mt-4" data-aos="fade-up" data-aos-delay="100">
                Inteligência artificial 24/7 gerenciando atendimento, conversas, funil, campanhas e agendamentos em um único painel inteligente.
              </p>
              <div className="mt-4" data-aos="fade-up" data-aos-delay="200">
                <button
                  onClick={() => setLocation("/cadastro")}
                  className="d-inline-flex align-items-center btn btn-primary mb-2 mb-md-0"
                >
                  Iniciar gratuitamente agora
                  <i className="ri-arrow-right-line ri-lg ml-2"></i>
                </button>
                <a href="#" className="btn btn-outline-dark">Agendar demo</a>
                <p className="text-muted mt-1"><small>Grandes empresas já automatizam vendas e atendimento com AgenteZap</small></p>
              </div>
              <div className="mt-4 mb-5" data-aos="fade-up" data-aos-delay="300">
                <p className="mb-2">Confiado por:</p>
                <img className="mr-3 mb-3 mb-md-0" src="/findeas-theme/assets/img/logo-treva.png" alt="Brand" height="28" />
                <img className="mr-3 mb-3 mb-md-0" src="/findeas-theme/assets/img/logo-muzica.png" alt="Brand" height="28" />
                <img className="mr-3 mb-3 mb-md-0" src="/findeas-theme/assets/img/logo-goldline.png" alt="Brand" height="28" />
              </div>
            </div>
            <div className="col-lg-6" data-aos="fade-left">
              <img className="img-fluid rounded-lg" src="/findeas-theme/assets/img/image1.png" alt="Image" data-zoomable />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

