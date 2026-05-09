"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELP_CATEGORIES_META = void 0;
exports.registerPublicHelpRoutes = registerPublicHelpRoutes;
exports.generateHelpSitemap = generateHelpSitemap;
// ─── Rate Limiting simples em memória ────────────────────────────────────────
var rateLimitMap = new Map();
var RATE_LIMIT_WINDOW = 60000; // 1 minuto
var RATE_LIMIT_MAX = 60; // 60 req/min por IP
function checkRateLimit(ip) {
    var now = Date.now();
    var entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
        return true;
    }
    entry.count++;
    if (entry.count > RATE_LIMIT_MAX)
        return false;
    return true;
}
function getClientIp(req) {
    var _a, _b, _c;
    return (((_b = (_a = req.headers["x-forwarded-for"]) === null || _a === void 0 ? void 0 : _a.split(",")[0]) === null || _b === void 0 ? void 0 : _b.trim()) ||
        ((_c = req.socket) === null || _c === void 0 ? void 0 : _c.remoteAddress) ||
        "unknown");
}
// Limpeza periódica do mapa de rate limit
setInterval(function () {
    var now = Date.now();
    var keysToDelete = [];
    rateLimitMap.forEach(function (entry, ip) {
        if (now > entry.resetAt)
            keysToDelete.push(ip);
    });
    keysToDelete.forEach(function (ip) { return rateLimitMap.delete(ip); });
}, 5 * 60000);
// ─── Dados dos artigos (espelho da estrutura do frontend) ─────────────────────
// Nota: o conteúdo completo está no frontend (help-center-data.ts)
// Esta API serve metadados para buscas e integrações externas
exports.HELP_CATEGORIES_META = [
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
    { id: "settings", title: "Configurações & Conta", description: "Planos, pagamentos e configurações gerais", articleCount: 4 },
];
// ─── Registro das rotas públicas ─────────────────────────────────────────────
function registerPublicHelpRoutes(app) {
    // Middleware de rate limiting para todas as rotas públicas de ajuda
    app.use("/api/public/help", function (req, res, next) {
        var ip = getClientIp(req);
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
    app.get("/api/public/help/categories", function (req, res) {
        res.json({
            success: true,
            data: exports.HELP_CATEGORIES_META,
            total: exports.HELP_CATEGORIES_META.length,
        });
    });
    /**
     * GET /api/public/help/articles?category=&search=
     * Lista artigos públicos com filtro opcional de categoria e busca
     */
    app.get("/api/public/help/articles", function (req, res) {
        var _a = req.query, category = _a.category, search = _a.search;
        var categories = exports.HELP_CATEGORIES_META;
        if (category) {
            categories = categories.filter(function (c) { return c.id === category; });
            if (categories.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: "Categoria não encontrada",
                });
            }
        }
        // Para busca, retornamos as categorias filtradas
        // O conteúdo completo dos artigos está no frontend
        var result = categories.map(function (cat) { return ({
            category: { id: cat.id, title: cat.title },
            articleCount: cat.articleCount,
            message: "Acesse /ajuda para ver o conteúdo completo dos artigos",
            url: "https://agentezap.online/ajuda/categoria/".concat(cat.id),
        }); });
        res.json({
            success: true,
            data: result,
            total: result.reduce(function (s, c) { return s + c.articleCount; }, 0),
            note: "Para conteúdo completo, acesse https://agentezap.online/ajuda",
        });
    });
    /**
     * GET /api/public/help/articles/:slug
     * Retorna metadados de um artigo específico pelo slug
     */
    app.get("/api/public/help/articles/:slug", function (req, res) {
        var slug = req.params.slug;
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
                slug: slug,
                url: "https://agentezap.online/ajuda/".concat(slug),
                message: "Acesse a URL para ver o conteúdo completo do artigo",
            },
        });
    });
}
/**
 * Gera o sitemap.xml incluindo todas as URLs /ajuda/*
 */
function generateHelpSitemap() {
    var baseUrl = "https://agentezap.online";
    var now = new Date().toISOString().split("T")[0];
    var urls = __spreadArray([
        "".concat(baseUrl, "/ajuda")
    ], exports.HELP_CATEGORIES_META.map(function (cat) { return "".concat(baseUrl, "/ajuda/categoria/").concat(cat.id); }), true);
    var urlEntries = urls.map(function (url) { return "\n  <url>\n    <loc>".concat(url, "</loc>\n    <lastmod>").concat(now, "</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>").concat(url === "".concat(baseUrl, "/ajuda") ? "0.8" : "0.6", "</priority>\n  </url>"); }).join("");
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n  <url>\n    <loc>".concat(baseUrl, "/</loc>\n    <lastmod>").concat(now, "</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>").concat(baseUrl, "/cadastro</loc>\n    <lastmod>").concat(now, "</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>").concat(urlEntries, "\n</urlset>");
}
