/**
 * Central de Ajuda — AgenteZap (versão interna, dentro do dashboard)
 * Help Center completo com busca, categorias e artigos didáticos
 * Cobre toda a área do cliente (onboarding → avançado)
 * 
 * DADOS: compartilhados com a versão pública via help-center-data.ts
 */
import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Search,
  ChevronRight,
  ChevronLeft,
  Bot,
  Smartphone,
  MessageCircle,
  Wrench,
  Send,
  Megaphone,
  Kanban,
  Users,
  Tags,
  Filter,
  Plug,
  CalendarClock,
  BedDouble,
  Bell,
  Upload,
  BookUser,
  Sparkles,
  Ban,
  FormInput,
  Package,
  UtensilsCrossed,
  ClipboardList,
  Mic,
  Workflow,
  Ticket,
  Settings,
  Receipt,
  CreditCard,
  LayoutDashboard,
  Rocket,
  Brain,
  Building2,
  HelpCircle,
  Home,
  X,
  CheckCircle2,
  Info,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

// ─── Tipos e Dados (compartilhados com a versão pública) ─────────────────────
import type { Article, ArticleSection, VisualStep, Category } from "./help-center-data";
import { HELP_CATEGORIES } from "./help-center-data";
import { CourseVideoPanel } from "@/components/course-video-panel";
import { COURSE_VIDEOS, getCourseVideosForArticle } from "@/lib/youtube-course";
export { HELP_CATEGORIES };

// ─── Conteúdo dos Artigos (movido para help-center-data.ts) ──────────────────

function formatArticleHtml(content: string) {
  return content
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noreferrer" class="font-medium text-primary underline underline-offset-4">$1</a>',
    );
}


// ─── Componente: ArticleView ─────────────────────────────────────────────────

