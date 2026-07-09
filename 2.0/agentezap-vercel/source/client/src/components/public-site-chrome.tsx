import { useEffect } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useLocation } from "wouter";
import { Menu, MessageSquare, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

type PublicNavItem = {
  label: string;
  href: string;
};

type PublicSiteHeaderProps = {
  scrolled: boolean;
  menuOpen: boolean;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  navItems?: PublicNavItem[];
};

type PublicSiteLayoutProps = {
  children: ReactNode;
  scrolled: boolean;
  menuOpen: boolean;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  navItems?: PublicNavItem[];
};

type PublicSiteFooterProps = {
  productLinks?: PublicNavItem[];
};

type PublicPageSetupOptions = {
  title: string;
  description: string;
  canonicalPath: string;
  keywords?: string;
  structuredData?: Record<string, unknown>;
};

const defaultNavItems: PublicNavItem[] = [
  { label: "Recursos", href: "#recursos" },
  { label: "Como Funciona", href: "#como-funciona" },
  { label: "Para Quem", href: "#para-quem" },
  { label: "Duvidas", href: "#faq" },
];

function navigateToHref(href: string, setLocation: (href: string) => void) {
  if (href.startsWith("#")) {
    const targetId = href.slice(1);
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    window.location.assign(`/${href}`);
    return;
  }

  setLocation(href);
}

export function usePublicPageSetup({
  title,
  description,
  canonicalPath,
  keywords,
  structuredData,
}: PublicPageSetupOptions) {
  useEffect(() => {
    const prevTitle = document.title;
    const prevBodyOverflowY = document.body.style.overflowY;
    const prevHtmlOverflowY = document.documentElement.style.overflowY;
    const prevBodyPosition = document.body.style.position;
    const prevBodyTouchAction = document.body.style.touchAction;
    const prevHtmlTouchAction = document.documentElement.style.touchAction;
    const prevBodyOverscroll = document.body.style.overscrollBehaviorY;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehaviorY;
    const prevBodyHeight = document.body.style.height;
    const prevHtmlHeight = document.documentElement.style.height;

    document.title = title;
    document.body.style.overflowY = "auto";
    document.documentElement.style.overflowY = "auto";
    document.body.style.position = "static";
    document.body.style.touchAction = "pan-y";
    document.documentElement.style.touchAction = "pan-y";
    document.body.style.overscrollBehaviorY = "auto";
    document.documentElement.style.overscrollBehaviorY = "auto";
    document.body.style.height = "auto";
    document.documentElement.style.height = "auto";

    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.setAttribute("name", "description");
      document.head.appendChild(metaDescription);
    }
    const prevDescription = metaDescription.getAttribute("content") || "";
    metaDescription.setAttribute("content", description);

    let metaKeywords = document.querySelector('meta[name="keywords"]');
    const prevKeywords = metaKeywords?.getAttribute("content") || "";
    if (keywords) {
      if (!metaKeywords) {
        metaKeywords = document.createElement("meta");
        metaKeywords.setAttribute("name", "keywords");
        document.head.appendChild(metaKeywords);
      }
      metaKeywords.setAttribute("content", keywords);
    }

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    const prevCanonical = canonical.href;
    canonical.href = `https://agentezap.online${canonicalPath}`;

    let scriptEl: HTMLScriptElement | null = null;
    if (structuredData) {
      scriptEl = document.createElement("script");
      scriptEl.type = "application/ld+json";
      scriptEl.textContent = JSON.stringify(structuredData);
      document.head.appendChild(scriptEl);
    }

    return () => {
      document.title = prevTitle;
      document.body.style.overflowY = prevBodyOverflowY;
      document.documentElement.style.overflowY = prevHtmlOverflowY;
      document.body.style.position = prevBodyPosition;
      document.body.style.touchAction = prevBodyTouchAction;
      document.documentElement.style.touchAction = prevHtmlTouchAction;
      document.body.style.overscrollBehaviorY = prevBodyOverscroll;
      document.documentElement.style.overscrollBehaviorY = prevHtmlOverscroll;
      document.body.style.height = prevBodyHeight;
      document.documentElement.style.height = prevHtmlHeight;
      metaDescription?.setAttribute("content", prevDescription);
      if (metaKeywords) {
        metaKeywords.setAttribute("content", prevKeywords);
      }
      canonical.href = prevCanonical;
      scriptEl?.remove();
    };
  }, [canonicalPath, description, keywords, structuredData, title]);
}

