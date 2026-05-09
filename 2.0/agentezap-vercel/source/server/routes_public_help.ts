/**
 * routes_public_help.ts
 * API pública read-only para a Central de Ajuda
 * Permite acesso sem autenticação com rate limiting
 */
import type { Express, Request, Response } from "express";

// ─── Rate Limiting simples em memória ────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minuto
const RATE_LIMIT_MAX = 60; // 60 req/min por IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

// Limpeza periódica do mapa de rate limit
setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  rateLimitMap.forEach((entry, ip) => {
    if (now > entry.resetAt) keysToDelete.push(ip);
  });
  keysToDelete.forEach(ip => rateLimitMap.delete(ip));
}, 5 * 60_000);

// ─── Dados dos artigos (espelho da estrutura do frontend) ─────────────────────
// Nota: o conteúdo completo está no frontend (help-center-data.ts)
// Esta API serve metadados para buscas e integrações externas
export const HELP_CATEGORIES_META = [
  { id: "onboarding", title: "Início Rápido", description: "Do cadastro ao primeiro atendimento em minutos", articleCount: 4 },
  { id: "whatsapp", title: "WhatsApp & Conexão", description: "Conectar, gerenciar e monitorar sua conexão WhatsApp", articleCount: 3 },
  { id: "ai-agent", title: "Agente IA", description: "Configurar, treinar e otimizar o agente de IA", articleCount: 5 },
  { id: "mass-send", title: "Envio em Massa", description: "Disparar mensagens para múltiplos contatos", articleCount: 3 },
  { id: "campaigns", title: "Campanhas", description: "Criar e gerenciar campanhas automatizadas", articleCount: 2 },
  { id: "kanban", title: "Kanban & Pipeline", description: "Gerenciar leads com quadro Kanban", articleCount: 2 },
  { id: "contacts", title: "Contatos & CRM", description: "Importar, organizar e segmentar contatos", articleCount: 4 },
  { id: "tags", title: "Etiquetas & Filtros", description: "Organizar conversas com etiquetas", articleCount: 2 },
  { id: "funnel", title: "Funil de Vendas", description: "Acompanhar métricas e conversões", articleCount: 2 },
  { id: "integrations", title: "Integrações", description: "Conectar com outros sistemas via webhook", articleCount: 3 },
  { id: "scheduling", title: "Agendamentos", description: "Gerenciar agendamentos e reservas", articleCount: 3 },
  { id: "notifications", title: "Notificações Smart", description: "Configurar alertas automáticos", articleCount: 2 },
  { id: "delivery", title: "Delivery & Cardápio", description: "Gerenciar pedidos e cardápio digital", articleCount: 3 },
  { id: "salon", title: "Salão de Beleza", description: "Agendamentos e gestão para salões", articleCount: 2 },
  { id: "custom-fields", title: "Campos Personalizados", description: "Criar campos extras para contatos", articleCount: 2 },
  { id: "exclusion-list", title: "Lista de Exclusão", description: "Gerenciar opt-outs e bloqueios", articleCount: 1 },
  { id: "followup", title: "Follow-up Automático", description: "Reengajar conversas abandonadas", articleCount: 3 },
  { id: "audio-config", title: "Áudio & Voz", description: "Configurar respostas em áudio", articleCount: 2 },
  { id: "flow-builder", title: "Construtor de Fluxo", description: "Criar fluxos de atendimento visuais", articleCount: 2 },
  { id: "support-tickets", title: "Tickets de Suporte", description: "Gerenciar tickets e atendimento humano", articleCount: 3 },
  { id: "settings", title: "Configurações & Conta", description: "Planos, pagamentos e configurações gerais", articleCount: 5 },
];

function getPublicBaseUrl(): string {
  return process.env.PUBLIC_BASE_URL
    || process.env.BLOG_BASE_URL
    || process.env.APP_BASE_URL
    || "https://agentezap.online";
}

// ─── Registro das rotas públicas ─────────────────────────────────────────────
export function registerPublicHelpRoutes(app: Express): void {
  const baseUrl = getPublicBaseUrl();

  // Middleware de rate limiting para todas as rotas públicas de ajuda
  app.use("/api/public/help", (req, res, next) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(ip)) {
      return res.status(429).json({
        error: "Too Many Requests",
        message: "Limite de requisições excedido. Tente novamente em 1 minuto.",
        retryAfter: 60,
      });
    }
    // CORS para permitir acesso público
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Cache-Control", "public, max-age=300"); // 5 min cache
    next();
  });

  /**
   * GET /api/public/help/categories
   * Lista todas as categorias da Central de Ajuda
   */
  app.get("/api/public/help/categories", (req: Request, res: Response) => {
    res.json({
      success: true,
      data: HELP_CATEGORIES_META,
      total: HELP_CATEGORIES_META.length,
    });
  });

  /**
   * GET /api/public/help/articles?category=&search=
   * Lista artigos públicos com filtro opcional de categoria e busca
   */
  app.get("/api/public/help/articles", (req: Request, res: Response) => {
    const { category, search } = req.query as { category?: string; search?: string };

    let categories = HELP_CATEGORIES_META;

    if (category) {
      categories = categories.filter(c => c.id === category);
      if (categories.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Categoria não encontrada",
        });
      }
    }

    // Para busca, retornamos as categorias filtradas
    // O conteúdo completo dos artigos está no frontend
    const result = categories.map(cat => ({
      category: { id: cat.id, title: cat.title },
      articleCount: cat.articleCount,
      message: "Acesse /ajuda para ver o conteúdo completo dos artigos",
      url: `${baseUrl}/ajuda/categoria/${cat.id}`,
    }));

    res.json({
      success: true,
      data: result,
      total: result.reduce((s, c) => s + c.articleCount, 0),
      note: `Para conteudo completo, acesse ${baseUrl}/ajuda`,
    });
  });

  /**
   * GET /api/public/help/articles/:slug
   * Retorna metadados de um artigo específico pelo slug
   */
  app.get("/api/public/help/articles/:slug", (req: Request, res: Response) => {
    const { slug } = req.params;

    if (!slug || slug.length > 255) {
      return res.status(400).json({ success: false, error: "Slug inválido" });
    }

    // Verificar se o slug parece válido (básico)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ success: false, error: "Slug com caracteres inválidos" });
    }

    // Para artigos individuais, retornar info básica
    // O conteúdo completo está na página pública /ajuda/:slug
    res.json({
      success: true,
      data: {
        slug,
        url: `${baseUrl}/ajuda/${slug}`,
        message: "Acesse a URL para ver o conteúdo completo do artigo",
      },
    });
  });
}

/**
 * Gera o sitemap.xml incluindo todas as URLs /ajuda/*
 */
export function generateHelpSitemap(): string {
  const baseUrl = getPublicBaseUrl();
  const now = new Date().toISOString().split("T")[0];

  const urls: string[] = [
    `${baseUrl}/ajuda`,
    `${baseUrl}/termos-de-uso`,
    ...HELP_CATEGORIES_META.map(cat => `${baseUrl}/ajuda/categoria/${cat.id}`),
  ];

  const urlEntries = urls.map(url => `
  <url>
    <loc>${url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${url === `${baseUrl}/ajuda` ? "0.8" : "0.6"}</priority>
  </url>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>${urlEntries}
</urlset>`;
}
