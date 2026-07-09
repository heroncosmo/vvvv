import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Bot, ArrowRight, Menu, X } from "lucide-react";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setIsMobileMenuOpen(false);
    }
  };

  const navItems = [
    { href: "como-funciona", text: "Como funciona" },
    { href: "modulos", text: "Módulos" },
    { href: "faq", text: "FAQ" }
  ];

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isScrolled 
        ? 'bg-[#020617]/95 backdrop-blur-md shadow-lg border-b border-white/10' 
        : 'bg-transparent'
    }`}>
      <div className="container mx-auto px-6 h-16 lg:h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className={`w-8 h-8 bg-gradient-to-br from-[#22C55E] to-[#16A34A] rounded-xl flex items-center justify-center shadow-sm transition-all duration-300 group-hover:scale-110 ${
            isScrolled ? 'shadow-md' : 'shadow-lg'
          }`}>
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className={`font-bold text-lg transition-colors duration-300 ${
            isScrolled ? 'text-white' : 'text-white'
          }`}>AgenteZap</span>
        </Link>
        
        <nav className="hidden lg:flex items-center gap-8">
          {navItems.map((item) => (
            <button
              key={item.href}
              onClick={() => scrollToSection(item.href)}
              className={`text-sm font-medium transition-colors duration-200 hover:scale-105 ${
                isScrolled 
                  ? 'text-white/80 hover:text-white' 
                  : 'text-white/90 hover:text-white'
              }`}
            >
              {item.text}
            </button>
          ))}
        </nav>
        
        <div className="flex items-center gap-4">
          <Link href="/login" className={`hidden lg:block text-sm font-medium transition-colors duration-200 ${
            isScrolled 
              ? 'text-white/80 hover:text-white' 
              : 'text-white/90 hover:text-white'
          }`}>
            Entrar
          </Link>
          
          <Link href="/signup">
            <Button className={`hidden lg:flex px-6 py-2.5 rounded-full font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 ${
              'bg-[#22C55E] hover:bg-[#16A34A] text-white'
            }`}>
              Criar minha conta grátis
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`lg:hidden p-2 rounded-lg transition-colors duration-200 ${
              isScrolled 
                ? 'text-white hover:bg-white/10' 
                : 'text-white hover:bg-white/10'
            }`}
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="lg:hidden absolute top-full left-0 right-0 bg-[#020617]/98 backdrop-blur-md border-b border-white/10">
          <nav className="container mx-auto px-6 py-4 flex flex-col gap-4">
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => scrollToSection(item.href)}
                className="text-left text-white/90 hover:text-white font-medium py-2 transition-colors"
              >
                {item.text}
              </button>
            ))}
            <Link href="/login" className="text-left text-white/90 hover:text-white font-medium py-2">
              Entrar
            </Link>
            <Link href="/signup">
              <Button className="w-full bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold py-3 rounded-full">
                Criar minha conta grátis
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
