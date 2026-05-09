import { useEffect } from "react";
import AOS from "aos";
import "aos/dist/aos.css";
import HeaderFindeas from "../components/landing/findeas/HeaderFindeas";
import HeroFindeas from "../components/landing/findeas/HeroFindeas";
import FeaturesFindeas from "../components/landing/findeas/FeaturesFindeas";
import ProcessFindeas from "../components/landing/findeas/ProcessFindeas";
import TestimonialsFindeas from "../components/landing/findeas/TestimonialsFindeas";
import FAQFindeas from "../components/landing/findeas/FAQFindeas";
import FooterFindeas from "../components/landing/findeas/FooterFindeas";

export default function LandingFindeas() {
  useEffect(() => {
    // Initialize AOS
    AOS.init({
      duration: 800,
      once: true,
      offset: 100
    });
    
    // Smooth scroll behavior
    document.documentElement.style.scrollBehavior = 'smooth';
    
    // Set page title
    document.title = 'AgenteZap - IA que Transforma WhatsApp em Máquina de Vendas';
    
    // Set meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Transforme seu WhatsApp em máquina de vendas automática. IA que atende, qualifica e vende 24/7. +2.847 empresas já vendendo mais. Setup em 2 minutos.');
    }
    
    // Add structured data for SEO
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
    <div className="min-h-screen bg-white">
      {/* Header */}
      <HeaderFindeas />
      
      {/* Hero Section */}
      <HeroFindeas />
      
      {/* Features Section */}
      <FeaturesFindeas />
      
      {/* Process Section */}
      <ProcessFindeas />
      
      {/* Testimonials Section */}
      <TestimonialsFindeas />
      
      {/* FAQ Section */}
      <FAQFindeas />
      
      {/* Footer */}
      <FooterFindeas />
      
      {/* Floating CTA Button (Mobile) */}
      <a 
        href="#signup"
        className="fixed bottom-6 right-6 z-40 bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-full shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105 flex items-center gap-2 lg:hidden"
      >
        Começar Agora
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5-5m5 5H6" />
        </svg>
      </a>
      
      {/* Schema Markup for SEO */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "AgenteZap",
          "url": "https://agentezap.com",
          "logo": "https://agentezap.com/logo.png",
          "description": "IA que transforma WhatsApp em máquina de vendas automática",
          "sameAs": [
            "https://facebook.com/agentezap",
            "https://twitter.com/agentezap",
            "https://instagram.com/agentezap"
          ],
          "contactPoint": {
            "@type": "ContactPoint",
            "telephone": "+55-11-9999-8888",
            "contactType": "customer service",
            "availableLanguage": "Portuguese"
          }
        })
      }} />
    </div>
  );
}
