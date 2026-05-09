import { Mail, Phone, Shield } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export default function Footer() {
  return (
    <footer className="bg-neutral-900 text-neutral-100 py-16">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-5 gap-8 mb-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <BrandMark className="h-10 w-10 rounded-xl" iconClassName="h-6 w-6" />
              <span className="font-bold text-2xl text-neutral-100">AgenteZap</span>
            </div>
            <p className="text-neutral-400 mb-6 max-w-sm">
              Plataforma tudo-em-um que transforma seu WhatsApp em central de vendas, atendimento e agenda com IA inteligente.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center hover:bg-white/20 transition-colors">
                <Mail className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center hover:bg-white/20 transition-colors">
                <Phone className="w-5 h-5" />
              </a>
            </div>
          </div>
          
          <div>
            <h4 className="font-semibold mb-6 text-neutral-100">Produto</h4>
            <ul className="space-y-3 text-sm text-neutral-400">
              <li><a href="#modulos" className="hover:text-neutral-100 transition-colors">Módulos</a></li>
              <li><a href="#publico" className="hover:text-neutral-100 transition-colors">Para quem é</a></li>
              <li><a href="#funciona" className="hover:text-neutral-100 transition-colors">Como funciona</a></li>
              <li><a href="#precos" className="hover:text-neutral-100 transition-colors">Planos</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-6 text-neutral-100">Empresa</h4>
            <ul className="space-y-3 text-sm text-neutral-400">
              <li><a href="#" className="hover:text-neutral-100 transition-colors">Sobre nós</a></li>
              <li><a href="#" className="hover:text-neutral-100 transition-colors">Contato</a></li>
              <li><a href="#" className="hover:text-neutral-100 transition-colors">Blog</a></li>
              <li><a href="#" className="hover:text-neutral-100 transition-colors">Carreiras</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-6 text-neutral-100">Legal</h4>
            <ul className="space-y-3 text-sm text-neutral-400">
              <li><a href="#" className="hover:text-neutral-100 transition-colors">Privacidade</a></li>
              <li><a href="#" className="hover:text-neutral-100 transition-colors">Termos</a></li>
              <li><a href="#" className="hover:text-neutral-100 transition-colors">LGPD</a></li>
              <li><a href="#" className="hover:text-neutral-100 transition-colors">Cookies</a></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-neutral-800 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-neutral-500">
            <p>© 2024 AgenteZap • Todos os direitos reservados</p>
            <div className="flex items-center gap-4">
              <span>Feito com ❤️ no Brasil</span>
              <div className="flex items-center gap-1">
                <Shield className="w-4 h-4" />
                <span>Segurança enterprise</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