function ArticleView({
  article,
  category,
  onBack,
}: {
  article: Article;
  category: Category;
  onBack: () => void;
}) {
  const difficultyMap = {
    beginner: { label: "Iniciante", color: "bg-green-100 text-green-700" },
    intermediate: { label: "Intermediário", color: "bg-yellow-100 text-yellow-700" },
    advanced: { label: "Avançado", color: "bg-red-100 text-red-700" },
  };
  const diff = difficultyMap[article.difficulty];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Breadcrumb + voltar */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-auto p-1 gap-1">
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </Button>
        <span>/</span>
        <span>{category.title}</span>
        <span>/</span>
        <span className="text-foreground font-medium truncate">{article.title}</span>
      </div>

      {/* Header do artigo */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="secondary" className={diff.color}>
            {diff.label}
          </Badge>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">{article.title}</h1>
        <p className="text-muted-foreground">{article.description}</p>
      </div>

      {getCourseVideosForArticle(article.id).length > 0 && (
        <div className="mb-8">
          <CourseVideoPanel
            videos={getCourseVideosForArticle(article.id)}
            title={article.id === "course-video-all" ? "Curso completo em video" : "Aula relacionada"}
            description="Assista o video aqui mesmo antes de seguir o passo a passo."
            compact={article.id !== "course-video-all"}
          />
        </div>
      )}

      {/* Conteúdo do artigo */}
      <div className="space-y-6">
        {article.content.map((section, idx) => {
          if (section.type === "text") {
            return (
              <p
                key={idx}
                className="text-foreground leading-relaxed"
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
                  <h3 className="font-semibold text-foreground">{section.heading}</h3>
                )}
                <ol className="space-y-2">
                  {(section.content as string[]).map((step, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span
                        className="text-foreground text-sm leading-relaxed"
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

          if (section.type === "list") {
            return (
              <div key={idx} className="space-y-2">
                {section.heading && (
                  <h3 className="font-semibold text-foreground">{section.heading}</h3>
                )}
                <ul className="space-y-1.5">
                  {(section.content as string[]).map((item, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span className="text-muted-foreground mt-1">•</span>
                      <span
                        className="text-foreground text-sm leading-relaxed"
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
              <div
                key={idx}
                className="flex gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20"
              >
                <Lightbulb className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-sm text-foreground leading-relaxed">
                  <strong>Dica:</strong>{" "}
                  <span
                    dangerouslySetInnerHTML={{
                      __html: formatArticleHtml(section.content as string),
                    }}
                  />
                </p>
              </div>
            );
          }

          if (section.type === "warning") {
            return (
              <div
                key={idx}
                className="flex gap-3 p-4 rounded-lg bg-orange-50 border border-orange-200 dark:bg-orange-950/20 dark:border-orange-800"
              >
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-orange-800 dark:text-orange-200 leading-relaxed">
                  <strong>Atenção:</strong>{" "}
                  <span
                    dangerouslySetInnerHTML={{
                      __html: formatArticleHtml(section.content as string),
                    }}
                  />
                </p>
              </div>
            );
          }

          // ── NOVO: screenshot embutido ──────────────────────────────────
          if (section.type === "screenshot") {
            return (
              <figure key={idx} className="my-4">
                {section.heading && (
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {section.heading}
                  </p>
                )}
                <div className="rounded-xl border border-border overflow-hidden shadow-sm">
                  <img
                    src={`/tutorial-screenshots/${section.src}`}
                    alt={section.caption || section.heading || "Screenshot"}
                    className="w-full h-auto block"
                    loading="lazy"
                  />
                </div>
                {section.caption && (
                  <figcaption className="text-xs text-muted-foreground mt-1.5 text-center italic">
                    {section.caption}
                  </figcaption>
                )}
              </figure>
            );
          }

          // ── NOVO: passo visual (passo + print + explicação) ──────────────
          if (section.type === "visual-steps") {
            const steps = section.content as VisualStep[];
            return (
              <div key={idx} className="space-y-6">
                {section.heading && (
                  <h3 className="font-bold text-foreground text-base border-b border-border pb-2">
                    {section.heading}
                  </h3>
                )}
                {steps.map((vs, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-border bg-card overflow-hidden"
                  >
                    {/* Cabeçalho do passo */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border-b border-border">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                        {vs.step}
                      </span>
                      <span
                        className="font-semibold text-foreground text-sm leading-snug"
                        dangerouslySetInnerHTML={{
                          __html: vs.action.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"),
                        }}
                      />
                    </div>

                    {/* Screenshot do passo */}
                    {vs.screenshot && (
                      <div className="border-b border-border">
                        <img
                          src={`/tutorial-screenshots/${vs.screenshot}`}
                          alt={`Passo ${vs.step}: ${vs.action}`}
                          className="w-full h-auto block"
                          loading="lazy"
                        />
                      </div>
                    )}

                    {/* Explicação + resultado */}
                    <div className="px-4 py-3 space-y-2">
                      <p
                        className="text-sm text-foreground leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: formatArticleHtml(vs.explain),
                        }}
                      />
                      {vs.result && (
                        <div className="flex items-start gap-2 mt-2 p-2 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span className="text-xs text-green-800 dark:text-green-200 leading-relaxed">
                            {vs.result}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          }

          // ── NOVO: heading interno ──────────────────────────────────────
          if (section.type === "heading") {
            return (
              <h3 key={idx} className="font-bold text-foreground text-base mt-2 mb-1 border-l-4 border-primary pl-3">
                {section.content as string}
              </h3>
            );
          }

          // ── NOVO: row de badges ─────────────────────────────────────────
          if (section.type === "badge-row") {
            return (
              <div key={idx} className="flex flex-wrap gap-2">
                {(section.content as string[]).map((b, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {b}
                  </span>
                ))}
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Tags */}
      <div className="mt-8 pt-6 border-t border-border">
        <p className="text-xs text-muted-foreground mb-2">Tópicos relacionados:</p>
        <div className="flex flex-wrap gap-1.5">
          {article.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* CTA WhatsApp — sempre visível em todos os artigos */}
      <div className="mt-8 p-5 rounded-xl bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800 text-center">
        <p className="text-sm font-semibold text-green-800 dark:text-green-200 mb-1">
          Ainda com dúvida? Fale direto com o suporte!
        </p>
        <p className="text-xs text-green-700 dark:text-green-300 mb-4">
          Nossa equipe responde pelo WhatsApp em horário comercial.
        </p>
        <a
          href="https://wa.me/5517991648288?text=Olá!%20Preciso%20de%20ajuda%20com%20o%20AgenteZap."
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-semibold text-sm transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Abrir chamado / Falar com o suporte
        </a>
      </div>
    </div>
  );
}

// ─── Componente: CategoryView ────────────────────────────────────────────────

function CategoryView({
  category,
  onSelectArticle,
  onBack,
}: {
  category: Category;
  onSelectArticle: (article: Article) => void;
  onBack: () => void;
}) {
  const Icon = category.icon;
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-auto p-1 gap-1">
          <ChevronLeft className="w-4 h-4" />
          Central de Ajuda
        </Button>
        <span>/</span>
        <span className="text-foreground font-medium">{category.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className={`p-2 rounded-lg bg-muted`}>
          <Icon className={`w-6 h-6 ${category.color}`} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">{category.title}</h1>
          <p className="text-sm text-muted-foreground">{category.description}</p>
        </div>
      </div>

      {/* Artigos */}
      <div className="space-y-2">
        {category.articles.map((article) => (
          <button
            key={article.id}
            onClick={() => onSelectArticle(article)}
            className="w-full text-left flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent hover:border-accent-foreground/20 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground text-sm group-hover:text-primary transition-colors">
                {article.title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {article.description}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground ml-3 flex-shrink-0 group-hover:text-primary transition-colors" />
          </button>
        ))}
      </div>

      {/* CTA WhatsApp para categoria de suporte */}
      {category.id === "support-tickets" && (
        <div className="mt-8 p-5 rounded-xl bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800 text-center">
          <p className="text-base font-semibold text-green-800 dark:text-green-200 mb-1">
            Fale direto com o suporte
          </p>
          <p className="text-sm text-green-700 dark:text-green-300 mb-4">
            Nossa equipe responde em até 4 horas úteis, de segunda a sexta das 9h às 18h.
          </p>
          <a
            href="https://wa.me/5517991648288?text=Olá!%20Preciso%20de%20ajuda%20com%20o%20AgenteZap."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-semibold text-sm transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Abrir WhatsApp — +55 17 99164-8288
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal: HelpCenter ────────────────────────────────────────

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  // Deep-link: ?article=<id> abre o artigo diretamente
  // Exemplo: /ajuda?article=followup-setup
  // Usado pelo ContextualHelpButton de cada página
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const articleId = params.get("article");
    if (articleId) {
      for (const cat of HELP_CATEGORIES) {
        const art = cat.articles.find((a) => a.id === articleId);
        if (art) {
          setSelectedCategory(cat);
          setSelectedArticle(art);
          break;
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pesquisa global em todas as categorias/artigos
  const searchResults = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return [];

    const results: Array<{ article: Article; category: Category }> = [];
    HELP_CATEGORIES.forEach((cat) => {
      cat.articles.forEach((art) => {
        const matchTitle = art.title.toLowerCase().includes(query);
        const matchDesc = art.description.toLowerCase().includes(query);
        const matchTags = art.tags.some((t) => t.includes(query));
        const matchContent = art.content.some((s) => {
          const c = Array.isArray(s.content) ? s.content.join(" ") : (s.content ?? "");
          return c.toLowerCase().includes(query);
        });
        if (matchTitle || matchDesc || matchTags || matchContent) {
          results.push({ article: art, category: cat });
        }
      });
    });
    return results;
  }, [searchQuery]);

  const totalArticles = HELP_CATEGORIES.reduce((s, c) => s + c.articles.length, 0);

  // ── Navegação: artigo aberto
  if (selectedArticle && selectedCategory) {
    return (
      <div className="min-h-full bg-background">
        <ArticleView
          article={selectedArticle}
          category={selectedCategory}
          onBack={() => setSelectedArticle(null)}
        />
      </div>
    );
  }

  // ── Navegação: categoria aberta
  if (selectedCategory) {
    return (
      <div className="min-h-full bg-background">
        <CategoryView
          category={selectedCategory}
          onSelectArticle={(art) => setSelectedArticle(art)}
          onBack={() => setSelectedCategory(null)}
        />
      </div>
    );
  }

  // ── Home da Central de Ajuda
  return (
    <div className="min-h-full bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-b from-primary/5 to-background px-4 py-10 text-center">
        <div className="inline-flex items-center gap-2 text-primary mb-3">
          <HelpCircle className="w-6 h-6" />
          <span className="text-sm font-semibold uppercase tracking-wide">Central de Ajuda</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
          Como podemos te ajudar?
        </h1>
        <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
          {totalArticles} artigos cobrindo todas as funcionalidades do AgenteZap
        </p>

        {/* Barra de busca */}
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar artigos... (ex: 'conectar whatsapp', 'prompt', 'delivery')"
            className="pl-9 pr-9 h-10 bg-background shadow-sm"
            autoFocus={false}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-12">
        {/* ── Resultados de busca */}
        {searchQuery && (
          <div className="mt-6">
            <p className="text-sm text-muted-foreground mb-4">
              {searchResults.length > 0
                ? `${searchResults.length} resultado(s) para "${searchQuery}"`
                : `Nenhum resultado para "${searchQuery}"`}
            </p>
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map(({ article, category }) => {
                  const Icon = category.icon;
                  return (
                    <button
                      key={article.id}
                      onClick={() => {
                        setSelectedCategory(category);
                        setSelectedArticle(article);
                      }}
                      className="w-full text-left flex items-start gap-3 p-4 rounded-lg border border-border hover:bg-accent transition-colors group"
                    >
                      <Icon className={`w-4 h-4 ${category.color} flex-shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                          {article.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{article.description}</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">{category.title}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground ml-2 flex-shrink-0 group-hover:text-primary" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Grid de categorias (só quando não há busca) */}
        {!searchQuery && (
          <>
            {/* Acesso rápido — Início */}
            <div className="mt-8 mb-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Começo rápido
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    title: "Curso AgenteZap",
                    desc: `${COURSE_VIDEOS.length} aulas e extras dentro da plataforma`,
                    icon: BookUser,
                    articleId: "course-video-all",
                    catId: "course-video",
                  },
                  {
                    title: "Conectar WhatsApp",
                    desc: "Escaneie o QR Code em 2 minutos",
                    icon: Smartphone,
                    articleId: "onboarding-connect",
                    catId: "onboarding",
                  },
                  {
                    title: "Configurar Agente IA",
                    desc: "Escreva o prompt e ative o agente",
                    icon: Bot,
                    articleId: "onboarding-agent",
                    catId: "onboarding",
                  },
                  {
                    title: "Enviar mensagem em massa",
                    desc: "Dispare para centenas de contatos",
                    icon: Send,
                    articleId: "mass-send-setup",
                    catId: "mass-send",
                  },
                ].map(({ title, desc, icon: Icon, articleId, catId }) => {
                  const cat = HELP_CATEGORIES.find((c) => c.id === catId)!;
                  const art = cat.articles.find((a) => a.id === articleId)!;
                  return (
                    <button
                      key={articleId}
                      onClick={() => {
                        setSelectedCategory(cat);
                        setSelectedArticle(art);
                      }}
                      className="text-left flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/30 transition-colors group"
                    >
                      <div className="p-1.5 rounded-md bg-primary/10 flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                          {title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Todas as categorias */}
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              Todas as categorias
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {HELP_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat)}
                    className="text-left flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/30 transition-colors group"
                  >
                    <div className="p-1.5 rounded-md bg-muted flex-shrink-0 mt-0.5">
                      <Icon className={`w-4 h-4 ${cat.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                        {cat.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {cat.description}
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-2">
                        {cat.articles.length} artigo{cat.articles.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 group-hover:text-primary transition-colors mt-1" />
                  </button>
                );
              })}
            </div>

            {/* Ainda com dúvidas? */}
            <div className="mt-10 p-6 rounded-xl border border-border bg-card text-center">
              <HelpCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-1">Não encontrou o que precisava?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Nossa equipe de suporte está pronta para ajudar você diretamente pelo WhatsApp.
              </p>
              <a
                href="https://wa.me/5517991648288?text=Olá!%20Preciso%20de%20ajuda%20com%20o%20AgenteZap."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-semibold text-sm transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Falar com o Suporte no WhatsApp
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
