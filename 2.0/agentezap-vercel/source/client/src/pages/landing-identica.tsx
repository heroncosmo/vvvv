import { useEffect } from "react";

export default function LandingIdentica() {
  useEffect(() => {
    // Scroll smooth
    document.documentElement.style.scrollBehavior = 'smooth';
    
    // Page title
    document.title = 'AgenteZap - Agente de IA para WhatsApp que Vende Automaticamente';
    
    // Meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Transforme seu WhatsApp em máquina de vendas automática. IA que atende, qualifica e vende 24/7. +2.847 empresas já vendendo mais. Setup em 2 minutos.');
    }
    
    // Structured data for SEO
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "AgenteZap",
      "description": "IA que transforma WhatsApp em máquina de vendas automática",
      "url": "https://agentezap.com",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Any",
      "offers": {
        "@type": "Offer",
        "price": "97",
        "priceCurrency": "BRL",
        "priceValidUntil": "2025-12-31"
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "reviewCount": "2847"
      }
    };
    
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(structuredData);
    document.head.appendChild(script);
    
    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#ffffff' }}>
      {/* Preloader */}
      <div id="preloader" className="preloader" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#ffffff',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div className="spinner-border text-primary" role="status" style={{
          width: '3rem',
          height: '3rem',
          border: '0.25em solid #0b8c8c',
          borderRight: '0.25em solid transparent',
          borderRadius: '50%',
          borderTop: '3px solid #0b8c8c',
          borderRight: '3px solid transparent',
          animation: 'spinner-border 0.75s linear infinite'
        }}></div>
      </div>

      {/* Header */}
      <header>
        <nav className="navbar fixed-top navbar-border navbar-expand-lg navbar-light bg-white py-3" style={{
          position: 'fixed',
          top: 0,
          width: '100%',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e9ecef',
          zIndex: 1000
        }}>
          <div className="container" style={{
            maxWidth: '1140px',
            padding: '0 15px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            {/* Logo */}
            <a className="navbar-brand order-lg-1 flex-grow-1" href="#" aria-label="Logo" style={{
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              fontSize: '1.125rem',
              fontWeight: 600,
              color: '#343a40'
            }}>
              <span style={{
                width: '32px',
                height: '32px',
                backgroundColor: '#0b8c8c',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '16px'
              }}>AZ</span>
              <span style={{ marginLeft: '8px', fontSize: '1.125rem', fontWeight: 700 }}>AgenteZap</span>
            </a>

            {/* Navbar Action Button */}
            <div className="d-none d-lg-flex align-items-center order-2 order-lg-2 justify-content-end mr-3 mr-lg-0" style={{
              display: 'none',
              alignItems: 'center'
            }}>
              <a className="btn btn-primary d-inline-flex align-items-center" href="https://themeforest.net/user/qoorasa/portfolio" style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.625rem 1.2rem',
                fontSize: '1rem',
                fontWeight: 500,
                color: '#ffffff',
                backgroundColor: '#0b8c8c',
                border: 'none',
                borderRadius: '0.2rem',
                textDecoration: 'none',
                transition: 'all 0.15s ease-in-out'
              }}>
                <i className="ri-shopping-cart-2-line ri-lg mr-2" style={{ marginRight: '8px' }}></i>
                <span>Comprar Agora</span>
              </a>
            </div>

            {/* Navbar Toggler */}
            <button className="navbar-toggler d-lg-none d-flex align-items-center order-3 order-lg-3" type="button" style={{
              display: 'none',
              padding: '0.25rem 0.75rem',
              fontSize: '1.125rem',
              backgroundColor: 'transparent',
              border: '1px solid transparent',
              borderRadius: '0.2rem'
            }}>
              <i className="ri-menu-3-fill ri-xl"></i>
            </button>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main>
        {/* Section 1 - Hero */}
        <section className="space-3 mt-5" style={{ paddingTop: '5rem' }}>
          <div className="container" style={{ maxWidth: '1140px', margin: '0 auto' }}>
            <div className="row align-items-center justify-content-around" style={{ display: 'flex', alignItems: 'center' }}>
              <div className="col-lg-6 pr-lg-5" style={{ flex: '0 0 50%', paddingRight: '2rem' }}>
                <h1 className="display-4 font-weight-bold line-height-1" style={{
                  fontSize: '4.5rem',
                  fontWeight: 300,
                  lineHeight: 1.3,
                  color: '#212529',
                  marginBottom: '0'
                }}>AgenteZap landing page template.</h1>
                <p className="h5 font-weight-normal mt-4" style={{
                  fontSize: '1.25rem',
                  fontWeight: 400,
                  color: '#343a40',
                  lineHeight: 1.5,
                  marginTop: '1rem'
                }}>Save time and build better websites for Saas, Software & Startup with AgenteZap.</p>
                <div className="mt-4" style={{ marginTop: '1rem' }}>
                  <a href="#" className="d-inline-flex align-items-center btn btn-primary mb-2 mb-md-0" style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0.625rem 1.2rem',
                    fontSize: '1rem',
                    fontWeight: 500,
                    color: '#ffffff',
                    backgroundColor: '#0b8c8c',
                    border: 'none',
                    borderRadius: '0.2rem',
                    textDecoration: 'none',
                    marginRight: '8px',
                    transition: 'all 0.15s ease-in-out'
                  }}>
                    Start free 7-day trial
                    <i className="ri-arrow-right-line ri-lg ml-2" style={{ marginLeft: '8px' }}></i>
                  </a>
                  <a href="#" className="btn btn-outline-dark" style={{
                    padding: '0.625rem 1.2rem',
                    fontSize: '1rem',
                    fontWeight: 500,
                    color: '#212529',
                    backgroundColor: 'transparent',
                    border: '1px solid #212529',
                    borderRadius: '0.2rem',
                    textDecoration: 'none',
                    transition: 'all 0.15s ease-in-out'
                  }}>Request a demo</a>
                  <p className="text-muted mt-1" style={{ color: '#6c757d', fontSize: '0.875rem', marginTop: '0.5rem' }}><small>No credit card required.</small></p>
                </div>
                <div className="mt-4 mb-5" style={{ marginTop: '1rem', marginBottom: '3rem' }}>
                  <p className="mb-2" style={{ marginBottom: '0.5rem', color: '#6c757d' }}>Trusted by:</p>
                  <img className="mr-3 mb-3 mb-md-0" src="https://images.unsplash.com/photo-1556715027-5789f829e7794?w=80&h=80&fit=crop&crop=face" alt="Brand" height="28" style={{ marginRight: '12px', marginBottom: '12px' }} />
                  <img className="mr-3 mb-3 mb-md-0" src="https://images.unsplash.com/photo-1556715027-5789f829e7794?w=80&h=80&fit=crop&crop=face" alt="Brand" height="28" style={{ marginRight: '12px', marginBottom: '12px' }} />
                  <img className="mr-3 mb-3 mb-md-0" src="https://images.unsplash.com/photo-1556715027-5789f829e7794?w=80&h=80&fit=crop&crop=face" alt="Brand" height="28" style={{ marginRight: '12px', marginBottom: '12px' }} />
                </div>
              </div>
              <div className="col-lg-6" style={{ flex: '0 0 50%' }}>
                <img className="img-fluid rounded-lg" src="https://images.unsplash.com/photo-1556715027-5789f829e7794?w=600&h=400&fit=crop" alt="Image" style={{
                  maxWidth: '100%',
                  height: 'auto',
                  borderRadius: '0.2rem'
                }} />
              </div>
            </div>
          </div>
        </section>

        {/* Section 2 - Features */}
        <section className="space-1" style={{ padding: '3rem 0' }}>
          <div className="container" style={{ maxWidth: '1140px', margin: '0 auto' }}>
            <div className="w-100 w-lg-75 text-center mx-auto mb-3" style={{
              width: '100%',
              maxWidth: '75%',
              margin: '0 auto',
              textAlign: 'center',
              marginBottom: '1.5rem'
            }}>
              <h2 className="font-weight-bold" style={{ fontSize: '2rem', fontWeight: 500, color: '#212529' }}>Break code barrier, save your development time with AgenteZap features.</h2>
            </div>
            <div className="row d-flex justify-content-center flex-wrap" style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap' }}>
              {[
                { icon: '🎨', title: 'Design Moderno', desc: 'Dramaticamente disseminate métricas padronizadas após processos de nivelamento de recursos.' },
                { icon: '💻', title: 'Código Limpo', desc: 'Eficientemente habilite fontes habilitadas e produtos eficazes.' },
                { icon: '📦', title: 'Atualizações Regulares', desc: 'Eficientemente habilite fontes habilitadas e produtos com custo efetivo.' },
                { icon: '😊', title: 'Bom Suporte', desc: 'Dramaticamente disseminate métricas padronizadas após processos de nivelamento de recursos.' }
              ].map((feature, index) => (
                <div key={index} className="col-md-6 mb-4 col-lg-5" style={{
                  flex: '0 0 50%',
                  maxWidth: '41.666667%',
                  marginBottom: '1rem'
                }}>
                  <div className="bg-light rounded-lg h-100 px-5 py-5 hover-bg-primary hover-translate-y" style={{
                    backgroundColor: '#f8f9fa',
                    borderRadius: '0.2rem',
                    padding: '1.25rem 1.5rem',
                    height: '100%',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer'
                  }} onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#0b8c8c';
                    e.currentTarget.style.transform = 'translateY(-5px)';
                  }} onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8f9fa';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}>
                    <div style={{ fontSize: '3rem', color: '#0b8c8c', marginBottom: '0.5rem' }}>{feature.icon}</div>
                    <h5 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#212529', marginBottom: '0' }}>{feature.title}</h5>
                    <p className="lead" style={{ fontSize: '1.125rem', fontWeight: 400, color: '#343a40', lineHeight: 1.5 }}>{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3 - Build & Launch */}
        <section className="space-5" style={{ padding: '5rem 0' }}>
          <div className="container" style={{ maxWidth: '1140px', margin: '0 auto' }}>
            <div className="row align-items-center justify-content-around" style={{ display: 'flex', alignItems: 'center' }}>
              <div className="col-lg-7" style={{ flex: '0 0 58.33333%' }}>
                <div className="row" style={{ display: 'flex', flexWrap: 'wrap' }}>
                  <div className="col-md-6 mb-4 mb-md-0" style={{ flex: '0 0 50%', marginBottom: '1rem' }}>
                    <img className="img-fluid rounded-lg" src="https://images.unsplash.com/photo-1556715027-5789f829e7794?w=400&h=300&fit=crop" alt="Image" style={{
                      maxWidth: '100%',
                      height: 'auto',
                      borderRadius: '0.2rem'
                    }} />
                  </div>
                  <div className="col-md-6" style={{ flex: '0 0 50%' }}>
                    <img className="img-fluid rounded-lg" src="https://images.unsplash.com/photo-1556715027-5789f829e7794?w=400&h=300&fit=crop" alt="Image" style={{
                      maxWidth: '100%',
                      height: 'auto',
                      borderRadius: '0.2rem'
                    }} />
                  </div>
                </div>
              </div>
              <div className="col-lg-5 mt-4 mt-lg-0 pl-lg-4" style={{ flex: '0 0 41.66667%', marginTop: '1rem', paddingLeft: '2rem' }}>
                <div style={{ fontSize: '3rem', color: '#0b8c8c', marginBottom: '1rem' }}>🚀</div>
                <h2 className="font-weight-bold" style={{ fontSize: '2rem', fontWeight: 500, color: '#212529' }}>Build a perfect and good looking landing page.</h2>
                <p className="lead mt-2 mb-4" style={{
                  fontSize: '1.125rem',
                  fontWeight: 400,
                  color: '#343a40',
                  lineHeight: 1.5,
                  marginTop: '0.5rem',
                  marginBottom: '1rem'
                }}>Proactively envisioned multimedia based expertise and cross-media growth strategies.</p>
                <div className="row mt-5" style={{ display: 'flex', flexWrap: 'wrap', marginTop: '1rem' }}>
                  {[
                    { src: 'https://images.unsplash.com/photo-1556715027-5789f829e7794?w=80&h=80&fit=crop&crop=face', name: 'Atica' },
                    { src: 'https://images.unsplash.com/photo-1556715027-5789f829e7794?w=80&h=80&fit=crop&crop=face', name: 'Earth' },
                    { src: 'https://images.unsplash.com/photo-1556715027-5789f829e7794?w=80&h=80&fit=crop&crop=face', name: 'TVit' },
                    { src: 'https://images.unsplash.com/photo-1556715027-5789f829e7794?w=80&h=80&fit=crop&crop=face', name: 'Company 9' }
                  ].map((brand, index) => (
                    <div key={index} className="col" style={{ flex: '0 0 25%' }}>
                      <img src={brand.src} height="48" alt={brand.name} style={{ height: '48px' }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Accordion Section */}
            <div className="row align-items-center justify-content-around space-5 pb-0 mb-4 mb-lg-0" style={{ display: 'flex', alignItems: 'center', paddingBottom: 0, marginBottom: '1rem' }}>
              <div className="col-lg-5 mb-5 mb-lg-0" style={{ flex: '0 0 41.66667%', marginBottom: '1rem' }}>
                <div style={{ fontSize: '3rem', color: '#0b8c8c', marginBottom: '1rem' }}>🚀</div>
                <h2 className="font-weight-bold" style={{ fontSize: '2rem', fontWeight: 500, color: '#212529' }}>Launch your website now using AgenteZap.</h2>
                <p className="lead mt-2 mb-3" style={{
                  fontSize: '1.125rem',
                  fontWeight: 400,
                  color: '#343a40',
                  lineHeight: 1.5,
                  marginTop: '0.5rem',
                  marginBottom: '1rem'
                }}>Proactively envisioned cross-media growth strategies. Seamlessly visualize quality intellectual capital without superior collaboration.</p>
                <div id="accordion" style={{ marginBottom: '1rem' }}>
                  {[
                    { title: 'Get started - Introduction', content: 'Minima facere ullam harum enim! Quisquam facere rem quidem nostrum dolore non accusantium quo. Facilis quo alias excepturi adipisci minima. Placeat aliquid atque libero, iusto accusamus perspiciatis? Maxime exercitationem vero quasi harum?' },
                    { title: 'Customize Template Style', content: 'Nulla temporibus officia voluptate culpa commodi, officiis maxime dolore nemo sapiente magni neque enim, numquam, blanditiis itaque quis iure ex impedit facilis id. Molestiae ad ipsa animi.' }
                  ].map((item, index) => (
                    <div key={index} className="card mb-2 mb-md-3" style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '0.2rem',
                      marginBottom: '0.5rem'
                    }}>
                      <a href={`#accordion${index + 1}`} onClick={(e) => {
                        e.preventDefault();
                        const content = document.getElementById(`accordion${index + 1}`);
                        const allContents = document.querySelectorAll('[id^="accordion"]');
                        allContents.forEach(c => {
                          if (c !== content) {
                            c.style.display = 'none';
                          const header = c.previousElementSibling;
                            const icon = header.querySelector('i');
                            if (icon) icon.style.transform = 'rotate(0deg)';
                          }
                        });
                        if (content.style.display === 'none') {
                          content.style.display = 'block';
                          const header = content.previousElementSibling;
                          const icon = header.querySelector('i');
                          if (icon) icon.style.transform = 'rotate(-180deg)';
                        }
                      }} className="p-3 p-md-4 collapsed" style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        fontSize: '1rem',
                        color: '#343a40',
                        textDecoration: 'none',
                        cursor: 'pointer'
                      }}>
                        <h6 className="mb-0" style={{ margin: 0, fontWeight: 600 }}>{item.title}</h6>
                        <i className="ri-arrow-down-s-line ri-lg"></i>
                      </a>
                      <div id={`accordion${index + 1}`} className="collapse" style={{
                        display: 'none',
                        padding: '0.75rem 1rem'
                      }}>
                        <p className="mb-0 px-3 px-md-4 pb-3 pb-md-4" style={{ margin: 0, lineHeight: 1.5 }}>{item.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="col-lg-6" style={{ flex: '0 0 50%' }}>
                <img className="img-fluid rounded-lg" src="https://images.unsplash.com/photo-1556715027-5789f829e7794?w=800&h=400&fit=crop" alt="Image" style={{
                  maxWidth: '100%',
                  height: 'auto',
                  borderRadius: '0.2rem'
                }} />
              </div>
            </div>
          </div>
        </section>

        {/* Section 4 - Simple Steps */}
        <section className="space-3 bg-primary-3" style={{
          padding: '3rem 0',
          backgroundColor: '#05555C'
        }}>
          <div className="container" style={{ maxWidth: '1140px', margin: '0 auto' }}>
            <div className="w-100 w-lg-75 text-center mx-auto mb-5 text-white" style={{
              width: '100%',
              maxWidth: '75%',
              margin: '0 auto',
              textAlign: 'center',
              marginBottom: '3rem',
              color: '#ffffff'
            }}>
              <div style={{ fontSize: '3rem', color: '#ffffff', marginBottom: '1rem' }}>📦</div>
              <h2 className="font-weight-bold text-center" style={{ fontSize: '2rem', fontWeight: 500, color: '#ffffff' }}>It's Simple and Easy.</h2>
              <p className="lead" style={{
                fontSize: '1.125rem',
                fontWeight: 400,
                lineHeight: 1.5,
                color: '#ffffff'
              }}>Quickly communicate enabled technology and turnkey leadership skills. Uniquely enable accurate supply chains rather than frictionless technology.</p>
            </div>
            <div className="row text-center" style={{ display: 'flex', justifyContent: 'center' }}>
              {[
                { step: '1', title: 'Register' },
                { step: '2', title: 'Login' },
                { step: '3', title: 'Setup' },
                { step: '4', title: 'Enjoy' }
              ].map((step, index) => (
                <div key={index} className="col-sm-6 col-md-3 my-3 my-md-0 text-white" style={{
                  flex: '0 0 25%',
                  margin: '0.75rem 0'
                }}>
                  <div className="card card-body bg-white hover-translate-y hover-shadow" style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '0.2rem',
                    padding: '1.5rem',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer'
                  }} onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-5px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px -1px rgba(0,0,0,0.15)';
                  }} onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}>
                    <h2 className="h1 font-weight-bold" style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '0', color: '#212529' }}>{step.step}</h2>
                    <p className="font-weight-medium" style={{ fontWeight: 500, color: '#343a40' }}>{step.title}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-5" style={{ textAlign: 'center', marginTop: '3rem' }}>
              <a href="#" className="d-inline-flex align-items-center btn btn-primary" style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.625rem 1.2rem',
                fontSize: '1rem',
                fontWeight: 500,
                color: '#ffffff',
                backgroundColor: '#0b8c8c',
                border: 'none',
                borderRadius: '0.2rem',
                textDecoration: 'none',
                transition: 'all 0.15s ease-in-out'
              }}>
                Buy now & let's start
                <i className="ri-arrow-right-line ri-lg ml-2" style={{ marginLeft: '8px' }}></i>
              </a>
            </div>
          </div>
        </section>

        {/* Section 5 - Testimonials */}
        <section className="space-5 bg-light" style={{
          padding: '5rem 0',
          backgroundColor: '#f7f9fc'
        }}>
          <div className="container" style={{ maxWidth: '1140px', margin: '0 auto' }}>
            <div className="w-100 w-lg-75 text-center mx-auto mb-5" style={{
              width: '100%',
              maxWidth: '75%',
              margin: '0 auto',
              textAlign: 'center',
              marginBottom: '3rem'
            }}>
              <div style={{ fontSize: '3rem', color: '#0b8c8c', marginBottom: '1rem' }}>💬</div>
              <h2 className="font-weight-bold text-center" style={{ fontSize: '2rem', fontWeight: 500, color: '#212529' }}>What they said, trusted by thousands of customers around world.</h2>
            </div>
            <div className="card-columns" style={{ columnCount: '3', columnGap: '1.25rem' }}>
              {[
                {
                  quote: '"Leverage agile frameworks to provide a robust synopsis for high level overviews."',
                  name: 'Mary Grant',
                  role: 'UX Designer'
                },
                {
                  quote: '"Override the digital divide with additional clickthroughs from DevOps."',
                  name: 'John Anderson',
                  role: 'Web Developer'
                },
                {
                  quote: '"Efficiently unleash cross-media information without cross-media value. Quickly maximize timely deliverables for real-time schemas."',
                  name: 'Bill Curtis',
                  role: 'CEO'
                },
                {
                  quote: '"Nanotechnology immersion along the information highway will close the loop on focusing solely on the bottom line."',
                  name: 'Michael Joe',
                  role: 'Project Manager'
                },
                {
                  quote: '"Professionally cultivate one-to-one customer service with robust ideas."',
                  name: 'Kate Maryson',
                  role: 'Frontend Engineer'
                },
                {
                  quote: '"Credibly innovate granular internal or organic sources whereas high standards in web-readiness."',
                  name: 'Andrew Grant',
                  role: 'Tech Lead'
                }
              ].map((testimonial, index) => (
                <div key={index} className="card card-body" style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '0.2rem',
                  padding: '1.25rem'
                }}>
                  <p className="lead" style={{ fontSize: '1.125rem', fontWeight: 400, color: '#343a40', lineHeight: 1.5, marginBottom: '2rem' }}>{testimonial.quote}</p>
                  <div className="d-flex mt-5 pt-2" style={{ display: 'flex', alignItems: 'center', marginTop: '2rem', paddingTop: '0.5rem' }}>
                    <img className="rounded-circle" src="https://images.unsplash.com/photo-1494790108755-2616b624c?w=80&h=80&fit=crop&crop=face" alt="Image" height="60" style={{
                      borderRadius: '50%',
                      marginRight: '12px',
                      height: '60px'
                    }} />
                    <div style={{ marginLeft: '12px' }}>
                      <h5 className="mb-0" style={{ margin: 0, fontWeight: 600, color: '#212529' }}>{testimonial.name}</h5>
                      <p className="text-muted" style={{ color: '#6c757d', margin: 0 }}>{testimonial.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 6 - FAQ */}
        <section className="space-3" style={{ padding: '3rem 0' }}>
          <div className="container" style={{ maxWidth: '1140px', margin: '0 auto' }}>
            <div className="w-100 w-lg-75 text-center mx-auto mb-5" style={{
              width: '100%',
              maxWidth: '75%',
              margin: '0 auto',
              textAlign: 'center',
              marginBottom: '3rem'
            }}>
              <div style={{ fontSize: '3rem', color: '#0b8c8c', marginBottom: '1rem' }}>❓</div>
              <h2 className="font-weight-bold" style={{ fontSize: '2rem', fontWeight: 500, color: '#212529' }}>Most asked questions.</h2>
              <p className="lead" style={{
                fontSize: '1.125rem',
                fontWeight: 400,
                lineHeight: 1.5,
                color: '#343a40'
              }}>We have most answers you're looking for, in more ways than one. Ask questions, browse around for answers, or submit your feature requests.</p>
            </div>
            <div className="row justify-content-around" style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="col-lg-5" style={{ flex: '0 0 41.66667%' }}>
                <div id="faqOne" style={{ marginBottom: '1rem' }}>
                  {[
                    { question: 'What is AgenteZap?', answer: 'Consectetur, adipisicing elit. Officiis iure nemo exercitationem quas praesentium sint nam quam, vitae repudiandae numquam?' },
                    { question: 'How does AgenteZap work?', answer: 'Id ullam sunt esse cupiditate iure earum ipsa perferendis blanditiis eveniet ut, ratione explicabo odit. Aperiam, facilis.' },
                    { question: 'How is our data being protected?', answer: 'Quos ratione mollitia unde beatae ad praesentium voluptatum recusandae repellendus quas, quae quidem veritatis placeat aperiam!' },
                    { question: 'How to get support?', answer: 'Ratione quisquam veritatis dignissimos ipsum architecto molestias, aliquam et incidunt. Aut porro soluta magni temporibus minus quos provident, nulla pariatur quidem, eveniet molestias praesentium.' }
                  ].map((faq, index) => (
                    <div key={index} className="card border-top-0 border-left-0 border-right-0" style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '0.2rem',
                      marginBottom: '0.5rem'
                    }}>
                      <a href={`#faqOne${index + 1}`} onClick={(e) => {
                        e.preventDefault();
                        const content = document.getElementById(`faqOne${index + 1}`);
                        const allContents = document.querySelectorAll('[id^="faqOne"]');
                        allContents.forEach(c => {
                          if (c !== content) {
                            c.style.display = 'none';
                            const header = c.previousElementSibling;
                            const icon = header.querySelector('i');
                            if (icon) icon.style.transform = 'rotate(0deg)';
                          }
                        });
                        if (content.style.display === 'none') {
                          content.style.display = 'block';
                          const header = content.previousElementSibling;
                          const icon = header.querySelector('i');
                          if (icon) icon.style.transform = 'rotate(-180deg)';
                        }
                      }} className="p-3 p-md-4 collapsed" style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        fontSize: '1rem',
                        color: '#343a40',
                        textDecoration: 'none',
                        cursor: 'pointer'
                      }}>
                        <h6 className="mb-0" style={{ margin: 0, fontWeight: 600 }}>{faq.question}</h6>
                        <i className="ri-arrow-down-s-line ri-lg"></i>
                      </a>
                      <div id={`faqOne${index + 1}`} className="collapse" style={{
                        display: 'none',
                        padding: '0.75rem 1rem'
                      }}>
                        <p className="mb-0 px-3 px-md-4 pb-3 pb-md-4" style={{ margin: 0, lineHeight: 1.5 }}>{faq.answer}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="col-lg-5 mt-5 mt-lg-0" style={{ flex: '0 0 41.66667%', marginTop: '1rem' }}>
                <div id="faqTwo">
                  {[
                    { question: 'How to update items?', answer: 'Consectetur, adipisicing elit. Officiis iure nemo exercitationem quas praesentium sint nam quam, vitae repudiandae numquam?' },
                    { question: 'What is W3C Validate?', answer: 'Id ullam sunt esse cupiditate iure earum ipsa perferendis blanditiis eveniet ut, ratione explicabo odit. Aperiam, facilis.' },
                    { question: 'How to change logo?', answer: 'Quos ratione mollitia unde beatae ad praesentium voluptatum recusandae repellendus quas, quae quidem veritatis placeat aperiam!' },
                    { question: 'How to create color schemes?', answer: 'Ratione quisquam veritatis dignissimos ipsum architecto molestias, aliquam et incidunt. Aut porro soluta magni temporibus minus quos provident, nulla pariatur quidem, eveniet molestias praesentium.' }
                  ].map((faq, index) => (
                    <div key={index} className="card border-top-0 border-left-0 border-right-0" style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '0.2rem',
                      marginBottom: index === 3 ? 0 : '0.5rem'
                    }}>
                      <a href={`#faqTwo${index + 1}`} onClick={(e) => {
                        e.preventDefault();
                        const content = document.getElementById(`faqTwo${index + 1}`);
                        const allContents = document.querySelectorAll('[id^="faqTwo"]');
                        allContents.forEach(c => {
                          if (c !== content) {
                            c.style.display = 'none';
                            const header = c.previousElementSibling;
                            const icon = header.querySelector('i');
                            if (icon) icon.style.transform = 'rotate(0deg)';
                          }
                        });
                        if (content.style.display === 'none') {
                          content.style.display = 'block';
                          const header = content.previousElementSibling;
                          const icon = header.querySelector('i');
                          if (icon) icon.style.transform = 'rotate(-180deg)';
                        }
                      }} className="p-3 p-md-4 collapsed" style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        fontSize: '1rem',
                        color: '#343a40',
                        textDecoration: 'none',
                        cursor: 'pointer'
                      }}>
                        <h6 className="mb-0" style={{ margin: 0, fontWeight: 600 }}>{faq.question}</h6>
                        <i className="ri-arrow-down-s-line ri-lg"></i>
                      </a>
                      <div id={`faqTwo${index + 1}`} className="collapse" style={{
                        display: 'none',
                        padding: '0.75rem 1rem'
                      }}>
                        <p className="mb-0 px-3 px-md-4 pb-3 pb-md-4" style={{ margin: 0, lineHeight: 1.5 }}>{faq.answer}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 7 - CTA Final */}
        <section className="space-1 mb-5" style={{ padding: '3rem 0', marginBottom: '3rem' }}>
          <div className="container bg-primary-3 text-white px-5 py-5 rounded-lg" style={{
            backgroundColor: '#05555C',
            color: '#ffffff',
            borderRadius: '0.2rem',
            padding: '1.5rem'
          }}>
            <div className="text-center w-lg-75 mx-auto py-5" style={{
              width: '75%',
              margin: '0 auto',
              textAlign: 'center',
              padding: '1.5rem 0'
            }}>
              <h2 style={{ fontSize: '2rem', fontWeight: 500, marginBottom: '1rem' }}>Ready to launch? Buy AgenteZap now.</h2>
              <p className="lead mt-4" style={{
                fontSize: '1.125rem',
                fontWeight: 400,
                lineHeight: 1.5,
                marginTop: '1rem'
              }}>Ideal for Sass, Software & Startup Landing Page. Save your development time with AgenteZap Landing Page Template.</p>
              <a href="#" className="d-inline-flex align-items-center btn btn-primary mt-4" style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.625rem 1.2rem',
                fontSize: '1rem',
                fontWeight: 500,
                color: '#ffffff',
                backgroundColor: '#0b8c8c',
                border: 'none',
                borderRadius: '0.2rem',
                textDecoration: 'none',
                marginLeft: '1rem',
                transition: 'all 0.15s ease-in-out'
              }}>
                Buy AgenteZap Now
                <i className="ri-arrow-right-line ri-lg ml-2" style={{ marginLeft: '8px' }}></i>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="space-3 pb-4 bg-primary-3 text-white link-white" style={{
        padding: '3rem 0 1rem',
        backgroundColor: '#05555C',
        color: '#ffffff'
      }}>
        <div className="container" style={{ maxWidth: '1140px', margin: '0 auto' }}>
          <div className="row" style={{ display: 'flex', flexWrap: 'wrap' }}>
            <div className="col-12 col-lg-4" style={{ flex: '0 0 100%', maxWidth: '33.33333%' }}>
              <p className="lead text-white" style={{ fontSize: '1.125rem', fontWeight: 400, color: '#ffffff', marginBottom: '1rem' }}>
                Get AgenteZap updates. No spam and We will never share your email address.
              </p>
              <form id="newsletter" action="php/mailchimp.php" method="POST" style={{ marginBottom: '0.75rem' }}>
                <div className="input-group mb-3" style={{ display: 'flex' }}>
                  <input type="email" name="email" className="form-control" placeholder="Your email" required style={{
                    flex: '1',
                    padding: '0.625rem 1.2rem',
                    fontSize: '1rem',
                    fontWeight: 400,
                    color: '#495057',
                    backgroundColor: '#ffffff',
                    border: '1.4px solid #e9ecef',
                    borderRadius: '0.2rem'
                  }} />
                  <div className="input-group-append align-items-center" style={{ display: 'flex', alignItems: 'center' }}>
                    <button id="newsletterBtnSubmit" className="btn btn-primary rounded-right" type="submit" name="submit" style={{
                      padding: '0.625rem 1rem',
                      fontSize: '1rem',
                      fontWeight: 500,
                      color: '#ffffff',
                      backgroundColor: '#0b8c8c',
                      border: 'none',
                      borderRadius: '0 0.2rem 0.2rem 0',
                      marginLeft: '-1px'
                    }}>Send</button>
                  </div>
                </div>
              </form>
            </div>
            <div className="col-4 col-lg-2 offset-lg-2 mt-5 mt-lg-0" style={{ flex: '0 0 16.66667%', marginTop: '1rem' }}>
              <h5 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#ffffff', marginBottom: '1rem' }}>Empresa</h5>
              <div className="row" style={{ display: 'flex', flexDirection: 'column' }}>
                <a className="nav-link pl-0" href="#" style={{ color: '#ffffff', textDecoration: 'none', padding: '0.5rem 0', display: 'block' }}>About</a>
                <a className="nav-link pl-0" href="#" style={{ color: '#ffffff', textDecoration: 'none', padding: '0.5rem 0', display: 'block' }}>Blog</a>
                <a className="nav-link pl-0" href="#" style={{ color: '#ffffff', textDecoration: 'none', padding: '0.5rem 0', display: 'block' }}>Careers</a>
                <a className="nav-link pl-0" href="#" style={{ color: '#ffffff', textDecoration: 'none', padding: '0.5rem 0', display: 'block' }}>Contact</a>
                <a className="nav-link pl-0" href="#" style={{ color: '#ffffff', textDecoration: 'none', padding: '0.5rem 0', display: 'block' }}>FAQ</a>
                <a className="nav-link pl-0" href="#" style={{ color: '#ffffff', textDecoration: 'none', padding: '0.5rem 0', display: 'block' }}>Team</a>
              </div>
            </div>
            <div className="col-4 col-lg-2 mt-5 mt-lg-0" style={{ flex: '0 0 16.66667%', marginTop: '1rem' }}>
              <h5 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#ffffff', marginBottom: '1rem' }}>Suporte</h5>
              <a className="nav-link pl-0" href="#" style={{ color: '#ffffff', textDecoration: 'none', padding: '0.5rem 0', display: 'block' }}>Community</a>
              <a className="nav-link pl-0" href="#" style={{ color: '#ffffff', textDecoration: 'none', padding: '0.5rem 0', display: 'block' }}>Help Center</a>
              <a className="nav-link pl-0" href="#" style={{ color: '#ffffff', textDecoration: 'none', padding: '0.5rem 0', display: 'block' }}>Webinars</a>
            </div>
            <div className="col-4 col-lg-2 mt-5 mt-lg-0" style={{ flex: '0 0 16.66667%', marginTop: '1rem' }}>
              <h5 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#ffffff', marginBottom: '1rem' }}>Legal</h5>
              <a className="nav-link pl-0" href="#" style={{ color: '#ffffff', textDecoration: 'none', padding: '0.5rem 0', display: 'block' }}>Privacy Policy</a>
              <a className="nav-link pl-0" href="#" style={{ color: '#ffffff', textDecoration: 'none', padding: '0.5rem 0', display: 'block' }}>GPDR</a>
              <a className="nav-link pl-0" href="#" style={{ color: '#ffffff', textDecoration: 'none', padding: '0.5rem 0', display: 'block' }}>Security</a>
              <a className="nav-link pl-0" href="#" style={{ color: '#ffffff', textDecoration: 'none', padding: '0.5rem 0', display: 'block' }}>Term of Use</a>
            </div>
          </div>
          <div className="row pt-5 pb-0" style={{ display: 'flex', paddingTop: '1.5rem', paddingBottom: 0 }}>
            <div className="col">
              <hr style={{ borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'solid', borderWidth: '1px 0 0' }} />
            </div>
          </div>
          <div className="row flex-column flex-lg-row align-items-center justify-content-center justify-content-lg-between text-center text-lg-left" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="col-auto">
              <div className="d-flex flex-column flex-sm-row align-items-center text-small" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div>
                  <small>Copyright &copy; 2020 AgenteZap, All right reserved. Coded and Design with Love.</small>
                </div>
              </div>
            </div>
            <div className="col-auto mt-3 mt-lg-0">
              <ul className="list-unstyled d-flex mb-0 mt-2 link-white" style={{
                display: 'flex',
                listStyle: 'none',
                marginBottom: '0.5rem',
                marginTop: '0.5rem'
              }}>
                <li className="mx-3">
                  <a href="#" className="text-decoration-none" aria-label="Twitter" style={{ color: '#ffffff', textDecoration: 'none' }}>
                    <i className="ri-github-fill ri-lg"></i>
                  </a>
                </li>
                <li className="mx-3">
                  <a href="#" className="text-decoration-none" aria-label="Dribbble" style={{ color: '#ffffff', textDecoration: 'none' }}>
                    <i className="ri-dribbble-fill ri-lg"></i>
                  </a>
                </li>
                <li className="mx-3">
                  <a href="#" className="text-decoration-none" aria-label="Behance" style={{ color: '#ffffff', textDecoration: 'none' }}>
                    <i className="ri-behance-fill ri-lg"></i>
                  </a>
                </li>
                <li className="mx-3">
                  <a href="#" className="text-decoration-none" aria-label="Facebook" style={{ color: '#ffffff', textDecoration: 'none' }}>
                    <i className="ri-facebook-fill ri-lg"></i>
                  </a>
                </li>
                <li className="mx-3">
                  <a href="#" className="text-decoration-none" aria-label="Google" style={{ color: '#ffffff', textDecoration: 'none' }}>
                    <i className="ri-google-fill ri-lg"></i>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </footer>

      {/* Custom CSS */}
      <style jsx>{`
        @import url("https://fonts.googleapis.com/css?family=Inter:300,400,500,600,700&display=swap");
        
        * {
          outline: none !important;
        }
        
        html, body {
          position: relative !important;
          overflow-x: hidden !important;
        }
        
        body {
          margin: 0;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
          font-size: 1rem;
          font-weight: 400;
          line-height: 1.5;
          color: #343a40;
          text-align: left;
          background-color: #fff;
        }
        
        h1, h2, h3, h4, h5, h6 {
          margin-top: 0;
          margin-bottom: 0.5rem;
          font-weight: 500;
          line-height: 1.3;
          color: #212529;
        }
        
        .display-4 {
          font-size: 6rem;
          font-weight: 300;
          line-height: 1.3;
        }
        
        .display-3 {
          font-size: 5.5rem;
          font-weight: 300;
          line-height: 1.3;
        }
        
        .lead {
          font-size: 1.125rem;
          font-weight: 400;
        }
        
        .btn {
          display: inline-block;
          font-weight: 500;
          text-align: center;
          vertical-align: middle;
          cursor: pointer;
          user-select: none;
          background-color: transparent;
          border: 1px solid transparent;
          padding: 0.625rem 1.2rem;
          font-size: 1rem;
          line-height: 1.5;
          border-radius: 0.2rem;
          transition: color 0.15s ease-in-out, background-color 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
        }
        
        .btn-primary {
          color: #fff;
          background-color: #0b8c8c;
          border-color: #0b8c8c;
        }
        
        .btn-outline-dark {
          color: #212529;
          background-color: transparent;
          border-color: #212529;
        }
        
        .text-primary {
          color: #0b8c8c;
        }
        
        .bg-light {
          background-color: #f8f9fa;
        }
        
        .text-muted {
          color: #6c757d;
        }
        
        .container {
          width: 100%;
          padding-right: 15px;
          padding-left: 15px;
          margin-right: auto;
          margin-left: auto;
        }
        
        .row {
          display: flex;
          flex-wrap: wrap;
          margin-right: -15px;
          margin-left: -15px;
        }
        
        .col-lg-6 {
          flex: 0 0 50%;
          max-width: 50%;
          padding-right: 15px;
          padding-left: 15px;
        }
        
        .col-lg-5 {
          flex: 0 0 41.66667%;
          max-width: 41.66667%;
          padding-right: 15px;
          padding-left: 15px;
        }
        
        .col-lg-7 {
          flex: 0 0 58.33333%;
          max-width: 58.33333%;
          padding-right: 15px;
          padding-left: 15px;
        }
        
        .col-lg-4 {
          flex: 0 0 33.33333%;
          max-width: 33.33333%;
          padding-right: 15px;
          padding-left: 15px;
        }
        
        .img-fluid {
          max-width: 100%;
          height: auto;
        }
        
        .rounded-lg {
          border-radius: 0.2rem;
        }
        
        .space-1 {
          padding: 3rem 0;
        }
        
        .space-3 {
          padding: 5rem 0;
        }
        
        .space-5 {
          padding: 5rem 0;
        }
        
        .bg-primary-3 {
          background-color: #05555C;
        }
        
        .text-white {
          color: #ffffff;
        }
        
        .card {
          position: relative;
          display: flex;
          flex-direction: column;
          min-width: 0;
          word-wrap: break-word;
          background-color: #fff;
          background-clip: padding-box;
          border: 1px solid #e9ecef;
          border-radius: 0.2rem;
        }
        
        .card-body {
          flex: 1 1 auto;
          min-height: 1px;
          padding: 1.25rem;
        }
        
        .hover-translate-y:hover {
          transform: translateY(-5px);
        }
        
        .hover-shadow:hover {
          box-shadow: 0 4px 12px -1px rgba(0, 0, 0, 0.15);
        }
        
        .navbar {
          position: relative;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 1rem;
        }
        
        .navbar-border {
          border-bottom: 1px solid #e9ecef;
        }
        
        .navbar-light {
          background-color: #fff;
        }
        
        .navbar-brand {
          display: inline-block;
          padding-top: 0.40625rem;
          padding-bottom: 0.40625rem;
          margin-right: 1rem;
          font-size: 1.125rem;
          line-height: inherit;
          white-space: nowrap;
          color: #343a40;
          text-decoration: none;
        }
        
        .fixed-top {
          position: fixed;
          top: 0;
          right: 0;
          left: 0;
          z-index: 1030;
        }
        
        .collapse {
          display: none;
        }
        
        @keyframes spinner-border {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        
        .spinner-border {
          display: inline-block;
          width: 2rem;
          height: 2rem;
          vertical-align: text-bottom;
          border: 0.25em solid currentColor;
          border-right: 0.25em solid transparent;
          border-radius: 50%;
          border-top: 3px solid #0b8c8c;
          border-right: 3px solid transparent;
          animation: spinner-border 0.75s linear infinite;
        }
        
        @media (min-width: 992px) {
          .d-lg-none {
            display: none !important;
          }
          
          .d-lg-flex {
            display: flex !important;
          }
          
          .navbar-expand-lg {
            flex-flow: row nowrap;
            justify-content: flex-start;
          }
          
          .navbar-expand-lg .navbar-nav {
            flex-direction: row;
          }
          
          .navbar-expand-lg .navbar-nav .dropdown-menu {
            position: absolute;
          }
          
          .navbar-expand-lg .navbar-nav .nav-link {
            padding-right: 0.5rem;
            padding-left: 0.5rem;
          }
          
          .navbar-expand-lg > .container {
            flex-wrap: nowrap;
          }
          
          .navbar-expand-lg .navbar-collapse {
            display: flex !important;
            flex-basis: auto;
          }
          
          .navbar-expand-lg .navbar-toggler {
            display: none;
          }
        }
        
        @media (max-width: 991.98px) {
          .d-lg-flex {
            display: none !important;
          }
          
          .d-lg-none {
            display: flex !important;
          }
          
          .navbar-expand-lg .navbar-toggler {
            display: flex;
          }
        }
        
        .card-columns {
          column-count: 3;
          column-gap: 1.25rem;
          orphans: 1;
          widows: 1;
        }
        
        @media (min-width: 992px) {
          .card-columns {
            column-count: 3;
          }
        }
      `}</style>
    </div>
  );
}