export function PublicSiteHeader({
  scrolled,
  menuOpen,
  setMenuOpen,
  navItems = defaultNavItems,
}: PublicSiteHeaderProps) {
  const [, setLocation] = useLocation();

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-white/95 shadow-sm backdrop-blur-sm" : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between sm:h-20">
          <button
            type="button"
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-left"
            aria-label="Ir para a pagina inicial"
          >
            <BrandMark className="h-9 w-9 rounded-xl sm:h-10 sm:w-10" iconClassName="h-5 w-5 sm:h-6 sm:w-6" />
            <span className="text-xl font-bold text-gray-900 sm:text-2xl">AgenteZap</span>
          </button>

          <nav className="hidden items-center gap-8 lg:flex">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => navigateToHref(item.href, setLocation)}
                className="font-medium text-gray-600 transition-colors hover:text-teal-600"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="rounded-xl border border-gray-200 px-5 py-2.5 font-semibold text-gray-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-600"
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setLocation("/cadastro")}
              className="rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-5 py-2.5 font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:from-teal-600 hover:to-teal-700 hover:shadow-teal-500/40"
            >
              Criar Conta Gratis
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="p-2 text-gray-700 lg:hidden"
            aria-label="Abrir menu"
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="animate-in slide-in-from-top border-t border-gray-100 bg-white shadow-lg duration-200 lg:hidden">
          <div className="space-y-3 px-4 py-4">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigateToHref(item.href, setLocation);
                }}
                className="block w-full py-2 text-left font-medium text-gray-700"
              >
                {item.label}
              </button>
            ))}
            <div className="flex flex-col gap-2 pt-3">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setLocation("/login");
                }}
                className="w-full rounded-xl border border-gray-200 py-3 font-semibold text-gray-700 hover:bg-gray-50"
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setLocation("/cadastro");
                }}
                className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 py-3 font-semibold text-white"
              >
                Criar Conta Gratis
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicSiteFooter({ productLinks = defaultNavItems }: PublicSiteFooterProps) {
  const [, setLocation] = useLocation();

  return (
    <footer className="bg-gray-900 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 grid gap-8 md:grid-cols-5">
          <div className="md:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <BrandMark className="h-10 w-10 rounded-xl" iconClassName="h-6 w-6" />
              <span className="text-xl font-bold text-white">AgenteZap</span>
            </div>
            <p className="max-w-sm text-gray-400">
              Plataforma de IA para WhatsApp que automatiza vendas, atendimento, agendamentos e CRM para seu negocio.
            </p>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-white">Produto</h4>
            <div className="space-y-2">
              {productLinks.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigateToHref(item.href, setLocation)}
                  className="block text-gray-400 transition-colors hover:text-white"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-white">Parceiros</h4>
            <div className="space-y-2">
              <button type="button" onClick={() => setLocation("/revenda")} className="block text-gray-400 transition-colors hover:text-white">
                Revenda
              </button>
              <button type="button" onClick={() => setLocation("/indicacoes")} className="block text-gray-400 transition-colors hover:text-white">
                Afiliados
              </button>
              <button type="button" onClick={() => setLocation("/white-label")} className="block text-gray-400 transition-colors hover:text-white">
                White Label
              </button>
            </div>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-white">Suporte</h4>
            <div className="space-y-2">
              <button type="button" onClick={() => setLocation("/ajuda")} className="block text-gray-400 transition-colors hover:text-white">
                Central de Ajuda
              </button>
              <a href="https://wa.me/5517981679818" target="_blank" rel="noopener noreferrer" className="block text-gray-400 transition-colors hover:text-white">
                WhatsApp
              </a>
              <button type="button" onClick={() => setLocation("/termos-de-uso")} className="block text-gray-400 transition-colors hover:text-white">
                Termos de Uso
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-800 pt-8 md:flex-row">
          <p className="text-sm text-gray-500">© {new Date().getFullYear()} AgenteZap. Todos os direitos reservados.</p>
          <a
            href="https://wa.me/5517981679818"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 transition-colors hover:text-white"
            aria-label="Falar no WhatsApp"
          >
            <MessageSquare className="h-5 w-5" />
          </a>
        </div>
      </div>
    </footer>
  );
}

export function PublicSiteMobileBar() {
  const [, setLocation] = useLocation();

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-100 bg-white/95 p-4 backdrop-blur-sm md:hidden">
        <div className="flex gap-3">
          <button type="button" onClick={() => setLocation("/login")} className="flex-1 rounded-xl border border-gray-200 py-3 font-semibold text-gray-700">
            Entrar
          </button>
          <button type="button" onClick={() => setLocation("/cadastro")} className="flex-1 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 py-3 font-semibold text-white">
            Criar Conta Gratis
          </button>
        </div>
      </div>
      <div className="h-20 md:hidden" />
    </>
  );
}

export function PublicSiteLayout({
  children,
  scrolled,
  menuOpen,
  setMenuOpen,
  navItems,
}: PublicSiteLayoutProps) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white touch-pan-y">
      <PublicSiteHeader scrolled={scrolled} menuOpen={menuOpen} setMenuOpen={setMenuOpen} navItems={navItems} />
      {children}
      <PublicSiteFooter productLinks={navItems} />
      <a
        href="https://wa.me/5517981679818?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20o%20AgenteZap"
        target="_blank"
        rel="noopener noreferrer"
        className="group fixed bottom-24 right-4 z-40 flex items-center gap-3 md:bottom-6 md:right-6"
      >
        <div className="hidden rounded-xl bg-white px-4 py-2 shadow-lg opacity-0 transition-opacity group-hover:opacity-100 sm:block">
          <p className="text-sm font-medium text-gray-900">Fale com a gente</p>
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500 shadow-lg shadow-green-500/30 transition-transform hover:scale-110">
          <MessageSquare className="h-7 w-7 text-white" />
        </div>
      </a>
      <PublicSiteMobileBar />
    </div>
  );
}
