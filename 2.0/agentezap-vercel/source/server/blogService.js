"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
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
exports.__blogTestUtils = void 0;
exports.ensureBlogInfrastructure = ensureBlogInfrastructure;
exports.discoverBlogTopics = discoverBlogTopics;
exports.generateBlogPostFromTopic = generateBlogPostFromTopic;
exports.publishBlogPost = publishBlogPost;
exports.refreshBlogPost = refreshBlogPost;
exports.runDiscoveryGenerationPublishCycle = runDiscoveryGenerationPublishCycle;
exports.submitBlogSitemap = submitBlogSitemap;
exports.inspectBlogPostUrl = inspectBlogPostUrl;
exports.listPublicBlogPosts = listPublicBlogPosts;
exports.getPublicBlogPostBySlug = getPublicBlogPostBySlug;
exports.listPublicBlogCategories = listPublicBlogCategories;
exports.listPublicBlogTags = listPublicBlogTags;
exports.buildBlogHomepageHtml = buildBlogHomepageHtml;
exports.buildBlogListingHtml = buildBlogListingHtml;
exports.buildBlogPostHtml = buildBlogPostHtml;
exports.generateBlogSitemapXml = generateBlogSitemapXml;
exports.generateBlogRssXml = generateBlogRssXml;
exports.getBlogAdminMetrics = getBlogAdminMetrics;
exports.getBlogIndexingStatus = getBlogIndexingStatus;
var promises_1 = require("fs/promises");
var path_1 = require("path");
var crypto_1 = require("crypto");
var googleapis_1 = require("googleapis");
var drizzle_orm_1 = require("drizzle-orm");
var db_1 = require("./db");
var storage_1 = require("./storage");
var mistralClient_1 = require("./mistralClient");
var llm_1 = require("./llm");
var schema_1 = require("@shared/schema");
var routes_public_help_1 = require("./routes_public_help");
var BLOG_SYSTEM_CONFIG_KEYS = [
    "blog_base_url",
    "blog_author_name",
    "blog_author_url",
    "blog_author_role",
    "blog_mistral_text_model",
    "blog_search_console_site_url",
    "blog_search_console_service_account_json",
    "blog_search_console_client_email",
    "blog_search_console_private_key",
    "blog_hf_api_token",
    "blog_hf_image_model",
    "blog_brand_name",
    "blog_publish_enabled",
    "blog_discovery_enabled",
    "blog_refresh_enabled",
];
var DEFAULT_BASE_URL = "https://agentezap.online";
var BLOG_ASSET_DIR = path_1.default.join(process.cwd(), "uploads", "blog-assets");
var BLOG_MIGRATION_FILE = path_1.default.join(process.cwd(), "server", "migrations", "create_blog_tables.sql");
var DISCOVERY_SEEDS = [
    { keyword: "agente de ia para whatsapp", title: "Como usar um agente de IA no WhatsApp para vender 24/7", cluster: "ia-whatsapp", category: "ia-whatsapp", intent: "commercial", funnel: "bofu" },
    { keyword: "automacao de atendimento no whatsapp", title: "Automacao de atendimento no WhatsApp sem perder contexto", cluster: "automacao-whatsapp", category: "automacao-whatsapp", intent: "commercial", funnel: "mofu" },
    { keyword: "crm para whatsapp com ia", title: "CRM para WhatsApp com IA: como centralizar atendimento e vendas", cluster: "crm-whatsapp", category: "crm-whatsapp", intent: "commercial", funnel: "bofu" },
    { keyword: "agendamento pelo whatsapp com ia", title: "Agendamento pelo WhatsApp com IA para equipes pequenas", cluster: "agendamento-whatsapp", category: "agendamento-whatsapp", intent: "commercial", funnel: "mofu" },
    { keyword: "chatbot vs agente de ia no whatsapp", title: "Chatbot vs agente de IA no WhatsApp: diferencas reais", cluster: "comparativos", category: "comparativos", intent: "commercial", funnel: "bofu" },
    { keyword: "ia para clinica no whatsapp", title: "IA para clinica no WhatsApp: confirmar consultas e filtrar pacientes", cluster: "nichos", category: "nichos", intent: "commercial", funnel: "bofu" },
    { keyword: "ia para salao no whatsapp", title: "IA para salao no WhatsApp: reduzir faltas e acelerar agendamentos", cluster: "nichos", category: "nichos", intent: "commercial", funnel: "bofu" },
    { keyword: "follow up automatico no whatsapp", title: "Follow-up automatico no WhatsApp para leads que somem", cluster: "follow-up", category: "automacao-whatsapp", intent: "commercial", funnel: "bofu" },
    { keyword: "como automatizar vendas no whatsapp", title: "Como automatizar vendas no WhatsApp sem parecer robotico", cluster: "automacao-whatsapp", category: "automacao-whatsapp", intent: "commercial", funnel: "mofu" },
    { keyword: "melhor ia para whatsapp", title: "Melhor IA para WhatsApp: o que avaliar antes de contratar", cluster: "comparativos", category: "comparativos", intent: "commercial", funnel: "bofu" },
];
var HELP_CATEGORY_LINKS = {
    "ia-whatsapp": "/ajuda/categoria/ai-agent",
    "automacao-whatsapp": "/ajuda/categoria/followup",
    "crm-whatsapp": "/ajuda/categoria/contacts",
    "agendamento-whatsapp": "/ajuda/categoria/scheduling",
    "comparativos": "/ajuda/categoria/ai-agent",
    "nichos": "/ajuda",
};
var PRODUCT_PROOF_LIBRARY = {
    "ia-whatsapp": [
        "Configuracao de agente IA com respostas em linguagem natural dentro do AgenteZap.",
        "Automacao 24/7 integrada ao WhatsApp, com historico e contexto por conversa.",
        "Central de ajuda publica que documenta configuracao do agente e operacao do produto.",
    ],
    "automacao-whatsapp": [
        "Modulo de follow-up automatico e automacoes por status dentro da plataforma.",
        "Fila de mensagens e envio controlado para reduzir bursts e manter previsibilidade operacional.",
        "Painel de campanhas e notificacoes que aciona fluxos com base no estado da conversa.",
    ],
    "crm-whatsapp": [
        "Etiquetas, funil, contatos sincronizados e Kanban no mesmo sistema do atendimento.",
        "Campos personalizados para capturar contexto comercial sem sair do WhatsApp.",
        "Historico de conversa e CRM compartilhado para equipe comercial.",
    ],
    "agendamento-whatsapp": [
        "Modulo de agendamentos com profissionais, servicos e excecoes de horario.",
        "Lembretes e confirmacoes automaticas por WhatsApp.",
        "Fluxos de agendamento integrados ao atendimento do mesmo numero.",
    ],
    "follow-up": [
        "Reengajamento automatico para conversas abandonadas e leads mornos.",
        "Timers pendentes restaurados automaticamente quando o servidor reinicia.",
        "Controle de pausar e reativar agente por conversa para nao atropelar atendimento humano.",
    ],
    "comparativos": [
        "Mesmo produto cobre agente IA, CRM, automacao e campanhas no mesmo fluxo.",
        "Painel unico para equipe, contatos e historico evita operacao quebrada em varias ferramentas.",
        "Documentacao publica e fluxos do sistema ajudam a provar o que ja existe de forma verificavel.",
    ],
    "nichos": [
        "O produto ja atende cenarios com agendamento, CRM, envio em massa e follow-up no mesmo stack.",
        "As configuracoes por nicho podem reaproveitar respostas, etiquetas, servicos e lembretes.",
        "O fluxo do cliente fica no mesmo WhatsApp usado pelo time e pelo agente IA.",
    ],
};
var ensureBlogInfrastructurePromise = null;
function normalizeWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
}
function slugify(value) {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function stripHtml(value) {
    return normalizeWhitespace(value.replace(/<[^>]+>/g, " "));
}
function xmlEscape(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
function toIsoDate(date) {
    if (date === void 0) { date = new Date(); }
    return date.toISOString().split("T")[0];
}
function toDate(value) {
    if (!value)
        return null;
    return value instanceof Date ? value : new Date(value);
}
function parseBoolean(value, defaultValue) {
    if (value == null)
        return defaultValue;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
function extractJsonObject(raw) {
    var match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
        throw new Error("Resposta do Mistral nao trouxe JSON valido");
    }
    return JSON.parse(match[0]);
}
function readingTimeFromText(text) {
    var words = stripHtml(text).split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 190));
}
function similarityScore(a, b) {
    var tokensA = new Set(stripHtml(a).toLowerCase().split(/\s+/).filter(function (item) { return item.length > 3; }));
    var tokensB = new Set(stripHtml(b).toLowerCase().split(/\s+/).filter(function (item) { return item.length > 3; }));
    if (tokensA.size === 0 || tokensB.size === 0)
        return 0;
    var intersection = 0;
    for (var _i = 0, tokensA_1 = tokensA; _i < tokensA_1.length; _i++) {
        var token = tokensA_1[_i];
        if (tokensB.has(token))
            intersection += 1;
    }
    var union = new Set(__spreadArray(__spreadArray([], tokensA, true), tokensB, true)).size;
    return union === 0 ? 0 : intersection / union;
}
function getHelpLinkForCategory(categorySlug) {
    return HELP_CATEGORY_LINKS[categorySlug] || "/ajuda";
}
function getClusterProofs(cluster) {
    return PRODUCT_PROOF_LIBRARY[cluster] || PRODUCT_PROOF_LIBRARY["comparativos"];
}
function getFirstPartyDiscoverySeeds() {
    var helpSeeds = routes_public_help_1.HELP_CATEGORIES_META.slice(0, 8).map(function (category) { return ({
        keyword: "como usar ".concat(category.title.toLowerCase(), " no whatsapp"),
        title: "".concat(category.title, ": como aplicar no atendimento pelo WhatsApp"),
        cluster: "ia-whatsapp",
        category: "ia-whatsapp",
        intent: "informational",
        funnel: "mofu",
    }); });
    return __spreadArray(__spreadArray([], DISCOVERY_SEEDS, true), helpSeeds, true);
}
function resolveBlogConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var values, envJson;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.storage.getSystemConfigs(__spreadArray([], BLOG_SYSTEM_CONFIG_KEYS, true))];
                case 1:
                    values = _a.sent();
                    envJson = process.env.BLOG_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || null;
                    return [2 /*return*/, {
                            baseUrl: values.get("blog_base_url") || process.env.BLOG_BASE_URL || DEFAULT_BASE_URL,
                            brandName: values.get("blog_brand_name") || process.env.BLOG_BRAND_NAME || "AgenteZap",
                            authorName: values.get("blog_author_name") || process.env.BLOG_AUTHOR_NAME || "Editorial AgenteZap",
                            authorRole: values.get("blog_author_role") || process.env.BLOG_AUTHOR_ROLE || "Time de produto",
                            authorUrl: values.get("blog_author_url") || process.env.BLOG_AUTHOR_URL || DEFAULT_BASE_URL,
                            textModel: values.get("blog_mistral_text_model") || process.env.BLOG_MISTRAL_TEXT_MODEL || "mistral-medium-latest",
                            searchConsoleSiteUrl: values.get("blog_search_console_site_url") || process.env.BLOG_SEARCH_CONSOLE_SITE_URL || DEFAULT_BASE_URL,
                            serviceAccountJson: values.get("blog_search_console_service_account_json") || envJson,
                            serviceAccountClientEmail: values.get("blog_search_console_client_email") || process.env.BLOG_SEARCH_CONSOLE_CLIENT_EMAIL || null,
                            serviceAccountPrivateKey: values.get("blog_search_console_private_key") || process.env.BLOG_SEARCH_CONSOLE_PRIVATE_KEY || null,
                            hfApiToken: values.get("blog_hf_api_token") || process.env.HF_TOKEN || null,
                            hfImageModel: values.get("blog_hf_image_model") || process.env.BLOG_HF_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell",
                            publishEnabled: parseBoolean(values.get("blog_publish_enabled") || process.env.BLOG_PUBLISH_ENABLED, true),
                            discoveryEnabled: parseBoolean(values.get("blog_discovery_enabled") || process.env.BLOG_DISCOVERY_ENABLED, true),
                            refreshEnabled: parseBoolean(values.get("blog_refresh_enabled") || process.env.BLOG_REFRESH_ENABLED, true),
                        }];
            }
        });
    });
}
function ensureBlogAssetDir() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, promises_1.default.mkdir(BLOG_ASSET_DIR, { recursive: true })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function resolveSearchConsoleClient(config) {
    return __awaiter(this, void 0, void 0, function () {
        var credentials, parsed, auth;
        return __generator(this, function (_a) {
            try {
                credentials = void 0;
                if (config.serviceAccountJson) {
                    parsed = JSON.parse(config.serviceAccountJson);
                    credentials = {
                        client_email: parsed.client_email,
                        private_key: typeof parsed.private_key === "string"
                            ? parsed.private_key.replace(/\\n/g, "\n")
                            : parsed.private_key,
                    };
                }
                else if (config.serviceAccountClientEmail && config.serviceAccountPrivateKey) {
                    credentials = {
                        client_email: config.serviceAccountClientEmail,
                        private_key: config.serviceAccountPrivateKey.replace(/\\n/g, "\n"),
                    };
                }
                if (!(credentials === null || credentials === void 0 ? void 0 : credentials.client_email) || !credentials.private_key || !config.searchConsoleSiteUrl) {
                    return [2 /*return*/, null];
                }
                auth = new googleapis_1.google.auth.GoogleAuth({
                    credentials: credentials,
                    scopes: [
                        "https://www.googleapis.com/auth/webmasters",
                        "https://www.googleapis.com/auth/webmasters.readonly",
                    ],
                });
                return [2 /*return*/, {
                        client: googleapis_1.google.searchconsole({ version: "v1", auth: auth }),
                        siteUrl: config.searchConsoleSiteUrl,
                    }];
            }
            catch (error) {
                console.error("[BLOG] Falha ao resolver Search Console:", error);
                return [2 /*return*/, null];
            }
            return [2 /*return*/];
        });
    });
}
function createGenerationJob(jobType, topicId, postId) {
    return __awaiter(this, void 0, void 0, function () {
        var job;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db.insert(schema_1.blogGenerationJobs).values({
                        jobType: jobType,
                        topicId: topicId || null,
                        postId: postId || null,
                        status: "running",
                        startedAt: new Date(),
                        provider: "mistral",
                    }).returning()];
                case 1:
                    job = (_a.sent())[0];
                    return [2 /*return*/, job];
            }
        });
    });
}
function finishGenerationJob(jobId, status, payload, errorMessage) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db.update(schema_1.blogGenerationJobs)
                        .set({
                        status: status,
                        responsePayload: payload,
                        errorMessage: errorMessage || null,
                        completedAt: new Date(),
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.blogGenerationJobs.id, jobId))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function createPublishJob(postId, payload) {
    return __awaiter(this, void 0, void 0, function () {
        var job;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db.insert(schema_1.blogPublishJobs).values({
                        postId: postId,
                        jobType: "publish",
                        status: "queued",
                        payload: payload,
                    }).returning()];
                case 1:
                    job = (_a.sent())[0];
                    return [2 /*return*/, job];
            }
        });
    });
}
function finishPublishJob(jobId, status, payload, errorMessage) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db.update(schema_1.blogPublishJobs)
                        .set({
                        status: status,
                        payload: payload,
                        errorMessage: errorMessage || null,
                        executedAt: new Date(),
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.blogPublishJobs.id, jobId))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function buildBriefFromCandidate(candidate) {
    return {
        titleHint: candidate.title,
        keywordPrimary: candidate.keyword,
        keywordsSecondary: [
            "".concat(candidate.keyword, " no brasil"),
            "como implementar ".concat(candidate.keyword),
            "software para ".concat(candidate.keyword),
        ],
        cluster: candidate.cluster,
        categorySlug: candidate.category,
        intent: candidate.intent,
        funnelStage: candidate.funnel,
        audience: "donos de negocio, operacao comercial e atendimento que dependem do WhatsApp",
        problem: "Entender como ".concat(candidate.keyword, " pode gerar atendimento util, captacao e conversao sem criar operacao manual demais."),
        ctaUrl: "/cadastro",
        ctaLabel: "Criar conta gratis",
        internalProofs: getClusterProofs(candidate.cluster),
        sourceSummary: candidate.sourceSummary,
    };
}
function fallbackDraftFromBrief(brief) {
    return {
        title: brief.titleHint,
        excerpt: "Veja como ".concat(brief.keywordPrimary, " pode ajudar a organizar atendimento, vendas e follow-up no WhatsApp sem criar uma operacao quebrada."),
        metaTitle: "".concat(brief.titleHint, " | AgenteZap"),
        metaDescription: "Guia pratico sobre ".concat(brief.keywordPrimary, ", com foco em operacao, automacao e conversao no WhatsApp usando o AgenteZap."),
        categorySlug: brief.categorySlug,
        tags: [brief.cluster, "whatsapp", "ia"],
        cluster: brief.cluster,
        intent: brief.intent,
        funnelStage: brief.funnelStage,
        keywordPrimary: brief.keywordPrimary,
        keywordsSecondary: brief.keywordsSecondary,
        imagePrompt: "Ilustracao editorial clean sobre ".concat(brief.keywordPrimary, ", smartphone com interface de conversa, atmosfera profissional, sem texto grande na arte."),
        internalProofs: brief.internalProofs.slice(0, 3),
        sections: [
            {
                heading: "Onde essa busca costuma travar",
                paragraphs: [
                    "Quem procura ".concat(brief.keywordPrimary, " normalmente ja percebeu que responder no WhatsApp de forma manual nao escala bem quando o volume cresce."),
                    "O problema nao e apenas responder rapido. O problema e manter contexto, registrar dados, disparar follow-up e mover a conversa para uma proxima etapa real do funil.",
                ],
            },
            {
                heading: "Como estruturar sem cair em promessas vazias",
                paragraphs: [
                    "A melhor estrutura combina automacao util, historico de atendimento, regras claras de transbordo humano e uma camada de CRM que permita acompanhar o que cada contato ja pediu.",
                    "Quando o time consegue operar no mesmo fluxo do WhatsApp, o sistema deixa de ser so um bot e passa a virar uma operacao comercial repetivel.",
                ],
                proof: brief.internalProofs.slice(0, 2),
            },
            {
                heading: "O que observar na pratica",
                paragraphs: [
                    "Antes de publicar fluxos em massa, valide perguntas recorrentes, pontos de abandono e momentos em que o atendimento humano precisa assumir.",
                    "Tambem vale medir tempo de resposta, quantidade de conversas sem retorno e quantos leads ficam sem follow-up depois do primeiro interesse.",
                ],
                bullets: [
                    "Centralizar historico e dados do contato.",
                    "Garantir pelo menos um caminho claro para o humano entrar.",
                    "Criar CTA objetivo para cadastro, demonstracao ou contato comercial.",
                ],
            },
        ],
        faq: [
            {
                question: "Vale a pena usar ".concat(brief.keywordPrimary, "?"),
                answer: "Vale quando a operacao precisa responder mais rapido, registrar contexto e evitar perda de leads entre atendimento e follow-up.",
            },
            {
                question: "Como comecar sem publicar conteudo vazio?",
                answer: "Comece por uma pauta ligada a um problema real do seu cliente e inclua exemplos, fluxos e ativos do proprio produto.",
            },
        ],
        ctaLabel: brief.ctaLabel,
        ctaUrl: brief.ctaUrl,
    };
}
function generateDraftWithMistral(brief, config) {
    return __awaiter(this, void 0, void 0, function () {
        var prompt, userMessage, response, raw, parsed, normalized;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    prompt = "\nVoc\u00EA escreve artigos de blog SEO para a marca ".concat(config.brandName, ".\n\nObjetivo:\n- responder a busca principal com clareza\n- manter tom pragmatico, tecnico e comercial\n- focar em WhatsApp, IA, CRM, automacao e operacao real\n- evitar fluff, jargao vazio e promessas absolutas\n- incluir provas do proprio produto, nao copiar SERP\n\nRegras:\n- idioma: pt-BR\n- nao use markdown\n- nao invente dados numericos, clientes ou estudos de caso\n- inclua pelo menos 2 provas internas do produto\n- crie 3 a 5 secoes\n- gere 2 a 4 FAQ reais\n- CTA final apontando para ").concat(brief.ctaUrl, "\n- retorne apenas JSON valido\n\nJSON esperado:\n{\n  \"title\": \"string\",\n  \"excerpt\": \"string\",\n  \"metaTitle\": \"string\",\n  \"metaDescription\": \"string\",\n  \"categorySlug\": \"string\",\n  \"tags\": [\"string\"],\n  \"cluster\": \"string\",\n  \"intent\": \"commercial|informational\",\n  \"funnelStage\": \"tofu|mofu|bofu\",\n  \"keywordPrimary\": \"string\",\n  \"keywordsSecondary\": [\"string\"],\n  \"imagePrompt\": \"string\",\n  \"internalProofs\": [\"string\"],\n  \"sections\": [\n    {\n      \"heading\": \"string\",\n      \"paragraphs\": [\"string\"],\n      \"bullets\": [\"string\"],\n      \"proof\": [\"string\"]\n    }\n  ],\n  \"faq\": [\n    { \"question\": \"string\", \"answer\": \"string\" }\n  ],\n  \"ctaLabel\": \"string\",\n  \"ctaUrl\": \"string\"\n}\n");
                    userMessage = "\nBrief:\n- keyword principal: ".concat(brief.keywordPrimary, "\n- titulo sugerido: ").concat(brief.titleHint, "\n- cluster: ").concat(brief.cluster, "\n- categoria: ").concat(brief.categorySlug, "\n- intencao: ").concat(brief.intent, "\n- funil: ").concat(brief.funnelStage, "\n- publico: ").concat(brief.audience, "\n- problema: ").concat(brief.problem, "\n- CTA: ").concat(brief.ctaLabel, " -> ").concat(brief.ctaUrl, "\n- provas internas obrigatorias:\n").concat(brief.internalProofs.map(function (proof) { return "  - ".concat(proof); }).join("\n"), "\n- contexto da pauta:\n").concat(brief.sourceSummary, "\n");
                    return [4 /*yield*/, (0, llm_1.chatComplete)({
                            model: config.textModel,
                            messages: [
                                { role: "system", content: prompt },
                                { role: "user", content: userMessage },
                            ],
                            maxTokens: 2200,
                            temperature: 0.45,
                        })];
                case 1:
                    response = _d.sent();
                    raw = String(((_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || "").trim();
                    parsed = extractJsonObject(raw);
                    normalized = parsed;
                    normalized.categorySlug = slugify(normalized.categorySlug || brief.categorySlug);
                    normalized.cluster = slugify(normalized.cluster || brief.cluster);
                    normalized.intent = normalized.intent || brief.intent;
                    normalized.funnelStage = normalized.funnelStage || brief.funnelStage;
                    normalized.keywordPrimary = normalizeWhitespace(normalized.keywordPrimary || brief.keywordPrimary);
                    normalized.keywordsSecondary = Array.isArray(normalized.keywordsSecondary) ? normalized.keywordsSecondary.slice(0, 6) : brief.keywordsSecondary;
                    normalized.tags = Array.isArray(normalized.tags) ? normalized.tags.map(function (item) { return slugify(String(item)); }).filter(Boolean).slice(0, 8) : [brief.cluster];
                    normalized.internalProofs = Array.isArray(normalized.internalProofs) ? normalized.internalProofs.filter(Boolean) : brief.internalProofs.slice(0, 3);
                    normalized.sections = Array.isArray(normalized.sections) ? normalized.sections.filter(Boolean) : [];
                    normalized.faq = Array.isArray(normalized.faq) ? normalized.faq.filter(Boolean) : [];
                    normalized.ctaLabel = normalized.ctaLabel || brief.ctaLabel;
                    normalized.ctaUrl = normalized.ctaUrl || brief.ctaUrl;
                    return [2 /*return*/, normalized];
            }
        });
    });
}
function buildInternalLinks(_baseUrl, draft, existingPosts) {
    var sameCluster = existingPosts
        .filter(function (post) { return post.cluster === draft.cluster; })
        .slice(0, 2)
        .map(function (post) { return ({
        href: "/blog/".concat(post.slug),
        label: post.title,
        kind: "blog",
    }); });
    var sameCategory = existingPosts
        .filter(function (post) { return post.categorySlug === draft.categorySlug && post.cluster !== draft.cluster; })
        .slice(0, 1)
        .map(function (post) { return ({
        href: "/blog/".concat(post.slug),
        label: post.title,
        kind: "blog",
    }); });
    var links = __spreadArray(__spreadArray(__spreadArray([], sameCluster, true), sameCategory, true), [
        {
            href: getHelpLinkForCategory(draft.categorySlug),
            label: "Central de ajuda relacionada",
            kind: "help",
        },
        {
            href: "/blog",
            label: "Ver todos os artigos do blog",
            kind: "home",
        },
        {
            href: draft.ctaUrl || "/cadastro",
            label: draft.ctaLabel || "Criar conta gratis",
            kind: "cta",
        },
    ], false);
    var unique = new Map();
    for (var _i = 0, links_1 = links; _i < links_1.length; _i++) {
        var link = links_1[_i];
        unique.set(link.href, link);
    }
    return Array.from(unique.values()).slice(0, 6);
}
function renderBodyHtml(draft, internalLinks) {
    var parts = [];
    for (var _i = 0, _a = draft.sections; _i < _a.length; _i++) {
        var section = _a[_i];
        parts.push("<section class=\"blog-section\">");
        parts.push("<h2>".concat(escapeHtml(section.heading), "</h2>"));
        for (var _b = 0, _c = section.paragraphs || []; _b < _c.length; _b++) {
            var paragraph = _c[_b];
            parts.push("<p>".concat(escapeHtml(paragraph), "</p>"));
        }
        if (section.proof && section.proof.length > 0) {
            parts.push("<div class=\"blog-proof\"><strong>Provas do produto</strong><ul>");
            for (var _d = 0, _e = section.proof; _d < _e.length; _d++) {
                var proof = _e[_d];
                parts.push("<li>".concat(escapeHtml(proof), "</li>"));
            }
            parts.push("</ul></div>");
        }
        if (section.bullets && section.bullets.length > 0) {
            parts.push("<ul>");
            for (var _f = 0, _g = section.bullets; _f < _g.length; _f++) {
                var bullet = _g[_f];
                parts.push("<li>".concat(escapeHtml(bullet), "</li>"));
            }
            parts.push("</ul>");
        }
        parts.push("</section>");
    }
    parts.push("<section class=\"blog-section blog-links\"><h2>Leituras e proximos passos</h2><ul>");
    for (var _h = 0, internalLinks_1 = internalLinks; _h < internalLinks_1.length; _h++) {
        var link = internalLinks_1[_h];
        parts.push("<li><a href=\"".concat(escapeHtml(link.href), "\">").concat(escapeHtml(link.label), "</a></li>"));
    }
    parts.push("</ul></section>");
    parts.push("<section class=\"blog-cta\"><h2>Quer aplicar isso no seu WhatsApp?</h2><p>O AgenteZap junta agente IA, CRM, automacao e operacao em um unico fluxo.</p><a class=\"cta-button\" href=\"".concat(escapeHtml(draft.ctaUrl || "/cadastro"), "\">").concat(escapeHtml(draft.ctaLabel || "Criar conta gratis"), "</a></section>"));
    return parts.join("");
}
function buildArticleJsonLd(post, config, faq) {
    var _a, _b;
    var canonicalUrl = post.canonicalUrl;
    var payload = [
        {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.metaDescription,
            datePublished: ((_a = toDate(post.publishedAt)) === null || _a === void 0 ? void 0 : _a.toISOString()) || new Date().toISOString(),
            dateModified: ((_b = toDate(post.updatedAt)) === null || _b === void 0 ? void 0 : _b.toISOString()) || new Date().toISOString(),
            author: {
                "@type": "Person",
                name: config.authorName,
                url: config.authorUrl,
                jobTitle: config.authorRole,
            },
            publisher: {
                "@type": "Organization",
                name: config.brandName,
                url: config.baseUrl,
            },
            mainEntityOfPage: canonicalUrl,
            image: post.heroImageUrl ? [new URL(post.heroImageUrl, config.baseUrl).toString()] : undefined,
        },
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
                { "@type": "ListItem", position: 1, name: "Blog", item: "".concat(config.baseUrl, "/blog") },
                { "@type": "ListItem", position: 2, name: post.title, item: canonicalUrl },
            ],
        },
    ];
    if (faq.length > 0) {
        payload.push({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map(function (item) { return ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: {
                    "@type": "Answer",
                    text: item.answer,
                },
            }); }),
        });
    }
    return payload;
}
function countUnsupportedClaims(text) {
    var normalized = stripHtml(text).toLowerCase();
    var patterns = [
        /\b100%\b/g,
        /\bgarantia absoluta\b/g,
        /\bsem nenhum humano\b/g,
        /\bresultado imediato\b/g,
        /\bviralizar instantaneamente\b/g,
    ];
    return patterns.reduce(function (total, pattern) { var _a; return total + (((_a = normalized.match(pattern)) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0);
}
function evaluateQualityGate(draft, bodyHtml, internalLinks, existingPosts) {
    var combinedText = "".concat(draft.title, "\n").concat(draft.excerpt, "\n").concat(bodyHtml);
    var duplicateSimilarity = existingPosts.reduce(function (max, post) {
        return Math.max(max, similarityScore(combinedText, "".concat(post.title, "\n").concat(post.excerpt, "\n").concat(post.bodyHtml)));
    }, 0);
    var unsupportedClaims = countUnsupportedClaims(combinedText);
    var wordCount = stripHtml(combinedText).split(/\s+/).filter(Boolean).length;
    var notes = [];
    var qualityScore = 40;
    if (wordCount >= 900)
        qualityScore += 15;
    if (draft.sections.length >= 3)
        qualityScore += 10;
    if (draft.faq.length >= 2)
        qualityScore += 10;
    if (draft.internalProofs.length >= 2)
        qualityScore += 15;
    if (internalLinks.length >= 4)
        qualityScore += 5;
    qualityScore += Math.max(0, Math.round((1 - duplicateSimilarity) * 10));
    qualityScore -= unsupportedClaims * 10;
    if (draft.internalProofs.length < 2)
        notes.push("Faltam provas internas suficientes");
    if (internalLinks.length < 4)
        notes.push("Links internos insuficientes");
    if (duplicateSimilarity > 0.72)
        notes.push("Similaridade alta com acervo existente");
    if (unsupportedClaims > 0)
        notes.push("Texto contem claims agressivos");
    return {
        qualityScore: qualityScore,
        duplicateSimilarity: duplicateSimilarity,
        internalProofCount: draft.internalProofs.length,
        requiredInternalLinks: internalLinks.length,
        unsupportedClaims: unsupportedClaims,
        passed: qualityScore >= 85 && draft.internalProofs.length >= 2 && internalLinks.length >= 4 && duplicateSimilarity <= 0.72 && unsupportedClaims === 0,
        notes: notes,
    };
}
function buildVisualPrompt(post) {
    var body = typeof post.bodyJson === "object" && post.bodyJson
        ? post.bodyJson
        : {};
    var imagePrompt = typeof body.imagePrompt === "string" ? body.imagePrompt : post.imagePrompt;
    if (imagePrompt)
        return imagePrompt;
    return "Editorial illustration about ".concat(post.keywordPrimary, ", smartphone with WhatsApp-like conversation, professional business setting, clean composition, subtle teal accents, no large text overlay.");
}
function buildTemplatedSvg(post, config) {
    var category = post.categorySlug.replace(/-/g, " ");
    var title = post.title.length > 88 ? "".concat(post.title.slice(0, 85), "...") : post.title;
    var brand = config.brandName;
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1200\" height=\"630\" viewBox=\"0 0 1200 630\" role=\"img\" aria-labelledby=\"title desc\">\n  <title id=\"title\">".concat(escapeHtml(post.title), "</title>\n  <desc id=\"desc\">").concat(escapeHtml(post.excerpt), "</desc>\n  <defs>\n    <linearGradient id=\"bg\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"100%\">\n      <stop offset=\"0%\" stop-color=\"#0f172a\"/>\n      <stop offset=\"50%\" stop-color=\"#115e59\"/>\n      <stop offset=\"100%\" stop-color=\"#022c22\"/>\n    </linearGradient>\n  </defs>\n  <rect width=\"1200\" height=\"630\" fill=\"url(#bg)\"/>\n  <circle cx=\"1020\" cy=\"100\" r=\"140\" fill=\"rgba(255,255,255,0.08)\"/>\n  <circle cx=\"110\" cy=\"520\" r=\"180\" fill=\"rgba(20,184,166,0.16)\"/>\n  <rect x=\"84\" y=\"88\" width=\"1032\" height=\"454\" rx=\"32\" fill=\"rgba(255,255,255,0.08)\" stroke=\"rgba(255,255,255,0.14)\"/>\n  <text x=\"120\" y=\"150\" fill=\"#99f6e4\" font-family=\"Arial, sans-serif\" font-size=\"28\" font-weight=\"700\">").concat(escapeHtml(category.toUpperCase()), "</text>\n  <text x=\"120\" y=\"230\" fill=\"#ffffff\" font-family=\"Arial, sans-serif\" font-size=\"54\" font-weight=\"700\">\n    <tspan x=\"120\" dy=\"0\">").concat(escapeHtml(title.slice(0, 34)), "</tspan>\n    <tspan x=\"120\" dy=\"68\">").concat(escapeHtml(title.slice(34, 68)), "</tspan>\n    <tspan x=\"120\" dy=\"68\">").concat(escapeHtml(title.slice(68, 102)), "</tspan>\n  </text>\n  <text x=\"120\" y=\"482\" fill=\"#d1fae5\" font-family=\"Arial, sans-serif\" font-size=\"28\">").concat(escapeHtml(brand), " \u2022 Blog</text>\n  <text x=\"120\" y=\"524\" fill=\"#ccfbf1\" font-family=\"Arial, sans-serif\" font-size=\"24\">").concat(escapeHtml(post.keywordPrimary), "</text>\n</svg>");
}
function saveImageAsset(post, payload) {
    return __awaiter(this, void 0, void 0, function () {
        var filePath, publicUrl, asset;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureBlogAssetDir()];
                case 1:
                    _a.sent();
                    filePath = path_1.default.join(BLOG_ASSET_DIR, payload.fileName);
                    return [4 /*yield*/, promises_1.default.writeFile(filePath, payload.content)];
                case 2:
                    _a.sent();
                    publicUrl = "/uploads/blog-assets/".concat(payload.fileName);
                    return [4 /*yield*/, db_1.db.insert(schema_1.blogAssetImages).values({
                            provider: payload.provider,
                            model: payload.model,
                            prompt: payload.prompt,
                            altText: payload.altText,
                            mimeType: payload.mimeType,
                            filePath: filePath,
                            publicUrl: publicUrl,
                            sourceProvenance: payload.sourceProvenance,
                            metadata: {},
                        }).returning()];
                case 3:
                    asset = (_a.sent())[0];
                    return [2 /*return*/, asset];
            }
        });
    });
}
function downloadMistralFile(fileId) {
    return __awaiter(this, void 0, void 0, function () {
        var mistral, stream, arrayBuffer;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, mistralClient_1.getMistralClient)()];
                case 1:
                    mistral = _a.sent();
                    return [4 /*yield*/, mistral.files.download({ fileId: fileId })];
                case 2:
                    stream = _a.sent();
                    return [4 /*yield*/, new Response(stream).arrayBuffer()];
                case 3:
                    arrayBuffer = _a.sent();
                    return [2 /*return*/, Buffer.from(arrayBuffer)];
            }
        });
    });
}
function extractToolFileFromConversation(output) {
    if (!Array.isArray(output))
        return null;
    for (var _i = 0, _a = output; _i < _a.length; _i++) {
        var entry = _a[_i];
        var content = entry === null || entry === void 0 ? void 0 : entry.content;
        if (!Array.isArray(content))
            continue;
        for (var _b = 0, _c = content; _b < _c.length; _b++) {
            var chunk = _c[_b];
            if ((chunk === null || chunk === void 0 ? void 0 : chunk.type) === "tool_file" && (chunk === null || chunk === void 0 ? void 0 : chunk.tool) === "image_generation" && typeof chunk.fileId === "string") {
                return {
                    fileId: chunk.fileId,
                    fileName: typeof chunk.fileName === "string" ? chunk.fileName : null,
                    fileType: typeof chunk.fileType === "string" ? chunk.fileType : null,
                };
            }
            if ((chunk === null || chunk === void 0 ? void 0 : chunk.type) === "tool_file" && (chunk === null || chunk === void 0 ? void 0 : chunk.tool) === "image_generation" && typeof chunk.file_id === "string") {
                return {
                    fileId: String(chunk.file_id),
                    fileName: typeof chunk.file_name === "string" ? chunk.file_name : null,
                    fileType: typeof chunk.file_type === "string" ? chunk.file_type : null,
                };
            }
        }
    }
    return null;
}
function generateImageWithMistral(post, config) {
    return __awaiter(this, void 0, void 0, function () {
        var mistral, visualPrompt, response, toolFile, binary, extension, error_1;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 6, , 7]);
                    return [4 /*yield*/, (0, mistralClient_1.resolveApiKey)()];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, (0, mistralClient_1.getMistralClient)()];
                case 2:
                    mistral = _c.sent();
                    visualPrompt = buildVisualPrompt(post);
                    return [4 /*yield*/, mistral.beta.conversations.start({
                            model: config.textModel,
                            tools: [{ type: "image_generation" }],
                            completionArgs: {
                                toolChoice: "required",
                                temperature: 0.2,
                            },
                            inputs: [
                                {
                                    role: "user",
                                    content: "Create one editorial hero image for a blog article. ".concat(visualPrompt),
                                },
                            ],
                            store: false,
                        })];
                case 3:
                    response = _c.sent();
                    toolFile = extractToolFileFromConversation(response.outputs);
                    if (!(toolFile === null || toolFile === void 0 ? void 0 : toolFile.fileId)) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, downloadMistralFile(toolFile.fileId)];
                case 4:
                    binary = _c.sent();
                    extension = ((_a = toolFile.fileType) === null || _a === void 0 ? void 0 : _a.includes("jpeg"))
                        ? "jpg"
                        : ((_b = toolFile.fileType) === null || _b === void 0 ? void 0 : _b.includes("webp"))
                            ? "webp"
                            : "png";
                    return [4 /*yield*/, saveImageAsset(post, {
                            provider: "mistral",
                            model: config.textModel,
                            prompt: visualPrompt,
                            mimeType: toolFile.fileType || "image/png",
                            fileName: "".concat(post.slug, "-").concat(crypto_1.default.randomUUID(), ".").concat(extension),
                            content: binary,
                            altText: post.heroImageAlt || "Imagem editorial do artigo ".concat(post.title),
                            sourceProvenance: { fileId: toolFile.fileId, via: "mistral.beta.conversations.start" },
                        })];
                case 5: return [2 /*return*/, _c.sent()];
                case 6:
                    error_1 = _c.sent();
                    console.error("[BLOG] Falha ao gerar imagem com Mistral:", error_1);
                    return [2 /*return*/, null];
                case 7: return [2 /*return*/];
            }
        });
    });
}
function generateImageWithHuggingFace(post, config) {
    return __awaiter(this, void 0, void 0, function () {
        var prompt_1, response, mimeType, binary, _a, _b, extension, error_2;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!config.hfApiToken || !config.hfImageModel) {
                        return [2 /*return*/, null];
                    }
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 5, , 6]);
                    prompt_1 = buildVisualPrompt(post);
                    return [4 /*yield*/, fetch("https://api-inference.huggingface.co/models/".concat(config.hfImageModel), {
                            method: "POST",
                            headers: {
                                Authorization: "Bearer ".concat(config.hfApiToken),
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ inputs: prompt_1 }),
                        })];
                case 2:
                    response = _c.sent();
                    if (!response.ok) {
                        return [2 /*return*/, null];
                    }
                    mimeType = response.headers.get("content-type") || "image/png";
                    _b = (_a = Buffer).from;
                    return [4 /*yield*/, response.arrayBuffer()];
                case 3:
                    binary = _b.apply(_a, [_c.sent()]);
                    extension = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
                    return [4 /*yield*/, saveImageAsset(post, {
                            provider: "huggingface",
                            model: config.hfImageModel,
                            prompt: prompt_1,
                            mimeType: mimeType,
                            fileName: "".concat(post.slug, "-").concat(crypto_1.default.randomUUID(), ".").concat(extension),
                            content: binary,
                            altText: post.heroImageAlt || "Imagem editorial do artigo ".concat(post.title),
                            sourceProvenance: { model: config.hfImageModel, via: "huggingface-inference" },
                        })];
                case 4: return [2 /*return*/, _c.sent()];
                case 5:
                    error_2 = _c.sent();
                    console.error("[BLOG] Falha ao gerar imagem com Hugging Face:", error_2);
                    return [2 /*return*/, null];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function generateTemplatedImage(post, config) {
    return __awaiter(this, void 0, void 0, function () {
        var svg;
        return __generator(this, function (_a) {
            svg = buildTemplatedSvg(post, config);
            return [2 /*return*/, saveImageAsset(post, {
                    provider: "template",
                    model: null,
                    prompt: buildVisualPrompt(post),
                    mimeType: "image/svg+xml",
                    fileName: "".concat(post.slug, "-").concat(crypto_1.default.randomUUID(), ".svg"),
                    content: Buffer.from(svg, "utf8"),
                    altText: post.heroImageAlt || "Capa editorial do artigo ".concat(post.title),
                    sourceProvenance: { via: "local-template" },
                })];
        });
    });
}
function ensureHeroImage(post, config) {
    return __awaiter(this, void 0, void 0, function () {
        var existingImage, _a, mistralAsset, hfAsset;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!post.heroImageId) return [3 /*break*/, 2];
                    return [4 /*yield*/, db_1.db.select().from(schema_1.blogAssetImages).where((0, drizzle_orm_1.eq)(schema_1.blogAssetImages.id, post.heroImageId)).limit(1).then(function (rows) { return rows[0]; })];
                case 1:
                    _a = _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _a = null;
                    _b.label = 3;
                case 3:
                    existingImage = _a;
                    if (existingImage) {
                        return [2 /*return*/, existingImage];
                    }
                    return [4 /*yield*/, generateImageWithMistral(post, config)];
                case 4:
                    mistralAsset = _b.sent();
                    if (mistralAsset)
                        return [2 /*return*/, mistralAsset];
                    return [4 /*yield*/, generateImageWithHuggingFace(post, config)];
                case 5:
                    hfAsset = _b.sent();
                    if (hfAsset)
                        return [2 /*return*/, hfAsset];
                    return [2 /*return*/, generateTemplatedImage(post, config)];
            }
        });
    });
}
function mapPostSummary(post) {
    return {
        id: post.id,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        categorySlug: post.categorySlug,
        tags: Array.isArray(post.tags) ? post.tags : [],
        cluster: post.cluster,
        publishedAt: toDate(post.publishedAt),
        heroImageUrl: post.heroImageUrl || null,
        heroImageAlt: post.heroImageAlt || null,
        readingTimeMinutes: post.readingTimeMinutes,
    };
}
function normalizeFaq(faqJson) {
    if (!Array.isArray(faqJson))
        return [];
    return faqJson
        .map(function (item) { return ({
        question: String(item.question || "").trim(),
        answer: String(item.answer || "").trim(),
    }); })
        .filter(function (item) { return item.question && item.answer; });
}
function buildPublicStyles() {
    return "\n    :root { color-scheme: light; --bg: #f4f8f8; --panel: #ffffff; --ink: #122025; --muted: #4b6470; --line: #d7e4e6; --accent: #0f766e; --accent-ink: #ecfeff; --shadow: 0 24px 80px rgba(15, 23, 42, 0.08); }\n    * { box-sizing: border-box; }\n    body { margin: 0; font-family: Arial, sans-serif; background: linear-gradient(180deg, #f7fbfb 0%, var(--bg) 100%); color: var(--ink); line-height: 1.7; }\n    a { color: var(--accent); text-decoration: none; }\n    a:hover { text-decoration: underline; }\n    .shell { max-width: 1120px; margin: 0 auto; padding: 32px 20px 80px; }\n    .topbar { display: flex; gap: 16px; align-items: center; justify-content: space-between; margin-bottom: 32px; }\n    .brand { font-weight: 700; letter-spacing: 0.02em; color: var(--ink); }\n    .nav { display: flex; gap: 18px; font-size: 14px; }\n    .hero, .card, .article-shell, .faq-card { background: var(--panel); border: 1px solid var(--line); border-radius: 24px; box-shadow: var(--shadow); }\n    .hero { padding: 28px; margin-bottom: 28px; }\n    .hero h1 { margin: 0 0 12px; font-size: clamp(32px, 5vw, 52px); line-height: 1.05; }\n    .hero p { margin: 0; color: var(--muted); max-width: 760px; }\n    .grid { display: grid; gap: 20px; }\n    .grid.posts { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }\n    .card { padding: 22px; }\n    .card h2, .card h3 { margin-top: 0; line-height: 1.2; }\n    .eyebrow { display: inline-flex; padding: 6px 12px; border-radius: 999px; background: rgba(15, 118, 110, 0.12); color: var(--accent); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 14px; }\n    .meta { color: var(--muted); font-size: 14px; }\n    .article-shell { padding: 32px; }\n    .article-shell img { width: 100%; height: auto; border-radius: 20px; margin: 20px 0 28px; border: 1px solid var(--line); }\n    .article-shell h1 { margin: 0 0 12px; line-height: 1.08; font-size: clamp(32px, 4vw, 50px); }\n    .article-shell h2 { margin-top: 32px; line-height: 1.2; }\n    .article-shell p, .article-shell li { color: #1d3038; }\n    .article-shell ul { padding-left: 22px; }\n    .blog-proof, .blog-cta { padding: 18px 20px; border-radius: 20px; background: linear-gradient(135deg, rgba(15,118,110,0.08), rgba(20,184,166,0.04)); border: 1px solid rgba(15,118,110,0.14); margin-top: 16px; }\n    .cta-button { display: inline-block; margin-top: 12px; padding: 12px 18px; border-radius: 14px; background: var(--accent); color: var(--accent-ink); font-weight: 700; }\n    .pill-list { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; padding: 0; list-style: none; }\n    .pill-list a { display: inline-flex; padding: 8px 12px; border-radius: 999px; background: rgba(15, 118, 110, 0.08); color: var(--accent); font-size: 13px; }\n    footer { margin-top: 40px; color: var(--muted); font-size: 14px; }\n    @media (max-width: 720px) { .shell { padding: 20px 16px 56px; } .hero, .article-shell, .card { padding: 20px; border-radius: 20px; } .topbar { align-items: flex-start; flex-direction: column; } .nav { flex-wrap: wrap; } }\n  ";
}
function buildLayoutHtml(input) {
    var structuredData = input.structuredData ? "<script type=\"application/ld+json\">".concat(JSON.stringify(input.structuredData), "</script>") : "";
    var ogImage = input.ogImage ? new URL(input.ogImage, DEFAULT_BASE_URL).toString() : "".concat(DEFAULT_BASE_URL, "/uploads/blog-assets/default-blog.svg");
    return "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /><title>".concat(escapeHtml(input.title), "</title><meta name=\"description\" content=\"").concat(escapeHtml(input.description), "\" /><link rel=\"canonical\" href=\"").concat(escapeHtml(input.canonicalUrl), "\" /><meta property=\"og:title\" content=\"").concat(escapeHtml(input.title), "\" /><meta property=\"og:description\" content=\"").concat(escapeHtml(input.description), "\" /><meta property=\"og:type\" content=\"article\" /><meta property=\"og:url\" content=\"").concat(escapeHtml(input.canonicalUrl), "\" /><meta property=\"og:image\" content=\"").concat(escapeHtml(ogImage), "\" /><meta name=\"twitter:card\" content=\"summary_large_image\" /><style>").concat(buildPublicStyles(), "</style>").concat(structuredData, "</head><body>").concat(input.body, "</body></html>");
}
function getPublishedPostsFromDb() {
    return __awaiter(this, arguments, void 0, function (limit) {
        if (limit === void 0) { limit = 24; }
        return __generator(this, function (_a) {
            return [2 /*return*/, db_1.db.select().from(schema_1.blogPosts).where((0, drizzle_orm_1.eq)(schema_1.blogPosts.status, "published")).orderBy((0, drizzle_orm_1.desc)(schema_1.blogPosts.publishedAt), (0, drizzle_orm_1.desc)(schema_1.blogPosts.createdAt)).limit(limit)];
        });
    });
}
function syncSearchConsoleMetrics(config) {
    return __awaiter(this, void 0, void 0, function () {
        var sc, posts, endDate, startDate, response, rows, byUrl, _i, rows_1, row, pageUrl, synced, _a, posts_1, post, row;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, resolveSearchConsoleClient(config)];
                case 1:
                    sc = _c.sent();
                    if (!sc)
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, getPublishedPostsFromDb(150)];
                case 2:
                    posts = _c.sent();
                    if (posts.length === 0)
                        return [2 /*return*/, 0];
                    endDate = toIsoDate(new Date());
                    startDate = toIsoDate(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));
                    return [4 /*yield*/, sc.client.searchanalytics.query({
                            siteUrl: sc.siteUrl,
                            requestBody: {
                                startDate: startDate,
                                endDate: endDate,
                                dimensions: ["page"],
                                rowLimit: 250,
                                type: "web",
                            },
                        })];
                case 3:
                    response = _c.sent();
                    rows = response.data.rows || [];
                    byUrl = new Map();
                    for (_i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
                        row = rows_1[_i];
                        pageUrl = (_b = row.keys) === null || _b === void 0 ? void 0 : _b[0];
                        if (pageUrl)
                            byUrl.set(pageUrl, row);
                    }
                    synced = 0;
                    _a = 0, posts_1 = posts;
                    _c.label = 4;
                case 4:
                    if (!(_a < posts_1.length)) return [3 /*break*/, 7];
                    post = posts_1[_a];
                    row = byUrl.get(post.canonicalUrl);
                    if (!row)
                        return [3 /*break*/, 6];
                    return [4 /*yield*/, db_1.db.insert(schema_1.blogPostMetrics).values({
                            postId: post.id,
                            metricDate: endDate,
                            clicks: Math.round(row.clicks || 0),
                            impressions: Math.round(row.impressions || 0),
                            ctr: String(row.ctr || 0),
                            position: String(row.position || 0),
                            source: "search_console",
                            payload: row,
                        }).onConflictDoUpdate({
                            target: [schema_1.blogPostMetrics.postId, schema_1.blogPostMetrics.metricDate, schema_1.blogPostMetrics.source],
                            set: {
                                clicks: Math.round(row.clicks || 0),
                                impressions: Math.round(row.impressions || 0),
                                ctr: String(row.ctr || 0),
                                position: String(row.position || 0),
                                payload: row,
                            },
                        })];
                case 5:
                    _c.sent();
                    synced += 1;
                    _c.label = 6;
                case 6:
                    _a++;
                    return [3 /*break*/, 4];
                case 7: return [2 /*return*/, synced];
            }
        });
    });
}
function ensureBlogInfrastructure() {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            if (ensureBlogInfrastructurePromise)
                return [2 /*return*/, ensureBlogInfrastructurePromise];
            ensureBlogInfrastructurePromise = (function () { return __awaiter(_this, void 0, void 0, function () {
                var sqlFile, statements, _i, statements_1, statement;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, ensureBlogAssetDir()];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, promises_1.default.readFile(BLOG_MIGRATION_FILE, "utf8")];
                        case 2:
                            sqlFile = _a.sent();
                            statements = sqlFile.split(";").map(function (statement) { return statement.trim(); }).filter(Boolean);
                            _i = 0, statements_1 = statements;
                            _a.label = 3;
                        case 3:
                            if (!(_i < statements_1.length)) return [3 /*break*/, 6];
                            statement = statements_1[_i];
                            return [4 /*yield*/, db_1.db.execute(drizzle_orm_1.sql.raw(statement))];
                        case 4:
                            _a.sent();
                            _a.label = 5;
                        case 5:
                            _i++;
                            return [3 /*break*/, 3];
                        case 6: return [2 /*return*/];
                    }
                });
            }); })();
            return [2 /*return*/, ensureBlogInfrastructurePromise];
        });
    });
}
function discoverBlogTopics() {
    return __awaiter(this, arguments, void 0, function (limit) {
        var config, candidates, searchConsole, endDate, startDate, response, _i, _a, row, query, error_3, existingKeywordsRows, existingPostKeywords, existingKeywords, created, skipped, sortedCandidates, _b, sortedCandidates_1, candidate, keywordKey, brief;
        var _c;
        if (limit === void 0) { limit = 8; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, ensureBlogInfrastructure()];
                case 1:
                    _d.sent();
                    return [4 /*yield*/, resolveBlogConfig()];
                case 2:
                    config = _d.sent();
                    if (!config.discoveryEnabled)
                        return [2 /*return*/, { created: 0, skipped: 0 }];
                    candidates = getFirstPartyDiscoverySeeds().map(function (seed) { return ({
                        keyword: seed.keyword,
                        title: seed.title,
                        cluster: seed.cluster,
                        category: seed.category,
                        intent: seed.intent,
                        funnel: seed.funnel,
                        score: 60,
                        sourceSummary: "Seed editorial do proprio produto e da central de ajuda.",
                    }); });
                    return [4 /*yield*/, resolveSearchConsoleClient(config)];
                case 3:
                    searchConsole = _d.sent();
                    if (!searchConsole) return [3 /*break*/, 7];
                    _d.label = 4;
                case 4:
                    _d.trys.push([4, 6, , 7]);
                    endDate = toIsoDate(new Date());
                    startDate = toIsoDate(new Date(Date.now() - 28 * 24 * 60 * 60 * 1000));
                    return [4 /*yield*/, searchConsole.client.searchanalytics.query({
                            siteUrl: searchConsole.siteUrl,
                            requestBody: {
                                startDate: startDate,
                                endDate: endDate,
                                dimensions: ["query"],
                                rowLimit: 20,
                                type: "web",
                            },
                        })];
                case 5:
                    response = _d.sent();
                    for (_i = 0, _a = response.data.rows || []; _i < _a.length; _i++) {
                        row = _a[_i];
                        query = normalizeWhitespace(String(((_c = row.keys) === null || _c === void 0 ? void 0 : _c[0]) || ""));
                        if (!query)
                            continue;
                        if (!/(whatsapp|ia|automacao|atendimento|crm|agendamento|chatbot|agente)/i.test(query))
                            continue;
                        candidates.push({
                            keyword: query,
                            title: "Guia pratico sobre ".concat(query),
                            cluster: query.includes("agend") ? "agendamento-whatsapp" : query.includes("crm") ? "crm-whatsapp" : "ia-whatsapp",
                            category: query.includes("agend") ? "agendamento-whatsapp" : query.includes("crm") ? "crm-whatsapp" : "ia-whatsapp",
                            intent: "commercial",
                            funnel: (query.includes("melhor") || query.includes("preco") ? "bofu" : "mofu"),
                            score: Math.round((row.impressions || 0) + (row.clicks || 0) * 2),
                            sourceSummary: "Sinal vindo do Search Console: query \"".concat(query, "\" com ").concat(Math.round(row.impressions || 0), " impressoes."),
                        });
                    }
                    return [3 /*break*/, 7];
                case 6:
                    error_3 = _d.sent();
                    console.error("[BLOG] Falha ao consultar Search Console na descoberta:", error_3);
                    return [3 /*break*/, 7];
                case 7: return [4 /*yield*/, db_1.db.select({ keywordPrimary: schema_1.blogTopics.keywordPrimary }).from(schema_1.blogTopics)];
                case 8:
                    existingKeywordsRows = _d.sent();
                    return [4 /*yield*/, db_1.db.select({ keywordPrimary: schema_1.blogPosts.keywordPrimary }).from(schema_1.blogPosts)];
                case 9:
                    existingPostKeywords = _d.sent();
                    existingKeywords = new Set(__spreadArray(__spreadArray([], existingKeywordsRows.map(function (row) { return row.keywordPrimary.toLowerCase(); }), true), existingPostKeywords.map(function (row) { return row.keywordPrimary.toLowerCase(); }), true));
                    created = 0;
                    skipped = 0;
                    sortedCandidates = candidates.sort(function (a, b) { return b.score - a.score; }).slice(0, limit * 2);
                    _b = 0, sortedCandidates_1 = sortedCandidates;
                    _d.label = 10;
                case 10:
                    if (!(_b < sortedCandidates_1.length)) return [3 /*break*/, 13];
                    candidate = sortedCandidates_1[_b];
                    keywordKey = candidate.keyword.toLowerCase();
                    if (existingKeywords.has(keywordKey)) {
                        skipped += 1;
                        return [3 /*break*/, 12];
                    }
                    brief = buildBriefFromCandidate(candidate);
                    return [4 /*yield*/, db_1.db.insert(schema_1.blogTopics).values({
                            status: "pending",
                            titleHint: brief.titleHint,
                            keywordPrimary: brief.keywordPrimary,
                            keywordsSecondary: brief.keywordsSecondary,
                            cluster: brief.cluster,
                            categorySlug: brief.categorySlug,
                            intent: brief.intent,
                            funnelStage: brief.funnelStage,
                            sourceType: searchConsole && candidate.sourceSummary.includes("Search Console") ? "search_console" : "seed",
                            sourceData: { sourceSummary: brief.sourceSummary },
                            briefJson: brief,
                            score: candidate.score,
                        }).onConflictDoNothing({ target: schema_1.blogTopics.keywordPrimary })];
                case 11:
                    _d.sent();
                    existingKeywords.add(keywordKey);
                    created += 1;
                    if (created >= limit)
                        return [3 /*break*/, 13];
                    _d.label = 12;
                case 12:
                    _b++;
                    return [3 /*break*/, 10];
                case 13: return [2 /*return*/, { created: created, skipped: skipped }];
            }
        });
    });
}
function getTopicById(topicId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.blogTopics).where((0, drizzle_orm_1.eq)(schema_1.blogTopics.id, topicId)).limit(1)];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows[0]];
            }
        });
    });
}
function getPostById(postId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.blogPosts).where((0, drizzle_orm_1.eq)(schema_1.blogPosts.id, postId)).limit(1)];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows[0]];
            }
        });
    });
}
function generateBlogPostFromTopic(topicId, options) {
    return __awaiter(this, void 0, void 0, function () {
        var config, topic, job, brief, existingPosts, draft, error_4, internalLinks, bodyHtml, gate, slug, _a, canonicalUrl, readingTimeMinutes, basePayload, post, updated, created, jsonLd, finalPost, error_5, message;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureBlogInfrastructure()];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, resolveBlogConfig()];
                case 2:
                    config = _c.sent();
                    if (!topicId) return [3 /*break*/, 4];
                    return [4 /*yield*/, getTopicById(topicId)];
                case 3:
                    topic = _c.sent();
                    return [3 /*break*/, 6];
                case 4: return [4 /*yield*/, db_1.db.select().from(schema_1.blogTopics).where((0, drizzle_orm_1.eq)(schema_1.blogTopics.status, "pending")).orderBy((0, drizzle_orm_1.desc)(schema_1.blogTopics.score), (0, drizzle_orm_1.desc)(schema_1.blogTopics.createdAt)).limit(1).then(function (rows) { return rows[0]; })];
                case 5:
                    topic = _c.sent();
                    _c.label = 6;
                case 6:
                    if (!topic)
                        throw new Error("Nenhum topic pendente encontrado");
                    return [4 /*yield*/, createGenerationJob((options === null || options === void 0 ? void 0 : options.refreshPostId) ? "refresh" : "generate", topic.id, (options === null || options === void 0 ? void 0 : options.refreshPostId) || null)];
                case 7:
                    job = _c.sent();
                    _c.label = 8;
                case 8:
                    _c.trys.push([8, 26, , 28]);
                    brief = (topic.briefJson || {});
                    return [4 /*yield*/, db_1.db.select({
                            id: schema_1.blogPosts.id,
                            slug: schema_1.blogPosts.slug,
                            title: schema_1.blogPosts.title,
                            excerpt: schema_1.blogPosts.excerpt,
                            bodyHtml: schema_1.blogPosts.bodyHtml,
                            cluster: schema_1.blogPosts.cluster,
                            categorySlug: schema_1.blogPosts.categorySlug,
                        }).from(schema_1.blogPosts).where((0, drizzle_orm_1.inArray)(schema_1.blogPosts.status, ["published", "ready"]))];
                case 9:
                    existingPosts = _c.sent();
                    draft = void 0;
                    _c.label = 10;
                case 10:
                    _c.trys.push([10, 12, , 13]);
                    return [4 /*yield*/, generateDraftWithMistral(brief, config)];
                case 11:
                    draft = _c.sent();
                    return [3 /*break*/, 13];
                case 12:
                    error_4 = _c.sent();
                    console.error("[BLOG] Falha no draft Mistral, usando fallback:", error_4);
                    draft = fallbackDraftFromBrief(brief);
                    return [3 /*break*/, 13];
                case 13:
                    if (!draft.sections || draft.sections.length === 0) {
                        draft = fallbackDraftFromBrief(brief);
                    }
                    internalLinks = buildInternalLinks(config.baseUrl, draft, existingPosts);
                    bodyHtml = renderBodyHtml(draft, internalLinks);
                    gate = evaluateQualityGate(draft, bodyHtml, internalLinks, existingPosts);
                    if (!(options === null || options === void 0 ? void 0 : options.refreshPostId)) return [3 /*break*/, 15];
                    return [4 /*yield*/, getPostById(options.refreshPostId)];
                case 14:
                    _a = ((_b = (_c.sent())) === null || _b === void 0 ? void 0 : _b.slug) || slugify(draft.title);
                    return [3 /*break*/, 16];
                case 15:
                    _a = slugify(draft.title);
                    _c.label = 16;
                case 16:
                    slug = _a;
                    canonicalUrl = "".concat(config.baseUrl, "/blog/").concat(slug);
                    readingTimeMinutes = readingTimeFromText(bodyHtml);
                    basePayload = {
                        topicId: topic.id,
                        slug: slug,
                        status: (gate.passed ? "ready" : "rejected"),
                        title: draft.title,
                        excerpt: draft.excerpt,
                        bodyHtml: bodyHtml,
                        bodyJson: draft,
                        faqJson: draft.faq,
                        keywordPrimary: draft.keywordPrimary,
                        keywordsSecondary: draft.keywordsSecondary,
                        cluster: draft.cluster,
                        categorySlug: draft.categorySlug,
                        tags: draft.tags,
                        intent: draft.intent,
                        funnelStage: draft.funnelStage,
                        metaTitle: draft.metaTitle || "".concat(draft.title, " | ").concat(config.brandName),
                        metaDescription: draft.metaDescription || draft.excerpt,
                        canonicalUrl: canonicalUrl,
                        heroImageAlt: "Imagem editorial sobre ".concat(draft.title),
                        imagePrompt: draft.imagePrompt,
                        qualityScore: gate.qualityScore,
                        duplicateSimilarity: String(gate.duplicateSimilarity),
                        internalProofCount: gate.internalProofCount,
                        requiredInternalLinks: gate.requiredInternalLinks,
                        unsupportedClaims: gate.unsupportedClaims,
                        sourceProvenance: { sourceSummary: brief.sourceSummary, internalProofs: draft.internalProofs, internalLinks: internalLinks.map(function (link) { return link.href; }) },
                        reviewNotes: gate.notes.join(" | "),
                        distributionPayload: { linkedin: "".concat(draft.title, "\n\n").concat(draft.excerpt, "\n\nLeia no blog: ").concat(canonicalUrl), whatsapp: "".concat(draft.title, " - ").concat(canonicalUrl) },
                        readingTimeMinutes: readingTimeMinutes,
                        modelProvider: "mistral",
                        modelName: config.textModel,
                        lastRefreshAt: (options === null || options === void 0 ? void 0 : options.refreshPostId) ? new Date() : null,
                        updatedAt: new Date(),
                    };
                    post = void 0;
                    if (!(options === null || options === void 0 ? void 0 : options.refreshPostId)) return [3 /*break*/, 18];
                    return [4 /*yield*/, db_1.db.update(schema_1.blogPosts).set(basePayload).where((0, drizzle_orm_1.eq)(schema_1.blogPosts.id, options.refreshPostId)).returning()];
                case 17:
                    updated = (_c.sent())[0];
                    post = updated;
                    return [3 /*break*/, 20];
                case 18: return [4 /*yield*/, db_1.db.insert(schema_1.blogPosts).values(basePayload).returning()];
                case 19:
                    created = (_c.sent())[0];
                    post = created;
                    _c.label = 20;
                case 20:
                    jsonLd = buildArticleJsonLd(post, config, draft.faq);
                    return [4 /*yield*/, db_1.db.update(schema_1.blogPosts).set({ jsonLd: jsonLd, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.blogPosts.id, post.id)).returning()];
                case 21:
                    finalPost = (_c.sent())[0];
                    post = finalPost;
                    return [4 /*yield*/, db_1.db.insert(schema_1.blogPostRevisions).values({
                            postId: post.id,
                            revisionType: (options === null || options === void 0 ? void 0 : options.refreshPostId) ? "refresh" : "draft",
                            bodyHtml: post.bodyHtml,
                            bodyJson: draft,
                            qualityScore: gate.qualityScore,
                            notes: gate.notes.join(" | "),
                        })];
                case 22:
                    _c.sent();
                    return [4 /*yield*/, db_1.db.insert(schema_1.blogPostSources).values({
                            postId: post.id,
                            topicId: topic.id,
                            sourceType: topic.sourceType,
                            sourceKey: topic.keywordPrimary,
                            payload: topic.sourceData,
                        })];
                case 23:
                    _c.sent();
                    return [4 /*yield*/, db_1.db.update(schema_1.blogTopics).set({
                            status: (gate.passed ? "generated" : "blocked"),
                            publishedPostId: post.id,
                            lastAttemptAt: new Date(),
                            updatedAt: new Date(),
                        }).where((0, drizzle_orm_1.eq)(schema_1.blogTopics.id, topic.id))];
                case 24:
                    _c.sent();
                    return [4 /*yield*/, finishGenerationJob(job.id, "completed", { postId: post.id, quality: gate }, undefined)];
                case 25:
                    _c.sent();
                    if ((options === null || options === void 0 ? void 0 : options.autoPublish) && gate.passed && config.publishEnabled) {
                        return [2 /*return*/, publishBlogPost(post.id)];
                    }
                    return [2 /*return*/, post];
                case 26:
                    error_5 = _c.sent();
                    message = error_5 instanceof Error ? error_5.message : "Falha desconhecida";
                    return [4 /*yield*/, finishGenerationJob(job.id, "failed", {}, message)];
                case 27:
                    _c.sent();
                    throw error_5;
                case 28: return [2 /*return*/];
            }
        });
    });
}
function publishBlogPost(postId) {
    return __awaiter(this, void 0, void 0, function () {
        var config, post, publishJob, asset, updatedPost, sitemapResult, inspection, error_6, message;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureBlogInfrastructure()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, resolveBlogConfig()];
                case 2:
                    config = _a.sent();
                    return [4 /*yield*/, getPostById(postId)];
                case 3:
                    post = _a.sent();
                    if (!post)
                        throw new Error("Post nao encontrado");
                    return [4 /*yield*/, createPublishJob(post.id, { action: "publish" })];
                case 4:
                    publishJob = _a.sent();
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 13, , 15]);
                    if (post.status === "rejected") {
                        throw new Error("Post rejeitado pelo quality gate");
                    }
                    return [4 /*yield*/, ensureHeroImage(post, config)];
                case 6:
                    asset = _a.sent();
                    return [4 /*yield*/, db_1.db.update(schema_1.blogPosts).set({
                            status: "published",
                            heroImageId: asset.id,
                            heroImageUrl: asset.publicUrl,
                            heroImageAlt: asset.altText,
                            publishedAt: post.publishedAt || new Date(),
                            lastRefreshAt: post.publishedAt ? new Date() : post.lastRefreshAt,
                            updatedAt: new Date(),
                        }).where((0, drizzle_orm_1.eq)(schema_1.blogPosts.id, post.id)).returning()];
                case 7:
                    updatedPost = (_a.sent())[0];
                    if (!updatedPost.topicId) return [3 /*break*/, 9];
                    return [4 /*yield*/, db_1.db.update(schema_1.blogTopics).set({
                            status: "published",
                            publishedPostId: updatedPost.id,
                            updatedAt: new Date(),
                        }).where((0, drizzle_orm_1.eq)(schema_1.blogTopics.id, updatedPost.topicId))];
                case 8:
                    _a.sent();
                    _a.label = 9;
                case 9: return [4 /*yield*/, submitBlogSitemap()];
                case 10:
                    sitemapResult = _a.sent();
                    return [4 /*yield*/, inspectBlogPostUrl(updatedPost.id).catch(function (error) { return ({ success: false, error: error instanceof Error ? error.message : "erro" }); })];
                case 11:
                    inspection = _a.sent();
                    return [4 /*yield*/, finishPublishJob(publishJob.id, "completed", { sitemapResult: sitemapResult, inspection: inspection })];
                case 12:
                    _a.sent();
                    return [2 /*return*/, updatedPost];
                case 13:
                    error_6 = _a.sent();
                    message = error_6 instanceof Error ? error_6.message : "Falha desconhecida";
                    return [4 /*yield*/, finishPublishJob(publishJob.id, "failed", {}, message)];
                case 14:
                    _a.sent();
                    throw error_6;
                case 15: return [2 /*return*/];
            }
        });
    });
}
function refreshBlogPost(postId) {
    return __awaiter(this, void 0, void 0, function () {
        var config, targetPost, latestMetrics, lowPerformingPostId, topicId, brief, topic;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureBlogInfrastructure()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, resolveBlogConfig()];
                case 2:
                    config = _a.sent();
                    if (!config.refreshEnabled)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, syncSearchConsoleMetrics(config).catch(function (error) {
                            console.error("[BLOG] Falha ao sincronizar metricas antes do refresh:", error);
                        })];
                case 3:
                    _a.sent();
                    if (!postId) return [3 /*break*/, 5];
                    return [4 /*yield*/, getPostById(postId)];
                case 4:
                    targetPost = _a.sent();
                    return [3 /*break*/, 10];
                case 5: return [4 /*yield*/, db_1.db.select().from(schema_1.blogPostMetrics).orderBy((0, drizzle_orm_1.desc)(schema_1.blogPostMetrics.metricDate)).limit(100)];
                case 6:
                    latestMetrics = _a.sent();
                    lowPerformingPostId = latestMetrics
                        .filter(function (metric) { return Number(metric.impressions || 0) >= 20 && Number(metric.ctr || 0) < 0.02; })
                        .map(function (metric) { return metric.postId; })
                        .find(Boolean);
                    if (!lowPerformingPostId) return [3 /*break*/, 8];
                    return [4 /*yield*/, getPostById(lowPerformingPostId)];
                case 7:
                    targetPost = _a.sent();
                    _a.label = 8;
                case 8:
                    if (!!targetPost) return [3 /*break*/, 10];
                    return [4 /*yield*/, db_1.db.select().from(schema_1.blogPosts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.blogPosts.status, "published"), (0, drizzle_orm_1.isNotNull)(schema_1.blogPosts.publishedAt)))
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " asc nulls first"], ["", " asc nulls first"])), schema_1.blogPosts.lastRefreshAt), (0, drizzle_orm_1.desc)(schema_1.blogPosts.publishedAt))
                            .limit(1)
                            .then(function (rows) { return rows[0]; })];
                case 9:
                    targetPost = _a.sent();
                    _a.label = 10;
                case 10:
                    if (!targetPost)
                        return [2 /*return*/, null];
                    topicId = targetPost.topicId;
                    if (!!topicId) return [3 /*break*/, 12];
                    brief = buildBriefFromCandidate({
                        keyword: targetPost.keywordPrimary,
                        title: targetPost.title,
                        cluster: targetPost.cluster,
                        category: targetPost.categorySlug,
                        intent: targetPost.intent,
                        funnel: targetPost.funnelStage,
                        sourceSummary: "Topic sintetizado a partir de post ja publicado",
                    });
                    return [4 /*yield*/, db_1.db.insert(schema_1.blogTopics).values({
                            status: "pending",
                            titleHint: brief.titleHint,
                            keywordPrimary: brief.keywordPrimary,
                            keywordsSecondary: brief.keywordsSecondary,
                            cluster: brief.cluster,
                            categorySlug: brief.categorySlug,
                            intent: brief.intent,
                            funnelStage: brief.funnelStage,
                            sourceType: "refresh",
                            sourceData: { synthesizedFromPostId: targetPost.id },
                            briefJson: brief,
                            score: 50,
                            publishedPostId: targetPost.id,
                        }).returning()];
                case 11:
                    topic = (_a.sent())[0];
                    topicId = topic.id;
                    _a.label = 12;
                case 12: return [2 /*return*/, generateBlogPostFromTopic(topicId, { autoPublish: true, refreshPostId: targetPost.id })];
            }
        });
    });
}
function runDiscoveryGenerationPublishCycle() {
    return __awaiter(this, void 0, void 0, function () {
        var discovery, generated, error_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, discoverBlogTopics(5)];
                case 1:
                    discovery = _a.sent();
                    generated = null;
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, generateBlogPostFromTopic(undefined, { autoPublish: true })];
                case 3:
                    generated = _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_7 = _a.sent();
                    console.error("[BLOG] Nenhum post gerado no ciclo automatico:", error_7);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/, {
                        discovered: discovery.created,
                        generated: generated === null || generated === void 0 ? void 0 : generated.id,
                        published: (generated === null || generated === void 0 ? void 0 : generated.status) === "published" ? generated.id : undefined,
                    }];
            }
        });
    });
}
function submitBlogSitemap() {
    return __awaiter(this, void 0, void 0, function () {
        var config, sc, sitemapUrl;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureBlogInfrastructure()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, resolveBlogConfig()];
                case 2:
                    config = _a.sent();
                    return [4 /*yield*/, resolveSearchConsoleClient(config)];
                case 3:
                    sc = _a.sent();
                    sitemapUrl = "".concat(config.baseUrl, "/sitemap-blog.xml");
                    if (!sc)
                        return [2 /*return*/, { success: false, detail: "Search Console nao configurado" }];
                    return [4 /*yield*/, sc.client.sitemaps.submit({
                            siteUrl: sc.siteUrl,
                            feedpath: sitemapUrl,
                        })];
                case 4:
                    _a.sent();
                    return [2 /*return*/, { success: true, detail: sitemapUrl }];
            }
        });
    });
}
function inspectBlogPostUrl(postId) {
    return __awaiter(this, void 0, void 0, function () {
        var config, sc, post, response, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, ensureBlogInfrastructure()];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, resolveBlogConfig()];
                case 2:
                    config = _b.sent();
                    return [4 /*yield*/, resolveSearchConsoleClient(config)];
                case 3:
                    sc = _b.sent();
                    return [4 /*yield*/, getPostById(postId)];
                case 4:
                    post = _b.sent();
                    if (!post)
                        throw new Error("Post nao encontrado para inspecao");
                    if (!sc)
                        return [2 /*return*/, { success: false, error: "Search Console nao configurado" }];
                    return [4 /*yield*/, sc.client.urlInspection.index.inspect({
                            requestBody: {
                                inspectionUrl: post.canonicalUrl,
                                siteUrl: sc.siteUrl,
                                languageCode: "pt-BR",
                            },
                        })];
                case 5:
                    response = _b.sent();
                    result = (_a = response.data.inspectionResult) === null || _a === void 0 ? void 0 : _a.indexStatusResult;
                    return [4 /*yield*/, db_1.db.insert(schema_1.blogIndexingChecks).values({
                            postId: post.id,
                            inspectedUrl: post.canonicalUrl,
                            inspectionType: "url_inspection",
                            indexingState: (result === null || result === void 0 ? void 0 : result.indexingState) || null,
                            coverageState: (result === null || result === void 0 ? void 0 : result.coverageState) || null,
                            googleCanonical: (result === null || result === void 0 ? void 0 : result.googleCanonical) || null,
                            userCanonical: (result === null || result === void 0 ? void 0 : result.userCanonical) || null,
                            sitemaps: (result === null || result === void 0 ? void 0 : result.sitemap) || [],
                            verdict: (result === null || result === void 0 ? void 0 : result.verdict) || null,
                            rawResponse: response.data,
                        })];
                case 6:
                    _b.sent();
                    return [2 /*return*/, { success: true, data: response.data }];
            }
        });
    });
}
function listPublicBlogPosts(params) {
    return __awaiter(this, void 0, void 0, function () {
        var posts;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureBlogInfrastructure()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, getPublishedPostsFromDb((params === null || params === void 0 ? void 0 : params.limit) || 24)];
                case 2:
                    posts = _a.sent();
                    return [2 /*return*/, posts
                            .filter(function (post) { return !(params === null || params === void 0 ? void 0 : params.category) || post.categorySlug === params.category; })
                            .filter(function (post) { return !(params === null || params === void 0 ? void 0 : params.tag) || (Array.isArray(post.tags) && post.tags.includes(params.tag)); })
                            .map(mapPostSummary)];
            }
        });
    });
}
function getPublicBlogPostBySlug(slug) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureBlogInfrastructure()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, db_1.db.select().from(schema_1.blogPosts).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.blogPosts.slug, slug), (0, drizzle_orm_1.eq)(schema_1.blogPosts.status, "published"))).limit(1)];
                case 2:
                    rows = _a.sent();
                    return [2 /*return*/, rows[0]];
            }
        });
    });
}
function listPublicBlogCategories() {
    return __awaiter(this, void 0, void 0, function () {
        var posts, counts, _i, posts_2, post;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, listPublicBlogPosts({ limit: 200 })];
                case 1:
                    posts = _a.sent();
                    counts = new Map();
                    for (_i = 0, posts_2 = posts; _i < posts_2.length; _i++) {
                        post = posts_2[_i];
                        counts.set(post.categorySlug, (counts.get(post.categorySlug) || 0) + 1);
                    }
                    return [2 /*return*/, Array.from(counts.entries()).map(function (_a) {
                            var slug = _a[0], count = _a[1];
                            return ({ slug: slug, count: count, href: "/blog/categoria/".concat(slug) });
                        }).sort(function (a, b) { return b.count - a.count; })];
            }
        });
    });
}
function listPublicBlogTags() {
    return __awaiter(this, void 0, void 0, function () {
        var posts, counts, _i, posts_3, post, _a, _b, tag;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, listPublicBlogPosts({ limit: 200 })];
                case 1:
                    posts = _c.sent();
                    counts = new Map();
                    for (_i = 0, posts_3 = posts; _i < posts_3.length; _i++) {
                        post = posts_3[_i];
                        for (_a = 0, _b = post.tags; _a < _b.length; _a++) {
                            tag = _b[_a];
                            counts.set(tag, (counts.get(tag) || 0) + 1);
                        }
                    }
                    return [2 /*return*/, Array.from(counts.entries()).map(function (_a) {
                            var slug = _a[0], count = _a[1];
                            return ({ slug: slug, count: count, href: "/blog/tag/".concat(slug) });
                        }).sort(function (a, b) { return b.count - a.count; })];
            }
        });
    });
}
function buildBlogHomepageHtml() {
    return __awaiter(this, void 0, void 0, function () {
        var config, posts, categories, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveBlogConfig()];
                case 1:
                    config = _a.sent();
                    return [4 /*yield*/, listPublicBlogPosts({ limit: 12 })];
                case 2:
                    posts = _a.sent();
                    return [4 /*yield*/, listPublicBlogCategories()];
                case 3:
                    categories = _a.sent();
                    body = "<div class=\"shell\"><header class=\"topbar\"><a class=\"brand\" href=\"/\">".concat(escapeHtml(config.brandName), "</a><nav class=\"nav\"><a href=\"/blog\">Blog</a><a href=\"/ajuda\">Ajuda</a><a href=\"/cadastro\">Criar conta</a></nav></header><section class=\"hero\"><span class=\"eyebrow\">Blog SEO</span><h1>Conteudo tecnico sobre IA, WhatsApp, CRM e automacao comercial</h1><p>Guias, comparativos e playbooks publicados no mesmo dominio do produto para responder buscas comerciais sem cair em conteudo raso.</p></section><section class=\"grid posts\">").concat(posts.map(function (post) { return "<article class=\"card\"><span class=\"eyebrow\">".concat(escapeHtml(post.categorySlug.replace(/-/g, " ")), "</span><h2><a href=\"/blog/").concat(escapeHtml(post.slug), "\">").concat(escapeHtml(post.title), "</a></h2><p>").concat(escapeHtml(post.excerpt), "</p><p class=\"meta\">").concat(post.publishedAt ? toIsoDate(post.publishedAt) : "", " \u2022 ").concat(post.readingTimeMinutes, " min</p></article>"); }).join(""), "</section><section class=\"card\" style=\"margin-top:24px;\"><h2>Categorias</h2><ul class=\"pill-list\">").concat(categories.map(function (category) { return "<li><a href=\"".concat(escapeHtml(category.href), "\">").concat(escapeHtml(category.slug), " (").concat(category.count, ")</a></li>"); }).join(""), "</ul></section><footer>Metodologia editorial: automacao com Mistral, quality gate, sitemap, Search Console e refresh guiado por desempenho.</footer></div>");
                    return [2 /*return*/, buildLayoutHtml({
                            title: "Blog | ".concat(config.brandName),
                            description: "Blog do ".concat(config.brandName, " com artigos sobre IA no WhatsApp, CRM, atendimento e automacao comercial."),
                            canonicalUrl: "".concat(config.baseUrl, "/blog"),
                            body: body,
                            structuredData: {
                                "@context": "https://schema.org",
                                "@type": "Blog",
                                name: "".concat(config.brandName, " Blog"),
                                url: "".concat(config.baseUrl, "/blog"),
                                publisher: { "@type": "Organization", name: config.brandName },
                            },
                        })];
            }
        });
    });
}
function buildBlogListingHtml(kind, slug) {
    return __awaiter(this, void 0, void 0, function () {
        var config, posts, heading, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveBlogConfig()];
                case 1:
                    config = _a.sent();
                    return [4 /*yield*/, listPublicBlogPosts(__assign({ limit: 50 }, (kind === "category" ? { category: slug } : { tag: slug })))];
                case 2:
                    posts = _a.sent();
                    heading = kind === "category" ? "Categoria: ".concat(slug) : "Tag: ".concat(slug);
                    body = "<div class=\"shell\"><header class=\"topbar\"><a class=\"brand\" href=\"/\">".concat(escapeHtml(config.brandName), "</a><nav class=\"nav\"><a href=\"/blog\">Blog</a><a href=\"/ajuda\">Ajuda</a><a href=\"/cadastro\">Criar conta</a></nav></header><section class=\"hero\"><span class=\"eyebrow\">").concat(kind === "category" ? "Categoria" : "Tag", "</span><h1>").concat(escapeHtml(heading), "</h1><p>").concat(posts.length, " artigo(s) publicados nesse agrupamento.</p></section><section class=\"grid posts\">").concat(posts.map(function (post) { return "<article class=\"card\"><h2><a href=\"/blog/".concat(escapeHtml(post.slug), "\">").concat(escapeHtml(post.title), "</a></h2><p>").concat(escapeHtml(post.excerpt), "</p><p class=\"meta\">").concat(post.publishedAt ? toIsoDate(post.publishedAt) : "", " \u2022 ").concat(post.readingTimeMinutes, " min</p></article>"); }).join(""), "</section></div>");
                    return [2 /*return*/, buildLayoutHtml({
                            title: "".concat(heading, " | Blog ").concat(config.brandName),
                            description: "Artigos da ".concat(kind === "category" ? "categoria" : "tag", " ").concat(slug, " no blog do ").concat(config.brandName, "."),
                            canonicalUrl: "".concat(config.baseUrl, "/blog/").concat(kind === "category" ? "categoria" : "tag", "/").concat(slug),
                            body: body,
                        })];
            }
        });
    });
}
function buildBlogPostHtml(slug) {
    return __awaiter(this, void 0, void 0, function () {
        var config, post, faq, relatedPosts, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveBlogConfig()];
                case 1:
                    config = _a.sent();
                    return [4 /*yield*/, getPublicBlogPostBySlug(slug)];
                case 2:
                    post = _a.sent();
                    if (!post)
                        return [2 /*return*/, null];
                    faq = normalizeFaq(post.faqJson);
                    return [4 /*yield*/, listPublicBlogPosts({ limit: 6 })];
                case 3:
                    relatedPosts = (_a.sent()).filter(function (item) { return item.slug !== post.slug; }).filter(function (item) { return item.cluster === post.cluster || item.categorySlug === post.categorySlug; }).slice(0, 3);
                    body = "<div class=\"shell\"><header class=\"topbar\"><a class=\"brand\" href=\"/\">".concat(escapeHtml(config.brandName), "</a><nav class=\"nav\"><a href=\"/blog\">Blog</a><a href=\"/ajuda\">Ajuda</a><a href=\"/cadastro\">Criar conta</a></nav></header><article class=\"article-shell\"><span class=\"eyebrow\">").concat(escapeHtml(post.categorySlug.replace(/-/g, " ")), "</span><h1>").concat(escapeHtml(post.title), "</h1><p class=\"meta\">").concat(post.publishedAt ? toIsoDate(post.publishedAt) : toIsoDate(), " \u2022 ").concat(post.readingTimeMinutes, " min \u2022 ").concat(escapeHtml(config.authorName), "</p><p>").concat(escapeHtml(post.excerpt), "</p>").concat(post.heroImageUrl ? "<img src=\"".concat(escapeHtml(post.heroImageUrl), "\" alt=\"").concat(escapeHtml(post.heroImageAlt || post.title), "\" width=\"1200\" height=\"630\" loading=\"eager\" />") : "").concat(post.bodyHtml, "</article>").concat(faq.length > 0 ? "<section class=\"card\" style=\"margin-top:24px;\"><h2>Perguntas frequentes</h2>".concat(faq.map(function (item) { return "<div class=\"faq-card\" style=\"padding:18px 20px; margin-top:12px;\"><h3>".concat(escapeHtml(item.question), "</h3><p>").concat(escapeHtml(item.answer), "</p></div>"); }).join(""), "</section>") : "").concat(relatedPosts.length > 0 ? "<section class=\"card\" style=\"margin-top:24px;\"><h2>Artigos relacionados</h2><div class=\"grid posts\">".concat(relatedPosts.map(function (item) { return "<article class=\"card\"><h3><a href=\"/blog/".concat(escapeHtml(item.slug), "\">").concat(escapeHtml(item.title), "</a></h3><p>").concat(escapeHtml(item.excerpt), "</p></article>"); }).join(""), "</div></section>") : "", "<footer>Metodologia editorial: automacao com Mistral, quality gate, prova interna e refresh por Search Console.</footer></div>");
                    return [2 /*return*/, buildLayoutHtml({
                            title: post.metaTitle,
                            description: post.metaDescription,
                            canonicalUrl: post.canonicalUrl,
                            ogImage: post.heroImageUrl,
                            structuredData: post.jsonLd,
                            body: body,
                        })];
            }
        });
    });
}
function generateBlogSitemapXml() {
    return __awaiter(this, void 0, void 0, function () {
        var config, posts, categories, tags, entries;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveBlogConfig()];
                case 1:
                    config = _a.sent();
                    return [4 /*yield*/, listPublicBlogPosts({ limit: 500 })];
                case 2:
                    posts = _a.sent();
                    return [4 /*yield*/, listPublicBlogCategories()];
                case 3:
                    categories = _a.sent();
                    return [4 /*yield*/, listPublicBlogTags()];
                case 4:
                    tags = _a.sent();
                    entries = __spreadArray(__spreadArray(__spreadArray([
                        { loc: "".concat(config.baseUrl, "/blog"), lastmod: toIsoDate(), changefreq: "daily", priority: "0.9" }
                    ], categories.map(function (category) { return ({ loc: "".concat(config.baseUrl).concat(category.href), lastmod: toIsoDate(), changefreq: "daily", priority: "0.7" }); }), true), tags.map(function (tag) { return ({ loc: "".concat(config.baseUrl).concat(tag.href), lastmod: toIsoDate(), changefreq: "daily", priority: "0.6" }); }), true), posts.map(function (post) { return ({ loc: "".concat(config.baseUrl, "/blog/").concat(post.slug), lastmod: toIsoDate(post.publishedAt || new Date()), changefreq: "weekly", priority: "0.8" }); }), true);
                    return [2 /*return*/, "<?xml version=\"1.0\" encoding=\"UTF-8\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">".concat(entries.map(function (entry) { return "<url><loc>".concat(xmlEscape(entry.loc), "</loc><lastmod>").concat(entry.lastmod, "</lastmod><changefreq>").concat(entry.changefreq, "</changefreq><priority>").concat(entry.priority, "</priority></url>"); }).join(""), "</urlset>")];
            }
        });
    });
}
function generateBlogRssXml() {
    return __awaiter(this, void 0, void 0, function () {
        var config, posts;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveBlogConfig()];
                case 1:
                    config = _a.sent();
                    return [4 /*yield*/, listPublicBlogPosts({ limit: 30 })];
                case 2:
                    posts = _a.sent();
                    return [2 /*return*/, "<?xml version=\"1.0\" encoding=\"UTF-8\"?><rss version=\"2.0\"><channel><title>".concat(xmlEscape("".concat(config.brandName, " Blog")), "</title><link>").concat(xmlEscape("".concat(config.baseUrl, "/blog")), "</link><description>").concat(xmlEscape("Artigos sobre IA no WhatsApp, CRM e automacao comercial publicados pelo ".concat(config.brandName, ".")), "</description><language>pt-BR</language>").concat(posts.map(function (post) { return "<item><title>".concat(xmlEscape(post.title), "</title><link>").concat(xmlEscape("".concat(config.baseUrl, "/blog/").concat(post.slug)), "</link><guid>").concat(xmlEscape("".concat(config.baseUrl, "/blog/").concat(post.slug)), "</guid><pubDate>").concat((post.publishedAt || new Date()).toUTCString(), "</pubDate><description>").concat(xmlEscape(post.excerpt), "</description></item>"); }).join(""), "</channel></rss>")];
            }
        });
    });
}
function getBlogAdminMetrics() {
    return __awaiter(this, void 0, void 0, function () {
        var topicStats, postStats, latestPosts, latestChecks;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureBlogInfrastructure()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, db_1.db.select({ totalTopics: (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["count(*)"], ["count(*)"]))) }).from(schema_1.blogTopics)];
                case 2:
                    topicStats = (_a.sent())[0];
                    return [4 /*yield*/, db_1.db.select({
                            totalPosts: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["count(*)"], ["count(*)"]))),
                            publishedPosts: (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["count(*) filter (where ", " = 'published')"], ["count(*) filter (where ", " = 'published')"])), schema_1.blogPosts.status),
                            readyPosts: (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["count(*) filter (where ", " = 'ready')"], ["count(*) filter (where ", " = 'ready')"])), schema_1.blogPosts.status),
                        }).from(schema_1.blogPosts)];
                case 3:
                    postStats = (_a.sent())[0];
                    return [4 /*yield*/, db_1.db.select().from(schema_1.blogPosts).orderBy((0, drizzle_orm_1.desc)(schema_1.blogPosts.updatedAt)).limit(12)];
                case 4:
                    latestPosts = _a.sent();
                    return [4 /*yield*/, db_1.db.select().from(schema_1.blogIndexingChecks).orderBy((0, drizzle_orm_1.desc)(schema_1.blogIndexingChecks.checkedAt)).limit(20)];
                case 5:
                    latestChecks = _a.sent();
                    return [2 /*return*/, {
                            topics: Number((topicStats === null || topicStats === void 0 ? void 0 : topicStats.totalTopics) || 0),
                            posts: {
                                total: Number((postStats === null || postStats === void 0 ? void 0 : postStats.totalPosts) || 0),
                                published: Number((postStats === null || postStats === void 0 ? void 0 : postStats.publishedPosts) || 0),
                                ready: Number((postStats === null || postStats === void 0 ? void 0 : postStats.readyPosts) || 0),
                            },
                            latestPosts: latestPosts.map(mapPostSummary),
                            latestChecks: latestChecks,
                        }];
            }
        });
    });
}
function getBlogIndexingStatus() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureBlogInfrastructure()];
                case 1:
                    _a.sent();
                    return [2 /*return*/, db_1.db.select({
                            id: schema_1.blogIndexingChecks.id,
                            postId: schema_1.blogIndexingChecks.postId,
                            inspectedUrl: schema_1.blogIndexingChecks.inspectedUrl,
                            indexingState: schema_1.blogIndexingChecks.indexingState,
                            coverageState: schema_1.blogIndexingChecks.coverageState,
                            googleCanonical: schema_1.blogIndexingChecks.googleCanonical,
                            userCanonical: schema_1.blogIndexingChecks.userCanonical,
                            sitemaps: schema_1.blogIndexingChecks.sitemaps,
                            verdict: schema_1.blogIndexingChecks.verdict,
                            checkedAt: schema_1.blogIndexingChecks.checkedAt,
                        }).from(schema_1.blogIndexingChecks).orderBy((0, drizzle_orm_1.desc)(schema_1.blogIndexingChecks.checkedAt)).limit(50)];
            }
        });
    });
}
exports.__blogTestUtils = {
    slugify: slugify,
    readingTimeFromText: readingTimeFromText,
    similarityScore: similarityScore,
    countUnsupportedClaims: countUnsupportedClaims,
};
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5;
