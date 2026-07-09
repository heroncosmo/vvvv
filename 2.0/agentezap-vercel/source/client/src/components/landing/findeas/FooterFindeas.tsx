import { useState } from "react";
import { 
  MessageCircle, 
  Mail, 
  Phone, 
  MapPin, 
  Facebook, 
  Twitter, 
  Instagram, 
  Linkedin,
  Youtube,
  ArrowRight,
  Send,
  Shield,
  CheckCircle2,
  Star,
  Zap
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export default function FooterFindeas() {
  const [email, setEmail] = useState("");
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle newsletter subscription
    console.log("Newsletter subscription:", email);
    setIsSubscribed(true);
    setEmail("");
    setTimeout(() => setIsSubscribed(false), 5000);
  };

  const footerSections = [
    {
      title: "Produto",
      items: [
        { label: "Recursos", href: "#features" },
        { label: "Planos e Preços", href: "#pricing" },
        { label: "Demonstração", href: "#demo" },
        { label: "Integrações", href: "#integrations" }
      ]
    },
    {
      title: "Empresa",
      items: [
        { label: "Sobre Nós", href: "#about" },
        { label: "Carreiras", href: "#careers" },
        { label: "Blog", href: "#blog" },
        { label: "Imprensa", href: "#press" }
      ]
    },
    {
      title: "Suporte",
      items: [
        { label: "Central de Ajuda", href: "#help" },
        { label: "Documentação", href: "#docs" },
        { label: "API", href: "#api" },
        { label: "Status", href: "#status" }
      ]
    },
    {
      title: "Legal",
      items: [
        { label: "Termos de Uso", href: "#terms" },
        { label: "Privacidade", href: "#privacy" },
        { label: "LGPD", href: "#lgpd" },
        { label: "Cookies", href: "#cookies" }
      ]
    }
  ];

  const socialLinks = [
    { icon: Facebook, href: "#", label: "Facebook" },
    { icon: Twitter, href: "#", label: "Twitter" },
    { icon: Instagram, href: "#", label: "Instagram" },
    { icon: Linkedin, href: "#", label: "LinkedIn" },
    { icon: Youtube, href: "#", label: "YouTube" }
  ];

  const contactInfo = [
    { icon: Mail, content: "contato@agentezap.com", href: "mailto:contato@agentezap.com" },
    { icon: Phone, content: "+55 11 9999-8888", href: "tel:+551199998888" },
    { icon: MapPin, content: "São Paulo, SP - Brasil", href: "#" }
  ];

  return (
    <footer className="bg-neutral-900 text-white">
      {/* Newsletter Section */}
      <div className="border-b border-neutral-800">
        <div className="container mx-auto px-6 py-16">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Mail className="w-10 h-10 text-primary" />
              </div>
            </div>
            
            <h3 className="text-3xl lg:text-4xl font-bold mb-4">
              Receba as melhores dicas de{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">automação</span>
            </h3>
            <p className="text-xl text-neutral-300 mb-8 max-w-2xl mx-auto">
              Exclusivo para quem quer vender mais enquanto dorme. Conteúdo prático, cases reais e estratégias que funcionam.
            </p>
            
            <form onSubmit={handleSubscribe} className="max-w-md mx-auto">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Seu melhor e-mail"
                  required
                  className="flex-1 px-6 py-4 rounded-2xl bg-white/10 border border-neutral-700 text-white placeholder-neutral-400 focus:border-primary focus:outline-none transition-colors"
                />
                <button
                  type="submit"
                  className="bg-primary hover:bg-primary/90 text-white px-8 py-4 rounded-2xl font-bold shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 flex items-center justify-center gap-2"
                >
                  {isSubscribed ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Inscrito!
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Quero Receber
                    </>
                  )}
                </button>
              </div>
            </form>
            
            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center gap-6 mt-6 text-neutral-400 text-sm">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>Spam 0%</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Cancelamento fácil</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4" />
                <span>Conteúdo premium</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
          {/* Logo & Description */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-6">
              <BrandMark className="h-10 w-10 rounded-xl shadow-sm" iconClassName="h-5 w-5" />
              <span className="font-bold text-xl text-white">AgenteZap</span>
            </div>
            
            <p className="text-neutral-300 mb-6 leading-relaxed">
              Transforme seu WhatsApp em máquina de vendas automática com IA que funciona 24/7. 
              +2.847 empresas já vendendo mais.
            </p>
            
            {/* Social Links */}
            <div className="flex gap-3">
              {socialLinks.map((social, index) => {
                const Icon = social.icon;
                return (
                  <a
                    key={index}
                    href={social.href}
                    aria-label={social.label}
                    className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center hover:bg-primary transition-colors group"
                  >
                    <Icon className="w-5 h-5 text-neutral-300 group-hover:text-white transition-colors" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Footer Sections */}
          {footerSections.map((section, index) => (
            <div key={index}>
              <h4 className="font-bold text-white mb-6">{section.title}</h4>
              <ul className="space-y-3">
                {section.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <a 
                      href={item.href}
                      className="text-neutral-300 hover:text-white transition-colors flex items-center gap-2 group"
                    >
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Contact Info */}
        <div className="border-t border-neutral-800 pt-12 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {contactInfo.map((contact, index) => {
              const Icon = contact.icon;
              return (
                <a
                  key={index}
                  href={contact.href}
                  className="flex items-center gap-4 text-neutral-300 hover:text-white transition-colors group"
                >
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-lg">{contact.content}</span>
                </a>
              );
            })}
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-neutral-800 pt-8">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
            <div className="text-neutral-400 text-sm">
              © 2024 AgenteZap. Todos os direitos reservados. Feito com ❤️ no Brasil.
            </div>
            
            <div className="flex flex-wrap items-center gap-6 text-neutral-400 text-sm">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-success" />
                <span>100% Seguro</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-warning" />
                <span>API Brasileira</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-info" />
                <span>LGPD Compliant</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
