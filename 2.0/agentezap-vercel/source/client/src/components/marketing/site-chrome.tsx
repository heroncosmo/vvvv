import { Menu, MessageCircle, X } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { BrandMark } from "@/components/brand-mark";

export const SITE_WHATSAPP_NUMBER = "5517981679818";
export const SITE_WHATSAPP_URL = `https://wa.me/${SITE_WHATSAPP_NUMBER}`;

type NavItem = {
  label: string;
  href: string;
};

const navItems: NavItem[] = [
  { label: "Recursos", href: "/#recursos" },
  { label: "Afiliados", href: "/indicacoes" },
  { label: "Revenda White Label", href: "/revenda-white-label" },
  { label: "FAQ", href: "/#faq" },
];

type MarketingSiteHeaderProps = {
  currentPath?: string;
};

function isCurrent(currentPath: string | undefined, href: string) {
  if (!currentPath) {
    return false;
  }

  if (href === "/indicacoes" || href === "/revenda-white-label") {
    return currentPath === href;
  }

  return currentPath === "/" && href.startsWith("/#");
}

export function MarketingSiteHeader({ currentPath }: MarketingSiteHeaderProps) {
  const [, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/70 bg-white/92 backdrop-blur-xl">
      <div className="mx-auto flex h-18 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="/" className="flex items-center gap-3">
          <BrandMark className="h-11 w-11" iconClassName="h-6 w-6" />
          <div>
            <p className="text-lg font-semibold tracking-tight text-stone-900">AgenteZap</p>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">IA no WhatsApp</p>
          </div>
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`text-sm font-medium transition-colors ${
                isCurrent(currentPath, item.href) ? "text-teal-700" : "text-stone-600 hover:text-teal-700"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <button
            onClick={() => setLocation("/login")}
            className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
          >
            Entrar
          </button>
          <a
            href={SITE_WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            <MessageCircle className="h-4 w-4" />
            Falar no WhatsApp
          </a>
        </div>

        <button
          type="button"
          aria-label="Abrir menu"
          onClick={() => setMenuOpen((value) => !value)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-stone-200 text-stone-700 md:hidden"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-stone-200 bg-white px-4 py-4 md:hidden">
          <div className="space-y-2">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-2xl px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            <button
              onClick={() => {
                setMenuOpen(false);
                setLocation("/login");
              }}
              className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-700"
            >
              Entrar
            </button>
            <a
              href={SITE_WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white"
            >
              <MessageCircle className="h-4 w-4" />
              Falar no WhatsApp
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

export function MarketingSiteFooter() {
  return (
    <footer className="border-t border-stone-200 bg-stone-950 text-stone-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <BrandMark className="h-11 w-11" iconClassName="h-6 w-6" />
            <div>
              <p className="text-lg font-semibold text-white">AgenteZap</p>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">IA no WhatsApp</p>
            </div>
          </div>
          <p className="max-w-md text-sm leading-6 text-stone-400">
            Plataforma de inteligencia artificial para WhatsApp com atendimento, vendas, campanhas,
            CRM e operacao white label.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">Páginas</p>
          <div className="mt-4 space-y-3 text-sm">
            <a href="/" className="block transition hover:text-white">
              Home
            </a>
            <a href="/indicacoes" className="block transition hover:text-white">
              Afiliados
            </a>
            <a href="/revenda-white-label" className="block transition hover:text-white">
              Revenda White Label
            </a>
            <a href="/termos-de-uso" className="block transition hover:text-white">
              Termos de uso
            </a>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">Contato</p>
          <div className="mt-4 space-y-3 text-sm">
            <a href={SITE_WHATSAPP_URL} target="_blank" rel="noreferrer" className="block transition hover:text-white">
              WhatsApp comercial
            </a>
            <a href="/login" className="block transition hover:text-white">
              Entrar na plataforma
            </a>
            <a href="/cadastro" className="block transition hover:text-white">
              Criar conta
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
