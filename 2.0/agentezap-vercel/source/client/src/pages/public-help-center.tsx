/**
 * Central de Ajuda Pública — AgenteZap
 * Versão pública (sem autenticação) com SEO completo
 * Compartilha o mesmo conteúdo da versão interna
 */
import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import {
  Search,
  ChevronRight,
  ChevronLeft,
  Bot,
  HelpCircle,
  X,
  Lightbulb,
  AlertCircle,
  Info,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

// ─── Import das categorias do help-center data ───────────────────────────────
// Reutilizamos o mesmo HELP_CATEGORIES para garantir sincronização
import { HELP_CATEGORIES } from "./help-center-data";
import type { Article, ArticleSection, VisualStep, Category } from "./help-center-data";
import { CourseVideoPanel } from "@/components/course-video-panel";
import { COURSE_VIDEOS, getCourseVideosForArticle } from "@/lib/youtube-course";

// ─── Geração de slug a partir do título ──────────────────────────────────────
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function formatArticleHtml(content: string) {
  return content
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noreferrer" class="font-medium text-teal-700 underline underline-offset-4">$1</a>',
    );
}

// ─── SEO Head Manager ─────────────────────────────────────────────────────────
function useDocumentHead(title: string, description: string, slug?: string) {
  useEffect(() => {
    const prevTitle = document.title;
    const canonicalUrl = `https://agentezap.online/ajuda${slug ? `/${slug}` : ""}`;

    document.title = title;

    // Meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      (metaDesc as HTMLMetaElement).name = "description";
      document.head.appendChild(metaDesc);
    }
    const prevDesc = (metaDesc as HTMLMetaElement).content;
    (metaDesc as HTMLMetaElement).content = description;

    // Open Graph
    const setOG = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`);
      if (!el) {
        el = document.createElement("meta");
        (el as HTMLMetaElement).setAttribute("property", property);
        document.head.appendChild(el);
      }
      (el as HTMLMetaElement).content = content;
    };
    setOG("og:title", title);
    setOG("og:description", description);
    setOG("og:type", slug ? "article" : "website");
    setOG("og:url", canonicalUrl);
    setOG("og:image", "https://agentezap.online/og-image.png");
    setOG("og:site_name", "AgenteZap");

    // Twitter Card
    const setTwitter = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        (el as HTMLMetaElement).name = name;
        document.head.appendChild(el);
      }
      (el as HTMLMetaElement).content = content;
    };
    setTwitter("twitter:card", "summary_large_image");
    setTwitter("twitter:title", title);
    setTwitter("twitter:description", description);

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      (canonical as HTMLLinkElement).rel = "canonical";
      document.head.appendChild(canonical);
    }
    const prevCanonical = (canonical as HTMLLinkElement).href;
    (canonical as HTMLLinkElement).href = canonicalUrl;

    return () => {
      document.title = prevTitle;
      (metaDesc as HTMLMetaElement).content = prevDesc;
      (canonical as HTMLLinkElement).href = prevCanonical;
    };
  }, [title, description, slug]);
}

// ─── JSON-LD Schema.org para artigos ─────────────────────────────────────────
function ArticleJsonLD({ article, category }: { article: Article; category: Category }) {
  const slug = generateSlug(article.title);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.title,
    "description": article.description,
    "url": `https://agentezap.online/ajuda/${slug}`,
    "author": {
      "@type": "Organization",
      "name": "AgenteZap",
      "url": "https://agentezap.online"
    },
    "publisher": {
      "@type": "Organization",
      "name": "AgenteZap",
      "logo": {
        "@type": "ImageObject",
        "url": "https://agentezap.online/favicon.ico"
      }
    },
    "articleSection": category.title,
    "keywords": article.tags.join(", ")
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ─── Header Público ───────────────────────────────────────────────────────────
function PublicHeader() {
  const [, setLocation] = useLocation();
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <button
          onClick={() => setLocation("/ajuda")}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-teal-500 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-gray-900 leading-tight">AgenteZap</span>
            <span className="text-xs text-gray-500 leading-tight">Central de Ajuda</span>
          </div>
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/login")}
            className="hidden sm:block text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Entrar
          </button>
          <button
            onClick={() => setLocation("/cadastro")}
            className="text-sm px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-medium transition-colors"
          >
            Começar Grátis
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── Footer Público ────────────────────────────────────────────────────────────
function PublicFooter() {
  const [, setLocation] = useLocation();
  return (
    <footer className="bg-gray-900 text-gray-400 py-10 px-4 mt-16">
      <div className="max-w-6xl mx-auto">
        <div className="grid sm:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-teal-500 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <span className="text-white font-bold">AgenteZap</span>
            </div>
            <p className="text-sm leading-relaxed">
              Plataforma de IA para WhatsApp que automatiza vendas, atendimento, agendamentos e CRM.
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Central de Ajuda</h4>
            <div className="space-y-2 text-sm">
              <button onClick={() => setLocation("/ajuda")} className="block hover:text-white transition-colors">
                Todos os artigos
              </button>
              {HELP_CATEGORIES.slice(0, 4).map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setLocation(`/ajuda/categoria/${cat.id}`)}
                  className="block hover:text-white transition-colors text-left"
                >
                  {cat.title}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Suporte</h4>
            <div className="space-y-2 text-sm">
              <a
                href="https://wa.me/5517991648288"
                target="_blank"
                rel="noopener noreferrer"
                className="block hover:text-white transition-colors"
              >
                WhatsApp
              </a>
              <button onClick={() => setLocation("/cadastro")} className="block hover:text-white transition-colors text-left">
                Criar conta
              </button>
              <button onClick={() => setLocation("/termos-de-uso")} className="block hover:text-white transition-colors text-left">
                Termos de Uso
              </button>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-6 text-sm text-gray-600">
          © {new Date().getFullYear()} AgenteZap. Todos os direitos reservados. Feito com ❤️ no Brasil.
        </div>
      </div>
    </footer>
  );
}

// ─── Renderizador de conteúdo de artigo ──────────────────────────────────────
function ArticleContent({ sections }: { sections: ArticleSection[] }) {
  return (
    <div className="space-y-6">
      {sections.map((section, idx) => {
        if (section.type === "heading") {
          return (
            <h2 key={idx} className="text-xl font-bold text-gray-900 mt-8 mb-2">
              {section.content as string}
            </h2>
          );
        }

        if (section.type === "text") {
          return (
            <p
              key={idx}
              className="text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: formatArticleHtml(section.content as string),
              }}
            />
          );
        }

        if (section.type === "steps") {
          return (
            <div key={idx} className="space-y-3">
              {section.heading && (
                <h3 className="font-semibold text-gray-900">{section.heading}</h3>
              )}
              <ol className="space-y-3">
                {(section.content as string[]).map((step, i) => (
                  <li key={i} className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span
                      className="text-gray-700 text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: formatArticleHtml(step),
                      }}
                    />
                  </li>
                ))}
              </ol>
            </div>
          );
        }

        if (section.type === "visual-steps") {
          const steps = section.content as VisualStep[];
          return (
            <div key={idx} className="space-y-4">
              {section.heading && (
                <h3 className="font-semibold text-gray-900">{section.heading}</h3>
              )}
              {steps.map((vstep, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-500 text-white text-sm font-bold flex items-center justify-center">
                    {vstep.step}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p
                      className="font-medium text-gray-900 text-sm"
                      dangerouslySetInnerHTML={{
                        __html: formatArticleHtml(vstep.action),
                      }}
                    />
                    <p
                      className="text-gray-600 text-sm"
                      dangerouslySetInnerHTML={{
                        __html: formatArticleHtml(vstep.explain),
                      }}
                    />
                    {vstep.result && (
                      <p className="text-teal-700 text-sm font-medium">✓ {vstep.result}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        }

        if (section.type === "list") {
          return (
            <div key={idx} className="space-y-2">
              {section.heading && (
                <h3 className="font-semibold text-gray-900">{section.heading}</h3>
              )}
              <ul className="space-y-1.5">
                {(section.content as string[]).map((item, i) => (
                  <li key={i} className="flex gap-2 items-start">
                    <span className="text-gray-400 mt-1">•</span>
                    <span
                      className="text-gray-700 text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: formatArticleHtml(item),
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        if (section.type === "tip") {
          return (
            <div key={idx} className="flex gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200">
              <Lightbulb className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-900 leading-relaxed">
                <strong>Dica:</strong>{" "}
                <span dangerouslySetInnerHTML={{
                  __html: formatArticleHtml(section.content as string),
                }} />
              </p>
            </div>
          );
        }

        if (section.type === "warning") {
          return (
            <div key={idx} className="flex gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900 leading-relaxed">
                <strong>Atenção:</strong>{" "}
                <span dangerouslySetInnerHTML={{
                  __html: formatArticleHtml(section.content as string),
                }} />
              </p>
            </div>
          );
        }

        if (section.type === "code") {
          return (
            <div key={idx} className="space-y-2">
              {section.heading && (
                <p className="text-sm font-medium text-gray-700">{section.heading}</p>
              )}
              <pre className="p-4 rounded-lg bg-gray-900 text-gray-100 text-sm overflow-x-auto">
                <code>{section.content as string}</code>
              </pre>
            </div>
          );
        }

        if (section.type === "badge-row") {
          return (
            <div key={idx} className="flex flex-wrap gap-2">
              {(section.content as string[]).map((badge, i) => (
                <span key={i} className="px-3 py-1 rounded-full bg-teal-100 text-teal-800 text-xs font-medium">
                  {badge}
                </span>
              ))}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

// ─── Página de Artigo ─────────────────────────────────────────────────────────
function PublicArticleView({
  article,
  category,
  onBack,
}: {
  article: Article;
  category: Category;
  onBack: () => void;
}) {
  const [, setLocation] = useLocation();
  const slug = generateSlug(article.title);

  useDocumentHead(
    `${article.title} — Central de Ajuda AgenteZap`,
    article.description,
    slug
  );

  const difficultyLabel = {
    beginner: "Iniciante",
    intermediate: "Intermediário",
    advanced: "Avançado",
  }[article.difficulty];

  const difficultyColor = {
    beginner: "bg-green-100 text-green-700",
    intermediate: "bg-yellow-100 text-yellow-700",
    advanced: "bg-red-100 text-red-700",
  }[article.difficulty];

  const Icon = category.icon;
  const isCourseVideoArticle = article.id === "course-video-all";

  return (
    <>
      <ArticleJsonLD article={article} category={category} />
      <div className="min-h-screen bg-white flex flex-col">
        <PublicHeader />
        <main className={`flex-1 max-w-3xl mx-auto w-full px-4 ${isCourseVideoArticle ? "py-3 sm:py-8" : "py-8"}`}>
          {/* Breadcrumbs */}
          <nav className={`items-center gap-1.5 text-sm text-gray-500 ${isCourseVideoArticle ? "mb-3 hidden sm:flex" : "mb-6 flex"}`} aria-label="Breadcrumb">
            <button onClick={() => setLocation("/ajuda")} className="hover:text-teal-600 transition-colors">
              Início
            </button>
            <ChevronRight className="w-3.5 h-3.5" />
            <button
              onClick={() => setLocation(`/ajuda/categoria/${category.id}`)}
              className="hover:text-teal-600 transition-colors"
            >
              {category.title}
            </button>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-gray-900 font-medium truncate max-w-[200px]">{article.title}</span>
          </nav>

          {/* Header do artigo */}
          <div className={isCourseVideoArticle ? "mb-3 sm:mb-8" : "mb-8"}>
            <div className={`items-center gap-2 mb-3 ${isCourseVideoArticle ? "hidden sm:flex" : "flex"}`}>
              <div className="p-1.5 rounded-md bg-gray-100">
                <Icon className={`w-4 h-4 ${category.color}`} />
              </div>
              <span className="text-sm text-gray-500">{category.title}</span>
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${difficultyColor}`}>
                {difficultyLabel}
              </span>
            </div>
            <h1 className={`${isCourseVideoArticle ? "mb-1 text-xl sm:mb-3 sm:text-3xl" : "mb-3 text-2xl sm:text-3xl"} font-bold text-gray-900`}>{article.title}</h1>
            <p className={`${isCourseVideoArticle ? "hidden sm:block" : ""} text-gray-600 text-lg leading-relaxed`}>{article.description}</p>
          </div>

          {/* Conteúdo */}
          {getCourseVideosForArticle(article.id).length > 0 && (
            <div className="mb-8">
              <CourseVideoPanel
                videos={getCourseVideosForArticle(article.id)}
                title={article.id === "course-video-all" ? "Curso completo em video" : "Aula relacionada"}
                description="Assista o video aqui mesmo antes de seguir o passo a passo."
                compact={article.id !== "course-video-all"}
                prioritizeVideoOnMobile={isCourseVideoArticle}
              />
            </div>
          )}

          <ArticleContent sections={article.content} />

          {/* Tags */}
          {article.tags.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-500 mb-2">Tags relacionadas:</p>
              <div className="flex flex-wrap gap-2">
                {article.tags.map(tag => (
                  <span key={tag} className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* CTA Final */}
          <div className="mt-10 p-6 rounded-xl bg-gradient-to-br from-teal-50 to-teal-100 border border-teal-200 text-center">
            <CheckCircle2 className="w-8 h-8 text-teal-600 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 text-lg mb-2">Pronto para começar?</h3>
            <p className="text-gray-600 text-sm mb-4">
              Crie sua conta grátis e automatize seu atendimento no WhatsApp hoje mesmo.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => setLocation("/cadastro")}
                className="w-full sm:w-auto px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                Começar Grátis
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="https://wa.me/5517991648288?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20com%20o%20AgenteZap."
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Falar com Suporte
              </a>
            </div>
          </div>

          {/* Navegação entre artigos da categoria */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-teal-600 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Voltar para {category.title}
            </button>
          </div>
        </main>
        <PublicFooter />
      </div>
    </>
  );
}

// ─── Página de Categoria ──────────────────────────────────────────────────────
function PublicCategoryView({
  category,
  onSelectArticle,
  onBack,
}: {
  category: Category;
  onSelectArticle: (a: Article) => void;
  onBack: () => void;
}) {
  const [, setLocation] = useLocation();

  useDocumentHead(
    `${category.title} — Central de Ajuda AgenteZap`,
    `${category.description} — ${category.articles.length} artigos disponíveis.`,
    `categoria/${category.id}`
  );

  const Icon = category.icon;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
          <button onClick={() => setLocation("/ajuda")} className="hover:text-teal-600 transition-colors">
            Início
          </button>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium">{category.title}</span>
        </nav>

        {/* Header da categoria */}
        <div className="flex items-start gap-4 mb-8">
          <div className="p-3 rounded-xl bg-gray-100 flex-shrink-0">
            <Icon className={`w-6 h-6 ${category.color}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{category.title}</h1>
            <p className="text-gray-600">{category.description}</p>
            <p className="text-sm text-gray-400 mt-1">{category.articles.length} artigo{category.articles.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Lista de artigos */}
        <div className="space-y-2">
          {category.articles.map((article) => (
            <button
              key={article.id}
              onClick={() => onSelectArticle(article)}
              className="w-full text-left flex items-start gap-3 p-4 rounded-lg border border-gray-200 hover:border-teal-300 hover:bg-teal-50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 group-hover:text-teal-700 transition-colors">
                  {article.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{article.description}</p>
                {article.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {article.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 group-hover:text-teal-600 transition-colors mt-1" />
            </button>
          ))}
        </div>

        {/* CTA Suporte */}
        <div className="mt-10 p-5 rounded-xl bg-green-50 border border-green-200 text-center">
          <p className="font-semibold text-green-800 mb-1">Não encontrou o que precisava?</p>
          <p className="text-sm text-green-700 mb-4">
            Nossa equipe de suporte está pronta para ajudar você diretamente.
          </p>
          <a
            href="https://wa.me/5517991648288?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20com%20o%20AgenteZap."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-semibold text-sm transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Falar com o Suporte
          </a>
        </div>

        <div className="mt-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-teal-600 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar para Central de Ajuda
          </button>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

// ─── Página Principal da Central de Ajuda Pública ────────────────────────────
export default function PublicHelpCenter() {
  const [location, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const totalArticles = HELP_CATEGORIES.reduce((s, c) => s + c.articles.length, 0);

  useDocumentHead(
    "Central de Ajuda — AgenteZap",
    `Central de Ajuda do AgenteZap. ${totalArticles} artigos cobrindo todas as funcionalidades. Conecte WhatsApp, configure IA, automatize atendimento.`
  );

  // Roteamento baseado na URL
  useEffect(() => {
    const path = location;

    // /ajuda/categoria/:catId
    const catMatch = path.match(/^\/ajuda\/categoria\/([^/]+)$/);
    if (catMatch) {
      const catId = catMatch[1];
      const cat = HELP_CATEGORIES.find(c => c.id === catId);
      if (cat) {
        setSelectedCategory(cat);
        setSelectedArticle(null);
      }
      return;
    }

    // /ajuda/:slug - busca artigo por slug
    const articleMatch = path.match(/^\/ajuda\/([^/]+)$/);
    if (articleMatch && articleMatch[1] !== "categoria") {
      const slug = articleMatch[1];
      for (const cat of HELP_CATEGORIES) {
        for (const art of cat.articles) {
          if (generateSlug(art.title) === slug || art.id === slug) {
            setSelectedCategory(cat);
            setSelectedArticle(art);
            return;
          }
        }
      }
      // Artigo não encontrado — 404
      setSelectedCategory(null);
      setSelectedArticle(null);
    }

    // /ajuda — home
    if (path === "/ajuda" || path === "/ajuda/") {
      setSelectedCategory(null);
      setSelectedArticle(null);
    }

    // query param ?article=id (compatibilidade com deep-links internos)
    const params = new URLSearchParams(window.location.search);
    const articleId = params.get("article");
    if (articleId) {
      for (const cat of HELP_CATEGORIES) {
        const art = cat.articles.find(a => a.id === articleId);
        if (art) {
          setSelectedCategory(cat);
          setSelectedArticle(art);
          break;
        }
      }
    }
  }, [location]);

  // Pesquisa global
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: { article: Article; category: Category }[] = [];
    for (const cat of HELP_CATEGORIES) {
      for (const art of cat.articles) {
        const haystack = [art.title, art.description, ...art.tags].join(" ").toLowerCase();
        if (haystack.includes(q)) {
          results.push({ article: art, category: cat });
        }
      }
    }
    return results;
  }, [searchQuery]);

  // Handlers de navegação
  const handleSelectCategory = (cat: Category) => {
    setSelectedCategory(cat);
    setSelectedArticle(null);
    setLocation(`/ajuda/categoria/${cat.id}`);
  };

  const handleSelectArticle = (art: Article, cat: Category) => {
    setSelectedCategory(cat);
    setSelectedArticle(art);
    const slug = generateSlug(art.title);
    setLocation(`/ajuda/${slug}`);
  };

  const handleBackToHome = () => {
    setSelectedCategory(null);
    setSelectedArticle(null);
    setLocation("/ajuda");
  };

  const handleBackToCategory = () => {
    setSelectedArticle(null);
    if (selectedCategory) {
      setLocation(`/ajuda/categoria/${selectedCategory.id}`);
    } else {
      setLocation("/ajuda");
    }
  };

  // ── Renderizar artigo aberto
  if (selectedArticle && selectedCategory) {
    return (
      <PublicArticleView
        article={selectedArticle}
        category={selectedCategory}
        onBack={handleBackToCategory}
      />
    );
  }

  // ── Renderizar categoria aberta
  if (selectedCategory) {
    return (
      <PublicCategoryView
        category={selectedCategory}
        onSelectArticle={(art) => handleSelectArticle(art, selectedCategory)}
        onBack={handleBackToHome}
      />
    );
  }

  // ── 404: artigo não encontrado (URL com slug inválido)
  const path = location;
  const isArticlePath = path.match(/^\/ajuda\/(?!categoria\/)([^/]+)$/);
  if (isArticlePath) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <PublicHeader />
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
          <Info className="w-16 h-16 text-gray-300 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Artigo não encontrado</h1>
          <p className="text-gray-600 mb-6">O artigo que você procura não existe ou foi removido.</p>
          <button
            onClick={handleBackToHome}
            className="px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg transition-colors"
          >
            Ver todos os artigos
          </button>
        </main>
        <PublicFooter />
      </div>
    );
  }

  // ── Home da Central de Ajuda
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicHeader />
      <main className="flex-1">
        {/* Hero */}
        <div className="bg-gradient-to-b from-teal-50 to-white px-4 py-12 text-center">
          <div className="inline-flex items-center gap-2 text-teal-600 mb-3">
            <HelpCircle className="w-5 h-5" />
            <span className="text-sm font-semibold uppercase tracking-wide">Central de Ajuda</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            Como podemos te ajudar?
          </h1>
          <p className="text-gray-500 mb-6 max-w-lg mx-auto">
            {totalArticles} artigos cobrindo todas as funcionalidades do AgenteZap
          </p>

          {/* Barra de busca */}
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar artigos... ex: 'conectar whatsapp', 'prompt', 'delivery'"
              className="pl-11 pr-10 h-12 text-base border-2 border-gray-200 focus:border-teal-400 rounded-xl shadow-sm bg-white"
              autoFocus={false}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 pb-16">
          {/* Resultados de busca */}
          {searchQuery && (
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-4">
                {searchResults.length > 0
                  ? `${searchResults.length} resultado(s) para "${searchQuery}"`
                  : `Nenhum resultado encontrado para "${searchQuery}"`}
              </p>
              {searchResults.length === 0 && (
                <div className="text-center py-12">
                  <HelpCircle className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">Tente palavras diferentes ou browse pelas categorias abaixo.</p>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-teal-600 hover:underline text-sm"
                  >
                    Ver todas as categorias
                  </button>
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map(({ article, category }) => {
                    const Icon = category.icon;
                    return (
                      <button
                        key={article.id}
                        onClick={() => handleSelectArticle(article, category)}
                        className="w-full text-left flex items-start gap-3 p-4 rounded-lg border border-gray-200 hover:border-teal-300 hover:bg-teal-50 transition-colors group"
                      >
                        <Icon className={`w-4 h-4 ${category.color} flex-shrink-0 mt-0.5`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900 group-hover:text-teal-700 transition-colors">
                            {article.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{article.description}</p>
                          <p className="text-xs text-gray-400 mt-1">{category.title}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0 group-hover:text-teal-600 mt-1" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Categorias (quando não há busca) */}
          {!searchQuery && (
            <>
              {/* Acesso rápido */}
              <div className="mt-8 mb-8">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                  Começo rápido
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { title: "Curso AgenteZap", desc: `${COURSE_VIDEOS.length} aulas e extras dentro da plataforma`, catId: "course-video", articleId: "course-video-all" },
                    { title: "Conectar WhatsApp", desc: "Escaneie o QR Code em 2 minutos", catId: "onboarding", articleId: "onboarding-connect" },
                    { title: "Configurar Agente IA", desc: "Escreva o prompt e ative o agente", catId: "onboarding", articleId: "onboarding-agent" },
                    { title: "Enviar mensagem em massa", desc: "Dispare para centenas de contatos", catId: "mass-send", articleId: "mass-send-setup" },
                  ].map(({ title, desc, catId, articleId }) => {
                    const cat = HELP_CATEGORIES.find(c => c.id === catId);
                    if (!cat) return null;
                    const art = cat.articles.find(a => a.id === articleId);
                    if (!art) return null;
                    return (
                      <button
                        key={articleId}
                        onClick={() => handleSelectArticle(art, cat)}
                        className="text-left flex items-start gap-3 p-4 rounded-lg border border-gray-200 hover:border-teal-300 bg-white hover:bg-teal-50 transition-colors group shadow-sm"
                      >
                        <div className="p-1.5 rounded-md bg-teal-100 flex-shrink-0">
                          <ArrowRight className="w-4 h-4 text-teal-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 group-hover:text-teal-700">{title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Todas as categorias */}
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Todas as categorias
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {HELP_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleSelectCategory(cat)}
                      className="text-left flex items-start gap-3 p-4 rounded-lg border border-gray-200 hover:border-teal-300 bg-white hover:bg-teal-50 transition-colors group shadow-sm"
                    >
                      <div className="p-1.5 rounded-md bg-gray-100 flex-shrink-0 mt-0.5">
                        <Icon className={`w-4 h-4 ${cat.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 group-hover:text-teal-700 transition-colors">
                          {cat.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{cat.description}</p>
                        <p className="text-xs text-gray-400 mt-2">
                          {cat.articles.length} artigo{cat.articles.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 group-hover:text-teal-600 mt-1" />
                    </button>
                  );
                })}
              </div>

              {/* Suporte */}
              <div className="mt-10 p-6 rounded-xl border border-gray-200 bg-gray-50 text-center">
                <HelpCircle className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                <h3 className="font-bold text-gray-900 mb-1">Não encontrou o que precisava?</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Nossa equipe de suporte está pronta para ajudar você diretamente pelo WhatsApp.
                </p>
                <a
                  href="https://wa.me/5517991648288?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20com%20o%20AgenteZap."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-semibold text-sm transition-colors"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Falar com o Suporte no WhatsApp
                </a>
              </div>
            </>
          )}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
