import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X, ChevronDown, Layout, FileText, Users, HelpCircle, Book, Briefcase, Mail, Lock } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export default function HeaderFindeas() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDemosOpen, setIsDemosOpen] = useState(false);
  const [isPagesOpen, setIsPagesOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <header className="fixed top-0 z-50 w-full border-b border-neutral-200/50 bg-white/90 backdrop-blur-xl shadow-sm">
      <nav className="container mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 order-1 flex-grow-1 lg:flex-grow-0">
            <BrandMark className="h-8 w-8 rounded-xl shadow-sm" iconClassName="h-4 w-4" />
            <span className="font-bold text-lg text-neutral-900">AgenteZap</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-8 order-3 mx-auto">
            <a href="#funcionalidades" className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors">
              Visão Geral
            </a>
            
            {/* Demos Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsDemosOpen(!isDemosOpen)}
                className="flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                Demonstrações
                <ChevronDown className={`w-4 h-4 transition-transform ${isDemosOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isDemosOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-neutral-200 py-2 z-50">
                  <a href="#landing-1" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                    <Layout className="w-4 h-4" />
                    Landing 1
                  </a>
                  <a href="#landing-2" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                    <Layout className="w-4 h-4" />
                    Landing 2
                  </a>
                  <a href="#landing-3" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                    <Layout className="w-4 h-4" />
                    Landing 3
                  </a>
                  <a href="#landing-4" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                    <Layout className="w-4 h-4" />
                    Landing 4
                  </a>
                  <a href="#landing-5" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                    <Layout className="w-4 h-4" />
                    Landing 5
                  </a>
                  <a href="#landing-6" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                    <Layout className="w-4 h-4" />
                    Landing 6
                  </a>
                </div>
              )}
            </div>

            {/* Pages Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsPagesOpen(!isPagesOpen)}
                className="flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                Páginas
                <ChevronDown className={`w-4 h-4 transition-transform ${isPagesOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isPagesOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-neutral-200 py-2 z-50">
                  <div className="px-4 py-2">
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Autenticação</p>
                    <a href="#login-1" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                      <Users className="w-4 h-4" />
                      Login 1
                    </a>
                    <a href="#login-2" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                      <Users className="w-4 h-4" />
                      Login 2
                    </a>
                    <a href="#register-1" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                      <Users className="w-4 h-4" />
                      Registro 1
                    </a>
                    <a href="#register-2" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                      <Users className="w-4 h-4" />
                      Registro 2
                    </a>
                    <a href="#forgot-1" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                      <Lock className="w-4 h-4" />
                      Esqueci 1
                    </a>
                  </div>
                  
                  <div className="border-t border-neutral-200 px-4 py-2">
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Blog</p>
                    <a href="#blog-list-1" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                      <FileText className="w-4 h-4" />
                      Blog Lista 1
                    </a>
                    <a href="#blog-list-2" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                      <FileText className="w-4 h-4" />
                      Blog Lista 2
                    </a>
                    <a href="#blog-detail-1" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                      <FileText className="w-4 h-4" />
                      Blog Detalhe 1
                    </a>
                  </div>
                  
                  <div className="border-t border-neutral-200 px-4 py-2">
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Carreira</p>
                    <a href="#career-1" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                      <Briefcase className="w-4 h-4" />
                      Carreira 1
                    </a>
                    <a href="#career-2" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                      <Briefcase className="w-4 h-4" />
                      Carreira 2
                    </a>
                  </div>
                  
                  <div className="border-t border-neutral-200 px-4 py-2">
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Contato</p>
                    <a href="#contact-1" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                      <Mail className="w-4 h-4" />
                      Contato 1
                    </a>
                    <a href="#contact-2" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                      <Mail className="w-4 h-4" />
                      Contato 2
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Docs Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsDocsOpen(!isDocsOpen)}
                className="flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                Docs
                <ChevronDown className={`w-4 h-4 transition-transform ${isDocsOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isDocsOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-neutral-200 py-2 z-50">
                  <a href="#docs" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                    <Book className="w-4 h-4" />
                    Documentação
                  </a>
                  <a href="#changelog" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                    <FileText className="w-4 h-4" />
                    Changelog
                  </a>
                  <a href="#support" className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                    <HelpCircle className="w-4 h-4" />
                    Suporte
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* CTA Button - Desktop */}
          <div className="hidden md:flex items-center order-2 mr-3 lg:mr-0">
            <Link href="/signup">
              <Button className="bg-primary hover:bg-primary-600 text-white px-6 py-2.5 rounded-full font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 flex items-center gap-2">
                Começar Agora
                <ChevronDown className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button 
            onClick={toggleMobileMenu}
            className="lg:hidden flex items-center gap-2 order-3 text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden absolute top-full left-0 w-full bg-white border-b border-neutral-200 shadow-lg z-50">
            <div className="container mx-auto px-6 py-4 space-y-4">
              <a href="#funcionalidades" className="block text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors">
                Visão Geral
              </a>
              
              <div className="space-y-2">
                <p className="text-sm font-semibold text-neutral-900">Demonstrações</p>
                <a href="#landing-1" className="block pl-4 text-sm text-neutral-600 hover:text-neutral-900">Landing 1</a>
                <a href="#landing-2" className="block pl-4 text-sm text-neutral-600 hover:text-neutral-900">Landing 2</a>
                <a href="#landing-3" className="block pl-4 text-sm text-neutral-600 hover:text-neutral-900">Landing 3</a>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm font-semibold text-neutral-900">Páginas</p>
                <a href="#login" className="block pl-4 text-sm text-neutral-600 hover:text-neutral-900">Login</a>
                <a href="#register" className="block pl-4 text-sm text-neutral-600 hover:text-neutral-900">Registro</a>
                <a href="#contact" className="block pl-4 text-sm text-neutral-600 hover:text-neutral-900">Contato</a>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm font-semibold text-neutral-900">Docs</p>
                <a href="#docs" className="block pl-4 text-sm text-neutral-600 hover:text-neutral-900">Documentação</a>
                <a href="#support" className="block pl-4 text-sm text-neutral-600 hover:text-neutral-900">Suporte</a>
              </div>
              
              <div className="pt-4 border-t border-neutral-200">
                <Link href="/signup">
                  <Button className="w-full bg-primary hover:bg-primary-600 text-white px-6 py-3 rounded-full font-semibold shadow-lg hover:shadow-xl transition-all duration-300">
                    Começar Agora
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
